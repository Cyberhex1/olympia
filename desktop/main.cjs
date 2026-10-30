// Olympia as a desktop widget: runs the island server in the background and floats the island on the desktop
// (a transparent window with no frame, clicks on empty pixels fall through), or shows it in a small frameless
// window if the owner turns floating off. A tray icon holds the menu. Phones on the same Wi-Fi pair by typing a 6-digit code (or, if the
// owner turns the code off, just open the address).
const { app, BrowserWindow, Tray, Menu, nativeImage, utilityProcess, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_DIR = path.join(__dirname, '..');
const ICON = path.join(__dirname, 'icon.png');

// Where settings live. From source: the repo itself. Installed: %APPDATA%\Olympia.
// Portable zip: a "data" folder next to Olympia.exe, so the whole thing moves with the folder.
function pickDataDir() {
  if (!app.isPackaged) return APP_DIR;
  const exeDir = path.dirname(process.execPath);
  if (fs.existsSync(path.join(exeDir, 'Uninstall Olympia.exe'))) return app.getPath('userData');
  const dir = path.join(exeDir, 'data');
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return dir; } catch { return app.getPath('userData'); }
}
const DATA = pickDataDir();
if (app.isPackaged && DATA !== app.getPath('userData')) app.setPath('userData', path.join(DATA, 'electron'));

// First run: start from the example settings, pointed at a likely projects folder.
function ensureConfig() {
  const file = path.join(DATA, 'olympia.config.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'olympia.config.example.json'), 'utf8'));
  const home = os.homedir();
  const roots = ['C:\\code', path.join(home, 'code'), path.join(home, 'projects'), path.join(home, 'source', 'repos'), path.join(home, 'Documents', 'GitHub')];
  cfg.owner = os.userInfo().username;
  cfg.tagline = `${cfg.owner}'s realm, alive`;
  cfg.projectsRoot = roots.find((r) => fs.existsSync(r)) || home;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return cfg;
}

const WIDGET_FILE = path.join(DATA, 'olympia.widget.json');
const readWidget = () => { try { return JSON.parse(fs.readFileSync(WIDGET_FILE, 'utf8')); } catch { return {}; } };
let widget = {};
const saveWidget = () => { try { fs.writeFileSync(WIDGET_FILE, JSON.stringify(widget, null, 2)); } catch {} };

let cfg, PORT, BASE;
let server = null;        // our own server process, or null when attached to one that was already running
let attached = false;
let quitting = false;
let win = null, tray = null, pairWin = null;
const log = fs.createWriteStream(path.join(DATA, 'olympia.log'), { flags: 'a' });

async function alive() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/state`, { signal: AbortSignal.timeout(1500) });
    return r.ok && typeof (await r.json()).realm === 'string';
  } catch { return false; }
}

async function startServer() {
  if (await alive()) { attached = true; return true; } // `npm start` or another copy already serves the island
  attached = false;
  const child = utilityProcess.fork(path.join(APP_DIR, 'server.js'), [], {
    env: { ...process.env, OLYMPIA_DATA: DATA, OLYMPIA_LAN: widget.lan ? '1' : '0', OLYMPIA_LAN_CODE: widget.lanCode === false ? '0' : '1' },
    stdio: 'pipe', serviceName: 'Olympia server',
  });
  server = child;
  child.stdout.on('data', (d) => log.write(d));
  child.stderr.on('data', (d) => log.write(d));
  child.on('exit', (code) => {
    if (server === child) server = null;
    if (!quitting && child.olwExpected !== true) {
      log.write(`server exited (${code})\n`);
      showError(`The island server stopped (code ${code}). The log is at ${path.join(DATA, 'olympia.log')}.`);
    }
  });
  for (let i = 0; i < 60; i++) { if (await alive()) return true; if (!server) return false; await new Promise((r) => setTimeout(r, 250)); }
  return false;
}

function stopServer() {
  return new Promise((resolve) => {
    const child = server;
    if (!child) return resolve();
    child.olwExpected = true;
    child.once('exit', () => resolve());
    child.kill();
  });
}

async function restartServer() {
  await stopServer();
  const ok = await startServer();
  if (ok) win?.loadURL(pageURL()); else showError(`Olympia could not start on port ${PORT}. The log is at ${path.join(DATA, 'olympia.log')}.`);
  return ok;
}

const floating = () => widget.float !== false;
const pageURL = () => `${BASE}/${floating() ? '?desktop=1' : ''}`;
// floating sizes: the window is just a transparent box around the island
const SIZES = { small: [520, 400], medium: [760, 580], large: [1040, 800] };

function showError(msg) {
  win?.setIgnoreMouseEvents(false);
  const html = `<body style="margin:0;padding:28px;background:#10182e;color:#eef1f8;font:14px system-ui;-webkit-app-region:drag">
    <h3 style="color:#f0cf7e;margin-top:0">Olympia</h3><p>${msg.replace(/[<>&]/g, '')}</p><p style="color:#9aa4bd">Right-click the tray icon to try again or quit.</p></body>`;
  win?.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function sendState() { win?.webContents.send('olw-state', { onTop: Boolean(widget.onTop), lan: Boolean(widget.lan) }); }

function createWindow() {
  const float = floating();
  const b = (float ? widget.floatBounds : widget.bounds) || {};
  const [fw, fh] = SIZES[widget.size] || SIZES.medium;
  win = new BrowserWindow({
    ...(float
      ? { width: fw, height: fh, x: b.x, y: b.y, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, skipTaskbar: true }
      : { width: b.width || 820, height: b.height || 560, x: b.x, y: b.y, minWidth: 320, minHeight: 220, backgroundColor: '#10182e' }),
    frame: false, alwaysOnTop: Boolean(widget.onTop), title: 'Olympia', icon: ICON, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  // floating: click-through until the page says the pointer is over the island (olw-hit); moves still reach the page
  if (float) win.setIgnoreMouseEvents(true, { forward: true });
  // floating, it appears without taking focus, so it never grabs typing meant for another window
  win.once('ready-to-show', () => (float ? win.showInactive() : win.show()));
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  let t;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { widget[float ? 'floatBounds' : 'bounds'] = win.getBounds(); saveWidget(); }, 400); };
  win.on('move', remember); win.on('resize', remember);
  // the island stays the island: anything else opens in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(BASE)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

function toggleWindow() { if (win.isVisible() && win.isFocused()) win.hide(); else { win.show(); win.focus(); } }

function rebuildWindow() {
  const old = win;
  createWindow();
  win.loadURL(pageURL());
  if (old) { old.removeAllListeners('close'); old.destroy(); }
  buildMenu();
}
function setFloat(on) { widget.float = on; saveWidget(); rebuildWindow(); }
function setSize(size) { widget.size = size; saveWidget(); if (floating()) win.setSize(...SIZES[size]); buildMenu(); }

async function setOnTop(on) { widget.onTop = on; saveWidget(); win.setAlwaysOnTop(on); sendState(); buildMenu(); }

async function setLan(on) {
  if (attached) {
    dialog.showMessageBox(win, { type: 'info', message: 'Olympia is already running in another window or terminal.', detail: 'Close that copy and reopen the widget to change phone access from here.' });
    return false;
  }
  widget.lan = on; saveWidget();
  const ok = await restartServer();
  sendState(); buildMenu();
  return ok;
}

// Whether phones type a code first. Turning it off lets any device on the network in, so ask first.
async function setLanCode(on) {
  if (attached) {
    dialog.showMessageBox(win, { type: 'info', message: 'Olympia is already running in another window or terminal.', detail: 'Close that copy and reopen the widget to change phone access from here.' });
    buildMenu();
    return false;
  }
  if (!on) {
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Turn off the code', 'Keep the code'], defaultId: 1, cancelId: 1, message: 'Let any device on your Wi-Fi in without a code?', detail: 'Anyone on this network, guests included, could then open Olympia and see your sessions.' });
    if (r.response !== 0) { buildMenu(); return false; }
  }
  widget.lanCode = on; saveWidget();
  const ok = widget.lan ? await restartServer() : true;
  buildMenu();
  return ok;
}

async function pairPhone() {
  if (!widget.lan && !(await setLan(true))) return;
  const { lanAddresses, showCode } = await import('../lib/lan.js');
  const ip = lanAddresses()[0];
  const needCode = widget.lanCode !== false;
  let code = '';
  if (needCode) try { code = fs.readFileSync(path.join(DATA, 'olympia.code'), 'utf8').trim(); } catch {}
  if (!ip || (needCode && !code)) {
    dialog.showMessageBox(win, { type: 'warning', message: 'This PC does not seem to be on a home network.', detail: 'Connect to Wi-Fi or Ethernet, then try again.' });
    return;
  }
  const note = 'If Windows asks whether Olympia may use private networks, allow it, or the phone cannot connect.';
  if (pairWin && !pairWin.isDestroyed()) pairWin.close();
  pairWin = new BrowserWindow({ width: 380, height: 410, resizable: false, title: 'Pair a phone', icon: ICON, autoHideMenuBar: true, backgroundColor: '#10182e', webPreferences: { sandbox: true } });
  pairWin.loadFile(path.join(__dirname, 'pair.html'), { query: { address: `${ip}:${PORT}`, code: code ? showCode(code) : '', note } });
}

async function unpairPhones() {
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Unpair all', 'Cancel'], defaultId: 1, message: 'Unpair every phone?', detail: 'Phones that were paired will need the new code to get back in.' });
  if (r.response !== 0) return;
  for (const f of ['olympia.key', 'olympia.code']) { try { fs.unlinkSync(path.join(DATA, f)); } catch {} }
  if (widget.lan) await restartServer();
}

function buildMenu() {
  const canLogin = app.isPackaged;
  const menu = Menu.buildFromTemplate([
    { label: 'Show Olympia', click: () => { win.show(); win.focus(); } },
    { label: 'Keep on top', type: 'checkbox', checked: Boolean(widget.onTop), click: (i) => setOnTop(i.checked) },
    { label: 'Float on the desktop', type: 'checkbox', checked: floating(), click: (i) => setFloat(i.checked) },
    { label: 'Size', enabled: floating(), submenu: Object.keys(SIZES).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), type: 'radio', checked: (widget.size || 'medium') === k, click: () => setSize(k) })) },
    { type: 'separator' },
    { label: 'Pair a phone (show code)…', click: pairPhone },
    { label: 'Phone access on home Wi-Fi', type: 'checkbox', checked: Boolean(widget.lan), click: (i) => setLan(i.checked) },
    { label: 'Phones need a code', type: 'checkbox', checked: widget.lanCode !== false, click: (i) => setLanCode(i.checked) },
    { label: 'Unpair all phones…', enabled: widget.lanCode !== false, click: unpairPhones },
    { type: 'separator' },
    { label: 'Open in browser', click: () => shell.openExternal(`${BASE}/`) },
    { label: 'Open settings folder', click: () => shell.openPath(DATA) },
    { label: 'Start with Windows', type: 'checkbox', enabled: canLogin, checked: canLogin && app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Restart island', click: restartServer },
    { type: 'separator' },
    { label: 'Quit Olympia', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.on('olw-hit', (e, on) => {
  if (!win || e.sender !== win.webContents || !floating()) return;
  win.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on('olw', (e, a) => {
  if (!win || e.sender !== win.webContents) return;
  if (a === 'ready') sendState();
  else if (a === 'pin') setOnTop(!widget.onTop);
  else if (a === 'phone') pairPhone();
  else if (a === 'hide' || a === 'close') win.hide();
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    try { cfg = ensureConfig(); }
    catch (e) { dialog.showErrorBox('Olympia', `Could not read the settings in ${DATA}: ${e.message}`); app.exit(1); return; }
    PORT = Number(process.env.OLYMPIA_PORT || cfg.port || 3110); // OLYMPIA_PORT: try a source copy beside an installed one
    BASE = `http://localhost:${PORT}`;
    widget = readWidget();
    if (widget.lan === undefined) widget.lan = cfg.lan === true;
    if (widget.lanCode === undefined) widget.lanCode = cfg.lanCode !== false;
    Menu.setApplicationMenu(null);
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Olympia');
    tray.on('click', toggleWindow);
    buildMenu();
    createWindow();
    if (await startServer()) win.loadURL(pageURL());
    else showError(`Olympia could not start on port ${PORT}. Another program may be using it; change "port" in olympia.config.json (Open settings folder in the tray menu).`);
  });
  app.on('window-all-closed', () => {}); // closing the pairing window must not quit; Quit is in the tray menu
  app.on('before-quit', () => { quitting = true; if (server) { server.olwExpected = true; server.kill(); } });
}

// Sleep this PC from your phone, and what you need to wake it again (Wake-on-LAN).
// Off unless "allowSleep": true in olympia.config.json. Anything not from this PC must have paired with the
// phone code, even when "lanCode": false lets phones in without one. A sleep waits 10 seconds so it can be cancelled.
// Everything here only reads the network and power setup; nothing changes a Windows setting.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { isLoopback, lanAccess } from './lan.js';

export const COUNTDOWN_MS = 10_000;
export const RATE_MS = 30_000; // one sleep request per 30 seconds

// The command that puts the machine to sleep, per OS (null: not supported here).
// Windows: SetSuspendState('Suspend') really sleeps. rundll32 powrprof.dll,SetSuspendState is avoided on purpose:
// it hibernates whenever hibernation is enabled.
export function sleepCommand(platform = process.platform) {
  if (platform === 'win32') return { file: 'powershell.exe', args: ['-NoProfile', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"] };
  if (platform === 'darwin') return { file: 'pmset', args: ['sleepnow'] };
  if (platform === 'linux') return { file: 'systemctl', args: ['suspend'] };
  return null;
}

// who is asking: this PC, a phone that paired with the code, or anyone else on the network
export function callerOf(req, { key, trustLoopback = true }) {
  if (trustLoopback && isLoopback(req.socket?.remoteAddress)) return 'local';
  return lanAccess({ key, cookie: req.headers.cookie }) === 'ok' ? 'paired' : 'guest';
}

// Power posts must come from Olympia's own page: JSON (so a plain cross-site form can't send it) and, from a
// browser, the same origin. Scripts on this PC may leave Origin out; a phone's browser always sends it.
export function sameOrigin(req, who) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return false;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return who === 'local';
  return origin === `http://${req.headers.host}`;
}

// Set one true/false key in the config text, keeping the rest of the file as it was written.
export function setConfigFlag(text, key, value) {
  const re = new RegExp(`("${key}"\\s*:\\s*)(true|false)`);
  let out;
  if (re.test(text)) out = text.replace(re, `$1${value}`);
  else {
    const end = text.lastIndexOf('}');
    const before = text.slice(0, end).replace(/\s*$/, '');
    out = `${before}${before.endsWith('{') ? '' : ','}\n  "${key}": ${value}\n${text.slice(end)}`;
  }
  try { if (JSON.parse(out)[key] === value) return out; } catch {}
  return JSON.stringify({ ...JSON.parse(text), [key]: value }, null, 2) + '\n';
}

const runCommand = (file, args, done) => execFile(file, args, { windowsHide: true, timeout: 60_000 }, done);

export class PowerControl {
  constructor({ allowSleep = false, configFile = null, logFile = null, key = null, trustLoopback = true, dryRun = false,
    platform = process.platform, run = runCommand, probe = probeNetwork, interfaces = () => os.networkInterfaces(),
    now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, countdown = COUNTDOWN_MS, rate = RATE_MS, quiet = false } = {}) {
    Object.assign(this, { allowSleep: allowSleep === true, configFile, logFile, key, trustLoopback, dryRun, platform, run, probe, interfaces, now, setTimer, clearTimer, countdown, rate, quiet });
    this.pending = null; // { endsAt, timer, by }
    this.lastAt = -Infinity; this.sleptAt = 0;
    this.wakeCache = null;
  }

  log(msg) {
    const line = `[power] ${new Date(this.now()).toISOString()} ${msg}`;
    if (!this.quiet) console.log(line);
    if (this.logFile) try { fs.appendFileSync(this.logFile, line + '\n'); } catch {}
  }

  status(who) {
    const t = this.now();
    return {
      allowSleep: this.allowSleep, supported: Boolean(sleepCommand(this.platform)),
      canSleep: who !== 'guest', canChange: who === 'local', dryRun: this.dryRun,
      countdown: this.countdown / 1000,
      pending: this.pending ? { endsAt: this.pending.endsAt, left: Math.max(0, Math.ceil((this.pending.endsAt - t) / 1000)) } : null,
      sleptAt: t - this.sleptAt < 60_000 ? this.sleptAt : null,
    };
  }

  requestSleep(who, from = '') {
    const t = this.now(), say = (code, body, why) => { this.log(`sleep from ${who} ${from}: ${why}`); return { code, body }; };
    if (who === 'guest') return say(401, { error: 'code', message: 'Sleep from a phone needs the phone code. Turn on "Phones need a code" on the PC and pair this phone.' }, 'refused, not paired');
    if (!this.allowSleep) return say(403, { error: 'off', message: 'Sleep from phone is turned off. Turn on "Allow Sleep from phone" in Settings on the PC.' }, 'refused, allowSleep is off');
    const cmd = sleepCommand(this.platform);
    if (!cmd) return say(501, { error: 'unsupported', message: `Olympia can't put a ${this.platform} machine to sleep.` }, `refused, ${this.platform} not supported`);
    if (this.pending) return say(409, { error: 'pending', message: 'Already counting down.', pending: this.status(who).pending }, 'already counting down');
    if (t - this.lastAt < this.rate) {
      const retryIn = Math.ceil((this.rate - (t - this.lastAt)) / 1000);
      return say(429, { error: 'rate', message: `Wait ${retryIn} s before trying again.`, retryIn }, `refused, rate limit (${retryIn} s left)`);
    }
    this.lastAt = t;
    const timer = this.setTimer(() => this.fire(cmd), this.countdown);
    timer?.unref?.();
    this.pending = { endsAt: t + this.countdown, timer, by: who };
    return say(202, { ok: true, pending: this.status(who).pending }, `countdown started (${this.countdown / 1000} s)${this.dryRun ? ' [dry run]' : ''}`);
  }

  fire(cmd) {
    this.pending = null; this.sleptAt = this.now();
    if (this.dryRun) { this.log(`dry run: would run ${cmd.file} ${cmd.args.join(' ')}`); return; }
    this.log('going to sleep now');
    this.run(cmd.file, cmd.args, (err) => { if (err) this.log(`sleep command failed: ${err.message}`); });
  }

  cancel(who, from = '', why = 'cancelled') {
    if (who === 'guest') { this.log(`cancel from ${who} ${from}: refused, not paired`); return { code: 401, body: { error: 'code' } }; }
    const had = Boolean(this.pending);
    if (had) { this.clearTimer(this.pending.timer); this.pending = null; }
    this.log(`cancel from ${who} ${from}: ${had ? why : 'nothing to cancel'}`);
    return { code: 200, body: { ok: true, cancelled: had } };
  }

  setAllow(who, value, from = '') {
    if (who !== 'local') { this.log(`allowSleep change from ${who} ${from}: refused, only this PC can change it`); return { code: 403, body: { error: 'local', message: 'Change this on the PC.' } }; }
    if (typeof value !== 'boolean') return { code: 400, body: { error: 'bad' } };
    if (this.configFile) {
      const text = fs.readFileSync(this.configFile, 'utf8');
      const tmp = `${this.configFile}.tmp`;
      fs.writeFileSync(tmp, setConfigFlag(text, 'allowSleep', value));
      fs.renameSync(tmp, this.configFile);
    }
    this.allowSleep = value;
    this.log(`allowSleep set to ${value} from ${who}`);
    if (!value && this.pending) this.cancel(who, from, 'cancelled, sleep was turned off');
    return { code: 200, body: this.status(who) };
  }

  async wakeInfo(who) {
    if (!this.wakeCache || this.now() - this.wakeCache.at > 60_000) {
      const probed = await this.probe(this.platform).catch(() => null);
      this.wakeCache = { at: this.now(), probed };
    }
    return wakeInfo({ platform: this.platform, interfaces: this.interfaces(), probed: this.wakeCache.probed, showMac: who !== 'guest' });
  }

  // Answer /api/power/*. The server has already checked the host name and, with the code on, pairing.
  async handle(req, res, p, { readBody }) {
    const who = callerOf(req, this), from = String(req.socket?.remoteAddress || '');
    const send = ({ code, body }) => res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    const route = { '/api/power/status': 'GET', '/api/power/wake-info': 'GET', '/api/power/sleep': 'POST', '/api/power/cancel': 'POST', '/api/power/settings': 'POST' }[p];
    if (!route) return send({ code: 404, body: { error: 'none' } });
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (method !== route) return send({ code: 405, body: { error: 'method' } });
    if (p === '/api/power/status') return send({ code: 200, body: this.status(who) });
    if (p === '/api/power/wake-info') return send({ code: 200, body: await this.wakeInfo(who) });
    const body = await readBody(req);
    if (!sameOrigin(req, who)) { this.log(`${p.slice(11)} from ${who} ${from}: refused, not from Olympia's own page`); return send({ code: 403, body: { error: 'origin' } }); }
    if (p === '/api/power/sleep') return send(this.requestSleep(who, from));
    if (p === '/api/power/cancel') return send(this.cancel(who, from));
    return send(this.setAllow(who, body?.allowSleep, from));
  }
}

// ---------------------------------------------------------------- wake from sleep (Wake-on-LAN) info

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
const ipNum = (ip) => ip.split('.').reduce((n, x) => n * 256 + Number(x), 0);
const ipStr = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
export const broadcastOf = (ip, mask) => ipStr((ipNum(ip) | (~ipNum(mask) >>> 0)) >>> 0);
export const formatMac = (mac) => (mac ? String(mac).toUpperCase().replace(/-/g, ':') : null);

export function kindOf({ media, name, description }) {
  if (/802\.11|wireless|wi-?fi|wlan/i.test(`${media} ${name} ${description}`)) return 'wifi';
  if (/802\.3|ethernet|^eth|^en[op]/i.test(`${media}`) || /ethernet|gbe|^eth\d|^en[ops]/i.test(`${name} ${description}`)) return 'wired';
  return 'unknown';
}

// the adapter the PC talks to the home network through: the one Windows routes through, else the first private IPv4
export function pickInterface(interfaces, prefer) {
  const rows = [];
  for (const [name, list] of Object.entries(interfaces || {})) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && PRIVATE.some((r) => r.test(a.address))) rows.push({ name, ...a });
  return rows.find((r) => r.name === prefer) || rows[0] || null;
}

export function wakeInfo({ platform, interfaces, probed, showMac }) {
  const nic = pickInterface(interfaces, probed?.name);
  const name = probed?.name || nic?.name || null;
  const kind = kindOf({ media: probed?.media || '', name: name || '', description: probed?.description || '' });
  const mac = formatMac(probed?.mac || nic?.mac);
  const adapter = name ? {
    name, description: probed?.description || null, kind,
    mac: showMac ? mac : null, macHidden: !showMac,
    ip: nic?.address || null, netmask: nic?.netmask || null,
    broadcast: nic?.address && nic?.netmask ? broadcastOf(nic.address, nic.netmask) : null,
  } : null;
  const checks = [];
  if (adapter) checks.push({ id: 'wired', ok: kind === 'unknown' ? null : kind === 'wired', label: kind === 'wifi' ? 'Connected by Wi-Fi' : 'Connected by cable (Ethernet)',
    fix: kind === 'wifi' ? 'PCs on Wi-Fi usually can\'t be woken this way. A network cable to the router is the reliable route.' : null });
  if (platform === 'win32' && probed) {
    const magic = probed.magic ?? probed.pmMagic ?? null;
    checks.push({ id: 'magic', ok: magic == null ? null : /^enabled$/i.test(magic), label: '"Wake on Magic Packet" is on for this adapter',
      fix: `Device Manager → Network adapters → ${probed.description || name} → Advanced → Wake on Magic Packet: Enabled` });
    const armed = (probed.armed || []).map((s) => String(s).trim().toLowerCase());
    checks.push({ id: 'armed', ok: probed.description ? armed.includes(String(probed.description).toLowerCase()) : null, label: 'Windows lets this adapter wake the PC',
      fix: `Device Manager → ${probed.description || name} → Power Management → tick "Allow this device to wake the computer" and "Only allow a magic packet to wake the computer"` });
  }
  const known = checks.filter((c) => c.ok !== null);
  return {
    platform, adapter, checks,
    ready: !adapter ? false : known.length < checks.length || platform !== 'win32' ? null : known.every((c) => c.ok),
    note: platform === 'win32' ? null : platform === 'darwin' ? 'On a Mac, turn on "Wake for network access" in System Settings → Battery (or Energy).'
      : platform === 'linux' ? `On Linux, \`ethtool ${name || '<adapter>'}\` should show "Wake-on: g".` : null,
  };
}

// Windows: read the routed adapter, its wake settings and the wake-armed device list. Read-only.
const PROBE_PS = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1",
  "$a = if ($r) { Get-NetAdapter -InterfaceIndex $r.InterfaceIndex } else { Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1 }",
  "if (-not $a) { '{}'; exit }",
  "$adv = Get-NetAdapterAdvancedProperty -Name $a.Name | Where-Object { $_.RegistryKeyword -eq '*WakeOnMagicPacket' -or $_.DisplayName -match 'Magic Packet' } | Select-Object -First 1",
  '$pm = Get-NetAdapterPowerManagement -Name $a.Name',
  "$armed = @(powercfg /devicequery wake_armed | Where-Object { $_ -and $_.Trim() -and $_.Trim() -ne 'NONE' })",
  '[pscustomobject]@{ name = $a.Name; description = $a.InterfaceDescription; media = [string]$a.PhysicalMediaType; mac = $a.MacAddress; magic = $adv.DisplayValue; pmMagic = $(if ($pm) { [string]$pm.WakeOnMagicPacket } else { $null }); armed = $armed } | ConvertTo-Json -Compress',
].join('\n');

export function parseProbe(text) {
  const j = JSON.parse(String(text || '').trim() || '{}');
  if (!j.name) return null;
  const armed = j.armed == null ? [] : Array.isArray(j.armed) ? j.armed : [j.armed];
  return { name: j.name, description: j.description || null, media: j.media || '', mac: j.mac || null, magic: j.magic || null, pmMagic: j.pmMagic || null, armed };
}

export function probeNetwork(platform = process.platform) {
  if (platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PROBE_PS, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15_000 },
      (err, stdout) => { try { resolve(err ? null : parseProbe(stdout)); } catch { resolve(null); } });
  });
}

// What server.js needs: one PowerControl set up from the config and environment.
// OLYMPIA_ALLOW_SLEEP=1/0 overrides "allowSleep"; OLYMPIA_POWER_DRY_RUN=1 (or "powerDryRun": true) logs instead of sleeping;
// OLYMPIA_POWER_LOG moves the log (default olympia.power.log in the data folder).
export function createPower({ cfg = {}, dataDir, key, trustLoopback = true, env = process.env }) {
  return new PowerControl({
    allowSleep: env.OLYMPIA_ALLOW_SLEEP ? env.OLYMPIA_ALLOW_SLEEP === '1' : cfg.allowSleep === true,
    configFile: dataDir ? `${dataDir}/olympia.config.json` : null,
    logFile: env.OLYMPIA_POWER_LOG || (dataDir ? `${dataDir}/olympia.power.log` : null),
    key, trustLoopback,
    dryRun: env.OLYMPIA_POWER_DRY_RUN ? env.OLYMPIA_POWER_DRY_RUN === '1' : cfg.powerDryRun === true,
  });
}

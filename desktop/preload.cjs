// The widget's touches on the island page. Floating (the default), the island sits on the desktop with no window:
// a small bar shows above it while the pointer is over the island (drag it to move Olympia), and the page reports
// through window.olympiaDesktop whether the pointer is over the island, so clicks on empty pixels reach the desktop.
// In a window, the same bar is a slim title bar that shows near the top edge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('olympiaDesktop', {
  setInteractive: (on) => ipcRenderer.send('olw-hit', Boolean(on)),
});

const css = `
#olw-bar { position: fixed; top: 0; left: 0; right: 0; height: 30px; z-index: 2147483647; display: flex; align-items: center;
  gap: 4px; padding: 0 6px 0 12px; background: rgba(12, 18, 40, .78); color: #f3e3b5; font: 600 12px system-ui, sans-serif;
  -webkit-app-region: drag; user-select: none; opacity: 0; transition: opacity .18s; backdrop-filter: blur(6px); }
#olw-bar.show, #olw-bar:hover { opacity: 1; }
#olw-bar .olw-title { flex: 1; letter-spacing: .08em; }
#olw-bar button { -webkit-app-region: no-drag; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 500;
  padding: 4px 8px; border-radius: 6px; cursor: pointer; }
#olw-bar button:hover { background: rgba(255, 255, 255, .14); }
#olw-bar button.on { background: rgba(236, 190, 92, .28); }
#olw-bar button[data-a=close]:hover { background: #c4423a; color: #fff; }
/* floating: a pill at the top centre, shown with the rest of the HUD */
body.desktop #olw-bar { left: 50%; right: auto; top: 8px; transform: translateX(-50%); border-radius: 999px; padding: 0 6px 0 14px; pointer-events: none; }
body.desktop.hud-on #olw-bar { opacity: 1; pointer-events: auto; }
body.desktop #olw-bar .olw-title { flex: none; margin-right: 6px; cursor: grab; }
body.desktop #olw-bar .olw-title::before { content: '⠿ '; opacity: .7; }`;

window.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const bar = document.createElement('div'); bar.id = 'olw-bar';
  bar.innerHTML = '<span class="olw-title" title="Drag to move Olympia">OLYMPIA</span>'
    + '<button data-a="pin" title="Keep Olympia above other windows">On top</button>'
    + '<button data-a="phone" title="Show the island on your phone over home Wi-Fi">Phone</button>'
    + '<button data-a="hide" title="Hide to the tray (click the tray icon to bring it back)">&#8212;</button>'
    + '<button data-a="close" title="Hide to the tray">&#10005;</button>';
  document.body.append(bar);
  bar.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a) ipcRenderer.send('olw', a); });
  let t;
  window.addEventListener('mousemove', (e) => { if (e.clientY < 40) { bar.classList.add('show'); clearTimeout(t); t = setTimeout(() => bar.classList.remove('show'), 2500); } });
  ipcRenderer.on('olw-state', (_e, s) => { bar.querySelector('[data-a=pin]').classList.toggle('on', s.onTop); bar.querySelector('[data-a=phone]').classList.toggle('on', s.lan); });
  ipcRenderer.send('olw', 'ready');
});

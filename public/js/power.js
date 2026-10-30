// Settings → Phone: the "Allow Sleep from phone" switch and what you need to wake this PC again (Wake-on-LAN).
// Loaded on its own by index.html; adds its section to the Settings panel and refreshes it each time the panel opens.
// Talks to /api/power/* (lib/power.js). Only this PC can flip the switch; the wake checks only read settings.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (url, opts) => fetch(url, { cache: 'no-store', ...opts }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch(() => ({ status: 0, body: null }));

const panel = document.querySelector('#settings .panel');
const root = document.getElementById('settings');
if (panel && root) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/power.css';
  document.head.append(css);

  const sec = document.createElement('section');
  sec.className = 'power';
  sec.innerHTML = `
    <h3>Phone</h3>
    <p class="hint">Things your phone can do on this PC, from the List page (<a href="/list.html">/list.html</a>).</p>
    <label class="switch">
      <input type="checkbox" data-k="allow-sleep" disabled>
      <span class="track" aria-hidden="true"></span>
      <span class="what"><b>Allow Sleep from phone</b><small>Adds a <em>Sleep PC</em> button to the List page, with a 10-second countdown you can cancel. Only this PC and phones paired with the code can use it.</small></span>
    </label>
    <p class="msg" data-k="sleep-msg"></p>
    <h3>Wake from sleep</h3>
    <p class="hint">A Wake-on-LAN app on your phone wakes this PC from sleep by sending it a "magic packet" over your home network.</p>
    <div class="wake" data-k="wake"><p class="hint">Checking this PC's network…</p></div>`;
  panel.insertBefore(sec, panel.querySelector('.foot'));

  const box = sec.querySelector('[data-k="allow-sleep"]');
  const msg = sec.querySelector('[data-k="sleep-msg"]');
  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };

  async function loadStatus() {
    const { body: st } = await json('/api/power/status');
    if (!st) { say("Couldn't read the sleep setting.", true); return; }
    box.checked = st.allowSleep;
    box.disabled = !st.canChange || !st.supported;
    say(!st.supported ? "Olympia can't put this kind of computer to sleep." : !st.canChange ? 'Change this on the PC itself.' : st.dryRun ? 'Test mode is on ("powerDryRun"): the PC only pretends to sleep.' : '');
  }

  box.addEventListener('change', async () => {
    const want = box.checked;
    box.disabled = true;
    const r = await json('/api/power/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allowSleep: want }) });
    if (r.status === 200) { box.checked = r.body.allowSleep; say(want ? 'On. Your phone\'s List page now has a Sleep PC button.' : 'Off.'); }
    else { box.checked = !want; say(r.body?.message || "Couldn't change it.", true); }
    box.disabled = r.body?.canChange === false;
  });

  const tick = (ok) => (ok === true ? '<span class="ok">✓</span>' : ok === false ? '<span class="no">✗</span>' : '<span class="unk">?</span>');

  async function loadWake() {
    const el = sec.querySelector('[data-k="wake"]');
    const { body: w } = await json('/api/power/wake-info');
    if (!w) { el.innerHTML = '<p class="hint">Couldn\'t read the network setup.</p>'; return; }
    const a = w.adapter;
    if (!a) { el.innerHTML = '<p class="hint">This PC isn\'t on a home network right now, so it can\'t be woken over it.</p>'; return; }
    const mac = a.mac || (a.macHidden ? 'shown only on the PC or a paired phone' : 'unknown');
    const kind = a.kind === 'wired' ? 'Wired (Ethernet)' : a.kind === 'wifi' ? 'Wi-Fi' : 'Unknown';
    const rows = [['Adapter', a.description && a.description !== a.name ? `${a.name} · ${a.description}` : a.name], ['Connection', kind], ['MAC address', mac], ['LAN IP', a.ip || 'unknown'], ['Broadcast', a.broadcast || 'unknown']];
    const ready = w.ready === true ? '<p class="verdict good">Ready: this PC should wake when your phone sends the packet.</p>'
      : w.ready === false ? '<p class="verdict bad">Not ready yet. Fix the item marked ✗ below.</p>' : '';
    el.innerHTML = `
      ${a.kind === 'wifi' ? '<p class="warn"><b>This PC is on Wi-Fi.</b> PCs on Wi-Fi usually can\'t be woken this way, because the Wi-Fi card turns off in sleep. A network cable to the router is the reliable route.</p>' : ''}
      <dl class="nic">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${ready}
      ${w.checks.length ? `<ul class="checks">${w.checks.map((c) => `<li>${tick(c.ok)}<span>${esc(c.label)}${c.ok === false && c.fix ? `<small>${esc(c.fix)}</small>` : c.ok === null ? '<small>Couldn\'t tell from here.</small>' : ''}</span></li>`).join('')}</ul>` : ''}
      ${w.note ? `<p class="hint">${esc(w.note)}</p>` : ''}
      <ol class="steps">
        <li>Install a Wake-on-LAN app on your phone (search "Wake on LAN" in its app store).</li>
        <li>Add this PC: MAC address <b>${esc(a.mac || 'from this panel on the PC')}</b>, broadcast address <b>${esc(a.broadcast || 'your network\'s')}</b>, port <b>9</b>.</li>
        <li>With the phone on the same home Wi-Fi, put the PC to sleep, then tap it in the app. It wakes in a few seconds.</li>
      </ol>`;
  }

  const refresh = () => { loadStatus(); loadWake(); };
  new MutationObserver(() => { if (!root.hidden) refresh(); }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  if (!root.hidden) refresh();
}

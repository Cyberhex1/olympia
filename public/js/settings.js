// Settings panel: tabs for Maps (the island made into something else), Reskins (the island dressed differently), Worlds
// and Phone (power.js adds that section). A card opens that map or world's own page: a bigger picture, a button
// to switch to it, and its settings. Worlds are listed in /worlds/worlds.json (main.js hands over the ones this
// build can draw). The choice and each world's settings are remembered per device; switching reloads the page.

const KEY = 'olympia.world';
const TABS = { map: ['Maps', 'Olympia\'s island made into something else: a sea chart, a painted vase, a scroll, a cut-away.'],
  reskin: ['Reskins', 'The island itself, dressed differently: Olympus, the Cozy Village, golden hour and a hologram.'],
  world: ['Worlds', 'Your projects and threads as somewhere else entirely, from market stalls to ships and crypts.'] };

// Settings every map and world has. A world's world.json can add its own under "settings" (same shape).
const HOURS = [['auto', 'Its own'], ['live', 'Live'], ['8', 'Morning'], ['13', 'Midday'], ['18.5', 'Evening'], ['22', 'Night']];
const COMMON = [
  { key: 'hour', label: 'Time of day', hint: 'Its own: the light this place was drawn in. Live follows the real sky where you are.', options: HOURS, default: 'auto' },
  { key: 'labels', label: 'Building names', options: [['on', 'Show'], ['off', 'Hide']], default: globalThis.matchMedia?.('(max-width: 720px)').matches ? 'off' : 'on' }, // name plates crowd phones
];

export function savedWorld() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

// URL (?world= or the older ?theme=) beats this device's choice, which beats the config default.
export function pickWorld(params, configured, available) {
  for (const id of [params.get('world'), params.get('theme'), savedWorld(), configured]) if (id && available.includes(id)) return id;
  return available[0];
}

// This device's settings for one world: its defaults, overlaid with what was saved.
export function worldSettings(id, extra = []) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(`${KEY}.${id}`) || '{}'); } catch {}
  const out = {};
  for (const s of [...COMMON, ...extra]) out[s.key] = s.options.some(([v]) => v === saved[s.key]) ? saved[s.key] : s.default;
  return out;
}
function saveSetting(id, key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(`${KEY}.${id}`) || '{}');
    all[key] = value; localStorage.setItem(`${KEY}.${id}`, JSON.stringify(all));
  } catch {}
}

export async function initSettings({ current, worlds, esc, onChange }) {
  const el = document.getElementById('settings');
  const body = el.querySelector('.pages');
  const groupOf = (w) => (TABS[w.group] ? w.group : 'map');
  let tab = groupOf(worlds.find((w) => w.id === current) || {});
  let open = '';  // id of the map or world whose page is showing
  const extras = {};  // world.json "settings", fetched when its page first opens

  const card = (w) => `
      <button class="world ${w.id === current ? 'chosen' : ''}" data-open="${esc(w.id)}">
        <img src="${esc(w.preview)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <span class="name">${esc(w.name)}${w.id === current ? '<em>In use</em>' : ''}</span>
        <span class="blurb">${esc(w.blurb || '')}</span>
      </button>`;

  const field = (w, s, val) => `
      <div class="field"><div class="what"><b>${esc(s.label)}</b>${s.hint ? `<small>${esc(s.hint)}</small>` : ''}</div>
        <div class="seg" role="radiogroup" aria-label="${esc(s.label)}">${s.options.map(([v, label]) =>
          `<button role="radio" aria-checked="${v === val}" class="${v === val ? 'on' : ''}" data-set="${esc(s.key)}" data-val="${esc(v)}">${esc(label)}</button>`).join('')}</div></div>`;

  const page = (w) => {
    const vals = worldSettings(w.id, extras[w.id]);
    const inUse = w.id === current;
    return `
      <button class="back" data-back>‹ ${esc(TABS[groupOf(w)][0])}</button>
      <div class="detail">
        <img src="${esc(w.preview)}" alt="">
        <div><h3 class="dname">${esc(w.name)}</h3><p class="hint">${esc(w.blurb || '')}</p>
          <button class="apply" data-use ${inUse ? 'disabled' : ''}>${inUse ? 'In use' : `Switch to ${esc(w.name)}`}</button></div>
      </div>
      <h3>${esc(w.name)} settings</h3>
      <p class="hint">${inUse ? 'Changes show straight away.' : `Saved for when you switch to ${esc(w.name)}.`}</p>
      ${[...COMMON, ...(extras[w.id] || [])].map((s) => field(w, s, vals[s.key])).join('')}`;
  };

  const render = () => {
    el.dataset.tab = open ? 'page' : tab;
    el.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (tab === 'phone' && !open) { body.innerHTML = ''; return; }
    const w = worlds.find((x) => x.id === open);
    body.innerHTML = w ? page(w)
      : `<p class="hint">${esc(TABS[tab][1])}</p><div class="worlds">${worlds.filter((x) => groupOf(x) === tab).map(card).join('')}</div>`;
  };

  async function openPage(id) {
    const w = worlds.find((x) => x.id === id);
    if (!w) return;
    if (w.pack && !extras[id]) extras[id] = await fetch(`/worlds/${id}/world.json`).then((r) => r.json()).then((p) => p.settings || []).catch(() => []);
    open = id; render(); el.querySelector('.panel').scrollTop = 0;
  }

  const show = () => { open = ''; render(); el.hidden = false; el.querySelector('.panel').focus(); };
  const close = () => { el.hidden = true; };

  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-k="close"]')) return close();
    const t = e.target.closest('.tabs [data-tab]');  // scoped: #settings itself carries data-tab
    if (t) { tab = t.dataset.tab; open = ''; render(); return; }
    if (e.target.closest('[data-back]')) { open = ''; render(); return; }
    const c = e.target.closest('.worlds [data-open]');
    if (c) { openPage(c.dataset.open); return; }
    const s = e.target.closest('[data-set]');
    if (s && open) {
      saveSetting(open, s.dataset.set, s.dataset.val);
      if (open === current) onChange?.(worldSettings(current, extras[current]));
      render(); return;
    }
    if (e.target.closest('[data-use]') && open && open !== current) {
      try { localStorage.setItem(KEY, open); } catch {}
      const u = new URL(location.href); u.searchParams.delete('world'); u.searchParams.delete('theme');
      location.replace(u);
    }
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { if (open) { open = ''; render(); } else close(); } });
  return { open: show, close, toggle: () => (el.hidden ? show() : close()), isOpen: () => !el.hidden };
}

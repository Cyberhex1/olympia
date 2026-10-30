// HTML overlays: speech bubbles, name plates, the info card, the chronicle feed,
// the HUD, and the messenger's 2D face panel.
import * as THREE from 'three';
import { esc, timeAgo } from './util.js';

const v = new THREE.Vector3();

export class Bubbles {
  constructor(el, camera) { this.el = el; this.camera = camera; this.items = new Map(); }
  show(key, anchor, head, body, ttl = 5) {
    let it = this.items.get(key);
    if (!it) { it = { node: document.createElement('div') }; it.node.className = 'bubble'; this.el.appendChild(it.node); this.items.set(key, it); }
    else { it.node.classList.remove('fading'); it.node.style.animation = 'none'; void it.node.offsetWidth; it.node.style.animation = ''; }
    it.anchor = anchor; it.until = performance.now() + ttl * 1000;
    // a tiny speech bubble at the character's head: just its own words ("Running a command: <em>Run the tests</em>" says "Run the tests");
    // who is talking is on its name plate and its card
    const said = /<em>([\s\S]*?)<\/em>/.exec(body)?.[1]?.replace(/^·\s*/, '') || body;
    it.node.innerHTML = `<div class="b">${said}</div>`;
    it.node.title = head || '';
  }
  clear(key) { const it = this.items.get(key); if (it) { it.node.remove(); this.items.delete(key); } }
  update() {
    const now = performance.now(), w = innerWidth, h = innerHeight;
    for (const [key, it] of this.items) {
      if (now > it.until + 500) { it.node.remove(); this.items.delete(key); continue; }
      if (now > it.until) it.node.classList.add('fading');
      it.anchor.getWorldPosition(v).project(this.camera);
      const off = v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2;
      it.node.style.display = off ? 'none' : '';
      if (off) continue;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      // keep the bubble on screen (narrow phones), moving its tail so it still points at the speaker
      const bw = it.node.offsetWidth, left = Math.min(Math.max(x - bw / 2, 6), Math.max(6, w - bw - 6));
      const tail = Math.min(Math.max(x - left, 14), bw - 14);
      if (it.tail !== tail) { it.node.style.setProperty('--tail', `${Math.round(tail)}px`); it.tail = tail; }
      it.node.style.transform = `translate(${Math.round(left)}px, ${Math.round(y - it.node.offsetHeight - 6)}px)`;
    }
  }
}

export class Labels {
  constructor(el, camera) { this.el = el; this.camera = camera; this.items = new Map(); this.visible = true; }
  set(key, anchor, text, status) {
    let it = this.items.get(key);
    if (!it) {
      it = { node: document.createElement('div') }; it.node.className = 'label';
      if (key.startsWith('r:')) it.node.classList.add('char'); // a character's plate, kept about the character's size
      this.el.appendChild(it.node); this.items.set(key, it);
    }
    it.anchor = anchor;
    const html = `<span class="st ${esc(status || '')}"></span>${esc(text)}`;
    if (it.html !== html) { it.node.innerHTML = html; it.html = html; }
  }
  remove(key) { const it = this.items.get(key); if (it) { it.node.remove(); this.items.delete(key); } }
  toggle() { this.visible = !this.visible; this.el.classList.toggle('hidden', !this.visible); return this.visible; }
  update() {
    if (!this.visible) return;
    const w = innerWidth, h = innerHeight;
    for (const it of this.items.values()) {
      it.anchor.getWorldPosition(v).project(this.camera);
      const off = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      it.node.style.display = off ? 'none' : '';
      if (!off) it.node.style.transform = `translate(${Math.round((v.x * 0.5 + 0.5) * w - it.node.offsetWidth / 2)}px, ${Math.round((-v.y * 0.5 + 0.5) * h)}px)`;
    }
  }
}

export class Card {
  constructor(el) {
    this.el = el; this.body = el.querySelector('.card-body');
    el.querySelector('.close').onclick = () => this.hide();
    this.render = null;
  }
  show(render) { this.render = render; this.refresh(); this.el.hidden = false; }
  refresh() { if (this.render && !this.el.hidden) this.body.innerHTML = this.render(); else if (this.render) this.body.innerHTML = this.render(); }
  hide() { this.el.hidden = true; this.render = null; }
}

// links: [[href, text]] (http(s) only); extra: trusted HTML appended under the rows
export function cardHTML({ kicker, title, lede, rows, links = [], extra = '' }) {
  const a = links.filter(([href]) => /^https?:\/\//.test(href)).map(([href, text]) => `<a class="go" href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`).join('');
  return `<div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2>${lede ? `<div class="lede">${esc(lede)}</div>` : ''}
    <dl>${rows.filter(Boolean).map(([k, val, cls]) => `<dt>${esc(k)}</dt><dd>${cls ? `<span class="pill ${esc(cls)}">${esc(val)}</span>` : esc(val)}</dd>`).join('')}</dl>${a ? `<div class="links">${a}</div>` : ''}${extra}`;
}

export class Feed {
  constructor(el) {
    this.el = el; this.list = el.querySelector('ol'); this.seen = new Set();
    el.querySelector('#feed-toggle').onclick = () => el.classList.toggle('collapsed');
  }
  push(text, at = Date.now(), key) {
    if (key && this.seen.has(key)) return;
    if (key) this.seen.add(key);
    const li = document.createElement('li');
    const d = new Date(at);
    li.innerHTML = `<span class="t">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>${text}`;
    this.list.prepend(li);
    while (this.list.children.length > 40) this.list.lastChild.remove();
  }
}

export function toast(msg, ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ================================================================= the messenger's face (SVG)
export class Face {
  constructor(root) {
    this.root = root;
    this.svg = root.querySelector('svg');
    this.stateEl = root.querySelector('.state');
    this.doingEl = root.querySelector('.doing');
    this.statsEl = root.querySelector('.stats');
    this.svg.innerHTML = `
      <defs>
        <radialGradient id="fbg" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#fff7e6"/><stop offset="1" stop-color="#f3e3c3"/></radialGradient>
        <radialGradient id="fskin" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#f7d2ae"/><stop offset="1" stop-color="#e9b58a"/></radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#fbg)"/>
      <circle id="fring" cx="100" cy="100" r="92" fill="none" stroke="#d9d2c5" stroke-width="6"/>
      <g id="fhead">
        <g fill="#4a2f22">${[...Array(9)].map((_, i) => { const a = Math.PI * (0.95 + i * 0.14); return `<circle cx="${100 + Math.cos(a) * 54}" cy="${112 + Math.sin(a) * 50}" r="15"/>`; }).join('')}
          <circle cx="54" cy="116" r="14"/><circle cx="146" cy="116" r="14"/></g>
        <ellipse cx="100" cy="118" rx="56" ry="54" fill="url(#fskin)"/>
        <ellipse cx="72" cy="136" rx="10" ry="6" fill="#f29a8e" opacity=".7"/>
        <ellipse cx="128" cy="136" rx="10" ry="6" fill="#f29a8e" opacity=".7"/>
        <path id="fbrowL" d="M66 96 Q78 90 88 96" stroke="#4a2f22" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path id="fbrowR" d="M112 96 Q122 90 134 96" stroke="#4a2f22" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <g id="feyes">
          <g id="feyeL" transform="translate(78 114)"><ellipse rx="7.5" ry="9.5" fill="#1d1a1a"/><circle id="fglL" cx="2.4" cy="-3.2" r="2.6" fill="#fff"/></g>
          <g id="feyeR" transform="translate(122 114)"><ellipse rx="7.5" ry="9.5" fill="#1d1a1a"/><circle id="fglR" cx="2.4" cy="-3.2" r="2.6" fill="#fff"/></g>
        </g>
        <path id="fmouth" d="M86 142 Q100 154 114 142" stroke="#7a2e25" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <ellipse id="fmouthO" cx="100" cy="146" rx="8" ry="6" fill="#7a2e25" opacity="0"/>
        <path id="fsweat" d="M146 92 q6 10 0 14 q-6 -4 0 -14z" fill="#8cc8f0" opacity="0"/>
      </g>
      <g id="fhat">
        <ellipse cx="100" cy="70" rx="66" ry="12" fill="#d9b46b"/>
        <path d="M66 70 Q68 36 100 34 Q132 36 134 70 Z" fill="#e2c07c"/>
        <g id="fwingL" transform="translate(68 56)"><path d="M0 0 C-14 -6 -30 -22 -40 -38 C-30 -34 -24 -32 -18 -30 C-26 -38 -30 -44 -32 -52 C-20 -42 -8 -30 0 -18 Z" fill="#fff" stroke="#e7dccb" stroke-width="2"/></g>
        <g id="fwingR" transform="translate(132 56) scale(-1 1)"><path d="M0 0 C-14 -6 -30 -22 -40 -38 C-30 -34 -24 -32 -18 -30 C-26 -38 -30 -44 -32 -52 C-20 -42 -8 -30 0 -18 Z" fill="#fff" stroke="#e7dccb" stroke-width="2"/></g>
      </g>
      <g id="fdots" fill="#f0a236" opacity="0"><circle cx="150" cy="40" r="5"/><circle cx="164" cy="30" r="7"/><circle cx="180" cy="18" r="9"/></g>
      <g id="fwaves" stroke="#3fb46f" stroke-width="4" fill="none" stroke-linecap="round" opacity="0"><path d="M160 138 q8 8 0 16"/><path d="M170 132 q12 14 0 28"/></g>
      <g id="fbadge" opacity="0" transform="translate(152 150)"><circle r="20" fill="#4b8fe0"/><text id="fbadgeT" y="7" text-anchor="middle" font-size="20">⚙️</text></g>`;
    this.$ = (id) => this.svg.querySelector('#' + id);
    this.state = 'idle';
    this.blinkT = 2;
  }

  set({ state, title, doing, stats, badge, connected }) {
    this.state = state;
    this.root.dataset.state = state;
    this.stateEl.textContent = `· ${title}`;
    this.doingEl.textContent = doing;
    this.statsEl.textContent = stats;
    this.$('fbadgeT').textContent = badge || '⚙️';
    const ring = { idle: '#d9d2c5', thinking: '#f0a236', tool: '#4b8fe0', speaking: '#3fb46f', error: '#e0533d' }[state];
    this.$('fring').setAttribute('stroke', ring);
    this.$('fring').setAttribute('stroke-dasharray', connected ? '' : '8 10');
  }

  update(dt, t) {
    const s = this.state;
    // blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.13 ? 0.12 : 1;
    if (this.blinkT < 0) this.blinkT = 2.2 + Math.random() * 3;
    // gaze
    let gx = Math.sin(t * 0.6) * 2, gy = 0;
    if (s === 'thinking') { gx = 5; gy = -6; }
    if (s === 'tool') { gx = Math.sin(t * 3) * 5; gy = 2; }
    if (s === 'error') { gx = 0; gy = 3; }
    this.$('feyeL').setAttribute('transform', `translate(${78 + gx} ${114 + gy}) scale(1 ${blink})`);
    this.$('feyeR').setAttribute('transform', `translate(${122 + gx} ${114 + gy}) scale(1 ${blink})`);
    // brows
    const brows = {
      idle: ['M66 96 Q78 90 88 96', 'M112 96 Q122 90 134 96'],
      thinking: ['M66 92 Q78 84 88 92', 'M112 98 Q122 96 134 98'],
      tool: ['M66 98 Q78 94 88 100', 'M112 100 Q122 94 134 98'],
      speaking: ['M66 92 Q78 86 88 92', 'M112 92 Q122 86 134 92'],
      error: ['M66 100 Q78 92 88 92', 'M112 92 Q122 92 134 100'],
    }[s];
    this.$('fbrowL').setAttribute('d', brows[0]); this.$('fbrowR').setAttribute('d', brows[1]);
    // mouth
    const mouth = { idle: 'M86 142 Q100 154 114 142', thinking: 'M92 146 Q100 143 110 147', tool: 'M88 145 Q102 150 114 141', speaking: 'M86 142 Q100 154 114 142', error: 'M86 150 Q100 138 114 150' }[s];
    this.$('fmouth').setAttribute('d', mouth);
    const talking = s === 'speaking';
    this.$('fmouth').setAttribute('opacity', talking ? 0 : 1);
    const o = this.$('fmouthO'); o.setAttribute('opacity', talking ? 1 : 0);
    if (talking) o.setAttribute('ry', 3 + Math.abs(Math.sin(t * 11)) * 7);
    // extras
    this.$('fdots').setAttribute('opacity', s === 'thinking' ? 0.5 + Math.sin(t * 4) * 0.4 : 0);
    this.$('fwaves').setAttribute('opacity', talking ? 0.5 + Math.sin(t * 8) * 0.4 : 0);
    this.$('fbadge').setAttribute('opacity', s === 'tool' ? 1 : 0);
    this.$('fsweat').setAttribute('opacity', s === 'error' ? 1 : 0);
    const flap = s === 'idle' ? Math.sin(t * 2) * 4 : Math.sin(t * (s === 'tool' ? 18 : 8)) * 9;
    this.$('fwingL').setAttribute('transform', `translate(68 56) rotate(${flap})`);
    this.$('fwingR').setAttribute('transform', `translate(132 56) scale(-1 1) rotate(${flap})`);
    this.$('fhead').setAttribute('transform', s === 'thinking' ? `rotate(${Math.sin(t * 1.2) * 4} 100 120)` : '');
  }
}

export { timeAgo };

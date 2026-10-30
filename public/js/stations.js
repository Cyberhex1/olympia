// Project stations: a workbench beside each building where its threads do the project's job (public/js/jobs.js).
// Each working thread has a slot on the bench with its piece (a sword, a loaf, a painting...) at one of 4 stages;
// a finished piece is carried up to the Acropolis (main.js deliver). Tourists' stations stand by the Hotel.
// Local frame of a station: the bench runs along x, workers stand in front of it (+z) facing it.
import * as THREE from 'three';
import { mat, mesh } from './util.js';
import { JOBS, FALLBACK_JOB } from './jobs.js';
import { walkable, blockGround, unblockGround } from './characters.js';
import { edgeRadius, groundY } from './world.js';

const SLOT_X = [-1.1, 0, 1.1];
const SIGNS = { smithy: 'Smithy', library: 'Library', bakery: 'Bakery', lyre: 'Lyres', observatory: 'Observatory', scribe: 'Scribe', potter: 'Pottery',
  easel: 'Painter', lamps: 'Lamps', masks: 'Masks', sculptor: 'Sculptor', carpenter: 'Carpenter', postcards: 'Postcards' };
export const STATION_SLOTS = SLOT_X.length;

// ---------------------------------------------------------------- small builders
const box = (w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c, o) : c); m.position.set(x, y + h / 2, z); return m; };
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10, o) => { const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? mat(c, o) : c); m.position.set(x, y + h / 2, z); return m; };
const ball = (r, c, x = 0, y = 0, z = 0, s = [1, 1, 1], o) => { const m = mesh(new THREE.SphereGeometry(r, 12, 8), typeof c === 'string' ? mat(c, o) : c); m.position.set(x, y, z); m.scale.set(...s); return m; };
const glow = (c, i = 1.2) => mat(c, { emissive: c, emissiveIntensity: i });
const group = (...kids) => { const g = new THREE.Group(); g.add(...kids.filter(Boolean)); return g; };
const WOOD = '#a8774c', DARK = '#6e4a2e', STONE = '#b9b1a5', CLOTH = '#e9dfc8', PAPER = '#f4ead2', INK = '#3a3230', GOLD = '#e2b440';

// a bench top at height `h`, with legs
function bench(g, top = WOOD, h = 0.78, w = 3.5, d = 0.95) {
  g.add(box(w, 0.12, d, top, 0, h - 0.12, 0));
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) for (const z of [-d / 2 + 0.12, d / 2 - 0.12]) g.add(box(0.12, h - 0.12, 0.12, DARK, x, 0, z));
  return h;
}

// a hanging sign with the station's name
function sign(g, text, x = -1.85, z = 0.62) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72;
  const k = c.getContext('2d');
  k.fillStyle = '#5a3b24'; k.fillRect(0, 0, 256, 72);
  k.fillStyle = '#f3d27a'; k.font = `800 ${text.length > 12 ? 26 : 34}px Georgia, serif`; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(text.toUpperCase(), 128, 38);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.8 });
  m.userData.own = true;
  g.add(box(0.08, 2.1, 0.08, DARK, x, 0, z));
  const s = mesh(new THREE.PlaneGeometry(1.1, 0.31), m, { cast: false }); s.position.set(x, 1.85, z + 0.05); g.add(s);
  const back = s.clone(); back.rotation.y = Math.PI; back.position.z = z - 0.05; g.add(back);
}

// ---------------------------------------------------------------- the benches (props) and the pieces (4 stages)
// bench(g) builds the station and returns the work-surface height; piece(stage) the thing being made;
// tool(): an optional prop over each busy slot that moves while someone works (hammer, wheel...)
const hammer = () => { const h = new THREE.Group(); const p = new THREE.Group(); p.position.y = 0.55; h.add(p); p.add(box(0.05, 0.42, 0.05, DARK, 0, -0.42, 0)); p.add(box(0.2, 0.1, 0.1, '#5d5f66', 0, -0.06, 0, { metalness: 0.6, roughness: 0.4 })); h.userData.swing = p; return h; };
const BUILD = {
  smithy: {
    bench(g) {
      const h = bench(g, '#7d7570');
      g.add(box(1.2, 0.9, 0.9, STONE, -2.6, 0, -0.1)); g.add(box(0.9, 0.12, 0.7, glow('#ff6a1a', 1.6), -2.6, 0.9, -0.1)); // hearth with coals
      g.add(box(0.55, 1.6, 0.55, STONE, -2.6, 0.9, -0.35));
      g.add(box(0.9, 0.42, 0.55, DARK, 2.4, 0, 0.1)); g.add(box(0.8, 0.05, 0.45, mat('#4f86b8', { roughness: 0.2 }), 2.4, 0.4, 0.1)); // quench trough
      for (const x of SLOT_X) { g.add(box(0.45, 0.16, 0.26, '#4b4d54', x, h, 0, { metalness: 0.5, roughness: 0.45 })); } // anvils
      return h + 0.16;
    },
    piece(s) {
      if (s === 1) return group(box(0.5, 0.06, 0.07, glow('#ff8a2a', 1.4)));
      if (s === 2) return group(box(0.62, 0.03, 0.1, glow('#ff6a1a', 0.9)), box(0.12, 0.03, 0.05, glow('#ff6a1a', 0.9), 0.36, 0, 0));
      const steel = mat('#cfd4dc', { metalness: 0.8, roughness: s === 4 ? 0.15 : 0.5 });
      const g = group(box(0.62, 0.03, 0.1, steel), box(0.06, 0.04, 0.3, s === 4 ? mat(GOLD, { metalness: 0.6, roughness: 0.3 }) : '#555', -0.32, 0, 0), box(0.18, 0.05, 0.05, s === 4 ? '#6b3b25' : DARK, -0.44, 0, 0));
      if (s === 4) g.add(ball(0.035, mat('#c8432b', { roughness: 0.3 }), -0.55, 0.025, 0));
      return g;
    },
    tool: hammer, sparks: '#ffb347',
  },
  library: {
    bench(g) {
      const h = bench(g, '#8a5a35');
      g.add(box(0.45, 1.9, 1.5, DARK, -2.45, 0, -0.1)); // a bookcase at the end, so the readers stay in view
      const cols = ['#c8432b', '#2f5fa8', '#3f8a5a', '#d9b46b', '#7a4a8a'];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) g.add(box(0.3, 0.42, 0.13 + (i % 3) * 0.03, cols[(i * 7 + r) % 5], -2.2, 0.15 + r * 0.6, -0.7 + i * 0.24));
      return h;
    },
    piece(s) {
      const book = (c, y, r = 0) => { const b = box(0.36, 0.08, 0.26, c, 0, y, 0); b.rotation.y = r; return b; };
      if (s === 1) return group(book('#2f5fa8', 0), book('#c8432b', 0.08, 0.3), book('#3f8a5a', 0.16, -0.2));
      const open = group(box(0.26, 0.04, 0.34, PAPER, -0.14, 0, 0), box(0.26, 0.04, 0.34, PAPER, 0.14, 0, 0));
      open.children[0].rotation.z = 0.12; open.children[1].rotation.z = -0.12;
      if (s >= 3) { const n = box(0.2, 0.01, 0.26, '#fff8e0', 0.42, 0, 0.05); n.rotation.y = 0.4; open.add(n); }
      if (s === 4) open.add(ball(0.09, glow('#ffe48a', 2), 0, 0.3, 0));
      return open;
    },
    // what a reader carries up: the discovery, a glowing scroll
    carry() { return group(cyl(0.07, 0.07, 0.45, PAPER).rotateZ(Math.PI / 2), ball(0.16, glow('#ffe48a', 1.6), 0, 0.05, 0, [1, 1, 1])); },
  },
  bakery: {
    bench(g) {
      const h = bench(g, '#d9c7a5');
      const oven = new THREE.Group(); oven.position.set(-2.7, 0, -0.2);
      oven.add(box(1.3, 0.55, 1.2, STONE)); oven.add(ball(0.62, '#c98a5a', 0, 0.55, 0, [1, 0.8, 1]));
      oven.add(box(0.42, 0.32, 0.1, glow('#ff7a2a', 1.5), 0, 0.62, 0.55)); g.add(oven);
      for (const x of [2.2, 2.55]) g.add(cyl(0.2, 0.24, 0.5, CLOTH, x, 0, -0.1)); // flour sacks
      return h;
    },
    piece(s) {
      const board = box(0.5, 0.03, 0.34, '#b88a5a');
      if (s === 1) return group(board, cyl(0.2, 0.13, 0.12, '#7aa0c8', 0, 0.03, 0), ball(0.11, '#f3e3c2', 0, 0.15, 0, [1, 0.6, 1]));
      if (s === 2) return group(board, ball(0.16, '#f3e3c2', 0, 0.1, 0, [1.3, 0.5, 1]));
      if (s === 3) return group(board, ball(0.2, '#f1dcb2', 0, 0.12, 0, [1.4, 0.75, 1]));
      return group(board, ball(0.2, '#c07a35', 0, 0.12, 0, [1.5, 0.8, 1]), box(0.04, 0.01, 0.18, '#e8c890', -0.08, 0.27, 0), box(0.04, 0.01, 0.18, '#e8c890', 0.08, 0.27, 0));
    },
    smoke: [-2.7, 1.5, -0.2],
  },
  easel: {
    bench(g) {
      const h = bench(g, '#c9b89a', 0.7);
      const pots = ['#c8432b', '#2f5fa8', '#f0b437', '#3f8a5a'];
      pots.forEach((c, i) => g.add(cyl(0.07, 0.07, 0.12, c, -1.55 + i * 0.17, h, -0.3)));
      return h;
    },
    piece(s) {
      const g = new THREE.Group();
      const legs = [box(0.04, 0.9, 0.04, DARK, -0.18, 0, -0.05), box(0.04, 0.9, 0.04, DARK, 0.18, 0, -0.05)];
      legs[0].rotation.z = 0.12; legs[1].rotation.z = -0.12; g.add(...legs);
      const canvas = box(0.52, 0.42, 0.03, s === 1 ? '#fbf7ee' : '#f4ead2', 0, 0.42, 0); g.add(canvas);
      const paint = (c, x, y, w, hh) => g.add(box(w, hh, 0.01, c, x, 0.42 + y, 0.02));
      if (s === 1) { paint('#9a948a', -0.05, 0.12, 0.3, 0.01); paint('#9a948a', 0.04, 0.22, 0.01, 0.15); }
      if (s >= 2) { paint('#7cb0d8', 0, 0.22, 0.5, 0.18); paint('#6aa84f', 0, 0.02, 0.5, 0.16); }
      if (s >= 3) { paint('#f4f6fb', -0.1, 0.25, 0.12, 0.05); paint('#c8432b', 0.12, 0.1, 0.08, 0.1); paint('#f0b437', 0.18, 0.32, 0.06, 0.06); }
      if (s === 4) { const f = mat(GOLD, { metalness: 0.5, roughness: 0.35 }); for (const [x, y, w, hh] of [[0, 0.4, 0.58, 0.04], [0, 0.82, 0.58, 0.04], [-0.27, 0.42, 0.04, 0.44], [0.27, 0.42, 0.04, 0.44]]) g.add(box(w, hh, 0.04, f, x, y, 0.02)); }
      g.userData.ground = true; // stands on the ground in front of the bench, not on it
      return g;
    },
    carry() { return BUILD.easel.piece(4).children.slice(2).reduce((g, c) => g.add(c.clone()) && g, new THREE.Group()).translateY(-0.4); },
  },
  lyre: {
    bench(g) {
      const h = bench(g, WOOD);
      for (let i = 0; i < 4; i++) g.add(box(1.4, 0.06, 0.18, '#c9a06a', 2.2, 0.06 * i, -0.2 + (i % 2) * 0.05));
      return h;
    },
    piece(s) {
      const wood = s === 4 ? mat('#b06a3a', { roughness: 0.35 }) : '#d1a46c';
      const g = new THREE.Group();
      const arm = (x, r) => { const a = box(0.05, 0.42, 0.05, wood, x, 0.04, 0); a.rotation.z = r; return a; };
      g.add(ball(0.13, wood, 0, 0.06, 0, [1.3, 0.6, 0.5]), arm(-0.13, 0.2), arm(0.13, -0.2));
      if (s >= 2) g.add(box(0.42, 0.04, 0.05, wood, 0, 0.44, 0));
      if (s >= 3) for (let i = 0; i < 5; i++) g.add(box(0.008, 0.36, 0.008, mat(s === 4 ? GOLD : '#ddd', { metalness: 0.6 }), -0.09 + i * 0.045, 0.1, 0.03));
      g.rotation.x = -Math.PI / 2 + 0.3; g.position.y = 0.05;
      return group(g);
    },
  },
  observatory: {
    bench(g) {
      const h = bench(g, '#7d6a5a', 0.75, 2.6);
      const scope = new THREE.Group(); scope.position.set(2.4, 0, -0.2);
      for (const a of [0, 2.1, 4.2]) { const l = box(0.05, 1.3, 0.05, DARK, Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25); l.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); scope.add(l); }
      const tube = new THREE.Group(); tube.position.y = 1.3;
      const t = cyl(0.11, 0.15, 1.1, mat('#b08a3a', { metalness: 0.6, roughness: 0.35 }), 0, -0.55, 0); tube.add(t); tube.rotation.x = -0.9;
      scope.add(tube); g.add(scope); g.userData.scope = tube;
      return h;
    },
    piece(s) {
      const g = group(box(0.5, 0.01, 0.36, '#1f2a4a'));
      const star = (x, z, c = '#f7f1c8') => g.add(box(0.03, 0.012, 0.03, glow(c, 1.5), x, 0.005, z));
      if (s >= 2) [[-0.15, -0.1], [0.05, 0.08], [0.18, -0.06]].forEach(([x, z]) => star(x, z));
      if (s >= 3) { [[-0.05, -0.12], [0.12, 0.12], [-0.2, 0.1]].forEach(([x, z]) => star(x, z)); const l = box(0.25, 0.005, 0.006, mat('#9fb4e8'), 0, 0.015, 0); l.rotation.y = 0.5; g.add(l); }
      if (s === 4) g.add(ball(0.05, glow('#ffd166', 2.2), 0.05, 0.05, 0.08));
      return g;
    },
    carry() { return group(cyl(0.08, 0.08, 0.5, '#1f2a4a').rotateZ(Math.PI / 2), ball(0.08, glow('#ffd166', 2), 0, 0.12, 0)); },
  },
  scribe: {
    bench(g) {
      const h = bench(g, '#8a5a35', 0.78, 3.2);
      g.add(cyl(0.06, 0.07, 0.1, INK, 1.5, h, -0.25)); const q = box(0.015, 0.35, 0.015, '#f7f3ea', 1.5, h + 0.05, -0.25); q.rotation.z = 0.4; g.add(q);
      g.add(box(0.5, 0.35, 0.35, DARK, 2.1, 0, 0.1)); // a crate of finished letters
      return h;
    },
    piece(s) {
      if (s === 4) return group(cyl(0.06, 0.06, 0.4, PAPER).rotateZ(Math.PI / 2), cyl(0.07, 0.07, 0.02, '#c8432b', 0, -0.01, 0).rotateZ(Math.PI / 2));
      const g = group(box(0.3, 0.01, 0.4, PAPER));
      if (s >= 2) for (let i = 0; i < 6; i++) g.add(box(0.2, 0.004, 0.012, INK, -0.02 + (i % 2) * 0.02, 0.01, -0.14 + i * 0.05));
      if (s >= 3) g.add(cyl(0.05, 0.05, 0.02, '#c8432b', 0.08, 0.01, 0.15));
      return g;
    },
  },
  potter: {
    bench(g) {
      const h = bench(g, '#9a7b5a', 0.55, 3.5);
      g.add(ball(0.75, '#b0603a', -2.7, 0.55, -0.1, [1, 1.1, 1])); g.add(box(0.36, 0.3, 0.1, glow('#ff7a2a', 1.2), -2.7, 0.35, 0.62)); // kiln
      for (const x of SLOT_X) g.add(cyl(0.26, 0.26, 0.05, '#7a6a5a', x, h, 0, 16)); // wheels
      return h + 0.05;
    },
    piece(s) {
      const clay = s === 4 ? '#c0603a' : s === 3 ? '#4f86b8' : '#a87a5a';
      if (s === 1) return group(ball(0.13, clay, 0, 0.1, 0, [1, 0.8, 1]));
      const pts = s === 2 ? [[0.12, 0], [0.16, 0.1], [0.12, 0.22], [0.09, 0.28]] : [[0.06, 0], [0.16, 0.12], [0.17, 0.24], [0.09, 0.36], [0.06, 0.44], [0.08, 0.48]];
      const lathe = mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 12), mat(clay, { side: THREE.DoubleSide, roughness: s >= 3 ? 0.4 : 0.9 }));
      const g = group(lathe);
      if (s === 4) { g.add(cyl(0.172, 0.172, 0.05, INK, 0, 0.2, 0, 12)); for (const x of [-1, 1]) { const hnd = mesh(new THREE.TorusGeometry(0.06, 0.015, 4, 8, Math.PI), mat(clay)); hnd.position.set(x * 0.1, 0.4, 0); hnd.rotation.z = x * -1.2; g.add(hnd); } }
      g.userData.spin = true;
      return g;
    },
  },
  lamps: {
    bench(g) {
      const h = bench(g, '#9a7b5a');
      g.add(cyl(0.25, 0.32, 0.7, '#b0603a', 2.2, 0, -0.2)); // oil jar
      return h;
    },
    piece(s) {
      const clay = '#c0703a';
      if (s === 1) return group(ball(0.1, '#a87a5a', 0, 0.07, 0, [1.2, 0.6, 1]));
      const g = group(ball(0.12, clay, 0, 0.06, 0, [1.4, 0.5, 1]), cyl(0.03, 0.04, 0.08, clay, 0.17, 0.02, 0).rotateZ(-1.2));
      if (s >= 3) g.add(cyl(0.06, 0.06, 0.01, '#3b2a12', 0, 0.115, 0));
      if (s === 4) g.add(ball(0.05, glow('#ffb347', 2.6), 0.2, 0.14, 0, [0.7, 1.4, 0.7]));
      return g;
    },
  },
  masks: {
    bench(g) {
      const h = bench(g, WOOD);
      for (const [x, c] of [[-1.9, '#c8432b'], [-1.7, '#2f5fa8'], [-1.5, GOLD]]) g.add(cyl(0.08, 0.08, 0.14, c, x, h, -0.3));
      return h;
    },
    piece(s) {
      const face = s === 1 ? '#d1a46c' : '#f7f3ea';
      const g = group(ball(0.2, face, 0, 0.05, 0, [0.85, 0.3, 1.05]));
      if (s >= 2) for (const x of [-0.07, 0.07]) g.add(ball(0.035, INK, x, 0.1, -0.05, [1, 0.5, 1]));
      if (s >= 3) { g.add(box(0.12, 0.01, 0.03, '#c8432b', 0, 0.1, 0.1)); g.add(box(0.03, 0.01, 0.16, GOLD, 0, 0.11, -0.12)); }
      if (s === 4) for (const x of [-1, 1]) { const r = box(0.3, 0.01, 0.04, x > 0 ? '#c8432b' : '#2f5fa8', x * 0.3, 0.02, 0); r.rotation.y = x * 0.3; g.add(r); }
      return g;
    },
  },
  sculptor: {
    bench(g) {
      g.add(box(0.9, 0.7, 0.7, '#e9e4da', -2.4, 0, -0.3)); g.add(box(0.6, 0.5, 0.6, '#f1ece2', 2.5, 0, -0.2)); // marble blocks
      for (const x of SLOT_X) g.add(cyl(0.3, 0.34, 0.7, '#cfc6b8', x, 0, 0, 8));
      return 0.7;
    },
    piece(s) {
      const marble = mat('#f4f1ea', { roughness: s === 4 ? 0.25 : 0.9 });
      if (s === 1) return group(box(0.38, 0.5, 0.38, marble));
      if (s === 2) return group(box(0.38, 0.3, 0.38, marble), ball(0.19, marble, 0, 0.42, 0, [1, 0.9, 1]));
      const g = group(cyl(0.17, 0.2, 0.18, marble, 0, 0, 0, 10), ball(0.18, marble, 0, 0.33, 0, [0.95, 1.05, 0.95]));
      if (s === 4) { g.add(cyl(0.21, 0.21, 0.05, mat(GOLD, { metalness: 0.5 }), 0, 0, 0, 12)); for (const x of [-0.08, 0.08]) g.add(ball(0.02, '#cfc6b8', x, 0.36, 0.16)); }
      return g;
    },
    tool: hammer, sparks: '#ffffff',
  },
  carpenter: {
    bench(g) {
      const h = bench(g, '#c9a06a');
      for (let i = 0; i < 3; i++) g.add(box(1.6, 0.08, 0.3, '#d6b07a', 2.5, i * 0.08, 0));
      return h;
    },
    piece(s) {
      const wood = '#c08850';
      if (s === 1) return group(box(0.55, 0.04, 0.16, wood));
      if (s === 2) return group(box(0.55, 0.04, 0.16, wood), box(0.55, 0.04, 0.16, wood, 0, 0.04, 0.17));
      const g = group(box(0.5, 0.04, 0.34, wood), box(0.5, 0.24, 0.03, wood, 0, 0, 0.16), box(0.5, 0.24, 0.03, wood, 0, 0, -0.16), box(0.03, 0.24, 0.34, wood, 0.25, 0, 0), box(0.03, 0.24, 0.34, wood, -0.25, 0, 0));
      if (s === 4) { g.add(box(0.54, 0.06, 0.38, '#a86a3a', 0, 0.24, 0)); g.add(box(0.06, 0.08, 0.02, mat(GOLD, { metalness: 0.6 }), 0, 0.18, 0.18)); }
      return g;
    },
    tool: hammer, sparks: '#e8c890',
  },
  postcards: {
    bench(g) {
      const h = bench(g, '#f3efe6', 0.72, 2.9, 0.8);
      const pole = box(0.05, 2.1, 0.05, '#ddd', 0, 0, -0.1); g.add(pole);
      const brolly = mesh(new THREE.ConeGeometry(1.5, 0.5, 8, 1, true), mat('#d9382c', { side: THREE.DoubleSide })); brolly.position.set(0, 2.2, -0.1); g.add(brolly);
      return h;
    },
    piece(s) {
      const g = group(box(0.34, 0.01, 0.24, PAPER));
      if (s >= 2) { g.add(box(0.15, 0.004, 0.18, '#7cb0d8', -0.08, 0.01, 0)); g.add(box(0.15, 0.005, 0.07, '#6aa84f', -0.08, 0.011, 0.05)); }
      if (s >= 3) g.add(box(0.05, 0.006, 0.06, '#c8432b', 0.12, 0.012, -0.07));
      if (s === 4) for (let i = 0; i < 3; i++) g.add(box(0.1, 0.004, 0.01, INK, 0.08, 0.012, 0.0 + i * 0.04));
      return g;
    },
  },
};

const jobOf = (key) => BUILD[key] || BUILD[FALLBACK_JOB];
// The finished piece a thread carries up the mountain (the discovery for readers, the scroll for scribes...)
export function finishedPiece(key) {
  const b = jobOf(key);
  const p = b.carry ? b.carry() : b.piece(4);
  p.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return p;
}

// ---------------------------------------------------------------- a station
class Station {
  constructor(scene, key, job, at, heading) {
    this.key = key; this.job = JOBS[job] ? job : FALLBACK_JOB; this.place = JOBS[this.job].place;
    this.group = new THREE.Group();
    this.group.position.set(at.x, groundY(at.x, at.z), at.z);
    this.group.rotation.y = heading;
    this.surface = jobOf(this.job).bench(this.group);
    sign(this.group, SIGNS[this.job] || JOBS[this.job].place);
    this.group.traverse((o) => { if (o.isMesh) o.userData.station = this; });
    scene.add(this.group);
    this.slots = SLOT_X.map((x) => ({ x, id: null, stage: 0, piece: null, tool: null, active: false }));
    this.extra = []; // workers past the 3 bench slots stand at the ends
    blockGround(`st:${key}`, at, 2.4);
  }

  // where worker n stands (in front of its slot, facing the bench) and which way it faces
  spot(n) {
    const x = n < SLOT_X.length ? SLOT_X[n] : (n % 2 ? -1 : 1) * (2.1 + Math.floor((n - SLOT_X.length) / 2) * 0.9);
    return this.group.localToWorld(new THREE.Vector3(x, 0, 1.15));
  }
  get facing() { return this.group.rotation.y + Math.PI; }

  // list: [{ id, stage, active }] in order of priority (working threads first). Each keeps its slot while it has one.
  show(list) {
    const want = list.slice(0, SLOT_X.length), ids = new Set(want.map((w) => w.id));
    for (const s of this.slots) if (s.id && !ids.has(s.id)) this.clear(s);
    for (const w of want) {
      let s = this.slots.find((x) => x.id === w.id) || this.slots.find((x) => !x.id);
      if (!s) continue;
      s.id = w.id; s.active = w.active;
      if (s.stage !== w.stage) this.setPiece(s, w.stage);
      const b = jobOf(this.job);
      if (b.tool && w.active && !s.tool) { s.tool = b.tool(); s.tool.position.set(s.x + 0.12, this.surface, 0.05); this.group.add(s.tool); }
      if (s.tool && !w.active) { this.group.remove(s.tool); s.tool = null; }
    }
    this.order = new Map(this.slots.filter((s) => s.id).map((s) => [s.id, this.slots.indexOf(s)]));
    let n = SLOT_X.length; for (const w of list.slice(SLOT_X.length)) this.order.set(w.id, n++);
  }
  slotOf(id) { return this.order?.get(id) ?? null; }
  clear(s) { if (s.piece) { this.group.remove(s.piece); dispose(s.piece); } if (s.tool) this.group.remove(s.tool); Object.assign(s, { id: null, stage: 0, piece: null, tool: null, active: false }); }
  setPiece(s, stage) {
    if (s.piece) { this.group.remove(s.piece); dispose(s.piece); }
    s.stage = stage; s.piece = jobOf(this.job).piece(Math.max(1, Math.min(4, stage)));
    s.piece.position.set(s.x, s.piece.userData.ground ? 0 : this.surface + 0.01, s.piece.userData.ground ? 0.5 : 0);
    this.group.add(s.piece);
  }
  // the piece is taken away (carried up the mountain)
  take(id) { const s = this.slots.find((x) => x.id === id); if (s) this.clear(s); }

  update(dt, t, fx) {
    const b = jobOf(this.job);
    let busy = false;
    for (const s of this.slots) {
      if (!s.id) continue;
      if (s.active) busy = true;
      if (s.tool?.userData.swing) {
        const k = (t * 2.2 + s.x) % 1, a = k < 0.7 ? -1.2 * (k / 0.7) : -1.2 + 1.2 * ((k - 0.7) / 0.3) ** 2 * 1.0;
        s.tool.userData.swing.rotation.z = -a; // lift slowly, strike fast
        if (fx && b.sparks && k > 0.97 && Math.random() < 0.6) fx.sparkle(this.group.localToWorld(new THREE.Vector3(s.x, this.surface + 0.1, 0)), b.sparks, 8);
      }
      if (s.piece?.userData.spin && s.active) s.piece.rotation.y += dt * 4;
    }
    if (this.group.userData.scope) this.group.userData.scope.rotation.y = busy ? Math.sin(t * 0.4) * 0.6 : 0;
    this.smokeT = (this.smokeT || 0) - dt;
    if (fx && busy && b.smoke && this.smokeT < 0) { this.smokeT = 0.6; fx.smoke(this.group.localToWorld(new THREE.Vector3(...b.smoke))); }
  }

  dispose(scene) { scene.remove(this.group); dispose(this.group); unblockGround(`st:${this.key}`); }
}
function dispose(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material?.userData?.own) x.material.dispose(); }); }

// Where a station goes beside a building: to one side of its door, on open ground and on the island.
// door: the door's world position; center: the building's; taken: stations already placed (avoid them).
export function stationSpot(door, center, taken = [], sides = [3.6, -3.6, 5.2, -5.2]) {
  const out = door.clone().sub(center).setY(0).normalize(), side = new THREE.Vector3(-out.z, 0, out.x);
  for (const o of [-0.6, 0.4, -1.6, 1.4, -2.8, -4]) for (const s of sides) { // (buildings near the edge: further back, level with the walls)
    const p = door.clone().addScaledVector(side, s).addScaledVector(out, o);
    const ok = [[0, 0], [1.9, 0], [-1.9, 0], [0, 1.2]].every(([a, b]) => {
      const x = p.x + side.x * a + out.x * b, z = p.z + side.z * a + out.z * b;
      return Math.hypot(x, z) < edgeRadius(Math.atan2(z, x)) - 1.2 && walkable(x, z);
    }) && taken.every((q) => q.distanceTo(p) > 4.6);
    // the bench faces the same way as the building: workers stand on its front, facing back towards it
    if (ok) return { at: p.setY(0), heading: Math.atan2(out.x, out.z) + Math.PI };
  }
  return null;
}

// ---------------------------------------------------------------- all stations
export class Stations {
  constructor(scene, fx) { this.scene = scene; this.fx = fx; this.map = new Map(); }

  // want: [{ key, job, door, center }]; a station whose building is gone (or whose job changed) is taken down
  sync(want) {
    const keep = new Set();
    for (const w of want) {
      keep.add(w.key);
      const have = this.map.get(w.key);
      if (have && have.job === (JOBS[w.job] ? w.job : FALLBACK_JOB)) continue;
      if (have) { have.dispose(this.scene); this.map.delete(w.key); }
      const spot = stationSpot(w.door, w.center, [...this.map.values()].map((s) => s.group.position), w.sides);
      if (!spot) continue;
      this.map.set(w.key, new Station(this.scene, w.key, w.job, spot.at, spot.heading));
    }
    for (const [k, s] of this.map) if (!keep.has(k)) { s.dispose(this.scene); this.map.delete(k); }
  }
  get(key) { return this.map.get(key) || null; }
  update(dt, t) { for (const s of this.map.values()) s.update(dt, t, this.fx); }
}

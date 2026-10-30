// The messenger (mirrors Claude Code activity) and the felt residents (Claude sessions and helpers).
import * as THREE from 'three';
import { felt, mat, mesh, rng, easeInOut, polar } from './util.js';
import { groundY, edgeRadius, MOUNTAIN, LAYOUT, flatGround } from './world.js';

// Ground a character may stroll on: on the island, off the mountain's flanks, out of the pond and not inside a
// building (its door step is fine). Roads and paths are for walking.
// worked out on first use: a map world swaps in its own layout before anyone walks (world.js useTerrain)
let CORES = null;
const cores = () => CORES || (CORES = [[{ x: 0, z: 0 }, 3.0], ...Object.values(LAYOUT.tools).map((t) => [polar(t.theta, t.r), 2.2]), ...LAYOUT.projectSlots.map((s) => [polar(s.theta, s.r), 2.2]),
  [polar(LAYOUT.agora.theta, LAYOUT.agora.r), 3.0], [polar(LAYOUT.hotel.theta, LAYOUT.hotel.r), 2.6], [polar(LAYOUT.pond.theta, LAYOUT.pond.r), LAYOUT.pond.radius + 0.5]]);
export function walkable(x, z) {
  const r = Math.hypot(x, z);
  if (r > edgeRadius(Math.atan2(z, x)) - 1.4 || (!flatGround() && r > MOUNTAIN.topR + 1.6 && r < MOUNTAIN.baseR + 0.4)) return false;
  return cores().every(([c, rad]) => Math.hypot(x - c.x, z - c.z) > rad) && [...BLOCKS.values()].every(([c, rad]) => Math.hypot(x - c.x, z - c.z) > rad);
}
// Ground taken by things placed later (project stations, stations.js): strollers keep off it.
const BLOCKS = new Map();
export function blockGround(key, at, rad) { BLOCKS.set(key, [{ x: at.x, z: at.z }, rad]); }
export function unblockGround(key) { BLOCKS.delete(key); }

// A map world can lay out its walkways as a graph ({ nodes: [[x, z], ...], edges: [[i, j], ...] }, world.js
// useTerrain): a trip steps onto the nearest node, follows the shortest way along the edges and steps off by the
// node nearest where it's going. Straight legs ({ p0, p1, len }) instead of the island's polar ones.
const graphs = new WeakMap();
function graphLegs(paths, from, to) {
  let g = graphs.get(paths);
  if (!g) {
    const pts = paths.nodes.map(([x, z]) => ({ x, z })), adj = pts.map(() => []);
    for (const [i, j] of paths.edges) { const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z); adj[i].push([j, d]); adj[j].push([i, d]); }
    graphs.set(paths, g = { pts, adj });
  }
  const near = (p) => { let best = 0, bd = Infinity; g.pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = i; } }); return [best, bd]; };
  const [a, da] = near(from), [b, db] = near(to);
  if (Math.hypot(to.x - from.x, to.z - from.z) <= da + db) return null; // close by: walk straight there
  const dist = g.pts.map(() => Infinity), prev = g.pts.map(() => -1), done = new Set(); dist[a] = 0;
  while (done.size < g.pts.length) {
    let u = -1; dist.forEach((d, i) => { if (!done.has(i) && d < Infinity && (u < 0 || d < dist[u])) u = i; });
    if (u < 0 || u === b) break;
    done.add(u);
    for (const [v, w] of g.adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  if (dist[b] === Infinity) return null;
  const way = []; for (let i = b; i >= 0; i = prev[i]) way.unshift(g.pts[i]);
  const stops = [{ x: from.x, z: from.z }, ...way, { x: to.x, z: to.z }];
  return stops.slice(1).map((p1, i) => ({ p0: stops[i], p1, len: Math.hypot(p1.x - stops[i].x, p1.z - stops[i].z) }));
}

const STATE_COLORS = { idle: '#d9d2c5', thinking: '#f0a236', tool: '#4b8fe0', speaking: '#3fb46f', error: '#e0533d' };

function sph(r, m, x = 0, y = 0, z = 0, s = [1, 1, 1], seg = 14) {
  const o = mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), m); o.position.set(x, y, z); o.scale.set(...s); return o;
}
function eye(r = 0.07) {
  const g = new THREE.Group();
  g.add(sph(r, mat('#1d1a1a', { roughness: 0.3, flatShading: false }), 0, 0, 0, [1, 1.15, 0.6], 10));
  g.add(sph(r * 0.33, mat('#ffffff', { roughness: 0.2, flatShading: false }), r * 0.3, r * 0.4, r * 0.45, [1, 1, 1], 6));
  return g;
}
function wing(color = '#ffffff', n = 3, len = 0.32) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const f = mesh(new THREE.BoxGeometry(len - i * 0.06, 0.03, 0.09), mat(color));
    f.position.set((len - i * 0.06) / 2, i * 0.05, -i * 0.02); f.rotation.z = 0.35 + i * 0.22; g.add(f);
  }
  return g;
}

// ================================================================= the messenger
export class Messenger {
  constructor(scene) {
    const skin = (this.skinMat = felt('#f0c39b', '#ffe3cc')), tunic = (this.tunicMat = felt('#f7f3ea')), gold = mat('#e2b440', { metalness: 0.5, roughness: 0.4 });
    const g = (this.group = new THREE.Group());
    const body = (this.body = new THREE.Group()); g.add(body);

    // legs + winged sandals
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.14, 0.62, 0);
      const l = mesh(new THREE.CapsuleGeometry(0.085, 0.4, 4, 8), skin); l.position.y = -0.3; leg.add(l);
      const sandal = mesh(new THREE.BoxGeometry(0.17, 0.07, 0.28), mat('#a0703f')); sandal.position.set(0, -0.58, 0.04); leg.add(sandal);
      const w = wing('#ffffff', 3, 0.22); w.position.set(s * 0.08, -0.52, -0.06); w.scale.x = s; w.rotation.y = s * -0.5; leg.add(w);
      leg.userData.wing = w;
      body.add(leg); this.legs.push(leg);
    }
    // tunic, belt, cape, satchel
    const torso = mesh(new THREE.CylinderGeometry(0.27, 0.42, 0.72, 14), tunic); torso.position.y = 0.92; body.add(torso);
    const belt = mesh(new THREE.TorusGeometry(0.31, 0.04, 6, 18), gold); belt.rotation.x = Math.PI / 2; belt.position.y = 0.93; body.add(belt);
    const cape = mesh(new THREE.CylinderGeometry(0.33, 0.5, 0.85, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9), felt('#c8432b', '#ff9a7a'));
    cape.material.side = THREE.DoubleSide; cape.position.set(0, 0.92, -0.02); body.add(cape);
    this.cape = cape;
    const satchel = mesh(new THREE.BoxGeometry(0.24, 0.2, 0.1), felt('#8a5a35')); satchel.position.set(0.36, 0.78, 0.08); satchel.rotation.z = 0.1; body.add(satchel);
    const strap = mesh(new THREE.TorusGeometry(0.36, 0.018, 4, 20, Math.PI), felt('#6b4a2f')); strap.position.set(0.05, 1.0, 0); strap.rotation.set(0, 0, -0.6); body.add(strap);

    // arms (left holds the caduceus)
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.33, 1.2, 0);
      const a = mesh(new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), skin); a.position.y = -0.22; arm.add(a);
      arm.rotation.z = s * 0.25; body.add(arm); this.arms.push(arm);
    }
    const cad = new THREE.Group();
    cad.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), gold));
    const knob = sph(0.06, gold, 0, 0.53, 0); cad.add(knob);
    for (const s of [-1, 1]) { const w = wing('#f7f3ea', 3, 0.16); w.position.set(0, 0.45, 0); w.scale.x = s; cad.add(w); }
    for (let i = 0; i < 2; i++) { const snake = mesh(new THREE.TorusGeometry(0.07, 0.014, 4, 12), mat('#4f8a4a')); snake.position.y = 0.05 + i * 0.16; snake.rotation.x = Math.PI / 2.4; cad.add(snake); }
    cad.position.set(0, -0.42, 0.06); cad.rotation.x = 0.1; this.arms[0].add(cad); this.caduceus = cad;

    // head
    const head = (this.head = new THREE.Group()); head.position.y = 1.62; body.add(head);
    head.add(sph(0.4, skin, 0, 0, 0, [1, 0.95, 0.95], 18));
    const hair = felt('#4a2f22');
    this.hair = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 1.6 + Math.PI * 0.7; head.add(sph(0.12, hair, Math.cos(a) * 0.33, 0.12 + Math.sin(i) * 0.04, Math.sin(a) * 0.3 - 0.05, [1, 1, 1], 8)); this.hair.push(head.children[head.children.length - 1]); }
    this.eyes = [eye(), eye()];
    this.eyes[0].position.set(-0.14, 0.03, 0.35); this.eyes[1].position.set(0.14, 0.03, 0.35);
    head.add(...this.eyes);
    for (const s of [-1, 1]) head.add(sph(0.06, felt('#f29a8e'), s * 0.24, -0.08, 0.31, [1, 0.6, 0.4], 8));
    const mouthGeo = new THREE.TorusGeometry(0.06, 0.016, 4, 10, Math.PI);
    this.mouth = mesh(mouthGeo, mat('#7a2e25')); this.mouth.position.set(0, -0.13, 0.37); this.mouth.rotation.z = Math.PI; head.add(this.mouth);
    // petasos with wings
    const hat = new THREE.Group(); hat.position.y = 0.26;
    hat.add(mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.05, 20), felt('#d9b46b')));
    hat.add(sph(0.33, felt('#d9b46b'), 0, 0.02, 0, [1, 0.7, 1], 14));
    this.hatWings = [];
    for (const s of [-1, 1]) { const w = wing('#ffffff', 4, 0.36); w.position.set(s * 0.3, 0.1, 0); w.scale.x = s; hat.add(w); this.hatWings.push(w); }
    head.add(hat); this.hat = hat;

    // state ring and thought dots
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: STATE_COLORS.idle, transparent: true, opacity: 0.85 }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.06; g.add(this.ring);
    this.dots = new THREE.Group(); this.dots.position.y = 2.45;
    for (let i = 0; i < 3; i++) this.dots.add(sph(0.08 + i * 0.03, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0, 0, 0, [1, 1, 1], 8));
    g.add(this.dots);
    // a little storm cloud for errors
    this.storm = new THREE.Group(); this.storm.position.y = 2.8;
    for (let i = 0; i < 4; i++) this.storm.add(sph(0.22, mat('#6d6f7c'), (i - 1.5) * 0.24, Math.sin(i * 2) * 0.06, 0, [1, 0.8, 0.8], 8));
    g.add(this.storm);
    // the scroll he carries when delivering
    this.scroll = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#fff3c9', emissive: '#ffd966', emissiveIntensity: 0.6 }));
    this.scroll.rotation.z = Math.PI / 2; this.scroll.position.set(0, -0.48, 0.1); this.arms[1].add(this.scroll);

    g.scale.setScalar(1.35);
    g.traverse((o) => { if (o.isMesh) o.userData.messenger = this; });
    scene.add(g);

    this.anchor = new THREE.Object3D(); this.anchor.position.y = 2.6; g.add(this.anchor);
    this.state = 'idle';
    this.flight = null;
    this.target = null;
    this.home = new THREE.Vector3();
    this.heading = 0;
    this.blinkT = 2;
    this.workAt = null;
    this.onArrive = null;
  }

  // Cozy-village persona: a felt fox postmaster, like the original video's assistant.
  foxify() {
    this.skinMat.color.set('#e8792f'); this.skinMat.sheenColor.set('#ffb070').multiplyScalar(0.6);
    this.tunicMat.color.set('#2f5fa8');
    this.cape.visible = false; this.caduceus.visible = false; this.hat.visible = false;
    for (const h of this.hair) h.visible = false;
    for (const l of this.legs) l.userData.wing.visible = false;
    const white = felt('#fbf3e6'), dark = felt('#3a2a22'), navy = felt('#22345e');
    const h = this.head;
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.14, 0.32, 5), this.skinMat); ear.position.set(s * 0.24, 0.36, -0.02); ear.rotation.z = -s * 0.35; h.add(ear);
      const tip = mesh(new THREE.ConeGeometry(0.06, 0.12, 5), dark); tip.position.set(s * 0.3, 0.5, -0.02); tip.rotation.z = -s * 0.35; h.add(tip);
      h.add(sph(0.13, white, s * 0.17, -0.12, 0.27, [1, 0.8, 0.7], 10));
    }
    h.add(sph(0.12, white, 0, -0.1, 0.36, [1, 0.75, 1], 10));
    h.add(sph(0.05, dark, 0, -0.04, 0.47, [1.2, 0.8, 1], 8));
    this.mouth.position.set(0, -0.17, 0.43);
    for (const e of this.eyes) e.position.z = 0.36;
    const cap = new THREE.Group(); cap.position.set(0, 0.3, 0.02); cap.rotation.x = -0.15;
    cap.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 16), navy));
    const brim = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), dark); brim.position.set(0, -0.08, 0.2); cap.add(brim);
    const badge = mesh(new THREE.CircleGeometry(0.06, 10), mat('#e2b440', { metalness: 0.5, roughness: 0.4 })); badge.position.set(0, 0.0, 0.31); cap.add(badge);
    h.add(cap);
    const tail = new THREE.Group(); tail.position.set(0, 0.62, -0.32); tail.rotation.x = -0.9;
    tail.add(sph(0.2, this.skinMat, 0, 0.3, 0, [0.9, 1.9, 0.9], 12));
    tail.add(sph(0.12, white, 0, 0.66, 0, [1, 1.2, 1], 10));
    this.body.add(tail); this.tail = tail;
    this.group.traverse((o) => { if (o.isMesh) o.userData.messenger = this; });
  }

  setHome(v) { this.home.copy(v); if (!this.flight) this.group.position.copy(v); }

  setState(state) {
    this.state = state;
    this.ring.material.color.set(STATE_COLORS[state] || STATE_COLORS.idle);
  }

  // Fly along an arc to `to` (world position on the ground).
  flyTo(to, onArrive) {
    const from = this.group.position.clone();
    if (from.distanceTo(to) < 0.3) { this.flight = null; onArrive?.(); return; }
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.max(from.y, to.y) + 3 + from.distanceTo(to) * 0.18;
    this.flight = { curve: new THREE.QuadraticBezierCurve3(from, mid, to.clone()), t: 0, dur: 0.9 + from.distanceTo(to) / 13 };
    this.onArrive = onArrive;
  }

  get flying() { return Boolean(this.flight); }

  update(dt, t) {
    const g = this.group, p = g.position;
    let moving = false;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = easeInOut(f.t);
      const next = f.curve.getPoint(k);
      const dir = next.clone().sub(p);
      if (dir.lengthSq() > 1e-6) { this.heading = Math.atan2(dir.x, dir.z); moving = true; }
      p.copy(next);
      if (f.t >= 1) { this.flight = null; const cb = this.onArrive; this.onArrive = null; cb?.(); }
    }
    // face direction: travel heading while flying, towards the camera-ish outward when idle
    const want = moving ? this.heading : this.idleHeading ?? this.heading;
    let d = want - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, dt * 6);

    const s = this.state;
    const working = s === 'tool' && !this.flight;
    // body pose
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, moving ? 0.55 : 0, 6, dt);
    const hover = moving ? 0 : (this.grounded ? 0 : 0.25 + Math.sin(t * 2.2) * 0.12);
    this.body.position.y = THREE.MathUtils.damp(this.body.position.y, hover, 5, dt);
    const flap = moving ? 22 : 6;
    for (const w of this.hatWings) w.rotation.z = Math.sin(t * flap) * (moving ? 0.5 : 0.18);
    for (const l of this.legs) l.userData.wing.rotation.z = Math.sin(t * flap + 1) * (moving ? 0.6 : 0.2);
    this.legs[0].rotation.x = moving ? 0.7 : Math.sin(t * 2) * 0.05;
    this.legs[1].rotation.x = moving ? 0.9 : -Math.sin(t * 2) * 0.05;
    if (working) {
      this.arms[1].rotation.x = -1.2 + Math.sin(t * 14) * 0.6;
      this.arms[0].rotation.x = -0.4 + Math.sin(t * 14 + 1) * 0.2;
    } else if (s === 'speaking') {
      this.arms[1].rotation.x = -1.6 + Math.sin(t * 3) * 0.3; this.arms[0].rotation.x = 0;
    } else {
      this.arms[0].rotation.x = moving ? 0.6 : 0; this.arms[1].rotation.x = moving ? 0.6 : Math.sin(t * 1.5) * 0.08;
    }
    this.cape.rotation.x = moving ? -0.5 : Math.sin(t * 1.7) * 0.05;
    if (this.tail) this.tail.rotation.z = Math.sin(t * (moving ? 9 : 2.5)) * 0.35;
    this.head.rotation.z = s === 'thinking' ? Math.sin(t * 1.2) * 0.15 : 0;
    this.head.rotation.x = s === 'thinking' ? -0.2 : 0;
    // mouth: open-close while speaking, frown on error
    const talk = s === 'speaking' ? 0.5 + Math.abs(Math.sin(t * 11)) * 0.9 : 1;
    this.mouth.scale.set(1, talk, 1);
    this.mouth.rotation.z = s === 'error' ? 0 : Math.PI;
    // blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.1 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = blink;

    this.dots.visible = s === 'thinking';
    if (this.dots.visible) this.dots.children.forEach((c, i) => { const a = t * 3 + i * 2.1; c.position.set(Math.cos(a) * 0.45, Math.sin(t * 4 + i) * 0.1 + i * 0.12, Math.sin(a) * 0.45); });
    this.storm.visible = s === 'error';
    if (this.storm.visible) this.storm.position.x = Math.sin(t * 2) * 0.1;
    this.scroll.visible = s === 'speaking' || (moving && this.carrying);
    this.ring.scale.setScalar(1 + Math.sin(t * 4) * (s === 'idle' ? 0.02 : 0.08));
    this.ring.visible = !moving;
  }
}

// ================================================================= residents
const SPECIES = {
  owl(g) {
    const brown = felt('#8a5a3c', '#d6b08c'), belly = felt('#e8d4b0');
    g.add(sph(0.42, brown, 0, 0.5, 0, [1, 1.15, 0.95]));
    g.add(sph(0.3, belly, 0, 0.45, 0.17, [1, 1.1, 0.7]));
    for (const s of [-1, 1]) {
      g.add(sph(0.14, felt('#fffaf0'), s * 0.15, 0.68, 0.33, [1, 1, 0.4], 10));
      const e = eye(0.075); e.position.set(s * 0.15, 0.68, 0.39); g.add(e);
      const tuft = mesh(new THREE.ConeGeometry(0.07, 0.2, 5), brown); tuft.position.set(s * 0.25, 0.98, 0); tuft.rotation.z = -s * 0.4; g.add(tuft);
      g.add(sph(0.16, brown, s * 0.4, 0.45, -0.02, [0.5, 1.2, 0.9], 10));
      g.add(sph(0.06, felt('#e9a33b'), s * 0.12, 0.05, 0.15, [1.2, 0.5, 1.4], 6));
    }
    const beak = mesh(new THREE.ConeGeometry(0.06, 0.14, 4), felt('#e9a33b')); beak.rotation.x = Math.PI / 2 + 0.6; beak.position.set(0, 0.56, 0.42); g.add(beak);
    return 1.15;
  },
  tortoise(g) {
    const shell = felt('#5f8f4e', '#c4e3a2'), skin = felt('#a8b57a');
    g.add(sph(0.5, shell, 0, 0.28, 0, [1, 0.75, 1.1], 12));
    const rim = mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 14), felt('#d9c38d')); rim.position.y = 0.18; g.add(rim);
    const head = new THREE.Group(); head.position.set(0, 0.42, 0.55);
    head.add(sph(0.2, skin, 0, 0, 0, [1, 0.95, 1.1]));
    for (const s of [-1, 1]) { const e = eye(0.045); e.position.set(s * 0.09, 0.06, 0.17); head.add(e); }
    g.add(head);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(sph(0.11, skin, x * 0.33, 0.1, z * 0.35, [1, 1, 1], 8));
    g.add(sph(0.12, felt('#d9534f'), 0, 0.62, 0.05, [1.6, 0.3, 1], 8)); // tiny red cap
    return 0.95;
  },
  ram(g) {
    const wool = felt('#f4f1ea'), face = felt('#4a4442'), horn = felt('#d8b98a');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(sph(0.24, wool, Math.cos(a) * 0.22, 0.52 + Math.sin(i * 1.7) * 0.06, Math.sin(a) * 0.26)); }
    g.add(sph(0.3, wool, 0, 0.62, 0));
    const head = new THREE.Group(); head.position.set(0, 0.68, 0.38);
    head.add(sph(0.2, face, 0, 0, 0, [0.9, 1, 1.1]));
    for (const s of [-1, 1]) {
      const e = eye(0.05); e.position.set(s * 0.09, 0.04, 0.18); head.add(e);
      const h = mesh(new THREE.TorusGeometry(0.11, 0.045, 6, 12, Math.PI * 1.6), horn); h.position.set(s * 0.2, 0.06, -0.04); h.rotation.y = Math.PI / 2; head.add(h);
    }
    g.add(head);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), face); l.position.set(x * 0.18, 0.15, z * 0.18); g.add(l); }
    return 1.05;
  },
  rooster(g) {
    const white = felt('#fbf7ef'), red = felt('#d9382c'), yellow = felt('#f0b437');
    g.add(sph(0.33, white, 0, 0.55, 0, [0.95, 1, 1.15]));
    const head = new THREE.Group(); head.position.set(0, 0.9, 0.18);
    head.add(sph(0.18, white));
    for (let i = 0; i < 3; i++) head.add(sph(0.06, red, 0, 0.17 + (i === 1 ? 0.03 : 0), -0.06 + i * 0.07, [0.6, 1, 1], 6));
    for (const s of [-1, 1]) { const e = eye(0.04); e.position.set(s * 0.09, 0.03, 0.14); head.add(e); }
    const beak = mesh(new THREE.ConeGeometry(0.05, 0.12, 4), yellow); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.01, 0.2); head.add(beak);
    head.add(sph(0.04, red, 0, -0.09, 0.15, [1, 1.4, 1], 6));
    g.add(head);
    const tailCols = ['#1f5a46', '#2c3e7a', '#d9382c'];
    for (let i = 0; i < 3; i++) { const f = mesh(new THREE.ConeGeometry(0.08, 0.5, 5), felt(tailCols[i])); f.position.set((i - 1) * 0.1, 0.8, -0.35); f.rotation.x = -0.7 - i * 0.15; g.add(f); }
    for (const s of [-1, 1]) { const l = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), yellow); l.position.set(s * 0.1, 0.15, 0); g.add(l); }
    return 1.2;
  },
};
export const SPECIES_LIST = Object.keys(SPECIES);
// World packs (kitworld.js) add their own residents; they are not in SPECIES_LIST, so Olympus never picks them.
export function registerSpecies(name, build) { SPECIES[name] = build; }

export class Resident {
  static all = new Set(); // everyone on the island, so strollers don't pick the same spot

  constructor(scene, { id, name, species, home, world }) {
    this.id = id; this.name = name; this.species = species;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); this.group.add(this.body);
    const h = (SPECIES[species] || SPECIES.owl)(this.body);
    this.anchor = new THREE.Object3D(); this.anchor.position.y = h + 0.35; this.group.add(this.anchor);
    this.size = 1.5; this.grow = 1; // grow: 0..1 while stepping out of a door or going in
    this.group.scale.setScalar(this.size);
    this.group.traverse((o) => { if (o.isMesh) o.userData.resident = this; });
    scene.add(this.group); Resident.all.add(this);
    this.world = world;
    this.home = home.clone();
    this.group.position.copy(home);
    this.state = 'idle';
    this.walk = null;
    this.pause = Math.random() * 3;
    this.R = rng(id.length * 31 + name.length);
    this.workSpot = null;
    this.storm = new THREE.Group(); this.storm.position.y = h + 0.5;
    for (let i = 0; i < 3; i++) this.storm.add(sph(0.16, mat('#6d6f7c'), (i - 1) * 0.18, 0, 0, [1, 0.8, 0.8], 8));
    this.storm.visible = false; this.group.add(this.storm);
    // needs-you marker: a glowing "!" that bobs over the head (red = asking, amber = maybe stuck)
    this.alertMat = new THREE.MeshBasicMaterial({ color: '#ff4b3a', toneMapped: false });
    this.alert = new THREE.Group(); this.alert.position.y = h + 0.75;
    const bar = mesh(new THREE.CapsuleGeometry(0.07, 0.26, 4, 8), this.alertMat); bar.position.y = 0.22; bar.castShadow = false;
    const dot = sph(0.08, this.alertMat, 0, -0.06, 0, [1, 1, 1], 8); dot.castShadow = false;
    this.alert.add(bar, dot); this.alert.visible = false; this.group.add(this.alert);
    this.alert.traverse((o) => { if (o.isMesh) o.userData.resident = this; });
  }

  // kind: 'asking' | 'stuck' | null
  setNeeds(kind) { this.needs = kind || null; if (kind) this.alertMat.color.set(kind === 'stuck' ? '#f0a236' : '#ff4b3a'); }

  setState(state, workSpot) {
    if (state === this.state) {
      // same state, new place to be (a working thread switched tools): head there next
      if (workSpot && (!this.workSpot || this.workSpot.distanceTo(workSpot) > 0.5)) { this.workSpot = workSpot.clone(); this.pause = 0; }
      if (!workSpot) this.workSpot = null;
      return;
    }
    this.state = state; this.workSpot = workSpot ? workSpot.clone() : null;
    this.walk = null; this.pause = 0; this.activity = null; this.pose = null;
    // called back to work (or needs you) halfway up the mountain: the delivery is dropped
    if (this.route && (state === 'working' || state === 'waiting')) { this.route = null; this.drop(); }
  }

  // At a project station (stations.js): which way the bench is and how the job moves (hammer, read, knead...).
  // null when not at one.
  setWork(face, motion) { this.workFace = face ?? null; this.motion = motion || null; }

  // Something held up over the head (a finished piece on its way to the Acropolis)
  carry(obj) { this.drop(); this.held = obj; obj.position.set(0, this.anchor.position.y - 0.3, 0); this.group.add(obj); }
  drop() { if (this.held) { this.group.remove(this.held); this.held.traverse((o) => o.geometry?.dispose()); this.held = null; } }

  // Walk a set route (points on the ground, e.g. up the mountain path and back) at `speed`, then onEnd().
  // Nothing else moves it meanwhile, except being called back to work.
  followRoute(points, speed, onEnd) { this.route = { pts: points, i: 0, speed, onEnd }; this.walk = null; this.pose = null; this.activity = null; }

  // Somebody is standing at or heading for (x, z)
  static taken(x, z, self) {
    return [...Resident.all].some((o) => o !== self && !o.leaving && (Math.hypot(o.group.position.x - x, o.group.position.z - z) < 0.9
      || (o.target && Math.hypot(o.target.x - x, o.target.z - z) < 0.9)));
  }

  // helpers trail the thread that started them
  setFollow(leader) { this.follow = leader || null; }

  // A newcomer steps out of `from` (its building's door, or beside its thread) and grows to full size.
  appear(from) { if (from) this.group.position.set(from.x, groundY(from.x, from.z), from.z); this.grow = 0; }

  // Going inside (a day without work), checking out, or a finished helper: walk to `door` (or stay put when
  // null), shrink away, then `gone` is set for the caller to remove it. Coming back cancels it.
  leave(door) { if (!this.leaving) { this.leaving = { door: door ? door.clone() : null, age: 0 }; this.walk = null; this.follow = null; this.pause = 0; } }
  stay() { if (this.leaving) { this.leaving = null; this.grow = Math.max(this.grow, 0.01); } }
  dispose(scene) { scene.remove(this.group); Resident.all.delete(this); }

  // idle characters potter about close to home rather than roaming the island, on open ground and not
  // where someone else is already standing or heading
  pickWander() {
    for (let i = 0; i < 20; i++) {
      const a = this.R() * Math.PI * 2, r = 0.8 + this.R() * 2.6;
      const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
      if (walkable(x, z) && !Resident.taken(x, z, this)) return new THREE.Vector3(x, 0, z);
    }
    return this.home.clone();
  }

  // Walk in polar space so paths curve around the mountain instead of through it. A trip that goes some way
  // around the island and starts or ends out past the ring road follows the road: out to it, along it, then
  // in, so nobody wades through the pond or walks through a building. Errands (work, needs you) take at most
  // `maxDur` seconds however far they are: the character hurries rather than dawdling for half a minute.
  walkTo(to, speed = 1.3, maxDur = Infinity) {
    const from = this.group.position.clone();
    const r0 = Math.hypot(from.x, from.z), a0 = Math.atan2(from.z, from.x);
    const r1 = Math.hypot(to.x, to.z); let a1 = Math.atan2(to.z, to.x);
    let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
    const leg = (ra, rb, a, d) => ({ r0: ra, r1: rb, a0: a, da: d, len: Math.abs(d) * (ra + rb) / 2 + Math.abs(rb - ra) });
    const road = LAYOUT.ringRoad;
    const legs = Math.max(r0, r1) > road + 1 && Math.abs(da) > 0.35
      ? [leg(r0, road, a0, 0), leg(road, road, a0, da), leg(road, r1, a0 + da, 0)] : [leg(r0, r1, a0, da)];
    const net = LAYOUT.paths && graphLegs(LAYOUT.paths, from, to); // a map world's own walkways
    const all = net || legs;
    const len = all.reduce((n, l) => n + l.len, 0);
    this.walk = { legs: all, len, t: 0, dur: Math.max(0.4, len / 7, Math.min(len / speed, maxDur)) };
    this.target = to.clone();
  }

  turnTo(heading, dt) {
    if (heading == null) return;
    let d = heading - this.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, dt * 5);
  }

  // How each job moves at the bench (stations.js / jobs.js motion)
  workMotion(t) {
    const b = this.body, k = (t * 2.2 + (this.id.length % 7) * 0.13) % 1;
    switch (this.motion) {
      case 'hammer': b.rotation.x = k < 0.7 ? -0.12 * (k / 0.7) : 0.28; b.position.y = k < 0.7 ? 0.04 : 0; break;
      case 'read': b.rotation.x = 0.12 + Math.sin(t * 0.9) * 0.05; b.rotation.y = Math.sin(t * 0.5) * 0.15; break;
      case 'knead': b.rotation.x = 0.12; b.scale.y = 1 - Math.abs(Math.sin(t * 4)) * 0.1; break;
      case 'paint': b.rotation.z = Math.sin(t * 2.4) * 0.14; b.rotation.x = 0.05; break;
      case 'pluck': b.rotation.z = Math.sin(t * 5) * 0.05; b.position.y = Math.abs(Math.sin(t * 5)) * 0.03; b.rotation.x = 0.15; break;
      case 'gaze': b.rotation.x = -0.3; b.rotation.y = Math.sin(t * 0.4) * 0.3; break;
      case 'write': b.rotation.x = 0.12 + Math.sin(t * 6) * 0.03; break;
      case 'spin': b.rotation.x = 0.1; b.position.y = Math.abs(Math.sin(t * 8)) * 0.02; break;
      case 'saw': b.rotation.x = 0.08; b.position.z = Math.sin(t * 5) * 0.08; break;
      default: b.position.y = Math.abs(Math.sin(t * 6)) * 0.08;
    }
  }

  // What it does at a place in town (town.js ACTIVITIES pose)
  posed(t) {
    const b = this.body;
    switch (this.pose) {
      case 'fish': {
        if (!this.rod) {
          this.rod = new THREE.Group(); this.rod.position.set(0.2, 0.5, 0.2); this.rod.rotation.x = 0.7;
          this.rod.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.3, 5), mat('#8a5a35')).translateY(0.65));
          const line = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 3), mat('#f4f1ea')); line.position.set(0, 1.3, 0.25); line.rotation.x = -0.9; this.rod.add(line);
          this.body.add(this.rod);
        }
        this.rod.visible = true; this.rod.rotation.x = 0.7 + Math.sin(t * 1.3) * 0.05;
        b.position.y = -0.06; b.rotation.x = 0.12; break;
      }
      case 'read': b.rotation.x = -0.14 + Math.sin(t * 0.8) * 0.04; break;
      case 'browse': b.rotation.y = Math.sin(t * 0.6) * 0.5; break;
      case 'watch': b.position.y = Math.max(0, Math.sin(t * 2.2)) ** 8 * 0.14; break;
      case 'chat': b.rotation.z = Math.sin(t * 3) * 0.1; b.position.y = Math.abs(Math.sin(t * 3)) * 0.04; break;
      case 'gaze': b.rotation.x = -0.15; break;
      default: break;
    }
  }

  // standing where it was heading (for cast.js settleDestination)
  arrived() { return !this.walk && !!this.workSpot && this.group.position.distanceTo(this.workSpot) < 0.8; }

  update(dt, t) {
    const p = this.group.position;
    if (this.grow < 1 && !this.leaving) { this.grow = Math.min(1, this.grow + dt / 0.5); this.group.scale.setScalar(this.size * easeInOut(this.grow)); }
    if (this.leaving) {
      const L = this.leaving; L.age += dt;
      const there = !L.door || Math.hypot(p.x - L.door.x, p.z - L.door.z) < 0.5;
      if (!there && !this.walk && L.age < 12) this.walkTo(L.door, 2.4, 6);
      if ((there && !this.walk) || L.age >= 12) { this.grow = Math.max(0, this.grow - dt / 0.4); this.group.scale.setScalar(this.size * this.grow); if (!this.grow) this.gone = true; }
    }
    if (this.route && !this.leaving) {
      // a set route (up the mountain with a finished piece): steady steps from point to point
      // (a point may hold it there a moment, `wait` s, and say when it got there, onReach)
      const R = this.route; let left = R.hold > 0 ? 0 : R.speed * dt;
      if (R.hold > 0) R.hold -= dt;
      while (left > 0 && R.i < R.pts.length) {
        const q = R.pts[R.i], d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d <= left) { p.x = q.x; p.z = q.z; left -= d; R.i++; if (q.wait || q.onReach) { R.hold = q.wait || 0; q.onReach?.(); break; } }
        else { p.x += ((q.x - p.x) / d) * left; p.z += ((q.z - p.z) / d) * left; left = 0;
          let h = Math.atan2(q.x - p.x, q.z - p.z) - this.group.rotation.y; h = Math.atan2(Math.sin(h), Math.cos(h)); this.group.rotation.y += h * Math.min(1, dt * 8); }
      }
      p.y = groundY(p.x, p.z);
      this.body.position.y = Math.abs(Math.sin(t * 11)) * 0.12; this.body.rotation.z = Math.sin(t * 11) * 0.08;
      if (this.held) this.held.position.y = this.anchor.position.y - 0.3 + Math.abs(Math.sin(t * 11)) * 0.05;
      if (R.i >= R.pts.length) { this.route = null; this.pause = 1; R.onEnd?.(); }
    } else if (this.walk) {
      const w = this.walk; w.t = Math.min(1, w.t + dt / w.dur);
      let s = w.t * w.len, l = w.legs[0];
      for (const x of w.legs) { l = x; if (s <= x.len) break; s -= x.len; }
      const u = l.len ? Math.min(1, s / l.len) : 1;
      let nx, nz;
      if (l.p0) { nx = l.p0.x + (l.p1.x - l.p0.x) * u; nz = l.p0.z + (l.p1.z - l.p0.z) * u; } // straight leg along a walkway
      else { const r = l.r0 + (l.r1 - l.r0) * u, a = l.a0 + l.da * u; nx = Math.cos(a) * r; nz = Math.sin(a) * r; }
      const head = Math.atan2(nx - p.x, nz - p.z);
      if (Math.hypot(nx - p.x, nz - p.z) > 1e-4) {
        let d = head - this.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.group.rotation.y += d * Math.min(1, dt * 8);
      }
      p.set(nx, groundY(nx, nz), nz);
      this.body.position.y = Math.abs(Math.sin(t * 11)) * 0.12;
      this.body.rotation.z = Math.sin(t * 11) * 0.08;
      // finished strollers linger 4-12 s; tourists resting between their first and second quiet day, 15-40 s
      if (w.t >= 1) {
        this.walk = null; this.pause = this.state === 'idle' ? 4 + this.R() * 8 : this.state === 'sleeping' ? 15 + this.R() * 25 : 1 + this.R() * 2;
        // arrived somewhere in town (town.js): stay for the activity, doing what the place is for
        if (this.activity && (this.state === 'idle' || this.state === 'sleeping')) { this.pause = this.activity.dur; this.pose = this.activity.pose; }
      }
    } else {
      this.body.position.y = THREE.MathUtils.damp(this.body.position.y, 0, 8, dt);
      this.body.rotation.z = 0;
      this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, 0, 8, dt);
      this.body.rotation.y = THREE.MathUtils.damp(this.body.rotation.y, 0, 6, dt);
      this.body.position.z = 0; this.body.scale.y = 1;
      if (this.rod) this.rod.visible = false;
      this.pause -= dt;
      if (this.leaving) { /* on its way in (above) */ }
      else if (this.follow) {
        // trail a step behind the leader
        const lp = this.follow.group.position, behind = new THREE.Vector3(Math.sin(this.follow.group.rotation.y), 0, Math.cos(this.follow.group.rotation.y)).multiplyScalar(-1.3);
        const side = new THREE.Vector3(behind.z, 0, -behind.x).multiplyScalar(((this.id.length % 3) - 1) * 0.6);
        const target = lp.clone().add(behind).add(side);
        if (this.state === 'working') this.body.position.y = Math.abs(Math.sin(t * 6)) * 0.08;
        if (p.distanceTo(target) > 1.2 && this.pause < 0) this.walkTo(target, 3.2);
      } else if (this.state === 'waiting') {
        // head back to its own door, then hop and sway like waving for attention
        if (this.workSpot && p.distanceTo(this.workSpot) > 0.6 && this.pause < 0) this.walkTo(this.workSpot, 2.6, 7);
        else {
          this.body.position.y = Math.max(0, Math.sin(t * 5)) * 0.18;
          this.body.rotation.z = Math.sin(t * 9) * 0.22;
        }
      } else if (this.state === 'working') {
        const there = !this.workSpot || p.distanceTo(this.workSpot) <= 0.6;
        if (!there && this.pause < 0) this.walkTo(this.workSpot, 2.2, 8);
        else if (there && this.motion) { this.turnTo(this.workFace, dt); this.workMotion(t); } // at its station's bench
        else this.body.position.y = Math.abs(Math.sin(t * 6)) * 0.08; // busy bounce
      } else if (this.pause < 0) {
        // the next thing to do in town (town.js), or a stroll near home
        this.pose = null; this.activity = this.town?.(this) || null;
        this.walkTo(this.activity ? this.activity.at : this.pickWander(), this.state === 'sleeping' ? (this.activity ? 1.1 : 0.8) : this.activity ? 1.7 : 1.3);
      } else if (this.pose) { this.turnTo(this.activity?.face, dt); this.posed(t); }
    }
    this.storm.visible = this.state === 'error';
    this.alert.visible = this.state === 'waiting';
    if (this.alert.visible) { this.alert.position.y = this.anchor.position.y + 0.4 + Math.sin(t * 4) * 0.08; this.alert.rotation.y = t * 1.5; }
  }
}

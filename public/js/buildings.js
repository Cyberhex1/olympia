// Low-poly Greek buildings. Each factory returns a Building with anchors
// (door, top, chimney) and hooks for night lighting and "busy" effects.
import * as THREE from 'three';
import { mat, mesh, rng } from './util.js';

const MARBLE = '#f1ece2', MARBLE2 = '#e4ddcf', TERRA = '#c8643b', TERRA2 = '#b5562f', BLUE = '#2f6db5', GOLD = '#e2b440', STONE = '#a49a8e', WOOD = '#8a5a35';

function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color, opts) : color);
  m.position.set(x, y + h / 2, z); return m;
}
function cyl(rt, rb, h, color, seg = 10, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y + h / 2, z); return m;
}
function column(h, r = 0.2, color = MARBLE) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.35, r * 1.35, 0.14, color, 8, 0, 0));
  g.add(cyl(r * 0.88, r, h - 0.28, color, 10, 0, 0.14));
  g.add(box(r * 2.9, 0.14, r * 2.9, color, 0, h - 0.14));
  return g;
}
// Triangular prism roof: width along x, depth along z, peak height h.
function gable(w, h, d, color) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  return mesh(g, mat(color));
}
function roofSlabs(w, h, d, color) {
  const g = new THREE.Group(), slope = Math.hypot(w / 2, h), ang = Math.atan2(h, w / 2);
  for (const side of [-1, 1]) {
    const m = mesh(new THREE.BoxGeometry(slope + 0.25, 0.14, d + 0.3), mat(color));
    m.position.set(side * w / 4, h / 2 + 0.06, 0); m.rotation.z = -side * ang; g.add(m);
  }
  return g;
}
function steps(w, d, n = 3, color = MARBLE2, rise = 0.22, inset = 0.3) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(box(w - i * inset * 2, rise, d - i * inset * 2, color, 0, i * rise));
  return { group: g, top: n * rise };
}
function roundSteps(r, n = 3, color = MARBLE2, rise = 0.22) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(cyl(r - i * 0.3, r - i * 0.3, rise, color, 24, 0, i * rise));
  return { group: g, top: n * rise };
}
function windowPane(w, h, glow) { const m = mesh(new THREE.PlaneGeometry(w, h), glow, { cast: false }); return m; }

// A brazier: lit when the building is busy.
function brazier() {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.12, 0.8, '#4d4540', 6));
  g.add(cyl(0.32, 0.18, 0.22, '#5a504a', 8, 0, 0.8));
  const flameMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: 2.2, flatShading: true });
  const flame = mesh(new THREE.ConeGeometry(0.2, 0.55, 6), flameMat, { cast: false });
  flame.position.y = 1.28; g.add(flame);
  g.userData.flame = flame;
  return g;
}

class Building {
  constructor(style) {
    this.style = style;
    this.group = new THREE.Group();
    this.body = new THREE.Group();          // shaken on stalls
    this.group.add(this.body);
    this.glow = new THREE.MeshStandardMaterial({ color: '#3a3a48', emissive: '#ffcf73', emissiveIntensity: 0, roughness: 0.6 });
    this.anchors = { door: new THREE.Vector3(0, 0, 2.6), top: new THREE.Vector3(0, 4, 0), chimney: null };
    this.braziers = [];
    this.active = 0;      // 0..1 busy level
    this.shake = 0;
    this.flash = 0;
    this.extra = [];
  }
  addBrazier(x, z) { const b = brazier(); b.position.set(x, 0, z); this.body.add(b); this.braziers.push(b); }
  setNight(n) { this.night = n; }
  update(dt, t) {
    const lit = Math.max(this.night || 0, this.active * 0.7) + this.flash;
    this.glow.emissiveIntensity = THREE.MathUtils.damp(this.glow.emissiveIntensity, lit * 2.6, 4, dt);
    this.glow.color.set(lit > 0.2 ? '#6b5636' : '#3a3a48');
    for (const b of this.braziers) {
      const f = b.userData.flame, on = this.active > 0.05 || (this.night || 0) > 0.5;
      f.visible = on;
      if (on) { f.scale.set(1, 0.85 + Math.sin(t * 13 + b.id) * 0.15 + Math.random() * 0.1, 1); }
    }
    this.flash = Math.max(0, this.flash - dt * 0.8);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.body.position.set((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12);
      this.body.rotation.z = (Math.random() - 0.5) * 0.02;
    } else { this.body.position.set(0, 0, 0); this.body.rotation.z = 0; }
    for (const f of this.extra) f(dt, t, this);
  }
}

// ---------------------------------------------------------------- styles
const STYLES = {
  temple(b) {
    const s = steps(6.2, 4.6, 3); b.body.add(s.group);
    const y0 = s.top, h = 2.6;
    const xs = [-2.45, -1.47, -0.49, 0.49, 1.47, 2.45];
    for (const x of xs) for (const z of [-1.75, 1.75]) { const c = column(h); c.position.set(x, y0, z); b.body.add(c); }
    for (const z of [-0.6, 0.6]) for (const x of [-2.45, 2.45]) { const c = column(h); c.position.set(x, y0, z); b.body.add(c); }
    b.body.add(box(3.4, h, 2.2, MARBLE2, 0, y0, -0.1));
    const door = box(0.9, 1.7, 0.05, '#4a3826', 0, y0, 1.01); b.body.add(door);
    const win = windowPane(0.85, 1.6, b.glow); win.position.set(0, y0 + 0.85, 1.04); b.body.add(win);
    b.body.add(box(5.6, 0.32, 4.1, MARBLE, 0, y0 + h));
    b.body.add(box(5.6, 0.3, 4.1, BLUE, 0, y0 + h + 0.32));
    const ped = gable(5.6, 1.05, 4.1, MARBLE); ped.position.y = y0 + h + 0.62; b.body.add(ped);
    const rs = roofSlabs(5.6, 1.05, 4.1, TERRA); rs.position.y = y0 + h + 0.62; b.body.add(rs);
    // golden winged emblem on the pediment
    const emblem = new THREE.Group();
    emblem.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(GOLD, { metalness: 0.6, roughness: 0.35 })));
    for (const sd of [-1, 1]) {
      const w = mesh(new THREE.ConeGeometry(0.16, 0.7, 4), mat(GOLD, { metalness: 0.6, roughness: 0.35 }));
      w.rotation.z = sd * 1.25; w.position.x = sd * 0.38; emblem.add(w);
    }
    emblem.position.set(0, y0 + h + 0.98, 2.08); b.body.add(emblem);
    const acro = mesh(new THREE.OctahedronGeometry(0.22), mat(GOLD, { metalness: 0.6, roughness: 0.35 })); acro.position.set(0, y0 + h + 1.85, 2.0); b.body.add(acro);
    b.addBrazier(-1.9, 2.75); b.addBrazier(1.9, 2.75);
    b.anchors.door.set(0, y0, 2.9); b.anchors.top.set(0, y0 + h + 2.4, 0);
  },

  tholos(b, o = {}) {
    const s = roundSteps(2.5, 3); b.body.add(s.group);
    const y0 = s.top, h = 2.3;
    for (let i = 0; i < 10; i++) { const th = (i / 10) * Math.PI * 2; const c = column(h, 0.17); c.position.set(Math.cos(th) * 1.85, y0, Math.sin(th) * 1.85); b.body.add(c); }
    b.body.add(cyl(1.25, 1.25, h, MARBLE2, 16, 0, y0));
    const win = windowPane(0.7, 1.5, b.glow); win.position.set(0, y0 + 0.8, 1.27); b.body.add(win);
    b.body.add(cyl(2.15, 2.15, 0.3, o.band || MARBLE, 20, 0, y0 + h));
    if (o.dome) {
      const d = mesh(new THREE.SphereGeometry(2.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(o.dome)); d.position.y = y0 + h + 0.3; b.body.add(d);
    } else {
      b.body.add(cyl(0.05, 2.35, 1.3, o.roof || TERRA, 16, 0, y0 + h + 0.3));
    }
    const fin = mesh(new THREE.OctahedronGeometry(0.2), mat(GOLD, { metalness: 0.6, roughness: 0.35 })); fin.position.y = y0 + h + 2.15; b.body.add(fin);
    b.addBrazier(1.2, 2.7);
    b.anchors.door.set(0, 0, 3.1); b.anchors.top.set(0, y0 + h + 2.6, 0);
  },

  stoa(b) {
    const s = steps(6.6, 3.2, 2); b.body.add(s.group);
    const y0 = s.top, h = 2.3;
    b.body.add(box(6.2, h, 0.6, MARBLE2, 0, y0, -1.1));
    for (let i = 0; i < 7; i++) { const c = column(h, 0.17); c.position.set(-2.8 + i * 0.933, y0, 1.1); b.body.add(c); }
    for (const x of [-2.4, -0.8, 0.8, 2.4]) { const w = windowPane(0.6, 1.2, b.glow); w.position.set(x, y0 + 0.9, -0.79); b.body.add(w); }
    b.body.add(box(6.6, 0.3, 3.0, MARBLE, 0, y0 + h));
    const rs = roofSlabs(3.0, 0.8, 6.6, TERRA2); rs.rotation.y = Math.PI / 2; rs.position.y = y0 + h + 0.3; b.body.add(rs);
    const gb = gable(3.0, 0.8, 6.6, MARBLE2); gb.rotation.y = Math.PI / 2; gb.position.y = y0 + h + 0.3; b.body.add(gb);
    b.addBrazier(-3.0, 2.0); b.addBrazier(3.0, 2.0);
    b.anchors.door.set(0, 0, 2.6); b.anchors.top.set(0, y0 + h + 1.7, 0);
  },

  studio(b) {
    b.body.add(box(3.2, 2.5, 3.0, '#f7f5f0', 0, 0, 0));
    b.body.add(box(1.6, 1.6, 1.6, '#f7f5f0', 1.6, 0, -0.8));
    const dome = mesh(new THREE.SphereGeometry(1.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(BLUE)); dome.position.y = 2.5; b.body.add(dome);
    b.body.add(cyl(0.12, 0.12, 0.5, '#f7f5f0', 6, 0, 3.7));
    b.body.add(box(0.8, 1.5, 0.05, BLUE, 0, 0, 1.51));
    for (const x of [-1.05, 1.05]) {
      const w = windowPane(0.6, 0.7, b.glow); w.position.set(x, 1.5, 1.52); b.body.add(w);
      b.body.add(box(0.2, 0.75, 0.05, BLUE, x - 0.42, 1.12, 1.52)); b.body.add(box(0.2, 0.75, 0.05, BLUE, x + 0.42, 1.12, 1.52));
    }
    // easel with a canvas
    const easel = new THREE.Group();
    for (const sx of [-0.25, 0.25]) { const l = box(0.06, 1.4, 0.06, WOOD, sx, 0); l.rotation.z = sx * 0.3; easel.add(l); }
    easel.add(box(0.8, 0.6, 0.05, '#f3d36b', 0, 0.8, 0.05));
    easel.add(box(0.3, 0.25, 0.06, '#e86a5a', -0.12, 0.95, 0.07)); easel.add(box(0.25, 0.2, 0.06, '#4b8fe0', 0.18, 0.88, 0.07));
    easel.position.set(-2.1, 0, 1.6); easel.rotation.y = 0.5; b.body.add(easel);
    b.addBrazier(1.4, 2.0);
    b.anchors.door.set(0, 0, 2.4); b.anchors.top.set(0, 4.3, 0);
  },

  tower(b) {
    b.body.add(box(2.4, 5.0, 2.4, '#cfc6b6', 0, 0, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) b.body.add(box(0.5, 0.5, 0.5, '#cfc6b6', x * 0.95, 5.0, z * 0.95));
    b.body.add(box(0.8, 1.5, 0.05, WOOD, 0, 0, 1.21));
    for (const y of [2.2, 3.6]) { const w = windowPane(0.45, 0.65, b.glow); w.position.set(0, y, 1.22); b.body.add(w); }
    b.body.add(cyl(0.05, 0.05, 2.2, '#5a4a3a', 5, 0.6, 5.0, 0.6));
    const flagGeo = new THREE.PlaneGeometry(1.1, 0.6, 6, 1);
    const flag = mesh(flagGeo, mat('#c8643b', { side: THREE.DoubleSide, flatShading: false }), { cast: false });
    flag.position.set(1.17, 6.85, 0.6); b.body.add(flag);
    const base = flagGeo.attributes.position.array.slice();
    b.extra.push((dt, t) => {
      const p = flagGeo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, Math.sin(t * 5 + x * 4) * 0.12 * (x + 0.55)); }
      p.needsUpdate = true;
    });
    b.addBrazier(1.5, 1.6);
    b.anchors.door.set(0, 0, 2.2); b.anchors.top.set(0, 7.6, 0); b.anchors.chimney = null;
  },

  house(b) {
    b.body.add(box(3.2, 2.2, 2.6, '#f7f5f0', 0, 0, 0));
    const gb = gable(3.4, 1.1, 2.8, '#f7f5f0'); gb.position.y = 2.2; b.body.add(gb);
    const rs = roofSlabs(3.4, 1.1, 2.8, TERRA); rs.position.y = 2.2; b.body.add(rs);
    b.body.add(box(0.75, 1.4, 0.05, BLUE, -0.6, 0, 1.31));
    const w = windowPane(0.6, 0.6, b.glow); w.position.set(0.7, 1.3, 1.32); b.body.add(w);
    b.body.add(box(0.45, 1.2, 0.45, '#b9ad9c', 1.0, 2.6, -0.4));
    b.addBrazier(-1.6, 1.7);
    b.anchors.door.set(-0.6, 0, 2.2); b.anchors.top.set(0, 4.2, 0); b.anchors.chimney = new THREE.Vector3(1.0, 3.9, -0.4);
  },

  forge(b) {
    b.body.add(box(3.6, 2.4, 3.0, STONE, 0, 0, -0.2));
    const gb = gable(3.8, 1.0, 3.2, '#8b8178'); gb.position.set(0, 2.4, -0.2); b.body.add(gb);
    const rs = roofSlabs(3.8, 1.0, 3.2, '#5e5a57'); rs.position.set(0, 2.4, -0.2); b.body.add(rs);
    b.body.add(box(0.8, 3.0, 0.8, '#7d736b', 1.2, 1.8, -0.9));
    // open front with fire and anvil
    const fireMat = new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff5a1a', emissiveIntensity: 0.4, flatShading: true });
    const hearth = mesh(new THREE.BoxGeometry(1.6, 1.1, 0.1), fireMat, { cast: false }); hearth.position.set(0, 0.75, 1.32); b.body.add(hearth);
    b.body.add(box(0.7, 0.45, 0.35, '#3d3b3a', -0.3, 0, 2.0)); b.body.add(box(1.0, 0.2, 0.4, '#3d3b3a', -0.3, 0.45, 2.0));
    b.extra.push((dt, t, self) => { fireMat.emissiveIntensity = 0.4 + self.active * (2.4 + Math.sin(t * 17) * 0.4); });
    b.addBrazier(1.7, 2.1);
    b.anchors.door.set(0.6, 0, 2.6); b.anchors.top.set(0, 5.4, 0); b.anchors.chimney = new THREE.Vector3(1.2, 4.9, -0.9);
  },

  library(b) {
    const s = steps(4.6, 3.2, 2); b.body.add(s.group);
    const y0 = s.top, h = 2.2;
    b.body.add(box(3.6, h, 2.0, MARBLE2, 0, y0, -0.4));
    for (let i = 0; i < 4; i++) { const c = column(h, 0.18); c.position.set(-1.6 + i * 1.07, y0, 1.05); b.body.add(c); }
    const w = windowPane(0.9, 1.5, b.glow); w.position.set(0, y0 + 0.8, 0.62); b.body.add(w);
    b.body.add(box(4.4, 0.28, 3.0, MARBLE, 0, y0 + h));
    const gb = gable(4.4, 0.9, 3.0, MARBLE); gb.position.y = y0 + h + 0.28; b.body.add(gb);
    const rs = roofSlabs(4.4, 0.9, 3.0, BLUE); rs.position.y = y0 + h + 0.28; b.body.add(rs);
    // scroll stacks
    for (let i = 0; i < 5; i++) {
      const sc = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), mat('#efe2c1')); sc.rotation.z = Math.PI / 2;
      sc.position.set(-2.4 + (i % 3) * 0.05, 0.12 + Math.floor(i / 3) * 0.24 + (i % 3) * 0.0, 1.2 + (i % 3) * 0.26); b.body.add(sc);
    }
    b.addBrazier(2.0, 1.9);
    b.anchors.door.set(0, 0, 2.4); b.anchors.top.set(0, y0 + h + 1.9, 0);
  },

  beacon(b) {
    const tiers = [[1.3, 1.5, 1.6, '#f4efe6'], [1.1, 1.3, 1.6, '#c8643b'], [0.95, 1.1, 1.6, '#f4efe6']];
    let y = 0;
    for (const [rt, rb, h, c] of tiers) { b.body.add(cyl(rt, rb, h, c, 12, 0, y)); y += h; }
    b.body.add(cyl(1.25, 1.25, 0.18, '#5a504a', 12, 0, y));
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffd966', emissiveIntensity: 0.3, flatShading: true });
    const lamp = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 8), lampMat, { cast: false }); lamp.position.y = y + 0.63; b.body.add(lamp);
    b.body.add(cyl(0.1, 0.95, 0.7, '#c8643b', 8, 0, y + 1.08));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -4.5, 0); beam.rotation.z = Math.PI / 2;
    const pivot = new THREE.Group(); pivot.position.y = y + 0.63; pivot.add(beam); b.body.add(pivot);
    b.body.add(box(0.7, 1.3, 0.05, WOOD, 0, 0, 1.47));
    const w = windowPane(0.35, 0.5, b.glow); w.position.set(0, 2.6, 1.22); b.body.add(w);
    b.extra.push((dt, t, self) => {
      const on = Math.max(self.active, (self.night || 0) * 0.6);
      lampMat.emissiveIntensity = 0.3 + on * 2.5;
      beam.material.opacity = on * 0.22;
      pivot.rotation.y += dt * (0.6 + self.active * 2.5);
    });
    b.addBrazier(1.5, 1.6);
    b.anchors.door.set(0, 0, 2.2); b.anchors.top.set(0, y + 2.4, 0);
  },

  archive(b) { STYLES.tholos(b, { dome: '#7e93c9', band: BLUE }); },

  aviary(b) {
    b.body.add(cyl(1.1, 1.3, 3.8, '#f2ece0', 8));
    b.body.add(cyl(0.05, 1.6, 1.4, TERRA, 8, 0, 3.8));
    for (let i = 0; i < 8; i++) {
      const th = (i / 8) * Math.PI * 2, hole = box(0.28, 0.32, 0.06, '#3a2f28');
      hole.position.set(Math.cos(th) * 1.13, 2.4 + (i % 2) * 0.6, Math.sin(th) * 1.13); hole.lookAt(0, hole.position.y, 0); b.body.add(hole);
    }
    b.body.add(box(0.7, 1.3, 0.05, WOOD, 0, 0, 1.25));
    const w = windowPane(0.4, 0.4, b.glow); w.position.set(0, 1.9, 1.24); b.body.add(w);
    STYLES.aviaryDoves(b);
    b.addBrazier(1.5, 1.4);
    b.anchors.door.set(0, 0, 2.0); b.anchors.top.set(0, 6.2, 0);
  },

  aviaryDoves(b) {
    const doves = new THREE.Group(); doves.position.y = 5.6;
    const R = rng(9);
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Group();
      d.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), mat('#ffffff')));
      for (const s of [-1, 1]) { const wing = mesh(new THREE.BoxGeometry(0.42, 0.03, 0.18), mat('#ffffff')); wing.position.x = s * 0.24; wing.userData.s = s; d.add(wing); }
      d.userData = { r: 1.6 + R() * 1.6, ph: R() * 6, sp: 0.8 + R() * 0.8, h: R() * 1.5 };
      doves.add(d);
    }
    b.body.add(doves);
    b.extra.push((dt, t, self) => {
      doves.visible = self.active > 0.05;
      if (!doves.visible) return;
      for (const d of doves.children) {
        const u = d.userData, a = t * u.sp + u.ph;
        d.position.set(Math.cos(a) * u.r, u.h + Math.sin(a * 2) * 0.3, Math.sin(a) * u.r);
        d.rotation.y = -a;
        for (const c of d.children) if (c.userData.s) c.rotation.z = c.userData.s * Math.sin(t * 18 + u.ph) * 0.6;
      }
    });
  },

  stall(b, o = {}) {
    const awning = o.color || '#e86a5a';
    b.body.add(box(1.8, 0.8, 0.9, WOOD, 0, 0, 0.2));
    for (const [x, z] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.6], [0.85, 0.6]]) b.body.add(box(0.08, 1.9, 0.08, '#6b4a2f', x, 0, z));
    for (let i = 0; i < 5; i++) {
      const s = box(0.4, 0.08, 1.3, i % 2 ? '#f7f5f0' : awning, -0.8 + i * 0.4, 1.9, 0.1); s.rotation.x = 0.25; b.body.add(s);
    }
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffcf73', emissiveIntensity: 0, flatShading: true });
    const lamp = mesh(new THREE.OctahedronGeometry(0.14), lampMat, { cast: false }); lamp.position.set(0.7, 1.6, 0.75); b.body.add(lamp);
    const goods = new THREE.Group();
    for (let i = 0; i < 4; i++) goods.add(box(0.28, 0.22, 0.28, ['#f2c14e', '#7cb65a', '#e86a5a', '#b58be0'][i], -0.6 + i * 0.4, 0.8, 0.2));
    b.body.add(goods);
    b.extra.push((dt, t, self) => { lampMat.emissiveIntensity = self.active > 0.5 ? 1.5 + (self.night || 0) * 1.5 : 0; goods.visible = self.active > 0.5; });
    b.anchors.door.set(0, 0, 1.4); b.anchors.top.set(0, 2.7, 0);
  },

  // ---------------------------------------------------------------- cozy village styles
  cottage(b, o = {}) {
    const w = o.w || 3.2, d = o.d || 2.6, h = o.h || 2.2, roof = o.roof || '#d0587a', wall = o.wall || '#f3e6cf', beam = '#6b4a2f';
    b.body.add(box(w + 0.2, 0.3, d + 0.2, '#9c8f80', 0, 0, 0));
    b.body.add(box(w, h, d, wall, 0, 0.3, 0));
    for (const x of [-w / 2, 0, w / 2]) b.body.add(box(0.14, h, 0.06, beam, x, 0.3, d / 2 + 0.01));
    b.body.add(box(w, 0.12, 0.06, beam, 0, 0.3 + h * 0.55, d / 2 + 0.01));
    for (const z of [-d / 2, d / 2]) for (const x of [-w / 2, w / 2]) b.body.add(box(0.16, h, 0.16, beam, x, 0.3, z));
    const rh = o.steep ? 2.0 : 1.5;
    const gb = gable(w + 0.1, rh, d, wall); gb.position.y = 0.3 + h; b.body.add(gb);
    const rs = roofSlabs(w + 0.5, rh, d + 0.2, roof); rs.position.y = 0.3 + h; b.body.add(rs);
    b.body.add(box(0.75, 1.3, 0.06, '#7a4a2a', -w * 0.22, 0.3, d / 2 + 0.03));
    for (const x of [w * 0.24]) {
      const win = windowPane(0.6, 0.6, b.glow); win.position.set(x, 0.3 + h * 0.42, d / 2 + 0.05); b.body.add(win);
      b.body.add(box(0.75, 0.16, 0.22, '#7a4a2a', x, 0.3 + h * 0.42 - 0.38, d / 2 + 0.1));
      for (let k = 0; k < 3; k++) b.body.add(box(0.14, 0.14, 0.14, ['#e86a5a', '#f2c14e', '#f59bc0'][k], x - 0.22 + k * 0.22, 0.3 + h * 0.42 - 0.26, d / 2 + 0.12));
    }
    const gwin = windowPane(0.42, 0.42, b.glow); gwin.position.set(0, 0.3 + h + rh * 0.35, d / 2 + 0.01); b.body.add(gwin);
    b.body.add(box(0.45, 1.3, 0.45, '#a39282', w * 0.3, 0.3 + h + 0.2, -d * 0.2));
    b.addBrazier(-w / 2 - 0.5, d / 2 + 0.6);
    b.anchors.door.set(-w * 0.22, 0, d / 2 + 0.9); b.anchors.top.set(0, 0.3 + h + rh + 0.9, 0);
    b.anchors.chimney = new THREE.Vector3(w * 0.3, 0.3 + h + 1.6, -d * 0.2);
  },

  clocktower(b) {
    b.body.add(box(2.4, 3.2, 2.4, '#b9ab97', 0, 0, 0));
    b.body.add(box(2.6, 2.2, 2.6, '#f3e6cf', 0, 3.2, 0));
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) b.body.add(box(0.18, 2.2, 0.18, '#6b4a2f', x, 3.2, z));
    const face = mesh(new THREE.CircleGeometry(0.75, 20), mat('#fffaf0')); face.position.set(0, 4.3, 1.32); b.body.add(face);
    const rim = mesh(new THREE.TorusGeometry(0.78, 0.06, 6, 20), mat('#6b4a2f')); rim.position.set(0, 4.3, 1.33); b.body.add(rim);
    const hand1 = box(0.06, 0.55, 0.03, '#2a2522', 0, 0, 0), hand2 = box(0.06, 0.4, 0.03, '#2a2522', 0, 0, 0);
    const h1 = new THREE.Group(), h2 = new THREE.Group(); h1.add(hand1); h2.add(hand2);
    h1.position.set(0, 4.3, 1.36); h2.position.set(0, 4.3, 1.37); b.body.add(h1, h2);
    b.extra.push(() => { const d = new Date(); h1.rotation.z = -((d.getMinutes() / 60) * Math.PI * 2); h2.rotation.z = -(((d.getHours() % 12) / 12 + d.getMinutes() / 720) * Math.PI * 2); });
    const roof = mesh(new THREE.ConeGeometry(2.1, 2.2, 4), mat('#3d6fb0')); roof.position.y = 5.4 + 1.1; roof.rotation.y = Math.PI / 4; b.body.add(roof);
    b.body.add(box(0.8, 1.5, 0.06, '#7a4a2a', 0, 0, 1.22));
    const w = windowPane(0.5, 0.6, b.glow); w.position.set(0, 2.2, 1.22); b.body.add(w);
    b.addBrazier(1.5, 1.6);
    b.anchors.door.set(0, 0, 2.2); b.anchors.top.set(0, 8.2, 0);
  },

  mill(b) {
    STYLES.cottage(b, { roof: '#7d5a9e', w: 3.4 });
    const wheel = new THREE.Group(); wheel.position.set(-2.2, 1.4, 0);
    wheel.add(mesh(new THREE.TorusGeometry(1.2, 0.1, 6, 16), mat('#6b4a2f')));
    for (let i = 0; i < 8; i++) { const sp = box(0.12, 2.3, 0.12, '#8a5a35', 0, -1.15, 0); const g = new THREE.Group(); g.add(sp); g.rotation.z = (i / 8) * Math.PI; wheel.add(g); }
    for (let i = 0; i < 12; i++) { const pad = box(0.45, 0.1, 0.5, '#8a5a35', 0, 0, 0); const g = new THREE.Group(); pad.position.y = 1.25; g.add(pad); g.rotation.z = (i / 12) * Math.PI * 2; wheel.add(g); }
    wheel.rotation.y = Math.PI / 2; b.body.add(wheel);
    b.extra.push((dt, t, self) => { wheel.rotation.x += dt * (0.3 + self.active * 2.5); });
  },

  postoffice(b) {
    STYLES.cottage(b, { roof: '#d9534f', w: 3.0 });
    b.body.add(box(0.35, 1.0, 0.3, '#c8432b', 2.0, 0, 1.6));
    const sign = box(1.4, 0.45, 0.08, '#f3e6cf', 0, 2.75, 1.42); b.body.add(sign);
    STYLES.aviaryDoves(b);
  },

  roundtower(b) {
    b.body.add(cyl(1.4, 1.5, 3.6, '#f3e6cf', 14));
    for (let i = 0; i < 6; i++) { const th = (i / 6) * Math.PI * 2; b.body.add(box(0.12, 3.6, 0.12, '#6b4a2f', Math.cos(th) * 1.43, 0, Math.sin(th) * 1.43)); }
    b.body.add(cyl(0.05, 1.9, 2.4, '#8a5ab0', 14, 0, 3.6));
    b.body.add(box(0.7, 1.4, 0.06, '#7a4a2a', 0, 0, 1.47));
    const w = windowPane(0.5, 0.5, b.glow); w.position.set(0, 2.5, 1.46); b.body.add(w);
    b.addBrazier(1.6, 1.4);
    b.anchors.door.set(0, 0, 2.2); b.anchors.top.set(0, 6.6, 0);
  },

  manor(b) {
    STYLES.cottage(b, { roof: '#c8432b', w: 5.0, d: 3.4, h: 3.0, steep: true, wall: '#fbf0dc' });
    b.body.add(cyl(0.05, 0.05, 2.0, '#5a4a3a', 5, 2.2, 6.4, 0));
    const flag = box(0.9, 0.5, 0.04, '#3d6fb0', 2.67, 7.8, 0); b.body.add(flag);
    b.anchors.top.set(0, 8.4, 0);
    b.anchors.door.set(-1.1, 0, 2.6);
  },

  // The Hotel: where visiting threads (work outside C:\code) stay until they check out
  hotel(b, o = {}) {
    const wall = o.wall || '#f6efe2', trim = o.trim || MARBLE2, roof = o.roof || TERRA, w = 5.2, d = 3.4, fl = 1.7;
    b.body.add(box(w + 0.4, 0.3, d + 0.4, '#9c8f80', 0, 0, 0));
    b.body.add(box(w, fl * 2, d, wall, 0, 0.3, 0));
    b.body.add(box(w + 0.1, 0.14, d + 0.1, trim, 0, 0.3 + fl, 0));                 // floor line
    // balcony along the upper floor
    b.body.add(box(w - 0.6, 0.1, 0.6, trim, 0, 0.3 + fl, d / 2 + 0.3));
    for (let i = 0; i <= 8; i++) b.body.add(box(0.06, 0.5, 0.06, '#ffffff', -w / 2 + 0.35 + i * ((w - 0.7) / 8), 0.4 + fl, d / 2 + 0.56));
    b.body.add(box(w - 0.6, 0.06, 0.08, '#ffffff', 0, 0.9 + fl, d / 2 + 0.56));
    // windows: four per floor, shutters on the upper ones
    for (let f = 0; f < 2; f++) for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 0.75 + i * ((w - 1.5) / 3);
      if (f === 0 && (i === 1 || i === 2)) continue; // the door goes here
      const win = windowPane(0.5, 0.65, b.glow); win.position.set(x, 0.3 + f * fl + 0.85, d / 2 + 0.02); b.body.add(win);
      if (f === 1) for (const s of [-1, 1]) b.body.add(box(0.2, 0.7, 0.04, BLUE, x + s * 0.36, 0.3 + fl + 0.5, d / 2 + 0.04));
    }
    b.body.add(box(1.2, 1.35, 0.06, '#7a4a2a', 0, 0.3, d / 2 + 0.02));                // double door
    b.body.add(box(1.6, 0.12, 0.7, roof, 0, 1.75, d / 2 + 0.35));                     // awning
    const gb = gable(w + 0.1, 1.2, d, wall); gb.position.y = 0.3 + fl * 2; b.body.add(gb);
    const rs = roofSlabs(w + 0.6, 1.2, d + 0.3, roof); rs.position.y = 0.3 + fl * 2; b.body.add(rs);
    // the sign over the door
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2522'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#f3d27a'; g.font = '800 38px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.label || 'HOTEL', 128, 34);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.8 }), { cast: false });
    sign.position.set(0, 0.3 + fl + 0.02, d / 2 + 0.66); b.body.add(sign);
    for (const s of [-1, 1]) b.body.add(cyl(0.18, 0.24, 0.5, '#b07a52', 8, s * 1.3, 0.3, d / 2 + 0.9)); // planters
    b.body.add(box(0.45, 1.0, 0.45, '#a39282', w * 0.32, 0.3 + fl * 2 + 0.3, -d * 0.2));
    b.addBrazier(-w / 2 - 0.4, d / 2 + 0.7); b.addBrazier(w / 2 + 0.4, d / 2 + 0.7);
    b.anchors.door.set(0, 0, d / 2 + 1.4); b.anchors.top.set(0, 0.3 + fl * 2 + 2.0, 0);
    b.anchors.chimney = new THREE.Vector3(w * 0.32, 0.3 + fl * 2 + 1.4, -d * 0.2);
  },

  agora(b) {
    b.body.add(cyl(4.6, 4.7, 0.12, '#ddd2bd', 28));
    noticeBoard(b);
    // fountain
    b.body.add(cyl(1.0, 1.1, 0.45, MARBLE, 16, 0, 0.1));
    const wmat = mat('#4fa7d9', { roughness: 0.15, transparent: true, opacity: 0.9, flatShading: false });
    const wtr = mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.05, 16), wmat, { cast: false }); wtr.position.y = 0.5; b.body.add(wtr);
    b.body.add(cyl(0.15, 0.2, 1.0, MARBLE, 8, 0, 0.5));
    b.anchors.door.set(0, 0, 0.6); b.anchors.top.set(0, 3.2, -1.8);
    b.landing = new THREE.Vector3(2.6, 0, 1.4);
  },

  // A building from a world pack (public/worlds/<id>/, see kitworld.js): o.object is the world's model,
  // already sized and standing on y = 0. Adds a lamp that lights when busy or after dark, and the Agora's
  // notice board when o.board is set.
  kit(b, o = {}) {
    if (o.object) b.body.add(o.object);
    const bb = o.object ? new THREE.Box3().setFromObject(o.object) : new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    const h = Math.max(1, bb.max.y), front = Math.max(0.8, bb.max.z);
    const lamp = mesh(new THREE.OctahedronGeometry(0.2), b.glow, { cast: false });
    lamp.position.set(Math.min(bb.max.x, 1.6) * 0.8, Math.min(h, 2.4) * 0.75, front + 0.2); b.body.add(lamp);
    if (o.board) { noticeBoard(b, Math.min(-1.8, bb.min.z - 0.4)); b.landing = new THREE.Vector3(Math.max(2.6, bb.max.x + 0.8), 0, 1.4); }
    b.anchors.door.set(0, 0, front + 0.9); b.anchors.top.set(0, h + 0.9, 0);
    if (o.chimney) b.anchors.chimney = new THREE.Vector3(bb.max.x * 0.4, h, bb.min.z * 0.4);
  },
};

// The Agora's notice board: one note per working thread.
function noticeBoard(b, z = -1.8) {
  const board = new THREE.Group();
  board.add(box(0.12, 2.2, 0.12, WOOD, -1.1, 0)); board.add(box(0.12, 2.2, 0.12, WOOD, 1.1, 0));
  board.add(box(2.5, 1.3, 0.12, '#a87545', 0, 0.8));
  board.add(box(2.7, 0.15, 0.4, '#6b4a2f', 0, 2.1));
  b.notes = new THREE.Group(); board.add(b.notes);
  board.position.set(0, 0, z); b.body.add(board);
  b.setNotes = (n) => {
    if (b.notes.children.length === n) return;
    b.notes.clear();
    const colors = ['#fff6d6', '#ffe0e0', '#e3f2ff', '#e8ffe0'];
    for (let i = 0; i < Math.min(n, 8); i++) {
      const note = box(0.42, 0.42, 0.02, colors[i % 4], -0.85 + (i % 4) * 0.57, 0.95 + Math.floor(i / 4) * 0.5, 0.07);
      note.rotation.z = (Math.sin(i * 7.1) * 0.15); b.notes.add(note);
    }
  };
}

export function makeBuilding(style, opts = {}) {
  const b = new Building(style);
  (STYLES[style] || STYLES.house)(b, opts);
  b.group.traverse((o) => { if (o.isMesh) o.userData.building = b; });
  return b;
}

export const PROJECT_STYLES = ['tholos', 'stoa', 'studio', 'tower', 'house'];

// The same island in two looks. Olympus is the default; set "theme": "village" in olympia.config.json
// (or add ?theme=village to the URL) for the cozy village.
export const THEMES = {
  olympus: { summit: 'temple', tools: {}, project: (s) => s },
  village: {
    summit: 'manor',
    tools: { forge: 'mill', library: ['cottage', { roof: '#3f8f8a' }], beacon: 'clocktower', archive: 'roundtower', aviary: 'postoffice' },
    project: (s, i) => ['cottage', { roof: ['#d0587a', '#e08a3c', '#5b8fd1', '#8a5ab0', '#4f9a6a', '#c8432b'][i % 6], w: 3 + (i % 3) * 0.3 }],
  },
};

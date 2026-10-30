// World packs: the same island, dressed as somewhere else. A pack is public/worlds/<id>/world.json plus the
// free Kenney models it names (shared across worlds in public/worlds/_kits/<kit>/<model>.glb, copied there by
// tools/build-worlds.mjs). The pack says which model plays each building, what is scattered over the island and
// up the mountain, what the ground, water and sky look like, who the residents are and what places are called.
// Everything else (where buildings stand, who walks where and why) is the same live logic as Olympus.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeBuilding } from './buildings.js';
import { registerSpecies } from './characters.js';
import { hash } from './util.js';

const KITS = '/worlds/_kits/';
const D = Math.PI / 180;
// footprint (largest side) and height cap per role, in island units; a Greek temple is about 6 wide
const SIZE = { summit: [6.6, 7], tool: [5, 6.5], project: [4.6, 6], agora: [6.5, 3.6], hotel: [5.6, 6.5] };
export const TOOL_KEYS = ['forge', 'library', 'beacon', 'archive', 'aviary'];

// every model ref ("kit/name") a pack uses
export function modelRefs(def) {
  const out = new Set();
  const spec = (s) => {
    if (!s) return;
    if (typeof s === 'string') out.add(s);
    else if (Array.isArray(s)) s.forEach(spec);
    else if (s.m) out.add(s.m);
    else if (s.parts) s.parts.forEach((p) => out.add(p[0]));
  };
  const b = def.buildings || {};
  for (const k of Object.keys(b)) spec(b[k]);
  for (const s of [...(def.scatter || []), ...(def.slope || [])]) s.models.forEach((m) => out.add(m));
  (def.residents || []).forEach((m) => out.add(m));
  return [...out].filter((r) => !r.startsWith('@'));  // drawn shapes, not kit models
}

export async function loadKitWorld(id, given) {
  const base = `/worlds/${id}/`;
  const def = given || await fetch(base + 'world.json').then((r) => { if (!r.ok) throw new Error(`world ${id}: ${r.status}`); return r.json(); });
  const loader = new GLTFLoader();
  const protos = new Map(), clips = new Map();
  await Promise.all(modelRefs(def).map(async (ref) => {
    const g = await loader.loadAsync(`${KITS}${ref}.glb`).catch((e) => { console.warn('world model failed', ref, e); return null; });
    if (!g) return;
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material)) { m.metalness = Math.min(m.metalness ?? 0, 0.15); m.roughness = Math.max(m.roughness ?? 1, 0.6); }
    });
    protos.set(ref, g.scene); clips.set(ref, g.animations || []);
  }));
  const copy = (ref) => { const p = protos.get(ref); return p ? cloneSkinned(p) : null; };

  // Shapes the kits don't have, drawn here: "@parasol:#hex" (a big café parasol on a pole, as in the kitchen mockup)
  function shape(ref) {
    const [kind, color] = ref.slice(1).split(':');
    const g = new THREE.Group();
    const box = (w, h, d, c, x, y, z, opts = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...opts }));
      m.position.set(x, y, z); m.castShadow = m.receiveShadow = !opts.transparent; g.add(m); return m;
    };
    if (kind === 'shelter') { // a bus stop in its route's colour, as in the bus-lines mockup
      box(2.2, 0.08, 0.8, color, 0, 1.1, 0); box(2.2, 1.0, 0.04, '#cfe3ff', 0, 0.55, -0.38, { transparent: true, opacity: 0.35 });
      box(0.1, 1.8, 0.1, '#f2f2e6', -1.3, 0.9, 0); box(0.5, 0.5, 0.06, color, -1.3, 1.9, 0); box(2.6, 0.04, 0.6, '#f2f2e6', 0.2, 0.02, 0.5);
      return g;
    }
    if (kind !== 'parasol') return null;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.6, 8), new THREE.MeshStandardMaterial({ color: '#e6e6e0', roughness: 0.6 }));
    pole.position.y = 0.8;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.33, 12), new THREE.MeshStandardMaterial({ color: color || '#e05a8a', roughness: 0.8, flatShading: true }));
    top.position.y = 1.63;
    for (const m of [pole, top]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    return g;
  }
  // A spec is "kit/name", {m, rot, size, h} or {parts: [[ref, x, z, rotDeg, scale, y], ...], size, h}.
  function compose(spec) {
    const g = new THREE.Group();
    const parts = typeof spec === 'string' ? [[spec]] : spec.parts || [[spec.m, 0, 0, spec.rot || 0]];
    for (const [ref, x = 0, z = 0, rot = 0, s = 1, y = 0] of parts) {
      const o = ref.startsWith('@') ? shape(ref) : copy(ref); if (!o) continue;
      o.position.set(x, y, z); o.rotation.y = rot * D; o.scale.multiplyScalar(s); g.add(o);
    }
    return g;
  }
  // scale so the widest side is `size` and it stands no taller than `maxH`, centred on x/z and resting on y = 0
  function fit(obj, size, maxH, scale) {
    const bb = new THREE.Box3().setFromObject(obj);
    if (bb.isEmpty()) return obj;
    const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
    let k = scale || size / Math.max(sx, sz, 1e-3);
    if (maxH) k = Math.min(k, maxH / Math.max(sy, 1e-3));
    obj.position.x -= (bb.min.x + bb.max.x) / 2; obj.position.z -= (bb.min.z + bb.max.z) / 2; obj.position.y -= bb.min.y;
    const wrap = new THREE.Group(); wrap.add(obj); wrap.scale.setScalar(k);
    return wrap;
  }
  // Night-city dressing for a spec: "dark" repaints the model one colour, "neon" adds glowing corner strips and
  // lit windows round it (the cyberpunk mockup's towers).
  function darken(obj, color) {
    const c = new THREE.Color(color);
    const paint = (m) => { const n = m.clone(); n.map = null; n.color = c.clone(); n.roughness = 0.45; return n; };
    obj.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(paint) : paint(o.material); });
  }
  const WINDOWS = ['#ffbf66', '#66ccff', '#ff4db3', '#e6e6ff'].map((c) => new THREE.MeshStandardMaterial({ color: '#111', emissive: c, emissiveIntensity: 2.2 }));
  function neonize(obj, color, seed) {
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj), w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z, h = bb.max.y - bb.min.y;
    const glow = new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: 3 });
    const holder = new THREE.Group(); obj.add(holder);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const put = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z).applyMatrix4(inv); o.scale.divide(new THREE.Vector3().setFromMatrixScale(obj.matrixWorld)); holder.add(o); };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(new THREE.BoxGeometry(0.12, h, 0.12), glow, (bb.min.x + bb.max.x) / 2 + sx * w / 2, bb.min.y + h / 2, (bb.min.z + bb.max.z) / 2 + sz * d / 2);
    let r = seed || 1; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const win = new THREE.BoxGeometry(0.34, 0.2, 0.05), winS = new THREE.BoxGeometry(0.05, 0.2, 0.34);
    for (let i = 0; i < Math.round(h * 5); i++) {
      const y = bb.min.y + 0.4 + rnd() * (h - 0.8), m = WINDOWS[Math.floor(rnd() * WINDOWS.length)];
      if (rnd() < 0.5) put(win, m, bb.min.x + 0.2 + rnd() * (w - 0.4), y, rnd() < 0.5 ? bb.max.z + 0.03 : bb.min.z - 0.03);
      else put(winS, m, rnd() < 0.5 ? bb.max.x + 0.03 : bb.min.x - 0.03, y, bb.min.z + 0.2 + rnd() * (d - 0.4));
    }
  }

  function building(role, index = 0) {
    const b = def.buildings || {};
    const kind = TOOL_KEYS.includes(role) ? 'tool' : role;
    let spec = role === 'project' ? (b.projects || [])[index % Math.max(1, (b.projects || []).length)] : b[role];
    if (!spec) return null;
    const [size, maxH] = SIZE[kind] || SIZE.project;
    // "scale": the kit's own units times this (a map world rebuilt from its mockup keeps the mockup's sizes); else fit
    const obj = spec.scale ? fit(compose(spec), Infinity, null, spec.scale) : fit(compose(spec), spec.size || size, spec.h || maxH);
    if (spec.sink) obj.position.y -= spec.sink;  // ships ride low in a harbor's water
    if (spec.dark) darken(obj, spec.dark);
    if (spec.neon) neonize(obj, spec.neon, hash(`${role}${index}`));
    return makeBuilding('kit', { object: obj, board: role === 'agora', chimney: role === 'forge' || !!spec.chimney });
  }

  // Scatter: many copies of small models, one InstancedMesh per model part so hundreds of props stay cheap.
  function instanced(world, refs, items, cast = true) {
    const groups = refs.map(() => []);
    items.forEach((it, i) => groups[i % refs.length].push(it));
    refs.forEach((ref, k) => {
      const proto = protos.get(ref);
      if (!proto || !groups[k].length) return;
      const box = new THREE.Box3().setFromObject(proto);
      const h = Math.max(1e-3, box.max.y - box.min.y);
      proto.updateMatrixWorld(true);
      const parts = [];
      proto.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) parts.push(o); });
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), lift = new THREE.Matrix4().makeTranslation(0, -box.min.y, 0);
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, groups[k].length);
        groups[k].forEach((it, i) => {
          const scale = it.size / h;
          m4.compose(it.p, q.setFromEuler(new THREE.Euler(0, it.rot, 0)), s.setScalar(scale)).multiply(lift).multiply(part.matrixWorld);
          im.setMatrixAt(i, m4);
        });
        im.castShadow = cast; im.receiveShadow = true;
        world.add(im);
      }
    });
  }
  function dress({ scatter, slope, world, R }) {
    const size = ([a, b]) => a + R() * (b - a);
    for (const s of def.scatter || []) instanced(world, s.models, scatter(s.count, s.pad ?? 0.8).map((p) => ({ p, rot: R() * Math.PI * 2, size: size(s.size) })), s.cast !== false);
    for (const s of def.slope || []) instanced(world, s.models, slope(s.count, ...(s.r || [6.8, 10.6])).map((p) => ({ p, rot: R() * Math.PI * 2, size: size(s.size) })), s.cast !== false);
  }

  // Residents: Kenney characters standing in for the felt animals, posed by their own idle / walk clips.
  const species = [];
  const mixers = [];
  for (const ref of def.residents || []) {
    if (!protos.has(ref)) continue;
    const name = `kit:${ref}`;
    registerSpecies(name, (g) => {
      const o = copy(ref);
      const H = def.residentHeight || 1.5;
      const wrapped = fit(o, 10, H);
      g.add(wrapped);
      const all = clips.get(ref);
      if (all.length) {
        const mixer = new THREE.AnimationMixer(o);
        const acts = Object.fromEntries(['idle', 'walk', 'interact-right', 'sit', 'emote-yes'].map((n) => [n, all.find((c) => c.name === n)]).filter(([, c]) => c).map(([n, c]) => [n, mixer.clipAction(c)]));
        let on = null;
        const play = (n) => { const a = acts[n] || acts.idle; if (!a || a === on) return; a.reset().fadeIn(0.2).play(); on?.fadeOut(0.2); on = a; };
        play('idle'); mixer.update(Math.random());
        let probe = null; o.traverse((x) => { if (!probe && x.isMesh) probe = x; });
        mixers.push({ probe, mixer, play });
      }
      return H * 0.95;
    });
    species.push(name);
  }
  const speciesFor = (name) => species.length ? species[hash(name) % species.length] : null;

  return {
    id, def,
    names: def.names || {},
    building,
    dress,
    speciesFor,
    look: { ground: def.ground?.island, cap: def.ground?.cap, stone: def.ground?.stone, path: def.ground?.path, water: def.ground?.water,
      clouds: def.sky?.clouds, cloud: def.sky?.cloud, nightCloud: def.sky?.nightCloud, islets: def.ground?.islets, islet: def.ground?.islet },
    // pose residents to match what they're doing: walking, working, asleep, or waving for you
    update(dt) {
      for (const m of mixers) {
        const r = m.probe?.userData.resident;
        if (r) m.play(r.walk ? 'walk' : r.state === 'waiting' ? 'emote-yes' : r.state === 'working' ? 'interact-right' : r.state === 'sleeping' ? 'sit' : 'idle');
        m.mixer.update(dt);
      }
    },
  };
}

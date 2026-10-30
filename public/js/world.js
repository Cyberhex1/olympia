// The floating island of Olympia: layered earth, Mount Olympus with its plateau,
// a pond and waterfall, cypress and olive groves, paths, clouds and stray islets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, ringNoise, deg, polar, mat, mesh } from './util.js';
import { PROJECT_SLOTS } from './shared.js';

export const ISLAND_R = 32;
export const MOUNTAIN = { baseR: 11, topR: 3.6, topY: 11 };
export const PLATEAU_Y = MOUNTAIN.topY;

const edgeNoise = ringNoise(7, 6);
// A map world (sceneworld.js) brings its own ground: a flat round floor at one height, its own edge and its own
// layout (where the summit, workshops, project spots, agora and hotel stand and where the ring path runs).
let terrain = null;
export function useTerrain(t) {
  terrain = { y: t.y ?? 0, radius: t.radius ?? ISLAND_R };
  const L = t.layout || {};
  if (L.summit) LAYOUT.summit.set(...L.summit);
  for (const [k, v] of Object.entries(L.tools || {})) Object.assign(LAYOUT.tools[k], v);
  if (L.projectSlots) LAYOUT.projectSlots = L.projectSlots;
  for (const k of ['agora', 'hotel', 'pond']) if (L[k]) LAYOUT[k] = { ...LAYOUT[k], ...L[k] };
  if (L.ringRoad) LAYOUT.ringRoad = L.ringRoad;
  if (L.paths) LAYOUT.paths = L.paths;  // walkways graph (characters.js graphLegs)
}
export const flatGround = () => Boolean(terrain);
export const edgeRadius = (theta) => (terrain ? terrain.radius : ISLAND_R + edgeNoise(theta) * 1.6);

// ---------------------------------------------------------------- layout (degrees around the mountain, 90 = towards the camera)
export const LAYOUT = {
  summit: new THREE.Vector3(0, PLATEAU_Y, 0),
  tools: {
    forge:   { theta: 160, r: 14.2, label: "Hephaestus' Forge", lede: 'Where commands are hammered out', style: 'forge' },
    library: { theta: 215, r: 14.2, label: 'The Library', lede: 'Files read, written and patched', style: 'library' },
    beacon:  { theta: 270, r: 14.2, label: 'The Beacon', lede: 'Looks out across the web', style: 'beacon' },
    archive: { theta: 325, r: 14.2, label: "Mnemosyne's Archive", lede: 'Memories and past sessions', style: 'archive' },
    aviary:  { theta: 20,  r: 14.2, label: 'The Aviary', lede: 'Messages and helpers take flight', style: 'aviary' },
  },
  projectSlots: PROJECT_SLOTS,
  agora: { theta: 52, r: 22.5 },
  hotel: { theta: 77, r: 26.4 },
  pond: { theta: 100, r: 22.5, radius: 3.4 },
  ringRoad: 18.6,
};

// Mountain profile: (r, y) from base to plateau edge.
const PROFILE = [
  [11.2, -0.25], [10.2, 1.0], [9.0, 2.6], [7.8, 4.4], [6.7, 6.2], [5.6, 7.9], [4.6, 9.4], [3.9, 10.5], [3.6, 11.0],
];
export function mountainHeight(r) {
  if (r >= PROFILE[0][0]) return 0;
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, y0] = PROFILE[i], [r1, y1] = PROFILE[i + 1];
    if (r <= r0 && r >= r1) return y0 + ((r0 - r) / (r0 - r1)) * (y1 - y0);
  }
  return PLATEAU_Y;
}
export function groundY(x, z) { return terrain ? terrain.y : Math.max(0, mountainHeight(Math.hypot(x, z))); }

// Generic lathe-like ring mesh with per-ring colours and jitter (flat shaded).
function ringMesh(rings, segs, jitter, colorFn, flip = false) {
  const pos = [], col = [];
  const P = rings.map((ring, ri) => {
    const pts = [];
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const rr = ring.r(th) + (ring.j ? jitter(ri, s) * ring.j : 0);
      pts.push(new THREE.Vector3(Math.cos(th) * rr, ring.y + (ring.jy ? jitter(ri + 50, s) * ring.jy : 0), Math.sin(th) * rr));
    }
    return pts;
  });
  const c = new THREE.Color();
  const push = (v, ri) => { pos.push(v.x, v.y, v.z); colorFn(ri, v, c); col.push(c.r, c.g, c.b); };
  for (let ri = 0; ri < P.length - 1; ri++) {
    for (let s = 0; s < segs; s++) {
      const a = P[ri][s], b = P[ri][(s + 1) % segs], d = P[ri + 1][s], e = P[ri + 1][(s + 1) % segs];
      if (flip) { push(a, ri); push(b, ri); push(d, ri); push(b, ri); push(e, ri); push(d, ri); }
      else { push(a, ri); push(d, ri); push(b, ri); push(b, ri); push(d, ri); push(e, ri); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildWorld(scene, assets = {}) {
  const world = new THREE.Group();
  scene.add(world);
  const R = rng(42);
  const jit = (a, b) => { const r = rng(a * 977 + b * 131 + 3); return r() * 2 - 1; };
  const animated = [];
  const look = assets.look || {};  // colours and dressing from a world pack (kitworld.js); empty for Olympus and the village

  // ---------- island top (polar grid with patchy greens)
  if (!assets.island) {
    const K = 14, S = 96, pos = [], col = [];
    const c = new THREE.Color(), g1 = new THREE.Color('#7cb65a'), g2 = new THREE.Color('#5f9e48'), g3 = new THREE.Color('#9cc46a');
    const patch = (x, z) => Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.6) + Math.sin((x + z) * 0.09) * 0.6;
    const vtx = (k, s) => {
      const th = (s / S) * Math.PI * 2, r = (k / K) * edgeRadius(th);
      return new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
    };
    const push = (v) => {
      pos.push(v.x, v.y, v.z);
      const n = patch(v.x, v.z);
      c.copy(g2).lerp(n > 0 ? g3 : g1, Math.min(1, Math.abs(n) * 0.7));
      col.push(c.r, c.g, c.b);
    };
    for (let k = 0; k < K; k++) for (let s = 0; s < S; s++) {
      const a = vtx(k, s), b = vtx(k, s + 1), d = vtx(k + 1, s), e = vtx(k + 1, s + 1);
      if (k > 0) { push(a); push(b); push(d); }
      push(b); push(e); push(d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    world.add(mesh(g, mat('#ffffff', { vertexColors: true }), { cast: false }));
  }

  // ---------- layered earth underneath (the cake)
  if (!assets.island) {
    const e = (k) => (th) => edgeRadius(th) * k;
    const rings = [
      { y: 0.0, r: e(1) }, { y: -0.55, r: e(1.0) }, { y: -0.55, r: e(0.99) },
      { y: -2.0, r: e(0.975), j: 0.25 }, { y: -2.25, r: e(0.965) }, { y: -3.4, r: e(0.93), j: 0.3 },
      { y: -6.5, r: e(0.72), j: 1.2, jy: 0.6 }, { y: -10.5, r: e(0.45), j: 1.4, jy: 0.8 }, { y: -15, r: e(0.2), j: 0.8, jy: 0.6 }, { y: -18.5, r: () => 0.4 },
    ];
    const colors = ['#5f9e48', '#8b5a34', '#a06c40', '#7c5132', '#9b6a3e', '#857a72', '#776d66', '#6a625c', '#5e5752'];
    const g = ringMesh(rings, 72, jit, (ri, v, c) => c.set(colors[Math.min(ri, colors.length - 1)]).offsetHSL(0, 0, (jit(ri, Math.floor(v.x * 7 + v.z * 3)) * 0.03)), true);
    world.add(mesh(g, mat('#ffffff', { vertexColors: true }), { receive: false }));
  }

  // ---------- Mount Olympus
  {
    const rings = PROFILE.map(([r, y], i) => ({ y, r: () => r, j: i === 0 || i === PROFILE.length - 1 ? 0.15 : 0.7, jy: i === PROFILE.length - 1 ? 0 : 0.35 }));
    const snow = new THREE.Color('#f4f6fb'), rock = new THREE.Color('#9a8f86'), dark = new THREE.Color('#7f756d'), grass = new THREE.Color('#6aa84f');
    const g = ringMesh(rings, 40, jit, (ri, v, c) => {
      if (v.y < 1.6) c.copy(grass);
      else if (v.y < 8.6) c.copy(ri % 2 ? rock : dark);
      else c.copy(snow);
    });
    if (!assets.island) world.add(mesh(g, mat('#ffffff', { vertexColors: true })));
    else addIsland(world, assets.island, assets.theme, look.ground);
    // plateau paving
    const cap = mesh(new THREE.CylinderGeometry(3.75, 3.75, 0.25, 40), mat(look.cap || '#e9e4da'), { cast: false });
    cap.position.y = PLATEAU_Y - 0.1; world.add(cap);
    // a ledge path spiralling up (decorative stones)
    const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const stones = new THREE.InstancedMesh(stoneGeo, mat(look.stone || '#d9d2c5'), 70);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < 70; i++) {
      const t = i / 70, th = deg(100 + t * 520), r = 10.6 - t * 6.6;
      const p = new THREE.Vector3(Math.cos(th) * r, mountainHeight(r) + 0.05, Math.sin(th) * r);
      sc.set(1, 0.4, 1).multiplyScalar(0.8 + R() * 0.4);
      stones.setMatrixAt(i, m4.compose(p, q.setFromEuler(new THREE.Euler(0, R() * 6, 0)), sc));
    }
    stones.receiveShadow = true; world.add(stones);
  }

  // ---------- paths: ring road + spokes (hex flagstones)
  const pathPoints = [];
  {
    const add = (x, z) => pathPoints.push([x, z]);
    for (let i = 0; i < 120; i++) { const th = (i / 120) * Math.PI * 2; add(Math.cos(th) * LAYOUT.ringRoad, Math.sin(th) * LAYOUT.ringRoad); }
    const spoke = (theta, r0, r1) => { for (let r = r0; r <= r1; r += 1.0) { const p = polar(theta, r); add(p.x, p.z); } };
    for (const t of Object.values(LAYOUT.tools)) spoke(t.theta, t.r + 2.2, LAYOUT.ringRoad);
    for (const s of LAYOUT.projectSlots.slice(0, 5)) spoke(s.theta, LAYOUT.ringRoad, s.r - 2.4);
    spoke(LAYOUT.agora.theta, LAYOUT.ringRoad, LAYOUT.agora.r - 3.5);
    spoke(LAYOUT.hotel.theta, LAYOUT.ringRoad, LAYOUT.hotel.r - 3.2);
    spoke(LAYOUT.pond.theta, LAYOUT.ringRoad, LAYOUT.pond.r - 3.6);
    const tiles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.52, 0.12, 6), mat('#ffffff'), pathPoints.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    pathPoints.forEach(([x, z], i) => {
      tiles.setMatrixAt(i, m4.compose(new THREE.Vector3(x + (R() - 0.5) * 0.25, 0.03, z + (R() - 0.5) * 0.25), q.setFromEuler(new THREE.Euler(0, R() * 3, 0)), new THREE.Vector3(1, 1, 1)));
      tiles.setColorAt(i, c.set(look.path || '#d8cdb5').offsetHSL(0, 0, (R() - 0.5) * 0.08));
    });
    tiles.receiveShadow = true; world.add(tiles);
  }

  // ---------- pond, stream and waterfall
  const water = mat(look.water || '#4fa7d9', { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92, flatShading: false });
  const pondPos = polar(LAYOUT.pond.theta, LAYOUT.pond.r);
  {
    const pond = mesh(new THREE.CircleGeometry(LAYOUT.pond.radius, 28), water, { cast: false });
    pond.rotation.x = -Math.PI / 2; pond.position.set(pondPos.x, 0.06, pondPos.z); world.add(pond);
    const rim = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.42, 0), mat('#b8b0a4'), 22);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 22; i++) {
      const th = (i / 22) * Math.PI * 2;
      rim.setMatrixAt(i, m4.compose(new THREE.Vector3(pondPos.x + Math.cos(th) * (LAYOUT.pond.radius + 0.2), 0.1, pondPos.z + Math.sin(th) * (LAYOUT.pond.radius + 0.2)), q.setFromEuler(new THREE.Euler(R(), R(), R())), new THREE.Vector3(1, 0.6, 1).multiplyScalar(0.7 + R() * 0.5)));
    }
    rim.castShadow = true; world.add(rim);
    // stream to the edge
    const th = deg(LAYOUT.pond.theta), edge = edgeRadius(th);
    const len = edge - LAYOUT.pond.r - LAYOUT.pond.radius + 0.6;
    const stream = mesh(new THREE.PlaneGeometry(1.8, len), water, { cast: false });
    stream.rotation.x = -Math.PI / 2; stream.rotation.z = -(th - Math.PI / 2);
    const mid = LAYOUT.pond.r + LAYOUT.pond.radius + len / 2 - 0.6;
    stream.position.set(Math.cos(th) * mid, 0.05, Math.sin(th) * mid); world.add(stream);
    // waterfall: scrolling stripes hanging off the edge
    const fallMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float t; varying vec2 vUv;
        void main(){ float s = fract(vUv.y*5.0 + t*1.4 + sin(vUv.x*18.0)*0.08); float stripe = smoothstep(0.0,0.2,s)*smoothstep(0.7,0.3,s);
        vec3 c = mix(vec3(0.35,0.66,0.86), vec3(0.92,0.97,1.0), stripe*0.7);
        float a = (0.85 - (1.0-vUv.y)*0.6) * smoothstep(0.0,0.12,vUv.x) * smoothstep(1.0,0.88,vUv.x);
        gl_FragColor = vec4(c, a); }`,
    });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 16, 1, 8), fallMat);
    fall.position.set(Math.cos(th) * (edge + 0.15), -8, Math.sin(th) * (edge + 0.15));
    fall.rotation.y = -th + Math.PI / 2;
    world.add(fall);
    animated.push((dt) => { fallMat.uniforms.t.value += dt; });
    // mist puffs at the bottom
    const mist = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const p = mesh(new THREE.IcosahedronGeometry(0.9 + R(), 1), mat('#ffffff', { transparent: true, opacity: 0.55 }), { cast: false, receive: false });
      p.position.set(Math.cos(th) * (edge + 0.6) + (R() - 0.5) * 2, -16 + R() * 1.5, Math.sin(th) * (edge + 0.6) + (R() - 0.5) * 2);
      p.userData.ph = R() * 6; mist.add(p);
    }
    world.add(mist);
    animated.push((dt, t) => mist.children.forEach((p) => { p.scale.setScalar(1 + Math.sin(t * 1.3 + p.userData.ph) * 0.15); }));
    // little wooden bridge over the stream on the ring road? the road ends at the pond instead.
  }

  // ---------- scatter: trees, flowers, rocks (avoid footprints)
  const blockers = [];
  const block = (v, r) => blockers.push({ x: v.x, z: v.z, r });
  for (const t of Object.values(LAYOUT.tools)) block(polar(t.theta, t.r), 3.4);
  for (const s of LAYOUT.projectSlots) block(polar(s.theta, s.r), 3.8);
  block(polar(LAYOUT.agora.theta, LAYOUT.agora.r), 5.2);
  block(polar(LAYOUT.hotel.theta, LAYOUT.hotel.r), 4.4);
  block(pondPos, LAYOUT.pond.radius + 1.2);
  const free = (x, z, pad = 0.8) => {
    const r = Math.hypot(x, z), th = Math.atan2(z, x);
    if (r < MOUNTAIN.baseR + 0.6 || r > edgeRadius(th) - 1.2) return false;
    if (Math.abs(r - LAYOUT.ringRoad) < 1.1) return false;
    const dth = Math.abs(((th - deg(LAYOUT.pond.theta) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (r > LAYOUT.pond.r && dth * r < 1.6) return false; // stream
    for (const b of blockers) if (Math.hypot(x - b.x, z - b.z) < b.r + pad) return false;
    for (const [px, pz] of pathPoints) if (Math.hypot(x - px, z - pz) < 0.9) return false;
    return true;
  };
  const scatter = (n, pad) => {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 40; tries++) {
      const th = R() * Math.PI * 2, r = MOUNTAIN.baseR + R() * (ISLAND_R - MOUNTAIN.baseR);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (free(x, z, pad)) { out.push(new THREE.Vector3(x, 0, z)); blockers.push({ x, z, r: pad * 0.6 }); }
    }
    return out;
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), c = new THREE.Color();
  const slope = (n, r0, r1) => Array.from({ length: n }, () => {
    const th = R() * Math.PI * 2, r = r0 + R() * (r1 - r0);
    return new THREE.Vector3(Math.cos(th) * r, mountainHeight(r) - 0.15, Math.sin(th) * r);
  });
  if (assets.dress) assets.dress({ scatter, slope, world, R, pondPos, animated });
  else if (assets.props) scatterProps(assets.props, { scatter, world, R, pondPos, theme: assets.theme });
  // cypress
  if (!assets.props) {
    const spots = scatter(26, 1.0);
    const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 3.0, 7), mat('#2f6b3a'), spots.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 5), mat('#6b4a2f'), spots.length);
    spots.forEach((p, i) => {
      const h = 0.6 + R() * 0.45;
      foliage.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 0.45 + 1.5 * h, p.z), q.identity(), s3.set(1, h, 1)));
      foliage.setColorAt(i, c.set('#2f6b3a').offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.08));
      trunk.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 0.3, p.z), q.identity(), s3.set(1, 1, 1)));
    });
    foliage.castShadow = trunk.castShadow = true; world.add(foliage, trunk);
  }
  // olive trees
  if (!assets.props) {
    const spots = scatter(40, 1.3);
    const blobGeo = new THREE.IcosahedronGeometry(0.85, 0);
    const blobs = new THREE.InstancedMesh(blobGeo, mat('#8fa86a'), spots.length * 3);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 1.3, 5), mat('#7a5b3f'), spots.length);
    spots.forEach((p, i) => {
      trunk.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 0.6, p.z), q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3)), s3.set(1, 1, 1)));
      for (let k = 0; k < 3; k++) {
        blobs.setMatrixAt(i * 3 + k, m4.compose(new THREE.Vector3(p.x + (R() - 0.5) * 1.1, 1.5 + R() * 0.7, p.z + (R() - 0.5) * 1.1), q.setFromEuler(new THREE.Euler(R(), R(), R())), s3.setScalar(0.7 + R() * 0.5)));
        blobs.setColorAt(i * 3 + k, c.set(R() > 0.5 ? '#8fa86a' : '#a7b981'));
      }
    });
    blobs.castShadow = trunk.castShadow = true; world.add(blobs, trunk);
  }
  // pines up the mountain
  if (!assets.props) {
    const n = 26, pines = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 1.9, 6), mat('#3d7a46'), n);
    for (let i = 0; i < n; i++) {
      const th = R() * Math.PI * 2, r = 6.5 + R() * 4;
      const y = mountainHeight(r);
      pines.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(th) * r, y + 0.7, Math.sin(th) * r), q.identity(), s3.setScalar(0.7 + R() * 0.5)));
    }
    pines.castShadow = true; world.add(pines);
  }
  // flowers and rocks
  if (!assets.props) {
    const spots = scatter(180, 0.2);
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), mat('#ffffff'), spots.length);
    const palette = ['#f2c14e', '#e86a5a', '#ffffff', '#b58be0', '#f59bc0'];
    spots.forEach((p, i) => { fl.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 0.15, p.z), q.identity(), s3.setScalar(0.45 + R() * 0.4))); fl.setColorAt(i, c.set(palette[Math.floor(R() * palette.length)])); });
    world.add(fl);
    const rspots = scatter(30, 0.6);
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), mat('#a39b91'), rspots.length);
    rspots.forEach((p, i) => rocks.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 0.15, p.z), q.setFromEuler(new THREE.Euler(R(), R(), R())), s3.set(1, 0.6, 1).multiplyScalar(0.6 + R() * 0.8))));
    rocks.castShadow = true; world.add(rocks);
  }

  // ---------- clouds: drifting puffs above, a cloud sea below
  const puffGeo = (() => {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.IcosahedronGeometry(1.6 + R() * 1.4, 1);
      g.translate((R() - 0.5) * 6, (R() - 0.3) * 1.2, (R() - 0.5) * 2.4); parts.push(g);
    }
    return mergeGeometries(parts);
  })();
  const cloudMat = mat('#ffffff', { roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.12 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const cl = mesh(puffGeo, cloudMat, { cast: true, receive: false });
    const th = R() * Math.PI * 2, r = 46 + R() * 70;
    cl.position.set(Math.cos(th) * r, 16 + R() * 18, Math.sin(th) * r);
    cl.scale.setScalar(0.8 + R() * 1.3); cl.rotation.y = R() * 6;
    clouds.add(cl);
  }
  if (look.clouds !== false) world.add(clouds);
  const sea = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cloudMat, 70);
  for (let i = 0; i < 70; i++) {
    const th = R() * Math.PI * 2, r = 28 + R() * 150;
    sea.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(th) * r, -30 - R() * 6, Math.sin(th) * r), q.identity(), s3.set(9 + R() * 10, 3 + R() * 2, 7 + R() * 8)));
  }
  if (look.clouds !== false) world.add(sea);
  const dayCloud = new THREE.Color(look.cloud || '#ffffff'), nightCloud = new THREE.Color(look.nightCloud || '#7d88ad');
  animated.push((dt, t, night = 0) => {
    clouds.rotation.y += dt * 0.006; sea.rotation.y -= dt * 0.002;
    cloudMat.color.copy(dayCloud).lerp(nightCloud, night); cloudMat.emissiveIntensity = 0.12 * (1 - night);
  });

  // ---------- stray islets
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    // same base as the island: grass cap, soil band, warm tapered underside
    const rad = 2 + R() * 1.5;
    const [cTop, cSoil, cBot, cTree] = look.islet || ['#5a9a42', '#b08a66', '#8f6d52', '#2f6b3a'];
    const top = mesh(new THREE.CylinderGeometry(rad, rad * 0.97, 0.35, 10), mat(cTop));
    const soil = mesh(new THREE.CylinderGeometry(rad * 0.97, rad * 0.9, 0.7, 10), mat(cSoil));
    soil.position.y = -0.52;
    const bot = mesh(new THREE.ConeGeometry(rad * 0.9, 4 + R() * 3, 10), mat(cBot));
    bot.rotation.x = Math.PI; bot.position.y = -0.87 - bot.geometry.parameters.height / 2;
    g.add(top, soil, bot);
    if (R() > 0.4) { const t = mesh(new THREE.ConeGeometry(0.5, 2.4, 6), mat(cTree)); t.position.y = 1.5; g.add(t); }
    const th = deg(30 + i * 95 + R() * 30), r = 44 + R() * 10;
    g.position.set(Math.cos(th) * r, -4 + R() * 8, Math.sin(th) * r);
    g.userData.ph = R() * 6;
    if (look.islets !== false) world.add(g);
    animated.push((dt, t) => { g.position.y += Math.sin(t * 0.5 + g.userData.ph) * dt * 0.25; });
  }

  return {
    group: world,
    update(dt, t, night) { for (const f of animated) f(dt, t, night); },
    free,
    pondPos,
  };
}

// ---------------------------------------------------------------- Blender-built island (public/assets/olympia-island.glb)
function addIsland(world, gltfScene, theme, ground = {}) {
  gltfScene.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: o.name !== 'IslandTop', roughness: 0.92, metalness: 0 });
    if (theme === 'village' && o.name === 'Mountain') m.color.set('#9fcf7c'); // a green hill instead of a snowy peak
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const re = ground[o.name];
    if (Array.isArray(re)) repaint(g, re);       // a world's own ground: [dark, light], keeping the patchy shading
    else if (re) m.color.set(re);                // or a tint over the island's colours
    const out = new THREE.Mesh(g, m);
    out.name = o.name;
    out.receiveShadow = true;
    out.castShadow = o.name !== 'IslandTop';
    world.add(out);
  });
}

// Recolour vertex colours onto a dark..light ramp by their brightness, so the island's patches and strata survive.
function repaint(g, [dark, light]) {
  const col = g.getAttribute('color');
  if (!col) return;
  const lum = new Float32Array(col.count);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < col.count; i++) { const l = col.getX(i) * 0.3 + col.getY(i) * 0.59 + col.getZ(i) * 0.11; lum[i] = l; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  const a = new THREE.Color(dark), b = new THREE.Color(light), c = new THREE.Color();
  for (let i = 0; i < col.count; i++) { c.copy(a).lerp(b, (lum[i] - lo) / Math.max(1e-5, hi - lo)); col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true;
}

// ---------------------------------------------------------------- Kenney Nature Kit props (public/assets/olympia-props.glb)
const propMats = new Map();
function propMaterial(key) {
  if (!propMats.has(key)) propMats.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }));
  return propMats.get(key);
}

// Instance `names` across `items` (each {p, rotY, scale: Vector3, tint}), one InstancedMesh per model.
function instance(world, props, names, items, { cast = true } = {}) {
  const groups = names.map(() => []);
  items.forEach((it, i) => groups[it.pick ?? i % names.length].push(it));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  names.forEach((name, k) => {
    const geo = props.get(name);
    if (!geo || !groups[k].length) return;
    const im = new THREE.InstancedMesh(geo, propMaterial(name), groups[k].length);
    groups[k].forEach((it, i) => {
      im.setMatrixAt(i, m4.compose(it.p, q.setFromEuler(new THREE.Euler(it.tilt || 0, it.rotY, 0)), it.scale));
      im.setColorAt(i, c.set(it.tint || '#ffffff'));
    });
    im.castShadow = cast; im.receiveShadow = true;
    im.name = name;
    world.add(im);
  });
}

function scatterProps(props, { scatter, world, R, pondPos, theme }) {
  const vary = (hex, amt = 0.06) => new THREE.Color(hex).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * amt).getHexString();
  const at = (p, s, extra = {}) => ({ p, rotY: R() * Math.PI * 2, scale: new THREE.Vector3(s, s, s), ...extra });

  // tall dark cypresses: the signature Greek tree
  if (theme === 'village') instance(world, props, ['tree_default', 'tree_detailed', 'tree_pineRoundC'],
    scatter(30, 1.0).map((p) => at(p, 2.0 + R() * 0.6, { tint: '#' + vary(R() > 0.5 ? '#ffffff' : '#f6d9a8') })));
  else instance(world, props, ['tree_pineTallA_detailed', 'tree_pineTallB_detailed', 'tree_cone_dark'],
    scatter(30, 1.0).map((p) => { const s = 1.9 + R() * 0.6; return { ...at(p, s), scale: new THREE.Vector3(s * 0.62, s * 1.25, s * 0.62), tint: '#' + vary('#6f9a66') }; }));
  // silvery olive and broadleaf trees
  instance(world, props, ['tree_detailed', 'tree_oak', 'tree_fat', 'tree_default'],
    scatter(34, 1.3).map((p) => at(p, 2.0 + R() * 0.6, { tint: '#' + vary(R() > 0.4 ? '#d8dcc0' : '#f2f5e6') })));
  // bushes
  instance(world, props, ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'plant_bushSmall'],
    scatter(55, 0.5).map((p) => at(p, 2.0 + R() * 1.0, { tint: '#' + vary('#f0f5e0') })));
  // grass tufts and flowers (no shadows: cheap and soft)
  instance(world, props, ['grass', 'grass_large', 'grass_leafs'],
    scatter(170, 0.25).map((p) => at(p, 3 + R() * 1.5, { tint: '#' + vary('#ffffff', 0.12) })), { cast: false });
  instance(world, props, ['flower_redA', 'flower_yellowB', 'flower_purpleC'],
    scatter(150, 0.2).map((p) => at(p, 3 + R() * 1.2)), { cast: false });
  // boulders
  instance(world, props, ['rock_smallA', 'rock_smallC', 'rock_smallFlatA'],
    scatter(30, 0.6).map((p) => at(p, 1.6 + R() * 1.6, { tint: '#' + vary('#e6dfd2') })));
  // ruins along the ring road: a few broken columns and an obelisk
  instance(world, props, ['statue_columnDamaged', 'statue_column', 'statue_obelisk'],
    scatter(9, 0.9).map((p, i) => at(p, 2.0 + R() * 0.4, { pick: i < 5 ? 0 : i < 8 ? 1 : 2, tint: '#f4efe4', tilt: i < 5 ? (R() - 0.5) * 0.12 : 0 })));
  // amphorae and woodland bits
  instance(world, props, ['pot_small'], scatter(10, 0.4).map((p) => at(p, 1.8 + R() * 0.6, { tint: '#f0c0a0' })));
  instance(world, props, ['mushroom_redGroup', 'log', 'stump_round'], scatter(12, 0.5).map((p) => at(p, 3 + R())));
  // lilies on the pond
  instance(world, props, ['lily_large'], Array.from({ length: 7 }, () => {
    const a = R() * Math.PI * 2, r = 0.6 + R() * 2.2;
    return at(new THREE.Vector3(pondPos.x + Math.cos(a) * r, 0.07, pondPos.z + Math.sin(a) * r), 1.6 + R());
  }), { cast: false });
  // pines and rock spires up the mountain slopes
  const slope = (n, r0, r1) => Array.from({ length: n }, () => {
    const th = R() * Math.PI * 2, r = r0 + R() * (r1 - r0);
    return new THREE.Vector3(Math.cos(th) * r, mountainHeight(r) - 0.15, Math.sin(th) * r);
  });
  instance(world, props, ['tree_pineRoundC', 'tree_pineSmallA'], slope(34, 6.8, 10.6).map((p) => at(p, 1.6 + R() * 0.8, { tint: '#' + vary('#b9d0ac') })));
  instance(world, props, ['rock_tallA', 'stone_tallB'], slope(7, 5.2, 10).map((p) => at(p, 1.6 + R() * 1.2, { tint: '#d9d2c6' })));
}

import * as THREE from 'three';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const deg = (d) => (d * Math.PI) / 180;
export const polar = (thetaDeg, r, y = 0) => new THREE.Vector3(Math.cos(deg(thetaDeg)) * r, y, Math.sin(deg(thetaDeg)) * r);

// Smooth periodic noise around a circle: sum of a few sines with seeded phases.
export function ringNoise(seed, terms = 5) {
  const r = rng(seed);
  const t = Array.from({ length: terms }, (_, i) => ({ f: i + 2 + Math.floor(r() * 3), p: r() * Math.PI * 2, a: (r() * 0.6 + 0.4) / (i + 1) }));
  return (theta) => t.reduce((s, k) => s + Math.sin(theta * k.f + k.p) * k.a, 0);
}

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts }));
  }
  return matCache.get(key);
}

// Felt-like material for characters: soft sheen, fully rough.
export function felt(color, sheen = '#ffffff') {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(sheen).multiplyScalar(0.6) });
}

export function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 0) return `in ${timeUntil(-s)}`;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
function timeUntil(s) { return s < 3600 ? `${Math.ceil(s / 60)} min` : `${Math.round(s / 3600)} h`; }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Town life on the classic map: what a thread that isn't resolved does between turns. It strolls from place to place
// and does what that place is for: fishes at the pond, reads the Agora's notice board, looks round a workshop,
// watches another project's station at work, chats on the Hotel's terrace, takes in the view from the edge, or
// potters at home. Nothing is said: the name tag (on hover) says where it is.
import * as THREE from 'three';
import { polar } from './util.js';
import { LAYOUT, edgeRadius } from './world.js';
import { walkable } from './characters.js';

// pose: how it stands there (characters.js); dur: seconds there [min, max]; weight: how often it's picked
export const ACTIVITIES = {
  pond:    { pose: 'fish',   dur: [20, 45], weight: 3, label: 'fishing at the pond' },
  agora:   { pose: 'read',   dur: [8, 16],  weight: 3, label: "reading the Agora's notice board" },
  workshop:{ pose: 'browse', dur: [8, 16],  weight: 2, label: 'looking round' },
  station: { pose: 'watch',  dur: [12, 25], weight: 3, label: 'watching' },
  hotel:   { pose: 'chat',   dur: [10, 20], weight: 1, label: "chatting on the Hotel's terrace" },
  view:    { pose: 'gaze',   dur: [10, 20], weight: 2, label: 'taking in the view' },
  home:    { pose: null,     dur: [6, 14],  weight: 3, label: 'pottering at home' },
};

// Pick the next place. places: [{ kind, name, spots: [{ at: Vector3, face }] }]; prev: the kind it just did;
// taken(at): someone is there or heading there. R: random 0..1. Returns { kind, label, at, face, pose, dur } or null.
export function pickActivity(places, R, { prev = null, taken = () => false, resting = false } = {}) {
  const open = places.map((p) => ({ p, spots: p.spots.filter((s) => !taken(s.at)) }))
    .filter((x) => x.spots.length && (x.p.kind !== prev || x.p.kind === 'station'));
  if (!open.length) return null;
  // a busy station is worth watching; resting threads (a quiet day or more) prefer the slow things
  const w = (x) => (ACTIVITIES[x.p.kind]?.weight || 1) * (x.p.busy ? 2 : 1) * (resting && ['pond', 'view', 'home'].includes(x.p.kind) ? 2 : 1) / (x.p.share || 1);
  let k = R() * open.reduce((n, x) => n + w(x), 0), pick = open[0];
  for (const x of open) { k -= w(x); if (k <= 0) { pick = x; break; } }
  const a = ACTIVITIES[pick.p.kind], s = pick.spots[Math.floor(R() * pick.spots.length)];
  const dur = (a.dur[0] + R() * (a.dur[1] - a.dur[0])) * (resting ? 1.6 : 1);
  return { kind: pick.p.kind, label: pick.p.label || a.label, at: s.at.clone(), face: s.face, pose: a.pose, dur };
}

const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const ok = (p) => walkable(p.x, p.z);

// The town's places, from what is on the island now. buildings: main.js's map; stations: stations.js;
// doorWorld(b): a building's door. The places that don't move (pond, Agora, views) are worked out once.
let fixed = null;
export function townPlaces(buildings, stations, doorWorld) {
  if (!fixed) {
    fixed = [];
    const pond = polar(LAYOUT.pond.theta, LAYOUT.pond.r);
    fixed.push({ kind: 'pond', spots: ring(pond, LAYOUT.pond.radius + 0.9, 10, true) });
    const agora = polar(LAYOUT.agora.theta, LAYOUT.agora.r);
    fixed.push({ kind: 'agora', spots: ring(agora, 3.4, 8, true) });
    const views = [];
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * Math.PI * 2, r = edgeRadius(th) - 1.7, at = new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
      if (ok(at)) views.push({ at, face: faceTo(new THREE.Vector3(), at) });
    }
    fixed.push({ kind: 'view', spots: views });
  }
  const places = [...fixed];
  for (const [key, v] of buildings) {
    if (v.kind === 'tool') {
      const door = doorWorld(v.b), out = door.clone().sub(v.b.group.position).setY(0).normalize();
      const spots = [-1, 0, 1].map((k) => door.clone().addScaledVector(out, 1.4).add(new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(k * 1.1))).filter(ok);
      places.push({ kind: 'workshop', label: `looking round ${v.info.name}`, spots: spots.map((at) => ({ at, face: faceTo(at, v.b.group.position) })), key });
    }
    if (key === 'hotel') places.push({ kind: 'hotel', spots: ring(doorWorld(v.b), 2.2, 6, false).filter((s) => s.at.distanceTo(v.b.group.position) > 2.8) });
  }
  for (const st of stations.map.values()) {
    // onlookers stand a little way back from the workers
    const spots = [-1.2, 0, 1.2].map((x) => ({ at: st.group.localToWorld(new THREE.Vector3(x, 0, 2.5)).setY(0), face: st.facing })).filter((s) => ok(s.at));
    places.push({ kind: 'station', label: `watching the ${st.place}`, spots, key: st.key, busy: st.slots.some((s) => s.active), share: 2 });
  }
  return places;
}
// spots on a circle round `c`, facing in (or out)
function ring(c, r, n, facingIn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, at = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
    if (ok(at)) out.push({ at, face: facingIn ? faceTo(at, c) : faceTo(c, at) });
  }
  return out;
}
export const _resetTown = () => { fixed = null; }; // a map world swapped the layout

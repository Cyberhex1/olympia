// Life around the project stations on the classic map (docs/rules.md "Stations"): who works at which bench and on
// what stage, carrying finished pieces up the mountain path to the Acropolis, and what unresolved threads do in
// town between turns. main.js calls sync() before placing characters, work() for where working threads stand,
// finished() when a thread ends a turn, and update() every frame.
import * as THREE from 'three';
import { Stations, finishedPiece } from './stations.js';
import { JOBS, stageOf, pieceDone, isResolved, stageLabel } from './jobs.js';
import { townPlaces, pickActivity } from './town.js';
import { Resident } from './characters.js';
import { LAYOUT, mountainHeight, flatGround } from './world.js';
import { deg, esc } from './util.js';

const CLIMB_SPEED = 3.6;
// the ledge path that spirals up Olympus (world.js draws its stones the same way): t 0 = foot, 1 = top
const spiral = (t) => { const th = deg(100 + t * 520), r = 10.6 - t * 6.6; return new THREE.Vector3(Math.cos(th) * r, mountainHeight(r), Math.sin(th) * r); };

// Points from `from` to `to` the way characters walk (characters.js walkTo): round the mountain, by the ring road
// for trips that go some way round from out past it.
function groundPath(from, to) {
  const r0 = Math.hypot(from.x, from.z), a0 = Math.atan2(from.z, from.x), r1 = Math.hypot(to.x, to.z);
  let da = Math.atan2(to.z, to.x) - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
  const road = LAYOUT.ringRoad;
  const legs = Math.max(r0, r1) > road + 1 && Math.abs(da) > 0.35 ? [[r0, road, a0, 0], [road, road, a0, da], [road, r1, a0 + da, 0]] : [[r0, r1, a0, da]];
  const pts = [];
  for (const [ra, rb, a, d] of legs) {
    const len = Math.abs(d) * (ra + rb) / 2 + Math.abs(rb - ra), n = Math.max(1, Math.ceil(len / 0.6));
    for (let i = 1; i <= n; i++) { const u = i / n, r = ra + (rb - ra) * u, th = a + d * u; pts.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r)); }
  }
  return pts;
}

export class StationLife {
  // deps: { scene, fx, buildings, residents, doorWorld, summitDoor (Vector3), summitName(), onSummit(), bubbles, feed }
  constructor(deps) {
    Object.assign(this, deps);
    this.stations = new Stations(deps.scene, deps.fx);
    this.stages = new Map(); // id -> last stage shown, to say when a piece moves on
  }

  // The station a thread works at: its building's, or (tourists) its project's by the Hotel. null: none (the Agora).
  keyOf(a) {
    if (!a || a.kind !== 'session') return null;
    if (a.tourist) return a.station && a.project ? `t:${a.project}` : null;
    return this.buildings.has(`p:${a.project}`) ? `p:${a.project}` : null;
  }
  stationOf(a) { return this.stations.get(this.keyOf(a)); }

  // Put up a station beside every project building, and one by the Hotel for each tourist project that is out.
  sync(projects, claude, out = () => true) {
    const want = [];
    for (const p of projects) {
      const e = this.buildings.get(`p:${p.id}`);
      if (e) want.push({ key: `p:${p.id}`, job: p.station, door: this.doorWorld(e.b), center: e.b.group.position });
    }
    const hotel = this.buildings.get('hotel'), seen = new Set();
    for (const c of claude) {
      if (!hotel || c.kind !== 'session' || !c.tourist || !c.station || seen.has(c.project) || seen.size >= 4 || !out(c)) continue;
      seen.add(c.project);
      want.push({ key: `t:${c.project}`, job: c.station, door: this.doorWorld(hotel.b), center: hotel.b.group.position, sides: [4.8, -4.8, 9.4, -9.4] });
    }
    this.stations.sync(want);
  }

  // Who stands at which bench. list: the characters out now. Each station shows its working threads' pieces first,
  // then pieces that unresolved threads left half-made. Returns Map id -> { spot, face, motion } for working threads.
  work(list) {
    const by = new Map();
    for (const a of list) {
      const st = this.stationOf(a); if (!st) continue;
      if (a.state !== 'working' && pieceDone(a)) continue;
      if (!by.has(st)) by.set(st, []);
      by.get(st).push(a);
    }
    const at = new Map();
    for (const st of this.stations.map.values()) {
      const mine = (by.get(st) || []).sort((x, y) => (y.state === 'working') - (x.state === 'working') || (y.lastActive || 0) - (x.lastActive || 0));
      st.show(mine.map((a) => ({ id: a.id, stage: stageOf(a), active: a.state === 'working' })));
      for (const a of mine) {
        if (a.state !== 'working') continue;
        const n = st.slotOf(a.id) ?? 0, stage = stageOf(a);
        at.set(a.id, { spot: st.spot(n), face: st.facing, motion: JOBS[st.job].motion });
        const was = this.stages.get(a.id);
        // a piece moving on to its next stage gets a word (it comes from the thread's own checklist)
        if (was && stage > was) { const r = this.residents.get(a.id); if (r) this.bubbles.show(`r:${a.id}`, r.anchor, `${st.place} · ${a.title.slice(0, 30)}`, `<em>${esc(stageLabel(st.job, stage))}</em>`, 4); }
        this.stages.set(a.id, stage);
      }
    }
    return at;
  }

  // "Smithy: Hammering the blade (2/4)" for a working thread's name tag; "fishing at the pond" for one in town
  doing(a, r) {
    const st = this.stationOf(a);
    if (r?.route) return r.held ? `carrying ${JOBS[st?.job]?.result || 'its work'} up to ${this.summitName()}` : 'on its way home';
    if (a.state === 'working' && st) return `${st.place}: ${stageLabel(st.job, stageOf(a))}`;
    return r?.activity?.label || null;
  }

  // A thread ended its turn. A finished piece is carried up the mountain path to the Acropolis, then the thread walks
  // home (and in, if it is resolved); an unfinished one stays on the bench. Returns false when it has no station.
  finished(e, r, now) {
    const a = { ...now, ...e, state: 'idle' }, st = this.stationOf(a);
    if (!st) return false;
    const job = JOBS[st.job], title = esc(a.title || 'A thread');
    if (!pieceDone(a)) {
      const stage = stageOf(a);
      this.feed.push(`<b>${title}</b> finished a turn and left its ${job.result.replace(/^an? /, '')} on the ${esc(st.place)} at ${esc(stageLabel(st.job, stage))}.`, e.at);
      this.bubbles.show(`r:${e.id}`, r.anchor, `${(a.title || '').slice(0, 34)} · turn done`, `<em>Leaving it on the bench: ${esc(stageLabel(st.job, stage))}.</em>`, 5);
      return true;
    }
    this.feed.push(`<b>${title}</b> finished ${job.result} at the ${esc(st.place)} and is taking it up to ${esc(this.summitName())}.`, e.at);
    this.bubbles.show(`r:${e.id}`, r.anchor, `${(a.title || '').slice(0, 34)} · done`, `<em>Finished ${esc(job.result)}! Taking it up to ${esc(this.summitName())}.</em>`, 5);
    this.stages.delete(e.id);
    st.take(e.id);
    r.carry(finishedPiece(st.job));
    this.climb(r, a, job, isResolved(a));
    return true;
  }

  climb(r, a, job, resolved) {
    const top = this.summitDoor.clone(), from = r.group.position.clone();
    const home = resolved ? this.homeDoor(a) || r.home : r.home;
    const arrive = Object.assign(top.clone(), { wait: 2, onReach: () => {
      r.drop(); this.onSummit(); this.fx.sparkle(top.clone().setY(top.y + 2), '#ffe48a', 30);
      this.feed.push(`<b>${esc(a.title || 'A thread')}</b> delivered ${esc(job.result)} to ${esc(this.summitName())}.`);
    } });
    let up, down;
    if (flatGround()) { up = [arrive]; down = groundPath(top, home); }
    else {
      const path = Array.from({ length: 141 }, (_, i) => spiral(i / 140));
      up = [...groundPath(from, path[0]), ...path, arrive];
      down = [...[...path].reverse(), ...groundPath(path[0], home)];
    }
    r.followRoute([...up, ...down], CLIMB_SPEED, () => { r.pause = 0.5; });
  }
  homeDoor(a) { const e = a.tourist ? this.buildings.get('hotel') : this.buildings.get(`p:${a.project}`); return e ? this.doorWorld(e.b) : null; }

  // The next thing an unresolved thread does in town (characters.js calls this when it is ready to move on).
  town(r) {
    const mine = this.keyOf(r.data);
    const places = townPlaces(this.buildings, this.stations, this.doorWorld).filter((p) => p.key !== mine || p.kind !== 'station');
    places.push({ kind: 'home', spots: [{ at: r.pickWander(), face: null }] });
    const act = pickActivity(places, r.R, { prev: r.lastKind, taken: (at) => Resident.taken(at.x, at.z, r), resting: r.state === 'sleeping' });
    if (act) r.lastKind = act.kind;
    return act;
  }

  update(dt, t) { this.stations.update(dt, t); }
}

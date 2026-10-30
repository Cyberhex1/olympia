// Who is out on the island, and where each character should be. Pure (no three.js), so tests can drive it.
//   threads in a C:\code project live at its building; after a day without activity they go inside, except the
//   building's latest few, which rest outside so the island never looks deserted
//   tourists (work outside C:\code) stay at the Hotel and check out after two quiet days
//   helpers (subagents) trail the thread that started them and leave once they finish
export const TOURIST_STAY_MS = 48 * 3600_000;
export const HELPER_LINGER_MS = 90_000;
const RANK = { waiting: 0, working: 1, idle: 2, sleeping: 3 };

// A building is never left empty: its latest few threads stay out, resting by the door, after a quiet day.
export const RESTING_PER_HOME = 3;
// With project stations (classic map): a thread that isn't resolved stays out in town this long after its last work
// (its building's latest few stay out longer); a resolved one goes inside until it is called again.
export const TOWN_MS = 3 * 86400_000;

// stations: the classic map's rules (resolved threads go in, unresolved ones stay out in town); otherwise the
// older ones (a day without work and they go in, apart from each building's latest few)
export function visibleCast(claude = [], now = Date.now(), max = 20, { stations = false, resolved = () => false } = {}) {
  const latest = new Set(), perHome = new Map();
  for (const c of [...claude].filter((x) => x.kind === 'session' && !x.tourist && !(stations && resolved(x))).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))) {
    const n = perHome.get(c.project) || 0;
    if (n < RESTING_PER_HOME) { latest.add(c.id); perHome.set(c.project, n + 1); }
  }
  const out = (c) => c.tourist ? now - c.lastActive < TOURIST_STAY_MS
    : stations ? now - c.lastActive < TOWN_MS || latest.has(c.id) : c.state !== 'sleeping' || latest.has(c.id);
  const sessions = claude.filter((c) => c.kind === 'session' && (
    c.state === 'waiting' || c.state === 'working' || (!(stations && resolved(c)) && out(c))));
  const shown = new Set(sessions.map((c) => c.id));
  const helpers = claude.filter((c) => c.kind === 'agent' && shown.has(c.parent) && (c.state === 'working' || now - c.lastActive < HELPER_LINGER_MS));
  return [...sessions, ...helpers]
    .sort((a, b) => (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) || (b.lastActive || 0) - (a.lastActive || 0))
    .slice(0, max);
}

// Where a character goes: a working thread walks to the workshop for its current tool, then home again.
// toolKey(tool) -> workshop key or null; returns a building key ('forge', 'library', ...) or 'home'.
export function destination(c, toolKey) {
  if (c.state !== 'working' || c.kind === 'agent' || !c.tool) return 'home';
  return toolKey(c.tool) || 'home';
}

// A working thread finishes each trip and stays a moment before heading somewhere else, so quick tool
// switches (Read, Bash, Read...) don't make it ping-pong across the island or turn back halfway.
export const WORKSHOP_DWELL_MS = 8_000; // at the workshop, counted from arrival
export const TRIP_MAX_MS = 30_000;      // a trip that somehow never arrives is given up after this

// memo: Map id -> { dest, since, arrivedAt }, kept by the caller between snapshots. `arrived`: the character is
// standing at the place it was heading to. Returns where to head now.
export function settleDestination(memo, id, dest, now = Date.now(), working = true, arrived = false) {
  const m = memo.get(id);
  if (m && arrived && !m.arrivedAt) m.arrivedAt = now;
  // leaving home for work is never held back: only trips between workshops wait
  if (m && m.dest !== dest && working && m.dest !== 'home') {
    const done = m.arrivedAt ? now - m.arrivedAt >= WORKSHOP_DWELL_MS : now - m.since >= TRIP_MAX_MS;
    if (!done) return m.dest;
  }
  if (!m || m.dest !== dest) memo.set(id, { dest, since: now, arrivedAt: null });
  return dest;
}

// Characters heading to the same place stand side by side in front of its door instead of on top of each
// other. ids: everyone going there. Returns Map id -> offset along the door's front (0 = centre), in places.
export function spreadAt(ids) {
  const list = [...ids].sort(), n = list.length;
  return new Map(list.map((id, k) => [id, k - (n - 1) / 2]));
}

// Inside a few days the island quietly says when a tourist will leave.
export function checkoutIn(c, now = Date.now()) {
  return c.tourist ? Math.max(0, c.lastActive + TOURIST_STAY_MS - now) : null;
}

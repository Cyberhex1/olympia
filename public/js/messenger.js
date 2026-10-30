// Decides what the messenger should be doing from the live list of Claude sessions.
// It looks at everyone, not at single signals, so one session finishing can't send the
// messenger home while another is still busy, and a missed signal can't leave it stranded.
// Pure (no three.js), so tests can drive it.

export const REPLY_MS = 6000; // how long the messenger shows "delivering the reply" after the last session finishes

// sessions: [{ id, state, tool, lastActive }]; prev: the previous plan (or null); now: ms
// returns { state: 'tool'|'thinking'|'speaking'|'idle', tool, id, until }
export function planMessenger(sessions, prev = null, now = Date.now()) {
  const working = sessions.filter((s) => s.state === 'working').sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  if (working.length) {
    // stay with the session it's already serving while that one is still busy, so it doesn't ping-pong
    const current = prev && working.find((s) => s.id === prev.id);
    const s = current || working.find((x) => x.tool) || working[0];
    return { state: s.tool ? 'tool' : 'thinking', tool: s.tool || null, detail: s.detail || null, title: s.title || null, id: s.id, until: 0 };
  }
  if (prev && (prev.state === 'tool' || prev.state === 'thinking')) return { state: 'speaking', tool: null, id: prev.id, until: now + REPLY_MS };
  if (prev && prev.state === 'speaking' && now < prev.until) return prev;
  return { state: 'idle', tool: null, id: null, until: 0 };
}

// Apply a session signal to a copy of the session list, so the plan can react before the next snapshot.
export function applySignal(sessions, e, now = Date.now()) {
  const list = sessions.map((s) => ({ ...s }));
  let s = list.find((x) => x.id === e.id);
  if (!s) { s = { id: e.id, kind: e.kind || 'session', title: e.title, project: e.project, state: 'idle', tool: null, lastActive: now }; list.push(s); }
  if (e.event === 'start' || e.event === 'tool') { s.state = 'working'; s.tool = e.tool || s.tool || null; s.detail = e.detail || null; s.lastActive = now; }
  if (e.event === 'done') { s.state = 'idle'; s.tool = null; s.detail = null; }
  return list;
}

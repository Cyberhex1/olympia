// Live status of open Claude Code sessions (~/.claude/sessions/<pid>.json).
// Every running Claude Code process (desktop Code tab, CLI, Remote Control threads) keeps one of these
// files up to date: busy / idle / waiting, and what it's waiting for (a permission prompt, a question).
// The file format is Claude Code's own and undocumented, so everything here is optional: if a field is
// missing or the folder is gone, Olympia falls back to reading transcripts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

// Returns Map sessionId -> { status, waitingFor, since, link, entrypoint }. Files left behind by
// processes that have exited are ignored. `isAlive` is swappable for tests.
export function readLiveSessions(dir = path.join(os.homedir(), '.claude', 'sessions'), isAlive = alive) {
  const out = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return out; }
  for (const f of files) {
    let o;
    try { o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (!o || typeof o.sessionId !== 'string' || !isAlive(o.pid)) continue;
    const prev = out.get(o.sessionId);
    if (prev && (prev.since || 0) > (o.statusUpdatedAt || 0)) continue; // two processes on one session: newest wins
    out.set(o.sessionId, {
      status: typeof o.status === 'string' ? o.status : null,
      waitingFor: typeof o.waitingFor === 'string' ? o.waitingFor.slice(0, 60) : null,
      since: Number(o.statusUpdatedAt) || Number(o.updatedAt) || null,
      // Remote Control sessions can be opened on claude.ai (also from a phone)
      link: typeof o.bridgeSessionId === 'string' && /^session_[A-Za-z0-9]+$/.test(o.bridgeSessionId) ? `https://claude.ai/code/${o.bridgeSessionId}` : null,
      entrypoint: typeof o.entrypoint === 'string' ? o.entrypoint : null,
    });
  }
  return out;
}

// Tools that stop and wait for you by design: a pending call means "needs you".
export const ASKING_TOOLS = /^(AskUserQuestion|ExitPlanMode|ask_decision|request_access)$/;
// Tools that are meant to run for a long time: a long wait on one of these is not "stuck".
export const LONG_TOOLS = /^(Agent|Task|TaskOutput|Workflow|Monitor|ScheduleWakeup|Sleep|wait|sleep|run_scheduled_task)$/i;
export const STUCK_MS = 20 * 60_000;
export const HELPER_QUIET_MS = 10 * 60_000;
export const NEEDS_MAX_MS = 12 * 3600_000; // after this a needs-you nobody answered is dropped

// Decide whether a session needs you (docs/rules.md). `info` is what the transcript says (state, pending
// tool, when it last did anything, when its helpers last did anything), `live` the process's own status
// (or undefined). Returns { kind, reason, since } or null; `stale: true` once it is older than `maxMs`.
//   asking: a permission prompt, a question, a plan to approve
//   stuck:  one tool has had no result for 20 minutes while the process is still busy
export function needsYou(info, live, now = Date.now(), maxMs = NEEDS_MAX_MS) {
  const out = (kind, reason, since) => ({ kind, reason, since, ...(now - since > maxMs && { stale: true }) });
  // a prompt is gone once the session has moved on after it appeared: a new reply or a new prompt from you. A tool
  // result alone doesn't count: one tool of a reply can finish while another still waits for your permission.
  if (live?.status === 'waiting' && !(info.at > (live.since || 0) + 5000 && !info.result)) return out('asking', live.waitingFor || 'Waiting for your answer', live.since || info.at);
  const tool = info.pending ? info.pending.replace(/^mcp__.+?__/, '') : null;
  if (tool && ASKING_TOOLS.test(tool)) {
    // a question left open in a session that has since closed is history, not a request
    if (live || now - info.at < 60 * 60_000) return out('asking', info.pending === 'ExitPlanMode' ? 'A plan to approve' : 'A question for you', info.at);
  }
  if (live?.status === 'busy' && tool && !LONG_TOOLS.test(tool) && now - info.at > STUCK_MS && !(now - (info.helperAt || 0) < HELPER_QUIET_MS)) {
    return out('stuck', `Stuck on ${tool}?`, info.at);
  }
  return null;
}

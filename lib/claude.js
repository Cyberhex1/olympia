// Claude Code sessions (~/.claude/projects) as island residents.
// Every local Claude Code session (Code tab, CLI, and project threads that run on this PC through
// Remote Control) writes a transcript here. Only metadata leaves this collector: which folder it works
// in, a title, whether it is working right now, and the name of the tool it is using. Never transcript text.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLiveSessions, needsYou } from './live.js';
import { sessionDetails } from './details.js';
import { checklistOf } from './ledger.js';

const TAIL_BYTES = 256 * 1024;

function readTail(file, bytes = TAIL_BYTES) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    if (size > len) lines.shift(); // partial first line
    return lines;
  } catch { return []; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function readHead(file, bytes = 96 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString('utf8').split('\n');
  } catch { return []; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
const ENT = { '&#34;': '"', '&quot;': '"', '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const clip = (s, n = 48) => { s = String(s || '').replace(/&#34;|&quot;|&#39;|&amp;|&lt;|&gt;/g, (m) => ENT[m]).replace(/^\[Local:[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const lastToolCall = (content) => {
  if (!Array.isArray(content)) return null;
  const uses = content.filter((x) => x.type === 'tool_use');
  return uses.length ? uses[uses.length - 1] : null;
};
// The turn was cut off: you pressed stop, or the session was closed while a prompt was open. Nothing is coming next.
const STOPPED = /^\[Request interrupted by user|Tool permission request failed|AbortError: Stream closed/;
const stopped = (entry) => {
  const c = entry?.message?.content;
  if (typeof c === 'string') return STOPPED.test(c);
  return Array.isArray(c) && c.length > 0 && c.every((b) => (b.type === 'text' && STOPPED.test(b.text || ''))
    || (b.type === 'tool_result' && STOPPED.test(typeof b.content === 'string' ? b.content : (b.content || []).map((x) => x?.text || '').join(' '))));
};
const lastToolUse = (content) => lastToolCall(content)?.name || null;

// A short, safe description of what a tool call is doing right now: the session's own one-line
// description of a command, a file name, a search query, a web site. Never file contents or full commands.
const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export function describeTool(name = '', input = {}) {
  if (!input || typeof input !== 'object') return null;
  const n = String(name).replace(/^mcp__.+?__/, '');
  const pick = (v) => (typeof v === 'string' && v.trim() ? clip(v, 60) : null);
  switch (n) {
    case 'Bash': case 'PowerShell': return pick(input.description) || pick(String(input.command || '').trim().split(/\s+/)[0]);
    case 'Read': case 'Write': case 'Edit': case 'NotebookEdit': return pick(base(input.file_path || input.notebook_path));
    case 'Grep': case 'Glob': return pick(input.pattern && `"${input.pattern}"`);
    case 'WebSearch': return pick(input.query && `"${input.query}"`);
    case 'WebFetch': case 'navigate': return pick(host(input.url));
    case 'Agent': case 'Task': return pick(input.description);
    case 'Skill': return pick(input.skill);
    case 'TodoWrite': { const t = (input.todos || []).find((x) => x?.status === 'in_progress'); return pick(t?.activeForm || t?.content); }
    case 'update_status': case 'update_progress_checklist': { const l = String(input.text || '').split(/\r?\n/).find((x) => x.trim().startsWith('✱')); return pick(l && l.replace(/^\s*✱\s*/, '')); }
    case 'reply': return 'Replying in the thread';
    case 'execute_blender_code': return 'Working in Blender';
    case 'browser_batch': {
      const acts = Array.isArray(input.actions) ? input.actions : [];
      const site = acts.map((a) => host(a?.input?.url)).find(Boolean);
      const said = acts.map((a) => a?.input?.action_summary).find((x) => typeof x === 'string');
      return pick(said || (site && `on ${site}`) || acts.map((a) => a?.name).filter((x) => typeof x === 'string').slice(0, 3).join(', '));
    }
    default: return pick(input.description || input.action_summary);
  }
}

// How far a thread has got (for its station's 4 stages, public/js/jobs.js), from the end of its transcript:
//   progress: its newest checklist (update_status or TodoWrite) as { done, total, at }
//   promptAt: when the latest prompt (yours, or a wake in a project thread) arrived; steps: tool calls since then
//   resolvedAt: when it last marked its project thread resolved (null if it reopened it since, or never did);
//   resolveSeen / progress null mean the tail didn't say, so the caller keeps what it knew
export function progressOf(lines = []) {
  let progress = null, promptAt = null, steps = 0, resolvedAt = null, resolveSeen = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l || (!progress && !l.includes('"user"') && !l.includes('tool_use'))) continue;
    const o = parse(l); if (!o || o.isSidechain) continue;
    const c = o.message?.content, at = Date.parse(o.timestamp) || null;
    if (o.type === 'user' && !o.isMeta && !promptAt && (typeof c === 'string' ? !STOPPED.test(c) : Array.isArray(c) && c.some((b) => b.type === 'text') && !stopped(o))) promptAt = at;
    if (o.type !== 'assistant' || !Array.isArray(c)) continue;
    for (const b of [...c].reverse()) {
      if (b.type !== 'tool_use') continue;
      if (!promptAt) steps++;
      if (!progress) { const list = checklistOf(b.name, b.input); if (list?.length) progress = { done: list.filter((x) => x.status === 'done').length, total: list.length, at }; }
      if (!resolveSeen && /(^|__)set_thread_resolved$/.test(b.name)) { resolveSeen = true; resolvedAt = b.input?.resolved === false ? null : at; }
    }
    if (progress && promptAt && resolveSeen) break;
  }
  return { progress, promptAt, steps, resolvedAt, resolveSeen };
}

export class ClaudeCollector {
  constructor(cfg, emit) {
    this.cfg = cfg; this.emit = emit;
    this.root = cfg.claudeProjectsDir || path.join(os.homedir(), '.claude', 'projects');
    this.days = cfg.claudeDays ?? 7;
    this.cache = new Map(); // file -> { mtime, checked, title, info }
    this.sessions = [];
    this.available = false;
    this.liveDir = cfg.claudeSessionsDir || path.join(os.homedir(), '.claude', 'sessions');
    this.isAlive = cfg.isAlive; // tests swap in a fake process check
  }

  // Sessions in C:\code\<name>\... belong to the <name> building; anything else is named after its folder.
  projectFor(cwd) {
    if (!cwd) return null;
    const root = path.resolve(this.cfg.projectsRoot || 'C:\\code').toLowerCase();
    const full = path.resolve(cwd);
    if (full.toLowerCase().startsWith(root + path.sep)) return full.slice(root.length + 1).split(path.sep)[0];
    return path.basename(full);
  }

  // Work outside the projects folder (C:\code) comes as a visitor: a tourist who stays at the Hotel.
  isTourist(cwd) {
    if (!cwd) return false;
    const root = path.resolve(this.cfg.projectsRoot || 'C:\\code').toLowerCase();
    return !path.resolve(cwd).toLowerCase().startsWith(root + path.sep);
  }

  // A project thread names its own task on the first line of its status checklist ("Olympia: five new features");
  // the newest one in `lines`, or null.
  statusTitle(lines = []) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('update_status') && !lines[i].includes('update_progress_checklist')) continue;
      const o = parse(lines[i]);
      const use = Array.isArray(o?.message?.content) && o.message.content.find((b) => b.type === 'tool_use' && /(^|__)(update_status|update_progress_checklist)$/.test(b.name));
      const first = typeof use?.input?.text === 'string' && use.input.text.split(/\r?\n/)[0].replace(/\*\*/g, '').trim();
      if (first && !/^[✓✱○]/.test(first)) return clip(first);
    }
    return null;
  }

  // `status`: the thread's checklist title if one is known. It tells threads apart better than their first message,
  // which for a thread that was resumed is often just "keep going".
  title(dir, id, head, status = this.statusTitle(head)) {
    try {
      const t = JSON.parse(fs.readFileSync(path.join(dir, id, 'custom-title.json'), 'utf8')).customTitle;
      if (t) return clip(t);
    } catch {}
    if (status) return status;
    if (this.cfg.claudeTitlesFromPrompts === false) return `Session ${id.slice(0, 6)}`;
    for (const l of head) {
      const o = parse(l); if (!o) continue;
      const text = typeof o.content === 'string' ? o.content : typeof o.message?.content === 'string' ? o.message.content : null;
      if (!text) continue;
      // project threads arrive wrapped; take the person's own words
      const m = text.match(/<message[^>]*trigger="true"[^>]*>([\s\S]*?)<\/message>/) || text.match(/<cited[^>]*author="user"[^>]*>([\s\S]*?)<\/cited>/);
      if (m) return clip(m[1].replace(/https?:\/\/\S+/g, ''));
      if (o.type === 'user' && !text.trim().startsWith('<')) return clip(text);
    }
    return `Session ${id.slice(0, 6)}`;
  }

  // The project thread a session works for (its root message id), or null for an ordinary session. A thread
  // that goes offline and comes back continues in a new session; the old process can linger with a stale prompt.
  threadOf(head) {
    for (const l of head) {
      if (!l.includes('<wake')) continue;
      const o = parse(l);
      const text = typeof o?.content === 'string' ? o.content : typeof o?.message?.content === 'string' ? o.message.content : '';
      const m = text.match(/<thread (?:ts|id)="(cmsg_\w+)"/) || text.match(/<message[^>]*trigger="true"[^>]*\sid="(cmsg_\w+)"/);
      if (m) return m[1];
    }
    return null;
  }

  // State comes from the last conversation entry and ITS timestamp, not the file's modified time:
  // renames, attachments and other bookkeeping lines don't count as activity.
  inspect(file, mtime, now) {
    const tail = readTail(file);
    // the folder a session was started in is its project (later cwds can wander into subfolders)
    let cwd = null, last = null, tool = null, call = null;
    for (const l of readHead(file, 32 * 1024)) { const o = parse(l); if (o?.cwd) { cwd = o.cwd; break; } }
    for (let i = tail.length - 1; i >= 0 && !last; i--) {
      const o = parse(tail[i]); if (!o) continue;
      if (!cwd && o.cwd) cwd = o.cwd;
      if (o.isSidechain && !file.includes(`${path.sep}subagents${path.sep}`)) continue;
      if (o.type === 'assistant' || o.type === 'user') {
        last = o;
        call = lastToolCall(o.message?.content);
        if (!call) { // a tool result, or a thinking/text block before the tool call: find the latest tool
          for (let j = i - 1; j >= 0 && !call; j--) { const p = parse(tail[j]); if (p?.type === 'assistant') call = lastToolCall(p.message?.content); if (p?.type === 'user' && typeof p.message?.content === 'string') break; }
        }
        tool = call?.name || null;
      }
    }
    const at = Date.parse(last?.timestamp) || mtime;
    const age = now - at;
    const stop = last?.type === 'assistant' ? last.message?.stop_reason : null;
    const finished = stop === 'end_turn' || stop === 'stop_sequence' || stop === 'max_tokens' || stop === 'refusal';
    let state;
    if (!last) state = age > 24 * 3600_000 ? 'sleeping' : 'idle';
    else if (last.type === 'assistant' && !finished) state = age < 10 * 60_000 ? 'working' : 'idle'; // mid-turn or waiting on a tool
    else if (last.type === 'user') state = age < 3 * 60_000 && !stopped(last) ? 'working' : 'idle';  // thinking about a prompt or tool result
    else state = 'idle';                                                                                // the turn ended
    if (state === 'idle' && age > 24 * 3600_000) state = 'sleeping';
    const detail = state === 'working' && call && this.cfg.claudeDetails !== false ? describeTool(call.name, call.input) : null;
    // a tool call the session made and is still waiting on (no result yet)
    const pending = last?.type === 'assistant' && !finished && lastToolCall(last.message?.content) ? call.name : null;
    // the turn is still open (a prompt or tool result to answer, or a tool call to finish): the live status can say it's still busy
    const open = !!last && ((last.type === 'user' && !stopped(last)) || (last.type === 'assistant' && !finished));
    // the newest entry is only a tool's result (another tool of the same reply may still be waiting on a prompt)
    const result = last?.type === 'user' && Array.isArray(last.message?.content) && last.message.content.length > 0 && last.message.content.every((b) => b.type === 'tool_result') && !stopped(last);
    return { cwd, state, tool: state === 'working' ? tool || null : null, detail, at, pending, open, call, result, ...progressOf(tail) };
  }

  poll() {
    const now = Date.now(), cutoff = now - this.days * 86400_000;
    let dirs = [];
    try { dirs = fs.readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); this.available = true; }
    catch { this.available = false; this.sessions = []; return; }
    const out = [];
    const live = readLiveSessions(this.liveDir, this.isAlive);
    const where = new Map(); // id -> { file, cwd } for details on click
    const threads = new Map(); // session id -> project thread id (kept here, never sent to the page)
    for (const d of dirs) {
      const dir = path.join(this.root, d);
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of files) {
        const file = path.join(dir, f), id = f.slice(0, -6);
        let st; try { st = fs.statSync(file); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        let c = this.cache.get(file);
        if (!c || c.mtime !== st.mtimeMs || now - c.checked > 15_000) {
          const renamed = !c || now - (c.titled || 0) > 60_000, head = renamed ? readHead(file) : null;
          // the newest checklist title near the end, else the last one seen, else one near the start
          // (once per file, the whole transcript is searched when neither end has one)
          const status = renamed ? this.statusTitle(readTail(file)) || c?.status || this.statusTitle(head) || (!c?.scanned && this.statusTitle(readTail(file, 32 << 20))) || null : c.status;
          // the checklist and "resolved" may have scrolled out of the tail: keep what was known
          const info = this.inspect(file, st.mtimeMs, now);
          if (!info.progress && c?.info.progress) info.progress = c.info.progress;
          if (!info.resolveSeen && c?.info.resolveSeen) Object.assign(info, { resolveSeen: true, resolvedAt: c.info.resolvedAt });
          if (!c && (!info.progress || !info.resolveSeen)) { // first look: once, the whole transcript
            const all = progressOf(readTail(file, 32 << 20));
            if (!info.progress) info.progress = all.progress;
            if (!info.resolveSeen && all.resolveSeen) Object.assign(info, { resolveSeen: true, resolvedAt: all.resolvedAt });
          }
          c = { mtime: st.mtimeMs, checked: now, titled: renamed ? now : c.titled, title: renamed ? this.title(dir, id, head, status) : c.title, status, scanned: true,
            thread: renamed ? this.threadOf(head) : c.thread, info };
          this.cache.set(file, c);
        }
        const project = this.projectFor(c.info.cwd), tourist = this.isTourist(c.info.cwd);
        const lv = live.get(id);
        where.set(id, { file, cwd: c.info.cwd });
        // helper agents this session spawned (recent ones only)
        let subs = [];
        try { subs = fs.readdirSync(path.join(dir, id, 'subagents')).filter((x) => x.endsWith('.jsonl')); } catch {}
        const helpers = [];
        for (const s of subs) {
          const sf = path.join(dir, id, 'subagents', s);
          let ss; try { ss = fs.statSync(sf); } catch { continue; }
          if (now - ss.mtimeMs > 2 * 3600_000) continue;
          let meta = {};
          try { meta = JSON.parse(fs.readFileSync(sf.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch {}
          const label = typeof meta.description === 'string' ? meta.description : typeof meta.agentType === 'string' ? meta.agentType : 'Helper agent';
          const ai = this.inspect(sf, ss.mtimeMs, now);
          where.set(`${id}:${s.slice(0, -6)}`, { file: sf, cwd: c.info.cwd });
          helpers.push({ id: `${id}:${s.slice(0, -6)}`, kind: 'agent', parent: id, title: clip(label, 40), project, ...(tourist && { tourist }),
            state: ai.state === 'sleeping' ? 'idle' : ai.state, tool: ai.tool, detail: ai.detail, lastActive: ai.at });
        }
        const helperAt = Math.max(0, ...helpers.map((h) => h.lastActive));
        const needs = needsYou({ ...c.info, helperAt }, lv, now, (this.cfg.needsYouHours ?? 12) * 3600_000);
        out.push({ id, kind: 'session', title: c.title, project, ...this.stateOf(c.info, lv, needs, live.size > 0, now),
          lastActive: c.info.at, link: lv?.link || null, ...(tourist && { tourist }),
          // how far its piece has got and whether it is finished with (public/js/jobs.js)
          progress: c.info.progress, steps: c.info.steps, promptAt: c.info.promptAt, isThread: Boolean(c.thread),
          resolved: Boolean(c.info.resolvedAt && c.info.resolvedAt >= (c.info.promptAt || 0)) });
        if (c.thread) threads.set(id, c.thread);
        out.push(...helpers);
      }
    }
    const seenFiles = new Set(out.filter((s) => s.kind === 'session').map((s) => s.id));
    for (const f of this.cache.keys()) if (!seenFiles.has(path.basename(f, '.jsonl'))) this.cache.delete(f);
    out.sort((a, b) => b.lastActive - a.lastActive);
    // one character per project thread: its newest session. Older sessions of the thread (and anything they
    // were waiting on) are history, even while their process is still open.
    const newest = new Map(), gone = new Set();
    for (const s of out) {
      const t = s.kind === 'session' && threads.get(s.id);
      if (t) { if (newest.has(t)) gone.add(s.id); else newest.set(t, s.id); }
    }
    // the cap never hides a thread that needs you or is working: those rank first, then the most recent;
    // helpers come along with the thread they belong to
    const RANK = { waiting: 0, working: 1 };
    const kept = new Set(out.filter((s) => s.kind === 'session' && !gone.has(s.id))
      .sort((a, b) => (RANK[a.state] ?? 2) - (RANK[b.state] ?? 2) || b.lastActive - a.lastActive)
      .slice(0, this.cfg.claudeMaxCharacters || 24).map((s) => s.id));
    const list = out.filter((s) => kept.has(s.kind === 'agent' ? s.parent : s.id));
    // events: a session started work, switched tool, or finished its turn
    const prev = new Map(this.sessions.map((s) => [s.id, s]));
    for (const s of list) {
      const p = prev.get(s.id) || (this.polled ? { state: 'idle', tool: null } : null); // brand-new sessions announce themselves
      if (!p) continue;
      const base = { type: 'claude', id: s.id, kind: s.kind, title: s.title, project: s.project };
      // a new reason while it already needs you updates the line, but only entering needs-you notifies
      if (s.state === 'waiting' && (p.state !== 'waiting' || p.needs?.reason !== s.needs.reason)) this.emit({ ...base, event: 'needs', needs: s.needs, link: s.link, ...(p.state === 'waiting' && { again: true }) });
      else if (p.state !== 'working' && s.state === 'working') this.emit({ ...base, event: 'start', tool: s.tool, detail: s.detail });
      else if (s.state === 'working' && ((s.tool && s.tool !== p.tool) || (s.detail && s.detail !== p.detail))) this.emit({ ...base, event: 'tool', tool: s.tool, detail: s.detail });
      else if (p.state === 'working' && s.state === 'idle') this.emit({ ...base, event: 'done', progress: s.progress, steps: s.steps, promptAt: s.promptAt, resolved: s.resolved, isThread: s.isThread });
    }
    this.sessions = list;
    this.where = where;
    this.threads = threads;
    this.polled = true;
  }

  // The state a thread shows (docs/rules.md): needs you beats everything; the process's own busy/idle beats
  // the transcript's guess. A needs-you older than 12 hours is dropped: nobody is coming back to that prompt.
  stateOf(info, live, needs, liveKnown = false, now = Date.now()) {
    if (needs && !needs.stale) return { state: 'waiting', tool: null, detail: null, needs };
    let { state, tool, detail } = info;
    // Claude Code keeps a status file for every running session: once it is gone, the session can't be working
    if (!live && liveKnown && state === 'working' && now - info.at > 60_000) return { state: 'idle', tool: null, detail: null, needs: null };
    if (live?.status === 'busy' && info.open && state !== 'working' && !needs) { // a long tool that hasn't written anything yet
      state = 'working'; tool = info.call?.name || null;
      detail = tool && this.cfg.claudeDetails !== false ? describeTool(tool, info.call.input) : null;
    } else if (live?.status === 'idle' && state === 'working' && (live.since || 0) > info.at) { // interrupted, or the turn ended unrecorded
      state = 'idle'; tool = null; detail = null;
    }
    return { state, tool, detail, needs: null };
  }

  // Everything the card shows when you click a character; null for an unknown id.
  details(id) {
    const w = this.where?.get(id), s = this.sessions.find((x) => x.id === id);
    if (!w || !s) return null;
    return { id, ...sessionDetails(w.file, { cwd: w.cwd, full: this.cfg.claudeDetails !== false }),
      agents: this.sessions.filter((x) => x.parent === id).map((x) => ({ id: x.id, title: x.title, state: x.state })) };
  }

  projects() { return [...new Set(this.sessions.map((s) => s.project).filter(Boolean))]; }
}

// The building id a session's folder belongs to: the code project's own spelling when the names
// match ignoring case (C:\Code\MyApp -> "myapp"), otherwise the folder name as-is.
export function canonicalProject(id, codeProjects) {
  if (!id) return id;
  const hit = codeProjects.find((p) => p.id.toLowerCase() === id.toLowerCase());
  return hit ? hit.id : id;
}

// Code projects plus any folder under C:\code a Claude session worked in this week. Work outside C:\code
// (tourists) gets no building: those characters stay at the Hotel. Folders in `exclude` don't get a
// building of their own either (unless in `keep`); their sessions still appear as characters.
// Returns the building list and the sessions with `project` rewritten to the building's id.
// `keep`: folders that get a building even though they are in `exclude` (the island's own folder: its threads
// live on the ground like everyone else's; it's only kept out of git and file watching).
export function mergeProjects(codeProjects, rawSessions, { exclude = [], keep = [] } = {}) {
  const kept = new Set(keep.filter(Boolean).map((x) => String(x).toLowerCase()));
  const skip = new Set(exclude.map((x) => x.toLowerCase()).filter((x) => !kept.has(x)));
  const list = codeProjects.map((p) => ({ ...p }));
  const byId = new Map(list.map((p) => [p.id.toLowerCase(), p]));
  const sessions = rawSessions.map((s) => {
    const id = canonicalProject(s.project, codeProjects);
    return id !== s.project ? { ...s, project: id } : s;
  });
  const ids = [...new Set(sessions.map((s) => s.project).filter(Boolean))];
  for (const id of ids) {
    const mine = sessions.filter((s) => s.project === id);
    let p = byId.get(id.toLowerCase());
    if (!p) {
      if (skip.has(id.toLowerCase()) || mine.every((s) => s.tourist)) continue;
      p = { id, name: id, style: null, git: false, branch: null, lastCommitAt: null, lastCommit: null, dirty: 0, lastTouch: null, path: null, status: 'idle', claudeOnly: true };
      list.push(p); byId.set(id.toLowerCase(), p);
    }
    const sess = mine.filter((s) => s.kind === 'session'), agents = mine.filter((s) => s.kind === 'agent');
    p.sessions = sess.length;
    p.working = sess.filter((s) => s.state === 'working').length;
    p.waiting = sess.filter((s) => s.state === 'waiting').length;
    p.agents = agents.length;
    p.agentsWorking = agents.filter((s) => s.state === 'working').length;
    if (p.working || p.agentsWorking) p.status = 'busy';
    p.lastClaude = Math.max(...mine.map((s) => s.lastActive));
  }
  return { projects: list, sessions };
}

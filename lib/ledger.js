// A running ledger of what every Claude Code session did, for the daily recap and the usage meter.
// Transcripts only ever grow, so each file is read once and then only its new bytes, in the background.
// It keeps a compact record per reply (time, model, tokens, tool names, files edited, checklist):
// never message text, command lines or file contents.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { describeTool } from './claude.js';

const DAY = 86400_000;
const short = (n) => String(n || '').replace(/^mcp__.+?__/, '');
const clip = (s, n) => { s = String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const EDITS = /^(Edit|Write|MultiEdit|NotebookEdit|edit_block|write_file)$/;

// checklist items from update_status ("✓ done / ✱ doing / ○ todo") or TodoWrite
export function checklistOf(name, input) {
  const n = short(name);
  if ((n === 'update_status' || n === 'update_progress_checklist') && typeof input?.text === 'string') {
    const marks = { '✓': 'done', '✱': 'doing', '○': 'todo' };
    const items = input.text.split(/\r?\n/).map((l) => l.replace(/\*\*/g, '').trim()).filter((l) => marks[l[0]]).map((l) => ({ status: marks[l[0]], text: clip(l.slice(1), 80) }));
    return items.length ? items : null;
  }
  if (n === 'TodoWrite' && Array.isArray(input?.todos)) {
    const st = { completed: 'done', in_progress: 'doing', pending: 'todo' };
    const items = input.todos.filter((t) => t && typeof t.content === 'string').map((t) => ({ status: st[t.status] || 'todo', text: clip(t.content, 80) }));
    return items.length ? items : null;
  }
  return null;
}

export class Ledger {
  constructor(root, { days = 8 } = {}) {
    this.root = root; this.days = days;
    this.files = new Map(); // file -> { offset, size, cwd, id, parent, recs: [], seen: Set }
    this.scanning = null;
  }

  // Read whatever is new in every recent transcript. Safe to call often; overlapping calls share one scan.
  scan(now = Date.now()) {
    if (!this.scanning) this.scanning = this._scan(now).finally(() => { this.scanning = null; });
    return this.scanning;
  }

  async _scan(now) {
    const cutoff = now - this.days * DAY;
    let dirs = [];
    try { dirs = fs.readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return; }
    const seen = new Set();
    for (const d of dirs) {
      const dir = path.join(this.root, d);
      let names = [];
      try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of names) {
        const id = f.slice(0, -6), file = path.join(dir, f);
        await this._file(file, { id, dir }, cutoff, seen);
        let subs = [];
        try { subs = fs.readdirSync(path.join(dir, id, 'subagents')).filter((x) => x.endsWith('.jsonl')); } catch {}
        for (const s of subs) await this._file(path.join(dir, id, 'subagents', s), { id: `${id}:${s.slice(0, -6)}`, parent: id, dir }, cutoff, seen);
      }
    }
    for (const f of this.files.keys()) if (!seen.has(f)) this.files.delete(f);
    for (const e of this.files.values()) if (e.recs.length && e.recs[0].at < cutoff) e.recs = e.recs.filter((r) => r.at >= cutoff);
  }

  async _file(file, meta, cutoff, seen) {
    let st; try { st = fs.statSync(file); } catch { return; }
    if (st.mtimeMs < cutoff) return;
    seen.add(file);
    let e = this.files.get(file);
    if (!e || st.size < e.offset) { e = { offset: 0, cwd: null, ...meta, recs: [], seen: new Set() }; this.files.set(file, e); }
    if (st.size === e.offset) return;
    await this._read(file, e, st.size);
  }

  async _read(file, e, size) {
    const stream = fs.createReadStream(file, { start: e.offset, end: size - 1 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let consumed = 0, pending = 0;
    for await (const line of rl) {
      // only whole lines count: a line still being written is read again next time
      pending = Buffer.byteLength(line) + 1;
      consumed += pending;
      if (!e.cwd && line.includes('"cwd"')) { const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(line); if (m) try { e.cwd = JSON.parse(`"${m[1]}"`); } catch {} }
      if (!line.includes('"type":"assistant"')) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      this._record(e, o);
    }
    // readline gives the last line even without a newline; if the file didn't end in one, re-read it later
    let last = '';
    try { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, size - 1); fs.closeSync(fd); last = b.toString(); } catch {}
    e.offset += last === '\n' ? consumed : consumed - pending;
    if (e.offset > size) e.offset = size;
  }

  _record(e, o) {
    if (o.type !== 'assistant' || !Array.isArray(o.message?.content)) return;
    const at = Date.parse(o.timestamp); if (!at) return;
    const rec = { at, model: o.message.model || null, tok: 0, out: 0, tools: [] };
    // one reply is written as several lines (one per block) that repeat its usage: count it once
    const mid = o.message.id;
    if (o.message.usage && !(mid && e.seen.has(mid))) {
      const u = o.message.usage;
      rec.tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
      rec.out = u.output_tokens || 0;
      if (mid) { e.seen.add(mid); if (e.seen.size > 4000) e.seen = new Set([...e.seen].slice(-2000)); }
    }
    for (const b of o.message.content) {
      if (b.type !== 'tool_use') continue;
      const t = { name: b.name };
      if (EDITS.test(short(b.name))) {
        const p = String(b.input?.file_path || b.input?.notebook_path || b.input?.path || '');
        if (p) t.file = e.cwd && path.resolve(p).toLowerCase().startsWith(path.resolve(e.cwd).toLowerCase() + path.sep) ? path.relative(e.cwd, p) : path.basename(p);
      }
      const list = checklistOf(b.name, b.input); if (list) t.list = list;
      const d = describeTool(b.name, b.input); if (d && short(b.name) === 'Bash') t.detail = d;
      rec.tools.push(t);
    }
    if (rec.tok || rec.tools.length) e.recs.push(rec);
  }

  // Records in [from, to), grouped by file.
  *range(from, to) {
    for (const [file, e] of this.files) {
      const recs = e.recs.filter((r) => r.at >= from && r.at < to);
      if (recs.length) yield { file, e, recs };
    }
  }

  // Token use in a window, split by model (fresh tokens: input + output + cache writes; cache reads are cheap and left out).
  usage(from, to = Date.now()) {
    const byModel = {}; let total = 0, out = 0;
    for (const { recs } of this.range(from, to)) for (const r of recs) {
      if (!r.tok) continue;
      const m = r.model || 'unknown';
      byModel[m] = (byModel[m] || 0) + r.tok; total += r.tok; out += r.out;
    }
    return { total, out, byModel };
  }
}

// Local midnight-to-midnight for "YYYY-MM-DD" (or today).
export function dayBounds(day, now = Date.now()) {
  const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00`) : new Date(now);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setDate(end.getDate() + 1);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { key, from: d.getTime(), to: end.getTime() };
}

// What got done on one day, per project. `projectOf(cwd)` names the building; `titleOf(file, id)` the thread;
// `threadOf(file, id)` (optional) the project thread a session works for, so its sessions count once.
export function buildRecap(ledger, { from, to }, { projectOf, titleOf, threadOf }) {
  const sessions = new Map(); // session id -> summary
  for (const { file, e, recs } of ledger.range(from, to)) {
    const sid = e.parent || e.id;
    let s = sessions.get(sid);
    if (!s) { s = { id: sid, file: null, project: null, from: Infinity, to: 0, steps: 0, tokens: 0, files: new Set(), list: null, listAt: 0, helpers: 0, commands: [] }; sessions.set(sid, s); }
    if (e.parent) s.helpers++;
    else { s.file = file; s.project = projectOf(e.cwd); }
    for (const r of recs) {
      s.from = Math.min(s.from, r.at); s.to = Math.max(s.to, r.at); s.tokens += r.tok;
      for (const t of r.tools) {
        s.steps++;
        if (t.file) s.files.add(t.file);
        if (t.list && !e.parent && r.at >= s.listAt) { s.list = t.list; s.listAt = r.at; }
      }
    }
  }
  // a project thread that ran in several sessions (it went offline and came back) is one thread on the
  // recap, named and placed by its newest session; what each session finished is kept
  const threads = new Map();
  for (const s of [...sessions.values()].filter((x) => x.file).sort((a, b) => a.to - b.to)) {
    const key = threadOf?.(s.file, s.id) || s.id;
    const t = threads.get(key);
    const done = (s.list || []).filter((i) => i.status === 'done').map((i) => i.text);
    if (!t) { threads.set(key, { ...s, done }); continue; }
    for (const f of s.files) t.files.add(f);
    Object.assign(t, { id: s.id, file: s.file, project: s.project, to: s.to, list: s.list || t.list, from: Math.min(t.from, s.from),
      steps: t.steps + s.steps, tokens: t.tokens + s.tokens, helpers: t.helpers + s.helpers, done: [...new Set([...t.done, ...done])] });
  }
  const projects = new Map();
  for (const s of threads.values()) {
    const key = s.project || 'Elsewhere';
    let p = projects.get(key);
    if (!p) { p = { id: key, sessions: [], files: new Set(), tokens: 0, steps: 0 }; projects.set(key, p); }
    for (const f of s.files) p.files.add(f);
    p.tokens += s.tokens; p.steps += s.steps;
    p.sessions.push({
      id: s.id, title: titleOf(s.file, s.id), from: s.from, to: s.to, steps: s.steps, helpers: s.helpers, files: s.files.size,
      done: s.done,
      doing: (s.list || []).filter((i) => i.status === 'doing').map((i) => i.text),
      todo: (s.list || []).filter((i) => i.status === 'todo').length,
    });
  }
  return [...projects.values()].map((p) => ({ ...p, files: [...p.files].slice(0, 30), filesTotal: p.files.size, sessions: p.sessions.sort((a, b) => b.to - a.to) }))
    .sort((a, b) => b.steps - a.steps);
}

// What a single session has been doing, for its card when you click a character.
// Read on demand from the transcript tail (never broadcast): recent steps, files it changed, its checklist,
// and the last thing it said. Step lines reuse describeTool(), so commands still only show their description.
import fs from 'node:fs';
import path from 'node:path';
import { describeTool } from './claude.js';

const TAIL = 2 * 1024 * 1024;
const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const short = (n) => String(n || '').replace(/^mcp__.+?__/, '');
// strip markdown and the envelope tags project threads wrap their messages in
const plain = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();

function readTail(file, bytes = TAIL) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    if (size > len) lines.shift();
    return lines;
  } catch { return []; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

// A checklist from update_status ("✓ done / ✱ doing / ○ next") or TodoWrite.
function checklist(name, input) {
  if ((short(name) === 'update_status' || short(name) === 'update_progress_checklist') && typeof input?.text === 'string') {
    const marks = { '✓': 'done', '✱': 'doing', '○': 'todo' };
    const items = input.text.split(/\r?\n/).map((l) => l.replace(/\*\*/g, '').trim()).filter((l) => marks[l[0]])
      .map((l) => ({ status: marks[l[0]], text: clip(l.slice(1), 70) }));
    return items.length ? items : null;
  }
  if (short(name) === 'TodoWrite' && Array.isArray(input?.todos)) {
    const st = { completed: 'done', in_progress: 'doing', pending: 'todo' };
    return input.todos.filter((t) => t && typeof t.content === 'string').map((t) => ({ status: st[t.status] || 'todo', text: clip(t.content, 70) }));
  }
  return null;
}

export function sessionDetails(file, { cwd = null, full = true, maxSteps = 12 } = {}) {
  const steps = [], files = new Map();
  let list = null, lastReply = null, lastReplyAt = 0, started = null, tokens = 0;
  for (const l of readTail(file)) {
    const o = parse(l); if (!o) continue;
    if (!started && o.timestamp && (o.type === 'user' || o.type === 'assistant')) started = Date.parse(o.timestamp) || null;
    if (o.type !== 'assistant' || !Array.isArray(o.message?.content)) continue;
    const at = Date.parse(o.timestamp) || 0;
    const u = o.message.usage;
    if (u) tokens += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
    for (const b of o.message.content) {
      if (b.type === 'text' && b.text?.trim() && at >= lastReplyAt) { lastReply = b.text; lastReplyAt = at; }
      if (b.type !== 'tool_use') continue;
      steps.push({ at, tool: b.name, detail: full ? describeTool(b.name, b.input) : null });
      const n = short(b.name);
      if (/^(Edit|Write|MultiEdit|NotebookEdit|edit_block|write_file)$/.test(n)) {
        const p = String(b.input?.file_path || b.input?.notebook_path || b.input?.path || '');
        if (p) {
          const rel = cwd && path.resolve(p).toLowerCase().startsWith(path.resolve(cwd).toLowerCase() + path.sep) ? path.relative(cwd, p) : path.basename(p);
          const f = files.get(rel) || { name: rel, edits: 0, at: 0 }; f.edits++; f.at = at; files.set(rel, f);
        }
      }
      const c = checklist(b.name, b.input); if (c) list = c;
      // a project thread's visible answer is its reply, not its private text blocks
      if (n === 'reply' && typeof b.input?.text === 'string' && at >= lastReplyAt) { lastReply = b.input.text; lastReplyAt = at; }
    }
  }
  return {
    started,
    steps: steps.slice(-maxSteps).reverse(),
    stepsTotal: steps.length,
    files: [...files.values()].sort((a, b) => b.at - a.at).slice(0, 12),
    filesTotal: files.size,
    checklist: full ? list : null,
    lastReply: full && lastReply ? { text: clip(plain(lastReply), 320), at: lastReplyAt } : null,
    tokens,
  };
}

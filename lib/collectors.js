// Collectors gather the real state of this machine and feed it to the island.
// Everything here is read-only: git log/status, file-change timestamps, docker ps,
// and CPU/memory. Nothing is written anywhere.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IGNORE_DIRS = /(^|[\\/])(node_modules|\.git|dist|build|out|\.next|\.venv|venv|__pycache__|\.cache|\.turbo|coverage|Library|Temp|Logs|obj|bin)([\\/]|$)/i;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true, maxBuffer: 4 << 20, ...opts }, (err, stdout) => {
      resolve(err ? null : stdout.toString());
    });
  });
}

// Commits made in [from, to) in a repo: [{ at, subject }], newest first.
export async function commitsBetween(dir, from, to) {
  const out = await run('git', ['-C', dir, 'log', '--all', `--since=@${Math.floor(from / 1000)}`, `--until=@${Math.floor(to / 1000)}`, '--format=%ct%x1f%s', '-n', '40']);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((l) => { const [ct, s] = l.split('\x1f'); return { at: Number(ct) * 1000, subject: (s || '').slice(0, 100) }; })
    .filter((c) => c.at >= from && c.at < to);
}

// ---------------------------------------------------------------- system
export class SystemCollector {
  constructor() { this.prev = this.snapshot(); this.cpu = 0; }
  snapshot() {
    let idle = 0, total = 0;
    for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; }
    return { idle, total };
  }
  sample() {
    const now = this.snapshot();
    const dt = now.total - this.prev.total;
    if (dt > 0) this.cpu = Math.round(100 * (1 - (now.idle - this.prev.idle) / dt));
    this.prev = now;
    return this.state();
  }
  state() {
    return {
      host: os.hostname(),
      cpu: this.cpu,
      mem: Math.round(100 * (1 - os.freemem() / os.totalmem())),
      uptime: os.uptime(),
    };
  }
}

// ---------------------------------------------------------------- projects (git + file activity)
export class ProjectCollector {
  constructor(cfg, emit) {
    this.cfg = cfg; this.emit = emit;
    this.projects = new Map();
    this.watchers = new Map();
  }

  discover() {
    const root = this.cfg.projectsRoot;
    const exclude = new Set((this.cfg.exclude || []).map((s) => s.toLowerCase()));
    let names = [];
    try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); }
    catch { return; }
    for (const name of names) {
      if (exclude.has(name.toLowerCase()) || name.startsWith('.')) continue;
      const dir = path.join(root, name);
      let entries = [];
      try { entries = fs.readdirSync(dir); } catch { continue; }
      if (!entries.length) continue;
      if (!this.projects.has(name)) {
        const meta = (this.cfg.projects || {})[name] || {};
        this.projects.set(name, {
          id: name, name: meta.label || name, style: meta.style || null, dir,
          git: fs.existsSync(path.join(dir, '.git')),
          branch: null, head: null, lastCommitAt: null, lastCommit: null, dirty: 0,
          lastTouch: null, touches: 0,
        });
        this.watch(name, dir);
      }
    }
  }

  watch(id, dir) {
    try {
      const w = fs.watch(dir, { recursive: true }, (_ev, file) => {
        if (!file || IGNORE_DIRS.test(file)) return;
        const p = this.projects.get(id);
        if (!p) return;
        const now = Date.now();
        const quiet = !p.lastTouch || now - p.lastTouch > 90_000;
        p.lastTouch = now; p.touches++;
        if (quiet) this.emit({ type: 'project:busy', project: id, file: path.basename(file) });
      });
      w.on('error', () => {});
      this.watchers.set(id, w);
    } catch { /* recursive watch unsupported: git polling still works */ }
  }

  async poll() {
    this.discover();
    await Promise.all([...this.projects.values()].map(async (p) => {
      if (!p.git) {
        try { p.lastTouch = p.lastTouch || fs.statSync(p.dir).mtimeMs; } catch {}
        return;
      }
      const log = await run('git', ['-C', p.dir, 'log', '-1', '--format=%H%x1f%ct%x1f%s']);
      if (log) {
        const [hash, ct, subject] = log.trim().split('\x1f');
        if (p.head && hash && hash !== p.head) {
          this.emit({ type: 'project:commit', project: p.id, subject: (subject || '').slice(0, 90) });
        }
        p.head = hash; p.lastCommitAt = Number(ct) * 1000; p.lastCommit = (subject || '').slice(0, 120);
      }
      const st = await run('git', ['-C', p.dir, 'status', '--porcelain=v1', '-b']);
      if (st) {
        const lines = st.split('\n').filter(Boolean);
        const head = lines.shift() || '';
        p.branch = head.replace(/^## /, '').split('...')[0].replace('No commits yet on ', '');
        p.dirty = lines.length;
      }
    }));
  }

  list() {
    const now = Date.now();
    return [...this.projects.values()].map((p) => {
      const recent = Math.max(p.lastTouch || 0, p.lastCommitAt || 0);
      let status = 'idle';
      if (p.lastTouch && now - p.lastTouch < 5 * 60_000) status = 'busy';
      else if (recent && now - recent > 30 * 86400_000) status = 'sleeping';
      const { dir, head, ...rest } = p;
      return { ...rest, path: dir, status };
    });
  }
}

// ---------------------------------------------------------------- docker
export class DockerCollector {
  constructor(enabled) { this.enabled = enabled; this.containers = []; this.available = false; this.nextTry = 0; }
  async poll() {
    if (!this.enabled || Date.now() < this.nextTry) return;
    const out = await run('docker', ['ps', '-a', '--format', '{{json .}}']);
    if (out == null) { this.available = false; this.containers = []; this.nextTry = Date.now() + 120_000; return; }
    this.available = true;
    this.containers = out.split('\n').filter(Boolean).map((l) => {
      try {
        const c = JSON.parse(l);
        return { id: c.ID, name: c.Names, image: c.Image, state: c.State, status: c.Status };
      } catch { return null; }
    }).filter(Boolean).slice(0, 12);
  }
}

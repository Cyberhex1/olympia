// Picks the job each project does on the island (public/js/jobs.js) from what the project actually is: its name,
// package.json description and keywords, README and CLAUDE.md. A new project gets a fitting station on its own;
// "station" in olympia.config.json projects.<name> overrides it. Reads a few KB per project, once (re-checked hourly).
import fs from 'node:fs';
import path from 'node:path';
import { jobFromText, JOBS, FALLBACK_JOB, TOURIST_JOB } from '../public/js/jobs.js';

const head = (file, n) => { try { const fd = fs.openSync(file, 'r'); try { const b = Buffer.alloc(n); return b.subarray(0, fs.readSync(fd, b, 0, n, 0)).toString('utf8'); } finally { fs.closeSync(fd); } } catch { return ''; } };

export function describeFolder(dir) {
  if (!dir) return '';
  let text = '';
  try {
    const pj = JSON.parse(head(path.join(dir, 'package.json'), 64 * 1024));
    text += ` ${pj.name || ''} ${pj.description || ''} ${(pj.keywords || []).join(' ')}`;
  } catch {}
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return text; }
  const readme = names.find((n) => /^readme(\.|$)/i.test(n));
  if (readme) text += ` ${head(path.join(dir, readme), 4000)}`;
  if (names.includes('CLAUDE.md')) text += ` ${head(path.join(dir, 'CLAUDE.md'), 2000)}`;
  else if (names.includes('PLAN.md')) text += ` ${head(path.join(dir, 'PLAN.md'), 2000)}`;
  // what kind of files it holds says something too (.blend, .cs, .fla...)
  text += ` ${names.slice(0, 200).map((n) => ({ '.blend': 'blender', '.glb': 'glb', '.fla': 'flash', '.swf': 'flash' })[path.extname(n).toLowerCase()] || '').join(' ')}`;
  return text;
}

export class StationBook {
  constructor(cfg) { this.cfg = cfg; this.cache = new Map(); }

  // id: project folder name; dir: its folder when known; tourist: work outside C:\code
  jobFor(id, dir, tourist = false) {
    const set = (this.cfg.projects || {})[id]?.station;
    if (set && JOBS[set]) return set;
    const key = `${id}|${dir || ''}`, hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 3600_000) return hit.job;
    // the folder's own path counts too (a session in Blender's extensions folder is Blender work)
    const job = jobFromText(id, `${describeFolder(dir)} ${String(dir || '').replace(/[\\/_-]+/g, ' ')}`) || (tourist ? TOURIST_JOB : FALLBACK_JOB);
    this.cache.set(key, { job, at: Date.now() });
    return job;
  }

  // Adds `station` to each building and to tourists' sessions (their station stands by the Hotel), and the
  // configured label of a tourist's project ("my-folder" -> "My Game").
  apply(projects, sessions, cwdOf = () => null) {
    for (const p of projects) p.station = this.jobFor(p.id, p.path);
    const labels = this.cfg.projects || {};
    return sessions.map((s) => (s.tourist && s.kind === 'session'
      ? { ...s, station: this.jobFor(s.project, cwdOf(s.id), true), ...(labels[s.project]?.label && { projectLabel: labels[s.project].label }) }
      : s));
  }
}

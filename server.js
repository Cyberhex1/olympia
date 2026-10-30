// Olympia: a living 3D face for your Claude Code work and machine.
// Zero-dependency Node server: serves the island and streams live state over SSE.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SystemCollector, ProjectCollector, DockerCollector } from './lib/collectors.js';
import { ClaudeCollector, mergeProjects, canonicalProject, readHead } from './lib/claude.js';
import { Ledger, dayBounds, buildRecap } from './lib/ledger.js';
import { commitsBetween } from './lib/collectors.js';
import { usageSummary } from './lib/usage.js';
import { loadKey, loadCode, codeMatches, showCode, PairGuard, pairPage, lanHostOk, lanAccess, isLoopback, lanAddresses } from './lib/lan.js';
import { SlotBook } from './lib/slots.js';
import { StationBook } from './lib/stations.js';
import { createPower } from './lib/power.js';
import { PROJECT_SLOTS } from './public/js/shared.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// where settings and remembered state live: next to the code, or a writable folder the desktop widget picks
const DATA = process.env.OLYMPIA_DATA || ROOT;
const cfg = JSON.parse(fs.readFileSync(path.join(DATA, 'olympia.config.json'), 'utf8'));
const PORT = Number(process.env.OLYMPIA_PORT || process.env.PORT || cfg.port || 3110);
// phone access on the home network: off unless "lan": true (or OLYMPIA_LAN=1)
const LAN = process.env.OLYMPIA_LAN ? process.env.OLYMPIA_LAN === '1' : cfg.lan === true;
const HOST = process.env.OLYMPIA_HOST || (LAN ? '0.0.0.0' : cfg.host || '127.0.0.1');
// with phone access on, devices type a code once unless "lanCode": false (or OLYMPIA_LAN_CODE=0) lets any device on the network in
const LAN_CODE = process.env.OLYMPIA_LAN_CODE ? process.env.OLYMPIA_LAN_CODE !== '0' : cfg.lanCode !== false;
const KEY = LAN ? loadKey(process.env.OLYMPIA_KEY_FILE || path.join(DATA, 'olympia.key')) : null;
const CODE = LAN && LAN_CODE ? loadCode(process.env.OLYMPIA_CODE_FILE || path.join(DATA, 'olympia.code')) : null;
const guard = new PairGuard();
const TRUST_LOOPBACK = process.env.OLYMPIA_TRUST_LOOPBACK !== '0'; // tests turn this off to act as a phone
// Sleep this PC from the phone (off unless "allowSleep": true) and Wake-on-LAN info: lib/power.js
const power = createPower({ cfg, dataDir: DATA, key: KEY, trustLoopback: TRUST_LOOPBACK });

// ---------------------------------------------------------------- state
const clients = new Set();
const feed = [];

function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) { if (res.writableEnded || res.destroyed) clients.delete(res); else res.write(msg); }
}

function emit(ev) {
  ev.at = Date.now();
  feed.unshift(ev);
  feed.length = Math.min(feed.length, 60);
  broadcast('event', ev);
}

const system = new SystemCollector();
const projects = new ProjectCollector(cfg, emit);
const docker = new DockerCollector(cfg.docker !== false);
// signals from the session reader use the building's own spelling of the project
const claude = new ClaudeCollector(cfg, (e) => emit({ ...e, project: canonicalProject(e.project, projects.list()) }));
const ledger = new Ledger(claude.root);
const PLAN_FILE = process.env.OLYMPIA_USAGE_FILE || path.join(DATA, 'olympia.usage.json');
let usage = null; // refreshed after every ledger scan
const refreshUsage = () => ledger.scan().then(() => { usage = usageSummary(ledger, { planFile: PLAN_FILE }); }).catch((e) => console.error('ledger:', e.message));
const stations = new StationBook(cfg); // each project's job on the island (public/js/jobs.js)
const slots = new SlotBook(process.env.OLYMPIA_SLOTS || path.join(DATA, 'olympia.slots.json'), PROJECT_SLOTS.length);

function snapshot() {
  // the island's own folder stays out of file watching but its threads get a building on the ground
  const merged = mergeProjects(projects.list(), claude.sessions, { exclude: cfg.exclude || [], keep: [cfg.realm] });
  const spot = slots.assign(merged.projects);
  for (const p of merged.projects) p.slot = spot.get(p.id);
  merged.sessions = stations.apply(merged.projects, merged.sessions, (id) => claude.where?.get(id)?.cwd);
  return {
    owner: cfg.owner, realm: cfg.realm, tagline: cfg.tagline, place: cfg.place, theme: cfg.theme || 'olympus',
    demo: cfg.demoWhenOffline !== false && claude.sessions.length === 0,
    now: Date.now(),
    system: system.state(),
    projects: merged.projects,
    claude: merged.sessions,
    containers: docker.containers,
    usage,
    docker: docker.available,
    feed: feed.slice(0, 25),
  };
}

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

// What got done on a day, per project: threads, their finished checklist items, files touched, commits.
const recapCache = new Map(); // day -> { at, data }
async function recap(day) {
  const b = dayBounds(day); if (!b) return null;
  const hit = recapCache.get(b.key);
  if (hit && Date.now() - hit.at < 15_000) return hit.data;
  await ledger.scan();
  const code = projects.list();
  const projectOf = (cwd) => canonicalProject(claude.projectFor(cwd), code);
  const titleOf = (file, id) => claude.cache.get(file)?.title || claude.title(path.dirname(file), id, readHead(file));
  const threadOf = (file) => { const c = claude.cache.get(file); return c ? c.thread : claude.threadOf(readHead(file)); };
  const list = buildRecap(ledger, b, { projectOf, titleOf, threadOf });
  const byId = new Map(code.map((p) => [p.id, p]));
  await Promise.all(code.filter((p) => p.git && p.path).map(async (p) => {
    const commits = await commitsBetween(p.path, b.from, b.to);
    if (!commits.length) return;
    let e = list.find((x) => x.id === p.id);
    if (!e) { e = { id: p.id, sessions: [], files: [], filesTotal: 0, tokens: 0, steps: 0 }; list.push(e); }
    e.commits = commits;
  }));
  for (const e of list) { e.name = byId.get(e.id)?.name || e.id; e.building = byId.has(e.id); }
  const data = { day: b.key, from: b.from, to: b.to, oldest: dayBounds(null, Date.now() - (ledger.days - 1) * 86400_000).key, projects: list };
  recapCache.set(b.key, { at: Date.now(), data });
  if (recapCache.size > 10) recapCache.delete(recapCache.keys().next().value);
  return data;
}

// ---------------------------------------------------------------- http
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
};

function serveFile(res, base, rel) {
  const file = path.normalize(path.join(base, rel));
  if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(err.code === 'EISDIR' ? 403 : 404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '', done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => { body += c; if (body.length > 1e5) { finish(null); req.destroy(); } });
    req.on('end', () => { try { finish(JSON.parse(body || '{}')); } catch { finish(null); } });
    req.on('error', () => finish(null));
    req.on('close', () => finish(null));
  });
}
// Only JSON posts: a plain web page can't send application/json cross-origin without a preflight
// this server never approves, so other sites can't inject fake events.
const isJson = (req) => String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json');

const PUBLIC = path.join(ROOT, 'public');
const THREE = path.join(ROOT, 'node_modules', 'three');

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('request failed:', req.method, req.url, err.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

// Only answer requests addressed to this machine by a local name. Stops DNS-rebinding pages
// (evil.example pointed at 127.0.0.1) from reading session titles through the browser.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', ...(cfg.allowedHosts || []).map((h) => String(h).toLowerCase())]);
const hostOk = (req) => ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '')) || (LAN && lanHostOk(req.headers.host));

// Events you can fire by hand at /api/test; only these fields, only strings.
const TEST_TYPES = new Set(['project:commit', 'project:busy', 'task', 'claude']);
function cleanTestEvent(e) {
  const out = { type: e.type };
  for (const k of ['project', 'subject', 'file', 'name', 'event', 'id', 'title', 'kind', 'tool', 'detail']) if (str(e[k], 140) !== undefined) out[k] = str(e[k], 140);
  if (out.event === 'needs') out.needs = { kind: e.needs?.kind === 'stuck' ? 'stuck' : 'asking', reason: str(e.needs?.reason, 60) || 'Waiting for your answer', since: Date.now() };
  return out;
}

async function handle(req, res) {
  if (!hostOk(req)) { res.writeHead(421).end('wrong host'); return; }
  // anything not from this PC must have paired with the code (possible only with LAN access on),
  // unless the code is switched off: then any device on the home network gets in (the host check above still applies)
  if (!(TRUST_LOOPBACK && isLoopback(req.socket.remoteAddress)) && !(LAN && (!LAN_CODE || lanAccess({ key: KEY, cookie: req.headers.cookie }) === 'ok'))) {
    if (!LAN) { res.writeHead(401).end(); return; }
    const ip = String(req.socket.remoteAddress);
    const where = new URL(req.url, 'http://x').pathname;
    if (where === '/api/pair' && req.method === 'POST' && isJson(req)) {
      if (guard.blocked(ip)) { res.writeHead(429).end(); return; }
      const body = await readBody(req);
      if (!codeMatches(body?.code, CODE)) { guard.fail(ip); res.writeHead(403).end(); return; }
      guard.ok(ip);
      res.writeHead(204, { 'set-cookie': `olympia_key=${KEY}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000` }).end();
      return;
    }
    if (req.method === 'GET' && !where.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(pairPage(cfg.realm)); return; }
    res.writeHead(401).end();
    return;
  }
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('bad request'); return; }
  if (p.includes('\0')) { res.writeHead(400).end('bad request'); return; }

  if (p.startsWith('/api/') && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') { res.writeHead(405).end(); return; }
  if ((p === '/api/stream' || p === '/api/state') && req.method === 'POST') { res.writeHead(405).end(); return; }
  if (p.startsWith('/api/power/')) return power.handle(req, res, p, { readBody });
  if (p === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(snapshot()));
    return;
  }
  // One character's card: recent steps, files, checklist, last reply. Only on request, never streamed.
  if (p.startsWith('/api/session/') && req.method !== 'POST') {
    const d = claude.details(p.slice('/api/session/'.length));
    if (!d) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(d));
    return;
  }
  if (p === '/api/recap' && req.method !== 'POST') {
    const data = await recap(new URL(req.url, 'http://localhost').searchParams.get('day'));
    if (!data) { res.writeHead(400).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data));
    return;
  }
  // Fire a fake event to watch the island react, e.g. POST /api/test {"type":"project:commit","project":"my-project"}
  if (p === '/api/test' && req.method === 'POST') {
    const e = isJson(req) ? await readBody(req) : null;
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.type !== 'string') { res.writeHead(400).end(); return; }
    if (TEST_TYPES.has(e.type)) emit(cleanTestEvent(e));
    else { res.writeHead(400).end(); return; }
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (p.startsWith('/vendor/three/')) return serveFile(res, THREE, p.slice('/vendor/three/'.length));
  return serveFile(res, PUBLIC, p === '/' ? 'index.html' : p.slice(1));
}

// ---------------------------------------------------------------- loops
setInterval(() => system.sample(), 2000);
async function slowPoll() {
  await Promise.all([projects.poll(), docker.poll()]);
}
await slowPoll();
setInterval(slowPoll, 20_000);
refreshUsage();
setInterval(refreshUsage, 20_000);
claude.poll();
setInterval(() => claude.poll(), 3000);
setInterval(() => broadcast('state', snapshot()), 3000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`
  Port ${PORT} is already in use. Olympia may already be running: open http://localhost:${PORT}
`);
  else console.error(err);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`\n  ${cfg.realm} is alive  ->  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
  console.log(`  projects: ${projects.list().map((p) => p.name).join(', ') || '(none)'}`);
  console.log(`  claude:   ${claude.available ? `${claude.sessions.length} sessions/agents this week in ${claude.projects().length} projects` : 'no ~/.claude/projects folder'}`);
  console.log(`  docker:   ${docker.available ? `${docker.containers.length} containers` : 'not running'}\n`);
  if (LAN && HOST === '0.0.0.0') {
    const ips = lanAddresses();
    console.log(`  phone:    on the same Wi-Fi, open ${(ips.length ? ips : ['<this-pc-ip>']).map((ip) => `http://${ip}:${PORT}`).join(' or ')}`);
    console.log(CODE ? `            and type the code ${showCode(CODE)}\n` : '            (no code needed: any device on this network can open it)\n');
  }
});

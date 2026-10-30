// Bug tests for the server: bad input must never crash it or leak files.
// Starts a real server on 3111, one of Olympia's reserved ports (3110-3114). Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEST_PORT = 3111; // 3110 is the real island; tests stay inside Olympia's own port block
const SLOTS = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-slots-')), 'slots.json'); // never touch your real spots file

let PORT, B, proc, out = '';
function start(port) {
  const env = { ...process.env, PORT: String(port), OLYMPIA_SLOTS: SLOTS, OLYMPIA_POWER_LOG: path.join(path.dirname(SLOTS), 'power.log') }; // nor your power log
  delete env.OLYMPIA_PORT; // PORT alone must be enough, the way `npm run start` is run
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env });
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  return p;
}
async function waitUp() {
  for (let i = 0; i < 60; i++) { try { await fetch(`${B}/api/state`); return; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  throw new Error(`server never came up:\n${out}`);
}
// raw HTTP so we can send paths fetch() would normalise
function raw(reqLine, headers = '', body = '', host = 'localhost') {
  return new Promise((resolve) => {
    // write, don't end: a half-closed socket makes Node drop slower (file) responses; real browsers never do that
    const s = net.connect(PORT, '127.0.0.1', () => s.write(`${reqLine} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n${headers}${body ? `Content-Length: ${Buffer.byteLength(body)}\r\n` : ''}\r\n${body}`));
    let data = ''; s.on('data', (d) => { data += d; }); s.on('close', () => resolve(Number(/HTTP\/1\.1 (\d+)/.exec(data)?.[1] || 0))); s.on('error', () => resolve(0));
  });
}
const alive = async () => (await fetch(`${B}/api/state`)).status === 200;

test.before(async () => { PORT = TEST_PORT; B = `http://127.0.0.1:${PORT}`; proc = start(PORT); await waitUp(); });
test.after(() => proc?.kill());

test('malformed URLs get 400 and the server keeps running', async () => {
  assert.equal(await raw('GET /%E0%A4%A'), 400);
  assert.equal(await raw('GET /%'), 400);
  assert.ok(await alive());
});

test('no files outside public/ can be read', async () => {
  for (const p of ['/../server.js', '/..%2Fserver.js', '/..%5Cserver.js', '/vendor/three/..%2F..%2Folympia.config.json', '/%2e%2e/package.json', '/assets/..%2F..%2Fserver.js']) {
    assert.ok([400, 403, 404].includes(await raw(`GET ${p}`)), p);
  }
  assert.equal(await raw('GET /js/'), 403, 'folders are not listed');
  assert.ok(await alive());
});

test('character details: unknown or odd ids are a plain 404, posts are refused', async () => {
  for (const p of ['/api/session/nope', '/api/session/..%2F..%2Fserver.js', '/api/session/', '/api/session/%00']) assert.ok([400, 404].includes(await raw(`GET ${p}`)), p);
  assert.equal(await raw('POST /api/session/x', 'Content-Type: application/json\r\n', '{}'), 405);
  assert.ok(await alive());
});

test('page files are served with sensible types', async () => {
  for (const [p, type] of [['/', 'text/html'], ['/js/main.js', 'text/javascript'], ['/js/tools.js', 'text/javascript'], ['/assets/olympia-island.glb', 'model/gltf-binary'], ['/vendor/three/build/three.module.js', 'text/javascript']]) {
    const r = await fetch(B + p); assert.equal(r.status, 200, p); assert.ok(r.headers.get('content-type').startsWith(type), p); await r.arrayBuffer();
  }
});

test('event posts must be JSON objects', async () => {
  const post = (p, body, type = 'application/json') => fetch(B + p, { method: 'POST', headers: { 'content-type': type }, body });
  assert.equal((await post('/api/test', '{"type":"project:commit","project":"x"}', 'text/plain')).status, 400, 'cross-site simple posts refused');
  assert.equal((await post('/api/test', 'not json')).status, 400);
  assert.equal((await post('/api/test', '[1,2]')).status, 400);
  assert.equal((await post('/api/test', '{"no":"type"}')).status, 400);
  assert.equal((await post('/api/test', '{"type":"project:commit","project":"x","subject":"y"}')).status, 204);
  assert.ok(await alive());
});

test('oversized and odd requests do not hang or crash', async () => {
  const big = 'a'.repeat(300_000);
  const r = await fetch(`${B}/api/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: big }).then((x) => x.status).catch(() => 0);
  assert.ok([0, 400].includes(r));
  assert.equal(await raw('DELETE /'), 405);
  assert.equal(await raw('PUT /api/state'), 405);
  assert.equal(await raw('POST /api/state'), 405);
  assert.equal((await fetch(B + '/', { method: 'HEAD' })).status, 200);
  assert.ok(await alive());
});

test('Hermes is gone: no endpoint, no Hermes state, no Hermes test events', async () => {
  const post = (p, body) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/api/hermes', { event: 'hello' })).status, 405, 'the plugin endpoint no longer exists');
  assert.equal(await raw('GET /api/hermes'), 404);
  assert.equal((await post('/api/test', { type: 'hermes', event: 'tool_start', tool: 'Bash' })).status, 400, 'hermes test events are refused');
  const st = await (await fetch(`${B}/api/state`)).json();
  for (const k of ['hermes', 'hermesHome', 'agents']) assert.ok(!(k in st), `${k} is not in the state`);
  assert.equal(st.demo, st.claude.length === 0, 'demo mode depends only on Claude sessions');
  assert.ok(!fs.existsSync(path.join(ROOT, 'hermes-plugin')), 'the plugin folder is removed');
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'olympia.config.json'), 'utf8'));
  assert.ok(!('hermesHome' in cfg));
  assert.equal(cfg.port, 3110, 'the island lives on its reserved port');
});

test('claude test events keep only their string fields', async () => {
  const post = (body) => fetch(`${B}/api/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ type: 'claude', event: 'tool', id: 't1', title: 'Fix CI', tool: 'Bash', prompt: 'SECRET PROMPT' })).status, 204);
  const st = await (await fetch(`${B}/api/state`)).json();
  const e = st.feed.find((x) => x.type === 'claude' && x.id === 't1');
  assert.equal(e.tool, 'Bash');
  assert.ok(!JSON.stringify(st).includes('SECRET PROMPT'), 'unknown fields are dropped');
});

test('the live stream opens with a full state', async () => {
  const ctl = new AbortController();
  const r = await fetch(`${B}/api/stream`, { signal: ctl.signal });
  assert.equal(r.headers.get('content-type'), 'text/event-stream');
  const reader = r.body.getReader(); let text = '';
  while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
  ctl.abort();
  assert.match(text, /^event: state\ndata: \{/);
  const state = JSON.parse(text.split('data: ')[1]);
  for (const k of ['projects', 'claude', 'system', 'theme']) assert.ok(k in state, k);
  assert.ok(await alive(), 'dropping a stream mid-way is harmless');
});

test('a second copy on the same port explains itself and exits', async () => {
  let msg = '';
  const p2 = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, OLYMPIA_PORT: String(PORT), OLYMPIA_SLOTS: SLOTS } });
  p2.stderr.on('data', (d) => { msg += d; });
  const code = await new Promise((r) => p2.on('exit', r));
  assert.equal(code, 1);
  assert.match(msg, /already in use/);
});

test('[check #14] requests addressed to another host name are refused (DNS rebinding)', async () => {
  assert.equal(await raw('GET /api/state', '', '', 'evil.example'), 421);
  assert.equal(await raw('GET /api/stream', '', '', 'evil.example:3110'), 421);
  assert.equal(await raw('GET /', '', '', 'attacker.test'), 421);
  for (const h of ['localhost', `localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]) assert.equal(await raw('GET /api/state', '', '', h), 200, h);
});

test('phone access is off by default: other devices are refused even with a key', async () => {
  const st = await (await fetch(`${B}/api/state`)).json();
  assert.ok(st);
  assert.equal(await raw('GET /api/state', '', '', '192.168.1.20'), 421, 'a home-network address is not a valid host while LAN access is off');
  assert.equal(await raw('GET /?key=abc'), 200, 'from this PC a stray ?key is simply ignored');
});

test('with phone access on, a device must pair with the 6-digit code; the cookie then lets it in', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-key-'));
  const keyFile = path.join(dir, 'key'), codeFile = path.join(dir, 'code');
  // a free port in Olympia's own block (other Olympia threads may be using some of them)
  const free = (port) => new Promise((r) => { const srv = net.createServer().once('error', () => r(false)).listen(port, '127.0.0.1', () => srv.close(() => r(true))); });
  let PORT2 = null; for (const p of [3114, 3113, 3112]) if (await free(p)) { PORT2 = p; break; }
  if (!PORT2) return; // all busy: skip rather than touch another thread's server
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT2), OLYMPIA_SLOTS: SLOTS, OLYMPIA_LAN: '1', OLYMPIA_HOST: '127.0.0.1', OLYMPIA_TRUST_LOOPBACK: '0', OLYMPIA_KEY_FILE: keyFile, OLYMPIA_CODE_FILE: codeFile } });
  try {
    const B2 = `http://127.0.0.1:${PORT2}`;
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await fetch(`${B2}/`); up = true; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    const code = fs.readFileSync(codeFile, 'utf8').trim();
    assert.match(key, /^[a-f0-9]{48}$/);
    assert.match(code, /^\d{6}$/);
    assert.equal((await fetch(`${B2}/api/state`)).status, 401, 'not paired: refused');
    const page = await fetch(`${B2}/list.html`);
    assert.equal(page.status, 401);
    assert.match(await page.text(), /Pair this device/, 'pages show the code box instead');
    assert.equal((await fetch(`${B2}/?key=${key}`, { redirect: 'manual' })).status, 401, 'the old pairing link no longer works');
    const pairWith = (c, type = 'application/json') => fetch(`${B2}/api/pair`, { method: 'POST', headers: { 'content-type': type }, body: JSON.stringify({ code: c }) });
    const wrong = code === '000000' ? '111111' : '000000';
    assert.equal((await pairWith(wrong)).status, 403, 'wrong code: refused');
    assert.equal((await pairWith(code, 'text/plain')).status, 401, 'only a JSON request can pair (no cross-site forms)');
    const pair = await pairWith(`${code.slice(0, 3)} ${code.slice(3)}`);
    assert.equal(pair.status, 204, 'the code works with the space it is shown with');
    const cookie = pair.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await fetch(`${B2}/api/state`, { headers: { cookie: cookie.split(';')[0] } })).status, 200, 'paired: allowed');
    assert.equal((await fetch(`${B2}/api/state`, { headers: { cookie: 'olympia_key=deadbeef' } })).status, 401);
    const evil = await new Promise((resolve) => {
      const s = net.connect(PORT2, '127.0.0.1', () => s.write(`GET /api/state HTTP/1.1\r\nHost: evil.example\r\nCookie: ${cookie.split(';')[0]}\r\nConnection: close\r\n\r\n`));
      let d = ''; s.on('data', (x) => { d += x; }); s.on('close', () => resolve(Number(/HTTP\/1\.1 (\d+)/.exec(d)?.[1] || 0)));
    });
    assert.equal(evil, 421, 'a paired cookie still cannot be used through someone else\'s domain');
    for (let i = 0; i < 5; i++) await pairWith(wrong);
    assert.equal((await pairWith(code)).status, 429, 'after 5 wrong codes this device is locked out, even with the right one');
  } finally { p.kill(); }
});

test('with the code turned off, any device on the home network gets in, but only through a home-network host', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-key-'));
  const codeFile = path.join(dir, 'code');
  const free = (port) => new Promise((r) => { const srv = net.createServer().once('error', () => r(false)).listen(port, '127.0.0.1', () => srv.close(() => r(true))); });
  let PORT2 = null; for (const p of [3114, 3113, 3112]) if (await free(p)) { PORT2 = p; break; }
  if (!PORT2) return;
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT2), OLYMPIA_SLOTS: SLOTS, OLYMPIA_LAN: '1', OLYMPIA_LAN_CODE: '0', OLYMPIA_HOST: '127.0.0.1', OLYMPIA_TRUST_LOOPBACK: '0', OLYMPIA_KEY_FILE: path.join(dir, 'key'), OLYMPIA_CODE_FILE: codeFile } });
  try {
    const B2 = `http://127.0.0.1:${PORT2}`;
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await fetch(`${B2}/`); up = true; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    assert.ok(!fs.existsSync(codeFile), 'no code is made when none is needed');
    assert.equal((await fetch(`${B2}/api/state`)).status, 200, 'no cookie, no code: allowed');
    const page = await fetch(`${B2}/list.html`);
    assert.equal(page.status, 200);
    assert.doesNotMatch(await page.text(), /Pair this device/);
    const evil = await new Promise((resolve) => {
      const s = net.connect(PORT2, '127.0.0.1', () => s.write('GET /api/state HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n'));
      let d = ''; s.on('data', (x) => { d += x; }); s.on('close', () => resolve(Number(/HTTP\/1\.1 (\d+)/.exec(d)?.[1] || 0)));
    });
    assert.equal(evil, 421, 'someone else\'s domain is still refused');
  } finally { p.kill(); }
});

test('[check #15] odd fields never show up as [object Object]; NUL paths are a 400', async () => {
  const post = (p, body) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/api/test', { type: 'project:commit', project: { x: 1 }, subject: ['a'] })).status, 204);
  assert.equal((await post('/api/test', { type: 'evil:thing', project: 'x' })).status, 400, 'unknown test event types are refused');
  await post('/api/test', { type: 'claude', event: 'tool', id: 'odd', tool: { nested: true }, title: 42 });
  const st = await (await fetch(`${B}/api/state`)).json();
  assert.ok(!JSON.stringify(st).includes('[object Object]'));
  const commit = st.feed.find((e) => e.type === 'project:commit' && !e.subject);
  assert.ok(commit && commit.project === undefined, 'non-string fields are dropped');
  assert.equal(await raw('GET /%00'), 400);
  assert.equal(await raw('GET /js/%00main.js'), 400);
  assert.ok(await alive());
});

test('[check #11] the server hands out remembered building spots', async () => {
  const st = await (await fetch(`${B}/api/state`)).json();
  const spots = st.projects.map((p) => p.slot).filter((n) => n !== null);
  assert.ok(st.projects.every((p) => p.slot === null || Number.isInteger(p.slot)));
  assert.equal(new Set(spots).size, spots.length, 'no two buildings share a spot');
  if (!spots.length) return; // a PC with no projects (a fresh install, CI) has nothing to remember yet
  const saved = JSON.parse(fs.readFileSync(SLOTS, 'utf8'));
  for (const p of st.projects) if (p.slot !== null) assert.equal(saved[p.id], p.slot, `${p.id} remembered`);
});

// ---------------------------------------------------------------- Sleep this PC (lib/power.js), always in dry run
// A LAN server with its own temp data folder (config copy, key, code, power log), acting as a phone (loopback not trusted).
async function powerServer(env) {
  const free = (port) => new Promise((r) => { const srv = net.createServer().once('error', () => r(false)).listen(port, '127.0.0.1', () => srv.close(() => r(true))); });
  let port = null; for (const p of [3114, 3113, 3112]) if (await free(p)) { port = p; break; }
  if (!port) return null;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-power-'));
  fs.copyFileSync(path.join(ROOT, 'olympia.config.example.json'), path.join(data, 'olympia.config.json'));
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), OLYMPIA_DATA: data, OLYMPIA_SLOTS: SLOTS, OLYMPIA_LAN: '1', OLYMPIA_HOST: '127.0.0.1', OLYMPIA_TRUST_LOOPBACK: '0', OLYMPIA_POWER_DRY_RUN: '1', ...env } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { await fetch(`${base}/`); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  // headers set to undefined are left out (e.g. origin: undefined sends no Origin at all)
  const post = (what, headers = {}, body = '{}') => fetch(`${base}/api/power/${what}`, { method: 'POST', body,
    headers: Object.fromEntries(Object.entries({ 'content-type': 'application/json', origin: base, ...headers }).filter(([, v]) => v !== undefined)) });
  return { base, data, proc, post };
}

test('sleep from this PC: status says off, and a sleep request is a 403 while "allowSleep" is off', async () => {
  const st = await (await fetch(`${B}/api/power/status`)).json();
  assert.equal(st.allowSleep, false, 'off in the shipped config');
  assert.equal(st.canChange, true, 'this PC may flip the switch');
  const r = await fetch(`${B}/api/power/sleep`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'off');
  assert.equal((await fetch(`${B}/api/power/sleep`)).status, 405, 'GET cannot sleep');
  assert.equal((await fetch(`${B}/api/power/nope`)).status, 404);
  assert.equal((await fetch(`${B}/api/power/sleep`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 403, 'no cross-site form posts');
  assert.equal((await fetch(`${B}/api/power/sleep`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' })).status, 403, 'another site\'s page');
  assert.equal(await raw('POST /api/power/sleep', 'Content-Type: application/json\r\n', '{}', 'evil.example'), 421, 'DNS rebinding still refused');
});

test('sleep from a phone with the code on: must pair; then countdown, cancel, rate limit; origin checked; MAC shown', async () => {
  const s = await powerServer({ OLYMPIA_ALLOW_SLEEP: '1' });
  if (!s) return;
  try {
    assert.equal((await s.post('sleep')).status, 401, 'not paired: stopped at the door');
    const code = fs.readFileSync(path.join(s.data, 'olympia.code'), 'utf8').trim();
    const pair = await fetch(`${s.base}/api/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    const cookie = pair.headers.get('set-cookie').split(';')[0];
    const st = await (await fetch(`${s.base}/api/power/status`, { headers: { cookie } })).json();
    assert.equal(st.allowSleep, true); assert.equal(st.canSleep, true); assert.equal(st.canChange, false); assert.equal(st.dryRun, true);
    assert.equal((await s.post('sleep', { cookie, origin: 'http://evil.example' })).status, 403, 'wrong origin');
    assert.equal((await s.post('sleep', { cookie, origin: undefined })).status, 403, 'a phone must send its origin');
    const go = await s.post('sleep', { cookie });
    assert.equal(go.status, 202);
    assert.equal((await go.json()).pending.left, 10);
    assert.equal((await s.post('sleep', { cookie })).status, 409, 'already counting down');
    const c = await s.post('cancel', { cookie });
    assert.deepEqual(await c.json(), { ok: true, cancelled: true });
    assert.equal((await (await fetch(`${s.base}/api/power/status`, { headers: { cookie } })).json()).pending, null);
    const again = await s.post('sleep', { cookie });
    assert.equal(again.status, 429, 'one request per 30 s');
    assert.ok((await again.json()).retryIn > 20);
    assert.equal((await s.post('settings', { cookie }, '{"allowSleep":false}')).status, 403, 'only the PC itself can change the switch');
    const w = await (await fetch(`${s.base}/api/power/wake-info`, { headers: { cookie } })).json();
    if (w.adapter) { assert.equal(w.adapter.macHidden, false); assert.match(w.adapter.mac, /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/); }
    const log = fs.readFileSync(path.join(s.data, 'olympia.power.log'), 'utf8');
    assert.match(log, /countdown started \(10 s\) \[dry run\]/); assert.match(log, /cancel from paired/); assert.match(log, /rate limit/); assert.match(log, /not from Olympia's own page/);
  } finally { s.proc.kill(); }
});

test('with the code turned off, phones still cannot sleep the PC, and the MAC stays hidden from them', async () => {
  const s = await powerServer({ OLYMPIA_ALLOW_SLEEP: '1', OLYMPIA_LAN_CODE: '0' });
  if (!s) return;
  try {
    assert.equal((await fetch(`${s.base}/api/state`)).status, 200, 'the page itself opens without a code');
    const st = await (await fetch(`${s.base}/api/power/status`)).json();
    assert.equal(st.allowSleep, true); assert.equal(st.canSleep, false);
    const r = await s.post('sleep');
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, 'code');
    assert.equal((await s.post('cancel')).status, 401);
    const w = await (await fetch(`${s.base}/api/power/wake-info`)).json();
    if (w.adapter) { assert.equal(w.adapter.mac, null); assert.equal(w.adapter.macHidden, true); }
    assert.doesNotMatch(JSON.stringify(w), /([0-9A-F]{2}[:-]){5}[0-9A-F]{2}/i, 'no MAC anywhere in the answer');
  } finally { s.proc.kill(); }
});

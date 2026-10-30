// Sleep this PC from the phone, and the Wake-on-LAN info (lib/power.js). Nothing here ever sleeps the PC:
// the command runner, timers, clock and network probe are all fakes. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PowerControl, sleepCommand, callerOf, sameOrigin, setConfigFlag, wakeInfo, kindOf, broadcastOf, parseProbe, createPower } from '../lib/power.js';

// a PowerControl wired to fakes: runs[] records commands, timers fire only when we say so
function rig(opts = {}) {
  let t = 1_000_000;
  const runs = [], timers = [];
  const pc = new PowerControl({
    allowSleep: true, key: 'a'.repeat(48), quiet: true, platform: 'win32',
    run: (file, args, done) => { runs.push([file, ...args]); done?.(null); },
    probe: async () => null, interfaces: () => ({}),
    now: () => t, setTimer: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; }, clearTimer: (h) => { if (h) h.live = false; },
    ...opts,
  });
  return { pc, runs, timers, advance: (ms) => { t += ms; }, fireAll: () => { for (const h of timers) if (h.live) { h.live = false; h.fn(); } } };
}

test('sleep command per platform: real sleep on Windows (never rundll32, which can hibernate), pmset, systemctl, else none', () => {
  const win = sleepCommand('win32');
  assert.equal(win.file, 'powershell.exe');
  assert.deepEqual(win.args.slice(0, 2), ['-NoProfile', '-Command']);
  assert.match(win.args[2], /Add-Type -AssemblyName System\.Windows\.Forms; \[System\.Windows\.Forms\.Application\]::SetSuspendState\('Suspend', \$false, \$false\)/);
  assert.doesNotMatch(JSON.stringify(win), /rundll32|powrprof|Hibernate/i);
  assert.deepEqual(sleepCommand('darwin'), { file: 'pmset', args: ['sleepnow'] });
  assert.deepEqual(sleepCommand('linux'), { file: 'systemctl', args: ['suspend'] });
  for (const p of ['freebsd', 'aix', 'sunos', 'android']) assert.equal(sleepCommand(p), null, p);
});

test('after the 10 s countdown the platform command runs through the (mocked) runner', () => {
  for (const [platform, file] of [['win32', 'powershell.exe'], ['darwin', 'pmset'], ['linux', 'systemctl']]) {
    const { pc, runs, timers, fireAll } = rig({ platform });
    const r = pc.requestSleep('local');
    assert.equal(r.code, 202, platform);
    assert.equal(r.body.pending.left, 10);
    assert.equal(timers[0].ms, 10_000);
    assert.equal(runs.length, 0, 'nothing runs before the countdown ends');
    fireAll();
    assert.equal(runs.length, 1); assert.equal(runs[0][0], file);
    assert.equal(pc.pending, null);
  }
});

test('other operating systems get 501 and nothing is scheduled', () => {
  const { pc, timers } = rig({ platform: 'freebsd' });
  const r = pc.requestSleep('local');
  assert.equal(r.code, 501); assert.equal(r.body.error, 'unsupported');
  assert.equal(timers.length, 0);
  assert.equal(pc.status('local').supported, false);
});

test('403 when "Allow Sleep from phone" is off, for this PC and paired phones alike', () => {
  const { pc, timers } = rig({ allowSleep: false });
  for (const who of ['local', 'paired']) assert.equal(pc.requestSleep(who).code, 403, who);
  assert.equal(timers.length, 0);
  assert.equal(new PowerControl({ quiet: true }).allowSleep, false, 'off by default');
  assert.equal(new PowerControl({ allowSleep: 'yes', quiet: true }).allowSleep, false, 'only a real true turns it on');
});

test('a device that has not paired with the code can never sleep or cancel', () => {
  const { pc, timers } = rig();
  assert.equal(pc.requestSleep('guest').code, 401);
  assert.equal(timers.length, 0);
  pc.requestSleep('paired');
  assert.equal(pc.cancel('guest').code, 401);
  assert.ok(pc.pending, 'a guest cannot cancel someone else\'s sleep either');
  assert.equal(pc.status('guest').canSleep, false);
});

test('cancel stops the countdown; nothing runs', () => {
  const { pc, runs, timers, fireAll } = rig();
  pc.requestSleep('paired');
  const c = pc.cancel('paired');
  assert.deepEqual(c, { code: 200, body: { ok: true, cancelled: true } });
  assert.equal(timers[0].live, false);
  fireAll();
  assert.equal(runs.length, 0);
  assert.equal(pc.cancel('local').body.cancelled, false, 'cancelling twice is harmless');
  assert.equal(pc.status('local').pending, null);
});

test('rate limit: one sleep request per 30 s, even after a cancel; a second during the countdown is a 409', () => {
  const { pc, advance } = rig();
  assert.equal(pc.requestSleep('local').code, 202);
  assert.equal(pc.requestSleep('local').code, 409);
  pc.cancel('local');
  advance(5_000);
  const again = pc.requestSleep('paired');
  assert.equal(again.code, 429); assert.equal(again.body.retryIn, 25);
  advance(25_000);
  assert.equal(pc.requestSleep('paired').code, 202);
});

test('dry run logs the command instead of running it, and every request is logged', () => {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-power-')), 'power.log');
  const { pc, runs, fireAll } = rig({ dryRun: true, logFile: log });
  pc.requestSleep('guest', '192.168.1.40');
  pc.requestSleep('local', '127.0.0.1');
  fireAll();
  assert.equal(runs.length, 0);
  const text = fs.readFileSync(log, 'utf8');
  assert.match(text, /sleep from guest 192\.168\.1\.40: refused, not paired/);
  assert.match(text, /sleep from local 127\.0\.0\.1: countdown started \(10 s\) \[dry run\]/);
  assert.match(text, /dry run: would run powershell\.exe .*SetSuspendState\('Suspend'/);
});

test('turning the switch: only this PC, saved to the config without disturbing the rest, and turning off cancels', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-power-'));
  const file = path.join(dir, 'olympia.config.json');
  fs.writeFileSync(file, '{\n  "owner": "you",\n  "lan": true\n}\n');
  const { pc } = rig({ allowSleep: false, configFile: file });
  assert.equal(pc.setAllow('paired', true).code, 403, 'a phone cannot turn it on');
  assert.equal(pc.setAllow('local', 'yes').code, 400);
  assert.equal(pc.setAllow('local', true).code, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { owner: 'you', lan: true, allowSleep: true });
  pc.requestSleep('local');
  pc.setAllow('local', false);
  assert.equal(pc.pending, null, 'turning it off cancels a countdown');
  assert.match(fs.readFileSync(file, 'utf8'), /"allowSleep": false/);
  assert.equal(setConfigFlag('{ "a": 1, "allowSleep": true }', 'allowSleep', false), '{ "a": 1, "allowSleep": false }', 'edits in place');
});

test('who is asking: this PC, a phone with the paired cookie, or a guest', () => {
  const key = 'b'.repeat(48);
  const req = (addr, cookie) => ({ socket: { remoteAddress: addr }, headers: cookie ? { cookie } : {} });
  assert.equal(callerOf(req('127.0.0.1'), { key }), 'local');
  assert.equal(callerOf(req('::1'), { key }), 'local');
  assert.equal(callerOf(req('192.168.1.40'), { key }), 'guest');
  assert.equal(callerOf(req('192.168.1.40', `olympia_key=${key}`), { key }), 'paired');
  assert.equal(callerOf(req('192.168.1.40', 'olympia_key=deadbeef'), { key }), 'guest');
  assert.equal(callerOf(req('192.168.1.40', 'olympia_key=x'), { key: null }), 'guest', 'with the code off there is no key: nobody is paired');
  assert.equal(callerOf(req('127.0.0.1'), { key, trustLoopback: false }), 'guest');
});

test('same-origin check: JSON only, the page\'s own origin; only this PC may leave Origin out', () => {
  const r = (h) => ({ headers: { host: '192.168.1.153:3110', 'content-type': 'application/json', ...h } });
  assert.equal(sameOrigin(r({ origin: 'http://192.168.1.153:3110' }), 'paired'), true);
  assert.equal(sameOrigin(r({ origin: 'http://evil.example' }), 'paired'), false);
  assert.equal(sameOrigin(r({ origin: 'http://192.168.1.153:3110', 'content-type': 'text/plain' }), 'paired'), false, 'a plain cross-site form');
  assert.equal(sameOrigin(r({ origin: 'http://192.168.1.153:3110', 'sec-fetch-site': 'cross-site' }), 'paired'), false);
  assert.equal(sameOrigin(r({}), 'paired'), false, 'a phone must send Origin');
  assert.equal(sameOrigin(r({}), 'local'), true, 'curl on this PC');
});

test('wake info: wired adapter with every check passing is ready; the MAC is hidden from guests', () => {
  const interfaces = { Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.1.153', netmask: '255.255.255.0', mac: '02:5e:10:20:30:40' }], 'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.20.0.1', netmask: '255.255.240.0', mac: '00:15:5d:00:00:01' }] };
  const probed = parseProbe(JSON.stringify({ name: 'Ethernet', description: 'Realtek PCIe GbE Family Controller', media: '802.3', mac: '02-5E-10-20-30-40', magic: 'Enabled', armed: 'Realtek PCIe GbE Family Controller' }));
  const w = wakeInfo({ platform: 'win32', interfaces, probed, showMac: true });
  assert.deepEqual(w.adapter, { name: 'Ethernet', description: 'Realtek PCIe GbE Family Controller', kind: 'wired', mac: '02:5E:10:20:30:40', macHidden: false, ip: '192.168.1.153', netmask: '255.255.255.0', broadcast: '192.168.1.255' });
  assert.deepEqual(w.checks.map((c) => [c.id, c.ok]), [['wired', true], ['magic', true], ['armed', true]]);
  assert.equal(w.ready, true);
  const g = wakeInfo({ platform: 'win32', interfaces, probed, showMac: false });
  assert.equal(g.adapter.mac, null); assert.equal(g.adapter.macHidden, true);
  assert.doesNotMatch(JSON.stringify(g), /02:5E:10|02-5E-10/i);
});

test('wake info: Wi-Fi and a switched-off magic packet are flagged with fixes', () => {
  const interfaces = { 'Wi-Fi': [{ family: 'IPv4', internal: false, address: '10.0.0.23', netmask: '255.255.0.0', mac: '11:22:33:44:55:66' }] };
  const probed = { name: 'Wi-Fi', description: 'Intel(R) Wi-Fi 6 AX201 160MHz', media: 'Native 802.11', mac: '11-22-33-44-55-66', magic: 'Disabled', armed: [] };
  const w = wakeInfo({ platform: 'win32', interfaces, probed, showMac: true });
  assert.equal(w.adapter.kind, 'wifi'); assert.equal(w.adapter.broadcast, '10.0.255.255');
  assert.equal(w.ready, false);
  const by = Object.fromEntries(w.checks.map((c) => [c.id, c]));
  assert.equal(by.wired.ok, false); assert.match(by.wired.fix, /Wi-Fi usually can't be woken/);
  assert.equal(by.magic.ok, false); assert.match(by.magic.fix, /Wake on Magic Packet: Enabled/);
  assert.equal(by.armed.ok, false);
});

test('wake info elsewhere: no probe on Mac/Linux, a hint instead; no network means no adapter', () => {
  const interfaces = { en0: [{ family: 'IPv4', internal: false, address: '192.168.0.9', netmask: '255.255.255.0', mac: 'aa:bb:cc:dd:ee:ff' }] };
  const mac = wakeInfo({ platform: 'darwin', interfaces, probed: null, showMac: true });
  assert.equal(mac.adapter.mac, 'AA:BB:CC:DD:EE:FF');
  assert.equal(mac.adapter.kind, 'unknown', 'en0 is Wi-Fi on many Macs: no guessing');
  assert.equal(kindOf({ media: '', name: 'enp3s0', description: '' }), 'wired');
  assert.match(mac.note, /Wake for network access/);
  assert.match(wakeInfo({ platform: 'linux', interfaces: { eth0: interfaces.en0 }, probed: null, showMac: true }).note, /ethtool eth0/);
  const none = wakeInfo({ platform: 'win32', interfaces: { lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' }] }, probed: null, showMac: true });
  assert.equal(none.adapter, null); assert.equal(none.ready, false);
  assert.equal(kindOf({ media: '', name: 'wlan0', description: '' }), 'wifi');
  assert.equal(broadcastOf('172.16.5.4', '255.255.252.0'), '172.16.7.255');
  assert.equal(parseProbe('{}'), null);
});

test('wake info is cached for a minute so the read-only probe runs rarely', async () => {
  let probes = 0;
  const { pc, advance } = rig({ probe: async () => { probes++; return null; } });
  await pc.wakeInfo('local'); await pc.wakeInfo('paired');
  assert.equal(probes, 1);
  advance(61_000); await pc.wakeInfo('local');
  assert.equal(probes, 2);
});

test('createPower reads "allowSleep" and "powerDryRun" from the config, env vars win', () => {
  assert.equal(createPower({ cfg: {}, env: {} }).allowSleep, false);
  assert.equal(createPower({ cfg: { allowSleep: true }, env: {} }).allowSleep, true);
  assert.equal(createPower({ cfg: { allowSleep: true }, env: { OLYMPIA_ALLOW_SLEEP: '0' } }).allowSleep, false);
  assert.equal(createPower({ cfg: {}, env: { OLYMPIA_POWER_DRY_RUN: '1' } }).dryRun, true);
  assert.equal(createPower({ cfg: { powerDryRun: true }, env: {} }).dryRun, true);
});

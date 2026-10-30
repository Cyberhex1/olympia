// Project stations (docs/rules.md "Stations"): which job a project gets, how a thread's checklist becomes 4 stages,
// when a piece is finished and when a thread is resolved, and who stays out in town. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JOBS, jobFromText, stageOf, pieceDone, isResolved, stageLabel } from '../public/js/jobs.js';
import { visibleCast, TOWN_MS } from '../public/js/cast.js';
import { progressOf } from '../lib/claude.js';
import { StationBook } from '../lib/stations.js';
import { pickActivity } from '../public/js/town.js';

const H = 3600_000, D = 24 * H, NOW = Date.now();

test('every job has a place, a result and 4 stages', () => {
  for (const [k, j] of Object.entries(JOBS)) {
    assert.equal(j.stages.length, 4, k);
    assert.ok(j.place && j.result && j.job && j.motion, k);
  }
});

test('a project gets the job that fits what it does', () => {
  assert.equal(jobFromText('research-notes', 'market research: search and compare lists of providers'), 'library');
  assert.equal(jobFromText('voice-reader', 'Reads game dialogue aloud with an offline voice; speech, OCR'), 'lyre');
  assert.equal(jobFromText('sys-monitor', 'what is using your memory, CPU, GPU and disk; startup apps'), 'observatory');
  assert.equal(jobFromText('job-helper', 'job hunting: tailors your resume and cover letter'), 'scribe');
  assert.equal(jobFromText('image-lab', 'a friendlier ComfyUI frontend design prototype, image gallery'), 'easel');
  assert.equal(jobFromText('Olympia', 'A living 3D island of your Claude Code work'), 'smithy');
  assert.equal(jobFromText('bakery-game', ''), 'bakery');
  assert.equal(jobFromText('zzz', 'nothing to see'), null);
});

test('stations: config wins, then the folder, then the fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-st-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# Pixel Quest\nA tiny RPG game with NPCs and save slots.');
  const book = new StationBook({ projects: { Candy: { station: 'bakery', label: 'Sweet Shop' } } });
  assert.equal(book.jobFor('pq', dir), 'masks');
  assert.equal(book.jobFor('Candy', dir), 'bakery');
  assert.equal(book.jobFor('blank', null), 'carpenter');
  assert.equal(book.jobFor('blank2', null, true), 'postcards');
  const projects = [{ id: 'pq', path: dir }];
  const sessions = book.apply(projects, [{ id: 's1', kind: 'session', tourist: true, project: 'Candy' }, { id: 's2', kind: 'session', project: 'pq' }], () => null);
  assert.equal(projects[0].station, 'masks');
  assert.equal(sessions[0].station, 'bakery');
  assert.equal(sessions[0].projectLabel, 'Sweet Shop');
  assert.equal(sessions[1].station, undefined); // its building carries the station
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a checklist splits into 4 stages; without one, the turn\'s steps do', () => {
  const at = (done, total) => ({ state: 'working', progress: { done, total, at: NOW }, promptAt: NOW - 1000 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((d) => stageOf(at(d, 8))), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(stageOf(at(8, 8)), 4);
  assert.deepEqual([0, 5, 15, 40].map((steps) => stageOf({ state: 'working', steps })), [1, 2, 3, 4]);
  // a checklist finished before the latest prompt was for an earlier piece
  assert.equal(stageOf({ state: 'working', steps: 2, progress: { done: 4, total: 4, at: NOW - H }, promptAt: NOW - 10 }), 1);
  assert.equal(stageLabel('smithy', 2), 'Hammering the blade (2/4)');
});

test('a piece is finished when the checklist is done, the thread is resolved, or (no checklist) the turn ends', () => {
  assert.equal(pieceDone({ state: 'idle', progress: { done: 3, total: 8, at: NOW } }), false);
  assert.equal(pieceDone({ state: 'idle', progress: { done: 8, total: 8, at: NOW } }), true);
  assert.equal(pieceDone({ state: 'idle', resolved: true, progress: { done: 3, total: 8, at: NOW } }), true);
  assert.equal(pieceDone({ state: 'idle', steps: 3 }), true);
  assert.equal(pieceDone({ state: 'working', steps: 3 }), false);
});

test('resolved: a project thread that marked itself resolved; any other session whose checklist is all done', () => {
  assert.equal(isResolved({ state: 'idle', isThread: true, resolved: true }), true);
  assert.equal(isResolved({ state: 'idle', isThread: true, progress: { done: 4, total: 4, at: NOW } }), false);
  assert.equal(isResolved({ state: 'idle', isThread: false, progress: { done: 4, total: 4, at: NOW } }), true);
  assert.equal(isResolved({ state: 'working', isThread: true, resolved: true }), false); // called again
});

test('progressOf reads the newest checklist, the turn\'s steps and resolve calls from a transcript', () => {
  const t = (ago) => new Date(NOW - ago).toISOString();
  const use = (name, input) => ({ type: 'tool_use', id: 'x', name, input });
  const lines = [
    { type: 'user', timestamp: t(50_000), message: { content: 'first ask' } },
    { type: 'assistant', timestamp: t(40_000), message: { content: [use('mcp__hearthbot__update_progress_checklist', { text: 'Title\n\n✓ a\n○ b' })] } },
    { type: 'user', timestamp: t(30_000), message: { content: [{ type: 'text', text: 'second ask' }] } },
    { type: 'assistant', timestamp: t(20_000), message: { content: [use('Read', {}), use('TodoWrite', { todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'completed' }, { content: 'c', status: 'in_progress' }] })] } },
    { type: 'user', timestamp: t(15_000), message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
    { type: 'assistant', timestamp: t(10_000), message: { content: [use('mcp__hearthbot__set_thread_resolved', { resolved: true })] } },
  ].map((o) => JSON.stringify(o));
  const p = progressOf(lines);
  assert.deepEqual([p.progress.done, p.progress.total], [2, 3]);
  assert.equal(p.steps, 3);
  assert.equal(p.promptAt, NOW - 30_000);
  assert.equal(p.resolvedAt, NOW - 10_000);
  // reopened later
  const again = progressOf([...lines, JSON.stringify({ type: 'assistant', timestamp: t(5000), message: { content: [use('mcp__hearthbot__set_thread_resolved', { resolved: false })] } })]);
  assert.equal(again.resolvedAt, null);
});

test('with stations, resolved threads go inside and unresolved ones stay out in town for days', () => {
  const s = (id, extra) => ({ id, kind: 'session', project: 'p', state: 'idle', lastActive: NOW - H, ...extra });
  const list = [
    s('resolved', { isThread: true, resolved: true }),
    s('open', { isThread: true }),
    s('old-open', { isThread: true, state: 'sleeping', lastActive: NOW - TOWN_MS - H }),
    s('working-resolved', { isThread: true, resolved: true, state: 'working' }),
    ...['a', 'b', 'c'].map((k, i) => s(`recent-${k}`, { project: 'q', state: 'sleeping', lastActive: NOW - 2 * D - i })),
    s('older', { project: 'q', state: 'sleeping', lastActive: NOW - TOWN_MS - 2 * H }),
  ];
  const ids = visibleCast(list, NOW, 20, { stations: true, resolved: isResolved }).map((c) => c.id).sort();
  assert.deepEqual(ids, ['old-open', 'open', 'recent-a', 'recent-b', 'recent-c', 'working-resolved'].sort());
  // the older rules still apply on other maps: a day without work and they go in (bar each building's latest 3)
  const plain = visibleCast(list, NOW, 20).map((c) => c.id);
  assert.ok(plain.includes('resolved'));
});

test('town: picks an open spot, not the same kind of place twice running', () => {
  const v = (x) => ({ x, z: 0, clone() { return { ...this }; } });
  const places = [{ kind: 'pond', spots: [{ at: v(1), face: 0 }] }, { kind: 'agora', spots: [{ at: v(2), face: 0 }, { at: v(3), face: 0 }] }];
  let n = 0; const R = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 20; i++) assert.equal(pickActivity(places, R, { prev: 'pond' }).kind, 'agora');
  const a = pickActivity(places, R, { prev: 'agora', taken: (at) => at.x === 1 });
  assert.equal(a, null); // the only other place is taken
  const b = pickActivity(places, R, { prev: null });
  assert.ok(b.dur > 0 && b.label);
});

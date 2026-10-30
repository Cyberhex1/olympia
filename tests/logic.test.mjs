// Logic tests: does the island reflect the real state correctly?
// Fixtures mimic real Claude Code transcripts: every entry has a timestamp, assistant entries carry
// stop_reason ("tool_use" mid-turn, "end_turn" when the turn is over). Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeCollector, mergeProjects, canonicalProject, describeTool } from '../lib/claude.js';
import { SlotBook } from '../lib/slots.js';
import { Ledger, dayBounds, buildRecap } from '../lib/ledger.js';
import { planRows, readPlan } from '../lib/usage.js';
import { execFileSync } from 'node:child_process';
import { toolInfo, toolLabel } from '../public/js/tools.js';
import { planMessenger, applySignal, REPLY_MS } from '../public/js/messenger.js';
import { PROJECT_SLOTS, homeFor } from '../public/js/shared.js';
import { visibleCast, destination, settleDestination, spreadAt, WORKSHOP_DWELL_MS, TRIP_MAX_MS, checkoutIn, TOURIST_STAY_MS } from '../public/js/cast.js';
import { sunPosition, moonIllumination, moonPhaseName, toDirection } from '../public/js/sky.js';

// ---------------------------------------------------------------- fixture: a fake ~/.claude/projects
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympia-claude-'));
const NOW = Date.now();
const S = 1000, MIN = 60 * S, H = 60 * MIN, D = 24 * H;
const CODE = 'C:\\code';
const iso = (ago) => new Date(Date.now() - ago).toISOString();
const line = (o) => JSON.stringify(o);
const user = (content, cwd, ago) => ({ type: 'user', cwd, timestamp: iso(ago), message: { role: 'user', content } });
const asst = (content, cwd, ago, stop = 'tool_use') => ({ type: 'assistant', cwd, timestamp: iso(ago), message: { role: 'assistant', content, stop_reason: stop } });
const text = (t) => [{ type: 'text', text: t }];
const toolUse = (name, input = {}) => [{ type: 'tool_use', id: 't', name, input }];
const toolResult = [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }];

function session(dir, id, entries, fileAge, extra = {}) {
  const d = path.join(ROOT, dir);
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, `${id}.jsonl`);
  fs.writeFileSync(f, entries.map(line).join('\n') + '\n');
  const t = (NOW - fileAge) / 1000; fs.utimesSync(f, t, t);
  if (extra.title) { fs.mkdirSync(path.join(d, id), { recursive: true }); fs.writeFileSync(path.join(d, id, 'custom-title.json'), JSON.stringify({ customTitle: extra.title })); }
  for (const [aid, meta, entriesA, aAge] of extra.agents || []) {
    const sd = path.join(d, id, 'subagents'); fs.mkdirSync(sd, { recursive: true });
    const af = path.join(sd, `${aid}.jsonl`);
    fs.writeFileSync(af, entriesA.map(line).join('\n') + '\n');
    fs.writeFileSync(path.join(sd, `${aid}.meta.json`), JSON.stringify(meta));
    const at = (NOW - aAge) / 1000; fs.utimesSync(af, at, at);
  }
  return f;
}
const A = `${CODE}\\alpha`;
session('C--code-alpha', 'a-prompt', [user('Fix the login bug', A, 10 * S)], 10 * S);
session('C--code-alpha', 'a-longtool', [user('Run the build', A, 6 * MIN), asst(toolUse('Bash', { command: 'npm run build -- --prod SECRET=1', description: 'Build the release bundle' }), A, 5 * MIN)], 5 * MIN);
session('C--code-alpha', 'a-stuck', [user('Run the build', A, 12 * MIN), asst(toolUse('Bash'), A, 11 * MIN)], 11 * MIN);
session('C--code-alpha', 'a-thinking', [user('hi', A, 3 * MIN), asst(toolUse('mcp__Claude_Browser__navigate'), A, 2.5 * MIN), user(toolResult, A, 2 * MIN)], 2 * MIN);
session('C--code-alpha', 'a-midturn', [user('hi', A, 40 * S), asst(toolUse('Edit'), A, 30 * S), user(toolResult, A, 25 * S), asst([{ type: 'thinking', thinking: '...' }], A, 3 * S)], 3 * S);
session('C--code-alpha', 'a-justdone', [user('hi', A, 20 * S), asst(text('All set.'), A, 3 * S, 'end_turn')], 3 * S);
session('C--code-alpha', 'a-done', [user('hi', A, 31 * MIN), asst(text('all done'), A, 30 * MIN, 'end_turn')], 30 * MIN, { title: 'Release checklist' });
// a rename / bookkeeping line written just now on a session idle for an hour
session('C--code-alpha', 'a-renamed', [user('hi', A, 61 * MIN), asst(text('ok'), A, 60 * MIN, 'end_turn'), { type: 'custom-title', customTitle: 'Renamed', timestamp: iso(1 * S) }, { type: 'attachment', timestamp: iso(1 * S) }], 1 * S);
session('C--code-alpha', 'a-old', [user('hi', A, 3 * D)], 3 * D);
session('C--code-alpha', 'a-ancient', [user('hi', A, 9 * D)], 9 * D);
session('C--code-beta', 'b-sub', [user('Tidy tests', `${CODE}\\Beta\\tests\\unit`, 30 * S), asst(toolUse('Read'), 'C:\\somewhere\\else', 20 * S)], 20 * S, {
  agents: [
    ['agent-1', { description: 'Download product images' }, [user('go', null, 15 * S), asst(toolUse('WebFetch'), null, 10 * S)], 10 * S],
    ['agent-2', { agentType: 'Explore' }, [user('go', null, 31 * MIN), asst(text('found it'), null, 30 * MIN, 'end_turn')], 30 * MIN],
    ['agent-3', {}, [user('go', null, 3 * H)], 3 * H],
  ],
});
session('C--Games-Eden', 'e-thread', [
  { type: 'queue-operation', content: '<wake reason="mention"><message trigger="true" from="human">Build a personalized version of this for me https://example.com/x</message></wake>' },
  user('<wake>…</wake>', 'C:\\Games\\Eden', 40 * S),
], 40 * S);
session('C--Games-Eden', 'e-untitled', [{ type: 'system' }, user(toolResult, 'C:\\Games\\Eden', 2 * H)], 2 * H);
session('C--code-Olympia', 'o-self', [user('polish the island', `${CODE}\\Olympia`, 5 * S)], 5 * S);
session('C--code-BetaApp', 'j-case', [user('rank jobs', `${CODE}\\BetaApp`, 5 * S)], 5 * S);
// needs you: live status files (~/.claude/sessions/<pid>.json) next to the transcripts
session('C--code-alpha', 'n-perm', [user('Deploy it', A, 2 * MIN), asst(toolUse('Bash', { description: 'Push to prod' }), A, 90 * S)], 90 * S);
session('C--code-alpha', 'n-busy', [user('Open the site', A, 26 * MIN), asst(toolUse('mcp__Claude_Browser__navigate'), A, 25 * MIN)], 25 * MIN);
session('C--code-alpha', 'n-ask', [user('Plan it', A, 3 * MIN), asst(toolUse('AskUserQuestion', { questions: [] }), A, 2 * MIN)], 2 * MIN);
session('C--code-alpha', 'n-dead', [user('hi', A, 5 * MIN), asst(text('ok'), A, 4 * MIN, 'end_turn')], 4 * MIN);
const LIVE = path.join(ROOT, '_sessions'); fs.mkdirSync(LIVE);
const liveFile = (pid, o) => fs.writeFileSync(path.join(LIVE, `${pid}.json`), JSON.stringify({ pid, statusUpdatedAt: NOW - 60 * S, ...o }));
liveFile(101, { sessionId: 'n-perm', status: 'waiting', waitingFor: 'Approve Bash', bridgeSessionId: 'session_01ABCdef' });
liveFile(102, { sessionId: 'n-busy', status: 'busy' });
liveFile(103, { sessionId: 'n-dead', status: 'waiting', waitingFor: 'Approve Edit' }); // its process has exited
liveFile(104, { sessionId: 'n-ask', status: 'busy', bridgeSessionId: 'javascript:alert(1)' });
liveFile(105, { sessionId: 'a-longtool', status: 'busy' }); // every running session keeps a status file
liveFile(106, { sessionId: 'a-thinking', status: 'busy' });
const ALIVE = new Set([101, 102, 104, 105, 106]);

const cfg = { projectsRoot: CODE, claudeProjectsDir: ROOT, claudeSessionsDir: LIVE, isAlive: (pid) => ALIVE.has(pid) };
const events = [];
const c = new ClaudeCollector(cfg, (e) => events.push(e));
c.poll();
const byId = (id) => c.sessions.find((s) => s.id === id);

// ================================================================= session reader
test('every recent transcript becomes a character; week-old ones do not', () => {
  assert.ok(byId('a-prompt') && byId('a-old'));
  assert.equal(byId('a-ancient'), undefined);
});

test('project = top-level folder under C:\\code (from where it started), else the folder name', () => {
  assert.equal(byId('a-prompt').project, 'alpha');
  assert.equal(byId('b-sub').project, 'Beta', 'started in a subfolder, later wandered elsewhere');
  assert.equal(byId('e-thread').project, 'Eden');
});

test('working / idle / sleeping follow the conversation', () => {
  assert.equal(byId('a-prompt').state, 'working', 'prompt sent 10s ago: thinking');
  assert.equal(byId('a-longtool').state, 'working', 'waiting on a 5-minute tool');
  assert.equal(byId('a-stuck').state, 'idle', 'a tool pending for 11 minutes is treated as abandoned');
  assert.equal(byId('a-thinking').state, 'working', 'tool result 2 minutes ago, model is thinking');
  assert.equal(byId('a-midturn').state, 'working', 'thinking block mid-turn');
  assert.equal(byId('a-done').state, 'idle');
  assert.equal(byId('a-old').state, 'sleeping', 'nothing for 3 days');
});

test('[check #6] "done" is immediate when the turn ends, not 45 seconds later', () => {
  assert.equal(byId('a-justdone').state, 'idle', 'end_turn written 3 seconds ago');
});

test('[check #7] renames and bookkeeping lines are not activity', () => {
  const s = byId('a-renamed');
  assert.equal(s.state, 'idle');
  assert.ok(NOW - s.lastActive > 59 * MIN, 'last active comes from the conversation, not the file time');
});

test('current tool is reported only while working', () => {
  assert.equal(byId('a-longtool').tool, 'Bash');
  assert.equal(byId('a-thinking').tool, 'mcp__Claude_Browser__navigate', 'after a tool result, the tool that produced it');
  assert.equal(byId('a-midturn').tool, 'Edit', 'mid-turn thinking keeps the last tool');
  assert.equal(byId('a-done').tool, null);
  assert.equal(byId('a-stuck').tool, null);
});

test('titles: thread name, then the person\'s first words, then a short id', () => {
  assert.equal(byId('a-done').title, 'Release checklist');
  assert.equal(byId('a-prompt').title, 'Fix the login bug');
  assert.equal(byId('e-thread').title, 'Build a personalized version of this for me', 'wrapped thread message, link removed');
  assert.match(byId('e-untitled').title, /^Session e-unti/);
});

test('titles can be turned off for privacy', () => {
  const c2 = new ClaudeCollector({ ...cfg, claudeTitlesFromPrompts: false }, () => {});
  c2.poll();
  assert.match(c2.sessions.find((s) => s.id === 'a-prompt').title, /^Session /);
  assert.equal(c2.sessions.find((s) => s.id === 'a-done').title, 'Release checklist', 'names you gave a thread still show');
});

test('helper agents: state from their own transcript; quiet ones leave', () => {
  const a1 = byId('b-sub:agent-1'), a2 = byId('b-sub:agent-2');
  assert.equal(a1.kind, 'agent'); assert.equal(a1.parent, 'b-sub'); assert.equal(a1.project, 'Beta');
  assert.equal(a1.title, 'Download product images'); assert.equal(a1.state, 'working'); assert.equal(a1.tool, 'WebFetch');
  assert.equal(a2.title, 'Explore'); assert.equal(a2.state, 'idle');
  assert.equal(byId('b-sub:agent-3'), undefined, 'agents quiet for 3h are gone');
});

test('characters are ordered most-recent first and capped', () => {
  const ages = c.sessions.map((s) => s.lastActive);
  assert.deepEqual(ages, [...ages].sort((a, b) => b - a));
  const capped = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 3 }, () => {}); capped.poll();
  assert.equal(capped.sessions.length, 3);
});

test('no transcript text leaves the collector', () => {
  const allowed = new Set(['id', 'kind', 'title', 'project', 'state', 'tool', 'detail', 'lastActive', 'parent', 'needs', 'link', 'tourist',
    // how far a thread's piece has got (counts and times only, docs/rules.md Stations)
    'progress', 'steps', 'promptAt', 'isThread', 'resolved']);
  for (const s of c.sessions) for (const k of Object.keys(s)) assert.ok(allowed.has(k), `unexpected field ${k}`);
  assert.ok(!JSON.stringify(c.sessions).includes('all done'));
  assert.ok(!JSON.stringify(c.sessions).includes('SECRET'), 'commands themselves never leave, only their one-line description');
});

test('signals: start, tool switch and done fire on real transitions only', () => {
  events.length = 0;
  c.poll();
  assert.equal(events.length, 0, 'nothing changed, nothing emitted');
  const f = path.join(ROOT, 'C--code-alpha', 'a-done.jsonl');
  fs.appendFileSync(f, line(user('one more thing', A, 2 * S)) + '\n' + line(asst(toolUse('Edit'), A, 1 * S)) + '\n');
  c.poll();
  assert.deepEqual(events.map((e) => [e.id, e.event, e.tool]), [['a-done', 'start', 'Edit']]);
  events.length = 0;
  fs.appendFileSync(f, line(user(toolResult, A, 0)) + '\n' + line(asst(toolUse('Bash'), A, 0)) + '\n');
  c.poll();
  assert.deepEqual(events.map((e) => [e.event, e.tool]), [['tool', 'Bash']]);
  events.length = 0;
  fs.appendFileSync(f, line(user(toolResult, A, 0)) + '\n' + line(asst(text('done'), A, 0, 'end_turn')) + '\n');
  c.poll();
  assert.deepEqual(events.map((e) => e.event), ['done'], 'done fires on the very next poll');
});

test('[check #7] a rename on an idle session fires nothing', () => {
  events.length = 0;
  const f = path.join(ROOT, 'C--code-alpha', 'a-done.jsonl');
  fs.appendFileSync(f, line({ type: 'custom-title', customTitle: 'x', timestamp: iso(0) }) + '\n' + line({ type: 'file-history-snapshot', timestamp: iso(0) }) + '\n');
  c.poll();
  assert.deepEqual(events, []);
});

test('[check #5] a brand-new session announces itself (but not everything at boot)', () => {
  const fresh = new ClaudeCollector(cfg, () => {});
  const boot = []; const c3 = new ClaudeCollector(cfg, (e) => boot.push(e)); c3.poll();
  assert.equal(boot.length, 0, 'the first poll after starting is not a flood of "start"s');
  session('C--code-alpha', 'a-brandnew', [user('new idea', A, 2 * S), asst(toolUse('Grep'), A, 1 * S)], 1 * S);
  c3.poll();
  assert.deepEqual(boot.map((e) => [e.id, e.event, e.tool]), [['a-brandnew', 'start', 'Grep']]);
  fresh.poll();
});

test('renaming a thread updates its character within a minute', () => {
  const dir = path.join(ROOT, 'C--code-alpha', 'a-prompt'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'custom-title.json'), JSON.stringify({ customTitle: 'Login bug, take two' }));
  for (const v of c.cache.values()) { v.titled -= 61_000; v.checked -= 16_000; }
  c.poll();
  assert.equal(byId('a-prompt').title, 'Login bug, take two');
});

// ================================================================= needs you
test('a permission prompt makes the session wait for you, with a link to open it', () => {
  const s = byId('n-perm');
  assert.equal(s.state, 'waiting');
  assert.deepEqual([s.needs.kind, s.needs.reason], ['asking', 'Approve Bash']);
  assert.equal(s.link, 'https://claude.ai/code/session_01ABCdef');
  assert.equal(s.tool, null, 'a waiting session is not working');
});
test('a question or plan the session is waiting on counts as needing you', () => {
  assert.equal(byId('n-ask').state, 'waiting');
  assert.equal(byId('n-ask').needs.reason, 'A question for you');
  assert.equal(byId('n-ask').link, null, 'only real claude.ai session ids become links');
});
test('a tool pending for 25 minutes in a live, busy session may be stuck', () => {
  const s = byId('n-busy');
  assert.deepEqual([s.state, s.needs.kind], ['waiting', 'stuck']);
  assert.match(s.needs.reason, /navigate/);
  assert.equal(byId('a-stuck').state, 'idle', 'with no live process it is just abandoned');
});
test('status files left by closed sessions are ignored', () => {
  assert.equal(byId('n-dead').state, 'idle');
  assert.equal(byId('n-dead').needs, null);
});
test('[rules] a long tool in a live, busy session is still working, not idle or stuck', () => {
  session('C--code-alpha', 'r-longbuild', [user('Build the installer', A, 16 * MIN), asst(toolUse('Bash', { description: 'Build the installer' }), A, 15 * MIN)], 15 * MIN);
  session('C--code-alpha', 'r-helpers', [user('Research it', A, 41 * MIN), asst(toolUse('Agent', { description: 'Survey sources' }), A, 40 * MIN)], 40 * MIN);
  liveFile(201, { sessionId: 'r-longbuild', status: 'busy' });
  liveFile(202, { sessionId: 'r-helpers', status: 'busy' });
  ALIVE.add(201); ALIVE.add(202);
  const cr = new ClaudeCollector(cfg, () => {}); cr.poll();
  const get = (id) => cr.sessions.find((s) => s.id === id);
  assert.deepEqual([get('r-longbuild').state, get('r-longbuild').tool, get('r-longbuild').detail], ['working', 'Bash', 'Build the installer'], 'quiet for 15 min, under the 20-minute stuck limit');
  assert.equal(get('r-helpers').state, 'working', 'helper agents may run for a long time');
  ALIVE.delete(201); ALIVE.delete(202);
});
test('[rules] the live status saying idle ends a turn the transcript still shows as running', () => {
  session('C--code-alpha', 'r-interrupted', [user('Do it', A, 60 * S), asst(toolUse('Edit'), A, 50 * S)], 50 * S);
  liveFile(203, { sessionId: 'r-interrupted', status: 'idle', statusUpdatedAt: NOW - 20 * S }); ALIVE.add(203);
  const cr = new ClaudeCollector(cfg, () => {}); cr.poll();
  assert.equal(cr.sessions.find((s) => s.id === 'r-interrupted').state, 'idle');
  ALIVE.delete(203);
});
test('[rules] a permission prompt the session has moved past, or one 12 hours old, no longer needs you', () => {
  session('C--code-alpha', 'r-moved', [user('Go', A, 5 * MIN), asst(toolUse('Bash'), A, 4 * MIN), user(toolResult, A, 3 * MIN), asst(text('done'), A, 2 * MIN, 'end_turn')], 2 * MIN);
  session('C--code-alpha', 'r-old-prompt', [user('Go', A, 13 * H), asst(toolUse('Bash'), A, 13 * H)], 13 * H);
  liveFile(204, { sessionId: 'r-moved', status: 'waiting', waitingFor: 'permission prompt', statusUpdatedAt: NOW - 4 * MIN });
  liveFile(205, { sessionId: 'r-old-prompt', status: 'waiting', waitingFor: 'permission prompt', statusUpdatedAt: NOW - 13 * H });
  ALIVE.add(204); ALIVE.add(205);
  const cr = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200 }, () => {}); cr.poll();
  const get = (id) => cr.sessions.find((s) => s.id === id);
  assert.deepEqual([get('r-moved').state, get('r-moved').needs], ['idle', null]);
  assert.deepEqual([get('r-old-prompt').state, get('r-old-prompt').needs], ['idle', null]);
  const strict = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200, needsYouHours: 20 }, () => {}); strict.poll();
  assert.equal(strict.sessions.find((s) => s.id === 'r-old-prompt').state, 'waiting', '"needsYouHours" sets the limit');
  ALIVE.delete(204); ALIVE.delete(205);
});
test('[rules] a project thread is one character: its newest session; an older one’s prompt is gone', () => {
  const wake = (tag) => ({ type: 'queue-operation', content: `<wake reason="mention"><project id="p">${tag}<message trigger="true" from="human" id="cmsg_02Late">Go on</message></project></wake>` });
  session('C--code-alpha', 'r-thread-old', [wake('<thread ts="cmsg_01Root">'), user('<wake>…</wake>', A, 3 * H), asst(toolUse('Bash'), A, 3 * H)], 3 * H);
  session('C--code-alpha', 'r-thread-new', [wake('<thread ts="cmsg_01Root">'), user('<wake>…</wake>', A, 2 * H), asst(text('done'), A, 2 * H, 'end_turn')], 2 * H);
  session('C--code-alpha', 'r-thread-root', [{ type: 'queue-operation', content: '<wake reason="mention"><project id="p"><message trigger="true" from="human" id="cmsg_09Other">Start</message></project></wake>' }, user('<wake>…</wake>', A, 1 * H)], 1 * H);
  liveFile(206, { sessionId: 'r-thread-old', status: 'waiting', waitingFor: 'permission prompt', statusUpdatedAt: NOW - 3 * H }); ALIVE.add(206);
  const cr = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200 }, () => {}); cr.poll();
  const ids = cr.sessions.map((s) => s.id);
  assert.ok(ids.includes('r-thread-new') && !ids.includes('r-thread-old'), 'only the newest session of the thread is shown');
  assert.equal(cr.threads.get('r-thread-new'), 'cmsg_01Root');
  assert.equal(cr.threads.get('r-thread-root'), 'cmsg_09Other', 'a thread started from a top-level message is named by that message');
  assert.ok(!('thread' in cr.sessions.find((s) => s.id === 'r-thread-new')), 'thread ids stay on the server');
  ALIVE.delete(206);
});
test('[rules] a resumed thread is named by its newest checklist title, not by "keep going"', () => {
  const pad = { type: 'attachment', content: 'x'.repeat(100 * 1024), timestamp: iso(30 * MIN) }; // pushes the checklist past the head
  session('C--code-alpha', 'r-resumed', [{ type: 'queue-operation', content: '<wake reason="mention"><project id="p"><message trigger="true" from="human" id="cmsg_03Nudge">keep going</message></project></wake>' },
    user('<wake>…</wake>', A, 30 * MIN), pad, asst(toolUse('mcp__hearthbot__update_status', { text: 'Olympia: whole-app logic\n\n✱ Auditing' }), A, 29 * MIN)], 29 * MIN);
  const cr = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200 }, () => {}); cr.poll();
  assert.equal(cr.sessions.find((s) => s.id === 'r-resumed').title, 'Olympia: whole-app logic');
});
test('[rules] one tool finishing does not hide a permission prompt another tool of the same reply is waiting on', () => {
  session('C--code-alpha', 'r-parallel', [user('Go', A, 3 * MIN), asst([...toolUse('Read'), { type: 'tool_use', id: 't2', name: 'Bash', input: {} }], A, 2 * MIN), user(toolResult, A, 10 * S)], 10 * S);
  liveFile(209, { sessionId: 'r-parallel', status: 'waiting', waitingFor: 'Approve Bash', statusUpdatedAt: NOW - 2 * MIN }); ALIVE.add(209);
  const cr = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200 }, () => {}); cr.poll();
  assert.equal(cr.sessions.find((s) => s.id === 'r-parallel').state, 'waiting');
  ALIVE.delete(209);
});
test('[rules] the character cap never hides a thread that needs you; helpers come with their thread', () => {
  session('C--code-alpha', 'r-capped', [user('Ship it', A, 5 * H), asst(toolUse('AskUserQuestion', { questions: [] }), A, 5 * H)], 5 * H);
  liveFile(207, { sessionId: 'r-capped', status: 'waiting', waitingFor: 'A question', statusUpdatedAt: NOW - 5 * H }); ALIVE.add(207);
  const all = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200 }, () => {}); all.poll();
  const cap = all.sessions.filter((s) => s.state === 'waiting').length + 1;
  const cr = new ClaudeCollector({ ...cfg, claudeMaxCharacters: cap }, () => {}); cr.poll();
  const threads = cr.sessions.filter((s) => s.kind === 'session');
  assert.equal(threads.length, cap);
  assert.ok(threads.some((s) => s.id === 'r-capped' && s.state === 'waiting'), 'five hours quiet, but it needs you');
  assert.ok(cr.sessions.filter((s) => s.kind === 'agent').every((h) => threads.some((s) => s.id === h.parent)), 'no helper without its thread');
  ALIVE.delete(207);
});
test('[rules] a new reason while it already needs you is marked, so it does not notify twice', () => {
  session('C--code-alpha', 'r-again', [user('Go', A, 3 * MIN), asst(toolUse('Bash'), A, 2 * MIN)], 2 * MIN);
  liveFile(208, { sessionId: 'r-again', status: 'waiting', waitingFor: 'Approve Bash', statusUpdatedAt: NOW - 1 * MIN }); ALIVE.add(208);
  const seen = [], cr = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200 }, (e) => seen.push(e));
  cr.polled = true; cr.poll();
  liveFile(208, { sessionId: 'r-again', status: 'waiting', waitingFor: 'Approve Edit', statusUpdatedAt: NOW - 1 * MIN });
  cr.poll();
  const mine = seen.filter((e) => e.id === 'r-again' && e.event === 'needs');
  assert.deepEqual(mine.map((e) => [e.needs.reason, Boolean(e.again)]), [['Approve Bash', false], ['Approve Edit', true]]);
  ALIVE.delete(208);
});

test('[rules] a session that was stopped or closed mid-turn is not working', () => {
  session('C--code-alpha', 'r-closed', [user('Go', A, 19 * H), asst(toolUse('Bash'), A, 19 * H), user([{ type: 'tool_result', tool_use_id: 't', is_error: true, content: 'Tool permission request failed: AbortError: Tool permission stream closed before response received' }], A, 20 * S)], 20 * S);
  session('C--code-alpha', 'r-stopped', [user('Go', A, 40 * S), user('[Request interrupted by user]', A, 10 * S)], 10 * S);
  session('C--code-alpha', 'r-noprocess', [user('Go', A, 3 * MIN), asst(toolUse('Edit'), A, 2 * MIN)], 2 * MIN);
  const cr = new ClaudeCollector({ ...cfg, claudeMaxCharacters: 200 }, () => {}); cr.poll();
  const get = (id) => cr.sessions.find((s) => s.id === id);
  assert.equal(get('r-closed').state, 'idle', 'closing the session aborted its prompt');
  assert.equal(get('r-stopped').state, 'idle', 'you pressed stop');
  assert.equal(get('r-noprocess').state, 'idle', 'no status file: the process is gone');
  assert.equal(get('a-prompt').state, 'working', 'a fresh prompt counts before its status file shows up');
});

test('"needs" fires when a session starts waiting, and replaces "done"', () => {
  const ev = []; const c5 = new ClaudeCollector(cfg, (e) => ev.push(e)); c5.poll();
  liveFile(102, { sessionId: 'n-dead', status: 'waiting', waitingFor: 'Approve Write' }); ALIVE.add(102);
  for (const v of c5.cache.values()) v.checked -= 16_000;
  c5.poll();
  const mine = ev.filter((e) => e.id === 'n-dead');
  assert.deepEqual(mine.map((e) => [e.event, e.needs.reason]), [['needs', 'Approve Write']]);
  liveFile(102, { sessionId: 'n-busy', status: 'busy' });
});

test('a project thread is named by its own status checklist header', () => {
  session('C--code-alpha', 'a-status', [
    { type: 'queue-operation', content: '<wake><message trigger="true" from="human">Start on all of these</message></wake>' },
    user('<wake>…</wake>', A, 50 * S),
    asst(toolUse('mcp__hearthbot__update_status', { text: '**Olympia: five new features**\n\n✱ Reading code' }), A, 40 * S),
  ], 40 * S);
  const c9 = new ClaudeCollector(cfg, () => {}); c9.poll();
  assert.equal(c9.sessions.find((s) => s.id === 'a-status').title, 'Olympia: five new features');
});

// ================================================================= details on click
session('C--code-alpha', 'd-card', [
  user('Fix the header', A, 9 * MIN),
  asst([{ type: 'text', text: 'Looking at **the header** now.' }, ...toolUse('Read', { file_path: `${A}\\src\\header.js` })], A, 8 * MIN),
  user(toolResult, A, 8 * MIN),
  asst(toolUse('Edit', { file_path: `${A}\\src\\header.js`, old_string: 'SECRET', new_string: 'x' }), A, 7 * MIN),
  user(toolResult, A, 7 * MIN),
  asst(toolUse('Edit', { file_path: `${A}\\src\\header.js`, old_string: 'a', new_string: 'b' }), A, 6 * MIN),
  user(toolResult, A, 6 * MIN),
  asst(toolUse('Write', { file_path: 'D:\\elsewhere\\notes.md', content: 'SECRET' }), A, 5 * MIN),
  user(toolResult, A, 5 * MIN),
  asst(toolUse('mcp__hearthbot__update_status', { text: 'Header fix\n\n**✓ Found the bug**\n✱ Testing it\n○ Ship it' }), A, 4 * MIN),
  user(toolResult, A, 4 * MIN),
  asst(toolUse('Bash', { command: 'npm test SECRET', description: 'Run the tests' }), A, 3 * MIN),
  user(toolResult, A, 3 * MIN),
  asst(toolUse('mcp__hearthbot__reply', { text: 'Fixed the <b>header</b>. See [the PR](https://x.y).' }), A, 2 * MIN),
  user(toolResult, A, 2 * MIN),
  asst(text('internal note'), A, 2 * MIN - 1, 'end_turn'),
], 2 * MIN);

test('a character card shows recent steps, files changed, checklist and the last reply', () => {
  const c6 = new ClaudeCollector(cfg, () => {}); c6.poll();
  const d = c6.details('d-card');
  assert.deepEqual(d.steps.map((s) => s.tool).slice(0, 3), ['mcp__hearthbot__reply', 'Bash', 'mcp__hearthbot__update_status'], 'newest first');
  assert.equal(d.steps[1].detail, 'Run the tests');
  assert.deepEqual(d.files.map((f) => [f.name, f.edits]), [['notes.md', 1], [path.join('src', 'header.js'), 2]], 'paths inside the project are relative');
  assert.deepEqual(d.checklist.map((c) => c.status), ['done', 'doing', 'todo']);
  assert.equal(d.checklist[0].text, 'Found the bug');
  assert.ok(d.lastReply.text.startsWith('internal note') || d.lastReply.text.startsWith('Fixed'), 'the latest thing it said');
  assert.ok(!JSON.stringify(d).includes('SECRET'), 'never file contents or raw commands');
  assert.equal(c6.details('nope'), null);
});
test('a thread\'s reply reads as plain words, without tags or link markup', () => {
  const f = path.join(ROOT, 'C--code-alpha', 'd-card.jsonl');
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); lines.pop();
  fs.writeFileSync(f, lines.join('\n') + '\n');
  const c7 = new ClaudeCollector(cfg, () => {}); c7.poll();
  assert.equal(c7.details('d-card').lastReply.text, 'Fixed the header. See the PR.');
});
test('with claudeDetails off, the card keeps steps and files but no words', () => {
  const c8 = new ClaudeCollector({ ...cfg, claudeDetails: false }, () => {}); c8.poll();
  const d = c8.details('d-card');
  assert.equal(d.lastReply, null); assert.equal(d.checklist, null); assert.equal(d.steps[0].detail, null);
  assert.ok(d.files.length);
});

// ================================================================= daily recap and token ledger
test('the recap lists each thread\'s finished checklist items and files, per project', async () => {
  const L = new Ledger(ROOT); await L.scan();
  const b = { from: NOW - 30 * MIN, to: NOW + MIN };
  const r = buildRecap(L, b, { projectOf: (cwd) => c.projectFor(cwd), titleOf: (f, id) => `T-${id}` });
  const alpha = r.find((p) => p.id === 'alpha');
  const card = alpha.sessions.find((s) => s.id === 'd-card');
  assert.deepEqual(card.done, ['Found the bug']);
  assert.deepEqual(card.doing, ['Testing it']);
  assert.equal(card.files, 2);
  assert.equal(card.title, 'T-d-card');
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.ok(r.find((p) => p.id === 'Beta').sessions[0].helpers >= 1, 'helper agents roll up into their parent thread');
});
test('[rules] the recap shows a thread that ran in several sessions once, keeping what each finished', async () => {
  const status = (t) => toolUse('mcp__hearthbot__update_status', { text: t });
  session('C--code-alpha', 'm-first', [user('go', A, 20 * MIN), asst(status('Task\n\n✓ Read the code\n✱ Fix it'), A, 19 * MIN)], 19 * MIN);
  session('C--code-alpha', 'm-second', [user('go', A, 10 * MIN), asst(status('Task\n\n✓ Fixed it\n✱ Test it'), A, 9 * MIN)], 9 * MIN);
  const L = new Ledger(ROOT); await L.scan();
  const thread = (f) => (/m-(first|second)/.test(f) ? 'cmsg_01Same' : null);
  const r = buildRecap(L, { from: NOW - 30 * MIN, to: NOW + MIN }, { projectOf: (cwd) => c.projectFor(cwd), titleOf: (f, id) => `T-${id}`, threadOf: thread });
  const mine = r.find((p) => p.id === 'alpha').sessions.filter((s) => /^m-/.test(s.id));
  assert.equal(mine.length, 1);
  assert.deepEqual([mine[0].id, mine[0].done, mine[0].doing, mine[0].steps], ['m-second', ['Read the code', 'Fixed it'], ['Test it'], 2]);
});
test('tokens are counted once per reply even when it spans several lines, and only new bytes are re-read', async () => {
  const usage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 9999 };
  const msg = (blocks) => ({ type: 'assistant', cwd: A, timestamp: iso(1 * MIN), message: { id: 'msg_1', model: 'claude-test', role: 'assistant', content: blocks, usage, stop_reason: 'tool_use' } });
  const f = session('C--code-alpha', 'u-tokens', [user('go', A, 2 * MIN), msg(text('hi')), msg(toolUse('Read'))], 1 * MIN);
  const L = new Ledger(ROOT); await L.scan();
  assert.deepEqual(L.usage(NOW - 10 * MIN, NOW + MIN).byModel['claude-test'], 160, 'input + output + cache writes, once');
  const before = L.files.get(f).offset;
  fs.appendFileSync(f, line({ ...msg(text('more')), message: { ...msg(text('more')).message, id: 'msg_2' } }) + '\n');
  await L.scan();
  assert.equal(L.usage(NOW - 10 * MIN, NOW + MIN).byModel['claude-test'], 320);
  assert.ok(L.files.get(f).offset > before);
  fs.appendFileSync(f, '{"type":"assistant","half a line');
  await L.scan();
  assert.equal(L.files.get(f).offset, fs.statSync(f).size - '{"type":"assistant","half a line'.length, 'a line still being written is left for next time');
});
test('plan limits are understood in both shapes Claude Code sends to status lines', () => {
  assert.deepEqual(planRows({ limits: [{ kind: 'session', group: 'session', percent: 39, resets_at: '2026-10-24T02:00:00Z', severity: 'normal', is_active: true }, { kind: 'weekly_all', group: 'weekly', percent: 41, resets_at: null, severity: 'normal' }] })
    .map((r) => [r.label, r.percent]), [['5-hour limit', 39], ['Weekly · all models', 41]]);
  assert.deepEqual(planRows({ five_hour: { utilization: 12, resets_at: 'x' }, seven_day: null, model_scoped: [{ display_name: 'Fable', utilization: 0 }] }).map((r) => [r.label, r.percent]),
    [['5-hour limit', 12], ['Weekly · Fable', 0]]);
  assert.equal(planRows(null), null);
  assert.equal(planRows({ limits: [{ kind: 'session', percent: 'lots' }] }).length, 0, 'junk is dropped');
});
test('the optional status line saves only plan limits, and old numbers are not shown as current', () => {
  const out = path.join(ROOT, 'usage.json');
  const line = execFileSync(process.execPath, [path.join(process.cwd(), 'tools', 'statusline-usage.mjs')], {
    input: JSON.stringify({ model: { display_name: 'Opus' }, workspace: { current_dir: 'C:\\code\\alpha' }, transcript_path: 'SECRET', rate_limits: { five_hour: { utilization: 39 } } }),
    env: { ...process.env, OLYMPIA_USAGE_FILE: out },
  }).toString();
  assert.equal(line, 'Opus · alpha · 5h 39%');
  const saved = fs.readFileSync(out, 'utf8');
  assert.ok(!saved.includes('SECRET') && !saved.includes('alpha'), 'nothing but the limits is written');
  assert.equal(readPlan(out).rows[0].percent, 39);
  assert.equal(readPlan(out, Date.now() + 31 * MIN), null);
});

test('day bounds are local midnight to midnight', () => {
  const b = dayBounds('2026-10-20');
  assert.equal(new Date(b.from).getHours(), 0); assert.equal(b.to - b.from, 24 * H); assert.equal(b.key, '2026-10-20');
  assert.equal(dayBounds('nonsense').key, dayBounds().key, 'bad input falls back to today');
});

// ================================================================= buildings
const code = [{ id: 'alpha', name: 'Alpha', status: 'idle' }, { id: 'betaapp', name: 'Betaapp', status: 'idle' }];
test('buildings: code projects plus Claude-only folders, matched without case', () => {
  const sessions = [
    { id: '1', kind: 'session', project: 'alpha', state: 'working', lastActive: 5 },
    { id: '2', kind: 'session', project: 'BetaApp', state: 'idle', lastActive: 3 },
    { id: '4', kind: 'session', project: 'Eden', state: 'idle', lastActive: 1 },
  ];
  const { projects, sessions: out } = mergeProjects(code, sessions);
  assert.deepEqual(projects.map((p) => p.id), ['alpha', 'betaapp', 'Eden']);
  assert.equal(projects[0].status, 'busy'); assert.equal(projects[2].claudeOnly, true);
  assert.equal(out.find((s) => s.id === '2').project, 'betaapp', 'session points at the real building id');
  assert.equal(code[0].sessions, undefined, 'input is not mutated');
});

test('[check #8] signals use the building\'s spelling of the project', () => {
  assert.equal(canonicalProject('BetaApp', code), 'betaapp');
  assert.equal(canonicalProject('Eden', code), 'Eden');
  assert.equal(byId('j-case').project, 'BetaApp', 'raw from the reader…');
  assert.equal(canonicalProject(byId('j-case').project, code), 'betaapp', '…canonical once the server maps it');
});

test('work outside C:\\code comes as tourists: no building of its own, the Hotel instead', () => {
  assert.equal(byId('e-thread').tourist, true, 'C:\\Games\\Eden is outside the projects folder');
  assert.equal(byId('a-prompt').tourist, undefined);
  const sessions = [
    { id: '1', kind: 'session', project: 'alpha', state: 'idle', lastActive: 5 },
    { id: 't', kind: 'session', project: 'side-quest', state: 'working', lastActive: 4, tourist: true },
    { id: 'n', kind: 'session', project: 'brand-new', state: 'idle', lastActive: 3 },
  ];
  const { projects, sessions: out } = mergeProjects(code, sessions);
  assert.deepEqual(projects.map((p) => p.id), ['alpha', 'betaapp', 'brand-new'], 'a new folder in C:\\code still gets a building; a tourist folder does not');
  assert.equal(out.length, 3, 'the tourist is still a character');
  assert.equal(homeFor('side-quest', () => false, 'Olympia', true), 'hotel');
  assert.equal(homeFor('Olympia', (k) => k === 'p:Olympia', 'Olympia', false), 'p:Olympia');
});

test('who is on the island: leftovers go inside, tourists check out after two days, helpers trail and leave', () => {
  const N = 10 * D;
  const list = [
    { id: 'old', kind: 'session', project: 'p', state: 'sleeping', lastActive: N - 30 * H },
    { id: 'tour', kind: 'session', state: 'sleeping', lastActive: N - 30 * H, tourist: true },
    { id: 'gone', kind: 'session', state: 'sleeping', lastActive: N - 49 * H, tourist: true },
    { id: 'wait', kind: 'session', project: 'q', state: 'waiting', lastActive: N - 50 * H },
    { id: 'work', kind: 'session', project: 'p', state: 'working', lastActive: N - 1 * S },
    { id: 'idle', kind: 'session', project: 'p', state: 'idle', lastActive: N - 2 * H },
    { id: 'idle2', kind: 'session', project: 'p', state: 'idle', lastActive: N - 3 * H },
    { id: 'work:h1', kind: 'agent', parent: 'work', state: 'working', lastActive: N },
    { id: 'work:h2', kind: 'agent', parent: 'work', state: 'idle', lastActive: N - 5 * MIN },
    { id: 'old:h3', kind: 'agent', parent: 'old', state: 'working', lastActive: N },
  ];
  const ids = visibleCast(list, N).map((c) => c.id);
  assert.equal(ids[0], 'wait', 'needs-you first');
  assert.deepEqual([...ids].sort(), ['idle', 'idle2', 'tour', 'wait', 'work', 'work:h1'], 'finished helpers, helpers of hidden threads, day-old threads past the latest three and checked-out tourists are gone');
  assert.equal(checkoutIn(list[1], N), TOURIST_STAY_MS - 30 * H);
  assert.equal(checkoutIn(list[0], N), null);
});
test('[rules] after a quiet day or two, each building keeps its latest three threads outside, resting', () => {
  const N = 10 * D;
  const list = ['a', 'b', 'c', 'd'].map((x, i) => ({ id: x, kind: 'session', project: 'alpha', state: 'sleeping', lastActive: N - (40 + i) * H }))
    .concat({ id: 'solo', kind: 'session', project: 'beta', state: 'sleeping', lastActive: N - 100 * H });
  assert.deepEqual(visibleCast(list, N).map((c) => c.id).sort(), ['a', 'b', 'c', 'solo']);
});
test('a working thread heads to the workshop for its tool; helpers and thinkers stay put', () => {
  const key = (t) => toolInfo(t).key;
  assert.equal(destination({ state: 'working', kind: 'session', tool: 'Bash' }, key), 'forge');
  assert.equal(destination({ state: 'working', kind: 'session', tool: 'Edit' }, key), 'library');
  assert.equal(destination({ state: 'working', kind: 'session', tool: null }, key), 'home');
  assert.equal(destination({ state: 'idle', kind: 'session', tool: 'Bash' }, key), 'home');
  assert.equal(destination({ state: 'working', kind: 'agent', tool: 'Bash' }, key), 'home', 'helpers follow their thread instead');
  assert.equal(destination({ state: 'waiting', kind: 'session', tool: null }, key), 'home', 'a thread that needs you goes back to its own door');
});
test('[rules] a working thread finishes each trip and stays a moment before heading to the next', () => {
  const memo = new Map(), T = 1_000_000;
  assert.equal(settleDestination(memo, 'x', 'library', T), 'library');
  assert.equal(settleDestination(memo, 'x', 'forge', T + 20_000), 'library', 'still on its way: it does not turn back halfway');
  assert.equal(settleDestination(memo, 'x', 'forge', T + 21_000, true, true), 'library', 'just arrived: it stays a moment');
  assert.equal(settleDestination(memo, 'x', 'forge', T + 21_000 + WORKSHOP_DWELL_MS), 'forge');
  assert.equal(settleDestination(memo, 'x', 'beacon', T + 22_000 + WORKSHOP_DWELL_MS + TRIP_MAX_MS), 'beacon', 'a trip that never arrives is given up');
  assert.equal(settleDestination(memo, 'x', 'home', T + 22_001 + WORKSHOP_DWELL_MS + TRIP_MAX_MS, false), 'home', 'a finished turn goes home at once');
  assert.equal(settleDestination(memo, 'x', 'forge', T + 22_002 + WORKSHOP_DWELL_MS + TRIP_MAX_MS), 'forge', 'back to work at once, even before it got home');
});
test('[rules] characters at the same workshop stand side by side', () => {
  assert.deepEqual([...spreadAt(['b', 'a', 'c'])], [['a', -1], ['b', 0], ['c', 1]]);
  assert.deepEqual([...spreadAt(['solo'])], [['solo', 0]]);
});

test('[check #9] excluded folders get no building; their sessions stay', () => {
  const sessions = [{ id: 'o', kind: 'session', project: 'Olympia', state: 'working', lastActive: 1 }, { id: 'w', kind: 'session', project: 'alpha-wt', state: 'idle', lastActive: 1 }];
  const { projects, sessions: out } = mergeProjects(code, sessions, { exclude: ['Olympia', 'alpha-wt'] });
  assert.deepEqual(projects.map((p) => p.id), ['alpha', 'betaapp']);
  assert.equal(out.length, 2);
  const kept = mergeProjects(code, sessions, { exclude: ['Olympia', 'alpha-wt'], keep: ['olympia'] });
  assert.deepEqual(kept.projects.map((p) => p.id), ['alpha', 'betaapp', 'Olympia'], 'the island\'s own folder gets a building on the ground');
});

test('[check #10] cards count sessions and helper agents separately', () => {
  const sessions = [
    { id: 's', kind: 'session', project: 'alpha', state: 'idle', lastActive: 1 },
    { id: 's:a1', kind: 'agent', project: 'alpha', state: 'working', lastActive: 2 },
    { id: 's:a2', kind: 'agent', project: 'alpha', state: 'working', lastActive: 3 },
  ];
  const p = mergeProjects(code, sessions).projects[0];
  assert.deepEqual([p.sessions, p.working, p.agents, p.agentsWorking, p.status], [1, 0, 2, 2, 'busy']);
});

test('[check #11] building spots are remembered, freed when a project goes, and overflow is explicit', () => {
  const file = path.join(ROOT, 'slots.json');
  const book = new SlotBook(file, 3);
  let m = book.assign([{ id: 'b' }, { id: 'a' }, { id: 'zz', claudeOnly: true }, { id: 'c' }]);
  assert.deepEqual([m.get('a'), m.get('b'), m.get('c'), m.get('zz')], [0, 1, 2, null], 'code projects first, alphabetical; the 4th has no room');
  m = new SlotBook(file, 3).assign([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  assert.deepEqual([m.get('a'), m.get('b'), m.get('c')], [0, 1, 2], 'same spots after a restart, whatever the order');
  m = new SlotBook(file, 3).assign([{ id: 'a' }, { id: 'c' }, { id: 'zz', claudeOnly: true }]);
  assert.equal(m.get('zz'), 1, 'b left, so zz gets its spot');
  assert.equal(m.get('c'), 2, 'nobody else moves');
  assert.equal(PROJECT_SLOTS.length, 13);
});

// ================================================================= messenger
const T0 = 1_000_000;
const W = (id, tool, last = T0) => ({ id, state: 'working', tool, lastActive: last });
const I = (id) => ({ id, state: 'idle', tool: null, lastActive: 0 });
test('[check #1] the first tool of a turn moves the messenger', () => {
  const list = applySignal([I('a')], { id: 'a', event: 'start', tool: 'Bash' }, T0);
  const p = planMessenger(list, { state: 'idle' }, T0);
  assert.deepEqual([p.state, p.tool], ['tool', 'Bash']);
});
test('[check #2] one session finishing doesn\'t send it home while another works', () => {
  let p = planMessenger([W('a', 'Edit', T0), W('b', 'Bash', T0 + 1)], null, T0);
  const list = applySignal([W('a', 'Edit', T0), W('b', 'Bash', T0 + 1)], { id: 'b', event: 'done' }, T0 + 2);
  p = planMessenger(list, p, T0 + 2);
  assert.deepEqual([p.state, p.tool, p.id], ['tool', 'Edit', 'a']);
});
test('[check #3] new work during the "reply" pause cancels going home', () => {
  let p = planMessenger([W('a', 'Bash')], null, T0);
  p = planMessenger([I('a')], p, T0 + 1);
  assert.equal(p.state, 'speaking');
  p = planMessenger([W('a', 'WebSearch', T0 + 2)], p, T0 + 2);
  assert.deepEqual([p.state, p.tool], ['tool', 'WebSearch']);
  p = planMessenger([W('a', 'WebSearch', T0 + 2)], p, T0 + REPLY_MS + 10);
  assert.equal(p.state, 'tool', 'the old pause expiring changes nothing');
});
test('[check #4] when everyone stops, it replies and then always ends up idle', () => {
  let p = planMessenger([W('a', 'Read')], null, T0);
  p = planMessenger([I('a')], p, T0 + 100);
  assert.equal(p.state, 'speaking');
  p = planMessenger([I('a')], p, T0 + 100 + REPLY_MS - 1);
  assert.equal(p.state, 'speaking');
  p = planMessenger([I('a')], p, T0 + 100 + REPLY_MS + 1);
  assert.equal(p.state, 'idle');
});
test('it sticks with the session it is serving instead of ping-ponging', () => {
  let p = planMessenger([W('a', 'Read', T0), W('b', 'Bash', T0 - 5)], null, T0);
  assert.equal(p.id, 'a');
  p = planMessenger([W('a', 'Grep', T0), W('b', 'WebSearch', T0 + 9)], p, T0 + 10);
  assert.deepEqual([p.id, p.tool], ['a', 'Grep']);
});

// ================================================================= routing
test('[check #16] messenger goes to the right workshop, with the right words', () => {
  const cases = {
    Bash: ['forge', 'Running a command'], PowerShell: ['forge'], Monitor: ['forge'],
    Read: ['library', 'Working through files'], Edit: ['library'], Write: ['library'], Grep: ['library'], Glob: ['library'], NotebookEdit: ['library'],
    WebSearch: ['beacon', 'Searching the web'], WebFetch: ['beacon'],
    mcp__Claude_Browser__navigate: ['beacon'], mcp__Claude_Browser__computer: ['beacon'], 'mcp__claude-in-chrome__find': ['beacon'],
    mcp__Claude_Browser__preview_start: ['forge', 'Running a command'], mcp__Claude_Browser__preview_logs: ['forge'],
    Skill: ['archive', 'Looking things up'], ToolSearch: ['archive'], TodoWrite: ['archive'],
    mcp__hearthbot__fetch_thread: ['archive', 'Looking things up'], mcp__hearthbot__read_project_file: ['archive'], mcp__hearthbot__list_thread_sessions: ['archive'],
    mcp__hearthbot__reply: ['aviary', 'Sending a message'], mcp__hearthbot__update_status: ['archive'], mcp__hearthbot__react: ['aviary'],
    Agent: ['aviary'], SendMessage: ['aviary'], SendUserFile: ['aviary', 'Sending a message'],
    AskUserQuestion: ['aviary', 'Asking you a question'],
    'mcp__computer-use__left_click': ['forge', 'Using the computer'],
    'mcp__e9da0dac-12e5-48b6-8a86-6a489c28a7e4__get_values': ['library'],
    terminal: ['forge'], web_search: ['beacon'], read_file: ['library'], memory: ['archive'], send_message: ['aviary'], session_search: ['archive'], patch: ['library'],
  };
  for (const [tool, [key, verb]] of Object.entries(cases)) {
    const info = toolInfo(tool);
    assert.equal(info.key, key, tool);
    if (verb) assert.equal(info.verb, verb, `${tool} verb`);
  }
  assert.equal(toolInfo('mcp__blender__execute_blender_code', 'p:image-lab').key, 'p:image-lab', 'visual work goes to the studio project');
  assert.equal(toolInfo('mcp__blender__look', 'p:image-lab').key, 'p:image-lab');
  assert.equal(toolInfo('image_generate').key, 'aviary', 'no studio building: falls back to the aviary');
  assert.deepEqual([toolInfo('SomethingNew').key, toolInfo('SomethingNew').verb], ['forge', 'Using SomethingNew']);
});

test('tool names read naturally', () => {
  assert.equal(toolLabel('mcp__claude-in-chrome__navigate'), 'navigate (claude-in-chrome)');
  assert.equal(toolLabel('mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch'), 'batch (connector)');
  assert.equal(toolLabel('Bash'), 'Bash');
});

// ================================================================= day and night over Charlotte, NC
const HP = { lat: 35.2271, lon: -80.8431 };
const deg = (r) => (r * 180) / Math.PI;
test('sun is up at noon, down at midnight (Charlotte, 20 Oct 2026, EDT = UTC-4)', () => {
  assert.ok(deg(sunPosition(new Date('2026-10-20T13:15:00-04:00'), HP.lat, HP.lon).altitude) > 40);
  assert.ok(deg(sunPosition(new Date('2026-10-21T00:30:00-04:00'), HP.lat, HP.lon).altitude) < -30);
});
test('sunrise and sunset land at the right times (about 7:38 and 18:39 EDT)', () => {
  const alt = (t) => deg(sunPosition(new Date(`2026-10-20T${t}:00-04:00`), HP.lat, HP.lon).altitude);
  assert.ok(alt('07:15') < 0 && alt('07:50') > 0, `sunrise: ${alt('07:15').toFixed(1)} -> ${alt('07:50').toFixed(1)}`);
  assert.ok(alt('18:20') > 0 && alt('18:55') < 0, `sunset: ${alt('18:20').toFixed(1)} -> ${alt('18:55').toFixed(1)}`);
});
test('morning sun is in the east, evening sun in the west (scene: +x = east)', () => {
  const dir = (t) => { const s = sunPosition(new Date(`2026-10-20T${t}:00-04:00`), HP.lat, HP.lon); return toDirection(s.azimuth, s.altitude); };
  assert.ok(dir('08:30').x > 0.5, 'morning: east');
  assert.ok(dir('17:30').x < -0.5, 'evening: west');
  assert.ok(dir('13:15').z > 0.3, 'midday: south (+z)');
});
test('moon phase matches the calendar', () => {
  assert.equal(moonPhaseName(moonIllumination(new Date('2026-10-26T12:00:00Z')).phase), 'Full moon');
  assert.ok(moonIllumination(new Date('2026-10-10T12:00:00Z')).fraction < 0.05);
  assert.ok(moonIllumination(new Date('2026-10-26T12:00:00Z')).fraction > 0.95);
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

// ================================================================= "say what's actually happening"
test('each working session reports its real current step', () => {
  assert.equal(byId('a-longtool').detail, 'Build the release bundle', 'the session\'s own description of the command');
  assert.equal(byId('a-done').detail, null, 'idle sessions have no step');
});
test('step descriptions are short and safe', () => {
  const d = (name, input) => describeTool(name, input);
  assert.equal(d('Bash', { command: 'rm -rf build && npm test', description: 'Run the tests' }), 'Run the tests');
  assert.equal(d('Bash', { command: 'git status --porcelain' }), 'git', 'no description: just the program name');
  assert.equal(d('Edit', { file_path: 'C:\\code\\Olympia\\public\\js\\world.js', old_string: 'x', new_string: 'y' }), 'world.js');
  assert.equal(d('Read', { file_path: '/home/me/notes.md' }), 'notes.md');
  assert.equal(d('WebSearch', { query: 'three.js GTAO pass' }), '"three.js GTAO pass"');
  assert.equal(d('WebFetch', { url: 'https://www.reddit.com/r/x?token=abc' }), 'reddit.com', 'only the site, never the full address');
  assert.equal(d('mcp__Claude_Browser__navigate', { url: 'http://localhost:3110/?fixedq' }), 'localhost');
  assert.equal(d('Skill', { skill: '3d-assets' }), '3d-assets');
  assert.equal(d('TodoWrite', { todos: [{ status: 'completed', content: 'a' }, { status: 'in_progress', content: 'b', activeForm: 'Wiring the planner' }] }), 'Wiring the planner');
  assert.equal(d('mcp__hearthbot__update_status', { text: 'Task\n\n✓ done\n✱ Checking it live on your PC\n○ next' }), 'Checking it live on your PC');
  assert.equal(d('mcp__hearthbot__reply', { text: 'private words' }), 'Replying in the thread', 'reply text never shown');
  assert.equal(d('Write', { file_path: 'a.txt', content: 'SECRET' }), 'a.txt');
  assert.equal(d('Bash', null), null);
  assert.equal(d('mcp__Claude_Browser__computer', { action: 'left_click', action_summary: 'Opens the Filters menu' }), 'Opens the Filters menu');
  assert.equal(d('mcp__Claude_Browser__browser_batch', { actions: [{ name: 'navigate', input: { url: 'http://localhost:3110/?x' } }, { name: 'computer', input: { action: 'screenshot' } }] }), 'on localhost');
  assert.equal(d('mcp__Claude_Browser__browser_batch', { actions: [{ name: 'javascript_tool', input: {} }, { name: 'read_console_messages', input: {} }] }), 'javascript_tool, read_console_messages');
  assert.ok(d('Bash', { description: 'x'.repeat(200) }).length <= 60);
});
test('step descriptions can be switched off', () => {
  const c4 = new ClaudeCollector({ ...cfg, claudeDetails: false }, () => {}); c4.poll();
  assert.equal(c4.sessions.find((s) => s.id === 'a-longtool').detail, null);
});
test('the messenger carries the step of the session it serves', () => {
  const p = planMessenger([{ id: 'a', state: 'working', tool: 'Bash', detail: 'Run the tests', title: 'Fix CI', lastActive: 1 }], null, 1);
  assert.deepEqual([p.detail, p.title], ['Run the tests', 'Fix CI']);
  const list = applySignal([{ id: 'a', state: 'idle' }], { id: 'a', event: 'tool', tool: 'Edit', detail: 'world.js' }, 5);
  assert.equal(list[0].detail, 'world.js');
});

test('[rules] nobody lives on the Acropolis: the island\'s own threads live in their building on the ground', () => {
  const has = (k) => k === 'p:alpha' || k === 'p:Olympia';
  assert.equal(homeFor('Olympia', has), 'p:Olympia');
  assert.notEqual(homeFor('olympia', has, 'Olympia'), 'summit');
  assert.equal(homeFor('alpha', has), 'p:alpha');
  assert.equal(homeFor('alpha-wt', has), 'agora', 'other excluded folders gather in the Agora');
  assert.equal(homeFor(null, has), 'agora');
});

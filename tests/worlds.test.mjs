// Worlds list and packs: every entry in public/worlds/worlds.json can actually be drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickWorld } from '../public/js/settings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = path.join(ROOT, 'public', 'worlds');
const list = JSON.parse(fs.readFileSync(path.join(W, 'worlds.json'), 'utf8')).worlds;
const pub = (url) => path.join(ROOT, 'public', url);

test('worlds.json: unique ids, known engines, a preview for each', () => {
  assert.equal(new Set(list.map((w) => w.id)).size, list.length);
  for (const w of list) {
    assert.ok(['olympus', 'village', 'kit'].includes(w.engine), `${w.id} engine`);
    assert.ok(['map', 'world', 'reskin'].includes(w.group), `${w.id} group`);
    assert.ok(w.name && w.blurb, `${w.id} name and blurb`);
    assert.ok(fs.existsSync(pub(w.preview)), `${w.id} preview ${w.preview}`);
  }
  assert.equal(list.filter((w) => w.engine === 'kit').length, 10);
  assert.equal(list.filter((w) => w.group === 'map').length, 7); // first-batch mockups 2-9 without Pocket
  assert.equal(list.filter((w) => w.group === 'reskin').length, 4); // Olympus, the village, Golden Hour, Holo
});

test('every pack parses, its skin exists, and every model it names was copied into _kits', () => {
  for (const w of list.filter((x) => x.pack)) {
    const def = JSON.parse(fs.readFileSync(path.join(W, w.id, 'world.json'), 'utf8'));
    if (def.skin) assert.ok(fs.existsSync(path.join(W, w.id, def.skin)), `${w.id} skin`);
    if (w.engine !== 'kit') { assert.ok(def.look, `${w.id} is a look`); continue; }
    const b = def.buildings;
    for (const k of ['summit', 'forge', 'library', 'beacon', 'archive', 'aviary', 'agora', 'hotel']) assert.ok(b[k], `${w.id} has a ${k}`);
    assert.ok(b.projects?.length, `${w.id} has project buildings`);
    assert.ok(def.residents?.length, `${w.id} has residents`);
    const refs = [];
    const spec = (s) => typeof s === 'string' ? refs.push(s) : Array.isArray(s) ? s.forEach(spec) : s.m ? refs.push(s.m) : s.parts?.forEach((p) => refs.push(p[0]));
    Object.values(b).forEach(spec);
    for (const s of [...(def.scatter || []), ...(def.slope || [])]) refs.push(...s.models);
    refs.push(...def.residents);
    for (const r of refs.filter((x) => !x.startsWith('@'))) assert.ok(fs.existsSync(path.join(W, '_kits', r + '.glb')), `${w.id}: ${r} (run node tools/build-worlds.mjs)`);
  }
});

test('pickWorld: URL beats the device choice, which beats the config; unknown ids fall back', () => {
  const ids = list.map((w) => w.id);
  const p = (q) => new URLSearchParams(q);
  globalThis.localStorage = { getItem: () => 'harbor' };
  try {
    assert.equal(pickWorld(p('world=holo'), 'village', ids), 'holo');
    assert.equal(pickWorld(p(''), 'village', ids), 'harbor');
    assert.equal(pickWorld(p('world=nope'), 'village', ids), 'harbor');
    globalThis.localStorage = { getItem: () => null };
    assert.equal(pickWorld(p(''), 'village', ids), 'village');
    assert.equal(pickWorld(p('theme=space'), 'village', ids), 'space');
    assert.equal(pickWorld(p(''), undefined, ids), 'olympus');
  } finally { delete globalThis.localStorage; }
});

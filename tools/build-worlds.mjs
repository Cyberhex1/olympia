// Copies the Kenney models that the world packs use into public/worlds/_kits/<kit>/ (plus each kit's texture and
// licence), so the app ships only what the worlds need. Run after editing a public/worlds/<id>/world.json:
//   node tools/build-worlds.mjs
// Sources: the CC0 kits downloaded for the mockups (mockups/assets-src/kits) and the island's nature kit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORLDS = path.join(ROOT, 'public', 'worlds');
const OUT = path.join(WORLDS, '_kits');
const SOURCES = { 'nature-kit': path.join(ROOT, 'assets-src', 'kenney-nature-kit') };
const kitDir = (kit) => SOURCES[kit] || path.join(ROOT, 'mockups', 'assets-src', 'kits', kit);

// same walk as modelRefs() in public/js/kitworld.js
function refs(def) {
  const out = new Set();
  const spec = (s) => {
    if (!s) return;
    if (typeof s === 'string') out.add(s);
    else if (Array.isArray(s)) s.forEach(spec);
    else if (s.m) out.add(s.m);
    else if (s.parts) s.parts.forEach((p) => out.add(p[0]));
  };
  for (const v of Object.values(def.buildings || {})) spec(v);
  for (const s of [...(def.scatter || []), ...(def.slope || [])]) s.models.forEach((m) => out.add(m));
  (def.residents || []).forEach((m) => out.add(m));
  return out;
}

const all = new Set();
for (const id of fs.readdirSync(WORLDS)) {
  const f = path.join(WORLDS, id, 'world.json');
  if (id.startsWith('_') || !fs.existsSync(f)) continue;
  for (const r of refs(JSON.parse(fs.readFileSync(f, 'utf8')))) if (!r.startsWith('@')) all.add(r);  // @shapes are drawn by kitworld.js
}

fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0, missing = 0;
const kits = new Set();
for (const ref of [...all].sort()) {
  const [kit, name] = ref.split('/');
  const src = ['GLB format', 'GLTF format'].map((d) => path.join(kitDir(kit), 'Models', d, name + '.glb')).find((p) => fs.existsSync(p));
  if (!src) { console.error('missing model', ref); missing++; continue; }
  const dst = path.join(OUT, kit, name + '.glb');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst); bytes += fs.statSync(dst).size;
  // external textures the model points at (Kenney kits share one colormap.png per kit)
  const buf = fs.readFileSync(src), json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
  for (const img of json.images || []) {
    if (!img.uri) continue;
    const t = path.join(path.dirname(dst), img.uri);
    if (!fs.existsSync(t)) { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(path.join(path.dirname(src), img.uri), t); bytes += fs.statSync(t).size; }
  }
  if (!kits.has(kit)) {
    kits.add(kit);
    const lic = path.join(kitDir(kit), 'License.txt');
    if (fs.existsSync(lic)) fs.copyFileSync(lic, path.join(OUT, kit, 'License.txt'));
  }
}
console.log(`${all.size} models from ${kits.size} kits, ${(bytes / 1e6).toFixed(1)} MB${missing ? `, ${missing} missing` : ''}`);
process.exit(missing ? 1 : 0);

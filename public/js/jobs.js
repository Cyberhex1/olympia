// What each project does on the island: its station (a workbench beside its building) and the job its threads do
// there. Pure (no three.js), shared by the page and the server (lib/stations.js picks a job from what a project is).
//   A working thread makes one piece at its station in 4 stages, taken from its real checklist (or, without one,
//   from how far its current turn has got). A finished piece is carried up the mountain to the Acropolis.

// words: what a project's name, README, package.json and CLAUDE.md say when it does this kind of work
export const JOBS = {
  smithy: { place: 'Smithy', job: 'forging a sword', result: 'a sword', motion: 'hammer',
    stages: ['Heating the bar', 'Hammering the blade', 'Quenching', 'Polishing the hilt'],
    words: ['olympia', 'claude code', 'three.js', 'island', 'engine', 'forge', 'cli', 'toolkit', 'compiler', 'framework', 'widget'] },
  library: { place: 'Reading tables', job: 'reading for a discovery', result: 'a discovery', motion: 'read',
    stages: ['Pulling books', 'Reading', 'Taking notes', 'Onto something'],
    words: ['search', 'research', 'market', 'shopping', 'scrape', 'crawl', 'wiki', 'knowledge', 'notes', 'compare', 'prices', 'services', 'providers', 'lists'] },
  bakery: { place: 'Bakery', job: 'baking bread', result: 'a loaf of bread', motion: 'knead',
    stages: ['Mixing the dough', 'Kneading', 'Proofing', 'Baking'],
    words: ['candy', 'bake', 'bakery', 'bread', 'recipe', 'kitchen', 'food', 'cook', 'restaurant', 'cafe'] },
  easel: { place: "Painter's easel", job: 'painting a picture', result: 'a painting', motion: 'paint',
    stages: ['Sketching', 'Blocking in colour', 'Adding detail', 'Varnishing'],
    words: ['design', 'prototype', 'frontend', 'comfyui', 'comfy', 'image', 'art', 'paint', 'gallery', 'studio', 'figma', 'mockup', 'css', 'presets'] },
  lyre: { place: "Lyre maker's bench", job: 'stringing a lyre', result: 'a lyre', motion: 'pluck',
    stages: ['Carving the frame', 'Stringing', 'Tuning', 'Playing it through'],
    words: ['speech', 'voice', 'audio', 'tts', 'sound', 'music', 'speak', 'aloud', 'narrat', 'podcast', 'song', 'ocr'] },
  observatory: { place: 'Telescope', job: 'charting the sky', result: 'a star chart', motion: 'gaze',
    stages: ['Aiming the telescope', 'Watching', 'Charting', 'Marking a find'],
    words: ['system', 'cpu', 'gpu', 'memory', 'disk', 'monitor', 'startup', 'process', 'dashboard', 'metrics', 'stats', 'performance', 'debloat', 'task manager'] },
  scribe: { place: "Scribe's desk", job: 'writing a letter', result: 'a sealed letter', motion: 'write',
    stages: ['Drafting', 'Inking', 'Sealing', 'Rolling it up'],
    words: ['job', 'resume', 'cover letter', 'email', 'letter', 'apply', 'application', 'mail', 'writing', 'essay', 'document', 'invoice'] },
  potter: { place: "Potter's wheel", job: 'throwing an amphora', result: 'an amphora', motion: 'spin',
    stages: ['Throwing the clay', 'Shaping', 'Glazing', 'Firing'],
    words: ['catalog', 'marketplace', 'social', 'platform', 'community', 'share', 'fork', 'website', 'cloudflare', 'deploy', 'hosting', 'store', 'upload'] },
  lamps: { place: "Lamp maker's bench", job: 'making an oil lamp', result: 'a lit lamp', motion: 'write',
    stages: ['Shaping the clay', 'Filling the oil', 'Trimming the wick', 'Lighting it'],
    words: ['launcher', 'ports', 'localhost', 'dev site', 'dev server', 'one click', 'bookmark', 'shortcut', 'tray', 'start them'] },
  masks: { place: "Mask maker's bench", job: 'making a theatre mask', result: 'a theatre mask', motion: 'paint',
    stages: ['Carving', 'Painting', 'Tying the ribbons', 'Trying it on'],
    words: ['game', 'flash', 'ruffle', 'play', 'quest', 'npc', 'level', 'story', 'emulat', 'rpg', 'save slot', 'steam', 'mod'] },
  sculptor: { place: "Sculptor's block", job: 'carving a statue', result: 'a statue', motion: 'hammer',
    stages: ['Roughing out', 'Carving', 'Detailing', 'Polishing'],
    words: ['blender', '3d', 'model', 'mesh', 'sculpt', 'glb', 'gltf', 'render', 'asset', 'animation'] },
  carpenter: { place: "Carpenter's bench", job: 'building a chest', result: 'a wooden chest', motion: 'saw',
    stages: ['Measuring', 'Sawing', 'Joining', 'Sanding'],
    words: ['test', 'tests', 'fix', 'repair', 'build', 'script', 'utility'] },
  // a tourist whose work doesn't say what it is: a writing desk on the Hotel terrace
  postcards: { place: 'Terrace desk', job: 'writing a postcard', result: 'a postcard', motion: 'write',
    stages: ['Sketching the view', 'Writing', 'Stamping', 'Addressing it'],
    words: ['temp', 'tmp', 'scratch', 'downloads', 'desktop'] },
};
export const JOB_KEYS = Object.keys(JOBS);
export const FALLBACK_JOB = 'carpenter';
export const TOURIST_JOB = 'postcards';

// Which job fits `text` (name, README, descriptions). The name counts three times. null when nothing matches.
export function jobFromText(name = '', text = '') {
  const hay = `${String(name).toLowerCase()} `.repeat(3) + String(text).toLowerCase();
  let best = null, top = 0;
  for (const key of JOB_KEYS) {
    let n = 0;
    for (const w of JOBS[key].words) {
      const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      n += (hay.match(re) || []).length;
    }
    if (n > top) { top = n; best = key; }
  }
  return best;
}

// A thread's checklist counts only while it belongs to the current piece: one finished before the latest prompt
// was for an earlier piece.
function list(s) {
  const p = s?.progress;
  if (!p || !p.total) return null;
  if (p.done >= p.total && s.promptAt && p.at && p.at < s.promptAt) return null;
  return p;
}

// The stage (1-4) a thread's piece is at: its checklist split into 4 (2 of 8 done = stage 2), or without one the
// steps its current turn has taken (a few, a dozen, thirty).
export function stageOf(s) {
  const p = list(s);
  if (p) return Math.min(4, 1 + Math.floor((p.done / p.total) * 4));
  const n = s?.steps || 0;
  return n < 4 ? 1 : n < 12 ? 2 : n < 30 ? 3 : 4;
}

// The piece is finished: the thread was resolved, its checklist is all done, or (no checklist) its turn ended.
export function pieceDone(s) {
  if (!s) return false;
  if (s.resolved) return true;
  const p = list(s);
  return p ? p.done >= p.total : s.state !== 'working';
}

// The thread is finished with for now: resolved in the project, or (no thread to resolve) its checklist is all done
// and its turn ended. It goes inside until it is called again.
export function isResolved(s) {
  if (!s || s.state === 'working' || s.state === 'waiting') return false;
  if (s.resolved) return true;
  const p = list(s);
  return Boolean(p && p.done >= p.total && !s.isThread);
}

// "Smithy · forging a sword · Hammering the blade (2/4)"
export function stageLabel(key, stage) {
  const j = JOBS[key] || JOBS[FALLBACK_JOB];
  return `${j.stages[Math.max(1, Math.min(4, stage)) - 1]} (${stage}/4)`;
}

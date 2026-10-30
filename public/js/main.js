import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Sky } from './sky.js';
import { buildWorld, LAYOUT, PLATEAU_Y, edgeRadius, useTerrain, groundY } from './world.js';
import { makeBuilding, PROJECT_STYLES, THEMES } from './buildings.js';
import { Messenger, Resident, SPECIES_LIST } from './characters.js';
import { FX } from './fx.js';
import { Bubbles, Labels, Card, Feed, Face, cardHTML, toast } from './ui.js';
import { polar, hash, esc, timeAgo, deg } from './util.js';
import { toolInfo as baseToolInfo, toolLabel } from './tools.js';
import { planMessenger, applySignal } from './messenger.js';
import { homeFor } from './shared.js';
import { visibleCast, destination, settleDestination, spreadAt, checkoutIn } from './cast.js';
import { StationLife } from './stationlife.js';
import { isResolved } from './jobs.js';
import { pickWorld, initSettings, worldSettings } from './settings.js';
import { addFinish } from './finish.js';
import { loadKitWorld } from './kitworld.js';
import { initDesktop } from './desktop.js';
import { loadSceneWorld } from './sceneworld.js';

const params = new URLSearchParams(location.search);
// the desktop widget floats the island on the desktop: transparent page, no sky (desktop.js)
const DESKTOP = params.has('desktop');
const boot = await fetch('/api/state').then((r) => r.json()).catch(() => ({}));
// Worlds (public/worlds/worlds.json): the two built-in islands, looks that restyle Olympus, and world packs
// that dress the island as somewhere else (kitworld.js). A pack's world.json also sets its sky, camera, finish and UI skin.
const WORLDS = (await fetch('/worlds/worlds.json').then((r) => r.json()).catch(() => ({}))).worlds || [];
const playable = WORLDS.filter((w) => THEMES[w.engine] || w.engine === 'kit');
const WORLD_ID = pickWorld(params, boot.theme, [...playable.map((w) => w.id), ...Object.keys(THEMES)]);
const ENTRY = playable.find((w) => w.id === WORLD_ID) || { id: WORLD_ID, engine: WORLD_ID };
const PACK = ENTRY.pack ? await fetch(`/worlds/${ENTRY.id}/world.json`).then((r) => r.json()).catch((e) => { console.warn('world pack failed', e); return null; }) : null;
// a map world brings its own ground and layout (sceneworld.js); set it before anything is placed
if (PACK?.terrain) useTerrain(PACK.terrain);
const KIT = ENTRY.engine === 'kit' && PACK ? await loadKitWorld(ENTRY.id, PACK).catch((e) => { console.warn('world failed', e); return null; }) : null;
const THEME_NAME = KIT ? 'kit' : THEMES[ENTRY.engine] ? ENTRY.engine : 'olympus';
const THEME = THEMES[THEME_NAME] || THEMES.olympus;
document.body.dataset.world = PACK ? ENTRY.id : THEME_NAME;
if (PACK?.skin) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `/worlds/${ENTRY.id}/${PACK.skin}` }));
if (PACK?.tagline) document.querySelector('#title .tagline').textContent = PACK.tagline;
const mk = (spec, fallback) => { const s = spec || fallback; return Array.isArray(s) ? makeBuilding(s[0], s[1]) : makeBuilding(s); };
const VILLAGE_NAMES = { summit: ['The Hilltop Hall', 'Where finished work is sent up to. Home of the messenger and the daily recap'], forge: ['The Mill Workshop', 'Where commands are hammered out'],
  library: ['The Library Cottage', 'Files read, written and patched'], beacon: ['The Clock Tower', 'Looks out across the web'],
  archive: ['The Archive Tower', 'Memories and past sessions'], aviary: ['The Post Office', 'Messages and helpers take flight'] };
const PLACE = { name: 'Athens', lat: 37.9715, lon: 23.7257 };

// ================================================================= renderer & scene
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: DESKTOP, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// a page opened hidden (widget starting in the tray, a background tab) can be 0×0 at first: 0/0 would leave the camera at NaN for good
const camera = new THREE.PerspectiveCamera(38, innerWidth && innerHeight ? innerWidth / innerHeight : 16 / 9, 0.5, 2000);
const HOME_CAM = { pos: new THREE.Vector3(0, 40, 70), target: new THREE.Vector3(0, 3, 0) };
// pull back on tall/narrow screens so the whole island fits
// floating on the desktop the whole island shows, underside included, so pull back further
const homePos = () => {
  const p = HOME_CAM.pos.clone();
  if (camera.aspect < 0.8) { const d = p.length(); p.y *= 1.6; p.setLength(d); } // portrait phones: look down more steeply so the place fills the screen
  // a pack can pull further back on portrait screens ("camera.portrait": square places trimmed at the sides)
  const portrait = camera.aspect < 0.8 ? PACK?.camera?.portrait ?? 1 : 1;
  return p.multiplyScalar(Math.min(3, Math.max(1, 1.3 / camera.aspect)) * portrait * (DESKTOP ? 1.4 : 1));
};
camera.position.copy(homePos());
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_CAM.target);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minDistance = 12; controls.maxDistance = 140; controls.maxPolarAngle = 1.48;
// tall phones and the floating widget start further out than 140: never clamp the home view
const roomForHome = () => { controls.maxDistance = Math.max(controls.maxDistance, homePos().length() * 1.15); };
roomForHome();
controls.autoRotateSpeed = 0.35;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// soft contact shadows where trees, rocks and buildings meet the ground
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2.5, scale: 1.0, samples: 12 });
gtao.blendIntensity = 0.85;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = addFinish(composer, gtao, camera);  // ink outlines, warm grade, tilt-shift (same look as the world dioramas)
if (PACK?.finish) finish.setStyle(PACK.finish);
// a look can frame the island its own way: straight down like a map, side-on like an elevation drawing
if (PACK?.camera) {
  HOME_CAM.pos.fromArray(PACK.camera.pos); HOME_CAM.target.fromArray(PACK.camera.target || [0, 3, 0]);
  if (PACK.camera.fov) { camera.fov = PACK.camera.fov; camera.updateProjectionMatrix(); }
  camera.position.copy(homePos()); controls.target.copy(HOME_CAM.target);
  if (PACK.camera.minPolar != null) controls.minPolarAngle = PACK.camera.minPolar;
  if (PACK.camera.maxDistance) controls.maxDistance = PACK.camera.maxDistance;
  roomForHome();
}

const sky = new Sky(scene, PLACE);
if (DESKTOP) initDesktop({ renderer, scene, camera, sky });
// ---------------------------------------------------------------- assets built in Blender (see assets-src/)
async function loadAssets() {
  const gltf = new GLTFLoader();
  const load = (url) => gltf.loadAsync(url).catch((e) => { console.warn('asset failed', url, e); return null; });
  const [island, props] = await Promise.all([load('/assets/olympia-island.glb'), load('/assets/olympia-props.glb')]);
  const propMap = props ? new Map() : null;
  props?.scene.traverse((o) => { if (o.isMesh) propMap.set(o.name, o.geometry); });
  // image-based lighting from a Poly Haven sky (CC0), dimmed at night
  new HDRLoader().setDataType(THREE.FloatType).loadAsync('/assets/sky_1k.hdr').then((tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    // clamp the sun out of the HDRI: the directional light already plays the sun
    const d = tex.image.data; for (let i = 0; i < d.length; i++) if (d[i] > 1.5) d[i] = 1.5;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(tex).texture;
    tex.dispose(); pm.dispose();
  }).catch((e) => console.warn('sky hdr failed', e));
  return { island: island?.scene, props: propMap };
}
const world = PACK?.terrain ? await loadSceneWorld(scene, ENTRY.id, PACK.terrain)
  : buildWorld(scene, { ...(await loadAssets()), theme: THEME_NAME, look: DESKTOP ? { ...KIT?.look, clouds: false, islets: false } : KIT?.look, dress: KIT?.dress });
const fx = new FX(scene);
const bubbles = new Bubbles(document.getElementById('bubbles'), camera);
const labels = new Labels(document.getElementById('labels'), camera);
const card = new Card(document.getElementById('card'));
const feed = new Feed(document.getElementById('feed'));
const face = new Face(document.getElementById('face'));

if (params.has('hour')) { // preview a time of day, e.g. ?hour=21.5
  const d = new Date(); const h = Number(params.get('hour'));
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0); sky.offsetMs = d - Date.now();
} else if (PACK?.sky?.hour != null) sky.pinHour = PACK.sky.hour;

// ================================================================= buildings
const pickables = [];
const buildings = new Map(); // key -> { b, kind, info, label }

// facing the centre, unless a map world's layout turns it: `face` is the angle whose centre-facing it copies
// (so a desk at any spot can face the way one at angle `face` would, e.g. along its aisle)
function place(b, theta, r, face) {
  const p = polar(theta, r, 0);
  p.y = groundY(p.x, p.z);  // standing on the floor of a map world (the island's ground is 0 out here)
  b.group.position.copy(p);
  b.group.rotation.y = Math.PI / 2 - deg(face ?? theta);
  scene.add(b.group);
  pickables.push(b.group);
  return b;
}
function worldAnchor(b, local) { const o = new THREE.Object3D(); o.position.copy(local); b.group.add(o); return o; }
function doorWorld(b) { return b.group.localToWorld(b.anchors.door.clone()); }

// The summit hall is home to the messenger. Nobody else lives up here: threads send their finished work up.
// A world pack names its own places: names.<key> = [name, lede].
const NAMES = KIT ? KIT.names : THEME_NAME === 'village' ? VILLAGE_NAMES : {};
const named = (key, name, lede) => NAMES[key] ? { name: NAMES[key][0], lede: NAMES[key][1] ?? lede } : { name, lede };
const summit = KIT?.building('summit') || mk(THEME.summit);
summit.group.position.copy(LAYOUT.summit); scene.add(summit.group); pickables.push(summit.group);
buildings.set('summit', { b: summit, kind: 'summit', info: named('summit', 'The Acropolis', 'Where finished work is sent up to. Home of the messenger and the daily recap'), top: worldAnchor(summit, summit.anchors.top) });
const summitName = () => buildings.get('summit').info.name;

for (const [key, t] of Object.entries(LAYOUT.tools)) {
  const b = place(KIT?.building(key) || mk(THEME.tools[key], t.style), t.theta, t.r, t.face);
  buildings.set(key, { b, kind: 'tool', info: named(key, t.label, t.lede), top: worldAnchor(b, b.anchors.top), visits: 0, lastVisit: null });
}
const agora = place(KIT?.building('agora') || makeBuilding('agora'), LAYOUT.agora.theta, LAYOUT.agora.r, LAYOUT.agora.face);
buildings.set('agora', { b: agora, kind: 'agora', info: named('agora', 'The Agora', 'Where tasks are pinned and the village gathers'), top: worldAnchor(agora, agora.anchors.top) });
const agoraLanding = () => agora.group.localToWorld(agora.landing.clone());
// The Hotel: visiting threads (work outside C:\code) stay here and check out after two quiet days
const hotel = place(KIT?.building('hotel') || makeBuilding('hotel', { label: THEME_NAME === 'village' ? 'THE INN' : 'HOTEL' }), LAYOUT.hotel.theta, LAYOUT.hotel.r, LAYOUT.hotel.face);
buildings.set('hotel', { b: hotel, kind: 'hotel', top: worldAnchor(hotel, hotel.anchors.top),
  info: THEME_NAME === 'village' ? { name: 'The Inn', lede: 'Visiting threads stay here: work outside C:\\code. Guests leave after two quiet days.' }
    : named('hotel', 'The Hotel', 'Visiting threads stay here: work outside C:\\code. Guests check out after two quiet days.') });

// ================================================================= the messenger
// Mirrors Claude Code: flies to the workshop that matches what the busiest session is doing.
const messenger = new Messenger(scene);
const messengerHome = summit.group.localToWorld(summit.anchors.door.clone());
if (THEME_NAME === 'village') messenger.foxify();
messenger.setHome(messengerHome);
messenger.grounded = true;
messenger.idleHeading = 0;
pickables.push(messenger.group);

// tool name -> where the messenger goes and how it's described (see tools.js)
const studioKey = () => [...buildings.entries()].find(([, v]) => v.style === 'studio')?.[0] || null;
const toolInfo = (tool = '') => baseToolInfo(tool, studioKey());

const mState = { state: 'idle', tool: null, trips: 0 };
let messengerAt = 'summit', plan = null;

function driveMessenger(ev, quiet = false) {
  const prev = messenger.state;
  const state = ev.state || 'idle';
  messenger.setState(state);
  mState.state = state; mState.tool = ev.tool || null;
  const tag = (s) => `MESSENGER · ${s}`;
  const where = (k) => buildings.get(k)?.info.name || k;

  if (state === 'tool') {
    const ti = toolInfo(ev.tool);
    const dest = buildings.get(ti.key);
    messenger.grounded = false; messenger.carrying = false;
    if (dest && messengerAt !== ti.key) {
      messengerAt = 'flying';
      mState.trips++;
      messenger.flyTo(doorWorld(dest.b).add(new THREE.Vector3(0, 0.3, 0)), () => {
        messengerAt = ti.key; messenger.idleHeading = dest.b.group.rotation.y + Math.PI;
        fx.sparkle(messenger.group.position.clone().add(new THREE.Vector3(0, 1, 0)), '#bfe0ff');
      });
    }
    if (dest) { dest.b.active = 1; dest.visits = (dest.visits || 0) + 1; dest.lastVisit = Date.now(); dest.lastTool = ev.tool; }
    if (!quiet) bubbles.show('messenger', messenger.anchor, tag(where(ti.key)), `${esc(ti.verb)}<em>${ev.tool ? ` · ${esc(toolLabel(ev.tool))}` : ''}</em>`, 4);
  } else if (state === 'thinking') {
    if (prev === 'idle' && !quiet) {
      bubbles.show('messenger', messenger.anchor, tag('new task'), '<em>A new task! Let me think…</em>', 4);
      fx.parachute(messengerHome.clone().add(new THREE.Vector3(1.6, -0.2, 0.6)));
    }
  } else if (state === 'speaking') {
    messenger.carrying = true; messenger.grounded = false;
    if (messengerAt !== 'summit') {
      messengerAt = 'flying';
      messenger.flyTo(messengerHome, () => { messengerAt = 'summit'; messenger.idleHeading = 0; messenger.grounded = true; fx.sparkle(messengerHome.clone().add(new THREE.Vector3(0, 2.5, 0))); });
    } else fx.sparkle(messengerHome.clone().add(new THREE.Vector3(0, 2.5, 0)));
    if (!quiet) bubbles.show('messenger', messenger.anchor, tag('reply'), ev.text ? `“${esc(ev.text)}”` : '<em>Message delivered!</em>', 5);
  } else if (state === 'error') {
    if (!quiet) bubbles.show('messenger', messenger.anchor, tag('hiccup'), `<em>That didn't go to plan${ev.tool ? ` (${esc(ev.tool)})` : ''}. Trying another way.</em>`, 4);
  } else if (state === 'idle') {
    if (messengerAt !== 'summit') { // also mid-flight: flyTo starts from wherever it is now
      messengerAt = 'flying';
      messenger.flyTo(messengerHome, () => { messengerAt = 'summit'; messenger.idleHeading = 0; messenger.grounded = true; });
    }
  }
  if (state !== 'tool') for (const [k, v] of buildings) if (v.kind === 'tool' && k !== messengerAt) v.b.active = 0;
  updateFace();
}

// The messenger follows the whole session list (see messenger.js); the demo drives it by hand.
function steerMessenger() {
  if (demo || !state?.claude) return;
  const next = planMessenger(state.claude, plan);
  const changed = !plan || next.state !== plan.state || next.tool !== plan.tool;
  const newStep = next.state === 'tool' && (!plan || next.tool !== plan.tool || next.detail !== plan.detail || next.id !== plan.id);
  plan = next;
  if (changed) driveMessenger({ state: next.state, tool: next.tool }, true);
  if (newStep) {
    const ti = toolInfo(next.tool);
    bubbles.show('messenger', messenger.anchor, `${buildings.get(ti.key)?.info.name || ti.key} · for ${clipT(next.title, 28)}`, stepHTML(next.tool, next.detail), 4.5);
  }
}

const clipT = (t, n) => { t = String(t || ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// "Running a command: <em>Run the tests</em>" — the verb for the tool plus the session's own words for this step
function stepHTML(tool, detail) {
  const verb = toolInfo(tool).verb;
  return detail ? `${esc(verb)}: <em>${esc(detail)}</em>` : `${esc(verb)} <em>· ${esc(toolLabel(tool))}</em>`;
}

function updateFace() {
  const s = mState.state, ti = toolInfo(mState.tool || '');
  if (demo || !state) {
    const doing = {
      idle: messenger.flying ? `Flying home to ${summitName()}` : `Resting at ${summitName()}`,
      thinking: 'Thinking it over',
      tool: ti.verb,
      speaking: 'Delivering the reply',
      error: 'Hit a snag, regrouping',
    }[s];
    face.set({
      state: s, title: { idle: 'idle', thinking: 'thinking…', tool: 'at work', speaking: 'replying', error: 'error' }[s],
      doing, badge: ti.badge, connected: false,
      stats: `${mState.trips} workshop trips\n${demo ? 'demo mode · no Claude sessions found yet' : 'connecting…'}`,
    });
    return;
  }
  // "open" = a thread with activity in the last 24 hours (the island can't see whether you closed it)
  const claude = state.claude || [];
  const threads = claude.filter((c) => c.kind === 'session' && c.state !== 'sleeping');
  const working = claude.filter((c) => c.state === 'working');
  const busyProjects = [...new Set(working.map((c) => c.project).filter(Boolean))];
  const now = working.find((c) => plan && c.id === plan.id) || working[0];
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  // counts are threads, never helpers; "waiting on you" is the same set as the red "!" (stuck ones are listed apart)
  const busyThreads = working.filter((c) => c.kind === 'session').length, needing = waitingSessions(), asking = needing.filter((c) => c.needs?.kind !== 'stuck').length;
  face.set({
    state: working.length ? (s === 'idle' ? 'thinking' : s) : 'idle',
    title: [busyThreads && `${busyThreads} working now`, asking && `${asking} waiting on you`, needing.length - asking && `${needing.length - asking} may be stuck`].filter(Boolean).join(' · ') || (working.length ? 'helpers at work' : 'all quiet'),
    doing: `${n(busyProjects.length, 'project', 'projects')} being worked on · ${n(threads.length, 'thread', 'threads')} open`,
    badge: ti.badge, connected: true,
    stats: now
      ? `Now: ${now.tool ? toolInfo(now.tool).verb : 'Thinking'}${now.detail ? ` (${clipT(now.detail, 34)})` : ''}
in ${[...new Set(working.map((c) => buildings.get(homeFor(c.project, (k) => buildings.has(k), REALM, c.tourist))?.info.name || c.project))].join(', ')}`
      : `Nothing running right now
live from Claude Code on ${state.system?.host || 'this PC'}`,
  });
}

// ================================================================= projects, containers, residents
const projectSlots = new Map(); // id -> slot index
function removeBuilding(key) {
  const e = buildings.get(key); if (!e) return;
  scene.remove(e.b.group); buildings.delete(key); labels.remove(key);
  const i = pickables.indexOf(e.b.group); if (i >= 0) pickables.splice(i, 1);
}
function ensureProject(p) {
  const key = `p:${p.id}`;
  // the server hands out spots (and remembers them); fall back to arrival order for old servers
  const idx = Number.isInteger(p.slot) ? p.slot : p.slot === null ? -1 : (projectSlots.get(p.id) ?? projectSlots.size);
  const have = buildings.get(key);
  if (have && have.slot === idx) return have;
  if (have) removeBuilding(key);
  if (idx < 0 || idx >= LAYOUT.projectSlots.length) return null;
  projectSlots.set(p.id, idx);
  const slot = LAYOUT.projectSlots[idx];
  const style = p.style || PROJECT_STYLES[hash(p.id) % PROJECT_STYLES.length];
  const b = place(KIT?.building('project', hash(p.id)) || (THEME_NAME === 'village' ? mk(THEME.project(style, idx)) : makeBuilding(style)), slot.theta, slot.r, slot.face);
  const entry = { b, kind: 'project', style, slot: idx, info: { name: p.name }, top: worldAnchor(b, b.anchors.top), data: p };
  buildings.set(key, entry);
  return entry;
}

const stalls = new Map();
function syncContainers(list) {
  const seen = new Set();
  list.slice(0, 8).forEach((c, i) => {
    const key = `c:${c.name}`; seen.add(key);
    let entry = stalls.get(key);
    if (!entry) {
      const b = makeBuilding('stall', { color: ['#e86a5a', '#4b8fe0', '#3fb46f', '#f0a236', '#b58be0'][hash(c.name) % 5] });
      const a = deg(LAYOUT.agora.theta), ar = LAYOUT.agora.r;
      const ang = a + Math.PI + deg(-70 + i * 22); // ring around the plaza, facing in
      const cx = Math.cos(a) * ar, cz = Math.sin(a) * ar;
      b.group.position.set(cx + Math.cos(ang) * 3.7 * -1, 0, cz + Math.sin(ang) * 3.7 * -1);
      b.group.lookAt(cx, 0, cz);
      scene.add(b.group); pickables.push(b.group);
      entry = { b, kind: 'container', info: { name: c.name }, top: worldAnchor(b, b.anchors.top) };
      stalls.set(key, entry); buildings.set(key, entry);
    }
    entry.data = c;
    entry.b.active = c.state === 'running' ? 1 : 0;
    labels.set(key, entry.top, c.name, c.state);
  });
  for (const [key, entry] of stalls) if (!seen.has(key)) {
    scene.remove(entry.b.group); stalls.delete(key); buildings.delete(key); labels.remove(key);
    const i = pickables.indexOf(entry.b.group); if (i >= 0) pickables.splice(i, 1);
  }
}

const residents = new Map();
const destMemo = new Map(); // id -> { dest, since }: where each thread is heading (cast.js settleDestination)
const DEMO_AGENTS = [
  { id: 'demo-readme', name: 'Tidy the README', species: 'rooster' },
  { id: 'demo-login', name: 'Fix the login bug', species: 'owl' },
  { id: 'demo-jobs', name: 'Sweep for new jobs', species: 'ram' },
  { id: 'demo-shop', name: 'Plan the shopping list', species: 'tortoise' },
];
const REALM = String(boot.realm || 'Olympia').toLowerCase();
function residentHome(i, project, tourist = false) {
  if (tourist) { // guests spread over the hotel's front garden, a half-circle in front of the door
    const door = doorWorld(hotel), out = door.clone().setY(0).normalize(), side = new THREE.Vector3(-out.z, 0, out.x);
    const a = ((i * 2.4) % Math.PI) - Math.PI / 2, r = 1.2 + Math.sqrt(i) * 1.1;
    const p = door.add(out.multiplyScalar(Math.min(1.5, Math.cos(a) * r))).add(side.multiplyScalar(Math.sin(a) * r * 1.5));
    const lim = edgeRadius(Math.atan2(p.z, p.x)) - 1.6, d = Math.hypot(p.x, p.z); // keep clear of the island edge
    return d > lim ? p.multiplyScalar(lim / d) : p;
  }
  const e = project && buildings.get(`p:${project}`);
  if (e) { // in front of the door (the way the building faces), never over the island's edge
    const door = doorWorld(e.b), out = door.clone().sub(e.b.group.position).setY(0).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const p = door.add(out.multiplyScalar(0.8 + (i % 3) * 0.7)).add(side.multiplyScalar(((i % 5) - 2) * 1.1));
    const lim = edgeRadius(Math.atan2(p.z, p.x)) - 1.6, d = Math.hypot(p.x, p.z);
    return d > lim ? p.multiplyScalar(lim / d) : p;
  }
  const th = LAYOUT.agora.theta + 30 + i * 47;
  return polar(th, LAYOUT.ringRoad + (i % 2 ? 2.2 : -2.2));
}
// Claude sessions and their helper agents become residents of the building for their project (see cast.js
// for who is out and about: day-old threads go inside, tourists check out, finished helpers leave).
function claudeResidents(list) {
  return visibleCast(list, Date.now(), 20, LIFE ? { stations: true, resolved: isResolved } : {}).map((c) => ({ ...c, name: c.title, species: c.kind === 'agent' ? 'rooster' : SPECIES_LIST[hash(c.id) % SPECIES_LIST.length] }));
}
// Project stations (stationlife.js), on the classic map only for now: each project's threads work at a bench beside
// its building, carry finished pieces up the mountain and, until resolved, spend their free time in town.
const LIFE = THEME_NAME === 'olympus' && !KIT && !PACK?.terrain && !params.has('nostations') ? new StationLife({
  scene, fx, buildings, residents, doorWorld, bubbles, feed, summitDoor: messengerHome,
  summitName: () => summitName(), onSummit: () => { summit.flash = 1; },
}) : null;
const isOut = (id) => residents.has(id) && !residents.get(id).leaving; // drawn and not on its way in
// The door a character goes in and out by: its building's, the Hotel's, or the Agora (nobody lives on the
// Acropolis). Helpers have none: they appear beside their thread and fade where they stand.
function doorOf(a) {
  if (!a || a.kind === 'agent') return null;
  if (a.tourist) return doorWorld(hotel);
  const e = a.project && buildings.get(`p:${a.project}`);
  return e ? doorWorld(e.b) : agoraLanding();
}
let castSynced = false; // characters already out when the page opens are simply there; later ones step out of a door
function syncResidents(list) {
  const seen = new Set();
  // where everyone heads this time: working threads to the workshop for their current tool (Forge for commands,
  // Library for files...), finishing each trip and staying a moment; everyone else home (docs/rules.md)
  // (classic map: a working thread with a station works at its bench instead, docs/rules.md "Stations")
  const atStation = LIFE ? LIFE.work(list) : new Map(); // id -> { spot, face, motion }
  const dests = new Map(list.map((a) => [a.id, atStation.has(a.id) ? 'station' : a.kind ? settleDestination(destMemo, a.id,
    destination(a, (t) => { const key = toolInfo(t).key; return buildings.has(key) ? key : null; }), Date.now(), a.state === 'working', residents.get(a.id)?.arrived()) : 'home']));
  const crowds = new Map(); // workshop -> ids heading there, so they line up instead of standing on each other
  for (const [id, d] of dests) if (d !== 'home' && d !== 'station') crowds.set(d, [...(crowds.get(d) || []), id]);
  const lineup = new Map([...crowds].flatMap(([, ids]) => [...spreadAt(ids)]));
  list.forEach((a) => {
    seen.add(a.id);
    let r = residents.get(a.id);
    if (!r) {
      // a home spot of its own: the lowest one free at its building
      const homeKey = a.tourist ? 'hotel' : a.project || 'agora', used = new Set([...residents.values()].filter((x) => x.homeKey === homeKey && !x.leaving).map((x) => x.slot));
      let k = 0; while (used.has(k)) k++;
      r = new Resident(scene, { id: a.id, name: a.name, species: KIT?.speciesFor(a.name) || a.species || SPECIES_LIST[hash(a.name) % SPECIES_LIST.length], home: residentHome(k, a.project, a.tourist), world });
      r.homeKey = homeKey; r.slot = k;
      if (a.kind === 'agent') { r.size = 1.0; r.group.scale.setScalar(1.0); }
      if (castSynced && a.kind) r.appear(a.kind === 'agent' ? residents.get(a.parent)?.group.position : doorOf(a));
      residents.set(a.id, r); pickables.push(r.group);
    }
    r.stay(); // back before it had gone in
    if ((a.tourist || a.project) && !r.housed && (a.tourist || buildings.has(`p:${a.project}`))) { r.home.copy(residentHome(r.slot, a.project, a.tourist)); r.housed = true; }
    r.data = a; r.name = a.name;
    residentLabel(a, r);
    r.setNeeds(a.state === 'waiting' ? a.needs?.kind || 'asking' : null);
    if (a.kind === 'agent') r.setFollow(residents.get(a.parent) || null);
    // at a workshop: side by side along its front; at home (a thread that needs you goes back): its own spot
    const dest = dests.get(a.id);
    let spot = r.home.clone();
    const bench = atStation.get(a.id);
    r.setWork(bench?.face, bench?.motion);
    if (LIFE && a.kind === 'session' && !r.town) r.town = (x) => LIFE.town(x);
    if (bench) spot = bench.spot;
    else if (dest !== 'home') {
      const b = buildings.get(dest).b, door = doorWorld(b), out = door.clone().sub(b.group.position).setY(0).normalize();
      spot = door.add(out.clone().multiplyScalar(1.5)).add(new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(lineup.get(a.id) * 1.1));
    }
    if (a.kind) { /* Claude residents announce themselves through claude events instead */ }
    else if (a.state !== r.state) {
      if (a.state === 'working') bubbles.show(`r:${a.id}`, r.anchor, `${a.name} · on duty`, `<em>Running “${esc(a.name)}”. Off to the Agora!</em>`, 4);
      if (a.state === 'error') bubbles.show(`r:${a.id}`, r.anchor, `${a.name} · trouble`, '<em>My last run went wrong…</em>', 5);
    }
    r.setState(a.state, a.state === 'working' || (a.state === 'waiting' && a.kind === 'session') ? spot : null);
  });
  // whoever is no longer out (a day without work, checked out, a finished helper) walks in through its door
  // (one carrying its work up the mountain goes in once it is back down)
  for (const [id, r] of residents) if (!seen.has(id) && !r.leaving && !r.route) { r.leave(doorOf(r.data)); destMemo.delete(id); labels.remove(`r:${id}`); }
  castSynced = castSynced || list.length > 0;
  agora.setNotes(list.filter((a) => a.state === 'working').length + 1);
  const guests = (state?.claude || []).filter((c) => c.kind === 'session' && c.tourist && isOut(c.id)).length;
  labels.set('hotel', buildings.get('hotel').top, guests ? `${buildings.get('hotel').info.name} · ${guests} ${guests === 1 ? 'guest' : 'guests'}` : buildings.get('hotel').info.name, guests ? 'busy' : 'idle');
}

// Name tag: shown while a thread works or needs you, and for whoever the pointer is over (title + where).
let hovered = null;
function residentLabel(a, r) {
  if (!a?.kind) return;
  const tag = a.name.length > 26 ? `${a.name.slice(0, 25)}…` : a.name;
  const where = LIFE?.doing(a, r) || (a.tourist ? `${a.projectLabel || a.project || 'elsewhere'} · ${buildings.get('hotel').info.name}` : placeName(a.project || '') || 'the Agora');
  if (a.state === 'waiting') labels.set(`r:${a.id}`, r.anchor, `${tag} · ${a.needs?.kind === 'stuck' ? 'stuck?' : 'needs you'}`, a.needs?.kind === 'stuck' ? 'stuck' : 'waiting');
  else if (hovered === a.id) labels.set(`r:${a.id}`, r.anchor, `${tag} · ${where}`, a.state);
  else if (a.state === 'working') labels.set(`r:${a.id}`, r.anchor, tag, 'working');
  else labels.remove(`r:${a.id}`);
}

// ================================================================= live state
let state = null, demo = false, cpuHot = 0, stalled = false, overflow = [];
const pill = document.getElementById('status-pill');

function applyState(s) {
  const first = !state;
  state = s;
  demo = Boolean(s.demo) || params.has('demo');
  if (s.place) sky.place = s.place;
  if (s.tagline && !PACK?.tagline) document.querySelector('#title .tagline').textContent = s.tagline;
  if (s.realm) document.querySelector('#title .realm').textContent = s.realm.toUpperCase();
  document.querySelector('#clock .sky').dataset.place = s.place?.name || PLACE.name;

  pill.className = demo ? 'demo' : 'live';
  pill.querySelector('.txt').textContent = demo ? 'DEMO' : 'LIVE';

  const present = new Set(s.projects.map((p) => `p:${p.id}`));
  for (const key of [...buildings.keys()]) if (key.startsWith('p:') && !present.has(key)) removeBuilding(key);
  overflow = s.projects.filter((p) => p.slot === null).map((p) => p.name);
  for (const p of s.projects) {
    const e = ensureProject(p); if (!e) continue;
    e.data = p;
    e.b.active = p.status === 'busy' ? 1 : 0;
    labels.set(`p:${p.id}`, e.top, p.name, p.status);
  }
  syncContainers(s.containers || []);
  LIFE?.sync(s.projects, s.claude?.length ? claudeResidents(s.claude) : []); // stations, before anyone heads to one
  syncResidents(s.claude?.length ? claudeResidents(s.claude) : demo ? demoAgents() : []);
  steerMessenger();

  // CPU stall: the forge shakes
  const cpu = s.system?.cpu ?? 0;
  cpuHot = cpu >= 90 ? cpuHot + 1 : 0;
  const forge = buildings.get('forge');
  if (cpuHot >= 2) {
    forge.b.shake = 3.2;
    if (!stalled) { stalled = true; bubbles.show('forge', forge.top, `Forge crew · CPU ${cpu}% · stall`, '<em>The forge is overheating. I am watching it closely.</em>', 6); feed.push(`The Forge rattled: CPU at ${cpu}%.`); }
  } else if (stalled && cpu < 70) {
    stalled = false; bubbles.show('forge', forge.top, 'Forge crew', 'Phew. We are moving again.', 4);
  }
  if (first) for (const e of [...(s.feed || [])].reverse()) describe(e, true);
  renderNeeds();
  renderUsage();
  updateFace();
  card.refresh();
}

function describe(e, quiet = false) {
  const proj = (id) => buildings.get(`p:${id}`);
  switch (e.type) {
    case 'project:commit': {
      const p = proj(e.project);
      feed.push(`<b>${esc(p?.info.name || e.project)}</b> shipped: <em>“${esc(e.subject)}”</em>`, e.at);
      if (p && !quiet) { fx.firework(p.b.group.position.clone()); bubbles.show(`p:${e.project}`, p.top, `${p.info.name} · shipped`, `<em>“${esc(e.subject)}”</em>`, 7); p.b.flash = 1; }
      break;
    }
    case 'project:busy': {
      const p = proj(e.project);
      feed.push(`Work started in <b>${esc(p?.info.name || e.project)}</b>.`, e.at);
      if (p && !quiet) { bubbles.show(`p:${e.project}`, p.top, `${p.info.name} · busy`, `<em>Someone's working on ${esc(e.file || 'something')}.</em>`, 5); p.b.active = 1; }
      break;
    }
    case 'claude': {
      const r = residents.get(e.id), where = e.project ? placeName(e.project) : 'the island';
      const who = `${esc(e.title || 'A session')}`;
      // helpers work for their thread, not for you: they say their steps but don't fill the chronicle
      const helper = e.kind === 'agent';
      if (e.event === 'start') {
        if (!helper) feed.push(`<b>${who}</b> got to work at ${esc(where)}.`, e.at);
        if (!quiet && r) bubbles.show(`r:${e.id}`, r.anchor, `${e.title} · working`, `<em>${helper ? 'On it.' : `Back to work at ${esc(where)}.`}</em>`, 4);
        if (!quiet && !helper) { const pb = buildings.get(`p:${e.project}`); if (pb) fx.parachute(doorWorld(pb.b).add(new THREE.Vector3(1.2, 0, 0.8))); }
        if (!quiet && r && e.tool) bubbles.show(`r:${e.id}`, r.anchor, clipT(e.title, 40), stepHTML(e.tool, e.detail), 4);
      } else if (e.event === 'tool') {
        const ti = toolInfo(e.tool);
        if (!quiet && r) bubbles.show(`r:${e.id}`, r.anchor, clipT(e.title, 40), stepHTML(e.tool, e.detail), 4);

      } else if (e.event === 'needs') {
        const why = e.needs?.reason || 'Waiting for you';
        // e.again: it already needed you and the reason changed; say so, but don't log or notify twice
        if (!e.again) feed.push(`<b>${who}</b> ${e.needs?.kind === 'stuck' ? 'may be stuck' : 'needs you'}: <em>${esc(why)}</em>`, e.at);
        if (!quiet && r) bubbles.show(`r:${e.id}`, r.anchor, `${clipT(e.title, 34)} · ${e.needs?.kind === 'stuck' ? 'stuck?' : 'needs you'}`, `<em>${esc(why)}</em>`, 8);
        if (!quiet && !e.again) notifyNeeds(e);
      } else if (e.event === 'done') {
        // classic map: a finished piece is carried up the mountain path, an unfinished one stays on the bench (stationlife.js)
        const walked = LIFE && !quiet && !helper && r && LIFE.finished(e, r, state?.claude?.find((c) => c.id === e.id));
        if (walked) { /* it said so itself */ }
        else if (!helper) feed.push(LIFE ? `<b>${who}</b> finished a turn.` : `<b>${who}</b> finished a turn and sent it up to ${esc(summitName())}.`, e.at);
        // the finished work flies up from the thread to the Acropolis, which glows as it lands
        if (!LIFE && !quiet && !helper && r) fx.sendUp(r.group.position, buildings.get('summit').top.getWorldPosition(new THREE.Vector3()), () => { summit.flash = 1; });
        if (!quiet && r && !walked) bubbles.show(`r:${e.id}`, r.anchor, `${clipT(e.title, 34)} · done`, helper ? '<em>Done. Handing it back to my thread.</em>' : LIFE ? '<em>Finished this turn.</em>' : `<em>Finished! Sending it up to ${esc(summitName())}.</em>`, 5);
      }
      if (!quiet && state) { state.claude = applySignal(state.claude || [], e); steerMessenger(); }
      break;
    }
    case 'task': {
      feed.push(`A new task parachuted into the Agora${e.name ? `: <em>${esc(e.name)}</em>` : ''}.`, e.at);
      if (!quiet) fx.parachute(agoraLanding(), () => bubbles.show('agora', buildings.get('agora').top, 'Agora · new task', `<em>${esc(e.name || 'A new task')} is pinned to the board.</em>`, 5));
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- SSE
function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('state', (m) => applyState(JSON.parse(m.data)));
  es.addEventListener('event', (m) => describe(JSON.parse(m.data)));
  es.onerror = () => { pill.className = ''; pill.querySelector('.txt').textContent = 'RECONNECTING'; };
}
connect();

// ================================================================= demo mode (until Claude Code sessions show up)
let demoAgentState = DEMO_AGENTS.map((a) => ({ ...a, state: 'idle' }));
function demoAgents() { return demoAgentState; }
const DEMO_TOOLS = ['WebSearch', 'Read', 'Bash', 'TodoWrite', 'SendMessage', 'Edit', 'mcp__claude-in-chrome__navigate', 'mcp__blender__execute_blender_code', 'Grep'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function demoTurn() {
  const go = (st, extra = {}) => demo && driveMessenger({ state: st, ...extra });
  go('thinking');
  feed.push('The messenger picked up a new task <em>(demo)</em>.');
  await sleep(2500);
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const tool = DEMO_TOOLS[Math.floor(Math.random() * DEMO_TOOLS.length)];
    const ti = toolInfo(tool);
    go('tool', { tool });
    if (demo) feed.push(`The messenger flew to ${esc(buildings.get(ti.key)?.info.name || ti.key)}: <em>${esc(toolLabel(tool))}</em>`);
    await sleep(4500 + Math.random() * 2500);
    if (!demo) return;
    const ok = Math.random() > 0.12;
    go(ok ? 'thinking' : 'error', { tool });
    await sleep(ok ? 1500 : 3000);
  }
  go('speaking');
  if (demo) feed.push('The messenger delivered a reply.');
  await sleep(4500);
  go('idle');
}
async function demoLoop() {
  await sleep(3000);
  let k = 0;
  while (true) {
    if (demo) {
      await demoTurn();
      if (k % 2 === 0) {
        const a = demoAgentState[Math.floor(Math.random() * demoAgentState.length)];
        describe({ type: 'task', name: a.name, at: Date.now() });
        a.state = 'working'; syncResidents(demoAgentState);
        setTimeout(() => { a.state = Math.random() > 0.85 ? 'error' : 'idle'; syncResidents(demoAgentState); }, 20000);
      }
      k++;
      await sleep(9000 + Math.random() * 9000);
    } else await sleep(2000);
  }
}
demoLoop();

// ---------------------------------------------------------------- narration: characters say what they're really doing
// With Claude data, every line comes from a real session: its current step while it works, or when it last
// worked and that it's waiting on you. Without Claude data (demo), the old village chatter remains.
let narrateIx = 0;
function narrate() {
  if (!state?.claude?.length) return;
  const working = state.claude.filter((c) => c.state === 'working' && isOut(c.id));
  if (!working.length) return;
  const c = working[narrateIx++ % working.length];
  const where = homeName(c);
  bubbles.show(`r:${c.id}`, residents.get(c.id).anchor, `${clipT(c.title, 30)}${where ? ` · ${where}` : ''}`,
    c.tool ? stepHTML(c.tool, c.detail) : '<em>Thinking about the next step…</em>', 5);
}
setInterval(narrate, 4500);

function waitingLine() {
  if (!state?.claude?.length) return gossip();
  // finished threads, and the ones resting outside after a quiet day, say when they last worked
  const idle = state.claude.filter((c) => (c.state === 'idle' || c.state === 'sleeping') && isOut(c.id));
  if (!idle.length) return;
  const c = idle[Math.floor(Math.random() * idle.length)];
  const mins = (Date.now() - c.lastActive) / 60000;
  const body = c.kind === 'agent' ? `<em>Helper finished ${timeAgo(c.lastActive)}.</em>`
    : mins < 180 ? `<em>Finished ${timeAgo(c.lastActive)}. Waiting for you.</em>` : `<em>Last worked ${timeAgo(c.lastActive)}.</em>`;
  bubbles.show(`r:${c.id}`, residents.get(c.id).anchor, clipT(c.title, 34), body, 5);
}

function gossip() {
  const idle = [...residents.values()].filter((r) => r.state === 'idle');
  if (!idle.length || !state) return;
  const r = idle[Math.floor(Math.random() * idle.length)];
  const projects = state.projects || [];
  const latest = [...projects].sort((a, b) => (b.lastCommitAt || 0) - (a.lastCommitAt || 0))[0];
  const busy = projects.find((p) => p.status === 'busy');
  const lines = [
    latest && `Did you hear? <b>${esc(latest.name)}</b> shipped “${esc((latest.lastCommit || '').slice(0, 50))}” ${timeAgo(latest.lastCommitAt)}.`,
    busy && `<b>${esc(busy.name)}</b> has been busy.`,
    `The messenger made ${mState.trips} workshop trips so far.`,
  ].filter(Boolean);
  bubbles.show(`r:${r.id}`, r.anchor, `${r.name}`, lines[Math.floor(Math.random() * lines.length)], 6);
}
setInterval(waitingLine, 20000);

// ================================================================= usage meter
// Plan limits when Claude Code shares them (see tools/statusline-usage.mjs), otherwise tokens used on this PC.
const usageEl = document.getElementById('usage');
const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n || 0));
const modelName = (m) => String(m).replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1').replace(/^./, (c) => c.toUpperCase());
const resetIn = (iso) => { const ms = Date.parse(iso) - Date.now(); if (!(ms > 0)) return ''; const h = Math.floor(ms / 3600_000), m = Math.round((ms % 3600_000) / 60_000); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`; };
function renderUsage() {
  const u = state?.usage;
  usageEl.hidden = !u || demo;
  if (!u) return;
  const plan = u.plan?.rows;
  const bar = (label, pct, sev) => `<div class="ubar ${sev || (pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : '')}"><span>${esc(label)}</span><i style="--p:${pct}%"></i><b>${Math.round(pct)}%</b></div>`;
  const html = plan
    ? plan.filter((r) => /5-hour|all models/.test(r.label)).map((r) => bar(r.label.replace('5-hour limit', '5h').replace('Weekly · all models', 'week'), r.percent, r.severity)).join('')
    : `<div class="utok"><span>⚡ ${fmtTok(u.h5.total)}</span> tokens · 5h <span class="dim">· ${fmtTok(u.today.total)} today</span></div>`;
  if (usageEl.dataset.html !== html) { usageEl.innerHTML = html; usageEl.dataset.html = html; }
}
usageEl.onclick = () => showUsageCard();
function showUsageCard() {
  card.show(() => {
    const u = state?.usage; if (!u) return cardHTML({ kicker: 'Usage', title: 'Usage', lede: 'Reading your sessions…', rows: [] });
    const plan = u.plan;
    const models = Object.entries(u.d7.byModel).sort((a, b) => b[1] - a[1]);
    const share = (m, w) => (u[w].total ? Math.round((100 * (u[w].byModel[m] || 0)) / u[w].total) : 0);
    return cardHTML({
      kicker: plan ? `Usage · ${plan.plan ? `${plan.plan} plan` : 'plan limits'}` : 'Usage · this PC', title: 'How much Claude you\'ve used',
      lede: plan ? `Plan limits as of ${timeAgo(plan.at)}, from Claude Code's status line.` : 'Tokens used by Claude Code sessions on this PC. Your plan\'s percent isn\'t stored on this PC; the Claude app\'s usage card has it.',
      rows: [
        ...(plan?.rows || []).map((r) => [r.label, `${Math.round(r.percent)}%${r.resetsAt ? ` · resets in ${resetIn(r.resetsAt)}` : ''}`, r.percent >= 90 ? 'error' : r.percent >= 70 ? 'busy' : '']),
        ['last 5 hours', `${fmtTok(u.h5.total)} tokens`], ['today', `${fmtTok(u.today.total)} tokens`], ['last 7 days', `${fmtTok(u.d7.total)} tokens`],
        ...models.map(([m, n]) => [modelName(m), `${fmtTok(n)} this week · ${share(m, 'h5')}% of the last 5h`]),
      ],
      extra: '<div class="sys">Tokens = input + output + cache writes. Cache reads are left out: they are cheap and would swamp the count.</div>',
    });
  });
}

// ================================================================= needs you
// Sessions stuck on a permission prompt or a question (or a tool that hasn't come back in 10 minutes)
// show in a strip at the top, in the tab title, and optionally as a desktop notification.
const needsEl = document.getElementById('needs');
let focusIx = 0;
const waitingSessions = () => (state?.claude || []).filter((c) => c.state === 'waiting').sort((a, b) => (a.needs?.kind === 'stuck') - (b.needs?.kind === 'stuck') || (a.needs?.since || 0) - (b.needs?.since || 0));
function renderNeeds() {
  const list = waitingSessions(), asking = list.filter((c) => c.needs?.kind !== 'stuck').length;
  document.title = asking ? `(${asking}) ${boot.realm || 'Olympia'}` : boot.realm || 'Olympia';
  needsEl.hidden = !list.length;
  if (!list.length) return;
  const head = asking ? `${asking} ${asking === 1 ? 'thread needs' : 'threads need'} you` : `${list.length} may be stuck`;
  const html = `<button class="needs-head" data-k="toggle">${esc(head)}<span>${needsEl.classList.contains('open') ? '▴' : '▾'}</span></button>
    <ol>${list.map((c) => `<li class="${c.needs?.kind === 'stuck' ? 'stuck' : ''}"><button data-id="${esc(c.id)}"><b>${esc(clipT(c.title, 40))}</b>
      <span>${esc(c.needs?.reason || '')} · ${esc(homeName(c))} · ${timeAgo(c.needs?.since || c.lastActive)}</span></button>
      ${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Open ↗</a>` : ''}</li>`).join('')}</ol>`;
  if (needsEl.dataset.html !== html) { needsEl.innerHTML = html; needsEl.dataset.html = html; }
}
needsEl.onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.k === 'toggle') { needsEl.classList.toggle('open'); needsEl.dataset.html = ''; renderNeeds(); return; }
  if (b.dataset.id) focusResident(b.dataset.id);
};
// fly the camera to a character and open its card
let camFly = null;
function focusResident(id) {
  const r = residents.get(id); if (!r) return;
  setFollow(false);
  const to = r.group.position.clone(), off = to.clone().setY(0).normalize().multiplyScalar(14).add(new THREE.Vector3(0, 9, 0));
  camFly = { from: camera.position.clone(), fromT: controls.target.clone(), to: to.clone().add(off), toT: to.clone().add(new THREE.Vector3(0, 1, 0)), t: 0 };
  lastInput = performance.now();
  showResidentCard(r);
}
function stepCamFly(dt) {
  if (!camFly) return;
  camFly.t = Math.min(1, camFly.t + dt / 1.1);
  const k = camFly.t < 0.5 ? 2 * camFly.t * camFly.t : 1 - (-2 * camFly.t + 2) ** 2 / 2;
  camera.position.lerpVectors(camFly.from, camFly.to, k); controls.target.lerpVectors(camFly.fromT, camFly.toT, k);
  if (camFly.t >= 1) camFly = null;
}
// desktop notifications: only after you turn them on with the bell (browsers allow them on localhost)
const bell = document.querySelector('[data-k="notify"]');
const notifyPref = () => { try { return localStorage.getItem('olympia.notify'); } catch { return null; } };
const canNotify = () => 'Notification' in window && Notification.permission === 'granted' && notifyPref() !== 'off';
function syncBell() { bell.hidden = !('Notification' in window) || !isSecureContext; bell.classList.toggle('on', canNotify()); }
syncBell();
function notifyNeeds(e) {
  if (!canNotify() || e.needs?.kind === 'stuck') return;
  try {
    const n = new Notification(`${e.title || 'A thread'} needs you`, { body: e.needs?.reason || '', tag: `olympia-${e.id}` });
    n.onclick = () => { window.focus(); if (e.link) window.open(e.link, '_blank', 'noopener'); else focusResident(e.id); n.close(); };
  } catch { /* some browsers only allow notifications from a service worker */ }
}

// ================================================================= interaction
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null, following = false, lastInput = performance.now();

function pick(ev) {
  pointer.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, true)[0];
  return hit?.object.userData || null;
}
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; lastInput = performance.now(); controls.autoRotate = false; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > (e.pointerType === 'touch' ? 12 : 5)) return; // fingers wobble more
  const u = pick(e);
  if (!u) { card.hide(); return; }
  if (u.messenger) return showMessengerCard();
  if (u.resident) return showResidentCard(u.resident);
  if (u.building) {
    const entry = [...buildings.entries()].find(([, v]) => v.b === u.building);
    if (entry) showBuildingCard(entry[0], entry[1]);
  }
});
let hoverT = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (performance.now() - hoverT < 80) return; hoverT = performance.now();
  const u = pick(e);
  renderer.domElement.classList.toggle('pointing', Boolean(u));
  const id = u?.resident?.data?.kind ? u.resident.id : null;
  if (id !== hovered) {
    const prev = hovered; hovered = id;
    for (const k of [prev, id]) { const r = k && residents.get(k); if (r) residentLabel(r.data, r); }
  }
});

function showMessengerCard() {
  card.show(() => cardHTML({
    kicker: demo ? 'The messenger · demo' : 'The messenger · Claude activity', title: 'The Messenger',
    lede: 'Flies to the workshop that matches whatever your busiest Claude session is doing.',
    rows: [['state', mState.state, mState.state === 'idle' ? '' : mState.state === 'error' ? 'error' : 'busy'], mState.tool && ['tool', toolLabel(mState.tool)],
      ['threads working', String((state?.claude || []).filter((c) => c.kind === 'session' && c.state === 'working').length)], ['trips', String(mState.trips)],
      ['source', demo ? 'demo (no Claude sessions found yet)' : 'Claude Code sessions on this PC']],
  }));
}
// ---------------------------------------------------------------- details on click (fetched, not streamed)
const details = new Map(); // id -> { at, data, loading }
function getDetails(id) {
  let d = details.get(id);
  if (!d) { d = { at: 0, data: null, loading: false }; details.set(id, d); }
  if (!d.loading && Date.now() - d.at > 4000) {
    d.loading = true;
    fetch(`/api/session/${encodeURIComponent(id)}`).then((x) => (x.ok ? x.json() : null)).then((data) => { d.data = data; }).catch(() => {})
      .finally(() => { d.loading = false; d.at = Date.now(); card.refresh(); });
  }
  return d.data;
}
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const MARK = { done: '✓', doing: '✱', todo: '' };
function detailsHTML(d) {
  if (!d) return '<div class="more muted">Loading what it has been doing…</div>';
  const parts = [];
  if (d.checklist?.length) parts.push(`<h3>Checklist</h3><ul class="check">${d.checklist.map((c) => `<li class="${c.status}"><span>${MARK[c.status]}</span>${esc(c.text)}</li>`).join('')}</ul>`);
  if (d.lastReply) parts.push(`<h3>Last said <i>${timeAgo(d.lastReply.at)}</i></h3><blockquote>${esc(d.lastReply.text)}</blockquote>`);
  if (d.steps?.length) parts.push(`<h3>Recent steps <i>${d.stepsTotal} in view</i></h3><ol class="steps">${d.steps.map((s) => `<li><span class="t">${hhmm(s.at)}</span>${stepHTML(s.tool, s.detail)}</li>`).join('')}</ol>`);
  if (d.files?.length) parts.push(`<h3>Files changed <i>${d.filesTotal}</i></h3><ul class="files">${d.files.map((f) => `<li>${esc(f.name)}${f.edits > 1 ? ` <i>×${f.edits}</i>` : ''}</li>`).join('')}</ul>`);
  if (d.agents?.length) parts.push(`<h3>Helpers</h3><ul class="files">${d.agents.map((x) => `<li>${esc(x.title)} <i>${esc(x.state)}</i></li>`).join('')}</ul>`);
  return parts.length ? `<div class="more">${parts.join('')}</div>` : '<div class="more muted">Nothing recorded yet.</div>';
}

function showResidentCard(r) {
  const a = r.data || {};
  if (a.kind) return card.show(() => cardHTML({
    kicker: a.kind === 'agent' ? `Helper agent · ${r.species}` : `Claude session · ${r.species}`, title: a.title,
    lede: a.tourist ? `Visiting from ${a.project || 'elsewhere'} · staying at ${buildings.get('hotel').info.name}${a.state === 'working' || a.state === 'waiting' ? '' : `, checks out in ${Math.round(checkoutIn(a) / 3600_000)} h`}`
      : a.project ? `Lives at ${placeName(a.project)}` : '',
    rows: [['state', a.state === 'waiting' ? (a.needs?.kind === 'stuck' ? 'maybe stuck' : 'needs you') : a.state === 'sleeping' ? 'resting (quiet over a day)' : a.state, a.state === 'waiting' ? 'error' : a.state === 'working' ? 'working' : ''],
      a.needs && ['waiting for', a.needs.reason], a.needs?.since && ['since', timeAgo(a.needs.since)],
      a.tool && ['tool', toolLabel(a.tool)], ['last active', timeAgo(a.lastActive)], a.project && ['project', a.project]],
    links: a.link ? [[a.link, 'Open this session ↗']] : [],
    extra: detailsHTML(getDetails(a.id)),
  }));
  card.show(() => cardHTML({
    kicker: `Resident · ${r.species}`, title: r.name, lede: 'A demo resident. Real ones appear for each Claude Code session.',
    rows: [['state', a.state || r.state, a.state]],
  }));
}
// ---------------------------------------------------------------- daily recap (Acropolis, and per building)
const recaps = new Map(); // day ('' = today) -> { at, data, loading }
let recapDay = '';
function getRecap(day) {
  let r = recaps.get(day);
  if (!r) { r = { at: 0, data: null, loading: false }; recaps.set(day, r); }
  if (!r.loading && Date.now() - r.at > (day ? 120_000 : 20_000)) {
    r.loading = true;
    fetch(`/api/recap${day ? `?day=${day}` : ''}`).then((x) => (x.ok ? x.json() : null)).then((data) => { if (data) r.data = data; }).catch(() => {})
      .finally(() => { r.loading = false; r.at = Date.now(); card.refresh(); });
  }
  return r.data;
}
const dayName = (key) => {
  const d = new Date(`${key}T12:00:00`), today = new Date(); today.setHours(12, 0, 0, 0);
  const n = Math.round((today - d) / 86400_000);
  return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};
const shiftDay = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const placeName = (id) => buildings.get(`p:${id}`)?.info.name || id;
// where a character lives, as the island names it: its building, the Acropolis, or the Hotel for tourists
const homeName = (c) => (c.tourist ? buildings.get('hotel').info.name : c.project ? placeName(c.project) : 'the Agora');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function recapTitle(r) { return r ? `${dayName(r.day)} on ${boot.realm || 'Olympia'}` : 'The day so far'; }
function recapLede(r) {
  const threads = r.projects.reduce((n, p) => n + p.sessions.length, 0), done = r.projects.reduce((n, p) => n + p.sessions.reduce((m, s) => m + s.done.length, 0), 0);
  const commits = r.projects.reduce((n, p) => n + (p.commits?.length || 0), 0);
  if (!threads && !commits) return 'A quiet day. Nothing ran on this PC.';
  return [plural(threads, 'thread'), plural(r.projects.length, 'place'), done && `${done} things finished`, commits && plural(commits, 'commit')].filter(Boolean).join(' · ');
}
function recapNav(r) {
  if (!r) return '';
  const today = r.day === shiftDay(r.day, 0) && dayName(r.day) === 'Today';
  return `<div class="daynav"><button data-day="${r.day > r.oldest ? shiftDay(r.day, -1) : ''}" ${r.day > r.oldest ? '' : 'disabled'}>‹ Earlier</button>
    <button data-day="${today ? '' : shiftDay(r.day, 1)}" ${today ? 'disabled' : ''}>Later ›</button></div>`;
}
// one project's day (onlyProject) or every project's
function recapHTML(r, onlyProject) {
  if (!r) return onlyProject ? '' : '<div class="more muted">Reading the day…</div>';
  const list = onlyProject ? r.projects.filter((p) => p.id === onlyProject) : r.projects;
  if (!list.length) return onlyProject ? '' : '';
  return list.map((p) => {
    const stats = [plural(p.sessions.length, 'thread'), p.steps && plural(p.steps, 'step'), p.filesTotal && plural(p.filesTotal, 'file') + ' changed', p.commits?.length && plural(p.commits.length, 'commit')].filter(Boolean).join(' · ');
    const sessions = p.sessions.slice(0, 6).map((s) => {
      const name = residents.has(s.id) ? `<button data-focus="${esc(s.id)}">${esc(clipT(s.title, 48))}</button>` : `<b>${esc(clipT(s.title, 48))}</b>`;
      const items = [...s.done.slice(0, 5).map((t) => `<li class="done"><span>✓</span>${esc(t)}</li>`), ...s.doing.slice(0, 2).map((t) => `<li class="doing"><span>✱</span>${esc(t)}</li>`)];
      const more = s.done.length > 5 ? `<li class="muted">+${s.done.length - 5} more done</li>` : '';
      const quiet = !items.length ? `<li class="muted">${plural(s.steps, 'step')}${s.files ? `, ${plural(s.files, 'file')} changed` : ''}${s.helpers ? `, ${plural(s.helpers, 'helper')}` : ''}</li>` : '';
      return `<li class="rs"><div class="rt">${name}<i>${hhmm(s.from)}–${hhmm(s.to)}</i></div><ul class="check">${items.join('')}${more}${quiet}</ul></li>`;
    }).join('');
    const commits = (p.commits || []).slice(0, 5).map((c) => `<li><span class="t">${hhmm(c.at)}</span>${esc(c.subject)}</li>`).join('');
    return `<div class="more recap">${onlyProject ? `<h3>${esc(dayName(r.day))} here <i>${esc(stats)}</i></h3>` : `<h3>${esc(placeName(p.id))} <i>${esc(stats)}</i></h3>`}
      <ul class="sessions">${sessions}</ul>${p.sessions.length > 6 ? `<div class="muted small">+${p.sessions.length - 6} more threads</div>` : ''}
      ${commits ? `<ol class="steps commits">${commits}</ol>` : ''}</div>`;
  }).join('');
}

// the characters who live in a project's building, most urgent first; click one to fly to it
const RANK = { waiting: 0, working: 1, idle: 2, sleeping: 3 };
function whoHTML(project) {
  const mine = (state?.claude || []).filter((c) => c.kind === 'session' && c.project === project)
    .sort((a, b) => RANK[a.state] - RANK[b.state] || b.lastActive - a.lastActive).slice(0, 12);
  if (!mine.length) return '';
  const label = (c) => (c.state === 'waiting' ? (c.needs?.kind === 'stuck' ? 'stuck?' : 'needs you') : c.state);
  return `<div class="more"><h3>Who lives here <i>${mine.length}</i></h3><ul class="who">${mine.map((c) => `<li><button data-focus="${esc(c.id)}">${esc(clipT(c.title, 44))}</button>
    <span class="pill ${c.state === 'waiting' ? 'error' : c.state === 'working' ? 'working' : ''}">${esc(label(c))}</span></li>`).join('')}</ul></div>`;
}
document.getElementById('card').addEventListener('click', (e) => {
  const b = e.target.closest('[data-focus]'); if (b) return focusResident(b.dataset.focus);
  const d = e.target.closest('[data-day]'); if (d && !d.disabled) { recapDay = d.dataset.day; card.refresh(); }
});

function showBuildingCard(key, v) {
  card.show(() => {
    const d = v.data || {};
    if (v.kind === 'project') return cardHTML({
      kicker: `Project · ${d.claudeOnly ? 'Claude folder' : d.git ? 'git' : 'folder'}`, title: v.info.name, lede: d.lastCommit ? `“${d.lastCommit}”` : '',
      rows: [['status', d.status, d.status], d.branch && ['branch', d.branch], d.lastCommitAt && ['last commit', timeAgo(d.lastCommitAt)],
        d.git && ['changes', `${d.dirty} uncommitted file${d.dirty === 1 ? '' : 's'}`], d.lastTouch && ['last edit', timeAgo(d.lastTouch)],
        d.sessions && ['claude', `${d.sessions} session${d.sessions === 1 ? '' : 's'} this week${d.working ? `, ${d.working} working` : ''}`],
        d.agents && ['helpers', `${d.agents} agent${d.agents === 1 ? '' : 's'}${d.agentsWorking ? `, ${d.agentsWorking} working` : ''}`],
        d.lastClaude && ['last session', timeAgo(d.lastClaude)], d.path && ['path', d.path]],
      extra: whoHTML(d.id) + recapHTML(getRecap(''), d.id),
    });
    if (v.kind === 'container') return cardHTML({ kicker: 'Container · docker', title: d.name, lede: d.image, rows: [['state', d.state, d.state], ['status', d.status]] });
    if (v.kind === 'tool') return cardHTML({
      kicker: "The messenger's workshop", title: v.info.name, lede: v.info.lede,
      rows: [['visits', `${v.visits || 0} this session`], v.lastVisit && ['last visit', timeAgo(v.lastVisit)], v.lastTool && ['last tool', toolLabel(v.lastTool)], ['busy', v.b.active > 0.05 ? 'yes' : 'no']],
    });
    if (v.kind === 'hotel') {
      const guests = (state?.claude || []).filter((c) => c.kind === 'session' && c.tourist && isOut(c.id)).sort((a, b) => b.lastActive - a.lastActive);
      const from = [...new Set(guests.map((g) => g.project || 'elsewhere'))];
      return cardHTML({
        kicker: 'Visitors', title: v.info.name, lede: v.info.lede,
        rows: [['guests', String(guests.length)], from.length && ['from', from.join(', ')]],
        extra: guests.length ? `<div class="more"><h3>Guest book</h3><ul class="who">${guests.map((g) => `<li><button data-focus="${esc(g.id)}">${esc(clipT(g.title, 44))}</button>
          <span class="pill ${g.state === 'waiting' ? 'error' : g.state === 'working' ? 'working' : ''}">${g.state === 'idle' || g.state === 'sleeping' ? `leaves in ${Math.max(1, Math.round(checkoutIn(g) / 3600_000))} h` : esc(g.state === 'waiting' ? 'needs you' : g.state)}</span></li>`).join('')}</ul></div>` : '',
      });
    }
    if (v.kind === 'agora') return cardHTML({
      kicker: 'Village square', title: v.info.name, lede: v.info.lede,
      rows: [['residents', String(residents.size)], ['on duty', String([...residents.values()].filter((r) => r.state === 'working').length)], ['containers', state?.docker ? String(stalls.size) : 'docker not running'], overflow.length && ['no room yet', overflow.join(', ')]],
    });
    // the Acropolis keeps the daily recap for the whole island
    const r = getRecap(recapDay);
    return cardHTML({
      kicker: `${v.info.name} · daily recap`, title: recapTitle(r), lede: r ? recapLede(r) : 'Reading the day…',
      rows: [], extra: `${recapNav(r)}${recapHTML(r)}<div class="sys">${esc(state?.system?.host || '')} · cpu ${state?.system?.cpu ?? 0}% · memory ${state?.system?.mem ?? 0}%</div>`,
    });
  });
}

function setFollow(on) {
  following = on;
  document.querySelector('[data-k="follow"]').classList.toggle('on', on);
  if (on) toast('Following the messenger. Drag to look around, press F to stop.');
}
function resetView() { setFollow(false); camera.position.copy(homePos()); controls.target.copy(HOME_CAM.target); }
document.getElementById('face').onclick = () => setFollow(!following);
document.getElementById('controls').onclick = (e) => {
  const k = e.target.dataset.k; if (!k) return;
  if (k === 'follow') setFollow(!following);
  if (k === 'labels') e.target.classList.toggle('on', !labels.toggle());
  if (k === 'reset') resetView();
  if (k === 'recap') { recapDay = ''; showBuildingCard('summit', buildings.get('summit')); }
  if (k === 'notify') {
    if (canNotify()) { try { localStorage.setItem('olympia.notify', 'off'); } catch {} syncBell(); toast('Notifications off'); }
    else Notification.requestPermission().then((p) => { try { localStorage.setItem('olympia.notify', 'on'); } catch {} syncBell(); toast(p === 'granted' ? "You'll get a notification when a thread needs you" : 'Notifications are blocked in this browser'); });
  }
  if (k === 'timelapse') { sky.timelapse = !sky.timelapse; e.target.classList.toggle('on', sky.timelapse); if (!sky.timelapse) sky.offsetMs = 0; toast(sky.timelapse ? 'Time-lapse: 30 minutes per second' : 'Back to real time'); }
  if (k === 'settings') settings.toggle();
};
// this world's own settings (Settings > Maps or Worlds > its page): time of day and building names, plus a pack's extras
function applyWorldSettings(s) {
  if (!params.has('hour')) {
    // Its own: the hour a pack is drawn in (the real sky when it has none); Live: always the real sky
    const h = s.hour === 'auto' ? PACK?.sky?.hour : s.hour === 'live' ? null : Number(s.hour);
    sky.pinHour = h ?? null; if (h == null && !sky.timelapse) sky.offsetMs = 0;
  }
  if (labels.visible !== (s.labels !== 'off')) document.querySelector('[data-k="labels"]').click();
}
const settings = await initSettings({ current: WORLD_ID, worlds: playable, esc, onChange: applyWorldSettings });
applyWorldSettings(worldSettings(WORLD_ID, PACK?.settings || []));
addEventListener('keydown', (e) => {
  if (settings.isOpen()) return;
  if (e.key === 's' || e.key === 'S') settings.open();
  if (e.key === 'f' || e.key === 'F') setFollow(!following);
  if (e.key === 'r' || e.key === 'R') resetView();
  if (e.key === 'l' || e.key === 'L') document.querySelector('[data-k="labels"]').click();
  if (e.key === 't' || e.key === 'T') document.querySelector('[data-k="timelapse"]').click();
  if (e.key === 'Escape') card.hide();
  if (e.key === 'd' || e.key === 'D') document.querySelector('[data-k="recap"]').click();
  if (e.key === 'n' || e.key === 'N') { const w = waitingSessions(); if (w.length) focusResident(w[(focusIx++) % w.length].id); }
});
addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); roomForHome();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) resetView();
});
setInterval(() => card.refresh(), 5000);

// ================================================================= adaptive quality
const QUALITY = [
  { name: 'Full quality', apply: () => { finish.setTiltShift(true); bloom.enabled = true; gtao.enabled = true; renderer.shadowMap.enabled = true; sky.sun.shadow.mapSize.set(2048, 2048); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); composer.setPixelRatio(Math.min(devicePixelRatio, 2)); } },
  { name: 'Softer glow to keep it smooth', apply: () => { bloom.enabled = false; gtao.enabled = false; } },
  { name: 'Softer shadows to keep it smooth', apply: () => { finish.setTiltShift(false); renderer.setPixelRatio(1); composer.setPixelRatio(1); sky.sun.shadow.mapSize.set(1024, 1024); sky.sun.shadow.map?.dispose(); sky.sun.shadow.map = null; } },
  { name: 'Shadows off to keep it smooth', apply: () => { renderer.shadowMap.enabled = false; } },
];
let qLevel = 0, frames = 0, fpsT = performance.now(), slowStreak = 0;
// phones start lighter: no glow or ambient shading, 1x pixels (it still steps down further if slow)
if (matchMedia('(max-width: 720px), (pointer: coarse)').matches && !params.has('fixedq')) { QUALITY[1].apply(); QUALITY[2].apply(); qLevel = 2; }
function checkQuality(now) {
  if (params.has('fixedq')) return; // screenshots / comparisons
  frames++;
  if (now - fpsT < 2500) return;
  const fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now;
  if (document.hidden) return;
  slowStreak = fps < 38 ? slowStreak + 1 : 0;
  if (slowStreak >= 2 && qLevel < QUALITY.length - 1) { qLevel++; QUALITY[qLevel].apply(); toast(QUALITY[qLevel].name); slowStreak = 0; }
}

// ================================================================= loop
const clock = new THREE.Timer();
const clockEl = document.querySelector('#clock .time'), skyEl = document.querySelector('#clock .sky');
let smokeT = 0, hudT = 0;
const tmp = new THREE.Vector3();

let simT = 0;
function frame() {
  clock.update();
  tick(Math.min(clock.getDelta(), 0.1));
  requestAnimationFrame(frame);
}
function tick(dt) {
  simT += dt;
  const t = simT, now = performance.now();
  sky.update(dt);
  if (scene.fog) { // fog starts past the camera, so far-off views (tall phones, the floating widget) don't wash out
    const d = camera.position.distanceTo(controls.target);
    scene.fog.near = Math.max(140, d * 0.9); scene.fog.far = Math.max(520, d * 3);
  }
  world.update(dt, t, sky.night);
  bloom.strength = (0.12 + sky.night * 0.6) * (PACK?.bloom ?? 1);
  scene.environmentIntensity = 0.08 + (1 - sky.night) * 0.27;
  if (PACK?.light) { // a pack tuned to match its mockup render: exposure and sun / sky / environment light
    const L = PACK.light;
    renderer.toneMappingExposure = L.exposure ?? 1;
    sky.sun.intensity *= L.sun ?? 1; sky.hemi.intensity *= L.hemi ?? 1; scene.environmentIntensity *= L.env ?? 1;
  }
  for (const v of buildings.values()) { v.b.setNight(sky.night); v.b.update(dt, t); }
  summit.active = mState.state === 'idle' ? 0 : messengerAt === 'summit' ? 1 : 0.4;

  // chimney smoke from busy buildings
  smokeT -= dt;
  if (smokeT < 0) {
    smokeT = 0.35;
    for (const v of buildings.values()) {
      if (v.b.active < 0.5 || !v.b.anchors.chimney) continue;
      fx.smoke(v.b.group.localToWorld(v.b.anchors.chimney.clone()), v.kind === 'tool');
    }
    const forge = buildings.get('forge').b;
    if (stalled || (state?.system?.cpu ?? 0) > 60) fx.smoke(forge.group.localToWorld(forge.anchors.chimney.clone()), true);
  }

  messenger.update(dt, t);
  for (const [id, r] of residents) {
    r.update(dt, t);
    if (r.gone) { r.dispose(scene); residents.delete(id); const i = pickables.indexOf(r.group); if (i >= 0) pickables.splice(i, 1); }
  }
  KIT?.update(dt);
  LIFE?.update(dt, t);
  fx.update(dt);

  if (following) {
    messenger.group.getWorldPosition(tmp); tmp.y += 1.5;
    const delta = tmp.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
    controls.target.add(delta); camera.position.add(delta);
  }
  stepCamFly(dt);
  controls.autoRotate = !following && !camFly && now - lastInput > 45000;
  controls.update();
  finish.update(sky.night, dt);
  composer.render(dt);
  bubbles.update(); labels.update(); face.update(dt, t);

  hudT -= dt;
  if (hudT < 0) {
    hudT = 1;
    const d = sky.pinHour != null && !sky.timelapse ? new Date() : sky.now();
    clockEl.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const alt = Math.round(sky.info.sunAlt);
    skyEl.textContent = `${alt > -1 ? `☀ ${alt}°` : `☾ ${sky.info.moonName}`} · ${state?.place?.name || PLACE.name}`;
    steerMessenger();
    updateFace();
  }
  checkQuality(now);
}
requestAnimationFrame(frame);

// tiny console API for poking at the island: olympia.test({type:'project:commit', project:'my-project', subject:'hi'})
window.olympia = { life: LIFE, toolInfo, residents, applyState, focusResident, state: () => state, messengerAt: () => messengerAt, step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt); }, describe, driveMessenger, fx, scene, camera, messenger, buildings, sky, renderer, composer, controls, bloom, QUALITY,
  test: (e) => fetch('/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) }) };

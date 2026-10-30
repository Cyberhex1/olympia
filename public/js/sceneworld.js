// A map world: a pack whose world.json has a "terrain" draws its own place instead of Olympia's island.
// The place is one model built in Blender (assets-src/worlds/<id>.py → public/worlds/<id>/<model>), already in
// island units: a flat floor at terrain.y, a ring path at layout.ringRoad and room left at every spot in the
// layout for the buildings the pack names (kitworld.js puts those in, so projects come and go as usual).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadSceneWorld(scene, id, terrain) {
  const gltf = await new GLTFLoader().loadAsync(`/worlds/${id}/${terrain.model}`);
  const group = gltf.scene;
  const glow = [];  // lamp bulbs and windows (emissive in Blender) brighten after dark
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !o.name.startsWith('flat');  // flat pieces (floors, water) only take shadows
    o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      m.metalness = Math.min(m.metalness ?? 0, 0.2);
      if (m.emissive && m.emissiveIntensity > 0 && m.emissive.getHex()) glow.push([m, m.emissiveIntensity]);
      if (o.name.startsWith('water')) { m.transparent = true; m.opacity = 0.9; m.roughness = 0.12; }
    }
  });
  scene.add(group);
  // a few warm lights at the lamps, spread round the place, so lamps light their surroundings after dark
  group.updateMatrixWorld(true);
  const bulbs = [];
  group.traverse((o) => { if (o.isMesh && /^(bulb|lamp)/.test(o.name)) bulbs.push(o.getWorldPosition(new THREE.Vector3())); });
  const lamps = [];
  for (const p of bulbs) {
    if (lamps.length >= 8 || lamps.some((l) => l.position.distanceTo(p) < 14)) continue;
    const l = new THREE.PointLight(terrain.lampColor || '#ffb870', 0, 26, 1.6);
    l.position.copy(p).add(new THREE.Vector3(0, 0.6, 0)); scene.add(l); lamps.push(l);
  }
  // night fill: the cool moonlit wash the mockups use, so a night place stays readable instead of going black
  const fill = new THREE.HemisphereLight(terrain.fill?.sky || '#8f9ad8', terrain.fill?.ground || '#2a2440', 0);
  scene.add(fill);
  const recap = terrain.recap ? recapPanel(group.getObjectByName(terrain.recap), scene) : null;
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(group) : null;
  if (mixer) for (const clip of gltf.animations) mixer.clipAction(clip).play();
  return {
    group,
    update(dt, t, night = 0) {
      mixer?.update(dt);
      for (const [m, base] of glow) m.emissiveIntensity = base * (0.35 + night * 0.9);
      for (const l of lamps) l.intensity = night * (terrain.lampPower ?? 60);
      fill.intensity = night * (terrain.fill?.power ?? 0.9);
      recap?.tick(dt);
    },
  };
}

// The Oracle's scroll: a flat panel in the model gets today's recap (/api/recap) painted on it, redrawn each minute.
function recapPanel(mesh, scene) {
  if (!mesh) return null;
  const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3());
  mesh.visible = false;
  const W = 1600, H = Math.round(W * size.z / size.x);
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.z), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  plane.rotation.x = -Math.PI / 2; plane.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.01, (box.min.z + box.max.z) / 2);
  plane.receiveShadow = true; scene.add(plane);
  const ctx = canvas.getContext('2d');
  const ink = '#3a2614', red = '#9b2c1c', serif = 'Georgia, "Times New Roman", serif';
  async function draw() {
    const r = await fetch('/api/recap').then((x) => x.json()).catch(() => null);
    ctx.fillStyle = '#efe0bd'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ink; ctx.textBaseline = 'top';
    ctx.font = `600 34px ${serif}`; ctx.fillText('TODAY ON OLYMPIA', 70, 60);
    const d = r ? new Date(`${r.day}T12:00:00`) : new Date();
    ctx.font = `700 120px ${serif}`; ctx.fillText(d.toLocaleDateString(undefined, { weekday: 'long' }), 70, 100);
    ctx.font = `italic 64px ${serif}`; ctx.fillStyle = '#7a5a3a'; ctx.fillText(d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }), 70, 235);
    const projects = r?.projects || [];
    const done = projects.reduce((n, p) => n + p.sessions.reduce((m, s) => m + (s.done?.length || 0), 0), 0);
    const threads = projects.reduce((n, p) => n + p.sessions.length, 0);
    ctx.fillStyle = ink; ctx.font = `600 84px ${serif}`;
    [[done, 'THINGS DONE'], [threads, 'THREADS ACTIVE'], [r?.files?.length ?? 0, 'FILES EDITED']].forEach(([n, l], i) => {
      ctx.fillText(String(n), 70 + i * 440, 330); ctx.font = `600 30px ${serif}`; ctx.fillText(l, 70 + i * 440, 420); ctx.font = `600 84px ${serif}`;
    });
    ctx.fillRect(70, 475, W - 140, 4);
    let y = 515, col = 0;
    for (const p of projects.slice(0, 6)) {
      const x = 70 + col * ((W - 140) / 2);
      ctx.fillStyle = red; ctx.fillRect(x, y, 70, 70);
      ctx.fillStyle = '#f6ead0'; ctx.font = `700 54px ${serif}`; ctx.fillText((p.id[0] || '?').toUpperCase(), x + 18, y + 8);
      ctx.fillStyle = ink; ctx.font = `600 44px ${serif}`; ctx.fillText(p.id, x + 90, y + 4);
      ctx.font = `34px ${serif}`;
      const lines = p.sessions.flatMap((s) => s.done || []).slice(0, 3);
      lines.forEach((t, i) => { ctx.fillText(`✓ ${t.length > 36 ? t.slice(0, 35) + '…' : t}`, x + 6, y + 90 + i * 46); });
      if (!lines.length) ctx.fillText(`${p.sessions.length} thread${p.sessions.length === 1 ? '' : 's'} at work`, x + 6, y + 90);
      col = 1 - col; if (!col) y += 260;
      if (y > H - 250) break;
    }
    tex.needsUpdate = true;
  }
  draw();
  let t = 0;
  return { tick(dt) { t += dt; if (t > 60) { t = 0; draw(); } } };
}

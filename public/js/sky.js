// Real sun and moon over the configured place (compact port of the SunCalc formulas),
// plus the sky dome, stars and the lighting that follows them.
import * as THREE from 'three';

const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
const toDays = (d) => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
function sunCoords(d) {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dt = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}
export function sunPosition(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = siderealTime(d, lw) - c.ra;
  return { azimuth: azimuth(H, phi, c.dec), altitude: altitude(H, phi, c.dec) };
}
export function moonPosition(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = siderealTime(d, lw) - c.ra;
  return { azimuth: azimuth(H, phi, c.dec), altitude: altitude(H, phi, c.dec) };
}
export function moonIllumination(date) {
  const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI };
}
export function moonPhaseName(p) {
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.round(p * 8) % 8];
}

// SunCalc azimuth: 0 = south, positive towards west. Scene: north = -z, east = +x.
export function toDirection(az, alt, out = new THREE.Vector3()) {
  return out.set(-Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt));
}

// ---------------------------------------------------------------- palette keyed by sun altitude (degrees)
const KEYS = [
  { alt: -18, top: '#050817', bottom: '#121b36', sun: '#000000', sunI: 0, hemiSky: '#2a3a6a', hemiGround: '#0b0f1a', hemiI: 0.35, fog: '#0f1630', stars: 1 },
  { alt: -6, top: '#141d44', bottom: '#4a3d6b', sun: '#ff7a59', sunI: 0, hemiSky: '#4c4f86', hemiGround: '#231d2c', hemiI: 0.45, fog: '#3a3360', stars: 0.7 },
  { alt: 0, top: '#3b5a9a', bottom: '#f39a6b', sun: '#ff8a4c', sunI: 0.9, hemiSky: '#9aa7d6', hemiGround: '#5b4636', hemiI: 0.7, fog: '#d99a85', stars: 0.1 },
  { alt: 8, top: '#4a82d0', bottom: '#ffcf98', sun: '#ffc27e', sunI: 2.2, hemiSky: '#c8dbff', hemiGround: '#8a7a64', hemiI: 0.8, fog: '#efcfae', stars: 0 },
  { alt: 30, top: '#2a78d6', bottom: '#a6d3f6', sun: '#fff1dc', sunI: 2.8, hemiSky: '#cfe4ff', hemiGround: '#9a8c78', hemiI: 0.85, fog: '#bcd8f2', stars: 0 },
];
const ca = new THREE.Color(), cb = new THREE.Color();
function lerpKey(alt) {
  let i = 0;
  while (i < KEYS.length - 2 && alt > KEYS[i + 1].alt) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((alt - a.alt) / (b.alt - a.alt), 0, 1);
  const mix = (k) => ca.set(a[k]).lerp(cb.set(b[k]), t).clone();
  const num = (k) => a[k] + (b[k] - a[k]) * t;
  return { top: mix('top'), bottom: mix('bottom'), sun: mix('sun'), sunI: num('sunI'), hemiSky: mix('hemiSky'), hemiGround: mix('hemiGround'), hemiI: num('hemiI'), fog: mix('fog'), stars: num('stars') };
}

export class Sky {
  constructor(scene, place) {
    this.place = place;
    this.scene = scene;
    this.offsetMs = 0; // time-lapse offset
    this.timelapse = false;

    this.uniforms = {
      top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunGlow: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y*2.4+0.18,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.65));
          float s = max(dot(normalize(vDir), normalize(sunDir)),0.0); c += sunColor * (pow(s,24.0)*0.55 + pow(s,600.0)*2.5) * sunGlow;
          gl_FragColor = vec4(c,1.0); }`,
      }),
    );
    dome.renderOrder = -10;
    scene.add(dome);
    this.dome = dome;

    // stars
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.05; v.normalize().multiplyScalar(820);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    scene.add(this.stars);

    // moon disc with a phase shadow
    this.moonCanvas = document.createElement('canvas'); this.moonCanvas.width = this.moonCanvas.height = 128;
    this.moonTex = new THREE.CanvasTexture(this.moonCanvas); this.moonTex.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.moonTex, transparent: true, depthWrite: false, fog: false }));
    this.moon.scale.setScalar(55); scene.add(this.moon);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff6e0, transparent: true, depthWrite: false, fog: false, map: radialTexture() }));
    this.sunSprite.scale.setScalar(110); scene.add(this.sunSprite);
    this.lastMoonPhase = -1;

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 10; sc.far = 220;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.moonLight = new THREE.DirectionalLight(0x9fb6ff, 0.4);
    scene.add(this.hemi, this.sun, this.sun.target, this.moonLight);
    scene.fog = new THREE.Fog(0xcfe3f7, 140, 520);

    this.night = 0;
    this.info = { sunAlt: 0, moonPhase: 0, label: '' };
    this.dir = new THREE.Vector3();
  }

  now() { return new Date(Date.now() + this.offsetMs); }

  drawMoon(phase) {
    const g = this.moonCanvas.getContext('2d'), r = 50, c = 64;
    g.clearRect(0, 0, 128, 128);
    const glow = g.createRadialGradient(c, c, r * 0.8, c, c, 64); glow.addColorStop(0, 'rgba(220,230,255,.35)'); glow.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#2a3150'; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
    // lit part: phase 0 new, .5 full
    const waxing = phase < 0.5, k = Math.cos(phase * 2 * Math.PI); // 1 new -> -1 full
    g.fillStyle = '#f4f1e4'; g.beginPath();
    g.arc(c, c, r, -Math.PI / 2, Math.PI / 2, !waxing);
    g.ellipse(c, c, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0 ? waxing : !waxing);
    g.fill();
    this.moonTex.needsUpdate = true;
  }

  update(dt) {
    if (this.timelapse) this.offsetMs += dt * 1000 * 1800; // 30 minutes per second
    else if (this.pinHour != null) { // a world or look that always shows one time of day (e.g. Night Watch)
      const d = new Date(); d.setHours(Math.floor(this.pinHour), Math.round((this.pinHour % 1) * 60), 0, 0); this.offsetMs = d - Date.now();
    }
    const date = this.now();
    const { lat, lon } = this.place;
    const s = sunPosition(date, lat, lon), m = moonPosition(date, lat, lon), ill = moonIllumination(date);
    const altDeg = s.altitude / rad;
    const k = lerpKey(altDeg);

    this.uniforms.top.value.copy(k.top); this.uniforms.bottom.value.copy(k.bottom);
    toDirection(s.azimuth, s.altitude, this.dir);
    this.uniforms.sunDir.value.copy(this.dir); this.uniforms.sunColor.value.copy(k.sun);
    this.uniforms.sunGlow.value = THREE.MathUtils.clamp((altDeg + 6) / 10, 0, 1);

    const sunUp = Math.max(this.dir.y, 0.08);
    this.sun.position.set(this.dir.x * 120, sunUp * 120, this.dir.z * 120);
    this.sun.color.copy(k.sun); this.sun.intensity = k.sunI;
    this.sun.visible = k.sunI > 0.02;
    this.sunSprite.position.copy(this.dir).multiplyScalar(700);
    this.sunSprite.material.opacity = THREE.MathUtils.clamp((altDeg + 3) / 6, 0, 1);
    this.sunSprite.material.color.copy(k.sun).lerp(new THREE.Color('#fff8e8'), 0.5);

    const md = toDirection(m.azimuth, m.altitude, new THREE.Vector3());
    this.moon.position.copy(md).multiplyScalar(700);
    this.moon.visible = md.y > -0.05;
    if (Math.abs(ill.phase - this.lastMoonPhase) > 0.005) { this.drawMoon(ill.phase); this.lastMoonPhase = ill.phase; }
    const night = THREE.MathUtils.clamp((2 - altDeg) / 10, 0, 1);
    this.night = night;
    this.moonLight.position.set(md.x * 100, Math.max(md.y, 0.2) * 100, md.z * 100);
    this.moonLight.intensity = night * (0.25 + 0.55 * ill.fraction) * (md.y > 0 ? 1 : 0.4);

    this.hemi.color.copy(k.hemiSky); this.hemi.groundColor.copy(k.hemiGround); this.hemi.intensity = k.hemiI;
    this.scene.fog.color.copy(k.fog);
    this.stars.material.opacity = k.stars;
    this.stars.visible = k.stars > 0.01;
    this.stars.rotation.y += dt * 0.004;

    this.info = { sunAlt: altDeg, moonPhase: ill.phase, moonName: moonPhaseName(ill.phase), date };
  }
}

function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,250,235,.95)'); gr.addColorStop(0.32, 'rgba(255,240,210,.35)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

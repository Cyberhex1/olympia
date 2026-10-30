// Effects: fireworks for commits, chimney smoke, parachuted task drops, sparkles.
import * as THREE from 'three';
import { mat, mesh } from './util.js';

const COLORS = ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f8f9fa', '#c77dff'];

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.puffGeo = new THREE.IcosahedronGeometry(0.35, 0);
  }

  add(obj, update) { this.scene.add(obj); this.items.push({ obj, update, age: 0 }); }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.age += dt;
      if (it.update(dt, it.age, it.obj) === false) {
        this.scene.remove(it.obj);
        it.obj.traverse((o) => { if (o.geometry && o.geometry !== this.puffGeo) o.geometry.dispose(); if (o.material?.userData?.own) o.material.dispose(); });
        this.items.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- fireworks
  firework(at, count = 3) {
    for (let k = 0; k < count; k++) setTimeout(() => this.rocket(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3))), k * 450);
  }
  rocket(at) {
    const color = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
    const trail = mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), { cast: false, receive: false });
    trail.position.copy(at); trail.position.y += 2;
    const apex = at.y + 11 + Math.random() * 4;
    this.add(trail, (dt, age, o) => {
      o.position.y += dt * 16; o.position.x += Math.sin(age * 20) * 0.01;
      if (o.position.y >= apex) { this.burst(o.position.clone(), color); return false; }
    });
  }
  burst(at, color) {
    const n = 140, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y, at.z], i * 3); vel.push(new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 4)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.userData.own = true;
    const pts = new THREE.Points(g, m);
    this.add(pts, (dt, age) => {
      const a = g.attributes.position;
      for (let i = 0; i < n; i++) {
        const v = vel[i]; v.y -= 6 * dt; v.multiplyScalar(1 - dt * 1.2);
        a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt);
      }
      a.needsUpdate = true;
      m.opacity = Math.max(0, 1 - age / 1.8);
      m.size = 0.45 + Math.sin(age * 30) * 0.08;
      return age < 1.8;
    });
    const flash = new THREE.PointLight(color, 40, 30, 2); flash.position.copy(at);
    this.add(flash, (dt, age, o) => { o.intensity = Math.max(0, 40 * (1 - age / 0.6)); return age < 0.6; });
  }

  // ---------------------------------------------------------------- smoke puff
  smoke(at, dark = false) {
    const m = new THREE.MeshStandardMaterial({ color: dark ? '#6d6a68' : '#f3f1ec', transparent: true, opacity: 0.8, flatShading: true, roughness: 1, depthWrite: false });
    m.userData.own = true;
    const p = new THREE.Mesh(this.puffGeo, m);
    p.position.copy(at);
    const drift = new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
    this.add(p, (dt, age, o) => {
      o.position.addScaledVector(drift, dt);
      o.scale.setScalar(0.6 + age * 0.9);
      o.rotation.x += dt; o.rotation.y += dt * 0.7;
      m.opacity = Math.max(0, 0.75 * (1 - age / 3));
      return age < 3;
    });
  }

  // ---------------------------------------------------------------- sparkles (success / arrival)
  sparkle(at, color = '#ffe48a', n = 24) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y, at.z], i * 3); const v = new THREE.Vector3().randomDirection().multiplyScalar(1.5 + Math.random() * 1.5); v.y = Math.abs(v.y) + 1; vel.push(v); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.userData.own = true;
    this.add(new THREE.Points(g, m), (dt, age) => {
      const a = g.attributes.position;
      for (let i = 0; i < n; i++) { const v = vel[i]; v.y -= 3 * dt; a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt); }
      a.needsUpdate = true; m.opacity = Math.max(0, 1 - age / 1.2); return age < 1.2;
    });
  }

  // ---------------------------------------------------------------- finished work sent up to the Acropolis
  // A rolled scroll with a glow rises from the thread in an arc and lands on the summit, which sparkles.
  sendUp(from, to, onArrive) {
    const g = new THREE.Group();
    const scroll = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 10), mat('#f4ead2'), { cast: false, receive: false }); scroll.rotation.z = Math.PI / 2;
    const tie = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), mat('#c8432b'), { cast: false, receive: false }); tie.rotation.z = Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe48a', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.material.userData.own = true;
    g.add(scroll, tie, glow);
    const start = from.clone().add(new THREE.Vector3(0, 1.8, 0)), end = to.clone(), dur = 2.4;
    const lift = Math.max(start.y, end.y) + 6;
    g.position.copy(start);
    this.add(g, (dt, age, o) => {
      const k = Math.min(1, age / dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      o.position.lerpVectors(start, end, e);
      o.position.y = (1 - e) * (1 - e) * start.y + 2 * (1 - e) * e * lift + e * e * end.y; // a gentle arc up and over
      o.rotation.y += dt * 4; glow.scale.setScalar(1 + Math.sin(age * 9) * 0.15);
      if (k >= 1) { this.sparkle(end, '#ffe48a', 30); onArrive?.(); return false; }
    });
  }

  // ---------------------------------------------------------------- parachuted task crate
  parachute(to, onLand) {
    const g = new THREE.Group();
    const crate = mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), mat('#c79a5b'));
    crate.add(mesh(new THREE.BoxGeometry(0.82, 0.12, 0.62), mat('#8a5a35')));
    const seal = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 10), mat('#c8432b')); seal.rotation.x = Math.PI / 2; seal.position.z = 0.31; crate.add(seal);
    g.add(crate);
    const chute = new THREE.Group(); chute.position.y = 2.6;
    for (let i = 0; i < 8; i++) {
      const panel = mesh(new THREE.SphereGeometry(1.3, 4, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.2), mat(i % 2 ? '#f7f5f0' : '#d9382c', { side: THREE.DoubleSide }), { cast: true, receive: false });
      chute.add(panel);
    }
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x * 0.4, 0.3, z * 0.3), new THREE.Vector3(x, 2.6, z)]), new THREE.LineBasicMaterial({ color: '#4a3b30' }));
      g.add(line);
    }
    g.add(chute);
    const start = to.clone(); start.y += 26; start.x += 4;
    g.position.copy(start);
    let landed = false;
    this.add(g, (dt, age, o) => {
      if (!landed) {
        const k = Math.min(1, age / 6);
        o.position.lerpVectors(start, to, 1 - Math.pow(1 - k, 1.6));
        o.rotation.z = Math.sin(age * 1.8) * 0.12; o.rotation.y += dt * 0.3;
        if (k >= 1) { landed = true; o.userData.landAt = age; o.rotation.z = 0; onLand?.(); }
        return true;
      }
      const s = age - o.userData.landAt;
      chute.scale.y = Math.max(0.05, 1 - s * 1.5); chute.position.y = 2.6 * chute.scale.y;
      chute.rotation.z = Math.min(1.2, s * 1.2);
      g.children.forEach((c) => { if (c.isLine) c.visible = s < 0.6; });
      if (s > 3) o.scale.setScalar(Math.max(0.001, 1 - (s - 3) * 2));
      return s < 3.5;
    });
  }
}

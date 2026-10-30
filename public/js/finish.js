// The "diorama finish" shared with the world mockups: ink outlines, a warm grade and a soft tilt-shift lens.
// The outlines reuse the depth + normal buffers the ambient-occlusion pass already renders, so they cost one
// full-screen pass. When that pass is switched off on slow devices, the outlines switch off with it.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

const InkShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, tNormal: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.5 }, cameraFar: { value: 2000 },
    ink: { value: new THREE.Color(0.17, 0.11, 0.08) }, strength: { value: 0.8 }, useInk: { value: 1 },
    warmth: { value: 0.06 }, saturation: { value: 1.08 },
    // looks (public/worlds/<id>/world.json "finish"): 0 the diorama finish, 1 black-figure vase, 2 sea chart, 3 hologram
    mode: { value: 0 }, paper: { value: new THREE.Color(0.78, 0.4, 0.2) }, time: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth, tNormal; uniform vec2 resolution; uniform float cameraNear, cameraFar;
    uniform vec3 ink, paper; uniform float strength, useInk, warmth, saturation, mode, time; varying vec2 vUv;
    float grain(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float viewZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
    vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // warm, slightly richer grade
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth * 0.6);
      if (useInk > 0.5) {
        vec2 px = 1.0 / resolution;
        float z = viewZ(vUv);
        float zl = viewZ(vUv - vec2(px.x, 0.0)), zr = viewZ(vUv + vec2(px.x, 0.0));
        float zd = viewZ(vUv - vec2(0.0, px.y)), zu = viewZ(vUv + vec2(0.0, px.y));
        float dz = max(max(abs(zl - z), abs(zr - z)), max(abs(zd - z), abs(zu - z))) / max(z, 1.0);
        vec3 n = nrm(vUv);
        float dn = max(max(1.0 - dot(n, nrm(vUv - vec2(px.x, 0.0))), 1.0 - dot(n, nrm(vUv + vec2(px.x, 0.0)))),
                       max(1.0 - dot(n, nrm(vUv - vec2(0.0, px.y))), 1.0 - dot(n, nrm(vUv + vec2(0.0, px.y)))));
        float edge = max(smoothstep(0.008, 0.025, dz), smoothstep(0.1, 0.28, dn) * 0.55);
        edge *= smoothstep(400.0, 140.0, z);  // no ink on the far sky and clouds
        if (mode < 0.5) c.rgb = mix(c.rgb, ink, edge * strength);
        else {
          float sky = smoothstep(260.0, 420.0, z);
          float lum = dot(texture2D(tDiffuse, vUv).rgb, vec3(0.299, 0.587, 0.114));
          vec2 frag = vUv * resolution;
          if (mode < 1.5) {        // black-figure: dark shapes become glossy black figures, light ground the clay; incised lines in clay
            float figure = 1.0 - smoothstep(0.26, 0.36, lum);
            vec3 col = mix(paper, ink, figure);
            col = mix(col, paper * 0.92, smoothstep(0.1, 0.28, dn) * figure * 0.85);           // incised detail inside figures
            col = mix(col, ink, smoothstep(0.008, 0.025, dz) * (1.0 - figure) * 0.9);          // black outline around clay shapes
            c.rgb = mix(col, paper * 1.04, sky) * (0.96 + grain(frag) * 0.06);
          } else if (mode < 2.5) { // sea chart: parchment washed with a little colour, inked edges, hatching in the shadows
            vec3 tint = mix(vec3(lum), texture2D(tDiffuse, vUv).rgb, 0.28);
            vec3 col = paper * (0.72 + 0.4 * tint);
            float hatch = step(0.5, fract((frag.x + frag.y) / 5.0)) * (1.0 - smoothstep(0.12, 0.3, lum));
            col = mix(col, ink, hatch * 0.35 + edge * strength);
            col = mix(col, ink, 1.0 - smoothstep(0.1, 0.24, lum));  // ink drawn on the chart itself stays ink
            c.rgb = mix(col, paper, sky) * (0.95 + grain(frag) * 0.07);
          } else {                 // hologram: glowing edges over a dim blue body, scanlines, the sky left dark
            float scan = 0.82 + 0.18 * sin(frag.y * 1.6 + time * 4.0);
            vec3 col = paper * (0.12 + lum * 0.55) + ink * edge * 1.6;
            c.rgb = mix(col * scan, paper * 0.05, sky);
          }
        }
      } else if (mode > 0.5) {
        float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mode < 1.5 ? mix(ink, paper, smoothstep(0.26, 0.36, lum)) : mode < 2.5 ? mix(ink, paper * (0.72 + 0.4 * lum), smoothstep(0.1, 0.24, lum)) : paper * (0.12 + lum * 0.55);
      }
      gl_FragColor = c;
    }`,
};

export function addFinish(composer, gtao, camera) {
  const ink = new ShaderPass(InkShader);
  const tiltH = new ShaderPass(HorizontalTiltShiftShader);
  const tiltV = new ShaderPass(VerticalTiltShiftShader);
  // insert after the AO pass (index 1) so bloom and the output pass still come last
  const at = composer.passes.indexOf(gtao) + 1;
  composer.insertPass(ink, at);
  composer.insertPass(tiltH, at + 1);
  composer.insertPass(tiltV, at + 2);
  const sync = () => {
    const w = composer._width * composer._pixelRatio, h = composer._height * composer._pixelRatio;
    ink.uniforms.resolution.value.set(w, h);
    ink.uniforms.cameraNear.value = camera.near; ink.uniforms.cameraFar.value = camera.far;
    tiltH.uniforms.h.value = 1.6 / w; tiltV.uniforms.v.value = 1.6 / h;
    tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.52;
  };
  let style = null;
  return {
    passes: { ink, tiltH, tiltV },
    // a look's own finish: { mode: 'vase'|'chart'|'holo', ink, paper, strength, warmth, saturation, tilt }
    setStyle(o = {}) {
      style = o;
      const u = ink.uniforms;
      u.mode.value = { vase: 1, chart: 2, holo: 3 }[o.mode] || 0;
      if (o.paper) u.paper.value.set(o.paper);
      if (o.tilt != null) tiltH.uniforms.r.value = tiltV.uniforms.r.value = o.tilt;
    },
    update(night = 0, dt = 0) {
      ink.uniforms.tDepth.value = gtao.depthTexture; ink.uniforms.tNormal.value = gtao.normalTexture;
      ink.uniforms.useInk.value = gtao.enabled ? 1 : 0;
      ink.uniforms.time.value += dt;
      if (style) {
        const u = ink.uniforms;
        if (style.ink) u.ink.value.set(style.ink); else u.ink.value.setRGB(0.17 - 0.12 * night, 0.11 - 0.06 * night, 0.08 + 0.06 * night);
        u.strength.value = style.strength ?? (0.8 - 0.55 * night);
        u.warmth.value = style.warmth ?? 0.06 * (1 - night);
        u.saturation.value = style.saturation ?? 1.08;
        sync();
        if (style.tilt != null) tiltH.uniforms.r.value = tiltV.uniforms.r.value = style.tilt;
        if (style.blur != null) { tiltH.uniforms.h.value *= style.blur; tiltV.uniforms.v.value *= style.blur; }
        return;
      }
      // after dark the scene is already dark, so the ink fades and turns a soft night blue instead of brown
      ink.uniforms.strength.value = 0.8 - 0.55 * night;
      ink.uniforms.ink.value.setRGB(0.17 - 0.12 * night, 0.11 - 0.06 * night, 0.08 + 0.06 * night);
      ink.uniforms.warmth.value = 0.06 * (1 - night);
      sync();
    },
    setTiltShift(on) { tiltH.enabled = tiltV.enabled = on; },
  };
}

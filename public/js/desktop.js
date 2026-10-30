// Desktop mode (?desktop=1, used by the widget): the island floats on the desktop with no window around it.
// The page draws on a transparent background with no sky, and the HUD only shows while the pointer is over
// the island. The widget lets clicks on empty pixels fall through to the desktop: this module tells it, via
// window.olympiaDesktop (desktop/preload.cjs), whether the pointer is over something of Olympia's.
import * as THREE from 'three';

export function initDesktop({ renderer, scene, camera, sky }) {
  document.body.classList.add('desktop');
  renderer.setClearColor(0x000000, 0);
  scene.background = null;
  for (const o of [sky.dome, sky.stars, sky.moon, sky.sunSprite]) if (o) o.visible = false;

  const bridge = window.olympiaDesktop;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  // pixels the island owns: the HUD (anything that isn't the canvas) or a visible mesh under the pointer
  const over = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (el && el !== renderer.domElement && !el.closest('#stage')) return true;
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(scene, true).some((h) => shown(h.object) && !h.object.isSprite && !h.object.isPoints);
  };

  let hot = false, hideT = 0, pending = null, busy = false;
  const setHot = (on) => {
    if (on) { clearTimeout(hideT); document.body.classList.add('hud-on'); }
    else { clearTimeout(hideT); hideT = setTimeout(() => document.body.classList.remove('hud-on'), 1800); }
    if (on !== hot) { hot = on; bridge?.setInteractive(on); }
  };
  // hit-test at most ~15 times a second; while a button is held (dragging the view) keep the window
  let held = false;
  addEventListener('pointerdown', () => { held = true; });
  addEventListener('pointerup', () => { held = false; });
  const check = () => {
    busy = false;
    if (!pending || held) return;
    const [x, y] = pending; pending = null;
    setHot(over(x, y));
  };
  addEventListener('mousemove', (e) => { pending = [e.clientX, e.clientY]; if (!busy) { busy = true; setTimeout(check, 66); } });
  document.addEventListener('mouseleave', () => { if (!held) setHot(false); });
  bridge?.setInteractive(false);
  return { isHot: () => hot };
}

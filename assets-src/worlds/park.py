# Theme Park, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t07_park_polished.py): a round
# green island with a paved plaza and fountain in the middle and four paths out, the steel coaster with its loop
# down the left, the log flume down the right, the monorail on stilts across the back, the ferris wheel at the
# back right, lanterns and bunting over the plaza, benches, trees and flowerbeds. The info booth by the plaza
# is the summit and the main gate the agora; the app adds the ride stations and stalls (projects, the mockup's
# and more of them round the paths), small kiosks for the workshops and the guest house (hotel).
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as PL
import bpy

WID = 'park'
random.seed(9)
L.reset()
C = 'coaster-kit'
F = 10.0 / 15.6
OY = -2.0                                   # the mockup shifted the park 2 back on its island
pathm = L.mat('path', (0.84, 0.7, 0.54), rough=0.9)
before = set(bpy.data.objects)
L.cyl((0, 0, 0.0), 3.2, 0.06, pathm, verts=40, name='flat-plaza')
for (cx, cy, w, h) in ((0, -5.5, 2.2, 8), (0, 6.5, 2.2, 10), (-5.5, 0, 8, 2.2), (5.5, 0, 8, 2.2)):
    L.box((cx, cy, 0.0), (w, h, 0.06), pathm, name='flat-path')
L.cyl((0, 0, 0.05), 0.8, 0.5, L.mat('fountain', (0.75, 0.85, 0.95), rough=0.1), verts=24); L.cyl((0, 0, 0.32), 0.65, 0.05, L.mat('water', (0.2, 0.55, 0.9), rough=0.05), verts=24, name='water')
# the steel coaster with its loop, the log flume, the monorail
for i in range(3): L.add(C, 'coaster-steel-straight', (-8, 7 - i * 4, 1.0), 0)
L.add(C, 'coaster-steel-looping', (-8, 7, 1.0), 0)
for i in range(3): L.add(C, 'support-large', (-8, 5 - i * 4, 0), 0)
L.add(C, 'coaster-train-front', (-8, 1.2, 1.3), 0); L.add(C, 'coaster-train', (-8, 2.7, 1.3), 0)
for i in range(3): L.add(C, 'coaster-wood-straight', (7, 7 - i * 4, 1.0), 0); L.add(C, 'support-large', (7, 5 - i * 4, 0), 0)
L.add(C, 'coaster-wood-straight-hill-complete', (7, 11, 1.0), 0)
L.add(C, 'coaster-train-wooden', (7, 2.0, 1.3), 0); L.add(C, 'coaster-train-wooden', (7, 3.5, 1.3), 0)
for i in range(-2, 3):
    L.add(C, 'coaster-monorail-straight', (i * 4, 13.5, 2.4), 90); L.add(C, 'support-small', (i * 4 - 2, 13.5, 0), 0)
L.add(C, 'train-monorail', (-1, 13.5, 2.7), 90)
L.add(C, 'bench', (-2.6, -4.6, 0), 90)

PROJECTS = [(-6.6, -2.8), (5.6, 1.6), (3.2, -3.2), (4.8, -3.2), (-3.4, 3.6), (-2.8, -6.4), (2.8, -6.4),
            (-3.4, 8.0), (3.4, 8.0), (-10.6, -5.5), (9.6, -6.0), (-2.6, 10.8), (2.6, 10.8)]
TOOLS = {'forge': (-5.4, 1.7), 'library': (5.4, -1.7), 'beacon': (1.6, 5.4), 'archive': (-6.0, -7.6), 'aviary': (6.0, -7.6)}
SUMMIT, GATE, HOTEL = (2.6, 2.8), (0, -9.5), (-9.4, 10.0)
taken = PROJECTS + list(TOOLS.values()) + [SUMMIT, GATE, HOTEL]
def busy(x, y):
    if abs(x) < 3.3 and abs(y) < 3.3 or abs(x) < 1.4 or abs(y) < 1.4 or (abs(x + 8) < 2.6 and y > -4) or (abs(x - 7) < 2.6 and y > -1) or abs(y - 13.5) < 1.6 or math.hypot(x - 11, y - 9.5) < 4 or math.hypot(x, y - 2) > 14.8: return True
    return any(math.hypot(x - a, y - b) < 2.2 for a, b in taken)
for _ in range(90):
    x, y = random.uniform(-16, 16), random.uniform(-14, 18)
    if busy(x, y): continue
    L.add(C, random.choice(['tree', 'tree-large', 'flowers', 'flowers']), (x, y, 0), random.uniform(0, 360), random.uniform(1, 1.6))
# the ferris wheel at the back right
wm = L.mat('wheel', (0.95, 0.95, 0.98), metal=0.3, rough=0.4)
bpy.ops.mesh.primitive_torus_add(major_radius=3.2, minor_radius=0.08, location=(11, 9.5, 4.0), rotation=(math.radians(90), 0, math.radians(20))); bpy.context.object.data.materials.append(wm)
for k in range(10):
    a = k / 10 * math.pi * 2; dx, dz = math.cos(a) * 3.2, math.sin(a) * 3.2
    ox, oy = dx * math.cos(math.radians(20)), dx * math.sin(math.radians(20))
    s = L.cyl((11 + ox / 2, 9.5 + oy / 2, 4.0 + dz / 2), 0.03, 3.2, wm, verts=6); s.rotation_mode = 'ZYX'; s.rotation_euler = (0, -a + math.pi / 2, math.radians(20))
    L.box((11 + ox, 9.5 + oy, 4.0 + dz - 0.35), (0.5, 0.4, 0.4), L.mat('cab%d' % (k % 4), ((0.9, 0.3, 0.3), (0.98, 0.78, 0.25), (0.35, 0.62, 0.85), (0.4, 0.75, 0.45))[k % 4]), bevel=0.06)
for sx in (-1, 1): s = L.cyl((11 + sx * 1.0, 9.5 + sx * 0.36, 2.0), 0.08, 4.4, wm, verts=8); s.rotation_euler.y = math.radians(sx * 14)
# bunting and lanterns over the plaza
flags = PL.flag_mats()
for a in (45, 135, 225, 315):
    x, y = PL.polar(a, 4.2); L.add('fantasy-town-kit', 'lantern', (x, y, 0), 0, 1.7); L.sphere((x, y, 2.45), 0.1, L.mat('bulbm', (1, 0.8, 0.45), emit=6), name='bulb')
PL.wire(PL.polar(45, 4.2) + (2.55,), PL.polar(225, 4.2) + (2.55,), sag=0.6, flags=flags)
PL.wire(PL.polar(135, 4.2) + (2.55,), PL.polar(315, 4.2) + (2.55,), sag=0.6, flags=flags)
root = bpy.data.objects.new('park', None); bpy.context.scene.collection.objects.link(root)
for o in set(bpy.data.objects) - before:
    if o.parent is None and o is not root: o.parent = root
root.location = (0, OY, 0)
grass = L.mat('grass', (0.24, 0.47, 0.15))
PL.diorama(15.6, top_mat=grass)
PL.scatter(220, 0, 15.4, ['grass_large', 'grass', 'flower_redA', 'flower_yellowB', 'flower_purpleA'], (1.2, 1.8), skip=lambda x, y: busy(x, y - OY))
PL.regrade_greens(skip=('grass',))
top = bpy.data.objects.new('island', None); bpy.context.scene.collection.objects.link(top)
for o in list(bpy.context.scene.objects):
    if o.parent is None and o is not top: o.parent = top
top.scale = (F, F, F)

# ---- layout ------------------------------------------------------------------------------------------------------
def m(x, y): return (x * F, (y + OY) * F)
def facing_path(x, y):  # stalls and stations face the nearest path
    if abs(x) > abs(y): return m(0 if abs(y) > 1.5 else x, y) if abs(y) > 1.5 else m(x * 0.5, y)
    return m(x, y * 0.5) if abs(x) < 1.5 else m(0, y)
lay = {'summit': [round(m(*SUMMIT)[0] * W.S, 2), 0.2, round(-m(*SUMMIT)[1] * W.S, 2)],
       'tools': {k: W.spot(*m(x, y), look=facing_path(x, y)) for k, (x, y) in TOOLS.items()},
       'projectSlots': [W.spot(*m(x, y), look=facing_path(x, y)) for x, y in PROJECTS],
       'agora': W.spot(*m(*GATE), look=m(0, 0)), 'hotel': W.spot(*m(*HOTEL), look=m(0, 4)), 'ringRoad': 14}
ring = [PL.polar(a, 3.0) for a in range(0, 360, 45)]
nodes = [(0, 0)] + ring + [(0, -6), (0, -9.4), (0, 6.5), (0, 11.2), (-6, 0), (-9.4, 0), (6, 0), (9.4, 0)]
edges = [(1 + k, 1 + (k + 1) % 8) for k in range(8)] + [(0, 1), (0, 3), (0, 5), (0, 7)]
# ring indices: angle 0 → 1 (east), 90 → 3 (north), 180 → 5 (west), 270 → 7 (south)
edges += [(7, 9), (9, 10), (3, 11), (11, 12), (5, 13), (13, 14), (1, 15), (15, 16)]
lay['paths'] = W.graph([m(x, y) for x, y in nodes], edges)
pack = W.set_layout(WID, 'park.glb', 0.12, 34, lay, camera=W.blender_camera((12 * F, -29 * F, 22 * F), (0.6 * F, 0.4 * F, -0.6 * F), 33))
b = pack['buildings']; KS = round(F * W.S, 3)
b['projects'] = [{'parts': [[C + '/station', 0, 0, 90]], 'scale': round(1.3 * KS, 2)}, {'parts': [[C + '/stall-food', 0, 0]], 'scale': round(1.4 * KS, 2)},
                 {'parts': [[C + '/stall-drinks', 0, 0]], 'scale': round(1.4 * KS, 2)}, {'parts': [[C + '/ride-entrance', 0, 0], [C + '/queue-straight', 0, 1.0, 0, 1, -0.15]], 'scale': round(1.4 * KS, 2)},
                 {'parts': [[C + '/stall-toilets', 0, 0]], 'scale': round(1.4 * KS, 2)}]
b['summit'] = {'parts': [[C + '/stall-information', 0, 0]], 'scale': round(1.6 * KS, 2)}
b['agora'] = {'m': C + '/park-entrance', 'scale': round(1.6 * KS, 2)}
for k, parts in {'forge': [[C + '/trash', 0, 0], [C + '/bench', 0.8, 0]], 'library': [[C + '/bench', 0, 0], [C + '/flowers', 0.9, 0]],
                 'beacon': [[C + '/ride-exit', 0, 0]], 'archive': [[C + '/bench', 0, 0], [C + '/trash', 0.8, 0]], 'aviary': [[C + '/ride-entrance', 0, 0]]}.items():
    b[k] = {'parts': parts, 'scale': round(1.3 * KS, 2)}
b['hotel'] = {'m': 'city-kit-suburban/building-type-s', 'scale': round(2.4 * KS, 2)}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

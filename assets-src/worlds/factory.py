# Factory Floor, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t10_factory_polished.py):
# a plant of Kenney factory floor tiles with wall panels and windows along the back and left, yellow safety lines
# between the rows, hanging lamps, pallets, the overhead crane, the control room on its mezzanine (the summit)
# with its screens and stairs, the loading-dock door, then the floating concrete yard with smokestacks,
# shipping containers and a painted kerb. Production lines (projects) run in the mockup's rows, two to a row so
# all 13 fit; the app adds them, the workshops along the front of the yard and the visiting trucks (hotel).
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as PL
import bpy

WID = 'factory'
random.seed(10)
L.reset()
Fk = 'factory-kit'
off = L.mat('off', (0.25, 0.25, 0.28)); scr = L.mat('scr', (0.05, 0.08, 0.12))
yel = L.mat('safety', (1.0, 0.78, 0.1), rough=0.6)
RX, RY, RZ = -7.2, -6.6, 0.06          # where the plant's corner sits on the yard
PW, PD = 15, 13                         # plant floor in kit tiles (the mockup's 15 x 11, two rows deeper)
ROWS = [1.0, 2.9, 4.8, 6.7, 8.6, 10.5]  # the mockup's line rows, one more
before = set(bpy.data.objects)
for x in range(PW):
    for y in range(PD):
        L.add(Fk, 'floor', (x, y, 0))
for x in range(PW): L.add(Fk, 'structure-wall' if x % 3 else 'structure-window', (x, PD, 0), 90)
for y in range(PD): L.add(Fk, 'structure-wall' if y % 3 else 'structure-window', (-0.5, y, 0), 0)
for y in [r - 0.95 for r in ROWS] + [ROWS[-1] + 0.95]: L.box((5.5, y, 0.012), (9.6, 0.06, 0.006), yel, name='flat-safety')
for y in ROWS:  # a beacon pole at the head of every line (the app's lines stand beside them)
    for x0 in (2.0, 7.0):
        L.cyl((x0 - 1.7, y + 0.6, 1.0), 0.04, 2.0, off, verts=8)
# control room on a mezzanine
for x in range(11, 15):
    for y in range(1, 5): L.add(Fk, 'floor', (x, y, 1.6))
L.box((12.5, 2.5, 1.57), (4.2, 4.2, 0.06), L.mat('mezz', (0.5, 0.52, 0.56), metal=0.5, rough=0.4))
for (x, y) in ((11, 1), (14, 1), (11, 4), (14, 4)): L.cyl((x, y, 0.8), 0.06, 1.6, off, verts=8)
L.add(Fk, 'screen-wide', (12.4, 4.2, 1.6), 0); L.add(Fk, 'screen-wide', (13.7, 4.2, 1.6), 0)
L.add(Fk, 'catwalk-stairs', (10.4, 2.5, 0), 90)
# loading dock, crane, hanging lamps, pallets
L.add(Fk, 'door-wide-open', (13.2, PD - 0.4, 0), 90)
for x, y in ((11.2, 6.0), (11.8, 6.2), (11.5, 5.5)): L.add(Fk, 'box-large', (x, y, 0), random.uniform(0, 30), 0.8)
L.add(Fk, 'crane', (7.0, PD - 1.0, 0), 0, 1.0)
for x, y in ((3.5, 1.95), (8.5, 3.85), (3.5, 5.75), (8.5, 7.65), (3.5, 9.55), (12.5, 6.8)):
    L.cyl((x, y, 3.6), 0.006, 0.8, L.mat('cordf', (0.1, 0.1, 0.1)), verts=4)
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.35, radius2=0.1, depth=0.25, location=(x, y, 3.15)); bpy.context.object.data.materials.append(L.mat('shadef', (0.95, 0.75, 0.15), rough=0.5))
    L.sphere((x, y, 3.0), 0.09, L.mat('lamp', (1, 0.9, 0.75), emit=6), name='bulb')
for x, y in ((10.6, 11.4), (11.6, 11.4), (10.6, 10.6)):
    L.box((x, y, 0.08), (0.8, 0.8, 0.12), L.mat('pallet', (0.6, 0.45, 0.28))); L.add(Fk, 'box-small', (x, y, 0.15), random.uniform(0, 20), 0.9)
root = bpy.data.objects.new('plant', None); bpy.context.scene.collection.objects.link(root)
for o in set(bpy.data.objects) - before:
    if o.parent is None and o is not root: o.parent = root
root.location = (RX, RY, RZ)

# ---- the yard ---------------------------------------------------------------------------------------------------
YARD = 10.6
PL.diorama(YARD, square=True, top=(0.42, 0.42, 0.44), soil=(0.35, 0.3, 0.27), under=(0.25, 0.21, 0.19), band=(0.45, 0.45, 0.48), rocks=False)
for k in range(-10, 11, 2):
    L.box((k, 0, 0.003), (0.015, 2 * YARD, 0.004), L.mat('yard-line', (0.38, 0.38, 0.4)), name='flat-grid'); L.box((0, k, 0.003), (2 * YARD, 0.015, 0.004), L.mat('yard-line', (0.38, 0.38, 0.4)), name='flat-grid')
stack = L.mat('stack', (0.62, 0.36, 0.28), rough=0.8); smoke = L.mat('smoke', (0.92, 0.92, 0.95), alpha=0.55, rough=1)
for x, y in ((-9.4, 8.9), (-9.4, 7.2)):
    L.cyl((x, y, 2.6), 0.4, 5.2, stack, verts=20); L.cyl((x, y, 4.8), 0.45, 0.22, L.mat('band', (0.95, 0.95, 0.95)), verts=20)
    for k in range(4): L.sphere((x + k * 0.4, y + k * 0.2, 5.6 + k * 0.55), 0.4 + k * 0.16, smoke, name='smoke')
CONT = [(0.75, 0.25, 0.2), (0.2, 0.45, 0.7), (0.25, 0.6, 0.35), (0.9, 0.65, 0.15)]
for i, (x, y) in enumerate(((9.3, -7.8), (9.3, -8.9), (9.3, -10.0), (9.3, -8.9))):
    L.box((x, y, 0.42 + (0.83 if i == 3 else 0)), (2.0, 0.95, 0.8), L.mat('cont%d' % i, CONT[i], rough=0.7), bevel=0.04)
for x in range(-9, 10, 2): L.box((x + 0.5, -7.1, 0.065), (1.0, 0.14, 0.005), yel, name='flat-kerb')

# ---- layout ---------------------------------------------------------------------------------------------------------
def at(x, y): return (x + RX, y + RY)
LINES = [(x0, y) for y in ROWS for x0 in (2.0, 7.0)] + [(12.0, 11.6)]
slots = [W.spot(*at(x0 + 1.0, y)) for x0, y in LINES]
for s in slots: s['face'] = 90
TY = -2.4  # workshops in a row along the front of the yard
tools = {k: W.spot(*at(x, TY), look=at(x, 0)) for k, x in zip(('forge', 'library', 'beacon', 'archive', 'aviary'), (1.0, 4.0, 7.0, 10.0, 13.0))}
FLOOR = RZ + 0.1
lay = {'summit': [round(at(12.5, 2.5)[0] * W.S, 2), round((RZ + 1.66) * W.S, 2), round(-at(12.5, 2.5)[1] * W.S, 2)],
       'tools': tools, 'projectSlots': slots,
       'agora': W.spot(*at(16.4, 1.0), look=at(10, 1.0)), 'hotel': W.spot(*at(13.0, 8.4), look=at(13.0, 4)), 'ringRoad': 14}
xs = [at(x, 0)[0] for x in (0.3, 5.5, 10.6, 16.3)]
ys = [at(0, y)[1] for y in (-1.3, 1.95, 3.85, 5.75, 7.65, 9.55, 11.45)]
lay['paths'] = W.grid_graph(xs, ys)
pack = W.set_layout(WID, 'factory.glb', round(FLOOR * W.S, 2), 36, lay, camera=W.blender_camera((22, -20, 21), (0.0, 0.4, 0.8), 34))
b = pack['buildings']; KS = round(W.S, 2)
LINE = [[Fk + '/machine', -2.0, 0, 90], [Fk + '/conveyor', -1.0, 0, 90], [Fk + '/conveyor', 0, 0, 90], [Fk + '/conveyor', 1.0, 0, 90],
        [Fk + '/hopper-square', 2.0, 0], [Fk + '/robot-arm-a', 0.6, -0.95, 180, 0.8]]
b['projects'] = [{'parts': LINE + [[Fk + '/box-small', -0.5, 0, 5, 0.9, 0.4]], 'scale': KS},
                 {'parts': [p if 'conveyor' not in p[0] else [Fk + '/conveyor-stripe', *p[1:]] for p in LINE], 'scale': KS},
                 {'parts': LINE[:-1] + [[Fk + '/robot-arm-b', 0.6, -0.95, 180, 0.8], [Fk + '/box-small', 0.4, 0, -6, 0.9, 0.4]], 'scale': KS}]
b['summit'] = {'parts': [[Fk + '/screen-wide', 0, 0]], 'scale': KS}
for k in ('forge', 'library', 'beacon', 'archive', 'aviary', 'agora'): b[k]['scale'] = KS
b['hotel'] = {'parts': [['car-kit/truck', 0, 0, 0, 0.6], ['car-kit/truck', 2.0, 0, 0, 0.6]], 'scale': KS}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

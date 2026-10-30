# Restaurant Kitchen, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t08_kitchen_polished.py):
# a floating restaurant on a brick terrace. At the back the kitchen: black-and-white tiles on a dark base, two
# tiled walls, the line of cabinets, stoves, sinks and the big fridge along the back wall with pots on the
# shelf, the steel pass with heat lamps and pendant lamps (the summit), crates by the back door. In front the
# terrace under two strings of lights, with bushes and the takeout bench. The app adds the dining tables with
# parasols where the mockup set them (projects, two rows and two by the windows), the grill, recipe shelf and
# walk-in fridge in the back line (workshops), the front-window bar, the ticket rail and takeout (hotel).
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as PL
import bpy

WID = 'kitchen'
random.seed(8)
L.reset()
F, FD = 'furniture-kit', 'food-kit'
K = 2.2
KX, KY, KZ = -6.4, -2.6, 0.1
tw, tb = L.mat('tilew', (0.92, 0.92, 0.9)), L.mat('tileb', (0.18, 0.2, 0.24))
steel = L.mat('steel', (0.75, 0.77, 0.8), metal=0.8, rough=0.3); wallm = L.mat('wall', (0.93, 0.9, 0.84))
heat = L.mat('heat', (1, 0.45, 0.15), emit=6)
before = set(bpy.data.objects)
for x in range(16):
    for y in range(11):
        L.box((x * 0.8 + 0.4, y * 0.8 + 0.4, -0.02), (0.8, 0.8, 0.04), tw if (x + y) % 2 else tb, name='flat-tile')
L.box((6.4, 8.85, 1.6), (12.8, 0.1, 3.2), wallm, name='wall'); L.box((-0.05, 4.4, 1.6), (0.1, 8.8, 3.2), wallm, name='wall')
# the back line, leaving room where the grill, the recipe shelf and the walk-in fridge stand (the app's workshops)
GAPS = ((1.0, 2.8), (4.6, 6.3), (8.6, 10.9))
x = 0.3
for name in ['kitchenCabinetDrawer', 'kitchenStove', 'kitchenCabinet', 'kitchenStoveElectric', 'kitchenStove', 'kitchenCabinet', 'kitchenStove', 'kitchenSink', 'kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenCabinet', 'kitchenSink']:
    if not any(a <= x + 0.47 <= b for a, b in GAPS): L.add(F, name, (x, 7.75, 0), 0, K)
    x += 0.43 * K
L.box((5.2, 8.7, 2.3), (9.5, 0.25, 0.05), L.mat('shelf', (0.45, 0.3, 0.2)))
for i, n in enumerate(['pot', 'pot-stew', 'frying-pan', 'pot', 'bowl', 'pan', 'pot-stew', 'cutting-board', 'bottle-oil', 'pot']):
    L.add(FD, n, (0.9 + i * 0.95, 8.7, 2.33), random.uniform(0, 360), 0.85)
# the pass: finished orders under heat lamps
L.box((5.2, 4.2, 0.48), (7.0, 0.9, 0.96), steel, bevel=0.03, name='pass')
L.box((5.2, 4.2, 2.2), (7.0, 0.25, 0.08), steel)
for lx in (2.4, 4.2, 6.0, 7.8):
    L.cyl((lx, 4.2, 2.0), 0.18, 0.3, heat, verts=16, name='lamp')
for px, food in ((2.2, 'burger-cheese'), (3.3, 'pizza'), (4.5, 'sushi-salmon'), (5.8, 'pancakes'), (7.0, 'donut-sprinkles')):
    L.add(FD, 'plate-dinner', (px, 4.2, 0.97), 0, 1.1); L.add(FD, food, (px, 4.2, 1.0), random.uniform(0, 360), 1.1)
    L.box((px, 3.82, 1.05), (0.34, 0.02, 0.22), L.mat('card', (0.98, 0.96, 0.9)))
L.sphere((8.5, 4.3, 1.05), 0.12, L.mat('bell', (0.95, 0.75, 0.2), metal=0.9, rough=0.25))
for cx, cy in ((11.3, 7.9), (12.1, 7.9)): L.box((cx, cy, 0.25), (0.5, 0.5, 0.5), L.mat('crate', (0.55, 0.4, 0.25)))
root = bpy.data.objects.new('restaurant', None); bpy.context.scene.collection.objects.link(root)
for o in set(bpy.data.objects) - before:
    if o.parent is None and o is not root: o.parent = root
root.location = (KX, KY, KZ)

R = 9.6
PL.diorama(R, square=True, top=(0.75, 0.67, 0.57))
for k in range(-9, 10):  # the terrace's brick courses
    L.box((0, k + 0.5, 0.002), (2 * R, 0.02, 0.003), L.mat('mortar', (0.55, 0.48, 0.42)), name='flat-brick')
L.box((0, 1.8, 0.04), (12.9, 8.9, 0.08), L.mat('kfloorbase', (0.3, 0.3, 0.32)))
# string lights over the terrace, posts at the corners
for y in (-4.4, -8.6):
    pts = PL.wire((-8.8, y, 2.6), (8.8, y, 2.6), sag=0.5)
    for p in pts[2:-2:3]: L.sphere((p[0], p[1], p[2] - 0.06), 0.06, L.mat('bulbm', (1, 0.8, 0.45), emit=6), name='bulb')
    for x in (-8.8, 8.8): L.cyl((x, y, 1.3), 0.05, 2.6, L.mat('postk', (0.2, 0.2, 0.22)), verts=8)
L.add('fantasy-town-kit', 'stall-bench', (8.4, -1.6, 0.0), 0, 1.8)
for x, y in ((8.4, -3.4), (-8.4, -2.5), (-8.4, 6.5), (8.6, 6.8), (8.4, -9.0), (-8.6, -9.0)):
    L.add('nature-kit', 'plant_bushDetailed', (x, y, 0), random.uniform(0, 360), 2.4)
for x in (-4.0, -2.2, -0.4):
    L.cyl((x, 1.6, 3.4), 0.006, 1.0, L.mat('cord', (0.1, 0.1, 0.1)), verts=4)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.32, radius2=0.08, depth=0.3, location=(x, 1.6, 2.85)); bpy.context.object.data.materials.append(L.mat('shade', (0.15, 0.32, 0.3), rough=0.5))
    L.sphere((x, 1.6, 2.68), 0.08, L.mat('pend', (1, 0.82, 0.6), emit=5), name='bulb')
PL.regrade_greens()

# ---- layout -----------------------------------------------------------------------------------------------------
def kit(x, y): return (x + KX, y + KY)
TABLES = [(-5.6, -6.0), (-2.0, -6.4), (1.6, -6.0), (5.2, -6.4), (-7.2, -8.6 + 0.4), (-3.6, -8.4), (0.0, -8.4), (3.6, -8.4), (7.2, -8.2),
          kit(11.0, 2.8), kit(11.4, 0.9), (-8.2, -6.2), (8.2, -6.0)]
slots = [W.spot(x, y) for x, y in TABLES]
for s in slots: s['face'] = 90
lay = {'summit': [round(kit(5.2, 4.2)[0] * W.S, 2), round((KZ + 0.96) * W.S, 2), round(-kit(5.2, 4.2)[1] * W.S, 2)],
       'tools': {'forge': W.spot(*kit(1.9, 7.75), look=kit(1.9, 0)), 'library': W.spot(*kit(5.45, 7.75), look=kit(5.45, 0)),
                 'archive': W.spot(*kit(9.7, 7.75), look=kit(9.7, 0)), 'beacon': W.spot(*kit(1.3, 1.3), look=kit(1.3, -5)),
                 'aviary': W.spot(*kit(11.2, 5.6), look=kit(5, 5.6))},
       'projectSlots': slots, 'agora': W.spot(*kit(3.4, 2.3), look=kit(3.4, -3)), 'hotel': W.spot(7.9, -1.9, look=(0, -1.9)), 'ringRoad': 14}
nodes = [kit(0.6, 6.3), kit(5.2, 6.3), kit(10.4, 6.3), kit(0.6, 2.9), kit(5.2, 2.9), kit(9.4, 2.9), kit(12.4, 2.9), kit(12.4, 6.3),
         (-8.9, -4.9), (-3.8, -4.9), (0.0, -4.9), (3.4, -4.9), (7.0, -4.9), (-8.9, -7.3), (-3.8, -7.3), (0.0, -7.3), (3.4, -7.3), (7.0, -7.3), (8.9, -4.9)]
edges = [(0, 1), (1, 2), (3, 4), (4, 5), (5, 6), (6, 7), (2, 7), (0, 3), (8, 9), (9, 10), (10, 11), (11, 12), (12, 18), (13, 14), (14, 15), (15, 16), (16, 17),
         (8, 13), (9, 14), (10, 15), (11, 16), (12, 17), (3, 9), (4, 10), (5, 11), (6, 18)]
lay['paths'] = W.graph(nodes, edges)
pack = W.set_layout(WID, 'kitchen.glb', round((KZ + 0.02) * W.S, 2), 34, lay, camera={**W.blender_camera((20, -19, 19.5), (0.2, -0.6, 0.0), 42), 'portrait': 1.18})
b = pack['buildings']; KS = round(1.5 * W.S, 2); KK = round(K * W.S, 2)
COLS = ['#e05a8a', '#e04a3a', '#3f7fe6', '#f0b62a', '#4cb35a', '#9a80d8']
def table(food, parasol):
    p = [[F + '/tableRound', 0, 0], [F + '/chair', -0.15, 0.8], [F + '/chair', -0.15, -1.1, 180], [F + '/chair', -1.1, -0.15, -90], [F + '/chair', 0.8, -0.15, 90],
         [FD + '/plate-dinner', 0.2, -0.3, 0, 0.6, 0.37], [FD + '/' + food, 0.2, -0.3, 0, 0.6, 0.39]]
    if parasol: p.append(['@parasol:' + parasol, 0.0, -0.2])  # the mockup's big coloured parasols (kitworld.js draws them)
    return {'parts': p, 'scale': KS}
b['projects'] = [table('cupcake', '#e07fb8'), table('burger', '#e8735f'), table('sushi-salmon', '#5b8fe0'), table('salad', '#7fcf6a'), table('pancakes', '#f0b62a')]
b['summit'] = {'parts': [[F + '/rugDoormat', 0, 0]], 'scale': KS}
b['forge'] = {'parts': [[F + '/kitchenStove', 0, 0], [F + '/kitchenStove', 0.43, 0], [F + '/hoodLarge', 0.2, 0, 0, 1, 0.9]], 'scale': KK}
b['library'] = {'parts': [[F + '/kitchenCabinet', 0, 0], [F + '/kitchenCabinetUpperDouble', 0, 0, 0, 1, 0.9], [F + '/kitchenCabinet', 0.43, 0]], 'scale': KK}
b['archive'] = {'parts': [[F + '/kitchenFridgeLarge', 0, 0], [F + '/kitchenFridge', 0.55, 0]], 'scale': KK}
b['beacon'] = {'parts': [[F + '/kitchenBar', 0, 0], [F + '/kitchenBar', 0.43, 0], [F + '/stoolBar', 0.2, 0.3], [F + '/stoolBar', 0.6, 0.3]], 'scale': KK}
b['aviary'] = {'parts': [[F + '/desk', 0, 0], [F + '/laptop', 0.45, -0.35, 180, 1, 0.38], [F + '/chairDesk', 0.4, 0.4, 180]], 'scale': KK}
b['agora'] = {'parts': [[F + '/kitchenBar', 0, 0], [F + '/kitchenBar', 0.43, 0], [F + '/kitchenBar', 0.86, 0]], 'scale': KK}
b['hotel'] = {'parts': [['mini-market/cash-register', 0, 0]], 'scale': KS}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

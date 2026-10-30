# Bus Lines, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t04_buses_polished.py): a little
# town on an oval floating green. The same Kenney road grid (two long roads joined by three cross streets),
# street lamps, the depot lot with its painted bays and sleeping buses (the summit), the coach park with the
# visitors' coaches (hotel), rows of suburban houses top and bottom, trees and flowers. The app adds a stop in
# its route colour for every project along the roads (the mockup's six and more like them), the workshops on
# the mockup's commercial plots and the interchange at the top crossroads (agora). People walk the roads.
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as P
import bpy

WID = 'buses'
random.seed(11)
L.reset()
RD = 'city-kit-roads'; T = 3.0; K = 0.6
grass = L.mat('grass', (0.24, 0.47, 0.15)); lot = L.mat('lot', (0.36, 0.37, 0.4)); paint = L.mat('paint', (0.95, 0.95, 0.9))
glass = L.mat('glass', (0.12, 0.16, 0.22), rough=0.1); roofm = L.mat('roof', (0.95, 0.95, 0.95)); dark = L.mat('tyre', (0.08, 0.08, 0.09))
before = set(bpy.data.objects)
xs, ys = (-12, 0, 12), (0, 12)
AGORA_T = (0, 12)
for y in ys:
    for i in range(-7, 8):
        x = i * T
        if (x, y) == AGORA_T: continue  # the interchange (agora) stands on this crossroads
        L.add(RD, 'road-crossroad' if x in xs else 'road-straight', (x, y, 0), 0, T)
for x in xs:
    for j in range(1, 4): L.add(RD, 'road-straight', (x, j * T, 0), 90, T)
for x in (-21, -15, -9, -3, 3, 9, 15, 21):
    for y in (-2.1, 2.1, 9.9, 14.1):
        if random.random() < 0.5: L.add(RD, 'light-square', (x, y, 0), 90 if y in (2.1, 14.1) else -90, T * 0.9)

def bus(x, y, rot, col, coach=False):
    body = L.mat('bus%d' % random.randrange(1 << 30), col if not coach else (0.96, 0.96, 0.98))
    root = bpy.data.objects.new('bus', None); bpy.context.scene.collection.objects.link(root)
    parts = [L.box((0, 0, 0.75), (1.25, 3.6, 1.0), body, bevel=0.12), L.box((0, 0, 1.28), (1.2, 3.4, 0.06), roofm),
             L.box((0, 0.1, 0.95), (1.27, 3.0, 0.38), glass), L.box((0, -1.81, 0.92), (1.05, 0.04, 0.42), glass)]
    if coach: parts.append(L.box((0, 0, 0.55), (1.27, 3.62, 0.12), L.mat('stripe', (0.15, 0.35, 0.8))))
    for wx in (-0.6, 0.6):
        for wy in (-1.15, 1.15): parts.append(L.cyl((wx, wy, 0.28), 0.28, 0.2, dark, rot=(0, math.radians(90), 0)))
    for p in parts: p.parent = root
    root.location = (x, y, 0); root.rotation_euler.z = math.radians(rot)
# the depot (summit): buses asleep in painted bays
L.box((19, 5.2, 0.01), (9, 7, 0.02), lot, name='flat-lot')
for i in range(4): L.box((15.5 + i * 2.2, 5.2, 0.03), (0.08, 5.0, 0.01), paint, name='flat-paint')
for x, col in ((16.6, (0.95, 0.7, 0.1)), (18.8, (0.2, 0.5, 0.9)), (21.0, (0.85, 0.3, 0.75))): bus(x, 5.2, 0, col)
# the coach park (hotel)
L.box((-19, 6.2, 0.01), (7, 6, 0.02), lot, name='flat-lot')
for x in (-20.6, -18.2, -15.8): bus(x, 6.2, 0, None, coach=True)
# the town round the network
SU = 'city-kit-suburban'
houses = ['building-type-a', 'building-type-c', 'building-type-e', 'building-type-g', 'building-type-j', 'building-type-m', 'building-type-p', 'building-type-s']
for x in range(-21, 24, 4):
    for y in (-6.5, 18.5):
        if (x / 26.5) ** 2 + ((y - 6) / 16.5) ** 2 > 1: continue
        L.add(SU, random.choice(houses), (x + random.uniform(-0.4, 0.4), y, 0), 180 if y < 0 else 0, 2.4)
for _ in range(70):
    x, y = random.uniform(-24, 24), random.uniform(-8, 20)
    if any(abs(y - ry) < 2.6 for ry in ys) or any(abs(x - rx) < 2.6 for rx in xs): continue
    if (x / 24.5) ** 2 + ((y - 6) / 13.5) ** 2 > 1: continue
    if abs(x - 19) < 5 and abs(y - 5.2) < 4 or abs(x + 19) < 4 and abs(y - 6.2) < 3.5: continue
    if 2.5 < y < 9.5 and abs(x) < 10.5: continue  # the commercial plots (workshops)
    L.add('nature-kit', random.choice(['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat', 'tree_oak_fall']), (x, y, 0), random.uniform(0, 360), random.uniform(3.2, 4.2))
town = bpy.data.objects.new('town', None); bpy.context.scene.collection.objects.link(town)
for o in set(bpy.data.objects) - before:
    if o.parent is None and o is not town: o.parent = town
town.scale = (K, K, K); town.location = (0, -6 * K, 0.0)

# ---- the oval green ---------------------------------------------------------------------------------------------
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=1, depth=0.16, location=(0, 0, -0.09)); top = bpy.context.object
top.scale = (16.6, 10.6, 1); top.data.materials.append(grass); top.name = 'flat-green'
for z, d, s, col in ((-0.55, 0.8, 0.997, (0.42, 0.26, 0.15)), (-1.05, 0.25, 0.985, (0.5, 0.47, 0.44))):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=1, depth=d, location=(0, 0, z)); o = bpy.context.object; o.scale = (16.6 * s, 10.6 * s, 1); o.data.materials.append(L.mat('soil%.1f' % z, col, rough=0.95))
bpy.ops.mesh.primitive_cone_add(vertices=128, radius1=1, radius2=0.1, depth=3.4, location=(0, 0, -2.85), rotation=(math.pi, 0, 0)); o = bpy.context.object; o.scale = (16.2, 10.3, 1); o.data.materials.append(L.mat('under', (0.32, 0.19, 0.11), rough=0.95))
for i in range(50):
    a = random.uniform(0, 2 * math.pi); L.add('nature-kit', random.choice(['rock_largeA', 'rock_largeB', 'stone_largeA']), (math.cos(a) * 16.2, math.sin(a) * 10.3, -random.uniform(0.4, 1.4)), random.uniform(0, 360), random.uniform(1.4, 2.4))
def busy(x, y):
    if abs(y + 3.6) < 1.3 or abs(y - 3.6) < 1.3: return True
    if abs(y) < 3.6 and min(abs(x - rx) for rx in (-7.2, 0, 7.2)) < 1.3: return True
    if abs(abs(x) - 11.4) < 3.2 and abs(y + 0.3) < 2.4: return True
    if abs(abs(y) - 7.5) < 1.0 and abs(x) < 12: return True
    if abs(y + 2.1) < 0.9 or abs(y - 2.1) < 0.9 or abs(y - 5.1) < 0.9 or abs(y + 5.1) < 0.9: return True  # stops along the roads
    return (x / 16.0) ** 2 + (y / 10.1) ** 2 > 1
P.scatter(420, 0, 16.5, ['grass_large', 'grass', 'flower_redA', 'flower_yellowB', 'flower_purpleA', 'plant_bushDetailed', 'plant_bush'], (1.3, 2.0), skip=busy, square=True)
P.regrade_greens(skip=('grass',))

# ---- layout (town units → the green) ----------------------------------------------------------------------------------
def tw(x, y): return (x * K, (y - 6) * K)
STOPS = [(-16.5, 2.4, 1), (-4.5, 2.4, 1), (7.5, 2.4, 1), (-16.5, 14.4, 1), (4.5, 14.4, 1), (16.5, 14.4, 1),   # the mockup's six
         (-19.5, -2.4, -1), (-7.5, -2.4, -1), (4.5, -2.4, -1), (16.5, -2.4, -1), (-7.5, 9.6, -1), (7.5, 9.6, -1), (-19.5, 9.6, -1)]
slots = []
for x, y, f in STOPS:
    s = W.spot(*tw(x, y), look=tw(x, y - 3 * f)); slots.append(s)
TOOLS = {'forge': (-8, 4.5), 'library': (-4, 8.5), 'beacon': (4, 4.5), 'archive': (8, 9), 'aviary': (6.4, 6.0)}
lay = {'summit': [round(tw(18.8, 5.2)[0] * W.S, 2), 0.1, round(-tw(18.8, 5.2)[1] * W.S, 2)],
       'tools': {k: W.spot(*tw(x, y), look=tw(x, 0)) for k, (x, y) in TOOLS.items()}, 'projectSlots': slots,
       'agora': W.spot(*tw(*AGORA_T)), 'hotel': W.spot(*tw(-18.2, 2.6), look=tw(-18.2, 0)), 'ringRoad': 14}
X = [-21, -16.5, -12, -7.5, -4.5, 0, 4.5, 7.5, 12, 16.5, 21]
nodes = [tw(x, y) for y in (0, 12) for x in X] + [tw(x, 6) for x in (-12, 0, 12)]
n = len(X)
edges = [(j * n + i, j * n + i + 1) for j in range(2) for i in range(n - 1)]
for k, x in enumerate((-12, 0, 12)):
    i = X.index(x); edges += [(i, 2 * n + k), (2 * n + k, n + i)]
lay['paths'] = W.graph(nodes, edges)
pack = W.set_layout(WID, 'buses.glb', 0.1, 50, lay, camera=W.blender_camera((4, -28, 23), (0, 0.6, -0.8), 32))
b = pack['buildings']; KS = round(K * W.S, 2)
ROUTES = ['#d94dbf', '#e64033', '#3380e6', '#f2b31a', '#40b359', '#26b3cc', '#9a66e6']
b['projects'] = [{'parts': [['@shelter:' + c, 0, 0]], 'scale': KS} for c in ROUTES]
b['summit'] = {'parts': [['city-kit-roads/sign-highway', 0, 0]], 'scale': round(K * 1.6 * W.S, 2)}
b['agora'] = {'m': 'city-kit-roads/road-roundabout', 'scale': round(T * K * W.S, 2)}
b['hotel'] = {'parts': [['city-kit-roads/road-sign-street', 0, 0]], 'scale': round(K * 2.2 * W.S, 2)}
COM = ['building-a', 'building-c', 'building-e', 'building-g', 'building-b']
for k, m in zip(('forge', 'library', 'beacon', 'archive', 'aviary'), COM):
    b[k] = {'m': 'city-kit-commercial/' + m, 'scale': round(2.8 * K * W.S, 2)}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

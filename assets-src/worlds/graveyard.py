# Haunted Cemetery, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t09_graveyard_polished.py):
# a dark round hill with a cross of flagstone paths, a stone wall round the rim and an iron fence with its gate
# at the front, rows of graves, pines and dead trees, carved pumpkins, lamp posts, candles and fireflies. The
# great crypt at the head of the path is the summit; the app adds the crypts (projects, the mockup's six and
# more on the same ground), small shrines for the workshops, the keeper's post by the gate (agora) and the
# vampires' spot outside it (hotel). Built at the mockup's own coordinates and scaled to the other worlds' size.
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as PL
import bpy

WID = 'graveyard'
random.seed(13)
L.reset()
G = 'graveyard-kit'
F = 10.0 / 14.5            # mockup units → this world's Blender units
PL.diorama(14.5, top=(0.1, 0.15, 0.09), soil=(0.2, 0.15, 0.12), under=(0.12, 0.09, 0.08), band=(0.25, 0.25, 0.28))
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and abs(o.location.z + 0.08) < 0.01: o.name = 'flat-ground'
flag = L.mat('flagstone', (0.28, 0.27, 0.29), rough=0.95)
L.box((0, -3.0, 0.01), (1.8, 21, 0.03), flag, name='flat-path'); L.box((0, 2, 0.01), (16, 1.5, 0.03), flag, name='flat-path')
for y in range(-13, 8):
    L.box((0, y + 0.5, 0.027), (1.8, 0.03, 0.004), L.mat('joint', (0.14, 0.14, 0.15)), name='flat-joint')

PROJECTS = [(-6, 3.8), (6, 3.8), (-6, -1.4), (6, -1.4), (-3.6, -5.5), (3.6, -5.5),
            (-9.6, -1.4), (9.6, -1.4), (-9.4, 4.6), (9.4, 4.6), (-3.4, 9.4), (3.4, 9.4), (-5.2, -8.8)]
TOOLS = {'forge': (-2.8, -0.8), 'library': (2.8, -0.8), 'beacon': (-3.0, 6.8), 'archive': (3.0, 6.8), 'aviary': (2.4, -7.2)}
SUMMIT, KEEPER, VAMPS = (0, 6.5), (1.6, -10.2), (-2.8, -12.8)
taken = PROJECTS + list(TOOLS.values()) + [SUMMIT]

# the great crypt (summit) stays part of the place, as in the mockup
L.add(G, 'crypt-large', (SUMMIT[0], SUMMIT[1], 0), 0, 2.0)
# graves, the gate and fence
for (x, y) in ((-9, -4), (-8, -6), (-10, -7.5), (9, -4), (8.6, -6.5), (10, -8), (-1.5, -9), (1.6, -9.4)):
    if any(math.hypot(x - a, y - b) < 2.0 for a, b in taken): continue
    L.add(G, random.choice(['gravestone-round', 'gravestone-cross', 'gravestone-bevel', 'gravestone-roof']), (x, y, 0), random.uniform(-15, 15), 2.0)
    L.add(G, 'grave', (x, y - 0.9, 0), 0, 2.0)
L.add(G, 'iron-fence-border-gate', (0, -11, 0), 0, 2.4)
for x in (-8, -5.6, -3.2, 3.2, 5.6, 8): L.add(G, 'iron-fence', (x, -11, 0), 0, 2.4)
for x, y in ((-12, 6), (-11, 1), (12, 6), (11.5, 0), (-13, -4), (13, -3), (-9, 9), (9, 9.5), (-3, 11.8), (4, 11.8)):
    L.add(G, random.choice(['pine', 'pine-crooked']), (x, y, 0), random.uniform(0, 360), 2.4)
for x, y in ((-1.2, -1.0), (1.2, -1.0), (-1.2, 1.0), (1.2, 1.0), (-8, 5.5), (8, 5.5)):
    L.add(G, 'pumpkin-carved', (x, y, 0), random.uniform(-30, 30), 2.2); L.sphere((x, y, 0.35), 0.1, L.mat('flame', (1, 0.6, 0.15), emit=6), name='bulb')
for x, y in ((-2, -7.5), (-2.2, 4.8), (2.2, 4.8)):
    L.add(G, 'lightpost-single', (x, y, 0), 0, 2.2); L.sphere((x, y - 0.35, 2.55), 0.1, L.mat('lamp', (1, 0.75, 0.4), emit=6), name='bulb')
L.add(G, 'candle-multiple', (0.9, 4.6, 0), 0, 2)
for a in range(0, 360, 9):
    if 250 < a < 290: continue
    x, y = PL.polar(a, 13.4)
    L.add(G, random.choice(['stone-wall', 'stone-wall', 'stone-wall-damaged']), (x, y, 0), a + 90, 2.4)
for _ in range(60):
    x, y = random.uniform(-11, 11), random.uniform(-9, 11)
    if abs(x) < 2.0 or abs(y - 2) < 1.4 or math.hypot(x, y) > 12: continue
    if any(math.hypot(x - cx, y - cy) < 3.0 for cx, cy in taken): continue
    L.add(G, random.choice(['gravestone-round', 'gravestone-cross', 'gravestone-bevel', 'gravestone-broken', 'gravestone-decorative']), (x, y, 0), random.uniform(-20, 20), 2.0)
for x, y in ((-10.5, 8.0), (10.8, 7.5), (-11.5, -6.0)):
    L.add(G, random.choice(['pine-fall-crooked', 'pine-crooked', 'trunk-long']), (x, y, 0), random.uniform(0, 360), 2.4)
ff = L.mat('firefly', (1.0, 0.95, 0.5), emit=12)
for _ in range(50): L.sphere((random.uniform(-12, 12), random.uniform(-10, 12), random.uniform(0.4, 3.0)), 0.03, ff, name='firefly')

# scale the mockup's ground down to this world's size
root = bpy.data.objects.new('cemetery', None); bpy.context.scene.collection.objects.link(root)
for o in list(bpy.context.scene.objects):
    if o.parent is None and o is not root: o.parent = root
root.scale = (F, F, F)

# ---- layout ------------------------------------------------------------------------------------------------------
def m(x, y): return (x * F, y * F)
front = lambda x, y: m(x, y - 3)
lay = {'summit': [round(SUMMIT[0] * F * W.S, 2), 0.1, round(-SUMMIT[1] * F * W.S, 2)],
       'tools': {k: W.spot(*m(x, y), look=front(x, y)) for k, (x, y) in TOOLS.items()},
       'projectSlots': [W.spot(*m(x, y), look=front(x, y)) for x, y in PROJECTS],
       'agora': W.spot(*m(*KEEPER), look=front(*KEEPER)), 'hotel': W.spot(*m(*VAMPS), look=m(0, -9)), 'ringRoad': 14}
nodes = [(0, -13), (0, -8.6), (0, -3.6), (0, 2), (0, 5.0), (-8, 2), (-4, 2), (4, 2), (8, 2),
         (-11, -3.6), (-7.8, -3.6), (-4.8, -3.6), (4.8, -3.6), (7.8, -3.6), (11, -3.6), (-8, 7.8), (-3.2, 7.8), (3.2, 7.8), (8, 7.8), (-7.2, -8.6)]
edges = [(0, 1), (1, 2), (2, 3), (3, 4), (6, 3), (5, 6), (3, 7), (7, 8), (9, 10), (10, 11), (11, 2), (2, 12), (12, 13), (13, 14),
         (10, 5), (13, 8), (15, 16), (16, 4), (4, 17), (17, 18), (15, 5), (18, 8), (19, 1), (19, 10)]
lay['paths'] = W.graph([m(x, y) for x, y in nodes], edges)
pack = W.set_layout(WID, 'graveyard.glb', 0.1, 34, lay, camera=W.blender_camera((8 * F, -31 * F, 21 * F), (0, -0.8 * F, 0.0), 36))
b = pack['buildings']; KS = round(F * W.S, 3)
b['projects'] = [{'m': G + '/crypt', 'scale': round(2.6 * KS, 2)}, {'m': G + '/crypt-large', 'scale': round(2.0 * KS, 2)},
                 {'m': G + '/crypt-small', 'scale': round(2.6 * KS, 2)}, {'m': G + '/crypt-a', 'scale': round(2.4 * KS, 2)}, {'m': G + '/crypt-b', 'scale': round(2.4 * KS, 2)}]
b['summit'] = {'parts': [[G + '/candle-multiple', 0, 0]], 'scale': round(2.0 * KS, 2)}
for k, parts in {'forge': [[G + '/fire-basket', 0, 0]], 'library': [[G + '/altar-wood', 0, 0]], 'beacon': [[G + '/pillar-obelisk', 0, 0]],
                 'archive': [[G + '/urn-square', 0, 0], [G + '/urn-round', 0.6, 0.1]], 'aviary': [[G + '/lantern-candle', 0, 0], [G + '/cross-column', 0.6, 0]],
                 'agora': [[G + '/bench', 0, 0], [G + '/shovel-dirt', 0.8, 0.2]], 'hotel': [[G + '/coffin-old', 0, 0], [G + '/coffin', 0.9, 0.1]]}.items():
    b[k] = {'parts': parts, 'scale': round(2.2 * KS, 2)}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

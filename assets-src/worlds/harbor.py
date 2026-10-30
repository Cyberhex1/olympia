# Pirate Harbor, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t06_harbor_polished.py): a
# floating disc of sea with a shallows ring and a sandy island in the middle, grass and palms on it, crates,
# barrels and cannons, lanterns round the shore, plank docks running out to sea with flags on them, rocks in the
# bay and sailboats offshore. The lighthouse fort is the summit; the app moors a ship at a dock for every
# project (the mockup's docks and more round the island), the quay dock is the agora and the ghost ship at its
# own dock the hotel; the workshops stand on the sand. Built at the mockup's coordinates, scaled to fit.
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as PL
import bpy

WID = 'harbor'
random.seed(6)
L.reset()
P = 'pirate-kit'
F = 10.0 / 20.5
wm = L.mat('water', (0.015, 0.2, 0.4), rough=0.08)
PL.diorama(20.5, top_mat=wm, soil=(0.38, 0.27, 0.18), under=(0.3, 0.2, 0.13), rocks=False)
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o.data.materials and o.data.materials[0] is wm: o.name = 'water-sea'
for i in range(60):
    a = random.uniform(0, 360); x, y = PL.polar(a, 20.1)
    L.add('nature-kit', random.choice(['rock_largeA', 'rock_largeB', 'rock_largeC']), (x, y, -random.uniform(1.9, 3.0)), random.uniform(0, 360), random.uniform(2.4, 3.6))
L.cyl((0, 0, -0.04), 14, 0.04, L.mat('shallow2', (0.08, 0.58, 0.62), rough=0.1), verts=96, name='water-shallow')
# the island
sand = L.mat('sand', (0.86, 0.68, 0.42), rough=0.95)
L.cyl((0, 0, 0.04), 8.6, 0.16, sand, verts=64, name='flat-sand')
for x, y, r in ((0, 0, 0), (-6, 2, 40), (6, 1, -30), (0, 6, 90), (-3, -4, 10), (4, -4, -20), (-8, -3, 70), (8, 6, 15)):
    L.add(P, 'patch-sand', (x, y, -0.2), r, 1.25)
for x, y, r in ((-2, 2, 0), (3, 3, 0), (0, 7, 0)):
    L.add(P, 'patch-grass-foliage', (x, y, -0.05), r, 1.0)
SUMMIT = (0, 2.5)
TOOLS = {'forge': (-4.2, -1.8), 'library': (4.2, 1.0), 'beacon': (-4.0, 4.8), 'archive': (1.8, -1.2), 'aviary': (-1.6, -5.0)}
taken = list(TOOLS.values()) + [SUMMIT]
for x, y in ((-6.0, 1.6), (-1.5, 7.5), (5, 5.5), (7.0, 2.6), (2, 8), (-6.4, -2.6), (5.6, -2.8)):
    if any(math.hypot(x - a, y - b) < 2.0 for a, b in taken): continue
    L.add(P, random.choice(['palm-straight', 'palm-bend', 'palm-detailed-bend']), (x, y, 0), random.uniform(0, 360), 1.0)
for x, y in ((-2.2, -1.2), (2.6, 0.8), (-1.2, 0.4), (-6.4, -4.4), (6.4, -4.6), (0.6, 5.0)):
    if any(math.hypot(x - a, y - b) < 1.6 for a, b in taken): continue
    L.add(P, random.choice(['barrel', 'crate', 'crate-bottles', 'cannon']), (x, y, 0), random.uniform(0, 360), 1.0)

# docks round the island: 13 for ships, the quay at the front (agora) and the ghost ship's (hotel)
DOCKS = []
for k in range(15):
    a = 270 + k * 24
    DOCKS.append(a % 360)
QUAY, GHOST = DOCKS[0], DOCKS[9]
ships = []
for i, ang in enumerate(DOCKS):
    a = math.radians(ang); ux, uy = math.cos(a), math.sin(a)
    n = 3 if i % 2 else 2
    for j in range(n):
        d = 8.6 + j * 2.4
        L.add(P, 'structure-platform-dock', (ux * d, uy * d, -0.3), ang + 90, 1.0)
    end = 8.6 + (n - 1) * 2.4
    L.add(P, 'flag-high', (ux * 7.6 + uy * 1.3, uy * 7.6 - ux * 1.3, 0), ang, 1.0)
    x, y = PL.polar(ang, 7.9); L.add('fantasy-town-kit', 'lantern', (x, y, 0), 0, 1.6); L.sphere((x, y, 2.3), 0.12, L.mat('lamp', (1, 0.75, 0.4), emit=6), name='bulb')
    ships.append((ang, (ux * (end - 0.6) - uy * 3.0, uy * (end - 0.6) + ux * 3.0), (ux * end, uy * end)))
# rocks in the bay and sailboats offshore, in the free water between the moorings
for x, y in ((-17.5, -6), (17.0, 6.5), (-6, 17.6), (8, -17.4)):
    L.add(P, random.choice(['rocks-a', 'rocks-b', 'rocks-c']), (x, y, -0.4), random.uniform(0, 360), 1.2)
for x, y, r in ((17.6, -9, 40), (-17.8, 3.5, 10)):
    L.add('watercraft-kit', random.choice(['boat-sail-a', 'boat-sail-b']), (x, y, -0.35), r, 1.1)
PL.regrade_greens(skip=('water', 'shallow2'))
root = bpy.data.objects.new('harbor', None); bpy.context.scene.collection.objects.link(root)
for o in list(bpy.context.scene.objects):
    if o.parent is None and o is not root: o.parent = root
root.scale = (F, F, F)

# ---- layout ------------------------------------------------------------------------------------------------------
def m(x, y): return (x * F, y * F)
proj = [s for s in ships if s[0] not in (QUAY, GHOST)]
slots = []
for ang, (sx, sy), (ex, ey) in proj:
    s = W.spot(*m(sx, sy)); s['face'] = round((ang + 90) % 360, 1); slots.append(s)  # moored alongside, bow along the dock
q = [s for s in ships if s[0] == QUAY][0]; g = [s for s in ships if s[0] == GHOST][0]
lay = {'summit': [round(m(*SUMMIT)[0] * W.S, 2), 0.3, round(-m(*SUMMIT)[1] * W.S, 2)],
       'tools': {k: W.spot(*m(x, y), look=m(0, 0)) for k, (x, y) in TOOLS.items()},
       'projectSlots': slots, 'agora': W.spot(*m(*q[2])), 'hotel': W.spot(*m(*g[1])), 'ringRoad': 14}
nodes, edges = [], []
for k in range(15):  # a path round the shore, and out along every dock
    nodes.append(PL.polar(DOCKS[k], 7.4))
for k in range(15): edges.append((k, (k + 1) % 15))
for k, (ang, ship, end) in enumerate(ships):
    nodes.append(end); edges.append((k, len(nodes) - 1))
nodes.append((0, 0)); c = len(nodes) - 1
for k in range(0, 15, 3): edges.append((k, c))
lay['paths'] = W.graph([m(x, y) for x, y in nodes], edges)
pack = W.set_layout(WID, 'harbor.glb', round(0.12 * F * W.S + 0.1, 2), 36, lay, camera=W.blender_camera((10 * F, -44 * F, 33 * F), (0, -1.8 * F, -1.5 * F), 34))
b = pack['buildings']; KS = round(F * W.S, 3)
b['projects'] = [{'m': P + '/' + mm, 'scale': round(sc * KS, 2), 'sink': round(0.6 * F * W.S, 2)} for mm, sc in
                 (('ship-pirate-medium', 0.55), ('ship-small', 0.5), ('ship-pirate-small', 0.5), ('ship-medium', 0.5), ('ship-large', 0.45))]
b['hotel'] = {'m': P + '/ship-ghost', 'scale': round(0.55 * KS, 2), 'sink': round(0.6 * F * W.S, 2)}
b['summit'] = {'m': P + '/tower-complete-large', 'scale': round(0.9 * KS, 2)}
b['agora'] = {'parts': [[P + '/structure-platform', 0, 0], [P + '/barrel', 1.2, 0.8], [P + '/crate', -1.2, 0.8]], 'scale': round(1.0 * KS, 2)}
for k, parts in {'forge': [[P + '/structure', 0, 0], [P + '/barrel', 1.0, 0.3]], 'library': [[P + '/castle-window', 0, 0]], 'beacon': [[P + '/tower-watch', 0, 0]],
                 'archive': [[P + '/chest', 0, 0]], 'aviary': [[P + '/boat-row-large', 0, 0, 90], [P + '/boat-row-small', 1.2, 0.4, 70]]}.items():
    b[k] = {'parts': parts, 'scale': round((1.2 if k == 'archive' else 1.0) * KS, 2)}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

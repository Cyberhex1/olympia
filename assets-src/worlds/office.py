# The Office, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t03_office_polished.py):
# a cut-away office floor on a floating garden block. Same plank floor, window walls along the back and left
# with open bookcases, a coloured rug under every desk pod, the glass stand-up room with its table, chairs and
# whiteboard, the coffee corner, the visitors' lounge, potted plants and ceiling lamps, and the garden round it
# with trees, flowers and a paved path in. Only the people and the pods' desks are left out: the app adds the
# desk pods (projects, the mockup's own 4-desk pods), workshops and coworkers live, where the mockup put them.
# The floor is the mockup's 11 x 8 grown to 14 x 10 so all 13 project spots get a pod in the same grid.
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as P
import bpy

WID = 'office'
random.seed(3)
L.reset()
F, N = 'furniture-kit', 'nature-kit'
M = dict(sign=L.mat('sign', (0.15, 0.17, 0.22)), glass=L.mat('glass', (0.75, 0.88, 0.95), alpha=0.22, rough=0.05),
         wb=L.mat('wb', (0.97, 0.97, 0.95), emit=0.1), slab=L.mat('slab', (0.78, 0.76, 0.72), rough=0.9), lamp=L.mat('lamp', (1, 0.9, 0.7), emit=6))
RUGS = [L.mat('rug%d' % i, c, rough=1) for i, c in enumerate(((0.75, 0.42, 0.32), (0.32, 0.5, 0.62), (0.45, 0.58, 0.38), (0.82, 0.68, 0.38), (0.55, 0.42, 0.6)))]
woods = [L.mat('wood%d' % i, c, rough=0.6) for i, c in enumerate(((0.72, 0.52, 0.34), (0.66, 0.47, 0.3), (0.69, 0.5, 0.32)))]
carpet = L.mat('carpet', (0.32, 0.4, 0.53), rough=1)

Wd, D = 14, 10           # office floor in the mockup's units (it was 11 x 8)
K = 1.36                  # the mockup's office scale
OX, OY, OZ = -Wd / 2 * K, -D / 2 * K + 0.6, 0.12
def to_world(x, y): return (x * K + OX, y * K + OY)
GR = (Wd / 2) * K + 1.5   # garden half-width
P.diorama(GR, square=True, top=(0.24, 0.45, 0.14))
before = set(bpy.data.objects)

# ---- the floor, walls, bookcases (office units) -----------------------------------------------------------------
L.box((Wd / 2, D / 2, -0.06), (Wd + 0.6, D + 0.6, 0.2), M['slab'], bevel=0.04, name='slab')
for i in range(Wd * 3):
    L.box(((i + 0.5) / 3, D / 2, 0.05), (1 / 3 - 0.008, D, 0.03), woods[i % 3], name='flat-floor')
for x in range(Wd): L.add(F, 'wallWindow' if x % 2 else 'wall', (x, D, 0.04))
for y in range(D): L.add(F, 'wallWindow' if y % 2 else 'wall', (0, y + 1, 0.04), -90)
for x in (1.5, 3.5, 7.4, 11.2):
    L.add(F, 'bookcaseOpen', (x, D - 0.3, 0.04), 180)

# ---- desk pods: the mockup's grid, one rug per pod; the app stands the desks on them --------------------------
PODS = [(x, y) for y in (7.7, 5.2, 2.7) for x in (1.3, 4.6, 7.9)] + [(1.3, 0.4), (4.6, 0.4), (7.9, 0.4), (11.2, 7.7)]
# (each pod brings its own rug, so empty spots stay bare floor)

# ---- glass stand-up room (the summit): carpet, glass, two tables and chairs, the whiteboard ----------------------
gx0, gy0, gx1, gy1 = 10.4, 0.4, 13.6, 3.9
L.box(((gx0 + gx1) / 2, (gy0 + gy1) / 2, 0.07), (gx1 - gx0, gy1 - gy0, 0.01), carpet, name='flat-carpet')
for (a, b, sx, sy) in ((gx0, gy0, gx1 - gx0, 0.03), (gx0, gy1, gx1 - gx0, 0.03)): L.box((a + sx / 2, b, 0.65), (sx, sy, 1.2), M['glass'], name='glass')
L.box((gx0, (gy0 + gy1) / 2 + 0.7, 0.65), (0.03, gy1 - gy0 - 1.4, 1.2), M['glass'], name='glass')  # a gap to walk in
L.add(F, 'tableCross', (11.3, 1.8, 0.05)); L.add(F, 'tableCross', (12.2, 1.8, 0.05))
for cx, cy, r in ((11.4, 1.4, 0), (12.0, 1.4, 0), (12.6, 1.4, 0), (11.4, 2.8, 180), (12.2, 2.8, 180)): L.add(F, 'chair', (cx, cy, 0.05), r)
L.box((13.55, 2.15, 0.9), (0.04, 1.6, 0.8), M['wb'], name='whiteboard')
L.text('TODAY', (13.52, 2.15, 1.15), 0.12, M['sign'], rot=(90, 0, -90))

# ---- coffee corner, visitors' lounge, plants and ceiling lamps ----------------------------------------------------
L.add(F, 'kitchenCabinet', (0.05, 4.1, 0.04), 0); L.add(F, 'kitchenCabinet', (0.05, 4.55, 0.04), 0); L.add(F, 'kitchenCoffeeMachine', (0.15, 4.2, 0.47), 0)
L.add(F, 'rugRound', (11.9, 5.5, 0.066), 0)
for px, py in ((0.3, D - 0.4), (3.0, D - 0.4), (6.4, D - 0.4), (10.1, D - 0.4), (13.6, D - 0.4), (0.3, 0.3), (10.0, 0.3), (13.6, 4.4), (13.6, 6.6)):
    L.add(F, 'pottedPlant', (px, py, 0.04), random.uniform(0, 360), 1.3)
for x, y in ((3.9, 4.5), (7.2, 4.5), (3.9, 2.0), (7.2, 2.0), (10.5, 6.8)):
    L.add(F, 'lampSquareCeiling', (x, y, 2.4)); L.sphere((x + 0.25, y + 0.25, 2.3), 0.06, M['lamp'], name='bulb')

# move the office onto the centre of the base (like the mockup)
root = bpy.data.objects.new('office', None); bpy.context.scene.collection.objects.link(root)
for o in set(bpy.data.objects) - before:
    if o.parent is None and o is not root: o.parent = root
root.scale = (K, K, K); root.location = (OX, OY, OZ)
bpy.context.view_layer.update()

# ---- garden round the building -------------------------------------------------------------------------------------
lane_x = to_world(6.0, 0)[0]
P.scatter(260, 0, GR - 0.2, ['grass_large', 'flower_redA', 'flower_yellowB', 'plant_bushDetailed', 'grass_leafs'], (1.2, 2.0), square=True,
          skip=lambda x, y: (OX - 0.4 < x < OX + Wd * K + 0.4 and OY - 0.4 < y < OY + D * K + 0.4) or (abs(x - lane_x) < 0.9 and y < OY))
for x, y in ((-GR + 0.6, -GR + 0.7), (GR - 0.6, -GR + 0.7), (-GR + 0.5, GR - 0.6), (GR - 0.7, GR - 0.6), (-GR + 0.5, 0.0), (GR - 0.5, 0.4)):
    L.add(N, random.choice(['tree_oak', 'tree_default', 'tree_detailed']), (x, y, 0), random.uniform(0, 360), 1.6)
lane = L.box((to_world(6.0, 0)[0], (OY - GR) / 2, 0.01), (1.2, OY + GR, 0.03), L.mat('paving', (0.7, 0.66, 0.6), rough=0.9), name='flat-path')
P.regrade_greens(skip=('base-top',))

# ---- the layout, in the office's own places --------------------------------------------------------------------------
FLOOR = OZ + 0.05 * K + 0.02
def at(x, y): return to_world(x, y)
pods = [W.spot(*at(x + 0.78, y + 0.42)) for x, y in PODS]
for s in pods: s['face'] = 90                                     # every pod the mockup's way round
tools = {'forge': W.spot(*at(0.55, 4.3), look=at(3, 4.3)),          # the coffee corner
         'library': W.spot(*at(13.2, 9.0), look=at(13.2, 6)),       # bookcases, back right
         'beacon': W.spot(*at(13.4, 7.7), look=at(10, 7.7)),        # the window desk
         'archive': W.spot(*at(10.2, 9.1), look=at(10.2, 6)),       # filing, back wall
         'aviary': W.spot(*at(6.4, 9.15), look=at(6.4, 6))}         # post and printers, back wall
summit = list(at(11.9, 2.1))
ax, ay = 3.5, -1.2  # the stand-up corner: outside the front door in the garden
lay = {'summit': [round(summit[0] * W.S, 2), round(FLOOR * W.S, 2), round(-summit[1] * W.S, 2)],
       'tools': tools, 'projectSlots': pods,
       'agora': W.spot(*at(ax, ay), look=at(ax, 3)), 'hotel': W.spot(*at(11.9, 5.5), look=at(8, 5.5)),
       'ringRoad': 18}
# aisles between the pod rows and columns, the strip by the walls, out the front door
xs, ys = [0.75, 4.25, 7.55, 10.75, 13.2], [0.15, 2.3, 4.8, 7.3, 9.3]
g = W.grid_graph([at(x, 0)[0] for x in xs], [at(0, y)[1] for y in ys])
n = len(g['nodes']); g['nodes'].append([round(at(6.0, -1.0)[0] * W.S, 2), round(-at(6.0, -1.0)[1] * W.S, 2)])
g['edges'].append([[i for i, (x, z) in enumerate(g['nodes'][:n]) if abs(x - at(7.55, 0)[0] * W.S) < 0.1 and abs(z + at(0, 0.15)[1] * W.S) < 0.1][0], n])
lay['paths'] = g
CAM = W.blender_camera((14.5 * 1.12, -15.0 * 1.12, 15.5 * 1.12), (0.2, 0.0, -0.4), 33)
CAM['portrait'] = 1.18  # square floor: pull back a little more on tall phones
pack = W.set_layout(WID, 'office.glb', round(FLOOR * W.S, 2), 46, lay, camera=CAM)

# the pods and the stand-up table, as the app's buildings, in the mockup's own sizes
KS = round(K * W.S, 3)
def unit(x, flip):
    if not flip: return [[F + '/desk', x, 0], [F + '/computerScreen', x + 0.17, -0.26, 0, 1, 0.38], [F + '/chairDesk', x + 0.2, 0.38]]
    return [[F + '/desk', x + 0.73, -0.79, 180], [F + '/computerScreen', x + 0.56, -0.53, 180, 1, 0.38], [F + '/chairDesk', x + 0.53, -1.17, 180]]
pod = [p for c in (0, 0.78) for f in (False, True) for p in unit(c, f)]
b = pack['buildings']
b['projects'] = [{'parts': [[F + '/rugRectangle', 0.7, -0.45, 0, 1.25, 0.005]] + pod, 'scale': KS},
                 {'parts': [[F + '/rugRectangle', 0.7, -0.45, 0, 1.25, 0.005]] + pod + [[F + '/pottedPlant', 1.7, -0.4]], 'scale': KS}]
b['summit'] = {'parts': [[F + '/rugRound', 0, 0]], 'scale': KS * 0.6}
for k, parts in {'forge': [[F + '/kitchenCabinet', 0, 0], [F + '/kitchenCabinet', 0, -0.45], [F + '/kitchenCoffeeMachine', 0.1, -0.1, 0, 1, 0.43]],
                 'library': [[F + '/bookcaseOpen', 0, 0], [F + '/bookcaseOpen', 0.42, 0], [F + '/loungeChair', 0.2, 0.7, 180]],
                 'beacon': [[F + '/deskCorner', 0, 0], [F + '/computerScreen', 0.3, -0.3, 0, 1, 0.38], [F + '/computerScreen', 0.6, -0.55, -60, 1, 0.38], [F + '/chairDesk', 0.55, 0.3, 180]],
                 'archive': [[F + '/bookcaseClosedWide', 0, 0], [F + '/bookcaseClosedDoors', 0.85, 0], [F + '/cardboardBoxClosed', 0.3, 0.4]],
                 'aviary': [[F + '/sideTableDrawers', 0, 0], [F + '/sideTableDrawers', 0.5, 0], [F + '/cardboardBoxClosed', 0.2, 0.4], [F + '/coatRackStanding', 1.1, -0.1]],
                 'agora': [[F + '/rugRound', 0, 0], [F + '/tableCoffee', 0.35, -0.2], [F + '/loungeChair', -0.3, 0.4, 90], [F + '/loungeChair', 1.2, 0.4, -90]],
                 'hotel': [[F + '/loungeSofa', 0, 0], [F + '/tableCoffee', 0.4, 0.5], [F + '/lampSquareFloor', -0.4, -0.1]]}.items():
    b[k] = {'parts': parts, 'scale': KS}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

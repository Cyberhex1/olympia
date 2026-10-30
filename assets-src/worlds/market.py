# Farmers Market: a floating round of grass with a cobbled market square (mockup w01 / t01_market_polished).
# The maypole stands in the fountain (the summit) with bunting out to lamp posts between the stalls; timber
# houses ring the back, a lane with benches runs off the front, trees and flowers fill the rim.
# Stalls (projects), carts and the board (workshops, agora) and the campground (hotel) come from the pack.
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import bpy

WID = 'market'
random.seed(21)
L.reset()
pack = W.load_pack(WID)
spots = W.Spots(pack)
T, N, FD = 'fantasy-town-kit', 'nature-kit', 'food-kit'
R = pack['terrain']['radius'] / W.S + 0.3          # diorama radius
PLAZA = 7.25
lay = pack['terrain']['layout']

M = dict(
    grass=L.mat('grass', (0.2, 0.42, 0.1), rough=0.9), soil=L.mat('soil', (0.42, 0.26, 0.15), rough=0.95), soil2=L.mat('soil2', (0.32, 0.19, 0.11), rough=0.95),
    rockband=L.mat('rockband', (0.5, 0.47, 0.44), rough=0.9), board=L.mat('board', (0.24, 0.17, 0.12), rough=0.8),
    rope=L.mat('rope', (0.25, 0.2, 0.16)), bulb=L.mat('bulb', (1.0, 0.78, 0.45), emit=6), water=L.mat('water', (0.25, 0.55, 0.75), rough=0.05),
    cob1=L.mat('cobble', (0.62, 0.52, 0.42), rough=0.85), cob2=L.mat('cobble2', (0.54, 0.45, 0.37), rough=0.85), kerb=L.mat('kerb', (0.55, 0.5, 0.46), rough=0.9),
    road=L.mat('ringway', (0.47, 0.39, 0.32), rough=0.85), gold=L.mat('gold', (0.95, 0.75, 0.3), metal=0.8, rough=0.3),
)
FLAGS = [L.mat('flag%d' % i, c, rough=0.8) for i, c in enumerate(((0.9, 0.3, 0.25), (0.98, 0.78, 0.25), (0.35, 0.62, 0.85), (0.4, 0.7, 0.4), (0.95, 0.95, 0.9), (0.85, 0.45, 0.7)))]


def polar(a, r): return (math.cos(math.radians(a)) * r, math.sin(math.radians(a)) * r)


# ---- the diorama: grass top, soil strata, rocky underside ------------------------------------------------
L.cyl((0, 0, -0.08), R, 0.16, M['grass'], verts=96, name='flat-grass')
L.cyl((0, 0, -0.55), R - 0.05, 0.8, M['soil'], verts=96)
L.cyl((0, 0, -1.05), R - 0.25, 0.25, M['rockband'], verts=96)
bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=R - 0.3, radius2=1.2, depth=3.2, location=(0, 0, -2.75), rotation=(math.pi, 0, 0))
bpy.context.object.data.materials.append(M['soil2'])
for i in range(46):
    a = random.uniform(0, 360); x, y = polar(a, R - 0.4)
    L.add(N, random.choice(['rock_largeA', 'rock_largeB', 'rock_largeC', 'stone_largeA']), (x, y, -random.uniform(0.4, 1.4)), random.uniform(0, 360), random.uniform(1.2, 2.2))

# ---- cobbled square in paving rings, the walking ring a darker band ----------------------------------------
L.cyl((0, 0, -0.005), PLAZA + 0.25, 0.035, M['kerb'], verts=96, name='flat-kerb')
for i, r in enumerate([PLAZA - k * 0.42 for k in range(17)]):
    if r <= 0.2: break
    L.cyl((0, 0, 0.0 + i * 0.0004), r, 0.04, M['cob1'] if i % 2 == 0 else M['cob2'], verts=96, name='flat-cobble')
ring = spots.ring
L.cyl((0, 0, 0.012), ring + 0.32, 0.04, M['road'], verts=96, name='flat-ring')
L.cyl((0, 0, 0.013), ring - 0.32, 0.042, M['cob2'], verts=96, name='flat-cobble')

# ---- maypole in the fountain (the fountain itself is the summit, from the pack) ------------------------------
L.cyl((0, 0, 2.6), 0.07, 5.2, M['board'], verts=12, name='maypole')
L.sphere((0, 0, 5.25), 0.16, M['gold'])
L.cyl((0, 0, 0.36), 1.2, 0.04, M['water'], verts=48, name='water')

# ---- lamp posts between the stalls, carrying bunting from the maypole ---------------------------------------
def bunting(a, b, sag=0.6, flags=True):
    pts = []
    n = 26
    for i in range(n + 1):
        t = i / n
        pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - sag * 4 * t * (1 - t)))
    cu = bpy.data.curves.new('wire', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.012
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts): p.co = (*c, 1)
    ob = bpy.data.objects.new('wire', cu); bpy.context.scene.collection.objects.link(ob); cu.materials.append(M['rope'])
    if not flags: return pts
    verts, faces, mats = [], [], []
    dx, dy = b[0] - a[0], b[1] - a[1]; ln = math.hypot(dx, dy) or 1; ux, uy = dx / ln, dy / ln
    for i, p in enumerate(pts[1:-1]):
        k = len(verts)
        verts += [(p[0] - ux * 0.12, p[1] - uy * 0.12, p[2]), (p[0] + ux * 0.12, p[1] + uy * 0.12, p[2]), (p[0], p[1], p[2] - 0.3)]
        faces.append((k, k + 1, k + 2)); mats.append(i % len(FLAGS))
    me = bpy.data.meshes.new('flags'); me.from_pydata(verts, [], faces); me.update()
    fo = bpy.data.objects.new('flags', me); bpy.context.scene.collection.objects.link(fo)
    for m in FLAGS: me.materials.append(m)
    for poly, mi in zip(me.polygons, mats): poly.material_index = mi
    return pts

slots = sorted(lay['projectSlots'][:9], key=lambda s: s['theta'])
posts = []
for i, s in enumerate(slots):
    nxt = slots[(i + 1) % len(slots)]
    gap = (nxt['theta'] - s['theta']) % 360
    if gap > 45: continue
    th = s['theta'] + gap / 2
    x, y = W.to_b(th, 20.2)
    posts.append((x, y))
for x, y in posts:
    L.add(T, 'lantern', (x, y, 0), 0, 1.6)
    L.sphere((x, y, 2.2), 0.09, M['bulb'], name='bulb')
    bunting((0, 0, 5.0), (x, y, 2.35), sag=0.5)

# ---- timber houses ringing the back of the square -----------------------------------------------------------
WALLS = ['wall-wood', 'wall-wood-window-shutters', 'wall-wood-window-small', 'wall-wood-detail-cross']
ROOFS = ['roof-high-gable', 'roof-high-point', 'roof-high-gable-detail']
def house(theta, r, floors=2, H=1.45):
    cx, cy = W.to_b(theta, r * W.S); yaw = W.yaw_to_centre(theta)
    root = bpy.data.objects.new('house', None); bpy.context.scene.collection.objects.link(root)
    for f in range(floors):
        for side in range(4):
            name = 'wall-wood-door' if (f == 0 and side == 3) else ('wall' if f == 0 and side != 3 else random.choice(WALLS))
            w = L.add(T, name, (0, 0, f), side * 90 - 90, 1.0); w.parent = root
    rf = L.add(T, random.choice(ROOFS), (0, 0, floors), 0, 1.0); rf.parent = root
    if random.random() < 0.6:
        c = L.add(T, 'chimney', (0, 0.2, floors), 0, 1.0); c.parent = root
    root.location = (cx, cy, 0); root.rotation_euler.z = math.radians(yaw); root.scale = (H, H, H)
for th in (166, 182, 204, 220, 242, 258, 280, 296, 318, 334, 356, 12):
    x, y = W.to_b(th, 8.5 * W.S)
    if spots.clear(x, y, 0.4): house(th, 8.5, floors=random.choice((2, 2, 3)))

# ---- lanterns and a string of bulbs across the front of the square ----------------------------------------
fa, fb = W.to_b(62, 23.5), W.to_b(118, 23.5)
for x, y in (fa, fb):
    L.add(T, 'lantern', (x, y, 0), 0, 1.6); L.sphere((x, y, 2.2), 0.09, M['bulb'], name='bulb')
pts = bunting((fa[0], fa[1], 2.4), (fb[0], fb[1], 2.4), sag=0.7, flags=False)
for p in pts[2:-2:3]: L.sphere((p[0], p[1], p[2] - 0.06), 0.05, M['bulb'], name='bulb')

# ---- the lane off the front, with benches, barrels and bushes ------------------------------------------------
lx, ly = W.to_b(90, 30.5)
lane = L.box((lx, ly, 0.0), (1.5, 2.9, 0.04), M['cob1'], name='flat-lane')
for bx in (-1.05, 1.05):
    x, y = lx + bx, ly + 0.4
    if spots.clear(x, y): L.add(T, 'stall-bench', (x, y, 0), 90, 1.8)
for th, r in ((84, 25), (97, 26), (35, 26), (150, 24), (205, 24.5), (330, 24.5)):
    x, y = W.to_b(th, r)
    if spots.clear(x, y, 0.2): L.add(FD, 'barrel', (x, y, 0), random.uniform(0, 360), 0.75)

# ---- greenery around the rim ----------------------------------------------------------------------------------
TREES = ['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat', 'tree_oak_fall', 'tree_default_fall']
for th in range(0, 360, 14):
    x, y = W.to_b(th + random.uniform(-4, 4), random.uniform(30.6, 32.2))
    if not spots.clear(x, y, 0.5): continue
    if 35 < th < 145: L.add(N, 'plant_bushDetailed', (x, y, 0), random.uniform(0, 360), random.uniform(2.2, 2.8))  # keep the front open
    else: L.add(N, random.choice(TREES), (x, y, 0), random.uniform(0, 360), random.uniform(2.0, 2.7))
placed = 0
while placed < 190:
    a = random.uniform(0, 360); r = random.uniform(PLAZA + 0.35, R - 0.35)
    x, y = polar(a, r)
    if not spots.clear(x, y, 0.15): continue
    if 0 < a < 180 and 7.9 < r < 9.1: continue  # houses at the back
    L.add(N, random.choice(['grass_large', 'grass', 'grass_leafs', 'flower_redA', 'flower_yellowB', 'flower_purpleA', 'plant_bushDetailed']), (x, y, 0), random.uniform(0, 360), random.uniform(1.4, 2.2))
    placed += 1

W.regrade_greens()
W.export(WID, pack)

# In Elevation: Olympia sliced open (mockup 09-altitude). The front of the island is cut away, so its earth
# shows in pastel bands with two cosy chambers in it where sleeping threads curl up; a tall snow-capped
# mountain rises behind with the Acropolis on top, green hills at its feet, and a small islet floats off to
# the side. The temples, workshops and characters are Olympus's own; everything stands behind the cut.
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import bpy

WID = 'elevation'
random.seed(9)
L.reset()
SLOTS = [(190, 21), (217, 21), (244, 21), (271, 21), (298, 21), (325, 21), (352, 21), (205, 28), (240, 28.5), (300, 28.5), (335, 28), (172, 22), (8, 22)]
pack = W.set_terrain(WID, 'elevation.glb', 0.1, 31, 14.0,
                     dict(forge=(160, 9.5), library=(215, 9.5), beacon=(270, 9.5), archive=(325, 9.5), aviary=(20, 9.5)),
                     SLOTS, agora=(150, 18), hotel=(30, 25.5), summit_y=15.2,
                     camera={'pos': [0, 24, 104], 'target': [0, 3, 0], 'fov': 30})
spots = W.Spots(pack)
R = 9.6
CUT = -17.0 / W.S          # the slice: everything in front of this (towards the camera) is gone
grass = L.mat('grass', (0.42, 0.66, 0.32), rough=0.9)
earth = [L.mat('earth%d' % i, c, rough=0.95) for i, c in enumerate(((0.62, 0.4, 0.26), (0.55, 0.35, 0.22), (0.47, 0.29, 0.18), (0.4, 0.24, 0.15)))]

# ---- the island, then the slice ---------------------------------------------------------------------------------
parts = [L.cyl((0, 0, -0.08), R, 0.16, grass, verts=96, name='flat-grass')]
for i, (z, h) in enumerate(((-0.45, 0.6), (-1.1, 0.7), (-1.75, 0.6))):
    parts.append(L.cyl((0, 0, z), R - 0.05 - i * 0.25, h, earth[i], verts=96))
bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=R - 0.85, radius2=0.25, depth=4.6, location=(0, 0, -4.35), rotation=(math.pi, 0, 0))
cone = bpy.context.object; cone.data.materials.append(earth[3]); parts.append(cone)
cutter = L.box((0, CUT - 15, -2), (40, 30, 20), earth[0], name='cutter')
for p in parts:
    m = p.modifiers.new('slice', 'BOOLEAN'); m.object = cutter; m.operation = 'DIFFERENCE'; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = p; bpy.ops.object.modifier_apply(modifier='slice')
bpy.data.objects.remove(cutter, do_unlink=True)
# a darker line between the bands on the cut face
for z in (-0.16, -0.76, -1.46):
    L.box((0, CUT - 0.005, z), (2 * math.sqrt(max(0.1, R * R - CUT * CUT)) - 0.4, 0.01, 0.04), L.mat('seam', (0.36, 0.22, 0.14)), name='seam')

# ---- two chambers in the cut face, warm and lit ---------------------------------------------------------------------
glow = L.mat('chamber', (1.0, 0.82, 0.5), emit=1.4)
frame = L.mat('chamber-rim', (0.36, 0.2, 0.12), rough=0.9)
for cx in (-2.6, 2.6):
    for (w, h, m, dy) in ((2.0, 0.95, frame, 0.0), (1.8, 0.8, glow, -0.02)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.5, depth=0.06, location=(cx, CUT - 0.03 + dy, -1.1), rotation=(math.radians(90), 0, 0))
        o = bpy.context.object; o.scale = (w, h, 1); o.data.materials.append(m); o.name = 'lamp-chamber' if m is glow else 'rim'
    L.text('z z', (cx + 0.55, CUT - 0.09, -0.8), 0.18, L.mat('zz', (0.45, 0.35, 0.75)), rot=(90, 0, 0))

# ---- the mountain with its snowcap, hills at its feet --------------------------------------------------------------
TOPY = 15.2 / W.S
bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=3.6, radius2=0.9, depth=TOPY, location=(0, 0, TOPY / 2))
bpy.context.object.data.materials.append(L.mat('rock', (0.6, 0.53, 0.52), rough=0.9)); bpy.context.object.name = 'mountain'
snow_h = TOPY * 0.24
bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.9 + (3.6 - 0.9) * 0.24 + 0.03, radius2=0.92, depth=snow_h, location=(0, 0, TOPY - snow_h / 2 + 0.01))
bpy.context.object.data.materials.append(L.mat('snow', (0.97, 0.97, 0.98), rough=0.8))
for x, y, r in ((-3.4, -1.0, 1.5), (3.6, -0.6, 1.4), (-1.6, 3.4, 1.3)):
    s = L.sphere((x, y, 0), r, grass); s.scale = (1, 1, 0.55)

# ---- a little islet off the side, with a dotted path out to it -------------------------------------------------------
ix, iy = W.to_b(12, 40)
L.cyl((ix, iy, -0.06), 1.5, 0.12, grass, verts=32, name='flat-islet')
bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1.45, radius2=0.1, depth=2.2, location=(ix, iy, -1.2), rotation=(math.pi, 0, 0))
bpy.context.object.data.materials.append(earth[1])
for k in range(8):
    t = k / 8; x = R * 0.97 + (ix - R * 0.97) * t; y = iy * t
    L.sphere((x, y, -0.25 * math.sin(t * math.pi)), 0.05, L.mat('dot', (0.45, 0.3, 0.2)))
L.add('nature-kit', 'tree_default', (ix, iy, 0), 0, 1.6)

# ---- trees on the free ground, all behind the slice ----------------------------------------------------------------------
W.scatter(16, lambda x, y: y > 1.5 and 4.0 < math.hypot(x, y) < R - 0.5 and spots.clear(x, y, 0.45, ring_pad=0.5),
          lambda: ('nature-kit', random.choice(['tree_default', 'tree_oak', 'tree_cone', 'tree_fat']), random.uniform(1.1, 1.5)))
W.band(spots.ring, 0.42, L.mat('path', (0.86, 0.78, 0.6), rough=0.9), 0.01) if False else None
W.regrade_greens(skip=('grass',))
W.export(WID, pack)

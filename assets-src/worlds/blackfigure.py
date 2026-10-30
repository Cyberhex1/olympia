# Black-figure: Olympia painted on a Greek pot (mockup 03-black-figure). A floating clay dish on a black foot,
# its rim painted with a meander band and a band of tongues, a black mountain in the middle with clay zigzags
# incised in it (the Acropolis stands on top), black cypresses and a painted ring line on the clay. The temples
# and figures are Olympus's own; the "vase" finish turns every dark shape into a glossy black figure on clay.
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import bpy

WID = 'blackfigure'
random.seed(3)
L.reset()
SLOTS = [(140, 24), (190, 24.5), (240, 24), (290, 24.5), (340, 24), (165, 28), (215, 28.5), (265, 28), (315, 28.5), (10, 26), (30, 27.5), (125, 27.5), (355, 27)]
pack = W.set_terrain(WID, 'blackfigure.glb', 0.1, 32, 18.6,
                     dict(forge=(160, 14.2), library=(215, 14.2), beacon=(270, 14.2), archive=(325, 14.2), aviary=(20, 14.2)),
                     SLOTS, agora=(52, 22.5), hotel=(77, 26.4), summit_y=11.0,
                     camera={'pos': [0, 40, 116], 'target': [0, 5, 0], 'fov': 30})
spots = W.Spots(pack)
R = 10.0
clay = L.mat('clay', (0.8, 0.45, 0.25), rough=0.6)
black = L.mat('glaze', (0.04, 0.03, 0.025), rough=0.25)

# ---- the dish: clay top, painted rim, black foot -----------------------------------------------------------
L.cyl((0, 0, -0.1), R, 0.2, clay, verts=128, name='flat-clay')
L.cyl((0, 0, -0.55), R + 0.15, 0.7, clay, verts=128, name='rim')
L.cyl((0, 0, -0.21), R + 0.17, 0.06, black, verts=128); L.cyl((0, 0, -0.89), R + 0.17, 0.06, black, verts=128)
# meander: a running key of black steps round the rim
n = 72
for k in range(n):
    a = 2 * math.pi * k / n; x, y = math.cos(a) * (R + 0.16), math.sin(a) * (R + 0.16)
    for (dz, h, w) in ((-0.38, 0.05, 0.6), (-0.55, 0.3, 0.06), (-0.72, 0.05, 0.4), (-0.47, 0.13, 0.05)):
        b = L.box((x, y, dz), (w * (2 * math.pi * R / n) / 0.9, 0.04, h), black, name='key'); b.rotation_euler.z = a + math.pi / 2
bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=R - 0.2, radius2=2.2, depth=2.0, location=(0, 0, -1.9), rotation=(math.pi, 0, 0))
bpy.context.object.data.materials.append(black)
L.cyl((0, 0, -3.05), 2.4, 0.3, black, verts=64); L.cyl((0, 0, -2.9), 2.45, 0.04, clay, verts=64)
for k in range(40):  # tongues on the foot
    a = 2 * math.pi * k / 40; x, y = math.cos(a) * 6.2, math.sin(a) * 6.2
    t = L.box((x, y, -1.6), (0.32, 0.04, 0.5), clay, name='tongue'); t.rotation_euler = (math.radians(-38), 0, a + math.pi / 2)

# ---- the black mountain with incised zigzags; the Acropolis sits on top at the island's height ---------------
TOPY = 11.0 / W.S
bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=3.2, radius2=1.06, depth=TOPY, location=(0, 0, TOPY / 2))
bpy.context.object.data.materials.append(black); bpy.context.object.name = 'mountain'
for ring, (rr, zz) in enumerate(((2.55, 1.0), (1.9, 2.0))):
    for k in range(18):
        a0, a1 = 2 * math.pi * k / 18, 2 * math.pi * (k + 0.5) / 18
        for (aa, z0, z1) in ((a0, zz - 0.25, zz + 0.25), (a1, zz + 0.25, zz - 0.25)):
            r0 = 3.2 - (3.2 - 1.06) * z0 / TOPY + 0.02; r1 = 3.2 - (3.2 - 1.06) * z1 / TOPY + 0.02
            p0 = (math.cos(aa) * r0, math.sin(aa) * r0, z0); a2 = aa + math.pi / 18; p1 = (math.cos(a2) * r1, math.sin(a2) * r1, z1)
            ln = math.dist(p0, p1)
            s = L.box(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), (0.05, ln, 0.05), clay, name='zigzag')
            d = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
            s.rotation_mode = 'XYZ'
            s.rotation_euler = (math.atan2(d[2], math.hypot(d[0], d[1])), 0, math.atan2(d[1], d[0]) - math.pi / 2)

# ---- painted lines on the clay: the ring road, groundlines round the rim -----------------------------------------
W.band(spots.ring, 0.06, black, 0.004, depth=0.01)
W.band(spots.ring, 0.5, L.mat('clay-dark', (0.7, 0.38, 0.2), rough=0.6), 0.002, depth=0.008, name='flat-road')
W.band(R - 0.35, 0.08, black, 0.004, depth=0.01)
# black cypresses and olive shrubs on the free clay
def free(x, y, pad):
    r = math.hypot(x, y)
    return 3.6 < r < R - 0.6 and spots.clear(x, y, pad, ring_pad=0.45)
for _ in range(400):
    x, y = random.uniform(-R, R), random.uniform(-R, R)
    if not free(x, y, 0.4): continue
    if random.random() < 0.6:
        h = random.uniform(0.7, 1.2)
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.16, radius2=0.0, depth=h, location=(x, y, h / 2))
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.22, location=(x, y, 0.2))
    bpy.context.object.data.materials.append(black)
    if len([o for o in bpy.context.scene.objects if o.type == 'MESH']) > 900: break

W.export(WID, pack)

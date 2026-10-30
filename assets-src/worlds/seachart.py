# Sea Chart: Olympia as a hand-inked chart on a sheet of parchment floating in the air (mockup 04-cartographer).
# The sheet has rolled ends and a double ruled border; the sea is hatched with little waves; the island is a
# pale coastline with ripple lines round it, contour rings for the mountain, a dotted road (the walking ring)
# and dotted tracks out to every spot; a compass rose and a title cartouche sit in the corners. The temples
# (summit, workshops, project buildings, agora, hotel) are Olympus's own; the "chart" finish inks it all.
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import bpy

WID = 'seachart'
random.seed(4)
L.reset()
SLOTS = [(140, 24), (190, 24.5), (240, 24), (290, 24.5), (340, 24), (165, 28), (215, 28.5), (265, 28), (315, 28.5), (10, 26), (30, 27.5), (125, 27.5), (355, 27)]
pack = W.set_terrain(WID, 'seachart.glb', 0.12, 32, 18.6,
                     dict(forge=(160, 14.2), library=(215, 14.2), beacon=(270, 14.2), archive=(325, 14.2), aviary=(20, 14.2)),
                     SLOTS, agora=(52, 22.5), hotel=(77, 26.4), camera={'pos': [0, 150, 52], 'target': [0, 0, 3], 'fov': 34})
spots = W.Spots(pack)
TOP = 0.12 / W.S
paper = L.mat('paper', (0.93, 0.86, 0.7), rough=0.95)
land = L.mat('land', (0.88, 0.8, 0.62), rough=0.95)
ink = L.mat('ink', (0.03, 0.02, 0.015), rough=1.0)
red = L.mat('red-ink', (0.3, 0.03, 0.02), rough=1.0)

# ---- the sheet with rolled ends -----------------------------------------------------------------------------
SW, SH = 15.4, 11.6    # half sizes
L.box((0, 0, -0.03), (2 * SW, 2 * SH, 0.06), paper, name='flat-sheet')
for s in (-1, 1):
    L.cyl((s * (SW + 0.12), 0, 0.12), 0.32, 2 * SH + 0.2, paper, verts=24, rot=(math.radians(90), 0, 0), name='roll')
    L.cyl((s * (SW + 0.12), 0, 0.12), 0.12, 2 * SH + 0.9, L.mat('rod', (0.35, 0.22, 0.12)), verts=12, rot=(math.radians(90), 0, 0), name='rod')
def rect(hw, hh, w, m, z=0.004):
    for y in (-hh, hh): L.box((0, y, z), (2 * hw, w, 0.004), m, name='flat-line')
    for x in (-hw, hw): L.box((x, 0, z), (w, 2 * hh, 0.004), m, name='flat-line')
rect(SW - 0.35, SH - 0.35, 0.05, ink); rect(SW - 0.55, SH - 0.55, 0.02, ink)

def polyline(pts, w, m, z=0.004, name='flat-ink'):
    """Flat ink line through pts (Blender x, y), as one strip mesh."""
    verts, faces = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln * w / 2, dx / ln * w / 2
        verts += [(x + nx, y + ny, z), (x - nx, y - ny, z)]
        if i: k = 2 * i; faces.append((k - 2, k - 1, k + 1, k))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)
    return o

# ---- the sea: little hatched waves ----------------------------------------------------------------------------
coast = lambda a: 9.55 + 0.35 * math.sin(3 * a + 0.6) + 0.22 * math.sin(7 * a + 1.3) + 0.12 * math.sin(13 * a)
for _ in range(260):
    x, y = random.uniform(-SW + 0.9, SW - 0.9), random.uniform(-SH + 0.9, SH - 0.9)
    a = math.atan2(y, x)
    if math.hypot(x, y) < coast(a) + 0.9: continue
    if x > SW - 4.2 and y < -SH + 4.2: continue  # compass
    if x < -SW + 5.4 and y > SH - 2.8: continue  # cartouche
    pts = [(x + t * 0.5, y + 0.07 * math.sin(t * math.pi * 2)) for t in [k / 6 for k in range(7)]]
    polyline(pts, 0.045, ink, name='flat-wave')

# ---- the island: land, coastline, ripples, mountain contours, roads ----------------------------------------------
N = 180
ring = [(math.cos(2 * math.pi * k / N) * coast(2 * math.pi * k / N), math.sin(2 * math.pi * k / N) * coast(2 * math.pi * k / N)) for k in range(N + 1)]
me = bpy.data.meshes.new('land'); me.from_pydata([(0, 0, 0.002)] + [(x, y, 0.002) for x, y in ring[:-1]], [], [(0, k + 1, (k + 1) % N + 1) for k in range(N)]); me.update()
o = bpy.data.objects.new('flat-land', me); bpy.context.scene.collection.objects.link(o); me.materials.append(land)
polyline(ring, 0.07, ink, z=0.006)
for k, off in enumerate((0.3, 0.6, 0.95)):
    polyline([(x * (1 + off / 9.5), y * (1 + off / 9.5)) for x, y in ring], 0.02, ink, z=0.005, name='flat-ripple')
for r in (0.6, 1.2, 1.9, 2.6, 3.3):
    polyline([(math.cos(t) * (r + 0.1 * math.sin(5 * t + r)), math.sin(t) * (r + 0.1 * math.sin(5 * t + r))) for t in [2 * math.pi * k / 90 for k in range(91)]], 0.03, ink, z=0.006, name='flat-contour')
def dotted(points, step=0.32, w=0.06, m=ink):
    acc = 0
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        ln = math.hypot(x1 - x0, y1 - y0); t = acc
        while t < ln:
            px, py = x0 + (x1 - x0) * t / ln, y0 + (y1 - y0) * t / ln
            d = L.box((px, py, 0.007), (w, step * 0.5, 0.004), m, name='flat-dot'); d.rotation_euler.z = math.atan2(y1 - y0, x1 - x0) - math.pi / 2
            t += step
        acc = t - ln
R0 = spots.ring
dotted([(math.cos(t) * R0, math.sin(t) * R0) for t in [2 * math.pi * k / 120 for k in range(121)]])
for th, r in SLOTS + [(52, 22.5), (77, 26.4)]:
    dotted([W.to_b(th, R0 * W.S + 0.6), W.to_b(th, r - 2.4)], step=0.26, w=0.04)
# trees as little ink tufts on the free land
for _ in range(110):
    a = random.uniform(0, 2 * math.pi); r = random.uniform(3.7, coast(a) - 0.5); x, y = math.cos(a) * r, math.sin(a) * r
    if not spots.clear(x, y, 0.2, ring_pad=0.3): continue
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.12, radius2=0, depth=0.28, location=(x, y, 0.14)); bpy.context.object.data.materials.append(L.mat('tree', (0.36, 0.42, 0.26)))

# ---- compass rose and the title cartouche --------------------------------------------------------------------------
cx, cy = SW - 2.3, -SH + 2.3
polyline([(cx + math.cos(t) * 1.45, cy + math.sin(t) * 1.45) for t in [2 * math.pi * k / 72 for k in range(73)]], 0.05, ink)
polyline([(cx + math.cos(t) * 1.25, cy + math.sin(t) * 1.25) for t in [2 * math.pi * k / 72 for k in range(73)]], 0.03, red)
for k in range(4):
    a = k * math.pi / 2
    tip = (cx + math.cos(a) * 1.35, cy + math.sin(a) * 1.35, 0.008)
    l1 = (cx + math.cos(a + 0.6) * 0.32, cy + math.sin(a + 0.6) * 0.32, 0.008); l2 = (cx + math.cos(a - 0.6) * 0.32, cy + math.sin(a - 0.6) * 0.32, 0.008)
    me = bpy.data.meshes.new('star'); me.from_pydata([tip, l1, (cx, cy, 0.008), l2], [], [(0, 1, 2), (0, 2, 3)]); me.update()
    o = bpy.data.objects.new('flat-star', me); bpy.context.scene.collection.objects.link(o); me.materials.append(ink)
L.text('N', (cx, cy + 1.75, 0.01), 0.4, ink, rot=(0, 0, 0))
tx, ty = -SW + 3.2, SH - 1.5
L.box((tx, ty, 0.003), (4.6, 1.5, 0.004), L.mat('cartouche', (0.96, 0.9, 0.76)), name='flat-cartouche')
rx = [(tx - 2.3, ty - 0.75), (tx + 2.3, ty - 0.75), (tx + 2.3, ty + 0.75), (tx - 2.3, ty + 0.75), (tx - 2.3, ty - 0.75)]
polyline(rx, 0.05, ink, z=0.006)
L.text('OLYMPIA', (tx, ty - 0.12, 0.008), 0.62, ink, rot=(0, 0, 0))

W.export(WID, pack)

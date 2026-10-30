# Oracle's Scroll: the day's recap as a long scroll unrolled in the air (mockup 08-oracle-scroll). Gold rollers at
# both ends, ruled edges, the island inked on the left half (coastline, contours, the dotted road) where the
# temples and characters stand, and on the right half a blank panel the app paints with today's recap
# (sceneworld.js "recap"). Olympus's own temples; dusk light.
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import bpy

WID = 'oracle'
random.seed(8)
L.reset()
SLOTS = [(140, 24), (190, 24.5), (240, 24), (290, 24.5), (340, 24), (165, 28), (215, 28.5), (265, 28), (315, 28.5), (10, 26), (30, 27.5), (125, 27.5), (355, 27)]
pack = W.set_terrain(WID, 'oracle.glb', 0.12, 32, 18.6,
                     dict(forge=(160, 14.2), library=(215, 14.2), beacon=(270, 14.2), archive=(325, 14.2), aviary=(20, 14.2)),
                     SLOTS, agora=(52, 22.5), hotel=(77, 26.4),
                     camera={'pos': [24, 132, 88], 'target': [24, 0, 2], 'fov': 34})
pack['terrain']['recap'] = 'recap-panel'
import json
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
spots = W.Spots(pack)
paper = L.mat('scroll', (0.93, 0.85, 0.66), rough=0.9)
ink = L.mat('ink', (0.05, 0.03, 0.02), rough=1.0)
gold = L.mat('gold', (0.78, 0.55, 0.25), metal=0.7, rough=0.35)

X0, X1, HY = -11.4, 25.6, 10.8      # sheet extent (Blender units)
cx = (X0 + X1) / 2
L.box((cx, 0, -0.03), (X1 - X0, 2 * HY, 0.06), paper, name='flat-scroll')
for x in (X0 - 0.2, X1 + 0.2):
    L.cyl((x, 0, 0.2), 0.42, 2 * HY + 0.3, gold, verts=32, rot=(math.radians(90), 0, 0), name='roller')
    for s in (-1, 1): L.cyl((x, s * (HY + 0.45), 0.2), 0.55, 0.35, gold, verts=32, rot=(math.radians(90), 0, 0), name='knob')
for y in (-HY + 0.45, HY - 0.45):
    L.box((cx, y, 0.003), (X1 - X0 - 0.8, 0.05, 0.004), ink, name='flat-rule')
L.box((10.4, 0, 0.003), (0.03, 2 * HY - 1.4, 0.004), ink, name='flat-rule')

def polyline(pts, w, m, z=0.004, name='flat-ink'):
    verts, faces = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln * w / 2, dx / ln * w / 2
        verts += [(x + nx, y + ny, z), (x - nx, y - ny, z)]
        if i: k = 2 * i; faces.append((k - 2, k - 1, k + 1, k))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)
coast = lambda a: 9.55 + 0.35 * math.sin(3 * a + 0.6) + 0.22 * math.sin(7 * a + 1.3) + 0.12 * math.sin(13 * a)
N = 160
ring = [(math.cos(2 * math.pi * k / N) * coast(2 * math.pi * k / N), math.sin(2 * math.pi * k / N) * coast(2 * math.pi * k / N)) for k in range(N + 1)]
me = bpy.data.meshes.new('land'); me.from_pydata([(0, 0, 0.002)] + [(x, y, 0.002) for x, y in ring[:-1]], [], [(0, k + 1, (k + 1) % N + 1) for k in range(N)]); me.update()
o = bpy.data.objects.new('flat-land', me); bpy.context.scene.collection.objects.link(o); me.materials.append(L.mat('land', (0.82, 0.74, 0.52), rough=0.95))
polyline(ring, 0.07, ink, z=0.006)
for r in (0.7, 1.4, 2.1, 2.8):
    polyline([(math.cos(t) * r, math.sin(t) * r) for t in [2 * math.pi * k / 80 for k in range(81)]], 0.03, ink, z=0.006)
R0 = spots.ring
for k in range(120):
    a = 2 * math.pi * k / 120; d = L.box((math.cos(a) * R0, math.sin(a) * R0, 0.007), (0.06, 0.16, 0.004), ink, name='flat-dot'); d.rotation_euler.z = a
# the recap panel: the app paints today's recap on it
pn = L.box(((10.9 + X1 - 0.6) / 2, 0, 0.004), (X1 - 0.6 - 10.9, 2 * HY - 1.3, 0.004), paper, name='recap-panel')
# the wax seal
L.cyl((X1 - 2.2, -HY + 2.2, 0.03), 0.95, 0.06, L.mat('seal', (0.62, 0.12, 0.1), rough=0.5), verts=32)
W.export(WID, pack)

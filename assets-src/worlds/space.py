# Space Station, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t05_space_polished.py): cutaway
# modules on a grid (floor panels, back and side walls with windows and banners, a glowing trim at the front of
# each), single-tile corridors between them, all on a hull with porthole lights round its edge, solar wings off
# both sides, an antenna with a blinking light and a radar dome. The mockup's 3 x 3 grid is 4 x 4 here so there
# is a module for every project: the app furnishes them (projects), the command module (summit) and the
# docking bay (hotel); the workshops stand on the hull's front deck; the crew walk the corridors.
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as PL
import bpy

WID = 'space'
random.seed(5)
L.reset()
S = 'space-station-kit'
P, N = 4, 4                 # module pitch, modules per side
C0 = -(P * (N - 1) + 2) / 2  # shift so the grid sits round the origin
ACC = [(1, 0.35, 0.75), (1, 0.35, 0.25), (0.3, 0.6, 1), (1, 0.8, 0.2), (0.4, 0.95, 0.45), (0.7, 0.5, 1), (0.2, 0.95, 0.9), (0.9, 0.9, 0.9)]
SUMMIT, DOCK, BUNKS = (1, 2), (3, 3), (0, 3)
before = set(bpy.data.objects)
for mx in range(N):
    for my in range(N):
        ox, oy = mx * P, my * P
        for i in range(3):
            for j in range(3):
                L.add(S, 'floor-panel' if (i, j) == (1, 1) else 'floor', (ox + i, oy + j, 0))
        for i in range(3):
            L.add(S, 'wall-window' if i == 1 else 'wall', (ox + i, oy + 2.65, 0.3), 0)
            L.add(S, 'wall-banner' if i == 1 else 'wall', (ox - 0.35, oy + i, 0.3), 90)
        col = ACC[(mx + my * N) % len(ACC)] if (mx, my) != SUMMIT else (0.2, 0.95, 0.9)
        L.box((ox + 1, oy - 0.52, 0.31), (3, 0.06, 0.02), L.mat('trim%d%d' % (mx, my), col, emit=4), name='lamp-trim')
        if mx < N - 1: L.add(S, 'floor', (ox + 3, oy + 1, 0))
        if my < N - 1: L.add(S, 'floor', (ox + 1, oy + 3, 0))
# the crew bunks (sleeping threads), as in the mockup
bx, by = BUNKS[0] * P, BUNKS[1] * P
for i in range(3): L.add(S, 'bed-single-cover', (bx + 0.1 + i * 0.85, by + 1.6, 0.3), 0)
for (x, y) in ((P + 0.3, 2.3), (2 * P + 0.2, 2.3), (P + 2.2, P + 2.2), (0.2, 2 * P + 2.2)): L.add(S, 'container-flat', (x, y, 0.3), 0)
root = bpy.data.objects.new('station', None); bpy.context.scene.collection.objects.link(root)
for o in set(bpy.data.objects) - before:
    if o.parent is None and o is not root: o.parent = root
root.location = (C0, C0, 0)

# ---- the hull, portholes, solar wings, antenna, dome ---------------------------------------------------------------
H = (P * (N - 1) + 2) / 2 + 1.6
hull = L.mat('hull', (0.6, 0.62, 0.66), rough=0.45, metal=0.5)
L.box((0, 0, -0.35), (2 * H, 2 * H, 0.7), hull, bevel=0.15, name='flat-hull')
for k in range(-int(H), int(H) + 1):
    L.box((k, 0, 0.002), (0.012, 2 * H - 0.4, 0.003), L.mat('seam', (0.48, 0.5, 0.54)), name='flat-seam'); L.box((0, k, 0.002), (2 * H - 0.4, 0.012, 0.003), L.mat('seam', (0.48, 0.5, 0.54)), name='flat-seam')
L.box((0, 0, -0.95), (2 * H - 2.1, 2 * H - 2.1, 0.5), L.mat('hull2', (0.3, 0.32, 0.36), metal=0.6, rough=0.4), bevel=0.1)
for i in range(int(4 * H / 0.45)):
    t = -H + 0.2 + i * 0.45
    for (x, y) in ((t, -H - 0.02), (H + 0.02, t), (t, H + 0.02), (-H - 0.02, t)):
        if -H <= x <= H and -H <= y <= H: L.sphere((x, y, -0.35), 0.07, L.mat('port', (1, 0.85, 0.5), emit=6), name='bulb')
panel = L.mat('solar', (0.1, 0.2, 0.5), rough=0.2, metal=0.3, emit=0.15)
frame = L.mat('frame', (0.75, 0.77, 0.8), metal=0.7, rough=0.3)
for side in (-1, 1):
    L.cyl((side * (H + 1.4), 0, -0.3), 0.1, 2.8, hull, verts=12, rot=(0, math.radians(90), 0))
    for j in range(2):
        x0 = side * (H + 3.4 + j * 3.5)
        for k in (-1, 1):
            L.box((x0, k * 1.7, -0.3), (3.4, 3.0, 0.08), panel, bevel=0.02)
            for g in range(1, 4): L.box((x0 - 1.7 + g * 0.85, k * 1.7, -0.25), (0.02, 3.0, 0.01), frame)
L.cyl((0, H + 0.6, 1.5), 0.05, 3.0, hull, verts=8); L.sphere((0, H + 0.6, 3.1), 0.12, L.mat('blink', (1, 0.2, 0.2), emit=10), name='bulb')
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.9, location=(H - 1.0, H + 0.2, 1.4)); d = bpy.context.object; d.scale = (1, 1, 0.35); d.data.materials.append(hull)
L.sphere((-H - 3, H + 4, -7), 1.6, L.mat('planet', (0.95, 0.55, 0.3), emit=0.5), name='moon')

# ---- layout --------------------------------------------------------------------------------------------------------
def mod(mx, my): return (C0 + mx * P + 1, C0 + my * P + 1)
cells = [(mx, my) for my in range(N) for mx in range(N) if (mx, my) not in (SUMMIT, DOCK, BUNKS)]
slots = [W.spot(*mod(mx, my)) for mx, my in cells]
for s in slots: s['face'] = 90
TY = -H + 0.7  # the hull's front deck
tools = {k: W.spot(x, TY, look=(x, 0)) for k, x in zip(('forge', 'library', 'beacon', 'archive', 'aviary'), (-6.0, -3.0, 0.0, 3.0, 6.0))}
FLOOR = 0.35
sx, sy = mod(*SUMMIT)
lay = {'summit': [round(sx * W.S, 2), round(FLOOR * W.S, 2), round(-sy * W.S, 2)], 'tools': tools, 'projectSlots': slots,
       'agora': W.spot(-H + 0.75, 0.0, look=(0, 0)), 'hotel': W.spot(*mod(*DOCK)), 'ringRoad': 14}
nodes = [mod(mx, my) for my in range(N) for mx in range(N)]
edges = [(my * N + mx, my * N + mx + 1) for my in range(N) for mx in range(N - 1)] + [(my * N + mx, (my + 1) * N + mx) for my in range(N - 1) for mx in range(N)]
front = len(nodes)
for k, x in enumerate((-6.5, -3.0, 0.0, 3.0, 6.5)): nodes.append((x, TY - 0.45))
edges += [(front + k, front + k + 1) for k in range(4)] + [(front + k, k) for k in range(N)]
lay['paths'] = W.graph(nodes, edges)
pack = W.set_layout(WID, 'space.glb', round(FLOOR * W.S, 2), 36, lay, camera=W.blender_camera((22.2, -23, 23.6), (-0.1, -0.4, -0.6), 43))
b = pack['buildings']; KS = round(W.S, 2)
b['projects'] = [{'parts': [[S + '/computer-system', -0.7, -1.2], [S + '/computer-screen', 0.6, -1.2], [S + '/chair', 0.1, -0.4, 180]], 'scale': KS},
                 {'parts': [[S + '/computer-wide', 0, -1.2], [S + '/chair-armrest', 0.4, 0.2, 200]], 'scale': KS},
                 {'parts': [[S + '/table-display', 0, 0]], 'scale': KS},
                 {'parts': [[S + '/container', -0.6, -1.0], [S + '/container-tall', 0.4, -1.1], [S + '/chair-cushion', 0.2, 0.3]], 'scale': KS},
                 {'parts': [[S + '/computer', 0.6, -1.2], [S + '/table-display-small', -0.3, 0.1]], 'scale': KS}]
b['summit'] = {'parts': [[S + '/table-display-planet', 0, 0]], 'scale': KS}
b['hotel'] = {'parts': [['car-kit/race-future', -0.6, 0.2, 30, 0.35], ['car-kit/race-future', 0.7, -0.6, -20, 0.35]], 'scale': KS}
for k in ('forge', 'library', 'beacon', 'archive', 'aviary', 'agora'): b[k]['scale'] = round(0.8 * W.S, 2)
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

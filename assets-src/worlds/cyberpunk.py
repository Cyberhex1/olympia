# Night City, rebuilt straight from its polished mockup (mockups/assets-src/scenes/t02_cyberpunk_polished.py): a
# square city block floating in the night. The same dark pavement, the wet-asphalt cross of streets with lane
# lines plus the two side streets, neon trim and hanging cables under the block, dark filler blocks with lit
# windows and neon signs on the city grid, the holo billboards, street lamps and the hover-cars with light
# trails. The neon towers stand where the mockup's towers stood (the app adds them for your projects, with
# the other towers on the same grid), the OLYMPIA tower is the summit and the roundabout at the crossing is
# the interchange (agora). Characters walk the streets.
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W
from world_lib import L
import polish as P
import bpy

WID = 'cyberpunk'
random.seed(7)
L.reset()
C = 'city-kit-commercial'
R = 9.6
dark = L.mat('dark', (0.07, 0.07, 0.1), rough=0.45)
darker = L.mat('darker', (0.025, 0.028, 0.04), rough=0.35, metal=0.3)
wet = L.mat('wet', (0.018, 0.02, 0.03), rough=0.08, metal=0.5)
walk = L.mat('pavement', (0.075, 0.075, 0.095), rough=0.3)
NC = dict(pink=(1, 0.12, 0.55), cyan=(0.1, 0.85, 1), violet=(0.6, 0.25, 1), lime=(0.55, 1, 0.2), amber=(1, 0.6, 0.1), red=(1, 0.08, 0.06))
NEON = {k: L.mat('neon-' + k, c, emit=12) for k, c in NC.items()}
WIN = [L.mat('win%d' % i, c, emit=e) for i, (c, e) in enumerate((((1, 0.75, 0.4), 3.5), ((0.4, 0.8, 1), 3.0), ((1, 0.3, 0.7), 3.0), ((0.9, 0.9, 1), 2.0)))]
lanem = L.mat('lane', (0.95, 0.85, 0.5), emit=1.5)

P.diorama(R, square=True, top_mat=walk, soil=(0.05, 0.05, 0.07), under=(0.03, 0.03, 0.05), band=(0.12, 0.1, 0.16), rocks=False)
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o.data.materials and o.data.materials[0] is walk: o.name = 'flat-pavement'
for k in range(-9, 10):  # the pavement's checker as fine grid lines
    L.box((k, 0, 0.002), (0.012, 2 * R, 0.003), darker, name='flat-grid'); L.box((0, k, 0.002), (2 * R, 0.012, 0.003), darker, name='flat-grid')
for s in (-1, 1):
    L.box((0, s * (R + 0.01), -0.1), (2 * R, 0.04, 0.05), NEON['cyan']); L.box((s * (R + 0.01), 0, -0.1), (0.04, 2 * R, 0.05), NEON['pink'])
for i in range(10):
    a = random.uniform(-R + 1, R - 1)
    P.wire((a, -R + 0.3, -1.2), (a + random.uniform(-2, 2), -R + 2.5, -3.2), sag=-0.3, mat=NEON[random.choice(list(NEON))], thick=0.025)

# ---- streets: the mockup's cross of wet asphalt with lane lines, and the two side streets ---------------------
STREETS = ((0, -1.1, 2 * R, 1.5), (-1.1, 0, 1.5, 2 * R), (0, 5.5, 2 * R, 1.3), (5.5, 0, 1.3, 2 * R))
for (cx, cy, w, h) in STREETS:
    L.box((cx, cy, 0.005), (w, h, 0.012), wet, name='flat-street')
for x in range(-9, 10):
    L.box((x + 0.5, -1.1, 0.013), (0.45, 0.04, 0.004), lanem, name='flat-lane')
    L.box((-1.1, x + 0.5, 0.013), (0.04, 0.45, 0.004), lanem, name='flat-lane')
def on_street(x, y, pad=0.0):
    return abs(y + 1.1) < 0.75 + pad or abs(x + 1.1) < 0.75 + pad or abs(y - 5.5) < 0.65 + pad or abs(x - 5.5) < 0.65 + pad

# ---- where the app's buildings go: the mockup's towers first, then more on the same grid ------------------------
TOWERS = [(-4.4, 2.3), (7.8, 2.6), (-7.6, -3.6), (3.4, -3.8), (-3.8, -3.8), (7.8, -3.6)]
EXTRA = [(-7.6, 8.0), (-3.6, 8.0), (2.4, 8.0), (7.8, 8.0), (-7.8, -7.8), (3.2, -7.8), (7.8, -7.8)]
TOOLS = {'forge': (-3.6, -7.8), 'library': (0.9, -7.6), 'beacon': (0.6, 8.0), 'archive': (-7.9, 3.4), 'aviary': (-7.9, 0.6)}
SUMMIT, HOTEL, AGORA = (1.9, 2.4), (0.4, 4.0), (-1.1, -1.1)
taken = TOWERS + EXTRA + list(TOOLS.values()) + [SUMMIT, HOTEL]

def windows(x, y, w, d, h, n):
    for _ in range(n):
        side = random.choice((0, 1)); z = random.uniform(0.5, h * 0.94); m = random.choice(WIN)
        if side == 0: L.box((x + random.uniform(-w / 2.5, w / 2.5), y - d / 2 - 0.01, z), (0.12, 0.02, 0.07), m)
        else: L.box((x + w / 2 + 0.01, y + random.uniform(-d / 2.5, d / 2.5), z), (0.02, 0.12, 0.07), m)
fill = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j']
for gx in (-8.0, -5.8, -3.4, 0.6, 3.0, 7.6):
    for gy in (-8.0, -6.0, 1.8, 3.9, 8.2):
        if any(math.hypot(gx - ox, gy - oy) < 2.2 for ox, oy in taken): continue
        if on_street(gx, gy, 0.6): continue
        b = L.add(C, random.choice(fill), (gx, gy, 0), random.choice((0, 180)), random.uniform(1.1, 1.5), tint=dark)
        bpy.context.view_layer.update(); lo, hi = L.bounds([b])
        windows(gx, gy, hi.x - lo.x, hi.y - lo.y, hi.z, 18)
        if random.random() < 0.6:
            L.box((gx, gy - (hi.y - lo.y) / 2 - 0.03, hi.z * random.uniform(0.35, 0.8)), (0.8, 0.03, 0.2), NEON[random.choice(list(NEON))])

# ---- holo billboards, street lamps, hover-cars --------------------------------------------------------------------------
for (x, y, col, txt) in ((-1.1, 4.0, 'pink', 'CLAUDE'), (5.5, 0.4, 'cyan', 'OLYMPIA'), (-5.5, 5.5, 'lime', '24/7')):
    L.cyl((x, y, 1.6), 0.04, 3.2, darker, verts=8)
    L.box((x, y, 3.3), (1.6, 0.03, 0.8), L.mat('holo-' + col, NC[col], emit=2.5, alpha=0.55), name='holo')
    L.text(txt, (x, y - 0.03, 3.18), 0.32, NEON[col])
for x in (-8, -6, -4, -2, 0, 2, 4, 6, 8):
    L.add('city-kit-roads', 'light-curved', (x, -2.0, 0), 180, 2.2); L.sphere((x, -1.6, 1.3), 0.05, L.mat('lamp', (0.7, 0.85, 1), emit=4), name='bulb')
CARS = [('race-future', (-1.6, -0.6, 4.3), 30, 'amber'), ('sedan-sports', (1.6, -2.2, 3.1), -60, 'amber'), ('race-future', (4.2, 3.6, 6.4), 120, 'amber'),
        ('police', (-4.2, 0.7, 7.8), 80, 'cyan'), ('hatchback-sports', (3.6, -0.6, 7.0), -20, 'violet'), ('taxi', (-7.6, -6.6, 2.0), 10, 'cyan')]
for model, loc, rot, col in CARS:
    L.add('car-kit', model, loc, rot, 0.55)
    L.box((loc[0], loc[1], loc[2] - 0.06), (0.5, 0.9, 0.02), NEON[col]).rotation_euler.z = math.radians(rot)
    a = math.radians(rot + 90)
    for k in range(3):
        tr = L.box((loc[0] - math.cos(a) * (1.0 + k * 0.6), loc[1] - math.sin(a) * (1.0 + k * 0.6), loc[2] + 0.15), (0.6, 0.03, 0.03), L.mat('trail%d' % k, NC[col], emit=6 - k * 1.8, alpha=0.8 - k * 0.2))
        tr.rotation_euler.z = a

# ---- layout, walkways, camera, buildings ---------------------------------------------------------------------------------
facing = lambda x, y: (x, y - 3)  # towers face the viewer, like the mockup
lay = {'summit': [round(SUMMIT[0] * W.S, 2), 0.2, round(-SUMMIT[1] * W.S, 2)],
       'tools': {k: W.spot(x, y, look=facing(x, y)) for k, (x, y) in TOOLS.items()},
       'projectSlots': [W.spot(x, y, look=facing(x, y)) for x, y in TOWERS + EXTRA],
       'agora': W.spot(*AGORA), 'hotel': W.spot(*HOTEL, look=facing(*HOTEL)), 'ringRoad': 14}
lay['paths'] = W.grid_graph([-9.0, -6.0, -1.1, 2.2, 5.5, 9.0], [-9.0, -5.8, -1.1, 0.4, 5.5, 9.0])
pack = W.set_layout(WID, 'cyberpunk.glb', 0.2, 34, lay, camera=W.blender_camera((13, -25, 19), (0.4, 0.2, 1.2), 32))
b = pack['buildings']; D = '#4a4463'
NEONS = ['#ff1f8c', '#1ad9ff', '#9940ff', '#8cff33', '#ff9919', '#1ad9ff']
SKY = ['building-skyscraper-c', 'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-d', 'building-skyscraper-a', 'building-skyscraper-b']
b['projects'] = [{'m': C + '/' + m, 'dark': D, 'neon': NEONS[i], 'scale': round(1.6 * W.S, 2)} for i, m in enumerate(SKY)]
b['summit'] = {'m': C + '/building-skyscraper-e', 'dark': D, 'neon': '#1ad9ff', 'scale': round(2.1 * W.S, 2)}
for k, m, c in (('forge', 'building-h', '#ff9919'), ('library', 'building-k', '#9940ff'), ('beacon', 'building-skyscraper-d', '#1ad9ff'), ('archive', 'building-n', '#ff1f8c'), ('aviary', 'building-m', '#8cff33')):
    b[k] = {'m': C + '/' + m, 'dark': D, 'neon': c, 'scale': round((1.2 if k != 'beacon' else 1.3) * W.S, 2)}
b['hotel'] = {'m': C + '/building-skyscraper-c', 'dark': D, 'neon': '#ff9919', 'scale': round(1.25 * W.S, 2)}
b['agora'] = {'m': 'city-kit-roads/road-roundabout', 'scale': round(1.5 * W.S, 2)}
with open(os.path.join(W.APP, 'public', 'worlds', WID, 'world.json'), 'w', encoding='utf-8') as f: f.write(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
W.export(WID, pack)

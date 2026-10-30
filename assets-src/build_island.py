# Builds the Olympia island + Mount Olympus in Blender and exports public/assets/olympia-island.glb.
# Run:  blender -b --factory-startup --python assets-src/build_island.py
# Shapes match public/js/world.js (same edge noise and mountain profile) so placements still line up.
# Blender is Z-up; three.js is Y-up: three (x, y, z) == blender (x, -z, y).
import bpy, bmesh, math, os, random
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "olympia-island.glb")
M32 = 0xFFFFFFFF


# ---------------------------------------------------------------- exact port of util.js rng() / ringNoise()
def imul(a, b):
    return (a * b) & M32


def rng(seed):
    state = [seed & M32]

    def nxt():
        a = (state[0] + 0x6D2B79F5) & M32
        state[0] = a
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return nxt


def ring_noise(seed, terms=5):
    r = rng(seed)
    ts = []
    for i in range(terms):
        f = i + 2 + math.floor(r() * 3)
        p = r() * math.pi * 2
        a = (r() * 0.6 + 0.4) / (i + 1)
        ts.append((f, p, a))
    return lambda th: sum(math.sin(th * f + p) * a for f, p, a in ts)


edge_noise = ring_noise(7, 6)
ISLAND_R = 32


def edge_r(th):
    return ISLAND_R + edge_noise(th) * 1.6


PROFILE = [(11.2, -0.25), (10.2, 1.0), (9.0, 2.6), (7.8, 4.4), (6.7, 6.2), (5.6, 7.9), (4.6, 9.4), (3.9, 10.5), (3.6, 11.0)]


def to_blender(x, y, z):  # three -> blender
    return Vector((x, -z, y))


def n3(v, scale, octaves=3):
    return noise.fractal(Vector(v) * scale, 0.5, 2.0, octaves, noise_basis="PERLIN_ORIGINAL")


def hexc(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb] + [1.0]


def lerp(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(4)]


def grid_object(name, rows, colorfn, flip=False, per_vertex=False):
    """rows: list of lists of three-space Vector (same length, wrapping)."""
    bm = bmesh.new()
    vs = [[bm.verts.new(to_blender(*p)) for p in row] for row in rows]
    S = len(rows[0])
    for i in range(len(rows) - 1):
        for s in range(S):
            a, b = vs[i][s], vs[i][(s + 1) % S]
            c, d = vs[i + 1][(s + 1) % S], vs[i + 1][s]
            quad = (a, d, c, b) if flip else (a, b, c, d)
            try:
                bm.faces.new(quad)
            except ValueError:
                pass
    bm.normal_update()
    # make every face point outward: up for the flat top, away from the centre axis elsewhere
    bad = []
    for f in bm.faces:
        c = f.calc_center_median()
        out = Vector((0, 0, 1)) if name == "IslandTop" else Vector((c.x, c.y, 0)).normalized()
        if f.normal.dot(out) < 0:
            bad.append(f)
    if bad:
        bmesh.ops.reverse_faces(bm, faces=bad)
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        cen = poly.center
        col = colorfn(Vector((cen.x, cen.z, -cen.y)), poly)
        for li in poly.loop_indices:
            if per_vertex:
                co = me.vertices[me.loops[li].vertex_index].co
                col = colorfn(Vector((co.x, co.z, -co.y)), poly)
            attr.data[li].color = col
    me.color_attributes.active_color = attr
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(4)

# ---------------------------------------------------------------- island top (flat, colour patches)
S = 200
K = 26
G1, G2, G3, GEDGE = hexc("#6fae4f"), hexc("#5a9a42"), hexc("#8fbf5e"), hexc("#4f8c3c")
top_rows = []
for k in range(K + 1):
    row = []
    for s in range(S):
        th = s / S * math.tau
        r = (k / K) * edge_r(th) if k else 0.001 * (s + 1)
        row.append(Vector((math.cos(th) * r, 0.0, math.sin(th) * r)))
    top_rows.append(row)


def top_color(p, poly):
    n = n3((p.x, p.z, 0.3), 0.07, 4)
    c = lerp(G2, G3 if n > 0 else G1, min(1, abs(n) * 2.2))
    r = math.hypot(p.x, p.z)
    e = edge_r(math.atan2(p.z, p.x))
    if r > e - 1.8:
        c = lerp(c, GEDGE, (r - (e - 1.8)) / 1.8 * 0.6)
    return c


top = grid_object("IslandTop", top_rows, top_color, flip=True, per_vertex=True)

# ---------------------------------------------------------------- sides: grass lip, earth strata, rocky underside
side_rows = []
# same base as the world dioramas: grass cap, warm soil strata, a pale rock band, a warm tapered underside with rocks in the sides
GRASS, DIRT_A, DIRT_B, DIRT_C = hexc("#5a9a42"), hexc("#b08a66"), hexc("#9c7556"), hexc("#bf9a74")
BAND_A, BAND_B, ROCK_A, ROCK_B = hexc("#bdb7b0"), hexc("#a9a39c"), hexc("#9c7a5c"), hexc("#7f5f46")
drip = [0.55 + max(0, n3((math.cos(s / S * math.tau) * 3, math.sin(s / S * math.tau) * 3, 1.7), 1.3, 2)) * 1.6 for s in range(S)]
levels = [  # (y, radius scale, outward bulge, jitter strength)
    ("top", 0.0, 1.0, 0.0, 0.0),
    ("lip", -0.22, 1.0, 0.22, 0.0),
    ("drip", None, 0.995, 0.12, 0.0),
    ("d1", -1.6, 0.985, 0.0, 0.25),
    ("d2", -2.4, 0.975, 0.0, 0.3),
    ("d3", -3.3, 0.955, 0.0, 0.35),
    ("r1", -4.8, 0.86, 0.0, 1.1),
    ("r2", -7.0, 0.70, 0.0, 1.6),
    ("r3", -9.6, 0.52, 0.0, 1.6),
    ("r4", -12.6, 0.34, 0.0, 1.3),
    ("r5", -15.6, 0.17, 0.0, 0.9),
    ("tip", -18.8, 0.02, 0.0, 0.0),
]
for name, y, rs, bulge, jit in levels:
    row = []
    for s in range(S):
        th = s / S * math.tau
        e = edge_r(th)
        yy = -drip[s] if y is None else y
        r = e * rs + bulge
        if jit:
            d = n3((math.cos(th) * 4, math.sin(th) * 4, yy * 0.35), 0.9, 3)
            r += d * jit * 2.2
            yy += n3((math.cos(th) * 5, math.sin(th) * 5, 9.1), 1.2, 2) * jit * 0.5
        row.append(Vector((math.cos(th) * r, yy, math.sin(th) * r)))
    side_rows.append(row)


def side_color(p, poly):
    y = p.y
    if y > -0.5 or (y > -2.2 and poly.normal.z < -0.6):
        return GRASS
    wob = n3((p.x, p.z, 0), 0.3, 2) * 0.35
    if y > -3.6:
        band = (y + wob) % 1.3
        return DIRT_A if band < 0.55 else DIRT_B if band < 0.9 else DIRT_C
    t = min(1, (-y - 3.6) / 12)
    base = lerp(ROCK_A, ROCK_B, t)
    k = 0.9 + 0.2 * (0.5 + 0.5 * n3((p.x, p.y, p.z), 0.4, 2))
    return [base[0] * k, base[1] * k, base[2] * k, 1]


sides = grid_object("IslandSides", side_rows, side_color, flip=False)

# ---------------------------------------------------------------- hanging rocks under the island
hang_objs = []
for i in range(9):
    th = random.random() * math.tau
    r = random.uniform(6, 20)
    yb = -4.5 - (1 - r / 24) * 9
    h = random.uniform(2.5, 6)
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=random.uniform(1.2, 2.4), radius2=0.05, depth=h,
                                    location=to_blender(math.cos(th) * r, yb - h / 2 + 0.6, math.sin(th) * r), rotation=(math.pi, 0, random.random() * 6))
    ob = bpy.context.active_object
    for v in ob.data.vertices:
        v.co += Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), random.uniform(-0.2, 0.2)))
    hang_objs.append(ob)
for ob in hang_objs:
    me = ob.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        k = random.uniform(0.85, 1.05)
        for li in poly.loop_indices:
            attr.data[li].color = [ROCK_B[0] * k, ROCK_B[1] * k, ROCK_B[2] * k, 1]

# ---------------------------------------------------------------- Kenney rocks poking out of the island's sides (as on the world dioramas)
import colorsys
NATURE = os.path.join(ROOT, "assets-src", "kenney-nature-kit", "Models", "GLTF format")


def regrade(c):  # same leafy-green regrade as build_props.py
    lin2s = lambda x: x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    s2lin = lambda x: x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (lin2s(c[0]), lin2s(c[1]), lin2s(c[2]))
    h, sat, v = colorsys.rgb_to_hsv(r, g, b)
    if 0.2 < h < 0.55 and sat > 0.2:
        h = 0.25 + (h - 0.2) * 0.25; sat = min(1, sat * 0.95); v = v * 0.78
    r, g, b = colorsys.hsv_to_rgb(h, sat, v)
    return (s2lin(r), s2lin(g), s2lin(b), 1)


rock_objs = []
ROCKS = ["rock_largeA", "rock_largeB", "rock_largeC", "rock_largeD", "rock_largeE", "rock_largeF"]
for i in range(56):
    th = i / 56 * math.tau + random.uniform(-0.04, 0.04)
    e = edge_r(th)
    s = random.uniform(3.4, 5.4)
    y = -(0.6 + 0.3 * s) - random.uniform(0.0, 2.4)  # keep the rock tops below the grass
    rr = e * (0.985 if y > -3.9 else 0.94) - random.uniform(0.6, 1.4)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(NATURE, random.choice(ROCKS) + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in new:
        if o != ob and o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)
    ob.scale = (s, s, s * random.uniform(0.9, 1.1))
    ob.rotation_euler = (random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), random.uniform(0, math.tau))
    ob.location = to_blender(math.cos(th) * rr, y, math.sin(th) * rr)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = ob.data
    cols = []
    for m in me.materials:
        c = (0.8, 0.8, 0.8, 1)
        if m and m.node_tree:
            bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf: c = tuple(bsdf.inputs[0].default_value)
        cols.append(regrade(c))
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        c = cols[poly.material_index] if cols else (0.8, 0.8, 0.8, 1)
        for li in poly.loop_indices: attr.data[li].color = (c[0], c[1], c[2], 1)
    me.color_attributes.active_color = attr
    for a in [a for a in me.color_attributes if a.name != "Col"]: me.color_attributes.remove(a)
    me.materials.clear()
    rock_objs.append(ob)

# ---------------------------------------------------------------- Mount Olympus (faceted, wavy snow line)
MS = 56
mrows = []
for i, (r0, y0) in enumerate(PROFILE):
    row = []
    edge_ring = i in (0, len(PROFILE) - 1)
    for s in range(MS):
        th = s / MS * math.tau + (0.5 / MS * math.tau if i % 2 else 0)
        d = 0 if edge_ring else n3((math.cos(th) * 3, math.sin(th) * 3, y0 * 0.25), 1.0, 3) * 1.4
        yy = y0 + (0 if edge_ring else n3((math.cos(th) * 4, math.sin(th) * 4, 3.3), 1.1, 2) * 0.45)
        rr = r0 + d + (0.12 if i == 0 else 0)
        row.append(Vector((math.cos(th) * rr, yy, math.sin(th) * rr)))
    mrows.append(row)
SNOW, ROCK_M1, ROCK_M2, MGRASS = hexc("#f4f6fb"), hexc("#a29687"), hexc("#877b70"), hexc("#64a24a")


def mountain_color(p, poly):
    th = math.atan2(p.z, p.x)
    snow_line = 8.0 + math.sin(th * 5) * 0.6 + math.sin(th * 3 + 1) * 0.4
    if p.y > snow_line:
        return SNOW
    if p.y < 1.4 + math.sin(th * 7) * 0.4:
        return MGRASS
    return ROCK_M1 if n3((p.x, p.y, p.z), 0.5, 2) > 0 else ROCK_M2


mountain = grid_object("Mountain", mrows, mountain_color, flip=False)

# ---------------------------------------------------------------- bake ambient occlusion into the vertex colours
scene = bpy.context.scene
try:
    scene.render.engine = "CYCLES"
except TypeError:
    pass
scene.cycles.samples = 48
scene.cycles.device = "CPU"
bake_targets = [top, sides, mountain] + hang_objs + rock_objs
for ob in bake_targets:
    me = ob.data
    ao = me.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = ao
    mat = bpy.data.materials.new(ob.name + "_bake")
    ob.data.materials.append(mat)
bpy.ops.object.select_all(action="DESELECT")
for ob in bake_targets:
    ob.select_set(True)
bpy.context.view_layer.objects.active = top
scene.render.bake.target = "VERTEX_COLORS"
scene.render.bake.margin = 0
bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")

for ob in bake_targets:
    me = ob.data
    col, ao = me.color_attributes["Col"], me.color_attributes["AO"]
    for i in range(len(col.data)):
        a = ao.data[i].color[0]
        k = 0.5 + 0.5 * a  # keep it soft: AO darkens to half at most
        c = col.data[i].color
        col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color = me.color_attributes["Col"]
    me.materials.clear()

# join hanging rocks into the sides so the export stays small
bpy.ops.object.select_all(action="DESELECT")
for ob in hang_objs + rock_objs + [sides]:
    ob.select_set(True)
bpy.context.view_layer.objects.active = sides
bpy.ops.object.join()

bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_vertex_color="ACTIVE",
                          export_all_vertex_colors=False, export_normals=True, export_apply=True, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "assets-src", "olympia-island.blend"))

# preview render
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
cam.location = to_blender(0, 6, 78)
cam.rotation_euler = (math.radians(86), 0, 0)
cam_data.lens = 40
scene.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3
sun.rotation_euler = (math.radians(40), math.radians(20), math.radians(30))
scene.collection.objects.link(sun)
for ob in [top, sides, mountain]:
    m = bpy.data.materials.new("prev")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs[0], bsdf.inputs[0])
    ob.data.materials.append(m)
world = bpy.data.worlds.new("w")
world.use_nodes = True
scene.world = world
next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.6, 0.75, 0.95, 1)
scene.render.resolution_x, scene.render.resolution_y = 960, 600
scene.cycles.samples = 24
scene.render.filepath = os.path.join(ROOT, "assets-src", "preview-island.png")
bpy.ops.render.render(write_still=True)
print("ISLAND_OK", OUT, os.path.getsize(OUT))

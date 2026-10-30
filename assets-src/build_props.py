# Packs selected Kenney Nature Kit models (CC0) into public/assets/olympia-props.glb.
# Each prop becomes ONE mesh with its material colours baked into vertex colours, so three.js can
# draw every copy of it with a single InstancedMesh. Origins sit at the bottom centre.
# Run:  blender -b --factory-startup --python assets-src/build_props.py
import bpy, os, math, colorsys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src", "kenney-nature-kit", "Models", "GLTF format")
OUT = os.path.join(ROOT, "public", "assets", "olympia-props.glb")

PROPS = [
    # cypress / pines / olives
    "tree_pineTallA_detailed", "tree_pineTallB_detailed", "tree_cone_dark", "tree_pineRoundC", "tree_pineSmallA",
    "tree_oak", "tree_fat", "tree_detailed", "tree_default",
    # undergrowth
    "plant_bush", "plant_bushLarge", "plant_bushDetailed", "plant_bushSmall",
    "flower_redA", "flower_yellowB", "flower_purpleC", "grass", "grass_large", "grass_leafs",
    # rocks
    "rock_smallA", "rock_smallC", "rock_smallFlatA", "rock_tallA", "stone_tallB",
    # Greek-ish decor
    "statue_column", "statue_columnDamaged", "statue_obelisk", "pot_small",
    "lily_large", "mushroom_redGroup", "log", "stump_round",
]

def regrade(c):
    # Kenney foliage is minty teal; push greens toward Mediterranean olive/sage and deepen them.
    lin2s = lambda x: x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    s2lin = lambda x: x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (lin2s(c[0]), lin2s(c[1]), lin2s(c[2]))
    h, sat, v = colorsys.rgb_to_hsv(r, g, b)
    if 0.2 < h < 0.55 and sat > 0.2:          # greens and teals
        h = 0.25 + (h - 0.2) * 0.25             # squeeze into yellow-green .. green
        sat = min(1, sat * 0.95)
        v = v * 0.78
    r, g, b = colorsys.hsv_to_rgb(h, sat, v)
    return (s2lin(r), s2lin(g), s2lin(b), 1)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
done = []
for i, name in enumerate(PROPS):
    path = os.path.join(SRC, name + ".glb")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    # apply parent transforms, then join
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in new:
        if o != ob and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    me = ob.data
    # material base colours -> corner colours
    cols = []
    for m in me.materials:
        c = (0.8, 0.8, 0.8, 1)
        if m and m.node_tree:
            bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf:
                c = tuple(bsdf.inputs[0].default_value)
        cols.append(regrade(c))
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        c = cols[poly.material_index] if cols else (0.8, 0.8, 0.8, 1)
        for li in poly.loop_indices:
            attr.data[li].color = (c[0], c[1], c[2], 1)
    me.color_attributes.active_color = attr
    for a in [a for a in me.color_attributes if a.name != "Col"]:
        me.color_attributes.remove(a)
    me.materials.clear()
    # origin at bottom centre
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    off = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs))
    for v in me.vertices:
        v.co.x -= off[0]; v.co.y -= off[1]; v.co.z -= off[2]
    ob.location = (0, 0, 0)
    ob.name = name
    me.name = name
    done.append((name, round(max(zs) - min(zs), 3), len(me.polygons)))

bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_vertex_color="ACTIVE",
                          export_all_vertex_colors=False, export_normals=True, export_yup=True)

# contact-sheet preview
for idx, ob in enumerate(bpy.data.objects):
    ob.location = ((idx % 9) * 1.3, -(idx // 9) * 1.6, 0)
m = bpy.data.materials.new("prev")
nt = m.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
nt.links.new(vc.outputs[0], bsdf.inputs[0])
for ob in bpy.data.objects:
    ob.data.materials.append(m)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
cam.location = (5.2, -14, 9); cam.rotation_euler = (math.radians(55), 0, 0); scene.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3
sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30)); scene.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); scene.world = w
next(n for n in w.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.8, 0.85, 0.95, 1)
try:
    scene.render.engine = "BLENDER_EEVEE"
except TypeError as e:
    print("engines:", e)
scene.render.resolution_x, scene.render.resolution_y = 1100, 700
scene.render.filepath = os.path.join(ROOT, "assets-src", "preview-props.png")
bpy.ops.render.render(write_still=True)
print("PROPS_OK", os.path.getsize(OUT), done)

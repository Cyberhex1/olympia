# Helpers for the map worlds: each world is its own place, built from free Kenney kits in background Blender and
# exported as one model the app loads instead of the island (public/js/sceneworld.js).
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python assets-src/worlds/<id>.py
#
# A world script builds the place in Blender units around the origin (the mockup scenes' scale: a diorama about
# 10 across), leaving room at every spot in the world's layout. The layout lives in public/worlds/<id>/world.json
# ("terrain.layout", in island units and the app's angles: theta 90 = towards the camera). export() scales the
# place up by S into island units and writes public/worlds/<id>/<terrain.model>.
# Buildings at the layout spots (summit, workshops, project spots, agora, hotel) and the residents are not in the
# model: the app adds them from the pack, so projects can come and go.
import bpy, math, os, sys, json, random
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(APP, 'mockups', 'assets-src'))
import scene_lib as L  # noqa: E402  (the mockup scenes' helpers: kits, materials, primitives)

S = 3.4  # Blender units → island units


def load_pack(wid):
    with open(os.path.join(APP, 'public', 'worlds', wid, 'world.json'), encoding='utf-8') as f:
        return json.load(f)


def to_b(theta, r):
    """Island polar spot (degrees, island units) → Blender x, y in world-script units."""
    t = math.radians(theta)
    return math.cos(t) * r / S, -math.sin(t) * r / S


def yaw_to_centre(theta):
    """Blender z rotation (degrees) that turns a kit piece (facing -y) at island angle theta towards the centre."""
    x, y = to_b(theta, 1)
    return math.degrees(math.atan2(-y, -x)) + 90


class Spots:
    """Every place the app will put something, in Blender units, so decoration can keep clear of them."""
    def __init__(self, pack, pad=1.0):
        lay = pack['terrain']['layout']
        self.items = []
        for t in lay.get('tools', {}).values(): self.items.append((*to_b(t['theta'], t['r']), 2.6 / S * pad))
        for s in lay['projectSlots']: self.items.append((*to_b(s['theta'], s['r']), 2.6 / S * pad))
        for k, rad in (('agora', 3.4), ('hotel', 3.2)):
            if k in lay: self.items.append((*to_b(lay[k]['theta'], lay[k]['r']), rad / S * pad))
        self.items.append((0, 0, 3.4 / S * pad))
        self.ring = lay.get('ringRoad', 0) / S

    def clear(self, x, y, extra=0.0, ring_pad=0.45):
        if self.ring and abs(math.hypot(x, y) - self.ring) < ring_pad: return False
        return all(math.hypot(x - a, y - b) > r + extra for a, b, r in self.items)

    def spokes(self):
        """(x, y) of every spot, for paths from the ring out to each door."""
        return [(a, b) for a, b, _ in self.items[:-1]]


def regrade_greens(skip=('grass',)):
    """Warm up Kenney's minty nature greens, like the island's build_props.py."""
    import colorsys
    for m in bpy.data.materials:
        if not m.use_nodes or m.name in skip: continue
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not b or b.inputs['Base Color'].is_linked: continue
        r, g, bl, a = b.inputs['Base Color'].default_value
        h, s, v = colorsys.rgb_to_hsv(r, g, bl)
        if 0.2 < h < 0.55 and s > 0.2:
            h = 0.24 + (h - 0.2) * 0.3; s = min(1, s * 1.1); v *= 0.8
            b.inputs['Base Color'].default_value = (*colorsys.hsv_to_rgb(h, s, v), a)


def export(wid, pack):
    """Scale the place into island units and write it as one GLB next to world.json."""
    sc = bpy.context.scene
    for o in list(sc.objects):  # lights and cameras stay in Blender; the app lights the scene itself
        if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in sc.objects:  # bunting wires and signs are curves and text: make them meshes
        if o.type in ('CURVE', 'FONT'): o.select_set(True); bpy.context.view_layer.objects.active = o
    if bpy.context.selected_objects: bpy.ops.object.convert(target='MESH')
    root = bpy.data.objects.new('world', None); sc.collection.objects.link(root)
    for o in list(sc.objects):
        if o is not root and o.parent is None: o.parent = root
    root.scale = (S, S, S)
    out = os.path.join(APP, 'public', 'worlds', wid, pack['terrain']['model'])
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_skins=False)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')


def band(r, width, mat, z, name='flat-ring', depth=0.03, verts=96):
    """A flat ring (annulus) of radius r: the walking ring as a road, boardwalk, corridor or path."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r + width / 2, depth=depth, location=(0, 0, z))
    o = bpy.context.object; o.name = name; o.data.materials.append(mat)
    hole = L.cyl((0, 0, z), r - width / 2, depth * 4, mat, verts=verts)
    m = o.modifiers.new('hole', 'BOOLEAN'); m.object = hole; m.operation = 'DIFFERENCE'
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='hole'); bpy.data.objects.remove(hole, do_unlink=True)
    return o


def spoke(theta, r0, r1, width, mat, z, name='flat-path'):
    """A straight flat strip from radius r0 to r1 (island units) along island angle theta."""
    x0, y0 = to_b(theta, r0); x1, y1 = to_b(theta, r1)
    ln = math.hypot(x1 - x0, y1 - y0)
    o = L.box(((x0 + x1) / 2, (y0 + y1) / 2, z), (width, ln, 0.02), mat, name=name)
    o.rotation_euler.z = math.atan2(y1 - y0, x1 - x0) - math.pi / 2
    return o


def scatter(n, ok, pick, z=0.0, tries=4000):
    """Place n models at random spots inside the base where ok(x, y) is true; pick() → (kit, name, scale)."""
    import random as _r
    placed = 0
    for _ in range(tries):
        if placed >= n: break
        x, y = _r.uniform(-10, 10), _r.uniform(-10, 10)
        if not ok(x, y): continue
        kit, name, s = pick()
        L.add(kit, name, (x, y, z), _r.uniform(0, 360), s)
        placed += 1


def set_terrain(wid, model, y, radius, ring, tools, slots, agora, hotel, summit_y=None, camera=None):
    """Write a pack's terrain block (island units): tools {key: (theta, r)}, slots [(theta, r)] x13, agora/hotel (theta, r)."""
    p = os.path.join(APP, 'public', 'worlds', wid, 'world.json')
    with open(p, encoding='utf-8') as f: d = json.load(f)
    assert len(slots) == 13, 'the server hands out 13 project spots'
    keep = {k: v for k, v in d.get('terrain', {}).items() if k not in ('model', 'y', 'radius', 'layout')}  # fill, lamps
    d['terrain'] = {**keep, 'model': model, 'y': y, 'radius': radius, 'layout': {
        'summit': [0, y if summit_y is None else summit_y, 0],
        'tools': {k: {'theta': t, 'r': r} for k, (t, r) in tools.items()},
        'projectSlots': [{'theta': t, 'r': r} for t, r in slots],
        'agora': {'theta': agora[0], 'r': agora[1]}, 'hotel': {'theta': hotel[0], 'r': hotel[1]},
        'pond': {'theta': 0, 'r': 0, 'radius': 0}, 'ringRoad': ring}}
    if camera: d['camera'] = camera
    with open(p, 'w', encoding='utf-8') as f: f.write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
    return d


# ---- layouts at any spot: map worlds rebuilt straight from their mockups ------------------------------------
def spot(bx, by, look=None):
    """A layout spot at Blender (bx, by); look=(lx, ly) turns the building to face that Blender point."""
    x, z = bx * S, -by * S
    out = {'theta': round(math.degrees(math.atan2(z, x)) % 360, 2), 'r': round(math.hypot(x, z), 3)}
    if look is not None:
        dx, dz = look[0] * S - x, -look[1] * S - z
        out['face'] = round(math.degrees(math.atan2(-dz, -dx)) % 360, 2)  # place() faces it as if it stood at that angle
    return out


def graph(nodes, edges):
    """Walkways for the characters: nodes in Blender (x, y), edges as index pairs."""
    return {'nodes': [[round(x * S, 2), round(-y * S, 2)] for x, y in nodes], 'edges': [list(e) for e in edges]}


def grid_graph(xs, ys, skip=lambda x, y: False):
    """Walkways along every row ys and column xs (Blender units), joined where they cross."""
    nodes, idx = [], {}
    for x in xs:
        for y in ys:
            if skip(x, y): continue
            idx[(x, y)] = len(nodes); nodes.append((x, y))
    edges = []
    for i, x in enumerate(xs):
        for j, y in enumerate(ys):
            if (x, y) not in idx: continue
            if i + 1 < len(xs) and (xs[i + 1], y) in idx: edges.append((idx[(x, y)], idx[(xs[i + 1], y)]))
            if j + 1 < len(ys) and (x, ys[j + 1]) in idx: edges.append((idx[(x, y)], idx[(x, ys[j + 1])]))
    return graph(nodes, edges)


def set_layout(wid, model, y, radius, layout, camera=None, extra=None):
    """Write a pack's terrain with a ready-made layout (spots from spot(), paths from graph())."""
    p = os.path.join(APP, 'public', 'worlds', wid, 'world.json')
    with open(p, encoding='utf-8') as f: d = json.load(f)
    assert len(layout['projectSlots']) == 13, 'the server hands out 13 project spots'
    keep = {k: v for k, v in d.get('terrain', {}).items() if k not in ('model', 'y', 'radius', 'layout')}
    layout.setdefault('pond', {'theta': 0, 'r': 0, 'radius': 0})
    d['terrain'] = {**keep, 'model': model, 'y': y, 'radius': radius, 'layout': layout}
    if camera: d['camera'] = camera
    for k, v in (extra or {}).items(): d[k] = v
    with open(p, 'w', encoding='utf-8') as f: f.write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
    return d


def blender_camera(loc, target, lens, w=1600, h=1000):
    """A mockup's Blender camera as the app's camera block (island units, vertical fov)."""
    vfov = math.degrees(2 * math.atan(18 / lens * h / w))
    return {'pos': [round(loc[0] * S, 2), round(loc[2] * S, 2), round(-loc[1] * S, 2)],
            'target': [round(target[0] * S, 2), round(target[2] * S, 2), round(-target[1] * S, 2)], 'fov': round(vfov, 1)}

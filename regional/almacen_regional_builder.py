# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  almacen_regional_builder.py · Fase 2 (nivel regional)
#  Almacén regional tipo (versión pequeña del CEDIS) para el nivel entre el
#  CEDIS estatal y las unidades: p. ej. Tula, Tulancingo y Huejutla.
#   · nave 36 × 22 m, 2 andenes de carga y 1 de recepción,
#   · 6 racks de tarima (3 niveles), 4 estantes de picking,
#   · cuarto frío 2–8 °C (4 × 5 m) y jaula de controlados,
#   · área de consolidación por ruta, oficina y patio con camionetas.
#  Cada ubicación es un empty con wh_type = slot_pallet / slot_shelf (igual que el
#  CEDIS) para ligarla al inventario. Exporta almacen_regional.glb a web/assets.
#  Uso: exec(open(r"...\\regional\\almacen_regional_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export()
# =====================================================================
import bpy, bmesh, os, math

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "regional")
W, D, HGT = 36.0, 22.0, 8.0


def mat(name, rgb, rough=0.6, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else m.blend_method
    m.diffuse_color = (*rgb, alpha)
    return m


M = {}


def mats():
    M.update(
        floor=mat('RG_Piso', (0.62, 0.63, 0.62), 0.8), wall=mat('RG_Muro', (0.86, 0.87, 0.85)),
        steel=mat('RG_Acero', (0.18, 0.4, 0.75), 0.4, 0.6), beam=mat('RG_Larguero', (0.95, 0.5, 0.1), 0.45, 0.4),
        pallet=mat('RG_Tarima', (0.6, 0.45, 0.28)), box=mat('RG_Caja', (0.82, 0.7, 0.52)), boxw=mat('RG_CajaBlanca', (0.93, 0.93, 0.9)),
        cold=mat('RG_Frio', (0.75, 0.88, 0.95), 0.3), cage=mat('RG_Jaula', (0.3, 0.3, 0.32), 0.4, 0.7),
        yellow=mat('RG_Amarillo', (0.98, 0.8, 0.1)), asphalt=mat('RG_Asfalto', (0.2, 0.2, 0.22), 0.9),
        roof=mat('RG_Techo', (0.55, 0.58, 0.6), 0.5, 0.3), van=mat('RG_Camioneta', (0.95, 0.95, 0.96), 0.35),
        teal=mat('RG_Marca', (0.08, 0.72, 0.65)), glass=mat('RG_Vidrio', (0.4, 0.6, 0.75), 0.1), dark=mat('RG_Oscuro', (0.08, 0.08, 0.09)),
        dock=mat('RG_Anden', (0.25, 0.25, 0.27), 0.7))


def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def box(name, c, loc, size, m, props=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    c.objects.link(o)
    for k, v in (props or {}).items():
        o[k] = v
    return o


def empty(name, c, loc, props):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.2; o.location = loc
    c.objects.link(o)
    for k, v in props.items():
        o[k] = v
    return o


def text(name, c, body, loc, size, m, rot=(math.pi / 2, 0, 0)):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.resolution_u = 2
    t = bpy.data.objects.new(name + '_tmp', cu)
    t.location = loc; t.rotation_euler = rot
    c.objects.link(t)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(t.evaluated_get(dg))
    o = bpy.data.objects.new(name, me)
    o.matrix_world = t.matrix_world.copy()
    if not me.materials:
        me.materials.append(m)
    c.objects.link(o)
    bpy.data.objects.remove(t, do_unlink=True)
    return o


def building(c):
    box('RG_Piso', c, (W / 2, D / 2, -0.1), (W, D, 0.2), M['floor'])
    box('RG_Patio', c, (W / 2, -9, -0.12), (W + 16, 18, 0.2), M['asphalt'])
    t = 0.25
    box('RG_Muro_Norte', c, (W / 2, D, HGT / 2), (W, t, HGT), M['wall'])
    box('RG_Muro_Este', c, (W, D / 2, HGT / 2), (t, D, HGT), M['wall'])
    box('RG_Muro_Oeste', c, (0, D / 2, HGT / 2), (t, D, HGT), M['wall'])
    # fachada sur con 3 andenes (x = 8, 14, 20) y franja de marca
    xs = [8, 14, 20]
    edges = [0] + [v for x in xs for v in (x - 1.6, x + 1.6)] + [W]
    for i in range(0, len(edges), 2):
        a, b = edges[i], edges[i + 1]
        box(f'RG_Muro_Sur_{i // 2}', c, ((a + b) / 2, 0, HGT / 2), (b - a, t, HGT), M['wall'])
    for k, x in enumerate(xs):
        box(f'RG_Dintel_{k}', c, (x, 0, (3.6 + HGT) / 2), (3.2, t, HGT - 3.6), M['wall'])
        box(f'RG_Cortina_{k}', c, (x, 0.02, 3.2), (3.0, 0.1, 0.8), M['dark'])
        box(f'RG_Anden_{k}', c, (x, -1.2, 0.55), (3.4, 2.4, 1.1), M['dock'], {'wh_type': 'dock', 'wh_dock': 'Recepción' if k == 2 else f'Despacho {k + 1}'})
        box(f'RG_Tope_{k}', c, (x, -2.45, 0.7), (3.0, 0.15, 0.3), M['yellow'])
        text(f'RG_Anden_Txt_{k}', c, 'RECEPCIÓN' if k == 2 else f'DESPACHO {k + 1}', (x, -0.16, 4.3), 0.38, M['dark'])
    box('RG_Franja', c, (W / 2, -0.16, HGT - 0.8), (W, 0.06, 1.0), M['teal'])
    text('RG_Rotulo', c, 'ALMACÉN REGIONAL DE MEDICAMENTOS', (W / 2, -0.2, HGT - 0.8), 0.55, M['wall'])
    # techo a dos aguas (bajo) con estructura visible
    for k in range(7):
        y = 1 + k * (D - 2) / 6
        box(f'RG_Viga_{k}', c, (W / 2, y, HGT - 0.2), (W, 0.25, 0.4), M['steel'])
    roof = box('RG_Techo', c, (W / 2, D / 2, HGT + 0.1), (W + 0.6, D + 0.6, 0.15), M['roof'])
    roof['wh_type'] = 'roof'


def rack(c, cs, name, x0, y, bays=4, levels=3, zone='Seco'):
    """Rack selectivo: postes, largueros y una ubicación por tarima."""
    bw, dep, lh = 2.7, 1.1, 1.75
    L = bays * bw
    for i in range(bays + 1):
        for dy in (-dep / 2, dep / 2):
            box(f'{name}_Poste_{i}_{"a" if dy < 0 else "b"}', c, (x0 + i * bw, y + dy, levels * lh / 2 + 0.3), (0.09, 0.09, levels * lh + 0.6), M['steel'])
    for lv in range(levels):
        z = 0.15 + lv * lh
        for dy in (-dep / 2, dep / 2):
            box(f'{name}_Larguero_{lv}_{"a" if dy < 0 else "b"}', c, (x0 + L / 2, y + dy, z), (L, 0.06, 0.12), M['beam'])
        for b in range(bays):
            for p in range(2):
                cx = x0 + b * bw + bw * (0.27 + 0.46 * p)
                pos = (cx, y, z + 0.08)
                empty(f'{name}_Slot_B{b + 1}_L{lv + 1}_P{p + 1}', cs, pos, {'wh_type': 'slot_pallet', 'wh_zone': zone, 'wh_rack': name})
                if (b + lv + p) % 4 != 3:      # 75 % ocupado
                    box(f'{name}_Tarima_{b}_{lv}_{p}', c, (cx, y, z + 0.13), (1.0, 1.0, 0.14), M['pallet'])
                    h = 0.9 if lv < levels - 1 else 0.7
                    box(f'{name}_Carga_{b}_{lv}_{p}', c, (cx, y, z + 0.2 + h / 2), (0.95, 0.95, h), M['box'] if (b + p) % 3 else M['boxw'])


def shelf(c, cs, name, x, y, levels=5, zone='Picking'):
    w, dep = 2.0, 0.6
    for dx in (-w / 2, w / 2):
        for dy in (-dep / 2, dep / 2):
            box(f'{name}_Poste_{dx > 0}_{dy > 0}', c, (x + dx, y + dy, 1.1), (0.05, 0.05, 2.2), M['steel'])
    for lv in range(levels):
        z = 0.15 + lv * 0.48
        box(f'{name}_Repisa_{lv}', c, (x, y, z), (w, dep, 0.03), M['steel'])
        for k in range(3):
            cx = x - w / 3 + k * w / 3
            empty(f'{name}_Slot_L{lv + 1}_P{k + 1}', cs, (cx, y, z + 0.02), {'wh_type': 'slot_shelf', 'wh_zone': zone, 'wh_rack': name})
            if (lv + k) % 3:
                box(f'{name}_Caja_{lv}_{k}', c, (cx, y, z + 0.14), (0.55, 0.45, 0.24), M['boxw'] if k % 2 else M['box'])


def van(c, name, x, y, rot):
    o = box(name, c, (x, y, 1.05), (2.0, 5.2, 1.9), M['van'], {'wh_type': 'vehicle'})
    o.rotation_euler = (0, 0, rot)
    cab = box(name + '_Cabina', c, (0, -2.75, -0.35), (1.9, 0.6, 1.2), M['van'])
    cab.parent = o; cab.location = (0, -2.85, -0.3)
    for k, (dx, dy) in enumerate([(-0.95, -1.8), (0.95, -1.8), (-0.95, 1.7), (0.95, 1.7)]):
        w = box(f'{name}_Rueda_{k}', c, (0, 0, 0), (0.25, 0.7, 0.7), M['dark'])
        w.parent = o; w.location = (dx, dy, -0.75)
    s = box(name + '_Franja', c, (0, 0, 0), (2.02, 4.0, 0.25), M['teal'])
    s.parent = o; s.location = (0, 0.3, 0.2)


def interior(c, cs):
    # 6 racks de tarima en 3 pasillos (lado norte)
    for k in range(3):
        y = 12.5 + k * 3.4
        rack(c, cs, f'RG_Rack_{chr(65 + k)}1', 2.0, y)
        rack(c, cs, f'RG_Rack_{chr(65 + k)}2', 2.0 + 4 * 2.7 + 3.0, y)
    for k in range(3):
        box(f'RG_Pasillo_{k}', c, (W / 2 - 2, 10.8 + k * 3.4, 0.005), (26, 0.08, 0.01), M['yellow'])
    # picking
    for k in range(4):
        shelf(c, cs, f'RG_Estante_{k + 1}', 29.0, 12.0 + k * 2.2)
    # cuarto frío
    box('RG_CuartoFrio', c, (31.5, 5.0, 1.5), (5.0, 4.0, 3.0), M['cold'], {'wh_type': 'cold_room', 'wh_temp': '2–8 °C'})
    text('RG_CuartoFrio_Txt', c, '2–8 °C', (31.5, 2.96, 2.4), 0.35, M['dark'])
    for k in range(6):
        empty(f'RG_Frio_Slot_P{k + 1}', cs, (30.0 + (k % 3) * 1.4, 4.0 + (k // 3) * 2.0, 0.3), {'wh_type': 'slot_shelf', 'wh_zone': 'Red fría'})
    # jaula de controlados
    box('RG_Controlados', c, (26.0, 4.0, 1.2), (3.0, 2.5, 2.4), M['cage'], {'wh_type': 'controlled_cage'})
    for k in range(4):
        empty(f'RG_CM_Slot_P{k + 1}', cs, (25.3 + (k % 2) * 1.4, 3.4 + (k // 2) * 1.2, 0.4), {'wh_type': 'slot_shelf', 'wh_zone': 'Controlados'})
    # consolidación por ruta (tarimas en piso frente a andenes)
    for k, x in enumerate([8, 14]):
        for j in range(3):
            box(f'RG_Consol_{k}_{j}', c, (x - 1.1 + j * 1.1, 3.2, 0.07), (1.0, 1.0, 0.14), M['pallet'])
            box(f'RG_ConsolCarga_{k}_{j}', c, (x - 1.1 + j * 1.1, 3.2, 0.6), (0.95, 0.95, 0.9 - 0.2 * j), M['box'])
        box(f'RG_Zona_Ruta_{k}', c, (x, 3.2, 0.006), (3.6, 1.6, 0.01), M['teal'])
    # oficina
    box('RG_Oficina', c, (3.5, 4.0, 1.4), (6.0, 5.0, 2.8), M['wall'], {'wh_type': 'office'})
    box('RG_Oficina_Ventana', c, (3.5, 6.52, 1.7), (4.5, 0.05, 1.1), M['glass'])
    # patio con 2 camionetas en andenes de despacho
    van(c, 'RG_Camioneta_1', 8, -5.6, 0)
    van(c, 'RG_Camioneta_2', 14, -5.6, 0)


def cameras(c):
    cam = bpy.data.objects.new('RG_Cam_General', bpy.data.cameras.new('RG_Cam_General'))
    c.objects.link(cam)
    cam.location = (W + 14, -20, 22)
    tgt = bpy.data.objects.new('RG_Cam_Target', None); c.objects.link(tgt); tgt.location = (W / 2, D / 2 - 3, 0)
    cam.rotation_euler = (tgt.location - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 30
    bpy.context.scene.camera = cam


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mats()
    c, cs, ce = coll('RG_Edificio'), coll('RG_Ubicaciones'), coll('RG_Equipo')
    building(c)
    interior(ce, cs)
    cameras(c)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'almacen_regional.blend'))
    slots = [o for o in cs.objects]
    return {'objects': len(bpy.data.objects), 'slots_tarima': sum(1 for o in slots if o.get('wh_type') == 'slot_pallet'), 'slots_estante': sum(1 for o in slots if o.get('wh_type') == 'slot_shelf')}


def preview(path=None, roof=False):
    sc = bpy.context.scene
    r = bpy.data.objects.get('RG_Techo')
    if r: r.hide_render = not roof
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1200, 700, 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_almacen_regional.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def export():
    glb = os.path.join(OUT, 'almacen_regional.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True, export_lights=False, export_cameras=True, export_yup=True)
    import shutil
    shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'almacen_regional.glb'))
    return {'glb': os.path.getsize(glb)}

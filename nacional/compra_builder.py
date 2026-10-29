# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  compra_builder.py · Línea de la compra consolidada (diorama)
#  Para la vista 3D de compras.html. Las claves del plan avanzan por la
#  línea como tarimas: cada arco es un filtro del procedimiento y las que
#  no pasan caen a la fosa de desiertas. En metros, eje X = avance.
#   · Plan anual (x 0): andén de salida con el escritorio de Planeación.
#   · Arcos (wh_type = gate, wh_key): convocatoria, evaluación técnica,
#     precio, fallo (con estrado) y firma de contratos.
#   · Carril de patente y fuente única (z −26) que va directo a la firma.
#   · Fosa de desiertas (z +30), arco de segunda vuelta y fosa "sin contrato".
#   · Laboratorios al fondo (z −58) y CENADI al final (x 190) con andenes.
#   · Anclas (wh_type = anchor, wh_key) donde el visor acomoda las tarimas.
#   · Lámparas de cada arco (wh_type = gate_lamp, wh_key): el visor las pinta.
#  Uso: exec(open(r"...\\nacional\\compra_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export(copy_to_web=True)
# =====================================================================
import bpy, bmesh, os, math

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "nacional")

GATES = [  # clave, letrero, x
    ('convocatoria', 'Convocatoria y apertura', 34.0),
    ('tecnica', 'Evaluación técnica', 62.0),
    ('precio', 'Precio aceptable', 90.0),
    ('fallo', 'Fallo', 118.0),
    ('firma', 'Firma de contratos', 148.0),
]
ANCHORS = {  # dónde se acomodan las tarimas (x, z de Blender = −z de three)
    'plan': (8, 0), 'convocatoria': (34, 0), 'tecnica': (62, 0), 'precio': (90, 0), 'fallo': (118, 0), 'firma': (148, 0),
    'patente': (90, 26), 'desiertas': (90, -32), 'segunda': (148, -32), 'sincontrato': (176, -34), 'cenadi': (174, 0),
}


def mat(name, rgb, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*rgb, 1)
    return m


M = {}


def mats():
    M.update(
        suelo=mat('CP_Suelo', (0.09, 0.11, 0.13), 0.95),
        carril=mat('CP_Carril', (0.20, 0.23, 0.27), 0.9),
        linea=mat('CP_Linea', (0.85, 0.85, 0.80), 0.8),
        arco=mat('CP_Arco', (0.80, 0.82, 0.85), 0.5, 0.3),
        letrero=mat('CP_Letrero', (0.07, 0.09, 0.11), 0.6),
        texto=mat('CP_Texto', (0.92, 0.95, 0.97), 0.5, 0.0, 0.6),
        lampara=mat('CP_Lampara', (0.18, 0.83, 0.75), 0.4, 0.0, 1.0),
        fosa=mat('CP_Fosa', (0.30, 0.08, 0.10), 0.9),
        fosa2=mat('CP_FosaSin', (0.45, 0.05, 0.07), 0.9),
        borde=mat('CP_Borde', (0.97, 0.45, 0.45), 0.5, 0.0, 0.4),
        patente=mat('CP_CarrilPatente', (0.16, 0.25, 0.42), 0.9),
        nave=mat('CP_Nave', (0.86, 0.87, 0.88), 0.5, 0.2),
        techo=mat('CP_Techo', (0.55, 0.58, 0.62), 0.5, 0.4),
        anden=mat('CP_Anden', (0.35, 0.37, 0.40), 0.8),
        cortina=mat('CP_Cortina', (0.25, 0.28, 0.32), 0.5, 0.3),
        fabrica=mat('CP_Fabrica', (0.62, 0.64, 0.68), 0.6),
        chimenea=mat('CP_Chimenea', (0.40, 0.42, 0.46), 0.6),
        madera=mat('CP_Escritorio', (0.45, 0.30, 0.15), 0.7),
        guinda=mat('CP_Guinda', (0.62, 0.13, 0.25), 0.5),
    )


def box(name, c, center, size, m, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = center; o.rotation_euler.z = rot_z
    c.objects.link(o)
    return o


def cyl(name, c, center, r, depth, m, seg=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = center
    c.objects.link(o)
    return o


def text(name, c, s, loc, size, m, align='CENTER'):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = s; cu.size = size
    cu.align_x = align; cu.align_y = 'CENTER'; cu.resolution_u = 2; cu.extrude = 0.05
    o = bpy.data.objects.new(name, cu); c.objects.link(o)
    o.location = loc; o.rotation_euler = (math.pi / 2, 0, 0)          # de frente hacia −Y (la cámara)
    o.data.materials.append(m)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    mo = bpy.data.objects.new(name, me); mo.matrix_world = o.matrix_world.copy(); c.objects.link(mo)
    me.materials.clear(); me.materials.append(m)
    bpy.data.objects.remove(o, do_unlink=True)
    return mo


def anchor(c, key, x, y):
    e = bpy.data.objects.new(f'CP_Ancla_{key}', None)
    e.location = (x, y, 0.2); c.objects.link(e)
    e['wh_type'] = 'anchor'; e['wh_key'] = key
    return e


def gate(c, key, label, x, big=False):
    w, h = (34, 15) if big else (30, 12)
    for s in (-1, 1):
        box(f'CP_Poste_{key}_{s}', c, (x, s * w / 2, h / 2), (1.2, 1.2, h), M['arco'])
    box(f'CP_Dintel_{key}', c, (x, 0, h), (1.4, w + 1.2, 1.2), M['arco'])
    sw = max(12.0, len(label) * 1.15 + 3)
    box(f'CP_Letrero_{key}', c, (x, -w / 2 - 0.6, h + 3.4), (sw, 0.4, 4.2), M['letrero'])
    text(f'CP_Txt_{key}', c, label, (x, -w / 2 - 0.85, h + 3.4), 2.1, M['texto'])
    lamp = box(f'CP_Lampara_{key}', c, (x, -w / 2 - 0.6, h + 6.0), (sw, 0.6, 0.6), mat(f'CP_Lampara_{key}', (0.18, 0.83, 0.75), 0.4, 0.0, 1.2))
    lamp['wh_type'] = 'gate_lamp'; lamp['wh_key'] = key
    g = bpy.data.objects.new(f'CP_Arco_{key}', None); g.location = (x, 0, 0); c.objects.link(g)
    g['wh_type'] = 'gate'; g['wh_key'] = key; g['wh_name'] = label


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mats()
    c = bpy.data.collections.new('CP_Linea'); bpy.context.scene.collection.children.link(c)
    w = bpy.data.worlds.new('CP_Cielo'); w.color = (0.04, 0.06, 0.09); bpy.context.scene.world = w
    s = box('CP_Suelo', c, (100, 8, -0.1), (240, 140, 0.2), M['suelo']); s['wh_type'] = 'ground'
    # carril principal con líneas
    box('CP_Carril', c, (100, 0, 0.02), (196, 26, 0.04), M['carril'])
    for x in range(6, 196, 8):
        box(f'CP_Raya_{x}', c, (x + 2, 13.5, 0.05), (4, 0.4, 0.02), M['linea'])
        box(f'CP_RayaB_{x}', c, (x + 2, -13.5, 0.05), (4, 0.4, 0.02), M['linea'])
    # carril de patente
    box('CP_CarrilPatente', c, (78, 26, 0.03), (140, 12, 0.04), M['patente'])
    text('CP_TxtPatente', c, 'Patente y fuente única: adjudicación directa', (40, 33, 2.2), 2.0, M['texto'])
    # plan anual: andén de salida con escritorio
    box('CP_AndenPlan', c, (8, 0, 0.6), (14, 24, 1.2), M['anden'])
    box('CP_Escritorio', c, (2, 0, 1.9), (2.5, 6, 1.4), M['madera'])
    box('CP_PlanLetrero', c, (-1, 0, 5), (0.4, 16, 3.4), M['guinda'])
    box('CP_PlanLetrero2', c, (8, -13, 5), (12, 0.4, 3.4), M['guinda'])
    text('CP_TxtPlan', c, 'Plan anual', (8, -13.25, 5), 2.2, M['texto'])
    for key, label, x in GATES:
        gate(c, key, label, x, big=(key == 'fallo'))
    # estrado del fallo
    box('CP_Estrado', c, (118, 20, 0.8), (10, 6, 1.6), M['madera'])
    # fosas
    box('CP_FosaDesiertas', c, (90, -32, 0.03), (44, 16, 0.06), M['fosa'])
    for sx, sy, lx, ly in ((90, -24, 44, 0.6), (90, -40, 44, 0.6), (68, -32, 0.6, 16), (112, -32, 0.6, 16)):
        box(f'CP_Borde_{sx}_{sy}', c, (sx, sy, 0.3), (lx, ly, 0.6), M['borde'])
    text('CP_TxtDesiertas', c, 'Desiertas', (90, -41, 1.6), 2.6, M['texto'])
    box('CP_FosaSin', c, (176, -34, 0.03), (20, 14, 0.06), M['fosa2'])
    for sx, sy, lx, ly in ((176, -27, 20, 0.6), (176, -41, 20, 0.6), (166, -34, 0.6, 14), (186, -34, 0.6, 14)):
        box(f'CP_BordeSin_{sx}_{sy}', c, (sx, sy, 0.3), (lx, ly, 0.6), M['borde'])
    text('CP_TxtSin', c, 'Sin contrato', (176, -42, 1.6), 2.4, M['texto'])
    gate(c, 'segunda', 'Segunda vuelta', 148.0)
    seg = [o for o in c.objects if o.name.startswith(('CP_Poste_segunda', 'CP_Dintel_segunda', 'CP_Letrero_segunda', 'CP_Txt_segunda', 'CP_Lampara_segunda', 'CP_Arco_segunda'))]
    for o in seg:
        o.location.y -= 32
    box('CP_CarrilSegunda', c, (130, -32, 0.03), (36, 12, 0.04), M['carril'])
    # CENADI al final
    box('CP_Nave', c, (200, 0, 7), (24, 40, 14), M['nave'])
    box('CP_NaveTecho', c, (200, 0, 14.4), (25, 41, 0.8), M['techo'])
    for i in range(5):
        box(f'CP_Cortina_{i}', c, (187.9, -14 + i * 7, 3), (0.3, 4.5, 5), M['cortina'])
    box('CP_AndenNave', c, (186, 0, 0.6), (4, 38, 1.2), M['anden'])
    text('CP_TxtCenadi', c, 'CENADI', (200, -20.3, 10), 3.4, M['texto'])
    # laboratorios al fondo
    for i in range(8):
        x = 30 + i * 21
        box(f'CP_Fabrica_{i}', c, (x, 58, 4), (14, 10, 8), M['fabrica'])
        box(f'CP_Diente_{i}', c, (x, 58, 9), (14, 10, 2), M['techo'])
        cyl(f'CP_Chimenea_{i}', c, (x + 4, 60, 11), 0.8, 10, M['chimenea'])
    text('CP_TxtLabs', c, 'Laboratorios', (14, 52, 2.0), 2.4, M['texto'], align='RIGHT')
    for k, (x, y) in ANCHORS.items():
        anchor(c, k, x, y)
    # unir la geometría fija por material
    bpy.context.view_layer.update()
    groups = {}
    for o in list(c.objects):
        if o.type != 'MESH' or o.get('wh_type') in ('gate_lamp', 'ground'):
            continue
        groups.setdefault(o.data.materials[0].name, []).append(o)
    ctx = bpy.context
    for mname, objs in groups.items():
        if len(objs) < 2:
            continue
        for o in ctx.view_layer.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        ctx.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        ctx.view_layer.objects.active.name = f'CP_{mname[3:]}'
    cam = bpy.data.objects.new('CP_Cam', bpy.data.cameras.new('CP_Cam'))
    cam.data.lens = 24
    cam.location = (60, -150, 110)
    from mathutils import Vector
    cam.rotation_euler = (Vector((105, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    c.objects.link(cam); bpy.context.scene.camera = cam
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'compra.blend'))
    return {'objetos': len(c.objects), 'caras': sum(len(o.data.polygons) for o in c.objects if o.type == 'MESH')}


def preview(path=None, res=(1600, 900)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'; sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = res[0], res[1], 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_compra.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def export(copy_to_web=False):
    glb = os.path.join(OUT, 'compra.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True, export_lights=False, export_cameras=False, export_yup=True)
    if copy_to_web:
        import shutil
        shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'compra.glb'))
    return {'glb': os.path.getsize(glb)}

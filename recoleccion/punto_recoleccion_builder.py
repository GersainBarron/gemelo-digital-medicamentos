# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  punto_recoleccion_builder.py · Fase 4 (última milla al paciente)
#  Casillero inteligente 24 h para recoger medicamentos con código QR:
#   · 24 compartimentos (4 tamaños de puerta) en dos bloques,
#   · módulo central con pantalla táctil, lector QR y teclado,
#   · techo con iluminación, letrero y base de concreto,
#   · compartimentos con propiedad wh_type = locker_slot para ligarlos a las entregas.
#  Origen al centro de la base; el frente mira a −Y (hacia la calle).
#  Se usa en la plaza de acceso de la unidad (unit3d.js) y como punto aliado.
#  Uso: exec(open(r"...\\recoleccion\\punto_recoleccion_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export()
# =====================================================================
import bpy, bmesh, os, math

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "recoleccion")
WEB = os.path.join(ROOT, "web", "assets")
M = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=0.0):
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


def box(name, x0, y0, z0, x1, y1, z1, m, props=None, coll=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    (coll or bpy.context.scene.collection).objects.link(o)
    for k, v in (props or {}).items():
        o[k] = v
    return o


def text(name, body, loc, size, m, coll):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.resolution_u = 2
    t = bpy.data.objects.new(name + '_tmp', cu)
    t.location = loc; t.rotation_euler = (math.pi / 2, 0, 0)
    coll.objects.link(t)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(t.evaluated_get(dg))
    if not me.materials:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.matrix_world = t.matrix_world.copy()
    coll.objects.link(o)
    bpy.data.objects.remove(t, do_unlink=True)
    return o


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    M.update(body=mat('PR_Cuerpo', (0.93, 0.94, 0.95), 0.35), door=mat('PR_Puerta', (0.85, 0.87, 0.89), 0.3, 0.2),
             teal=mat('PR_Turquesa', (0.08, 0.72, 0.65), 0.4), dark=mat('PR_Oscuro', (0.07, 0.08, 0.1), 0.4),
             screen=mat('PR_Pantalla', (0.2, 0.55, 0.85), 0.2, 0, 1.5), led=mat('PR_LED', (0.4, 1.0, 0.7), 0.2, 0, 3.0),
             ledr=mat('PR_LED_ocupado', (1.0, 0.45, 0.3), 0.2, 0, 3.0), concrete=mat('PR_Concreto', (0.62, 0.62, 0.6), 0.9),
             steel=mat('PR_Acero', (0.55, 0.57, 0.6), 0.35, 0.8), white=mat('PR_Blanco', (0.98, 0.98, 0.98), 0.4),
             light=mat('PR_Luz', (1.0, 0.97, 0.88), 0.2, 0, 4.0))
    c = bpy.data.collections.new('Punto_Recoleccion'); bpy.context.scene.collection.children.link(c)
    W, D, Hb = 3.3, 0.75, 2.05
    box('PR_Base', -W / 2 - 0.15, -D / 2 - 0.25, 0, W / 2 + 0.15, D / 2 + 0.1, 0.12, M['concrete'], coll=c)
    box('PR_Cuerpo', -W / 2, -D / 2, 0.12, W / 2, D / 2, 0.12 + Hb, M['body'], {'wh_type': 'locker'}, coll=c)
    # compartimentos: dos bloques de 3 columnas × 4 filas (alturas distintas) a cada lado del módulo central
    rows = [0.32, 0.4, 0.5, 0.6]
    z0 = 0.2; n = 0
    cw = 0.36
    for side in (-1, 1):
        for col in range(3):
            a = 0.46 + col * (cw + 0.04)
            x0, x1 = (-a - cw, -a) if side < 0 else (a, a + cw)
            z = z0
            for r, h in enumerate(rows):
                n += 1
                box(f'PR_Puerta_{n:02d}', x0, -D / 2 - 0.02, z, x1, -D / 2 + 0.005, z + h - 0.03, M['door'],
                    {'wh_type': 'locker_slot', 'wh_slot': n, 'wh_size': ['S', 'M', 'L', 'XL'][r]}, coll=c)
                box(f'PR_Manija_{n:02d}', x1 - 0.06 if side < 0 else x0 + 0.03, -D / 2 - 0.035, z + h / 2 - 0.06, x1 - 0.03 if side < 0 else x0 + 0.06, -D / 2 - 0.02, z + h / 2 + 0.06, M['steel'], coll=c)
                box(f'PR_Led_{n:02d}', (x0 + x1) / 2 - 0.03, -D / 2 - 0.03, z + h - 0.09, (x0 + x1) / 2 + 0.03, -D / 2 - 0.02, z + h - 0.06, M['led'] if (n * 7) % 3 else M['ledr'], coll=c)
                z += h
    # módulo central: pantalla, lector QR, teclado y ranura de comprobante
    box('PR_Modulo', -0.4, -D / 2 - 0.03, 0.12, 0.4, -D / 2 + 0.01, 0.12 + Hb, M['teal'], coll=c)
    box('PR_Pantalla_marco', -0.32, -D / 2 - 0.06, 1.15, 0.32, -D / 2 - 0.03, 1.75, M['dark'], coll=c)
    box('PR_Pantalla', -0.29, -D / 2 - 0.065, 1.18, 0.29, -D / 2 - 0.06, 1.72, M['screen'], coll=c)
    box('PR_Lector_QR', -0.12, -D / 2 - 0.12, 0.92, 0.12, -D / 2 - 0.03, 1.05, M['dark'], coll=c)
    box('PR_Lector_luz', -0.08, -D / 2 - 0.125, 0.95, 0.08, -D / 2 - 0.12, 1.02, M['led'], coll=c)
    box('PR_Teclado', -0.2, -D / 2 - 0.1, 0.72, 0.2, -D / 2 - 0.03, 0.86, M['dark'], coll=c)
    box('PR_Ranura', -0.1, -D / 2 - 0.04, 0.6, 0.1, -D / 2 - 0.03, 0.63, M['dark'], coll=c)
    text('PR_Cruz', '+', (0, -D / 2 - 0.035, 1.92), 0.32, M['white'], c)
    # techo con luz y letrero
    box('PR_Techo', -W / 2 - 0.3, -D / 2 - 0.55, 0.12 + Hb + 0.12, W / 2 + 0.3, D / 2 + 0.1, 0.12 + Hb + 0.24, M['white'], coll=c)
    box('PR_Luz', -W / 2 + 0.2, -D / 2 - 0.45, 0.12 + Hb + 0.1, W / 2 - 0.2, -D / 2 - 0.35, 0.12 + Hb + 0.12, M['light'], coll=c)
    for x in (-W / 2 - 0.1, W / 2 + 0.1):
        box('PR_Soporte', x - 0.04, -D / 2 - 0.04, 0.12 + Hb, x + 0.04, D / 2, 0.12 + Hb + 0.12, M['steel'], coll=c)
    box('PR_Letrero', -W / 2, -D / 2 - 0.56, 0.12 + Hb + 0.26, W / 2, -D / 2 - 0.5, 0.12 + Hb + 0.62, M['teal'], coll=c)
    text('PR_Letrero_txt', 'ENTREGA DE MEDICAMENTOS · 24 H', (0, -D / 2 - 0.57, 0.12 + Hb + 0.44), 0.15, M['white'], c)
    text('PR_Instrucciones', 'Escanea tu código QR', (0, -D / 2 - 0.07, 1.86), 0.06, M['white'], c)
    # cámara para la vista previa
    cam = bpy.data.objects.new('PR_Cam', bpy.data.cameras.new('PR_Cam')); c.objects.link(cam)
    cam.location = (3.4, -5.2, 2.6)
    import mathutils
    cam.rotation_euler = (mathutils.Vector((0, 0, 1.2)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 35
    bpy.context.scene.camera = cam
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'punto_recoleccion.blend'))
    return {'objects': len(bpy.data.objects), 'compartimentos': n}


def preview():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1000, 700, 100
    sc.render.filepath = os.path.join(ROOT, 'renders', 'preview_punto_recoleccion.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def export():
    glb = os.path.join(OUT, 'punto_recoleccion.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True, export_lights=False, export_cameras=False, export_yup=True)
    import shutil
    shutil.copyfile(glb, os.path.join(WEB, 'punto_recoleccion.glb'))
    return {'glb': os.path.getsize(glb)}

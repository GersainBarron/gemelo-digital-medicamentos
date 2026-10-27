# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  delegacion_builder.py · Edificio delegacional del ISSSTE (genérico)
#  Para el flujo nacional 3D de Planeación (web/js/plan3d.js): se coloca
#  en la sede de cada una de las 32 delegaciones, junto a su pila de
#  peticiones. No reproduce un inmueble real (cada delegación ocupa uno
#  distinto); es el tipo de oficina de gobierno de 4 niveles con almacén
#  delegacional anexo. Medidas en metros, frente hacia -Y.
#   · Cuerpo de oficinas 36 × 18 m, 4 niveles de 3.6 m, bandas de ventana.
#   · Planta baja con pórtico de columnas y marquesina de acceso.
#   · Franja guinda con el letrero (el visor la pinta con el semáforo).
#   · Azotea: tinacos, equipos de aire, antena y baliza (también semáforo).
#   · Almacén delegacional atrás, con andén y cortinas.
#   · Asta con bandera y estacionamiento.
#  Ligas con el visor (extras wh_*):
#   · wh_type = delegacion   raíz del modelo
#   · wh_type = del_semaforo franja del letrero y baliza: color por instancia
#  Uso: exec(open(r"...\\nacional\\delegacion_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export(copy_to_web=True)
# =====================================================================
import bpy, bmesh, os, math

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "nacional")

W, D, NIV, HN = 36.0, 18.0, 4, 3.6          # cuerpo de oficinas
H = NIV * HN


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
        concreto=mat('DL_Concreto', (0.80, 0.78, 0.74), 0.85),
        concreto2=mat('DL_ConcretoOsc', (0.58, 0.57, 0.55), 0.85),
        vidrio=mat('DL_Vidrio', (0.16, 0.28, 0.36), 0.15, 0.3),
        guinda=mat('DL_Semaforo', (0.62, 0.13, 0.25), 0.5),       # franja y baliza: el visor la recolorea
        dorado=mat('DL_Dorado', (0.74, 0.60, 0.35), 0.4, 0.5),
        metal=mat('DL_Metal', (0.55, 0.57, 0.60), 0.4, 0.7),
        tinaco=mat('DL_Tinaco', (0.08, 0.09, 0.10), 0.7),
        lamina=mat('DL_Lamina', (0.70, 0.72, 0.74), 0.5, 0.4),
        cortina=mat('DL_Cortina', (0.36, 0.40, 0.44), 0.5, 0.3),
        piso=mat('DL_Piso', (0.30, 0.31, 0.33), 0.95),
        linea=mat('DL_Linea', (0.92, 0.92, 0.88), 0.8),
        verde=mat('DL_Jardin', (0.24, 0.42, 0.24), 0.95),
        bverde=mat('DL_BanderaVerde', (0.0, 0.40, 0.25), 0.8),
        bblanco=mat('DL_BanderaBlanco', (0.95, 0.95, 0.95), 0.8),
        brojo=mat('DL_BanderaRojo', (0.75, 0.10, 0.15), 0.8),
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


def edificio(c):
    y0 = 0.0                                                     # frente del cuerpo en y = -D/2
    # losa de planta baja retraída (pórtico) y niveles superiores
    box('DL_PB', c, (0, y0 + 1.5, HN / 2), (W - 4, D - 3, HN), M['concreto2'])
    for n in range(1, NIV):
        z = n * HN
        box(f'DL_Losa_{n}', c, (0, y0, z + 0.4), (W, D, 0.8), M['concreto'])                 # cerramiento
        box(f'DL_Ventana_{n}', c, (0, y0, z + 0.8 + 1.2), (W - 0.6, D - 0.6, 2.4), M['vidrio'])  # banda de ventanas
        box(f'DL_Antepecho_{n}', c, (0, y0, z + 3.3), (W, D, 0.6), M['concreto'])
    box('DL_Azotea', c, (0, y0, H + 0.3), (W + 0.4, D + 0.4, 0.6), M['concreto'])
    box('DL_Pretil', c, (0, y0, H + 0.9), (W + 0.4, D + 0.4, 0.6), M['concreto2'])
    # parteluces verticales en la fachada principal y la trasera
    for i in range(7):
        x = -W / 2 + 3 + i * (W - 6) / 6
        for s in (-1, 1):
            box(f'DL_Parteluz_{i}_{s}', c, (x, y0 + s * (D / 2 + 0.25), HN + (H - HN) / 2), (0.5, 0.5, H - HN), M['concreto'])
    # pórtico: columnas en planta baja
    for i in range(7):
        x = -W / 2 + 1 + i * (W - 2) / 6
        box(f'DL_Columna_{i}', c, (x, y0 - D / 2 + 0.6, HN / 2), (0.7, 0.7, HN), M['concreto'])
    # marquesina de acceso y escalinata
    box('DL_Marquesina', c, (0, y0 - D / 2 - 2.5, HN - 0.4), (12, 5, 0.4), M['concreto'])
    for i in range(3):
        box(f'DL_Escalon_{i}', c, (0, y0 - D / 2 - 3.8 + i * 0.7, 0.15 + i * 0.15), (14, 1.0, 0.3 + i * 0.3), M['concreto2'])
    box('DL_Acceso', c, (0, y0 - D / 2 + 1.55, 1.5), (6, 0.2, 3.0), M['vidrio'])
    # franja guinda con letrero (semáforo) sobre el último nivel y en la marquesina
    s1 = box('DL_Franja', c, (0, y0 - D / 2 - 0.35, H - 0.3), (W * 0.62, 0.3, 1.6), M['guinda'])
    s2 = box('DL_FranjaMarq', c, (0, y0 - D / 2 - 5.05, HN - 0.4), (12, 0.12, 0.7), M['guinda'])
    box('DL_Escudo', c, (-W * 0.31 + 1.2, y0 - D / 2 - 0.55, H - 0.3), (1.4, 0.15, 1.4), M['dorado'])
    # azotea: tinacos, aires, cubo de escaleras, antena y baliza
    box('DL_CuboEsc', c, (W / 2 - 6, y0 + 3, H + 2.0), (5, 4, 3.4), M['concreto2'])
    for i, x in enumerate((-12, -8.5, -5)):
        cyl(f'DL_Tinaco_{i}', c, (x, y0 + 4, H + 1.6), 0.9, 2.0, M['tinaco'])
    for i, x in enumerate((-2, 2, 6)):
        box(f'DL_Aire_{i}', c, (x, y0 - 3, H + 1.2), (2.4, 1.6, 1.2), M['lamina'])
    cyl('DL_Antena', c, (W / 2 - 6, y0 + 3, H + 7.7), 0.12, 8.0, M['metal'], seg=8)
    s3 = cyl('DL_Baliza', c, (W / 2 - 6, y0 + 3, H + 12.0), 0.9, 1.2, M['guinda'], seg=12)
    for o in (s1, s2, s3):
        o['wh_type'] = 'del_semaforo'


def almacen(c):
    yb = D / 2 + 10.0                                            # almacén delegacional detrás
    box('DL_Almacen', c, (0, yb + 7, 4.0), (30, 14, 8.0), M['lamina'])
    box('DL_AlmacenTecho', c, (0, yb + 7, 8.3), (31, 15, 0.6), M['concreto2'])
    box('DL_Anden', c, (0, yb - 1.0, 0.6), (24, 2.0, 1.2), M['concreto2'])
    for i in range(4):
        box(f'DL_Cortina_{i}', c, (-9 + i * 6, yb - 0.05, 3.0), (4.2, 0.2, 3.6), M['cortina'])
    box('DL_Pasillo', c, (0, D / 2 + 5, 2.0), (4, 10, 4.0), M['concreto'])   # liga oficina-almacén


def exterior(c):
    box('DL_Predio', c, (0, 12, -0.1), (64, 66, 0.2), M['piso'])
    box('DL_Jardin', c, (-22, -D / 2 - 8, 0.02), (16, 10, 0.08), M['verde'])
    box('DL_Jardin2', c, (22, -D / 2 - 8, 0.02), (16, 10, 0.08), M['verde'])
    # estacionamiento al costado con cajones
    for i in range(6):
        box(f'DL_Cajon_{i}', c, (26, -2 + i * 3.2, 0.03), (6, 0.15, 0.04), M['linea'])
    # asta con bandera
    cyl('DL_Asta', c, (-22, -D / 2 - 8, 7.5), 0.15, 15, M['metal'], seg=8)
    for i, mk in enumerate(('bverde', 'bblanco', 'brojo')):
        box(f'DL_Bandera_{i}', c, (-22 + 0.9 + i * 1.2, -D / 2 - 8, 13.4), (1.2, 0.08, 2.4), M[mk])


def join_by_material(c):
    groups = {}
    for o in list(c.objects):
        if o.type != 'MESH' or o.get('wh_type') == 'del_semaforo':
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
        ctx.view_layer.objects.active.name = f'DL_{mname[3:]}'
    # el semáforo también se une en una sola malla
    sem = [o for o in c.objects if o.get('wh_type') == 'del_semaforo']
    for o in ctx.view_layer.objects:
        o.select_set(False)
    for o in sem:
        o.select_set(True)
    ctx.view_layer.objects.active = sem[0]
    bpy.ops.object.join()
    j = ctx.view_layer.objects.active
    j.name = 'DL_Semaforo'; j['wh_type'] = 'del_semaforo'


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mats()
    c = bpy.data.collections.new('DL_Delegacion'); bpy.context.scene.collection.children.link(c)
    w = bpy.data.worlds.new('DL_Cielo'); w.color = (0.04, 0.06, 0.09); bpy.context.scene.world = w
    edificio(c); almacen(c); exterior(c)
    bpy.context.view_layer.update()
    join_by_material(c)
    root = bpy.data.objects.new('DL_Raiz', None); c.objects.link(root)
    for o in c.objects:
        if o is not root:
            o.parent = root
    root['wh_type'] = 'delegacion'; root['wh_name'] = 'Edificio delegacional del ISSSTE (genérico)'
    cam = bpy.data.objects.new('DL_Cam', bpy.data.cameras.new('DL_Cam'))
    cam.data.lens = 32
    cam.location = (-58, -78, 46)
    from mathutils import Vector
    cam.rotation_euler = (Vector((0, 6, 6)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    c.objects.link(cam); bpy.context.scene.camera = cam
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'delegacion.blend'))
    tris = sum(len(o.data.polygons) for o in c.objects if o.type == 'MESH')
    return {'objetos': len(c.objects), 'caras': tris}


def preview(path=None, res=(1600, 1000)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'; sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = res[0], res[1], 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_delegacion.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def export(copy_to_web=False):
    glb = os.path.join(OUT, 'delegacion.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True, export_lights=False, export_cameras=False, export_yup=True)
    if copy_to_web:
        import shutil
        shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'delegacion.glb'))
    return {'glb': os.path.getsize(glb)}

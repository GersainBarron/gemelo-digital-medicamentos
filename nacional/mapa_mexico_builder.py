# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  mapa_mexico_builder.py · Mapa 3D de la República Mexicana por estado
#  Para la ventana nacional (CENADI → 32 estados).
#   · Lee nacional/estados_mx.json: límites estatales unidos desde la división
#     municipal 2023 de la CONABIO (derivada del Marco Geoestadístico del
#     INEGI), proyectados en EPSG:6372 (México ITRF2008 / Lambert) y
#     simplificados. Unidades en km, origen en el CENADI (Tlalnepantla).
#   · Cada estado es una losa (wh_type = state) con wh_cve, wh_name, wh_abbr,
#     wh_region y wh_label_x/y; el visor la recolorea y la levanta al
#     seleccionarla. Nombres como malla (wh_type = state_label).
#   · CENADI como torre (wh_type = cenadi) y el mar como plano (wh_type = sea).
#  Uso: exec(open(r"...\\nacional\\mapa_mexico_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export()
# =====================================================================
import bpy, bmesh, os, json, math

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "nacional")
SRC = os.path.join(OUT, "estados_mx.json")
H = 12.0                                  # alto de la losa (km)

REGION = {'09': 'I', '13': 'I', '15': 'II', '22': 'II', '02': 'V', '03': 'V', '25': 'V', '26': 'V', '06': 'VI', '14': 'VI', '18': 'VI',
          '32': 'VI', '01': 'VII', '11': 'VII', '24': 'VII', '16': 'VIII', '19': 'IX', '28': 'IX', '21': 'X', '29': 'X', '30': 'XI', '20': 'XII',
          '04': 'XIII', '07': 'XIII', '23': 'XIII', '27': 'XIII', '31': 'XIII', '17': 'XIV', '05': 'XV', '08': 'XV', '10': 'XV', '12': 'XVI'}
ABBR = {'01': 'AGS', '02': 'BC', '03': 'BCS', '04': 'CAMP', '05': 'COAH', '06': 'COL', '07': 'CHIS', '08': 'CHIH', '09': 'CDMX', '10': 'DGO',
        '11': 'GTO', '12': 'GRO', '13': 'HGO', '14': 'JAL', '15': 'MEX', '16': 'MICH', '17': 'MOR', '18': 'NAY', '19': 'NL', '20': 'OAX', '21': 'PUE',
        '22': 'QRO', '23': 'QROO', '24': 'SLP', '25': 'SIN', '26': 'SON', '27': 'TAB', '28': 'TAMS', '29': 'TLAX', '30': 'VER', '31': 'YUC', '32': 'ZAC'}
CORTO = {'05': 'Coahuila', '15': 'Edo. de México', '16': 'Michoacán', '30': 'Veracruz', '03': 'BCS', '02': 'Baja California', '09': 'CDMX',
         '17': 'Mor.', '29': 'Tlax.', '01': 'Ags.', '22': 'Qro.', '06': 'Col.', '23': 'Q. Roo'}


def mat(name, rgb, rough=0.7, metal=0.0, emit=0.0):
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
        tierra=mat('MX_Estado', (0.55, 0.60, 0.62)),
        lado=mat('MX_Costado', (0.30, 0.33, 0.36)),
        mar=mat('MX_Mar', (0.03, 0.06, 0.10), 0.9),
        cenadi=mat('MX_CENADI', (0.08, 0.72, 0.65), 0.4, 0.0, 1.5),
        guinda=mat('MX_Guinda', (0.30, 0.03, 0.08), 0.5),
        texto=mat('MX_Texto', (0.92, 0.94, 0.96), 0.6),
    )


def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def slab(name, polys, c):
    """Una losa por estado. La tapa usa los triángulos precalculados (earcut, campo 'tri' del JSON,
    exterior antihorario y huecos horarios); los costados se arman anillo por anillo.
    Material 0 = tapa, 1 = costado."""
    bm = bmesh.new()
    for p in polys:
        rings = [p['ext']] + p.get('holes', [])
        top = []
        for ring in rings:
            vb = [bm.verts.new((x, y, 0.0)) for x, y in ring]
            vt = [bm.verts.new((x, y, H)) for x, y in ring]
            top += vt
            n = len(ring)
            for i in range(n):
                j = (i + 1) % n
                try:
                    f = bm.faces.new((vb[j], vb[i], vt[i], vt[j])); f.material_index = 1   # normal hacia afuera
                except ValueError:
                    pass
        tri = p.get('tri', [])
        for k in range(0, len(tri), 3):
            a, b, c3 = top[tri[k]], top[tri[k + 1]], top[tri[k + 2]]
            try:
                f = bm.faces.new((a, b, c3)); f.material_index = 0
            except ValueError:
                pass
    bm.normal_update()
    for f in bm.faces:                         # la tapa siempre hacia arriba
        if f.material_index == 0 and f.normal.z < 0:
            f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(M['tierra']); me.materials.append(M['lado'])
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    return o


def text(name, c, body, loc, size, m):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.resolution_u = 2
    t = bpy.data.objects.new(name + '_tmp', cu)
    t.location = loc
    c.objects.link(t)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(t.evaluated_get(dg))
    o = bpy.data.objects.new(name, me)
    o.matrix_world = t.matrix_world.copy()
    me.materials.clear(); me.materials.append(m)
    c.objects.link(o)
    bpy.data.objects.remove(t, do_unlink=True)
    return o


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mats()
    data = json.load(open(SRC, encoding='utf-8'))
    ce, cl, cm = coll('MX_Estados'), coll('MX_Nombres'), coll('MX_Base')
    w = bpy.data.worlds.new('MX_Cielo'); w.color = (0.04, 0.06, 0.09); bpy.context.scene.world = w
    stats = []
    for s in data['estados']:
        cve = s['cve']
        o = slab(f"EDO_{cve}", s['polys'], ce)
        for k, v in {'wh_type': 'state', 'wh_cve': cve, 'wh_name': s['nombre'], 'wh_abbr': ABBR[cve], 'wh_region': REGION[cve],
                     'wh_area_km2': s['area_km2'], 'wh_label_x': s['label'][0], 'wh_label_y': s['label'][1]}.items():
            o[k] = v
        # nombre sobre la tapa
        size = max(9.0, min(42.0, math.sqrt(s['area_km2']) / 9.0))
        body = CORTO.get(cve, s['nombre'])
        if s['area_km2'] < 8000:
            body = ABBR[cve]
        t = text(f"NOM_{cve}", cl, body, (s['label'][0], s['label'][1], H + 0.4), size, M['texto'])
        t['wh_type'] = 'state_label'; t['wh_cve'] = cve
        stats.append((cve, len(o.data.polygons)))
    # mar
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=2600)
    me = bpy.data.meshes.new('MX_Mar'); bm.to_mesh(me); bm.free(); me.materials.append(M['mar'])
    sea = bpy.data.objects.new('MX_Mar', me); sea.location = (-150, 450, -0.5); sea['wh_type'] = 'sea'; cm.objects.link(sea)
    # CENADI: torre en el origen
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=9, radius2=6, depth=60)
    for v in bm.verts: v.co.z += H + 30
    me = bpy.data.meshes.new('MX_CENADI'); bm.to_mesh(me); bm.free(); me.materials.append(M['cenadi'])
    tw = bpy.data.objects.new('MX_CENADI', me); tw['wh_type'] = 'cenadi'; tw['wh_name'] = 'CENADI · Centro Nacional de Distribución'; cm.objects.link(tw)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=16, radius2=16, depth=2)
    for v in bm.verts: v.co.z += H + 1
    me = bpy.data.meshes.new('MX_CENADI_Base'); bm.to_mesh(me); bm.free(); me.materials.append(M['guinda'])
    b2 = bpy.data.objects.new('MX_CENADI_Base', me); b2['wh_type'] = 'cenadi'; cm.objects.link(b2)
    # cámara general
    cam = bpy.data.objects.new('MX_Cam', bpy.data.cameras.new('MX_Cam'))
    cam.data.lens = 35; cam.data.clip_end = 20000
    cam.location = (-150, -2300, 2300)
    from mathutils import Vector
    cam.rotation_euler = (Vector((-150, 450, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cm.objects.link(cam); bpy.context.scene.camera = cam
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'mapa_mexico.blend'))
    return {'estados': len(stats), 'caras': sum(n for _, n in stats), 'objetos': len(bpy.data.objects)}


def preview(path=None, res=(1600, 1000)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'; sc.display.shading.show_shadows = False
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = res[0], res[1], 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_mapa_mexico.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def export(copy_to_web=False):
    glb = os.path.join(OUT, 'mapa_mexico.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True, export_lights=False, export_cameras=False, export_yup=True)
    if copy_to_web:
        import shutil
        shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'mapa_mexico.glb'))
    return {'glb': os.path.getsize(glb)}

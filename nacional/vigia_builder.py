# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  vigia_builder.py · Torre vigía del abasto (diseño propio)
#  Para la pestaña "Torre 3D" de web/torre.html (web/js/torre3d.js): se
#  levanta en el Golfo de México, exagerada, y su ojo-sensor gira para
#  mirar a la delegación o unidad que la torre señala.
#  Ideas: torre de control de aeropuerto (cabina de vidrio inclinado hacia
#  afuera), faro (haz de luz que barre) y cámara de vigilancia (lente con
#  iris). Medidas en metros, frente del ojo hacia -Y.
#   · Basamento octagonal de 60 m con escalinata y anillo de luz.
#   · Fuste hexagonal que se adelgaza (r 10 → 6.5 m) con 3 aletas de
#     concreto a 120° y 2 balcones-anillo con franja de semáforo.
#   · Cabina de control de vidrio inclinado, con marquesina y cubierta.
#   · Mástil con yugo (horquilla) y el "ojo": esfera metálica con lente,
#     anillo de iris luminoso y pupila. Gira completo en el visor.
#  Ligas con el visor (extras wh_*):
#   · wh_type = vigia       raíz del modelo
#   · wh_type = vig_ojo     cabeza que gira (pivote en el centro de la esfera)
#   · wh_type = vig_iris    anillo de iris: color del estado general
#   · wh_type = vig_anillo  franjas de los balcones y del basamento: semáforo
#  Uso: exec(open(r"...\\nacional\\vigia_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export(copy_to_web=True)
# =====================================================================
import bpy, bmesh, os, math
from mathutils import Vector

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "nacional")

H_FUSTE = 150.0          # altura del fuste
Z_CAB = H_FUSTE          # arranque de la cabina
H_CAB = 16.0
Z_OJO = Z_CAB + H_CAB + 22.0   # centro de la esfera del ojo
R_OJO = 8.0


def mat(name, rgb, rough=0.6, metal=0.0, emit=0.0, alpha=1.0):
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
        concreto=mat('VG_Concreto', (0.74, 0.75, 0.76), 0.85),
        concreto2=mat('VG_ConcretoOsc', (0.36, 0.39, 0.42), 0.85),
        aleta=mat('VG_Aleta', (0.86, 0.87, 0.88), 0.7),
        vidrio=mat('VG_Vidrio', (0.08, 0.20, 0.24), 0.08, 0.4),
        metal=mat('VG_Metal', (0.42, 0.45, 0.49), 0.35, 0.85),
        metal2=mat('VG_MetalOsc', (0.10, 0.11, 0.13), 0.3, 0.9),
        lente=mat('VG_Lente', (0.02, 0.03, 0.04), 0.05, 0.6),
        iris=mat('VG_Iris', (0.18, 0.83, 0.75), 0.3, 0.0, 6.0),          # el visor la recolorea
        anillo=mat('VG_Anillo', (0.18, 0.83, 0.75), 0.4, 0.0, 3.0),      # semáforo
        piso=mat('VG_Piso', (0.22, 0.24, 0.26), 0.95),
    )


def link(c, name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me); c.objects.link(o)
    return o


def prism(name, c, z0, h, r0, r1, seg, m, rot=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(rot, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, z0 + h / 2))
    return link(c, name, bm, m)


def box(name, c, center, size, m, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    o = link(c, name, bm, m)
    o.location = center; o.rotation_euler.z = rot_z
    return o


def ring(name, c, z, r_out, r_in, h, m, seg=48):
    bm = bmesh.new()
    a = bmesh.ops.create_circle(bm, cap_ends=False, segments=seg, radius=r_out)['verts']
    b = bmesh.ops.create_circle(bm, cap_ends=False, segments=seg, radius=r_in)['verts']
    ea = [e for e in bm.edges if e.verts[0] in a]
    eb = [e for e in bm.edges if e.verts[0] in b]
    f = bmesh.ops.bridge_loops(bm, edges=ea + eb)['faces']
    ext = bmesh.ops.extrude_face_region(bm, geom=f)
    vs = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=vs, vec=(0, 0, h))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, z))
    return link(c, name, bm, m)


def sphere(name, c, center, r, m, seg=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    o = link(c, name, bm, m); o.location = center
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def basamento(c):
    prism('VG_Plaza', c, -0.2, 0.2, 46, 46, 8, M['piso'], rot=math.pi / 8)
    prism('VG_Basamento', c, 0, 7, 30, 26, 8, M['concreto2'], rot=math.pi / 8)
    prism('VG_Basamento2', c, 7, 3, 22, 20, 8, M['concreto'], rot=math.pi / 8)
    for i in range(4):                                             # escalinatas en los 4 frentes
        a = i * math.pi / 2
        for s in range(4):
            d = 29 + s * 2.2
            box(f'VG_Escalon_{i}_{s}', c, (math.cos(a) * d, math.sin(a) * d, (3 - s) * 0.9 + 0.45), (2.2 if i % 2 == 0 else 14, 14 if i % 2 == 0 else 2.2, (4 - s) * 1.8 * 0.5), M['concreto2'])
    a1 = ring('VG_AnilloBase', c, 6.6, 27.2, 26.4, 0.9, M['anillo'], seg=64)
    a1['wh_type'] = 'vig_anillo'


def fuste(c):
    prism('VG_Fuste', c, 10, H_FUSTE - 10, 10.0, 6.5, 6, M['concreto'])
    for i in range(3):                                             # aletas a 120°
        a = math.pi / 2 + i * 2 * math.pi / 3
        bm = bmesh.new()
        # perfil de la aleta: ancha abajo, se pega al fuste arriba
        pts = [(9, 10), (24, 10), (13, 70), (7.5, H_FUSTE - 8), (6.3, H_FUSTE - 8)]
        vs = []
        for (r, z) in pts:
            for t in (-0.9, 0.9):
                vs.append(bm.verts.new((r, t, z)))
        n = len(pts)
        for k in range(n - 1):
            a0, a1, b0, b1 = vs[2 * k], vs[2 * k + 1], vs[2 * k + 2], vs[2 * k + 3]
            bm.faces.new((a0, b0, b1, a1))
        bm.faces.new([vs[2 * k] for k in range(n)][::-1])
        bm.faces.new([vs[2 * k + 1] for k in range(n)])
        bm.faces.new((vs[-2], vs[-1], vs[1], vs[0]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(a, 3, 'Z'))
        link(c, f'VG_Aleta_{i}', bm, M['aleta'])
    for k, z in enumerate((55.0, 105.0)):                          # balcones-anillo
        r = 10.0 - 3.5 * z / H_FUSTE
        ring(f'VG_Balcon_{k}', c, z, r + 5.5, r - 0.3, 1.2, M['metal'], seg=48)
        s = ring(f'VG_Franja_{k}', c, z + 1.2, r + 5.6, r + 4.6, 0.8, M['anillo'], seg=48)
        s['wh_type'] = 'vig_anillo'
    # ventanas verticales del fuste (bandas oscuras)
    for i in range(6):
        a = i * math.pi / 3 + math.pi / 6
        r = 8.2
        box(f'VG_Ventanal_{i}', c, (math.cos(a) * r, math.sin(a) * r, 80), (0.4, 1.6, 110), M['vidrio'], rot_z=a)


def cabina(c):
    prism('VG_CabBase', c, Z_CAB - 2, 2, 8.5, 12.0, 8, M['concreto2'], rot=math.pi / 8)
    prism('VG_CabVidrio', c, Z_CAB, H_CAB - 3, 12.0, 15.5, 8, M['vidrio'], rot=math.pi / 8)
    for i in range(8):                                             # parteluces
        a = math.pi / 8 + i * math.pi / 4 + math.pi / 8
        bm = bmesh.new()
        p0 = Vector((math.cos(a) * 12.05, math.sin(a) * 12.05, Z_CAB))
        p1 = Vector((math.cos(a) * 15.6, math.sin(a) * 15.6, Z_CAB + H_CAB - 3))
        tdir = Vector((-math.sin(a), math.cos(a), 0)) * 0.35
        v = [bm.verts.new(p0 - tdir), bm.verts.new(p0 + tdir), bm.verts.new(p1 + tdir), bm.verts.new(p1 - tdir)]
        bm.faces.new(v)
        link(c, f'VG_Parteluz_{i}', bm, M['metal2'])
    prism('VG_Marquesina', c, Z_CAB + H_CAB - 3, 1.2, 17.5, 17.5, 8, M['metal'], rot=math.pi / 8)
    prism('VG_Cubierta', c, Z_CAB + H_CAB - 1.8, 1.8, 15.0, 8.0, 8, M['concreto'], rot=math.pi / 8)


def ojo(c):
    zt = Z_CAB + H_CAB
    prism('VG_Mastil', c, zt, Z_OJO - zt - R_OJO - 2, 2.2, 1.6, 12, M['metal'])
    # cabeza que gira: horquilla + esfera + lente; todo hijo de un vacío en el centro de la esfera
    piv = bpy.data.objects.new('VG_Ojo', None); c.objects.link(piv)
    piv.location = (0, 0, Z_OJO); piv['wh_type'] = 'vig_ojo'
    parts = []
    parts.append(prism('VG_Plato', c, Z_OJO - R_OJO - 3, 1.6, 6.0, 6.0, 24, M['metal2']))
    for s in (-1, 1):
        parts.append(box(f'VG_Horquilla_{s}', c, (s * (R_OJO + 1.4), 0, Z_OJO - 2.5), (1.4, 3.2, 12), M['metal2']))
    parts.append(sphere('VG_Esfera', c, (0, 0, Z_OJO), R_OJO, M['metal']))
    # lente al frente (-Y): tubo corto, iris luminoso y pupila
    for nm, rr, d, y, m in (('VG_Tubo', 5.6, 3.0, -R_OJO + 0.6, M['metal2']), ('VG_Lente', 4.6, 0.6, -R_OJO - 2.0, M['lente'])):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=rr, radius2=rr, depth=d)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'X'))
        o = link(c, nm, bm, m); o.location = (0, y, Z_OJO); parts.append(o)
    bm = bmesh.new()
    a = bmesh.ops.create_circle(bm, cap_ends=False, segments=48, radius=4.3)['verts']
    b = bmesh.ops.create_circle(bm, cap_ends=False, segments=48, radius=2.0)['verts']
    bmesh.ops.bridge_loops(bm, edges=[e for e in bm.edges if e.verts[0] in a] + [e for e in bm.edges if e.verts[0] in b])
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'X'))
    iris = link(c, 'VG_Iris', bm, M['iris']); iris.location = (0, -R_OJO - 2.35, Z_OJO); iris['wh_type'] = 'vig_iris'
    parts.append(iris)
    # visera sobre el lente
    parts.append(box('VG_Visera', c, (0, -R_OJO - 1.2, Z_OJO + 5.0), (9, 4, 0.8), M['metal2']))
    for o in parts:
        mw = o.matrix_world.copy()
        o.parent = piv
        o.location = o.location - piv.location
    return piv


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mats()
    c = bpy.data.collections.new('VG_Vigia'); bpy.context.scene.collection.children.link(c)
    w = bpy.data.worlds.new('VG_Cielo'); w.color = (0.04, 0.06, 0.09); bpy.context.scene.world = w
    basamento(c); fuste(c); cabina(c); piv = ojo(c)
    root = bpy.data.objects.new('VG_Raiz', None); c.objects.link(root)
    for o in c.objects:
        if o is not root and o.parent is None:
            o.parent = root
    root['wh_type'] = 'vigia'; root['wh_name'] = 'Torre vigía del abasto (diseño propio)'
    cam = bpy.data.objects.new('VG_Cam', bpy.data.cameras.new('VG_Cam'))
    cam.data.lens = 35
    cam.location = (-170, -260, 150)
    cam.rotation_euler = (Vector((0, 0, 100)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    c.objects.link(cam); bpy.context.scene.camera = cam
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'vigia.blend'))
    caras = sum(len(o.data.polygons) for o in c.objects if o.type == 'MESH')
    return {'objetos': len(c.objects), 'caras': caras}


def preview(path=None, res=(1200, 1400)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'; sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = res[0], res[1], 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_vigia.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def export(copy_to_web=False):
    glb = os.path.join(OUT, 'vigia.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True, export_lights=False, export_cameras=False, export_yup=True)
    if copy_to_web:
        import shutil
        shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'vigia.glb'))
    return {'glb': os.path.getsize(glb)}

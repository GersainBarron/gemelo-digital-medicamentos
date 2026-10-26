# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  vehiculos_builder.py · Vehículos de distribución para el gemelo digital
#   · Van_Seca         camioneta de carga seca (rutas ordinarias)
#   · Van_Refrigerada  camioneta con caja térmica y equipo de frío (red fría 2–8 °C)
#   · Moto_Reparto     moto con caja para entregas de última milla a pacientes
#  Cada vehículo: un objeto, origen al centro sobre el piso, frente hacia +X.
#  Exporta vehiculos.blend y vehiculos.glb (también a web/assets).
# =====================================================================
import bpy, bmesh, math, os, shutil
from mathutils import Vector

BASE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega"), "vehiculos")
WEB_ASSETS = os.path.join(os.path.dirname(BASE), 'web', 'assets')
MATS = {}

def hex2rgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]

def mat(name, color, rough=0.5, metal=0.0, alpha=1.0, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    rgb = hex2rgb(color)
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        for a, v in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try: setattr(m, a, v)
            except Exception: pass
    if emit:
        for k in ('Emission Color', 'Emission'):
            if k in b.inputs: b.inputs[k].default_value = (*rgb, 1); break
        b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*rgb, alpha); MATS[name] = m; return m

def _obj(name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def box(name, x0, y0, z0, x1, y1, z1, m):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector(((v.co.x + .5) * (x1 - x0) + x0, (v.co.y + .5) * (y1 - y0) + y0, (v.co.z + .5) * (z1 - z0) + z0))
    return _obj(name, bm, m)

def wheel(name, x, y, r, w, m):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=18, radius1=r, radius2=r, depth=w)
    for v in bm.verts: v.co = Vector((v.co.x, v.co.z, v.co.y))      # eje en Y
    for v in bm.verts: v.co += Vector((x, y, r))
    return _obj(name, bm, m)

def join(objs, name):
    ctx = dict(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs, object=objs[0])
    with bpy.context.temp_override(**ctx): bpy.ops.object.join()
    objs[0].name = name; objs[0].data.name = name; return objs[0]

def van(name, refrig=False):
    W, T, G = mat('Blanco carrocería', '#f3f4f6', .35), mat('Llanta', '#1d1f22', .9), mat('Vidrio', '#9fc3d9', .05, 0, .5)
    stripe = mat('Franja turquesa', '#14b8a6', .4) if not refrig else mat('Franja azul frío', '#2563eb', .4)
    p = []
    p.append(box('caja', -2.7, -1.0, 0.45, 1.3, 1.0, 2.55, W))                 # caja de carga
    p.append(box('cabina', 1.3, -0.95, 0.45, 2.75, 0.95, 2.0, W))
    p.append(box('cofre', 2.75, -0.9, 0.45, 3.1, 0.9, 1.25, W))
    p.append(box('parabrisas', 2.35, -0.86, 1.3, 2.78, 0.86, 1.92, G))
    p.append(box('ventana izq', 1.5, -0.97, 1.3, 2.3, -0.95, 1.85, G)); p.append(box('ventana der', 1.5, 0.95, 1.3, 2.3, 0.97, 1.85, G))
    p.append(box('franja izq', -2.72, -1.02, 1.05, 2.77, -1.0, 1.32, stripe)); p.append(box('franja der', -2.72, 1.0, 1.05, 2.77, 1.02, 1.32, stripe))
    p.append(box('defensa', 3.05, -0.92, 0.35, 3.18, 0.92, 0.6, mat('Gris', '#4b5563', .6)))
    p.append(box('faro izq', 3.1, -0.8, 0.9, 3.13, -0.55, 1.05, mat('Faro', '#fff7d6', .2, 0, 1, 2.0)))
    p.append(box('faro der', 3.1, 0.55, 0.9, 3.13, 0.8, 1.05, MATS['Faro']))
    p.append(box('puerta trasera', -2.74, -0.95, 0.5, -2.7, 0.95, 2.5, mat('Gris claro', '#d1d5db', .5)))
    # cruz médica a los lados
    for s in (-1.03, 1.01):
        p.append(box('cruz v', -0.75, s, 1.45, -0.45, s + 0.02, 2.25, stripe)); p.append(box('cruz h', -1.0, s, 1.7, -0.2, s + 0.02, 2.0, stripe))
    if refrig:
        p.append(box('equipo frío', 1.0, -0.7, 2.0, 1.45, 0.7, 2.75, mat('Equipo frío', '#94a3b8', .4, .3)))   # unidad de refrigeración sobre la cabina
        p.append(box('rejilla', 1.44, -0.6, 2.1, 1.46, 0.6, 2.65, mat('Rejilla', '#334155', .7)))
        p.append(box('copo', -1.6, -1.03, 1.55, -1.25, -1.01, 1.9, mat('Azul frío', '#60a5fa', .3, 0, 1, 1.2)))
        p.append(box('copo 2', -1.6, 1.01, 1.55, -1.25, 1.03, 1.9, MATS['Azul frío']))
    for x in (-1.75, 2.0):
        for y in (-0.95, 0.95): p.append(wheel('llanta', x, y, 0.4, 0.28, T))
    o = join(p, name); o['wh_type'] = 'vehicle'; o['refrigerada'] = refrig
    return o

def moto(name):
    T, R = mat('Llanta', '#1d1f22', .9), mat('Rojo moto', '#dc2626', .4)
    p = [wheel('llanta del', 0.75, 0, 0.32, 0.12, T), wheel('llanta tras', -0.7, 0, 0.32, 0.12, T)]
    p.append(box('cuadro', -0.6, -0.12, 0.45, 0.6, 0.12, 0.75, R))
    p.append(box('asiento', -0.55, -0.16, 0.75, 0.15, 0.16, 0.85, mat('Negro', '#111827', .7)))
    p.append(box('tanque', 0.15, -0.17, 0.72, 0.5, 0.17, 0.95, R))
    p.append(box('manubrio', 0.62, -0.38, 1.05, 0.68, 0.38, 1.1, mat('Gris', '#4b5563', .6)))
    p.append(box('horquilla', 0.62, -0.05, 0.35, 0.72, 0.05, 1.08, MATS['Gris']))
    p.append(box('caja reparto', -1.05, -0.3, 0.85, -0.45, 0.3, 1.45, mat('Blanco carrocería', '#f3f4f6', .35)))
    p.append(box('franja caja', -1.06, -0.31, 1.05, -0.44, 0.31, 1.15, mat('Franja turquesa', '#14b8a6', .4)))
    p.append(box('faro', 0.72, -0.08, 0.95, 0.76, 0.08, 1.05, mat('Faro', '#fff7d6', .2, 0, 1, 2.0)))
    o = join(p, name); o['wh_type'] = 'vehicle'
    return o

def main(export=True):
    bpy.ops.wm.read_homefile(use_empty=True); MATS.clear()
    a = van('Van_Seca'); a.location = (0, 0, 0)
    b = van('Van_Refrigerada', refrig=True); b.location = (0, 4, 0)
    c = moto('Moto_Reparto'); c.location = (0, 8, 0)
    os.makedirs(BASE, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BASE, 'vehiculos.blend'))
    return {'objects': [o.name for o in bpy.data.objects]}

def export():
    glb = os.path.join(BASE, 'vehiculos.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=False, export_extras=True, export_apply=True, export_lights=False, export_cameras=False)
    os.makedirs(WEB_ASSETS, exist_ok=True); shutil.copyfile(glb, os.path.join(WEB_ASSETS, 'vehiculos.glb'))
    return os.path.getsize(glb)

if __name__ == '__main__':
    print(main()); print(export())

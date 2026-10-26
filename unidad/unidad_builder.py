# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  unidad_builder.py · Hospital tipo (unidad médica) para el gemelo digital
#
#  Construye en Blender una unidad de segundo nivel con:
#    vestíbulo, consulta externa (6 consultorios), sala de espera y farmacia
#    (3 ventanillas a pacientes + ventanilla de vales para enfermería),
#    urgencias, CEyE, quirófanos (3 salas + tococirugía), almacén de la
#    unidad con andén para la camioneta del CEDIS y áreas exteriores.
#
#  Exporta:
#    unidad_medica.glb        modelo para el visor web (sin personas: se animan en la web)
#    unidad_layout.json       zonas, asientos, ventanillas, salas y rutas (coordenadas Blender, m)
#
#  Coordenadas: X = este, Y = norte, Z = arriba. Edificio de 62 × 42 m.
#  Uso: en Blender, Scripting → abrir este archivo → Run Script.
# =====================================================================
import bpy, bmesh, json, math, os, random
from mathutils import Vector

BASE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega"), "unidad")
WEB_ASSETS = os.path.join(os.path.dirname(BASE), 'web', 'assets')
random.seed(7)

WALL_H = 2.8
WALL_T = 0.15
EXT_T = 0.25

# ---------------------------------------------------------------------
#  Zonas (x0, y0, x1, y1).  hosp = solo existe en unidades con hospitalización
# ---------------------------------------------------------------------
ZONES = [
    dict(id='admin', name='Administración y archivo', rect=(0, 0, 24, 8), color='#c9c4b8', hosp=False),
    dict(id='vestibulo', name='Vestíbulo', rect=(24, 0, 52, 8), color='#dcd7ca', hosp=False),
    dict(id='consulta', name='Consulta externa', rect=(0, 8, 28, 18), color='#cfdad7', hosp=False),
    dict(id='lobby', name='Pasillo de consulta', rect=(28, 8, 36, 18), color='#dcd7ca', hosp=False),
    dict(id='espera', name='Sala de espera de farmacia', rect=(36, 8, 52, 18), color='#e3d8c2', hosp=False),
    dict(id='farmacia', name='Farmacia', rect=(52, 0, 62, 18), color='#bfe3dc', hosp=False),
    dict(id='pasillo', name='Pasillo principal', rect=(0, 18, 62, 22), color='#d2d6da', hosp=False),
    dict(id='urgencias', name='Urgencias', rect=(0, 22, 24, 42), color='#ebcdc7', hosp=True),
    dict(id='ceye', name='CEyE', rect=(24, 22, 30, 42), color='#cfe0e8', hosp=True),
    dict(id='quirofano', name='Quirófanos y tococirugía', rect=(30, 22, 50, 42), color='#bfdbe3', hosp=True),
    dict(id='almacen', name='Almacén de la unidad', rect=(50, 22, 62, 32), color='#cbcbc2', hosp=False),
    dict(id='servicios', name='Casa de máquinas y residuos', rect=(50, 32, 62, 42), color='#bdbdb5', hosp=False),
]
ZONE = {z['id']: z for z in ZONES}

# ---------------------------------------------------------------------
#  Utilidades de construcción
# ---------------------------------------------------------------------
MATS = {}

def hex2rgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]   # sRGB → lineal


def mat(name, color, rough=0.75, metal=0.0, alpha=1.0, emit=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    rgb = hex2rgb(color)
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        for attr, val in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    if emit > 0:
        for key in ('Emission Color', 'Emission'):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*rgb, 1)
                break
        bsdf.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*rgb, alpha)
    MATS[name] = m
    return m


COLS = {}

def coll(name):
    if name not in COLS:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
        COLS[name] = c
    return COLS[name]


def _obj(name, bm, m, zone):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    coll(zone).objects.link(o)
    o['zone'] = zone
    return o


def box(name, x0, y0, z0, x1, y1, z1, m, zone):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(((v.co.x + 0.5) * (x1 - x0) + x0, (v.co.y + 0.5) * (y1 - y0) + y0, (v.co.z + 0.5) * (z1 - z0) + z0))
    return _obj(name, bm, m, zone)


def cyl(name, x, y, z0, z1, r, m, zone, seg=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=z1 - z0)
    for v in bm.verts:
        v.co += Vector((x, y, (z0 + z1) / 2))
    return _obj(name, bm, m, zone)


def cone(name, x, y, z0, z1, r, m, zone, seg=10):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0.0, depth=z1 - z0)
    for v in bm.verts:
        v.co += Vector((x, y, (z0 + z1) / 2))
    return _obj(name, bm, m, zone)


def sphere(name, x, y, z, r, m, zone):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=r)
    for v in bm.verts:
        v.co += Vector((x, y, z))
    return _obj(name, bm, m, zone)


def wall(x0, y0, x1, y1, gaps=(), zone='muros', ext=False, h=WALL_H, m=None):
    """Muro recto (horizontal o vertical) con huecos [(centro, ancho)] medidos sobre su eje."""
    t = EXT_T if ext else WALL_T
    m = m or (M['wall_ext'] if ext else M['wall'])
    horiz = abs(y1 - y0) < 1e-6
    a0, a1 = (x0, x1) if horiz else (y0, y1)
    cuts = sorted((c - w / 2, c + w / 2) for c, w in gaps)
    segs, cur = [], a0
    for g0, g1 in cuts:
        if g0 > cur:
            segs.append((cur, g0))
        cur = max(cur, g1)
    if cur < a1:
        segs.append((cur, a1))
    out = []
    for i, (s0, s1) in enumerate(segs):
        if s1 - s0 < 0.05:
            continue
        if horiz:
            out.append(box(f'Muro_{zone}', s0, y0 - t / 2, 0, s1, y0 + t / 2, h, m, zone))
        else:
            out.append(box(f'Muro_{zone}', x0 - t / 2, s0, 0, x0 + t / 2, s1, h, m, zone))
    return out


# ---------------------------------------------------------------------
#  Escena
# ---------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    MATS.clear(); COLS.clear()
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.name = 'Unidad_medica'


M = {}

def materials():
    M.update(
        wall=mat('Muro', '#efede7', 0.9), wall_ext=mat('Muro exterior', '#d9d3c8', 0.9),
        grass=mat('Pasto', '#6e8f50', 1.0), asphalt=mat('Asfalto', '#4b5056', 0.95), sidewalk=mat('Banqueta', '#bfb9ad', 0.95),
        line=mat('Pintura blanca', '#f2f2ee', 0.6), yellow=mat('Pintura amarilla', '#e8b323', 0.6),
        wood=mat('Madera', '#a7794f', 0.6), metal=mat('Metal', '#9aa3ab', 0.35, 0.6), dark=mat('Gris oscuro', '#3b4148', 0.6),
        white=mat('Blanco', '#f4f4f2', 0.5), glass=mat('Vidrio', '#bfe6ff', 0.05, 0.0, 0.28),
        seat=mat('Asiento', '#2f6f8f', 0.6), seat2=mat('Asiento ISSSTE', '#4c7a3a', 0.6),
        counter=mat('Mostrador', '#e9e2d2', 0.5), teal=mat('Turquesa', '#14b8a6', 0.5), red=mat('Rojo', '#d23b35', 0.5),
        blue=mat('Azul cortina', '#7fb0d8', 0.8), green_or=mat('Verde quirófano', '#4fa58f', 0.6),
        mattress=mat('Colchón', '#9fc7d6', 0.8), steel=mat('Acero inoxidable', '#c8cdd2', 0.25, 0.8),
        screen=mat('Pantalla', '#38bdf8', 0.3, 0, 1, 2.5), lamp=mat('Lámpara', '#fff7d6', 0.3, 0, 1, 4.0),
        leaf=mat('Follaje', '#3f7a3a', 0.9), trunk=mat('Tronco', '#6b4a2f', 0.9), plant=mat('Maceta', '#8a5a3c', 0.8),
        box1=mat('Caja 1', '#d9c7a3', 0.85), box2=mat('Caja 2', '#e8e4da', 0.85), box3=mat('Caja 3', '#9cc6e0', 0.85), box4=mat('Caja 4', '#f0b9a6', 0.85),
        pallet=mat('Tarima', '#b08a5a', 0.85), fridge=mat('Refrigerador', '#f7f7f5', 0.35),
        safe=mat('Caja fuerte', '#5a6068', 0.4, 0.5), car1=mat('Auto 1', '#8a99a8', 0.4, 0.3), car2=mat('Auto 2', '#a33a3a', 0.4, 0.3),
        car3=mat('Auto 3', '#2f3b52', 0.4, 0.3), tire=mat('Llanta', '#1d1f22', 0.9),
    )
    for z in ZONES:
        M['floor_' + z['id']] = mat('Piso ' + z['name'], z['color'], 0.85)


# ---------------------------------------------------------------------
#  Exterior
# ---------------------------------------------------------------------
def build_exterior():
    Z = 'exterior'
    box('Terreno', -16, -22, -0.06, 84, 56, 0.0, M['grass'], Z)
    box('Calle', -16, -14, 0.0, 84, -6, 0.01, M['asphalt'], Z)
    for x in range(-14, 84, 6):
        box('Raya', x, -10.1, 0.01, x + 3, -9.9, 0.015, M['line'], Z)
    box('Banqueta', -16, -6, 0.0, 84, -3, 0.03, M['sidewalk'], Z)
    box('Plaza acceso', 26, -3, 0.0, 50, 0, 0.03, M['sidewalk'], Z)
    # Estacionamiento al poniente del acceso
    box('Estacionamiento', 0, -3, 0.0, 24, -0.4, 0.012, M['asphalt'], Z)
    for i in range(9):
        x = 1 + i * 2.6
        box('Cajón', x, -3, 0.012, x + 0.1, -0.6, 0.016, M['line'], Z)
    for i, (x, m) in enumerate([(2.3, M['car1']), (7.5, M['car2']), (12.7, M['car3']), (18.0, M['car1'])]):
        car(f'Auto_{i}', x, -1.7, m)
    # Bahía de ambulancias (poniente)
    box('Bahía ambulancias', -12, 27, 0.0, 0, 37, 0.012, M['asphalt'], Z)
    box('Marca ambulancia', -9, 29, 0.012, -2, 35, 0.016, M['yellow'], Z)
    box('Marca ambulancia int', -8.8, 29.2, 0.012, -2.2, 34.8, 0.018, M['asphalt'], Z)
    ambulance(-6.5, 32.0)
    # Patio de maniobras y andén (oriente)
    box('Patio de maniobras', 62, 20, 0.0, 84, 36, 0.012, M['asphalt'], Z)
    box('Camino patio', 76, -6, 0.0, 82, 20, 0.012, M['asphalt'], Z)
    box('Andén', 62.1, 24.6, 0.0, 63.4, 29.4, 0.95, M['sidewalk'], Z)
    box('Defensa andén', 63.4, 25.0, 0.3, 63.55, 29.0, 0.8, M['dark'], Z)
    box('Marca andén', 63.6, 25.6, 0.012, 70.5, 25.7, 0.016, M['yellow'], Z)
    box('Marca andén 2', 63.6, 28.3, 0.012, 70.5, 28.4, 0.016, M['yellow'], Z)
    # Árboles
    for (x, y) in [(-6, 4), (-6, 14), (-6, 44), (4, 48), (16, 48), (28, 48), (40, 48), (52, 48), (66, 44), (72, 8), (66, 2), (-10, 20)]:
        tree(x, y)
    # Marquesina del acceso
    box('Marquesina', 33, -3.2, 3.0, 43, 0.3, 3.2, M['white'], Z)
    for x in (33.3, 42.7):
        cyl('Columna', x, -2.9, 0, 3.0, 0.12, M['metal'], Z)


def tree(x, y):
    Z = 'exterior'
    s = 0.8 + random.random() * 0.5
    cyl('Tronco', x, y, 0, 1.6 * s, 0.15 * s, M['trunk'], Z, seg=8)
    sphere('Copa', x, y, 2.6 * s, 1.4 * s, M['leaf'], Z)


def car(name, x, y, m):
    Z = 'exterior'
    box(name, x - 0.9, y - 2.1, 0.25, x + 0.9, y + 2.1, 0.95, m, Z)
    box(name, x - 0.8, y - 1.0, 0.95, x + 0.8, y + 1.0, 1.45, m, Z)
    box(name + '_vidrio', x - 0.82, y - 0.9, 1.0, x + 0.82, y + 0.9, 1.4, M['glass'], Z)


def ambulance(x, y):
    Z = 'urgencias_ext'
    box('Ambulancia', x - 2.8, y - 1.05, 0.35, x + 2.6, y + 1.05, 2.6, M['white'], Z)
    box('Ambulancia cabina', x + 2.6, y - 1.0, 0.35, x + 3.6, y + 1.0, 1.9, M['white'], Z)
    box('Ambulancia franja', x - 2.82, y - 1.07, 1.2, x + 3.62, y + 1.07, 1.45, M['red'], Z)
    box('Ambulancia parabrisas', x + 3.2, y - 0.9, 1.3, x + 3.62, y + 0.9, 1.8, M['glass'], Z)
    box('Ambulancia torreta', x + 2.1, y - 0.6, 2.6, x + 2.5, y + 0.6, 2.75, M['red'], Z)
    for dx in (-1.8, 2.6):
        for dy in (-1.0, 1.0):
            o = cyl('Llanta', 0, 0, -0.12, 0.12, 0.38, M['tire'], Z)
            o.rotation_euler = (math.pi / 2, 0, 0)
            o.location = (x + dx, y + dy, 0.38)


def build_van():
    """Camioneta del CEDIS (objeto independiente: la web la mueve)."""
    Z = 'vehiculos'
    parts = []
    parts.append(box('Van_carga', -2.6, -1.0, 0.4, 1.4, 1.0, 2.6, M['white'], Z))
    parts.append(box('Van_cabina', 1.4, -0.95, 0.4, 2.7, 0.95, 1.95, M['white'], Z))
    parts.append(box('Van_franja', -2.62, -1.02, 1.0, 2.72, 1.02, 1.3, M['teal'], Z))
    parts.append(box('Van_parabrisas', 2.3, -0.85, 1.35, 2.72, 0.85, 1.85, M['glass'], Z))
    for dx in (-1.7, 1.8):
        for dy in (-0.95, 0.95):
            o = cyl('Van_llanta', 0, 0, -0.12, 0.12, 0.38, M['tire'], Z)
            o.rotation_euler = (math.pi / 2, 0, 0)
            o.location = (dx, dy, 0.38)
            bpy.context.view_layer.update()
            o.data.transform(o.matrix_basis)
            o.matrix_basis.identity()
            parts.append(o)
    van = join(parts, 'Van_CEDIS')
    # se estaciona de reversa contra el andén (frente hacia el oriente)
    van.location = (66.6, 27.0, 0.0)
    van['zone'] = 'vehiculos'
    van['wh_type'] = 'van'
    return van


# ---------------------------------------------------------------------
#  Edificio
# ---------------------------------------------------------------------
def build_floors():
    for z in ZONES:
        x0, y0, x1, y1 = z['rect']
        box('Piso_' + z['id'], x0, y0, 0.0, x1, y1, 0.04, M['floor_' + z['id']], z['id'])


def build_walls():
    # Perímetro
    wall(0, 0, 62, 0, gaps=[(38, 4.0)], zone='muros', ext=True)               # acceso principal
    wall(0, 0, 0, 42, gaps=[(32, 3.0)], zone='muros', ext=True)               # urgencias (ambulancias)
    wall(0, 42, 62, 42, zone='muros', ext=True)
    wall(62, 0, 62, 42, gaps=[(27, 3.2), (37, 1.2)], zone='muros', ext=True)  # andén y servicio
    # Fachada de vidrio del vestíbulo
    box('Vidrio acceso', 36, -0.06, 0.0, 40, 0.06, 2.4, M['glass'], 'vestibulo')
    # Planta baja: administración, consulta, espera, farmacia
    wall(24, 0, 24, 8, gaps=[(4, 1.2)], zone='admin')
    wall(0, 8, 28, 8, zone='consulta')
    wall(28, 8, 28, 18, zone='consulta')
    cw = 28 / 6
    doors = [(cw * i + cw / 2, 1.0) for i in range(6)]
    wall(0, 18, 28, 18, gaps=doors, zone='consulta')
    for i in range(1, 6):
        wall(cw * i, 8, cw * i, 18, zone='consulta')
    wall(36, 18, 52, 18, zone='espera')
    wall(52, 18, 62, 18, gaps=[(57, 1.6)], zone='farmacia')                    # ventanilla de vales
    wall(52, 0, 52, 18, gaps=[(4, 1.0), (10, 1.3), (12.75, 1.3), (15.5, 1.3)], zone='farmacia')
    # Lado norte del pasillo
    wall(0, 22, 24, 22, gaps=[(12, 2.4)], zone='urgencias')
    wall(24, 22, 30, 22, gaps=[(27, 1.2)], zone='ceye')
    wall(30, 22, 50, 22, gaps=[(40, 2.4)], zone='quirofano')
    wall(50, 22, 62, 22, gaps=[(56, 2.4)], zone='almacen')
    wall(24, 22, 24, 42, zone='urgencias')
    wall(30, 22, 30, 42, zone='quirofano')
    wall(50, 22, 50, 42, zone='quirofano')
    wall(50, 32, 62, 32, zone='servicios')
    # Quirófanos: 3 salas + tococirugía
    wall(30, 30, 50, 30, gaps=[(32.5, 1.6), (37.5, 1.6), (42.5, 1.6), (47.5, 1.6)], zone='quirofano')
    for x in (35, 40, 45):
        wall(x, 30, x, 42, zone='quirofano')


def build_consulta():
    Z = 'consulta'
    cw = 28 / 6
    for i in range(6):
        x0 = cw * i
        cx = x0 + cw / 2
        box('Escritorio', cx - 0.8, 10.2, 0, cx + 0.8, 10.9, 0.76, M['wood'], Z)
        box('Monitor', cx - 0.25, 10.55, 0.76, cx + 0.25, 10.6, 1.1, M['dark'], Z)
        box('Silla médico', cx - 0.25, 9.4, 0, cx + 0.25, 9.9, 0.48, M['dark'], Z)
        box('Silla paciente', cx - 0.25, 11.3, 0, cx + 0.25, 11.8, 0.48, M['seat'], Z)
        box('Camilla exploración', x0 + 0.3, 13.6, 0.0, x0 + 1.0, 15.6, 0.75, M['mattress'], Z)
        box('Lavabo', x0 + cw - 0.6, 16.6, 0.8, x0 + cw - 0.15, 17.4, 0.95, M['white'], Z)
    # Administración
    Z = 'admin'
    for i in range(4):
        for j in range(2):
            x, y = 3 + i * 5, 2.5 + j * 3
            box('Escritorio admin', x, y, 0, x + 1.6, y + 0.8, 0.76, M['wood'], Z)
            box('Monitor', x + 0.55, y + 0.5, 0.76, x + 1.05, y + 0.55, 1.1, M['dark'], Z)
    for y in (1, 3, 5):
        box('Archivero', 0.3, y, 0, 0.9, y + 1.6, 1.9, M['metal'], Z)


def build_vestibulo():
    Z = 'vestibulo'
    box('Módulo de información', 28, 2.5, 0, 31.5, 3.3, 1.05, M['counter'], Z)
    box('Módulo de información', 28, 3.3, 0, 28.8, 5.5, 1.05, M['counter'], Z)
    box('Pantalla turnos', 45, 7.7, 1.9, 48.5, 7.85, 2.5, M['screen'], Z)
    for x in (25.2, 50.8):
        cyl('Maceta', x, 1.2, 0, 0.5, 0.35, M['plant'], Z, seg=10)
        sphere('Planta', x, 1.2, 0.95, 0.55, M['leaf'], Z)


SEATS = []

def build_espera():
    Z = 'espera'
    # 5 columnas de bancas mirando a las ventanillas (oriente)
    for c, x in enumerate((38.6, 40.6, 42.6, 44.6, 46.6)):
        for block, y0 in enumerate((9.3, 13.9)):
            box('Banca', x - 0.35, y0 - 0.25, 0.0, x + 0.25, y0 + 0.25 + 5 * 0.6, 0.1, M['metal'], Z)
            for j in range(6):
                y = y0 + j * 0.6
                box('Asiento', x - 0.28, y - 0.26, 0.42, x + 0.22, y + 0.26, 0.48, M['seat'], Z)
                box('Respaldo', x - 0.32, y - 0.26, 0.48, x - 0.26, y + 0.26, 0.9, M['seat'], Z)
                SEATS.append([round(x, 2), round(y, 2)])
    box('Letrero farmacia', 51.88, 9.2, 2.3, 51.95, 16.8, 2.75, M['teal'], Z)
    box('Pantalla de turnos', 51.85, 11.9, 1.75, 51.92, 13.6, 2.2, M['screen'], Z)
    cyl('Bebedero', 37.0, 17.4, 0, 1.0, 0.22, M['steel'], Z)


WINDOWS = []

def build_farmacia():
    Z = 'farmacia'
    for i, y in enumerate((10.0, 12.75, 15.5)):
        box('Ventanilla', 51.55, y - 0.65, 0, 52.45, y + 0.65, 1.05, M['counter'], Z)
        box('Vidrio ventanilla', 51.97, y - 0.65, 1.3, 52.03, y + 0.65, 2.5, M['glass'], Z)
        box('Monitor', 52.6, y - 0.3, 1.05, 52.65, y + 0.3, 1.4, M['dark'], Z)
        box('Número', 51.5, y - 0.2, 2.5, 51.56, y + 0.2, 2.75, M['teal'], Z)
        WINDOWS.append(dict(id=i + 1, stand=[51.05, y], staff=[53.0, y]))
    # Ventanilla de vales (enfermería) hacia el pasillo
    box('Ventanilla vales', 56.2, 17.55, 0, 57.8, 18.45, 1.05, M['counter'], Z)
    box('Vidrio vales', 56.2, 17.97, 1.3, 57.8, 18.03, 2.5, M['glass'], Z)
    box('Letrero vales', 56.0, 18.1, 2.5, 58.0, 18.16, 2.75, M['teal'], Z)
    # Anaqueles con medicamento
    def shelf(x0, y0, x1, y1, levels=5, h=2.1):
        box('Anaquel', x0, y0, 0, x1, y1, 0.05, M['metal'], Z)
        for k in range(levels):
            z = 0.15 + k * (h - 0.2) / (levels - 1)
            box('Entrepaño', x0, y0, z, x1, y1, z + 0.03, M['metal'], Z)
            # cajas de medicamento
            horiz = (x1 - x0) > (y1 - y0)
            L = (x1 - x0) if horiz else (y1 - y0)
            n = int(L / 0.32)
            for b in range(n):
                if random.random() < 0.15:
                    continue
                m = random.choice([M['box2'], M['box2'], M['box3'], M['box4'], M['box1']])
                hh = 0.12 + random.random() * 0.14
                if horiz:
                    bx = x0 + 0.05 + b * 0.32
                    box('Medicamento', bx, y0 + 0.05, z + 0.03, bx + 0.26, y1 - 0.05, z + 0.03 + hh, m, Z)
                else:
                    by = y0 + 0.05 + b * 0.32
                    box('Medicamento', x0 + 0.05, by, z + 0.03, x1 - 0.05, by + 0.26, z + 0.03 + hh, m, Z)
        for (px, py) in ((x0, y0), (x0, y1), (x1, y0), (x1, y1)):
            box('Poste', px - 0.03, py - 0.03, 0, px + 0.03, py + 0.03, h, M['metal'], Z)
    shelf(61.3, 1.0, 61.85, 16.5)
    shelf(56.0, 6.0, 56.55, 14.5)
    shelf(57.6, 6.0, 58.15, 14.5)
    shelf(54.0, 0.3, 59.5, 0.8)
    # Red fría y controlados
    box('Refrigerador red fría', 59.6, 16.6, 0, 61.0, 17.6, 1.95, M['fridge'], Z)
    box('Termómetro', 59.9, 16.55, 1.3, 60.3, 16.6, 1.5, M['screen'], Z)
    box('Gabinete controlados', 53.0, 1.0, 0, 54.2, 1.8, 1.4, M['safe'], Z)
    box('Mesa de surtido', 54.2, 15.6, 0, 56.2, 16.6, 0.9, M['steel'], Z)
    box('Mesa de vales', 56.0, 16.6, 0, 58.0, 17.2, 0.9, M['steel'], Z)


def build_urgencias():
    Z = 'urgencias'
    for k in range(6):
        x0 = k * 4
        if k > 0:
            box('Cortina', x0 - 0.03, 36.2, 0.2, x0 + 0.03, 41.8, 2.1, M['blue'], Z)
        cx = x0 + 2
        box('Camilla', cx - 0.45, 38.4, 0.0, cx + 0.45, 40.6, 0.7, M['steel'], Z)
        box('Colchón', cx - 0.42, 38.5, 0.7, cx + 0.42, 40.5, 0.82, M['mattress'], Z)
        cyl('Portasueros', cx + 0.8, 40.4, 0, 1.9, 0.03, M['metal'], Z, seg=6)
        box('Monitor signos', cx - 0.3, 41.6, 1.3, cx + 0.3, 41.8, 1.7, M['screen'], Z)
    # Estación de enfermería
    box('Estación enfermería', 9.5, 28.5, 0, 14.5, 29.3, 1.05, M['counter'], Z)
    box('Estación enfermería', 9.5, 29.3, 0, 10.3, 31.5, 1.05, M['counter'], Z)
    box('Monitor', 11.5, 28.9, 1.05, 12.1, 28.95, 1.4, M['dark'], Z)
    box('Carro rojo', 16.5, 28.3, 0, 17.3, 29.0, 1.0, M['red'], Z)
    # Triage junto al acceso de ambulancias
    box('Triage', 1.0, 24.0, 0, 3.0, 24.8, 0.76, M['wood'], Z)
    box('Camilla triage', 4.0, 23.2, 0, 4.7, 25.2, 0.75, M['mattress'], Z)
    for i in range(4):
        box('Silla espera urg', 6.5 + i * 0.6, 22.5, 0.42, 7.0 + i * 0.6, 23.0, 0.48, M['seat'], Z)
    box('Silla de ruedas', 2.0, 29.5, 0.2, 2.6, 30.2, 0.55, M['dark'], Z)


SALAS = []

def build_quirofanos():
    Z = 'quirofano'
    names = ['Sala 1', 'Sala 2', 'Sala 3', 'Tococirugía']
    for i, nm in enumerate(names):
        cx, cy = 32.5 + i * 5, 36.5
        cyl('Base mesa', cx, cy, 0, 0.7, 0.25, M['steel'], Z)
        box('Mesa quirúrgica', cx - 0.3, cy - 1.0, 0.7, cx + 0.3, cy + 1.0, 0.85, M['green_or'], Z)
        cyl('Lámpara brazo', cx, cy, 2.3, 2.8, 0.04, M['metal'], Z, seg=6)
        cyl('Lámpara', cx, cy, 2.2, 2.3, 0.45, M['lamp'], Z)
        box('Máquina anestesia', cx - 1.9, cy + 1.0, 0, cx - 1.2, cy + 1.7, 1.4, M['white'], Z)
        box('Monitor anestesia', cx - 1.85, cy + 1.3, 1.4, cx - 1.25, cy + 1.35, 1.8, M['screen'], Z)
        box('Mesa Mayo', cx + 0.8, cy - 1.4, 0.9, cx + 1.4, cy - 0.9, 0.95, M['steel'], Z)
        cyl('Pata Mayo', cx + 1.1, cy - 1.15, 0, 0.9, 0.03, M['metal'], Z, seg=6)
        box('Carro material', cx + 1.4, cy + 2.5, 0, cx + 2.1, cy + 3.2, 1.0, M['steel'], Z)
        SALAS.append(dict(id=i + 1, name=nm, center=[cx, cy], door=[cx, 30.0], nurse=[cx + 1.2, cy - 2.2], table=[cx, cy]))
    # Recuperación y transfer
    for x in (33, 37, 43, 47):
        box('Cama recuperación', x - 0.5, 26.2, 0, x + 0.5, 28.4, 0.7, M['steel'], Z)
        box('Colchón', x - 0.45, 26.3, 0.7, x + 0.45, 28.3, 0.82, M['mattress'], Z)
    box('Estación quirófano', 38.5, 23.0, 0, 41.5, 23.7, 1.05, M['counter'], Z)
    box('Lavabo quirúrgico', 34.0, 29.3, 0.8, 36.0, 29.8, 1.0, M['steel'], Z)
    box('Lavabo quirúrgico', 44.0, 29.3, 0.8, 46.0, 29.8, 1.0, M['steel'], Z)
    # CEyE
    Z = 'ceye'
    for y in (24, 28, 32, 36):
        box('Anaquel estéril', 24.4, y, 0, 25.0, y + 3, 2.0, M['metal'], Z)
        for k in range(4):
            box('Paquete estéril', 24.45, y + 0.1, 0.3 + k * 0.45, 24.95, y + 2.9, 0.5 + k * 0.45, M['box3'], Z)
    box('Autoclave', 28.6, 38.5, 0, 29.8, 40.5, 1.7, M['steel'], Z)
    box('Mesa de preparación', 26.5, 30, 0, 27.5, 34, 0.9, M['steel'], Z)


def build_almacen():
    Z = 'almacen'
    for y0 in (22.6, 30.4):
        box('Rack', 51.0, y0, 0, 60.0, y0 + 1.0, 0.05, M['metal'], Z)
        for k in range(3):
            z = 0.1 + k * 0.85
            box('Nivel rack', 51.0, y0, z, 60.0, y0 + 1.0, z + 0.05, M['yellow'], Z)
            for b in range(12):
                if random.random() < 0.2:
                    continue
                bx = 51.1 + b * 0.74
                box('Caja', bx, y0 + 0.1, z + 0.05, bx + 0.6, y0 + 0.9, z + 0.05 + 0.35 + random.random() * 0.25,
                    random.choice([M['box1'], M['box1'], M['box2']]), Z)
        for x in (51.0, 55.5, 60.0):
            box('Poste rack', x - 0.05, y0, 0, x + 0.05, y0 + 1.0, 2.6, M['dark'], Z)
    for (x, y) in ((58.5, 26.0), (58.5, 28.2)):
        box('Tarima', x - 0.6, y - 0.5, 0, x + 0.6, y + 0.5, 0.14, M['pallet'], Z)
        box('Carga', x - 0.55, y - 0.45, 0.14, x + 0.55, y + 0.45, 1.0, M['box1'], Z)
    box('Escritorio almacén', 51.2, 25.2, 0, 52.6, 26.0, 0.76, M['wood'], Z)
    box('Refrigerador almacén', 51.1, 28.0, 0, 52.1, 29.0, 1.9, M['fridge'], Z)
    # Servicios
    Z = 'servicios'
    box('Planta de emergencia', 53, 35, 0, 57, 38, 1.8, M['dark'], Z)
    for i in range(3):
        box('Contenedor RPBI', 59 + i * 0.0, 34 + i * 1.6, 0, 61, 35.2 + i * 1.6, 1.1, M['red'], Z)


# ---------------------------------------------------------------------
#  Unión de geometría estática (pocas mallas = mejor rendimiento en iPad)
# ---------------------------------------------------------------------
def build_jefatura():
    """Fase 3: módulo de la jefatura de farmacia, donde se validan los pedidos extraordinarios
    (escritorio con terminal, tableta en atril y pantalla de pedidos en el muro sur)."""
    Z = 'farmacia'
    box('Escritorio jefatura', 58.6, 2.2, 0.72, 60.8, 3.1, 0.77, M['counter'], Z)
    for (px, py) in ((58.7, 2.3), (58.7, 3.0), (60.7, 2.3), (60.7, 3.0)):
        box('Pata escritorio', px - 0.03, py - 0.03, 0, px + 0.03, py + 0.03, 0.72, M['metal'], Z)
    box('Cajonera', 60.2, 2.3, 0, 60.7, 3.0, 0.65, M['metal'], Z)
    # terminal (monitor + base + teclado)
    box('Base terminal', 59.45, 2.35, 0.77, 59.75, 2.5, 0.8, M['dark'], Z)
    box('Brazo terminal', 59.57, 2.4, 0.8, 59.63, 2.45, 1.0, M['dark'], Z)
    box('Monitor terminal', 59.1, 2.38, 0.98, 60.1, 2.44, 1.5, M['dark'], Z)
    box('Pantalla terminal', 59.14, 2.445, 1.02, 60.06, 2.45, 1.46, M['screen'], Z)
    box('Teclado', 59.25, 2.65, 0.77, 59.95, 2.85, 0.79, M['dark'], Z)
    # tableta en atril (validación desde el mostrador)
    box('Atril', 58.85, 2.6, 0.77, 58.95, 2.7, 0.95, M['metal'], Z)
    box('Tableta', 58.7, 2.58, 0.95, 59.1, 2.62, 1.22, M['dark'], Z)
    box('Pantalla tableta', 58.72, 2.625, 0.97, 59.08, 2.63, 1.2, M['screen'], Z)
    # silla
    box('Asiento jefatura', 59.3, 3.35, 0.45, 59.9, 3.9, 0.52, M['dark'], Z)
    box('Respaldo jefatura', 59.3, 3.85, 0.52, 59.9, 3.92, 1.05, M['dark'], Z)
    cyl('Pie silla', 59.6, 3.62, 0, 0.45, 0.04, M['metal'], Z)
    # pantalla de pedidos en el muro (tablero de flujo)
    box('Tablero pedidos', 59.6, 1.0, 1.4, 61.2, 1.06, 2.5, M['dark'], Z)
    box('Pantalla pedidos', 59.68, 1.065, 1.5, 61.12, 1.07, 2.4, M['screen'], Z)
    for k, m in enumerate((M['teal'], M['teal'], M['box3'], M['box2'], M['box1'])):
        box('Etapa pedido', 59.75 + k * 0.28, 1.072, 2.15, 59.97 + k * 0.28, 1.075, 2.3, m, Z)
    box('Letrero jefatura', 59.6, 1.0, 2.55, 61.2, 1.06, 2.8, M['teal'], Z)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    ctx = dict(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs, object=objs[0])
    with bpy.context.temp_override(**ctx):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def merge_static():
    groups = {}
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or o.get('zone') == 'vehiculos':
            continue
        key = (o['zone'], o.data.materials[0].name)
        groups.setdefault(key, []).append(o)
    for (zone, mname), objs in groups.items():
        safe = ''.join(ch if ch.isalnum() else '_' for ch in mname)
        o = join(objs, f'{zone}__{safe}')
        o['zone'] = zone
        o['hosp'] = bool(ZONE.get(zone, {}).get('hosp', zone == 'urgencias_ext'))


# ---------------------------------------------------------------------
#  Layout para la web (rutas de personas)
# ---------------------------------------------------------------------
def layout_json():
    cw = 28 / 6
    return {
        'units': 'm (coordenadas Blender: x este, y norte)',
        'building': [0, 0, 62, 42],
        'zones': [dict(id=z['id'], name=z['name'], rect=list(z['rect']), hosp=z['hosp'], color=z['color']) for z in ZONES],
        'consultorios': [dict(id=i + 1, door=[round(cw * i + cw / 2, 2), 18.0], inside=[round(cw * i + cw / 2, 2), 12.6]) for i in range(6)],
        'seats': SEATS,
        'windows': WINDOWS,
        'vales': dict(stand=[57.0, 19.0], staff=[57.0, 17.0]),
        'salas': SALAS,
        'quirofanoDoor': [40.0, 22.0],
        'urgencias': dict(station=[12.0, 30.4], door=[12.0, 22.0], staff=[[11.0, 28.0], [13.5, 28.0], [3.6, 24.4]], beds=[[2 + 4 * k, 39.5] for k in range(6)]),
        'corridorY': 20.0,
        'exit': [38.0, -3.0],
        'lobby': [33.0, 11.0],
        'waitEntry': [37.2, 12.5],
        'locker': dict(pos=[29.6, -1.7], face=0),
        'jefatura': dict(desk=[59.6, 2.65], seat=[59.6, 3.6], screen=[60.4, 1.07, 1.95], badge=[59.6, 2.6, 2.9]),
        'pharmacyStaff': [[53.0, 10.0], [53.0, 12.75], [53.0, 15.5], [57.0, 16.9], [55.2, 15.0]],
        'almacenStaff': [[57.5, 27.0]],
        'van': dict(park=[66.6, 27.0], enter=[79.0, -6.0], turn=[79.0, 27.0]),
        'standing': [[49.2, 9.0], [49.2, 17.2], [37.5, 9.2], [48.6, 13.1], [37.4, 16.8]],
        'labels': {z['id']: [round((z['rect'][0] + z['rect'][2]) / 2, 2), round((z['rect'][1] + z['rect'][3]) / 2, 2)] for z in ZONES},
    }


def main(export=True):
    reset_scene()
    materials()
    build_exterior()
    build_floors()
    build_walls()
    build_consulta()
    build_vestibulo()
    build_espera()
    build_farmacia()
    build_jefatura()
    build_urgencias()
    build_quirofanos()
    build_almacen()
    build_van()
    merge_static()
    # Luz y cámara solo para vistas en Blender
    sun = bpy.data.lights.new('Sol', 'SUN'); sun.energy = 3.0
    so = bpy.data.objects.new('Sol', sun); so.rotation_euler = (math.radians(50), 0, math.radians(30))
    bpy.context.scene.collection.objects.link(so)
    os.makedirs(BASE, exist_ok=True)
    lay = layout_json()
    with open(os.path.join(BASE, 'unidad_layout.json'), 'w', encoding='utf-8') as f:
        json.dump(lay, f, ensure_ascii=False, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BASE, 'unidad_medica.blend'))
    if export:
        glb = os.path.join(BASE, 'unidad_medica.glb')
        bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=False, export_extras=True,
                                  export_apply=True, export_lights=False, export_cameras=False, export_yup=True)
        os.makedirs(WEB_ASSETS, exist_ok=True)
        import shutil
        shutil.copyfile(glb, os.path.join(WEB_ASSETS, 'unidad_medica.glb'))
        shutil.copyfile(os.path.join(BASE, 'unidad_layout.json'), os.path.join(WEB_ASSETS, 'unidad_layout.json'))
    return dict(objects=len(bpy.data.objects), meshes=len(bpy.data.meshes), seats=len(SEATS),
                tris=sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))


if __name__ == '__main__':
    print(main())

# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  cenadi_builder.py · nivel nacional
#  CENADI: Centro Nacional de Distribución del ISSSTE (operado por Birmex),
#  Estado de México. Es el nodo que abastece las ~786 unidades del ISSSTE.
#  Datos públicos usados:
#   · 35,000 posiciones de almacenamiento y 38 andenes (ConsultorSalud, nov 2025)
#   · seis antecámaras de red fría (ConsultorSalud, nov 2025)
#   · red fría con refrigeración y congelación; área confinada de alto valor y
#     controlados; patios de maniobra, CCTV, planta de emergencia y comedor
#     (Excélsior, oct 2025)
#   · 25,118 m² de almacén + 1,756 m² de red fría + 1,036 m² de oficinas de
#     validación del ISSSTE; operación 24/365 (Quadratín, 2017, sede de
#     Tlalnepantla, carretera Lago de Guadalupe)
#  Lo demás (forma de la nave, altura, distribución interna, patios) es una
#  propuesta coherente con esos datos.
#   · nave 200 × 130 m × 14 m; 52 filas de rack selectivo de 9 niveles
#   · 14 andenes de recepción (norte) y 24 de embarque (sur)
#   · red fría 2–8 °C y congelación con 6 antecámaras, jaula de controlados,
#     picking por pieza, cuarentena/validación y carriles de consolidación
#   · oficinas (2 niveles), caseta, comedor, planta de emergencia, tráileres
#  Las filas de rack son un objeto por fila (wh_type = rack_row) con
#  wh_bays / wh_levels / wh_pos_per_bay, para no crear 35,000 objetos; el visor
#  calcula cada posición: y = y0 + bahía·wh_bay_len, z = nivel·wh_level_h.
#  Uso: exec(open(r"...\\nacional\\cenadi_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export()
# =====================================================================
import bpy, bmesh, os, math, random
from mathutils import Vector, Matrix

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "nacional")

W, D, HGT = 200.0, 130.0, 14.0      # nave
YARD = -1.2                         # patio 1.2 m abajo del piso de la nave (altura de anden)
BAY, LVL_H, NLVL, PPB = 3.6, 1.4, 9, 3
RACK_Y0, NBAYS = 24.0, 23           # filas de y = 24 a 106.8
MOD, NMOD, RACK_X0 = 5.5, 26, 6.0
DOCK_W, DOCK_H = 3.0, 3.4

# ------------------------------------------------------------------ materiales
def mat(name, rgb, rough=0.6, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    m.diffuse_color = (*rgb, alpha)
    return m

M = {}

def mats():
    M.update(
        floor=mat('CN_Piso', (0.55, 0.56, 0.55), 0.8),
        wall=mat('CN_Muro', (0.80, 0.80, 0.78), 0.85),
        joint=mat('CN_Junta', (0.45, 0.45, 0.44), 0.9),
        guinda=mat('CN_Guinda', (0.30, 0.03, 0.08), 0.5),
        roof=mat('CN_Techo', (0.55, 0.58, 0.60), 0.5, 0.3),
        sky=mat('CN_Domo', (0.75, 0.85, 0.92), 0.1, 0.0, 0.6),
        steel=mat('CN_Acero', (0.10, 0.25, 0.60), 0.4, 0.6),
        beam=mat('CN_Larguero', (0.90, 0.35, 0.03), 0.45, 0.4),
        pallet=mat('CN_Tarima', (0.45, 0.30, 0.15)),
        box=mat('CN_Caja', (0.62, 0.48, 0.30)),
        boxw=mat('CN_CajaBlanca', (0.88, 0.88, 0.85)),
        film=mat('CN_Emplaye', (0.80, 0.85, 0.88), 0.2),
        cold=mat('CN_PanelFrio', (0.72, 0.84, 0.92), 0.3),
        frz=mat('CN_PanelCongelado', (0.55, 0.70, 0.88), 0.3),
        cage=mat('CN_Jaula', (0.25, 0.25, 0.27), 0.4, 0.7),
        mesh=mat('CN_Malla', (0.35, 0.35, 0.38), 0.4, 0.6, 0.35),
        yellow=mat('CN_Amarillo', (0.95, 0.70, 0.05)),
        asphalt=mat('CN_Asfalto', (0.12, 0.12, 0.13), 0.9),
        concrete=mat('CN_Concreto', (0.48, 0.47, 0.45), 0.9),
        grass=mat('CN_Pasto', (0.20, 0.32, 0.10), 1.0),
        line=mat('CN_Linea', (0.92, 0.92, 0.90), 0.6),
        glass=mat('CN_Vidrio', (0.12, 0.22, 0.30), 0.08, 0.3),
        dark=mat('CN_Oscuro', (0.06, 0.06, 0.07)),
        door=mat('CN_Cortina', (0.35, 0.37, 0.40), 0.5, 0.5),
        dock=mat('CN_Anden', (0.22, 0.22, 0.24), 0.7),
        trailer=mat('CN_Caja_Trailer', (0.90, 0.90, 0.90), 0.4),
        reefer=mat('CN_Termo', (0.20, 0.45, 0.70), 0.4),
        cab=mat('CN_Tractor', (0.55, 0.05, 0.08), 0.35, 0.3),
        tire=mat('CN_Llanta', (0.03, 0.03, 0.03), 0.9),
        green=mat('CN_Verde', (0.05, 0.40, 0.25), 0.5),
        blue=mat('CN_Azul', (0.05, 0.20, 0.55), 0.5),
    )

# ------------------------------------------------------------------ utilidades
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

def cyl(name, c, loc, r, h, m, seg=16, axis='Z'):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    if axis == 'X':
        o.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'Y':
        o.rotation_euler = (math.pi / 2, 0, 0)
    c.objects.link(o)
    return o

def empty(name, c, loc, props, size=0.5):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = size; o.location = loc
    c.objects.link(o)
    for k, v in props.items():
        o[k] = v
    return o

def text(name, c, body, loc, size, m, rot=(math.pi / 2, 0, 0), extrude=0.0):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.resolution_u = 2
    cu.extrude = extrude
    t = bpy.data.objects.new(name + '_tmp', cu)
    t.location = loc; t.rotation_euler = rot
    c.objects.link(t)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(t.evaluated_get(dg))
    o = bpy.data.objects.new(name, me)
    o.matrix_world = t.matrix_world.copy()
    me.materials.clear(); me.materials.append(m)
    c.objects.link(o)
    bpy.data.objects.remove(t, do_unlink=True)
    return o

class MB:
    """Malla compuesta de cajas con varios materiales (una sola malla, pocas llamadas de dibujo)."""
    def __init__(self, mats_list):
        self.bm = bmesh.new(); self.mats = mats_list
    def box(self, center, size, mi):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        for v in r['verts']:
            v.co = Vector((v.co.x * size[0] + center[0], v.co.y * size[1] + center[1], v.co.z * size[2] + center[2]))
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = mi
    def cyl(self, center, r, h, mi, seg=12, axis='Z'):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
        rot = Matrix.Identity(3)
        if axis == 'X':
            rot = Matrix.Rotation(math.pi / 2, 3, 'Y')
        elif axis == 'Y':
            rot = Matrix.Rotation(math.pi / 2, 3, 'X')
        for v in res['verts']:
            v.co = rot @ v.co + Vector(center)
        for f in {f for v in res['verts'] for f in v.link_faces}:
            f.material_index = mi
    def mesh(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        return me

def obj(name, c, me, loc=(0, 0, 0), rot=(0, 0, 0), props=None):
    o = bpy.data.objects.new(name, me)
    o.location = loc; o.rotation_euler = rot
    c.objects.link(o)
    for k, v in (props or {}).items():
        o[k] = v
    return o

# ------------------------------------------------------------------ nave
def wall_x(c, name, y, x0, x1, openings, t=0.3):
    """Muro paralelo al eje X con huecos de anden centrados en `openings`."""
    edges = [x0] + [v for x in sorted(openings) for v in (x - DOCK_W / 2 - 0.1, x + DOCK_W / 2 + 0.1)] + [x1]
    for i in range(0, len(edges), 2):
        a, b = edges[i], edges[i + 1]
        if b - a > 0.01:
            box(f'{name}_{i // 2}', c, ((a + b) / 2, y, HGT / 2), (b - a, t, HGT), M['wall'])
    for k, x in enumerate(openings):
        box(f'{name}_Dintel_{k}', c, (x, y, (DOCK_H + HGT) / 2), (DOCK_W + 0.2, t, HGT - DOCK_H), M['wall'])

def building(c):
    box('CN_Piso', c, (W / 2, D / 2, -0.1), (W, D, 0.2), M['floor'])
    # zocalo de cimentacion visible (la nave esta a altura de anden)
    box('CN_Zocalo', c, (W / 2, D / 2, YARD / 2 - 0.1), (W + 0.6, D + 0.6, -YARD - 0.2), M['concrete'])
    t = 0.3
    rec = [W / 2 - 13 * 4.2 / 2 + k * 4.2 for k in range(14)]        # 14 recepcion, norte
    emb = [W / 2 - 23 * 4.2 / 2 + k * 4.2 for k in range(24)]        # 24 embarque, sur
    wall_x(c, 'CN_Muro_Sur', 0, 0, W, emb, t)
    wall_x(c, 'CN_Muro_Norte', D, 0, W, rec, t)
    box('CN_Muro_Oeste', c, (0, D / 2, HGT / 2), (t, D, HGT), M['wall'])
    box('CN_Muro_Este', c, (W, D / 2, HGT / 2), (t, D, HGT), M['wall'])
    # juntas de paneles tilt-up y franja institucional
    for x in range(10, int(W), 10):
        for y, s in ((0, -1), (D, 1)):
            box(f'CN_Junta_{y}_{x}', c, (x, y + s * 0.17, HGT / 2), (0.08, 0.05, HGT), M['joint'])
    for y in range(10, int(D), 10):
        for x, s in ((0, -1), (W, 1)):
            box(f'CN_JuntaL_{x}_{y}', c, (x + s * 0.17, y, HGT / 2), (0.05, 0.08, HGT), M['joint'])
    box('CN_Franja_Sur', c, (W / 2, -0.2, HGT - 0.9), (W + 0.4, 0.08, 1.2), M['guinda'])
    box('CN_Franja_Norte', c, (W / 2, D + 0.2, HGT - 0.9), (W + 0.4, 0.08, 1.2), M['guinda'])
    box('CN_Franja_Oeste', c, (-0.2, D / 2, HGT - 0.9), (0.08, D + 0.4, 1.2), M['guinda'])
    box('CN_Franja_Este', c, (W + 0.2, D / 2, HGT - 0.9), (0.08, D + 0.4, 1.2), M['guinda'])
    # rotulos
    text('CN_Rotulo_Oeste', c, 'CENADI', (-0.35, D / 2, 9.0), 6.0, M['guinda'], rot=(math.pi / 2, 0, -math.pi / 2))
    text('CN_Rotulo_Oeste2', c, 'CENTRO NACIONAL DE DISTRIBUCIÓN', (-0.35, D / 2, 5.2), 2.2, M['dark'], rot=(math.pi / 2, 0, -math.pi / 2))
    text('CN_Rotulo_Sur', c, 'CENADI · EMBARQUE', (W / 2, -0.35, 9.6), 2.6, M['dark'])
    text('CN_Rotulo_Norte', c, 'CENADI · RECEPCIÓN', (W / 2, D + 0.35, 9.6), 2.6, M['dark'], rot=(math.pi / 2, 0, math.pi))
    # andenes
    docks = []
    for k, x in enumerate(emb):
        docks.append(dock(c, f'Embarque {k + 1:02d}', x, 0, -1, k))
    for k, x in enumerate(rec):
        docks.append(dock(c, f'Recepción {k + 1:02d}', x, D, 1, k + 100))
    # marquesinas continuas sobre andenes
    box('CN_Marquesina_Sur', c, (W / 2, -2.0, 4.9), (emb[-1] - emb[0] + 6, 4.0, 0.3), M['roof'])
    box('CN_Marquesina_Norte', c, (W / 2, D + 2.0, 4.9), (rec[-1] - rec[0] + 6, 4.0, 0.3), M['roof'])
    # techo (ocultable) con domos
    roof = box('CN_Techo', c, (W / 2, D / 2, HGT + 0.15), (W + 0.8, D + 0.8, 0.3), M['roof'], {'wh_type': 'roof'})
    for i in range(8):
        y = 12 + i * 15
        box(f'CN_Domo_{i}', c, (W / 2, y, HGT + 0.35), (W - 20, 1.6, 0.15), M['sky'], {'wh_type': 'roof'})
    for i, (x, y) in enumerate(((30, 40), (30, 90), (90, 40), (90, 90), (150, 60), (180, 30))):
        box(f'CN_Extractor_{i}', c, (x, y, HGT + 1.0), (3, 3, 1.4), M['concrete'], {'wh_type': 'roof'})
    return emb, rec

def dock(c, label, x, y, side, k):
    """side = -1 fachada sur, +1 fachada norte."""
    o = box(f'CN_Anden_{k}', c, (x, y + side * 0.2, DOCK_H / 2), (DOCK_W, 0.12, DOCK_H), M['door'],
            {'wh_type': 'dock', 'wh_dock': label})
    box(f'CN_Rampa_{k}', c, (x, y + side * 1.0, -0.05), (DOCK_W - 0.4, 1.6, 0.1), M['dock'])
    for s in (-1, 1):
        box(f'CN_Tope_{k}_{s}', c, (x + s * 1.3, y + side * 0.35, -0.6), (0.3, 0.3, 0.5), M['dark'])
    box(f'CN_Sello_{k}', c, (x, y + side * 0.4, DOCK_H + 0.2), (DOCK_W + 0.6, 0.6, 0.4), M['dark'])
    box(f'CN_Guia_{k}', c, (x, y + side * 9.0, YARD + 0.01), (0.15, 16.0, 0.02), M['yellow'])
    return o

# ------------------------------------------------------------------ racks
def rack_row_mesh(name, nbays, nlvl, occ, seed, white_share=0.45):
    """Fila de rack selectivo en coordenadas locales: x = fondo (-0.55..0.55), y = largo, z = alto."""
    rnd = random.Random(seed)
    mb = MB([M['steel'], M['beam'], M['pallet'], M['box'], M['boxw'], M['film']])
    L = nbays * BAY
    top = nlvl * LVL_H + 0.2
    for b in range(nbays + 1):
        y = b * BAY
        for s in (-1, 1):
            mb.box((s * 0.5, y, top / 2), (0.09, 0.09, top), 0)
        mb.box((0, y, top - 0.1), (1.0, 0.05, 0.05), 0)
    for lv in range(1, nlvl):
        z = lv * LVL_H - 0.06
        for s in (-1, 1):
            mb.box((s * 0.5, L / 2, z), (0.06, L, 0.12), 1)
    for b in range(nbays):
        for lv in range(nlvl):
            z0 = lv * LVL_H
            for p in range(PPB):
                if rnd.random() > occ:
                    continue
                y = b * BAY + 0.6 + p * 1.2
                mb.box((0, y, z0 + 0.07), (1.15, 1.0, 0.14), 2)
                h = rnd.uniform(0.8, 1.1)
                mi = 4 if rnd.random() < white_share else 3
                if rnd.random() < 0.25:
                    mi = 5
                mb.box((0, y, z0 + 0.14 + h / 2), (1.05, 0.95, h), mi)
    return mb.mesh(name)

def racks(c):
    variants = [rack_row_mesh(f'CN_FilaRack_Var{i}', NBAYS, NLVL, occ, 40 + i)
                for i, occ in enumerate((0.92, 0.84, 0.95, 0.76))]
    rnd = random.Random(7)
    n = 0; total = 0
    for m in range(NMOD):
        xm = RACK_X0 + m * MOD
        for j, xc in enumerate((xm + 0.55, xm + 1.85)):
            n += 1
            me = variants[rnd.randrange(len(variants))]
            pos = NBAYS * NLVL * PPB
            total += pos
            obj(f'CN_Fila_{n:02d}', c, me, (xc, RACK_Y0, 0), props={
                'wh_type': 'rack_row', 'wh_row': f'F{n:02d}', 'wh_zona': 'Seco general',
                'wh_bays': NBAYS, 'wh_levels': NLVL, 'wh_pos_per_bay': PPB,
                'wh_bay_len': BAY, 'wh_level_h': LVL_H, 'wh_positions': pos})
    # pasillos (marcas)
    for m in range(NMOD + 1):
        x = RACK_X0 + m * MOD - 1.6
        box(f'CN_Pasillo_{m}', c, (x, RACK_Y0 + NBAYS * BAY / 2, 0.006), (0.12, NBAYS * BAY, 0.01), M['yellow'])
    return n, total

# ------------------------------------------------------------------ red fria, controlados, picking
def cold_chain(c, cr):
    x0, x1 = 155.0, 197.0
    y0, ym, y1 = 46.0, 76.0, 88.0      # 2-8 °C de 46 a 76; congelacion de 76 a 88
    h = 10.0
    def walls(prefix, ya, yb, m):
        box(f'{prefix}_S', c, ((x0 + x1) / 2, ya, h / 2), (x1 - x0, 0.2, h), m)
        box(f'{prefix}_N', c, ((x0 + x1) / 2, yb, h / 2), (x1 - x0, 0.2, h), m)
        box(f'{prefix}_O', c, (x0, (ya + yb) / 2, h / 2), (0.2, yb - ya, h), m)
        box(f'{prefix}_E', c, (x1, (ya + yb) / 2, h / 2), (0.2, yb - ya, h), m)
        box(f'{prefix}_Techo', c, ((x0 + x1) / 2, (ya + yb) / 2, h + 0.1), (x1 - x0, yb - ya, 0.2), m, {'wh_type': 'roof'})
    walls('CN_Refrig', y0, ym, M['cold'])
    walls('CN_Congel', ym, y1, M['frz'])
    box('CN_Zona_Refrig', c, ((x0 + x1) / 2, (y0 + ym) / 2, 0.005), (x1 - x0 - 0.4, ym - y0 - 0.4, 0.01), M['cold'],
        {'wh_type': 'zone', 'wh_zona': 'Red fría 2–8 °C', 'wh_temp': '2–8 °C'})
    box('CN_Zona_Congel', c, ((x0 + x1) / 2, (ym + y1) / 2, 0.005), (x1 - x0 - 0.4, y1 - ym - 0.4, 0.01), M['frz'],
        {'wh_type': 'zone', 'wh_zona': 'Congelación', 'wh_temp': '−25 a −15 °C'})
    # racks internos (6 niveles)
    v_ref = rack_row_mesh('CN_FilaFrio', 7, 6, 0.85, 91, white_share=0.8)
    pos_cold = 0
    for i in range(6):
        x = x0 + 4 + i * 6.4
        obj(f'CN_FilaFrio_{i + 1}', cr, v_ref, (x, y0 + 2.5, 0), props={
            'wh_type': 'rack_row', 'wh_row': f'RF{i + 1}', 'wh_zona': 'Red fría 2–8 °C',
            'wh_bays': 7, 'wh_levels': 6, 'wh_pos_per_bay': PPB, 'wh_bay_len': BAY, 'wh_level_h': LVL_H,
            'wh_positions': 7 * 6 * PPB})
        pos_cold += 7 * 6 * PPB
    v_frz = rack_row_mesh('CN_FilaCongel', 10, 6, 0.8, 92, white_share=0.9)
    for i in range(2):
        y = ym + 3.5 + i * 5.0
        obj(f'CN_FilaCongel_{i + 1}', cr, v_frz, (x0 + 3, y, 0), rot=(0, 0, -math.pi / 2), props={
            'wh_type': 'rack_row', 'wh_row': f'CG{i + 1}', 'wh_zona': 'Congelación',
            'wh_bays': 10, 'wh_levels': 6, 'wh_pos_per_bay': PPB, 'wh_bay_len': BAY, 'wh_level_h': LVL_H,
            'wh_positions': 10 * 6 * PPB})
        pos_cold += 10 * 6 * PPB
    # 6 antecamaras al sur del bloque frio (y = 40 a 46)
    aw = (x1 - x0) / 6
    for k in range(6):
        xa = x0 + aw * (k + 0.5)
        for s in (-1, 1):
            box(f'CN_Antecamara_{k}_{s}', c, (xa + s * aw / 2, 43, 2.0), (0.15, 6, 4.0), M['cold'])
        box(f'CN_Antecamara_{k}_Techo', c, (xa, 43, 4.05), (aw, 6, 0.1), M['cold'])
        box(f'CN_Antecamara_{k}_Puerta', c, (xa, 40.05, 1.5), (2.4, 0.1, 3.0), M['door'],
            {'wh_type': 'antechamber', 'wh_name': f'Antecámara {k + 1}'})
        box(f'CN_Antecamara_{k}_Cortina', c, (xa, 45.95, 1.5), (2.4, 0.06, 3.0), M['film'])
    text('CN_Txt_Frio', c, 'RED FRÍA 2–8 °C', ((x0 + x1) / 2, y0 - 6.2, 5.5), 1.6, M['blue'])
    text('CN_Txt_Congel', c, 'CONGELACIÓN', (x0 - 0.15, (ym + y1) / 2, 6.0), 1.3, M['blue'], rot=(math.pi / 2, 0, -math.pi / 2))
    return pos_cold

def controlled(c, cr):
    x0, x1, y0, y1 = 156.0, 196.0, 92.0, 106.0
    hh = 4.0
    for xs in range(int(x0), int(x1) + 1, 4):
        for y in (y0, y1):
            box(f'CN_Jaula_Poste_{xs}_{int(y)}', c, (xs, y, hh / 2), (0.1, 0.1, hh), M['cage'])
    for ys in range(int(y0), int(y1) + 1, 4):
        for x in (x0, x1):
            box(f'CN_Jaula_PosteL_{int(x)}_{ys}', c, (x, ys, hh / 2), (0.1, 0.1, hh), M['cage'])
    for nm, loc, size in (('S', ((x0 + x1) / 2, y0, hh / 2), (x1 - x0, 0.04, hh)),
                          ('N', ((x0 + x1) / 2, y1, hh / 2), (x1 - x0, 0.04, hh)),
                          ('O', (x0, (y0 + y1) / 2, hh / 2), (0.04, y1 - y0, hh)),
                          ('E', (x1, (y0 + y1) / 2, hh / 2), (0.04, y1 - y0, hh))):
        box(f'CN_Jaula_Malla_{nm}', c, loc, size, M['mesh'])
    box('CN_Zona_Controlados', c, ((x0 + x1) / 2, (y0 + y1) / 2, 0.005), (x1 - x0, y1 - y0, 0.01), M['guinda'],
        {'wh_type': 'zone', 'wh_zona': 'Controlados y alto valor'})
    v = rack_row_mesh('CN_FilaControl', 9, 4, 0.7, 93, white_share=0.9)
    pos = 0
    for i in range(3):
        y = y0 + 3 + i * 4.0
        obj(f'CN_FilaControl_{i + 1}', cr, v, (x0 + 2, y, 0), rot=(0, 0, -math.pi / 2), props={
            'wh_type': 'rack_row', 'wh_row': f'CT{i + 1}', 'wh_zona': 'Controlados y alto valor',
            'wh_bays': 9, 'wh_levels': 4, 'wh_pos_per_bay': PPB, 'wh_bay_len': BAY, 'wh_level_h': LVL_H,
            'wh_positions': 9 * 4 * PPB})
        pos += 9 * 4 * PPB
    text('CN_Txt_Control', c, 'CONTROLADOS · ALTO VALOR', ((x0 + x1) / 2, y0 - 0.2, 4.6), 1.1, M['guinda'])
    return pos

def picking(c):
    x0, x1, y0, y1 = 156.0, 196.0, 24.0, 38.0
    mb = MB([M['steel'], M['box'], M['boxw']])
    rnd = random.Random(5)
    for i in range(6):
        y = y0 + 1.5 + i * 2.4
        for lv in range(5):
            z = 0.1 + lv * 0.45
            mb.box(((x0 + x1) / 2, y, z), (x1 - x0, 0.6, 0.03), 0)
            for k in range(36):
                if rnd.random() < 0.85:
                    mb.box((x0 + 0.6 + k * 1.1, y, z + 0.17), (0.9, 0.5, 0.3), 1 if rnd.random() < 0.5 else 2)
        for xp in range(int(x0), int(x1) + 1, 4):
            mb.box((xp, y, 1.15), (0.05, 0.6, 2.3), 0)
    obj('CN_Picking', c, mb.mesh('CN_Picking'), props={'wh_type': 'zone', 'wh_zona': 'Picking por pieza'})
    text('CN_Txt_Picking', c, 'SURTIDO POR PIEZA', ((x0 + x1) / 2, y1 + 0.4, 3.6), 1.1, M['dark'])

# ------------------------------------------------------------------ zonas de piso
def floor_zones(c, emb, rec):
    rnd = random.Random(11)
    # recepcion / cuarentena / validacion ISSSTE (norte)
    box('CN_Zona_Recepcion', c, (W / 2, 118, 0.004), (W - 8, 20, 0.008), M['floor'],
        {'wh_type': 'zone', 'wh_zona': 'Recepción'})
    box('CN_Zona_Cuarentena', c, (40, 118, 0.006), (60, 16, 0.01), M['yellow'],
        {'wh_type': 'zone', 'wh_zona': 'Cuarentena y validación ISSSTE'})
    box('CN_Zona_Cuarentena_In', c, (40, 118, 0.008), (59, 15, 0.01), M['floor'])
    text('CN_Txt_Cuarentena', c, 'CUARENTENA · VALIDACIÓN ISSSTE', (40, 109.8, 0.03), 1.4, M['guinda'], rot=(0, 0, 0))
    mb = MB([M['pallet'], M['box'], M['boxw'], M['film']])
    for i in range(40):
        x = 14 + (i % 10) * 5.2 + rnd.uniform(-0.3, 0.3)
        y = 112 + (i // 10) * 3.2
        mb.box((x, y, 0.07), (1.2, 1.0, 0.14), 0)
        h = rnd.uniform(1.0, 1.5)
        mb.box((x, y, 0.14 + h / 2), (1.15, 0.95, h), rnd.choice((1, 2, 3)))
    # carriles de consolidacion por destino (sur), uno por anden de embarque
    regiones = ['NORTE', 'NOROESTE', 'NORESTE', 'OCCIDENTE', 'BAJÍO', 'CENTRO', 'CDMX', 'EDOMEX',
                'GOLFO', 'SURESTE', 'SUR', 'PENÍNSULA']
    for k, x in enumerate(emb):
        box(f'CN_Carril_{k}', c, (x, 11, 0.006), (3.2, 18, 0.01), M['line'],
            {'wh_type': 'lane', 'wh_lane': f'Embarque {k + 1:02d}', 'wh_region': regiones[k // 2]})
        box(f'CN_Carril_In_{k}', c, (x, 11, 0.008), (3.0, 17.8, 0.01), M['floor'])
        for j in range(rnd.randint(2, 6)):
            y = 3 + j * 2.6
            mb.box((x, y, 0.07), (1.2, 1.0, 0.14), 0)
            h = rnd.uniform(1.1, 1.6)
            mb.box((x, y, 0.14 + h / 2), (1.15, 0.95, h), 3)
        if k % 2 == 0:
            text(f'CN_Txt_Region_{k}', c, regiones[k // 2], (x + 2.1, 20.8, 0.03), 0.9, M['dark'], rot=(0, 0, 0))
    obj('CN_Tarimas_Piso', c, mb.mesh('CN_Tarimas_Piso'))
    # montacargas / reach trucks
    for i, (x, y) in enumerate(((RACK_X0 + 2 * MOD + 3.4, 50), (RACK_X0 + 7 * MOD + 3.4, 80), (RACK_X0 + 13 * MOD + 3.4, 40),
                                (RACK_X0 + 19 * MOD + 3.4, 95), (60, 22), (120, 108))):
        reach_truck(c, f'CN_Montacargas_{i + 1}', x, y)

def reach_truck(c, name, x, y):
    mb = MB([M['yellow'], M['dark'], M['steel']])
    mb.box((0, 0, 0.75), (1.1, 1.6, 1.3), 0)
    mb.box((0, -0.3, 1.8), (1.0, 0.9, 0.08), 1)
    for s in (-1, 1):
        mb.box((s * 0.45, 0.4, 1.4), (0.05, 0.05, 0.9), 1)
        mb.box((s * 0.3, 1.1, 3.0), (0.1, 0.1, 6.0), 2)
        mb.box((s * 0.3, 1.8, 0.1), (0.12, 1.2, 0.06), 2)
    obj(name, c, mb.mesh(name), (x, y, 0), props={'wh_type': 'forklift'})

# ------------------------------------------------------------------ vehiculos
def trailer_mesh(name, refrig):
    mb = MB([M['trailer'], M['reefer'], M['tire'], M['dark'], M['guinda']])
    # caja de 16.2 m (53 ft); y = 0 en la puerta trasera (pegada al anden), crece hacia y+
    mb.box((0, 8.1, 2.65), (2.6, 16.2, 2.9), 0)
    mb.box((0, 0.02, 2.65), (2.5, 0.06, 2.8), 3)
    mb.box((0, 8.1, 1.05), (2.4, 16.2, 0.3), 3)
    mb.box((1.31, 8.1, 3.2), (0.02, 15.0, 0.5), 4)
    mb.box((-1.31, 8.1, 3.2), (0.02, 15.0, 0.5), 4)
    if refrig:
        mb.box((0, 16.45, 3.2), (2.2, 0.5, 1.6), 1)
    for yy in (1.3, 2.5):
        for s in (-1, 1):
            mb.cyl((s * 1.05, yy, 0.5), 0.5, 0.35, 2, 12, 'X')
    for s in (-1, 1):
        mb.box((s * 0.9, 13.5, 0.6), (0.12, 0.12, 1.0), 3)
    return mb.mesh(name)

def tractor_mesh(name):
    mb = MB([M['cab'], M['glass'], M['tire'], M['dark'], M['steel']])
    mb.box((0, 2.0, 2.0), (2.5, 2.4, 2.6), 0)          # cabina
    mb.box((0, 3.6, 1.4), (2.3, 1.2, 1.4), 0)          # cofre
    mb.box((0, 0.6, 2.3), (2.4, 0.6, 2.0), 0)          # dormitorio
    mb.box((0, 3.21, 2.5), (2.2, 0.04, 0.9), 1)        # parabrisas
    mb.box((0, 0.0, 1.0), (1.0, 4.0, 0.3), 3)          # quinta rueda / chasis
    mb.box((0, 4.25, 1.0), (2.4, 0.15, 0.6), 4)        # defensa
    for s in (-1, 1):
        mb.cyl((s * 1.3, 0.2, 2.6), 0.12, 3.2, 4, 8)   # escapes
    for yy in (-0.8, 0.5, 3.3):
        for s in (-1, 1):
            mb.cyl((s * 1.05, yy, 0.5), 0.5, 0.35, 2, 12, 'X')
    return mb.mesh(name)

def vehicles(c, emb, rec):
    tr_s, tr_r, tc = trailer_mesh('CN_Trailer_Seco', False), trailer_mesh('CN_Trailer_Refrigerado', True), tractor_mesh('CN_Tractor')
    rnd = random.Random(3)
    def rig(name, x, y_door, facing, refrig, z=YARD):
        """facing = -1: el remolque se extiende hacia y- (fachada sur)."""
        rot = (0, 0, 0) if facing > 0 else (0, 0, math.pi)
        tme = tr_r if refrig else tr_s
        obj(f'{name}_Remolque', c, tme, (x, y_door, z), rot,
            {'wh_type': 'vehicle', 'wh_vehicle': 'tractocamion', 'wh_refrig': bool(refrig)})
        obj(f'{name}_Tractor', c, tc, (x, y_door + facing * 17.3, z), rot)
    for k in (0, 2, 3, 6, 9, 10, 13, 16, 19, 22):
        rig(f'CN_TC_Emb_{k + 1:02d}', emb[k], -0.6, -1, rnd.random() < 0.35)
    for k in (1, 4, 7, 8, 12):
        rig(f'CN_TC_Rec_{k + 1:02d}', rec[k], D + 0.6, 1, rnd.random() < 0.3)
    # patio de espera de remolques (suroeste)
    for i in range(8):
        x = -4 - i * 4.2
        obj(f'CN_Remolque_Espera_{i + 1}', c, tr_r if i % 3 == 0 else tr_s, (x - 8, -20, YARD), (0, 0, math.pi),
            {'wh_type': 'vehicle', 'wh_vehicle': 'remolque'})

# ------------------------------------------------------------------ sitio
def site(c):
    box('CN_Terreno', c, (75, 50, YARD - 0.25), (340, 260, 0.3), M['grass'])
    box('CN_Patio_Sur', c, (W / 2 - 25, -30, YARD - 0.05), (W + 70, 60, 0.12), M['asphalt'],
        {'wh_type': 'zone', 'wh_zona': 'Patio de maniobras sur (embarque)'})
    box('CN_Patio_Norte', c, (W / 2, D + 22, YARD - 0.05), (W + 20, 44, 0.12), M['asphalt'],
        {'wh_type': 'zone', 'wh_zona': 'Patio de maniobras norte (recepción)'})
    box('CN_Vialidad_Este', c, (W + 10, D / 2, YARD - 0.05), (20, D + 40, 0.12), M['asphalt'])
    box('CN_Vialidad_Oeste', c, (-14, D / 2 + 20, YARD - 0.05), (16, D + 40, 0.12), M['asphalt'])
    for i in range(12):
        box(f'CN_Cajon_Remolque_{i}', c, (-12 - i * 4.2 + 8, -20 - 8, YARD + 0.02), (0.15, 18, 0.02), M['line'])
    # carretera de acceso
    box('CN_Carretera', c, (-85, 50, YARD - 0.04), (18, 260, 0.1), M['asphalt'])
    for i in range(13):
        box(f'CN_Carretera_Linea_{i}', c, (-85, -70 + i * 20, YARD + 0.02), (0.25, 8, 0.02), M['line'])
    text('CN_Txt_Carretera', c, 'CARRETERA LAGO DE GUADALUPE', (-76.5, 50, YARD + 0.05), 2.2, M['line'],
         rot=(0, 0, math.pi / 2))
    box('CN_Acceso', c, (-62, -40, YARD - 0.04), (30, 14, 0.1), M['asphalt'])
    # caseta y pluma
    box('CN_Caseta', c, (-60, -31, YARD + 1.4), (5, 4, 2.8), M['wall'], {'wh_type': 'gate'})
    box('CN_Caseta_Techo', c, (-60, -31, YARD + 2.95), (6.5, 5.5, 0.3), M['guinda'])
    box('CN_Caseta_Vidrio', c, (-60, -33.02, YARD + 1.8), (4, 0.05, 1.0), M['glass'])
    box('CN_Pluma', c, (-54, -36, YARD + 1.1), (8, 0.15, 0.15), M['yellow'])
    # barda perimetral
    xs, xe, ys, ye = -70.0, 215.0, -60.0, 168.0
    for nm, loc, size in (('S', ((xs + xe) / 2 + 8, ys, YARD + 1.25), (xe - xs - 16, 0.25, 2.5)),
                          ('N', ((xs + xe) / 2, ye, YARD + 1.25), (xe - xs, 0.25, 2.5)),
                          ('E', (xe, (ys + ye) / 2, YARD + 1.25), (0.25, ye - ys, 2.5)),
                          ('O1', (xs, (ys + ye) / 2 + 12, YARD + 1.25), (0.25, ye - ys - 24, 2.5))):
        box(f'CN_Barda_{nm}', c, loc, size, M['concrete'])
    # oficinas de validacion ISSSTE y administracion (2 niveles, ~1,036 m2)
    ox, oy = -32.0, 18.0
    box('CN_Oficinas', c, (ox, oy, YARD + 4.0), (26, 20, 8.0), M['wall'],
        {'wh_type': 'office', 'wh_name': 'Oficinas: validación ISSSTE, administración y centro de monitoreo CCTV'})
    for lv in range(2):
        for s, yy in ((-1, oy - 10.02), (1, oy + 10.02)):
            box(f'CN_Ofi_Vent_{lv}_{s}', c, (ox, yy, YARD + 1.9 + lv * 3.8), (24, 0.06, 2.0), M['glass'])
        box(f'CN_Ofi_VentO_{lv}', c, (ox - 13.02, oy, YARD + 1.9 + lv * 3.8), (0.06, 18, 2.0), M['glass'])
    box('CN_Ofi_Remate', c, (ox, oy, YARD + 8.3), (26.6, 20.6, 0.6), M['guinda'])
    box('CN_Ofi_Pasarela', c, ((ox + 13 + 0) / 2, oy, YARD + 5.5), (-ox - 13 + 0.2, 3.0, 2.8), M['glass'])
    text('CN_Txt_Oficinas', c, 'OFICINAS · CCTV', (ox, oy - 10.1, YARD + 7.0), 1.4, M['guinda'])
    for i in range(3):
        x = -8 - 8.5
        cyl(f'CN_Asta_{i}', c, (ox - 18, oy - 6 + i * 6, YARD + 6), 0.1, 12, M['steel'], 8)
    # estacionamiento
    box('CN_Estacionamiento', c, (-40, 55, YARD - 0.03), (36, 40, 0.1), M['asphalt'])
    for i in range(14):
        box(f'CN_Est_Linea_{i}', c, (-56 + i * 2.6, 45, YARD + 0.02), (0.1, 5, 0.02), M['line'])
        box(f'CN_Est_LineaB_{i}', c, (-56 + i * 2.6, 65, YARD + 0.02), (0.1, 5, 0.02), M['line'])
    rnd = random.Random(21)
    for i in range(18):
        row = i // 9
        x = -54.7 + (i % 9) * 2.6 * 1.5
        y = 45 if row == 0 else 65
        col = rnd.choice((M['trailer'], M['dark'], M['blue'], M['cab'], M['steel']))
        box(f'CN_Auto_{i}', c, (x, y, YARD + 0.65), (1.8, 4.3, 1.0), col)
        box(f'CN_Auto_Cab_{i}', c, (x, y - 0.2, YARD + 1.45), (1.6, 2.2, 0.6), M['glass'])
    # comedor
    box('CN_Comedor', c, (-40, 100, YARD + 2.0), (18, 12, 4.0), M['wall'], {'wh_type': 'office', 'wh_name': 'Comedor'})
    box('CN_Comedor_Techo', c, (-40, 100, YARD + 4.15), (19, 13, 0.3), M['guinda'])
    text('CN_Txt_Comedor', c, 'COMEDOR', (-40, 93.9, YARD + 3.0), 1.1, M['dark'])
    # planta de emergencia, subestacion y cisterna (lado este)
    box('CN_Planta_Emergencia', c, (W + 8, 30, YARD + 1.7), (6, 12, 3.4), M['steel'],
        {'wh_type': 'utility', 'wh_name': 'Planta de emergencia'})
    cyl('CN_Tanque_Diesel', c, (W + 8, 42, YARD + 1.2), 1.2, 6, M['line'], 16, 'Y')
    box('CN_Subestacion', c, (W + 8, 55, YARD + 1.5), (6, 8, 3.0), M['concrete'], {'wh_type': 'utility', 'wh_name': 'Subestación'})
    text('CN_Txt_Planta', c, 'PLANTA DE EMERGENCIA', (W + 4.9, 30, YARD + 4.0), 0.8, M['dark'], rot=(math.pi / 2, 0, math.pi / 2))
    # arboles
    for i, (x, y) in enumerate([(-60 + k * 9, -50) for k in range(6)] + [(-62, 80 + k * 12) for k in range(6)]):
        cyl(f'CN_Arbol_Tronco_{i}', c, (x, y, YARD + 1.2), 0.2, 2.4, M['pallet'], 6)
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=2.2)
        me = bpy.data.meshes.new(f'CN_Arbol_Copa_{i}'); bm.to_mesh(me); bm.free(); me.materials.append(M['grass'])
        obj(f'CN_Arbol_Copa_{i}', c, me, (x, y, YARD + 4.0))

# ------------------------------------------------------------------ camaras
def cameras(c):
    def cam(name, loc, tgt, lens):
        o = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        o.data.lens = lens; o.data.clip_end = 3000
        c.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return o
    g = cam('CN_Cam_General', (-150, -170, 150), (70, 50, 0), 30)
    cam('CN_Cam_Interior', (-30, -40, 70), (90, 70, 0), 28)
    cam('CN_Cam_Andenes', (W / 2 + 40, -75, 22), (W / 2, 0, 2), 30)
    bpy.context.scene.camera = g

# ------------------------------------------------------------------ main / preview / export
def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mats()
    root = bpy.data.objects.new('CENADI', None)
    root.empty_display_size = 10
    bpy.context.scene.collection.objects.link(root)
    for _k, _v in {'wh_type': 'national_dc', 'wh_name': 'CENADI · Centro Nacional de Distribución',
                 'wh_operador': 'Birmex', 'wh_institucion': 'ISSSTE', 'wh_unidades': 786,
                 'wh_andenes': 38, 'wh_posiciones_reportadas': 35000}.items():
        root[_k] = _v
    w = bpy.data.worlds.new('CN_Cielo'); w.color = (0.62, 0.72, 0.82)
    bpy.context.scene.world = w
    cb, cr, cz, cv, cs, cc = (coll('CN_Edificio'), coll('CN_Racks'), coll('CN_Zonas'),
                              coll('CN_Vehiculos'), coll('CN_Sitio'), coll('CN_Camaras'))
    emb, rec = building(cb)
    nrows, pos_seco = racks(cr)
    pos_frio = cold_chain(cz, cr)
    pos_ctrl = controlled(cz, cr)
    picking(cz)
    floor_zones(cz, emb, rec)
    vehicles(cv, emb, rec)
    site(cs)
    cameras(cc)
    total = pos_seco + pos_frio + pos_ctrl
    root['wh_posiciones_modelo'] = total
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'cenadi.blend'))
    return {'objects': len(bpy.data.objects), 'filas_seco': nrows, 'pos_seco': pos_seco,
            'pos_red_fria': pos_frio, 'pos_controlados': pos_ctrl, 'pos_total': total, 'andenes': len(emb) + len(rec)}

def preview(path=None, roof=True, camera='CN_Cam_General', engine='BLENDER_WORKBENCH', res=(1600, 1000)):
    sc = bpy.context.scene
    for o in bpy.data.objects:
        if o.get('wh_type') == 'roof':
            o.hide_render = not roof
    sc.camera = bpy.data.objects[camera]
    sc.render.engine = engine
    if engine == 'BLENDER_WORKBENCH':
        sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
        sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = res[0], res[1], 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_cenadi.png')
    bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        o.hide_render = False
    return sc.render.filepath

def export(copy_to_web=False):
    glb = os.path.join(OUT, 'cenadi.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True,
                              export_lights=False, export_cameras=True, export_yup=True)
    if copy_to_web:
        import shutil
        shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'cenadi.glb'))
    return {'glb': os.path.getsize(glb)}

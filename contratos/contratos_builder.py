# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  contratos_builder.py · Patio de proveedores, tablero de contratos y ventanillas
#
#  Complemento del CEDIS (mismas coordenadas que almacen_medicamentos.blend:
#  origen en la esquina suroeste interior, patio a Z = -1.2). Se exporta como
#  un GLB aparte (contratos_patio.glb) que el visor superpone al almacén.
#
#  Contenido (todo con propiedades wh_* para ligarlo a contratos.js):
#   · Patio de espera de proveedores: 4 cajones   wh_type = yard_slot  (wh_slot 1..4), entre recepción y despacho
#   · Nodos de circulación de camiones             wh_type = truck_node (wh_node)
#   · Semáforo de andén R1..R3                      wh_type = dock_light (wh_dock), lámpara con material propio
#   · Zona de rechazo y devolución                  wh_type = reject_zone
#   · Tablero de contratos (8 lámparas)             wh_type = contract_lamp (wh_index 0..7)
#   · Oficina de ventanillas (4 escritorios)        wh_type = desk (wh_desk) + anclas desk_stack
#   · Plantillas: tractocamión seco y refrigerado   wh_type = supplier_truck (wh_variant seco|frio)
#                 carpeta de expediente              wh_type = folder_template
#  Los camiones miran a -Y (cabina al sur); su origen es el centro trasero a la
#  altura de la cama (nivel del andén, Z = 0), igual que Trailer_Master.
#
#  Uso: g = {}; exec(open(r"...\\contratos\\contratos_builder.py", encoding="utf-8").read(), g)
#       g["main"]()   y en otra llamada:  g["export"]()
# =====================================================================
import bpy, bmesh, os, math

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "contratos")
WEB = os.path.join(ROOT, "web", "assets")
YZ = -1.2                                  # nivel del patio
DOCKS = {"R1": 2.5, "R2": 7.5, "R3": 12.5}
SLOTS_X = [19.5, 23.5, 27.5, 31.5]        # cajones del patio de espera (camión de norte a sur)
ROAD_Y = -27.0                             # carril de circulación del patio
M = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    m.diffuse_color = (*rgb, alpha)
    return m


class MB:
    """Acumula cajas y cilindros en una sola malla (un objeto por pieza lógica)."""
    def __init__(self):
        self.bm = bmesh.new(); self.mats = []

    def _mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)

    def box(self, a, b, m):
        g = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = g['verts']
        bmesh.ops.scale(self.bm, vec=(b[0] - a[0], b[1] - a[1], b[2] - a[2]), verts=vs)
        bmesh.ops.translate(self.bm, vec=((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), verts=vs)
        i = self._mi(m)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = i
        return self

    def cyl(self, c, r, h, m, axis='Z', seg=12):
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
        vs = g['verts']
        if axis == 'X': bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'Y'))
        if axis == 'Y': bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'X'))
        bmesh.ops.translate(self.bm, vec=c, verts=vs)
        i = self._mi(m)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = i
        return self

    def build(self, name, coll, loc=(0, 0, 0), props=None, parent=None):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        coll.objects.link(o)
        o.location = loc
        if parent: o.parent = parent
        for k, v in (props or {}).items(): o[k] = v
        return o


def empty(name, coll, loc, props=None, kind='PLAIN_AXES', size=0.5, parent=None):
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = kind; o.empty_display_size = size
    coll.objects.link(o); o.location = loc
    if parent: o.parent = parent
    for k, v in (props or {}).items(): o[k] = v
    return o


def text(name, body, loc, size, m, coll, rot=(math.pi / 2, 0, 0), parent=None, align='CENTER'):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.align_x = align; cu.align_y = 'CENTER'; cu.resolution_u = 2
    t = bpy.data.objects.new(name + '_tmp', cu)
    t.location = loc; t.rotation_euler = rot
    coll.objects.link(t)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(t.evaluated_get(dg))
    me.materials.clear(); me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.matrix_world = t.matrix_world.copy()
    coll.objects.link(o)
    bpy.data.objects.remove(t, do_unlink=True)
    if parent:
        mw = o.matrix_world.copy(); o.parent = parent; o.matrix_world = mw
    return o


def col(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c


# ---------------------------------------------------------------------
#  Tractocamión de proveedor (plantilla)
# ---------------------------------------------------------------------
def build_truck(name, coll, frio, loc, rot_z=0.0):
    L, W, Hh = 13.6, 2.56, 2.75
    band = M['blue'] if frio else M['teal']
    t = MB()
    t.box((-W / 2, -L, -0.15), (W / 2, 0, 0), M['steel'])                         # piso
    t.box((-W / 2, -L, 0), (W / 2, 0, Hh), M['white'])                               # caja
    t.box((-W / 2 - 0.006, -L + 0.4, 1.0), (-W / 2, -0.4, 1.45), band)              # franjas
    t.box((W / 2, -L + 0.4, 1.0), (W / 2 + 0.006, -0.4, 1.45), band)
    t.box((-W / 2 + 0.05, -0.006, 0.05), (W / 2 - 0.05, 0.0, Hh - 0.05), M['door'])  # puertas traseras
    t.box((-0.02, -0.01, 0.05), (0.02, 0.012, Hh - 0.05), M['steel'])
    t.box((-1.1, -0.25, -0.75), (1.1, -0.1, -0.6), M['red'])                         # defensa
    for y in (-1.6, -2.9):                                                           # ejes de la caja
        for s in (-1, 1):
            t.cyl((s * 1.0, y, -0.7), 0.5, 0.5, M['rubber'], axis='X', seg=16)
            t.cyl((s * 1.26, y, -0.7), 0.28, 0.02, M['galv'], axis='X', seg=12)
    if frio:                                                                         # equipo de refrigeración
        t.box((-0.9, -L - 0.55, 1.35), (0.9, -L, 2.6), M['galv'])
        t.box((-0.7, -L - 0.57, 1.55), (0.7, -L - 0.55, 2.4), M['dark'])
    # tractocamión
    t.box((-0.55, -L - 5.6, -0.95), (0.55, -L + 1.0, -0.72), M['steel'])            # bastidor
    t.box((-1.0, -L + 0.2, -0.72), (1.0, -L + 1.2, -0.6), M['dark'])                # quinta rueda
    t.box((-1.25, -L - 5.6, -0.72), (1.25, -L - 3.2, 2.15), band)                   # cabina
    t.box((-1.2, -L - 3.25, -0.6), (1.2, -L - 2.9, 2.0), M['dark'])                 # trasera de cabina
    t.box((-1.1, -L - 6.6, -0.72), (1.1, -L - 5.6, 0.75), band)                     # cofre
    t.box((-1.0, -L - 6.62, -0.55), (1.0, -L - 6.58, 0.55), M['galv'])              # parrilla
    t.box((-1.15, -L - 5.62, 0.95), (1.15, -L - 5.6, 1.85), M['glass'])             # parabrisas
    for s in (-1, 1):
        t.box((s * 1.25 - (0.02 if s > 0 else 0), -L - 5.3, 0.95), (s * 1.25 + (0.02 if s < 0 else 0), -L - 3.6, 1.8), M['glass'])
        t.cyl((s * 0.95, -L - 3.0, 2.2), 0.08, 1.4, M['galv'], seg=8)               # escapes
        t.box((s * 1.0 - 0.18, -L - 6.68, 0.2), (s * 1.0 + 0.18, -L - 6.6, 0.42), M['light'])
    t.box((-1.25, -L - 5.4, 2.15), (1.25, -L - 3.6, 2.6), band)                     # deflector
    for y, r in ((-L - 5.0, 0.52), (-L - 1.2, 0.52), (-L + 0.0, 0.52)):
        for s in (-1, 1):
            t.cyl((s * 1.0, y, -0.68), r, 0.45, M['rubber'], axis='X', seg=16)
            t.cyl((s * 1.24, y, -0.68), 0.3, 0.02, M['galv'], axis='X', seg=12)
    o = t.build(name, coll, loc, {'wh_type': 'supplier_truck', 'wh_variant': 'frio' if frio else 'seco'})
    o.rotation_euler = (0, 0, rot_z)
    lbl = 'RED FRÍA 2-8 °C' if frio else 'PROVEEDOR'
    for s in (-1, 1):
        text(name + ('_Rotulo_I' if s < 0 else '_Rotulo_D'), lbl, (s * (W / 2 + 0.01), -L / 2, 1.9), 0.5, M['ink'], coll,
             rot=(math.pi / 2, 0, -math.pi / 2 if s > 0 else math.pi / 2), parent=o)
    return o


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    M.update(
        white=mat('CT_Blanco', (0.95, 0.96, 0.97), 0.4), door=mat('CT_Puerta', (0.84, 0.86, 0.88), 0.35, 0.3),
        steel=mat('CT_Acero', (0.18, 0.19, 0.21), 0.5, 0.6), galv=mat('CT_Galvanizado', (0.66, 0.68, 0.7), 0.35, 0.8),
        rubber=mat('CT_Hule', (0.05, 0.05, 0.05), 0.9), dark=mat('CT_Oscuro', (0.07, 0.08, 0.1), 0.45),
        glass=mat('CT_Vidrio', (0.25, 0.38, 0.48), 0.1, 0.2), red=mat('CT_Rojo', (0.75, 0.1, 0.08), 0.5),
        teal=mat('CT_Turquesa', (0.08, 0.62, 0.56), 0.45), blue=mat('CT_Azul', (0.12, 0.35, 0.75), 0.45),
        ink=mat('CT_Tinta', (0.12, 0.14, 0.18), 0.6), light=mat('CT_Faro', (1.0, 0.96, 0.85), 0.2, 0, 3.0),
        paintW=mat('CT_Pintura_Blanca', (0.95, 0.95, 0.92), 0.7), paintY=mat('CT_Pintura_Amarilla', (0.95, 0.72, 0.05), 0.7),
        paintR=mat('CT_Pintura_Roja', (0.82, 0.12, 0.1), 0.7), concrete=mat('CT_Concreto', (0.62, 0.62, 0.6), 0.9),
        wood=mat('CT_Madera', (0.55, 0.38, 0.22), 0.6), panel=mat('CT_Panel', (0.1, 0.12, 0.15), 0.5),
        glow=mat('CT_Letrero', (0.85, 0.95, 0.98), 0.3, 0, 1.2), off=mat('CT_Lampara_apagada', (0.22, 0.24, 0.27), 0.3),
        folder=mat('CT_Carpeta', (0.93, 0.8, 0.45), 0.7), paper=mat('CT_Papel', (0.97, 0.97, 0.95), 0.8),
        screen=mat('CT_Pantalla', (0.2, 0.5, 0.8), 0.2, 0, 1.5),
    )

    # ---------------- Patio de espera ----------------
    # Entre los andenes de recepción y los de despacho. Los camiones entran por el carril
    # del patio (y = -27), giran y se estacionan de reversa con la cabina al sur, como en el andén.
    cY = col('CT_Patio')
    empty('CT_Patio_Espera', cY, (25.5, -12.0, YZ), {'wh_type': 'yard', 'wh_label': 'Patio de espera de proveedores'}, 'CUBE', 1)
    pm = MB()
    for x in [SLOTS_X[0] - 2.0] + [x + 2.0 for x in SLOTS_X]:
        pm.box((x - 0.06, -24.0, YZ), (x + 0.06, -1.5, YZ + 0.006), M['paintW'])
    pm.box((SLOTS_X[0] - 2.0, -24.12, YZ), (SLOTS_X[-1] + 2.0, -24.0, YZ + 0.006), M['paintY'])      # línea de alto
    pm.build('CT_Patio_Lineas', cY)
    for i, x in enumerate(SLOTS_X):
        empty('CT_Cajon_%d' % (i + 1), cY, (x, -3.0, 0.0), {'wh_type': 'yard_slot', 'wh_slot': i + 1, 'wh_heading': 'S'}, 'SINGLE_ARROW', 1.5)
        text('CT_Cajon_%d_Num' % (i + 1), 'E%d' % (i + 1), (x, -2.2, YZ + 0.01), 0.8, M['paintW'], cY, rot=(0, 0, 0))
    text('CT_Patio_Rotulo', 'PATIO DE ESPERA · PROVEEDORES', (sum(SLOTS_X) / 4, -25.0, YZ + 0.01), 0.7, M['paintY'], cY, rot=(0, 0, 0))

    # Caseta de vigilancia y control de citas (acceso poniente, carril y = -27)
    k = MB()
    k.box((-24.5, -24.8, YZ), (-20.5, -21.2, YZ + 0.15), M['concrete'])
    k.box((-24.2, -24.5, YZ + 0.15), (-20.8, -21.5, YZ + 2.6), M['white'])
    k.box((-24.25, -24.55, YZ + 1.1), (-20.75, -24.5, YZ + 2.2), M['glass'])
    k.box((-20.8, -24.2, YZ + 1.1), (-20.75, -21.8, YZ + 2.2), M['glass'])
    k.box((-24.6, -25.0, YZ + 2.6), (-20.4, -21.0, YZ + 2.8), M['teal'])
    k.box((-20.2, -25.2, YZ), (-20.0, -25.0, YZ + 1.2), M['paintY'])                # pluma
    k.box((-20.15, -32.0, YZ + 1.0), (-20.05, -25.1, YZ + 1.12), M['paintR'])
    k.build('CT_Caseta_Acceso', cY, props={'wh_type': 'gate', 'wh_label': 'Caseta de acceso y citas'})
    text('CT_Caseta_Rotulo', 'CITAS A ANDÉN', (-22.5, -25.02, YZ + 3.15), 0.42, M['teal'], cY)

    # Nodos de circulación (Z = 0 = altura de la cama del camión)
    N = {'entrada': (-45.0, ROAD_Y), 'caseta': (-20.0, ROAD_Y), 'salida': (85.0, ROAD_Y)}
    for d, x in DOCKS.items():
        N['giro_' + d] = (x, ROAD_Y); N['anden_' + d] = (x, -0.45)
    for i, x in enumerate(SLOTS_X):
        N['giro_E%d' % (i + 1)] = (x, ROAD_Y); N['cajon_E%d' % (i + 1)] = (x, -3.0)
    for n, (x, y) in N.items():
        empty('CT_Nodo_' + n, cY, (x, y, 0.0), {'wh_type': 'truck_node', 'wh_node': n}, 'SPHERE', 0.4)

    # Zona de rechazo y devolución (al poniente del andén R1)
    z = MB()
    zx0, zx1, zy0, zy1 = -6.6, -1.2, -7.0, -1.4
    z.box((zx0, zy0, YZ), (zx1, zy1, YZ + 0.004), M['paintR'])
    for i in range(8):
        xx = zx0 + 0.35 + i * 0.64
        z.box((xx, zy0 + 0.2, YZ + 0.004), (xx + 0.3, zy1 - 0.2, YZ + 0.008), M['paintW'])
    z.build('CT_Zona_Rechazo', cY, props={'wh_type': 'reject_zone', 'wh_label': 'Zona de rechazo y devolución (acta circunstanciada)'})
    text('CT_Zona_Rechazo_Rotulo', 'RECHAZO · DEVOLUCIÓN', ((zx0 + zx1) / 2, zy0 - 0.7, YZ + 0.01), 0.45, M['paintR'], cY, rot=(0, 0, 0))
    for i in range(3):
        empty('CT_Rechazo_Pos_%d' % (i + 1), cY, (zx0 + 1.0 + i * 1.7, (zy0 + zy1) / 2, YZ), {'wh_type': 'reject_slot', 'wh_slot': i + 1})

    # Semáforos de andén (uno por andén de recepción)
    for d, x in DOCKS.items():
        p = MB()
        p.box((x + 1.95, -0.95, YZ), (x + 2.05, -0.85, YZ + 4.6), M['galv'])
        p.box((x + 1.8, -1.05, YZ + 4.6), (x + 2.2, -0.75, YZ + 5.45), M['dark'])
        pole = p.build('CT_Semaforo_' + d, cY, props={'wh_type': 'dock_light_pole', 'wh_dock': d})
        lm = mat('CT_Luz_Anden_' + d, (0.2, 0.85, 0.4), 0.3, 0, 2.0)
        l = MB(); l.cyl((x + 2.0, -1.07, YZ + 5.02), 0.17, 0.06, lm, axis='Y', seg=20)
        l.build('CT_Semaforo_' + d + '_Luz', cY, props={'wh_type': 'dock_light', 'wh_dock': d})

    # ---------------- Tablero de contratos ----------------
    cB = col('CT_Tablero')
    bx, by = -12.5, -5.5                                   # frente al sur, junto al acceso de andenes
    b = MB()
    for s in (-1, 1):
        b.box((bx + s * 4.2 - 0.12, by - 0.12, YZ), (bx + s * 4.2 + 0.12, by + 0.12, YZ + 3.2), M['galv'])
    b.box((bx - 4.6, by - 0.15, YZ + 3.2), (bx + 4.6, by + 0.15, YZ + 6.6), M['panel'])
    b.box((bx - 4.6, by - 0.17, YZ + 6.0), (bx + 4.6, by - 0.15, YZ + 6.55), M['teal'])
    b.build('CT_Tablero_Contratos', cB, props={'wh_type': 'contract_board', 'wh_label': 'Tablero de contratos · bolsa de penas'})
    text('CT_Tablero_Titulo', 'CONTRATOS · BOLSA DE PENAS', (bx, by - 0.18, YZ + 6.27), 0.36, M['white'], cB)
    for i in range(8):
        cx = bx - 3.85 + (i % 4) * 2.57
        cz = YZ + 5.05 - (i // 4) * 1.55
        lm = mat('CT_Luz_Contrato_%d' % (i + 1), (0.2, 0.85, 0.4), 0.3, 0, 2.0)
        l = MB(); l.cyl((cx, by - 0.2, cz), 0.38, 0.08, lm, axis='Y', seg=24)
        l.build('CT_Lampara_C%d' % (i + 1), cB, props={'wh_type': 'contract_lamp', 'wh_index': i})
        text('CT_Lampara_C%d_Txt' % (i + 1), 'C%d' % (i + 1), (cx + 0.75, by - 0.2, cz), 0.34, M['white'], cB, align='LEFT')

    # ---------------- Oficina de ventanillas ----------------
    cO = col('CT_Oficina')
    ox0, oy0, ox1, oy1 = -23.0, 3.0, -9.0, 15.0
    o = MB()
    o.box((ox0, oy0, YZ), (ox1, oy1, YZ + 0.15), M['concrete'])
    for (a, bb) in (((ox0, oy0), (ox1, oy0 + 0.2)), ((ox0, oy1 - 0.2), (ox1, oy1)), ((ox0, oy0), (ox0 + 0.2, oy1)), ((ox1 - 0.2, oy0), (ox1, oy1))):
        o.box((a[0], a[1], YZ + 0.15), (bb[0], bb[1], YZ + 1.1), M['white'])          # muretes (planta abierta)
    o.box((ox1 - 0.25, oy0 + 4.5, YZ + 0.15), (ox1, oy0 + 7.5, YZ + 0.16), M['concrete'])  # acceso
    for xx in (ox0, ox1):                                                              # pérgola
        for yy in (oy0, oy1):
            o.box((xx - 0.12 if xx == ox1 else xx, yy - 0.12 if yy == oy1 else yy, YZ + 0.15), (xx + (0 if xx == ox1 else 0.12), yy + (0 if yy == oy1 else 0.12), YZ + 3.2), M['galv'])
    for i in range(8):
        xx = ox0 + 0.6 + i * (ox1 - ox0 - 1.2) / 7
        o.box((xx - 0.06, oy0, YZ + 3.2), (xx + 0.06, oy1, YZ + 3.35), M['galv'])
    o.build('CT_Oficina_Ventanillas', cO, props={'wh_type': 'office', 'wh_label': 'Ventanillas de contratos (expediente vivo)'})
    o.mats  # noqa
    # rótulo del muro sur se rompe en el acceso: se omite; el muro este tiene la entrada
    text('CT_Oficina_Rotulo', 'VENTANILLAS DE CONTRATOS', ((ox0 + ox1) / 2, oy0 - 0.02, YZ + 0.62), 0.42, M['teal'], cO)
    DESKS = [('ADQUISICIONES', 'Órdenes y acuses'), ('CALIDAD', 'Andén y cuarentena'), ('FINANZAS', 'Penas y notas de crédito'), ('JURIDICO', 'Rescisiones')]
    for i, (dk, sub) in enumerate(DESKS):
        dx = ox0 + 2.0 + i * 3.4
        dy = oy0 + 6.5
        d = MB()
        d.box((dx - 1.1, dy - 0.4, YZ + 0.15), (dx + 1.1, dy + 0.4, YZ + 0.9), M['wood'])           # escritorio
        d.box((dx - 0.3, dy + 0.05, YZ + 0.9), (dx + 0.3, dy + 0.1, YZ + 1.3), M['dark'])             # monitor
        d.box((dx - 0.27, dy + 0.04, YZ + 0.93), (dx + 0.27, dy + 0.045, YZ + 1.27), M['screen'])
        d.box((dx - 0.3, dy + 0.7, YZ + 0.15), (dx + 0.3, dy + 1.2, YZ + 0.6), M['dark'])             # silla
        d.box((dx - 0.3, dy + 1.15, YZ + 0.6), (dx + 0.3, dy + 1.22, YZ + 1.2), M['dark'])
        d.box((dx - 1.0, dy - 2.6, YZ + 0.15), (dx + 1.0, dy - 2.5, YZ + 2.2), M['panel'])            # mampara con letrero
        desk = d.build('CT_Escritorio_' + dk, cO, props={'wh_type': 'desk', 'wh_desk': dk, 'wh_label': 'Ventanilla de ' + dk.capitalize() + ' · ' + sub})
        txt = 'JURÍDICO' if dk == 'JURIDICO' else dk
        text('CT_Escritorio_%s_Txt' % dk, txt, (dx, dy - 2.62, YZ + 1.9), 0.26, M['glow'], cO)
        text('CT_Escritorio_%s_Sub' % dk, sub, (dx, dy - 2.62, YZ + 1.55), 0.15, M['white'], cO)
        # ancla de la pila de expedientes (el visor apila carpetas = trámites en cola)
        empty('CT_Pila_' + dk, cO, (dx - 0.65, dy - 0.15, YZ + 0.9), {'wh_type': 'desk_stack', 'wh_desk': dk}, 'CUBE', 0.15)
        # pila de muestra en la vista previa
    f = MB()
    f.box((-0.17, -0.12, 0.0), (0.17, 0.12, 0.028), M['folder']).box((-0.16, -0.11, 0.028), (0.16, 0.11, 0.034), M['paper'])
    f.build('CT_Carpeta_Expediente', cO, (ox0 + 1.0, oy1 - 1.0, YZ + 0.15), {'wh_type': 'folder_template'})

    # ---------------- Plantillas de camión ----------------
    cT = col('CT_Camiones')
    build_truck('CT_Camion_Proveedor_Seco', cT, False, (SLOTS_X[0], -3.0, 0.0))
    build_truck('CT_Camion_Proveedor_Frio', cT, True, (SLOTS_X[2], -3.0, 0.0))

    # cámara para la vista previa
    import mathutils
    cam = bpy.data.objects.new('CT_Cam', bpy.data.cameras.new('CT_Cam')); bpy.context.scene.collection.objects.link(cam)
    cam.location = (8.0, -58.0, 30.0)
    cam.rotation_euler = (mathutils.Vector((6.0, -8.0, -1.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 28
    bpy.context.scene.camera = cam
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'contratos_patio.blend'))
    return {'objects': len(bpy.data.objects), 'materials': len(bpy.data.materials)}


def preview(path=None, with_cedis=True):
    """Vista previa en Workbench; con with_cedis enlaza el almacén para ver el conjunto."""
    sc = bpy.context.scene
    if with_cedis and 'CEDIS_ref' not in bpy.data.collections:
        src = os.path.join(ROOT, 'almacen_medicamentos.blend')
        with bpy.data.libraries.load(src, link=True) as (a, b):
            b.collections = [n for n in a.collections if n in ('01_Building', '10_Loading_Docks', '14_Environment')]
        ref = bpy.data.collections.new('CEDIS_ref'); sc.collection.children.link(ref)
        for c in b.collections:
            if c: inst = bpy.data.objects.new(c.name + '_inst', None); inst.instance_type = 'COLLECTION'; inst.instance_collection = c; ref.objects.link(inst)
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1400, 800, 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_contratos_patio.png')
    bpy.ops.render.render(write_still=True)
    if 'CEDIS_ref' in bpy.data.collections:
        ref = bpy.data.collections['CEDIS_ref']
        for o in list(ref.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(ref)
    return sc.render.filepath


def export():
    glb = os.path.join(OUT, 'contratos_patio.glb')
    for o in bpy.data.objects: o.select_set(False)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True,
                              export_lights=False, export_cameras=False, export_yup=True)
    import shutil
    shutil.copyfile(glb, os.path.join(WEB, 'contratos_patio.glb'))
    return {'glb': os.path.getsize(glb)}

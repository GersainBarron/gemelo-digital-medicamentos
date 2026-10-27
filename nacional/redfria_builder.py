# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  redfria_builder.py · Cadena de red fría del CENADI a la unidad (diorama)
#  Para la ventana redfria.html. Cinco eslabones en fila, en metros:
#   1. Cámara fría del CENADI (2 a 8 °C), en corte: racks con cajas de
#      insulina y vacunas, evaporadores, cortina de tiras, registrador.
#   2. Tráiler refrigerado de 53' con su unidad de frío y tractocamión.
#   3. Almacén estatal: cámara fría chica con dos racks.
#   4. Camioneta de reparto con cajas térmicas y refrigerantes.
#   5. Farmacia de la unidad: refrigerador grado médico, refrigerador
#      doméstico, mesa con termo de vacunas.
#  Ligas con el visor (extras wh_*):
#   · wh_type = station       un grupo por eslabón (wh_key, wh_name)
#   · wh_type = station_ring  aro en el piso que el visor pinta con la
#                             temperatura del eslabón (wh_key)
#   · wh_type = product       cajas de producto que cambian de color si el
#                             lote se daña (wh_key)
#   · wh_type = display       pantalla del registrador (wh_key)
#  Uso: exec(open(r"...\\nacional\\redfria_builder.py", encoding="utf-8").read()); main()
#       y en otra llamada: export(copy_to_web=True)
# =====================================================================
import bpy, bmesh, os, math

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
OUT = os.path.join(ROOT, "nacional")

# centro de cada eslabón en x (m); y = 0 es el pasillo de enfrente
STATIONS = [
    ('cenadi', 'Cámara fría del CENADI', 0.0),
    ('reefer', 'Tráiler refrigerado', 24.0),
    ('estatal', 'Almacén estatal', 46.0),
    ('caja', 'Camioneta con cajas térmicas', 64.0),
    ('unidad', 'Farmacia de la unidad', 82.0),
]


def mat(name, rgb, rough=0.6, metal=0.0, alpha=1.0, emit=0.0):
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
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*rgb, alpha)
    return m


M = {}


def mats():
    M.update(
        ground=mat('RF_Suelo', (0.10, 0.12, 0.14), 0.95),
        floor=mat('RF_Piso', (0.52, 0.55, 0.57), 0.8),
        panel=mat('RF_PanelFrio', (0.82, 0.88, 0.92), 0.35),
        panel2=mat('RF_PanelFrioOsc', (0.62, 0.72, 0.80), 0.4),
        steel=mat('RF_Acero', (0.12, 0.28, 0.62), 0.4, 0.6),
        beam=mat('RF_Larguero', (0.90, 0.35, 0.03), 0.45, 0.4),
        pallet=mat('RF_Tarima', (0.45, 0.30, 0.15)),
        box=mat('RF_CajaProducto', (0.90, 0.92, 0.94), 0.6),
        evap=mat('RF_Evaporador', (0.70, 0.72, 0.74), 0.3, 0.6),
        strip=mat('RF_Cortina', (0.80, 0.90, 1.00), 0.1, 0.0, 0.35),
        logger=mat('RF_Registrador', (0.10, 0.11, 0.12), 0.4),
        screen=mat('RF_Pantalla', (0.18, 0.83, 0.75), 0.3, 0.0, 1.0, 1.2),
        trailer=mat('RF_Remolque', (0.93, 0.94, 0.95), 0.4, 0.2),
        reefer=mat('RF_UnidadFrio', (0.20, 0.22, 0.24), 0.5, 0.4),
        cab=mat('RF_Cabina', (0.30, 0.03, 0.08), 0.35, 0.3),
        glass=mat('RF_Vidrio', (0.55, 0.75, 0.85), 0.05, 0.0, 0.35),
        tire=mat('RF_Llanta', (0.05, 0.05, 0.05), 0.9),
        rim=mat('RF_Rin', (0.6, 0.6, 0.62), 0.3, 0.8),
        van=mat('RF_Camioneta', (0.95, 0.96, 0.97), 0.35, 0.2),
        coolbox=mat('RF_CajaTermica', (0.10, 0.45, 0.80), 0.5),
        lid=mat('RF_TapaTermica', (0.92, 0.94, 0.96), 0.5),
        icepack=mat('RF_Refrigerante', (0.35, 0.75, 0.95), 0.2),
        fridge=mat('RF_RefriMedico', (0.90, 0.92, 0.94), 0.3, 0.3),
        domestic=mat('RF_RefriDomestico', (0.97, 0.97, 0.96), 0.3),
        wood=mat('RF_Mueble', (0.55, 0.42, 0.30), 0.7),
        thermo=mat('RF_Termo', (0.15, 0.55, 0.35), 0.5),
        wall=mat('RF_Muro', (0.82, 0.82, 0.80), 0.85),
        arrow=mat('RF_Flecha', (0.18, 0.83, 0.75), 0.5, 0.0, 1.0, 0.6),
        ring=mat('RF_Aro', (0.18, 0.83, 0.75), 0.4, 0.0, 1.0, 1.0),
        guinda=mat('RF_Guinda', (0.30, 0.03, 0.08), 0.5),
    )


def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def box(name, c, center, size, m, rot_z=0.0, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES')
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = center; o.rotation_euler.z = rot_z
    c.objects.link(o)
    return o


def cyl(name, c, center, r, depth, m, axis='Z', seg=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = center
    if axis == 'X':
        o.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        o.rotation_euler.x = math.pi / 2
    c.objects.link(o)
    return o


def ring(key, c, cx, cy, w, d):
    """Aro rectangular en el piso alrededor del eslabón: el visor lo pinta con la temperatura."""
    bm = bmesh.new()
    t = 0.35
    outer = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    inner = [(-w / 2 + t, -d / 2 + t), (w / 2 - t, -d / 2 + t), (w / 2 - t, d / 2 - t), (-w / 2 + t, d / 2 - t)]
    vo = [bm.verts.new((x, y, 0.03)) for x, y in outer]
    vi = [bm.verts.new((x, y, 0.03)) for x, y in inner]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vo[i], vo[j], vi[j], vi[i]))
    me = bpy.data.meshes.new(f'RF_Aro_{key}'); bm.to_mesh(me); bm.free()
    me.materials.append(mat(f'RF_Aro_{key}', (0.18, 0.83, 0.75), 0.4, 0.0, 1.0, 1.0))
    o = bpy.data.objects.new(f'RF_Aro_{key}', me)
    o.location = (cx, cy, 0)
    o['wh_type'] = 'station_ring'; o['wh_key'] = key
    c.objects.link(o)
    return o


def tag(o, key, kind='static'):
    o['wh_station'] = key
    o['_kind'] = kind
    return o


def product_mat(key):
    return mat(f'RF_Producto_{key}', (0.90, 0.92, 0.94), 0.55)


def pallet_load(name, c, key, x, y, z, nx=3, ny=2, nz=2, s=0.38, pm=None):
    """Tarima con cajas de producto (las cajas forman un objeto 'product' por tarima)."""
    tag(box(f'{name}_Tarima', c, (x, y, z + 0.07), (1.2, 1.0, 0.14), M['pallet']), key)
    bm = bmesh.new()
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                cx = x - 0.4 + i * 0.4; cy = y - 0.25 + j * 0.5; cz = z + 0.14 + s / 2 + k * s
                r = bmesh.ops.create_cube(bm, size=1.0)
                for v in r['verts']:
                    v.co.x = v.co.x * (s * 0.95) + cx; v.co.y = v.co.y * (0.45) + cy; v.co.z = v.co.z * (s * 0.95) + cz
    me = bpy.data.meshes.new(f'{name}_Cajas'); bm.to_mesh(me); bm.free()
    me.materials.append(pm or product_mat(key))
    o = bpy.data.objects.new(f'{name}_Cajas', me); c.objects.link(o)
    o['wh_type'] = 'product'; o['wh_key'] = key
    return o


def rack(name, c, key, x0, y, z0=0.0, bays=3, levels=3, pm=None):
    bay = 2.7; h = 1.5
    for b in range(bays + 1):
        for yy in (y - 0.5, y + 0.5):
            tag(box(f'{name}_Poste{b}_{yy:.1f}', c, (x0 + b * bay, yy, z0 + levels * h / 2 + 0.2), (0.08, 0.08, levels * h + 0.4), M['steel']), key)
    for l in range(1, levels + 1):
        for yy in (y - 0.5, y + 0.5):
            tag(box(f'{name}_Larg{l}_{yy:.1f}', c, (x0 + bays * bay / 2, yy, z0 + l * h - 0.05), (bays * bay, 0.08, 0.12), M['beam']), key)
    for b in range(bays):
        for l in range(levels):
            if (b + l) % 4 == 3:
                continue
            pallet_load(f'{name}_B{b}N{l}', c, key, x0 + bay * (b + 0.5), y, z0 + l * h + (0.0 if l == 0 else 0.0) + (0.02 if l == 0 else 0.0) + (l > 0) * 0.0, pm=pm)


def logger(name, c, key, loc, rot_z=0.0):
    o = tag(box(f'{name}_Caja', c, loc, (0.22, 0.06, 0.3), M['logger'], rot_z), key, 'keep')
    s = box(f'{name}_Pantalla', c, (loc[0], loc[1] - 0.035, loc[2] + 0.05), (0.16, 0.01, 0.1), mat(f'RF_Pantalla_{key}', (0.18, 0.83, 0.75), 0.3, 0.0, 1.0, 1.2), rot_z)
    s['wh_type'] = 'display'; s['wh_key'] = key
    return o


def wheel(name, c, key, x, y, z, r=0.5, w=0.3):
    tag(cyl(f'{name}_Llanta', c, (x, y, z), r, w, M['tire'], 'Y'), key)
    tag(cyl(f'{name}_Rin', c, (x, y + (w / 2 + 0.01) * (1 if y > 0 else -1), z), r * 0.55, 0.04, M['rim'], 'Y'), key)


# ------------------------------------------------------------------ eslabones
def st_cenadi(c, cx):
    key = 'cenadi'; W, D, Hh = 14.0, 9.0, 5.0
    y0 = 6.0                                         # fondo de la cámara
    tag(box('RF_CN_Piso', c, (cx, y0, 0.1), (W, D, 0.2), M['floor']), key)
    tag(box('RF_CN_MuroFondo', c, (cx, y0 + D / 2, Hh / 2), (W, 0.25, Hh), M['panel']), key)
    tag(box('RF_CN_MuroIzq', c, (cx - W / 2, y0, Hh / 2), (0.25, D, Hh), M['panel']), key)
    tag(box('RF_CN_MuroDer', c, (cx + W / 2, y0, Hh / 2), (0.25, D, Hh), M['panel']), key)
    tag(box('RF_CN_FrenteBajo', c, (cx, y0 - D / 2, 0.6), (W, 0.25, 1.2), M['panel2']), key)
    for i in range(int(W // 1.2)):
        tag(box(f'RF_CN_Junta{i}', c, (cx - W / 2 + 1.2 * (i + 1), y0 + D / 2 - 0.14, Hh / 2), (0.03, 0.02, Hh), M['panel2']), key)
    for i, ex in enumerate((-3.5, 3.5)):
        tag(box(f'RF_CN_Evap{i}', c, (cx + ex, y0 + D / 2 - 0.6, Hh - 0.7), (3.0, 0.8, 0.7), M['evap']), key)
        for k in range(3):
            tag(cyl(f'RF_CN_Vent{i}{k}', c, (cx + ex - 1 + k, y0 + D / 2 - 1.02, Hh - 0.7), 0.26, 0.04, M['logger'], 'Y'), key)
    # puerta con cortina de tiras en el muro derecho
    for k in range(8):
        tag(box(f'RF_CN_Tira{k}', c, (cx + W / 2 - 0.05, y0 - 2.5 + 0.18 + k * 0.32, 1.5), (0.02, 0.28, 2.9), M['strip']), key)
    rack('RF_CN_RackA', c, key, cx - 5.5, y0 + 2.6, bays=4, levels=3)
    rack('RF_CN_RackB', c, key, cx - 5.5, y0 - 0.6, bays=4, levels=3)
    logger('RF_CN_Reg', c, key, (cx + W / 2 - 0.2, y0 + 3.0, 1.6), math.pi / 2)
    ring(key, c, cx, y0, W + 2.0, D + 2.0)
    return (cx, y0)


def st_reefer(c, cx):
    key = 'reefer'; y = 4.0; L = 13.6
    x0 = cx - L / 2 + 1.5
    tag(box('RF_TR_Caja', c, (x0 + L / 2, y, 1.35 + 1.35), (L, 2.6, 2.7), M['trailer'], bevel=0.04), key)
    tag(box('RF_TR_Chasis', c, (x0 + L / 2, y, 1.15), (L, 1.0, 0.25), M['reefer']), key)
    tag(box('RF_TR_Unidad', c, (x0 - 0.25, y, 3.3), (0.5, 2.2, 1.6), M['reefer'], bevel=0.05), key)
    tag(box('RF_TR_Rejilla', c, (x0 - 0.51, y, 3.3), (0.02, 1.8, 1.1), M['evap']), key)
    for k, xx in enumerate((x0 + L - 2.4, x0 + L - 1.2)):
        for yy in (y - 1.0, y + 1.0):
            wheel(f'RF_TR_R{k}{yy:.0f}', c, key, xx, yy, 0.5)
    # tractocamión
    tx = x0 - 3.6
    tag(box('RF_TR_TractorChasis', c, (tx, y, 0.9), (5.0, 1.0, 0.3), M['reefer']), key)
    tag(box('RF_TR_Cabina', c, (tx - 0.8, y, 2.1), (2.4, 2.4, 2.4), M['cab'], bevel=0.12), key)
    tag(box('RF_TR_Cofre', c, (tx - 2.3, y, 1.4), (1.2, 2.2, 1.0), M['cab'], bevel=0.1), key)
    tag(box('RF_TR_Parabrisas', c, (tx - 2.01, y, 2.7), (0.04, 2.1, 0.9), M['glass']), key)
    for xx in (tx - 2.0, tx + 1.2, tx + 2.2):
        for yy in (y - 1.05, y + 1.05):
            wheel(f'RF_TR_T{xx:.1f}{yy:.0f}', c, key, xx, yy, 0.5)
    logger('RF_TR_Reg', c, key, (x0 + 1.0, y - 1.32, 2.0))
    # carga visible por la puerta trasera abierta
    tag(box('RF_TR_PuertaA', c, (x0 + L + 0.05, y - 1.6, 2.7), (0.06, 1.3, 2.6), M['trailer'], 0.0), key)
    pallet_load('RF_TR_Carga', c, key, x0 + L - 0.8, y, 1.5, nx=3, ny=2, nz=3)
    ring(key, c, cx - 1.0, y, L + 9.0, 5.0)
    return (cx, y)


def st_estatal(c, cx):
    key = 'estatal'; W, D, Hh = 9.0, 7.0, 3.8; y0 = 5.5
    tag(box('RF_ES_Piso', c, (cx, y0, 0.1), (W, D, 0.2), M['floor']), key)
    tag(box('RF_ES_MuroFondo', c, (cx, y0 + D / 2, Hh / 2), (W, 0.25, Hh), M['panel']), key)
    tag(box('RF_ES_MuroIzq', c, (cx - W / 2, y0, Hh / 2), (0.25, D, Hh), M['panel']), key)
    tag(box('RF_ES_MuroDer', c, (cx + W / 2, y0, Hh / 2), (0.25, D, Hh), M['panel']), key)
    tag(box('RF_ES_FrenteBajo', c, (cx, y0 - D / 2, 0.5), (W, 0.25, 1.0), M['panel2']), key)
    tag(box('RF_ES_Evap', c, (cx, y0 + D / 2 - 0.5, Hh - 0.6), (2.4, 0.7, 0.6), M['evap']), key)
    rack('RF_ES_RackA', c, key, cx - 3.6, y0 + 1.9, bays=3, levels=2)
    rack('RF_ES_RackB', c, key, cx - 3.6, y0 - 1.0, bays=3, levels=2)
    logger('RF_ES_Reg', c, key, (cx - W / 2 + 0.2, y0 + 0.5, 1.6), -math.pi / 2)
    ring(key, c, cx, y0, W + 2.0, D + 2.0)
    return (cx, y0)


def st_caja(c, cx):
    key = 'caja'; y = 4.5
    tag(box('RF_CM_Caja', c, (cx - 0.5, y, 1.55), (4.2, 2.0, 2.0), M['van'], bevel=0.08), key)
    tag(box('RF_CM_Frente', c, (cx - 3.2, y, 1.15), (1.6, 1.9, 1.3), M['van'], bevel=0.15), key)
    tag(box('RF_CM_Parabrisas', c, (cx - 2.75, y, 1.75), (0.6, 1.7, 0.04), M['glass'], 0.0), key).rotation_euler.y = 0.9
    tag(box('RF_CM_Franja', c, (cx - 0.9, y - 1.01, 1.2), (5.0, 0.02, 0.18), M['guinda']), key)
    for xx in (cx - 2.8, cx + 0.9):
        for yy in (y - 0.95, y + 0.95):
            wheel(f'RF_CM_R{xx:.1f}{yy:.0f}', c, key, xx, yy, 0.38, 0.22)
    # cajas térmicas: dos en la camioneta (puertas abiertas) y tres en el piso
    for k, (bx, by, bz) in enumerate(((cx + 1.0, y - 0.45, 0.85), (cx + 1.0, y + 0.45, 0.85), (cx + 2.6, y - 1.6, 0.0), (cx + 3.4, y - 1.6, 0.0), (cx + 3.0, y - 0.9, 0.0))):
        tag(box(f'RF_CM_Termica{k}', c, (bx, by, bz + 0.25), (0.62, 0.45, 0.42), M['coolbox'], bevel=0.03), key)
        tag(box(f'RF_CM_Tapa{k}', c, (bx, by, bz + 0.49), (0.66, 0.49, 0.07), M['lid'], bevel=0.02), key)
    # caja abierta con refrigerantes y producto
    ox, oy = cx + 4.4, y - 0.4
    tag(box('RF_CM_TermicaAbierta', c, (ox, oy, 0.25), (0.62, 0.45, 0.42), M['coolbox'], bevel=0.03), key)
    tag(box('RF_CM_TapaAbierta', c, (ox + 0.05, oy + 0.5, 0.04), (0.66, 0.49, 0.07), M['lid'], bevel=0.02), key)
    for k in range(4):
        tag(box(f'RF_CM_Refrigerante{k}', c, (ox - 0.2 + (k % 2) * 0.4, oy - 0.12 + (k // 2) * 0.24, 0.47), (0.22, 0.16, 0.04), M['icepack']), key)
    p = box('RF_CM_Producto', c, (ox, oy, 0.52), (0.3, 0.2, 0.08), product_mat(key))
    p['wh_type'] = 'product'; p['wh_key'] = key
    for k in range(2):
        q = box(f'RF_CM_ProductoB{k}', c, (cx + 1.0, y - 0.45 + k * 0.9, 1.15), (0.3, 0.2, 0.12), product_mat(key))
        q['wh_type'] = 'product'; q['wh_key'] = key
    tag(box('RF_CM_PuertaA', c, (cx + 1.75, y - 1.5, 1.55), (0.05, 1.0, 1.9), M['van']), key)
    tag(box('RF_CM_PuertaB', c, (cx + 1.75, y + 1.5, 1.55), (0.05, 1.0, 1.9), M['van']), key)
    logger('RF_CM_Reg', c, key, (ox + 0.36, oy, 0.35), math.pi / 2)
    ring(key, c, cx + 0.5, y - 0.3, 11.0, 6.0)
    return (cx, y)


def st_unidad(c, cx):
    key = 'unidad'; W, D = 11.0, 7.5; y0 = 5.5
    tag(box('RF_UM_Piso', c, (cx, y0, 0.08), (W, D, 0.16), M['floor']), key)
    tag(box('RF_UM_MuroFondo', c, (cx, y0 + D / 2, 1.6), (W, 0.2, 3.2), M['wall']), key)
    tag(box('RF_UM_MuroIzq', c, (cx - W / 2, y0, 1.6), (0.2, D, 3.2), M['wall']), key)
    tag(box('RF_UM_Mostrador', c, (cx + 1.0, y0 - 2.6, 0.55), (6.0, 0.6, 1.1), M['wood']), key)
    tag(box('RF_UM_Cubierta', c, (cx + 1.0, y0 - 2.6, 1.12), (6.2, 0.7, 0.05), M['lid']), key)
    for k in range(4):
        tag(box(f'RF_UM_Anaquel{k}', c, (cx + 2.2, y0 + D / 2 - 0.3, 0.4 + k * 0.6), (4.5, 0.4, 0.04), M['wood']), key)
    # refrigerador grado médico (puerta de vidrio)
    fx = cx - 3.8; fy = y0 + D / 2 - 0.55
    tag(box('RF_UM_RefriMedico', c, (fx, fy, 0.95), (0.75, 0.75, 1.9), M['fridge'], bevel=0.03), key)
    tag(box('RF_UM_RefriMedicoVidrio', c, (fx, fy - 0.38, 1.0), (0.6, 0.02, 1.5), M['glass']), key)
    for k in range(4):
        p = box(f'RF_UM_ProductoMed{k}', c, (fx, fy - 0.1, 0.45 + k * 0.38), (0.55, 0.45, 0.18), product_mat(key))
        p['wh_type'] = 'product'; p['wh_key'] = key
    logger('RF_UM_Reg', c, key, (fx + 0.39, fy - 0.2, 1.4), math.pi / 2)
    # refrigerador doméstico
    tag(box('RF_UM_RefriDomestico', c, (fx + 1.1, fy, 0.85), (0.7, 0.7, 1.7), M['domestic'], bevel=0.05), key)
    tag(box('RF_UM_Manija', c, (fx + 1.38, fy - 0.37, 1.1), (0.04, 0.04, 0.6), M['rim']), key)
    # mesa con termo de vacunas
    tag(box('RF_UM_Mesa', c, (cx - 1.6, y0 - 0.5, 0.75), (1.4, 0.8, 0.06), M['wood']), key)
    for dx in (-0.6, 0.6):
        for dy in (-0.35, 0.35):
            tag(box(f'RF_UM_Pata{dx}{dy}', c, (cx - 1.6 + dx, y0 - 0.5 + dy, 0.37), (0.05, 0.05, 0.74), M['wood']), key)
    tag(cyl('RF_UM_Termo', c, (cx - 1.8, y0 - 0.5, 0.97), 0.18, 0.4, M['thermo']), key)
    tag(cyl('RF_UM_TermoTapa', c, (cx - 1.8, y0 - 0.5, 1.19), 0.19, 0.05, M['lid']), key)
    ring(key, c, cx, y0, W + 2.0, D + 2.0)
    return (cx, y0)


def arrows(c, xs):
    for i in range(len(xs) - 1):
        a, b = xs[i], xs[i + 1]
        mid = (a + b) / 2
        bm = bmesh.new()
        pts = [(-1.6, -0.35), (0.6, -0.35), (0.6, -0.8), (1.6, 0.0), (0.6, 0.8), (0.6, 0.35), (-1.6, 0.35)]
        vs = [bm.verts.new((mid + x, -2.2 + y, 0.04)) for x, y in pts]
        bm.faces.new(vs)
        me = bpy.data.meshes.new(f'RF_Flecha{i}'); bm.to_mesh(me); bm.free()
        me.materials.append(M['arrow'])
        o = bpy.data.objects.new(f'RF_Flecha{i}', me); c.objects.link(o)
        o['wh_type'] = 'flow_arrow'; o['wh_index'] = i


def join_static(key):
    """Une la geometría fija de cada eslabón por material (menos llamadas de dibujo)."""
    groups = {}
    for o in list(bpy.data.objects):
        if o.get('wh_station') == key and o.get('_kind') == 'static' and o.type == 'MESH':
            groups.setdefault(o.data.materials[0].name, []).append(o)
    for mname, objs in groups.items():
        if len(objs) < 2:
            continue
        ctx = bpy.context
        for o in ctx.view_layer.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        ctx.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        j = ctx.view_layer.objects.active
        j.name = f'RF_{key}_{mname}'
        j['wh_station'] = key


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mats()
    c = coll('RF_Cadena')
    w = bpy.data.worlds.new('RF_Cielo'); w.color = (0.04, 0.06, 0.09); bpy.context.scene.world = w
    g = box('RF_Suelo', c, (41, 4, -0.05), (120, 34, 0.1), M['ground'])
    g['wh_type'] = 'ground'
    builders = {'cenadi': st_cenadi, 'reefer': st_reefer, 'estatal': st_estatal, 'caja': st_caja, 'unidad': st_unidad}
    for key, name, x in STATIONS:
        builders[key](c, x)
        e = bpy.data.objects.new(f'RF_Eslabon_{key}', None)
        e.location = (x, 4.0, 0); c.objects.link(e)
        e['wh_type'] = 'station'; e['wh_key'] = key; e['wh_name'] = name
    arrows(c, [x for _, _, x in STATIONS])
    # cámara general
    cam = bpy.data.objects.new('RF_Cam', bpy.data.cameras.new('RF_Cam'))
    cam.data.lens = 26
    cam.location = (41, -62, 48)
    from mathutils import Vector
    cam.rotation_euler = (Vector((41, 5, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    c.objects.link(cam); bpy.context.scene.camera = cam
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            o.select_set(False)
    bpy.context.view_layer.update()
    for key, _, _ in STATIONS:
        join_static(key)
    for o in bpy.data.objects:
        if '_kind' in o.keys():
            del o['_kind']
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'redfria.blend'))
    return {'objetos': len(bpy.data.objects), 'mallas': len([o for o in bpy.data.objects if o.type == 'MESH'])}


def preview(path=None, res=(1600, 900)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'; sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = res[0], res[1], 100
    sc.render.filepath = path or os.path.join(ROOT, 'renders', 'preview_redfria.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def export(copy_to_web=False):
    glb = os.path.join(OUT, 'redfria.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_visible=True, export_extras=True, export_lights=False, export_cameras=False, export_yup=True)
    if copy_to_web:
        import shutil
        shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'redfria.glb'))
    return {'glb': os.path.getsize(glb)}

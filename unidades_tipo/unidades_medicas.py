# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  unidades_medicas.py · tipos de unidad para el mapa de red (AÚN NO INTEGRADO)
#  CAF (pequeña, ~10 × 8 m, 1 nivel, ámbar), UMF (mediana, ~42 × 24 m,
#  2 niveles, verde) y Hospital (basamento 80 × 50 m + torre de 6 niveles,
#  helipuerto y urgencias, azul). Cada tipo en su colección con un Empty raíz
#  para exportarlo solo a glTF. Uso: abrir en Scripting y ejecutar.
#  Pendiente para integrarlo: separar en builders con main()/export() y wh_type.
# =====================================================================
import bpy, bmesh, math

# ---------------------------------------------------------------- limpieza
for col_name in ("CAF", "UMF", "Hospital", "Escena_Unidades"):
    col = bpy.data.collections.get(col_name)
    if col:
        for ob in list(col.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(col)
for n in ("Cube", "Cubo"):
    ob = bpy.data.objects.get(n)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)

# ---------------------------------------------------------------- materiales
def mat(name, rgb, rough=0.6, metal=0.0, emit=None, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    m.diffuse_color = (*rgb, 1)
    return m

def hexrgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)

M = {
    "muro":      mat("Muro_blanco",  hexrgb("#EDEAE3"), 0.85),
    "muro2":     mat("Muro_crema",   hexrgb("#D9CFBF"), 0.85),
    "concreto":  mat("Concreto",     hexrgb("#A7A49D"), 0.9),
    "vidrio":    mat("Vidrio",       hexrgb("#4F6E86"), 0.08, 0.3),
    "techo":     mat("Azotea",       hexrgb("#8C8A85"), 0.95),
    "asfalto":   mat("Asfalto",      hexrgb("#3A3B3D"), 0.95),
    "linea":     mat("Linea_blanca", hexrgb("#F4F4F0"), 0.6),
    "pasto":     mat("Pasto",        hexrgb("#7E9A5A"), 1.0),
    "tinaco":    mat("Tinaco",       hexrgb("#1D1F22"), 0.5),
    "rojo":      mat("Cruz_roja",    hexrgb("#C8202F"), 0.4, emit=hexrgb("#C8202F")),
    "metal":     mat("Metal",        hexrgb("#B8BCC2"), 0.35, 0.8),
    # acento por tipo de unidad (para distinguirlas en la app)
    "acento_caf":  mat("Acento_CAF",  hexrgb("#D98B2B"), 0.5),   # ambar
    "acento_umf":  mat("Acento_UMF",  hexrgb("#1F7A5C"), 0.5),   # verde
    "acento_hosp": mat("Acento_HOSP", hexrgb("#2457A6"), 0.5),   # azul
    "helipuerto":  mat("Helipuerto",  hexrgb("#2E7D4F"), 0.8),
    "amarillo":    mat("Amarillo",    hexrgb("#F2C230"), 0.6),
}

# ---------------------------------------------------------------- utilidades
def new_col(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c

def box(name, col, size, loc, m, root=None):
    """Caja con base en z=loc[2] (no centrada en z)."""
    sx, sy, sz = size
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z = v.co.z * sz + sz / 2
    bm.to_mesh(me); bm.free()
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    col.objects.link(ob)
    if root:
        ob.parent = root
    return ob

def cyl(name, col, r, h, loc, m, root=None, verts=24):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    bm.to_mesh(me); bm.free()
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    col.objects.link(ob)
    if root:
        ob.parent = root
    return ob

def label(text, col, loc, size, m, root=None, rot=(math.radians(90), 0, 0)):
    cu = bpy.data.curves.new(text, "FONT")
    cu.body = text; cu.size = size; cu.align_x = "CENTER"; cu.extrude = 0.03
    ob = bpy.data.objects.new("Letrero_" + text, cu)
    ob.data.materials.append(m)
    ob.location = loc; ob.rotation_euler = rot
    col.objects.link(ob)
    if root:
        ob.parent = root
    return ob

def red_cross(col, center, s, root=None, facing_y=True):
    x, y, z = center
    if facing_y:
        box("Cruz_v", col, (s * 0.33, 0.12, s), (x, y, z - s / 2), M["rojo"], root)
        box("Cruz_h", col, (s, 0.12, s * 0.33), (x, y, z - s * 0.165), M["rojo"], root)

def window_band(col, prefix, x0, x1, y, z, h, n, root, depth=0.12, w_ratio=0.7):
    """Fila de n ventanas sobre la fachada en el plano y."""
    step = (x1 - x0) / n
    for i in range(n):
        cx = x0 + step * (i + 0.5)
        box(f"{prefix}_{i}", col, (step * w_ratio, depth, h), (cx, y, z), M["vidrio"], root)

def parking(col, prefix, x0, y0, n, root, w=2.6, d=5.0, cars=()):
    box(prefix + "_asfalto", col, (n * w + 1, d + 6, 0.04), (x0 + n * w / 2, y0, 0), M["asfalto"], root)
    for i in range(n + 1):
        box(f"{prefix}_linea{i}", col, (0.12, d, 0.02), (x0 + 0.5 + i * w, y0 + 3 - d / 2 + 0.5, 0.04), M["linea"], root)
    car_cols = [M["metal"], M["acento_hosp"], M["muro"], M["rojo"]]
    for k, i in enumerate(cars):
        cx = x0 + 0.5 + (i + 0.5) * w; cy = y0 + 3 - d / 2 + 0.5
        box(f"{prefix}_auto{i}", col, (1.8, 4.2, 0.9), (cx, cy, 0.25), car_cols[k % 4], root)
        box(f"{prefix}_cabina{i}", col, (1.6, 2.2, 0.55), (cx, cy - 0.2, 1.15), M["vidrio"], root)

def tree(col, name, loc, root, h=5):
    cyl(name + "_tronco", col, 0.18, h * 0.45, loc, M["muro2"], root, 8)
    me = bpy.data.meshes.new(name + "_copa")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=h * 0.32)
    bm.to_mesh(me); bm.free(); me.materials.append(M["pasto"])
    ob = bpy.data.objects.new(name + "_copa", me)
    ob.location = (loc[0], loc[1], loc[2] + h * 0.6)
    col.objects.link(ob); ob.parent = root

def make_root(name, col, loc):
    r = bpy.data.objects.new(name, None)
    r.empty_display_type = "PLAIN_AXES"; r.empty_display_size = 3
    r.location = loc
    col.objects.link(r)
    return r

escena = new_col("Escena_Unidades")

# ================================================================= 1. CAF
# Consultorio de Atencion Familiar: casa adaptada, 1 nivel, ~10 x 8 m,
# 1-2 consultorios, curacion y botiquin; tinaco en azotea.
cC = new_col("CAF", escena)
rC = make_root("CAF_root", cC, (0, 0, 0))
box("CAF_banqueta", cC, (16, 14, 0.15), (0, 1, 0), M["concreto"], rC)
box("CAF_cuerpo", cC, (10, 8, 3.4), (0, 0, 0.15), M["muro2"], rC)
box("CAF_pretil", cC, (10.3, 8.3, 0.45), (0, 0, 3.55), M["muro"], rC)
box("CAF_azotea", cC, (9.7, 7.7, 0.05), (0, 0, 3.55), M["techo"], rC)
box("CAF_zoclo", cC, (10.05, 8.05, 0.6), (0, 0, 0.15), M["acento_caf"], rC)
# fachada (y negativa)
box("CAF_puerta", cC, (1.6, 0.12, 2.3), (-2.4, -4.0, 0.15), M["vidrio"], rC)
box("CAF_marquesina", cC, (2.8, 1.4, 0.15), (-2.4, -4.6, 2.75), M["acento_caf"], rC)
box("CAF_ventana1", cC, (1.8, 0.12, 1.2), (1.0, -4.0, 1.3), M["vidrio"], rC)
box("CAF_ventana2", cC, (1.8, 0.12, 1.2), (3.4, -4.0, 1.3), M["vidrio"], rC)
box("CAF_letrero", cC, (4.2, 0.15, 0.7), (1.6, -4.12, 2.75), M["acento_caf"], rC)
label("CAF", cC, (1.6, -4.25, 2.82), 0.55, M["muro"], rC)
red_cross(cC, (-2.4, -5.35, 3.85), 0.8, rC)
box("CAF_cruz_base", cC, (1.0, 0.08, 1.0), (-2.4, -5.25, 2.9), M["muro"], rC)
# tinaco y tanque de gas en azotea
cyl("CAF_tinaco", cC, 0.55, 1.2, (3.2, 2.2, 3.6), M["tinaco"], rC, 16)
box("CAF_base_tinaco", cC, (1.4, 1.4, 0.25), (3.2, 2.2, 3.55), M["concreto"], rC)
tree(cC, "CAF_arbol", (-6.0, -4.5, 0.15), rC, 4)

# ================================================================= 2. UMF
# Unidad de Medicina Familiar: 2 niveles, ~42 x 24 m, 10 consultorios,
# farmacia, laboratorio, rayos X; acceso con marquesina y estacionamiento.
cU = new_col("UMF", escena)
rU = make_root("UMF_root", cU, (45, 0, 0))
box("UMF_plaza", cU, (60, 50, 0.15), (0, -4, 0), M["concreto"], rU)
box("UMF_jardin", cU, (14, 8, 0.2), (-17, -18, 0.15), M["pasto"], rU)
box("UMF_cuerpo", cU, (42, 24, 7.6), (0, 4, 0.15), M["muro"], rU)
box("UMF_pretil", cU, (42.4, 24.4, 0.6), (0, 4, 7.75), M["muro2"], rU)
box("UMF_azotea", cU, (41.6, 23.6, 0.05), (0, 4, 7.75), M["techo"], rU)
# franja de acento entre niveles
box("UMF_franja", cU, (42.2, 24.2, 0.5), (0, 4, 3.8), M["acento_umf"], rU)
# vestibulo de doble altura
box("UMF_vestibulo", cU, (10, 4, 7.0), (-4, -9.5, 0.15), M["vidrio"], rU)
box("UMF_vest_marco", cU, (10.6, 4.4, 0.6), (-4, -9.5, 7.15), M["acento_umf"], rU)
# marquesina de acceso con columnas
box("UMF_marquesina", cU, (14, 7, 0.35), (-4, -14.5, 4.0), M["acento_umf"], rU)
for i, x in enumerate((-10.3, 2.3)):
    cyl(f"UMF_columna{i}", cU, 0.25, 4.0, (x, -17.4, 0.15), M["muro"], rU, 12)
# letrero y cruz
box("UMF_letrero", cU, (12, 0.25, 1.4), (12, -8.15, 5.6), M["acento_umf"], rU)
label("UMF", cU, (12, -8.32, 5.8), 1.1, M["muro"], rU)
box("UMF_cruz_base", cU, (2.0, 0.1, 2.0), (-4, -11.8, 4.6), M["muro"], rU)
red_cross(cU, (-4, -11.9, 6.4), 1.6, rU)
# ventanas en dos niveles (fachada sur y norte)
window_band(cU, "UMF_v1s", 2, 21, -8.0, 1.2, 1.8, 6, rU)
window_band(cU, "UMF_v2s", -21, 21, -8.0, 5.0, 1.8, 12, rU)
window_band(cU, "UMF_v1s_b", -21, -9.5, -8.0, 1.2, 1.8, 3, rU)
window_band(cU, "UMF_v1n", -21, 21, 16.0, 1.2, 1.8, 12, rU)
window_band(cU, "UMF_v2n", -21, 21, 16.0, 5.0, 1.8, 12, rU)
# farmacia: puerta lateral de surtido con anden
box("UMF_anden", cU, (6, 3, 1.1), (21 + 1.5, 10, 0.15), M["concreto"], rU)
box("UMF_cortina", cU, (0.12, 4, 3.0), (21.06, 10, 1.25), M["metal"], rU)
box("UMF_letrero_farm", cU, (0.15, 5, 0.8), (21.1, 10, 4.6), M["acento_umf"], rU)
# equipos en azotea
for i, (x, y) in enumerate(((-12, 10), (-6, 10), (8, 12), (14, 0))):
    box(f"UMF_clima{i}", cU, (3, 2, 1.4), (x, y, 7.8), M["metal"], rU)
cyl("UMF_cisterna", cU, 1.2, 2.2, (16, 12, 7.8), M["tinaco"], rU, 16)
parking(cU, "UMF_estac", 6, -20, 9, rU, cars=(0, 1, 3, 4, 6, 8))
for i, x in enumerate((-26, -26, -12)):
    tree(cU, f"UMF_arbol{i}", (x, -10 - 8 * i, 0.15), rU, 6)

# ================================================================= 3. HOSPITAL
# Hospital General de Zona: basamento de 2 niveles (urgencias, consulta,
# quirofanos) + torre de hospitalizacion de 6 niveles + helipuerto.
cH = new_col("Hospital", escena)
rH = make_root("HOSP_root", cH, (150, 10, 0))
box("HOSP_plaza", cH, (110, 85, 0.15), (0, -6, 0), M["concreto"], rH)
# basamento
box("HOSP_basamento", cH, (80, 50, 9.0), (0, 4, 0.15), M["muro2"], rH)
box("HOSP_bas_pretil", cH, (80.4, 50.4, 0.7), (0, 4, 9.15), M["muro"], rH)
box("HOSP_bas_azotea", cH, (79.6, 49.6, 0.05), (0, 4, 9.15), M["techo"], rH)
box("HOSP_bas_franja", cH, (80.2, 50.2, 0.6), (0, 4, 4.4), M["acento_hosp"], rH)
window_band(cH, "HOSP_b1s", -40, 40, -21.0, 1.3, 2.2, 16, rH)
window_band(cH, "HOSP_b2s", -40, 40, -21.0, 5.6, 2.4, 16, rH)
# torre de hospitalizacion
TZ0, PISO, NP = 9.2, 3.6, 6
box("HOSP_torre", cH, (56, 18, PISO * NP), (4, 8, TZ0), M["muro"], rH)
for p in range(NP):
    z = TZ0 + p * PISO + 0.9
    window_band(cH, f"HOSP_t{p}s", -24, 32, -1.0, z, 1.9, 14, rH, w_ratio=0.8)
    window_band(cH, f"HOSP_t{p}n", -24, 32, 17.0, z, 1.9, 14, rH, w_ratio=0.8)
# nucleos verticales con acento
for i, x in enumerate((-26.5, 34.5)):
    box(f"HOSP_nucleo{i}", cH, (5, 20, PISO * NP + 2.5), (x, 8, TZ0), M["acento_hosp"], rH)
TOP = TZ0 + PISO * NP
box("HOSP_torre_pretil", cH, (56.4, 18.4, 0.8), (4, 8, TOP), M["muro2"], rH)
box("HOSP_torre_azotea", cH, (55.6, 17.6, 0.05), (4, 8, TOP), M["techo"], rH)
# helipuerto
cyl("HOSP_heli_base", cH, 7.5, 0.4, (14, 8, TOP + 0.05), M["helipuerto"], rH, 40)
cyl("HOSP_heli_aro", cH, 6.8, 0.05, (14, 8, TOP + 0.45), M["linea"], rH, 40)
cyl("HOSP_heli_int", cH, 6.3, 0.07, (14, 8, TOP + 0.45), M["helipuerto"], rH, 40)
box("HOSP_H_izq", cH, (0.8, 5, 0.1), (12.4, 8, TOP + 0.48), M["linea"], rH)
box("HOSP_H_der", cH, (0.8, 5, 0.1), (15.6, 8, TOP + 0.48), M["linea"], rH)
box("HOSP_H_cen", cH, (2.4, 0.8, 0.1), (14, 8, TOP + 0.48), M["linea"], rH)
# cuarto de maquinas
box("HOSP_maquinas", cH, (10, 8, 3), (-12, 8, TOP), M["concreto"], rH)
# acceso principal
box("HOSP_vestibulo", cH, (16, 4, 8.5), (-14, -23, 0.15), M["vidrio"], rH)
box("HOSP_marquesina", cH, (20, 8, 0.45), (-14, -27, 5.0), M["acento_hosp"], rH)
for i, x in enumerate((-23, -5)):
    cyl(f"HOSP_col{i}", cH, 0.35, 5.0, (x, -30.5, 0.15), M["muro"], rH, 12)
box("HOSP_letrero", cH, (26, 0.3, 2.2), (4, 0.6 - 1.75, TOP - 3.2), M["acento_hosp"], rH)
label("HOSPITAL", cH, (4, -1.32, TOP - 2.85), 1.6, M["muro"], rH)
# urgencias: rampa techada para ambulancias en el costado este
box("HOSP_urg_cuerpo", cH, (12, 16, 5.2), (46, -8, 0.15), M["muro"], rH)
box("HOSP_urg_cubierta", cH, (14, 18, 0.45), (55, -8, 5.0), M["rojo"], rH)
for i, (x, y) in enumerate(((61.5, -16.5), (61.5, 0.5))):
    cyl(f"HOSP_urg_col{i}", cH, 0.3, 5.0, (x, y, 0.15), M["muro"], rH, 12)
box("HOSP_urg_letrero", cH, (0.3, 10, 1.4), (62.2, -8, 5.5), M["rojo"], rH)
label("URGENCIAS", cH, (62.4, -8, 5.75), 1.0, M["muro"], rH, rot=(math.radians(90), 0, math.radians(90)))
red_cross(cH, (40, -21.2, 8.6), 2.6, rH)
# ambulancia
box("HOSP_ambulancia", cH, (2.3, 6, 2.5), (56, -8, 0.3), M["muro"], rH)
box("HOSP_amb_franja", cH, (2.35, 6.05, 0.4), (56, -8, 1.2), M["rojo"], rH)
box("HOSP_amb_torreta", cH, (1.4, 0.4, 0.25), (56, -10.6, 2.8), M["rojo"], rH)
# anden de abasto (farmacia hospitalaria / almacen) al norte
box("HOSP_anden", cH, (18, 4, 1.2), (22, 30.8, 0.15), M["concreto"], rH)
for i in range(3):
    box(f"HOSP_cortina{i}", cH, (4, 0.12, 3.4), (16 + i * 6, 29.06, 1.35), M["metal"], rH)
box("HOSP_camion", cH, (2.5, 8, 3.2), (16, 37, 0.4), M["amarillo"], rH)
# tanques de oxigeno y estacionamientos
for i in range(2):
    cyl(f"HOSP_oxigeno{i}", cH, 1.1, 7, (-36 + i * 3, 32, 0.15), M["metal"], rH, 16)
parking(cH, "HOSP_estac1", -48, -40, 16, rH, cars=(0, 2, 3, 5, 6, 7, 9, 11, 12, 14))
parking(cH, "HOSP_estac2", 8, -40, 14, rH, cars=(1, 2, 4, 7, 8, 10, 13))
for i in range(5):
    tree(cH, f"HOSP_arbol{i}", (-50 + i * 9, -28, 0.15), rH, 7)

# ---------------------------------------------------------------- escena
suelo = bpy.data.objects.get("Suelo_unidades")
if not suelo:
    me = bpy.data.meshes.new("Suelo_unidades")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200)
    bm.to_mesh(me); bm.free(); me.materials.append(M["pasto"])
    suelo = bpy.data.objects.new("Suelo_unidades", me)
    suelo.location = (80, 0, -0.01)
    escena.objects.link(suelo)

# etiquetas de escala bajo cada unidad (solo para la vista de referencia)
for txt, x, y in (("CAF · pequena", 0, -9), ("UMF · mediana", 45, -32), ("HOSPITAL · grande", 150, -40)):
    label(txt, escena, (x, y, 0.2), 1.6 if x == 0 else 3.0, M["tinaco"], rot=(0, 0, 0))

sun = bpy.data.objects.get("Sol_unidades")
if not sun:
    ld = bpy.data.lights.new("Sol_unidades", "SUN"); ld.energy = 4.0; ld.angle = math.radians(3)
    sun = bpy.data.objects.new("Sol_unidades", ld)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    escena.objects.link(sun)

cam = bpy.data.objects.get("Camara_unidades")
if not cam:
    cd = bpy.data.cameras.new("Camara_unidades"); cd.lens = 35
    cam = bpy.data.objects.new("Camara_unidades", cd)
    escena.objects.link(cam)
cam.location = (60, -160, 110)
from mathutils import Vector
cam.rotation_euler = (Vector((78, 0, 0)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = cam

w = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = w
w.use_nodes = True
bg = next((n for n in w.node_tree.nodes if n.bl_idname == "ShaderNodeBackground"), None)
if bg:
    bg.inputs["Color"].default_value = (*hexrgb("#CFE0EE"), 1)
    bg.inputs["Strength"].default_value = 0.9

print("Unidades medicas creadas: CAF, UMF y Hospital")

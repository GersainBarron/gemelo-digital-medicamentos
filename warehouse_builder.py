# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  ALMACÉN LOGÍSTICO MODULAR PARA ABASTO DE MEDICAMENTOS
#  Gemelo digital / plataforma de simulación de cadena de abasto
#  Script único Blender (bpy) · probado en Blender 5.2 (compatible 4.2+)
# ---------------------------------------------------------------------
#  USO
#   1) Abrir Blender > pestaña Scripting > abrir este archivo > Run Script
#      (o: blender --background --python warehouse_builder.py)
#   2) El script BORRA la escena actual y construye todo desde cero.
#   3) Al final guarda en CFG["OUT_DIR"]:
#        almacen_medicamentos.blend  · escena completa
#        almacen_medicamentos.glb    · para web / iPad (three.js, Babylon.js, <model-viewer>)
#        warehouse_layout.json       · zonas, rutas, nodos, slots, andenes, equipos, cámaras
#
#  ESTRUCTURA
#   Sección 00  CONFIG, ZONES, utilidades, colecciones, texturas, materiales, MB (constructor de mallas)
#   Sección 01  create_building()        nave, muros, techo, claraboyas, andenes, puertas, oficina, exterior
#   Sección 02  create_racks() / create_pallets() / create_containers() / create_boxes()
#   Sección 03  create_carts() / create_forklifts()  (carritos, transpaletas, montacargas, reach, AGV, AMR)
#   Sección 04  create_conveyors() / create_workstations() / create_safety_items()
#   Sección 05  assemble_warehouse()     coloca todo por zonas (racks llenos, picking, empaque, frío, controlados)
#   Sección 06  create_lights() / create_cameras() / create_helpers()  (rutas, nodos, zonas, pickup/dropoff)
#   Sección 07  scene_stats() / save_blend() / export_glb() / export_layout_json()
#
#  CÓMO MODIFICAR
#   - Medidas, andenes, niveles de rack, ancho de pasillo, % de ocupación: diccionario CFG.
#   - Ubicación de zonas: diccionario ZONES.
#   - Cantidades y posiciones por zona: funciones assemble_* de la sección 05.
#   - Cada asset maestro vive en <Colección>_Library (excluida); en escena hay duplicados
#     enlazados: editar la malla del maestro actualiza todas sus copias.
#   - Propiedades "wh_*" en objetos (tipo, estado, slot, zona, capacidad...) -> extras en glTF.
# =====================================================================
# =====================================================================
#  ALMACÉN LOGÍSTICO DE MEDICAMENTOS  ·  GEMELO DIGITAL
#  Blender 4.2+ / 5.x  ·  bpy
#  SECCIÓN 00 · CONFIG, utilidades, colecciones, texturas y materiales
# =====================================================================
#  Convenciones:
#   - Unidades en metros. Origen del mundo = esquina suroeste interior de la nave.
#   - Eje X = largo de la nave (0..50), eje Y = ancho (0..30), Z = altura.
#   - Muro de andenes en Y = 0 (sur). El patio de maniobras está en Y < 0, Z = -1.2.
#   - Cada asset "maestro" vive en la subcolección <Coleccion>_Library (excluida
#     del view layer). En la escena se colocan duplicados enlazados (comparten malla).
#   - Todos los objetos tienen propiedades personalizadas "wh_*" (se exportan a glTF
#     como "extras") para usarlas después en la lógica de simulación.
# =====================================================================
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, Matrix, Euler

# ---------------------------------------------------------------------
# CONFIGURACIÓN GENERAL  (modifica aquí medidas, cantidades y zonas)
# ---------------------------------------------------------------------
CFG = {
    "OUT_DIR": os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega"),  # o define BODEGA_ROOT
    "SEED": 42,                 # semilla para variaciones reproducibles
    # --- Nave ---
    "W": 50.0,                  # largo interior (X)
    "D": 30.0,                  # ancho interior (Y)
    "H": 10.0,                  # altura libre a alero
    "RIDGE": 1.5,               # altura extra de cumbrera
    "WALL_T": 0.25,             # espesor de muro
    "FRAME_STEP": 5.0,          # separación de marcos/columnas (X)
    "YARD_Z": -1.2,             # nivel del patio (andén a 1.2 m)
    # --- Andenes (centros en X sobre muro sur) ---
    "DOCKS_RECEIVING": [2.5, 7.5, 12.5],
    "DOCKS_DISPATCH": [37.5, 42.5, 47.5],
    "DOCK_DOOR_W": 3.0, "DOCK_DOOR_H": 3.2,
    # --- Racks altos (almacenamiento principal) ---
    "RACK_BAY_L": 2.7,          # largo libre de bahía
    "RACK_DEPTH": 1.1,          # fondo de marco
    "RACK_LEVELS": [0.0, 1.8, 3.6, 5.4, 7.2],  # alturas de cama (0 = piso)
    "RACK_H": 8.0,              # altura de postes
    "RACK_BAYS_PER_ROW": 5,
    "RACK_Y0": 13.6,            # inicio de filas en Y
    "AISLE_W": 3.5,             # ancho de pasillo de montacargas
    "FLUE": 0.2,                # separación espalda con espalda
    "RACK_FILL": 0.82,          # % de posiciones ocupadas
}

# Zonas del layout: (x0, y0, x1, y1). Se usan para piso, helpers y ensamblaje.
ZONES = {
    "Receiving":        (0.25, 0.25, 15.0, 9.0),
    "Charging":         (15.0, 0.25, 21.0, 6.0),
    "Packing":          (21.0, 0.25, 34.0, 9.0),
    "Dispatch":         (34.0, 0.25, 49.75, 9.0),
    "Main_Aisle":       (0.25, 9.0, 49.75, 13.0),
    "Storage":          (0.25, 13.0, 30.0, 29.75),
    "Picking":          (31.0, 13.0, 41.0, 29.75),
    "Controlled_Meds":  (42.0, 13.4, 49.75, 19.4),
    "Cold_Storage":     (42.0, 20.0, 49.75, 29.75),
    "Office":           (15.0, 0.25, 21.0, 6.0),   # mezanine sobre zona de carga
}

COLLECTIONS = [
    "01_Building", "02_Racks", "03_Pallets", "04_Boxes", "05_Carts",
    "06_Forklifts", "07_Conveyors", "08_Workstations", "09_Safety",
    "10_Loading_Docks", "11_Cold_Storage", "12_Controlled_Meds",
    "13_Floor_Marking", "14_Environment", "15_Lights", "16_Cameras",
    "17_Helper_Objects",
]

MAT = {}   # nombre -> material
LIB = {}   # nombre -> objeto maestro de biblioteca

# ---------------------------------------------------------------------
# ESCENA Y COLECCIONES
# ---------------------------------------------------------------------
def reset_scene():
    """Borra todo el contenido de la escena y los datos huérfanos."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights,
                bpy.data.cameras, bpy.data.images, bpy.data.node_groups):
        for b in list(blk):
            blk.remove(b)
    scn = bpy.context.scene
    scn.unit_settings.system = 'METRIC'
    scn.unit_settings.scale_length = 1.0
    scn.unit_settings.length_unit = 'METERS'
    try:
        scn.view_settings.view_transform = 'AgX'
    except Exception:
        pass
    # Mundo: cielo gris claro suave
    w = scn.world or bpy.data.worlds.new("World")
    scn.world = w
    if bpy.app.version < (5, 0, 0):
        w.use_nodes = True
    bg = next((n for n in w.node_tree.nodes if n.bl_idname == "ShaderNodeBackground"), None)
    if bg:
        bg.inputs[0].default_value = (0.62, 0.68, 0.75, 1.0)
        bg.inputs[1].default_value = 0.6
    MAT.clear(); LIB.clear()

def _find_layer_col(lc, name):
    if lc.collection.name == name:
        return lc
    for ch in lc.children:
        r = _find_layer_col(ch, name)
        if r:
            return r
    return None

def get_col(name, parent=None):
    """Devuelve (o crea) una colección enlazada al padre indicado o a la escena."""
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c

def lib_col(main):
    """Subcolección <main>_Library, excluida del view layer (assets maestros)."""
    c = get_col(main + "_Library", get_col(main))
    lc = _find_layer_col(bpy.context.view_layer.layer_collection, c.name)
    if lc:
        lc.exclude = True
    return c

def build_collections():
    for n in COLLECTIONS:
        get_col(n)

# ---------------------------------------------------------------------
# TEXTURAS PROCEDURALES (se generan como imágenes empaquetadas: glTF-friendly)
# ---------------------------------------------------------------------
def _img(name, arr):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.pack()
    return img

def create_textures():
    rng = np.random.default_rng(CFG["SEED"])
    tex = {}
    # Concreto: ruido suave + manchas
    n = 256
    base = rng.normal(0, 1, (n, n))
    k = np.ones(9) / 9.0
    for _ in range(3):
        base = np.apply_along_axis(lambda m: np.convolve(m, k, 'same'), 0, base)
        base = np.apply_along_axis(lambda m: np.convolve(m, k, 'same'), 1, base)
    base = (base - base.min()) / (base.max() - base.min())
    fine = rng.normal(0, 0.03, (n, n))
    v = 0.50 + 0.10 * base + fine
    a = np.dstack([v * 1.0, v * 0.99, v * 0.96, np.ones_like(v)])
    tex["concrete"] = _img("TX_Concrete", a)
    # Malla de jaula (alambre) con alfa
    n = 64
    a = np.zeros((n, n, 4)); a[..., :3] = 0.75
    a[:, 0:3, 3] = 1; a[0:3, :, 3] = 1
    tex["wire"] = _img("TX_Wire_Mesh", a)
    # Etiqueta con código de barras
    w, h = 128, 64
    a = np.ones((h, w, 4))
    bars = rng.integers(0, 2, w)
    for x in range(10, w - 10):
        if bars[x]:
            a[14:50, x, :3] = 0.05
    a[54:58, 10:118, :3] = 0.3
    tex["barcode"] = _img("TX_Label_Barcode", a)
    # Etiqueta de medicamento (franja + cruz verde)
    n = 128
    a = np.ones((n, n, 4)); a[..., :3] = 0.95
    a[0:22, :, 0:3] = (0.05, 0.45, 0.75)
    a[40:96, 56:72, 0:3] = (0.05, 0.6, 0.3)
    a[60:76, 36:92, 0:3] = (0.05, 0.6, 0.3)
    tex["med"] = _img("TX_Label_Med", a)
    # Etiqueta de frío (azul con copo simple)
    a = np.ones((n, n, 4)); a[..., :3] = (0.1, 0.45, 0.85)
    a[60:68, 20:108, :3] = 1; a[20:108, 60:68, :3] = 1
    for i in range(30, 98):
        a[i, i, :3] = 1; a[i, 127 - i, :3] = 1
    tex["cold"] = _img("TX_Label_Cold", a)
    # Etiqueta de controlado (roja con franja)
    a = np.ones((n, n, 4)); a[..., :3] = (0.8, 0.08, 0.08)
    a[48:80, 10:118, :3] = 1
    tex["controlled"] = _img("TX_Label_Controlled", a)
    return tex

# ---------------------------------------------------------------------
# MATERIALES (Principled BSDF simple: compatibles con glTF / web / iPad)
# ---------------------------------------------------------------------
def _set(bsdf, key, val):
    if key in bsdf.inputs:
        bsdf.inputs[key].default_value = val

def make_mat(name, rgb, metal=0.0, rough=0.5, emit=0.0, alpha=1.0, image=None, image_alpha=False):
    m = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):   # en 5.x los materiales siempre usan nodos
        m.use_nodes = True
    nt = m.node_tree
    # Se busca por tipo (el nombre del nodo depende del idioma de la interfaz)
    bsdf = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    _set(bsdf, "Base Color", (*rgb, 1.0))
    _set(bsdf, "Metallic", metal)
    _set(bsdf, "Roughness", rough)
    if emit > 0:
        _set(bsdf, "Emission Color", (*rgb, 1.0))
        _set(bsdf, "Emission Strength", emit)
    if image is not None:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = image
        t.location = (-400, 200)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        if image_alpha:
            nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
    if alpha < 1.0:
        _set(bsdf, "Alpha", alpha)
    if alpha < 1.0 or image_alpha:
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    m.diffuse_color = (*rgb, alpha)   # color en vista sólida
    MAT[name] = m
    return m

def create_materials(tex):
    P = [
        # nombre,                 color,               metal, rough
        ("M_Concrete_Floor",      (1.0, 1.0, 1.0),      0.0, 0.45),
        ("M_Concrete_Wall",       (0.62, 0.62, 0.60),   0.0, 0.85),
        ("M_Asphalt",             (0.12, 0.12, 0.13),   0.0, 0.90),
        ("M_Wall_Panel",          (0.80, 0.82, 0.84),   0.4, 0.45),
        ("M_Roof_Panel",          (0.70, 0.72, 0.75),   0.5, 0.50),
        ("M_Steel_Structure",     (0.22, 0.27, 0.33),   0.6, 0.45),
        ("M_Metal_Blue",          (0.04, 0.17, 0.48),   0.3, 0.40),
        ("M_Metal_Orange",        (0.90, 0.33, 0.04),   0.3, 0.40),
        ("M_Metal_Grey",          (0.35, 0.37, 0.40),   0.5, 0.45),
        ("M_Metal_White",         (0.85, 0.87, 0.88),   0.2, 0.35),
        ("M_Galvanized",          (0.68, 0.70, 0.72),   1.0, 0.35),
        ("M_Steel_Dark",          (0.10, 0.10, 0.11),   0.8, 0.40),
        ("M_Plastic_Blue",        (0.05, 0.30, 0.70),   0.0, 0.40),
        ("M_Plastic_Grey",        (0.45, 0.47, 0.50),   0.0, 0.45),
        ("M_Plastic_Red",         (0.75, 0.06, 0.06),   0.0, 0.40),
        ("M_Plastic_Green",       (0.10, 0.50, 0.25),   0.0, 0.40),
        ("M_Plastic_Yellow",      (0.95, 0.70, 0.05),   0.0, 0.40),
        ("M_Plastic_Black",       (0.03, 0.03, 0.035),  0.0, 0.50),
        ("M_Plastic_White",       (0.88, 0.89, 0.90),   0.0, 0.35),
        ("M_Rubber",              (0.02, 0.02, 0.02),   0.0, 0.85),
        ("M_Cardboard",           (0.58, 0.41, 0.24),   0.0, 0.85),
        ("M_Cardboard_Light",     (0.72, 0.56, 0.36),   0.0, 0.85),
        ("M_Cardboard_White",     (0.90, 0.90, 0.88),   0.0, 0.80),
        ("M_Tape",                (0.78, 0.62, 0.38),   0.0, 0.30),
        ("M_Wood_Pallet",         (0.62, 0.47, 0.29),   0.0, 0.80),
        ("M_Paint_Yellow",        (0.95, 0.72, 0.02),   0.0, 0.55),
        ("M_Paint_White",         (0.92, 0.92, 0.92),   0.0, 0.55),
        ("M_Paint_Red",           (0.80, 0.05, 0.05),   0.0, 0.55),
        ("M_Paint_Green",         (0.05, 0.55, 0.25),   0.0, 0.55),
        ("M_Paint_Blue",          (0.05, 0.30, 0.75),   0.0, 0.55),
        ("M_Safety_Yellow",       (0.98, 0.70, 0.02),   0.2, 0.40),
        ("M_Safety_Black",        (0.04, 0.04, 0.04),   0.2, 0.50),
        ("M_Insulated_Panel",     (0.93, 0.95, 0.96),   0.2, 0.35),
        ("M_Office_Wood",         (0.55, 0.40, 0.27),   0.0, 0.55),
        ("M_Fabric_Dark",         (0.05, 0.06, 0.07),   0.0, 0.90),
        ("M_Agv_Body",            (0.90, 0.92, 0.94),   0.1, 0.30),
    ]
    for n, c, me, r in P:
        make_mat(n, c, me, r)
    # Con textura
    bpy.data.materials.remove(MAT.pop("M_Concrete_Floor"))
    make_mat("M_Concrete_Floor", (0.6, 0.6, 0.58), 0.0, 0.42, image=tex["concrete"])
    make_mat("M_Wire_Mesh", (0.7, 0.72, 0.74), 0.8, 0.4, image=tex["wire"], image_alpha=True)
    make_mat("M_Label_Barcode", (1, 1, 1), 0, 0.6, image=tex["barcode"])
    make_mat("M_Label_Med", (1, 1, 1), 0, 0.6, image=tex["med"])
    make_mat("M_Label_Cold", (1, 1, 1), 0, 0.6, image=tex["cold"])
    make_mat("M_Label_Controlled", (1, 1, 1), 0, 0.6, image=tex["controlled"])
    # Transparentes y emisivos
    make_mat("M_Glass", (0.70, 0.82, 0.88), 0.0, 0.05, alpha=0.25)
    make_mat("M_Stretch_Film", (0.85, 0.88, 0.92), 0.0, 0.15, alpha=0.55)
    make_mat("M_Light_Emissive", (1.0, 0.97, 0.92), 0.0, 0.3, emit=6.0)
    make_mat("M_Light_Green", (0.1, 0.9, 0.3), 0.0, 0.3, emit=4.0)
    make_mat("M_Light_Red", (1.0, 0.1, 0.05), 0.0, 0.3, emit=4.0)
    make_mat("M_Light_Amber", (1.0, 0.55, 0.05), 0.0, 0.3, emit=4.0)
    make_mat("M_Screen", (0.10, 0.35, 0.60), 0.0, 0.2, emit=1.5)

# ---------------------------------------------------------------------
# CONSTRUCTOR DE MALLAS
# Acumula primitivas en un solo bmesh (un objeto, varios materiales).
# Coordenadas en espacio local del asset: el origen debe quedar en la base.
# ---------------------------------------------------------------------
class MB:
    def __init__(self, uv_scale=1.0):
        self.bm = bmesh.new()
        self.mats = []
        self.uv_scale = uv_scale
        self.fixed_uv = set()     # caras con UV propio (etiquetas)

    def _tag(self, faces, m):
        if m not in self.mats:
            self.mats.append(m)
        i = self.mats.index(m)
        for f in faces:
            f.material_index = i
        return faces

    def box(self, mn, mx, m):
        """Caja por esquinas mínima y máxima."""
        mn, mx = Vector(mn), Vector(mx)
        c = (mn + mx) / 2; s = mx - mn
        M = Matrix.Translation(c) @ Matrix.Diagonal((max(s.x, 1e-4), max(s.y, 1e-4), max(s.z, 1e-4), 1))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        faces = {f for v in r["verts"] for f in v.link_faces}
        return self._tag(faces, m)

    def boxc(self, c, s, m, rz=0.0):
        """Caja por centro y tamaño (con rotación opcional en Z)."""
        M = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((s[0], s[1], s[2], 1))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        faces = {f for v in r["verts"] for f in v.link_faces}
        return self._tag(faces, m)

    def cyl(self, c, r, h, m, axis='Z', seg=12, r2=None):
        """Cilindro (o cono si r2) centrado en c, orientado en el eje dado."""
        R = Matrix.Identity(4)
        if axis == 'X':
            R = Matrix.Rotation(math.pi / 2, 4, 'Y')
        elif axis == 'Y':
            R = Matrix.Rotation(math.pi / 2, 4, 'X')
        M = Matrix.Translation(c) @ R
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                    radius1=r, radius2=(r if r2 is None else r2), depth=h, matrix=M)
        faces = {f for v in res["verts"] for f in v.link_faces}
        return self._tag(faces, m)

    def quad(self, p0, p1, p2, p3, m):
        """Cara plana con UV 0..1 (para etiquetas y letreros)."""
        vs = [self.bm.verts.new(p) for p in (p0, p1, p2, p3)]
        f = self.bm.faces.new(vs)
        self._tag([f], m)
        self.fixed_uv.add(f)
        return f

    def label(self, center, w, h, normal, m, off=0.002):
        """Etiqueta rectangular sobre una cara orientada a +X,-X,+Y,-Y,+Z."""
        c = Vector(center); hw, hh = w / 2, h / 2
        n = {'+X': Vector((1, 0, 0)), '-X': Vector((-1, 0, 0)), '+Y': Vector((0, 1, 0)),
             '-Y': Vector((0, -1, 0)), '+Z': Vector((0, 0, 1))}[normal]
        c = c + n * off
        if normal == '+Z':
            u, v = Vector((1, 0, 0)), Vector((0, 1, 0))
        else:
            v = Vector((0, 0, 1)); u = v.cross(n) * -1
        return self.quad(c - u * hw - v * hh, c + u * hw - v * hh, c + u * hw + v * hh, c - u * hw + v * hh, m)

    def _uv(self):
        uvl = self.bm.loops.layers.uv.verify()
        s = self.uv_scale
        for f in self.bm.faces:
            if f in self.fixed_uv:
                for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                    l[uvl].uv = uv
                continue
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                co = l.vert.co
                l[uvl].uv = (co.y * s, co.z * s) if ax == 0 else ((co.x * s, co.z * s) if ax == 1 else (co.x * s, co.y * s))

    def build(self, name, col, loc=(0, 0, 0), rot_z=0.0, props=None):
        self.bm.normal_update()
        self._uv()
        me = bpy.data.meshes.new("ME_" + name)
        self.bm.to_mesh(me)
        self.bm.free()
        for mn in self.mats:
            me.materials.append(MAT[mn])
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (0, 0, rot_z)
        for k, v in (props or {}).items():
            ob[k] = v
        return ob

# ---------------------------------------------------------------------
# UTILIDADES DE OBJETOS
# ---------------------------------------------------------------------
def empty(name, col, loc=(0, 0, 0), kind='PLAIN_AXES', size=0.5, parent=None, props=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = kind
    ob.empty_display_size = size
    col.objects.link(ob)
    ob.location = loc
    if parent:
        ob.parent = parent
    for k, v in (props or {}).items():
        ob[k] = v
    return ob

def parent_to(child, parent):
    """Emparenta conservando la posición local definida (sin matriz inversa)."""
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    return child

def instance(src, name, loc, rot_z=0.0, col=None, props=None, _root=None):
    """Duplicado enlazado (comparte malla) de un asset, incluyendo su jerarquía.
    Los hijos se renombran sustituyendo el prefijo del maestro por el nuevo nombre
    (p. ej. Forklift_Counterbalance_Carriage -> Forklift_02_Carriage)."""
    _root = _root or (src.name, name)
    ob = bpy.data.objects.new(name, src.data)
    if src.type == 'EMPTY':
        ob.empty_display_type = src.empty_display_type
        ob.empty_display_size = src.empty_display_size
    (col or bpy.context.scene.collection).objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = src.scale
    for k in src.keys():
        if k.startswith("wh_"):
            ob[k] = src[k]
    for k, v in (props or {}).items():
        ob[k] = v
    for ch in src.children:
        cn = ch.name.replace(_root[0], _root[1], 1) if ch.name.startswith(_root[0]) else name + "_" + ch.name
        c = instance(ch, cn, ch.location.copy(), 0.0, col, None, _root)
        c.rotation_euler = ch.rotation_euler.copy()
        parent_to(c, ob)
    return ob

def text_mesh(name, txt, size, col, mat, loc, rot=(0, 0, 0), align='CENTER', extrude=0.0, props=None):
    """Texto convertido a malla (exportable a glTF)."""
    cu = bpy.data.curves.new("TMP_" + name, 'FONT')
    cu.body = txt; cu.size = size; cu.align_x = align; cu.align_y = 'CENTER'
    cu.extrude = extrude
    tmp = bpy.data.objects.new("TMP_" + name, cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    me.name = "ME_" + name
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.materials.append(MAT[mat])
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.location = loc; ob.rotation_euler = rot
    for k, v in (props or {}).items():
        ob[k] = v
    return ob

def rng():
    return random.Random(CFG["SEED"])

# ---------------------------------------------------------------------
def phase_core():
    reset_scene()
    build_collections()
    tex = create_textures()
    create_materials(tex)
    return {"collections": len(bpy.data.collections), "materials": len(MAT)}

# =====================================================================
#  SECCIÓN 01 · EDIFICIO, ANDENES, OFICINA Y ENTORNO EXTERIOR
# =====================================================================

# ---- Extensiones del constructor de mallas --------------------------
def _mb_prism(self, pts, axis, a0, a1, m):
    """Prisma: perfil 2D extruido a lo largo de 'axis' entre a0 y a1.
    Para axis='X' el perfil es (y,z); 'Y' -> (x,z); 'Z' -> (x,y)."""
    def P(p, a):
        u, v = p
        return (a, u, v) if axis == 'X' else ((u, a, v) if axis == 'Y' else (u, v, a))
    v0 = [self.bm.verts.new(P(p, a0)) for p in pts]
    v1 = [self.bm.verts.new(P(p, a1)) for p in pts]
    faces = [self.bm.faces.new(v0), self.bm.faces.new(list(reversed(v1)))]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        faces.append(self.bm.faces.new((v0[i], v0[j], v1[j], v1[i])))
    bmesh.ops.recalc_face_normals(self.bm, faces=faces)
    return self._tag(faces, m)

def _mb_bar(self, p0, p1, r, m, seg=8):
    """Tubo redondo entre dos puntos (barandales, carritos, jaulas)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
    res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                radius1=r, radius2=r, depth=d.length, matrix=M)
    faces = {f for v in res["verts"] for f in v.link_faces}
    return self._tag(faces, m)

def _mb_sbar(self, p0, p1, w, m, h=None):
    """Perfil cuadrado entre dos puntos (diagonales de rack, contravientos)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((w, h or w, d.length, 1))
    res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
    faces = {f for v in res["verts"] for f in v.link_faces}
    return self._tag(faces, m)

MB.prism = _mb_prism
MB.bar = _mb_bar
MB.sbar = _mb_sbar

def zr(y):
    """Altura de la cara inferior del techo a dos aguas en función de Y."""
    D = CFG["D"]
    return CFG["H"] + CFG["RIDGE"] * (1 - abs(y - D / 2) / (D / 2))

def wall(mb, axis, l0, l1, t0, t1, z0, z1, openings, base_h=2.5):
    """Muro con huecos. axis='X' -> largo en X, espesor en Y (t0..t1).
    openings: lista de (centro, ancho, z_inferior, z_superior).
    Zócalo de concreto hasta base_h y panel metálico arriba."""
    def piece(a, b, za, zb):
        if b - a < 1e-3 or zb - za < 1e-3:
            return
        for ya, yb, m in ((za, min(zb, base_h), "M_Concrete_Wall"), (max(za, base_h), zb, "M_Wall_Panel")):
            if yb - ya > 1e-3:
                if axis == 'X':
                    mb.box((a, t0, ya), (b, t1, yb), m)
                else:
                    mb.box((t0, a, ya), (t1, b, yb), m)
    xs = {l0, l1}
    for c, w, zb, zt in openings:
        xs |= {c - w / 2, c + w / 2}
    xs = sorted(x for x in xs if l0 <= x <= l1)
    for a, b in zip(xs, xs[1:]):
        mid = (a + b) / 2
        holes = sorted((zb, zt) for c, w, zb, zt in openings if c - w / 2 < mid < c + w / 2)
        z = z0
        for zb, zt in holes:
            piece(a, b, z, zb)
            z = max(z, zt)
        piece(a, b, z, z1)

def window_unit(mbF, mbG, axis, c, w, zb, zt, t0, t1):
    """Marco + vidrio dentro de un hueco de ventana."""
    tm = (t0 + t1) / 2; f = 0.06
    def bx(a0, a1, z0, z1, m, ta=t0, tb=t1):
        if axis == 'X':
            (mbF if m != "M_Glass" else mbG).box((a0, ta, z0), (a1, tb, z1), m)
        else:
            (mbF if m != "M_Glass" else mbG).box((ta, a0, z0), (tb, a1, z1), m)
    a0, a1 = c - w / 2, c + w / 2
    bx(a0, a1, zb, zb + f, "M_Metal_Grey"); bx(a0, a1, zt - f, zt, "M_Metal_Grey")
    bx(a0, a0 + f, zb, zt, "M_Metal_Grey"); bx(a1 - f, a1, zb, zt, "M_Metal_Grey")
    bx(c - f / 2, c + f / 2, zb, zt, "M_Metal_Grey")
    bx(a0 + f, a1 - f, zb + f, zt - f, "M_Glass", tm - 0.01, tm + 0.01)

# ---- Puerta enrollable (andén y portón a nivel) ---------------------
def build_rolling_door(name, col, w, h, with_dock=True):
    """Asset de puerta. Origen = centro inferior del hueco, cara interior del muro (Y=0).
    El exterior queda hacia -Y. El hijo *_Door tiene su origen ARRIBA: para abrir,
    escalar en Z (1 = cerrada, 0.04 = abierta)."""
    root = empty(name, col, (0, 0, 0), 'ARROWS', 0.6, props={"wh_type": "dock" if with_dock else "door_grade"})
    # Cortina
    d = MB()
    d.box((-w / 2, 0.02, -h), (w / 2, 0.07, 0), "M_Metal_White")
    z = -h + 0.25
    while z < -0.1:
        d.box((-w / 2, 0.07, z), (w / 2, 0.085, z + 0.03), "M_Metal_Grey")
        z += 0.25
    d.box((-w / 2, 0.015, -h), (w / 2, 0.09, -h + 0.06), "M_Rubber")
    d.box((-w / 2 + 0.3, 0.066, -h * 0.35 - 0.12), (w / 2 - 0.3, 0.075, -h * 0.35 + 0.12), "M_Glass")
    door = parent_to(d.build(name + "_Door", col, (0, 0, h), props={"wh_type": "door_curtain", "wh_open": 0.0}), root)
    # Marco: guías, caja de enrollado, protectores amarillos y lámpara de andén
    f = MB()
    for s in (-1, 1):
        f.box((s * w / 2, 0.0, 0), (s * (w / 2 + 0.1), 0.12, h + 0.05), "M_Galvanized")
        f.cyl((s * (w / 2 + 0.3), 0.35, 0.6), 0.08, 1.2, "M_Safety_Yellow", seg=12)
        f.cyl((s * (w / 2 + 0.3), 0.35, 1.22), 0.085, 0.04, "M_Safety_Black", seg=12)
    f.box((-w / 2 - 0.2, 0.0, h + 0.05), (w / 2 + 0.2, 0.5, h + 0.55), "M_Galvanized")
    if with_dock:
        f.box((-w / 2 - 0.45, 0.0, 2.5), (-w / 2 - 0.35, 0.6, 2.56), "M_Steel_Dark")
        f.box((-w / 2 - 0.5, 0.5, 2.4), (-w / 2 - 0.3, 0.7, 2.6), "M_Plastic_Black")
        f.box((-w / 2 - 0.48, 0.52, 2.39), (-w / 2 - 0.32, 0.68, 2.4), "M_Light_Emissive")
    parent_to(f.build(name + "_Frame", col), root)
    if not with_dock:
        return root
    # Nivelador (rampa niveladora)
    l = MB()
    l.box((-1.0, 0.0, -0.03), (1.0, 2.5, 0.004), "M_Steel_Dark")
    l.box((-1.0, -0.4, -0.03), (1.0, 0.0, 0.004), "M_Metal_Grey")
    for x in (-1.0, 1.0):
        l.box((x - 0.04, 0.0, -0.03), (x + 0.04, 2.5, 0.005), "M_Safety_Yellow")
    parent_to(l.build(name + "_Leveler", col, props={"wh_type": "dock_leveler"}), root)
    # Topes de andén
    b = MB()
    for s in (-1, 1):
        b.box((s * 1.1, -0.29, -1.0), (s * 1.45, -0.25, -0.4), "M_Steel_Dark")
        b.box((s * 1.13, -0.42, -0.95), (s * 1.42, -0.29, -0.45), "M_Rubber")
    parent_to(b.build(name + "_Bumpers", col), root)
    # Sello / abrigo de andén
    s_ = MB()
    for s in (-1, 1):
        s_.box((s * (w / 2), -0.75, -0.3), (s * (w / 2 + 0.35), -0.25, h + 0.4), "M_Fabric_Dark")
    s_.box((-w / 2 - 0.35, -0.75, h), (w / 2 + 0.35, -0.25, h + 0.4), "M_Fabric_Dark")
    parent_to(s_.build(name + "_Seal", col), root)
    # Semáforo exterior (rojo/verde)
    g = MB()
    g.box((w / 2 + 0.5, -0.33, 0.25), (w / 2 + 0.72, -0.25, 0.85), "M_Plastic_Black")
    parent_to(g.build(name + "_Signal", col), root)
    for nm, z, m in (("Red", 0.68, "M_Light_Red"), ("Green", 0.42, "M_Light_Green")):
        k = MB(); k.cyl((0, 0, 0), 0.065, 0.03, m, axis='Y', seg=12)
        parent_to(k.build(name + "_Signal_" + nm, col, (w / 2 + 0.61, -0.345, z),
                          props={"wh_type": "dock_signal", "wh_state": nm.lower()}), root)
    return root

def build_ped_door(name, col, emergency=False):
    """Puerta peatonal con escalones exteriores (exterior hacia -Y).
    El hijo *_Leaf tiene el origen en la bisagra: rotar en Z para abrir."""
    root = empty(name, col, (0, 0, 0), 'ARROWS', 0.4, props={"wh_type": "emergency_exit" if emergency else "door_ped"})
    f = MB()
    for s in (-1, 1):
        f.box((s * 0.5, -0.27, 0), (s * 0.58, 0.02, 2.18), "M_Metal_Grey")
    f.box((-0.58, -0.27, 2.1), (0.58, 0.02, 2.18), "M_Metal_Grey")
    if emergency:
        f.box((-0.25, 0.02, 2.3), (0.25, 0.07, 2.48), "M_Light_Green")
    parent_to(f.build(name + "_Frame", col), root)
    lf = MB()
    lf.box((0, -0.03, 0.01), (1.0, 0.03, 2.09), "M_Paint_Green" if emergency else "M_Metal_Grey")
    lf.box((0.06, -0.035, 1.3), (0.94, -0.03, 1.95), "M_Glass") if not emergency else None
    if emergency:
        lf.bar((0.12, 0.09, 1.0), (0.9, 0.09, 1.0), 0.02, "M_Galvanized")
        lf.box((0.1, 0.03, 0.97), (0.16, 0.09, 1.03), "M_Galvanized"); lf.box((0.86, 0.03, 0.97), (0.92, 0.09, 1.03), "M_Galvanized")
    else:
        lf.box((0.85, 0.03, 1.0), (0.95, 0.07, 1.04), "M_Galvanized")
    parent_to(lf.build(name + "_Leaf", col, (-0.5, -0.12, 0), props={"wh_type": "door_leaf", "wh_open": 0.0}), root)
    if emergency:
        t = text_mesh(name + "_Sign", "SALIDA", 0.09, col, "M_Paint_White", (0, 0.072, 2.39), rot=(math.pi / 2, 0, math.pi))
        parent_to(t, root)
    # Escalones exteriores (de piso interior 0 a patio -1.2)
    st = MB()
    y0 = -0.25
    st.box((-0.9, y0 - 1.2, -1.2), (0.9, y0, -0.02), "M_Concrete_Wall")
    n = 5; rise = (1.2 - 0.02) / n; run = 0.3
    for i in range(1, n):
        st.box((-0.9, y0 - 1.2 - i * run, -1.2), (0.9, y0 - 1.2 - (i - 1) * run, -0.02 - i * rise), "M_Concrete_Wall")
    yend = y0 - 1.2 - (n - 1) * run
    for s in (-1, 1):
        x = s * 0.85
        st.bar((x, y0 - 0.05, -0.02), (x, y0 - 0.05, 1.0), 0.025, "M_Safety_Yellow")
        st.bar((x, y0 - 1.15, -0.02), (x, y0 - 1.15, 1.0), 0.025, "M_Safety_Yellow")
        st.bar((x, yend, -1.2 + rise), (x, yend, -1.2 + rise + 1.0), 0.025, "M_Safety_Yellow")
        st.bar((x, y0 - 0.05, 1.0), (x, y0 - 1.15, 1.0), 0.025, "M_Safety_Yellow")
        st.bar((x, y0 - 1.15, 1.0), (x, yend, -1.2 + rise + 1.0), 0.025, "M_Safety_Yellow")
    parent_to(st.build(name + "_Steps", col), root)
    return root

def build_trailer(name, col):
    """Caja seca de tráiler (53 ft aprox). Origen = centro trasero al nivel de la cama (Z=0)."""
    t = MB()
    L, W, Hh = 13.6, 2.56, 2.75
    t.box((-W / 2, -L, -0.15), (W / 2, 0, 0), "M_Steel_Dark")                    # piso
    t.box((-W / 2, -L, Hh), (W / 2, 0, Hh + 0.05), "M_Metal_White")              # techo
    for s in (-1, 1):
        t.box((s * W / 2 - (0.04 if s > 0 else 0), -L, 0), (s * W / 2 + (0.0 if s > 0 else 0.04), 0, Hh), "M_Metal_White")
        t.box((s * (W / 2 + 0.002), -L + 0.3, 0.3), (s * (W / 2 + 0.006), -0.3, 0.55), "M_Paint_Blue")
        # puertas traseras abiertas, plegadas contra los costados
        t.box((s * (W / 2 + 0.01), -W / 2, 0.0), (s * (W / 2 + 0.05), 0.0, Hh), "M_Metal_White")
    t.box((-W / 2, -L, 0), (W / 2, -L + 0.04, Hh), "M_Metal_White")              # frente
    t.box((-W / 2 + 0.04, -L + 0.04, 0.0), (W / 2 - 0.04, -0.05, 0.01), "M_Office_Wood")
    for s in (-1, 1):
        t.box((s * 0.45 - 0.08, -L + 0.5, -0.45), (s * 0.45 + 0.08, -0.2, -0.15), "M_Steel_Dark")
    t.box((-1.1, -0.25, -0.75), (1.1, -0.1, -0.6), "M_Paint_Red")                # defensa
    for y in (-1.6, -2.9):
        t.cyl((0, y, -0.7), 0.06, 2.0, "M_Steel_Dark", axis='X', seg=8)
        for s in (-1, 1):
            t.cyl((s * 1.0, y, -0.7), 0.5, 0.5, "M_Rubber", axis='X', seg=16)
            t.cyl((s * 1.26, y, -0.7), 0.28, 0.02, "M_Galvanized", axis='X', seg=12)
    for s in (-1, 1):
        t.box((s * 0.9 - 0.06, -11.2, -1.2), (s * 0.9 + 0.06, -11.05, -0.15), "M_Steel_Dark")
        t.box((s * 0.9 - 0.15, -11.3, -1.2), (s * 0.9 + 0.15, -10.95, -1.15), "M_Steel_Dark")
    return t.build(name, col, props={"wh_type": "trailer"})

def build_tree(name, col, h=6.0):
    t = MB()
    t.cyl((0, 0, h * 0.2), 0.15, h * 0.4, "M_Office_Wood", seg=8)
    t.cyl((0, 0, h * 0.5), h * 0.28, h * 0.45, "M_Foliage", seg=10, r2=h * 0.08)
    t.cyl((0, 0, h * 0.78), h * 0.2, h * 0.4, "M_Foliage", seg=10, r2=0.02)
    return t.build(name, col, props={"wh_type": "tree"})

# ---------------------------------------------------------------------
def create_building():
    W, D, H, T = CFG["W"], CFG["D"], CFG["H"], CFG["WALL_T"]
    YZ = CFG["YARD_Z"]
    cB = get_col("01_Building"); cD = get_col("10_Loading_Docks"); cE = get_col("14_Environment")
    cM = get_col("13_Floor_Marking")
    if "M_Grass" not in MAT:
        make_mat("M_Grass", (0.20, 0.33, 0.12), 0.0, 0.9)
        make_mat("M_Foliage", (0.10, 0.25, 0.08), 0.0, 0.8)

    # --- Piso y cimentación ---
    m = MB(uv_scale=0.25)
    m.box((0, 0, -0.02), (W, D, 0.0), "M_Concrete_Floor")
    m.build("Building_Floor_Slab", cB, props={"wh_type": "floor"})
    m = MB()
    m.box((-T, -T, YZ), (W + T, D + T, -0.01), "M_Concrete_Wall")
    m.build("Building_Foundation", cB)

    # --- Muros perimetrales (con huecos) ---
    docks = CFG["DOCKS_RECEIVING"] + CFG["DOCKS_DISPATCH"]
    dw, dh = CFG["DOCK_DOOR_W"], CFG["DOCK_DOOR_H"]
    win = lambda c: (c, 3.0, 6.5, 8.0)
    bays = [CFG["FRAME_STEP"] * (i + 0.5) for i in range(int(W / CFG["FRAME_STEP"]))]
    ybays = [7.5, 12.5, 17.5, 22.5, 27.5]
    op_S = [(c, dw, 0, dh) for c in docks]
    op_N = [win(c) for c in bays] + [(11.5, 1.0, 0, 2.1), (36.5, 1.0, 0, 2.1)]
    op_W = [win(c) for c in ybays] + [(4.0, 1.0, 0, 2.1), (11.0, 3.6, 0, 4.0)]
    op_E = [win(c) for c in ybays] + [(4.0, 1.0, 0, 2.1)]
    for nm, ax, l0, l1, t0, t1, ops in (
            ("Wall_South", 'X', -T, W + T, -T, 0, op_S), ("Wall_North", 'X', -T, W + T, D, D + T, op_N),
            ("Wall_West", 'Y', 0, D, -T, 0, op_W), ("Wall_East", 'Y', 0, D, W, W + T, op_E)):
        m = MB()
        wall(m, ax, l0, l1, t0, t1, 0.0, H, ops)
        if ax == 'Y':   # hastial (triángulo hasta la cumbrera)
            m.prism([(0, H), (D, H), (D / 2, zr(D / 2))], 'X', t0, t1, "M_Wall_Panel")
        m.build(nm, cB, props={"wh_type": "wall"})

    # --- Ventanas ---
    mF, mG = MB(), MB()
    for c in bays:
        window_unit(mF, mG, 'X', c, 3.0, 6.5, 8.0, D, D + T)
    for c in ybays:
        window_unit(mF, mG, 'Y', c, 3.0, 6.5, 8.0, -T, 0)
        window_unit(mF, mG, 'Y', c, 3.0, 6.5, 8.0, W, W + T)
    mF.build("Windows_Frames", cB); mG.build("Windows_Glass", cB)

    # --- Estructura metálica: columnas, marcos, largueros, contraventeo ---
    s = MB()
    step = CFG["FRAME_STEP"]
    xs = [i * step for i in range(int(W / step) + 1)]
    for x in xs:
        xc = min(max(x, 0.2), W - 0.2)
        for y0, y1 in ((0.0, 0.4), (D - 0.4, D)):
            s.box((xc - 0.15, y0, 0), (xc + 0.15, y1, zr(0) - 0.15), "M_Steel_Structure")
            s.box((xc - 0.25, y0 - 0.02 if y0 == 0 else y0, 0), (xc + 0.25, y1 + (0.02 if y1 == D else 0), 0.02), "M_Steel_Dark")
        for ya, yb in ((0.0, D / 2), (D / 2, D)):
            s.prism([(ya, zr(ya) - 0.75), (yb, zr(yb) - 0.6), (yb, zr(yb) - 0.15), (ya, zr(ya) - 0.15)], 'X', xc - 0.1, xc + 0.1, "M_Steel_Structure")
    s.build("Steel_Frames", cB, props={"wh_type": "structure"})
    p = MB()
    for y in [1.5 + 2.0 * i for i in range(14)] + [D / 2 - 0.3, D / 2 + 0.3]:
        if 0.4 < y < D - 0.4:
            p.box((0.0, y - 0.04, zr(y) - 0.15), (W, y + 0.04, zr(y) - 0.005), "M_Galvanized")
    # contraventeo en cruz en los marcos extremos (techo)
    for xa, xb in ((0.2, step), (W - step, W - 0.2)):
        for ya, yb in ((0.4, D / 2), (D / 2, D - 0.4)):
            p.bar((xa, ya, zr(ya) - 0.3), (xb, yb, zr(yb) - 0.3), 0.012, "M_Steel_Dark", seg=6)
            p.bar((xa, yb, zr(yb) - 0.3), (xb, ya, zr(ya) - 0.3), 0.012, "M_Steel_Dark", seg=6)
    p.build("Roof_Purlins_Bracing", cB)

    # --- Techo con claraboyas ---
    r, g = MB(), MB()
    ov, t = 0.6, 0.12
    sky_bays = [7.5, 17.5, 27.5, 37.5, 47.5]
    sky_y = [(6.0, 9.0), (21.0, 24.0)]
    xb = sorted({-ov, W + ov} | {c + d for c in sky_bays for d in (-1.5, 1.5)})
    def slab(mb, ya, yb, x0, x1, mat, th):
        mb.prism([(ya, zr(ya)), (yb, zr(yb)), (yb, zr(yb) + th), (ya, zr(ya) + th)], 'X', x0, x1, mat)
    for x0, x1 in zip(xb, xb[1:]):
        is_sky = any(abs((x0 + x1) / 2 - c) < 1.5 for c in sky_bays)
        cuts = [(-ov, D / 2), (D / 2, D + ov)]
        if is_sky:
            cuts = [(-ov, 6.0), (9.0, D / 2), (D / 2, 21.0), (24.0, D + ov)]
            for ya, yb in sky_y:
                slab(g, ya, yb, x0, x1, "M_Glass", 0.2)
        for ya, yb in cuts:
            slab(r, ya, yb, x0, x1, "M_Roof_Panel", t)
    r.box((-ov, D / 2 - 0.25, zr(D / 2) + t - 0.02), (W + ov, D / 2 + 0.25, zr(D / 2) + t + 0.06), "M_Metal_Grey")
    for y0, y1 in ((-ov - 0.2, -ov), (D + ov, D + ov + 0.2)):
        r.box((-ov, y0, H - 0.25), (W + ov, y1, H - 0.02), "M_Metal_Grey")
    for x, y in ((-T - 0.08, -T - 0.08), (W + T + 0.08, -T - 0.08), (-T - 0.08, D + T + 0.08), (W + T + 0.08, D + T + 0.08)):
        r.cyl((x, y, (YZ + H) / 2), 0.06, H - YZ, "M_Metal_Grey", seg=8)
    r.build("Roof_Panels", cB, props={"wh_type": "roof"})
    g.build("Roof_Skylights", cB, props={"wh_type": "skylight"})

    # --- Andenes (asset maestro + instancias) ---
    lD = lib_col("10_Loading_Docks")
    dock_master = build_rolling_door("Dock_Master", lD, dw, dh, True)
    LIB["Dock"] = dock_master
    for i, c in enumerate(CFG["DOCKS_RECEIVING"]):
        o = instance(dock_master, "Dock_R%02d" % (i + 1), (c, 0, 0), col=cD, props={"wh_zone": "Receiving", "wh_id": "R%d" % (i + 1)})
    for i, c in enumerate(CFG["DOCKS_DISPATCH"]):
        o = instance(dock_master, "Dock_D%02d" % (i + 1), (c, 0, 0), col=cD, props={"wh_zone": "Dispatch", "wh_id": "D%d" % (i + 1)})
    # Puerta del andén R01 y D02 abiertas (ejemplo de estado)
    for nm in ("Dock_R01_Door", "Dock_D02_Door"):
        o = bpy.data.objects[nm]; o.scale.z = 0.04; o["wh_open"] = 1.0
    # Rótulos de andén (exterior e interior)
    for i, c in enumerate(CFG["DOCKS_RECEIVING"] + CFG["DOCKS_DISPATCH"]):
        tag = ("R%d" % (i + 1)) if i < 3 else ("D%d" % (i - 2))
        pm = MB()
        pm.box((c - 0.45, -T - 0.04, 4.0), (c + 0.45, -T, 4.6), "M_Paint_Blue")
        pm.box((c - 0.6, 0.0, 4.0), (c + 0.6, 0.04, 4.6), "M_Paint_Blue")
        pm.build("Dock_%s_SignPlates" % tag, cD)
        text_mesh("Dock_%s_Label_Out" % tag, tag, 0.42, cD, "M_Paint_White", (c, -T - 0.045, 4.3), rot=(math.pi / 2, 0, 0))
        text_mesh("Dock_%s_Label_In" % tag, "ANDÉN " + tag, 0.28, cD, "M_Paint_White", (c, 0.045, 4.3), rot=(math.pi / 2, 0, math.pi))

    # --- Portón a nivel de piso y rampa (muro oeste) ---
    gd = build_rolling_door("GradeDoor_Master", lD, 3.6, 4.0, with_dock=False)
    LIB["GradeDoor"] = gd
    instance(gd, "Door_Grade_W01", (0, 11.0, 0), rot_z=-math.pi / 2, col=cD, props={"wh_id": "W1"})
    rp = MB()
    rp.prism([(-10.25, YZ), (-T, YZ), (-T, 0.0)], 'Y', 9.2, 12.8, "M_Concrete_Wall")
    for y0, y1 in ((9.0, 9.2), (12.8, 13.0)):
        rp.prism([(-10.25, YZ), (-T, YZ), (-T, 0.25), (-10.25, YZ + 0.25)], 'Y', y0, y1, "M_Safety_Yellow")
    rp.build("Ramp_West", cD, props={"wh_type": "ramp"})

    # --- Puertas peatonales y salidas de emergencia ---
    lB = lib_col("01_Building")
    pd = build_ped_door("PedDoor_Master", lB, False); LIB["PedDoor"] = pd
    ed = build_ped_door("EmergencyDoor_Master", lB, True); LIB["EmergencyDoor"] = ed
    instance(pd, "Door_Ped_W01", (0, 4.0, 0), rot_z=-math.pi / 2, col=cB)
    instance(pd, "Door_Ped_E01", (W, 4.0, 0), rot_z=math.pi / 2, col=cB)
    instance(ed, "Door_Emergency_N01", (11.5, D, 0), rot_z=math.pi, col=cB)
    instance(ed, "Door_Emergency_N02", (36.5, D, 0), rot_z=math.pi, col=cB)

    # --- Oficina de control en mezanine (sobre zona de carga de equipos) ---
    x0, y0, x1, y1 = ZONES["Office"]
    ox, oy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2, (y1 - y0) / 2
    zd = 3.0; zf = zd + 0.25; zt = zf + 2.75
    office = empty("Office_Control_Room", cB, (ox, oy, 0), 'PLAIN_AXES', 1.0, props={"wh_type": "office"})
    o = MB()
    o.box((-hx, -hy, zd), (hx, hy, zf), "M_Metal_Grey")                                       # losa
    o.box((-hx, hy, zd), (-hx + 1.2, hy + 1.1, zf), "M_Metal_Grey")                           # descanso escalera
    for px, py in ((-hx + 0.1, hy - 0.1), (0, hy - 0.1), (hx - 0.1, hy - 0.1), (hx - 0.1, 0), (-hx + 0.1, hy + 1.0)):
        o.box((px - 0.1, py - 0.1, 0), (px + 0.1, py + 0.1, zd), "M_Steel_Structure")
        o.cyl((px, py, 0.5), 0.17, 1.0, "M_Safety_Yellow", seg=12)
    o.box((-hx, hy - 0.3, zd - 0.35), (hx, hy, zd), "M_Steel_Structure")
    o.box((hx - 0.3, -hy, zd - 0.35), (hx, hy, zd), "M_Steel_Structure")
    # muros: oeste ciego; norte y este con ventanal
    o.box((-hx, -hy, zf), (-hx + 0.1, hy, zt), "M_Metal_White")
    def glazed(axis, a0, a1, fixed, door=None):
        segs = [(a0, a1)] if door is None else [(a0, door[0]), (door[1], a1)]
        for sa, sb in segs:
            if axis == 'X':
                o.box((sa, fixed - 0.05, zf), (sb, fixed + 0.05, zf + 1.0), "M_Metal_White")
                o.box((sa, fixed - 0.05, zt - 0.3), (sb, fixed + 0.05, zt), "M_Metal_White")
                o.box((sa, fixed - 0.01, zf + 1.0), (sb, fixed + 0.01, zt - 0.3), "M_Glass")
                a = sa
                while a <= sb + 1e-3:
                    o.box((a - 0.03, fixed - 0.05, zf + 1.0), (a + 0.03, fixed + 0.05, zt - 0.3), "M_Metal_Grey"); a += 1.5
            else:
                o.box((fixed - 0.05, sa, zf), (fixed + 0.05, sb, zf + 1.0), "M_Metal_White")
                o.box((fixed - 0.05, sa, zt - 0.3), (fixed + 0.05, sb, zt), "M_Metal_White")
                o.box((fixed - 0.01, sa, zf + 1.0), (fixed + 0.01, sb, zt - 0.3), "M_Glass")
                a = sa
                while a <= sb + 1e-3:
                    o.box((fixed - 0.05, a - 0.03, zf + 1.0), (fixed + 0.05, a + 0.03, zt - 0.3), "M_Metal_Grey"); a += 1.5
    glazed('X', -hx, hx, hy - 0.05, door=(-hx + 0.15, -hx + 1.05))
    glazed('Y', -hy, hy, hx - 0.05)
    o.box((-hx + 0.15, hy - 0.06, zt - 0.3), (-hx + 1.05, hy + 0.06, zt), "M_Metal_White")
    o.box((-hx, -hy, zt), (hx, hy, zt + 0.15), "M_Metal_White")                               # techo oficina
    o.box((-1.2, -0.6, zt - 0.02), (1.2, 0.6, zt), "M_Light_Emissive")
    # escalera (baja hacia +X por el lado norte)
    n = 13; rise = zf / n; run = 0.28
    sx0 = -hx + 1.2
    for i in range(n):
        xa = sx0 + i * run
        o.box((xa, hy + 0.05, zf - (i + 1) * rise - 0.04), (xa + run, hy + 1.05, zf - (i + 1) * rise), "M_Galvanized")
    xe = sx0 + n * run
    for yy in (hy + 0.02, hy + 1.08):
        o.sbar((sx0, yy, zf), (xe, yy, 0.0), 0.04, "M_Steel_Structure", h=0.25)
        o.bar((sx0, yy, zf + 1.0), (xe, yy, 1.0), 0.022, "M_Safety_Yellow")
        o.bar((xe, yy, 0.0), (xe, yy, 1.0), 0.022, "M_Safety_Yellow")
    for a, b_ in (((-hx, hy + 1.1), (-hx + 1.2, hy + 1.1)), ((-hx, hy), (-hx, hy + 1.1))):
        o.bar((a[0], a[1], zf + 1.0), (b_[0], b_[1], zf + 1.0), 0.022, "M_Safety_Yellow")
        o.bar((a[0], a[1], zf + 0.5), (b_[0], b_[1], zf + 0.5), 0.018, "M_Safety_Yellow")
        o.bar((a[0], a[1], zf), (a[0], a[1], zf + 1.0), 0.022, "M_Safety_Yellow")
    parent_to(o.build("Office_Structure", cB), office)
    dl = MB(); dl.box((0, -0.03, 0), (0.9, 0.03, 2.1), "M_Office_Wood"); dl.box((0.78, 0.03, 1.0), (0.86, 0.07, 1.04), "M_Galvanized")
    parent_to(dl.build("Office_Door_Leaf", cB, (-hx + 0.15, hy - 0.05, zf), props={"wh_type": "door_leaf"}), office)

    # --- Entorno exterior ---
    e = MB(uv_scale=0.1)
    e.box((-80, -70, YZ - 0.12), (130, 100, YZ - 0.04), "M_Grass")
    e.build("Ground_Grass", cE)
    a = MB(uv_scale=0.1)
    a.box((-25, -34, YZ - 0.04), (75, -T, YZ), "M_Asphalt")
    a.box((-25, -T, YZ - 0.04), (-T, 22, YZ), "M_Asphalt")
    a.box((W + T, -T, YZ - 0.03), (W + 4, D + 4, YZ), "M_Concrete_Wall")
    a.box((-T, D + T, YZ - 0.03), (W + T, D + 4, YZ), "M_Concrete_Wall")
    a.build("Yard_Asphalt", cE)
    ym = MB()
    for c in docks:
        for sx in (-1.75, 1.75):
            ym.box((c + sx - 0.06, -18.0, YZ), (c + sx + 0.06, -0.5, YZ + 0.005), "M_Paint_Yellow")
    for x in range(-20, 72, 4):
        ym.box((x, -24.06, YZ), (x + 2.0, -23.94, YZ + 0.005), "M_Paint_White")
    ym.build("Yard_Dock_Guides", cM)
    lE = lib_col("14_Environment")
    tr = build_trailer("Trailer_Master", lE); LIB["Trailer"] = tr
    instance(tr, "Trailer_R01", (CFG["DOCKS_RECEIVING"][0], -0.45, 0), col=cE, props={"wh_state": "unloading"})
    instance(tr, "Trailer_D02", (CFG["DOCKS_DISPATCH"][1], -0.45, 0), col=cE, props={"wh_state": "loading"})
    tm = build_tree("Tree_Master", lE); LIB["Tree"] = tm
    R = rng()
    k = 0
    for x in range(-30, 120, 9):
        for y in (-40.0, D + 12.0):
            k += 1
            instance(tm, "Tree_%02d" % k, (x + R.uniform(-2, 2), y + R.uniform(-3, 3), YZ - 0.04), col=cE).scale = (R.uniform(0.8, 1.2),) * 3
    for y in range(-20, 60, 10):
        k += 1
        instance(tm, "Tree_%02d" % k, (W + 15 + R.uniform(-2, 2), y, YZ - 0.04), col=cE)
    return {"objects": len(bpy.data.objects)}

def phase_building():
    return create_building()

# =====================================================================
#  SECCIÓN 02 · RACKS, PALLETS, CONTENEDORES Y CAJAS (biblioteca)
#  Todos los assets: origen en el centro inferior de su huella.
# =====================================================================

def _mb_boxm(self, M, m):
    """Caja unitaria transformada por una matriz arbitraria."""
    r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
    faces = {f for v in r["verts"] for f in v.link_faces}
    return self._tag(faces, m)
MB.boxm = _mb_boxm

# ---------------------------------------------------------------------
# RACKS
# ---------------------------------------------------------------------
def build_pallet_rack(name, col, bays):
    """Rack selectivo alto. Largo en X (bays bahías), fondo en Y.
    Incluye empties hijos *_Slot_B#_L#_P# en cada posición de pallet
    (origen del pallet = centro inferior) para colocar carga o simular."""
    L, D, H = CFG["RACK_BAY_L"], CFG["RACK_DEPTH"], CFG["RACK_H"]
    pw = 0.09; pitch = L + pw
    total = bays * pitch + pw
    x0 = -total / 2
    m = MB()
    for i in range(bays + 1):
        x = x0 + i * pitch
        xm = x + pw / 2
        for ya, yb in ((-D / 2, -D / 2 + 0.07), (D / 2 - 0.07, D / 2)):
            m.box((x, ya, 0), (x + pw, yb, H), "M_Metal_Blue")
            m.box((x - 0.03, ya - 0.03, 0), (x + pw + 0.03, yb + 0.03, 0.01), "M_Galvanized")
        # protector de poste (lado pasillo)
        m.box((x - 0.02, -D / 2 - 0.06, 0), (x + pw + 0.02, -D / 2 + 0.08, 0.45), "M_Safety_Yellow")
        # arriostramiento del marco (zig-zag)
        z = 0.15; up = True
        m.sbar((xm, -D / 2 + 0.07, 0.15), (xm, D / 2 - 0.07, 0.15), 0.03, "M_Metal_Blue")
        while z + 1.1 < H:
            ya, yb = (-D / 2 + 0.07, D / 2 - 0.07) if up else (D / 2 - 0.07, -D / 2 + 0.07)
            m.sbar((xm, ya, z), (xm, yb, z + 1.1), 0.028, "M_Metal_Blue")
            z += 1.1; up = not up
        m.sbar((xm, -D / 2 + 0.07, H - 0.1), (xm, D / 2 - 0.07, H - 0.1), 0.03, "M_Metal_Blue")
    slots = []
    for b in range(bays):
        xa = x0 + b * pitch + pw; xb = xa + L
        for li, z in enumerate(CFG["RACK_LEVELS"]):
            if z > 0:
                m.box((xa, -D / 2, z - 0.12), (xb, -D / 2 + 0.05, z), "M_Metal_Orange")
                m.box((xa, D / 2 - 0.05, z - 0.12), (xb, D / 2, z), "M_Metal_Orange")
                m.box((xa + 0.01, -D / 2 + 0.05, z - 0.012), (xb - 0.01, D / 2 - 0.05, z - 0.002), "M_Wire_Mesh")
            for p in (1, 2):
                cx = xa + L * (0.25 if p == 1 else 0.75)
                zl = z if z > 0 else 0.0
                lz = (z - 0.06) if z > 0 else 0.25
                m.label((cx, -D / 2 - (0.0 if z > 0 else 0.06), lz), 0.14, 0.07, '-Y', "M_Label_Barcode")
                slots.append(("B%d_L%d_P%d" % (b + 1, li + 1, p), (cx, 0.0, zl)))
    ob = m.build(name, col, props={"wh_type": "rack_pallet", "wh_bays": bays,
                                   "wh_levels": len(CFG["RACK_LEVELS"]), "wh_length": round(total, 3)})
    for sid, loc in slots:
        parent_to(empty(name + "_Slot_" + sid, col, loc, 'SINGLE_ARROW', 0.3,
                        props={"wh_type": "slot_pallet", "wh_slot": sid, "wh_occupied": 0}), ob)
    return ob

def build_shelf_rack(name, col, L, D, H, levels, post_mat, shelf_mat, round_posts=False,
                     wire=False, slots_per_level=3, kind="rack_medium"):
    """Estantería genérica (rack mediano, estantería baja, rack de cuarto frío)."""
    m = MB()
    pw = 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * (L / 2 - pw / 2), sy * (D / 2 - pw / 2)
            if round_posts:
                m.cyl((cx, cy, H / 2), 0.0127, H, post_mat, seg=8)
                m.cyl((cx, cy, 0.015), 0.022, 0.03, "M_Plastic_Black", seg=8)
            else:
                m.box((cx - pw / 2, cy - pw / 2, 0), (cx + pw / 2, cy + pw / 2, H), post_mat)
                m.box((cx - pw / 2 - 0.02, cy - pw / 2 - 0.02, 0), (cx + pw / 2 + 0.02, cy + pw / 2 + 0.02, 0.008), "M_Galvanized")
        if not round_posts:   # cruz de arriostre lateral
            m.sbar((sx * (L / 2 - pw / 2), -D / 2 + pw, 0.1), (sx * (L / 2 - pw / 2), D / 2 - pw, H * 0.5), 0.015, post_mat)
            m.sbar((sx * (L / 2 - pw / 2), D / 2 - pw, H * 0.5), (sx * (L / 2 - pw / 2), -D / 2 + pw, H - 0.1), 0.015, post_mat)
    slots = []
    for li, z in enumerate(levels):
        if wire:
            m.box((-L / 2 + 0.01, -D / 2 + 0.01, z - 0.004), (L / 2 - 0.01, D / 2 - 0.01, z), "M_Wire_Mesh")
            for sy in (-1, 1):
                m.bar((-L / 2, sy * (D / 2 - 0.012), z), (L / 2, sy * (D / 2 - 0.012), z), 0.006, post_mat, seg=6)
        else:
            m.box((-L / 2 + 0.01, -D / 2 + 0.01, z - 0.025), (L / 2 - 0.01, D / 2 - 0.01, z), shelf_mat)
            m.box((-L / 2 + pw, -D / 2 - 0.005, z - 0.06), (L / 2 - pw, -D / 2 + 0.01, z), "M_Metal_Orange" if kind == "rack_medium" else shelf_mat)
        for p in range(slots_per_level):
            cx = -L / 2 + L * (p + 0.5) / slots_per_level
            if not wire:
                m.label((cx, -D / 2 - 0.006, z - 0.03), 0.08, 0.04, '-Y', "M_Label_Barcode")
            slots.append(("L%d_P%d" % (li + 1, p + 1), (cx, 0.0, z)))
    ob = m.build(name, col, props={"wh_type": kind, "wh_levels": len(levels)})
    for sid, loc in slots:
        parent_to(empty(name + "_Slot_" + sid, col, loc, 'SINGLE_ARROW', 0.12,
                        props={"wh_type": "slot_shelf", "wh_slot": sid, "wh_occupied": 0}), ob)
    return ob

def create_racks():
    c = lib_col("02_Racks")
    for n in (1, 3, 5):
        LIB["Rack_Pallet_%dBay" % n] = build_pallet_rack("Rack_Pallet_%dBay" % n, c, n)
    LIB["Rack_Medium"] = build_shelf_rack("Rack_Medium_1Bay", c, 1.8, 0.6, 2.4,
                                          [0.15, 0.65, 1.15, 1.65, 2.15], "M_Metal_Blue", "M_Galvanized", kind="rack_medium")
    LIB["Shelf_Low"] = build_shelf_rack("Shelf_Low_Picking", c, 1.2, 0.5, 1.5,
                                        [0.1, 0.5, 0.9, 1.3], "M_Metal_White", "M_Metal_Grey", slots_per_level=3, kind="shelf_low")
    LIB["Rack_Cold"] = build_shelf_rack("Rack_Cold_Wire", c, 1.5, 0.6, 2.0,
                                        [0.15, 0.6, 1.05, 1.5, 1.95], "M_Galvanized", "M_Galvanized",
                                        round_posts=True, wire=True, slots_per_level=3, kind="rack_cold")

# ---------------------------------------------------------------------
# PALLETS (americano 1.0 x 1.2 m: 1.0 en X, 1.2 en Y)
# ---------------------------------------------------------------------
PAL_W, PAL_L, PAL_H = 1.0, 1.2, 0.144

def add_pallet(m, kind="wood"):
    w, l = PAL_W / 2, PAL_L / 2
    if kind == "wood":
        bt, sh = 0.019, 0.106
        for x in (-w + 0.02, 0, w - 0.02):
            m.box((x - 0.02, -l, bt), (x + 0.02, l, bt + sh), "M_Wood_Pallet")           # largueros
        for y in (-l + 0.07, 0, l - 0.07):
            m.box((-w, y - 0.07, 0), (w, y + 0.07, bt), "M_Wood_Pallet")                  # tablas inferiores
        n = 7
        for i in range(n):
            y = -l + 0.07 + i * (PAL_L - 0.14) / (n - 1)
            m.box((-w, y - 0.07, bt + sh), (w, y + 0.07, PAL_H), "M_Wood_Pallet")         # tablas superiores
    else:
        m.box((-w, -l, PAL_H - 0.035), (w, l, PAL_H), "M_Plastic_Blue")
        for x in (-w + 0.08, 0, w - 0.08):
            for y in (-l + 0.08, 0, l - 0.08):
                m.box((x - 0.07, y - 0.07, 0.025), (x + 0.07, y + 0.07, PAL_H - 0.035), "M_Plastic_Blue")
            m.box((x - 0.08, -l, 0), (x + 0.08, l, 0.025), "M_Plastic_Blue")

def stack(m, nx, ny, nz, bx, by, bz, z0, mat, gap=0.006, label=None, tape=True):
    """Apila cajas centradas sobre el pallet y devuelve la altura final."""
    ox = -(nx * bx) / 2; oy = -(ny * by) / 2
    for k in range(nz):
        for i in range(nx):
            for j in range(ny):
                xa, ya, za = ox + i * bx + gap / 2, oy + j * by + gap / 2, z0 + k * bz
                m.box((xa, ya, za), (xa + bx - gap, ya + by - gap, za + bz - 0.002), mat)
                if label and j == 0:
                    m.label((xa + bx / 2, ya, za + bz * 0.55), bx * 0.55, bz * 0.45, '-Y', label)
                if label and j == ny - 1:
                    m.label((xa + bx / 2, ya + by - gap, za + bz * 0.55), bx * 0.55, bz * 0.45, '+Y', label)
            if tape and k == nz - 1:
                for i in range(nx):
                    xa = ox + i * bx + gap / 2
                    m.box((xa + bx / 2 - 0.025, oy, z0 + nz * bz - 0.002), (xa + bx / 2 + 0.025, oy + ny * by - gap, z0 + nz * bz + 0.0005), "M_Tape")
    return z0 + nz * bz

def create_pallets():
    c = lib_col("03_Pallets")
    P = {}
    def mk(name, kind, fn=None, props=None):
        m = MB()
        add_pallet(m, kind)
        h = fn(m) if fn else PAL_H
        pr = {"wh_type": "pallet" if fn is None else "pallet_load", "wh_pallet": kind, "wh_height": round(h, 3)}
        pr.update(props or {})
        P[name] = LIB[name] = m.build(name, c, props=pr)
    mk("Pallet_Wood", "wood")
    mk("Pallet_Plastic", "plastic")
    def wrapped(hl):
        def f(m):
            top = stack(m, 2, 3, hl, 0.5, 0.4, 0.3, PAL_H, "M_Cardboard", tape=False)
            m.box((-PAL_W / 2 - 0.01, -PAL_L / 2 - 0.01, PAL_H - 0.03), (PAL_W / 2 + 0.01, PAL_L / 2 + 0.01, top + 0.01), "M_Stretch_Film")
            m.label((0, -PAL_L / 2 - 0.012, top - 0.25), 0.2, 0.12, '-Y', "M_Label_Barcode")
            return top + 0.01
        return f
    mk("Pallet_Load_Wrapped_A", "wood", wrapped(4), {"wh_content": "general"})
    mk("Pallet_Load_Wrapped_B", "wood", wrapped(5), {"wh_content": "general"})
    mk("Pallet_Load_Wrapped_Low", "wood", wrapped(2), {"wh_content": "general"})
    mk("Pallet_Load_MedBoxes", "plastic",
       lambda m: stack(m, 3, 4, 4, 0.333, 0.3, 0.26, PAL_H, "M_Cardboard_White", label="M_Label_Med"), {"wh_content": "medicine"})
    mk("Pallet_Load_MedBoxes_Low", "plastic",
       lambda m: stack(m, 3, 4, 2, 0.333, 0.3, 0.26, PAL_H, "M_Cardboard_White", label="M_Label_Med"), {"wh_content": "medicine"})
    def mixed(m):
        t = stack(m, 2, 3, 2, 0.5, 0.4, 0.35, PAL_H, "M_Cardboard_Light")
        return stack(m, 3, 3, 1, 0.33, 0.4, 0.25, t, "M_Cardboard", label="M_Label_Barcode")
    mk("Pallet_Load_Mixed", "wood", mixed, {"wh_content": "mixed"})
    mk("Pallet_Load_Cold", "plastic",
       lambda m: stack(m, 2, 3, 3, 0.5, 0.4, 0.32, PAL_H, "M_Plastic_White", label="M_Label_Cold", tape=False), {"wh_content": "cold_chain"})
    mk("Pallet_Load_Controlled", "plastic",
       lambda m: stack(m, 3, 4, 2, 0.333, 0.3, 0.26, PAL_H, "M_Cardboard_White", label="M_Label_Controlled"), {"wh_content": "controlled"})
    return P

# ---------------------------------------------------------------------
# CONTENEDORES PLÁSTICOS / TOTES / BINS
# ---------------------------------------------------------------------
def hollow(m, sx, sy, sz, mat, t=0.012, front_h=None):
    """Caja abierta por arriba (paredes delgadas). front_h = altura del frente (bins)."""
    m.box((-sx / 2, -sy / 2, 0), (sx / 2, sy / 2, t), mat)
    m.box((-sx / 2, sy / 2 - t, 0), (sx / 2, sy / 2, sz), mat)
    m.box((-sx / 2, -sy / 2, 0), (sx / 2, -sy / 2 + t, front_h or sz), mat)
    for s in (-1, 1):
        m.box((s * sx / 2 - (t if s > 0 else 0), -sy / 2, 0), (s * sx / 2 + (0 if s > 0 else t), sy / 2, sz), mat)

def create_containers():
    c = lib_col("03_Pallets")
    def tote(name, mat, lid=False, label=None, sx=0.6, sy=0.4, sz=0.32):
        m = MB()
        hollow(m, sx, sy, sz, mat)
        m.box((-sx / 2 - 0.01, -sy / 2 - 0.01, sz - 0.03), (sx / 2 + 0.01, sy / 2 + 0.01, sz), mat)   # labio
        for s in (-1, 1):
            m.box((s * (sx / 2 + 0.002) - 0.001, -0.06, sz - 0.1), (s * (sx / 2 + 0.002) + 0.001, 0.06, sz - 0.06), "M_Plastic_Black")
        if lid:
            m.box((-sx / 2 - 0.01, -sy / 2 - 0.01, sz), (sx / 2 + 0.01, sy / 2 + 0.01, sz + 0.02), mat)
        else:
            m.box((-sx / 2 + 0.03, -sy / 2 + 0.03, 0.012), (-0.02, sy / 2 - 0.03, 0.14), "M_Cardboard_White")
            m.box((0.02, -sy / 2 + 0.03, 0.012), (sx / 2 - 0.05, 0.0, 0.10), "M_Cardboard_White")
        m.label((0, -sy / 2 - 0.011, sz * 0.55), 0.16, 0.08, '-Y', label or "M_Label_Barcode")
        LIB[name] = m.build(name, c, props={"wh_type": "tote", "wh_size": [sx, sy, sz], "wh_stackable": 1})
    tote("Tote_Blue", "M_Plastic_Blue")
    tote("Tote_Grey_Lidded", "M_Plastic_Grey", lid=True)
    tote("Tote_Red_Controlled", "M_Plastic_Red", lid=True, label="M_Label_Controlled")
    tote("Container_Cold_Insulated", "M_Plastic_White", lid=True, label="M_Label_Cold", sx=0.6, sy=0.4, sz=0.4)
    for col_name, mat in (("Blue", "M_Plastic_Blue"), ("Red", "M_Plastic_Red"), ("Yellow", "M_Plastic_Yellow"), ("Green", "M_Plastic_Green")):
        m = MB()
        sx, sy, sz = 0.15, 0.35, 0.13
        hollow(m, sx, sy, sz, mat, t=0.006, front_h=sz * 0.55)
        m.box((-0.015, 0.02, 0.006), (0.04, 0.15, 0.08), "M_Cardboard_White")
        m.label((0, -sy / 2 - 0.002, sz * 0.35), 0.09, 0.03, '-Y', "M_Label_Barcode")
        LIB["Bin_Pick_" + col_name] = m.build("Bin_Pick_" + col_name, c, props={"wh_type": "bin", "wh_size": [sx, sy, sz]})

# ---------------------------------------------------------------------
# CAJAS (familias y variantes)
# ---------------------------------------------------------------------
def build_box(name, col, sx, sy, sz, kind="plain", mat="M_Cardboard"):
    """kind: plain | sealed | labeled | med | open | cold | controlled"""
    m = MB()
    if kind == "open":
        hollow(m, sx, sy, sz, mat, t=0.004)
        ft = 0.003
        for s in (-1, 1):   # solapas largas abiertas hacia afuera
            M = Matrix.Translation((0, s * sy / 2, sz)) @ Matrix.Rotation(-s * math.radians(60), 4, 'X') @ Matrix.Translation((0, s * sy / 4, 0)) @ Matrix.Diagonal((sx * 0.98, sy / 2, ft, 1))
            m.boxm(M, mat)
            M = Matrix.Translation((s * sx / 2, 0, sz)) @ Matrix.Rotation(s * math.radians(60), 4, 'Y') @ Matrix.Translation((s * sy / 4, 0, 0)) @ Matrix.Diagonal((sy / 2, sy * 0.96, ft, 1))
            m.boxm(M, mat)
        m.box((-sx / 2 + 0.02, -sy / 2 + 0.02, 0.004), (-0.01, sy / 2 - 0.02, sz * 0.5), "M_Cardboard_White")
        m.box((0.01, -sy / 2 + 0.02, 0.004), (sx / 2 - 0.02, 0.0, sz * 0.35), "M_Cardboard_White")
    else:
        m.box((-sx / 2, -sy / 2, 0), (sx / 2, sy / 2, sz), mat)
        if kind in ("sealed", "labeled", "med", "controlled"):
            m.box((-sx / 2 - 0.001, -0.025, sz), (sx / 2 + 0.001, 0.025, sz + 0.001), "M_Tape")
            for s in (-1, 1):
                m.box((s * sx / 2 - 0.001, -0.025, sz - 0.07), (s * sx / 2 + 0.001, 0.025, sz), "M_Tape")
        lab = {"labeled": "M_Label_Barcode", "med": "M_Label_Med", "cold": "M_Label_Cold",
               "controlled": "M_Label_Controlled"}.get(kind)
        if lab:
            m.label((0, -sy / 2, sz * 0.5), min(sx * 0.6, sz * 0.9), min(sz * 0.6, sx * 0.6), '-Y', lab)
            m.label((sx / 2, 0, sz * 0.5), min(sy * 0.5, 0.12), min(sz * 0.3, 0.06), '+X', "M_Label_Barcode")
    return m.build(name, col, props={"wh_type": "box", "wh_kind": kind, "wh_size": [sx, sy, sz]})

def create_boxes():
    c = lib_col("04_Boxes")
    spec = [
        # nombre,                 sx,   sy,   sz,   tipo,         material
        ("Box_Small_A",           0.30, 0.20, 0.15, "sealed",     "M_Cardboard"),
        ("Box_Small_B",           0.25, 0.25, 0.12, "labeled",    "M_Cardboard_Light"),
        ("Box_Medium_A",          0.40, 0.30, 0.25, "sealed",     "M_Cardboard"),
        ("Box_Medium_B",          0.45, 0.35, 0.30, "labeled",    "M_Cardboard_Light"),
        ("Box_Large_A",           0.60, 0.40, 0.40, "sealed",     "M_Cardboard"),
        ("Box_Large_B",           0.55, 0.45, 0.50, "labeled",    "M_Cardboard"),
        ("Box_Med_Small",         0.25, 0.18, 0.15, "med",        "M_Cardboard_White"),
        ("Box_Med_Medium",        0.35, 0.25, 0.20, "med",        "M_Cardboard_White"),
        ("Box_Med_Large",         0.50, 0.35, 0.30, "med",        "M_Cardboard_White"),
        ("Box_Open_Medium",       0.40, 0.30, 0.25, "open",       "M_Cardboard"),
        ("Box_Open_Large",        0.55, 0.40, 0.35, "open",       "M_Cardboard_Light"),
        ("Box_Plain_Medium",      0.40, 0.30, 0.30, "plain",      "M_Cardboard"),
        ("Box_Cold_EPS",          0.45, 0.35, 0.35, "cold",       "M_Plastic_White"),
        ("Box_Controlled",        0.30, 0.22, 0.18, "controlled", "M_Cardboard_White"),
    ]
    for n, sx, sy, sz, k, mat in spec:
        LIB[n] = build_box(n, c, sx, sy, sz, k, mat)

def phase_assets_1():
    create_racks(); create_pallets(); create_containers(); create_boxes()
    return {"lib": len(LIB), "objects": len(bpy.data.objects)}

# =====================================================================
#  SECCIÓN 03 · CARRITOS, TRANSPALETAS, MONTACARGAS, REACH TRUCK, AGV
#  Convención de vehículos: frente / uñas hacia +Y, origen en el piso
#  al centro del vehículo. Ruedas, mástil, carro portahorquillas,
#  cajones y plataformas de elevación son objetos hijos (animables).
# =====================================================================

def wheel_mesh_obj(name, col, r, w, rim="M_Galvanized", tire="M_Rubber", seg=16):
    """Rueda con eje en X y origen en el centro del eje."""
    m = MB()
    m.cyl((0, 0, 0), r, w, tire, axis='X', seg=seg)
    m.cyl((0, 0, 0), r * 0.55, w + 0.01, rim, axis='X', seg=max(8, seg // 2))
    return m.build(name, col, props={"wh_type": "wheel"})

def add_child(src, name, parent, loc, rot=(0, 0, 0), props=None):
    """Objeto hijo que comparte malla con 'src'."""
    ob = bpy.data.objects.new(name, src.data)
    for c in parent.users_collection:
        c.objects.link(ob); break
    ob.location = loc; ob.rotation_euler = rot
    for k, v in (props or {}).items():
        ob[k] = v
    return parent_to(ob, parent)

def caster_mesh_obj(name, col, r=0.075):
    """Rueda giratoria completa. Origen en la placa de montaje (arriba)."""
    m = MB()
    h = 2 * r + 0.05
    m.box((-0.05, -0.05, -0.01), (0.05, 0.05, 0.0), "M_Galvanized")
    m.cyl((0, 0, -0.025), 0.02, 0.03, "M_Galvanized", seg=8)
    for s in (-1, 1):
        m.box((s * 0.025 - 0.004, -0.045, -h + r + 0.01), (s * 0.025 + 0.004, 0.02, -0.04), "M_Galvanized")
    m.cyl((0, -0.02, -h + r), r, 0.035, "M_Rubber", axis='X', seg=14)
    m.cyl((0, -0.02, -h + r), r * 0.5, 0.04, "M_Plastic_Grey", axis='X', seg=8)
    return m.build(name, col, props={"wh_type": "caster"}), h

def build_picking_cart(name, col, tiers, caster):
    cs, ch = caster
    L, W = 0.95, 0.55
    m = MB()
    zs = [ch + 0.03 + i * (0.9 / max(1, tiers - 1)) * (0.75 if tiers == 3 else 0.7) for i in range(tiers)]
    zs = [ch + 0.03, ch + 0.45, ch + 0.85][:tiers] if tiers == 3 else [ch + 0.03, ch + 0.7]
    for z in zs:
        m.box((-L / 2, -W / 2, z), (L / 2, W / 2, z + 0.03), "M_Plastic_Grey")
        for s in (-1, 1):
            m.box((-L / 2, s * W / 2 - (0.02 if s > 0 else 0), z + 0.03), (L / 2, s * W / 2 + (0 if s > 0 else 0.02), z + 0.09), "M_Plastic_Grey")
        m.box((L / 2 - 0.02, -W / 2, z + 0.03), (L / 2, W / 2, z + 0.09), "M_Plastic_Grey")
    top = zs[-1] + 0.09
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.bar((sx * (L / 2 - 0.03), sy * (W / 2 - 0.03), zs[0]), (sx * (L / 2 - 0.03), sy * (W / 2 - 0.03), top), 0.014, "M_Galvanized")
    hx = -L / 2 - 0.02
    m.bar((hx, -W / 2 + 0.05, zs[0] + 0.05), (hx, -W / 2 + 0.05, 1.05), 0.014, "M_Galvanized")
    m.bar((hx, W / 2 - 0.05, zs[0] + 0.05), (hx, W / 2 - 0.05, 1.05), 0.014, "M_Galvanized")
    m.bar((hx, -W / 2 + 0.05, 1.05), (hx, W / 2 - 0.05, 1.05), 0.018, "M_Plastic_Black")
    m.box((hx - 0.01, -0.12, 0.85), (hx + 0.01, 0.12, 0.98), "M_Plastic_White")           # tablilla porta-orden
    m.cyl((hx - 0.06, 0.0, 0.92), 0.025, 0.04, "M_Plastic_Black", axis='X', seg=8)        # escáner en soporte
    ob = m.build(name, col, props={"wh_type": "cart_picking", "wh_tiers": tiers, "wh_speed": 1.0})
    for nm, x, y in (("FL", L / 2 - 0.07, W / 2 - 0.07), ("FR", L / 2 - 0.07, -W / 2 + 0.07), ("BL", -L / 2 + 0.07, W / 2 - 0.07), ("BR", -L / 2 + 0.07, -W / 2 + 0.07)):
        add_child(cs, name + "_Caster_" + nm, ob, (x, y, ch))
    for i, z in enumerate(zs):
        parent_to(empty(name + "_Slot_T%d" % (i + 1), col, (0, 0, z + 0.03), 'SINGLE_ARROW', 0.15, props={"wh_type": "slot_cart"}), ob)
    return ob

def build_platform_cart(name, col, caster):
    cs, ch = caster
    L, W = 1.2, 0.7
    m = MB()
    m.box((-L / 2, -W / 2, ch), (L / 2, W / 2, ch + 0.04), "M_Metal_Blue")
    m.box((-L / 2 + 0.01, -W / 2 + 0.01, ch + 0.04), (L / 2 - 0.01, W / 2 - 0.01, ch + 0.045), "M_Rubber")
    for s in (-1, 1):
        m.bar((-L / 2 - 0.02, s * (W / 2 - 0.05), ch + 0.04), (-L / 2 - 0.02, s * (W / 2 - 0.05), 0.95), 0.016, "M_Metal_Blue")
    m.bar((-L / 2 - 0.02, -W / 2 + 0.05, 0.95), (-L / 2 - 0.02, W / 2 - 0.05, 0.95), 0.02, "M_Plastic_Black")
    m.bar((-L / 2 - 0.02, -W / 2 + 0.05, 0.6), (-L / 2 - 0.02, W / 2 - 0.05, 0.6), 0.014, "M_Metal_Blue")
    ob = m.build(name, col, props={"wh_type": "cart_platform", "wh_capacity_kg": 300})
    for nm, x, y in (("FL", L / 2 - 0.08, W / 2 - 0.08), ("FR", L / 2 - 0.08, -W / 2 + 0.08), ("BL", -L / 2 + 0.08, W / 2 - 0.08), ("BR", -L / 2 + 0.08, -W / 2 + 0.08)):
        add_child(cs, name + "_Caster_" + nm, ob, (x, y, ch))
    parent_to(empty(name + "_Slot_Deck", col, (0, 0, ch + 0.045), 'SINGLE_ARROW', 0.2, props={"wh_type": "slot_cart"}), ob)
    return ob

def build_roll_cage(name, col, caster):
    cs, ch = caster
    L, W, H = 0.8, 0.7, 1.7
    m = MB()
    z0 = ch
    m.box((-L / 2, -W / 2, z0), (L / 2, W / 2, z0 + 0.05), "M_Galvanized")
    r = 0.014
    corners = [(-L / 2, -W / 2), (L / 2, -W / 2), (L / 2, W / 2), (-L / 2, W / 2)]
    for x, y in corners:
        m.bar((x, y, z0), (x, y, H), r, "M_Galvanized")
    for (xa, ya), (xb, yb) in zip(corners, corners[1:] + corners[:1]):
        if ya == yb == -W / 2:
            continue                                  # frente abierto
        m.bar((xa, ya, H), (xb, yb, H), r, "M_Galvanized")
        m.bar((xa, ya, (z0 + H) / 2), (xb, yb, (z0 + H) / 2), r * 0.8, "M_Galvanized")
        m.box((min(xa, xb) - 0.002, min(ya, yb) - 0.002, z0 + 0.05), (max(xa, xb) + 0.002, max(ya, yb) + 0.002, H), "M_Wire_Mesh")
    m.bar((-L / 2, -W / 2, 1.1), (L / 2, -W / 2, 1.1), 0.006, "M_Plastic_Yellow")   # cinta de retención
    ob = m.build(name, col, props={"wh_type": "cart_rollcage"})
    for nm, x, y in (("FL", L / 2 - 0.07, W / 2 - 0.07), ("FR", L / 2 - 0.07, -W / 2 + 0.07), ("BL", -L / 2 + 0.07, W / 2 - 0.07), ("BR", -L / 2 + 0.07, -W / 2 + 0.07)):
        add_child(cs, name + "_Caster_" + nm, ob, (x, y, ch))
    parent_to(empty(name + "_Slot_Deck", col, (0, 0, z0 + 0.05), 'SINGLE_ARROW', 0.2, props={"wh_type": "slot_cart"}), ob)
    return ob

def build_med_cart(name, col, caster):
    """Carrito de medicamentos con cajones (hijos *_Drawer_#: mover en -Y para abrir)."""
    cs, ch = caster
    L, W, H = 0.75, 0.52, 1.0
    m = MB()
    m.box((-L / 2, -W / 2 + 0.02, ch + 0.02), (L / 2, W / 2, H - 0.04), "M_Metal_White")
    m.box((-L / 2 - 0.02, -W / 2, H - 0.04), (L / 2 + 0.02, W / 2 + 0.02, H), "M_Plastic_Grey")
    for s in (-1, 1):
        m.box((s * (L / 2 + 0.02) - 0.01, -W / 2, H), (s * (L / 2 + 0.02) + 0.01, W / 2 + 0.02, H + 0.05), "M_Plastic_Grey")
    m.box((-L / 2 - 0.02, W / 2 - 0.01, H), (L / 2 + 0.02, W / 2 + 0.02, H + 0.05), "M_Plastic_Grey")
    for s in (-1, 1):
        m.bar((s * (L / 2 + 0.06), -0.15, 0.9), (s * (L / 2 + 0.06), 0.15, 0.9), 0.014, "M_Galvanized")
        m.box((s * (L / 2) - 0.0 , -0.16, 0.88), (s * (L / 2 + 0.06), -0.14, 0.92), "M_Galvanized") if s > 0 else m.box((-L / 2 - 0.06, -0.16, 0.88), (-L / 2, -0.14, 0.92), "M_Galvanized")
    m.box((-L / 2 - 0.02, -W / 2, ch), (L / 2 + 0.02, W / 2 + 0.02, ch + 0.04), "M_Plastic_Grey")    # defensa
    m.box((L / 2 - 0.1, -W / 2 + 0.01, H - 0.12), (L / 2 - 0.06, -W / 2 + 0.02, H - 0.08), "M_Light_Green")  # cerradura
    ob = m.build(name, col, props={"wh_type": "cart_medication", "wh_locked": 1})
    # Cajón (malla compartida)
    dm = MB()
    dh = 0.13
    dm.box((-L / 2 + 0.02, -0.02, 0.005), (L / 2 - 0.02, 0.0, dh - 0.005), "M_Plastic_Blue")
    dm.box((-0.08, -0.04, dh * 0.5 - 0.01), (0.08, -0.02, dh * 0.5 + 0.01), "M_Galvanized")
    dm.box((-L / 2 + 0.04, 0.0, 0.01), (L / 2 - 0.04, W - 0.06, dh * 0.7), "M_Plastic_Grey")
    first = None
    zc = ch + 0.06
    colors = ["M_Plastic_Blue", "M_Plastic_Blue", "M_Plastic_Green", "M_Plastic_Yellow", "M_Plastic_Red"]
    for i in range(5):
        z = zc + i * (dh + 0.012)
        if first is None:
            first = dm.build(name + "_Drawer_1", col, (0, -W / 2 + 0.02, z), props={"wh_type": "drawer", "wh_open": 0.0})
            parent_to(first, ob)
        else:
            d = add_child(first, name + "_Drawer_%d" % (i + 1), ob, (0, -W / 2 + 0.02, z), props={"wh_type": "drawer", "wh_open": 0.0})
    for nm, x, y in (("FL", L / 2 - 0.08, W / 2 - 0.08), ("FR", L / 2 - 0.08, -W / 2 + 0.1), ("BL", -L / 2 + 0.08, W / 2 - 0.08), ("BR", -L / 2 + 0.08, -W / 2 + 0.1)):
        add_child(cs, name + "_Caster_" + nm, ob, (x, y, ch))
    return ob

def build_pallet_jack(name, col, electric=False):
    """Transpaleta (manual o eléctrica). Uñas hacia +Y. Hijo *_Handle con pivote en la bomba."""
    m = MB()
    body = "M_Safety_Yellow" if electric else "M_Paint_Red"
    fl = 1.15; fw = 0.16; fz = 0.085; gap = 0.54
    for s in (-1, 1):
        x = s * (gap / 2 + fw / 2)
        m.box((x - fw / 2, 0.0, fz - 0.05), (x + fw / 2, fl, fz), "M_Steel_Dark" if electric else body)
        m.box((x - fw / 2 + 0.02, fl - 0.1, fz - 0.06), (x + fw / 2 - 0.02, fl - 0.06, fz - 0.05), "M_Steel_Dark")
        m.cyl((x, fl - 0.2, 0.04), 0.04, 0.12, "M_Plastic_Grey", axis='X', seg=10)
        m.cyl((x, 0.3, 0.04), 0.04, 0.12, "M_Plastic_Grey", axis='X', seg=10)
    m.box((-gap / 2 - fw, -0.08, fz - 0.05), (gap / 2 + fw, 0.05, fz + 0.06), body)
    if electric:
        m.box((-0.38, -0.75, 0.08), (0.38, -0.08, 1.15), body)
        m.box((-0.38, -0.78, 0.08), (0.38, -0.75, 1.15), "M_Safety_Black")
        m.box((-0.3, -0.7, 1.15), (0.3, -0.2, 1.2), "M_Safety_Black")
        m.box((-0.33, -1.2, 0.12), (0.33, -0.75, 0.2), "M_Rubber")                      # plataforma de operador
        for s in (-1, 1):
            m.bar((s * 0.33, -1.2, 0.2), (s * 0.33, -1.2, 1.05), 0.018, "M_Safety_Black")
            m.bar((s * 0.33, -1.2, 1.05), (s * 0.33, -0.78, 1.05), 0.018, "M_Safety_Black")
        m.cyl((0, -0.4, 0.12), 0.12, 0.08, "M_Rubber", axis='X', seg=14)
        m.box((-0.15, -0.79, 0.9), (0.15, -0.78, 1.05), "M_Screen")
        m.cyl((0.28, -0.5, 1.26), 0.035, 0.1, "M_Light_Amber", seg=10)
    else:
        m.cyl((0, -0.1, 0.35), 0.06, 0.55, body, seg=10)
        m.cyl((0, -0.1, 0.13), 0.1, 0.12, "M_Steel_Dark", seg=10)
        for s in (-1, 1):
            m.cyl((s * 0.08, -0.1, 0.09), 0.09, 0.05, "M_Rubber", axis='X', seg=14)
    ob = m.build(name, col, props={"wh_type": "pallet_jack_electric" if electric else "pallet_jack_manual",
                                   "wh_capacity_kg": 2000 if electric else 2500, "wh_fork_height": fz})
    h = MB()
    if electric:
        h.bar((0, 0, 0), (0, -0.35, 0.55), 0.025, "M_Safety_Black")
        h.box((-0.2, -0.42, 0.52), (0.2, -0.32, 0.62), "M_Safety_Black")
        parent_to(h.build(name + "_Tiller", col, (0, -0.65, 1.0)), ob)
    else:
        h.bar((0, 0, 0), (0, -0.45, 1.05), 0.02, body)
        h.bar((-0.15, -0.48, 1.1), (0.15, -0.48, 1.1), 0.025, "M_Plastic_Black")
        h.bar((-0.15, -0.48, 1.1), (0, -0.45, 1.0), 0.015, body); h.bar((0.15, -0.48, 1.1), (0, -0.45, 1.0), 0.015, body)
        parent_to(h.build(name + "_Handle", col, (0, -0.1, 0.62), props={"wh_type": "handle"}), ob)
    parent_to(empty(name + "_Fork_Point", col, (0, fl / 2, fz), 'SINGLE_ARROW', 0.3, props={"wh_type": "fork_point"}), ob)
    return ob

def build_forklift(name, col):
    """Montacargas contrapesado (~2.5 t). Jerarquía:
       root (chasis) -> Wheel_FL/FR/RL/RR, Mast -> Mast_Inner, Carriage (uñas)
       Animar: Carriage.location.z (elevación), Mast_Inner.location.z (mitad),
       Mast.rotation_euler.x (inclinación), Wheel_R*.rotation_euler.z (dirección)."""
    Y, K = "M_Safety_Yellow", "M_Safety_Black"
    m = MB()
    m.box((-0.5, -1.1, 0.18), (0.5, 0.85, 0.7), Y)                                   # chasis
    m.prism([(-1.38, 0.18), (-0.75, 0.18), (-0.75, 1.15), (-1.25, 1.15), (-1.38, 0.95)], 'X', -0.55, 0.55, K)  # contrapeso
    m.box((-0.46, -0.75, 0.7), (0.46, 0.15, 1.0), Y)                                  # cofre
    m.box((-0.24, -0.62, 1.0), (0.24, -0.2, 1.1), "M_Fabric_Dark")                    # asiento
    m.box((-0.24, -0.72, 1.05), (0.24, -0.62, 1.55), "M_Fabric_Dark")                 # respaldo
    m.box((-0.42, 0.15, 0.7), (0.42, 0.6, 0.98), K)                                   # tablero / piso operador
    m.bar((0, 0.35, 0.98), (0, 0.18, 1.35), 0.03, K)
    m.cyl((0, 0.16, 1.37), 0.16, 0.03, K, seg=16)
    for s in (-1, 1):
        m.box((s * 0.5 - (0.05 if s > 0 else 0), 0.25, 0.55), (s * 0.5 + (0 if s < 0 else 0.0) + (0.05 if s < 0 else 0), 0.95, 0.72), Y)  # salpicaderas
        m.bar((s * 0.47, -0.95, 1.05), (s * 0.47, -0.95, 2.15), 0.03, K)                 # postes traseros
        m.bar((s * 0.47, 0.62, 0.98), (s * 0.47, 0.38, 2.15), 0.03, K)                   # postes delanteros
        m.bar((s * 0.47, -0.95, 2.15), (s * 0.47, 0.38, 2.15), 0.03, K)
        m.box((s * 0.47 - 0.05, 0.6, 1.6), (s * 0.47 + 0.05, 0.66, 1.68), "M_Light_Emissive")  # faros
        m.box((s * 0.4 - 0.04, -1.39, 0.8), (s * 0.4 + 0.04, -1.37, 0.88), "M_Light_Red")
    for i in range(6):
        x = -0.4 + i * 0.16
        m.bar((x, -0.95, 2.17), (x, 0.38, 2.17), 0.012, K, seg=6)
    m.cyl((0, -0.6, 2.24), 0.06, 0.1, "M_Light_Amber", seg=10)                        # baliza
    m.box((-0.3, 0.7, 0.18), (0.3, 0.85, 0.3), K)
    m.label((0.5, -0.4, 0.45), 0.5, 0.18, '+X', "M_Label_Barcode")
    root = m.build(name, col, props={"wh_type": "forklift", "wh_capacity_kg": 2500, "wh_max_lift": 4.5,
                                     "wh_speed": 3.0, "wh_battery": 1.0, "wh_state": "idle"})
    wf = wheel_mesh_obj(name + "_Wheel_FL", col, 0.33, 0.24)
    parent_to(wf, root); wf.location = (0.42, 0.6, 0.33)
    add_child(wf, name + "_Wheel_FR", root, (-0.42, 0.6, 0.33))
    wr = wheel_mesh_obj(name + "_Wheel_RL", col, 0.24, 0.18)
    parent_to(wr, root); wr.location = (0.38, -0.85, 0.24)
    add_child(wr, name + "_Wheel_RR", root, (-0.38, -0.85, 0.24))
    # Mástil exterior (origen en pivote de inclinación)
    ma = MB()
    for s in (-1, 1):
        ma.box((s * 0.36 - 0.05, 0.0, 0.0), (s * 0.36 + 0.05, 0.12, 2.1), "M_Steel_Dark")
    ma.box((-0.41, 0.0, 2.0), (0.41, 0.12, 2.1), "M_Steel_Dark")
    ma.box((-0.41, 0.0, 0.0), (0.41, 0.12, 0.12), "M_Steel_Dark")
    ma.cyl((0, 0.06, 0.95), 0.05, 1.7, "M_Galvanized", seg=10)
    mast = parent_to(ma.build(name + "_Mast", col, (0, 0.9, 0.1), props={"wh_type": "mast"}), root)
    mi = MB()
    for s in (-1, 1):
        mi.box((s * 0.29 - 0.04, 0.12, 0.0), (s * 0.29 + 0.04, 0.2, 2.05), "M_Steel_Dark")
    mi.box((-0.33, 0.12, 1.95), (0.33, 0.2, 2.05), "M_Steel_Dark")
    parent_to(mi.build(name + "_Mast_Inner", col, (0, 0, 0.05), props={"wh_type": "mast_inner"}), mast)
    ca = MB()
    ca.box((-0.5, 0.0, 0.05), (0.5, 0.06, 0.55), "M_Steel_Dark")
    for i in range(6):
        x = -0.45 + i * 0.18
        ca.box((x - 0.02, 0.0, 0.55), (x + 0.02, 0.04, 1.25), "M_Steel_Dark")
    ca.box((-0.5, 0.0, 1.21), (0.5, 0.04, 1.25), "M_Steel_Dark")
    for s in (-1, 1):
        x = s * 0.3
        ca.box((x - 0.06, 0.06, 0.0), (x + 0.06, 0.105, 0.6), "M_Steel_Dark")
        ca.prism([(0.06, 0.0), (1.22, 0.0), (1.27, 0.02), (1.27, 0.035), (0.06, 0.045)], 'X', x - 0.06, x + 0.06, "M_Steel_Dark")
    car = parent_to(ca.build(name + "_Carriage", col, (0, 0.2, -0.1), props={"wh_type": "carriage", "wh_lift": 0.0}), mast)
    parent_to(empty(name + "_Fork_Point", col, (0, 0.75, 0.05), 'SINGLE_ARROW', 0.3, props={"wh_type": "fork_point"}), car)
    return root

def build_reach_truck(name, col):
    """Reach truck / apilador de pasillo angosto (mástil triple, alcance hasta 8 m)."""
    B, K = "M_Paint_Blue", "M_Safety_Black"
    m = MB()
    m.box((-0.6, -0.95, 0.12), (0.6, 0.35, 1.15), B)
    m.box((-0.6, -0.98, 0.12), (0.6, -0.95, 1.15), K)
    m.box((-0.55, -0.9, 0.12), (-0.05, -0.2, 0.2), "M_Rubber")                         # piso cabina (de pie)
    m.box((-0.58, -0.92, 0.2), (-0.05, -0.85, 1.25), K)
    m.box((0.0, -0.75, 1.15), (0.55, 0.3, 1.25), "M_Plastic_Grey")
    m.box((-0.05, -0.2, 0.95), (0.1, 0.25, 1.15), "M_Plastic_Grey")
    for s in (-1, 1):
        m.box((s * 0.48 - 0.07, 0.35, 0.0), (s * 0.48 + 0.07, 1.65, 0.28), B)          # estabilizadores
        m.cyl((s * 0.48, 1.5, 0.11), 0.11, 0.1, "M_Plastic_Grey", axis='X', seg=12)
    for x, y in ((-0.58, -0.9), (0.58, -0.9), (-0.58, 0.32), (0.58, 0.32)):
        m.bar((x, y, 1.15), (x, y, 2.25), 0.028, K)
    m.box((-0.62, -0.95, 2.22), (0.62, 0.35, 2.28), K)
    m.cyl((0.4, -0.6, 2.33), 0.06, 0.1, "M_Light_Amber", seg=10)
    m.cyl((0, -0.4, 0.13), 0.13, 0.15, "M_Rubber", axis='X', seg=14)
    m.box((-0.2, -0.86, 1.0), (0.2, -0.85, 1.15), "M_Screen")
    root = m.build(name, col, props={"wh_type": "reach_truck", "wh_capacity_kg": 1600, "wh_max_lift": 8.0, "wh_state": "idle"})
    ma = MB()
    for s in (-1, 1):
        ma.box((s * 0.36 - 0.05, 0.0, 0.0), (s * 0.36 + 0.05, 0.12, 3.4), "M_Steel_Dark")
        ma.box((s * 0.28 - 0.04, 0.12, 0.05), (s * 0.28 + 0.04, 0.2, 3.35), "M_Steel_Dark")
    ma.box((-0.41, 0.0, 3.3), (0.41, 0.2, 3.4), "M_Steel_Dark")
    mast = parent_to(ma.build(name + "_Mast", col, (0, 0.4, 0.12), props={"wh_type": "mast", "wh_reach": 0.0}), root)
    ca = MB()
    ca.box((-0.45, 0.0, 0.0), (0.45, 0.06, 0.5), "M_Steel_Dark")
    for s in (-1, 1):
        x = s * 0.28
        ca.box((x - 0.05, 0.06, -0.05), (x + 0.05, 0.1, 0.5), "M_Steel_Dark")
        ca.box((x - 0.05, 0.06, -0.1), (x + 0.05, 1.2, -0.06), "M_Steel_Dark")
    car = parent_to(ca.build(name + "_Carriage", col, (0, 0.22, 0.05), props={"wh_type": "carriage", "wh_lift": 0.0}), mast)
    parent_to(empty(name + "_Fork_Point", col, (0, 0.65, -0.06), 'SINGLE_ARROW', 0.3, props={"wh_type": "fork_point"}), car)
    return root

def build_agv_pallet(name, col):
    """AGV de bajo perfil que se mete bajo el pallet y lo eleva (hijo *_LiftPlate)."""
    m = MB()
    L, W, H = 1.25, 0.82, 0.3
    m.box((-W / 2, -L / 2, 0.03), (W / 2, L / 2, H), "M_Agv_Body")
    m.box((-W / 2 - 0.01, -L / 2 - 0.01, 0.03), (W / 2 + 0.01, L / 2 + 0.01, 0.1), "M_Plastic_Black")
    for s in (-1, 1):
        m.box((-W / 2 + 0.05, s * (L / 2 + 0.012) - 0.003, 0.15), (W / 2 - 0.05, s * (L / 2 + 0.012) + 0.003, 0.18), "M_Light_Green")
        m.box((s * (W / 2 + 0.012) - 0.003, -L / 2 + 0.1, 0.15), (s * (W / 2 + 0.012) + 0.003, L / 2 - 0.1, 0.18), "M_Light_Green")
    m.cyl((0, L / 2 - 0.08, H + 0.04), 0.045, 0.08, "M_Plastic_Black", seg=12)          # LiDAR
    m.box((-W / 2 + 0.03, L / 2 - 0.005, 0.12), (-W / 2 + 0.12, L / 2 + 0.006, 0.14), "M_Paint_Red")   # paro
    for s in (-1, 1):
        m.cyl((s * (W / 2 - 0.1), 0, 0.075), 0.075, 0.06, "M_Rubber", axis='X', seg=12)
    m.label((0, -L / 2 - 0.011, 0.22), 0.25, 0.06, '-Y', "M_Label_Barcode")
    root = m.build(name, col, props={"wh_type": "agv_pallet", "wh_capacity_kg": 1000, "wh_speed": 1.5, "wh_battery": 0.85, "wh_state": "idle"})
    lp = MB()
    lp.box((-W / 2 + 0.05, -L / 2 + 0.06, 0.0), (W / 2 - 0.05, L / 2 - 0.06, 0.03), "M_Steel_Dark")
    parent_to(lp.build(name + "_LiftPlate", col, (0, 0, H), props={"wh_type": "lift_plate", "wh_lift": 0.0}), root)
    return root

def build_amr_tote(name, col):
    """Robot móvil (AMR) para totes/bins con 3 charolas."""
    m = MB()
    L, W = 0.75, 0.55
    m.box((-W / 2, -L / 2, 0.04), (W / 2, L / 2, 0.32), "M_Agv_Body")
    m.box((-W / 2 - 0.01, -L / 2 - 0.01, 0.04), (W / 2 + 0.01, L / 2 + 0.01, 0.1), "M_Plastic_Black")
    m.box((-W / 2 + 0.02, L / 2, 0.2), (W / 2 - 0.02, L / 2 + 0.008, 0.23), "M_Light_Green")
    for s in (-1, 1):
        m.box((s * 0.22 - 0.02, -L / 2 + 0.05, 0.32), (s * 0.22 + 0.02, -L / 2 + 0.09, 1.55), "M_Metal_Grey")
    for z in (0.5, 0.95, 1.4):
        m.box((-W / 2 + 0.02, -L / 2 + 0.05, z - 0.02), (W / 2 - 0.02, L / 2 - 0.05, z), "M_Metal_Grey")
    m.box((-0.12, -L / 2 + 0.02, 1.25), (0.12, -L / 2 + 0.05, 1.42), "M_Screen")
    m.cyl((0, L / 2 - 0.06, 0.36), 0.04, 0.08, "M_Plastic_Black", seg=12)
    root = m.build(name, col, props={"wh_type": "amr_tote", "wh_capacity_kg": 60, "wh_speed": 1.2, "wh_state": "idle"})
    for i, z in enumerate((0.5, 0.95, 1.4)):
        parent_to(empty(name + "_Slot_T%d" % (i + 1), col, (0, 0, z), 'SINGLE_ARROW', 0.15, props={"wh_type": "slot_amr"}), root)
    return root

def build_charger(name, col, kind="forklift"):
    m = MB()
    if kind == "forklift":
        m.box((-0.3, -0.2, 0.0), (0.3, 0.2, 1.1), "M_Metal_Grey")
        m.box((-0.2, -0.205, 0.75), (0.2, -0.2, 0.95), "M_Screen")
        m.box((-0.25, -0.206, 0.55), (-0.15, -0.2, 0.6), "M_Light_Green")
        m.bar((0.2, -0.2, 0.4), (0.25, -0.6, 0.05), 0.02, "M_Rubber", seg=6)
        m.box((0.18, -0.65, 0.0), (0.32, -0.55, 0.08), "M_Paint_Red")
    else:
        m.box((-0.35, -0.08, 0.0), (0.35, 0.08, 0.45), "M_Metal_White")
        m.box((-0.25, -0.5, 0.0), (0.25, -0.08, 0.02), "M_Steel_Dark")
        for s in (-1, 1):
            m.box((s * 0.12 - 0.04, -0.15, 0.02), (s * 0.12 + 0.04, -0.08, 0.1), "M_Galvanized")
        m.box((-0.2, -0.085, 0.3), (0.2, -0.08, 0.36), "M_Light_Green")
    return m.build(name, col, props={"wh_type": "charger_" + kind})

def create_carts():
    c = lib_col("05_Carts")
    cs = caster_mesh_obj("Caster_Master", c)
    cb = caster_mesh_obj("Caster_Large_Master", c, 0.1)
    LIB["Cart_Picking_2Tier"] = build_picking_cart("Cart_Picking_2Tier", c, 2, cs)
    LIB["Cart_Picking_3Tier"] = build_picking_cart("Cart_Picking_3Tier", c, 3, cs)
    LIB["Cart_Platform"] = build_platform_cart("Cart_Platform", c, cb)
    LIB["Cart_RollCage"] = build_roll_cage("Cart_RollCage", c, cs)
    LIB["Cart_Medication"] = build_med_cart("Cart_Medication", c, cs)

def create_forklifts():
    c = lib_col("06_Forklifts")
    LIB["PalletJack_Manual"] = build_pallet_jack("PalletJack_Manual", c, False)
    LIB["PalletJack_Electric"] = build_pallet_jack("PalletJack_Electric", c, True)
    LIB["Forklift"] = build_forklift("Forklift_Counterbalance", c)
    LIB["ReachTruck"] = build_reach_truck("ReachTruck", c)
    LIB["AGV_Pallet"] = build_agv_pallet("AGV_Pallet", c)
    LIB["AMR_Tote"] = build_amr_tote("AMR_Tote", c)
    LIB["Charger_Forklift"] = build_charger("Charger_Forklift", c, "forklift")
    LIB["Charger_AGV"] = build_charger("Charger_AGV", c, "agv")

def phase_assets_2():
    create_carts(); create_forklifts()
    return {"lib": len(LIB), "objects": len(bpy.data.objects)}

# =====================================================================
#  SECCIÓN 04 · CONVEYORS, ESTACIONES DE TRABAJO Y SEGURIDAD (biblioteca)
# =====================================================================

CONV_W = 0.62      # ancho útil del transportador
CONV_Z = 0.80      # altura de trabajo (parte superior de rodillos)

def _conv_legs(m, y, z_top, w=CONV_W):
    for s in (-1, 1):
        x = s * (w / 2 + 0.03)
        m.box((x - 0.025, y - 0.025, 0.0), (x + 0.025, y + 0.025, z_top - 0.08), "M_Galvanized")
        m.box((x - 0.06, y - 0.06, 0.0), (x + 0.06, y + 0.06, 0.012), "M_Plastic_Black")
    m.box((-w / 2, y - 0.015, 0.25), (w / 2, y + 0.015, 0.28), "M_Galvanized")

def _conv_ports(name, col, ob, ports):
    """Empties de conexión: *_In / *_Out / *_Side (encadenar tramos)."""
    for nm, loc, rz in ports:
        e = empty(name + "_" + nm, col, loc, 'SINGLE_ARROW', 0.25, props={"wh_type": "conveyor_port", "wh_port": nm.lower()})
        e.rotation_euler = (math.pi / 2, 0, rz) if False else (0, 0, rz)
        parent_to(e, ob)

def build_conveyor_straight(name, col, length=2.0, belt=False):
    """Tramo recto. Flujo en +Y. Origen al centro inferior del tramo."""
    m = MB()
    L = length; w = CONV_W; z = CONV_Z
    for s in (-1, 1):
        x = s * (w / 2 + 0.03)
        m.box((x - 0.03, -L / 2, z - 0.12), (x + 0.03, L / 2, z + 0.01), "M_Galvanized")
        m.box((x - 0.01, -L / 2, z + 0.01), (x + 0.01, L / 2, z + 0.07), "M_Plastic_Yellow" if not belt else "M_Galvanized")
    if belt:
        m.box((-w / 2, -L / 2 + 0.05, z - 0.04), (w / 2, L / 2 - 0.05, z), "M_Rubber")
        for y in (-L / 2 + 0.05, L / 2 - 0.05):
            m.cyl((0, y, z - 0.02), 0.025, w, "M_Steel_Dark", axis='X', seg=10)
        m.box((w / 2 + 0.06, -0.15, z - 0.35), (w / 2 + 0.26, 0.15, z - 0.12), "M_Paint_Blue")   # motor
    else:
        n = int(L / 0.1)
        for i in range(n):
            y = -L / 2 + 0.05 + i * 0.1
            m.cyl((0, y, z - 0.025), 0.025, w, "M_Galvanized", axis='X', seg=8)
    for y in (-L / 2 + 0.15, L / 2 - 0.15):
        _conv_legs(m, y, z)
    ob = m.build(name, col, props={"wh_type": "conveyor_belt" if belt else "conveyor_roller",
                                   "wh_length": L, "wh_speed": 0.5, "wh_height": z})
    _conv_ports(name, col, ob, [("In", (0, -L / 2, z), 0.0), ("Out", (0, L / 2, z), 0.0)])
    return ob

def build_conveyor_curve(name, col, angle=90, rc=0.95):
    """Curva a la izquierda. Entra en (0,0) hacia +Y, gira 'angle' grados."""
    m = MB()
    w = CONV_W; z = CONV_Z
    C = Vector((-rc, 0, 0))
    a = math.radians(angle)
    def P(r, t, zz):
        return (C.x + r * math.cos(t), C.y + r * math.sin(t), zz)
    seg = 12
    for r, mat in ((rc - w / 2 - 0.03, "M_Galvanized"), (rc + w / 2 + 0.03, "M_Galvanized")):
        for i in range(seg):
            t0, t1 = a * i / seg, a * (i + 1) / seg
            m.sbar(P(r, t0, z - 0.05), P(r, t1, z - 0.05), 0.06, mat, h=0.12)
            m.sbar(P(r, t0, z + 0.04), P(r, t1, z + 0.04), 0.02, "M_Plastic_Yellow", h=0.06)
    nr = int(angle / 6)
    for i in range(nr):
        t = a * (i + 0.5) / nr
        m.bar(P(rc - w / 2, t, z - 0.025), P(rc + w / 2, t, z - 0.025), 0.025, "M_Galvanized", seg=8)
    for t in (a * 0.15, a * 0.85):
        for r in (rc - w / 2 - 0.03, rc + w / 2 + 0.03):
            p = P(r, t, 0)
            m.box((p[0] - 0.025, p[1] - 0.025, 0), (p[0] + 0.025, p[1] + 0.025, z - 0.1), "M_Galvanized")
            m.box((p[0] - 0.06, p[1] - 0.06, 0), (p[0] + 0.06, p[1] + 0.06, 0.012), "M_Plastic_Black")
    ob = m.build(name, col, props={"wh_type": "conveyor_curve", "wh_angle": angle, "wh_radius": rc})
    end = P(rc, a, z)
    _conv_ports(name, col, ob, [("In", (0, 0, z), 0.0), ("Out", end, a)])
    return ob

def build_conveyor_junction(name, col):
    """Unión / mesa de transferencia (bolas) con 3 puertos: In (-Y), Out (+Y), Side (+X)."""
    m = MB()
    s = CONV_W + 0.06; z = CONV_Z
    m.box((-s / 2, -s / 2, z - 0.12), (s / 2, s / 2, z - 0.04), "M_Galvanized")
    for i in range(5):
        for j in range(5):
            x = -s / 2 + 0.07 + i * (s - 0.14) / 4; y = -s / 2 + 0.07 + j * (s - 0.14) / 4
            m.cyl((x, y, z - 0.02), 0.022, 0.04, "M_Steel_Dark", seg=8)
    m.box((-s / 2 - 0.02, -s / 2, z - 0.04), (-s / 2, s / 2, z + 0.07), "M_Plastic_Yellow")
    for x in (-s / 2 + 0.05, s / 2 - 0.05):
        for y in (-s / 2 + 0.05, s / 2 - 0.05):
            m.box((x - 0.025, y - 0.025, 0), (x + 0.025, y + 0.025, z - 0.12), "M_Galvanized")
    m.box((s / 2 + 0.02, -0.2, z - 0.1), (s / 2 + 0.1, 0.2, z + 0.25), "M_Paint_Blue")       # desviador
    ob = m.build(name, col, props={"wh_type": "conveyor_junction"})
    _conv_ports(name, col, ob, [("In", (0, -s / 2, z), 0.0), ("Out", (0, s / 2, z), 0.0), ("Side", (s / 2, 0, z), -math.pi / 2)])
    return ob

def build_conveyor_leg(name, col):
    m = MB(); _conv_legs(m, 0, CONV_Z)
    return m.build(name, col, props={"wh_type": "conveyor_leg"})

def create_conveyors():
    c = lib_col("07_Conveyors")
    LIB["Conv_Straight_2m"] = build_conveyor_straight("Conveyor_Straight_2m", c, 2.0)
    LIB["Conv_Straight_1m"] = build_conveyor_straight("Conveyor_Straight_1m", c, 1.0)
    LIB["Conv_Belt_2m"] = build_conveyor_straight("Conveyor_Belt_2m", c, 2.0, belt=True)
    LIB["Conv_Curve_90"] = build_conveyor_curve("Conveyor_Curve_90", c, 90)
    LIB["Conv_Junction"] = build_conveyor_junction("Conveyor_Junction", c)
    LIB["Conv_Leg"] = build_conveyor_leg("Conveyor_Leg", c)

# ---------------------------------------------------------------------
# ESTACIONES DE TRABAJO
# ---------------------------------------------------------------------
def create_workstations():
    c = lib_col("08_Workstations")
    # Mesa de empaque (frente hacia -Y). Repisa superior para monitor/impresora.
    m = MB()
    L, D, H = 1.8, 0.8, 0.9
    m.box((-L / 2, -D / 2, H - 0.04), (L / 2, D / 2, H), "M_Plastic_White")
    m.box((-L / 2, -D / 2 - 0.005, H - 0.05), (L / 2, -D / 2 + 0.01, H), "M_Metal_Grey")
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * (L / 2 - 0.05) - 0.025, sy * (D / 2 - 0.05) - 0.025, 0), (sx * (L / 2 - 0.05) + 0.025, sy * (D / 2 - 0.05) + 0.025, H - 0.04), "M_Metal_Grey")
        m.box((sx * (L / 2 - 0.05) - 0.025, D / 2 - 0.08, H), (sx * (L / 2 - 0.05) + 0.025, D / 2 - 0.03, 1.75), "M_Metal_Grey")
    m.box((-L / 2 + 0.05, -D / 2 + 0.05, 0.2), (L / 2 - 0.05, D / 2 - 0.05, 0.23), "M_Metal_Grey")
    m.box((-L / 2, D / 2 - 0.4, 1.4), (L / 2, D / 2 - 0.02, 1.43), "M_Metal_Grey")
    m.box((-L / 2, D / 2 - 0.05, H), (L / 2, D / 2 - 0.03, 1.4), "M_Wire_Mesh")               # panel perforado
    m.cyl((-L / 2 + 0.1, 0.0, 1.62), 0.012, D * 0.8, "M_Galvanized", axis='Y', seg=6)
    m.cyl((-L / 2 + 0.1, 0.0, 1.62), 0.12, 0.6, "M_Cardboard_Light", axis='Y', seg=16)       # rollo de papel kraft
    for x in (L / 2 - 0.3, L / 2 - 0.55):
        m.box((x - 0.1, D / 2 - 0.35, 0.23), (x + 0.1, D / 2 - 0.08, 0.6), "M_Cardboard")
    LIB["Table_Packing"] = m.build("Table_Packing", c, props={"wh_type": "table_packing"})
    # Escritorio de control
    m = MB()
    L, D, H = 1.6, 0.75, 0.75
    m.box((-L / 2, -D / 2, H - 0.03), (L / 2, D / 2, H), "M_Office_Wood")
    for sx in (-1, 1):
        m.box((sx * L / 2 - (0.03 if sx > 0 else 0), -D / 2 + 0.03, 0), (sx * L / 2 + (0 if sx > 0 else 0.03), D / 2 - 0.03, H - 0.03), "M_Metal_Grey")
    m.box((L / 2 - 0.45, -D / 2 + 0.05, 0.05), (L / 2 - 0.03, D / 2 - 0.05, H - 0.03), "M_Metal_Grey")
    for z in (0.15, 0.37, 0.58):
        m.box((L / 2 - 0.42, -D / 2 + 0.045, z - 0.08), (L / 2 - 0.06, -D / 2 + 0.05, z + 0.08), "M_Metal_White")
    m.box((-L / 2 + 0.03, D / 2 - 0.05, 0.3), (L / 2 - 0.45, D / 2 - 0.03, H - 0.03), "M_Metal_Grey")
    LIB["Desk_Control"] = m.build("Desk_Control", c, props={"wh_type": "desk"})
    # Silla
    m = MB()
    for i in range(5):
        a = i * 2 * math.pi / 5
        m.sbar((0, 0, 0.08), (0.3 * math.cos(a), 0.3 * math.sin(a), 0.06), 0.035, "M_Plastic_Black")
        m.cyl((0.3 * math.cos(a), 0.3 * math.sin(a), 0.03), 0.03, 0.03, "M_Rubber", seg=8)
    m.cyl((0, 0, 0.27), 0.025, 0.4, "M_Galvanized", seg=8)
    m.box((-0.24, -0.24, 0.45), (0.24, 0.24, 0.53), "M_Fabric_Dark")
    m.box((-0.22, 0.2, 0.6), (0.22, 0.27, 1.05), "M_Fabric_Dark")
    m.box((-0.03, 0.22, 0.48), (0.03, 0.27, 0.62), "M_Plastic_Black")
    LIB["Chair_Office"] = m.build("Chair_Office", c, props={"wh_type": "chair"})
    # Monitor (pantalla hacia -Y)
    m = MB()
    m.box((-0.1, -0.08, 0), (0.1, 0.08, 0.015), "M_Plastic_Black")
    m.box((-0.02, 0.0, 0.015), (0.02, 0.03, 0.2), "M_Plastic_Black")
    m.box((-0.28, -0.02, 0.12), (0.28, 0.01, 0.46), "M_Plastic_Black")
    m.box((-0.265, -0.022, 0.135), (0.265, -0.02, 0.445), "M_Screen")
    LIB["Monitor"] = m.build("Monitor", c, props={"wh_type": "monitor", "wh_screen": "wms"})
    # Pantalla grande de pared (KPIs)
    m = MB()
    m.box((-0.75, 0.0, -0.45), (0.75, 0.06, 0.45), "M_Plastic_Black")
    m.box((-0.72, -0.002, -0.42), (0.72, 0.0, 0.42), "M_Screen")
    LIB["Screen_Wall"] = m.build("Screen_Wall_KPI", c, props={"wh_type": "screen_wall"})
    # Teclado y mouse
    m = MB()
    m.box((-0.22, -0.07, 0), (0.22, 0.07, 0.02), "M_Plastic_Black")
    m.box((-0.2, -0.06, 0.02), (0.2, 0.06, 0.024), "M_Plastic_Grey")
    m.box((0.28, -0.04, 0), (0.34, 0.05, 0.03), "M_Plastic_Black")
    LIB["Keyboard"] = m.build("Keyboard_Mouse", c, props={"wh_type": "keyboard"})
    # Impresora de etiquetas
    m = MB()
    m.box((-0.12, -0.15, 0), (0.12, 0.15, 0.18), "M_Plastic_Grey")
    m.box((-0.12, -0.15, 0.18), (0.12, 0.08, 0.2), "M_Plastic_Black")
    m.box((-0.06, -0.152, 0.1), (0.06, -0.15, 0.12), "M_Plastic_Black")
    m.box((-0.05, -0.25, 0.105), (0.05, -0.15, 0.107), "M_Label_Barcode")
    m.box((0.06, -0.152, 0.14), (0.09, -0.15, 0.16), "M_Light_Green")
    LIB["Printer_Label"] = m.build("Printer_Label", c, props={"wh_type": "label_printer"})
    # Lector de código de barras en base
    m = MB()
    m.box((-0.05, -0.05, 0), (0.05, 0.05, 0.03), "M_Plastic_Black")
    m.sbar((0, 0.0, 0.03), (0, -0.02, 0.15), 0.035, "M_Plastic_Black", h=0.05)
    m.box((-0.04, -0.12, 0.13), (0.04, 0.02, 0.19), "M_Plastic_Yellow")
    m.box((-0.035, -0.122, 0.14), (0.035, -0.12, 0.18), "M_Light_Red")
    LIB["Scanner"] = m.build("Scanner_Barcode", c, props={"wh_type": "scanner"})
    # Báscula de piso / mesa
    m = MB()
    m.box((-0.25, -0.25, 0), (0.25, 0.25, 0.06), "M_Steel_Dark")
    m.box((-0.24, -0.24, 0.06), (0.24, 0.24, 0.07), "M_Galvanized")
    m.box((-0.02, 0.21, 0.07), (0.02, 0.24, 0.4), "M_Steel_Dark")
    m.box((-0.1, 0.18, 0.4), (0.1, 0.24, 0.5), "M_Plastic_Grey")
    m.box((-0.08, 0.179, 0.42), (0.08, 0.18, 0.48), "M_Screen")
    LIB["Scale"] = m.build("Scale_Bench", c, props={"wh_type": "scale"})
    # Estantería auxiliar
    LIB["Shelf_Aux"] = build_shelf_rack("Shelf_Aux", c, 0.9, 0.4, 1.8, [0.1, 0.55, 1.0, 1.45], "M_Metal_Grey", "M_Metal_White",
                                        slots_per_level=2, kind="shelf_aux")
    # Material de empaque (rollo stretch, plástico burbuja, cartones planos, despachador de cinta)
    m = MB()
    m.cyl((0, 0, 0.25), 0.06, 0.5, "M_Stretch_Film", seg=12)
    m.cyl((0, 0, 0.25), 0.02, 0.52, "M_Cardboard", seg=8)
    m.cyl((0.25, 0, 0.3), 0.15, 0.6, "M_Glass", seg=14)
    for i in range(8):
        m.box((-0.35, 0.18, i * 0.012), (0.45, 0.78, i * 0.012 + 0.01), "M_Cardboard" if i % 2 else "M_Cardboard_Light")
    LIB["Packing_Supplies"] = m.build("Packing_Supplies", c, props={"wh_type": "packing_supplies"})
    m = MB()
    m.box((-0.06, -0.03, 0.06), (0.1, 0.03, 0.08), "M_Plastic_Red")
    m.cyl((0.0, 0.0, 0.08), 0.05, 0.05, "M_Tape", axis='Y', seg=12)
    m.sbar((-0.05, 0.0, 0.07), (-0.08, 0.0, 0.0), 0.025, "M_Plastic_Black")
    LIB["Tape_Gun"] = m.build("Tape_Gun", c, props={"wh_type": "tape_gun"})

# ---------------------------------------------------------------------
# SEGURIDAD
# Elementos de muro: origen al pie del muro, el elemento sobresale hacia +Y.
# ---------------------------------------------------------------------
def sign_plate(name, col, text, bg, fg="M_Paint_White", w=0.6, h=0.3, size=0.07, z=2.0, two_sided=False):
    m = MB()
    m.box((-w / 2, 0.0, z - h / 2), (w / 2, 0.012, z + h / 2), bg)
    ob = m.build(name, col, props={"wh_type": "sign", "wh_text": text})
    t = text_mesh(name + "_Text", text, size, col, fg, (0, 0.013, z), rot=(math.pi / 2, 0, math.pi))
    parent_to(t, ob)
    if two_sided:
        parent_to(text_mesh(name + "_TextB", text, size, col, fg, (0, -0.001, z), rot=(math.pi / 2, 0, 0)), ob)
    return ob

def create_safety_items():
    c = lib_col("09_Safety")
    # Extintor con soporte y señal
    m = MB()
    m.box((-0.12, 0.0, 0.9), (0.12, 0.02, 1.0), "M_Steel_Dark")
    m.cyl((0, 0.11, 0.62), 0.085, 0.55, "M_Paint_Red", seg=14)
    m.cyl((0, 0.11, 0.93), 0.03, 0.08, "M_Steel_Dark", seg=8)
    m.sbar((0.02, 0.11, 0.97), (0.1, 0.16, 0.6), 0.015, "M_Rubber")
    m.box((-0.15, 0.0, 1.5), (0.15, 0.01, 1.8), "M_Paint_Red")
    m.box((-0.2, -0.0, 0.0), (0.2, 0.25, 0.005), "M_Paint_Red")                      # área de piso
    ext = m.build("Fire_Extinguisher", c, props={"wh_type": "fire_extinguisher"})
    parent_to(text_mesh("Fire_Extinguisher_Text", "EXTINTOR", 0.045, c, "M_Paint_White", (0, 0.012, 1.65), rot=(math.pi / 2, 0, math.pi)), ext)
    LIB["Fire_Extinguisher"] = ext
    # Gabinete de manguera contra incendio
    m = MB()
    m.box((-0.4, 0.0, 0.9), (0.4, 0.22, 1.9), "M_Paint_Red")
    m.box((-0.36, 0.22, 0.95), (0.36, 0.225, 1.85), "M_Glass")
    m.cyl((0, 0.11, 1.4), 0.3, 0.12, "M_Paint_Red", axis='Y', seg=16)
    LIB["Fire_Hose_Cabinet"] = m.build("Fire_Hose_Cabinet", c, props={"wh_type": "fire_hose"})
    # Botiquín
    m = MB()
    m.box((-0.2, 0.0, 1.3), (0.2, 0.14, 1.7), "M_Plastic_White")
    m.box((-0.03, 0.14, 1.42), (0.03, 0.145, 1.58), "M_Paint_Green")
    m.box((-0.08, 0.14, 1.47), (0.08, 0.145, 1.53), "M_Paint_Green")
    LIB["First_Aid_Kit"] = m.build("First_Aid_Kit", c, props={"wh_type": "first_aid"})
    # Bolardo
    m = MB()
    m.cyl((0, 0, 0.6), 0.11, 1.2, "M_Safety_Yellow", seg=14)
    for z in (0.75, 0.95):
        m.cyl((0, 0, z), 0.112, 0.08, "M_Safety_Black", seg=14)
    m.cyl((0, 0, 1.21), 0.1, 0.02, "M_Safety_Yellow", seg=14, r2=0.06)
    LIB["Bollard"] = m.build("Bollard", c, props={"wh_type": "bollard"})
    # Barrera de protección vehicular (módulo 2 m, a lo largo de X)
    m = MB()
    for x in (-1.0, 1.0):
        m.box((x - 0.06, -0.06, 0), (x + 0.06, 0.06, 0.55), "M_Safety_Yellow")
        m.box((x - 0.12, -0.1, 0), (x + 0.12, 0.1, 0.012), "M_Safety_Black")
    for z in (0.18, 0.4):
        m.box((-1.0, -0.09, z - 0.08), (1.0, -0.06, z + 0.08), "M_Safety_Yellow")
    LIB["Barrier_Vehicle"] = m.build("Barrier_Vehicle_2m", c, props={"wh_type": "barrier_vehicle", "wh_length": 2.0})
    # Barandal peatonal (módulo 2 m)
    m = MB()
    for x in (-1.0, 1.0):
        m.bar((x, 0, 0), (x, 0, 1.1), 0.03, "M_Safety_Yellow")
    for z in (0.15, 0.6, 1.1):
        m.bar((-1.0, 0, z), (1.0, 0, z), 0.025, "M_Safety_Yellow")
    LIB["Barrier_Pedestrian"] = m.build("Barrier_Pedestrian_2m", c, props={"wh_type": "barrier_pedestrian", "wh_length": 2.0})
    # Cámara CCTV de muro (mira hacia +Y)
    m = MB()
    m.box((-0.06, 0.0, -0.08), (0.06, 0.02, 0.08), "M_Plastic_White")
    m.sbar((0, 0.02, 0.0), (0, 0.18, -0.02), 0.03, "M_Plastic_White")
    m.boxm(Matrix.Translation((0, 0.25, -0.05)) @ Matrix.Rotation(math.radians(-20), 4, 'X') @ Matrix.Diagonal((0.09, 0.24, 0.09, 1)), "M_Plastic_White")
    m.cyl((0, 0.37, -0.09), 0.03, 0.02, "M_Plastic_Black", axis='Y', seg=10)
    m.box((-0.008, 0.2, 0.0), (0.008, 0.22, 0.012), "M_Light_Red")
    LIB["CCTV"] = m.build("CCTV_Camera", c, props={"wh_type": "cctv", "wh_fov": 90})
    # Cámara domo (techo)
    m = MB()
    m.cyl((0, 0, -0.03), 0.09, 0.06, "M_Plastic_White", seg=14)
    m.cyl((0, 0, -0.08), 0.07, 0.05, "M_Plastic_Black", seg=14, r2=0.04)
    LIB["CCTV_Dome"] = m.build("CCTV_Dome", c, props={"wh_type": "cctv_dome"})
    # Lámpara de emergencia
    m = MB()
    m.box((-0.18, 0.0, 2.4), (0.18, 0.1, 2.52), "M_Plastic_White")
    for s in (-1, 1):
        m.cyl((s * 0.12, 0.12, 2.5), 0.045, 0.06, "M_Light_Emissive", axis='Y', seg=10)
    m.box((-0.02, 0.1, 2.42), (0.02, 0.102, 2.44), "M_Light_Green")
    LIB["Emergency_Light"] = m.build("Emergency_Light", c, props={"wh_type": "emergency_light"})
    # Letrero de salida colgante (doble cara)
    m = MB()
    m.box((-0.2, -0.03, -0.1), (0.2, 0.03, 0.1), "M_Light_Green")
    m.bar((0, 0, 0.1), (0, 0, 0.6), 0.008, "M_Galvanized", seg=6)
    ex = m.build("Exit_Sign_Hanging", c, props={"wh_type": "exit_sign"})
    parent_to(text_mesh("Exit_Sign_Hanging_TextA", "SALIDA ⟶".replace("⟶", ">"), 0.06, c, "M_Paint_White", (0, 0.031, 0.0), rot=(math.pi / 2, 0, math.pi)), ex)
    parent_to(text_mesh("Exit_Sign_Hanging_TextB", "< SALIDA", 0.06, c, "M_Paint_White", (0, -0.031, 0.0), rot=(math.pi / 2, 0, 0)), ex)
    LIB["Exit_Sign"] = ex
    # Espejo convexo de intersección
    m = MB()
    m.cyl((0, 0, 1.3), 0.035, 2.6, "M_Galvanized", seg=8)
    m.cyl((0, 0.05, 2.6), 0.32, 0.03, "M_Paint_Red", axis='Y', seg=20)
    m.cyl((0, 0.07, 2.6), 0.3, 0.02, "M_Galvanized", axis='Y', seg=20)
    m.box((-0.12, -0.12, 0), (0.12, 0.12, 0.01), "M_Steel_Dark")
    LIB["Safety_Mirror"] = m.build("Safety_Mirror", c, props={"wh_type": "mirror"})
    # Señales de muro
    LIB["Sign_Forklift"] = sign_plate("Sign_Caution_Forklifts", c, "PRECAUCIÓN\nMONTACARGAS", "M_Paint_Yellow", "M_Safety_Black", 0.6, 0.35, 0.07)
    LIB["Sign_Vest"] = sign_plate("Sign_Mandatory_PPE", c, "USO OBLIGATORIO\nCHALECO Y CALZADO", "M_Paint_Blue", w=0.7, h=0.35, size=0.055)
    LIB["Sign_Restricted"] = sign_plate("Sign_Restricted_Access", c, "ACCESO\nRESTRINGIDO", "M_Paint_Red", w=0.6, h=0.35, size=0.07)
    LIB["Sign_Cold"] = sign_plate("Sign_Cold_Zone", c, "CÁMARA FRÍA\n2 °C - 8 °C", "M_Paint_Blue", w=0.6, h=0.35, size=0.07)
    LIB["Sign_Speed"] = sign_plate("Sign_Speed_Limit", c, "VEL. MÁX\n8 km/h", "M_Paint_White", "M_Paint_Red", w=0.45, h=0.45, size=0.08)

def phase_assets_3():
    create_conveyors(); create_workstations(); create_safety_items()
    return {"lib": len(LIB), "objects": len(bpy.data.objects)}

# =====================================================================
#  SECCIÓN 05 · ENSAMBLAJE DEL ALMACÉN
#  Coloca instancias de la biblioteca según ZONES / CFG.
# =====================================================================

def W(loc, rz, p):
    """Convierte un punto local (p) de un objeto en (loc, rz) a coordenadas de mundo."""
    c, s = math.cos(rz), math.sin(rz)
    return (loc[0] + c * p[0] - s * p[1], loc[1] + s * p[0] + c * p[1], loc[2] + p[2])

def put(key, name, loc, rz=0.0, col=None, props=None):
    src = LIB[key] if isinstance(key, str) else key
    return instance(src, name, loc, rz, col, props)

def slots_of(ob):
    return [c for c in ob.children if str(c.get("wh_type", "")).startswith("slot")]

def fill(rack, loc, rz, chooser, col, prefix, R, prob):
    """Llena las posiciones de un rack con lo que devuelva chooser(slot)."""
    n = 0
    for s in slots_of(rack):
        if R.random() > prob:
            continue
        pick = chooser(s, R)
        if not pick:
            continue
        for key, off, drz in pick:
            p = W(loc, rz, (s.location.x + off[0], s.location.y + off[1], s.location.z + off[2]))
            sid = s.name.replace(rack.name + "_Slot_", "")
            put(key, "%s_%s_%d" % (prefix, sid, n), p, rz + drz, col, {"wh_slot_ref": s.name})
            n += 1
        s["wh_occupied"] = 1
    return n

# ---------------------------------------------------------------------
def assemble_storage(R):
    cR, cP = get_col("02_Racks"), get_col("03_Pallets")
    D = CFG["RACK_DEPTH"]; y0 = CFG["RACK_Y0"]
    L = LIB["Rack_Pallet_5Bay"]["wh_length"]
    yc = y0 + L / 2
    # (nombre, x_centro, rotación) -> rot +90: frente hacia +X ; -90: frente hacia -X
    rows = [("A1", 1.05, 90), ("A2", 5.65, -90), ("B1", 6.95, 90), ("B2", 11.55, -90), ("C1", 12.85, 90),
            ("C2", 17.45, -90), ("D1", 18.75, 90), ("D2", 23.35, -90), ("E1", 24.65, 90), ("E2", 29.25, -90)]
    loads = [("Pallet_Load_MedBoxes", 30), ("Pallet_Load_Wrapped_A", 20), ("Pallet_Load_Wrapped_B", 8),
             ("Pallet_Load_Mixed", 15), ("Pallet_Load_Wrapped_Low", 10), ("Pallet_Load_MedBoxes_Low", 12), ("Pallet_Wood", 5)]
    keys = [k for k, w in loads for _ in range(w)]
    total = 0
    for nm, x, deg in rows:
        rz = math.radians(deg)
        rack = put("Rack_Pallet_5Bay", "Rack_" + nm, (x, yc, 0), rz, cR, {"wh_aisle": nm[0], "wh_side": nm[1]})
        def ch(s, R):
            k = R.choice(keys)
            if "_L1_" in s.name and k == "Pallet_Wood":
                k = "Pallet_Load_MedBoxes"
            if "_L5_" not in s.name and k == "Pallet_Load_Wrapped_B" and "_L1_" not in s.name:
                k = "Pallet_Load_Wrapped_A"
            return [(k, (0, 0, 0), 0.0)]
        total += fill(rack, (x, yc, 0), rz, ch, cP, "Load_" + nm, R, CFG["RACK_FILL"])
    # Letreros colgantes de pasillo y protecciones de cabecera
    cS = get_col("09_Safety")
    for a, x in (("A", 3.35), ("B", 9.25), ("C", 15.15), ("D", 21.05), ("E", 26.95)):
        m = MB()
        m.box((-0.7, -0.03, -0.3), (0.7, 0.03, 0.3), "M_Paint_Blue")
        for s in (-0.5, 0.5):
            m.bar((s, 0, 0.3), (s, 0, 9.6 - 6.2), 0.008, "M_Galvanized", seg=6)
        sg = m.build("Aisle_Sign_" + a, cS, (x, 13.3, 6.2), props={"wh_type": "aisle_sign", "wh_aisle": a})
        parent_to(text_mesh("Aisle_Sign_%s_TextS" % a, "PASILLO " + a, 0.26, cS, "M_Paint_White", (0, -0.031, 0), rot=(math.pi / 2, 0, 0)), sg)
        parent_to(text_mesh("Aisle_Sign_%s_TextN" % a, "PASILLO " + a, 0.26, cS, "M_Paint_White", (0, 0.031, 0), rot=(math.pi / 2, 0, math.pi)), sg)
    for i, x in enumerate((6.3, 12.2, 18.1, 24.0)):
        put("Barrier_Vehicle", "Rack_EndGuard_%02d" % (i + 1), (x, y0 - 0.35, 0), 0, cS)
    for i, x in enumerate((1.05, 29.25)):
        put("Bollard", "Rack_EndBollard_%02d" % (i + 1), (x, y0 - 0.35, 0), 0, cS)
    return total

def assemble_picking(R):
    cR, cB, cP, cC = get_col("02_Racks"), get_col("04_Boxes"), get_col("03_Pallets"), get_col("05_Carts")
    n = 0
    box_keys = ["Box_Med_Small", "Box_Med_Medium", "Box_Small_A", "Box_Small_B", "Box_Medium_A", "Box_Med_Small", "Tote_Blue", "Tote_Grey_Lidded"]
    def ch_medium(s, R):
        k = R.choice(box_keys)
        if k.startswith("Tote"):
            return [(k, (0, 0, 0), math.pi / 2)]
        if k in ("Box_Med_Small", "Box_Small_A", "Box_Small_B") and R.random() < 0.5:
            h = LIB[k]["wh_size"][2]
            return [(k, (-0.12, 0, 0), 0.0), (k, (0.15, 0.05, 0), 0.1), (k, (-0.12, 0, h), 0.05)]
        return [(k, (0, 0, 0), R.uniform(-0.05, 0.05))]
    ys = [15.9 + 1.8 * i for i in range(5)]
    for row, x, deg in (("P1", 31.3, 90), ("P2", 33.7, -90), ("P3", 34.3, 90), ("P4", 36.7, -90), ("P5", 37.3, 90)):
        rz = math.radians(deg)
        for i, y in enumerate(ys):
            nm = "Rack_PK_%s_M%d" % (row, i + 1)
            rk = put("Rack_Medium", nm, (x, y, 0), rz, cR, {"wh_zone": "Picking"})
            n += fill(rk, (x, y, 0), rz, ch_medium, cB, "Item_" + nm[8:], R, 0.85)
    bins = ["Bin_Pick_Blue", "Bin_Pick_Red", "Bin_Pick_Yellow", "Bin_Pick_Green"]
    def ch_bins(s, R):
        k = R.choice(bins)
        return [(k, (-0.1, 0, 0), 0.0), (k, (0.1, 0, 0), 0.0)]
    # Estantería baja: columna este (frente -X) y muro norte (frente -Y), con hueco para la salida N02
    for i in range(7):
        y = 15.6 + 1.2 * i
        rk = put("Shelf_Low", "Shelf_PK_E_M%d" % (i + 1), (39.65, y, 0), -math.pi / 2, cR, {"wh_zone": "Picking"})
        n += fill(rk, (39.65, y, 0), -math.pi / 2, ch_bins, cB, "Bin_PKE%d" % (i + 1), R, 0.9)
    for i, x in enumerate((31.8, 33.0, 34.2, 38.4, 39.6)):
        rk = put("Shelf_Low", "Shelf_PK_N_M%d" % (i + 1), (x, 29.4, 0), math.pi, cR, {"wh_zone": "Picking"})
        n += fill(rk, (x, 29.4, 0), math.pi, ch_bins, cB, "Bin_PKN%d" % (i + 1), R, 0.9)
    # Estaciones de preparación de pedidos (frente hacia -Y, operador en el pasillo)
    cW = get_col("08_Workstations")
    for i, x in enumerate((32.4, 34.6, 38.6)):
        pre = "PickStation_%02d" % (i + 1)
        loc = (x, 26.2, 0)
        t = put("Table_Packing", pre + "_Table", loc, 0, cW, {"wh_zone": "Picking", "wh_station": pre})
        put("Monitor", pre + "_Monitor", W(loc, 0, (-0.45, 0.15, 0.9)), 0, cW)
        put("Keyboard", pre + "_Keyboard", W(loc, 0, (-0.45, -0.18, 0.9)), 0, cW)
        put("Printer_Label", pre + "_Printer", W(loc, 0, (0.55, 0.2, 1.43)), 0, cW)
        put("Scanner", pre + "_Scanner", W(loc, 0, (0.15, 0.15, 0.9)), 0, cW)
        put("Tote_Blue", pre + "_Tote", W(loc, 0, (0.45, -0.1, 0.9)), 0, cP)
    # Carritos de picking y AMR en pasillos
    put("Cart_Picking_3Tier", "Cart_Picking_01", (32.5, 19.0, 0), math.pi / 2, cC, {"wh_state": "picking"})
    put("Cart_Picking_2Tier", "Cart_Picking_02", (35.5, 22.5, 0), -math.pi / 2, cC, {"wh_state": "picking"})
    put("Cart_Picking_3Tier", "Cart_Picking_03", (38.5, 17.0, 0), math.pi / 2, cC, {"wh_state": "idle"})
    put("Cart_Picking_2Tier", "Cart_Picking_04", (33.0, 25.0, 0), 0, cC, {"wh_state": "idle"})
    for nm, p in (("Cart_Picking_01", 1), ("Cart_Picking_02", 1)):
        c = bpy.data.objects[nm]
        for s in slots_of(c):
            for j, k in enumerate(("Box_Med_Small", "Tote_Blue")[:p + 1]):
                put(k, "%s_%s_%d" % (nm, s.name[-2:], j), W(c.location, c.rotation_euler.z, (s.location.x + (j - 0.5) * 0.4, 0, s.location.z)),
                    c.rotation_euler.z + (math.pi / 2 if k.startswith("Tote") else 0), cB)
    put("AMR_Tote", "AMR_Tote_01", (36.0, 16.5, 0), 0, get_col("06_Forklifts"), {"wh_state": "moving"})
    return n

def assemble_packing(R):
    cW, cV, cB, cC = get_col("08_Workstations"), get_col("07_Conveyors"), get_col("04_Boxes"), get_col("05_Carts")
    y = 3.6; rz = -math.pi / 2          # flujo hacia +X
    xs = [23.4, 25.4, 27.4, 29.4, 31.4]
    for i, x in enumerate(xs):
        put("Conv_Straight_2m" if i != 2 else "Conv_Belt_2m", "Conveyor_Pack_%02d" % (i + 1), (x, y, 0), rz, cV, {"wh_line": "PACK"})
    put("Conv_Junction", "Conveyor_Pack_Junction", (32.74, y, 0), rz, cV, {"wh_line": "PACK"})
    put("Conv_Straight_1m", "Conveyor_Pack_06", (33.58, y, 0), rz, cV, {"wh_line": "PACK"})
    put("Conv_Curve_90", "Conveyor_Pack_Curve", (34.08, y, 0), rz, cV, {"wh_line": "PACK"})
    put("Conv_Straight_2m", "Conveyor_Pack_07", (35.03, y + 0.95 + 1.0, 0), 0, cV, {"wh_line": "PACK"})
    # cajas viajando por la línea
    for i, x in enumerate((22.9, 24.6, 26.9, 28.3, 30.8, 32.0)):
        k = R.choice(["Box_Med_Medium", "Box_Medium_A", "Box_Small_A", "Box_Med_Small"])
        put(k, "Box_OnConveyor_%02d" % (i + 1), (x, y + R.uniform(-0.08, 0.08), CONV_Z), R.uniform(-0.1, 0.1), cB, {"wh_state": "in_transit"})
    put("Box_Med_Large", "Box_OnConveyor_07", (35.03, 5.6, CONV_Z), 0.05, cB, {"wh_state": "in_transit"})
    # Mesas de empaque (operador hacia +Y)
    for i, x in enumerate(xs):
        pre = "PackStation_%02d" % (i + 1)
        loc = (x, 4.75, 0); r = math.pi
        put("Table_Packing", pre + "_Table", loc, r, cW, {"wh_zone": "Packing", "wh_station": pre})
        put("Monitor", pre + "_Monitor", W(loc, r, (-0.45, 0.15, 0.9)), r, cW)
        put("Keyboard", pre + "_Keyboard", W(loc, r, (-0.45, -0.18, 0.9)), r, cW)
        put("Printer_Label", pre + "_Printer", W(loc, r, (0.55, 0.2, 1.43)), r, cW)
        put("Scanner", pre + "_Scanner", W(loc, r, (0.05, 0.22, 0.9)), r, cW)
        put("Scale", pre + "_Scale", W(loc, r, (0.55, -0.05, 0.9)), r, cW)
        put("Tape_Gun", pre + "_TapeGun", W(loc, r, (-0.8, -0.2, 0.9)), r, cW)
        put(R.choice(["Box_Open_Medium", "Box_Open_Large"]), pre + "_BoxOpen", W(loc, r, (-0.0, -0.05, 0.9)), r, cB, {"wh_state": "packing"})
        put("Cart_Picking_2Tier", pre + "_Cart", W(loc, r, (0.2, -1.35, 0)), r + math.pi / 2, cC)
    # Estantería auxiliar con material de empaque junto al muro sur
    for i, x in enumerate((22.0, 23.2, 29.0, 30.2)):
        rk = put("Shelf_Aux", "Shelf_Pack_%02d" % (i + 1), (x, 0.5, 0), math.pi, cW)
        fill(rk, (x, 0.5, 0), math.pi, lambda s, R: [(R.choice(["Box_Plain_Medium", "Box_Small_B", "Box_Medium_B"]), (0, 0, 0), 0)],
             cB, "Box_PackShelf%d" % (i + 1), R, 0.8)
    for i, x in enumerate((25.0, 27.0)):
        put("Packing_Supplies", "Packing_Supplies_%02d" % (i + 1), (x, 0.9, 0), 0, cW)
    return 1

def assemble_dispatch(R):
    cP, cC, cF = get_col("03_Pallets"), get_col("05_Carts"), get_col("06_Forklifts")
    n = 0
    for lane, xc in zip(("D1", "D2", "D3"), CFG["DOCKS_DISPATCH"]):
        for r, yy in enumerate((2.6, 4.2, 5.8, 7.4)):
            for c, dx in enumerate((-0.6, 0.6)):
                if lane == "D2" and r == 0:
                    continue
                if R.random() < 0.8:
                    k = R.choice(["Pallet_Load_Wrapped_A", "Pallet_Load_Wrapped_Low", "Pallet_Load_MedBoxes", "Pallet_Load_Wrapped_A"])
                    put(k, "Load_Dispatch_%s_%d%d" % (lane, r + 1, c + 1), (xc + dx, yy, 0), 0, cP, {"wh_state": "ready_to_ship", "wh_dock": lane})
                    n += 1
    for i, (x, y) in enumerate(((35.4, 7.6), (34.7, 8.3))):
        cg = put("Cart_RollCage", "Cart_RollCage_%02d" % (i + 1), (x, y, 0), R.uniform(-0.2, 0.2), cC, {"wh_zone": "Dispatch"})
        for j in range(3):
            put(R.choice(["Box_Med_Medium", "Box_Medium_A"]), "Cart_RollCage_%02d_Box%d" % (i + 1, j),
                (x + (j - 1) * 0.22, y, 0.23 + (0.0 if j != 1 else 0.0)), cg.rotation_euler.z, get_col("04_Boxes"))
    # Montacargas cargando el tráiler del andén D02 (con pallet en las uñas)
    fk = put("Forklift", "Forklift_02", (42.5, 3.4, 0), math.pi, cF, {"wh_state": "loading", "wh_zone": "Dispatch"})
    bpy.context.view_layer.update()
    car = bpy.data.objects["Forklift_02_Carriage"]
    fp = bpy.data.objects["Forklift_02_Fork_Point"]
    ld = put("Pallet_Load_Wrapped_A", "Load_OnForklift_02", fp.matrix_world.translation + Vector((0, 0, 0.045)), math.pi, cP, {"wh_carried_by": "Forklift_02"})
    bpy.context.view_layer.update()
    mw = ld.matrix_world.copy(); ld.parent = car; ld.matrix_world = mw
    put("PalletJack_Electric", "PalletJack_Electric_02", (46.0, 7.0, 0), math.pi * 0.8, cF, {"wh_zone": "Dispatch"})
    return n

def assemble_receiving(R):
    cP, cF, cW = get_col("03_Pallets"), get_col("06_Forklifts"), get_col("08_Workstations")
    n = 0
    for lane, xc in zip(("R1", "R2", "R3"), CFG["DOCKS_RECEIVING"]):
        for r, yy in enumerate((3.2, 4.8, 6.4)):
            for c, dx in enumerate((-0.6, 0.6)):
                if R.random() < 0.7:
                    k = R.choice(["Pallet_Load_Wrapped_B", "Pallet_Load_Mixed", "Pallet_Load_Wrapped_A", "Pallet_Load_MedBoxes"])
                    put(k, "Load_Receiving_%s_%d%d" % (lane, r + 1, c + 1), (xc + dx, yy, 0), R.uniform(-0.03, 0.03), cP, {"wh_state": "received", "wh_dock": lane})
                    n += 1
    # pallets dentro del tráiler R01
    x0 = CFG["DOCKS_RECEIVING"][0]
    for i, yy in enumerate((-2.4, -3.7, -5.0, -6.3)):
        for c, dx in enumerate((-0.62, 0.62)):
            put(R.choice(["Pallet_Load_Wrapped_A", "Pallet_Load_MedBoxes"]), "Load_Trailer_R01_%d%d" % (i + 1, c + 1), (x0 + dx, yy, 0), 0, cP, {"wh_state": "in_trailer"})
    put("PalletJack_Electric", "PalletJack_Electric_01", (x0, 1.2, 0), math.pi, cF, {"wh_state": "unloading", "wh_zone": "Receiving"})
    put("PalletJack_Manual", "PalletJack_Manual_01", (10.2, 1.5, 0), math.pi * 1.1, cF, {"wh_zone": "Receiving"})
    fk = put("Forklift", "Forklift_01", (7.5, 7.6, 0), -math.pi / 2, cF, {"wh_state": "moving", "wh_zone": "Receiving"})
    bpy.context.view_layer.update()
    fp = bpy.data.objects["Forklift_01_Fork_Point"]
    ld = put("Pallet_Load_MedBoxes", "Load_OnForklift_01", fp.matrix_world.translation + Vector((0, 0, 0.045)), -math.pi / 2, cP, {"wh_carried_by": "Forklift_01"})
    bpy.context.view_layer.update()
    car = bpy.data.objects["Forklift_01_Carriage"]
    mw = ld.matrix_world.copy(); ld.parent = car; ld.matrix_world = mw
    # Mesa de verificación de recepción
    loc = (13.6, 8.1, 0)
    put("Table_Packing", "ReceivingDesk_Table", loc, math.pi, cW, {"wh_zone": "Receiving"})
    put("Monitor", "ReceivingDesk_Monitor", W(loc, math.pi, (-0.45, 0.15, 0.9)), math.pi, cW)
    put("Keyboard", "ReceivingDesk_Keyboard", W(loc, math.pi, (-0.45, -0.18, 0.9)), math.pi, cW)
    put("Printer_Label", "ReceivingDesk_Printer", W(loc, math.pi, (0.55, 0.2, 1.43)), math.pi, cW)
    put("Scanner", "ReceivingDesk_Scanner", W(loc, math.pi, (0.2, 0.1, 0.9)), math.pi, cW)
    put("Pallet_Wood", "Pallet_Empty_Stack_01", (13.8, 1.0, 0), 0, cP)
    for i in range(1, 6):
        put("Pallet_Wood", "Pallet_Empty_Stack_01_%d" % i, (13.8, 1.0, PAL_H * i), 0, cP)
    for i in range(4):
        put("Pallet_Plastic", "Pallet_Empty_Stack_02_%d" % i, (13.8, 2.4, PAL_H * i), 0, cP)
    return n

def assemble_charging():
    cF = get_col("06_Forklifts")
    for i, x in enumerate((15.9, 17.6)):
        put("Charger_Forklift", "Charger_Forklift_%02d" % (i + 1), (x, 0.45, 0), math.pi, cF, {"wh_zone": "Charging"})
    for i, x in enumerate((19.3, 20.4)):
        put("Charger_AGV", "Charger_AGV_%02d" % (i + 1), (x, 0.33, 0), math.pi, cF, {"wh_zone": "Charging"})
    put("Forklift", "Forklift_03", (15.9, 3.05, 0), math.pi, cF, {"wh_state": "charging", "wh_battery": 0.35})
    put("ReachTruck", "ReachTruck_02", (17.6, 2.4, 0), math.pi, cF, {"wh_state": "charging", "wh_battery": 0.6})
    put("AGV_Pallet", "AGV_Pallet_01", (19.3, 1.3, 0), 0, cF, {"wh_state": "charging", "wh_battery": 0.4})
    put("AGV_Pallet", "AGV_Pallet_02", (20.4, 1.3, 0), 0, cF, {"wh_state": "charging", "wh_battery": 0.9})
    # Reach truck trabajando en el pasillo C con las uñas elevadas
    rt = put("ReachTruck", "ReachTruck_01", (15.15, 20.0, 0), math.pi / 2, cF, {"wh_state": "putaway", "wh_aisle": "C"})
    bpy.data.objects["ReachTruck_01_Carriage"].location.z = 2.6
    bpy.data.objects["ReachTruck_01_Carriage"]["wh_lift"] = 2.55
    put("AGV_Pallet", "AGV_Pallet_03", (24.0, 11.5, 0), -math.pi / 2, cF, {"wh_state": "moving"})
    put("Pallet_Load_MedBoxes_Low", "Load_OnAGV_03", (24.0, 11.5, 0.33), -math.pi / 2, get_col("03_Pallets"), {"wh_carried_by": "AGV_Pallet_03"})

def assemble_cold_room(R):
    c = get_col("11_Cold_Storage")
    x0, y0, x1, y1 = ZONES["Cold_Storage"]
    t, H = 0.15, 4.0
    dc, dw, dh = 45.8, 2.4, 3.0
    root = empty("Cold_Room", c, ((x0 + x1) / 2, (y0 + y1) / 2, 0), 'CUBE', 0.5,
                 props={"wh_type": "cold_room", "wh_temp_min": 2.0, "wh_temp_max": 8.0, "wh_temp": 4.2})
    ox, oy = root.location.x, root.location.y
    m = MB()
    def bx(a, b, mat="M_Insulated_Panel"):
        m.box((a[0] - ox, a[1] - oy, a[2]), (b[0] - ox, b[1] - oy, b[2]), mat)
    bx((x0, y0, 0), (dc - dw / 2, y0 + t, H)); bx((dc + dw / 2, y0, 0), (x1, y0 + t, H)); bx((dc - dw / 2, y0, dh), (dc + dw / 2, y0 + t, H))
    bx((x0, y0 + t, 0), (x0 + t, y1, H)); bx((x0 + t, y1 - t, 0), (x1, y1, H)); bx((x1 - t, y0 + t, 0), (x1, y1 - t, H))
    bx((x0, y0, H), (x1, y1, H + 0.15))
    xx = x0 + 1.2
    while xx < x1:
        if not (dc - dw / 2 - 0.05 < xx < dc + dw / 2 + 0.05):
            bx((xx - 0.01, y0 - 0.004, 0), (xx + 0.01, y0, H), "M_Plastic_Grey")
        xx += 1.2
    yy = y0 + 1.2
    while yy < y1:
        bx((x0 - 0.004, yy - 0.01, 0), (x0, yy + 0.01, H), "M_Plastic_Grey"); yy += 1.2
    bx((x0 - 0.02, y0 - 0.02, 0), (x1, y0 + t + 0.02, 0.15), "M_Plastic_Grey")
    bx((x0 - 0.02, y0, 0), (x0 + t + 0.02, y1, 0.15), "M_Plastic_Grey")
    bx((x0 + t, y0 + t, 0.0), (x1 - t, y1 - t, 0.008), "M_Plastic_Grey")                       # piso aislado
    bx((x0 + 0.6, y0 + t + 0.4, H - 0.01), (x0 + 2.0, y0 + t + 0.7, H), "M_Light_Emissive")
    for ly in (23.0, 27.0):
        for lx in (43.8, 47.8):
            bx((lx - 0.6, ly - 0.15, H - 0.01), (lx + 0.6, ly + 0.15, H), "M_Light_Emissive")
    bx((dc - dw / 2 - 0.3, y0 - 0.12, dh + 0.15), (x0 + 0.0 if False else dc + dw / 2 + 0.6, y0 - 0.02, dh + 0.25), "M_Galvanized")   # riel de puerta
    for i in range(10):                                                                             # cortina de tiras PVC
        xs = dc - dw / 2 + 0.12 + i * (dw - 0.24) / 9
        bx((xs - 0.1, y0 + t + 0.02, 0.05), (xs + 0.1, y0 + t + 0.025, dh), "M_Stretch_Film")
    parent_to(m.build("Cold_Room_Enclosure", c, (0, 0, 0), props={"wh_type": "cold_room_panels"}), root)
    d = MB()
    d.box((-1.3, -0.06, 0.0), (1.3, 0.06, dh + 0.1), "M_Insulated_Panel")
    d.box((-1.32, -0.08, 0.0), (1.32, -0.06, 0.25), "M_Galvanized")
    d.box((0.9, -0.13, 1.0), (0.95, -0.06, 1.4), "M_Galvanized")
    door = d.build("Cold_Room_Door", c, (dc - 2.6, y0 - 0.1, 0), props={"wh_type": "door_sliding", "wh_open": 1.0, "wh_closed_x": dc})
    # Panel de temperatura
    p = MB()
    p.box((-0.18, -0.04, 1.45), (0.18, 0.0, 1.75), "M_Plastic_Black")
    p.box((-0.15, -0.042, 1.5), (0.15, -0.04, 1.7), "M_Screen")
    pan = p.build("Cold_Room_TempPanel", c, (dc + dw / 2 + 0.55, y0, 0), props={"wh_type": "temp_sensor", "wh_temp": 4.2})
    parent_to(text_mesh("Cold_Room_TempPanel_Text", "4.2 °C", 0.07, c, "M_Paint_White", (0, -0.044, 1.6), rot=(math.pi / 2, 0, 0)), pan)
    # Evaporadores
    ev = MB()
    ev.box((-0.8, -0.3, -0.45), (0.8, 0.3, 0.0), "M_Metal_White")
    for fx in (-0.4, 0.4):
        ev.cyl((fx, -0.31, -0.22), 0.17, 0.02, "M_Steel_Dark", axis='Y', seg=16)
    evm = ev.build("Cold_Evaporator_Master", lib_col("11_Cold_Storage"), props={"wh_type": "evaporator"})
    put(evm, "Cold_Evaporator_01", (44.0, 29.2, H), 0, c)
    put(evm, "Cold_Evaporator_02", (47.8, 29.2, H), 0, c)
    # Racks internos (malla) y contenido
    def ch(s, R):
        k = R.choice(["Container_Cold_Insulated", "Box_Cold_EPS", "Box_Med_Small", "Box_Cold_EPS", "Box_Med_Medium"])
        return [(k, (0, 0, 0), math.pi / 2 if k == "Container_Cold_Insulated" else 0.0)]
    n = 0
    for i in range(6):
        y = 21.0 + 0.75 + 1.5 * i
        if y > 29.0: break
        rk = put("Rack_Cold", "Rack_Cold_W_M%d" % (i + 1), (x0 + t + 0.32, y, 0), math.pi / 2, c)
        n += fill(rk, rk.location, rk.rotation_euler.z, ch, c, "Item_ColdW%d" % (i + 1), R, 0.8)
        rk = put("Rack_Cold", "Rack_Cold_E_M%d" % (i + 1), (x1 - t - 0.32, y, 0), -math.pi / 2, c)
        n += fill(rk, rk.location, rk.rotation_euler.z, ch, c, "Item_ColdE%d" % (i + 1), R, 0.8)
    for i in range(4):
        y = 23.25 + 1.5 * i
        for side, xx, r in (("A", 45.6, -math.pi / 2), ("B", 46.2, math.pi / 2)):
            rk = put("Rack_Cold", "Rack_Cold_C%s_M%d" % (side, i + 1), (xx, y, 0), r, c)
            n += fill(rk, rk.location, rk.rotation_euler.z, ch, c, "Item_ColdC%s%d" % (side, i + 1), R, 0.8)
    put("Pallet_Load_Cold", "Load_Cold_01", (44.0, 21.2, 0), 0, c, {"wh_state": "stored_cold"})
    put("Pallet_Load_Cold", "Load_Cold_02", (48.2, 21.2, 0), 0, c, {"wh_state": "stored_cold"})
    put("Cart_Platform", "Cart_Platform_Cold", (45.8, 18.9 - 1.0 + 1.0, 0), math.pi / 2, get_col("05_Carts"))
    return n

def assemble_controlled(R):
    c = get_col("12_Controlled_Meds")
    x0, y0, x1, y1 = ZONES["Controlled_Meds"]
    H = 3.0; dc = 45.0
    root = empty("Controlled_Meds_Cage", c, ((x0 + x1) / 2, (y0 + y1) / 2, 0), 'CUBE', 0.5, props={"wh_type": "secure_cage", "wh_access": "restricted"})
    ox, oy = root.location.x, root.location.y
    m = MB()
    def post(x, y):
        m.box((x - ox - 0.03, y - oy - 0.03, 0), (x - ox + 0.03, y - oy + 0.03, H), "M_Steel_Dark")
    def panel(a, b, z0=0.1, z1=H):
        m.box((a[0] - ox, a[1] - oy, z0), (b[0] - ox, b[1] - oy, z1), "M_Wire_Mesh")
    segs_S = [(x0, dc - 0.55), (dc + 0.55, x1)]
    for a, b in segs_S:
        n = max(1, round((b - a) / 1.5))
        for i in range(n + 1):
            post(a + i * (b - a) / n, y0)
        panel((a, y0 - 0.005), (b, y0 + 0.005))
    m.box((dc - 0.55 - ox, y0 - 0.04 - oy, 2.15), (dc + 0.55 - ox, y0 + 0.04 - oy, H), "M_Steel_Dark")
    for a, b, fixed, ax in ((y0, y1, x0, 'Y'), (x0, x1, y1, 'X')):
        n = max(1, round((b - a) / 1.5))
        for i in range(n + 1):
            v = a + i * (b - a) / n
            post(fixed, v) if ax == 'Y' else post(v, fixed)
        if ax == 'Y':
            panel((fixed - 0.005, a), (fixed + 0.005, b))
        else:
            panel((a, fixed - 0.005), (b, fixed + 0.005))
    m.box((x0 - ox, y0 - oy, H), (x1 - ox, y1 - oy, H + 0.01), "M_Wire_Mesh")
    for (a, b) in (((x0, y0), (x1, y0)), ((x0, y0), (x0, y1)), ((x0, y1), (x1, y1))):
        m.box((min(a[0], b[0]) - ox - 0.03, min(a[1], b[1]) - oy - 0.03, H - 0.05), (max(a[0], b[0]) - ox + 0.03, max(a[1], b[1]) - oy + 0.03, H), "M_Steel_Dark")
        m.box((min(a[0], b[0]) - ox - 0.03, min(a[1], b[1]) - oy - 0.03, 0.0), (max(a[0], b[0]) - ox + 0.03, max(a[1], b[1]) - oy + 0.03, 0.1), "M_Steel_Dark")
    m.box((dc + 0.6 - ox, y0 - 0.05 - oy, 1.2), (dc + 0.72 - ox, y0 - 0.03 - oy, 1.4), "M_Plastic_Black")    # lector de acceso
    m.box((dc + 0.62 - ox, y0 - 0.052 - oy, 1.33), (dc + 0.7 - ox, y0 - 0.05 - oy, 1.37), "M_Light_Red")
    parent_to(m.build("Controlled_Cage_Structure", c, props={"wh_type": "cage"}), root)
    d = MB()
    d.box((0, -0.03, 0.0), (1.08, 0.03, 2.12), "M_Steel_Dark")
    d.box((0.15, -0.035, 1.2), (0.93, 0.035, 1.9), "M_Wire_Mesh")
    d.box((0.9, -0.08, 0.95), (0.98, -0.03, 1.05), "M_Galvanized")
    for z in (0.3, 1.0, 1.85):
        d.box((-0.02, -0.04, z), (0.04, 0.04, z + 0.12), "M_Galvanized")
    parent_to(d.build("Controlled_Cage_Door", c, (dc - 0.54 - ox, y0 - oy, 0), props={"wh_type": "door_secure", "wh_open": 0.0, "wh_locked": 1}), root)
    s = put("Sign_Restricted", "Sign_Controlled_Access", (dc + 1.5, y0 - 0.02, 0), math.pi, c)
    # Interior: racks con totes rojos, caja fuerte, escritorio de registro
    def ch(sl, R):
        k = R.choice(["Tote_Red_Controlled", "Box_Controlled", "Box_Controlled", "Tote_Red_Controlled"])
        return [(k, (0, 0, 0), math.pi / 2 if k.startswith("Tote") else 0.0)]
    n = 0
    for i, x in enumerate((43.2, 45.1, 47.0)):
        rk = put("Rack_Medium", "Rack_CM_M%d" % (i + 1), (x, y1 - 0.38, 0), math.pi, c, {"wh_zone": "Controlled"})
        n += fill(rk, rk.location, rk.rotation_euler.z, ch, c, "Item_CM%d" % (i + 1), R, 0.8)
    v = MB()
    v.box((-0.45, -0.32, 0), (0.45, 0.32, 1.8), "M_Steel_Dark")
    v.box((-0.43, -0.325, 0.05), (0.43, -0.32, 1.75), "M_Metal_Grey")
    v.cyl((0.25, -0.34, 1.0), 0.06, 0.03, "M_Galvanized", axis='Y', seg=12)
    v.box((0.18, -0.33, 1.3), (0.32, -0.32, 1.45), "M_Screen")
    put(v.build("Safe_Vault_Master", lib_col("12_Controlled_Meds"), props={"wh_type": "safe"}), "Safe_Vault_01", (49.2, 15.5, 0), math.pi / 2, c)
    loc = (43.4, 14.5, 0)
    put("Desk_Control", "Controlled_Desk", loc, math.pi, c)
    put("Monitor", "Controlled_Desk_Monitor", W(loc, math.pi, (-0.2, 0.2, 0.75)), math.pi, c)
    put("Keyboard", "Controlled_Desk_Keyboard", W(loc, math.pi, (-0.2, -0.1, 0.75)), math.pi, c)
    put("Chair_Office", "Controlled_Desk_Chair", W(loc, math.pi, (-0.2, -0.65, 0)), 0, c)
    put("Cart_Medication", "Cart_Medication_01", (46.8, 15.2, 0), 0, c, {"wh_zone": "Controlled"})
    put("Cart_Medication", "Cart_Medication_02", (47.8, 15.2, 0), 0.1, c, {"wh_zone": "Controlled"})
    put("CCTV_Dome", "CCTV_Dome_Controlled", (45.8, 16.4, H), 0, c)
    return n

def assemble_office():
    cW = get_col("08_Workstations")
    z = 3.25
    loc = (18.0, 4.6, z)
    put("Desk_Control", "Office_Desk_01", loc, 0, cW, {"wh_zone": "Office"})
    for i, dx in enumerate((-0.45, 0.15)):
        put("Monitor", "Office_Desk_01_Monitor_%d" % (i + 1), W(loc, 0, (dx, 0.15, 0.75)), 0, cW)
    put("Keyboard", "Office_Desk_01_Keyboard", W(loc, 0, (-0.15, -0.15, 0.75)), 0, cW)
    put("Chair_Office", "Office_Chair_01", (17.85, 3.85, z), math.pi, cW)
    loc2 = (20.3, 2.3, z)
    put("Desk_Control", "Office_Desk_02", loc2, -math.pi / 2, cW, {"wh_zone": "Office"})
    put("Monitor", "Office_Desk_02_Monitor", W(loc2, -math.pi / 2, (-0.3, 0.15, 0.75)), -math.pi / 2, cW)
    put("Keyboard", "Office_Desk_02_Keyboard", W(loc2, -math.pi / 2, (-0.3, -0.15, 0.75)), -math.pi / 2, cW)
    put("Chair_Office", "Office_Chair_02", (19.6, 2.15, z), math.pi / 2, cW)
    put("Screen_Wall", "Office_Screen_KPI", (15.12, 3.0, z + 1.6), math.pi / 2, cW)
    put("Shelf_Aux", "Office_Shelf", (15.4, 1.0, z), -math.pi / 2, cW)
    put("Screen_Wall", "Warehouse_Screen_KPI", (25.0, 0.02, 5.0), math.pi, cW)

def floor_markings():
    c = get_col("13_Floor_Marking")
    zt = 0.003
    def ln(mb, x0, y0, x1, y1, mat, w=0.1):
        if abs(y1 - y0) < 1e-6:
            mb.box((min(x0, x1), y0 - w / 2, 0.0005), (max(x0, x1), y0 + w / 2, zt), mat)
        else:
            mb.box((x0 - w / 2, min(y0, y1), 0.0005), (x0 + w / 2, max(y0, y1), zt), mat)
    def rect(mb, x0, y0, x1, y1, mat, w=0.1):
        ln(mb, x0, y0, x1, y0, mat, w); ln(mb, x0, y1, x1, y1, mat, w)
        ln(mb, x0, y0, x0, y1, mat, w); ln(mb, x1, y0, x1, y1, mat, w)
    # Pasillo principal: andador peatonal verde + líneas de tránsito
    m = MB()
    m.box((0.3, 9.0, 0.0004), (49.7, 10.0, zt - 0.0005), "M_Paint_Green")
    ln(m, 0.3, 9.0, 49.7, 9.0, "M_Paint_White", 0.08); ln(m, 0.3, 10.0, 49.7, 10.0, "M_Paint_White", 0.08)
    ln(m, 0.3, 13.0, 49.7, 13.0, "M_Paint_Yellow", 0.12)
    x = 0.8
    while x < 49:
        ln(m, x, 11.5, x + 1.2, 11.5, "M_Paint_Yellow", 0.1); x += 2.4
    for cx in (14.8, 36.5):                                      # pasos peatonales (cebra)
        y = 10.1
        while y < 12.9:
            m.box((cx - 1.2, y, 0.0004), (cx + 1.2, y + 0.3, zt), "M_Paint_White"); y += 0.6
    m.build("Floor_Main_Aisle", c, props={"wh_type": "floor_marking"})
    # Pasillos de racks: líneas al frente de cada fila
    m = MB()
    y0 = CFG["RACK_Y0"]; y1 = y0 + LIB["Rack_Pallet_5Bay"]["wh_length"]
    for xf in (1.75, 5.0, 7.65, 10.9, 13.55, 16.8, 19.45, 22.7, 25.35, 28.6):
        ln(m, xf, y0, xf, y1, "M_Paint_Yellow", 0.1)
    for xf in (31.75, 33.4, 34.65, 36.4, 37.65, 39.25):
        ln(m, xf, 15.0, xf, 24.0, "M_Paint_Yellow", 0.08)
    m.build("Floor_Storage_Aisles", c, props={"wh_type": "floor_marking"})
    for a, xc in (("A", 3.35), ("B", 9.25), ("C", 15.15), ("D", 21.05), ("E", 26.95)):
        text_mesh("Floor_Aisle_Letter_" + a, a, 1.2, c, "M_Paint_White", (xc, 12.25, zt), props={"wh_type": "floor_text"})
    # Zonas: carriles de recepción/despacho, carga de equipos, puertas, cuarto frío, jaula
    m = MB()
    for xc in CFG["DOCKS_RECEIVING"] + CFG["DOCKS_DISPATCH"]:
        rect(m, xc - 1.3, 2.4, xc + 1.3, 8.2, "M_Paint_Yellow", 0.1)
        ln(m, xc - 1.3, 2.6, xc + 1.3, 2.6, "M_Paint_Red", 0.12)
        for yy in (3.2, 4.8, 6.4):
            for dx in (-0.6, 0.6):
                rect(m, xc + dx - 0.55, yy - 0.65, xc + dx + 0.55, yy + 0.65 + 0.0, "M_Paint_White", 0.04)
    x0, y0_, x1, y1_ = ZONES["Charging"]
    rect(m, x0 + 0.2, y0_ + 0.1, x1 - 0.2, y1_ - 0.2, "M_Paint_Yellow", 0.12)
    for i in range(14):
        xa = x0 + 0.4 + i * 0.4
        m.boxc((xa, y1_ - 0.45, 0.0015), (0.12, 0.6, 0.002), "M_Safety_Black", rz=math.radians(35))
    rect(m, 21.6, 2.9, 34.4, 5.5, "M_Paint_Yellow", 0.08)
    rect(m, 44.2, 18.2, 47.4, 19.9, "M_Paint_Blue", 0.1)                        # despeje puerta cuarto frío
    rect(m, 41.85, 13.25, 49.7, 19.55, "M_Paint_Red", 0.1)                      # perímetro controlados
    rect(m, 31.1, 14.8, 40.95, 29.5, "M_Paint_White", 0.06)                     # área de picking
    rect(m, -0.0 + 0.4, 9.2 - 0.1, 3.4, 12.9, "M_Paint_Yellow", 0.06) if False else None
    m.build("Floor_Zones", c, props={"wh_type": "floor_marking"})
    # Flechas de circulación (instancias de una flecha maestra)
    a = MB()
    a.prism([(-0.13, -0.75), (0.13, -0.75), (0.13, 0.15), (0.38, 0.15), (0, 0.75), (-0.38, 0.15), (-0.13, 0.15)], 'Z', 0.0005, zt, "M_Paint_White")
    arrow = a.build("Floor_Arrow_Master", lib_col("13_Floor_Marking"), props={"wh_type": "floor_arrow"})
    k = 0
    for x in (5.0, 18.0, 30.0, 42.0):
        k += 1; put(arrow, "Floor_Arrow_%02d" % k, (x, 10.8, 0), -math.pi / 2, c)
        k += 1; put(arrow, "Floor_Arrow_%02d" % k, (x + 4, 12.2, 0), math.pi / 2, c)
    for xc in (3.35, 9.25, 15.15, 21.05, 26.95):
        k += 1; put(arrow, "Floor_Arrow_%02d" % k, (xc, 14.4, 0), 0, c)
    # Rótulos de zona
    for txt, p in (("RECEPCIÓN", (7.5, 1.4)), ("DESPACHO", (42.5, 1.4)), ("EMPAQUE", (27.5, 6.6)),
                   ("CARGA DE EQUIPOS", (18.0, 5.2)), ("PICKING", (36.0, 25.0)), ("ALMACENAMIENTO", (15.0, 28.6))):
        text_mesh("Floor_Text_" + txt.replace(" ", "_").replace("Ó", "O"), txt, 0.55, c, "M_Paint_White", (p[0], p[1], zt), props={"wh_type": "floor_text"})

def place_safety():
    c = get_col("09_Safety")
    E, N, S_, Wd = -math.pi / 2, math.pi, 0.0, math.pi / 2       # rot para muros: W(x=0), N(y=30), S(y=0), E(x=50)
    WW, WE = -math.pi / 2, math.pi / 2
    items = [
        ("Fire_Extinguisher", (0, 8.3), WW), ("Fire_Extinguisher", (0, 20.0), WW), ("Fire_Extinguisher", (50, 8.3), WE),
        ("Fire_Extinguisher", (25.0, 30), N), ("Fire_Extinguisher", (34.2, 0), S_), ("Fire_Extinguisher", (41.8, 22.5), WE),
        ("Fire_Extinguisher", (14.9, 0), S_),
        ("Fire_Hose_Cabinet", (0, 15.0), WW), ("Fire_Hose_Cabinet", (50, 11.0), WE),
        ("First_Aid_Kit", (50, 6.0), WE), ("First_Aid_Kit", (0, 6.0), WW),
        ("Emergency_Light", (12.6, 30), N), ("Emergency_Light", (37.6, 30), N), ("Emergency_Light", (0, 5.0), WW),
        ("Emergency_Light", (50, 5.0), WE), ("Emergency_Light", (0, 25.0), WW), ("Emergency_Light", (25.0, 0), S_),
        ("Sign_Vest", (0, 2.9), WW), ("Sign_Vest", (50, 2.9), WE), ("Sign_Forklift", (0, 13.6), WW),
        ("Sign_Forklift", (50, 12.3), WE), ("Sign_Speed", (0, 9.4), WW), ("Sign_Cold", (43.3, 19.98), N),
    ]
    count = {}
    for key, (x, y), r in items:
        count[key] = count.get(key, 0) + 1
        put(key, "%s_%02d" % (LIB[key].name, count[key]), (x, y, 0), r, c)
    for i, (x, y, r) in enumerate(((11.5, 29.3, 0), (36.5, 29.3, 0), (1.2, 4.0, math.pi / 2), (48.8, 4.0, math.pi / 2))):
        put("Exit_Sign", "Exit_Sign_%02d" % (i + 1), (x, y, 2.8), r, c)
    bol = [(44.3, 19.75), (47.3, 19.75), (44.4, 13.15), (45.6, 13.15), (41.75, 13.2), (41.75, 19.65),
           (14.6, 6.4), (21.3, 6.1), (21.3, 0.8), (15.1, 9.1), (20.9, 9.1), (34.0, 9.1)]
    for i, (x, y) in enumerate(bol):
        put("Bollard", "Bollard_%02d" % (i + 1), (x, y, 0), 0, c)
    for i, x in enumerate((22.5, 24.5, 26.5, 28.5, 30.5, 32.5)):
        put("Barrier_Pedestrian", "Barrier_Ped_Pack_%02d" % (i + 1), (x, 9.0, 0), 0, c)
    for i, x in enumerate((47.0, 48.75)):
        put("Barrier_Vehicle", "Barrier_Cage_%02d" % (i + 1), (x, 13.1, 0), 0, c)
    put("Barrier_Vehicle", "Barrier_Cold_01", (48.6, 19.75, 0), 0, c)
    for i, (x, y, r) in enumerate(((30.6, 13.25, math.radians(-135)), (0.6, 13.25, math.radians(-135 + 90)), (41.5, 12.9, math.radians(150)))):
        put("Safety_Mirror", "Safety_Mirror_%02d" % (i + 1), (x, y, 0), r, c)
    cams = [((0.35, 0.35, 6.5), -45), ((49.65, 0.35, 6.5), 45), ((0.35, 29.65, 6.5), -135), ((49.65, 29.65, 6.5), 135),
            ((25.0, 0.3, 6.5), 0), ((25.0, 29.7, 6.5), 180), ((41.9, 16.0, 2.6), -90)]
    for i, (p, d) in enumerate(cams):
        put("CCTV", "CCTV_Camera_%02d" % (i + 1), p, math.radians(d), c)
    # Tubería de rociadores (red principal)
    m = MB()
    for y in (5.0, 12.5, 20.0, 26.0):
        m.cyl((25.0, y, 9.3), 0.05, 49.4, "M_Paint_Red", axis='X', seg=8)
        x = 2.0
        while x < 49:
            m.cyl((x, y, 9.15), 0.015, 0.3, "M_Paint_Red", seg=6); x += 3.0
    m.cyl((0.4, 15.5, 9.3), 0.07, 21.0, "M_Paint_Red", axis='Y', seg=8)
    m.cyl((0.4, 5.0, 4.65), 0.07, 9.3, "M_Paint_Red", seg=8)
    m.build("Sprinkler_Piping", get_col("01_Building"), props={"wh_type": "sprinklers"})

def assemble_warehouse():
    R = random.Random(CFG["SEED"])
    out = {}
    out["storage_loads"] = assemble_storage(R)
    out["picking_items"] = assemble_picking(R)
    assemble_packing(R)
    out["dispatch"] = assemble_dispatch(R)
    out["receiving"] = assemble_receiving(R)
    assemble_charging()
    out["cold"] = assemble_cold_room(R)
    out["controlled"] = assemble_controlled(R)
    assemble_office()
    floor_markings()
    place_safety()
    out["objects"] = len(bpy.data.objects)
    return out

def phase_assembly():
    return assemble_warehouse()

# =====================================================================
#  SECCIÓN 06 · ILUMINACIÓN, CÁMARAS Y HELPERS DE SIMULACIÓN
# =====================================================================

def create_lights():
    c = get_col("15_Lights")
    # Luminarias industriales (malla emisiva, se exporta a glTF)
    m = MB()
    m.cyl((0, 0, 0.35), 0.015, 0.7, "M_Galvanized", seg=6)
    m.cyl((0, 0, -0.05), 0.12, 0.12, "M_Metal_Grey", seg=12)
    m.cyl((0, 0, -0.2), 0.42, 0.22, "M_Metal_Grey", seg=16, r2=0.14)
    m.cyl((0, 0, -0.315), 0.4, 0.01, "M_Light_Emissive", seg=16)
    fx = m.build("Lamp_HighBay_Master", lib_col("15_Lights"), props={"wh_type": "lamp_highbay"})
    k = 0
    for x in [2.5 + 5 * i for i in range(10)]:
        for y in (4.5, 11.0, 16.5, 22.0, 27.5):
            if 42 < x and y > 19:        # sobre el cuarto frío
                continue
            k += 1
            put(fx, "Lamp_HighBay_%02d" % k, (x, y, zr(y) - 1.05), 0, c)
    # Luces de Blender (para render/vista; en web se recomienda iluminación propia)
    def light(name, kind, loc, energy, size=None, rot=(0, 0, 0), color=(1.0, 0.97, 0.92)):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy; ld.color = color
        if kind == 'AREA':
            ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size
        if kind == 'SUN':
            ld.angle = math.radians(8)
        if kind == 'SPOT':
            ld.spot_size = math.radians(80); ld.spot_blend = 0.6
        ob = bpy.data.objects.new(name, ld)
        c.objects.link(ob); ob.location = loc; ob.rotation_euler = rot
        return ob
    light("Light_Sun", 'SUN', (25, -20, 40), 3.0, rot=(math.radians(50), 0, math.radians(35)))
    k = 0
    for x in (6.25, 18.75, 31.25, 43.75):
        for y in (5.0, 15.0, 25.0):
            k += 1
            light("Light_Area_%02d" % k, 'AREA', (x, y, zr(y) - 1.4), 700 if not (x > 40 and y > 19) else 250, size=(11.0, 8.5))
    light("Light_ColdRoom", 'AREA', (45.9, 24.9, 3.9), 500, size=(6.5, 8.0), color=(0.9, 0.95, 1.0))
    light("Light_Controlled", 'AREA', (45.9, 16.4, 2.9), 250, size=(6.0, 4.5))
    light("Light_Office", 'AREA', (18.0, 3.1, 5.95), 250, size=(5.0, 4.5))
    for i, xc in enumerate(CFG["DOCKS_RECEIVING"] + CFG["DOCKS_DISPATCH"]):
        light("Light_Dock_Ext_%02d" % (i + 1), 'SPOT', (xc, -0.6, 4.8), 300, rot=(math.radians(35), 0, math.radians(180)))
    scn = bpy.context.scene
    try:
        scn.eevee.use_shadows = True
    except Exception:
        pass
    for attr, val in (("use_raytracing", True), ("use_fast_gi", True), ("taa_render_samples", 64)):
        try:
            setattr(scn.eevee, attr, val)
        except Exception:
            pass

def create_cameras():
    c = get_col("16_Cameras")
    def cam(name, loc, target, lens=24):
        cd = bpy.data.cameras.new(name)
        cd.lens = lens; cd.clip_start = 0.05; cd.clip_end = 600
        ob = bpy.data.objects.new(name, cd)
        c.objects.link(ob)
        ob.location = loc
        d = Vector(target) - Vector(loc)
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        ob["wh_type"] = "camera"; ob["wh_target"] = list(target)
        return ob
    ov = cam("Camera_Overview", (49.2, 0.9, 9.0), (22.0, 18.0, 0.0), 20)
    cam("Camera_Receiving", (14.0, 10.6, 4.6), (6.0, 2.5, 0.6), 22)
    cam("Camera_Storage", (15.15, 12.4, 2.6), (15.15, 28.0, 2.6), 22)
    cam("Camera_Picking", (40.6, 13.6, 4.2), (34.5, 22.5, 0.4), 22)
    cam("Camera_Dispatch", (33.0, 9.8, 4.8), (42.5, 2.5, 0.6), 22)
    cam("Camera_Exterior", (-28.0, -42.0, 20.0), (24.0, 12.0, 0.0), 35)
    bpy.context.scene.camera = ov
    r = bpy.context.scene.render
    r.resolution_x, r.resolution_y = 1920, 1080

# ---------------------------------------------------------------------
# HELPERS: rutas (curvas), nodos, zonas, puntos de pickup/dropoff, accesos
# Todo con propiedades wh_* y exportado también a warehouse_layout.json
# ---------------------------------------------------------------------
ROUTES = {}
NODES = {}

def route(name, pts, cyclic=False, kind="forklift", col=None):
    col = col or get_col("17_Helper_Objects")
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, 0.05, 1.0)
    sp.use_cyclic_u = cyclic
    cu.bevel_depth = 0.04
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    ob["wh_type"] = "route"; ob["wh_route_kind"] = kind; ob["wh_cyclic"] = int(cyclic)
    ob.data.materials.append(MAT[{"forklift": "M_Paint_Yellow", "picking": "M_Paint_Blue", "pedestrian": "M_Paint_Green",
                                  "agv": "M_Light_Green"}[kind]])
    ob.hide_render = True
    ROUTES[name] = {"kind": kind, "cyclic": cyclic, "points": [list(p) for p in pts]}
    return ob

def node(name, x, y, kind, links=(), zone=None, z=0.0, shape='SPHERE', size=0.35, col=None):
    col = col or get_col("17_Helper_Objects")
    e = empty(name, col, (x, y, z), shape, size, props={"wh_type": kind, "wh_links": list(links), "wh_zone": zone or ""})
    NODES[name] = {"type": kind, "pos": [x, y, z], "links": list(links), "zone": zone or ""}
    return e

def create_helpers():
    c = get_col("17_Helper_Objects")
    subs = {n: get_col("17_" + n, c) for n in ("Routes", "Nodes", "Zones", "PickDrop", "Access")}
    # Zonas como empties tipo cubo con escala = tamaño de la zona
    for zn, (x0, y0, x1, y1) in ZONES.items():
        e = empty("Zone_" + zn, subs["Zones"], ((x0 + x1) / 2, (y0 + y1) / 2, 1.5), 'CUBE', 1.0,
                  props={"wh_type": "zone", "wh_zone": zn, "wh_bounds": [x0, y0, x1, y1]})
        e.scale = ((x1 - x0) / 2, (y1 - y0) / 2, 1.5)
        e.hide_render = True
    R = subs["Routes"]
    route("Route_Forklift_Main_Loop", [(1.5, 10.8), (48.5, 10.8), (48.5, 12.2), (1.5, 12.2)], True, "forklift", R)
    route("Route_Forklift_A", [(7.5, 3.0), (7.5, 10.8), (15.15, 10.8), (15.15, 26.5)], False, "forklift", R)
    route("Route_Forklift_B", [(21.05, 26.5), (21.05, 12.2), (42.5, 12.2), (42.5, 3.0)], False, "forklift", R)
    route("Route_Forklift_C", [(2.5, 3.0), (2.5, 10.8), (3.35, 12.2), (3.35, 26.5)], False, "forklift", R)
    for a, x in (("A", 3.35), ("B", 9.25), ("C", 15.15), ("D", 21.05), ("E", 26.95)):
        route("Route_Forklift_Aisle_" + a, [(x, 12.2), (x, 27.2)], False, "forklift", R)
    route("Route_Picking_A", [(32.5, 14.6), (32.5, 24.6), (35.5, 24.6), (35.5, 14.6), (38.5, 14.6), (38.5, 24.6), (38.5, 25.3), (32.4, 25.3)], False, "picking", R)
    route("Route_Picking_B", [(31.5, 28.3), (40.5, 28.3)], False, "picking", R)
    route("Route_Picking_To_Packing", [(32.4, 25.3), (31.5, 25.3), (31.5, 14.4), (31.5, 9.5), (27.5, 9.5), (27.5, 6.2)], False, "picking", R)
    route("Route_Pedestrian_A", [(0.6, 9.5), (49.4, 9.5)], False, "pedestrian", R)
    route("Route_Pedestrian_Office", [(16.0, 6.7), (14.8, 6.7), (14.8, 9.5), (14.8, 13.0)], False, "pedestrian", R)
    route("Route_Pedestrian_Exit_N02", [(36.5, 9.5), (36.5, 13.0), (36.5, 14.6), (36.0, 25.3), (36.5, 28.3), (36.5, 29.6)], False, "pedestrian", R)
    route("Route_Pedestrian_Exit_N01", [(14.8, 13.0), (14.0, 13.3), (14.0, 28.8), (11.5, 28.8), (11.5, 29.6)], False, "pedestrian", R)
    route("Route_AGV_A", [(19.3, 2.0), (19.3, 8.5), (21.6, 10.8), (42.5, 10.8), (42.5, 8.4)], False, "agv", R)
    route("Route_AGV_B", [(20.4, 2.0), (20.4, 8.5), (24.0, 12.2), (26.95, 12.2), (26.95, 26.5)], False, "agv", R)
    route("Route_AMR_Picking", [(36.0, 14.6), (36.0, 24.6), (33.0, 24.6), (33.0, 14.6)], True, "agv", R)
    # Nodos de circulación (grafo) sobre el pasillo principal
    N = subs["Nodes"]
    xs = [1.5, 2.5, 3.35, 7.5, 9.25, 12.5, 14.8, 15.15, 19.3, 21.05, 24.0, 26.95, 27.5, 31.5, 36.5, 37.5, 42.5, 47.5, 48.5]
    names = ["Node_Main_%02d" % (i + 1) for i in range(len(xs))]
    for i, x in enumerate(xs):
        links = [names[j] for j in (i - 1, i + 1) if 0 <= j < len(xs)]
        node(names[i], x, 11.5, "node_main", links, "Main_Aisle", col=N)
    def main_of(x):
        return names[min(range(len(xs)), key=lambda i: abs(xs[i] - x))]
    for i, xc in enumerate(CFG["DOCKS_RECEIVING"]):
        node("Node_Receiving_%02d" % (i + 1), xc, 3.0, "node_dock", [main_of(xc)], "Receiving", col=N)
    for i, xc in enumerate(CFG["DOCKS_DISPATCH"]):
        node("Node_Dispatch_%02d" % (i + 1), xc, 3.0, "node_dock", [main_of(xc)], "Dispatch", col=N)
    for a, x in (("A", 3.35), ("B", 9.25), ("C", 15.15), ("D", 21.05), ("E", 26.95)):
        node("Node_Storage_%s_Entry" % a, x, 13.2, "node_aisle", [main_of(x), "Node_Storage_%s_End" % a], "Storage", col=N)
        node("Node_Storage_%s_End" % a, x, 27.2, "node_aisle", ["Node_Storage_%s_Entry" % a], "Storage", col=N)
    for i, x in enumerate((32.4, 34.6, 38.6)):
        node("Node_Picking_%02d" % (i + 1), x, 25.3, "node_station", ["Node_Picking_Hub"], "Picking", col=N)
    node("Node_Picking_Hub", 31.5, 14.4, "node_hub", ["Node_Main_14", "Node_Picking_01", "Node_Picking_02", "Node_Picking_03"], "Picking", col=N)
    for i, x in enumerate((23.4, 25.4, 27.4, 29.4, 31.4)):
        node("Node_Packing_%02d" % (i + 1), x, 5.6, "node_station", [main_of(x)], "Packing", col=N)
    for i, x in enumerate((15.9, 17.6, 19.3, 20.4)):
        node("Node_Charging_%02d" % (i + 1), x, 2.2, "node_charger", [main_of(x)], "Charging", col=N)
    node("Node_ColdRoom_Door", 45.8, 18.9, "node_door", ["Node_Main_17"], "Cold_Storage", col=N)
    node("Node_Controlled_Door", 45.0, 12.9, "node_door", ["Node_Main_17"], "Controlled_Meds", col=N)
    node("Node_Office_Stairs", 21.3, 6.7, "node_stairs", ["Node_Main_10"], "Office", col=N)
    # Puntos de pickup / dropoff y de carga
    P = subs["PickDrop"]
    for i, xc in enumerate(CFG["DOCKS_RECEIVING"]):
        for r, yy in enumerate((3.2, 4.8, 6.4)):
            node("Point_Pickup_Receiving_R%d_%d" % (i + 1, r + 1), xc, yy, "pickup", ["Node_Receiving_%02d" % (i + 1)], "Receiving", shape='CIRCLE', size=0.6, col=P)
    for i, xc in enumerate(CFG["DOCKS_DISPATCH"]):
        for r, yy in enumerate((2.6, 4.2, 5.8, 7.4)):
            node("Point_Dropoff_Dispatch_D%d_%d" % (i + 1, r + 1), xc, yy, "dropoff", ["Node_Dispatch_%02d" % (i + 1)], "Dispatch", shape='CIRCLE', size=0.6, col=P)
    for i, xc in enumerate(CFG["DOCKS_RECEIVING"] + CFG["DOCKS_DISPATCH"]):
        tag = ("R%d" % (i + 1)) if i < 3 else ("D%d" % (i - 2))
        node("Point_Load_Dock_" + tag, xc, -1.5, "load_point", ["Node_%s_%02d" % ("Receiving" if i < 3 else "Dispatch", (i % 3) + 1)], "Dock", shape='ARROWS', size=0.6, col=P)
    node("Point_Dropoff_Conveyor_Out", 35.03, 6.6, "dropoff", ["Node_Main_15"], "Packing", shape='CIRCLE', size=0.4, col=P)
    node("Point_Pickup_Conveyor_In", 22.4, 3.6, "pickup", ["Node_Packing_01"], "Packing", shape='CIRCLE', size=0.4, col=P)
    # Accesos
    A = subs["Access"]
    for nm, x, y, k in (("Access_Door_Ped_W01", 0.5, 4.0, "door_ped"), ("Access_Door_Ped_E01", 49.5, 4.0, "door_ped"),
                        ("Access_Exit_N01", 11.5, 29.5, "emergency_exit"), ("Access_Exit_N02", 36.5, 29.5, "emergency_exit"),
                        ("Access_Grade_W01", 0.5, 11.0, "grade_door"), ("Access_ColdRoom", 45.8, 19.6, "cold_door"),
                        ("Access_Controlled", 45.0, 13.2, "secure_door"), ("Access_Office", 15.6, 6.0, "office_door")):
        node(nm, x, y, "access_" + k, [], None, shape='ARROWS', size=0.5, col=A)
    for i, xc in enumerate(CFG["DOCKS_RECEIVING"] + CFG["DOCKS_DISPATCH"]):
        tag = ("R%02d" % (i + 1)) if i < 3 else ("D%02d" % (i - 2))
        node("Access_Dock_" + tag, xc, 0.4, "access_dock", [], None, shape='ARROWS', size=0.5, col=A)
    # Ocultar helpers en render (siguen visibles en viewport y se exportan como nodos vacíos)
    for o in [o for o in c.all_objects if o is not None]:
        o.hide_render = (o.type != 'EMPTY')   # las curvas no se exportan; los empties sí (nodos)

def phase_finish_setup():
    create_lights(); create_cameras(); create_helpers()
    return {"routes": len(ROUTES), "nodes": len(NODES), "objects": len(bpy.data.objects)}

# =====================================================================
#  SECCIÓN 07 · VERIFICACIÓN, GUARDADO Y EXPORTACIÓN
#   - almacen_medicamentos.blend   (escena completa)
#   - almacen_medicamentos.glb     (para web / iPad: three.js, Babylon, model-viewer)
#   - warehouse_layout.json        (zonas, rutas, nodos, slots, andenes) para la simulación
# =====================================================================
import os, json

def scene_stats():
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0; objs = 0
    per_col = {}
    for inst in dg.object_instances:
        ob = inst.object
        if ob.type != 'MESH':
            continue
        n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        tris += n; objs += 1
        src = bpy.data.objects.get(ob.name)
        cn = src.users_collection[0].name if src and src.users_collection else "?"
        per_col[cn] = per_col.get(cn, 0) + n
    return {"triangles": tris, "mesh_objects": objs, "unique_meshes": len(bpy.data.meshes),
            "materials": len(bpy.data.materials), "per_collection": dict(sorted(per_col.items(), key=lambda kv: -kv[1]))}

def export_layout_json(path):
    bpy.context.view_layer.update()
    data = {"units": "meters", "origin": "esquina suroeste interior; X largo, Y ancho, Z alto (Blender Z-up)",
            "building": {"W": CFG["W"], "D": CFG["D"], "H": CFG["H"]},
            "zones": {k: list(v) for k, v in ZONES.items()},
            "routes": ROUTES, "nodes": NODES, "docks": {}, "slots": [], "equipment": [], "cameras": {}}
    for o in bpy.context.view_layer.objects:
        t = str(o.get("wh_type", ""))
        p = [round(v, 3) for v in o.matrix_world.translation]
        if t.startswith("slot"):
            data["slots"].append({"name": o.name, "type": t, "pos": p, "parent": o.parent.name if o.parent else None,
                                  "occupied": int(o.get("wh_occupied", 0))})
        elif t == "dock":
            data["docks"][o.name] = {"pos": p, "zone": o.get("wh_zone", ""), "id": o.get("wh_id", "")}
        elif t in ("forklift", "reach_truck", "agv_pallet", "amr_tote", "pallet_jack_manual", "pallet_jack_electric") and o.parent is None:
            data["equipment"].append({"name": o.name, "type": t, "pos": p, "heading_rad": round(o.rotation_euler.z, 4),
                                      "state": o.get("wh_state", "idle")})
        elif o.type == 'CAMERA':
            data["cameras"][o.name] = {"pos": p, "target": list(o.get("wh_target", [])), "lens_mm": o.data.lens}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return {"slots": len(data["slots"]), "equipment": len(data["equipment"]), "docks": len(data["docks"])}

def save_blend(path):
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.camera = bpy.data.objects.get("Camera_Overview")
    bpy.ops.wm.save_as_mainfile(filepath=path)

def export_glb(path, draco=False):
    """GLB para web/iPad. Solo objetos visibles (las bibliotecas excluidas no se exportan) y
    renderizables (sin curvas de rutas); los empties de nodos/slots se exportan como
    nodos con sus propiedades wh_* en 'extras'. Sin EXT_mesh_gpu_instancing para conservar
    el nombre de cada objeto; el visor web agrupa en InstancedMesh por su cuenta."""
    kw = dict(filepath=path, export_format='GLB', use_visible=True, use_renderable=True, use_active_scene=True,
              export_extras=True, export_lights=False, export_cameras=True, export_apply=False,
              export_yup=True, export_gpu_instances=False, export_draco_mesh_compression_enable=draco)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop("export_gpu_instances", None)
        bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)

# =====================================================================
#  MAIN
# =====================================================================
def main(export=True):
    phase_core()            # escena limpia, colecciones, texturas, materiales
    phase_building()        # create_building()
    phase_assets_1()        # create_racks(), create_pallets(), create_containers(), create_boxes()
    phase_assets_2()        # create_carts(), create_forklifts()
    phase_assets_3()        # create_conveyors(), create_workstations(), create_safety_items()
    phase_assembly()        # assemble_warehouse()
    phase_finish_setup()    # create_lights(), create_cameras(), create_helpers()
    stats = scene_stats()
    print("[WH] Triángulos:", stats["triangles"], "| objetos malla:", stats["mesh_objects"], "| mallas únicas:", stats["unique_meshes"])
    if export:
        out = CFG["OUT_DIR"]
        os.makedirs(out, exist_ok=True)
        export_layout_json(os.path.join(out, "warehouse_layout.json"))
        save_blend(os.path.join(out, "almacen_medicamentos.blend"))
        export_glb(os.path.join(out, "almacen_medicamentos.glb"))
        print("[WH] Archivos guardados en", out)
    return stats

if __name__ == "__main__":
    main()

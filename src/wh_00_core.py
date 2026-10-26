# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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
import bpy, bmesh, math, random, os
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

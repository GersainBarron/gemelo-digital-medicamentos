# Oficinas centrales del ISSSTE, Buenavista (CDMX)
# Antigua Torre de Ferrocarriles Nacionales de Mexico, 1968-1970.
# Datos base (edemx.com): 17 niveles, 61.5 m, concreto armado, marmol y vidrio,
# planta en "Y": tres cuerpos unidos por un nucleo triangular ("libro abierto").
# Medidas en metros. Las dimensiones de planta son estimadas.
import bpy, bmesh, math
from mathutils import Matrix, Vector

NOMBRE = "ISSSTE_Buenavista"

# ------------------------------------------------------------ limpieza
col = bpy.data.collections.get(NOMBRE)
if col:
    for ob in list(col.all_objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for c in list(col.children):
        bpy.data.collections.remove(c)
    bpy.data.collections.remove(col)
for n in ("Cube", "Cubo"):
    ob = bpy.data.objects.get(n)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)

col = bpy.data.collections.new(NOMBRE)
bpy.context.scene.collection.children.link(col)

# ------------------------------------------------------------ materiales
def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def mat(name, hexc, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*lin(hexc), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*lin(hexc), 1)
        b.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*lin(hexc), 1)
    return m

MATS = [
    mat("IB_Marmol",     "#E6E1D7", 0.45),        # 0 marmol blanco
    mat("IB_Antepecho",  "#CFC9BD", 0.7),         # 1 franjas de entrepiso
    mat("IB_Vidrio",     "#344B5C", 0.06, 0.4),   # 2 vidrio oscuro
    mat("IB_Aluminio",   "#9EA4AA", 0.3, 0.9),    # 3 parteluces
    mat("IB_Concreto",   "#9C978E", 0.9),         # 4 concreto / azotea
    mat("IB_Plaza",      "#BDB6AA", 0.85),        # 5 piso de plaza
    mat("IB_Asfalto",    "#3A3B3D", 0.95),        # 6 calle
    mat("IB_Verde",      "#6E8F4E", 1.0),         # 7 jardineras
    mat("IB_Guinda",     "#7A1F3D", 0.5),         # 8 acento institucional
    mat("IB_Linea",      "#F2F2EE", 0.6),         # 9 lineas viales
]
MARMOL, ANTEP, VIDRIO, ALUM, CONC, PLAZA, ASF, VERDE, GUINDA, LINEA = range(10)

# ------------------------------------------------------------ constructor de malla
class Mesh:
    def __init__(self):
        self.bm = bmesh.new()
    def box(self, size, center_xy, z0, mi, m=Matrix.Identity(4)):
        sx, sy, sz = size
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r["verts"]
        for v in vs:
            v.co = Vector((v.co.x * sx + center_xy[0], v.co.y * sy + center_xy[1], v.co.z * sz + z0 + sz / 2))
            v.co = m @ v.co
        faces = {f for v in vs for f in v.link_faces}
        for f in faces:
            f.material_index = mi
    def prism(self, pts, z0, h, mi):
        bot = [self.bm.verts.new((x, y, z0)) for x, y in pts]
        top = [self.bm.verts.new((x, y, z0 + h)) for x, y in pts]
        fs = [self.bm.faces.new(bot[::-1]), self.bm.faces.new(top)]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            fs.append(self.bm.faces.new((bot[i], bot[j], top[j], top[i])))
        for f in fs:
            f.material_index = mi
    def cyl(self, r, h, xy, z0, mi, seg=16):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
        for v in res["verts"]:
            v.co.x += xy[0]; v.co.y += xy[1]; v.co.z += z0 + h / 2
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.material_index = mi
    def to_object(self, name, parent):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me); self.bm.free()
        for m in MATS:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
        ob.parent = parent
        return ob

root = bpy.data.objects.new("ISSSTE_root", None)
root.empty_display_type = "PLAIN_AXES"; root.empty_display_size = 8
col.objects.link(root)

# ------------------------------------------------------------ parametros
ALTURA = 61.5
NIV = 17
PB = 5.6                                  # planta baja (vestibulo, doble altura)
PISO = (ALTURA - PB - 1.2) / (NIV - 1)    # ~3.39 m por nivel tipo
ALA_L = 30.0                              # largo de cada ala desde el nucleo (estimado)
ALA_W = 13.5                              # ancho de cada ala (estimado)
NUC = 15.0                                # lado del triangulo del nucleo (estimado)
R_NUC = NUC / math.sqrt(3)                # radio circunscrito del nucleo
APOT = NUC / (2 * math.sqrt(3))           # apotema: donde arrancan las alas
# angulos de las alas: una hacia atras, dos abiertas hacia el frente (-Y)
ANGULOS = [90, 210, 330]

# ------------------------------------------------------------ alas
def ala(idx, ang):
    m = Matrix.Rotation(math.radians(ang), 4, "Z")
    me = Mesh()
    x0 = APOT - 0.5                    # arranque del ala (se empalma con el nucleo)
    x1 = APOT + ALA_L                  # testero
    L = x1 - x0
    cx = (x0 + x1) / 2
    hw = ALA_W / 2
    # planta baja remetida con columnas (pilotes)
    me.box((L - 2.0, ALA_W - 3.0, PB), (cx - 1.0, 0), 0, VIDRIO, m)
    ncol = 6
    for i in range(ncol):
        x = x0 + 3 + i * (L - 4) / (ncol - 1)
        for s in (-1, 1):
            me.box((0.9, 0.9, PB), (x, s * (hw - 0.6)), 0, MARMOL, m)
    # losa de transicion sobre la planta baja
    me.box((L, ALA_W + 0.4, 1.2), (cx, 0), PB, ANTEP, m)
    z_tipo = PB + 1.2
    h_tipo = PISO * (NIV - 1)
    # testero ciego de marmol (cabecera de cada ala)
    me.box((1.6, ALA_W + 0.4, h_tipo + 1.8), (x1 - 0.8, 0), z_tipo, MARMOL, m)
    # cuerpo interior (relleno)
    me.box((L - 1.6, ALA_W - 0.8, h_tipo), (cx - 0.8, 0), z_tipo, CONC, m)
    # fachadas largas: franja de antepecho + banda de vidrio + parteluces
    long_len = L - 1.6
    lx = x0 + long_len / 2
    nmul = 14
    for p in range(NIV - 1):
        z = z_tipo + p * PISO
        for s in (-1, 1):
            y = s * (hw - 0.2)
            me.box((long_len, 0.5, PISO * 0.38), (lx, y), z, ANTEP, m)
            me.box((long_len, 0.3, PISO * 0.62), (lx, y - s * 0.1), z + PISO * 0.38, VIDRIO, m)
    # parteluces verticales continuos (ritmo vertical de la fachada)
    for k in range(nmul + 1):
        x = x0 + k * long_len / nmul
        for s in (-1, 1):
            me.box((0.35, 0.8, h_tipo), (x, s * (hw - 0.05)), z_tipo, ALUM, m)
    # pretil y azotea
    me.box((L, ALA_W + 0.4, 1.4), (cx, 0), z_tipo + h_tipo, MARMOL, m)
    # equipos en azotea
    me.box((6, 4, 2.2), (cx + 4, 0), z_tipo + h_tipo + 0.2, CONC, m)
    return me.to_object(f"ISSSTE_ala_{idx+1}", root)

for i, a in enumerate(ANGULOS):
    ala(i, a)

# ------------------------------------------------------------ nucleo triangular
# vertices del triangulo apuntando entre las alas
nuc = Mesh()
tri = []
for a in (30, 150, 270):
    t = math.radians(a)
    tri.append((R_NUC * math.cos(t), R_NUC * math.sin(t)))
nuc.prism(tri, 0, ALTURA, MARMOL)
# cuerpo de elevadores sobre azotea (remate)
tri2 = [(x * 0.7, y * 0.7) for x, y in tri]
nuc.prism(tri2, ALTURA, 5.5, MARMOL)
# franjas de vidrio verticales en las tres caras del nucleo (cubos de escalera)
for i in range(3):
    a, b = Vector((*tri[i], 0)), Vector((*tri[(i + 1) % 3], 0))
    mid = (a + b) / 2
    d = (b - a).normalized()
    nrm = Vector((d.y, -d.x, 0))
    if nrm.dot(mid) < 0:
        nrm = -nrm
    ang = math.atan2(d.y, d.x)
    m = Matrix.Translation(mid + nrm * 0.15) @ Matrix.Rotation(ang, 4, "Z")
    nuc.box((2.2, 0.4, ALTURA - PB - 3), (0, 0), PB + 1.5, VIDRIO, m)
nuc.to_object("ISSSTE_nucleo", root)

# ------------------------------------------------------------ plaza, vestibulo y calle
pz = Mesh()
pz.box((150, 130, 0.25), (0, -15), -0.25, PLAZA)
# marquesina de acceso principal entre las dos alas frontales
pz.box((16, 9, 0.6), (0, -R_NUC - 6), PB - 0.6, MARMOL)
pz.box((15.6, 8.6, 0.05), (0, -R_NUC - 6), PB - 0.65, GUINDA)
for x in (-7, 7):
    pz.cyl(0.35, PB - 0.6, (x, -R_NUC - 10), 0, MARMOL, 12)
# escalinata / plataforma
for i in range(3):
    pz.box((24 - i * 2, 4 - i, 0.18), (0, -R_NUC - 13 + i * 0.6), i * 0.18, PLAZA)
# jardineras
for x, y in ((-34, -40), (34, -40), (-50, 5), (50, 5), (0, 40)):
    pz.box((12, 5, 0.7), (x, y), 0, CONC)
    pz.box((11.4, 4.4, 0.1), (x, y), 0.7, VERDE)
# astas de bandera
for i, x in enumerate((-14, 0, 14)):
    pz.cyl(0.12, 14, (x, -58), 0, ALUM, 8)
# calle Jesus Garcia (al frente)
pz.box((180, 18, 0.05), (0, -82), 0, ASF)
for i in range(12):
    pz.box((5, 0.25, 0.02), (-80 + i * 15, -82), 0.05, LINEA)
pz.box((180, 3, 0.25), (0, -71.5), 0, PLAZA)  # banqueta
pz.to_object("ISSSTE_plaza", root)

# bandera
fl = Mesh()
fl.box((3.6, 0.05, 2.1), (1.9, 0), 11.6, GUINDA, Matrix.Translation((0, -58, 0)))
fl.to_object("ISSSTE_bandera", root)

# letrero en el remate del nucleo, mirando al frente (-Y)
cu = bpy.data.curves.new("ISSSTE_letrero", "FONT")
cu.body = "ISSSTE"; cu.size = 3.2; cu.align_x = "CENTER"; cu.extrude = 0.15
txt = bpy.data.objects.new("ISSSTE_letrero", cu)
txt.data.materials.append(MATS[GUINDA])
txt.location = (0, -1.0, ALTURA + 5.5)
txt.rotation_euler = (math.radians(90), 0, 0)
col.objects.link(txt); txt.parent = root

# ------------------------------------------------------------ luz, camara, cielo
sun = bpy.data.lights.get("IB_Sol") or bpy.data.lights.new("IB_Sol", "SUN")
sun.energy = 4.0; sun.angle = math.radians(2)
so = bpy.data.objects.new("IB_Sol", sun)
so.rotation_euler = (math.radians(48), math.radians(8), math.radians(-30))
col.objects.link(so)

cd = bpy.data.cameras.new("IB_Camara"); cd.lens = 32; cd.clip_end = 2000
cam = bpy.data.objects.new("IB_Camara", cd)
cam.location = (-95, -165, 55)
cam.rotation_euler = (Vector((0, 0, 28)) - cam.location).to_track_quat("-Z", "Y").to_euler()
col.objects.link(cam)
bpy.context.scene.camera = cam

w = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = w
w.use_nodes = True
bg = next((n for n in w.node_tree.nodes if n.type == "BACKGROUND"), None)
if bg:
    bg.inputs["Color"].default_value = (*lin("#C9DCEB"), 1)
    bg.inputs["Strength"].default_value = 0.9

print("Modelo ISSSTE Buenavista creado:", NIV, "niveles,", ALTURA, "m")

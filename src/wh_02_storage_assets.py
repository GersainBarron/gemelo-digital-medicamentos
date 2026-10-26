# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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

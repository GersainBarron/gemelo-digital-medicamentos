# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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

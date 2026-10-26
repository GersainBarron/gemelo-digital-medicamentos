# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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

# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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

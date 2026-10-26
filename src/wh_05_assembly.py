# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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

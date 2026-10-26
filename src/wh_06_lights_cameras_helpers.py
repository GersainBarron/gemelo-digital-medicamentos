# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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

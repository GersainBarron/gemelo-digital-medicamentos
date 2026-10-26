# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT

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

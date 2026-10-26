# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
# =====================================================================
#  cedis_claves.py · Fase 2: ubicaciones del CEDIS ligadas al inventario
#
#  Abre almacen_medicamentos.blend y:
#   1. asigna una clave CNIS a cada ubicación (empties *_Slot_*) con
#      propiedades wh_clave, wh_clave_nombre, wh_ven, wh_grupo y wh_zona_inv:
#        · racks de tarima A–E: claves de farmacia por grupo terapéutico,
#        · racks del cuarto frío: claves de red fría,
#        · rack de controlados (CM): estupefacientes y psicotrópicos,
#        · racks y estantes de picking: todas las claves (por rotación);
#   2. pone un letrero en la cabecera de cada rack de tarima con su grupo;
#   3. guarda el .blend, exporta el GLB (export_glb de warehouse_builder) y
#      escribe web/assets/slot_claves.json, que el visor usa para la capa
#      "Cobertura por clave" (color según días de cobertura del CEDIS).
#  Uso (Blender): exec(open(r"...\\bodega\\cedis_claves.py", encoding="utf-8").read()); main()
#  y después, en otra llamada: export()
# =====================================================================
import bpy, bmesh, json, os, re, importlib.util
from mathutils import Vector

ROOT = os.environ.get("BODEGA_ROOT") or os.path.expanduser(r"~\OneDrive\Escritorio\bodega")
BLEND = os.path.join(ROOT, "almacen_medicamentos.blend")
CAT = os.path.join(ROOT, "web", "assets", "medicamentos.json")
OUT = os.path.join(ROOT, "web", "assets", "slot_claves.json")
GROUP_COL = {
    'Analgesia': (0.95, 0.62, 0.2), 'Infecciosas': (0.85, 0.3, 0.3), 'Cardiología': (0.9, 0.35, 0.55),
    'Endocrinología': (0.3, 0.6, 0.95), 'Gastroenterología': (0.55, 0.75, 0.3), 'Neumología': (0.35, 0.8, 0.85),
    'Hematología': (0.7, 0.2, 0.25), 'Gineco-obstetricia': (0.85, 0.5, 0.85), 'Inmunoalergia': (0.95, 0.85, 0.3),
    'Soluciones': (0.4, 0.55, 0.9), 'Anestesia': (0.6, 0.6, 0.65),
}


def spread(items, slots, weight):
    """Reparte la lista de ubicaciones en bloques contiguos proporcionales al peso."""
    tot = sum(weight(m) for m in items) or 1
    out, i = {}, 0
    for k, m in enumerate(items):
        n = len(slots) - i if k == len(items) - 1 else max(1, round(len(slots) * weight(m) / tot))
        for s in slots[i:i + n]:
            out[s] = m
        i += n
        if i >= len(slots):
            break
    return out


def slot_key(n):
    return [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', n)]


def assign(cat):
    items = cat['items']
    slots = sorted([o.name for o in bpy.data.objects if o.type == 'EMPTY' and '_Slot_' in o.name and o.get('wh_type') in ('slot_pallet', 'slot_shelf')], key=slot_key)
    pallet = [s for s in slots if re.match(r'^Rack_[A-E][12]_', s)]
    cold = [s for s in slots if s.startswith('Rack_Cold_')]
    ctrl = [s for s in slots if s.startswith('Rack_CM_')]
    pick = [s for s in slots if s not in set(pallet) | set(cold) | set(ctrl) and not s.startswith('Office')]
    w = lambda m: m.get('w') or 4
    F = sorted([m for m in items if m['u'] == 'F' and not m.get('frio') and not m.get('ctrl')], key=lambda m: (m['g'], -w(m)))
    amap = {}
    amap.update(spread(F, pallet, w))
    amap.update(spread([m for m in items if m.get('frio')], cold, w))
    amap.update(spread([m for m in items if m.get('ctrl')], ctrl, w))
    amap.update(spread(sorted([m for m in items if not m.get('frio') and not m.get('ctrl')], key=lambda m: -w(m)), pick, w))
    zone = lambda s: 'tarima' if s in pallet else 'red_fria' if s in cold else 'controlados' if s in ctrl else 'picking'
    for s, m in amap.items():
        o = bpy.data.objects[s]
        o['wh_clave'] = m['c']; o['wh_clave_nombre'] = m['n']; o['wh_ven'] = m.get('ven', 'E')
        o['wh_grupo'] = m['g']; o['wh_zona_inv'] = zone(s)
    return amap, pallet


def mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.5
    m.diffuse_color = (*rgb, 1)          # color en vista sólida / Workbench
    return m


def signs(amap, pallet):
    """Letrero de cabecera por rack de tarima: placa con el color del grupo y texto."""
    col = bpy.data.collections.get('INV_Letreros') or bpy.data.collections.new('INV_Letreros')
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m.name.startswith('INV_') and not m.users]:
        bpy.data.meshes.remove(me)
    white = mat('INV_Texto', (0.97, 0.97, 0.97))
    made = 0
    for rack in sorted({s.split('_Slot_')[0] for s in pallet}):
        ro = bpy.data.objects.get(rack)
        ss = [bpy.data.objects[s] for s in pallet if s.startswith(rack + '_')]
        if not ss:
            continue
        groups = []
        for s in ss:
            g = amap[s.name]['g']
            if g not in groups:
                groups.append(g)
        ps = [s.matrix_world.translation for s in ss]
        x = sum(p.x for p in ps) / len(ps); ymin = min(p.y for p in ps); ztop = max(p.z for p in ps) + 1.25
        # placa
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        me = bpy.data.meshes.new(f'INV_Letrero_{rack}')
        bm.to_mesh(me); bm.free()
        plate = bpy.data.objects.new(f'INV_Letrero_{rack}', me)
        plate.location = (x, ymin - 0.9, ztop); plate.scale = (1.5, 0.04, 0.42)
        plate.data.materials.append(mat(f'INV_Grupo_{groups[0]}', GROUP_COL.get(groups[0], (0.6, 0.6, 0.6))))
        plate['wh_type'] = 'inv_sign'; plate['wh_rack'] = rack; plate['wh_grupos'] = ', '.join(groups)
        col.objects.link(plate)
        # texto (convertido a malla para que viaje en el GLB)
        cu = bpy.data.curves.new(f'INV_Txt_{rack}', 'FONT')
        cu.body = f"{rack.replace('Rack_', 'Rack ')}\n{groups[0]}{' +' + str(len(groups) - 1) if len(groups) > 1 else ''}"
        cu.size = 0.17; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.resolution_u = 2   # texto plano y ligero para el GLB
        t = bpy.data.objects.new(f'INV_Txt_{rack}', cu)
        t.location = (x, ymin - 0.945, ztop); t.rotation_euler = (1.5708, 0, 0)
        t.data.materials.append(white)
        col.objects.link(t)
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(t.evaluated_get(dg))
        tm = bpy.data.objects.new(f'INV_Texto_{rack}', me2)
        tm.matrix_world = t.matrix_world.copy()
        col.objects.link(tm)
        bpy.data.objects.remove(t, do_unlink=True)
        made += 1
    return made


def main():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    cat = json.load(open(CAT, encoding='utf-8'))
    amap, pallet = assign(cat)
    n = signs(amap, pallet)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'fuente': 'cedis_claves.py', 'slots': {s: m['c'] for s, m in amap.items()}}, f, ensure_ascii=False)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    return {'slots': len(amap), 'letreros': n}


def export():
    spec = importlib.util.spec_from_file_location('wb', os.path.join(ROOT, 'warehouse_builder.py'))
    wb = importlib.util.module_from_spec(spec); spec.loader.exec_module(wb)
    glb = os.path.join(ROOT, 'almacen_medicamentos.glb')
    size = wb.export_glb(glb)
    import shutil
    shutil.copyfile(glb, os.path.join(ROOT, 'web', 'assets', 'almacen_medicamentos.glb'))
    return {'glb': size}

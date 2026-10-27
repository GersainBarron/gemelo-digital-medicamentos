// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  main.js · Visor 3D del almacén de medicamentos (three.js)
//  - Carga almacen_medicamentos.glb + warehouse_layout.json
//  - Agrupa la geometría estática en InstancedMesh (pocas llamadas de dibujo:
//    clave para el rendimiento en iPad) sin perder la identidad de cada objeto
//  - Cámaras predefinidas, capas, inspección por toque y simulación
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Simulation, b2t } from './sim.js';
import { UI, TYPE_ES, fieldName, prettyValue, prettySlot, zoneName } from './ui.js';
import { Ops } from './ops.js';
import { OpsUI } from './ops-ui.js';
import { UnitSupply, makeCalendar } from './supply.js';
import { CedisLink } from './cedis-link.js';
import { initScenario } from './scenario-ui.js';
import { installInventory } from './network-sim.js';
import { Contratos } from './contratos.js';
import { Contratos3D } from './contratos-3d.js';
import { ContratosUI } from './contratos-ui.js';

const MODEL_URL = 'assets/almacen_medicamentos.glb';
const LAYOUT_URL = 'assets/warehouse_layout.json';
const UNITS_URL = 'assets/unidades_hidalgo.json';       // red IMSS/ISSSTE de Hidalgo (CLUES)
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

// Partes que no se seleccionan por sí solas (se selecciona el objeto padre)
const SUBPARTS = new Set(['wheel', 'caster', 'mast', 'mast_inner', 'carriage', 'door_curtain', 'door_leaf', 'drawer', 'handle',
  'lift_plate', 'dock_leveler', 'dock_signal', 'fork_point', 'slot_pallet', 'slot_shelf', 'slot_cart', 'slot_amr', 'conveyor_port']);
// Objetos que no abren el inspector al tocarlos
const NO_PICK_TYPES = new Set(['floor', 'roof', 'structure', 'skylight', 'sprinklers', 'floor_marking', 'floor_text', 'floor_arrow']);
const NO_PICK_NAMES = /^(Ground_|Yard_|Building_|Windows_|Floor_)/;
// Categorías para mostrar/ocultar (por el nombre del objeto raíz)
const CATEGORY_RULES = [
  ['roof', /^(Roof_|Sprinkler_|Lamp_HighBay)/],
  ['walls', /^(Wall_|Windows_)/],
  ['exterior', /^(Ground_|Yard_|Tree_|Trailer_|Load_Trailer_)/],
];

const ZONE_COLORS = {
  Receiving: 0xf5b400, Charging: 0xfb923c, Packing: 0xa78bfa, Dispatch: 0x34d399, Main_Aisle: 0x94a3b8,
  Storage: 0x60a5fa, Picking: 0x22d3ee, Controlled_Meds: 0xf87171, Cold_Storage: 0x7dd3fc,
};
const ROUTE_COLORS = { forklift: 0xf5b400, picking: 0x3b82f6, pedestrian: 0x22c55e, agv: 0x14d8d0 };

const LAYERS = [
  { id: 'roof', label: 'Techo y luminarias', hint: 'Oculto para ver el interior' },
  { id: 'walls', label: 'Muros', hint: 'Fachadas y ventanas' },
  { id: 'exterior', label: 'Exterior', hint: 'Patio, tráileres y árboles' },
  { id: 'routes', label: 'Rutas', hint: 'Montacargas, picking, AGV y peatonales' },
  { id: 'zones', label: 'Zonas operativas', hint: 'Áreas coloreadas en el piso' },
  { id: 'slots', label: 'Ocupación de ubicaciones', hint: 'Verde libre · rojo ocupado' },
  { id: 'cover', label: 'Cobertura por clave', hint: 'Rojo sin existencia · ámbar reparto o < 10 días · verde normal · azul sobreinventario' },
  { id: 'nodes', label: 'Nodos de circulación', hint: 'Grafo para la simulación' },
  { id: 'labels', label: 'Etiquetas', hint: 'Nombres de equipos (y de zonas con su capa)' },
  { id: 'shadows', label: 'Sombras', hint: 'Más realista, más exigente' },
];

const app = {
  layers: { roof: false, walls: true, exterior: true, routes: true, zones: false, slots: false, cover: false, nodes: false, labels: true, shadows: false },
  cats: { main: [], roof: [], walls: [], exterior: [] },
  pickables: [], parts: new Map(), byName: new Map(),
  selected: null, following: false, needsRender: true, flight: null,
};

// ---------------------------------------------------------------------
window.__visor = app;   // acceso para depuración desde la consola

init().catch(err => {
  console.error(err);
  const local = location.protocol === 'file:';
  app.ui?.showError(local
    ? 'Abre la página con el servidor local (<b>serve.bat</b>), no con doble clic en el archivo.'
    : 'No se pudo cargar el modelo: ' + (err.message || err));
});

async function init() {
  initScenario();
  app.ui = new UI({
    onTogglePlay: () => setPlaying(!app.sim.running),
    onSpeed: x => { app.sim.speed = x; app.ui.setSpeed(x); },
    onCamera: id => flyTo(id),
    onLayer: (id, v) => setLayer(id, v),
    onDeselect: () => select(null),
    onFocusSelected: () => app.selected && focusOn(app.selected),
    onToggleFollow: () => { app.following = !app.following; app.ui.setFollowing(app.following); app._followPrev = null; },
    onSelectByName: n => { const o = app.byName.get(n); if (o) { select(o); focusOn(o); } },
  });
  if (location.protocol === 'file:') throw new Error('file');

  setupRenderer();
  app.ui.setProgress(0.03, 'Cargando datos del layout…');
  [app.layout, app.unitsData] = await Promise.all([LAYOUT_URL, UNITS_URL].map(u => fetch(u).then(r => r.json())));
  const gltf = await loadModel();
  app.ui.setProgress(0.96, 'Preparando escena…');
  await nextFrame();

  app.root = gltf.scene;
  app.scene.add(app.root);
  app.root.traverse(o => { if (o.name) app.byName.set(o.name, o); });
  attachCarriedItems();

  app.sim = new Simulation(app.layout, n => app.byName.get(n) || null, app.root);
  app.dynamicRoots = new Set([...app.sim.dynamicNames].map(n => app.byName.get(n)).filter(Boolean));
  batchStatic();
  buildOverlays();
  app.sim.onSlotChange = s => updateSlotMarker(s);

  // Operación logística: entradas, salidas, rutas a unidades médicas y emergencias
  app.ops = new Ops(app.unitsData, app.sim);
  app.ops.onEmergency = e => {
    if (e.fromUnit) app.ui.toast(`${e.level === 1 ? 'Solicitud vital' : 'Alerta de unidad'} ${e.id} · ${e.unit.nombre}: se agotó ${e.item.split(' · ')[0]}`);
    else if (e.level === 1) app.ui.toast(`Solicitud vital ${e.id} · ${e.unit.nombre}`);
  };
  // Enlace con las unidades: sus claves agotadas llegan como solicitudes urgentes
  fetch('assets/medicamentos.json').then(r => r.json()).then(cat => {
    app.catalog = cat;
    app.inv = app.ops.inv = installInventory(app.ops.data, cat);
    fetch('assets/slot_claves.json').then(r => r.json()).then(j => { app.slotClaves = j.slots; }).catch(() => {});
    app.link = app.ops.link = new CedisLink(app.ops, cat);
    app.link.tick(app.ops.now, true);
    // Contratos, órdenes de suministro y patio de proveedores (contratos.js + contratos_patio.glb)
    try {
      app.contratos = new Contratos(app.inv, cat);
      app.c3d = new Contratos3D(app, app.contratos);
      app.cUI = new ContratosUI(app, app.contratos, app.c3d, { onFocusPatio: () => flyTo('patio') });
      app.c3d.onPick = e => {
        if (e.type === 'os') app.cUI.show(e.cam.os.contrato, e.os);     // camión → su orden de suministro
        else app.cUI.show(e.id);                                        // lámpara del tablero → contrato
      };
      app.c3d.load().catch(err => console.warn('Sin patio de proveedores', err));
    } catch (err) { console.warn('Sin motor de contratos', err); }
  }).catch(err => { console.warn('Sin enlace con unidades', err); app.ops.autoRandom = true; });
  document.getElementById('go-map').addEventListener('click', e => { e.currentTarget.href = `mapa.html?t=${Math.floor(app.sim.time)}`; });
  document.getElementById('go-unit').addEventListener('click', e => { e.currentTarget.href = `unidad.html?t=${Math.floor(app.sim.time)}`; });
  for (const id of ['go-contracts', 'ct-open']) document.getElementById(id)?.addEventListener('click', e => { e.currentTarget.href = `contratos.html?t=${Math.floor(app.sim.time)}`; });
  document.getElementById('ct-rec')?.addEventListener('click', e => { e.currentTarget.href = `expedientes.html?t=${Math.floor(app.sim.time)}`; });
  app.opsUI = new OpsUI(app.ops, { onShowUnit: (u, rows) => showUnit(u, rows) });
  const baseAlerts = app.sim.alerts.bind(app.sim);
  app.sim.alerts = () => [...app.ops.alerts(), ...baseAlerts()];

  app.ui.buildLayers(LAYERS, app.layers);
  for (const l of LAYERS) setLayer(l.id, app.layers[l.id], true);
  app.ui.setPresets(PRESETS_LIST());
  app.ui.setSpeed(1);
  setPlaying(true);
  jumpTo('aerial');
  app.ui.setProgress(1, 'Listo');
  app.ui.hideLoading();

  let last = performance.now(), kpiAcc = 1;
  app.renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    app.sim.update(dt);
    app.c3d?.update(app.ops.now);
    stepFlight(dt);
    stepFollow();
    const moving = app.sim.running || app.flight || app.controls._moving;
    if (app.controls.enableDamping) app.controls.update();
    if (moving || app.needsRender) {
      if (app.selected && isDynamicObj(app.selected)) updateSelectionBox();
      updateLabels();
      app.renderer.render(app.scene, app.camera);
      app.needsRender = false;
    }
    kpiAcc += dt;
    if (kpiAcc > 0.25) {
      kpiAcc = 0;
      app.ops.update();
      app.link?.tick(app.ops.now);
      app.cUI?.update(0.25);
      app.ui.updateKPIs(app.sim);
      app.opsUI.update();
      app.ui.setClock(app.ops.clockLabel());
      if (app.selected && app.selectedAgent) app.ui.updateInspectorLive(liveOf(app.selectedAgent));
    }
  });
}

// ---------------------------------------------------------------------
//  Render, cámara, luces
// ---------------------------------------------------------------------
function setupRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
  r.setSize(window.innerWidth, window.innerHeight);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('viewport').appendChild(r.domElement);
  app.renderer = r;

  const scene = new THREE.Scene();
  const sky = new THREE.Color(0xc8d2dc);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 140, 380);
  app.scene = scene;

  const hemi = new THREE.HemisphereLight(0xf4f7ff, 0x5b5f66, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e5, 1.5);
  sun.position.copy(b2t(70, -50, 80));
  sun.target.position.copy(b2t(25, 15, 0));
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 220 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  app.sun = sun;
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  app.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 900);
  const c = new OrbitControls(app.camera, r.domElement);
  c.enableDamping = true; c.dampingFactor = 0.09;
  c.maxPolarAngle = THREE.MathUtils.degToRad(88);
  c.minDistance = 1.5; c.maxDistance = 260;
  c.screenSpacePanning = true;
  c.addEventListener('start', () => { c._moving = true; app.flight = null; });
  c.addEventListener('end', () => { c._moving = false; app.needsRender = true; });
  c.addEventListener('change', () => { app.needsRender = true; });
  app.controls = c;

  window.addEventListener('resize', onResize);
  setupPicking(r.domElement);
}

function onResize() {
  app.camera.aspect = window.innerWidth / window.innerHeight;
  if (app.camLens) app.camera.fov = fovFromLens(app.camLens);
  app.camera.updateProjectionMatrix();
  app.renderer.setSize(window.innerWidth, window.innerHeight);
  app.needsRender = true;
}

function loadModel() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(MODEL_URL, resolve, e => {
      const total = e.total || 4.1e6;
      app.ui.setProgress(0.05 + 0.88 * Math.min(1, e.loaded / total), `Descargando modelo 3D… ${(e.loaded / 1e6).toFixed(1)} MB`);
    }, reject);
  });
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------------
//  Objetos transportados: se cuelgan del equipo para moverse con él
// ---------------------------------------------------------------------
function attachCarriedItems() {
  const isDesc = (o, a) => { for (let t = o; t; t = t.parent) if (t === a) return true; return false; };
  const items = [];
  app.root.traverse(o => { if (o.userData?.wh_carried_by) items.push(o); });
  for (const o of items) {
    const host = app.byName.get(o.userData.wh_carried_by);
    if (host && !isDesc(o, host)) host.attach(o);
  }
  // Cajas sobre carritos (nombradas Cart_xx_...)
  for (const cart of ['Cart_Picking_01', 'Cart_Picking_02', 'Cart_Picking_03']) {
    const host = app.byName.get(cart); if (!host) continue;
    for (const o of [...app.root.children]) if (o !== host && o.name.startsWith(cart + '_')) host.attach(o);
  }
}

// ---------------------------------------------------------------------
//  Agrupación estática -> InstancedMesh (manteniendo identidad por instancia)
// ---------------------------------------------------------------------
function topOf(o) { let t = o; while (t.parent && t.parent !== app.root) t = t.parent; return t; }
function ownerOf(o) {
  for (let t = o; t && t !== app.root; t = t.parent) {
    const ty = t.userData?.wh_type;
    if (ty && !SUBPARTS.has(ty)) return t;
  }
  return topOf(o);
}
function categoryOf(o) {
  const n = topOf(o).name;
  for (const [c, re] of CATEGORY_RULES) if (re.test(n)) return c;
  return 'main';
}
function isDynamicObj(o) { for (let t = o; t && t !== app.root; t = t.parent) if (app.dynamicRoots.has(t)) return true; return false; }
function addPart(owner, part) { let l = app.parts.get(owner); if (!l) app.parts.set(owner, l = []); l.push(part); }

function batchStatic() {
  app.root.updateMatrixWorld(true);
  const meshes = [];
  app.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const groups = new Map();
  for (const m of meshes) {
    if (isDynamicObj(m)) { addPart(ownerOf(m), { mesh: m }); app.pickables.push(m); continue; }
    const cat = categoryOf(m);
    const key = cat + '|' + m.geometry.uuid + '|' + m.material.uuid;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { cat, geo: m.geometry, mat: m.material, items: [] });
    g.items.push(m);
  }
  app.batch = new THREE.Group(); app.batch.name = 'StaticBatches';
  app.scene.add(app.batch);
  let draws = 0;
  for (const g of groups.values()) {
    draws++;
    if (g.items.length < 2) {
      const m = g.items[0];
      app.cats[g.cat].push(m); app.pickables.push(m); addPart(ownerOf(m), { mesh: m });
      continue;
    }
    const im = new THREE.InstancedMesh(g.geo, g.mat, g.items.length);
    im.owners = new Array(g.items.length);
    g.items.forEach((m, i) => {
      im.setMatrixAt(i, m.matrixWorld);
      const ow = ownerOf(m);
      im.owners[i] = ow; addPart(ow, { im, index: i });
      m.removeFromParent();
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingBox(); im.computeBoundingSphere();
    app.batch.add(im); app.cats[g.cat].push(im); app.pickables.push(im);
  }
  // categoría de objetos dinámicos = principal
  console.info(`[visor] ${meshes.length} mallas → ${draws} lotes estáticos + ${app.pickables.filter(p => !p.isInstancedMesh).length} mallas individuales`);
}

// ---------------------------------------------------------------------
//  Capas superpuestas: rutas, zonas, nodos, ocupación de ubicaciones
// ---------------------------------------------------------------------
function buildOverlays() {
  const L = app.layout;
  // Rutas como cintas planas sobre el piso
  const routes = new THREE.Group(); routes.name = 'Overlay_Routes';
  for (const [name, r] of Object.entries(L.routes)) {
    const pts = r.points.map(p => b2t(p[0], p[1], 0.035));
    if (r.cyclic) pts.push(pts[0].clone());
    const w = r.kind === 'pedestrian' ? 0.12 : 0.16;
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = new THREE.Vector3().subVectors(b, a).normalize();
      const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(w / 2);
      const a1 = a.clone().add(n), a2 = a.clone().sub(n), b1 = b.clone().add(n), b2 = b.clone().sub(n);
      pos.push(...a1.toArray(), ...a2.toArray(), ...b1.toArray(), ...b1.toArray(), ...a2.toArray(), ...b2.toArray());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ color: ROUTE_COLORS[r.kind] || 0xffffff, transparent: true, opacity: 0.85,
      depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.renderOrder = 2;
    routes.add(mesh);
  }
  app.scene.add(routes); app.ovRoutes = routes;

  // Zonas
  const zones = new THREE.Group(); zones.name = 'Overlay_Zones';
  app.zoneLabels = [];
  for (const [z, b] of Object.entries(L.zones)) {
    const [x0, y0, x1, y1] = b;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ylvl = z === 'Office' ? 6.2 : 0.02;
    if (z !== 'Office') {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0),
        new THREE.MeshBasicMaterial({ color: ZONE_COLORS[z] || 0xffffff, transparent: true, opacity: 0.2, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -1 }));
      pl.rotation.x = -Math.PI / 2; pl.position.copy(b2t(cx, cy, ylvl)); pl.renderOrder = 1;
      zones.add(pl);
      const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        b2t(x0, y0, 0.04), b2t(x1, y0, 0.04), b2t(x1, y1, 0.04), b2t(x0, y1, 0.04)]),
        new THREE.LineBasicMaterial({ color: ZONE_COLORS[z] || 0xffffff }));
      zones.add(edge);
    }
    app.zoneLabels.push({ text: zoneLabelText(z), pos: b2t(cx, cy, z === 'Office' ? 6.6 : 1.2), kind: 'zone' });
  }
  app.scene.add(zones); app.ovZones = zones;

  // Nodos de circulación
  const nodes = Object.entries(L.nodes);
  const nm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), nodes.length);
  const NODE_COL = { node_main: 0xf5b400, node_dock: 0x34d399, node_aisle: 0x60a5fa, node_station: 0xa78bfa, node_charger: 0xfb923c,
    pickup: 0x22d3ee, dropoff: 0x34d399, load_point: 0xf87171 };
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  nodes.forEach(([n, d], i) => {
    mtx.makeTranslation(b2t(d.pos[0], d.pos[1], 0.35));
    nm.setMatrixAt(i, mtx); nm.setColorAt(i, col.set(NODE_COL[d.type] || (d.type.startsWith('access') ? 0xe2e8f0 : 0x94a3b8)));
  });
  nm.computeBoundingSphere(); nm.name = 'Overlay_Nodes';
  app.scene.add(nm); app.ovNodes = nm;

  // Ocupación de ubicaciones (racks y estantes)
  const slots = app.sim.slots.filter(s => s.type === 'slot_pallet' || s.type === 'slot_shelf');
  const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), slots.length);
  app.slotIndex = new Map();
  slots.forEach((s, i) => {
    const big = s.type === 'slot_pallet';
    mtx.compose(b2t(s.pos[0], s.pos[1], s.pos[2] + (big ? 0.06 : 0.03)), new THREE.Quaternion(),
      big ? new THREE.Vector3(0.45, 0.08, 0.45) : new THREE.Vector3(0.14, 0.04, 0.14));
    sm.setMatrixAt(i, mtx);
    sm.setColorAt(i, col.set(s.occupied ? 0xef4444 : 0x22c55e));
    app.slotIndex.set(s.name, i);
  });
  sm.computeBoundingSphere(); sm.name = 'Overlay_Slots'; sm.renderOrder = 3;
  app.scene.add(sm); app.ovSlots = sm;

  // Etiquetas de equipos
  app.agentLabels = app.sim.agents.filter(a => a.path).map(a => ({ text: a.label, obj: a.obj, kind: 'agent', agent: a }));
  const box = document.getElementById('labels');
  for (const l of [...app.zoneLabels, ...app.agentLabels]) {
    l.el = document.createElement('div');
    l.el.className = 'lbl ' + l.kind;
    l.el.innerHTML = l.kind === 'agent' ? `<i></i>${l.text}` : l.text;
    box.appendChild(l.el);
  }

  // Caja de selección
  app.selBox = new THREE.Box3Helper(new THREE.Box3(), 0xffb020);
  app.selBox.visible = false; app.selBox.renderOrder = 10;
  app.selBox.material.depthTest = false; app.selBox.material.transparent = true;
  app.scene.add(app.selBox);
}

// Cobertura por clave: cada ubicación tiene una clave (cedis_claves.py en Blender → assets/slot_claves.json)
// y se pinta según el estado de esa clave en el inventario del CEDIS (network-sim.js).
const COVER_COL = { zero: 0xef4444, part: 0xf59e0b, low: 0xfbbf24, ok: 0x22c55e, over: 0x60a5fa };
async function updateCover(force) {
  if (!app.inv || !app.sim?.slots) return;
  if (!app.slotClaves) {
    if (app._scLoading) return;
    app._scLoading = true;
    try { app.slotClaves = (await fetch('assets/slot_claves.json').then(r => r.json())).slots; } catch { app.slotClaves = {}; }
  }
  const idx = Math.floor(app.ops.now / 86400);
  if (!app.ovCover) {
    const slots = app.sim.slots.filter(s => app.slotClaves[s.name]);
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }), slots.length);
    const mtx = new THREE.Matrix4();
    slots.forEach((s, i) => {
      const big = s.type === 'slot_pallet';
      mtx.compose(b2t(s.pos[0], s.pos[1], s.pos[2] + (big ? 0.7 : 0.15)), new THREE.Quaternion(), big ? new THREE.Vector3(1.0, 1.25, 1.0) : new THREE.Vector3(0.4, 0.25, 0.3));
      m.setMatrixAt(i, mtx); m.setColorAt(i, new THREE.Color(0x888888));
    });
    m.computeBoundingSphere(); m.name = 'Overlay_Cover'; m.renderOrder = 3; m.visible = !!app.layers.cover;
    m.userData.slots = slots;
    app.scene.add(m); app.ovCover = m;
  }
  if (!force && app._coverDay === idx) return;
  app._coverDay = idx;
  const lv = new Map(app.inv.rows(idx).map(r => [r.c, r.level])), col = new THREE.Color();
  app.ovCover.userData.slots.forEach((s, i) => app.ovCover.setColorAt(i, col.set(COVER_COL[lv.get(app.slotClaves[s.name])] ?? 0x888888)));
  app.ovCover.instanceColor.needsUpdate = true;
  app.needsRender = true;
}
setInterval(() => { if (app.layers.cover) updateCover(); }, 4000);

function zoneLabelText(z) {
  return { Cold_Storage: 'Cuarto frío 2–8 °C', Controlled_Meds: 'Controlados', Office: 'Oficina de control' }[z] || zoneName(z);
}

function updateSlotMarker(s) {
  const i = app.slotIndex.get(s.name);
  if (i === undefined) return;
  app.ovSlots.setColorAt(i, new THREE.Color(s.occupied ? 0xef4444 : 0x22c55e));
  app.ovSlots.instanceColor.needsUpdate = true;
  app.needsRender = true;
}

const _v = new THREE.Vector3();
function updateLabels() {
  if (!app.layers.labels) return;
  const w = window.innerWidth, h = window.innerHeight;
  const camPos = app.camera.position;
  const show = (l, p) => {
    _v.copy(p).project(app.camera);
    const vis = _v.z < 1 && _v.x > -1.05 && _v.x < 1.05 && _v.y > -1.05 && _v.y < 1.05;
    const dist = camPos.distanceTo(p);
    const ok = vis && (l.kind === 'zone' ? dist < 140 : dist < 70);
    if (!ok) { if (l._v !== false) { l.el.style.display = 'none'; l._v = false; } return; }
    if (l._v !== true) { l.el.style.display = ''; l._v = true; }
    l.el.style.transform = `translate(-50%, -100%) translate(${((_v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - _v.y) / 2 * h).toFixed(1)}px)`;
  };
  for (const l of app.zoneLabels) {
    if (app.layers.zones) show(l, l.pos);                     // nombres de zona solo con la capa Zonas
    else if (l._v !== false) { l.el.style.display = 'none'; l._v = false; }
  }
  for (const l of app.agentLabels) {
    _v.copy(l.obj.position); _v.y += /forklift|reach/.test(l.agent.type) ? 2.6 : 1.7;
    const p = _v.clone();
    const tone = l.agent.state === 'waiting' ? 'warn' : l.agent.state === 'moving' ? 'ok' : 'accent';
    if (l._tone !== tone) { l.el.dataset.tone = tone; l._tone = tone; }
    show(l, p);
  }
}

// ---------------------------------------------------------------------
//  Capas
// ---------------------------------------------------------------------
function setLayer(id, v, silent) {
  app.layers[id] = v;
  if (app.cats[id]) for (const o of app.cats[id]) o.visible = v;
  if (id === 'routes') app.ovRoutes.visible = v;
  if (id === 'zones') app.ovZones.visible = v;
  if (id === 'nodes') app.ovNodes.visible = v;
  if (id === 'slots') app.ovSlots.visible = v;
  if (id === 'cover') { updateCover(true); if (app.ovCover) app.ovCover.visible = v; }
  if (id === 'labels') document.getElementById('labels').style.display = v ? '' : 'none';
  if (id === 'shadows') {
    app.renderer.shadowMap.enabled = v;
    app.sun.castShadow = v;
    app.scene.traverse(o => { if (o.isMesh && !o.name.startsWith('Overlay')) { o.castShadow = v; o.receiveShadow = v; } });
    app.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }
  if (!silent) app.ui.setLayer(id, v);
  app.needsRender = true;
}

// ---------------------------------------------------------------------
//  Cámaras predefinidas y transiciones
// ---------------------------------------------------------------------
const PRESET_META = [
  { id: 'aerial', label: 'Aérea', icon: '⬒' },
  { id: 'Camera_Overview', label: 'General', icon: '◩' },
  { id: 'Camera_Receiving', label: 'Recepción', icon: '⇣' },
  { id: 'Camera_Storage', label: 'Almacén', icon: '▥' },
  { id: 'Camera_Picking', label: 'Picking', icon: '☷' },
  { id: 'Camera_Dispatch', label: 'Despacho', icon: '⇡' },
  { id: 'cold', label: 'Cuarto frío', icon: '❄' },
  { id: 'Camera_Exterior', label: 'Exterior', icon: '⌂' },
  { id: 'patio', label: 'Patio y contratos', icon: '⛟' },
];
function PRESETS_LIST() { return PRESET_META; }

function presetData(id) {
  const cams = app.layout.cameras;
  if (id === 'aerial') return { pos: b2t(25, -26, 52), target: b2t(25, 14, 0), lens: 24, roof: false };
  if (id === 'patio') return { pos: b2t(4, -66, 30), target: b2t(6, -6, 0), lens: 26, roof: false };
  if (id === 'cold') return { pos: b2t(40.5, 18.0, 6.5), target: b2t(46.0, 24.5, 0.8), lens: 22, roof: false };
  const c = cams[id];
  if (!c) return null;
  return { pos: b2t(...c.pos), target: b2t(...c.target), lens: c.lens_mm, roof: id === 'Camera_Exterior' ? true : undefined };
}
function fovFromLens(lens) {
  const hfov = 2 * Math.atan(18 / lens);
  const aspect = window.innerWidth / window.innerHeight;
  const v = 2 * Math.atan(Math.tan(hfov / 2) / Math.max(aspect, 1e-3));
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 30, 80);
}
function jumpTo(id) {
  const p = presetData(id);
  app.camera.position.copy(p.pos); app.controls.target.copy(p.target);
  app.camLens = p.lens; app.camera.fov = fovFromLens(p.lens); app.camera.updateProjectionMatrix();
  if (p.roof !== undefined) setLayer('roof', p.roof);
  app.ui.setActivePreset(id);
  app.controls.update(); app.needsRender = true;
}
function flyTo(id) {
  const p = presetData(id); if (!p) return;
  stopFollow();
  if (p.roof !== undefined && p.roof !== app.layers.roof) setLayer('roof', p.roof);
  app.flight = { t: 0, dur: 1.4, p0: app.camera.position.clone(), t0: app.controls.target.clone(), p1: p.pos, t1: p.target,
    f0: app.camera.fov, f1: fovFromLens(p.lens), lens: p.lens };
  app.ui.setActivePreset(id);
}
function focusOn(obj) {
  stopFollow(true);
  const box = selectionBox(obj);
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length(), 1.5);
  // vista elevada (evita quedar dentro de racks o muros), conservando el rumbo actual
  const dir = new THREE.Vector3().subVectors(app.camera.position, app.controls.target);
  dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize().multiplyScalar(0.55); dir.y = 0.83; dir.normalize();
  const dist = THREE.MathUtils.clamp(r * 2.2, 9, 60);
  app.flight = { t: 0, dur: 1.0, p0: app.camera.position.clone(), t0: app.controls.target.clone(),
    p1: c.clone().addScaledVector(dir, dist), t1: c, f0: app.camera.fov, f1: app.camera.fov, lens: app.camLens };
  app.ui.setActivePreset(null);
}
function stepFlight(dt) {
  const f = app.flight; if (!f) return;
  f.t += dt;
  const k = Math.min(1, f.t / f.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  app.camera.position.lerpVectors(f.p0, f.p1, e);
  app.controls.target.lerpVectors(f.t0, f.t1, e);
  app.camera.fov = f.f0 + (f.f1 - f.f0) * e; app.camera.updateProjectionMatrix();
  if (k >= 1) { app.flight = null; app.camLens = f.lens; }
  app.needsRender = true;
}
function stepFollow() {
  if (!app.following || !app.selected) return;
  const p = app.selected.getWorldPosition(new THREE.Vector3());
  if (app._followPrev) {
    const d = p.clone().sub(app._followPrev);
    app.camera.position.add(d); app.controls.target.add(d);
  } else if (!app.flight) {
    focusOn(app.selected); app.following = true; app.ui.setFollowing(true);
  }
  if (!app.flight) app._followPrev = p;
}
function stopFollow(keepFlag) {
  if (!keepFlag) { app.following = false; app.ui?.setFollowing(false); }
  app._followPrev = null;
}

// ---------------------------------------------------------------------
//  Selección por toque / clic
// ---------------------------------------------------------------------
function setupPicking(canvas) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
  canvas.addEventListener('pointerup', e => {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 8 || !quick || !app.root) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, app.camera);
    const hits = ray.intersectObjects(app.pickables.filter(visibleChain), false);
    for (const h of hits) {
      const owner = h.object.isInstancedMesh ? h.object.owners[h.instanceId] : ownerOf(h.object);
      if (!owner) continue;
      if (NO_PICK_TYPES.has(owner.userData?.wh_type) || NO_PICK_NAMES.test(owner.name)) { select(null); return; }
      select(owner); return;
    }
    select(null);
  });
}
function visibleChain(o) { for (let t = o; t; t = t.parent) if (!t.visible) return false; return true; }

const TINT = new THREE.Color(1.0, 0.72, 0.35), WHITE = new THREE.Color(1, 1, 1);
function tint(owner, on) {
  for (const p of app.parts.get(owner) || []) {
    if (p.im) {
      if (!p.im.instanceColor) { for (let i = 0; i < p.im.count; i++) p.im.setColorAt(i, WHITE); }
      p.im.setColorAt(p.index, on ? TINT : WHITE); p.im.instanceColor.needsUpdate = true;
    } else if (p.mesh) {
      if (on) { p.mesh.userData._mat = p.mesh.material; p.mesh.material = p.mesh.material.clone(); p.mesh.material.emissive?.setRGB(0.35, 0.18, 0.0); }
      else if (p.mesh.userData._mat) { p.mesh.material.dispose(); p.mesh.material = p.mesh.userData._mat; delete p.mesh.userData._mat; }
    }
  }
}
function ownerTree(owner) {
  // incluye partes de los descendientes (ruedas, mástil, carga…)
  const out = [owner];
  owner.traverse(o => { if (o !== owner && app.parts.has(o)) out.push(o); });
  return out;
}
function select(owner) {
  if (app.selected) ownerTree(app.selected).forEach(o => tint(o, false));
  app.selected = owner; app.selectedAgent = null;
  stopFollow();
  if (!owner) { app.selBox.visible = false; app.ui.hideInspector(); app.needsRender = true; return; }
  ownerTree(owner).forEach(o => tint(o, true));
  updateSelectionBox();
  const agent = app.sim.agents.find(a => a.obj === owner);
  app.selectedAgent = agent || null;
  app.ui.showInspector(describe(owner, agent));
  app.needsRender = true;
}
function selectionBox(owner) {
  const box = new THREE.Box3(), tmp = new THREE.Box3(), m = new THREE.Matrix4();
  for (const o of ownerTree(owner)) for (const p of app.parts.get(o) || []) {
    if (p.im) {
      if (!p.im.geometry.boundingBox) p.im.geometry.computeBoundingBox();
      p.im.getMatrixAt(p.index, m);
      tmp.copy(p.im.geometry.boundingBox).applyMatrix4(m); box.union(tmp);
    } else if (p.mesh && p.mesh.visible) { tmp.setFromObject(p.mesh); box.union(tmp); }
  }
  if (box.isEmpty()) box.setFromCenterAndSize(owner.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(1, 1, 1));
  return box;
}
function updateSelectionBox() {
  const b = selectionBox(app.selected);
  b.expandByScalar(0.06);
  app.selBox.box.copy(b); app.selBox.visible = true;
}

function liveOf(a) { return { state: a.state, battery: a.battery, speed: a.velocity, task: a.task }; }

function describe(owner, agent) {
  const ud = owner.userData || {};
  const type = TYPE_ES[ud.wh_type] || (ud.wh_type ? ud.wh_type.replace(/_/g, ' ') : 'Objeto');
  const rows = [];
  const skip = new Set(['wh_type', 'wh_state', 'wh_battery', 'wh_speed', 'wh_cyclic', 'wh_links', 'wh_bounds']);
  for (const [k, v] of Object.entries(ud)) if (k.startsWith('wh_') && !skip.has(k) && !(agent && k === 'wh_zone')) rows.push([fieldName(k), prettyValue(k, v)]);
  if (!agent && ud.wh_state) rows.unshift(['Estado', prettyValue('wh_state', ud.wh_state)]);
  // ocupación de racks
  const slots = app.sim.slots.filter(s => s.parent === owner.name);
  if (slots.length) {
    const occ = slots.reduce((n, s) => n + s.occupied, 0);
    rows.push(['Ocupación', `${occ} / ${slots.length} posiciones (${Math.round(occ / slots.length * 100)} %)`]);
    // claves guardadas en el rack y su cobertura en el inventario del CEDIS
    if (app.inv && app.slotClaves) {
      const cs = [...new Set(slots.map(s => app.slotClaves[s.name]).filter(Boolean))];
      const idx = Math.floor(app.ops.now / 86400), LV = { zero: 'sin existencia', part: 'en reparto', low: 'cobertura baja', ok: 'normal', over: 'sobreinventario' };
      cs.slice(0, 8).forEach(c => { const r = app.inv.row(c, idx); rows.push([r.m.n, `${Math.round(r.stock).toLocaleString('es-MX')} pzas · ${isFinite(r.cover) ? r.cover.toFixed(0) + ' d' : '—'} · ${LV[r.level]}`]); });
      if (cs.length > 8) rows.push(['Más claves', `${cs.length - 8}`]);
    }
  }
  if (agent?.path) rows.push(['Ruta', agent.cfg.route && typeof agent.cfg.route === 'string' ? agent.cfg.route.replace(/_/g, ' ') : 'Ruta de simulación']);
  const p = owner.getWorldPosition(new THREE.Vector3());
  rows.push(['Posición (m)', `X ${p.x.toFixed(1)} · Y ${(-p.z).toFixed(1)} · Z ${p.y.toFixed(1)}`]);
  return {
    title: agent?.label || owner.name.replace(/_/g, ' '),
    type: type + (ud.wh_slot_ref ? ' · ' + prettySlot(ud.wh_slot_ref).split(' · ')[0] : ''),
    rows, live: agent ? () => liveOf(agent) : null, canFollow: !!agent?.path,
  };
}

/** Muestra una unidad médica en el inspector (no tiene objeto 3D) */
function showUnit(u, rows) {
  select(null);
  const link = () => `unidad.html?u=${u.clues}&t=${Math.floor(app.sim.time)}`;
  const show = extra => app.ui.showInspector({ type: `Unidad médica · ${u.inst} · ${u.tipo}`, title: u.nombre, rows: [...extra, ...rows],
    live: null, canFollow: false, noFocus: true, link: link() });
  show([['Envío del CEDIS', 'Calculando…']]);
  app._unitShown = u;
  shipmentRows(u).then(extra => { if (app._unitShown === u) show(extra); }).catch(err => console.warn(err));
}

// Envío de medicamentos (claves y piezas) a una unidad: mismo cálculo que la vista de la unidad
async function shipmentRows(u) {
  if (!app.supplyCtx) {
    const cat = app.catalog || await fetch('assets/medicamentos.json').then(r => r.json());
    app.supplyCtx = { cat, cal: makeCalendar(app.ops.data) };
  }
  const { cat, cal } = app.supplyCtx;
  const sup = new UnitSupply(u, cat, cal);
  const st0 = app.link?.status.get(u);
  const alertRows = st0 ? [['Alertas abiertas al CEDIS', st0.open ? `${st0.open} (claves agotadas)` : 'Ninguna'], ['Claves en cero ahora', String(st0.zero)]] : [];
  let idx = app.ops.dayIdx;
  let evs = sup.shipment(idx).filter(e => e.type !== 'Urgente');
  let when = 'Hoy';
  if (!evs.length) {
    const nx = sup.nextDelivery;
    if (nx === null) return [['Envío del CEDIS', 'Sin entrega programada']];
    idx = nx; evs = sup.shipment(nx).filter(e => e.type !== 'Urgente'); when = `Próximo (${app.ops.dateLabel(nx)})`;
  }
  const e = evs[0];
  const sent = e.lines.reduce((n, l) => n + l.q, 0), req = e.lines.reduce((n, l) => n + l.req, 0);
  const name = c => sup.byClave.get(c).n;
  const top = [...e.lines].filter(l => l.q).sort((a, b) => b.q - a.q).slice(0, 5).map(l => `${name(l.c)} × ${l.q}`).join(' · ');
  const short = e.lines.filter(l => l.q < l.req).map(l => `${name(l.c)} (${l.why || 'faltante'})`).join(' · ');
  return [
    ...alertRows,
    [`Envío del CEDIS · ${when}`, `${e.lines.length} claves · ${sent.toLocaleString('es-MX')} piezas · ${req ? (100 * sent / req).toFixed(0) : 100} % surtido`],
    ['Claves con más piezas', top || '—'],
    ['Claves con faltante', short || 'Ninguna'],
  ];
}

function setPlaying(p) { app.sim.running = p; app.ui.setPlaying(p); app.needsRender = true; }

// Atajos de teclado (escritorio)
window.addEventListener('keydown', e => {
  if (!app.sim) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!app.sim.running); }
  if (e.key === 'Escape') select(null);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= PRESET_META.length) flyTo(PRESET_META[n - 1].id);
});

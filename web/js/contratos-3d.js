// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  contratos-3d.js · Escena del patio de proveedores ligada a contratos.js
//  Carga assets/contratos_patio.glb (contratos/contratos_builder.py) y usa sus
//  propiedades wh_* para ligar cada objeto con el motor de contratos:
//    · supplier_truck  → plantilla de tractocamión (seco / frío), se clona por remisión
//    · truck_node      → puntos del recorrido: entrada, giros, cajones y andenes
//    · dock_light      → semáforo de andén: color del dictamen de la recepción
//    · contract_lamp   → tablero: semáforo de cada contrato (parpadea en rojo)
//    · desk_stack      → pila de expedientes = trámites en cola de cada ventanilla
//    · reject_slot     → tarimas devueltas mientras el camión con rechazo sigue en andén
//  Todo se calcula a partir del reloj (posición = f(t)), así que adelantar o
//  pausar la simulación da siempre la misma escena.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SEM_COLOR, ESTADO_ES } from './contratos.js';

const URL_GLB = 'assets/contratos_patio.glb';
const DAY = 86400, H = 3600, MIN = 60;
const V_DRIVE = 5, V_SLOW = 3, V_REV = 1.5, T_PIVOT = 6;
const HALF = 10.1;                              // del origen (parte trasera) al centro del camión
const DOCKS = ['R2', 'R3'];                     // R1 lo usa la simulación del almacén (tráiler fijo)
const DESKS = ['ADQUISICIONES', 'CALIDAD', 'FINANZAS', 'JURIDICO'];
const HEAD = { E: Math.PI / 2, W: -Math.PI / 2, S: 0, N: Math.PI };
const OFF_COLOR = new THREE.Color(0x30363d);

export class Contratos3D {
  constructor(app, motor) {
    this.app = app; this.K = motor;
    this.ready = false; this.day = null; this.trucks = []; this.picks = [];
    this.onPick = null;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(URL_GLB);
    const root = this.root = gltf.scene; root.name = 'Contratos_Patio';
    this.app.scene.add(root);
    root.updateMatrixWorld(true);
    const by = t => { const out = []; root.traverse(o => { if (o.userData?.wh_type === t) out.push(o); }); return out; };
    const wp = o => o.getWorldPosition(new THREE.Vector3());
    this.nodes = {};
    for (const o of by('truck_node')) this.nodes[o.userData.wh_node] = wp(o);
    this.templates = {};
    for (const o of by('supplier_truck')) { this.templates[o.userData.wh_variant] = o; o.visible = false; }
    for (const o of by('folder_template')) o.visible = false;
    this.lights = {};
    for (const o of by('dock_light')) { o.material = o.material.clone(); this.lights[o.userData.wh_dock] = o; }
    this.lamps = [];
    for (const o of by('contract_lamp')) { o.material = o.material.clone(); this.lamps[o.userData.wh_index] = o; this.picks.push(o); }
    this.rejectSlots = by('reject_slot').sort((a, b) => a.userData.wh_slot - b.userData.wh_slot).map(wp);
    this.slotX = [1, 2, 3, 4].map(i => this.nodes['giro_E' + i].x);

    // pilas de expedientes (carpetas instanciadas)
    const fgeo = new THREE.BoxGeometry(0.34, 0.034, 0.24);
    const fmat = new THREE.MeshStandardMaterial({ color: 0xe8c56a, roughness: 0.7 });
    this.stacks = {};
    for (const o of by('desk_stack')) {
      const im = new THREE.InstancedMesh(fgeo, fmat, 48); im.count = 0; im.frustumCulled = false;
      im.userData.base = wp(o); im.userData.desk = o.userData.wh_desk;
      this.app.scene.add(im); this.stacks[o.userData.wh_desk] = im;
    }
    // tarimas devueltas
    const pgeo = new THREE.BoxGeometry(1.2, 1.1, 1.0); pgeo.translate(0, 0.55, 0);
    this.rejectMeshes = this.rejectSlots.map(p => {
      const m = new THREE.Mesh(pgeo, new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 }));
      m.position.copy(p); m.visible = false; this.app.scene.add(m); return m;
    });
    this.setupPicking();
    this.ready = true;
    this.app.needsRender = true;
  }

  // ---------------------------------------------------------------
  //  Programa del día: patio → andén → salida
  // ---------------------------------------------------------------
  buildDay(d) {
    for (const tr of this.trucks) { tr.obj.removeFromParent(); tr.label?.material.map.dispose(); }
    this.trucks = []; this.day = d;
    const cams = this.K.camionesDia(d);
    const slotFree = [0, 0, 0, 0], dockFree = { R2: 0, R3: 0 };
    const N = this.nodes, road = N.entrada.z;          // three: z = -y de Blender
    const pIn = x => new THREE.Vector3(x, 0, road);
    const center = (x, zRear) => new THREE.Vector3(x, 0, zRear + HALF);   // cabina al sur (+z)
    for (const cam of cams) {
      const want = cam.t - 10 * MIN;
      let tArr = want - 45 * MIN;
      let s = slotFree.indexOf(Math.min(...slotFree));
      tArr = Math.max(tArr, slotFree[s]);
      const xs = this.slotX[s], dock = DOCKS.reduce((a, b) => (dockFree[a] <= dockFree[b] ? a : b));
      const xd = N['giro_' + dock].x, zDock = N['anden_' + dock].z, zSlot = N['cajon_E' + (s + 1)].z;
      const legs = [];
      let t = tArr;
      const P0 = new THREE.Vector3(N.entrada.x, 0, road);
      const add = (kind, a, b, h0, h1, v) => {
        const dur = kind === 'pivot' ? T_PIVOT : kind === 'wait' ? v : a.distanceTo(b) / v;
        legs.push({ kind, a, b, h0, h1, t0: t, t1: t + dur }); t += dur;
      };
      // llegada al patio
      add('drive', P0, pIn(xs), HEAD.E, HEAD.E, V_DRIVE);
      add('pivot', pIn(xs), pIn(xs), HEAD.E, HEAD.S);
      add('drive', pIn(xs), center(xs, zSlot), HEAD.S, HEAD.S, V_REV);
      const tPatio = t;
      const tReady = tPatio + 20 * MIN;                            // revisión documental y cita
      const tGo = Math.max(tReady, want - 40, dockFree[dock]);
      add('wait', center(xs, zSlot), center(xs, zSlot), HEAD.S, HEAD.S, tGo - t);
      // del patio al andén
      add('drive', center(xs, zSlot), pIn(xs), HEAD.S, HEAD.S, V_SLOW);
      slotFree[s] = t + 30;
      add('pivot', pIn(xs), pIn(xs), HEAD.S, HEAD.W);
      add('drive', pIn(xs), pIn(xd), HEAD.W, HEAD.W, V_DRIVE);
      add('pivot', pIn(xd), pIn(xd), HEAD.W, HEAD.S);
      add('drive', pIn(xd), center(xd, zDock), HEAD.S, HEAD.S, V_REV);
      const tDock = t;
      const unload = (35 + 12 * cam.items.length) * MIN;
      const tInsp = Math.max(tDock + 15 * MIN, cam.t);
      add('wait', center(xd, zDock), center(xd, zDock), HEAD.S, HEAD.S, Math.max(tInsp + 20 * MIN, tDock + unload) - t);
      const tOut = t;
      add('drive', center(xd, zDock), pIn(xd), HEAD.S, HEAD.S, V_SLOW);
      add('pivot', pIn(xd), pIn(xd), HEAD.S, HEAD.E);
      add('drive', pIn(xd), new THREE.Vector3(N.salida.x, 0, road), HEAD.E, HEAD.E, V_DRIVE);
      dockFree[dock] = tOut + 60;
      const variant = cam.frio ? 'frio' : 'seco';
      const obj = this.makeTruck(variant, cam);
      this.trucks.push({ cam, obj, legs, dock, slot: s, tArr, tPatio, tDock, tInsp, tOut, tEnd: t, label: obj.userData.label });
    }
  }

  makeTruck(variant, cam) {
    const g = new THREE.Group(); g.name = 'Camion_' + cam.id;
    const tpl = this.templates[variant] || this.templates.seco;
    const body = tpl.clone(true); body.visible = true;
    body.position.set(0, 0, -HALF); body.rotation.set(0, 0, 0); body.quaternion.identity();
    g.add(body);
    // etiqueta
    const lbl = this.labelSprite(cam);
    lbl.position.set(0, 5.4, -HALF + 4); g.add(lbl);
    g.userData = { label: lbl, cam, pickType: 'truck' };
    g.visible = false;
    this.app.scene.add(g);
    body.traverse(o => { if (o.isMesh) { o.userData.pickOwner = g; } });
    return g;
  }

  labelSprite(cam) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    const bad = cam.rechazos > 0;
    x.fillStyle = 'rgba(13,17,23,0.86)'; x.beginPath(); x.roundRect(4, 4, 504, 120, 18); x.fill();
    x.fillStyle = cam.rescate ? '#60a5fa' : bad ? '#f87171' : '#2dd4bf'; x.fillRect(4, 4, 12, 120);
    x.fillStyle = '#e6edf3'; x.font = '600 34px system-ui, sans-serif';
    x.fillText(`${cam.os.id} · ${cam.os.k.id}`, 30, 50);
    x.fillStyle = '#9aa7b3'; x.font = '26px system-ui, sans-serif';
    const ok = cam.items.length - cam.rechazos;
    x.fillText(cam.rescate ? `Rescate · ${cam.prov.replace('Licitante 2 · ', '2º lugar · ')}` : `${cam.prov} · ${ok}/${cam.items.length} partidas${bad ? ' · rechazo' : ''}`, 30, 96);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(7.2, 1.8, 1); s.renderOrder = 10;
    return s;
  }

  poseAt(tr, t) {
    if (t < tr.legs[0].t0 || t > tr.tEnd) return null;
    for (const l of tr.legs) {
      if (t > l.t1) continue;
      const u = l.t1 > l.t0 ? (t - l.t0) / (l.t1 - l.t0) : 1;
      const p = l.a.clone().lerp(l.b, u);
      let h = l.h0;
      if (l.kind === 'pivot') { let dh = l.h1 - l.h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; h = l.h0 + dh * (u * u * (3 - 2 * u)); }
      return { p, h, leg: l };
    }
    return null;
  }

  phase(tr, t) {
    if (t < tr.tArr) return 'programado';
    if (t < tr.tPatio) return 'entrando';
    if (t < tr.tDock - 60) return t < tr.legs.find(l => l.kind === 'wait').t1 ? 'en patio' : 'a andén';
    if (t < tr.tInsp) return 'descarga';
    if (t < tr.tOut) return 'inspección';
    if (t < tr.tEnd) return 'salida';
    return 'salió';
  }

  // ---------------------------------------------------------------
  update(t) {
    if (!this.ready) return;
    const d = Math.floor(t / DAY);
    if (d !== this.day) this.buildDay(d);
    const showLabels = !!this.app.layers?.labels;
    const docks = { R2: null, R3: null };
    const rejects = [];
    for (const tr of this.trucks) {
      const pose = this.poseAt(tr, t);
      tr.obj.visible = !!pose;
      if (!pose) continue;
      tr.obj.position.copy(pose.p); tr.obj.rotation.set(0, pose.h, 0);
      tr.label.visible = showLabels;
      if (t >= tr.tDock - 30 && t < tr.tOut) docks[tr.dock] = tr;
      if (tr.cam.rechazos && t >= tr.tInsp && t < tr.tOut) rejects.push(tr);
    }
    // semáforos de andén
    for (const dk of DOCKS) {
      const L = this.lights[dk]; if (!L) continue;
      const tr = docks[dk];
      let col = OFF_COLOR, k = 0.2;
      if (tr) {
        const its = tr.cam.items;
        const sem = t < tr.tInsp ? 'AMARILLO' : tr.cam.rechazos ? 'ROJO' : its.some(x => x.e.dictamen === 'ENTREGA_PARCIAL') ? 'NARANJA' : its.some(x => x.e.carta) ? 'AMARILLO' : 'VERDE';
        col = new THREE.Color(SEM_COLOR[sem]); k = 2.2;
      }
      L.material.color.copy(col); L.material.emissive.copy(col); L.material.emissiveIntensity = k;
    }
    if (this.lights.R1) { const c = new THREE.Color(SEM_COLOR.VERDE); this.lights.R1.material.color.copy(c); this.lights.R1.material.emissive.copy(c); this.lights.R1.material.emissiveIntensity = 2.2; }
    // tarimas devueltas
    this.rejectMeshes.forEach((m, i) => { m.visible = i < Math.min(3, rejects.reduce((n, tr) => n + tr.cam.rechazos, 0)); });
    // tablero y pilas (cada 10 minutos simulados basta, pero el parpadeo es por cuadro)
    const E = this.K.estado(t);
    const blink = 0.55 + 0.45 * Math.sin(performance.now() / 260);
    E.contratos.forEach((c, i) => {
      const L = this.lamps[i]; if (!L) return;
      const col = new THREE.Color(SEM_COLOR[c.sem]);
      L.material.color.copy(col); L.material.emissive.copy(col);
      L.material.emissiveIntensity = c.sem === 'ROJO' ? 0.6 + 2.4 * blink : 2.0;
      L.userData.contrato = c.k.id;
    });
    if (E !== this._lastE) {
      this._lastE = E;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      for (const dk of DESKS) {
        const im = this.stacks[dk]; if (!im) continue;
        const n = Math.min(48, E.colas[dk] || 0);
        for (let i = 0; i < n; i++) {
          const col = Math.floor(i / 16), row = i % 16;
          p.copy(im.userData.base).add(new THREE.Vector3(col * 0.42, 0.02 + row * 0.036, ((i * 37) % 7 - 3) * 0.006));
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((i * 53) % 9 - 4) * 0.02);
          im.setMatrixAt(i, m.compose(p, q, s));
        }
        im.count = n; im.instanceMatrix.needsUpdate = true;
      }
    }
    this.app.needsRender = true;
  }

  /** Camiones del día con su fase (para el panel) */
  truckList(t) {
    return this.trucks.map(tr => ({ cam: tr.cam, dock: tr.dock, slot: tr.slot + 1, phase: this.phase(tr, t), tArr: tr.tArr, tDock: tr.tDock }));
  }

  focusPatio() { return { pos: new THREE.Vector3(8, 34, 62), target: new THREE.Vector3(10, 0, 8) }; }

  setupPicking() {
    const canvas = this.app.renderer.domElement;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 450) { down = null; return; }
      down = null;
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, this.app.camera);
      const targets = [...this.picks, ...this.trucks.filter(tr => tr.obj.visible).map(tr => tr.obj)];
      const hit = ray.intersectObjects(targets, true)[0];
      if (!hit) return;
      let o = hit.object;
      while (o && !o.userData?.pickType && !o.userData?.contrato && o.userData?.wh_type !== 'contract_lamp') o = o.parent;
      if (!o) return;
      if (o.userData.pickType === 'truck') this.onPick?.({ type: 'os', os: o.userData.cam.os.id, cam: o.userData.cam });
      else this.onPick?.({ type: 'contrato', id: o.userData.contrato || ('C' + (o.userData.wh_index + 1)) });
    });
  }
}
export { ESTADO_ES };

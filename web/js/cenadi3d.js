// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  cenadi3d.js · Escena 3D del CENADI ligada a yard-sim.js
//
//  · Modelo: assets/cenadi.glb (Blender, nacional/cenadi_builder.py)
//  · Todo es función del reloj (posición = f(t)): pausar, adelantar o mover la
//    hora da siempre la misma escena.
//  · Tráileres y tortons de proveedor: carretera → caseta → patio → andén norte
//    → salida. Flota propia: andén sur (carga) → salida y regreso de ruta.
//  · Dentro: carritos que bajan cada tarima del tráiler a cuarentena, tarimas
//    por validar (ámbar) y por subir (azul), montacargas que las suben al rack,
//    surtidores en picking y tarimas consolidadas en el carril de cada ruta.
//  · Etiquetas por zona con el trabajo en proceso y su semáforo.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { stateAt, STATE_COLOR, stagesAt } from './yard-sim.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const B = (x, y, z = 0) => new THREE.Vector3(x, z, -y);       // Blender (x, y, z) → three
const YARD = -1.2, TRUNK = -28;
const REC_X = k => 72.7 + 4.2 * k, EMB_X = k => 51.7 + 4.2 * k;
const V_FWD = 6 * 60, V_REV = 2 * 60;                          // m por minuto simulado
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const clamp01 = x => Math.max(0, Math.min(1, x));
const SEM = { ok: '#34d399', warn: '#fbbf24', crit: '#f87171', idle: '#64748b' };

const STALLS = [
  ...Array.from({ length: 10 }, (_, i) => [-36 + 4.2 * i, -47]),
  ...Array.from({ length: 10 }, (_, i) => [158 + 4.2 * i, -47]),
];

export const PRESETS = {
  general: { pos: B(-110, 250, 190), target: B(75, 30, 0), roof: true },
  interior: { pos: B(30, -60, 120), target: B(95, 70, 0), roof: false },
  carretera: { pos: B(-10, -95, 70), target: B(-75, 10, 0), roof: true },
  patio: { pos: B(20, -110, 55), target: B(60, -35, 0), roof: true },
  recepcion: { pos: B(100, 200, 55), target: B(100, 125, 0), roof: false },
  cuarentena: { pos: B(96, 98, 26), target: B(100, 124, 0), roof: false },
  racks: { pos: B(80, 150, 60), target: B(78, 70, 0), roof: false },
  picking: { pos: B(170, 6, 24), target: B(177, 31, 0), roof: false },
  carriles: { pos: B(100, 34, 26), target: B(100, 6, 0), roof: false },
  embarque: { pos: B(100, -70, 35), target: B(100, -8, 0), roof: true },
};
// zonas (Blender: x0, x1, y0, y1) para resaltar y etiquetar
const ZONES = {
  carretera: [-94, -70, -40, 120], caseta: [-72, -50, -46, -32], patio: [-40, 6, -60, -34], recepcion: [70, 130, 128, 152],
  cuarentena: [70, 130, 108, 128], racks: [4, 152, 22, 108], picking: [154, 198, 22, 40], carriles: [48, 152, 1, 21], embarque: [48, 152, -24, 0],
};
const ZONE_LABEL = [
  ['carretera', 'Carretera', [-82, 40]], ['patio', 'Patio', [-15, -47]], ['recepcion', 'Andenes recepción', [112, 156]],
  ['cuarentena', 'Cuarentena', [86, 113]], ['racks', 'Rack', [78, 66]], ['picking', 'Picking', [176, 31]], ['carriles', 'Carriles', [100, 11]], ['embarque', 'Andenes embarque', [100, -12]],
];

// ---------------------------------------------------------------- rutas en el patio
function locations(c) {
  return {
    gate: { final: [-62, -40], nose: [1, 0], toTrunk: [[-50, -40], [-50, TRUNK]] },
    stall: s => ({ final: STALLS[s % STALLS.length], nose: [0, -1], toTrunk: [[STALLS[s % STALLS.length][0], TRUNK]], revOut: true }),
    rec: k => ({ final: [REC_X(k), 130.6 + c], nose: [0, 1], toTrunk: [[REC_X(k), 152], [-14, 152], [-14, TRUNK]], revIn: true }),
    emb: k => ({ final: [EMB_X(k), -0.6 - c], nose: [0, -1], toTrunk: [[EMB_X(k), TRUNK]], revIn: true }),
    exit: { final: [-85, -95], nose: [0, -1], toTrunk: [[-85, -34], [-50, -34], [-50, TRUNK]] },
    park: { final: [215, TRUNK], nose: [1, 0], toTrunk: [] },
  };
}
function route(A, Bl) {
  const pts = [A.final, ...A.toTrunk, ...[...Bl.toTrunk].reverse(), Bl.final];
  const P = [];
  for (const p of pts) if (!P.length || Math.hypot(p[0] - P.at(-1)[0], p[1] - P.at(-1)[1]) > 0.01) P.push(p);
  const segs = [];
  let dur = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rev = (i === 0 && A.revOut) || (i === P.length - 2 && Bl.revIn);
    const d = len / (rev ? V_REV : V_FWD);
    segs.push({ a, b, len, rev, t0: dur, t1: dur + d }); dur += d;
  }
  return { segs, dur, end: Bl };
}
function poseOnRoute(R, u) {        // u en minutos desde el inicio del movimiento
  for (const s of R.segs) {
    if (u > s.t1) continue;
    const f = s.t1 > s.t0 ? (u - s.t0) / (s.t1 - s.t0) : 1;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy) || 1;
    const dir = s.rev ? [-dx / L, -dy / L] : [dx / L, dy / L];
    return { x: s.a[0] + dx * f, y: s.a[1] + dy * f, nose: dir };
  }
  return { x: R.end.final[0], y: R.end.final[1], nose: R.end.nose };
}
const heading = nose => Math.atan2(-nose[0], nose[1]);         // rotación y de three para un "nariz" en Blender

export class Cenadi3D {
  constructor(box, opts = {}) {
    this.box = box; this.opts = opts;
    this.S = null; this.trucks = new Map(); this.visible = true; this.needsRender = true;
    this.roof = false; this.onPick = null; this.highlight = null;
  }

  async load() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.box.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f151c');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4450, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-80, 140, 90); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.47; this.controls.minDistance = 10; this.controls.maxDistance = 700;
    this.controls.addEventListener('change', () => { this.needsRender = true; });

    const gltf = await new GLTFLoader().loadAsync(this.opts.glb || 'assets/cenadi.glb');
    const model = this.model = gltf.scene; scene.add(model);
    this.roofObjs = []; this.tpl = {};
    model.traverse(o => {
      const ud = o.userData || {};
      if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); }
      if (ud.wh_type === 'roof') this.roofObjs.push(o);
      // los vehículos fijos del modelo sirven de plantilla y se ocultan
      if (/^CN_TC_|^CN_Remolque_Espera/.test(o.name)) {
        if (/Remolque$/.test(o.name) && ud.wh_refrig != null) this.tpl[ud.wh_refrig ? 'frio' : 'seco'] ||= o;
        if (/Tractor$/.test(o.name)) this.tpl.tractor ||= o;
        o.visible = false;
      }
      if (o.name === 'CN_Tarimas_Piso' || /^CN_Montacargas_/.test(o.name)) o.visible = false;
    });
    this.fleetCab = null;
    if (this.tpl.tractor) {
      this.fleetCab = this.tpl.tractor.clone(true);
      this.fleetCab.traverse(o => { if (o.isMesh && o.material?.name === 'CN_Tractor') { o.material = o.material.clone(); o.material.color.set('#0f766e'); } });
    }
    this.setRoof(false);
    this.buildDynamic();
    this.buildLabels();
    this.bindPicking();
    this.view('general', true);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.box);
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }, { threshold: 0.02 }).observe(this.box);
  }

  resize() {
    const w = this.box.clientWidth, h = this.box.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.needsRender = true;
  }

  setRoof(on) { this.roof = on; for (const o of this.roofObjs) o.visible = on; this.needsRender = true; this._dirty = true; }

  view(name, instant = false) {
    const P = PRESETS[name]; if (!P) return;
    this.setRoof(P.roof);
    this.fly = { from: this.camera.position.clone(), to: P.pos.clone(), tf: this.controls.target.clone(), tt: P.target.clone(), t0: performance.now(), d: instant ? 0 : 900 };
    if (instant) { this.camera.position.copy(P.pos); this.controls.target.copy(P.target); this.controls.update(); this.fly = null; }
    this.highlightZone(name);
    this.needsRender = true;
  }

  highlightZone(name) {
    if (this.hl) { this.scene.remove(this.hl); this.hl.geometry.dispose(); this.hl = null; }
    const z = ZONES[name]; if (!z) return;
    const [x0, x1, y0, y1] = z;
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, 6, y1 - y0));
    const m = new THREE.LineBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.9 });
    this.hl = new THREE.LineSegments(g, m);
    this.hl.position.copy(B((x0 + x1) / 2, (y0 + y1) / 2, 2));
    this.scene.add(this.hl);
  }

  // ------------------------------------------------------------ objetos dinámicos
  buildDynamic() {
    const S = this.scene;
    const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    // tarimas en cuarentena y por subir
    const pg = new THREE.BoxGeometry(1.1, 1.15, 1.0); pg.translate(0, 0.575, 0);
    this.stagePal = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 1400);
    this.stagePal.count = 0; this.stagePal.frustumCulled = false; S.add(this.stagePal);
    // tarimas consolidadas en carriles de embarque
    this.lanePal = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 1200);
    this.lanePal.count = 0; this.lanePal.frustumCulled = false; S.add(this.lanePal);
    // carritos (patín eléctrico) y montacargas
    const cart = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.9), mat('#f59e0b')); body.position.set(0, 0.5, 0.75); cart.add(body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), mat('#1f2937')); handle.position.set(0, 1.1, 1.15); cart.add(handle);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.2), mat('#374151')); fork.position.set(0, 0.06, -0.4); cart.add(fork);
    const load = new THREE.Mesh(pg, mat('#e5e7eb')); load.scale.set(0.95, 0.9, 0.95); load.position.set(0, 0.1, -0.4); load.name = 'carga'; cart.add(load);
    this.cartTpl = cart;
    const fl = new THREE.Group();
    const fb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.8), mat('#eab308')); fb.position.set(0, 0.8, 0.6); fl.add(fb);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.5, 0.12), mat('#4b5563')); mast.position.set(0, 3.25, -0.4); fl.add(mast);
    const fload = new THREE.Mesh(pg, mat('#93c5fd')); fload.position.set(0, 0, -1.1); fload.name = 'carga'; fl.add(fload);
    this.liftTpl = fl;
    this.carts = []; this.lifts = [];
    // surtidores
    const body2 = new THREE.CapsuleGeometry(0.22, 0.75, 4, 8); body2.translate(0, 0.6, 0);
    const head = new THREE.SphereGeometry(0.16, 10, 8); head.translate(0, 1.55, 0);
    this.pickBody = new THREE.InstancedMesh(body2, mat('#f472b6'), 120); this.pickBody.count = 0; this.pickBody.frustumCulled = false; S.add(this.pickBody);
    this.pickHead = new THREE.InstancedMesh(head, mat('#e0b48f'), 120); this.pickHead.count = 0; this.pickHead.frustumCulled = false; S.add(this.pickHead);
    const cartG = new THREE.BoxGeometry(0.6, 0.9, 1.0); cartG.translate(0, 0.45, 0);
    this.pickCart = new THREE.InstancedMesh(cartG, mat('#94a3b8'), 120); this.pickCart.count = 0; this.pickCart.frustumCulled = false; S.add(this.pickCart);
    const pin = new THREE.ConeGeometry(0.45, 0.9, 10); pin.rotateX(Math.PI); pin.translate(0, 3.3, 0);   // marcador visible sobre los anaqueles
    this.pickPin = new THREE.InstancedMesh(pin, new THREE.MeshBasicMaterial({ color: '#f472b6' }), 120); this.pickPin.count = 0; this.pickPin.frustumCulled = false; S.add(this.pickPin);
  }

  pooled(arr, tpl, i) {
    while (arr.length <= i) { const o = tpl.clone(true); o.traverse(x => { if (x.isMesh) x.material = x.material.clone(); }); this.scene.add(o); arr.push(o); }
    return arr[i];
  }

  buildLabels() {
    const L = this.labelBox = document.createElement('div'); L.className = 'c3-labels'; this.box.appendChild(L);
    this.labels = ZONE_LABEL.map(([id, name, xy]) => {
      const el = document.createElement('button'); el.className = 'c3-label'; el.type = 'button';
      el.innerHTML = `<i></i><b>${name}</b><span>—</span>`;
      el.addEventListener('click', () => this.opts.onZone?.(id));
      L.appendChild(el);
      return { id, el, pos: B(xy[0], xy[1], 9) };
    });
  }

  // ------------------------------------------------------------ simulación
  setSim(S) {
    this.S = S;
    for (const t of this.trucks.values()) { t.obj.removeFromParent(); }
    this.trucks.clear();
    // rutas por vehículo
    for (const v of S.all) {
      const c = (v.escala * 16.2 + 5.35) / 2;
      const Lc = locations(c);
      const mv = [];
      if (v.kind === 'prov' && v.tIn != null) {
        if (v.stall != null && v.tDock != null && v.tDock > v.tIn + 0.5) { mv.push({ t: v.tIn, R: route(Lc.gate, Lc.stall(v.stall)) }); mv.push({ t: v.tDock, R: route(Lc.stall(v.stall), Lc.rec(v.dock)) }); }
        else if (v.tDock != null) mv.push({ t: v.tIn, R: route(Lc.gate, Lc.rec(v.dock)) });
        if (v.tRelease != null) mv.push({ t: v.tRelease, R: route(Lc.rec(v.dock), Lc.exit) });
      } else if (v.kind === 'salida' && v.tLoad0 != null) {
        mv.push({ t: v.tLoad0 - 1.5, R: route(Lc.park, Lc.emb(v.dock)) });
        if (v.tRelease != null) mv.push({ t: v.tRelease, R: route(Lc.emb(v.dock), Lc.exit) });
      } else if (v.kind === 'regreso' && v.tIn != null) {
        mv.push({ t: v.tIn, R: route(Lc.gate, Lc.park) });
      }
      v._mv = mv; v._c = c;
    }
    // orden de llegada a carretera (para la fila)
    this.roadOrder = S.all.filter(v => v.arr != null && v.kind !== 'salida').sort((a, b) => a.arr - b.arr);
    this.needsRender = true; this._dirty = true;
  }

  truckFor(v) {
    let t = this.trucks.get(v.id);
    if (t) return t;
    const g = new THREE.Group(); g.name = 'Veh_' + v.id;
    const L = 16.2 * v.escala, c = v._c;
    const trTpl = (v.frio ? this.tpl.frio : this.tpl.seco) || this.tpl.seco;
    if (trTpl) { const tr = trTpl.clone(true); tr.position.set(0, 0, c); tr.rotation.set(0, 0, 0); tr.quaternion.identity(); tr.scale.set(1, 1, v.escala); g.add(tr); }
    const cabTpl = v.kind === 'prov' ? this.tpl.tractor : (this.fleetCab || this.tpl.tractor);
    if (cabTpl) { const cb = cabTpl.clone(true); cb.position.set(0, 0, c - L - 1.1); cb.rotation.set(0, 0, 0); cb.quaternion.identity(); g.add(cb); }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.12, L * 0.92), new THREE.MeshBasicMaterial({ color: '#64748b' }));
    plate.position.set(0, 4.18, c - L / 2); g.add(plate);
    g.traverse(o => { o.visible = true; o.matrixAutoUpdate = true; });
    g.userData = { v, plate, pick: true };
    g.traverse(o => { if (o.isMesh) o.userData.owner = g; });
    g.visible = false;
    this.scene.add(g);
    t = { obj: g, plate, smooth: null };
    this.trucks.set(v.id, t);
    return t;
  }

  /** Posición del vehículo (Blender x, y, nariz) en el minuto m, o null si no está en escena */
  poseOf(v, m, roadRank) {
    const st = stateAt(v, m);
    if (st === 'carretera') {
      const k = roadRank.get(v) ?? 0;
      return { x: -81 - 8 * (k % 2), y: -40 + 24 * (Math.floor(k / 2) + 1), nose: [0, -1], st, smooth: true };
    }
    if (st === 'caseta') return { x: -62, y: -40, nose: [1, 0], st, smooth: true };
    const mv = v._mv;
    if (!mv?.length || m < mv[0].t) return null;
    let cur = mv[0];
    for (const x of mv) if (m >= x.t) cur = x;
    const u = m - cur.t;
    if (cur === mv.at(-1) && (cur.R.end.final[0] === -85 || cur.R.end.final[0] === 215) && u > cur.R.dur) return null;
    const p = poseOnRoute(cur.R, u);
    return { ...p, st };
  }

  // ------------------------------------------------------------ cuadro
  update(t, dt = 0.016) {
    if (!this.S) return;
    const S = this.S, m = t / 60;
    if (t === this._lastT && !this.fly && !(this._settle > 0) && !this._dirty) return;   // en pausa: no se redibuja
    this._settle = t === this._lastT ? (this._settle || 0) - 1 : 40;
    this._lastT = t; this._dirty = false;
    if (this.fly) {
      const k = this.fly.d ? clamp01((performance.now() - this.fly.t0) / this.fly.d) : 1, e = k * k * (3 - 2 * k);
      this.camera.position.lerpVectors(this.fly.from, this.fly.to, e); this.controls.target.lerpVectors(this.fly.tf, this.fly.tt, e);
      if (k >= 1) this.fly = null;
      this.needsRender = true;
    }
    // fila en carretera: rango por orden de llegada
    const roadRank = new Map(); let k = 0;
    for (const v of this.roadOrder) if (stateAt(v, m) === 'carretera') roadRank.set(v, k++);
    const seen = new Set();
    for (const v of S.all) {
      const pose = this.poseOf(v, m, roadRank);
      if (!pose) { const tr = this.trucks.get(v.id); if (tr) tr.obj.visible = false; continue; }
      const tr = this.truckFor(v); seen.add(v.id);
      const target = B(pose.x, pose.y, YARD);
      const h = heading(pose.nose);
      if (pose.smooth && tr.obj.visible) {
        tr.obj.position.lerp(target, 1 - Math.exp(-dt * 5));
        let d = h - tr.obj.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        tr.obj.rotation.y += d * (1 - Math.exp(-dt * 5));
      } else { tr.obj.position.copy(target); tr.obj.rotation.set(0, h, 0); }
      tr.obj.visible = true;
      tr.plate.material.color.set(STATE_COLOR[pose.st] || '#64748b');
    }
    this.updateInside(m);
    this.updateLabels(m);
    this.needsRender = true;
  }

  updateInside(m) {
    const S = this.S, p = S.p;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(1, 1, 1), C = new THREE.Color();
    // --- tarimas en piso de recepción, por andén
    const perDock = new Map();
    for (const t of S.recP) {
      if (t.tUnl > m) continue;
      if (t.tPut0 != null && m >= t.tPut0) continue;
      if (t.devuelta && t.v.tRelease != null && m >= t.v.tRelease) continue;
      const d = t.v.dock; if (!perDock.has(d)) perDock.set(d, []); perDock.get(d).push(t);
    }
    let n = 0;
    const spot = (d, i) => { const col = i % 2, row = Math.floor(i / 2); return [REC_X(d) + (col ? 0.65 : -0.65), 126.6 - 1.35 * (row % 12), Math.floor(row / 12) * 1.25]; };
    this._spot = spot;
    for (const [d, arr] of perDock) {
      arr.sort((a, b) => a.tUnl - b.tUnl || a.k - b.k);
      arr.forEach((t, i) => {
        if (n >= this.stagePal.instanceMatrix.count) return;
        const [x, y, z] = spot(d, i); t._spot = [x, y];
        M.compose(B(x, y, z), Q, SC); this.stagePal.setMatrixAt(n, M);
        C.set(t.devuelta && m >= t.ready ? '#ef4444' : (t.ready == null || m < t.ready) ? '#f59e0b' : '#60a5fa');
        this.stagePal.setColorAt(n, C); n++;
      });
    }
    this.stagePal.count = n; this.stagePal.instanceMatrix.needsUpdate = true; if (this.stagePal.instanceColor) this.stagePal.instanceColor.needsUpdate = true;
    // --- carritos: uno por vehículo descargando
    let ci = 0;
    for (const v of S.V) {
      if (v.tUnload0 == null || m < v.tUnload0 || m >= v.tUnload1) continue;
      const u = m - v.tUnload0 - p.descargaPrep;
      const cart = this.pooled(this.carts, this.cartTpl, ci++);
      const xd = REC_X(v.dock), inT = [xd, 133], door = [xd, 129.4];
      const k = Math.max(0, Math.floor(u / p.descargaTarima)), f = u < 0 ? 0 : (u % p.descargaTarima) / p.descargaTarima;
      const arr = perDock.get(v.dock) || [];
      const target = this._spot(v.dock, Math.min(arr.length, 40));
      let a, b, g, carry;
      if (u < 0 || f < 0.2) { a = door; b = inT; g = u < 0 ? 1 : f / 0.2; carry = false; }
      else if (f < 0.6) { a = inT; b = target; g = (f - 0.2) / 0.4; carry = true; }
      else { a = target; b = door; g = (f - 0.6) / 0.4; carry = false; }
      const x = a[0] + (b[0] - a[0]) * g, y = a[1] + (b[1] - a[1]) * g;
      cart.position.copy(B(x, y, 0)); cart.rotation.y = Math.atan2(-(b[0] - a[0]), (b[1] - a[1]) || 1e-6) + (carry ? 0 : Math.PI);
      cart.getObjectByName('carga').visible = carry; cart.visible = true;
    }
    // carritos de carga en embarque (del carril al tráiler)
    for (const o of S.outs) {
      if (o.tLoad0 == null || m < o.tLoad0 || m >= o.tLoad1) continue;
      const cart = this.pooled(this.carts, this.cartTpl, ci++);
      const x0 = EMB_X(o.dock), u = (m - o.tLoad0) / p.cargaTarima, f = u % 1;
      const lane = [EMB_X(o.laneIdx), 6], door = [x0, 0.4], inT = [x0, -3];
      let a, b, g, carry;
      if (f < 0.45) { a = lane; b = door; g = f / 0.45; carry = true; } else if (f < 0.6) { a = door; b = inT; g = (f - 0.45) / 0.15; carry = true; } else { a = inT; b = lane; g = (f - 0.6) / 0.4; carry = false; }
      const x = a[0] + (b[0] - a[0]) * g, y = a[1] + (b[1] - a[1]) * g;
      cart.position.copy(B(x, y, 0)); cart.rotation.y = Math.atan2(-(b[0] - a[0]), (b[1] - a[1]) || 1e-6);
      cart.getObjectByName('carga').visible = carry; cart.visible = true;
    }
    for (let i = ci; i < this.carts.length; i++) this.carts[i].visible = false;
    // --- montacargas subiendo tarimas al rack
    let li = 0;
    for (const t of S.recP) {
      if (t.tPut0 == null || m < t.tPut0 || m >= t.tStored) continue;
      const fl = this.pooled(this.lifts, this.liftTpl, li++);
      const h1 = hash(t.v.id + '#' + t.k), aisle = Math.floor(h1 * 26), ax = 6 + 5.5 * aisle + 3.95;
      const ry = 26 + hash(t.k + t.v.id) * 78, lvl = Math.floor(hash('L' + t.k + t.v.id) * 9);
      const st = t._spot || [REC_X(t.v.dock), 120];
      const f = (m - t.tPut0) / (t.tStored - t.tPut0);
      let x, y, lift = 0, dir;
      if (f < 0.35) { const g = f / 0.35; x = st[0] + (ax - st[0]) * g; y = st[1] + (109 - st[1]) * g; dir = [ax - st[0], 109 - st[1]]; }
      else if (f < 0.7) { const g = (f - 0.35) / 0.35; x = ax; y = 109 + (ry - 109) * g; dir = [0, -1]; }
      else { x = ax; y = ry; lift = (f - 0.7) / 0.3 * lvl * 1.4; dir = [-1, 0]; }
      fl.position.copy(B(x, y, 0)); fl.rotation.y = Math.atan2(-dir[0], dir[1] || 1e-6);
      const ld = fl.getObjectByName('carga'); ld.position.y = lift; ld.visible = true; fl.visible = true;
    }
    for (let i = li; i < this.lifts.length; i++) this.lifts[i].visible = false;
    // --- surtidores en picking (uno por tarima en surtido)
    let pi = 0;
    for (const t of S.embP) {
      if (t.tPick0 == null || m < t.tPick0 || m >= t.tPick1 || pi >= 120) continue;
      const r = Math.floor(hash(t.o.id + t.k) * 6), y = 24 + 2.7 + r * 2.4;
      const ph = (m - t.tPick0) / 6 + hash('p' + t.k + t.o.id) * 4, tri = Math.abs(((ph % 2) + 2) % 2 - 1);
      const x = 157.5 + tri * 37, dirx = (ph % 2) < 1 ? 1 : -1;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dirx > 0 ? -Math.PI / 2 : Math.PI / 2);
      M.compose(B(x, y, 0), Q, SC); this.pickBody.setMatrixAt(pi, M); this.pickHead.setMatrixAt(pi, M); this.pickPin.setMatrixAt(pi, M);
      M.compose(B(x + dirx * 0.9, y, 0), Q, SC); this.pickCart.setMatrixAt(pi, M);
      pi++;
    }
    for (const im of [this.pickBody, this.pickHead, this.pickCart, this.pickPin]) { im.count = pi; im.instanceMatrix.needsUpdate = true; }
    // --- tarimas consolidadas en el carril de su ruta
    const perLane = new Map();
    for (const t of S.embP) {
      if (t.tPick1 == null || m < t.tPick1) continue;
      if (t.tLoaded != null && m >= t.tLoaded) continue;
      const l = t.o.laneIdx; if (!perLane.has(l)) perLane.set(l, []); perLane.get(l).push(t);
    }
    let q = 0;
    for (const [l, arr] of perLane) {
      arr.sort((a, b) => a.o.plan - b.o.plan || a.k - b.k);
      arr.forEach((t, i) => {
        if (q >= this.lanePal.instanceMatrix.count) return;
        const col = Math.floor(i / 13) % 2, row = i % 13, lay = Math.floor(i / 26);
        M.compose(B(EMB_X(l) + (col ? 0.7 : -0.7), 2.4 + 1.3 * row, lay * 1.2), Q.identity(), SC); this.lanePal.setMatrixAt(q, M);
        const late = m > t.o.plan - 20 && (t.o.tRelease == null || m < t.o.tRelease);
        C.set(late ? '#fb923c' : '#5eead4'); this.lanePal.setColorAt(q, C); q++;
      });
    }
    this.lanePal.count = q; this.lanePal.instanceMatrix.needsUpdate = true; if (this.lanePal.instanceColor) this.lanePal.instanceColor.needsUpdate = true;
  }

  updateLabels(m) {
    const st = stagesAt(this.S, m);
    const roadN = st.carretera.n, yard = st.patio.n;
    const text = {
      carretera: [`${roadN} veh`, st.carretera.sem],
      patio: [`${yard}/${this.S.p.cajones} cajones`, st.patio.sem],
      recepcion: [`${st.anden.n}/${this.S.p.andenes} ocupados`, st.anden.sem],
      cuarentena: [`${st.cuarentena.n} por validar · ${st.ubicar.n} por subir`, worse(st.cuarentena.sem, st.ubicar.sem)],
      racks: [`${st.subiendo.n} subiendo`, st.subiendo.sem],
      picking: [`${st.surtiendo.n} surtiendo · ${st.surtir.n} en espera`, worse(st.surtir.sem, st.surtiendo.sem)],
      carriles: [`${st.consolidado.n} tarimas`, st.consolidado.sem],
      embarque: [`${st.cargando.n} cargando`, st.cargando.sem],
    };
    this._labelText = text;
  }

  placeLabels() {
    if (!this.labels || !this._labelText) return;
    const w = this.box.clientWidth, h = this.box.clientHeight, v = new THREE.Vector3();
    for (const L of this.labels) {
      v.copy(L.pos).project(this.camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      L.el.style.opacity = on ? 1 : 0; L.el.style.pointerEvents = on ? 'auto' : 'none';
      if (!on) continue;
      L.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      const [txt, sem] = this._labelText[L.id] || ['—', 'idle'];
      if (L.txt !== txt) { L.el.querySelector('span').textContent = txt; L.txt = txt; }
      if (L.sem !== sem) { L.el.querySelector('i').style.background = SEM[sem]; L.el.dataset.sem = sem; L.sem = sem; }
    }
  }

  render() {
    if (!this.visible) return;
    this.controls.update();
    if (!this.needsRender) return;
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    this.needsRender = false;
  }

  bindPicking() {
    const el = this.renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 450) { down = null; return; }
      down = null;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const objs = [...this.trucks.values()].filter(t => t.obj.visible).map(t => t.obj);
      const hit = ray.intersectObjects(objs, true)[0];
      if (!hit) return;
      let o = hit.object; while (o && !o.userData?.pick) o = o.userData?.owner || o.parent;
      if (o) this.onPick?.(o.userData.v);
    });
  }

  /** Lleva la cámara a un vehículo */
  focusVehicle(v, m) {
    const pose = this.poseOf(v, m, new Map(this.roadOrder.filter(x => stateAt(x, m) === 'carretera').map((x, i) => [x, i])));
    if (!pose) return false;
    const p = B(pose.x, pose.y, 0);
    this.fly = { from: this.camera.position.clone(), to: p.clone().add(new THREE.Vector3(22, 26, 30)), tf: this.controls.target.clone(), tt: p, t0: performance.now(), d: 800 };
    this.needsRender = true;
    return true;
  }
}
const RANK = { idle: 0, ok: 1, warn: 2, crit: 3 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

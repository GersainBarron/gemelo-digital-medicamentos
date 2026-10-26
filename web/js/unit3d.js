// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  unit3d.js · Vista 3D de la unidad médica (hospital tipo)
//
//  · Modelo: assets/unidad_medica.glb (Blender, unidad_builder.py)
//  · Personas muy simples (cápsula + esfera) generadas aquí:
//      pacientes  → una por cada receta de la simulación (llega del consultorio,
//                   espera sentada, pasa a la ventanilla y sale con su bolsa)
//      enfermeras → una por cada vale de quirófano o de urgencias (van a la
//                   ventanilla de vales y regresan con los medicamentos)
//      farmacéuticos, almacenista y la camioneta del CEDIS en el andén
//  · Al tocar a alguien se muestra qué medicamentos retira y su estado.
//  Todo sigue el mismo reloj y los mismos eventos que los indicadores.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UnitSupply } from './supply.js';

const DAY = 86400, MIN = 60;
const WALK = 1.25;                       // m/s
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const B = (x, y, z = 0) => new THREE.Vector3(x, z, -y);   // Blender (x, y, z) → three
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

export const ROLE_COLORS = { patient: '#e2a64b', nurseOR: '#22a37a', nurseER: '#3b82f6', pharma: '#f1f5f9', worker: '#f59e0b' };
const SHIRTS = ['#e2a64b', '#d97757', '#8b5cf6', '#ef4444', '#eab308', '#ec4899', '#a3a3a3', '#f97316', '#84cc16', '#0ea5e9'];
const SKIN = ['#c99a74', '#8d5a3b', '#e0b48f', '#a8744f'];
const PRESETS = {
  general: { pos: [66, 50, 34], target: [31, 0, -19] },
  farmacia: { pos: [44, 18, -2], target: [50, 0, -12.5] },
  urgencias: { pos: [12, 22, -12], target: [12, 0, -33] },
  quirofanos: { pos: [40, 24, -14], target: [40, 0, -34] },
  anden: { pos: [74, 14, -14], target: [60, 0, -27] },
};

export class Unit3D {
  /**
   * @param box     contenedor (div) donde se dibuja
   * @param layout  assets/unidad_layout.json
   * @param opts    { glb, nameOf(c), stockOf(c) }
   */
  constructor(box, layout, opts) {
    this.box = box; this.L = layout; this.opts = opts;
    this.agents = []; this.active = new Map(); this.pool = { patient: [], nurseOR: [], nurseER: [], worker: [] };
    this.selected = null; this.visible = true; this.hospital = true; this.dayIdx = null;
    this.needsRender = true;
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
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(40, 60, 30); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.47; this.controls.minDistance = 6; this.controls.maxDistance = 160;
    this.controls.addEventListener('change', () => { this.needsRender = true; });
    this.view('general', true);

    const gltf = await new GLTFLoader().loadAsync(this.opts.glb);
    this.model = gltf.scene; scene.add(this.model);
    this.hospNodes = []; this.van = null;
    this.model.traverse(o => {
      if (/Muro/.test(o.name)) o.scale.y = 0.55;    // muros a media altura (vista tipo maqueta)
      if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); }
      const ud = o.userData || {};
      if (ud.hosp && !/Muro|Piso/.test(o.name)) this.hospNodes.push(o);
      if (o.name === 'Van_CEDIS') this.van = o;
    });
    if (this.van) { this.van.matrixAutoUpdate = true; this.van.traverse(o => { o.matrixAutoUpdate = true; }); this.van.visible = false; }
    // Flota modelada en Blender (vehiculos_builder.py): camioneta seca, refrigerada y moto de reparto
    try {
      const vg = await new GLTFLoader().loadAsync(this.opts.fleet || 'assets/vehiculos.glb');
      this.fleet = {};
      vg.scene.traverse(o => { if (['Van_Seca', 'Van_Refrigerada', 'Moto_Reparto'].includes(o.name)) this.fleet[o.name] = o; });
      for (const o of Object.values(this.fleet)) { o.removeFromParent(); o.visible = false; o.position.set(0, 0, 0); this.scene.add(o); }
    } catch (err) { console.warn('Sin flota 3D', err); this.fleet = null; }
    // Casillero 24 h / punto de recolección (punto_recoleccion_builder.py), en la plaza de acceso
    try {
      const lg = await new GLTFLoader().loadAsync(this.opts.locker || 'assets/punto_recoleccion.glb');
      const lk = this.locker = lg.scene;
      const p = (this.L.locker || { pos: [24.5, -3.2], face: Math.PI }).pos;
      lk.position.copy(B(p[0], p[1])); lk.rotation.y = (this.L.locker?.face ?? Math.PI);
      lk.userData.info = { kind: 'locker' };
      this.scene.add(lk);
    } catch (err) { console.warn('Sin casillero 3D', err); }
    this.buildShared();
    this.buildStaff();
    this.buildLabels();
    this.buildPanel();
    this.bindPicking();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.box);
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }, { threshold: 0.02 }).observe(this.box);
  }

  // ------------------------------------------------------------------
  //  Recursos compartidos y personas
  // ------------------------------------------------------------------
  buildShared() {
    this.geo = {
      body: new THREE.CapsuleGeometry(0.2, 0.72, 4, 10).translate(0, 0.2 + 0.36 + 0.02, 0),
      head: new THREE.SphereGeometry(0.15, 14, 10).translate(0, 1.5, 0),
      cap: new THREE.CylinderGeometry(0.15, 0.15, 0.08, 12).translate(0, 1.62, 0),
      bag: new THREE.BoxGeometry(0.24, 0.3, 0.12).translate(0.3, 0.75, 0),
      tray: new THREE.BoxGeometry(0.42, 0.06, 0.3).translate(0, 1.02, 0.28),
      ring: new THREE.RingGeometry(0.38, 0.5, 32).rotateX(-Math.PI / 2).translate(0, 0.06, 0),
    };
    const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
    this.mat = {
      shirts: SHIRTS.map(m), skin: SKIN.map(m),
      nurseOR: m(ROLE_COLORS.nurseOR), nurseER: m(ROLE_COLORS.nurseER), pharma: m(ROLE_COLORS.pharma), worker: m(ROLE_COLORS.worker),
      bag: m('#ffffff'), tray: m('#93c5fd'), surgeon: m('#2f8f74'), gown: m('#9fc7d6'),
      ring: new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.95, depthWrite: false }),
    };
    this.ring = new THREE.Mesh(this.geo.ring, this.mat.ring); this.ring.visible = false; this.scene.add(this.ring);
    this.agentRoot = new THREE.Group(); this.scene.add(this.agentRoot);
  }

  makePerson(role, seed = 0) {
    const g = new THREE.Group();
    const R = i => Math.floor(hash(seed + ':' + i) * 1000);
    const bodyMat = role === 'patient' ? this.mat.shirts[R(1) % SHIRTS.length] : this.mat[role] || this.mat.pharma;
    const body = new THREE.Mesh(this.geo.body, bodyMat);
    const head = new THREE.Mesh(this.geo.head, this.mat.skin[R(2) % SKIN.length]);
    g.add(body, head);
    if (role === 'nurseOR' || role === 'nurseER' || role === 'surgeon') g.add(new THREE.Mesh(this.geo.cap, bodyMat));
    const bag = new THREE.Mesh(this.geo.bag, this.mat.bag); bag.visible = false; g.add(bag);
    const tray = new THREE.Mesh(this.geo.tray, this.mat.tray); tray.visible = false; g.add(tray);
    g.userData = { role, body, head, bag, tray };
    return g;
  }

  buildStaff() {
    const L = this.L;
    this.staff = [];
    const add = (role, p, face, info) => {
      const g = this.makePerson(role, info.id);
      g.position.copy(B(p[0], p[1])); g.rotation.y = face;
      g.userData.info = info; this.scene.add(g); this.staff.push(g);
      return g;
    };
    L.windows.forEach(w => add('pharma', w.staff, -Math.PI / 2, { kind: 'pharma', id: 'F' + w.id, window: w.id }));
    add('pharma', L.vales.staff, Math.PI, { kind: 'pharma', id: 'FV', window: 'vales' });
    add('pharma', L.pharmacyStaff[4], Math.PI / 2, { kind: 'pharma', id: 'FS', window: 'surtido' });
    this.erStaff = L.urgencias.staff.map((p, i) => add('nurseER', p, Math.PI, { kind: 'erstaff', id: 'U' + i }));
    this.whStaff = add('worker', L.almacenStaff[0], -Math.PI / 2, { kind: 'worker', id: 'A1' });
    // Jefatura de farmacia (fase 3): valida los pedidos extraordinarios en su terminal
    if (L.jefatura) {
      this.chief = add('pharma', L.jefatura.seat, 0, { kind: 'jefatura', id: 'FJ' });
      const mk = new THREE.Group();
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      pin.rotation.x = Math.PI; mk.add(pin);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), pin.material); ball.position.y = 0.38; mk.add(ball);
      const b = L.jefatura.badge; mk.position.copy(B(b[0], b[1])); mk.position.y = b[2];
      mk.visible = false; this.scene.add(mk); this.pexMarker = mk;
    }
    // Personas acostadas (quirófano / urgencias) y equipo quirúrgico, se muestran cuando hay actividad
    const lying = () => { const g = this.makePerson('patient', Math.random()); g.userData.body.material = this.mat.gown; g.rotation.set(0, 0, 0); return g; };
    this.salaProps = L.salas.map(s => {
      const pat = lying(); pat.rotation.x = -Math.PI / 2; pat.position.copy(B(s.table[0], s.table[1] - 0.85, 1.05)); pat.visible = false;
      const surg = this.makePerson('surgeon', 'S' + s.id); surg.userData.body.material = this.mat.surgeon; surg.position.copy(B(s.table[0] + 0.75, s.table[1])); surg.rotation.y = -Math.PI / 2; surg.visible = false;
      const anes = this.makePerson('surgeon', 'A' + s.id); anes.userData.body.material = this.mat.surgeon; anes.position.copy(B(s.table[0], s.table[1] + 1.55)); anes.rotation.y = 0; anes.visible = false;
      for (const g of [pat, surg, anes]) { g.userData.info = { kind: 'sala', sala: s }; this.scene.add(g); }
      return { sala: s, pat, surg, anes };
    });
    this.bedProps = L.urgencias.beds.map((b, k) => {
      const pat = lying(); pat.rotation.x = -Math.PI / 2; pat.position.copy(B(b[0], b[1] - 0.85, 0.98)); pat.visible = false;
      pat.userData.info = { kind: 'bed', bed: k + 1 }; this.scene.add(pat);
      return pat;
    });
  }

  // ------------------------------------------------------------------
  //  Agenda del día a partir de los eventos de la simulación
  // ------------------------------------------------------------------
  /** @param supply UnitSupply ya corrido para el día; @param hospital ¿tiene quirófano y urgencias? */
  setDay(supply, hospital) {
    this.supply = supply;
    this.hospital = hospital;
    for (const n of this.hospNodes) n.visible = hospital;
    for (const l of this.labels) l.el.hidden = l.hosp && !hospital;
    this.erStaff.forEach(g => { g.visible = hospital; });
    this.clearAgents();
    const evs = supply.today.events;
    this.dayIdx = supply.todayIdx;
    const L = this.L;
    const agents = [];
    // --- Pacientes de farmacia
    // las recetas resurtibles inscritas en entrega programada no hacen fila (van a domicilio, casillero o punto)
    const rx = evs.filter(e => e.kind === 'rx' && !this.opts.skipRx?.(e));
    const seatFree = L.seats.map(() => -Infinity);
    const winFree = L.windows.map(() => -Infinity);
    const plan = rx.map(e => {
      const r = hash(e.folio);
      const wait = (6 + r * 24) * MIN;      // espera en farmacia: 6 a 30 min
      return { e, tSeat: e.t - 75 - wait };
    }).sort((a, b) => a.tSeat - b.tSeat);
    for (const p of plan) {
      const e = p.e, r = hash(e.folio + 's');
      // ventanilla: la que se libera primero
      let w = 0; for (let i = 1; i < winFree.length; i++) if (winFree[i] < winFree[w]) w = i;
      winFree[w] = e.t + 35;
      const win = L.windows[w];
      // asiento libre (si no hay, espera de pie)
      const free = seatFree.map((f, i) => [f, i]).filter(([f]) => f <= p.tSeat).map(([, i]) => i);
      const si = free.length ? free[Math.floor(r * free.length)] : -1;
      const tLeaveSeat = e.t - 75;
      if (si >= 0) seatFree[si] = tLeaveSeat + 5;
      const seat = si >= 0 ? L.seats[si] : L.standing[Math.floor(r * L.standing.length)];
      const cons = L.consultorios[(e.cons - 1) % L.consultorios.length];
      const ws = win.stand, wy = ws[1];
      const toSeat = si >= 0
        ? [cons.door, [cons.door[0], 20], [31, 20], [33, 15], L.waitEntry, [L.waitEntry[0], 13.1], [seat[0] + 0.9, 13.1], [seat[0] + 0.9, seat[1]], [seat[0] + 0.05, seat[1]]]
        : [cons.door, [cons.door[0], 20], [31, 20], [33, 15], L.waitEntry, [L.waitEntry[0], 13.1], seat];
      const toWin = si >= 0
        ? [[seat[0] + 0.05, seat[1]], [seat[0] + 0.9, seat[1]], [seat[0] + 0.9, 13.1], [50.0, 13.1], [50.0, wy], ws]
        : [seat, [50.0, seat[1]], [50.0, wy], ws];
      const out = [ws, [50.0, wy], [50.0, 8.6], [40.5, 6.5], [38.0, 1.2], [38.0, -3.2], [35.0, -4.6]];
      const k = new Keys();
      k.path(toSeat, p.tSeat, true);
      k.hold(tLeaveSeat, si >= 0 ? { pose: 'sit', face: Math.PI / 2 } : { face: Math.PI / 2 }, 'wait');
      k.path(toWin, tLeaveSeat, false, 'towin');
      k.hold(e.t + 35, { face: Math.PI / 2 }, 'window');
      k.path(out, e.t + 35, false, 'leave');
      agents.push({ role: 'patient', e, keys: k, window: win.id, seat: si, id: e.folio });
    }
    // --- Enfermeras (vales de quirófano y urgencias)
    if (hospital) {
      const V = L.vales.stand;
      for (const e of evs.filter(x => x.kind === 'or' || x.kind === 'er')) {
        let route, home;
        if (e.kind === 'or') {
          const s = salaOf(L, e);
          home = s.nurse;
          route = [s.nurse, [s.door[0], 31.0], [s.door[0], 29.2], [40, 26.5], [40, 23.0], [40, 20], [55.5, 20], [V[0], V[1]]];
        } else {
          home = L.urgencias.station;
          route = [home, [12, 23.0], [12, 20], [55.5, 20], [V[0], V[1]]];
        }
        const len = pathLen(route);
        const k = new Keys();
        const t0 = e.t - 90 - len / WALK;
        k.path(route, t0, true);
        k.hold(e.t + 25, { face: 0 }, 'vales');
        const back = [...route].reverse();
        if (e.kind === 'er') { const b = L.urgencias.beds[(parseInt(e.sala.replace(/\D/g, ''), 10) - 1) % 6]; back.push([b[0], b[1] - 2.2]); }
        k.path(back, e.t + 25, false, 'return');
        k.hold(k.end + 40, {}, 'deliver');
        agents.push({ role: e.kind === 'or' ? 'nurseOR' : 'nurseER', e, keys: k, id: e.folio });
      }
    }
    // --- Camioneta del CEDIS
    this.vanPlan = evs.filter(e => e.kind === 'in').map(e => ({ e, arrive: e.t - 20 * MIN, leave: e.t }));
    this.agents = agents.sort((a, b) => a.keys.start - b.keys.start);
    this.surgeries = evs.filter(e => e.kind === 'or').map(e => ({ e, sala: salaOf(this.L, e), t0: e.t - 20 * MIN, t1: e.t + 70 * MIN }));
    this.erCases = evs.filter(e => e.kind === 'er').map(e => ({ e, bed: (parseInt(e.sala.replace(/\D/g, ''), 10) - 1) % 6, t0: e.t - 40 * MIN, t1: e.t + 100 * MIN }));
    this.needsRender = true;
  }

  clearAgents() {
    for (const [a, g] of this.active) { this.agentRoot.remove(g); this.pool[a.role].push(g); }
    this.active.clear();
    if (this.selected && this.selected.agent) this.select(null);
  }

  // ------------------------------------------------------------------
  //  Cuadro a cuadro
  // ------------------------------------------------------------------
  frame(t, st) {
    this.t = t; this.st = st;
    if (!this.visible || document.hidden || !this.agents) return;
    // personas en movimiento
    const want = new Set();
    for (const a of this.agents) {
      if (a.keys.start > t) break;
      if (t <= a.keys.end) want.add(a);
    }
    for (const [a, g] of this.active) if (!want.has(a)) { this.agentRoot.remove(g); this.pool[a.role].push(g); this.active.delete(a); if (this.selected?.agent === a) this.select(null); }
    for (const a of want) {
      let g = this.active.get(a);
      if (!g) {
        g = this.pool[a.role].pop() || this.makePerson(a.role, a.id);
        if (a.role === 'patient') { g.userData.body.material = this.mat.shirts[Math.floor(hash(a.id) * SHIRTS.length)]; g.userData.head.material = this.mat.skin[Math.floor(hash(a.id + 'k') * SKIN.length)]; }
        g.userData.agent = a; this.agentRoot.add(g); this.active.set(a, g);
      }
      const s = a.keys.sample(t);
      g.position.set(s.x, s.pose === 'sit' ? -0.36 : 0, -s.y);
      g.rotation.y = s.face;
      g.userData.bag.visible = a.role === 'patient' && s.phase === 'leave';
      g.userData.tray.visible = a.role !== 'patient' && (s.phase === 'return' || s.phase === 'deliver');
    }
    // quirófanos y cubículos ocupados
    for (const sp of this.salaProps) {
      const s = this.hospital && this.surgeries.find(x => x.sala.id === sp.sala.id && t >= x.t0 && t <= x.t1);
      sp.pat.visible = sp.surg.visible = sp.anes.visible = !!s;
      sp.pat.userData.info = { kind: 'sala', sala: sp.sala, surgery: s || null };
    }
    this.bedProps.forEach((p, k) => {
      const c = this.hospital && this.erCases.find(x => x.bed === k && t >= x.t0 && t <= x.t1);
      p.visible = !!c; p.userData.info = { kind: 'bed', bed: k + 1, case: c || null };
    });
    // camioneta del CEDIS
    if (this.van) {
      const plans = [...this.vanPlan, ...(st?.urgentToday || []).map(e => ({ e, arrive: e.t - 10 * MIN, leave: e.t }))];
      const v = plans.find(x => t >= x.arrive - 25 && t <= x.leave + 25);
      // camioneta refrigerada si la entrega trae claves de red fría
      if (this.fleet?.Van_Seca) {
        const cold = v && v.e.lines?.some(l => l.q > 0 && this.opts.isCold?.(l.c));
        const pick = cold ? this.fleet.Van_Refrigerada : this.fleet.Van_Seca;
        this.fleet.Van_Seca.visible = this.fleet.Van_Refrigerada.visible = false;
        if (this.van !== pick) { if (this.van) this.van.visible = false; this.van = pick; }
      }
      this.van.visible = !!v;
      if (v) {
        const P = this.L.van, park = P.park;
        let x = park[0], heading = 0;
        if (t < v.arrive) { x = park[0] + (v.arrive - t) * 0.6; }             // llega de reversa desde el patio
        else if (t > v.leave) { x = park[0] + (t - v.leave) * 0.6; }
        this.van.position.set(x, 0, -park[1]); this.van.rotation.y = heading;
        this.van.userData.info = { kind: 'van', plan: v };
      }
      // almacenista: va y viene entre el andén y el almacén durante la descarga
      const unloading = v && t >= v.arrive && t <= v.leave;
      const a = this.L.almacenStaff[0];
      if (unloading) {
        const ph = ((t - v.arrive) % 120) / 120, k = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        this.whStaff.position.copy(B(a[0] + k * 5.4, a[1])); this.whStaff.rotation.y = ph < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        this.whStaff.userData.tray.visible = ph >= 0.5;
      } else { this.whStaff.position.copy(B(a[0], a[1])); this.whStaff.userData.tray.visible = false; }
    }
    // moto de reparto a domicilio (última milla): sale del andén en cada salida y regresa al terminar
    const moto = this.fleet?.Moto_Reparto;
    if (moto) {
      if (!this.rider) { this.rider = this.makePerson('worker', 'MR'); this.rider.scale.setScalar(0.92); this.scene.add(this.rider); this.rider.visible = false; }
      const park = [64.6, 22.6], turnX = 79, outY = -8, S = 0.15;       // m/s de simulación (lento para verlo a 10× y 60×)
      const rs = this.opts.motoRoutes?.() || [];
      const r = rs.find(x => t >= x.start - 25 * MIN && t <= x.end + 10 * MIN);
      let pos = park, head = Math.PI / 2, moving = false;
      if (r) {
        const legA = (turnX - park[0]) / S, legB = (park[1] - outY) / S;          // segundos
        const go = t - r.start, back = r.end - t;
        if (go >= 0 && go < legA) { pos = [park[0] + go * S, park[1]]; head = 0; moving = true; }
        else if (go >= legA && go < legA + legB) { pos = [turnX, park[1] - (go - legA) * S]; head = -Math.PI / 2; moving = true; }
        else if (back > 0 && back < legB) { pos = [turnX, park[1] - back * S]; head = Math.PI / 2; moving = true; }
        else if (back <= legB + legA && back >= legB) { pos = [turnX - (legB + legA - back) * S, park[1]]; head = Math.PI; moving = true; }
        else if (go >= legA + legB && back >= legA + legB) pos = null;          // en ruta, fuera de la unidad
      }
      moto.visible = !!pos;
      if (pos) { moto.position.copy(B(pos[0], pos[1])); moto.rotation.y = head; moto.userData.info = { kind: 'moto', route: r || null }; }
      this.rider.visible = !!pos && (moving || (r && t >= r.start - 25 * MIN && t < r.start));
      if (this.rider.visible) { this.rider.position.copy(moving ? B(pos[0] - 0.25 * Math.cos(head), pos[1] - 0.25 * Math.sin(head), 0.45) : B(park[0] - 1.2, park[1])); this.rider.rotation.y = head + Math.PI / 2; }
    }
    // pedidos extraordinarios en flujo: marcador sobre la terminal de la jefatura
    if (this.pexMarker) {
      const live = (st?.pexList || []).filter(p => p.t0 <= t).map(p => UnitSupply.pexState(p, t)).filter(s => !['delivered', 'nostock'].includes(s));
      const k = live.includes('proposed') ? 'proposed' : live.includes('validated') ? 'validated' : live.length ? 'moving' : '';
      this.pexMarker.visible = !!k;
      if (k) {
        this.pexMarker.children[0].material.color.set(k === 'proposed' ? 0xef4444 : k === 'validated' ? 0xf59e0b : 0x60a5fa);
        this.pexMarker.position.y = this.L.jefatura.badge[2] + 0.12 * Math.sin(performance.now() / 300);
        this.pexMarker.rotation.y += 0.03;
      }
      const txt = k === 'proposed' ? `📋 Pedido extraordinario por validar · jefatura de farmacia` : k === 'validated' ? '📋 Pedido validado · esperando autorización del CEDIS' : '';
      if (this._pexTxt !== txt) { this._pexTxt = txt; this.pexEl.hidden = !txt; this.pexEl.textContent = txt; }
    }
    // alertas abiertas al CEDIS
    const n = st?.open?.length || 0;
    if (this._alertN !== n) {
      this._alertN = n;
      this.alertEl.hidden = !n;
      this.alertEl.textContent = n ? `⚠ ${n} ${n === 1 ? 'clave agotada' : 'claves agotadas'} · ${n === 1 ? 'alerta enviada' : 'alertas enviadas'} al CEDIS` : '';
    }
    // selección
    if (this.selected) {
      const o = this.selected.obj;
      this.ring.position.set(o.position.x, 0, o.position.z);
      this.ring.visible = o.visible !== false && (!this.selected.agent || this.active.has(this.selected.agent));
      if (!this._pt || performance.now() - this._pt > 400) { this._pt = performance.now(); this.renderPanel(); }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  // ------------------------------------------------------------------
  //  Cámara, etiquetas y tamaño
  // ------------------------------------------------------------------
  view(id, instant) {
    const p = PRESETS[id] || PRESETS.general;
    const to = new THREE.Vector3(...p.pos), tg = new THREE.Vector3(...p.target);
    if (instant) { this.camera.position.copy(to); this.controls.target.copy(tg); this.controls.update(); return; }
    const from = this.camera.position.clone(), fromT = this.controls.target.clone(), t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 900), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.camera.position.lerpVectors(from, to, e); this.controls.target.lerpVectors(fromT, tg, e);
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }
  resize() {
    const w = this.box.clientWidth, h = this.box.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  buildLabels() {
    const layer = document.createElement('div'); layer.className = 'u3d-labels'; this.box.appendChild(layer);
    this.labels = this.L.zones.filter(z => !['lobby', 'pasillo', 'servicios'].includes(z.id)).map(z => {
      const el = document.createElement('span'); el.className = 'u3d-label'; el.textContent = z.name; layer.appendChild(el);
      const c = this.L.labels[z.id];
      return { el, pos: B(c[0], c[1], 3.4), hosp: z.hosp };
    });
  }
  updateLabels() {
    const w = this.box.clientWidth, h = this.box.clientHeight, v = new THREE.Vector3();
    for (const l of this.labels) {
      if (l.el.hidden) continue;
      v.copy(l.pos).project(this.camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      l.el.style.opacity = on ? 1 : 0;
      if (on) l.el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`;
    }
  }

  // ------------------------------------------------------------------
  //  Selección y ficha
  // ------------------------------------------------------------------
  bindPicking() {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const targets = [...this.active.values(), ...this.staff.filter(g => g.visible), ...this.salaProps.flatMap(s => [s.pat, s.surg, s.anes]).filter(g => g.visible), ...this.bedProps.filter(g => g.visible)];
      if (this.van?.visible) targets.push(this.van);
      if (this.fleet?.Moto_Reparto?.visible) targets.push(this.fleet.Moto_Reparto);
      if (this.locker) targets.push(this.locker);
      // zona de toque generosa: se prueba contra un cilindro invisible aproximado por distancia al rayo
      let best = null, bestD = IS_TOUCH ? 0.9 : 0.6;
      const p = new THREE.Vector3();
      for (const g of targets) {
        const isVan = g === this.van || g === this.locker;
        p.copy(g.position); p.y += isVan ? 1.3 : 0.9;
        const d = ray.ray.distanceToPoint(p);
        const lim = isVan ? 2.6 : bestD;
        if (d < lim && (!best || d < best.d)) best = { g, d };
      }
      this.select(best ? best.g : null);
    });
  }
  select(g) {
    if (!g) { this.selected = null; this.ring.visible = false; this.panel.hidden = true; return; }
    this.selected = { obj: g, agent: g.userData.agent || null };
    this.panel.hidden = false;
    this._pt = 0; this.renderPanel();
  }
  buildPanel() {
    const a = this.alertEl = document.createElement('div'); a.className = 'u3d-alert'; a.hidden = true; this.box.appendChild(a);
    const px = this.pexEl = document.createElement('div'); px.className = 'u3d-alert u3d-pex'; px.hidden = true; this.box.appendChild(px);
    px.addEventListener('click', () => { if (this.chief) this.select(this.chief); });
    const p = this.panel = document.createElement('div');
    p.className = 'u3d-panel'; p.hidden = true;
    this.box.appendChild(p);
    p.addEventListener('click', e => { if (e.target.closest('.u3d-x')) this.select(null); });
  }
  lineHtml(e, l, i, t) {
    const name = this.opts.nameOf(l.c), pz = this.opts.unitOf(l.c, l.q);
    if (t >= e.t && e.out) {
      const g = e.out[i];
      const lot = (e.lots?.[i] || []).map(x => x[0]).join(', ');
      if (g >= l.q) return `<li class="ok"><b>${l.q}</b><span>${esc(name)}${lot ? `<small class="lot">lote ${lot}</small>` : ''}</span><em>✓ entregado</em></li>`;
      if (g > 0) return `<li class="warn"><b>${g}/${l.q}</b><span>${esc(name)}</span><em>parcial</em></li>`;
      return `<li class="no"><b>${l.q}</b><span>${esc(name)}<small class="lot">queda como receta pendiente · se le avisará</small></span><em>✗ sin existencia</em></li>`;
    }
    const s = this.opts.stockOf(l.c);
    return `<li><b>${l.q}</b><span>${esc(name)} <small>${esc(pz)}</small></span><em class="${s >= l.q ? '' : 'no'}">${s >= l.q ? `existencia ${s}` : 'sin existencia'}</em></li>`;
  }
  renderPanel() {
    if (!this.selected) return;
    const t = this.t, g = this.selected.obj, a = this.selected.agent;
    let title = '', sub = '', rows = [], lines = '';
    const lineList = e => `<ul class="u3d-lines">${e.lines.map((l, i) => this.lineHtml(e, l, i, t)).join('')}</ul>`;
    if (a) {
      const e = a.e, ph = a.keys.sample(t).phase;
      if (a.role === 'patient') {
        title = `Derechohabiente ···${e.pac}`; sub = 'Paciente · farmacia de consulta externa';
        const state = { walk: 'Camina del consultorio a farmacia', wait: a.seat >= 0 ? 'En sala de espera' : 'Espera de pie (sin asiento)', towin: `Pasa a la ventanilla ${a.window}`, window: t < e.t ? `En ventanilla ${a.window} · surtiendo` : `En ventanilla ${a.window} · recibe medicamentos`, leave: e.full ? 'Sale con sus medicamentos' : 'Sale con receta parcial' }[ph] || '';
        rows = [['Receta', e.folio], ['Consultorio', String(e.cons)], ['Estado', state], ['Atención', `${hhmm(e.t)} · ventanilla ${a.window}`]];
        lines = `<p class="u3d-h">${t >= e.t ? 'Medicamentos que retira' : 'Medicamentos que va a retirar'}</p>${lineList(e)}`;
      } else {
        const isOR = a.role === 'nurseOR';
        title = isOR ? 'Enfermera de quirófano' : 'Enfermera de urgencias';
        sub = `${e.folio} · ${e.proc}`;
        const state = { walk: 'Va a la ventanilla de vales', vales: t < e.t ? 'En ventanilla de vales · surtiendo' : 'Recibe los medicamentos', return: `Regresa a ${isOR ? e.sala : 'urgencias'} con los medicamentos`, deliver: `Entrega en ${e.sala}` }[ph] || '';
        rows = [['Vale', e.folio], [isOR ? 'Sala' : 'Ubicación', e.sala], [isOR ? 'Procedimiento' : 'Atención', e.proc], ['Estado', state], ['Surtido en farmacia', hhmm(e.t)]];
        lines = `<p class="u3d-h">Medicamentos del vale</p>${lineList(e)}`;
      }
    } else {
      const info = g.userData.info || {};
      if (info.kind === 'pharma') {
        title = info.window === 'vales' ? 'Farmacia · ventanilla de vales' : info.window === 'surtido' ? 'Farmacia · surtido' : `Farmacia · ventanilla ${info.window}`;
        sub = 'Personal de farmacia';
        const served = this.agents.filter(x => x.role === 'patient' && x.window === info.window && x.e.t <= t).length;
        const cur = this.agents.find(x => x.role === 'patient' && x.window === info.window && t >= x.e.t - 75 && t <= x.e.t + 35);
        const curV = this.agents.find(x => x.role !== 'patient' && t >= x.e.t - 90 && t <= x.e.t + 25);
        if (info.window === 'vales') rows = [['Atendiendo', curV ? `${curV.e.folio} · ${curV.e.sala}` : 'Libre'], ['Vales surtidos hoy', String(this.agents.filter(x => x.role !== 'patient' && x.e.t <= t).length)]];
        else if (info.window === 'surtido') rows = [['Tarea', 'Prepara recetas y vales'], ['Recetas surtidas hoy', String(this.agents.filter(x => x.role === 'patient' && x.e.t <= t).length)]];
        else rows = [['Atendiendo', cur ? `${cur.e.folio} · ···${cur.e.pac}` : 'Libre'], ['Recetas surtidas hoy', String(served)]];
        if (cur && info.window !== 'vales' && info.window !== 'surtido') lines = `<p class="u3d-h">Receta en ventanilla</p>${lineList(cur.e)}`;
        if (curV && info.window === 'vales') lines = `<p class="u3d-h">Vale en ventanilla</p>${lineList(curV.e)}`;
      } else if (info.kind === 'sala') {
        const s = info.surgery;
        title = info.sala.name; sub = s ? 'Sala ocupada' : 'Sala libre';
        if (s) { rows = [['Procedimiento', s.e.proc], ['Vale', s.e.folio], ['Tipo', s.e.urgent ? 'Urgencia' : 'Programada'], ['Medicamento surtido', hhmm(s.e.t)]]; lines = `<p class="u3d-h">Medicamentos de la cirugía</p>${lineList(s.e)}`; }
      } else if (info.kind === 'bed') {
        const c = info.case;
        title = `Urgencias · cubículo ${info.bed}`; sub = c ? c.e.proc : 'Libre';
        if (c) { rows = [['Vale', c.e.folio], ['Medicamento surtido', hhmm(c.e.t)]]; lines = `<p class="u3d-h">Medicamentos indicados</p>${lineList(c.e)}`; }
      } else if (info.kind === 'van') {
        const e = info.plan.e, pcs = e.lines.reduce((n, l) => n + l.q, 0), req = e.lines.reduce((n, l) => n + l.req, 0);
        title = 'Camioneta del CEDIS'; sub = e.type === 'Urgente' ? `Reabasto urgente N${e.level}${e.req ? ' · ' + e.req.id : ''}` : `Entrega ordinaria · ruta ${e.route}`;
        rows = [['Llegada', hhmm(info.plan.arrive)], ['Descarga hasta', hhmm(info.plan.leave)], ['Claves', String(e.lines.length)], ['Piezas', `${pcs.toLocaleString('es-MX')} · ${req ? Math.round(100 * pcs / req) : 100} % surtido`]];
        lines = `<p class="u3d-h">Claves que entrega</p><ul class="u3d-lines">${e.lines.slice().sort((x, y) => y.q - x.q).map(l => `<li class="${l.q < l.req ? 'no' : ''}"><b>${l.q}</b><span>${esc(this.opts.nameOf(l.c))}</span><em>${l.q < l.req ? esc(l.why || 'faltante') : ''}</em></li>`).join('')}</ul>`;
      } else if (info.kind === 'jefatura') {
        title = 'Jefatura de farmacia'; sub = 'Valida los pedidos extraordinarios (plazo 2 h)';
        const ST = { proposed: 'Por validar', validated: 'Validado · por autorizar en CEDIS', authorized: 'Autorizado por CEDIS', scheduled: 'Programado en ruta', enroute: 'En camino', delivered: 'Entregado', nostock: 'Sin existencia en CEDIS' };
        const list = (this.st?.pexList || []).filter(p => p.t0 <= t).sort((x, y) => y.t0 - x.t0).slice(0, 3);
        rows = list.length ? list.map(p => [p.id, `${ST[UnitSupply.pexState(p, t)]} · ${p.lines.length} clave${p.lines.length > 1 ? 's' : ''}`]) : [['Pedidos', 'Sin pedidos extraordinarios en curso']];
        if (list[0]) lines = `<p class="u3d-h">${list[0].id} · se agotaría en ${list[0].minCover < 2 ? (list[0].minCover * 24).toFixed(0) + ' h' : list[0].minCover.toFixed(1) + ' días'}</p><ul class="u3d-lines">${list[0].lines.map(l => `<li class="${l.q < l.req ? 'no' : ''}"><b>${l.q}</b><span>${esc(l.name)}<small class="lot">tiene ${l.stock} · ${l.cover.toFixed(1)} días</small></span><em>${esc(l.cut || '')}</em></li>`).join('')}</ul>`;
      } else if (info.kind === 'moto') {
        const r = info.route;
        title = 'Moto de reparto a domicilio'; sub = 'Última milla · recetas a pacientes';
        if (r) {
          rows = [['Salida', hhmm(r.start)], ['Regreso estimado', hhmm(r.end)], ['Paradas', `${r.stopsN} · ${r.orders} entregas`], ['Recorrido', `${r.km.toFixed(1)} km · $${Math.round(r.cost)}`]];
          lines = `<p class="u3d-h">Entregas de la salida</p><ul class="u3d-lines">${r.legs.flatMap(l => l.st.orders).map(o => `<li><b>${hhmm(o.eta)}</b><span>${o.folio} · ···${o.pac}<small class="lot">${o.mode === 'punto' ? 'punto aliado' : 'domicilio'} · ${o.lines.length} clave${o.lines.length > 1 ? 's' : ''}</small></span><em>${t >= o.eta ? '✓' : ''}</em></li>`).join('')}</ul>`;
        } else rows = [['Estado', 'En la unidad · próxima salida 10:00 o 15:30']];
      } else if (g === this.locker || info.kind === 'locker') {
        const os = (this.opts.lockerOrders?.() || []).filter(o => o.ready + 30 * MIN <= t && Math.floor(o.ready / DAY) >= Math.floor(t / DAY) - 3);
        const inside = os.filter(o => t < o.done), picked = os.filter(o => t >= o.done && Math.floor(o.done / DAY) === Math.floor(t / DAY));
        title = 'Casillero 24 h'; sub = 'Recolección con código QR, sin fila';
        rows = [['Compartimentos ocupados', `${inside.length} de 24`], ['Recogidas hoy', String(picked.length)]];
        lines = inside.length ? `<p class="u3d-h">Esperando recolección</p><ul class="u3d-lines">${inside.slice(0, 10).map(o => `<li><b>${String(1 + (parseInt(o.folio.replace(/\D/g, '')) % 24)).padStart(2, '0')}</b><span>${o.folio} · ···${o.pac}<small class="lot">listo desde ${hhmm(o.ready + 30 * MIN)}</small></span></li>`).join('')}</ul>` : '';
      } else if (info.kind === 'worker') {
        title = 'Almacenista'; sub = 'Almacén de la unidad';
        rows = [['Tarea', this.whStaff.userData.tray.visible ? 'Lleva cajas del andén al almacén' : 'Recibe y acomoda medicamento']];
      } else if (info.kind === 'erstaff') {
        title = 'Personal de urgencias'; sub = 'Estación de enfermería';
        rows = [['Pacientes en cubículos', String(this.bedProps.filter(p => p.visible).length)]];
      }
    }
    this.panel.innerHTML = `<header><div><b>${esc(title)}</b><small>${esc(sub)}</small></div><button class="u3d-x" aria-label="Cerrar">×</button></header>
      ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}${lines}`;
  }
}

// ---------------------------------------------------------------------
//  Trayectorias con tiempo (puntos en coordenadas Blender)
// ---------------------------------------------------------------------
class Keys {
  constructor() { this.k = []; }
  get start() { return this.k[0].t; }
  get end() { return this.k.at(-1).t; }
  /** recorre los puntos empezando en t0 */
  path(pts, t0, first = false, phase = 'walk') {
    let t = t0;
    pts.forEach((p, i) => {
      if (i === 0) {
        if (first || !this.k.length) this.k.push({ t, x: p[0], y: p[1], phase });
        return;
      }
      const q = pts[i - 1];
      t += Math.hypot(p[0] - q[0], p[1] - q[1]) / WALK;
      this.k.push({ t, x: p[0], y: p[1], phase });
    });
    return t;
  }
  /** se queda quieto hasta t */
  hold(t, opt = {}, phase = 'wait') {
    const last = this.k.at(-1);
    last.hold = { ...opt, phase };
    this.k.push({ t: Math.max(t, last.t), x: last.x, y: last.y, phase, ...opt, still: true });
  }
  sample(t) {
    const k = this.k;
    if (t <= k[0].t) return { x: k[0].x, y: k[0].y, face: 0, phase: k[0].phase };
    let i = 1;
    while (i < k.length && k[i].t < t) i++;
    if (i >= k.length) { const l = k.at(-1); return { x: l.x, y: l.y, face: l.face ?? this.lastFace ?? 0, phase: l.phase, pose: l.pose }; }
    const a = k[i - 1], b = k[i];
    if (b.still) return { x: a.x, y: a.y, face: b.face ?? faceOf(k, i - 1), phase: b.phase, pose: b.pose };
    const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
    const face = Math.atan2(b.x - a.x, -(b.y - a.y));   // hacia donde camina (frente = +Z local)
    this.lastFace = face;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, face, phase: b.phase };
  }
}
function faceOf(k, i) {
  for (let j = i; j > 0; j--) { const a = k[j - 1], b = k[j]; if (a.x !== b.x || a.y !== b.y) return Math.atan2(b.x - a.x, -(b.y - a.y)); }
  return 0;
}
function pathLen(p) { let n = 0; for (let i = 1; i < p.length; i++) n += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return n; }
function salaOf(L, e) {
  if (e.sala === 'Tococirugía') return L.salas[3];
  const n = parseInt(String(e.sala).replace(/\D/g, ''), 10) || 1;
  return L.salas[(n - 1) % 3];
}

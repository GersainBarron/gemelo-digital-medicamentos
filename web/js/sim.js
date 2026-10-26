// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  sim.js · Simulación operativa del almacén (datos simulados)
//  - Agentes (montacargas, reach truck, AGV, AMR, carritos) recorren rutas
//  - Conveyor de empaque con cajas en movimiento
//  - KPIs: flujo de pallets, pedidos, ocupación, baterías, temperatura, andenes
//
//  Coordenadas: las rutas se escriben en metros con el sistema de Blender
//  (X = largo de la nave, Y = ancho). b2t() las convierte a three.js (Y arriba).
//  Para conectar datos reales más adelante, reemplaza los métodos marcados
//  con  >>> API  por lecturas de tu backend (REST / WebSocket).
// =====================================================================
import * as THREE from 'three';

/** Blender (x, y, z) -> three.js (x, z, -y) */
export const b2t = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------
//  CONFIGURACIÓN (edita aquí rutas, velocidades y comportamientos)
//  route: nombre de una ruta de warehouse_layout.json o lista [[x, y], ...]
//  mode : 'pingpong' (ida y vuelta) | 'loop' (circuito) | 'charge' | 'static'
//  atStart / atEnd: acción al llegar a cada extremo ('pick' | 'drop' | 'lift')
//  yawOffset: HALF_PI para equipos cuyo frente es +X local (carritos)
// ---------------------------------------------------------------------
export const SIM_CONFIG = {
  startHour: 8,
  agents: [
    { name: 'Forklift_01', label: 'Montacargas 01', mode: 'pingpong', speed: 2.0,
      route: [[7.5, 9.3], [7.5, 10.8], [9.25, 11.6], [9.25, 26.0]],
      load: 'Load_OnForklift_01', atStart: 'pick', atEnd: 'drop', liftMax: 1.6,
      task: 'Recepción R2 → Pasillo B (ubicación)', onStart: 'received', onEnd: 'putaway', aisle: 'B' },
    { name: 'Forklift_02', label: 'Montacargas 02', mode: 'pingpong', speed: 2.0, startAt: 'end',
      route: [[21.05, 26.0], [21.05, 12.2], [42.5, 12.2], [42.5, 4.2]],
      load: 'Load_OnForklift_02', atStart: 'pick', atEnd: 'drop', liftMax: 1.2,
      task: 'Pasillo D → Andén D2 (despacho)', onStart: 'retrieve', onEnd: 'shipped', aisle: 'D' },
    { name: 'ReachTruck_01', label: 'Reach truck 01', mode: 'pingpong', speed: 1.1,
      route: 'Route_Forklift_Aisle_C', atStart: 'lift', atEnd: 'lift', liftMax: 2.9, carriageBase: 0.05,
      task: 'Reabasto en pasillo C', onEnd: 'replenish' },
    { name: 'AGV_Pallet_03', label: 'AGV 03', mode: 'pingpong', speed: 1.3,
      route: [[20.0, 8.4], [20.0, 10.0], [21.5, 10.8], [25.5, 10.8], [26.95, 12.2], [26.95, 26.0]],
      load: 'Load_OnAGV_03', atStart: 'pick', atEnd: 'drop',
      task: 'Traslado automático → Pasillo E', onEnd: 'putaway', aisle: 'E' },
    { name: 'AMR_Tote_01', label: 'AMR totes 01', mode: 'pingpong', speed: 0.9,
      route: [[34.2, 25.1], [40.4, 25.1]], atStart: 'lift', atEnd: 'lift', liftMax: 0,
      task: 'Totes entre estaciones de picking', onEnd: 'picked' },
    { name: 'Cart_Picking_01', label: 'Carrito picking 01', mode: 'pingpong', speed: 0.7, yawOffset: HALF_PI,
      route: [[32.5, 15.3], [32.5, 23.5]], atEnd: 'lift', atStart: 'lift', liftMax: 0, task: 'Surtido pasillo P1', onEnd: 'picked' },
    { name: 'Cart_Picking_02', label: 'Carrito picking 02', mode: 'pingpong', speed: 0.6, yawOffset: HALF_PI,
      route: [[35.5, 23.5], [35.5, 15.3]], atEnd: 'lift', atStart: 'lift', liftMax: 0, task: 'Surtido pasillo P2', onEnd: 'picked' },
    { name: 'Cart_Picking_03', label: 'Carrito picking 03', mode: 'pingpong', speed: 0.65, yawOffset: HALF_PI,
      route: [[38.5, 15.3], [38.5, 23.5]], atEnd: 'lift', atStart: 'lift', liftMax: 0, task: 'Surtido pasillo P3', onEnd: 'picked' },
    // Equipos estacionarios
    { name: 'Forklift_03', label: 'Montacargas 03', mode: 'charge' },
    { name: 'ReachTruck_02', label: 'Reach truck 02', mode: 'charge' },
    { name: 'AGV_Pallet_01', label: 'AGV 01', mode: 'charge' },
    { name: 'AGV_Pallet_02', label: 'AGV 02', mode: 'charge' },
    { name: 'PalletJack_Electric_01', label: 'Transpaleta eléc. 01', mode: 'static', task: 'Descarga en andén R1' },
    { name: 'PalletJack_Electric_02', label: 'Transpaleta eléc. 02', mode: 'static' },
    { name: 'PalletJack_Manual_01', label: 'Transpaleta manual 01', mode: 'static' },
  ],
  // Cajas que recorren la línea de empaque (Blender XY, altura de rodillo 0.8 m)
  conveyor: {
    prefix: 'Box_OnConveyor_', speed: 0.45, height: 0.8,
    path: [[22.4, 3.6], [34.42, 3.6], ...arc(34.42, 4.55, 0.95, -90, 0, 6), [35.37, 6.4]],
  },
  drainPerHour: 0.12,     // batería consumida por hora en movimiento
  chargePerHour: 0.45,    // batería recuperada por hora en cargador
};

function arc(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 1; i < n; i++) {
    const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * (i / n));
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// ---------------------------------------------------------------------
//  Polilínea con parámetro de distancia
// ---------------------------------------------------------------------
export class Path {
  constructor(pointsB, cyclic = false) {
    this.pts = pointsB.map(p => b2t(p[0], p[1], 0));
    if (cyclic) this.pts.push(this.pts[0].clone());
    this.cyclic = cyclic;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  sample(s, outPos, outDir) {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    const seg = this.cum[i + 1] - this.cum[i] || 1;
    outPos.lerpVectors(this.pts[i], this.pts[i + 1], (s - this.cum[i]) / seg);
    if (outDir) outDir.subVectors(this.pts[i + 1], this.pts[i]).normalize();
    return outPos;
  }
  nearest(p) {
    let best = 0, bestD = Infinity;
    const ab = new THREE.Vector3(), ap = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      ab.subVectors(b, a); ap.subVectors(p, a); ap.y = 0; ab.y = 0;
      const t = THREE.MathUtils.clamp(ap.dot(ab) / (ab.lengthSq() || 1), 0, 1);
      q.copy(a).addScaledVector(ab, t);
      const d = q.distanceToSquared(new THREE.Vector3(p.x, 0, p.z));
      if (d < bestD) { bestD = d; best = this.cum[i] + t * (this.cum[i + 1] - this.cum[i]); }
    }
    return best;
  }
}

const yawOf = (d) => Math.atan2(-d.x, -d.z);
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

// ---------------------------------------------------------------------
//  Agente móvil o estacionario
// ---------------------------------------------------------------------
class Agent {
  constructor(sim, cfg, find) {
    this.sim = sim; this.cfg = cfg; this.name = cfg.name; this.label = cfg.label || cfg.name;
    this.obj = find(cfg.name);
    const ud = this.obj.userData || {};
    this.type = ud.wh_type || 'equipo';
    this.mode = cfg.mode || 'pingpong';
    this.task = cfg.task || '';
    this.battery = typeof ud.wh_battery === 'number' ? ud.wh_battery : 0.7 + Math.random() * 0.25;
    this.state = this.mode === 'charge' ? 'charging' : (ud.wh_state || 'idle');
    if (this.mode === 'static' && this.state === 'moving') this.state = 'idle';
    this.speed = cfg.speed || 1;
    this.velocity = 0;
    this.yawOffset = cfg.yawOffset || 0;
    this.load = cfg.load ? find(cfg.load) : null;
    this.carriage = find(cfg.name + '_Carriage');
    this.inner = find(cfg.name + '_Mast_Inner');
    this.baseCar = this.carriage ? (cfg.carriageBase ?? this.carriage.position.y) : 0;
    this.baseInner = this.inner ? this.inner.position.y : 0;
    if (this.carriage) this.carriage.position.y = this.baseCar;
    this.wheels = [];
    this.obj.traverse(o => { if (o !== this.obj && /_Wheel_(FL|FR|RL|RR)$/.test(o.name)) this.wheels.push(o); });
    this.action = null;
    this.blockedFor = 0; this.ignoreBlockFor = 0;
    this.pos = new THREE.Vector3(); this.dirv = new THREE.Vector3(); this.fwd = new THREE.Vector3(0, 0, -1);
    this.yaw = this.obj.rotation.y;
    if (cfg.route && this.mode !== 'charge' && this.mode !== 'static') {
      const r = typeof cfg.route === 'string' ? sim.layout.routes[cfg.route] : null;
      this.path = r ? new Path(r.points, r.cyclic) : new Path(cfg.route, this.mode === 'loop');
      this.s = cfg.startAt === 'end' ? this.path.length : this.path.nearest(this.obj.position);
      this.dir = 1;
      this.place(1);
      this.state = 'moving';
    }
  }
  get moving() { return !!this.path && !this.action && this.velocity > 0.01; }

  /** Coloca el equipo sobre la ruta. k = suavizado del giro (1 = inmediato). */
  place(k = 0.2) {
    this.path.sample(this.s, this.pos, this.dirv);
    if (this.dir < 0) this.dirv.negate();
    this.obj.position.x = this.pos.x; this.obj.position.z = this.pos.z;
    const target = yawOf(this.dirv) + this.yawOffset;
    this.yaw = k >= 1 ? target : lerpAngle(this.yaw, target, k);
    this.obj.rotation.set(0, this.yaw, 0);
    this.fwd.copy(this.dirv);
  }

  startAction(kind) {
    if (!kind) { this.dir *= -1; return; }
    this.action = { kind, t: 0, dur: kind === 'lift' && !(this.cfg.liftMax > 0) ? 2.5 : 4.0, fired: false };
    this.state = kind === 'pick' ? 'picking_up' : kind === 'drop' ? 'dropping' : (this.cfg.liftMax > 0 ? 'lifting' : 'working');
    this.velocity = 0;
  }

  step(dt) {
    // --- Estacionarios ---
    if (this.mode === 'charge') {
      if (this.battery < 1) { this.battery = Math.min(1, this.battery + dt * SIM_CONFIG.chargePerHour / 3600); this.state = 'charging'; }
      else this.state = 'available';
      return;
    }
    if (!this.path) return;
    // --- Acción en extremo de ruta ---
    if (this.action) {
      const a = this.action; a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      const h = (this.cfg.liftMax || 0) * Math.sin(Math.PI * k);
      if (this.carriage) this.carriage.position.y = this.baseCar + h;
      if (this.inner) this.inner.position.y = this.baseInner + h * 0.5;
      if (!a.fired && k >= 0.5) {
        a.fired = true;
        const atEnd = this.s >= this.path.length - 1e-3;
        if (a.kind === 'drop' && this.load) this.load.visible = false;
        if (a.kind === 'pick' && this.load) this.load.visible = true;
        this.sim.event(atEnd ? this.cfg.onEnd : this.cfg.onStart, this);
      }
      if (k >= 1) { this.action = null; this.dir *= -1; this.state = 'moving'; }
      return;
    }
    // --- Evitar choques: se detiene si hay otro equipo adelante ---
    const blocked = this.ignoreBlockFor <= 0 && this.sim.isBlocked(this);
    if (this.ignoreBlockFor > 0) this.ignoreBlockFor -= dt;
    if (blocked) {
      this.blockedFor += dt; this.velocity = 0; this.state = 'waiting';
      if (this.blockedFor > 5) { this.ignoreBlockFor = 2.5; this.blockedFor = 0; }   // rompe bloqueos mutuos
      return;
    }
    this.blockedFor = 0; this.state = 'moving';
    // aceleración suave
    this.velocity = Math.min(this.speed, this.velocity + dt * this.speed * 0.8);
    const ds = this.velocity * dt;
    this.s += ds * this.dir;
    this.battery = Math.max(0.05, this.battery - dt * SIM_CONFIG.drainPerHour / 3600);
    for (const w of this.wheels) w.rotation.x -= ds / 0.3;
    if (this.mode === 'loop') {
      if (this.s > this.path.length) { this.s -= this.path.length; this.sim.event(this.cfg.onEnd, this); }
    } else if (this.s >= this.path.length) {
      this.s = this.path.length; this.place(0.3); this.startAction(this.cfg.atEnd); return;
    } else if (this.s <= 0) {
      this.s = 0; this.place(0.3); this.startAction(this.cfg.atStart); return;
    }
    this.place(0.18);
  }
}

// ---------------------------------------------------------------------
//  Línea de conveyor (cajas en movimiento continuo)
// ---------------------------------------------------------------------
class ConveyorFlow {
  constructor(sim, cfg, root) {
    this.sim = sim; this.cfg = cfg;
    this.path = new Path(cfg.path);
    this.items = [];
    root.traverse(o => { if (o.name.startsWith(cfg.prefix) && o.userData.wh_type === 'box') this.items.push({ obj: o, s: 0, rot: (Math.random() - 0.5) * 0.2 }); });
    this.items.forEach(it => { it.s = this.path.nearest(it.obj.position); });
    this.p = new THREE.Vector3(); this.d = new THREE.Vector3();
  }
  step(dt) {
    for (const it of this.items) {
      it.s += this.cfg.speed * dt;
      if (it.s > this.path.length) { it.s -= this.path.length; this.sim.event('packed'); }
      this.path.sample(it.s, this.p, this.d);
      it.obj.position.set(this.p.x, this.cfg.height, this.p.z);
      it.obj.rotation.set(0, yawOf(this.d) + it.rot, 0);
    }
  }
}

// ---------------------------------------------------------------------
//  Simulación
// ---------------------------------------------------------------------
export class Simulation {
  /**
   * @param layout  contenido de warehouse_layout.json
   * @param find    (nombre) => Object3D | null
   * @param root    escena del modelo
   */
  constructor(layout, find, root) {
    this.layout = layout;
    this.time = SIM_CONFIG.startHour * 3600;
    this.speed = 1;
    this.running = true;
    this.rng = mulberry32(7);
    // >>> API: valores iniciales del turno
    this.stats = { received: 38, putaway: 27, retrieve: 22, shipped: 19, picked: 214, packed: 176, replenish: 8 };
    this.slots = layout.slots.map((s, i) => ({ ...s, index: i, aisle: s.parent && /^Rack_[A-E][12]$/.test(s.parent) ? s.parent[5] : null }));
    this.onSlotChange = null;
    this.temp = 4.3; this.tempHist = []; this._tempAcc = 0; this._histAcc = 0;
    this.docks = {
      R1: { state: 'unloading', progress: 0.45 }, R2: { state: 'free', progress: 0 }, R3: { state: 'scheduled', progress: 0 },
      D1: { state: 'scheduled', progress: 0 }, D2: { state: 'loading', progress: 0.35 }, D3: { state: 'free', progress: 0 },
    };
    this.log = [];
    this.agents = [];
    for (const c of SIM_CONFIG.agents) {
      if (!find(c.name)) { console.warn('Agente no encontrado en el modelo:', c.name); continue; }
      this.agents.push(new Agent(this, c, find));
    }
    this.conveyor = new ConveyorFlow(this, SIM_CONFIG.conveyor, root);
    for (let i = 0; i < 40; i++) this.tempHist.push(this.temp + (this.rng() - 0.5) * 0.4);
  }

  get dynamicNames() {
    const n = new Set();
    for (const a of this.agents) if (a.path) n.add(a.name);
    for (const it of this.conveyor.items) n.add(it.obj.name);
    return n;
  }

  /** ¿Hay otro equipo dentro del carril, delante de este agente? */
  isBlocked(agent) {
    const big = a => /forklift|reach/.test(a.type);
    const v = new THREE.Vector3(), f = agent.fwd;
    for (const o of this.agents) {
      if (o === agent) continue;
      v.subVectors(o.obj.position, agent.obj.position); v.y = 0;
      const ahead = v.dot(f);                                   // distancia hacia adelante
      const reach = (big(agent) ? 2.6 : 1.4) + (big(o) ? 1.4 : 0.7);
      if (ahead <= 0.3 || ahead > reach) continue;
      const lateral = Math.abs(v.x * f.z - v.z * f.x);          // separación lateral
      if (lateral < (big(agent) || big(o) ? 1.5 : 1.0)) return true;
    }
    return false;
  }

  event(kind, agent) {
    if (!kind) return;
    const s = this.stats;
    if (kind in s) s[kind] += kind === 'picked' ? 1 + Math.floor(this.rng() * 3) : 1;
    const R = this.rng;
    if (kind === 'received') this.advanceDock('R1', 1 / 14);
    if (kind === 'shipped') this.advanceDock('D2', 1 / 12);
    // Ocupación de racks (>>> API: sustituir por eventos reales del WMS)
    if ((kind === 'putaway' || kind === 'retrieve') && agent?.cfg.aisle) {
      const want = kind === 'retrieve' ? 1 : 0;
      const cands = this.slots.filter(x => x.type === 'slot_pallet' && x.aisle === agent.cfg.aisle && x.occupied === want);
      if (cands.length) {
        const sl = cands[Math.floor(R() * cands.length)];
        sl.occupied = 1 - want;
        this.onSlotChange?.(sl);
      }
    }
    const msgs = {
      received: 'recibió un pallet en recepción', putaway: 'ubicó un pallet en el pasillo ' + (agent?.cfg.aisle || ''),
      retrieve: 'tomó un pallet del pasillo ' + (agent?.cfg.aisle || ''), shipped: 'cargó un pallet en el andén D2',
      replenish: 'completó un reabasto', picked: 'completó una línea de surtido',
    };
    if (agent && msgs[kind]) this.pushLog(`${agent.label} ${msgs[kind]}`);
  }

  advanceDock(id, inc) {
    const d = this.docks[id];
    d.progress += inc;
    if (d.progress >= 1) {
      d.progress = 0;
      this.pushLog(id[0] === 'R' ? `Andén ${id}: tráiler descargado, nuevo arribo` : `Andén ${id}: tráiler completo, sale a ruta`);
    }
  }

  pushLog(msg) {
    this.log.unshift({ t: this.clock(), msg });
    if (this.log.length > 30) this.log.pop();
  }

  clock(t = this.time) {
    const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  update(realDt) {
    if (!this.running) return;
    let rest = Math.min(realDt, 0.1) * this.speed;
    while (rest > 1e-6) {
      const dt = Math.min(rest, 0.05);
      rest -= dt;
      this.time += dt;
      for (const a of this.agents) a.step(dt);
      this.conveyor.step(dt);
      this.stepTemperature(dt);
    }
  }

  // >>> API: reemplazar por lectura del sensor del cuarto frío
  stepTemperature(dt) {
    this._tempAcc += dt;
    while (this._tempAcc >= 1) {
      this._tempAcc -= 1;
      this.temp += (4.5 - this.temp) * 0.01 + gauss(this.rng) * 0.03;
      if (this.rng() < 0.0015) { this.temp += 1.1 + this.rng(); this.pushLog('Cuarto frío: apertura de puerta prolongada'); }
      this._histAcc += 1;
      if (this._histAcc >= 15) { this._histAcc = 0; this.tempHist.push(this.temp); if (this.tempHist.length > 80) this.tempHist.shift(); }
    }
  }

  occupancy() {
    const pal = this.slots.filter(s => s.type === 'slot_pallet');
    const byAisle = {};
    for (const s of pal) {
      if (!s.aisle) continue;
      const a = (byAisle[s.aisle] ||= { occ: 0, total: 0 });
      a.total++; a.occ += s.occupied;
    }
    const shelf = this.slots.filter(s => s.type === 'slot_shelf');
    return {
      pallet: { occ: pal.reduce((n, s) => n + s.occupied, 0), total: pal.length },
      shelf: { occ: shelf.reduce((n, s) => n + s.occupied, 0), total: shelf.length },
      byAisle,
    };
  }

  alerts() {
    const out = [];
    for (const a of this.agents) if (a.battery < 0.25 && a.mode !== 'charge') out.push({ level: 'warn', msg: `${a.label}: batería baja (${Math.round(a.battery * 100)}%)` });
    if (this.temp > 8 || this.temp < 2) out.push({ level: 'crit', msg: `Cuarto frío fuera de rango: ${this.temp.toFixed(1)} °C` });
    else if (this.temp > 6.5) out.push({ level: 'warn', msg: `Cuarto frío en ${this.temp.toFixed(1)} °C (vigilar)` });
    for (const a of this.agents) if (a.state === 'waiting' && a.blockedFor > 3) out.push({ level: 'info', msg: `${a.label} esperando paso` });
    return out;
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

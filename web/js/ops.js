// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  ops.js · Operación logística del CEDIS (datos simulados)
//  Entradas (arribos de proveedor), inventario, salidas por ruta a las
//  60 unidades IMSS/ISSSTE de Hidalgo y solicitudes de emergencia.
//
//  Todo se calcula sobre el reloj de la simulación (sim.time, segundos).
//  Para conectar datos reales, reemplaza los métodos marcados  >>> API.
// =====================================================================

const DAY = 86400, H = 3600, MIN = 60;
const BASE_DATE = Date.UTC(2026, 9, 26);            // lunes 26 de octubre de 2026 = día 0
const WD_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WD_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Metas (ver documento de investigación)
export const TARGETS = {
  otifProv: 90, caducidad: 100, rechazos: 2, discrepancia: 1, frioEntrada: 100, dockToStock: 24, cuarentena: 48, controladosIn: 100,
  exactitud: 100, minMax: 90, mermaCad: 1.5, mermaTotal: 2, proxCaducar: 5, tempRango: 100, controladosDif: 0,
  fillRate: 90, aTiempo: 95, otifUnidad: 90, ciclo: 48, emergencias: 95, frioSalida: 100, desabasto: 5, recetas: 97,
};

// Proveedores genéricos (sin nombres comerciales)
const SUPPLIERS = ['CENADI-Birmex', 'Distribuidor nacional A', 'Distribuidor nacional B', 'Laboratorio nacional C',
  'Distribuidor regional D', 'Laboratorio de biológicos E', 'Distribuidor especializado F', 'Transferencia almacén delegacional'];

// Claves de ejemplo para solicitudes urgentes, por nivel
const URGENT_ITEMS = {
  1: [['Naloxona 0.4 mg/ml, ampolleta', 10], ['Epinefrina 1 mg/ml, ampolleta', 20], ['Oxitocina 5 UI, ampolleta', 30],
      ['Sulfato de magnesio 10 %, ampolleta', 24], ['Antiveneno alacrán, frasco', 6]],
  2: [['Insulina glargina 100 UI/ml', 40], ['Ceftriaxona 1 g, frasco ámpula', 60], ['Enoxaparina 40 mg, jeringa', 50],
      ['Salbutamol aerosol 100 µg', 80], ['Omeprazol 40 mg, frasco ámpula', 40], ['Vacuna Td, frasco', 20]],
  3: [['Metformina 850 mg, caja', 200], ['Losartán 50 mg, caja', 150], ['Paracetamol 500 mg, caja', 300],
      ['Amoxicilina 500 mg, caja', 120], ['Captopril 25 mg, caja', 100], ['Glibenclamida 5 mg, caja', 120]],
};
const COLD_ITEMS = /Insulina|Vacuna|Oxitocina|Antiveneno|Enoxaparina/;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (a, b) => (b ? (100 * a) / b : 100);
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / H)).padStart(2, '0')}:${String(Math.floor((s % H) / MIN)).padStart(2, '0')}`; };
const parseHHMM = s => { const [h, m] = s.split(':').map(Number); return h * H + m * MIN; };

export class Ops {
  /**
   * @param data  contenido de assets/unidades_hidalgo.json
   * @param sim   Simulation (reloj y eventos del almacén 3D)
   */
  constructor(data, sim) {
    this.data = data; this.sim = sim;
    this.units = data.units; this.routes = data.routes;
    this.byClues = new Map(this.units.map(u => [u.clues, u]));
    this.emergencies = [];
    this.urgSeq = 37;
    this.onEmergency = null;
    this.dayIdx = -1;
    // >>> API: acumulados del mes (base para que los KPIs no arranquen vacíos)
    this.mtd = {
      arrivals: 248, provOnTime: 226, provComplete: 236, provOtif: 219, cadOk: 245, rejLines: 96, lines: 5410, docDiff: 3, coldLots: 61, coldOk: 61,
      dockHours: 248 * 11.2, quarantineHours: 248 * 19.5, ctrlIn: 22, ctrlInOk: 22,
      deliveries: 912, delOnTime: 871, delComplete: 836, delOtif: 801, fillSum: 912 * 0.957, cycleHours: 912 * 31,
      coldDel: 205, coldDelOk: 205, urgClosed: 71, urgOnTime: 68,
    };
    this.update();
    // Solicitudes urgentes: vienen de las unidades (cedis-link.js). La generación aleatoria
    // solo se usa si no hay enlace con las unidades (autoRandom = true).
    this.autoRandom = false;
    this._nextUrg = this.sim.time + 20 * MIN;
  }

  // ---------------- Calendario ----------------
  get now() { return this.sim.time; }
  dayOf(t) { return Math.floor(t / DAY); }
  weekday(idx) { return new Date(BASE_DATE + idx * DAY * 1000).getUTCDay(); }       // 0 = domingo
  isoWeek(idx) {
    const d = new Date(BASE_DATE + idx * DAY * 1000);
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  }
  dateLabel(idx = this.dayOf(this.now), long = false) {
    const d = new Date(BASE_DATE + idx * DAY * 1000);
    return long ? `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}` : `${WD_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  }
  clockLabel() { return `${this.dateLabel()} · ${hhmm(this.now)}`; }

  /** ¿La unidad recibe entrega ordinaria el día idx? */
  visits(u, idx) {
    const wd = this.weekday(idx), r = this.routes[u.ruta];
    if (wd === 0 || wd === 6) return false;
    if (r.hospDays.includes(wd)) return u.hosp;
    if (!r.days.includes(wd)) return false;
    if (u.frecuencia === 'Cada 14 días') return this.isoWeek(idx) % 2 === 0;
    return true;
  }
  nextVisit(u, fromIdx) {
    for (let i = fromIdx; i < fromIdx + 21; i++) if (this.visits(u, i)) return i;
    return null;
  }

  // ---------------- Día operativo ----------------
  buildDay(idx) {
    const R = mulberry32(1000 + idx);
    const day = { idx, trips: [], arrivals: [] };
    const base = idx * DAY;
    // Rutas de salida
    for (const [id, r] of Object.entries(this.routes)) {
      const stops = this.units.filter(u => u.ruta === id && this.visits(u, idx)).sort((a, b) => a.min - b.min);
      if (!stops.length) continue;
      const depart = base + parseHHMM(r.depart);
      let t = depart, prev = 0, lateAcc = 0;
      const trip = { id, route: r, depart, stops: [] };
      for (const u of stops) {
        t += (prev === 0 ? u.min : Math.abs(u.min - prev) + 8) * MIN;
        const x = R();
        lateAcc += x < 0.8 ? R() * 6 * MIN : x < 0.95 ? (10 + R() * 25) * MIN : (40 + R() * 60) * MIN;
        const eta = t, actual = t + lateAcc;
        const fill = R() < 0.9 ? 0.93 + R() * 0.07 : 0.8 + R() * 0.12;
        trip.stops.push({ unit: u, eta, actual, fill, coldOk: R() > 0.01, hasCold: R() < 0.35 });
        t += 20 * MIN; prev = u.min;
      }
      trip.end = trip.stops.at(-1).actual + 20 * MIN + trip.stops.at(-1).unit.min * MIN;
      day.trips.push(trip);
    }
    // Arribos de proveedores
    const wd = this.weekday(idx);
    const n = wd === 0 ? 0 : wd === 6 ? 4 : 11 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const eta = base + (7 * H) + Math.floor(R() * 10 * H / (15 * MIN)) * 15 * MIN;
      const lines = 6 + Math.floor(R() * 35);
      const cold = R() < 0.25, ctrl = !cold && R() < 0.08;
      const late = R() > 0.92 ? (30 + R() * 150) * MIN : 0;
      day.arrivals.push({
        folio: `REM-${String(idx + 26).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`,
        supplier: cold && R() < 0.5 ? SUPPLIERS[5] : SUPPLIERS[Math.floor(R() * SUPPLIERS.length)],
        eta, arrive: eta + late, onTime: late === 0, complete: R() < 0.95, lines, pieces: lines * (80 + Math.floor(R() * 320)),
        cold, ctrl, cadOk: R() < 0.985, docOk: R() < 0.985, coldOk: !cold || R() < 0.98,
        rej: R() < 0.15 ? 1 + Math.floor(R() * 3) : 0, dock: 'R' + (1 + Math.floor(R() * 3)),
        dockToStock: (cold ? 1 + R() * 1.5 : 4 + R() * 18) * H, quarantine: (cold ? 2 + R() * 4 : 8 + R() * 30) * H,
      });
    }
    day.arrivals.sort((a, b) => a.eta - b.eta);
    this.day = day;
  }

  arrivalState(a) {
    const t = this.now;
    if (t < a.arrive) return t > a.eta ? 'late' : 'scheduled';
    if (t < a.arrive + 40 * MIN) return 'dock';
    if (t < a.arrive + a.dockToStock) return 'inspection';
    return a.rej ? 'partial' : 'released';
  }
  stopState(s) {
    const t = this.now;
    if (t >= s.actual + 20 * MIN) return 'delivered';
    if (t >= s.actual) return 'unloading';
    return 'pending';
  }
  tripState(tr) {
    const t = this.now;
    if (t < tr.depart) return 'scheduled';
    if (t >= tr.end) return 'done';
    if (tr.stops.every(s => this.stopState(s) === 'delivered')) return 'returning';
    return 'enroute';
  }

  // ---------------- Emergencias ----------------
  createEmergency(level, unit, t0 = this.now) {
    const R = Math.random;
    level = level || (R() < 0.12 ? 1 : R() < 0.6 ? 2 : 3);
    unit = unit || this.units[Math.floor(R() * this.units.length)];
    const pool = URGENT_ITEMS[level];
    const [item, qty] = pool[Math.floor(R() * pool.length)];
    const transfer = R() < 0.12;
    let dispatch;
    if (level === 3) {
      // salida consolidada: 15:00 si se pidió antes de las 14:00; si no, la salida de su ruta al día siguiente (o 06:00)
      const d0 = this.dayOf(t0), tod = t0 - d0 * DAY;
      dispatch = tod < 14 * H ? d0 * DAY + 15 * H : (d0 + 1) * DAY + Math.min(parseHHMM(this.routes[unit.ruta].depart), 6 * H);
    } else dispatch = t0 + (15 + (level === 1 ? 25 : 45) + R() * 15 + (transfer ? 45 : 0)) * MIN;
    const travel = unit.min * MIN * (0.95 + R() * 0.25);
    const deliver = dispatch + travel;
    const deadline = t0 + (level === 1 ? unit.min * MIN + 75 * MIN : level === 2 ? unit.urgencia_h * H : 24 * H);
    const e = { id: `URG-${String(++this.urgSeq).padStart(4, '0')}`, level, unit, item, qty: Math.max(1, Math.round(qty * (0.5 + R()))),
      cold: COLD_ITEMS.test(item), transfer, t0, validated: t0 + 15 * MIN, dispatch, deliver, deadline, closed: false };
    this.emergencies.unshift(e);
    if (this.emergencies.length > 40) this.emergencies.pop();
    this.onEmergency?.(e);
    return e;
  }
  emergencyState(e) {
    const t = this.now;
    if (t < e.validated) return 'validating';
    if (t < e.dispatch) return e.transfer ? 'transfer' : 'preparing';
    if (t < e.deliver) return 'enroute';
    return 'delivered';
  }

  // ---------------- Actualización (llamar ~4 veces por segundo) ----------------
  update() {
    const idx = this.dayOf(this.now);
    if (idx !== this.dayIdx) { if (this.day) this.closeDay(); this.dayIdx = idx; this.buildDay(idx); }
    // Generación de solicitudes urgentes entre 07:00 y 22:00 (>>> API)
    const tod = this.now % DAY;
    if (this.autoRandom && this.now >= this._nextUrg) {
      if (tod > 7 * H && tod < 22 * H) this.createEmergency();
      this._nextUrg = this.now + (50 + Math.random() * 80) * MIN;
    }
    for (const e of this.emergencies) {
      if (!e.closed && this.emergencyState(e) === 'delivered') {
        e.closed = true; e.onTime = e.deliver <= e.deadline;
        this.mtd.urgClosed++; if (e.onTime) this.mtd.urgOnTime++;
        this.sim.pushLog?.(`${e.id} entregada en ${e.unit.nombre}${e.onTime ? '' : ' (fuera de tiempo)'}`);
      }
    }
  }
  closeDay() {
    const m = this.mtd;
    for (const a of this.day.arrivals) {
      m.arrivals++; m.provOnTime += a.onTime; m.provComplete += a.complete; m.provOtif += a.onTime && a.complete; m.cadOk += a.cadOk; m.rejLines += a.rej; m.lines += a.lines;
      m.docDiff += !a.docOk; if (a.cold) { m.coldLots++; m.coldOk += a.coldOk; } m.dockHours += a.dockToStock / H; m.quarantineHours += a.quarantine / H;
      if (a.ctrl) { m.ctrlIn++; m.ctrlInOk++; }
    }
    for (const tr of this.day.trips) for (const s of tr.stops) {
      const onTime = s.actual - s.eta <= 60 * MIN, full = s.fill >= 0.98;
      m.deliveries++; m.delOnTime += onTime; m.delComplete += full; m.delOtif += onTime && full; m.fillSum += s.fill;
      m.cycleHours += 20 + Math.random() * 20; if (s.hasCold) { m.coldDel++; m.coldDelOk += s.coldOk; }
    }
  }

  // ---------------- KPIs ----------------
  kpis() {
    const m = this.mtd, d = this.day;
    // Entradas: mes + arribos de hoy ya inspeccionados
    const done = d.arrivals.filter(a => ['inspection', 'released', 'partial'].includes(this.arrivalState(a)));
    const A = k => done.reduce((n, a) => n + (typeof k === 'function' ? k(a) : a[k]), 0);
    const nA = m.arrivals + done.length;
    const coldA = done.filter(a => a.cold);
    const entradas = {
      otifProv: pct(m.provOtif + A(a => a.onTime && a.complete), nA),
      caducidad: pct(m.cadOk + A('cadOk'), nA),
      rechazos: pct(m.rejLines + A('rej'), m.lines + A('lines')),
      discrepancia: pct(m.docDiff + A(a => !a.docOk), nA),
      frioEntrada: pct(m.coldOk + coldA.filter(a => a.coldOk).length, m.coldLots + coldA.length),
      dockToStock: (m.dockHours + A(a => a.dockToStock / H)) / nA,
      cuarentena: (m.quarantineHours + A(a => a.quarantine / H)) / nA,
      controladosIn: 100,
      hoy: { total: d.arrivals.length, recibidos: d.arrivals.filter(a => this.now >= a.arrive).length, pallets: this.sim.stats.received },
    };
    // Inventario (>>> API: existencias y conteos reales)
    const hist = this.sim.tempHist;
    const inRange = hist.filter(v => v >= 2 && v <= 8).length;
    const wob = Math.sin(this.now / 5400) * 0.15;
    const inventario = {
      exactitud: 99.6 + wob * 0.6, minMax: 92.4 + wob * 4, cobertura: 38 + wob * 10, mermaCad: 0.62 + wob * 0.2,
      mermaTotal: 0.94 + wob * 0.25, proxCaducar: 3.4 + wob * 2, tempRango: pct(inRange, hist.length), controladosDif: 0,
    };
    // Salidas: mes + entregas de hoy ya realizadas
    const del = d.trips.flatMap(tr => tr.stops).filter(s => this.stopState(s) === 'delivered');
    const S = f => del.reduce((n, s) => n + f(s), 0);
    const nD = m.deliveries + del.length;
    const urgOpen = this.emergencies.filter(e => !e.closed);
    const salidas = {
      fillRate: (100 * (m.fillSum + S(s => s.fill))) / nD,
      aTiempo: pct(m.delOnTime + S(s => s.actual - s.eta <= 60 * MIN), nD),
      otifUnidad: pct(m.delOtif + S(s => (s.actual - s.eta <= 60 * MIN) && s.fill >= 0.98), nD),
      ciclo: (m.cycleHours + del.length * 30) / nD,
      emergencias: pct(m.urgOnTime, m.urgClosed),   // incluye las cerradas hoy
      frioSalida: pct(m.coldDelOk + S(s => s.hasCold && s.coldOk), m.coldDel + S(s => s.hasCold)),
      desabasto: 2.6 - wob * 2, recetas: 97.4 + wob * 1.2,
      hoy: { entregas: del.length, programadas: d.trips.reduce((n, tr) => n + tr.stops.length, 0), pallets: this.sim.stats.shipped, urgAbiertas: urgOpen.length },
    };
    return { entradas, inventario, salidas };
  }

  alerts() {
    const out = [];
    for (const e of this.emergencies) {
      if (e.closed) continue;
      const left = e.deadline - this.now;
      if (e.level === 1) out.push({ level: 'crit', msg: `${e.id} vital · ${e.unit.nombre}: ${e.item}` });
      else if (left < 0) out.push({ level: 'warn', msg: `${e.id} fuera de tiempo · ${e.unit.nombre}` });
    }
    for (const tr of this.day.trips) {
      if (this.tripState(tr) !== 'enroute') continue;
      const next = tr.stops.find(s => this.stopState(s) !== 'delivered');
      if (next && next.actual - next.eta > 60 * MIN && this.now > next.eta) out.push({ level: 'warn', msg: `Ruta ${tr.id} con retraso de ${Math.round((next.actual - next.eta) / MIN)} min` });
    }
    return out;
  }

  /** Estado de hoy de una unidad: entregada / en camino / programada / próxima visita */
  unitStatus(u) {
    const al = this.link?.status.get(u);
    if (al?.open) return { tone: 'crit', text: `⚠ ${al.open} ${al.open > 1 ? 'claves agotadas' : 'clave agotada'}` };
    for (const tr of this.day.trips) {
      const s = tr.stops.find(x => x.unit === u);
      if (!s) continue;
      const st = this.stopState(s);
      if (st === 'delivered') return { tone: 'ok', text: `Entregada ${hhmm(s.actual + 20 * MIN)}`, stop: s, trip: tr };
      if (st === 'unloading') return { tone: 'accent', text: 'Descargando', stop: s, trip: tr };
      if (this.now >= tr.depart) return { tone: 'info', text: `En camino · ${hhmm(s.actual)}`, stop: s, trip: tr };
      return { tone: 'muted', text: `Hoy ${hhmm(s.eta)}`, stop: s, trip: tr };
    }
    const nv = this.nextVisit(u, this.dayIdx + 1);
    return { tone: 'muted', text: nv === null ? 'Sin visita' : `Próxima: ${this.dateLabel(nv)}` };
  }
}

export { hhmm };

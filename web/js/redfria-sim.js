// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  redfria-sim.js · Red fría del CENADI a la unidad (30 días, paso de 5 min)
//
//  · 1,066 equipos: cámara del CENADI, 32 almacenes estatales y el
//    refrigerador de cada una de las 1,033 unidades ISSSTE (CLUES ago 2026).
//  · Cada equipo: temperatura que se va hacia la del cuarto con constante τ,
//    compresor con termostato, aperturas de puerta, apagones (con o sin planta
//    de emergencia) y fallas de compresor. Los refrigeradores domésticos
//    tienen zonas frías y algunos el termostato desviado (congelan de noche).
//  · Viajes: tráiler refrigerado CENADI → estado y caja térmica estado →
//    unidad, con su vida fría y refrigerantes acondicionados o no.
//  · Monitoreo: manual (8:00 y 16:00), registrador de 30 días (alarma +8 °C
//    10 h, −0.5 °C 60 min) o telemetría (aviso a los 30/15 min).
//  · Productos con su punto débil: congelación (destruye) o calor acumulado
//    contra un presupuesto en horas equivalentes a 25 °C (Q10 = 2).
//  · Determinista (mulberry32 con semilla): mismo mes cada vez.
// =====================================================================

export const DAYS = 30, H = DAYS * 24, DT = 5 / 60, STEPS = H / DT;
const T0U = Date.UTC(2026, 9, 26);                 // lunes 26 oct 2026
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// ---------------------------------------------------------------- productos (supuestos del modelo)
//  frz: se pierde si se congela · bud: presupuesto de calor en h equivalentes a 25 °C · mxn: costo de referencia
//  st: existencia por unidad según nivel [1er, 2º, 3er] (piezas o dosis)
export const PRODUCTS = [
  { id: 'nph', n: 'Insulina NPH', cnis: '010.000.1050.00', frz: true, bud: 672, mxn: 95, st: [30, 90, 200], k: 'ins' },
  { id: 'rap', n: 'Insulina rápida', cnis: '010.000.1051.00', frz: true, bud: 672, mxn: 95, st: [15, 60, 150], k: 'ins' },
  { id: 'gla', n: 'Insulina glargina', cnis: '010.000.4158.00', frz: true, bud: 672, mxn: 420, st: [10, 40, 100], k: 'ins' },
  { id: 'oxi', n: 'Oxitocina 5 UI', cnis: '010.000.1542.00', frz: false, bud: 240, mxn: 9, st: [0, 200, 400], k: 'obs' },
  { id: 'flu', n: 'Vacuna influenza', frz: true, bud: 168, mxn: 110, st: [300, 500, 600], k: 'vac' },
  { id: 'hepb', n: 'Hepatitis B', frz: true, bud: 336, mxn: 55, st: [60, 100, 120], k: 'vac' },
  { id: 'hexa', n: 'Hexavalente', frz: true, bud: 336, mxn: 420, st: [80, 120, 100], k: 'vac' },
  { id: 'td', n: 'Td (tétanos y difteria)', frz: true, bud: 336, mxn: 22, st: [80, 120, 150], k: 'vac' },
  { id: 'neu', n: 'Neumocócica conjugada', frz: true, bud: 240, mxn: 650, st: [40, 60, 60], k: 'vac' },
  { id: 'srp', n: 'Triple viral (SRP)', frz: false, bud: 72, mxn: 110, st: [40, 60, 60], k: 'vac' },
  { id: 'ada', n: 'Adalimumab', frz: true, bud: 336, mxn: 2900, st: [0, 10, 40], k: 'bio' },
  { id: 'epo', n: 'Eritropoyetina', frz: true, bud: 96, mxn: 260, st: [0, 30, 80], k: 'bio' },
];
const NP = PRODUCTS.length;

// ---------------------------------------------------------------- clima aproximado (capital de cada estado, °C)
//  [máx, mín] de fines de octubre a noviembre y de mayo. Aproximado, para sustituir por normales del SMN.
const CLIMA = {
  '01': [[25, 9], [31, 13]], '02': [[28, 12], [35, 17]], '03': [[31, 19], [32, 17]], '04': [[31, 21], [36, 23]],
  '05': [[23, 9], [31, 15]], '06': [[31, 20], [32, 20]], '07': [[30, 18], [33, 20]], '08': [[24, 8], [31, 14]],
  '09': [[23, 10], [27, 13]], '10': [[24, 7], [30, 12]], '11': [[25, 10], [31, 14]], '12': [[30, 19], [33, 21]],
  '13': [[20, 7], [25, 10]], '14': [[27, 12], [32, 15]], '15': [[20, 4], [24, 7]], '16': [[24, 9], [29, 12]],
  '17': [[27, 14], [32, 17]], '18': [[29, 15], [32, 17]], '19': [[27, 15], [33, 20]], '20': [[28, 13], [32, 16]],
  '21': [[23, 9], [28, 12]], '22': [[25, 10], [30, 13]], '23': [[30, 21], [34, 23]], '24': [[24, 10], [30, 14]],
  '25': [[33, 19], [35, 20]], '26': [[31, 15], [36, 18]], '27': [[31, 21], [36, 23]], '28': [[29, 17], [35, 22]],
  '29': [[21, 5], [26, 9]], '30': [[28, 18], [33, 22]], '31': [[31, 19], [37, 22]], '32': [[22, 6], [28, 11]],
};
const GOLFO_SURESTE = ['30', '27', '04', '31', '23', '07', '28', '20'];
const NORTE = ['02', '26', '25', '19', '05', '08', '03'];

export const CONTEXTS = {
  otono: { nombre: 'Otoño normal', desc: 'Fines de octubre y noviembre: temporada de vacunación contra influenza, clima templado y apagones ocasionales.' },
  calor: { nombre: 'Ola de calor', desc: 'Temperaturas de mayo + 4 °C. Más apagones por la demanda de la red eléctrica, sobre todo en el norte, y más fallas de unidades de frío en carretera.' },
  huracan: { nombre: 'Huracanes y apagones', desc: 'Un huracán deja sin energía de 1 a 3 días a unidades del Golfo y el Sureste entre los días 9 y 13; el resto del país, normal.' },
};
export const LEVERS = {
  mon: { n: 'Monitoreo', o: { manual: 'Manual 2 veces al día', reg: 'Registrador 30 días', tele: 'Telemetría con aviso' } },
  ref: { n: 'Refrigerador del 1er nivel', o: { actual: 'Como está (70 % doméstico)', med: 'Grado médico', ilr: 'Con forro de hielo' } },
  pla: { n: 'Planta de emergencia', o: { n23: 'Solo 2º y 3er nivel', todas: 'Todas las unidades' } },
  pack: { n: 'Refrigerantes', o: { directo: 'Directo del congelador', acond: 'Acondicionados' } },
};
export const BASE = { ctx: 'otono', mon: 'manual', ref: 'actual', pla: 'n23', pack: 'directo' };

// costos de inversión (supuestos, MXN): por equipo o por unidad
export const COSTS = { reg: 3500, tele: 9000, teleMes: 200, med: 55000, ilr: 80000, planta: 35000, acond: 8000 };

// ---------------------------------------------------------------- equipos
//  tau: h hacia el cuarto sin energía · cap: °C/h que quita el compresor · door: °C por apertura · hyst: ± del termostato
const EQ = {
  camara: { n: 'Cámara fría', tau: 30, cap: 4, door: 0.3, hyst: 1.0, doors: 18 },
  med: { n: 'Refrigerador grado médico', tau: 6, cap: 8, door: 0.6, hyst: 1.0, doors: 12 },
  dom: { n: 'Refrigerador doméstico', tau: 3, cap: 9, door: 1.0, hyst: 1.5, doors: 14 },
  ilr: { n: 'Refrigerador con forro de hielo', tau: 22, cap: 3, door: 0.4, hyst: 0.8, doors: 12 },
};

// ---------------------------------------------------------------- clima horario por estado
function climate(cves, ctx, seed) {
  const out = {};
  for (const cve of cves) {
    const r = mulberry32(seed ^ hash('clima' + cve));
    const [mx0, mn0] = CLIMA[cve][ctx === 'calor' ? 1 : 0];
    const mx = mx0 + (ctx === 'calor' ? 4 : 0), mn = mn0 + (ctx === 'calor' ? 3 : 0);
    const dayAdj = Array.from({ length: DAYS + 1 }, () => (r() - 0.5) * 3);
    const a = new Float32Array(H + 1);
    for (let h = 0; h <= H; h++) {
      const d = Math.min(DAYS, Math.floor(h / 24)), hh = h % 24;
      a[h] = mn + (mx - mn) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (hh - 5) / 24)) + dayAdj[d];
    }
    out[cve] = a;
  }
  return out;
}
const at = (arr, t) => { const i = Math.min(H - 1, Math.max(0, Math.floor(t))); const f = t - i; return arr[i] * (1 - f) + arr[i + 1] * f; };
const isWork = (t, sat) => { const d = Math.floor(t / 24) % 7, h = t % 24; return (d < 5 || (sat && d === 5)) && h >= 8 && h < 16; };

// apagones: lista de [inicio, fin] en horas
function outages(node, ctx, r) {
  const list = [];
  const sureste = GOLFO_SURESTE.includes(node.cve), norte = NORTE.includes(node.cve);
  let rate = node.kind === 'unidad' ? 1.2 : 0.6;                  // cortes por mes
  if (ctx === 'calor') rate *= norte ? 3 : 1.8;
  const n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const s = r() * (H - 10), dur = 0.5 + Math.pow(r(), 2) * (ctx === 'calor' ? 9 : 6);
    list.push([s, s + dur]);
  }
  if (ctx === 'huracan' && sureste && r() < (node.kind === 'unidad' ? 0.55 : 0.8)) {
    const s = 9 * 24 + r() * 72, dur = 18 + r() * 54;
    list.push([s, s + dur]);
  }
  return list.sort((a, b) => a[0] - b[0]);
}

// ---------------------------------------------------------------- simulación de un equipo
//  Devuelve serie horaria (mín, máx) del sensor y episodios con su detección y daño.
function simEquipment(e, ctx, clima, lv, seed) {
  const r = mulberry32(seed ^ hash(e.id));
  const spec = EQ[e.eq];
  const outd = clima[e.cve];
  const hasPlant = e.kind !== 'unidad' || e.nivel > 1 || lv.pla === 'todas';
  const ac = e.kind !== 'unidad' || e.nivel > 1;                   // cuarto con clima
  const outs = outages(e, ctx, r).map(([s, f]) => (hasPlant && r() < 0.9 ? [s, s + 0.1] : [s, f]));
  // falla de compresor: rara; doméstico más
  const failRate = e.eq === 'dom' ? 0.0025 : e.eq === 'camara' ? 0.0004 : 0.001;  // por día
  let compFail = null;
  for (let d = 0; d < DAYS; d++) if (!compFail && r() < failRate * (ctx === 'calor' ? 2 : 1)) compFail = d * 24 + r() * 24;
  // termostato desviado (doméstico): 1 de cada 7 congela de noche
  const misSet = e.eq === 'dom' && r() < 0.14;
  const offset = misSet ? -3.6 - r() * 0.8 : e.eq === 'dom' ? 0.5 + (r() - 0.5) * 0.6 : (r() - 0.5) * 0.6;
  const spot = e.eq === 'dom' ? -0.6 - r() * 0.8 : 0;               // zona fría cerca del evaporador
  const set = 5 + offset;
  // aperturas de puerta
  const doorsPerDay = Math.round(spec.doors * (e.kind === 'cenadi' ? 2 : 1));
  const doors = [];
  for (let d = 0; d < DAYS; d++) {
    const dow = d % 7;
    if (e.kind === 'unidad' && e.nivel === 1 && dow >= 5) continue;
    for (let k = 0; k < doorsPerDay; k++) doors.push(d * 24 + (e.kind === 'cenadi' ? r() * 24 : 8 + r() * 8));
  }
  doors.sort((a, b) => a - b);
  // monitoreo de este equipo
  const mon = e.kind === 'cenadi' ? 'tele' : lv.mon;
  const sat = e.kind !== 'unidad' || e.nivel > 1;
  const checks = e.kind === 'unidad' && e.nivel > 1 ? [8, 16, 24] : [8, 16];
  const minT = new Float32Array(H).fill(99), maxT = new Float32Array(H).fill(-99), meanT = new Float32Array(H);
  let T = set + (r() - 0.5), comp = false, di = 0, oi = 0;
  let roomLag = at(outd, 0) + 3;
  const eps = [];
  let ep = null, outRun = 0, inRun = 0, heatRun = 0, frzRun = 0, coldRun = 0, alarm = false;
  let heatEq = 0, frozeEver = false, inRange = 0, total = 0;
  for (let s = 0; s < STEPS; s++) {
    const t = s * DT;
    while (oi < outs.length && outs[oi][1] < t) oi++;
    const power = !(oi < outs.length && outs[oi][0] <= t && t < outs[oi][1]);
    const working = !(compFail != null && t >= compFail && t < compFail + 72);
    // cuarto: sigue al exterior con retraso; con clima se queda entre 20 y 26 °C mientras haya energía
    const tout = at(outd, t);
    roomLag += (tout + 3 - roomLag) * DT / 4;
    const room = ac && power ? Math.min(26, Math.max(20, roomLag)) : roomLag + (ac ? 1 : 0);
    T += (room - T) * DT / spec.tau;
    while (di < doors.length && doors[di] <= t) { T += spec.door; di++; }
    if (power && working) {
      if (T > set + spec.hyst) comp = true; else if (T < set - spec.hyst) comp = false;
      if (comp) T -= spec.cap * DT;
    } else comp = false;
    const sens = T + spot * 0.6;                                    // registrador en el anaquel
    const prod = (ep && ep.safeAt != null && t >= ep.safeAt) ? 5 : T + spot;
    // exposición del producto
    if (prod > 8) heatEq += DT * Math.pow(2, (prod - 25) / 10);
    if (prod <= -0.5) { frzRun += DT; if (frzRun >= 1) { frozeEver = true; if (ep) ep.froze = true; } } else frzRun = 0;
    // series
    const h = Math.floor(t);
    if (sens < minT[h]) minT[h] = sens; if (sens > maxT[h]) maxT[h] = sens; meanT[h] += sens / 12;
    total++; if (sens >= 2 && sens <= 8) inRange++;
    // episodios sobre lo que lee el sensor
    const out = sens > 8 || sens < 2;
    outRun = out ? outRun + DT : 0;
    if (out && (ep || outRun >= 1 / 3)) {
      inRun = 0;
      if (!ep) ep = { eq: e.id, t0: t, t1: null, type: sens > 8 ? 'calor' : 'frio', peak: sens, low: sens, causa: !power ? 'apagón' : !working ? 'falla de compresor' : sens > 8 ? 'puertas y calor del cuarto' : 'termostato o zona fría', det: null, safeAt: null, froze: false, heat0: heatEq };
      ep.peak = Math.max(ep.peak, sens); ep.low = Math.min(ep.low, sens);
      if (sens > 8) heatRun += DT; else heatRun = 0;
      if (sens <= -0.5) coldRun += DT; else coldRun = 0;
      if (!power) ep.causa = 'apagón';
      if (!working) ep.causa = 'falla de compresor';
      // detección
      if (ep.det == null) {
        if (mon === 'tele') {
          if (heatRun >= 0.5 || (sens <= 0 && coldRun >= 0.25) || coldRun >= 0.25) { ep.det = t; ep.safeAt = t + (isWork(t, sat) ? 0.75 : 3); ep.via = 'aviso de telemetría'; }
        } else {
          if (mon === 'reg' && (heatRun >= 10 || coldRun >= 1)) alarm = true;
        }
      }
    } else if (ep && !out) {
      heatRun = 0; coldRun = 0;
      inRun += DT;
      if (inRun >= 0.5) { ep.t1 = t; ep.heat = heatEq - ep.heat0; ep.type = ep.froze ? 'congelación' : ep.peak > 8 ? 'calor' : 'frío'; eps.push(ep); ep = null; inRun = 0; }
    }
    // revisiones del personal (manual y registrador)
    if (mon !== 'tele') {
      const hf = t % 24, dow = Math.floor(t / 24) % 7;
      if ((sat || dow < 5) && checks.some(c => Math.abs(hf - (c % 24)) < DT / 2)) {
        const target = ep || (alarm ? eps.at(-1) : null);
        if (target && target.det == null && (out || alarm)) {
          target.det = t; target.via = out ? 'lectura fuera de rango' : 'alarma del registrador';
          if (target === ep) target.safeAt = t + 0.25;
        }
        alarm = false;
      }
    }
  }
  if (ep) { ep.t1 = H; ep.heat = heatEq - ep.heat0; ep.type = ep.froze ? 'congelación' : ep.peak > 8 ? 'calor' : 'frío'; eps.push(ep); }
  for (let h = 0; h < H; h++) if (minT[h] === 99) { minT[h] = meanT[h]; maxT[h] = meanT[h]; }
  return { minT, maxT, meanT, eps, heatEq, frozeEver, inRange, total, outs, compFail, offset, hasPlant };
}

// ---------------------------------------------------------------- viajes
//  tráiler (CENADI → estado) y caja térmica (estado → unidad); perfil cada 15 min
function simTrip(trip, ctx, clima, lv, r) {
  const n = Math.max(2, Math.ceil(trip.dur / 0.25)), prof = new Float32Array(n + 1);
  const mon = lv.mon;
  const frozenPacks = trip.kind === 'caja' && lv.pack === 'directo' && r() < 0.45;
  let T = 4.5;
  let life = 48 * (0.85 + 0.3 * r());                                // vida fría de la caja a 32 °C
  const fail = trip.kind === 'reefer' && r() < (ctx === 'calor' ? 0.08 : 0.04) ? r() * trip.dur : null;
  let heat = 0, frz = 0, froze = false, out = 0, safe = null, peak = T, low = T, det = null, via = '';
  for (let i = 0; i <= n; i++) {
    const t = trip.dep + i * 0.25;
    const amb = at(clima[trip.cve], t) + (t % 24 > 9 && t % 24 < 18 ? 5 : 1);
    if (trip.kind === 'reefer') {
      if (fail != null && i * 0.25 >= fail) {
        T += (amb - T) * 0.25 / 12;
        if (mon === 'tele' && safe == null && T > 8) { safe = t + 3; det = t; via = 'aviso de telemetría'; }
      } else T += (5 - T) * 0.5;
    } else {
      const el = i * 0.25;
      if (life > 0) {
        life -= 0.25 * Math.max(0.2, (amb - 4) / 28);
        const target = frozenPacks ? Math.min(4.5, -7 + 2.6 * el) : 4.5;   // refrigerantes a −15 °C se calientan poco a poco
        T += (target - T) * Math.min(1, 0.25 / 0.6);
      } else T += (amb - T) * 0.25 / 3;
    }
    const p = safe != null && t >= safe ? 5 : T;
    prof[i] = T;
    peak = Math.max(peak, T); low = Math.min(low, T);
    if (p > 8) { heat += 0.25 * Math.pow(2, (p - 25) / 10); out += 0.25; }
    if (p <= -0.5) { frz += 0.25; if (frz >= 1) froze = true; } else frz = 0;
    if (p < 2) out += 0.25;
  }
  // al llegar: con registrador o telemetría se ve todo el viaje; manual, solo la lectura del momento
  const arrive = prof[n];
  if (det == null && (peak > 8 || low < 2)) {
    if (mon !== 'manual') { det = trip.dep + trip.dur; via = 'registrador al recibir'; }
    else if (arrive > 8 || arrive < 2) { det = trip.dep + trip.dur; via = 'lectura al recibir'; }
  }
  return { prof, heat, froze, out, peak, low, fail, det, via, arrive };
}

// ---------------------------------------------------------------- red completa
export function buildNetwork(data, lv, seed = 2026) {
  const nodes = [];
  const byCve = Object.fromEntries(data.estados.map(e => [e.cve, e]));
  nodes.push({ id: 'CENADI', kind: 'cenadi', cve: '15', nombre: 'CENADI · Tlalnepantla', eq: 'camara', nivel: 0, xy: [0, 0] });
  for (const s of data.estados) nodes.push({ id: 'EST' + s.cve, kind: 'estatal', cve: s.cve, nombre: `Almacén estatal ${s.nombre}`, eq: 'camara', nivel: 0, xy: s.hub });
  for (const u of data.unidades) {
    let eq = 'med';
    if (u.nivel === 1) eq = lv.ref === 'med' ? 'med' : lv.ref === 'ilr' ? 'ilr' : (hash(u.clues) % 10 < 7 ? 'dom' : 'med');
    nodes.push({ id: u.clues, kind: 'unidad', cve: u.cve, nombre: u.nombre, tipo: u.tipo, nivel: u.nivel, mun: u.mun, eq, xy: u.xy });
  }
  // existencias
  const unitStock = n => PRODUCTS.map(p => p.st[n.nivel - 1]);
  for (const n of nodes) if (n.kind === 'unidad') n.stock = unitStock(n);
  for (const s of data.estados) {
    const est = nodes.find(n => n.id === 'EST' + s.cve);
    est.stock = PRODUCTS.map((p, i) => nodes.filter(n => n.kind === 'unidad' && n.cve === s.cve).reduce((a, n) => a + n.stock[i], 0) * 1.2);
  }
  nodes[0].stock = PRODUCTS.map((p, i) => nodes.filter(n => n.kind === 'estatal').reduce((a, n) => a + n.stock[i], 0) * 1.5);
  return { nodes, byCve };
}

export function simulate(data, lvIn = {}, seed = 2026) {
  const lv = { ...BASE, ...lvIn };
  const { nodes, byCve } = buildNetwork(data, lv, seed);
  const clima = climate(data.estados.map(e => e.cve), lv.ctx, seed);
  const cenadiClima = clima['15'];
  const res = [];
  for (const n of nodes) {
    const R = simEquipment(n, lv.ctx, clima, lv, seed);
    n.R = R;
    res.push(R);
  }
  // viajes: tráiler semanal (2 si el estado está a ≤ 12 h) y caja semanal a cada unidad
  const trips = [];
  const rT = mulberry32(seed ^ hash('trips' + lv.ctx + lv.mon + lv.pack));
  for (const s of data.estados) {
    const per = s.horas <= 12 ? [0, 3] : [hash(s.cve) % 5];
    for (let d = 0; d < DAYS; d++) if (per.includes(d % 7)) {
      const dep = d * 24 + 18 + (hash(s.cve) % 4);
      trips.push({ kind: 'reefer', cve: s.cve, to: 'EST' + s.cve, from: 'CENADI', dep, dur: Math.max(1, s.horas) });
    }
  }
  for (const n of nodes) if (n.kind === 'unidad') {
    const hub = byCve[n.cve].hub;
    const km = Math.hypot(n.xy[0] - hub[0], n.xy[1] - hub[1]) * 1.3;
    const dur = 1 + km / 45;
    const wd = hash(n.id) % 5;
    for (let d = 0; d < DAYS; d++) if (d % 7 === wd) {
      const delay = rT() < 0.05 ? 4 + rT() * 6 : 0;
      trips.push({ kind: 'caja', cve: n.cve, to: n.id, from: 'EST' + n.cve, dep: d * 24 + 7 + rT() * 2, dur: dur + delay, km, delay });
    }
  }
  for (const tr of trips) Object.assign(tr, simTrip(tr, lv.ctx, clima, lv, rT));
  trips.sort((a, b) => a.dep - b.dep);

  // pérdidas: cada episodio y cada viaje contra los productos que llevaba
  const losses = [];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const lostFlag = new Map();                                        // equipo|producto → ya perdido
  function damage(where, stock, froze, heatCum, t, det, label, frac = 1, frzShare = 1) {
    const items = [];
    PRODUCTS.forEach((p, i) => {
      const key = where + '|' + p.id;
      if (lostFlag.get(key) && frac === 1) return;
      const byFrz = p.frz && froze, bad = byFrz || heatCum > p.bud;
      if (!bad) return;
      const q = Math.round((stock[i] || 0) * frac * (byFrz ? frzShare : 1));
      if (!q) return;
      if (frac === 1) lostFlag.set(key, true);
      items.push({ p: p.id, q, mxn: q * p.mxn, why: p.frz && froze ? 'congelación' : 'calor acumulado' });
    });
    if (items.length) losses.push({ t, where, label, det: det != null, items, q: items.reduce((a, x) => a + x.q, 0), mxn: items.reduce((a, x) => a + x.mxn, 0) });
  }
  for (const n of nodes) {
    let cum = 0;
    for (const ep of n.R.eps) {
      cum += ep.heat;
      ep.node = n.id;
      damage(n.id, n.stock, ep.froze, cum, ep.t1, ep.det, ep.froze ? 'congelación' : 'excursión de calor', 1);
      ep.loss = losses.at(-1)?.where === n.id && losses.at(-1).t === ep.t1 ? losses.at(-1) : null;
    }
  }
  for (const tr of trips) {
    const stock = byId[tr.to].stock;
    const frac = 0.1;                                                // un envío semanal ≈ 10 % de la existencia
    const before = losses.length;
    damage(tr.kind + ':' + tr.to + ':' + Math.round(tr.dep), stock, tr.froze, tr.heat, tr.dep + tr.dur, tr.det, tr.kind === 'caja' ? 'caja térmica' : 'tráiler refrigerado', frac, tr.kind === 'caja' ? 0.5 : 1);
    tr.loss = losses.length > before ? losses.at(-1) : null;
    if (tr.loss) tr.loss.trip = tr;
  }
  losses.sort((a, b) => a.t - b.t);
  const S = { lv, nodes, byId, trips, losses, clima, data };
  S.summary = summaryAt(S, H);
  S.invest = investment(S);
  return S;
}

// ---------------------------------------------------------------- lecturas a una hora t
export function eqState(n, t) {
  const h = Math.max(0, Math.min(H - 1, Math.floor(t)));
  const R = n.R;
  const ep = R.eps.find(e => e.t0 <= t && (e.t1 ?? H) > t);
  const done = R.eps.filter(e => e.t0 <= t);
  const T = R.meanT[h];
  let st = 'ok';
  if (done.some(e => e.loss && e.t1 <= t)) st = done.some(e => e.loss && !e.loss.det && e.t1 <= t) ? 'oculto' : 'baja';
  else if (done.some(e => e.froze)) st = 'frio';
  else if (done.length) st = 'exc';
  return { T, min: R.minT[h], max: R.maxT[h], ep, n: done.length, st };
}

export function summaryAt(S, t) {
  let inR = 0, tot = 0, eps = 0, det = 0, detDelay = 0, froze = 0;
  const h = Math.max(1, Math.min(H, Math.floor(t)));
  for (const n of S.nodes) {
    const R = n.R;
    for (let i = 0; i < h; i++) { tot++; if (R.meanT[i] >= 2 && R.meanT[i] <= 8 && R.minT[i] >= 2 && R.maxT[i] <= 8) inR++; }
    for (const e of R.eps) if (e.t0 <= t) {
      eps++;
      if (e.det != null && e.det <= t) { det++; detDelay += e.det - e.t0; }
      if (e.froze) froze++;
    }
  }
  const L = S.losses.filter(l => l.t <= t);
  const baja = L.filter(l => l.det), oculto = L.filter(l => !l.det);
  const trips = S.trips.filter(x => x.dep + x.dur <= t);
  const tripsOut = trips.filter(x => x.out > 0);
  return {
    inRange: tot ? inR / tot : 1, eps, det, detPct: eps ? det / eps : 1, detDelay: det ? detDelay / det : 0, froze,
    bajaQ: baja.reduce((a, l) => a + l.q, 0), bajaMxn: baja.reduce((a, l) => a + l.mxn, 0),
    ocultoQ: oculto.reduce((a, l) => a + l.q, 0), ocultoMxn: oculto.reduce((a, l) => a + l.mxn, 0),
    trips: trips.length, tripsOut: tripsOut.length,
  };
}

// inversión de las palancas contra la base, y pérdida anualizada
export function investment(S) {
  const lv = S.lv, units = S.nodes.filter(n => n.kind === 'unidad'), n1 = units.filter(n => n.nivel === 1);
  const eqCount = S.nodes.length;
  let capex = 0, opexMes = 0;
  if (lv.mon === 'reg') capex += COSTS.reg * (eqCount + units.length);           // equipos + una por caja térmica
  if (lv.mon === 'tele') { capex += COSTS.tele * eqCount + COSTS.reg * units.length; opexMes += COSTS.teleMes * eqCount; }
  const domN1 = n1.filter(n => hash(n.id) % 10 < 7).length;
  if (lv.ref === 'med') capex += COSTS.med * domN1;
  if (lv.ref === 'ilr') capex += COSTS.ilr * n1.length;
  if (lv.pla === 'todas') capex += COSTS.planta * n1.length;
  if (lv.pack === 'acond') capex += COSTS.acond * 32;
  const m = S.summary;
  return { capex, opexMes, perdidaMes: m.bajaMxn + m.ocultoMxn };
}

// ---------------------------------------------------------------- formato
export function dateOf(t) { return new Date(T0U + Math.floor(t) * 3600e3); }
export function fmtT(t, withHour = true) {
  const d = new Date(T0U + Math.floor(t * 60) * 60e3);
  const dow = DOW[(d.getUTCDay() + 6) % 7];
  return `${dow} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}${withHour ? ` · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''}`;
}
export const EQNAME = Object.fromEntries(Object.entries(EQ).map(([k, v]) => [k, v.n]));

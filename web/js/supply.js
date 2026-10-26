// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  supply.js · Abasto de medicamentos en la unidad médica (datos simulados)
//
//  Para una unidad (CLUES) simula, día por día y en orden de tiempo:
//    · Entradas  : entrega ordinaria del CEDIS en el día de su ruta (misma
//                  hora y % de surtimiento que el panel de Salidas del CEDIS)
//                  y reabasto urgente cuando una clave llega a cero.
//    · Salidas   : recetas surtidas a pacientes en farmacia y consumo de
//                  quirófano por cirugía (solo unidades con hospitalización).
//    · Existencia por clave al cierre de cada día y en tiempo real.
//
//  Todo es determinista (misma unidad + mismo día = mismos datos), así el
//  CEDIS y la vista de la unidad muestran exactamente el mismo envío.
//  >>> API: para datos reales sustituye generateDay() por los movimientos
//  del sistema de farmacia (recetas, vales de quirófano y remisiones).
// =====================================================================
import { Ops } from './ops.js';

export const DAY = 86400, H = 3600, MIN = 60;
export const HISTORY_DAYS = 30;          // días visibles en gráficas
const WARMUP = 16;                       // días previos para estabilizar existencias

// Tamaño relativo de la farmacia (recetas por día ≈ 230 × factor)
const RX_SIZE = { UMF: 1, 'UMF/H': 0.7, CMF: 0.5, CMFE: 0.9, CAF: 0.15, CMCT: 0.12, HGZ: 0.75, 'HGZ/MF': 1.6, HG: 0.8, HGSZ: 0.5, CH: 0.5 };
// Cirugías por día hábil
const SURG = { HGZ: 10, 'HGZ/MF': 7, HG: 8, HGSZ: 4, CH: 3, 'UMF/H': 2 };

// Consumo de quirófano por procedimiento (piezas; la fracción es probabilidad)
const K = {
  metamIny: '010.000.0109.00', keto: '010.000.3422.00', trama: '040.000.2106.00', bupre: '040.000.4026.00', morf: '040.000.2103.00',
  fent: '040.000.0242.00', lido: '010.000.0262.00', propo: '010.000.0246.00', mida: '040.000.2108.00', vecu: '010.000.0254.00',
  rocu: '010.000.4059.00', sevo: '010.000.0233.00', atro: '010.000.0204.00', epi: '010.000.0611.00', ceftri: '010.000.1937.00',
  cefalo: '010.000.5256.00', butIny: '010.000.1207.00', metoIny: '010.000.1241.00', oxi: '010.000.1542.00', hepa: '010.000.0622.00',
  enox: '010.000.2154.00', nacl: '010.000.3609.00', hart: '010.000.3615.00', glu5: '010.000.3630.00', glu50: '010.000.3607.00', kcl: '010.000.0524.00',
};
export const PROCEDURES = [
  { n: 'Cesárea', w: 28, sala: 'Tococirugía', kit: { lido: 0.4, fent: 0.5, oxi: 2, cefalo: 1, keto: 1, metamIny: 1, metoIny: 1, hart: 2, nacl: 1, enox: 1 } },
  { n: 'Colecistectomía laparoscópica', w: 18, kit: { propo: 1, fent: 1, mida: 1, rocu: 1, sevo: 0.3, cefalo: 1, keto: 1, metamIny: 1, metoIny: 1, hart: 2, nacl: 1, atro: 0.3, trama: 1, butIny: 1, enox: 1 } },
  { n: 'Apendicectomía', w: 14, kit: { propo: 1, fent: 1, mida: 1, vecu: 1, sevo: 0.25, ceftri: 1, keto: 1, metamIny: 1, hart: 2, nacl: 1, trama: 1 } },
  { n: 'Hernioplastía inguinal', w: 12, kit: { lido: 0.4, fent: 0.5, mida: 1, cefalo: 1, keto: 1, hart: 1, bupre: 1 } },
  { n: 'Osteosíntesis de fractura', w: 10, kit: { propo: 1, fent: 1, mida: 1, rocu: 1, sevo: 0.35, cefalo: 2, keto: 1, morf: 1, hart: 2, nacl: 2, enox: 1 } },
  { n: 'Histerectomía abdominal', w: 6, kit: { propo: 1, fent: 1, mida: 1, vecu: 1, sevo: 0.35, cefalo: 1, keto: 1, metamIny: 1, hart: 3, nacl: 1, bupre: 1, kcl: 0.5, enox: 1 } },
  { n: 'Laparotomía exploradora', w: 6, kit: { propo: 1.5, fent: 1.5, mida: 1, rocu: 1.5, sevo: 0.5, ceftri: 2, keto: 1, metamIny: 1, hart: 3, nacl: 2, glu5: 1, kcl: 1, epi: 0.3, atro: 0.5, morf: 1, hepa: 0.3, glu50: 0.2 } },
  { n: 'Legrado uterino', w: 6, sala: 'Tococirugía', kit: { propo: 1, fent: 0.5, mida: 0.5, oxi: 1, keto: 1, hart: 1 } },
];
const PROC_W = PROCEDURES.reduce((n, p) => n + p.w, 0);
// Temporada de enfermedades respiratorias (pico a mediados de enero): sube la demanda de estas claves
export const SEASON_AMP = {
  '010.000.2463.00': 0.9, '010.000.0429.00': 0.7, '010.000.0402.00': 0.6, '010.000.2128.00': 0.5, '010.000.2127.00': 0.6,
  '010.000.0104.00': 0.4, '010.000.2144.00': 0.35, '010.000.0477.00': 0.35, '010.000.5941.00': 0.25, '010.000.0108.00': 0.2,
};
export const seasonBump = idx => 0.5 * (1 + Math.cos(2 * Math.PI * (idx - 78) / 365));   // 0 en julio, 1 a mediados de enero
// Claves críticas: si se agotan la solicitud es vital (N1)
const VITAL = new Set(['010.000.0611.00', '010.000.0204.00', '010.000.1542.00', '010.000.3607.00', '010.000.0524.00']);

// Urgencias: vales de medicamento por tipo de atención (piezas; fracción = probabilidad)
export const ER_CASES = [
  { n: 'Dolor abdominal', w: 22, kit: { butIny: 1, metamIny: 1, nacl: 1, metoIny: 0.5 } },
  { n: 'Herida / traumatismo', w: 18, kit: { lido: 0.3, keto: 1, ceftri: 0.3, nacl: 1 } },
  { n: 'Deshidratación', w: 16, kit: { hart: 2, glu5: 0.5, kcl: 0.3, metoIny: 1 } },
  { n: 'Infección grave', w: 12, kit: { ceftri: 2, nacl: 2, metamIny: 1, hart: 1 } },
  { n: 'Hipoglucemia', w: 8, kit: { glu50: 1, glu5: 1 } },
  { n: 'Dolor torácico', w: 8, kit: { morf: 0.5, enox: 1, nacl: 1 } },
  { n: 'Trabajo de parto', w: 10, kit: { oxi: 1, hart: 1, metamIny: 0.5 } },
  { n: 'Reacción alérgica grave', w: 4, kit: { epi: 1, hart: 1 } },
  { n: 'Paro cardiorrespiratorio', w: 2, kit: { epi: 3, atro: 1, nacl: 2, glu50: 0.3 } },
];
const ER_W = ER_CASES.reduce((n, p) => n + p.w, 0);
const ER_RATE = { HGZ: 16, 'HGZ/MF': 12, HG: 14, HGSZ: 8, CH: 6, 'UMF/H': 5 };   // vales por día

// Faltantes de CEDIS (clave sin existencia o surtida parcial en un periodo; días relativos a hoy = 0)
const CEDIS_SHORT = [
  { c: '010.000.4158.00', from: -22, to: -13, f: 0.5 },   // insulina glargina: surtimiento al 50 %
  { c: '010.000.4246.00', from: -9, to: 2, f: 0 },        // clopidogrel: sin existencia en CEDIS
  { c: '010.000.1207.00', from: -16, to: -11, f: 0 },     // butilhioscina inyectable
  { c: '010.000.0429.00', from: -5, to: 1, f: 0.4 },      // salbutamol aerosol
  { c: '010.000.2520.00', from: -27, to: -19, f: 0.6 },   // losartán: surtimiento parcial
  { c: '010.000.2154.00', from: -12, to: -6, f: 0 },      // enoxaparina 40 mg
  { c: '010.000.1703.00', from: -3, to: 4, f: 0 },        // sulfato ferroso
];

// ---------------------------------------------------------------------
//  Escenarios. "contingencia" simula un desabasto masivo: el CEDIS se queda sin
//  existencia de 6 claves y con existencia parcial de otras 4 (del día −12 al +14),
//  y hay un brote respiratorio (la temporada se intensifica).
// ---------------------------------------------------------------------
const CONT_SHORT = [
  { c: '010.000.5165.00', from: -12, to: 14, f: 0 },      // metformina
  { c: '010.000.2520.00', from: -12, to: 14, f: 0 },      // losartán
  { c: '010.000.1050.00', from: -10, to: 14, f: 0 },      // insulina NPH
  { c: '010.000.2128.00', from: -12, to: 14, f: 0 },      // amoxicilina
  { c: '010.000.0429.00', from: -8, to: 14, f: 0 },       // salbutamol
  { c: '010.000.1937.00', from: -9, to: 14, f: 0 },       // ceftriaxona
  { c: '010.000.0104.00', from: -12, to: 14, f: 0.3 },    // paracetamol
  { c: '010.000.5186.01', from: -12, to: 14, f: 0.3 },    // omeprazol
  { c: '010.000.2501.00', from: -12, to: 14, f: 0.3 },    // enalapril
  { c: '010.000.3615.00', from: -10, to: 14, f: 0.4 },    // solución Hartmann
].map(x => ({ ...x, scen: true }));
export const SCENARIOS = {
  normal: { label: 'Operación normal' },
  contingencia: { label: 'Contingencia: desabasto masivo en CEDIS y brote respiratorio', short: CONT_SHORT, seasonBoost: 1.8 },
};
let SCEN = 'normal';
// Pedido automático antes del desabasto (fase 3). ?ped=0 lo apaga para comparar.
let PROACTIVE = true;
export function setProactive(v) { PROACTIVE = !!v; }
export const proactive = () => PROACTIVE;
export const PEX_SLA = { validate: 2 * 3600, authorize: 4 * 3600 };
/** Activa un escenario (llamar antes de correr cualquier unidad) */
export function setScenario(name) { SCEN = SCENARIOS[name] ? name : 'normal'; }
export const scenario = () => SCEN;
// Modelo de inventario del CEDIS (network-sim.js). Si está instalado, los faltantes salen de él.
let MODEL = null;
export function setCedisModel(m) { MODEL = m; }
export const cedisModel = () => MODEL;
/** Faltantes de guion: contingencia (falla de proveedor) y, sin modelo, la lista fija */
export function scriptedShort(c, idx, scen = SCEN, fixed = !MODEL) {
  const list = scen === 'contingencia' ? (fixed ? [...CONT_SHORT, ...CEDIS_SHORT] : CONT_SHORT) : (fixed ? CEDIS_SHORT : []);
  return list.find(x => x.c === c && idx >= x.from && idx <= x.to) || null;
}
/** Faltante del CEDIS para la clave c el día idx (o null) */
export function cedisShort(c, idx) {
  return scriptedShort(c, idx) || (MODEL ? MODEL.short(c, idx) : null);
}
/** Claves sin existencia o parciales en CEDIS el día idx */
export function cedisShortList(idx) {
  const list = SCEN === 'contingencia' ? (MODEL ? CONT_SHORT : [...CONT_SHORT, ...CEDIS_SHORT]) : (MODEL ? [] : CEDIS_SHORT);
  const seen = new Set(), out = list.filter(x => idx >= x.from && idx <= x.to && !seen.has(x.c) && seen.add(x.c));
  if (MODEL) for (const x of MODEL.shortList(idx)) if (!seen.has(x.c)) { seen.add(x.c); out.push(x); }
  return out;
}
const VEN_W = { V: 50, E: 25, N: 8 };
/** Puntuación de prioridad de una solicitud al instante t (mayor = antes) */
export function reqScore(r, t) {
  const daysOpen = Math.max(0, (t - r.t0) / DAY);
  return Math.round(r.base + Math.min(20, 4 * daysOpen));
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// ---------------------------------------------------------------------
//  Lotes del CEDIS: cada clave cambia de lote cada 14 días. Caducidad de
//  14 a 30 meses; ~12 % de los lotes llega con caducidad corta (2 a 5 meses).
//  Días como índice (0 = lunes 26 de octubre de 2026).
// ---------------------------------------------------------------------
const LOT_SUPPLIERS = ['Laboratorio nacional A', 'Laboratorio nacional B', 'Distribuidor nacional C', 'Distribuidor regional E', 'CENADI-Birmex'];
const LOT_CACHE = new Map();
export function lotFor(c, idx) {
  const off = hashStr(c) % 14, k = Math.floor((idx + off) / 14), key = c + '|' + k;
  if (LOT_CACHE.has(key)) return LOT_CACHE.get(key);
  const R = mulberry32(hashStr(c) ^ Math.imul(k + 77, 2654435761));
  const start = k * 14 - off;
  const short = R() < 0.12;
  const shelf = short ? 25 + Math.floor(R() * 100) : 420 + Math.floor(R() * 480);
  const num = c.split('.')[2];
  const L = { lot: `LT${num}-${k + 2000}`, c, k, exp: start + shelf, recv: start - 2, short,
    supplier: LOT_SUPPLIERS[Math.floor(R() * LOT_SUPPLIERS.length)], rem: `REM-${(k + 2000) % 100}${String(Math.floor(R() * 900) + 100)}`,
    loc: `${'ABCDEFGH'[Math.floor(R() * 8)]}-${String(1 + Math.floor(R() * 20)).padStart(2, '0')}-${1 + Math.floor(R() * 5)}` };
  LOT_CACHE.set(key, L);
  return L;
}
/** Busca un lote por su código (LTnnnn-kkkk) */
export function lotByCode(code, catalog) {
  const m = /^LT(\d{4})-(\d+)$/i.exec(String(code).trim());
  if (!m) return null;
  const item = catalog.items.find(x => x.c.split('.')[2] === m[1]);
  if (!item) return null;
  const k = +m[2] - 2000, off = hashStr(item.c) % 14;
  return lotFor(item.c, k * 14 - off);
}
const poisson = (R, l) => { if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(R))); let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
const gauss = R => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
const intOf = (R, x) => Math.floor(x) + (R() < x - Math.floor(x) ? 1 : 0);

/** Calendario de rutas del CEDIS sin depender del reloj del visor 3D. */
export function makeCalendar(data) {
  const cal = Object.create(Ops.prototype);
  cal.units = data.units; cal.routes = data.routes;
  const cache = new Map();
  cal.dayPlan = idx => {
    if (!cache.has(idx)) { cal.buildDay(idx); cache.set(idx, cal.day); if (cache.size > 80) cache.delete(cache.keys().next().value); }
    return cache.get(idx);
  };
  /** Parada de la unidad en el día idx (o null) */
  cal.stopFor = (u, idx) => {
    if (!cal.visits(u, idx)) return null;
    for (const tr of cal.dayPlan(idx).trips) { const s = tr.stops.find(x => x.unit === u); if (s) return { ...s, trip: tr }; }
    return null;
  };
  return cal;
}

export class UnitSupply {
  /**
   * @param unit     unidad de assets/unidades_hidalgo.json
   * @param catalog  assets/medicamentos.json
   * @param cal      makeCalendar(data)
   */
  constructor(unit, catalog, cal) {
    this.unit = unit; this.cal = cal;
    this.seed = hashStr(unit.clues);
    const R0 = mulberry32(this.seed);
    this.surgical = !!unit.hosp && SURG[unit.tipo] > 0;
    this.items = catalog.items.filter(m => m.u === 'F' || this.surgical);
    this.byClave = new Map(this.items.map(m => [m.c, m]));
    this.F = this.items.filter(m => m.u === 'F');
    this.Q = this.items.filter(m => m.u === 'Q');
    this.wSum = this.F.reduce((n, m) => n + m.w, 0);
    // La demanda real de cada clave difiere de la planeada (epidemiología local)
    this.trueW = new Map(this.F.map(m => [m.c, m.w * (0.8 + 0.6 * R0())]));
    this.trueSum = [...this.trueW.values()].reduce((a, b) => a + b, 0);
    this.rxBase = Math.round(230 * (RX_SIZE[unit.tipo] ?? 0.6) * (0.75 + 0.5 * R0()));
    this.surgBase = this.surgical ? SURG[unit.tipo] * (0.8 + 0.4 * R0()) : 0;
    this.erBase = this.surgical ? (ER_RATE[unit.tipo] || 5) * (0.8 + 0.4 * R0()) : 0;
    this.cycle = unit.frecuencia === '2 por semana' ? 3.5 : unit.frecuencia === 'Cada 14 días' ? 14 : 7;
    this.hours = unit.hosp ? [7, 21] : (unit.tipo === 'CAF' || unit.tipo === 'CMCT') ? [8, 15] : [8, 20];
    // Demanda diaria esperada por clave (piezas) → máximos y mínimos
    const linesAvg = 1.85, rxWeek = this.rxBase * (5 + 0.3) / 7;
    this.demand = new Map();
    for (const m of this.F) this.demand.set(m.c, rxWeek * linesAvg * (m.w / this.wSum) * (m.chron ? 1.35 : 1.05));
    if (this.surgical) {
      const sWeek = this.surgBase * (5 + 2 * 0.45) / 7;
      for (const m of this.Q) this.demand.set(m.c, 0);
      for (const p of PROCEDURES) for (const [k, q] of Object.entries(p.kit)) this.demand.set(K[k], this.demand.get(K[k]) + sWeek * (p.w / PROC_W) * q);
      for (const c of ER_CASES) for (const [k, q] of Object.entries(c.kit)) this.demand.set(K[k], this.demand.get(K[k]) + this.erBase * (c.w / ER_W) * q);
    }
    this.max = new Map(); this.min = new Map();
    for (const m of this.items) {
      const d = Math.max(0.05, this.demand.get(m.c));
      this.max.set(m.c, Math.max(m.pack, Math.ceil(d * (this.cycle + 6))));
      this.min.set(m.c, Math.max(1, Math.ceil(d * Math.max(3, this.cycle * 0.3))));
    }
    this.todayIdx = null;
    this.proactive = PROACTIVE;
  }

  // ---------------------------------------------------------------
  //  Generación determinista de un día (sin aplicar existencias)
  // ---------------------------------------------------------------
  generateDay(idx) {
    const R = mulberry32(this.seed ^ Math.imul(idx + 1000, 2654435761));
    const wd = this.cal.weekday(idx), u = this.unit;
    const ev = [];
    // Farmacia · recetas
    const [h0, h1] = this.hours;
    const wdF = wd === 0 ? (u.hosp ? 0.15 : 0) : wd === 6 ? (u.hosp ? 0.35 : 0.3) : 1;
    const close = wd === 6 && !u.hosp ? 14 : h1;
    const bump = seasonBump(idx);
    const nRx = poisson(R, this.rxBase * wdF * (1 + 0.12 * (bump - 0.5)));
    // pesos del día con estacionalidad
    const boost = SCENARIOS[SCEN].seasonBoost || 1;
    const wDay = this.F.map(m => this.trueW.get(m.c) * (1 + (SEASON_AMP[m.c] || 0) * boost * (bump - 0.3)));
    const wSumDay = wDay.reduce((a, b) => a + b, 0);
    let folio = (idx + 400) * 1000 + Math.floor(R() * 300);
    for (let i = 0; i < nRx; i++) {
      // hora: más demanda a media mañana
      const x = (R() + R() + R()) / 3;
      const t = idx * DAY + (h0 + x * (close - h0)) * H;
      const nl = R() < 0.4 ? 1 : R() < 0.58 ? 2 : 3;
      const lines = [], used = new Set();
      while (lines.length < nl) {
        let r = R() * wSumDay, m, j = 0;
        for (m of this.F) { r -= wDay[j++]; if (r <= 0) break; }
        if (used.has(m.c)) continue; used.add(m.c);
        const q = m.chron && R() < 0.35 ? 2 : 1;
        // en contingencia, las claves en desabasto se surten para 7 días (1 caja) y se completa después
        if (q > 1 && SCEN === 'contingencia' && cedisShort(m.c, idx)) lines.push({ c: m.c, q: 1, adj: true });
        else lines.push({ c: m.c, q });
      }
      ev.push({ t, kind: 'rx', folio: `${u.inst === 'IMSS' ? 'RX' : 'RE'}-${++folio}`, pac: 1000 + Math.floor(R() * 9000), cons: 1 + Math.floor(R() * (u.hosp ? 24 : 14)), lines });
    }
    // Quirófano
    if (this.surgical) {
      const ns = poisson(R, this.surgBase * (wd === 0 || wd === 6 ? 0.45 : 1));
      for (let i = 0; i < ns; i++) {
        let r = R() * PROC_W, p;
        for (p of PROCEDURES) { r -= p.w; if (r <= 0) break; }
        const urgent = wd === 0 || wd === 6 || R() < 0.3;
        const t = idx * DAY + (urgent ? R() * 24 : 7.5 + R() * 7.5) * H;
        const lines = [];
        for (const [k, q] of Object.entries(p.kit)) { const n = intOf(R, q); if (n > 0) lines.push({ c: K[k], q: n }); }
        ev.push({ t, kind: 'or', proc: p.n, sala: p.sala || `Sala ${1 + Math.floor(R() * 3)}`, urgent, folio: `QX-${idx + 500}${String(i + 1).padStart(2, '0')}`, lines });
      }
    }
    // Urgencias (24 h)
    if (this.surgical) {
      const ne = poisson(R, this.erBase);
      for (let i = 0; i < ne; i++) {
        let r = R() * ER_W, c;
        for (c of ER_CASES) { r -= c.w; if (r <= 0) break; }
        const lines = [];
        for (const [k, q] of Object.entries(c.kit)) { const n = intOf(R, q); if (n > 0) lines.push({ c: K[k], q: n }); }
        if (!lines.length) continue;
        const hr = R() < 0.65 ? 8 + R() * 14 : R() * 24;
        ev.push({ t: idx * DAY + hr * H, kind: 'er', proc: c.n, sala: `Cubículo ${1 + Math.floor(R() * 6)}`, urgent: true, folio: `UR-${idx + 500}${String(i + 1).padStart(2, '0')}`, lines });
      }
    }
    // Entrega ordinaria del CEDIS (cantidades se calculan al iniciar el día)
    const stop = this.cal.stopFor(u, idx);
    if (stop) ev.push({ t: stop.actual + 20 * MIN, kind: 'in', type: 'Ordinaria', fill: stop.fill, route: stop.trip.id, eta: stop.eta, R: mulberry32(this.seed ^ (idx * 7919)) });
    return ev;
  }

  /** Arma las líneas del pedido de reabasto según existencias al iniciar el día */
  orderLines(stock, ev, idx) {
    const R = ev.R, lines = [];
    for (const m of this.items) {
      const s = stock.get(m.c), mx = this.max.get(m.c);
      if (s >= mx * 0.85) continue;
      let q = Math.ceil((mx - s) / m.pack) * m.pack;
      let sent = q, why = '';
      const sh = cedisShort(m.c, idx);
      if (sh) {
        // reparto cuando el CEDIS no alcanza: hospitales y claves vitales primero
        const f = sh.f === 0 ? 0 : Math.min(1, sh.f * (this.unit.hosp ? 1.35 : 0.85) * (m.ven === 'V' ? 1.5 : m.ven === 'N' ? 0.6 : 1));
        sent = Math.floor(q * f / m.pack) * m.pack;
        why = sh.f === 0 ? 'Sin existencia en CEDIS' : `Reparto por desabasto (${Math.round(f * 100)} %)`;
      }
      else if (R() > ev.fill + 0.04) { sent = R() < 0.5 ? 0 : Math.floor(q * (0.4 + 0.5 * R()) / m.pack) * m.pack; why = sent ? 'Surtimiento parcial' : 'Clave negada'; }
      const L = lotFor(m.c, idx);
      lines.push({ c: m.c, req: q, q: sent, why, lot: L.lot, exp: L.exp });
    }
    return lines;
  }

  // ---------------------------------------------------------------
  //  Simulación
  // ---------------------------------------------------------------
  /** Corre la historia hasta el inicio del día todayIdx. */
  run(todayIdx) {
    if (this.todayIdx === todayIdx) return this;
    this.todayIdx = todayIdx;
    const R0 = mulberry32(this.seed + 17);
    const start = todayIdx - HISTORY_DAYS - WARMUP;
    const S = { stock: new Map(this.items.map(m => [m.c, Math.round(this.max.get(m.c) * (0.45 + 0.45 * R0()))])), pend: [], open: new Map(), seq: 0, lots: new Map(), lotUse: new Map(), rxPend: [], pexOpen: new Map(), ewma: new Map(this.items.map(m => [m.c, this.demand.get(m.c)])) };
    for (const m of this.items) {            // existencia inicial en dos lotes anteriores
      const q = S.stock.get(m.c), a = lotFor(m.c, start - 40), b = lotFor(m.c, start - 12), qa = Math.floor(q * 0.35);
      S.lots.set(m.c, [{ lot: a.lot, exp: a.exp, q: qa }, { lot: b.lot, exp: b.exp, q: q - qa }].filter(x => x.q > 0).sort((x, y) => x.exp - y.exp));
    }
    const N = HISTORY_DAYS;
    const hist = { days: [], byC: new Map(this.items.map(m => [m.c, { ent: new Array(N).fill(0), salF: new Array(N).fill(0), salQ: new Array(N).fill(0), neg: new Array(N).fill(0), stock: new Array(N).fill(0), merma: new Array(N).fill(0) }])), rx: [], rxFull: [], rxPart: [], rxDen: [], rxNegPz: [], surg: [], er: [], deliveries: [], reqs: [], expired: [], filled: [], newPend: [], pex: [] };
    for (let d = start; d < todayIdx; d++) {
      const day = this.prepareDay(d, S.stock);
      const res = this.process(day, S, Infinity);
      const k = d - (todayIdx - N);
      if (k >= 0) {
        hist.days.push(d);
        for (const [c, h] of hist.byC) { h.ent[k] = res.ent.get(c) || 0; h.salF[k] = res.salF.get(c) || 0; h.salQ[k] = res.salQ.get(c) || 0; h.neg[k] = res.neg.get(c) || 0; h.stock[k] = S.stock.get(c); h.merma[k] = res.merma.get(c) || 0; }
        hist.expired.push(...res.expired); hist.filled.push(...res.filled); hist.newPend.push(...res.newPend);
        hist.rx.push(res.rx); hist.rxFull.push(res.rxFull); hist.rxPart.push(res.rxPart); hist.rxDen.push(res.rxDen); hist.rxNegPz.push(res.rxNegPz); hist.surg.push(res.surg); hist.er.push(res.er);
        for (const e of res.done) if (e.kind === 'in') hist.deliveries.push(e);
        hist.reqs.push(...res.reqs); hist.pex.push(...res.pex);
      }
    }
    this.hist = hist;
    this.startState = S;
    this.startPex = hist.pex.filter(x => x.deliver >= todayIdx * DAY - DAY);
    this.lotUse = S.lotUse;
    this.startStock = new Map(S.stock);
    this.today = this.prepareDay(todayIdx, new Map(S.stock));
    this.nextDelivery = this.findNext(todayIdx + 1);
    return this;
  }

  prepareDay(idx, stock) {
    const events = this.generateDay(idx);
    for (const e of events) if (e.kind === 'in') e.lines = this.orderLines(stock, e, idx);
    events.sort((a, b) => a.t - b.t);
    return { idx, events };
  }

  findNext(fromIdx) { for (let i = fromIdx; i < fromIdx + 21; i++) if (this.cal.visits(this.unit, i)) return i; return null; }

  /**
   * Alerta al CEDIS: la clave c llegó a cero en el instante t.
   * Nivel: N1 vital (claves críticas de quirófano/urgencias), N2 urgente (otras de quirófano y
   * tratamientos crónicos), N3 prioritario (resto). Si el CEDIS no tiene existencia se surte por
   * transferencia de otra unidad (tarda más).
   */
  request(c, t, day, S) {
    if (S.open.has(c)) return null;
    // si la entrega ordinaria de hoy todavía no llega y trae la clave, no se pide urgente
    if (day.events.some(e => e.kind === 'in' && e.t > t && e.lines.some(l => l.c === c && l.q > 0))) return null;
    const m = this.byClave.get(c), u = this.unit;
    const level = m.ven === 'V' || VITAL.has(c) ? 1 : (m.u === 'Q' || m.chron) ? 2 : 3;
    const q = Math.max(m.pack, Math.ceil(this.demand.get(c) * Math.max(3, this.cycle) / m.pack) * m.pack);
    const sh = cedisShort(c, day.idx);
    const backorder = !!(sh && sh.f === 0 && sh.scen);           // contingencia: no hay de dónde surtir
    const transfer = !!(sh && sh.f === 0 && !sh.scen);           // faltante puntual: otra unidad lo presta
    const L = lotFor(c, transfer ? day.idx - 20 : day.idx);
    const line = { c, req: q, q, why: backorder ? 'Pendiente: sin existencia en CEDIS' : transfer ? 'Transferencia de otra unidad' : '', lot: L.lot, exp: L.exp };
    const info = { c, name: m.n, pz: m.pz, q, ven: m.ven || 'E' };
    // Consolidación: si ya hay una solicitud de hoy que aún no sale del CEDIS, se agrega a ella
    if (!backorder && !transfer) {
      for (const r0 of new Set(S.open.values())) {
        if (r0.day === day.idx && !r0.backorder && !r0.transfer && t < r0.dispatch - 15 * MIN) {
          r0.lines.push(info); S.open.set(c, r0);
          r0.pendRef.lines.push(line);
          if (level < r0.level) r0.level = level;
          r0.base = Math.max(r0.base, this.reqBase(m)); r0.consolidated = r0.lines.length;
          return null;
        }
      }
    }
    const R = mulberry32(this.seed ^ Math.floor(t));
    const r = R();
    const t0 = t, validated = t0 + 15 * MIN;
    let dispatch;
    if (backorder) dispatch = (sh.to + 1) * DAY + (7 + r * 2) * H;
    else if (level === 1) dispatch = t0 + (40 + r * 15 + (transfer ? 45 : 0)) * MIN;
    else if (level === 2) dispatch = t0 + (60 + r * 45 + (transfer ? 120 : 0)) * MIN;
    else dispatch = (day.idx + 1) * DAY + (6 + r * 2 + (transfer ? 3 : 0)) * H;
    const deliver = dispatch + u.min * MIN * (0.95 + 0.25 * R());
    const deadline = t0 + (level === 1 ? u.min * MIN + 75 * MIN : level === 2 ? u.urgencia_h * H : 24 * H);
    S.seq++;
    const req = { pexLate: S.pexOpen?.get(c) || null, id: `SOL-${u.clues.slice(-3)}${String(S.seq).padStart(3, '0')}`, c, name: m.n, pz: m.pz, q, level, transfer, backorder, cold: !!m.frio,
      t0, validated, dispatch, deliver, deadline, clues: u.clues, day: day.idx, lines: [info], ven: m.ven || 'E', base: this.reqBase(m), consolidated: 1 };
    S.open.set(c, req);
    const pend = { t: deliver, kind: 'in', type: 'Urgente', level, req, lines: [line] };
    Object.defineProperty(req, 'pendRef', { value: pend, enumerable: false, writable: true });
    S.pend.push(pend);
    return req;
  }
  /**
   * Punto de reorden dinámico (fase 3). Al iniciar el día, para cada clave:
   *   existencia proyectada = existencia − consumo esperado (promedio móvil) hasta la próxima entrega ordinaria
   *   si queda por debajo de la existencia de seguridad → línea de pedido extraordinario.
   * Todas las líneas del día van en un solo pedido (PEX-…) que sigue el flujo:
   *   propuesto (sistema 07:00) → validado (jefatura de farmacia, plazo 2 h) → autorizado (mesa de control
   *   del CEDIS, plazo 4 h) → programado en ruta → entregado.
   */
  proposeOrder(day, S) {
    const idx = day.idx, u = this.unit;
    const visitToday = this.cal.visits(u, idx), nd = this.findNext(idx + 1) ?? idx + 7;
    const R = mulberry32(this.seed ^ Math.imul(idx + 7000, 2654435761));
    const lines = [];
    for (const m of this.items) {
      const c = m.c;
      if (S.open.has(c) || S.pexOpen.has(c)) continue;
      const d = Math.max(0.05, S.ewma.get(c)), s = S.stock.get(c);
      if (visitToday && s > d * 1.2) continue;                      // la entrega de hoy lo cubre
      const days = Math.max(1, nd - idx) + (visitToday ? 0 : 0.5);
      const proj = s - d * days, safety = d * Math.max(1.5, 0.35 * this.cycle);
      if (proj >= safety || d * days < m.pack * 0.5) continue;
      const q = Math.max(m.pack, Math.ceil((d * (days + this.cycle * 0.5) + safety - s) / m.pack) * m.pack);
      const sh = cedisShort(c, idx);
      const f = sh ? (sh.f === 0 ? 0 : Math.min(1, sh.f * (u.hosp ? 1.35 : 0.85) * (m.ven === 'V' ? 1.5 : 1))) : 1;
      const qs = Math.floor(q * f / m.pack) * m.pack;
      const L = lotFor(c, idx);
      lines.push({ c, name: m.n, pz: m.pz, ven: m.ven || 'E', stock: s, daily: d, cover: s / d, proj, safety, req: q, q: qs, cut: qs < q ? (f === 0 ? 'Sin existencia en CEDIS' : `Reparto CEDIS ${Math.round(f * 100)} %`) : '', lot: L.lot, exp: L.exp });
    }
    if (!lines.length) return null;
    lines.sort((a, b) => a.cover - b.cover);
    const minCover = lines[0].cover;
    // tiempos del flujo (simulados): la mayoría dentro del plazo, algunos se atrasan
    const t0 = idx * DAY + 7 * H + R() * 20 * MIN;
    const validated = t0 + (R() < 0.85 ? 15 + R() * 95 : 125 + R() * 120) * MIN;
    const authorized = validated + (R() < 0.82 ? 25 + R() * 200 : 245 + R() * 180) * MIN;
    const urgent = minCover < 1.5;
    // si urge, sale en viaje propio; si no, se programa en la ruta ordinaria del día siguiente (o viaje al día siguiente)
    const dispatch = urgent ? authorized + (40 + R() * 40) * MIN
      : Math.max(authorized + 30 * MIN, (idx + 1) * DAY + (6.5 + R()) * H);
    const deliver = dispatch + u.min * MIN * (0.95 + 0.25 * R());
    const scheduled = Math.min(dispatch - 20 * MIN, authorized + 20 * MIN);
    S.seq++;
    const id = `PEX-${u.clues.slice(-3)}${String(idx + 400).padStart(3, '0')}`;
    const send = lines.filter(l => l.q > 0);
    const order = { pex: true, id, clues: u.clues, unit: u.nombre, day: idx, t0, validated, authorized, scheduled, dispatch, deliver, urgent,
      level: urgent ? 2 : 3, lines, minCover, stockoutAt: t0 + minCover * DAY,
      slaV: validated - t0 <= PEX_SLA.validate, slaA: authorized - validated <= PEX_SLA.authorize,
      roles: { propone: 'Sistema (punto de reorden)', valida: 'Jefatura de farmacia', autoriza: 'Mesa de control CEDIS' } };
    for (const l of send) S.pexOpen.set(l.c, id);
    if (send.length) S.pend.push({ t: deliver, kind: 'in', type: 'Extraordinario', req: order, lines: send.map(l => ({ c: l.c, req: l.req, q: l.q, why: l.cut, lot: l.lot, exp: l.exp })) });
    else { order.noStock = true; order.deliver = order.dispatch = order.scheduled = authorized; }
    return order;
  }
  /** Estado de un pedido extraordinario al instante t */
  static pexState(o, t) {
    if (o.noStock && t >= o.authorized) return 'nostock';
    if (t >= o.deliver) return 'delivered';
    if (t >= o.dispatch) return 'enroute';
    if (t >= o.scheduled) return 'scheduled';
    if (t >= o.authorized) return 'authorized';
    if (t >= o.validated) return 'validated';
    return 'proposed';
  }

  /** Parte fija de la prioridad: criticidad (VEN), pacientes afectados, hospital, alternativa disponible */
  reqBase(m) {
    const d = this.demand.get(m.c);
    const altOk = (m.alt || []).some(a => this.byClave.has(a));
    return VEN_W[m.ven || 'E'] + Math.min(25, 2 * d) + (this.unit.hosp ? 10 : 0) - (altOk ? 6 : 0);
  }

  /** Aplica los eventos de un día hasta el instante `until` sobre el estado S (existencias, pendientes, alertas abiertas). */
  process(day, S, until) {
    const stock = S.stock;
    const ent = new Map(), salF = new Map(), salQ = new Map(), neg = new Map();
    let rx = 0, rxFull = 0, rxPart = 0, rxDen = 0, rxNegPz = 0, surg = 0, er = 0, pieces = 0, piecesQ = 0, received = 0;
    const done = [], reqs = [], merma = new Map(), expired = [], filled = [], newPend = [];
    const add = (m, c, v) => m.set(c, (m.get(c) || 0) + v);
    const lots = S.lots;
    // caducados: se retiran al iniciar el día (merma)
    if (S.expDay !== day.idx) {
      S.expDay = day.idx;
      // recetas pendientes con más de 10 días se cancelan (el paciente vuelve a consulta)
      if (S.rxPend) { const lim = day.idx * DAY - 10 * DAY; for (const p of S.rxPend) if (p.t0 < lim) { p.done = true; p.cancelled = true; } S.rxPend = S.rxPend.filter(p => !p.done); }
      for (const [c, arr] of lots) {
        while (arr.length && arr[0].exp < day.idx) {
          const x = arr.shift();
          if (x.q > 0) { stock.set(c, stock.get(c) - x.q); add(merma, c, x.q); expired.push({ c, lot: x.lot, q: x.q, exp: x.exp, day: day.idx }); }
        }
      }
    }
    const pex = [];
    if (this.proactive && S.pexDay !== day.idx && S.pexOpen) { S.pexDay = day.idx; const p = this.proposeOrder(day, S); if (p) pex.push(p); }
    const receive = (e, t) => {
      for (const l of e.lines) if (l.q > 0) {
        stock.set(l.c, stock.get(l.c) + l.q); add(ent, l.c, l.q); received += l.q;
        const arr = lots.get(l.c), same = arr.find(x => x.lot === l.lot);
        if (same) same.q += l.q; else { arr.push({ lot: l.lot, exp: l.exp, q: l.q }); arr.sort((a, b) => a.exp - b.exp); }
      }
      // recetas pendientes: se surten al llegar el medicamento (primero las más antiguas) y se avisa al paciente
      if (S.rxPend?.length) {
        for (const p of S.rxPend) {
          if (p.done) continue;
          const sq = stock.get(p.c); if (sq <= 0) continue;
          const g = Math.min(sq, p.q - p.given);
          if (g <= 0) continue;
          stock.set(p.c, sq - g); p.given += g; add(salF, p.c, g); pieces += g;
          take(p.c, g, { kind: 'rx', folio: p.folio });
          if (p.given >= p.q) { p.done = true; p.notified = t; p.wait = t - p.t0; filled.push(p); }
        }
        S.rxPend = S.rxPend.filter(p => !p.done);
      }
    };
    // salida PEPS por caducidad (primero lo que caduca antes)
    const take = (c, g, e) => {
      const arr = lots.get(c), used = [];
      let n = g;
      while (n > 0 && arr.length) {
        const x = arr[0], k = Math.min(n, x.q);
        x.q -= k; n -= k; used.push([x.lot, k]);
        if (S.lotUse) {
          let u = S.lotUse.get(x.lot);
          if (!u) S.lotUse.set(x.lot, u = { c, salF: 0, salQ: 0, rx: 0, first: day.idx, last: day.idx, folios: [] });
          if (e.kind === 'rx') { u.salF += k; u.rx++; } else u.salQ += k;
          u.last = day.idx; if (u.folios.length < 6) u.folios.push(e.folio); else if (Math.random() < 0) u.folios.shift();
        }
        if (x.q <= 0) arr.shift();
      }
      return used;
    };
    const applyPend = upto => {
      S.pend.sort((a, b) => a.t - b.t);
      while (S.pend.length && S.pend[0].t <= upto) {
        const d = S.pend.shift();
        receive(d, d.t);
        for (const l of d.lines) { if (S.open.get(l.c) === d.req) S.open.delete(l.c); if (S.pexOpen?.get(l.c) === d.req?.id) S.pexOpen.delete(l.c); }
        done.push(d);
      }
    };
    for (const e of day.events) {
      if (e.t > until) break;
      applyPend(e.t);
      if (e.kind === 'in') receive(e, e.t);
      else {
        let full = true;
        e.lots = [];
        e.out = e.lines.map(l => {
          const s = stock.get(l.c), g = Math.min(s, l.q);
          stock.set(l.c, s - g);
          e.lots.push(g > 0 ? take(l.c, g, e) : []);
          if (g < l.q) {
            full = false; add(neg, l.c, l.q - g);
            if (e.kind === 'rx' && S.rxPend) { const p = { folio: e.folio, pac: e.pac, cons: e.cons, c: l.c, q: l.q - g, given: 0, t0: e.t }; S.rxPend.push(p); newPend.push(p); }
          }
          add(e.kind === 'rx' ? salF : salQ, l.c, g);
          if (e.kind === 'rx') pieces += g; else piecesQ += g;
          if (s - g <= 0) { const r = this.request(l.c, e.t, day, S); if (r) { r.trigger = e.folio; reqs.push(r); } }
          return g;
        });
        e.full = full;
        // receta completa: todo surtido · parcial: algo surtido · negada: nada surtido
        if (e.kind === 'rx') {
          rx++;
          if (full) { rxFull++; e.rxState = 'full'; }
          else if (e.out.some(g => g > 0)) { rxPart++; e.rxState = 'part'; } else { rxDen++; e.rxState = 'den'; }
          rxNegPz += e.lines.reduce((n, l, i) => n + (l.q - e.out[i]), 0);
        } else if (e.kind === 'or') surg++; else er++;
      }
      done.push(e);
    }
    applyPend(Math.min(until, (day.idx + 1) * DAY - 1));
    // consumo observado (promedio móvil exponencial, ~14 días): base del punto de reorden dinámico
    if (until >= (day.idx + 1) * DAY - 1 && S.ewma) for (const m of this.items) {
      const c = m.c, y = (salF.get(c) || 0) + (salQ.get(c) || 0) + (neg.get(c) || 0);
      S.ewma.set(c, 0.87 * S.ewma.get(c) + 0.13 * y);
    }
    return { pex, ent, salF, salQ, neg, rx, rxFull, rxPart, rxDen, rxNegPz, surg, er, pieces, piecesQ, received, done, reqs, merma, expired, filled, newPend };
  }

  /** Estado al instante t (segundos de simulación) del día actual. */
  at(t) {
    const S0 = this.startState;
    // copias profundas de lo que process() modifica (solicitudes consolidadas y entregas pendientes)
    const reqMap = new Map();
    const cloneReq = r => { if (!reqMap.has(r)) { const c = { ...r, lines: [...r.lines] }; reqMap.set(r, c); } return reqMap.get(r); };
    const pend = S0.pend.map(x => { const p = { ...x, lines: [...x.lines] }; if (x.req) { p.req = cloneReq(x.req); Object.defineProperty(p.req, 'pendRef', { value: p, enumerable: false, writable: true }); } return p; });
    const S = { stock: new Map(S0.stock), pend, open: new Map([...S0.open].map(([c, r]) => [c, cloneReq(r)])), seq: S0.seq, expDay: S0.expDay,
      rxPend: S0.rxPend.map(x => ({ ...x })), pexOpen: new Map(S0.pexOpen || []), pexDay: S0.pexDay, ewma: S0.ewma,
      lots: new Map([...S0.lots].map(([c, arr]) => [c, arr.map(x => ({ ...x }))])) };
    const r = this.process(this.today, S, t);
    r.stock = S.stock;
    r.lots = S.lots;
    r.open = [...new Set(S.open.values())];
    r.rxPend = S.rxPend;
    // pedidos extraordinarios: los de hoy + los que siguen abiertos (en flujo o en camino)
    const seen = new Set(), list = [];
    for (const x of [...(this.startPex || []), ...r.pex, ...S.pend.filter(p => p.req?.pex).map(p => p.req)]) if (!seen.has(x.id)) { seen.add(x.id); list.push(x); }
    r.pexList = list;
    const dayEnd = (this.todayIdx + 1) * DAY;
    // entregas urgentes de hoy (ya recibidas y en camino), para el andén y el 3D
    r.urgentToday = [...r.done.filter(e => e.kind === 'in' && e.type === 'Urgente'), ...S.pend.filter(p => p.t < dayEnd)];
    r.pending = [...this.today.events.filter(e => e.kind === 'in' && e.t > t), ...S.pend];
    return r;
  }

  /** Estado de una solicitud al instante t */
  static reqState(q, t) {
    if (t >= q.deliver) return 'delivered';
    if (t >= q.dispatch) return 'enroute';
    if (t >= q.validated) return q.transfer ? 'transfer' : 'preparing';
    return 'sent';
  }

  /** Envío del CEDIS a esta unidad en el día idx (para el panel del CEDIS). */
  shipment(idx) {
    this.run(idx);
    return this.today.events.filter(e => e.kind === 'in');
  }

  /** Lotes que caducan en ≤ dias (desde el día idx) */
  expiring(lots, idx, dias = 90) {
    const out = [];
    for (const [c, arr] of lots) for (const x of arr) if (x.q > 0 && x.exp - idx <= dias) out.push({ c, ...x, days: x.exp - idx });
    return out.sort((a, b) => a.days - b.days);
  }

  // Utilidades
  coverage(c, s) { const d = this.demand.get(c); return d > 0 ? s / d : Infinity; }
  status(c, s) {
    if (s <= 0) return 'zero';
    if (s < this.min.get(c)) return 'low';
    if (s > this.max.get(c) * 1.25 + this.byClave.get(c).pack) return 'over';
    return 'ok';
  }
}

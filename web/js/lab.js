// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  lab.js · Laboratorio de experimentos: un "mundo" completo por réplica
//
//  runReplica() corre la red entera con una suerte distinta (réplica r):
//    60 unidades (recetas, quirófano, urgencias, pedidos) + inventario del
//    CEDIS (método de pedido, proveedor) + contratos (penas, cumplimiento)
//  y devuelve los indicadores de los 30 días anteriores al día evaluado.
//  Un "brazo" es una combinación de política, escenario y estrés. Todos
//  los brazos usan las mismas réplicas (números aleatorios comunes): así la
//  diferencia entre brazos se debe a la decisión y no a la suerte.
//  Sin DOM: corre en Web Workers (lab-worker.js) y en Node (tests/lab.test.mjs).
// =====================================================================
import { setScenario, setReplica, setStress, setCedisModel, setProactive, makeCalendar, UnitSupply } from './supply.js';
import { CedisInventory } from './network-sim.js';
import { Contratos, precioDe } from './contratos.js';

const DAY = 86400, WIN = 30;

/** Indicadores que reporta cada réplica. better: hacia dónde es mejor. */
export const METRICS = [
  { id: 'rxCompletas', label: 'Recetas surtidas completas', fmt: 'pct2', better: 'up', group: 'Pacientes', main: true },
  { id: 'rxIncompletas', label: 'Recetas no surtidas completas', fmt: 'int', better: 'down', group: 'Pacientes', main: true },
  { id: 'pzNegadas', label: 'Piezas negadas a pacientes', fmt: 'int', better: 'down', group: 'Pacientes', main: true },
  { id: 'rxNegadas', label: 'Recetas negadas por completo', fmt: 'pct2', better: 'down', group: 'Pacientes' },
  { id: 'urgentes', label: 'Solicitudes de reabasto urgente', fmt: 'int', better: 'down', group: 'Unidades', main: true },
  { id: 'pex', label: 'Pedidos extraordinarios', fmt: 'int', better: 'down', group: 'Unidades' },
  { id: 'mermaUnid', label: 'Merma por caducidad en unidades', fmt: 'money', better: 'down', group: 'Unidades', main: true },
  { id: 'invUnid', label: 'Inventario promedio en unidades', fmt: 'money', better: 'down', group: 'Unidades' },
  { id: 'surtidoCedis', label: 'Surtido del CEDIS a unidades', fmt: 'pct', better: 'up', group: 'CEDIS', main: true },
  { id: 'diasSinExist', label: 'Días-clave sin existencia en CEDIS', fmt: 'int', better: 'down', group: 'CEDIS' },
  { id: 'coberturaCedis', label: 'Cobertura media del CEDIS', fmt: 'days', better: 'none', group: 'CEDIS' },
  { id: 'invCedis', label: 'Inventario promedio en CEDIS', fmt: 'money', better: 'down', group: 'CEDIS', main: true },
  { id: 'cumplimiento', label: 'Cumplimiento de proveedores', fmt: 'pct', better: 'up', group: 'Contratos', main: true },
  { id: 'penas', label: 'Penas devengadas', fmt: 'money', better: 'none', group: 'Contratos' },
  { id: 'gasto', label: 'Gasto recibido (EBA)', fmt: 'money', better: 'none', group: 'Contratos' },
];
export const METRIC = Object.fromEntries(METRICS.map(m => [m.id, m]));

export const POLICY_ES = { minmax: 'Mínimos y máximos', forecast: 'Pronóstico' };
export const SCEN_ES = { normal: 'Operación normal', contingencia: 'Contingencia' };
export function armLabel(a) {
  const st = [];
  if (a.demanda && a.demanda !== 1) st.push(`demanda ${a.demanda > 1 ? '+' : ''}${Math.round((a.demanda - 1) * 100)} %`);
  if (a.fallas && a.fallas !== 1) st.push(`fallas ×${a.fallas}`);
  if (a.retraso) st.push(`+${a.retraso} días de retraso`);
  if (a.pedidoAuto === false) st.push('sin pedido automático');
  return `${POLICY_ES[a.policy]} · ${SCEN_ES[a.scen]}${st.length ? ' · ' + st.join(', ') : ''}`;
}

let CAL = null, CAL_DATA = null;
/**
 * @param job { arm: { policy, scen, demanda, fallas, retraso, pedidoAuto }, rep, day }
 */
export function runReplica(data, cat, job) {
  const { arm, rep, day } = job;
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  setScenario(arm.scen); setReplica(rep); setStress({ demanda: arm.demanda ?? 1, fallas: arm.fallas ?? 1, retraso: arm.retraso ?? 0 });
  setProactive(arm.pedidoAuto !== false);
  const inv = new CedisInventory(data, cat, arm.policy);
  setCedisModel(inv);
  if (CAL_DATA !== data) { CAL = makeCalendar(data); CAL_DATA = data; }
  const price = new Map(cat.items.map(m => [m.c, precioDe(m)]));
  // 60 unidades: últimos 30 días antes de "day"
  let rx = 0, rxFull = 0, rxDen = 0, pzNeg = 0, urg = 0, pex = 0, merma = 0, invU = 0;
  const sRx = new Array(WIN).fill(0), sRxFull = new Array(WIN).fill(0);
  for (const u of data.units) {
    const s = new UnitSupply(u, cat, CAL);
    s.run(day);
    const h = s.hist;
    for (let k = 0; k < h.rx.length; k++) { rx += h.rx[k]; rxFull += h.rxFull[k]; rxDen += h.rxDen[k]; pzNeg += h.rxNegPz[k]; sRx[k] += h.rx[k]; sRxFull[k] += h.rxFull[k]; }
    urg += h.reqs.length; pex += h.pex.length;
    for (const [c, b] of h.byC) {
      const p = price.get(c) || 0;
      for (let k = 0; k < b.merma.length; k++) { merma += b.merma[k] * p; invU += b.stock[k] * p / WIN; }
    }
  }
  // CEDIS
  const ck = inv.kpis(day, WIN);
  let invC = 0, demD = new Array(WIN).fill(0), sentD = new Array(WIN).fill(0);
  for (const [c, s] of inv.series) {
    const p = price.get(c) || 0;
    for (let k = 0; k < WIN; k++) { const i = inv.i(day - WIN + k); invC += s.stock[i] * p / WIN; demD[k] += s.dem[i]; sentD[k] += s.sent[i]; }
  }
  // Contratos
  const K = new Contratos(inv, cat, arm.scen);
  const kk = K.kpis(day - WIN, day - 1, null, day * DAY);
  setReplica(0); setStress();
  return {
    rep, ms: Math.round((typeof performance !== 'undefined' ? performance : Date).now() - t0),
    m: {
      rxCompletas: rx ? rxFull / rx : null, rxIncompletas: rx - rxFull, rxNegadas: rx ? rxDen / rx : null, pzNegadas: pzNeg, urgentes: urg, pex, mermaUnid: merma, invUnid: invU,
      surtidoCedis: ck.fill, diasSinExist: ck.stockoutDays, coberturaCedis: ck.invDays, invCedis: invC,
      cumplimiento: kk.cumplimiento, penas: kk.penasDevengadas, gasto: kk.gasto + kk.gastoRescate,
    },
    s: { rx: sRx.map((n, k) => (n ? sRxFull[k] / n : null)), fill: demD.map((d, k) => (d ? sentD[k] / d : 1)) },
  };
}

// ---------------------------------------------------------------------
//  Estadística
// ---------------------------------------------------------------------
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
// t de Student al 97.5 % para n-1 grados de libertad (aprox. para n pequeñas)
const tCrit = n => (n <= 1 ? NaN : n < 30 ? [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09, 2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.05][n - 2] : 1.96 + 2.4 / n);
export function summary(vals) {
  const v = vals.filter(x => x !== null && x !== undefined && isFinite(x));
  const n = v.length;
  if (!n) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const s = [...v].sort((a, b) => a - b);
  const h = n > 1 ? tCrit(n) * sd / Math.sqrt(n) : NaN;
  return { n, mean, sd, lo: mean - h, hi: mean + h, p5: quantile(s, 0.05), p50: quantile(s, 0.5), p95: quantile(s, 0.95), min: s[0], max: s[n - 1] };
}
/** Diferencia pareada B − A por réplica (mismas réplicas en ambos brazos) */
export function paired(a, b, better) {
  const byRep = new Map(a.map(x => [x.rep, x.v]));
  const d = [];
  for (const x of b) if (byRep.has(x.rep) && x.v !== null && byRep.get(x.rep) !== null) d.push(x.v - byRep.get(x.rep));
  const s = summary(d);
  const wins = better === 'up' ? d.filter(x => x > 0).length : better === 'down' ? d.filter(x => x < 0).length : null;
  return { ...s, pBetter: wins === null || !d.length ? null : wins / d.length, sig: s.n > 1 && (s.lo > 0 || s.hi < 0) };
}

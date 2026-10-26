// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  network-sim.js · Inventario del CEDIS por clave y lote (Fase 2)
//
//  Simula día por día el almacén central con las 60 unidades acopladas:
//    · demanda diaria de la red por clave = suma de la demanda real de las
//      unidades (con temporada respiratoria y ruido diario),
//    · revisión semanal (lunes) con el método de pedido elegido:
//        - "minmax": mínimos y máximos fijos calculados con la demanda
//          planeada (como se hace hoy),
//        - "forecast": pedido = pronóstico Holt-Winters de la demanda
//          observada hasta la llegada + revisión + inventario de seguridad
//          (suggestedOrder de forecast.js),
//    · proveedor con tiempo de entrega por clave y fallas (retraso o
//      entrega parcial); cada arribo es un lote (lotFor),
//    · salida diaria a las unidades; si la existencia no alcanza hasta el
//      próximo arribo, el CEDIS reparte (factor f < 1).
//  El factor f(c, día) se instala en supply.js (setCedisModel) y de ahí
//  salen los faltantes que ven las unidades: ya no hay lista fija.
//  Las fallas del escenario "contingencia" siguen siendo un guion
//  (falla de proveedor) que se respeta aquí.
//  >>> API: con datos reales, las existencias y arribos vienen del WMS
//  del CEDIS y de las órdenes de compra (SAI / compras consolidadas).
// =====================================================================
import { UnitSupply, makeCalendar, lotFor, seasonBump, SEASON_AMP, SCENARIOS, scenario, scriptedShort, mulberry32, setCedisModel, DAY } from './supply.js';
import { forecastSeries, suggestedOrder } from './forecast.js';

export const POLICIES = {
  minmax: { label: 'Mínimos y máximos', hint: 'Mínimo 25 días y máximo 55 días de la demanda planeada; se pide al llegar al mínimo.' },
  forecast: { label: 'Pronóstico', hint: 'Cada lunes: pedido = pronóstico de la demanda observada hasta el arribo + 1 semana + colchón por retrasos del proveedor + inventario de seguridad (95 %). Pedidos más frecuentes y más chicos.' },
};
const START = -200, END = 70;
const HOSP_W = { HGZ: 1.3, 'HGZ/MF': 1.3, HG: 1.3, HGSZ: 1.25, CH: 1.2, 'UMF/H': 1.15 };
const VEN_W = { V: 1.4, E: 1.0, N: 0.7 };
const hashStr = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const gauss = R => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());

let POLICY = 'minmax';
export const policy = () => POLICY;
/** Lee el método de pedido de la URL (?pol=) o del navegador */
export function initPolicy() {
  let p = new URLSearchParams(location.search).get('pol');
  try { if (p) localStorage.setItem('politica', p); else p = localStorage.getItem('politica'); } catch { /* */ }
  POLICY = POLICIES[p] ? p : 'minmax';
  return POLICY;
}
export function switchPolicy(p) {
  try { localStorage.setItem('politica', p); } catch { /* */ }
  const u = new URL(location.href); u.searchParams.set('pol', p); location.href = u.toString();
}

export class CedisInventory {
  /**
   * @param data     assets/unidades_hidalgo.json
   * @param catalog  assets/medicamentos.json
   * @param pol      'minmax' | 'forecast'
   */
  constructor(data, catalog, pol = POLICY) {
    this.data = data; this.catalog = catalog; this.policy = pol; this.scen = scenario();
    const cal = makeCalendar(data);
    this.sups = data.units.map(u => new UnitSupply(u, catalog, cal));
    this.items = catalog.items;
    this.byClave = new Map(this.items.map(m => [m.c, m]));
    this.run();
  }

  /** Demanda planeada y real (piezas/día) de la red por clave */
  bases() {
    const plan = new Map(), real = new Map();
    for (const m of this.items) { plan.set(m.c, 0); real.set(m.c, 0); }
    for (const s of this.sups) {
      for (const m of s.items) {
        plan.set(m.c, plan.get(m.c) + s.demand.get(m.c));
        // la demanda real difiere de la planeada (epidemiología local, ver supply.js trueW)
        const k = m.u === 'F' ? (s.trueW.get(m.c) / s.trueSum) / (m.w / s.wSum) : 1;
        real.set(m.c, real.get(m.c) + s.demand.get(m.c) * k);
      }
    }
    return { plan, real };
  }

  run() {
    const { plan, real } = this.bases();
    const boost = SCENARIOS[this.scen].seasonBoost || 1;
    const F = this.items.filter(m => m.u === 'F'), wF = F.reduce((n, m) => n + m.w, 0);
    const N = END - START + 1;
    this.series = new Map();
    for (const m of this.items) {
      const c = m.c, h = hashStr(c), R = mulberry32(h ^ 0x51ed), Rs = mulberry32(h ^ 0x5eed);
      const L = 10 + (h % 12);                         // tiempo de entrega del proveedor (días)
      const lotQ = Math.max(1, m.pack) * 10;
      const P = plan.get(c), base = real.get(c);
      const mn = P * 25, mx = P * 55;
      const dem = new Float64Array(N), sent = new Float64Array(N), f = new Float64Array(N).fill(1), stock = new Float64Array(N);
      const arrivals = [], orders = [];
      let st = Math.round(P * (28 + (h % 18))), lots = [{ ...lotFor(c, START - 30), q: st, d: START - 30 }];
      const pipe = [];                                  // órdenes abiertas { eta, q }
      for (let i = 0; i < N; i++) {
        const d = START + i;
        // demanda del día
        const bump = seasonBump(d);
        let k = 1;
        if (m.u === 'F') {
          const norm = F.reduce((n, x) => n + x.w * (1 + (SEASON_AMP[x.c] || 0) * boost * (bump - 0.3)), 0) / wF;
          k = (1 + 0.12 * (bump - 0.5)) * (1 + (SEASON_AMP[c] || 0) * boost * (bump - 0.3)) / norm;
        }
        const wd = ((d % 7) + 7) % 7;                   // 0 = lunes
        const wk = wd === 6 ? 0.25 : wd === 5 ? 0.55 : 1.16;
        dem[i] = Math.max(0, base * k * wk * Math.exp(0.14 * gauss(R) - 0.01));
        // arribos del proveedor
        for (let j = pipe.length - 1; j >= 0; j--) if (pipe[j].eta === d) {
          const o = pipe.splice(j, 1)[0];
          if (o.q > 0) { const Lt = lotFor(c, d); lots.push({ ...Lt, q: o.q, d }); st += o.q; arrivals.push({ d, q: o.q, lot: Lt.lot, exp: Lt.exp, late: o.late, part: o.part }); }
        }
        // merma por caducidad
        for (const l of lots) if (l.exp <= d && l.q > 0) { st -= l.q; l.q = 0; }
        lots = lots.filter(l => l.q > 0);
        stock[i] = st;
        // revisión semanal (lunes)
        const sc = scriptedShort(c, d, this.scen, false);
        const supplierDown = sc && d >= sc.from - L && d <= sc.to - 2;
        if (wd === 0 && !supplierDown) {
          const onOrder = pipe.reduce((n, o) => n + o.q, 0);
          let q = 0;
          if (this.policy === 'forecast') {
            const y = Array.from(dem.slice(Math.max(0, i - 35), i));
            if (y.length >= 21) {
              const fc = forecastSeries(y, 70);
              q = suggestedOrder(fc, { stock: st, pending: onOrder, daysToNext: L + 12, cycle: 7 }).qty;
              if (q < base * 2) q = 0;                    // pedido mínimo: 2 días de demanda
            } else if (st + onOrder < mn) q = mx - st - onOrder;
          } else if (st + onOrder <= mn) q = mx - st - onOrder;
          if (q > 0) {
            q = Math.ceil(q / lotQ) * lotQ;
            // desempeño del proveedor (mismo sorteo para la misma clave y fecha en ambos métodos)
            const Rp = mulberry32(h ^ Math.imul(d + 5000, 2654435761)), r = Rp();
            let eta = d + L, part = false, late = false, qq = q;
            if (r > 0.9) { qq = Math.round(q * (0.45 + 0.35 * Rp()) / lotQ) * lotQ; part = true; }
            else if (r > 0.76) { eta += 5 + Math.floor(Rp() * 9); late = true; }
            pipe.push({ eta, q: qq, late, part });
            orders.push({ d, q, eta, qq, late, part });
          }
        }
        // salida a las unidades (con reparto si no alcanza hasta el próximo arribo)
        let fi = 1;
        if (sc) fi = sc.f;
        else if (dem[i] > 0) {
          const next = pipe.length ? Math.min(...pipe.map(o => o.eta)) - d : L + 7;
          // reparto solo si la existencia no cubre ni el 80 % de la demanda hasta el arribo (máx. 10 días)
          const need = dem[i] * Math.max(1, Math.min(next, 10));
          if (st < need * 0.8) fi = Math.max(0, Math.min(1, st / need + 0.15));
          if (st < dem[i] * 0.6) fi = Math.min(fi, st / Math.max(1e-6, dem[i]));
          if (st <= dem[i] * 0.15) fi = 0;
        }
        const out = Math.min(st, dem[i] * fi);
        sent[i] = out; f[i] = dem[i] > 0 ? out / dem[i] : 1;
        if (sc) f[i] = sc.f;
        st -= out;
        // salida PEPS (primero caduca, primero sale)
        let rest = out; lots.sort((a, b) => a.exp - b.exp);
        for (const l of lots) { if (rest <= 0) break; const t = Math.min(l.q, rest); l.q -= t; rest -= t; }
        lots = lots.filter(l => l.q > 0.5);
        if (d >= -60) (this.lotHist ??= new Map()).set(c + '|' + d, lots.map(l => ({ lot: l.lot, exp: l.exp, q: Math.round(l.q), supplier: l.supplier, loc: l.loc, d: l.d })));
      }
      this.series.set(c, { m, L, P, base, mn, mx, dem, sent, f, stock, arrivals, orders, pipeAt: d => orders.filter(o => o.d <= d && o.eta > d && o.qq > 0) });
    }
  }

  i(d) { return Math.max(0, Math.min(END - START, d - START)); }
  /** Factor de surtido del CEDIS (0–1) para la clave c el día d */
  fOf(c, d) { const s = this.series.get(c); return s ? s.f[this.i(d)] : 1; }
  /** Faltante (formato de supply.js) o null */
  short(c, d) {
    const s = this.series.get(c); if (!s) return null;
    const f = s.f[this.i(d)];
    if (f >= 0.95) return null;
    let from = d, to = d;
    while (from > START && s.f[this.i(from - 1)] < 0.95) from--;
    while (to < END && s.f[this.i(to + 1)] < 0.95) to++;
    const f0 = f < 0.05 ? 0 : Math.round(f * 100) / 100;
    // sin existencia varios días: la solicitud queda pendiente hasta el arribo (no hay de dónde transferir)
    return { c, f: f0, from, to, model: true, scen: f0 === 0 && to - from >= 4 };
  }
  shortList(d) { return this.items.map(m => this.short(m.c, d)).filter(Boolean); }

  /** Estado de una clave al inicio del día d */
  row(c, d) {
    const s = this.series.get(c), i = this.i(d);
    const avg = s.dem.slice(Math.max(0, i - 28), i).reduce((a, b) => a + b, 0) / Math.min(28, Math.max(1, i));
    const stock = s.stock[i], onOrder = s.pipeAt(d).reduce((n, o) => n + o.qq, 0);
    const next = s.pipeAt(d).sort((a, b) => a.eta - b.eta)[0] || null;
    const lots = this.lotHist?.get(c + '|' + Math.max(-60, Math.min(END, d - 1))) || [];
    const cover = avg > 0 ? stock / avg : Infinity;
    const level = s.f[i] < 0.05 ? 'zero' : s.f[i] < 0.95 ? 'part' : cover < 10 ? 'low' : cover > 75 ? 'over' : 'ok';
    return { c, m: s.m, stock: Math.round(stock), avg, cover, onOrder, next, lots, f: s.f[i], level, L: s.L, mn: s.mn, mx: s.mx, policy: this.policy };
  }
  rows(d) { return this.items.map(m => this.row(m.c, d)); }

  /** Indicadores de un periodo [d - days, d) */
  kpis(d, days = 90) {
    let dem = 0, sent = 0, stockDays = 0, stockoutDays = 0, partDays = 0, inv = 0, nOrders = 0, late = 0, partial = 0;
    const clavesShort = new Set();
    for (const [c, s] of this.series) {
      for (let x = d - days; x < d; x++) {
        const i = this.i(x);
        dem += s.dem[i]; sent += s.sent[i];
        if (s.f[i] < 0.05) { stockoutDays++; clavesShort.add(c); } else if (s.f[i] < 0.95) { partDays++; clavesShort.add(c); }
        inv += s.stock[i] / Math.max(1e-6, s.base); stockDays++;
      }
      for (const o of s.orders) if (o.d >= d - days && o.d < d) { nOrders++; if (o.late) late++; if (o.part) partial++; }
    }
    return { fill: dem ? sent / dem : 1, stockoutDays, partDays, claves: clavesShort.size, invDays: inv / Math.max(1, stockDays), orders: nOrders, late, partial, days };
  }

  /** Serie diaria de una clave (para gráficas) */
  history(c, d, back = 60, fwd = 0) {
    const s = this.series.get(c), out = [];
    for (let x = d - back; x <= d + fwd; x++) { const i = this.i(x); out.push({ d: x, dem: s.dem[i], sent: s.sent[i], stock: s.stock[i], f: s.f[i] }); }
    return out;
  }

  // ---------------------------------------------------------------
  //  Asignación cuando no alcanza: iguala días de cobertura ponderados.
  //  units: [{ u, stock, demand, pack }]; A = piezas disponibles.
  //  Peso = tipo de unidad (hospital > UMF) × VEN de la clave. Se busca T tal que
  //  Σ max(0, T·w_i·d_i − s_i) = A (llenado por niveles) y se redondea al empaque.
  // ---------------------------------------------------------------
  static allocate(units, A, ven = 'E') {
    const vw = VEN_W[ven] || 1;
    const W = units.map(x => (HOSP_W[x.u.tipo] || 1) * vw);
    const need = T => units.reduce((n, x, i) => n + Math.max(0, T * W[i] * x.demand - x.stock), 0);
    let lo = 0, hi = 1;
    while (need(hi) < A && hi < 365) hi *= 2;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (need(mid) > A) hi = mid; else lo = mid; }
    const T = lo;
    let left = A;
    const rows = units.map((x, i) => {
      let q = Math.max(0, T * W[i] * x.demand - x.stock);
      q = Math.min(left, Math.floor(q / x.pack) * x.pack); left -= q;
      return { ...x, w: W[i], q, before: x.demand > 0 ? x.stock / x.demand : Infinity, after: x.demand > 0 ? (x.stock + q) / x.demand : Infinity };
    });
    // lo que sobra por redondeo va a quien tiene menor cobertura
    for (const r of [...rows].sort((a, b) => a.after - b.after)) { if (left < r.pack) break; r.q += r.pack; left -= r.pack; r.after = (r.stock + r.q) / r.demand; }
    // comparación: reparto proporcional a lo pedido (como se hace hoy)
    const req = rows.map(r => Math.max(0, r.max - r.stock)), sumReq = req.reduce((a, b) => a + b, 0);
    rows.forEach((r, i) => { r.req = req[i]; r.prop = sumReq ? Math.floor(Math.min(req[i], A * req[i] / sumReq) / r.pack) * r.pack : 0; r.afterProp = r.demand > 0 ? (r.stock + r.prop) / r.demand : Infinity; });
    return { T, rows, left };
  }
}

/** Crea el modelo e lo instala en supply.js (llamar antes de correr las unidades) */
export function installInventory(data, catalog) {
  const inv = new CedisInventory(data, catalog, POLICY);
  setCedisModel(inv);
  return inv;
}
export { DAY };

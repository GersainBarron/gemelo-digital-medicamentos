// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  routing.js · Costos de distribución y optimización de rutas
//
//  · Modelo de costos (parámetros editables): $/km, $/hora de chofer, costo
//    fijo por salida, velocidad, descarga por parada, jornada máxima y
//    capacidad de la camioneta (litros).
//  · Línea base: las rutas actuales del CEDIS para un día.
//  · Optimización (mismos días de visita): ahorros de Clarke-Wright con
//    restricciones de capacidad y jornada + mejora 2-opt de cada ruta.
//  · Urgentes: inserción más barata en una ruta del día vs. viaje dedicado.
//  Distancias: haversine × 1.35 (factor carretero). >>> Con datos reales se
//  sustituye por una matriz de distancias por carretera (p. ej. OSRM).
// =====================================================================
import { DAY, MIN, H } from './supply.js';

export const COST = {
  kmCost: 9.5,        // $ por km (combustible + mantenimiento)
  driverHour: 130,    // $ por hora de chofer
  fixedTrip: 350,     // $ por salida (vehículo, seguro, carga)
  speedKmh: 55,       // velocidad promedio
  unloadMin: 20,      // minutos de descarga por parada
  maxHours: 10,       // jornada máxima por ruta
  capacityL: 8000,    // litros útiles de la camioneta
};
// Volumen aproximado por pieza, ya con embalaje de traslado (litros)
export const VOL = { caja: 0.22, frasco: 0.35, inhalador: 0.2, ampolleta: 0.012, bolsa: 0.75, jeringa: 0.03 };

const kmBetween = (a, b) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.35;
};

export class Router {
  /** @param net Network (network.js) */
  constructor(net, params = {}) {
    this.net = net; this.P = { ...COST, ...params };
    this.depot = { lat: net.cedis.lat, lon: net.cedis.lon, nombre: 'CEDIS' };
    this.cache = new Map();
  }
  setParams(p) { Object.assign(this.P, p); this.cache.clear(); }
  km(a, b) { return kmBetween(a, b); }

  /** Carga (litros) de la entrega a la unidad u el día idx */
  loadOf(u, idx) {
    const s = this.net.supOf.get(u);
    let lines = null;
    if (s.todayIdx === idx) lines = s.today.events.find(e => e.kind === 'in' && e.type === 'Ordinaria')?.lines;
    if (lines) return lines.reduce((n, l) => n + l.q * (VOL[s.byClave.get(l.c).pz] || 0.5), 0);
    // estimación: demanda × días del ciclo
    return s.items.reduce((n, m) => n + s.demand.get(m.c) * s.cycle * (VOL[m.pz] || 0.5), 0);
  }

  /** Evalúa una ruta (lista de unidades en orden) */
  evalRoute(seq, idx) {
    const P = this.P;
    let km = 0, prev = this.depot, load = 0;
    for (const u of seq) { km += this.km(prev, u); prev = u; load += this.loadOf(u, idx); }
    km += this.km(prev, this.depot);
    const hours = km / P.speedKmh + seq.length * P.unloadMin / 60;
    const cost = P.fixedTrip + km * P.kmCost + hours * P.driverHour;
    return { seq, km, hours, load, cost, fill: load / P.capacityL, ok: load <= P.capacityL && hours <= P.maxHours };
  }

  /**
   * Rutas actuales del día (línea base). Si la carga de una ruta no cabe en una camioneta o excede la
   * jornada, se reparte en las camionetas necesarias conservando el orden de paradas.
   */
  current(idx) {
    const plan = this.net.cal.dayPlan(idx), out = [];
    for (const tr of plan.trips) {
      const r = this.net.routes[tr.id], stops = tr.stops.map(s => s.unit);
      let part = [], n = 0;
      const flush = () => { if (part.length) { n++; out.push({ id: n > 1 ? `${tr.id}-${n}` : tr.id, name: r.name + (n > 1 ? ` (camioneta ${n})` : ''), color: r.color, ...this.evalRoute(part, idx) }); part = []; } };
      for (const u of stops) {
        const test = this.evalRoute([...part, u], idx);
        if (part.length && !test.ok) flush();
        part.push(u);
      }
      flush();
    }
    return out;
  }

  /** Unidades que reciben entrega el día idx */
  visits(idx) { return this.net.cal.dayPlan(idx).trips.flatMap(tr => tr.stops.map(s => s.unit)); }

  /** Rutas optimizadas para el día idx (Clarke-Wright + 2-opt) */
  optimize(idx) {
    const key = 'o' + idx;
    if (this.cache.has(key)) return this.cache.get(key);
    const P = this.P, nodes = this.visits(idx);
    if (!nodes.length) { this.cache.set(key, []); return []; }
    const load = new Map(nodes.map(u => [u, this.loadOf(u, idx)]));
    // una ruta por unidad; luego se fusionan por ahorro s(i,j) = d(0,i) + d(0,j) − d(i,j)
    let routes = nodes.map(u => [u]);
    const routeOf = new Map(nodes.map((u, i) => [u, routes[i]]));
    const sav = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      sav.push([this.km(this.depot, a) + this.km(this.depot, b) - this.km(a, b), a, b]);
    }
    sav.sort((x, y) => y[0] - x[0]);
    const hoursOf = r => { let km = 0, p = this.depot; for (const u of r) { km += this.km(p, u); p = u; } km += this.km(p, this.depot); return km / P.speedKmh + r.length * P.unloadMin / 60; };
    const loadSum = r => r.reduce((n, u) => n + load.get(u), 0);
    for (const [s, a, b] of sav) {
      if (s <= 0) break;
      const ra = routeOf.get(a), rb = routeOf.get(b);
      if (ra === rb) continue;
      // a y b deben estar en un extremo de su ruta
      const aEnd = ra[ra.length - 1] === a, aStart = ra[0] === a, bEnd = rb[rb.length - 1] === b, bStart = rb[0] === b;
      let merged = null;
      if (aEnd && bStart) merged = [...ra, ...rb];
      else if (bEnd && aStart) merged = [...rb, ...ra];
      else if (aEnd && bEnd) merged = [...ra, ...[...rb].reverse()];
      else if (aStart && bStart) merged = [...[...ra].reverse(), ...rb];
      if (!merged) continue;
      if (loadSum(merged) > P.capacityL || hoursOf(merged) > P.maxHours) continue;
      routes = routes.filter(r => r !== ra && r !== rb); routes.push(merged);
      for (const u of merged) routeOf.set(u, merged);
    }
    // 2-opt
    const twoOpt = r => {
      const len = rr => { let km = 0, p = this.depot; for (const u of rr) { km += this.km(p, u); p = u; } return km + this.km(p, this.depot); };
      let best = r, bestL = len(r), improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) {
          const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
          const l = len(cand);
          if (l < bestL - 1e-6) { best = cand; bestL = l; improved = true; }
        }
      }
      return best;
    };
    const COLORS = ['#2dd4bf', '#60a5fa', '#f5b400', '#a78bfa', '#fb923c', '#a3e635', '#f472b6', '#f87171', '#cbd5e1', '#22d3ee', '#e879f9', '#facc15'];
    const out = routes.map(twoOpt).map((r, i) => ({ id: `O${i + 1}`, name: `Optimizada ${i + 1}`, color: COLORS[i % COLORS.length], ...this.evalRoute(r, idx) }))
      .sort((a, b) => b.km - a.km).map((r, i) => ({ ...r, id: `O${i + 1}`, name: `Optimizada ${i + 1}`, color: COLORS[i % COLORS.length] }));
    this.cache.set(key, out);
    return out;
  }

  /** Totales de un conjunto de rutas */
  totals(routes) {
    const stops = routes.reduce((n, r) => n + r.seq.length, 0);
    const km = routes.reduce((n, r) => n + r.km, 0), hours = routes.reduce((n, r) => n + r.hours, 0), cost = routes.reduce((n, r) => n + r.cost, 0);
    const load = routes.reduce((n, r) => n + r.load, 0);
    return { trips: routes.length, stops, km, hours, cost, load, perStop: stops ? cost / stops : 0, perL: load ? cost / load : 0, fill: routes.length ? load / (routes.length * this.P.capacityL) : 0, bad: routes.filter(r => !r.ok).length };
  }

  /** Comparación de la semana (lunes a domingo) que contiene idx */
  week(idx) {
    const wd = this.net.cal.weekday(idx), monday = idx - ((wd + 6) % 7);
    const days = [];
    for (let d = monday; d < monday + 7; d++) {
      const cur = this.totals(this.current(d)), opt = this.totals(this.optimize(d));
      days.push({ idx: d, cur, opt });
    }
    const sum = k => days.reduce((a, x) => { for (const f of ['trips', 'stops', 'km', 'hours', 'cost', 'load']) a[f] += x[k][f]; return a; }, { trips: 0, stops: 0, km: 0, hours: 0, cost: 0, load: 0 });
    return { days, cur: sum('cur'), opt: sum('opt') };
  }

  /**
   * Urgentes del día: insertar en una ruta optimizada del día vs. viaje dedicado.
   * Factible si la ruta pasaría por la unidad antes del límite de entrega.
   */
  urgentPlan(idx, reqs, units) {
    const P = this.P, routes = this.optimize(idx), out = [];
    for (const { r, u } of reqs) {
      const dedicated = this.evalRoute([u], idx);
      const dedCost = P.fixedTrip + dedicated.km * P.kmCost + dedicated.hours * P.driverHour;
      let best = null;
      for (const rt of routes) {
        for (let i = 0; i <= rt.seq.length; i++) {
          const a = i === 0 ? this.depot : rt.seq[i - 1], b = i === rt.seq.length ? this.depot : rt.seq[i];
          const extra = this.km(a, u) + this.km(u, b) - this.km(a, b);
          // hora estimada de paso (salida 07:00 + recorrido hasta a)
          let km = 0, p = this.depot; for (let k = 0; k < i; k++) { km += this.km(p, rt.seq[k]); p = rt.seq[k]; }
          const eta = idx * DAY + 7 * H + (km / P.speedKmh + i * P.unloadMin / 60) * H + (this.km(a, u) / P.speedKmh) * H;
          const ok = eta <= r.deadline && eta >= r.t0;
          const cost = extra * P.kmCost + (extra / P.speedKmh + P.unloadMin / 60) * P.driverHour;
          if (ok && (!best || cost < best.cost)) best = { route: rt, pos: i, extra, cost, eta };
        }
      }
      out.push({ r, u, dedicated: dedCost, insert: best, save: best ? dedCost - best.cost : 0 });
    }
    return out;
  }
}

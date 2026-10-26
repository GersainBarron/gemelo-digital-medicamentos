// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  lastmile.js · Última milla al paciente (fase 4)
//
//  Cuando llega el medicamento de una receta pendiente (supply.js → filled),
//  la unidad avisa al paciente y le entrega por una de tres vías:
//    · ventanilla: el paciente regresa a la unidad (lo de hoy),
//    · casillero 24 h / punto de recolección: el medicamento se deja en un
//      casillero de la unidad o en un punto aliado cercano y el paciente
//      recoge con un código QR, sin fila,
//    · domicilio: ruta de reparto en moto desde la unidad (2 salidas al día),
//      optimizada con ahorros de Clarke-Wright + 2-opt; comprobante QR + firma.
//  Reglas: los controlados (estupefacientes) solo se entregan en ventanilla;
//  la red fría va a domicilio en hielera o en ventanilla, no en casillero.
//  Línea base (sin última milla): todos regresan a ventanilla; parte de los
//  pacientes tarda días o no regresa (abandono).
//  Ubicaciones de pacientes simuladas alrededor de la unidad.
//  >>> API: con datos reales, domicilios del expediente (con consentimiento),
//  avisos por SMS/WhatsApp y comprobante en la app del repartidor.
// =====================================================================
import { mulberry32, DAY, H, MIN } from './supply.js';

export const LM_COST = { kmCost: 3.2, riderHour: 95, fixedTrip: 60, speedKmh: 28, serviceMin: 6, maxHours: 4, capacity: 18, lockerCost: 9, pickupCost: 0 };
export const MODES = { ventanilla: 'Ventanilla', casillero: 'Casillero 24 h', punto: 'Punto aliado', domicilio: 'Domicilio' };
const SLOTS = [10, 15.5];                 // salidas de la moto
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const kmBetween = (a, b) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.4;
};

/** Rutas desde un depósito: ahorros de Clarke-Wright con capacidad (paradas) y jornada, más 2-opt. */
export function cwRoutes(depot, stops, P) {
  if (!stops.length) return [];
  const km = kmBetween;
  let routes = stops.map(s => [s]);
  const routeOf = new Map(stops.map((s, i) => [s, routes[i]]));
  const hours = r => { let d = 0, p = depot; for (const s of r) { d += km(p, s); p = s; } d += km(p, depot); return d / P.speedKmh + r.length * P.serviceMin / 60; };
  const sav = [];
  for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) sav.push([km(depot, stops[i]) + km(depot, stops[j]) - km(stops[i], stops[j]), stops[i], stops[j]]);
  sav.sort((a, b) => b[0] - a[0]);
  for (const [s, a, b] of sav) {
    if (s <= 0) break;
    const ra = routeOf.get(a), rb = routeOf.get(b);
    if (ra === rb) continue;
    let m = null;
    if (ra.at(-1) === a && rb[0] === b) m = [...ra, ...rb];
    else if (rb.at(-1) === b && ra[0] === a) m = [...rb, ...ra];
    else if (ra.at(-1) === a && rb.at(-1) === b) m = [...ra, ...[...rb].reverse()];
    else if (ra[0] === a && rb[0] === b) m = [...[...ra].reverse(), ...rb];
    if (!m || m.length > P.capacity || hours(m) > P.maxHours) continue;
    routes = routes.filter(r => r !== ra && r !== rb); routes.push(m);
    for (const x of m) routeOf.set(x, m);
  }
  const len = r => { let d = 0, p = depot; for (const s of r) { d += km(p, s); p = s; } return d + km(p, depot); };
  return routes.map(r => {
    let best = r, bl = len(r), imp = true;
    while (imp) { imp = false; for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) { const c = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)]; const l = len(c); if (l < bl - 1e-6) { best = c; bl = l; imp = true; } } }
    const h = hours(best);
    return { seq: best, km: bl, hours: h, cost: P.fixedTrip + bl * P.kmCost + h * P.riderHour };
  });
}

export class LastMile {
  /** @param sup UnitSupply ya corrida (run) */
  constructor(sup, params = {}) {
    this.sup = sup; this.u = sup.unit; this.P = { ...LM_COST, ...params };
    this.depot = { lat: this.u.lat, lon: this.u.lon };
    const rural = /CAF|CMCT/.test(this.u.tipo) || this.u.km > 40;
    this.radius = rural ? 9 : 5;
    const R = mulberry32(hashStr(this.u.clues) ^ 0xa11);
    // puntos aliados (farmacia o módulo comunitario) a 2–4 km
    this.points = [0, 1].map(k => {
      const a = R() * 2 * Math.PI, d = (2 + R() * 2) / 111;
      return { id: `PA-${k + 1}`, name: k ? 'Módulo comunitario' : 'Farmacia aliada', lat: this.u.lat + d * Math.cos(a), lon: this.u.lon + d * Math.sin(a) / Math.cos(this.u.lat * Math.PI / 180) };
    });
    this.cache = new Map();
  }

  /** Paciente simulado de una receta: domicilio, perfil y preferencia */
  patient(folio, pac) {
    const R = mulberry32(hashStr(folio + '|' + pac));
    const a = R() * 2 * Math.PI, d = (0.4 + this.radius * Math.sqrt(R())) / 111;
    const age = 25 + Math.floor(R() * 60), mobility = age > 70 || R() < 0.12;
    return { folio, pac, lat: this.u.lat + d * Math.cos(a), lon: this.u.lon + d * Math.sin(a) / Math.cos(this.u.lat * Math.PI / 180),
      age, mobility, pref: R(), returnDays: 0.3 + R() * R() * 5, noShow: R() < 0.12 + (mobility ? 0.1 : 0), pickLag: 0.15 + R() * 1.6 };
  }

  /**
   * Receta resurtible de paciente crónico inscrito en entrega programada (~22 % de las recetas
   * con solo claves crónicas): se prepara en farmacia y no hace fila; va a domicilio, casillero o punto.
   */
  enrolled(e) {
    if (e.kind !== 'rx' || !e.lines.length) return false;
    const cat = this.sup.byClave;
    if (!e.lines.every(l => cat.get(l.c)?.chron && !cat.get(l.c)?.ctrl)) return false;
    return hashStr(e.folio) % 100 < 22;
  }
  /** Recetas resurtibles de los días [d0, d1] (eventos deterministas de supply.js) */
  refills(d0, d1, todayDone = null) {
    const out = [];
    for (let d = d0; d <= d1; d++) {
      const evs = d === this.sup.todayIdx && todayDone ? todayDone : this.sup.generateDay(d);
      for (const e of evs) if (this.enrolled(e)) out.push({ kind: 'resurtible', folio: e.folio, pac: e.pac, t0: e.t, ready: e.t + 20 * MIN, lines: e.lines.map((l, i) => ({ c: l.c, q: e.out ? e.out[i] : l.q })).filter(l => l.q > 0) });
    }
    return out.filter(o => o.lines.length);
  }
  /** Entregas a pacientes: recetas pendientes ya surtidas (por folio) + resurtibles inscritas */
  orders(filled, refills = []) {
    const by = new Map();
    for (const p of filled) {
      const k = p.folio;
      if (!by.has(k)) by.set(k, { kind: 'pendiente', folio: k, pac: p.pac, t0: p.t0, ready: p.notified, lines: [] });
      const o = by.get(k); o.ready = Math.max(o.ready, p.notified); o.lines.push({ c: p.c, q: p.q });
    }
    const cat = this.sup.byClave;
    return [...by.values(), ...refills].map(o => {
      const pt = this.patient(o.folio, o.pac);
      const ctrl = o.lines.some(l => cat.get(l.c)?.ctrl), cold = o.lines.some(l => cat.get(l.c)?.frio);
      // vía de entrega: controlados → ventanilla; movilidad reducida → domicilio; el resto según preferencia
      let mode = ctrl ? 'ventanilla' : pt.mobility || pt.pref < 0.38 ? 'domicilio' : pt.pref < 0.6 ? (cold ? 'domicilio' : 'casillero') : pt.pref < 0.75 ? (cold ? 'domicilio' : 'punto') : (o.kind === 'resurtible' ? (cold ? 'domicilio' : 'casillero') : 'ventanilla');
      return { ...o, pt, ctrl, cold, mode };
    });
  }

  /** Programa las entregas: rutas por salida y horas de entrega/recolección */
  plan(filled, refills = []) {
    const key = filled.length + '|' + (filled.at(-1)?.folio || '') + '|' + refills.length;
    if (this.cache.has(key)) return this.cache.get(key);
    const orders = this.orders(filled, refills), P = this.P, routes = [];
    // agrupa los domicilios (y el abasto de puntos aliados) por salida: lo listo 1 h antes de la salida
    const home = orders.filter(o => o.mode === 'domicilio' || o.mode === 'punto');
    const slotOf = t => { const d = Math.floor(t / DAY); for (let k = 0; k < 6; k++) { const dd = d + Math.floor(k / 2), s = dd * DAY + SLOTS[k % 2] * H; if (s >= t + H && this.sup.cal.weekday(dd) !== 0) return s; } return t + DAY; };
    const groups = new Map();
    for (const o of home) { const s = slotOf(o.ready); o.slot = s; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(o); }
    for (const [s, list] of [...groups].sort((a, b) => a[0] - b[0])) {
      const stops = [];
      for (const o of list) {
        if (o.mode === 'domicilio') stops.push({ lat: o.pt.lat, lon: o.pt.lon, kind: 'home', orders: [o] });
        else { const p = this.points[hashStr(o.folio) % 2]; let st = stops.find(x => x.point === p); if (!st) stops.push(st = { lat: p.lat, lon: p.lon, kind: 'point', point: p, orders: [] }); st.orders.push(o); }
      }
      const rs = cwRoutes(this.depot, stops, P);
      rs.forEach((r, i) => {
        const id = `${Math.floor(s / DAY)}-${SLOTS.indexOf((s % DAY) / H) + 1}${rs.length > 1 ? String.fromCharCode(97 + i) : ''}`;
        let t = s + i * 15 * MIN, prev = this.depot;
        const legs = [];
        for (const st of r.seq) {
          t += kmBetween(prev, st) / P.speedKmh * H; prev = st;
          legs.push({ st, t });
          for (const o of st.orders) { o.route = id; o.eta = t; }
          t += P.serviceMin * MIN;
        }
        const back = t + kmBetween(prev, this.depot) / P.speedKmh * H;
        routes.push({ id, start: s + i * 15 * MIN, end: back, legs, ...r, stopsN: r.seq.length, orders: r.seq.reduce((n, x) => n + x.orders.length, 0) });
      });
    }
    // momentos de entrega y línea base
    for (const o of orders) {
      const pt = o.pt;
      // sin última milla: la pendiente espera a que el paciente regrese; la resurtible hace fila en ventanilla
      o.base = o.kind === 'resurtible' ? o.t0 : pt.noShow ? null : o.ready + pt.returnDays * DAY;
      o.tripKm = 2 * kmBetween(this.depot, pt); o.tripH = o.tripKm / 22 + 0.75;            // ida y vuelta + espera en farmacia
      if (o.mode === 'domicilio') { o.done = o.eta; o.how = 'QR + firma del paciente'; o.cost = 0; }
      else if (o.mode === 'punto') { o.done = o.eta + pt.pickLag * DAY; o.how = 'QR en punto aliado'; }
      else if (o.mode === 'casillero') { o.done = o.ready + 30 * MIN + pt.pickLag * DAY; o.how = 'QR en casillero'; o.cost = P.lockerCost; }
      else { o.done = o.base; o.how = 'Ventanilla (identificación)'; o.cost = 0; }
      if (o.mode === 'ventanilla' && pt.noShow) o.abandoned = true;
      o.qr = `RX:${o.folio}|CLUES:${this.u.clues}|PAC:${o.pac}|${o.lines.map(l => `${l.c}x${l.q}`).join(',')}`;
    }
    // costo por entrega a domicilio = costo de su ruta / pedidos de la ruta
    for (const r of routes) for (const lg of r.legs) for (const o of lg.st.orders) o.cost = r.cost / Math.max(1, r.orders);
    const out = { orders, routes };
    this.cache.set(key, out);
    return out;
  }

  static state(o, t) {
    if (o.abandoned) return t > o.ready + 10 * DAY ? 'abandoned' : 'waiting';
    if (o.done != null && t >= o.done) return 'delivered';
    if (o.mode === 'domicilio' || o.mode === 'punto') {
      if (t >= o.eta) return 'atpoint';
      if (o.slot != null && t >= o.slot) return 'enroute';
    }
    if (o.mode === 'casillero' && t >= o.ready + 30 * MIN) return 'atpoint';
    return 'ready';
  }

  /** Indicadores de un conjunto de entregas hasta t */
  kpis(orders, routes, t) {
    const done = orders.filter(o => o.done != null && o.done <= t);
    const lm = done.filter(o => o.mode !== 'ventanilla');
    const in24 = done.length ? done.filter(o => o.done - o.ready <= DAY).length / done.length : 1;
    const homeCost = routes.filter(r => r.end <= t);
    const cHome = homeCost.reduce((n, r) => n + r.cost, 0), nHome = homeCost.reduce((n, r) => n + r.orders, 0);
    // días de espera evitados: (regreso a ventanilla sin última milla) − (entrega real)
    let saved = 0, rescued = 0, visits = 0, hours = 0, pkm = 0;
    for (const o of lm) {
      if (o.kind === 'pendiente') { if (o.base == null) rescued++; else saved += Math.max(0, (o.base - o.done) / DAY); }
      // visitas evitadas: domicilio evita el viaje; casillero/punto evita la fila (y el punto, casi todo el viaje)
      if (o.mode === 'domicilio') { visits++; hours += o.tripH; pkm += o.tripKm; }
      else if (o.mode === 'casillero') hours += 0.75;
      else if (o.mode === 'punto') { visits++; hours += o.tripH * 0.6; pkm += o.tripKm * 0.6; }
    }
    const base = orders.filter(o => o.ready <= t && o.kind === 'pendiente');
    return {
      n: done.length, byMode: Object.fromEntries(Object.keys(MODES).map(k => [k, done.filter(o => o.mode === k).length])),
      in24, perHome: nHome ? cHome / nHome : 0, routes: homeCost.length, km: homeCost.reduce((n, r) => n + r.km, 0),
      saved, rescued, visits, hours, pkm, pend: done.filter(o => o.kind === 'pendiente').length, refill: done.filter(o => o.kind === 'resurtible').length, abandonedBase: base.filter(o => o.pt.noShow).length, abandoned: base.filter(o => o.abandoned && t > o.ready + 10 * DAY).length,
      avgWait: done.length ? done.reduce((n, o) => n + (o.done - o.ready), 0) / done.length / DAY : 0,
      avgWaitBase: base.filter(o => o.base != null).length ? base.filter(o => o.base != null).reduce((n, o) => n + (o.base - o.ready), 0) / base.filter(o => o.base != null).length / DAY : 0,
    };
  }
}
export { kmBetween, DAY, H, MIN };

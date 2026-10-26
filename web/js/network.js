// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  network.js · Red estatal: CEDIS + 60 unidades (datos simulados)
//  Reúne la simulación de abasto de todas las unidades (supply.js) y las
//  rutas del CEDIS para calcular, en cualquier instante:
//    · el semáforo de abasto de cada unidad,
//    · la posición de cada camioneta (ruta ordinaria o reabasto urgente),
//    · totales estatales.
// =====================================================================
import { UnitSupply, makeCalendar, lotFor, lotByCode, cedisShortList, DAY, MIN, H } from './supply.js';

export class Network {
  constructor(data, catalog) {
    this.data = data; this.catalog = catalog;
    this.cal = makeCalendar(data);
    this.units = data.units; this.routes = data.routes; this.cedis = data.cedis;
    this.sups = this.units.map(u => new UnitSupply(u, catalog, this.cal));
    this.supOf = new Map(this.sups.map(s => [s.unit, s]));
    this.byClues = new Map(this.units.map(u => [u.clues, u]));
    this.day = null;
  }

  /** Corre la historia de las 60 unidades en bloques (no traba la página). */
  prepare(idx, onProgress) {
    this.day = idx;
    return new Promise(resolve => {
      let i = 0;
      const step = () => {
        const t0 = performance.now();
        while (i < this.sups.length && performance.now() - t0 < 14) this.sups[i++].run(idx);
        onProgress?.(i / this.sups.length);
        if (i < this.sups.length) setTimeout(step, 0); else resolve();
      };
      step();
    });
  }

  /** Estado de toda la red en el instante t */
  snapshot(t) {
    const units = this.sups.map(s => {
      const st = s.at(t);
      let ok = 0; const zeros = [], low = [];
      for (const m of s.items) {
        const q = st.stock.get(m.c), k = s.status(m.c, q);
        if (k === 'ok' || k === 'over') ok++;
        else if (k === 'zero') zeros.push(m); else low.push(m);
      }
      const abasto = ok / s.items.length;
      const open = st.open;
      const serious = open.some(r => r.level <= 2);
      const level = (zeros.length >= 3 || serious || abasto < 0.8) ? 'crit' : (zeros.length || open.length || abasto < 0.92) ? 'warn' : 'ok';
      const expiring = s.expiring(st.lots, Math.floor(t / DAY), 90);
      return { u: s.unit, s, st, abasto, zeros, low, open, level, expiring };
    });
    const by = new Map(units.map(x => [x.u, x]));
    const totals = {
      ok: units.filter(x => x.level === 'ok').length, warn: units.filter(x => x.level === 'warn').length, crit: units.filter(x => x.level === 'crit').length,
      zeros: units.reduce((n, x) => n + x.zeros.length, 0), open: units.reduce((n, x) => n + x.open.length, 0),
      abasto: units.reduce((n, x) => n + x.abasto * x.s.items.length, 0) / units.reduce((n, x) => n + x.s.items.length, 0),
      rx: units.reduce((n, x) => n + x.st.rx, 0), rxFull: units.reduce((n, x) => n + x.st.rxFull, 0),
      expPz: units.reduce((n, x) => n + x.expiring.reduce((a, l) => a + l.q, 0), 0),
      exp30: units.reduce((n, x) => n + x.expiring.filter(l => l.days <= 30).length, 0),
    };
    return { t, units, by, totals };
  }

  /** Camionetas: rutas ordinarias de hoy y reabastos urgentes en camino */
  vans(t, snap) {
    const idx = Math.floor(t / DAY), plan = this.cal.dayPlan(idx);
    const C = [this.cedis.lon, this.cedis.lat];
    const P = u => [u.lon, u.lat];
    const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const out = [];
    for (const tr of plan.trips) {
      const r = this.routes[tr.id];
      const base = { id: tr.id, kind: 'route', vehicle: r.vehicle, color: r.color, route: r, trip: tr };
      if (t < tr.depart - 15 * MIN) { out.push({ ...base, state: 'scheduled', pos: C, next: tr.stops[0] }); continue; }
      if (t > tr.end) { out.push({ ...base, state: 'done', pos: C }); continue; }
      if (t < tr.depart) { out.push({ ...base, state: 'loading', pos: C, next: tr.stops[0] }); continue; }
      let prevT = tr.depart, prevP = C, v = null;
      for (const s of tr.stops) {
        if (t < s.actual) { v = { ...base, state: 'enroute', pos: lerp(prevP, P(s.unit), (t - prevT) / Math.max(1, s.actual - prevT)), next: s }; break; }
        if (t < s.actual + 20 * MIN) { v = { ...base, state: 'unloading', pos: P(s.unit), next: s }; break; }
        prevT = s.actual + 20 * MIN; prevP = P(s.unit);
      }
      if (!v) v = { ...base, state: 'returning', pos: lerp(prevP, C, (t - prevT) / Math.max(1, tr.end - prevT)) };
      out.push(v);
    }
    // urgentes: del CEDIS a la unidad entre la salida y la entrega
    for (const x of snap.units) {
      const reqs = new Map([...x.open, ...x.st.reqs].map(r => [r.id, r]));
      for (const r of reqs.values()) {
        if (t < r.dispatch || t > r.deliver + 15 * MIN) continue;
        const k = Math.min(1, (t - r.dispatch) / Math.max(1, r.deliver - r.dispatch));
        out.push({ id: r.id, kind: 'urgent', vehicle: r.transfer ? 'Transferencia' : 'Urgente', color: '#f87171', req: r, unit: x.u,
          state: t >= r.deliver ? 'unloading' : 'enroute', pos: lerp(C, P(x.u), k), level: r.level });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------
  //  Trazabilidad
  // ---------------------------------------------------------------
  /** Recorrido completo de un lote: proveedor → CEDIS → unidades → pacientes */
  traceLot(code, snap) {
    const L = lotByCode(code, this.catalog);
    if (!L) return null;
    const item = this.catalog.items.find(m => m.c === L.c);
    const deliveries = [], usage = [], stock = [], expired = [];
    for (const x of snap.units) {
      const s = x.s;
      if (!s.byClave.has(L.c)) continue;
      const ins = [...s.hist.deliveries, ...x.st.done.filter(e => e.kind === 'in')];
      for (const e of ins) for (const l of e.lines) if (l.lot === L.lot && l.q > 0) deliveries.push({ u: x.u, t: e.t, q: l.q, type: e.type, route: e.route, level: e.level, req: e.req?.id });
      const hu = s.lotUse.get(L.lot);
      let salF = hu?.salF || 0, salQ = hu?.salQ || 0, rx = hu?.rx || 0; const folios = [...(hu?.folios || [])];
      for (const e of x.st.done) {
        if (!e.lots) continue;
        e.lots.forEach(arr => arr.forEach(([lot, q]) => { if (lot === L.lot) { if (e.kind === 'rx') { salF += q; rx++; } else salQ += q; if (folios.length < 8) folios.push(e.folio); } }));
      }
      if (salF || salQ) usage.push({ u: x.u, salF, salQ, rx, folios });
      const q = (x.st.lots.get(L.c) || []).find(l => l.lot === L.lot)?.q || 0;
      if (q > 0) stock.push({ u: x.u, q });
      for (const ex of s.hist.expired) if (ex.lot === L.lot) expired.push({ u: x.u, ...ex });
    }
    deliveries.sort((a, b) => a.t - b.t);
    return { L, item, deliveries, usage, stock, expired };
  }
  /** Busca una receta o vale de hoy por folio */
  findFolio(folio, snap) {
    const f = folio.trim().toUpperCase();
    for (const x of snap.units) for (const e of x.st.done) if (e.folio && e.folio.toUpperCase() === f) return { u: x.u, e, s: x.s };
    return null;
  }
  /** Lotes vigentes de una clave en la red */
  lotsOfClave(c, snap) {
    const map = new Map();
    for (const x of snap.units) for (const l of (x.st.lots.get(c) || [])) if (l.q > 0) {
      const m = map.get(l.lot) || { lot: l.lot, exp: l.exp, q: 0, units: 0 }; m.q += l.q; m.units++; map.set(l.lot, m);
    }
    return [...map.values()].sort((a, b) => a.exp - b.exp);
  }

  // ---------------------------------------------------------------
  //  Redistribución entre unidades
  // ---------------------------------------------------------------
  km(a, b) {
    const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * 1.35;         // factor carretero
  }
  /**
   * Sugiere transferencias entre unidades:
   *  · "Cubre faltante": de una unidad con excedente a otra en cero / bajo mínimo / con alerta abierta.
   *  · "Evita caducidad": lote que la unidad no alcanzará a consumir antes de caducar → a quien sí lo consume.
   * Prioriza distancia corta y misma ruta. Las transferencias no alteran la simulación (son sugerencias).
   */
  suggestions(snap) {
    if (snap._sug) return snap._sug;
    const idx = Math.floor(snap.t / DAY), out = [];
    const daysToNext = x => { const s = x.s; const todayIn = x.st.pending.some(e => e.type === 'Ordinaria'); return todayIn ? 0.3 : s.nextDelivery === null ? 14 : s.nextDelivery - idx; };
    for (const m of this.catalog.items) {
      const rows = snap.units.filter(x => x.s.byClave.has(m.c)).map(x => {
        const d = x.s.demand.get(m.c), q = x.st.stock.get(m.c), dn = daysToNext(x);
        const open = x.open.find(r => r.c === m.c && r.deliver > snap.t + 2 * H);
        return { x, d, q, dn, open, status: x.s.status(m.c, q) };
      });
      // receptores
      // receptores: en cero, con alerta abierta o que se quedarán sin existencia antes de su próxima entrega
      const needs = rows.filter(r => r.status === 'zero' || r.open || (r.status === 'low' && r.q < r.d * r.dn)).map(r => ({ ...r, need: Math.max(m.pack, Math.ceil(r.d * (r.dn + 3) - r.q)) }));
      // donantes: excedente sobre lo que necesitan hasta su próxima entrega + 5 días
      const donors = rows.map(r => ({ ...r, spare: Math.floor(r.q - r.d * (r.dn + 5)) })).filter(r => r.spare >= Math.max(m.pack, r.d * 2));
      for (const n of needs.sort((a, b) => (a.status === 'zero' ? 0 : 1) - (b.status === 'zero' ? 0 : 1))) {
        let rest = n.need;
        const cands = donors.filter(dn => dn.x !== n.x && dn.spare > 0).map(dn => ({ dn, km: this.km(dn.x.u, n.x.u) + (dn.x.u.ruta === n.x.u.ruta ? 0 : 15) })).sort((a, b) => a.km - b.km);
        for (const { dn, km } of cands) {
          if (rest <= 0 || km > 100) break;
          const q = Math.min(rest, dn.spare);
          const qq = Math.floor(q / m.pack) * m.pack || (dn.spare >= m.pack ? m.pack : 0);
          if (qq <= 0) continue;
          dn.spare -= qq; rest -= qq;
          out.push({ kind: 'faltante', m, from: dn.x.u, to: n.x.u, q: qq, km: this.km(dn.x.u, n.x.u), alert: n.open?.id || null, toStock: n.q, toStatus: n.status,
            gain: n.d > 0 ? qq / n.d : 0, prio: (n.open ? 0 : n.status === 'zero' ? 1 : 2) });
        }
      }
      // lotes en riesgo de caducar
      for (const r of rows) {
        for (const l of (r.x.st.lots.get(m.c) || [])) {
          const days = l.exp - idx;
          if (days > 120 || l.q <= 0) continue;
          const risk = Math.floor(l.q - r.d * Math.max(0, days) * 0.6);   // 0.6: margen por variación del consumo
          if (risk < 3) continue;
          // a quien sí alcance a consumirlo antes de que caduque (capacidad = consumo esperado − existencia)
          const best = rows.filter(o => o.x !== r.x).map(o => ({ o, cap: Math.floor(o.d * Math.max(1, days) * 0.8 - o.q), km: this.km(r.x.u, o.x.u) }))
            .filter(c => c.cap >= Math.min(risk, 3)).sort((a, b) => (b.cap >= risk) - (a.cap >= risk) || a.km - b.km)[0];
          if (!best) continue;
          const qq = Math.min(risk, best.cap);
          out.push({ kind: 'caducidad', m, from: r.x.u, to: best.o.x.u, q: qq, km: best.km, lot: l.lot, exp: l.exp, days, gain: best.o.d > 0 ? qq / best.o.d : 0, prio: days <= 30 ? 1.5 : 3 });
        }
      }
    }
    out.sort((a, b) => a.prio - b.prio || a.km - b.km);
    out.forEach((s, i) => { s.id = `TR-${String(i + 1).padStart(3, '0')}`; });
    snap._sug = out;
    return out;
  }

  // ---------------------------------------------------------------
  //  Diagnóstico de desabasto
  //   · local: pocas unidades sin la clave y el CEDIS sí tiene → transferir / urgente
  //   · de red: el CEDIS no tiene o muchas unidades están en cero → escalar a compras
  //   · contingencia (masivo): muchas claves de red o muchas unidades con 3+ claves en cero
  // ---------------------------------------------------------------
  shortage(snap) {
    if (snap._short) return snap._short;
    const idx = Math.floor(snap.t / DAY);
    const cedis = new Map(cedisShortList(idx).map(x => [x.c, x]));
    const order = [...snap.units].sort((a, b) => a.u.ruta.localeCompare(b.u.ruta) || a.u.min - b.u.min);
    const rows = [];
    for (const m of this.catalog.items) {
      const carry = order.filter(x => x.s.byClave.has(m.c));
      const zeros = carry.filter(x => x.st.stock.get(m.c) <= 0), low = carry.filter(x => { const q = x.st.stock.get(m.c); return q > 0 && x.s.status(m.c, q) === 'low'; });
      const cs = cedis.get(m.c) || null;
      if (!zeros.length && !low.length && !cs) continue;
      const share = carry.length ? zeros.length / carry.length : 0;
      const kind = (cs && cs.f < 0.5) || zeros.length >= Math.max(3, 0.2 * carry.length) ? 'red' : zeros.length ? 'local' : 'riesgo';
      const pending = carry.reduce((n, x) => n + (x.st.rxPend || []).filter(p => p.c === m.c).length, 0);
      const action = kind === 'red'
        ? (cs ? (cs.f === 0 ? 'CEDIS sin existencia: escalar a compras (compra emergente u otro proveedor), activar alternativas y surtido para 7 días' : `CEDIS con ${Math.round(cs.f * 100)} %: repartir lo disponible con prioridad a hospitales y claves vitales; escalar a compras`)
          : 'Muchas unidades en cero con existencia en CEDIS: revisar pedidos y rutas (falla de distribución, no de compra)')
        : kind === 'local' ? 'Transferir desde unidades vecinas (ver Redistribución) o reabasto urgente desde CEDIS'
        : 'Vigilar: unidades bajo mínimo';
      rows.push({ m, carry, zeros, low, cs, share, kind, pending, action });
    }
    const red = rows.filter(r => r.kind === 'red'), local = rows.filter(r => r.kind === 'local');
    const multi = snap.units.filter(x => x.zeros.length >= 3).length;
    const state = red.length >= 5 || multi >= 0.1 * snap.units.length ? 'contingencia' : red.length ? 'red' : local.length ? 'local' : 'normal';
    const rank = { red: 0, local: 1, riesgo: 2 };
    rows.sort((a, b) => rank[a.kind] - rank[b.kind] || b.zeros.length - a.zeros.length || b.low.length - a.low.length);
    snap._short = { rows, red, local, multi, state, order, idx };
    return snap._short;
  }

  /** Envío (líneas) de la entrega ordinaria de hoy para una unidad */
  shipmentOf(u) { return this.supOf.get(u).today.events.find(e => e.kind === 'in'); }
}

export { DAY, MIN, H };

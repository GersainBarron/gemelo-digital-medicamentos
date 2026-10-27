// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  nacional-sim.js · Abasto del CENADI a los 32 estados (30 días, paso de 1 h)
//
//  · Cada estado tiene un almacén delegacional que consume según su red de
//    unidades ISSSTE (CLUES ago 2026, ponderadas por nivel de atención).
//  · El CENADI embarca a cada estado en días fijos según la distancia
//    (diario, 3, 2 o 1 vez por semana) con política de reabasto hasta un
//    objetivo: (periodo de revisión + tránsito + seguridad) × demanda observada.
//  · Si lo pedido excede la capacidad de embarque o la existencia del CENADI,
//    se reparte "proporcional" o "por cobertura" (iguala días de cobertura al
//    llegar, igual que la asignación del CEDIS estatal).
//  · Escenarios: normal, falla de proveedor, cierre carretero, huracán en la
//    península y pico respiratorio. Determinista (mulberry32 con semilla).
// =====================================================================

export const DAYS = 30, H = DAYS * 24;
export const T0 = new Date(2026, 9, 26);                 // lunes 26 oct 2026, igual que las otras vistas
const WEEK = [1.15, 1.15, 1.15, 1.15, 1.1, 0.75, 0.55];  // lun..dom, promedio 1
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const bump = (d, c, w) => Math.exp(-(((d - c) / w) ** 2));

export const PARAMS = {
  cap: 360,            // tarimas que el CENADI puede embarcar por día
  porCamion: 24,       // tarimas por tráiler de 53'
  seguridad: 5,        // días de inventario de seguridad en el almacén estatal
  costoKm: 34,         // MXN por km de tráiler (ida y vuelta se cobra doble)
  riesgo: 5,           // días de cobertura para marcar riesgo
};

const PENINSULA = ['04', '23', '31', '27', '07'];
const PACIFICO_N = ['25', '26', '02', '03'];

export const SCENARIOS = {
  normal: { nombre: 'Normal', desc: 'Operación tipo: demanda con estacionalidad semanal y embarques en sus días fijos.' },
  proveedor: {
    nombre: 'Falla de proveedor',
    desc: 'Del día 5 al 16 el CENADI sólo tiene 45 % de lo que piden los estados: un proveedor de claves de alto consumo incumple.',
    fill: d => (d >= 5 && d < 17 ? 0.45 : 1),
  },
  carretera: {
    nombre: 'Cierre carretero',
    desc: 'Del día 4 al 11 bloqueo en la autopista México–Nogales a la altura de Sinaloa: los tráileres a Sinaloa, Sonora y las Baja Californias se desvían (+48 h).',
    block: s => (PACIFICO_N.includes(s.cve) ? { from: 96, to: 264, u: s.cve === '25' ? 0.7 : 0.5, extra: 48 } : null),
  },
  huracan: {
    nombre: 'Huracán en la península',
    desc: 'Del día 8 al 13 no se circula a Campeche, Yucatán, Quintana Roo, Tabasco ni Chiapas, y la demanda ahí sube 25 % hasta el día 18.',
    block: s => (PENINSULA.includes(s.cve) ? { from: 192, to: 312, u: 0.75 } : null),
    mult: (s, d) => (PENINSULA.includes(s.cve) && d >= 8 && d < 18 ? 1.25 : 1),
  },
  pico: {
    nombre: 'Pico respiratorio',
    desc: 'Temporada respiratoria: la demanda nacional sube hasta 80 % alrededor del día 13 y la capacidad de embarque del CENADI se vuelve el cuello de botella.',
    mult: (s, d) => 1 + 0.8 * bump(d, 13, 7),
  },
};
export const POLICIES = {
  prop: { nombre: 'Proporcional', desc: 'si falta capacidad o existencia, todos reciben el mismo porcentaje de lo que pidieron' },
  cob: { nombre: 'Por cobertura', desc: 'si falta, se reparte para igualar los días de cobertura con los que llega cada estado' },
};

// días de salida a la semana: la frecuencia depende de las horas de tránsito y los días
// se reparten para emparejar la carga diaria del CENADI (de lunes a sábado)
const PATTERNS = {
  6: [[0, 1, 2, 3, 4, 5]],
  3: [[0, 2, 4], [1, 3, 5]],
  2: [[0, 3], [1, 4], [2, 5]],
  1: [[0], [1], [2], [3], [4], [5]],
};
const nPerWeek = s => (s.horas <= 3 ? 6 : s.horas <= 12 ? 3 : s.horas <= 24 ? 2 : 1);
export function schedule(estados) {
  const load = [0, 0, 0, 0, 0, 0], out = {};
  for (const s of [...estados].sort((a, b) => b.tarimasSemana - a.tarimasSemana)) {
    const n = nPerWeek(s), per = s.tarimasSemana / n;
    let best = null, bestMax = Infinity;
    for (const p of PATTERNS[n]) {
      const m = Math.max(...load.map((l, d) => l + (p.includes(d) ? per : 0)));
      if (m < bestMax - 1e-9) { bestMax = m; best = p; }
    }
    best.forEach(d => (load[d] += per));
    out[s.cve] = best;
  }
  return out;
}
export const FREQ_TXT = f => (f.length === 6 ? 'lun a sáb' : f.map(d => DOW[d]).join(', '));

export function simulate(data, scn = 'normal', pol = 'cob', over = {}) {
  const P = { ...PARAMS, ...over };
  const sc = SCENARIOS[scn];
  const FREQ = schedule(data.estados);
  const E = data.estados.map((s, i) => {
    const r = mulberry32(1000 + Number(s.cve) * 7919);
    const noise = Array.from({ length: DAYS + 1 }, () => 0.9 + 0.2 * r());
    const base = s.tarimasSemana / 7;
    const e = {
      ...s, i, base, noise, rnd: r, freq: FREQ[s.cve], block: sc.block?.(s) || null,
      inv: new Float32Array(H + 1), cumD: new Float32Array(H + 1), cumS: new Float32Array(H + 1), outH: new Uint16Array(H + 1),
      covDay: new Float32Array(DAYS + 1), ships: [], open: [], out: false,
    };
    e.inv[0] = base * (8 + 9 * r());
    return e;
  });
  const mult = (e, d) => WEEK[d % 7] * e.noise[d] * (sc.mult ? sc.mult(e, d) : 1);
  const fcast = (e, h) => (h >= 168 ? Math.max(0.1, (e.cumD[h] - e.cumD[h - 168]) / 7) : e.base * (sc.mult ? sc.mult(e, Math.floor(h / 24)) : 1));
  const ships = [], events = [], daily = [];
  let sid = 0;

  function plan(d, h) {
    const due = E.filter(e => e.freq.includes(d % 7));
    if (!due.length) { daily[d] = { req: 0, ship: 0, fill: 1 }; return; }
    for (const e of due) {
      const f = fcast(e, h), L = e.horas / 24, R = 7 / e.freq.length;
      const pipe = e.inv[h] + e.open.reduce((a, x) => a + x.pallets, 0);
      e._f = f; e._proj = pipe - f * (L + R);                        // existencia proyectada cuando llegue el siguiente embarque
      e._req = Math.max(0, Math.round(f * (R + L + P.seguridad) - pipe));
      if (e._req < 2) e._req = 0;
    }
    const sumReq = due.reduce((a, e) => a + e._req, 0);
    const fill = sc.fill ? sc.fill(d) : 1;
    const supply = Math.min(P.cap, sumReq * fill);
    if (sumReq <= supply + 1e-6) due.forEach(e => (e._ship = e._req));
    else if (pol === 'prop') due.forEach(e => (e._ship = Math.floor(e._req * supply / sumReq)));
    else {                                                            // llenado por niveles de cobertura
      const give = c => due.reduce((a, e) => a + Math.min(e._req, Math.max(0, c * e._f - e._proj)), 0);
      let lo = -60, hi = 120;
      for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (give(m) > supply) hi = m; else lo = m; }
      due.forEach(e => (e._ship = Math.floor(Math.min(e._req, Math.max(0, lo * e._f - e._proj)))));
    }
    const order = [...due].filter(e => e._ship > 0).sort((a, b) => b.horas - a.horas);
    let shipped = 0;
    order.forEach((e, k) => {
      const dep = d * 24 + 16 + k * 0.35;
      const T = Math.max(0.6, e.horas * (0.95 + 0.15 * e.rnd()));
      let wait = 0, holdU = 0, motivo = '';
      if (e.block) {
        const b = e.block, tu = dep + b.u * T;
        if (tu >= b.from && tu < b.to) { holdU = b.u; wait = b.extra != null ? b.extra : b.to - tu; motivo = b.extra != null ? 'desvío por cierre carretero' : 'retenido por el huracán'; }
      }
      const trucks = Math.max(1, Math.ceil(e._ship / P.porCamion));
      const s = {
        id: ++sid, cve: e.cve, i: e.i, d, dep, T, wait, holdU, motivo, arr: dep + T + wait + (trucks - 1) * 0.5,
        pallets: e._ship, req: e._req, trucks, prom: dep + e.horas + 4, done: false,
      };
      s.late = s.arr > s.prom;
      e.open.push(s); e.ships.push(s); ships.push(s); shipped += s.pallets;
      events.push({ t: dep, k: 'dep', cve: e.cve, s, txt: `Sale embarque a ${e.nombre}`, det: `${s.pallets} tarimas en ${trucks} tráiler${trucks > 1 ? 'es' : ''}${s.pallets < s.req ? ` · pidió ${s.req}` : ''}` });
      if (wait) events.push({ t: dep + holdU * T, k: 'hold', cve: e.cve, s, txt: `Embarque a ${e.nombre} ${motivo}`, det: `+${Math.round(wait)} h` });
    });
    for (const e of due) if (e._req && !e._ship) events.push({ t: d * 24 + 15, k: 'cut', cve: e.cve, txt: `Sin embarque para ${e.nombre}`, det: `pidió ${e._req} tarimas; no alcanzó` });
    daily[d] = { req: sumReq, ship: shipped, fill };
  }

  for (let h = 0; h < H; h++) {
    const d = Math.floor(h / 24);
    if (h % 24 === 14) plan(d, h);
    for (const e of E) {
      let inv = e.inv[h];
      for (let k = e.open.length - 1; k >= 0; k--) {
        const s = e.open[k];
        if (s.arr < h + 1) {
          inv += s.pallets; s.done = true; e.open.splice(k, 1);
          events.push({ t: s.arr, k: s.late ? 'late' : 'arr', cve: e.cve, s, txt: `Llega embarque a ${e.nombre}`, det: `${s.pallets} tarimas${s.late ? ` · ${Math.round(s.arr - s.prom)} h tarde` : ' · a tiempo'}` });
        }
      }
      const dem = e.base * mult(e, d) / 24;
      const served = Math.min(inv, dem);
      inv -= served;
      const out = inv <= 1e-6 && dem - served > 1e-6;
      if (out && !e.out) events.push({ t: h, k: 'out', cve: e.cve, txt: `Desabasto en ${e.nombre}`, det: 'el almacén estatal se quedó sin existencia' });
      if (!out && e.out) events.push({ t: h, k: 'back', cve: e.cve, txt: `${e.nombre} recupera abasto`, det: '' });
      e.out = out;
      e.inv[h + 1] = inv;
      e.cumD[h + 1] = e.cumD[h] + dem;
      e.cumS[h + 1] = e.cumS[h] + served;
      e.outH[h + 1] = e.outH[h] + (out ? 1 : 0);
      if ((h + 1) % 24 === 0) e.covDay[(h + 1) / 24] = inv / fcast(e, h + 1);
    }
  }
  E.forEach(e => { e.covDay[0] = e.inv[0] / e.base; delete e.rnd; });
  events.sort((a, b) => a.t - b.t);
  ships.sort((a, b) => a.dep - b.dep);
  const S = { P, scn, pol, E, ships, events, daily, fcast };
  S.summary = summaryAt(S, H);
  return S;
}

// ---------------------------------------------------------------- lecturas a una hora t
const hi = t => Math.max(0, Math.min(H, Math.floor(t)));
export function stateAt(S, e, t) {
  const h = hi(t);
  const f = S.fcast(e, h);
  const inv = e.inv[h];
  const transit = S.ships.filter(s => s.cve === e.cve && s.dep <= t && s.arr > t);
  const next = S.ships.find(s => s.cve === e.cve && s.arr > t && s.dep <= t) || S.ships.find(s => s.cve === e.cve && s.dep > t);
  const nextDep = S.ships.find(s => s.cve === e.cve && s.dep > t);
  const lastArr = [...e.ships].reverse().find(s => s.arr <= t);
  const cov = inv / f;
  const abasto = e.cumD[h] > 0 ? e.cumS[h] / e.cumD[h] : 1;
  const sem = inv <= 1e-6 ? 'crit' : cov < 3 ? 'crit' : cov < S.P.riesgo ? 'warn' : 'ok';
  return {
    inv, f, cov, abasto, outH: e.outH[h], sem, transit, next, nextDep, lastArr,
    transitPal: transit.reduce((a, s) => a + s.pallets, 0), transitTrucks: transit.reduce((a, s) => a + s.trucks, 0),
  };
}

export function summaryAt(S, t) {
  const h = hi(t);
  let D = 0, Sv = 0, inv = 0, f = 0, risk = 0, out = 0, outH = 0;
  for (const e of S.E) {
    D += e.cumD[h]; Sv += e.cumS[h]; inv += e.inv[h]; const fe = S.fcast(e, h); f += fe; outH += e.outH[h];
    const c = e.inv[h] / fe;
    if (e.inv[h] <= 1e-6) out++; else if (c < S.P.riesgo) risk++;
  }
  const arrived = S.ships.filter(s => s.arr <= t);
  const onTime = arrived.length ? arrived.filter(s => !s.late).length / arrived.length : 1;
  const moving = S.ships.filter(s => s.dep <= t && s.arr > t);
  const km = S.ships.filter(s => s.dep <= t).reduce((a, s) => a + s.trucks * S.E[s.i].km * 2, 0);
  const d = Math.min(DAYS - 1, Math.floor(t / 24));
  return {
    abasto: D ? Sv / D : 1, cov: inv / f, risk, out, outH, onTime, arrived: arrived.length,
    trucks: moving.reduce((a, s) => a + s.trucks, 0), pallets: moving.reduce((a, s) => a + s.pallets, 0),
    km, costo: km * S.P.costoKm, today: S.daily[d] || { req: 0, ship: 0, fill: 1 },
    late: arrived.filter(s => s.late).length,
  };
}

// posición de un tráiler sobre su arco: u ∈ [0, 1] y si está detenido
export function truckU(s, k, t) {
  const t0 = s.dep + k * 0.5;
  const x = t - t0;
  if (x < 0) return null;
  const hold = s.holdU * s.T;
  let u, stop = false;
  if (!s.wait || x < hold) u = x / s.T;
  else if (x < hold + s.wait) { u = s.holdU; stop = true; }
  else u = (x - s.wait) / s.T;
  if (u >= 1) return null;
  return { u, stop };
}

// ---------------------------------------------------------------- formato
const T0U = Date.UTC(2026, 9, 26);                         // en UTC para no depender del horario de verano del navegador
export function dateOf(t) { return new Date(T0U + Math.floor(t) * 3600e3); }
export function fmtT(t, withHour = true) {
  const d = dateOf(t);
  const dow = DOW[(d.getUTCDay() + 6) % 7];
  return `${dow} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}${withHour ? ` · ${String(d.getUTCHours()).padStart(2, '0')}:00` : ''}`;
}
export const dayOf = t => Math.floor(t / 24);

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  compra-sim.js · Compra consolidada: del plan anual al contrato
//
//  Toma la demanda por clave del plan de Planeación y simula el
//  procedimiento como se corrió la compra 2027-2028 (Birmex como área
//  consolidadora, licitación pública internacional):
//   · Patente y fuente única: adjudicación directa, cerrada antes (3 ago).
//   · Genéricos: convocatoria, junta de aclaraciones, apertura, evaluación
//     binaria (cumple o no cumple), ofertas subsecuentes de descuento,
//     fallo, firma (20 días hábiles) y primera entrega.
//   · Precio: no aceptable si pasa 10 % la media de la investigación de
//     mercado o el presupuesto; no conveniente si queda 40 % abajo
//     (LAASSP, DOF 16-abr-2025).
//   · Abastecimiento simultáneo: hasta 4 fuentes si la diferencia de precio
//     con el primero no pasa 10 %, con reparto 40/25/20/15, 50/30/20 o 60/40.
//   · Claves desiertas: segunda licitación o invitación a tres; lo que siga
//     sin contrato se compra de emergencia en la unidad, más caro e
//     incompleto.
//   · Ejecución 2027: un proveedor puede incumplir y rescindirse; con varias
//     fuentes, las demás cubren; con una sola, se espera al segundo lugar.
//  Es un modelo: proveedores, costos y probabilidades son supuestos; la
//  demanda viene del plan. Determinista con semilla.
// =====================================================================
import { mulberry32, hash } from './plan-engine.js';

const DAY = 864e5;
export const iso = d => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => d + n * DAY;
const addBiz = (d, n) => { let x = d, k = 0; while (k < n) { x += DAY; const w = new Date(x).getUTCDay(); if (w && w !== 6) k++; } return x; };

export const REPARTO = { 1: [1], 2: [0.6, 0.4], 3: [0.5, 0.3, 0.2], 4: [0.4, 0.25, 0.2, 0.15] };

// ------------------------------------------------------------ escenarios
export const ESCENARIOS = {
  base: {
    n: 'Como 2027-2028', desc: 'Convocatoria a mediados de julio, ofertas subsecuentes de descuento, hasta 4 fuentes por clave y segunda licitación para las desiertas.',
    conv: '07-16', evalDias: 32, descuentos: true, rondas: 3, fuentes: 4, pErrTec: 0.10, subsanar: false, segunda: 'licitacion', retraso: 11, presupuesto: 1.10,
  },
  tardio: {
    n: 'Como 2025-2026', desc: 'Convocatoria en noviembre y fallo hasta enero, sin descuentos, muchos errores documentales y segunda vuelta tardía.',
    conv: '11-08', evalDias: 30, descuentos: false, rondas: 0, fuentes: 2, pErrTec: 0.32, subsanar: false, segunda: 'licitacion', retraso: 27, presupuesto: 1.05,
  },
  unica: {
    n: 'Una sola fuente por clave', desc: 'Igual que 2027-2028, pero cada clave a un solo proveedor: precio más bajo, más riesgo si incumple.',
    conv: '07-16', evalDias: 32, descuentos: true, rondas: 3, fuentes: 1, pErrTec: 0.10, subsanar: false, segunda: 'licitacion', retraso: 11, presupuesto: 1.10,
  },
  anticipada: {
    n: 'Anticipada y precalificada', desc: 'Convocatoria en mayo, revisión previa de la documentación técnica y corrección de errores antes del fallo; desiertas a invitación a tres.',
    conv: '05-15', evalDias: 30, descuentos: true, rondas: 3, fuentes: 4, pErrTec: 0.04, subsanar: true, segunda: 'invitacion', retraso: 0, presupuesto: 1.10,
  },
};

// ------------------------------------------------------------ mercado de cada clave (supuestos)
const LAB = 40;                                                      // laboratorios en el padrón simulado
export const labName = i => `Laboratorio ${String(i + 1).padStart(2, '0')}`;
export const labNacional = i => mulberry32(hash('lab' + i))() < 0.62;
function mercado(c, seed) {
  const r = mulberry32(hash(`mkt|${seed}|${c.clave}`));
  const especial = c.frio || (['Hematología', 'Neumología'].includes(c.grupo) && c.uso !== 'F');
  const patente = especial ? r() < 0.5 : c.uso !== 'F' && r() < 0.05;     // fuente única: biológicos, oncológicos y algunas hospitalarias
  const comun = c.uso === 'F' && !especial;
  const lambda = patente ? 1 : comun ? 6.5 : c.grupo === 'Anestesia' ? 3 : 3.8;
  const sinMercado = !patente && r() < (comun ? 0.02 : 0.12);                // nadie fabrica o registra la presentación
  const n = patente ? 1 : sinMercado ? 0 : Math.max(1, Math.round(lambda * (0.15 + 1.15 * r())));
  const lead = Math.round((c.frio ? 75 : especial ? 60 : 40) * (0.7 + 0.8 * r()));   // días para fabricar y entregar
  const labs = [];
  const used = new Set();
  for (let i = 0; i < n; i++) { let l; do { l = Math.floor(r() * LAB); } while (used.has(l)); used.add(l); labs.push(l); }
  return { patente, n, lead, labs, r };
}

// ------------------------------------------------------------ una clave por el procedimiento
function licitar(c, Q, E, mk, ref, dates, opts) {
  const r = mk.r;
  const res = { k: c.k, clave: c.clave, nombre: c.nombre, ven: c.ven, grupo: c.grupo, frio: c.frio, Q, ref, tipo: mk.patente ? 'patente' : 'licitacion', ofertas: 0, solventes: 0, aceptables: 0, ganadores: [], causa: null, vuelta: 1 };
  if (mk.patente) {
    // fuente única: precio cercano al de referencia, capacidad casi siempre suficiente
    const p = ref * (1.0 + 0.12 * r()), cap = Q * (0.85 + 0.5 * r());
    res.ofertas = res.solventes = res.aceptables = 1;
    res.ganadores = [{ lab: mk.labs[0] ?? 0, share: 1, q: Math.min(Q, cap), precio: p }];
    res.fallo = dates.patente;
  } else {
    const bids = mk.labs.map(l => {
      const floor = ref * (0.55 + 0.4 * r());
      const markup = mk.n >= 3 ? 1.12 + 0.3 * r() : 1.22 + 0.4 * r();
      const tec = r() >= E.pErrTec || (E.subsanar && r() < 0.6);       // evaluación binaria (con o sin corrección de errores)
      return { lab: l, floor, precio: floor * markup, tec, cap: Q * (0.5 + 1.3 * r()) };
    });
    res.ofertas = bids.length;
    let ok = bids.filter(b => b.tec);
    res.solventes = ok.length;
    if (E.descuentos && ok.length >= 2) {                                 // ofertas subsecuentes de descuento
      for (let k = 0; k < E.rondas; k++) {
        const best = Math.min(...ok.map(b => b.precio));
        for (const b of ok) if (b.precio > best) b.precio = Math.max(b.floor, best * 0.98);
      }
    }
    const tope = Math.min(ref * 1.10, ref * E.presupuesto);
    const okP = ok.filter(b => b.precio <= tope && b.precio >= ref * 0.60).sort((a, b) => a.precio - b.precio);
    res.aceptables = okP.length;
    if (!bids.length) res.causa = 'sin oferta';
    else if (!ok.length) res.causa = 'técnica';
    else if (!okP.length) res.causa = ok.some(b => b.precio < ref * 0.60) ? 'precio no conveniente' : 'precio no aceptable';
    if (okP.length) {
      const win = okP.filter(b => b.precio <= okP[0].precio * 1.10).slice(0, Math.max(1, opts.fuentes));
      const split = REPARTO[win.length];
      let rest = Q;
      res.ganadores = win.map((b, i) => { const q = Math.min(b.cap, Q * split[i]); rest -= q; return { lab: b.lab, share: split[i], q, precio: b.precio, cap: b.cap }; });
      for (const g of res.ganadores) { if (rest <= 0) break; const extra = Math.min(rest, Math.max(0, g.cap - g.q)); g.q += extra; rest -= extra; }
      res.segundo = okP[win.length] ? { lab: okP[win.length].lab, precio: okP[win.length].precio } : null;   // para la cascada si alguien incumple
      if (rest > Q * 0.05) res.causa = 'capacidad';
    }
    res.fallo = dates.fallo;
  }
  return res;
}

// ------------------------------------------------------------ simulación completa
export function simular(claves, demanda, opts = {}) {
  const E = { ...ESCENARIOS[opts.esc || 'base'], ...(opts.over || {}) };
  const seed = opts.seed || 1, year = opts.year || 2027, puente = opts.puente ?? 60, falla = opts.falla ?? 0.06;
  const ini = Date.UTC(year, 0, 1);
  // calendario del procedimiento
  const conv = Date.parse(`${year - 1}-${E.conv}T00:00:00Z`);
  const aclar = addDays(conv, 7), apertura = addDays(conv, 20), evalFin = addDays(apertura, E.evalDias);
  const descFin = addDays(evalFin, E.descuentos ? 4 * E.rondas : 0);
  const fallo = addDays(descFin, E.retraso), firma = addBiz(fallo, 20);
  const patente = Math.min(addDays(apertura, -2), fallo);
  const dates = { conv, aclar, apertura, evalFin, descFin, fallo, firma, patente };
  const seg2 = E.segunda === 'invitacion' ? addDays(fallo, 35) : addDays(fallo, 75);   // fallo de la segunda vuelta
  const rows = [];
  for (const c of claves) {
    const Q = Math.round(demanda[c.k] || 0); if (!Q) continue;
    const ref = c.precio, mk = mercado(c, seed);
    const x = licitar(c, Q, E, mk, ref, dates, { fuentes: E.fuentes });
    const r = mulberry32(hash(`exe|${seed}|${c.clave}`));                    // mismos números aleatorios en todos los escenarios
    const cub1 = x.ganadores.reduce((s, g) => s + g.q, 0);
    // segunda vuelta para lo que quedó sin cubrir
    if (cub1 < Q * 0.95) {
      const falt = Q - cub1;
      const pOk = E.segunda === 'invitacion' ? 0.75 : x.causa === 'sin oferta' ? 0.45 : 0.62;
      if (r() < pOk) {
        const lab = Math.floor(r() * LAB), premio = E.segunda === 'invitacion' ? 1.12 + 0.2 * r() : 1.04 + 0.12 * r();
        x.ganadores.push({ lab, share: falt / Q, q: falt, precio: ref * premio, vuelta: 2 });
        x.vuelta = 2; x.fallo2 = seg2;
      }
    }
    const cub = x.ganadores.reduce((s, g) => s + g.q, 0);
    x.cobertura = Math.min(1, cub / Q);
    x.estado = x.tipo === 'patente' ? 'patente' : !x.ganadores.length ? 'sin contrato' : x.vuelta === 2 && cub1 === 0 ? 'segunda vuelta' : x.cobertura < 0.95 ? 'parcial' : x.vuelta === 2 ? 'completada en 2a vuelta' : 'adjudicada';
    // primera entrega y días sin cobertura al arrancar el año (el inventario puente cubre los primeros días)
    const firmaC = x.tipo === 'patente' ? addBiz(x.fallo, 20) : firma;
    const ent1 = Math.max(addDays(ini, 10), addDays(firmaC, mk.lead));
    x.primeraEntrega = cub1 > 0 ? ent1 : null;
    const ent2 = x.fallo2 ? Math.max(addDays(ini, 10), addDays(addBiz(x.fallo2, 20), mk.lead)) : null;
    x.entrega2 = ent2;
    const hueco = d => Math.max(0, (d - ini) / DAY - puente);
    // días-equivalentes sin medicamento en 2027 (fracción de la demanda sin cubrir × días)
    let dias = 0;
    const f1 = Math.min(1, cub1 / Q);
    if (cub1 > 0) dias += f1 * Math.min(365, hueco(ent1));
    const f2 = Math.min(1 - f1, (cub - cub1) / Q);
    if (f2 > 0) dias += f2 * Math.min(365, hueco(ent2));
    dias += (1 - f1 - f2) * Math.max(0, 365 - puente);                         // nunca contratada
    // ejecución: un proveedor puede incumplir (más probable si ofertó muy barato)
    x.falla = null;
    for (const g of x.ganadores) {
      const p = falla * (g.precio < ref * 0.75 ? 2 : 1) * (mk.patente ? 0.5 : 1);
      if (r() < p) {
        const mes = 2 + Math.floor(r() * 8);                                   // mes en que se rescinde
        const otros = x.ganadores.filter(o => o !== g).reduce((s, o) => s + Math.max(0, (o.cap || o.q * 1.2) - o.q), 0);
        const cubre = Math.min(g.q, otros);
        const espera = x.segundo ? 45 : 90;                                    // cascada al segundo lugar o procedimiento nuevo
        const perdidos = (g.q - cubre) / Q * espera;
        dias += perdidos;
        x.falla = { lab: g.lab, mes, espera, cubre: g.q ? cubre / g.q : 0, dias: perdidos };
        break;
      }
    }
    x.diasSin = dias;
    x.piezasRiesgo = Q / 365 * dias;
    x.costo = x.ganadores.reduce((s, g) => s + g.q * g.precio, 0);
    x.costoRef = Q * ref;
    const sinCubrir = Q * (1 - x.cobertura);
    x.emergencia = sinCubrir * 0.5 * ref * 1.4;                                // la unidad compra la mitad de lo faltante, 40 % más caro
    rows.push(x);
  }
  // ---- agregados
  const sum = f => rows.reduce((s, x) => s + f(x), 0);
  const Qt = sum(x => x.Q);
  const lic = rows.filter(x => x.tipo !== 'patente');
  const embudo = [
    { k: 'plan', n: 'Plan anual (demanda)', q: Qt },
    { k: 'ofertas', n: 'Con al menos una oferta', q: sum(x => (x.ofertas ? x.Q : 0)) },
    { k: 'solventes', n: 'Técnicamente solventes', q: sum(x => (x.solventes ? x.Q : 0)) },
    { k: 'aceptables', n: 'Con precio aceptable', q: sum(x => (x.aceptables ? x.Q : 0)) },
    { k: 'vuelta1', n: 'Adjudicado en el fallo', q: sum(x => x.ganadores.filter(g => g.vuelta !== 2).reduce((s, g) => s + g.q, 0)) },
    { k: 'final', n: 'Contratado tras la segunda vuelta', q: sum(x => x.ganadores.reduce((s, g) => s + g.q, 0)) },
  ];
  const porLab = new Map();
  for (const x of rows) for (const g of x.ganadores) { const o = porLab.get(g.lab) || { lab: g.lab, claves: 0, q: 0, monto: 0, unica: 0 }; o.claves++; o.q += g.q; o.monto += g.q * g.precio; if (x.ganadores.length === 1) o.unica++; porLab.set(g.lab, o); }
  const labs = [...porLab.values()].sort((a, b) => b.monto - a.monto);
  const montoT = labs.reduce((s, l) => s + l.monto, 0) || 1;
  const hhi = labs.reduce((s, l) => s + (100 * l.monto / montoT) ** 2, 0);
  const kpi = {
    claves: rows.length, licitadas: lic.length, patente: rows.length - lic.length,
    adjudicadas1: lic.filter(x => x.ganadores.some(g => g.vuelta !== 2)).length,
    desiertas1: lic.filter(x => !x.ganadores.some(g => g.vuelta !== 2)).length,
    sinContrato: rows.filter(x => x.estado === 'sin contrato').length,
    vitalesSin: rows.filter(x => x.ven === 'V' && x.cobertura < 0.95).length,
    cobertura: sum(x => x.Q * x.cobertura) / Qt,
    costo: sum(x => x.costo), costoRef: sum(x => x.costoRef * x.cobertura), emergencia: sum(x => x.emergencia),
    diasSin: sum(x => x.diasSin), piezasRiesgo: sum(x => x.piezasRiesgo),
    clavesRiesgo: rows.filter(x => x.diasSin >= 30).length,
    fallo: dates.fallo, firma: dates.firma, margen: Math.round((ini - dates.firma) / DAY),
    unica: rows.filter(x => x.ganadores.length === 1).length, multi: rows.filter(x => x.ganadores.length > 1).length,
    hhi, labs: labs.length, nacional: labs.filter(l => labNacional(l.lab)).reduce((s, l) => s + l.monto, 0) / montoT,
    fallas: rows.filter(x => x.falla).length,
    causas: ['sin oferta', 'técnica', 'precio no aceptable', 'precio no conveniente', 'capacidad'].map(k => ({ k, n: lic.filter(x => x.causa === k).length })),
  };
  return { E, dates: { ...dates, seg2, ini }, rows, embudo, labs, kpi, puente };
}

export function comparar(claves, demanda, opts = {}) {
  return Object.keys(ESCENARIOS).map(esc => ({ esc, n: ESCENARIOS[esc].n, ...simular(claves, demanda, { ...opts, esc }).kpi }));
}

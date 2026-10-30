// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  torre-engine.js · Torre de control del abasto (vista del "jefe de jefes")
//
//  Corre sin DOM todos los gemelos del proyecto con un mismo escenario y
//  los resume en una sola cadena de 10 eslabones, cada uno con sus
//  indicadores, meta, semáforo y un solo responsable (RACI: Accountable).
//
//  Reglas (ver docs/TORRE.md):
//   · Semáforo contra una referencia escrita: meta y nivel crítico por KPI.
//     brecha = (meta − valor) / (meta − crítico)  → 0 verde, <1 ámbar, ≥1 rojo.
//   · Atribución al eslabón correcto: un indicador de resultado (marcado
//     "hereda") sólo cuenta completo contra su dueño si el eslabón de arriba
//     cumplió. Si arriba está en rojo, 65 % de la brecha se pasa a ese eslabón
//     (25 % si está en ámbar).
//   · Escalamiento: nivel 1 dueño directo (24–48 h), nivel 2 revisión semanal
//     (S&OE), nivel 3 dirección general (sistémico o de alto impacto).
//
//  Los gemelos no están conectados entre sí: cada uno corre su escenario
//  coherente (nacional 32 estados, piloto Hidalgo, plan anual 2027…). La torre
//  lo dice en cada bloque con su alcance y periodo.
// =====================================================================

import * as PE from './plan-engine.js';
import * as INT from './integridad.js';
import { responsables, ANALISTAS, analistaDe } from './responsables.js';
import * as CS from './compra-sim.js';
import * as MB from './marbetes-sim.js';
import * as NAC from './nacional-sim.js';
import * as RF from './redfria-sim.js';
import * as YD from './yard-sim.js';
import * as supply from './supply.js';
import * as nsim from './network-sim.js';
import { Network } from './network.js';
import { Router } from './routing.js';
import { Contratos } from './contratos.js';

// ------------------------------------------------------------------ escenarios
export const ESCENARIOS = {
  normal: {
    n: 'Operación normal', desc: 'Todo en su día tipo: plan anual en validación, compra como 2027-2028, proveedores y CENADI con su desempeño habitual.',
    nac: 'normal', rf: { ctx: 'otono' }, compra: 'base', hgo: 'normal', yard: ['A', 'normal'], marb: 'media',
  },
  proveedor: {
    n: 'Un proveedor falla', desc: 'Un proveedor de claves de alto consumo incumple: el CENADI sólo tiene 45 % de lo que piden los estados del día 5 al 16, el CEDIS de Hidalgo entra en contingencia y la compra quedó a una sola fuente por clave.',
    nac: 'proveedor', rf: { ctx: 'otono' }, compra: 'unica', hgo: 'contingencia', yard: ['A', 'contingencia'], marb: 'media',
  },
  huracan: {
    n: 'Temporada de huracanes', desc: 'No se circula a la península del día 8 al 13, la demanda ahí sube 25 % y la red fría pasa por cortes de luz y calor.',
    nac: 'huracan', rf: { ctx: 'huracan' }, compra: 'base', hgo: 'normal', yard: ['A', 'normal'], marb: 'media',
  },
  tardia: {
    n: 'Compra tardía (como 2025)', desc: 'Convocatoria en noviembre, fallo en enero y muchas claves desiertas: el año arranca sin contratos, el CEDIS entra en contingencia y los proveedores llegan todos juntos al CENADI.',
    nac: 'proveedor', rf: { ctx: 'otono' }, compra: 'tardio', hgo: 'contingencia', yard: ['A', 'pico'], marb: 'baja',
  },
};

// ------------------------------------------------------------------ la cadena
// up: eslabones de arriba que alimentan a éste (para la atribución)
export const ESLABONES = [
  { id: 'plan', n: 'Planeación', ic: '📋', up: [], dueno: 'Subdirección de Planeación de Insumos', alcance: 'Nacional · plan anual 2027 (1,033 unidades, 32 delegaciones)', link: 'planeacion.html#/mitablero' },
  { id: 'compra', n: 'Compra consolidada', ic: '⚖️', up: ['plan'], dueno: 'Subdirección de Adquisiciones (compra consolidada)', alcance: 'Nacional · licitación 2027 de las claves del plan', link: 'compras.html' },
  { id: 'prov', n: 'Proveedores y contratos', ic: '🤝', up: ['compra'], dueno: 'Administración de contratos (Subdirección de Abasto)', alcance: 'Piloto Hidalgo · 8 contratos · últimos 90 días', link: 'contratos.html' },
  { id: 'cenadi', n: 'CENADI', ic: '🏭', up: ['prov'], dueno: 'Gerencia del CENADI', alcance: 'CENADI · patio, andenes y surtido · un día tipo', link: 'cenadi.html' },
  { id: 'dnac', n: 'Distribución nacional', ic: '🚛', up: ['cenadi', 'prov'], dueno: 'Coordinación de Distribución del CENADI', alcance: 'Nacional · CENADI → 32 almacenes estatales · 30 días', link: 'nacional.html' },
  { id: 'alm', n: 'Almacén estatal', ic: '📦', up: ['dnac', 'prov'], dueno: 'Jefe(a) del almacén delegacional', alcance: 'Piloto Hidalgo · CEDIS estatal · 90 días e inventario físico del año', link: 'index.html' },
  { id: 'dest', n: 'Distribución estatal', ic: '🚐', up: ['alm'], dueno: 'Jefatura de Distribución delegacional', alcance: 'Piloto Hidalgo · CEDIS → 60 unidades · 30 días', link: 'mapa.html' },
  { id: 'unidad', n: 'Unidad y farmacia', ic: '🏥', up: ['dest', 'alm'], dueno: 'Director(a) de la unidad y Jefatura de farmacia', alcance: 'Piloto Hidalgo · 60 unidades · 30 días', link: 'unidad.html' },
  { id: 'frio', n: 'Red fría', ic: '❄️', up: [], dueno: 'Coordinación de Red Fría', alcance: 'Nacional · CENADI, 32 almacenes y unidades con refrigerador · 30 días', link: 'redfria.html', trans: true },
  { id: 'integ', n: 'Integridad', ic: '🛡️', up: [], dueno: 'Área central (controles de datos) y Órgano Interno de Control', alcance: 'Nacional · pedidos del plan anual 2027', link: 'planeacion.html#/integridad', trans: true },
];
export const ESLABON = Object.fromEntries(ESLABONES.map(e => [e.id, e]));

export const NIVELES = {
  1: { n: 'Nivel 1 · dueño directo', plazo: 'atender en 24 a 48 h con su procedimiento' },
  2: { n: 'Nivel 2 · revisión semanal', plazo: 'a la junta semanal de operación con causa raíz y plan' },
  3: { n: 'Nivel 3 · dirección general', plazo: 'sistémico o de alto impacto: decisión de política esta semana' },
};

// ------------------------------------------------------------------ utilidades
const MOTIVO = { RECHAZADA_TEMPERATURA: 'Rechazo por temperatura', RECHAZADA_FEUM: 'Rechazo por documentación (FEUM)', RECHAZADA_CADUCIDAD: 'Rechazo por caducidad corta' };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaISO = s => { const [y, m, d] = String(s).split('-').map(Number); return y && m && d ? `${d} ${MES[m - 1]} ${y}` : String(s); };
const sum = a => a.reduce((x, y) => x + y, 0);
const pl = (n, s, p) => `${n.toLocaleString('es-MX')} ${n === 1 ? s : p}`;
const pct = (a, b) => (b ? a / b : null);
export function brecha(k) {
  if (k.info || k.v == null || !isFinite(k.v)) return 0;
  const g = k.dir > 0 ? (k.meta - k.v) / (k.meta - k.crit) : (k.v - k.meta) / (k.crit - k.meta);
  return Math.max(0, Math.min(3, g));
}
export const semDe = g => (g <= 1e-9 ? 'ok' : g < 1 ? 'warn' : 'crit');
export const sinDato = k => !k.info && (k.v == null || !isFinite(k.v));                    // gris: no cuenta como verde
const RANK = { nd: 0, ok: 0, warn: 1, crit: 2 };

// ------------------------------------------------------------------ cada gemelo
function gemeloPlan(D, cfg, prog) {
  prog('Planeación: reconstruyendo el plan anual con tu bitácora');
  const U = PE.buildUniverse(D.iss, D.meds);
  let plans = Array.isArray(cfg.entries) && cfg.entries.length ? PE.replay(U, cfg.entries) : [];
  if (!plans.length) plans = PE.replay(U, PE.seedEntries());                                   // bitácora vacía o dañada: plan de ejemplo
  const P = plans.find(p => p.items.size && p.status !== 'cancelado') || plans[0];          // el mismo plan que lee Compras
  // demanda (Compras) e integridad se calculan con el plan tal como está, igual que en compras.html e Integridad
  const dem = {};
  for (const it of P.items.values()) if (it.months && it.st.oc !== 'rechazado') dem[it.k] = (dem[it.k] || 0) + PE.total(it);
  prog('Integridad: buscando pedidos maliciosos');
  const ig = INT.simular(U, P, { ...INT.defaultCfg(), ...(cfg.integ || {}) });
  // para vigilar bandejas, si la aprobación apenas empieza se avanza al día hábil 15
  const d0 = P.day;
  if (P.status === 'validacion' && P.day < 15) while (P.day < 15 && P.status === 'validacion') PE.ACTIONS.sim(U, P, { days: 1 });
  const proyectado = P.day - d0;
  const k = PE.kpis(U, P), sg = PE.seguimiento(U, P);
  const rs = responsables(U, P, ig);
  return { U, P, k, sg, ig, rs, dem, proyectado };
}

function gemeloHidalgo(D, esc) {
  const { DAY, H } = supply;
  supply.setScenario(esc.hgo);
  const T = 8 * H, idx = Math.floor(T / DAY);
  const inv = new nsim.CedisInventory(D.hgo, D.meds, 'minmax'); supply.setCedisModel(inv);
  const k90 = inv.kpis(idx, 90);
  // claves con más días sin surtir completo en 90 días
  const nom = new Map((D.meds.items || []).map(m => [m.c, m.n]));
  const claves = [];
  for (const [c, s] of inv.series) {
    let out = 0, part = 0;
    for (let x = idx - 90; x < idx; x++) { const i = inv.i(x); if (s.f[i] < 0.05) out++; else if (s.f[i] < 0.95) part++; }
    if (out + part) claves.push({ c, n: nom.get(c) || c, out, part });
  }
  claves.sort((a, b) => b.out * 2 + b.part - (a.out * 2 + a.part));
  const net = new Network(D.hgo, D.meds);
  for (const s of net.sups) s.run(idx);
  const units = net.sups.map(s => {
    const h = s.hist;
    const rx = sum(h.rx), full = sum(h.rxFull);
    return {
      clues: s.unit.clues, nombre: s.unit.nombre, tipo: s.unit.tipo, rx, full, den: sum(h.rxDen), part: sum(h.rxPart),
      reqs: h.reqs.length, reqLate: h.reqs.filter(r => r.deliver > r.deadline).length,
      pex: h.pex.length, pexV: h.pex.filter(p => p.slaV).length, pexA: h.pex.filter(p => p.slaA).length, pexOk: h.pex.filter(p => p.slaV && p.slaA).length,
      merma: [...h.byC.values()].reduce((n, b) => n + sum(b.merma), 0),
    };
  });
  // serie diaria de recetas completas (30 días)
  const nd = net.sups[0].hist.rx.length, serie = [];
  for (let d = 0; d < nd; d++) { let a = 0, f = 0; for (const s of net.sups) { a += s.hist.rx[d] || 0; f += s.hist.rxFull[d] || 0; } serie.push(a ? f / a : 1); }
  const router = new Router(net), wk = router.week(idx);
  const K = new Contratos(inv, D.meds, esc.hgo);
  const kc = K.kpis(idx - 90, idx - 1, null, T);
  const porK = K.contratos.map(c => ({ id: c.id, prov: c.prov, objeto: c.objeto, ...K.kpis(idx - 90, idx - 1, c.id, T) }));
  const est = K.estado(T).contratos.map(c => ({ id: c.k.id, prov: c.k.prov, estado: c.estado, sem: c.sem, penas: c.penas }));
  return { k90, claves, units, serie, wk, kc, porK, est };
}

function gemeloMarbetes(D, esc) {
  const L = D.layout.slots, sc = D.slotClaves.slots;
  const cat = new Map((D.meds.items || []).map(m => [m.c, { nombre: m.n, grupo: m.g, frio: !!m.frio }]));
  const slots = L.filter(s => sc[s.name]).map(s => ({ name: s.name, type: s.type, clave: sc[s.name], rack: s.parent }));
  const R = MB.simular(slots, cat, { estrategia: 'rotativo', disciplina: esc.marb, deshonesto: true });
  const serie = R.serie.filter((_, i) => i % 7 === 0).map(x => x.exactitud);
  return { kpi: R.kpi, alertas: R.alertas, serie };
}

// ------------------------------------------------------------------ evaluación completa
// resultados que no cambian con el escenario se guardan mientras el worker vive
const CACHE = new Map();
function memo(id, key, fn, prog, txt) {
  const c = CACHE.get(id);
  if (c && c.key === key) { if (prog) { prog(txt); prog(txt); } return c.v; }
  const v = fn(); CACHE.set(id, { key, v }); return v;
}

export function evaluar(D, cfg = {}, onProg = () => {}) {
  const escId = ESCENARIOS[cfg.esc] ? cfg.esc : 'normal', esc = ESCENARIOS[escId];
  let paso = 0; const PASOS = 10;
  const prog = txt => onProg({ txt, p: Math.min(1, paso++ / PASOS) });

  const kPlan = JSON.stringify([cfg.entries || null, cfg.integ || null]);
  const G = memo('plan', kPlan, () => gemeloPlan(D, cfg, prog), prog, 'Planeación e integridad: ya calculados');
  prog('Compra consolidada: licitando las claves del plan');
  const C = CS.simular(G.U.claves, G.dem, { esc: esc.compra, seed: 1 });
  prog('Distribución nacional: CENADI → 32 estados, 30 días');
  const N = NAC.simulate(D.iss, esc.nac, 'cob');
  prog('Red fría: 30 días de temperatura en la red');
  const F = memo('rf', JSON.stringify(esc.rf), () => RF.simulate(D.iss, esc.rf, 2026));
  prog('CENADI: patio, andenes y surtido de un día');
  const Y = YD.simulate(YD.buildParams(esc.yard[0], esc.yard[1])).kpi;
  prog('Piloto Hidalgo: CEDIS, 60 unidades, rutas y contratos');
  const Hg = memo('hgo', esc.hgo, () => gemeloHidalgo(D, esc));
  prog('Inventario físico: marbetes del año en el CEDIS');
  const M = memo('marb', esc.marb, () => gemeloMarbetes(D, esc));
  prog('Torre: semáforos, atribución y a quién llamar');

  const eslabones = construir({ G, C, N, F, Y, Hg, M, escId });
  const R = atribuir(eslabones);
  const norte = estrellaNorte({ Hg, N, C, F, G });
  const matriz = matrizDelegaciones({ G, N, F });
  const unidades = unidadesDe({ G, Hg });
  const roles = rolesDe({ G, F, Hg });
  const nac = N.E.map(e => ({ cve: e.cve, outH: e.outH[NAC.H], abasto: e.cumD[NAC.H] ? e.cumS[NAC.H] / e.cumD[NAC.H] : 1, late: e.ships.filter(x => x.arr <= NAC.H && x.late).length, ships: e.ships.filter(x => x.arr <= NAC.H).length }));
  onProg({ txt: 'Listo', p: 1 });
  return {
    esc: escId, escN: esc.n, escDesc: esc.desc,
    plan: { dia: G.P.day, proyectado: G.proyectado, nombre: G.P.nombre || 'Plan anual 2027', status: G.P.status },
    norte, eslabones, reparto: R.reparto, llamadas: R.llamadas, nombres: R.nombres, matriz, unidades, nac, roles,
  };
}

// ------------------------------------------------------------------ los indicadores de cada eslabón
function construir({ G, C, N, F, Y, Hg, M }) {
  const E = {};
  const kp = (id, o) => ({ id, w: 1, dir: 1, hereda: false, of: [], ...o });
  const sg = G.sg, rs = G.rs, k = G.k;
  const LVL = { um: 'las unidades', del: 'las delegaciones', oc: 'Oficina Central' };
  const LVL_D = { um: 'Directores(as) de unidad', del: 'Administradores(as) delegacionales', oc: 'Analistas de Oficina Central' };

  // 1 · Planeación ------------------------------------------------------------
  const venc = sg.vencidos.um + sg.vencidos.del + sg.vencidos.oc;
  const peorNivel = Object.entries(sg.vencidos).sort((a, b) => b[1] - a[1])[0][0];
  const anaRank = [...rs.ana].sort((a, b) => b.venc - a.venc);
  const delRank = [...rs.del].sort((a, b) => b.pts - a.pts || b.venc - a.venc);
  const avOC = sg.plan.oc ? sg.done.oc / (sg.plan.oc * sg.N) : 1;
  const avDel = sg.plan.del ? sg.done.del / (sg.plan.del * sg.N) : 1;
  const avance = Math.min(avOC, avDel);
  const lentoNivel = avOC <= avDel ? 'oc' : 'del';
  E.plan = [
    kp('vencidas', {
      n: 'Partidas vencidas en bandeja', v: pct(venc, sg.n), fmt: 'pct', dir: -1, meta: 0.02, crit: 0.10, w: 2,
      def: 'Partidas del plan que llevan en la bandeja de alguien más días que su plazo de revisión.',
      formula: 'partidas con plazo vencido ÷ partidas en el plan', fuente: 'Regla del gemelo: plazo por nivel del calendario del plan (Planeación › Seguimiento)',
      quien: `${LVL_D[peorNivel]} (la mayor parte está en ${LVL[peorNivel]})`,
      det: `${venc.toLocaleString('es-MX')} vencidas: ${sg.vencidos.um.toLocaleString('es-MX')} en unidades, ${sg.vencidos.del.toLocaleString('es-MX')} en delegaciones y ${sg.vencidos.oc.toLocaleString('es-MX')} en Oficina Central.`,
      of: peorNivel === 'oc'
        ? anaRank.slice(0, 3).map(a => ({ quien: `Analista ${a.a + 1} de Oficina Central`, txt: `${a.venc.toLocaleString('es-MX')} partidas vencidas; la más vieja lleva ${a.oldest ?? 0} días · revisa ${a.dels.map(d => d.abbr).join(', ')}`, nivel: a.esc2 ? 2 : 1 }))
        : peorNivel === 'del' ? [...rs.del].filter(d => d.venc).sort((a, b) => b.venc - a.venc).slice(0, 3).map(d => ({ quien: `Administrador(a) delegacional de ${d.d.nombre}`, txt: `${d.venc.toLocaleString('es-MX')} partidas vencidas en su bandeja`, nivel: d.esc2 ? 2 : 1 }))
        : [...rs.unit].filter(u => u.venc).sort((a, b) => b.venc - a.venc).slice(0, 3).map(u => ({ quien: `Director(a) de ${u.u.nombre}`, txt: `${u.venc.toLocaleString('es-MX')} partidas vencidas en su bandeja`, nivel: u.esc2 ? 2 : 1 })),
    }),
    kp('avance', {
      n: 'Avance de validación vs programado', v: avance, fmt: 'pct', meta: 1, crit: 0.8, w: 2,
      def: 'Unidades que ya pasaron la revisión del nivel más atrasado contra las que el calendario dice que ya deberían ir.',
      formula: 'mín(revisadas por delegación ÷ programadas, revisadas por Central ÷ programadas)', fuente: 'Calendario del plan anual 2027 (periodo de aprobación)',
      quien: lentoNivel === 'oc' ? 'Subdirección de Planeación de Insumos (revisión de Central)' : 'Administradores(as) delegacionales',
      det: `Delegaciones: ${sg.done.del} de ${Math.round(sg.plan.del * sg.N)} programadas. Central: ${sg.done.oc} de ${Math.round(sg.plan.oc * sg.N)} programadas.`,
      of: lentoNivel === 'oc' ? anaRank.slice(0, 2).map(a => ({ quien: `Analista ${a.a + 1} de Oficina Central`, txt: `${a.pend.toLocaleString('es-MX')} partidas pendientes`, nivel: 1 }))
        : delRank.slice(0, 3).map(d => ({ quien: `Administrador(a) delegacional de ${d.d.nombre}`, txt: d.motivos.map(m => m.txt).join('; ') || 'sin motivo registrado', nivel: 1 })),
    }),
    kp('holgura', {
      n: 'Holgura del calendario', v: sg.estimado == null ? -10 : sg.holgura, fmt: 'diash', meta: 5, crit: 0, w: 1,
      def: 'Días que sobran entre la fecha estimada de cierre (al ritmo actual) y la fecha límite del plan.',
      formula: 'fecha límite − fecha estimada de cierre', fuente: 'Calendario del plan anual 2027',
      quien: 'Subdirección de Planeación de Insumos', det: sg.estimado == null ? `Al ritmo actual no se termina dentro del periodo; el plazo vence el ${fechaISO(sg.L.fin)}.` : `Al ritmo de ${(sg.rate || 0).toFixed(1)} unidades por día hábil se termina en el día hábil ${sg.estimado} (hoy es el ${sg.now}; faltan ${sg.estimado - sg.now}); el plazo vence el ${fechaISO(sg.L.fin)}.`,
    }),
    kp('sobrepedido', {
      n: 'Pedido arriba de la propuesta', v: k.costo0 ? k.costo / k.costo0 - 1 : 0, fmt: 'pct', dir: -1, meta: 0.10, crit: 0.20, w: 1,
      def: 'Cuánto subió el costo del plan contra la propuesta que hizo el sistema con el consumo histórico.',
      formula: 'costo del plan ajustado ÷ costo de la propuesta − 1', fuente: 'Referencia interna del gemelo (presupuesto con margen de 10 %)',
      quien: 'Administradores(as) delegacionales (validan lo que piden sus unidades)',
      of: [...rs.del].sort((a, b) => b.desvCosto - a.desvCosto).slice(0, 3).map(d => ({ quien: `Administrador(a) delegacional de ${d.d.nombre}`, txt: `costo ${Math.round(d.desvCosto * 100)} % arriba de la propuesta`, nivel: 1 })),
    }),
    kp('wape', {
      n: 'Error del pronóstico (WAPE)', v: k.wape, fmt: 'pct', dir: -1, meta: 0.20, crit: 0.30, w: 1,
      def: 'Qué tan lejos queda lo planeado del consumo real, ponderado por volumen.',
      formula: 'Σ|planeado − real| ÷ Σ real', fuente: 'IAPHL: sin umbral fijo; se compara contra un pronóstico ingenuo. Meta interna del gemelo.',
      quien: 'Subdirección de Planeación de Insumos (método del pronóstico)',
    }),
  ];

  // 2 · Compra consolidada --------------------------------------------------
  const ck = C.kpi;
  const sinC = C.rows.filter(x => x.estado === 'sin contrato' || x.cobertura < 0.95).sort((a, b) => (b.ven === 'V') - (a.ven === 'V') || b.diasSin - a.diasSin);
  E.compra = [
    kp('contratado', {
      n: 'Piezas del plan con contrato', v: ck.cobertura, fmt: 'pct', meta: 0.99, crit: 0.95, w: 3,
      def: 'Del volumen que pidió el plan, cuánto quedó con contrato firmado (primera o segunda vuelta).',
      formula: 'piezas contratadas ÷ piezas requeridas', fuente: 'Compra consolidada 2025-26: 99 % de lo solicitado (Zeta, 7-nov-2025)',
      quien: 'Subdirección de Adquisiciones',
      of: sinC.slice(0, 4).map(x => ({ obj: true, quien: x.nombre || x.clave, txt: `${x.estado}${x.causa ? ' · ' + x.causa : ''}${x.ven === 'V' ? ' · VITAL' : ''} · ${Math.round(x.cobertura * 100)} % contratado`, nivel: x.ven === 'V' ? 3 : 2 })),
    }),
    kp('vitales', {
      n: 'Claves vitales sin contrato completo', v: ck.vitalesSin, fmt: 'num', dir: -1, meta: 0, crit: 1, w: 3,
      def: 'Claves de prioridad vital (VEN = V) con menos de 95 % de su volumen contratado.',
      formula: 'claves V con cobertura < 95 %', fuente: 'Clasificación VEN de la OMS: lo vital no puede faltar',
      quien: 'Subdirección de Adquisiciones',
    }),
    kp('riesgo', {
      n: 'Claves con 30 días o más sin medicamento', v: ck.clavesRiesgo, fmt: 'num', dir: -1, meta: 0, crit: 20, w: 2,
      def: 'Claves que, por fecha de fallo, entrega o desiertas, quedan 30 días o más sin cobertura en 2027 aun con el inventario puente.',
      formula: 'claves con días-equivalentes sin medicamento ≥ 30', fuente: 'Regla del gemelo (Compras)',
      quien: 'Subdirección de Adquisiciones',
    }),
    kp('margen', {
      n: 'Días entre la firma y el arranque del año', v: ck.margen, fmt: 'dias', meta: 30, crit: 0, w: 3,
      def: 'Margen entre la firma de los contratos y el 1 de enero: si es negativo, el año arranca sin contrato.',
      formula: '1 de enero − fecha de firma', fuente: 'Calendario de la licitación (Compras)',
      quien: 'Subdirección de Adquisiciones',
    }),
  ];

  // 3 · Proveedores y contratos (piloto Hidalgo) ----------------------------
  const kc = Hg.kc, porK = [...Hg.porK].filter(x => x.vencidas).sort((a, b) => a.otifPct - b.otifPct);
  E.prov = [
    kp('otif', {
      n: 'Entregas a tiempo y completas (OTIF)', v: kc.otifPct, fmt: 'pct', meta: 0.93, crit: 0.88, w: 3,
      def: 'Partidas de las órdenes de suministro que llegaron completas y dentro del plazo.',
      formula: 'partidas a tiempo y completas ÷ partidas con plazo vencido', fuente: 'Ejemplo de la industria: 93 % meta (DSG.ai; no es norma). Usar su 88 % de base como nivel crítico es lectura propia',
      quien: 'Administración de contratos (exige al proveedor, aplica penas)',
      of: porK.slice(0, 3).map(x => ({ quien: `Administrador(a) del contrato ${x.id} · ${x.prov}`, txt: `OTIF ${Math.round(x.otifPct * 100)} % · ${x.objeto}`, nivel: x.otifPct < 0.6 ? 2 : 1 })),
    }),
    kp('cumplimiento', {
      n: 'Piezas entregadas a tiempo', v: kc.cumplimiento, fmt: 'pct', meta: 0.95, crit: 0.85, w: 2,
      def: 'De las piezas que ya debían haber llegado, cuántas llegaron a tiempo.',
      formula: 'piezas a tiempo ÷ piezas con plazo vencido', fuente: 'Meta interna del gemelo',
      quien: 'Administración de contratos',
    }),
    kp('rechazo', {
      n: 'Entregas rechazadas en recepción', v: kc.rechazoPct, fmt: 'pct', dir: -1, meta: 0.02, crit: 0.05, w: 1,
      def: 'Entregas que el almacén rechazó por caducidad corta, temperatura o documentación.',
      formula: 'entregas rechazadas ÷ entregas', fuente: 'Meta interna (IAPHL usa 2 % como límite para el error de surtido, que es otro indicador)',
      quien: 'Administración de contratos (calidad del proveedor)',
      of: Object.entries(kc.motivos || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => ({ obj: true, quien: MOTIVO[m] || m, txt: `${n} ${n === 1 ? 'entrega' : 'entregas'}`, nivel: 1 })),
    }),
    kp('pago', {
      n: 'Facturas pagadas a tiempo', v: kc.pagoATiempoPct, fmt: 'pct', meta: 0.95, crit: 0.80, w: 1,
      def: 'Facturas pagadas dentro del plazo legal. Si se paga tarde, el proveedor deja de surtir primero al ISSSTE.',
      formula: 'facturas pagadas en plazo ÷ facturas pagadas', fuente: 'Plazo del motor de Contratos: 17 días hábiles desde que se verifica la factura (Ley de Adquisiciones 2025). Meta interna 95 %',
      quien: 'Subdirección de Finanzas (pago a proveedores)',
      det: `Por pagar: ${mxn(kc.porPagar)}; ya vencido: ${mxn(kc.porPagarVencido)}.`,
    }),
    kp('rojo', {
      n: 'Contratos en naranja o rojo', v: Hg.est.filter(c => c.sem === 'NARANJA' || c.sem === 'ROJO').length, fmt: 'num', dir: -1, meta: 0, crit: 2, w: 1,
      def: 'Contratos cuyas penas o incumplimientos ya los acercan a la rescisión.',
      formula: 'contratos con semáforo naranja o rojo', fuente: 'Semáforo de Contratos del gemelo',
      quien: 'Administración de contratos',
      of: Hg.est.filter(c => c.sem === 'NARANJA' || c.sem === 'ROJO').map(c => ({ quien: `Administrador(a) del contrato ${c.id} · ${c.prov}`, txt: `${c.sem.toLowerCase()} · penas ${mxn(c.penas)}`, nivel: c.sem === 'ROJO' ? 2 : 1 })),
    }),
  ];

  // 4 · CENADI ----------------------------------------------------------------
  E.cenadi = [
    kp('estancia', {
      n: 'Estancia del proveedor en el CENADI', v: Y.estancia, fmt: 'min', dir: -1, meta: 120, crit: 180, w: 1,
      def: 'Minutos desde que el tráiler del proveedor entra por la caseta hasta que sale descargado (sin contar la espera en carretera).',
      formula: 'promedio(salida − llegada)', fuente: 'Meta interna del gemelo (2 h); el proveedor cobra la espera',
      quien: 'Gerencia del CENADI (recepción)', det: `Percentil 90: ${Math.round(Y.estanciaP90)} min. Antes de la caseta esperan en promedio ${Math.round(Y.esperaCarretera)} min en carretera; cola máxima: ${Y.colaMax} tráileres.`,
    }),
    kp('mas3h', {
      n: 'Tráileres con más de 3 h', v: Y.pctMas3h, fmt: 'pct', dir: -1, meta: 0.05, crit: 0.15, w: 1,
      def: 'Proveedores que pasan más de 3 horas dentro del CENADI (desde la caseta).', formula: 'tráileres con estancia > 180 min ÷ recibidos', fuente: 'Meta interna del gemelo',
      quien: 'Gerencia del CENADI (recepción)',
    }),
    kp('salidas', {
      n: 'Embarques que salen a tiempo', v: Y.salidasATiempo, fmt: 'pct', meta: 0.95, crit: 0.85, w: 2,
      def: 'Olas de embarque a los estados que salen en su horario.', formula: 'embarques a tiempo ÷ embarques', fuente: 'Meta interna del gemelo',
      quien: 'Gerencia del CENADI (surtido y embarque)', det: `Atraso promedio por embarque: ${Math.round(Y.atrasoSalida)} min. Tiempo extra del turno: ${(Y.horasExtra / 60).toFixed(1)} h.`,
    }),
    kp('dock', {
      n: 'Del andén a la ubicación en almacén', v: Y.dockToStock, fmt: 'min', dir: -1, meta: 120, crit: 240, w: 1,
      def: 'Minutos desde que se descarga hasta que la tarima queda ubicada y disponible para surtir.',
      formula: 'promedio(ubicada − descargada)', fuente: 'Meta interna del gemelo',
      quien: 'Gerencia del CENADI (almacenaje)',
    }),
  ];

  // 5 · Distribución nacional -------------------------------------------------
  const H = NAC.H;
  const est = N.E.map(e => {
    const sh = e.ships.filter(s => s.arr <= H);
    return { cve: e.cve, nombre: e.nombre, abasto: e.cumD[H] ? e.cumS[H] / e.cumD[H] : 1, outH: e.outH[H], late: sh.filter(s => s.late).length, ships: sh.length };
  });
  const fillCenadi = N.daily.length ? sum(N.daily.map(d => d.ship)) / Math.max(1, sum(N.daily.map(d => d.req))) : 1;
  const estOut = est.filter(e => e.outH > 0).sort((a, b) => b.outH - a.outH);
  E.dnac = [
    kp('atiempo', {
      n: 'Embarques que llegan a tiempo al estado', v: N.summary.onTime, fmt: 'pct', meta: 0.95, crit: 0.85, w: 2,
      def: 'Tráileres del CENADI que llegan al almacén estatal en la hora prometida.', formula: 'llegadas a tiempo ÷ llegadas', fuente: 'Meta interna del gemelo',
      quien: 'Coordinación de Distribución del CENADI',
      of: [...est].filter(e => e.late).sort((a, b) => b.late - a.late).slice(0, 3).map(e => ({ obj: true, quien: `Ruta CENADI → ${e.nombre}`, txt: `${e.late} de ${e.ships} embarques tarde`, nivel: 1 })),
    }),
    kp('surtido', {
      n: 'Tarimas pedidas por los estados que el CENADI embarcó', v: fillCenadi, fmt: 'pct', meta: 0.98, crit: 0.90, w: 2,
      def: 'Tarimas embarcadas contra las que pidieron los estados en sus días de embarque.', formula: 'tarimas embarcadas ÷ tarimas pedidas', fuente: 'Indicador de IAPHL (tasa de surtimiento al nivel siguiente); la meta de 98 % es interna',
      quien: 'Coordinación de Distribución del CENADI',
    }),
    kp('estados', {
      n: 'Estados que se quedaron sin existencia', v: estOut.length, fmt: 'num', dir: -1, meta: 0, crit: 3, w: 3,
      def: 'Almacenes estatales que llegaron a cero en algún momento de los 30 días.', formula: 'estados con horas en cero > 0', fuente: 'Meta interna: ningún almacén estatal en cero',
      quien: 'Coordinación de Distribución del CENADI',
      of: estOut.slice(0, 4).map(e => ({ quien: `Jefe(a) del almacén estatal de ${e.nombre}`, txt: `${Math.round(e.outH / 24 * 10) / 10} días en cero · abasto ${(e.abasto * 100).toFixed(1)} %`, nivel: e.outH > 72 ? 2 : 1 })),
    }),
    kp('abastoEst', {
      n: 'Demanda estatal atendida', v: N.summary.abasto, fmt: 'pct', meta: 0.97, crit: 0.90, w: 2,
      def: 'De lo que consumieron las unidades de cada estado, cuánto había en el almacén estatal.', formula: 'demanda servida ÷ demanda', fuente: 'Meta interna alineada al 97 % de abasto que el ISSSTE reporta en farmacias (1-abr-2026)',
      quien: 'Coordinación de Distribución del CENADI',
    }),
  ];

  // 6 · Almacén estatal (piloto Hidalgo) --------------------------------------
  const mk = M.kpi, k90 = Hg.k90;
  E.alm = [
    kp('fill', {
      n: 'Surtido completo del CEDIS a unidades', v: k90.fill, fmt: 'pct', meta: 0.95, crit: 0.90, w: 3,
      def: 'Piezas surtidas por el CEDIS estatal contra las pedidas por las unidades en 90 días.', formula: 'piezas surtidas ÷ piezas pedidas', fuente: 'Meta interna del gemelo',
      quien: 'Jefe(a) del almacén delegacional de Hidalgo', det: `${k90.stockoutDays} clave-días en cero y ${k90.partDays} con surtido parcial; ${k90.late} pedidos al proveedor llegaron tarde.`,
      of: Hg.claves.slice(0, 4).map(c => ({ obj: true, quien: c.n, txt: `${c.out} días en cero y ${c.part} parciales en 90 días`, nivel: c.out > 10 ? 2 : 1 })),
    }),
    kp('exactitud', {
      n: 'Exactitud de inventario (sistema = anaquel)', v: mk.exactitudProm, fmt: 'pct', meta: 0.95, crit: 0.90, w: 2,
      def: 'Ubicaciones donde lo que dice el sistema coincide con lo que hay en el anaquel, con el lote correcto.', formula: 'ubicaciones exactas ÷ ubicaciones (promedio del año)', fuente: 'IAPHL: error > 5 % en conteo cíclico indica mal registro',
      quien: 'Jefe(a) del almacén delegacional de Hidalgo', serie: M.serie,
    }),
    kp('tolerancia', {
      n: 'Diferencia del inventario físico anual', v: mk.tolFis, fmt: 'pct2', dir: -1, meta: 0.0072, crit: 0.015, w: 1,
      def: 'Piezas con diferencia en la toma anual contra las piezas contadas.', formula: 'Σ|diferencias| ÷ piezas físicas', fuente: 'Norma IMSS 1821-A03-002: tolerancia 0.72 % en diferencias físicas',
      quien: 'Jefe(a) del almacén delegacional de Hidalgo',
    }),
    kp('almacenista', {
      n: 'Almacenistas con patrón de faltantes', v: M.alertas.length, fmt: 'num', dir: -1, meta: 0, crit: 1, w: 2,
      def: 'Personas cuyas ubicaciones acumulan faltantes chicos repetidos (robo hormiga) muy por encima de la mediana.', formula: 'almacenistas con ≥ 5 faltantes chicos y > 1.5 × la mediana', fuente: 'Regla de alerta de Marbetes del gemelo; meta: ninguno',
      quien: 'Administrador(a) del CEDIS (con aviso al Órgano Interno de Control)',
      of: M.alertas.map(a => ({ quien: MB.almacenista(a.a), txt: a.motivo, nivel: 2 })),
    }),
  ];

  // 7 · Distribución estatal (piloto Hidalgo) ----------------------------------
  const reqs = sum(Hg.units.map(u => u.reqs)), reqLate = sum(Hg.units.map(u => u.reqLate));
  const gap = Hg.wk.opt.cost ? Hg.wk.cur.cost / Hg.wk.opt.cost - 1 : 0;
  E.dest = [
    kp('urg', {
      n: 'Urgencias entregadas fuera de plazo', v: pct(reqLate, reqs) ?? 0, fmt: 'pct', dir: -1, meta: 0.05, crit: 0.20, w: 2,
      def: 'Solicitudes urgentes de las unidades que el CEDIS entregó después de la hora límite.', formula: 'urgentes tarde ÷ urgentes', fuente: 'Meta interna del gemelo',
      quien: 'Jefatura de Distribución delegacional de Hidalgo', det: `${reqLate} de ${reqs} solicitudes urgentes en 30 días.`,
      of: [...Hg.units].filter(u => u.reqLate).sort((a, b) => b.reqLate - a.reqLate).slice(0, 3).map(u => ({ obj: true, quien: `Ruta a ${u.nombre}`, txt: `${u.reqLate} de ${u.reqs} urgencias tarde`, nivel: 1 })),
    }),
    kp('rutas', {
      n: 'Sobrecosto de las rutas actuales', v: gap, fmt: 'pct', dir: -1, meta: 0.10, crit: 0.25, w: 1,
      def: 'Cuánto más cuestan las rutas de la semana contra las rutas optimizadas con las mismas entregas.', formula: 'costo actual ÷ costo optimizado − 1', fuente: 'Gemelo de rutas (Red estatal)',
      quien: 'Jefatura de Distribución delegacional de Hidalgo', det: `${Hg.wk.cur.trips} viajes y ${Math.round(Hg.wk.cur.km).toLocaleString('es-MX')} km a la semana; optimizado: ${Hg.wk.opt.trips} viajes y ${Math.round(Hg.wk.opt.km).toLocaleString('es-MX')} km.`,
    }),
  ];

  // 8 · Unidad y farmacia (piloto Hidalgo) -------------------------------------
  const rx = sum(Hg.units.map(u => u.rx)), full = sum(Hg.units.map(u => u.full)), den = sum(Hg.units.map(u => u.den));
  const pex = sum(Hg.units.map(u => u.pex)), pexA = sum(Hg.units.map(u => u.pexOk));
  const uRank = [...Hg.units].map(u => ({ ...u, s: u.rx ? u.full / u.rx : 1 })).sort((a, b) => a.s - b.s);
  E.unidad = [
    kp('recetas', {
      n: 'Recetas surtidas completas', v: pct(full, rx), fmt: 'pct', meta: 0.97, crit: 0.90, w: 3, serie: Hg.serie,
      def: 'Recetas con todos sus medicamentos entregados en la ventanilla, el mismo día.', formula: 'recetas completas ÷ recetas presentadas', fuente: 'MIR E018 del ISSSTE: meta 97 % (logro 2017: 97.5 %). En 2023 el ISSSTE surtió completas 98.1 % (Expansión, con datos de Cero Desabasto)',
      quien: 'Director(a) de la unidad (con su Jefatura de farmacia)', det: `${rx.toLocaleString('es-MX')} recetas en 30 días: ${(rx - full).toLocaleString('es-MX')} incompletas, ${den.toLocaleString('es-MX')} negadas por completo.`,
      of: uRank.filter(u => u.s < 0.999).slice(0, 4).map(u => ({ quien: `Director(a) de ${u.nombre}`, txt: `${(u.s * 100).toFixed(1)} % completas · ${u.rx - u.full} recetas incompletas`, nivel: u.s < 0.9 ? 2 : 1 })),
    }),
    kp('pex', {
      n: 'Pedidos extraordinarios autorizados en plazo', v: pct(pexA, pex) ?? 1, fmt: 'pct', meta: 0.90, crit: 0.75, w: 1,
      def: 'Pedidos especiales de la unidad (PEX) validados en 2 horas y autorizados en 4 horas.', formula: 'PEX con las dos etapas en plazo ÷ PEX', fuente: 'Plazo del gemelo: validar en 2 h, autorizar en 4 h',
      quien: 'Jefatura de farmacia de la unidad',
      of: [...Hg.units].filter(u => u.pex).map(u => ({ ...u, s: u.pexOk / u.pex })).sort((a, b) => a.s - b.s).slice(0, 3).map(u => ({ quien: `Jefatura de farmacia de ${u.nombre}`, txt: `${Math.round(u.s * 100)} % de ${u.pex} PEX en plazo`, nivel: 1 })),
    }),
    kp('merma', {
      n: 'Piezas caducadas en farmacias', v: sum(Hg.units.map(u => u.merma)), fmt: 'num', info: true, w: 0,
      def: 'Piezas que caducaron en las farmacias de las unidades en 30 días.', formula: 'Σ piezas dadas de baja por caducidad', fuente: 'IAPHL: investigar si la pérdida supera 1 % en conteo cíclico',
      quien: 'Jefatura de farmacia de la unidad',
      of: [...Hg.units].filter(u => u.merma).sort((a, b) => b.merma - a.merma).slice(0, 3).map(u => ({ quien: `Jefatura de farmacia de ${u.nombre}`, txt: `${u.merma} piezas caducadas`, nivel: 1 })),
    }),
  ];

  // 9 · Red fría -------------------------------------------------------------
  const fs = F.summary;
  const node = id => F.byId[id] || F.byId[id.split(':')[1]];
  const perd = new Map();
  for (const l of F.losses) if (!l.det && l.t <= RF.H) { const n = node(l.where); const key = n ? n.id : l.where; const o = perd.get(key) || { n, mxn: 0, q: 0, label: l.label }; o.mxn += l.mxn; o.q += l.q; perd.set(key, o); }
  const ocultos = [...perd.values()].sort((a, b) => b.mxn - a.mxn);
  E.frio = [
    kp('rango', {
      n: 'Tiempo dentro de 2 a 8 °C', v: fs.inRange, fmt: 'pct1', meta: 0.99, crit: 0.97, w: 2,
      def: 'Horas-equipo con temperatura media, mínima y máxima dentro de 2 a 8 °C.', formula: 'horas en rango ÷ horas medidas', fuente: 'El rango de 2 a 8 °C es el de conservación; las metas de 99 % y 97 % son internas',
      quien: 'Coordinación de Red Fría', det: `${fs.eps} excursiones de temperatura; ${fs.froze} con congelación.`,
    }),
    kp('detect', {
      n: 'Excursiones detectadas', v: fs.detPct, fmt: 'pct', meta: 0.90, crit: 0.60, w: 2,
      def: 'Excursiones de temperatura que alguien detectó (registro manual, registrador o telemetría).', formula: 'excursiones detectadas ÷ excursiones', fuente: 'Meta interna del gemelo: lo que no se detecta termina aplicándose a pacientes',
      quien: 'Coordinación de Red Fría (monitoreo)', det: `Se detectan en promedio ${fs.detDelay.toFixed(1)} h después de empezar.`,
    }),
    kp('oculto', {
      n: 'Producto dañado sin detectar', v: fs.ocultoMxn, fmt: 'mxn', dir: -1, meta: 0, crit: 250000, w: 3,
      def: 'Valor de biológicos e insulinas que se dañaron por calor o congelación y nadie lo supo: se aplican a pacientes.', formula: 'Σ valor dañado en excursiones no detectadas', fuente: 'Meta: cero producto dañado aplicado',
      quien: 'Coordinación de Red Fría',
      of: ocultos.slice(0, 4).map(o => ({ quien: o.n ? `Responsable de red fría · ${o.n.nombre}` : o.label, txt: `${mxn(o.mxn)} dañado sin detectar (${o.label})`, nivel: o.mxn > 100000 ? 2 : 1 })),
    }),
  ];

  // 10 · Integridad --------------------------------------------------------------
  const ig = G.ig;
  const porActor = new Map();
  for (const c of ig.casos) if (c.estado === 'escapado') { const key = c.actor.nombre; const o = porActor.get(key) || { a: c.actor, monto: 0, n: 0, conductas: new Set() }; o.monto += c.monto; o.n++; o.conductas.add(INT.CONDUCTA[c.c]?.n || c.c); porActor.set(key, o); }
  const actores = [...porActor.values()].sort((a, b) => b.monto - a.monto);
  const PU = { um: a => `Director(a) de ${a.nombre}`, del: a => `Administrador(a) delegacional de ${String(a.nombre).replace(/^Delegación /, '')}`, oc: a => a.nombre };
  E.integ = [
    kp('escapado', {
      n: 'Pedidos maliciosos que pasaron', v: ig.planCost ? ig.escapado / ig.planCost : 0, fmt: 'pct2', dir: -1, meta: 0.005, crit: 0.02, w: 3,
      def: 'Valor de pedidos inflados, duplicados o desviados que ningún control frenó, contra el costo del plan.', formula: 'Σ monto escapado ÷ costo del plan', fuente: 'Meta interna del gemelo (Integridad del plan)',
      quien: 'Área central (dueña de los controles; el Órgano Interno de Control investiga)', det: `${mxn(ig.escapado)} en ${ig.nE} casos; los controles frenaron ${mxn(ig.frenado)}.`,
      of: actores.slice(0, 4).map(o => ({ quien: (PU[o.a.tipo] || (a => a.nombre))(o.a), txt: `${mxn(o.monto)} · ${[...o.conductas].join(', ')}`, nivel: o.monto > 1e6 ? 3 : 2 })),
    }),
    kp('falsas', {
      n: 'Alertas falsas de los controles', v: ig.fp, fmt: 'num', dir: -1, meta: 50, crit: 300, w: 0, info: true,
      def: 'Pedidos legítimos que los controles frenaron por error: quitan tiempo a las unidades honestas. Informativo: con los datos mínimos el control de consumo está apagado y por eso casi no hay falsas alarmas.', formula: 'pedidos legítimos frenados', fuente: 'Meta interna del gemelo',
      quien: 'Área central (calibración de reglas)',
    }),
  ];
  return ESLABONES.map(e => ({ ...e, kpis: E[e.id].map(k => ({ ...k, g: brecha(k), st: sinDato(k) ? 'nd' : semDe(brecha(k)) })) }));
}

// ------------------------------------------------------------------ atribución y llamadas
// Indicadores de resultado y los indicadores de arriba que los explican.
// Si alguno de arriba está fuera de meta, parte de la brecha se pasa a su eslabón
// (65 % si está en rojo, 25 % si está en ámbar).
// Una referencia "a?b" sólo cuenta si el indicador b también está fuera de meta (la falla de a sí llegó hasta aquí).
// Son reglas de atribución: los gemelos no están conectados, así que la torre aplica la regla, no la deduce.
export const DEP = {
  'prov.otif': ['compra.margen'], 'prov.cumplimiento': ['compra.margen'],                // sin contrato a tiempo no hay a quién exigirle
  'dnac.atiempo': ['cenadi.salidas'],
  'dnac.surtido': ['prov.otif', 'compra.contratado'],
  'dnac.estados': ['cenadi.salidas?dnac.atiempo', 'prov.otif?dnac.surtido'], 'dnac.abastoEst': ['cenadi.salidas?dnac.atiempo', 'prov.otif?dnac.surtido'],
  'alm.fill': ['prov.otif', 'dnac.surtido'],
  'dest.urg': ['alm.fill'],
  'unidad.recetas': ['alm.fill', 'dest.urg'],
};
function atribuir(eslabones) {
  const by = Object.fromEntries(eslabones.map(e => [e.id, e]));
  for (const e of eslabones) {
    const ks = e.kpis.filter(k => !k.info);
    e.st = ks.reduce((s, k) => (RANK[k.st] > RANK[s] ? k.st : s), 'ok');
    e.nCrit = ks.filter(k => k.st === 'crit').length; e.nWarn = ks.filter(k => k.st === 'warn').length;
  }
  const resp = Object.fromEntries(eslabones.map(e => [e.id, { propio: 0, heredado: 0, recibido: 0, de: {} }]));
  const K = {}; for (const e of eslabones) for (const k of e.kpis) K[e.id + '.' + k.id] = { e, k };
  for (const e of eslabones) {
    for (const k of e.kpis) {
      const refs = (DEP[e.id + '.' + k.id] || []).filter(r => { const g = r.split('?')[1]; return !g || (K[g] && K[g].k.st !== 'ok' && K[g].k.st !== 'nd'); }).map(r => K[r.split('?')[0]]).filter(Boolean);
      k.hereda = refs.length > 0; k.deN = refs.map(r => `${r.k.n} (${r.e.n})`);
      const x = k.g * k.w;
      if (!x) { k.f = 1; continue; }
      // el indicador de arriba que explica la falla: el peor de los que alimentan a éste
      const culpa = refs.filter(r => r.k.st === 'warn' || r.k.st === 'crit').sort((a, b) => RANK[b.k.st] - RANK[a.k.st] || b.k.g - a.k.g)[0] || null;
      const p = culpa ? (culpa.k.st === 'crit' ? 0.65 : 0.25) : 0;
      k.f = 1 - p; k.culpa = culpa ? culpa.e.id : null; k.culpaK = culpa ? culpa.k.n : null;
      resp[e.id].propio += x * (1 - p);
      if (p) { const c = culpa.e.id; resp[e.id].heredado += x * p; resp[c].recibido += x * p; resp[c].de[e.id] = (resp[c].de[e.id] || 0) + x * p; }
    }
    const h = e.kpis.filter(k => k.culpa && k.culpa !== e.id);
    e.culpa = h.length ? h.sort((a, b) => b.g * b.w - a.g * a.w)[0].culpa : null;
  }
  const tot = sum(Object.values(resp).map(r => r.propio + r.recibido)) || 1;
  const reparto = eslabones.map(e => ({ id: e.id, n: e.n, ic: e.ic, dueno: e.dueno, st: e.st, share: (resp[e.id].propio + resp[e.id].recibido) / tot, propio: resp[e.id].propio / tot, recibido: resp[e.id].recibido / tot, heredado: resp[e.id].heredado / tot, de: Object.keys(resp[e.id].de) }))
    .sort((a, b) => b.share - a.share);
  for (const e of eslabones) { e.share = reparto.find(r => r.id === e.id).share; e.resp = resp[e.id]; }

  // llamadas: una por indicador fuera de meta, ordenadas por responsabilidad propia
  const sistemico = ['dnac.estados', 'alm.fill', 'unidad.recetas'].filter(r => { const [a, b] = r.split('.'); const st = by[a].kpis.find(k => k.id === b).st; return st === 'warn' || st === 'crit'; }).length >= 2;   // el desabasto ya cruza varios eslabones
  const llamadas = [];
  for (const e of eslabones) for (const k of e.kpis) {
    if (k.info || k.st === 'ok' || k.st === 'nd') continue;
    const peso = k.g * k.w * k.f;
    // nivel 1: ámbar · nivel 2: rojo · nivel 3: rojo propio de alto impacto (peso 3 y muy lejos de la meta) o falla sistémica
    let nivel = k.st === 'warn' ? 1 : 2;
    if (k.st === 'crit' && k.w >= 3 && ((k.f >= 0.7 && k.g >= 1.5) || sistemico)) nivel = 3;
    if (k.f < 0.5 && nivel > 1) nivel -= 1;                                                 // la mayor parte viene de arriba: primero se llama allá
    llamadas.push({ eslabon: e.id, en: e.n, ic: e.ic, kpi: k.id, kn: k.n, quien: k.quien || e.dueno, v: k.v, fmt: k.fmt, meta: k.meta, dir: k.dir, st: k.st, nivel, peso, culpa: k.culpa ? by[k.culpa].n : null, culpaK: k.culpaK || null, f: k.f, of: k.of.slice(0, 3) });
  }
  llamadas.sort((a, b) => b.nivel - a.nivel || b.peso - a.peso);
  // nombres concretos: las personas o áreas más señaladas
  const nombres = [];
  for (const l of llamadas) for (const o of l.of) if (!o.obj) nombres.push({ quien: o.quien, txt: o.txt, nivel: Math.max(1, Math.min(3, o.nivel || 1)), en: l.en, kn: l.kn, peso: l.peso * (o.nivel || 1) });
  nombres.sort((a, b) => b.nivel - a.nivel || b.peso - a.peso);
  const vistos = new Set();
  return { reparto, llamadas, nombres: nombres.filter(n => (vistos.has(n.quien) ? false : vistos.add(n.quien))).slice(0, 12) };
}

// ------------------------------------------------------------------ estrella del norte
function estrellaNorte({ Hg, N, C, F, G }) {
  const rx = sum(Hg.units.map(u => u.rx)), full = sum(Hg.units.map(u => u.full));
  const items = [
    { id: 'recetas', n: 'Recetas surtidas completas', v: rx ? full / rx : 1, fmt: 'pct', meta: 0.97, crit: 0.90, dir: 1, alc: 'Piloto Hidalgo · 60 unidades · 30 días', fuente: 'MIR E018 ISSSTE: 97 %', serie: Hg.serie },
    { id: 'abasto', n: 'Abasto de los almacenes estatales', v: N.summary.abasto, fmt: 'pct', meta: 0.97, crit: 0.90, dir: 1, alc: 'Nacional · 32 estados · 30 días', fuente: 'ISSSTE abr-2026: 97 %', serie: dailyAbasto(N) },
    { id: 'contratado', n: 'Piezas del plan 2027 con contrato', v: C.kpi.cobertura, fmt: 'pct', meta: 0.99, crit: 0.95, dir: 1, alc: 'Nacional · compra consolidada 2027', fuente: 'Compra 2025-26: 99 %' },
    { id: 'expuesto', n: 'Dinero expuesto sin control', v: G.ig.escapado + F.summary.ocultoMxn, fmt: 'mxn', meta: 0, crit: 50e6, dir: -1, alc: 'Pedidos maliciosos del plan anual 2027 + producto de red fría dañado sin detectar en 30 días (periodos distintos)', fuente: 'Meta: cero' },
  ];
  for (const x of items) { x.g = brecha(x); x.st = sinDato(x) ? 'nd' : semDe(x.g); }
  return items;
}
function dailyAbasto(N) {
  const out = [];
  for (let d = 1; d <= NAC.DAYS; d++) { const h = d * 24; let D = 0, S = 0; for (const e of N.E) { D += e.cumD[h] - e.cumD[h - 24]; S += e.cumS[h] - e.cumS[h - 24]; } out.push(D ? S / D : 1); }
  return out;
}

// ------------------------------------------------------------------ cada unidad médica (para la vista 3D)
// st: 0 sin pendientes, 1 en plazo, 2 ámbar, 3 rojo. m: motivos para la ficha.
function unidadesDe({ G, Hg }) {
  const ig = {};
  for (const c of G.ig.casos) if (c.estado === 'escapado' && c.actor.tipo === 'um') { const o = ig[c.actor.clues] ||= { n: 0, monto: 0, c: new Set() }; o.n++; o.monto += c.monto; o.c.add(INT.CONDUCTA[c.c]?.n || c.c); }
  const hg = Object.fromEntries(Hg.units.map(u => [u.clues, u]));
  return G.U.units.map((u, i) => {
    const r = G.rs.unit[i], x = ig[u.clues], h = hg[u.clues], m = [];
    let st = r.inPlan ? (r.pend ? 1 : 0) : 0;
    const up = v => { if (v > st) st = v; };
    if (r.esc2) { up(3); m.push([3, `${pl(r.esc2, 'partida', 'partidas')} del plan con escalamiento a Central en su bandeja`]); }
    else if (r.venc) { up(2); m.push([2, `${pl(r.venc, 'partida', 'partidas')} del plan ${r.venc === 1 ? 'vencida' : 'vencidas'} en su bandeja`]); }
    if (r.infl) m.push([1, `${pl(r.infl, 'clave pedida', 'claves pedidas')} 50 % arriba de su consumo`]);
    if (r.alertas.length) { up(2); m.push([2, `${pl(r.alertas.length, 'alerta', 'alertas')} de integridad ${r.alertas.length === 1 ? 'frenada' : 'frenadas'} por los controles`]); }
    if (x) { up(3); m.push([3, `${pl(x.n, 'pedido malicioso que pasó', 'pedidos maliciosos que pasaron')} (${mxn(x.monto)}): ${[...x.c].join(', ')}`]); }
    let hgo = null;
    if (h) {
      const s = h.rx ? h.full / h.rx : 1, pe = h.pex ? h.pexOk / h.pex : 1;
      hgo = { rx: h.rx, s, den: h.den, reqs: h.reqs, reqLate: h.reqLate, pex: h.pex, pe, merma: h.merma };
      if (s < 0.9) { up(3); m.push([3, `recetas completas ${(s * 100).toFixed(1)} %`]); } else if (s < 0.97) { up(2); m.push([2, `recetas completas ${(s * 100).toFixed(1)} %`]); }
      if (h.pex && pe < 0.75) { up(2); m.push([2, `solo ${Math.round(pe * 100)} % de sus PEX en plazo`]); }
      if (h.reqLate) m.push([1, `${h.reqLate} de ${pl(h.reqs, 'urgencia', 'urgencias')} le ${h.reqLate === 1 ? 'llegó' : 'llegaron'} tarde`]);
    }
    return { i, clues: u.clues, nombre: u.nombre, tipo: u.tipo, nivel: u.nivel, cve: u.cve, st, venc: r.venc, esc2: r.esc2, pend: r.pend, fin: r.fin, inPlan: r.inPlan, integ: x ? { n: x.n, monto: x.monto } : null, hgo, m: m.sort((a, b) => b[0] - a[0]) };
  });
}

// ------------------------------------------------------------------ datos para las vistas por rol
function rolesDe({ G, F, Hg }) {
  const rs = G.rs, esc = {};
  for (const c of G.ig.casos) if (c.estado === 'escapado') {
    const a = c.actor, k = a.tipo === 'oc' ? 'oc' + a.i : a.tipo === 'del' ? 'del' + a.cve : a.tipo === 'um' ? 'um' + a.cve : null;
    if (!k) continue;
    const o = esc[k] ||= { n: 0, monto: 0, c: [] }; o.n++; o.monto += c.monto; const cn = INT.CONDUCTA[c.c]?.n || c.c; if (!o.c.includes(cn)) o.c.push(cn);
  }
  const frio = {};
  for (const l of F.losses) {
    if (l.t > RF.H) continue;
    const n = F.byId[l.where] || F.byId[String(l.where).split(':')[1]];
    if (!n || n.kind === 'cenadi') continue;
    const o = frio[n.cve] ||= { oculto: 0, baja: 0, nodos: {} };
    if (l.det) o.baja += l.mxn; else { o.oculto += l.mxn; const x = o.nodos[n.id] ||= { nombre: n.nombre, kind: n.kind, mxn: 0, label: l.label }; x.mxn += l.mxn; }
  }
  const mot = m => m.map(x => x.txt);
  const analistas = rs.ana.map(A => ({ a: A.a, nombre: `Analista ${A.a + 1} de Oficina Central`, pend: A.pend, venc: A.venc, esc1: A.esc1, esc2: A.esc2, oldest: A.oldest, dels: A.dels.map(d => d.cve), alertas: A.alertas.length, motivos: mot(A.motivos), sem: A.sem, integ: esc['oc' + A.a] || null }));
  const delegaciones = rs.del.map(D => {
    const fr = frio[D.d.cve] || { oculto: 0, baja: 0, nodos: {} };
    return {
      cve: D.d.cve, nombre: D.d.nombre, abbr: D.d.abbr, analista: analistaDe(D.i), pend: D.pend, venc: D.venc, esc2: D.esc2, oldest: D.oldest,
      uTot: D.uTot, uVenc: D.uVenc, uEsc2: D.uEsc2, uSinFin: D.uSinFin, uItemsVenc: D.uItemsVenc, desvCosto: D.desvCosto, sinCambios: D.sinCambios, aprob: D.aprob, neg: D.neg,
      alertas: D.alertas.length, uAlertas: D.uAlertas, motivos: mot(D.motivos), sem: D.sem, costo: D.costo, costo0: D.costo0,
      integ: esc['del' + D.d.cve] || null, integU: esc['um' + D.d.cve] || null,
      frio: { oculto: fr.oculto, baja: fr.baja, nodos: Object.values(fr.nodos).sort((a, b) => b.mxn - a.mxn).slice(0, 5) },
    };
  });
  const est = Object.fromEntries(Hg.est.map(c => [c.id, c]));
  const contratos = Hg.porK.map(k => ({ id: k.id, prov: k.prov, objeto: k.objeto, otif: k.otifPct, cump: k.cumplimiento, rech: k.rechazoPct, atraso: k.atrasoProm, penas: k.penasDevengadas, cobradas: k.penasCobradas, rescisiones: k.rescisiones, entregas: k.entregas, vencidas: k.vencidas, estado: est[k.id]?.estado, sem: est[k.id]?.sem, penasTot: est[k.id]?.penas }));
  return { analistas, delegaciones, contratos, plan: { now: rs.now, esc: rs.esc } };
}

// ------------------------------------------------------------------ matriz por delegación
function matrizDelegaciones({ G, N, F }) {
  const H = NAC.H;
  const nac = Object.fromEntries(N.E.map(e => [e.cve, e]));
  const perd = {};
  for (const l of F.losses) {
    const n = F.byId[l.where] || F.byId[String(l.where).split(':')[1]];
    if (l.t > RF.H || !n || n.kind === 'cenadi') continue;                             // el CENADI no es de ninguna delegación
    const cve = n.cve; if (!cve) continue;
    const o = perd[cve] ||= { oculto: 0, baja: 0 };
    if (l.det) o.baja += l.mxn; else o.oculto += l.mxn;
  }
  const integ = {};
  for (const c of G.ig.casos) if (c.estado === 'escapado' && c.actor.cve) { const o = integ[c.actor.cve] ||= { n: 0, monto: 0 }; o.n++; o.monto += c.monto; }
  const cols = [
    { id: 'plan', n: 'Planeación', sub: 'bandeja y costo del plan', ic: '📋' },
    { id: 'abasto', n: 'Abasto estatal', sub: 'demanda atendida, 30 días', ic: '📦' },
    { id: 'llegada', n: 'Llegadas del CENADI', sub: 'a tiempo', ic: '🚛' },
    { id: 'frio', n: 'Red fría', sub: 'dañado sin detectar', ic: '❄️' },
    { id: 'integ', n: 'Integridad', sub: 'pedidos maliciosos que pasaron', ic: '🛡️' },
  ];
  const rows = G.U.delegaciones.map((d, i) => {
    const r = G.rs.del[i], e = nac[d.cve];
    const sh = e ? e.ships.filter(s => s.arr <= H) : [];
    const ab = e && e.cumD[H] ? e.cumS[H] / e.cumD[H] : 1;
    const late = sh.length ? sh.filter(s => s.late).length / sh.length : 0;
    const p = perd[d.cve] || { oculto: 0, baja: 0 }, ig = integ[d.cve] || { n: 0, monto: 0 };
    const semPlan = r.sem === 'crit' || r.esc2 ? 'crit' : r.sem === 'warn' || r.venc ? 'warn' : 'ok';
    const c = {
      plan: { st: semPlan, v: r.venc ? `${r.venc.toLocaleString('es-MX')} venc.` : r.desvCosto > 0.1 ? `+${Math.round(r.desvCosto * 100)} % costo` : 'al día', det: r.motivos.map(m => m.txt).join(' · ') || 'sin pendientes vencidos' },
      abasto: { st: semDe(brecha({ v: ab, meta: 0.97, crit: 0.9, dir: 1 })), v: `${(ab * 100).toFixed(1)} %`, det: e ? `${Math.round(e.outH[H] / 24 * 10) / 10} días en cero` : '' },
      llegada: { st: semDe(brecha({ v: 1 - late, meta: 0.95, crit: 0.85, dir: 1 })), v: `${Math.round((1 - late) * 100)} %`, det: `${sh.length - Math.round(late * sh.length)} de ${sh.length} embarques a tiempo` },
      frio: { st: semDe(brecha({ v: p.oculto, meta: 0, crit: 250000, dir: -1 })), v: p.oculto ? mxnK(p.oculto) : '—', det: `oculto ${mxn(p.oculto)} · dado de baja ${mxn(p.baja)}` },
      integ: { st: semDe(brecha({ v: ig.monto, meta: 0, crit: 2e6, dir: -1 })), v: ig.n ? `${ig.n} · ${mxnK(ig.monto)}` : '—', det: ig.n ? `${pl(ig.n, 'caso que pasó', 'casos que pasaron')} los controles` : 'sin casos' },
    };
    const score = sum(Object.values(c).map(x => RANK[x.st] ** 2));
    return { cve: d.cve, nombre: d.nombre, abbr: d.abbr, dueno: `Administrador(a) delegacional de ${d.nombre}`, analista: `Analista ${analistaDe(i) + 1} de Oficina Central`, piloto: d.cve === '13', c, score };
  }).sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre));
  return { cols, rows };
}

export const mxn = v => '$' + Math.round(v || 0).toLocaleString('es-MX');
export const mxnK = v => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `$${Math.round(v / 1e3)} mil` : mxn(v));
export function fmtV(v, f) {
  if (v == null || !isFinite(v)) return '—';
  switch (f) {
    case 'pct': return `${(v * 100).toFixed((v >= 0.9 && v < 1) || (v < 0.1 && v > 0) ? 1 : 0).replace(/\.0$/, '')} %`;
    case 'pct1': return `${(v * 100).toFixed(1)} %`;
    case 'pct2': return `${(v * 100).toFixed(2)} %`;
    case 'dias': return `${Math.round(v)} días`;
    case 'diash': return `${Math.round(v)} días hábiles`;
    case 'min': return `${Math.round(v)} min`;
    case 'mxn': return mxnK(v);
    default: return Math.round(v).toLocaleString('es-MX');
  }
}
export { ANALISTAS };

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  plan-engine.js · Módulo 1. Planeación (plan anual de necesidades)
//
//  Implementa el flujo de los requerimientos ATDT del Módulo 1. Necesidades
//  (Sprint 1 configuración y catálogos, Sprint 2 asignación de insumos,
//  Sprint 3 aprobación, negociación, programas especiales y cierre):
//   · Plan con 5 pasos de configuración y etapas en orden estricto.
//   · Catálogos del plan: unidades (CLUES ISSSTE ago 2026), insumos (CNIS) y
//     kits (insumos exclusivos por kit dentro del plan).
//   · Asignación por Área Central con propuesta mínima, máxima y reparto
//     mensual. La propuesta automática sale del pronóstico del gemelo
//     (Holt-Winters mensual sobre 36 meses de consumo).
//   · Aprobación en tres niveles (Unidad → Delegación → Oficina Central) con
//     Aprobar, Rechazar o Negociar, versiones de la propuesta y observaciones.
//   · Simulación del ciclo: cada unidad, delegación y Central actúa con reglas
//     y tiempos; se mide rondas, días y desviación contra la necesidad real.
//  Todo es determinista: el estado se reconstruye repitiendo la bitácora.
// =====================================================================
import { holtWinters } from './forecast.js';

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const HIST = 36;                       // meses de consumo: nov 2023 a oct 2026
const HIST_START = { y: 2023, m: 10 };        // índice de mes 0-11 (10 = noviembre)
export const PESO = { CAF: 1, UMF: 3, CMF: 6, CE: 6, CH: 12, HG: 25, HR: 50 };
// precio de referencia por pieza de despacho (supuesto del modelo, MXN)
const PRECIO_GRUPO = { Analgesia: 18, Anestesia: 120, Cardiología: 45, Endocrinología: 60, Infecciosas: 55, Gastroenterología: 30, Soluciones: 22, Neumología: 140, Hematología: 90, Inmunoalergia: 25, 'Gineco-obstetricia': 15 };
const ESTACION = { Neumología: 0.30, Infecciosas: 0.25, Inmunoalergia: 0.20, Analgesia: 0.10 };
const TENDENCIA = { Endocrinología: 0.06, Cardiología: 0.06 };

// ---------------------------------------------------------------- catálogos de estatus (requerimientos)
export const PLAN_ST = { config: 'Pendiente de configuración', proceso: 'En proceso', validacion: 'Pendiente de validación', finalizado: 'Finalizado', cerrado: 'Cerrado', cancelado: 'Cancelado' };
export const ETAPAS = [
  { id: 'inicial', n: 'Configuración inicial' },
  { id: 'catalogos', n: 'Configuración de catálogos institucionales' },
  { id: 'asignacion', n: 'Asignación de insumos' },
  { id: 'programas', n: 'Programas especiales' },
  { id: 'aprobacion', n: 'Aprobación de insumos' },
  { id: 'cierre', n: 'Cierre del plan' },
];
export const ASIG_ST = { sin: 'Sin asignación', pendiente: 'Pendiente', porconfirmar: 'Por confirmar', confirmado: 'Confirmado', finalizado: 'Finalizado' };
export const DICT = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', negociacion: 'Negociación', revision: 'En revisión', porvalidar: 'Por validar' };
export const NIVELES = ['um', 'del', 'oc'];
export const NIVEL_N = { um: 'Unidad médica', del: 'Delegación', oc: 'Oficina Central' };
export const METODOS = { pronostico: 'Pronóstico del gemelo (Holt-Winters)', regla: 'Mínimo + 10 % repartido igual (HU08)', anterior: 'Consumo del año anterior' };

// ---------------------------------------------------------------- universo: unidades, delegaciones, insumos, historia
export function buildUniverse(issste, meds) {
  const delegaciones = issste.estados.map(e => ({ cve: e.cve, nombre: e.nombre, abbr: e.abbr, region: e.region, responsable: `Resp. ${e.abbr}`, units: [] }));
  const delBy = Object.fromEntries(delegaciones.map(d => [d.cve, d]));
  const units = issste.unidades.map((u, i) => ({ i, clues: u.clues, nombre: u.nombre, tipo: u.tipo, nivel: u.nivel, cve: u.cve, mun: u.mun, peso: PESO[u.tipo] || 1, responsable: `Resp. ${u.clues.slice(-4)}` }));
  for (const u of units) delBy[u.cve].units.push(u.i);
  const claves = meds.items.map((m, k) => ({
    k, clave: m.c, nombre: m.n, desc: m.d, grupo: m.g, uso: m.u, pz: m.pz, pack: m.pack, w: m.w || 0, frio: !!m.frio, ven: m.ven, tipo: 'Medicamento',
    precio: Math.round((PRECIO_GRUPO[m.g] || 40) * (m.frio ? 3.5 : 1) * (m.g === 'Anestesia' && /Sevoflurano/.test(m.n) ? 12 : 1)),
  }));
  return { delegaciones, delBy, units, claves };
}

// serie histórica, necesidad real 2027 y pronóstico de un par unidad-clave
export function seriesFor(U, u, c) {
  const r = mulberry32(hash(u.clues + '|' + c.clave));
  const base = c.uso === 'F' ? Math.max(0.5, c.w) * u.peso * 6 : u.peso * (c.grupo === 'Soluciones' ? 8 : c.grupo === 'Anestesia' ? 2 : 1.2);
  const amp = ESTACION[c.grupo] || 0.03, tr = TENDENCIA[c.grupo] || 0.02;
  const level = base * (0.7 + 0.6 * r());
  const hist = new Float32Array(HIST);
  for (let t = 0; t < HIST; t++) {
    const mo = (HIST_START.m + t) % 12;
    const season = 1 + amp * Math.cos(2 * Math.PI * (mo - 0) / 12);           // pico en enero
    let v = level * season * (1 + tr * t / 12) * Math.exp(0.12 * gauss(r));
    if (r() < 0.02) v *= 0.15;                                                // mes con desabasto (consumo censurado)
    hist[t] = Math.max(0, Math.round(v));
  }
  // cambio estructural para 2027 (lo sabe la unidad, no el pronóstico)
  let cambio = 1, motivo = '';
  const ru = mulberry32(hash('u' + u.clues))();
  if (ru < 0.15) { cambio *= 1.1 + 0.2 * mulberry32(hash('g' + u.clues))(); motivo = 'más derechohabientes adscritos'; }
  const rc = r();
  if (rc < 0.06) { cambio *= 1.3 + 0.5 * r(); motivo = 'servicio nuevo o médico especialista'; }
  else if (rc < 0.09) { cambio *= 0.2 + 0.3 * r(); motivo = 'sustitución terapéutica'; }
  else if (rc < 0.105 && u.nivel === 1) { cambio = 0; motivo = 'la clave ya no se prescribe'; }
  const real = new Float32Array(12);
  for (let m = 0; m < 12; m++) {
    const season = 1 + amp * Math.cos(2 * Math.PI * m / 12);
    real[m] = Math.max(0, Math.round(level * season * (1 + tr * (HIST + 2 + m) / 12) * cambio * Math.exp(0.08 * gauss(r))));
  }
  return { hist, real, cambio, motivo };
}

export function proposalFor(hist, metodo) {
  const last12 = Array.from(hist.slice(-12));
  const sum12 = last12.reduce((a, b) => a + b, 0);
  if (metodo === 'regla') {
    const min = Math.round(sum12), max = Math.round(sum12 * 1.2);
    const mes = Math.round(min * 1.1 / 12);
    return { min, max, months: Array(12).fill(mes), tipo: 'mensual' };
  }
  if (metodo === 'anterior') {
    // mismos meses del año anterior: ene–dic 2026 = índices 26..35 + nov, dic 2025
    const months = MESES.map((_, m) => Math.round(hist[(m + 12 - HIST_START.m + 12) % 12 + 24] ?? sum12 / 12));
    const min = months.reduce((a, b) => a + b, 0);
    return { min, max: Math.round(min * 1.15), months, tipo: 'mensual' };
  }
  const r = holtWinters(Array.from(hist), 14, [0.3, 0.05, 0.3], 12, 0.95);
  const fc = r.fc.slice(2, 14).map(v => Math.max(0, v));            // ene–dic 2027
  const months = fc.map(v => Math.round(v));
  const min = months.reduce((a, b) => a + b, 0);
  const max = Math.round(min + Math.min(min * 0.3, 1.65 * r.sd * Math.sqrt(12)));
  return { min, max: Math.max(max, Math.ceil(min * 1.05)), months, tipo: 'mensual' };
}

// ---------------------------------------------------------------- plan
let PLAN_SEQ = 204;
export function newPlan(cfg) {
  const id = cfg.id || `PL_0${PLAN_SEQ++}`;
  return {
    id, folio: `${id} · ISSSTE`, nombre: cfg.nombre, periodicidad: cfg.periodicidad || 'Anual', tipo: cfg.tipo || 'Completo',
    inicio: cfg.inicio, fin: cfg.fin, periodos: cfg.periodos, creado: cfg.t || 0, status: 'config', etapa: 'catalogos',
    unitsOut: new Set(), clavesOut: new Set(), unitsDone: false, clavesDone: false, kitsDone: false, kits: [], programas: [],
    items: new Map(), byUnit: new Map(), unitSt: new Map(), log: [], notif: [], cierre: null, cancel: null, day: 0, metodo: cfg.metodo || 'pronostico',
    sim: { colchon: 0.15, capDel: 8, capOC: 60, tolOC: 0.10, presupuesto: 1.05, ...(cfg.sim || {}) }, hist: [],
    sla: { um: 5, del: 5, oc: 3, ...(cfg.sla || {}) }, hitos: { um: 0.35, del: 0.6, oc: 0.85, ...(cfg.hitos || {}) },
  };
}
export function unitsIn(U, P) { return U.units.filter(u => !P.unitsOut.has(u.clues)); }
export function clavesIn(U, P) { return U.claves.filter(c => !P.clavesOut.has(c.clave)); }
export function clavesForUnit(U, P, u) { return clavesIn(U, P).filter(c => u.nivel > 1 || c.uso === 'F'); }
const key = (clues, clave) => clues + '|' + clave;

function note(P, who, txt, extra = {}) {
  P.log.push({ t: P.day, who, txt, ...extra });
  if (P.log.length > 4000) P.log.splice(0, 1000);
}
function notify(P, to, txt, ent = null) { P.notif.push({ t: P.day, to, txt, ent }); if (P.notif.length > 600) P.notif.splice(0, 200); }

// crea o actualiza la asignación de un par unidad-clave
function assign(U, P, u, c, prop, origin, who) {
  const k = key(u.clues, c.clave);
  let it = P.items.get(k);
  if (!it) {
    const s = seriesFor(U, u, c);
    it = { u: u.i, k: c.k, origin, hist: s.hist, real: s.real, cambio: s.cambio, motivo: s.motivo, versions: [], ev: [], hold: { um: 0, del: 0, oc: 0 }, late: { um: 0, del: 0, oc: 0 }, holder: null, since: 0, st: { um: 'pendiente', del: 'pendiente', oc: 'pendiente' }, obs: { um: '', del: '', oc: '' }, round: 0, decidedAt: {}, asig: 'pendiente' };
    P.items.set(k, it);
    if (!P.byUnit.has(u.clues)) P.byUnit.set(u.clues, []);
    P.byUnit.get(u.clues).push(k);
  }
  if (prop) {
    it.tipo = prop.tipo; it.min = prop.min; it.max = prop.max; it.months = prop.months.slice(); it.prop0 = it.prop0 || { min: prop.min, max: prop.max, months: prop.months.slice() };
    it.versions.push({ by: who, t: P.day, min: prop.min, max: prop.max, months: prop.months.slice(), obs: prop.obs || '' });
    it.ev.push({ t: P.day, lvl: who, d: who === 'um' ? 'solicitar' : 'asignar', q: prop.months.reduce((a, b) => a + b, 0) });
    it.asig = prop.validar ? 'confirmado' : 'porconfirmar';
  }
  return it;
}
export const total = it => (it.months ? it.months.reduce((a, b) => a + b, 0) : 0);
export const outOfRange = it => it.months && (total(it) < it.min || total(it) > it.max);

// ---------------------------------------------------------------- acciones (cada una se registra en la bitácora del plan)
export const ACTIONS = {
  crear(U, P, a) { note(P, 'Área central', `Plan ${P.id} creado: ${P.nombre}`); P.status = 'config'; },
  quitarUnidades(U, P, a) { a.clues.forEach(c => P.unitsOut.add(c)); note(P, 'Área central', `${a.clues.length} unidades quitadas del catálogo del plan`); },
  regresarUnidades(U, P, a) { a.clues.forEach(c => P.unitsOut.delete(c)); note(P, 'Área central', `${a.clues.length} unidades regresadas al catálogo`); },
  finalizarUnidades(U, P) { P.unitsDone = true; note(P, 'Área central', 'Catálogo de unidades finalizado'); },
  cancelarUnidades(U, P) { P.unitsDone = false; P.clavesDone = false; P.kitsDone = false; note(P, 'Área central', 'Se canceló la finalización del catálogo de unidades'); },
  quitarClaves(U, P, a) { a.claves.forEach(c => P.clavesOut.add(c)); note(P, 'Área central', `${a.claves.length} insumos quitados del catálogo del plan`); },
  regresarClaves(U, P, a) { a.claves.forEach(c => P.clavesOut.delete(c)); note(P, 'Área central', `${a.claves.length} insumos regresados al catálogo`); },
  finalizarClaves(U, P) { P.clavesDone = true; note(P, 'Área central', 'Catálogo de insumos finalizado'); },
  cancelarClaves(U, P) { P.clavesDone = false; P.kitsDone = false; note(P, 'Área central', 'Se canceló la finalización del catálogo de insumos'); },
  crearKit(U, P, a) {
    if (P.kits.some(k => k.nombre === a.nombre)) throw new Error('Ya existe un kit con ese nombre en el plan (RN_14)');
    const used = new Set(P.kits.flatMap(k => k.claves));
    if (a.claves.some(c => used.has(c))) throw new Error('Un insumo solo puede estar en un kit activo del plan');
    P.kits.push({ id: 'K' + String(P.kits.length + 1).padStart(3, '0'), nombre: a.nombre, desc: a.desc || '', tipologia: a.tipologia || 'Sin tipología', nivel: a.nivel || 'Todos', claves: a.claves.slice() });
    note(P, 'Área central', `Kit creado: ${a.nombre} (${a.claves.length} insumos)`);
  },
  finalizarKits(U, P) { P.kitsDone = true; P.etapa = 'asignacion'; P.status = 'proceso'; note(P, 'Área central', 'Etapa 1 concluida: catálogos institucionales configurados'); notify(P, 'del', 'Inició la asignación de insumos del plan'); },
  asignarAuto(U, P, a) {
    const metodo = a.metodo || P.metodo; P.metodo = metodo;
    let n = 0;
    for (const u of unitsIn(U, P)) for (const c of clavesForUnit(U, P, u)) {
      const k = key(u.clues, c.clave);
      if (P.items.has(k) && P.items.get(k).versions.length) continue;
      const s = seriesFor(U, u, c);
      const prop = proposalFor(s.hist, metodo);
      if (prop.min === 0 && prop.max === 0) continue;
      assign(U, P, u, c, { ...prop, validar: a.validar }, kitOf(P, c.clave) ? 'Kit' : 'Fuera de kit', 'oc');
      n++;
    }
    note(P, 'Área central', `Asignación automática (${METODOS[metodo]}): ${n.toLocaleString('es-MX')} pares unidad-insumo`);
  },
  asignarManual(U, P, a) {
    for (const clues of a.clues) {
      const u = U.units.find(x => x.clues === clues);
      for (const cl of a.claves) {
        const c = U.claves.find(x => x.clave === cl);
        const prop = a.prop || null;
        const it = assign(U, P, u, c, prop, kitOf(P, cl) ? 'Kit' : 'Fuera de kit', 'oc');
        if (!prop) it.asig = 'pendiente';
      }
    }
    note(P, 'Área central', `Asignación manual: ${a.claves.length} insumos a ${a.clues.length} unidades${a.prop ? '' : ' (sin piezas)'}`);
  },
  asignarPiezas(U, P, a) {
    const it = P.items.get(a.key); const u = U.units[it.u], c = U.claves[it.k];
    assign(U, P, u, c, a.prop, it.origin, 'oc');
    note(P, 'Área central', `Piezas asignadas: ${c.nombre} a ${u.nombre}`);
  },
  finalizarAsignacion(U, P) {
    P.etapa = 'aprobacion'; P.status = 'validacion'; P.day = 0;
    for (const it of P.items.values()) if (it.months) it.asig = 'finalizado';
    for (const u of unitsIn(U, P)) P.unitSt.set(u.clues, { um: false, del: false, oc: false, umDay: null, delDay: null, ocDay: null });
    note(P, 'Área central', 'Asignación de insumos finalizada; inicia la aprobación por las unidades');
    notify(P, 'um', 'Tienes insumos asignados por revisar en el plan de necesidades');
    notify(P, 'del', 'Inició el periodo de aprobación de insumos de tus unidades');
  },
  // dictamen de un nivel sobre un insumo de una unidad
  dictamen(U, P, a) {
    const it = P.items.get(a.key); if (!it) return;
    const u = U.units[it.u], c = U.claves[it.k];
    const lvl = a.nivel;
    it.st[lvl] = a.d === 'negociar' ? 'negociacion' : a.d === 'aprobar' ? 'aprobado' : 'rechazado';
    it.obs[lvl] = a.obs || it.obs[lvl];
    it.decidedAt[lvl] = P.day;
    if (a.d === 'negociar' && a.prop) {
      it.tipo = a.prop.tipo || it.tipo;
      it.months = a.prop.months.slice();
      it.versions.push({ by: lvl, t: P.day, min: it.min, max: it.max, months: a.prop.months.slice(), obs: a.obs || '' });
      it.round++;
      if (lvl !== 'um') { it.st.um = 'revision'; if (lvl === 'oc') it.st.del = 'revision'; }
    }
    if (lvl === 'oc' && a.d === 'aprobar') { it.st.um = it.st.um === 'rechazado' ? 'rechazado' : 'aprobado'; it.st.del = it.st.del === 'rechazado' ? 'rechazado' : 'aprobado'; }
    if (lvl === 'oc' && a.d === 'rechazar') { it.st.um = 'rechazado'; it.st.del = 'rechazado'; }
    if (lvl === 'um') {                                   // la respuesta de la unidad vuelve a pasar por la delegación y Central
      if (['revision', 'negociacion'].includes(it.st.del)) it.st.del = 'pendiente';
      if (['revision', 'negociacion'].includes(it.st.oc)) it.st.oc = 'pendiente';
    }
    it.ev.push({ t: P.day, lvl, d: a.d, q: a.d === 'rechazar' ? 0 : total(it) });
    if (!a.sim) note(P, NIVEL_N[lvl], `${DICT[it.st[lvl]]}: ${c.nombre} · ${u.nombre}${a.obs ? ` · "${a.obs.slice(0, 80)}"` : ''}`, { key: a.key });
  },
  solicitar(U, P, a) {
    const u = U.units.find(x => x.clues === a.clues), c = U.claves.find(x => x.clave === a.clave);
    const it = assign(U, P, u, c, { ...a.prop }, 'Solicitud de la unidad', 'um');
    it.st = { um: 'porvalidar', del: 'pendiente', oc: 'pendiente' }; it.obs.um = a.obs; it.solicitado = true;
    note(P, 'Unidad médica', `Solicitud de insumo nuevo: ${c.nombre} · ${u.nombre}`, { key: key(a.clues, a.clave) });
    notify(P, 'del', `${u.nombre} solicitó ${c.nombre}`, { clues: u.clues, cve: u.cve });
  },
  finalizarVerif(U, P, a) {
    const s = P.unitSt.get(a.clues); if (!s) return;
    const u = U.units.find(x => x.clues === a.clues);
    s[a.nivel] = true; s[a.nivel + 'Day'] = P.day;
    if (!a.sim) note(P, NIVEL_N[a.nivel], `Verificación finalizada: ${u.nombre}`);
    notify(P, a.nivel === 'um' ? 'del' : a.nivel === 'del' ? 'oc' : 'um', `${NIVEL_N[a.nivel]} finalizó la verificación de ${u.nombre}`, { clues: u.clues, cve: u.cve });
    checkPlanDone(U, P);
  },
  aprobarTodo(U, P, a) {
    for (const [k, it] of unitItems(P, a.clues)) if (it.months && it.st.oc !== 'aprobado' && it.st.oc !== 'rechazado') ACTIONS.dictamen(U, P, { key: k, nivel: 'oc', d: a.d, obs: a.obs, sim: true });
    note(P, 'Oficina Central', `${a.d === 'aprobar' ? 'Aprobó' : 'Rechazó'} todos los insumos de ${U.units.find(x => x.clues === a.clues).nombre}`);
  },
  crearPrograma(U, P, a) {
    if (P.programas.some(p => p.nombre === a.nombre)) throw new Error('El nombre del programa ya existe en el plan');
    const id = String(20260000000000 + P.programas.length + 1);
    P.programas.push({ id, nombre: a.nombre, periodo: a.periodo, objetivos: a.objetivos, desc: a.desc, kits: a.kits || [], claves: a.claves || [], piezas: a.piezas || {}, estatus: 'Vigente', creado: P.day });
    note(P, 'Área central', `Programa especial creado: ${a.nombre}`);
  },
  editarPrograma(U, P, a) { const p = P.programas.find(x => x.id === a.id); Object.assign(p, a.cambios); note(P, 'Área central', `Programa especial editado: ${p.nombre}`); },
  cerrar(U, P, a) { P.cierre = { archivo: a.archivo, t: P.day, por: a.por || 'Aprobador firmante' }; P.status = 'cerrado'; P.etapa = 'cierre'; note(P, 'Aprobador firmante', `Plan cerrado con el oficio ${a.archivo}`); notify(P, 'all', 'Se ha cerrado el plan de necesidades'); },
  cancelar(U, P, a) { P.cancel = { motivo: a.motivo, t: P.day, por: 'Área central' }; P.status = 'cancelado'; note(P, 'Área central', `Plan cancelado: ${a.motivo}`); },
  editarConfig(U, P, a) { Object.assign(P, a.cambios); note(P, 'Área central', `Configuración inicial editada: ${a.motivo}`); },
  sim(U, P, a) { for (let d = 0; d < a.days; d++) simDay(U, P); },
  simCfg(U, P, a) { Object.assign(P.sim, a.cfg); },
  plazos(U, P, a) { Object.assign(P.sla, a.sla || {}); Object.assign(P.hitos, a.hitos || {}); note(P, 'Área central', 'Plazos del periodo de aprobación actualizados'); },
};
function kitOf(P, clave) { return P.kits.find(k => k.claves.includes(clave)); }
function checkPlanDone(U, P) {
  if (P.status !== 'validacion') return;
  for (const s of P.unitSt.values()) if (!s.oc) return;
  P.status = 'finalizado'; P.etapa = 'cierre';
  note(P, 'Oficina Central', 'Todas las unidades verificadas: el plan pasa a Finalizado');
  notify(P, 'firmante', 'El plan está Finalizado; descarga el documento de cierre y sube el oficio firmado');
}

// ---------------------------------------------------------------- estado de cada unidad y del plan
export function unitItems(P, clues) { return (P.byUnit.get(clues) || []).map(k => [k, P.items.get(k)]); }
export function unitAsigStatus(P, clues) {
  const L = unitItems(P, clues);
  if (!L.length) return 'sin';
  if (L.some(([, it]) => !it.months)) return 'pendiente';
  if (L.every(([, it]) => it.asig === 'finalizado')) return 'finalizado';
  if (L.every(([, it]) => it.asig === 'confirmado')) return 'confirmado';
  return 'porconfirmar';
}
// lo que le toca hacer a cada nivel sobre un insumo
export function needs(it, lvl) {
  if (!it.months && !it.solicitado) return false;
  if (lvl === 'um') return it.st.um === 'pendiente' || it.st.um === 'revision';
  if (lvl === 'del') return it.st.um !== 'pendiente' && it.st.um !== 'revision' && (it.st.del === 'pendiente' || it.st.del === 'revision');
  if (lvl === 'oc') return ['aprobado', 'rechazado'].includes(it.st.del) && it.st.oc === 'pendiente';
  return false;
}
export function canFinalize(P, clues, lvl) {
  const s = P.unitSt.get(clues); if (!s) return false;
  if (lvl === 'del' && !s.um) return false;
  if (lvl === 'oc' && !s.del) return false;
  const L = unitItems(P, clues).filter(([, it]) => it.months);
  if (lvl === 'um') return L.every(([, it]) => !needs(it, 'um'));
  if (lvl === 'del') return L.every(([, it]) => ['aprobado', 'rechazado'].includes(it.st.del));
  return L.every(([, it]) => ['aprobado', 'rechazado'].includes(it.st.oc));
}

// ---------------------------------------------------------------- simulación de actores (un día hábil)
function actorRng(P, who, day) { return mulberry32(hash(P.id + '|' + who + '|' + day)); }
function perceived(U, P, it) {
  const r = mulberry32(hash('p|' + it.u + '|' + it.k));
  const real = it.real.reduce((a, b) => a + b, 0);
  return real * (1 + P.sim.colchon + 0.05 * gauss(r));
}
function scaleMonths(months, target) {
  const s = months.reduce((a, b) => a + b, 0) || 1;
  return months.map(v => Math.max(0, Math.round(v * target / s)));
}
function simDay(U, P) {
  if (P.status !== 'validacion') { if (P.status === 'finalizado' && P.flow && !P.flow[P.day] && !P.flowEnd) { tickHolders(U, P); P.flowEnd = P.day; } if (P.status === 'finalizado' && !P.cierre && P.day - (P.finDay ?? P.day) >= 2) ACTIONS.cerrar(U, P, { archivo: 'oficio_cierre_plan.pdf', por: 'Aprobador firmante (simulado)' }); P.day++; return; }
  const day = P.day;
  tickHolders(U, P);
  const cap = { del: {}, oc: 0 };
  for (const u of unitsIn(U, P)) {
    const s = P.unitSt.get(u.clues); if (!s) continue;
    const L = unitItems(P, u.clues).filter(([, it]) => it.months);
    // --- unidad: arranca tras su demora; responde lo pendiente o en revisión
    const r = actorRng(P, 'um' + u.clues, day);
    const start = Math.floor(mulberry32(hash('start' + u.clues))() * 7);
    if (day >= start && L.some(([, it]) => needs(it, 'um')) && r() < 0.85) {
      for (const [k, it] of L) if (needs(it, 'um')) {
        const want = perceived(U, P, it), tot = total(it);
        if (it.real.reduce((a, b) => a + b, 0) === 0) ACTIONS.dictamen(U, P, { key: k, nivel: 'um', d: 'rechazar', obs: 'La clave ya no se prescribe en la unidad', sim: true });
        else if (want > tot * 1.10 && it.round < 4) ACTIONS.dictamen(U, P, { key: k, nivel: 'um', d: 'negociar', obs: it.motivo ? `Se requiere más por ${it.motivo}` : 'El consumo real de la unidad es mayor a la propuesta', prop: { months: scaleMonths(it.months, it.round ? (want + tot) / 2 : want) }, sim: true });
        else ACTIONS.dictamen(U, P, { key: k, nivel: 'um', d: 'aprobar', sim: true });
      }
      if (!s.um && canFinalize(P, u.clues, 'um')) ACTIONS.finalizarVerif(U, P, { clues: u.clues, nivel: 'um', sim: true });
    }
    if (!s.um && canFinalize(P, u.clues, 'um') && day >= start) ACTIONS.finalizarVerif(U, P, { clues: u.clues, nivel: 'um', sim: true });
  }
  // --- delegaciones: revisan unidades ya verificadas, con capacidad diaria
  for (const d of U.delegaciones) {
    let cupo = P.sim.capDel;
    for (const ui of d.units) {
      if (cupo <= 0) break;
      const u = U.units[ui]; const s = P.unitSt.get(u.clues); if (!s || !s.um) continue;
      const L = unitItems(P, u.clues).filter(([, it]) => it.months && needs(it, 'del'));
      if (!L.length) { if (!s.del && canFinalize(P, u.clues, 'del')) ACTIONS.finalizarVerif(U, P, { clues: u.clues, nivel: 'del', sim: true }); continue; }
      cupo--;
      for (const [k, it] of L) {
        const h12 = Array.from(it.hist.slice(-12)).reduce((a, b) => a + b, 0), tot = total(it);
        if (it.st.um === 'aprobado') ACTIONS.dictamen(U, P, { key: k, nivel: 'del', d: 'aprobar', sim: true });
        else if (it.st.um === 'rechazado') {
          if (h12 < 0.2 * it.prop0.min || it.cambio === 0) ACTIONS.dictamen(U, P, { key: k, nivel: 'del', d: 'rechazar', obs: 'Sin consumo que justifique la clave', sim: true });
          else ACTIONS.dictamen(U, P, { key: k, nivel: 'del', d: 'negociar', obs: 'Hay consumo histórico; se propone mantener la clave', prop: { months: it.prop0.months }, sim: true });
        } else if (it.st.um === 'negociacion' || it.st.um === 'porvalidar') {
          const lim = Math.max(h12 * 1.25, it.max * 1.15);
          if (tot <= lim || it.round >= 3 || (it.motivo && it.cambio > 1.2)) ACTIONS.dictamen(U, P, { key: k, nivel: 'del', d: 'aprobar', obs: 'Justificado por la delegación', sim: true });
          else ACTIONS.dictamen(U, P, { key: k, nivel: 'del', d: 'negociar', obs: 'Se ajusta al consumo histórico de la unidad', prop: { months: scaleMonths(it.months, (tot + it.prop0.min) / 2) }, sim: true });
        }
      }
      if (!s.del && canFinalize(P, u.clues, 'del')) ACTIONS.finalizarVerif(U, P, { clues: u.clues, nivel: 'del', sim: true });
    }
  }
  // --- Oficina Central: revisa unidades verificadas por la delegación, con presupuesto
  let cupoOC = P.sim.capOC;
  const pres = budget(U, P);
  let comprometido = committedCost(U, P);
  for (const u of unitsIn(U, P)) {
    if (cupoOC <= 0) break;
    const s = P.unitSt.get(u.clues); if (!s || !s.del || s.oc) continue;
    const L = unitItems(P, u.clues).filter(([, it]) => it.months && needs(it, 'oc'));
    if (!L.length) { if (canFinalize(P, u.clues, 'oc')) ACTIONS.finalizarVerif(U, P, { clues: u.clues, nivel: 'oc', sim: true }); continue; }
    cupoOC--;
    const r = actorRng(P, 'oc' + u.clues, day);
    for (const [k, it] of L) {
      const c = U.claves[it.k], tot = total(it);
      if (it.st.del === 'rechazado') { ACTIONS.dictamen(U, P, { key: k, nivel: 'oc', d: 'rechazar', obs: 'Se confirma el rechazo de la delegación', sim: true }); continue; }
      const sobre = tot > it.max * (1 + P.sim.tolOC);
      const extra = Math.max(0, tot - it.prop0.min) * c.precio;
      if (!sobre || it.round >= 3 || (comprometido + extra <= pres && (it.cambio > 1.15 ? r() < 0.8 : r() < 0.3))) {
        ACTIONS.dictamen(U, P, { key: k, nivel: 'oc', d: 'aprobar', sim: true }); comprometido += extra;
      } else ACTIONS.dictamen(U, P, { key: k, nivel: 'oc', d: 'negociar', obs: 'Excede la propuesta máxima y el presupuesto; se ofrece el máximo', prop: { months: scaleMonths(it.months, it.max) }, sim: true });
    }
    if (canFinalize(P, u.clues, 'oc')) ACTIONS.finalizarVerif(U, P, { clues: u.clues, nivel: 'oc', sim: true });
    else { s.del = false; s.um = false; }   // regresa a la unidad por la negociación
  }
  // reabrir verificación de unidades con insumos regresados
  for (const u of unitsIn(U, P)) {
    const s = P.unitSt.get(u.clues); if (!s || s.oc) continue;
    const L = unitItems(P, u.clues);
    if (s.um && L.some(([, it]) => needs(it, 'um'))) s.um = false;
    if (s.del && L.some(([, it]) => needs(it, 'del'))) s.del = false;
  }
  snapshot(U, P);
  P.day++;
  if (P.status === 'finalizado' && P.finDay == null) P.finDay = P.day;
}
function budget(U, P) {
  let b = 0;
  for (const it of P.items.values()) if (it.prop0) b += it.prop0.min * U.claves[it.k].precio;
  return b * (P.sim.presupuesto - 1);
}
function committedCost(U, P) {
  let x = 0;
  for (const it of P.items.values()) if (it.prop0 && it.st.oc === 'aprobado') x += Math.max(0, total(it) - it.prop0.min) * U.claves[it.k].precio;
  return x;
}
// ---------------------------------------------------------------- quién tiene la petición (secuencia Unidad → Delegación → O. Central)
export function holderOf(U, P, it) {
  if (!it.months && !it.solicitado) return null;
  if (it.st.oc === 'aprobado' || it.st.oc === 'rechazado') return null;
  const s = P.unitSt.get(U.units[it.u].clues); if (!s) return null;
  if (needs(it, 'um')) return 'um';
  if (needs(it, 'del')) return s.um ? 'del' : 'um';          // la unidad aún no finaliza su verificación
  if (needs(it, 'oc')) return s.del ? 'oc' : 'del';           // la delegación aún no finaliza la de la unidad
  return 'um';
}
function tickHolders(U, P) {
  // además del conteo de días, registra el flujo del día para la vista 3D:
  // cuántas peticiones tiene cada nodo (unidad, delegación, Central) por antigüedad y qué se movió de quién a quién
  const Nu = U.units.length, ND = U.delegaciones.length, NN = Nu + 2 * ND;      // nodos: unidades, delegaciones y Central por delegación
  const dIdx = U._dIdx ||= Object.fromEntries(U.delegaciones.map((d, i) => [d.cve, i]));
  const node = (h, it) => (h === 'um' ? it.u : (h === 'del' ? Nu : Nu + ND) + dIdx[U.units[it.u].cve]);
  const cnt = new Uint32Array(NN * 3), mv = new Map();
  for (const it of P.items.values()) {
    const h = holderOf(U, P, it);
    if (h !== it.holder) {
      const a = it.holder ? node(it.holder, it) : -1;                    // −1: sale de Central como asignación inicial
      const b = h ? node(h, it) : -2 - it.u;                              // < −1: concluyó, regresa a la unidad
      const d = !it.holder ? 'asignar' : !h ? (it.st.oc === 'rechazado' ? 'rechazar' : 'aprobar') : it.ev.at(-1)?.d || 'aprobar';
      const key = a + '|' + b + '|' + d; mv.set(key, (mv.get(key) || 0) + 1);
      it.holder = h; it.since = P.day;
    }
    if (!h) continue;
    it.hold[h]++;
    const age = P.day - it.since, sla = P.sla[h];
    if (age >= sla) it.late[h]++;
    cnt[node(h, it) * 3 + (age < sla ? 0 : age < 2 * sla ? 1 : 2)]++;
  }
  (P.flow ||= [])[P.day] = { cnt, mv: [...mv].map(([k, n]) => { const [a, b, d] = k.split('|'); return [+a, +b, n, d]; }) };
}
// días hábiles entre dos fechas ISO (fin incluido)
export function bizDays(a, b) {
  const x = new Date(a + 'T00:00:00Z'), y = new Date(b + 'T00:00:00Z'); let n = 0;
  while (x < y) { x.setUTCDate(x.getUTCDate() + 1); const w = x.getUTCDay(); if (w && w !== 6) n++; }
  return n;
}
export function dateOfDay(P, d) {
  const ini = P.periodos?.aprobacion?.[0] || '2026-12-07';
  const x = new Date(ini + 'T00:00:00Z'); let n = 0;
  while (n < d) { x.setUTCDate(x.getUTCDate() + 1); const w = x.getUTCDay(); if (w && w !== 6) n++; }
  return x;
}
export function plazos(P) {
  const per = P.periodos?.aprobacion || ['2026-12-07', '2027-01-29'];
  const D = Math.max(5, bizDays(per[0], per[1]));
  return { D, um: Math.round(D * P.hitos.um), del: Math.round(D * P.hitos.del), oc: Math.round(D * P.hitos.oc), fin: per[1], ini: per[0] };
}
const plannedShare = (d, start, end) => Math.max(0, Math.min(1, (d - start) / Math.max(1, end - start)));

// seguimiento del proyecto: avance contra lo programado, cuellos de botella, culpables y plazos
export function seguimiento(U, P) {
  const L = plazos(P), now = P.day;
  const actors = ['um', 'del', 'oc'];
  const pend = { um: 0, del: 0, oc: 0 }, aging = { um: [0, 0, 0], del: [0, 0, 0], oc: [0, 0, 0] }, hold = { um: 0, del: 0, oc: 0 }, late = { um: 0, del: 0, oc: 0 }, vencidos = { um: 0, del: 0, oc: 0 };
  let n = 0, rondas3 = 0, fuera = 0, q = 0, q0 = 0, costo = 0, costo0 = 0;
  const byDel = new Map(U.delegaciones.map(d => [d.cve, { d, hold: { um: 0, del: 0, oc: 0 }, late: { um: 0, del: 0, oc: 0 }, pend: { um: 0, del: 0, oc: 0 }, oldest: { um: null, del: null, oc: null } }]));
  const byUnit = new Map();
  for (const it of P.items.values()) {
    if (!it.months) continue;
    n++;
    const u = U.units[it.u], c = U.claves[it.k], R = byDel.get(u.cve);
    for (const a of actors) { hold[a] += it.hold[a]; late[a] += it.late[a]; R.hold[a] += it.hold[a]; R.late[a] += it.late[a]; }
    if (it.round > 2) rondas3++;
    if (outOfRange(it)) fuera++;
    const tq = it.st.oc === 'rechazado' ? 0 : total(it);
    q += tq; q0 += it.prop0?.min || 0; costo += tq * c.precio; costo0 += (it.prop0?.min || 0) * c.precio;
    const h = holderOf(U, P, it);
    if (!h) continue;
    const age = now - (it.holder === h ? it.since : now);
    pend[h]++; R.pend[h]++;
    aging[h][age < P.sla[h] ? 0 : age < 2 * P.sla[h] ? 1 : 2]++;
    if (age >= P.sla[h]) vencidos[h]++;
    const since = it.holder === h ? it.since : now;
    if (R.oldest[h] == null || since < R.oldest[h]) R.oldest[h] = since;
    const bu = byUnit.get(u.clues) || { u, pend: { um: 0, del: 0, oc: 0 }, oldest: { um: null, del: null, oc: null } };
    bu.pend[h]++; if (bu.oldest[h] == null || since < bu.oldest[h]) bu.oldest[h] = since;
    byUnit.set(u.clues, bu);
  }
  // avance por nivel contra lo programado
  const us = [...P.unitSt.values()], N = us.length || 1;
  const done = { um: us.filter(s => s.um).length, del: us.filter(s => s.del).length, oc: us.filter(s => s.oc).length };
  const plan = { um: plannedShare(now, 0, L.um), del: plannedShare(now, 3, L.del), oc: plannedShare(now, 6, L.oc) };
  // cierre estimado con el ritmo de Oficina Central de los últimos 5 días
  const h5 = P.hist[Math.max(0, now - 6)]?.ocDone ?? 0, h1 = P.hist[now - 1]?.ocDone ?? done.oc;
  const rate = Math.max(0, (h1 - h5) / Math.min(5, Math.max(1, now - 1)));
  const restante = N - done.oc;
  const estimado = P.status !== 'validacion' ? (P.finDay ?? now) : rate > 0 ? Math.ceil(now + restante / rate) : null;
  // quién se queda sin tiempo
  const ent = [];
  for (const [, b] of byUnit) {
    const s = P.unitSt.get(b.u.clues);
    if (b.pend.um) { const hito = s.umDay == null ? L.um : Infinity; const lim = Math.min(hito, b.oldest.um + P.sla.um); ent.push({ tipo: 'um', nombre: b.u.nombre, cve: b.u.cve, clues: b.u.clues, pend: b.pend.um, lim, left: lim - now, motivo: lim === hito ? 'fecha límite de las unidades' : `plazo de ${P.sla.um} días por ronda` }); }
  }
  for (const [, R] of byDel) {
    if (R.pend.del) { const lim = Math.min(L.del, R.oldest.del + P.sla.del); ent.push({ tipo: 'del', nombre: `Delegación ${R.d.nombre}`, cve: R.d.cve, pend: R.pend.del, lim, left: lim - now, motivo: lim === L.del ? 'fecha límite de las delegaciones' : `plazo de ${P.sla.del} días por unidad` }); }
  }
  const ocOld = [...byDel.values()].map(R => R.oldest.oc).filter(v => v != null);
  if (pend.oc) { const lim = Math.min(L.oc, Math.min(...ocOld) + P.sla.oc); ent.push({ tipo: 'oc', nombre: 'Oficina Central', pend: pend.oc, lim, left: lim - now, motivo: lim === L.oc ? 'fecha límite de Oficina Central' : `plazo de ${P.sla.oc} días por unidad` }); }
  ent.sort((a, b) => a.left - b.left || b.pend - a.pend);
  const lateTot = late.um + late.del + late.oc;
  const culpable = lateTot ? actors.reduce((a, b) => (late[b] > late[a] ? b : a)) : null;
  const cuello = actors.reduce((a, b) => (vencidos[b] > vencidos[a] ? b : a));
  return {
    L, now, n, pend, aging, hold, late, lateTot, vencidos, culpable, cuello, done, plan, N, rate, estimado,
    holgura: estimado == null ? null : L.D - estimado, rondas3, fuera, q, q0, costo, costo0, byDel: [...byDel.values()], ent,
  };
}

// foto diaria para las gráficas de avance
function snapshot(U, P) {
  const c = { aprobado: 0, rechazado: 0, negociacion: 0, pendiente: 0, umDone: 0, delDone: 0, ocDone: 0 };
  for (const it of P.items.values()) {
    if (!it.months) continue;
    if (it.st.oc === 'aprobado') c.aprobado++; else if (it.st.oc === 'rechazado') c.rechazado++;
    else if (Object.values(it.st).some(v => v === 'negociacion' || v === 'revision')) c.negociacion++; else c.pendiente++;
  }
  for (const s of P.unitSt.values()) { if (s.um) c.umDone++; if (s.del) c.delDone++; if (s.oc) c.ocDone++; }
  P.hist[P.day] = c;
}

// ---------------------------------------------------------------- indicadores del plan
export function kpis(U, P) {
  let n = 0, aprob = 0, rech = 0, neg = 0, pend = 0, first = 0, rounds = 0, piezas = 0, real = 0, absErr = 0, over = 0, under = 0, costo = 0, costo0 = 0, fuera = 0, solicitados = 0;
  for (const it of P.items.values()) {
    if (!it.months) continue;
    n++;
    const c = U.claves[it.k], tot = it.st.oc === 'rechazado' ? 0 : total(it), r = it.real.reduce((a, b) => a + b, 0);
    if (it.st.oc === 'aprobado') aprob++; else if (it.st.oc === 'rechazado') rech++;
    else if (Object.values(it.st).some(v => v === 'negociacion' || v === 'revision')) neg++; else pend++;
    if (it.round === 0 && it.st.oc === 'aprobado') first++;
    rounds += it.round;
    piezas += tot; real += r; absErr += Math.abs(tot - r);
    over += Math.max(0, tot - r) * c.precio; under += Math.max(0, r - tot) * c.precio;
    costo += tot * c.precio; costo0 += (it.prop0?.min || 0) * c.precio;
    if (outOfRange(it)) fuera++;
    if (it.solicitado) solicitados++;
  }
  const us = [...P.unitSt.values()];
  return {
    n, aprob, rech, neg, pend, first: aprob ? first / aprob : 0, rounds: n ? rounds / n : 0, piezas, real, wape: real ? absErr / real : 0,
    over, under, costo, costo0, fuera, solicitados, day: P.day,
    umDone: us.filter(s => s.um).length, delDone: us.filter(s => s.del).length, ocDone: us.filter(s => s.oc).length, units: us.length,
  };
}
export function delegStats(U, P) {
  return U.delegaciones.map(d => {
    const us = d.units.map(i => U.units[i]).filter(u => P.unitSt.has(u.clues));
    const st = us.map(u => P.unitSt.get(u.clues));
    let items = 0, claves = new Set(), neg = 0;
    for (const u of us) for (const [, it] of unitItems(P, u.clues)) if (it.months) { items++; claves.add(it.k); if (it.round) neg++; }
    const dDays = st.filter(s => s.delDay != null).map(s => s.delDay);
    return {
      d, units: us.length, umDone: st.filter(s => s.um).length, delDone: st.filter(s => s.del).length, ocDone: st.filter(s => s.oc).length,
      claves: claves.size, items, neg, lastDel: dDays.length ? Math.max(...dDays) : null,
      status: !us.length ? 'Sin unidades' : st.every(s => s.oc) ? 'Finalizado' : st.every(s => s.del) ? 'Verificada' : st.some(s => s.um) ? 'En revisión' : 'Pendiente',
    };
  });
}

// ---------------------------------------------------------------- bitácora persistente y reconstrucción
export function replay(U, entries) {
  const plans = [];
  for (const e of entries) {
    if (e.a === 'nuevo') { const P = newPlan(e.cfg); plans.push(P); ACTIONS.crear(U, P, e); continue; }
    const P = plans.find(p => p.id === e.plan); if (!P) continue;
    try { ACTIONS[e.a](U, P, e); } catch (err) { /* acción inválida en la bitácora: se ignora */ }
  }
  return plans;
}
// plan de ejemplo: catálogos configurados, asignación automática por pronóstico y aprobación abierta
export function seedEntries() {
  const per = {
    catalogos: ['2026-11-02', '2026-11-13'], asignacion: ['2026-11-16', '2026-12-04'], programas: ['2026-11-16', '2026-12-11'], aprobacion: ['2026-12-07', '2027-01-29'],
  };
  const P = 'PL_0204';
  return [
    { a: 'nuevo', cfg: { id: P, nombre: 'Plan anual de necesidades 2027', periodicidad: 'Anual', tipo: 'Completo', inicio: '2026-11-02', fin: '2027-12-31', periodos: per } },
    { plan: P, a: 'finalizarUnidades' }, { plan: P, a: 'finalizarClaves' },
    { plan: P, a: 'crearKit', nombre: 'Kit crónico-degenerativos', desc: 'Diabetes e hipertensión', tipologia: 'Todas', nivel: '1er nivel', claves: ['010.000.5165.00', '010.000.1042.00', '010.000.2520.00', '010.000.2501.00', '010.000.2111.00'] },
    { plan: P, a: 'crearKit', nombre: 'Kit quirófano básico', desc: 'Anestesia general', tipologia: 'HG', nivel: '2º nivel', claves: ['010.000.0246.00', '040.000.2108.00', '010.000.4059.00', '010.000.0233.00', '040.000.0242.00'] },
    { plan: P, a: 'finalizarKits' },
    { plan: P, a: 'asignarAuto', metodo: 'pronostico', validar: true },
    { plan: P, a: 'crearPrograma', nombre: 'Vacunación invernal 2027', periodo: ['2027-10-01', '2027-12-31'], objetivos: 'Cubrir la temporada respiratoria', desc: 'Insumos de apoyo a la campaña', kits: [], claves: ['010.000.0429.00', '010.000.2463.00'], piezas: { '010.000.0429.00': 12000, '010.000.2463.00': 8000 } },
    { plan: P, a: 'finalizarAsignacion' },
  ];
}
export const fmtDia = (P, d) => {
  const ini = new Date(Date.UTC(2026, 11, 7));       // inicio del periodo de aprobación (días hábiles)
  let n = 0; const x = new Date(ini);
  while (n < d) { x.setUTCDate(x.getUTCDate() + 1); const w = x.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return `${x.getUTCDate()} ${MESES[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};

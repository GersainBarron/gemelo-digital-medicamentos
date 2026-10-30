// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  torre-seguimiento.js · Bitácora de compromisos de la torre de control
//
//  Cada llamada o acción de la torre se puede convertir en compromiso:
//  responsable, qué se mide, valor de partida, meta, nivel y fecha límite.
//  La torre lo verifica sola con cada corrida (no basta con "ya quedó"):
//   · cumplido   el indicador llegó a la meta (verificado por la torre)
//   · mejora     se movió hacia la meta, pero no llega
//   · igual / empeora
//   · si vence el plazo sin cumplir sube de nivel (1 → 2 → 3) con nuevo
//     plazo; en nivel 3 queda "vencido en dirección general".
//   · el responsable puede cerrarlo con una nota (cerrado sin verificar),
//     y se cuenta aparte.
//  El reloj es el día hábil de la aprobación del plan (se avanza desde la
//  pestaña Seguimiento). Se guarda en este navegador (localStorage); en la
//  plataforma real sería una tabla compartida con su bitácora.
// =====================================================================
import { fmtV, NIVELES } from './torre-engine.js';

const LS = 'torre.compromisos.v1';
export const PLAZO_DIAS = { 1: 2, 2: 5, 3: 5 };                      // días hábiles por nivel
export const EST = {
  abierto: 'Abierto', mejora: 'Mejora', igual: 'Sin cambio', empeora: 'Empeora', cumplido: 'Cumplido',
  vencido: 'Vencido en dirección general', cerrado: 'Cerrado sin verificar',
};
export const EST_ST = { abierto: 'info', mejora: 'info', igual: 'warn', empeora: 'crit', cumplido: 'ok', vencido: 'crit', cerrado: '' };

export function cargar() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } }
export function guardar(L) { try { localStorage.setItem(LS, JSON.stringify(L)); } catch { /* sin almacenamiento: queda en memoria */ } }
const abierto = c => !['cumplido', 'cerrado'].includes(c.estado);
export const abiertoDe = (L, ref) => L.find(c => c.ref === ref && abierto(c));

// ------------------------------------------------------------------ valor actual de lo que se mide
// ref: "kpi:eslabon.kpi" | "del:CVE.campo" | "unit:i.campo" | "ana:a.campo" | "k:C1.campo" | "nac:CVE.campo"
export function valor(R, ref) {
  const [tipo, rest] = ref.split(':'); const dot = rest.lastIndexOf('.'), id = rest.slice(0, dot), f = rest.slice(dot + 1);
  if (tipo === 'kpi') { const [e, k] = rest.split('.'); return R.eslabones.find(x => x.id === e)?.kpis.find(x => x.id === k)?.v ?? null; }
  if (tipo === 'del') {
    const d = R.roles.delegaciones.find(x => x.cve === id); if (!d) return null;
    if (f === 'frio') return d.frio.oculto;
    if (f === 'integ') return (d.integ?.monto || 0) + (d.integU?.monto || 0);
    if (f === 'rojas') return R.unidades.filter(u => u.cve === id && (u.esc2 > 0 || u.integ)).length;
    return d[f] ?? null;
  }
  if (tipo === 'unit') {
    const u = R.unidades[+id]; if (!u) return null;
    if (f === 'integ') return u.integ?.monto || 0;
    if (f === 'abierto') return u.inPlan && !u.fin ? 1 : 0;
    if (f === 's' || f === 'pe') return u.hgo ? u.hgo[f] : null;
    return u[f] ?? null;
  }
  if (tipo === 'ana') { const a = R.roles.analistas[+id]; if (!a) return null; return f === 'integ' ? a.integ?.monto || 0 : a[f] ?? null; }
  if (tipo === 'k') {
    const k = R.roles.contratos.find(x => x.id === id); if (!k) return null;
    if (f === 'pendPenas') return Math.max(0, k.penas - k.cobradas);
    if (f === 'sem') return { VERDE: 0, AMARILLO: 1, NARANJA: 2, ROJO: 3 }[k.sem] ?? null;
    return k[f] ?? null;
  }
  if (tipo === 'nac') { const n = R.nac.find(x => x.cve === id); return n ? n[f] ?? null : null; }
  return null;
}
const cumple = (c, v) => v != null && (c.dir > 0 ? v >= c.meta - 1e-9 : v <= c.meta + 1e-9);

// ------------------------------------------------------------------ crear
// a: { ref, quien, rol, txt, meta, dir, fmt, nivel, eslabon }
export function comprometer(L, R, a) {
  if (abiertoDe(L, a.ref)) return L;
  const v = valor(R, a.ref), dia = R.plan.dia;
  L.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ref: a.ref, quien: a.quien, rol: a.rol || null, txt: a.txt, eslabon: a.eslabon || null,
    meta: a.meta, dir: a.dir ?? -1, fmt: a.fmt || 'num', nivel0: a.nivel, nivel: a.nivel, esc0: R.esc, creado: dia, creadoT: Date.now(),
    vence: dia + PLAZO_DIAS[a.nivel], base: v, actual: v, estado: cumple({ ...a, dir: a.dir ?? -1 }, v) ? 'cumplido' : 'abierto', cerradoDia: null, escalado: 0,
    hist: [{ dia, v, txt: `Compromiso con ${NIVELES[a.nivel].n.toLowerCase()}; vence el día hábil ${dia + PLAZO_DIAS[a.nivel]}` }],
  });
  guardar(L); return L;
}

// ------------------------------------------------------------------ verificar con la corrida actual
export function verificar(L, R) {
  const dia = R.plan.dia; let cambios = 0;
  for (const c of L) {
    if (!abierto(c)) continue;
    const v = valor(R, c.ref);
    if (v != null && v !== c.actual) { c.hist.push({ dia, v, txt: `Medición: ${fmtV(v, c.fmt)}` }); c.actual = v; cambios++; }
    if (cumple(c, v)) { c.estado = 'cumplido'; c.cerradoDia = dia; c.hist.push({ dia, v, txt: 'Cumplido: la torre verificó que llegó a la meta' }); cambios++; continue; }
    // vencido sin cumplir: sube de nivel con nuevo plazo
    while (dia > c.vence && c.estado !== 'vencido') {
      if (c.nivel >= 3) { c.estado = 'vencido'; c.hist.push({ dia, v, txt: 'Venció en dirección general sin cumplirse' }); break; }
      c.nivel++; c.escalado++; c.vence += PLAZO_DIAS[c.nivel];
      c.hist.push({ dia, v, txt: `Venció sin cumplirse: sube a ${NIVELES[c.nivel].n.toLowerCase()}, nuevo plazo día hábil ${c.vence}` });
      cambios++;
    }
    if (c.estado !== 'vencido') {
      const b = c.base, d = v == null || b == null ? 0 : (c.dir > 0 ? v - b : b - v);
      c.estado = d > 1e-9 ? 'mejora' : d < -1e-9 ? 'empeora' : dia > c.creado ? 'igual' : 'abierto';
    }
  }
  if (cambios) guardar(L);
  return L;
}
export function cerrar(L, id, nota, dia) { const c = L.find(x => x.id === id); if (c) { c.estado = 'cerrado'; c.cerradoDia = dia; c.hist.push({ dia, v: c.actual, txt: `Cerrado por el responsable: ${nota || 'sin nota'}` }); guardar(L); } return L; }
export function reabrir(L, id, dia) { const c = L.find(x => x.id === id); if (c) { c.estado = 'abierto'; c.cerradoDia = null; c.hist.push({ dia, v: c.actual, txt: 'Reabierto' }); guardar(L); } return L; }
export function borrar(L, id) { const i = L.findIndex(x => x.id === id); if (i >= 0) L.splice(i, 1); guardar(L); return L; }

// ------------------------------------------------------------------ indicadores de la propia torre
export function resumen(L) {
  const n = L.length, ab = L.filter(abierto), cum = L.filter(c => c.estado === 'cumplido'), cer = L.filter(c => c.estado === 'cerrado');
  const cerrados = [...cum, ...cer];
  const dias = cum.map(c => c.cerradoDia - c.creado).filter(x => x >= 0);
  const porQuien = {};
  for (const c of L) { const o = porQuien[c.quien] ||= { quien: c.quien, rol: c.rol, n: 0, vencidos: 0, escalados: 0, cumplidos: 0, abiertos: 0 }; o.n++; o.escalados += c.escalado; if (c.estado === 'vencido') o.vencidos++; if (c.estado === 'cumplido') o.cumplidos++; if (abierto(c)) o.abiertos++; }
  const reinc = Object.values(porQuien).filter(o => o.escalados + o.vencidos >= 2 || o.n >= 3 && o.cumplidos === 0).sort((a, b) => (b.escalados + 2 * b.vencidos) - (a.escalados + 2 * a.vencidos));
  return {
    n, abiertos: ab.length, vencidos: L.filter(c => c.estado === 'vencido').length, escalados: L.reduce((s, c) => s + c.escalado, 0),
    cumplidos: cum.length, cerradosSin: cer.length, tasa: cerrados.length ? cum.length / cerrados.length : null,
    diasCierre: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null, n3: ab.filter(c => c.nivel === 3).length, reinc,
  };
}
export function csv(L) {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['responsable', 'compromiso', 'medida', 'valor inicial', 'valor actual', 'meta', 'nivel inicial', 'nivel actual', 'creado (día hábil)', 'vence (día hábil)', 'estado', 'escalamientos', 'escenario', 'historial']];
  for (const c of L) rows.push([c.quien, c.txt, c.ref, fmtV(c.base, c.fmt), fmtV(c.actual, c.fmt), `${c.dir > 0 ? '≥' : '≤'} ${fmtV(c.meta, c.fmt)}`, c.nivel0, c.nivel, c.creado, c.vence, EST[c.estado], c.escalado, c.esc0, c.hist.map(h => `día ${h.dia}: ${h.txt}`).join(' | ')]);
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}

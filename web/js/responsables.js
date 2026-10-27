// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  responsables.js · ¿A quién hay que llamar hoy?
//
//  Cada rol ve solo el nivel de abajo (Central → 32 delegaciones y sus
//  analistas; delegación → sus unidades; unidad → lo suyo), con dos tipos
//  de culpa:
//   · directa: quien tiene la petición y ya venció su plazo;
//   · de supervisión: la delegación responde por sus unidades atrasadas.
//  Y tres cosas distintas que pueden andar mal: atraso, calidad del pedido
//  e integridad (alertas de la ventana Integridad del plan).
//
//  Escalera de avisos: al vencer el plazo se avisa a quien la tiene; P.esc.sup
//  días después, a su supervisor; P.esc.central días después, a Central.
//  Los responsables son puestos, no personas: el directorio con nombres es
//  un dato que debe crear la plataforma.
// =====================================================================
import { holderOf, total, plazos } from './plan-engine.js';

export const ANALISTAS = 5;
export const analistaDe = di => di % ANALISTAS;            // reparto de delegaciones entre analistas de Central
export const PUESTO = {
  um: u => `Director(a) de ${u.nombre}`,
  del: d => `Administrador(a) delegacional de ${d.nombre}`,
  oc: a => `Analista ${a + 1} de Oficina Central`,
};
const blank = () => ({ pend: 0, venc: 0, esc1: 0, esc2: 0, oldest: null });

export function responsables(U, P, integ = null) {
  const now = P.day, L = plazos(P), esc = P.esc || { sup: 3, central: 5 };
  const Nu = U.units.length, ND = U.delegaciones.length;
  const dIdx = Object.fromEntries(U.delegaciones.map((d, i) => [d.cve, i]));
  const unit = U.units.map(u => ({ u, ...blank(), n: 0, rondas: 0, q: 0, obs: 0, infl: 0, alertas: [], fin: !!P.unitSt.get(u.clues)?.um, inPlan: P.unitSt.has(u.clues) }));
  const del = U.delegaciones.map((d, i) => ({ d, i, ...blank(), aprob: 0, neg: 0, costo: 0, costo0: 0, alertas: [] }));
  const ana = [...Array(ANALISTAS).keys()].map(a => ({ a, ...blank(), dels: U.delegaciones.filter((_, i) => analistaDe(i) === a), alertas: [] }));
  const ladder = { um: [0, 0, 0], del: [0, 0, 0], oc: [0, 0, 0] };
  const mark = (o, h, age) => {
    o.pend++;
    const sla = P.sla[h];
    if (age >= sla) { o.venc++; ladder[h][age >= sla + esc.central ? 2 : age >= sla + esc.sup ? 1 : 0]++; }
    if (age >= sla + esc.sup) o.esc1++;
    if (age >= sla + esc.central) o.esc2++;
    if (o.oldest == null || age > o.oldest) o.oldest = age;
  };
  for (const it of P.items.values()) {
    if (!it.months) continue;
    const U1 = unit[it.u], di = dIdx[U1.u.cve], D = del[di], c = U.claves[it.k];
    U1.n++; U1.rondas += it.round;
    const q = it.st.oc === 'rechazado' ? 0 : total(it);
    let o = 0; for (let m = it.hist.length - 12; m < it.hist.length; m++) o += it.hist[m];
    U1.q += q; U1.obs += o; if (o > 0 && q / o > 1.5) U1.infl++;
    D.costo += q * c.precio; D.costo0 += (it.prop0?.min || 0) * c.precio;
    for (const e of it.ev) if (e.lvl === 'del') { if (e.d === 'aprobar') D.aprob++; else if (e.d === 'negociar') D.neg++; }
    const h = holderOf(U, P, it); if (!h) continue;
    const age = now - (it.holder === h ? it.since : now);
    mark(h === 'um' ? U1 : h === 'del' ? D : ana[analistaDe(di)], h, age);
  }
  // alertas de integridad abiertas (casos detectados en la ventana Integridad)
  if (integ) for (const cs of integ.casos) {
    if (cs.estado === 'escapado') continue;
    const a = cs.actor;
    if ((a.tipo === 'um' || a.tipo === 'x') && a.clues) { const i = U.units.findIndex(x => x.clues === a.clues); if (i >= 0) unit[i].alertas.push(cs); }
    if (a.tipo === 'del') del[a.i].alertas.push(cs);
    if (a.tipo === 'oc' && ana[a.i]) ana[a.i].alertas.push(cs);
  }
  // supervisión: lo de las unidades se suma a su delegación
  for (const D of del) {
    const us = D.d.units.map(i => unit[i]).filter(x => x.inPlan);
    D.uTot = us.length; D.uVenc = us.filter(x => x.venc).length; D.uEsc1 = us.filter(x => x.esc1).length; D.uEsc2 = us.filter(x => x.esc2).length;
    D.uSinFin = us.filter(x => !x.fin).length; D.uItemsVenc = us.reduce((s, x) => s + x.venc, 0); D.uItemsEsc2 = us.reduce((s, x) => s + x.esc2, 0);
    D.uAlertas = us.reduce((s, x) => s + x.alertas.length, 0);
    D.sinCambios = D.aprob + D.neg ? D.aprob / (D.aprob + D.neg) : null;
    D.desvCosto = D.costo0 ? D.costo / D.costo0 - 1 : 0;
  }
  // ---- semáforo y motivos de cada responsable
  const motivo = (tipo, txt, pts) => ({ tipo, txt, pts });
  for (const x of unit) {
    const m = [];
    if (x.venc) m.push(motivo('atraso', `${x.venc} peticiones vencidas en su escritorio, la más vieja de ${x.oldest} días`, x.venc + 3 * x.esc1));
    if (!x.fin && x.inPlan && now > L.um) m.push(motivo('atraso', `no ha finalizado su verificación y la fecha límite fue el día ${L.um}`, 50));
    if (x.n && x.rondas / x.n > 2) m.push(motivo('calidad', `${(x.rondas / x.n).toFixed(1)} rondas de negociación por insumo`, 30));
    if (x.obs && x.q / x.obs > 1.5) m.push(motivo('calidad', `pide ${(x.q / x.obs).toFixed(1)} veces lo que consumió`, 30));
    if (x.alertas.length) m.push(motivo('integridad', `${x.alertas.length} alerta${x.alertas.length > 1 ? 's' : ''} de integridad abierta${x.alertas.length > 1 ? 's' : ''}`, 200 * x.alertas.length));
    x.motivos = m; x.pts = m.reduce((s, r) => s + r.pts, 0);
    x.sem = x.alertas.length || x.esc1 ? 'crit' : x.venc || m.length ? 'warn' : 'ok';
  }
  for (const D of del) {
    const m = [];
    if (D.venc) m.push(motivo('atraso', `${D.venc.toLocaleString('es-MX')} peticiones vencidas en su escritorio, la más vieja de ${D.oldest} días`, D.venc + 3 * D.esc2));
    if (D.uEsc1) m.push(motivo('atraso', `${D.uEsc1} de sus ${D.uTot} unidades llevan más de ${P.sla.um + esc.sup} días sin responder`, D.uItemsVenc + 3 * D.uItemsEsc2));
    if (D.sinCambios != null && D.sinCambios > 0.97 && D.aprob > 200) m.push(motivo('calidad', `aprueba ${Math.round(D.sinCambios * 100)} % sin cambios`, 60));
    if (D.desvCosto > 0.15) m.push(motivo('calidad', `costo ${Math.round(D.desvCosto * 100)} % arriba de la propuesta`, 100));
    const al = D.alertas.length + D.uAlertas;
    if (al) m.push(motivo('integridad', `${al} alerta${al > 1 ? 's' : ''} de integridad (${D.alertas.length} de la delegación, ${D.uAlertas} de sus unidades)`, 200 * D.alertas.length + 60 * D.uAlertas));
    D.motivos = m; D.pts = m.reduce((s, r) => s + r.pts, 0);
    D.sem = D.alertas.length || D.esc2 || D.uEsc2 ? 'crit' : D.venc || D.uVenc || m.length ? 'warn' : 'ok';
  }
  for (const A of ana) {
    const m = [];
    if (A.venc) m.push(motivo('atraso', `${A.venc.toLocaleString('es-MX')} peticiones vencidas de sus ${A.dels.length} delegaciones, la más vieja de ${A.oldest} días`, A.venc + 3 * A.esc2));
    if (A.alertas.length) m.push(motivo('integridad', `${A.alertas.length} alerta${A.alertas.length > 1 ? 's' : ''} de integridad a su nombre`, 400 * A.alertas.length));
    A.motivos = m; A.pts = m.reduce((s, r) => s + r.pts, 0);
    A.sem = A.alertas.length || A.esc2 ? 'crit' : A.venc ? 'warn' : 'ok';
  }
  return { now, L, esc, unit, del, ana, ladder };
}

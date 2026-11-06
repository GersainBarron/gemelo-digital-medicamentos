// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-vista.js · Foto de un día calculada directo del motor, para
//  filtros que el cubo diario no guarda (por ejemplo, una especialidad).
//  Devuelve lo mismo que la página toma del cubo: etapas × antigüedad,
//  pasos entre etapas, tiempos por etapa, resumen del día y de 90 días,
//  saturación por receptora y envíos origen → destino.
//  Corre en el worker (≈ 30 ms con 34 mil referencias).
// =====================================================================
import { TERMINAL, REGLAS, DAY } from './referencias.js';
import { EDADES, semSat } from './referencias-cubo.js';

const ESPERA = new Set(['ACEPTACION', 'LIMBO', 'CITA', 'NO_ACUDIO']);
const ATENCION = new Set(['URGENCIAS', 'ESPECIALIDAD', 'ESTUDIOS', 'CONTRARREF']);
const resumen0 = () => ({ CREADAS: 0, ATENDIDAS: 0, EN_PLAZO: 0, CERRADA: 0, SIN_CIERRE: 0, ABANDONO: 0, QUEMADA: 0 });

/** ¿la referencia entra en el filtro? {region, cve, em, rx, esp} (todos opcionales) */
export function pasaFiltro(r, f = {}) {
  if (f.esp && r.esp.n !== f.esp) return false;
  if (f.em && r.emisora.id !== f.em) return false;
  if (f.rx && !r.rxSet.has(f.rx) && r.rx0 !== f.rx) return false;
  if (f.cve && r.emisora.cve !== f.cve) return false;
  if (f.region && r.emisora.region !== f.region) return false;
  return true;
}

/**
 * @param K motor (Referencias) · t instante de la foto · f filtro · ventana días para saturación y flujos
 */
export function vistaDia(K, t, f = {}, ventana = 28) {
  const IR = new Map(K.receptoras.map((u, i) => [u.id, i])), NR = K.receptoras.length;
  const etapas = {}, porEstado = {}, tr1 = {}, tr7 = {}, dw = {}, res1 = resumen0(), res90 = resumen0();
  const sat = Array.from({ length: NR }, () => ({ L: 0, L0: 0, limbo: 0, enAtencion: 0, lleg: 0, sal: 0, aten: 0, acep: 0, dev: 0, noa: 0 }));
  const flujos = new Map();
  const a1 = t - DAY, a7 = t - 7 * DAY, a28 = t - 28 * DAY, a90 = t - 90 * DAY, av = t - ventana * DAY;
  for (const r of K.refs) {
    if (r.tCrea > t) break;
    if (!pasaFiltro(r, f)) continue;
    // foto: etapa y antigüedad
    const e = K.etapa(r, t);
    if (e) {
      const age = (t - r.tCrea) / DAY;
      let b = 0; while (b < EDADES.length && age >= EDADES[b]) b++;
      (etapas[e] ??= new Array(EDADES.length + 1).fill(0))[b]++;
      const pe = (porEstado[r.emisora.cve] ??= {}); pe[e] = (pe[e] || 0) + 1;
    }
    // listas de espera hoy y al inicio de la ventana
    const s = K.segAt(r, t);
    if (s.rx && s.t1 > t && t >= r.tCrea) {
      const x = IR.get(s.rx);
      if (ESPERA.has(s.etapa)) sat[x].L++;
      if (s.etapa === 'LIMBO') sat[x].limbo++;
      if (ATENCION.has(s.etapa)) sat[x].enAtencion++;
    }
    if (r.tCrea <= av) { const s0 = K.segAt(r, av); if (s0.rx && s0.t1 > av && ESPERA.has(s0.etapa)) sat[IR.get(s0.rx)].L0++; }
    // eventos
    if (r.tCrea > a1) res1.CREADAS++;
    if (r.tCrea > a90) res90.CREADAS++;
    if (r.tAtencion > a90 && r.tAtencion <= t) {
      const ok = r.tAtencion - r.tCrea <= REGLAS.plazoDias * DAY;
      res90.ATENDIDAS++; if (ok) res90.EN_PLAZO++;
      if (r.tAtencion > a1) { res1.ATENDIDAS++; if (ok) res1.EN_PLAZO++; }
    }
    const g = r.seg, fin = g[g.length - 1];
    if (TERMINAL.has(fin.etapa) && fin.t0 <= t) { if (fin.t0 > a90) res90[fin.etapa]++; if (fin.t0 > a1) res1[fin.etapa]++; }
    for (let i = 1; i < g.length; i++) {
      const x = g[i], p = g[i - 1];
      if (x.t0 > t) break;
      if (x.t0 <= Math.min(a90, av)) continue;
      const k = p.etapa + '>' + x.etapa;
      if (x.t0 > a7) { tr7[k] = (tr7[k] || 0) + 1; if (x.t0 > a1) tr1[k] = (tr1[k] || 0) + 1; }
      if (x.t0 > a28) { const o = (dw[p.etapa] ??= { s: 0, n: 0 }); o.s += (x.t0 - p.t0) / DAY; o.n++; }
      if (x.t0 <= av) continue;
      // saturación (ventana)
      if (ESPERA.has(p.etapa) && !ESPERA.has(x.etapa) && p.rx) sat[IR.get(p.rx)].sal++;
      if (x.rx) {
        const q = sat[IR.get(x.rx)];
        if (x.etapa === 'ACEPTACION' && p.etapa !== 'LIMBO') {
          q.lleg++;
          const escal = p.etapa === 'TERCER', ori = escal ? 'R' + IR.get(p.rx) : 'E' + r.emisora.idx, des = 'R' + IR.get(x.rx), key = ori + '>' + des;
          let fl = flujos.get(key); if (!fl) flujos.set(key, fl = { ori, des, n: 0, fuera: 0, escal: 0, reenvio: 0 });
          fl.n++; if (/Fuera de región/.test(x.nota)) fl.fuera++; if (escal) fl.escal++; else if (g.slice(0, i).some(z => z.etapa === 'DEVUELTA')) fl.reenvio++;
        }
        if (x.etapa === 'CITA' && p.etapa === 'ACEPTACION') q.acep++;
        if ((x.etapa === 'ESPECIALIDAD' || x.etapa === 'URGENCIAS') && p.etapa === 'CITA') q.aten++;
        if (x.etapa === 'DEVUELTA') q.dev++;
        if (x.etapa === 'NO_ACUDIO') q.noa++;
      }
    }
  }
  const dias = ventana;
  const satOut = sat.map(q => {
    const lambda = q.lleg / dias, sale = q.sal / dias;
    const W = sale > 0 ? q.L / sale : q.L > 0 ? Infinity : 0, rho = sale > 0 ? lambda / sale : lambda > 0 ? Infinity : 0;
    return {
      L: q.L, limbo: q.limbo, enAtencion: q.enAtencion, tendencia: q.L - q.L0, lambdaSem: 7 * lambda, salidasSem: 7 * sale, muSem: 7 * q.aten / dias,
      aceptadasSem: 7 * q.acep / dias, devueltasSem: 7 * q.dev / dias, noAcudioSem: 7 * q.noa / dias, rho, W, ventana: dias, sem: semSat(W, rho, q.L - q.L0),
    };
  });
  const tiempos = Object.fromEntries(Object.entries(dw).map(([k, o]) => [k, { dias: o.s / o.n, n: o.n }]));
  return { t, f, ventana, etapas, porEstado, tr1, tr7, tiempos, res1, res90, sat: satOut, flujos: [...flujos.values()] };
}

/** agrega los envíos unidad → unidad de una foto al nivel pedido (igual que Cubo.flujos) */
export function agregarFlujos(meta, lista, nivel = 'estado', f = {}) {
  const out = new Map();
  const nodo = k => (k[0] === 'E' ? meta.em[+k.slice(1)] : meta.rx[+k.slice(1)]);
  for (const g of lista) {
    const uo = nodo(g.ori), ud = nodo(g.des);
    if (f.region && uo.region !== f.region && ud.region !== f.region) continue;
    if (f.cve && uo.cve !== f.cve && ud.cve !== f.cve) continue;
    const ko = nivel === 'unidad' ? g.ori : nivel === 'estado' ? uo.cve : uo.region;
    const kd = nivel === 'unidad' ? g.des : nivel === 'estado' ? ud.cve : ud.region;
    const key = ko + '>' + kd;
    let a = out.get(key); if (!a) out.set(key, a = { ori: ko, des: kd, n: 0, fuera: 0, escal: 0, reenvio: 0 });
    a.n += g.n; a.fuera += g.fuera; a.escal += g.escal; a.reenvio += g.reenvio;
  }
  return [...out.values()].sort((x, y) => y.n - x.n);
}

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-lab.js · Laboratorio «¿Qué pasaría si…?»
//  Mide una corrida del motor con los mismos indicadores para comparar la
//  operación actual contra un escenario (misma semilla, mismas unidades).
// =====================================================================
import { DAY, TERMINAL, REGLAS, fecha } from './referencias.js';
import { vistaDia } from './referencias-vista.js';

/** indicadores que compara el laboratorio: [clave, nombre, formato, mejor si sube] */
export const INDICADORES = [
  ['enPlazo', 'Atendidas en ≤ 15 días', 'pct', true],
  ['medAt', 'Días hasta la atención (mediana)', 'dias', false],
  ['atendidas', 'Pacientes atendidos (90 días)', 'num', true],
  ['lista', 'Lista de espera en receptoras', 'num', false],
  ['saturadas', 'Receptoras saturadas', 'pct', false],
  ['W', 'Espera estimada (mediana)', 'dias', false],
  ['natural', 'Cierres con contrarreferencia', 'pct', true],
  ['sinCierre', 'Atendidas sin cierre (90 días)', 'num', false],
  ['quemadas', 'Quemadas (90 días)', 'num', false],
  ['noAcudio', 'No acudieron (90 días)', 'num', false],
  ['sinRastro', 'Sin rastro en el sistema', 'num', false],
  ['ocultas', 'Terminadas que el sistema ve abiertas', 'num', false],
  ['limbo', 'Sin respuesta de la receptora (hoy)', 'num', false],
  ['fuera', 'Envíos fuera de su región (28 días)', 'num', null],
];

const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** indicadores al instante t (normalmente el corte) */
export function medir(K, t) {
  const V = vistaDia(K, t, {}, 28), B = K.tablero(t), r = V.res90;
  const nC = r.CERRADA + r.SIN_CIERRE + r.ABANDONO + r.QUEMADA;
  let noAcudio = 0;
  const a90 = t - 90 * DAY;
  for (const x of K.refs) for (const s of x.seg) if (s.etapa === 'NO_ACUDIO' && s.t0 > a90 && s.t0 <= t) noAcudio++;
  return {
    enPlazo: r.ATENDIDAS ? r.EN_PLAZO / r.ATENDIDAS : null, medAt: B.medAt, atendidas: r.ATENDIDAS,
    lista: V.sat.reduce((a, s) => a + s.L, 0), saturadas: V.sat.filter(s => s.sem === 'NARANJA' || s.sem === 'ROJO').length / V.sat.length,
    W: med(V.sat.map(s => s.W)), natural: nC ? r.CERRADA / nC : null, sinCierre: r.SIN_CIERRE, quemadas: r.QUEMADA, noAcudio,
    sinRastro: B.sistema.SIN_RASTRO, ocultas: B.ocultas.SIN_CIERRE + B.ocultas.ABANDONO + B.ocultas.QUEMADA + B.ocultas.CERRADA,
    limbo: B.limbo, fuera: V.flujos.reduce((a, g) => a + g.fuera, 0),
    serie: serieMensual(K, t),
  };
}

/** % atendidas en plazo y mediana de días a la atención, por mes (últimos 10 meses) */
export function serieMensual(K, t, meses = 10) {
  const out = [], d1 = Math.floor(t / DAY);
  for (let m = meses - 1; m >= 0; m--) {
    const a = (d1 - (m + 1) * 30) * DAY, b = (d1 - m * 30) * DAY, dias = [];
    for (const r of K.refs) if (r.tAtencion > a && r.tAtencion <= b) dias.push((r.tAtencion - r.tCrea) / DAY);
    const ok = dias.filter(x => x <= REGLAS.plazoDias).length;
    out.push({ hasta: fecha(Math.floor(b / DAY)), enPlazo: dias.length ? ok / dias.length : null, medAt: med(dias), n: dias.length });
  }
  return out;
}

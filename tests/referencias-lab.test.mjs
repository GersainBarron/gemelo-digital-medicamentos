// Laboratorio de escenarios de referencias: node tests/referencias-lab.test.mjs
// Corre cada palanca contra la operación actual y revisa que mueva lo que debe mover.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const W = new URL('../web/', import.meta.url);
const { Referencias, PALANCAS, H } = await import(new URL('js/referencias.js', W));
const { medir, INDICADORES } = await import(new URL('js/referencias-lab.js', W));
const data = JSON.parse(readFileSync(new URL('assets/estados_issste.json', W)));
const t = 8 * H;
const correr = esc => { const t0 = performance.now(); const K = new Referencias(data, { corteDia: 0, esc }); const m = medir(K, t); m.ms = performance.now() - t0; return m; };

const base = correr({});
const fmt = (v, f) => (v == null ? '—' : f === 'pct' ? (100 * v).toFixed(1) + '%' : f === 'dias' ? Math.round(v) + 'd' : Math.round(v).toLocaleString('es-MX'));
const casos = {
  recordatorio: { recordatorio: 'llamada' }, capacidad: { capacidad: 0.2 }, respuesta: { respuesta: true }, contra: { contra: true },
  digital: { digital: true }, sinCierre: { sinCierre: true }, regional: { regional: true },
  prioridad: { prioridad: true }, econsulta: { econsulta: true }, validacion: { validacion: true }, telemedicina: { telemedicina: true },
  todo: { recordatorio: 'sms', capacidad: 0.2, respuesta: true, contra: true, digital: true, sinCierre: true, regional: true, prioridad: true, econsulta: true, validacion: true, telemedicina: true },
};
const R = {};
for (const [k, esc] of Object.entries(casos)) R[k] = correr(esc);
console.log('indicador'.padEnd(40) + 'base'.padStart(9) + Object.keys(casos).map(k => k.slice(0, 9).padStart(11)).join(''));
for (const [key, n, f] of INDICADORES) console.log(n.slice(0, 39).padEnd(40) + fmt(base[key], f).padStart(9) + Object.keys(casos).map(k => fmt(R[k][key], f).padStart(11)).join(''));
console.log(`una corrida: ${Math.round(base.ms)} ms (motor + medición)`);

// cada palanca mueve su indicador en la dirección esperada
assert.ok(R.recordatorio.noAcudio < base.noAcudio * 0.8, 'el recordatorio no bajó las inasistencias');
assert.ok(R.capacidad.enPlazo > base.enPlazo && R.capacidad.lista < base.lista, 'más cupo no mejoró la espera');
assert.ok(R.respuesta.limbo < base.limbo * 0.4, 'la respuesta en 3 días no bajó el limbo');
assert.ok(R.contra.natural > base.natural + 0.15, 'la contrarreferencia obligatoria no subió los cierres naturales');
assert.ok(R.digital.sinRastro < base.sinRastro * 0.7, 'el registro digital no bajó las referencias sin rastro');
assert.ok(R.regional.W <= base.W * 1.05, 'la lista regional empeoró la espera');
assert.ok(R.prioridad.prioPlazo > base.prioPlazo + 0.1, 'la prioridad no adelantó a urgentes y preferentes');
assert.ok(R.prioridad.atendidas >= base.atendidas * 0.95, 'la reserva de prioridad desperdició cupo');
assert.ok(R.econsulta.resueltas > 0 && R.econsulta.lista < base.lista, 'la interconsulta no evitó referencias');
assert.ok(R.validacion.yaNo > 0 && R.validacion.lista < base.lista, 'la validación no limpió la lista');
assert.ok(R.telemedicina.tele > 0 && R.telemedicina.traslados < base.traslados, 'la telemedicina no evitó traslados');
assert.equal(base.resueltas + base.yaNo + base.tele, 0, 'sin palancas no debe haber interconsultas, validaciones ni teleconsultas');
assert.ok(R.todo.enPlazo > base.enPlazo && R.todo.sinRastro < base.sinRastro, 'el paquete completo no mejora');
// las reglas del motor se siguen cumpliendo con todas las palancas
const { TERMINAL } = await import(new URL('js/referencias.js', W));
const Kt = new Referencias(data, { corteDia: 0, esc: casos.todo });
for (const r of Kt.refs) {
  for (let i = 1; i < r.seg.length; i++) assert.equal(r.seg[i].t0, r.seg[i - 1].t1, 'hueco o encime en ' + r.id);
  assert.ok(TERMINAL.has(r.seg.at(-1).etapa), 'sin final ' + r.id);
  if (r.seg.some(s => s.etapa === 'ESPECIALIDAD')) assert.ok(r.tAtencion < Infinity, 'especialidad sin atención ' + r.id);
}
assert.ok(Object.keys(PALANCAS).every(k => k in casos), 'falta probar alguna palanca');
console.log('OK');

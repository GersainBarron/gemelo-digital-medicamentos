// Pruebas del motor de referencia y contrarreferencia: node tests/referencias.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const W = new URL('../web/', import.meta.url);
const { Referencias, REGLAS, TERMINAL, DAY, ETAPAS, CIERRE_ES } = await import(new URL('js/referencias.js', W));
const data = JSON.parse(readFileSync(new URL('assets/unidades_hidalgo.json', W)));

const t0 = performance.now();
const K = new Referencias(data, { corteDia: 0 });
const T = 8 * 3600; // corte: lun 26 oct 2026 08:00
console.log(`${K.refs.length} referencias de ${K.emisoras.length} unidades emisoras · ${(performance.now() - t0).toFixed(0)} ms`);
assert.ok(K.emisoras.length > 30, 'pocas emisoras');

// 1) tramos contiguos, sin encimarse, etapas conocidas y un solo final
for (const r of K.refs) {
  const g = r.seg;
  assert.equal(g[0].etapa, 'SOLICITUD', r.id);
  assert.equal(g[0].t0, r.tCrea, r.id);
  for (let i = 0; i < g.length; i++) {
    assert.ok(ETAPAS[g[i].etapa], 'etapa desconocida ' + g[i].etapa);
    assert.ok(g[i].t1 >= g[i].t0, 'tramo invertido ' + r.id);
    if (i) assert.equal(g[i].t0, g[i - 1].t1, 'hueco o encime en ' + r.id);
    if (i < g.length - 1) assert.ok(!TERMINAL.has(g[i].etapa) || g[i].etapa === 'QUEMADA', 'final a la mitad ' + r.id);
  }
  assert.ok(TERMINAL.has(g.at(-1).etapa), 'sin final ' + r.id);
  assert.equal(r.final, g.at(-1).etapa);
  // 2) el reloj de 15 días termina con la primera atención
  if (r.tAtencion < Infinity) {
    const first = g.find(s => s.etapa === 'ESPECIALIDAD' || s.etapa === 'URGENCIAS');
    assert.ok(first && Math.abs(first.t0 - r.tAtencion) < 1, 'atención mal marcada ' + r.id);
    assert.ok(g.some(s => s.etapa === 'ACEPTACION'), 'atendida sin aceptación ' + r.id);
  } else assert.ok(!g.some(s => s.etapa === 'ESPECIALIDAD'), 'especialidad sin atención ' + r.id);
  // 3) toda cita viene de una aceptación (o de una reprogramación)
  g.forEach((s, i) => { if (s.etapa === 'CITA') assert.ok(['ACEPTACION', 'NO_ACUDIO'].includes(g[i - 1].etapa), 'cita sin aceptar ' + r.id); });
  // 4) vueltas: devoluciones, reprogramaciones y re-emisiones
  const v = g.filter(s => s.vuelta).length;
  assert.ok(v <= REGLAS.maxVueltas, 'demasiadas vueltas ' + r.id);
  assert.equal(K.vueltas(r, Infinity), v);
}

// 5) etapa(t) coincide con el tramo y se archiva tras el final
const r0 = K.refs.find(r => r.seg.length > 6);
for (const s of r0.seg) assert.equal(K.etapa(r0, s.t0 + 1, 1e9), K.segAt(r0, s.t0 + 1).etapa);
assert.equal(K.etapa(r0, r0.seg.at(-1).t0 + (REGLAS.archivarDias + 1) * DAY), null);

// ---- distribución (para calibrar con la experiencia de campo) ----
const fin = {}; for (const r of K.refs) fin[r.final] = (fin[r.final] || 0) + 1;
console.log('finales', Object.entries(fin).map(([k, n]) => `${CIERRE_ES[k]} ${(100 * n / K.refs.length).toFixed(1)}%`).join(' · '));
const at = K.refs.filter(r => r.tAtencion < Infinity), d = at.map(r => (r.tAtencion - r.tCrea) / DAY).sort((a, b) => a - b);
console.log(`atendidas ${at.length} · en ≤15 días ${(100 * d.filter(x => x <= 15).length / d.length).toFixed(1)}% · mediana ${d[d.length >> 1].toFixed(0)} d · p90 ${d[Math.floor(d.length * 0.9)].toFixed(0)} d`);
const vu = K.refs.map(r => r.seg.filter(s => s.vuelta).length);
console.log('vueltas', [0, 1, 2, 3, 4].map(n => `${n}: ${vu.filter(x => (n < 4 ? x === n : x >= n)).length}`).join(' · '));
const B = K.tablero(T);
console.log('tablero', JSON.stringify({ abiertas: B.abiertas, sinAtender15: B.sinAtender15, enPlazo: `${B.enPlazo}/${B.atendidas}`, cierres: B.cierres, sistema: B.sistema, ocultas: B.ocultas, vueltas2: B.vueltas.length, limbo: B.limbo, medAcep: B.medAcep?.toFixed(1), acepPrimera: `${B.acepPrimera}/${B.acepTotal}` }));
assert.ok(B.sistema.SIN_RASTRO > 0, 'el sistema debería perder el rastro de algunas');
assert.ok(B.cierres.QUEMADA > 0 && B.cierres.SIN_CIERRE > 0 && B.cierres.ABANDONO > 0, 'faltan tipos de cierre');
assert.ok(B.abiertas.cron > 0, 'no hay crónicas');
assert.ok(B.vueltas.length > 0, 'no hay referencias con vueltas');
const F = K.tablero(T, 'CHH');
assert.ok(F.abiertas.a15 + F.abiertas.a30 + F.abiertas.a90 + F.abiertas.cron < B.abiertas.a15 + B.abiertas.a30 + B.abiertas.a90 + B.abiertas.cron, 'el filtro no filtra');
const t1 = performance.now(); for (let i = 0; i < 5; i++) K.tablero(T - i * DAY); console.log(`tablero ${((performance.now() - t1) / 5).toFixed(1)} ms`);
console.log('OK');

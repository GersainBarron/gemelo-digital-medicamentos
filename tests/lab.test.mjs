// Pruebas del laboratorio: node tests/lab.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
globalThis.location = { search: '', href: 'http://x/' };
const W = new URL('../web/', import.meta.url);
const { runReplica, summary, paired } = await import(new URL('js/lab.js', W));
const data = JSON.parse(readFileSync(new URL('assets/unidades_hidalgo.json', W))), cat = JSON.parse(readFileSync(new URL('assets/medicamentos.json', W)));
const A = { id: 'A', policy: 'minmax', scen: 'normal' }, B = { id: 'B', policy: 'forecast', scen: 'normal' };
const out = { A: [], B: [] };
for (let r = 1; r <= 4; r++) for (const arm of [A, B]) { const x = runReplica(data, cat, { arm, rep: r, day: 0 }); out[arm.id].push(x); }
const show = (id, arm) => { const s = summary(out[arm].map(x => x.m[id])); return `${arm}: ${s.mean.toFixed(4)} [${s.lo.toFixed(4)}, ${s.hi.toFixed(4)}] sd ${s.sd.toFixed(4)}`; };
for (const id of ['rxCompletas', 'urgentes', 'surtidoCedis', 'invCedis', 'mermaUnid', 'cumplimiento']) console.log(id.padEnd(14), show(id, 'A'), '|', show(id, 'B'));
console.log('ms por réplica', out.A.map(x => x.ms).join(', '));
// las réplicas difieren entre sí
assert.ok(new Set(out.A.map(x => x.m.rxCompletas.toFixed(6))).size > 1, 'las réplicas deben diferir');
// misma réplica, mismo brazo = mismo resultado (determinismo)
const again = runReplica(data, cat, { arm: A, rep: 3, day: 0 });
assert.deepEqual(again.m, out.A[2].m, 'determinismo por réplica');
// estrés de demanda empeora el surtido
const S = runReplica(data, cat, { arm: { ...A, demanda: 1.6, fallas: 2.5, retraso: 7 }, rep: 3, day: 0 });
console.log('estrés fuerte: piezas negadas', S.m.pzNegadas, 'vs', out.A[2].m.pzNegadas, '· surtido CEDIS', S.m.surtidoCedis.toFixed(3), 'vs', out.A[2].m.surtidoCedis.toFixed(3));
assert.ok(S.m.pzNegadas > out.A[2].m.pzNegadas && S.m.surtidoCedis < out.A[2].m.surtidoCedis);
const pd = paired(out.A.map(x => ({ rep: x.rep, v: x.m.rxCompletas })), out.B.map(x => ({ rep: x.rep, v: x.m.rxCompletas })), 'up');
console.log('pronóstico − mín/máx (recetas completas):', pd.mean.toFixed(4), `[${pd.lo.toFixed(4)}, ${pd.hi.toFixed(4)}]`, 'mejor en', (pd.pBetter * 100).toFixed(0) + ' %');
console.log('pruebas del laboratorio pasaron');

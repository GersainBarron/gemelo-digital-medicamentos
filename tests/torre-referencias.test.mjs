// La Torre de control incluye el eslabón «Referencia de pacientes»: node tests/torre-referencias.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const W = new URL('../web/', import.meta.url);
const { evaluar, fmtV } = await import(new URL('js/torre-engine.js', W));
const J = f => JSON.parse(readFileSync(new URL('assets/' + f, W)));
const D = { iss: J('estados_issste.json'), meds: J('medicamentos.json'), hgo: J('unidades_hidalgo.json'), layout: J('warehouse_layout.json'), slotClaves: J('slot_claves.json') };
const t0 = performance.now();
const R = evaluar(D, {});
console.log(`torre evaluada en ${((performance.now() - t0) / 1000).toFixed(1)} s · ${R.eslabones.length} eslabones`);
const e = R.eslabones.find(x => x.id === 'ref');
assert.ok(e && e.trans, 'falta el eslabón transversal de referencias');
for (const k of e.kpis) console.log(`  ${k.st.padEnd(4)} ${k.n}: ${fmtV(k.v, k.fmt)} (meta ${fmtV(k.meta, k.fmt)})${k.of?.length ? ' · ' + k.of.map(o => o.quien).join('; ') : ''}`);
assert.ok(e.kpis.every(k => k.info || Number.isFinite(k.v)), 'indicador sin valor');
const ll = R.llamadas.filter(l => l.eslabon === 'ref');
console.log(`llamadas de referencias: ${ll.length} · reparto ${(100 * R.reparto.find(r => r.id === 'ref').share).toFixed(1)} %`);
assert.ok(ll.length > 0, 'la torre no llama a nadie por referencias');
// el resto de la torre sigue igual
assert.equal(R.eslabones.filter(x => !x.trans).length, 8);
console.log('OK');

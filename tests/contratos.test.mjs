// Pruebas del motor de contratos: node tests/contratos.test.mjs [normal|contingencia]
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
globalThis.location = { search: '', href: 'http://x/' };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const W = new URL('../web/', import.meta.url);
const { setScenario, DAY } = await import(new URL('js/supply.js', W));
const scen = process.argv[2] || 'normal';
setScenario(scen);
const { CedisInventory } = await import(new URL('js/network-sim.js', W));
const { Contratos, REGLAS, mxn, fecha } = await import(new URL('js/contratos.js', W));
const data = JSON.parse(readFileSync(new URL('assets/unidades_hidalgo.json', W)));
const cat = JSON.parse(readFileSync(new URL('assets/medicamentos.json', W)));
let t0 = performance.now();
const inv = new CedisInventory(data, cat, 'minmax');
const t1 = performance.now();
const K = new Contratos(inv, cat, scen);
const t2 = performance.now();
console.log(`escenario ${scen}: inventario ${(t1 - t0).toFixed(0)} ms · contratos ${(t2 - t1).toFixed(0)} ms · ${K.os.length} OS · ${K.hechos.length} hechos`);
const T = 0 * DAY + 10 * 3600;
const t3 = performance.now(); const E = K.estado(T); console.log(`estado(t) ${(performance.now() - t3).toFixed(0)} ms`);
for (const c of E.contratos) console.log(c.k.id, c.k.prov.padEnd(12), c.estado.padEnd(18), c.sem.padEnd(8), 'max', mxn(c.k.montoMax).padStart(14), 'penas', mxn(c.penasRaw).padStart(10), (100 * c.ratio).toFixed(1).padStart(5) + '% tope', 'ejercido', (100 * c.pctEjercido).toFixed(0) + '%', 'OS abiertas', c.abiertas.length);
console.log('colas', E.colas);

// ---- reglas ----
// 1) la pena es quirúrgica: solo partidas con pendiente después del vencimiento
let nPena = 0, nSinPena = 0;
for (const os of K.os) for (const p of os.partidas) {
  const pena = K.pena(p, T);
  const tardia = p.entregas.some(e => e.aceptada && Math.floor(e.t / DAY) > os.dLim) || (p.tCancel && Math.floor(p.tCancel / DAY) > os.dLim);
  if (pena > 0) { nPena++; assert.ok(tardia || T > os.tLim, 'pena sin atraso en ' + os.id); }
  else nSinPena++;
  const aTiempo = p.entregas.length && p.entregas.every(e => e.aceptada === p.q && Math.floor(e.t / DAY) <= os.dLim);
  if (aTiempo) assert.equal(pena, 0, 'partida entregada a tiempo con pena ' + os.id);
}
console.log(`partidas con pena ${nPena}, sin pena ${nSinPena}`);
// 2) fórmula: un día de atraso = pendiente × precio × 2.5 %
const ej = K.os.flatMap(o => o.partidas).find(p => K.diasAtraso(p, T) >= 3 && p.entregas.every(e => e.t > T));
if (ej) { const d1 = (ej.os.dLim + 1) * DAY; assert.ok(Math.abs(K.pena(ej, d1) - ej.q * ej.precio * REGLAS.tasaPenaDiaria) < 1e-6); console.log('fórmula OK en', ej.os.id); }
// 3) recepción mixta: algún camión con partidas aceptadas y rechazadas
const mixtos = K.os.flatMap(o => o.camiones).filter(c => c.rechazos && c.items.some(x => x.e.aceptada));
console.log('camiones con recepción mixta', mixtos.length, '· con rechazo', K.os.flatMap(o => o.camiones).filter(c => c.rechazos).length);
// 4) entrega trunca: deducción y rescate
const trunca = K.os.flatMap(o => o.partidas).filter(p => p.deduccion > 0);
console.log('entregas truncas', trunca.length, trunca[0] ? `ej. ${trunca[0].os.id} ${trunca[0].m.n} saldo ${trunca[0].rescate.q} deducción ${mxn(trunca[0].deduccion)}` : '');
for (const p of trunca) assert.ok(p.rescate && p.rescate.tArribo > p.tCancel);
// 5) la pena se detiene con el aviso de imposibilidad
for (const p of trunca) assert.equal(K.pena(p, p.tCancel + 30 * DAY), K.pena(p, p.tCancel + 1));
// 6) días hábiles
const { sumarHabiles } = await import(new URL('js/contratos.js', W));
assert.equal(sumarHabiles(-4, 5), 3);          // jue 22 oct + 5 hábiles = jue 29 oct
assert.equal(sumarHabiles(3, 2), 8);           // el 2 de noviembre es inhábil
console.log("todas las pruebas pasaron")

// ---- pagos e indicadores ----
const k30 = K.kpis(-30, -1, null, T);
console.log('KPIs últimos 30 días:', JSON.stringify({ gasto: mxn(k30.gasto), pagado: mxn(k30.pagado), cumplimiento: k30.cumplimiento?.toFixed(3), otif: k30.otifPct?.toFixed(3), rechazo: k30.rechazoPct?.toFixed(3), pagoATiempo: k30.pagoATiempoPct?.toFixed(3), habiles: k30.habilesProm?.toFixed(1), penasDev: mxn(k30.penasDevengadas), penasCob: mxn(k30.penasCobradas), deducciones: mxn(k30.deducciones), porPagar: mxn(k30.porPagar), sobrecosto: mxn(k30.sobrecosto) }));
// la suma de los días es igual al periodo
const serie = K.serie(-30, -1, null, T);
const sum = serie.reduce((n, x) => n + x.gasto, 0);
assert.ok(Math.abs(sum - k30.gasto) < 1e-3, 'serie diaria = periodo');
assert.ok(Math.abs(serie.reduce((n, x) => n + x.penas, 0) - k30.penasDevengadas) < 1e-3);
// pago neto = bruto - pena, y la pena cobrada nunca excede la devengada total de la partida
for (const f of K.facturas) { assert.ok(Math.abs(f.neto - (f.bruto - f.pena)) < 1e-6); assert.ok(f.pena <= K.pena(f.p, Infinity) + 1e-6); }
// el filtro por contrato particiona el total
const parts = K.contratos.reduce((n, c) => n + K.kpis(-30, -1, c.id, T).gasto, 0);
assert.ok(Math.abs(parts - k30.gasto) < 1e-3, 'filtro por contrato');
console.log('avance', K.avance(T).map(a => `${a.k.id} ${(a.pct * 100).toFixed(0)}% → ${(a.proyPct * 100).toFixed(0)}%${a.riesgoMinimo ? ' RIESGO MÍNIMO' : ''}`).join(' · '));
console.log('día -1:', Object.fromEntries(Object.entries(K.dia(-1)).map(([a, b]) => [a, b.length])));
console.log('pruebas de pagos e indicadores pasaron');

// ---- recorrido de expedientes ----
const { ETAPAS } = await import(new URL('js/contratos.js', W));
const cuenta = {};
for (const os of K.os) { const e = K.etapaOS(os, T); if (e) cuenta[e] = (cuenta[e] || 0) + 1; assert.ok(!e || ETAPAS[e], 'etapa desconocida ' + e); }
console.log('expedientes por etapa al corte:', JSON.stringify(cuenta));
const conRech = K.os.find(o => o.camiones.some(c => c.rechazos));
const rec = K.recorrido(conRech);
console.log(conRech.id, rec.map(x => `${x.etapa}(${(x.dur / 3600).toFixed(1)}h${x.ok === false ? '✗' : ''})`).join(' → '));
assert.ok(rec.some(x => x.etapa === 'RECHAZO') && rec[0].etapa === 'EMISION' && rec.at(-1).etapa === 'CERRADA');
const tr = K.os.find(o => o.partidas.some(p => p.deduccion > 0));
console.log(tr.id, K.recorrido(tr).map(x => x.etapa).join(' → '));
{ const r0 = performance.now(); for (const os of K.os) K.recorrido(os); console.log('recorridos', (performance.now() - r0).toFixed(0), 'ms'); }
console.log('pruebas de recorrido pasaron');

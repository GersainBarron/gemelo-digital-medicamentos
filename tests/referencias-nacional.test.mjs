// Pruebas de la red nacional de referencias y su cubo diario: node tests/referencias-nacional.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const W = new URL('../web/', import.meta.url);
const { Referencias, REGLAS, TERMINAL, DAY, H } = await import(new URL('js/referencias.js', W));
const { Cubo, ET, EDADES } = await import(new URL('js/referencias-cubo.js', W));
const data = JSON.parse(readFileSync(new URL('assets/estados_issste.json', W)));

let t0 = performance.now();
const K = new Referencias(data, { corteDia: 0 });
const tMotor = performance.now() - t0;
t0 = performance.now();
const C = Cubo.build(K);
const tCubo = performance.now() - t0;
const nSeg = K.refs.reduce((s, r) => s + r.seg.length, 0);
console.log(`red nacional: ${K.emisoras.length} emisoras → ${K.receptoras.length} receptoras · ${K.refs.length} referencias · ${nSeg} tramos`);
console.log(`motor ${tMotor.toFixed(0)} ms · cubo ${tCubo.toFixed(0)} ms`);
const [obj, bufs] = C.toTransfer();
const MB = bufs.reduce((s, b) => s + b.byteLength, 0) / 1e6;
console.log(`cubo para transferir: ${MB.toFixed(1)} MB en ${bufs.length} arreglos`);
assert.ok(K.emisoras.length > 850 && K.receptoras.length > 120, 'faltan unidades');
assert.ok(tMotor + tCubo < 8000, 'demasiado lento');

// 1) la red: cada emisora tiene destino y cada receptora sabe a dónde escalar
for (const e of K.emisoras) for (const c of ['CH', 'HG', 'CMFE', 'HR']) assert.ok(K.rx[e.dest[c].rx], `sin destino ${c} para ${e.id}`);
for (const u of K.receptoras) if (u.tipo !== 'CMN') assert.ok(K.rx[u.escala], 'sin escalamiento ' + u.id);
const fuera = K.emisoras.filter(e => e.dest.CH.fuera).length;
console.log(`emisoras que refieren fuera de su región (microrregión): ${fuera}`);

// 2) el cubo coincide con el motor en varias fotos (todo el país, una región, un estado)
const m = C.meta, IE = C.IE;
const bucket = a => { let b = 0; while (b < EDADES.length && a >= EDADES[b]) b++; return b; };
for (const dia of [-200, -90, -30, -1, 0]) {
  const di = dia - m.d0, t = dia * DAY + m.hora * H;
  for (const f of [{}, { region: 'I' }, { cve: '30' }]) {
    const want = Object.fromEntries(ET.map(k => [k, new Array(EDADES.length + 1).fill(0)]));
    for (const r of K.refs) {
      if (r.tCrea > t) break;
      const st = m.region[IE[r.emisora.cve]];
      if (f.region && st !== f.region) continue;
      if (f.cve && r.emisora.cve !== f.cve) continue;
      const e = K.etapa(r, t);
      if (e) want[e][bucket((t - r.tCrea) / DAY)]++;
    }
    assert.deepEqual(C.etapas(di, f), want, `etapas distintas día ${dia} ${JSON.stringify(f)}`);
  }
  // lista de espera por receptora
  const L = new Array(m.NR).fill(0), IR = Object.fromEntries(m.rx.map((u, i) => [u.id, i]));
  for (const r of K.refs) {
    if (r.tCrea > t) break;
    const s = K.segAt(r, t);
    if (t >= r.tCrea && s.rx && ['ACEPTACION', 'LIMBO', 'CITA', 'NO_ACUDIO'].includes(s.etapa) && s.t1 > t) L[IR[s.rx]]++;
  }
  assert.deepEqual(m.rx.map((u, x) => C.saturacion(di, x).L), L, 'lista de espera distinta día ' + dia);
}
console.log('cubo = motor en 5 fotos × 3 filtros ✓');

// 3) flujos: cada envío a una receptora queda contado una vez
const nEnvios = K.refs.reduce((s, r) => s + r.seg.filter((x, i) => x.etapa === 'ACEPTACION' && r.seg[i - 1]?.etapa !== 'LIMBO' && x.t0 >= m.d0 * DAY && x.t0 < (m.d0 + m.ND) * DAY).length, 0);
assert.equal(C.fDia.length, nEnvios);
const dC = m.ND - 1;
const totU = C.flujos(dC, 9999, 'unidad').reduce((s, g) => s + g.n, 0), totE = C.flujos(dC, 9999, 'estado').reduce((s, g) => s + g.n, 0), totR = C.flujos(dC, 9999, 'region').reduce((s, g) => s + g.n, 0);
assert.ok(totU === nEnvios && totE === nEnvios && totR === nEnvios, 'la agregación pierde flujos');
console.log(`flujos: ${nEnvios} envíos · pares unidad ${C.flujos(dC, 28, 'unidad').length} · estado ${C.flujos(dC, 28, 'estado').length} · región ${C.flujos(dC, 28, 'region').length} (últimos 28 días)`);

// 4) rendimiento de las consultas que hará la página en cada cuadro
t0 = performance.now();
for (let i = 0; i < 50; i++) { C.etapas(dC - i, {}); C.saturacionTodas(dC - i); C.flujos(dC - i, 28, 'estado'); }
console.log(`consulta por cuadro (etapas + saturación de 131 receptoras + flujos por estado): ${((performance.now() - t0) / 50).toFixed(1)} ms`);

// 5) transferencia entre hilos: el cubo reconstruido responde igual
const C2 = Cubo.from(structuredClone(obj));
assert.deepEqual(C2.etapas(dC, { region: 'XIII' }), C.etapas(dC, { region: 'XIII' }));
assert.deepEqual(C2.flujos(dC, 28, 'region').slice(0, 5), C.flujos(dC, 28, 'region').slice(0, 5));

// ---- panorama al corte (para calibrar) ----
const E = C.etapas(dC), abiertas = ET.filter(k => !TERMINAL.has(k)).reduce((s, k) => s + E[k].reduce((a, b) => a + b, 0), 0);
console.log(`al corte: ${abiertas} referencias abiertas · en cita ${E.CITA.reduce((a, b) => a + b, 0)} · sin respuesta ${E.LIMBO.reduce((a, b) => a + b, 0)}`);
const S = C.saturacionTodas(dC).sort((a, b) => b.W - a.W);
const cuenta = S.reduce((o, s) => ((o[s.sem] = (o[s.sem] || 0) + 1), o), {});
console.log('saturación de receptoras', JSON.stringify(cuenta));
for (const s of S.slice(0, 5)) console.log(`  ${s.u.corto.padEnd(30)} ${s.u.cve} L=${s.L} entran=${s.lambdaSem.toFixed(1)}/sem salen=${s.salidasSem.toFixed(1)}/sem atendidas=${s.muSem.toFixed(1)}/sem ρ=${s.rho.toFixed(2)} W=${Math.round(s.W)} d ${s.sem}`);
const Ws = S.map(s => s.W).filter(Number.isFinite).sort((a, b) => a - b), rh = S.map(s => s.rho).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`  espera W p10/p50/p90 = ${[0.1, 0.5, 0.9].map(p => Math.round(Ws[Math.floor(Ws.length * p)])).join(' / ')} días · ρ mediana ${rh[rh.length >> 1].toFixed(2)}`);
// 7) conservación: lo que entra a las listas = lo que sale + lo que queda
const ent = m.rx.reduce((s, u, x) => s + C.saturacion(dC, x, m.ND).lambdaSem, 0) * m.ND / 7;
const sal = m.rx.reduce((s, u, x) => s + C.saturacion(dC, x, m.ND).salidasSem, 0) * m.ND / 7;
const Lc = m.rx.reduce((s, u, x) => s + C.saturacion(dC, x).L, 0);
console.log(`  listas de espera: entraron ${Math.round(ent)} · salieron ${Math.round(sal)} · quedan ${Lc}`);
assert.ok(Math.abs(ent - sal - Lc) < 0.01 * ent, 'las listas de espera no cuadran');
const RES = C.resumen(dC);
console.log(`últimos 90 días: creadas ${RES.CREADAS} · atendidas ${RES.ATENDIDAS} (${(100 * RES.EN_PLAZO / RES.ATENDIDAS).toFixed(1)} % en ≤ 15 d) · cierres natural ${RES.CERRADA} / sin cierre ${RES.SIN_CIERRE} / no regresó ${RES.ABANDONO} / quemada ${RES.QUEMADA}`);
for (const g of C.flujos(dC, 28, 'region').filter(g => g.ori !== g.des).slice(0, 5)) console.log(`  región ${g.ori} → ${g.des}: ${g.n} envíos (${g.fuera} por microrregión, ${g.escal} escalamientos)`);

// 6b) la foto calculada en el worker (para filtros por especialidad) cuadra con el cubo
const { vistaDia } = await import(new URL('js/referencias-vista.js', W));
const { ESPECIALIDADES } = await import(new URL('js/referencias.js', W));
const tV = (m.d0 + dC) * DAY + m.hora * H;
t0 = performance.now();
const V = vistaDia(K, tV, {}, 28);
const tVista = performance.now() - t0;
const Ec = C.etapas(dC);
for (const k of ET) assert.deepEqual(V.etapas[k] || new Array(EDADES.length + 1).fill(0), Ec[k], 'vista ≠ cubo en ' + k);
assert.deepEqual(V.sat.map(s => s.L), m.rx.map((u, x) => C.saturacion(dC, x).L), 'listas de espera de la vista ≠ cubo');
const porEsp = ESPECIALIDADES.map(e => vistaDia(K, tV, { esp: e.n }, 28));
for (const k of ET) {
  const suma = porEsp.reduce((a, v) => a + (v.etapas[k] || []).reduce((x, y) => x + y, 0), 0);
  assert.equal(suma, Ec[k].reduce((x, y) => x + y, 0), 'las especialidades no suman el total en ' + k);
}
const espCita = porEsp.map((v, i) => [ESPECIALIDADES[i].n, (v.etapas.CITA || []).reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]);
console.log(`vista por especialidad: ${tVista.toFixed(0)} ms · en cita: ${espCita.slice(0, 4).map(([n, c]) => `${n} ${c}`).join(' · ')}`);
const Bt = K.tablero(tV, { esp: 'Oftalmología', region: 'I' });
assert.ok(Bt.abiertas.a15 + Bt.abiertas.a30 + Bt.abiertas.a90 + Bt.abiertas.cron > 0, 'el tablero no filtra por especialidad');

// 6) el cubo también funciona con la red de Hidalgo
const Kh = new Referencias(JSON.parse(readFileSync(new URL('assets/unidades_hidalgo.json', W))), { corteDia: 0 });
const Ch = Cubo.build(Kh);
const th = 8 * H, want = {};
for (const r of Kh.refs) { const e = Kh.etapa(r, th); if (e) want[e] = (want[e] || 0) + 1; }
const got = Object.fromEntries(Object.entries(Ch.etapas(Ch.meta.ND - 1)).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)]).filter(([, n]) => n));
assert.deepEqual(got, want);
console.log('Hidalgo ✓ · OK');

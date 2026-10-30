// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  torre-roles.js · La torre vista por cada responsable ("Ver como")
//
//  Misma corrida de la torre, recortada al alcance de cada puesto:
//   · jefe   Jefe de jefes (la torre completa, en torre.js)
//   · area   Dueño de un eslabón (Adquisiciones, CENADI, Red Fría…)
//   · ana    Analista de Oficina Central (sus delegaciones)
//   · del    Administrador(a) delegacional (su estado y sus unidades)
//   · unit   Director(a) de unidad médica (su unidad)
//   · k      Administrador(a) de un contrato (piloto Hidalgo)
//  Cada vista responde lo mismo en el mismo orden: cómo voy, qué me toca
//  hoy (con plazo según el nivel de escalamiento), de quién dependo y a
//  quién afecto, mi gente y cómo me comparo con mis pares.
// =====================================================================
import { ESLABONES, NIVELES, DEP, fmtV } from './torre-engine.js';
import { abiertoDe, EST, EST_ST } from './torre-seguimiento.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = x => Math.round(x || 0).toLocaleString('es-MX');
const pc = x => `${Math.round((x || 0) * 100)} %`;
const mxn = v => fmtV(v, 'mxn');
const PLAZO = { 1: 'en 24 a 48 h', 2: 'antes de la junta semanal', 3: 'esta semana, con dirección general' };
const ST_TXT = { ok: 'En meta', warn: 'Fuera de meta', crit: 'Crítico', nd: 'Sin dato' };
const U_ST = ['ok', 'ok', 'warn', 'crit'];
const U_TXT = ['Sin pendientes', 'En plazo', 'Ámbar', 'Rojo'];
const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const worstSt = arr => arr.reduce((s, x) => (({ ok: 0, nd: 0, warn: 1, crit: 2 })[x] > ({ ok: 0, nd: 0, warn: 1, crit: 2 })[s] ? x : s), 'ok');

const SUPERVISA = {
  plan: 'los 5 analistas de Oficina Central y los 32 administradores delegacionales', compra: 'el equipo de la licitación consolidada', prov: 'los administradores de los 8 contratos del piloto',
  cenadi: 'recepción, almacenaje, surtido y embarque del CENADI', dnac: 'las rutas del CENADI a los 32 almacenes estatales', alm: 'los almacenistas del CEDIS de Hidalgo',
  dest: 'las rutas del CEDIS a las 60 unidades', unidad: 'los directores y las jefaturas de farmacia', frio: 'los responsables de red fría de cada almacén y unidad', integ: 'los revisores de pedidos y el enlace con el Órgano Interno de Control',
};
export const ROLES = {
  jefe: 'Jefe de jefes', area: 'Dueño de área', ana: 'Analista de Central', del: 'Delegación', unit: 'Unidad médica', k: 'Contrato',
};

// ------------------------------------------------------------------ rol ↔ texto
export function rolKey(r) { return r.t === 'jefe' ? 'jefe' : `${r.t}:${r.t === 'area' ? r.id : r.t === 'ana' ? r.a : r.t === 'del' ? r.cve : r.t === 'unit' ? r.i : r.id}`; }
export function rolDe(txt) {
  const [t, v] = String(txt || 'jefe').split(':');
  if (t === 'area' && ESLABONES.some(e => e.id === v)) return { t, id: v };
  if (t === 'ana' && /^[0-4]$/.test(v)) return { t, a: +v };
  if (t === 'del' && /^\d\d$/.test(v)) return { t, cve: v };
  if (t === 'unit' && /^\d+$/.test(v)) return { t, i: +v };
  if (t === 'k' && /^C\d$/.test(v)) return { t, id: v };
  return { t: 'jefe' };
}
export function rolNombre(R, r) {
  if (r.t === 'area') return ESLABONES.find(e => e.id === r.id).dueno;
  if (r.t === 'ana') return `Analista ${r.a + 1} de Oficina Central`;
  if (r.t === 'del') return `Administrador(a) delegacional de ${R.roles.delegaciones.find(d => d.cve === r.cve)?.nombre}`;
  if (r.t === 'unit') return `Director(a) de ${R.unidades[r.i]?.nombre}`;
  if (r.t === 'k') { const k = R.roles.contratos.find(c => c.id === r.id); return `Administrador(a) del contrato ${k.id} · ${k.prov}`; }
  return 'Jefe de jefes';
}
// 3D: qué enfocar cuando se ve como este rol
export function rolFoco(R, r) {
  if (r.t === 'del') return { type: 'del', cve: r.cve };
  if (r.t === 'unit') return { type: 'unit', i: r.i };
  if (r.t === 'k') return { type: 'del', cve: '13' };
  if (r.t === 'area' && (r.id === 'cenadi' || r.id === 'dnac')) return { type: 'cenadi' };
  if (r.t === 'area' && ['alm', 'dest', 'unidad', 'prov'].includes(r.id)) return { type: 'del', cve: '13' };
  return null;
}

// ------------------------------------------------------------------ piezas comunes
const tile = (n, v, st, sub) => `<div class="kpi ${st || ''}"><span>${esc(n)}</span><b>${v}</b><small><i class="dot"></i>${esc(sub || ST_TXT[st] || '')}</small></div>`;
// botón para convertir una acción en compromiso, o su estado si ya existe
export function compBtn(L, d) {
  const c = abiertoDe(L, d.ref) || [...L].reverse().find(x => x.ref === d.ref && x.estado === 'cumplido');
  if (c) return `<button class="tw-comp-st ${EST_ST[c.estado]}" data-tab-go="seg" title="Ver en Seguimiento">${esc(EST[c.estado])} · ${c.estado === 'cumplido' ? `día ${c.cerradoDia}` : `vence día ${c.vence}`}${c.nivel > c.nivel0 ? ` · subió a nivel ${c.nivel}` : ''}</button>`;
  return `<button class="tw-comp" data-comp="${esc(encodeURIComponent(JSON.stringify(d)))}">Comprometer</button>`;
}
function acciones(items, ctx) {
  if (!items.length) return '<p class="tw-ok-msg">Nada pendiente: todo lo tuyo está en meta.</p>';
  items.sort((a, b) => b.nivel - a.nivel);
  return `<ol class="tw-acc">${items.map(x => {
    const d = x.m && !x.arriba ? { ...x.m, quien: x.quien || ctx.quien, rol: x.rol || ctx.rol, txt: x.txt, nivel: x.nivel } : null;
    return `
    <li class="n${x.nivel}${x.arriba ? ' up' : ''}">
      <span class="tw-acc-t">
        <b>${esc(x.txt)}</b>
        ${x.det ? `<small>${esc(x.det)}</small>` : ''}
        <em>${x.arriba ? 'Reclamar hacia arriba' : esc(NIVELES[x.nivel].n)} · ${esc(x.arriba ? (x.a || '') : PLAZO[x.nivel])}</em>
      </span>
      <span class="tw-acc-b">${d ? compBtn(ctx.L, d) : ''}${x.go ? `<button class="tw-go" data-rol="${esc(x.go)}">Ver →</button>` : ''}</span>
    </li>`;
  }).join('')}</ol>`;
}
function relaciones(arriba, abajo) {
  const row = x => `<li class="${x.st || ''}">${x.go ? `<button data-rol="${esc(x.go)}">` : '<span>'}<i class="dot"></i><b>${esc(x.n)}</b><small>${esc(x.det || '')}</small>${x.go ? '</button>' : '</span>'}</li>`;
  return `<div class="tw-rel">
    <div><p class="u3d-h">De quién dependes</p><ul>${arriba.map(row).join('') || '<li class="muted">Nadie arriba de ti en la cadena.</li>'}</ul></div>
    <div><p class="u3d-h">A quién afectas</p><ul>${abajo.map(row).join('') || '<li class="muted">—</li>'}</ul></div>
  </div>`;
}
// comparación: barra horizontal con todos los pares; tú resaltado. menor = mejor si dir < 0
function compara(titulo, pares, yo, fmt, dir = -1) {
  const vals = pares.map(p => p.v).filter(v => v != null && isFinite(v));
  if (!vals.length || Math.max(...vals) === Math.min(...vals)) return '';
  const max = Math.max(...vals, 1e-9), m = med(vals);
  const orden = [...pares].sort((a, b) => dir < 0 ? a.v - b.v : b.v - a.v), pos = orden.findIndex(p => p.id === yo) + 1;
  const me = pares.find(p => p.id === yo);
  const peor = dir < 0 ? me.v > m : me.v < m;
  return `<div class="tw-cmp">
    <div class="tw-cmp-h"><span>${esc(titulo)}</span><b class="${me.v === m ? '' : peor ? 'warn' : 'ok'}">${fmtV(me.v, fmt)}</b><small>lugar ${pos} de ${pares.length} · mediana ${fmtV(m, fmt)}</small></div>
    <div class="tw-cmp-bars">${orden.map(p => `<i class="${p.id === yo ? 'yo' : ''}" style="height:${Math.max(4, (p.v / max) * 100).toFixed(0)}%" title="${esc(p.n)}: ${fmtV(p.v, fmt)}"></i>`).join('')}</div>
  </div>`;
}
function encabezado(R, r, st, reporta, supervisa, alcance, nivel) {
  return `<section class="card tw-rh ${st}">
    <div class="tw-rh-main">
      <span class="eyebrow">Vista de ${esc(ROLES[r.t])} · ${esc(R.escN)}</span>
      <h1>${esc(rolNombre(R, r))}</h1>
      <p>${esc(alcance)}</p>
      <div class="tw-rh-chips"><span class="chip ${st}">${esc(ST_TXT[st])}</span>${nivel ? `<span class="chip ${['', 'info', 'warn', 'crit'][nivel]}">${esc(NIVELES[nivel].n)}</span>` : '<span class="chip ok">Sin escalamiento</span>'}</div>
    </div>
    <dl class="tw-rh-dl"><dt>Reporta a</dt><dd>${reporta}</dd><dt>Supervisa a</dt><dd>${supervisa}</dd></dl>
  </section><!--misc-->`;
}
function gente(titulo, cols, filas) {
  if (!filas.length) return '';
  return `<section class="card"><div class="card-h"><h2>${esc(titulo)} <small>peores primero · toca una fila para ver su tablero</small></h2></div>
    <div class="m-table"><table class="tw-tbl tw-gente"><thead><tr>${cols.map(c => `<th${c.n ? ' class="n"' : ''}>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>
    ${filas.map(f => `<tr ${f.go ? `data-rol="${esc(f.go)}"` : ''} class="${f.st || ''}">${f.c.map((x, k) => `<td${cols[k].n ? ' class="n"' : ''}>${x}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div></section>`;
}
const stDot = st => `<span class="tw-sd ${st}"><i></i>${esc(ST_TXT[st] || st)}</span>`;
const nivelMax = items => items.reduce((m, x) => (x.arriba ? m : Math.max(m, x.nivel)), 0);

// ------------------------------------------------------------------ vista por rol
let CTX = null;
export function vistaRol(R, r, L = []) {
  CTX = { L, quien: rolNombre(R, r), rol: rolKey(r) };
  const mis = L.filter(c => c.rol === CTX.rol), ab = mis.filter(c => !['cumplido', 'cerrado'].includes(c.estado));
  const banda = mis.length ? `<div class="tw-misc"><b>Tus compromisos:</b> ${ab.length} abiertos${ab.filter(c => c.estado === 'vencido' || c.escalado).length ? ` · <span class="crit">${ab.filter(c => c.estado === 'vencido' || c.escalado).length} ya subieron de nivel</span>` : ''} · ${mis.filter(c => c.estado === 'cumplido').length} cumplidos <button class="tw-lnk" data-tab-go="seg">Ver en Seguimiento →</button></div>` : '';
  const html = r.t === 'del' ? vistaDel(R, r.cve) : r.t === 'unit' ? vistaUnidad(R, r.i) : r.t === 'ana' ? vistaAnalista(R, r.a) : r.t === 'area' ? vistaArea(R, r.id) : r.t === 'k' ? vistaContrato(R, r.id) : '';
  return html.replace('<!--misc-->', banda);
}

// ---- Administrador(a) delegacional
function vistaDel(R, cve) {
  const D = R.roles.delegaciones.find(d => d.cve === cve), row = R.matriz.rows.find(x => x.cve === cve), nac = R.nac.find(x => x.cve === cve);
  const us = R.unidades.filter(u => u.cve === cve), cnt = [0, 0, 0, 0]; us.forEach(u => cnt[u.st]++);
  const A = R.roles.analistas[D.analista], piloto = cve === '13';
  const rojas = us.filter(u => u.esc2 > 0 || u.integ).sort((a, b) => (b.integ?.monto || 0) - (a.integ?.monto || 0) || b.esc2 - a.esc2);
  const acc = [];
  if (D.venc) acc.push({ m: { ref: `del:${cve}.venc`, meta: 0, dir: -1, fmt: 'num' }, nivel: D.esc2 ? 2 : 1, txt: `Desahoga ${n0(D.venc)} peticiones vencidas de tu bandeja`, det: `La más vieja lleva ${D.oldest} días; ${n0(D.esc2)} ya pasaron el plazo de escalamiento a Central.` });
  if (rojas.length) acc.push({ m: { ref: `del:${cve}.rojas`, meta: 0, dir: -1, fmt: 'num' }, nivel: 2, txt: `Llama a ${rojas.length === 1 ? 'un director' : `${rojas.length} directores`} de unidad en rojo`, det: rojas.slice(0, 3).map(u => `${u.nombre}: ${u.m[0]?.[1] || ''}`).join(' · '), go: `unit:${rojas[0].i}` });
  if (D.uSinFin) acc.push({ m: { ref: `del:${cve}.uSinFin`, meta: 0, dir: -1, fmt: 'num' }, nivel: 1, txt: `${D.uSinFin} ${D.uSinFin === 1 ? 'unidad no ha' : 'unidades no han'} concluido su pedido del plan`, det: 'Sin su pedido concluido, tu validación no puede cerrar.' });
  if (D.desvCosto > 0.1) acc.push({ m: { ref: `del:${cve}.desvCosto`, meta: 0.1, dir: -1, fmt: 'pct' }, nivel: D.desvCosto > 0.2 ? 2 : 1, txt: `Justifica o recorta: tu plan cuesta ${pc(D.desvCosto)} más que la propuesta`, det: `${mxn(D.costo)} contra ${mxn(D.costo0)} propuestos.` });
  if (D.frio.oculto > 0) acc.push({ m: { ref: `del:${cve}.frio`, meta: 0, dir: -1, fmt: 'mxn' }, nivel: D.frio.oculto > 250000 ? 2 : 1, txt: `Revisa la red fría: ${mxn(D.frio.oculto)} de producto dañado que nadie detectó`, det: D.frio.nodos.map(x => `${x.nombre} (${x.label})`).join(' · ') });
  const ig = { n: (D.integ?.n || 0) + (D.integU?.n || 0), monto: (D.integ?.monto || 0) + (D.integU?.monto || 0), c: [...new Set([...(D.integ?.c || []), ...(D.integU?.c || [])])] };
  if (ig.n) acc.push({ m: { ref: `del:${cve}.integ`, meta: 0, dir: -1, fmt: 'mxn' }, nivel: ig.monto > 1e6 ? 3 : 2, txt: `Da vista al Órgano Interno de Control: ${ig.n} ${ig.n === 1 ? 'pedido malicioso pasó' : 'pedidos maliciosos pasaron'} los controles`, det: `${mxn(ig.monto)} · ${ig.c.join(', ')}` });
  if (nac?.outH) acc.push({ arriba: true, nivel: 1, txt: `Tu almacén estatal estuvo ${(Math.round(nac.outH / 24 * 10) / 10).toLocaleString('es-MX')} días en cero`, det: `Demanda atendida ${fmtV(nac.abasto, 'pct1')}; ${nac.late} de ${nac.ships} embarques llegaron tarde.`, a: 'a la Coordinación de Distribución del CENADI', go: 'area:dnac' });
  if (piloto) for (const id of ['alm', 'dest']) { const e = R.eslabones.find(x => x.id === id); for (const k of e.kpis) if (k.st === 'crit') acc.push({ m: { ref: `kpi:${id}.${k.id}`, meta: k.meta, dir: k.dir, fmt: k.fmt }, quien: k.quien, rol: `area:${id}`, nivel: 2, txt: `${e.id === 'alm' ? 'Almacén' : 'Distribución'}: ${k.n} en ${fmtV(k.v, k.fmt)}`, det: `Meta ${fmtV(k.meta, k.fmt)}. Responde: ${k.quien}.`, go: `area:${id}` }); }
  const st = worstSt(Object.values(row.c).map(c => c.st));
  const tiles = R.matriz.cols.map(c => tile(c.n, esc(row.c[c.id].v), row.c[c.id].st, row.c[c.id].det)).join('') + tile('Unidades en rojo', `${cnt[3]}<i> de ${us.length}</i>`, cnt[3] ? 'crit' : cnt[2] ? 'warn' : 'ok', `${cnt[2]} en ámbar`);
  const ups = [
    { n: A.nombre, st: A.sem, det: `revisa tus peticiones en Central: ${n0(A.venc)} vencidas entre sus ${A.dels.length} delegaciones`, go: `ana:${A.a}` },
    nac && { n: 'CENADI → tu almacén estatal', st: nac.outH ? 'crit' : nac.late ? 'warn' : 'ok', det: `${fmtV(nac.abasto, 'pct1')} de demanda atendida · ${nac.late} de ${nac.ships} embarques tarde`, go: 'area:dnac' },
    { n: 'Compra consolidada', st: R.eslabones.find(e => e.id === 'compra').st, det: `${fmtV(R.norte.find(x => x.id === 'contratado').v, 'pct')} de las piezas del plan con contrato`, go: 'area:compra' },
  ].filter(Boolean);
  const downs = [{ n: `Tus ${us.length} unidades médicas`, st: cnt[3] ? 'crit' : cnt[2] ? 'warn' : 'ok', det: `${cnt[3]} en rojo, ${cnt[2]} en ámbar, ${cnt[1]} en plazo, ${cnt[0]} sin pendientes` }, { n: 'Pacientes del estado', st: nac?.outH ? 'crit' : 'ok', det: nac?.outH ? 'hubo días sin existencia en el almacén estatal' : 'el almacén estatal no llegó a cero' }];
  const pares = R.roles.delegaciones.map(d => ({ id: d.cve, n: d.nombre }));
  const rows = Object.fromEntries(R.matriz.rows.map(x => [x.cve, x]));
  const cmp = [
    compara('Puntos rojos en la matriz', pares.map(p => ({ ...p, v: rows[p.id].score })), cve, 'num'),
    compara('Peticiones vencidas en tu bandeja', pares.map(p => ({ ...p, v: R.roles.delegaciones.find(d => d.cve === p.id).venc })), cve, 'num'),
    compara('Costo arriba de la propuesta', pares.map(p => ({ ...p, v: R.roles.delegaciones.find(d => d.cve === p.id).desvCosto })), cve, 'pct'),
    compara('Red fría dañada sin detectar', pares.map(p => ({ ...p, v: R.roles.delegaciones.find(d => d.cve === p.id).frio.oculto })), cve, 'mxn'),
  ].join('');
  const fil = [...us].sort((a, b) => b.st - a.st || (b.integ?.monto || 0) - (a.integ?.monto || 0) || b.venc - a.venc).map(u => ({
    go: `unit:${u.i}`, st: U_ST[u.st],
    c: [`<b>${esc(u.nombre)}</b><small class="tw-sub">${esc(u.tipo)} · ${esc(u.clues)}</small>`, stDot(U_ST[u.st]).replace(ST_TXT[U_ST[u.st]], U_TXT[u.st]), esc(u.m[0]?.[1] || '—'), n0(u.venc), u.integ ? mxn(u.integ.monto) : '—', ...(piloto ? [u.hgo ? fmtV(u.hgo.s, 'pct') : '—'] : [])],
  }));
  return encabezado(R, { t: 'del', cve }, st, `<button class="tw-lnk" data-rol="ana:${A.a}">${esc(A.nombre)}</button> en Oficina Central`, `${us.length} directores de unidad`, `Delegación ${D.nombre}${piloto ? ' · piloto con detalle de almacén, rutas y farmacias' : ''}`, nivelMax(acc))
    + `<section class="kpis tw-rtiles" style="--kc:6">${tiles}</section>`
    + `<div class="split tw-split"><section class="card"><div class="card-h"><h2>Lo que te toca hoy <small>con plazo según su nivel · marca lo que ya hiciste</small></h2></div>${acciones(acc, CTX)}</section>
       <section class="card"><div class="card-h"><h2>Tu lugar en la cadena</h2></div>${relaciones(ups, downs)}<p class="u3d-h">Cómo te comparas con las 32 delegaciones</p><div class="tw-cmps">${cmp}</div></section></div>`
    + gente('Tus unidades', [{ h: 'Unidad' }, { h: 'Estado' }, { h: 'Motivo principal' }, { h: 'Vencidas', n: 1 }, { h: 'Integridad', n: 1 }, ...(piloto ? [{ h: 'Recetas completas', n: 1 }] : [])], fil);
}

// ---- Director(a) de unidad
function vistaUnidad(R, i) {
  const u = R.unidades[i], D = R.roles.delegaciones.find(d => d.cve === u.cve), nac = R.nac.find(x => x.cve === u.cve), h = u.hgo;
  const acc = [];
  if (u.esc2) acc.push({ m: { ref: `unit:${i}.venc`, meta: 0, dir: -1, fmt: 'num' }, nivel: 2, txt: `Atiende ${n0(u.esc2)} partidas del plan que ya se escalaron`, det: 'Llevan más días en tu bandeja que el plazo más la tolerancia: Central ya las ve.' });
  else if (u.venc) acc.push({ m: { ref: `unit:${i}.venc`, meta: 0, dir: -1, fmt: 'num' }, nivel: 1, txt: `Atiende ${n0(u.venc)} partidas del plan vencidas en tu bandeja` });
  if (u.inPlan && !u.fin) acc.push({ m: { ref: `unit:${i}.abierto`, meta: 0, dir: -1, fmt: 'num' }, nivel: 1, txt: 'Concluye tu pedido del plan anual', det: 'Tu delegación no puede validar hasta que lo concluyas.' });
  if (u.integ) acc.push({ m: { ref: `unit:${i}.integ`, meta: 0, dir: -1, fmt: 'mxn' }, nivel: u.integ.monto > 1e6 ? 3 : 2, txt: `Aclara ante el Órgano Interno de Control ${u.integ.n === 1 ? 'un pedido que pasó' : `${u.integ.n} pedidos que pasaron`} como malicioso`, det: `${mxn(u.integ.monto)} · ${u.m.find(x => /malicios/.test(x[1]))?.[1] || ''}` });
  const infl = u.m.find(x => /arriba de su consumo/.test(x[1]));
  if (infl) acc.push({ nivel: 1, txt: `Justifica: ${infl[1]}` });
  if (h) {
    if (h.s < 0.97) acc.push({ m: { ref: `unit:${i}.s`, meta: 0.97, dir: 1, fmt: 'pct' }, nivel: h.s < 0.9 ? 2 : 1, txt: `Revisa con tu Jefatura de farmacia las recetas incompletas: ${fmtV(h.s, 'pct')} completas`, det: `${n0(h.rx - Math.round(h.s * h.rx))} recetas incompletas y ${n0(h.den)} negadas en 30 días. Pide traspaso o PEX antes de negar.` });
    if (h.pex && h.pe < 0.9) acc.push({ m: { ref: `unit:${i}.pe`, meta: 0.9, dir: 1, fmt: 'pct' }, nivel: h.pe < 0.75 ? 2 : 1, txt: `Valida y autoriza los PEX en plazo: solo ${fmtV(h.pe, 'pct')} a tiempo`, det: 'Validar en 2 h y autorizar en 4 h.' });
    if (h.reqLate) acc.push({ arriba: true, nivel: 1, txt: `${h.reqLate} de ${h.reqs} urgencias te llegaron tarde`, a: 'a la Jefatura de Distribución delegacional', go: 'area:dest' });
  }
  const st = U_ST[u.st];
  const tiles = [
    tile('Partidas en tu bandeja', n0(u.pend), u.esc2 ? 'crit' : u.venc ? 'warn' : 'ok', `${n0(u.venc)} vencidas`),
    tile('Pedido del plan', u.inPlan ? (u.fin ? 'Concluido' : 'Abierto') : 'Fuera', u.inPlan && !u.fin ? 'warn' : 'ok', u.inPlan ? 'plan anual 2027' : 'no participa'),
    tile('Integridad', u.integ ? mxn(u.integ.monto) : 'Limpio', u.integ ? 'crit' : 'ok', u.integ ? (u.integ.n === 1 ? '1 pedido pasó' : `${u.integ.n} pedidos pasaron`) : 'sin casos que pasaran'),
    h ? tile('Recetas completas', fmtV(h.s, 'pct'), h.s < 0.9 ? 'crit' : h.s < 0.97 ? 'warn' : 'ok', `meta ≥ 97 % · ${n0(h.rx)} recetas`) : tile('Recetas completas', '—', 'nd', 'fuera del piloto Hidalgo'),
    h ? tile('PEX en plazo', h.pex ? fmtV(h.pe, 'pct') : '—', h.pex && h.pe < 0.75 ? 'crit' : h.pex && h.pe < 0.9 ? 'warn' : 'ok', `${h.pex} pedidos extraordinarios`) : '',
    h ? tile('Piezas caducadas', n0(h.merma), '', '30 días') : '',
  ].join('');
  const alm = R.eslabones.find(e => e.id === 'alm').kpis.find(k => k.id === 'fill'), urg = R.eslabones.find(e => e.id === 'dest').kpis.find(k => k.id === 'urg');
  const ups = [
    { n: `Administrador(a) delegacional de ${D.nombre}`, st: D.sem, det: `${n0(D.venc)} peticiones vencidas en su bandeja`, go: `del:${u.cve}` },
    h ? { n: 'Almacén estatal (CEDIS Hidalgo)', st: alm.st, det: `surtido completo ${fmtV(alm.v, 'pct')}`, go: 'area:alm' } : nac && { n: `Almacén estatal de ${D.nombre}`, st: nac.outH ? 'crit' : 'ok', det: `${fmtV(nac.abasto, 'pct1')} de demanda atendida`, go: 'area:dnac' },
    h && { n: 'Distribución estatal', st: urg.st, det: `${fmtV(urg.v, 'pct')} de urgencias fuera de plazo en el estado`, go: 'area:dest' },
  ].filter(Boolean);
  const downs = [{ n: 'Tus pacientes', st: h ? (h.s < 0.9 ? 'crit' : h.s < 0.97 ? 'warn' : 'ok') : 'nd', det: h ? `${fmtV(h.s, 'pct')} de recetas completas` : 'sin datos de recetas fuera del piloto' }];
  const pares = R.unidades.filter(x => x.cve === u.cve).map(x => ({ id: x.i, n: x.nombre }));
  const cmp = [
    compara('Partidas vencidas', pares.map(p => ({ ...p, v: R.unidades[p.id].venc })), i, 'num'),
    h ? compara('Recetas completas (piloto)', R.unidades.filter(x => x.hgo).map(x => ({ id: x.i, n: x.nombre, v: x.hgo.s })), i, 'pct', 1) : '',
    h && h.pex ? compara('PEX en plazo (piloto)', R.unidades.filter(x => x.hgo?.pex).map(x => ({ id: x.i, n: x.nombre, v: x.hgo.pe })), i, 'pct', 1) : '',
  ].join('');
  return encabezado(R, { t: 'unit', i }, st, `<button class="tw-lnk" data-rol="del:${u.cve}">Administrador(a) delegacional de ${esc(D.nombre)}</button>`, 'su Jefatura de farmacia', `${u.tipo} · ${D.nombre} · CLUES ${u.clues}${h ? ' · piloto Hidalgo' : ''}`, nivelMax(acc))
    + `<section class="kpis tw-rtiles" style="--kc:${h ? 6 : 4}">${tiles}</section>`
    + `<div class="split tw-split"><section class="card"><div class="card-h"><h2>Lo que te toca hoy <small>con plazo según su nivel · marca lo que ya hiciste</small></h2></div>${acciones(acc, CTX)}
       ${u.m.length ? `<p class="u3d-h">Por qué la torre te señala</p><ul class="tw3-l">${u.m.map(([n, t]) => `<li class="${['', '', 'warn', 'crit'][n]}">${esc(t)}</li>`).join('')}</ul>` : ''}</section>
       <section class="card"><div class="card-h"><h2>Tu lugar en la cadena</h2></div>${relaciones(ups, downs)}<p class="u3d-h">Cómo te comparas con las unidades de ${esc(D.nombre)}</p><div class="tw-cmps">${cmp}</div></section></div>`;
}

// ---- Analista de Oficina Central
function vistaAnalista(R, a) {
  const A = R.roles.analistas[a], dels = R.roles.delegaciones.filter(d => A.dels.includes(d.cve));
  const acc = [];
  if (A.venc) acc.push({ m: { ref: `ana:${a}.venc`, meta: 0, dir: -1, fmt: 'num' }, nivel: A.esc2 ? 2 : 1, txt: `Desahoga ${n0(A.venc)} peticiones vencidas en tu bandeja de Central`, det: `La más vieja lleva ${A.oldest} días; ${n0(A.esc2)} ya están escaladas.` });
  if (A.integ) acc.push({ m: { ref: `ana:${a}.integ`, meta: 0, dir: -1, fmt: 'mxn' }, nivel: 3, txt: `Tienes ${A.integ.n === 1 ? 'un caso' : `${A.integ.n} casos`} de integridad a tu nombre que pasaron los controles`, det: `${mxn(A.integ.monto)} · ${A.integ.c.join(', ')}. Se da vista al Órgano Interno de Control.` });
  const lentas = dels.filter(d => d.venc).sort((x, y) => y.venc - x.venc);
  if (lentas.length) acc.push({ nivel: 1, txt: `Presiona a ${lentas.length === 1 ? 'la delegación' : `${lentas.length} delegaciones`} con peticiones vencidas`, det: lentas.slice(0, 4).map(d => `${d.nombre} ${n0(d.venc)}`).join(' · '), go: `del:${lentas[0].cve}` });
  const caras = dels.filter(d => d.desvCosto > 0.2);
  if (caras.length) acc.push({ nivel: 1, txt: `Revisa el costo de ${caras.length === 1 ? '1 delegación' : `${caras.length} delegaciones`} más de 20 % arriba de la propuesta`, det: caras.map(d => `${d.nombre} +${pc(d.desvCosto)}`).join(' · ') });
  const tiles = [
    tile('Peticiones en tu bandeja', n0(A.pend), A.esc2 ? 'crit' : A.venc ? 'warn' : 'ok', `${n0(A.venc)} vencidas`),
    tile('La más vieja', `${A.oldest ?? 0}<i> días</i>`, A.esc2 ? 'crit' : A.venc ? 'warn' : 'ok', 'en tu bandeja'),
    tile('Delegaciones a tu cargo', dels.length, '', dels.map(d => d.abbr).join(', ')),
    tile('Integridad a tu nombre', A.integ ? mxn(A.integ.monto) : 'Limpio', A.integ ? 'crit' : 'ok', A.integ ? (A.integ.n === 1 ? '1 caso' : `${A.integ.n} casos`) : 'sin casos que pasaran'),
  ].join('');
  const plan = R.eslabones.find(e => e.id === 'plan'), hol = plan.kpis.find(k => k.id === 'holgura');
  const ups = [{ n: 'Subdirección de Planeación de Insumos', st: plan.st, det: `5 analistas para 32 delegaciones; ${fmtV(plan.kpis.find(k => k.id === 'vencidas').v, 'pct')} del plan vencido`, go: 'area:plan' }, ...dels.map(d => ({ n: d.nombre, st: d.sem, det: `${n0(d.venc)} vencidas en su bandeja · ${d.uSinFin} unidades sin concluir`, go: `del:${d.cve}` }))];
  const downs = [{ n: 'Compra consolidada', st: hol.st, det: `el plan cierra con ${fmtV(hol.v, hol.fmt)} de holgura; si se atrasa, se atrasa la licitación`, go: 'area:compra' }];
  const pares = R.roles.analistas.map(x => ({ id: x.a, n: x.nombre }));
  const cmp = [
    compara('Peticiones vencidas', pares.map(p => ({ ...p, v: R.roles.analistas[p.id].venc })), a, 'num'),
    compara('Días de la más vieja', pares.map(p => ({ ...p, v: R.roles.analistas[p.id].oldest || 0 })), a, 'num'),
    compara('Integridad a su nombre', pares.map(p => ({ ...p, v: R.roles.analistas[p.id].integ?.monto || 0 })), a, 'mxn'),
  ].join('');
  const fil = [...dels].sort((x, y) => y.venc - x.venc).map(d => ({ go: `del:${d.cve}`, st: d.sem, c: [`<b>${esc(d.nombre)}</b>`, stDot(d.sem), n0(d.venc), `${d.uSinFin}`, `+${pc(d.desvCosto)}`, esc(d.motivos[0] || '—')] }));
  return encabezado(R, { t: 'ana', a }, A.sem, '<button class="tw-lnk" data-rol="area:plan">Subdirección de Planeación de Insumos</button>', `${dels.length} administradores delegacionales`, `Revisa en Central las peticiones de ${dels.map(d => d.nombre).join(', ')}`, nivelMax(acc))
    + `<section class="kpis tw-rtiles" style="--kc:4">${tiles}</section>`
    + `<div class="split tw-split"><section class="card"><div class="card-h"><h2>Lo que te toca hoy <small>con plazo según su nivel · marca lo que ya hiciste</small></h2></div>${acciones(acc, CTX)}</section>
       <section class="card"><div class="card-h"><h2>Tu lugar en la cadena</h2></div>${relaciones(ups, downs)}<p class="u3d-h">Cómo te comparas con los otros analistas</p><div class="tw-cmps">${cmp}</div></section></div>`
    + gente('Tus delegaciones', [{ h: 'Delegación' }, { h: 'Estado' }, { h: 'Vencidas', n: 1 }, { h: 'Unidades sin concluir', n: 1 }, { h: 'Costo vs propuesta', n: 1 }, { h: 'Motivo principal' }], fil);
}

// ---- Dueño de un eslabón
function vistaArea(R, id) {
  const e = R.eslabones.find(x => x.id === id), mine = R.llamadas.filter(l => l.eslabon === id);
  const acc = mine.map(l => ({ m: { ref: `kpi:${id}.${l.kpi}`, meta: l.meta, dir: l.dir, fmt: l.fmt }, quien: l.quien, nivel: l.nivel, txt: `${l.kn}: ${fmtV(l.v, l.fmt)} (meta ${l.dir > 0 ? '≥' : '≤'} ${fmtV(l.meta, l.fmt)})`, det: [l.culpa ? `${Math.round((1 - l.f) * 100)} % se explica por ${l.culpaK} (${l.culpa}).` : '', l.of.length ? `Empieza por: ${l.of.map(o => o.quien).join(' · ')}.` : ''].filter(Boolean).join(' ') }));
  for (const k of e.kpis) if (k.culpa) { const up = ESLABONES.find(x => x.id === k.culpa); acc.push({ arriba: true, nivel: 1, txt: `Parte de "${k.n}" viene de ${up.n}`, det: `${Math.round((1 - k.f) * 100)} % de esa brecha se explica por ${k.culpaK}.`, a: `a ${up.dueno}`, go: `area:${up.id}` }); }
  const tiles = e.kpis.map(k => tile(k.n, fmtV(k.v, k.fmt), k.info ? '' : k.st, k.info ? 'informativo' : `meta ${k.dir > 0 ? '≥' : '≤'} ${fmtV(k.meta, k.fmt)}`)).join('');
  const ref = s => s.split('?')[0].split('.')[0];
  const abajoIds = new Set(Object.entries(DEP).filter(([, v]) => v.some(x => ref(x) === id)).map(([k]) => ref(k)));
  const ups = e.up.map(u => R.eslabones.find(x => x.id === u)).map(u => ({ n: u.n, st: u.st, det: u.dueno, go: `area:${u.id}` }));
  const downs = [...abajoIds].filter(x => x !== id).map(x => R.eslabones.find(y => y.id === x)).map(d => ({ n: d.n, st: d.st, det: e.resp.de[d.id] ? `le explicas ${(e.resp.de[d.id]).toFixed(2)} puntos de brecha` : 'depende de tus indicadores', go: `area:${d.id}` }));
  if (id === 'frio') downs.push({ n: 'Pacientes que reciben vacunas, insulinas y biológicos', st: e.st, det: 'lo dañado sin detectar se aplica', go: 'area:unidad' }, ...R.matriz.rows.filter(x => x.c.frio.st === 'crit').slice(0, 3).map(x => ({ n: `Delegación ${x.nombre}`, st: 'crit', det: `${x.c.frio.v} dañado sin detectar`, go: `del:${x.cve}` })));
  if (id === 'integ') downs.push({ n: 'Compra consolidada', st: R.eslabones.find(x => x.id === 'compra').st, det: 'lo que pasa los controles se compra y se paga', go: 'area:compra' }, ...R.roles.analistas.filter(a => a.integ).map(a => ({ n: a.nombre, st: 'crit', det: `${mxn(a.integ.monto)} a su nombre`, go: `ana:${a.a}` })));
  if (id === 'plan') downs.push(...R.roles.analistas.map(a => ({ n: a.nombre, st: a.sem, det: `${n0(a.venc)} vencidas`, go: `ana:${a.a}` })));
  const pares = R.eslabones.map(x => ({ id: x.id, n: x.n, v: x.share }));
  const cmp = compara('Parte de la culpa', pares, id, 'pct');
  const of = [];
  for (const k of e.kpis) for (const o of k.of) of.push({ st: ['', 'warn', 'crit', 'crit'][o.nivel || 1] || 'warn', go: rolDeNombre(R, o.quien), c: [`<b>${esc(o.quien)}</b>`, esc(o.txt), esc(k.n)] });
  return encabezado(R, { t: 'area', id }, e.st, '<button class="tw-lnk" data-rol="jefe">Jefe de jefes</button> (dirección general)', esc(SUPERVISA[id]), `${e.alcance} · ${e.nCrit} indicadores en rojo y ${e.nWarn} en ámbar`, nivelMax(acc))
    + `<section class="kpis tw-rtiles" style="--kc:${Math.min(5, e.kpis.length)}">${tiles}</section>`
    + `<div class="split tw-split"><section class="card"><div class="card-h"><h2>Lo que te toca hoy <small>con plazo según su nivel · marca lo que ya hiciste</small></h2></div>${acciones(acc, CTX)}</section>
       <section class="card"><div class="card-h"><h2>Tu lugar en la cadena</h2></div>${relaciones(ups, downs)}<p class="u3d-h">Cómo te comparas con los otros 9 eslabones</p><div class="tw-cmps">${cmp}</div></section></div>`
    + gente('Lo que hay detrás de tus indicadores', [{ h: 'Quién o qué' }, { h: 'Por qué' }, { h: 'Indicador' }], of);
}
// "Director(a) de X" → unidad, "Administrador(a) delegacional de X" → delegación, analista, contrato
export function rolDeNombre(R, q) {
  let m = q.match(/^Analista (\d) de Oficina Central/); if (m) return `ana:${+m[1] - 1}`;
  m = q.match(/^Administrador\(a\) delegacional de (.+)$/); if (m) { const d = R.roles.delegaciones.find(x => x.nombre === m[1]); if (d) return `del:${d.cve}`; }
  m = q.match(/^Director\(a\) de (.+)$/); if (m) { const u = R.unidades.find(x => x.nombre === m[1]); if (u) return `unit:${u.i}`; }
  m = q.match(/contrato (C\d)/); if (m) return `k:${m[1]}`;
  return null;
}

// ---- Administrador(a) de contrato
function vistaContrato(R, id) {
  const K = R.roles.contratos.find(c => c.id === id);
  const sem = { VERDE: 'ok', AMARILLO: 'warn', NARANJA: 'crit', ROJO: 'crit' }[K.sem] || 'ok';
  const acc = [];
  if (K.otif != null && K.otif < 0.93) acc.push({ m: { ref: `k:${id}.otif`, meta: 0.93, dir: 1, fmt: 'pct' }, nivel: K.otif < 0.6 ? 2 : 1, txt: `Exige al ${K.prov} las entregas atrasadas: OTIF ${fmtV(K.otif, 'pct')}`, det: `Atraso promedio de ${(K.atraso || 0).toFixed(1)} días; ${fmtV(K.cump, 'pct')} de las piezas llegaron a tiempo.` });
  if (K.penas - K.cobradas > 1000) acc.push({ m: { ref: `k:${id}.pendPenas`, meta: 1000, dir: -1, fmt: 'mxn' }, nivel: 1, txt: `Cobra ${mxn(K.penas - K.cobradas)} de penas convencionales devengadas que faltan`, det: `Devengadas ${mxn(K.penas)} · cobradas ${mxn(K.cobradas)} en 90 días.` });
  if (K.rech > 0.05) acc.push({ m: { ref: `k:${id}.rech`, meta: 0.02, dir: -1, fmt: 'pct' }, nivel: 1, txt: `Pide al proveedor un plan de calidad: ${fmtV(K.rech, 'pct')} de entregas rechazadas` });
  if (K.sem === 'ROJO') acc.push({ m: { ref: `k:${id}.sem`, meta: 1, dir: -1, fmt: 'num' }, nivel: 3, txt: 'Inicia el procedimiento de rescisión del contrato', det: 'Las penas acumuladas alcanzan el tope de la garantía.' });
  else if (K.sem === 'NARANJA') acc.push({ m: { ref: `k:${id}.sem`, meta: 1, dir: -1, fmt: 'num' }, nivel: 2, txt: 'Notifica al proveedor por escrito: el contrato va camino a la rescisión' });
  const pago = R.eslabones.find(e => e.id === 'prov').kpis.find(k => k.id === 'pago');
  if (pago.st !== 'ok') acc.push({ arriba: true, nivel: 1, txt: `Solo ${fmtV(pago.v, 'pct')} de las facturas se pagan a tiempo`, det: 'Si se le paga tarde, el proveedor surte primero a otros clientes.', a: 'a la Subdirección de Finanzas' });
  const tiles = [
    tile('Entregas a tiempo y completas', fmtV(K.otif, 'pct'), K.otif < 0.88 ? 'crit' : K.otif < 0.93 ? 'warn' : 'ok', 'meta ≥ 93 %'),
    tile('Piezas a tiempo', fmtV(K.cump, 'pct'), K.cump < 0.85 ? 'crit' : K.cump < 0.95 ? 'warn' : 'ok', 'meta ≥ 95 %'),
    tile('Rechazos', fmtV(K.rech, 'pct'), K.rech > 0.05 ? 'crit' : K.rech > 0.02 ? 'warn' : 'ok', 'meta ≤ 2 %'),
    tile('Penas devengadas', mxn(K.penas), K.penas ? 'warn' : 'ok', `cobradas ${mxn(K.cobradas)}`),
    tile('Semáforo del contrato', esc(K.sem?.toLowerCase() || '—'), sem, esc(K.estado?.toLowerCase() || '')),
  ].join('');
  const alm = R.eslabones.find(e => e.id === 'alm').kpis.find(k => k.id === 'fill'), mg = R.eslabones.find(e => e.id === 'compra').kpis.find(k => k.id === 'margen');
  const ups = [{ n: K.prov, st: sem, det: K.objeto }, { n: 'Compra consolidada', st: mg.st, det: `firma ${fmtV(mg.v, mg.fmt)} antes del 1 de enero`, go: 'area:compra' }, { n: 'Subdirección de Finanzas', st: pago.st, det: `${fmtV(pago.v, 'pct')} de facturas pagadas a tiempo` }];
  const downs = [{ n: 'Almacén estatal de Hidalgo', st: alm.st, det: `surtido completo a unidades ${fmtV(alm.v, 'pct')}`, go: 'area:alm' }];
  const pares = R.roles.contratos.map(c => ({ id: c.id, n: `${c.id} · ${c.prov}`, v: c.otif ?? 0 }));
  const cmp = compara('Entregas a tiempo y completas', pares, id, 'pct', 1) + compara('Penas devengadas', R.roles.contratos.map(c => ({ id: c.id, n: c.id, v: c.penas })), id, 'mxn');
  return encabezado(R, { t: 'k', id }, sem, '<button class="tw-lnk" data-rol="area:prov">Administración de contratos</button>', `el ${esc(K.prov)} (a través del contrato)`, `${K.objeto} · piloto Hidalgo · 90 días`, nivelMax(acc))
    + `<section class="kpis tw-rtiles" style="--kc:5">${tiles}</section>`
    + `<div class="split tw-split"><section class="card"><div class="card-h"><h2>Lo que te toca hoy <small>con plazo según su nivel · marca lo que ya hiciste</small></h2></div>${acciones(acc, CTX)}</section>
       <section class="card"><div class="card-h"><h2>Tu lugar en la cadena</h2></div>${relaciones(ups, downs)}<p class="u3d-h">Cómo te comparas con los otros 7 contratos</p><div class="tw-cmps">${cmp}</div></section></div>`;
}

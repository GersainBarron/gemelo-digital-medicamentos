// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  compras.js · Ventana de la compra consolidada (compras.html)
//  Lee el plan de Planeación (bitácora en este navegador o el plan de
//  ejemplo), suma la demanda 2027 por clave y corre compra-sim.js.
// =====================================================================
import * as E from './plan-engine.js';
import * as C from './compra-sim.js';

const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('es-MX');
const n0 = x => nf.format(Math.round(x || 0));
const f1 = x => (x || 0).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (x, d = 0) => `${((x || 0) * 100).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
const money = x => (Math.abs(x) >= 1e9 ? `$${f1(x / 1e9)} mil M` : Math.abs(x) >= 1e6 ? `$${f1(x / 1e6)} M` : `$${n0(x)}`);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = (t, y = true) => { const d = new Date(t); return `${d.getUTCDate()} ${MES[d.getUTCMonth()]}${y ? ` ${d.getUTCFullYear()}` : ''}`; };
const ST = { adjudicada: ['Adjudicada', 'ok'], patente: ['Patente o fuente única', 'info'], parcial: ['Parcial', 'warn'], 'completada en 2a vuelta': ['Completada en 2a vuelta', 'warn'], 'segunda vuelta': ['Desierta, salvada en 2a vuelta', 'warn'], 'sin contrato': ['Sin contrato', 'crit'] };
const VEN = { V: 'Vital', E: 'Esencial', N: 'No esencial' };

const S = { esc: 'base', over: {}, seed: 1, puente: 60, filtro: 'todas', sort: { k: 'diasSin', dir: -1 } };
let U, claves, demanda, plan, R;

async function init() {
  const [iss, meds] = await Promise.all(['assets/estados_issste.json', 'assets/medicamentos.json'].map(u => fetch(u).then(r => r.json())));
  U = E.buildUniverse(iss, meds);
  let entries = null;
  try { const v = localStorage.getItem('planeacion.bitacora.v1'); if (v) entries = JSON.parse(v); } catch { /* sin almacenamiento */ }
  const plans = E.replay(U, entries || E.seedEntries());
  plan = plans.find(p => p.items.size && p.status !== 'cancelado') || plans[0];
  demanda = {};
  for (const it of plan.items.values()) if (it.months && it.st.oc !== 'rechazado') demanda[it.k] = (demanda[it.k] || 0) + E.total(it);
  claves = U.claves;
  const Qt = Object.values(demanda).reduce((a, b) => a + b, 0);
  $('#demanda').innerHTML = `Demanda: <a href="planeacion.html#/p/${plan.id}" style="color:var(--accent)">${esc(plan.nombre)}</a> (${plan.id}, ${esc(E.PLAN_ST[plan.status])}, día hábil ${plan.day} de la aprobación) de Planeación: ${f1(Qt / 1e6)} M piezas para 2027 en ${Object.keys(demanda).length} claves. Si avanzas la aprobación en Planeación, aquí cambia la demanda.`;
  bind();
  $('#loading').remove();
  run();
}

function cfg() { return { ...C.ESCENARIOS[S.esc], ...S.over }; }
function run() {
  R = C.simular(claves, demanda, { esc: S.esc, over: S.over, seed: S.seed, puente: S.puente });
  paintControls(); kpis(); embudo(); calendario(); causas(); proveedores(); tabla(); comparar(); defs();
}

// ------------------------------------------------------------ controles
function bind() {
  $('#esc').innerHTML = Object.entries(C.ESCENARIOS).map(([k, e]) => `<button data-v="${k}">${esc(e.n)}</button>`).join('');
  $('#esc').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.esc = b.dataset.v; S.over = {}; run(); });
  const lever = (id, key, conv = v => v) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.over[key] = conv(b.dataset.v); run(); });
  lever('#conv', 'conv'); lever('#fuentes', 'fuentes', Number); lever('#desc', 'descuentos', v => v === '1'); lever('#err', 'pErrTec', Number); lever('#seg2', 'segunda');
  $('#puente').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.puente = +b.dataset.v; run(); });
  $('#seed').addEventListener('click', () => { S.seed++; run(); });
  $('#filtro').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.filtro = b.dataset.v; tabla(); });
  $('#csv').addEventListener('click', csv);
}
function paintControls() {
  const E2 = cfg(), mod = Object.keys(S.over).length;
  const act = (id, v) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === String(v)));
  act('#esc', S.esc); act('#conv', E2.conv); act('#fuentes', E2.fuentes); act('#desc', E2.descuentos ? '1' : '0'); act('#err', E2.pErrTec); act('#seg2', E2.segunda); act('#puente', S.puente);
  $('#esc-desc').textContent = `${C.ESCENARIOS[S.esc].desc}${mod ? ' Con tus cambios.' : ''} Corrida ${S.seed}.`;
}

// ------------------------------------------------------------ indicadores
function kpis() {
  const k = R.kpi;
  const c = (n, v, s, sem) => `<div class="kpi ${sem || ''}"><span>${n}</span><b>${v}</b><small><i class="dot"></i>${s}</small></div>`;
  const ahorro = k.costoRef ? 1 - k.costo / k.costoRef : 0;
  $('#kpis').innerHTML = [
    c('Claves adjudicadas en el fallo', `${k.adjudicadas1} de ${k.licitadas}`, `${pct(k.adjudicadas1 / k.licitadas)} de las licitadas · ${k.patente} por patente`, k.adjudicadas1 / k.licitadas >= 0.9 ? 'ok' : k.adjudicadas1 / k.licitadas >= 0.75 ? 'warn' : 'crit'),
    c('Piezas con contrato', pct(k.cobertura, 1), `${k.sinContrato} claves sin contrato tras la segunda vuelta`, k.cobertura >= 0.97 ? 'ok' : k.cobertura >= 0.9 ? 'warn' : 'crit'),
    c('Vitales sin cubrir', n0(k.vitalesSin), k.vitalesSin ? 'claves VEN vitales con menos de 95 % contratado' : 'todas las vitales cubiertas', k.vitalesSin ? 'crit' : 'ok'),
    c('Margen antes del 1 de enero', k.margen >= 0 ? `${k.margen} días` : `${-k.margen} días tarde`, `fallo ${fecha(k.fallo)} · contratos firmados ${fecha(k.firma)}`, k.margen >= 60 ? 'ok' : k.margen >= 0 ? 'warn' : 'crit'),
    c('Claves con riesgo de desabasto', n0(k.clavesRiesgo), `30 días o más sin medicamento en 2027 · ${k.piezasRiesgo >= 1e6 ? `${f1(k.piezasRiesgo / 1e6)} M` : `${n0(k.piezasRiesgo / 1e3)} mil`} piezas`, k.clavesRiesgo > 10 ? 'crit' : k.clavesRiesgo ? 'warn' : 'ok'),
    c('Precio contra referencia', `${ahorro >= 0 ? '−' : '+'}${pct(Math.abs(ahorro), 1)}`, `${money(k.costo)} contratado · ${money(k.emergencia)} en compras de emergencia`, ahorro >= 0.05 ? 'ok' : ahorro >= 0 ? 'warn' : 'crit'),
    c('Claves con una sola fuente', `${k.unica} de ${k.unica + k.multi}`, `${k.labs} laboratorios · ${pct(k.nacional)} del monto a nacionales`, k.unica / Math.max(1, k.unica + k.multi) > 0.6 ? 'warn' : 'ok'),
  ].join('');
}

// ------------------------------------------------------------ embudo de piezas
function embudo() {
  const e = R.embudo, Q = e[0].q || 1;
  $('#embudo').innerHTML = e.map((s, i) => {
    const drop = i ? e[i - 1].q - s.q : 0;
    return `<div class="cp-step"><span>${esc(s.n)}</span><div class="cp-bar"><i style="width:${(100 * s.q / Q).toFixed(1)}%;${i === e.length - 1 ? 'background:var(--accent)' : ''}"></i></div><b>${f1(s.q / 1e6)} M<small>${pct(s.q / Q)}</small></b>${drop > Q * 0.002 ? `<em>−${f1(drop / 1e6)} M</em>` : drop < -Q * 0.002 ? `<em class="up">+${f1(-drop / 1e6)} M</em>` : '<em></em>'}</div>`;
  }).join('');
  const k = R.kpi;
  $('#embudo-note').textContent = `${k.patente} claves de patente o fuente única se adjudican directo y cuentan como ofertadas, solventes y con precio aceptable. La segunda vuelta recupera parte de lo desierto, más cara.`;
}

// ------------------------------------------------------------ calendario
function calendario() {
  const D = R.dates, k = R.kpi;
  const ent = R.rows.map(x => x.primeraEntrega).filter(Boolean), ent2 = R.rows.map(x => x.entrega2).filter(Boolean);
  const t0 = D.conv - 10 * 864e5, t1 = Math.max(D.ini + 150 * 864e5, ...ent, ...ent2);
  const W = 680, pl = 168, pr = 16, rh = 26, rows = [
    { n: 'Convocatoria a apertura', a: D.conv, b: D.apertura },
    { n: 'Patente y fuente única', m: D.patente },
    { n: 'Evaluación (cumple o no)', a: D.apertura, b: D.evalFin },
    ...(cfg().descuentos ? [{ n: 'Ofertas de descuento', a: D.evalFin, b: D.descFin }] : []),
    { n: 'Fallo', m: D.fallo, accent: true },
    { n: 'Firma de contratos', a: D.fallo, b: D.firma },
    { n: 'Segunda vuelta (desiertas)', a: D.fallo, b: D.seg2, warn: true },
    { n: 'Primeras entregas', a: Math.min(...ent), b: Math.max(...ent) },
    ...(ent2.length ? [{ n: 'Entregas de la 2a vuelta', a: Math.min(...ent2), b: Math.max(...ent2), warn: true }] : []),
  ];
  const H = 36 + rows.length * rh + 30;
  const X = t => pl + (W - pl - pr) * (t - t0) / (t1 - t0);
  let g = '';
  // meses
  const d0 = new Date(t0); let m = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1);
  while (m < t1) { const d = new Date(m); g += `<line x1="${X(m)}" x2="${X(m)}" y1="28" y2="${H - 24}" stroke="rgba(148,163,184,.10)"/><text x="${X(m) + 2}" y="${H - 8}" fill="#5b6773" font-size="10">${MES[d.getUTCMonth()]}</text>`; m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  g += `<line x1="${X(D.ini)}" x2="${X(D.ini)}" y1="18" y2="${H - 24}" stroke="#e6edf3" stroke-width="1.5"/><text x="${X(D.ini) - 4}" y="16" fill="#e6edf3" font-size="11" font-weight="600" text-anchor="end">1 ene: arranca el contrato</text>`;
  const pz = D.ini + R.puente * 864e5;
  g += `<line x1="${X(pz)}" x2="${X(pz)}" y1="26" y2="${H - 24}" stroke="#f87171" stroke-dasharray="4 4"/><text x="${X(pz) - 4}" y="30" fill="#f87171" font-size="10.5" text-anchor="end">se acaba el inventario puente</text>`;
  rows.forEach((r, i) => {
    const y = 40 + i * rh;
    g += `<text x="10" y="${y + 4}" fill="#cbd5e1" font-size="12">${r.n}</text>`;
    const col = r.accent ? '#2dd4bf' : r.warn ? '#fbbf24' : '#94a3b8';
    if (r.m != null) g += `<path d="M${X(r.m)} ${y - 7}l7 7l-7 7l-7 -7z" fill="${col}"><title>${r.n}: ${fecha(r.m)}</title></path><text x="${X(r.m) + 11}" y="${y + 4}" fill="${col}" font-size="11">${fecha(r.m, false)}</text>`;
    else { const a = X(r.a), b = Math.max(X(r.b), a + 3); g += `<rect x="${a}" y="${y - 6}" width="${b - a}" height="12" rx="6" fill="${col}" opacity=".75"><title>${r.n}: ${fecha(r.a)} a ${fecha(r.b)}</title></rect><text x="${b + 6}" y="${y + 4}" fill="#8b98a5" font-size="10.5">${fecha(r.b, false)}</text>`; }
  });
  $('#cal').innerHTML = `<div class="cp-scroll"><svg viewBox="0 0 ${W} ${H}" style="min-width:600px" role="img" aria-label="Calendario del procedimiento">${g}</svg></div>`;
  $('#cal-sub').textContent = `fallo ${fecha(D.fallo)} · ${k.margen >= 0 ? `${k.margen} días de margen` : `${-k.margen} días tarde`}`;
  const tarde = R.rows.filter(x => x.primeraEntrega && x.primeraEntrega > pz).length;
  $('#cal-note').textContent = `Cada proveedor necesita de 4 a 12 semanas para fabricar después de firmar. ${tarde ? `${tarde} claves adjudicadas en el fallo llegan después de que se acaba el inventario puente.` : 'Todas las claves adjudicadas en el fallo llegan antes de que se acabe el inventario puente.'}`;
}

// ------------------------------------------------------------ causas de desiertas
function causas() {
  const k = R.kpi, max = Math.max(1, ...k.causas.map(c => c.n));
  const txt = { 'sin oferta': 'Nadie ofertó: no hay quien fabrique o registre la presentación', 'técnica': 'Ninguna propuesta cumple la documentación técnica', 'precio no aceptable': 'Las ofertas pasan 10 % la media del mercado o el presupuesto', 'precio no conveniente': 'Las ofertas quedan 40 % abajo de la media (no creíbles)', capacidad: 'Adjudicada, pero los ganadores no alcanzan a cubrir toda la demanda' };
  $('#causas').innerHTML = k.causas.map(c => `<div class="cp-step cp-causa"><span>${esc(c.k[0].toUpperCase() + c.k.slice(1))}<small>${esc(txt[c.k])}</small></span><div class="cp-bar"><i style="width:${(100 * c.n / max).toFixed(1)}%;background:${c.k === 'capacidad' ? '#fbbf24' : '#f87171'}"></i></div><b>${c.n}</b></div>`).join('')
    + `<p class="note">${k.fallas ? `Además, en 2027 ${k.fallas} proveedores incumplen y se rescinden: con varias fuentes los demás cubren; con una sola, se espera 45 días al segundo lugar o 90 a un procedimiento nuevo.` : 'Ningún proveedor incumple en 2027 en esta corrida.'}</p>`;
}

// ------------------------------------------------------------ proveedores
function proveedores() {
  const k = R.kpi, tot = R.labs.reduce((s, l) => s + l.monto, 0) || 1;
  const nivel = k.hhi < 1500 ? 'baja' : k.hhi < 2500 ? 'moderada' : 'alta';
  $('#prov-sub').textContent = `${k.labs} laboratorios · concentración ${nivel} (HHI ${n0(k.hhi)})`;
  $('#prov').innerHTML = `<table class="cp-prov"><thead><tr><th>Laboratorio</th><th>Origen</th><th class="n">Claves</th><th class="n">Como única fuente</th><th class="n">Monto</th><th class="n">Del total</th></tr></thead><tbody>${R.labs.slice(0, 12).map(l => `<tr><td>${C.labName(l.lab)}</td><td>${C.labNacional(l.lab) ? 'Nacional' : 'Extranjero'}</td><td class="n">${l.claves}</td><td class="n">${l.unica}</td><td class="n">${money(l.monto)}</td><td class="n">${pct(l.monto / tot, 1)}</td></tr>`).join('')}</tbody></table><p class="note">Laboratorios simulados (no son empresas reales). Se muestran los 12 de mayor monto.</p>`;
}

// ------------------------------------------------------------ tabla por clave
const COLS = [
  { k: 'clave', h: 'Clave', v: x => x.clave, f: x => `<span class="mono">${x.clave}</span>` },
  { k: 'nombre', h: 'Insumo', v: x => x.nombre, f: x => `${esc(x.nombre)}${x.frio ? ' <span class="st-tag st-frio">2–8 °C</span>' : ''}` },
  { k: 'ven', h: 'VEN', v: x => x.ven, f: x => `<span class="st-tag ${x.ven === 'V' ? 'st-baja' : x.ven === 'E' ? 'st-calor' : 'st-ok'}">${VEN[x.ven]}</span>` },
  { k: 'Q', h: 'Piezas 2027', n: 1, v: x => x.Q, f: x => n0(x.Q) },
  { k: 'ofertas', h: 'Ofertas', n: 1, v: x => x.ofertas, f: x => (x.tipo === 'patente' ? 'Patente' : !x.ofertas ? 'Ninguna' : `${x.ofertas} · ${x.solventes} solventes · ${x.aceptables} aceptables`) },
  { k: 'estado', h: 'Resultado', v: x => x.estado, f: x => `<span class="cp-st ${ST[x.estado][1]}">${ST[x.estado][0]}</span>${x.causa ? `<small class="muted" style="display:block">${esc(x.causa)}</small>` : ''}` },
  { k: 'fuentes', h: 'Fuentes', n: 1, v: x => x.ganadores.length, f: x => (x.ganadores.length ? x.ganadores.map(g => `${Math.round(100 * g.q / x.Q)} %${g.vuelta === 2 ? '*' : ''}`).join(' · ') : '—') },
  { k: 'precio', h: 'Precio vs ref.', n: 1, v: x => (x.ganadores.length ? x.ganadores.reduce((s, g) => s + g.q * g.precio, 0) / x.ganadores.reduce((s, g) => s + g.q, 0) / x.ref - 1 : 99), f: x => { if (!x.ganadores.length) return '—'; const v = x.ganadores.reduce((s, g) => s + g.q * g.precio, 0) / x.ganadores.reduce((s, g) => s + g.q, 0) / x.ref - 1; return `<span style="color:${v > 0.02 ? 'var(--warn)' : v < -0.02 ? 'var(--ok)' : 'inherit'}">${v >= 0 ? '+' : '−'}${pct(Math.abs(v))}</span>`; } },
  { k: 'cobertura', h: 'Contratado', n: 1, v: x => x.cobertura, f: x => pct(x.cobertura) },
  { k: 'entrega', h: 'Primera entrega', n: 1, v: x => x.primeraEntrega || x.entrega2 || 9e15, f: x => (x.primeraEntrega ? fecha(x.primeraEntrega, false) : x.entrega2 ? `${fecha(x.entrega2, false)}*` : '—') },
  { k: 'diasSin', h: 'Días sin medicamento', n: 1, v: x => x.diasSin, f: x => `<span style="color:${x.diasSin >= 30 ? 'var(--crit)' : x.diasSin > 0 ? 'var(--warn)' : 'var(--ok)'};font-weight:650">${n0(x.diasSin)}</span>${x.falla ? `<small class="muted" style="display:block">incumple ${C.labName(x.falla.lab)} en ${MES[x.falla.mes]}</small>` : ''}` },
];
function filas() {
  const f = S.filtro;
  return R.rows.filter(x => f === 'todas' || (f === 'riesgo' && x.diasSin >= 30) || (f === 'desiertas' && x.tipo !== 'patente' && !x.ganadores.some(g => g.vuelta !== 2)) || (f === 'vitales' && x.ven === 'V'));
}
function tabla() {
  $('#filtro').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === S.filtro));
  const col = COLS.find(c => c.k === S.sort.k) || COLS.at(-1);
  const rows = filas().sort((a, b) => { const va = col.v(a), vb = col.v(b); return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es')) * S.sort.dir; });
  $('#tabla').innerHTML = `<table class="cp-tbl"><thead><tr>${COLS.map(c => `<th class="${c.n ? 'n' : ''}" data-k="${c.k}" style="cursor:pointer">${c.h}${S.sort.k === c.k ? (S.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(x => `<tr>${COLS.map(c => `<td class="${c.n ? 'n' : ''}">${c.f(x)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="empty">Ninguna clave en este filtro.</td></tr>`}</tbody></table><p class="note">* contratado en la segunda vuelta. Fuentes: reparto de la demanda entre proveedores (abastecimiento simultáneo).</p>`;
  $('#tabla').querySelectorAll('th[data-k]').forEach(th => th.addEventListener('click', () => { const k = th.dataset.k; S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : (COLS.find(c => c.k === k).n ? -1 : 1) }; tabla(); }));
}
function csv() {
  const rows = [['Clave', 'Insumo', 'VEN', 'Piezas 2027', 'Tipo', 'Ofertas', 'Solventes', 'Aceptables', 'Resultado', 'Causa', 'Fuentes', 'Contratado', 'Primera entrega', 'Dias sin medicamento', 'Costo'],
    ...R.rows.map(x => [x.clave, x.nombre, VEN[x.ven], x.Q, x.tipo, x.ofertas, x.solventes, x.aceptables, x.estado, x.causa || '', x.ganadores.length, x.cobertura.toFixed(3), x.primeraEntrega ? C.iso(x.primeraEntrega) : '', Math.round(x.diasSin), Math.round(x.costo)])];
  const s = '﻿' + rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv;charset=utf-8' })); a.download = `compra_consolidada_${S.esc}_${S.seed}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------ comparación de estrategias
function comparar() {
  const rows = C.comparar(claves, demanda, { seed: S.seed, puente: S.puente });
  const best = k => Math.min(...rows.map(r => r[k]));
  $('#comp').innerHTML = `<table><thead><tr><th>Estrategia</th><th>Fallo</th><th class="n">Margen al 1 ene</th><th class="n">Adjudicadas en el fallo</th><th class="n">Sin contrato</th><th class="n">Vitales sin cubrir</th><th class="n">Piezas con contrato</th><th class="n">Costo contratado</th><th class="n">Compras de emergencia</th><th class="n">Claves con riesgo</th><th class="n">Días-clave sin medicamento</th></tr></thead><tbody>${rows.map(r => `<tr data-esc="${r.esc}" class="${r.esc === S.esc && !Object.keys(S.over).length ? 'sel' : ''}" style="cursor:pointer"><td><b>${esc(r.n)}</b></td><td>${fecha(r.fallo)}</td><td class="n" style="color:${r.margen < 0 ? 'var(--crit)' : 'inherit'}">${r.margen >= 0 ? `${r.margen} d` : `${-r.margen} d tarde`}</td><td class="n">${r.adjudicadas1} de ${r.licitadas}</td><td class="n">${r.sinContrato}</td><td class="n">${r.vitalesSin}</td><td class="n">${pct(r.cobertura, 1)}</td><td class="n">${money(r.costo)}</td><td class="n">${money(r.emergencia)}</td><td class="n" style="${r.clavesRiesgo === best('clavesRiesgo') ? 'color:var(--ok);font-weight:650' : ''}">${r.clavesRiesgo}</td><td class="n" style="${r.diasSin === best('diasSin') ? 'color:var(--ok);font-weight:650' : ''}">${n0(r.diasSin)}</td></tr>`).join('')}</tbody></table>
  <p class="note">Mismo plan, mismo mercado y mismos números aleatorios en las cuatro: la diferencia es solo la estrategia. Días-clave sin medicamento = suma, por clave, de los días de 2027 en que falta, ponderada por la fracción de la demanda sin cubrir.</p>`;
  $('#comp').querySelectorAll('tr[data-esc]').forEach(tr => tr.addEventListener('click', () => { S.esc = tr.dataset.esc; S.over = {}; run(); scrollTo({ top: 0, behavior: 'smooth' }); }));
}

function defs() {
  $('#defs').innerHTML = `
  <p><b>Demanda.</b> Las piezas 2027 de cada clave salen del plan anual de Planeación: la suma de lo asignado a cada unidad, con lo que hayan negociado si avanzaste la aprobación. Se simula solo la parte del ISSSTE y las 60 claves del gemelo; la compra consolidada real 2027-2028 incluyó IMSS, ISSSTE, IMSS-Bienestar y Pemex, más de 2,700 claves y más de 5,000 millones de piezas.</p>
  <p><b>Procedimiento.</b> Como la licitación LA-12-NEF-012NEF001-T-218-2026 de Birmex: convocatoria el 16 de julio, junta de aclaraciones a los 7 días, apertura a los 20, evaluación binaria (cumple o no cumple), ofertas subsecuentes de descuento, fallo y firma en 20 días hábiles. Las claves de patente y fuente única se adjudican directo y cierran antes, a principios de agosto. Vigencia de los contratos: 2027 y 2028.</p>
  <p><b>Precio.</b> Ley de Adquisiciones (DOF 16 abr 2025): precio no aceptable si pasa 10 % la media de la investigación de mercado o el presupuesto; no conveniente si queda 40 % abajo. Aquí la media es el precio de referencia de cada clave del gemelo.</p>
  <p><b>Abastecimiento simultáneo.</b> Hasta 4 fuentes si su precio no pasa 10 % el del primero, con reparto 40/25/20/15, 50/30/20 o 60/40, como en la convocatoria 2027-2028. Si un ganador no alcanza con su capacidad, los otros completan; si no alcanza nadie, queda parcial.</p>
  <p><b>Mercado (supuesto).</b> Cada clave tiene de 0 a 9 laboratorios interesados según qué tan común es; biológicos, red fría, hematología y neumología tienen más probabilidad de ser patente. Cada laboratorio tiene un costo, un margen, una capacidad y una probabilidad de error en su documentación técnica. Fabricar y entregar toma de 4 a 12 semanas tras la firma.</p>
  <p><b>Desiertas.</b> Segunda licitación con fallo 75 días después (recupera de 45 a 62 % de las claves, un poco más cara) o invitación a tres en 35 días (recupera 75 %, de 12 a 32 % más cara). Lo que siga sin contrato lo compra la unidad de emergencia: la mitad de lo que falta, 40 % más caro.</p>
  <p><b>2027.</b> Cada ganador puede incumplir y rescindirse (6 %, el doble si ofertó 25 % abajo de la referencia). Las unidades arrancan el año con el inventario puente elegido.</p>
  <p><b>Referencias reales para calibrar:</b> en 2027-2028 se adjudicaron 626 de 766 claves (82 %) en la licitación de genéricos, oncológicos y antiinfecciosos, con 102 empresas, 375 claves a un solo proveedor y 251 a dos o más; el fallo salió el 25 de septiembre de 2026, 11 días tarde. En 2025-2026 se adjudicó 39 % de las partidas y el fallo salió hasta el 13 de enero de 2025, con entregas desde febrero y marzo.
  Fuentes: <a href="https://consultorsalud.com.mx/compra-medicamentos-2027-2028-birmex/" target="_blank" rel="noopener">convocatoria 2027-2028</a> · <a href="https://codigof.mx/salud-adjudica-85-de-claves-en-compra-consolidada-de-medicamentos-para-2027-2028/" target="_blank" rel="noopener">resultado 2027-2028</a> · <a href="https://politica.expansion.mx/mexico/2026/10/04/compra-medicamentos-2027-2028-birmex" target="_blank" rel="noopener">Expansión, oct 2026</a> · <a href="https://politica.expansion.mx/mexico/2025/01/15/compra-consolidada-adjudica-39-de-los-medicamentos-temen-desabasto" target="_blank" rel="noopener">Expansión, ene 2025</a> · <a href="https://www.garrigues.com/es_ES/noticia/mexico-publicada-nueva-ley-adquisiciones-arrendamientos-servicios-sector-publico" target="_blank" rel="noopener">nueva Ley de Adquisiciones</a>.</p>`;
}

init();

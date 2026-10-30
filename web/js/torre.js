// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  torre.js · Torre de control del abasto (torre.html)
//  Pide al worker que corra todos los gemelos con un escenario y pinta:
//  estrella del norte, a quién llamar, reparto de la culpa, la cadena,
//  detalle por eslabón, personas señaladas y la matriz de 32 delegaciones.
// =====================================================================
import { ESCENARIOS, ESLABONES, NIVELES, DEP, fmtV } from './torre-engine.js';
import { ROLES, vistaRol, rolDe, rolKey, rolNombre, rolFoco, rolDeNombre, compBtn } from './torre-roles.js';
import * as SG from './torre-seguimiento.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pc = x => `${Math.round((x || 0) * 100)} %`;
const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const ST_N = { ok: 'En meta', warn: 'Fuera de meta', crit: 'Crítico', nd: 'Sin dato' };

const S = { esc: 'normal', sel: null, filtro: 'todas', cache: {}, R: null, id: 0, tab: 'tablero', rol: { t: 'jefe' }, dia: 15, segF: 'abiertos', L: SG.cargar() };
let V3 = null, V3p = null, ISS = null;
let worker = null;

function params() {
  const q = new URLSearchParams(location.search);
  if (ESCENARIOS[q.get('esc')]) S.esc = q.get('esc');
  if (q.get('e')) S.sel = q.get('e');
  if (q.get('tab') === '3d' || q.get('tab') === 'seg') S.tab = q.get('tab');
  if (+q.get('dia') > 15) S.dia = Math.min(120, +q.get('dia'));
  let rv = q.get('rol'); if (!rv) { try { rv = localStorage.getItem('torre.rol'); } catch { /* nada */ } }
  S.rol = rolDe(rv);
}
function cfg() {
  let entries = null, integ = null;
  try { const v = localStorage.getItem('planeacion.bitacora.v1'); if (v) entries = JSON.parse(v); } catch { /* sin almacenamiento */ }
  try { const v = localStorage.getItem('planeacion.integridad.v1'); if (v) integ = JSON.parse(v); } catch { /* nada */ }
  return { esc: S.esc, entries, integ, dia: S.dia };
}

// ------------------------------------------------------------------ correr
function run(force = false) {
  paintEsc();
  const ck = `${S.esc}|${S.dia}`;
  if (!force && S.cache[ck]) { S.R = S.cache[ck]; paint(); return; }
  const L = $('#loading');
  if (!document.body.contains(L)) document.body.insertAdjacentHTML('beforeend', '<div id="loading" class="loading tw-over"><div class="tw-load"><b>Corriendo los gemelos de toda la cadena…</b><div class="tw-prog"><i id="prog-bar"></i></div><span id="prog-txt">Preparando</span></div></div>');
  worker ||= new Worker(new URL('./torre-worker.js', import.meta.url), { type: 'module' });
  const id = ++S.id;
  worker.onmessage = e => {
    const m = e.data; if (m.id !== S.id) return;
    if (m.prog) { const b = $('#prog-bar'), t = $('#prog-txt'); if (b) b.style.width = `${Math.round(m.prog.p * 100)}%`; if (t) t.textContent = m.prog.txt; return; }
    if (m.err) { const t = $('#prog-txt'); if (t) t.textContent = 'No se pudo correr la torre: ' + m.err.split('\n')[0]; console.error(m.err); return; }
    S.cache[ck] = m.res; S.R = m.res; $('#loading')?.remove(); paint();
  };
  worker.postMessage({ id, cfg: cfg() });
}

function bind() {
  $('#esc').innerHTML = Object.entries(ESCENARIOS).map(([k, e]) => `<button data-v="${k}">${esc(e.n)}</button>`).join('');
  $('#esc').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.dataset.v === S.esc) return; S.esc = b.dataset.v; url(); run(); });
  $('#rerun').addEventListener('click', () => run(true));
  $('#mfiltro').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.filtro = b.dataset.v; matriz(); });
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-e]'); if (!c) return;
    S.sel = c.dataset.e; url(); cadena(); detalle();
    if (c.dataset.go) $('#detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#rol-t').innerHTML = Object.entries(ROLES).map(([k, n]) => `<button data-v="${k}">${esc(n)}</button>`).join('');
  $('#rol-t').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !S.R) return; setRol(rolPorTipo(b.dataset.v)); });
  $('#rol-sel').addEventListener('change', e => {
    const x = e.target; if (!S.R) return;
    if (x.id === 'rs-del-u') { const u = S.R.unidades.filter(u => u.cve === x.value).sort((a, b) => b.st - a.st)[0]; if (u) setRol({ t: 'unit', i: u.i }); return; }
    setRol(rolDe(x.value));
  });
  document.addEventListener('click', e => { const b = e.target.closest('[data-rol]'); if (!b || !S.R || b.closest('#rol-sel')) return; const r = rolDe(b.dataset.rol); if (b.closest('#tw3') && r.t !== 'jefe') { S.tab = 'tablero'; } setRol(r); tabs(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.addEventListener('change', e => {
    const c = e.target.closest('[data-hecho]'); if (!c) return;
    let h = {}; try { h = JSON.parse(localStorage.getItem('torre.hecho') || '{}'); } catch { /* nada */ }
    if (c.checked) h[c.dataset.hecho] = Date.now(); else delete h[c.dataset.hecho];
    try { localStorage.setItem('torre.hecho', JSON.stringify(h)); } catch { /* nada */ }
    c.closest('li')?.classList.toggle('hecho', c.checked);
  });
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-comp]');
    if (c && S.R) { SG.comprometer(S.L, S.R, JSON.parse(decodeURIComponent(c.dataset.comp))); refrescarSeg(); return; }
    const g = e.target.closest('[data-tab-go]'); if (g) { S.tab = g.dataset.tabGo; url(); tabs(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  for (const b of document.querySelectorAll('[data-dia]')) b.addEventListener('click', () => { const d = +b.dataset.dia; S.dia = d ? Math.min(120, S.dia + d) : 15; url(); run(); });
  $('#seg-f').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.segF = b.dataset.v; segUI(); });
  $('#seg-csv').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([SG.csv(S.L)], { type: 'text/csv' })); a.download = `compromisos_torre_dia${S.R?.plan.dia || ''}.csv`; a.click(); });
  $('#seg-list').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, dia = S.R.plan.dia;
    if (b.dataset.act === 'cerrar') { const n = $(`#nota-${id}`)?.value.trim(); SG.cerrar(S.L, id, n, dia); }
    if (b.dataset.act === 'reabrir') SG.reabrir(S.L, id, dia);
    if (b.dataset.act === 'borrar') { if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Toca otra vez para borrar'; return; } SG.borrar(S.L, id); }
    refrescarSeg();
  });
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.tab; url(); tabs(); });
  $('#tw3-patrol').addEventListener('click', () => { if (!V3) return; const on = !V3.patrol; V3.setPatrol(on); if (on) { V3.select(null, false); closePanel(); } patrolBtn(); });
  $('#tw3-home').addEventListener('click', () => { if (!V3) return; V3.select(null); closePanel(); });
  $('#tw3-tower').addEventListener('click', () => pick3({ type: 'tower' }));
  $('#tw3-queue').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b || !V3) return; pick3(V3.queue[+b.dataset.q]); $('#tw3').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('#matriz').addEventListener('click', e => { const tr = e.target.closest('tr[data-cve]'); if (!tr) return; tr.classList.toggle('open'); });
}
function url() { const q = new URLSearchParams(location.search); q.set('esc', S.esc); if (S.sel) q.set('e', S.sel); if (S.tab !== 'tablero') q.set('tab', S.tab); else q.delete('tab'); if (S.dia !== 15) q.set('dia', S.dia); else q.delete('dia'); if (S.rol.t !== 'jefe') q.set('rol', rolKey(S.rol)); else q.delete('rol'); history.replaceState(null, '', `${location.pathname}?${q}`); }
function paintEsc() {
  for (const b of $('#esc').children) b.classList.toggle('active', b.dataset.v === S.esc);
  $('#esc-desc').textContent = ESCENARIOS[S.esc].desc;
}

// ------------------------------------------------------------------ pintar
function paint() {
  const R = S.R;
  if (!S.sel || !R.eslabones.some(e => e.id === S.sel)) S.sel = R.reparto[0].id;
  $('#plan-note').innerHTML = `Plan de Planeación: <a href="planeacion.html#/mitablero">${esc(R.plan.nombre)}</a>, día hábil ${R.plan.dia} de la aprobación${R.plan.proyectado ? ` (tu bitácora estaba en el día ${R.plan.dia - R.plan.proyectado}; la torre lo avanzó para tener qué vigilar)` : ''}. La torre lee tu bitácora y tus controles de integridad de este navegador.`;
  SG.verificar(S.L, R);
  veredicto(); norte(); reparto(); llamadas(); cadena(); detalle(); nombres(); matriz(); textos(); rolUI(); segUI(); tabs();
  if (V3) { V3.setData(R); cola3d(); if (V3.sel) panel3d(V3.sel); }
}

// ------------------------------------------------------------------ seguimiento
function segLinea() {
  const r = SG.resumen(S.L); if (!r.n) return '';
  return `<p class="tw-v-seg"><button class="tw-lnk" data-tab-go="seg">Seguimiento</button>: ${r.abiertos} compromisos abiertos${r.escalados ? ` · <b class="crit">${r.escalados} escalamientos por no cumplir</b>` : ''} · ${r.cumplidos} cumplidos verificados · día hábil ${S.R.plan.dia}</p>`;
}
function refrescarSeg() { SG.verificar(S.L, S.R); veredicto(); llamadas(); rolUI(); segUI(); }
function segUI() {
  const R = S.R, L = S.L, r = SG.resumen(L);
  $('#seg-n').textContent = r.abiertos ? r.abiertos : '';
  $('#seg-dia').textContent = `Día hábil ${R.plan.dia}`;
  $('#seg-dia-sub').textContent = R.plan.status === 'validacion' ? `de la aprobación del plan anual (${R.plan.fin || '—'} días hábiles en total). Avanzar simula el plan; los demás gemelos siguen en su escenario.` : 'la aprobación del plan ya concluyó: el reloj ya no avanza.';
  const t = (n, v, st, sub) => `<div class="kpi ${st || ''}"><span>${esc(n)}</span><b>${v}</b><small><i class="dot"></i>${esc(sub)}</small></div>`;
  $('#seg-kpis').innerHTML = [
    t('Compromisos abiertos', r.abiertos, r.abiertos ? 'warn' : 'ok', `${r.n3} en dirección general`),
    t('Escalamientos por no cumplir', r.escalados, r.escalados ? 'crit' : 'ok', 'subieron de nivel al vencer'),
    t('Vencidos en dirección general', r.vencidos, r.vencidos ? 'crit' : 'ok', 'ya no hay a quién escalar'),
    t('Cumplidos verificados', r.cumplidos, r.cumplidos ? 'ok' : '', 'la torre confirmó la meta'),
    t('Tasa de cumplimiento', r.tasa == null ? '—' : pc(r.tasa), r.tasa == null ? '' : r.tasa >= 0.8 ? 'ok' : r.tasa >= 0.5 ? 'warn' : 'crit', `${r.cerradosSin} cerrados sin verificar`),
    t('Días hábiles para cumplir', r.diasCierre == null ? '—' : r.diasCierre.toFixed(1), '', 'promedio, de compromiso a meta'),
  ].join('');
  const F = { abiertos: c => !['cumplido', 'cerrado'].includes(c.estado), escalados: c => c.escalado > 0 || c.estado === 'vencido', cumplidos: c => c.estado === 'cumplido', cerrados: c => c.estado === 'cerrado', todos: () => true };
  for (const b of $('#seg-f').children) b.classList.toggle('active', b.dataset.v === S.segF);
  const xs = L.filter(F[S.segF]).sort((a, b) => b.nivel - a.nivel || a.vence - b.vence);
  const flecha = c => { if (c.base == null || c.actual == null || c.base === c.actual) return '→'; const mejor = c.dir > 0 ? c.actual > c.base : c.actual < c.base; return mejor ? '↗' : '↘'; };
  $('#seg-list').innerHTML = !L.length ? `<div class="tw-empty"><p>Aún no hay compromisos. Toca <b>Comprometer</b> en cualquier llamada del tablero o en "Lo que te toca hoy" de cualquier responsable.</p><button class="seg-btn on" id="seg-todo" type="button">Comprometer todas las llamadas de hoy</button></div>`
    : !xs.length ? '<p class="muted">Nada en este filtro.</p>'
    : xs.map(c => {
      const g = c.rol, ab = !['cumplido', 'cerrado'].includes(c.estado), restan = c.vence - R.plan.dia;
      return `<article class="tw-cm n${c.nivel} ${SG.EST_ST[c.estado]}">
        <header><span class="tw-niv n${c.nivel}">${esc(NIVELES[c.nivel].n)}</span><span class="chip ${SG.EST_ST[c.estado]}">${esc(SG.EST[c.estado])}</span>${c.escalado ? `<span class="tw-esc">subió ${c.escalado} ${c.escalado === 1 ? 'vez' : 'veces'}</span>` : ''}</header>
        <b class="tw-who">${g ? `<button class="tw-lnk" data-rol="${esc(g)}">${esc(c.quien)}</button>` : esc(c.quien)}</b>
        <p class="tw-cm-t">${esc(c.txt)}</p>
        <div class="tw-cm-m"><span>Al comprometerse <b>${fmtV(c.base, c.fmt)}</b></span><span class="tw-cm-arr">${flecha(c)}</span><span>Hoy <b class="${SG.EST_ST[c.estado]}">${fmtV(c.actual, c.fmt)}</b></span><span>Meta <b>${c.dir > 0 ? '≥' : '≤'} ${fmtV(c.meta, c.fmt)}</b></span></div>
        <p class="tw-cm-d">Desde el día hábil ${c.creado} · ${ab ? (c.estado === 'vencido' ? 'venció en dirección general' : restan > 0 ? `vence en ${restan} ${restan === 1 ? 'día hábil' : 'días hábiles'} (día ${c.vence})` : `vence hoy (día ${c.vence})`) : `cerrado el día ${c.cerradoDia}`} · escenario al comprometerse: ${esc(ESCENARIOS[c.esc0]?.n || c.esc0)}</p>
        <details><summary>Historial (${c.hist.length})</summary><ol class="tw-hist">${c.hist.map(h => `<li><span>día ${h.dia}</span>${esc(h.txt)}</li>`).join('')}</ol></details>
        <div class="tw-cm-b">${ab ? `<input id="nota-${c.id}" type="text" placeholder="Nota o evidencia (opcional)" aria-label="Nota"><button class="seg-btn" data-act="cerrar" data-id="${c.id}" type="button">Cerrar sin verificar</button>` : `<button class="seg-btn" data-act="reabrir" data-id="${c.id}" type="button">Reabrir</button>`}<button class="tw-lnk tw-del" data-act="borrar" data-id="${c.id}" type="button">Borrar</button></div>
      </article>`;
    }).join('');
  $('#seg-todo')?.addEventListener('click', () => {
    for (const l of R.llamadas) SG.comprometer(S.L, R, { ref: `kpi:${l.eslabon}.${l.kpi}`, quien: l.quien, rol: `area:${l.eslabon}`, txt: `${l.kn}: de ${fmtV(l.v, l.fmt)} a ${l.dir > 0 ? '≥' : '≤'} ${fmtV(l.meta, l.fmt)}`, meta: l.meta, dir: l.dir, fmt: l.fmt, nivel: l.nivel, eslabon: l.eslabon });
    refrescarSeg();
  });
  $('#seg-reinc').innerHTML = r.reinc.length ? `<ul class="tw3-l">${r.reinc.map(o => `<li class="crit">${o.rol ? `<button data-rol="${esc(o.rol)}"><b>${esc(o.quien)}</b></button>` : `<b>${esc(o.quien)}</b>`} · ${pl(o.n, 'compromiso', 'compromisos')}, ${pl(o.escalados, 'escalamiento', 'escalamientos')}, ${pl(o.vencidos, 'vencido', 'vencidos')} en dirección general, ${pl(o.cumplidos, 'cumplido', 'cumplidos')}</li>`).join('')}</ul><p class="note">Lo crónico no se arregla con otro regaño: es candidato a cambio de política en dirección general.</p>` : '<p class="muted">Nadie todavía. Aparecen aquí quienes dejan vencer sus compromisos.</p>';
  $('#seg-reglas').innerHTML = `
    <p><b>Compromiso.</b> Responsable, qué se mide, valor de partida, meta y plazo según el nivel: ${SG.PLAZO_DIAS[1]} días hábiles en nivel 1 y ${SG.PLAZO_DIAS[2]} en niveles 2 y 3.</p>
    <p><b>Verificación.</b> En cada corrida la torre vuelve a medir. Si llegó a la meta, lo marca cumplido; no basta con que el responsable diga que ya quedó. "Cerrar sin verificar" existe, pero se cuenta aparte y baja la tasa de cumplimiento.</p>
    <p><b>Escalamiento.</b> Si vence sin cumplirse, sube un nivel con plazo nuevo: dueño directo → junta semanal → dirección general. En dirección general ya no hay a quién escalar y queda vencido.</p>
    <p><b>Reloj.</b> Es el día hábil de la aprobación del plan. "+1 día" simula el plan un día más: cambian las bandejas de unidades, delegaciones y analistas. Los demás gemelos siguen en su escenario; para ver que se recuperan, cambia el escenario arriba.</p>
    <p><b>Dónde se guarda.</b> En este navegador. En la plataforma real sería una tabla compartida con fecha, usuario y evidencia de cada movimiento.</p>`;
}

// ------------------------------------------------------------------ ver como (vistas por rol)
function rolPorTipo(t) {
  const R = S.R;
  if (t === 'area') return { t, id: S.rol.t === 'area' ? S.rol.id : R.reparto[0].id };
  if (t === 'ana') return { t, a: S.rol.t === 'ana' ? S.rol.a : [...R.roles.analistas].sort((a, b) => b.venc - a.venc)[0].a };
  if (t === 'del') return { t, cve: S.rol.t === 'del' ? S.rol.cve : S.rol.t === 'unit' ? R.unidades[S.rol.i].cve : R.matriz.rows[0].cve };
  if (t === 'unit') { const cve = S.rol.t === 'del' ? S.rol.cve : null; const u = [...R.unidades].filter(u => !cve || u.cve === cve).sort((a, b) => b.st - a.st || (b.integ?.monto || 0) - (a.integ?.monto || 0))[0]; return S.rol.t === 'unit' ? S.rol : { t, i: u.i }; }
  if (t === 'k') return { t, id: S.rol.t === 'k' ? S.rol.id : [...R.roles.contratos].sort((a, b) => (a.otif ?? 1) - (b.otif ?? 1))[0].id };
  return { t: 'jefe' };
}
function setRol(r) {
  if (!r) return;
  S.rol = r; try { localStorage.setItem('torre.rol', rolKey(r)); } catch { /* nada */ }
  url(); rolUI();
  if (V3) { V3.setScope(scopeCve()); cola3d(); const f = rolFoco(S.R, r); if (f) pick3(f); else { V3.select(null, false); closePanel(); } }
}
function scopeCve() { const r = S.rol; return r.t === 'del' ? r.cve : r.t === 'unit' ? S.R.unidades[r.i].cve : r.t === 'k' ? '13' : null; }
function rolUI() {
  const R = S.R, r = S.rol;
  for (const b of $('#rol-t').children) b.classList.toggle('active', b.dataset.v === r.t);
  const opt = (v, n, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(n)}</option>`;
  const dot = st => (st === 'crit' ? '● ' : st === 'warn' ? '◐ ' : '○ ');
  let h = '';
  if (r.t === 'area') h = `<select id="rs-area" aria-label="Eslabón">${R.eslabones.map(e => opt(`area:${e.id}`, `${dot(e.st)}${e.n} · ${e.dueno}`, e.id === r.id)).join('')}</select>`;
  if (r.t === 'ana') h = `<select id="rs-ana" aria-label="Analista">${R.roles.analistas.map(a => opt(`ana:${a.a}`, `${dot(a.sem)}${a.nombre} · ${a.venc.toLocaleString('es-MX')} vencidas`, a.a === r.a)).join('')}</select>`;
  if (r.t === 'del') h = `<select id="rs-del" aria-label="Delegación">${[...R.roles.delegaciones].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(d => opt(`del:${d.cve}`, `${dot(d.sem)}${d.nombre}`, d.cve === r.cve)).join('')}</select>`;
  if (r.t === 'unit') {
    const cve = R.unidades[r.i].cve, us = R.unidades.filter(u => u.cve === cve).sort((a, b) => b.st - a.st || a.nombre.localeCompare(b.nombre));
    h = `<select id="rs-del-u" aria-label="Delegación">${[...R.roles.delegaciones].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(d => opt(d.cve, d.nombre, d.cve === cve)).join('')}</select>
      <select id="rs-unit" aria-label="Unidad">${us.map(u => opt(`unit:${u.i}`, `${['○ ', '○ ', '◐ ', '● '][u.st]}${u.nombre}${u.hgo ? ' · piloto' : ''}`, u.i === r.i)).join('')}</select>`;
  }
  if (r.t === 'k') h = `<select id="rs-k" aria-label="Contrato">${R.roles.contratos.map(k => opt(`k:${k.id}`, `${k.id} · ${k.prov} · ${k.objeto}`, k.id === r.id)).join('')}</select>`;
  $('#rol-sel').innerHTML = h;
  const jefe = r.t === 'jefe';
  $('#jefe-view').hidden = !jefe; $('#veredicto').hidden = !jefe; $('#rol-view').hidden = jefe;
  if (!jefe) {
    $('#rol-view').innerHTML = vistaRol(R, r, S.L);
    let hh = {}; try { hh = JSON.parse(localStorage.getItem('torre.hecho') || '{}'); } catch { /* nada */ }
    for (const c of $('#rol-view').querySelectorAll('[data-hecho]')) if (hh[c.dataset.hecho]) { c.checked = true; c.closest('li')?.classList.add('hecho'); }
  }
  document.title = jefe ? 'Torre de control del abasto' : `${rolNombre(R, r)} · Torre`;
}

// ------------------------------------------------------------------ pestaña Torre 3D
function tabs() {
  for (const b of $('#tabs').children) { const on = b.dataset.tab === S.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); }
  $('#tab-3d').hidden = S.tab !== '3d'; $('#tab-seg').hidden = S.tab !== 'seg'; $('#tab-tablero').hidden = S.tab !== 'tablero';
  if (S.tab === '3d') open3d(); else V3?.stop();
}
async function open3d() {
  if (V3) { V3.start(); V3.resize(); return; }
  if (V3p || !S.R) return;
  V3p = (async () => {
    try {
      ISS ||= await fetch('assets/estados_issste.json').then(r => r.json());
      const { Torre3D } = await import('./torre3d.js');
      const v = new Torre3D({ iss: ISS, getGLB: window.PLAN_GLB });
      await v.load($('#tw3'));
      $('#tw3 .u3d-loading')?.remove();
      v.onPick = s => pick3(s);
      v.onHover = h => { $('#tw3').title = h ? hoverTxt(h) : ''; };
      v.onTarget = t => { v.setTag(tagTxt(t)); markQueue(); if (v.patrol) panel3d(t); };   // al patrullar muestra la ficha de lo que mira
      v.onIdle = () => patrolBtn();
      V3 = v; if (new URLSearchParams(location.search).has('debug')) window.__tw3 = v;
      v.scope = scopeCve(); v.setData(S.R); cola3d(); patrolBtn();
      const f = rolFoco(S.R, S.rol); if (f) pick3(f);
      if (S.tab === '3d') v.start();
    } catch (err) { console.error(err); const l = $('#tw3 .u3d-loading'); if (l) l.textContent = 'No se pudo cargar la vista 3D: ' + err.message; }
  })();
}
function patrolBtn() { const b = $('#tw3-patrol'); b.classList.toggle('on', !!V3?.patrol); b.setAttribute('aria-pressed', !!V3?.patrol); b.textContent = V3?.patrol ? 'Patrullando' : 'Patrullar'; }
function pick3(s) {
  if (!V3) return;
  if (!s) { V3.select(null, false); closePanel(); return; }
  V3.select(s); patrolBtn(); panel3d(s);
}
const unitOf = i => S.R.unidades[i];
const rowOf = cve => S.R.matriz.rows.find(r => r.cve === cve);
const ST_U = ['Sin pendientes', 'En plazo', 'Ámbar', 'Rojo'];
const ST_UC = ['', 'ok', 'warn', 'crit'];
function nameOf(t) {
  if (t.type === 'unit') return unitOf(t.i).nombre;
  if (t.type === 'del') return `Delegación ${rowOf(t.cve)?.nombre || t.cve}`;
  if (t.type === 'cenadi') return 'CENADI';
  return 'Torre vigía';
}
function whyOf(t) {
  if (t.type === 'unit') return unitOf(t.i).m[0]?.[1] || 'sin observaciones';
  if (t.type === 'del') { const r = rowOf(t.cve); if (!r) return ''; const c = Object.entries(r.c).filter(([, x]) => x.st === 'crit').map(([k]) => S.R.matriz.cols.find(c => c.id === k).n); return c.length ? `en rojo: ${c.join(', ')}` : 'sin rojos'; }
  if (t.type === 'cenadi') { const e = S.R.eslabones.find(x => x.id === 'cenadi'); const k = e.kpis.filter(k => k.st === 'crit').map(k => `${k.n} ${fmtV(k.v, k.fmt)}`); return k.join(' · ') || 'en meta'; }
  return '';
}
function tagTxt(t) { return `<span class="tw3-eye" aria-hidden="true"></span><b>${esc(nameOf(t))}</b><small>${esc(whyOf(t))}</small>`; }
function hoverTxt(h) { return h.type === 'tower' ? 'Torre vigía' : nameOf(h); }
function cola3d() {
  const q = V3.queue;
  $('#tw3-queue').innerHTML = q.length ? q.map((t, k) => {
    const st = V3.stOf(t);
    return `<button class="tw3-q ${st}" data-q="${k}"><i class="dot"></i><span><b>${esc(nameOf(t))}</b><small>${esc(whyOf(t))}</small></span><em>${t.type === 'unit' ? 'Unidad' : t.type === 'del' ? 'Delegación' : 'CENADI'}</em></button>`;
  }).join('') : '<p class="muted">Nada en rojo: el ojo descansa.</p>';
  markQueue();
}
function markQueue() { if (!V3) return; [...$('#tw3-queue').querySelectorAll('[data-q]')].forEach(b => b.classList.toggle('now', V3.patrol && +b.dataset.q === V3.qi)); }

// ficha flotante, como la del CENADI 3D
function closePanel() { $('#tw3 .u3d-panel')?.remove(); }
function panel3d(s) {
  let pn = $('#tw3 .u3d-panel');
  if (!pn) { pn = document.createElement('div'); pn.className = 'u3d-panel tw3-panel'; $('#tw3').appendChild(pn); pn.addEventListener('click', e => { if (e.target.closest('.u3d-x')) { closePanel(); V3.select(null, false); } const g = e.target.closest('[data-goto]'); if (g) { const [t, v] = g.dataset.goto.split(':'); pick3(t === 'unit' ? { type: 'unit', i: +v } : t === 'del' ? { type: 'del', cve: v } : { type: t }); } const ge = e.target.closest('[data-eslabon]'); if (ge) { S.sel = ge.dataset.eslabon; S.tab = 'tablero'; url(); tabs(); cadena(); detalle(); $('#detalle').scrollIntoView({ behavior: 'smooth' }); } }); }
  pn.innerHTML = s.type === 'unit' ? fichaUnidad(unitOf(s.i)) : s.type === 'del' ? fichaDel(s.cve) : s.type === 'cenadi' ? fichaCenadi() : fichaTorre();
}
const hdr = (t, sub, st) => `<header><div><b>${esc(t)}</b><small>${sub}</small></div><button class="u3d-x" aria-label="Cerrar">×</button></header>${st ? `<span class="chip ${st}">${esc(st === 'crit' ? 'Rojo' : st === 'warn' ? 'Ámbar' : st === 'ok' ? 'En meta' : 'Sin dato')}</span>` : ''}`;
const dl = rows => `<dl>${rows.filter(Boolean).map(([k, v, c]) => `<dt>${esc(k)}</dt><dd class="${c || ''}">${v}</dd>`).join('')}</dl>`;
function fichaUnidad(u) {
  const D = rowOf(u.cve), st = ST_UC[u.st];
  const h = u.hgo;
  const nivel = u.st === 3 ? (u.integ ? 3 : 2) : u.st === 2 ? 1 : 0;
  return hdr(u.nombre, `${esc(u.tipo)} · ${esc(D?.nombre || u.cve)} · CLUES ${esc(u.clues)}`, st || null) + `
    <p class="u3d-h">A quién se le reclama</p>
    ${dl([['Responsable', `Director(a) de ${esc(u.nombre)}`], ['Supervisa', esc(D?.dueno || '')], nivel ? ['Escalamiento', esc(NIVELES[nivel].n), ['', 'ok', 'warn', 'crit'][nivel]] : ['Escalamiento', 'No hace falta', 'ok']])}
    <p class="u3d-h">Plan anual 2027</p>
    ${dl([['En el plan', u.inPlan ? 'Sí' : 'No'], ['Pedido de la unidad', u.fin ? 'Concluido' : 'Abierto'], ['Partidas en su bandeja', u.pend.toLocaleString('es-MX')], ['Vencidas', u.venc.toLocaleString('es-MX'), u.venc ? 'warn' : ''], ['Con escalamiento', u.esc2.toLocaleString('es-MX'), u.esc2 ? 'crit' : '']])}
    <p class="u3d-h">Integridad</p>
    ${dl([u.integ ? ['Pedidos maliciosos que pasaron', `${u.integ.n} · ${esc(fmtV(u.integ.monto, 'mxn'))}`, 'crit'] : ['Pedidos maliciosos que pasaron', 'Ninguno', 'ok']])}
    ${h ? `<p class="u3d-h">Farmacia · piloto Hidalgo, 30 días</p>${dl([['Recetas', h.rx.toLocaleString('es-MX')], ['Surtidas completas', fmtV(h.s, 'pct'), h.s < 0.9 ? 'crit' : h.s < 0.97 ? 'warn' : 'ok'], ['Negadas por completo', h.den.toLocaleString('es-MX')], ['PEX en plazo', h.pex ? fmtV(h.pe, 'pct') : '—', h.pex && h.pe < 0.75 ? 'warn' : ''], ['Urgencias tarde', `${h.reqLate} de ${h.reqs}`], ['Piezas caducadas', h.merma.toLocaleString('es-MX')]])}` : '<p class="note">Fuera del piloto: de esta unidad la torre solo ve el plan y la integridad.</p>'}
    ${u.m.length ? `<p class="u3d-h">Por qué está así</p><ul class="tw3-l">${u.m.map(([n, t]) => `<li class="${['', '', 'warn', 'crit'][n] || ''}">${esc(t)}</li>`).join('')}</ul>` : ''}
    <button class="tw3-link" data-rol="unit:${u.i}">Ver el tablero del director →</button>
    <button class="tw3-link" data-goto="del:${u.cve}">Ver la delegación de ${esc(D?.nombre || '')} →</button>`;
}
function fichaDel(cve) {
  const r = rowOf(cve), us = S.R.unidades.filter(u => u.cve === cve), n = [0, 0, 0, 0]; us.forEach(u => n[u.st]++);
  const nac = S.R.nac.find(x => x.cve === cve);
  const st = Object.values(r.c).some(x => x.st === 'crit') ? 'crit' : Object.values(r.c).some(x => x.st === 'warn') ? 'warn' : 'ok';
  const peores = us.filter(u => u.st >= 2).sort((a, b) => b.st - a.st || (b.integ?.monto || 0) - (a.integ?.monto || 0) || b.venc - a.venc).slice(0, 6);
  return hdr(`Delegación ${r.nombre}`, `${esc(r.dueno)} · revisa ${esc(r.analista)}${r.piloto ? ' · piloto' : ''}`, st) + `
    <p class="u3d-h">Su fila en la matriz</p>
    ${dl(S.R.matriz.cols.map(c => [c.n, `${esc(r.c[c.id].v)}<small>${esc(r.c[c.id].det)}</small>`, r.c[c.id].st]))}
    ${nac ? `<p class="u3d-h">Almacén estatal · 30 días</p>${dl([['Demanda atendida', fmtV(nac.abasto, 'pct1'), nac.abasto < 0.97 ? 'warn' : 'ok'], ['Días en cero', (Math.round(nac.outH / 24 * 10) / 10).toLocaleString('es-MX'), nac.outH ? 'crit' : ''], ['Embarques del CENADI tarde', `${nac.late} de ${nac.ships}`, nac.late ? 'warn' : '']])}` : ''}
    <p class="u3d-h">Sus ${us.length} unidades</p>
    <div class="tw3-bar">${n.map((x, k) => x ? `<i class="s${k}" style="flex:${x}" title="${ST_U[k]}: ${x}"></i>` : '').join('')}</div>
    <p class="tw3-cnt"><span class="crit">${n[3]} en rojo</span> · <span class="warn">${n[2]} en ámbar</span> · ${n[1]} en plazo · ${n[0]} sin pendientes</p>
    <button class="tw3-link" data-rol="del:${cve}">Ver el tablero del administrador delegacional →</button>
    ${peores.length ? `<p class="u3d-h">Directores a llamar</p><ul class="tw3-l">${peores.map(u => `<li class="${ST_UC[u.st]}"><button data-goto="unit:${u.i}"><b>${esc(u.nombre)}</b> · ${esc(u.m[0]?.[1] || '')}</button></li>`).join('')}</ul>` : ''}`;
}
function fichaCenadi() {
  const E = ['cenadi', 'dnac'].map(id => S.R.eslabones.find(e => e.id === id));
  return hdr('CENADI', 'Centro Nacional de Distribución · Tlalnepantla', E[0].st) + E.map(e => `
    <p class="u3d-h">${esc(e.n)} · ${esc(e.dueno)}</p>
    ${dl(e.kpis.map(k => [k.n, fmtV(k.v, k.fmt), k.st]))}`).join('') + `
    <button class="tw3-link" data-eslabon="cenadi">Ver los indicadores en el tablero →</button>`;
}
function fichaTorre() {
  const R = S.R, top = R.reparto.slice(0, 3);
  return hdr('Torre vigía', `${esc(R.escN)} · lo que ve el jefe de jefes`, null) + `
    <p class="u3d-h">¿De quién es el problema?</p>
    ${dl(top.map(t => [t.n, pc(t.share), t.st]))}
    <p class="u3d-h">Estrella del norte</p>
    ${dl(R.norte.map(n => [n.n, fmtV(n.v, n.fmt), n.st]))}
    <p class="u3d-h">A quién llamar primero</p>
    <ul class="tw3-l">${R.llamadas.slice(0, 4).map(l => `<li class="${l.st}"><b>${esc(l.quien)}</b> · ${esc(l.kn)} ${fmtV(l.v, l.fmt)} · ${esc(NIVELES[l.nivel].n)}</li>`).join('')}</ul>`;
}

function spark(serie, meta, dir = 1) {
  if (!serie || serie.length < 2) return '';
  const w = 120, h = 30, lo = Math.min(meta ?? Infinity, ...serie), hi = Math.max(meta ?? -Infinity, ...serie);
  const span = hi - lo || 1, y = v => h - 3 - (v - lo) / span * (h - 6), x = i => i / (serie.length - 1) * w;
  const d = serie.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const m = meta != null ? `<line x1="0" x2="${w}" y1="${y(meta).toFixed(1)}" y2="${y(meta).toFixed(1)}" class="tw-meta"/>` : '';
  return `<svg class="tw-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${m}<path d="${d}"/></svg>`;
}
const metaTxt = k => (k.info ? 'informativo' : `meta ${k.dir > 0 ? '≥' : '≤'} ${fmtV(k.meta, k.fmt)}`);

function veredicto() {
  const R = S.R, top = R.reparto.filter(r => r.share > 0.005).slice(0, 2);
  const rx = R.norte.find(n => n.id === 'recetas'), ab = R.norte.find(n => n.id === 'abasto');
  const n3 = R.llamadas.filter(l => l.nivel === 3).length, n2 = R.llamadas.filter(l => l.nivel === 2).length, n1 = R.llamadas.filter(l => l.nivel === 1).length;
  const pac = rx.st === 'ok' && ab.st === 'ok'
    ? `El paciente todavía no lo siente: ${fmtV(rx.v, rx.fmt)} de recetas completas en el piloto y ${fmtV(ab.v, ab.fmt)} de abasto estatal.`
    : `<b class="crit">El paciente ya lo siente:</b> ${fmtV(rx.v, rx.fmt)} de recetas completas en el piloto (meta 97 %) y ${fmtV(ab.v, ab.fmt)} de abasto estatal.`;
  $('#veredicto').innerHTML = `
    <div class="tw-v-main">
      <span class="eyebrow">Veredicto de la torre · ${esc(R.escN)}</span>
      <h1>${top.length ? `El problema hoy es de <em>${esc(top[0].n)}</em> (${pc(top[0].share)})${top[1] ? ` y de <em>${esc(top[1].n)}</em> (${pc(top[1].share)})` : ''}.` : 'Toda la cadena está en meta.'}</h1>
      ${segLinea()}
      <p>${pac} ${top[0] ? `Llamar primero a <b>${esc((R.llamadas.find(l => l.eslabon === top[0].id) || {}).quien || top[0].dueno)}</b>.` : ''}</p>
    </div>
    <div class="tw-v-niv">
      <div class="n3"><b>${n3}</b><span>a dirección general</span></div>
      <div class="n2"><b>${n2}</b><span>a la junta semanal</span></div>
      <div class="n1"><b>${n1}</b><span>al dueño directo</span></div>
    </div>`;
}

function norte() {
  $('#norte').innerHTML = S.R.norte.map(n => `
    <div class="kpi ${n.st}">
      <span>${esc(n.n)}</span>
      <b>${fmtV(n.v, n.fmt)}</b>
      <small><i class="dot"></i>${ST_N[n.st]} · ${n.dir > 0 ? 'meta ≥' : 'meta'} ${fmtV(n.meta, n.fmt)}</small>
      ${spark(n.serie, n.meta)}
      <em class="tw-alc">${esc(n.alc)} · ${esc(n.fuente)}</em>
    </div>`).join('');
}

function reparto() {
  const R = S.R, max = Math.max(...R.reparto.map(r => r.share), 0.01);
  $('#reparto').innerHTML = R.reparto.map(r => `
    <button class="tw-rep ${r.st}" data-e="${r.id}" data-go="1">
      <span class="tw-rep-n">${r.ic} ${esc(r.n)}<small>${esc(r.dueno)}</small></span>
      <span class="tw-rep-bar"><i class="own" style="width:${(r.propio / max * 100).toFixed(1)}%"></i><i class="rec" style="width:${(r.recibido / max * 100).toFixed(1)}%"></i></span>
      <b>${pc(r.share)}</b>
      ${r.recibido > 0.005 ? `<em>${pc(r.recibido)} explica fallas de ${r.de.map(d => esc(ESLABONES.find(e => e.id === d).n)).join(', ')}</em>` : ''}
    </button>`).join('');
}

function llamadas() {
  const L = S.R.llamadas.slice(0, 7);
  $('#llamadas').innerHTML = L.length ? L.map(l => `
    <div class="tw-call n${l.nivel}">
      <div class="tw-call-h"><span class="tw-niv n${l.nivel}">${esc(NIVELES[l.nivel].n)}</span><button class="tw-link" data-e="${l.eslabon}" data-go="1">${l.ic} ${esc(l.en)}</button></div>
      <b class="tw-who">${esc(l.quien)}</b>
      <div class="tw-call-k"><span>${esc(l.kn)}</span><strong class="${l.st}">${fmtV(l.v, l.fmt)}</strong><small>${l.dir > 0 ? 'meta ≥' : 'meta ≤'} ${fmtV(l.meta, l.fmt)}</small></div>
      ${l.culpa ? `<p class="tw-her">↑ ${Math.round((1 - l.f) * 100)} % de esta brecha se explica por <b>${esc(l.culpaK)}</b> (${esc(l.culpa)})${l.f < 0.5 ? ': primero se llama allá' : ''}.</p>` : ''}
      ${l.of.length ? `<ul class="tw-of">${l.of.map(o => { const g = rolDeNombre(S.R, o.quien); return `<li>${g ? `<button class="tw-lnk" data-rol="${g}"><b>${esc(o.quien)}</b></button>` : `<b>${esc(o.quien)}</b>`} · ${esc(o.txt)}</li>`; }).join('')}</ul>` : ''}
      <div class="tw-call-f">${compBtn(S.L, { ref: `kpi:${l.eslabon}.${l.kpi}`, quien: l.quien, rol: `area:${l.eslabon}`, txt: `${l.kn}: de ${fmtV(l.v, l.fmt)} a ${l.dir > 0 ? '≥' : '≤'} ${fmtV(l.meta, l.fmt)}`, meta: l.meta, dir: l.dir, fmt: l.fmt, nivel: l.nivel, eslabon: l.eslabon })}</div>
      <p class="tw-plazo"><button class="tw-lnk" data-rol="area:${l.eslabon}">Ver el tablero de ${esc(l.en)}</button> · ${esc(NIVELES[l.nivel].plazo)}</p>
    </div>`).join('') + (S.R.llamadas.length > L.length ? `<p class="note">Y ${S.R.llamadas.length - L.length} indicadores más fuera de meta en el detalle de cada eslabón.</p>` : '')
    : '<p class="muted">Nadie: todos los indicadores están en meta.</p>';
}

function chainCard(e) {
  const worst = [...e.kpis].filter(k => !k.info).sort((a, b) => b.g * b.w - a.g * a.w)[0];
  const cu = e.culpa ? S.R.eslabones.find(x => x.id === e.culpa) : null;
  return `<button class="tw-node ${e.st}${S.sel === e.id ? ' sel' : ''}" data-e="${e.id}">
    <span class="tw-node-h"><i>${e.ic}</i><b>${esc(e.n)}</b><em class="dot"></em></span>
    <span class="tw-node-s">${pc(e.share)} <small>de la culpa</small></span>
    ${worst && worst.st !== 'ok' ? `<span class="tw-node-k">${esc(worst.n)}: <b class="${worst.st}">${fmtV(worst.v, worst.fmt)}</b></span>` : '<span class="tw-node-k ok">Todo en meta</span>'}
    <span class="tw-node-c">${e.kpis.filter(k => !k.info).map(k => `<i class="${k.st}" title="${esc(k.n)}"></i>`).join('')}</span>
    ${cu ? `<span class="tw-node-u">↑ parte viene de ${esc(cu.n)}</span>` : ''}
    <small class="tw-node-d">${esc(e.dueno)}</small>
  </button>`;
}
function cadena() {
  const E = S.R.eslabones;
  $('#cadena').innerHTML = E.filter(e => !e.trans).map(chainCard).join('<span class="tw-arrow" aria-hidden="true"></span>');
  $('#trans').innerHTML = `<span class="tw-trans-l">Transversales: tocan todos los eslabones</span>` + E.filter(e => e.trans).map(chainCard).join('');
}

function detalle() {
  const e = S.R.eslabones.find(x => x.id === S.sel); if (!e) return;
  const r = e.resp;
  $('#detalle').innerHTML = `
    <div class="card-h">
      <h2>${e.ic} ${esc(e.n)} <small>${esc(e.alcance)}</small></h2>
      <a class="seg-btn tw-open" href="${e.link}">Abrir el gemelo →</a>
    </div>
    <div class="tw-det-h">
      <div><span>Dueño del eslabón (A en la matriz RACI)</span><b>${esc(e.dueno)}</b></div>
      <div><span>Su parte de la culpa</span><b class="${e.st}">${pc(e.share)}</b></div>
      <div><span>Indicadores en rojo / ámbar</span><b>${e.nCrit} / ${e.nWarn}</b></div>
      <div><span>¿Le llega de arriba?</span><b>${e.culpa ? `Sí, de ${esc(S.R.eslabones.find(x => x.id === e.culpa).n)}` : 'No: es propio'}</b></div>
    </div>
    <div class="tw-kpis">${e.kpis.map(k => `
      <details class="tw-k ${k.info ? 'info' : k.st}" ${k.st !== 'ok' ? 'open' : ''}>
        <summary>
          <span class="tw-k-n"><i class="dot"></i>${esc(k.n)}</span>
          <b>${fmtV(k.v, k.fmt)}</b>
          <small>${metaTxt(k)}${k.info ? '' : ` · crítico ${fmtV(k.crit, k.fmt)}`}</small>
          ${spark(k.serie, k.info ? null : k.meta)}
        </summary>
        <div class="tw-k-b">
          <p><b>Qué mide:</b> ${esc(k.def)}</p>
          <p><b>Fórmula:</b> ${esc(k.formula)}</p>
          <p><b>De dónde sale la meta:</b> ${esc(k.fuente)}</p>
          <p><b>A quién se le reclama:</b> ${esc(k.quien || e.dueno)}${k.culpa ? ` · <span class="tw-her">${Math.round((1 - k.f) * 100)} % se explica por ${esc(k.culpaK)}</span>` : ''}</p>
          ${k.hereda ? `<p><b>Depende de:</b> ${esc(k.deN.join(', '))}</p>` : ''}
          ${k.det ? `<p class="muted">${esc(k.det)}</p>` : ''}
          ${k.of.length ? `<ul class="tw-of">${k.of.map(o => `<li><b>${esc(o.quien)}</b> · ${esc(o.txt)}</li>`).join('')}</ul>` : ''}
        </div>
      </details>`).join('')}</div>
    <p class="note">Brecha propia ${(r.propio).toFixed(2)} puntos · heredada de arriba ${(r.heredado).toFixed(2)} · recibida de abajo ${(r.recibido).toFixed(2)} (brecha × peso del indicador).</p>`;
}

function nombres() {
  const N = S.R.nombres;
  $('#nombres').innerHTML = N.length ? `<table class="tw-tbl"><thead><tr><th>Nivel</th><th>Quién</th><th>Por qué</th></tr></thead><tbody>${N.map(n => `
    <tr><td><span class="tw-niv n${n.nivel}">${n.nivel}</span></td><td>${rolDeNombre(S.R, n.quien) ? `<button class="tw-lnk" data-rol="${rolDeNombre(S.R, n.quien)}"><b>${esc(n.quien)}</b></button>` : `<b>${esc(n.quien)}</b>`}</td><td>${esc(n.txt)}<small class="tw-sub">${esc(n.en)} · ${esc(n.kn)}</small></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nadie señalado.</p>';
}

function matriz() {
  const M = S.R.matriz;
  for (const b of $('#mfiltro').children) b.classList.toggle('active', b.dataset.v === S.filtro);
  const rows = S.filtro === 'rojo' ? M.rows.filter(r => Object.values(r.c).some(c => c.st === 'crit')) : M.rows;
  $('#matriz').innerHTML = `<table class="tw-mtx"><thead><tr><th>Delegación</th>${M.cols.map(c => `<th>${c.ic} ${esc(c.n)}<small>${esc(c.sub)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(r => `
    <tr data-cve="${r.cve}"><td class="tw-mtx-d"><b>${esc(r.nombre)}</b>${r.piloto ? '<span class="chip accent">piloto</span>' : ''}<small>${esc(r.dueno)} · ${esc(r.analista)}</small><button class="tw-lnk tw-mtx-go" data-rol="del:${r.cve}">Ver su tablero →</button></td>${M.cols.map(c => { const x = r.c[c.id]; return `<td class="tw-cell ${x.st}"><b>${esc(x.v)}</b><small>${esc(x.det)}</small></td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
}

function textos() {
  $('#reglas').innerHTML = `
    <p><b>Una cadena, diez eslabones, un dueño por indicador.</b> Cada indicador tiene una meta escrita, un nivel crítico y un área que responde (la A de la matriz RACI); cuando otra área tiene que enterarse, se dice entre paréntesis. Los nombres concretos (analistas, delegaciones, unidades, contratos, almacenistas) salen de cada gemelo.</p>
    <p><b>Semáforo contra una referencia.</b> Brecha = (meta − valor) ÷ (meta − crítico). Cero es verde, menos de uno es ámbar, uno o más es rojo, y se topa en 3 para que un solo indicador no se lleve todo. Gris: sin dato, que no cuenta como verde. Cada meta dice de dónde sale: MIR del ISSSTE, cifras públicas, IAPHL, una norma o, cuando no hay fuente, una meta interna del gemelo que se dice como tal.</p>
    <p><b>Atribuir la falla al eslabón correcto.</b> Un indicador de resultado sólo cuenta completo contra su dueño si lo de arriba cumplió. Como los gemelos no están conectados entre sí, son reglas de atribución que la torre aplica, no causas que deduzca. Si el indicador que lo alimenta está en rojo, 65 % de la brecha pasa a ese eslabón; si está en ámbar, 25 %. Las dependencias que usa la torre:</p>
    <ul class="tw-dep">${Object.entries(DEP).map(([k, v]) => `<li><b>${esc(nameK(k))}</b> ← ${v.map(x => esc(nameK(x))).join(' · ')}</li>`).join('')}</ul>
    <p><b>Escalamiento.</b> Nivel 1: el dueño directo atiende en 24 a 48 horas (ámbar). Nivel 2: rojo, a la junta semanal de operación con causa raíz. Nivel 3: rojo de peso 3, mayormente propio y muy lejos de la meta; o cualquier rojo de peso 3 cuando el desabasto ya se ve en dos de estos tres: estados en cero, surtido del almacén estatal y recetas completas. Decide la dirección general. Si la mayor parte de la brecha viene de arriba, baja un nivel: primero se llama allá.</p>
    <p><b>¿De quién es el problema?</b> Suma de brecha × peso por eslabón, después de la atribución, como porcentaje del total. Un eslabón con más indicadores puede acumular más; por eso cada uno muestra cuántos tiene en rojo y en ámbar.</p>`;
  $('#huecos').innerHTML = `
    <p><b>Los gemelos no están conectados entre sí.</b> Cada uno corre el escenario elegido con sus propios datos: la falla de proveedor del CENADI nacional no sale de los contratos de Hidalgo. La torre los pone lado a lado con su alcance y periodo, no como un solo modelo.</p>
    <p><b>El detalle fino sólo existe en el piloto Hidalgo.</b> CEDIS estatal, rutas, 60 unidades y recetas se simulan para Hidalgo; los otros 31 estados se ven a nivel de almacén estatal, planeación, red fría e integridad.</p>
    <p><b>La causa de cada receta no surtida no se registra.</b> El INAI ordenó al ISSSTE transparentar sus recetas no surtidas de 2024 con su causa, y la causa no se registra. Sin ese dato no se puede separar desabasto de clave fuera de cuadro o error de captura.</p>
    <p><b>Al proveedor no se le regaña: se le aplica el contrato.</b> La torre señala al administrador del contrato, que es quien exige, aplica penas o inicia la rescisión.</p>
    <p><b>Encuestas no.</b> CONEVAL señaló que la satisfacción reportada por el ISSSTE (98.4 %) chocaba con una evaluación de 76 % para farmacias, y que las encuestas las aplica el propio personal de la unidad. La torre sólo usa datos de transacciones: recetas, entregas, conteos y registros de temperatura.</p>
    <p><b>Todo es simulado.</b> Los números sirven para decidir qué datos hay que capturar y quién responde por cada uno, no para calificar a personas reales.</p>`;
  $('#refs').innerHTML = REFS.map(([t, u, d]) => `<p><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a> · ${esc(d)}</p>`).join('');
}
function nameK(k) { const [ref, si] = k.split('?'); if (si) return `${nameK(ref)}, si también falla ${nameK(si)}`; const [e, id] = ref.split('.'); const E = S.R.eslabones.find(x => x.id === e); const K = E?.kpis.find(x => x.id === id); return K ? `${K.n} (${E.n})` : k; }

const REFS = [
  ['Gartner, vía SupplyChain247: qué es una torre de control', 'https://www.supplychain247.com/article/what_is_a_supply_chain_control_tower_and_whats_needed_to_deploy_one', 'personas, procesos, datos, organización y tecnología; de la visibilidad a la decisión'],
  ['Umbrex: modelo operativo de una torre de control', 'https://umbrex.com/?p=244657', 'alertas por impacto con dueño, tres horizontes, cadencia diaria, semanal y mensual, escalamiento'],
  ['Umbrex: modelo SCOR', 'https://umbrex.com/resources/frameworks/strategy-frameworks/scor-model/', 'atributos de nivel 1 y árbol de diagnóstico hasta la causa raíz'],
  ['ASCM: ejemplo de tablero SCORmark', 'https://www.ascm.org/globalassets/ascm_website_assets/docs/2026-scormark-dashboard-example-deliverables.pdf', 'semáforo contra cuartiles de referencia'],
  ['DSG.ai: torre de control en la cadena de suministro', 'https://www.dsg.ai/blog/control-tower-in-supply-chain', 'gestión por excepción, vistas por rol, OTIF 88 % base y 93 % meta (ejemplo, no norma)'],
  ['BSC Designer: RACI en la planeación estratégica', 'https://bscdesigner.com/raci-strategic-planning.htm', 'un solo Accountable por indicador'],
  ['CONEVAL: ficha de monitoreo E018 del ISSSTE', 'https://www.coneval.org.mx/Evaluacion/Documents/EVALUACIONES/FMyE_2017_2018/FMyE_51_E018.pdf', 'meta 97 %, logro 97.5 %; advertencia sobre encuestas'],
  ['Consultor Salud: el ISSSTE reporta 97 % de abasto (1-abr-2026)', 'https://consultorsalud.com.mx/issste-reporta-97-de-abasto-de-medicamentos-en-sus-unidades-y-elimina-farmacias-por-debajo-del-90/', '766 farmacias, ninguna debajo de 90 %'],
  ['Zeta Tijuana: comparecencia de Salud (7-nov-2025)', 'https://zetatijuana.com/2025/11/salud-federal-presume-96-de-abasto-de-medicamentos-imss-surte-97-recetas-dice/', 'compra consolidada 2025-26: 99 % de lo solicitado'],
  ['Cero Desabasto: radiografía 2017-2021', 'https://a.storyblok.com/f/162801/x/0680df0f5f/resumen-radiografia-desabasto-2017-2021.pdf', 'recetas no surtidas efectivamente en el ISSSTE por año'],
  ['Expansión: recetas no surtidas en 2023', 'https://politica.expansion.mx/mexico/2024/05/06/recetas-no-se-surtieron-completamente-en-2023', 'ISSSTE 98.1 % de recetas surtidas completas'],
  ['El Universal: el INAI ordena al ISSSTE transparentar recetas no surtidas', 'https://www.eluniversal.com.mx/nacion/ordena-inai-al-issste-transparentar-numero-de-medicamentos-no-surtidos-en-2024-debe-informar-la-causa/', 'la causa de no surtir no se registra'],
  ['IAPHL: manual de indicadores de monitoreo y evaluación', 'https://iaphl.org/wp-content/uploads/2016/05/M_E_indicators_hdbk.pdf', 'exactitud de inventario, error de surtido, mermas'],
  ['OMS: indicadores de acceso a medicamentos', 'https://www.who.int/tools/monitoring-and-evaluation/access-indicators', '80 % de disponibilidad de la canasta trazadora'],
  ['RHSC: indicadores armonizados de desabasto', 'https://rhsupplies.org/activities-resources/publications/harmonized-suite-of-indicators-to-measure-stockouts-and-availability-of-contraceptives-7374', 'desabasto el día del corte y duración'],
];

if (new URLSearchParams(location.search).has('debug')) window.__torre = S;
params(); bind(); tabs(); run();

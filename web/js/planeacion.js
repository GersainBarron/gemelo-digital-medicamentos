// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  planeacion.js · Módulo 1. Planeación (plan anual de necesidades)
//  Pantallas por rol, según los requerimientos ATDT (Sprints 1, 2 y 3):
//   · Planes de necesidad: bandeja, nuevo plan (5 pasos), tablero por etapas
//   · Catálogos institucionales: unidades, insumos y kits
//   · Asignación de insumos: por delegación, unidad o insumo; asistente de
//     3 pasos; planeación anual o mensual; carga CSV
//   · Aprobación de insumos: Unidad → Delegación → Oficina Central, con
//     Aprobar, Rechazar o Negociar; solicitud de insumo nuevo
//   · Programas especiales, cierre por el aprobador firmante, notificaciones
//   · Simulación del ciclo (gemelo): los demás actores responden con reglas
//  La bitácora de acciones se guarda en este navegador (localStorage) y el
//  estado se reconstruye repitiéndola; >>> API: sustituir por el servicio
//  de la plataforma con las mismas acciones.
// =====================================================================
import * as E from './plan-engine.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('es-MX');
const n0 = x => nf.format(Math.round(x || 0));
const f1 = x => (Math.round(x * 10) / 10).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (x, d = 0) => `${(x * 100).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
const money = x => (Math.abs(x) >= 1e9 ? `$${f1(x / 1e9)} mil M` : Math.abs(x) >= 1e6 ? `$${f1(x / 1e6)} M` : `$${n0(x)}`);
const LS = 'planeacion.bitacora.v1';
const ROLES = { oc: 'Área central', del: 'Administrador delegacional', um: 'Unidad médica', firmante: 'Aprobador firmante', admin: 'Administrador institucional' };
const LVL_OF = { oc: 'oc', del: 'del', um: 'um' };
const RESPONSABLES = ['Coordinación Nacional de Abasto', 'Subdirección de Planeación de Insumos', 'Jefatura de Departamento de Catálogos', 'Subdirección de Programas Especiales'];

const S = { U: null, plans: [], entries: [], role: 'oc', del: '13', clues: null, tbl: {}, wiz: null, seen: 0, data: null };

// ------------------------------------------------------------------ bitácora persistente
function loadEntries() { try { const v = localStorage.getItem(LS); if (v) return JSON.parse(v); } catch { /* sin almacenamiento */ } return E.seedEntries(); }
function saveEntries() { try { localStorage.setItem(LS, JSON.stringify(S.entries)); } catch { /* sin almacenamiento: la sesión sigue en memoria */ } }
function commit(entry, { render: rr = true, toast: msg } = {}) {
  if (entry.a === 'nuevo') { const P = E.newPlan(entry.cfg); S.plans.push(P); E.ACTIONS.crear(S.U, P, entry); }
  else {
    const P = S.plans.find(p => p.id === entry.plan);
    E.ACTIONS[entry.a](S.U, P, entry);
  }
  const last = S.entries.at(-1);
  if (entry.a === 'sim' && last && last.a === 'sim' && last.plan === entry.plan) last.days += entry.days; else S.entries.push(entry);
  saveEntries();
  if (msg) toast(msg);
  if (rr) render();
}
function tryCommit(entry, opts) { try { commit(entry, opts); return true; } catch (err) { toast(err.message, true); return false; } }

// ------------------------------------------------------------------ utilidades de interfaz
function toast(msg, bad = false) {
  const t = document.createElement('div'); t.className = 'pl-toast' + (bad ? ' bad' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function modal({ title, text, ok = 'Aceptar', cancel = 'Cancelar', input = null, danger = false }) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'pl-modal';
    m.innerHTML = `<div role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${input ? `<label class="pl-form" style="display:block"><span style="font-size:12px;color:var(--muted)">${esc(input.label)}</span><textarea id="m-in" maxlength="500" style="width:100%;height:96px;margin-top:6px;border-radius:10px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);padding:8px 10px"></textarea></label>` : ''}<div class="row"><button class="btn" data-x="0">${esc(cancel)}</button><button class="btn ${danger ? 'warn' : 'pri'}" data-x="1" ${input?.required ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
    document.body.appendChild(m);
    const ta = m.querySelector('#m-in'), okb = m.querySelector('[data-x="1"]');
    ta?.addEventListener('input', () => { okb.disabled = input.required && ta.value.trim().length < (input.min || 1); });
    ta?.focus();
    m.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (!b) return; m.remove(); res(b.dataset.x === '1' ? (input ? ta.value.trim() : true) : null); });
  });
}
const chip = (st, txt) => `<span class="st ${esc(st)}">${esc(txt ?? st)}</span>`;
const dict = st => chip(st, E.DICT[st] || st);
function download(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : (v ?? '')).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// tabla con buscador, orden por columna y paginador de 15 (RN_27)
function table(id, cols, rows, { empty = 'No se encontraron registros', rowAttr = () => '', size = 15 } = {}) {
  const st = S.tbl[id] ||= { page: 0, sort: null, dir: 1 };
  let R = rows;
  if (st.sort != null) { const c = cols[st.sort]; R = [...rows].sort((a, b) => { const va = c.sort ? c.sort(a) : c.v(a), vb = c.sort ? c.sort(b) : c.v(b); return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es')) * st.dir; }); }
  const pages = Math.max(1, Math.ceil(R.length / size)); st.page = Math.min(st.page, pages - 1);
  const slice = R.slice(st.page * size, st.page * size + size);
  return `<div class="pl-table" data-tbl="${id}"><table><thead><tr>${cols.map((c, i) => `<th class="${c.n ? 'n' : ''} ${c.opt ? 'col-opt2' : ''}" ${c.nosort ? '' : `data-sort="${i}" style="cursor:pointer"`}>${c.h}${st.sort === i ? (st.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead><tbody>${slice.length ? slice.map(r => `<tr ${rowAttr(r)}>${cols.map(c => `<td class="${c.n ? 'n' : ''} ${c.cls || ''} ${c.opt ? 'col-opt2' : ''}">${c.f ? c.f(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}"><p class="empty">${esc(empty)}</p></td></tr>`}</tbody></table>
    <div class="pl-pager"><span>${n0(R.length)} registro${R.length === 1 ? '' : 's'} · página ${st.page + 1} de ${pages}</span><span class="btns"><button class="btn sm" data-pg="-1" ${st.page ? '' : 'disabled'}>Anterior</button><button class="btn sm" data-pg="1" ${st.page < pages - 1 ? '' : 'disabled'}>Siguiente</button></span></div></div>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tbl]'); if (!t) return;
  const st = S.tbl[t.dataset.tbl];
  const th = e.target.closest('[data-sort]'); if (th) { const i = +th.dataset.sort; st.dir = st.sort === i ? -st.dir : 1; st.sort = i; render(); return; }
  const pg = e.target.closest('[data-pg]'); if (pg) { st.page += +pg.dataset.pg; render(); }
});
const resetPage = id => { if (S.tbl[id]) S.tbl[id].page = 0; };

// ------------------------------------------------------------------ rutas
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const parts = h.split('/').filter(Boolean);
  if (!parts.length) return { v: 'planes' };
  if (parts[0] === 'nuevo') return { v: 'nuevo' };
  if (parts[0] === 'p') return { v: parts[2] || 'tablero', P: S.plans.find(p => p.id === parts[1]), a: parts[3], b: parts[4], c: parts[5] };
  return { v: 'planes' };
}
const go = h => { location.hash = h; };
window.addEventListener('hashchange', () => { S.wiz = S.wiz?.keep ? S.wiz : null; render(); window.scrollTo({ top: 0 }); });

// ------------------------------------------------------------------ barra lateral y barra de rol
function side(r) {
  const P = r.P, on = v => (r.v === v ? 'on' : '');
  const sub = P ? `<div class="sub">
    <a class="${on('tablero')}" href="#/p/${P.id}">Tablero del plan</a>
    <a class="${on('unidades')}" href="#/p/${P.id}/unidades">Catálogo de unidades</a>
    <a class="${on('insumos')}" href="#/p/${P.id}/insumos">Catálogo de insumos</a>
    <a class="${on('kits')}" href="#/p/${P.id}/kits">Kits</a>
    <a class="${on('asignacion') || on('asignar') || on('item')}" href="#/p/${P.id}/asignacion">Asignación de insumos</a>
    <a class="${on('programas')}" href="#/p/${P.id}/programas">Programas especiales</a>
    <a class="${on('aprobacion') || on('solicitar')}" href="#/p/${P.id}/aprobacion">Aprobación de insumos</a>
    <a class="${on('cierre')}" href="#/p/${P.id}/cierre">Cierre del plan</a>
    <a class="${on('simulacion')}" href="#/p/${P.id}/simulacion">Simulación del ciclo</a>
    <a class="${on('bitacora')}" href="#/p/${P.id}/bitacora">Bitácora</a></div>` : '';
  $('#side').innerHTML = `<h2>Sistema Integral de Abasto</h2>
    <a class="${!P && r.v !== 'nuevo' ? 'on' : P ? 'on' : ''}" href="#/">Planes de necesidad</a>${sub}
    <a href="contratos.html">Contrataciones <small>gemelo</small></a>
    <a href="index.html">Suministro y reposición <small>gemelo</small></a>
    <a href="cenadi.html">Entrega y recepción <small>gemelo</small></a>
    <a class="off" href="#">Pago a proveedores <small>pendiente</small></a>
    <a href="mapa.html">Manejo de inventario <small>gemelo</small></a>
    <a href="unidad.html">Salidas de unidades <small>gemelo</small></a>
    <a href="nacional.html">Monitoreo de KPI <small>gemelo</small></a>
    <a class="off" href="#">Gestión administrador <small>pendiente</small></a>`;
}
function myNotifs(P) {
  if (!P) return [];
  const to = { oc: ['oc', 'all'], del: ['del', 'all'], um: ['um', 'all'], firmante: ['firmante', 'all'], admin: ['all'] }[S.role];
  return P.notif.filter(n => to.includes(n.to) && (!n.ent || (S.role === 'um' ? n.ent.clues === S.clues : S.role === 'del' ? n.ent.cve === S.del : true)));
}
function rolebar(r) {
  const U = S.U;
  const dels = U.delegaciones.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const del = U.delBy[S.del];
  const units = del.units.map(i => U.units[i]).sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!S.clues || !units.some(u => u.clues === S.clues)) S.clues = units[0]?.clues;
  const N = myNotifs(r.P);
  const unseen = Math.max(0, N.length - (S.seenBy?.[S.role] || 0));
  $('#rolebar').innerHTML = `
    <label for="rb-role">Actuar como</label>
    <select id="rb-role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === S.role ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${S.role === 'del' || S.role === 'um' ? `<select id="rb-del" aria-label="Delegación">${dels.map(d => `<option value="${d.cve}" ${d.cve === S.del ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>` : ''}
    ${S.role === 'um' ? `<select id="rb-u" aria-label="Unidad médica">${units.map(u => `<option value="${u.clues}" ${u.clues === S.clues ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select>` : ''}
    <div style="position:relative;margin-left:auto"><button class="pl-bell" id="rb-bell" aria-label="Notificaciones"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z" fill="currentColor"/></svg>${unseen ? `<i>${unseen > 99 ? '99+' : unseen}</i>` : ''}</button></div>`;
  $('#rb-role').addEventListener('change', e => { S.role = e.target.value; render(); });
  $('#rb-del')?.addEventListener('change', e => { S.del = e.target.value; S.clues = null; render(); });
  $('#rb-u')?.addEventListener('change', e => { S.clues = e.target.value; render(); });
  $('#rb-bell').addEventListener('click', e => {
    const box = e.currentTarget.parentElement;
    const open = box.querySelector('.pl-notif'); if (open) { open.remove(); return; }
    const list = N.slice(-12).reverse();
    const d = document.createElement('div'); d.className = 'pl-notif';
    d.innerHTML = `<h4>Notificaciones · ${ROLES[S.role]}</h4>${list.length ? list.slice(0, Math.max(3, unseen)).map(n => `<p>${esc(n.txt)}<small>${r.P ? E.fmtDia(r.P, n.t) : ''}</small></p>`).join('') : '<p class="muted">Sin notificaciones.</p>'}<h4 style="margin-top:10px">Bitácora</h4>${list.slice(0, 3).map(n => `<p>${esc(n.txt)}</p>`).join('') || '<p class="muted">—</p>'}`;
    box.appendChild(d);
    (S.seenBy ||= {})[S.role] = N.length;
    e.currentTarget.querySelector('i')?.remove();
  });
}
function crumbs(items) { return `<nav class="pl-crumbs" aria-label="Ruta"><a href="#/">Home</a>${items.map(([t, h]) => `<span class="sep">›</span>${h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`}`).join('')}</nav>`; }
function simBar(P) {
  if (!P || !['validacion', 'finalizado'].includes(P.status)) return '';
  const k = E.kpis(S.U, P);
  return `<div class="pl-sim"><div class="grow"><b>Simulación del ciclo · día hábil ${P.day} (${E.fmtDia(P, P.day)})</b><div class="muted">${k.umDone} unidades, ${k.delDone} delegaciones y ${k.ocDone} revisiones de Oficina Central concluidas de ${k.units}. Los demás actores responden con las reglas del gemelo; tú puedes actuar como cualquiera.</div></div>
    <button class="btn sm" data-sim="1">+1 día</button><button class="btn sm" data-sim="5">+5 días</button><button class="btn sm pri" data-sim="99">Hasta el cierre</button><a class="btn sm ghost" href="#/p/${P.id}/simulacion">Ver indicadores</a></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sim]'); if (!b) return;
  const P = route().P; if (!P) return;
  const n = +b.dataset.sim;
  const ld = document.createElement('div'); ld.className = 'loading'; ld.style.background = 'rgba(13,17,23,.6)'; ld.textContent = 'Simulando las respuestas de unidades, delegaciones y Oficina Central…'; document.body.appendChild(ld);
  setTimeout(() => {
    let d = 0;
    if (n === 99) { while (P.status !== 'cerrado' && d < 90) { commit({ plan: P.id, a: 'sim', days: 1 }, { render: false }); d++; } }
    else { commit({ plan: P.id, a: 'sim', days: n }, { render: false }); d = n; }
    ld.remove(); render(); toast(`Simulación: +${d} día${d === 1 ? '' : 's'} hábiles · ${E.PLAN_ST[P.status]}`);
  }, 30);
});

// ------------------------------------------------------------------ vistas
function render() {
  const r = route();
  side(r); rolebar(r);
  const V = VIEWS[r.v] || VIEWS.planes;
  if (r.v !== 'planes' && r.v !== 'nuevo' && !r.P) { $('#view').innerHTML = '<div class="card"><p class="empty">El plan no existe. <a href="#/" style="color:var(--accent)">Regresar a la bandeja</a></p></div>'; return; }
  $('#view').innerHTML = V(r);
  BIND[r.v]?.(r);
}
const VIEWS = {}, BIND = {};

// ---------- Bandeja de planes (RF_C_01)
VIEWS.planes = () => {
  const f = S.f_planes ||= { q: '', etapa: '', status: '', tipo: '' };
  const rows = S.plans.filter(P => (!f.q || P.nombre.toLowerCase().includes(f.q.toLowerCase())) && (!f.etapa || P.etapa === f.etapa) && (!f.status || P.status === f.status) && (!f.tipo || P.tipo === f.tipo));
  const etapaN = id => E.ETAPAS.find(x => x.id === id)?.n || id;
  return `${crumbs([['Planes de necesidad']])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">Módulo 1 · Necesidades</span><h1>Planes de necesidades institucionales</h1><p>Consulta, busca y gestiona los planes. La planeación anual se arma con el catálogo de unidades e insumos, la asignación de Oficina Central y la aprobación de cada unidad y delegación.</p></div>
  <div class="pl-actions">${S.role === 'oc' ? `<a class="btn pri" href="#/nuevo">${S.plans.length ? 'Nuevo plan' : 'Crear plan'}</a>` : ''}<button class="btn" id="reset-all">Reiniciar ejemplo</button></div></div></section>
  <section class="card">
    <div class="pl-filters"><input type="search" id="fp-q" placeholder="Buscar por nombre" value="${esc(f.q)}">
      <select id="fp-etapa"><option value="">Etapa</option>${E.ETAPAS.map(x => `<option value="${x.id}" ${f.etapa === x.id ? 'selected' : ''}>${x.n}</option>`).join('')}</select>
      <select id="fp-status"><option value="">Estatus</option>${Object.entries(E.PLAN_ST).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="fp-tipo"><option value="">Tipo</option>${['Completo', 'Sin programas especiales', 'Solo programas especiales'].map(v => `<option ${f.tipo === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${S.plans.length ? table('planes', [
      { h: 'Nombre', v: P => P.nombre, f: P => `<b>${esc(P.nombre)}</b><br><small class="muted">${esc(P.folio)}</small>` },
      { h: 'Tipo de plan', v: P => P.tipo, opt: true },
      { h: 'Periodo de aplicación', v: P => P.periodicidad, opt: true },
      { h: 'Fecha inicio', v: P => P.inicio }, { h: 'Fecha fin', v: P => P.fin },
      { h: 'Etapa actual', v: P => etapaN(P.etapa) },
      { h: 'Estatus', v: P => E.PLAN_ST[P.status], f: P => chip(P.status, E.PLAN_ST[P.status]) },
      { h: 'Acciones', nosort: true, v: () => '', f: P => P.status === 'cancelado' ? `<button class="btn sm" data-motivo="${P.id}">Motivo de cancelación</button> <a class="btn sm" href="#/p/${P.id}">Consultar plan</a>` : `<a class="btn sm pri" href="#/p/${P.id}">Gestionar plan</a> ${S.role === 'oc' && !['cerrado', 'finalizado'].includes(P.status) ? `<button class="btn sm warn" data-cancel="${P.id}">Cancelar plan</button>` : ''}` },
    ], rows) : '<p class="empty">No hay ningún plan creado.</p>'}
  </section>`;
};
BIND.planes = () => {
  const f = S.f_planes;
  $('#fp-q').addEventListener('input', e => { f.q = e.target.value; resetPage('planes'); clearTimeout(S._t); S._t = setTimeout(render, 250); });
  for (const k of ['etapa', 'status', 'tipo']) $('#fp-' + k).addEventListener('change', e => { f[k] = e.target.value; resetPage('planes'); render(); });
  $('#reset-all').addEventListener('click', async () => {
    if (!await modal({ title: 'Reiniciar el ejemplo', text: 'Se borran los planes y acciones guardados en este navegador y se vuelve a cargar el plan anual 2027 de ejemplo.', ok: 'Reiniciar', danger: true })) return;
    S.entries = E.seedEntries(); saveEntries(); S.plans = E.replay(S.U, S.entries); S.seenBy = {}; go('#/'); render();
  });
  document.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    const P = S.plans.find(p => p.id === b.dataset.cancel);
    if (P.status === 'validacion' && P.items.size) { toast('El plan tiene asignaciones en aprobación: no se puede cancelar (dependencias críticas).', true); return; }
    const m = await modal({ title: '¿Cancelar este plan?', text: `${esc(P.nombre)} quedará cancelado (borrado lógico) y la acción se registra en la bitácora.`, ok: 'Cancelar plan', cancel: 'Salir', danger: true, input: { label: 'Motivo de la cancelación', required: true, min: 10 } });
    if (m) commit({ plan: P.id, a: 'cancelar', motivo: m }, { toast: 'Plan cancelado' });
  }));
  document.querySelectorAll('[data-motivo]').forEach(b => b.addEventListener('click', () => {
    const P = S.plans.find(p => p.id === b.dataset.motivo);
    modal({ title: 'Motivo de cancelación', text: `<b>Usuario:</b> ${esc(P.cancel.por)}<br><b>Fecha:</b> día ${P.cancel.t}<br><b>Motivo:</b> ${esc(P.cancel.motivo)}`, ok: 'Cerrar', cancel: 'Salir' });
  }));
};

// ---------- Nuevo plan: 5 pasos (RF_C_02 a RF_C_10)
const STEPS = ['Datos', 'Configuración de catálogos', 'Asignación de insumos', 'Programas especiales', 'Aprobación de insumos'];
VIEWS.nuevo = () => {
  if (S.role !== 'oc') return `${crumbs([['Planes de necesidad', '#/'], ['Nuevo plan']])}<div class="card"><p class="empty">Solo el Área central crea planes. Cambia el rol arriba.</p></div>`;
  const w = S.wiz ||= { keep: true, step: 0, nombre: '', periodicidad: 'Anual', tipo: 'Completo', inicio: '2027-01-04', fin: '2027-12-31', per: { catalogos: ['', ''], asignacion: ['', ''], programas: ['', ''], aprobacion: ['', ''] }, on: { catalogos: true, asignacion: true, programas: true, aprobacion: true }, resp: { catalogos: [], asignacion: [], programas: [], aprobacion: [] }, metodo: 'pronostico' };
  const keys = ['', 'catalogos', 'asignacion', 'programas', 'aprobacion'];
  const steps = w.tipo === 'Solo programas especiales' ? [0, 1, 3] : [0, 1, 2, 3, 4];
  const k = keys[w.step];
  const body = w.step === 0 ? `<div class="pl-form">
      <label class="full">Nombre del plan *<input id="w-nombre" maxlength="200" value="${esc(w.nombre)}" placeholder="Ej. Plan anual de necesidades 2028"></label>
      <label>Periodicidad *<select id="w-per"><option ${w.periodicidad === 'Anual' ? 'selected' : ''}>Anual</option><option ${w.periodicidad === 'Personalizado' ? 'selected' : ''}>Personalizado</option></select></label>
      <label>Tipo de plan *<select id="w-tipo">${['Completo', 'Sin programas especiales', 'Solo programas especiales'].map(v => `<option ${w.tipo === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Fecha inicio *<input type="date" id="w-ini" value="${w.inicio}"></label>
      <label>Fecha fin *<input type="date" id="w-fin" value="${w.fin}" ${w.periodicidad === 'Anual' ? 'readonly' : ''}></label>
      <label>Propuesta automática<select id="w-met">${Object.entries(E.METODOS).map(([kk, v]) => `<option value="${kk}" ${w.metodo === kk ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>`
    : `<div class="pl-form">
      <label class="full pl-switch"><input type="checkbox" id="w-on" class="chk" ${w.on[k] ? 'checked' : ''} ${k === 'programas' && w.tipo === 'Sin programas especiales' ? 'disabled' : ''}> ${k === 'programas' ? 'Periodo de captura de programas especiales (opcional)' : `Periodo de ${STEPS[w.step].toLowerCase()} y notificaciones`}</label>
      <label>Fecha inicio *<input type="date" id="w-pi" value="${w.per[k][0]}" min="${w.inicio}" max="${w.fin}" ${w.on[k] ? '' : 'disabled'}></label>
      <label>Fecha fin *<input type="date" id="w-pf" value="${w.per[k][1]}" min="${w.inicio}" max="${w.fin}" ${w.on[k] ? '' : 'disabled'}></label>
      <label class="full">Responsables (perfil Área central activos)<select id="w-resp" multiple size="4">${RESPONSABLES.map(x => `<option ${w.resp[k].includes(x) ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <p class="full muted" style="font-size:12px;margin:0">Las notificaciones salen por correo 3 días hábiles antes del inicio y del fin del periodo a los responsables elegidos.</p></div>`;
  const valid = validStep(w);
  return `${crumbs([['Planes de necesidad', '#/'], ['Nuevo plan']])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">Nuevo plan de necesidades institucional</span><h1>Paso ${steps.indexOf(w.step) + 1} de ${steps.length} · ${STEPS[w.step]}</h1></div><div class="pl-actions"><button class="btn ghost" id="w-exit">Salir</button></div></div>
  <div class="pl-wiz">${steps.map(i => `<span class="${i === w.step ? 'on' : steps.indexOf(i) < steps.indexOf(w.step) ? 'ok' : ''}">${steps.indexOf(i) + 1}. ${STEPS[i]}</span>`).join('')}</div>
  ${body}
  ${valid !== true ? `<p class="note" style="color:var(--warn)">${esc(valid)}</p>` : ''}
  <div class="pl-actions" style="justify-content:flex-end;margin-top:14px">${w.step ? '<button class="btn" id="w-back">Volver</button>' : ''}${w.step === steps.at(-1) ? `<button class="btn pri" id="w-save" ${valid === true ? '' : 'disabled'}>Guardar</button>` : `<button class="btn pri" id="w-next" ${valid === true ? '' : 'disabled'}>Siguiente</button>`}</div></section>`;
};
function validStep(w) {
  if (w.step === 0) {
    if (!w.nombre.trim()) return 'Captura el nombre del plan.';
    if (S.plans.some(p => p.nombre.toLowerCase() === w.nombre.trim().toLowerCase())) return 'El nombre del plan debe ser único (RN_04).';
    if (!w.inicio || !w.fin || w.fin <= w.inicio) return 'La fecha fin debe ser mayor a la fecha inicio (RN_29).';
    return true;
  }
  const k = ['', 'catalogos', 'asignacion', 'programas', 'aprobacion'][w.step];
  if (!w.on[k]) return true;
  const [a, b] = w.per[k];
  if (!a || !b) return 'Captura la fecha inicio y la fecha fin del periodo.';
  if (b <= a) return 'La fecha fin debe ser mayor a la fecha inicio.';
  if (a < w.inicio || b > w.fin) return 'Las fechas deben estar dentro del periodo de aplicación del plan.';
  return true;
}
BIND.nuevo = () => {
  const w = S.wiz; if (!w) return;
  const keys = ['', 'catalogos', 'asignacion', 'programas', 'aprobacion'];
  const steps = w.tipo === 'Solo programas especiales' ? [0, 1, 3] : [0, 1, 2, 3, 4];
  const upd = () => render();
  $('#w-exit').addEventListener('click', async () => { if (await modal({ title: '¿Salir sin guardar?', text: 'El plan no se registrará si abandonas la creación.', ok: 'Salir', danger: true })) { S.wiz = null; go('#/'); } });
  if (w.step === 0) {
    $('#w-nombre').addEventListener('input', e => { w.nombre = e.target.value; const v = validStep(w); const b = $('#w-next'); if (b) b.disabled = v !== true; });
    $('#w-nombre').addEventListener('change', upd);
    $('#w-per').addEventListener('change', e => { w.periodicidad = e.target.value; if (w.periodicidad === 'Anual' && w.inicio) { const d = new Date(w.inicio); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1); w.fin = d.toISOString().slice(0, 10); } upd(); });
    $('#w-tipo').addEventListener('change', e => { w.tipo = e.target.value; if (w.tipo === 'Sin programas especiales') w.on.programas = false; upd(); });
    $('#w-ini').addEventListener('change', e => { w.inicio = e.target.value; if (w.periodicidad === 'Anual') { const d = new Date(w.inicio); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1); w.fin = d.toISOString().slice(0, 10); } upd(); });
    $('#w-fin').addEventListener('change', e => { w.fin = e.target.value; upd(); });
    $('#w-met').addEventListener('change', e => { w.metodo = e.target.value; });
  } else {
    const k = keys[w.step];
    $('#w-on').addEventListener('change', e => { w.on[k] = e.target.checked; upd(); });
    $('#w-pi').addEventListener('change', e => { w.per[k][0] = e.target.value; upd(); });
    $('#w-pf').addEventListener('change', e => { w.per[k][1] = e.target.value; upd(); });
    $('#w-resp').addEventListener('change', e => { w.resp[k] = [...e.target.selectedOptions].map(o => o.value); });
  }
  $('#w-back')?.addEventListener('click', () => { w.step = steps[steps.indexOf(w.step) - 1]; upd(); });
  $('#w-next')?.addEventListener('click', () => { w.step = steps[steps.indexOf(w.step) + 1]; upd(); });
  $('#w-save')?.addEventListener('click', () => {
    const id = `PL_0${204 + S.plans.length}`;
    const periodos = Object.fromEntries(Object.keys(w.per).map(k => [k, w.on[k] ? w.per[k] : null]));
    commit({ a: 'nuevo', cfg: { id, nombre: w.nombre.trim(), periodicidad: w.periodicidad, tipo: w.tipo, inicio: w.inicio, fin: w.fin, periodos, metodo: w.metodo, resp: w.resp } }, { render: false });
    S.wiz = null; go('#/'); setTimeout(() => toast('Plan creado exitosamente'), 50);
  });
};

// ---------- Tablero del plan (RF_C_14, HU01 Sprint 2)
function stageState(P) {
  const order = ['catalogos', 'asignacion', 'aprobacion', 'cierre'];
  const cur = P.status === 'cerrado' ? 4 : P.status === 'finalizado' ? 3 : order.indexOf(P.etapa);
  return id => { const i = order.indexOf(id); return i < cur ? 'done' : i === cur ? 'doing' : 'todo'; };
}
VIEWS.tablero = ({ P }) => {
  const s = stageState(P), per = P.periodos || {};
  const pd = k => (per[k] ? `${per[k][0]} a ${per[k][1]}` : 'sin periodo');
  const k = P.items.size ? E.kpis(S.U, P) : null;
  const stage = (id, title, inner, dates) => `<div class="pl-stage ${s(id)}"><small>${esc(dates || '')}</small><b>${title}</b>${inner}</div>`;
  const cat = (done, name, href, enabled) => `<div class="row"><span>${done ? '✓ ' : ''}${name}</span>${enabled ? `<a href="${href}">Ir al catálogo</a>` : '<small>bloqueado</small>'}</div>`;
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio]])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)}</span><h1>${esc(P.nombre)}</h1><p>${esc(P.tipo)} · ${esc(P.periodicidad)} · ${P.inicio} a ${P.fin} · ${chip(P.status, E.PLAN_ST[P.status])}</p></div>
  <div class="pl-actions">${S.role === 'oc' && !['cerrado', 'cancelado'].includes(P.status) ? '<button class="btn" id="edit-cfg">Editar configuración inicial</button>' : ''}<a class="btn ghost" href="#/">Salir</a></div></div>
  <div class="pl-progress">${['catalogos', 'asignacion', 'aprobacion', 'cierre'].map(x => `<span class="${s(x)}"></span>`).join('')}</div></section>
  ${simBar(P)}
  <div class="pl-stages">
    ${stage('catalogos', 'Etapa 1 · Configuración de catálogos institucionales', cat(P.unitsDone, 'Catálogo de unidades', `#/p/${P.id}/unidades`, true) + cat(P.clavesDone, 'Catálogo de insumos', `#/p/${P.id}/insumos`, P.unitsDone) + cat(P.kitsDone, 'Kits', `#/p/${P.id}/kits`, P.clavesDone), pd('catalogos'))}
    ${stage('asignacion', 'Etapa 2 · Asignación de insumos', `<div class="row"><span>${n0([...P.items.values()].filter(x => x.months).length)} pares unidad-insumo</span><a href="#/p/${P.id}/asignacion">Asignación de insumos</a></div>`, pd('asignacion'))}
    <div class="pl-stage ${P.programas.length ? 'done' : 'todo'}"><small>${esc(pd('programas'))}</small><b>Etapa 3 · Programas especiales</b><div class="row"><span>${P.programas.length} programa${P.programas.length === 1 ? '' : 's'}</span><a href="#/p/${P.id}/programas">Programas especiales</a></div></div>
    ${stage('aprobacion', 'Etapa 4 · Aprobación de insumos', `<div class="row"><span>${k ? `${k.ocDone} de ${k.units} unidades autorizadas` : '—'}</span><a href="#/p/${P.id}/aprobacion">Aprobación de insumos</a></div>`, pd('aprobacion'))}
    ${stage('cierre', 'Cierre del plan', `<div class="row"><span>${P.cierre ? `Oficio: ${esc(P.cierre.archivo)}` : P.status === 'finalizado' ? 'Listo para el aprobador firmante' : 'Pendiente'}</span><a href="#/p/${P.id}/cierre">Cierre</a></div>`, '')}
  </div>
  ${k ? `<section class="kpis" style="--kc:6">${kpiCards(k).slice(0, 6).join('')}</section>` : ''}`;
};
BIND.tablero = ({ P }) => {
  $('#edit-cfg')?.addEventListener('click', async () => {
    const nombre = prompt2(); // modal sencillo con motivo
    async function prompt2() {
      const m = await modal({ title: 'Editar configuración inicial', text: 'Escribe el motivo del cambio. En este prototipo se puede extender la fecha fin del periodo de aprobación 10 días hábiles.', ok: 'Guardar cambios', input: { label: 'Motivo del cambio', required: true, min: 10 } });
      if (!m) return;
      const per = JSON.parse(JSON.stringify(P.periodos || {}));
      if (per.aprobacion) { const d = new Date(per.aprobacion[1]); d.setUTCDate(d.getUTCDate() + 14); per.aprobacion[1] = d.toISOString().slice(0, 10); }
      commit({ plan: P.id, a: 'editarConfig', cambios: { periodos: per }, motivo: m }, { toast: 'Configuración actualizada' });
    }
  });
};
function kpiCards(k) {
  const c = (n, v, u, s, sem) => `<div class="kpi ${sem || ''}"><span>${n}</span><b>${v}${u ? `<i>${u}</i>` : ''}</b><small><i class="dot"></i>${s}</small></div>`;
  return [
    c('Unidades autorizadas por Oficina Central', n0(k.ocDone), `de ${n0(k.units)}`, `${k.umDone} verificadas por la unidad`, k.ocDone === k.units ? 'ok' : 'warn'),
    c('Pares unidad-insumo aprobados', pct(k.n ? k.aprob / k.n : 0), '', `${n0(k.aprob)} de ${n0(k.n)}`, k.aprob === k.n ? 'ok' : ''),
    c('En negociación', n0(k.neg), '', `${n0(k.rech)} rechazados · ${n0(k.pend)} pendientes`, k.neg ? 'warn' : 'ok'),
    c('Aprobados a la primera', pct(k.first), '', `${f1(k.rounds)} rondas promedio por insumo`, k.first > 0.6 ? 'ok' : 'warn'),
    c('Costo del plan', money(k.costo), '', `pronóstico ${money(k.costo0)} (${k.costo0 ? (k.costo / k.costo0 - 1 >= 0 ? '+' : '') + pct(k.costo / k.costo0 - 1) : '—'})`, k.costo <= k.costo0 * 1.05 ? 'ok' : 'warn'),
    c('Error contra la necesidad real', pct(k.wape, 1), '', 'WAPE de piezas, solo en el gemelo', k.wape < 0.12 ? 'ok' : 'warn'),
    c('Sobreasignado', money(k.over), '', 'piezas arriba de la necesidad real', k.over > k.under * 3 ? 'warn' : ''),
    c('Faltante', money(k.under), '', 'piezas abajo de la necesidad real', k.under > 0.05 * k.costo ? 'crit' : ''),
  ];
}

// ---------- Catálogo de unidades (RF_C_16 a RF_C_19)
VIEWS.unidades = ({ P }) => {
  const U = S.U, f = S.f_uni ||= { q: '', nivel: '', tipo: '', edo: '', dentro: 'dentro' };
  const edit = S.role === 'oc' && P.etapa === 'catalogos' && !P.unitsDone;
  const rows = U.units.filter(u => (f.dentro === 'dentro' ? !P.unitsOut.has(u.clues) : P.unitsOut.has(u.clues)) && (!f.q || (u.clues + ' ' + u.nombre).toLowerCase().includes(f.q.toLowerCase())) && (!f.nivel || u.nivel === +f.nivel) && (!f.tipo || u.tipo === f.tipo) && (!f.edo || u.cve === f.edo));
  S._uniRows = rows;
  const sel = S.selUni ||= new Set();
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Catálogo de unidades']])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Etapa 1</span><h1>Catálogo institucional de unidades</h1><p>Selecciona las unidades que serán abastecidas en este plan. Quitar una unidad no afecta el catálogo nacional (RN_08).</p></div>
  <div class="pl-actions">${P.unitsDone ? chip('finalizado', 'Configuración finalizada') : ''}<button class="btn" id="u-xls">Descargar</button>${edit ? `<button class="btn" id="u-pers">${S.persUni ? 'Cancelar' : 'Personalizar catálogo'}</button><button class="btn pri" id="u-fin">Finalizar la configuración</button>` : ''}${S.role === 'oc' && P.unitsDone && P.etapa === 'catalogos' ? '<button class="btn warn" id="u-unfin">Cancelar finalización</button>' : ''}</div></div></section>
  <section class="card"><div class="pl-filters"><input type="search" id="fu-q" placeholder="Clave o nombre de la unidad" value="${esc(f.q)}">
    <select id="fu-nivel"><option value="">Nivel de atención</option><option value="1" ${f.nivel === '1' ? 'selected' : ''}>1er nivel</option><option value="2" ${f.nivel === '2' ? 'selected' : ''}>2º nivel</option><option value="3" ${f.nivel === '3' ? 'selected' : ''}>3er nivel</option></select>
    <select id="fu-tipo"><option value="">Tipología</option>${Object.keys(E.PESO).map(t => `<option ${f.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select id="fu-edo"><option value="">Estado</option>${U.delegaciones.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(d => `<option value="${d.cve}" ${f.edo === d.cve ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>
    <select id="fu-dentro"><option value="dentro" ${f.dentro === 'dentro' ? 'selected' : ''}>Dentro del plan</option><option value="fuera" ${f.dentro === 'fuera' ? 'selected' : ''}>Fuera del plan</option></select></div>
  ${table('uni', [
    ...(S.persUni ? [{ h: '', nosort: true, v: () => '', f: u => `<input type="checkbox" class="chk" data-su="${u.clues}" ${sel.has(u.clues) ? 'checked' : ''}>` }] : []),
    { h: 'CLUES', v: u => u.clues, cls: 'cl' }, { h: 'Nombre', v: u => u.nombre }, { h: 'Tipología', v: u => u.tipo },
    { h: 'Estado', v: u => U.delBy[u.cve].nombre, opt: true }, { h: 'Nivel', v: u => u.nivel, n: true }, { h: 'Estatus', v: () => 'Activa', f: () => chip('aprobado', 'Activa'), opt: true },
  ], rows)}
  ${S.persUni ? `<div class="pl-actions" style="justify-content:flex-end;margin-top:10px"><span class="muted" style="font-size:12px">${sel.size} seleccionadas</span><button class="btn" id="u-cancel">Cancelar</button><button class="btn ${f.dentro === 'dentro' ? 'warn' : 'pri'}" id="u-apply" ${sel.size ? '' : 'disabled'}>${f.dentro === 'dentro' ? 'Quitar de la lista' : 'Regresar a la lista'}</button></div>` : ''}
  </section>`;
};
BIND.unidades = ({ P }) => {
  const f = S.f_uni;
  $('#fu-q').addEventListener('input', e => { f.q = e.target.value; resetPage('uni'); clearTimeout(S._t); S._t = setTimeout(render, 250); });
  for (const k of ['nivel', 'tipo', 'edo', 'dentro']) $('#fu-' + k).addEventListener('change', e => { f[k] = e.target.value; resetPage('uni'); S.selUni = new Set(); render(); });
  document.querySelectorAll('[data-su]').forEach(c => c.addEventListener('change', e => { e.target.checked ? S.selUni.add(e.target.dataset.su) : S.selUni.delete(e.target.dataset.su); render(); }));
  $('#u-pers')?.addEventListener('click', () => { S.persUni = !S.persUni; S.selUni = new Set(); render(); });
  $('#u-cancel')?.addEventListener('click', () => { S.persUni = false; S.selUni = new Set(); render(); });
  $('#u-apply')?.addEventListener('click', async () => {
    const quitar = f.dentro === 'dentro';
    if (!await modal({ title: quitar ? 'Excluir unidades del plan' : 'Regresar unidades al plan', text: quitar ? 'Estás seguro de querer excluir estas unidades del catálogo de este plan. ¿Deseas continuar?' : 'Las unidades seleccionadas se integrarán de nuevo al catálogo del plan.', ok: 'Confirmar' })) return;
    commit({ plan: P.id, a: quitar ? 'quitarUnidades' : 'regresarUnidades', clues: [...S.selUni] }, { toast: 'Catálogo actualizado exitosamente. Usa los filtros para regresar los elementos a la lista.' });
    S.selUni = new Set(); S.persUni = false; render();
  });
  $('#u-fin')?.addEventListener('click', () => { S.persUni = false; commit({ plan: P.id, a: 'finalizarUnidades' }, { toast: 'Catálogo de unidades finalizado' }); });
  $('#u-unfin')?.addEventListener('click', async () => { if (await modal({ title: '¿Cancelar la finalización?', text: '¿Estás seguro de querer cancelar la finalización de la configuración del catálogo de CLUES de este plan?', ok: 'Cancelar finalización', cancel: 'Salir', danger: true })) commit({ plan: P.id, a: 'cancelarUnidades' }); });
  $('#u-xls').addEventListener('click', () => download(`${P.id}_catalogo_unidades.csv`, [['CLUES', 'Nombre', 'Tipologia', 'Estado', 'Nivel', 'Dentro del plan'], ...S._uniRows.map(u => [u.clues, u.nombre, u.tipo, S.U.delBy[u.cve].nombre, u.nivel, P.unitsOut.has(u.clues) ? 'No' : 'Sí'])]));
};

// ---------- Catálogo de insumos (RF_C_20 a RF_C_23)
VIEWS.insumos = ({ P }) => {
  const U = S.U, f = S.f_ins ||= { q: '', grupo: '', dentro: 'dentro', tab: 'Medicamento' };
  const edit = S.role === 'oc' && P.etapa === 'catalogos' && P.unitsDone && !P.clavesDone;
  const grupos = [...new Set(U.claves.map(c => c.grupo))].sort();
  const rows = U.claves.filter(c => c.tipo === f.tab && (f.dentro === 'dentro' ? !P.clavesOut.has(c.clave) : P.clavesOut.has(c.clave)) && (!f.q || (c.clave + ' ' + c.nombre).toLowerCase().includes(f.q.toLowerCase())) && (!f.grupo || c.grupo === f.grupo));
  const sel = S.selIns ||= new Set();
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Catálogo de insumos']])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Etapa 1 · Configuración de inventarios</span><h1>Catálogo institucional de insumos</h1><p>Claves del Compendio Nacional de Insumos para la Salud que usa el gemelo. Quita las que no formarán parte del plan; se pueden recuperar mientras el plan esté vigente (RN_11).</p></div>
  <div class="pl-actions">${P.clavesDone ? chip('finalizado', 'Configuración finalizada') : ''}<button class="btn" id="i-xls">Descargar formato</button>${edit ? `<button class="btn" id="i-pers">${S.persIns ? 'Cancelar' : 'Personalizar catálogo'}</button><button class="btn pri" id="i-fin">Finalizar la configuración</button>` : ''}${S.role === 'oc' && P.clavesDone && P.etapa === 'catalogos' ? '<button class="btn warn" id="i-unfin">Cancelar finalización</button>' : ''}</div></div></section>
  <section class="card"><div class="seg" id="i-tab" style="margin-bottom:12px;width:max-content"><button data-t="Medicamento" class="${f.tab === 'Medicamento' ? 'active' : ''}">Medicamentos</button><button data-t="Material" class="${f.tab === 'Material' ? 'active' : ''}">Material de curación</button></div>
  <div class="pl-filters"><input type="search" id="fi-q" placeholder="Clave o nombre del insumo" value="${esc(f.q)}">
    <select id="fi-grupo"><option value="">Grupo</option>${grupos.map(g => `<option ${f.grupo === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
    <select id="fi-dentro"><option value="dentro" ${f.dentro === 'dentro' ? 'selected' : ''}>Dentro del plan</option><option value="fuera" ${f.dentro === 'fuera' ? 'selected' : ''}>Descartados</option></select></div>
  ${f.tab === 'Material' ? '<p class="empty">El catálogo del gemelo todavía no incluye material de curación. Se carga con el catálogo institucional de la dependencia.</p>' : table('ins', [
    ...(S.persIns ? [{ h: '', nosort: true, v: () => '', f: c => `<input type="checkbox" class="chk" data-si="${c.clave}" ${sel.has(c.clave) ? 'checked' : ''}>` }] : []),
    { h: 'Clave', v: c => c.clave, cls: 'cl' }, { h: 'Insumo', v: c => c.nombre, f: c => `${esc(c.nombre)}${c.frio ? ' <small class="muted">· red fría</small>' : ''}` }, { h: 'Grupo', v: c => c.grupo },
    { h: 'Uso', v: c => (c.uso === 'F' ? 'Farmacia' : 'Quirófano / hospital'), opt: true }, { h: 'VEN', v: c => c.ven, opt: true },
    { h: 'Acciones', nosort: true, v: () => '', f: c => `<button class="btn sm" data-det="${c.clave}">Ver detalle</button>` },
  ], rows)}
  ${S.persIns ? `<div class="pl-actions" style="justify-content:flex-end;margin-top:10px"><span class="muted" style="font-size:12px">${sel.size} seleccionados</span><button class="btn" id="i-cancel">Cancelar</button><button class="btn ${f.dentro === 'dentro' ? 'warn' : 'pri'}" id="i-apply" ${sel.size ? '' : 'disabled'}>${f.dentro === 'dentro' ? 'Quitar de la lista' : 'Regresar a la lista'}</button></div>` : ''}
  </section>`;
};
BIND.insumos = ({ P }) => {
  const f = S.f_ins;
  $('#i-tab').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { f.tab = b.dataset.t; render(); } });
  $('#fi-q').addEventListener('input', e => { f.q = e.target.value; resetPage('ins'); clearTimeout(S._t); S._t = setTimeout(render, 250); });
  for (const k of ['grupo', 'dentro']) $('#fi-' + k).addEventListener('change', e => { f[k] = e.target.value; resetPage('ins'); S.selIns = new Set(); render(); });
  document.querySelectorAll('[data-si]').forEach(c => c.addEventListener('change', e => { e.target.checked ? S.selIns.add(e.target.dataset.si) : S.selIns.delete(e.target.dataset.si); render(); }));
  document.querySelectorAll('[data-det]').forEach(b => b.addEventListener('click', () => detalleClave(b.dataset.det)));
  $('#i-pers')?.addEventListener('click', () => { S.persIns = !S.persIns; S.selIns = new Set(); render(); });
  $('#i-cancel')?.addEventListener('click', () => { S.persIns = false; S.selIns = new Set(); render(); });
  $('#i-apply')?.addEventListener('click', async () => {
    const quitar = f.dentro === 'dentro';
    if (!await modal({ title: quitar ? 'Excluir insumos del plan' : 'Regresar insumos al plan', text: quitar ? 'Estás seguro de querer excluir esos insumos del catálogo de este plan.' : 'Los insumos seleccionados regresan al catálogo del plan.', ok: 'Continuar', cancel: 'Salir' })) return;
    commit({ plan: P.id, a: quitar ? 'quitarClaves' : 'regresarClaves', claves: [...S.selIns] }, { toast: 'Catálogo se guardó exitosamente. Usa los filtros para regresar los elementos a la lista.' });
    S.selIns = new Set(); S.persIns = false; render();
  });
  $('#i-fin')?.addEventListener('click', () => { S.persIns = false; commit({ plan: P.id, a: 'finalizarClaves' }, { toast: 'Catálogo de insumos finalizado' }); });
  $('#i-unfin')?.addEventListener('click', async () => { if (await modal({ title: '¿Cancelar la finalización?', text: '¿Estás seguro de querer cancelar la finalización de la configuración del catálogo de insumos de este plan?', ok: 'Cancelar finalización', cancel: 'Salir', danger: true })) commit({ plan: P.id, a: 'cancelarClaves' }); });
  $('#i-xls').addEventListener('click', () => download(`${P.id}_catalogo_insumos.csv`, [['Clave', 'Insumo', 'Descripción', 'Grupo', 'Uso', 'VEN', 'Red fría', 'Dentro del plan'], ...S.U.claves.map(c => [c.clave, c.nombre, c.desc, c.grupo, c.uso === 'F' ? 'Farmacia' : 'Quirófano', c.ven, c.frio ? 'Sí' : 'No', P.clavesOut.has(c.clave) ? 'No' : 'Sí'])]));
};
function detalleClave(clave) {
  const c = S.U.claves.find(x => x.clave === clave);
  modal({ title: c.nombre, text: `<b>Clave:</b> ${esc(c.clave)}<br><b>Descripción:</b> ${esc(c.desc)}<br><b>Grupo terapéutico:</b> ${esc(c.grupo)}<br><b>Presentación de despacho:</b> ${esc(c.pz)}${c.pack > 1 ? ` (envase de ${c.pack})` : ''}<br><b>Clasificación VEN:</b> ${esc(c.ven)}${c.frio ? '<br><b>Red fría:</b> 2 a 8 °C' : ''}<br><b>Precio de referencia (supuesto):</b> $${n0(c.precio)} por pieza`, ok: 'Cerrar', cancel: 'Salir' });
}

// ---------- Kits (RF_C_24, RF_C_25)
VIEWS.kits = ({ P }) => {
  const edit = S.role === 'oc' && P.etapa === 'catalogos' && P.clavesDone && !P.kitsDone;
  const w = S.kitw;
  if (w) {
    const U = S.U, used = new Set(P.kits.flatMap(k => k.claves));
    const avail = E.clavesIn(U, P).filter(c => !used.has(c.clave) && (!w.q || (c.clave + ' ' + c.nombre).toLowerCase().includes(w.q.toLowerCase())));
    return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Kits', `#/p/${P.id}/kits`], ['Nuevo kit']])}
    <section class="card"><div class="pl-wiz"><span class="${w.step === 0 ? 'on' : 'ok'}">1. Datos del kit</span><span class="${w.step === 1 ? 'on' : ''}">2. Selección de insumos</span><span>3. Confirmación</span></div>
    ${w.step === 0 ? `<div class="pl-form"><label>Nombre del kit *<input id="k-n" value="${esc(w.nombre)}"></label><label>Tipología *<select id="k-t">${['Todas', 'CAF', 'UMF', 'CMF', 'CE', 'CH', 'HG', 'HR', 'Sin tipología'].map(t => `<option ${w.tipologia === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Nivel de atención *<select id="k-l">${['1er nivel', '2º nivel', '3er nivel', 'Todos'].map(t => `<option ${w.nivel === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="full">Descripción<textarea id="k-d">${esc(w.desc)}</textarea></label></div>
      <div class="pl-actions" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="k-x">Cancelar</button><button class="btn pri" id="k-next" ${w.nombre.trim() ? '' : 'disabled'}>Siguiente</button></div>`
    : `<div class="pl-filters"><input type="search" id="k-q" placeholder="Clave o nombre" value="${esc(w.q || '')}"><span class="muted" style="font-size:12px">${w.sel.size} de ${avail.length} insumos seleccionados</span></div>
      ${table('kitins', [{ h: '', nosort: true, v: () => '', f: c => `<input type="checkbox" class="chk" data-ki="${c.clave}" ${w.sel.has(c.clave) ? 'checked' : ''}>` }, { h: 'Clave', v: c => c.clave, cls: 'cl' }, { h: 'Insumo', v: c => c.nombre }, { h: 'Grupo', v: c => c.grupo }], avail)}
      <div class="pl-actions" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="k-back">Volver</button><button class="btn pri" id="k-save" ${w.sel.size ? '' : 'disabled'}>Guardar</button></div>`}</section>`;
  }
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Kits']])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Etapa 1</span><h1>Catálogo de kits</h1><p>Crea los kits de insumos que se utilizarán en este plan. Un insumo queda en un solo kit mientras el kit esté activo.</p></div>
  <div class="pl-actions">${P.kitsDone ? chip('finalizado', 'Etapa 1 concluida') : ''}${edit ? '<button class="btn" id="k-new">Crear nuevo kit</button><button class="btn pri" id="k-done">Concluir etapa 1</button>' : ''}</div></div></section>
  <section class="card"><div class="pl-cards">${P.kits.map(k => `<div class="pl-card"><small class="muted">${esc(k.id)} · ${esc(k.tipologia)} · ${esc(k.nivel)}</small><b>${esc(k.nombre)}</b><span class="muted">${esc(k.desc)}</span><span>${k.claves.map(cl => esc(S.U.claves.find(c => c.clave === cl)?.nombre || cl)).join(' · ')}</span></div>`).join('') || '<p class="empty">Sin kits en este plan.</p>'}</div></section>`;
};
BIND.kits = ({ P }) => {
  $('#k-new')?.addEventListener('click', () => { S.kitw = { step: 0, nombre: '', tipologia: 'Todas', nivel: '1er nivel', desc: '', sel: new Set() }; render(); });
  $('#k-done')?.addEventListener('click', () => commit({ plan: P.id, a: 'finalizarKits' }, { toast: 'Catálogos institucionales configurados: inicia la asignación' }));
  const w = S.kitw; if (!w) return;
  $('#k-n')?.addEventListener('input', e => { w.nombre = e.target.value; $('#k-next').disabled = !w.nombre.trim(); });
  $('#k-t')?.addEventListener('change', e => { w.tipologia = e.target.value; });
  $('#k-l')?.addEventListener('change', e => { w.nivel = e.target.value; });
  $('#k-d')?.addEventListener('input', e => { w.desc = e.target.value; });
  $('#k-x')?.addEventListener('click', () => { S.kitw = null; render(); });
  $('#k-next')?.addEventListener('click', () => { w.step = 1; render(); });
  $('#k-back')?.addEventListener('click', () => { w.step = 0; render(); });
  $('#k-q')?.addEventListener('input', e => { w.q = e.target.value; clearTimeout(S._t); S._t = setTimeout(render, 250); });
  document.querySelectorAll('[data-ki]').forEach(c => c.addEventListener('change', e => { e.target.checked ? w.sel.add(e.target.dataset.ki) : w.sel.delete(e.target.dataset.ki); render(); }));
  $('#k-save')?.addEventListener('click', async () => {
    if (!await modal({ title: `¿Crear el kit ${w.nombre}?`, text: 'Los insumos que se incluyan en este kit quedarán asociados de forma exclusiva y no podrán ser incluidos en otros kits, mientras este se mantenga activo.', ok: 'Confirmar creación' })) return;
    if (tryCommit({ plan: P.id, a: 'crearKit', nombre: w.nombre.trim(), desc: w.desc, tipologia: w.tipologia, nivel: w.nivel, claves: [...w.sel] }, { render: false, toast: 'Catálogo de kits fue cargado exitosamente' })) { S.kitw = null; render(); }
  });
};

// ---------- Asignación de insumos (Sprint 2)
function unitRow(P, u) {
  const L = E.unitItems(P, u.clues);
  return { u, asig: L.filter(([, it]) => it.months).length, val: L.filter(([, it]) => it.asig === 'confirmado' || it.asig === 'finalizado').length, st: E.unitAsigStatus(P, u.clues) };
}
VIEWS.asignacion = ({ P, a, b }) => {
  const U = S.U;
  const editable = S.role === 'oc' && P.etapa === 'asignacion';
  const head = (title, sub, back) => `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Asignación de insumos', back ? `#/p/${P.id}/asignacion` : null], ...(back ? [[title]] : [])])}
    <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Etapa 2</span><h1>${esc(title)}</h1><p>${sub}</p></div>
    <div class="pl-actions">${editable ? `<button class="btn" id="as-auto">Asignación automática</button><label class="btn" style="cursor:pointer">Carga de insumos<input type="file" id="as-csv" accept=".csv" hidden></label><a class="btn" href="#/p/${P.id}/asignar">Asignar insumos</a><button class="btn pri" id="as-fin">Finalizar asignación</button>` : `${chip(P.etapa === 'asignacion' ? 'proceso' : 'finalizado', P.etapa === 'asignacion' ? 'En proceso' : 'Asignación finalizada')}`}<button class="btn" id="as-tpl">Descargar plantilla</button></div></div></section>`;
  if (a === 'u') {
    const u = U.units.find(x => x.clues === b);
    const f = S.f_au ||= { q: '', st: '' };
    const rows = E.unitItems(P, u.clues).map(([k, it]) => ({ k, it, c: U.claves[it.k] })).filter(r => (!f.q || (r.c.clave + ' ' + r.c.nombre).toLowerCase().includes(f.q.toLowerCase())) && (!f.st || (r.it.months ? r.it.asig : 'pendiente') === f.st));
    return head(u.nombre, `${esc(u.clues)} · ${esc(u.tipo)} · ${esc(U.delBy[u.cve].nombre)} · insumos asignados a la unidad. Origen: kit o fuera de kit.`, true) + `<section class="card">
      <div class="pl-filters"><input type="search" id="fa-q" placeholder="Nombre del insumo" value="${esc(f.q)}"><select id="fa-st"><option value="">Estatus</option>${Object.entries(E.ASIG_ST).filter(([k]) => k !== 'sin').map(([k, v]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${v}</option>`).join('')}</select><a class="btn sm" href="#/p/${P.id}/asignacion/del/${u.cve}">Regresar a la delegación</a></div>
      ${table('au', [
        { h: 'Clave', v: r => r.c.clave, cls: 'cl' }, { h: 'Insumo', v: r => r.c.nombre }, { h: 'Grupo', v: r => r.c.grupo, opt: true }, { h: 'Origen', v: r => r.it.origin, opt: true },
        { h: 'Piezas', n: true, v: r => (r.it.months ? E.total(r.it) : -1), f: r => (r.it.months ? `<span class="${E.outOfRange(r.it) ? 'oor' : ''}">${n0(E.total(r.it))}</span>` : '<span class="muted">Sin asignar</span>') },
        { h: 'Mín · máx', n: true, opt: true, v: r => r.it.min || 0, f: r => (r.it.months ? `${n0(r.it.min)} · ${n0(r.it.max)}` : '—') },
        { h: 'Estatus', v: r => (r.it.months ? E.ASIG_ST[r.it.asig] : 'Pendiente'), f: r => chip(r.it.months ? r.it.asig : 'pendiente', r.it.months ? E.ASIG_ST[r.it.asig] : 'Pendiente') },
        { h: 'Acciones', nosort: true, v: () => '', f: r => `${editable ? `<a class="btn sm" href="#/p/${P.id}/item/${encodeURIComponent(r.k)}">${r.it.months ? 'Editar piezas' : 'Asignar piezas'}</a>` : ''} <a class="btn sm" href="#/p/${P.id}/aprobacion/i/${encodeURIComponent(r.k)}">Ver detalle</a>` },
      ], rows)}</section>`;
  }
  if (a === 'del') {
    const d = U.delBy[b];
    const f = S.f_ad ||= { q: '', st: '' };
    const rows = d.units.map(i => U.units[i]).filter(u => !P.unitsOut.has(u.clues)).map(u => unitRow(P, u)).filter(r => (!f.q || (r.u.clues + ' ' + r.u.nombre).toLowerCase().includes(f.q.toLowerCase())) && (!f.st || r.st === f.st));
    return head(`Delegación ${d.nombre}`, `${rows.length} unidades médicas de la oficina de representación.`, true) + `<section class="card">
      <div class="pl-filters"><input type="search" id="fd-q" placeholder="Nombre o CLUES" value="${esc(f.q)}"><select id="fd-st"><option value="">Estatus</option>${Object.entries(E.ASIG_ST).map(([k, v]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${v}</option>`).join('')}</select><a class="btn sm" href="#/p/${P.id}/asignacion">Regresar a central</a></div>
      ${table('ad', [{ h: 'Unidad', v: r => r.u.nombre }, { h: 'CLUES', v: r => r.u.clues, cls: 'cl' }, { h: 'Responsable', v: r => r.u.responsable, opt: true }, { h: 'Insumos asignados', n: true, v: r => r.asig }, { h: 'Insumos validados', n: true, v: r => r.val }, { h: 'Estatus', v: r => E.ASIG_ST[r.st], f: r => chip(r.st, E.ASIG_ST[r.st]) }, { h: 'Acciones', nosort: true, v: () => '', f: r => `<a class="btn sm" href="#/p/${P.id}/asignacion/u/${r.u.clues}">Ver unidad</a>` }], rows)}</section>`;
  }
  const f = S.f_as ||= { ver: 'del', q: '' };
  let body;
  if (f.ver === 'del') {
    const rows = U.delegaciones.map(d => {
      const us = d.units.map(i => U.units[i]).filter(u => !P.unitsOut.has(u.clues));
      const R = us.map(u => unitRow(P, u));
      const claves = new Set(); us.forEach(u => E.unitItems(P, u.clues).forEach(([, it]) => it.months && claves.add(it.k)));
      return { d, val: R.filter(r => ['confirmado', 'finalizado'].includes(r.st)).length, pend: R.filter(r => !['confirmado', 'finalizado'].includes(r.st)).length, claves: claves.size, st: R.every(r => r.st === 'finalizado') ? 'finalizado' : R.every(r => ['confirmado', 'finalizado'].includes(r.st)) ? 'confirmado' : R.some(r => r.asig) ? 'porconfirmar' : 'sin' };
    }).filter(r => !f.q || (r.d.nombre + ' ' + r.d.responsable).toLowerCase().includes(f.q.toLowerCase()));
    body = table('asdel', [{ h: 'Delegación', v: r => r.d.nombre }, { h: 'Responsable', v: r => r.d.responsable, opt: true }, { h: 'Unidades validadas', n: true, v: r => r.val }, { h: 'Unidades pendientes', n: true, v: r => r.pend }, { h: 'Claves asignadas', n: true, v: r => r.claves }, { h: 'Estatus', v: r => E.ASIG_ST[r.st], f: r => chip(r.st, E.ASIG_ST[r.st]) }, { h: 'Acciones', nosort: true, v: () => '', f: r => `<a class="btn sm" href="#/p/${P.id}/asignacion/del/${r.d.cve}">Ver unidades</a>` }], rows);
  } else if (f.ver === 'uni') {
    const rows = E.unitsIn(U, P).filter(u => !f.q || (u.clues + ' ' + u.nombre).toLowerCase().includes(f.q.toLowerCase())).map(u => unitRow(P, u));
    body = table('asuni', [{ h: 'Unidad', v: r => r.u.nombre }, { h: 'CLUES', v: r => r.u.clues, cls: 'cl' }, { h: 'Responsable', v: r => r.u.responsable, opt: true }, { h: 'Insumos asignados', n: true, v: r => r.asig }, { h: 'Insumos validados', n: true, v: r => r.val }, { h: 'Estatus', v: r => E.ASIG_ST[r.st], f: r => chip(r.st, E.ASIG_ST[r.st]) }, { h: 'Acciones', nosort: true, v: () => '', f: r => `<a class="btn sm" href="#/p/${P.id}/asignacion/u/${r.u.clues}">Ver insumos</a>` }], rows);
  } else {
    const agg = new Map();
    for (const it of P.items.values()) { if (!it.months) continue; const a2 = agg.get(it.k) || { piezas: 0, units: 0, dels: new Set() }; a2.piezas += E.total(it); a2.units++; a2.dels.add(U.units[it.u].cve); agg.set(it.k, a2); }
    const rows = [...agg].map(([k, v]) => ({ c: U.claves[k], ...v })).filter(r => !f.q || (r.c.clave + ' ' + r.c.nombre).toLowerCase().includes(f.q.toLowerCase()));
    body = table('asins', [{ h: 'Clave', v: r => r.c.clave, cls: 'cl' }, { h: 'Insumo', v: r => r.c.nombre }, { h: 'Grupo', v: r => r.c.grupo, opt: true }, { h: 'Piezas asignadas', n: true, v: r => r.piezas, f: r => n0(r.piezas) }, { h: 'Unidades asignadas', n: true, v: r => r.units }, { h: 'Delegaciones asignadas', n: true, v: r => r.dels.size }], rows);
  }
  return head('Asignación de insumos', 'Vista consolidada del plan por oficina de representación, unidades e insumos.', false) + `<section class="card">
    <div class="pl-filters"><div class="seg" id="as-ver"><button data-v="del" class="${f.ver === 'del' ? 'active' : ''}">Delegación</button><button data-v="uni" class="${f.ver === 'uni' ? 'active' : ''}">Unidades</button><button data-v="ins" class="${f.ver === 'ins' ? 'active' : ''}">Insumos</button></div><input type="search" id="fs-q" placeholder="${f.ver === 'del' ? 'Delegación o responsable' : f.ver === 'uni' ? 'Unidad o CLUES' : 'Insumo o clave'}" value="${esc(f.q)}"></div>${body}</section>`;
};
BIND.asignacion = ({ P, a }) => {
  const bindQ = (id, obj, key, tbl) => $(id)?.addEventListener('input', e => { obj[key] = e.target.value; resetPage(tbl); clearTimeout(S._t); S._t = setTimeout(render, 250); });
  if (!a) {
    $('#as-ver').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.f_as.ver = b.dataset.v; S.f_as.q = ''; render(); } });
    bindQ('#fs-q', S.f_as, 'q', S.f_as.ver === 'del' ? 'asdel' : S.f_as.ver === 'uni' ? 'asuni' : 'asins');
  }
  if (a === 'del') { bindQ('#fd-q', S.f_ad, 'q', 'ad'); $('#fd-st').addEventListener('change', e => { S.f_ad.st = e.target.value; render(); }); }
  if (a === 'u') { bindQ('#fa-q', S.f_au, 'q', 'au'); $('#fa-st').addEventListener('change', e => { S.f_au.st = e.target.value; render(); }); }
  $('#as-auto')?.addEventListener('click', async () => {
    const ok = await modal({ title: 'Asignación automática por pronóstico', text: `Asigna a cada unidad del plan las claves de su nivel con la propuesta mínima, máxima y el reparto mensual de ${esc(E.METODOS[P.metodo])}. Lo ya asignado no cambia.`, ok: 'Asignar' });
    if (ok) { const ld = loading('Calculando el pronóstico de cada unidad e insumo…'); setTimeout(() => { commit({ plan: P.id, a: 'asignarAuto', metodo: P.metodo }, { toast: 'Asignación automática terminada' }); ld.remove(); }, 30); }
  });
  $('#as-fin')?.addEventListener('click', async () => {
    const pend = [...P.items.values()].filter(it => !it.months).length;
    if (!P.items.size) { toast('No hay insumos asignados todavía.', true); return; }
    if (await modal({ title: '¿Finalizar la asignación?', text: `${pend ? `${pend} insumos siguen sin piezas y no pasarán a aprobación. ` : ''}El plan pasa a "Pendiente de validación" y se notifica a las unidades y delegaciones.`, ok: 'Finalizar asignación' })) commit({ plan: P.id, a: 'finalizarAsignacion' }, { toast: 'Asignación finalizada: inicia la aprobación' });
  });
  $('#as-tpl').addEventListener('click', () => {
    const rows = [['CLUES', 'Clave', 'Tipo planeacion', 'Propuesta minima', 'Propuesta maxima', ...E.MESES]];
    for (const [k, it] of P.items) { const [cl, c] = k.split('|'); rows.push([cl, c, it.tipo || 'mensual', it.min ?? '', it.max ?? '', ...(it.months || Array(12).fill(''))]); if (rows.length > 5000) break; }
    download(`${P.id}_layout_descarga_carga_insumos.csv`, rows);
  });
  $('#as-csv')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!/\.csv$/i.test(file.name)) { toast('Carga fallida inténtelo de nuevo: el archivo debe ser .csv', true); return; }
    const txt = (await file.text()).replace(/^﻿/, '');
    const lines = txt.trim().split(/\r?\n/).slice(1).map(l => l.split(','));
    const errs = [], ok = [];
    const unitsP = new Set(E.unitsIn(S.U, P).map(u => u.clues)), clavesP = new Set(E.clavesIn(S.U, P).map(c => c.clave));
    lines.forEach((r, i) => {
      const [cl, c, tipo, mn, mx, ...m] = r;
      if (!unitsP.has(cl) || !clavesP.has(c)) errs.push(i + 2);
      else if (!(+mn >= 0) || !(+mx >= +mn)) errs.push(i + 2);
      else ok.push({ cl, c, prop: { tipo: tipo || 'mensual', min: +mn, max: +mx, months: m.length === 12 && m.every(v => v !== '') ? m.map(Number) : Array(12).fill(Math.round(+mn * 1.1 / 12)) } });
    });
    if (errs.length) { toast(`Carga fallida: ${errs.length} registro${errs.length > 1 ? 's' : ''} con error (filas ${errs.slice(0, 6).join(', ')}${errs.length > 6 ? '…' : ''}). Corrige y vuelve a cargar.`, true); return; }
    for (const x of ok) commit({ plan: P.id, a: 'asignarManual', clues: [x.cl], claves: [x.c], prop: x.prop }, { render: false });
    render(); toast(`${file.name}: ${ok.length} registros cargados`);
  });
};
function loading(txt) { const ld = document.createElement('div'); ld.className = 'loading'; ld.style.background = 'rgba(13,17,23,.6)'; ld.textContent = txt; document.body.appendChild(ld); return ld; }

// asistente de 3 pasos (HU05 a HU08)
VIEWS.asignar = ({ P }) => {
  const U = S.U;
  if (S.role !== 'oc' || P.etapa !== 'asignacion') return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Asignación de insumos', `#/p/${P.id}/asignacion`], ['Asignar insumos']])}<div class="card"><p class="empty">La asignación manual solo está disponible para el Área central mientras el plan está en la etapa de asignación. Este plan está en "${esc(E.ETAPAS.find(x => x.id === P.etapa)?.n)}".</p></div>`;
  const w = S.asw ||= { step: 0, units: new Set(), claves: new Set(), q: '', del: '', nivel: '', props: {} };
  const steps = ['Asignar unidades', 'Asignar insumos', 'Asignación de piezas a los insumos'];
  let body;
  if (w.step === 0) {
    const rows = E.unitsIn(U, P).filter(u => (!w.q || (u.clues + ' ' + u.nombre).toLowerCase().includes(w.q.toLowerCase())) && (!w.del || u.cve === w.del) && (!w.nivel || u.nivel === +w.nivel));
    body = `<div class="pl-filters"><input type="search" id="aw-q" placeholder="Nombre o CLUES" value="${esc(w.q)}"><select id="aw-del"><option value="">Delegación</option>${U.delegaciones.map(d => `<option value="${d.cve}" ${w.del === d.cve ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select><select id="aw-nivel"><option value="">Nivel</option><option value="1" ${w.nivel === '1' ? 'selected' : ''}>1er</option><option value="2" ${w.nivel === '2' ? 'selected' : ''}>2º</option><option value="3" ${w.nivel === '3' ? 'selected' : ''}>3er</option></select><button class="btn sm" id="aw-all">Seleccionar los ${rows.length} filtrados</button><span class="muted" style="font-size:12px">${w.units.size} seleccionadas</span></div>
      ${table('aw1', [{ h: '', nosort: true, v: () => '', f: u => `<input type="checkbox" class="chk" data-au="${u.clues}" ${w.units.has(u.clues) ? 'checked' : ''}>` }, { h: 'Unidad', v: u => u.nombre }, { h: 'Nivel', v: u => u.nivel, n: true }, { h: 'Delegación', v: u => U.delBy[u.cve].nombre, opt: true }, { h: 'CLUES', v: u => u.clues, cls: 'cl' }, { h: 'Responsable', v: u => u.responsable, opt: true }], rows)}`;
  } else if (w.step === 1) {
    const rows = E.clavesIn(U, P).filter(c => !w.q || (c.clave + ' ' + c.nombre).toLowerCase().includes(w.q.toLowerCase()));
    const prev = [...w.claves].some(cl => [...w.units].some(u => P.items.has(u + '|' + cl)));
    body = `<div class="pl-filters"><input type="search" id="aw-q" placeholder="Clave o nombre del insumo" value="${esc(w.q)}"><span class="muted" style="font-size:12px">${w.claves.size} de ${rows.length} insumos seleccionados</span></div>
      ${prev ? '<p class="pl-alert" style="margin:0 0 10px">Este insumo ya está asignado a algunas unidades. Al agregarlo, solo se asignará a las que no lo tienen; las demás no se verán afectadas.</p>' : ''}
      ${table('aw2', [{ h: '', nosort: true, v: () => '', f: c => `<input type="checkbox" class="chk" data-ac="${c.clave}" ${w.claves.has(c.clave) ? 'checked' : ''}>` }, { h: 'Clave', v: c => c.clave, cls: 'cl' }, { h: 'Insumo', v: c => c.nombre }, { h: 'Grupo', v: c => c.grupo }], rows)}`;
  } else {
    const rows = [...w.claves].map(cl => U.claves.find(c => c.clave === cl));
    body = `<p class="muted" style="font-size:13px;margin:0 0 10px">Asigna las piezas de cada insumo; la misma propuesta se aplica a las ${w.units.size} unidades seleccionadas. Puedes guardar sin piezas y completarlas después.</p>
      ${table('aw3', [{ h: 'Clave', v: c => c.clave, cls: 'cl' }, { h: 'Insumo', v: c => c.nombre }, { h: 'Grupo', v: c => c.grupo, opt: true }, { h: 'Piezas', n: true, v: c => (w.props[c.clave] ? w.props[c.clave].months.reduce((a, b) => a + b, 0) : -1), f: c => (w.props[c.clave] ? n0(w.props[c.clave].months.reduce((a, b) => a + b, 0)) : '<span class="muted">Sin asignar</span>') }, { h: 'Estatus', v: c => (w.props[c.clave] ? 'Por confirmar' : 'Pendiente'), f: c => chip(w.props[c.clave] ? 'porconfirmar' : 'pendiente', w.props[c.clave] ? 'Por confirmar' : 'Pendiente') }, { h: 'Acciones', nosort: true, v: () => '', f: c => `<button class="btn sm" data-ap="${c.clave}">Asignar piezas</button>` }], rows)}`;
  }
  const canNext = w.step === 0 ? w.units.size > 0 : w.claves.size > 0;
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Asignación de insumos', `#/p/${P.id}/asignacion`], ['Asignar insumos']])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)}</span><h1>Asignar insumos manualmente</h1></div><div class="pl-actions"><button class="btn ghost" id="aw-exit">Salir de asignación de insumos</button></div></div>
  <div class="pl-wiz">${steps.map((s2, i) => `<span class="${i === w.step ? 'on' : i < w.step ? 'ok' : ''}">${i + 1}. ${s2}</span>`).join('')}</div>${body}
  <div class="pl-actions" style="justify-content:flex-end;margin-top:12px">${w.step ? '<button class="btn" id="aw-back">Volver</button>' : ''}${w.step < 2 ? `<button class="btn pri" id="aw-next" ${canNext ? '' : 'disabled'}>Siguiente</button>` : '<button class="btn pri" id="aw-save">Guardar asignación</button>'}</div></section>`;
};
BIND.asignar = ({ P }) => {
  const w = S.asw; if (!w) return;
  $('#aw-exit').addEventListener('click', () => { S.asw = null; go(`#/p/${P.id}/asignacion`); });
  $('#aw-q')?.addEventListener('input', e => { w.q = e.target.value; resetPage(w.step ? 'aw2' : 'aw1'); clearTimeout(S._t); S._t = setTimeout(render, 250); });
  $('#aw-del')?.addEventListener('change', e => { w.del = e.target.value; render(); });
  $('#aw-nivel')?.addEventListener('change', e => { w.nivel = e.target.value; render(); });
  $('#aw-all')?.addEventListener('click', () => { E.unitsIn(S.U, P).filter(u => (!w.q || (u.clues + ' ' + u.nombre).toLowerCase().includes(w.q.toLowerCase())) && (!w.del || u.cve === w.del) && (!w.nivel || u.nivel === +w.nivel)).forEach(u => w.units.add(u.clues)); render(); });
  document.querySelectorAll('[data-au]').forEach(c => c.addEventListener('change', e => { e.target.checked ? w.units.add(e.target.dataset.au) : w.units.delete(e.target.dataset.au); render(); }));
  document.querySelectorAll('[data-ac]').forEach(c => c.addEventListener('change', e => { e.target.checked ? w.claves.add(e.target.dataset.ac) : w.claves.delete(e.target.dataset.ac); render(); }));
  $('#aw-back')?.addEventListener('click', () => { w.step--; w.q = ''; render(); });
  $('#aw-next')?.addEventListener('click', () => { w.step++; w.q = ''; render(); });
  document.querySelectorAll('[data-ap]').forEach(b => b.addEventListener('click', () => {
    const cl = b.dataset.ap; const u0 = S.U.units.find(u => w.units.has(u.clues));
    const s = E.seriesFor(S.U, u0, S.U.claves.find(c => c.clave === cl));
    piezasModal(w.props[cl] || E.proposalFor(s.hist, 'pronostico'), prop => { w.props[cl] = prop; render(); });
  }));
  $('#aw-save')?.addEventListener('click', async () => {
    if (!await modal({ title: '¿Guardar la asignación?', text: `Se asignan ${w.claves.size} insumos a ${w.units.size} unidades. Los que tienen piezas quedan "Por confirmar".`, ok: 'Aceptar' })) return;
    for (const cl of w.claves) commit({ plan: P.id, a: 'asignarManual', clues: [...w.units], claves: [cl], prop: w.props[cl] || null }, { render: false });
    S.asw = null; go(`#/p/${P.id}/asignacion`); toast('Asignación guardada');
  });
};
// formulario de planeación anual o mensual (HU08)
function piezasForm(prop, { editMinMax = true, id = 'pz' } = {}) {
  return `<div class="pl-radio" id="${id}-tipo"><label><input type="radio" name="${id}-t" value="mensual" ${prop.tipo !== 'anual' ? 'checked' : ''}> Planeación mensual</label><label><input type="radio" name="${id}-t" value="anual" ${prop.tipo === 'anual' ? 'checked' : ''}> Planeación anual</label></div>
    <div class="pl-form" style="margin-top:10px"><label>Propuesta mínima *<input type="number" min="0" id="${id}-min" value="${prop.min ?? ''}" ${editMinMax ? '' : 'readonly'}></label><label>Propuesta máxima *<input type="number" min="0" id="${id}-max" value="${prop.max ?? ''}" ${editMinMax ? '' : 'readonly'}></label></div>
    <div class="pl-months" id="${id}-months" style="margin-top:10px">${E.MESES.map((m, i) => `<label>${m}<input type="number" min="0" data-m="${i}" value="${prop.months?.[i] ?? ''}" ${prop.tipo === 'anual' ? 'readonly' : ''}></label>`).join('')}</div>
    <p class="note" id="${id}-sum"></p>`;
}
function readPiezas(root, id) {
  const tipo = root.querySelector(`input[name="${id}-t"]:checked`).value;
  const min = +root.querySelector(`#${id}-min`).value, max = +root.querySelector(`#${id}-max`).value;
  const months = [...root.querySelectorAll(`#${id}-months input`)].map(i => Math.max(0, Math.round(+i.value || 0)));
  return { tipo, min, max, months };
}
function bindPiezas(root, id, onValid) {
  const sync = () => {
    const p = readPiezas(root, id);
    if (p.tipo === 'anual') { const per = Math.round(p.min * 1.1 / 12); root.querySelectorAll(`#${id}-months input`).forEach(i => { i.value = per; i.readOnly = true; }); }
    else root.querySelectorAll(`#${id}-months input`).forEach(i => { i.readOnly = false; });
    const q = readPiezas(root, id), tot = q.months.reduce((a, b) => a + b, 0);
    const ok = q.min > 0 && q.max >= q.min && tot > 0;
    const sum = root.querySelector(`#${id}-sum`);
    sum.innerHTML = `Total mensual: <b class="${tot < q.min || tot > q.max ? 'oor' : ''}">${n0(tot)}</b> piezas · rango ${n0(q.min)} a ${n0(q.max)}${tot < q.min || tot > q.max ? ' · fuera de rango' : ''}`;
    onValid(ok, q);
  };
  root.addEventListener('input', sync); root.addEventListener('change', sync); sync();
}
function piezasModal(prop, done) {
  const m = document.createElement('div'); m.className = 'pl-modal';
  m.innerHTML = `<div style="width:min(640px,100%)"><h3>Planeación del insumo</h3><p>Por defecto la planeación es mensual con el pronóstico del gemelo. En planeación anual el sistema reparte el mínimo + 10 % igual en los 12 meses.</p>${piezasForm(prop)}<div class="row"><button class="btn" data-x="0">Cancelar</button><button class="btn pri" data-x="1">Aceptar</button></div></div>`;
  document.body.appendChild(m);
  let cur = null;
  bindPiezas(m, 'pz', (ok, q) => { cur = q; m.querySelector('[data-x="1"]').disabled = !ok; });
  m.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (!b) return; m.remove(); if (b.dataset.x === '1') done(cur); });
}
// asignar piezas a un par unidad-insumo (HU08 / HU10)
VIEWS.item = ({ P, a }) => {
  const k = a, it = P.items.get(k); if (!it) return '<div class="card"><p class="empty">Asignación no encontrada.</p></div>';
  const u = S.U.units[it.u], c = S.U.claves[it.k];
  const prop = it.months ? { tipo: it.tipo, min: it.min, max: it.max, months: it.months } : E.proposalFor(it.hist, P.metodo);
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Asignación de insumos', `#/p/${P.id}/asignacion`], [u.nombre, `#/p/${P.id}/asignacion/u/${u.clues}`], [c.nombre]])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Insumos planeación</span><h1>${esc(c.nombre)}</h1><p>${esc(u.nombre)} · ${esc(c.clave)} · consumo de los últimos 12 meses: ${n0(Array.from(it.hist.slice(-12)).reduce((x, y) => x + y, 0))} piezas</p></div></div>
  <div id="it-form">${piezasForm(prop, { id: 'it' })}</div>
  <div class="pl-actions" style="justify-content:flex-end;margin-top:12px"><a class="btn" href="#/p/${P.id}/asignacion/u/${u.clues}">Salir</a><button class="btn" id="it-save">Guardar</button><button class="btn pri" id="it-val">Validar la asignación</button></div></section>
  <section class="card"><div class="card-h"><h2>Consumo y propuesta <small>36 meses de consumo y 12 de propuesta</small></h2></div><div class="pl-chart">${chartItem(it, P, false)}</div></section>`;
};
BIND.item = ({ P, a }) => {
  const it = P.items.get(a); if (!it) return;
  let cur = null;
  bindPiezas($('#it-form'), 'it', (ok, q) => { cur = q; $('#it-save').disabled = !ok; $('#it-val').disabled = !ok; });
  const u = S.U.units[it.u];
  const save = async validar => {
    if (!await modal({ title: validar ? '¿Validar la asignación?' : '¿Guardar la asignación?', text: validar ? 'El insumo queda validado para esta unidad.' : 'La asignación queda "Por confirmar".', ok: 'Aceptar' })) return;
    commit({ plan: P.id, a: 'asignarPiezas', key: a, prop: { ...cur, validar } }, { render: false });
    go(`#/p/${P.id}/asignacion/u/${u.clues}`); toast('Piezas asignadas');
  };
  $('#it-save').addEventListener('click', () => save(false));
  $('#it-val').addEventListener('click', () => save(true));
};
// gráfica de existencias: consumo histórico, entradas, existencia y propuesta (HU04 Sprint 3)
function chartItem(it, P, showReal = true) {
  const W = 760, H = 230, pl = 46, pr = 10, pt = 12, pb = 30;
  const hist = Array.from(it.hist), N = hist.length + 12;
  // existencias simuladas: entradas mensuales que reponen hacia 1.5 meses de consumo
  let stock = hist[0] * 1.5; const ent = [], exi = [];
  for (let t = 0; t < hist.length; t++) { const e = Math.max(0, Math.round(hist[Math.max(0, t - 1)] * 1.0 + (hist[0] * 1.5 - stock) * 0.5)); ent.push(e); stock = Math.max(0, stock + e - hist[t]); exi.push(stock); }
  const prop = it.months || [], real = Array.from(it.real);
  const max = Math.max(...hist, ...ent, ...exi, ...prop, ...(showReal ? real : []), 1) * 1.1;
  const X = i => pl + (W - pl - pr) * (i + 0.5) / N, Y = v => pt + (H - pt - pb) * (1 - v / max), bw = (W - pl - pr) / N * 0.7;
  let g = '';
  for (const v of [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f / 1.1))) g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${pl - 6}" y="${Y(v) + 3}" text-anchor="end">${n0(v)}</text>`;
  hist.forEach((v, i) => { g += `<rect x="${X(i) - bw / 2}" y="${Y(v)}" width="${bw}" height="${Y(0) - Y(v)}" fill="#64748b" rx="1.5"><title>Consumo ${n0(v)}</title></rect>`; });
  const line = (arr, off, col, dash = '') => `<polyline fill="none" stroke="${col}" stroke-width="1.8" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${arr.map((v, i) => `${X(i + off).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
  g += line(ent, 0, '#60a5fa') + line(exi, 0, '#fbbf24');
  if (prop.length) g += line(prop, hist.length, '#2dd4bf');
  if (showReal) g += line(real, hist.length, '#f472b6', '4 3');
  g += `<line x1="${X(hist.length - 0.5)}" x2="${X(hist.length - 0.5)}" y1="${pt}" y2="${H - pb}" stroke="#e6edf3" stroke-dasharray="2 3" opacity=".5"/>`;
  [['nov 23', 0], ['nov 24', 12], ['nov 25', 24], ['ene 27', 38], ['dic 27', 47]].forEach(([t, i]) => { g += `<text class="ax" x="${X(i)}" y="${H - 10}" text-anchor="middle">${t}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consumo histórico, entradas, existencia y propuesta">${g}</svg><div class="legend" style="margin-top:6px"><span><i class="sw" style="background:#64748b"></i>Consumo (salidas)</span><span><i class="sw line" style="background:#60a5fa;height:3px"></i>Entradas</span><span><i class="sw line" style="background:#fbbf24;height:3px"></i>Existencia</span><span><i class="sw line" style="background:#2dd4bf;height:3px"></i>Propuesta 2027</span>${showReal ? '<span><i class="sw line" style="background:#f472b6;height:3px"></i>Necesidad real simulada (solo el gemelo la conoce)</span>' : ''}</div>`;
}

// ---------- Aprobación de insumos (Sprint 3)
function lvlOfRole() { return LVL_OF[S.role] || null; }
VIEWS.aprobacion = ({ P, a, b }) => {
  const U = S.U;
  const base = [['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Aprobación de insumos', `#/p/${P.id}/aprobacion`]];
  if (!['validacion', 'finalizado', 'cerrado'].includes(P.status)) return `${crumbs(base)}<div class="card"><p class="empty">La aprobación inicia cuando el Área central finaliza la asignación de insumos.</p></div>`;
  if (a === 'i') return aprobDetalle(P, b, base);
  if (a === 'u' || (S.role === 'um' && !a)) return aprobUnidad(P, a === 'u' ? b : S.clues, base);
  if (a === 'del' || (S.role === 'del' && !a)) return aprobDeleg(P, a === 'del' ? b : S.del, base);
  // Oficina Central, firmante y administrador: por delegación (HU20)
  const f = S.f_oc ||= { q: '', st: '' };
  const rows = E.delegStats(U, P).filter(r => r.units && (!f.q || (r.d.nombre + ' ' + r.d.responsable).toLowerCase().includes(f.q.toLowerCase())) && (!f.st || r.status === f.st));
  S._ocRows = rows;
  return `${crumbs(base)}${simBar(P)}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Oficina Central · ISSSTE</span><h1>Revisión de asignación por delegación</h1><p>${esc(P.nombre)} · ${chip(P.status, E.PLAN_ST[P.status])}</p></div><div class="pl-actions"><button class="btn" id="oc-csv">Descargar</button></div></div>
  <div class="pl-filters"><input type="search" id="fo-q" placeholder="Delegación o responsable" value="${esc(f.q)}"><select id="fo-st"><option value="">Estatus</option>${['Pendiente', 'En revisión', 'Verificada', 'Finalizado'].map(v => `<option ${f.st === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  ${table('oc', [{ h: 'Delegación', v: r => r.d.nombre }, { h: 'Responsable', v: r => r.d.responsable, opt: true }, { h: 'Unidades validadas', n: true, v: r => r.delDone }, { h: 'Unidades pendientes', n: true, v: r => r.units - r.ocDone }, { h: 'Claves asignadas', n: true, v: r => r.claves, opt: true }, { h: 'Estatus', v: r => r.status, f: r => chip(r.status === 'Finalizado' ? 'finalizado' : r.status === 'Verificada' ? 'verificada' : r.status === 'En revisión' ? 'revision' : 'pendiente', r.status) }, { h: 'Acciones', nosort: true, v: () => '', f: r => `<a class="btn sm" href="#/p/${P.id}/aprobacion/del/${r.d.cve}">Ver detalle</a>` }], rows)}</section>`;
};
function unitStatusTxt(P, u) {
  const s = P.unitSt.get(u.clues); if (!s) return ['pendiente', 'Sin asignación'];
  if (s.oc) return ['finalizado', 'Finalizado'];
  if (s.del) return ['verificada', 'Verificada'];
  if (s.um) return ['revision', 'En revisión'];
  return ['pendiente', 'Pendiente'];
}
function aprobDeleg(P, cve, base) {
  const U = S.U, d = U.delBy[cve];
  const f = S.f_dl ||= { q: '', st: '' };
  const rows = d.units.map(i => U.units[i]).filter(u => P.unitSt.has(u.clues)).map(u => {
    const L = E.unitItems(P, u.clues).filter(([, it]) => it.months);
    return { u, asig: L.length, val: L.filter(([, it]) => ['aprobado', 'rechazado'].includes(it.st.del)).length, st: unitStatusTxt(P, u) };
  }).filter(r => (!f.q || (r.u.clues + ' ' + r.u.nombre).toLowerCase().includes(f.q.toLowerCase())) && (!f.st || r.st[1] === f.st));
  S._dlRows = rows;
  return `${crumbs([...base, [`Delegación ${d.nombre}`]])}${simBar(P)}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Oficina de representación</span><h1>${esc(d.nombre)}</h1><p>Unidades de la oficina delegacional y su avance de verificación.</p></div><div class="pl-actions">${S.role !== 'del' ? `<a class="btn" href="#/p/${P.id}/aprobacion">Regresar a central</a>` : ''}<button class="btn" id="dl-csv">Descargar</button></div></div>
  <div class="pl-filters"><input type="search" id="fl-q" placeholder="Nombre o clave de la unidad" value="${esc(f.q)}"><select id="fl-st"><option value="">Estatus</option>${['Pendiente', 'En revisión', 'Verificada', 'Finalizado'].map(v => `<option ${f.st === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  ${table('dl', [{ h: 'Unidad', v: r => r.u.nombre }, { h: 'CLUES', v: r => r.u.clues, cls: 'cl' }, { h: 'Responsable', v: r => r.u.responsable, opt: true }, { h: 'Insumos asignados', n: true, v: r => r.asig }, { h: 'Insumos validados', n: true, v: r => r.val }, { h: 'Estatus', v: r => r.st[1], f: r => chip(r.st[0], r.st[1]) }, { h: 'Acciones', nosort: true, v: () => '', f: r => `<a class="btn sm" href="#/p/${P.id}/aprobacion/u/${r.u.clues}">Ver detalle</a>` }], rows)}</section>`;
}
function aprobUnidad(P, clues, base) {
  const U = S.U, u = U.units.find(x => x.clues === clues); if (!u) return '<div class="card"><p class="empty">Unidad no encontrada.</p></div>';
  const lvl = lvlOfRole();
  const f = S.f_ui ||= { q: '', grupo: '', st: '' };
  const all = E.unitItems(P, u.clues).filter(([, it]) => it.months || it.solicitado).map(([k, it]) => ({ k, it, c: U.claves[it.k] }));
  const rows = all.filter(r => (!f.q || (r.c.clave + ' ' + r.c.nombre).toLowerCase().includes(f.q.toLowerCase())) && (!f.grupo || r.c.grupo === f.grupo) && (!f.st || r.it.st[lvl || 'oc'] === f.st));
  const s = P.unitSt.get(u.clues) || {};
  const canFin = lvl && P.status === 'validacion' && !s[lvl] && E.canFinalize(P, u.clues, lvl);
  const pendLvl = lvl ? all.filter(r => E.needs(r.it, lvl)).length : 0;
  const grupos = [...new Set(all.map(r => r.c.grupo))].sort();
  return `${crumbs([...base, ...(S.role === 'um' ? [] : [[`Delegación ${U.delBy[u.cve].nombre}`, `#/p/${P.id}/aprobacion/del/${u.cve}`]]), [u.nombre]])}${simBar(P)}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Verificación de insumos por UMF · ${esc(ROLES[S.role])}</span><h1>${esc(u.nombre)}</h1><p>${esc(u.clues)} · ${esc(u.tipo)} · ${esc(U.delBy[u.cve].nombre)} · ${chip(...unitStatusTxt(P, u))}${lvl && pendLvl ? ` · <b>${pendLvl}</b> insumos esperan tu dictamen` : ''}</p></div>
  <div class="pl-actions">${S.role === 'um' && P.status === 'validacion' && !s.um ? `<a class="btn" href="#/p/${P.id}/solicitar/${u.clues}">Solicitar insumo</a>` : ''}${S.role === 'oc' && P.status === 'validacion' && s.del && !s.oc ? '<button class="btn warn" id="oc-rall">Rechazar todo</button><button class="btn" id="oc-aall">Aprobar todo</button>' : ''}${lvl ? `<button class="btn pri" id="u-finv" ${canFin ? '' : 'disabled'}>Finalizar verificación</button>` : ''}</div></div>
  <div class="pl-filters"><input type="search" id="fui-q" placeholder="Nombre o clave del insumo" value="${esc(f.q)}"><select id="fui-g"><option value="">Grupo terapéutico</option>${grupos.map(g => `<option ${f.grupo === g ? 'selected' : ''}>${g}</option>`).join('')}</select><select id="fui-st"><option value="">Estatus</option>${['pendiente', 'aprobado', 'rechazado', 'negociacion', 'revision', 'porvalidar'].map(v => `<option value="${v}" ${f.st === v ? 'selected' : ''}>${E.DICT[v]}</option>`).join('')}</select></div>
  ${table('ui', [
    { h: 'Clave', v: r => r.c.clave, cls: 'cl' }, { h: 'Insumo', v: r => r.c.nombre, f: r => `${esc(r.c.nombre)}${r.it.solicitado ? ' <small class="muted">· solicitado</small>' : ''}` }, { h: 'Grupo', v: r => r.c.grupo, opt: true },
    { h: 'Piezas asignadas', n: true, v: r => E.total(r.it), f: r => `<span class="${E.outOfRange(r.it) ? 'oor' : ''}" title="${E.outOfRange(r.it) ? 'Fuera del rango mínimo y máximo' : ''}">${n0(E.total(r.it))}</span>` },
    { h: 'Mín.', n: true, v: r => r.it.min, f: r => n0(r.it.min), opt: true }, { h: 'Máx.', n: true, v: r => r.it.max, f: r => n0(r.it.max), opt: true },
    { h: 'Unidad', v: r => r.it.st.um, f: r => dict(r.it.st.um) }, { h: 'Delegación', v: r => r.it.st.del, f: r => dict(r.it.st.del) }, { h: 'O. Central', v: r => r.it.st.oc, f: r => dict(r.it.st.oc) },
    { h: 'Acciones', nosort: true, v: () => '', f: r => `<a class="btn sm ${lvl && E.needs(r.it, lvl) ? 'pri' : ''}" href="#/p/${P.id}/aprobacion/i/${encodeURIComponent(r.k)}">${lvl && E.needs(r.it, lvl) ? 'Dictaminar' : 'Ver detalle'}</a>` },
  ], rows, { empty: 'No se encontraron resultados' })}</section>`;
}
function aprobDetalle(P, k, base) {
  const U = S.U, it = P.items.get(k); if (!it) return '<div class="card"><p class="empty">Insumo no encontrado.</p></div>';
  const u = U.units[it.u], c = U.claves[it.k], lvl = lvlOfRole();
  const can = lvl && P.status === 'validacion' && E.needs(it, lvl) && (S.role !== 'um' || S.clues === u.clues) && (S.role !== 'del' || S.del === u.cve);
  const alert = it.st.oc === 'aprobado' ? '<p class="pl-alert ok">Esta asignación fue aprobada por la oficina central.</p>' : it.st.oc === 'rechazado' ? '<p class="pl-alert bad">Esta asignación fue rechazada por la oficina central.</p>' : it.st.um === 'revision' ? `<p class="pl-alert">Esta asignación fue modificada por la ${it.versions.at(-1)?.by === 'oc' ? 'oficina central' : 'delegación'}.</p>` : '';
  const obs = ['um', 'del', 'oc'].filter(l => it.obs[l]).map(l => `<div class="pl-obs"><b>Observaciones de ${E.NIVEL_N[l].toLowerCase()}</b>${esc(it.obs[l])}</div>`).join('');
  const vers = it.versions.map((v, i) => `<tr><td>${i + 1}</td><td>${E.NIVEL_N[v.by] || v.by}</td><td class="n">día ${v.t}</td><td class="n">${n0(v.months.reduce((a, b) => a + b, 0))}</td><td>${esc(v.obs || '')}</td></tr>`).join('');
  return `${crumbs([...base, [u.nombre, `#/p/${P.id}/aprobacion/u/${u.clues}`], [c.nombre]])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · ${esc(P.nombre)} · Aprobación de insumos</span><h1>${esc(c.nombre)}</h1><p>${esc(c.clave)} · ${esc(c.pz)} · ${esc(u.nombre)} · Unidad ${dict(it.st.um)} · Delegación ${dict(it.st.del)} · O. Central ${dict(it.st.oc)}</p></div><div class="pl-actions"><a class="btn" href="#/p/${P.id}/aprobacion/u/${u.clues}">Regresar</a></div></div>${alert}</section>
  <div class="pl-detail">
    <section class="card"><div class="card-h"><h2>Planeación ${it.tipo === 'anual' ? 'anual' : 'mensual'} <small>versión vigente</small></h2></div>
      <div class="pl-kv"><div><span>Propuesta mínima</span><b>${n0(it.min)}</b></div><div><span>Propuesta máxima</span><b>${n0(it.max)}</b></div><div><span>Piezas asignadas</span><b class="${E.outOfRange(it) ? 'oor' : ''}">${n0(E.total(it))}</b></div><div><span>Rondas de negociación</span><b>${it.round}</b></div></div>
      <div class="pl-kv pl-mes" style="margin-top:10px">${E.MESES.map((m, i) => `<div><span>${m}</span><b>${n0(it.months[i])}</b></div>`).join('')}</div>
      ${obs ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${obs}</div>` : ''}
      <h3 class="u3d-h" style="margin-top:14px">Versiones de la propuesta</h3><div class="pl-table"><table><thead><tr><th>#</th><th>Quién</th><th class="n">Cuándo</th><th class="n">Piezas</th><th>Observaciones</th></tr></thead><tbody>${vers}</tbody></table></div>
    </section>
    <section class="card"><div class="card-h"><h2>Existencias <small>consumo, entradas y existencia por mes</small></h2></div><div class="pl-chart">${chartItem(it, P, true)}</div>
      ${it.motivo ? `<p class="note">En el gemelo esta unidad tiene un cambio para 2027: ${esc(it.motivo)} (×${f1(it.cambio)}).</p>` : ''}</section>
  </div>
  ${can ? `<section class="card" id="dict"><div class="card-h"><h2>Dictamen del insumo <small>${esc(ROLES[S.role])}</small></h2></div>
    <p style="margin:0 0 10px">¿Estás de acuerdo con la planeación mensual asignada para este insumo?</p>
    <div class="pl-radio" id="d-op"><label><input type="radio" name="d" value="aprobar"> Aprobar</label><label><input type="radio" name="d" value="rechazar"> Rechazar</label><label><input type="radio" name="d" value="negociar"> Negociar</label></div>
    <div id="d-extra" style="margin-top:12px"></div>
    <div class="pl-actions" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" id="d-send" disabled>Enviar</button></div></section>` : ''}`;
}
BIND.aprobacion = ({ P, a, b }) => {
  const bindQ = (id, obj, key, tbl) => $(id)?.addEventListener('input', e => { obj[key] = e.target.value; resetPage(tbl); clearTimeout(S._t); S._t = setTimeout(render, 250); });
  bindQ('#fo-q', S.f_oc || {}, 'q', 'oc'); $('#fo-st')?.addEventListener('change', e => { S.f_oc.st = e.target.value; render(); });
  bindQ('#fl-q', S.f_dl || {}, 'q', 'dl'); $('#fl-st')?.addEventListener('change', e => { S.f_dl.st = e.target.value; render(); });
  bindQ('#fui-q', S.f_ui || {}, 'q', 'ui');
  $('#fui-g')?.addEventListener('change', e => { S.f_ui.grupo = e.target.value; render(); });
  $('#fui-st')?.addEventListener('change', e => { S.f_ui.st = e.target.value; render(); });
  $('#oc-csv')?.addEventListener('click', () => download(`${P.id}_delegaciones.csv`, [['Delegacion', 'Responsable', 'Unidades', 'Verificadas por delegacion', 'Autorizadas por Oficina Central', 'Claves asignadas', 'Estatus'], ...S._ocRows.map(r => [r.d.nombre, r.d.responsable, r.units, r.delDone, r.ocDone, r.claves, r.status])]));
  $('#dl-csv')?.addEventListener('click', () => download(`${P.id}_unidades.csv`, [['Unidad', 'CLUES', 'Responsable', 'Insumos asignados', 'Insumos validados', 'Estatus'], ...S._dlRows.map(r => [r.u.nombre, r.u.clues, r.u.responsable, r.asig, r.val, r.st[1]])]));
  const clues = a === 'u' ? b : S.role === 'um' ? S.clues : null;
  $('#u-finv')?.addEventListener('click', async () => {
    const lvl = lvlOfRole();
    if (!await modal({ title: '¿Deseas finalizar la verificación?', text: 'Al hacerlo ya no se podrán hacer modificaciones en este nivel.', ok: 'Aceptar' })) return;
    commit({ plan: P.id, a: 'finalizarVerif', clues, nivel: lvl }, { toast: 'Se ha finalizado la verificación exitosamente' });
  });
  for (const [id, d] of [['#oc-aall', 'aprobar'], ['#oc-rall', 'rechazar']]) $(id)?.addEventListener('click', async () => {
    const m = await modal({ title: d === 'aprobar' ? '¿Deseas aprobar todos los insumos?' : '¿Deseas rechazar todos los insumos?', text: 'El cambio se refleja en la columna O. Central.', ok: 'Aceptar', danger: d !== 'aprobar', input: d === 'rechazar' ? { label: 'Motivo de rechazo', required: true, min: 10 } : null });
    if (m) commit({ plan: P.id, a: 'aprobarTodo', clues, d, obs: typeof m === 'string' ? m : '' }, { toast: 'Dictamen aplicado a todos los insumos' });
  });
  // dictamen (HU04 a HU09, HU19, HU22)
  if (a === 'i' && $('#dict')) {
    const it = P.items.get(b);
    let choice = null, prop = null, okP = false;
    const extra = $('#d-extra'), send = $('#d-send');
    const check = () => { const obs = $('#d-obs')?.value.trim() || ''; send.disabled = !choice || (choice === 'rechazar' && obs.length < 10) || (choice === 'negociar' && (!okP || obs.length < 10)); };
    $('#d-op').addEventListener('change', e => {
      choice = e.target.value;
      if (choice === 'aprobar') extra.innerHTML = '';
      if (choice === 'rechazar') extra.innerHTML = `<label class="pl-form" style="display:block"><span style="font-size:12px;color:var(--muted)">Motivo de rechazo *</span><textarea id="d-obs" maxlength="500" style="width:100%;height:90px;margin-top:6px;border-radius:10px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);padding:8px 10px"></textarea></label>`;
      if (choice === 'negociar') {
        extra.innerHTML = `<p class="muted" style="font-size:13px;margin:0 0 8px">Configura la nueva propuesta: reparte las piezas por mes. El mínimo y el máximo no cambian; si el total sale del rango se marca en rojo.</p><div id="d-pz">${piezasForm({ tipo: 'mensual', min: it.min, max: it.max, months: it.months }, { editMinMax: false, id: 'dn' })}</div><label class="pl-form" style="display:block;margin-top:8px"><span style="font-size:12px;color:var(--muted)">Observaciones sobre la negociación *</span><textarea id="d-obs" maxlength="500" style="width:100%;height:80px;margin-top:6px;border-radius:10px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);padding:8px 10px"></textarea></label>`;
        bindPiezas($('#d-pz'), 'dn', (ok, q) => { okP = q.months.some(v => v > 0); prop = q; check(); });
      }
      $('#d-obs')?.addEventListener('input', check);
      check();
    });
    send.addEventListener('click', async () => {
      const txt = { aprobar: '¿Deseas marcar este insumo como aprobado?', rechazar: '¿Deseas validar el rechazo de este insumo? Este insumo se eliminará de las asignaciones de la unidad médica.', negociar: '¿Deseas enviar esta nueva propuesta? La nueva propuesta será enviada a la unidad médica.' }[choice];
      if (!await modal({ title: 'Confirmar dictamen', text: txt, ok: 'Aceptar', danger: choice === 'rechazar' })) return;
      const u = S.U.units[it.u];
      commit({ plan: P.id, a: 'dictamen', key: b, nivel: lvlOfRole(), d: choice, obs: $('#d-obs')?.value.trim() || '', prop: choice === 'negociar' ? { months: prop.months, tipo: 'mensual' } : null }, { render: false });
      go(`#/p/${P.id}/aprobacion/u/${u.clues}`);
      toast(choice === 'negociar' ? 'La nueva propuesta se envió correctamente.' : 'Dictamen registrado');
    });
  }
};

// ---------- Solicitud de insumo nuevo por la unidad (HU13 a HU15)
VIEWS.solicitar = ({ P, a }) => {
  const U = S.U, u = U.units.find(x => x.clues === a);
  if (S.role !== 'um' || P.status !== 'validacion') return `<div class="card"><p class="empty">Solo la unidad médica solicita insumos nuevos mientras el plan está pendiente de validación.</p></div>`;
  const w = S.solw ||= { step: 0, sel: new Set(), q: '', props: {}, obs: {} };
  const have = new Set(E.unitItems(P, u.clues).map(([, it]) => U.claves[it.k].clave));
  const cat = E.clavesIn(U, P).filter(c => !have.has(c.clave) && (!w.q || (c.clave + ' ' + c.nombre).toLowerCase().includes(w.q.toLowerCase())));
  const rows = [...w.sel].map(cl => U.claves.find(c => c.clave === cl));
  const done = rows.every(c => w.props[c.clave]);
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Aprobación de insumos', `#/p/${P.id}/aprobacion`], ['Solicitar insumo']])}
  <section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(u.nombre)}</span><h1>Solicitud de insumo nuevo</h1><p>Insumos del catálogo del plan que hoy no tiene tu unidad. Pasan por la validación de la delegación y de la oficina central.</p></div><div class="pl-actions"><button class="btn ghost" id="sw-x">Cancelar y salir</button></div></div>
  <div class="pl-wiz"><span class="${w.step === 0 ? 'on' : 'ok'}">1. Seleccionar insumos</span><span class="${w.step === 1 ? 'on' : ''}">2. Asignar piezas</span></div>
  ${w.step === 0 ? `<div class="pl-filters"><input type="search" id="sw-q" placeholder="Nombre o clave" value="${esc(w.q)}"><span class="muted" style="font-size:12px">${w.sel.size} seleccionados</span></div>
    ${table('sw', [{ h: '', nosort: true, v: () => '', f: c => `<input type="checkbox" class="chk" data-sw="${c.clave}" ${w.sel.has(c.clave) ? 'checked' : ''}>` }, { h: 'Clave', v: c => c.clave, cls: 'cl' }, { h: 'Insumo', v: c => c.nombre }, { h: 'Grupo', v: c => c.grupo }], cat, { empty: 'Tu unidad ya tiene todas las claves del plan.' })}
    <div class="pl-actions" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" id="sw-next" ${w.sel.size ? '' : 'disabled'}>Siguiente</button></div>`
  : `${table('sw2', [{ h: 'Clave', v: c => c.clave, cls: 'cl' }, { h: 'Insumo', v: c => c.nombre }, { h: 'Piezas', n: true, v: c => (w.props[c.clave] ? w.props[c.clave].months.reduce((x, y) => x + y, 0) : 0), f: c => (w.props[c.clave] ? n0(w.props[c.clave].months.reduce((x, y) => x + y, 0)) : '<span class="muted">Sin asignar</span>') }, { h: 'Estatus', v: c => (w.props[c.clave] ? 'Por validar' : 'Pendiente'), f: c => chip(w.props[c.clave] ? 'porvalidar' : 'pendiente', w.props[c.clave] ? 'Por validar' : 'Pendiente') }, { h: 'Acciones', nosort: true, v: () => '', f: c => `<button class="btn sm" data-swp="${c.clave}">Asignar piezas</button>` }], rows)}
    <div class="pl-actions" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="sw-back">Volver</button><button class="btn pri" id="sw-fin" ${done ? '' : 'disabled'}>Finalizar</button></div>`}</section>`;
};
BIND.solicitar = ({ P, a }) => {
  const w = S.solw; if (!w) return;
  $('#sw-x').addEventListener('click', () => { S.solw = null; go(`#/p/${P.id}/aprobacion`); });
  $('#sw-q')?.addEventListener('input', e => { w.q = e.target.value; resetPage('sw'); clearTimeout(S._t); S._t = setTimeout(render, 250); });
  document.querySelectorAll('[data-sw]').forEach(c => c.addEventListener('change', e => { e.target.checked ? w.sel.add(e.target.dataset.sw) : w.sel.delete(e.target.dataset.sw); render(); }));
  $('#sw-next')?.addEventListener('click', () => { w.step = 1; render(); });
  $('#sw-back')?.addEventListener('click', () => { w.step = 0; render(); });
  document.querySelectorAll('[data-swp]').forEach(b => b.addEventListener('click', () => {
    const cl = b.dataset.swp;
    const m = document.createElement('div'); m.className = 'pl-modal';
    m.innerHTML = `<div style="width:min(640px,100%)"><h3>Planeación del insumo solicitado</h3>${piezasForm(w.props[cl] || { tipo: 'mensual', min: '', max: '', months: Array(12).fill('') }, { id: 'sp' })}<label class="pl-form" style="display:block"><span style="font-size:12px;color:var(--muted)">Observaciones (justificación) *</span><textarea id="sp-obs" maxlength="500" style="width:100%;height:80px;margin-top:6px;border-radius:10px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);padding:8px 10px">${esc(w.obs[cl] || '')}</textarea></label><div class="row"><button class="btn" data-x="0">Cancelar</button><button class="btn pri" data-x="1" disabled>Guardar</button></div></div>`;
    document.body.appendChild(m);
    let cur = null, okp = false;
    const chk = () => { m.querySelector('[data-x="1"]').disabled = !(okp && m.querySelector('#sp-obs').value.trim().length >= 10); };
    bindPiezas(m, 'sp', (ok, q) => { okp = ok; cur = q; chk(); });
    m.querySelector('#sp-obs').addEventListener('input', chk);
    m.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === '1') { w.props[cl] = cur; w.obs[cl] = m.querySelector('#sp-obs').value.trim(); } m.remove(); render(); });
  }));
  $('#sw-fin')?.addEventListener('click', async () => {
    if (!await modal({ title: '¿Enviar la solicitud?', text: 'Los insumos se envían a la delegación y a la oficina central para su validación.', ok: 'Aceptar' })) return;
    for (const cl of w.sel) commit({ plan: P.id, a: 'solicitar', clues: a, clave: cl, prop: w.props[cl], obs: w.obs[cl] }, { render: false });
    S.solw = null; go(`#/p/${P.id}/aprobacion`); toast('Insumos solicitados exitosamente');
  });
};

// ---------- Programas especiales (HU26 a HU31)
VIEWS.programas = ({ P, a }) => {
  const U = S.U;
  const base = [['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Programas especiales', `#/p/${P.id}/programas`]];
  if (a === 'nuevo') {
    const w = S.prw ||= { step: 0, nombre: '', ini: '2027-01-04', fin: '2027-12-31', objetivos: '', desc: '', kits: new Set(), claves: new Set(), piezas: {} };
    const steps = ['Datos del programa especial', 'Kits', 'Insumos', 'Asignación de piezas'];
    const claves = [...new Set([...w.claves, ...P.kits.filter(k => w.kits.has(k.id)).flatMap(k => k.claves)])];
    let body;
    if (w.step === 0) body = `<div class="pl-form"><label class="full">Nombre *<input id="pr-n" value="${esc(w.nombre)}"></label><label>Inicio de ejecución *<input type="date" id="pr-i" value="${w.ini}"></label><label>Fin de ejecución *<input type="date" id="pr-f" value="${w.fin}"></label><label class="full">Objetivos *<textarea id="pr-o">${esc(w.objetivos)}</textarea></label><label class="full">Descripción<textarea id="pr-d">${esc(w.desc)}</textarea></label></div>`;
    else if (w.step === 1) body = `<div class="pl-cards">${P.kits.map(k => `<label class="pl-card"><span><input type="checkbox" class="chk" data-pk="${k.id}" ${w.kits.has(k.id) ? 'checked' : ''}> <b>${esc(k.nombre)}</b></span><small class="muted">${esc(k.tipologia)} · ${k.claves.length} insumos</small></label>`).join('') || '<p class="empty">El plan no tiene kits.</p>'}</div>`;
    else if (w.step === 2) body = table('pr2', [{ h: '', nosort: true, v: () => '', f: c => `<input type="checkbox" class="chk" data-pc="${c.clave}" ${w.claves.has(c.clave) ? 'checked' : ''}>` }, { h: 'Clave', v: c => c.clave, cls: 'cl' }, { h: 'Insumo', v: c => c.nombre }, { h: 'Grupo terapéutico', v: c => c.grupo }], E.clavesIn(U, P));
    else body = table('pr3', [{ h: 'Clave', v: c => c, cls: 'cl' }, { h: 'Insumo', v: c => U.claves.find(x => x.clave === c).nombre }, { h: 'Piezas asignadas', n: true, v: c => w.piezas[c] || 0, f: c => `<input type="number" min="1" data-pp="${c}" value="${w.piezas[c] || ''}" style="width:110px;height:32px;text-align:right">` }], claves);
    const valid = w.step === 0 ? (w.nombre.trim() && w.objetivos.trim() && w.fin > w.ini) : w.step === 3 ? claves.length && claves.every(c => w.piezas[c] > 0) : true;
    return `${crumbs([...base, ['Nuevo programa']])}<section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · ${esc(P.nombre)}</span><h1>Nuevo programa especial</h1></div><div class="pl-actions"><button class="btn ghost" id="pr-x">Salir</button></div></div>
      <div class="pl-wiz">${steps.map((s2, i) => `<span class="${i === w.step ? 'on' : i < w.step ? 'ok' : ''}">${i + 1}. ${s2}</span>`).join('')}</div>${body}
      <div class="pl-actions" style="justify-content:flex-end;margin-top:12px">${w.step ? '<button class="btn" id="pr-back">Volver</button>' : ''}${w.step < 3 ? `<button class="btn pri" id="pr-next" ${valid ? '' : 'disabled'}>Siguiente</button>` : `<button class="btn pri" id="pr-fin" ${valid ? '' : 'disabled'}>Finalizar</button>`}</div></section>`;
  }
  if (a && a !== 'nuevo') {
    const p = P.programas.find(x => x.id === a); if (!p) return '<div class="card"><p class="empty">Programa no encontrado.</p></div>';
    return `${crumbs([...base, [p.nombre]])}<section class="card"><div class="pl-head"><div><span class="eyebrow">Programa ${esc(p.id)}</span><h1>${esc(p.nombre)}</h1><p>${esc(p.periodo?.join(' a '))} · ${chip('vigente', p.estatus)}</p></div><div class="pl-actions"><a class="btn" href="#/p/${P.id}/programas">Regresar</a></div></div>
      <div class="pl-kv"><div><span>Objetivos</span><b style="font-size:13px">${esc(p.objetivos)}</b></div><div><span>Kits</span><b>${p.kits.length}</b></div><div><span>Insumos</span><b>${Object.keys(p.piezas).length}</b></div><div><span>Piezas</span><b>${n0(Object.values(p.piezas).reduce((x, y) => x + y, 0))}</b></div></div>
      <p class="muted" style="font-size:13px">${esc(p.desc)}</p>
      <div class="pl-table"><table><thead><tr><th>Clave</th><th>Insumo</th><th class="n">Piezas</th></tr></thead><tbody>${Object.entries(p.piezas).map(([c, v]) => `<tr><td class="cl">${esc(c)}</td><td>${esc(U.claves.find(x => x.clave === c)?.nombre)}</td><td class="n">${S.role === 'oc' ? `<input type="number" min="1" data-pe="${c}" value="${v}" style="width:110px;height:32px;text-align:right">` : n0(v)}</td></tr>`).join('')}</tbody></table></div>
      ${S.role === 'oc' ? '<div class="pl-actions" style="justify-content:flex-end;margin-top:10px"><button class="btn pri" id="pe-save">Guardar cambios</button></div>' : ''}</section>`;
  }
  return `${crumbs(base)}<section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · Etapa 3</span><h1>Programas especiales</h1><p>Programas con kits e insumos propios (por ejemplo, vacunación) dentro del plan anual.</p></div><div class="pl-actions">${S.role === 'oc' && P.tipo !== 'Sin programas especiales' && !['cerrado', 'cancelado'].includes(P.status) ? `<a class="btn pri" href="#/p/${P.id}/programas/nuevo">Crear programa</a>` : ''}<a class="btn ghost" href="#/p/${P.id}">Salir al plan</a></div></div>
    ${table('prog', [{ h: 'Id', v: p => p.id, cls: 'cl' }, { h: 'Nombre', v: p => p.nombre }, { h: 'Periodo', v: p => p.periodo?.join(' a ') }, { h: 'Creado', v: p => `día ${p.creado}`, opt: true }, { h: 'Estatus', v: p => p.estatus, f: p => chip('vigente', p.estatus) }, { h: 'Acciones', nosort: true, v: () => '', f: p => `<a class="btn sm" href="#/p/${P.id}/programas/${p.id}">Ver detalle</a>` }], P.programas, { empty: 'Sin programas especiales.' })}</section>`;
};
BIND.programas = ({ P, a }) => {
  if (a === 'nuevo') {
    const w = S.prw;
    $('#pr-x').addEventListener('click', () => { S.prw = null; go(`#/p/${P.id}/programas`); });
    for (const [id, k] of [['#pr-n', 'nombre'], ['#pr-o', 'objetivos'], ['#pr-d', 'desc'], ['#pr-i', 'ini'], ['#pr-f', 'fin']]) $(id)?.addEventListener('change', e => { w[k] = e.target.value; render(); });
    document.querySelectorAll('[data-pk]').forEach(c => c.addEventListener('change', e => { e.target.checked ? w.kits.add(e.target.dataset.pk) : w.kits.delete(e.target.dataset.pk); }));
    document.querySelectorAll('[data-pc]').forEach(c => c.addEventListener('change', e => { e.target.checked ? w.claves.add(e.target.dataset.pc) : w.claves.delete(e.target.dataset.pc); }));
    document.querySelectorAll('[data-pp]').forEach(c => c.addEventListener('change', e => { w.piezas[e.target.dataset.pp] = +e.target.value; render(); }));
    $('#pr-back')?.addEventListener('click', () => { w.step--; render(); });
    $('#pr-next')?.addEventListener('click', () => { w.step++; render(); });
    $('#pr-fin')?.addEventListener('click', async () => {
      if (!await modal({ title: '¿Finalizar la creación de este programa especial?', ok: 'Finalizar' })) return;
      const claves = [...new Set([...w.claves, ...P.kits.filter(k => w.kits.has(k.id)).flatMap(k => k.claves)])];
      if (tryCommit({ plan: P.id, a: 'crearPrograma', nombre: w.nombre.trim(), periodo: [w.ini, w.fin], objetivos: w.objetivos, desc: w.desc, kits: [...w.kits], claves, piezas: Object.fromEntries(claves.map(c => [c, w.piezas[c]])) }, { render: false })) { S.prw = null; go(`#/p/${P.id}/programas`); toast('Programa especial registrado exitosamente'); }
    });
  }
  $('#pe-save')?.addEventListener('click', () => {
    const p = P.programas.find(x => x.id === a);
    const piezas = { ...p.piezas }; document.querySelectorAll('[data-pe]').forEach(i => { piezas[i.dataset.pe] = Math.max(1, +i.value || 1); });
    commit({ plan: P.id, a: 'editarPrograma', id: p.id, cambios: { piezas } }, { toast: 'Cambios guardados' });
  });
};

// ---------- Cierre del plan (HU24)
VIEWS.cierre = ({ P }) => {
  const base = [['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Cierre del plan']];
  if (P.status === 'cerrado') return `${crumbs(base)}<section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)}</span><h1>Plan cerrado</h1><p>Oficio de cierre: <b>${esc(P.cierre.archivo)}</b> · ${esc(P.cierre.por)} · día ${P.cierre.t}</p></div><div class="pl-actions"><button class="btn" id="c-doc">Descargar documento de cierre</button></div></div></section>`;
  if (P.status !== 'finalizado') return `${crumbs(base)}${simBar(P)}<section class="card"><p class="empty">El cierre se habilita cuando la Oficina Central termina de verificar todas las unidades y el plan queda Finalizado. Estatus actual: ${E.PLAN_ST[P.status]}.</p></section>`;
  const allowed = S.role === 'firmante';
  return `${crumbs(base)}<section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)} · ${esc(P.nombre)}</span><h1>Cierre del plan de necesidades</h1><p>Descarga el documento de cierre (plan consolidado nacional) y sube el oficio firmado en PDF.</p></div></div>
    ${allowed ? '' : '<p class="pl-alert">Solo el Aprobador firmante cierra el plan. Cambia el rol arriba.</p>'}
    <div class="pl-stages" style="margin-top:12px"><div class="pl-stage ${S.cdoc ? 'done' : 'doing'}"><b>Documento de cierre</b><small>Plan consolidado por delegación, unidad e insumo con su planeación mensual</small><div class="row"><span></span><button class="btn sm" id="c-doc">Descargar</button></div></div>
    <div class="pl-stage ${S.cpdf ? 'done' : 'todo'}"><b>Comprobante</b><small>Oficio firmado en PDF, hasta 20 MB</small><div class="row"><span>${S.cpdf ? esc(S.cpdf) : 'Sin archivo'}</span><label class="btn sm" style="cursor:pointer">${S.cpdf ? 'Reemplazar' : 'Cargar archivo'}<input type="file" id="c-pdf" accept="application/pdf" hidden ${allowed ? '' : 'disabled'}></label></div></div></div>
    <div class="pl-actions" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" id="c-save" ${allowed && S.cdoc && S.cpdf ? '' : 'disabled'}>Guardar</button></div></section>`;
};
BIND.cierre = ({ P }) => {
  $('#c-doc')?.addEventListener('click', () => {
    const U = S.U, rows = [['Delegacion', 'CLUES', 'Unidad', 'Clave', 'Insumo', 'Tipo planeacion', 'Minima', 'Maxima', ...E.MESES, 'Total', 'Estatus O. Central', 'Precio referencia', 'Importe']];
    for (const it of P.items.values()) { if (!it.months) continue; const u = U.units[it.u], c = U.claves[it.k], tot = it.st.oc === 'rechazado' ? 0 : E.total(it); rows.push([U.delBy[u.cve].nombre, u.clues, u.nombre, c.clave, c.nombre, it.tipo, it.min, it.max, ...it.months, tot, E.DICT[it.st.oc], c.precio, tot * c.precio]); }
    download(`${P.id}_plan_necesidades_consolidado.csv`, rows); S.cdoc = true; if (P.status === 'finalizado') render();
  });
  $('#c-pdf')?.addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; if (f.type !== 'application/pdf' || f.size > 20 * 1024 * 1024) { toast('El comprobante debe ser PDF de hasta 20 MB', true); return; } S.cpdf = f.name; render(); });
  $('#c-save')?.addEventListener('click', () => { commit({ plan: P.id, a: 'cerrar', archivo: S.cpdf }, { render: false }); S.cdoc = S.cpdf = null; go('#/'); toast('Se ha cerrado el plan exitosamente'); });
};

// ---------- Simulación del ciclo (gemelo)
VIEWS.simulacion = ({ P }) => {
  const U = S.U, k = P.items.size ? E.kpis(U, P) : null;
  const base = [['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Simulación del ciclo']];
  if (!k) return `${crumbs(base)}<div class="card"><p class="empty">El plan todavía no tiene asignaciones. La simulación arranca en la etapa de aprobación.</p></div>`;
  const st = E.delegStats(U, P).filter(r => r.units);
  const sim = P.sim;
  const lever = (id, n, v, min, max, step, fmt) => `<label class="pl-form" style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">${n} <b style="color:var(--text)">${fmt(v)}</b><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}" style="accent-color:var(--accent)"></label>`;
  return `${crumbs(base)}${simBar(P)}
  <section class="kpis">${kpiCards(k).join('')}</section>
  <div class="split">
    <section class="card"><div class="card-h"><h2>Avance del ciclo de aprobación <small>pares unidad-insumo por día hábil</small></h2></div><div class="pl-chart">${chartProgress(P)}</div>
      <p class="note">El plan pasa por la unidad, la delegación y la Oficina Central. Cada negociación regresa el insumo a la unidad y vuelve a subir.</p></section>
    <section class="card"><div class="card-h"><h2>Delegaciones <small>unidades autorizadas por Oficina Central</small></h2></div><div class="pl-map">${mapDeleg(st)}</div>
      <div class="legend" style="margin-top:6px"><span><i class="sw" style="background:#334155"></i>0 %</span><span><i class="sw" style="background:#0f766e"></i>50 %</span><span><i class="sw" style="background:#2dd4bf"></i>100 %</span></div></section>
  </div>
  <section class="card"><div class="card-h"><h2>Reglas de los actores simulados <small>aplican a los días que faltan del plan</small></h2></div>
    <div class="pl-form">${lever('sl-col', 'Colchón que piden las unidades', sim.colchon, 0, 0.4, 0.05, v => pct(v))}${lever('sl-del', 'Unidades que revisa cada delegación por día', sim.capDel, 2, 20, 1, v => v)}${lever('sl-oc', 'Unidades que revisa Oficina Central por día', sim.capOC, 10, 150, 10, v => v)}${lever('sl-tol', 'Tolerancia de Oficina Central sobre el máximo', sim.tolOC, 0, 0.3, 0.05, v => pct(v))}${lever('sl-pre', 'Presupuesto contra el pronóstico', sim.presupuesto, 1, 1.3, 0.01, v => pct(v - 1, 0).replace(/^/, '+'))}</div>
    <p class="note">Reglas: la unidad negocia si su necesidad (necesidad real + colchón) supera la propuesta en más de 10 % y rechaza claves que ya no prescribe. La delegación acepta lo que cabe en 125 % del consumo histórico o un cambio justificado. Central aprueba dentro del máximo más la tolerancia y, fuera de eso, solo si hay presupuesto.</p></section>
  <section class="card"><div class="card-h"><h2>Por delegación</h2></div>${table('simdel', [{ h: 'Delegación', v: r => r.d.nombre }, { h: 'Unidades', n: true, v: r => r.units }, { h: 'Verificadas por la unidad', n: true, v: r => r.umDone, opt: true }, { h: 'Por la delegación', n: true, v: r => r.delDone }, { h: 'Por O. Central', n: true, v: r => r.ocDone }, { h: 'Insumos negociados', n: true, v: r => r.neg }, { h: 'Último día de la delegación', n: true, v: r => r.lastDel ?? -1, f: r => (r.lastDel == null ? '—' : `día ${r.lastDel}`) }, { h: 'Estatus', v: r => r.status, f: r => chip(r.status === 'Finalizado' ? 'finalizado' : r.status === 'Verificada' ? 'verificada' : r.status === 'En revisión' ? 'revision' : 'pendiente', r.status) }], st)}</section>
  <section class="card"><div class="card-h"><h2>¿Qué método de propuesta conviene? <small>ciclo completo simulado desde cero, mismas reglas</small></h2><button class="btn" id="cmp-run">${S.cmp ? 'Recalcular' : 'Calcular comparación'}</button></div><div id="cmp">${S.cmp ? cmpTable() : '<p class="empty">Calcula 4 ciclos completos en segundo plano (unos segundos cada uno).</p>'}</div></section>
  <section class="card"><div class="card-h"><h2>Cómo se calcula</h2></div><div class="pl-defs">
    <p><b>Universo.</b> 1,033 unidades ISSSTE en operación (CLUES ago 2026) en 32 delegaciones y las 60 claves CNIS del gemelo; el 1er nivel recibe las 34 claves de farmacia y el 2º y 3er nivel las 60. 38,528 pares unidad-insumo.</p>
    <p><b>Consumo.</b> 36 meses por par (nov 2023 a oct 2026) según el tamaño de la unidad, el peso de prescripción de la clave, estacionalidad respiratoria, tendencia de crónicos y meses con desabasto. Para 2027 el gemelo agrega cambios que la unidad conoce y el pronóstico no: más derechohabientes, servicios nuevos, sustitución terapéutica o claves que dejan de usarse.</p>
    <p><b>Propuesta.</b> Holt-Winters mensual con estacionalidad de 12 meses: mínimo = pronóstico de 2027, máximo = mínimo + 1.65 desviaciones (tope 30 %), reparto mensual del pronóstico. Alternativas: la regla de la HU08 (mínimo + 10 % repartido igual) y el consumo del año anterior.</p>
    <p><b>Indicadores.</b> El error y la sobreasignación se miden contra la necesidad real simulada, que en la plataforma real no se conoce: es la ventaja del gemelo para comparar métodos. Precios de referencia por grupo terapéutico (supuesto).</p></div></section>`;
};
BIND.simulacion = ({ P }) => {
  const map = { 'sl-col': 'colchon', 'sl-del': 'capDel', 'sl-oc': 'capOC', 'sl-tol': 'tolOC', 'sl-pre': 'presupuesto' };
  for (const [id, key] of Object.entries(map)) $('#' + id)?.addEventListener('change', e => commit({ plan: P.id, a: 'simCfg', cfg: { [key]: +e.target.value } }, { toast: 'Regla actualizada para los días que faltan' }));
  $('#cmp-run')?.addEventListener('click', () => runCompare(P));
};
function chartProgress(P) {
  const Hh = P.hist.filter(Boolean); if (!Hh.length) return '<p class="empty">Avanza la simulación para ver la curva.</p>';
  const W = 640, H = 220, pl = 48, pr = 8, pt = 10, pb = 26, n = P.hist.length;
  const tot = Hh[0].aprobado + Hh[0].rechazado + Hh[0].negociacion + Hh[0].pendiente;
  const X = d => pl + (W - pl - pr) * d / Math.max(1, n - 1), Y = v => pt + (H - pt - pb) * (1 - v / tot);
  const layers = [['aprobado', '#34d399'], ['rechazado', '#f87171'], ['negociacion', '#c084fc'], ['pendiente', '#fbbf24']];
  let g = '', acc = P.hist.map(() => 0);
  for (const [k, col] of layers) {
    const top = P.hist.map((h, i) => (h ? acc[i] + h[k] : acc[i]));
    const pts = top.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ') + ' ' + acc.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).reverse().join(' ');
    g += `<polygon points="${pts}" fill="${col}" fill-opacity=".75"/>`;
    acc = top;
  }
  for (const f of [0, 0.5, 1]) g += `<text class="ax" x="${pl - 6}" y="${Y(tot * f) + 3}" text-anchor="end">${pct(f)}</text>`;
  for (let d = 0; d < n; d += 5) g += `<text class="ax" x="${X(d)}" y="${H - 8}" text-anchor="middle">día ${d}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Avance del ciclo">${g}</svg><div class="legend" style="margin-top:6px">${layers.map(([k, c]) => `<span><i class="sw" style="background:${c}"></i>${E.DICT[k] || k}</span>`).join('')}</div>`;
}
function mapDeleg(st) {
  const O = S.outline; if (!O) return '';
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const s of O.estados) for (const p of s.polys) for (const [x, y] of p.ext) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const pad = 20, P2 = (x, y) => `${(x - minX + pad).toFixed(0)} ${(maxY - y + pad).toFixed(0)}`;
  const by = Object.fromEntries(st.map(r => [r.d.cve, r]));
  const col = f => { const a = [51, 65, 85], b = [45, 212, 191]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`; };
  return `<svg viewBox="0 0 ${(maxX - minX + 2 * pad).toFixed(0)} ${(maxY - minY + 2 * pad).toFixed(0)}" role="img" aria-label="Avance por delegación">${O.estados.map(s => { const r = by[s.cve]; const f = r ? r.ocDone / r.units : 0; return `<path d="${s.polys.map(p => 'M' + p.ext.map(([x, y]) => P2(x, y)).join('L') + 'Z').join('')}" fill="${col(f)}"><title>${esc(s.nombre)}: ${r ? `${r.ocDone} de ${r.units} unidades autorizadas` : 'sin unidades'}</title></path>`; }).join('')}</svg>`;
}
// comparación en segundo plano
let worker = null;
function runCompare(P) {
  const scen = [['pronostico', 'Pronóstico del gemelo'], ['regla', 'Regla HU08: mínimo + 10 %'], ['anterior', 'Consumo del año anterior'], ['pronostico+', 'Pronóstico con colchón de 30 %']];
  S.cmp = []; $('#cmp').innerHTML = '<p class="empty">Calculando 4 ciclos completos…</p>';
  const done = r => { S.cmp.push(r); const el = $('#cmp'); if (el) el.innerHTML = cmpTable(); };
  try {
    worker ||= new Worker(new URL('./plan-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => done(e.data);
    worker.onerror = () => { $('#cmp').innerHTML = '<p class="empty">No se pudo calcular en segundo plano en este navegador.</p>'; };
    scen.forEach(([m, n]) => worker.postMessage({ data: S.data, metodo: m.replace('+', ''), n, sim: { ...P.sim, colchon: m.endsWith('+') ? 0.3 : P.sim.colchon } }));
  } catch { $('#cmp').innerHTML = '<p class="empty">Este navegador no permite cálculo en segundo plano.</p>'; }
}
function cmpTable() {
  const R = S.cmp;
  if (!R.length) return '<p class="empty">Calculando…</p>';
  const best = (k, low) => (low ? Math.min : Math.max)(...R.map(r => r.k[k]));
  const td = (r, k, txt, low) => `<td class="n" style="${r.k[k] === best(k, low) ? 'color:var(--ok);font-weight:650' : ''}">${txt}</td>`;
  return `<div class="pl-table"><table><thead><tr><th>Método</th><th class="n">Días hábiles</th><th class="n">Aprobados a la primera</th><th class="n">Rondas</th><th class="n">Error vs necesidad</th><th class="n">Sobreasignado</th><th class="n">Faltante</th><th class="n">Costo del plan</th></tr></thead><tbody>${R.map(r => `<tr><td>${esc(r.n)}</td>${td(r, 'day', r.k.day, true)}${td(r, 'first', pct(r.k.first))}${td(r, 'rounds', f1(r.k.rounds), true)}${td(r, 'wape', pct(r.k.wape, 1), true)}${td(r, 'over', money(r.k.over), true)}${td(r, 'under', money(r.k.under), true)}${td(r, 'costo', money(r.k.costo), true)}</tr>`).join('')}</tbody></table></div>${R.length < 4 ? '<p class="note">Faltan escenarios…</p>' : ''}`;
}

// ---------- Bitácora (HU02 Sprint 3, REQ_NOFUN_07)
VIEWS.bitacora = ({ P }) => {
  const f = S.f_log ||= { q: '' };
  const L = P.log.filter(l => !f.q || (l.who + ' ' + l.txt).toLowerCase().includes(f.q.toLowerCase())).slice().reverse();
  return `${crumbs([['Planes de necesidad', '#/'], [P.folio, `#/p/${P.id}`], ['Bitácora']])}<section class="card"><div class="pl-head"><div><span class="eyebrow">${esc(P.folio)}</span><h1>Registro de movimientos</h1><p>Acciones de los usuarios sobre el plan. Las respuestas simuladas se resumen en el avance diario.</p></div><div class="pl-actions"><button class="btn" id="lg-csv">Descargar</button></div></div>
    <div class="pl-filters"><input type="search" id="lg-q" placeholder="Buscar en la bitácora" value="${esc(f.q)}"></div>
    <ul class="pl-log">${L.slice(0, 400).map(l => `<li><time>día ${l.t}</time><b>${esc(l.who)}</b><span>${esc(l.txt)}</span></li>`).join('') || '<li><span class="muted">Sin movimientos.</span></li>'}</ul></section>`;
};
BIND.bitacora = ({ P }) => {
  $('#lg-q').addEventListener('input', e => { S.f_log.q = e.target.value; clearTimeout(S._t); S._t = setTimeout(render, 250); });
  $('#lg-csv').addEventListener('click', () => download(`${P.id}_bitacora.csv`, [['Dia', 'Actor', 'Movimiento'], ...P.log.map(l => [l.t, l.who, l.txt])]));
};

// ------------------------------------------------------------------ arranque
async function init() {
  const [iss, meds, outline] = await Promise.all(['assets/estados_issste.json', 'assets/medicamentos.json', 'assets/estados_mx.json'].map(u => fetch(u).then(r => r.json())));
  S.data = { iss, meds }; S.outline = outline;
  S.U = E.buildUniverse(iss, meds);
  S.entries = loadEntries();
  S.plans = E.replay(S.U, S.entries);
  try { S.seenBy = JSON.parse(localStorage.getItem('planeacion.vistos') || '{}'); } catch { S.seenBy = {}; }
  addEventListener('beforeunload', () => { try { localStorage.setItem('planeacion.vistos', JSON.stringify(S.seenBy || {})); } catch { /* nada */ } });
  $('#loading').remove();
  if (!location.hash) location.hash = `#/p/${S.plans[0]?.id || ''}`;
  render();
}
init();

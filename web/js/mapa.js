// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  mapa.js · Red estatal en tiempo real (Hidalgo)
//  Semáforo de abasto por unidad, camionetas del CEDIS en ruta, reabastos
//  urgentes y alertas. Mismo reloj y datos que las demás vistas.
// =====================================================================
import { Network, DAY, MIN, H } from './network.js';
import { UnitSupply, SEASON_AMP, reqScore, scenario } from './supply.js';
import { initScenario, switchScenario } from './scenario-ui.js';
import { installInventory, CedisInventory, POLICIES, policy, switchPolicy } from './network-sim.js';
import { forecastSeries } from './forecast.js';
import { Router, COST } from './routing.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('es-MX');
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / H)).padStart(2, '0')}:${String(Math.floor((s % H) / MIN)).padStart(2, '0')}`; };
const plural = w => (/[aeiou]$/.test(w) ? w + 's' : w + 'es');
const SPEEDS = { 1: 1, 10: 10, 60: 60, 300: 300 };
const LEVEL_TXT = { ok: 'Abasto normal', warn: 'Con faltantes', crit: 'Crítico' };
const REQ_STATE = { sent: ['crit', 'Enviada'], preparing: ['warn', 'En preparación'], transfer: ['warn', 'Transferencia'], enroute: ['info', 'En camino'], delivered: ['ok', 'Recibida'] };
const HOSP = new Set(['HGZ', 'HGZ/MF', 'HG', 'HGSZ', 'CH', 'UMF/H']);

const app = window.__mapa = { t: 7.5 * H, speed: 60, playing: true, tab: 'units', sel: null };

// ---------------------------------------------------------------------
async function init() {
  initScenario();
  const qs = new URLSearchParams(location.search);
  if (qs.has('t') && isFinite(+qs.get('t'))) app.t = +qs.get('t');
  const [data, catalog] = await Promise.all([
    fetch('assets/unidades_hidalgo.json').then(r => r.json()),
    fetch('assets/medicamentos.json').then(r => r.json()),
  ]);
  app.inv = installInventory(data, catalog);
  app.net = new Network(data, catalog);
  await app.net.prepare(Math.floor(app.t / DAY), p => { $('load-bar').style.width = `${(p * 100).toFixed(0)}%`; $('load-msg').textContent = `${Math.round(p * 60)} de 60 unidades`; });
  buildMap();
  app.router = new Router(app.net);
  app.routeMode = 'opt';
  buildControls();
  app.snap = app.net.snapshot(app.t);
  if (qs.get('tab')) { app.tab = qs.get('tab'); document.querySelectorAll('#side-tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === app.tab)); }
  if (qs.get('lote')) { app.traceQ = qs.get('lote'); app.tab = 'trace'; document.querySelectorAll('#side-tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === 'trace')); }
  renderAll(true);
  $('loading').remove();
  let last = performance.now(), acc = 0;
  const loop = async now => {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (app.playing && !app.busy) app.t += dt * SPEEDS[app.speed];
    const idx = Math.floor(app.t / DAY);
    if (idx !== app.net.day && !app.busy) {
      app.busy = true; await app.net.prepare(idx); app.busy = false; acc = 1;
    }
    acc += dt;
    if (acc > 0.8) { acc = 0; app.snap = app.net.snapshot(app.t); renderAll(); }
    drawVans();
    $('clock').textContent = `${app.net.cal.dateLabel(Math.floor(app.t / DAY))} · ${hhmm(app.t)}`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function buildControls() {
  $('btn-play').addEventListener('click', () => setPlaying(!app.playing));
  document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  setSpeed(app.speed); setPlaying(true);
  document.querySelectorAll('#side-tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#side-tabs button').forEach(x => x.classList.toggle('active', x === b));
    app.tab = b.dataset.tab; renderSide(true); drawOpt();
  }));
  $('go-unit').addEventListener('click', e => { e.currentTarget.href = `unidad.html?t=${Math.floor(app.t)}${app.sel?.kind === 'unit' ? '&u=' + app.sel.u.clues : ''}`; });
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); setPlaying(!app.playing); } if (e.key === 'Escape') select(null); });
}
function setPlaying(p) {
  app.playing = p;
  $('btn-play').innerHTML = p
    ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const st = $('sim-status'); st.textContent = p ? 'En vivo · simulado' : 'En pausa'; st.classList.toggle('paused', !p);
}
function setSpeed(s) { app.speed = s; document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('active', +b.dataset.speed === s)); }

// ---------------------------------------------------------------------
//  Mapa (SVG con proyección equirectangular)
// ---------------------------------------------------------------------
const LON0 = -99.95, LAT0 = 21.48, KX = 1000 * Math.cos(20.5 * Math.PI / 180), KY = 1000;
const proj = (lon, lat) => [(lon - LON0) * KX, (LAT0 - lat) * KY];
function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.appendChild(e); return e; }

function buildMap() {
  const net = app.net, box = $('map');
  const svg = app.svg = el('svg', { role: 'img', 'aria-label': 'Mapa de Hidalgo con unidades y camionetas' });
  box.insertBefore(svg, box.firstChild);
  const defs = el('defs', {}, svg);
  const mk = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#a78bfa' }, mk);
  // contorno del estado
  const d = net.data.outline.map(([lon, lat], i) => `${i ? 'L' : 'M'}${proj(lon, lat).map(v => v.toFixed(1)).join(',')}`).join('') + 'Z';
  el('path', { d, class: 'state' }, svg);
  // rutas
  app.gRoutes = el('g', {}, svg);
  app.routeEls = {};
  const C = proj(net.cedis.lon, net.cedis.lat);
  for (const [id, r] of Object.entries(net.routes)) {
    const us = net.units.filter(u => u.ruta === id).sort((a, b) => a.min - b.min);
    const pts = [C, ...us.map(u => proj(u.lon, u.lat))];
    app.routeEls[id] = el('polyline', { points: pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '), class: 'route-line', stroke: r.color }, app.gRoutes);
  }
  app.gFlows = el('g', {}, svg);
  // unidades
  app.gUnits = el('g', {}, svg);
  app.unitEls = new Map();
  for (const u of net.units) {
    const [x, y] = proj(u.lon, u.lat);
    const g = el('g', { 'data-clues': u.clues }, app.gUnits);
    const pulse = el('circle', { cx: x, cy: y, r: 8, class: 'pulse', visibility: 'hidden' }, g);
    const hosp = HOSP.has(u.tipo);
    const m = hosp ? el('rect', { class: 'unit-m ok' }, g) : el('circle', { cx: x, cy: y, class: 'unit-m ok' }, g);
    const lbl = el('text', { x: x + 9, y: y + 4, class: 'unit-l' }, g); lbl.textContent = u.nombre.replace(/^HOSPITAL GENERAL DE ZONA N° 5, /, 'HGZ 5 ');
    m.addEventListener('click', ev => { ev.stopPropagation(); select({ kind: 'unit', u }); });
    app.unitEls.set(u, { g, m, pulse, lbl, x, y, hosp });
  }
  // CEDIS
  el('rect', { x: C[0] - 9, y: C[1] - 9, width: 18, height: 18, rx: 4, class: 'cedis-m' }, svg);
  const cl = el('text', { x: C[0] + 13, y: C[1] - 10, class: 'cedis-l' }, svg); cl.textContent = 'CEDIS';
  app.gVans = el('g', {}, svg);
  app.vanEls = new Map();
  // vista inicial
  const xs = net.data.outline.map(p => proj(...p)[0]), ys = net.data.outline.map(p => proj(...p)[1]);
  app.home = { x: Math.min(...xs) - 40, y: Math.min(...ys) - 40, w: Math.max(...xs) - Math.min(...xs) + 80, h: Math.max(...ys) - Math.min(...ys) + 80 };
  app.vb = { ...app.home };
  fitAspect(); applyVB();
  bindPanZoom();
  new ResizeObserver(() => { fitAspect(); applyVB(); }).observe(box);
  svg.addEventListener('click', () => select(null));
  $('z-in').addEventListener('click', () => zoom(0.7)); $('z-out').addEventListener('click', () => zoom(1 / 0.7));
  $('z-reset').addEventListener('click', () => { app.vb = { ...app.home }; fitAspect(); applyVB(); });
}
function fitAspect() {
  const r = app.svg.getBoundingClientRect(); if (!r.width) return;
  const a = r.width / r.height, vb = app.vb, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
  if (vb.w / vb.h < a) vb.w = vb.h * a; else vb.h = vb.w / a;
  vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
}
function pxScale() { const r = app.svg.getBoundingClientRect(); return r.width ? app.vb.w / r.width : 1; }
function applyVB() {
  const vb = app.vb; app.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const s = pxScale(), showAll = s < 0.75;
  for (const [, e] of app.unitEls) {
    const r = (e.hosp ? 7 : 6) * s;
    if (e.hosp) { e.m.setAttribute('x', e.x - r); e.m.setAttribute('y', e.y - r); e.m.setAttribute('width', 2 * r); e.m.setAttribute('height', 2 * r); e.m.setAttribute('rx', 2 * s); }
    else e.m.setAttribute('r', r);
    e.pulse.setAttribute('r', 9 * s);
    e.lbl.setAttribute('x', e.x + 10 * s); e.lbl.setAttribute('y', e.y + 4 * s);
    e.lbl.style.fontSize = `${11 * s}px`; e.lbl.style.strokeWidth = `${3 * s}px`;
    e.lbl.style.display = (showAll || e.hosp) ? '' : 'none';
  }
  document.querySelectorAll('.cedis-l').forEach(t => { t.style.fontSize = `${12 * s}px`; t.style.strokeWidth = `${3 * s}px`; });
  app.scale = s;
}
function zoom(k, cx, cy) {
  const vb = app.vb;
  cx ??= vb.x + vb.w / 2; cy ??= vb.y + vb.h / 2;
  const nw = Math.min(app.home.w * 1.4, Math.max(60, vb.w * k)), kk = nw / vb.w;
  vb.x = cx - (cx - vb.x) * kk; vb.y = cy - (cy - vb.y) * kk; vb.w *= kk; vb.h *= kk;
  applyVB();
}
function bindPanZoom() {
  const svg = app.svg, pts = new Map();
  let start = null, moved = false;
  const toSvg = (cx, cy) => { const r = svg.getBoundingClientRect(); return [app.vb.x + (cx - r.left) / r.width * app.vb.w, app.vb.y + (cy - r.top) / r.height * app.vb.h]; };
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); start = { vb: { ...app.vb }, pts: new Map(pts) }; moved = false; });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = svg.getBoundingClientRect(), s = start.vb.w / r.width;
    if (pts.size === 1) {
      const [p0] = start.pts.values(), [p1] = pts.values();
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      if (Math.hypot(dx, dy) > 4) { moved = true; svg.classList.add('dragging'); }
      app.vb.x = start.vb.x - dx * s; app.vb.y = start.vb.y - dy * s; applyVB();
    } else if (pts.size === 2 && start.pts.size === 2) {
      moved = true;
      const a0 = [...start.pts.values()], a1 = [...pts.values()];
      const d0 = Math.hypot(a0[0][0] - a0[1][0], a0[0][1] - a0[1][1]), d1 = Math.hypot(a1[0][0] - a1[1][0], a1[0][1] - a1[1][1]);
      const k = d0 / Math.max(10, d1);
      const mid = [(a1[0][0] + a1[1][0]) / 2, (a1[0][1] + a1[1][1]) / 2];
      app.vb = { ...start.vb }; const [cx, cy] = toSvg(mid[0], mid[1]); zoom(k, cx, cy);
    }
  });
  const end = e => { pts.delete(e.pointerId); svg.classList.remove('dragging'); start = pts.size ? { vb: { ...app.vb }, pts: new Map(pts) } : null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => { if (moved) { e.stopPropagation(); moved = false; } }, true);
  svg.addEventListener('wheel', e => { e.preventDefault(); const [cx, cy] = toSvg(e.clientX, e.clientY); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy); }, { passive: false });
}

// ---------------------------------------------------------------------
//  Camionetas
// ---------------------------------------------------------------------
function drawVans() {
  if (!app.snap) return;
  const vans = app.vans = app.net.vans(app.t, app.snap);
  const live = new Set();
  const s = app.scale || 1;
  for (const v of vans) {
    if (v.kind === 'route' && (v.state === 'scheduled' || v.state === 'done')) continue;
    live.add(v.id);
    let e = app.vanEls.get(v.id);
    if (!e) {
      const g = el('g', { class: 'van' + (v.kind === 'urgent' ? ' urgent' : '') }, app.gVans);
      const shape = v.kind === 'urgent' ? el('rect', {}, g) : el('circle', { fill: v.color }, g);
      const tx = el('text', {}, g); tx.textContent = v.kind === 'urgent' ? '!' : v.vehicle.replace('U-0', '');
      g.addEventListener('click', ev => { ev.stopPropagation(); select({ kind: 'van', id: v.id }); });
      e = { g, shape, tx }; app.vanEls.set(v.id, e);
    }
    const [x, y] = proj(...v.pos);
    if (v.kind === 'urgent') { const r = 7 * s; e.shape.setAttribute('x', x - r); e.shape.setAttribute('y', y - r); e.shape.setAttribute('width', 2 * r); e.shape.setAttribute('height', 2 * r); e.shape.setAttribute('transform', `rotate(45 ${x} ${y})`); }
    else { e.shape.setAttribute('cx', x); e.shape.setAttribute('cy', y); e.shape.setAttribute('r', 9 * s); }
    e.tx.setAttribute('x', x); e.tx.setAttribute('y', y); e.tx.style.fontSize = `${9 * s}px`;
    e.g.classList.toggle('sel', app.sel?.kind === 'van' && app.sel.id === v.id);
  }
  for (const [id, e] of app.vanEls) if (!live.has(id)) { e.g.remove(); app.vanEls.delete(id); }
  for (const [id, line] of Object.entries(app.routeEls)) line.classList.toggle('active', vans.some(v => v.kind === 'route' && v.id === id && !['scheduled', 'done'].includes(v.state)));
  if (app.sel?.kind === 'van' && (!app._vp || performance.now() - app._vp > 700)) { app._vp = performance.now(); renderPanel(); }
}

// ---------------------------------------------------------------------
//  Render: semáforo, KPIs, lista lateral y ficha
// ---------------------------------------------------------------------
function renderAll(force) {
  const snap = app.snap;
  for (const x of snap.units) {
    const e = app.unitEls.get(x.u);
    let lv = x.level;
    if (app.claveFocus) {   // vista por clave: color según la existencia de esa clave
      const c = app.claveFocus;
      lv = !x.s.byClave.has(c) ? 'na' : x.st.stock.get(c) <= 0 ? 'crit' : x.s.status(c, x.st.stock.get(c)) === 'low' ? 'warn' : 'ok';
    }
    e.m.setAttribute('class', `unit-m ${lv}${(app.sel?.kind === 'unit' && app.sel.u === x.u) ? ' sel' : ''}`);
    e.pulse.setAttribute('visibility', x.open.some(r => r.level <= 2) ? 'visible' : 'hidden');
  }
  const T = snap.totals;
  const enRuta = (app.vans || []).filter(v => !['scheduled', 'done'].includes(v.state)).length;
  const K = [
    ['Abasto estatal (claves ≥ mínimo)', (100 * T.abasto).toFixed(1), '%', T.abasto >= 0.95 ? 'ok' : T.abasto >= 0.9 ? 'warn' : 'crit'],
    ['Unidades en rojo', T.crit, '', T.crit ? 'crit' : 'ok'],
    ['Unidades con faltantes', T.warn, '', T.warn ? 'warn' : 'ok'],
    ['Alertas abiertas al CEDIS', T.open, '', T.open ? 'crit' : 'ok'],
    ['Camionetas en ruta', enRuta, '', ''],
    ['Por caducar ≤ 90 días (piezas)', fmt(T.expPz), '', T.exp30 ? 'crit' : T.expPz ? 'warn' : 'ok'],
  ];
  const html = K.map(([l, v, u, t]) => `<div class="kn ${t}"><span>${l}</span><b>${v}${u ? `<i>${u}</i>` : ''}</b></div>`).join('');
  if ($('kpis-net')._h !== html) { $('kpis-net').innerHTML = html; $('kpis-net')._h = html; }
  $('n-alerts').textContent = T.open || '';
  const SH = app.net.shortage(snap); $('n-short').textContent = SH.red.length + SH.local.length || '';
  $('n-short').className = SH.state === 'contingencia' || SH.red.length ? 'crit' : '';
  const sug = app.net.suggestions(snap); $('n-redis').textContent = sug.length || '';
  drawFlows();
  $('map-sub').textContent = `${T.ok} en verde · ${T.warn} en amarillo · ${T.crit} en rojo · recetas completas hoy ${T.rx ? (100 * T.rxFull / T.rx).toFixed(1) : '100'} %`;
  renderSide(force);
  if (app.sel) renderPanel();
}

function renderSide(force) {
  const snap = app.snap, box = $('side-body');
  let html = '';
  if (app.tab === 'units') {
    const order = { crit: 0, warn: 1, ok: 2 };
    html = [...snap.units].sort((a, b) => order[a.level] - order[b.level] || a.abasto - b.abasto).map(x =>
      `<button class="row" data-u="${x.u.clues}"><i class="dot ${x.level}"></i><span><b>${esc(x.u.nombre)}</b>
        <small>${x.u.ruta} · ${x.u.inst} ${x.u.tipo} · ${x.zeros.length ? `${x.zeros.length} en cero` : 'sin claves en cero'}${x.open.length ? ` · ${x.open.length} alerta${x.open.length > 1 ? 's' : ''}` : ''}</small></span>
        <span class="r"><strong>${(100 * x.abasto).toFixed(0)} %</strong>abasto</span></button>`).join('');
  } else if (app.tab === 'vans') {
    const vans = (app.vans || []);
    const row = v => {
      const st = vanState(v);
      return `<button class="row" data-v="${v.id}"><i class="dot" style="background:${v.color};${v.kind === 'urgent' ? 'border-radius:2px;transform:rotate(45deg)' : ''}"></i>
        <span><b>${v.kind === 'urgent' ? `${esc(v.vehicle)} · ${v.id}` : `${v.vehicle} · ${v.id} ${esc(v.route.name)}`}</b><small>${esc(st)}</small></span>
        <span class="r">${v.kind === 'route' ? `<strong>${v.trip.stops.filter(s => app.t >= s.actual + 20 * MIN).length}/${v.trip.stops.length}</strong>unidades` : `<strong>N${v.level}</strong>${esc(v.unit.nombre.slice(0, 18))}`}</span></button>`;
    };
    const active = vans.filter(v => !['scheduled', 'done'].includes(v.state)), sched = vans.filter(v => v.state === 'scheduled'), done = vans.filter(v => v.state === 'done');
    html = (active.length ? `<p class="sec-t">En ruta</p>${active.map(row).join('')}` : '') +
      (sched.length ? `<p class="sec-t">Programadas hoy</p>${sched.map(row).join('')}` : '') +
      (done.length ? `<p class="sec-t">Terminadas</p>${done.map(row).join('')}` : '') || '<p class="empty">Sin rutas hoy</p>';
  } else if (app.tab === 'redis') {
    const sug = app.net.suggestions(snap);
    const head = `<p class="note">Sugerencias para mover medicamento entre unidades: de quien tiene de más (o un lote que no alcanzará a usar antes de caducar) a quien está en cero o bajo mínimo. Toca una para verla en el mapa.</p>
      <label class="chk"><input type="checkbox" id="flows-all" ${app.flowsAll ? 'checked' : ''}> Mostrar todas en el mapa</label>`;
    html = head + (sug.slice(0, 40).map(s => {
      const ok = app.approved?.has(s.key || (s.key = `${s.m.c}|${s.from.clues}|${s.to.clues}|${s.lot || ''}`));
      const why = s.kind === 'caducidad' ? `Evita caducidad · lote ${s.lot} caduca en ${s.days} d` : s.alert ? `Atiende alerta ${s.alert}` : s.toStatus === 'zero' ? 'Cubre faltante · en cero' : 'Cubre faltante · bajo mínimo';
      return `<button class="row" data-sug="${s.id}"><i class="dot ${s.kind === 'caducidad' ? 'warn' : s.prio <= 1 ? 'crit' : 'ok'}" style="${s.kind === 'caducidad' ? '' : 'background:#a78bfa'}"></i>
        <span><b>${fmt(s.q)} ${esc(plural(s.m.pz))} · ${esc(s.m.n)}</b><small>${esc(s.from.nombre)} → ${esc(s.to.nombre)} · ${Math.round(s.km)} km</small><small>${esc(why)}</small></span>
        <span class="r">${ok ? '<span class="chip ok">Aprobada</span>' : `<strong>+${s.gain ? s.gain.toFixed(1) + ' d' : '—'}</strong>${s.gain ? 'cobertura' : ''}`}</span></button>`;
    }).join('') || '<p class="empty">Sin sugerencias: la red está balanceada</p>');
  } else if (app.tab === 'fc') {
    const F = stateForecast();
    html = `<p class="note">Pronóstico estatal por clave para las próximas 2 semanas contra las 2 anteriores (suma de las 60 unidades). "En riesgo" son las unidades cuya existencia no alcanza, según el pronóstico, hasta su próxima entrega.</p>
      <div class="fc-sum"><div><span>Claves con alza ≥ 10 %</span><b>${F.filter(x => x.f.changePct >= 10).length}</b></div><div><span>Precisión media</span><b>${Math.max(0, 100 - 100 * F.reduce((a, x) => a + x.f.wape * x.f.last14, 0) / Math.max(1, F.reduce((a, x) => a + x.f.last14, 0))).toFixed(0)} %</b></div><div><span>Unidades-clave en riesgo</span><b>${F.reduce((a, x) => a + x.risk.length, 0)}</b></div></div>` +
      F.map(x => `<button class="row fc-row" data-fc="${x.m.c}"><i class="dot ${x.f.changePct >= 10 ? 'warn' : x.risk.length ? 'crit' : 'ok'}"></i>
        <span><b>${esc(x.m.n)}${SEASON_AMP[x.m.c] ? ' <em class="tag-s">temporada</em>' : ''}</b><small>${fmt(x.f.last14)} → ${fmt(x.f.next14)} ${esc(plural(x.m.pz))} · precisión ${Math.max(0, 100 - x.f.wape * 100).toFixed(0)} %${x.risk.length ? ` · ${x.risk.length} en riesgo` : ''}</small>${fcSpark(x)}</span>
        <span class="r"><strong class="${x.f.changePct >= 10 ? 'up' : x.f.changePct <= -10 ? 'down' : ''}">${x.f.changePct >= 0 ? '+' : ''}${x.f.changePct.toFixed(0)} %</strong>2 semanas</span></button>`).join('');
  } else if (app.tab === 'trace') {
    if (!force && box.querySelector('#tr-q')) { renderTrace(); return; }
    box._h = null;
    box.innerHTML = `<div class="tr-search"><input id="tr-q" type="search" placeholder="Lote (LT5165-2000), receta (RX-…) o medicamento" autocomplete="off" value="${esc(app.traceQ || '')}"></div>
      <p class="note">Busca un lote para ver su recorrido completo: proveedor, CEDIS, unidades y pacientes. Toca un lote en la ficha de un medicamento de la unidad para llegar aquí.</p><div id="tr-out"></div>`;
    $('tr-q').addEventListener('input', e => { app.traceQ = e.target.value; renderTrace(); });
    renderTrace();
    return;
  } else if (app.tab === 'alerts') {
    const all = [];
    for (const x of snap.units) for (const r of new Map([...x.open, ...x.st.reqs].map(r => [r.id, r])).values()) all.push({ r, x });
    // cola priorizada: abiertas primero, por puntuación (criticidad VEN, pacientes afectados, hospital, días abierta)
    all.sort((a, b) => (UnitSupply.reqState(a.r, app.t) === 'delivered') - (UnitSupply.reqState(b.r, app.t) === 'delivered') || reqScore(b.r, app.t) - reqScore(a.r, app.t));
    html = `<p class="note">Ordenadas por prioridad: criticidad de la clave (Vital, Esencial, No esencial), pacientes afectados, si es hospital y días abierta.</p>` + (all.map(({ r, x }) => {
      const [tone, lbl] = r.backorder && UnitSupply.reqState(r, app.t) !== 'delivered' ? ['crit', 'Sin existencia en CEDIS'] : REQ_STATE[UnitSupply.reqState(r, app.t)];
      const more = r.lines.length > 1 ? ` + ${r.lines.length - 1} claves` : '';
      return `<button class="row" data-u="${x.u.clues}"><i class="dot ${r.level === 1 ? 'crit' : r.level === 2 ? 'warn' : 'ok'}"></i>
        <span><b>${r.id} · ${esc(r.name)}${more}</b><small>${esc(x.u.nombre)} · N${r.level} · ${VEN_TXT[r.ven]} · se agotó ${app.net.cal.dateLabel(Math.floor(r.t0 / DAY))} ${hhmm(r.t0)}</small></span>
        <span class="r"><strong class="prio">${reqScore(r, app.t)}</strong><span class="chip ${tone}">${lbl}</span><small>llega ${r.backorder ? app.net.cal.dateLabel(Math.floor(r.deliver / DAY)) : hhmm(r.deliver)}</small></span></button>`;
    }).join('') || '<p class="empty">Sin alertas hoy</p>');
  } else if (app.tab === 'routes') {
    if (!force && box.querySelector('#rt-params')) { drawOpt(); return; }
    box._h = null; box.innerHTML = routesHtml(); bindRoutes(box); drawOpt(); return;
  } else if (app.tab === 'alloc') {
    if (!force && box.querySelector('#al-box') && box._day === Math.floor(app.t / DAY)) return;
    box._h = null; box._day = Math.floor(app.t / DAY); box.innerHTML = allocHtml(); bindAlloc(box); return;
  } else if (app.tab === 'short') {
    const SH = app.net.shortage(snap);
    const ST = { normal: ['ok', 'Operación normal', 'Sin claves en cero en la red.'], local: ['warn', 'Desabasto local', 'Faltantes en pocas unidades; el CEDIS tiene existencia. Se resuelve con transferencias o reabasto urgente.'],
      red: ['crit', 'Desabasto de red', 'Hay claves que faltan en muchas unidades o en el CEDIS. Reabastecer unidad por unidad no alcanza: hay que escalar a compras y repartir con prioridad.'],
      contingencia: ['crit', 'Contingencia · desabasto masivo', 'Muchas claves de red al mismo tiempo. Activar reglas de contingencia: reparto por prioridad, surtido para 7 días, alternativas terapéuticas y recetas pendientes con aviso.'] }[SH.state];
    html = `<div class="sh-state ${ST[0]}"><b>${ST[1]}</b><span>${ST[2]}</span>
        <span class="sh-n"><i>${SH.red.length}</i> claves de red · <i>${SH.local.length}</i> locales · <i>${SH.multi}</i> unidades con 3+ claves en cero</span>
        <button class="btn-link sh-toggle" id="sc-toggle">${scenario() === 'contingencia' ? 'Volver a operación normal' : 'Simular contingencia (desabasto masivo)'}</button></div>
      ${shortMatrix(SH)}
      ${SH.rows.slice(0, 30).map(r => `<button class="row sh-row${app.claveFocus === r.m.c ? ' on' : ''}" data-clave="${r.m.c}"><i class="dot ${r.kind === 'red' ? 'crit' : r.kind === 'local' ? 'warn' : 'ok'}"></i>
        <span><b>${esc(r.m.n)} <em class="ven ${r.m.ven}">${VEN_TXT[r.m.ven]}</em></b>
          <small>${r.zeros.length} de ${r.carry.length} unidades en cero · ${r.low.length} bajo mínimo · CEDIS: ${r.cs ? (r.cs.f === 0 ? 'sin existencia' : `${Math.round(r.cs.f * 100)} % disponible`) : 'con existencia'}${r.pending ? ` · ${fmt(r.pending)} recetas pendientes` : ''}</small>
          <small class="sh-act">→ ${esc(r.action)}</small></span>
        <span class="r"><span class="chip ${r.kind === 'red' ? 'crit' : r.kind === 'local' ? 'warn' : 'info'}">${r.kind === 'red' ? 'De red' : r.kind === 'local' ? 'Local' : 'Riesgo'}</span></span></button>`).join('')}`;
  }
  if (!force && box._h === html) return;
  box._h = html; box.innerHTML = html;
  box.querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', () => { const u = app.net.byClues.get(b.dataset.u); select({ kind: 'unit', u }); center(u.lon, u.lat); }));
  box.querySelectorAll('[data-fc]').forEach(b => b.addEventListener('click', () => {
    const x = stateForecast().find(r => r.m.c === b.dataset.fc);
    if (x?.risk.length) { select({ kind: 'unit', u: x.risk[0] }); center(x.risk[0].lon, x.risk[0].lat); }
  }));
  box.querySelector('#sc-toggle')?.addEventListener('click', () => switchScenario(scenario() === 'contingencia' ? 'normal' : 'contingencia'));
  box.querySelectorAll('[data-clave]').forEach(b => b.addEventListener('click', () => {
    app.claveFocus = app.claveFocus === b.dataset.clave ? null : b.dataset.clave;
    select(app.claveFocus ? { kind: 'clave', c: app.claveFocus } : null); renderAll(true);
  }));
  box.querySelector('#flows-all')?.addEventListener('change', e => { app.flowsAll = e.target.checked; drawFlows(); });
  box.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => {
    const s = app.net.suggestions(app.snap).find(x => x.id === b.dataset.sug); if (!s) return;
    select({ kind: 'sug', s }); center((s.from.lon + s.to.lon) / 2, (s.from.lat + s.to.lat) / 2);
  }));
  box.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { select({ kind: 'van', id: b.dataset.v }); const v = app.vans.find(x => x.id === b.dataset.v); if (v) center(...v.pos); }));
}

// ---------------------------------------------------------------------
//  Rutas y costos (optimizador)
// ---------------------------------------------------------------------
const money = n => '$' + Math.round(n).toLocaleString('es-MX');
const pctS = (a, b) => !b ? '—' : Math.abs(a - b) < 0.005 * b ? '0 %' : `${a < b ? '−' : '+'}${Math.abs(100 * (1 - a / b)).toFixed(0)} %`;
function routesHtml() {
  const R = app.router, idx = Math.floor(app.t / DAY);
  const cur = R.current(idx), opt = R.optimize(idx), tc = R.totals(cur), to = R.totals(opt), wk = R.week(idx);
  const P = R.P;
  const cmp = (lbl, a, b, f, better = 'low') => `<tr><td>${lbl}</td><td class="n">${f(a)}</td><td class="n">${f(b)}</td><td class="n ${b < a === (better === 'low') ? 'good' : b === a ? '' : 'bad'}">${a ? pctS(b, a) : '—'}</td></tr>`;
  const list = (app.routeMode === 'opt' ? opt : cur);
  // urgentes de hoy (abiertos, no pendientes de CEDIS)
  const reqs = [];
  for (const x of app.snap.units) for (const r of x.open) if (!r.backorder && r.deliver > app.t && Math.floor(r.t0 / DAY) === idx) reqs.push({ r, u: x.u });
  const up = R.urgentPlan(idx, reqs.slice(0, 12));
  return `<p class="note">Mismos días de visita y mismas cargas; el optimizador reagrupa las unidades en menos viajes y reordena las paradas (ahorros de Clarke-Wright + 2-opt), respetando capacidad (${fmt(P.capacityL)} L) y jornada (${P.maxHours} h). Distancias en línea recta × 1.35 hasta conectar una matriz por carretera.</p>
    <div class="seg rt-mode"><button data-rm="cur" class="${app.routeMode === 'cur' ? 'active' : ''}">Rutas actuales</button><button data-rm="opt" class="${app.routeMode === 'opt' ? 'active' : ''}">Optimizadas</button></div>
    <p class="sec-t">Hoy · ${app.net.cal.dateLabel(idx)}</p>
    <table class="rt-cmp"><thead><tr><th></th><th class="n">Actual</th><th class="n">Optimizada</th><th class="n">Cambio</th></tr></thead><tbody>
      ${cmp('Viajes', tc.trips, to.trips, fmt)}${cmp('Kilómetros', tc.km, to.km, fmt)}${cmp('Horas de chofer', tc.hours, to.hours, v => v.toFixed(1))}
      ${cmp('Costo total', tc.cost, to.cost, money)}${cmp('Costo por entrega', tc.perStop, to.perStop, money)}${cmp('Ocupación de camioneta', tc.fill, to.fill, v => (100 * v).toFixed(0) + ' %', 'high')}</tbody></table>
    ${tc.trips ? `<div class="rt-save ${tc.cost - to.cost < 0 ? 'neg' : ''}">${tc.cost - to.cost >= 0 ? `<b>${money(tc.cost - to.cost)}</b> de ahorro hoy` : `Hoy la optimizada cuesta <b>${money(to.cost - tc.cost)}</b> más (más viajes para cumplir capacidad y jornada)`} · semana: <b>${money(wk.cur.cost - wk.opt.cost)}</b> de ahorro (${pctS(wk.opt.cost, wk.cur.cost)}) · <b>${fmt(wk.cur.km - wk.opt.km)} km</b> menos</div>` : '<p class="empty">Sin rutas hoy</p>'}
    <p class="sec-t">Semana</p>
    <table class="rt-cmp"><thead><tr><th>Día</th><th class="n">Viajes</th><th class="n">Costo actual</th><th class="n">Optimizado</th><th class="n">Ahorro</th></tr></thead><tbody>
      ${wk.days.map(d => `<tr class="${d.idx === idx ? 'today' : ''}"><td>${app.net.cal.dateLabel(d.idx)}</td><td class="n">${d.cur.trips} → ${d.opt.trips}</td><td class="n">${money(d.cur.cost)}</td><td class="n">${money(d.opt.cost)}</td><td class="n good">${d.cur.cost ? pctS(d.opt.cost, d.cur.cost) : '—'}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${wk.cur.trips} → ${wk.opt.trips}</td><td class="n">${money(wk.cur.cost)}</td><td class="n">${money(wk.opt.cost)}</td><td class="n good">${pctS(wk.opt.cost, wk.cur.cost)}</td></tr></tbody></table>
    <p class="sec-t">${app.routeMode === 'opt' ? 'Rutas optimizadas de hoy' : 'Rutas actuales de hoy'}</p>
    ${list.map(r => `<div class="row rt-row"><i class="dot" style="background:${r.color}"></i><span><b>${r.id} · ${esc(r.name)}${r.ok ? '' : ' <em class="crit-t">excede capacidad o jornada</em>'}</b><small>${r.seq.map(u => esc(u.nombre.replace(/^HOSPITAL GENERAL DE ZONA N° 5, /, 'HGZ 5 '))).join(' → ')}</small></span>
      <span class="r"><strong>${money(r.cost)}</strong>${fmt(r.km)} km · ${r.hours.toFixed(1)} h · carga ${(100 * r.fill).toFixed(0)} %</span></div>`).join('') || '<p class="empty">Sin rutas hoy</p>'}
    ${up.length ? `<p class="sec-t">Urgentes de hoy: ¿viaje dedicado o insertar en una ruta?</p>${up.map(x => `<div class="row"><i class="dot crit"></i><span><b>${x.r.id} · ${esc(x.u.nombre)}</b><small>${x.insert ? `Insertar en ${x.insert.route.id} (pasa ${hhmm(x.insert.eta)}, +${fmt(x.insert.extra)} km)` : 'Ninguna ruta pasa antes del límite: viaje dedicado'}</small></span><span class="r"><strong>${x.insert ? money(x.save) : '—'}</strong>${x.insert ? 'ahorro' : money(x.dedicated)}</span></div>`).join('')}` : ''}
    <details id="rt-params" class="rt-params"><summary>Parámetros de costo</summary>
      ${[['kmCost', '$ por km'], ['driverHour', '$ por hora de chofer'], ['fixedTrip', '$ fijo por salida'], ['speedKmh', 'Velocidad (km/h)'], ['unloadMin', 'Descarga por parada (min)'], ['maxHours', 'Jornada máxima (h)'], ['capacityL', 'Capacidad (litros)']].map(([k, l]) => `<label>${l}<input type="number" data-p="${k}" value="${P[k]}" step="any"></label>`).join('')}
      <button class="btn-link" id="rt-reset" type="button">Restablecer valores</button></details>`;
}
function bindRoutes(box) {
  box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { app.routeMode = b.dataset.rm; renderSide(true); }));
  box.querySelectorAll('[data-p]').forEach(i => i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v) && v > 0) { app.router.setParams({ [i.dataset.p]: v }); const open = true; renderSide(true); if (open) $('rt-params').open = true; } }));
  box.querySelector('#rt-reset')?.addEventListener('click', () => { app.router.setParams({ ...COST }); renderSide(true); $('rt-params').open = true; });
}
function drawOpt() {
  const g = app.gOpt || (app.gOpt = el('g', {}, app.svg.querySelector('g') ? app.svg : app.svg));
  if (g.parentNode !== app.svg) app.svg.appendChild(g);
  app.svg.insertBefore(g, app.gUnits);
  const show = app.tab === 'routes' && app.routeMode === 'opt';
  app.gRoutes.style.display = show ? 'none' : '';
  const idx = Math.floor(app.t / DAY), key = show ? `${idx}|${JSON.stringify(app.router.P)}` : '';
  if (g._k === key) return; g._k = key; g.innerHTML = '';
  if (!show) return;
  const C = proj(app.net.cedis.lon, app.net.cedis.lat);
  for (const r of app.router.optimize(idx)) {
    const pts = [C, ...r.seq.map(u => proj(u.lon, u.lat)), C];
    el('polyline', { points: pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '), class: 'route-line active opt', stroke: r.color }, g);
  }
}

// ---------------------------------------------------------------------
//  Inventario del CEDIS y asignación (fase 2)
// ---------------------------------------------------------------------
const LV = { zero: ['crit', 'Sin existencia'], part: ['warn', 'En reparto'], low: ['warn', 'Cobertura baja'], ok: ['ok', 'Normal'], over: ['info', 'Sobreinventario'] };
function invOther() {
  const other = policy() === 'minmax' ? 'forecast' : 'minmax';
  if (!app.invOther) app.invOther = new CedisInventory(app.net.data, app.net.catalog, other);
  return app.invOther;
}
function allocHtml() {
  const idx = Math.floor(app.t / DAY), inv = app.inv, cur = policy();
  const A = cur === 'minmax' ? inv : invOther(), B = cur === 'forecast' ? inv : invOther();
  const ka = A.kpis(idx, 90), kb = B.kpis(idx, 90);
  const cmp = (lbl, a, b, f, better = 'low') => `<tr><td>${lbl}</td><td class="n">${f(a)}</td><td class="n">${f(b)}</td><td class="n ${a === b ? '' : (b < a) === (better === 'low') ? 'good' : 'bad'}">${a ? pctS(b, a) : '—'}</td></tr>`;
  const rows = inv.rows(idx).sort((x, y) => ['zero', 'part', 'low', 'ok', 'over'].indexOf(x.level) - ['zero', 'part', 'low', 'ok', 'over'].indexOf(y.level) || x.cover - y.cover);
  if (!app.allocC) {
    // clave del ejemplo: la que el CEDIS ya reparte o, si no hay, la que deja más unidades con menos de 5 días
    const thin = c => app.snap.units.filter(x => x.s.byClave.has(c) && x.st.stock.get(c) / Math.max(0.05, x.s.demand.get(c)) < 5).length;
    app.allocC = (rows.find(r => r.level === 'zero' || r.level === 'part') || [...rows].sort((x, y) => thin(y.c) - thin(x.c))[0]).c;
  }
  return `<div id="al-box"><p class="note">El CEDIS lleva existencia por clave y lote. Cada lunes pide al proveedor (entrega en 10 a 21 días, con retrasos y entregas parciales). Lo que no alcanza se reparte entre las unidades y de ahí salen los faltantes que ven las unidades.</p>
    <p class="sec-t">Método de pedido del CEDIS</p>
    <div class="seg rt-mode">${Object.entries(POLICIES).map(([k, v]) => `<button data-pol="${k}" class="${cur === k ? 'active' : ''}">${v.label}</button>`).join('')}</div>
    <p class="note">${esc(POLICIES[cur].hint)} Al cambiar, las tres vistas se recalculan con el nuevo método.</p>
    <table class="rt-cmp"><thead><tr><th>Últimos 90 días</th><th class="n">Mín. y máx.</th><th class="n">Pronóstico</th><th class="n">Cambio</th></tr></thead><tbody>
      ${cmp('Nivel de servicio del CEDIS', ka.fill, kb.fill, v => (100 * v).toFixed(1) + ' %', 'high')}
      ${cmp('Días-clave sin existencia', ka.stockoutDays, kb.stockoutDays, fmt)}
      ${cmp('Días-clave en reparto', ka.partDays, kb.partDays, fmt)}
      ${cmp('Claves con algún faltante', ka.claves, kb.claves, fmt)}
      ${cmp('Inventario promedio (días)', ka.invDays, kb.invDays, v => v.toFixed(1))}
      ${cmp('Pedidos al proveedor', ka.orders, kb.orders, fmt, 'none')}</tbody></table>
    <p class="sec-t">Asignación cuando no alcanza</p>${allocBlock(idx)}
    <p class="sec-t">Inventario del CEDIS hoy · ${app.net.cal.dateLabel(idx)}</p>
    ${rows.map(r => `<button class="row al-row${app.allocC === r.c ? ' on' : ''}" data-al="${r.c}"><i class="dot ${LV[r.level][0]}"></i>
      <span><b>${esc(r.m.n)} <em class="ven ${r.m.ven}">${VEN_TXT[r.m.ven]}</em></b>
        <small>${fmt(r.stock)} ${esc(plural(r.m.pz))} · ${isFinite(r.cover) ? r.cover.toFixed(0) + ' días de red' : '—'}${r.onOrder ? ` · en tránsito ${fmt(r.onOrder)}${r.next ? `, llega ${app.net.cal.dateLabel(r.next.eta)}` : ''}` : ' · sin pedido abierto'}</small>
        <small>${r.lots.slice(0, 3).map(l => `${l.lot} (${fmt(l.q)}, cad. ${dateOf(l.exp)})`).join(' · ') || 'sin lotes'}</small></span>
      <span class="r"><span class="chip ${LV[r.level][0]}">${r.level === 'part' ? `${Math.round(r.f * 100)} %` : LV[r.level][1]}</span></span></button>`).join('')}</div>`;
}
function allocBlock(idx) {
  const c = app.allocC, r = app.inv.row(c, idx), m = r.m;
  const units = app.snap.units.filter(x => x.s.byClave.has(c)).map(x => ({ u: x.u, stock: Math.max(0, x.st.stock.get(c)), demand: Math.max(0.05, x.s.demand.get(c)), pack: m.pack || 1, max: x.s.max.get(c) }));
  const req = units.reduce((n, x) => n + Math.max(0, x.max - x.stock), 0);
  const real = Math.min(100, Math.round(100 * r.stock / Math.max(1, req)));
  const pctAvail = app.allocPct ?? (real >= 100 ? 50 : real);
  const A = Math.round(req * pctAvail / 100);
  const res = CedisInventory.allocate(units, A, m.ven);
  const minP = Math.min(...res.rows.map(x => x.afterProp)), minE = Math.min(...res.rows.map(x => x.after));
  const below = (k, d) => res.rows.filter(x => x[k] < d).length;
  const top = [...res.rows].sort((a, b) => a.before - b.before).slice(0, 14);
  return `<p class="note">${esc(m.n)}: las unidades piden ${fmt(req)} ${esc(plural(m.pz))}. Con lo disponible, el reparto proporcional a lo pedido (como hoy) deja a unas unidades con mucho y a otras sin nada. La asignación propuesta iguala los días de cobertura, con más peso a hospitales y a claves vitales.</p>
    ${real >= 100 ? `<p class="note">Hoy el CEDIS tiene existencia suficiente (${fmt(r.stock)}); el ejemplo simula que solo alcanza para una parte.</p>` : ''}
    <label class="al-pct">Disponible: <select id="al-pct">${[...new Set([real, pctAvail, 100, 75, 50, 25])].sort((a, b) => b - a).map(v => `<option value="${v}" ${v === pctAvail ? 'selected' : ''}>${v} % de lo pedido${v === real ? ' (existencia real)' : ''}</option>`).join('')}</select></label>
    <table class="rt-cmp"><thead><tr><th></th><th class="n">Proporcional</th><th class="n">Igualando cobertura</th></tr></thead><tbody>
      <tr><td>Cobertura mínima</td><td class="n">${minP.toFixed(1)} d</td><td class="n good">${minE.toFixed(1)} d</td></tr>
      <tr><td>Unidades con menos de 3 días</td><td class="n">${below('afterProp', 3)}</td><td class="n good">${below('after', 3)}</td></tr>
      <tr><td>Unidades con menos de 7 días</td><td class="n">${below('afterProp', 7)}</td><td class="n good">${below('after', 7)}</td></tr></tbody></table>
    <table class="rt-cmp al-t"><thead><tr><th>Unidad (menor cobertura primero)</th><th class="n">Tiene</th><th class="n">Prop.</th><th class="n">Propuesta</th></tr></thead><tbody>
      ${top.map(x => `<tr><td>${esc(x.u.nombre.slice(0, 34))}<small> · ${x.u.tipo}</small></td><td class="n">${x.before.toFixed(1)} d</td><td class="n">+${fmt(x.prop)} → ${x.afterProp.toFixed(1)} d</td><td class="n good">+${fmt(x.q)} → ${x.after.toFixed(1)} d</td></tr>`).join('')}</tbody></table>`;
}
function bindAlloc(box) {
  box.querySelectorAll('[data-pol]').forEach(b => b.addEventListener('click', () => { if (b.dataset.pol !== policy()) switchPolicy(b.dataset.pol); }));
  box.querySelectorAll('[data-al]').forEach(b => b.addEventListener('click', () => { app.allocC = b.dataset.al; app.allocPct = null; app.claveFocus = app.allocC; renderAll(true); box.querySelector('#al-box')?.scrollIntoView({ block: 'start' }); }));
  box.querySelector('#al-pct')?.addEventListener('change', e => { app.allocPct = +e.target.value; renderSide(true); });
}

// ---------------------------------------------------------------------
//  Matriz de desabasto (clave × unidad)
// ---------------------------------------------------------------------
const VEN_TXT = { V: 'Vital', E: 'Esencial', N: 'No esencial' };
function shortMatrix(SH) {
  const rows = SH.rows.filter(r => r.kind !== 'riesgo').slice(0, 18);
  if (!rows.length) return '';
  const cols = SH.order, cw = 5, ch = 12, L = 0, T = 14, W = cols.length * cw, Hh = T + rows.length * ch;
  let routeTicks = '', prev = null;
  cols.forEach((x, i) => { if (x.u.ruta !== prev) { routeTicks += `<text x="${i * cw + 1}" y="9" class="mx-r">${x.u.ruta}</text>${i ? `<line x1="${i * cw - 0.5}" x2="${i * cw - 0.5}" y1="11" y2="${Hh}" class="mx-sep"/>` : ''}`; prev = x.u.ruta; } });
  const cells = rows.map((r, j) => cols.map((x, i) => {
    if (!x.s.byClave.has(r.m.c)) return '';
    const q = x.st.stock.get(r.m.c), k = q <= 0 ? '#f87171' : x.s.status(r.m.c, q) === 'low' ? '#fbbf24' : '#1f6f5a';
    return `<rect x="${L + i * cw}" y="${T + j * ch}" width="${cw - 1}" height="${ch - 2}" rx="1" fill="${k}"><title>${esc(r.m.n)} · ${esc(x.u.nombre)}: ${fmt(Math.max(0, q))}</title></rect>`;
  }).join('')).join('');
  return `<div class="mx"><div class="mx-names">${rows.map(r => `<span title="${esc(r.m.n)}">${esc(r.m.n)}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" style="height:${Hh}px">${routeTicks}${cells}</svg></div>
    <p class="note mx-leg"><i style="background:#f87171"></i>en cero <i style="background:#fbbf24"></i>bajo mínimo <i style="background:#1f6f5a"></i>con existencia · columnas: 60 unidades por ruta</p>`;
}

// ---------------------------------------------------------------------
//  Pronóstico estatal
// ---------------------------------------------------------------------
function stateForecast() {
  const net = app.net, snap = app.snap, idx = Math.floor(app.t / DAY);
  if (!app._F || app._F.day !== idx) {
    const rows = net.catalog.items.map(m => {
      let y = null, base = 0;
      for (const x of snap.units) {
        const b = x.s.hist.byC.get(m.c); if (!b) continue;
        const d = b.salF.map((v, i) => v + b.salQ[i] + b.neg[i]);
        y = y ? y.map((v, i) => v + d[i]) : d; base += x.s.demand.get(m.c);
      }
      return { m, y, base, f: forecastSeries(y, 28) };
    });
    app._F = { day: idx, rows };
  }
  // unidades en riesgo (con existencia actual)
  for (const r of app._F.rows) {
    const k = r.base > 0 ? (r.f.next14 / 14) / r.base : 1;
    r.risk = snap.units.filter(x => x.s.byClave.has(r.m.c)).filter(x => {
      const dn = x.st.pending.some(e => e.type === 'Ordinaria') ? 0.5 : (x.s.nextDelivery ?? idx + 7) - idx;
      return x.st.stock.get(r.m.c) < k * x.s.demand.get(r.m.c) * dn;
    }).map(x => x.u);
  }
  return [...app._F.rows].sort((a, b) => b.f.changePct - a.f.changePct);
}
function fcSpark(x) {
  const W = 220, Hh = 34, y = x.y, f = x.f, n = y.length + 14, mx = Math.max(1, ...y, ...f.hi.slice(0, 14));
  const X = i => 2 + i * (W - 4) / (n - 1), Y = v => Hh - 3 - (v / mx) * (Hh - 6);
  const h = y.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const fl = f.fc.slice(0, 14).map((v, k) => `${k ? 'L' : 'M'}${X(y.length + k).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const band = `M${f.hi.slice(0, 14).map((v, k) => `${X(y.length + k).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}L${f.lo.slice(0, 14).map((v, k) => `${X(y.length + k).toFixed(1)},${Y(v).toFixed(1)}`).reverse().join('L')}Z`;
  return `<svg class="fc-spark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true"><path d="${band}" fill="rgba(45,212,191,.18)"/><path d="${h}" fill="none" stroke="#94a3b8" stroke-width="1.3" vector-effect="non-scaling-stroke"/><path d="${fl}" fill="none" stroke="#2dd4bf" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------------------------------------------------------------------
//  Trazabilidad
// ---------------------------------------------------------------------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dateOf = idx => { const d = new Date(Date.UTC(2026, 9, 26) + idx * 864e5); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const expTone = days => days < 0 ? ['crit', 'Caducado'] : days <= 30 ? ['crit', `Caduca en ${days} d`] : days <= 90 ? ['warn', `Caduca en ${days} d`] : ['ok', `Vigente · ${days} d`];
function renderTrace() {
  const out = $('tr-out'); if (!out) return;
  const q = (app.traceQ || '').trim(), net = app.net, snap = app.snap, today = Math.floor(app.t / DAY);
  let html = '';
  if (!q) {
    // por defecto: lotes por caducar en la red
    const list = snap.units.flatMap(x => x.expiring.map(l => ({ ...l, u: x.u }))).sort((a, b) => a.days - b.days).slice(0, 25);
    html = `<p class="sec-t">Lotes por caducar en la red (≤ 90 días)</p>` + (list.map(l => {
      const [tn, tl] = expTone(l.days);
      return `<button class="row" data-lot="${l.lot}"><i class="dot ${tn}"></i><span><b>${l.lot} · ${esc(net.catalog.items.find(m => m.c === l.c).n)}</b><small>${esc(l.u.nombre)} · ${fmt(l.q)} piezas · caduca ${dateOf(l.exp)}</small></span><span class="r"><span class="chip ${tn}">${tl}</span></span></button>`;
    }).join('') || '<p class="empty">Ningún lote por caducar</p>');
  } else if (/^LT\d{4}-\d+$/i.test(q)) {
    const tr = net.traceLot(q.toUpperCase(), snap);
    if (!tr) html = '<p class="empty">Lote no encontrado</p>';
    else {
      const { L, item } = tr, [tn, tl] = expTone(L.exp - today);
      const totIn = tr.deliveries.reduce((n, d) => n + d.q, 0), totF = tr.usage.reduce((n, u) => n + u.salF, 0), totQ = tr.usage.reduce((n, u) => n + u.salQ, 0), totS = tr.stock.reduce((n, s) => n + s.q, 0);
      html = `<div class="tr-card"><b>${L.lot}</b><span>${esc(item.n)} · clave ${item.c}</span><span class="chip ${tn}">${tl} · ${dateOf(L.exp)}</span></div>
        <ol class="tl">
          <li><b>Proveedor</b><span>${esc(L.supplier)} · remisión ${L.rem}${L.short ? ' · <em class="warn">llegó con caducidad corta</em>' : ''}</span></li>
          <li><b>Recepción en CEDIS</b><span>${dateOf(L.recv)} · ubicación ${L.loc} · liberado tras inspección</span></li>
          <li><b>Envío a unidades</b><span>${tr.deliveries.length} entregas · ${fmt(totIn)} piezas</span>
            <ul class="mp-list">${tr.deliveries.map(d => `<li data-u="${d.u.clues}"><span>${esc(d.u.nombre)}<small>${d.type === 'Urgente' ? `Urgente N${d.level}${d.req ? ' · ' + d.req : ''}` : 'Ruta ' + d.route} · ${dateOf(Math.floor(d.t / DAY))} ${hhmm(d.t)}</small></span><em>${fmt(d.q)}</em></li>`).join('') || '<li><span>Sin envíos todavía</span></li>'}</ul></li>
          <li><b>Entregado a pacientes</b><span>${fmt(totF)} piezas en farmacia${totQ ? ` · ${fmt(totQ)} a quirófano y urgencias` : ''}</span>
            <ul class="mp-list">${tr.usage.map(u => `<li data-u="${u.u.clues}"><span>${esc(u.u.nombre)}<small>${u.rx} recetas · ej. ${u.folios.slice(0, 3).join(', ')}</small></span><em>${fmt(u.salF + u.salQ)}</em></li>`).join('') || '<li><span>Sin salidas todavía</span></li>'}</ul></li>
          <li><b>Existencia actual</b><span>${fmt(totS)} piezas en ${tr.stock.length} unidades</span>
            <ul class="mp-list">${tr.stock.map(s => `<li data-u="${s.u.clues}"><span>${esc(s.u.nombre)}</span><em>${fmt(s.q)}</em></li>`).join('')}</ul></li>
          ${tr.expired.length ? `<li><b>Merma por caducidad</b><span>${tr.expired.map(e => `${esc(e.u.nombre)}: ${fmt(e.q)}`).join(' · ')}</span></li>` : ''}
        </ol>`;
    }
  } else if (/^(RX|RE|QX|UR)-/i.test(q)) {
    const f = net.findFolio(q, snap);
    if (!f) html = '<p class="empty">Folio no encontrado hoy (solo se buscan recetas y vales del día)</p>';
    else {
      const { u, e, s } = f;
      html = `<div class="tr-card"><b>${e.folio}</b><span>${esc(u.nombre)} · ${e.kind === 'rx' ? `Derechohabiente ···${e.pac} · consultorio ${e.cons}` : esc(e.proc)}</span><span class="chip ${e.full ? 'ok' : 'warn'}">${e.full ? 'Surtida completa' : 'Parcial'} · ${hhmm(e.t)}</span></div>
        <ul class="mp-list">${e.lines.map((l, i) => `<li><span>${esc(s.byClave.get(l.c).n)}<small>${(e.lots[i] || []).map(([lot, n]) => `<a href="#" data-lot="${lot}">${lot}</a> × ${n}`).join(' · ') || 'sin existencia'}</small></span><em>${e.out[i]}/${l.q}</em></li>`).join('')}</ul>`;
    }
  } else {
    const ql = q.toLowerCase();
    const items = net.catalog.items.filter(m => m.n.toLowerCase().includes(ql) || m.c.includes(ql)).slice(0, 4);
    html = items.map(m => `<p class="sec-t">${esc(m.n)} · ${m.c}</p>` + net.lotsOfClave(m.c, snap).map(l => {
      const [tn, tl] = expTone(l.exp - today);
      return `<button class="row" data-lot="${l.lot}"><i class="dot ${tn}"></i><span><b>${l.lot}</b><small>${fmt(l.q)} piezas en ${l.units} unidades · caduca ${dateOf(l.exp)}</small></span><span class="r"><span class="chip ${tn}">${tl}</span></span></button>`;
    }).join('')).join('') || '<p class="empty">Sin resultados</p>';
  }
  if (out._h === html) return;
  out._h = html; out.innerHTML = html;
  out.querySelectorAll('[data-lot]').forEach(b => b.addEventListener('click', ev => { ev.preventDefault(); app.traceQ = b.dataset.lot; $('tr-q').value = app.traceQ; renderTrace(); }));
  out.querySelectorAll('li[data-u]').forEach(b => b.addEventListener('click', () => { const u = app.net.byClues.get(b.dataset.u); select({ kind: 'unit', u }); center(u.lon, u.lat); }));
}

function center(lon, lat) {
  const [x, y] = proj(lon, lat), vb = app.vb;
  if (vb.w > app.home.w * 0.6) { const k = app.home.w * 0.45 / vb.w; vb.w *= k; vb.h *= k; }
  vb.x = x - vb.w / 2; vb.y = y - vb.h / 2; applyVB();
}

function vanState(v) {
  const t = app.t;
  if (v.kind === 'urgent') return v.state === 'unloading' ? `Entregando en ${v.unit.nombre}` : `Hacia ${v.unit.nombre} · llega ${hhmm(v.req.deliver)}`;
  if (v.state === 'scheduled') return `Sale ${hhmm(v.trip.depart)} · ${v.trip.stops.length} unidades`;
  if (v.state === 'loading') return `Cargando en andén · sale ${hhmm(v.trip.depart)}`;
  if (v.state === 'enroute') return `Hacia ${v.next.unit.nombre} · llega ${hhmm(v.next.actual)}${v.next.actual - v.next.eta > 30 * MIN ? ` (+${Math.round((v.next.actual - v.next.eta) / MIN)} min)` : ''}`;
  if (v.state === 'unloading') return `Descargando en ${v.next.unit.nombre} hasta ${hhmm(v.next.actual + 20 * MIN)}`;
  if (v.state === 'returning') return `Regresa al CEDIS · llega ${hhmm(v.trip.end)}`;
  return `Ruta completa · llegó ${hhmm(v.trip.end)}`;
}

function drawFlows() {
  const g = app.gFlows; if (!g) return;
  const list = app.sel?.kind === 'sug' ? [app.sel.s] : app.flowsAll ? app.net.suggestions(app.snap).slice(0, 40) : app.sel?.kind === 'unit' ? app.net.suggestions(app.snap).filter(s => s.from === app.sel.u || s.to === app.sel.u) : [];
  const key = list.map(s => s.id).join(',') + '|' + (app.scale || 1).toFixed(3);
  if (g._k === key) return; g._k = key;
  g.innerHTML = '';
  for (const s of list) {
    const [x1, y1] = proj(s.from.lon, s.from.lat), [x2, y2] = proj(s.to.lon, s.to.lat);
    const mx = (x1 + x2) / 2 - (y2 - y1) * 0.18, my = (y1 + y2) / 2 + (x2 - x1) * 0.18;
    el('path', { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, class: 'flow', stroke: s.kind === 'caducidad' ? '#fbbf24' : '#a78bfa' }, g);
  }
}

function select(sel) {
  app.sel = sel;
  $('map-panel').hidden = !sel;
  for (const [u, e] of app.unitEls) e.m.classList.toggle('sel', (sel?.kind === 'unit' && sel.u === u) || (sel?.kind === 'sug' && (sel.s.from === u || sel.s.to === u)));
  drawFlows();
  if (sel) renderPanel();
}

function renderPanel() {
  const p = $('map-panel'), sel = app.sel;
  if (!sel) return;
  let html = '';
  if (sel.kind === 'unit') {
    const x = app.snap.by.get(sel.u), u = sel.u, s = x.s;
    const stop = app.net.cal.stopFor(u, Math.floor(app.t / DAY));
    const today = stop ? (app.t >= stop.actual + 20 * MIN ? `Entregada ${hhmm(stop.actual + 20 * MIN)}` : `${stop.trip.id} · llega ${hhmm(stop.actual)}`) : `Próxima: ${s.nextDelivery === null ? '—' : app.net.cal.dateLabel(s.nextDelivery)}`;
    html = `<header><div><b>${esc(u.nombre)}</b><small>${u.inst} · ${esc(u.tipologia)} · ${esc(u.municipio)}</small></div><button class="mp-x" aria-label="Cerrar">×</button></header>
      <dl><dt>Semáforo</dt><dd><span class="chip ${x.level}">${LEVEL_TXT[x.level]}</span></dd>
      <dt>Claves con abasto</dt><dd>${(100 * x.abasto).toFixed(0)} % (${s.items.length - x.zeros.length - x.low.length} de ${s.items.length})</dd>
      <dt>Recetas hoy</dt><dd>${fmt(x.st.rx)} · ${x.st.rx ? (100 * x.st.rxFull / x.st.rx).toFixed(1) : '100'} % completas</dd>
      <dt>Entrega CEDIS</dt><dd>${esc(today)}</dd><dt>Ruta</dt><dd>${u.ruta} · ${Math.round(u.km)} km · ${u.min} min</dd></dl>
      ${x.open.length ? `<p class="mp-h">Alertas abiertas al CEDIS</p><ul class="mp-list">${x.open.map(r => `<li class="crit"><span>${r.id} · ${esc(r.name)}<small>N${r.level} · ${fmt(r.q)} ${esc(plural(r.pz))}</small></span><em>${REQ_STATE[UnitSupply.reqState(r, app.t)][1]} · ${hhmm(r.deliver)}</em></li>`).join('')}</ul>` : ''}
      ${x.zeros.length ? `<p class="mp-h">Claves en cero</p><ul class="mp-list">${x.zeros.map(m => `<li><span>${esc(m.n)}<small>${m.c}</small></span><em class="crit">0</em></li>`).join('')}</ul>` : ''}
      ${x.low.length ? `<p class="mp-h">Bajo mínimo</p><ul class="mp-list">${x.low.slice(0, 8).map(m => `<li><span>${esc(m.n)}<small>${m.c}</small></span><em class="warn">${fmt(x.st.stock.get(m.c))} · ${s.coverage(m.c, x.st.stock.get(m.c)).toFixed(1)} d</em></li>`).join('')}</ul>` : ''}
      ${(() => { const sg = app.net.suggestions(app.snap).filter(z => z.from === u || z.to === u).slice(0, 6); return sg.length ? `<p class="mp-h">Redistribución sugerida</p><ul class="mp-list">${sg.map(z => `<li><span>${z.to === u ? 'Recibir' : 'Enviar'} ${esc(z.m.n)}<small>${z.to === u ? 'de ' + esc(z.from.nombre) : 'a ' + esc(z.to.nombre)} · ${Math.round(z.km)} km</small></span><em class="${z.to === u ? 'ok' : 'warn'}">${z.to === u ? '+' : '−'}${fmt(z.q)}</em></li>`).join('')}</ul>` : ''; })()}
      ${x.expiring.length ? `<p class="mp-h">Lotes por caducar</p><ul class="mp-list">${x.expiring.slice(0, 6).map(l => `<li><span>${esc(s.byClave.get(l.c).n)}<small>${l.lot}</small></span><em class="${l.days <= 30 ? 'crit' : 'warn'}">${fmt(l.q)} · ${l.days} d</em></li>`).join('')}</ul>` : ''}
      <a class="btn-link" href="unidad.html?u=${u.clues}&t=${Math.floor(app.t)}">Abrir vista de la unidad</a>`;
  } else if (sel.kind === 'clave') {
    const SH = app.net.shortage(app.snap), r = SH.rows.find(x => x.m.c === sel.c);
    const m = app.net.catalog.items.find(x => x.c === sel.c);
    html = `<header><div><b>${esc(m.n)}</b><small>${m.c} · ${VEN_TXT[m.ven]} · mapa coloreado por esta clave</small></div><button class="mp-x" aria-label="Cerrar">×</button></header>
      ${r ? `<dl><dt>Diagnóstico</dt><dd>${r.kind === 'red' ? 'Desabasto de red' : r.kind === 'local' ? 'Desabasto local' : 'Riesgo'}</dd><dt>Unidades en cero</dt><dd>${r.zeros.length} de ${r.carry.length}</dd><dt>CEDIS</dt><dd>${r.cs ? (r.cs.f === 0 ? 'Sin existencia' : Math.round(r.cs.f * 100) + ' % disponible') : 'Con existencia'}</dd><dt>Recetas pendientes</dt><dd>${fmt(r.pending)}</dd></dl>
      <p class="mp-h">Acción recomendada</p><p class="sh-act-p">${esc(r.action)}</p>
      ${(m.alt || []).length ? `<p class="mp-h">Alternativas del catálogo (decide el médico)</p><ul class="mp-list">${m.alt.map(a => { const am = app.net.catalog.items.find(x => x.c === a); const tot = app.snap.units.reduce((n, x) => n + Math.max(0, x.st.stock.get(a) || 0), 0); return `<li><span>${esc(am.n)}<small>${a}</small></span><em>${fmt(tot)} en la red</em></li>`; }).join('')}</ul>` : ''}
      ${r.zeros.length ? `<p class="mp-h">Unidades en cero</p><ul class="mp-list">${r.zeros.slice(0, 12).map(x => `<li><span>${esc(x.u.nombre)}<small>${x.u.ruta}</small></span><em class="crit">0</em></li>`).join('')}</ul>` : ''}` : '<p class="muted">Sin faltantes de esta clave.</p>'}`;
  } else if (sel.kind === 'sug') {
    const s = sel.s, xf = app.snap.by.get(s.from), xt = app.snap.by.get(s.to);
    app.approved ||= new Set();
    const key = s.key || (s.key = `${s.m.c}|${s.from.clues}|${s.to.clues}|${s.lot || ''}`), ok = app.approved.has(key);
    html = `<header><div><b>Transferencia sugerida · ${s.id}</b><small>${s.kind === 'caducidad' ? 'Evita caducidad' : 'Cubre faltante'}</small></div><button class="mp-x" aria-label="Cerrar">×</button></header>
      <dl><dt>Medicamento</dt><dd>${esc(s.m.n)}</dd><dt>Cantidad</dt><dd>${fmt(s.q)} ${esc(plural(s.m.pz))}</dd>
      <dt>De</dt><dd>${esc(s.from.nombre)}</dd><dt>Existencia origen</dt><dd>${fmt(xf.st.stock.get(s.m.c))} · ${xf.s.coverage(s.m.c, xf.st.stock.get(s.m.c)).toFixed(1)} días</dd>
      <dt>A</dt><dd>${esc(s.to.nombre)}</dd><dt>Existencia destino</dt><dd>${fmt(xt.st.stock.get(s.m.c))} · ${xt.s.coverage(s.m.c, xt.st.stock.get(s.m.c)).toFixed(1)} días</dd>
      <dt>Distancia</dt><dd>${Math.round(s.km)} km${s.from.ruta === s.to.ruta ? ` · misma ruta ${s.from.ruta}` : ''}</dd>
      ${s.lot ? `<dt>Lote</dt><dd>${s.lot} · caduca en ${s.days} d</dd>` : ''}${s.alert ? `<dt>Alerta que atiende</dt><dd>${s.alert}</dd>` : ''}</dl>
      <button class="btn-link" id="sug-ok">${ok ? '✓ Aprobada (simulación)' : 'Aprobar transferencia'}</button>`;
  } else {
    const v = (app.vans || []).find(x => x.id === sel.id);
    if (!v) { html = `<header><div><b>${esc(sel.id)}</b><small>Ya no está en ruta</small></div><button class="mp-x" aria-label="Cerrar">×</button></header>`; }
    else if (v.kind === 'urgent') {
      const r = v.req;
      html = `<header><div><b>${esc(v.vehicle)} · ${r.id}</b><small>Reabasto urgente N${r.level} a ${esc(v.unit.nombre)}</small></div><button class="mp-x" aria-label="Cerrar">×</button></header>
        <dl><dt>Clave</dt><dd>${esc(r.name)}</dd><dt>Cantidad</dt><dd>${fmt(r.q)} ${esc(plural(r.pz))}</dd><dt>Se agotó</dt><dd>${hhmm(r.t0)}</dd>
        <dt>Salió del CEDIS</dt><dd>${hhmm(r.dispatch)}</dd><dt>Llega</dt><dd>${hhmm(r.deliver)}</dd><dt>Límite</dt><dd>${hhmm(r.deadline)} · ${r.deliver <= r.deadline ? 'a tiempo' : 'fuera de tiempo'}</dd></dl>`;
    } else {
      const tr = v.trip;
      const stops = tr.stops.map(s => {
        const ship = app.net.shipmentOf(s.unit), pcs = ship ? ship.lines.reduce((n, l) => n + l.q, 0) : 0;
        const st = app.t >= s.actual + 20 * MIN ? ['ok', `✓ ${hhmm(s.actual + 20 * MIN)}`] : app.t >= s.actual ? ['warn', 'Descargando'] : ['', `llega ${hhmm(s.actual)}`];
        return `<li><span>${esc(s.unit.nombre)}<small>${ship ? `${ship.lines.length} claves · ${fmt(pcs)} piezas` : ''}</small></span><em class="${st[0]}">${st[1]}</em></li>`;
      }).join('');
      html = `<header><div><b>${v.vehicle} · ruta ${tr.id}</b><small>${esc(v.route.name)}</small></div><button class="mp-x" aria-label="Cerrar">×</button></header>
        <dl><dt>Estado</dt><dd>${esc(vanState(v))}</dd><dt>Salida</dt><dd>${hhmm(tr.depart)}</dd><dt>Regreso estimado</dt><dd>${hhmm(tr.end)}</dd></dl>
        <p class="mp-h">Paradas y carga</p><ul class="mp-list">${stops}</ul>`;
    }
  }
  p.innerHTML = html;
  p.querySelector('.mp-x')?.addEventListener('click', () => { if (app.claveFocus) { app.claveFocus = null; renderAll(true); } select(null); });
  p.querySelector('#sug-ok')?.addEventListener('click', () => { const k = sel.s.key; app.approved.has(k) ? app.approved.delete(k) : app.approved.add(k); renderPanel(); renderSide(true); });
}

Object.assign(app, { drawVans, renderAll, select, snapshot: () => { app.snap = app.net.snapshot(app.t); } });   // depuración
init().catch(err => { console.error(err); $('load-msg').textContent = 'Error: ' + err.message; });

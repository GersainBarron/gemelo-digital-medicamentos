// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  unidad.js · Vista de la unidad médica
//  Entradas desde el CEDIS, salidas a pacientes (farmacia) y a quirófano,
//  existencias por clave y gráficas por medicamento.  Datos simulados.
// =====================================================================
import { UnitSupply, makeCalendar, DAY, H, MIN, HISTORY_DAYS } from './supply.js';
import { Unit3D } from './unit3d.js';
import { forecastSeries, suggestedOrder } from './forecast.js';
import { initScenario } from './scenario-ui.js';
import { installInventory } from './network-sim.js';
import { reqScore, PEX_SLA } from './supply.js';
import { LastMile, MODES } from './lastmile.js';
import qrcode from '../vendor/qrcode.esm.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('es-MX');
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / H)).padStart(2, '0')}:${String(Math.floor((s % H) / MIN)).padStart(2, '0')}`; };
const sum = a => a.reduce((x, y) => x + y, 0);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const BASE_DAY = Date.UTC(2026, 9, 26);
const dateOf = idx => { const d = new Date(BASE_DAY + idx * 864e5); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const expTone = days => days < 0 ? ['crit', 'Caducado'] : days <= 30 ? ['crit', `Caduca en ${days} d`] : days <= 90 ? ['warn', `Caduca en ${days} d`] : ['ok', 'Vigente'];
const SPEEDS = { 1: 1, 10: 10, 60: 60, 300: 300 };   // segundos simulados por segundo real
const STATE = { zero: ['crit', 'En cero'], low: ['warn', 'Bajo mínimo'], over: ['info', 'Sobreabasto'], ok: ['ok', 'Normal'] };
const STATE_ORDER = { zero: 0, low: 1, over: 2, ok: 3 };
const DEFAULT_UNIT = 'HGIMS000082';                  // HGZMF 1 Pachuca: farmacia + quirófano

const app = window.__unidad = {
  t: 10.5 * H, speed: 1, playing: true, feed: 'rx', view: 'table',
  filter: { q: '', group: 'all', use: 'all', state: 'all' },
  detail: null, seen: new Set(),
};

// ---------------------------------------------------------------------
async function init() {
  initScenario();
  const qs = new URLSearchParams(location.search);
  const [data, catalog, layout3d] = await Promise.all([
    fetch('assets/unidades_hidalgo.json').then(r => r.json()),
    fetch('assets/medicamentos.json').then(r => r.json()),
    fetch('assets/unidad_layout.json').then(r => r.json()).catch(() => null),
  ]);
  app.data = data; app.catalog = catalog;
  app.inv = installInventory(data, catalog);      // inventario del CEDIS (faltantes que ve la unidad)
  app.refresh = refresh;   // útil para depurar desde la consola
  app.cal = makeCalendar(data);
  if (qs.has('t') && isFinite(+qs.get('t'))) app.t = +qs.get('t');
  buildUnitSelect(qs.get('u') || DEFAULT_UNIT);
  buildControls();
  setUnit($('u-select').value);
  $('loading').remove();
  if (layout3d) init3d(layout3d);
  let last = performance.now(), acc = 1;
  const loop = now => {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (app.playing) app.t += dt * SPEEDS[app.speed];
    acc += dt;
    if (acc >= 0.5) { acc = 0; refresh(); }
    if (app.v3d?.ready) app.v3d.frame(app.t, app.st);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function buildUnitSelect(sel) {
  const s = $('u-select');
  const byRoute = {};
  for (const u of app.data.units) (byRoute[u.ruta] ||= []).push(u);
  s.innerHTML = Object.entries(app.data.routes).map(([id, r]) =>
    `<optgroup label="${id} · ${esc(r.name)}">${(byRoute[id] || []).map(u =>
      `<option value="${u.clues}">${esc(u.nombre)} · ${u.inst}</option>`).join('')}</optgroup>`).join('');
  s.value = app.data.units.some(u => u.clues === sel) ? sel : DEFAULT_UNIT;
  s.addEventListener('change', () => setUnit(s.value));
}

function buildControls() {
  $('btn-play').addEventListener('click', () => setPlaying(!app.playing));
  document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  setSpeed(10); setPlaying(true);
  segment('u3d-views', 'v', v => app.v3d?.view(v));
  segment('feed-tabs', 'feed', v => { app.feed = v; renderFeed(true); });
  segment('m-view', 'view', v => { app.view = v; $('m-table').hidden = v !== 'table'; $('m-cards').hidden = v !== 'cards'; renderMeds(true); });
  segment('rx-view', 'rv', v => { app.rxView = v; renderRx(true); });
  $('rx-csv').addEventListener('click', downloadRxCsv);
  segment('m-use', 'use', v => { app.filter.use = v; renderMeds(true); });
  segment('m-state', 'state', v => { app.filter.state = v; renderMeds(true); });
  $('m-search').addEventListener('input', e => { app.filter.q = e.target.value.trim().toLowerCase(); renderMeds(true); });
  $('m-group').addEventListener('change', e => { app.filter.group = e.target.value; renderMeds(true); });
  const groups = [...new Set(app.catalog.items.map(m => m.g))].sort();
  $('m-group').insertAdjacentHTML('beforeend', groups.map(g => `<option>${esc(g)}</option>`).join(''));
  $('d-close').addEventListener('click', closeDetail);
  $('detail').addEventListener('click', e => { if (e.target.id === 'detail') closeDetail(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetail();
    if (e.code === 'Space' && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); setPlaying(!app.playing); }
  });
  window.addEventListener('resize', () => { renderCharts(); if (app.detail) renderDetail(true); });
  $('go-cedis').addEventListener('click', () => { $('go-cedis').href = 'index.html'; });
  $('go-map').addEventListener('click', () => { $('go-map').href = `mapa.html?t=${Math.floor(app.t)}`; });
}

function segment(id, key, fn) {
  const box = $(id);
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    box.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    fn(b.dataset[key]);
  }));
}
function setPlaying(p) {
  app.playing = p;
  $('btn-play').innerHTML = p
    ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  $('btn-play').setAttribute('aria-label', p ? 'Pausar' : 'Reproducir');
  const st = $('sim-status'); st.textContent = p ? 'En vivo · simulado' : 'En pausa'; st.classList.toggle('paused', !p);
}
function setSpeed(s) { app.speed = s; document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('active', +b.dataset.speed === s)); }

// ---------------------------------------------------------------------
//  Vista 3D
// ---------------------------------------------------------------------
async function init3d(layout) {
  const box = $('u3d');
  try {
    const v = new Unit3D(box, layout, {
      glb: 'assets/unidad_medica.glb',
      nameOf: c => nameOf(c),
      unitOf: (c, q) => pz(c, q),
      stockOf: c => app.st?.stock.get(c) ?? 0,
      isCold: c => !!app.supply.byClave.get(c)?.frio,
      skipRx: e => (app._lmE?.sup === app.supply ? app._lmE : (app._lmE = new LastMile(app.supply))).enrolled(e),
      motoRoutes: () => (app.lmPlan?.routes || []),
      lockerOrders: () => (app.lmPlan?.orders || []).filter(o => o.mode === 'casillero'),
    });
    await v.load();
    box.querySelector('.u3d-loading')?.remove();
    v.ready = true; app.v3d = v;
    v.setDay(app.supply, app.supply.surgical);
    v.view(app.supply.surgical ? 'general' : 'farmacia', true);
  } catch (err) {
    console.error(err);
    box.querySelector('.u3d-loading').textContent = 'No se pudo cargar el modelo 3D: ' + err.message;
  }
}

// ---------------------------------------------------------------------
//  Unidad
// ---------------------------------------------------------------------
function setUnit(clues) {
  const u = app.data.units.find(x => x.clues === clues);
  app.unit = u;
  app.supply = new UnitSupply(u, app.catalog, app.cal);
  app.dayIdx = Math.floor(app.t / DAY);
  app.supply.run(app.dayIdx);
  app.cf = null;            // contrafactual sin pedido automático (se calcula al pedirlo)
  app.seen = new Set(); app._feedKey = ''; app.alertSeen = null;
  history.replaceState(null, '', `?u=${u.clues}`);
  const r = app.data.routes[u.ruta];
  $('u-type').textContent = `${u.inst} · ${u.tipologia}`;
  $('u-name').textContent = u.nombre;
  $('u-meta').textContent = `CLUES ${u.clues} · ${u.municipio} · ${u.nivel} · Ruta ${u.ruta} ${r.name} · ${Math.round(u.km)} km del CEDIS (${u.min} min) · Entrega ordinaria ${u.frecuencia.toLowerCase()}`;
  const surg = app.supply.surgical;
  $('tab-or').hidden = !surg; $('lg-or').hidden = !surg; $('d-lg-or').hidden = !surg;
  document.body.classList.toggle('no-hosp', !surg);
  if (app.v3d?.ready) { app.v3d.setDay(app.supply, surg); app.v3d.view(surg ? 'general' : 'farmacia'); }
  if (!surg && app.feed === 'or') document.querySelector('#feed-tabs [data-feed=rx]').click();
  document.querySelector('#m-use').hidden = !surg;
  if (!surg) { app.filter.use = 'all'; document.querySelectorAll('#m-use button').forEach(b => b.classList.toggle('active', b.dataset.use === 'all')); }
  closeDetail();
  refresh(true);
}

// ---------------------------------------------------------------------
//  Ciclo de actualización
// ---------------------------------------------------------------------
function refresh(force) {
  const idx = Math.floor(app.t / DAY);
  if (idx !== app.dayIdx) { app.dayIdx = idx; app.supply.run(idx); app.cf = null; app.seen = new Set(); force = true; if (app.v3d?.ready) app.v3d.setDay(app.supply, app.supply.surgical); }
  app.st = app.supply.at(app.t);
  $('clock').textContent = `${app.cal.dateLabel(idx)} · ${hhmm(app.t)}`;
  renderChips();
  renderKpis();
  renderFeed(force);
  renderMeds(force);
  renderRx(force);
  if (force || !app._chartT || performance.now() - app._chartT > 3000) renderCharts();
  if (app.detail) renderDetail(force);
  renderLastMile(force);
}

// ---------------------------------------------------------------------
//  Última milla al paciente (fase 4)
// ---------------------------------------------------------------------
function lmPlan() {
  const S = app.supply, st = app.st;
  if (!app.lm || app.lm.sup !== S || app.lm._day !== app.dayIdx) {
    app.lm = new LastMile(S); app.lm._day = app.dayIdx;
    app.lm._hist = app.lm.refills(app.dayIdx - 30, app.dayIdx - 1);
    app.lmPlan = null;
  }
  const key = `${st.filled.length}|${st.done.length}`;
  if (app.lmPlan && app._lmKey === key) return app.lmPlan;
  if (app.lmPlan && performance.now() - (app._lmT || 0) < 2500) return app.lmPlan;     // recalcula a lo más cada 2.5 s
  app._lmKey = key; app._lmT = performance.now();
  app.lmPlan = app.lm.plan([...S.hist.filled, ...st.filled], [...app.lm._hist, ...app.lm.refills(app.dayIdx, app.dayIdx, st.done)]);
  return app.lmPlan;
}
const LM_STATE = { ready: ['info', 'Listo en farmacia'], enroute: ['warn', 'En ruta'], atpoint: ['warn', 'Para recoger'], delivered: ['ok', 'Entregado'], waiting: ['muted', 'Avisado · no ha venido'], abandoned: ['crit', 'No recogió'] };
function lmStateTxt(o, t) {
  const s = LastMile.state(o, t);
  if (s === 'atpoint') return o.mode === 'domicilio' ? ['warn', 'Llegando'] : o.mode === 'casillero' ? ['warn', 'En casillero'] : ['warn', 'En punto aliado'];
  if (s === 'ready' && o.mode === 'ventanilla') return ['info', 'Avisado · recoge en ventanilla'];
  return LM_STATE[s];
}
function renderLastMile(force) {
  const box = $('lm-card'); if (!box) return;
  const P = lmPlan(), t = app.t, L = app.lm, view = app.lmView || 'hoy';
  const today = o => Math.floor(o.ready / DAY) === app.dayIdx || (o.done != null && Math.floor(o.done / DAY) === app.dayIdx) || (o.slot != null && Math.floor(o.slot / DAY) === app.dayIdx);
  const pool = view === 'hoy' ? P.orders.filter(o => today(o) && o.ready <= t) : P.orders.filter(o => o.ready <= t);
  const routes = view === 'hoy' ? P.routes.filter(r => Math.floor(r.start / DAY) === app.dayIdx) : P.routes;
  const K = L.kpis(pool, routes, t);
  const kh = `<div><span>Entregas ${view === 'hoy' ? 'hoy' : '· 30 días'}</span><b>${fmt(K.n)}</b><small>${Object.entries(MODES).map(([k, l]) => `${l.toLowerCase()} ${K.byMode[k]}`).join(' · ')}</small></div>
    <div><span>Entregadas ≤ 24 h del aviso</span><b>${(100 * K.in24).toFixed(0)} %</b><small>espera prom. ${K.avgWait.toFixed(1)} días</small></div>
    <div><span>Costo por entrega a domicilio</span><b>$${fmt(K.perHome)}</b><small>${K.routes} salidas de moto · ${fmt(K.km)} km</small></div>
    <div><span>Visitas a farmacia evitadas</span><b>${fmt(K.visits)}</b><small>${fmt(K.pkm)} km de traslado de pacientes</small></div>
    <div><span>Horas de pacientes ahorradas</span><b>${fmt(K.hours)}</b><small>traslado y fila</small></div>
    <div><span>Recetas pendientes entregadas</span><b>${fmt(K.pend)}</b><small>${K.saved.toFixed(1)} días de espera evitados${K.rescued ? ` · ${K.rescued} que no habrían regresado` : ''}</small></div>`;
  if ($('lm-kpis')._h !== kh) { $('lm-kpis').innerHTML = kh; $('lm-kpis')._h = kh; }
  // mapa local (se redibuja cada vez: la moto se mueve)
  $('lm-map').innerHTML = lmMap(P, t);
  // lista
  const list = [...pool].sort((a, b) => (LastMile.state(a, t) === 'delivered') - (LastMile.state(b, t) === 'delivered') || b.ready - a.ready).slice(0, view === 'hoy' ? 80 : 120);
  const lh = list.map(o => {
    const [tone, lbl] = lmStateTxt(o, t), when = o.done != null && t >= o.done ? `${Math.floor(o.done / DAY) !== app.dayIdx ? app.cal.dateLabel(Math.floor(o.done / DAY)) + ' ' : ''}${hhmm(o.done)}` : o.eta ? `llega ${hhmm(o.eta)}` : '';
    return `<button class="lm-row" data-qr="${o.folio}"><span class="lm-mode ${o.mode}">${MODES[o.mode]}</span>
      <span class="lm-main"><b>${o.folio} · ···${o.pac}</b><small>${o.kind === 'pendiente' ? 'Receta pendiente surtida' : 'Resurtible (crónico)'} · ${o.lines.length} clave${o.lines.length > 1 ? 's' : ''}${o.route ? ` · moto ${o.route.split('-').slice(1).join('-')}` : ''}${o.cold ? ' · red fría' : ''}${o.ctrl ? ' · controlado' : ''}</small></span>
      <span class="lm-st"><span class="chip ${tone}">${lbl}</span><small>${when}</small></span></button>`;
  }).join('') || `<p class="empty">${view === 'hoy' ? 'Sin entregas a pacientes todavía hoy' : 'Sin entregas'}</p>`;
  const lk = lh.length + '|' + list.map(o => LastMile.state(o, t)).join('');
  if (force || $('lm-list')._k !== lk) { $('lm-list').innerHTML = lh; $('lm-list')._k = lk; }
}
function lmMap(P, t) {
  const L = app.lm, u = app.unit, W = 360, Hh = 300, cx = W / 2, cy = Hh / 2;
  const kx = 111 * Math.cos(u.lat * Math.PI / 180), R = L.radius + 1.5, sc = Math.min(W, Hh) / 2 / R * 0.95;
  const pr = p => [cx + (p.lon - u.lon) * kx * sc, cy - (p.lat - u.lat) * 111 * sc];
  const todayR = P.routes.filter(r => Math.floor(r.start / DAY) === app.dayIdx);
  const orders = P.orders.filter(o => o.mode === 'domicilio' && (Math.floor(o.ready / DAY) === app.dayIdx || (o.eta && Math.floor(o.eta / DAY) === app.dayIdx)) && o.ready <= t);
  let s = `<svg viewBox="0 0 ${W} ${Hh}" class="lm-svg" role="img" aria-label="Mapa de entregas">`;
  for (const k of [2, 5, 10].filter(k => k <= R)) s += `<circle cx="${cx}" cy="${cy}" r="${k * sc}" class="lm-ring"/><text x="${cx + 3}" y="${cy - k * sc + 11}" class="lm-rt">${k} km</text>`;
  const COL = ['#f472b6', '#a78bfa', '#22d3ee', '#fb923c'];
  todayR.forEach((r, i) => {
    const pts = [pr(L.depot), ...r.legs.map(l => pr(l.st)), pr(L.depot)];
    const on = t >= r.start && t <= r.end;
    s += `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" class="lm-route${on ? ' on' : ''}" stroke="${COL[i % 4]}"/>`;
  });
  for (const p of L.points) { const [x, y] = pr(p); s += `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2" transform="rotate(45 ${x} ${y})" fill="#f59e0b"><title>${esc(p.name)}</title></rect>`; }
  for (const o of orders) { const [x, y] = pr(o.pt), st = LastMile.state(o, t); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${st === 'delivered' ? '#34d399' : '#60a5fa'}"><title>${o.folio} · ${lmStateTxt(o, t)[1]}</title></circle>`; }
  const [ux, uy] = pr(L.depot);
  s += `<rect x="${ux - 7}" y="${uy - 7}" width="14" height="14" rx="3" fill="#14b8a6" stroke="#fff" stroke-width="1.5"/>`;
  // moto en ruta
  const r = todayR.find(r => t >= r.start && t <= r.end);
  if (r) {
    // tramos: unidad (salida) → paradas (llegada / salida tras la entrega) → unidad (regreso)
    const sv = app.lm.P.serviceMin * MIN, pts = [{ p: L.depot, t: r.start }];
    for (const l of r.legs) { pts.push({ p: l.st, t: l.t }); pts.push({ p: l.st, t: l.t + sv }); }
    pts.push({ p: L.depot, t: r.end });
    let pos = L.depot;
    for (let i = 1; i < pts.length; i++) if (t <= pts[i].t) { const a = pts[i - 1], b = pts[i], f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1; pos = { lat: a.p.lat + (b.p.lat - a.p.lat) * f, lon: a.p.lon + (b.p.lon - a.p.lon) * f }; break; }
    const [mx, my] = pr(pos);
    s += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7" fill="#f472b6" stroke="#fff" stroke-width="2"/><text x="${(mx + 10).toFixed(1)}" y="${(my + 4).toFixed(1)}" class="lm-moto">Moto ${hhmm(r.start)}</text>`;
  }
  return s + `</svg>`;
}
function openQr(folio) {
  const o = app.lmPlan?.orders.find(x => x.folio === folio); if (!o) return;
  const q = qrcode(0, 'M'); q.addData(o.qr); q.make();
  $('qr-title').textContent = `${o.folio} · ···${o.pac}`;
  $('qr-sub').textContent = `${MODES[o.mode]} · ${o.how}`;
  $('qr-code').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  const [tone, lbl] = lmStateTxt(o, app.t);
  $('qr-info').innerHTML = `<p><span class="chip ${tone}">${lbl}</span></p>
    <ul class="u3d-lines">${o.lines.map(l => `<li><b>${fmt(l.q)}</b><span>${esc(nameOf(l.c))}</span></li>`).join('')}</ul>
    <dl class="qr-dl"><dt>Listo</dt><dd>${app.cal.dateLabel(Math.floor(o.ready / DAY))} ${hhmm(o.ready)}</dd>
    ${o.eta ? `<dt>${o.mode === 'punto' ? 'Llega al punto' : 'Entrega estimada'}</dt><dd>${hhmm(o.eta)} · moto ${o.route.split('-').slice(1).join('-')}</dd>` : ''}
    ${o.done != null && app.t >= o.done ? `<dt>Entregado</dt><dd>${app.cal.dateLabel(Math.floor(o.done / DAY))} ${hhmm(o.done)}</dd>` : ''}
    ${o.mode === 'domicilio' ? `<dt>Distancia</dt><dd>${(o.tripKm / 2).toFixed(1)} km de la unidad</dd><dt>Costo</dt><dd>$${fmt(o.cost)}</dd>` : ''}</dl>
    <p class="note">El paciente muestra este código (o el repartidor lo escanea al entregar). Contiene folio, CLUES, paciente y claves; en producción va firmado digitalmente.</p>`;
  $('qr-sheet').hidden = false;
}

/** Pronóstico por clave (se recalcula una vez por día y unidad) */
function fcOf(c) {
  const S = app.supply, key = S.unit.clues + '|' + app.dayIdx;
  if (app._fcKey !== key) { app._fcKey = key; app._fc = new Map(); }
  if (!app._fc.has(c)) {
    const b = S.hist.byC.get(c);
    app._fc.set(c, forecastSeries(b.salF.map((v, i) => v + b.salQ[i] + b.neg[i]), 28));
  }
  return app._fc.get(c);
}

function rows() {
  const S = app.supply, st = app.st, h = S.hist;
  return S.items.map(m => {
    const hc = h.byC.get(m.c);
    const s = st.stock.get(m.c);
    return {
      m, s, state: S.status(m.c, s), cov: S.coverage(m.c, s),
      ent: sum(hc.ent) + (st.ent.get(m.c) || 0), salF: sum(hc.salF) + (st.salF.get(m.c) || 0),
      salQ: sum(hc.salQ) + (st.salQ.get(m.c) || 0), neg: sum(hc.neg) + (st.neg.get(m.c) || 0),
      series: [...hc.stock, s], fc: fcOf(m.c),
    };
  });
}

function renderChips() {
  const S = app.supply, st = app.st, cal = app.cal;
  const chips = [];
  const todayIn = [...S.today.events.filter(e => e.kind === 'in'), ...st.urgentToday].sort((a, b) => a.t - b.t);
  if (st.open.length) chips.push(`<span class="chip crit">⚠ ${st.open.length} ${st.open.length === 1 ? 'alerta abierta' : 'alertas abiertas'} al CEDIS</span>`);
  for (const e of todayIn) {
    const arrived = app.t >= e.t;
    const lbl = e.type === 'Urgente' ? `Reabasto urgente N${e.level}` : `Entrega del CEDIS · ruta ${e.route}`;
    chips.push(arrived ? `<span class="chip ok">✓ ${lbl} recibida ${hhmm(e.t)}</span>` : `<span class="chip info">${lbl} · llega ${hhmm(e.t)}</span>`);
  }
  if (!todayIn.some(e => e.type !== 'Urgente')) chips.push(`<span class="chip">Próxima entrega ordinaria: ${S.nextDelivery === null ? 'sin fecha' : cal.dateLabel(S.nextDelivery)}</span>`);
  const last = [...S.hist.deliveries].reverse().find(e => e.type !== 'Urgente');
  if (last) chips.push(`<span class="chip">Última entrega: ${cal.dateLabel(Math.floor(last.t / DAY))} ${hhmm(last.t)}</span>`);
  const open = S.hours;
  chips.push(`<span class="chip">Farmacia ${String(open[0]).padStart(2, '0')}:00–${open[1]}:00${app.unit.hosp ? ' · urgencias 24 h' : ''}</span>`);
  if (S.surgical) chips.push('<span class="chip accent">Con quirófano</span>');
  const html = chips.join('');
  if ($('u-chips')._h !== html) { $('u-chips').innerHTML = html; $('u-chips')._h = html; }
}

function tone(v, ok, warn, higherIsBetter = true) {
  if (higherIsBetter) return v >= ok ? 'ok' : v >= warn ? 'warn' : 'crit';
  return v <= ok ? 'ok' : v <= warn ? 'warn' : 'crit';
}
// ---------------------------------------------------------------------
//  Pedido automático antes del desabasto (fase 3)
// ---------------------------------------------------------------------
function counterfactual() {
  if (!app.cf) { app.cf = new UnitSupply(app.unit, app.catalog, app.cal); app.cf.proactive = false; app.cf.run(app.dayIdx); }
  return app.cf;
}
function pexStats() {
  const S = app.supply, list = S.hist.pex.filter(p => !p.noStock);
  const done = list.filter(p => p.deliver <= app.t);
  const cycle = done.length ? done.reduce((n, p) => n + (p.deliver - p.t0), 0) / done.length / H : 0;
  const onTime = done.length ? 100 * done.filter(p => p.deliver <= p.stockoutAt).length / done.length : 100;
  const slaV = list.length ? 100 * list.filter(p => p.slaV).length / list.length : 100;
  const slaA = list.length ? 100 * list.filter(p => p.slaA).length / list.length : 100;
  const cf = counterfactual();
  const neg = h => h.rxNegPz.reduce((a, b) => a + b, 0);
  return { n: S.hist.pex.length, lines: S.hist.pex.reduce((n, p) => n + p.lines.length, 0), cycle, onTime, slaV, slaA,
    alertsWith: S.hist.reqs.length, alertsWithout: cf.hist.reqs.length, avoided: cf.hist.reqs.length - S.hist.reqs.length,
    negWith: neg(S.hist), negWithout: neg(cf.hist) };
}
const PEX_STEPS = [['t0', 'Propuesto', 'Sistema'], ['validated', 'Validado', 'Jefatura de farmacia'], ['authorized', 'Autorizado', 'Mesa de control CEDIS'], ['scheduled', 'Programado', 'Ruta'], ['deliver', 'Entregado', 'Farmacia']];
const PEX_STATE = { proposed: ['crit', 'Por validar'], validated: ['warn', 'Por autorizar en CEDIS'], authorized: ['warn', 'Autorizado'], scheduled: ['info', 'Programado en ruta'], enroute: ['info', 'En camino'], delivered: ['ok', 'Entregado'], nostock: ['crit', 'Sin existencia en CEDIS'] };
const dur = s => s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 * 2 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`;
function pexHtml() {
  const S = app.supply, st = app.st, t = app.t;
  const all = new Map();
  for (const p of [...S.hist.pex.filter(p => p.day >= app.dayIdx - 7), ...st.pexList]) all.set(p.id, p);
  const list = [...all.values()].filter(p => p.t0 <= t).sort((a, b) => b.t0 - a.t0);
  const P = pexStats();
  const head = `<div class="px-sum">
      <div><span>Pedidos · 30 días</span><b>${fmt(P.n)}</b><small>${fmt(P.lines)} claves</small></div>
      <div><span>Tiempo de ciclo</span><b>${P.cycle.toFixed(1)} h</b><small>propuesta → entrega</small></div>
      <div><span>Validados ≤ 2 h</span><b>${P.slaV.toFixed(0)} %</b><small>autorizados ≤ 4 h: ${P.slaA.toFixed(0)} %</small></div>
      <div><span>Llegaron antes de agotarse</span><b>${P.onTime.toFixed(0)} %</b><small>de los entregados</small></div>
      <div><span>Alertas por clave agotada</span><b>${fmt(P.alertsWith)}</b><small>sin pedido automático: ${fmt(P.alertsWithout)}</small></div>
      <div><span>Piezas negadas a pacientes</span><b>${fmt(P.negWith)}</b><small>sin pedido automático: ${fmt(P.negWithout)}</small></div></div>
    <button class="seg-btn px-json" type="button">Descargar pedidos en JSON (formato SupplyRequest)</button>
    <p class="note">Cada mañana el sistema proyecta la existencia de cada clave hasta la próxima entrega ordinaria con el consumo observado. Si queda por debajo de la existencia de seguridad, propone un pedido extraordinario antes de llegar a cero. La jefatura de farmacia lo valida (plazo 2 h) y la mesa de control del CEDIS lo autoriza (plazo 4 h).</p>`;
  return head + (list.map(p => {
    const s = UnitSupply.pexState(p, t), [tone, lbl] = PEX_STATE[s];
    const steps = PEX_STEPS.map(([k, l, who], i) => {
      const at = p[k], on = t >= at && isFinite(at) && !(p.noStock && (k === 'scheduled' || k === 'deliver'));
      if (p.noStock && (k === 'scheduled' || k === 'deliver')) return `<li><b>${l}</b><small>${t >= p.authorized ? 'no aplica: sin existencia' : esc(who)}</small></li>`;
      const late = (k === 'validated' && at - p.t0 > PEX_SLA.validate) || (k === 'authorized' && at - p.validated > PEX_SLA.authorize);
      return `<li class="${on ? 'on' : ''}${late ? ' late' : ''}"><b>${l}</b><small>${on ? `${i && Math.floor(at / DAY) !== Math.floor(p.t0 / DAY) ? app.cal.dateLabel(Math.floor(at / DAY)) + ' ' : ''}${hhmm(at)}${late ? ' · fuera de plazo' : ''}` : (k === 'validated' ? `vence ${hhmm(p.t0 + PEX_SLA.validate)}` : k === 'authorized' && t >= p.validated ? `vence ${hhmm(p.validated + PEX_SLA.authorize)}` : esc(who))}</small></li>`;
    }).join('');
    const lines = p.lines.map(l => `<li class="${l.q < l.req ? 'neg' : ''}"><b>${fmt(l.q)}</b>${esc(l.name)}<small class="lot">tiene ${fmt(l.stock)} · ${l.cover.toFixed(1)} días · pidió ${fmt(l.req)}${l.cut ? ' · ' + esc(l.cut) : ''}</small></li>`).join('');
    return `<div class="ev px"><time>${hhmm(p.t0)}</time>
      <div><div class="who">${p.id}${p.urgent ? ' <em class="tag-u">viaje propio</em>' : ''}<small>${app.cal.dateLabel(p.day)} · ${p.lines.length} clave${p.lines.length > 1 ? 's' : ''} · se agotaría en ${dur(p.minCover * DAY)}${s === 'delivered' ? ` · ciclo ${dur(p.deliver - p.t0)}` : ''}</small></div>
        <ol class="px-steps">${steps}</ol><ul>${lines}</ul></div>
      <span class="chip ${tone}">${lbl}</span></div>`;
  }).join('') || '<p class="empty">Sin pedidos extraordinarios en la última semana: las entregas ordinarias alcanzan</p>');
}

/** Pedido en el contrato de datos docs/pedido-extraordinario.schema.json */
function pexToJson(p) {
  const iso = s => isFinite(s) ? new Date(Date.UTC(2026, 9, 26, 6) + s * 1000).toISOString() : undefined;
  const isoDate = d => new Date(Date.UTC(2026, 9, 26) + d * 864e5).toISOString().slice(0, 10);
  const st = UnitSupply.pexState(p, app.t), u = app.unit;
  const step = (k, rol) => (isFinite(p[k]) && app.t >= p[k]) ? { en: iso(p[k]), rol } : undefined;
  return { resourceType: 'SupplyRequest', identifier: p.id, groupIdentifier: p.id,
    status: st === 'delivered' ? 'completed' : st === 'nostock' ? 'suspended' : ['proposed', 'validated'].includes(st) ? 'draft' : 'active',
    priority: p.urgent ? 'urgent' : 'routine', category: 'pedido-extraordinario', authoredOn: iso(p.t0),
    requester: { clues: u.clues, nombre: u.nombre, institucion: u.inst }, supplier: 'CEDIS estatal Hidalgo', deliverTo: u.clues,
    item: p.lines.map(l => ({ clave: l.c, descripcion: l.name, ven: l.ven, presentacion: l.pz, existencia: l.stock, consumoDiario: +l.daily.toFixed(2), coberturaDias: +l.cover.toFixed(2),
      existenciaProyectada: +l.proj.toFixed(1), existenciaSeguridad: +l.safety.toFixed(1), cantidadSolicitada: l.req, cantidadAutorizada: app.t >= p.authorized ? l.q : undefined, motivoAjuste: l.cut || undefined, lote: l.lot, caducidad: isoDate(l.exp) })),
    workflow: { propuesto: step('t0', 'sistema'), validado: step('validated', 'jefatura-farmacia'), autorizado: step('authorized', 'mesa-control-cedis'), programado: step('scheduled', 'ruta'), entregado: step('deliver', 'farmacia') },
    kpi: { tiempoCicloHoras: st === 'delivered' ? +((p.deliver - p.t0) / H).toFixed(2) : undefined, validadoEnPlazo: p.slaV, autorizadoEnPlazo: p.slaA, agotamientoEstimado: iso(p.stockoutAt) } };
}
function downloadPex() {
  const S = app.supply, all = new Map();
  for (const p of [...S.hist.pex.filter(p => p.day >= app.dayIdx - 7), ...app.st.pexList]) if (p.t0 <= app.t) all.set(p.id, p);
  const blob = new Blob([JSON.stringify({ resourceType: 'Bundle', type: 'collection', entry: [...all.values()].map(p => ({ resource: pexToJson(p) })) }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pedidos_${app.unit.clues}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
document.addEventListener('click', e => {
  if (e.target.closest('.px-json')) downloadPex();
  const q = e.target.closest('[data-qr]'); if (q) openQr(q.dataset.qr);
  if (e.target.closest('#qr-close') || e.target.id === 'qr-sheet') $('qr-sheet').hidden = true;
  const lv = e.target.closest('#lm-view [data-lv]');
  if (lv) { app.lmView = lv.dataset.lv; document.querySelectorAll('#lm-view button').forEach(b => b.classList.toggle('active', b === lv)); renderLastMile(true); }
});

function renderKpis() {
  const S = app.supply, st = app.st, h = S.hist, R = rows();
  const rx30 = sum(h.rx) + st.rx, full30 = sum(h.rxFull) + st.rxFull;
  const pctFull30 = rx30 ? 100 * full30 / rx30 : 100, pctToday = st.rx ? 100 * st.rxFull / st.rx : 100;
  const okClaves = R.filter(r => r.state === 'ok' || r.state === 'over').length;
  const zero = R.filter(r => r.state === 'zero').length;
  const covs = R.map(r => r.cov).filter(isFinite).sort((a, b) => a - b);
  const med = covs.length ? covs[Math.floor(covs.length / 2)] : 0;
  const ins = h.deliveries;
  const pieces30 = sum([...h.byC.values()].map(x => sum(x.ent))) + st.received;
  const urg = ins.filter(e => e.type === 'Urgente').length + st.done.filter(e => e.kind === 'in' && e.type === 'Urgente').length;
  const nIn = ins.length + st.done.filter(e => e.kind === 'in').length;
  const K = [
    ['Recetas atendidas hoy', fmt(st.rx), '', `${pctToday.toFixed(1)} % completas`, tone(pctToday, 97, 93)],
    ['Recetas surtidas completas · 30 días', pctFull30.toFixed(1), '%', 'Meta ≥ 97 %', tone(pctFull30, 97, 93)],
    (() => {
      const waiting = new Set(st.rxPend.map(p => p.folio)).size;
      const recent = [...h.filled.slice(-200), ...st.filled];
      const avg = recent.length ? sum(recent.map(p => p.wait)) / recent.length / H : 0;
      return ['Recetas pendientes de surtir', fmt(waiting), '', `${fmt(st.filled.length)} avisadas hoy · espera prom. ${avg < 24 ? avg.toFixed(0) + ' h' : (avg / 24).toFixed(1) + ' días'}`, waiting > 50 ? 'crit' : waiting ? 'warn' : 'ok'];
    })(),
  ];
  if (S.surgical) K.push(['Cirugías hoy', fmt(st.surg), '', `${fmt(st.er)} vales de urgencias · ${fmt(st.piecesQ)} piezas`, '']);
  K.push(
    ['Claves con abasto (≥ mínimo)', (100 * okClaves / R.length).toFixed(0), '%', `${okClaves} de ${R.length} claves · meta ≥ 90 %`, tone(100 * okClaves / R.length, 90, 80)],
    ['Claves en cero', fmt(zero), '', zero ? 'Requiere reabasto' : 'Sin claves agotadas', tone(zero, 0, 2, false)],
    (() => {
      const ex = S.expiring(st.lots, app.dayIdx, 90), pz = sum(ex.map(x => x.q)), claves = new Set(ex.map(x => x.c)).size;
      const merma = sum([...h.byC.values()].map(x => sum(x.merma))) + sum([...st.merma.values()]);
      return ['Por caducar en ≤ 90 días', fmt(pz), 'pzas', `${ex.length} lotes · ${claves} claves · merma 30 d: ${fmt(merma)}`, ex.some(x => x.days <= 30) ? 'crit' : ex.length ? 'warn' : 'ok'];
    })(),
    ['Entradas del CEDIS · 30 días', fmt(pieces30), 'pzas', `${nIn} entregas · ${urg} urgentes`, urg > 3 ? 'warn' : ''],
  );
  if (S.proactive) {
    const P = pexStats();
    K.push(['Pedidos automáticos · 30 días', fmt(P.n), '', `ciclo ${P.cycle.toFixed(1)} h · ${P.onTime.toFixed(0)} % antes de agotarse · ${P.avoided >= 0 ? fmt(P.avoided) + ' alertas evitadas' : ''}`, tone(P.onTime, 90, 75)]);
  }
  const html = K.map(([l, v, u, sub, t]) => `<div class="kpi ${t}"><span>${esc(l)}</span><b>${v}${u ? `<i>${u}</i>` : ''}</b><small>${t ? '<i class="dot"></i>' : ''}${esc(sub)}</small></div>`).join('');
  if ($('kpis')._h !== html) { $('kpis').innerHTML = html; $('kpis')._h = html; $('kpis').style.setProperty('--kc', K.length); }
}

// ---------------------------------------------------------------------
//  Movimientos de hoy
// ---------------------------------------------------------------------
function nameOf(c) { return app.supply.byClave.get(c)?.n || c; }
function pz(c, q) { const m = app.supply.byClave.get(c); return `${m ? (q === 1 ? m.pz : plural(m.pz)) : ''}`; }
function plural(w) { return /[aeiou]$/.test(w) ? w + 's' : w + 'es'; }

function renderFeed(force) {
  const st = app.st, S = app.supply;
  const rx = st.done.filter(e => e.kind === 'rx'), or = st.done.filter(e => e.kind === 'or' || e.kind === 'er');
  const ins = [...S.today.events.filter(e => e.kind === 'in'), ...st.urgentToday].sort((a, b) => a.t - b.t);
  const alerts = allAlerts();
  $('n-rx').textContent = rx.length; $('n-or').textContent = or.length; $('n-in').textContent = ins.length + S.hist.deliveries.length;
  $('n-al').textContent = st.open.length ? `${st.open.length} abiertas` : alerts.length;
  $('tab-al').classList.toggle('alert', st.open.length > 0);
  notifyAlerts(force);
  $('n-pe').textContent = new Set(st.rxPend.map(p => p.folio)).size || '';
  const pxOpen = (st.pexList || []).filter(p => !['delivered', 'nostock'].includes(UnitSupply.pexState(p, app.t)) && p.t0 <= app.t);
  $('n-px').textContent = pxOpen.length ? `${pxOpen.length} en curso` : '';
  $('tab-px').classList.toggle('alert', pxOpen.some(p => UnitSupply.pexState(p, app.t) === 'proposed'));
  const key = `${app.feed}|${st.rxPend.length}|${st.filled.length}|${rx.length}|${or.length}|${st.done.filter(e => e.kind === 'in').length}|${app.unit.clues}|${alerts.length}|${alerts.map(a => UnitSupply.reqState(a, app.t)).join('')}|${(st.pexList || []).map(p => UnitSupply.pexState(p, app.t)).join('')}`;
  if (!force && key === app._feedKey) return;
  app._feedKey = key;
  const box = $('feed');
  let html = '';
  if (app.feed === 'rx') {
    html = rx.slice(-60).reverse().map(e => {
      const isNew = !app.seen.has(e.folio); app.seen.add(e.folio);
      const lines = e.lines.map((l, i) => {
        const g = e.out[i];
        return (g > 0 ? `<li><b>${g}</b>${esc(nameOf(l.c))}<small class="lot">${(e.lots?.[i] || []).map(x => x[0]).join(', ')}</small>${l.adj ? '<small class="lot">surtido para 7 días (contingencia)</small>' : ''}</li>` : '') + (g < l.q ? `<li class="neg"><b>${l.q - g}</b>Pendiente · ${esc(nameOf(l.c))}${altHint(l.c)}</li>` : '');
      }).join('');
      return `<div class="ev${isNew && !force ? ' new' : ''}"><time>${hhmm(e.t)}</time>
        <div><div class="who">Receta ${e.folio}<small>Consultorio ${e.cons} · Derechohabiente ···${e.pac}</small></div><ul>${lines}</ul></div>
        <span class="chip ${e.full ? 'ok' : 'warn'}">${e.full ? 'Completa' : 'Parcial'}</span></div>`;
    }).join('') || `<p class="empty">${app.t % DAY < S.hours[0] * H ? `La farmacia abre a las ${S.hours[0]}:00` : 'Sin recetas surtidas todavía'}</p>`;
  } else if (app.feed === 'or') {
    html = or.slice().reverse().map(e => {
      const isNew = !app.seen.has(e.folio); app.seen.add(e.folio);
      const lines = e.lines.map((l, i) => `<li class="${e.out[i] < l.q ? 'neg' : ''}"><b>${e.out[i]}</b>${esc(nameOf(l.c))}${e.out[i] < l.q ? ` · faltó ${l.q - e.out[i]}` : ''}</li>`).join('');
      return `<div class="ev${isNew && !force ? ' new' : ''}"><time>${hhmm(e.t)}</time>
        <div><div class="who">${esc(e.proc)}<small>${esc(e.sala)} · ${e.folio}</small></div><ul>${lines}</ul></div>
        <span class="chip ${e.kind === 'er' ? 'crit' : e.urgent ? 'warn' : 'info'}">${e.kind === 'er' ? 'Urgencias' : e.urgent ? 'Cirugía urgente' : 'Programada'}</span></div>`;
    }).join('') || '<p class="empty">Sin vales de quirófano o urgencias todavía</p>';
  } else if (app.feed === 'al') {
    html = alerts.map(alertHtml).join('') || '<p class="empty">Sin alertas: ninguna clave se ha agotado en los últimos 30 días</p>';
  } else if (app.feed === 'pe') {
    html = pendingHtml();
  } else if (app.feed === 'px') {
    html = pexHtml();
  } else {
    const today = ins.map(e => delivery(e, true)).join('');
    const past = [...S.hist.deliveries].reverse().map(e => delivery(e, false)).join('');
    html = (today ? `<p class="sec-t">Hoy</p>${today}` : '') + `<p class="sec-t">Últimos 30 días</p>${past || '<p class="empty">Sin entregas</p>'}`;
  }
  const keepScroll = box.scrollTop;
  box.innerHTML = html;
  if (!force) box.scrollTop = keepScroll;
}

// ---------------------------------------------------------------------
//  Alertas de la unidad al CEDIS (clave agotada → solicitud urgente)
// ---------------------------------------------------------------------
const REQ_STATE = { sent: ['crit', 'Enviada al CEDIS'], preparing: ['warn', 'En preparación en CEDIS'], transfer: ['warn', 'Transferencia de otra unidad'], enroute: ['info', 'En camino'], delivered: ['ok', 'Recibida'] };
const REQ_LEVEL = { 1: ['crit', 'N1 · Vital'], 2: ['warn', 'N2 · Urgente'], 3: ['info', 'N3 · Prioritaria'] };
function allAlerts() {
  const st = app.st, S = app.supply;
  const map = new Map();
  for (const r of [...S.hist.reqs, ...st.open, ...st.reqs]) map.set(r.id, r);
  const open = new Set(st.open.map(r => r.id));
  return [...map.values()].sort((a, b) => (open.has(b.id) - open.has(a.id)) || b.t0 - a.t0);
}
function alertHtml(r) {
  const t = app.t, s = UnitSupply.reqState(r, t), [stone, slbl] = REQ_STATE[s], [ltone, llbl] = REQ_LEVEL[r.level];
  const day = app.cal.dateLabel(Math.floor(r.t0 / DAY));
  const foot = s === 'delivered'
    ? `Recibida ${app.cal.dateLabel(Math.floor(r.deliver / DAY))} ${hhmm(r.deliver)} · ${r.deliver <= r.deadline ? 'a tiempo' : 'fuera de tiempo'}`
    : `Llega aprox. ${hhmm(r.deliver)} · límite ${hhmm(r.deadline)}`;
  return `<div class="ev al"><time>${hhmm(r.t0)}</time>
    <div><div class="who">${r.id}<small>${day}${r.trigger ? ` · se agotó con ${r.trigger}` : ''}</small></div>
      <ul>${r.lines.map(l => `<li><b>${fmt(l.q)}</b>${esc(l.name)} · ${esc(plural(l.pz))} <small class="lot">${{ V: 'Vital', E: 'Esencial', N: 'No esencial' }[l.ven] || ''}</small></li>`).join('')}</ul>
      <small class="al-foot">${r.lines.length > 1 ? `Solicitud consolidada (${r.lines.length} claves en un solo envío) · ` : ''}${r.backorder && s !== 'delivered' ? `Sin existencia en CEDIS · se surte al reabastecerse (${app.cal.dateLabel(Math.floor(r.deliver / DAY))})` : foot}${s !== 'delivered' ? ` · prioridad ${reqScore(r, t)}` : ''}</small></div>
    <span class="al-chips"><span class="chip ${ltone}">${llbl}</span><span class="chip ${r.backorder && s !== 'delivered' ? 'crit' : stone}">${r.backorder && s !== 'delivered' ? 'Pendiente en CEDIS' : slbl}</span></span></div>`;
}
/** Alternativas del catálogo con existencia (la decisión es del médico) */
function altHint(c) {
  const m = app.supply.byClave.get(c);
  const alts = (m?.alt || []).filter(a => app.supply.byClave.has(a) && (app.st.stock.get(a) || 0) > 0);
  return alts.length ? ` <small class="lot alt">alternativa con existencia: ${alts.map(a => `${esc(nameOf(a))} (${fmt(app.st.stock.get(a))})`).join(', ')}</small>` : '';
}
function pendingHtml() {
  const st = app.st, S = app.supply;
  const wait = st.rxPend.slice().sort((a, b) => a.t0 - b.t0);
  const done = [...st.filled].reverse();
  const rowP = p => `<div class="ev"><time>${hhmm(p.t0)}</time>
    <div><div class="who">Receta ${p.folio}<small>${app.cal.dateLabel(Math.floor(p.t0 / DAY))} · Derechohabiente ···${p.pac} · consultorio ${p.cons}</small></div>
      <ul><li class="neg"><b>${p.q - p.given}</b>${esc(nameOf(p.c))}${altHint(p.c)}</li></ul>
      <small class="al-foot">Esperando desde hace ${fmtWait(app.t - p.t0)} · se le avisará cuando llegue</small></div>
    <span class="chip warn">Pendiente</span></div>`;
  const rowD = p => `<div class="ev"><time>${hhmm(p.notified)}</time>
    <div><div class="who">Receta ${p.folio}<small>Derechohabiente ···${p.pac}</small></div>
      <ul><li><b>${p.q}</b>${esc(nameOf(p.c))}</li></ul><small class="al-foot">Esperó ${fmtWait(p.wait)} · aviso enviado, puede recoger en ventanilla</small></div>
    <span class="chip ok">Avisado</span></div>`;
  return (done.length ? `<p class="sec-t">Avisados hoy (${done.length})</p>${done.slice(0, 30).map(rowD).join('')}` : '') +
    `<p class="sec-t">En espera (${wait.length})</p>${wait.slice(0, 60).map(rowP).join('') || '<p class="empty">Sin recetas pendientes</p>'}${wait.length > 60 ? `<p class="empty">… y ${wait.length - 60} más</p>` : ''}`;
}
function fmtWait(s) { return s < H ? `${Math.round(s / MIN)} min` : s < DAY ? `${(s / H).toFixed(0)} h` : `${(s / DAY).toFixed(1)} días`;
}
let toastTimer = 0;
function notifyAlerts(force) {
  const ids = app.st.reqs.map(r => r.id);
  if (force || !app.alertSeen) { app.alertSeen = new Set(ids); return; }
  for (const r of app.st.reqs) {
    if (app.alertSeen.has(r.id)) continue;
    app.alertSeen.add(r.id);
    const el = $('toast');
    el.innerHTML = `<b>⚠ Se agotó ${esc(r.name)}</b><span>Solicitud ${r.id} enviada al CEDIS · ${REQ_LEVEL[r.level][1]} · ${fmt(r.q)} ${esc(plural(r.pz))}${r.backorder ? ' · el CEDIS no tiene existencia: queda pendiente' : ''}</span>`;
    el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }
}

function delivery(e, today) {
  const arrived = app.t >= e.t;
  const req = sum(e.lines.map(l => l.req)), sent = sum(e.lines.map(l => l.q));
  const pct = req ? 100 * sent / req : 100;
  const neg = e.lines.filter(l => l.q < l.req);
  const day = Math.floor(e.t / DAY);
  const title = e.type === 'Urgente' ? `Reabasto urgente N${e.level}${e.req ? ` · ${e.req.id}` : ''}` : `Entrega ordinaria · ruta ${e.route}`;
  const state = today ? (arrived ? `<span class="chip ok">Recibida ${hhmm(e.t)}</span>` : `<span class="chip info">Llega ${hhmm(e.t)}</span>`)
    : `<span class="chip ${pct >= 98 ? 'ok' : pct >= 90 ? 'warn' : 'crit'}">${pct.toFixed(0)} % surtido</span>`;
  const lines = e.lines.map(l => `<span class="${l.q < l.req ? 'neg' : ''}">${esc(nameOf(l.c))}${l.why ? ` · ${esc(l.why)}` : ''}</span><b>${fmt(l.q)}${l.q < l.req ? ` / ${fmt(l.req)}` : ''}</b>`).join('');
  return `<details><summary class="del"><span class="who">${title}</span>${state}
    <small>${app.cal.dateLabel(day)} ${hhmm(e.t)} · ${e.lines.length} claves · ${fmt(sent)} piezas${neg.length ? ` · ${neg.length} con faltante` : ''}</small><small>Ver claves ▾</small>
    <span class="bar"><i style="width:${pct.toFixed(0)}%"></i></span></summary>
    <div class="del-lines">${lines}</div></details>`;
}

// ---------------------------------------------------------------------
//  Recetas: completas, parciales y negadas
// ---------------------------------------------------------------------
function rxData() {
  const S = app.supply, h = S.hist, st = app.st;
  const days = h.days.map((d, i) => ({ d, rx: h.rx[i], full: h.rxFull[i], part: h.rxPart[i], den: h.rxDen[i], negPz: h.rxNegPz[i] }));
  days.push({ d: app.dayIdx, today: true, rx: st.rx, full: st.rxFull, part: st.rxPart, den: st.rxDen, negPz: st.rxNegPz });
  const tot = days.reduce((a, x) => ({ rx: a.rx + x.rx, full: a.full + x.full, part: a.part + x.part, den: a.den + x.den, negPz: a.negPz + x.negPz }), { rx: 0, full: 0, part: 0, den: 0, negPz: 0 });
  const meds = S.F.map(m => {
    const b = h.byC.get(m.c);
    const neg = sum(b.neg) + (st.neg.get(m.c) || 0), out = sum(b.salF) + (st.salF.get(m.c) || 0);
    return { m, neg, out, share: neg + out ? neg / (neg + out) : 0, q: st.stock.get(m.c) };
  }).filter(x => x.neg > 0).sort((a, b) => b.neg - a.neg);
  return { days, tot, meds };
}
const pctTxt = (a, b) => b ? (100 * a / b).toFixed(1) + ' %' : '—';
function renderRx(force) {
  const now = performance.now();
  if (!force && now - (app._rxT || 0) < 2000) return;
  app._rxT = now;
  const { days, tot, meds } = rxData();
  $('rx-sub').textContent = `últimos 30 días + hoy · ${fmt(tot.rx)} recetas`;
  const sumHtml = [['Recetas atendidas', fmt(tot.rx), '', ''], ['Completas', fmt(tot.full), pctTxt(tot.full, tot.rx), 'full'], ['Parciales', fmt(tot.part), pctTxt(tot.part, tot.rx), 'part'],
    ['Negadas', fmt(tot.den), pctTxt(tot.den, tot.rx), 'den'], ['Piezas no surtidas', fmt(tot.negPz), '', '']]
    .map(([l, v, p, c]) => `<div class="${c}"><span>${l}</span><b>${v}${p ? `<small>${p}</small>` : ''}</b></div>`).join('');
  if ($('rx-sum')._h !== sumHtml) { $('rx-sum').innerHTML = sumHtml; $('rx-sum')._h = sumHtml; }
  let html;
  if ((app.rxView || 'day') === 'day') {
    const bar = x => x.rx ? `<span class="rxbar"><i class="f" style="width:${100 * x.full / x.rx}%"></i><i class="p" style="width:${100 * x.part / x.rx}%"></i><i class="d" style="width:${100 * x.den / x.rx}%"></i></span>` : '';
    const tone = x => !x.rx ? '' : x.full / x.rx >= 0.97 ? 'ok' : x.full / x.rx >= 0.93 ? 'warn' : 'crit';
    const row = (x, cls = '') => `<tr class="${cls}"><td>${x.label || (x.today ? `Hoy (hasta ${hhmm(app.t)})` : app.cal.dateLabel(x.d))}</td><td class="n">${fmt(x.rx)}</td><td class="n">${fmt(x.full)}</td>
      <td class="n part">${x.part ? fmt(x.part) : '—'}</td><td class="n den">${x.den ? fmt(x.den) : '—'}</td>
      <td class="n"><span class="chip ${tone(x)}">${pctTxt(x.full, x.rx)}</span></td><td class="n col-opt">${fmt(x.negPz)}</td><td class="col-opt">${bar(x)}</td></tr>`;
    html = `<table><thead><tr><th>Fecha</th><th class="n">Recetas</th><th class="n">Completas</th><th class="n">Parciales</th><th class="n">Negadas</th><th class="n">% completas</th><th class="n col-opt">Piezas no surtidas</th><th class="col-opt">Distribución</th></tr></thead>
      <tbody>${[...days].reverse().map(x => row(x, x.today ? 'today' : '')).join('')}${row({ ...tot, label: 'Total 30 días + hoy' }, 'tot')}</tbody></table>`;
  } else {
    html = meds.length ? `<table><thead><tr><th class="col-cl">Clave</th><th>Medicamento</th><th class="n">Piezas no surtidas</th><th class="n">% de la demanda</th><th class="n">Existencia hoy</th><th>Alternativas con existencia</th></tr></thead><tbody>${meds.map(x => {
      const alts = (x.m.alt || []).filter(a => app.supply.byClave.has(a) && (app.st.stock.get(a) || 0) > 0).map(a => `${esc(nameOf(a))} (${fmt(app.st.stock.get(a))})`).join(', ');
      return `<tr data-c="${x.m.c}"><td class="cl col-cl">${x.m.c}</td><td class="mn"><b>${esc(x.m.n)}</b><small>${{ V: 'Vital', E: 'Esencial', N: 'No esencial' }[x.m.ven] || ''}</small></td>
        <td class="n den">${fmt(x.neg)}</td><td class="n">${(100 * x.share).toFixed(1)} %</td><td class="n">${x.q <= 0 ? '<span class="chip crit">0</span>' : fmt(x.q)}</td><td class="mn"><small>${alts || '—'}</small></td></tr>`;
    }).join('')}</tbody></table>` : '<p class="empty">Ningún medicamento con piezas no surtidas en 30 días</p>';
  }
  const box = $('rx-table');
  if (box._h !== html) {
    box._h = html; box.innerHTML = html;
    box.querySelectorAll('tr[data-c]').forEach(tr => tr.addEventListener('click', () => openDetail(tr.dataset.c)));
  }
}
function downloadRxCsv() {
  const { days, tot, meds } = rxData(), u = app.unit;
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  let rows;
  if ((app.rxView || 'day') === 'day') {
    rows = [['Fecha', 'Recetas', 'Completas', 'Parciales', 'Negadas', '% completas', 'Piezas no surtidas'],
      ...days.map(x => [x.today ? `${app.cal.dateLabel(x.d)} (hasta ${hhmm(app.t)})` : app.cal.dateLabel(x.d), x.rx, x.full, x.part, x.den, x.rx ? (100 * x.full / x.rx).toFixed(1) : '', x.negPz]),
      ['Total', tot.rx, tot.full, tot.part, tot.den, tot.rx ? (100 * tot.full / tot.rx).toFixed(1) : '', tot.negPz]];
  } else {
    rows = [['Clave', 'Medicamento', 'Clasificación', 'Piezas no surtidas', '% de la demanda', 'Existencia hoy'], ...meds.map(x => [x.m.c, x.m.n, x.m.ven, x.neg, (100 * x.share).toFixed(1), x.q])];
  }
  const csv = '\ufeff' + [[`${u.nombre} · CLUES ${u.clues} · datos simulados`], ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `recetas_${u.clues}_${app.rxView === 'med' ? 'por_medicamento' : 'por_dia'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------------
//  Medicamentos (tabla y tarjetas)
// ---------------------------------------------------------------------
function filtered() {
  const f = app.filter;
  return rows().filter(r =>
    (f.use === 'all' || r.m.u === f.use) &&
    (f.group === 'all' || r.m.g === f.group) &&
    (f.state === 'all' || r.state === f.state) &&
    (!f.q || r.m.n.toLowerCase().includes(f.q) || r.m.c.includes(f.q) || r.m.d.toLowerCase().includes(f.q))
  ).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.cov - b.cov);
}
function tags(m) {
  return `${m.u === 'Q' ? '<span class="tag q">Quirófano</span>' : ''}${m.frio ? '<span class="tag frio">Red fría</span>' : ''}${m.ctrl ? '<span class="tag ctrl">Controlado</span>' : ''}`;
}
function renderMeds(force) {
  const now = performance.now();
  if (!force && now - (app._medT || 0) < 1500) return;
  app._medT = now;
  const R = filtered();
  $('m-count').textContent = `${R.length} de ${app.supply.items.length} claves`;
  const surg = app.supply.surgical;
  if (app.view === 'table') {
    const html = `<table><thead><tr><th class="col-cl">Clave</th><th>Medicamento</th><th class="n">Existencia</th><th class="n">Cobertura</th>
      <th class="n col-opt">Entradas 30 d</th><th class="n col-wide">Salidas pacientes 30 d</th>${surg ? '<th class="n col-wide">Salidas quirófano y urgencias 30 d</th>' : ''}<th class="n col-sm">Salidas 30 d</th>
      <th>Estado</th><th class="col-opt">Existencia 30 d</th></tr></thead><tbody>${R.map(r => {
        const [t, lbl] = STATE[r.state];
        const cov = isFinite(r.cov) ? r.cov : 0;
        return `<tr data-c="${r.m.c}"><td class="cl col-cl">${r.m.c}</td>
          <td class="mn"><b>${esc(r.m.n)}${tags(r.m)}${Math.abs(r.fc.changePct) >= 15 && r.fc.last14 >= 10 ? `<span class="trend ${r.fc.changePct > 0 ? 'up' : 'down'}" title="Pronóstico próximas 2 semanas vs últimas 2">${r.fc.changePct > 0 ? '↑' : '↓'}${Math.abs(r.fc.changePct).toFixed(0)} %</span>` : ''}</b><small><span class="cl-in">${r.m.c} · </span>${esc(r.m.g)} · ${esc(r.m.pz)}${r.m.pack > 1 ? ` · envase de ${r.m.pack}` : ''}</small></td>
          <td class="n"><b>${fmt(r.s)}</b></td>
          <td class="n"><span class="cov ${r.state}">${cov.toFixed(1)} d<span class="bar"><i style="width:${Math.min(100, 100 * r.s / app.supply.max.get(r.m.c)).toFixed(0)}%"></i></span></span></td>
          <td class="n col-opt">${fmt(r.ent)}</td><td class="n col-wide">${r.m.u === 'F' ? fmt(r.salF) : '—'}</td>${surg ? `<td class="n col-wide">${r.m.u === 'Q' ? fmt(r.salQ) : '—'}</td>` : ''}<td class="n col-sm">${fmt(r.salF + r.salQ)}</td>
          <td><span class="chip ${t}">${lbl}</span></td><td class="col-opt">${spark(r.series, app.supply.min.get(r.m.c))}</td></tr>`;
      }).join('')}</tbody></table>${R.length ? '' : '<p class="empty">Ninguna clave coincide con el filtro</p>'}`;
    const box = $('m-table');
    if (box._h !== html) { box.innerHTML = html; box._h = html; box.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => openDetail(tr.dataset.c))); }
  } else {
    const html = R.map(r => {
      const [t, lbl] = STATE[r.state];
      return `<button class="mc" data-c="${r.m.c}"><div class="t"><b>${esc(r.m.n)}</b><span class="chip ${t}">${lbl}</span></div>
        <span class="cl">${r.m.c}${tags(r.m)}</span>
        <div class="big"><strong>${fmt(r.s)}</strong><span>${esc(plural(r.m.pz))} · ${isFinite(r.cov) ? r.cov.toFixed(1) : '—'} días</span></div>
        ${miniChart(r)}
        <div class="ft"><span>Entradas ${fmt(r.ent)}</span><span>Salidas ${fmt(r.salF + r.salQ)}</span>${r.neg ? `<span style="color:var(--crit)">No surtido ${fmt(r.neg)}</span>` : ''}</div></button>`;
    }).join('') || '<p class="empty">Ninguna clave coincide con el filtro</p>';
    const box = $('m-cards');
    if (box._h !== html) { box.innerHTML = html; box._h = html; box.querySelectorAll('.mc').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.c))); }
  }
}

function spark(series, min) {
  const W = 110, Hh = 30, mx = Math.max(1, ...series) * 1.08;
  const x = i => (i / (series.length - 1)) * (W - 4) + 2, y = v => Hh - 3 - (v / mx) * (Hh - 6);
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = series.at(-1);
  return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" aria-hidden="true"><line x1="2" x2="${W - 2}" y1="${y(min)}" y2="${y(min)}" stroke="rgba(251,191,36,.45)" stroke-dasharray="3 3"/>
    <path d="${d}" fill="none" stroke="var(--s-stock)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${x(series.length - 1)}" cy="${y(last)}" r="2.5" fill="${last <= 0 ? 'var(--crit)' : 'var(--accent)'}"/></svg>`;
}
/** Tarjeta: existencia (área) y marcas de entrada en la parte inferior */
function miniChart(r) {
  const S = app.supply, s = r.series, hc = S.hist.byC.get(r.m.c);
  const ent = [...hc.ent, app.st.ent.get(r.m.c) || 0];
  const W = 240, Hh = 64, mx = Math.max(1, ...s, S.max.get(r.m.c)) * 1.05, n = s.length;
  const x = i => (i / (n - 1)) * (W - 6) + 3, y = v => Hh - 10 - (v / mx) * (Hh - 16);
  const line = s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1)},${Hh - 10}L${x(0)},${Hh - 10}Z`;
  const ticks = ent.map((v, i) => v > 0 ? `<rect x="${(x(i) - 2).toFixed(1)}" y="${Hh - 6}" width="4" height="6" rx="1.5" fill="var(--s-in)"/>` : '').join('');
  const mn = S.min.get(r.m.c);
  return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="rgba(201,212,223,.10)"/><line x1="3" x2="${W - 3}" y1="${y(mn)}" y2="${y(mn)}" stroke="rgba(251,191,36,.5)" stroke-dasharray="3 3"/>
    <path d="${line}" fill="none" stroke="var(--s-stock)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${ticks}</svg>`;
}

// ---------------------------------------------------------------------
//  Gráficas (SVG)
// ---------------------------------------------------------------------
function dayLabels() {
  const d = [...app.supply.hist.days, app.dayIdx];
  return d.map(i => { const s = app.cal.dateLabel(i).split(' '); return { idx: i, short: s[1], full: app.cal.dateLabel(i, true), first: s[1] === '1' || i === d[0] ? s[2] : '' }; });
}
function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

/** Barras divergentes: entradas arriba, salidas (pacientes + quirófano) abajo; una sola escala. */
function flowChart(el, d, opts = {}) {
  const W = Math.max(300, el.clientWidth), Hh = opts.height || 230, L = 44, Rp = 8, T = 10, B = 24;
  const n = d.ent.length, cw = (W - L - Rp) / n, bw = Math.max(3, Math.min(22, cw - 2));
  const up = niceMax(Math.max(1, ...d.ent)), dn = niceMax(Math.max(1, ...d.rx.map((v, i) => v + d.or[i])));
  const ph = Hh - T - B, k = ph / (up + dn), y0 = T + up * k;
  const X = i => L + i * cw + (cw - bw) / 2;
  let g = '';
  for (const v of [up, up / 2, -dn / 2, -dn]) { const yy = y0 - v * k; g += `<line class="grid" x1="${L}" x2="${W - Rp}" y1="${yy}" y2="${yy}"/><text class="ax" x="${L - 6}" y="${yy + 4}" text-anchor="end">${fmt(Math.abs(v))}</text>`; }
  let bars = '';
  const r = (x, y, w, h, fill, top) => {
    if (h < 0.5) return '';
    const rr = Math.min(3, w / 2, h);
    // extremo redondeado lejos de la base
    return top
      ? `<path d="M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z" fill="${fill}"/>`
      : `<path d="M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z" fill="${fill}"/>`;
  };
  for (let i = 0; i < n; i++) {
    const x = X(i), today = i === n - 1;
    const op = today ? ' opacity=".85"' : '';
    if (d.ent[i]) bars += `<g${op}>${r(x, y0 - d.ent[i] * k - 1, bw, d.ent[i] * k, 'var(--s-in)', true)}</g>`;
    const hr = d.rx[i] * k, ho = d.or[i] * k;
    bars += `<g${op}>${hr ? (ho > 0.5 ? `<rect x="${x}" y="${y0 + 1}" width="${bw}" height="${Math.max(0, hr - 1)}" fill="var(--s-rx)"/>` : r(x, y0 + 1, bw, hr, 'var(--s-rx)', false)) : ''}
      ${ho > 0.5 ? r(x, y0 + 1 + hr + 1, bw, ho, 'var(--s-or)', false) : ''}</g>`;
  }
  const labs = d.labels.map((l, i) => (i % (n > 20 ? 5 : 2) === 0 || i === n - 1)
    ? `<text class="ax${i === n - 1 ? ' today' : ''}" x="${L + i * cw + cw / 2}" y="${Hh - 6}" text-anchor="middle">${i === n - 1 ? 'Hoy' : l.short + (l.first ? ' ' + l.first : '')}</text>` : '').join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(opts.aria || 'Entradas y salidas por día')}">${g}
    <rect class="hl" id="${el.id}-hl" x="0" y="${T}" width="${cw}" height="${ph}" visibility="hidden"/>${bars}
    <line class="zero" x1="${L}" x2="${W - Rp}" y1="${y0}" y2="${y0}"/>${labs}</svg>`;
  hover(el, n, i => L + i * cw, cw, i => {
    const l = d.labels[i];
    return `<b>${i === n - 1 ? `Hoy, ${l.full} (hasta ${hhmm(app.t)})` : l.full}</b>
      <div class="r"><span><i class="sw in"></i>Entradas</span><em>${fmt(d.ent[i])}</em></div>
      <div class="r"><span><i class="sw rx"></i>Salidas a pacientes</span><em>${fmt(d.rx[i])}</em></div>
      ${app.supply.surgical && opts.showOr !== false ? `<div class="r"><span><i class="sw or"></i>Quirófano y urgencias</span><em>${fmt(d.or[i])}</em></div>` : ''}
      ${opts.extra ? opts.extra(i) : ''}`;
  });
}

/** Línea de existencia con mínimo y máximo */
function stockChart(el, series, labels, min, max, unit) {
  const W = Math.max(300, el.clientWidth), Hh = 190, L = 44, Rp = 8, T = 12, B = 24;
  const n = series.length, top = niceMax(Math.max(1, ...series, max) * 1.05);
  const cw = (W - L - Rp) / (n - 1), X = i => L + i * cw, Y = v => T + (1 - v / top) * (Hh - T - B);
  let g = '';
  for (const v of [0, top / 2, top]) g += `<line class="grid" x1="${L}" x2="${W - Rp}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  const line = series.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const zeros = series.map((v, i) => v <= 0 ? `<circle cx="${X(i)}" cy="${Y(0)}" r="4" fill="var(--crit)" stroke="var(--surface)" stroke-width="2"/>` : '').join('');
  const labs = labels.map((l, i) => (i % 5 === 0 || i === n - 1) ? `<text class="ax${i === n - 1 ? ' today' : ''}" x="${X(i)}" y="${Hh - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${i === n - 1 ? 'Ahora' : l.short + (l.first ? ' ' + l.first : '')}</text>` : '').join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Existencia al cierre de cada día">${g}
    <line class="ref max" x1="${L}" x2="${W - Rp}" y1="${Y(max)}" y2="${Y(max)}"/><text class="ref-l" x="${W - Rp}" y="${Y(max) - 5}" text-anchor="end">Máximo ${fmt(max)}</text>
    <line class="ref min" x1="${L}" x2="${W - Rp}" y1="${Y(min)}" y2="${Y(min)}"/><text class="ref-l" x="${W - Rp}" y="${Y(min) - 5}" text-anchor="end">Mínimo ${fmt(min)}</text>
    <path d="${line}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z" fill="rgba(201,212,223,.08)"/>
    <path d="${line}" fill="none" stroke="var(--s-stock)" stroke-width="2" stroke-linejoin="round"/>${zeros}
    <circle id="${el.id}-dot" r="5" fill="var(--s-stock)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>${labs}</svg>`;
  hover(el, n, i => X(i) - cw / 2, cw, i => {
    const dot = $(`${el.id}-dot`); dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(series[i])); dot.setAttribute('visibility', 'visible');
    return `<b>${i === n - 1 ? `Ahora (${hhmm(app.t)})` : `${labels[i].full} · cierre`}</b><div class="r"><span>Existencia</span><em>${fmt(series[i])} ${esc(unit)}</em></div>`;
  }, () => $(`${el.id}-dot`)?.setAttribute('visibility', 'hidden'));
}

/** Demanda real (barras) + pronóstico con banda (28 días) */
function fcChart(el, hist, f, labels) {
  const W = Math.max(300, el.clientWidth), Hh = 200, L = 40, Rp = 8, T = 10, B = 24;
  const H0 = hist.length, n = H0 + f.fc.length;
  const top = niceMax(Math.max(1, ...hist, ...f.hi) * 1.05);
  const cw = (W - L - Rp) / n, X = i => L + i * cw + cw / 2, Y = v => T + (1 - v / top) * (Hh - T - B);
  let g = '';
  for (const v of [0, top / 2, top]) g += `<line class="grid" x1="${L}" x2="${W - Rp}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  const bw = Math.max(2, cw - 2);
  const bars = hist.map((v, i) => v > 0 ? `<rect x="${X(i) - bw / 2}" y="${Y(v)}" width="${bw}" height="${Y(0) - Y(v)}" rx="1.5" fill="#64748b"/>` : '').join('');
  const fx = k => X(H0 + k);
  const band = `M${f.hi.map((v, k) => `${fx(k).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}L${f.lo.map((v, k) => [fx(k), Y(v)]).reverse().map(p => p.map(z => z.toFixed(1)).join(',')).join('L')}Z`;
  const line = f.fc.map((v, k) => `${k ? 'L' : 'M'}${fx(k).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const bt = f.backtest.map((v, k) => `${k ? 'L' : 'M'}${X(H0 - 7 + k).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const xd = L + H0 * cw;
  const futLab = k => app.cal.dateLabel(app.dayIdx + k);
  const labs = [0, 10, 20].map(i => `<text class="ax" x="${X(i)}" y="${Hh - 6}" text-anchor="middle">${labels[i]?.short || ''} ${labels[i]?.first || ''}</text>`).join('') +
    [0, 7, 14, 21, 27].map(k => `<text class="ax${k === 0 ? ' today' : ''}" x="${fx(k)}" y="${Hh - 6}" text-anchor="middle">${k === 0 ? 'Hoy' : futLab(k).split(' ')[1]}</text>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Pronóstico de demanda">${g}
    <rect x="${xd}" y="${T}" width="${W - Rp - xd}" height="${Hh - T - B}" fill="rgba(45,212,191,.04)"/>
    <rect class="hl" id="${el.id}-hl" x="0" y="${T}" width="${cw}" height="${Hh - T - B}" visibility="hidden"/>
    ${bars}<path d="${band}" fill="rgba(45,212,191,.18)"/><path d="${bt}" fill="none" stroke="#2dd4bf" stroke-width="1.5" stroke-dasharray="3 3" opacity=".7"/>
    <path d="${line}" fill="none" stroke="#2dd4bf" stroke-width="2"/><line x1="${xd}" x2="${xd}" y1="${T}" y2="${Hh - B}" stroke="rgba(148,163,184,.5)" stroke-dasharray="4 4"/>${labs}</svg>`;
  hover(el, n, i => L + i * cw, cw, i => i < H0
    ? `<b>${labels[i].full}</b><div class="r"><span>Demanda real</span><em>${fmt(hist[i])}</em></div>${i >= H0 - 7 ? `<div class="r"><span>Pronóstico de prueba</span><em>${f.backtest[i - H0 + 7].toFixed(1)}</em></div>` : ''}`
    : `<b>${app.cal.dateLabel(app.dayIdx + i - H0, true)}</b><div class="r"><span>Pronóstico</span><em>${f.fc[i - H0].toFixed(1)}</em></div><div class="r"><span>Rango probable</span><em>${f.lo[i - H0].toFixed(0)}–${f.hi[i - H0].toFixed(0)}</em></div>`);
}

/** Capa de hover por columna (zona táctil del ancho completo de la columna) */
function hover(el, n, xOf, cw, html, onLeave) {
  const svg = el.querySelector('svg'), tip = $('tip');
  const hl = el.querySelector('.hl');
  const move = ev => {
    const rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const px = (ev.clientX - rect.left) * vb.width / rect.width;
    let i = -1;
    for (let k = 0; k < n; k++) if (px >= xOf(k) && px < xOf(k) + cw) { i = k; break; }
    if (i < 0) return leave();
    if (hl) { hl.setAttribute('x', xOf(i)); hl.setAttribute('width', cw); hl.setAttribute('visibility', 'visible'); }
    tip.innerHTML = html(i); tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let tx = ev.clientX + 14, ty = ev.clientY - th - 12;
    if (tx + tw > innerWidth - 8) tx = ev.clientX - tw - 14;
    if (ty < 8) ty = ev.clientY + 16;
    tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  };
  const leave = () => { tip.hidden = true; hl?.setAttribute('visibility', 'hidden'); onLeave?.(); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
}

function renderCharts() {
  app._chartT = performance.now();
  const S = app.supply, h = S.hist, st = app.st;
  const tot = key => {
    const out = new Array(HISTORY_DAYS).fill(0);
    for (const hc of h.byC.values()) hc[key].forEach((v, i) => { out[i] += v; });
    return out;
  };
  const tmap = m => sum([...m.values()]);
  const d = {
    ent: [...tot('ent'), st.received], rx: [...tot('salF'), tmap(st.salF)], or: [...tot('salQ'), tmap(st.salQ)],
    labels: dayLabels(),
  };
  const rxN = [...h.rx, st.rx], rxF = [...h.rxFull, st.rxFull], sg = [...h.surg, st.surg];
  flowChart($('flow-chart'), d, {
    extra: i => `<div class="r"><span>Recetas</span><em>${fmt(rxN[i])} · ${rxN[i] ? (100 * rxF[i] / rxN[i]).toFixed(1) : '100'} % completas</em></div>${S.surgical ? `<div class="r"><span>Cirugías</span><em>${sg[i]}</em></div>` : ''}`,
  });
}

// ---------------------------------------------------------------------
//  Detalle de un medicamento
// ---------------------------------------------------------------------
function openDetail(c) { app.detail = c; $('detail').hidden = false; renderDetail(true); }
function closeDetail() { app.detail = null; $('detail').hidden = true; $('tip').hidden = true; }

function renderDetail(force) {
  const now = performance.now();
  if (!force && now - (app._detT || 0) < 2000) return;
  app._detT = now;
  const S = app.supply, c = app.detail, m = S.byClave.get(c), hc = S.hist.byC.get(c), st = app.st;
  const r = rows().find(x => x.m.c === c);
  $('d-clave').textContent = `Clave ${c} · ${m.g}`;
  $('d-name').innerHTML = `${esc(m.n)}${tags(m)}`;
  $('d-desc').textContent = `${m.d} Unidad de despacho: ${m.pz}${m.pack > 1 ? `; el CEDIS envía envases de ${m.pack}` : ''}.`;
  const [t, lbl] = STATE[r.state];
  const D = S.demand.get(c);
  $('d-stats').innerHTML = [
    ['Existencia ahora', `${fmt(r.s)} <small class="chip ${t}">${lbl}</small>`],
    ['Cobertura', `${isFinite(r.cov) ? r.cov.toFixed(1) : '—'} días`],
    ['Consumo promedio', `${D.toFixed(D < 10 ? 1 : 0)} / día`],
    ['Mínimo · máximo', `${fmt(S.min.get(c))} · ${fmt(S.max.get(c))}`],
    ['Clasificación', { V: 'Vital', E: 'Esencial', N: 'No esencial' }[m.ven] || '—'],
    ['Recetas pendientes', fmt(st.rxPend.filter(p => p.c === c).length)],
    ...((m.alt || []).filter(a => S.byClave.has(a)).length ? [['Alternativas (decide el médico)', m.alt.filter(a => S.byClave.has(a)).map(a => `${esc(nameOf(a))} · ${fmt(st.stock.get(a))}`).join('<br>')]] : []),
    ['Entradas 30 d', fmt(r.ent)],
    [m.u === 'F' ? 'Salidas a pacientes 30 d' : 'Salidas a quirófano y urgencias 30 d', fmt(m.u === 'F' ? r.salF : r.salQ)],
    ['No surtido 30 d', fmt(r.neg)],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  // Lotes en existencia (PEPS: sale primero el que caduca antes)
  const lots = (st.lots.get(c) || []).filter(x => x.q > 0);
  $('d-lots').innerHTML = lots.length ? `<div class="row h"><span>Lote</span><span>Caducidad</span><span class="n">Piezas</span><span>Estado</span></div>` + lots.map((x, i) => {
    const [tn, tl] = expTone(x.exp - app.dayIdx);
    return `<div class="row"><a class="lot-link" href="mapa.html?lote=${x.lot}&t=${Math.floor(app.t)}" title="Ver trazabilidad en la red">${x.lot}</a><span>${dateOf(x.exp)}</span><span class="n">${fmt(x.q)}</span><span><span class="chip ${tn}">${tl}</span>${i === 0 ? ' <small class="muted">sale primero</small>' : ''}</span></div>`;
  }).join('') : '<p class="empty">Sin existencia</p>';
  // Pronóstico
  const f = r.fc, daysToNext = S.today.events.some(e => e.kind === 'in' && e.t > app.t) ? 0.3 : (S.nextDelivery ?? app.dayIdx + 7) - app.dayIdx;
  const pend = sum(st.pending.flatMap(e => e.lines.filter(l => l.c === c).map(l => l.q)));
  const sug = suggestedOrder(f, { stock: r.s, pending: pend, daysToNext, cycle: S.cycle, pack: m.pack });
  const ruleQ = Math.max(0, Math.ceil((S.max.get(c) - r.s) / m.pack) * m.pack);
  let acc = 0, out = null; for (let k = 0; k < f.fc.length; k++) { acc += f.fc[k]; if (acc > r.s + pend) { out = k; break; } }
  $('d-fc-stats').innerHTML = [
    ['Demanda próximas 2 semanas', `${fmt(f.next14)} <small class="trend ${f.changePct > 0 ? 'up' : 'down'}">${f.changePct >= 0 ? '+' : ''}${f.changePct.toFixed(0)} %</small>`],
    ['Últimas 2 semanas', fmt(f.last14)],
    ['Precisión (semana de prueba)', `${Math.max(0, 100 - f.wape * 100).toFixed(0)} %`],
    ['Alcanza hasta', out === null ? 'más de 4 semanas' : dateOf(app.dayIdx + out).replace(/ \d{4}$/, '')],
    ['Pedido sugerido (pronóstico)', `${fmt(sug.qty)}`],
    ['Pedido por mín-máx', fmt(ruleQ)],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  const hd = hc.salF.map((v, i) => v + hc.salQ[i] + hc.neg[i]);
  fcChart($('d-fc'), hd, f, dayLabels());
  const labels = dayLabels();
  stockChart($('d-stock'), r.series, labels, S.min.get(c), S.max.get(c), plural(m.pz));
  flowChart($('d-flow'), {
    ent: [...hc.ent, st.ent.get(c) || 0], rx: [...hc.salF, st.salF.get(c) || 0], or: [...hc.salQ, st.salQ.get(c) || 0], labels,
  }, { height: 200, showOr: m.u === 'Q', aria: `Entradas y salidas de ${m.n}`,
    extra: i => { const ng = i < HISTORY_DAYS ? hc.neg[i] : (st.neg.get(c) || 0); return ng ? `<div class="r" style="color:var(--crit)"><span>No surtido</span><em>${fmt(ng)}</em></div>` : ''; } });
  // Kárdex: hoy por evento; días anteriores agregados
  const rowsK = [];
  for (const e of st.done.slice().reverse()) {
    const li = e.lines.findIndex(l => l.c === c);
    if (li < 0) continue;
    if (e.kind === 'in') { const l = e.lines[li]; if (l.q) rowsK.push([`Hoy ${hhmm(e.t)}`, `${e.type === 'Urgente' ? `Reabasto urgente N${e.level}` : `Entrega CEDIS · ruta ${e.route}`} · lote ${l.lot}`, l.q, '']); }
    else rowsK.push([`Hoy ${hhmm(e.t)}`, `${e.kind === 'rx' ? `Receta ${e.folio}${e.out[li] < e.lines[li].q ? ' · parcial' : ''}` : `${e.proc} · ${e.folio}`}${e.lots?.[li]?.length ? ' · lote ' + e.lots[li].map(x => x[0]).join(', ') : ''}`, '', e.out[li]]);
    if (rowsK.length > 25) break;
  }
  for (let i = HISTORY_DAYS - 1; i >= 0 && rowsK.length < 60; i--) {
    const lab = labels[i].full;
    if (hc.ent[i]) {
      const dd = S.hist.deliveries.filter(e => Math.floor(e.t / DAY) === labels[i].idx && e.lines.some(l => l.c === c && l.q));
      for (const e of dd) { const l = e.lines.find(x => x.c === c); rowsK.push([lab, `${e.type === 'Urgente' ? `Reabasto urgente N${e.level}` : `Entrega CEDIS · ruta ${e.route}`} · lote ${l.lot}`, l.q, '']); }
    }
    if (hc.salF[i]) rowsK.push([lab, `Recetas surtidas (día)${hc.neg[i] ? ` · ${fmt(hc.neg[i])} no surtidas` : ''}`, '', hc.salF[i]]);
    if (hc.salQ[i]) rowsK.push([lab, `Consumo de quirófano y urgencias (día)${hc.neg[i] ? ` · faltaron ${fmt(hc.neg[i])}` : ''}`, '', hc.salQ[i]]);
  }
  $('d-kardex').innerHTML = `<div class="row h"><span>Fecha</span><span>Concepto</span><span class="n">Entrada</span><span class="n">Salida</span></div>` +
    rowsK.map(([f, k, a, b]) => `<div class="row"><span class="muted">${esc(f)}</span><span>${esc(k)}</span><span class="n pos">${a === '' ? '' : '+' + fmt(a)}</span><span class="n neg">${b === '' ? '' : '−' + fmt(b)}</span></div>`).join('');
}

init().catch(err => { console.error(err); $('loading').textContent = 'No se pudo cargar la unidad: ' + err.message; });

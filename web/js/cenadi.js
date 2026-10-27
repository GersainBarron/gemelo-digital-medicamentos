// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  cenadi.js · Página "CENADI · Entradas y salidas"
//  Une el motor de patio (yard-sim.js) con la escena 3D (cenadi3d.js),
//  el panel de "Dónde se atrasa", los indicadores, el Gantt de andenes,
//  la gráfica de colas, la agenda y la comparación de escenarios.
// =====================================================================
import { buildParams, simulate, SCENARIOS, MODIFIERS, STAGES, stagesAt, delaysAt, stateAt, STATE_COLOR, slotCapacity, meanDockTime, hhmm, dur } from './yard-sim.js';
import { Cenadi3D } from './cenadi3d.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = x => x == null ? '—' : `${Math.round(x * 100)} %`;
const SEMC = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', idle: '#475569' };
const store = { get(k, d) { try { const v = localStorage.getItem('cenadi.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('cenadi.' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } } };

const App = {
  scn: store.get('scn', 'A'), mod: store.get('mod', 'normal'), over: {},
  t: 7 * 3600, playing: true, speed: store.get('speed', 300),
  S: null, view: null, agTab: 'prov', agF: 'all', lastUiM: -1, lastUiReal: 0,
};

// ------------------------------------------------------------------ parámetros editables
const PARAMS = [
  { k: 'andenes', n: 'Andenes de recepción abiertos', min: 4, max: 14, step: 1, f: v => v },
  { k: 'ventana', n: 'Ventana de cita', opts: [[30, '30 min'], [60, '60 min'], [120, '120 min']] },
  { k: 'horario', n: 'Horario de recepción', opts: [['480-840', '8:00 a 14:00'], ['420-1020', '7:00 a 17:00'], ['360-1320', '6:00 a 22:00'], ['0-1440', '24 horas']] },
  { k: 'sinCita', n: 'Llegan sin cita', min: 0, max: 1, step: 0.05, f: v => pct(v) },
  { k: 'volumen', n: 'Volumen de proveedores', min: 0.5, max: 3, step: 0.1, f: v => `×${(+v).toFixed(1)}` },
  { k: 'validadores', n: 'Validadores del ISSSTE', min: 2, max: 16, step: 1, f: v => v },
  { k: 'montacargas', n: 'Carritos para descargar', min: 2, max: 14, step: 1, f: v => v },
  { k: 'reachTrucks', n: 'Montacargas de rack', min: 1, max: 12, step: 1, f: v => v },
  { k: 'cajones', n: 'Cajones del patio regulador', min: 4, max: 20, step: 1, f: v => v },
  { k: 'surtidores', n: 'Surtidores (picking)', min: 8, max: 48, step: 2, f: v => v },
  { k: 'pTarde', n: 'Llegan tarde (+45 a 120 min)', min: 0, max: 0.6, step: 0.05, f: v => pct(v) },
  { k: 'validacionEnAnden', n: 'Validar en el andén', chk: true },
  { k: 'frioExclusivo', n: 'Andenes de red fría propios', chk: true },
  { k: 'carrilFlota', n: 'Carril de caseta para la flota', chk: true },
];

function params() {
  const o = { ...App.over };
  if (o.horario) { const [a, b] = o.horario.split('-').map(Number); o.abre = a; o.cierra = b; delete o.horario; }
  return buildParams(App.scn, App.mod, o);
}

function buildParamUI() {
  const p = params();
  $('#param-grid').innerHTML = PARAMS.map(d => {
    let val = d.k === 'horario' ? `${p.abre}-${p.cierra}` : p[d.k];
    if (d.chk) return `<label class="cn-p chk"><input type="checkbox" data-k="${d.k}" ${val ? 'checked' : ''}>${d.n}</label>`;
    if (d.opts) {
      const has = d.opts.some(o => String(o[0]) === String(val));
      const opts = (has ? d.opts : [...d.opts, [val, d.k === 'horario' ? `${hhmm(p.abre)} a ${hhmm(p.cierra)}` : val]]);
      return `<label class="cn-p"><span class="row">${d.n}</span><select data-k="${d.k}">${opts.map(o => `<option value="${o[0]}" ${String(o[0]) === String(val) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`;
    }
    return `<label class="cn-p"><span class="row">${d.n}<b>${d.f(val)}</b></span><input type="range" data-k="${d.k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${val}"></label>`;
  }).join('');
  const cap = slotCapacity(p, p.frioExclusivo ? p.andenes - p.andenesFrio : p.andenes);
  $('#p-cupo').textContent = p.citas ? `Cupo: ${cap} citas por ventana de ${p.ventana} min${p.frioExclusivo ? ` + ${slotCapacity(p, p.andenesFrio)} de red fría` : ''} · tiempo medio en andén ${dur(meanDockTime(p))}` : `Sin citas · tiempo medio en andén ${dur(meanDockTime(p))}`;
}

$('#param-grid').addEventListener('input', e => {
  const el = e.target, k = el.dataset.k; if (!k) return;
  const d = PARAMS.find(x => x.k === k);
  let v = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? (k === 'horario' ? el.value : Number(el.value)) : Number(el.value);
  if (el.type === 'range') el.previousElementSibling.querySelector('b').textContent = d.f(v);
  if (k === 'sinCita') App.over.citas = v < 1;
  App.over[k] = v;
  clearTimeout(App._pt); App._pt = setTimeout(() => { run(); buildParamUI(); }, el.type === 'range' ? 180 : 0);
});
$('#p-reset').addEventListener('click', () => { App.over = {}; buildParamUI(); run(); });

// ------------------------------------------------------------------ escenario
function setSeg(sel, attr, val) { document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('active', b.dataset[attr] === String(val))); }
$('#scn').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.scn = b.dataset.s; store.set('scn', App.scn); App.over = {}; setSeg('#scn', 's', App.scn); buildParamUI(); run(); });
$('#mod').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.mod = b.dataset.m; store.set('mod', App.mod); setSeg('#mod', 'm', App.mod); buildParamUI(); run(); });

function run() {
  const t0 = performance.now();
  App.S = simulate(params());
  App.view?.setSim(App.S);
  $('#scn-desc').innerHTML = `<b>${esc(SCENARIOS[App.scn].nombre)}</b> · ${esc(MODIFIERS[App.mod].nombre)}. ${esc(SCENARIOS[App.scn].desc)}${Object.keys(App.over).length ? ' <em>Con parámetros ajustados.</em>' : ''}`;
  renderKpis(); renderQueue(); renderGantt(); App.lastUiM = -1; refreshLive(true);
  markCompare();
  console.debug('[cenadi] día simulado en', Math.round(performance.now() - t0), 'ms');
}

// ------------------------------------------------------------------ reloj
const playIcon = () => { $('#btn-play').innerHTML = App.playing ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>'; $('#btn-play').setAttribute('aria-label', App.playing ? 'Pausar' : 'Reproducir'); $('#sim-status').classList.toggle('paused', !App.playing); $('#sim-status').textContent = App.playing ? 'Día tipo · simulado' : 'En pausa'; };
$('#btn-play').addEventListener('click', () => { App.playing = !App.playing; if (App.playing && App.t >= 86399) App.t = 0; playIcon(); });
document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => { App.speed = +b.dataset.speed; store.set('speed', App.speed); setSeg('.speed', 'speed', App.speed); }));
$('#t-range').addEventListener('input', e => { App.t = +e.target.value * 60; refreshLive(true); });
$('.cn-jumps').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !App.S) return;
  const p = App.S.p;
  let m = p.abre;
  if (b.dataset.j === 'close') m = Math.min(1439, p.cierra);
  if (b.dataset.j === 'peak') { const s = App.S.series.reduce((a, x) => (x.roadProv + x.yard > a.roadProv + a.yard ? x : a), App.S.series[0]); m = s.m; }
  App.t = m * 60; refreshLive(true);
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (App.playing && App.S) {
    App.t += dt * App.speed;
    if (App.t >= 86399) { App.t = 86399; App.playing = false; playIcon(); }
  }
  if (App.view && App.S) { App.view.update(App.t, dt); App.view.render(); }
  const m = Math.floor(App.t / 60);
  if (m !== App.lastUiM && now - App.lastUiReal > 220) { App.lastUiM = m; App.lastUiReal = now; refreshLive(); }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ vivo: reloj, flujo, atrasos, gantt/cola (línea de hora), agenda
function refreshLive(force = false) {
  if (!App.S) return;
  const m = App.t / 60;
  $('#clock').textContent = `${hhmm(m)} · día tipo`;
  $('#t-label').textContent = hhmm(m);
  if (document.activeElement !== $('#t-range')) $('#t-range').value = Math.min(1439, Math.floor(m));
  renderFlow(m); renderDelays(m); moveNow(m);
  if (force || Math.floor(m) % 2 === 0) renderAgenda(m);
}

function renderFlow(m) {
  const st = stagesAt(App.S, m);
  const chip = s => `<button class="cn-stage ${s.sem}" data-z="${s.zona}" title="Meta: ${s.meta} min en la etapa"><span class="n">${esc(s.nombre)}</span><b>${s.n}<i>${s.unidad === 'veh' ? 'veh' : 'tar'}</i></b><small>${s.n ? `más antiguo ${dur(s.edad)}` : 'sin espera'}</small></button>`;
  $('#flow-rec').innerHTML = STAGES.filter(s => s.flujo === 'rec').map(s => chip(st[s.id])).join('');
  $('#flow-emb').innerHTML = STAGES.filter(s => s.flujo === 'emb').map(s => chip(st[s.id])).join('');
}
document.querySelectorAll('.cn-stages').forEach(el => el.addEventListener('click', e => { const b = e.target.closest('.cn-stage'); if (!b) return; showView(b.dataset.z); $('#c3d').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));

function renderDelays(m) {
  const list = delaysAt(App.S, m);
  $('#delay-sub').textContent = list.length ? `${list.length} a las ${hhmm(m)}` : '';
  if (!list.length) { $('#delays').innerHTML = '<p class="empty">Nada fuera de meta a esta hora.</p>'; return; }
  $('#delays').innerHTML = list.slice(0, 12).map((d, i) => {
    const v = d.v;
    const who = v.kind === 'salida' ? `Ruta ${esc(v.ruta)} · ${v.tarimas} tarimas` : `${esc(v.prov)} · ${esc(v.tipoNombre)}${v.frio ? ' · red fría' : ''}`;
    const what = d.ruta
      ? `${d.stage.nombre}: ${d.n ? `faltan ${d.n} tarimas por surtir` : 'surtida, falta cargar'} · sale ${hhmm(v.plan)}`
      : `${d.stage.nombre}${d.stage.unidad === 'tar' ? ` · ${d.n} tarimas` : ''} · meta ${dur(d.stage.meta)}`;
    const em = d.ruta ? `+${dur(Math.max(0, d.atraso))}` : dur(d.edad);
    return `<button class="cn-delay ${d.sem}" data-i="${i}"><i class="dot ${d.sem}"></i><b>${esc(v.id)} · ${who}</b><em>${em}</em><small>${what}</small></button>`;
  }).join('');
  App._delays = list;
}
$('#delays').addEventListener('click', e => {
  const b = e.target.closest('.cn-delay'); if (!b) return;
  const d = App._delays[+b.dataset.i];
  if (!App.view) return;
  const m = App.t / 60;
  if (d.stage.unidad === 'veh' || d.stage.id === 'cargando') { if (!App.view.focusVehicle(d.v, m)) showView(d.stage.zona); }
  else showView(d.stage.zona);
  $('#c3d').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ------------------------------------------------------------------ KPIs (día completo)
function renderKpis() {
  const k = App.S.kpi, p = App.S.p;
  const sem = (v, ok, warn, up = false) => v == null ? '' : up ? (v >= ok ? 'ok' : v >= warn ? 'warn' : 'crit') : (v <= ok ? 'ok' : v <= warn ? 'warn' : 'crit');
  const tile = (name, val, unit, sub, s) => `<div class="kpi ${s}"><span>${name}</span><b>${val}${unit ? `<i>${unit}</i>` : ''}</b><small><i class="dot"></i>${sub}</small></div>`;
  const hm = mm => { const r = Math.round(mm); return r < 60 ? [String(r), 'min'] : [`${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`, 'h']; };
  const est = hm(k.estancia), pat = hm(k.esperaPatio), d2s = hm(k.dockToStock);
  const uso = k.usoAndenes;
  const perdidos = k.noRecibidos + k.reprogramados;
  $('#kpis').innerHTML = [
    tile('Tiempo de estancia promedio (caseta a caseta)', est[0], est[1], `meta ≤ 2 h · ${pct(k.pctMas3h)} arriba de 3 h`, sem(k.estancia, 120, 180)),
    tile('Cola máxima en carretera', k.colaMax, 'veh', `meta 0 · espera prom. ${dur(k.esperaCarretera)}`, sem(k.colaMax, 0, 3)),
    tile('Espera en patio promedio', pat[0], pat[1], `meta ≤ 30 min · máx. ${k.patioMax}/${p.cajones} cajones`, sem(k.esperaPatio, 30, 60)),
    tile('Uso de andenes de recepción', Math.round(uso * 100), '%', `meta 70 a 85 % · ${dur(k.tAnden)} por vehículo`, uso > 0.9 ? 'crit' : uso >= 0.7 ? 'ok' : 'warn'),
    tile('Cumplimiento de cita (±15 min)', k.cumplimiento == null ? '—' : Math.round(k.cumplimiento * 100), k.cumplimiento == null ? '' : '%', k.cumplimiento == null ? 'escenario sin citas' : `meta ≥ 85 % · ${k.faltas} faltas`, sem(k.cumplimiento, 0.85, 0.7, true)),
    tile('Proveedores recibidos', k.recibidos, `de ${k.programados}`, perdidos ? `${k.noRecibidos} no recibidos · ${k.reprogramados} sin cupo` : 'todos con lugar hoy', perdidos ? (perdidos > 3 ? 'crit' : 'warn') : 'ok'),
    tile('Andén a rack (dock to stock)', d2s[0], d2s[1], `${k.tarimasRecibidas} tarimas · espera para subir ${dur(k.esperaUbicar)}`, sem(k.dockToStock, 120, 240)),
    tile('Salidas a tiempo', Math.round(k.salidasATiempo * 100), '%', `meta ≥ 95 % · atraso prom. ${dur(k.atrasoSalida)}`, sem(k.salidasATiempo, 0.95, 0.85, true)),
  ].join('');
}

// ------------------------------------------------------------------ Gantt de andenes
function dayRange() {
  const S = App.S, p = S.p;
  const ends = S.V.filter(v => v.tRelease != null).map(v => v.tRelease);
  const starts = S.V.filter(v => v.arr != null).map(v => v.arr);
  const a = Math.max(0, Math.floor((Math.min(p.abre, ...starts) - 30) / 60) * 60);
  const b = Math.min(1800, Math.ceil((Math.max(p.cierra, ...ends) + 30) / 60) * 60);
  return [a, b];
}
function renderGantt() {
  const S = App.S, p = S.p, [a, b] = dayRange();
  const W = 1000, L = 58, rowH = 22, top = 22, H = top + p.andenes * rowH + 22;
  const X = m => L + (m - a) / (b - a) * (W - L - 8);
  let s = `<svg class="cn-gantt" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  s += `<rect class="closed" x="${L}" y="${top}" width="${Math.max(0, X(p.abre) - L)}" height="${p.andenes * rowH}"/><rect class="closed" x="${X(p.cierra)}" y="${top}" width="${Math.max(0, W - 8 - X(p.cierra))}" height="${p.andenes * rowH}"/>`;
  for (let h = Math.ceil(a / 60) * 60; h <= b; h += 60) {
    s += `<line class="grid" x1="${X(h)}" x2="${X(h)}" y1="${top}" y2="${top + p.andenes * rowH}"/>`;
    if ((h / 60) % ((b - a) > 900 ? 2 : 1) === 0) s += `<text class="ax" x="${X(h)}" y="${top - 8}" text-anchor="middle">${hhmm(h)}</text>`;
  }
  const PH = [['tDock', 'tUnload0', '#a3e635'], ['tUnload0', 'tUnload1', '#34d399']];
  S.docks.forEach((d, i) => {
    const y = top + i * rowH;
    s += `<text class="row-l ${d.frio ? 'frio' : ''}" x="4" y="${y + rowH / 2 + 4}">R${String(i + 1).padStart(2, '0')}${d.frio ? ' ❄' : ''}</text>`;
    s += `<line class="grid" x1="${L}" x2="${W - 8}" y1="${y + rowH}" y2="${y + rowH}"/>`;
    for (const v of d.log) {
      const seg = (t0, t1, c, ph) => t0 != null && t1 != null && t1 > t0 ? `<rect class="bar" data-id="${v.id}" x="${X(t0)}" y="${y + 3}" width="${Math.max(0.8, X(t1) - X(t0))}" height="${rowH - 6}" rx="2" fill="${c}"><title>${v.id} · ${ph} ${hhmm(t0)}–${hhmm(t1)}</title></rect>` : '';
      s += seg(v.tDock, Math.min(v.tDock + p.maniobra, v.tUnload0 ?? v.tDock + p.maniobra), '#a3e635', 'atraque');
      if (v.tUnload0 > v.tDock + p.maniobra) s += seg(v.tDock + p.maniobra, v.tUnload0, '#f59e0b', 'espera de carrito');
      s += seg(v.tUnload0, v.tUnload1, '#34d399', 'descarga');
      if (p.validacionEnAnden) {
        if (v.tVal0 > v.tUnload1) s += seg(v.tUnload1, v.tVal0, '#f472b6', 'espera de validador');
        s += seg(v.tVal0, v.tVal1, '#60a5fa', 'validación');
        s += seg(v.tVal1, v.tRelease, '#a78bfa', 'papeles');
      } else s += seg(v.tUnload1, v.tRelease, '#a78bfa', 'papeles');
      if (v.appt != null) s += `<path d="M${X(v.appt) - 4} ${y + 1}h8l-4 6z" fill="#e6edf3" opacity=".85"><title>${v.id} · cita ${hhmm(v.appt)}</title></path>`;
    }
  });
  s += `<line id="g-now" class="now" x1="0" x2="0" y1="${top - 4}" y2="${top + p.andenes * rowH}"/></svg>`;
  $('#gantt').innerHTML = s;
  App._gX = X;
  bindTip('#gantt', '.bar', el => vehTip(App.S.all.find(v => v.id === el.dataset.id)));
}

// ------------------------------------------------------------------ colas
function renderQueue() {
  const S = App.S, p = S.p, [a, b] = dayRange();
  const W = 640, H = 260, L = 34, R = 34, T = 14, Bm = 26;
  const ser = S.series.filter(x => x.m >= a && x.m <= b);
  const maxQ = Math.max(4, p.cajones, ...ser.map(x => x.roadProv + x.yard)) * 1.1;
  const X = m => L + (m - a) / (b - a) * (W - L - R), Y = v => T + (1 - v / maxQ) * (H - T - Bm), Y2 = v => T + (1 - v / p.andenes) * (H - T - Bm);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 4; i++) { const v = maxQ * i / 4; s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`; }
  for (let i = 0; i <= 2; i++) { const v = p.andenes * i / 2; s += `<text class="ax" x="${W - R + 6}" y="${Y2(v) + 4}" style="fill:#2dd4bf">${Math.round(v)}</text>`; }
  for (let h = Math.ceil(a / 60) * 60; h <= b; h += 120) s += `<text class="ax" x="${X(h)}" y="${H - 8}" text-anchor="middle">${hhmm(h)}</text>`;
  const area = (fy0, fy1, c) => { const top = ser.map(x => `${X(x.m)},${Y(fy1(x))}`).join(' '); const bot = [...ser].reverse().map(x => `${X(x.m)},${Y(fy0(x))}`).join(' '); return `<polygon points="${top} ${bot}" fill="${c}" fill-opacity=".75"/>`; };
  s += area(() => 0, x => x.yard, '#fbbf24');
  s += area(x => x.yard, x => x.yard + x.roadProv, '#f87171');
  s += `<line class="ref max" x1="${L}" x2="${W - R}" y1="${Y(p.cajones)}" y2="${Y(p.cajones)}"/><text class="ref-l" x="${L + 4}" y="${Y(p.cajones) - 4}">cajones del patio (${p.cajones})</text>`;
  s += `<polyline points="${ser.map(x => `${X(x.m)},${Y2(x.rec)}`).join(' ')}" fill="none" stroke="#2dd4bf" stroke-width="2"/>`;
  s += `<line id="q-now" class="now" x1="0" x2="0" y1="${T}" y2="${H - Bm}"/>`;
  s += `<rect id="q-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - Bm}" fill="transparent"/></svg>`;
  $('#qchart').innerHTML = s;
  App._qX = X;
  const k = S.kpi;
  $('#q-note').textContent = k.colaMax ? `La cola en carretera llega a ${k.colaMax} vehículos; el patio regulador se llena a ${k.patioMax} de ${p.cajones} cajones.` : `Sin cola en carretera; el patio llega a ${k.patioMax} de ${p.cajones} cajones.`;
  const svg = $('#qchart svg');
  $('#q-hit').addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * W, m = a + (mx - L) / (W - L - R) * (b - a);
    const x = ser.reduce((acc, q) => Math.abs(q.m - m) < Math.abs(acc.m - m) ? q : acc, ser[0]);
    showTip(e, `<b>${hhmm(x.m)}</b><div class="r">Carretera<em>${x.roadProv}</em></div><div class="r">Patio<em>${x.yard}</em></div><div class="r">Andenes ocupados<em>${x.rec}/${p.andenes}</em></div><div class="r">Embarque cargando<em>${x.emb}</em></div>`);
  });
  $('#q-hit').addEventListener('pointerleave', hideTip);
  $('#q-hit').addEventListener('click', e => { const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * W; App.t = (a + (mx - L) / (W - L - R) * (b - a)) * 60; refreshLive(true); });
}
function moveNow(m) {
  const g = $('#g-now'), q = $('#q-now');
  if (g && App._gX) { const x = App._gX(m); g.setAttribute('x1', x); g.setAttribute('x2', x); }
  if (q && App._qX) { const x = App._qX(m); q.setAttribute('x1', x); q.setAttribute('x2', x); }
}

// ------------------------------------------------------------------ agenda
function chip(st) { return `<span class="st-chip"><i style="background:${STATE_COLOR[st] || '#64748b'}"></i>${esc(st)}</span>`; }
function renderAgenda(m) {
  const S = App.S, p = S.p;
  let rows;
  if (App.agTab === 'prov') {
    rows = [...S.V].sort((a, b) => (a.appt ?? a.arr ?? 9999) - (b.appt ?? b.arr ?? 9999));
    const st = v => stateAt(v, m);
    const late = v => { const s = st(v); return (s === 'carretera' && m - v.arr > 15) || (s === 'patio' && m - v.tIn > 30) || (v.tDock != null && m >= v.tDock && (v.tRelease == null || m < v.tRelease) && m - v.tDock > 75) || s === 'no recibido'; };
    if (App.agF === 'now') rows = rows.filter(v => !['programado', 'salió', 'falta', 'reprogramado', 'no recibido'].includes(st(v)));
    if (App.agF === 'late') rows = rows.filter(late);
    if (App.agF === 'miss') rows = rows.filter(v => v.falta || v.reprog || v.noRecibido);
    const n = S.V.length, nc = S.V.filter(v => v.conCita && !v.reprog).length;
    $('#ag-sub').textContent = `${n} proveedores · ${nc} con cita · ${hhmm(m)}`;
    const desv = v => { if (v.appt == null || v.arr == null) return '—'; const d = Math.round(v.arr - v.appt); const c = Math.abs(d) <= p.tolerancia ? '' : d > 0 ? 'late' : 'early'; return `<span class="${c}">${d > 0 ? '+' : ''}${d} min</span>`; };
    $('#agenda').innerHTML = `<table><thead><tr><th>Vehículo</th><th>Proveedor</th><th>Tipo</th><th class="n">Tarimas</th><th class="n">Cita</th><th class="n">Llegada</th><th class="n">Desvío</th><th>Estado a las ${hhmm(m)}</th><th class="n">Andén</th><th class="n">Estancia</th></tr></thead><tbody>${rows.map(v => {
      const s = st(v);
      return `<tr data-id="${v.id}"><td class="cl">${v.id}</td><td>${esc(v.prov)}${v.frio ? '<span class="tag frio">FRÍO</span>' : ''}</td><td>${esc(v.tipoNombre)}</td><td class="n">${v.tarimas}</td><td class="n">${v.appt != null ? hhmm(v.appt) : v.reprog ? 'sin cupo' : 'sin cita'}</td><td class="n">${v.arr != null ? hhmm(v.arr) : '—'}</td><td class="n">${desv(v)}</td><td>${chip(s)}</td><td class="n">${v.dock != null ? 'R' + String(v.dock + 1).padStart(2, '0') : '—'}</td><td class="n">${v.tOut != null && v.tGateIn != null && m >= v.tOut ? dur(v.tOut - v.tGateIn) : v.tGateIn != null && m >= v.tGateIn ? `<span class="muted">${dur(m - v.tGateIn)}</span>` : '—'}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="empty">Sin vehículos en este filtro.</td></tr>'}</tbody></table>`;
  } else {
    rows = [...S.outs];
    const late = o => (o.tOut ?? Infinity) > o.plan + 15 && m >= o.plan - p.liberaOla;
    if (App.agF === 'now') rows = rows.filter(o => m >= o.plan - p.liberaOla && (o.tOut == null || m < o.tOut));
    if (App.agF === 'late') rows = rows.filter(late);
    if (App.agF === 'miss') rows = [];
    $('#ag-sub').textContent = `${S.outs.length} salidas · olas a las ${p.olas.map(hhmm).join(', ')}`;
    $('#agenda').innerHTML = `<table><thead><tr><th>Salida</th><th>Ruta</th><th class="n">Tarimas</th><th class="n">Surtidas</th><th>Carril</th><th class="n">Programada</th><th class="n">Real</th><th class="n">Atraso</th><th>Estado a las ${hhmm(m)}</th></tr></thead><tbody>${rows.map(o => {
      const picked = o.pallets.filter(t => t.tPick1 != null && t.tPick1 <= m).length;
      const at = o.tOut != null ? o.tOut - o.plan : null;
      const s = m < o.plan - p.liberaOla ? 'programado' : picked < o.tarimas ? (o.pallets.some(t => t.tPick0 != null && t.tPick0 <= m) ? 'surtiendo' : 'por surtir') : stateAt(o, m) === 'programado' ? 'consolidado' : stateAt(o, m);
      const col = { 'por surtir': '#f472b6', 'surtiendo': '#2dd4bf', 'consolidado': '#e2e8f0' }[s] || STATE_COLOR[s];
      return `<tr data-id="${o.id}"><td class="cl">${o.id}</td><td>${esc(o.ruta)}${o.frio ? '<span class="tag frio">FRÍO</span>' : ''}</td><td class="n">${o.tarimas}</td><td class="n">${picked}/${o.tarimas}</td><td>E${String(o.laneIdx + 1).padStart(2, '0')}</td><td class="n">${hhmm(o.plan)}</td><td class="n">${o.tOut != null && m >= o.tOut ? hhmm(o.tOut) : '—'}</td><td class="n">${at == null ? '—' : `<span class="${at > 15 ? 'late' : ''}">${at > 1 ? '+' + dur(at) : 'a tiempo'}</span>`}</td><td><span class="st-chip"><i style="background:${col}"></i>${esc(s)}</span></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">Sin salidas en este filtro.</td></tr>'}</tbody></table>`;
  }
}
$('#ag-tab').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.agTab = b.dataset.a; setSeg('#ag-tab', 'a', App.agTab); renderAgenda(App.t / 60); });
$('#ag-f').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.agF = b.dataset.f; setSeg('#ag-f', 'f', App.agF); renderAgenda(App.t / 60); });
$('#agenda').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr || !App.view) return;
  const v = App.S.all.find(x => x.id === tr.dataset.id);
  if (v && App.view.focusVehicle(v, App.t / 60)) { showPanel(v); $('#c3d').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});
$('#ag-csv').addEventListener('click', () => {
  const S = App.S, rows = [['vehiculo', 'proveedor', 'tipo', 'tarimas', 'red_fria', 'cita', 'llegada', 'entrada_caseta', 'atraque', 'anden', 'fin_descarga', 'liberacion_anden', 'salida_caseta', 'estancia_min', 'estado_final']];
  const f = x => x == null ? '' : hhmm(x);
  for (const v of S.V) rows.push([v.id, v.prov, v.tipoNombre, v.tarimas, v.frio ? 'si' : 'no', f(v.appt), f(v.arr), f(v.tGateIn), f(v.tDock), v.dock != null ? 'R' + (v.dock + 1) : '', f(v.tUnload1), f(v.tRelease), f(v.tOut), v.tOut != null && v.tGateIn != null ? Math.round(v.tOut - v.tGateIn) : '', stateAt(v, 1799)]);
  const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `cenadi_${App.scn}_${App.mod}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ------------------------------------------------------------------ comparación
let CMP = null;
function computeCompare() {
  const rows = [];
  const jobs = [];
  for (const s of Object.keys(SCENARIOS)) for (const md of Object.keys(MODIFIERS)) jobs.push([s, md]);
  const step = () => {
    const j = jobs.shift(); if (!j) { CMP = rows; renderCompare(); return; }
    const S = simulate(buildParams(j[0], j[1]));
    rows.push({ s: j[0], m: j[1], k: S.kpi });
    setTimeout(step, 0);
  };
  step();
}
function renderCompare() {
  if (!CMP) return;
  const cols = [
    ['Estancia prom.', r => r.k.estancia, dur, 'min'], ['Cola máx. carretera', r => r.k.colaMax, x => `${x} veh`, 'min'], ['Espera patio', r => r.k.esperaPatio, dur, 'min'],
    ['Uso andenes', r => r.k.usoAndenes, pct, null], ['Recibidos', r => r.k.recibidos / Math.max(1, r.k.programados), (x, r) => `${r.k.recibidos}/${r.k.programados}`, 'max'],
    ['Andén a rack', r => r.k.dockToStock, dur, 'min'], ['Salidas a tiempo', r => r.k.salidasATiempo, pct, 'max'], ['Horas extra', r => r.k.horasExtra, dur, 'min'],
  ];
  const best = cols.map(([, f, , dir]) => { if (!dir) return null; const vals = CMP.map(f); return { lo: Math.min(...vals), hi: Math.max(...vals), dir }; });
  $('#compare').innerHTML = `<table class="cmp"><thead><tr><th>Plan</th><th>Día</th>${cols.map(c => `<th class="n">${c[0]}</th>`).join('')}</tr></thead><tbody>${CMP.map(r => `<tr data-s="${r.s}" data-m="${r.m}"><td>${esc(SCENARIOS[r.s].nombre)}</td><td>${esc(MODIFIERS[r.m].nombre)}</td>${cols.map(([, f, fmt], i) => {
    const v = f(r), b = best[i]; let c = '';
    if (b && b.lo !== b.hi) c = (b.dir === 'min' ? v === b.lo : v === b.hi) ? 'best' : (b.dir === 'min' ? v === b.hi : v === b.lo) ? 'worst' : '';
    return `<td class="n ${c}">${fmt(v, r)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table><p class="note">En verde el mejor valor de cada columna y en rojo el peor. Cada fila es el mismo día (misma semilla) con otro plan.</p>`;
  markCompare();
}
function markCompare() { document.querySelectorAll('#compare tr[data-s]').forEach(tr => tr.classList.toggle('cur', tr.dataset.s === App.scn && tr.dataset.m === App.mod && !Object.keys(App.over).length)); }
$('#compare').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-s]'); if (!tr) return;
  App.scn = tr.dataset.s; App.mod = tr.dataset.m; App.over = {}; store.set('scn', App.scn); store.set('mod', App.mod);
  setSeg('#scn', 's', App.scn); setSeg('#mod', 'm', App.mod); buildParamUI(); run();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ------------------------------------------------------------------ 3D, panel y tooltip
function showView(name) { App.view?.view(name); setSeg('#v3d', 'v', name); $('#btn-roof').classList.toggle('on', App.view?.roof); }
$('#v3d').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); });
$('#btn-roof').addEventListener('click', () => { if (!App.view) return; App.view.setRoof(!App.view.roof); $('#btn-roof').classList.toggle('on', App.view.roof); });

function vehTip(v) {
  if (!v) return '';
  const m = App.t / 60, r = (k, x) => `<div class="r">${k}<em>${x}</em></div>`;
  if (v.kind === 'salida') return `<b>${v.id} · Ruta ${esc(v.ruta)}</b>${r('Tarimas', v.tarimas)}${r('Programada', hhmm(v.plan))}${r('Carga', v.tLoad0 != null ? `${hhmm(v.tLoad0)}–${hhmm(v.tLoad1)}` : '—')}${r('Salida real', v.tOut != null ? hhmm(v.tOut) : '—')}${r('Estado', stateAt(v, m))}`;
  if (v.kind === 'regreso') return `<b>${v.id} · Flota de regreso</b>${r('Llega', hhmm(v.arr))}${r('Pasa caseta', v.tGateIn != null ? hhmm(v.tGateIn) : '—')}${r('Estado', stateAt(v, m))}`;
  return `<b>${v.id} · ${esc(v.prov)}</b>${r('Vehículo', `${esc(v.tipoNombre)}${v.frio ? ' · frío' : ''}`)}${r('Tarimas', v.tarimas)}${r('Cita', v.appt != null ? hhmm(v.appt) : 'sin cita')}${r('Llegó', v.arr != null ? hhmm(v.arr) : '—')}${r('Pasó caseta', v.tGateIn != null ? hhmm(v.tGateIn) : '—')}${r('Atracó', v.tDock != null ? `${hhmm(v.tDock)} · R${String(v.dock + 1).padStart(2, '0')}` : '—')}${r('Descarga', v.tUnload0 != null ? `${hhmm(v.tUnload0)}–${hhmm(v.tUnload1)}` : '—')}${r('Validación', v.tVal0 != null ? `${hhmm(v.tVal0)}–${hhmm(v.tVal1)}${v.incidencia ? ' · incidencia' : ''}` : '—')}${r('Salió', v.tOut != null ? hhmm(v.tOut) : '—')}${r('Estado', stateAt(v, m))}`;
}
function showPanel(v) {
  let pn = $('#c3d .u3d-panel');
  if (!pn) { pn = document.createElement('div'); pn.className = 'u3d-panel'; $('#c3d').appendChild(pn); }
  pn.innerHTML = `<header><div><b>${esc(v.id)}</b><small>${v.kind === 'prov' ? esc(v.prov) : v.kind === 'salida' ? 'Salida de la flota' : 'Regreso de ruta'}</small></div><button class="u3d-x" aria-label="Cerrar">×</button></header><div class="tipbody">${vehTip(v).replace(/^<b>.*?<\/b>/, '')}</div>`;
  pn.querySelector('.u3d-x').onclick = () => pn.remove();
}
const tip = $('#tip');
function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; const x = Math.min(innerWidth - 270, e.clientX + 14), y = Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 14); tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
function hideTip() { tip.hidden = true; }
function bindTip(root, sel, fn) { const el = $(root); el.addEventListener('pointermove', e => { const t = e.target.closest(sel); if (t) showTip(e, fn(t)); else hideTip(); }); el.addEventListener('pointerleave', hideTip); }

// ------------------------------------------------------------------ arranque
async function init() {
  setSeg('#scn', 's', App.scn); setSeg('#mod', 'm', App.mod); setSeg('.speed', 'speed', App.speed); playIcon();
  buildParamUI();
  App.S = simulate(params());
  App.t = Math.max(0, App.S.p.abre - 60) * 60;
  run();
  $('#loading').remove();
  requestAnimationFrame(loop);
  setTimeout(computeCompare, 50);
  try {
    const view = new Cenadi3D($('#c3d'), { glb: 'assets/cenadi.glb', onZone: z => showView(z) });
    await view.load();
    $('#c3d .u3d-loading')?.remove();
    view.onPick = v => showPanel(v);
    view.setSim(App.S);
    App.view = view;
    $('#btn-roof').classList.toggle('on', view.roof);
    window.__cenadi = App;
  } catch (err) {
    console.error(err);
    $('#c3d .u3d-loading').textContent = 'No se pudo cargar el modelo 3D (assets/cenadi.glb).';
  }
}
init();

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  nacional.js · Página "Red nacional · CENADI a 32 estados"
//  Une la simulación (nacional-sim.js) con el mapa 3D (nacional3d.js), la
//  ficha del estado, el mosaico, la carga del CENADI, la tabla de estados,
//  la bitácora y la comparación de escenarios.
// =====================================================================
import { simulate, SCENARIOS, POLICIES, H, DAYS, stateAt, summaryAt, fmtT, dayOf, FREQ_TXT } from './nacional-sim.js';
import { Nacional3D } from './nacional3d.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('es-MX');
const f1 = x => (Math.round(x * 10) / 10).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (x, d = 1) => `${(x * 100).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
const money = x => (x >= 1e6 ? `$${f1(x / 1e6)} M` : `$${nf.format(Math.round(x / 1000))} mil`);
const store = { get(k, d) { try { const v = localStorage.getItem('nacional.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('nacional.' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } } };
const qs = new URLSearchParams(location.search);

const LEVEL = [
  { n: '1er nivel', tipos: ['CAF', 'UMF', 'CMF'], c: '#5eead4' },
  { n: '2º nivel', tipos: ['CE', 'CH', 'HG'], c: '#60a5fa' },
  { n: '3er nivel', tipos: ['HR'], c: '#f472b6' },
];
const TIPO = { CAF: 'Consultorio de atención familiar', UMF: 'Unidad de medicina familiar', CMF: 'Clínica de medicina familiar', CE: 'Clínica de especialidades', CH: 'Clínica hospital', HG: 'Hospital general', HR: 'Hospital regional / CMN' };
const SEMC = { ok: '#34d399', warn: '#fbbf24', crit: '#f87171' };

const App = {
  data: null, outline: null, S: null, view: null,
  scn: qs.get('esc') || store.get('scn', 'normal'), pol: qs.get('asig') || store.get('pol', 'cob'),
  metric: store.get('metric', 'cov'), t: Number(qs.get('t') || 0), playing: true, speed: store.get('speed', 6),
  sel: qs.get('e') || null, sort: { k: 'cov', dir: 1 }, feedF: 'all', lastH: -1, lastUi: 0, cmp: null,
};
if (!SCENARIOS[App.scn]) App.scn = 'normal';
if (!POLICIES[App.pol]) App.pol = 'cob';

// ------------------------------------------------------------------ colores por indicador
const RAMPS = {
  cov: { n: 'Cobertura en días', cls: [[0, '#ef4444', 'sin abasto'], [3, '#f97316', '< 3'], [5, '#fbbf24', '3 a 5'], [8, '#34d399', '5 a 8'], [Infinity, '#14b8a6', '8 o más']] },
  abasto: { n: 'Abasto acumulado', cls: [[0.9, '#ef4444', '< 90 %'], [0.97, '#f97316', '90 a 97 %'], [0.995, '#fbbf24', '97 a 99.5 %'], [0.9999, '#34d399', '99.5 a 99.9 %'], [Infinity, '#14b8a6', '100 %']] },
  unid: { n: 'Unidades ISSSTE', cls: [[10, '#1e3a3a', '< 10'], [20, '#155e57', '10 a 19'], [35, '#0f8a7e', '20 a 34'], [50, '#14b8a6', '35 a 49'], [Infinity, '#5eead4', '50 o más']] },
};
function colorOf(e, st) {
  if (App.metric === 'unid') return RAMPS.unid.cls.find(c => e.total < c[0])[1];
  if (App.metric === 'abasto') return RAMPS.abasto.cls.find(c => st.abasto < c[0])[1];
  if (st.inv <= 1e-6) return RAMPS.cov.cls[0][1];
  return RAMPS.cov.cls.slice(1).find(c => st.cov < c[0])[1];
}
const valueOf = (e, st) => (App.metric === 'unid' ? String(e.total) : App.metric === 'abasto' ? `${Math.floor(st.abasto * 1000) / 10}` : f1(st.cov));
const isDark = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) < 110; };

function renderLegend() {
  const R = RAMPS[App.metric];
  $('#legend').innerHTML = `<span><b style="color:var(--text);font-weight:600">${R.n}</b></span>${R.cls.map(c => `<span><i class="sw" style="background:${c[1]}"></i>${c[2]}</span>`).join('')}
    <span class="nx-lg-sep"></span><span><i class="sw" style="background:#e6edf3"></i>Tráiler a tiempo</span><span><i class="sw" style="background:#fb923c"></i>Tarde</span><span><i class="sw" style="background:#f87171"></i>Detenido</span>
    <span class="nx-lg-sep"></span>${LEVEL.map(l => `<span><i class="sw" style="background:${l.c};border-radius:50%"></i>${l.n}</span>`).join('')}`;
}

// ------------------------------------------------------------------ simulación
function run() {
  App.S = simulate(App.data, App.scn, App.pol);
  App.view?.setSim(App.S);
  $('#scn-desc').innerHTML = `<b>${esc(SCENARIOS[App.scn].nombre)}.</b> ${esc(SCENARIOS[App.scn].desc)} Si no alcanza: <b>${esc(POLICIES[App.pol].nombre.toLowerCase())}</b>, ${esc(POLICIES[App.pol].desc)}.`;
  App.lastH = -1; refresh(true); markCompare();
}
function setSeg(sel, attr, val) { document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('active', b.dataset[attr] === String(val))); }
$('#scn').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.scn = b.dataset.s; store.set('scn', App.scn); setSeg('#scn', 's', App.scn); run(); });
$('#pol').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.pol = b.dataset.p; store.set('pol', App.pol); setSeg('#pol', 'p', App.pol); run(); });
$('#metric').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.metric = b.dataset.m; store.set('metric', App.metric); setSeg('#metric', 'm', App.metric); renderLegend(); refresh(true); });
$('#btn-flows').addEventListener('click', e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); App.view?.setFlows(on); });
$('#btn-units').addEventListener('click', e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); App.view?.setAllUnits(on); });
$('#btn-home').addEventListener('click', () => select(null));

// ------------------------------------------------------------------ reloj
const playIcon = () => {
  $('#btn-play').innerHTML = App.playing ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  $('#btn-play').setAttribute('aria-label', App.playing ? 'Pausar' : 'Reproducir');
  $('#sim-status').classList.toggle('paused', !App.playing); $('#sim-status').textContent = App.playing ? '30 días · simulado' : 'En pausa';
};
$('#btn-play').addEventListener('click', () => { App.playing = !App.playing; if (App.playing && App.t >= H - 1) App.t = 0; playIcon(); });
document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => { App.speed = +b.dataset.speed; store.set('speed', App.speed); setSeg('.speed', 'speed', App.speed); }));
$('#t-range').addEventListener('input', e => { App.t = +e.target.value; refresh(true); });

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (App.playing && App.S) { App.t += dt * App.speed; if (App.t >= H - 0.01) { App.t = H - 0.01; App.playing = false; playIcon(); } }
  if (App.view && App.S) { App.view.setTime(App.t); App.view.frame(dt, App.playing); placeCenadi(); }
  if (Math.floor(App.t) !== App.lastH && now - App.lastUi > 250) { App.lastUi = now; refresh(); }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ refresco
function refresh(force = false) {
  if (!App.S) return;
  const h = Math.floor(App.t);
  if (h === App.lastH && !force) return;
  const dayChanged = dayOf(h) !== dayOf(App.lastH) || force;
  App.lastH = h;
  $('#clock').textContent = fmtT(App.t);
  $('#t-label').textContent = `${dayOf(App.t)} · ${fmtT(App.t)}`;
  if (document.activeElement !== $('#t-range')) $('#t-range').value = h;
  App.st = Object.fromEntries(App.S.E.map(e => [e.cve, stateAt(App.S, e, App.t)]));
  App.view?.setColors(Object.fromEntries(App.S.E.map(e => [e.cve, colorOf(e, App.st[e.cve])])));
  renderKpis(); renderFicha(); renderTiles(); renderFeed();
  if (dayChanged) { renderLoad(); renderRank(); }
}

// ------------------------------------------------------------------ indicadores nacionales
function renderKpis() {
  const m = summaryAt(App.S, App.t), P = App.S.P;
  const k = (n, v, u, s, sem) => `<div class="kpi ${sem || ''}"><span>${n}</span><b>${v}${u ? `<i>${u}</i>` : ''}</b><small><i class="dot"></i>${s}</small></div>`;
  $('#kpis').style.setProperty('--kc', 8);
  $('#kpis').innerHTML = [
    k('Abasto nacional acumulado', pct(m.abasto), '', 'demanda surtida por los almacenes', m.abasto >= 0.999 ? 'ok' : m.abasto >= 0.98 ? 'warn' : 'crit'),
    k('Cobertura nacional', f1(m.cov), 'días', 'existencia ÷ consumo de 7 días', m.cov >= P.riesgo ? 'ok' : 'warn'),
    k('Estados en riesgo', m.risk, `de 32`, `menos de ${P.riesgo} días de cobertura`, m.risk ? 'warn' : 'ok'),
    k('Estados sin abasto', m.out, '', `${nf.format(m.outH)} horas-estado acumuladas`, m.out ? 'crit' : m.outH ? 'warn' : 'ok'),
    k('Tráileres en ruta', m.trucks, '', `${nf.format(m.pallets)} tarimas en camino`),
    k('Entregas a tiempo', pct(m.onTime, 0), '', `${m.late} tarde de ${m.arrived} entregadas`, m.onTime >= 0.97 ? 'ok' : m.onTime >= 0.9 ? 'warn' : 'crit'),
    k('Carga del CENADI hoy', nf.format(m.today.ship), `/ ${P.cap}`, m.today.req > m.today.ship + 1 ? `pidieron ${nf.format(m.today.req)} tarimas` : 'tarimas embarcadas', m.today.req > m.today.ship + 1 ? 'warn' : 'ok'),
    k('Flete acumulado', money(m.costo), '', `${nf.format(Math.round(m.km))} km de tráiler`),
  ].join('');
}

// ------------------------------------------------------------------ ficha del estado
function sparkSvg(e, t) {
  const W = 320, Hh = 86, padL = 22, padB = 14, c = e.covDay;
  const max = Math.max(10, ...c) * 1.05;
  const X = d => padL + (W - padL - 4) * d / DAYS, Y = v => (Hh - padB) - (Hh - padB - 4) * Math.min(v, max) / max;
  const pts = Array.from(c, (v, d) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const nowX = X(Math.min(DAYS, t / 24));
  const rk = Y(App.S.P.riesgo);
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Cobertura en días durante 30 días">
    <polygon class="ar" points="${X(0)},${Y(0)} ${pts} ${X(DAYS)},${Y(0)}"/><polyline class="ln" points="${pts}"/>
    <line class="rk" x1="${padL}" x2="${W - 4}" y1="${rk}" y2="${rk}"/><text x="2" y="${rk + 3}">${App.S.P.riesgo} d</text>
    <text x="2" y="${Y(max * 0.95) + 6}">${Math.round(max)}</text>
    <line class="nw" x1="${nowX}" x2="${nowX}" y1="2" y2="${Hh - padB}"/>
    <text x="${padL}" y="${Hh - 2}">día 0</text><text x="${W - 4}" y="${Hh - 2}" text-anchor="end">día 30</text></svg>`;
}
function renderFicha() {
  const box = $('#ficha');
  if (!App.sel) {
    const ranked = App.S.E.map(e => ({ e, st: App.st[e.cve] })).sort((a, b) => a.st.cov - b.st.cov).slice(0, 6);
    const tot = [0, 1, 2].map(i => App.data.estados.reduce((a, e) => a + e.niveles[i], 0)), T = tot.reduce((a, b) => a + b, 0);
    box.innerHTML = `<header><div><span class="eyebrow">Red nacional</span><h2>CENADI → 32 estados</h2><p class="sub">Toca un estado en el mapa, en el mosaico o en la tabla para ver su ficha.</p></div></header>
      <h3>Unidades ISSSTE por nivel de atención</h3>${levelRows(tot, T, Object.fromEntries(Object.keys(TIPO).map(k => [k, App.data.estados.reduce((a, e) => a + e.tipos[k], 0)])))}
      <h3>Menor cobertura ahora</h3><div class="fx-list">${ranked.map(({ e, st }) => `<button class="fx-item" data-cve="${e.cve}"><i style="background:${SEMC[st.sem]}"></i><b>${esc(e.nombre)}</b><em>${st.inv <= 1e-6 ? 'sin abasto' : `${f1(st.cov)} días`}</em></button>`).join('')}</div>`;
    return;
  }
  const e = App.S.E.find(x => x.cve === App.sel), st = App.st[e.cve];
  const T = e.total;
  const hosp = App.data.unidades.filter(u => u.cve === e.cve && u.nivel > 1).sort((a, b) => b.nivel - a.nivel || a.nombre.localeCompare(b.nombre)).slice(0, 8);
  const tr = st.transit[0];
  const trTxt = st.transitPal ? `${nf.format(st.transitPal)} tarimas · ${st.transitTrucks} tráiler${st.transitTrucks > 1 ? 'es' : ''}<small class="${tr.wait && App.t >= tr.dep + tr.holdU * tr.T ? 'stop' : tr.late ? 'late' : ''}">llega ${fmtT(tr.arr)}${tr.wait ? ` · ${tr.motivo}` : ''}${tr.late ? ` · ${Math.round(tr.arr - tr.prom)} h tarde` : ''}</small>` : 'nada en camino';
  const nd = st.nextDep;
  const la = st.lastArr;
  box.innerHTML = `<header><div><span class="eyebrow">Región ${esc(e.region)} · ${esc(e.hr || '')}</span><h2>${esc(e.nombre)}</h2><p class="sub">${nf.format(e.km)} km del CENADI · ${e.horas} h de camino · sale ${FREQ_TXT(e.freq)}</p></div><button class="fx-x" id="fx-close" aria-label="Cerrar">×</button></header>
    <div class="chips"><span class="chip ${st.sem}">${st.inv <= 1e-6 ? 'Sin abasto' : `Cobertura ${f1(st.cov)} días`}</span><span class="chip ${st.abasto >= 0.999 ? 'ok' : st.abasto >= 0.98 ? 'warn' : 'crit'}">Abasto ${pct(st.abasto)}</span>${st.transitPal ? `<span class="chip info">${st.transitTrucks} en camino</span>` : ''}</div>
    <h3>Unidades por nivel de atención · ${T}</h3>${levelRows(e.niveles, T, e.tipos)}
    <h3>Abasto del almacén estatal</h3>
    <div class="fx-stats">
      <div class="${st.sem}"><span>Existencia</span><b>${nf.format(Math.round(st.inv))}<i>tar</i></b></div>
      <div><span>Consumo diario</span><b>${f1(st.f)}<i>tar</i></b></div>
      <div class="${st.outH ? 'crit' : ''}"><span>Horas sin abasto</span><b>${st.outH}</b></div>
      <div><span>Tarimas por semana</span><b>${e.tarimasSemana}</b></div>
      <div><span>Embarques en 30 días</span><b>${e.ships.length}</b></div>
      <div><span>Entregas tarde</span><b>${e.ships.filter(s => s.late && s.arr <= App.t).length}</b></div>
    </div>
    <div class="fx-rows" style="margin-top:8px">
      <div class="r"><span>En camino</span><em>${trTxt}</em></div>
      <div class="r"><span>Siguiente salida</span><em>${nd ? `${fmtT(nd.dep)}<small>${nf.format(nd.pallets)} tarimas${nd.pallets < nd.req ? ` de ${nd.req} pedidas` : ''}</small>` : 'fuera del horizonte'}</em></div>
      <div class="r"><span>Última entrega</span><em>${la ? `${fmtT(la.arr)}<small class="${la.late ? 'late' : ''}">${nf.format(la.pallets)} tarimas · ${la.late ? `${Math.round(la.arr - la.prom)} h tarde` : 'a tiempo'}</small>` : 'todavía no hay'}</em></div>
    </div>
    <h3>Cobertura en días · 30 días</h3><div class="fx-spark">${sparkSvg(e, App.t)}</div>
    <h3>Hospitales y clínicas de 2º y 3er nivel</h3>
    ${hosp.length ? `<ul class="fx-hosp">${hosp.map(u => `<li><span class="tp" style="background:${LEVEL[u.nivel - 1].c}22;color:${LEVEL[u.nivel - 1].c}">${u.tipo}</span><span>${esc(u.nombre)}<small>${esc(u.mun)} · ${u.clues}</small></span></li>`).join('')}</ul>` : '<p class="muted" style="font-size:12.5px">Sólo unidades de primer nivel.</p>'}`;
}
function levelRows(niv, T, tipos) {
  return LEVEL.map((l, i) => {
    const sub = l.tipos.filter(t => tipos[t]).map(t => `${t} ${tipos[t]}`).join(' · ') || '—';
    return `<div class="lvl"><b><i class="lv" style="background:${l.c}"></i>${l.n}</b><span class="bar"><i style="width:${T ? (100 * niv[i] / T).toFixed(1) : 0}%;background:${l.c}"></i></span><span class="n">${niv[i]}</span><small>${sub}</small></div>`;
  }).join('');
}
$('#ficha').addEventListener('click', e => {
  if (e.target.closest('#fx-close')) return select(null);
  const b = e.target.closest('[data-cve]'); if (b) select(b.dataset.cve);
});

function select(cve, fly = true) {
  App.sel = cve || null;
  App.view?.select(App.sel, fly);
  const u = new URL(location.href); if (App.sel) u.searchParams.set('e', App.sel); else u.searchParams.delete('e'); history.replaceState(null, '', u);
  renderFicha(); renderTiles(); renderRank(); renderFeed();
  if (App.sel && matchMedia('(max-width: 1180px)').matches && fly === 'scroll') $('#c3d').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------------------------------------------------------------------ mosaico
function renderTiles() {
  const cells = Array.from({ length: 50 }, () => null);
  for (const e of App.S.E) cells[e.grid[0] * 10 + e.grid[1]] = e;
  $('#tiles').innerHTML = cells.map(e => {
    if (!e) return '<span class="tile blank"></span>';
    const st = App.st[e.cve], c = colorOf(e, st);
    const cls = ['tile', isDark(c) ? 'dark' : '', App.sel === e.cve ? 'sel' : App.sel ? 'dim' : ''].join(' ');
    return `<button class="${cls}" style="background:${c}" data-cve="${e.cve}" title="${esc(e.nombre)}"><b>${e.abbr}</b><span>${App.metric === 'cov' && st.inv <= 1e-6 ? '0' : valueOf(e, st)}</span></button>`;
  }).join('');
  $('#tiles-sub').textContent = `${RAMPS[App.metric].n.toLowerCase()} · cada estado pesa igual · mismo color que el mapa`;
}
$('#tiles').addEventListener('click', e => { const b = e.target.closest('[data-cve]'); if (b) select(App.sel === b.dataset.cve ? null : b.dataset.cve, 'scroll'); });

// ------------------------------------------------------------------ carga del CENADI
function renderLoad() {
  const D = App.S.daily, P = App.S.P, W = 640, Hh = 210, pl = 34, pb = 40, pt = 8;
  const max = Math.max(P.cap * 1.15, ...D.map(d => d.req));
  const bw = (W - pl - 6) / DAYS, X = d => pl + bw * d, Y = v => pt + (Hh - pb - pt) * (1 - v / max);
  const risk = Array.from({ length: DAYS }, (_, d) => App.S.E.filter(e => e.covDay[d + 1] < P.riesgo).length);
  const today = dayOf(App.t);
  let g = '';
  for (const v of [0, 100, 200, 300, 400].filter(v => v <= max)) g += `<line class="grid" x1="${pl}" x2="${W - 6}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${pl - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`;
  g += `<rect class="now" x="${X(today)}" y="${pt}" width="${bw}" height="${Hh - pb - pt}"/>`;
  D.forEach((d, i) => {
    if (!d) return;
    const x = X(i) + bw * 0.15, w = bw * 0.7;
    if (d.req > d.ship + 1) g += `<rect class="bar-r" x="${x}" y="${Y(d.req)}" width="${w}" height="${Y(0) - Y(d.req)}" rx="2"/>`;
    g += `<rect class="bar-s" x="${x}" y="${Y(d.ship)}" width="${w}" height="${Math.max(0, Y(0) - Y(d.ship))}" rx="2" opacity="${i <= today ? 1 : 0.35}"><title>Día ${i}: ${d.ship} embarcadas de ${d.req} pedidas</title></rect>`;
    if (i % 3 === 0) g += `<text class="ax" x="${X(i) + bw / 2}" y="${Hh - pb + 13}" text-anchor="middle">${i}</text>`;
    const r = risk[i];
    g += `<text class="risk" x="${X(i) + bw / 2}" y="${Hh - 6}" text-anchor="middle" fill="${r ? (r > 4 ? '#f87171' : '#fbbf24') : '#334155'}">${r}</text>`;
  });
  g += `<line class="cap" x1="${pl}" x2="${W - 6}" y1="${Y(P.cap)}" y2="${Y(P.cap)}"/><text class="ax" x="${W - 8}" y="${Y(P.cap) - 4}" text-anchor="end" fill="#f87171">capacidad ${P.cap}</text>`;
  g += `<text class="ax" x="${pl}" y="${Hh - 18}" opacity=".8">día</text>`;
  $('#load-chart').innerHTML = `<svg viewBox="0 0 ${W} ${Hh}">${g}</svg>`;
  const cut = D.filter(d => d && d.req > d.ship + 1).length;
  $('#load-note').textContent = `Renglón de abajo: estados con menos de ${P.riesgo} días de cobertura al cierre de cada día. ${cut ? `En ${cut} día${cut > 1 ? 's' : ''} lo pedido superó lo que el CENADI pudo embarcar.` : 'Lo pedido siempre cupo en la capacidad del CENADI.'}`;
}

// ------------------------------------------------------------------ tabla de estados
const COLS = [
  { k: 'nombre', n: 'Estado', v: (e) => e.nombre },
  { k: 'region', n: 'Región', v: e => e.region, opt: true },
  { k: 'total', n: 'Unidades N1 · N2 · N3', v: e => e.total },
  { k: 'cov', n: 'Cobertura (días)', v: (e, st) => (st.inv <= 1e-6 ? -1 : st.cov) },
  { k: 'abasto', n: 'Abasto', v: (e, st) => st.abasto },
  { k: 'outH', n: 'Horas sin abasto', v: (e, st) => st.outH },
  { k: 'transit', n: 'En camino (tar)', v: (e, st) => st.transitPal },
  { k: 'tps', n: 'Tarimas por semana', v: e => e.tarimasSemana, opt: true },
  { k: 'km', n: 'Km', v: e => e.km, opt: true },
];
function rows() {
  const c = COLS.find(x => x.k === App.sort.k);
  return App.S.E.map(e => ({ e, st: App.st[e.cve] })).sort((a, b) => {
    const va = c.v(a.e, a.st), vb = c.v(b.e, b.st);
    return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * App.sort.dir;
  });
}
function renderRank() {
  const R = rows();
  const th = c => `<th class="sort ${c.k === App.sort.k ? 'on' : ''} ${['nombre', 'region'].includes(c.k) ? '' : 'n'} ${c.opt ? 'col-opt2' : ''}" data-k="${c.k}">${c.n}${c.k === App.sort.k ? (App.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  $('#rank').innerHTML = `<table><thead><tr>${COLS.map(th).join('')}</tr></thead><tbody>${R.map(({ e, st }) => `
    <tr data-cve="${e.cve}" class="${App.sel === e.cve ? 'sel' : ''}">
      <td class="st"><i class="sem" style="background:${SEMC[st.sem]}"></i><b>${esc(e.nombre)}</b><small>${e.abbr}</small></td>
      <td class="col-opt2">${e.region}</td>
      <td class="n"><span class="lv3"><b>${e.niveles[0]}</b> · <b>${e.niveles[1]}</b> · <b>${e.niveles[2]}</b></span></td>
      <td class="n"><span class="cv">${st.inv <= 1e-6 ? '<b style="color:var(--crit)">0</b>' : f1(st.cov)}<span class="bar"><i style="width:${Math.min(100, st.cov / 12 * 100)}%;background:${SEMC[st.sem]}"></i></span></span></td>
      <td class="n">${pct(st.abasto)}</td>
      <td class="n" style="${st.outH ? 'color:var(--crit);font-weight:650' : ''}">${st.outH}</td>
      <td class="n">${st.transitPal || '—'}</td>
      <td class="n col-opt2">${e.tarimasSemana}</td>
      <td class="n col-opt2">${nf.format(e.km)}</td>
    </tr>`).join('')}</tbody></table>`;
}
$('#rank').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (th) { const k = th.dataset.k; App.sort = { k, dir: App.sort.k === k ? -App.sort.dir : (['nombre', 'region'].includes(k) ? 1 : k === 'cov' ? 1 : -1) }; renderRank(); return; }
  const tr = e.target.closest('tr[data-cve]'); if (tr) select(tr.dataset.cve, 'scroll');
});
$('#rank-csv').addEventListener('click', () => {
  const head = ['clave', 'estado', 'region', 'unidades_n1', 'unidades_n2', 'unidades_n3', 'cobertura_dias', 'abasto_pct', 'horas_sin_abasto', 'en_camino_tarimas', 'tarimas_semana', 'km', 'horas_transito', 'salidas'];
  const lines = rows().map(({ e, st }) => [e.cve, e.nombre, e.region, ...e.niveles, st.cov.toFixed(2), (st.abasto * 100).toFixed(2), st.outH, st.transitPal, e.tarimasSemana, e.km, e.horas, FREQ_TXT(e.freq)].map(v => /[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nacional_${App.scn}_${App.pol}_dia${dayOf(App.t)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ------------------------------------------------------------------ bitácora
const EVC = { dep: '#2dd4bf', arr: '#34d399', late: '#fb923c', hold: '#f87171', out: '#ef4444', back: '#60a5fa', cut: '#fbbf24' };
function renderFeed() {
  let ev = App.S.events.filter(x => x.t <= App.t);
  if (App.feedF === 'alert') ev = ev.filter(x => ['late', 'hold', 'out', 'cut'].includes(x.k));
  if (App.feedF === 'sel') ev = App.sel ? ev.filter(x => x.cve === App.sel) : [];
  const list = ev.slice(-60).reverse();
  $('#feed-sub').textContent = App.feedF === 'sel' && !App.sel ? 'elige un estado' : `${ev.length} evento${ev.length === 1 ? '' : 's'} hasta ${fmtT(App.t)}`;
  $('#feed').innerHTML = list.length ? list.map(x => `<button class="nx-ev" data-cve="${x.cve}"><time>${fmtT(x.t)}</time><i style="background:${EVC[x.k]}"></i><b>${esc(x.txt)}</b><small>${esc(x.det)}</small></button>`).join('') : '<p class="empty">Sin eventos todavía.</p>';
}
$('#feed-f').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.feedF = b.dataset.f; setSeg('#feed-f', 'f', App.feedF); renderFeed(); });
$('#feed').addEventListener('click', e => { const b = e.target.closest('[data-cve]'); if (b) select(b.dataset.cve, 'scroll'); });

// ------------------------------------------------------------------ comparación
function buildCompare() {
  const R = [];
  for (const s of Object.keys(SCENARIOS)) for (const p of Object.keys(POLICIES)) {
    const S = simulate(App.data, s, p), m = S.summary;
    R.push({ s, p, abasto: m.abasto, outH: m.outH, est: S.E.filter(e => e.outH[H] > 0).length, onTime: m.onTime, costo: m.costo });
  }
  App.cmp = R; renderCompare();
}
function renderCompare() {
  if (!App.cmp) return;
  const best = (k, lowGood) => { const v = App.cmp.map(r => r[k]); return lowGood ? Math.min(...v) : Math.max(...v); };
  const worst = (k, lowGood) => { const v = App.cmp.map(r => r[k]); return lowGood ? Math.max(...v) : Math.min(...v); };
  const cell = (r, k, txt, low) => `<td class="n ${r[k] === best(k, low) ? 'best' : r[k] === worst(k, low) ? 'worst' : ''}">${txt}</td>`;
  $('#compare').innerHTML = `<table class="cmp"><thead><tr><th>Escenario</th><th>Si no alcanza</th><th class="n">Abasto</th><th class="n">Horas-estado sin abasto</th><th class="n">Estados con desabasto</th><th class="n">A tiempo</th><th class="n col-opt2">Flete</th></tr></thead><tbody>${App.cmp.map(r => `
    <tr data-s="${r.s}" data-p="${r.p}" class="${r.s === App.scn && r.p === App.pol ? 'cur' : ''}"><td>${SCENARIOS[r.s].nombre}</td><td>${POLICIES[r.p].nombre}</td>
    ${cell(r, 'abasto', pct(r.abasto, 2))}${cell(r, 'outH', nf.format(r.outH), true)}${cell(r, 'est', r.est, true)}${cell(r, 'onTime', pct(r.onTime, 0))}<td class="n col-opt2">${money(r.costo)}</td></tr>`).join('')}</tbody></table>`;
}
function markCompare() { document.querySelectorAll('#compare tr[data-s]').forEach(tr => tr.classList.toggle('cur', tr.dataset.s === App.scn && tr.dataset.p === App.pol)); }
$('#compare').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-s]'); if (!tr) return;
  App.scn = tr.dataset.s; App.pol = tr.dataset.p; store.set('scn', App.scn); store.set('pol', App.pol);
  setSeg('#scn', 's', App.scn); setSeg('#pol', 'p', App.pol); run();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ------------------------------------------------------------------ 3D: selección, tooltip, etiqueta del CENADI
const tip = $('#tip');
function showTip(html, ev) {
  if (!html) { tip.hidden = true; return; }
  tip.innerHTML = html; tip.hidden = false;
  const x = Math.min(innerWidth - 270, ev.clientX + 14), y = Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY + 14);
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
function hitHtml(h) {
  if (!h) return '';
  if (h.type === 'state') { const e = App.S.E.find(x => x.cve === h.cve), st = App.st[e.cve]; return `<b>${esc(e.nombre)}</b><div class="r">Cobertura<em>${st.inv <= 1e-6 ? 'sin abasto' : `${f1(st.cov)} días`}</em></div><div class="r">Abasto<em>${pct(st.abasto)}</em></div><div class="r">Unidades<em>${e.total}</em></div>`; }
  if (h.type === 'unit') { const u = App.data.unidades[h.i]; return `<b>${esc(u.nombre)}</b><div class="r">Tipo<em>${esc(TIPO[u.tipo])}</em></div><div class="r">Nivel<em>${LEVEL[u.nivel - 1].n}</em></div><div class="r">Municipio<em>${esc(u.mun)}</em></div><div class="r">CLUES<em>${u.clues}</em></div>`; }
  if (h.type === 'ship' && h.s) { const s = h.s, e = App.S.E[s.i]; return `<b>Embarque a ${esc(e.nombre)}</b><div class="r">Tarimas<em>${s.pallets} en ${s.trucks} tráiler${s.trucks > 1 ? 'es' : ''}</em></div><div class="r">Salió<em>${fmtT(s.dep)}</em></div><div class="r">Llega<em>${fmtT(s.arr)}</em></div>${s.wait ? `<div class="r">Incidencia<em>${esc(s.motivo)}</em></div>` : ''}${s.late ? `<div class="r">Atraso<em>${Math.round(s.arr - s.prom)} h</em></div>` : ''}`; }
  return '';
}
let cenadiTag = null;
function placeCenadi() {
  if (!cenadiTag) return;
  const [x, y, ok] = App.view.project(0, 0, 80);
  cenadiTag.style.display = ok ? '' : 'none';
  cenadiTag.style.left = `${x}px`; cenadiTag.style.top = `${y}px`;
}

// ------------------------------------------------------------------ arranque
async function init() {
  setSeg('#scn', 's', App.scn); setSeg('#pol', 'p', App.pol); setSeg('#metric', 'm', App.metric); setSeg('.speed', 'speed', App.speed); playIcon(); renderLegend();
  [App.data, App.outline] = await Promise.all([fetch('assets/estados_issste.json').then(r => r.json()), fetch('assets/estados_mx.json').then(r => r.json())]);
  if (App.sel && !App.data.estados.some(e => e.cve === App.sel)) App.sel = null;
  run();
  $('#loading').remove();
  requestAnimationFrame(loop);
  setTimeout(buildCompare, 60);
  try {
    const box = $('#c3d');
    const v = new Nacional3D(box, App.data, App.outline);
    await v.load();
    box.querySelector('.u3d-loading')?.remove();
    App.view = v; v.setSim(App.S); v.setTime(App.t);
    v.setColors(Object.fromEntries(App.S.E.map(e => [e.cve, colorOf(e, App.st[e.cve])])));
    v.onPick = (h) => {
      if (!h) { if (App.sel) select(null); return; }
      if (h.type === 'state') select(App.sel === h.cve ? App.sel : h.cve);
      else if (h.type === 'ship' && h.s) select(h.s.cve);
      if (matchMedia('(pointer: coarse)').matches && h.type !== 'state') { const r = box.getBoundingClientRect(); showTip(hitHtml(h), { clientX: r.left + 20, clientY: r.top + 20 }); setTimeout(() => (tip.hidden = true), 3500); }
    };
    v.onHover = (h, ev) => showTip(hitHtml(h), ev);
    cenadiTag = document.createElement('div'); cenadiTag.className = 'nx-cenadi'; cenadiTag.textContent = 'CENADI'; box.appendChild(cenadiTag);
    const hint = document.createElement('div'); hint.className = 'nx-hint'; hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Un dedo gira · dos dedos acercan y mueven' : 'Arrastra para girar · rueda para acercar · clic derecho para mover'; box.appendChild(hint);
    setTimeout(() => hint.remove(), 7000);
    if (App.sel) select(App.sel);
  } catch (err) {
    console.error(err);
    $('#c3d').innerHTML = `<div class="u3d-loading">No se pudo cargar el mapa 3D (${esc(err.message || err)}). El resto de la página funciona.</div>`;
  }
}
init();

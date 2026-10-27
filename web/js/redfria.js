// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  redfria.js · Página "Red fría · CENADI a la unidad"
//  Une la simulación térmica (redfria-sim.js), la cadena en 3D
//  (redfria3d.js), la ficha de la unidad, la curva de 30 días, el mapa de
//  equipos, la bitácora, la tabla por estado y la comparación de inversiones.
//  >>> API: sustituir la serie simulada de cada equipo por la descarga del
//  registrador (CSV de 30 días) o la API de telemetría, con la misma forma.
// =====================================================================
import { simulate, summaryAt, eqState, CONTEXTS, LEVERS, BASE, PRODUCTS, EQNAME, H, DAYS, fmtT } from './redfria-sim.js';
import { RedFria3D, tempColor, KEYS } from './redfria3d.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('es-MX');
const f1 = x => (Math.round(x * 10) / 10).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (x, d = 1) => `${(x * 100).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
const money = x => (Math.abs(x) >= 1e6 ? `$${f1(x / 1e6)} M` : Math.abs(x) >= 1e3 ? `$${nf.format(Math.round(x / 1e3))} mil` : `$${nf.format(Math.round(x))}`);
const tC = T => `${T >= 0 ? '' : '−'}${f1(Math.abs(T))} °C`;
const store = { get(k, d) { try { const v = localStorage.getItem('redfria.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('redfria.' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } } };
const qs = new URLSearchParams(location.search);
const ST = { ok: '#2dd4bf', exc: '#fbbf24', frio: '#60a5fa', baja: '#f87171', oculto: '#e879f9' };
const ST_TXT = { ok: 'Sin incidentes', exc: 'Excursión sin daño', frio: 'Congeló', baja: 'Baja con acta', oculto: 'Dañado sin detectar' };
const LEVEL = ['1er nivel', '2º nivel', '3er nivel'];

const App = {
  data: null, outline: null, S: null, view: null, lv: { ...BASE, ...store.get('lv', {}) },
  t: Number(qs.get('t') || 0), playing: true, speed: store.get('speed', 6), sel: qs.get('u') || store.get('sel', null),
  station: null, feedF: 'all', lastH: -1, lastUi: 0, cmp: null, cmpFor: null, sort: { k: 'perd', dir: -1 },
};
for (const k of Object.keys(BASE)) if (qs.get(k)) App.lv[k] = qs.get(k);

// ------------------------------------------------------------------ controles
function setSeg(sel, val, attr = 'v') { document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('active', b.dataset[attr] === String(val))); }
for (const k of ['ctx', 'mon', 'ref', 'pla', 'pack']) {
  $('#' + k).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    App.lv[k] = b.dataset.v; store.set('lv', App.lv); setSeg('#' + k, App.lv[k]);
    rerun();
  });
}
$('#v3d').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setSeg('#v3d', b.dataset.v); App.station = b.dataset.v === 'general' ? null : b.dataset.v; App.view?.select(App.station); renderFicha(); });
const playIcon = () => {
  $('#btn-play').innerHTML = App.playing ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  $('#btn-play').setAttribute('aria-label', App.playing ? 'Pausar' : 'Reproducir');
  $('#sim-status').classList.toggle('paused', !App.playing); $('#sim-status').textContent = App.playing ? '30 días · simulado' : 'En pausa';
};
$('#btn-play').addEventListener('click', () => { App.playing = !App.playing; if (App.playing && App.t >= H - 1) App.t = 0; playIcon(); });
document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => { App.speed = +b.dataset.speed; store.set('speed', App.speed); setSeg('.speed', App.speed, 'speed'); }));
$('#t-range').addEventListener('input', e => { App.t = +e.target.value; refresh(true); });

// ------------------------------------------------------------------ simulación
function rerun() {
  $('#scn-desc').innerHTML = `<b>${esc(CONTEXTS[App.lv.ctx].nombre)}.</b> ${esc(CONTEXTS[App.lv.ctx].desc)} Monitoreo <b>${esc(LEVERS.mon.o[App.lv.mon].toLowerCase())}</b>, refrigerador del 1er nivel <b>${esc(LEVERS.ref.o[App.lv.ref].toLowerCase())}</b>, planta en <b>${esc(LEVERS.pla.o[App.lv.pla].toLowerCase())}</b>, refrigerantes <b>${esc(LEVERS.pack.o[App.lv.pack].toLowerCase())}</b>.`;
  const ld = document.createElement('div'); ld.className = 'loading'; ld.style.background = 'rgba(13,17,23,.6)'; ld.textContent = 'Recalculando 30 días…';
  document.body.appendChild(ld);
  setTimeout(() => {
    App.S = simulate(App.data, App.lv);
    ld.remove();
    indexEvents();
    if (!App.sel || !App.S.byId[App.sel]) App.sel = pickDefault();
    App.lastH = -1; buildMap(); refresh(true);
    if (App.cmpFor !== App.lv.ctx) buildCompare(); else markCompare();
  }, 30);
}
function pickDefault() {
  const L = App.S.losses.filter(l => !l.det && l.trip);
  if (L.length) return L[0].trip.to;
  const u = App.S.nodes.find(n => n.kind === 'unidad' && n.R.eps.some(e => e.froze));
  return u ? u.id : App.S.nodes.find(n => n.kind === 'unidad').id;
}
function indexEvents() {
  const S = App.S, ev = [];
  for (const n of S.nodes) for (const e of n.R.eps) ev.push({ t: e.t0, kind: 'eq', n, e });
  for (const tr of S.trips) if (tr.loss || tr.fail != null || tr.peak > 8) ev.push({ t: tr.dep + tr.dur, kind: 'trip', tr });
  ev.sort((a, b) => a.t - b.t);
  S.events = ev;
  S.unitsOf = {};
  for (const n of S.nodes) if (n.kind === 'unidad') (S.unitsOf[n.cve] ||= []).push(n);
}

// ------------------------------------------------------------------ reloj
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (App.playing && App.S) { App.t += dt * App.speed; if (App.t >= H - 0.01) { App.t = H - 0.01; App.playing = false; playIcon(); } }
  if (App.view && App.S) App.view.frame(dt);
  if (Math.floor(App.t * 4) !== App.lastQ && now - App.lastUi > 200) { App.lastUi = now; App.lastQ = Math.floor(App.t * 4); refresh(); }
  requestAnimationFrame(loop);
}

function refresh(force = false) {
  if (!App.S) return;
  const h = Math.floor(App.t);
  $('#clock').textContent = fmtT(App.t);
  $('#t-label').textContent = `${Math.floor(App.t / 24)} · ${fmtT(App.t)}`;
  if (document.activeElement !== $('#t-range')) $('#t-range').value = Math.min(719, h);
  const chain = chainAt(App.sel, App.t);
  App.view?.setState(chain);
  if (h === App.lastH && !force) { renderFichaLive(chain); return; }
  const dayChanged = Math.floor(h / 24) !== Math.floor(App.lastH / 24) || force;
  App.lastH = h;
  renderKpis(); renderFicha(chain); renderCurve(); colorMap(); renderFeed();
  if (dayChanged) renderRank();
}

// ------------------------------------------------------------------ cadena de la unidad elegida
function tripAt(list, t) {
  const cur = list.find(x => x.dep <= t && t < x.dep + x.dur);
  if (cur) { const i = Math.min(cur.prof.length - 1, Math.max(0, Math.floor((t - cur.dep) / 0.25))); return { tr: cur, T: cur.prof[i], active: true }; }
  const prev = [...list].reverse().find(x => x.dep + x.dur <= t);
  return prev ? { tr: prev, T: prev.arrive, active: false } : { tr: null, T: null, active: false };
}
function prodOf(loss, t) { return loss && loss.t <= t ? (loss.det ? 'baja' : 'oculto') : null; }
function chainAt(id, t) {
  const S = App.S, u = S.byId[id]; if (!u) return {};
  const cen = S.byId.CENADI, est = S.byId['EST' + u.cve];
  const reefers = S.trips.filter(x => x.kind === 'reefer' && x.to === est.id);
  const cajas = S.trips.filter(x => x.kind === 'caja' && x.to === u.id);
  const rf = tripAt(reefers, t), cj = tripAt(cajas, t);
  const eqs = n => { const s = eqState(n, t); return { T: s.T, st: s.st, prod: s.st === 'baja' ? 'baja' : s.st === 'oculto' ? 'oculto' : s.st === 'frio' ? 'frio' : 'ok' }; };
  const c = eqs(cen), e = eqs(est), un = eqs(u);
  const tripTxt = (x) => x.tr ? (x.active ? `en camino · ${tC(x.T)}` : `llegó ${tC(x.T)}`) : 'sin viaje';
  return {
    cenadi: { T: c.T, prod: c.prod, txt: tC(c.T), st: c.st },
    reefer: { T: rf.T, active: rf.active, prod: prodOf(rf.tr?.loss, t) || (rf.tr?.froze ? 'frio' : 'ok'), txt: tripTxt(rf), tr: rf.tr },
    estatal: { T: e.T, prod: e.prod, txt: tC(e.T), st: e.st },
    caja: { T: cj.T, active: cj.active, prod: prodOf(cj.tr?.loss, t) || (cj.tr?.froze && cj.tr.dep + cj.tr.dur <= t ? 'frio' : 'ok'), txt: tripTxt(cj), tr: cj.tr },
    unidad: { T: un.T, prod: un.prod, txt: tC(un.T), st: un.st },
  };
}

// ------------------------------------------------------------------ indicadores
function renderKpis() {
  const S = App.S, m = summaryAt(S, App.t);
  const tripsFrz = S.trips.filter(x => x.froze && x.dep + x.dur <= App.t).length;
  const inv = S.invest, base = App.cmp?.find(r => r.key === 'base');
  const ahorro = base ? (base.summary.bajaMxn + base.summary.ocultoMxn) - (S.summary.bajaMxn + S.summary.ocultoMxn) : null;
  const k = (n, v, u, s, sem) => `<div class="kpi ${sem || ''}"><span>${n}</span><b>${v}${u ? `<i>${u}</i>` : ''}</b><small><i class="dot"></i>${s}</small></div>`;
  $('#kpis').style.setProperty('--kc', 8);
  $('#kpis').innerHTML = [
    k('Tiempo en rango, 1,066 equipos', pct(m.inRange), '', 'horas entre 2 y 8 °C', m.inRange >= 0.98 ? 'ok' : m.inRange >= 0.93 ? 'warn' : 'crit'),
    k('Excursiones', nf.format(m.eps), '', `${pct(m.detPct, 0)} detectadas`, m.detPct >= 0.85 ? 'ok' : m.detPct >= 0.6 ? 'warn' : 'crit'),
    k('Tiempo a la detección', m.det ? f1(m.detDelay) : '—', m.det ? 'h' : '', 'promedio de las detectadas', !m.det ? '' : m.detDelay <= 1 ? 'ok' : m.detDelay <= 6 ? 'warn' : 'crit'),
    k('Congelaciones', nf.format(m.froze + tripsFrz), '', `${m.froze} en equipo · ${tripsFrz} en caja`, m.froze + tripsFrz ? 'crit' : 'ok'),
    k('Dado de baja con acta', money(m.bajaMxn), '', `${nf.format(m.bajaQ)} piezas y dosis`, m.bajaMxn ? 'warn' : 'ok'),
    k('Dañado sin detectar', money(m.ocultoMxn), '', m.ocultoQ ? `${nf.format(m.ocultoQ)} piezas que se aplicarán` : 'nada oculto', m.ocultoQ ? 'crit' : 'ok'),
    k('Envíos fuera de rango', nf.format(m.tripsOut), `de ${nf.format(m.trips)}`, 'tráileres y cajas entregados', m.tripsOut / Math.max(1, m.trips) > 0.1 ? 'crit' : m.tripsOut ? 'warn' : 'ok'),
    k('Inversión de las palancas', money(inv.capex), '', inv.capex ? (ahorro > 0 ? `recupera en ${inv.capex / ahorro < 1 ? Math.max(1, Math.round(inv.capex / ahorro * 30)) + ' días' : f1(inv.capex / ahorro) + ' meses'}` : base ? 'no reduce la pérdida' : 'calculando el retorno…') : 'escenario base', inv.capex && ahorro > 0 ? 'ok' : ''),
  ].join('');
}

// ------------------------------------------------------------------ ficha de la unidad
const NAMES = { cenadi: 'Cámara del CENADI', reefer: 'Tráiler refrigerado', estatal: 'Almacén estatal', caja: 'Caja térmica', unidad: 'Refrigerador de la unidad' };
function renderFicha(chain = chainAt(App.sel, App.t)) {
  const S = App.S, u = S.byId[App.sel]; if (!u) return;
  const est = S.byId['EST' + u.cve], e = App.data.estados.find(x => x.cve === u.cve);
  const units = (S.unitsOf[u.cve] || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const s = eqState(u, App.t);
  const plant = u.R.hasPlant;
  // productos
  const losses = S.losses.filter(l => l.t <= App.t && (l.where === u.id || (l.trip && l.trip.to === u.id)));
  let heat = 0; for (const ep of u.R.eps) if (ep.t1 != null && ep.t1 <= App.t) heat += ep.heat;
  const rows = PRODUCTS.map((p, i) => {
    const q = u.stock[i]; if (!q) return '';
    const L = losses.flatMap(l => l.items.filter(x => x.p === p.id).map(x => ({ ...x, det: l.det, label: l.label, t: l.t })));
    const lost = L.reduce((a, x) => a + x.q, 0);
    const hid = L.filter(x => !x.det).reduce((a, x) => a + x.q, 0);
    const used = Math.min(1, heat / p.bud);
    const tag = hid ? '<span class="st-tag st-oculto">dañado sin detectar</span>' : lost ? '<span class="st-tag st-baja">baja</span>' : used > 0.5 ? '<span class="st-tag st-calor">calor</span>' : '<span class="st-tag st-ok">bien</span>';
    return `<tr><td>${esc(p.n)}${p.frz ? ' <small class="muted" title="se pierde si se congela">❄︎</small>' : ''}</td><td class="n">${nf.format(q)}</td><td class="n">${lost ? `<b style="color:var(--crit)">${nf.format(lost)}</b>` : '—'}</td><td class="n"><span class="bar"><i style="width:${(used * 100).toFixed(0)}%;background:${used > 0.8 ? 'var(--crit)' : used > 0.4 ? 'var(--warn)' : 'var(--ok)'}"></i></span></td><td>${tag}</td></tr>`;
  }).join('');
  const eps = u.R.eps.filter(x => x.t0 <= App.t).slice(-5).reverse();
  const tripsBad = S.trips.filter(x => x.kind === 'caja' && x.to === u.id && x.dep + x.dur <= App.t && (x.froze || x.peak > 8)).slice(-3).reverse();
  $('#ficha').innerHTML = `
    <div class="rf-pick">
      <select id="pick-edo" aria-label="Estado">${App.data.estados.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(x => `<option value="${x.cve}" ${x.cve === u.cve ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
      <select id="pick-u" aria-label="Unidad">${units.map(x => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
    </div>
    <span class="eyebrow">${esc(u.tipo)} · ${LEVEL[u.nivel - 1]} · ${esc(e.nombre)}</span>
    <h2>${esc(u.nombre)}</h2>
    <p class="sub">${esc(u.mun)} · CLUES ${esc(u.id)} · ${esc(EQNAME[u.eq])}${u.R.offset < -3 ? ' con el termostato desviado' : ''} · ${plant ? 'con planta de emergencia' : 'sin planta de emergencia'}</p>
    <div class="rf-chips"><span class="chip" style="color:${ST[s.st]};background:${ST[s.st]}22">${ST_TXT[s.st]}</span><span class="chip">${s.n} excursion${s.n === 1 ? '' : 'es'} del equipo</span></div>
    <h3>La cadena ahora</h3>
    <div class="rf-chain" id="rf-chain">${chainRows(chain)}</div>
    <h3>Productos en la unidad</h3>
    <div class="m-table"><table class="rf-prod"><thead><tr><th>Producto</th><th class="n">Existencia</th><th class="n">Perdido</th><th class="n">Calor gastado</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3>Incidentes recientes</h3>
    ${eps.length || tripsBad.length ? `<ul class="rf-eps">${[...eps.map(x => `<li><b>${x.froze ? 'Congelación' : x.peak > 8 ? `Calor hasta ${tC(x.peak)}` : `Frío hasta ${tC(x.low)}`}</b> en el refrigerador · ${esc(x.causa)}<small>${fmtT(x.t0)} a ${fmtT(x.t1 ?? H)} · ${x.det != null ? `detectada ${fmtT(x.det)} por ${esc(x.via)}` : 'no se detectó'}</small></li>`),
      ...tripsBad.map(x => `<li><b>Caja ${x.froze ? 'congelada' : `a ${tC(x.peak)}`}</b> en el reparto${x.delay ? ' con retraso' : ''}<small>salió ${fmtT(x.dep)} · ${f1(x.dur)} h · ${x.det != null ? `visto por ${esc(x.via)}` : 'llegó a ' + tC(x.arrive) + ' y nadie lo vio'}</small></li>`)].join('')}</ul>` : '<p class="muted" style="font-size:12.5px">Sin incidentes hasta esta hora.</p>'}`;
  $('#pick-edo').addEventListener('change', ev => {
    const list = (S.unitsOf[ev.target.value] || []);
    const worst = list.slice().sort((a, b) => score(b) - score(a))[0];
    select(worst.id);
  });
  $('#pick-u').addEventListener('change', ev => select(ev.target.value));
  $('#rf-chain').addEventListener('click', ev => { const b = ev.target.closest('[data-k]'); if (b) { App.station = b.dataset.k; setSeg('#v3d', b.dataset.k); App.view?.select(b.dataset.k); renderFichaLive(chainAt(App.sel, App.t)); } });
}
function chainRows(chain) {
  return KEYS.map(k => {
    const c = chain[k] || {};
    const sub = k === 'reefer' || k === 'caja'
      ? (c.tr ? `${c.active ? 'en camino' : 'último viaje'} · salió ${fmtT(c.tr.dep)}${c.tr.fail != null ? ' · falló la unidad de frío' : ''}${c.tr.froze ? ' · congeló' : ''}` : 'sin viaje todavía')
      : c.st && c.st !== 'ok' ? ST_TXT[c.st] : 'sin incidentes';
    return `<button class="rf-link ${App.station === k ? 'sel' : ''}" data-k="${k}"><i style="background:${tempColor(c.T)}"></i><b>${NAMES[k]}</b><em>${c.T == null ? '—' : tC(c.T)}</em><small>${esc(sub)}</small></button>`;
  }).join('');
}
function renderFichaLive(chain) { const el = $('#rf-chain'); if (el) el.innerHTML = chainRows(chain); }
const score = n => { const s = eqState(n, App.t).st; return { oculto: 5, baja: 4, frio: 3, exc: 2, ok: 1 }[s] + (App.S.losses.some(l => l.trip && l.trip.to === n.id && !l.det && l.t <= App.t) ? 5 : 0); };
function select(id) {
  App.sel = id; store.set('sel', id);
  const u = new URL(location.href); u.searchParams.set('u', id); history.replaceState(null, '', u);
  refresh(true); highlightMap();
}

// ------------------------------------------------------------------ curva de 30 días
function renderCurve() {
  const S = App.S, u = S.byId[App.sel]; if (!u) return;
  const est = S.byId['EST' + u.cve], cen = S.byId.CENADI;
  const W = 1000, Hh = 240, pl = 38, pr = 8, pt = 10, pb = 26, lo = -8, hi = 24;
  const X = h => pl + (W - pl - pr) * h / H, Y = T => pt + (Hh - pt - pb) * (1 - (Math.max(lo, Math.min(hi, T)) - lo) / (hi - lo));
  const line = (arr, step = 1) => { let d = ''; for (let h = 0; h < H; h += step) d += `${h ? 'L' : 'M'}${X(h + 0.5).toFixed(1)} ${Y(arr[h]).toFixed(1)}`; return d; };
  let band = '';
  for (let h = 0; h < H; h++) band += `${h ? 'L' : 'M'}${X(h).toFixed(1)} ${Y(u.R.maxT[h]).toFixed(1)}`;
  for (let h = H - 1; h >= 0; h--) band += `L${X(h + 1).toFixed(1)} ${Y(u.R.minT[h]).toFixed(1)}`;
  const trip = (x, col) => { let d = ''; x.prof.forEach((T, i) => { d += `${i ? 'L' : 'M'}${X(x.dep + i * 0.25).toFixed(1)} ${Y(T).toFixed(1)}`; }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round"><title>${x.kind === 'caja' ? 'Caja térmica' : 'Tráiler refrigerado'} · salió ${fmtT(x.dep)} · ${tC(x.low)} a ${tC(x.peak)}</title></path>`; };
  const reefers = S.trips.filter(x => x.kind === 'reefer' && x.to === est.id), cajas = S.trips.filter(x => x.kind === 'caja' && x.to === u.id);
  let g = `<rect class="band" x="${pl}" y="${Y(8)}" width="${W - pl - pr}" height="${Y(2) - Y(8)}"/>`;
  for (const T of [-5, 0, 5, 10, 15, 20]) g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(T)}" y2="${Y(T)}"/><text class="ax" x="${pl - 6}" y="${Y(T) + 3.5}" text-anchor="end">${T}°</text>`;
  g += `<line class="lim" x1="${pl}" x2="${W - pr}" y1="${Y(8)}" y2="${Y(8)}"/><line class="lim" x1="${pl}" x2="${W - pr}" y1="${Y(2)}" y2="${Y(2)}"/><line class="zero" x1="${pl}" x2="${W - pr}" y1="${Y(-0.5)}" y2="${Y(-0.5)}"/>`;
  for (let d = 0; d <= DAYS; d += 5) g += `<text class="ax" x="${X(d * 24)}" y="${Hh - 8}" text-anchor="middle">día ${d}</text>`;
  g += `<path d="${line(cen.R.meanT, 2)}" fill="none" stroke="#94a3b8" stroke-width="1" opacity=".8"/>`;
  g += `<path d="${line(est.R.meanT, 2)}" fill="none" stroke="#60a5fa" stroke-width="1.2" opacity=".9"/>`;
  g += `<path d="${band}Z" fill="rgba(45,212,191,.16)"/><path d="${line(u.R.meanT)}" fill="none" stroke="#2dd4bf" stroke-width="1.6"/>`;
  g += reefers.map(x => trip(x, '#f59e0b')).join('') + cajas.map(x => trip(x, '#c084fc')).join('');
  for (const ep of u.R.eps) if (ep.froze) g += `<circle cx="${X(ep.t0)}" cy="${Y(ep.low)}" r="4" fill="#3b82f6" stroke="#0d1117"><title>Congelación ${fmtT(ep.t0)}</title></circle>`;
  g += `<rect class="fut" x="${X(App.t)}" y="${pt}" width="${Math.max(0, W - pr - X(App.t))}" height="${Hh - pt - pb}"/><line class="now" x1="${X(App.t)}" x2="${X(App.t)}" y1="${pt}" y2="${Hh - pb}"/>`;
  $('#curve').innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Temperatura de la cadena de la unidad elegida en 30 días">${g}</svg>`;
  const frz = cajas.filter(x => x.froze).length, fr = u.R.eps.filter(x => x.froze).length;
  $('#curve-note').textContent = `${u.nombre}: ${cajas.length} cajas en el mes${frz ? `, ${frz} con el producto congelado` : ''}; el refrigerador ${fr ? `congeló ${fr} ${fr === 1 ? 'vez' : 'veces'}` : 'no congeló'} y estuvo ${pct(rangeShare(u), 0)} del tiempo entre 2 y 8 °C. La parte sombreada a la derecha es el futuro de la simulación.`;
}
const rangeShare = n => { let a = 0; for (let h = 0; h < H; h++) if (n.R.minT[h] >= 2 && n.R.maxT[h] <= 8) a++; return a / H; };

// ------------------------------------------------------------------ mapa
let mapDots = null;
function buildMap() {
  const S = App.S, O = App.outline;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const s of O.estados) for (const p of s.polys) for (const [x, y] of p.ext) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const pad = 30, w = maxX - minX + 2 * pad, h = maxY - minY + 2 * pad;
  const P = (x, y) => `${(x - minX + pad).toFixed(0)} ${(maxY - y + pad).toFixed(0)}`;
  App.mapP = (x, y) => [x - minX + pad, maxY - y + pad];
  const paths = O.estados.map(s => `<path class="edo" data-cve="${s.cve}" d="${s.polys.map(p => 'M' + p.ext.map(([x, y]) => P(x, y)).join('L') + 'Z').join('')}"/>`).join('');
  const dots = S.nodes.map((n, i) => {
    const [x, y] = App.mapP(n.xy[0], n.xy[1]);
    if (n.kind === 'unidad') return `<circle data-i="${i}" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${n.nivel === 1 ? 7 : n.nivel === 2 ? 10 : 13}"/>`;
    return `<rect data-i="${i}" x="${(x - 9).toFixed(0)}" y="${(y - 9).toFixed(0)}" width="18" height="18" fill="#e6edf3" stroke="#0d1117" stroke-width="3"/>`;
  }).join('');
  $('#map').innerHTML = `<svg viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" role="img" aria-label="Mapa de equipos de red fría">${paths}<g id="dots">${dots}</g><circle id="selu" class="selu" r="22" cx="-99" cy="-99"/></svg>`;
  mapDots = [...document.querySelectorAll('#dots > *')];
  $('#map svg').addEventListener('click', e => { const el = e.target.closest('[data-i]'); if (!el) return; const n = S.nodes[+el.dataset.i]; if (n.kind === 'unidad') select(n.id); else { const list = S.unitsOf[n.cve] || []; select(list.slice().sort((a, b) => score(b) - score(a))[0].id); } });
  $('#map svg').addEventListener('pointermove', e => {
    const el = e.target.closest('[data-i]'); if (!el) { $('#tip').hidden = true; return; }
    const n = App.S.nodes[+el.dataset.i], s = eqState(n, App.t);
    tipShow(`<b>${esc(n.nombre)}</b><div class="r">Equipo<em>${esc(EQNAME[n.eq])}</em></div><div class="r">Ahora<em>${tC(s.T)}</em></div><div class="r">Estado<em>${ST_TXT[s.st]}</em></div><div class="r">Excursiones<em>${s.n}</em></div>`, e);
  });
  $('#map svg').addEventListener('pointerleave', () => ($('#tip').hidden = true));
  highlightMap();
}
function colorMap() {
  if (!mapDots) return;
  const S = App.S;
  S.nodes.forEach((n, i) => {
    if (n.kind !== 'unidad') return;
    let st = eqState(n, App.t).st;
    const tl = S.losses.find(l => l.trip && l.trip.to === n.id && l.t <= App.t && !l.det);
    if (tl) st = 'oculto'; else if (st === 'ok' && S.losses.some(l => l.trip && l.trip.to === n.id && l.t <= App.t)) st = 'baja';
    const el = mapDots[i];
    el.setAttribute('fill', ST[st]); el.setAttribute('fill-opacity', st === 'ok' ? '0.55' : '0.95');
  });
}
function highlightMap() {
  const n = App.S?.byId[App.sel]; if (!n || !App.mapP) return;
  const [x, y] = App.mapP(n.xy[0], n.xy[1]);
  const c = $('#selu'); c.setAttribute('cx', x.toFixed(0)); c.setAttribute('cy', y.toFixed(0));
  document.querySelectorAll('#map .edo').forEach(p => p.classList.toggle('sel', p.dataset.cve === n.cve));
}
function tipShow(html, ev) {
  const tip = $('#tip'); tip.innerHTML = html; tip.hidden = false;
  tip.style.left = `${Math.min(innerWidth - 270, ev.clientX + 14)}px`; tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY + 14)}px`;
}

// ------------------------------------------------------------------ bitácora
function renderFeed() {
  const S = App.S;
  let ev = S.events.filter(x => x.t <= App.t);
  if (App.feedF === 'hidden') ev = ev.filter(x => (x.kind === 'eq' ? x.e.det == null || x.e.det > App.t : x.tr.det == null) && (x.kind === 'eq' ? x.e.froze || x.e.loss : x.tr.loss));
  if (App.feedF === 'sel') { const u = S.byId[App.sel]; ev = ev.filter(x => x.kind === 'eq' ? x.n.id === u.id || x.n.id === 'EST' + u.cve || x.n.id === 'CENADI' : x.tr.to === u.id || x.tr.to === 'EST' + u.cve); }
  const list = ev.slice(-80).reverse();
  $('#feed-sub').textContent = `${nf.format(ev.length)} hasta ${fmtT(App.t)}`;
  $('#feed').innerHTML = list.length ? list.map(x => {
    if (x.kind === 'eq') {
      const e = x.e, n = x.n, det = e.det != null && e.det <= App.t;
      const col = e.froze ? '#3b82f6' : e.peak > 8 ? '#fbbf24' : '#7dd3fc';
      const what = e.froze ? 'Congelación' : e.peak > 8 ? `Calor hasta ${tC(e.peak)}` : `Frío hasta ${tC(e.low)}`;
      const loss = e.loss && e.loss.t <= App.t ? ` · ${e.loss.det ? 'baja de' : 'dañado sin detectar:'} ${money(e.loss.mxn)}` : '';
      return `<button class="rf-ev" data-id="${n.kind === 'unidad' ? n.id : ''}"><time>${fmtT(x.t)}</time><i style="background:${col}"></i><b>${what} · ${esc(n.nombre)}</b><small>${esc(e.causa)} · ${det ? `detectada en ${f1(e.det - e.t0)} h (${esc(e.via)})` : 'no detectada'}${loss}</small></button>`;
    }
    const tr = x.tr, to = S.byId[tr.to];
    const what = tr.froze ? 'Caja congelada' : tr.fail != null ? 'Falla de la unidad de frío' : `Envío a ${tC(tr.peak)}`;
    const loss = tr.loss ? ` · ${tr.loss.det ? 'baja de' : 'dañado sin detectar:'} ${money(tr.loss.mxn)}` : '';
    return `<button class="rf-ev" data-id="${to.kind === 'unidad' ? to.id : ''}"><time>${fmtT(x.t)}</time><i style="background:${tr.froze ? '#3b82f6' : '#f59e0b'}"></i><b>${what} · ${tr.kind === 'caja' ? 'caja a' : 'tráiler a'} ${esc(to.nombre)}</b><small>${f1(tr.dur)} h de viaje · ${tr.det != null ? `visto por ${esc(tr.via)}` : `llegó a ${tC(tr.arrive)}, nadie lo vio`}${loss}</small></button>`;
  }).join('') : '<p class="empty">Sin eventos todavía.</p>';
}
$('#feed-f').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.feedF = b.dataset.f; setSeg('#feed-f', App.feedF, 'f'); renderFeed(); });
$('#feed').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b && b.dataset.id) select(b.dataset.id); });

// ------------------------------------------------------------------ tabla por estado
function stateRows() {
  const S = App.S, t = App.t, h = Math.max(1, Math.floor(t));
  return App.data.estados.map(e => {
    const units = S.unitsOf[e.cve] || [];
    const eqs = [S.byId['EST' + e.cve], ...units];
    let inR = 0, tot = 0, eps = 0, det = 0, frz = 0;
    for (const n of eqs) {
      for (let i = 0; i < h; i += 3) { tot++; if (n.R.minT[i] >= 2 && n.R.maxT[i] <= 8) inR++; }
      for (const x of n.R.eps) if (x.t0 <= t) { eps++; if (x.det != null && x.det <= t) det++; if (x.froze) frz++; }
    }
    const ids = new Set(eqs.map(n => n.id));
    const L = S.losses.filter(l => l.t <= t && (ids.has(l.where) || (l.trip && ids.has(l.trip.to))));
    const cajas = S.trips.filter(x => x.kind === 'caja' && x.cve === e.cve && x.dep + x.dur <= t);
    return {
      e, units: units.length, dom: units.filter(n => n.eq === 'dom').length, inR: tot ? inR / tot : 1, eps, det: eps ? det / eps : 1, frz,
      baja: L.filter(l => l.det).reduce((a, l) => a + l.mxn, 0), oculto: L.filter(l => !l.det).reduce((a, l) => a + l.mxn, 0),
      cajas: cajas.length, cajasOut: cajas.filter(x => x.out > 0).length,
    };
  });
}
const COLS = [
  { k: 'nombre', n: 'Estado', v: r => r.e.nombre },
  { k: 'units', n: 'Unidades', v: r => r.units },
  { k: 'dom', n: 'Refrigeradores domésticos', v: r => r.dom, opt: true },
  { k: 'inR', n: 'En rango', v: r => r.inR },
  { k: 'eps', n: 'Excursiones', v: r => r.eps },
  { k: 'det', n: 'Detectadas', v: r => r.det },
  { k: 'frz', n: 'Congelaciones', v: r => r.frz, opt: true },
  { k: 'cajasOut', n: 'Cajas fuera de rango', v: r => r.cajasOut, opt: true },
  { k: 'baja', n: 'Baja con acta', v: r => r.baja },
  { k: 'perd', n: 'Dañado sin detectar', v: r => r.oculto },
];
function renderRank() {
  const c = COLS.find(x => x.k === App.sort.k) || COLS.at(-1);
  const R = stateRows().sort((a, b) => { const va = c.v(a), vb = c.v(b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * App.sort.dir; });
  App.rankRows = R;
  const sel = App.S.byId[App.sel]?.cve;
  $('#rank').innerHTML = `<table><thead><tr>${COLS.map(x => `<th class="sort ${x.k === c.k ? 'on' : ''} ${x.k === 'nombre' ? '' : 'n'} ${x.opt ? 'col-opt2' : ''}" data-k="${x.k}">${x.n}${x.k === c.k ? (App.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead><tbody>${R.map(r => `
    <tr data-cve="${r.e.cve}" class="${r.e.cve === sel ? 'sel' : ''}"><td><b>${esc(r.e.nombre)}</b></td><td class="n">${r.units}</td><td class="n col-opt2">${r.dom}</td>
    <td class="n" style="color:${r.inR >= 0.98 ? 'var(--ok)' : r.inR >= 0.93 ? 'var(--warn)' : 'var(--crit)'}">${pct(r.inR)}</td><td class="n">${nf.format(r.eps)}</td><td class="n">${r.eps ? pct(r.det, 0) : '—'}</td>
    <td class="n col-opt2">${r.frz || '—'}</td><td class="n col-opt2">${r.cajasOut ? `${r.cajasOut} de ${r.cajas}` : '—'}</td><td class="n">${r.baja ? money(r.baja) : '—'}</td><td class="n" style="${r.oculto ? 'color:#f0abfc;font-weight:650' : ''}">${r.oculto ? money(r.oculto) : '—'}</td></tr>`).join('')}</tbody></table>`;
}
$('#rank').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (th) { const k = th.dataset.k; App.sort = { k, dir: App.sort.k === k ? -App.sort.dir : (k === 'nombre' ? 1 : k === 'inR' || k === 'det' ? 1 : -1) }; renderRank(); return; }
  const tr = e.target.closest('tr[data-cve]'); if (!tr) return;
  const list = App.S.unitsOf[tr.dataset.cve] || [];
  select(list.slice().sort((a, b) => score(b) - score(a))[0].id);
  $('#c3d').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#rank-csv').addEventListener('click', () => {
  const head = ['clave', 'estado', 'unidades', 'refrigeradores_domesticos', 'en_rango_pct', 'excursiones', 'detectadas_pct', 'congelaciones', 'cajas_fuera_de_rango', 'baja_mxn', 'danado_sin_detectar_mxn'];
  const lines = (App.rankRows || stateRows()).map(r => [r.e.cve, r.e.nombre, r.units, r.dom, (r.inR * 100).toFixed(1), r.eps, (r.det * 100).toFixed(0), r.frz, r.cajasOut, Math.round(r.baja), Math.round(r.oculto)].join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `redfria_${App.lv.ctx}_dia${Math.floor(App.t / 24)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ------------------------------------------------------------------ comparación de inversiones (en segundo plano)
const PLANS = [
  { key: 'base', n: 'Como está', lv: {} },
  { key: 'acond', n: 'Refrigerantes acondicionados', lv: { pack: 'acond' } },
  { key: 'reg', n: 'Registrador de 30 días', lv: { mon: 'reg' } },
  { key: 'tele', n: 'Telemetría con aviso', lv: { mon: 'tele' } },
  { key: 'med', n: 'Refrigerador grado médico en 1er nivel', lv: { ref: 'med' } },
  { key: 'ilr', n: 'Refrigerador con forro de hielo en 1er nivel', lv: { ref: 'ilr' } },
  { key: 'pla', n: 'Planta de emergencia en todas', lv: { pla: 'todas' } },
  { key: 'p1', n: 'Acondicionados + registrador + grado médico', lv: { pack: 'acond', mon: 'reg', ref: 'med' } },
  { key: 'p2', n: 'Todo: acondicionados + telemetría + grado médico + plantas', lv: { pack: 'acond', mon: 'tele', ref: 'med', pla: 'todas' } },
];
let worker = null;
function buildCompare() {
  const ctx = App.lv.ctx;
  App.cmpFor = ctx; App.cmp = [];
  $('#compare').innerHTML = '<p class="empty">Calculando 9 escenarios…</p>';
  const jobs = PLANS.map(p => ({ ...p, lvFull: { ...BASE, ctx, ...p.lv } }));
  const done = (p, r) => { if (App.cmpFor !== ctx) return; App.cmp.push({ ...p, summary: r.summary, invest: r.invest }); renderCompare(); if (p.key === 'base') renderKpis(); };
  try {
    if (!worker) { worker = new Worker(new URL('./redfria-worker.js', import.meta.url), { type: 'module' }); worker.postMessage({ data: App.data }); }
    worker.onmessage = e => { const p = jobs.find(j => j.key === e.data.id.split('|')[1] && e.data.id.split('|')[0] === ctx); if (p) done(p, e.data); };
    worker.onerror = () => { worker = null; fallback(); };
    jobs.forEach(p => worker.postMessage({ id: `${ctx}|${p.key}`, lv: p.lvFull }));
  } catch { fallback(); }
  function fallback() { let i = 0; const step = () => { if (i >= jobs.length || App.cmpFor !== ctx) return; const p = jobs[i++]; const S = simulate(App.data, p.lvFull); done(p, S); setTimeout(step, 30); }; setTimeout(step, 200); }
}
function renderCompare() {
  const R = PLANS.map(p => App.cmp.find(r => r.key === p.key)).filter(Boolean);
  const base = R.find(r => r.key === 'base');
  const loss = r => r.summary.bajaMxn + r.summary.ocultoMxn;
  const curKey = PLANS.find(p => Object.entries({ ...BASE, ...p.lv }).every(([k, v]) => k === 'ctx' || App.lv[k] === v))?.key;
  $('#compare').innerHTML = `<table class="cmp"><thead><tr><th>Plan</th><th class="n">Pérdida al mes</th><th class="n">Dañado sin detectar</th><th class="n col-opt2">En rango</th><th class="n">Inversión</th><th class="n">Recupera en</th></tr></thead><tbody>${R.map(r => {
    const save = base ? loss(base) - loss(r) - r.invest.opexMes : 0;
    const months = save > 0 ? r.invest.capex / save : null;
    const pay = !r.invest.capex ? '—' : months == null ? (base && r.summary.ocultoMxn < base.summary.ocultoMxn ? 'no evita pérdida: la hace visible' : 'no recupera') : months < 1 ? `${Math.max(1, Math.round(months * 30))} días` : `${f1(months)} meses`;
    return `<tr data-k="${r.key}" class="${r.key === curKey ? 'cur' : ''}"><td>${esc(r.n)}</td><td class="n">${money(loss(r))}</td><td class="n" style="${r.summary.ocultoMxn ? 'color:#f0abfc;font-weight:650' : 'color:var(--ok)'}">${r.summary.ocultoMxn ? money(r.summary.ocultoMxn) : 'nada'}</td><td class="n col-opt2">${pct(r.summary.inRange)}</td><td class="n">${r.invest.capex ? money(r.invest.capex) : '—'}${r.invest.opexMes ? `<small class="muted"> + ${money(r.invest.opexMes)}/mes</small>` : ''}</td><td class="n">${pay}</td></tr>`;
  }).join('')}</tbody></table>${R.length < PLANS.length ? `<p class="note">Faltan ${PLANS.length - R.length} escenarios…</p>` : ''}`;
}
function markCompare() { renderCompare(); }
$('#compare').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-k]'); if (!tr) return;
  const p = PLANS.find(x => x.key === tr.dataset.k);
  App.lv = { ...BASE, ctx: App.lv.ctx, ...p.lv }; store.set('lv', App.lv);
  for (const k of ['ctx', 'mon', 'ref', 'pla', 'pack']) setSeg('#' + k, App.lv[k]);
  rerun(); window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ------------------------------------------------------------------ arranque
async function init() {
  for (const k of ['ctx', 'mon', 'ref', 'pla', 'pack']) setSeg('#' + k, App.lv[k]);
  setSeg('.speed', App.speed, 'speed'); playIcon();
  [App.data, App.outline] = await Promise.all([fetch('assets/estados_issste.json').then(r => r.json()), fetch('assets/estados_mx.json').then(r => r.json())]);
  App.S = simulate(App.data, App.lv);
  indexEvents();
  if (!App.sel || !App.S.byId[App.sel] || App.S.byId[App.sel].kind !== 'unidad') App.sel = pickDefault();
  $('#scn-desc').innerHTML = '';
  rerunDesc();
  buildMap(); refresh(true);
  $('#loading').remove();
  requestAnimationFrame(loop);
  setTimeout(buildCompare, 50);
  try {
    const box = $('#c3d');
    const v = new RedFria3D(box);
    await v.load(window.__RF_GLB || null);
    box.querySelector('.u3d-loading')?.remove();
    App.view = v; v.onPick = k => { App.station = k; setSeg('#v3d', k || 'general'); v.select(k); renderFichaLive(chainAt(App.sel, App.t)); };
    v.setState(chainAt(App.sel, App.t));
  } catch (err) {
    console.error(err);
    $('#c3d').innerHTML = `<div class="u3d-loading">No se pudo cargar la cadena 3D (${esc(err.message || err)}). El resto de la página funciona.</div>`;
  }
}
function rerunDesc() {
  $('#scn-desc').innerHTML = `<b>${esc(CONTEXTS[App.lv.ctx].nombre)}.</b> ${esc(CONTEXTS[App.lv.ctx].desc)} Monitoreo <b>${esc(LEVERS.mon.o[App.lv.mon].toLowerCase())}</b>, refrigerador del 1er nivel <b>${esc(LEVERS.ref.o[App.lv.ref].toLowerCase())}</b>, planta en <b>${esc(LEVERS.pla.o[App.lv.pla].toLowerCase())}</b>, refrigerantes <b>${esc(LEVERS.pack.o[App.lv.pack].toLowerCase())}</b>.`;
}
init();

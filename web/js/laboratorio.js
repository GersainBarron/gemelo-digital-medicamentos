// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  laboratorio.js · Laboratorio de experimentos (laboratorio.html)
//  Diseña brazos (política × escenario × estrés), corre N réplicas por
//  brazo en Web Workers (lab-worker.js → lab.js) y muestra, mientras se
//  calculan, el mosaico de mundos, los intervalos de confianza, la
//  diferencia pareada contra el brazo A y conclusiones en lenguaje claro.
// =====================================================================
import { METRICS, METRIC, POLICY_ES, SCEN_ES, armLabel, summary, paired } from './lab.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = ['#2dd4bf', '#f59e0b', '#a78bfa', '#f472b6'];
const L = ['A', 'B', 'C', 'D'];
const BASE = Date.UTC(2026, 9, 26);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = d => { const x = new Date(BASE + d * 864e5); return `${x.getUTCDate()} ${MESES[x.getUTCMonth()]}`; };

const PRESETS = [
  { id: 'pol', q: '¿Pronóstico o mínimos y máximos?', why: 'Compara los dos métodos de pedido del CEDIS en operación normal.', win: 0,
    arms: [{ policy: 'minmax', scen: 'normal' }, { policy: 'forecast', scen: 'normal' }] },
  { id: 'cont', q: '¿Qué método aguanta mejor una contingencia?', why: 'Falla de proveedores y brote respiratorio; se evalúa el mes completo de la contingencia.', win: 15,
    arms: [{ policy: 'minmax', scen: 'contingencia' }, { policy: 'forecast', scen: 'contingencia' }] },
  { id: 'dem', q: '¿Qué pasa si la demanda sube 20 %?', why: 'Los máximos y mínimos se calcularon con la demanda planeada; aquí la real sube sin aviso.', win: 0,
    arms: [{ policy: 'minmax', scen: 'normal' }, { policy: 'minmax', scen: 'normal', demanda: 1.2 }, { policy: 'forecast', scen: 'normal', demanda: 1.2 }] },
  { id: 'prov', q: '¿Y si los proveedores fallan el doble?', why: 'Doble de entregas tardías o parciales y 5 días más de retraso.', win: 0,
    arms: [{ policy: 'minmax', scen: 'normal' }, { policy: 'minmax', scen: 'normal', fallas: 2, retraso: 5 }, { policy: 'forecast', scen: 'normal', fallas: 2, retraso: 5 }] },
  { id: 'ped', q: '¿Sirve el pedido automático de las unidades?', why: 'Las unidades piden antes de quedarse sin medicamento; se compara contra esperar a la ruta ordinaria y a la urgencia.', win: 0,
    arms: [{ policy: 'minmax', scen: 'normal' }, { policy: 'minmax', scen: 'normal', pedidoAuto: false }] },
  { id: 'inv', q: '¿Cómo nos va en invierno?', why: 'Pico de la temporada respiratoria (diciembre).', win: 66,
    arms: [{ policy: 'minmax', scen: 'normal' }, { policy: 'forecast', scen: 'normal' }] },
  { id: 'free', q: 'Diseño libre', why: 'Arma hasta 4 brazos con cualquier combinación.', win: 0, arms: [{ policy: 'minmax', scen: 'normal' }, { policy: 'forecast', scen: 'normal' }] },
];
const OPT = {
  policy: Object.entries(POLICY_ES), scen: Object.entries(SCEN_ES),
  demanda: [[0.8, 'Demanda −20 %'], [1, 'Demanda planeada'], [1.1, 'Demanda +10 %'], [1.2, 'Demanda +20 %'], [1.3, 'Demanda +30 %'], [1.5, 'Demanda +50 %']],
  fallas: [[1, 'Fallas normales'], [1.5, 'Fallas ×1.5'], [2, 'Fallas ×2'], [3, 'Fallas ×3']],
  retraso: [[0, 'Sin retraso extra'], [3, '+3 días'], [5, '+5 días'], [7, '+7 días'], [14, '+14 días']],
};

const S = { arms: [], n: 50, win: 0, running: false, res: [], jobs: [], pool: [], done: 0, total: 0, t0: 0, msAvg: 2200, ranArms: null, ranWin: 0 };
let DATA, CAT;
const threads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));

init();

async function init() {
  [DATA, CAT] = await Promise.all(['assets/unidades_hidalgo.json', 'assets/medicamentos.json'].map(u => fetch(u).then(r => r.json())));
  $('threads').textContent = `${threads} en paralelo`;
  $('q').innerHTML = PRESETS.map(p => `<option value="${p.id}">${esc(p.q)}</option>`).join('');
  $('q').addEventListener('change', () => loadPreset($('q').value));
  $('add-arm').addEventListener('click', () => { if (S.arms.length < 4) { S.arms.push({ ...S.arms.at(-1) }); $('q').value = 'free'; renderArms(); } });
  document.querySelectorAll('#n-rep button').forEach(b => b.addEventListener('click', () => {
    S.n = +b.dataset.n; document.querySelectorAll('#n-rep button').forEach(x => x.classList.toggle('active', x === b)); eta0();
  }));
  $('win').addEventListener('change', () => { S.win = +$('win').value; });
  $('run').addEventListener('click', run);
  $('stop').addEventListener('click', stop);
  $('csv').addEventListener('click', exportCSV);
  const opts = METRICS.map(m => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
  $('tile-m').innerHTML = opts; $('tile-m').value = 'pzNegadas';
  $('dist-m').innerHTML = opts; $('dist-m').value = 'pzNegadas';
  $('tile-m').addEventListener('change', renderTiles);
  $('dist-m').addEventListener('change', () => { renderDist(); renderConv(); });
  $('fan-m').addEventListener('change', renderFan);
  loadPreset('pol');
}

function loadPreset(id) {
  const p = PRESETS.find(x => x.id === id);
  S.arms = p.arms.map(a => ({ demanda: 1, fallas: 1, retraso: 0, pedidoAuto: true, ...a }));
  S.win = p.win; $('win').value = String(p.win);
  $('q-why').textContent = p.why;
  renderArms();
}

function sel(key, val, i) {
  return `<select data-i="${i}" data-k="${key}">${OPT[key].map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
function renderArms() {
  $('arms').innerHTML = S.arms.map((a, i) => `<div class="arm">
    <span class="tag" style="background:${COLORS[i]}">${L[i]}</span>
    ${sel('policy', a.policy, i)}${sel('scen', a.scen, i)}${sel('demanda', a.demanda, i)}${sel('fallas', a.fallas, i)}${sel('retraso', a.retraso, i)}
    <label class="ck"><input type="checkbox" data-i="${i}" data-k="pedidoAuto" ${a.pedidoAuto ? 'checked' : ''}> Pedido automático</label>
    <button class="x" data-i="${i}" ${S.arms.length <= 1 ? 'disabled' : ''} aria-label="Quitar brazo">✕</button></div>`).join('');
  $('arms').querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
    const a = S.arms[+s.dataset.i], k = s.dataset.k; a[k] = k === 'policy' || k === 'scen' ? s.value : +s.value; $('q').value = 'free';
  }));
  $('arms').querySelectorAll('input[type=checkbox]').forEach(c => c.addEventListener('change', () => { S.arms[+c.dataset.i].pedidoAuto = c.checked; $('q').value = 'free'; }));
  $('arms').querySelectorAll('.x').forEach(b => b.addEventListener('click', () => { S.arms.splice(+b.dataset.i, 1); $('q').value = 'free'; renderArms(); }));
  $('add-arm').disabled = S.arms.length >= 4;
  eta0();
}
const fmtDur = s => (s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);
function eta0() { $('eta0').textContent = '≈ ' + fmtDur(S.arms.length * S.n * S.msAvg / 1000 / threads); }

// ---------------------------------------------------------------------
//  Ejecución en paralelo
// ---------------------------------------------------------------------
function run() {
  if (S.running) return;
  stopPool();
  S.ranArms = S.arms.map((a, i) => ({ ...a, id: L[i] })); S.ranWin = S.win; S.ranN = S.n;
  S.res = S.ranArms.map(() => []); S.jobs = [];
  for (let r = 1; r <= S.n; r++) S.ranArms.forEach((arm, ai) => S.jobs.push({ arm, ai, rep: r, day: S.win }));
  S.total = S.jobs.length; S.done = 0; S.t0 = performance.now(); S.running = true; S.inflight = new Map();
  $('run').disabled = true; $('stop').hidden = false;
  for (const id of ['res-card', 'tab-card', 'charts', 'conv-card']) $(id).hidden = true;
  renderTiles();
  for (let w = 0; w < threads; w++) {
    const worker = new Worker(new URL('./lab-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => onMsg(worker, e.data);
    worker.onerror = e => { console.error(e); fail('Un hilo de cómputo falló: ' + (e.message || 'error')); };
    worker.postMessage({ type: 'init', data: DATA, cat: CAT });
    S.pool.push(worker);
  }
  tick();
}
function next(worker) {
  const job = S.jobs.shift();
  if (!job) { worker.idle = true; return; }
  S.inflight.set(worker, job); markTile(job, 'run');
  worker.postMessage({ type: 'run', job });
}
function onMsg(worker, msg) {
  if (!S.running) return;
  if (msg.type === 'ready') { next(worker); return; }
  if (msg.type === 'error') { console.error(msg.error); fail('Error en una réplica: ' + msg.error.split('\n')[0]); return; }
  if (msg.type === 'done') {
    const { job, r } = msg;
    S.res[job.ai].push({ ...r, ai: job.ai });
    S.done++; S.msAvg = S.msAvg * 0.9 + r.ms * 0.1;
    markTile(job, 'done', r);
    S.inflight.delete(worker);
    if (S.done >= S.total) finish(); else next(worker);
    scheduleRender();
  }
}
function fail(txt) { $('prog-txt').textContent = txt; stop(); }
function stopPool() { for (const w of S.pool) w.terminate(); S.pool = []; }
function stop() {
  S.running = false; stopPool();
  $('run').disabled = false; $('stop').hidden = true;
  document.querySelectorAll('.tile-grid i.run').forEach(t => t.classList.remove('run'));
  if (S.done) renderResults();
}
function finish() { S.running = false; stopPool(); $('run').disabled = false; $('stop').hidden = true; renderResults(); tick(); }
function tick() {
  const el = (performance.now() - S.t0) / 1000;
  const left = S.done ? el / S.done * (S.total - S.done) : S.total * S.msAvg / 1000 / threads;
  $('prog').style.width = (100 * S.done / Math.max(1, S.total)) + '%';
  $('prog-txt').textContent = S.running ? `${S.done} de ${S.total} mundos · ${fmtDur(el)} · faltan ≈ ${fmtDur(left)}` : S.total ? `${S.done} de ${S.total} mundos en ${fmtDur(el)}${S.done < S.total ? ' (detenido)' : ''}` : 'aún no se corre';
  if (S.running) setTimeout(tick, 500);
}
let renderTO = null, lastRender = 0;
function scheduleRender() {
  if (renderTO) return;
  const wait = Math.max(0, 900 - (performance.now() - lastRender));
  renderTO = setTimeout(() => { renderTO = null; lastRender = performance.now(); renderResults(); }, wait);
}

// ---------------------------------------------------------------------
//  Formato
// ---------------------------------------------------------------------
function fmt(id, v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const f = METRIC[id].fmt;
  if (f === 'pct') return (v * 100).toFixed(1) + ' %';
  if (f === 'pct2') return (v * 100).toFixed(2) + ' %';
  if (f === 'days') return v.toFixed(1) + ' días';
  if (f === 'money') { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e6 ? `$${(a / 1e6).toFixed(1)} M` : a >= 1e3 ? `$${Math.round(a / 1e3).toLocaleString('es-MX')} mil` : `$${Math.round(a)}`); }
  return Math.round(v).toLocaleString('es-MX');
}
function fmtD(id, v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const f = METRIC[id].fmt, sg = v > 0 ? '+' : v < 0 ? '−' : '';
  if (f === 'pct' || f === 'pct2') return `${sg}${Math.abs(v * 100).toFixed(f === 'pct2' ? 2 : 1)} pts`;
  return sg + fmt(id, Math.abs(v)).replace('−', '');
}
const vals = (ai, id) => (S.res[ai] || []).map(r => ({ rep: r.rep, v: r.m[id] }));

// ---------------------------------------------------------------------
//  Mosaico de mundos
// ---------------------------------------------------------------------
function renderTiles() {
  const arms = S.ranArms || S.arms.map((a, i) => ({ ...a, id: L[i] }));
  const n = S.ranArms ? S.ranN : S.n;
  $('tiles').innerHTML = arms.map((a, ai) => `<div class="tile-row"><span class="tag" style="background:${COLORS[ai]}" title="${esc(armLabel(a))}">${L[ai]}</span>
    <div class="tile-grid" id="tg-${ai}">${Array.from({ length: n }, (_, k) => `<i data-ai="${ai}" data-rep="${k + 1}"></i>`).join('')}</div></div>`).join('');
  $('tiles').querySelectorAll('i').forEach(t => {
    t.addEventListener('mousemove', e => tileTip(e, +t.dataset.ai, +t.dataset.rep));
    t.addEventListener('mouseleave', () => { $('tip').hidden = true; });
    t.addEventListener('click', () => openWorld(+t.dataset.ai, +t.dataset.rep));
  });
  recolor();
}
function markTile(job, state) {
  const t = document.querySelector(`#tg-${job.ai} i[data-rep="${job.rep}"]`);
  if (!t) return;
  t.classList.toggle('run', state === 'run');
  if (state === 'done') recolor();
}
function scaleFor(id) {
  const all = S.res.flat().map(r => r.m[id]).filter(v => v !== null && isFinite(v));
  if (!all.length) return null;
  return { lo: Math.min(...all), hi: Math.max(...all), better: METRIC[id].better };
}
function colorOf(v, sc) {
  if (v === null || !isFinite(v) || !sc) return 'rgba(255,255,255,.05)';
  let u = sc.hi > sc.lo ? (v - sc.lo) / (sc.hi - sc.lo) : 0.5;
  if (sc.better === 'none') return `hsl(${210 - u * 40}, 70%, ${35 + u * 25}%)`;
  if (sc.better === 'up') u = 1 - u;                 // u = 0 bueno, 1 malo
  return `hsl(${140 - u * 140}, 65%, ${42 - u * 4}%)`;
}
let recolorTO = null;
function recolor() {
  if (recolorTO) return;
  recolorTO = requestAnimationFrame(() => {
    recolorTO = null;
    const id = $('tile-m').value, sc = scaleFor(id);
    S.res.forEach((rs, ai) => { for (const r of rs) { const t = document.querySelector(`#tg-${ai} i[data-rep="${r.rep}"]`); if (t) { t.style.background = colorOf(r.m[id], sc); t.classList.remove('run'); } } });
  });
}
function tileTip(e, ai, rep) {
  const r = (S.res[ai] || []).find(x => x.rep === rep), a = (S.ranArms || [])[ai], el = $('tip');
  if (!a) return;
  el.hidden = false;
  el.innerHTML = `<b>${L[ai]} · réplica ${rep}</b><small class="muted">${esc(armLabel(a))}</small>` + (r
    ? METRICS.filter(m => m.main).map(m => `<div class="r">${esc(m.label)}<em>${fmt(m.id, r.m[m.id])}</em></div>`).join('') + '<small class="muted">Clic para abrir este mundo en el gemelo</small>'
    : '<div class="r">pendiente</div>');
  el.style.left = Math.min(innerWidth - 280, e.clientX + 14) + 'px'; el.style.top = (e.clientY + 14) + 'px';
}
function openWorld(ai, rep) {
  const a = (S.ranArms || [])[ai]; if (!a) return;
  const q = new URLSearchParams({ rep, esc: a.scen, pol: a.policy });
  if (a.demanda !== 1) q.set('dem', a.demanda);
  if (a.fallas !== 1) q.set('fal', a.fallas);
  if (a.retraso) q.set('ret', a.retraso);
  if (a.pedidoAuto === false) q.set('ped', '0');
  window.open(`mapa.html?${q}`, '_blank');
}

// ---------------------------------------------------------------------
//  Resultados
// ---------------------------------------------------------------------
function renderResults() {
  if (!S.ranArms) return;
  for (const id of ['res-card', 'tab-card', 'charts', 'conv-card']) $(id).hidden = false;
  renderConcl(); renderTable(); renderDist(); renderFan(); renderConv(); recolor();
}
function renderConcl() {
  const arms = S.ranArms, out = [];
  const nMin = Math.min(...S.res.map(r => r.length));
  $('concl-sub').textContent = `${nMin} réplicas por brazo · ${S.running ? 'preliminar, sigue calculando' : 'final'} · ventana ${fecha(S.ranWin - 30)} – ${fecha(S.ranWin - 1)}`;
  if (nMin < 3) { $('concl').innerHTML = '<li class="flat">Se necesitan al menos 3 réplicas por brazo para concluir.</li>'; return; }
  for (let ai = 1; ai < arms.length; ai++) {
    let any = false;
    for (const m of METRICS.filter(x => x.main && x.better !== 'none')) {
      const pd = paired(vals(0, m.id), vals(ai, m.id), m.better);
      if (!pd.n || !pd.sig) continue;
      any = true;
      const good = m.better === 'up' ? pd.mean > 0 : pd.mean < 0;
      out.push([good ? 'good' : 'bad', `<b>${L[ai]}</b> frente a <b>A</b>: ${esc(m.label.toLowerCase())} ${pd.mean > 0 ? 'sube' : 'baja'} <b>${fmtD(m.id, pd.mean)}</b> (IC 95 %: ${fmtD(m.id, pd.lo)} a ${fmtD(m.id, pd.hi)}); es mejor en <b>${Math.round(pd.pBetter * 100)} %</b> de los mundos.`]);
    }
    if (!any) out.push(['flat', `<b>${L[ai]}</b> frente a <b>A</b>: ninguna diferencia en los indicadores principales se distingue de la suerte con ${nMin} réplicas.`]);
  }
  // riesgo: el peor 5 % de los mundos
  arms.forEach((a, ai) => {
    const s = summary(vals(ai, 'pzNegadas').map(x => x.v)), u = summary(vals(ai, 'urgentes').map(x => x.v));
    if (s.n) out.push(['', `<b>${L[ai]}</b> (${esc(armLabel(a))}): en un mundo típico se niegan <b>${fmt('pzNegadas', s.p50)}</b> piezas a pacientes en 30 días; en el peor 5 % de los mundos, más de <b>${fmt('pzNegadas', s.p95)}</b> y ${fmt('urgentes', u.p95)} solicitudes urgentes.`]);
  });
  $('concl').innerHTML = out.map(([c, t]) => `<li class="${c}">${t}</li>`).join('');
}
function renderTable() {
  const arms = S.ranArms;
  let h = `<thead><tr><th class="l">Indicador</th>${arms.map((a, ai) => `<th class="arm-h"><i style="background:${COLORS[ai]}"></i>${L[ai]} <span class="r" style="display:inline;font-weight:500">${esc(armLabel(a))}</span></th>`).join('')}</tr></thead><tbody>`;
  let grp = '';
  for (const m of METRICS) {
    if (m.group !== grp) { grp = m.group; h += `<tr class="grp"><td colspan="${arms.length + 1}">${esc(grp)}</td></tr>`; }
    h += `<tr><td class="l">${esc(m.label)}</td>`;
    arms.forEach((a, ai) => {
      const s = summary(vals(ai, m.id).map(x => x.v));
      let cell = s.n ? `<span class="v">${fmt(m.id, s.mean)}</span>${s.n > 1 ? ` <span class="muted">± ${fmtD(m.id, s.hi - s.mean).replace('+', '')}</span>` : ''}<span class="r">90 % de los mundos: ${fmt(m.id, s.p5)} – ${fmt(m.id, s.p95)}</span>` : '—';
      if (ai > 0 && s.n) {
        const pd = paired(vals(0, m.id), vals(ai, m.id), m.better);
        if (pd.n > 1) {
          const good = m.better === 'none' ? null : m.better === 'up' ? pd.mean > 0 : pd.mean < 0;
          const cls = !pd.sig || good === null ? 'flat' : good ? 'good' : 'bad';
          cell += `<span class="dlt ${cls}">vs A: ${fmtD(m.id, pd.mean)} [${fmtD(m.id, pd.lo)}, ${fmtD(m.id, pd.hi)}]${pd.pBetter !== null ? ` · mejor en ${Math.round(pd.pBetter * 100)} %` : ''}${pd.sig ? '' : ' · no concluyente'}</span>`;
        }
      }
      h += `<td>${cell}</td>`;
    });
    h += '</tr>';
  }
  $('res').innerHTML = h + '</tbody>';
}

// ---------------------------------------------------------------------
//  Gráficas
// ---------------------------------------------------------------------
function niceRange(lo, hi) {
  if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; return [lo - d, hi + d]; }
  const pad = (hi - lo) * 0.08; return [lo - pad, hi + pad];
}
function renderDist() {
  const id = $('dist-m').value, arms = S.ranArms;
  const all = arms.flatMap((_, ai) => vals(ai, id).map(x => x.v)).filter(v => v !== null && isFinite(v));
  if (!all.length) { $('dist').innerHTML = ''; return; }
  const [lo, hi] = niceRange(Math.min(...all), Math.max(...all));
  const W = 760, RH = 58, Lm = 34, Rm = 16, H = arms.length * RH + 30;
  const x = v => Lm + (W - Lm - Rm) * (v - lo) / (hi - lo);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; s += `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="4" y2="${H - 22}"/><text class="ax" x="${x(v)}" y="${H - 6}" text-anchor="middle">${fmt(id, v)}</text>`; }
  arms.forEach((a, ai) => {
    const cy = 8 + ai * RH + RH / 2, v = vals(ai, id).map(z => z.v).filter(z => z !== null && isFinite(z)), sm = summary(v);
    s += `<text x="4" y="${cy + 5}" fill="${COLORS[ai]}" font-weight="800" font-size="14">${L[ai]}</text>`;
    if (!sm.n) return;
    const q25 = [...v].sort((p, q) => p - q)[Math.floor((v.length - 1) * 0.25)], q75 = [...v].sort((p, q) => p - q)[Math.ceil((v.length - 1) * 0.75)];
    s += `<line x1="${x(sm.p5)}" x2="${x(sm.p95)}" y1="${cy}" y2="${cy}" stroke="${COLORS[ai]}" stroke-width="1.5" opacity=".6"/>`;
    s += `<rect x="${x(q25)}" y="${cy - 9}" width="${Math.max(1, x(q75) - x(q25))}" height="18" rx="4" fill="${COLORS[ai]}" opacity=".18" stroke="${COLORS[ai]}" stroke-opacity=".6"/>`;
    v.forEach((z, k) => { const jy = ((k * 7919) % 17 - 8) * 1.4; s += `<circle cx="${x(z)}" cy="${cy + jy}" r="2.6" fill="${COLORS[ai]}" opacity=".75"/>`; });
    s += `<line x1="${x(sm.mean)}" x2="${x(sm.mean)}" y1="${cy - 15}" y2="${cy + 15}" stroke="#fff" stroke-width="2.5"/>`;
  });
  $('dist').innerHTML = s + '</svg>';
}
function renderFan() {
  const key = $('fan-m').value, arms = S.ranArms;
  const series = arms.map((_, ai) => (S.res[ai] || []).map(r => r.s[key]));
  if (!series.some(x => x.length)) { $('fan').innerHTML = ''; return; }
  const n = 30, W = 760, H = 250, Lm = 50, Rm = 12, T = 10, B = 26;
  const bands = series.map(ss => Array.from({ length: n }, (_, k) => {
    const v = ss.map(x => x[k]).filter(z => z !== null && isFinite(z)).sort((a, b) => a - b);
    return v.length ? { p5: v[Math.floor((v.length - 1) * 0.05)], p50: v[Math.floor((v.length - 1) * 0.5)], p95: v[Math.ceil((v.length - 1) * 0.95)] } : null;
  }));
  const ys = bands.flat().filter(Boolean).flatMap(b => [b.p5, b.p95]);
  let [lo, hi] = niceRange(Math.min(...ys), Math.min(1, Math.max(...ys)));
  hi = Math.min(hi, 1.005);
  const x = k => Lm + (W - Lm - Rm) * k / (n - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; s += `<line class="grid" x1="${Lm}" x2="${W - Rm}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${Lm - 6}" y="${y(v) + 4}" text-anchor="end">${(v * 100).toFixed(1)} %</text>`; }
  for (let k = 0; k < n; k += 5) s += `<text class="ax" x="${x(k)}" y="${H - 7}" text-anchor="middle">${fecha(S.ranWin - 30 + k)}</text>`;
  bands.forEach((b, ai) => {
    const ok = b.map((z, k) => [z, k]).filter(([z]) => z);
    if (!ok.length) return;
    const up = ok.map(([z, k]) => `${x(k).toFixed(1)},${y(z.p95).toFixed(1)}`), dn = ok.map(([z, k]) => `${x(k).toFixed(1)},${y(z.p5).toFixed(1)}`).reverse();
    s += `<polygon points="${up.concat(dn).join(' ')}" fill="${COLORS[ai]}" opacity=".16"/>`;
    s += `<polyline points="${ok.map(([z, k]) => `${x(k).toFixed(1)},${y(z.p50).toFixed(1)}`).join(' ')}" fill="none" stroke="${COLORS[ai]}" stroke-width="2.2"/>`;
  });
  $('fan').innerHTML = s + '</svg>';
}
function renderConv() {
  const id = $('dist-m').value, arms = S.ranArms;
  const runs = arms.map((_, ai) => { const v = [...(S.res[ai] || [])].sort((a, b) => a.rep - b.rep).map(r => r.m[id]).filter(z => z !== null && isFinite(z)); let acc = 0; return v.map((z, k) => (acc += z) / (k + 1)); });
  const all = runs.flat(); if (!all.length) { $('conv').innerHTML = ''; return; }
  const n = Math.max(...runs.map(r => r.length)), [lo, hi] = niceRange(Math.min(...all), Math.max(...all));
  const W = 760, H = 180, Lm = 70, Rm = 12, T = 8, B = 24;
  const x = k => Lm + (W - Lm - Rm) * k / Math.max(1, n - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3; s += `<line class="grid" x1="${Lm}" x2="${W - Rm}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${Lm - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(id, v)}</text>`; }
  s += `<text class="ax" x="${W - Rm}" y="${H - 6}" text-anchor="end">réplicas →</text>`;
  runs.forEach((r, ai) => { if (r.length > 1) s += `<polyline points="${r.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${COLORS[ai]}" stroke-width="2"/>`; });
  $('conv').innerHTML = s + '</svg>';
}

// ---------------------------------------------------------------------
function exportCSV() {
  if (!S.ranArms) return;
  const rows = [['brazo', 'descripcion', 'politica', 'escenario', 'demanda', 'fallas', 'retraso', 'pedido_automatico', 'replica', 'ventana_hasta', ...METRICS.map(m => m.id)]];
  S.ranArms.forEach((a, ai) => {
    for (const r of [...S.res[ai]].sort((p, q) => p.rep - q.rep)) rows.push([L[ai], armLabel(a), a.policy, a.scen, a.demanda, a.fallas, a.retraso, a.pedidoAuto ? 1 : 0, r.rep, S.ranWin - 1, ...METRICS.map(m => r.m[m.id] ?? '')]);
  });
  const txt = '\ufeff' + rows.map(r => r.map(v => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' }));
  a.download = `experimento_${S.ranArms.length}brazos_${S.ranN}replicas.csv`; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 300);
}

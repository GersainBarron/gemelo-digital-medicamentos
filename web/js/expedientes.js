// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  expedientes.js · Simulación del recorrido de las órdenes de suministro
//  Cada ficha es una OS (color = contrato, anillo = semáforo). Con el reloj,
//  la ficha viaja por las etapas que calcula contratos.js (etapaOS):
//    Adquisiciones → proveedor → patio → andén → almacén → factura → pago
//  y los desvíos: mora, devolución, jurídico y rescate del segundo lugar.
//  Se puede reproducir, pausar, mover la línea de tiempo y seguir una OS.
// =====================================================================
import { initScenario } from './scenario-ui.js';
import { installInventory } from './network-sim.js';
import { Contratos, ETAPAS, DOCS, ESTADO_ES, mxn, fecha } from './contratos.js';

const DAY = 86400, H = 3600;
const BASE = Date.UTC(2026, 9, 26);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / H)).padStart(2, '0')}:${String(Math.floor(s % H / 60)).padStart(2, '0')}`; };
const fechaT = t => { const d = Math.floor(t / DAY); return `${WD[new Date(BASE + d * 864e5).getUTCDay()]} ${fecha(d)} ${hhmm(t)}`; };
const durTxt = s => (s < H ? `${Math.max(1, Math.round(s / 60))} min` : s < 2 * DAY ? `${(s / H).toFixed(s < 10 * H ? 1 : 0)} h` : `${(s / DAY).toFixed(1)} días`);
const COLORS = ['#2dd4bf', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#38bdf8', '#fb923c', '#4ade80'];
const SEM = { VERDE: '#22c55e', AMARILLO: '#facc15', NARANJA: '#f97316', ROJO: '#ef4444' };
const BAD = new Set(['MORA', 'RECHAZO', 'JURIDICO']);

// Diagrama: columnas de 150 px, fila principal arriba y desvíos abajo
const W = 1200, NW = 136, NH = 150, C = i => 8 + i * 149;
const NODES = {
  EMISION: [C(0), 40, 'main'], PROVEEDOR: [C(1), 40, 'main'], PATIO: [C(2), 40, 'main'], ANDEN: [C(3), 40, 'main'],
  ALMACEN: [C(4), 40, 'main'], FACTURA: [C(5), 40, 'main'], PAGO: [C(6), 40, 'main'], CERRADA: [C(7), 40, 'main'],
  MORA: [C(1), 262, 'alt'], RECHAZO: [C(3), 262, 'alt'], JURIDICO: [C(1), 470, 'alt'], SEGUNDO: [C(2), 470, 'alt'],
};
const EDGES = [
  ['EMISION', 'PROVEEDOR', 'acuse'], ['PROVEEDOR', 'PATIO', 'embarque'], ['PATIO', 'ANDEN', 'cita'], ['ANDEN', 'ALMACEN', 'aceptado'],
  ['ALMACEN', 'FACTURA', 'EBA'], ['FACTURA', 'PAGO', 'verificada'], ['PAGO', 'CERRADA', 'pagado'],
  ['PROVEEDOR', 'MORA', 'vence plazo', 'alt'], ['MORA', 'PATIO', 'entrega tardía', 'alt'], ['ANDEN', 'RECHAZO', 'rechazo', 'alt'],
  ['RECHAZO', 'PROVEEDOR', 'reposición', 'alt'], ['MORA', 'JURIDICO', 'imposibilidad', 'alt'], ['JURIDICO', 'SEGUNDO', 'reasignación', 'alt'],
  ['SEGUNDO', 'ANDEN', 'entrega de rescate', 'alt'], ['ALMACEN', 'PROVEEDOR', 'saldo pendiente', 'alt'], ['ALMACEN', 'MORA', 'saldo en mora', 'alt'],
];
const CAP_COLS = 7, CAP_ROWS = 5, R = 7.5, GAP = 18;

const S = { t: 0, speed: DAY, playing: true, filtro: '', inc: false, sel: null, node: null, last: new Map() };
let K, T, D0, tokens = new Map(), svg, gTok, gTrail;

init().catch(err => { console.error(err); $('loading').textContent = 'No se pudo calcular: ' + (err.message || err); });

async function init() {
  initScenario();
  const qs = new URLSearchParams(location.search);
  T = qs.has('t') ? Math.max(0, +qs.get('t')) : 8 * H;
  $('go-cedis').href = `index.html?t=${Math.floor(T)}`;
  $('go-contracts').href = `contratos.html?t=${Math.floor(T)}`;
  const [data, cat] = await Promise.all(['assets/unidades_hidalgo.json', 'assets/medicamentos.json'].map(u => fetch(u).then(r => r.json())));
  await new Promise(r => setTimeout(r, 30));
  K = new Contratos(installInventory(data, cat), cat);
  window.__exp = { K, S };
  D0 = K.vigencia.desde * DAY;
  S.t = qs.has('desde') ? +qs.get('desde') : Math.max(D0, T - 30 * DAY);
  if (qs.get('os')) S.sel = K.os.find(o => o.id === qs.get('os')) || null;

  const sel = $('f-k');
  K.contratos.forEach((k, i) => sel.insertAdjacentHTML('beforeend', `<option value="${k.id}">${k.id} · ${esc(k.prov)}</option>`));
  sel.addEventListener('change', () => { S.filtro = sel.value; update(true); });
  $('f-inc').addEventListener('change', e => { S.inc = e.target.checked; update(true); });
  $('legend').innerHTML = K.contratos.map((k, i) => `<span><i class="sw ck" style="background:${COLORS[i]}"></i>${k.id} · ${esc(k.objeto)}</span>`).join('') +
    `<span><i class="sw ck" style="background:transparent;border:2px solid ${SEM.ROJO}"></i>anillo = semáforo de la OS</span>`;
  const tl = $('tl'); tl.min = D0; tl.max = T; tl.value = S.t;
  tl.addEventListener('input', () => { S.t = +tl.value; S.last.clear(); update(true, true); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => {
    S.speed = +b.dataset.s; document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', x === b));
  }));
  $('btn-play').addEventListener('click', () => setPlaying(!S.playing));
  $('btn-hoy').addEventListener('click', () => { S.t = T; setPlaying(false); update(true); });
  $('sel-x').addEventListener('click', () => { S.sel = null; S.node = null; update(true); });
  $('sel-next').addEventListener('click', () => {
    if (!S.sel) return;
    const nx = K.recorrido(S.sel).find(x => x.t0 > S.t + 60);
    if (nx) { S.t = Math.min(T, nx.t0 + 60); setPlaying(false); update(true); }
  });
  buildSVG();
  setPlaying(true);
  update(true, true);
  $('loading').hidden = true;
  let last = performance.now(), acc = 0;
  const loop = now => {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (S.playing) { S.t = Math.min(T, S.t + dt * S.speed); if (S.t >= T) setPlaying(false); }
    acc += dt;
    if (acc > 0.12) { acc = 0; update(false); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function setPlaying(p) {
  S.playing = p;
  $('btn-play').innerHTML = p
    ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  $('sim-status').textContent = p ? 'Reproduciendo' : S.t >= T ? 'En el corte' : 'En pausa';
  $('sim-status').classList.toggle('paused', !p);
}

// ---------------------------------------------------------------------
//  Diagrama
// ---------------------------------------------------------------------
const center = id => { const [x, y] = NODES[id]; return [x + NW / 2, y + NH / 2]; };
function edgePath(a, b) {
  const [ax, ay] = NODES[a], [bx, by] = NODES[b];
  const sameRow = ay === by;
  if (sameRow && bx > ax) return [`M${ax + NW},${ay + 70} L${bx - 4},${by + 70}`, (ax + NW + bx) / 2, ay + 64];
  if (a === 'RECHAZO' && b === 'PROVEEDOR') return [`M${ax},${ay + 40} C${ax - 40},${ay + 40} ${bx + NW / 2 + 30},${by + NH + 40} ${bx + NW / 2 + 22},${by + NH + 4}`, ax - 52, ay + 18];
  if (a === 'ALMACEN' && b === 'PROVEEDOR') return [`M${ax + 20},${ay} C${ax + 20},${ay - 34} ${bx + NW - 20},${by - 34} ${bx + NW - 20},${by - 4}`, (ax + bx + NW) / 2, ay - 30];
  if (a === 'ALMACEN' && b === 'MORA') return [`M${ax + 30},${ay + NH} C${ax + 30},${ay + NH + 120} ${bx + NW + 120},${by + 40} ${bx + NW + 4},${by + 40}`, ax - 30, ay + NH + 70];
  if (a === 'MORA' && b === 'PATIO') return [`M${ax + NW},${ay + 30} C${ax + NW + 40},${ay + 30} ${bx + 30},${by + NH + 40} ${bx + 30},${by + NH + 4}`, ax + NW + 4, ay + 6];
  if (a === 'SEGUNDO' && b === 'ANDEN') return [`M${ax + NW},${ay + 60} C${ax + NW + 60},${ay + 60} ${bx + NW / 2},${by + NH + 160} ${bx + NW / 2},${by + NH + 4}`, ax + NW + 10, ay + 52];
  if (bx === ax) return by > ay ? [`M${ax + NW / 2},${ay + NH} L${bx + NW / 2},${by - 4}`, ax + NW / 2 + 6, (ay + NH + by) / 2] : [`M${ax + NW / 2},${ay} L${bx + NW / 2},${by + NH + 4}`, ax + NW / 2 + 6, (ay + by + NH) / 2];
  return [`M${ax + NW},${ay + 70} L${bx - 4},${by + 70}`, (ax + NW + bx) / 2, ay + 64];
}
function buildSVG() {
  let s = `<svg viewBox="0 0 ${W} 640" role="img" aria-label="Flujo de expedientes">
    <defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgba(148,163,184,.55)"/></marker></defs>
    <text x="8" y="22" class="edge-l" style="font-size:11px">FLUJO NORMAL</text><text x="${C(1)}" y="250" class="edge-l" style="font-size:11px">DESVÍOS</text><g id="edges">`;
  for (const [a, b, l, alt] of EDGES) {
    const [d, lx, ly] = edgePath(a, b);
    s += `<path id="e-${a}-${b}" class="edge ${alt || ''}" d="${d}"/><text class="edge-l" x="${lx}" y="${ly}" text-anchor="middle">${l}</text>`;
  }
  s += '</g><g id="nodes">';
  for (const [id, [x, y, kind]] of Object.entries(NODES)) {
    const E = ETAPAS[id];
    s += `<g class="nd ${kind}${BAD.has(id) ? ' bad' : ''}" data-n="${id}">
      <rect class="box" x="${x}" y="${y}" width="${NW}" height="${NH}" rx="12"/>
      <text class="t" x="${x + 10}" y="${y + 20}">${esc(E.n)}</text>
      <text class="a" x="${x + 10}" y="${y + 35}">${esc(E.area)}</text>
      <text class="dc" x="${x + 10}" y="${y + NH - 8}">${E.docs.length ? 'doc. ' + E.docs.join(', ') : ''}</text>
      <text class="cnt" id="cnt-${id}" x="${x + NW - 10}" y="${y + NH - 7}">0</text>
      <text class="more" id="more-${id}" x="${x + NW - 34}" y="${y + NH - 8}" text-anchor="end"></text></g>`;
  }
  s += `</g><g id="trail"></g><g id="toks"></g>
    <g transform="translate(${C(4)},300)"><text class="edge-l" style="font-size:12px;fill:#8b98a5" x="0" y="0">Cada ficha es una orden de suministro (OS).</text>
    <text class="edge-l" style="font-size:12px;fill:#8b98a5" x="0" y="20">Color = contrato · anillo = semáforo (verde, amarillo, naranja, rojo).</text>
    <text class="edge-l" style="font-size:12px;fill:#8b98a5" x="0" y="40">Una OS multipartida vuelve a «Proveedor» mientras le falte saldo.</text>
    <text class="edge-l" style="font-size:12px;fill:#8b98a5" x="0" y="60">Toca una ficha para seguir su expediente paso a paso.</text></g></svg>`;
  $('flow').innerHTML = s;
  svg = $('flow').querySelector('svg'); gTok = svg.querySelector('#toks'); gTrail = svg.querySelector('#trail');
  svg.querySelectorAll('.nd').forEach(g => g.addEventListener('click', () => { S.node = g.dataset.n; S.sel = null; update(true); }));
}

// ---------------------------------------------------------------------
//  Fichas: posición = etapa de la OS en el instante S.t
// ---------------------------------------------------------------------
const color = os => COLORS[os.k.idx];
const incidencia = os => (os._inc ??= K.recorrido(os).some(x => BAD.has(x.etapa) || x.etapa === 'SEGUNDO'));
function slotPos(id, i) {
  const [x, y] = NODES[id];
  return [x + 16 + (i % CAP_COLS) * GAP, y + 52 + Math.floor(i / CAP_COLS) * GAP];
}
function update(force = false, jump = false) {
  const t = S.t;
  $('clock').textContent = fechaT(t);
  const tl = $('tl'); if (document.activeElement !== tl) tl.value = t;
  const groups = Object.fromEntries(Object.keys(NODES).map(k => [k, []]));
  const vis = [];
  for (const os of K.os) {
    if (os.tEmision > t) break;
    if (S.filtro && os.k.id !== S.filtro) continue;
    const e = K.etapaOS(os, t);
    if (!e) continue;
    if (S.inc && !incidencia(os)) continue;
    groups[e].push(os); vis.push([os, e]);
  }
  const keep = new Set();
  for (const [id, list] of Object.entries(groups)) {
    const cap = CAP_COLS * CAP_ROWS;
    const shown = list.length > cap ? list.slice(-(cap - 1)) : list;
    $('cnt-' + id).textContent = list.length;
    $('more-' + id).textContent = list.length > cap ? `+${list.length - shown.length}` : '';
    shown.forEach((os, i) => {
      keep.add(os.id);
      const [px, py] = slotPos(id, i);
      let tk = tokens.get(os.id);
      if (!tk) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'tok new'); g.dataset.os = os.id;
        g.innerHTML = `<circle r="${R}" fill="${color(os)}"/>`;
        g.style.transform = `translate(${px}px,${py}px)`;
        g.addEventListener('click', ev => { ev.stopPropagation(); S.sel = os; S.node = null; update(true); });
        g.addEventListener('mousemove', ev => tip(ev, os));
        g.addEventListener('mouseleave', () => { $('tip').hidden = true; });
        gTok.appendChild(g);
        requestAnimationFrame(() => g.classList.remove('new'));
        tk = { g, etapa: id, x: px, y: py, sem: '' };
        tokens.set(os.id, tk);
      } else if (tk.etapa !== id) {
        if (!jump) moved(os, tk.etapa, id);
        tk.etapa = id;
      }
      if (tk.x !== px || tk.y !== py) { tk.g.style.transform = `translate(${px}px,${py}px)`; tk.x = px; tk.y = py; }
      if (force || tk.semT === undefined || Math.abs(t - tk.semT) > 3 * H) {
        const sem = K.estadoOS(os, t).sem; tk.semT = t;
        if (sem !== tk.sem) { tk.g.firstChild.setAttribute('stroke', SEM[sem]); tk.sem = sem; }
      }
      tk.g.classList.toggle('sel', S.sel === os);
      tk.g.classList.toggle('dim', !!S.sel && S.sel !== os);
    });
  }
  for (const [id, tk] of tokens) if (!keep.has(id)) { tk.g.remove(); tokens.delete(id); }
  svg.querySelectorAll('.nd').forEach(g => g.classList.toggle('sel', g.dataset.n === S.node));
  drawTrail();
  if (force || !S._panelT || Math.abs(t - S._panelT) > H / 2) { renderPanel(groups); S._panelT = t; }
  const d = Math.floor(t / DAY);
  if (force || d !== S._statD) { S._statD = d; clearTimeout(S._statTO); S._statTO = setTimeout(renderStats, 60); }
}

function moved(os, from, to) {
  const e = svg.querySelector(`#e-${from}-${to}`);
  if (e) { e.classList.add('flash'); e.classList.toggle('bad', BAD.has(to)); clearTimeout(e._to); e._to = setTimeout(() => e.classList.remove('flash', 'bad'), 900); }
  const docs = ETAPAS[to].docs.map(n => DOCS[n]).filter(Boolean);
  const li = document.createElement('li');
  if (BAD.has(to)) li.className = 'bad';
  li.innerHTML = `<time>${fecha(Math.floor(S.t / DAY))} ${hhmm(S.t)}</time><span><b data-os="${os.id}" style="color:${color(os)}">${os.id}</b> · ${os.k.id}: ${esc(ETAPAS[from].n)} → <b>${esc(ETAPAS[to].n)}</b>${docs.length ? ` <small class="muted">${esc(docs.join(', '))}</small>` : ''}</span>`;
  li.querySelector('b').addEventListener('click', () => { S.sel = os; S.node = null; update(true); });
  const f = $('feed'); f.prepend(li); while (f.children.length > 60) f.lastChild.remove();
}

function tip(ev, os) {
  const e = K.estadoOS(os, S.t), el = $('tip');
  el.hidden = false;
  el.innerHTML = `<b>${os.id} · ${os.k.id} · ${esc(os.k.prov)}</b>${os.partidas.map(p => `<div class="r">${esc(p.m.n)}<em>${K.aceptadas(p, S.t).toLocaleString('es-MX')}/${p.q.toLocaleString('es-MX')}</em></div>`).join('')}
    <div class="r">Estado<em>${ESTADO_ES[e.estado]}</em></div>${e.pena ? `<div class="r">Pena devengada<em>${mxn(e.pena)}</em></div>` : ''}`;
  el.style.left = Math.min(innerWidth - 280, ev.clientX + 14) + 'px'; el.style.top = (ev.clientY + 14) + 'px';
}

function drawTrail() {
  gTrail.innerHTML = '';
  if (!S.sel) return;
  const steps = K.recorrido(S.sel).filter(x => x.t0 <= S.t);
  if (steps.length < 2) return;
  const pts = steps.map(x => center(x.etapa).join(',')).join(' ');
  gTrail.innerHTML = `<polyline class="trail" points="${pts}"/>`;
}

// ---------------------------------------------------------------------
//  Panel: expediente seguido o etapa seleccionada
// ---------------------------------------------------------------------
function renderPanel(groups) {
  const body = $('sel-body'), t = S.t;
  $('sel-x').hidden = !S.sel && !S.node;
  $('sel-next').hidden = !S.sel;
  if (S.sel) {
    const os = S.sel, e = K.estadoOS(os, t), rec = K.recorrido(os);
    const etapa = K.etapaOS(os, t, 0);
    $('sel-title').innerHTML = `<span style="color:${color(os)}">●</span> ${os.id} <small>${os.k.id} · ${esc(os.k.prov)}</small>`;
    const cur = rec.findIndex(x => t >= x.t0 && t < x.t1);
    body.innerHTML = `<div class="meta">
        <span>Emitida</span><b>${fechaT(os.tEmision)}</b>
        <span>Vence</span><b>${fecha(os.dLim)} (${os.plazo} días)</b>
        <span>Etapa actual</span><b>${t < os.tEmision ? 'aún no se emite' : esc(ETAPAS[etapa || 'CERRADA'].n)}</b>
        <span>Estado</span><b>${ESTADO_ES[e.estado]}${e.pena ? ' · pena ' + mxn(e.pena) : ''}</b>
        ${os.partidas.map(p => `<span>${esc(p.m.n)}</span><b>${K.aceptadas(p, t).toLocaleString('es-MX')}${p.rescate && t >= p.rescate.tArribo ? ` + ${p.rescate.q.toLocaleString('es-MX')} (2º lugar)` : ''} / ${p.q.toLocaleString('es-MX')} pzas</b>`).join('')}
      </div>
      <ol class="steps">${rec.map((x, i) => {
        const st = x.t0 > t ? 'future' : i === cur || (cur < 0 && i === rec.length - 1 && t >= x.t0) ? 'now' : 'done';
        const E = ETAPAS[x.etapa];
        const docs = E.docs.map(n => `${n} ${DOCS[n] || ''}`).join(' · ');
        const sla = x.slaTxt ? ` · plazo: ${esc(x.slaTxt)} <span class="${x.ok ? 'ok' : 'crit'}">${x.ok ? '✓' : 'fuera de plazo'}</span>` : '';
        return `<li class="${st}${BAD.has(x.etapa) || x.ok === false ? ' bad' : ''}"><div class="h"><b>${esc(E.n)}</b><time>${fechaT(x.t0)}</time></div>
          <div class="s">${esc(E.area)}${x.etapa !== 'CERRADA' ? ` · ${st === 'now' ? 'lleva ' + durTxt(t - x.t0) : durTxt(x.dur)}` : ''}${st === 'future' ? '' : sla}</div>
          ${docs ? `<div class="docs">${esc(docs)}</div>` : ''}</li>`;
      }).join('')}</ol>`;
    return;
  }
  if (S.node) {
    const list = groups[S.node] || [], E = ETAPAS[S.node];
    $('sel-title').innerHTML = `${esc(E.n)} <small>${esc(E.area)} · ${list.length} expediente${list.length === 1 ? '' : 's'}</small>`;
    body.innerHTML = list.length ? `<div class="list-os">${list.map(os => {
      const rec = K.recorrido(os), x = rec.find(r => t >= r.t0 && t < r.t1);
      return `<button data-os="${os.id}"><i style="background:${color(os)}"></i><b>${os.id}</b> ${os.k.id}<span>${x ? 'lleva ' + durTxt(t - x.t0) : ''}</span></button>`;
    }).join('')}</div>` : '<p class="muted">No hay expedientes en esta etapa en este momento.</p>';
    body.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.sel = K.os.find(o => o.id === b.dataset.os); S.node = null; update(true); }));
    return;
  }
  $('sel-title').textContent = 'Expediente';
  body.innerHTML = '<p class="muted">Toca una ficha para seguir su orden de suministro, o una etapa para ver qué expedientes hay en ella.</p>';
}

// ---------------------------------------------------------------------
//  Tiempo promedio en cada etapa (expedientes cerrados en los 90 días previos)
// ---------------------------------------------------------------------
function renderStats() {
  const t = S.t, acc = {};
  for (const os of K.os) {
    if (S.filtro && os.k.id !== S.filtro) continue;
    const c = K.cierreOS(os);
    if (c > t || c < t - 90 * DAY) continue;
    for (const x of K.recorrido(os)) {
      if (x.etapa === 'CERRADA') continue;
      const a = acc[x.etapa] ??= { n: 0, sum: 0, fuera: 0, os: new Set() };
      a.n++; a.sum += x.dur; if (x.ok === false) a.fuera++; a.os.add(os.id);
    }
  }
  const ids = Object.keys(NODES).filter(k => k !== 'CERRADA');
  $('stats').innerHTML = ids.map(id => {
    const a = acc[id];
    if (!a) return `<div><b>${esc(ETAPAS[id].n)}</b>sin paso en el periodo</div>`;
    return `<div class="${a.fuera ? 'bad' : ''}"><b>${esc(ETAPAS[id].n)}</b>promedio <em>${durTxt(a.sum / a.n)}</em> · ${a.os.size} OS${ETAPAS[id].sla ? ` · fuera de plazo <em>${a.fuera}</em>` : ''}</div>`;
  }).join('');
}

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-ui.js · Recorrido de referencia y contrarreferencia
//  Cada ficha es una referencia (color = unidad receptora, anillo = días
//  desde su creación contra la norma de 15 días). La ficha viaja por:
//    solicitud → validación → aceptación → cita → atención → contrarreferencia
//    → seguimiento → cierre natural
//  y por los desvíos: devuelta, sin respuesta, no acudió, urgencias, estudio
//  diferido, envío a otro nivel; y los cierres sin flujo normal: quemada,
//  no regresó, atendida sin cierre. El tablero separa lo que el sistema ve
//  de lo que realmente pasó.
// =====================================================================
import { initScenario } from './scenario-ui.js';
import { Referencias, ETAPAS, TERMINAL, DESVIO, REGLAS, CIERRE_ES, SISTEMA_ES, PRIO_ES, fecha } from './referencias.js';
import { esc, BAD, NODES, CAP_COLS, CAP_ROWS, R, GAP, center, slotPos, diagramaSVG } from './referencias-diagrama.js';

const DAY = 86400, H = 3600;
const BASE = Date.UTC(2026, 9, 26);
const $ = id => document.getElementById(id);
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / H)).padStart(2, '0')}:${String(Math.floor(s % H / 60)).padStart(2, '0')}`; };
const fechaT = t => { const d = Math.floor(t / DAY); return `${WD[new Date(BASE + d * 864e5).getUTCDay()]} ${fecha(d)} ${hhmm(t)}`; };
const durTxt = s => (s < H ? `${Math.max(1, Math.round(s / 60))} min` : s < 2 * DAY ? `${Math.round(s / H)} h` : `${Math.round(s / DAY)} días`);
const SEM = { VERDE: '#22c55e', AMARILLO: '#facc15', NARANJA: '#f97316', ROJO: '#ef4444', CRONICA: '#c084fc' };
const SEM_ES = { VERDE: '≤ 10 días', AMARILLO: '11–15 días', NARANJA: '16–30 días', ROJO: '31–90 días', CRONICA: '> 90 días' };

const S = { t: 0, speed: DAY, playing: true, filtro: '', vista: '', sel: null, node: null };
let K, T, D0, tokens = new Map(), svg, gTok, gTrail;

init().catch(err => { console.error(err); $('loading').textContent = 'No se pudo calcular: ' + (err.message || err); });

async function init() {
  initScenario();
  const qs = new URLSearchParams(location.search);
  const nacional = qs.get('red') === 'nacional';
  $(nacional ? 'm-nac' : 'm-hgo').classList.add('active');
  if (nacional) return (await import('./referencias-agregado.js')).iniciar();
  T = qs.has('t') ? Math.max(0, +qs.get('t')) : 8 * H;
  $('go-cedis').href = `index.html?t=${Math.floor(T)}`;
  $('go-contracts').href = `contratos.html?t=${Math.floor(T)}`;
  const data = await fetch('assets/unidades_hidalgo.json').then(r => r.json());
  await new Promise(r => setTimeout(r, 30));
  K = new Referencias(data, { corteDia: Math.floor(T / DAY) });
  window.__ref = { K, S };
  D0 = REGLAS.inicio * DAY;
  S.t = qs.has('desde') ? +qs.get('desde') : T - 45 * DAY;
  if (qs.get('ref')) S.sel = K.refs.find(r => r.id === qs.get('ref')) || null;

  const sel = $('f-rx');
  for (const u of K.receptoras) sel.insertAdjacentHTML('beforeend', `<option value="${u.id}">${esc(u.corto)}${u.fuera ? ' · fuera de región' : ''}</option>`);
  sel.addEventListener('change', () => { S.filtro = sel.value; update(true); });
  $('f-v').addEventListener('change', e => { S.vista = e.target.value; update(true); });
  $('legend').innerHTML = K.receptoras.map(u => `<span><i class="sw ck" style="background:${u.color}"></i>${esc(u.corto)}</span>`).join('') +
    Object.entries(SEM).map(([k, c]) => `<span><i class="sw ck" style="background:transparent;border:2px solid ${c}"></i>${SEM_ES[k]}</span>`).join('');
  const tl = $('tl'); tl.min = D0; tl.max = T; tl.value = S.t;
  tl.addEventListener('input', () => { S.t = +tl.value; update(true, true); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => {
    S.speed = +b.dataset.s; document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', x === b));
  }));
  $('btn-play').addEventListener('click', () => setPlaying(!S.playing));
  $('btn-hoy').addEventListener('click', () => { S.t = T; setPlaying(false); update(true); });
  $('sel-x').addEventListener('click', () => { S.sel = null; S.node = null; update(true); });
  $('sel-next').addEventListener('click', () => {
    if (!S.sel) return;
    const nx = S.sel.seg.find(x => x.t0 > S.t + 60);
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
function buildSVG() {
  const s = diagramaSVG(['Cada ficha es una referencia · color = unidad receptora.', `Anillo = días desde su creación (norma: ${REGLAS.plazoDias}).`,
    `Los cierres se ven ${REGLAS.archivarDias} días; «acum.» cuenta 90 días.`, 'Toca una ficha para seguir al paciente.']);
  $('flow').innerHTML = s;
  svg = $('flow').querySelector('svg'); gTok = svg.querySelector('#toks'); gTrail = svg.querySelector('#trail');
  svg.querySelectorAll('.nd').forEach(g => g.addEventListener('click', () => { S.node = g.dataset.n; S.sel = null; update(true); }));
}

// ---------------------------------------------------------------------
//  Fichas: posición = etapa de la referencia en el instante S.t
// ---------------------------------------------------------------------
const color = (r, t) => K.rx[K.rxAt(r, t)].color;
const incidencia = r => (r._inc ??= r.seg.some(x => DESVIO.has(x.etapa) || x.vuelta) || r.final !== 'CERRADA');
function pasaVista(r, t) {
  const v = S.vista;
  if (!v) return true;
  if (v === 'inc') return incidencia(r);
  const E = K.estado(r, t);
  if (v === 'sa15') return !E.atendida && E.edad > REGLAS.plazoDias;
  if (v === 'v2') return E.vueltas >= 2;
  if (v === 'cron') return E.real === 'EN_PROCESO' && E.edad > 90;
  if (v === 'rastro') return E.sistema === 'SIN_RASTRO';
  return true;
}
function update(force = false, jump = false) {
  const t = S.t;
  $('clock').textContent = fechaT(t);
  const tl = $('tl'); if (document.activeElement !== tl) tl.value = t;
  const groups = Object.fromEntries(Object.keys(NODES).map(k => [k, []]));
  for (const r of K.refs) {
    if (r.tCrea > t) break;
    if (S.filtro && !r.rxSet.has(S.filtro) && r.rx0 !== S.filtro) continue;
    const e = K.etapa(r, t);
    if (!e || !pasaVista(r, t)) continue;
    groups[e].push(r);
  }
  const keep = new Set();
  for (const [id, list] of Object.entries(groups)) {
    const cap = CAP_COLS * CAP_ROWS;
    const shown = list.length > cap ? list.slice(-(cap - 1)) : list;
    $('cnt-' + id).textContent = list.length;
    $('more-' + id).textContent = list.length > cap ? `+${list.length - shown.length}` : '';
    shown.forEach((r, i) => {
      keep.add(r.id);
      const [px, py] = slotPos(id, i);
      let tk = tokens.get(r.id);
      if (!tk) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'tok new'); g.dataset.ref = r.id;
        g.innerHTML = `<circle r="${R}" fill="${color(r, t)}"/>`;
        g.style.transform = `translate(${px}px,${py}px)`;
        g.addEventListener('click', ev => { ev.stopPropagation(); S.sel = r; S.node = null; update(true); });
        g.addEventListener('mousemove', ev => tip(ev, r));
        g.addEventListener('mouseleave', () => { $('tip').hidden = true; });
        gTok.appendChild(g);
        requestAnimationFrame(() => g.classList.remove('new'));
        tk = { g, etapa: id, x: px, y: py, sem: '', fill: '' };
        tokens.set(r.id, tk);
      } else if (tk.etapa !== id) {
        if (!jump) moved(r, tk.etapa, id);
        tk.etapa = id;
        const f = color(r, t); if (f !== tk.fill) { tk.g.firstChild.setAttribute('fill', f); tk.fill = f; }
      }
      if (tk.x !== px || tk.y !== py) { tk.g.style.transform = `translate(${px}px,${py}px)`; tk.x = px; tk.y = py; }
      if (force || tk.semT === undefined || Math.abs(t - tk.semT) > 6 * H) {
        const sem = K.estado(r, t).sem; tk.semT = t;
        if (sem !== tk.sem) { tk.g.firstChild.setAttribute('stroke', SEM[sem]); tk.sem = sem; }
      }
      tk.g.classList.toggle('sel', S.sel === r);
      tk.g.classList.toggle('dim', !!S.sel && S.sel !== r);
    });
  }
  for (const [id, tk] of tokens) if (!keep.has(id)) { tk.g.remove(); tokens.delete(id); }
  svg.querySelectorAll('.nd').forEach(g => g.classList.toggle('sel', g.dataset.n === S.node));
  drawTrail();
  if (force || !S._panelT || Math.abs(t - S._panelT) > H) { renderPanel(groups); S._panelT = t; }
  const d = Math.floor(t / DAY);
  if (force || d !== S._statD) { S._statD = d; clearTimeout(S._statTO); S._statTO = setTimeout(renderBoard, 60); }
}

function moved(r, from, to) {
  const e = svg.querySelector(`#e-${from}-${to}`);
  if (e) { e.classList.add('flash'); e.classList.toggle('bad', BAD.has(to)); clearTimeout(e._to); e._to = setTimeout(() => e.classList.remove('flash', 'bad'), 900); }
  const s = K.segAt(r, S.t), li = document.createElement('li');
  if (BAD.has(to)) li.className = 'bad';
  li.innerHTML = `<time>${fecha(Math.floor(S.t / DAY))} ${hhmm(S.t)}</time><span><b data-ref="${r.id}" style="color:${color(r, S.t)}">${r.id}</b> · ${esc(r.esp.n)}: ${esc(ETAPAS[from].n)} → <b>${esc(ETAPAS[to].n)}</b>${s.vuelta ? '<span class="tag v">vuelta</span>' : ''}${s.reg ? '' : '<span class="tag noreg">no registrado</span>'} <small class="muted">${esc(s.unidad || '')}${s.nota ? ' · ' + esc(s.nota) : ''}</small></span>`;
  li.querySelector('b').addEventListener('click', () => { S.sel = r; S.node = null; update(true); });
  const f = $('feed'); f.prepend(li); while (f.children.length > 60) f.lastChild.remove();
}

function tip(ev, r) {
  const E = K.estado(r, S.t), el = $('tip');
  el.hidden = false;
  el.innerHTML = `<b>${r.id} · ${esc(r.esp.n)}</b><div class="r">${esc(r.dx)}<em>${r.sexo} ${r.edad} a</em></div>
    <div class="r">${esc(r.emisora.corto)}<em>→ ${esc(K.rx[E.rx].corto)}</em></div>
    <div class="r">${E.atendida ? 'Atendida a los' : 'Sin atender desde hace'}<em>${Math.floor(E.dias)} días</em></div>
    <div class="r">Vueltas<em>${E.vueltas}</em></div><div class="r">En el sistema<em>${SISTEMA_ES[E.sistema]}</em></div>`;
  el.style.left = Math.min(innerWidth - 280, ev.clientX + 14) + 'px'; el.style.top = (ev.clientY + 14) + 'px';
}

function drawTrail() {
  gTrail.innerHTML = '';
  if (!S.sel) return;
  const steps = S.sel.seg.filter(x => x.t0 <= S.t);
  if (steps.length < 2) return;
  gTrail.innerHTML = `<polyline class="trail" points="${steps.map(x => center(x.etapa).join(',')).join(' ')}"/>`;
}

// ---------------------------------------------------------------------
//  Panel: referencia seguida o etapa seleccionada
// ---------------------------------------------------------------------
function renderPanel(groups) {
  const body = $('sel-body'), t = S.t;
  $('sel-x').hidden = !S.sel && !S.node;
  $('sel-next').hidden = !S.sel;
  if (S.sel) {
    const r = S.sel;
    if (t < r.tCrea) { $('sel-title').textContent = r.id; body.innerHTML = `<p class="muted">Esta referencia se crea el ${fechaT(r.tCrea)}.</p>`; return; }
    const E = K.estado(r, t), rec = r.seg, ruta = [r.emisora.corto, ...[...new Set(rec.filter(s => s.rx && s.t0 <= t).map(s => K.rx[s.rx].corto))]];
    const plazo = E.atendida ? (E.dias <= REGLAS.plazoDias ? '<span class="ok">en plazo</span>' : '<span class="crit">fuera de plazo</span>') : E.dias > REGLAS.plazoDias ? '<span class="crit">vencido</span>' : 'corriendo';
    $('sel-title').innerHTML = `<span style="color:${color(r, t)}">●</span> ${r.id} <small>${esc(r.esp.n)}</small>`;
    const cur = rec.findIndex(x => t >= x.t0 && t < x.t1);
    body.innerHTML = `<div class="meta">
        <span>Paciente</span><b>${r.sexo} · ${r.edad} años · ${esc(r.dx)}</b>
        <span>Prioridad</span><b>${PRIO_ES[r.prio] || '—'}</b>
        <span>Creada</span><b>${fechaT(r.tCrea)}</b>
        <span>Unidad que refiere</span><b>${esc(r.emisora.corto)}</b>
        <span>Receptora</span><b>${esc(K.rx[E.rx].nombre)}</b>
        <span>${E.atendida ? 'Atendida a los' : 'Días sin atender'}</span><b style="color:${SEM[E.sem]}">${Math.floor(E.dias)} días · ${plazo}</b>
        <span>Vueltas</span><b>${E.vueltas}</b>
        <span>Ruta</span><b>${ruta.map(esc).join(' → ')}</b>
        <span>Lo que pasó</span><b>${CIERRE_ES[E.real]}</b>
        <span>En el sistema</span><b class="${E.sistema === 'SIN_RASTRO' ? 'crit' : ''}">${SISTEMA_ES[E.sistema]}</b>
      </div>
      <ol class="steps">${rec.map((x, i) => {
        const st = x.t0 > t ? 'future' : i === cur || (cur < 0 && i === rec.length - 1 && t >= x.t0) ? 'now' : 'done';
        const Et = ETAPAS[x.etapa], dur = st === 'now' ? 'lleva ' + durTxt(t - x.t0) : TERMINAL.has(x.etapa) ? '' : durTxt(x.t1 - x.t0);
        return `<li class="${st}${BAD.has(x.etapa) ? ' bad' : ''}"><div class="h"><b>${esc(Et.n)}${x.vuelta ? '<span class="tag v">vuelta</span>' : ''}${x.reg ? '' : '<span class="tag noreg">no registrado</span>'}</b><time>${fechaT(x.t0)}</time></div>
          <div class="s">${esc(x.unidad || '')}${dur ? ' · ' + dur : ''}${x.nota ? ' · ' + esc(x.nota) : ''}</div>
          ${Et.docs.length ? `<div class="docs">${esc(Et.docs.join(' · '))}</div>` : ''}</li>`;
      }).join('')}</ol>`;
    return;
  }
  if (S.node) {
    const list = groups[S.node] || [], E = ETAPAS[S.node];
    $('sel-title').innerHTML = `${esc(E.n)} <small>${esc(E.area)} · ${list.length} referencia${list.length === 1 ? '' : 's'}</small>`;
    body.innerHTML = list.length ? `<div class="list-os">${list.map(r => {
      const x = K.segAt(r, t), Er = K.estado(r, t);
      return `<button data-ref="${r.id}"><i style="background:${color(r, t)}"></i><span class="tx"><b>${r.id}</b> ${esc(r.esp.n)}<small>${esc(x.unidad || '')}</small></span><span style="color:${SEM[Er.sem]}">${Math.floor(Er.edad)} d</span></button>`;
    }).join('')}</div>` : '<p class="muted">No hay referencias en esta etapa en este momento.</p>';
    body.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.sel = K.refs.find(o => o.id === b.dataset.ref); S.node = null; update(true); }));
    return;
  }
  $('sel-title').textContent = 'Referencia';
  body.innerHTML = '<p class="muted">Toca una ficha para seguir a ese paciente referido, o una etapa para ver qué referencias hay en ella.</p>';
}

// ---------------------------------------------------------------------
//  Tablero de seguimiento
// ---------------------------------------------------------------------
const pct = (a, b) => (b ? Math.round(100 * a / b) + ' %' : '—');
function listRef(el, items, sub) {
  el.innerHTML = items.length ? items.slice(0, 40).map(([r, E]) => `<button data-ref="${r.id}"><i style="background:${K.rx[E.rx].color}"></i>
    <span class="tx"><b>${r.id}</b> ${esc(r.esp.n)}<small>${esc(sub(r, E))}</small></span><span style="color:${SEM[E.sem]}">${Math.floor(E.edad)} d</span></button>`).join('')
    : '<p class="muted">Ninguna en este momento.</p>';
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.sel = K.refs.find(o => o.id === b.dataset.ref); S.node = null; S.t = Math.min(S.t, T); update(true); document.getElementById('sel-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }));
}
function renderBoard() {
  const t = S.t, B = K.tablero(t, S.filtro), A = B.abiertas, tot = A.a15 + A.a30 + A.a90 + A.cron;
  $('tb-sub').textContent = `al ${fechaT(t)}${S.filtro ? ' · ' + K.rx[S.filtro].corto : ''} · tasas de los últimos 90 días`;
  for (const id of TERMINAL) { const el = $('acc-' + id); if (el) el.textContent = `acum. ${B.cierres[id]}`; }
  const bar = [[A.a15, SEM.VERDE], [A.a30, SEM.NARANJA], [A.a90, SEM.ROJO], [A.cron, SEM.CRONICA]].map(([n, c]) => `<i style="width:${tot ? 100 * n / tot : 0}%;background:${c}"></i>`).join('');
  const cier = B.cierres, nc = cier.CERRADA + cier.SIN_CIERRE + cier.ABANDONO + cier.QUEMADA;
  const enP = B.atendidas ? B.enPlazo / B.atendidas : null;
  $('kpis').innerHTML = `
    <div><b>Referencias abiertas</b><span class="big">${tot}</span><div class="rf-bar">${bar}</div>
      <div class="rows"><span>≤ 15 días</span><em>${A.a15}</em><span>16 a 30 días</span><em>${A.a30}</em><span>31 a 90 días</span><em>${A.a90}</em><span>Crónicas · más de 90</span><em>${A.cron}</em></div></div>
    <div class="${enP !== null && enP < 0.5 ? 'bad' : 'ok'}"><b>Atendidas en ≤ ${REGLAS.plazoDias} días</b><span class="big">${pct(B.enPlazo, B.atendidas)}</span>
      <div class="rows"><span>Atendidas (90 d)</span><em>${B.atendidas}</em><span>Mediana a la atención</span><em>${B.medAt === null ? '—' : Math.round(B.medAt) + ' d'}</em><span>Sin atender &gt; ${REGLAS.plazoDias} d (ahora)</span><em>${B.sinAtender15}</em></div></div>
    <div><b>Aceptación de la receptora</b><span class="big">${B.medAcep === null ? '—' : B.medAcep.toFixed(1) + ' d'}</span>
      <div class="rows"><span>Aceptadas a la primera</span><em>${pct(B.acepPrimera, B.acepTotal)}</em><span>Sin respuesta (ahora)</span><em>${B.limbo}</em></div></div>
    <div class="${cier.SIN_CIERRE + cier.ABANDONO + cier.QUEMADA > cier.CERRADA ? 'bad' : 'warn'}"><b>Cómo terminan (90 d)</b><span class="big">${pct(cier.CERRADA, nc)} <small style="font-size:12px;font-weight:500">natural</small></span>
      <div class="rows"><span>Cierre natural</span><em>${cier.CERRADA}</em><span>Atendida sin cierre</span><em>${cier.SIN_CIERRE}</em><span>No regresó</span><em>${cier.ABANDONO}</em><span>Quemada</span><em>${cier.QUEMADA}</em></div></div>
    <div class="bad"><b>Sin rastro en el sistema</b><span class="big">${B.sistema.SIN_RASTRO}</span>
      <div class="rows"><span>Sin movimiento registrado más de ${REGLAS.sinRastroDias} días después de lo esperado</span><em></em></div></div>
    <div class="warn"><b>Dan vueltas</b><span class="big">${B.vueltas.length}</span>
      <div class="rows"><span>Con 2 o más rebotes</span><em></em><span>Máximo de vueltas</span><em>${B.vueltas[0]?.[1].vueltas ?? 0}</em></div></div>`;
  listRef($('l-cron'), B.cronicas, (r, E) => `${E.atendida ? 'En tratamiento' : 'Sin atender'} · ${ETAPAS[E.etapa].n} · ${E.seg.unidad || ''}`);
  listRef($('l-vue'), B.vueltas, (r, E) => `${E.vueltas} vueltas · ${[r.emisora.corto, ...[...new Set(r.seg.filter(s => s.rx && s.t0 <= t).map(s => K.rx[s.rx].corto))]].join(' → ')}`);
  const O = B.ocultas, sumO = O.SIN_CIERRE + O.ABANDONO + O.QUEMADA + O.CERRADA;
  $('l-sis').innerHTML = `
    <div class="r"><span>El sistema las ve <b>en proceso</b></span><em>${B.sistema.EN_PROCESO}</em></div>
    <div class="r bad"><span>El sistema las ve <b>sin rastro</b></span><em>${B.sistema.SIN_RASTRO}</em></div>
    <div class="r"><span>El sistema registró el cierre (90 d)</span><em>${B.sistema.CERRADA}</em></div>
    <div class="r bad"><span>Ya terminaron, pero el sistema las ve abiertas</span><em>${sumO}</em></div>
    <p>De esas ${sumO}: <b>${O.SIN_CIERRE}</b> se atendieron y nadie cerró, <b>${O.ABANDONO}</b> el paciente no regresó, <b>${O.QUEMADA}</b> se quemaron y <b>${O.CERRADA}</b> sí cerraron pero no se registró.</p>`;
  $('t-rx').innerHTML = `<table><thead><tr><th>Unidad receptora</th><th>Abiertas</th><th>Sin atender &gt; ${REGLAS.plazoDias} d</th><th>Sin respuesta</th><th>Atendidas sin cierre (90 d)</th><th>Sin rastro</th></tr></thead><tbody>${K.receptoras.map(u => {
    const P = B.porRx[u.id];
    return `<tr><td><i style="background:${u.color}"></i>${esc(u.corto)}${u.fuera ? ' <span class="tag">fuera de región</span>' : ''}</td><td>${P.abiertas}</td><td class="${P.sinAtender15 ? 'bad' : ''}">${P.sinAtender15}</td><td>${P.limbo}</td><td>${P.sinCierre}</td><td class="${P.sinRastro ? 'bad' : ''}">${P.sinRastro}</td></tr>`;
  }).join('')}</tbody></table>`;
}

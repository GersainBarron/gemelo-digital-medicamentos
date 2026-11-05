// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-agregado.js · Recorrido nacional de referencias (1,033 unidades)
//  Mismo diagrama que la vista de Hidalgo, pero agregado (minería de procesos):
//   · cada nodo: número, barra de antigüedad y puntos donde 1 punto = N referencias
//   · cada flecha: grosor = pasos por día (últimos 7 días)
//   · partículas que recorren las flechas al avanzar el día (1 partícula = N)
//   · filtros por región (16) y estado (32); tablero calculado en el worker
//  El motor y el cubo diario viven en referencias-worker.js.
// =====================================================================
import { ETAPAS, TERMINAL, REGLAS, CIERRE_ES, SISTEMA_ES, REGIONES, fecha, semaforo } from './referencias.js';
import { Cubo, ET, EDAD_ES, EDADES } from './referencias-cubo.js';
import { esc, BAD, NODES, EDGES, NW, CAP_COLS, CAP_ROWS, R, slotPos, edgeD, diagramaSVG } from './referencias-diagrama.js';
import { MapaFlujos } from './referencias-mapa.js';

const DAY = 86400, H = 3600;
const BASE = Date.UTC(2026, 9, 26);
const $ = id => document.getElementById(id);
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const nf = new Intl.NumberFormat('es-MX');
const fechaD = d => `${WD[new Date(BASE + d * 864e5).getUTCDay()]} ${fecha(d)}`;
const durTxt = s => (s < H ? `${Math.max(1, Math.round(s / 60))} min` : s < 2 * DAY ? `${Math.round(s / H)} h` : `${Math.round(s / DAY)} días`);
/** colores por antigüedad (mismo orden que EDADES del cubo) */
const EDAD_C = ['#22c55e', '#facc15', '#f97316', '#ef4444', '#c084fc'];
const SEM = { VERDE: '#22c55e', AMARILLO: '#facc15', NARANJA: '#f97316', ROJO: '#ef4444', CRONICA: '#c084fc' };
const SAT_ES = { VERDE: 'fluye', AMARILLO: 'presión', NARANJA: 'saturada', ROJO: 'colapsada' };
const ESCALAS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const CAP = CAP_COLS * CAP_ROWS;
const NS = 'http://www.w3.org/2000/svg';

const S = { t: 0, speed: DAY, playing: true, f: {}, node: null, ref: null, uni: null, dia: -1, N: 1, tb: null, pidiendo: false };
let C, T, D0, worker, svg, gTok, paths = {}, parts = [], mapa = null, RED = null;

export async function iniciar() {
  const qs = new URLSearchParams(location.search);
  T = qs.has('t') ? Math.max(0, +qs.get('t')) : 8 * H;
  document.title = 'Referencia y contrarreferencia · Red nacional ISSSTE';
  document.querySelector('.brand-text b').textContent = 'Referencia y contrarreferencia · red nacional';
  document.querySelector('.brand-text span').innerHTML = 'Gemelo digital · <em class="author">Gersain Barron</em> · 1,033 unidades ISSSTE, agregado por etapa';
  $('loading').textContent = 'Armando la red nacional (≈ 34 mil referencias)…';
  for (const id of ['f-rx', 'f-v']) $(id).hidden = true;
  for (const id of ['f-reg', 'f-est']) $(id).hidden = false;
  $('t-rx-h').textContent = 'Receptoras más saturadas';

  worker = new Worker('js/referencias-worker.js', { type: 'module' });
  const [r, geo, red] = await Promise.all([
    pedir({ tipo: 'armar', url: new URL('assets/estados_issste.json', location.href).href, corteDia: Math.floor(T / DAY) }, 'cubo'),
    fetch('assets/estados_mx.json').then(x => x.json()),
    fetch('assets/estados_issste.json').then(x => x.json()),
  ]);
  C = Cubo.from(r.cubo);
  RED = red;
  for (const e of red.estados) ESTADOS[e.cve] = e.nombre;
  window.__refNac = { C, S, worker };
  D0 = C.meta.d0 * DAY;
  S.t = qs.has('desde') ? +qs.get('desde') : T - 45 * DAY;

  // filtros
  const fr = $('f-reg'), fe = $('f-est');
  fr.innerHTML = '<option value="">Todo el país</option>' + REGIONES.filter(x => C.meta.region.includes(x)).map(x => `<option value="${x}">Región ${x}</option>`).join('');
  const llenarEstados = () => {
    const reg = fr.value;
    fe.innerHTML = '<option value="">Todos los estados</option>' + C.meta.estados.map((c, i) => [c, i]).filter(([, i]) => !reg || C.meta.region[i] === reg)
      .map(([c]) => `<option value="${c}">${esc(nombreEstado(c))}</option>`).join('');
  };
  llenarEstados();
  fr.addEventListener('change', () => { llenarEstados(); S.f = fr.value ? { region: fr.value } : {}; refrescar(); });
  fe.addEventListener('change', () => { S.f = fe.value ? { cve: fe.value } : fr.value ? { region: fr.value } : {}; refrescar(); });

  $('legend').innerHTML = EDAD_ES.map((e, i) => `<span><i class="sw ck" style="background:${EDAD_C[i]}"></i>${e} desde su creación</span>`).join('') +
    '<span id="lg-n"></span><span>grosor de flecha = pasos por día (7 días)</span>';
  const tl = $('tl'); tl.min = D0; tl.max = T; tl.step = DAY; tl.value = S.t;
  tl.addEventListener('input', () => { S.t = +tl.value; limpiarParticulas(); update(true); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => {
    S.speed = +b.dataset.s; document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', x === b));
  }));
  $('btn-play').addEventListener('click', () => setPlaying(!S.playing));
  $('btn-hoy').addEventListener('click', () => { S.t = T; setPlaying(false); update(true); });
  $('sel-x').addEventListener('click', () => { if (S.ref || S.node) { S.ref = null; S.node = null; } else salirUnidad(); panel(); });
  $('sel-next').hidden = true;

  // mapa de flujos
  $('mapa-card').hidden = false;
  mapa = new MapaFlujos($('mapa'), C, geo, red, {
    select: n => {
      if (n.tipo === 'estado') return ponerFiltro({ cve: n.cve });
      if (n.tipo === 'rx') return seleccionarUnidad({ tipo: 'rx', key: n.key, x: n.x, id: C.meta.rx[n.x].id, nombre: C.meta.rx[n.x].nombre });
      if (n.tipo === 'em') return seleccionarUnidad({ tipo: 'em', key: n.key, idx: n.idx, id: C.meta.em[n.idx].id, nombre: C.meta.em[n.idx].corto });
    },
    hover: (n, ev) => tipMapa(n, ev),
  });
  window.__refNac.mapa = mapa;
  $('m-ven').addEventListener('change', e => { mapa.ventana = +e.target.value; $('mapa-sub').textContent = `envíos de los últimos ${e.target.value} días`; mapa.set(S.dia, S.f, S.uni?.key); });
  $('m-top').addEventListener('change', e => { mapa.top = +e.target.value; mapa.set(S.dia, S.f, S.uni?.key); });
  $('m-up').addEventListener('click', () => ponerFiltro({}));

  $('flow').innerHTML = diagramaSVG(['Cada punto = N referencias (ver leyenda).', 'Color del punto = antigüedad desde la creación.',
    `Los cierres se ven ${REGLAS.archivarDias} días; «acum.» cuenta 90 días.`, 'Toca una etapa para ver estados y receptoras.']);
  svg = $('flow').querySelector('svg'); gTok = svg.querySelector('#toks');
  for (const E of EDGES) paths[E[0] + '>' + E[1]] = svg.querySelector(`#e-${E[0]}-${E[1]}`);
  svg.querySelectorAll('.nd').forEach(g => g.addEventListener('click', () => { S.node = g.dataset.n; S.ref = null; panel(); }));
  $('sel-title').textContent = 'Red nacional';
  setPlaying(true);
  update(true);
  $('loading').hidden = true;
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (S.playing) { S.t = Math.min(T, S.t + dt * S.speed); if (S.t >= T) setPlaying(false); }
    update(false);
    animarParticulas(now);
    mapa.draw(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const nombreEstado = cve => (C.meta.nombres?.[cve]) || ESTADOS[cve] || cve;
const ESTADOS = { '01': 'Aguascalientes', '02': 'Baja California', '03': 'Baja California Sur', '04': 'Campeche', '05': 'Coahuila', '06': 'Colima', '07': 'Chiapas', '08': 'Chihuahua', '09': 'Ciudad de México', '10': 'Durango', '11': 'Guanajuato', '12': 'Guerrero', '13': 'Hidalgo', '14': 'Jalisco', '15': 'Estado de México', '16': 'Michoacán', '17': 'Morelos', '18': 'Nayarit', '19': 'Nuevo León', '20': 'Oaxaca', '21': 'Puebla', '22': 'Querétaro', '23': 'Quintana Roo', '24': 'San Luis Potosí', '25': 'Sinaloa', '26': 'Sonora', '27': 'Tabasco', '28': 'Tamaulipas', '29': 'Tlaxcala', '30': 'Veracruz', '31': 'Yucatán', '32': 'Zacatecas' };

/** mensaje al worker y espera la respuesta del tipo indicado */
function pedir(msg, tipo) {
  return new Promise((ok, ko) => {
    const h = e => {
      if (e.data.tipo === 'error') { worker.removeEventListener('message', h); ko(new Error(e.data.mensaje)); }
      else if (e.data.tipo === tipo) { worker.removeEventListener('message', h); ok(e.data); }
    };
    worker.addEventListener('message', h);
    worker.postMessage(msg);
  });
}

function setPlaying(p) {
  S.playing = p;
  $('btn-play').innerHTML = p
    ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  $('sim-status').textContent = p ? 'Reproduciendo' : S.t >= T ? 'En el corte' : 'En pausa';
  $('sim-status').classList.toggle('paused', !p);
}

function refrescar() { limpiarParticulas(); S.dia = -1; S.tb = null; update(true); panel(); }

/** cambia el filtro de región/estado y sincroniza los selectores */
function ponerFiltro(f) {
  const fr = $('f-reg'), fe = $('f-est');
  fr.value = f.cve ? C.meta.region[C.IE[f.cve]] : f.region || '';
  fr.dispatchEvent(new Event('change'));
  if (f.cve) { fe.value = f.cve; fe.dispatchEvent(new Event('change')); }
}

// ---------------------------------------------------------------------
//  Detalle de una unidad (nivel 2): una ficha = una referencia de esa unidad
// ---------------------------------------------------------------------
function segAt(r, t) { const g = r.seg; let lo = 0, hi = g.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; } return g[lo]; }
function etapaLocal(r, t) {
  if (t < r.tCrea) return null;
  const s = segAt(r, t);
  return TERMINAL.has(s.etapa) && t >= s.t0 + REGLAS.archivarDias * DAY ? null : s.etapa;
}
function seleccionarUnidad(u) {
  S.uni = { ...u, refs: null, t: -1 }; S.ref = null; S.node = null;
  limpiarParticulas();
  pedirUnidad(true);
  mapa.set(S.dia, S.f, u.key);
  panel();
}
function salirUnidad() { S.uni = null; S.dia = -1; update(true); }
async function pedirUnidad(force = false) {
  const u = S.uni;
  if (!u || u.pidiendo || (!force && Math.abs(u.t - S.t) < DAY / 2)) return;
  u.pidiendo = true;
  try {
    const r = await pedir({ tipo: 'refs', id: u.id, t: S.t, max: 3000 }, 'refs');
    if (S.uni !== u) return;
    u.refs = r.refs; u.t = r.t;
    dibujarUnidad(); panel();
  } finally { u.pidiendo = false; }
}
function dibujarUnidad() {
  const u = S.uni;
  if (!u || !u.refs) return;
  const t = S.t, grupos = Object.fromEntries(Object.keys(NODES).map(k => [k, []]));
  for (const r of u.refs) { const e = etapaLocal(r, t); if (e) grupos[e].push(r); }
  let s = '';
  for (const [k, list] of Object.entries(grupos)) {
    $('cnt-' + k).textContent = nf.format(list.length);
    const bk = new Array(EDADES.length + 1).fill(0);
    list.forEach((r, i) => {
      const edad = (t - r.tCrea) / DAY;
      let b = 0; while (b < EDADES.length && edad >= EDADES[b]) b++;
      bk[b]++;
      if (i >= CAP - (list.length > CAP ? 1 : 0)) return;
      const [x, y] = slotPos(k, i), dias = (Math.min(t, r.tAtencion) - r.tCrea) / DAY;
      s += `<circle class="utok" data-ref="${r.id}" cx="${x}" cy="${y}" r="${R}" fill="${EDAD_C[b]}" stroke="${SEM[semaforo(dias)]}" stroke-width="2"><title>${r.id} · ${esc(r.esp.n)} · ${Math.floor(edad)} días</title></circle>`;
    });
    $('more-' + k).textContent = list.length > CAP ? `+${list.length - CAP + 1}` : '';
    let x = 0, bar = '';
    for (let b = 0; b < bk.length; b++) { const w = list.length ? (NW - 20) * bk[b] / list.length : 0; if (w > 0) bar += `<rect x="${x}" y="0" width="${w}" height="5" rx="1.5" fill="${EDAD_C[b]}"/>`; x += w; }
    $('bar-' + k).innerHTML = bar;
  }
  gTok.innerHTML = s;
  gTok.querySelectorAll('.utok').forEach(c => c.addEventListener('click', ev => { ev.stopPropagation(); abrirRef(c.dataset.ref); }));
  $('lg-n').innerHTML = `<i class="sw ck" style="background:#cbd5e1"></i>1 ficha = 1 referencia de ${esc(u.nombre)}`;
}
function panelUnidad() {
  const u = S.uni, body = $('sel-body'), di = S.dia;
  $('sel-title').innerHTML = `${esc(u.nombre)} <small>${u.tipo === 'rx' ? 'unidad receptora' : 'unidad que refiere'}</small>`;
  const s = u.tipo === 'rx' ? C.saturacion(di, u.x, mapa.ventana) : null;
  const vivas = u.refs ? u.refs.filter(r => etapaLocal(r, S.t)) : [];
  const orden = [...vivas].sort((a, b) => a.tCrea - b.tCrea).slice(0, 40);
  body.innerHTML = `<div class="rf-uni"><span>El diagrama muestra solo las referencias de esta unidad.</span><button id="u-x" class="btn">Salir</button></div>
    ${s ? `<div class="meta">
      <span>Saturación</span><b style="color:${SEM[s.sem]}">${SAT_ES[s.sem]}</b>
      <span>Lista de espera</span><b>${nf.format(s.L)}</b>
      <span>Entran / salen por semana</span><b>${s.lambdaSem.toFixed(1)} / ${s.salidasSem.toFixed(1)}</b>
      <span>Atendidas por semana</span><b>${s.muSem.toFixed(1)}</b>
      <span>Utilización ρ</span><b>${Number.isFinite(s.rho) ? s.rho.toFixed(2) : '—'}</b>
      <span>Espera estimada (Little)</span><b>${Number.isFinite(s.W) ? Math.round(s.W) + ' días' : 'sin salidas'}</b>
      <span>Sin respuesta</span><b>${nf.format(s.limbo)}</b>
      <span>En atención</span><b>${nf.format(s.enAtencion)}</b>
    </div>` : ''}
    <h4 class="rf-h4">${u.refs ? `${nf.format(vivas.length)} referencias vivas · las más antiguas` : 'Cargando referencias…'}</h4>
    <div class="list-os">${orden.map(r => {
      const e = etapaLocal(r, S.t), edad = (S.t - r.tCrea) / DAY, dias = (Math.min(S.t, r.tAtencion) - r.tCrea) / DAY;
      return `<button data-ref="${r.id}"><i style="background:${SEM[semaforo(dias)]}"></i><span class="tx"><b>${r.id}</b> ${esc(r.esp.n)}<small>${esc(ETAPAS[e].n)} · ${esc(segAt(r, S.t).unidad || '')}</small></span><span>${Math.floor(edad)} d</span></button>`;
    }).join('')}</div>`;
  $('u-x').addEventListener('click', () => { salirUnidad(); panel(); });
  body.querySelectorAll('[data-ref]').forEach(b => b.addEventListener('click', () => abrirRef(b.dataset.ref)));
}

// ---------------------------------------------------------------------
//  Tooltip del mapa
// ---------------------------------------------------------------------
function tipMapa(n, ev) {
  const el = $('mapa-tip');
  if (!n) { el.hidden = true; return; }
  const box = $('mapa').getBoundingClientRect();
  const W = Number.isFinite(n.W) ? Math.round(n.W) + ' d' : '—';
  el.innerHTML = n.tipo === 'em'
    ? `<b>${esc(n.nombre)}</b><div class="r">Unidad que refiere<em>${esc(nombreEstado(n.cve))}</em></div><div class="r">Toca para ver sus referencias<em></em></div>`
    : `<b>${esc(n.tipo === 'estado' ? n.nombre : n.corto)}</b>${n.tipo === 'estado' ? `<div class="r">Receptoras<em>${n.nRx}</em></div>` : `<div class="r">${esc(nombreEstado(n.cve))}${n.fuera ? ' · fuera del filtro' : ''}<em></em></div>`}
      <div class="r">Lista de espera<em>${nf.format(n.L)}</em></div><div class="r">Entran / salen por semana<em>${n.ent.toFixed(1)} / ${n.sal.toFixed(1)}</em></div>
      <div class="r">Espera estimada<em>${W}</em></div><div class="r">Saturación<em style="color:${SEM[n.sem]}">${SAT_ES[n.sem]}</em></div>`;
  el.hidden = false;
  el.style.left = Math.min(box.width - 260, ev.clientX - box.left + 14) + 'px';
  el.style.top = Math.min(box.height - 150, ev.clientY - box.top + 14) + 'px';
}

// ---------------------------------------------------------------------
//  Cada día: nodos, puntos, barras, flechas y partículas
// ---------------------------------------------------------------------
function update(force) {
  const t = S.t, di = C.dia(t), d = C.meta.d0 + di;
  $('clock').textContent = fechaD(Math.floor(t / DAY)) + ' 08:00';
  const tl = $('tl'); if (document.activeElement !== tl) tl.value = t;
  if (di === S.dia && !force) return;
  const salto = S.dia >= 0 && di === S.dia + 1;
  S.dia = di;
  const E = C.etapas(di, S.f), tot = Object.fromEntries(ET.map(k => [k, E[k].reduce((a, b) => a + b, 0)]));
  // escala: el nodo más lleno (que no sea un cierre) cabe en sus 28 lugares
  const max = Math.max(1, ...ET.filter(k => !TERMINAL.has(k)).map(k => tot[k]));
  S.N = ESCALAS.find(n => n * CAP >= max) || ESCALAS.at(-1);
  $('lg-n').innerHTML = `<i class="sw ck" style="background:#cbd5e1"></i>1 punto = ${nf.format(S.N)} referencia${S.N > 1 ? 's' : ''}`;
  const acum = C.resumen(di, S.f, 90), tiempos = C.tiempos(di, S.f, 28);
  gTok.innerHTML = '';
  let dots = '';
  for (const k of Object.keys(NODES)) {
    const n = tot[k], bk = E[k];
    $('cnt-' + k).textContent = nf.format(n);
    // puntos: se reparten por antigüedad, de la más nueva a la más vieja
    const np = Math.min(CAP, Math.ceil(n / S.N));
    let i = 0;
    for (let b = 0; b < bk.length && i < np; b++) {
      const q = Math.round(np * bk[b] / (n || 1)) || (bk[b] > 0 && i < np ? 1 : 0);
      for (let j = 0; j < q && i < np; j++, i++) { const [x, y] = slotPos(k, i); dots += `<circle cx="${x}" cy="${y}" r="${R - 1.5}" fill="${EDAD_C[b]}"/>`; }
    }
    $('more-' + k).textContent = '';
    // barra de antigüedad
    let x = 0, bar = '';
    for (let b = 0; b < bk.length; b++) { const w = n ? (NW - 20) * bk[b] / n : 0; if (w > 0) bar += `<rect x="${x}" y="0" width="${w}" height="5" rx="1.5" fill="${EDAD_C[b]}"/>`; x += w; }
    $('bar-' + k).innerHTML = bar;
    const acc = $('acc-' + k);
    if (TERMINAL.has(k)) acc.textContent = `acum. ${nf.format(acum[k] ?? 0)}`;
    else acc.textContent = tiempos[k] ? `promedio ${tiempos[k].dias < 2 ? tiempos[k].dias.toFixed(1) : Math.round(tiempos[k].dias)} d en la etapa` : '';
  }
  gTok.innerHTML = S.uni ? '' : dots;
  if (S.uni) { dibujarUnidad(); pedirUnidad(); }
  mapa.set(di, S.f, S.uni?.key);
  $('m-up').hidden = !(S.f.cve || S.f.region);
  // flechas: grosor por pasos diarios de la última semana
  const tr7 = C.transiciones(di, S.f, 7), vmax = Math.max(1, ...Object.values(tr7));
  for (const Ed of EDGES) {
    const key = Ed[0] + '>' + Ed[1], v = (tr7[key] || 0) / 7, p = paths[key];
    p.style.strokeWidth = (1.2 + 7 * Math.sqrt((tr7[key] || 0) / vmax)).toFixed(2);
    const l = svg.querySelector(`#el-${Ed[0]}-${Ed[1]}`);
    if (l) l.textContent = `${Ed[2]} · ${v >= 10 ? Math.round(v) : v.toFixed(1)}/d`;
  }
  // partículas solo al avanzar un día con la reproducción
  if (salto && S.playing && !S.uni) particulas(C.transiciones(di, S.f, 1));
  movimientos(di, d, salto);
  if (S.node) panel();
  if (!S.tb || Math.abs(S.tb.t - t) > DAY / 2 || force) tablero();
}

// ---------------------------------------------------------------------
//  Partículas: 1 = N referencias que pasaron por esa flecha ese día
// ---------------------------------------------------------------------
function particulas(tr) {
  const now = performance.now(), dur = Math.max(250, Math.min(1100, 0.9 * 1000 * DAY / S.speed));
  for (const [key, n] of Object.entries(tr)) {
    const p = paths[key];
    if (!p) continue;
    const k = n / S.N, m = Math.min(6, Math.floor(k) + (Math.random() < k % 1 ? 1 : 0));
    const bad = BAD.has(key.split('>')[1]);
    for (let i = 0; i < m && parts.length < 300; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '3.2'); c.setAttribute('class', 'part' + (bad ? ' bad' : ''));
      gTok.appendChild(c);
      parts.push({ el: c, p, len: p.getTotalLength(), t0: now + i * dur / Math.max(1, m), dur });
    }
  }
}
function animarParticulas(now) {
  if (!parts.length) return;
  parts = parts.filter(o => {
    const u = (now - o.t0) / o.dur;
    if (u >= 1 || !o.el.isConnected) { o.el.remove(); return false; }
    if (u < 0) { o.el.setAttribute('opacity', '0'); return true; }
    const pt = o.p.getPointAtLength(o.len * u);
    o.el.setAttribute('cx', pt.x); o.el.setAttribute('cy', pt.y); o.el.setAttribute('opacity', '1');
    return true;
  });
}
function limpiarParticulas() { for (const o of parts) o.el.remove(); parts = []; }

// ---------------------------------------------------------------------
//  Movimientos del día (resumen en lugar de una línea por referencia)
// ---------------------------------------------------------------------
function movimientos(di, d, salto) {
  if (!salto) { $('feed').innerHTML = ''; }
  const r = C.resumen(di, S.f, 1), tr = C.transiciones(di, S.f, 1);
  const dev = (tr['ACEPTACION>DEVUELTA'] || 0) + (tr['VALIDACION>DEVUELTA'] || 0), lim = tr['ACEPTACION>LIMBO'] || 0, noa = tr['CITA>NO_ACUDIO'] || 0;
  if (!r.CREADAS && !r.ATENDIDAS && !dev) return;
  const li = document.createElement('li');
  if (r.QUEMADA + r.SIN_CIERRE > r.CERRADA) li.className = 'bad';
  li.innerHTML = `<time>${fecha(d)}</time><span><b>${nf.format(r.CREADAS)}</b> nuevas · <b>${nf.format(r.ATENDIDAS)}</b> atendidas (${nf.format(r.EN_PLAZO)} en plazo) · ${dev} devueltas · ${lim} sin respuesta · ${noa} no acudieron
    <small class="muted">cierres: ${r.CERRADA} natural · ${r.SIN_CIERRE} sin cierre · ${r.ABANDONO} no regresó · ${r.QUEMADA} quemadas</small></span>`;
  const f = $('feed'); f.prepend(li); while (f.children.length > 60) f.lastChild.remove();
}

// ---------------------------------------------------------------------
//  Panel: etapa seleccionada (por estado y por receptora) o una referencia
// ---------------------------------------------------------------------
const filtroTxt = () => (S.f.cve ? nombreEstado(S.f.cve) : S.f.region ? 'Región ' + S.f.region : 'todo el país');
function panel() {
  const body = $('sel-body');
  $('sel-x').hidden = !S.node && !S.ref && !S.uni;
  if (S.ref) return panelRef();
  if (S.uni && !S.node) return panelUnidad();
  if (!S.node) { $('sel-title').textContent = 'Red nacional'; body.innerHTML = '<p class="muted">Toca una etapa para ver en qué estados y receptoras están esas referencias.</p>'; return; }
  const k = S.node, Et = ETAPAS[k], di = S.dia, E = C.etapas(di, S.f)[k], n = E.reduce((a, b) => a + b, 0), tm = C.tiempos(di, S.f, 28)[k];
  $('sel-title').innerHTML = `${esc(Et.n)} <small>${esc(Et.area)} · ${nf.format(n)} · ${esc(filtroTxt())}</small>`;
  // por estado (de la unidad que refiere)
  const m = C.meta, ests = m.estados.filter((c, i) => (!S.f.region || m.region[i] === S.f.region) && (!S.f.cve || c === S.f.cve));
  const porE = ests.map(c => [c, C.etapas(di, { cve: c })[k].reduce((a, b) => a + b, 0)]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 12);
  // receptoras con más lista de espera (para las etapas de espera)
  const espera = ['ACEPTACION', 'LIMBO', 'CITA', 'NO_ACUDIO'].includes(k);
  const sat = espera ? C.saturacionTodas(di).filter(s => (!S.f.region || s.u.region === S.f.region) && (!S.f.cve || s.u.cve === S.f.cve)).sort((a, b) => b.L - a.L).slice(0, 10) : [];
  body.innerHTML = `<div class="meta">
      ${EDAD_ES.map((e, i) => `<span><i class="sw ck" style="background:${EDAD_C[i]}"></i> ${e}</span><b>${nf.format(E[i])}</b>`).join('')}
      <span>Tiempo promedio en la etapa (28 d)</span><b>${tm ? (tm.dias < 2 ? tm.dias.toFixed(1) : Math.round(tm.dias)) + ' días' : '—'}</b>
    </div>
    ${porE.length ? `<h4 class="rf-h4">Por estado de la unidad que refiere</h4><div class="rf-bars">${porE.map(([c, v]) => `<button data-cve="${c}"><span>${esc(nombreEstado(c))}</span><i style="width:${100 * v / porE[0][1]}%"></i><em>${nf.format(v)}</em></button>`).join('')}</div>` : ''}
    ${sat.length ? `<h4 class="rf-h4">Receptoras con más lista de espera</h4><div class="rf-bars">${sat.map(s => `<button data-rx="${s.x}"><span>${esc(s.u.corto)}</span><i style="width:${100 * s.L / (sat[0].L || 1)}%;background:${SEM[s.sem]}"></i><em>${s.L} · ${fmtW(s.W)}</em></button>`).join('')}</div>` : ''}`;
  body.querySelectorAll('[data-cve]').forEach(b => b.addEventListener('click', () => ponerFiltro({ cve: b.dataset.cve })));
  body.querySelectorAll('[data-rx]').forEach(b => b.addEventListener('click', () => { const x = +b.dataset.rx, u = C.meta.rx[x]; seleccionarUnidad({ tipo: 'rx', key: 'R' + x, x, id: u.id, nombre: u.nombre }); }));
}
const fmtW = W => (!Number.isFinite(W) ? 'sin salidas' : `${Math.round(W)} d de espera`);

async function abrirRef(id) {
  const r = await pedir({ tipo: 'ref', id, t: S.t }, 'ref');
  S.ref = r.ref; S.node = null; panel();
  $('sel-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function panelRef() {
  const r = S.ref, E = r.E, t = S.t, body = $('sel-body');
  const plazo = E.atendida ? (E.dias <= REGLAS.plazoDias ? '<span class="ok">en plazo</span>' : '<span class="crit">fuera de plazo</span>') : E.dias > REGLAS.plazoDias ? '<span class="crit">vencido</span>' : 'corriendo';
  $('sel-title').innerHTML = `${r.id} <small>${esc(r.esp.n)}</small>`;
  const cur = r.seg.findIndex(x => t >= x.t0 && t < x.t1);
  body.innerHTML = `<div class="meta">
      <span>Paciente</span><b>${r.sexo} · ${r.edad} años · ${esc(r.dx)}</b>
      <span>Unidad que refiere</span><b>${esc(r.emisora.corto)} · ${esc(nombreEstado(r.emisora.cve))}</b>
      <span>Receptora</span><b>${esc(r.rxNombre)}</b>
      <span>${E.atendida ? 'Atendida a los' : 'Días sin atender'}</span><b style="color:${SEM[E.sem]}">${Math.floor(E.dias)} días · ${plazo}</b>
      <span>Vueltas</span><b>${E.vueltas}</b>
      <span>Ruta</span><b>${r.ruta.map(esc).join(' → ')}</b>
      <span>Lo que pasó</span><b>${CIERRE_ES[E.real]}</b>
      <span>En el sistema</span><b class="${E.sistema === 'SIN_RASTRO' ? 'crit' : ''}">${SISTEMA_ES[E.sistema]}</b>
    </div>
    <ol class="steps">${r.seg.map((x, i) => {
      const st = x.t0 > t ? 'future' : i === cur || (cur < 0 && i === r.seg.length - 1) ? 'now' : 'done';
      const dur = st === 'now' ? 'lleva ' + durTxt(t - x.t0) : TERMINAL.has(x.etapa) ? '' : durTxt(x.t1 - x.t0);
      return `<li class="${st}${BAD.has(x.etapa) ? ' bad' : ''}"><div class="h"><b>${esc(ETAPAS[x.etapa].n)}${x.vuelta ? '<span class="tag v">vuelta</span>' : ''}${x.reg ? '' : '<span class="tag noreg">no registrado</span>'}</b><time>${fecha(Math.floor(x.t0 / DAY))}</time></div>
        <div class="s">${esc(x.unidad || '')}${dur ? ' · ' + dur : ''}${x.nota ? ' · ' + esc(x.nota) : ''}</div></li>`;
    }).join('')}</ol>`;
}

// ---------------------------------------------------------------------
//  Tablero: cuentas del worker + saturación del cubo
// ---------------------------------------------------------------------
const pct = (a, b) => (b ? Math.round(100 * a / b) + ' %' : '—');
async function tablero() {
  if (S.pidiendo) return;
  S.pidiendo = true;
  const t = S.t, f = S.f;
  try {
    const { B } = await pedir({ tipo: 'tablero', t, filtro: f.cve || f.region ? f : '' }, 'tablero');
    S.tb = { t, B };
    pintarTablero(B, t);
  } finally { S.pidiendo = false; }
}
function listRef(el, items, sub) {
  el.innerHTML = items.length ? items.map(x => `<button data-ref="${x.id}"><i style="background:${SEM[x.sem]}"></i>
    <span class="tx"><b>${x.id}</b> ${esc(x.esp)}<small>${esc(sub(x))}</small></span><span style="color:${SEM[x.sem]}">${Math.floor(x.edad)} d</span></button>`).join('')
    : '<p class="muted">Ninguna en este momento.</p>';
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => abrirRef(b.dataset.ref)));
}
function pintarTablero(B, t) {
  const A = B.abiertas, tot = A.a15 + A.a30 + A.a90 + A.cron, di = C.dia(t);
  $('tb-sub').textContent = `al ${fechaD(Math.floor(t / DAY))} · ${filtroTxt()} · tasas de los últimos 90 días`;
  const bar = [[A.a15, SEM.VERDE], [A.a30, SEM.NARANJA], [A.a90, SEM.ROJO], [A.cron, SEM.CRONICA]].map(([n, c]) => `<i style="width:${tot ? 100 * n / tot : 0}%;background:${c}"></i>`).join('');
  const ci = B.cierres, nc = ci.CERRADA + ci.SIN_CIERRE + ci.ABANDONO + ci.QUEMADA;
  const sat = C.saturacionTodas(di).filter(s => (!S.f.region || s.u.region === S.f.region) && (!S.f.cve || s.u.cve === S.f.cve));
  const cs = sat.reduce((o, s) => ((o[s.sem] = (o[s.sem] || 0) + 1), o), {});
  $('kpis').innerHTML = `
    <div><b>Referencias abiertas</b><span class="big">${nf.format(tot)}</span><div class="rf-bar">${bar}</div>
      <div class="rows"><span>≤ 15 días</span><em>${nf.format(A.a15)}</em><span>16 a 30 días</span><em>${nf.format(A.a30)}</em><span>31 a 90 días</span><em>${nf.format(A.a90)}</em><span>Crónicas · más de 90</span><em>${nf.format(A.cron)}</em></div></div>
    <div class="${B.atendidas && B.enPlazo / B.atendidas < 0.5 ? 'bad' : 'ok'}"><b>Atendidas en ≤ ${REGLAS.plazoDias} días</b><span class="big">${pct(B.enPlazo, B.atendidas)}</span>
      <div class="rows"><span>Atendidas (90 d)</span><em>${nf.format(B.atendidas)}</em><span>Mediana a la atención</span><em>${B.medAt == null ? '—' : Math.round(B.medAt) + ' d'}</em><span>Sin atender &gt; ${REGLAS.plazoDias} d (ahora)</span><em>${nf.format(B.sinAtender15)}</em></div></div>
    <div class="${(cs.ROJO || 0) + (cs.NARANJA || 0) > sat.length / 2 ? 'bad' : 'warn'}"><b>Receptoras saturadas</b><span class="big">${(cs.ROJO || 0) + (cs.NARANJA || 0)} <small style="font-size:12px;font-weight:500">de ${sat.length}</small></span>
      <div class="rows">${['ROJO', 'NARANJA', 'AMARILLO', 'VERDE'].map(k => `<span><i class="sw ck" style="background:${SEM[k]}"></i> ${SAT_ES[k]}</span><em>${cs[k] || 0}</em>`).join('')}</div></div>
    <div><b>Aceptación de la receptora</b><span class="big">${B.medAcep == null ? '—' : B.medAcep.toFixed(1) + ' d'}</span>
      <div class="rows"><span>Aceptadas a la primera</span><em>${pct(B.acepPrimera, B.acepTotal)}</em><span>Sin respuesta (ahora)</span><em>${nf.format(B.limbo)}</em></div></div>
    <div class="${ci.SIN_CIERRE + ci.ABANDONO + ci.QUEMADA > ci.CERRADA ? 'bad' : 'warn'}"><b>Cómo terminan (90 d)</b><span class="big">${pct(ci.CERRADA, nc)} <small style="font-size:12px;font-weight:500">natural</small></span>
      <div class="rows"><span>Cierre natural</span><em>${nf.format(ci.CERRADA)}</em><span>Atendida sin cierre</span><em>${nf.format(ci.SIN_CIERRE)}</em><span>No regresó</span><em>${nf.format(ci.ABANDONO)}</em><span>Quemada</span><em>${nf.format(ci.QUEMADA)}</em></div></div>
    <div class="bad"><b>Sin rastro en el sistema</b><span class="big">${nf.format(B.sistema.SIN_RASTRO)}</span>
      <div class="rows"><span>Dan vueltas (2 o más)</span><em>${nf.format(B.nVueltas)}</em><span>Crónicas</span><em>${nf.format(B.nCronicas)}</em></div></div>`;
  listRef($('l-cron'), B.cronicas, x => `${x.atendida ? 'En tratamiento' : 'Sin atender'} · ${ETAPAS[x.etapa].n} · ${x.unidad || ''}`);
  listRef($('l-vue'), B.vueltas, x => `${x.vueltas} vueltas · ${x.ruta.join(' → ')}`);
  const O = B.ocultas, sumO = O.SIN_CIERRE + O.ABANDONO + O.QUEMADA + O.CERRADA;
  $('l-sis').innerHTML = `
    <div class="r"><span>El sistema las ve <b>en proceso</b></span><em>${nf.format(B.sistema.EN_PROCESO)}</em></div>
    <div class="r bad"><span>El sistema las ve <b>sin rastro</b></span><em>${nf.format(B.sistema.SIN_RASTRO)}</em></div>
    <div class="r"><span>El sistema registró el cierre (90 d)</span><em>${nf.format(B.sistema.CERRADA)}</em></div>
    <div class="r bad"><span>Ya terminaron, pero el sistema las ve abiertas</span><em>${nf.format(sumO)}</em></div>
    <p>De esas ${nf.format(sumO)}: <b>${nf.format(O.SIN_CIERRE)}</b> se atendieron y nadie cerró, <b>${nf.format(O.ABANDONO)}</b> el paciente no regresó, <b>${nf.format(O.QUEMADA)}</b> se quemaron y <b>${nf.format(O.CERRADA)}</b> sí cerraron pero no se registró.</p>`;
  // receptoras más saturadas del filtro
  const top = [...sat].sort((a, b) => (b.W === a.W ? b.L - a.L : (Number.isFinite(b.W) ? b.W : 1e9) - (Number.isFinite(a.W) ? a.W : 1e9))).slice(0, 15);
  $('t-rx').innerHTML = `<table><thead><tr><th>Unidad receptora</th><th>Estado</th><th>Lista de espera</th><th>Entran / sem</th><th>Salen / sem</th><th>ρ</th><th>Espera estimada</th><th>Sin atender &gt; ${REGLAS.plazoDias} d</th><th>Sin rastro</th></tr></thead><tbody>${top.map(s => {
    const P = B.porRx[s.u.id] || {};
    return `<tr><td><i style="background:${SEM[s.sem]}"></i>${esc(s.u.corto)}</td><td>${esc(nombreEstado(s.u.cve))}</td><td>${nf.format(s.L)}</td><td>${s.lambdaSem.toFixed(1)}</td><td>${s.salidasSem.toFixed(1)}</td>
      <td class="${s.rho > 1 ? 'bad' : ''}">${Number.isFinite(s.rho) ? s.rho.toFixed(2) : '—'}</td><td class="${s.W > 30 ? 'bad' : ''}">${Number.isFinite(s.W) ? Math.round(s.W) + ' d' : '—'}</td><td>${nf.format(P.sinAtender15 ?? 0)}</td><td>${nf.format(P.sinRastro ?? 0)}</td></tr>`;
  }).join('')}</tbody></table>
  <p class="muted rf-nota">Espera estimada = lista de espera ÷ salidas por día (Ley de Little); ρ = entradas ÷ salidas (más de 1: la lista crece). Ventana de 28 días, más larga si la unidad tiene poco movimiento.</p>`;
}

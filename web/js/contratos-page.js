// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  contratos-page.js · Ventana de gestión de contratos (contratos.html)
//  Revisión de días anteriores: gasto, pagos, cumplimiento de proveedores,
//  penas, avance contra mínimo y máximo, y el detalle de cada día.
//  Usa el mismo motor que el CEDIS (contratos.js), así las cifras coinciden.
//  El corte es el instante ?t= (segundos desde el lunes 26 oct 2026, 00:00);
//  sin ?t= se toma el inicio del turno de hoy (08:00).
// =====================================================================
import { initScenario } from './scenario-ui.js';
import { installInventory } from './network-sim.js';
import { Contratos, REGLAS, ESTADO_ES, mxn, fecha } from './contratos.js';

const DAY = 86400, H = 3600;
const BASE = Date.UTC(2026, 9, 26);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const iso = d => new Date(BASE + d * 864e5).toISOString().slice(0, 10);
const dOf = s => Math.round((Date.parse(s + 'T00:00:00Z') - BASE) / 864e5);
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / H)).padStart(2, '0')}:${String(Math.floor(s % H / 60)).padStart(2, '0')}`; };
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fechaL = d => `${WD[new Date(BASE + d * 864e5).getUTCDay()]} ${fecha(d)}`;
const pct = (v, dig = 1) => (v === null || v === undefined || !isFinite(v) ? '—' : (v * 100).toFixed(dig) + ' %');
const money = v => { const a = Math.abs(v); return a >= 1e6 ? `$${(v / 1e6).toFixed(a >= 1e8 ? 0 : 1)} M` : a >= 1e3 ? `$${Math.round(v / 1e3).toLocaleString('es-MX')} mil` : mxn(v); };
const EST_CHIP = { VIGENTE: 'ok', EN_RIESGO: 'warn', EN_RESCISION: 'crit', RESCINDIDO_PARCIAL: 'accent', RESCINDIDO: 'crit' };
const DICT_CHIP = { ACEPTADA_TOTAL: 'ok', ACEPTADA_CON_CANJE: 'warn', ENTREGA_PARCIAL: 'accent', RECHAZADA_TEMPERATURA: 'crit', RECHAZADA_FEUM: 'crit', RECHAZADA_CADUCIDAD: 'crit' };
const MOTIVO_CORTO = { RECHAZADA_TEMPERATURA: 'red fría', RECHAZADA_FEUM: 'certificado', RECHAZADA_CADUCIDAD: 'caducidad' };

const S = { period: '30', filtro: '', sort: { key: 'gasto', dir: -1 }, day: null };
let K, T, dHoy;

init().catch(err => { console.error(err); $('loading').textContent = 'No se pudo calcular: ' + (err.message || err); });

async function init() {
  initScenario();
  const qs = new URLSearchParams(location.search);
  T = qs.has('t') ? Math.max(0, +qs.get('t')) : 8 * H;
  dHoy = Math.floor(T / DAY);
  if (qs.get('k')) S.filtro = qs.get('k');
  if (qs.get('p')) S.period = qs.get('p');
  $('clock').textContent = `${fechaL(dHoy)} · ${hhmm(T)}`;
  $('go-cedis').href = `index.html?t=${Math.floor(T)}`;
  $('go-rec').href = `expedientes.html?t=${Math.floor(T)}`;
  const [data, cat] = await Promise.all(['assets/unidades_hidalgo.json', 'assets/medicamentos.json'].map(u => fetch(u).then(r => r.json())));
  await new Promise(r => setTimeout(r, 30));
  const inv = installInventory(data, cat);
  K = new Contratos(inv, cat);
  window.__contratos = { K, S, T };

  const sel = $('f-k');
  for (const k of K.contratos) sel.insertAdjacentHTML('beforeend', `<option value="${k.id}">${k.id} · ${esc(k.prov)} · ${esc(k.objeto)}</option>`);
  sel.value = S.filtro;
  sel.addEventListener('change', () => { S.filtro = sel.value; render(); });
  document.querySelectorAll('#f-period button').forEach(b => {
    b.classList.toggle('active', b.dataset.p === S.period);
    b.addEventListener('click', () => {
      S.period = b.dataset.p;
      document.querySelectorAll('#f-period button').forEach(x => x.classList.toggle('active', x === b));
      $('f-custom').hidden = S.period !== 'custom';
      render();
    });
  });
  $('f-custom').hidden = S.period !== 'custom';
  $('f-from').value = iso(dHoy - 14); $('f-to').value = iso(dHoy - 1);
  for (const id of ['f-from', 'f-to']) { $(id).max = iso(dHoy); $(id).min = iso(K.vigencia.desde); $(id).addEventListener('change', render); }
  $('d-date').max = iso(dHoy); $('d-date').min = iso(K.vigencia.desde);
  $('d-date').addEventListener('change', () => { S.day = dOf($('d-date').value); renderDay(); });
  $('d-prev').addEventListener('click', () => { S.day = Math.max(K.vigencia.desde, S.day - 1); renderDay(); });
  $('d-next').addEventListener('click', () => { S.day = Math.min(dHoy, S.day + 1); renderDay(); });
  $('x-csv').addEventListener('click', exportPartidas);
  $('x-score').addEventListener('click', exportScore);
  $('x-json').addEventListener('click', exportJSON);
  renderDefs();
  render();
  $('loading').hidden = true;
}

function period() {
  if (S.period === 'custom') {
    let a = dOf($('f-from').value), b = dOf($('f-to').value);
    if (!isFinite(a) || !isFinite(b)) { a = dHoy - 14; b = dHoy - 1; }
    if (a > b) [a, b] = [b, a];
    return [Math.max(K.vigencia.desde, a), Math.min(dHoy, b)];
  }
  if (S.period === 'vig') return [K.vigencia.desde, dHoy - 1];
  const n = +S.period || 30;
  return [dHoy - n, dHoy - 1];
}

function render() {
  const [d0, d1] = period();
  const n = d1 - d0 + 1;
  const cur = K.kpis(d0, d1, S.filtro || null, T);
  const comparable = d0 - n >= K.vigencia.desde;
  const prev = comparable ? K.kpis(d0 - n, d0 - 1, S.filtro || null, T) : {};
  const kName = S.filtro ? `${S.filtro} · ${K.byId.get(S.filtro).prov}` : 'todos los contratos';
  $('f-sum').innerHTML = `Del <b>${fechaL(d0)}</b> al <b>${fechaL(d1)}</b> (${n} día${n > 1 ? 's' : ''}) · ${esc(kName)} · ${comparable ? `se compara con los ${n} días anteriores` : 'sin periodo anterior comparable dentro de la vigencia'}. Cifras simuladas en MXN sin IVA.`;
  if (S.day === null || S.day > d1 || S.day < d0) S.day = d1;
  renderKpis(cur, prev);
  renderAlerts();
  const serie = K.serie(d0, d1, S.filtro || null, T);
  chartGasto(serie);
  chartPenas(serie);
  renderAvance();
  renderScore(d0, d1, cur);
  renderDay();
  const u = new URL(location.href); u.searchParams.set('p', S.period); if (S.filtro) u.searchParams.set('k', S.filtro); else u.searchParams.delete('k');
  history.replaceState(null, '', u);
}

// ---------------------------------------------------------------------
//  Indicadores y alertas
// ---------------------------------------------------------------------
function delta(a, b, inverse = false, isPct = false) {
  if (a === null || a === undefined || b === null || b === undefined || !isFinite(b)) return '';
  let txt, cls;
  if (isPct) { const dp = (a - b) * 100; if (Math.abs(dp) < 0.05) return '<em class="delta flat">=</em>'; txt = `${dp > 0 ? '+' : ''}${dp.toFixed(1)} pts`; cls = dp > 0 ? 'up' : 'down'; }
  else { if (!b) return a ? '<em class="delta flat">nuevo</em>' : ''; const r = (a - b) / Math.abs(b); if (Math.abs(r) < 0.005) return '<em class="delta flat">=</em>'; txt = `${r > 0 ? '+' : ''}${(r * 100).toFixed(0)} %`; cls = r > 0 ? 'up' : 'down'; }
  return `<em class="delta ${cls}${inverse ? ' inv' : ''}" title="contra el periodo anterior">${txt}</em>`;
}
function kpi(label, value, small, state = '', d = '') {
  return `<div class="kpi ${state}"><span>${label}</span><b>${value}${d}</b><small><i class="dot"></i>${small}</small></div>`;
}
function renderKpis(c, p) {
  const cumpl = c.cumplimiento, cs = cumpl === null ? '' : cumpl >= 0.95 ? 'ok' : cumpl >= REGLAS.constanciaCumplimiento ? 'warn' : 'crit';
  const mot = Object.entries(c.motivos).filter(([, v]) => v).map(([k, v]) => `${v} ${MOTIVO_CORTO[k]}`).join(', ') || 'sin rechazos';
  $('kpis').innerHTML = [
    kpi('Gasto recibido a satisfacción (EBA)', money(c.gasto + c.gastoRescate), `${c.partidasRecibidas} entregas · ${c.piezas.toLocaleString('es-MX')} pzas`, '', delta(c.gasto + c.gastoRescate, p.gasto + p.gastoRescate)),
    kpi('Pagado a proveedores (neto)', money(c.pagado), `${c.facturas} facturas pagadas`, '', delta(c.pagado, p.pagado)),
    kpi('Por pagar al corte', money(c.porPagar), c.porPagarVencido ? `${money(c.porPagarVencido)} fuera de los 17 días hábiles` : 'todo dentro de plazo', c.porPagarVencido ? 'crit' : 'ok'),
    kpi('Cumplimiento de entrega (piezas a tiempo)', pct(cumpl), `${c.vencidas} partidas vencieron · meta 95 %`, cs, delta(cumpl, p.cumplimiento, false, true)),
    kpi('Partidas a tiempo y completas (OTIF)', pct(c.otifPct), c.atrasadas ? `${c.atrasadas} con atraso · ${c.atrasoProm.toFixed(1)} días en promedio` : 'sin atrasos', c.otifPct === null ? '' : c.otifPct >= 0.9 ? 'ok' : c.otifPct >= 0.75 ? 'warn' : 'crit', delta(c.otifPct, p.otifPct, false, true)),
    kpi('Rechazo en andén', pct(c.rechazoPct), mot, c.rechazoPct === null ? '' : c.rechazoPct <= 0.02 ? 'ok' : c.rechazoPct <= 0.06 ? 'warn' : 'crit', delta(c.rechazoPct, p.rechazoPct, true, true)),
    kpi('Penas devengadas', money(c.penasDevengadas), `cobradas ${money(c.penasCobradas)} · deducciones ${money(c.deducciones)}`, c.penasDevengadas ? 'warn' : 'ok', delta(c.penasDevengadas, p.penasDevengadas, true)),
    kpi('Pagos en plazo (17 días hábiles)', pct(c.pagoATiempoPct, 0), c.habilesProm === null ? 'sin pagos' : `${c.habilesProm.toFixed(1)} días hábiles en promedio`, c.pagoATiempoPct === null ? '' : c.pagoATiempoPct >= 0.95 ? 'ok' : c.pagoATiempoPct >= 0.8 ? 'warn' : 'crit', delta(c.pagoATiempoPct, p.pagoATiempoPct, false, true)),
  ].join('');
}

function renderAlerts() {
  const out = [];
  const E = K.estado(T), av = K.avance(T);
  const vig = K.kpis(K.vigencia.desde, dHoy - 1, null, T);
  for (const c of E.contratos) {
    if (S.filtro && c.k.id !== S.filtro) continue;
    const id = `${c.k.id} · ${esc(c.k.prov)}`;
    if (c.proc && (c.estado === 'EN_RESCISION' || c.estado === 'RESCINDIDO_PARCIAL')) {
      const pr = c.proc;
      out.push(['crit', `${id}: ${ESTADO_ES[c.estado].toLowerCase()}`, `${esc(pr.causa)}. Audiencia hasta ${fecha(pr.dAud)}, resolución ${fecha(pr.dRes)}. Partidas: ${pr.partidas.map(p => esc(p.m.n)).join(', ') || 'todas'}. Rescate con ${esc(c.k.segundo)} (+${(c.k.difSegundo * 100).toFixed(1)} %).`]);
    }
    if (c.ratio >= REGLAS.bolsa.amarillo) out.push([c.ratio >= REGLAS.bolsa.naranja ? 'crit' : 'warn', `${id}: penas al ${pct(c.ratio, 0)} de la garantía`, 'Al llegar al 100 % ya no se pueden aplicar más penas (art. 75) y procede valorar la rescisión (art. 77).']);
    const atras = c.abiertas.filter(e => e.estado === 'ATRASADA');
    if (atras.length) out.push(['warn', `${id}: ${atras.length} OS atrasada${atras.length > 1 ? 's' : ''}`, atras.slice(0, 3).map(e => `${e.os.id} (venció ${fecha(e.os.dLim)}, pena ${money(e.pena)})`).join(' · ')]);
    const k = K.kpis(dHoy - 90, dHoy - 1, c.k.id, T);
    if (k.cumplimiento !== null && k.cumplimiento < REGLAS.constanciaCumplimiento) out.push(['crit', `${id}: cumplimiento de ${pct(k.cumplimiento, 0)} en 90 días`, 'Por debajo del 50 % que se pide como constancia de cumplimiento para compras consolidadas.']);
  }
  for (const a of av) {
    if (S.filtro && a.k.id !== S.filtro) continue;
    if (a.riesgoMinimo) out.push(['warn', `${a.k.id}: la proyección no alcanza el mínimo`, `Ejercido ${pct(a.pct, 0)}; al ritmo actual cerraría en ${pct(a.proyPct, 0)} y el mínimo es 40 % (art. 68).`]);
    if (a.cercaMaximo) out.push(['info', `${a.k.id}: la proyección supera el 95 % del máximo`, `Cerraría en ${pct(a.proyPct, 0)}. Valorar modificación de hasta 20 % por partida sin aumentar el monto total (art. 68).`]);
  }
  if (!S.filtro && vig.porPagarVencido > 0) out.push(['crit', `Facturas fuera de plazo de pago: ${money(vig.porPagarVencido)}`, 'Más de 17 días hábiles desde la verificación (art. 73); el proveedor puede reclamar gastos financieros.']);
  const ord = { crit: 0, warn: 1, info: 2 };
  out.sort((a, b) => ord[a[0]] - ord[b[0]]);
  $('alert-list').innerHTML = out.length ? out.map(([c, b, s]) => `<li class="${c}"><b>${b}</b><small>${s}</small></li>`).join('') : '<li class="none">Sin alertas al corte.</li>';
}

// ---------------------------------------------------------------------
//  Gráficas (SVG propio, con tooltip por día)
// ---------------------------------------------------------------------
function niceMax(v) { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; }
const axMoney = v => (v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);
function chartFrame(el, serie, yMax, drawFn, tipFn, y2) {
  const W = 760, Hh = 240, L = 54, R = y2 ? 34 : 12, Tp = 10, B = 26;
  const n = serie.length, cw = (W - L - R) / Math.max(1, n);
  const y = v => Tp + (Hh - Tp - B) * (1 - v / yMax);
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img">`;
  for (let i = 0; i <= 4; i++) { const v = yMax * i / 4, yy = y(v); s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="ax" x="${L - 6}" y="${yy + 4}" text-anchor="end">${axMoney(v)}</text>`; }
  if (y2) for (let i = 0; i <= 4; i++) s += `<text class="ax" x="${W - R + 6}" y="${y(yMax * i / 4) + 4}">${+(y2.max * i / 4).toFixed(1)}</text>`;
  const step = Math.max(1, Math.ceil(n / 9));
  serie.forEach((p, i) => { if (i % step === 0) s += `<text class="ax" x="${L + cw * (i + 0.5)}" y="${Hh - 8}" text-anchor="middle">${fecha(p.d)}</text>`; });
  if (!n) s += `<text class="empty" x="${W / 2}" y="${Hh / 2}" text-anchor="middle">Sin días en el periodo</text>`;
  s += `<line class="zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  s += drawFn({ L, cw, y });
  serie.forEach((p, i) => { s += `<rect class="hit" data-i="${i}" x="${L + cw * i}" y="${Tp}" width="${cw}" height="${Hh - Tp - B}" fill="transparent" style="cursor:pointer"/>`; });
  el.innerHTML = s + '</svg>';
  const tip = $('tip');
  el.querySelectorAll('.hit').forEach(r => {
    r.addEventListener('mousemove', e => { tip.hidden = false; tip.innerHTML = tipFn(serie[+r.dataset.i]); tip.style.left = Math.min(innerWidth - 270, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; });
    r.addEventListener('mouseleave', () => { tip.hidden = true; });
    r.addEventListener('click', () => { tip.hidden = true; S.day = serie[+r.dataset.i].d; renderDay(); $('day').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
}
function chartGasto(serie) {
  const mx = niceMax(Math.max(1, ...serie.map(p => Math.max(p.gasto + p.rescate, p.pagado))));
  chartFrame($('ch-gasto'), serie, mx, ({ L, cw, y }) => {
    let s = '';
    const bw = Math.max(1, cw * 0.72), off = (cw - bw) / 2;
    serie.forEach((p, i) => {
      const x = L + cw * i + off;
      if (p.gasto > 0) s += `<rect class="cbar" x="${x}" y="${y(p.gasto)}" width="${bw}" height="${y(0) - y(p.gasto)}" fill="#2dd4bf" rx="1.5"/>`;
      if (p.rescate > 0) s += `<rect class="cbar" x="${x}" y="${y(p.gasto + p.rescate)}" width="${bw}" height="${y(p.gasto) - y(p.gasto + p.rescate)}" fill="#60a5fa" rx="1.5"/>`;
    });
    if (serie.length > 1) s += `<polyline points="${serie.map((p, i) => `${(L + cw * (i + 0.5)).toFixed(1)},${y(p.pagado).toFixed(1)}`).join(' ')}" fill="none" stroke="#f5b400" stroke-width="2" stroke-linejoin="round"/>`;
    else if (serie.length) s += `<circle cx="${L + cw / 2}" cy="${y(serie[0].pagado)}" r="4" fill="#f5b400"/>`;
    return s;
  }, p => `<b>${fechaL(p.d)}</b><div class="r">Recibido<em>${mxn(p.gasto)}</em></div>${p.rescate ? `<div class="r">Rescate 2º lugar<em>${mxn(p.rescate)}</em></div>` : ''}<div class="r">Pagado<em>${mxn(p.pagado)}</em></div><div class="r">Entregas<em>${p.entregas}</em></div><small class="muted">Clic para revisar el día</small>`);
}
function chartPenas(serie) {
  const mx = niceMax(Math.max(1, ...serie.map(p => p.penas)));
  const rmx = Math.max(2, ...serie.map(p => p.rechazos));
  chartFrame($('ch-penas'), serie, mx, ({ L, cw, y }) => {
    let s = '';
    const bw = Math.max(1, cw * 0.72), off = (cw - bw) / 2;
    serie.forEach((p, i) => {
      if (p.penas > 0) s += `<rect class="cbar" x="${L + cw * i + off}" y="${y(p.penas)}" width="${bw}" height="${y(0) - y(p.penas)}" fill="#f87171" rx="1.5"/>`;
      if (p.rechazos > 0) s += `<circle cx="${L + cw * (i + 0.5)}" cy="${y(mx * p.rechazos / rmx)}" r="4" fill="#fbbf24" stroke="#151b23" stroke-width="1.5"/>`;
    });
    return s;
  }, p => `<b>${fechaL(p.d)}</b><div class="r">Penas devengadas<em>${mxn(p.penas)}</em></div><div class="r">Partidas rechazadas<em>${p.rechazos}</em></div><small class="muted">Clic para revisar el día</small>`, { max: rmx });
}

// ---------------------------------------------------------------------
//  Avance de contratos y desempeño de proveedores
// ---------------------------------------------------------------------
function setFiltro(id) { S.filtro = S.filtro === id ? '' : id; $('f-k').value = S.filtro; render(); }
function renderAvance() {
  const E = K.estado(T);
  $('avance').innerHTML = K.avance(T).map((a, i) => {
    const k = a.k, c = E.contratos[i], w = v => Math.min(100, v * 100).toFixed(1);
    return `<div class="av${S.filtro === k.id ? ' sel' : ''}" data-k="${k.id}" title="Filtrar por ${k.id}">
      <div class="av-name"><b>${k.id} · ${esc(k.prov)}</b><span>${esc(k.objeto)}</span></div>
      <div class="av-bars">
        <div class="av-track"><i class="proy" style="width:${w(a.proyPct)}%"></i><i class="ej" style="width:${w(a.pct)}%"></i><span class="min" style="left:40%"></span></div>
        <div class="av-track pen" title="Penas / garantía de cumplimiento"><i class="${c.ratio >= REGLAS.bolsa.naranja ? 'hi' : ''}" style="width:${w(c.ratio)}%"></i></div>
      </div>
      <div class="av-num"><b>${money(a.ejercido)}</b> de ${money(k.montoMax)} · ${pct(a.pct, 0)}<br>proyección ${pct(a.proyPct, 0)} · penas ${pct(c.ratio, 0)} de garantía</div>
    </div>`;
  }).join('');
  $('avance').querySelectorAll('.av').forEach(el => el.addEventListener('click', () => setFiltro(el.dataset.k)));
}

const COLS = [
  { key: 'id', label: 'Contrato', l: true }, { key: 'prov', label: 'Proveedor', l: true },
  { key: 'gasto', label: 'Gasto', f: money }, { key: 'os', label: 'OS' }, { key: 'vencidas', label: 'Partidas vencidas' },
  { key: 'cumplimiento', label: 'Cumplimiento', f: v => pct(v), q: v => v === null ? '' : v >= 0.95 ? 'good' : v >= 0.5 ? 'mid' : 'bad' },
  { key: 'otifPct', label: 'OTIF', f: v => pct(v), q: v => v === null ? '' : v >= 0.9 ? 'good' : v >= 0.75 ? 'mid' : 'bad' },
  { key: 'rechazoPct', label: 'Rechazo', f: v => pct(v), q: v => v === null ? '' : v <= 0.02 ? 'good' : v <= 0.06 ? 'mid' : 'bad' },
  { key: 'atrasoProm', label: 'Atraso prom.', f: v => (v ? v.toFixed(1) + ' d' : '—') },
  { key: 'penasDevengadas', label: 'Penas dev.', f: money }, { key: 'penasCobradas', label: 'Penas cob.', f: money },
  { key: 'deducciones', label: 'Deducciones', f: money }, { key: 'sobrecosto', label: 'Sobrecosto 2º lugar', f: money },
  { key: 'pagoATiempoPct', label: 'Pago en plazo', f: v => pct(v, 0) },
  { key: 'ratio', label: 'Penas/garantía', f: v => pct(v, 0), q: v => v >= 0.6 ? 'bad' : v >= 0.3 ? 'mid' : '' },
  { key: 'estado', label: 'Estado', l: true },
];
let scoreRows = [];
function renderScore(d0, d1, tot) {
  const E = K.estado(T);
  scoreRows = K.contratos.map((k, i) => ({ ...K.kpis(d0, d1, k.id, T), id: k.id, prov: k.prov, k, ratio: E.contratos[i].ratio, estado: E.contratos[i].estado }));
  const { key, dir } = S.sort;
  const val = r => (key === 'gasto' ? r.gasto + r.gastoRescate : r[key]);
  scoreRows.sort((a, b) => { const x = val(a), y = val(b); if (x === y) return 0; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x > y ? 1 : -1) * dir; });
  const cell = (c, r) => {
    if (c.key === 'estado') return `<td class="l"><em class="chip ${EST_CHIP[r.estado] || ''}">${ESTADO_ES[r.estado]}</em></td>`;
    const v = c.key === 'gasto' ? r.gasto + r.gastoRescate : r[c.key];
    return `<td class="${c.l ? 'l ' : ''}${c.q ? c.q(v) : ''}">${c.f ? c.f(v) : esc(v)}</td>`;
  };
  const tf = { ...tot, id: 'Total' };
  $('score').innerHTML = `<thead><tr>${COLS.map(c => `<th data-k="${c.key}" class="${c.l ? 'l ' : ''}${key === c.key ? 'sorted' : ''}">${c.label}${key === c.key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${scoreRows.map(r => `<tr data-k="${r.id}" class="${S.filtro === r.id ? 'sel' : ''}">${COLS.map(c => cell(c, r)).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr>${COLS.map(c => (['estado', 'ratio', 'prov'].includes(c.key) ? '<td></td>' : cell(c, tf))).join('')}</tr></tfoot>`;
  $('score-sub').textContent = S.filtro ? `periodo seleccionado · los totales son de ${S.filtro}; toca la fila otra vez para ver todos` : 'periodo seleccionado · toca un encabezado para ordenar o una fila para filtrar';
  $('score').querySelectorAll('th').forEach(th => th.addEventListener('click', () => { const k = th.dataset.k; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : (k === 'id' || k === 'prov' ? 1 : -1) }; renderScore(d0, d1, tot); }));
  $('score').querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => setFiltro(tr.dataset.k)));
}

// ---------------------------------------------------------------------
//  Revisión del día
// ---------------------------------------------------------------------
function renderDay() {
  const d = S.day, f = S.filtro || null;
  $('d-date').value = iso(d);
  $('d-next').disabled = d >= dHoy; $('d-prev').disabled = d <= K.vigencia.desde;
  const D = K.dia(d, f), k = K.kpis(d, d, f, T);
  const lim = t => t <= T;
  $('day-sub').textContent = `${fechaL(d)}${d === dHoy ? ' · hoy, hasta las ' + hhmm(T) : ''}${f ? ' · ' + f : ''}`;
  const cams = D.camiones.filter(c => lim(c.t)), oss = D.os.filter(o => lim(o.tEmision));
  $('day-kpis').innerHTML = [
    [oss.length, 'OS emitidas'], [cams.length, 'Camiones recibidos'], [`${k.partidasRecibidas}/${k.entregas}`, 'Partidas aceptadas'],
    [money(k.gasto + k.gastoRescate), 'Recibido (EBA)'], [money(k.pagado), 'Pagado'], [money(k.penasDevengadas), 'Penas devengadas'],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  $('day-rec').innerHTML = cams.map(c => `<div class="d-item">
      <div class="r1"><b>${hhmm(c.t)} · ${esc(c.os.id)} · ${esc(c.os.k.id)}</b><span class="muted">${esc(c.rescate ? c.prov : c.os.k.prov)}${c.frio ? ' · red fría' : ''}</span></div>
      <div class="r2">${c.items.map(x => `${esc(x.p.m.n)} · ${x.e.q.toLocaleString('es-MX')} pzas <em class="chip ${DICT_CHIP[x.e.dictamen] || ''}">${ESTADO_ES[x.e.dictamen] || x.e.dictamen}</em>${x.e.motivo ? ` <span class="${x.e.aceptada ? '' : 'crit'}">${esc(x.e.motivo)}</span>` : ''}${x.e.temp ? ` · ${x.e.temp} °C` : ''}`).join('<br>')}</div>
    </div>`).join('') || '<p class="d-empty">Sin recepciones.</p>';
  $('day-os').innerHTML = oss.map(o => `<div class="d-item">
      <div class="r1"><b>${hhmm(o.tEmision)} · ${esc(o.id)} · ${esc(o.k.id)}</b><span class="muted">vence ${fecha(o.dLim)}${o.acuseTarde ? ' · <span class="warn">acuse tardío</span>' : ''}</span></div>
      <div class="r2">${o.partidas.map(p => `${esc(p.m.n)} · ${p.q.toLocaleString('es-MX')} pzas · ${mxn(p.q * p.precio)}`).join('<br>')}${o.crisis ? '<br><span class="crit">El proveedor no surtirá esta orden</span>' : ''}</div>
    </div>`).join('') || '<p class="d-empty">Sin órdenes emitidas.</p>';
  const pays = D.pagos.filter(x => lim(x.tPago)).map(x => `<div class="d-item">
      <div class="r1"><b>Pago · ${esc(x.prov)}</b><b>${mxn(x.neto)}</b></div>
      <div class="r2">${esc(x.os.id)} · ${esc(x.p.m.n)} · ${x.piezas.toLocaleString('es-MX')} pzas${x.pena ? ` · <span class="warn">pena descontada ${mxn(x.pena)}</span>` : ''} · <span class="${x.aTiempo ? 'ok' : 'crit'}">${x.habiles} días hábiles</span>${x.rescate ? ' · rescate' : ''}</div></div>`);
  const cobs = D.cobros.filter(x => lim(x.t)).map(x => `<div class="d-item">
      <div class="r1"><b>${{ PENA: 'Pena cobrada', DEDUCCION: 'Deducción', GARANTIA: 'Garantía ejecutada' }[x.tipo]} · ${esc(x.k.prov)}</b><b class="crit">${mxn(x.monto)}</b></div>
      <div class="r2">${esc(x.os.id)} · ${esc(x.p.m.n)}</div></div>`);
  $('day-pay').innerHTML = [...pays, ...cobs].join('') || '<p class="d-empty">Sin pagos ni cobros.</p>';
  $('day-log').innerHTML = D.hechos.filter(h => lim(h.t)).map(h => `<li><time>${hhmm(h.t)}</time><span>${esc(h.texto)}${h.docs.length ? ` <small>doc. ${h.docs.join(', ')}</small>` : ''}</span></li>`).join('') || '<li class="d-empty">Sin movimientos.</li>';
}

// ---------------------------------------------------------------------
//  Exportar
// ---------------------------------------------------------------------
function download(name, text, type) {
  const blob = new Blob([text], { type }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csv = rows => '\ufeff' + rows.map(r => r.map(v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
const osDelPeriodo = () => { const [d0, d1] = period(); return K.os.filter(o => (!S.filtro || o.k.id === S.filtro) && o.d >= d0 && o.d <= d1 && o.tEmision <= T); };
function exportPartidas() {
  const [d0, d1] = period();
  const rows = [['contrato', 'proveedor', 'orden', 'emision', 'vencimiento', 'partida', 'clave_cnis', 'descripcion', 'solicitado', 'aceptado', 'pendiente', 'estado', 'dias_atraso', 'pena_devengada', 'precio_unitario', 'importe']];
  for (const o of osDelPeriodo()) for (const p of o.partidas) {
    const e = K.estadoPartida(p, T);
    rows.push([o.k.id, o.k.prov, o.id, iso(o.d), iso(o.dLim), p.num, p.c, p.m.n, p.q, e.aceptadas, e.pendiente, ESTADO_ES[e.estado] || e.estado, e.dias, e.pena.toFixed(2), p.precio.toFixed(2), (p.q * p.precio).toFixed(2)]);
  }
  download(`partidas_${iso(d0)}_${iso(d1)}${S.filtro ? '_' + S.filtro : ''}.csv`, csv(rows), 'text/csv');
}
function exportScore() {
  const [d0, d1] = period();
  const f4 = v => (v === null || v === undefined ? '' : v.toFixed(4));
  const rows = [['contrato', 'proveedor', 'objeto', 'gasto', 'gasto_rescate', 'os', 'partidas_vencidas', 'cumplimiento', 'otif', 'rechazo', 'atraso_promedio_dias', 'penas_devengadas', 'penas_cobradas', 'deducciones', 'sobrecosto_segundo_lugar', 'pago_en_plazo', 'penas_sobre_garantia', 'estado']];
  for (const r of scoreRows) rows.push([r.id, r.prov, r.k.objeto, r.gasto.toFixed(2), r.gastoRescate.toFixed(2), r.os, r.vencidas, f4(r.cumplimiento), f4(r.otifPct), f4(r.rechazoPct), r.atrasoProm.toFixed(2), r.penasDevengadas.toFixed(2), r.penasCobradas.toFixed(2), r.deducciones.toFixed(2), r.sobrecosto.toFixed(2), f4(r.pagoATiempoPct), f4(r.ratio), ESTADO_ES[r.estado]]);
  download(`proveedores_${iso(d0)}_${iso(d1)}.csv`, csv(rows), 'text/csv');
}
function exportJSON() {
  const [d0, d1] = period();
  const out = { corte: new Date(BASE + T * 1000).toISOString(), periodo: { desde: iso(d0), hasta: iso(d1) }, contrato: S.filtro || null, expedientes: osDelPeriodo().map(o => K.expediente(o, T)) };
  download(`expedientes_${iso(d0)}_${iso(d1)}${S.filtro ? '_' + S.filtro : ''}.json`, JSON.stringify(out, null, 2), 'application/json');
}

// ---------------------------------------------------------------------
function renderDefs() {
  const F = REGLAS.fundamento;
  const items = [
    ['Gasto recibido (EBA)', 'Valor de las piezas aceptadas en andén en el periodo, a precio del contrato; incluye lo que surtió el segundo lugar en rescates (a su precio).'],
    ['Cumplimiento de entrega', `Piezas aceptadas hasta la fecha límite ÷ piezas solicitadas, de las partidas que vencieron en el periodo. Es el tipo de medida que concentra el ${esc(F.monitoreo)}; para compras consolidadas se pide constancia de al menos 50 %.`],
    ['OTIF', 'Partidas que vencieron en el periodo y se entregaron completas, a tiempo y sin rechazo ÷ partidas que vencieron.'],
    ['Rechazo en andén', 'Entregas rechazadas (red fría fuera de 2–8 °C, sin certificado analítico o caducidad sin carta canje) ÷ entregas del periodo.'],
    ['Penas devengadas y cobradas', `${esc(F.pena)}. Se calculan al ${(REGLAS.tasaPenaDiaria * 100).toFixed(1)} % diario solo sobre lo no entregado de cada partida y se cobran antes del pago que cierra la partida. Si la partida se rescinde, la pena no se cobra y se hace efectiva la garantía.`],
    ['Pagos en plazo', `${esc(F.pago)}. Se mide desde la verificación del CFDI hasta el pago.`],
    ['Avance y proyección', `${esc(F.contrato)}. La proyección extiende el ritmo de ejercicio a los 12 meses de vigencia.`],
    ['Rescisión y segundo lugar', `${esc(F.rescision)}. ${esc(F.segundo)}.`],
  ];
  $('defs').innerHTML = items.map(([a, b]) => `<p><b>${a}.</b> ${b}</p>`).join('') +
    `<p class="src">${esc(F.nota)} Fuentes: <a href="https://mley.mx/LAASSP/articulo/68/" target="_blank" rel="noopener">LAASSP art. 68</a> · <a href="https://mley.mx/LAASSP/articulo/73/" target="_blank" rel="noopener">art. 73</a> · <a href="https://mley.mx/LAASSP/articulo/75/" target="_blank" rel="noopener">art. 75</a> · <a href="https://mley.mx/LAASSP/articulo/77/" target="_blank" rel="noopener">art. 77</a> · <a href="https://mley.mx/LAASSP/articulo/54/" target="_blank" rel="noopener">art. 54</a> · <a href="https://mley.mx/Reg_LAASSP/articulo/142/" target="_blank" rel="noopener">RLAASSP art. 142</a> · <a href="https://sidof.segob.gob.mx/notas/docFuente/5786005" target="_blank" rel="noopener">Lineamientos del Sistema de Monitoreo (DOF)</a>.</p>`;
}

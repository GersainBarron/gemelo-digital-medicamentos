// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  torre.js · Torre de control del abasto (torre.html)
//  Pide al worker que corra todos los gemelos con un escenario y pinta:
//  estrella del norte, a quién llamar, reparto de la culpa, la cadena,
//  detalle por eslabón, personas señaladas y la matriz de 32 delegaciones.
// =====================================================================
import { ESCENARIOS, ESLABONES, NIVELES, DEP, fmtV } from './torre-engine.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pc = x => `${Math.round((x || 0) * 100)} %`;
const ST_N = { ok: 'En meta', warn: 'Fuera de meta', crit: 'Crítico', nd: 'Sin dato' };

const S = { esc: 'normal', sel: null, filtro: 'todas', cache: {}, R: null, id: 0 };
let worker = null;

function params() {
  const q = new URLSearchParams(location.search);
  if (ESCENARIOS[q.get('esc')]) S.esc = q.get('esc');
  if (q.get('e')) S.sel = q.get('e');
}
function cfg() {
  let entries = null, integ = null;
  try { const v = localStorage.getItem('planeacion.bitacora.v1'); if (v) entries = JSON.parse(v); } catch { /* sin almacenamiento */ }
  try { const v = localStorage.getItem('planeacion.integridad.v1'); if (v) integ = JSON.parse(v); } catch { /* nada */ }
  return { esc: S.esc, entries, integ };
}

// ------------------------------------------------------------------ correr
function run(force = false) {
  paintEsc();
  if (!force && S.cache[S.esc]) { S.R = S.cache[S.esc]; paint(); return; }
  const L = $('#loading');
  if (!document.body.contains(L)) document.body.insertAdjacentHTML('beforeend', '<div id="loading" class="loading tw-over"><div class="tw-load"><b>Corriendo los gemelos de toda la cadena…</b><div class="tw-prog"><i id="prog-bar"></i></div><span id="prog-txt">Preparando</span></div></div>');
  worker ||= new Worker(new URL('./torre-worker.js', import.meta.url), { type: 'module' });
  const id = ++S.id;
  worker.onmessage = e => {
    const m = e.data; if (m.id !== S.id) return;
    if (m.prog) { const b = $('#prog-bar'), t = $('#prog-txt'); if (b) b.style.width = `${Math.round(m.prog.p * 100)}%`; if (t) t.textContent = m.prog.txt; return; }
    if (m.err) { const t = $('#prog-txt'); if (t) t.textContent = 'No se pudo correr la torre: ' + m.err.split('\n')[0]; console.error(m.err); return; }
    S.cache[S.esc] = m.res; S.R = m.res; $('#loading')?.remove(); paint();
  };
  worker.postMessage({ id, cfg: cfg() });
}

function bind() {
  $('#esc').innerHTML = Object.entries(ESCENARIOS).map(([k, e]) => `<button data-v="${k}">${esc(e.n)}</button>`).join('');
  $('#esc').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.dataset.v === S.esc) return; S.esc = b.dataset.v; url(); run(); });
  $('#rerun').addEventListener('click', () => run(true));
  $('#mfiltro').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.filtro = b.dataset.v; matriz(); });
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-e]'); if (!c) return;
    S.sel = c.dataset.e; url(); cadena(); detalle();
    if (c.dataset.go) $('#detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#matriz').addEventListener('click', e => { const tr = e.target.closest('tr[data-cve]'); if (!tr) return; tr.classList.toggle('open'); });
}
function url() { const q = new URLSearchParams(location.search); q.set('esc', S.esc); if (S.sel) q.set('e', S.sel); history.replaceState(null, '', `${location.pathname}?${q}`); }
function paintEsc() {
  for (const b of $('#esc').children) b.classList.toggle('active', b.dataset.v === S.esc);
  $('#esc-desc').textContent = ESCENARIOS[S.esc].desc;
}

// ------------------------------------------------------------------ pintar
function paint() {
  const R = S.R;
  if (!S.sel || !R.eslabones.some(e => e.id === S.sel)) S.sel = R.reparto[0].id;
  $('#plan-note').innerHTML = `Plan de Planeación: <a href="planeacion.html#/mitablero">${esc(R.plan.nombre)}</a>, día hábil ${R.plan.dia} de la aprobación${R.plan.proyectado ? ` (tu bitácora estaba en el día ${R.plan.dia - R.plan.proyectado}; la torre lo avanzó para tener qué vigilar)` : ''}. La torre lee tu bitácora y tus controles de integridad de este navegador.`;
  veredicto(); norte(); reparto(); llamadas(); cadena(); detalle(); nombres(); matriz(); textos();
}

function spark(serie, meta, dir = 1) {
  if (!serie || serie.length < 2) return '';
  const w = 120, h = 30, lo = Math.min(meta ?? Infinity, ...serie), hi = Math.max(meta ?? -Infinity, ...serie);
  const span = hi - lo || 1, y = v => h - 3 - (v - lo) / span * (h - 6), x = i => i / (serie.length - 1) * w;
  const d = serie.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const m = meta != null ? `<line x1="0" x2="${w}" y1="${y(meta).toFixed(1)}" y2="${y(meta).toFixed(1)}" class="tw-meta"/>` : '';
  return `<svg class="tw-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${m}<path d="${d}"/></svg>`;
}
const metaTxt = k => (k.info ? 'informativo' : `meta ${k.dir > 0 ? '≥' : '≤'} ${fmtV(k.meta, k.fmt)}`);

function veredicto() {
  const R = S.R, top = R.reparto.filter(r => r.share > 0.005).slice(0, 2);
  const rx = R.norte.find(n => n.id === 'recetas'), ab = R.norte.find(n => n.id === 'abasto');
  const n3 = R.llamadas.filter(l => l.nivel === 3).length, n2 = R.llamadas.filter(l => l.nivel === 2).length, n1 = R.llamadas.filter(l => l.nivel === 1).length;
  const pac = rx.st === 'ok' && ab.st === 'ok'
    ? `El paciente todavía no lo siente: ${fmtV(rx.v, rx.fmt)} de recetas completas en el piloto y ${fmtV(ab.v, ab.fmt)} de abasto estatal.`
    : `<b class="crit">El paciente ya lo siente:</b> ${fmtV(rx.v, rx.fmt)} de recetas completas en el piloto (meta 97 %) y ${fmtV(ab.v, ab.fmt)} de abasto estatal.`;
  $('#veredicto').innerHTML = `
    <div class="tw-v-main">
      <span class="eyebrow">Veredicto de la torre · ${esc(R.escN)}</span>
      <h1>${top.length ? `El problema hoy es de <em>${esc(top[0].n)}</em> (${pc(top[0].share)})${top[1] ? ` y de <em>${esc(top[1].n)}</em> (${pc(top[1].share)})` : ''}.` : 'Toda la cadena está en meta.'}</h1>
      <p>${pac} ${top[0] ? `Llamar primero a <b>${esc((R.llamadas.find(l => l.eslabon === top[0].id) || {}).quien || top[0].dueno)}</b>.` : ''}</p>
    </div>
    <div class="tw-v-niv">
      <div class="n3"><b>${n3}</b><span>a dirección general</span></div>
      <div class="n2"><b>${n2}</b><span>a la junta semanal</span></div>
      <div class="n1"><b>${n1}</b><span>al dueño directo</span></div>
    </div>`;
}

function norte() {
  $('#norte').innerHTML = S.R.norte.map(n => `
    <div class="kpi ${n.st}">
      <span>${esc(n.n)}</span>
      <b>${fmtV(n.v, n.fmt)}</b>
      <small><i class="dot"></i>${ST_N[n.st]} · ${n.dir > 0 ? 'meta ≥' : 'meta'} ${fmtV(n.meta, n.fmt)}</small>
      ${spark(n.serie, n.meta)}
      <em class="tw-alc">${esc(n.alc)} · ${esc(n.fuente)}</em>
    </div>`).join('');
}

function reparto() {
  const R = S.R, max = Math.max(...R.reparto.map(r => r.share), 0.01);
  $('#reparto').innerHTML = R.reparto.map(r => `
    <button class="tw-rep ${r.st}" data-e="${r.id}" data-go="1">
      <span class="tw-rep-n">${r.ic} ${esc(r.n)}<small>${esc(r.dueno)}</small></span>
      <span class="tw-rep-bar"><i class="own" style="width:${(r.propio / max * 100).toFixed(1)}%"></i><i class="rec" style="width:${(r.recibido / max * 100).toFixed(1)}%"></i></span>
      <b>${pc(r.share)}</b>
      ${r.recibido > 0.005 ? `<em>${pc(r.recibido)} explica fallas de ${r.de.map(d => esc(ESLABONES.find(e => e.id === d).n)).join(', ')}</em>` : ''}
    </button>`).join('');
}

function llamadas() {
  const L = S.R.llamadas.slice(0, 7);
  $('#llamadas').innerHTML = L.length ? L.map(l => `
    <div class="tw-call n${l.nivel}">
      <div class="tw-call-h"><span class="tw-niv n${l.nivel}">${esc(NIVELES[l.nivel].n)}</span><button class="tw-link" data-e="${l.eslabon}" data-go="1">${l.ic} ${esc(l.en)}</button></div>
      <b class="tw-who">${esc(l.quien)}</b>
      <div class="tw-call-k"><span>${esc(l.kn)}</span><strong class="${l.st}">${fmtV(l.v, l.fmt)}</strong><small>${l.dir > 0 ? 'meta ≥' : 'meta ≤'} ${fmtV(l.meta, l.fmt)}</small></div>
      ${l.culpa ? `<p class="tw-her">↑ ${Math.round((1 - l.f) * 100)} % de esta brecha se explica por <b>${esc(l.culpaK)}</b> (${esc(l.culpa)})${l.f < 0.5 ? ': primero se llama allá' : ''}.</p>` : ''}
      ${l.of.length ? `<ul class="tw-of">${l.of.map(o => `<li><b>${esc(o.quien)}</b> · ${esc(o.txt)}</li>`).join('')}</ul>` : ''}
      <p class="tw-plazo">${esc(NIVELES[l.nivel].plazo)}</p>
    </div>`).join('') + (S.R.llamadas.length > L.length ? `<p class="note">Y ${S.R.llamadas.length - L.length} indicadores más fuera de meta en el detalle de cada eslabón.</p>` : '')
    : '<p class="muted">Nadie: todos los indicadores están en meta.</p>';
}

function chainCard(e) {
  const worst = [...e.kpis].filter(k => !k.info).sort((a, b) => b.g * b.w - a.g * a.w)[0];
  const cu = e.culpa ? S.R.eslabones.find(x => x.id === e.culpa) : null;
  return `<button class="tw-node ${e.st}${S.sel === e.id ? ' sel' : ''}" data-e="${e.id}">
    <span class="tw-node-h"><i>${e.ic}</i><b>${esc(e.n)}</b><em class="dot"></em></span>
    <span class="tw-node-s">${pc(e.share)} <small>de la culpa</small></span>
    ${worst && worst.st !== 'ok' ? `<span class="tw-node-k">${esc(worst.n)}: <b class="${worst.st}">${fmtV(worst.v, worst.fmt)}</b></span>` : '<span class="tw-node-k ok">Todo en meta</span>'}
    <span class="tw-node-c">${e.kpis.filter(k => !k.info).map(k => `<i class="${k.st}" title="${esc(k.n)}"></i>`).join('')}</span>
    ${cu ? `<span class="tw-node-u">↑ parte viene de ${esc(cu.n)}</span>` : ''}
    <small class="tw-node-d">${esc(e.dueno)}</small>
  </button>`;
}
function cadena() {
  const E = S.R.eslabones;
  $('#cadena').innerHTML = E.filter(e => !e.trans).map(chainCard).join('<span class="tw-arrow" aria-hidden="true"></span>');
  $('#trans').innerHTML = `<span class="tw-trans-l">Transversales: tocan todos los eslabones</span>` + E.filter(e => e.trans).map(chainCard).join('');
}

function detalle() {
  const e = S.R.eslabones.find(x => x.id === S.sel); if (!e) return;
  const r = e.resp;
  $('#detalle').innerHTML = `
    <div class="card-h">
      <h2>${e.ic} ${esc(e.n)} <small>${esc(e.alcance)}</small></h2>
      <a class="seg-btn tw-open" href="${e.link}">Abrir el gemelo →</a>
    </div>
    <div class="tw-det-h">
      <div><span>Dueño del eslabón (A en la matriz RACI)</span><b>${esc(e.dueno)}</b></div>
      <div><span>Su parte de la culpa</span><b class="${e.st}">${pc(e.share)}</b></div>
      <div><span>Indicadores en rojo / ámbar</span><b>${e.nCrit} / ${e.nWarn}</b></div>
      <div><span>¿Le llega de arriba?</span><b>${e.culpa ? `Sí, de ${esc(S.R.eslabones.find(x => x.id === e.culpa).n)}` : 'No: es propio'}</b></div>
    </div>
    <div class="tw-kpis">${e.kpis.map(k => `
      <details class="tw-k ${k.info ? 'info' : k.st}" ${k.st !== 'ok' ? 'open' : ''}>
        <summary>
          <span class="tw-k-n"><i class="dot"></i>${esc(k.n)}</span>
          <b>${fmtV(k.v, k.fmt)}</b>
          <small>${metaTxt(k)}${k.info ? '' : ` · crítico ${fmtV(k.crit, k.fmt)}`}</small>
          ${spark(k.serie, k.info ? null : k.meta)}
        </summary>
        <div class="tw-k-b">
          <p><b>Qué mide:</b> ${esc(k.def)}</p>
          <p><b>Fórmula:</b> ${esc(k.formula)}</p>
          <p><b>De dónde sale la meta:</b> ${esc(k.fuente)}</p>
          <p><b>A quién se le reclama:</b> ${esc(k.quien || e.dueno)}${k.culpa ? ` · <span class="tw-her">${Math.round((1 - k.f) * 100)} % se explica por ${esc(k.culpaK)}</span>` : ''}</p>
          ${k.hereda ? `<p><b>Depende de:</b> ${esc(k.deN.join(', '))}</p>` : ''}
          ${k.det ? `<p class="muted">${esc(k.det)}</p>` : ''}
          ${k.of.length ? `<ul class="tw-of">${k.of.map(o => `<li><b>${esc(o.quien)}</b> · ${esc(o.txt)}</li>`).join('')}</ul>` : ''}
        </div>
      </details>`).join('')}</div>
    <p class="note">Brecha propia ${(r.propio).toFixed(2)} puntos · heredada de arriba ${(r.heredado).toFixed(2)} · recibida de abajo ${(r.recibido).toFixed(2)} (brecha × peso del indicador).</p>`;
}

function nombres() {
  const N = S.R.nombres;
  $('#nombres').innerHTML = N.length ? `<table class="tw-tbl"><thead><tr><th>Nivel</th><th>Quién</th><th>Por qué</th></tr></thead><tbody>${N.map(n => `
    <tr><td><span class="tw-niv n${n.nivel}">${n.nivel}</span></td><td><b>${esc(n.quien)}</b></td><td>${esc(n.txt)}<small class="tw-sub">${esc(n.en)} · ${esc(n.kn)}</small></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nadie señalado.</p>';
}

function matriz() {
  const M = S.R.matriz;
  for (const b of $('#mfiltro').children) b.classList.toggle('active', b.dataset.v === S.filtro);
  const rows = S.filtro === 'rojo' ? M.rows.filter(r => Object.values(r.c).some(c => c.st === 'crit')) : M.rows;
  $('#matriz').innerHTML = `<table class="tw-mtx"><thead><tr><th>Delegación</th>${M.cols.map(c => `<th>${c.ic} ${esc(c.n)}<small>${esc(c.sub)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(r => `
    <tr data-cve="${r.cve}"><td class="tw-mtx-d"><b>${esc(r.nombre)}</b>${r.piloto ? '<span class="chip accent">piloto</span>' : ''}<small>${esc(r.dueno)} · ${esc(r.analista)}</small></td>${M.cols.map(c => { const x = r.c[c.id]; return `<td class="tw-cell ${x.st}"><b>${esc(x.v)}</b><small>${esc(x.det)}</small></td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
}

function textos() {
  $('#reglas').innerHTML = `
    <p><b>Una cadena, diez eslabones, un dueño por indicador.</b> Cada indicador tiene una meta escrita, un nivel crítico y un área que responde (la A de la matriz RACI); cuando otra área tiene que enterarse, se dice entre paréntesis. Los nombres concretos (analistas, delegaciones, unidades, contratos, almacenistas) salen de cada gemelo.</p>
    <p><b>Semáforo contra una referencia.</b> Brecha = (meta − valor) ÷ (meta − crítico). Cero es verde, menos de uno es ámbar, uno o más es rojo, y se topa en 3 para que un solo indicador no se lleve todo. Gris: sin dato, que no cuenta como verde. Cada meta dice de dónde sale: MIR del ISSSTE, cifras públicas, IAPHL, una norma o, cuando no hay fuente, una meta interna del gemelo que se dice como tal.</p>
    <p><b>Atribuir la falla al eslabón correcto.</b> Un indicador de resultado sólo cuenta completo contra su dueño si lo de arriba cumplió. Como los gemelos no están conectados entre sí, son reglas de atribución que la torre aplica, no causas que deduzca. Si el indicador que lo alimenta está en rojo, 65 % de la brecha pasa a ese eslabón; si está en ámbar, 25 %. Las dependencias que usa la torre:</p>
    <ul class="tw-dep">${Object.entries(DEP).map(([k, v]) => `<li><b>${esc(nameK(k))}</b> ← ${v.map(x => esc(nameK(x))).join(' · ')}</li>`).join('')}</ul>
    <p><b>Escalamiento.</b> Nivel 1: el dueño directo atiende en 24 a 48 horas (ámbar). Nivel 2: rojo, a la junta semanal de operación con causa raíz. Nivel 3: rojo de peso 3, mayormente propio y muy lejos de la meta; o cualquier rojo de peso 3 cuando el desabasto ya se ve en dos de estos tres: estados en cero, surtido del almacén estatal y recetas completas. Decide la dirección general. Si la mayor parte de la brecha viene de arriba, baja un nivel: primero se llama allá.</p>
    <p><b>¿De quién es el problema?</b> Suma de brecha × peso por eslabón, después de la atribución, como porcentaje del total. Un eslabón con más indicadores puede acumular más; por eso cada uno muestra cuántos tiene en rojo y en ámbar.</p>`;
  $('#huecos').innerHTML = `
    <p><b>Los gemelos no están conectados entre sí.</b> Cada uno corre el escenario elegido con sus propios datos: la falla de proveedor del CENADI nacional no sale de los contratos de Hidalgo. La torre los pone lado a lado con su alcance y periodo, no como un solo modelo.</p>
    <p><b>El detalle fino sólo existe en el piloto Hidalgo.</b> CEDIS estatal, rutas, 60 unidades y recetas se simulan para Hidalgo; los otros 31 estados se ven a nivel de almacén estatal, planeación, red fría e integridad.</p>
    <p><b>La causa de cada receta no surtida no se registra.</b> El INAI ordenó al ISSSTE transparentar sus recetas no surtidas de 2024 con su causa, y la causa no se registra. Sin ese dato no se puede separar desabasto de clave fuera de cuadro o error de captura.</p>
    <p><b>Al proveedor no se le regaña: se le aplica el contrato.</b> La torre señala al administrador del contrato, que es quien exige, aplica penas o inicia la rescisión.</p>
    <p><b>Encuestas no.</b> CONEVAL señaló que la satisfacción reportada por el ISSSTE (98.4 %) chocaba con una evaluación de 76 % para farmacias, y que las encuestas las aplica el propio personal de la unidad. La torre sólo usa datos de transacciones: recetas, entregas, conteos y registros de temperatura.</p>
    <p><b>Todo es simulado.</b> Los números sirven para decidir qué datos hay que capturar y quién responde por cada uno, no para calificar a personas reales.</p>`;
  $('#refs').innerHTML = REFS.map(([t, u, d]) => `<p><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a> · ${esc(d)}</p>`).join('');
}
function nameK(k) { const [ref, si] = k.split('?'); if (si) return `${nameK(ref)}, si también falla ${nameK(si)}`; const [e, id] = ref.split('.'); const E = S.R.eslabones.find(x => x.id === e); const K = E?.kpis.find(x => x.id === id); return K ? `${K.n} (${E.n})` : k; }

const REFS = [
  ['Gartner, vía SupplyChain247: qué es una torre de control', 'https://www.supplychain247.com/article/what_is_a_supply_chain_control_tower_and_whats_needed_to_deploy_one', 'personas, procesos, datos, organización y tecnología; de la visibilidad a la decisión'],
  ['Umbrex: modelo operativo de una torre de control', 'https://umbrex.com/?p=244657', 'alertas por impacto con dueño, tres horizontes, cadencia diaria, semanal y mensual, escalamiento'],
  ['Umbrex: modelo SCOR', 'https://umbrex.com/resources/frameworks/strategy-frameworks/scor-model/', 'atributos de nivel 1 y árbol de diagnóstico hasta la causa raíz'],
  ['ASCM: ejemplo de tablero SCORmark', 'https://www.ascm.org/globalassets/ascm_website_assets/docs/2026-scormark-dashboard-example-deliverables.pdf', 'semáforo contra cuartiles de referencia'],
  ['DSG.ai: torre de control en la cadena de suministro', 'https://www.dsg.ai/blog/control-tower-in-supply-chain', 'gestión por excepción, vistas por rol, OTIF 88 % base y 93 % meta (ejemplo, no norma)'],
  ['BSC Designer: RACI en la planeación estratégica', 'https://bscdesigner.com/raci-strategic-planning.htm', 'un solo Accountable por indicador'],
  ['CONEVAL: ficha de monitoreo E018 del ISSSTE', 'https://www.coneval.org.mx/Evaluacion/Documents/EVALUACIONES/FMyE_2017_2018/FMyE_51_E018.pdf', 'meta 97 %, logro 97.5 %; advertencia sobre encuestas'],
  ['Consultor Salud: el ISSSTE reporta 97 % de abasto (1-abr-2026)', 'https://consultorsalud.com.mx/issste-reporta-97-de-abasto-de-medicamentos-en-sus-unidades-y-elimina-farmacias-por-debajo-del-90/', '766 farmacias, ninguna debajo de 90 %'],
  ['Zeta Tijuana: comparecencia de Salud (7-nov-2025)', 'https://zetatijuana.com/2025/11/salud-federal-presume-96-de-abasto-de-medicamentos-imss-surte-97-recetas-dice/', 'compra consolidada 2025-26: 99 % de lo solicitado'],
  ['Cero Desabasto: radiografía 2017-2021', 'https://a.storyblok.com/f/162801/x/0680df0f5f/resumen-radiografia-desabasto-2017-2021.pdf', 'recetas no surtidas efectivamente en el ISSSTE por año'],
  ['Expansión: recetas no surtidas en 2023', 'https://politica.expansion.mx/mexico/2024/05/06/recetas-no-se-surtieron-completamente-en-2023', 'ISSSTE 98.1 % de recetas surtidas completas'],
  ['El Universal: el INAI ordena al ISSSTE transparentar recetas no surtidas', 'https://www.eluniversal.com.mx/nacion/ordena-inai-al-issste-transparentar-numero-de-medicamentos-no-surtidos-en-2024-debe-informar-la-causa/', 'la causa de no surtir no se registra'],
  ['IAPHL: manual de indicadores de monitoreo y evaluación', 'https://iaphl.org/wp-content/uploads/2016/05/M_E_indicators_hdbk.pdf', 'exactitud de inventario, error de surtido, mermas'],
  ['OMS: indicadores de acceso a medicamentos', 'https://www.who.int/tools/monitoring-and-evaluation/access-indicators', '80 % de disponibilidad de la canasta trazadora'],
  ['RHSC: indicadores armonizados de desabasto', 'https://rhsupplies.org/activities-resources/publications/harmonized-suite-of-indicators-to-measure-stockouts-and-availability-of-contraceptives-7374', 'desabasto el día del corte y duración'],
];

if (new URLSearchParams(location.search).has('debug')) window.__torre = S;
params(); bind(); run();

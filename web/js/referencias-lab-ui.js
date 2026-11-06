// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-lab-ui.js · Panel del laboratorio «¿Qué pasaría si…?»
//  Palancas → el worker corre la misma red con esas palancas → tabla
//  «hoy contra escenario» y la serie mensual de atención en plazo.
//  «Ver el escenario» cambia todo el tablero a esa corrida.
// =====================================================================
import { PALANCAS, ESC_BASE } from './referencias.js';
import { INDICADORES } from './referencias-lab.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = new Intl.NumberFormat('es-MX');
const fmt = (v, f) => (v == null || !Number.isFinite(v) ? '—' : f === 'pct' ? `${(100 * v).toFixed(1)} %` : f === 'dias' ? `${Math.round(v)} d` : nf.format(Math.round(v)));
const PRESETS = {
  'Paquete digital': { digital: true, respuesta: true, sinCierre: true, recordatorio: 'sms' },
  'Más capacidad (20 %)': { capacidad: 0.2 },
  'Reglas de cierre': { contra: true, digital: true },
  'Lista regional': { regional: true },
  'Gestión de la demanda': { econsulta: true, telemedicina: true, validacion: true },
  'Prioridad clínica': { prioridad: true },
  'Todo': { recordatorio: 'llamada', capacidad: 0.2, respuesta: true, contra: true, digital: true, sinCierre: true, regional: true, prioridad: true, econsulta: true, validacion: true, telemedicina: true },
};

/**
 * @param pedir (msg, tipo) → promesa con la respuesta del worker
 * @param usar  (cubo, cual) → la página cambia a ese cubo ('base' | 'esc')
 */
export function iniciarLab({ pedir, usar }) {
  const L = { esc: { ...ESC_BASE }, res: null, viendo: 'base' };
  $('lab-card').hidden = false;
  $('lab-pre').innerHTML = Object.keys(PRESETS).map(n => `<button class="btn" data-p="${esc(n)}">${esc(n)}</button>`).join('') + '<button class="btn" data-p="">Limpiar</button>';
  $('lab-pre').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { L.esc = { ...ESC_BASE, ...(PRESETS[b.dataset.p] || {}) }; pintarPalancas(); }));

  function pintarPalancas() {
    $('lab-pal').innerHTML = Object.entries(PALANCAS).map(([k, p]) => {
      const v = L.esc[k], on = p.op ? v !== 'no' : p.rango ? v > 0 : !!v;
      const ctl = p.op ? `<select data-k="${k}">${Object.entries(p.op).map(([o, n]) => `<option value="${o}"${o === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`
        : p.rango ? `<input type="range" data-k="${k}" min="${p.rango[0]}" max="${p.rango[1]}" step="${p.paso}" value="${v}">`
        : '';
      return `<label class="${on ? 'on' : ''}">${p.op || p.rango ? '<span></span>' : `<input type="checkbox" data-k="${k}"${v ? ' checked' : ''}>`}
        <b>${esc(p.n)}${p.rango ? ` · +${Math.round(100 * v)} %` : ''}</b>${ctl}<small>${esc(p.efecto)}</small></label>`;
    }).join('');
    $('lab-pal').querySelectorAll('[data-k]').forEach(el => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
      const k = el.dataset.k;
      L.esc[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      pintarPalancas();
    }));
  }
  pintarPalancas();

  $('lab-run').addEventListener('click', async () => {
    const btn = $('lab-run');
    btn.disabled = true; $('lab-estado').textContent = 'Simulando la red con el escenario…';
    try {
      const r = await pedir({ tipo: 'escenario', esc: L.esc }, 'escenario');
      L.res = r; pintarResultado(r);
      $('lab-ver').hidden = false;
      $('lab-estado').textContent = `${resumenEsc(r.escN)}`;
      if (L.viendo === 'esc') await cambiar('esc'); // si ya se veía un escenario, se actualiza
    } catch (e) { $('lab-estado').textContent = 'No se pudo simular: ' + e.message; }
    finally { btn.disabled = false; }
  });
  $('lab-ver').addEventListener('click', () => cambiar('esc'));
  $('lab-hoy').addEventListener('click', () => cambiar('base'));

  async function cambiar(cual) {
    $('lab-estado').textContent = cual === 'esc' ? 'Armando el tablero del escenario…' : 'Regresando a la operación actual…';
    const r = await pedir({ tipo: 'usar', cual }, 'cubo');
    L.viendo = r.cual;
    usar(r.cubo, r.cual);
    $('lab-aviso').hidden = r.cual !== 'esc';
    $('lab-ver').hidden = r.cual === 'esc' || !L.res;
    $('lab-estado').textContent = r.cual === 'esc' ? `Viendo: ${resumenEsc(L.res.escN)}` : '';
  }

  function resumenEsc(e) {
    const on = Object.entries(PALANCAS).filter(([k, p]) => (p.op ? e[k] !== 'no' : p.rango ? e[k] > 0 : e[k])).map(([k, p]) => (p.op ? p.op[e[k]] : p.rango ? `${p.n} +${Math.round(100 * e[k])} %` : p.n));
    return on.length ? on.join(' · ') : 'Escenario sin cambios';
  }

  function pintarResultado({ base, esc: es }) {
    const filas = INDICADORES.map(([k, n, f, sube]) => {
      const a = base[k], b = es[k], d = a != null && b != null ? b - a : null;
      const rel = d != null && a ? d / Math.abs(a) : null;
      const cls = d == null || sube == null || Math.abs(rel ?? 0) < 0.02 ? '' : (d > 0) === sube ? 'mejor' : 'peor';
      const dTxt = d == null ? '—' : f === 'pct' ? `${d > 0 ? '+' : ''}${(100 * d).toFixed(1)} pts` : `${d > 0 ? '+' : ''}${f === 'dias' ? Math.round(d) + ' d' : nf.format(Math.round(d))}${rel != null && f !== 'dias' ? ` (${rel > 0 ? '+' : ''}${Math.round(100 * rel)} %)` : ''}`;
      return `<tr><td>${esc(n)}</td><td>${fmt(a, f)}</td><td>${fmt(b, f)}</td><td class="${cls}">${dTxt}</td></tr>`;
    }).join('');
    $('lab-res').innerHTML = `<table><thead><tr><th>Indicador al corte</th><th>Hoy</th><th>Escenario</th><th>Cambio</th></tr></thead><tbody>${filas}</tbody></table>
      ${grafica(base.serie, es.serie)}
      <p class="muted rf-nota">Misma red de 1,033 unidades y misma semilla; cambia sólo lo que activaste. Es una simulación: los efectos de cada palanca vienen de la literatura (ver investigación) y los números absolutos dependen de los supuestos del modelo.</p>`;
  }

  /** % atendidas en plazo por mes: hoy (gris) contra escenario (verde azulado) */
  function grafica(a, b) {
    const W = 520, H = 150, P = 28, n = a.length, mx = Math.max(0.1, ...a.concat(b).map(x => x.enPlazo || 0)) * 1.15;
    const X = i => P + (i * (W - P - 8)) / Math.max(1, n - 1), Y = v => H - 20 - (v / mx) * (H - 34);
    const linea = (s, c) => `<polyline fill="none" stroke="${c}" stroke-width="2.2" points="${s.map((x, i) => x.enPlazo == null ? '' : `${X(i)},${Y(x.enPlazo)}`).join(' ')}"/>` +
      s.map((x, i) => (x.enPlazo == null ? '' : `<circle cx="${X(i)}" cy="${Y(x.enPlazo)}" r="2.6" fill="${c}"/>`)).join('');
    const ticks = [0, mx / 2, mx].map(v => `<text x="2" y="${Y(v) + 3}">${Math.round(100 * v)} %</text><line x1="${P}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(148,163,184,.15)"/>`).join('');
    const meses = a.map((x, i) => (i % 2 ? '' : `<text x="${X(i)}" y="${H - 4}" text-anchor="middle">${esc(x.hasta)}</text>`)).join('');
    return `<div class="rf-lab-chart"><b style="font-size:12px">Atendidas en ≤ 15 días, por mes</b>
      <span class="muted" style="font-size:11.5px;margin-left:8px"><i class="sw" style="background:#94a3b8"></i> hoy · <i class="sw" style="background:#2dd4bf"></i> escenario</span>
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Atendidas en plazo por mes">${ticks}${meses}${linea(a, '#94a3b8')}${linea(b, '#2dd4bf')}</svg></div>`;
  }
}

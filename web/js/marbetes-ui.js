// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  marbetes-ui.js · Pestaña "Marbetes" del CEDIS 3D y capa de marbetes
//  Corre marbetes-sim.js sobre las ubicaciones con clave del CEDIS
//  (warehouse_layout.json + slot_claves.json), muestra cada toma con sus
//  marbetes, conteos, conciliación y ajustes, y pinta en el 3D un marbete
//  por ubicación con el estado que dejó la toma elegida.
// =====================================================================
import * as THREE from 'three';
import * as M from './marbetes-sim.js';

const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat('es-MX');
const n0 = x => nf.format(Math.round(x || 0));
const pct = (x, d = 1) => `${((x || 0) * 100).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
const money = x => `${x < 0 ? '−' : ''}${Math.abs(x) >= 1e6 ? `$${(Math.abs(x) / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M` : `$${n0(Math.abs(x))}`}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = d => { const x = new Date(Date.UTC(2027, 0, 1) + d * 864e5); return `${x.getUTCDate()} ${M.MESES[x.getUTCMonth()].slice(0, 3)} 2027`; };
const ST = {
  ok: ['Contado sin diferencia', '#34d399', 'ok'],
  reclasificado: ['Diferencia aclarada (reclasificación)', '#60a5fa', 'info'],
  ajustado: ['Ajuste autorizado', '#fbbf24', 'warn'],
  acta: ['Ajuste con acta', '#f87171', 'crit'],
  pend: ['Sin contar en esta toma', '#475569', ''],
};
const ubic = n => n.replace(/^Rack_/, '').replace('_Slot_', ' · ').replace(/_/g, ' ');

export class MarbetesUI {
  constructor(app, { b2t, focusPoint }) {
    this.app = app; this.b2t = b2t; this.focusPoint = focusPoint;
    this.o = { estrategia: 'rotativo', disciplina: 'media', deshonesto: true, u1: 1000, u2: 10000, seed: 1 };
    this.toma = -1; this.sel = null;
  }
  async init(slotClaves, catalog) {
    const cat = new Map(catalog.items.map(m => [m.c, { nombre: m.n, grupo: m.g, frio: !!m.frio }]));
    this.cat = cat;
    this.slots = this.app.sim.slots.filter(s => slotClaves[s.name] && (s.type === 'slot_pallet' || s.type === 'slot_shelf'))
      .map(s => ({ name: s.name, type: s.type, clave: slotClaves[s.name], rack: s.parent, pos: s.pos }));
    this.buildLayer();
    this.bind();
    this.run();
  }
  run() {
    this.R = M.simular(this.slots, this.cat, this.o);
    this.comp = null;
    this.toma = this.R.tomas.length - 1;
    this.sel = null;
    this.render(); this.paint();
  }

  // ------------------------------------------------------------ capa 3D: un marbete por ubicación
  buildLayer() {
    const g = new THREE.BoxGeometry(0.34, 0.2, 0.04);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.slots.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    this.slots.forEach((s, i) => {
      const big = s.type === 'slot_pallet';
      const p = this.b2t(s.pos[0], s.pos[1] - (big ? 0.62 : 0.2), s.pos[2] + (big ? 0.18 : 0.05));
      mtx.compose(p, q, big ? new THREE.Vector3(1.6, 1.6, 1) : new THREE.Vector3(0.8, 0.8, 1)); m.setMatrixAt(i, mtx);
      m.setColorAt(i, new THREE.Color('#475569'));
    });
    m.name = 'Overlay_Marbetes'; m.renderOrder = 4; m.visible = !!this.app.layers.marbetes; m.computeBoundingSphere();
    this.app.scene.add(m); this.layer = m;
  }
  setVisible(v) { this.layer.visible = v; this.app.needsRender = true; }
  paint() {
    const T = this.R.tomas[this.toma], c = new THREE.Color();
    const st = new Map((T.marbetes || []).map(m => [m.i, m]));
    this.slots.forEach((s, i) => {
      const m = st.get(i);
      const k = !m ? 'pend' : m.estado === 'ajustado' && (m.nivel === 'acta' || m.nivel === 'sanitario') ? 'acta' : m.estado;
      this.layer.setColorAt(i, c.set(ST[k][1]));
    });
    this.layer.instanceColor.needsUpdate = true; this.app.needsRender = true;
  }

  // ------------------------------------------------------------ pestaña
  bind() {
    const page = $('marbetes-page');
    page.addEventListener('click', e => {
      const b = e.target.closest('[data-mb]'); if (!b) return;
      const [k, v] = b.dataset.mb.split(':');
      if (k === 'est') { this.o.estrategia = v; this.run(); }
      else if (k === 'dis') { this.o.disciplina = v; this.run(); }
      else if (k === 'dsh') { this.o.deshonesto = !this.o.deshonesto; this.run(); }
      else if (k === 'seed') { this.o.seed++; this.run(); }
      else if (k === 'ver') { this.app.setLayer('marbetes', true); }
      else if (k === 'cmp') { this.comp = M.comparar(this.slots, this.cat, this.o); this.render(); }
      else if (k === 'row') { this.pick(+v); }
      else if (k === 'close') { this.sel = null; this.render(); }
    });
    page.addEventListener('change', e => {
      if (e.target.id === 'mb-est') { this.o.estrategia = e.target.value; this.run(); return; }
      if (e.target.id === 'mb-toma') { this.toma = +e.target.value; this.sel = null; this.render(); this.paint(); }
      if (e.target.id === 'mb-u1' || e.target.id === 'mb-u2') { this.o.u1 = Math.max(1, +$('mb-u1').value || 1000); this.o.u2 = Math.max(this.o.u1, +$('mb-u2').value || 10000); this.run(); }
    });
  }
  pick(folio) {
    const T = this.R.tomas[this.toma], m = T.marbetes.find(x => x.folio === folio); if (!m) return;
    this.sel = m; this.render();
    $('marbetes-page').querySelector('.mb-tag')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const s = this.slots[m.i];
    this.app.setLayer('marbetes', true);
    this.focusPoint(this.b2t(s.pos[0], s.pos[1], s.pos[2] + 0.6));
  }
  marbete(m) {
    const T = this.R.tomas[this.toma];
    const fila = (n, v, w) => `<div class="mb-c"><span>${n}</span><b>${v ?? '—'}</b><small>${w ? esc(w) : ''}</small></div>`;
    const res = m.estado === 'ok' ? 'Sin diferencia' : m.estado === 'reclasificado' ? `Aclarada: ${esc(m.nota)}` : `Ajuste ${m.D > 0 ? 'de sobrante' : 'de faltante'} por ${money(Math.abs(m.D) * m.precio)} · autoriza ${M.NIVEL[m.nivel]}`;
    return `<div class="mb-tag">
      <div class="mb-top"><span>CEDIS · ${esc(T.tipo)}</span><b>Folio ${String(m.folio).padStart(5, '0')}</b></div>
      <div class="mb-kv"><span>Ubicación</span><b>${esc(ubic(m.slot))}</b><span>Clave</span><b>${m.clave}${m.ctrl ? ' · controlado' : ''}</b><span>Descripción</span><b>${esc(m.nombre)}</b><span>Fecha</span><b>${fecha(T.day)}</b></div>
      <div class="mb-counts">${fila('1er conteo', n0(m.c1), M.almacenista(m.contador[0]))}${fila('2º conteo (ciego)', n0(m.c2), M.almacenista(m.contador[1]))}${fila('3er conteo', m.c3 == null ? 'no hizo falta' : n0(m.c3), m.c3 == null ? '' : 'supervisor')}</div>
      <div class="mb-perf"></div>
      <div class="mb-kv"><span>Existencia en sistema</span><b>${n0(m.sys)}</b><span>Conteo final</span><b>${n0(m.R)}</b><span>Diferencia</span><b style="color:${m.D ? (m.D < 0 ? 'var(--crit)' : 'var(--warn)') : 'var(--ok)'}">${m.D > 0 ? '+' : ''}${n0(m.D)} piezas${m.lote ? ' · lote distinto' : ''}</b><span>Resultado</span><b>${res}</b>
      ${m.edad ? `<span>Desde cuándo</span><b>${m.edad} días sin detectarse</b>` : ''}${m.robo && m.estado === 'ajustado' ? '<span>Seguimiento</span><b style="color:var(--crit)">Faltante sin explicación: se investiga</b>' : ''}
      ${m.ctrl && m.estado === 'ajustado' ? '<span>Controlado</span><b>Se aclara al 100 % con acta y se asienta en el libro de control</b>' : ''}</div>
      <button class="pill-btn wide" data-mb="close:1" type="button"><span>Ver la toma completa</span></button></div>`;
  }
  render() {
    const R = this.R, k = R.kpi, T = R.tomas[this.toma], o = this.o;
    const seg = (key, items, cur) => `<div class="seg mb-seg">${items.map(([v, n]) => `<button data-mb="${key}:${v}" class="${v === cur ? 'active' : ''}">${n}</button>`).join('')}</div>`;
    const tile = (v, n, tone) => `<div class="tile ${tone || ''}"><b>${v}</b><span>${n}</span></div>`;
    const chip = (ok, txt) => `<span class="chip ${ok ? 'ok' : 'crit'}">${ok ? '✓' : '✗'} ${txt}</span>`;
    const rows = T.rows.filter(m => m.estado !== 'ok').sort((a, b) => Math.abs(b.D) * b.precio - Math.abs(a.D) * a.precio);
    const causas = Object.entries(M.CAUSAS).map(([c, v]) => ({ c, n: v.n, x: R.eventos.porCausa[c] || 0 })).sort((a, b) => b.x - a.x);
    const maxC = Math.max(1, ...causas.map(c => c.x));
    $('marbetes-page').innerHTML = `
    <section class="card">
      <h3>Inventario físico con marbetes <small>CEDIS · año 2027</small></h3>
      <p class="muted mb-p">El sistema y el anaquel se separan por errores que nadie ve. Las tomas con marbete los descubren: primer conteo, segundo conteo ciego por otra persona y tercero si no coinciden; luego se concilia y se ajusta con autorización.</p>
      <label class="mb-l">Estrategia de conteo</label>
      <select id="mb-est" class="mb-sel">${Object.entries(M.ESTRATEGIAS).map(([v, e]) => `<option value="${v}" ${v === o.estrategia ? 'selected' : ''}>${e.n}</option>`).join('')}</select>
      <p class="muted mb-p">${esc(M.ESTRATEGIAS[o.estrategia].desc)}</p>
      <label class="mb-l">Disciplina de captura en el almacén</label>
      ${seg('dis', Object.entries(M.DISCIPLINA).map(([v, d]) => [v, d.n]), o.disciplina)}
      <div class="mb-row"><button class="chip ${o.deshonesto ? 'crit' : ''}" data-mb="dsh:1" type="button">${o.deshonesto ? '● Hay un almacenista deshonesto' : '○ Todos honestos'}</button><button class="chip" data-mb="seed:1" type="button">Otro año</button></div>
    </section>
    <section class="card">
      <h3>Resultado del año</h3>
      <div class="tiles">
        ${tile(pct(k.exactitudProm, 0), 'Exactitud promedio (ubicaciones donde sistema = anaquel)', k.exactitudProm >= 0.9 ? 'ok' : k.exactitudProm >= 0.75 ? 'warn' : 'crit')}
        ${tile(pct(k.exactitudPre, 0), 'Exactitud antes de la toma anual', k.exactitudPre >= 0.9 ? 'ok' : k.exactitudPre >= 0.7 ? 'warn' : 'crit')}
        ${tile(`${Math.round(k.edadProm)} d`, 'Días promedio que una diferencia vivió sin detectarse', k.edadProm <= 60 ? 'ok' : k.edadProm <= 150 ? 'warn' : 'crit')}
        ${tile(n0(k.eventos), 'Errores ocultos que ocurrieron en el año')}
        ${tile(n0(k.detectadas), 'Diferencias encontradas por los marbetes')}
        ${tile(money(k.ajNeto), 'Ajuste neto en pesos (negativo = faltó)', k.ajNeto < 0 ? 'warn' : '')}
        ${tile(`${n0(k.horas)} h`, 'Horas de conteo en el año')}
        ${tile(n0(k.conteos), 'Marbetes emitidos')}
        ${tile(money(k.exposicionProm), 'Valor promedio de lo que no cuadra en un día')}
      </div>
      <div class="mb-chips">${chip(k.tolFis <= 0.0072, `Diferencias físicas ${pct(k.tolFis, 2)} (tope 0.72 %)`)}${chip(k.tolCont <= 0.008, `Diferencias contables ${pct(k.tolCont, 2)} (tope 0.80 %)`)}${chip(true, 'Controlados aclarados al 100 % con acta')}</div>
      <p class="muted mb-p">Topes del procedimiento 1821-A03-002 del IMSS para la toma anual: si se pasan, se exige un informe de causas y medidas correctivas.</p>
    </section>
    <section class="card">
      <h3>Tomas del año <small>${R.tomas.length}</small></h3>
      <select id="mb-toma" class="mb-sel">${R.tomas.map((t, i) => `<option value="${i}" ${i === this.toma ? 'selected' : ''}>${fecha(t.day)} · ${esc(t.tipo)} · ${n0(t.n)} marbetes</option>`).join('')}</select>
      <div class="tiles">
        ${tile(`${String(T.folio0).padStart(5, '0')}–${String(T.folio1).padStart(5, '0')}`, 'Folios de marbete')}
        ${tile(n0(T.c3), `Terceros conteos (de ${n0(T.c2)})`)}
        ${tile(n0(T.rows.length), 'Ubicaciones con diferencia', T.rows.length ? 'warn' : 'ok')}
        ${tile(n0(T.reclas), 'Aclaradas sin ajuste')}
        ${tile(n0(T.niveles.jefe + T.niveles.admin), `Ajustes: ${T.niveles.jefe} jefe · ${T.niveles.admin} admin.`)}
        ${tile(n0(T.niveles.acta + T.niveles.sanitario), `Con acta: ${T.niveles.acta} OIC · ${T.niveles.sanitario} controlados`, T.niveles.acta + T.niveles.sanitario ? 'crit' : 'ok')}
      </div>
      <button class="pill-btn wide" data-mb="ver:1" type="button"><span>Ver los marbetes en el almacén</span></button>
      <div class="legend mb-legend">${['ok', 'reclasificado', 'ajustado', 'acta', 'pend'].map(s => `<span><i style="background:${ST[s][1]}"></i>${ST[s][0]}</span>`).join('')}</div>
      <p class="muted mb-p">Autoriza el ajuste: hasta ${money(o.u1)} el jefe de almacén; hasta ${money(o.u2)} el administrador; más, acta administrativa con el Órgano Interno de Control. Montos (supuesto): <input id="mb-u1" type="number" value="${o.u1}" step="500"> / <input id="mb-u2" type="number" value="${o.u2}" step="1000"></p>
    </section>
    ${this.sel ? `<section class="card"><h3>Marbete</h3>${this.marbete(this.sel)}</section>` : `
    <section class="card">
      <h3>Diferencias de esta toma <small>las de mayor valor · toca una</small></h3>
      ${rows.slice(0, 12).map(m => `<button class="mb-item" data-mb="row:${m.folio}" type="button"><span><b>${esc(m.nombre)}</b><small>${esc(ubic(m.slot))} · folio ${m.folio}</small></span><em class="chip ${m.estado === 'reclasificado' ? 'info' : m.nivel === 'acta' || m.nivel === 'sanitario' ? 'crit' : 'warn'}">${m.D > 0 ? '+' : ''}${n0(m.D)} pz · ${money(Math.abs(m.D) * m.precio)}</em></button>`).join('') || '<p class="muted">Ninguna diferencia.</p>'}
    </section>`}
    <section class="card">
      <h3>Por qué no cuadra <small>errores ocultos del año</small></h3>
      ${causas.map(c => `<div class="mb-bar"><span>${esc(c.n)}</span><i><b style="width:${(100 * c.x / maxC).toFixed(1)}%"></b></i><em>${c.x}</em></div>`).join('')}
      <p class="muted mb-p">Los marbetes ven la diferencia, no la causa. Ubicación, lote y unidad de medida se aclaran casi siempre; lo demás termina en ajuste.</p>
    </section>
    <section class="card">
      <h3>Integridad <small>faltantes por almacenista</small></h3>
      ${R.alertas.length ? R.alertas.map(a => `<div class="mb-alert"><b>${M.almacenista(a.a)}</b><span>${esc(a.motivo)}</span></div>`).join('') : '<p class="muted">Sin patrones raros en los ajustes.</p>'}
      ${o.deshonesto ? `<p class="muted mb-p">En esta simulación el deshonesto es el ${M.almacenista(k.dishonest)}${R.alertas.some(a => a.a === k.dishonest) ? ' y la alerta lo encontró.' : ': con esta estrategia y esta disciplina, su robo se esconde entre los demás errores.'}</p>` : ''}
    </section>
    <section class="card">
      <h3>Comparar estrategias <small>mismo año, mismos errores</small></h3>
      ${this.comp ? `<div class="mb-cmp">${this.comp.map(c => `<div class="${c.e === o.estrategia ? 'sel' : ''}"><b>${esc(c.n)}</b><span>Exactitud ${pct(c.exactitudProm, 0)} · ${Math.round(c.edadProm)} días sin detectar · ${n0(c.horas)} h de conteo · físicas ${pct(c.tolFis, 2)} ${c.tolFis <= 0.0072 ? '✓' : '✗'}</span></div>`).join('')}</div>` : '<button class="pill-btn wide" data-mb="cmp:1" type="button"><span>Comparar las cuatro estrategias</span></button>'}
    </section>`;
  }
}

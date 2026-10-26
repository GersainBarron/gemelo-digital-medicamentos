// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  ops-ui.js · Paneles de operación: Entradas, Inventario, Salidas y
//  rutas, Unidades médicas (lista + mapa) y Emergencias
// =====================================================================
import { TARGETS, hhmm } from './ops.js';
import { UnitSupply } from './supply.js';

const KPI_DEF = {
  entradas: [
    ['otifProv', 'OTIF del proveedor', '%', 'ge'], ['caducidad', 'Caducidad ≥ 12 meses', '%', 'ge'],
    ['rechazos', 'Líneas rechazadas', '%', 'le'], ['discrepancia', 'Discrepancia documental', '%', 'le'],
    ['frioEntrada', 'Frío íntegro al recibir', '%', 'ge'], ['dockToStock', 'Andén a ubicación', 'h', 'le'],
    ['cuarentena', 'Tiempo en cuarentena', 'h', 'le'], ['controladosIn', 'Controlados asentados', '%', 'ge'],
  ],
  inventario: [
    ['exactitud', 'Exactitud de inventario', '%', 'ge'], ['minMax', 'Claves en mín–máx', '%', 'ge'],
    ['cobertura', 'Cobertura promedio', 'días', null], ['mermaCad', 'Merma por caducidad', '%', 'le'],
    ['mermaTotal', 'Merma total', '%', 'le'], ['proxCaducar', 'Próximos a caducar', '%', 'le'],
    ['tempRango', 'Cuarto frío en 2–8 °C', '%', 'ge'], ['controladosDif', 'Diferencias en controlados', '', 'le'],
  ],
  salidas: [
    ['fillRate', 'Fill rate de pedidos', '%', 'ge'], ['aTiempo', 'Entrega a tiempo', '%', 'ge'],
    ['otifUnidad', 'OTIF a la unidad', '%', 'ge'], ['ciclo', 'Ciclo del pedido', 'h', 'le'],
    ['emergencias', 'Emergencias en tiempo', '%', 'ge'], ['frioSalida', 'Frío íntegro en entrega', '%', 'ge'],
    ['desabasto', 'Desabasto de trazadoras', '%', 'le'], ['recetas', 'Surtimiento de recetas', '%', 'ge'],
  ],
};

const ARR_STATE = {
  scheduled: ['Programado', 'muted'], late: ['Retrasado', 'warn'], dock: ['En andén', 'accent'],
  inspection: ['Inspección', 'info'], released: ['Liberado', 'ok'], partial: ['Liberado con rechazo', 'warn'],
};
const URG_STATE = {
  validating: ['Validando', 'info'], preparing: ['Surtiendo', 'accent'], transfer: ['Transferencia', 'warn'],
  enroute: ['En camino', 'info'], delivered: ['Entregada', 'ok'],
};
const LEVEL = { 1: ['N1 · Vital', 'crit'], 2: ['N2 · Urgente', 'warn'], 3: ['N3 · Prioritario', 'info'] };
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dur = s => { const m = Math.round(Math.abs(s) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };

function tone(v, t, dir) {
  if (!dir) return 'muted';
  if (dir === 'ge') return v >= t - 0.05 ? 'ok' : v >= t - (t >= 99 ? 2 : 5) ? 'warn' : 'crit';
  if (t === 0) return v <= 0 ? 'ok' : 'crit';
  return v <= t ? 'ok' : v <= t * 1.5 ? 'warn' : 'crit';
}
function fmt(v, unit) {
  if (unit === '%') return v.toFixed(1) + '<i>%</i>';
  if (unit === 'h') return v.toFixed(1) + '<i>h</i>';
  if (unit === 'días') return Math.round(v) + '<i>días</i>';
  return String(Math.round(v));
}
function metaText(key, unit, dir) {
  const t = TARGETS[key];
  if (!dir) return 'Entre mínimo y máximo';
  if (t === 0) return 'Meta: 0';
  return `Meta ${dir === 'ge' ? '≥' : '≤'} ${t}${unit === '%' ? ' %' : unit === 'h' ? ' h' : ''}`;
}
export function routeDays(r) {
  const a = r.days.map(d => WD[d]).join(' y ');
  return r.hospDays.length ? `${a} (todas) · ${r.hospDays.map(d => WD[d]).join(' y ')} (hospitales)` : `${a}`;
}

export class OpsUI {
  /**
   * @param ops       instancia de Ops
   * @param handlers  { onShowUnit(u, extraRows?), onShowRoute(id) }
   */
  constructor(ops, handlers) {
    this.ops = ops; this.h = handlers;
    this.filter = { inst: 'all', route: 'all', q: '' };
    this.selected = null;
    this.$ = id => document.getElementById(id);
    this.buildTabs();
    this.buildKpiGrid('kg-entradas', 'entradas');
    this.buildKpiGrid('kg-inventario', 'inventario');
    this.buildKpiGrid('kg-salidas', 'salidas');
    this.buildUnits();
    this.$('urg-sim').addEventListener('click', () => {
      this.ops.createEmergency(1);
      this.update(true);
    });
  }

  // ---------- Pestañas ----------
  buildTabs() {
    this.tab = 'almacen';
    document.querySelectorAll('#kpi-tabs button').forEach(b => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
  }
  showTab(id) {
    this.tab = id;
    document.querySelectorAll('#kpi-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.dataset.page === id));
    this.$('kpi-panel').scrollTop = 0;
    this.update(true);
  }

  buildKpiGrid(id, group) {
    const g = this.$(id);
    g.innerHTML = '';
    for (const [key, label, unit, dir] of KPI_DEF[group]) {
      const t = el('div', 'kpi');
      t.dataset.key = key;
      t.innerHTML = `<span class="k-label">${label}</span><b class="k-val"></b><span class="k-meta">${metaText(key, unit, dir)}</span>`;
      g.appendChild(t);
    }
  }
  fillKpis(id, group, values) {
    const g = this.$(id);
    for (const [key, , unit, dir] of KPI_DEF[group]) {
      const t = g.querySelector(`[data-key="${key}"]`);
      const v = values[key];
      const html = fmt(v, unit);
      const b = t.querySelector('.k-val');
      if (b.innerHTML !== html) b.innerHTML = html;
      t.dataset.tone = tone(v, TARGETS[key], dir);
    }
  }

  // ---------- Unidades: filtros, mapa y lista ----------
  buildUnits() {
    const sel = this.$('u-route');
    for (const [id, r] of Object.entries(this.ops.routes)) sel.insertAdjacentHTML('beforeend', `<option value="${id}">${id} · ${esc(r.name)}</option>`);
    sel.addEventListener('change', () => { this.filter.route = sel.value; this.renderUnits(); });
    document.querySelectorAll('#u-inst button').forEach(b => b.addEventListener('click', () => {
      this.filter.inst = b.dataset.inst;
      document.querySelectorAll('#u-inst button').forEach(x => x.classList.toggle('active', x === b));
      this.renderUnits();
    }));
    const q = this.$('u-search');
    q.addEventListener('input', () => { this.filter.q = q.value.trim().toLowerCase(); this.renderUnits(); });
    this.buildMap();
    // lista
    const list = this.$('u-list');
    this.rows = new Map();
    for (const u of this.ops.units) {
      const row = el('button', 'unit');
      row.innerHTML = `<span class="u-dot" style="background:${this.ops.routes[u.ruta].color}"></span>
        <span class="u-main"><b>${esc(u.nombre)}</b><small>${u.inst} · ${u.tipo} · ${esc(u.municipio)} · ${u.ruta}</small></span>
        <span class="chip"></span>`;
      row.addEventListener('click', () => this.selectUnit(u));
      list.appendChild(row);
      this.rows.set(u, row);
    }
    this.renderUnits();
  }

  buildMap() {
    const d = this.ops.data, W = 320;
    const xs = d.outline.map(p => p[0]), ys = d.outline.map(p => p[1]);
    const x0 = Math.min(...xs) - 0.05, x1 = Math.max(...xs) + 0.05, y0 = Math.min(...ys) - 0.05, y1 = Math.max(...ys) + 0.05;
    const k = Math.cos((20.5 * Math.PI) / 180);
    const Hh = Math.round((W * (y1 - y0)) / ((x1 - x0) * k));
    this.proj = (lon, lat) => [((lon - x0) / (x1 - x0)) * W, ((y1 - lat) / (y1 - y0)) * Hh];
    const path = d.outline.map((p, i) => (i ? 'L' : 'M') + this.proj(p[0], p[1]).map(v => v.toFixed(1)).join(' ')).join('') + 'Z';
    const [cx, cy] = this.proj(d.cedis.lon, d.cedis.lat);
    let dots = '';
    for (const u of this.ops.units) {
      const [x, y] = this.proj(u.lon, u.lat);
      dots += `<circle class="m-unit" data-clues="${u.clues}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${u.hosp ? 5 : 3.6}" fill="${this.ops.routes[u.ruta].color}"/>`;
    }
    this.$('u-map').innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Mapa de unidades médicas en Hidalgo">
      <path d="${path}" class="m-state"/>${dots}
      <g class="m-cedis" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})"><rect x="-6" y="-6" width="12" height="12" rx="2" transform="rotate(45)"/></g>
      <text x="${(cx + 10).toFixed(1)}" y="${(cy + 4).toFixed(1)}" class="m-label">CEDIS</text>
      <circle id="m-sel" r="9" class="m-sel" cx="-20" cy="-20"/></svg>`;
    this.$('u-map').querySelectorAll('.m-unit').forEach(c => c.addEventListener('click', () => this.selectUnit(this.ops.byClues.get(c.dataset.clues))));
    const lg = this.$('u-legend');
    lg.innerHTML = Object.entries(this.ops.routes).map(([id, r]) => `<button data-r="${id}"><i style="background:${r.color}"></i>${id}</button>`).join('');
    lg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const v = this.filter.route === b.dataset.r ? 'all' : b.dataset.r;
      this.filter.route = v; this.$('u-route').value = v; this.renderUnits();
    }));
  }

  matches(u) {
    const f = this.filter;
    if (f.inst !== 'all' && u.inst !== f.inst) return false;
    if (f.route !== 'all' && u.ruta !== f.route) return false;
    if (f.q && !(`${u.nombre} ${u.municipio} ${u.clues} ${u.tipo}`.toLowerCase().includes(f.q))) return false;
    return true;
  }
  renderUnits() {
    let n = 0;
    for (const [u, row] of this.rows) { const ok = this.matches(u); row.hidden = !ok; n += ok; }
    this.$('u-count').textContent = `${n} de ${this.ops.units.length} unidades`;
    this.$('u-map').querySelectorAll('.m-unit').forEach(c => c.classList.toggle('dim', !this.matches(this.ops.byClues.get(c.dataset.clues))));
    this.$('u-legend').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.r === this.filter.route));
    this.update(true);
  }
  selectUnit(u, extra) {
    this.selected = u;
    for (const [x, row] of this.rows) row.classList.toggle('active', x === u);
    const [x, y] = this.proj(u.lon, u.lat);
    const s = this.$('m-sel'); s.setAttribute('cx', x); s.setAttribute('cy', y);
    this.h.onShowUnit(u, this.unitRows(u, extra));
  }
  unitRows(u, extra) {
    const r = this.ops.routes[u.ruta], st = this.ops.unitStatus(u);
    return [
      ...(extra || []),
      ['Estado hoy', st.text], ['CLUES', u.clues], ['Institución', u.inst], ['Tipo', u.tipologia], ['Nivel', u.nivel],
      ['Municipio', u.municipio], ['Domicilio', `${u.domicilio}${u.cp ? ', C.P. ' + u.cp : ''}`], ['Teléfono', u.tel || '—'],
      ['Ruta', `${u.ruta} · ${r.name}`], ['Entrega ordinaria', u.frecuencia], ['Días de la ruta', routeDays(r)],
      ['Distancia desde CEDIS', `${Math.round(u.km)} km · ${dur(u.min * 60)}`], ['Objetivo de emergencia (N2)', `${u.urgencia_h} h`],
    ];
  }

  // ---------- Actualización periódica ----------
  update(force) {
    const now = performance.now();
    if (!force && now - (this._t || 0) < 450) return;
    this._t = now;
    const ops = this.ops;
    const k = ops.kpis();
    // insignia de emergencias
    const open = ops.emergencies.filter(e => !e.closed);
    const badge = this.$('urg-count');
    badge.textContent = open.length || '';
    badge.classList.toggle('vital', open.some(e => e.level === 1));
    if (this.tab === 'almacen') this.fillKpis('kg-inventario', 'inventario', k.inventario);
    if (this.tab === 'entradas') this.renderEntradas(k);
    if (this.tab === 'salidas') this.renderSalidas(k);
    if (this.tab === 'unidades') this.renderUnitStates();
    if (this.tab === 'urgencias') this.renderUrgencias(k);
    if (this.tab === 'inventario') this.renderInventario();
    this.renderAutorizacion();
  }

  renderEntradas(k) {
    this.fillKpis('kg-entradas', 'entradas', k.entradas);
    const ops = this.ops, h = k.entradas.hoy;
    this.$('arr-sum').textContent = `${h.recibidos} de ${h.total} recibidos · ${h.pallets} pallets`;
    const html = ops.day.arrivals.map(a => {
      const [lbl, t] = ARR_STATE[ops.arrivalState(a)];
      const st = ops.arrivalState(a) === 'dock' ? `${lbl} ${a.dock}` : lbl;
      return `<div class="arr"><time>${hhmm(a.eta)}</time><span class="a-main"><b>${esc(a.supplier)}</b>
        <small>${a.folio} · ${a.lines} claves · ${a.pieces.toLocaleString('es-MX')} pzas</small></span>
        <span class="a-tags">${a.cold ? '<em class="tag cold">2–8 °C</em>' : ''}${a.ctrl ? '<em class="tag ctrl">Controlado</em>' : ''}</span>
        <span class="chip ${t}">${st}</span></div>`;
    }).join('') || '<p class="empty">Sin arribos programados hoy</p>';
    const list = this.$('arr-list');
    if (list._html !== html) { list.innerHTML = html; list._html = html; }
  }

  renderSalidas(k) {
    this.fillKpis('kg-salidas', 'salidas', k.salidas);
    const ops = this.ops, h = k.salidas.hoy;
    this.$('rt-sum').textContent = `${ops.dateLabel()} · ${h.entregas} de ${h.programadas} entregas · ${h.pallets} pallets despachados`;
    const trips = new Map(ops.day.trips.map(t => [t.id, t]));
    const rows = Object.entries(ops.routes).map(([id, r]) => {
      const tr = trips.get(id);
      let state, chip, prog = 0, total = 0, next = '';
      if (!tr) {
        const nd = [1, 2, 3, 4, 5, 6, 7].map(i => ops.dayIdx + i).find(i => ops.units.some(u => u.ruta === id && ops.visits(u, i)));
        state = nd !== undefined ? `Sin salida hoy · ${ops.dateLabel(nd)}` : 'Sin salida'; chip = 'muted';
      } else {
        total = tr.stops.length;
        prog = tr.stops.filter(s => ops.stopState(s) === 'delivered').length;
        const ts = ops.tripState(tr);
        const nx = tr.stops.find(s => ops.stopState(s) !== 'delivered');
        const late = nx && ops.now > nx.eta ? Math.max(0, nx.actual - nx.eta) : 0;
        if (ts === 'scheduled') { state = `Sale ${hhmm(tr.depart)}`; chip = 'info'; }
        else if (ts === 'enroute') {
          state = nx ? `${ops.stopState(nx) === 'unloading' ? 'En' : 'Hacia'} ${nx.unit.nombre} · ${hhmm(nx.actual)}` : 'Entregando';
          chip = late > 30 * 60 ? 'warn' : 'ok';
          if (late > 30 * 60) next = `<em class="tag late">+${Math.round(late / 60)} min</em>`;
        } else if (ts === 'returning') { state = 'De regreso al CEDIS'; chip = 'info'; }
        else { state = 'Ruta completa'; chip = 'ok'; }
      }
      return `<button class="route" data-r="${id}"><span class="r-dot" style="background:${r.color}"></span>
        <span class="r-main"><b>${id} · ${esc(r.name)}</b><small>${tr ? r.vehicle + ' · ' : ''}${esc(routeDays(r))}</small>
        ${tr ? `<span class="bar"><i style="width:${total ? (100 * prog / total).toFixed(0) : 0}%"></i></span>` : ''}</span>
        <span class="r-side"><span class="chip ${chip}">${esc(state)}</span>${tr ? `<small>${prog}/${total} unidades</small>` : ''}${next}</span></button>`;
    }).join('');
    const box = this.$('rt-list');
    if (box._html !== rows) {
      box.innerHTML = rows; box._html = rows;
      box.querySelectorAll('.route').forEach(b => b.addEventListener('click', () => {
        this.filter.route = b.dataset.r; this.$('u-route').value = b.dataset.r;
        this.showTab('unidades'); this.renderUnits();
      }));
    }
  }

  renderUnitStates() {
    for (const [u, row] of this.rows) {
      if (row.hidden) continue;
      const st = this.ops.unitStatus(u), c = row.querySelector('.chip');
      if (c.textContent !== st.text) { c.textContent = st.text; c.className = 'chip ' + st.tone; }
    }
  }

  renderAutorizacion() {
    const link = this.ops.link; if (!link?.pex) return;
    const now = this.ops.now, ST = { proposed: ['crit', 'Por validar en la unidad'], validated: ['warn', 'Por autorizar'], authorized: ['info', 'Autorizado'], scheduled: ['info', 'Programado en ruta'], enroute: ['info', 'En camino'], delivered: ['ok', 'Entregado'], nostock: ['crit', 'Sin existencia en CEDIS'] };
    const ORD = ['validated', 'proposed', 'authorized', 'scheduled', 'enroute', 'nostock', 'delivered'];
    const rows = link.pex.map(x => ({ ...x, s: UnitSupply.pexState(x.p, now) }));
    const pend = rows.filter(r => r.s === 'validated');
    const badge = this.$('aut-count'); badge.textContent = pend.length || '';
    if (this.tab !== 'autorizacion') return;
    const key = rows.map(r => r.p.id + r.s).join('|') + Math.floor(now / 300);
    if (this._autKey === key) return; this._autKey = key;
    rows.sort((a, b) => ORD.indexOf(a.s) - ORD.indexOf(b.s) || a.p.minCover - b.p.minCover);
    const done = rows.filter(r => r.s === 'delivered');
    this.$('aut-pend').textContent = pend.length;
    this.$('aut-late').textContent = pend.filter(r => now - r.p.validated > 4 * 3600).length;
    this.$('aut-ontime').innerHTML = done.length ? (100 * done.filter(r => r.p.deliver <= r.p.stockoutAt).length / done.length).toFixed(0) + '<i>%</i>' : '—';
    const d = s => s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
    this.$('aut-list').innerHTML = rows.slice(0, 60).map(({ u, p, s }) => {
      const wait = s === 'validated' ? now - p.validated : s === 'proposed' ? now - p.t0 : 0;
      const late = s === 'validated' ? wait > 4 * 3600 : s === 'proposed' ? wait > 2 * 3600 : false;
      return `<div class="inv-row"><span class="u-head"><span class="chip ${ST[s][0]}">${ST[s][1]}</span><b>${p.id} · ${esc(u.nombre)}</b><time>${p.minCover.toFixed(1)} d</time></span>
        <span class="u-unit">${p.lines.slice(0, 3).map(l => `${esc(l.name)} ×${Math.round(l.q).toLocaleString('es-MX')}`).join(' · ')}${p.lines.length > 3 ? ` · +${p.lines.length - 3} claves` : ''}</span>
        <span class="u-item">${wait ? `<span style="color:${late ? '#fca5a5' : 'inherit'}">esperando ${d(wait)}${late ? ' · fuera de plazo' : ''}</span> · ` : ''}${p.urgent ? 'viaje propio' : 'en la ruta siguiente'} · ${s === 'delivered' ? `entregado ${hhmm(p.deliver)} · ciclo ${d(p.deliver - p.t0)}` : `llegada estimada ${Math.floor(p.deliver / 86400) > Math.floor(now / 86400) ? 'mañana ' : ''}${hhmm(p.deliver)}`} · ${u.ruta}</span></div>`;
    }).join('') || '<p class="muted">Sin pedidos extraordinarios hoy.</p>';
  }

  renderInventario() {
    const inv = this.ops.inv; if (!inv) return;
    const idx = Math.floor(this.ops.now / 86400);
    if (this._invDay === idx && this.$('inv-list').childElementCount) return;
    this._invDay = idx;
    const k = inv.kpis(idx, 90), rows = inv.rows(idx);
    const ORD = ['zero', 'part', 'low', 'ok', 'over'];
    rows.sort((a, b) => ORD.indexOf(a.level) - ORD.indexOf(b.level) || a.cover - b.cover);
    const LV = { zero: ['crit', 'Sin existencia'], part: ['warn', 'En reparto'], low: ['warn', 'Cobertura baja'], ok: ['ok', 'Normal'], over: ['info', 'Sobreinventario'] };
    this.$('inv-pol').textContent = '· pedido por ' + (inv.policy === 'forecast' ? 'pronóstico' : 'mínimos y máximos');
    this.$('inv-fill').innerHTML = (100 * k.fill).toFixed(1) + '<i>%</i>';
    this.$('inv-short').textContent = rows.filter(r => r.level === 'zero' || r.level === 'part').length;
    this.$('inv-days').textContent = k.invDays.toFixed(0);
    const fmtN = n => Math.round(n).toLocaleString('es-MX');
    const dl = d => this.ops.dateLabel(d);
    this.$('inv-list').innerHTML = rows.map(r => `<div class="inv-row"><span class="u-head"><span class="chip ${LV[r.level][0]}">${r.level === 'part' ? `Reparto ${Math.round(r.f * 100)} %` : LV[r.level][1]}</span><b>${esc(r.m.n)}</b><time>${isFinite(r.cover) ? r.cover.toFixed(0) + ' d' : '—'}</time></span>
      <span class="u-unit">${fmtN(r.stock)} pzas · ${r.m.c}${r.m.frio ? ' <em class="tag cold">2–8 °C</em>' : ''}</span>
      <span class="u-item">${r.onOrder ? `En tránsito ${fmtN(r.onOrder)}${r.next ? ` · llega ${dl(r.next.eta)}${r.next.late ? ' (con retraso)' : ''}` : ''}` : 'Sin pedido abierto'} · proveedor ${r.L} d</span>
      <span class="u-item muted">${r.lots.slice(0, 2).map(l => `${l.lot} · ${fmtN(l.q)} · ${l.loc}`).join(' &nbsp;|&nbsp; ') || 'Sin lotes'}</span></div>`).join('');
  }

  renderUrgencias(k) {
    const ops = this.ops;
    const open = ops.emergencies.filter(e => !e.closed);
    this.$('urg-open').textContent = open.length;
    this.$('urg-vital').textContent = open.filter(e => e.level === 1).length;
    this.$('urg-ontime').innerHTML = k.salidas.emergencias.toFixed(1) + '<i>%</i>';
    const html = ops.emergencies.slice(0, 25).map(e => {
      const st = ops.emergencyState(e), [sl, stone] = URG_STATE[st], [ll, lt] = LEVEL[e.level];
      const left = e.deadline - ops.now;
      const timer = e.closed
        ? (e.onTime ? `Entregada ${hhmm(e.deliver)} · a tiempo` : `Entregada ${hhmm(e.deliver)} · ${dur(e.deliver - e.deadline)} tarde`)
        : (left >= 0 ? `Faltan ${dur(left)} · límite ${hhmm(e.deadline)}` : `Vencida hace ${dur(-left)}`);
      const ttone = e.closed ? (e.onTime ? 'ok' : 'warn') : left < 0 ? 'crit' : left < 3600 ? 'warn' : 'muted';
      return `<button class="urg" data-id="${e.id}" data-level="${e.level}">
        <span class="u-head"><span class="chip ${lt}">${ll}</span><b>${e.id}</b><time>${hhmm(e.t0)}</time></span>
        <span class="u-unit">${esc(e.unit.nombre)} <small>· ${esc(e.unit.municipio)} · ${e.unit.ruta}</small></span>
        <span class="u-item">${esc(e.item)}${e.lines?.length > 1 ? '' : ` × ${e.qty}`}${e.cold ? ' <em class="tag cold">2–8 °C</em>' : ''}${e.transfer ? ' <em class="tag">Transferencia</em>' : ''}${e.backorder ? ' <em class="tag" style="color:#fca5a5">Sin existencia en CEDIS</em>' : ''}${e.lines?.length > 1 ? ` <em class="tag">Consolidada · ${e.lines.length} claves</em>` : ''}${e.ven ? ` <em class="tag">${{ V: 'Vital', E: 'Esencial', N: 'No esencial' }[e.ven]}</em>` : ''}${e.score != null && !e.closed ? ` <em class="tag" title="Prioridad">Prioridad ${e.score}</em>` : ''}</span>
        <span class="u-foot"><span class="chip ${stone}">${sl}</span><span class="u-timer" data-tone="${ttone}">${timer}</span></span></button>`;
    }).join('') || '<p class="empty">Sin solicitudes urgentes</p>';
    const box = this.$('urg-list');
    if (box._html !== html) {
      box.innerHTML = html; box._html = html;
      box.querySelectorAll('.urg').forEach(b => b.addEventListener('click', () => {
        const e = ops.emergencies.find(x => x.id === b.dataset.id);
        if (!e) return;
        this.selectUnit(e.unit, [['Solicitud', `${e.id} · ${LEVEL[e.level][0]}`], ['Clave solicitada', `${e.item} × ${e.qty}`],
          ['Recibida', hhmm(e.t0)], ['Límite de entrega', hhmm(e.deadline)], ['Estado', URG_STATE[ops.emergencyState(e)][0]],
          ...(e.fromUnit ? [['Origen', `Existencia en cero en la unidad${e.trigger ? ' (' + e.trigger + ')' : ''}`], ['Llegada estimada', hhmm(e.deliver)]] : [])]);
      }));
    }
  }
}

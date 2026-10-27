// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  contratos-ui.js · Pestaña "Contratos" del panel del CEDIS
//  Contratos con su bolsa de penas contra la fianza, órdenes abiertas con sus
//  partidas, camiones de proveedor del día y bitácora del expediente.
// =====================================================================
import { REGLAS, ESTADO_ES, mxn, fecha } from './contratos.js';

const DAY = 86400;
const SEM_CHIP = { VERDE: 'ok', AMARILLO: 'warn', NARANJA: 'accent', ROJO: 'crit' };
const EST_CHIP = {
  VIGENTE: 'ok', EN_RIESGO: 'warn', EN_RESCISION: 'crit', RESCINDIDO_PARCIAL: 'accent', RESCINDIDO: 'crit',
  ACEPTADA_TOTAL: 'ok', ACEPTADA_CON_CANJE: 'warn', ENTREGA_PARCIAL: 'accent', EN_MORA: 'crit', EN_PLAZO: 'muted', RECHAZADA_TEMPERATURA: 'crit',
  RECHAZADA_FEUM: 'crit', RECHAZADA_CADUCIDAD: 'crit', CANCELADA_SALDO: 'crit', SURTIDA_POR_SEGUNDO_LUGAR: 'info', EN_RESCATE: 'info',
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = t => { const s = ((t % DAY) + DAY) % DAY; return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`; };
const PHASE_CHIP = { programado: 'muted', entrando: 'info', 'en patio': 'warn', 'a andén': 'info', descarga: 'accent', 'inspección': 'accent', salida: 'muted', 'salió': 'muted' };

export class ContratosUI {
  constructor(app, motor, c3d, { onFocusPatio } = {}) {
    this.app = app; this.K = motor; this.c3d = c3d; this.open = new Set(); this._acc = 9;
    this.el = id => document.getElementById(id);
    this.el('ct-patio')?.addEventListener('click', () => onFocusPatio?.());
    this.el('ct-list')?.addEventListener('click', e => {
      const h = e.target.closest('[data-k]'); if (!h) return;
      const id = h.dataset.k; this.open.has(id) ? this.open.delete(id) : this.open.add(id);
      this.render(true);
    });
    this.el('ct-nota').textContent = REGLAS.fundamento.nota;
  }

  /** Abre la pestaña y despliega un contrato (desde el tablero 3D o un camión) */
  show(id, osId = null) {
    this.app.opsUI?.showTab('contratos');
    document.getElementById('kpi-panel')?.classList.remove('closed');
    this.open.add(id); this.focusOS = osId;
    this.render(true);
    requestAnimationFrame(() => document.querySelector(osId ? `[data-os="${osId}"]` : `[data-k="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  update(dt = 0.25) {
    this._acc += dt;
    const E = this.K.estado(this.app.ops.now);
    const badge = this.el('ct-count');
    const n = E.contratos.filter(c => c.sem === 'ROJO').length;
    if (badge) badge.textContent = n || '';
    if (this.app.opsUI?.tab !== 'contratos') return;
    if (this._acc < 1) return;
    this._acc = 0;
    this.render();
  }

  render(force = false) {
    const t = this.app.ops.now, E = this.K.estado(t);
    if (!force && this._lastKey === E.t && this._lastMin === Math.floor(t / 60)) return;
    this._lastKey = E.t; this._lastMin = Math.floor(t / 60);
    const cs = E.contratos;
    this.el('ct-risk').textContent = cs.filter(c => c.estado !== 'VIGENTE').length;
    this.el('ct-os').textContent = cs.reduce((n, c) => n + c.abiertas.length, 0);
    this.el('ct-penas').textContent = mxn(cs.reduce((n, c) => n + c.penas, 0) / 1e3) + ' mil';

    this.el('ct-list').innerHTML = cs.map(c => this.cardHTML(c, t)).join('');

    // camiones de hoy
    const trucks = this.c3d?.ready ? this.c3d.truckList(t) : [];
    this.el('ct-trucks-sum').textContent = trucks.length ? `${trucks.length} remisiones · ${trucks.filter(x => x.cam.rechazos).length} con rechazo` : 'sin arribos';
    this.el('ct-trucks').innerHTML = trucks.length ? trucks.map(x => {
      const c = x.cam, ok = c.items.length - c.rechazos;
      return `<div class="ct-truck" data-os="${c.os.id}">
        <div class="ct-row"><b>${hhmm(x.tArr)}</b><span>${esc(c.os.id)} · ${esc(c.os.k.id)} · ${esc(c.rescate ? c.prov : c.os.k.prov)}</span><em class="chip ${PHASE_CHIP[x.phase]}">${x.phase}${x.phase === 'descarga' || x.phase === 'inspección' ? ' ' + x.dock : x.phase === 'en patio' ? ' E' + x.slot : ''}</em></div>
        <div class="ct-sub">${c.frio ? 'Red fría · ' : ''}${ok}/${c.items.length} partidas aceptadas${c.items.map(i => i.e.aceptada ? '' : ` · <span class="crit">${esc(i.p.m.n)}: ${esc(i.e.motivo)}</span>`).join('')}</div>
      </div>`;
    }).join('') : '<p class="muted sub">Hoy no llegan camiones de proveedor.</p>';

    // bitácora
    this.el('ct-log').innerHTML = this.K.bitacora(t, 30).map(h =>
      `<li><time>${fecha(Math.floor(h.t / DAY))} ${hhmm(h.t)}</time><span>${esc(h.texto)}${h.docs.length ? ` <small class="muted">doc. ${h.docs.join(', ')}</small>` : ''}</span></li>`).join('');
  }

  cardHTML(c, t) {
    const k = c.k, pct = Math.min(100, c.ratio * 100);
    const open = this.open.has(k.id);
    let body = '';
    if (open) {
      const pr = c.proc && t >= pr0(c.proc) ? c.proc : null;
      body = `<div class="ct-body">
        <div class="kv"><span>Monto máximo · mínimo (40 %)</span><b>${mxn(k.montoMax)} · ${mxn(k.montoMin)}</b></div>
        <div class="kv"><span>Ejercido</span><b>${mxn(c.ejercido)} (${Math.round(c.pctEjercido * 100)} %)</b></div>
        <div class="kv"><span>Fianza de cumplimiento (10 %)</span><b>${mxn(k.fianza)}</b></div>
        <div class="kv"><span>Penas devengadas · deducciones</span><b>${mxn(c.penas)} · ${mxn(c.deducciones)}</b></div>
        <div class="kv"><span>Segundo lugar</span><b>${esc(k.segundo)} (+${(k.difSegundo * 100).toFixed(1)} %)</b></div>
        ${pr ? `<div class="ct-proc"><b>Rescisión ${pr.tipo.toLowerCase()}</b> · ${esc(pr.causa)}<br>
          Inicio ${fecha(pr.dInicio)} → audiencia hasta ${fecha(pr.dAud)} (${REGLAS.audienciaHabiles} días hábiles) → resolución ${fecha(pr.dRes)}
          ${pr.partidas.length ? `<br>Partidas: ${pr.partidas.map(p => esc(p.m.n)).join(', ')}` : ''}</div>` : ''}
        ${c.abiertas.length ? c.abiertas.map(e => this.osHTML(e)).join('') : '<p class="muted sub">Sin órdenes abiertas.</p>'}
      </div>`;
    }
    return `<div class="ct-card ${open ? 'open' : ''}">
      <div class="ct-head" data-k="${k.id}">
        <i class="ct-dot ${SEM_CHIP[c.sem]}"></i>
        <div class="ct-title"><b>${k.id} · ${esc(k.prov)}</b><span>${esc(k.objeto)}</span></div>
        <em class="chip ${EST_CHIP[c.estado] || 'muted'}">${ESTADO_ES[c.estado]}</em>
      </div>
      <div class="ct-bolsa" title="Penas devengadas contra el tope de la fianza">
        <div class="bar"><i class="${c.semBolsa === 'VERDE' ? '' : 'hi'}" style="width:${pct.toFixed(1)}%;${c.semBolsa === 'ROJO' || c.semBolsa === 'NARANJA' ? 'background:var(--crit)' : ''}"></i></div>
        <span>${pct.toFixed(1)} % de la fianza · ${c.abiertas.length} OS abiertas</span>
      </div>${body}
    </div>`;
  }

  osHTML(e) {
    const os = e.os;
    const rows = e.partidas.map(x => `<tr>
      <td>${x.p.num}</td><td>${esc(x.p.m.n)}${x.p.frio ? ' <small class="muted">2–8 °C</small>' : ''}</td>
      <td class="n">${x.aceptadas.toLocaleString('es-MX')}/${x.p.q.toLocaleString('es-MX')}</td>
      <td><em class="chip ${EST_CHIP[x.estado] || 'muted'}">${ESTADO_ES[x.estado] || x.estado}</em></td>
      <td class="n">${x.dias ? x.dias + ' d' : ''}</td><td class="n">${x.pena ? mxn(x.pena) : ''}</td></tr>`).join('');
    const plazo = e.estado === 'ATRASADA' || e.estado === 'EN_RESCATE' ? `vencida el ${fecha(os.dLim)}` : `vence ${fecha(os.dLim)} (${e.restantes} d)`;
    return `<div class="ct-os ${this.focusOS === os.id ? 'focus' : ''}" data-os="${os.id}">
      <div class="ct-row"><b>${os.id}</b><span>${fecha(os.d)} · ${plazo}${os.acuseTarde ? ' · acuse tardío' : ''}${os.crisis ? ' · falla del proveedor' : ''}</span>
        <em class="chip ${SEM_CHIP[e.sem]}">${ESTADO_ES[e.estado]}</em></div>
      <table class="ct-tab"><thead><tr><th>#</th><th>Clave</th><th class="n">Acept./sol.</th><th>Dictamen</th><th class="n">Atraso</th><th class="n">Pena</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }
}
const pr0 = pr => pr.dInicio * DAY + 10 * 3600;

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  cedis-link.js · Enlace unidades → CEDIS
//  Calcula el abasto de las 60 unidades con la misma simulación que la
//  vista de la unidad (supply.js). Cuando una clave se agota en una
//  unidad, su solicitud urgente aparece en el panel de Urgencias del
//  CEDIS con el mismo folio, cantidad, nivel y hora de llegada.
//  Como el cálculo es determinista, el CEDIS (PC) y la unidad (iPad)
//  muestran lo mismo sin depender de una conexión entre páginas.
//  >>> API: con datos reales, aquí se reciben las solicitudes del sistema
//  de farmacia de cada unidad (REST o WebSocket).
// =====================================================================
import { UnitSupply, makeCalendar, reqScore } from './supply.js';

const plural = w => (/[aeiou]$/.test(w) ? w + 's' : w + 'es');

export class CedisLink {
  constructor(ops, catalog) {
    this.ops = ops;
    this.cal = makeCalendar(ops.data);
    this.sups = ops.units.map(u => new UnitSupply(u, catalog, this.cal));
    this.byUnit = new Map(this.sups.map(s => [s.unit, s]));
    this.known = new Map();          // id → emergencia en ops
    this.day = null; this.ready = false; this._last = 0;
    this.status = new Map();         // unidad → { open, zero }
  }

  /** Prepara el día en segundo plano (pocas unidades por cuadro para no trabar el visor). */
  prepare(idx) {
    this.day = idx; this.ready = false;
    let i = 0;
    const step = () => {
      if (this.day !== idx) return;
      const t0 = performance.now();
      while (i < this.sups.length && performance.now() - t0 < 12) this.sups[i++].run(idx);
      if (i < this.sups.length) setTimeout(step, 0);
      else { this.ready = true; this._last = 0; this.tick(this.ops.now, true); }
    };
    step();
  }

  /** Llamar con el reloj del CEDIS (se limita a cada ~1.5 s reales). */
  tick(now, force) {
    const idx = Math.floor(now / 86400);
    if (idx !== this.day) { this.prepare(idx); return; }
    if (!this.ready) return;
    const t = performance.now();
    if (!force && t - this._last < 1500) return;
    this._last = t;
    const ops = this.ops;
    this.pex = [];
    for (const s of this.sups) {
      const st = s.at(now);
      for (const p of st.pexList || []) if (p.t0 <= now) this.pex.push({ u: s.unit, p });
      this.status.set(s.unit, { open: st.open.length, zero: s.items.filter(m => st.stock.get(m.c) <= 0).length });
      for (const r of [...st.open, ...st.reqs]) {
        const item = `${r.name} · ${plural(r.pz)}${r.lines.length > 1 ? ` + ${r.lines.length - 1} claves` : ''}`;
        if (this.known.has(r.id)) {     // solicitud consolidada: puede crecer durante el día
          const e = this.known.get(r.id);
          Object.assign(e, { item, level: r.level, lines: r.lines, score: reqScore(r, now), base: r.base });
          continue;
        }
        const e = {
          id: r.id, level: r.level, unit: s.unit, item, qty: r.q, cold: r.cold, transfer: r.transfer, backorder: r.backorder,
          t0: r.t0, validated: r.validated, dispatch: r.dispatch, deliver: r.deliver, deadline: r.deadline,
          closed: false, fromUnit: true, trigger: r.trigger, lines: r.lines, ven: r.ven, base: r.base, score: reqScore(r, now),
        };
        this.known.set(r.id, e);
        ops.emergencies.push(e);
        if (now - r.t0 < 15 * 60) ops.onEmergency?.(e);
      }
    }
    // cola priorizada: abiertas primero, por puntuación de prioridad
    for (const e of ops.emergencies) if (e.fromUnit && !e.closed) e.score = reqScore(e, now);
    ops.emergencies.sort((a, b) => (a.closed - b.closed) || (b.score ?? 0) - (a.score ?? 0) || b.t0 - a.t0);
    if (ops.emergencies.length > 80) ops.emergencies.length = 80;
  }

  /** Envío del CEDIS a la unidad (misma simulación) */
  supplyOf(u) { return this.byUnit.get(u); }
}

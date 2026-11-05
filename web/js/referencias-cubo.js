// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-cubo.js · Resumen diario de las referencias (red nacional)
//  Con 1,200 unidades no se puede recorrer cada referencia en cada cuadro.
//  El cubo se arma una vez (en un worker) y responde al instante:
//   · etapas(día, estados)   → referencias por etapa × antigüedad
//   · saturacion(día, rx)    → lista de espera L, demanda λ, capacidad μ,
//                              utilización ρ = λ/μ, espera W = L/μ (Ley de Little)
//   · flujos(día, ventana)   → envíos origen → destino agregados por
//                              unidad, estado o región
//  Foto de cada día a las 08:00 (misma hora que el corte del gemelo).
//  Se transfiere entre hilos como arreglos tipados (toTransfer / Cubo.from).
// =====================================================================
import { ETAPAS, TERMINAL, REGLAS, DAY, H } from './referencias.js';

export const ET = Object.keys(ETAPAS);
const IET = Object.fromEntries(ET.map((k, i) => [k, i]));
/** antigüedad desde la creación: [0,10) [10,15) [15,30) [30,90) [90,∞) días */
export const EDADES = [10, 15, 30, 90];
export const EDAD_ES = ['< 10 días', '10–15 días', '15–30 días', '30–90 días', '> 90 días'];
const NB = EDADES.length + 1;
const ESPERA = new Set(['ACEPTACION', 'LIMBO', 'CITA', 'NO_ACUDIO']);           // en la lista de espera de la receptora
const ATENCION = new Set(['URGENCIAS', 'ESPECIALIDAD', 'ESTUDIOS', 'CONTRARREF']); // en atención en la receptora
const CIERRES = ['CERRADA', 'SIN_CIERRE', 'ABANDONO', 'QUEMADA'];
// eventos diarios por receptora
// LLEGADAS = entran a la lista de espera (envío recibido); SALIDAS = dejan la lista (atendidas, devueltas, quemadas, abandono)
const EV = { LLEGADAS: 0, ACEPTADAS: 1, ATENDIDAS: 2, DEVUELTAS: 3, NO_ACUDIO: 4, SALIDAS: 5 };
const NEV = 6;
// eventos diarios por estado (de la unidad que refiere)
const EVE = { CREADAS: 0, ATENDIDAS: 1, EN_PLAZO: 2, CERRADA: 3, SIN_CIERRE: 4, ABANDONO: 5, QUEMADA: 6 };
const NEVE = 7;

export class Cubo {
  /** @param K instancia de Referencias */
  static build(K, { hora = 8 } = {}) {
    const d0 = K.inicio, ND = K.corteDia - d0 + 1, h = hora * H;
    const estados = K.nacional ? Object.keys(K.red.estados).sort() : ['13'];
    const IE = Object.fromEntries(estados.map((c, i) => [c, i]));
    const rxs = K.receptoras, IR = Object.fromEntries(rxs.map((u, i) => [u.id, i]));
    const NE = estados.length, NR = rxs.length, NET = ET.length;
    const occ = new Int32Array((ND + 1) * NE * NET * NB);
    const espera = new Int32Array((ND + 1) * NR), limbo = new Int32Array((ND + 1) * NR), atencion = new Int32Array((ND + 1) * NR);
    const evRx = new Int32Array(ND * NR * NEV), evE = new Int32Array(ND * NE * NEVE);
    const fl = { dia: [], ori: [], des: [], tipo: [], fuera: [] };
    const NEM = K.emisoras.length;
    // índice de la foto: primer día cuya foto (d·DAY + h) es ≥ t
    const snap = t => Math.min(ND, Math.max(0, Math.ceil((t - h) / DAY) - d0));
    const evDay = t => { const d = Math.floor(t / DAY) - d0; return d >= 0 && d < ND ? d : -1; };
    const add = (arr, stride, idx, a, b) => { const i = snap(a), j = snap(b); if (j > i) { arr[i * stride + idx]++; arr[j * stride + idx]--; } };
    const SO = NE * NET * NB;

    for (const r of K.refs) {
      const e = IE[r.emisora.cve] ?? 0, base = r.tCrea;
      const lim = EDADES.map(x => base + x * DAY);
      const g = r.seg;
      for (let i = 0; i < g.length; i++) {
        const s = g[i], et = IET[s.etapa];
        // un final se ve unos días; una quemada que se re-emite, solo hasta la nueva solicitud
        const arch = s.t0 + REGLAS.archivarDias * DAY;
        const a = s.t0, b = !TERMINAL.has(s.etapa) ? s.t1 : i === g.length - 1 ? arch : Math.min(s.t1, arch);
        if (b > a) {
          // tramo partido por los cortes de antigüedad
          let lo = a;
          for (let k = 0; k < NB && lo < b; k++) {
            const hi = k < EDADES.length ? Math.min(b, lim[k]) : b;
            if (hi > lo) add(occ, SO, (e * NET + et) * NB + k, lo, hi);
            lo = Math.max(lo, hi);
          }
          if (s.rx) {
            const x = IR[s.rx];
            if (ESPERA.has(s.etapa)) add(espera, NR, x, a, b);
            if (s.etapa === 'LIMBO') add(limbo, NR, x, a, b);
            if (ATENCION.has(s.etapa)) add(atencion, NR, x, a, b);
          }
        }
        // eventos del día
        const d = evDay(s.t0), prev = g[i - 1]?.etapa;
        if (d < 0) continue;
        if (prev && ESPERA.has(prev) && !ESPERA.has(s.etapa) && g[i - 1].rx) evRx[(d * NR + IR[g[i - 1].rx]) * NEV + EV.SALIDAS]++;
        if (s.rx) {
          const x = IR[s.rx], o = (d * NR + x) * NEV;
          if (s.etapa === 'ACEPTACION' && prev !== 'LIMBO') {
            evRx[o + EV.LLEGADAS]++;
            const escal = prev === 'TERCER';
            const ori = escal ? NEM + IR[g[i - 1].rx] : r.emisora.idx;
            fl.dia.push(d); fl.ori.push(ori); fl.des.push(x);
            fl.tipo.push(escal ? 2 : g.slice(0, i).some(z => z.etapa === 'DEVUELTA') ? 1 : 0);
            fl.fuera.push(/Fuera de región/.test(s.nota) ? 1 : 0);
          }
          if (s.etapa === 'CITA' && prev === 'ACEPTACION') evRx[o + EV.ACEPTADAS]++;
          if ((s.etapa === 'ESPECIALIDAD' && prev === 'CITA') || (s.etapa === 'URGENCIAS' && prev === 'CITA')) evRx[o + EV.ATENDIDAS]++;
          if (s.etapa === 'DEVUELTA') evRx[o + EV.DEVUELTAS]++;
          if (s.etapa === 'NO_ACUDIO') evRx[o + EV.NO_ACUDIO]++;
        }
        const oe = (d * NE + e) * NEVE;
        if (i === 0) evE[oe + EVE.CREADAS]++;
        if (CIERRES.includes(s.etapa) && i === g.length - 1) evE[oe + EVE[s.etapa]]++;
      }
      const da = evDay(r.tAtencion);
      if (r.tAtencion < Infinity && da >= 0) {
        const oe = (da * NE + e) * NEVE;
        evE[oe + EVE.ATENDIDAS]++;
        if (r.tAtencion - r.tCrea <= REGLAS.plazoDias * DAY) evE[oe + EVE.EN_PLAZO]++;
      }
    }
    // de diferencias a fotos
    const acum = (arr, stride) => { for (let d = 1; d <= ND; d++) { const o = d * stride, p = o - stride; for (let k = 0; k < stride; k++) arr[o + k] += arr[p + k]; } };
    acum(occ, SO); acum(espera, NR); acum(limbo, NR); acum(atencion, NR);
    // flujos ordenados por día
    const ord = fl.dia.map((_, i) => i).sort((a, b) => fl.dia[a] - fl.dia[b]);
    const pick = (k, T) => T.from(ord, i => fl[k][i]);
    const meta = {
      d0, ND, hora, estados, NE, NR, NET, NEM,
      region: estados.map(c => (K.nacional ? K.red.estados[c].region : 'I')),
      rx: rxs.map(u => ({ id: u.id, corto: u.corto, nombre: u.nombre, tipo: u.tipo, nivel: u.nivel ?? (u.idx > 4 ? 3 : 2), cve: u.cve, region: u.region, xy: u.xy || null, color: u.color })),
      em: K.emisoras.map(e => ({ id: e.id, corto: e.corto, tipo: e.tipo, cve: e.cve, region: e.region, xy: e.xy || null })),
    };
    return new Cubo({
      meta, occ, espera, limbo, atencion, evRx, evE,
      fDia: pick('dia', Int32Array), fOri: pick('ori', Int32Array), fDes: pick('des', Int32Array), fTipo: pick('tipo', Uint8Array), fFuera: pick('fuera', Uint8Array),
    });
  }

  constructor(o) {
    Object.assign(this, o);
    const m = this.meta;
    this.IE = Object.fromEntries(m.estados.map((c, i) => [c, i]));
    // índice del primer flujo de cada día
    this.fIni = new Int32Array(m.ND + 1);
    let j = 0;
    for (let d = 0; d <= m.ND; d++) { while (j < this.fDia.length && this.fDia[j] < d) j++; this.fIni[d] = j; }
  }
  static from(o) { return new Cubo(o); }
  toTransfer() {
    const o = { meta: this.meta, occ: this.occ, espera: this.espera, limbo: this.limbo, atencion: this.atencion, evRx: this.evRx, evE: this.evE, fDia: this.fDia, fOri: this.fOri, fDes: this.fDes, fTipo: this.fTipo, fFuera: this.fFuera };
    const buf = Object.values(o).filter(x => ArrayBuffer.isView(x)).map(x => x.buffer);
    return [o, buf];
  }

  /** día del cubo para el instante t (foto de las 08:00 de ese día o la anterior) */
  dia(t) { const m = this.meta; return Math.min(m.ND - 1, Math.max(0, Math.floor((t - m.hora * H) / DAY) - m.d0)); }
  /** índices de estado para un filtro {cve} | {region} | nada */
  _estados(f = {}) {
    const m = this.meta;
    if (f.cve) return [this.IE[f.cve]];
    if (f.region) return m.estados.map((c, i) => i).filter(i => m.region[i] === f.region);
    return null;
  }

  /** referencias por etapa × antigüedad en la foto del día (de pacientes de esos estados) */
  etapas(di, f = {}) {
    const m = this.meta, out = ET.map(() => new Array(NB).fill(0)), es = this._estados(f) ?? m.estados.map((_, i) => i);
    const SO = m.NE * m.NET * NB;
    for (const e of es) for (let et = 0; et < m.NET; et++) {
      const o = di * SO + (e * m.NET + et) * NB;
      for (let b = 0; b < NB; b++) out[et][b] += this.occ[o + b];
    }
    return Object.fromEntries(ET.map((k, i) => [k, out[i]]));
  }

  /** saturación de una receptora: ventana en días para λ y μ */
  saturacion(di, x, ventana = 28) {
    const m = this.meta, NR = m.NR, a = Math.max(0, di - ventana + 1), dias = di - a + 1;
    let lleg = 0, acep = 0, aten = 0, dev = 0, noa = 0, sal = 0;
    for (let d = a; d <= di; d++) {
      const o = (d * NR + x) * NEV;
      lleg += this.evRx[o + EV.LLEGADAS]; acep += this.evRx[o + EV.ACEPTADAS]; aten += this.evRx[o + EV.ATENDIDAS];
      dev += this.evRx[o + EV.DEVUELTAS]; noa += this.evRx[o + EV.NO_ACUDIO]; sal += this.evRx[o + EV.SALIDAS];
    }
    // unidades con poco movimiento: se amplía la ventana hasta tener al menos 5 salidas (máx. 112 días)
    if (sal < 5 && ventana < 112 && a > 0) return this.saturacion(di, x, Math.min(112, ventana * 2));
    const L = this.espera[di * NR + x], L0 = this.espera[a * NR + x];
    // Ley de Little sobre la lista de espera: W = L / ritmo de salida; ρ = entradas / salidas (> 1: la lista crece)
    const lambda = lleg / dias, sale = sal / dias;
    const W = sale > 0 ? L / sale : L > 0 ? Infinity : 0;
    const rho = sale > 0 ? lambda / sale : lambda > 0 ? Infinity : 0;
    return {
      L, limbo: this.limbo[di * NR + x], enAtencion: this.atencion[di * NR + x], tendencia: L - L0,
      lambdaSem: 7 * lambda, salidasSem: 7 * sale, muSem: 7 * aten / dias, aceptadasSem: 7 * acep / dias,
      devueltasSem: 7 * dev / dias, noAcudioSem: 7 * noa / dias, rho, W, ventana: dias, sem: semSat(W, rho, L - L0),
    };
  }
  /** todas las receptoras, con su lugar relativo de espera (0 = la que menos espera, 1 = la que más) */
  saturacionTodas(di, ventana = 28) {
    const S = this.meta.rx.map((u, x) => ({ u, x, ...this.saturacion(di, x, ventana) }));
    const ord = [...S].sort((a, b) => a.W - b.W);
    ord.forEach((s, i) => { s.rango = ord.length > 1 ? i / (ord.length - 1) : 0; });
    return S;
  }

  /** resumen por estado/región/país en la ventana */
  resumen(di, f = {}, ventana = 90) {
    const m = this.meta, es = this._estados(f) ?? m.estados.map((_, i) => i), a = Math.max(0, di - ventana + 1);
    const o = Object.fromEntries(Object.keys(EVE).map(k => [k, 0]));
    for (let d = a; d <= di; d++) for (const e of es) { const b = (d * m.NE + e) * NEVE; for (const [k, v] of Object.entries(EVE)) o[k] += this.evE[b + v]; }
    return o;
  }

  /**
   * envíos origen → destino en la ventana, agregados por nivel: 'unidad' | 'estado' | 'region'
   * Origen = unidad que refiere (o la receptora que escala); destino = receptora.
   */
  flujos(di, ventana = 28, nivel = 'estado', f = {}) {
    const m = this.meta, a = Math.max(0, di - ventana + 1), out = new Map();
    const lugar = (u, nodo) => (nivel === 'unidad' ? nodo : nivel === 'estado' ? u.cve : u.region);
    for (let j = this.fIni[a]; j < this.fIni[di + 1]; j++) {
      const oi = this.fOri[j], esc = oi >= m.NEM, uo = esc ? m.rx[oi - m.NEM] : m.em[oi], ud = m.rx[this.fDes[j]];
      if (f.region && uo.region !== f.region && ud.region !== f.region) continue;
      if (f.cve && uo.cve !== f.cve && ud.cve !== f.cve) continue;
      const ko = lugar(uo, esc ? 'R' + (oi - m.NEM) : 'E' + oi), kd = lugar(ud, 'R' + this.fDes[j]), key = ko + '>' + kd;
      let g = out.get(key);
      if (!g) out.set(key, g = { ori: ko, des: kd, n: 0, fuera: 0, escal: 0, reenvio: 0 });
      g.n++; g.fuera += this.fFuera[j]; if (this.fTipo[j] === 2) g.escal++; if (this.fTipo[j] === 1) g.reenvio++;
    }
    return [...out.values()].sort((x, y) => y.n - x.n);
  }
}

/** semáforo de saturación: espera estimada (Ley de Little), utilización y tendencia de la lista */
export function semSat(W, rho, tendencia) {
  if (W > 90 || (rho >= 1.2 && tendencia > 0)) return 'ROJO';
  if (W > 30 || rho >= 1) return 'NARANJA';
  if (W > REGLAS.plazoDias || rho >= 0.9) return 'AMARILLO';
  return 'VERDE';
}

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-mapa.js · Mapa de flujos de referencias y saturación
//  Canvas 2D sobre los estados de México (assets/estados_mx.json, km con
//  origen en el CENADI, mismas coordenadas que las unidades).
//  Agregación jerárquica según el filtro (como flowmap.gl, pero con la
//  regionalización real en vez de grupos por píxel):
//   · país   → nodos = estados; flechas estado → estado
//   · región / estado → nodos = receptoras (y emisoras como puntos);
//                       flechas unidad → unidad
//  Círculo = lista de espera · color = saturación (Ley de Little) ·
//  grosor de flecha = envíos en la ventana · partículas = N envíos.
// =====================================================================
import { semSat } from './referencias-cubo.js';

const SEM = { VERDE: '#22c55e', AMARILLO: '#facc15', NARANJA: '#f97316', ROJO: '#ef4444' };
const TIPO_C = { normal: 'rgba(45,212,191,', fuera: 'rgba(251,146,60,', escal: 'rgba(167,139,250,' };

export class MapaFlujos {
  /**
   * @param canvas elemento <canvas>
   * @param geo assets/estados_mx.json · red assets/estados_issste.json
   * @param on { select(nodo), hover(nodo|null, ev) }
   */
  constructor(canvas, C, geo, red, on = {}) {
    Object.assign(this, { canvas, C, on, ctx: canvas.getContext('2d') });
    this.estados = Object.fromEntries(red.estados.map(e => [e.cve, e]));
    this.geo = geo.estados.map(g => ({ ...g, bbox: bbox(g.polys.flatMap(p => p.ext)) }));
    this.ventana = 28; this.top = 120; this.sel = null; this.nodos = []; this.flechas = [];
    this.base = document.createElement('canvas');
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas);
    canvas.addEventListener('mousemove', ev => this._hover(ev));
    canvas.addEventListener('mouseleave', () => { this.hoverN = null; this.on.hover?.(null); });
    canvas.addEventListener('click', ev => { const n = this._hit(ev); if (n) this.on.select?.(n); });
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    for (const c of [this.canvas, this.base]) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    this._vista(); this._dibujarBase(); this._proyectar();
  }

  /** datos del día di con el filtro f ({}, {region}, {cve}) y la unidad seleccionada */
  set(di, f = {}, sel = null) {
    const cambioVista = JSON.stringify(f) !== JSON.stringify(this.f);
    Object.assign(this, { di, f, sel });
    if (cambioVista) { this._vista(); this._dibujarBase(); }
    this._datos();
    this._proyectar();
  }

  // ---------------------------------------------------------------- vista
  _estadosVista() {
    const f = this.f || {};
    return this.geo.filter(g => (f.cve ? g.cve === f.cve : f.region ? this.estados[g.cve]?.region === f.region : true));
  }
  _vista() {
    if (!this.w) return;
    const gs = this._estadosVista();
    let [x0, y0, x1, y1] = bbox(gs.map(g => [g.bbox[0], g.bbox[1]]).concat(gs.map(g => [g.bbox[2], g.bbox[3]])));
    const px = (x1 - x0) * 0.08 + 10, py = (y1 - y0) * 0.08 + 10;
    x0 -= px; x1 += px; y0 -= py; y1 += py;
    const s = Math.min(this.w / (x1 - x0), this.h / (y1 - y0));
    this.T = { s, ox: (this.w - s * (x1 + x0)) / 2, oy: (this.h + s * (y1 + y0)) / 2 };
  }
  P(xy) { const T = this.T; return [T.ox + T.s * xy[0], T.oy - T.s * xy[1]]; }
  _dibujarBase() {
    if (!this.T) return;
    const c = this.base.getContext('2d'), dpr = this.dpr, f = this.f || {};
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    for (const g of this.geo) {
      const dentro = f.cve ? g.cve === f.cve : f.region ? this.estados[g.cve]?.region === f.region : true;
      c.beginPath();
      for (const p of g.polys) for (const ring of [p.ext, ...(p.holes || [])]) {
        ring.forEach((xy, i) => { const [x, y] = this.P(xy); i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.closePath();
      }
      c.fillStyle = dentro ? '#17212b' : '#0f151c';
      c.strokeStyle = dentro ? 'rgba(148,163,184,.35)' : 'rgba(148,163,184,.12)';
      c.lineWidth = 0.8;
      c.fill('evenodd'); c.stroke();
    }
  }

  // ---------------------------------------------------------------- datos
  _datos() {
    const C = this.C, m = C.meta, f = this.f || {}, di = this.di;
    const sat = C.saturacionTodas(di, this.ventana);
    this.sat = sat;
    const nivel = f.cve || f.region ? 'unidad' : 'estado';
    this.nivel = nivel;
    const nodos = new Map();
    if (nivel === 'estado') {
      // un nodo por estado: lista de espera y saturación de todas sus receptoras juntas
      for (const [cve, E] of Object.entries(this.estados)) {
        const ss = sat.filter(s => s.u.cve === cve);
        const L = ss.reduce((a, s) => a + s.L, 0), sal = ss.reduce((a, s) => a + s.salidasSem, 0), ent = ss.reduce((a, s) => a + s.lambdaSem, 0), tend = ss.reduce((a, s) => a + s.tendencia, 0);
        const W = sal > 0 ? L / (sal / 7) : L ? Infinity : 0, rho = sal > 0 ? ent / sal : 0;
        nodos.set(cve, { key: cve, tipo: 'estado', cve, xy: E.hub, nombre: E.nombre, abbr: E.abbr, L, W, rho, ent, sal, sem: semSat(W, rho, tend), nRx: ss.length });
      }
    } else {
      const dentro = u => (f.cve ? u.cve === f.cve : u.region === f.region);
      m.em.forEach((e, i) => { if (dentro(e)) nodos.set('E' + i, { key: 'E' + i, tipo: 'em', idx: i, xy: e.xy, nombre: e.corto, corto: e.corto, cve: e.cve, L: 0 }); });
      sat.filter(s => dentro(s.u)).forEach(s => nodos.set('R' + s.x, { key: 'R' + s.x, tipo: 'rx', x: s.x, xy: s.u.xy, nombre: s.u.nombre, corto: s.u.corto, cve: s.u.cve, L: s.L, W: s.W, rho: s.rho, ent: s.lambdaSem, sal: s.salidasSem, sem: s.sem, s }));
    }
    // flechas
    const fl = C.flujos(di, this.ventana, nivel, f).filter(g => g.ori !== g.des).slice(0, nivel === 'estado' ? this.top : this.top * 2);
    const out = [];
    for (const g of fl) {
      const a = this._lugar(g.ori, nodos), b = this._lugar(g.des, nodos);
      if (!a || !b) continue;
      out.push({ ...g, a, b, tipo: g.escal > g.n / 2 ? 'escal' : g.fuera > g.n / 2 ? 'fuera' : 'normal' });
    }
    this.flechas = out;
    this.nodos = [...nodos.values()];
    this.maxN = Math.max(1, ...out.map(g => g.n));
    this.maxL = Math.max(1, ...this.nodos.filter(n => n.tipo !== 'em').map(n => n.L || 0));
  }
  /** nodo para una clave de flujo; crea emisoras o receptoras de fuera cuando hace falta */
  _lugar(k, nodos) {
    if (nodos.has(k)) return nodos.get(k);
    const m = this.C.meta;
    if (k[0] === 'E') {
      const e = m.em[+k.slice(1)];
      const n = { key: k, tipo: 'em', idx: +k.slice(1), xy: e.xy, nombre: e.corto, corto: e.corto, cve: e.cve, L: 0 };
      nodos.set(k, n); return n;
    }
    if (k[0] === 'R') {
      const x = +k.slice(1), s = this.sat[x];
      const n = { key: k, tipo: 'rx', x, fuera: true, xy: s.u.xy, nombre: s.u.nombre, corto: s.u.corto, cve: s.u.cve, L: s.L, W: s.W, rho: s.rho, ent: s.lambdaSem, sal: s.salidasSem, sem: s.sem, s };
      nodos.set(k, n); return n;
    }
    return null;
  }
  _proyectar() {
    if (!this.T || !this.nodos) return;
    for (const n of this.nodos) {
      [n.px, n.py] = this.P(n.xy);
      n.r = n.tipo === 'em' ? 2.2 : (this.nivel === 'estado' ? 5 : 4) + (this.nivel === 'estado' ? 20 : 16) * Math.sqrt((n.L || 0) / this.maxL);
    }
    for (const g of this.flechas) {
      const ax = g.a.px, ay = g.a.py, bx = g.b.px, by = g.b.py, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      // curva hacia la derecha del sentido de viaje: ida y vuelta no se enciman
      g.cx = (ax + bx) / 2 + (dy / L) * L * 0.18; g.cy = (ay + by) / 2 - (dx / L) * L * 0.18;
      g.w = 0.8 + 6 * Math.sqrt(g.n / this.maxN);
      g.k = Math.max(1, Math.min(8, Math.round(6 * g.n / this.maxN)));
    }
  }

  // ---------------------------------------------------------------- dibujo (cada cuadro)
  draw(now) {
    if (!this.T) return;
    const c = this.ctx, dpr = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sel = this.sel, toca = g => !sel || g.a.key === sel || g.b.key === sel;
    // flechas
    for (const g of this.flechas) {
      const on = toca(g);
      c.strokeStyle = TIPO_C[g.tipo] + (on ? (sel ? 0.85 : 0.45) : 0.08) + ')';
      c.lineWidth = g.w;
      c.setLineDash(g.tipo === 'fuera' ? [5, 4] : []);
      c.beginPath(); c.moveTo(g.a.px, g.a.py); c.quadraticCurveTo(g.cx, g.cy, g.b.px, g.b.py); c.stroke();
    }
    c.setLineDash([]);
    // partículas: cada una recorre la flecha en 2.6 s
    for (const g of this.flechas) {
      if (!toca(g)) continue;
      c.fillStyle = TIPO_C[g.tipo] + '1)';
      for (let i = 0; i < g.k; i++) {
        const u = ((now / 2600) + i / g.k + (g.n % 7) / 7) % 1, v = 1 - u;
        const x = v * v * g.a.px + 2 * v * u * g.cx + u * u * g.b.px, y = v * v * g.a.py + 2 * v * u * g.cy + u * u * g.b.py;
        c.beginPath(); c.arc(x, y, 1.6 + g.w * 0.25, 0, 7); c.fill();
      }
    }
    // nodos: emisoras primero, luego receptoras/estados de mayor a menor
    const ord = [...this.nodos].sort((a, b) => (b.tipo === 'em') - (a.tipo === 'em') || (b.r - a.r)); // grandes abajo, chicas encima
    for (const n of ord) {
      const dim = sel && n.key !== sel && !this.flechas.some(g => toca(g) && (g.a === n || g.b === n));
      c.globalAlpha = dim ? 0.25 : 1;
      c.beginPath(); c.arc(n.px, n.py, n.r, 0, 7);
      if (n.tipo === 'em') { c.fillStyle = '#94a3b8'; c.fill(); }
      else {
        c.fillStyle = SEM[n.sem] + 'cc'; c.fill();
        c.lineWidth = n.key === sel || n === this.hoverN ? 2.5 : 1; c.strokeStyle = n.key === sel ? '#fff' : n.fuera ? '#fb923c' : 'rgba(15,21,28,.9)'; c.stroke();
      }
      if (this.nivel === 'estado' && n.r > 9) {
        c.fillStyle = '#e2e8f0'; c.font = '600 10px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(n.abbr, n.px, n.py + n.r + 11);
      }
    }
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- interacción
  _hit(ev) {
    const r = this.canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = null, bd = 1e9;
    for (const n of this.nodos) { const d = Math.hypot(n.px - x, n.py - y); if (d <= Math.max(n.r, 6) + 2 && d < bd) { bd = d; best = n; } }
    return best;
  }
  _hover(ev) {
    const n = this._hit(ev);
    this.hoverN = n;
    this.canvas.style.cursor = n ? 'pointer' : 'default';
    this.on.hover?.(n, ev);
  }
}

function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

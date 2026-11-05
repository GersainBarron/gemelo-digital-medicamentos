// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias.js · Motor del recorrido de referencia y contrarreferencia
//  (SIRECO · ISSSTE Hidalgo, Región I). Investigación base en
//  investigacion/referencia_contrarreferencia.md
//
//  Cada referencia se arma como una sola secuencia de tramos contiguos
//  (t0 → t1) que nunca se enciman: la etapa en el instante t es el último
//  tramo que empezó antes de t. Así ninguna etapa tapa a otra.
//
//  Reglas del usuario (prioridad sobre los supuestos):
//   · 15 días desde que se crea la referencia hasta que el paciente es
//     atendido en la unidad a la que fue enviado.
//   · La unidad receptora debe ACEPTAR la referencia; si no responde,
//     la referencia queda en el limbo y puede quemarse.
//   · Se distinguen los cierres: natural, atendida sin cierre, no regresó,
//     quemada; y lo que el sistema ve: en proceso, sin rastro.
//   · Cada rebote (devolución, reprogramación, re-emisión) cuenta una vuelta.
// =====================================================================
export const DAY = 86400, H = 3600;
export const BASE_DATE = Date.UTC(2026, 9, 26); // día 0 = lun 26 oct 2026 (corte del gemelo)

export const REGLAS = {
  plazoDias: 15,        // norma: de la creación a la atención en la receptora
  vigenciaDias: 90,     // [SUPUESTO] sin atención en este plazo, la referencia se quema
  sinRastroDias: 15,    // días sin movimiento registrado después de lo esperado
  archivarDias: 5,      // cuánto se ve una ficha cerrada en el diagrama
  maxVueltas: 6,
  inicio: -300,         // primer día con referencias (≈ 1 ene 2026)
  porDia: 5.5,          // [SUPUESTO] referencias por día hábil en la red ISSSTE Hidalgo
  porPeso: 0.104,       // misma tasa por unidad emisora (CMF 3, UMF 2, CAF 1) para la red nacional
  microrregion: 0.6,    // se refiere fuera de la región si la otra unidad queda a < 60 % de la distancia
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fecha = d => { const x = new Date(BASE_DATE + d * 864e5); return `${x.getUTCDate()} ${MESES[x.getUTCMonth()]}`; };
const dow = d => (((d % 7) + 7) % 7 + 1) % 7; // día 0 = lunes (getUTCDay = 1)
const MES = new Map();
const mes = d => { let m = MES.get(d); if (m === undefined) { m = new Date(BASE_DATE + d * 864e5).getUTCMonth(); MES.set(d, m); } return m; };
export const habil = d => { const w = dow(d); return w !== 0 && w !== 6; };
export const sigHabil = d => { while (!habil(d)) d++; return d; };
export function sumarHabiles(d, n) { let x = d, k = 0; while (k < n) { x++; if (habil(x)) k++; } return x; }

// --------------------------------------------------------------- azar reproducible
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (R, a) => a[Math.floor(R() * a.length)];
function pickW(R, a) { const tot = a.reduce((s, x) => s + x.w, 0); let u = R() * tot; for (const x of a) { u -= x.w; if (u <= 0) return x; } return a.at(-1); }
function poisson(R, l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; }
/** lognormal por mediana y percentil 90 */
function logn(R, med, p90) { const s = Math.log(p90 / med) / 1.2816; const z = Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R()); return med * Math.exp(s * z); }
const enHorario = (R, d, h0 = 8, h1 = 14) => sigHabil(d) * DAY + (h0 + R() * (h1 - h0)) * H;
/** avanza n días hábiles desde t (menos de medio día: unas horas el mismo día) */
function habilesDesde(R, t, n) {
  if (n < 0.5) return t + (1 + R() * 4) * H;
  return enHorario(R, sumarHabiles(Math.floor(t / DAY), Math.round(n)), 8, 15);
}

// --------------------------------------------------------------- catálogos
export const ETAPAS = {
  SOLICITUD: { n: 'Solicitud en UMF', area: 'Médico familiar', docs: ['Nota de referencia', 'SM-1-17 anverso'], sla: 'mismo día' },
  VALIDACION: { n: 'Validación', area: 'Área de referencia · emisora', docs: ['SM-1-17 sellado', 'Vigencia de derechos'], sla: '≤ 2 días hábiles' },
  ACEPTACION: { n: 'Aceptación', area: 'Unidad receptora', docs: ['Respuesta de la receptora'], sla: '≤ 3 días hábiles' },
  CITA: { n: 'Cita y traslado', area: 'Agenda de la receptora', docs: ['Comprobante de cita', 'Pasajes'], sla: 'atención ≤ 15 días desde la creación' },
  ESPECIALIDAD: { n: 'Atención especializada', area: 'Especialista', docs: ['Nota de especialidad'], sla: null },
  CONTRARREF: { n: 'Contrarreferencia', area: 'Especialista · receptora', docs: ['SM-1-17 reverso'], sla: '≤ 3 días tras el alta' },
  SEGUIMIENTO: { n: 'Seguimiento en UMF', area: 'Médico familiar', docs: ['Plan de manejo'], sla: null },
  CERRADA: { n: 'Cierre natural', area: 'Contrarreferida y en control', docs: [], sla: null },
  DEVUELTA: { n: 'Devuelta', area: 'Rechazo o corrección', docs: ['Motivo de rechazo'], sla: null },
  LIMBO: { n: 'Sin respuesta', area: 'La receptora no contesta', docs: [], sla: null },
  NO_ACUDIO: { n: 'No acudió', area: 'Cita sin registro', docs: [], sla: null },
  URGENCIAS: { n: 'Urgencias', area: 'Triage · receptora', docs: ['Nota de urgencias'], sla: null },
  ESTUDIOS: { n: 'Estudio diferido', area: 'Auxiliares de diagnóstico', docs: ['Solicitud de estudio'], sla: null },
  TERCER: { n: 'Envío a otro nivel', area: '3er nivel o microrregión', docs: ['Nueva SM-1-17'], sla: null },
  QUEMADA: { n: 'Quemada', area: 'Venció sin atención', docs: [], sla: null },
  ABANDONO: { n: 'No regresó', area: 'Abandono del paciente', docs: [], sla: null },
  SIN_CIERRE: { n: 'Atendida sin cierre', area: 'Sin contrarreferencia', docs: [], sla: null },
};
export const TERMINAL = new Set(['CERRADA', 'QUEMADA', 'ABANDONO', 'SIN_CIERRE']);
export const DESVIO = new Set(['DEVUELTA', 'LIMBO', 'NO_ACUDIO', 'URGENCIAS', 'ESTUDIOS', 'TERCER', 'QUEMADA', 'ABANDONO', 'SIN_CIERRE']);
export const CIERRE_ES = { CERRADA: 'Cierre natural', SIN_CIERRE: 'Atendida sin cierre', ABANDONO: 'No regresó', QUEMADA: 'Quemada', EN_PROCESO: 'En proceso' };
export const SISTEMA_ES = { EN_PROCESO: 'En proceso', SIN_RASTRO: 'Sin rastro', CERRADA: 'Cerrada', QUEMADA: 'Quemada', ABANDONO: 'Abandono' };
/** cuánto espera el sistema que dure cada etapa registrada antes de considerarla sin rastro (días) */
const ESPERA = { SOLICITUD: 2, VALIDACION: 5, ACEPTACION: 10, URGENCIAS: 3, ESPECIALIDAD: 60, ESTUDIOS: 120, TERCER: 10, DEVUELTA: 10, CONTRARREF: 5, SEGUIMIENTO: 45, NO_ACUDIO: 15, LIMBO: 15 };

export const RECEPTORAS = {
  HGP: { corto: 'HG Pachuca', nombre: 'HG Dra. Columba Rivera Osorio, Pachuca', nivel: 2, acep: 2, cita: [32, 110], limbo: 0.08, devuelve: 0.12, contra: 0.66, escala: 'HR1', color: '#2dd4bf' },
  CHI: { corto: 'CH Ixmiquilpan', nombre: 'Clínica Hospital Ixmiquilpan', nivel: 2, acep: 2, cita: [24, 80], limbo: 0.10, devuelve: 0.15, contra: 0.62, escala: 'HGP', color: '#60a5fa' },
  CHH: { corto: 'CH Huejutla', nombre: 'Clínica Hospital Huejutla de Reyes', nivel: 2, acep: 3, cita: [28, 95], limbo: 0.12, devuelve: 0.16, contra: 0.58, escala: 'HGT', color: '#f472b6' },
  CMFE: { corto: 'CMFE Pachuca', nombre: 'CMF con Especialidades Pachuca', nivel: 2, acep: 1.5, cita: [20, 60], limbo: 0.05, devuelve: 0.08, contra: 0.72, escala: 'HR1', color: '#facc15' },
  HGT: { corto: 'HG Tampico', nombre: 'HG Tampico (Región IX · microrregión)', nivel: 2, fuera: true, acep: 5, cita: [42, 140], limbo: 0.16, devuelve: 0.20, contra: 0.55, escala: 'HR1', color: '#fb923c' },
  HR1: { corto: 'HR 1° de Octubre', nombre: 'HR (HAE) "Primero de Octubre", CDMX', nivel: 3, acep: 5, cita: [55, 170], limbo: 0.14, devuelve: 0.20, contra: 0.60, escala: 'CMN', color: '#a78bfa' },
  CMN: { corto: 'CMN 20 de Noviembre', nombre: 'CMN "20 de Noviembre", CDMX', nivel: 3, acep: 7, cita: [65, 190], limbo: 0.10, devuelve: 0.25, contra: 0.70, escala: null, color: '#38bdf8' },
};
/** a dónde se reenvía cuando la receptora rechaza por región o especialidad */
const ALTERNA = { CHH: 'HGT', CHI: 'HGP', HGP: 'HR1', CMFE: 'HGP', HGT: 'HGP', HR1: 'HGP', CMN: 'HR1' };

export const ESPECIALIDADES = [
  { n: 'Medicina interna', w: 16, nivel: 'CH', dx: ['Diabetes descontrolada', 'Hipertensión de difícil control', 'Enfermedad renal crónica'] },
  { n: 'Cirugía general', w: 14, nivel: 'CH', dx: ['Hernia inguinal', 'Colecistitis litiásica', 'Lipoma'] },
  { n: 'Ginecología', w: 11, nivel: 'CH', dx: ['Embarazo de alto riesgo', 'Miomatosis uterina', 'Citología anormal'] },
  { n: 'Traumatología', w: 12, nivel: 'CH', dx: ['Gonartrosis', 'Lumbalgia crónica', 'Secuelas de fractura'] },
  { n: 'Pediatría', w: 6, nivel: 'CH', dx: ['Asma de difícil control', 'Talla baja'] },
  { n: 'Oftalmología', w: 10, nivel: 'HG', dx: ['Catarata', 'Retinopatía diabética', 'Glaucoma'] },
  { n: 'Cardiología', w: 7, nivel: 'HG', dx: ['Insuficiencia cardiaca', 'Arritmia'] },
  { n: 'Urología', w: 6, nivel: 'HG', dx: ['Hiperplasia prostática', 'Litiasis renal'] },
  { n: 'Neurología', w: 4, nivel: 'HG', dx: ['Epilepsia', 'Cefalea crónica'] },
  { n: 'Endocrinología', w: 5, nivel: 'CMFE', dx: ['Hipotiroidismo', 'Diabetes tipo 1'] },
  { n: 'Psiquiatría', w: 4, nivel: 'CMFE', dx: ['Depresión mayor', 'Trastorno bipolar'] },
  { n: 'Oncología', w: 4, nivel: 'HR', dx: ['Cáncer de mama', 'Cáncer de próstata'] },
];
const MOTIVOS_EMISORA = ['Formato SM-1-17 incompleto', 'Sin vigencia de derechos', 'Falta resumen clínico'];
const MOTIVOS_RX = ['No corresponde a la región', 'Falta estudio previo', 'Especialidad sin agenda', 'Diagnóstico no pertinente para el nivel', 'Formato incompleto'];
const ESTUDIOS = ['Ultrasonido', 'Tomografía', 'Resonancia magnética', 'Endoscopia', 'Ecocardiograma', 'Laboratorio especial'];
const TRIAGE = ['Triage amarillo', 'Triage naranja', 'Triage rojo'];
const PESO = { CMF: 3, UMF: 2, CAF: 1, CMCT: 0.5 };

function destino(e, esp) {
  if (esp.nivel === 'HR') return 'HR1';
  if (esp.nivel === 'CMFE') return 'CMFE';
  if (esp.nivel === 'HG') return e.ruta === 'R8' ? 'HGT' : 'HGP';
  return e.ruta === 'R8' ? 'CHH' : ['R4', 'R5', 'R9'].includes(e.ruta) ? 'CHI' : 'HGP';
}
const MENORES = new Set(['DE', 'LA', 'DEL', 'LOS', 'LAS', 'EL', 'Y', 'AL']);
const cap = w => MENORES.has(w) ? w.toLowerCase()
  : /^[A-Z0-9.]{1,3}$/.test(w) ? w
  : w.replace(/^([^A-Za-zÀ-ÿ]*)(.)(.*)$/, (m, a, b, c) => a + b + c.toLowerCase());
function corto(nombre) { const [p, ...r] = nombre.split(' '); const s = p + ' ' + r.map(cap).join(' '); return s.length > 30 ? s.slice(0, 29) + '…' : s; }

// =====================================================================
//  Redes de unidades: quién refiere, quién recibe, a dónde se escala.
//  Una red expone: emisoras[], rx{id → receptora}, destino(e, esp) → {rx, fuera},
//  alterna(rx, R) → rx, dist(e, rx) → km. Cada receptora lleva su escala.
// =====================================================================
/** Hidalgo con sus 7 receptoras (assets/unidades_hidalgo.json) */
export function redHidalgo(data) {
  const rx = Object.fromEntries(Object.entries(RECEPTORAS).map(([id, x], idx) => [id, { id, idx, region: 'I', cve: '13', carga: 1, ...x }]));
  const emisoras = data.units
    .filter(u => u.inst === 'ISSSTE' && u.nivel === 'Primer Nivel' && u.tipo !== 'CMFE')
    .map((u, idx) => ({ id: u.clues, idx, clues: u.clues, nombre: u.nombre, corto: corto(u.nombre), tipo: u.tipo, ruta: u.ruta, km: u.km, cve: '13', region: 'I', w: PESO[u.tipo] || 1 }));
  return {
    nombre: 'Hidalgo', emisoras, rx, porDia: REGLAS.porDia,
    destino: (e, esp) => { const id = destino(e, esp); return { rx: id, fuera: !!rx[id].fuera }; },
    alterna: id => ALTERNA[id],
    dist: e => e.km,
  };
}

/** parámetros de atención por tipo de unidad receptora [SUPUESTO, igual que Hidalgo] */
const TIPO_RX = {
  CE: { acep: 1.5, cita: [20, 60], limbo: 0.05, devuelve: 0.08, contra: 0.72 },
  CH: { acep: 2, cita: [26, 90], limbo: 0.10, devuelve: 0.15, contra: 0.62 },
  HG: { acep: 2, cita: [32, 110], limbo: 0.08, devuelve: 0.12, contra: 0.66 },
  HR: { acep: 5, cita: [55, 170], limbo: 0.14, devuelve: 0.20, contra: 0.60 },
  CMN: { acep: 7, cita: [65, 190], limbo: 0.10, devuelve: 0.25, contra: 0.70 },
};
export const REGIONES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const COLOR_REGION = ['#2dd4bf', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#38bdf8', '#fb923c', '#4ade80', '#f87171', '#e879f9', '#a3e635', '#fbbf24', '#22d3ee', '#c084fc', '#fda4af', '#94a3b8'];
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const PALABRAS_VACIAS = new Set(['HR', 'HAE', 'DR', 'M', 'DE', 'LA', 'DEL', 'EL', 'LIC', 'GRAL', 'LOS']);
const tokens = s => new Set(norm(s).split(/[^A-Z0-9]+/).filter(w => w.length > 1 && !PALABRAS_VACIAS.has(w)));

/** Red nacional: 1,033 unidades de assets/estados_issste.json con regionalización 2025 y microrregión por distancia */
export function redNacional(data, seed = 7) {
  const R = rng(seed);
  const est = Object.fromEntries(data.estados.map(e => [e.cve, e]));
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rx = {}, emisoras = [];
  for (const u of data.unidades) {
    const E = est[u.cve], region = E.region;
    if (u.nivel === 1) {
      emisoras.push({ id: u.clues, idx: emisoras.length, clues: u.clues, nombre: u.nombre, corto: corto(u.nombre), tipo: u.tipo, cve: u.cve, estado: E.abbr, region, xy: u.xy, w: PESO[u.tipo] || 1 });
      continue;
    }
    const tipo = /20 DE NOVIEMBRE/.test(u.nombre) ? 'CMN' : u.tipo;
    rx[u.clues] = {
      id: u.clues, idx: Object.keys(rx).length, nombre: u.nombre, corto: corto(u.nombre), tipo, nivel: u.nivel, cve: u.cve, estado: E.abbr, region, xy: u.xy,
      color: COLOR_REGION[REGIONES.indexOf(region)] || '#94a3b8', carga: Math.exp(0.35 * (R() + R() + R() - 1.5)), ...TIPO_RX[tipo],
    };
  }
  const lista = Object.values(rx);
  const cmn = lista.find(u => u.tipo === 'CMN');
  const hrs = lista.filter(u => u.tipo === 'HR');
  // HR que encabeza la región de cada estado (por el nombre en la regionalización)
  const hrDe = {};
  for (const E of data.estados) {
    const want = tokens(E.hr);
    let best = null, bs = -1;
    for (const h of hrs) {
      const s = [...tokens(h.nombre)].filter(w => want.has(w)).length - d2(h.xy, E.hub) / 1e5;
      if (s > bs) { bs = s; best = h; }
    }
    hrDe[E.cve] = best.id;
  }
  for (const u of lista) u.escala = u.tipo === 'CMN' ? null : u.tipo === 'HR' ? cmn.id : hrDe[u.cve];
  const cerca = (xy, cands) => { let b = null, bd = Infinity; for (const c of cands) { const d = d2(xy, c.xy); if (d < bd) { bd = d; b = c; } } return [b, bd]; };
  const porClase = {
    CH: lista.filter(u => u.nivel === 2),
    HG: lista.filter(u => u.tipo === 'HG'),
    CMFE: lista.filter(u => u.tipo === 'CE'),
  };
  // destino de cada emisora por clase de especialidad, calculado una vez
  for (const e of emisoras) {
    e.dest = {};
    for (const clase of ['CH', 'HG', 'CMFE', 'HR']) {
      if (clase === 'HR') { e.dest.HR = { rx: hrDe[e.cve], fuera: false }; continue; }
      const cands = porClase[clase];
      const [enReg, dReg] = cerca(e.xy, cands.filter(c => c.region === e.region));
      const [todo, dTodo] = cerca(e.xy, cands);
      if (!enReg) { e.dest[clase] = clase === 'CMFE' ? null : clase === 'HG' ? { rx: hrDe[e.cve], fuera: false } : { rx: todo.id, fuera: true }; continue; }
      e.dest[clase] = todo.region !== e.region && dTodo < REGLAS.microrregion * dReg ? { rx: todo.id, fuera: true } : { rx: enReg.id, fuera: false };
    }
    if (!e.dest.CMFE) e.dest.CMFE = e.dest.HG;
  }
  // a dónde se reenvía cuando la receptora rechaza
  for (const u of lista) {
    if (u.nivel === 2) { const [o] = cerca(u.xy, porClase.CH.filter(c => c.region === u.region && c !== u)); u.alterna = o && R() < 0.5 ? o.id : hrDe[u.cve]; }
    else if (u.tipo === 'HR') { const [o] = cerca(u.xy, porClase.HG.filter(c => c.cve === u.cve)); u.alterna = o ? o.id : cmn.id; }
    else u.alterna = hrDe[u.cve];
  }
  const sumW = emisoras.reduce((s, e) => s + e.w, 0);
  return {
    nombre: 'Nacional', nacional: true, emisoras, rx, estados: est, hrDe, porDia: sumW * REGLAS.porPeso,
    destino: (e, esp) => e.dest[esp.nivel] || e.dest.CH,
    alterna: id => rx[id].alterna,
    dist: (e, id) => d2(e.xy, rx[id].xy),
  };
}

export function semaforo(d) { return d <= 10 ? 'VERDE' : d <= REGLAS.plazoDias ? 'AMARILLO' : d <= 30 ? 'NARANJA' : d <= 90 ? 'ROJO' : 'CRONICA'; }
const mediana = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// =====================================================================
export class Referencias {
  /**
   * @param data assets/unidades_hidalgo.json (red de Hidalgo) o assets/estados_issste.json (red nacional), o una red ya armada
   * @param corteDia último día con referencias nuevas
   */
  constructor(data, { seed = 20261104, corteDia = 0, inicio = REGLAS.inicio } = {}) {
    const R = rng(seed);
    this.R = R;
    this.corteDia = corteDia;
    this.inicio = inicio;
    this.red = data.destino ? data : data.unidades ? redNacional(data) : redHidalgo(data);
    this.nacional = !!this.red.nacional;
    this.rx = this.red.rx;
    this.receptoras = Object.values(this.rx);
    this.emisoras = this.red.emisoras;
    let acc = 0;
    this._wCum = Float64Array.from(this.emisoras, e => (acc += e.w));
    this.refs = [];
    for (let d = inicio; d <= corteDia; d++) {
      if (!habil(d)) continue;
      const ts = Array.from({ length: poisson(R, this.red.porDia) }, () => d * DAY + (8 + R() * 6) * H).sort((a, b) => a - b);
      for (const t of ts) this.refs.push(this._crear(t));
    }
  }

  _emisora() {
    const c = this._wCum, u = this.R() * c[c.length - 1];
    let lo = 0, hi = c.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < u) lo = m + 1; else hi = m; }
    return this.emisoras[lo];
  }

  _crear(tCrea) {
    const R = this.R, U = id => this.rx[id];
    const e = this._emisora(), esp = pickW(R, ESPECIALIDADES);
    const r = {
      id: 'REF-' + String(this.refs.length + 1).padStart(5, '0'), tCrea, tEmision: tCrea, emisora: e, esp, dx: pick(R, esp.dx),
      sexo: R() < 0.58 ? 'F' : 'M', edad: 18 + Math.floor(R() * 66), seg: [], tAtencion: Infinity, final: null, rxSet: new Set(),
    };
    let { rx: rec, fuera } = this.red.destino(e, esp), t = tCrea, vueltas = 0, atendido = false, escalado = false, estudio = false, reprog = false, reemite = false, nEsp = 0;
    r.rx0 = rec;
    const push = (etapa, t0, o = {}) => {
      const last = r.seg.at(-1);
      if (last) { if (t0 < last.t0) t0 = last.t0; last.t1 = t0; }
      r.seg.push({ etapa, t0, t1: null, rx: o.rx ?? null, unidad: o.unidad, reg: o.reg ?? true, vuelta: !!o.vuelta, nota: o.nota || '' });
      if (o.rx) r.rxSet.add(o.rx);
    };
    let st = 'SOLICITUD', guard = 0;
    while (st) {
      if (++guard > 90) st = 'SIN_CIERRE';
      if (r.seg.length && t < r.seg.at(-1).t0) t = r.seg.at(-1).t0; // el reloj nunca retrocede
      const u = U(rec);
      switch (st) {
        case 'SOLICITUD':
          push('SOLICITUD', t, { unidad: e.corto, vuelta: reemite, nota: reemite ? 'Re-emisión de la referencia' : `${esp.n} · ${r.dx}` });
          if (reemite) r.tEmision = t;
          reemite = false;
          t = R() < 0.7 ? t + (1 + R() * 4) * H : enHorario(R, Math.floor(t / DAY) + 1);
          st = 'VALIDACION'; break;
        case 'VALIDACION':
          push('VALIDACION', t, { unidad: e.corto });
          t = habilesDesde(R, t, logn(R, 1.5, 5));
          if (R() < 0.05 && vueltas < REGLAS.maxVueltas) {
            vueltas++; push('DEVUELTA', t, { unidad: e.corto, vuelta: true, nota: pick(R, MOTIVOS_EMISORA) });
            t = habilesDesde(R, t, 1 + R() * 3); break; // regresa a validación corregida
          }
          st = 'ACEPTACION'; break;
        case 'ACEPTACION': {
          push('ACEPTACION', t, { rx: rec, unidad: u.corto, nota: escalado ? 'Envío desde ' + r.seg.filter(s => s.rx).at(-2)?.unidad : fuera ? 'Fuera de región (microrregionalización)' : '' });
          const x = R();
          if (x < u.devuelve && vueltas < REGLAS.maxVueltas) {
            t = habilesDesde(R, t, logn(R, u.acep, u.acep * 3));
            vueltas++;
            push('DEVUELTA', t, { rx: rec, unidad: u.corto, vuelta: true, nota: pick(R, MOTIVOS_RX) });
            if (R() < 0.4) { rec = this.red.alterna(rec); fuera = false; }
            t = habilesDesde(R, t, 1 + R() * 4); st = 'VALIDACION'; break;
          }
          if (x < u.devuelve + u.limbo) {
            t = habilesDesde(R, t, 3 + R() * 3);
            push('LIMBO', t, { rx: rec, unidad: u.corto, reg: false, nota: 'Se venció el plazo de respuesta' });
            t += logn(R, 28, 85) * DAY;
            if (!atendido && (t - r.tEmision) / DAY > REGLAS.vigenciaDias) { st = 'QUEMADA'; break; }
            t = enHorario(R, Math.floor(t / DAY));
            push('ACEPTACION', t, { rx: rec, unidad: u.corto, nota: 'Respuesta tardía' });
            t += (2 + R() * 5) * H; st = 'CITA'; break;
          }
          t = habilesDesde(R, t, logn(R, u.acep, u.acep * 3)); st = 'CITA'; break;
        }
        case 'CITA': {
          push('CITA', t, { rx: rec, unidad: u.corto, vuelta: reprog, reg: R() < 0.92, nota: reprog ? 'Cita reprogramada' : fuera ? 'Traslado foráneo' : '' });
          const fac = (reprog ? 0.7 : 1) * (u.carga || 1); reprog = false;
          let espera = logn(R, u.cita[0] * fac, u.cita[1] * fac);
          if (mes(Math.floor(t / DAY)) >= 9) espera += 20 + R() * 40; // octubre a diciembre: cierre de agenda
          const tCita = enHorario(R, Math.floor(t / DAY + Math.max(2, espera)), 8, 13);
          if (R() < 0.035) {
            const tu = t + (0.15 + R() * 0.8) * (tCita - t);
            push('URGENCIAS', tu, { rx: rec, unidad: u.corto, nota: pick(R, TRIAGE) });
            if (!atendido) { r.tAtencion = r.seg.at(-1).t0; atendido = true; }
            t = r.seg.at(-1).t0 + (6 + R() * 30) * H; st = 'ESPECIALIDAD'; break;
          }
          // la cita cae después de la vigencia: al llegar, la referencia ya se quemó
          if (!atendido && tCita - r.tEmision > REGLAS.vigenciaDias * DAY && R() < 0.4) { t = r.tEmision + REGLAS.vigenciaDias * DAY; st = 'QUEMADA'; break; }
          t = tCita;
          if (R() < 0.12 + (this.red.dist(e, rec) > 100 ? 0.06 : 0)) { st = 'NO_ACUDIO'; break; }
          if (!atendido) { r.tAtencion = t; atendido = true; }
          st = 'ESPECIALIDAD'; break;
        }
        case 'NO_ACUDIO':
          push('NO_ACUDIO', t, { rx: rec, unidad: u.corto, reg: R() < 0.25, nota: 'La cita pasó sin registro de asistencia' });
          t = enHorario(R, Math.floor(t / DAY + 2 + R() * 10));
          if (!atendido && t - r.tEmision > REGLAS.vigenciaDias * DAY && R() < 0.5) { st = 'QUEMADA'; break; }
          if (R() < 0.55 && vueltas < REGLAS.maxVueltas) { vueltas++; reprog = true; st = 'CITA'; break; }
          st = 'ABANDONO'; break;
        case 'ESPECIALIDAD': {
          push('ESPECIALIDAD', t, { rx: rec, unidad: u.corto, reg: R() < 0.8, nota: nEsp ? 'Continúa tratamiento' : 'Primera consulta de especialidad' });
          nEsp++;
          let dur = (R() < 0.12 ? logn(R, 110, 280) : logn(R, 16, 60)) * DAY;
          if (!estudio && R() < 0.22) {
            estudio = true;
            const a = dur * (0.2 + R() * 0.3); t += a; dur -= a;
            push('ESTUDIOS', t, { rx: rec, unidad: u.corto, reg: R() < 0.7, nota: pick(R, ESTUDIOS) });
            t += logn(R, 28, 150) * DAY;
            push('ESPECIALIDAD', t, { rx: rec, unidad: u.corto, reg: R() < 0.8, nota: 'Revisión de resultados' });
          }
          t = enHorario(R, Math.floor((t + Math.max(DAY / 2, dur)) / DAY), 8, 14);
          if (u.escala && !escalado && R() < 0.07) { st = 'TERCER'; break; }
          st = R() < u.contra ? 'CONTRARREF' : 'SIN_CIERRE'; break;
        }
        case 'TERCER':
          escalado = true;
          push('TERCER', t, { rx: rec, unidad: u.corto, nota: 'Rebasa la capacidad resolutiva → ' + U(u.escala).corto });
          rec = u.escala; fuera = false; t = habilesDesde(R, t, 1 + R() * 3); st = 'ACEPTACION'; break;
        case 'CONTRARREF':
          push('CONTRARREF', t, { rx: rec, unidad: u.corto, reg: R() < 0.95, nota: 'SM-1-17 reverso · plan de manejo' });
          t = habilesDesde(R, t, R() < 0.6 ? 0 : 1 + R() * 3); st = 'SEGUIMIENTO'; break;
        case 'SEGUIMIENTO':
          push('SEGUIMIENTO', t, { unidad: e.corto, reg: R() < 0.85, nota: 'Control en la unidad de origen' });
          t = enHorario(R, Math.floor(t / DAY + 7 + R() * 25)); st = 'CERRADA'; break;
        case 'CERRADA':
          push('CERRADA', t, { unidad: e.corto, reg: r.seg.some(s => s.etapa === 'CONTRARREF' && s.reg), nota: 'Cierre natural' });
          r.final = 'CERRADA'; st = null; break;
        case 'SIN_CIERRE':
          push('SIN_CIERRE', t, { rx: rec, unidad: u.corto, reg: false, nota: 'Alta sin contrarreferencia' });
          r.final = 'SIN_CIERRE'; st = null; break;
        case 'ABANDONO':
          push('ABANDONO', t, { rx: rec, unidad: u.corto, reg: false, nota: 'El paciente no regresó' });
          r.final = 'ABANDONO'; st = null; break;
        case 'QUEMADA':
          push('QUEMADA', t, { rx: rec, unidad: u.corto, reg: R() < 0.35, nota: `Venció la vigencia de ${REGLAS.vigenciaDias} días sin atención` });
          if (R() < 0.45 && vueltas < REGLAS.maxVueltas) {
            vueltas++; reemite = true; ({ rx: rec, fuera } = this.red.destino(e, esp));
            t = enHorario(R, Math.floor(t / DAY) + 3 + Math.floor(R() * 20)); st = 'SOLICITUD'; break;
          }
          r.final = 'QUEMADA'; st = null; break;
        default: st = null;
      }
    }
    const last = r.seg.at(-1); last.t1 = last.t0;
    return r;
  }

  // ---------------------------------------------------------------
  //  Consultas en el instante t
  // ---------------------------------------------------------------
  segAt(r, t) {
    const g = r.seg; let lo = 0, hi = g.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; }
    return g[lo];
  }
  /** etapa de la referencia en t (null si aún no existe o ya se archivó) */
  etapa(r, t, archivarDias = REGLAS.archivarDias) {
    if (t < r.tCrea) return null;
    const s = this.segAt(r, t);
    if (TERMINAL.has(s.etapa) && t >= s.t0 + archivarDias * DAY) return null;
    return s.etapa;
  }
  /** receptora a cargo en t (la última que tocó la referencia, o la de destino) */
  rxAt(r, t) { let x = r.rx0; for (const s of r.seg) { if (s.t0 > t) break; if (s.rx) x = s.rx; } return x; }
  vueltas(r, t) { let n = 0; for (const s of r.seg) { if (s.t0 > t) break; if (s.vuelta) n++; } return n; }
  /** lo que ve el sistema: el último movimiento registrado y si ya pasó lo esperado sin noticias */
  sistema(r, t) {
    let last = null;
    for (const s of r.seg) { if (s.t0 > t) break; if (s.reg) last = s; }
    if (!last) return { st: 'SIN_RASTRO', seg: null };
    if (last.etapa === 'CERRADA' || last.etapa === 'QUEMADA' || last.etapa === 'ABANDONO') return { st: last.etapa, seg: last };
    const fin = last.etapa === 'CITA' ? last.t1 : last.t0 + (ESPERA[last.etapa] ?? 15) * DAY;
    return { st: t > fin + REGLAS.sinRastroDias * DAY ? 'SIN_RASTRO' : 'EN_PROCESO', seg: last };
  }
  estado(r, t) {
    const s = this.segAt(r, t), atendida = r.tAtencion <= t;
    const dias = ((atendida ? r.tAtencion : t) - r.tCrea) / DAY;
    return {
      etapa: s.etapa, seg: s, atendida, dias, edad: (t - r.tCrea) / DAY, sem: semaforo(dias), vueltas: this.vueltas(r, t),
      real: TERMINAL.has(s.etapa) ? s.etapa : 'EN_PROCESO', sistema: this.sistema(r, t).st, rx: this.rxAt(r, t),
    };
  }
  recorrido(r) { return r.seg; }

  // ---------------------------------------------------------------
  //  Tablero de seguimiento al instante t (ventana de 90 días para tasas)
  // ---------------------------------------------------------------
  tablero(t, filtro = '') {
    const W0 = t - 90 * DAY;
    const o = {
      abiertas: { a15: 0, a30: 0, a90: 0, cron: 0 }, sinAtender15: 0, atendidas: 0, enPlazo: 0, diasAt: [],
      cierres: { CERRADA: 0, SIN_CIERRE: 0, ABANDONO: 0, QUEMADA: 0 }, sistema: { EN_PROCESO: 0, SIN_RASTRO: 0, CERRADA: 0, QUEMADA: 0, ABANDONO: 0 },
      ocultas: { SIN_CIERRE: 0, ABANDONO: 0, QUEMADA: 0, CERRADA: 0 }, cronicas: [], vueltas: [], acepDias: [], acepTotal: 0, acepPrimera: 0, limbo: 0,
      porRx: Object.fromEntries(this.receptoras.map(u => [u.id, { abiertas: 0, sinAtender15: 0, sinCierre: 0, sinRastro: 0, limbo: 0 }])),
    };
    for (const r of this.refs) {
      if (r.tCrea > t) break;
      if (filtro && !r.rxSet.has(filtro) && r.rx0 !== filtro) continue;
      const E = this.estado(r, t), P = o.porRx[E.rx];
      const term = E.real !== 'EN_PROCESO', recien = term && E.seg.t0 >= W0;
      // lo que ve el sistema (toda la historia: lo abierto en el sistema nunca se cierra solo)
      if (E.sistema === 'EN_PROCESO' || E.sistema === 'SIN_RASTRO' || recien) o.sistema[E.sistema]++;
      if (E.sistema === 'SIN_RASTRO') P.sinRastro++;
      if (term && (E.sistema === 'EN_PROCESO' || E.sistema === 'SIN_RASTRO')) o.ocultas[E.real]++;
      if (recien) { o.cierres[E.real]++; if (E.real === 'SIN_CIERRE') P.sinCierre++; }
      if (!term) {
        const a = E.edad;
        if (a <= 15) o.abiertas.a15++; else if (a <= 30) o.abiertas.a30++; else if (a <= 90) o.abiertas.a90++; else { o.abiertas.cron++; o.cronicas.push([r, E]); }
        P.abiertas++;
        if (!E.atendida && a > REGLAS.plazoDias) { o.sinAtender15++; P.sinAtender15++; }
        if (E.etapa === 'LIMBO') { o.limbo++; P.limbo++; }
      }
      if ((!term || recien) && E.vueltas >= 2) o.vueltas.push([r, E]);
      if (r.tAtencion >= W0 && r.tAtencion <= t) { o.atendidas++; const d = (r.tAtencion - r.tCrea) / DAY; o.diasAt.push(d); if (d <= REGLAS.plazoDias) o.enPlazo++; }
      // aceptación: la primera respuesta de la receptora en la ventana
      const i = r.seg.findIndex(s => s.etapa === 'ACEPTACION');
      if (i >= 0 && r.seg[i].t0 >= W0 && r.seg[i + 1] && r.seg[i + 1].t0 <= t) {
        o.acepTotal++; o.acepDias.push((r.seg[i + 1].t0 - r.seg[i].t0) / DAY);
        if (r.seg[i + 1].etapa === 'CITA') o.acepPrimera++;
      }
    }
    o.cronicas.sort((a, b) => b[1].edad - a[1].edad);
    o.vueltas.sort((a, b) => b[1].vueltas - a[1].vueltas || b[1].edad - a[1].edad);
    o.medAt = mediana(o.diasAt); o.medAcep = mediana(o.acepDias);
    return o;
  }
}

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  yard-sim.js · Patio y andenes del CENADI (entradas y salidas de vehículos)
//
//  Simulación de eventos discretos minuto a minuto, determinista con semilla.
//  Cada vehículo pasa por recursos con capacidad limitada:
//    carretera → caseta (carriles) → patio regulador (cajones) → andén de
//    recepción → montacargas (descarga) → validador (en andén o en cuarentena)
//    → papeles → caseta de salida.
//  La flota propia sale de los andenes de embarque en olas y regresa de ruta
//  por la misma caseta (o por un carril propio en el escenario C).
//
//  Fuente del diseño: documento "CENADI · Simulación de entradas y salidas de
//  vehículos" (26 oct 2026). Los tiempos de proceso son supuestos editables.
//  Unidades internas: minutos desde las 00:00 del día tipo.
// =====================================================================

export const MIN_DAY = 1440;
const END = 1800;                       // se simula hasta las 06:00 del día siguiente para cerrar todo

/** Parámetros iniciales (documento, sección "Diseño de la simulación") */
export const BASE = {
  seed: 7,
  volumen: 1,                          // multiplicador de entradas de proveedor
  baseEntradas: 22,                    // vehículos de proveedor en un día hábil normal
  mezcla: [
    { tipo: 'trailer', nombre: 'Tráiler 53 ft', p: 0.4, tarimas: 24, escala: 1 },
    { tipo: 'torton', nombre: 'Torton', p: 0.4, tarimas: 12, escala: 0.55 },
    { tipo: 'camioneta', nombre: 'Camioneta 3.5 t', p: 0.2, tarimas: 4, escala: 0.3 },
  ],
  pFrio: 0.15,
  // citas
  citas: true, sinCita: 0.10, ventana: 60, holgura: 0.10, tolerancia: 15, pFalta: 0.05,
  llegadaMedia: 3, llegadaDesv: 12, pTarde: 0, tardeMin: 45, tardeMax: 120,
  // horario de recepción (check-in en caseta)
  abre: 8 * 60, cierra: 14 * 60,
  // infraestructura
  andenes: 14, andenesFrio: 2, frioExclusivo: false,
  cajones: 20, carrilesCaseta: 2, carrilFlota: false,
  caseta: [2, 4, 8], casetaFlota: 1.5, salidaCaseta: 1.5,
  // proceso en andén
  maniobra: 5, descargaPrep: 10, descargaTarima: 2, montacargas: 8,
  validacionEnAnden: true, validadores: 8, valBase: 15, valTarima: 1.5,
  pIncidencia: 0.05, incidenciaMin: 45, pRechazo: 0.02, papeles: 10,
  // dentro del almacén: cuarentena → rack
  reachTrucks: 5, ubicarTarima: 4,
  // embarque: surtido (picking) → consolidación → carga
  salidas: 30, olas: [7 * 60, 11 * 60, 13 * 60], cuadrillas: 6, cargaBase: 15, cargaTarima: 1.5,
  surtidores: 24, surtidoTarima: 30, liberaOla: 240, turnoSurtido: [360, 1320],
  andenesEmb: 24, regresoDesde: 9 * 60, regresoHasta: 17 * 60,
};

export const SCENARIOS = {
  A: {
    nombre: 'A · Actual tipo', corto: 'Actual tipo',
    desc: 'Sin citas. Recepción de 8:00 a 14:00 con validación en el andén. Las olas de embarque salen dentro del horario de recepción, el surtido tiene un solo turno (6:00 a 14:00) y la flota que regresa comparte la caseta con los proveedores.',
    p: { citas: false, sinCita: 1, abre: 480, cierra: 840, validacionEnAnden: true, frioExclusivo: false, carrilFlota: false, olas: [420, 660, 780], turnoSurtido: [360, 840] },
  },
  B: {
    nombre: 'B · Citas', corto: 'Citas',
    desc: 'Cita obligatoria en ventanas de 60 min con cupo (10 % llega sin cita). Mismo horario de 8:00 a 14:00, validación en el andén y un turno de surtido.',
    p: { citas: true, sinCita: 0.10, abre: 480, cierra: 840, validacionEnAnden: true, frioExclusivo: true, carrilFlota: false, olas: [420, 660, 780], turnoSurtido: [360, 840] },
  },
  C: {
    nombre: 'C · Citas y horario ampliado', corto: 'Citas + horario',
    desc: 'Citas con cupo, recepción de 6:00 a 22:00, validación en cuarentena (el vehículo sale al terminar de descargar), andenes de red fría propios, carril de caseta para la flota, surtido en tres turnos y olas de embarque fuera del pico.',
    p: { citas: true, sinCita: 0.05, abre: 360, cierra: 1320, validacionEnAnden: false, frioExclusivo: true, carrilFlota: true, olas: [300, 900, 1260], turnoSurtido: [0, 1440] },
  },
};
export const MODIFIERS = {
  normal: { nombre: 'Día normal', p: {} },
  pico: { nombre: 'Pico de fin de mes (×2.5)', p: { volumen: 2.5 } },
  contingencia: { nombre: 'Contingencia', p: { montacargasDelta: -1, pTarde: 0.30 } },
};

export function buildParams(scn = 'A', mod = 'normal', over = {}) {
  const p = structuredClone(BASE);
  Object.assign(p, structuredClone(SCENARIOS[scn].p));
  const m = MODIFIERS[mod].p;
  if (m.volumen) p.volumen = m.volumen;
  if (m.pTarde) p.pTarde = m.pTarde;
  if (m.montacargasDelta) p.montacargas += m.montacargasDelta;
  Object.assign(p, over);
  return p;
}

// ------------------------------------------------------------------ azar con semilla
function rng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.normal = (m = 0, s = 1) => { const u = Math.max(1e-9, r()), v = r(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  r.tri = (a1, c, b) => { const u = r(), f = (c - a1) / (b - a1); return u < f ? a1 + Math.sqrt(u * (b - a1) * (c - a1)) : b - Math.sqrt((1 - u) * (b - a1) * (b - c)); };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (arr) => { let u = r(), acc = 0; for (const x of arr) { acc += x.p; if (u <= acc) return x; } return arr[arr.length - 1]; };
  return r;
}

/** Tiempo medio en andén por vehículo (min), con la mezcla actual */
export function meanDockTime(p, frio = null) {
  let t = 0;
  for (const m of p.mezcla) {
    const val = p.validacionEnAnden ? p.valBase + p.valTarima * m.tarimas + p.pIncidencia * p.incidenciaMin : 0;
    t += m.p * (p.maniobra + p.descargaPrep + p.descargaTarima * m.tarimas + val + p.papeles);
  }
  return t;
}

/** Cupo de citas por ventana: floor(A · V / t̄ · (1 − h)) */
export function slotCapacity(p, docks) {
  return Math.max(0, Math.floor(docks * p.ventana / meanDockTime(p) * (1 - p.holgura)));
}

// ------------------------------------------------------------------ generación del día
function generate(p) {
  const R = rng(p.seed);
  const N = Math.max(0, Math.round(p.baseEntradas * p.volumen));
  const V = [];
  // 1. vehículos de proveedor
  for (let i = 0; i < N; i++) {
    const m = R.pick(p.mezcla);
    const tar = Math.max(1, Math.round(m.tarimas * (0.75 + 0.4 * R())));
    V.push({
      id: `E-${String(i + 1).padStart(3, '0')}`, kind: 'prov', tipo: m.tipo, tipoNombre: m.nombre, escala: m.escala,
      prov: `Proveedor ${String(1 + Math.floor(R() * 38)).padStart(2, '0')}`,
      tarimas: tar, frio: R() < p.pFrio, conCita: p.citas && R() >= p.sinCita,
      pref: 0, appt: null, arr: null, estado0: 'programado',
      falta: false, reprog: false, tarde: false,
      u: { falta: R(), lat: R.normal(p.llegadaMedia, p.llegadaDesv), tarde: R(), tardeMin: p.tardeMin + R() * (p.tardeMax - p.tardeMin), walk: R(), walk2: R(), inc: R(), rech: R(), gate: R.tri(...p.caseta), pref: Math.abs(R.normal(0, 1)) },
    });
  }
  // 2. citas: ventanas desde la apertura hasta el cierre, cupo por ventana y pool frío
  const span = p.cierra - p.abre;
  const nSlots = Math.max(1, Math.floor(span / p.ventana));
  const capGen = slotCapacity(p, p.frioExclusivo ? p.andenes - p.andenesFrio : p.andenes);
  const capFrio = p.frioExclusivo ? slotCapacity(p, p.andenesFrio) : 0;
  const used = Array.from({ length: nSlots }, () => ({ g: 0, f: 0 }));
  const conCita = V.filter(v => v.conCita);
  for (const v of conCita) v.pref = p.abre + Math.min(span - 1, v.u.pref * span * 0.35);
  conCita.sort((a, b) => a.pref - b.pref);
  for (const v of conCita) {
    const k0 = Math.min(nSlots - 1, Math.floor((v.pref - p.abre) / p.ventana));
    const pool = v.frio && p.frioExclusivo ? 'f' : 'g';
    const cap = pool === 'f' ? capFrio : capGen;
    let k = -1;
    for (let j = k0; j < nSlots; j++) if (used[j][pool] < cap) { k = j; break; }
    if (k < 0) for (let j = k0 - 1; j >= 0; j--) if (used[j][pool] < cap) { k = j; break; }
    if (k < 0) { v.reprog = true; continue; }
    const n = used[k][pool]++;
    v.slot = k;
    v.appt = p.abre + k * p.ventana + Math.floor(n * p.ventana / Math.max(1, cap));
  }
  // 3. llegadas
  for (const v of V) {
    if (v.reprog) { v.arr = null; continue; }
    if (v.conCita) {
      if (v.u.falta < p.pFalta) { v.falta = true; v.arr = null; continue; }
      let a = v.appt + v.u.lat;
      if (v.u.tarde < p.pTarde) { a += v.u.tardeMin; v.tarde = true; }
      v.arr = Math.max(0, a);
    } else {
      // sin cita: 60 % llega en oleada (desde 90 min antes de abrir hasta 1 h después), el resto repartido
      if (v.u.walk < 0.6) v.arr = p.abre - 90 + v.u.walk2 * 150;
      else v.arr = p.abre + 60 + v.u.walk2 * Math.max(30, span - 240);
      if (v.u.tarde < p.pTarde) { v.arr += v.u.tardeMin * 0.5; v.tarde = true; }
    }
  }
  // 4. flota propia: salidas por olas y regresos de ruta
  const F = [];
  const nOut = p.salidas;
  for (let i = 0; i < nOut; i++) {
    const w = i % p.olas.length, k = Math.floor(i / p.olas.length);
    const plan = p.olas[w] + k * 8;
    const tar = R.int(6, 16);
    F.push({ id: `S-${String(i + 1).padStart(3, '0')}`, laneIdx: i % p.andenesEmb, kind: 'salida', tipo: tar > 12 ? 'trailer' : 'torton', escala: tar > 12 ? 1 : 0.55, tarimas: tar, frio: R() < 0.2, plan, ruta: ['Norte', 'Noroeste', 'Noreste', 'Occidente', 'Bajío', 'Centro', 'CDMX', 'Edomex', 'Golfo', 'Sureste', 'Sur', 'Península'][R.int(0, 11)] });
  }
  for (let i = 0; i < nOut; i++) {
    F.push({ id: `R-${String(i + 1).padStart(3, '0')}`, kind: 'regreso', tipo: R() < 0.5 ? 'trailer' : 'torton', escala: 1, tarimas: 0, frio: false, arr: p.regresoDesde + R() * (p.regresoHasta - p.regresoDesde) });
  }
  for (const f of F) if (f.tipo === 'torton') f.escala = 0.55;
  return { V, F, capGen, capFrio, nSlots };
}

// ------------------------------------------------------------------ simulación
export function simulate(pIn) {
  const p = { ...pIn };
  const { V, F, capGen, capFrio, nSlots } = generate(p);
  const all = [...V, ...F];
  const docks = Array.from({ length: p.andenes }, (_, i) => ({ i, frio: p.frioExclusivo && i >= p.andenes - p.andenesFrio, v: null, log: [] }));
  const emb = Array.from({ length: p.andenesEmb }, (_, i) => ({ i, v: null, log: [] }));
  const lanes = Array.from({ length: p.carrilesCaseta }, () => 0);
  let fleetLane = 0, exitLane = 0;
  let forkFree = p.montacargas, valFree = p.validadores, crewFree = p.cuadrillas;
  const roadQ = [], fleetQ = [], inside = [], exitQ = [], valQ = [];
  const loading = [];
  const series = [];
  let maxRoad = 0, maxYard = 0, overtimeEnd = 0;
  const dockBusyMin = { rec: 0, emb: 0 };

  const arrivals = all.filter(v => v.arr != null && v.kind !== 'salida').sort((a, b) => a.arr - b.arr);
  let ai = 0;
  const outs = F.filter(f => f.kind === 'salida').sort((a, b) => a.plan - b.plan);
  for (const o of outs) o.loadStart = o.plan - (p.cargaBase + p.cargaTarima * o.tarimas) - 10;
  // tarimas: recepción (se crean al descargar) y embarque (se liberan al surtido por ola)
  const recP = [], embP = [];
  for (const o of outs) {
    o.picked = 0; o.pallets = [];
    for (let k = 0; k < o.tarimas; k++) { const t = { o, k, rel: o.plan - p.liberaOla, tPick0: null, tPick1: null, tLoaded: null }; o.pallets.push(t); embP.push(t); }
  }
  embP.sort((a, b) => a.rel - b.rel || a.o.plan - b.o.plan || a.k - b.k);
  let reachFree = p.reachTrucks, pickFree = p.surtidores;
  const putQ = [];

  const insideWaiting = () => inside.filter(v => v.tDock == null).length;
  const stalls = new Array(p.cajones).fill(null);

  for (let m = 0; m <= END; m++) {
    // 1. llegadas a la carretera
    while (ai < arrivals.length && arrivals[ai].arr <= m) {
      const v = arrivals[ai++];
      if (v.kind === 'prov' && v.arr >= p.cierra) { v.noRecibido = 'fuera de horario'; v.tLeave = v.arr; continue; }
      if (v.kind === 'regreso' && p.carrilFlota) fleetQ.push(v); else roadQ.push(v);
    }
    // 2. al cierre, los proveedores que no pasaron caseta regresan otro día
    if (m === p.cierra) {
      for (let i = roadQ.length - 1; i >= 0; i--) if (roadQ[i].kind === 'prov') { roadQ[i].noRecibido = 'cerró la recepción'; roadQ[i].tLeave = m; roadQ.splice(i, 1); }
    }
    // 3. caseta de entrada (FIFO; un proveedor que no puede pasar bloquea su carril)
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] > m || !roadQ.length) continue;
      const v = roadQ[0];
      if (v.kind === 'prov') {
        if (m < p.abre || m >= p.cierra) continue;
        const waitingIn = inside.filter(x => x.tDock == null && x.tGateIn != null).length + lanes.filter(t => t > m).length;
        if (waitingIn >= p.cajones + docks.filter(d => !d.v).length) continue;   // patio lleno: espera fuera
        roadQ.shift();
        v.tGateIn = m; v.tIn = m + v.u.gate; lanes[l] = v.tIn;
        inside.push(v);
      } else {
        roadQ.shift();
        v.tGateIn = m; v.tIn = m + p.casetaFlota; v.tOut = v.tIn; lanes[l] = v.tIn;
      }
    }
    if (p.carrilFlota && fleetLane <= m && fleetQ.length) {
      const v = fleetQ.shift(); v.tGateIn = m; v.tIn = m + p.casetaFlota; v.tOut = v.tIn; fleetLane = v.tIn;
    }
    // 4. asignación de andenes de recepción
    const ready = inside.filter(v => v.tDock == null && v.tIn <= m);
    if (ready.length) {
      const key = v => {
        if (!p.citas) return [0, v.tIn];
        if (v.appt == null) return [1, v.tIn];                       // sin cita: después de los puntuales
        const onTime = v.arr <= v.appt + p.tolerancia;
        return onTime ? [0, v.appt] : [2, v.tIn];                     // tarde: al siguiente hueco libre
      };
      ready.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
      const eligible = v => !p.citas || v.appt == null || m >= v.appt - p.tolerancia;
      const take = (v, d) => {
        d.v = v; v.dock = d.i; v.tDock = m; v.ph = 'maniobra'; v.phEnd = m + p.maniobra;
        if (v.stall != null) { stalls[v.stall] = null; }
        d.log.push(v);
      };
      let pending = ready.filter(eligible);
      if (!pending.length && p.citas) pending = ready.slice(0, 1);  // andén ocioso: se adelanta al primero
      for (const v of pending) {
        let d = null;
        if (v.frio && p.frioExclusivo) d = docks.find(x => x.frio && !x.v);
        if (!d) d = docks.find(x => !x.frio && !x.v);
        if (d) take(v, d);
      }
    }
    // patio: a quien espera se le asigna cajón
    for (const v of inside) {
      if (v.tDock == null && v.tIn <= m && v.stall == null) {
        const s = stalls.indexOf(null);
        if (s >= 0) { stalls[s] = v; v.stall = s; v.tStall = m; }
      }
    }
    // 5. avance en andén
    for (const d of docks) {
      const v = d.v; if (!v) continue;
      dockBusyMin.rec++;
      if (v.phEnd > m) continue;
      if (v.ph === 'maniobra') { v.ph = 'esp_mont'; }
      if (v.ph === 'esp_mont') {
        if (forkFree > 0) {
          forkFree--; v.ph = 'descarga'; v.tUnload0 = m; v.phEnd = m + p.descargaPrep + p.descargaTarima * v.tarimas;
          v.pallets = [];
          for (let k = 0; k < v.tarimas; k++) { const t = { v, k, tUnl: m + p.descargaPrep + (k + 1) * p.descargaTarima, ready: null, tPut0: null, tStored: null }; v.pallets.push(t); recP.push(t); }
        }
        continue;
      }
      if (v.ph === 'descarga') {
        forkFree++; v.tUnload1 = m;
        if (p.validacionEnAnden) { v.ph = 'esp_val'; v.tValReq = m; }
        else { v.ph = 'papeles'; v.phEnd = m + p.papeles; valQ.push(v); v.tValReq = m; continue; }
      }
      if (v.ph === 'esp_val') {
        if (valFree > 0) { valFree--; v.ph = 'validacion'; v.tVal0 = m; v.incidencia = v.u.inc < p.pIncidencia; v.phEnd = m + p.valBase + p.valTarima * v.tarimas + (v.incidencia ? p.incidenciaMin : 0); }
        continue;
      }
      if (v.ph === 'validacion') { valFree++; v.tVal1 = m; v.rechazo = v.u.rech < p.pRechazo; v.ph = 'papeles'; v.phEnd = m + p.papeles; continue; }
      if (v.ph === 'papeles') { v.ph = 'salida'; v.tRelease = m; d.v = null; inside.splice(inside.indexOf(v), 1); exitQ.push(v); overtimeEnd = Math.max(overtimeEnd, m); }
    }
    // 6. validación desacoplada (cuarentena)
    if (!p.validacionEnAnden) {
      for (const v of valQ) if (v.tVal0 == null && valFree > 0 && v.tValReq <= m) { valFree--; v.tVal0 = m; v.incidencia = v.u.inc < p.pIncidencia; v.tVal1 = m + Math.ceil(p.valBase + p.valTarima * v.tarimas + (v.incidencia ? p.incidenciaMin : 0)); v.rechazo = v.u.rech < p.pRechazo; }
      for (const v of valQ) if (v.tVal0 != null && v.tVal1 === m) valFree++;
    }
    // 6b. tarimas validadas pasan a "por ubicar" y los montacargas las suben al rack (FIFO)
    for (const v of recP.length ? new Set(recP.filter(t => t.ready == null).map(t => t.v)) : []) {
      if (v.tVal1 != null && v.tVal1 <= m) for (const t of v.pallets) if (t.ready == null) { t.ready = Math.max(t.tUnl, v.tVal1); if (!v.rechazo) putQ.push(t); else t.devuelta = true; }
    }
    for (const t of putQ) if (t.tPut0 != null && t.tStored === m) reachFree++;
    for (const t of putQ) {
      if (reachFree <= 0) break;
      if (t.tPut0 == null && t.ready <= m) { reachFree--; t.tPut0 = m; t.tStored = m + p.ubicarTarima; }
    }
    // 7a. surtido (picking) por ola: cada tarima ocupa un surtidor
    for (const t of embP) if (t.tPick0 != null && t.tPick1 === m) { pickFree++; t.o.picked++; }
    for (const t of embP) {
      if (pickFree <= 0) break;
      if (m < p.turnoSurtido[0] || m >= p.turnoSurtido[1]) break;
      if (t.tPick0 == null && t.rel <= m) { pickFree--; t.tPick0 = m; t.tPick1 = m + p.surtidoTarima; }
    }
    // 7b. embarque: carga con cuadrilla y andén sur, cuando la ruta ya está surtida
    for (const o of outs) {
      if (o.tLoad0 != null || o.loadStart > m || o.picked < o.tarimas) continue;
      const d = !emb[o.laneIdx].v ? emb[o.laneIdx] : emb.find(x => !x.v);
      if (!d || crewFree <= 0) continue;
      crewFree--; d.v = o; o.dock = d.i; o.tDock = m; o.tLoad0 = m; o.tLoad1 = m + p.cargaBase + p.cargaTarima * o.tarimas; d.log.push(o); loading.push(o);
      o.pallets.forEach((t, k) => { t.tLoaded = m + p.cargaBase * 0.5 + (k + 1) * p.cargaTarima; });
    }
    for (const o of loading) {
      if (o.tLoad1 === m || (o.tLoad1 < m && !o.loaded)) { o.loaded = true; crewFree++; }
      if (o.loaded && o.tRelease == null && m >= Math.max(o.plan, o.tLoad1)) { o.tRelease = m; emb[o.dock].v = null; exitQ.push(o); }
    }
    dockBusyMin.emb += emb.filter(d => d.v).length;
    // 8. caseta de salida (un carril)
    if (exitLane <= m && exitQ.length) { const v = exitQ.shift(); v.tOut = m + p.salidaCaseta; exitLane = v.tOut; }
    // series y máximos
    const road = roadQ.length + fleetQ.length, yard = inside.filter(v => v.tDock == null).length;
    maxRoad = Math.max(maxRoad, roadQ.filter(v => v.kind === 'prov').length);
    maxYard = Math.max(maxYard, yard);
    if (m % 10 === 0) series.push({ m, road, roadProv: roadQ.filter(v => v.kind === 'prov').length, yard, rec: docks.filter(d => d.v).length, emb: emb.filter(d => d.v).length });
  }

  // ---------------------------------------------------------------- KPIs
  const prov = V;
  const recibidos = prov.filter(v => v.tDock != null);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const estancias = recibidos.filter(v => v.tOut != null).map(v => v.tOut - v.tGateIn);
  const citas = prov.filter(v => v.conCita && !v.reprog);
  const puntuales = citas.filter(v => v.arr != null && Math.abs(v.arr - v.appt) <= p.tolerancia);
  const horasRec = Math.max(1, (p.cierra - p.abre));
  const dts = recP.filter(t => t.tStored != null).map(t => t.tStored - t.tUnl);
  const embOnTime = outs.filter(o => o.tOut != null && o.tOut <= o.plan + 15);
  const kpi = {
    programados: prov.length,
    llegaron: prov.filter(v => v.arr != null).length,
    recibidos: recibidos.length,
    noRecibidos: prov.filter(v => v.noRecibido).length,
    reprogramados: prov.filter(v => v.reprog).length,
    faltas: prov.filter(v => v.falta).length,
    estancia: avg(estancias),
    estanciaP90: estancias.length ? [...estancias].sort((a, b) => a - b)[Math.floor(0.9 * (estancias.length - 1))] : 0,
    pctMas3h: estancias.length ? estancias.filter(x => x > 180).length / estancias.length : 0,
    esperaCarretera: avg(prov.filter(v => v.tGateIn != null).map(v => Math.max(0, v.tGateIn - v.arr))),
    esperaPatio: avg(recibidos.map(v => v.tDock - v.tIn)),
    colaMax: maxRoad,
    patioMax: maxYard,
    ocupPatio: maxYard / Math.max(1, p.cajones),
    cumplimiento: citas.length ? puntuales.length / citas.length : null,
    pctFaltas: citas.length ? prov.filter(v => v.falta).length / citas.length : 0,
    tAnden: avg(recibidos.filter(v => v.tRelease != null).map(v => v.tRelease - v.tDock)),
    usoAndenes: dockBusyMin.rec / (p.andenes * Math.max(horasRec, overtimeEnd - p.abre)),
    dockToStock: avg(dts),
    rechazos: recibidos.filter(v => v.rechazo).length,
    salidasATiempo: outs.length ? embOnTime.length / outs.length : 1,
    salidas: outs.length,
    atrasoSalida: avg(outs.filter(o => o.tOut != null).map(o => Math.max(0, o.tOut - o.plan))),
    tarimasRecibidas: recP.length, tarimasUbicadas: recP.filter(t => t.tStored != null && t.tStored < MIN_DAY).length,
    tarimasSurtidas: embP.filter(t => t.tPick1 != null).length,
    esperaSurtido: avg(embP.filter(t => t.tPick0 != null).map(t => t.tPick0 - t.rel)),
    esperaUbicar: avg(recP.filter(t => t.tPut0 != null).map(t => t.tPut0 - t.ready)),
    horasExtra: Math.max(0, overtimeEnd - p.cierra),
    capGen, capFrio, nSlots, tAndenMedio: meanDockTime(p),
  };
  return { p, V, F, all, docks, emb, series, kpi, recP, embP, outs };
}

// ------------------------------------------------------------------ dónde se atrasa
/** Etapas con trabajo en proceso, edad del más antiguo y semáforo, en el minuto m */
export const STAGES = [
  { id: 'carretera', flujo: 'rec', nombre: 'Carretera', unidad: 'veh', meta: 15, zona: 'carretera' },
  { id: 'caseta', flujo: 'rec', nombre: 'Caseta', unidad: 'veh', meta: 10, zona: 'caseta' },
  { id: 'patio', flujo: 'rec', nombre: 'Patio regulador', unidad: 'veh', meta: 30, zona: 'patio' },
  { id: 'anden', flujo: 'rec', nombre: 'Andén y descarga', unidad: 'veh', meta: 75, zona: 'recepcion' },
  { id: 'cuarentena', flujo: 'rec', nombre: 'Cuarentena (validar)', unidad: 'tar', meta: 120, zona: 'cuarentena' },
  { id: 'ubicar', flujo: 'rec', nombre: 'Por subir a rack', unidad: 'tar', meta: 60, zona: 'cuarentena' },
  { id: 'subiendo', flujo: 'rec', nombre: 'Subiendo a rack', unidad: 'tar', meta: 10, zona: 'racks' },
  { id: 'surtir', flujo: 'emb', nombre: 'Por surtir', unidad: 'tar', meta: 120, zona: 'picking' },
  { id: 'surtiendo', flujo: 'emb', nombre: 'Surtiendo (picking)', unidad: 'tar', meta: 45, zona: 'picking' },
  { id: 'consolidado', flujo: 'emb', nombre: 'Consolidado en carril', unidad: 'tar', meta: 150, zona: 'carriles' },
  { id: 'cargando', flujo: 'emb', nombre: 'Carga en andén', unidad: 'veh', meta: 45, zona: 'embarque' },
];

export function stagesAt(S, m) {
  const out = Object.fromEntries(STAGES.map(s => [s.id, { ...s, n: 0, edad: 0, items: [] }]));
  const add = (id, item, desde) => { const s = out[id]; s.n++; const e = Math.max(0, m - desde); if (e > s.edad) s.edad = e; s.items.push({ item, edad: e }); };
  for (const v of S.V) {
    const st = stateAt(v, m);
    if (st === 'carretera') add('carretera', v, v.arr);
    else if (st === 'caseta') add('caseta', v, v.tGateIn);
    else if (st === 'patio') add('patio', v, v.tIn);
    else if (v.tDock != null && m >= v.tDock && (v.tRelease == null || m < v.tRelease)) add('anden', v, v.tDock);
  }
  for (const t of S.recP) {
    if (t.tUnl > m) continue;
    if (t.devuelta && t.ready != null && m >= t.ready) continue;
    if (t.ready == null || m < t.ready) add('cuarentena', t, t.tUnl);
    else if (t.tPut0 == null || m < t.tPut0) add('ubicar', t, t.ready);
    else if (m < t.tStored) add('subiendo', t, t.tPut0);
  }
  for (const t of S.embP) {
    if (m < t.rel) continue;
    if (t.tPick0 == null || m < t.tPick0) add('surtir', t, t.rel);
    else if (m < t.tPick1) add('surtiendo', t, t.tPick0);
    else if (t.tLoaded == null || m < t.tLoaded) add('consolidado', t, t.tPick1);
  }
  for (const o of S.outs) if (o.tLoad0 != null && m >= o.tLoad0 && (o.tRelease == null || m < o.tRelease)) add('cargando', o, o.tLoad0);
  for (const s of Object.values(out)) {
    s.sem = s.n === 0 ? 'idle' : s.edad > s.meta * 1.5 ? 'crit' : s.edad > s.meta ? 'warn' : 'ok';
    s.items.sort((a, b) => b.edad - a.edad);
  }
  return out;
}

/** Lista de lo que va tarde en el minuto m: vehículo, lote o ruta, dónde está y cuánto lleva */
export function delaysAt(S, m) {
  const st = stagesAt(S, m), list = [];
  for (const s of Object.values(st)) {
    if (s.id === 'surtir' || s.id === 'surtiendo' || s.id === 'consolidado') continue;
    const seen = new Set();
    for (const { item, edad } of s.items) {
      if (edad <= s.meta) continue;
      const v = item.v || item.o || item;                 // tarimas se agrupan por vehículo
      const key = s.id + v.id; if (seen.has(key)) continue; seen.add(key);
      const n = s.items.filter(x => (x.item.v || x.item.o || x.item) === v && x.edad > s.meta).length;
      list.push({ stage: s, v, edad, n, sem: edad > s.meta * 1.5 ? 'crit' : 'warn' });
    }
  }
  // rutas de embarque en riesgo: salida programada con tarimas sin surtir o sin cargar
  for (const o of S.outs) {
    if (o.tOut != null && o.tOut <= m) continue;
    const faltan = o.pallets.filter(t => t.tPick1 == null || t.tPick1 > m).length;
    const rel = o.plan - S.p.liberaOla;
    if (m < rel) continue;
    const proj = o.tOut ?? Math.max(o.plan, m + faltan * S.p.surtidoTarima / Math.max(1, S.p.surtidores) + S.p.cargaBase + S.p.cargaTarima * o.tarimas);
    const atraso = proj - o.plan;
    if (atraso > 15 || (m > o.plan && (o.tOut == null || o.tOut > m))) {
      const where = o.tLoad0 != null && m >= o.tLoad0 ? out_('cargando', st) : faltan ? (o.pallets.some(t => t.tPick0 != null && t.tPick0 <= m && t.tPick1 > m) ? out_('surtiendo', st) : out_('surtir', st)) : out_('consolidado', st);
      list.push({ stage: where, v: o, edad: Math.max(0, m - rel), n: faltan, atraso, sem: atraso > 45 ? 'crit' : 'warn', ruta: true });
    }
  }
  return list.sort((a, b) => (b.sem === 'crit') - (a.sem === 'crit') || b.edad - a.edad);
}
const out_ = (id, st) => st[id];

/** Estado de un vehículo en el minuto m (para la tabla y la escena 3D) */
export function stateAt(v, m) {
  if (v.kind === 'salida') {
    if (v.tLoad0 == null || m < v.tLoad0 - 3) return 'programado';
    if (m < v.tRelease) return m < v.tLoad1 ? 'cargando' : 'listo';
    if (v.tOut != null && m < v.tOut) return 'saliendo';
    return 'en ruta';
  }
  if (v.reprog) return 'reprogramado';
  if (v.falta) return 'falta';
  if (v.arr == null || m < v.arr) return 'programado';
  if (v.noRecibido && m >= v.tLeave) return 'no recibido';
  if (v.tGateIn == null || m < v.tGateIn) return 'carretera';
  if (m < v.tIn) return 'caseta';
  if (v.kind === 'regreso') return 'salió';
  if (v.tDock == null || m < v.tDock) return 'patio';
  if (v.tRelease == null || m < v.tRelease) {
    if (m < v.tDock + 5) return 'atracando';
    if (v.tUnload0 == null || m < v.tUnload0) return 'espera montacargas';
    if (v.tUnload1 == null || m < v.tUnload1) return 'descarga';
    if (v.tVal0 != null && v.tVal1 != null && m >= v.tVal0 && m < v.tVal1 && v.tVal1 <= v.tRelease) return 'validación';
    if (v.tVal0 == null && v.tRelease && m < v.tRelease && v.tValReq != null && v.tUnload1 && v.tRelease - v.tUnload1 > 12) return 'espera validador';
    return 'papeles';
  }
  if (v.tOut == null || m < v.tOut) return 'saliendo';
  return 'salió';
}

export const STATE_COLOR = {
  'carretera': '#f87171', 'caseta': '#fb923c', 'patio': '#fbbf24', 'atracando': '#a3e635',
  'espera montacargas': '#f59e0b', 'descarga': '#34d399', 'espera validador': '#f472b6', 'validación': '#60a5fa', 'papeles': '#a78bfa',
  'saliendo': '#94a3b8', 'salió': '#64748b', 'programado': '#475569', 'falta': '#475569', 'reprogramado': '#475569', 'no recibido': '#b91c1c',
  'cargando': '#2dd4bf', 'listo': '#5eead4', 'en ruta': '#64748b',
};

export const hhmm = m => { const x = ((Math.round(m) % MIN_DAY) + MIN_DAY) % MIN_DAY; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
export const dur = m => { if (m == null || !isFinite(m)) return '—'; const r = Math.round(m); return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`; };

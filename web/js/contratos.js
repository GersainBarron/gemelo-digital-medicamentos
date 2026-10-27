// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  contratos.js · Contratos abiertos, órdenes de suministro y penas (datos simulados)
//
//  Motor puro (sin three.js ni DOM): se puede probar en Node.
//  Lee las órdenes que ya genera el inventario del CEDIS (network-sim.js) y
//  las convierte en el expediente contractual que las respalda:
//    · 8 contratos abiertos (piso 40 %, techo 100 %, fianza 10 % del máximo)
//      con un licitante en segundo lugar para cada uno,
//    · cada pedido semanal del CEDIS = una Orden de Suministro multipartida
//      (una partida por clave) con acuse y plazo de entrega,
//    · recepción en andén partida por partida: aceptada, aceptada con carta
//      canje, rechazada (red fría, certificado o caducidad) o entrega parcial,
//    · pena convencional diaria SOLO sobre lo no entregado de cada partida,
//      bolsa de penas del contrato contra el tope de la fianza,
//    · entrega trunca: aviso de imposibilidad, deducción sobre el saldo y
//      orden de rescate al segundo lugar,
//    · rescisión (por tope de penas o por incumplimiento) con audiencia y
//      resolución en días hábiles, y reasignación al segundo lugar.
//
//  Coherencia con el inventario: un pedido "retrasado" del inventario se
//  explica aquí como retraso del proveedor o como rechazo en el primer arribo
//  (el reemplazo llega en la fecha en que el inventario recibe); un pedido
//  "parcial" es una entrega trunca. En el escenario de contingencia, las
//  claves con falla de proveedor tienen una OS emitida que nunca se surte.
//
//  Todo es determinista (misma semilla = mismos expedientes en cualquier equipo).
//  >>> API: con datos reales, contratos y OS vienen del sistema de compras
//  (Compras MX / SAI) y los dictámenes de andén del WMS.
// =====================================================================
import { lotFor, scriptedShort, scenario, mulberry32, DAY } from './supply.js';

const H = 3600;
const BASE_DATE = Date.UTC(2026, 9, 26);                 // día 0 = lunes 26 de octubre de 2026

/** Parámetros de las reglas, con la numeración de la LAASSP publicada en el DOF el
 *  16-04-2025 y de su Reglamento (DOF 18-12-2025). Los porcentajes de pena y el plazo
 *  de entrega son del modelo de contrato (cada convocatoria los fija). */
export const REGLAS = {
  tasaPenaDiaria: 0.025,            // sobre el valor de lo no entregado, por día natural
  fianzaPct: 0.10,                  // del monto máximo; también tope de penas
  pisoPct: 0.40,
  acuseSLAh: 24,
  semOS: { amarillo: 5, naranja: 1 },               // días restantes para el vencimiento
  bolsa: { amarillo: 0.30, naranja: 0.60 },         // fracción del tope consumida
  frio: { min: 2, max: 8 },
  caducidadMeses: { rechazo: 12, carta: 18 },
  deduccionSaldo: 0.10,             // deducción al pago sobre el saldo que no se entregará
  avisoIncapacidad: [3, 9],         // días después del vencimiento
  rescateDias: [5, 8],
  audienciaHabiles: 5, resolucionHabiles: 15,
  pagoHabiles: 17,                  // plazo máximo de pago desde la verificación de la factura
  difSegundoMax: 0.10,              // diferencia máxima de precio para adjudicar al segundo lugar
  constanciaCumplimiento: 0.50,     // umbral de cumplimiento pedido para participar en compras consolidadas
  fundamento: {
    contrato: 'Contrato abierto: mínimo ≥ 40 % del máximo (art. 68 LAASSP)', pena: 'Pena convencional, tope = garantía de cumplimiento (art. 75 LAASSP; arts. 141-142 RLAASSP)',
    deduccion: 'Deducción por entrega parcial o deficiente (pactada en el contrato)', rescision: 'Rescisión: 5 días hábiles para alegar (art. 77 LAASSP)',
    segundo: 'Adjudicación al segundo lugar si la diferencia de precio es ≤ 10 % (art. 54 fr. VI LAASSP)', pago: 'Pago ≤ 17 días hábiles desde la verificación de la factura (art. 73 LAASSP)',
    monitoreo: 'Sistema de Monitoreo al Cumplimiento del Abasto de Insumos para la Salud (DOF 09-02-2026)',
    nota: 'Artículos de la LAASSP (DOF 16-04-2025) y su Reglamento (DOF 18-12-2025). La tasa de pena, el plazo de entrega y la deducción son supuestos del modelo de contrato; verificar con el área jurídica.',
  },
};

// Días inhábiles (además de sábados y domingos), como índice de día
const INHABILES = new Set(['2026-05-01', '2026-09-16', '2026-11-02', '2026-11-16', '2026-12-25', '2027-01-01']
  .map(s => Math.round((Date.parse(s + 'T00:00:00Z') - BASE_DATE) / 864e5)));
const wdOf = d => new Date(BASE_DATE + d * 864e5).getUTCDay();          // 0 = domingo
export const esHabil = d => wdOf(d) !== 0 && wdOf(d) !== 6 && !INHABILES.has(d);
export function sumarHabiles(d, n) { let x = d; while (n > 0) { x++; if (esHabil(x)) n--; } return x; }

const hashStr = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const between = (R, a, b) => a + (b - a) * R();

// Contratos (proveedores genéricos, sin nombres comerciales)
export const CONTRATOS_DEF = [
  { id: 'C1', prov: 'Proveedor A', giro: 'Laboratorio nacional', objeto: 'Analgésicos y antiinflamatorios' },
  { id: 'C2', prov: 'Proveedor B', giro: 'Distribuidor nacional', objeto: 'Crónicos: cardiovascular y metabólico' },
  { id: 'C3', prov: 'Proveedor C', giro: 'Laboratorio nacional', objeto: 'Antimicrobianos' },
  { id: 'C4', prov: 'Proveedor D', giro: 'Distribuidor especializado', objeto: 'Anestesia y quirófano' },
  { id: 'C5', prov: 'Proveedor E', giro: 'Fabricante de soluciones', objeto: 'Soluciones parenterales y electrolitos' },
  { id: 'C6', prov: 'Proveedor F', giro: 'Laboratorio de biológicos', objeto: 'Red fría: insulinas y oxitocina' },
  { id: 'C7', prov: 'Proveedor G', giro: 'Fabricante autorizado', objeto: 'Estupefacientes y psicotrópicos' },
  { id: 'C8', prov: 'Proveedor H', giro: 'Distribuidor regional', objeto: 'Respiratorio, gastro y otros' },
];
const SEGUNDOS = ['Licitante 2 · Distribuidor nacional', 'Licitante 2 · Laboratorio nacional', 'Licitante 2 · Distribuidor regional'];

function contratoDe(m) {
  if (m.frio) return 'C6';
  if (m.ctrl) return 'C7';
  switch (m.g) {
    case 'Analgesia': return 'C1';
    case 'Cardiología': case 'Endocrinología': return 'C2';
    case 'Infecciosas': return 'C3';
    case 'Anestesia': return 'C4';
    case 'Soluciones': return 'C5';
    default: return 'C8';
  }
}
const esFrio = m => !!m.frio;
const esCtrl = m => !!m.ctrl;

/** Precio unitario simulado (MXN sin IVA por pieza) */
export function precioDe(m) {
  const R = mulberry32(hashStr(m.c) ^ 0x9e3779b9);
  const r = (a, b) => Math.round(between(R, a, b) * 100) / 100;
  if (/Insulina/.test(m.n)) return r(180, 420);
  if (/Sevoflurano/.test(m.n)) return r(900, 1500);
  if (esCtrl(m)) return r(40, 160);
  return r(...({ caja: [18, 95], frasco: [35, 260], ampolleta: [9, 85], inhalador: [70, 140], bolsa: [16, 32], jeringa: [45, 90] }[m.pz] || [20, 80]));
}

export const SEM_ORDEN = { VERDE: 0, AMARILLO: 1, NARANJA: 2, ROJO: 3 };
const peor = (...s) => s.reduce((a, b) => (SEM_ORDEN[b] > SEM_ORDEN[a] ? b : a), 'VERDE');

export class Contratos {
  /**
   * @param inv      CedisInventory (network-sim.js) ya corrido
   * @param catalog  assets/medicamentos.json
   */
  constructor(inv, catalog, scen = scenario()) {
    this.inv = inv; this.scen = scen;
    this.items = catalog.items;
    this.byClave = new Map(this.items.map(m => [m.c, m]));
    // vigencia de 12 meses desde el 9 de abril de 2026 (día -200, inicio del inventario simulado)
    this.vigencia = { desde: -200, hasta: 164 };
    this.contratos = CONTRATOS_DEF.map((d, i) => ({ ...d, idx: i, folio: `CS-2026-HGO-${String(45 + i * 7).padStart(3, '0')}`, claves: [], segundo: SEGUNDOS[i % 3], difSegundo: 0.03 + (i % 4) * 0.015 }));
    this.byId = new Map(this.contratos.map(c => [c.id, c]));
    this.os = [];
    this.hechos = [];
    this._cache = { key: null, val: null };
    this.build();
  }

  // ---------------------------------------------------------------
  //  Construcción del expediente (una sola vez)
  // ---------------------------------------------------------------
  build() {
    const inv = this.inv;
    for (const m of this.items) {
      const s = inv.series.get(m.c); if (!s) continue;
      const k = this.byId.get(contratoDe(m));
      const precio = precioDe(m);
      k.claves.push({ c: m.c, m, precio, anual: s.P * 365, L: s.L });
    }
    for (const k of this.contratos) {
      k.montoMax = k.claves.reduce((n, x) => n + x.anual * x.precio, 0);
      k.montoMin = k.montoMax * REGLAS.pisoPct;
      k.fianza = k.montoMax * REGLAS.fianzaPct;
      k.tope = k.fianza;
      k.rescisiones = [];
    }

    // 1) Órdenes del inventario agrupadas por contrato y día de emisión
    const grupos = new Map();
    for (const k of this.contratos) for (const cl of k.claves) {
      const s = inv.series.get(cl.c);
      for (const o of s.orders) {
        const key = k.id + '|' + o.d;
        if (!grupos.has(key)) grupos.set(key, { k, d: o.d, lineas: [] });
        grupos.get(key).lineas.push({ cl, o });
      }
    }
    // 2) Falla del proveedor en contingencia: OS emitida que nunca se surte
    const crisis = new Map();
    for (const k of this.contratos) for (const cl of k.claves) {
      let sc = null;
      for (let d = -80; d <= 40 && !sc; d++) sc = scriptedShort(cl.c, d, this.scen, false);
      if (!sc) continue;
      let d0 = sc.from - cl.L - 3; while (wdOf(d0) !== 1) d0--;       // lunes previo
      const key = k.id + '|' + d0;
      if (!crisis.has(key)) crisis.set(key, { k, d: d0, lineas: [], crisis: true });
      const q = Math.max(cl.m.pack * 10, Math.round(cl.anual / 365 * 30 / (cl.m.pack * 10)) * cl.m.pack * 10);
      crisis.get(key).lineas.push({ cl, o: { d: d0, q, qq: 0, eta: null, late: false, part: false, crisis: true }, sc });
    }

    let n = 0;
    const todos = [...grupos.values(), ...crisis.values()].sort((a, b) => a.d - b.d || a.k.idx - b.k.idx);
    for (const g of todos) this.crearOS(g, ++n);
    this.os.sort((a, b) => a.tEmision - b.tEmision);
    for (const k of this.contratos) this.revisarRescision(k);
    this.construirPagos();
    this.hechos.sort((a, b) => a.t - b.t);
  }

  crearOS(g, n) {
    const { k, d } = g;
    const R = mulberry32(hashStr(k.id) ^ Math.imul(d + 9000, 2654435761) ^ (g.crisis ? 0x77 : 0));
    const tEmision = d * DAY + (9 + Math.floor(R() * 4)) * H;
    // acuse: casi siempre el mismo día; 6 % tarda más de 24 h
    const hAcuse = R() < 0.06 ? between(R, 25, 40) : between(R, 0.5, 8);
    const tAcuse = tEmision + hAcuse * H;
    const dAcuse = Math.floor(tAcuse / DAY);
    const plazo = Math.max(...g.lineas.map(l => l.cl.L));
    const dLim = dAcuse + plazo;                                   // se cuenta desde el día siguiente al acuse
    const os = {
      id: `OS-${String(2600 + n)}`, contrato: k.id, k, d, tEmision, tAcuse, acuseTarde: hAcuse > REGLAS.acuseSLAh,
      plazo, dLim, tLim: (dLim + 1) * DAY - 1, crisis: !!g.crisis, rescate: false, partidas: [], camiones: [],
    };
    this.hecho(tEmision, 'os', os, null, `${os.id} emitida a ${k.prov} (${g.lineas.length} partida${g.lineas.length > 1 ? 's' : ''})`, [6]);
    this.hecho(tAcuse, os.acuseTarde ? 'acuse_tarde' : 'acuse', os, null, `${os.id}: acuse del proveedor ${os.acuseTarde ? 'fuera de plazo (' + Math.round(hAcuse) + ' h)' : 'recibido'}; vence el ${fecha(dLim)}`, [7]);

    g.lineas.forEach((l, i) => {
      const { cl, o } = l;
      const p = {
        os, num: i + 1, c: cl.c, m: cl.m, precio: cl.precio, q: o.q, frio: esFrio(cl.m), ctrl: esCtrl(cl.m),
        entregas: [],          // { t, q, dictamen, motivo, temp, lote, carta }
        tCancel: null, deduccion: 0, rescate: null, estado: 'PENDIENTE',
      };
      os.partidas.push(p);
      const Rp = mulberry32(hashStr(cl.c) ^ Math.imul(d + 3000, 2246822519));
      const horaArribo = dd => dd * DAY + (7 + Math.floor(Rp() * 10)) * H + Math.floor(Rp() * 4) * 15 * 60;
      if (o.crisis && l.sc.f > 0) {
        // falla parcial del proveedor: entrega muy tarde (cuando termina el faltante) y acumula pena, sin rescisión
        const dd = l.sc.to - 1, lote = lotFor(cl.c, dd);
        p.entregas.push({ t: horaArribo(dd), q: o.q, aceptada: o.q, dictamen: lote.short ? 'ACEPTADA_CON_CANJE' : 'ACEPTADA_TOTAL', temp: p.frio ? 5.1 : null, lote: lote.lot, carta: lote.short, motivo: 'Entrega tardía tras falla de producción' });
        return;
      }
      if (o.crisis) {
        // nunca se surte: aviso de imposibilidad, rescisión parcial y rescate al segundo lugar (llega cuando el inventario se recupera)
        const dAviso = dLim + Math.round(between(Rp, ...REGLAS.avisoIncapacidad));
        p.tCancel = dAviso * DAY + 11 * H;
        p.causa = 'Falla del proveedor: sin materia prima ni capacidad de entrega';
        k.rescisiones.push({ p, dAviso });
        this.hecho(p.tCancel, 'incapacidad', os, p, `${k.prov} notifica imposibilidad de entregar ${cl.m.n} (${o.q.toLocaleString('es-MX')} pzas)`, [14]);
        return;
      }
      const dPrimero = d + cl.L;                                    // arribo en el plazo propio de la clave
      const dFinal = o.eta;
      const lote = lotFor(cl.c, dFinal);
      const carta = lote.short;                                     // caducidad corta: entra condicionada con carta canje
      if (o.late) {
        // retraso del proveedor o rechazo en el primer arribo (el reemplazo llega en o.eta)
        if (Rp() < 0.45 && dPrimero < dFinal) {
          const motivo = p.frio ? 'RECHAZADA_TEMPERATURA' : Rp() < 0.6 ? 'RECHAZADA_FEUM' : 'RECHAZADA_CADUCIDAD';
          const temp = p.frio ? Math.round(between(Rp, 8.3, 9.6) * 10) / 10 : null;
          p.entregas.push({ t: horaArribo(dPrimero), q: o.qq, aceptada: 0, dictamen: motivo, temp, lote: lotFor(cl.c, dPrimero).lot,
            motivo: motivo === 'RECHAZADA_TEMPERATURA' ? `Data-logger registró ${temp} °C (rango 2–8 °C)` : motivo === 'RECHAZADA_FEUM' ? 'Sin certificado analítico del lote (FEUM)' : 'Caducidad menor a 18 meses sin carta canje' });
        }
      }
      if (o.qq > 0) {
        const temp = p.frio ? Math.round(between(Rp, 3.6, 6.4) * 10) / 10 : null;
        p.entregas.push({ t: horaArribo(dFinal), q: o.qq, aceptada: o.qq, dictamen: carta ? 'ACEPTADA_CON_CANJE' : o.part ? 'ENTREGA_PARCIAL' : 'ACEPTADA_TOTAL', temp, lote: lote.lot, carta,
          motivo: carta ? 'Entra condicionada con carta compromiso de canje al 100 %' : o.part ? `Entrega ${Math.round(100 * o.qq / o.q)} % de lo solicitado` : '' });
      }
      if (o.part) {
        // entrega trunca: el saldo no llegará
        const dAviso = Math.max(dLim, dFinal) + Math.round(between(Rp, ...REGLAS.avisoIncapacidad));
        p.tCancel = dAviso * DAY + 12 * H;
        const saldo = o.q - o.qq;
        p.deduccion = saldo * p.precio * REGLAS.deduccionSaldo;
        p.causa = 'Imposibilidad de surtir el saldo (falta de principio activo)';
        const dr = dAviso + 1, llega = dr + Math.round(between(Rp, ...REGLAS.rescateDias));
        p.rescate = { q: saldo, dEmision: dr, tArribo: horaArribo(llega), prov: k.segundo, precio: p.precio * (1 + k.difSegundo) };
        this.hecho(p.tCancel, 'trunca', os, p, `${k.prov} avisa que no surtirá el saldo de ${cl.m.n}: ${saldo.toLocaleString('es-MX')} pzas`, [14]);
        this.hecho(p.tCancel + H, 'deduccion', os, p, `Deducción de ${mxn(p.deduccion)} sobre el saldo no entregado (${REGLAS.fundamento.deduccion})`, [27]);
        this.hecho(dr * DAY + 10 * H, 'rescate', os, p, `OS de rescate a ${k.segundo} por ${saldo.toLocaleString('es-MX')} pzas de ${cl.m.n} (llega en ${llega - dr} días)`, [6]);
      }
    });

    // Camiones: las entregas de la misma OS el mismo día viajan juntas (recepción mixta)
    const porDia = new Map();
    for (const p of os.partidas) for (const e of p.entregas) {
      const dd = Math.floor(e.t / DAY);
      if (!porDia.has(dd)) porDia.set(dd, { os, t: e.t, items: [] });
      const cam = porDia.get(dd); cam.t = Math.min(cam.t, e.t); cam.items.push({ p, e });
    }
    for (const cam of porDia.values()) {
      cam.frio = cam.items.some(x => x.p.frio);
      cam.rechazos = cam.items.filter(x => !x.e.aceptada).length;
      cam.prov = k.prov;
      cam.id = `REM-${os.id.slice(3)}-${cam.items.length}${String(Math.floor(cam.t / DAY) + 500).slice(-3)}`;
      os.camiones.push(cam);
      const ok = cam.items.filter(x => x.e.aceptada).length;
      this.hecho(cam.t, cam.rechazos ? 'recepcion_mixta' : 'recepcion', os, null,
        `${os.id} en andén: ${ok} partida${ok === 1 ? '' : 's'} aceptada${ok === 1 ? '' : 's'}${cam.rechazos ? `, ${cam.rechazos} rechazada${cam.rechazos > 1 ? 's' : ''}` : ''}`, cam.rechazos ? [9, 10, 11, 13, 14] : [9, 10, 11, 13]);
    }
    // Rescates: camión propio del segundo lugar
    for (const p of os.partidas) if (p.rescate) {
      const r = p.rescate;
      const cam = { os, t: r.tArribo, items: [{ p, e: { t: r.tArribo, q: r.q, aceptada: r.q, dictamen: 'ACEPTADA_TOTAL', lote: lotFor(p.c, Math.floor(r.tArribo / DAY)).lot, motivo: 'Rescate del segundo lugar', rescate: true } }],
        frio: p.frio, rechazos: 0, prov: r.prov, rescate: true, id: `REM-R${os.id.slice(3)}-${p.num}` };
      os.camiones.push(cam);
    }
    this.os.push(os);
  }

  /** Rescisión por incumplimiento (crisis) o por alcanzar el tope de penas */
  revisarRescision(k) {
    // por tope de penas: primer día en que la bolsa alcanza la fianza
    let dTope = null;
    for (let d = -200; d <= 70 && dTope === null; d += 1) if (this.penasContrato(k, (d + 1) * DAY - 1, false) >= k.tope) dTope = d;
    const casos = [...k.rescisiones];
    if (!casos.length && dTope === null) { k.rescisiones = []; return; }
    const dInicio = casos.length ? Math.min(...casos.map(x => x.dAviso)) + 1 : dTope + 1;
    const dAud = sumarHabiles(dInicio, REGLAS.audienciaHabiles);
    const dRes = sumarHabiles(dAud, 3);
    const partidas = casos.map(x => x.p);
    const proc = {
      tipo: casos.length ? 'PARCIAL' : 'TOTAL', causa: casos.length ? 'Incumplimiento: imposibilidad de entrega' : 'Penas acumuladas alcanzan la fianza',
      dInicio, dAud, dRes, dLimiteRes: sumarHabiles(dInicio, REGLAS.resolucionHabiles), partidas,
    };
    k.proc = proc;
    const claves = partidas.map(p => p.m.n.split(' ')[0]).join(', ');
    this.hecho(dInicio * DAY + 10 * H, 'rescision_inicio', null, null, `${k.id} · ${k.prov}: inicia procedimiento de rescisión ${proc.tipo.toLowerCase()} (${claves || 'contrato completo'}); audiencia hasta el ${fecha(dAud)}`, [14], k);
    this.hecho(dRes * DAY + 13 * H, 'rescision_resuelta', null, null, `${k.id}: se resuelve la rescisión ${proc.tipo.toLowerCase()}; partidas reasignadas a ${k.segundo} (+${(k.difSegundo * 100).toFixed(1)} %, dentro del 10 %)`, [], k);
    // rescate de cada partida rescindida: llega cuando el inventario se recupera (fin del faltante de guion)
    for (const x of casos) {
      const p = x.p, sc = x.p.os.crisis ? this._sc(p.c) : null;
      const dEm = dRes + 1;
      const llega = Math.max(dEm + REGLAS.rescateDias[0], sc ? sc.to : dEm + REGLAS.rescateDias[1]);
      const R = mulberry32(hashStr(p.c) ^ 0xabc);
      p.rescate = { q: p.q, dEmision: dEm, tArribo: llega * DAY + (8 + Math.floor(R() * 8)) * H, prov: k.segundo, precio: p.precio * (1 + k.difSegundo) };
      this.hecho(dEm * DAY + 10 * H, 'rescate', p.os, p, `OS de rescate a ${k.segundo}: ${p.q.toLocaleString('es-MX')} pzas de ${p.m.n}, llegada ${fecha(llega)}`, [6]);
      p.os.camiones.push({ os: p.os, t: p.rescate.tArribo, items: [{ p, e: { t: p.rescate.tArribo, q: p.q, aceptada: p.q, dictamen: 'ACEPTADA_TOTAL', lote: lotFor(p.c, llega).lot, motivo: 'Rescate del segundo lugar', rescate: true } }],
        frio: p.frio, rechazos: 0, prov: k.segundo, rescate: true, id: `REM-R${p.os.id.slice(3)}-${p.num}` });
    }
  }
  _sc(c) { for (let d = -80; d <= 40; d++) { const s = scriptedShort(c, d, this.scen, false); if (s) return s; } return null; }

  hecho(t, tipo, os, p, texto, docs = [], k = os?.k) {
    this.hechos.push({ t, tipo, os: os?.id || null, contrato: k?.id || null, clave: p?.c || null, texto, docs });
  }

  // ---------------------------------------------------------------
  //  Cálculos al instante t
  // ---------------------------------------------------------------
  /** Piezas aceptadas de la partida hasta t (incluye el rescate del segundo lugar, que es otro contrato) */
  aceptadas(p, t) { return p.entregas.reduce((n, e) => n + (e.t <= t ? e.aceptada : 0), 0); }
  /** ¿La partida sigue obligada al proveedor original en el día dd? */
  vigente(p, t) { return p.tCancel === null || t < p.tCancel; }

  /** Pena devengada de una partida al instante t: Σ días naturales vencidos × valor pendiente × tasa */
  pena(p, t) {
    const dLim = p.os.dLim, dHoy = Math.floor(t / DAY);
    let sum = 0;
    for (let dd = dLim + 1; dd <= dHoy; dd++) {
      const t0 = dd * DAY;
      if (!this.vigente(p, t0)) break;
      const pend = p.q - this.aceptadas(p, t0);
      if (pend <= 0) break;
      sum += pend * p.precio * REGLAS.tasaPenaDiaria;
    }
    return sum;
  }
  diasAtraso(p, t) {
    const dHoy = Math.floor(t / DAY);
    let n = 0;
    for (let dd = p.os.dLim + 1; dd <= dHoy; dd++) {
      if (!this.vigente(p, dd * DAY) || p.q - this.aceptadas(p, dd * DAY) <= 0) break;
      n++;
    }
    return n;
  }
  penasContrato(k, t, cap = true) {
    let s = 0;
    for (const os of this.os) if (os.k === k && os.tEmision <= t) for (const p of os.partidas) s += this.pena(p, t);
    return cap ? Math.min(s, k.tope) : s;
  }

  estadoPartida(p, t) {
    const acc = this.aceptadas(p, t);
    const ult = [...p.entregas].reverse().find(e => e.t <= t) || null;
    const res = p.rescate && t >= p.rescate.tArribo;
    let estado;
    if (acc >= p.q) estado = ult?.carta ? 'ACEPTADA_CON_CANJE' : 'ACEPTADA_TOTAL';
    else if (res) estado = 'SURTIDA_POR_SEGUNDO_LUGAR';
    else if (!this.vigente(p, t)) estado = p.rescate && t >= p.rescate.dEmision * DAY ? 'EN_RESCATE' : 'CANCELADA_SALDO';
    else if (ult && !ult.aceptada) estado = ult.dictamen;
    else if (acc > 0) estado = 'ENTREGA_PARCIAL';
    else estado = t > p.os.tLim ? 'EN_MORA' : 'EN_PLAZO';
    return { estado, aceptadas: acc, pendiente: Math.max(0, p.q - acc - (res ? p.rescate.q : 0)), pena: this.pena(p, t), dias: this.diasAtraso(p, t), ult };
  }

  estadoOS(os, t) {
    const ps = os.partidas.map(p => ({ p, ...this.estadoPartida(p, t) }));
    const cerrada = ps.every(x => ['ACEPTADA_TOTAL', 'ACEPTADA_CON_CANJE', 'SURTIDA_POR_SEGUNDO_LUGAR'].includes(x.estado));
    const restantes = os.dLim - Math.floor(t / DAY);
    let sem = 'VERDE', estado;
    if (t < os.tAcuse) { estado = 'EMITIDA'; sem = t - os.tEmision > 20 * H ? 'NARANJA' : t - os.tEmision > 12 * H ? 'AMARILLO' : 'VERDE'; }
    else if (cerrada) estado = 'CERRADA';
    else if (ps.some(x => x.estado === 'EN_RESCATE' || x.estado === 'CANCELADA_SALDO')) { estado = 'EN_RESCATE'; sem = 'ROJO'; }
    else if (t > os.tLim) { estado = 'ATRASADA'; sem = 'ROJO'; }
    else {
      estado = ps.some(x => x.aceptadas > 0) ? 'RECIBIDA_PARCIAL' : 'NOTIFICADA';
      sem = restantes <= REGLAS.semOS.naranja ? 'NARANJA' : restantes <= REGLAS.semOS.amarillo ? 'AMARILLO' : 'VERDE';
      if (ps.some(x => x.estado.startsWith('RECHAZADA'))) sem = peor(sem, 'AMARILLO');
    }
    const pena = ps.reduce((n, x) => n + x.pena, 0);
    const importe = os.partidas.reduce((n, p) => n + p.q * p.precio, 0);
    return { os, estado, sem, restantes, pena, importe, partidas: ps, cerrada };
  }

  // ---------------------------------------------------------------
  //  Facturas, pagos y cobros (penas, deducciones y garantías)
  // ---------------------------------------------------------------
  /** Una factura por entrega aceptada: CFDI 1-4 días después de la EBA, verificación 0-3 días
   *  hábiles y pago (la mayoría dentro de 17 días hábiles). La pena de la partida se cobra antes
   *  del pago que la cierra (art. 141 RLAASSP); en partidas rescindidas no se cobra la pena y se
   *  hace efectiva la garantía en proporción a la partida. */
  construirPagos() {
    this.facturas = []; this.cobros = [];
    for (const os of this.os) for (const p of os.partidas) {
      const R = mulberry32(hashStr(p.c) ^ Math.imul(os.d + 7000, 2654435761));
      const ents = p.entregas.filter(e => e.aceptada > 0);
      const rescindida = os.k.proc && os.k.proc.partidas.includes(p);
      const cierre = p.tCancel !== null ? Math.max(p.tCancel, ents.length ? ents.at(-1).t : 0) : ents.length ? ents.at(-1).t : null;
      ents.forEach((e, i) => this._factura(os, p, e, R, false, i === ents.length - 1 && !rescindida ? cierre : null));
      if (p.rescate) {
        const e = { t: p.rescate.tArribo, aceptada: p.rescate.q };
        this._factura(os, p, e, R, true, null);
      }
      if (p.deduccion > 0) this.cobros.push({ t: p.tCancel + 2 * DAY, k: os.k, os, p, tipo: 'DEDUCCION', monto: p.deduccion });
      if (rescindida) {
        const t = os.k.proc.dRes * DAY + 15 * H;
        this.cobros.push({ t, k: os.k, os, p, tipo: 'GARANTIA', monto: p.q * p.precio * REGLAS.fianzaPct });
        this.hecho(t, 'garantia', os, p, `Se hace efectiva la garantía de ${os.k.prov} por la partida ${p.m.n}: ${mxn(p.q * p.precio * REGLAS.fianzaPct)} (la pena no se cobra al rescindir)`, [4], os.k);
      }
    }
    this.facturas.sort((a, b) => a.tPago - b.tPago);
    this.cobros.sort((a, b) => a.t - b.t);
  }

  _factura(os, p, e, R, rescate, tCierre) {
    const dEBA = Math.floor(e.t / DAY);
    const dFac = dEBA + 1 + Math.floor(R() * 4);
    const dVer = sumarHabiles(dFac, Math.floor(R() * 4));
    const r = R(), hab = r < 0.82 ? 6 + Math.floor(R() * 11) : r < 0.95 ? 18 + Math.floor(R() * 6) : 24 + Math.floor(R() * 12);
    const dPago = sumarHabiles(dVer, hab);
    const precio = rescate ? p.rescate.precio : p.precio;
    const f = { k: os.k, os, p, rescate, prov: rescate ? os.k.segundo : os.k.prov, tEBA: e.t, tFactura: dFac * DAY + 12 * H, tVerif: dVer * DAY + 12 * H,
      tPago: dPago * DAY + 13 * H, habiles: hab, aTiempo: hab <= REGLAS.pagoHabiles, piezas: e.aceptada, bruto: e.aceptada * precio,
      sobrecosto: rescate ? e.aceptada * (precio - p.precio) : 0, pena: 0 };
    if (tCierre !== null) {
      const pena = this.pena(p, tCierre);
      if (pena > 0) { f.pena = pena; this.cobros.push({ t: f.tPago - H, k: os.k, os, p, tipo: 'PENA', monto: pena }); }
    }
    f.neto = f.bruto - f.pena;
    this.facturas.push(f);
    this.hecho(f.tPago, f.aTiempo ? 'pago' : 'pago_tarde', os, p, `Pago a ${f.prov} por ${p.m.n}: ${mxn(f.neto)}${f.pena ? ` (pena descontada ${mxn(f.pena)})` : ''}${f.aTiempo ? '' : ` · ${hab} días hábiles, fuera de plazo`}`, f.pena ? [26, 27, 28] : [26], os.k);
  }

  // ---------------------------------------------------------------
  //  Indicadores de gestión para un periodo [d0, d1] (días, inclusivo)
  // ---------------------------------------------------------------
  /** @param filtro id de contrato o null; tHasta: no se cuenta nada posterior a este instante (hoy) */
  kpis(d0, d1, filtro = null, tHasta = Infinity) {
    const T0 = d0 * DAY, T1 = Math.min((d1 + 1) * DAY, tHasta);
    const okK = k => !filtro || k.id === filtro;
    const r = {
      d0, d1, gasto: 0, gastoRescate: 0, sobrecosto: 0, piezas: 0, os: 0, osPartidas: 0, acuseTarde: 0,
      entregas: 0, partidasRecibidas: 0, rechazos: 0, motivos: { RECHAZADA_TEMPERATURA: 0, RECHAZADA_FEUM: 0, RECHAZADA_CADUCIDAD: 0 }, condicionadas: 0,
      vencidas: 0, otif: 0, aTiempoPiezas: 0, solicitadasVencidas: 0, diasAtrasoSum: 0, atrasadas: 0,
      penasDevengadas: 0, penasCobradas: 0, deducciones: 0, garantias: 0,
      facturas: 0, pagado: 0, pagosATiempo: 0, habilesSum: 0, porPagar: 0, porPagarVencido: 0, truncas: 0, rescates: 0, rescisiones: 0,
    };
    for (const os of this.os) {
      if (!okK(os.k)) continue;
      if (os.tEmision >= T0 && os.tEmision < T1) { r.os++; r.osPartidas += os.partidas.length; if (os.acuseTarde) r.acuseTarde++; }
      for (const p of os.partidas) {
        for (const e of p.entregas) if (e.t >= T0 && e.t < T1) {
          r.entregas++;
          if (e.aceptada) { r.partidasRecibidas++; r.gasto += e.aceptada * p.precio; r.piezas += e.aceptada; if (e.carta) r.condicionadas++; }
          else { r.rechazos++; r.motivos[e.dictamen] = (r.motivos[e.dictamen] || 0) + 1; }
        }
        if (p.rescate && p.rescate.tArribo >= T0 && p.rescate.tArribo < T1) {
          r.gastoRescate += p.rescate.q * p.rescate.precio; r.sobrecosto += p.rescate.q * (p.rescate.precio - p.precio); r.rescates++;
        }
        if (p.tCancel !== null && p.tCancel >= T0 && p.tCancel < T1) r.truncas++;
        // cumplimiento: partidas cuyo vencimiento cae en el periodo y ya pasó
        if (os.tLim >= T0 && os.tLim < T1) {
          r.vencidas++;
          const enTiempo = p.entregas.filter(e => e.t <= os.tLim).reduce((n, e) => n + e.aceptada, 0);
          const rech = p.entregas.some(e => e.t <= os.tLim && !e.aceptada);
          r.aTiempoPiezas += Math.min(p.q, enTiempo); r.solicitadasVencidas += p.q;
          if (enTiempo >= p.q && !rech) r.otif++;
          else { r.atrasadas++; r.diasAtrasoSum += this.diasAtraso(p, Math.min(T1, tHasta) - 1); }
        }
        r.penasDevengadas += this.pena(p, T1 - 1) - this.pena(p, T0 - 1);
      }
    }
    for (const c of this.cobros) if (okK(c.k) && c.t >= T0 && c.t < T1) {
      if (c.tipo === 'PENA') r.penasCobradas += c.monto; else if (c.tipo === 'DEDUCCION') r.deducciones += c.monto; else r.garantias += c.monto;
    }
    for (const f of this.facturas) {
      if (!okK(f.k)) continue;
      if (f.tPago >= T0 && f.tPago < T1) { r.facturas++; r.pagado += f.neto; r.habilesSum += f.habiles; if (f.aTiempo) r.pagosATiempo++; }
      if (f.tFactura < T1 && f.tPago >= T1) { r.porPagar += f.neto; const lim = sumarHabiles(Math.floor(f.tVerif / DAY), REGLAS.pagoHabiles); if (Math.floor(T1 / DAY) > lim) r.porPagarVencido += f.neto; }
    }
    for (const k of this.contratos) if (okK(k) && k.proc && k.proc.dInicio >= d0 && k.proc.dInicio <= d1) r.rescisiones++;
    r.cumplimiento = r.solicitadasVencidas ? r.aTiempoPiezas / r.solicitadasVencidas : null;
    r.otifPct = r.vencidas ? r.otif / r.vencidas : null;
    r.rechazoPct = r.entregas ? r.rechazos / r.entregas : null;
    r.atrasoProm = r.atrasadas ? r.diasAtrasoSum / r.atrasadas : 0;
    r.pagoATiempoPct = r.facturas ? r.pagosATiempo / r.facturas : null;
    r.habilesProm = r.facturas ? r.habilesSum / r.facturas : null;
    return r;
  }

  /** Serie diaria para gráficas */
  serie(d0, d1, filtro = null, tHasta = Infinity) {
    const out = [];
    for (let d = d0; d <= d1; d++) {
      if (d * DAY >= tHasta) break;
      const k = this.kpis(d, d, filtro, tHasta);
      out.push({ d, gasto: k.gasto, rescate: k.gastoRescate, pagado: k.pagado, penas: k.penasDevengadas, rechazos: k.rechazos, entregas: k.entregas });
    }
    return out;
  }

  /** Avance de cada contrato contra mínimo y máximo, y proyección al fin de la vigencia */
  avance(t) {
    const v = this.vigencia, dHoy = Math.floor(t / DAY);
    const frac = Math.min(1, Math.max(1e-6, (dHoy - v.desde) / (v.hasta - v.desde)));
    return this.contratos.map(k => {
      let ej = 0;
      for (const os of this.os) if (os.k === k) for (const p of os.partidas) ej += this.aceptadas(p, t) * p.precio;
      const proy = ej / frac;
      return { k, ejercido: ej, pct: ej / k.montoMax, proyeccion: proy, proyPct: proy / k.montoMax, riesgoMinimo: proy < k.montoMin, cercaMaximo: proy > k.montoMax * 0.95, frac };
    });
  }

  /** Todo lo ocurrido en un día (revisión del día) */
  dia(d, filtro = null) {
    const T0 = d * DAY, T1 = T0 + DAY, okK = k => !filtro || k.id === filtro;
    return {
      os: this.os.filter(o => okK(o.k) && o.tEmision >= T0 && o.tEmision < T1),
      camiones: this.camionesDia(d).filter(c => okK(c.os.k)),
      pagos: this.facturas.filter(f => okK(f.k) && f.tPago >= T0 && f.tPago < T1),
      cobros: this.cobros.filter(c => okK(c.k) && c.t >= T0 && c.t < T1),
      hechos: this.hechos.filter(h => h.t >= T0 && h.t < T1 && (!filtro || h.contrato === filtro)),
    };
  }

  // ---------------------------------------------------------------
  //  Recorrido del expediente: en qué etapa está cada OS al instante t
  // ---------------------------------------------------------------
  /** Ventanas de una remisión: patio (45 min antes), andén e inspección (2 h), devolución (3 h) y cuarentena */
  _ventanas(cam) {
    if (!cam._v) {
      const R = mulberry32(hashStr(cam.id) ^ 0x5151);
      const q = (cam.frio ? 2 + R() * 4 : 8 + R() * 32) * H;
      cam._v = { patio: cam.t - 45 * 60, anden: cam.t, insp: cam.t + 2 * H, devol: cam.rechazos ? cam.t + 5 * H : cam.t + 2 * H, libre: cam.t + 2 * H + q,
        soloRechazo: cam.items.every(x => !x.e.aceptada) };
    }
    return cam._v;
  }
  _facturasOS(os) { if (!os._fac) { os._fac = this.facturas.filter(f => f.os === os); } return os._fac; }
  /** Instante en que el expediente queda cerrado (último pago o cobro) */
  cierreOS(os) {
    if (os._cierre !== undefined) return os._cierre;
    let t = os.tAcuse;
    for (const f of this._facturasOS(os)) t = Math.max(t, f.tPago);
    for (const c of os.camiones) t = Math.max(t, this._ventanas(c).libre);
    for (const p of os.partidas) { if (p.tCancel) t = Math.max(t, p.tCancel); if (p.rescate) t = Math.max(t, p.rescate.tArribo); }
    if (os.k.proc && os.partidas.some(p => os.k.proc.partidas.includes(p))) t = Math.max(t, os.k.proc.dRes * DAY + 15 * H);
    return (os._cierre = t + 1);
  }
  /** Etapa de la OS al instante t (null si aún no existe o ya se archivó) */
  etapaOS(os, t, archivarDias = 3) {
    if (t < os.tEmision) return null;
    if (t >= this.cierreOS(os) + archivarDias * DAY) return null;
    if (t < os.tAcuse) return 'EMISION';
    // movimiento físico de las remisiones de esta OS
    for (const c of os.camiones) {
      const v = this._ventanas(c);
      if (t >= v.anden && t < v.insp) return 'ANDEN';
      if (c.rechazos && t >= v.insp && t < v.devol) return 'RECHAZO';
      if (t >= v.patio && t < v.anden) return c.rescate ? 'SEGUNDO' : 'PATIO';
    }
    const proc = os.k.proc;
    for (const p of os.partidas) {
      if (proc && proc.partidas.includes(p) && t >= proc.dInicio * DAY + 10 * H && t < proc.dRes * DAY + 13 * H) return 'JURIDICO';
      if (p.tCancel !== null && t >= p.tCancel && p.rescate && t < p.rescate.dEmision * DAY + 10 * H) return 'JURIDICO';
      if (p.tCancel !== null && t >= p.tCancel && !p.rescate && !proc?.partidas.includes(p) && t < p.tCancel + 2 * DAY) return 'JURIDICO';
      if (p.rescate && t >= p.rescate.dEmision * DAY + 10 * H && t < p.rescate.tArribo - 45 * 60) return 'SEGUNDO';
    }
    for (const c of os.camiones) { const v = this._ventanas(c); if (!v.soloRechazo && t >= v.insp && t < v.libre) return 'ALMACEN'; }
    for (const p of os.partidas) if (this.vigente(p, t) && p.q - this.aceptadas(p, t) > 0) return t > os.tLim ? 'MORA' : 'PROVEEDOR';
    let fac = false, pago = false;
    for (const f of this._facturasOS(os)) {
      if (t >= f.tEBA && t < f.tVerif) fac = true;
      else if (t >= f.tVerif && t < f.tPago) pago = true;
    }
    if (pago) return 'PAGO';
    if (fac) return 'FACTURA';
    return t < this.cierreOS(os) ? 'PAGO' : 'CERRADA';
  }
  /** Transiciones de etapa de una OS (muestreo cada 30 min), con duración y cumplimiento del plazo de cada etapa */
  recorrido(os) {
    if (os._rec) return os._rec;
    const out = [], fin = this.cierreOS(os);
    let prev = null;
    for (let t = os.tEmision; t <= fin + 1800; t += 1800) {
      const e = this.etapaOS(os, Math.min(t, fin), 0) || 'CERRADA';
      if (e !== prev) { if (out.length) out.at(-1).t1 = t; out.push({ etapa: e, t0: t, t1: null }); prev = e; }
    }
    out.at(-1).t1 = out.at(-1).t0;
    for (const x of out) {
      const sla = ETAPAS[x.etapa]?.sla;
      x.dur = x.t1 - x.t0;
      x.slaTxt = sla ? sla(os) : null;
      // el pago se mide por factura (17 días hábiles desde su verificación), no por la estancia en la etapa
      x.ok = !sla ? null : x.etapa === 'PAGO' ? this._facturasOS(os).filter(f => f.tPago <= x.t1 + 1800).every(f => f.aTiempo) : x.dur <= slaSeg(x.etapa, os, x.t0);
    }
    return (os._rec = out);
  }

  /** Estado completo al instante t (cacheado cada 10 minutos simulados) */
  estado(t) {
    const key = Math.floor(t / 600);
    if (this._cache.key === key) return this._cache.val;
    const contratos = this.contratos.map(k => {
      const oss = this.os.filter(o => o.k === k && o.tEmision <= t);
      const estados = oss.map(o => this.estadoOS(o, t));
      const abiertas = estados.filter(e => !e.cerrada);
      const penasRaw = this.penasContrato(k, t, false);
      const penas = Math.min(penasRaw, k.tope);
      const ratio = penas / k.tope;
      const ejercido = oss.reduce((n, o) => n + o.partidas.reduce((m, p) => m + this.aceptadas(p, t) * p.precio, 0), 0);
      const deducciones = oss.reduce((n, o) => n + o.partidas.reduce((m, p) => m + (p.tCancel !== null && p.tCancel <= t ? p.deduccion : 0), 0), 0);
      const pr = k.proc;
      let estado = 'VIGENTE', semBolsa = ratio >= 1 ? 'ROJO' : ratio >= REGLAS.bolsa.naranja ? 'NARANJA' : ratio >= REGLAS.bolsa.amarillo ? 'AMARILLO' : 'VERDE';
      if (pr && t >= pr.dInicio * DAY + 10 * H) estado = t >= pr.dRes * DAY + 13 * H ? (pr.tipo === 'PARCIAL' ? 'RESCINDIDO_PARCIAL' : 'RESCINDIDO') : 'EN_RESCISION';
      else if (ratio >= REGLAS.bolsa.naranja) estado = 'EN_RIESGO';
      const semOS = abiertas.reduce((s, e) => peor(s, e.sem), 'VERDE');
      const sem = peor(semBolsa, estado === 'EN_RESCISION' ? 'ROJO' : estado === 'RESCINDIDO_PARCIAL' ? 'NARANJA' : 'VERDE', semOS === 'ROJO' ? 'NARANJA' : semOS === 'NARANJA' ? 'AMARILLO' : 'VERDE');
      return { k, estado, sem, semBolsa, semOS, penas, penasRaw, ratio, ejercido, pctEjercido: ejercido / k.montoMax, deducciones, abiertas, nOS: oss.length, proc: pr };
    });
    const val = { t, contratos, colas: this.colas(t, contratos) };
    this._cache = { key, val };
    return val;
  }

  /** Trámites en cola por ventanilla (alimenta las pilas de expedientes en 3D) */
  colas(t, contratos) {
    const q = { ADQUISICIONES: 0, CALIDAD: 0, FINANZAS: 0, JURIDICO: 0 };
    for (const c of contratos) {
      for (const e of c.abiertas) {
        if (e.estado === 'EMITIDA' || e.estado === 'ATRASADA' || e.estado === 'EN_RESCATE') q.ADQUISICIONES++;
        if (e.pena > 0) q.FINANZAS++;
      }
      if (c.estado === 'EN_RESCISION') q.JURIDICO += 2 + c.proc.partidas.length;
    }
    for (const os of this.os) {
      for (const cam of os.camiones) {
        const dt = t - cam.t;
        if (dt >= 0 && dt < 36 * H) q.CALIDAD++;                         // inspección y cuarentena (≤ 48 h)
        if (dt >= 36 * H && dt < REGLAS.pagoDias * DAY && os.tEmision <= t) q.FINANZAS += 0.25;   // facturas por pagar
      }
      for (const p of os.partidas) if (p.tCancel && t >= p.tCancel && t < p.tCancel + 10 * DAY) q.JURIDICO++;
    }
    for (const k in q) q[k] = Math.round(q[k]);
    return q;
  }

  /** Camiones de proveedor que llegan el día dd (para la escena 3D) */
  camionesDia(dd) {
    const out = [];
    for (const os of this.os) for (const cam of os.camiones) if (Math.floor(cam.t / DAY) === dd) out.push(cam);
    return out.sort((a, b) => a.t - b.t);
  }

  /** Bitácora: últimos hechos hasta t */
  bitacora(t, n = 40, filtro = null) {
    const out = [];
    for (let i = this.hechos.length - 1; i >= 0 && out.length < n; i--) {
      const h = this.hechos[i];
      if (h.t > t) continue;
      if (filtro && h.contrato !== filtro) continue;
      out.push(h);
    }
    return out;
  }

  /** Expediente de una OS en el formato de ESTRUCTURA_DATOS_BUROCRACIA.md (ExpedienteMaestro) */
  expediente(os, t) {
    const e = this.estadoOS(os, t);
    return {
      dossier_id: os.id, folio_institucional: `EXP-2026-IMSS-HGO-${os.id.slice(3)}`, institucion: 'IMSS',
      clave_cnis: os.partidas[0].c, fase_actual: e.cerrada ? 12 : os.camiones.some(c => c.t <= t) ? 3 : 2,
      estado_flujo: { EMITIDA: 'ORDEN_EMITIDA', NOTIFICADA: 'ORDEN_EMITIDA', RECIBIDA_PARCIAL: 'EN_ANDEN_CEDIS', ATRASADA: 'ORDEN_EMITIDA', EN_RESCATE: 'EN_RESCISION_ADMINISTRATIVA', CERRADA: 'EN_CONCILIACION_PAGO' }[e.estado],
      semaforo_global: e.sem,
      partidas_detalle: e.partidas.map(x => ({
        partida_numero: x.p.num, clave_cnis: x.p.c, descripcion: x.p.m.n, cantidad_solicitada: x.p.q,
        cantidad_recibida_aprobada: x.aceptadas, cantidad_rechazada: x.p.entregas.filter(en => en.t <= t && !en.aceptada).reduce((n, en) => n + en.q, 0),
        cantidad_pendiente_saldo: x.pendiente, precio_unitario: x.p.precio, dictamen_anden: x.ult ? x.ult.dictamen : 'PENDIENTE',
        motivo_rechazo: x.ult && !x.ult.aceptada ? x.ult.motivo : null, dias_atraso_partida: x.dias, pena_acumulada_partida: Math.round(x.pena * 100) / 100,
      })),
    };
  }
}

// ---------------------------------------------------------------------
export const SEM_COLOR = { VERDE: 0x22c55e, AMARILLO: 0xfacc15, NARANJA: 0xf97316, ROJO: 0xef4444 };
export const ESTADO_ES = {
  VIGENTE: 'Vigente', EN_RIESGO: 'En riesgo', EN_RESCISION: 'En rescisión', RESCINDIDO_PARCIAL: 'Rescisión parcial', RESCINDIDO: 'Rescindido',
  EMITIDA: 'Emitida', NOTIFICADA: 'Notificada', RECIBIDA_PARCIAL: 'Recibida parcial', ATRASADA: 'Atrasada', EN_RESCATE: 'En rescate', CERRADA: 'Cerrada',
  ACEPTADA_TOTAL: 'Aceptada', ACEPTADA_CON_CANJE: 'Aceptada con carta canje', ENTREGA_PARCIAL: 'Entrega parcial', EN_MORA: 'En mora', EN_PLAZO: 'En plazo',
  RECHAZADA_TEMPERATURA: 'Rechazo por red fría', RECHAZADA_FEUM: 'Rechazo por certificado', RECHAZADA_CADUCIDAD: 'Rechazo por caducidad',
  CANCELADA_SALDO: 'Saldo cancelado', SURTIDA_POR_SEGUNDO_LUGAR: 'Surtida por 2º lugar',
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fecha(d) { const x = new Date(BASE_DATE + d * 864e5); return `${x.getUTCDate()} ${MESES[x.getUTCMonth()]}`; }
export const mxn = v => '$' + Math.round(v).toLocaleString('es-MX');

// ---------------------------------------------------------------------
//  Catálogo de etapas del expediente (para la simulación del recorrido)
// ---------------------------------------------------------------------
export const ETAPAS = {
  EMISION: { n: 'Emisión de la OS', area: 'Adquisiciones', docs: [6], sla: () => 'acuse ≤ 24 h' },
  PROVEEDOR: { n: 'Proveedor surte', area: 'Proveedor', docs: [7], sla: os => `entrega en ${os.plazo} días` },
  MORA: { n: 'Proveedor en mora', area: 'Proveedor · pena diaria', docs: [27], sla: null },
  PATIO: { n: 'Patio y cita', area: 'Caseta de citas', docs: [9], sla: () => '≤ 45 min' },
  ANDEN: { n: 'Inspección en andén', area: 'Control de calidad', docs: [10, 11, 12], sla: () => '≤ 2 h' },
  RECHAZO: { n: 'Devolución', area: 'Comité de andén', docs: [14], sla: null },
  ALMACEN: { n: 'Alta y cuarentena', area: 'Almacén', docs: [13, 15], sla: () => 'liberación ≤ 48 h' },
  FACTURA: { n: 'Factura y verificación', area: 'Finanzas', docs: [26], sla: () => 'CFDI y verificación' },
  PAGO: { n: 'Pago', area: 'Tesorería', docs: [27, 28], sla: () => '≤ 17 días hábiles' },
  JURIDICO: { n: 'Incumplimiento', area: 'Jurídico', docs: [14, 4], sla: () => 'audiencia 5 días hábiles' },
  SEGUNDO: { n: 'Rescate 2º lugar', area: 'Licitante en 2º lugar', docs: [6, 9], sla: () => '5 a 8 días' },
  CERRADA: { n: 'Expediente cerrado', area: 'Archivo', docs: [], sla: null },
};
export const DOCS = {
  4: 'Póliza de fianza', 6: 'Orden de suministro', 7: 'Acuse de notificación', 9: 'Remisión de embarque', 10: 'Certificado analítico',
  11: 'Gráfica de data-logger', 12: 'Carta canje', 13: 'Entrada de bienes (EBA)', 14: 'Acta circunstanciada', 15: 'Dictamen de liberación',
  26: 'Factura CFDI', 27: 'Cédula de penas', 28: 'Nota de crédito',
};
function slaSeg(etapa, os, t0) {
  switch (etapa) {
    case 'EMISION': return 24 * H;
    case 'PROVEEDOR': return os.tLim - os.tAcuse + 1;
    case 'PATIO': return 61 * 60;
    case 'ANDEN': return 2 * H + 60;
    case 'ALMACEN': return 48 * H;
    case 'FACTURA': return 7 * DAY;
    case 'PAGO': { const d = Math.floor(t0 / DAY); return (sumarHabiles(d, REGLAS.pagoHabiles) - d + 1) * DAY; }
    case 'JURIDICO': { const d = Math.floor(t0 / DAY); return (sumarHabiles(d, REGLAS.audienciaHabiles + 3) - d + 1) * DAY; }
    case 'SEGUNDO': return (REGLAS.rescateDias[1] + 1) * DAY;
    default: return Infinity;
  }
}

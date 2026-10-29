// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  marbetes-sim.js · Inventario físico con marbetes, conciliación y ajustes
//
//  Un año de operación del CEDIS ubicación por ubicación. El sistema (kárdex)
//  y el anaquel se separan por errores que nadie ve:
//   · salida sin registrar, captura en caja en vez de pieza, ubicación
//     equivocada, lote equivocado, merma sin acta, robo hormiga, entrada
//     duplicada y entrada no registrada (tasas por 1,000 movimientos).
//  Las tomas de inventario los descubren, como en el procedimiento del IMSS
//  1821-A03-002 (sector salud) y el art. 27 de la Ley General de
//  Contabilidad Gubernamental (inventario físico conciliado con el registro
//  contable):
//   · anual (todas las ubicaciones, almacén sin movimientos), rotativo
//     mensual (todas en el año, controlados del grupo 040 siempre),
//     selectivo trimestral (muestra al azar + 100 % controlados + mayor
//     costo) o cíclico ABC;
//   · marbete foliado por ubicación; primer conteo; segundo conteo ciego por
//     otra persona; tercer conteo solo si no coinciden;
//   · conciliación: lo que se explica (ubicación, lote, unidad de medida) se
//     reclasifica; lo demás se ajusta con autorización según el monto; los
//     controlados se aclaran al 100 % con acta;
//   · tolerancias: diferencias físicas ≤ 0.72 % del inventario y contables
//     ≤ 0.80 % del valor (IMSS 1821-A03-002, 5.2.16 y 5.2.20).
//  Determinista con semilla. Tasas, tiempos y montos de autorización son
//  supuestos editables.
// =====================================================================
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const PRECIO_GRUPO = { Analgesia: 18, Anestesia: 120, Cardiología: 45, Endocrinología: 60, Infecciosas: 55, Gastroenterología: 30, Soluciones: 22, Neumología: 140, Hematología: 90, Inmunoalergia: 25, 'Gineco-obstetricia': 15 };

export const CAUSAS = {
  salida: { n: 'Salida sin registrar', tasa: 0.15, signo: -1, explica: false },
  medida: { n: 'Captura en caja y no en pieza', tasa: 0.03, signo: 0, explica: true },
  ubicacion: { n: 'Guardado en otra ubicación', tasa: 0.12, signo: 0, explica: true },
  lote: { n: 'Lote equivocado', tasa: 0.1, signo: 0, explica: true },
  merma: { n: 'Merma sin acta (rotura o caducidad)', tasa: 0.06, signo: -1, explica: false },
  robo: { n: 'Robo hormiga', tasa: 0.012, signo: -1, explica: false },
  duplicada: { n: 'Entrada capturada dos veces', tasa: 0.02, signo: -1, explica: false },
  noRegistrada: { n: 'Entrada sin capturar', tasa: 0.02, signo: 1, explica: false },
};
export const DISCIPLINA = { alta: { n: 'Alta', k: 0.4, err: 0.012 }, media: { n: 'Media', k: 1, err: 0.03 }, baja: { n: 'Baja', k: 2.2, err: 0.07 } };
export const ESTRATEGIAS = {
  anual: { n: 'Solo anual', desc: 'Una toma total al cierre del año, con el almacén sin movimientos dos días.' },
  selectivo: { n: 'Anual + selectivo trimestral', desc: 'Además de la anual, cada trimestre una muestra al azar (10 %), todos los controlados y el 10 % de mayor costo, como pide el IMSS.' },
  rotativo: { n: 'Anual + rotativo mensual', desc: 'Además de la anual, cada mes una doceava parte de las ubicaciones y todos los controlados: en el año se cuentan todas.' },
  abc: { n: 'Cíclico ABC + anual', desc: 'Conteos todos los días: A (20 % de mayor valor) cada mes, B cada trimestre, C cada semestre y controlados cada semana; más la anual.' },
};
export const NIVEL = { jefe: 'Jefe de almacén', admin: 'Administrador del CEDIS', acta: 'Acta administrativa y Órgano Interno de Control', sanitario: 'Acta, responsable sanitario y libro de control' };
export const ALMACENISTAS = 8;
export const almacenista = i => `Almacenista ${i + 1}`;

/**
 * @param slots   [{ name, type, clave, rack }]
 * @param catalog Map clave → { nombre, grupo, frio, pack }
 * @param o       { estrategia, disciplina, deshonesto, u1, u2, seed }
 */
export function simular(slots, catalog, o = {}) {
  const est = o.estrategia || 'rotativo', D = DISCIPLINA[o.disciplina || 'media'];
  const u1 = o.u1 ?? 1000, u2 = o.u2 ?? 10000, seed = o.seed || 1;
  const r = mulberry32(hash(`marb|${seed}|${o.disciplina}|${o.deshonesto ? 1 : 0}`));            // errores: mismos para todas las estrategias
  const rc = mulberry32(hash(`conteo|${seed}|${est}`));                                            // errores de conteo
  const racks = [...new Set(slots.map(s => s.rack))];
  const S = slots.map((s, i) => {
    const c = catalog.get(s.clave) || { grupo: 'Analgesia' };
    const ctrl = s.clave.startsWith('040');
    const precio = Math.round((PRECIO_GRUPO[c.grupo] || 40) * (c.frio ? 3.5 : 1) * (ctrl ? 1.5 : 1));
    const base = s.type === 'slot_pallet' ? 600 + Math.floor(r() * 1200) : 40 + Math.floor(r() * 220);
    const mov = s.type === 'slot_pallet' ? 0.8 : 5;                                                // movimientos por día
    return { i, ...s, nombre: c.nombre || s.clave, ctrl, precio, stock: base, mov, d: 0, lote: false, causas: [], desde: null, alm: racks.indexOf(s.rack) % ALMACENISTAS };
  });
  const dishonest = o.deshonesto ? Math.floor(mulberry32(hash('alm' + seed))() * ALMACENISTAS) : -1;
  for (const s of S) {                                                                            // probabilidad diaria de cada causa en la ubicación
    s.pk = Object.entries(CAUSAS).map(([k, c]) => [k, s.mov * c.tasa / 1000 * D.k * (k === 'robo' ? (s.ctrl ? 6 : 1) * (s.alm === dishonest ? 40 : 1) : 1)]);
    s.pTot = s.pk.reduce((a, [, p]) => a + p, 0);
  }
  // clasificación ABC por valor
  const byVal = [...S].sort((a, b) => b.stock * b.precio - a.stock * a.precio);
  byVal.forEach((s, k) => { s.abc = k < S.length * 0.2 ? 'A' : k < S.length * 0.5 ? 'B' : 'C'; });
  const top10 = new Set(byVal.slice(0, Math.ceil(S.length * 0.1)).map(s => s.i));
  const bySame = new Map(); for (const s of S) (bySame.get(s.clave) || bySame.set(s.clave, []).get(s.clave)).push(s);
  // calendario de tomas
  const tomas = [];
  const add = (day, tipo, sel) => tomas.push({ day, tipo, sel });
  if (est === 'selectivo') for (const day of [90, 181, 273]) add(day, 'Selectivo trimestral', s => s.ctrl || top10.has(s.i) || mulberry32(hash(`sel|${seed}|${day}|${s.i}`))() < 0.1);
  if (est === 'rotativo') for (let m = 0; m < 11; m++) add(Math.round(30.4 * (m + 1)) - 2, `Rotativo de ${MESES[m]}`, s => s.ctrl || s.i % 12 === m);
  if (est === 'abc') for (let day = 7; day < 360; day += 7) add(day, 'Cíclico semanal', s => s.ctrl || (s.abc === 'A' && day % 28 === 0) || (s.abc === 'B' && day % 91 === 0) || (s.abc === 'C' && day % 182 === 0));
  add(364, 'Anual (cierre del ejercicio)', () => true);
  tomas.sort((a, b) => a.day - b.day);
  // ---- año
  let ti = 0, folio = 1;
  const serie = [], eventos = { total: 0, valor: 0, porCausa: {} };
  const resultTomas = [];
  let exposicion = 0, fantasma = 0;
  for (let day = 0; day < 365; day++) {
    // errores ocultos del día
    for (const s of S) {
      if (r() >= s.pTot) { if (s.stock + s.d < 0) s.d = -s.stock; continue; }
      let x = r() * s.pTot, k = null;
      for (const [kk, pk] of s.pk) { if (x < pk) { k = kk; break; } x -= pk; }
      {
        let q = 0;
        if (k === 'salida') q = -(1 + Math.floor(r() * (s.type === 'slot_pallet' ? 20 : 6)));
        else if (k === 'merma') q = -(1 + Math.floor(r() * 4));
        else if (k === 'robo') q = -(1 + Math.floor(r() * (s.ctrl ? 4 : 10)));
        else if (k === 'duplicada') q = -(10 + Math.floor(r() * (s.type === 'slot_pallet' ? 150 : 30)));
        else if (k === 'noRegistrada') q = 10 + Math.floor(r() * (s.type === 'slot_pallet' ? 150 : 30));
        else if (k === 'medida') q = (r() < 0.5 ? -1 : 1) * (9 * (2 + Math.floor(r() * 6)));       // cajas de 10 capturadas como piezas o al revés
        else if (k === 'ubicacion') {
          const otros = bySame.get(s.clave).filter(x => x !== s);
          if (!otros.length) continue;
          const t = otros[Math.floor(r() * otros.length)];
          q = -(5 + Math.floor(r() * 40));
          t.d -= q; t.causas.push('ubicacion'); if (t.desde == null) t.desde = day;
        } else if (k === 'lote') { s.lote = true; }
        s.d += q; s.causas.push(k); if (s.desde == null) s.desde = day;
        eventos.total++; eventos.valor += Math.abs(q) * s.precio; eventos.porCausa[k] = (eventos.porCausa[k] || 0) + 1;
      }
      if (s.stock + s.d < 0) s.d = -s.stock;                                                     // no puede haber menos de cero
    }
    // tomas del día
    while (ti < tomas.length && tomas[ti].day === day) {
      const T = tomas[ti++], sel = S.filter(T.sel);
      const res = { day: T.day, tipo: T.tipo, folio0: folio, n: sel.length, c2: 0, c3: 0, rows: [], niveles: { jefe: 0, admin: 0, acta: 0, sanitario: 0 }, reclas: 0, ajNeto: 0, ajAbs: 0, piezasFis: 0, piezasDif: 0, valorInv: 0, horas: 0, edad: [] };
      for (const s of sel) {
        const P = s.stock + s.d, sys = s.stock;
        const cnt = () => (rc() < D.err ? Math.max(0, P + (rc() < 0.5 ? -1 : 1) * (1 + Math.floor(rc() * Math.max(2, P * 0.08)))) : P);
        const c1 = cnt(), c2 = cnt(); res.c2++;
        let c3 = null, R = c1;
        if (c1 !== c2) { c3 = rc() < 0.995 ? P : cnt(); R = c3; res.c3++; }
        const Dq = R - sys;
        res.horas += (s.type === 'slot_pallet' ? 4 : 2) * (c3 == null ? 2 : 3) / 60;
        res.piezasFis += R; res.valorInv += R * s.precio;
        const m = { folio: folio++, slot: s.name, i: s.i, clave: s.clave, nombre: s.nombre, ctrl: s.ctrl, abc: s.abc, sys, c1, c2, c3, R, D: Dq, lote: s.lote, precio: s.precio, alm: s.alm, contador: [(s.alm + 1) % ALMACENISTAS, (s.alm + 3) % ALMACENISTAS], causas: [...new Set(s.causas)], edad: s.desde == null ? 0 : T.day - s.desde };
        if (Dq !== 0 || s.lote) {
          const expl = m.causas.length && m.causas.every(k => CAUSAS[k].explica);
          if (Dq === 0) { m.estado = 'reclasificado'; m.nota = 'lote corregido'; res.reclas++; }
          else if (expl && rc() < 0.75) { m.estado = 'reclasificado'; m.nota = m.causas.map(k => CAUSAS[k].n.toLowerCase()).join(', '); res.reclas++; }
          else {
            const v = Math.abs(Dq) * s.precio;
            m.nivel = s.ctrl ? 'sanitario' : v <= u1 ? 'jefe' : v <= u2 ? 'admin' : 'acta';
            res.niveles[m.nivel]++;
            m.estado = 'ajustado'; res.ajNeto += Dq * s.precio; res.ajAbs += v; res.piezasDif += Math.abs(Dq);
            m.robo = m.causas.includes('robo');
          }
          if (s.desde != null) res.edad.push(T.day - s.desde);
          res.rows.push(m);
        } else m.estado = 'ok';
        // el sistema queda igual al conteo; si el conteo se equivocó, la diferencia sigue (escondida)
        s.stock = R; s.d = P - R; s.lote = false; s.causas = s.d ? s.causas : []; s.desde = s.d ? s.desde : null;
        (res.marbetes ||= []).push(m);
      }
      res.folio1 = folio - 1;
      res.tolFis = res.piezasFis ? res.piezasDif / res.piezasFis : 0;
      res.tolCont = res.valorInv ? res.ajAbs / res.valorInv : 0;
      resultTomas.push(res);
    }
    // exactitud del día (ubicaciones donde sistema = anaquel y lote correcto)
    let ok = 0, exp = 0, fan = 0;
    for (const s of S) { if (s.d === 0 && !s.lote) ok++; else exp += Math.abs(s.d) * s.precio; if (s.stock > 0 && s.stock + s.d <= 0) fan++; }
    serie.push({ day, exactitud: ok / S.length, exposicion: exp, fantasma: fan });
    exposicion += exp; fantasma += fan;
  }
  // ---- integridad: ajustes repetidos de faltante por almacenista
  // patrón de robo hormiga: faltantes chicos (10 piezas o menos) que se repiten en las ubicaciones de una misma persona
  const porAlm = Array.from({ length: ALMACENISTAS }, (_, a) => ({ a, ubic: S.filter(s => s.alm === a).length, faltantes: 0, chicos: 0, valor: 0, ctrl: 0, repetidas: 0, robo: 0 }));
  const vecesUb = new Map();
  for (const T of resultTomas) for (const m of T.rows) if (m.estado === 'ajustado' && m.D < 0) {
    const x = porAlm[m.alm]; x.faltantes++; x.valor += -m.D * m.precio; if (m.ctrl) x.ctrl++; if (m.robo) x.robo++;
    if (-m.D <= 10) { x.chicos++; const k = m.slot; vecesUb.set(k, (vecesUb.get(k) || 0) + 1); if (vecesUb.get(k) === 2) x.repetidas++; }
  }
  for (const x of porAlm) x.tasa = x.ubic ? x.chicos / x.ubic : 0;
  const med = [...porAlm].map(x => x.tasa).sort((a, b) => a - b)[Math.floor(ALMACENISTAS / 2)] || 0;
  const alertas = porAlm.filter(x => x.chicos >= 5 && x.tasa > 1.5 * med).map(x => ({ ...x, motivo: `${x.chicos} faltantes chicos (10 piezas o menos) en ${x.ubic} ubicaciones a su cargo, ${(x.tasa / Math.max(med, 1e-9)).toFixed(1)} veces la mediana; ${x.repetidas} ubicaciones con faltante repetido${x.ctrl ? `; ${x.ctrl} en controlados` : ''}` }));
  const anual = resultTomas.at(-1);
  const edades = resultTomas.flatMap(t => t.edad);
  const kpi = {
    exactitudProm: serie.reduce((s, x) => s + x.exactitud, 0) / serie.length,
    exactitudPre: serie[363].exactitud, exactitudPost: serie[364].exactitud,
    eventos: eventos.total, valorEventos: eventos.valor,
    detectadas: resultTomas.reduce((s, t) => s + t.rows.length, 0),
    ajustes: resultTomas.reduce((s, t) => s + t.rows.filter(m => m.estado === 'ajustado').length, 0),
    reclas: resultTomas.reduce((s, t) => s + t.reclas, 0),
    ajNeto: resultTomas.reduce((s, t) => s + t.ajNeto, 0), ajAbs: resultTomas.reduce((s, t) => s + t.ajAbs, 0),
    edadProm: edades.length ? edades.reduce((a, b) => a + b, 0) / edades.length : 0,
    exposicionProm: exposicion / 365, fantasmaProm: fantasma / 365,
    horas: resultTomas.reduce((s, t) => s + t.horas, 0), diasCerrado: 2, conteos: resultTomas.reduce((s, t) => s + t.n, 0),
    tolFis: anual.tolFis, tolCont: anual.tolCont, ctrlPend: 0,
    niveles: resultTomas.reduce((acc, t) => { for (const k in t.niveles) acc[k] = (acc[k] || 0) + t.niveles[k]; return acc; }, {}),
    dishonest,
  };
  return { est, D, slots: S, tomas: resultTomas, serie, eventos, kpi, alertas, porAlm };
}
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function comparar(slots, catalog, o) { return Object.keys(ESTRATEGIAS).map(e => ({ e, n: ESTRATEGIAS[e].n, ...simular(slots, catalog, { ...o, estrategia: e }).kpi })); }

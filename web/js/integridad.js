// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  integridad.js · Integridad del plan de necesidades
//
//  Pregunta: ¿qué datos debe crear la plataforma (ATDT) para que ninguna
//  dependencia —unidad, delegación u Oficina Central— manipule el plan sin
//  que se note?
//
//  · Sobre el plan simulado se siembran actores de mala fe con conductas
//    conocidas (inflar, unidades fantasma, aprobar en bloque, dirigir a un
//    proveedor, modificar después de la firma…), cada una con su monto.
//  · Cada regla de alerta necesita ciertos datos. Si la plataforma no los
//    crea, la regla no corre. Se mide lo que se frena a tiempo (antes de
//    autorizar), lo que solo se ve tarde (al comparar contra el surtido,
//    con el dinero ya gastado) y lo que se escapa.
//  · También se cuentan las falsas alarmas sobre unidades honestas: más
//    datos no solo detectan más, también acusan menos a quien no debe.
//  Todo es determinista (semilla). Los datos son sintéticos: lo que se
//  entrega a la ATDT es la lista de datos y campos, no los datos.
// =====================================================================
import { mulberry32, hash, total, clavesForUnit } from './plan-engine.js';

// ------------------------------------------------------------ datos que debe crear la plataforma
export const DATOS = [
  { id: 'consumo', n: 'Consumo real por unidad', area: 'Salidas de unidades médicas (farmacia)', frec: 'Diaria', campos: 'CLUES, clave, fecha, piezas surtidas, folio de receta, cédula del médico', desc: 'Lo que de verdad se entregó a pacientes. Es la vara para medir si un pedido está inflado.' },
  { id: 'vales', n: 'Recetas negadas y vales de desabasto', area: 'Salidas de unidades médicas (farmacia)', frec: 'Diaria', campos: 'CLUES, clave, fecha, piezas negadas, folio del vale', desc: 'Corrige el consumo de los meses con desabasto; sin esto, una unidad que se quedó sin medicamento parece que pide de más.' },
  { id: 'dh', n: 'Padrón de derechohabientes adscritos', area: 'Afiliación y vigencia de derechos', frec: 'Mensual', campos: 'CLUES, mes, adscritos, altas, bajas', desc: 'Comprueba el motivo "más derechohabientes".' },
  { id: 'plantilla', n: 'Plantilla médica y servicios activos', area: 'Personal y planeación de servicios', frec: 'Mensual', campos: 'CLUES, servicio, especialidad, médicos, fecha de apertura', desc: 'Comprueba el motivo "servicio nuevo o médico especialista".' },
  { id: 'cuadro', n: 'Cuadro básico por nivel de atención', area: 'Comité de insumos (CNIS)', frec: 'Por actualización', campos: 'clave, nivel, servicios que la prescriben, vigencia', desc: 'Qué claves puede pedir cada tipo de unidad.' },
  { id: 'clues', n: 'Estatus de cada unidad (CLUES)', area: 'Infraestructura y DGIS', frec: 'Por evento', campos: 'CLUES, estatus (operando, en obra, cerrada), fecha, documento', desc: 'Evita planear para unidades que no operan.' },
  { id: 'kardex', n: 'Existencias, caducidades y mermas', area: 'Manejo de inventario', frec: 'Diaria', campos: 'CLUES, clave, lote, caducidad, existencia, mermas con acta', desc: 'Detecta a quien pide teniendo inventario de sobra y lo que se caduca después.' },
  { id: 'identidad', n: 'Identidad en cada acción', area: 'Gestor de usuarios (Llave MX)', frec: 'En cada acción', campos: 'usuario, rol, CLUES o delegación asignada, sesión, IP, fecha y hora', desc: 'Quién hizo cada cosa; impide que una persona actúe con dos roles.' },
  { id: 'bitacora', n: 'Bitácora sellada y versiones', area: 'Plataforma (núcleo)', frec: 'En cada acción', campos: 'acción, valor antes, valor después, usuario, hora, huella del registro anterior', desc: 'Registro que no se puede borrar ni editar; guarda cada versión de las piezas.' },
  { id: 'tiempos', n: 'Tiempo de revisión por petición', area: 'Plataforma (núcleo)', frec: 'En cada acción', campos: 'petición, apertura, decisión, segundos con el detalle abierto', desc: 'Distingue una revisión real de una aprobación en bloque.' },
  { id: 'motivo', n: 'Motivo con evidencia', area: 'Plataforma (núcleo)', frec: 'En cada cambio', campos: 'catálogo de motivos, documento adjunto, quién lo valida', desc: 'Todo cambio de piezas lleva una razón comprobable.' },
  { id: 'contratos', n: 'Proveedor y precio por clave', area: 'Contrataciones', frec: 'Por contrato', campos: 'clave, proveedor, contrato, precio, vigencia', desc: 'Permite ver si el plan se carga hacia las claves de un proveedor.' },
  { id: 'surtido', n: 'Surtido contra lo planeado', area: 'Suministro y reposición', frec: 'Mensual', campos: 'plan, CLUES, clave, mes, piezas planeadas, compradas, entregadas y consumidas', desc: 'Cierra el ciclo: al final del año muestra lo que se pidió de más, pero el dinero ya se gastó.' },
];
export const DATO = Object.fromEntries(DATOS.map(d => [d.id, d]));
// lo que ya traen los requerimientos del Módulo 1 (Llave MX, catálogo de unidades y de insumos por nivel)
export const PRESET_REQ = ['identidad', 'clues', 'cuadro'];

// ------------------------------------------------------------ reglas de alerta
//  sens: qué tan seguido acierta la regla cuando tiene sus datos (los actores también se cuidan:
//  aprueban despacio, adjuntan evidencia falsa, reparten el aumento entre proveedores)
export const REGLAS = [
  { id: 'R_consumo', sens: 0.95, n: 'Pide más de 1.5 veces lo que consumió', datos: ['consumo'] },
  { id: 'R_kardex', sens: 0.9, n: 'Pide teniendo más de 6 meses de existencia', datos: ['kardex'] },
  { id: 'R_clues', sens: 0.95, n: 'Pide para una unidad que no opera', datos: ['clues'] },
  { id: 'R_cuadro', sens: 0.95, n: 'Pide claves que no le corresponden por nivel', datos: ['cuadro'] },
  { id: 'R_dh', sens: 0.8, n: '"Más derechohabientes" sin crecimiento del padrón', datos: ['dh'] },
  { id: 'R_plantilla', sens: 0.8, n: '"Servicio nuevo" sin servicio ni médico registrados', datos: ['plantilla'] },
  { id: 'R_tiempo', sens: 0.7, n: 'Aprobó cientos de peticiones en minutos', datos: ['tiempos'] },
  { id: 'R_sesion', sens: 0.6, n: 'Aprobaciones masivas desde una sola sesión', datos: ['identidad', 'tiempos'] },
  { id: 'R_versiones', sens: 0.9, n: 'La delegación subió lo que pidió la unidad', datos: ['bitacora'] },
  { id: 'R_cruce', sens: 0.75, n: 'Aprueba sin cambios pedidos inflados de la misma unidad', datos: ['consumo', 'bitacora'] },
  { id: 'R_motivo', sens: 0.7, n: 'Cambio de Central sin motivo comprobable', datos: ['motivo', 'bitacora'] },
  { id: 'R_concentra', sens: 0.6, n: 'Aumentos concentrados en claves de un proveedor', datos: ['contratos'] },
  { id: 'R_sellada', sens: 0.95, n: 'Cambio o borrado después de la firma', datos: ['bitacora', 'identidad'] },
  { id: 'R_doblerol', sens: 0.95, n: 'Una persona aprueba como unidad y como delegación', datos: ['identidad'] },
  { id: 'R_surtido', sens: 0.85, n: 'Al cierre del año: comprado y no consumido', datos: ['surtido', 'kardex'], tarde: true },
];
export const REGLA = Object.fromEntries(REGLAS.map(r => [r.id, r]));
const RIDX = Object.fromEntries(REGLAS.map((r, i) => [r.id, i]));

// ------------------------------------------------------------ conductas de mala fe
export const CONDUCTAS = [
  { id: 'inflar', actor: 'um', n: 'Inflar el pedido', desc: 'Pide de 1.3 a 2.5 veces su necesidad en algunas claves para desviar o acaparar.', reglas: ['R_consumo', 'R_kardex', 'R_surtido'] },
  { id: 'dhFalso', actor: 'um', n: '"Más derechohabientes" falso', desc: 'Sube 15 a 30 % todo su pedido con un motivo que no es cierto.', reglas: ['R_dh', 'R_surtido'] },
  { id: 'servicio', actor: 'um', n: '"Servicio nuevo" falso', desc: 'Pide 1.5 a 2.2 veces en claves de una especialidad que no tiene.', reglas: ['R_plantilla', 'R_consumo', 'R_surtido'] },
  { id: 'acaparar', actor: 'um', n: 'Pedir teniendo existencia', desc: 'Tiene 8 a 14 meses de inventario y pide el año completo; luego se caduca.', reglas: ['R_kardex', 'R_surtido'] },
  { id: 'nivel', actor: 'um', n: 'Claves que no le tocan', desc: 'Una unidad de 1er nivel pide claves hospitalarias.', reglas: ['R_cuadro', 'R_surtido'] },
  { id: 'fantasma', actor: 'um', n: 'Unidad fantasma', desc: 'Se planea para una unidad en obra o cerrada.', reglas: ['R_clues', 'R_surtido'] },
  { id: 'bloque', actor: 'del', n: 'Aprobar en bloque', desc: 'La delegación aprueba todo sin revisar; pasa el colchón de sus unidades.', reglas: ['R_tiempo', 'R_sesion'] },
  { id: 'inflarDel', actor: 'del', n: 'Inflar en la negociación', desc: 'La delegación sube piezas a sus unidades favoritas.', reglas: ['R_versiones', 'R_surtido'] },
  { id: 'colusion', actor: 'del', n: 'Colusión con una unidad', desc: 'Aprueba sin cambios, ronda tras ronda, el pedido inflado de una unidad.', reglas: ['R_cruce', 'R_surtido'] },
  { id: 'discrecional', actor: 'oc', n: 'Aumento discrecional', desc: 'Un analista de Central sube 10 a 20 % a una delegación por encima del máximo.', reglas: ['R_motivo', 'R_surtido'] },
  { id: 'proveedor', actor: 'oc', n: 'Dirigir a un proveedor', desc: 'Sube 25 a 60 % en claves que surte un mismo proveedor.', reglas: ['R_concentra', 'R_surtido'] },
  { id: 'postFirma', actor: 'oc', n: 'Cambiar después de la firma', desc: 'Modifica piezas cuando el plan ya está cerrado.', reglas: ['R_sellada'] },
  { id: 'dobleRol', actor: 'x', n: 'Doble rol', desc: 'La misma persona pide como unidad y aprueba como delegación.', reglas: ['R_doblerol', 'R_surtido'] },
  { id: 'borrado', actor: 'x', n: 'Borrar versiones', desc: 'Se borra la versión original para ocultar un aumento.', reglas: ['R_sellada'] },
];
export const CONDUCTA = Object.fromEntries(CONDUCTAS.map(c => [c.id, c]));
export const ACTOR_N = { um: 'Unidad', del: 'Delegación', oc: 'Oficina Central', x: 'Cualquier nivel' };
export const ANALISTAS = 5;                       // funcionarios de Central que revisan el plan

export const defaultCfg = () => ({ seed: 1, pct: { um: 0.05, del: 0.1, oc: 0.4 }, datos: [...PRESET_REQ], off: [] });

// ------------------------------------------------------------ preparación (una vez por plan): casos y alarmas candidatas
function prep(U, P, cfg) {
  const r = mulberry32(hash('integ|' + cfg.seed + '|' + P.id));
  const pick = a => a[Math.floor(r() * a.length)];
  const precio = k => U.claves[k].precio;
  const byUnit = new Map();
  for (const it of P.items.values()) { if (!it.months) continue; (byUnit.get(it.u) || byUnit.set(it.u, []).get(it.u)).push(it); }
  const units = [...byUnit.keys()];
  const real = it => it.real.reduce((a, b) => a + b, 0);
  const obs = it => { let s = 0; for (let m = it.hist.length - 12; m < it.hist.length; m++) s += it.hist[m]; return s; };
  const censored = it => { const h = [...it.hist.slice(-12)].sort((a, b) => a - b), med = h[6] || 0; return it.hist.slice(-12).some(v => v < 0.3 * med); };
  const casos = [], malUnits = new Set(), malDel = new Set();
  const on = id => !cfg.off.includes(id);
  const add = (c, actor, monto, extra = {}) => { if (monto > 0) casos.push({ id: casos.length, c, actor, monto: Math.round(monto), z: REGLAS.map(() => r()), ...extra }); };

  // --- unidades de mala fe
  const nU = Math.round(units.length * cfg.pct.um);
  const um = [...units].sort(() => r() - 0.5).slice(0, nU);
  for (const ui of um) {
    const u = U.units[ui], its = byUnit.get(ui);
    const opts = ['inflar', 'dhFalso', 'servicio', 'acaparar', 'fantasma', ...(u.nivel === 1 ? ['nivel'] : [])].filter(on);
    if (!opts.length) continue;
    malUnits.add(ui);
    const nC = r() < 0.3 ? 2 : 1, used = new Set();
    for (let j = 0; j < nC; j++) {
      const c = pick(opts); if (used.has(c)) continue; used.add(c);
      const act = { tipo: 'um', i: ui, nombre: u.nombre, clues: u.clues, cve: u.cve };
      if (c === 'inflar') {
        const sel = [...its].sort(() => r() - 0.5).slice(0, Math.round(its.length * (0.25 + 0.25 * r())));
        for (const it of sel) {
          const f = r() < 0.3 ? 1.3 + 0.2 * r() : 1.5 + r();            // 3 de cada 10 inflan poco, bajo el umbral
          add(c, act, real(it) * (f - 1) * precio(it.k), { k: it.k, f, ratio: real(it) * f / Math.max(1, obs(it)), cens: censored(it), stock: r() < 0.45 });
        }
      } else if (c === 'dhFalso') {
        const f = 1.15 + 0.15 * r();
        add(c, act, its.reduce((s, it) => s + real(it) * (f - 1) * precio(it.k), 0), { f, ratio: f });
      } else if (c === 'servicio') {
        const sel = [...its].sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 4)), f = 1.5 + 0.7 * r();
        add(c, act, sel.reduce((s, it) => s + real(it) * (f - 1) * precio(it.k), 0), { f, ratio: f, n: sel.length });
      } else if (c === 'acaparar') {
        const sel = [...its].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 4)), mo = 8 + 6 * r();
        add(c, act, sel.reduce((s, it) => s + real(it) / 12 * mo * precio(it.k), 0), { meses: mo, n: sel.length });
      } else if (c === 'nivel') {
        const hosp = U.claves.filter(k => k.uso !== 'F'), sel = [...hosp].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 3));
        add(c, act, sel.reduce((s, k) => s + k.precio * (200 + 800 * r()) * u.peso, 0), { n: sel.length, claves: sel.map(k => k.clave) });
      } else if (c === 'fantasma') {
        add(c, act, its.reduce((s, it) => s + total(it) * precio(it.k), 0) * (0.6 + 0.4 * r()), { estatus: r() < 0.5 ? 'en obra' : 'cerrada' });
      }
    }
  }
  // --- delegaciones de mala fe
  const nD = Math.max(cfg.pct.del > 0 ? 1 : 0, Math.round(U.delegaciones.length * cfg.pct.del));
  const ds = [...U.delegaciones.keys()].sort(() => r() - 0.5).slice(0, nD);
  const optD = ['bloque', 'inflarDel', 'colusion'].filter(on).sort(() => r() - 0.5);   // se reparten para que aparezcan todas
  for (const [j, di] of ds.entries()) {
    const d = U.delegaciones[di]; if (!optD.length) break;
    malDel.add(di);
    const c = optD[j % optD.length], act = { tipo: 'del', i: di, nombre: 'Delegación ' + d.nombre, cve: d.cve };
    const its = d.units.flatMap(ui => byUnit.get(ui) || []);
    if (c === 'bloque') {                         // pasa sin revisar el colchón que una revisión real habría recortado
      const exc = its.reduce((s, it) => s + Math.max(0, total(it) - 1.25 * real(it)) * precio(it.k), 0);
      add(c, act, exc * 0.6, { n: its.length });
    } else if (c === 'inflarDel') {
      const fav = [...d.units].sort(() => r() - 0.5).slice(0, Math.max(1, Math.round(d.units.length * 0.15)));
      const sel = fav.flatMap(ui => (byUnit.get(ui) || []).filter(() => r() < 0.4)), f = 1.3 + 0.5 * r();
      add(c, act, sel.reduce((s, it) => s + real(it) * (f - 1) * precio(it.k), 0), { f, n: sel.length, unidades: fav.length });
    } else {
      const ui = pick(d.units), sel = (byUnit.get(ui) || []).filter(() => r() < 0.3), f = 1.6 + 0.9 * r();
      add(c, act, sel.reduce((s, it) => s + real(it) * (f - 1) * precio(it.k), 0), { f, n: sel.length, socio: U.units[ui].nombre, socioClues: U.units[ui].clues });
    }
  }
  // --- analistas de Central de mala fe
  const nA = Math.round(ANALISTAS * cfg.pct.oc);
  const planCost = [...P.items.values()].reduce((s, it) => s + (it.months ? total(it) * precio(it.k) : 0), 0);
  const optA = ['discrecional', 'proveedor', 'postFirma'].filter(on).sort(() => r() - 0.5);
  for (let a = 0; a < nA; a++) {
    if (!optA.length) break;
    const c = optA[a % optA.length], act = { tipo: 'oc', i: a, nombre: `Analista ${a + 1} de Oficina Central` };
    if (c === 'discrecional') {
      const d = pick(U.delegaciones), f = 0.1 + 0.1 * r();
      const v = d.units.flatMap(ui => byUnit.get(ui) || []).reduce((s, it) => s + total(it) * precio(it.k), 0);
      add(c, act, v * f, { f, del: d.nombre });
    } else if (c === 'proveedor') {
      const ks = [...U.claves].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 3)), f = 0.25 + 0.35 * r();
      const v = [...P.items.values()].filter(it => it.months && ks.some(k => k.k === it.k)).reduce((s, it) => s + total(it) * precio(it.k), 0);
      add(c, act, v * f, { f, claves: ks.map(k => k.nombre), prov: `Proveedor ${String.fromCharCode(65 + Math.floor(r() * 6))}` });
    } else add(c, act, planCost * (0.002 + 0.006 * r()), {});
  }
  // --- en cualquier nivel
  for (const c of ['dobleRol', 'borrado'].filter(on)) {
    const n = Math.round(1 + 3 * Math.max(cfg.pct.um, cfg.pct.del) * 10 * r());
    for (let j = 0; j < n; j++) {
      const ui = pick(units), u = U.units[ui], sel = (byUnit.get(ui) || []).filter(() => r() < 0.35), f = 1.4 + 0.8 * r();
      add(c, { tipo: 'x', i: ui, nombre: c === 'dobleRol' ? `Usuario con rol en ${u.nombre} y en su delegación` : `Usuario de ${u.nombre}`, clues: u.clues, cve: u.cve }, sel.reduce((s, it) => s + real(it) * (f - 1) * precio(it.k), 0), { f, n: sel.length });
    }
  }
  // --- falsas alarmas candidatas: lo que pediría una unidad honesta (su necesidad real + 15 % de colchón)
  //     contra su consumo observado; los cambios legítimos y los meses de desabasto la hacen ver inflada
  const fp = [];
  for (const [ui, its] of byUnit) {
    if (malUnits.has(ui)) continue;
    for (const it of its) {
      const o = obs(it), q = real(it) * 1.15;
      if (o <= 0 || q / o < 1.5) continue;
      fp.push({ u: ui, k: it.k, cens: censored(it), motivo: it.motivo || '', ratio: q / o, z: r() });
    }
  }
  return { casos, fp, malUnits, malDel, planCost };
}

// ------------------------------------------------------------ correr las reglas con los datos disponibles
function evaluar(base, datos) {
  const has = new Set(datos);
  const ok = id => REGLA[id].datos.every(d => has.has(d));
  const casos = base.casos.map(cs => {
    const reglas = [];
    for (const rid of CONDUCTA[cs.c].reglas) {
      if (!ok(rid)) continue;
      if (cs.z[RIDX[rid]] > REGLA[rid].sens) continue;                        // esta vez la regla no lo vio
      // reglas con umbral
      if (rid === 'R_consumo') {
        let ratio = cs.ratio ?? 2;
        if (cs.c === 'inflar' && cs.cens && !has.has('vales')) ratio *= 1.15;   // sin vales, el consumo censurado ayuda a esconder
        if (ratio < 1.5) continue;
      }
      if (rid === 'R_kardex' && cs.c === 'inflar' && !cs.stock) continue;
      if (rid === 'R_surtido' && cs.c === 'dhFalso' && cs.f < 1.2) continue;     // un 15 % de más se pierde en el ruido del año
      reglas.push(rid);
    }
    const aTiempo = reglas.filter(x => !REGLA[x].tarde);
    return { ...cs, reglas, estado: aTiempo.length ? 'frenado' : reglas.length ? 'tarde' : 'escapado' };
  });
  // falsas alarmas: la regla de consumo acusa a honestos salvo que otro dato los justifique
  let fp = 0;
  if (ok('R_consumo')) for (const f of base.fp) {
    if (f.cens && has.has('vales') && f.z < 0.9) continue;                    // el dato también tiene huecos: no todo se aclara
    if (/derechohabientes/.test(f.motivo) && has.has('dh') && f.z < 0.85) continue;
    if (/servicio nuevo/.test(f.motivo) && has.has('plantilla') && f.z < 0.85) continue;
    fp++;
  }
  const sum = (st) => casos.filter(c => !st || c.estado === st).reduce((s, c) => s + c.monto, 0);
  const n = st => casos.filter(c => c.estado === st).length;
  return { casos, fp, riesgo: sum(), frenado: sum('frenado'), tarde: sum('tarde'), escapado: sum('escapado'), nF: n('frenado'), nT: n('tarde'), nE: n('escapado') };
}

// valor de cada dato: cuánto se frena de más al agregarlo a lo que ya hay (o cuánto se pierde al quitarlo)
export function simular(U, P, cfg) {
  const base = prep(U, P, cfg);
  const res = evaluar(base, cfg.datos);
  const valor = DATOS.map(d => {
    const con = cfg.datos.includes(d.id);
    const alt = evaluar(base, con ? cfg.datos.filter(x => x !== d.id) : [...cfg.datos, d.id]);
    return { id: d.id, con, dFrenado: con ? res.frenado - alt.frenado : alt.frenado - res.frenado, dTarde: con ? res.tarde - alt.tarde : alt.tarde - res.tarde, dFp: con ? alt.fp - res.fp : res.fp - alt.fp };
  });
  const todo = evaluar(base, DATOS.map(d => d.id));
  return { ...res, valor, todo, nUnits: base.malUnits.size, nDel: base.malDel.size, planCost: base.planCost, nFpBase: base.fp.length };
}

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-diagrama.js · Geometría del diagrama de referencia y
//  contrarreferencia, compartida por la vista de detalle (Hidalgo, una
//  ficha = una referencia) y la vista nacional agregada (un punto = N).
// =====================================================================
import { ETAPAS, TERMINAL, REGLAS } from './referencias.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const BAD = new Set(['DEVUELTA', 'LIMBO', 'NO_ACUDIO', 'QUEMADA', 'ABANDONO', 'SIN_CIERRE']);

// columnas de 149 px; fila 0 (otra unidad, estudios), 1 (flujo normal), 2 (desvíos), 3 (cierres sin flujo normal)
export const W = 1200, HT = 745, NW = 136, NH = 140, C = i => 8 + i * 149, ROW = [30, 215, 400, 585];
export const NODES = {
  SOLICITUD: [C(0), ROW[1], 'main'], VALIDACION: [C(1), ROW[1], 'main'], ACEPTACION: [C(2), ROW[1], 'main'], CITA: [C(3), ROW[1], 'main'],
  ESPECIALIDAD: [C(4), ROW[1], 'main'], CONTRARREF: [C(5), ROW[1], 'main'], SEGUIMIENTO: [C(6), ROW[1], 'main'], CERRADA: [C(7), ROW[1], 'main ok'],
  TERCER: [C(3), ROW[0], 'alt'], ESTUDIOS: [C(5), ROW[0], 'alt'],
  DEVUELTA: [C(1), ROW[2], 'alt'], LIMBO: [C(2), ROW[2], 'alt'], NO_ACUDIO: [C(3), ROW[2], 'alt'], URGENCIAS: [C(4), ROW[2], 'alt'],
  QUEMADA: [C(2), ROW[3], 'alt end'], ABANDONO: [C(3), ROW[3], 'alt end'], SIN_CIERRE: [C(6), ROW[3], 'alt end'],
};
// [de, a, etiqueta, tipo, puerto de salida, puerto de llegada, trazo fijo] · puerto = lado (r, l, t, b) + desplazamiento
export const EDGES = [
  ['SOLICITUD', 'VALIDACION', 'firma y sello', '', 'r', 'l'], ['VALIDACION', 'ACEPTACION', 'envío', '', 'r', 'l'],
  ['ACEPTACION', 'CITA', 'aceptada', '', 'r', 'l'], ['CITA', 'ESPECIALIDAD', 'atendida', '', 'r', 'l'],
  ['ESPECIALIDAD', 'CONTRARREF', 'alta', '', 'r', 'l'], ['CONTRARREF', 'SEGUIMIENTO', 'regresa', '', 'r', 'l'], ['SEGUIMIENTO', 'CERRADA', 'en control', '', 'r', 'l'],
  ['VALIDACION', 'DEVUELTA', 'incompleta', 'alt', 'b-30', 't-30'], ['DEVUELTA', 'VALIDACION', 'corrige', 'alt', 't30', 'b30'],
  ['ACEPTACION', 'DEVUELTA', 'rechaza', 'alt', 'b-45', 'r-20'],
  ['ACEPTACION', 'LIMBO', 'no responde', 'alt', 'b25', 't25'], ['LIMBO', 'ACEPTACION', 'tarde', 'alt', 't-10', 'b0'],
  ['LIMBO', 'QUEMADA', 'vence vigencia', 'alt bad', 'b', 't'],
  ['CITA', 'NO_ACUDIO', 'no se presentó', 'alt', 'b25', 't25'], ['NO_ACUDIO', 'CITA', 'reprograma', 'alt', 't-25', 'b-25'],
  ['NO_ACUDIO', 'ABANDONO', 'no regresa', 'alt bad', 'b', 't'], ['NO_ACUDIO', 'QUEMADA', '', 'alt bad', 'l40', 't45'],
  ['CITA', 'URGENCIAS', 'se complica', 'alt', 'b58', 'l-35'], ['URGENCIAS', 'ESPECIALIDAD', 'ingresa', 'alt', 't', 'b-30'],
  ['ESPECIALIDAD', 'ESTUDIOS', 'estudio', 'alt', 't30', 'l-15'], ['ESTUDIOS', 'ESPECIALIDAD', 'resultado', 'alt', 'b-40', 't58'],
  ['ESPECIALIDAD', 'TERCER', 'rebasa capacidad', 'alt', 't-30', 'r'], ['TERCER', 'ACEPTACION', 'otra unidad', 'alt', 'l', 't'],
  ['QUEMADA', 'SOLICITUD', 're-emite', 'alt', 'l', 'b'],
  ['ESPECIALIDAD', 'SIN_CIERRE', 'alta sin contrarreferencia', 'alt bad', null, null, `M${C(4) + NW - 4},${ROW[1] + NH} C${C(4) + NW + 20},${ROW[1] + NH + 40} ${C(6) + 30},${ROW[3] - 60} ${C(6) + NW / 2},${ROW[3] - 4}`],
];
export const CAP_COLS = 7, CAP_ROWS = 4, R = 7.5, GAP = 18;

export const center = id => { const [x, y] = NODES[id]; return [x + NW / 2, y + NH / 2]; };
export function slotPos(id, i) { const [x, y] = NODES[id]; return [x + 16 + (i % CAP_COLS) * GAP, y + 52 + Math.floor(i / CAP_COLS) * GAP]; }
function port(id, spec) {
  const [x, y] = NODES[id], side = spec[0], off = +(spec.slice(1) || 0);
  return side === 'r' ? [x + NW, y + NH / 2 + off, 1, 0] : side === 'l' ? [x, y + NH / 2 + off, -1, 0]
    : side === 't' ? [x + NW / 2 + off, y, 0, -1] : [x + NW / 2 + off, y + NH, 0, 1];
}
/** trazo de la flecha y punto para su etiqueta */
export function edgePath(a, b, pa, pb) {
  const [x0, y0, nx0, ny0] = port(a, pa), [x1, y1, nx1, ny1] = port(b, pb);
  const ex = x1 + nx1 * 4, ey = y1 + ny1 * 4;
  const k = Math.max(24, Math.hypot(ex - x0, ey - y0) * 0.38);
  const c1 = [x0 + nx0 * k, y0 + ny0 * k], c2 = [ex + nx1 * k, ey + ny1 * k];
  const m = [(x0 + 3 * c1[0] + 3 * c2[0] + ex) / 8, (y0 + 3 * c1[1] + 3 * c2[1] + ey) / 8];
  return [`M${x0},${y0} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${ex},${ey}`, m[0], m[1] - 5];
}
export const edgeD = ([a, b, , , pa, pb, d0]) => (d0 ? [d0, C(5) + 40, ROW[2] + 40] : edgePath(a, b, pa, pb));

/**
 * SVG del diagrama. `notas` son las líneas de la leyenda (abajo a la derecha).
 * Cada nodo trae: #cnt-ID (número), #more-ID (+N), #acc-ID (documentos o acumulado), #bar-ID (barra de antigüedad, vacía).
 */
export function diagramaSVG(notas = []) {
  let s = `<svg viewBox="0 0 ${W} ${HT}" role="img" aria-label="Flujo de referencia y contrarreferencia">
    <defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgba(148,163,184,.55)"/></marker></defs>
    <text x="${C(3)}" y="${ROW[0] - 10}" class="edge-l" style="font-size:11px">OTRA UNIDAD Y ESTUDIOS</text>
    <text x="8" y="${ROW[1] - 10}" class="edge-l" style="font-size:11px">FLUJO NORMAL · el reloj de ${REGLAS.plazoDias} días corre de la solicitud a la atención</text>
    <text x="8" y="${ROW[2] + 16}" class="edge-l" style="font-size:11px">DESVÍOS</text>
    <text x="${C(2)}" y="${ROW[3] - 10}" class="edge-l" style="font-size:11px">CIERRES SIN FLUJO NORMAL</text><g id="edges">`;
  for (const E of EDGES) {
    const [a, b, l, kind] = E, [d, lx, ly] = edgeD(E);
    s += `<path id="e-${a}-${b}" class="edge ${kind}" d="${d}"/>${l ? `<text class="edge-l" id="el-${a}-${b}" x="${lx}" y="${ly}" text-anchor="middle">${l}</text>` : ''}`;
  }
  s += '</g><g id="nodes">';
  for (const [id, [x, y, kind]] of Object.entries(NODES)) {
    const E = ETAPAS[id];
    s += `<g class="nd ${kind}${BAD.has(id) ? ' bad' : ''}" data-n="${id}">
      <rect class="box" x="${x}" y="${y}" width="${NW}" height="${NH}" rx="12"/>
      <text class="t" x="${x + 10}" y="${y + 20}">${esc(E.n)}</text>
      <text class="a" x="${x + 10}" y="${y + 35}">${esc(E.area)}</text>
      <g id="bar-${id}" transform="translate(${x + 10},${y + 41})"></g>
      <text class="${TERMINAL.has(id) ? 'acc' : 'dc'}" id="acc-${id}" x="${x + 10}" y="${y + NH - 8}">${TERMINAL.has(id) ? '' : esc(E.docs.join(' · '))}</text>
      <text class="cnt" id="cnt-${id}" x="${x + NW - 10}" y="${y + NH - 7}">0</text>
      <text class="more" id="more-${id}" x="${x + NW - 34}" y="${y + NH - 8}" text-anchor="end"></text></g>`;
  }
  s += `</g><g id="trail"></g><g id="toks"></g>
    <g transform="translate(${C(4) - 10},${ROW[3] + 36})">${notas.map((n, i) => `<text class="edge-l" style="font-size:12px;fill:#8b98a5" x="0" y="${i * 20}">${esc(n)}</text>`).join('')}</g></svg>`;
  return s;
}

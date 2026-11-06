// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  reparar_baja_california.mjs · Restituye el contorno continental de
//  Baja California (cve 02) en estados_mx.json, que había quedado sólo con
//  sus islas. Proyecta con EPSG:6372 (México ITRF2008 / LCC, GRS80) igual
//  que el resto del archivo: km, origen en el CENADI (19.535 N, 99.185 O).
//  Uso: node nacional/reparar_baja_california.mjs <geojson de estados>
//  Fuente del contorno: geojson de estados de México (MX-BCN). Antes de
//  escribir comprueba la proyección contra Sonora y Sinaloa ya presentes.
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.argv[2];
const ROOT = new URL('../', import.meta.url);
const DESTINOS = ['web/assets/estados_mx.json', 'nacional/estados_mx.json'];

// ---- EPSG:6372: Lambert cónica conforme 2SP, GRS80
const a = 6378137, f = 1 / 298.257222101, e = Math.sqrt(2 * f - f * f), rad = Math.PI / 180;
const [lat1, lat2, lat0, lon0, x0, y0] = [17.5, 29.5, 12, -102, 2500000, 0];
const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
const t = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
const m1 = m(lat1 * rad), m2 = m(lat2 * rad), t0 = t(lat0 * rad), t1 = t(lat1 * rad), t2 = t(lat2 * rad);
const n = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2)), F = m1 / (n * t1 ** n), r0 = a * F * t0 ** n;
const lcc = (lon, lat) => { const r = a * F * t(lat * rad) ** n, th = n * (lon - lon0) * rad; return [x0 + r * Math.sin(th), y0 + r0 - r * Math.cos(th)]; };
const [ox, oy] = lcc(-99.185, 19.535);
const P = ([lon, lat]) => { const [x, y] = lcc(lon, lat); return [+((x - ox) / 1000).toFixed(2), +((y - oy) / 1000).toFixed(2)]; };

// ---- Douglas-Peucker
function dp(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop(); const [ax, ay] = pts[i], [bx, by] = pts[j]; const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let k = -1, dmax = 0;
    for (let q = i + 1; q < j; q++) { const d = Math.abs((bx - ax) * (ay - pts[q][1]) - (ax - pts[q][0]) * (by - ay)) / L; if (d > dmax) { dmax = d; k = q; } }
    if (dmax > tol && k > 0) { keep[k] = 1; pila.push([i, k], [k, j]); }
  }
  return pts.filter((_, q) => keep[q]);
}
/** anillo cerrado (primer punto = último): se parte en el punto más lejano y se simplifica cada mitad */
function dpAnillo(r, tol) {
  let k = 0, dmax = -1;
  r.forEach(([x, y], i) => { const d = Math.hypot(x - r[0][0], y - r[0][1]); if (d > dmax) { dmax = d; k = i; } });
  if (k < 2) return r;
  return [...dp(r.slice(0, k + 1), tol).slice(0, -1), ...dp(r.slice(k), tol)];
}
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
const bbox = rs => { let b = [1e9, 1e9, -1e9, -1e9]; for (const r of rs) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; };
const rings = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

const geo = JSON.parse(readFileSync(SRC, 'utf8'));
const feat = id => geo.features.find(x => x.properties.id === id);
const actual = JSON.parse(readFileSync(new URL(DESTINOS[0], ROOT), 'utf8'));

// ---- 1) la proyección cuadra con estados que ya están bien
// (Baja California Sur no sirve de control: la fuente le asigna las islas Revillagigedo)
for (const [id, cve] of [['MX-SON', '26'], ['MX-SIN', '25'], ['MX-CHH', '08']]) {
  const nuevo = bbox(rings(feat(id).geometry).map(p => p[0].map(P)));
  const viejo = bbox(actual.estados.find(s => s.cve === cve).polys.map(p => p.ext));
  const dif = Math.max(...nuevo.map((v, i) => Math.abs(v - viejo[i])));
  console.log(`${id}: diferencia máxima de la caja ${dif.toFixed(1)} km`);
  if (dif > 15) throw new Error('la proyección no cuadra con ' + id);
}

// ---- 2) Baja California: polígonos proyectados y simplificados (como el resto, ≈ 1 km)
// sin isla Guadalupe (≈ 260 km mar adentro), que el archivo original tampoco traía y agrandaría el encuadre del mapa
const polys = rings(feat('MX-BCN').geometry)
  .filter(p => p[0].reduce((s, q) => s + q[0], 0) / p[0].length > -117)
  .map(p => ({ ext: dpAnillo(p[0].map(P), 1.0), holes: p.slice(1).map(h => dpAnillo(h.map(P), 1.0)).filter(h => h.length > 3) }))
  .filter(p => p.ext.length > 3 && area(p.ext) > 2)
  .map(p => (p.holes.length ? p : { ext: p.ext }))
  .sort((x, y) => area(y.ext) - area(x.ext));
const bc = actual.estados.find(s => s.cve === '02');
console.log(`Baja California: antes ${bc.polys.length} polígonos (${Math.round(bc.polys.reduce((s, p) => s + area(p.ext), 0))} km²) · ahora ${polys.length} (${Math.round(polys.reduce((s, p) => s + area(p.ext), 0))} km², INEGI ${bc.area_km2} km²)`);

for (const rel of DESTINOS) {
  const url = new URL(rel, ROOT), j = JSON.parse(readFileSync(url, 'utf8'));
  j.estados.find(s => s.cve === '02').polys = polys;
  j.fuente += '; Baja California restituida desde geojson de estados (MX-BCN) con la misma proyección';
  writeFileSync(url, JSON.stringify(j));
  console.log('escrito', rel);
}

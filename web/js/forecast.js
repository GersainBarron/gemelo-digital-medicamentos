// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  forecast.js · Pronóstico de demanda por clave
//
//  Modelo: Holt-Winters aditivo con tendencia amortiguada y estacionalidad
//  semanal (7 días), ajustado sobre los últimos 30 días de demanda
//  (piezas surtidas + piezas no surtidas). Los parámetros se eligen por
//  validación: se entrena con 23 días y se mide el error en los 7 últimos.
//  Precisión reportada: WAPE = Σ|real − pronóstico| / Σ real (semana de prueba).
//
//  >>> IA: con datos reales este módulo es el punto donde se conecta un
//  modelo de aprendizaje automático (p. ej. gradient boosting o redes con
//  variables de clima, epidemiología y calendario). La interfaz no cambia:
//  forecastSeries(y, h) → { fc, lo, hi, wape, ... }.
// =====================================================================

const GRID = [];
for (const a of [0.15, 0.3, 0.5]) for (const b of [0.02, 0.1]) for (const g of [0.1, 0.3]) GRID.push([a, b, g]);

/** Holt-Winters aditivo, tendencia amortiguada (phi), estación m */
export function holtWinters(y, h, [alpha, beta, gamma], m = 7, phi = 0.97) {
  const n = y.length;
  if (n < m * 2) {
    const mean = y.reduce((a, b) => a + b, 0) / Math.max(1, n);
    return { fit: y.map(() => mean), fc: new Array(h).fill(mean), sd: Math.sqrt(y.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1)) };
  }
  const mean = a => a.reduce((x, z) => x + z, 0) / a.length;
  let L = mean(y.slice(0, m)), T = (mean(y.slice(m, 2 * m)) - L) / m;
  const S = y.slice(0, m).map(v => v - L);
  const fit = [];
  let sse = 0;
  for (let t = 0; t < n; t++) {
    const s = S[t % m];
    const yhat = L + phi * T + s;
    fit.push(yhat);
    if (t >= m) sse += (y[t] - yhat) ** 2;
    const L0 = L;
    L = alpha * (y[t] - s) + (1 - alpha) * (L + phi * T);
    T = beta * (L - L0) + (1 - beta) * phi * T;
    S[t % m] = gamma * (y[t] - L) + (1 - gamma) * s;
  }
  const fc = [];
  let damp = 0;
  for (let k = 1; k <= h; k++) { damp += phi ** k; fc.push(Math.max(0, L + damp * T + S[(n + k - 1) % m])); }
  return { fit, fc, sd: Math.sqrt(sse / Math.max(1, n - m - 1)) };
}

const wape = (real, pred) => { const a = real.reduce((x, z) => x + z, 0); return a > 0 ? real.reduce((s, v, i) => s + Math.abs(v - pred[i]), 0) / a : 0; };

/**
 * Pronóstico de h días para una serie diaria y.
 * @returns { fc, lo, hi, wape, params, last14, next14, changePct }
 */
export function forecastSeries(y, h = 28) {
  const train = y.slice(0, -7), test = y.slice(-7);
  let best = null;
  for (const p of GRID) {
    const r = holtWinters(train, 7, p);
    const e = wape(test, r.fc);
    if (!best || e < best.e) best = { p, e, bt: r.fc };
  }
  const r = holtWinters(y, h, best.p);
  const z = 1.28;                                   // banda del 80 %
  const lo = r.fc.map((v, k) => Math.max(0, v - z * r.sd * Math.sqrt(1 + k * 0.15)));
  const hi = r.fc.map((v, k) => v + z * r.sd * Math.sqrt(1 + k * 0.15));
  const last14 = y.slice(-14).reduce((a, b) => a + b, 0), next14 = r.fc.slice(0, 14).reduce((a, b) => a + b, 0);
  return { fc: r.fc, lo, hi, sd: r.sd, wape: best.e, backtest: best.bt, params: best.p, last14, next14, changePct: last14 > 0 ? (next14 / last14 - 1) * 100 : 0 };
}

/**
 * Pedido sugerido para la próxima entrega: cubrir la demanda pronosticada hasta la entrega
 * siguiente más un inventario de seguridad (nivel de servicio ~95 %).
 */
export function suggestedOrder(f, { stock, pending = 0, daysToNext, cycle, pack = 1 }) {
  const horizon = Math.min(f.fc.length, Math.max(1, Math.round(daysToNext + cycle)));
  const demand = f.fc.slice(0, horizon).reduce((a, b) => a + b, 0);
  const safety = 1.65 * f.sd * Math.sqrt(horizon);
  const need = Math.max(0, demand + safety - stock - pending);
  return { qty: Math.ceil(need / pack) * pack, demand, safety, horizon };
}

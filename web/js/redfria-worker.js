// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// Calcula en segundo plano los escenarios de la tabla de comparación de redfria.html.
import { simulate } from './redfria-sim.js';
let data = null;
onmessage = e => {
  if (e.data.data) data = e.data.data;
  if (!e.data.lv || !data) return;
  const S = simulate(data, e.data.lv);
  postMessage({ id: e.data.id, lv: S.lv, summary: S.summary, invest: S.invest });
};

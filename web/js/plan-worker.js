// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// Simula en segundo plano un ciclo completo del plan de necesidades con otro método de propuesta.
import { buildUniverse, replay, seedEntries, kpis, ACTIONS } from './plan-engine.js';
let U = null;
onmessage = e => {
  const { data, metodo, n, sim } = e.data;
  if (!U) U = buildUniverse(data.iss, data.meds);
  const entries = seedEntries().map(x => (x.a === 'asignarAuto' ? { ...x, metodo } : x));
  const P = replay(U, entries)[0];
  Object.assign(P.sim, sim);
  let d = 0;
  while (P.status === 'validacion' && d < 120) { ACTIONS.sim(U, P, { days: 1 }); d++; }
  postMessage({ n, metodo, k: kpis(U, P) });
};

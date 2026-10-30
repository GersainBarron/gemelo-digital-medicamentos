// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// Corre la torre de control en segundo plano: todos los gemelos sin DOM (≈ 6 s).
import { evaluar } from './torre-engine.js';
const J = f => fetch(new URL('../assets/' + f, import.meta.url)).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
let D = null;
onmessage = async e => {
  const { id, cfg } = e.data;
  try {
    if (!D) {
      postMessage({ id, prog: { txt: 'Leyendo datos de los gemelos', p: 0 } });
      const [iss, meds, hgo, layout, slotClaves] = await Promise.all(['estados_issste.json', 'medicamentos.json', 'unidades_hidalgo.json', 'warehouse_layout.json', 'slot_claves.json'].map(J));
      D = { iss, meds, hgo, layout, slotClaves };
    }
    const res = evaluar(D, cfg, prog => postMessage({ id, prog }));
    postMessage({ id, res });
  } catch (err) { postMessage({ id, err: String(err && err.stack || err) }); }
};

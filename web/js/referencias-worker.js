// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  referencias-worker.js · Arma la red nacional de referencias y su cubo
//  diario fuera del hilo de la página.
//   {tipo:'armar', url, corteDia}      → {tipo:'cubo', cubo, n, ms}
//     url absoluta (new URL('assets/estados_issste.json', location.href)): dentro del
//     worker una ruta relativa se resolvería contra js/
//   Uso: const w = new Worker('js/referencias-worker.js', { type: 'module' });
//        w.onmessage = e => { if (e.data.tipo === 'cubo') C = Cubo.from(e.data.cubo); };
//   {tipo:'refs', id, t, max}          → {tipo:'refs', id, refs}  (detalle de una unidad)
// =====================================================================
import { Referencias } from './referencias.js';
import { Cubo } from './referencias-cubo.js';

let K = null;

self.onmessage = async ({ data: m }) => {
  try {
    if (m.tipo === 'armar') {
      const t0 = performance.now();
      const data = await fetch(m.url).then(r => r.json());
      K = new Referencias(data, { corteDia: m.corteDia ?? 0 });
      const t1 = performance.now();
      const [cubo, buf] = Cubo.build(K).toTransfer();
      self.postMessage({ tipo: 'cubo', cubo, n: K.refs.length, ms: { motor: t1 - t0, cubo: performance.now() - t1 } }, buf);
    } else if (m.tipo === 'refs') {
      // referencias vivas en el instante t que pasan por esa unidad (emisora o receptora)
      const out = [];
      for (const r of K.refs) {
        if (r.tCrea > m.t) break;
        if (r.emisora.id !== m.id && !r.rxSet.has(m.id)) continue;
        if (!K.etapa(r, m.t)) continue;
        out.push({ ...r, emisora: { id: r.emisora.id, corto: r.emisora.corto, cve: r.emisora.cve }, esp: { n: r.esp.n } });
        if (out.length >= (m.max ?? 2000)) break;
      }
      self.postMessage({ tipo: 'refs', id: m.id, t: m.t, refs: out });
    }
  } catch (err) {
    self.postMessage({ tipo: 'error', mensaje: String(err && err.message || err) });
  }
};

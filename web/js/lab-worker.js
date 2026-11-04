// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// lab-worker.js · Hilo de cómputo del laboratorio: corre réplicas completas (lab.js)
import { runReplica } from './lab.js';
let data = null, cat = null;
self.onmessage = e => {
  const msg = e.data;
  if (msg.type === 'init') { data = msg.data; cat = msg.cat; self.postMessage({ type: 'ready' }); return; }
  if (msg.type === 'run') {
    try { self.postMessage({ type: 'done', job: msg.job, r: runReplica(data, cat, msg.job) }); }
    catch (err) { self.postMessage({ type: 'error', job: msg.job, error: String(err && err.stack || err) }); }
  }
};

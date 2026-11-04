// Agrega la pestaña «Referencias» después de «Recorrido» en la navegación de cada vista
import { readFileSync, writeFileSync } from 'node:fs';
const W = new URL('../web/', import.meta.url);
for (const f of ['cenadi', 'compras', 'contratos', 'expedientes', 'laboratorio', 'nacional', 'planeacion', 'redfria', 'torre']) {
  const u = new URL(f + '.html', W);
  let s = readFileSync(u, 'utf8');
  if (s.includes('referencias.html')) { console.log('ya estaba', f); continue; }
  const re = /(<a[^>]*href="expedientes\.html"[^>]*>Recorrido<\/a>)(\r?\n)([ \t]*)/;
  if (!re.test(s)) { console.log('sin navegación', f); continue; }
  s = s.replace(re, (all, a, nl, sp) => `${a}${nl}${sp}<a href="referencias.html">Referencias</a>${nl}${sp}`);
  writeFileSync(u, s);
  console.log('ok', f);
}

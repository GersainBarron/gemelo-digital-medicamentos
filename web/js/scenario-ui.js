// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  scenario-ui.js · Escenario activo (operación normal / contingencia)
//  Se guarda en el navegador y viaja en la URL (?esc=contingencia), así
//  las tres vistas (CEDIS, red estatal y unidad) simulan lo mismo.
// =====================================================================
import { setScenario, SCENARIOS, setProactive } from './supply.js';
import { initPolicy } from './network-sim.js';

export function initScenario() {
  const qs = new URLSearchParams(location.search);
  let s = qs.get('esc');
  try { if (s) localStorage.setItem('escenario', s); else s = localStorage.getItem('escenario'); } catch { /* sin almacenamiento */ }
  s = SCENARIOS[s] ? s : 'normal';
  setScenario(s);
  const pol = initPolicy();
  setProactive(qs.get('ped') !== '0');
  if (s !== 'normal') banner(s);
  // los enlaces entre vistas llevan el escenario
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || /^https?:/.test(a.getAttribute('href'))) return;
    const u = new URL(a.href, location.href);
    if (/\.html$/.test(u.pathname)) { u.searchParams.set('esc', s); u.searchParams.set('pol', pol); a.href = u.pathname.split('/').pop() + u.search; }
  }, true);
  return s;
}

export function switchScenario(name) {
  try { localStorage.setItem('escenario', name); } catch { /* */ }
  const u = new URL(location.href);
  u.searchParams.set('esc', name);
  location.href = u.toString();
}

function banner(s) {
  const b = document.createElement('div');
  b.className = 'scen-banner';
  b.innerHTML = `<b>⚠ Modo contingencia (simulación)</b><span>${SCENARIOS[s].label}</span><button type="button">Volver a operación normal</button>`;
  Object.assign(b.style, {
    position: 'fixed', left: '50%', bottom: '14px', transform: 'translateX(-50%)', zIndex: 75, display: 'flex', gap: '10px', alignItems: 'center',
    flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'calc(100% - 24px)', padding: '8px 10px 8px 14px', borderRadius: '12px',
    background: 'rgba(42, 15, 18, 0.96)', border: '1px solid rgba(248, 113, 113, 0.6)', color: '#fecaca', font: '600 12.5px system-ui, sans-serif',
    boxShadow: '0 12px 30px rgba(0,0,0,.5)',
  });
  const btn = b.querySelector('button');
  Object.assign(btn.style, { background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: '8px', padding: '5px 10px', font: 'inherit', cursor: 'pointer' });
  b.querySelector('span').style.cssText = 'color:#fca5a5;font-weight:500' + (innerWidth < 760 ? ';display:none' : '');
  if (innerWidth < 760) Object.assign(b.style, { left: 'auto', right: '10px', transform: 'none', bottom: '10px' });
  btn.addEventListener('click', () => switchScenario('normal'));
  document.body.appendChild(b);
}

// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  ui.js · Interfaz (panel de KPIs, capas, cámaras, inspector)
// =====================================================================

export const TYPE_ES = {
  forklift: 'Montacargas', reach_truck: 'Reach truck', agv_pallet: 'AGV de pallets', amr_tote: 'AMR de totes',
  pallet_jack_electric: 'Transpaleta eléctrica', pallet_jack_manual: 'Transpaleta manual',
  cart_picking: 'Carrito de picking', cart_platform: 'Carrito de plataforma', cart_rollcage: 'Roll cage',
  cart_medication: 'Carrito de medicamentos', rack_pallet: 'Rack selectivo de pallets', rack_medium: 'Rack mediano',
  shelf_low: 'Estantería baja de picking', rack_cold: 'Rack de cuarto frío', shelf_aux: 'Estantería auxiliar',
  pallet: 'Pallet vacío', pallet_load: 'Pallet con carga', tote: 'Tote / contenedor', bin: 'Bin de picking', box: 'Caja',
  conveyor_roller: 'Conveyor de rodillos', conveyor_belt: 'Conveyor de banda', conveyor_curve: 'Curva de conveyor',
  conveyor_junction: 'Unión de conveyor', table_packing: 'Mesa de trabajo', desk: 'Escritorio', chair: 'Silla',
  monitor: 'Monitor', screen_wall: 'Pantalla de KPIs', keyboard: 'Teclado', label_printer: 'Impresora de etiquetas',
  scanner: 'Lector de código de barras', scale: 'Báscula', packing_supplies: 'Material de empaque', tape_gun: 'Despachador de cinta',
  fire_extinguisher: 'Extintor', fire_hose: 'Gabinete contra incendio', first_aid: 'Botiquín', bollard: 'Bolardo',
  barrier_vehicle: 'Barrera vehicular', barrier_pedestrian: 'Barandal peatonal', cctv: 'Cámara CCTV', cctv_dome: 'Cámara domo',
  emergency_light: 'Lámpara de emergencia', exit_sign: 'Señal de salida', mirror: 'Espejo de seguridad', sign: 'Señalización',
  aisle_sign: 'Letrero de pasillo', dock: 'Andén de carga', door_grade: 'Portón a nivel de piso', ramp: 'Rampa',
  door_ped: 'Puerta peatonal', emergency_exit: 'Salida de emergencia', trailer: 'Tráiler', cold_room: 'Cuarto frío',
  cold_room_panels: 'Cuarto frío', door_sliding: 'Puerta aislada corrediza', temp_sensor: 'Sensor de temperatura',
  evaporator: 'Evaporador', secure_cage: 'Jaula de medicamentos controlados', cage: 'Jaula de medicamentos controlados',
  door_secure: 'Puerta reforzada', safe: 'Caja fuerte', office: 'Oficina de control', charger_forklift: 'Cargador de montacargas',
  charger_agv: 'Estación de carga AGV', lamp_highbay: 'Luminaria industrial', tree: 'Árbol', wall: 'Muro perimetral',
};

const FIELD_ES = {
  wh_zone: 'Zona', wh_state: 'Estado', wh_capacity_kg: 'Capacidad (kg)', wh_max_lift: 'Elevación máx. (m)',
  wh_speed: 'Velocidad (m/s)', wh_battery: 'Batería', wh_content: 'Contenido', wh_slot_ref: 'Ubicación',
  wh_pallet: 'Tipo de pallet', wh_height: 'Altura (m)', wh_kind: 'Variante', wh_size: 'Medidas (m)', wh_aisle: 'Pasillo',
  wh_side: 'Lado', wh_bays: 'Bahías', wh_levels: 'Niveles', wh_length: 'Largo (m)', wh_id: 'ID', wh_dock: 'Andén',
  wh_temp: 'Temperatura (°C)', wh_temp_min: 'Temp. mínima (°C)', wh_temp_max: 'Temp. máxima (°C)', wh_access: 'Acceso',
  wh_locked: 'Bloqueado', wh_station: 'Estación', wh_line: 'Línea', wh_carried_by: 'Transportado por', wh_open: 'Apertura',
  wh_tiers: 'Niveles', wh_stackable: 'Apilable', wh_fov: 'Campo de visión (°)', wh_radius: 'Radio (m)', wh_angle: 'Ángulo (°)',
  wh_fork_height: 'Altura de uñas (m)', wh_closed_x: 'Posición cerrada',
};

export const STATE_ES = {
  idle: 'Inactivo', moving: 'En ruta', loading: 'Cargando tráiler', unloading: 'Descargando', charging: 'Cargando batería',
  putaway: 'Ubicando', picking: 'Surtiendo', ready_to_ship: 'Listo para envío', received: 'Recibido', in_trailer: 'En tráiler',
  stored_cold: 'Almacenado en frío', in_transit: 'En tránsito', packing: 'En empaque', waiting: 'Esperando paso',
  available: 'Disponible', lifting: 'Elevando', dropping: 'Dejando carga', picking_up: 'Tomando carga', working: 'Operando',
  free: 'Libre', scheduled: 'Programado', unloading_dock: 'Descargando', medicine: 'Medicamento', general: 'General',
  mixed: 'Mixto', cold_chain: 'Cadena de frío', controlled: 'Controlado', restricted: 'Restringido', wood: 'Madera', plastic: 'Plástico',
};

const STATE_TONE = {
  moving: 'ok', picking_up: 'accent', dropping: 'accent', lifting: 'accent', working: 'accent', charging: 'info',
  available: 'ok', waiting: 'warn', idle: 'muted', unloading: 'accent', loading: 'accent', free: 'muted', scheduled: 'info',
};

const ZONE_ES = {
  Receiving: 'Recepción', Charging: 'Carga de equipos', Packing: 'Empaque', Dispatch: 'Despacho', Main_Aisle: 'Pasillo principal',
  Storage: 'Almacenamiento', Picking: 'Picking', Controlled_Meds: 'Controlados', Cold_Storage: 'Cuarto frío', Office: 'Oficina', Dock: 'Andén',
};
export const zoneName = z => ZONE_ES[z] || z;

export function prettySlot(ref) {
  const m = /^Rack_(\w+?)_Slot_B(\d+)_L(\d+)_P(\d+)$/.exec(ref);
  if (m) return `Rack ${m[1]} · Bahía ${m[2]} · Nivel ${m[3]} · Pos. ${m[4]}`;
  const k = /^(\w+)_Slot_L(\d+)_P(\d+)$/.exec(ref);
  if (k) return `${k[1].replace(/_/g, ' ')} · Nivel ${k[2]} · Pos. ${k[3]}`;
  return ref.replace(/_/g, ' ');
}

export function prettyValue(key, v) {
  if (v === null || v === undefined) return '—';
  if (key === 'wh_battery') return Math.round(v * 100) + ' %';
  if (key === 'wh_slot_ref') return prettySlot(v);
  if (key === 'wh_zone') return zoneName(v);
  if (key === 'wh_locked' || key === 'wh_stackable') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map(x => typeof x === 'number' ? +x.toFixed(2) : x).join(' × ');
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('es-MX') : (+v.toFixed(2)).toLocaleString('es-MX');
  return STATE_ES[v] || String(v).replace(/_/g, ' ');
}
export const fieldName = k => FIELD_ES[k] || k.replace(/^wh_/, '').replace(/_/g, ' ');

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.$ = id => document.getElementById(id);
    this.$('btn-play').addEventListener('click', () => this.h.onTogglePlay());
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => this.h.onSpeed(+b.dataset.speed)));
    this.$('btn-kpi').addEventListener('click', () => this.togglePanel('kpi-panel', 'btn-kpi'));
    this.$('btn-layers').addEventListener('click', () => this.togglePanel('layers-panel', 'btn-layers'));
    this.$('insp-close').addEventListener('click', () => this.h.onDeselect());
    this.$('insp-focus').addEventListener('click', () => this.h.onFocusSelected());
    this.$('insp-follow').addEventListener('click', () => this.h.onToggleFollow());
    const fs = this.$('btn-fullscreen');
    if (!document.documentElement.requestFullscreen) fs.hidden = true;     // iPhone / Safari antiguo
    else fs.addEventListener('click', () => this.toggleFullscreen());
    if (window.innerWidth < 900) this.togglePanel('kpi-panel', 'btn-kpi', false);
    this.equipRows = new Map();
    this._lastLog = '';
  }

  togglePanel(id, btnId, force) {
    const p = this.$(id);
    const open = force ?? p.classList.contains('closed');
    p.classList.toggle('closed', !open);
    this.$(btnId)?.classList.toggle('active', open);
    if (id === 'layers-panel' && open && window.innerWidth < 900) this.togglePanel('kpi-panel', 'btn-kpi', false);
  }

  toggleFullscreen() {
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  // --- Carga ---
  setProgress(frac, msg) {
    this.$('load-bar').style.width = Math.round(frac * 100) + '%';
    if (msg) this.$('load-msg').textContent = msg;
  }
  hideLoading() { this.$('loading').classList.add('done'); setTimeout(() => this.$('loading').remove(), 700); }
  showError(msg) {
    this.$('load-msg').innerHTML = msg;
    this.$('loading').classList.add('error');
  }

  // --- Cámaras ---
  setPresets(list) {
    const nav = this.$('cameras');
    nav.innerHTML = '';
    for (const p of list) {
      const b = el('button', 'cam-btn', `<span class="cam-ico">${p.icon}</span><span>${p.label}</span>`);
      b.dataset.id = p.id;
      b.addEventListener('click', () => this.h.onCamera(p.id));
      nav.appendChild(b);
    }
  }
  setActivePreset(id) { document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id)); }

  // --- Capas ---
  buildLayers(defs, state) {
    const box = this.$('layers-list');
    box.innerHTML = '';
    for (const d of defs) {
      const row = el('label', 'toggle');
      row.innerHTML = `<span class="t-text"><b>${d.label}</b><small>${d.hint || ''}</small></span><input type="checkbox" ${state[d.id] ? 'checked' : ''}><span class="sw"></span>`;
      const inp = row.querySelector('input');
      inp.addEventListener('change', () => this.h.onLayer(d.id, inp.checked));
      inp.dataset.layer = d.id;
      box.appendChild(row);
    }
  }
  setLayer(id, v) { const i = document.querySelector(`input[data-layer="${id}"]`); if (i) i.checked = v; }

  // --- Simulación ---
  setPlaying(p) {
    this.$('btn-play').innerHTML = p ? ICON.pause : ICON.play;
    this.$('btn-play').setAttribute('aria-label', p ? 'Pausar' : 'Reproducir');
    this.$('sim-status').textContent = p ? 'En vivo · simulado' : 'En pausa';
    this.$('sim-status').classList.toggle('paused', !p);
  }
  setSpeed(x) { document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', +b.dataset.speed === x)); }
  setClock(str) { this.$('clock').textContent = str; }

  // --- KPIs ---
  updateKPIs(sim) {
    const s = sim.stats;
    const set = (id, v) => { const e = this.$(id); if (e && e.textContent !== String(v)) e.textContent = v; };
    set('k-received', s.received); set('k-putaway', s.putaway); set('k-picked', s.picked);
    set('k-packed', s.packed); set('k-shipped', s.shipped); set('k-replenish', s.replenish);

    const occ = sim.occupancy();
    const pct = occ.pallet.total ? occ.pallet.occ / occ.pallet.total : 0;
    set('k-occ', Math.round(pct * 100) + ' %');
    set('k-occ-sub', `${occ.pallet.occ} de ${occ.pallet.total} posiciones de pallet`);
    this.$('k-occ-bar').style.width = (pct * 100).toFixed(1) + '%';
    const aisles = this.$('k-aisles');
    if (!aisles.childElementCount) {
      for (const a of Object.keys(occ.byAisle).sort()) {
        const r = el('div', 'aisle', `<span class="a-id">${a}</span><span class="bar"><i></i></span><span class="a-val"></span>`);
        r.dataset.a = a; aisles.appendChild(r);
      }
    }
    for (const r of aisles.children) {
      const d = occ.byAisle[r.dataset.a]; const p = d.occ / d.total;
      r.querySelector('i').style.width = (p * 100).toFixed(1) + '%';
      r.querySelector('i').className = p > 0.9 ? 'hi' : '';
      r.querySelector('.a-val').textContent = Math.round(p * 100) + '%';
    }
    const sp = occ.shelf.total ? occ.shelf.occ / occ.shelf.total : 0;
    set('k-shelf', Math.round(sp * 100) + ' %');

    // Cuarto frío
    const t = sim.temp;
    set('k-temp', t.toFixed(1));
    const tc = this.$('k-temp-chip');
    const tone = t > 8 || t < 2 ? 'crit' : t > 6.5 ? 'warn' : 'ok';
    tc.className = 'chip ' + tone; tc.textContent = tone === 'ok' ? 'En rango' : tone === 'warn' ? 'Vigilar' : 'Fuera de rango';
    this.drawSpark(this.$('k-spark'), sim.tempHist, 2, 8);

    // Andenes
    const docks = this.$('k-docks');
    if (!docks.childElementCount) {
      for (const id of Object.keys(sim.docks)) {
        const r = el('div', 'dock', `<span class="d-id">${id}</span><span class="chip"></span><span class="bar"><i></i></span>`);
        r.dataset.id = id; docks.appendChild(r);
      }
    }
    for (const r of docks.children) {
      const d = sim.docks[r.dataset.id];
      const c = r.querySelector('.chip');
      const lbl = d.state === 'unloading' ? 'Descargando' : d.state === 'loading' ? 'Cargando' : STATE_ES[d.state];
      if (c.textContent !== lbl) { c.textContent = lbl; c.className = 'chip ' + (STATE_TONE[d.state] || 'muted'); }
      r.querySelector('i').style.width = (d.progress * 100).toFixed(0) + '%';
      r.querySelector('.bar').style.visibility = d.state === 'unloading' || d.state === 'loading' ? 'visible' : 'hidden';
    }

    // Equipos
    const list = this.$('k-equip');
    let active = 0, charging = 0;
    for (const a of sim.agents) {
      let row = this.equipRows.get(a.name);
      if (!row) {
        row = el('button', 'equip', `<span class="e-name"></span><span class="chip"></span><span class="batt"><i></i></span><span class="e-pct"></span>`);
        row.querySelector('.e-name').textContent = a.label;
        row.addEventListener('click', () => this.h.onSelectByName(a.name));
        list.appendChild(row); this.equipRows.set(a.name, row);
      }
      const c = row.querySelector('.chip'); const lbl = STATE_ES[a.state] || a.state;
      if (c.textContent !== lbl) { c.textContent = lbl; c.className = 'chip ' + (STATE_TONE[a.state] || 'muted'); }
      const b = Math.round(a.battery * 100);
      row.querySelector('.batt i').style.width = b + '%';
      row.querySelector('.batt i').className = b < 25 ? 'low' : b < 50 ? 'mid' : '';
      row.querySelector('.e-pct').textContent = b + '%';
      if (a.path) active++; if (a.state === 'charging') charging++;
    }
    set('k-equip-sum', `${active} en operación · ${charging} cargando`);

    // Alertas y bitácora
    const al = sim.alerts();
    const ab = this.$('k-alerts');
    const html = al.length ? al.map(x => `<li class="${x.level}">${esc(x.msg)}</li>`).join('') : '<li class="none">Sin alertas activas</li>';
    if (ab.innerHTML !== html) ab.innerHTML = html;
    set('k-alert-count', al.filter(x => x.level !== 'info').length || '');
    const top = sim.log.slice(0, 8);
    const key = top.map(x => x.t + x.msg).join('|');
    if (key !== this._lastLog) {
      this._lastLog = key;
      this.$('k-log').innerHTML = top.map(x => `<li><time>${x.t.slice(0, 5)}</time>${esc(x.msg)}</li>`).join('') || '<li class="none">Sin eventos aún</li>';
    }
  }

  drawSpark(cv, data, lo, hi) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const min = 0, max = 10;
    const y = v => h - 4 - ((v - min) / (max - min)) * (h - 8);
    g.fillStyle = 'rgba(52, 211, 153, 0.10)';
    g.fillRect(0, y(hi), w, y(lo) - y(hi));
    g.strokeStyle = 'rgba(148, 163, 184, 0.35)'; g.setLineDash([3, 3]); g.lineWidth = 1;
    for (const v of [lo, hi]) { g.beginPath(); g.moveTo(0, y(v)); g.lineTo(w, y(v)); g.stroke(); }
    g.setLineDash([]);
    g.strokeStyle = '#38bdf8'; g.lineWidth = 1.8; g.beginPath();
    data.forEach((v, i) => { const x = (i / (data.length - 1)) * w; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
    g.stroke();
    const last = data[data.length - 1];
    g.fillStyle = '#38bdf8'; g.beginPath(); g.arc(w - 2, y(last), 3, 0, Math.PI * 2); g.fill();
  }

  // --- Inspector ---
  showInspector(info) {
    const p = this.$('inspector');
    this.$('insp-type').textContent = info.type;
    this.$('insp-title').textContent = info.title;
    const body = this.$('insp-body');
    body.innerHTML = '';
    if (info.live) body.appendChild(el('div', 'insp-live', ''));
    const dl = el('dl', 'insp-rows');
    for (const [k, v] of info.rows) dl.insertAdjacentHTML('beforeend', `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`);
    body.appendChild(dl);
    this.$('insp-follow').hidden = !info.canFollow;
    this.$('insp-focus').hidden = !!info.noFocus;
    const open = this.$('insp-open');
    open.hidden = !info.link;
    if (info.link) open.href = info.link;
    this.setFollowing(false);
    p.classList.remove('closed');
    if (info.live) this.updateInspectorLive(info.live());
  }
  updateInspectorLive(live) {
    const box = document.querySelector('#insp-body .insp-live');
    if (!box || !live) return;
    const b = Math.round(live.battery * 100);
    box.innerHTML = `
      <div class="live-row"><span class="chip ${STATE_TONE[live.state] || 'muted'}">${STATE_ES[live.state] || live.state}</span>
        <span class="live-speed">${live.speed.toFixed(1)} m/s</span></div>
      <div class="live-batt"><span>Batería</span><span class="batt big"><i class="${b < 25 ? 'low' : b < 50 ? 'mid' : ''}" style="width:${b}%"></i></span><b>${b}%</b></div>
      ${live.task ? `<div class="live-task">${esc(live.task)}</div>` : ''}`;
  }
  setFollowing(f) {
    const b = this.$('insp-follow');
    b.classList.toggle('active', f);
    b.querySelector('span').textContent = f ? 'Dejar de seguir' : 'Seguir';
  }
  hideInspector() { this.$('inspector').classList.add('closed'); }

  toast(msg) {
    const t = this.$('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2200);
  }
}

export const ICON = {
  play: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
};

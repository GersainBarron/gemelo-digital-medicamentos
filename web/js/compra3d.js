// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  compra3d.js · La compra consolidada en 3D
//
//  · Diorama: assets/compra.glb (Blender, nacional/compra_builder.py), en
//    metros. Arcos por etapa (gate + gate_lamp), anclas (anchor, wh_key)
//    donde se acomodan las tarimas, fosas de desiertas y sin contrato,
//    carril de patente, laboratorios y CENADI.
//  · Cada clave del plan es una tarima (alto ∝ log de sus piezas) que avanza
//    con el calendario de la simulación (compra-sim.js): convocatoria,
//    evaluación técnica, precio, fallo, firma y entrega al CENADI. Las que
//    no pasan un filtro caen a la fosa de desiertas; en la segunda vuelta
//    salen hacia el contrato o caen a "sin contrato".
//  · Color: gris en proceso, verde agua adjudicada, azul patente, ámbar
//    parcial o segunda vuelta, rojo desierta o sin contrato. Ya en el
//    CENADI: verde si llegó a tiempo, ámbar o rojo según días sin medicamento.
//  · Lámparas de cada arco: verde agua si nadie se quedó ahí, ámbar si 1 o 2,
//    rojo si más (se encienden cuando la etapa ya pasó).
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const DAY = 864e5, TRAVEL = 4;                     // días que tarda una tarima entre zonas
const COL = { gris: '#cbd5e1', ok: '#2dd4bf', patente: '#60a5fa', warn: '#fbbf24', crit: '#f87171', sin: '#b91c1c' };
const GRID = { cols: 9, gap: 2.8 };

export class Compra3D {
  constructor(getGLB) { this.getGLB = getGLB || (u => fetch(u).then(r => r.arrayBuffer())); this.t = 0; this.sel = null; this.dirty = true; this.fly = null; }

  async load(box) {
    this.box = box;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH || devicePixelRatio < 2 });
    r.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.75 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    box.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1118');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1c2630, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-60, 160, 120); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 3000);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.1; c.maxPolarAngle = Math.PI * 0.47; c.minDistance = 30; c.maxDistance = 700;
    c.addEventListener('change', () => { this.dirty = true; });
    const gltf = await new GLTFLoader().parseAsync(await this.getGLB('assets/compra.glb'), '');
    scene.add(gltf.scene);
    this.anchors = {}; this.lamps = {};
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      const ud = o.userData || {};
      if (ud.wh_type === 'anchor') this.anchors[ud.wh_key] = o.getWorldPosition(new THREE.Vector3());
      if (ud.wh_type === 'gate_lamp' && o.isMesh) { o.material = o.material.clone(); this.lamps[ud.wh_key] = o; }
    });
    const geo = new THREE.BoxGeometry(2.3, 1, 2.3); geo.translate(0, 0.5, 0);
    this.pallets = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }), 200);
    this.pallets.count = 0; this.pallets.frustumCulled = false; scene.add(this.pallets);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), new THREE.MeshBasicMaterial({ color: '#f0fdfa', side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; scene.add(this.ring);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(box);
    this.resize(); this.home(true); this.bindPointer();
  }

  // ------------------------------------------------------------ guion de cada clave
  setResult(R) {
    this.R = R;
    const D = R.dates, d = t => (t - D.conv) / DAY;              // días desde la convocatoria
    this.t0 = -6; this.t1 = d(D.ini) + 150;
    this.marks = { conv: 0, apertura: d(D.apertura), evalFin: d(D.evalFin), descFin: d(D.descFin), fallo: d(D.fallo), firma: d(D.firma), seg2: d(D.seg2), ini: d(D.ini), puente: d(D.ini) + R.puente, patente: d(D.patente) };
    const M = this.marks;
    this.items = R.rows.map((x, i) => {
      const ev = [{ t: -1e9, z: 'plan' }];
      let col = 'gris';
      if (x.tipo === 'patente') {
        ev.push({ t: 0, z: 'patente' }, { t: M.patente, z: 'firma', col: 'patente' });
      } else {
        ev.push({ t: 0, z: 'convocatoria' });
        const drop = (t, causa) => ev.push({ t, z: 'desiertas', col: 'crit', causa });
        if (!x.ofertas) drop(M.apertura);
        else {
          ev.push({ t: M.apertura, z: 'tecnica' });
          if (!x.solventes) drop(M.evalFin);
          else {
            ev.push({ t: M.evalFin, z: 'precio' });
            if (!x.aceptables) drop(M.descFin);
            else ev.push({ t: M.descFin, z: 'fallo' }, { t: M.fallo, z: 'firma', col: x.estado === 'adjudicada' ? 'ok' : 'warn' });
          }
        }
        if (ev.at(-1).z === 'desiertas') {
          if (x.estado === 'sin contrato') ev.push({ t: M.seg2, z: 'sincontrato', col: 'sin' });
          else ev.push({ t: M.seg2, z: 'segunda', col: 'warn' });
        }
      }
      const ent = x.primeraEntrega || x.entrega2;
      if (ent && x.estado !== 'sin contrato') ev.push({ t: d(ent), z: 'cenadi', col: x.diasSin >= 30 ? 'crit' : x.diasSin > 0 ? 'warn' : 'ok' });
      const h = 0.8 + 1.2 * Math.max(0, Math.log10(x.Q / 1e4));
      return { x, i, ev, h };
    });
    // lámparas: cuántas claves se quedaron en cada arco
    const n = k => this.items.filter(it => it.ev.some((e, j) => e.z === 'desiertas' && it.ev[j - 1]?.z === k)).length;
    this.drops = { convocatoria: n('convocatoria'), tecnica: n('tecnica'), precio: n('precio'), fallo: 0, firma: 0, segunda: R.kpi.sinContrato };
    this.zoneRank = {};
    for (const it of this.items) for (const e of it.ev) { const m = (this.zoneRank[e.z] ||= new Map()); if (!m.has(it.i)) m.set(it.i, m.size); }
    this.pallets.count = this.items.length;
    this.dirty = true;
  }
  slot(z, i) {
    // cada zona acomoda solo a las claves que pasan por ella, en una cuadrícula a su medida
    const a = this.anchors[z] || this.anchors.plan;
    const m = this.zoneRank[z], n = m ? m.size : 1, r = m?.get(i) ?? 0;
    const cols = Math.min(GRID.cols, Math.max(1, Math.ceil(Math.sqrt(n * 1.6)))), rows = Math.ceil(n / cols);
    const col = r % cols, row = Math.floor(r / cols);
    return new THREE.Vector3(a.x + (col - (cols - 1) / 2) * GRID.gap, a.y, a.z + (row - (rows - 1) / 2) * GRID.gap);
  }
  stateAt(it, t) {
    let k = 0; while (k + 1 < it.ev.length && it.ev[k + 1].t <= t) k++;
    const e = it.ev[k], prev = it.ev[k - 1];
    let col = 'gris'; for (let j = 0; j <= k; j++) if (it.ev[j].col) col = it.ev[j].col;
    return { e, prev, k, col };
  }
  setTime(t) { this.t = Math.max(this.t0, Math.min(this.t1, t)); this.dirty = true; }
  dateOf(t) { return this.R.dates.conv + t * DAY; }

  place() {
    const o = new THREE.Object3D(), c = new THREE.Color(), t = this.t;
    this.counts = {};
    for (const it of this.items) {
      const s = this.stateAt(it, t);
      const to = this.slot(s.e.z, it.i);
      let p = to, lift = 0;
      if (s.prev && t < s.e.t + TRAVEL) {
        const u = Math.max(0, (t - s.e.t) / TRAVEL), from = this.slot(s.prev.z, it.i);
        const e2 = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        p = from.clone().lerp(to, e2); lift = Math.sin(Math.PI * u) * (s.e.z === 'desiertas' || s.e.z === 'sincontrato' ? 3 : 6);
      }
      this.counts[s.e.z] = (this.counts[s.e.z] || 0) + 1;
      o.position.set(p.x, p.y + lift, p.z); o.scale.set(this.sel === it.i ? 1.25 : 1, it.h, this.sel === it.i ? 1.25 : 1); o.updateMatrix();
      this.pallets.setMatrixAt(it.i, o.matrix);
      this.pallets.setColorAt(it.i, c.set(COL[s.col]));
      if (this.sel === it.i) { this.ring.visible = true; this.ring.position.set(p.x, p.y + 0.15, p.z); }
    }
    if (this.sel == null) this.ring.visible = false;
    this.pallets.instanceMatrix.needsUpdate = true; this.pallets.instanceColor.needsUpdate = true;
    // lámparas
    const passed = { convocatoria: this.marks.apertura, tecnica: this.marks.evalFin, precio: this.marks.descFin, fallo: this.marks.fallo, firma: this.marks.firma, segunda: this.marks.seg2 };
    for (const [k, m] of Object.entries(this.lamps)) {
      const n = this.drops[k] ?? 0, on = t >= (passed[k] ?? 1e9);
      const hex = !on ? '#334155' : n === 0 ? COL.ok : n <= 2 ? COL.warn : COL.crit;
      m.material.color.set(hex); if (m.material.emissive) { m.material.emissive.set(hex); m.material.emissiveIntensity = on ? 0.9 : 0.1; }
    }
  }

  // ------------------------------------------------------------ cámara y selección
  home(now = false) {
    if (this.camera.aspect < 1) return this.flyTo(new THREE.Vector3(104, 0, 2), new THREE.Vector3(40, 215, 120), now);   // teléfono: más desde arriba
    this.flyTo(new THREE.Vector3(100, 0, 4), new THREE.Vector3(5, 92, 120), now);
  }
  focus(i) {
    this.sel = i; this.dirty = true;
    if (i == null) return;
    const s = this.stateAt(this.items[i], this.t), p = this.slot(s.e.z, i);
    this.flyTo(p.clone(), p.clone().add(new THREE.Vector3(-14, 34, 46)));
  }
  flyTo(tgt, pos, now = false) {
    if (now) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update(); this.dirty = true; return; }
    this.fly = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, k: 0 };
  }
  resize() {
    const w = this.box.clientWidth, h = this.box.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 58 : 38;
    this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  project(v) { const p = v.clone().project(this.camera); return [(p.x + 1) / 2 * this.box.clientWidth, (1 - p.y) / 2 * this.box.clientHeight, p.z < 1]; }
  bindPointer() {
    const el = this.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down = null;
    const hit = e => {
      const r = el.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera); this.pallets.computeBoundingSphere();
      const h = ray.intersectObject(this.pallets, false)[0];
      return h ? h.instanceId : null;
    };
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; this.fly = null; });
    el.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; } down = null; this.onPick?.(hit(e)); });
    if (!IS_TOUCH) el.addEventListener('pointermove', e => { if (e.buttons) return; const i = hit(e); this.onHover?.(i, e); el.style.cursor = i != null ? 'pointer' : 'grab'; });
    el.addEventListener('pointerleave', () => this.onHover?.(null));
  }
  frame(dt, playing) {
    let moving = false;
    if (this.fly) {
      const f = this.fly; f.k = Math.min(1, f.k + dt / 0.9);
      const e = f.k < 0.5 ? 2 * f.k * f.k : 1 - (-2 * f.k + 2) ** 2 / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, e); this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.k >= 1) this.fly = null; moving = true;
    }
    this.controls.update();
    if (playing || moving || this.dirty || this._t !== this.t) { this.place(); this.renderer.render(this.scene, this.camera); this.dirty = false; this._t = this.t; return true; }
    return false;
  }
}

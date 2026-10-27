// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  redfria3d.js · Cadena de red fría en 3D (assets/redfria.glb)
//  · Cinco eslabones: CENADI, tráiler, almacén estatal, caja térmica, unidad.
//  · El aro del piso y la pantalla del registrador toman el color de la
//    temperatura del eslabón; las cajas de producto se pintan de azul si se
//    congelaron, ámbar con calor y rojo si el lote se dio de baja.
//  · Las flechas del piso laten en el sentido del flujo.
//  · Etiquetas HTML con nombre y temperatura; tocar un eslabón lo enfoca.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const B = (x, y, z = 0) => new THREE.Vector3(x, z, -y);
export const KEYS = ['cenadi', 'reefer', 'estatal', 'caja', 'unidad'];
const VIEWS = {
  general: { pos: B(41, -66, 64), tgt: B(41, 2, 0) },
  cenadi: { pos: B(0, -14, 15), tgt: B(0, 6, 1) },
  reefer: { pos: B(24, -14, 10), tgt: B(22, 4, 2) },
  estatal: { pos: B(46, -10, 11), tgt: B(46, 5.5, 1) },
  caja: { pos: B(67, -6, 6), tgt: B(65, 4, 0.6) },
  unidad: { pos: B(80, -6, 6.5), tgt: B(79, 7, 0.8) },
};
export function tempColor(T) {
  if (T == null || Number.isNaN(T)) return '#64748b';
  if (T <= -0.5) return '#3b82f6';
  if (T < 2) return '#7dd3fc';
  if (T <= 8) return '#2dd4bf';
  if (T <= 12) return '#fbbf24';
  return '#f87171';
}
const PROD = { ok: '#e2e8f0', frio: '#60a5fa', calor: '#fbbf24', baja: '#f87171', oculto: '#e879f9' };

export class RedFria3D {
  constructor(box) { this.box = box; this.onPick = null; this.dirty = true; this.st = {}; this.labels = {}; }

  async load(glbBuffer) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH || devicePixelRatio < 2, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.75 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.box.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d141b');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3440, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-30, 60, 40); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.1; c.maxPolarAngle = Math.PI * 0.47; c.minDistance = 4; c.maxDistance = 220;
    c.addEventListener('change', () => { this.dirty = true; });
    const loader = new GLTFLoader();
    const gltf = glbBuffer ? await loader.parseAsync(glbBuffer, '') : await loader.loadAsync('assets/redfria.glb');
    scene.add(gltf.scene);
    for (const k of KEYS) this.st[k] = { rings: [], displays: [], products: [], anchor: null, meshes: [] };
    this.arrows = [];
    gltf.scene.traverse(o => {
      const ud = o.userData || {};
      const k = ud.wh_key || ud.wh_station;
      if (ud.wh_type === 'station') this.st[ud.wh_key].anchor = o;
      if (ud.wh_type === 'flow_arrow') this.arrows.push(o);
      const add = (list) => o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); list.push(m); } });
      if (ud.wh_type === 'station_ring') add(this.st[k].rings);
      if (ud.wh_type === 'display') add(this.st[k].displays);
      if (ud.wh_type === 'product') add(this.st[k].products);
      if (o.isMesh && k && this.st[k]) { this.st[k].meshes.push(o); o.userData._key = k; }
    });
    for (const a of this.arrows) a.traverse(m => { if (m.isMesh) m.material = m.material.clone(); });
    // etiquetas
    this.labelBox = document.createElement('div'); this.labelBox.className = 'rf-labels'; this.box.appendChild(this.labelBox);
    const NAMES = { cenadi: 'CENADI', reefer: 'Tráiler refrigerado', estatal: 'Almacén estatal', caja: 'Caja térmica', unidad: 'Unidad' };
    for (const k of KEYS) {
      const el = document.createElement('button'); el.className = 'rf-label'; el.dataset.k = k;
      el.innerHTML = `<i></i><b>${NAMES[k]}</b><span>—</span>`;
      el.addEventListener('click', () => this.onPick?.(k));
      this.labelBox.appendChild(el); this.labels[k] = el;
    }
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.box);
    this.resize(); this.view('general', true); this.bindPointer();
  }

  // estado de cada eslabón: { T, prod: 'ok'|'frio'|'calor'|'baja'|'oculto', txt }
  setState(map) {
    for (const k of KEYS) {
      const s = map[k] || {}, st = this.st[k];
      const col = new THREE.Color(tempColor(s.T));
      for (const m of [...st.rings, ...st.displays]) { m.material.color.copy(col); m.material.emissive = col.clone(); m.material.emissiveIntensity = s.active === false ? 0.15 : 0.9; }
      const pc = new THREE.Color(PROD[s.prod || 'ok']);
      for (const m of st.products) { m.material.color.copy(pc); m.material.emissive = pc.clone(); m.material.emissiveIntensity = s.prod && s.prod !== 'ok' ? 0.35 : 0; }
      const el = this.labels[k];
      if (el) {
        el.querySelector('i').style.background = tempColor(s.T);
        el.querySelector('span').textContent = s.txt || '—';
        el.classList.toggle('off', s.active === false);
        el.classList.toggle('alert', s.T != null && (s.T > 8 || s.T < 2));
      }
    }
    this.dirty = true;
  }
  select(k) { this.sel = k; for (const [kk, el] of Object.entries(this.labels)) el.classList.toggle('sel', kk === k); this.view(k || 'general'); }
  view(name, now = false) {
    const portrait = this.camera.aspect < 1;
    const v = name === 'general' && portrait ? { pos: B(-34, -48, 78), tgt: B(40, 4, 0) } : (VIEWS[name] || VIEWS.general);
    const k = portrait && name !== 'general' ? 1.4 : 1;
    const pos = v.tgt.clone().add(v.pos.clone().sub(v.tgt).multiplyScalar(k));
    if (now) { this.camera.position.copy(pos); this.controls.target.copy(v.tgt); this.controls.update(); this.dirty = true; return; }
    this.fly = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: v.tgt.clone(), k: 0 };
  }
  resize() {
    const w = this.box.clientWidth, h = this.box.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  bindPointer() {
    const el = this.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down = null;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; this.fly = null; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; }
      down = null;
      const r = el.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      const all = KEYS.flatMap(k => this.st[k].meshes);
      const hit = ray.intersectObjects(all, false)[0];
      this.onPick?.(hit ? hit.object.userData._key : null);
    });
  }
  placeLabels() {
    const w = this.box.clientWidth, h = this.box.clientHeight;
    for (const k of KEYS) {
      const a = this.st[k].anchor, el = this.labels[k]; if (!a || !el) continue;
      const p = a.getWorldPosition(new THREE.Vector3()); p.y += k === 'cenadi' ? 7 : k === 'reefer' ? 6.5 : 5;
      const q = p.project(this.camera);
      const vis = q.z < 1 && q.x > -1.1 && q.x < 1.1;
      el.style.display = vis ? '' : 'none';
      el.style.transform = `translate(${((q.x + 1) / 2 * w).toFixed(1)}px, ${((1 - q.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
  frame(dt) {
    let moving = false;
    if (this.fly) {
      const f = this.fly; f.k = Math.min(1, f.k + dt / 0.8);
      const e = f.k < 0.5 ? 2 * f.k * f.k : 1 - (-2 * f.k + 2) ** 2 / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, e); this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.k >= 1) this.fly = null; moving = true;
    }
    this.controls.update();
    const now = performance.now() / 1000;
    this.arrows.forEach((a, i) => a.traverse(m => { if (m.isMesh) m.material.emissiveIntensity = 0.25 + 0.75 * Math.max(0, Math.sin(now * 3 - i * 0.9)); }));
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    this.dirty = false;
    return moving;
  }
}

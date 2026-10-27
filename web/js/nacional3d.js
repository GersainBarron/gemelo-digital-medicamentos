// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  nacional3d.js · Mapa 3D de México por estado con los flujos del CENADI
//
//  · Modelo: assets/mapa_mexico.glb (Blender, nacional/mapa_mexico_builder.py),
//    en km con el CENADI en el origen. Blender (x, y, z) → three (x, z, −y).
//  · Cada estado (wh_type = state) se recolorea según el indicador elegido.
//    Al seleccionarlo se levanta, su costado brilla con pulso, se dibuja su
//    contorno, los demás se oscurecen y aparecen sus unidades por nivel.
//  · Flujos: arcos curvos del CENADI a cada estado, grosor ∝ tarimas por semana
//    (Jenny et al. 2018). Tráileres en ruta como función del reloj.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { truckU } from './nacional-sim.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const HS = 12;                                   // alto de la losa (km), igual que en Blender
const LIFT = 34;                                 // cuánto sube el estado seleccionado
const P3 = (x, y, z = 0) => new THREE.Vector3(x, z, -y);
const LEVEL_COLOR = ['#5eead4', '#60a5fa', '#f472b6'];
const LEVEL_R = [3.2, 5.5, 8];
const DIR = new THREE.Vector3(0, 0.80, 0.60).normalize();   // vista desde el sur, inclinada

export class Nacional3D {
  constructor(box, data, outline) {
    this.box = box; this.data = data; this.outline = outline;
    this.states = {}; this.sel = null; this.hover = null; this.onPick = null; this.onHover = null;
    this.showFlows = true; this.showAll = false; this.S = null; this.t = 0;
    this.dirty = true; this.anim = 0; this.fly = null;
  }

  async load() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH || devicePixelRatio < 2, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.75 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    this.box.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1118');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1c2630, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-900, 1800, 1300); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(36, 1, 5, 30000);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.1; c.screenSpacePanning = false;
    c.maxPolarAngle = Math.PI * 0.44; c.minDistance = 120; c.maxDistance = 9000;
    c.addEventListener('change', () => { this.dirty = true; });

    const gltf = await new GLTFLoader().loadAsync('assets/mapa_mexico.glb');
    const model = this.model = gltf.scene; scene.add(model);
    model.traverse(o => {
      const ud = o.userData || {};
      if (ud.wh_type === 'state') {
        const st = this.states[ud.wh_cve] ||= { cve: ud.wh_cve, meshes: [], labels: [] };
        st.node = o; st.y = 0; st.lift = 0;
        o.traverse(m => {
          if (!m.isMesh) return;
          m.userData.cve = ud.wh_cve;
          if (/Costado/.test(m.material.name)) { m.material = st.side = m.material.clone(); }
          else { m.material = st.top = m.material.clone(); }
          st.meshes.push(m);
        });
      }
      if (ud.wh_type === 'state_label') (this.states[ud.wh_cve] ||= { cve: ud.wh_cve, meshes: [], labels: [] }).labels.push(o);
      if (ud.wh_type === 'sea' && o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: '#0d1822' }); this.sea = o; }
      if (o.name === 'MX_CENADI') this.tower = o;
    });
    for (const st of Object.values(this.states)) {
      st.base = st.top.color.clone(); st.cur = st.top.color.clone(); st.target = st.top.color.clone();
      st.side.emissive = new THREE.Color('#2dd4bf'); st.side.emissiveIntensity = 0;
      st.top.emissive = new THREE.Color('#000'); st.labelMats = st.labels.map(l => (l.material = l.material.clone()));
    }
    this.buildFlows(); this.buildTrucks(); this.buildUnits(); this.buildOutline();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.box);
    this.resize(); this.home(true);
    this.bindPointer();
  }

  // ------------------------------------------------------------ flujos (arcos)
  arcFor(e) {
    const S = P3(0, 0, HS + 1), E = P3(e.hub[0], e.hub[1], HS + 1);
    const D = Math.hypot(e.hub[0], e.hub[1]);
    const mid = S.clone().add(E).multiplyScalar(0.5);
    const lat = new THREE.Vector3(-(E.z - S.z), 0, E.x - S.x).normalize().multiplyScalar(0.14 * D);   // curva hacia la derecha del viaje
    mid.add(lat); mid.y += 18 + 0.17 * D;
    const C = mid.clone().multiplyScalar(2).sub(S.clone().add(E).multiplyScalar(0.5));
    return new THREE.QuadraticBezierCurve3(S, C, E);
  }
  buildFlows() {
    const g = this.flows = new THREE.Group(); this.scene.add(g);
    const maxT = Math.max(...this.data.estados.map(e => e.tarimasSemana));
    this.arcs = {};
    for (const e of this.data.estados) {
      const curve = this.arcFor(e);
      const rad = 1.2 + 5.5 * Math.sqrt(e.tarimasSemana / maxT);
      const mat = new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.3, depthWrite: false });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, rad, 6, false), mat);
      tube.userData.cve = e.cve; tube.renderOrder = 2;
      g.add(tube);
      this.arcs[e.cve] = { curve, tube, mat, len: curve.getLength() };
    }
  }

  // ------------------------------------------------------------ tráileres en ruta
  buildTrucks() {
    const geo = new THREE.BoxGeometry(8, 7, 20); geo.translate(0, 3.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.25 });
    this.trucks = new THREE.InstancedMesh(geo, mat, 600);
    this.trucks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trucks.count = 0; this.trucks.frustumCulled = false; this.trucks.renderOrder = 3;
    this.scene.add(this.trucks);
    this.truckIdx = [];
    this._o = new THREE.Object3D(); this._c = new THREE.Color();
  }
  placeTrucks() {
    if (!this.S) return;
    const t = this.t, tm = this.trucks, o = this._o;
    let n = 0; this.truckIdx.length = 0;
    const scale = THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target) / 2600, 0.35, 1.6);
    for (const s of this.S.ships) {
      if (s.dep > t) break;
      if (s.arr + 1 < t) continue;
      const arc = this.arcs[s.cve]; if (!arc) continue;
      for (let k = 0; k < s.trucks && n < 600; k++) {
        const q = truckU(s, k, t); if (!q) continue;
        const p = arc.curve.getPointAt(q.u), p2 = arc.curve.getPointAt(Math.min(1, q.u + 0.01));
        if (this.sel === s.cve) p.y += this.states[s.cve].lift * q.u ** 6;
        o.position.copy(p); o.lookAt(p2); o.scale.setScalar(scale * (this.sel && this.sel !== s.cve ? 0.75 : 1)); o.updateMatrix();
        tm.setMatrixAt(n, o.matrix);
        const col = q.stop ? '#f87171' : s.late ? '#fb923c' : (this.sel && this.sel !== s.cve ? '#64748b' : '#e6edf3');
        tm.setColorAt(n, this._c.set(col));
        this.truckIdx[n] = s; n++;
      }
    }
    tm.count = n;
    tm.instanceMatrix.needsUpdate = true; if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ unidades médicas
  buildUnits() {
    const U = this.data.unidades;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const im = this.units = new THREE.InstancedMesh(geo, mat, U.length);
    im.frustumCulled = false; im.renderOrder = 4;
    U.forEach((u, i) => im.setColorAt(i, new THREE.Color(LEVEL_COLOR[u.nivel - 1])));
    this.unitScale = new Float32Array(U.length);
    this.scene.add(im);
    this.placeUnits(true);
  }
  placeUnits() {
    const U = this.data.unidades, o = this._o || new THREE.Object3D(), im = this.units;
    let any = false;
    U.forEach((u, i) => {
      const want = (this.sel === u.cve) ? 1 : this.showAll ? 0.55 : 0;
      const cur = this.unitScale[i] += (want - this.unitScale[i]) * 0.2;
      if (Math.abs(want - cur) > 0.01) any = true;
      const st = this.states[u.cve];
      const r = LEVEL_R[u.nivel - 1] * (this.sel === u.cve ? 1 : 0.8);
      o.position.set(u.xy[0], HS + (st ? st.lift : 0) + 0.2, -u.xy[1]);
      o.rotation.set(0, 0, 0);
      o.scale.set(r * Math.max(cur, 0.0001), (4 + 4 * u.nivel) * Math.max(cur, 0.0001), r * Math.max(cur, 0.0001));
      o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    return any;
  }

  // ------------------------------------------------------------ contorno del seleccionado
  buildOutline() {
    this.outlineGrp = new THREE.Group(); this.scene.add(this.outlineGrp);
    this.outlineMat = new THREE.LineBasicMaterial({ color: '#f0fdfa', transparent: true, opacity: 0.9 });
  }
  setOutline(cve) {
    this.outlineGrp.clear();
    if (!cve || !this.outline) return;
    const st = this.outline.estados.find(e => e.cve === cve); if (!st) return;
    for (const p of st.polys) {
      const pts = p.ext.map(([x, y]) => new THREE.Vector3(x, 0, -y));
      this.outlineGrp.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), this.outlineMat));
    }
  }

  // ------------------------------------------------------------ API
  setSim(S) { this.S = S; this.dirty = true; }
  setTime(t) { this.t = t; }
  setColors(map) {                                  // cve → '#rrggbb'
    for (const [cve, hex] of Object.entries(map)) { const st = this.states[cve]; if (st) st.base.set(hex); }
    this.refreshTargets();
  }
  refreshTargets() {
    const dim = new THREE.Color('#18212b');
    for (const st of Object.values(this.states)) {
      st.target.copy(st.base);
      if (this.sel && st.cve !== this.sel) st.target.lerp(dim, 0.62);
    }
    for (const [cve, a] of Object.entries(this.arcs || {})) {
      a.mat.opacity = !this.showFlows ? 0 : !this.sel ? 0.3 : cve === this.sel ? 0.85 : 0.07;
      a.mat.color.set(cve === this.sel ? '#5eead4' : '#2dd4bf');
      a.tube.visible = this.showFlows || cve === this.sel;
      if (cve === this.sel) a.mat.opacity = 0.85;
    }
    this.anim = 1.2; this.dirty = true;
  }
  select(cve, fly = true) {
    this.sel = cve || null;
    this.setOutline(this.sel);
    this.refreshTargets();
    if (!fly) return;
    if (!this.sel) { this.home(); return; }
    const e = this.data.estados.find(x => x.cve === cve);
    const tgt = new THREE.Vector3(e.label[0], HS + LIFT, -e.label[1]);
    const dist = THREE.MathUtils.clamp(Math.sqrt(e.area_km2) * 6, 520, 2600) * this.aspectK();
    this.flyTo(tgt, dist);
  }
  setFlows(on) { this.showFlows = on; this.refreshTargets(); }
  setAllUnits(on) { this.showAll = on; this.anim = 1.2; this.dirty = true; }
  aspectK() { const a = this.camera.aspect || 1.6; return a < 1.2 ? Math.min(2.1, 1.35 / a) : 1; }
  home(now = false) {
    const tgt = new THREE.Vector3(-170, 0, -470);
    const dist = 4300 * this.aspectK();
    this.flyTo(tgt, dist, now);
  }
  flyTo(tgt, dist, now = false) {
    const pos = tgt.clone().add(DIR.clone().multiplyScalar(dist));
    if (now) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update(); this.dirty = true; return; }
    this.fly = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, k: 0 };
  }
  resize() {
    const w = this.box.clientWidth, h = this.box.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }

  // ------------------------------------------------------------ selección con el dedo o el ratón
  bindPointer() {
    const el = this.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down = null;
    const hit = ev => {
      const r = el.getBoundingClientRect();
      v.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      this.units.computeBoundingSphere(); this.trucks.computeBoundingSphere();
      const u = ray.intersectObject(this.units, false)[0];
      if (u && this.unitScale[u.instanceId] > 0.3) return { type: 'unit', i: u.instanceId };
      if (this.trucks.count) { const tr = ray.intersectObject(this.trucks, false)[0]; if (tr) return { type: 'ship', s: this.truckIdx[tr.instanceId] }; }
      const meshes = Object.values(this.states).flatMap(s => s.meshes);
      const m = ray.intersectObjects(meshes, false)[0];
      if (m) return { type: 'state', cve: m.object.userData.cve };
      return null;
    };
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; this.fly = null; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; }
      down = null;
      const h = hit(e);
      this.onPick?.(h, e);
    });
    if (!IS_TOUCH) el.addEventListener('pointermove', e => {
      if (e.buttons) return;
      const h = hit(e);
      this.onHover?.(h, e);
      el.style.cursor = h ? 'pointer' : 'grab';
    });
    el.addEventListener('pointerleave', () => this.onHover?.(null));
  }
  project(x, y, z) {                                     // km de Blender → px en la caja
    const p = new THREE.Vector3(x, z, -y).project(this.camera);
    return [(p.x + 1) / 2 * this.box.clientWidth, (1 - p.y) / 2 * this.box.clientHeight, p.z < 1];
  }

  // ------------------------------------------------------------ cuadro
  frame(dt, playing) {
    let moving = false;
    if (this.fly) {
      const f = this.fly; f.k = Math.min(1, f.k + dt / 0.9);
      const e = f.k < 0.5 ? 2 * f.k * f.k : 1 - (-2 * f.k + 2) ** 2 / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, e); this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.k >= 1) this.fly = null;
      moving = true;
    }
    this.controls.update();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    if (this.anim > 0 || this.sel) {
      this.anim = Math.max(0, this.anim - dt);
      for (const st of Object.values(this.states)) {
        const want = st.cve === this.sel ? LIFT : 0;
        st.lift += (want - st.lift) * Math.min(1, dt * 7);
        st.node.position.y = st.lift;
        st.labels.forEach(l => (l.position.y = l.userData._y ??= l.position.y, l.position.y = l.userData._y + st.lift));
        st.cur.lerp(st.target, Math.min(1, dt * 6)); st.top.color.copy(st.cur);
        st.side.emissiveIntensity = st.cve === this.sel ? 0.35 + 0.65 * pulse : 0;
        st.top.emissive.set(st.cve === this.sel ? '#0f3d38' : '#000000');
        st.top.emissiveIntensity = st.cve === this.sel ? 0.4 + 0.6 * pulse : 0;
        st.labelMats.forEach(m => { m.transparent = true; m.opacity = !this.sel || st.cve === this.sel ? 1 : 0.35; });
      }
      if (this.sel) {
        this.outlineGrp.position.y = HS + this.states[this.sel].lift + 0.8;
        this.outlineMat.opacity = 0.45 + 0.55 * pulse;
      }
      moving = true;
    }
    if (this.placeUnits()) moving = true;
    if (this.tower) { this.tower.scale.y = 1 + 0.08 * Math.sin(performance.now() / 400); }
    if (playing || this.dirty || moving || this._lastT !== this.t) { this.placeTrucks(); this._lastT = this.t; this.renderer.render(this.scene, this.camera); this.dirty = false; return true; }
    return false;
  }
}

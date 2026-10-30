// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  torre3d.js · Pestaña "Torre 3D" de la torre de control (torre.html)
//
//  · Mapa de México (assets/mapa_mexico.glb, km, CENADI en el origen;
//    Blender (x, y, z) → three (x, z, −y)). Cada estado se tiñe con lo peor
//    de su fila en la matriz de 32 delegaciones.
//  · Edificio delegacional (assets/delegacion.glb) en cada sede, con su
//    franja y baliza en el semáforo de la delegación.
//  · 1,033 unidades: columna cuya altura y color dicen qué tan mal está
//    (gris sin pendientes, verde agua en plazo, ámbar, rojo).
//  · Torre vigía (assets/vigia.glb, diseño propio) en el Golfo de México,
//    exagerada. Su ojo-sensor gira hacia lo que la torre señala y proyecta
//    un haz de luz; en "Patrullar" recorre solo los focos rojos.
//  · Tocar una unidad, un edificio, un estado, el CENADI o la torre abre la
//    ficha (la arma torre.js con onPick).
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const HS = 12;                                     // alto de la losa de cada estado (km)
const DEL_S = 0.9;                                 // edificio delegacional (m → km exagerado)
const TW_XY = [600, 330];                          // la torre, en el Golfo de México
const TW_S = 4.0;                                  // torre de ~210 m → ~840 km
const ST_COL = ['#334155', '#2dd4bf', '#fbbf24', '#f87171'];
const SEM = { ok: '#2dd4bf', warn: '#fbbf24', crit: '#f87171', nd: '#64748b' };
const U_H = [5, 9, 22, 44];                        // alto de la columna por estado (km)
const DIR = new THREE.Vector3(0.18, 0.78, 0.6).normalize();
const P3 = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

export class Torre3D {
  constructor({ iss, getGLB }) {
    this.iss = iss; this.getGLB = getGLB || (u => fetch(u).then(r => r.arrayBuffer()));
    this.R = null; this.sel = null; this.target = null; this.patrol = true; this.queue = []; this.qi = -1; this.tNext = 0;
    this.onPick = null; this.onHover = null; this.onTarget = null; this.running = false;
  }

  async load(box) {
    this.box = box;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH || devicePixelRatio < 2, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.75 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    box.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#081018');
    scene.fog = new THREE.Fog('#081018', 5000, 11000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1c2630, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-900, 1800, 1300); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(36, 1, 5, 30000);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.1; c.maxPolarAngle = Math.PI * 0.47; c.minDistance = 60; c.maxDistance = 9000;

    const loader = new GLTFLoader();
    const [map, dele, vig] = await Promise.all(['assets/mapa_mexico.glb', 'assets/delegacion.glb', 'assets/vigia.glb']
      .map(u => this.getGLB(u).then(b => loader.parseAsync(b, ''))));
    // --- mapa
    this.states = {}; this.cenadi = [];
    map.scene.traverse(o => {
      const ud = o.userData || {};
      if (ud.wh_type === 'cenadi') o.traverse(m => { if (m.isMesh) { m.userData.cenadi = true; this.cenadi.push(m); } });
      if (ud.wh_type === 'sea' && o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: '#0b1a26' });
      if (ud.wh_type === 'state') {
        const st = this.states[ud.wh_cve] = { cve: ud.wh_cve, meshes: [] };
        o.traverse(m => {
          if (!m.isMesh) return;
          m.userData.cve = ud.wh_cve;
          if (/Costado/.test(m.material.name)) m.material = st.side = m.material.clone();
          else m.material = st.top = m.material.clone();
          st.meshes.push(m);
        });
        st.cur = new THREE.Color('#1e2a36'); st.target = st.cur.clone();
      }
    });
    scene.add(map.scene);
    const bb = new THREE.Box3(); map.scene.traverse(o => { if (o.isMesh && o.userData.cve) bb.expandByObject(o); });
    this.mapC = bb.getCenter(new THREE.Vector3()); this.mapS = bb.getSize(new THREE.Vector3());
    this.cenadiPos = P3(0, 0, HS + 20);
    // --- posiciones
    const E = Object.fromEntries(this.iss.estados.map(e => [e.cve, e]));
    this.dels = this.iss.estados.map(e => ({ cve: e.cve, nombre: e.nombre, abbr: e.abbr, pos: P3(e.hub[0], e.hub[1], HS), label: P3(e.label[0], e.label[1], HS), area: e.area_km2 }));
    this.dIdx = Object.fromEntries(this.dels.map((d, i) => [d.cve, i]));
    this.uPos = this.iss.unidades.map(u => P3(u.xy[0], u.xy[1], HS));
    this.E = E;
    this.buildDelegaciones(dele.scene); this.buildUnits(); this.buildTower(vig.scene); this.buildBeam();
    this.labels = document.createElement('div'); this.labels.className = 'u3d-labels'; box.appendChild(this.labels);
    this.tag = document.createElement('div'); this.tag.className = 'tw3-tag'; this.tag.hidden = true; this.labels.appendChild(this.tag);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(box);
    this.resize(); this.home(true); this.bindPointer();
    this.clock = new THREE.Clock();
  }

  // ------------------------------------------------------------ modelos
  buildDelegaciones(root) {
    root.updateMatrixWorld(true);
    this.dParts = []; this.dSem = null;
    const N = this.dels.length;
    root.traverse(m => {
      if (!m.isMesh) return;
      const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
      const sem = m.userData.wh_type === 'del_semaforo' || m.parent?.userData?.wh_type === 'del_semaforo';
      const mat = sem ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.45 }) : m.material;
      const im = new THREE.InstancedMesh(g, mat, N);
      im.frustumCulled = false; this.scene.add(im); this.dParts.push(im);
      if (sem) { this.dSem = im; for (let i = 0; i < N; i++) im.setColorAt(i, new THREE.Color('#64748b')); }
    });
    this.placeDelegaciones();
  }
  placeDelegaciones() {
    const o = new THREE.Object3D();
    this.dels.forEach((d, i) => {
      const k = DEL_S * (this.sel?.type === 'del' && this.sel.cve === d.cve ? 1.5 : 1);
      o.position.copy(d.pos); o.scale.setScalar(k); o.updateMatrix();
      for (const im of this.dParts) im.setMatrixAt(i, o.matrix);
    });
    for (const im of this.dParts) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
  buildUnits() {
    const g = new THREE.CylinderGeometry(3.4, 3.4, 1, 10); g.translate(0, 0.5, 0);
    const n = this.uPos.length;
    this.units = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#fff' }), n);
    this.units.frustumCulled = false; this.scene.add(this.units);
    this.uSt = new Uint8Array(n);
  }
  placeUnits() {
    const im = this.units, o = new THREE.Object3D(), c = new THREE.Color();
    const sel = this.sel;
    for (let i = 0; i < this.uPos.length; i++) {
      const st = this.uSt[i], u = this.R?.unidades[i];
      const inSel = sel?.type === 'del' && u?.cve === sel.cve, me = sel?.type === 'unit' && sel.i === i;
      const w = me ? 2.4 : inSel ? 1.5 : 1;
      o.position.copy(this.uPos[i]); o.scale.set(w, U_H[st] * (me ? 1.4 : 1), w); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      c.set(ST_COL[st]); if (sel?.type === 'del' && !inSel) c.lerp(new THREE.Color('#0f151c'), 0.6);
      im.setColorAt(i, c);
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
  }
  buildTower(root) {
    const tw = this.tower = root;
    tw.scale.setScalar(TW_S); tw.position.copy(P3(TW_XY[0], TW_XY[1], 0));
    this.iris = []; this.rings = [];
    tw.traverse(o => {
      const t = o.userData?.wh_type;
      if (t === 'vig_ojo') this.eye = o;
      if (o.isMesh) {
        o.userData.tower = true;
        const pt = o.userData.wh_type || o.parent?.userData?.wh_type;
        if (pt === 'vig_iris') { o.material = new THREE.MeshStandardMaterial({ color: '#2dd4bf', emissive: '#2dd4bf', emissiveIntensity: 2.2 }); this.iris.push(o); }
        if (pt === 'vig_anillo') { o.material = new THREE.MeshStandardMaterial({ color: '#2dd4bf', emissive: '#2dd4bf', emissiveIntensity: 1.4 }); this.rings.push(o); }
      }
    });
    this.scene.add(tw);
    tw.updateMatrixWorld(true);
    this.eyeWorld = new THREE.Vector3(); this.eye.getWorldPosition(this.eyeWorld);
    this.eyeQ0 = this.eye.quaternion.clone();
    // luz que sale del ojo
    this.eyeLight = new THREE.PointLight('#2dd4bf', 2.5, 900, 1.2); this.eyeLight.position.copy(this.eyeWorld); this.scene.add(this.eyeLight);
  }
  buildBeam() {
    const g = new THREE.CylinderGeometry(0.004, 0.06, 1, 32, 1, true); g.translate(0, -0.5, 0);   // punta en el ojo, boca en el objetivo
    this.beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.renderOrder = 4; this.beam.visible = false; this.scene.add(this.beam);
    this.spot = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 48), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    this.spot.rotation.x = -Math.PI / 2; this.spot.renderOrder = 5; this.spot.visible = false; this.scene.add(this.spot);
    this.look = { cur: new THREE.Vector3(), to: new THREE.Vector3(), r: 40, col: new THREE.Color('#2dd4bf'), on: false };
  }

  // ------------------------------------------------------------ datos de la torre
  setData(R) {
    this.R = R;
    for (let i = 0; i < this.uSt.length; i++) this.uSt[i] = R.unidades[i]?.st || 0;
    this.placeUnits();
    const c = new THREE.Color();
    this.rowOf = Object.fromEntries(R.matriz.rows.map(r => [r.cve, r]));
    this.dels.forEach((d, i) => {
      const r = this.rowOf[d.cve], w = r ? worst(r) : 'nd';
      this.dSem?.setColorAt(i, c.set(SEM[w]));
    });
    if (this.dSem) this.dSem.instanceColor.needsUpdate = true;
    this.recolorStates();
    // estado general de la torre: anillos por el número de eslabones en rojo
    const nc = R.eslabones.filter(e => e.st === 'crit').length;
    const g = nc >= 5 ? SEM.crit : nc >= 2 ? SEM.warn : SEM.ok;
    for (const m of this.rings) { m.material.color.set(g); m.material.emissive.set(g); }
    this.buildQueue();
    if (this.patrol) { this.qi = -1; this.tNext = 0; }
    else if (this.target) this.aimAt(this.target);
  }
  recolorStates() {
    const base = new THREE.Color('#1b2733');
    for (const [cve, st] of Object.entries(this.states)) {
      const r = this.rowOf?.[cve];
      st.target.copy(base);
      if (r) { const sc = r.score; st.target.lerp(new THREE.Color(sc >= 9 ? '#991b1b' : sc >= 5 ? '#92400e' : '#115e59'), 0.18 + Math.min(0.32, sc / 36)); }
      if (this.sel?.type === 'del' && this.sel.cve !== cve) st.target.lerp(new THREE.Color('#0b1118'), 0.55);
      if (this.sel?.type === 'del' && this.sel.cve === cve) st.target.lerp(new THREE.Color('#2dd4bf'), 0.25);
    }
    this.anim = 1;
  }
  // focos que recorre el ojo al patrullar: torre → peores delegaciones → unidades en rojo → CENADI
  buildQueue() {
    const R = this.R, q = [];
    const rows = [...R.matriz.rows].filter(r => r.score >= 4).slice(0, 6);
    const us = R.unidades.filter(u => u.st === 3).sort((a, b) => (b.integ?.monto || 0) - (a.integ?.monto || 0) || b.esc2 - a.esc2).slice(0, 8);
    const cen = R.eslabones.find(e => e.id === 'cenadi');
    for (let k = 0; k < Math.max(rows.length, us.length); k++) {
      if (rows[k]) q.push({ type: 'del', cve: rows[k].cve });
      if (us[k]) q.push({ type: 'unit', i: us[k].i });
      if (k === 1 && cen && cen.st !== 'ok') q.push({ type: 'cenadi' });
    }
    this.queue = q;
  }
  posOf(s) {
    if (!s) return null;
    if (s.type === 'del') return this.dels[this.dIdx[s.cve]].pos.clone().add(new THREE.Vector3(0, 12, 0));
    if (s.type === 'unit') return this.uPos[s.i].clone().add(new THREE.Vector3(0, U_H[this.uSt[s.i]] * 0.5, 0));
    if (s.type === 'cenadi') return this.cenadiPos.clone();
    return null;
  }
  stOf(s) {
    if (s.type === 'del') { const r = this.rowOf?.[s.cve]; return r ? worst(r) : 'nd'; }
    if (s.type === 'unit') return ['ok', 'ok', 'warn', 'crit'][this.uSt[s.i]];
    if (s.type === 'cenadi') return this.R?.eslabones.find(e => e.id === 'cenadi')?.st || 'ok';
    return 'ok';
  }
  aimAt(s) {
    this.target = s;
    const p = this.posOf(s);
    if (!p) { this.look.on = false; this.tag.hidden = true; return; }
    this.look.to.copy(p); this.look.on = true;
    if (!this.look.init) { this.look.cur.copy(p); this.look.init = true; }
    this.look.r = s.type === 'del' ? 70 : s.type === 'cenadi' ? 60 : 30;
    this.look.col.set(SEM[this.stOf(s)]);
    this.onTarget?.(s);
  }
  setPatrol(v) { this.patrol = v; if (v) { this.tNext = 0; } }
  select(s, fly = true) {
    this.sel = s && s.type !== 'tower' ? s : null;
    this.placeUnits(); this.placeDelegaciones(); this.recolorStates();
    if (s && s.type !== 'tower') { this.patrol = false; this.aimAt(s); }
    if (!fly) return;
    if (!s) return this.home();
    if (s.type === 'tower') return this.flyTo(this.eyeWorld.clone().setY(this.eyeWorld.y * 0.5), 1900 * this.aspectK());
    if (s.type === 'del') { const d = this.dels[this.dIdx[s.cve]]; return this.flyTo(d.label.clone(), THREE.MathUtils.clamp(Math.sqrt(d.area) * 5, 520, 2400) * this.aspectK()); }
    if (s.type === 'unit') return this.flyTo(this.uPos[s.i].clone(), 380 * this.aspectK());
    if (s.type === 'cenadi') return this.flyTo(this.cenadiPos.clone(), 420 * this.aspectK());
  }

  // ------------------------------------------------------------ cámara
  aspectK() { const a = this.camera.aspect || 1.6; return a < 1.2 ? Math.min(2.1, 1.35 / a) : 1; }
  home(now = false) {
    const a = this.camera.aspect || 1.6, f = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const need = a < 1 ? this.mapS.x * 0.36 / (f * a) : Math.max(this.mapS.z * 0.62 / f, this.mapS.x * 0.55 / (f * a));   // en teléfono, centro del país y la torre
    this.flyTo(this.mapC.clone().setY(80).add(new THREE.Vector3(80, 0, 40)), need, now);
  }
  flyTo(tgt, dist, now = false) {
    const pos = tgt.clone().add(DIR.clone().multiplyScalar(dist));
    if (now) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update(); return; }
    this.fly = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, k: 0 };
  }
  resize() {
    const w = this.box.clientWidth, h = this.box.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  project(p) {
    const v = p.clone().project(this.camera);
    return [(v.x + 1) / 2 * this.box.clientWidth, (1 - v.y) / 2 * this.box.clientHeight, v.z < 1 && v.z > -1];
  }
  bindPointer() {
    const el = this.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down = null;
    const stMeshes = Object.values(this.states).flatMap(s => s.meshes);
    const twMeshes = []; this.tower.traverse(o => { if (o.isMesh) twMeshes.push(o); });
    const hit = ev => {
      const r = el.getBoundingClientRect();
      v.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      if (ray.intersectObjects(twMeshes, false)[0]) return { type: 'tower' };
      const u = ray.intersectObject(this.units, false)[0];
      if (u) return { type: 'unit', i: u.instanceId };
      const dm = ray.intersectObjects(this.dParts, false)[0];
      if (dm) return { type: 'del', cve: this.dels[dm.instanceId].cve };
      if (this.cenadi.length && ray.intersectObjects(this.cenadi, false)[0]) return { type: 'cenadi' };
      const m = ray.intersectObjects(stMeshes, false)[0];
      if (m) return { type: 'del', cve: m.object.userData.cve };
      return null;
    };
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; this.fly = null; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; }
      down = null; this.onPick?.(hit(e), e);
    });
    if (!IS_TOUCH) el.addEventListener('pointermove', e => { if (e.buttons) return; const h = hit(e); this.onHover?.(h, e); el.style.cursor = h ? 'pointer' : 'grab'; });
    el.addEventListener('pointerleave', () => this.onHover?.(null));
  }

  // ------------------------------------------------------------ cuadro
  start() { if (this.running) return; this.running = true; this.clock.getDelta(); this.renderer.setAnimationLoop(() => this.frame()); }
  stop() { this.running = false; this.renderer.setAnimationLoop(null); }
  frame() {
    const dt = Math.min(0.1, this.clock.getDelta()), now = performance.now() / 1000;
    if (this.fly) {
      const f = this.fly; f.k = Math.min(1, f.k + dt / 1.0);
      const e = f.k < 0.5 ? 2 * f.k * f.k : 1 - (-2 * f.k + 2) ** 2 / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, e); this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.k >= 1) this.fly = null;
    }
    this.controls.update();
    if (this.anim > 0) {
      this.anim = Math.max(0, this.anim - dt);
      for (const st of Object.values(this.states)) { st.cur.lerp(st.target, Math.min(1, dt * 6)); st.top.color.copy(st.cur); st.side.color.copy(st.cur).multiplyScalar(0.6); }
    }
    // patrulla: cada 4 s el ojo pasa al siguiente foco
    if (this.patrol && this.queue.length && now >= this.tNext) {
      this.qi = (this.qi + 1) % this.queue.length; this.aimAt(this.queue[this.qi]); this.tNext = now + 4;
    }
    // el ojo gira hacia el objetivo (suave) y el haz lo sigue
    const L = this.look;
    if (L.on && this.eye) {
      L.cur.lerp(L.to, Math.min(1, dt * 2.6));
      const m = new THREE.Matrix4().lookAt(L.cur, this.eyeWorld, new THREE.Vector3(0, 1, 0));   // +Z del ojo hacia el objetivo
      const qw = new THREE.Quaternion().setFromRotationMatrix(m);
      const pq = this.eye.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.eye.quaternion.copy(pq.multiply(qw));
      const d = L.cur.distanceTo(this.eyeWorld), dir = L.cur.clone().sub(this.eyeWorld).normalize();
      const b = this.beam; b.visible = true;
      b.position.copy(this.eyeWorld);
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      b.scale.set(L.r / 0.06, d, L.r / 0.06);       // boca del cono = radio del foco
      b.material.color.lerp(L.col, Math.min(1, dt * 4));
      b.material.opacity = 0.12 + 0.05 * Math.sin(now * 3);
      const s = this.spot; s.visible = true; s.position.copy(L.cur).setY(HS + 1.5);
      s.scale.setScalar(L.r * (1 + 0.12 * Math.sin(now * 4))); s.material.color.copy(b.material.color);
      for (const m2 of this.iris) { m2.material.color.copy(b.material.color); m2.material.emissive.copy(b.material.color); }
      this.eyeLight.color.copy(b.material.color);
      this.placeTag(L.cur);
    } else { this.beam.visible = false; this.spot.visible = false; this.tag.hidden = true; }
    for (const m2 of this.iris) m2.material.emissiveIntensity = 1.8 + 0.8 * Math.sin(now * 2.2);
    this.renderer.render(this.scene, this.camera);
  }
  placeTag(p) {
    const [x, y, vis] = this.project(p.clone().add(new THREE.Vector3(0, 30, 0)));
    if (!vis || !this.tagHTML) { this.tag.hidden = true; return; }
    this.tag.hidden = false;
    this.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }
  setTag(html) { this.tagHTML = html; this.tag.innerHTML = html || ''; }
}

function worst(r) {
  const R = { nd: 0, ok: 0, warn: 1, crit: 2 };
  return Object.values(r.c).reduce((s, x) => (R[x.st] > R[s] ? x.st : s), 'ok');
}

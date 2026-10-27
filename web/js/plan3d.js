// Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
// =====================================================================
//  plan3d.js · Flujo nacional de las peticiones del plan anual en 3D
//
//  · Mapa de México por estado (assets/mapa_mexico.glb, km, CENADI en el
//    origen; Blender (x, y, z) → three (x, z, −y)) y la torre de Oficinas
//    Centrales del ISSSTE en Buenavista (assets/issste_buenavista.glb, en
//    metros, exagerada para que se vea a escala nacional).
//  · Nodos: 1,033 unidades (columna ∝ peticiones en su escritorio), 32
//    delegaciones y Oficina Central (pilas de cajas: cada caja = 100
//    peticiones; abajo las más viejas). Color por antigüedad contra el plazo.
//  · Partículas: lo que se movió cada día de quién a quién (P.flow, que
//    registra el motor en cada día simulado): asignación, aprobación,
//    negociación, rechazo y conclusión.
//  · El tiempo t va en días hábiles: entre d y d+1 viajan los movimientos
//    del día y las pilas muestran el corte del día d.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const HS = 12;                                     // alto de la losa de cada estado (km)
const CAJA = 100;                                  // peticiones por caja en las pilas
const CENTRAL_XY = [4, -12];                       // Buenavista, a 12 km del CENADI
const TOWER_S = 1.6;                               // metros → km exagerado
const DEL_S = 0.9;                                 // edificio delegacional: un predio de 64 m queda en 58 km
const AGE_COL = ['#2dd4bf', '#fbbf24', '#f87171'];
const ACT_COL = { um: '#5eead4', del: '#60a5fa', oc: '#f472b6' };
const DEC_COL = { asignar: '#cbd5e1', aprobar: '#34d399', negociar: '#c084fc', solicitar: '#c084fc', rechazar: '#f87171' };
const DIR = new THREE.Vector3(0.0, 0.86, 0.52).normalize();
const MAXP = 7000;
const P3 = (x, y, z = 0) => new THREE.Vector3(x, z, -y);
const rnd = s => { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d); s ^= s + Math.imul(s ^ (s >>> 7), 0x297a2d39); return ((s ^ (s >>> 14)) >>> 0) / 4294967296; };

export class PlanFlow3D {
  constructor({ iss, U, getGLB }) {
    this.iss = iss; this.U = U; this.getGLB = getGLB || (u => fetch(u).then(r => r.arrayBuffer()));
    this.Nu = U.units.length; this.ND = U.delegaciones.length;
    this.t = -1; this.flow = null; this.P = null; this.sel = null; this.colorMode = 'quien';
    this.dirty = true; this.fly = null; this.onPick = null; this.onHover = null; this.labels = [];
  }

  async load(box) {
    this.box = box;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH || devicePixelRatio < 2, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.75 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    box.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1118');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1c2630, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-900, 1800, 1300); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(36, 1, 5, 30000);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.1; c.maxPolarAngle = Math.PI * 0.46; c.minDistance = 80; c.maxDistance = 9000;
    c.addEventListener('change', () => { this.dirty = true; });

    const loader = new GLTFLoader();
    const [map, tower, dele] = await Promise.all([
      this.getGLB('assets/mapa_mexico.glb').then(b => loader.parseAsync(b, '')),
      this.getGLB('assets/issste_buenavista.glb').then(b => loader.parseAsync(b, '')),
      this.getGLB('assets/delegacion.glb').then(b => loader.parseAsync(b, '')),
    ]);
    this.deleScene = dele.scene;
    // --- mapa: se recolorea cada estado; el CENADI no participa en la planeación
    this.states = {};
    map.scene.traverse(o => {
      const ud = o.userData || {};
      if (ud.wh_type === 'cenadi') o.visible = false;
      if (ud.wh_type === 'sea' && o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: '#0d1822' });
      if (ud.wh_type === 'state') {
        const st = this.states[ud.wh_cve] = { cve: ud.wh_cve, meshes: [] };
        o.traverse(m => {
          if (!m.isMesh) return;
          m.userData.cve = ud.wh_cve;
          if (/Costado/.test(m.material.name)) m.material = st.side = m.material.clone();
          else { m.material = st.top = m.material.clone(); }
          st.meshes.push(m);
        });
        st.cur = new THREE.Color('#1e2a36'); st.target = st.cur.clone();
      }
    });
    scene.add(map.scene);
    const bb = new THREE.Box3(); map.scene.traverse(o => { if (o.isMesh && o.userData.cve) bb.expandByObject(o); });
    this.mapC = bb.getCenter(new THREE.Vector3()); this.mapS = bb.getSize(new THREE.Vector3());
    // --- torre de Buenavista (sin plaza ni asta)
    const tw = this.tower = tower.scene;
    tw.traverse(o => { if (/plaza|bandera/.test(o.name)) o.visible = false; if (o.isMesh) { o.userData.central = true; } });
    tw.scale.setScalar(TOWER_S); tw.position.copy(P3(CENTRAL_XY[0], CENTRAL_XY[1], HS));
    tw.rotation.y = 0.35;
    scene.add(tw);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(60, 66, 64), new THREE.MeshBasicMaterial({ color: '#f472b6', transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2; this.halo.position.copy(P3(CENTRAL_XY[0], CENTRAL_XY[1], HS + 1)); scene.add(this.halo);

    this.buildNodes(); this.buildLinks(); this.buildPiles(); this.buildUnits(); this.buildParticles();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(box);
    this.resize(); this.home(true); this.bindPointer();
  }

  attach(box) {                                    // el render de la página reemplaza el DOM: se vuelve a montar el lienzo
    if (this.box === box) return;
    this.ro.disconnect(); this.box = box; box.appendChild(this.renderer.domElement);
    this.ro.observe(box); this.resize(); this.dirty = true;
  }

  // ------------------------------------------------------------ posiciones de los nodos
  buildNodes() {
    const E = Object.fromEntries(this.iss.estados.map(e => [e.cve, e]));
    this.uPos = this.U.units.map((u, i) => { const xy = this.iss.unidades[i].xy; return P3(xy[0], xy[1], HS); });
    this.dPos = this.U.delegaciones.map(d => { const e = E[d.cve]; return P3(e.hub[0], e.hub[1], HS); });
    this.dPile = this.dPos.map(p => p.clone().add(new THREE.Vector3(44, 0, 8)));     // escritorio de la delegación, junto al edificio
    this.cPos = P3(CENTRAL_XY[0], CENTRAL_XY[1], HS);
    this.cPile = P3(CENTRAL_XY[0] + 70, CENTRAL_XY[1] - 95, HS);     // escritorio de Central, junto a la torre
    this.dOf = this.U.units.map(u => this.U.delegaciones.findIndex(d => d.cve === u.cve));
    this.dEst = this.U.delegaciones.map(d => E[d.cve]);
  }
  // ------------------------------------------------------------ líneas de la red (unidad → delegación → Central)
  arc(A, B, k = 0.18, out = []) {
    const D = A.distanceTo(B), C = A.clone().add(B).multiplyScalar(0.5); C.y += 10 + k * D;
    return [A, C, B];
  }
  at(q, u, v) {                                    // punto en la curva cuadrática
    const [A, C, B] = q, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    return v.set(a * A.x + b * C.x + c * B.x, a * A.y + b * C.y + c * B.y, a * A.z + b * C.z + c * B.z);
  }
  buildLinks() {
    const pts = [], v = new THREE.Vector3();
    this.U.units.forEach((u, i) => { const q = this.arc(this.uPos[i], this.dPos[this.dOf[i]], 0.12); let p0 = q[0]; for (let s = 1; s <= 6; s++) { const p = this.at(q, s / 6, new THREE.Vector3()); pts.push(p0, p); p0 = p; } });
    const lu = this.unitLinks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#5eead4', transparent: true, opacity: 0.08, depthWrite: false }));
    this.scene.add(lu);
    const pd = [];
    this.dPos.forEach(D => { const q = this.arc(D, this.cPos, 0.16); let p0 = q[0]; for (let s = 1; s <= 24; s++) { const p = this.at(q, s / 24, new THREE.Vector3()); pd.push(p0, p); p0 = p; } });
    this.delLinks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pd), new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.22, depthWrite: false }));
    this.scene.add(this.delLinks);
    this.buildDelegaciones();
  }
  // edificio delegacional (assets/delegacion.glb, en metros) en la sede de cada delegación:
  // una malla instanciada por material; la franja del letrero y la baliza llevan el semáforo de su bandeja
  buildDelegaciones() {
    const root = this.deleScene; root.updateMatrixWorld(true);
    const o = new THREE.Object3D();
    this.dParts = []; this.dSem = null;
    root.traverse(m => {
      if (!m.isMesh) return;
      const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
      const sem = m.userData.wh_type === 'del_semaforo' || m.parent?.userData?.wh_type === 'del_semaforo';
      const mat = sem ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.35 }) : m.material;
      const im = new THREE.InstancedMesh(g, mat, this.ND);
      im.frustumCulled = false; this.scene.add(im); this.dParts.push(im);
      if (sem) { this.dSem = im; for (let i = 0; i < this.ND; i++) im.setColorAt(i, new THREE.Color('#64748b')); }
    });
    this.placeDelegaciones();
  }
  placeDelegaciones() {
    const o = new THREE.Object3D();
    for (let i = 0; i < this.ND; i++) {
      const k = DEL_S * (this.sel?.type === 'del' && this.sel.i === i ? 1.35 : 1);
      o.position.copy(this.dPos[i]); o.scale.setScalar(k); o.updateMatrix();
      for (const im of this.dParts) im.setMatrixAt(i, o.matrix);
    }
    for (const im of this.dParts) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
  // ------------------------------------------------------------ pilas de cajas (delegaciones y Central)
  buildPiles() {
    const g = new THREE.BoxGeometry(13, 5.4, 13); g.translate(0, 2.7, 0);
    const n = Math.ceil(38528 * 1.2 / CAJA) + this.ND * 3 + 16;
    const im = this.piles = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.55, metalness: 0.05 }), n);
    im.count = 0; im.frustumCulled = false; this.scene.add(im);
    this.pileOwner = new Int16Array(n);
  }
  placePiles(cnt) {
    const im = this.piles, o = new THREE.Object3D(), col = new THREE.Color();
    let k = 0;
    const Nu = this.Nu, ND = this.ND;
    const stack = (base, a, side, owner) => {         // a = [ok, vencidas, críticas]
      const tot = a[0] + a[1] + a[2]; if (!tot) return 0;
      const boxes = Math.ceil(tot / CAJA), per = side * side;
      const nb = [Math.round(boxes * a[2] / tot), Math.round(boxes * a[1] / tot)]; // abajo lo más viejo
      for (let b = 0; b < boxes && k < im.instanceMatrix.count; b++) {
        const layer = Math.floor(b / per), cell = b % per, cx = cell % side - (side - 1) / 2, cz = Math.floor(cell / side) - (side - 1) / 2;
        o.position.set(base.x + cx * 14.2, base.y + layer * 5.8, base.z + cz * 14.2); o.updateMatrix();
        im.setMatrixAt(k, o.matrix);
        im.setColorAt(k, col.set(b < nb[0] ? AGE_COL[2] : b < nb[0] + nb[1] ? AGE_COL[1] : AGE_COL[0]));
        this.pileOwner[k] = owner; k++;
      }
      return boxes;
    };
    const cTot = [0, 0, 0];
    for (let d = 0; d < ND; d++) {
      const i = (Nu + d) * 3; stack(this.dPile[d], [cnt[i], cnt[i + 1], cnt[i + 2]], 3, d);
      const j = (Nu + ND + d) * 3; cTot[0] += cnt[j]; cTot[1] += cnt[j + 1]; cTot[2] += cnt[j + 2];
    }
    stack(this.cPile, cTot, 5, -1);
    im.count = k; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.halo.material.opacity = Math.min(0.85, (cTot[1] + cTot[2]) / 4000);
  }
  // ------------------------------------------------------------ columnas de las unidades
  buildUnits() {
    const g = new THREE.CylinderGeometry(3, 3, 1, 10); g.translate(0, 0.5, 0);
    const im = this.units = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#fff' }), this.Nu);
    im.frustumCulled = false; this.scene.add(im);
    this.uH = new Float32Array(this.Nu); this.uHt = new Float32Array(this.Nu); this.uCol = new Uint8Array(this.Nu);
  }
  placeUnits(snap) {
    const im = this.units, o = new THREE.Object3D(), c = new THREE.Color();
    let moving = false;
    for (let i = 0; i < this.Nu; i++) {
      if (snap) this.uH[i] = this.uHt[i];
      const h = this.uH[i] += (this.uHt[i] - this.uH[i]) * 0.18;
      if (Math.abs(this.uHt[i] - h) > 0.05) moving = true;
      o.position.copy(this.uPos[i]); o.scale.set(this.sel?.type === 'del' && this.dOf[i] === this.sel.i ? 1.5 : 1, Math.max(0.3, h), this.sel?.type === 'del' && this.dOf[i] === this.sel.i ? 1.5 : 1); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, c.set(this.uHt[i] <= 0.001 ? '#334155' : AGE_COL[this.uCol[i]]));
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    return moving;
  }
  // ------------------------------------------------------------ partículas
  buildParticles() {
    const g = new THREE.OctahedronGeometry(4, 0);
    const im = this.parts = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.95, depthWrite: false }), MAXP);
    im.count = 0; im.frustumCulled = false; im.renderOrder = 5; this.scene.add(im);
    this.trips = new Map();                          // día → viajes
  }
  // ruta de un movimiento: lista de curvas
  route(a, b) {
    const Nu = this.Nu, ND = this.ND, C = this.cPos;
    const lvl = n => (n === -1 ? 'C0' : n < -1 ? 'F' : n < Nu ? 'U' : n < Nu + ND ? 'D' : 'C');
    const la = lvl(a), lb = lvl(b);
    const uOf = n => (n >= 0 && n < Nu ? n : n < -1 ? -2 - n : -1);
    const dOfN = n => (n >= 0 && n < Nu ? this.dOf[n] : n >= Nu && n < Nu + ND ? n - Nu : n >= Nu + ND ? n - Nu - ND : n < -1 ? this.dOf[-2 - n] : -1);
    const u = uOf(a) >= 0 ? uOf(a) : uOf(b), d = dOfN(a) >= 0 ? dOfN(a) : dOfN(b);
    const U = u >= 0 ? this.uPos[u] : null, D = this.dPos[d];
    const ch = [];
    const push = (A, B, k) => ch.push(this.arc(A, B, k));
    if (la === 'C0') { push(C, D, 0.16); push(D, U, 0.12); return ch; }                // asignación: Central → delegación → unidad
    if (lb === 'F') {                                                                 // concluyó: sube hasta Central y se archiva
      if (la === 'U') { push(U, D, 0.12); push(D, C, 0.16); }
      else if (la === 'D') push(D, C, 0.16);
      ch.push([C, C.clone().add(new THREE.Vector3(0, 70, 0)), C.clone().add(new THREE.Vector3(0, 120, 0))]);
      return ch;
    }
    if (la === 'U' && lb === 'D') push(U, D, 0.12);
    else if (la === 'U' && lb === 'C') { push(U, D, 0.12); push(D, C, 0.16); }
    else if (la === 'D' && lb === 'C') push(D, C, 0.16);
    else if (la === 'D' && lb === 'U') push(D, U, 0.12);
    else if (la === 'C' && lb === 'U') { push(C, D, 0.16); push(D, U, 0.12); }
    else if (la === 'C' && lb === 'D') push(C, D, 0.16);
    else return null;
    return ch;
  }
  tripsFor(day) {                                  // viajes que salen entre el día day y day+1 (registrados en el corte day+1)
    if (this.trips.has(day)) return this.trips.get(day);
    const f = this.flow?.[day + 1], out = [];
    if (f) {
      let s = 0;
      for (const [a, b, n, d] of f.mv) {
        const ch = this.route(a, b); if (!ch) continue;
        // un grupo grande se parte en varias partículas para que se vea el caudal
        const parts = Math.min(4, Math.ceil(n / 40));
        for (let p = 0; p < parts; p++) {
          const r = rnd((a * 73856093) ^ (b * 19349663) ^ (day * 83492791) ^ (p * 2654435761) ^ s++);
          const len = ch.reduce((x, q) => x + q[0].distanceTo(q[2]), 0);
          out.push({ ch, n: n / parts, col: DEC_COL[d] || '#cbd5e1', t0: day + 0.04 + 0.5 * r, dur: Math.min(0.9, 0.3 + len / 3500), len, a, b });
        }
      }
    }
    this.trips.set(day, out);
    return out;
  }
  placeParticles() {
    const im = this.parts, o = new THREE.Object3D(), c = new THREE.Color(), v = new THREE.Vector3();
    let k = 0;
    const t = this.t;
    for (const day of [Math.floor(t) - 1, Math.floor(t)]) {
      if (day < -1) continue;
      for (const tr of this.tripsFor(day)) {
        const u = (t - tr.t0) / tr.dur; if (u < 0 || u > 1 || k >= MAXP) continue;
        // posición en la cadena de curvas, proporcional a la longitud de cada tramo
        let acc = 0, x = u * tr.len, q = tr.ch[tr.ch.length - 1], uu = 1;
        for (const cq of tr.ch) { const L = cq[0].distanceTo(cq[2]); if (x <= acc + L) { q = cq; uu = (x - acc) / L; break; } acc += L; }
        this.at(q, uu, v);
        const dimmed = this.sel && !this.matchSel(tr);
        o.position.copy(v); o.scale.setScalar((0.7 + Math.cbrt(tr.n) * 0.42) * (dimmed ? 0.6 : 1) * this.pScale); o.rotation.set(t * 3, t * 2, 0); o.updateMatrix();
        im.setMatrixAt(k, o.matrix); im.setColorAt(k, c.set(dimmed ? '#334155' : tr.col)); k++;
      }
    }
    im.count = k; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.inFlight = k;
  }
  matchSel(tr) {
    const s = this.sel, Nu = this.Nu, ND = this.ND;
    if (s.type === 'central') return true;
    const dOfN = n => (n >= 0 && n < Nu ? this.dOf[n] : n >= Nu && n < Nu + ND ? n - Nu : n >= Nu + ND ? n - Nu - ND : n < -1 ? this.dOf[-2 - n] : -1);
    if (s.type === 'del') return dOfN(tr.a) === s.i || dOfN(tr.b) === s.i;
    if (s.type === 'unit') return tr.a === s.i || tr.b === s.i || tr.b === -2 - s.i;
    return true;
  }

  // ------------------------------------------------------------ datos
  setPlan(P) {
    if (P !== this.P || (P.flow?.length || 0) !== this.nDays) this.trips.clear();
    this.P = P; this.flow = P.flow || []; this.nDays = this.flow.length;
    this.applyDay(true);
  }
  maxT() { return Math.max(-1, this.nDays - 1); }
  setTime(t) {
    this.t = Math.max(-1, Math.min(this.maxT(), t));
    if (Math.floor(this.t) !== this.shownDay) this.applyDay();
    this.dirty = true;
  }
  snap(d) {                                        // corte del día d (o vacío antes de la asignación)
    const NN = this.Nu + 2 * this.ND;
    return d >= 0 && this.flow[d] ? this.flow[d].cnt : new Uint32Array(NN * 3);
  }
  applyDay(force) {
    const d = Math.floor(this.t); this.shownDay = d;
    const cnt = this.cnt = this.snap(d);
    for (let i = 0; i < this.Nu; i++) {
      const a = cnt[i * 3], b = cnt[i * 3 + 1], c = cnt[i * 3 + 2], n = a + b + c;
      this.uHt[i] = n * 0.55; this.uCol[i] = c > 0 ? 2 : b > 0 ? 1 : 0;
    }
    this.placePiles(cnt);
    this.paintDelegaciones(cnt);
    this.recolorStates();
    if (force) this.placeUnits(true);
  }
  // letrero y baliza de cada delegación: gris sin pendientes, verde agua en plazo, ámbar vencidas, rojo más del doble
  paintDelegaciones(cnt) {
    if (!this.dSem) return;
    const c = new THREE.Color();
    for (let d = 0; d < this.ND; d++) {
      const i = (this.Nu + d) * 3, n = cnt[i] + cnt[i + 1] + cnt[i + 2];
      this.dSem.setColorAt(d, c.set(!n ? '#64748b' : cnt[i + 2] ? AGE_COL[2] : cnt[i + 1] ? AGE_COL[1] : AGE_COL[0]));
    }
    this.dSem.instanceColor.needsUpdate = true;
  }
  // resumen por estado: quién tiene las peticiones y cuántas van vencidas
  stateSummary() {
    const Nu = this.Nu, ND = this.ND, cnt = this.cnt, by = {};
    for (let d = 0; d < ND; d++) by[this.U.delegaciones[d].cve] = { um: [0, 0, 0], del: [0, 0, 0], oc: [0, 0, 0] };
    for (let i = 0; i < Nu; i++) { const s = by[this.U.units[i].cve].um; for (let k = 0; k < 3; k++) s[k] += cnt[i * 3 + k]; }
    for (let d = 0; d < ND; d++) { const s = by[this.U.delegaciones[d].cve]; for (let k = 0; k < 3; k++) { s.del[k] += cnt[(Nu + d) * 3 + k]; s.oc[k] += cnt[(Nu + ND + d) * 3 + k]; } }
    return by;
  }
  recolorStates() {
    const by = this.summary = this.stateSummary();
    const sum = a => a[0] + a[1] + a[2];
    let maxV = 1;
    for (const s of Object.values(by)) maxV = Math.max(maxV, s.um[1] + s.um[2] + s.del[1] + s.del[2] + s.oc[1] + s.oc[2]);
    const base = new THREE.Color('#1e2a36');
    for (const [cve, st] of Object.entries(this.states)) {
      const s = by[cve]; if (!s) continue;
      const tot = sum(s.um) + sum(s.del) + sum(s.oc);
      if (!tot) { st.target.copy(base); continue; }
      if (this.colorMode === 'quien') {
        const who = ['um', 'del', 'oc'].reduce((a, b) => (sum(s[b]) > sum(s[a]) ? b : a));
        st.target.copy(base).lerp(new THREE.Color(ACT_COL[who]), 0.25 + 0.5 * Math.min(1, tot / 1500));
      } else {
        const venc = s.um[1] + s.um[2] + s.del[1] + s.del[2] + s.oc[1] + s.oc[2];
        const f = Math.sqrt(venc / maxV);
        st.target.copy(new THREE.Color('#1f3b37')).lerp(new THREE.Color(f > 0.5 ? '#b91c1c' : '#a16207'), Math.min(1, f * 1.4));
      }
      if (this.sel?.type === 'del' && this.U.delegaciones[this.sel.i].cve !== cve) st.target.lerp(new THREE.Color('#0f151c'), 0.55);
    }
    this.anim = 1;
  }
  setColorMode(m) { this.colorMode = m; this.recolorStates(); this.dirty = true; }
  select(s, fly = true) {
    this.sel = s; this.recolorStates(); this.placeDelegaciones(); this.dirty = true;
    if (!fly) return;
    if (!s) return this.home();
    if (s.type === 'central') return this.flyTo(this.cPos.clone().add(new THREE.Vector3(30, 60, 0)), 700);
    if (s.type === 'del') { const e = this.dEst[s.i]; return this.flyTo(P3(e.label[0], e.label[1], HS), THREE.MathUtils.clamp(Math.sqrt(e.area_km2) * 5, 520, 2400) * this.aspectK()); }
    if (s.type === 'unit') return this.flyTo(this.uPos[s.i].clone(), 420 * this.aspectK());
  }

  // ------------------------------------------------------------ cámara
  aspectK() { const a = this.camera.aspect || 1.6; return a < 1.2 ? Math.min(2.1, 1.35 / a) : 1; }
  home(now = false) {
    const a = this.camera.aspect || 1.6, f = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const need = Math.max(this.mapS.z * 0.56 / f, this.mapS.x * 0.5 / (f * a));
    this.flyTo(this.mapC.clone().setY(0).add(new THREE.Vector3(0, 0, 60)), need, now);
  }
  flyTo(tgt, dist, now = false) {
    const pos = tgt.clone().add(DIR.clone().multiplyScalar(dist));
    if (now) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update(); this.dirty = true; return; }
    this.fly = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, k: 0 };
  }
  resize() {
    const w = this.box.clientWidth, h = this.box.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  project(p) {
    const v = p.clone().project(this.camera);
    return [(v.x + 1) / 2 * this.box.clientWidth, (1 - v.y) / 2 * this.box.clientHeight, v.z < 1 && v.z > -1];
  }
  bindPointer() {
    const el = this.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down = null;
    const meshes = () => Object.values(this.states).flatMap(s => s.meshes);
    const towerMeshes = []; this.tower.traverse(o => { if (o.isMesh && o.visible) towerMeshes.push(o); });
    const hit = ev => {
      const r = el.getBoundingClientRect();
      v.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      if (ray.intersectObjects(towerMeshes, false)[0]) return { type: 'central' };
      this.piles.computeBoundingSphere();
      const pl = this.piles.count && ray.intersectObject(this.piles, false)[0];
      if (pl) { const ow = this.pileOwner[pl.instanceId]; return ow < 0 ? { type: 'central' } : { type: 'del', i: ow }; }
      this.units.computeBoundingSphere();
      const u = ray.intersectObject(this.units, false)[0];
      if (u && this.uHt[u.instanceId] > 0.5) return { type: 'unit', i: u.instanceId };
      const dm = ray.intersectObjects(this.dParts, false)[0];
      if (dm) return { type: 'del', i: dm.instanceId };
      const m = ray.intersectObjects(meshes(), false)[0];
      if (m) return { type: 'del', i: this.U.delegaciones.findIndex(d => d.cve === m.object.userData.cve) };
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
    this.pScale = THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target) / 2400, 0.35, 1.8);
    if (this.anim > 0) {
      this.anim = Math.max(0, this.anim - dt);
      for (const st of Object.values(this.states)) { st.cur.lerp(st.target, Math.min(1, dt * 6)); st.top.color.copy(st.cur); st.side.color.copy(st.cur).multiplyScalar(0.6); }
      moving = true;
    }
    if (this.placeUnits(false)) moving = true;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    if (this.halo.material.opacity > 0) { this.halo.scale.setScalar(1 + 0.08 * pulse); moving = true; }
    if (playing || this.dirty || moving || this._lastT !== this.t) {
      this.placeParticles(); this._lastT = this.t;
      this.renderer.render(this.scene, this.camera); this.dirty = false; return true;
    }
    return false;
  }
}

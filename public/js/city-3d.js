// "Vienna from above" — a 3D district model rendered with Three.js.
//
// A scale-accurate 2D map of Vienna's 23 districts lies flat on the ground
// (real boundaries from the city's open geodata, pre-projected in
// public/data/bezirke.json). From the true centroid of each district a tower
// rises:
//   - height = car density (cars / 1,000 residents)
//   - colour = electric share, on a STEPPED 5-class sequential scale
//     (light grey -> teal -> deep blue) so districts read as clear classes
//     and can be compared at a glance.
// A year slider animates the colour class; clicking a tower opens an info panel
// with the full drive-type breakdown (combustion / hybrid / electric).
//
// NOTE ON DATA: the boundary geometry is real (Stadt Wien OGD). The per-district
// density / drive-mix figures are NOT available in the MA23 city-wide tables
// (3.1.8-3.1.10); the values below are illustrative placeholders that demonstrate
// the spatial-inequality view. Real per-district figures would come from
// data.gv.at ("Pkw-Bestand nach Kilowatt Leistung - Bezirke Wien").

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Per-district values keyed by district number:
//   density = cars/1,000 residents,
//   ev  = electric share % in 2024, hyb = hybrid share % in 2024
//   (fossil share = 100 - ev - hyb),
//   wealth = 0..1 governing how early the electric ramp starts.
const DATA = {
  1:  { density: 210, ev: 9.0, hyb: 12, wealth: 1.00 },
  2:  { density: 360, ev: 4.5, hyb: 7,  wealth: 0.50 },
  3:  { density: 330, ev: 5.5, hyb: 8,  wealth: 0.62 },
  4:  { density: 280, ev: 6.5, hyb: 9,  wealth: 0.75 },
  5:  { density: 300, ev: 4.0, hyb: 6,  wealth: 0.45 },
  6:  { density: 270, ev: 5.5, hyb: 8,  wealth: 0.65 },
  7:  { density: 260, ev: 6.0, hyb: 9,  wealth: 0.70 },
  8:  { density: 280, ev: 6.2, hyb: 9,  wealth: 0.72 },
  9:  { density: 290, ev: 6.0, hyb: 8,  wealth: 0.68 },
  10: { density: 430, ev: 3.0, hyb: 5,  wealth: 0.30 },
  11: { density: 450, ev: 2.8, hyb: 5,  wealth: 0.28 },
  12: { density: 400, ev: 3.5, hyb: 6,  wealth: 0.40 },
  13: { density: 480, ev: 7.5, hyb: 11, wealth: 0.90 },
  14: { density: 460, ev: 5.0, hyb: 8,  wealth: 0.60 },
  15: { density: 380, ev: 2.5, hyb: 5,  wealth: 0.25 },
  16: { density: 410, ev: 3.2, hyb: 6,  wealth: 0.35 },
  17: { density: 420, ev: 4.0, hyb: 6,  wealth: 0.45 },
  18: { density: 440, ev: 6.5, hyb: 10, wealth: 0.80 },
  19: { density: 470, ev: 7.8, hyb: 11, wealth: 0.92 },
  20: { density: 370, ev: 3.0, hyb: 5,  wealth: 0.35 },
  21: { density: 500, ev: 3.8, hyb: 6,  wealth: 0.40 },
  22: { density: 540, ev: 4.5, hyb: 7,  wealth: 0.42 },
  23: { density: 520, ev: 5.2, hyb: 8,  wealth: 0.50 },
};

// Stepped 5-class colour scale for the electric share (%). Each class is a solid
// colour, so districts group visually. Combustion/hybrid/electric swatch colours
// (#888780 / #1d9e75 / #378add) are reused only in the click-info breakdown.
const EV_CLASSES = [
  { max: 2,        color: new THREE.Color('#d9d7cf') },
  { max: 4,        color: new THREE.Color('#9cc6c0') },
  { max: 6,        color: new THREE.Color('#4fa8b8') },
  { max: 8,        color: new THREE.Color('#2f7fc7') },
  { max: Infinity, color: new THREE.Color('#1a4f9c') },
];
function colorClass(ev) {
  for (const c of EV_CLASSES) if (ev < c.max) return c.color;
  return EV_CLASSES[EV_CLASSES.length - 1].color;
}

const BOX_W    = 0.42;                   // tower footprint — slim, so the map reads
const MIN_D = 210, MAX_D = 540;          // density range -> tower height
const MIN_H = 0.5, MAX_H = 4.0;
const YEAR_MIN = 2018, YEAR_MAX = 2024;

const heightFor = (d) => MIN_H + (d.density - MIN_D) / (MAX_D - MIN_D) * (MAX_H - MIN_H);

async function initCity3D() {
  const container = document.getElementById('city3d-canvas');
  if (!container) return;
  const W = container.clientWidth, H = container.clientHeight;
  if (!W || !H) return;

  let geo, emob;
  try {
    [geo, emob] = await Promise.all([
      fetch('data/bezirke.json').then((r) => r.json()),
      fetch('data/vienna_emobility.json').then((r) => r.json()),
    ]);
  } catch (e) {
    console.error('city-3d: could not load data', e);
    return;
  }

  // Real city-wide Pkw electric/hybrid fleet share per year (from MA23 Tab. 3.1.8).
  // The temporal trajectory is REAL; only the spatial spread across districts is the
  // illustrative placeholder. A district's value in year Y is its 2024 placeholder
  // scaled by the real city-wide share in Y relative to 2024 — so 2018 shows the real
  // (small, but non-zero) ~0.3 % electric / ~1.3 % hybrid, not zero.
  const cityShare = {};
  for (const row of emob.bestand.wide) {
    const F = row.Pkw_Fossil || 0, Hy = row.Pkw_Hybrid || 0, E = row.Pkw_Elektro || 0;
    const T = F + Hy + E;
    if (T > 0) cityShare[row.year] = { e: (E / T) * 100, h: (Hy / T) * 100 };
  }
  const refE = cityShare[YEAR_MAX].e, refH = cityShare[YEAR_MAX].h;
  const factorsFor = (year) => {
    const c = cityShare[year] || cityShare[YEAR_MAX];
    return { fe: c.e / refE, fh: c.h / refH };
  };
  const evAtYear = (d, year) => d.ev * factorsFor(year).fe;
  const sharesAtYear = (d, year) => {
    const { fe, fh } = factorsFor(year);
    const electric = d.ev * fe;
    const hybrid = d.hyb * fh;
    return { fossil: Math.max(0, 100 - electric - hybrid), hybrid, electric };
  };

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(dark ? '#252522' : '#eeede9');

  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(10, 11, 13);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 7;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 0.5, 0);

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(9, 16, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12; key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;   key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.0004;
  scene.add(key);

  // Base plate under the map
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: dark ? '#1f1f1d' : '#e3e1da', roughness: 1 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.02;
  base.receiveShadow = true;
  scene.add(base);

  // ---- Flat district map (fills + outlines + number labels) --------------
  const fillMat = new THREE.MeshStandardMaterial({
    color: dark ? '#33332f' : '#dad8d0', roughness: 1, metalness: 0,
  });
  const lineColor = new THREE.Color(dark ? '#6a6862' : '#9a9993');

  function makeLabelSprite(num) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 36px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = dark ? '#1c1c1a' : '#ffffff';
    ctx.strokeText(num, 32, 34);
    ctx.fillStyle = dark ? '#e8e6df' : '#3a3a36';
    ctx.fillText(num, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.62, 0.62, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  const towers = [];   // one record per district
  const boxGeom = new THREE.BoxGeometry(BOX_W, 1, BOX_W);

  for (const f of geo.features) {
    const data = DATA[f.n];
    if (!data) continue;

    // filled shape (outer ring + holes), laid flat: shape XY (x,-z) -> scene (x,0,z)
    const shape = new THREE.Shape(f.rings[0].map(([x, z]) => new THREE.Vector2(x, -z)));
    for (let i = 1; i < f.rings.length; i++) {
      shape.holes.push(new THREE.Path(f.rings[i].map(([x, z]) => new THREE.Vector2(x, -z))));
    }
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.receiveShadow = true;
    scene.add(fill);

    // crisp boundary outlines
    for (const ring of f.rings) {
      const pts = ring.map(([x, z]) => new THREE.Vector3(x, 0.015, z));
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: lineColor })));
    }

    // district-number label (always-on-top map key)
    const label = makeLabelSprite(f.n);
    label.position.set(f.centroid[0], 0.32, f.centroid[1]);
    scene.add(label);

    // tower rising from the real centroid; fixed height, colour set per year
    const rec = { n: f.n, name: f.name, ...data };
    const h = heightFor(data);
    const mesh = new THREE.Mesh(boxGeom, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }));
    mesh.position.set(f.centroid[0], h / 2, f.centroid[1]);
    mesh.scale.y = h;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.district = rec;
    rec.mesh = mesh;
    scene.add(mesh);
    towers.push(rec);
  }

  function update(year) {
    for (const r of towers) r.mesh.material.color.copy(colorClass(evAtYear(r, year)));
  }

  // ---- Year slider -------------------------------------------------------
  const slider = document.getElementById('city-year');
  const yearOut = document.getElementById('city-year-out');
  const infoYear = document.getElementById('info-year');
  let currentYear = YEAR_MAX, selected = null;
  update(currentYear);

  slider.addEventListener('input', () => {
    currentYear = +slider.value;
    yearOut.textContent = currentYear;
    if (infoYear) infoYear.textContent = currentYear;
    update(currentYear);
    if (selected) fillInfo(selected, currentYear);
  });

  // ---- Raycasting click -> info panel -----------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const info = document.getElementById('city3d-info');
  const hint = document.getElementById('city3d-hint');

  function fillInfo(r, year) {
    const s = sharesAtYear(r, year);
    document.getElementById('info-name').textContent = r.n + '. ' + r.name;
    document.getElementById('info-density').textContent = r.density + ' / 1,000';
    document.getElementById('info-fossil').textContent = s.fossil.toFixed(1) + ' %';
    document.getElementById('info-hybrid').textContent = s.hybrid.toFixed(1) + ' %';
    document.getElementById('info-electric').textContent = s.electric.toFixed(1) + ' %';
  }

  let downXY = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved > 6) return; // drag, not a click

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(towers.map((r) => r.mesh));

    if (selected) selected.mesh.material.emissive.setHex(0x000000);
    if (hits.length) {
      selected = hits[0].object.userData.district;
      selected.mesh.material.emissive.setHex(0x2a2a2a);
      fillInfo(selected, currentYear);
      info.classList.add('visible');
      hint.style.display = 'none';
    } else {
      selected = null;
      info.classList.remove('visible');
    }
  });

  // ---- Resize ------------------------------------------------------------
  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
}

// Lazy init: only build the scene once the section scrolls into view.
const section = document.getElementById('raum');
if (section) {
  let started = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !started) {
        started = true;
        io.disconnect();
        requestAnimationFrame(initCity3D);
      }
    }
  }, { rootMargin: '0px 0px -20% 0px' });
  io.observe(section);
}

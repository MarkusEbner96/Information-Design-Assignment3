// "Vienna from above" — a 3D district model rendered with Three.js.
//
// A scale-accurate 2D map of Vienna's 23 districts lies flat on the ground
// (real boundaries from the city's open geodata, pre-projected in
// public/data/bezirke.json). From the true centroid of each district a tower
// rises:
//   - height = car density   (scale.y)
//   - colour = electric share (grey -> blue lerp)
// A year slider animates the colour; clicking a tower opens an info panel.
//
// NOTE ON DATA: the boundary geometry is real (Stadt Wien OGD). The per-district
// density / EV figures are NOT available in the MA23 city-wide tables
// (3.1.8-3.1.10); the values below are illustrative placeholders that demonstrate
// the spatial-inequality view. Real per-district figures would come from
// data.gv.at ("Pkw-Bestand nach Kilowatt Leistung - Bezirke Wien").

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Per-district values keyed by district number:
//   density = cars/1,000 residents, ev = electric share % in 2024,
//   wealth  = 0..1 governing how early the EV ramp starts (higher = earlier).
const DATA = {
  1:  { density: 210, ev: 9.0, wealth: 1.00 },
  2:  { density: 360, ev: 4.5, wealth: 0.50 },
  3:  { density: 330, ev: 5.5, wealth: 0.62 },
  4:  { density: 280, ev: 6.5, wealth: 0.75 },
  5:  { density: 300, ev: 4.0, wealth: 0.45 },
  6:  { density: 270, ev: 5.5, wealth: 0.65 },
  7:  { density: 260, ev: 6.0, wealth: 0.70 },
  8:  { density: 280, ev: 6.2, wealth: 0.72 },
  9:  { density: 290, ev: 6.0, wealth: 0.68 },
  10: { density: 430, ev: 3.0, wealth: 0.30 },
  11: { density: 450, ev: 2.8, wealth: 0.28 },
  12: { density: 400, ev: 3.5, wealth: 0.40 },
  13: { density: 480, ev: 7.5, wealth: 0.90 },
  14: { density: 460, ev: 5.0, wealth: 0.60 },
  15: { density: 380, ev: 2.5, wealth: 0.25 },
  16: { density: 410, ev: 3.2, wealth: 0.35 },
  17: { density: 420, ev: 4.0, wealth: 0.45 },
  18: { density: 440, ev: 6.5, wealth: 0.80 },
  19: { density: 470, ev: 7.8, wealth: 0.92 },
  20: { density: 370, ev: 3.0, wealth: 0.35 },
  21: { density: 500, ev: 3.8, wealth: 0.40 },
  22: { density: 540, ev: 4.5, wealth: 0.42 },
  23: { density: 520, ev: 5.2, wealth: 0.50 },
};

const BOX_W    = 0.36;                   // tower footprint — slim, so the map reads
const MIN_D = 210, MAX_D = 540;          // density range -> tower height
const MIN_H = 0.5, MAX_H = 4.0;
const YEAR_MIN = 2018, YEAR_MAX = 2024;
const COL_GREY = new THREE.Color('#888780');
const COL_BLUE = new THREE.Color('#378add');

const heightFor = (d) => MIN_H + (d.density - MIN_D) / (MAX_D - MIN_D) * (MAX_H - MIN_H);

// EV share at a given year: poorer districts ramp later (curve shifted).
function evAtYear(d, year) {
  const t = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
  const exponent = 1 + (1 - d.wealth) * 2.2;
  return d.ev * Math.pow(Math.max(0, Math.min(1, t)), exponent);
}
function colorFor(evShare) {
  const tNorm = Math.max(0, Math.min(1, (evShare - 2) / (9 - 2)));
  return COL_GREY.clone().lerp(COL_BLUE, tNorm);
}

async function initCity3D() {
  const container = document.getElementById('city3d-canvas');
  if (!container) return;
  const W = container.clientWidth, H = container.clientHeight;
  if (!W || !H) return;

  let geo;
  try {
    geo = await (await fetch('data/bezirke.json')).json();
  } catch (e) {
    console.error('city-3d: could not load bezirke.json', e);
    return;
  }

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

  const towers = [];
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
    fill.position.y = 0.0;
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

    // tower rising from the real centroid
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
    const mesh = new THREE.Mesh(boxGeom, mat);
    mesh.position.set(f.centroid[0], 0, f.centroid[1]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { n: f.n, name: f.name, ...data };
    scene.add(mesh);
    towers.push(mesh);
  }

  function update(year) {
    for (const m of towers) {
      const h = heightFor(m.userData);
      m.scale.y = h;
      m.position.y = h / 2;
      m.material.color.copy(colorFor(evAtYear(m.userData, year)));
    }
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
    infoYear.textContent = currentYear;
    update(currentYear);
    if (selected) fillInfo(selected.userData, currentYear);
  });

  // ---- Raycasting click -> info panel -----------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const info = document.getElementById('city3d-info');
  const hint = document.getElementById('city3d-hint');

  function fillInfo(d, year) {
    document.getElementById('info-name').textContent = d.n + '. ' + d.name;
    document.getElementById('info-density').textContent = d.density + ' / 1,000';
    document.getElementById('info-ev').textContent = evAtYear(d, year).toFixed(1) + ' %';
    document.getElementById('info-ev24').textContent = d.ev.toFixed(1) + ' %';
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
    const hits = raycaster.intersectObjects(towers);

    if (selected) selected.material.emissive.setHex(0x000000);
    if (hits.length) {
      selected = hits[0].object;
      selected.material.emissive.setHex(0x333333);
      fillInfo(selected.userData, currentYear);
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

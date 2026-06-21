// Build a compact, pre-projected district map for the 3D "Vienna from above" view.
//
// Input : public/data/bezirke_raw.json   (Vienna OGD WFS export, EPSG:4326 lon/lat)
// Output: public/data/bezirke.json        (scene-space x/z rings + centroids)
//
// Steps: equirectangular projection (centred on the city, cos-lat corrected) ->
// Douglas-Peucker simplification -> uniform scale into scene units -> rounding.
//
// Re-run with:  node scripts/build_districts.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'public/data/bezirke_raw.json';
const OUT = 'public/data/bezirke.json';
const TOLERANCE = 0.00028;   // simplification tolerance, in projected (degree-ish) units
const TARGET = 9;            // half-extent of the map in scene units

const raw = JSON.parse(readFileSync(SRC, 'utf8'));

// --- projection: lon/lat -> local planar metres-ish, centred on the bbox ---
let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const f of raw.features) {
  for (const ring of f.geometry.coordinates) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
  }
}
const lon0 = (minLon + maxLon) / 2;
const lat0 = (minLat + maxLat) / 2;
const cosLat = Math.cos((lat0 * Math.PI) / 180);
const project = ([lon, lat]) => [(lon - lon0) * cosLat, (lat - lat0)]; // (x, north)

// --- Douglas-Peucker simplification ---------------------------------------
function perpDist(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) {
    const left = simplify(pts.slice(0, idx + 1), tol);
    const right = simplify(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

// --- area-weighted polygon centroid (on the outer ring) -------------------
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) { // degenerate fallback: average
    const m = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    return [m[0] / ring.length, m[1] / ring.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// --- pass 1: project + simplify, track extent -----------------------------
let half = 0;
const feats = raw.features.map((f) => {
  const rings = f.geometry.coordinates.map((ring) => simplify(ring.map(project), TOLERANCE));
  const c = centroid(rings[0]);
  for (const ring of rings) for (const [x, y] of ring) half = Math.max(half, Math.abs(x), Math.abs(y));
  return { n: f.properties.BEZNR, name: f.properties.NAMEK, rings, c };
});

// --- pass 2: uniform scale into scene units, map north -> -z, round -------
const scale = TARGET / half;
const r3 = (v) => Math.round(v * 1000) / 1000;
const toScene = ([x, y]) => [r3(x * scale), r3(-y * scale)]; // (x, z)

const out = {
  meta: {
    source: 'Stadt Wien OGD (WFS BEZIRKSGRENZEOGD, EPSG:4326)',
    projection: 'equirectangular, cos-lat corrected, centred + uniformly scaled',
    scaleUnitsPerDegree: r3(scale),
  },
  features: feats
    .map((f) => ({
      n: f.n,
      name: f.name,
      centroid: toScene(f.c),
      rings: f.rings.map((ring) => ring.map(toScene)),
    }))
    .sort((a, b) => a.n - b.n),
};

writeFileSync(OUT, JSON.stringify(out));

// --- report ---------------------------------------------------------------
const totalPts = out.features.reduce((s, f) => s + f.rings.reduce((t, r) => t + r.length, 0), 0);
const bytes = readFileSync(OUT).length;
console.log(`Wrote ${OUT}: ${out.features.length} districts, ${totalPts} points, ${(bytes / 1024).toFixed(1)} KB`);

// min distance between centroids (informs tower footprint)
let minDist = Infinity, pair = '';
for (let i = 0; i < out.features.length; i++)
  for (let j = i + 1; j < out.features.length; j++) {
    const a = out.features[i].centroid, b = out.features[j].centroid;
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < minDist) { minDist = d; pair = `${out.features[i].n}<->${out.features[j].n}`; }
  }
console.log(`min centroid distance: ${minDist.toFixed(2)} units (${pair})`);

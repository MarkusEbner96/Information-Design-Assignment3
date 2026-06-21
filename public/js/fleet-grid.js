(async function () {
  const TOTAL = 200; // number of car icons in the grid

  // Load the Pkw fleet-stock rows from the shared dataset.
  let bestandRows;
  try {
    const res  = await fetch('data/vienna_emobility.json');
    const json = await res.json();
    bestandRows = json.bestand.wide; // array of { year, Pkw_Fossil, Pkw_Hybrid, Pkw_Elektro, … }
  } catch (e) {
    console.error('fleet-grid: could not load vienna_emobility.json', e);
    return;
  }

  // Build two lookup tables keyed by year:
  //   kd[year] = [fossilIcons, hybridIcons, electricIcons]  (scaled to TOTAL)
  //   rc[year] = { F, H, E }  (actual vehicle counts for the stat cards)
  const kd = {};
  const rc = {};

  for (const row of bestandRows) {
    const F = row.Pkw_Fossil  || 0;
    const H = row.Pkw_Hybrid  || 0;
    const E = row.Pkw_Elektro || 0;
    const T = F + H + E;
    rc[row.year] = { F, H, E };
    kd[row.year] = largestRemainder([F, H, E], T, TOTAL);
  }

  const years   = bestandRows.map(r => r.year).sort((a, b) => a - b);
  const minYear = years[0];
  const maxYear = years[years.length - 1];

  // Sync slider range to whatever years the dataset covers.
  const sliderEl = document.getElementById('fg-slider');
  if (!sliderEl) return;
  sliderEl.min   = minYear;
  sliderEl.max   = maxYear;
  sliderEl.value = minYear;

  // Distributes n slots across vals proportionally. Uses the largest-remainder
  // method so the result always sums to exactly n without rounding drift.
  function largestRemainder(vals, total, n) {
    if (total === 0) return vals.map(() => 0);
    const floats = vals.map(v => (v / total) * n);
    const floors = floats.map(Math.floor);
    const needed = n - floors.reduce((a, b) => a + b, 0); // how many slots are left after flooring
    // Give the remaining slots to the values with the largest fractional remainders.
    const order = floats
      .map((f, i) => ({ i, rem: f - floors[i] }))
      .sort((a, b) => b.rem - a.rem);
    for (let k = 0; k < needed; k++) floors[order[k].i]++;
    return floors;
  }

  // Deterministic Fisher-Yates shuffle using a simple LCG so the icon layout
  // is stable across page loads and looks organically spread rather than sorted.
  function seededShuffle(arr, seed) {
    let s = seed >>> 0;
    const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // order[i] = which grid slot position gets assigned to icon i.
  // Fixed seed 42 gives the same visual layout on every render.
  const order  = seededShuffle([...Array(TOTAL).keys()], 42);
  const gridEl = document.getElementById('fg-grid');
  const carEls = [];

  // Create all 200 car elements once; their CSS class is updated in-place later.
  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement('div');
    d.className = 'fg-car fossil';
    d.innerHTML = '<svg viewBox="0 0 28 13" width="28" height="13">'
      + '<rect class="fg-body" x="0" y="5" width="28" height="8" rx="2"/>'  // car body
      + '<path class="fg-roof" d="M5,5 L8,1 L20,1 L23,5 Z"/>'              // windscreen/roof trapezoid
      + '</svg>';
    gridEl.appendChild(d);
    carEls.push(d);
  }

  let curTypes = Array(TOTAL).fill('fossil'); // logical state — what each icon *should* show
  let pending   = [];   // setTimeout IDs for in-progress stagger animations
  let playing   = false;
  let playTimer = null;
  let lastYear  = minYear;

  // Cancels any running stagger animation and immediately syncs the DOM to curTypes.
  // This is crucial: curTypes is updated synchronously at the end of applyYear, so
  // if the user moves the slider before all staggered timeouts fire, some icons will
  // visually lag behind. Forcing a sync here means the next diff is always correct.
  function clearPending() {
    pending.forEach(clearTimeout);
    pending = [];
    for (let i = 0; i < TOTAL; i++) {
      carEls[i].className = 'fg-car ' + curTypes[i];
    }
  }

  function fmt(n) { return n.toLocaleString('en-GB'); }

  function applyYear(year, animate) {
    year = parseInt(year);
    document.getElementById('fg-yr').textContent   = year;
    document.getElementById('fg-yout').textContent = year;
    sliderEl.value = year;

    const [f, h, e] = kd[year];
    const counts    = rc[year];
    const total     = counts.F + counts.H + counts.E;

    // Build the target type array: first e slots → electric, next h → hybrid, rest → fossil.
    // order[] maps logical slots to visual grid positions so the layout looks organic.
    const newTypes = Array(TOTAL).fill('fossil');
    for (let i = 0; i < e; i++)     newTypes[order[i]] = 'electric';
    for (let i = e; i < e + h; i++) newTypes[order[i]] = 'hybrid';

    // Only update icons that actually change color — avoids unnecessary DOM writes.
    const changed = [];
    for (let i = 0; i < TOTAL; i++) if (newTypes[i] !== curTypes[i]) changed.push(i);

    clearPending(); // cancel previous animation before starting a new one

    if (!animate || changed.length > 40) {
      // Large jump (slider dragged far) or autoplay first frame → instant update.
      changed.forEach(idx => { carEls[idx].className = 'fg-car ' + newTypes[idx]; });
    } else {
      // Small step (≤ 2 years) → stagger the updates so each car visibly "switches".
      const sc    = seededShuffle(changed, year * 7 + changed.length); // randomize order
      const delay = changed.length <= 10 ? 40 : 18; // slower for tiny changes, faster for many
      sc.forEach((idx, i) => {
        const t = setTimeout(() => {
          carEls[idx].className = 'fg-car ' + newTypes[idx];
          carEls[idx].classList.add('popping');                              // CSS scale-up keyframe
          setTimeout(() => carEls[idx].classList.remove('popping'), 220);   // clean up after animation
        }, i * delay);
        pending.push(t); // track so clearPending() can cancel if slider moves again
      });
    }

    // Update logical state immediately — clearPending() uses this for its sync.
    curTypes = newTypes;
    lastYear = year;

    // Update the three stat cards with real percentages and vehicle counts.
    document.getElementById('fg-fp').textContent = (counts.F / total * 100).toFixed(1) + '%';
    document.getElementById('fg-hp').textContent = (counts.H / total * 100).toFixed(1) + '%';
    document.getElementById('fg-ep').textContent = (counts.E / total * 100).toFixed(1) + '%';
    document.getElementById('fg-fn').textContent = fmt(counts.F) + ' cars';
    document.getElementById('fg-hn').textContent = fmt(counts.H) + ' cars';
    document.getElementById('fg-en').textContent = fmt(counts.E) + ' cars';
  }

  // Animate only when the slider moves by 1–2 years; large drags get instant updates.
  sliderEl.addEventListener('input', ev => {
    const y = parseInt(ev.target.value);
    applyYear(y, Math.abs(y - lastYear) <= 2);
  });

  // Inline SVG paths for the play/pause icon — swapped on button click.
  const picoEl     = document.getElementById('fg-pico');
  const PLAY_PATH  = '<polygon points="3,2 11,7 3,12" fill="var(--text-soft)"/>';
  const PAUSE_PATH = '<rect x="2" y="2" width="4" height="10" fill="var(--text-soft)"/>'
                   + '<rect x="8" y="2" width="4" height="10" fill="var(--text-soft)"/>';

  function stopPlay() {
    playing = false;
    picoEl.innerHTML = PLAY_PATH;
    clearInterval(playTimer);
  }

  function startPlay() {
    playing = true;
    picoEl.innerHTML = PAUSE_PATH;
    // If already at the end, restart from the beginning.
    let y = lastYear >= maxYear ? minYear : lastYear;
    if (y === minYear) applyYear(minYear, false); // jump to start instantly
    playTimer = setInterval(() => {
      y++;
      if (!kd[y]) { stopPlay(); return; } // guard against gaps in the data
      applyYear(y, true);
      if (y >= maxYear) stopPlay();
    }, 900); // 900ms per year step
  }

  document.getElementById('fg-pbtn').addEventListener('click', () => playing ? stopPlay() : startPlay());

  applyYear(minYear, false); // render initial state (2011) without animation
})();

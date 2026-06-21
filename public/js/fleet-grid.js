(async function () {
  const TOTAL = 200;

  let bestandRows;
  try {
    const res = await fetch('data/vienna_emobility.json');
    const json = await res.json();
    bestandRows = json.bestand.wide;
  } catch (e) {
    console.error('fleet-grid: could not load vienna_emobility.json', e);
    return;
  }

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

  const sliderEl = document.getElementById('fg-slider');
  if (!sliderEl) return;
  sliderEl.min   = minYear;
  sliderEl.max   = maxYear;
  sliderEl.value = minYear;

  function largestRemainder(vals, total, n) {
    if (total === 0) return vals.map(() => 0);
    const floats = vals.map(v => (v / total) * n);
    const floors = floats.map(Math.floor);
    const needed = n - floors.reduce((a, b) => a + b, 0);
    const order  = floats
      .map((f, i) => ({ i, rem: f - floors[i] }))
      .sort((a, b) => b.rem - a.rem);
    for (let k = 0; k < needed; k++) floors[order[k].i]++;
    return floors;
  }

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

  const order  = seededShuffle([...Array(TOTAL).keys()], 42);
  const gridEl = document.getElementById('fg-grid');
  const carEls = [];

  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement('div');
    d.className = 'fg-car fossil';
    d.innerHTML = '<svg viewBox="0 0 28 13" width="28" height="13">'
      + '<rect class="fg-body" x="0" y="5" width="28" height="8" rx="2"/>'
      + '<path class="fg-roof" d="M5,5 L8,1 L20,1 L23,5 Z"/>'
      + '</svg>';
    gridEl.appendChild(d);
    carEls.push(d);
  }

  let curTypes = Array(TOTAL).fill('fossil');
  let pending   = [];
  let playing   = false;
  let playTimer = null;
  let lastYear  = minYear;

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

    const newTypes = Array(TOTAL).fill('fossil');
    for (let i = 0; i < e; i++)     newTypes[order[i]] = 'electric';
    for (let i = e; i < e + h; i++) newTypes[order[i]] = 'hybrid';

    const changed = [];
    for (let i = 0; i < TOTAL; i++) if (newTypes[i] !== curTypes[i]) changed.push(i);

    clearPending();

    if (!animate || changed.length > 40) {
      changed.forEach(idx => { carEls[idx].className = 'fg-car ' + newTypes[idx]; });
    } else {
      const sc    = seededShuffle(changed, year * 7 + changed.length);
      const delay = changed.length <= 10 ? 40 : 18;
      sc.forEach((idx, i) => {
        const t = setTimeout(() => {
          carEls[idx].className = 'fg-car ' + newTypes[idx];
          carEls[idx].classList.add('popping');
          setTimeout(() => carEls[idx].classList.remove('popping'), 220);
        }, i * delay);
        pending.push(t);
      });
    }

    curTypes = newTypes;
    lastYear = year;

    document.getElementById('fg-fp').textContent = (counts.F / total * 100).toFixed(1) + '%';
    document.getElementById('fg-hp').textContent = (counts.H / total * 100).toFixed(1) + '%';
    document.getElementById('fg-ep').textContent = (counts.E / total * 100).toFixed(1) + '%';
    document.getElementById('fg-fn').textContent = fmt(counts.F) + ' cars';
    document.getElementById('fg-hn').textContent = fmt(counts.H) + ' cars';
    document.getElementById('fg-en').textContent = fmt(counts.E) + ' cars';
  }

  sliderEl.addEventListener('input', ev => {
    const y = parseInt(ev.target.value);
    applyYear(y, Math.abs(y - lastYear) <= 2);
  });

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
    let y = lastYear >= maxYear ? minYear : lastYear;
    if (y === minYear) applyYear(minYear, false);
    playTimer = setInterval(() => {
      y++;
      if (!kd[y]) { stopPlay(); return; }
      applyYear(y, true);
      if (y >= maxYear) stopPlay();
    }, 900);
  }

  document.getElementById('fg-pbtn').addEventListener('click', () => playing ? stopPlay() : startPlay());

  applyYear(minYear, false);
})();

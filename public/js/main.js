// Orchestration: load data, wire up navigation/scrollspy, instantiate charts,
// and connect the interactive controls (category filters, abs/share toggle,
// legend clicks) to the chart update functions.

(async function () {
  const allData = await loadEMobilityData();
  const { bestand, neuzulassungen, gebrauchtzulassungen } = allData;

  // ---- Hero stats ------------------------------------------------------
  const heroBestand = electricShareByYear(bestand, "Insgesamt").at(-1);
  const heroNeu = electricShareByYear(neuzulassungen, "Insgesamt").at(-1);
  const heroGebraucht = electricShareByYear(gebrauchtzulassungen, "Insgesamt").at(-1);

  document.getElementById("stat-bestand").textContent = `${heroBestand.share.toFixed(1)}%`;
  document.getElementById("stat-neu").textContent = `${heroNeu.share.toFixed(1)}%`;
  document.getElementById("stat-gebraucht").textContent = `${heroGebraucht.share.toFixed(1)}%`;
  document.getElementById("stat-year").textContent = heroBestand.year;

  // ---- Section 1: Fleet stock (stacked area) ---------------------------
  let bestandCategory = "Insgesamt";
  let bestandPercent = false;
  const areaChart = createStackedAreaChart("#chart-bestand", aggregateByFuel(bestand, bestandCategory));

  document.querySelectorAll("#bestand-category-filter .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#bestand-category-filter .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bestandCategory = btn.dataset.category;
      areaChart.update(aggregateByFuel(bestand, bestandCategory));
    });
  });

  const percentToggle = document.getElementById("bestand-percent-toggle");
  const baselineToggle = document.getElementById("bestand-baseline-toggle");
  const baselineLabel = document.getElementById("bestand-baseline-label");

  percentToggle.addEventListener("change", () => {
    bestandPercent = percentToggle.checked;
    areaChart.setPercent(bestandPercent);
    // The 400k baseline only makes sense for absolute counts — disable it in % mode.
    baselineToggle.disabled = bestandPercent;
    baselineLabel.classList.toggle("disabled", bestandPercent);
  });

  baselineToggle.addEventListener("change", () => {
    areaChart.setBaseline(baselineToggle.checked ? 400000 : 0);
  });

  // ---- Section 2: New registrations (multi-line, % share) -------------
  let neuCategory = "Insgesamt";
  const lineChart = createMultiLineChart(
    "#chart-neuzulassungen",
    shareSeries(aggregateByFuel(neuzulassungen, neuCategory))
  );

  document.querySelectorAll("#neu-category-filter .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#neu-category-filter .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      neuCategory = btn.dataset.category;
      lineChart.update(shareSeries(aggregateByFuel(neuzulassungen, neuCategory)));
    });
  });

  document.querySelectorAll("#neu-legend .legend-toggle").forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.toggle("inactive");
      lineChart.toggleFuel(item.dataset.fuel);
    });
  });

  // ---- Section 3: Used-car market (grouped bars) -----------------------
  const barChart = createGroupedBarChart("#chart-gebraucht", aggregateByFuel(gebrauchtzulassungen, "Insgesamt"));

  // ---- Section 4: Comparison line chart --------------------------------
  const comparisonSeries = [
    {
      key: "bestand",
      label: "Fleet stock",
      color: "#378add",
      values: electricShareByYear(bestand, "Insgesamt").map((d) => ({ year: d.year, share: d.share })),
    },
    {
      key: "neu",
      label: "New registrations",
      color: "#639922",
      values: electricShareByYear(neuzulassungen, "Insgesamt").map((d) => ({ year: d.year, share: d.share })),
    },
    {
      key: "gebraucht",
      label: "Used registrations",
      color: "#ba7517",
      values: electricShareByYear(gebrauchtzulassungen, "Insgesamt").map((d) => ({ year: d.year, share: d.share })),
    },
  ];
  const comparisonChart = createComparisonChart("#chart-comparison", comparisonSeries);

  document.querySelectorAll("#comparison-legend .legend-toggle").forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.toggle("inactive");
      comparisonChart.toggleSeries(item.dataset.key);
    });
  });

  // ---- Resize handling ---------------------------------------------------
  window.addEventListener(
    "resize",
    debounce(() => {
      areaChart.resize();
      lineChart.resize();
      barChart.resize();
      comparisonChart.resize();
    }, 150)
  );

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---- Navigation: smooth scroll + scrollspy ----------------------------
  const sections = Array.from(document.querySelectorAll("main > section"));
  const navLinks = Array.from(document.querySelectorAll(".nav-link"));

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(link.getAttribute("href").slice(1)).scrollIntoView({ behavior: "smooth" });
    });
  });
  document.querySelectorAll("[data-scroll-to]").forEach((el) => {
    el.addEventListener("click", () => {
      document.getElementById(el.dataset.scrollTo).scrollIntoView({ behavior: "smooth" });
    });
  });

  const progressFill = document.getElementById("progress-fill");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((l) => l.classList.toggle("active-link", l.getAttribute("href") === `#${entry.target.id}`));
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  sections.forEach((s) => observer.observe(s));

  window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    progressFill.style.width = `${docHeight > 0 ? (scrollTop / docHeight) * 100 : 0}%`;
  });
})();

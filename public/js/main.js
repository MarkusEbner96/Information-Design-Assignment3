// Entry point: loads the dataset, instantiates all four charts, and wires up
// every interactive control (category filters, toggles, legend clicks, resize,
// smooth scroll, scrollspy, progress bar).

(async function () {
  // Fetch vienna_emobility.json once; destructure the three sub-datasets.
  const allData = await loadEMobilityData();
  const { bestand, neuzulassungen, gebrauchtzulassungen } = allData;

  // ---- Hero stats -------------------------------------------------------
  // .at(-1) picks the most recent year from each dataset.
  const heroBestand   = electricShareByYear(bestand,              "Insgesamt").at(-1);
  const heroNeu       = electricShareByYear(neuzulassungen,       "Insgesamt").at(-1);
  const heroGebraucht = electricShareByYear(gebrauchtzulassungen, "Insgesamt").at(-1);

  document.getElementById("stat-bestand").textContent  = `${heroBestand.share.toFixed(1)}%`;
  document.getElementById("stat-neu").textContent      = `${heroNeu.share.toFixed(1)}%`;
  document.getElementById("stat-gebraucht").textContent = `${heroGebraucht.share.toFixed(1)}%`;
  document.getElementById("stat-year").textContent     = heroBestand.year; // e.g. "2024"

  // ---- Section 1: Fleet stock (stacked area) ----------------------------
  let bestandCategory = "Insgesamt"; // tracks which vehicle category is active
  let bestandPercent  = false;

  // Initial render with all vehicle categories summed together.
  const areaChart = createStackedAreaChart(
    "#chart-bestand",
    aggregateByFuel(bestand, bestandCategory)
  );

  // Category filter buttons — switch the active class and re-aggregate data.
  document.querySelectorAll("#bestand-category-filter .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#bestand-category-filter .filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bestandCategory = btn.dataset.category;
      areaChart.update(aggregateByFuel(bestand, bestandCategory));
    });
  });

  const percentToggle  = document.getElementById("bestand-percent-toggle");
  const baselineToggle = document.getElementById("bestand-baseline-toggle");
  const baselineLabel  = document.getElementById("bestand-baseline-label");

  // 100%-share toggle: switches the chart between absolute counts and proportional shares.
  percentToggle.addEventListener("change", () => {
    bestandPercent = percentToggle.checked;
    areaChart.setPercent(bestandPercent);
    // The 400k baseline only makes sense for absolute counts, so disable it in % mode.
    baselineToggle.disabled = bestandPercent;
    baselineLabel.classList.toggle("disabled", bestandPercent);
  });

  // 400k baseline toggle: zooms the Y axis to start at 400,000 to magnify the
  // small hybrid/electric bands that would otherwise be invisible at the bottom.
  baselineToggle.addEventListener("change", () => {
    areaChart.setBaseline(baselineToggle.checked ? 400000 : 0);
  });

  // ---- Section 2: New registrations (multi-line, % share) ---------------
  let neuCategory = "Insgesamt";

  // shareSeries converts absolute counts to % shares so lines are comparable across years.
  const lineChart = createMultiLineChart(
    "#chart-neuzulassungen",
    shareSeries(aggregateByFuel(neuzulassungen, neuCategory))
  );

  document.querySelectorAll("#neu-category-filter .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#neu-category-filter .filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      neuCategory = btn.dataset.category;
      lineChart.update(shareSeries(aggregateByFuel(neuzulassungen, neuCategory)));
    });
  });

  // Legend clicks toggle individual fuel lines on/off via the chart controller.
  document.querySelectorAll("#neu-legend .legend-toggle").forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.toggle("inactive"); // visual feedback on the legend swatch
      lineChart.toggleFuel(item.dataset.fuel);
    });
  });

  // ---- Section 3: Used-car market (grouped bars) ------------------------
  // No category filter for this chart — always shows "Insgesamt" (all vehicles).
  const barChart = createGroupedBarChart(
    "#chart-gebraucht",
    aggregateByFuel(gebrauchtzulassungen, "Insgesamt")
  );

  // ---- Section 4: Comparison line chart ---------------------------------
  // Each series is the electric-only share extracted from one of the three datasets.
  const comparisonSeries = [
    {
      key:    "bestand",
      label:  "Fleet stock",
      color:  "#378add",
      values: electricShareByYear(bestand, "Insgesamt")
                .map((d) => ({ year: d.year, share: d.share })),
    },
    {
      key:    "neu",
      label:  "New registrations",
      color:  "#639922",
      values: electricShareByYear(neuzulassungen, "Insgesamt")
                .map((d) => ({ year: d.year, share: d.share })),
    },
    {
      key:    "gebraucht",
      label:  "Used registrations",
      color:  "#ba7517",
      values: electricShareByYear(gebrauchtzulassungen, "Insgesamt")
                .map((d) => ({ year: d.year, share: d.share })),
    },
  ];

  const comparisonChart = createComparisonChart("#chart-comparison", comparisonSeries);

  document.querySelectorAll("#comparison-legend .legend-toggle").forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.toggle("inactive");
      comparisonChart.toggleSeries(item.dataset.key);
    });
  });

  // ---- Resize handling --------------------------------------------------
  // Debounce prevents the charts from re-rendering on every pixel of a drag resize.
  window.addEventListener("resize", debounce(() => {
    areaChart.resize();
    lineChart.resize();
    barChart.resize();
    comparisonChart.resize();
  }, 150));

  // Delays fn by ms after the last call — resets the timer on each new call.
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

  // Override default anchor jump with a smooth scroll.
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(link.getAttribute("href").slice(1))
        .scrollIntoView({ behavior: "smooth" });
    });
  });

  // "Scroll to explore" CTA button — scrolls to the section named in data-scroll-to.
  document.querySelectorAll("[data-scroll-to]").forEach((el) => {
    el.addEventListener("click", () => {
      document.getElementById(el.dataset.scrollTo).scrollIntoView({ behavior: "smooth" });
    });
  });

  // Scrollspy: highlights the nav link whose section is currently in the viewport center.
  // rootMargin shrinks the effective viewport to the middle 5% so only one section is
  // "active" at a time even when two sections are partially visible.
  const progressFill = document.getElementById("progress-fill");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((l) =>
            l.classList.toggle("active-link", l.getAttribute("href") === `#${entry.target.id}`)
          );
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  sections.forEach((s) => observer.observe(s));

  // Progress bar: fills proportionally to how far down the page the user has scrolled.
  window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    progressFill.style.width = `${docHeight > 0 ? (scrollTop / docHeight) * 100 : 0}%`;
  });
})();

// D3 chart builders. Each function renders into a given container selector
// and returns a small controller object so main.js can update it on
// filter/toggle changes without re-creating the whole SVG every time.

function makeTooltip(container) {
  return d3
    .select(container)
    .append("div")
    .attr("class", "viz-tooltip")
    .style("opacity", 0);
}

function showTooltip(tooltip, container, html, event) {
  const bounds = container.getBoundingClientRect();
  tooltip
    .html(html)
    .style("opacity", 1)
    .style("left", `${event.clientX - bounds.left + 14}px`)
    .style("top", `${event.clientY - bounds.top - 10}px`);
}

function hideTooltip(tooltip) {
  tooltip.style("opacity", 0);
}

// ---------------------------------------------------------------------------
// 1. Stacked area chart — Fleet stock (Bestand) composition over time.
//    Interactions: brushing (time-window selection), stack offset toggle
//    (absolute vs. 100% share), driven externally via category buttons.
// ---------------------------------------------------------------------------
function createStackedAreaChart(selector, initialRows) {
  const root = d3.select(selector);
  const wrap = root.append("div").attr("class", "chart-svg-wrap");
  const margin = { top: 16, right: 24, bottom: 28, left: 52 };
  const brushHeight = 36;
  let width, height;

  const svg = wrap.append("svg").attr("class", "chart-svg");
  const gMain = svg.append("g");
  const gAreas = gMain.append("g").attr("class", "areas");
  const gAxisX = gMain.append("g").attr("class", "axis axis-x");
  const gAxisY = gMain.append("g").attr("class", "axis axis-y");
  const gBrushAxis = svg.append("g").attr("class", "brush-context");
  const gBrush = gBrushAxis.append("g").attr("class", "brush");

  const tooltip = makeTooltip(selector);
  const hoverLine = gMain
    .append("line")
    .attr("class", "hover-line")
    .style("opacity", 0);

  const x = d3.scaleLinear();
  const y = d3.scaleLinear();
  const xContext = d3.scaleLinear();

  let state = { rows: initialRows, percent: false, domain: null };

  const stackGen = d3.stack().keys(FUELS);

  function size() {
    const box = root.node().getBoundingClientRect();
    width = Math.max(box.width, 320);
    height = 320;
  }

  function render() {
    size();
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom - brushHeight - 10;

    svg.attr("width", width).attr("height", height);
    gMain.attr("transform", `translate(${margin.left},${margin.top})`);
    gBrushAxis.attr(
      "transform",
      `translate(${margin.left},${height - brushHeight - 4})`
    );

    const allYears = state.rows.map((r) => r.year);
    xContext.domain(d3.extent(allYears)).range([0, innerW]);

    const domain = state.domain || d3.extent(allYears);
    const visibleRows = state.rows.filter(
      (r) => r.year >= domain[0] && r.year <= domain[1]
    );

    x.domain(domain).range([0, innerW]);

    const offset = state.percent ? d3.stackOffsetExpand : d3.stackOffsetNone;
    stackGen.offset(offset);
    const series = stackGen(visibleRows);

    y.domain(state.percent ? [0, 1] : [0, d3.max(series, (s) => d3.max(s, (d) => d[1])) || 1])
      .range([innerH, 0])
      .nice();

    const area = d3
      .area()
      .x((d) => x(d.data.year))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveMonotoneX);

    const paths = gAreas.selectAll("path").data(series, (d) => d.key);
    paths
      .join("path")
      .attr("fill", (d) => FUEL_COLORS[d.key])
      .attr("opacity", 0.88)
      .transition()
      .duration(350)
      .attr("d", area);

    gAxisX
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(Math.min(visibleRows.length, 8)).tickFormat(d3.format("d")));

    gAxisY.call(
      d3
        .axisLeft(y)
        .ticks(5)
        .tickFormat(state.percent ? d3.format(".0%") : (d) => d3.format("~s")(d))
    );

    // Hover interaction (mouse move over plot area -> tooltip with all 3 values)
    gMain.selectAll("rect.hover-capture").data([null]).join("rect")
      .attr("class", "hover-capture")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const yearGuess = Math.round(x.invert(mx));
        const row = visibleRows.find((r) => r.year === yearGuess);
        if (!row) return;
        hoverLine
          .attr("x1", x(yearGuess))
          .attr("x2", x(yearGuess))
          .attr("y1", 0)
          .attr("y2", innerH)
          .style("opacity", 1);
        const total = row.total || row.Fossil + row.Hybrid + row.Elektro;
        const fmt = d3.format(",");
        showTooltip(
          tooltip,
          root.node(),
          `<strong>${yearGuess}</strong><br>` +
            FUELS.map(
              (f) =>
                `<span style="color:${FUEL_COLORS[f]}">●</span> ${FUEL_LABELS[f]}: ${fmt(
                  row[f]
                )} (${((row[f] / total) * 100).toFixed(1)}%)`
            ).join("<br>"),
          event
        );
      })
      .on("mouseleave", () => {
        hideTooltip(tooltip);
        hoverLine.style("opacity", 0);
      });

    // Brush (time-window selection) drawn on the small context strip below.
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [innerW, brushHeight],
      ])
      .on("brush end", (event) => {
        if (!event.selection) return;
        const [x0, x1] = event.selection.map(xContext.invert);
        const newDomain = [Math.round(x0), Math.round(x1)];
        if (newDomain[0] === newDomain[1]) return;
        state.domain = newDomain;
        render();
      });

    gBrush.call(brush);
    gBrushAxis
      .selectAll("g.context-axis")
      .data([null])
      .join("g")
      .attr("class", "context-axis")
      .attr("transform", `translate(0,${brushHeight})`)
      .call(d3.axisBottom(xContext).ticks(6).tickFormat(d3.format("d")).tickSize(3));

    if (!gBrush.select(".selection").size() || gBrush.select(".overlay").empty()) {
      gBrush.call(brush.move, domain.map(xContext));
    }
  }

  render();

  return {
    update(rows) {
      state.rows = rows;
      render();
    },
    setPercent(percent) {
      state.percent = percent;
      render();
    },
    resize: render,
  };
}

// ---------------------------------------------------------------------------
// 2. Multi-line chart — New registrations (Neuzulassungen), share of fuel type.
//    Interactions: legend click to isolate a line, hover tooltip with
//    synchronized guideline across all series.
// ---------------------------------------------------------------------------
function createMultiLineChart(selector, initialRows) {
  const root = d3.select(selector);
  const wrap = root.append("div").attr("class", "chart-svg-wrap");
  const margin = { top: 16, right: 24, bottom: 28, left: 46 };
  const svg = wrap.append("svg").attr("class", "chart-svg");
  const gMain = svg.append("g");
  const gLines = gMain.append("g");
  const gPoints = gMain.append("g");
  const gAxisX = gMain.append("g").attr("class", "axis axis-x");
  const gAxisY = gMain.append("g").attr("class", "axis axis-y");
  const hoverLine = gMain.append("line").attr("class", "hover-line").style("opacity", 0);
  const tooltip = makeTooltip(selector);

  const x = d3.scaleLinear();
  const y = d3.scaleLinear();
  let visible = new Set(FUELS);
  let rows = initialRows;
  let width, height;

  function size() {
    const box = root.node().getBoundingClientRect();
    width = Math.max(box.width, 320);
    height = 300;
  }

  function render() {
    size();
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    svg.attr("width", width).attr("height", height);
    gMain.attr("transform", `translate(${margin.left},${margin.top})`);

    x.domain(d3.extent(rows, (d) => d.year)).range([0, innerW]);
    const maxY = d3.max(rows, (r) => d3.max(FUELS.filter((f) => visible.has(f)), (f) => r[f])) || 1;
    y.domain([0, maxY]).range([innerH, 0]).nice();

    const line = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    const series = FUELS.map((fuel) => ({
      fuel,
      values: rows.map((r) => ({ year: r.year, value: r[fuel] })),
    }));

    gLines
      .selectAll("path")
      .data(series, (d) => d.fuel)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", (d) => FUEL_COLORS[d.fuel])
      .attr("stroke-width", 2.2)
      .style("opacity", (d) => (visible.has(d.fuel) ? 1 : 0.08))
      .transition()
      .duration(300)
      .attr("d", (d) => line(d.values));

    gAxisX
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(Math.min(rows.length, 9)).tickFormat(d3.format("d")));
    gAxisY.call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}%`));

    gMain.selectAll("rect.hover-capture").data([null]).join("rect")
      .attr("class", "hover-capture")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const yearGuess = Math.round(x.invert(mx));
        const row = rows.find((r) => r.year === yearGuess);
        if (!row) return;
        hoverLine.attr("x1", x(yearGuess)).attr("x2", x(yearGuess)).attr("y1", 0).attr("y2", innerH).style("opacity", 1);
        showTooltip(
          tooltip,
          root.node(),
          `<strong>${yearGuess}</strong><br>` +
            FUELS.filter((f) => visible.has(f))
              .map((f) => `<span style="color:${FUEL_COLORS[f]}">●</span> ${FUEL_LABELS[f]}: ${row[f].toFixed(1)}%`)
              .join("<br>"),
          event
        );
      })
      .on("mouseleave", () => {
        hideTooltip(tooltip);
        hoverLine.style("opacity", 0);
      });
  }

  render();

  return {
    update(newRows) {
      rows = newRows;
      render();
    },
    toggleFuel(fuel) {
      if (visible.has(fuel)) visible.delete(fuel);
      else visible.add(fuel);
      if (visible.size === 0) visible.add(fuel);
      render();
    },
    resize: render,
  };
}

// ---------------------------------------------------------------------------
// 3. Grouped bar chart — Used-car market registrations by fuel type.
//    Interactions: zoom/pan (d3-zoom) along the year axis, hover tooltip.
// ---------------------------------------------------------------------------
function createGroupedBarChart(selector, initialRows) {
  const root = d3.select(selector);
  const wrap = root.append("div").attr("class", "chart-svg-wrap");
  const margin = { top: 16, right: 20, bottom: 28, left: 52 };
  const svg = wrap.append("svg").attr("class", "chart-svg");
  const gMain = svg.append("g");
  const gBars = gMain.append("g");
  const gAxisX = gMain.append("g").attr("class", "axis axis-x");
  const gAxisY = gMain.append("g").attr("class", "axis axis-y");
  const tooltip = makeTooltip(selector);

  const x0 = d3.scaleBand().paddingInner(0.3).paddingOuter(0.15);
  const x1 = d3.scaleBand();
  const y = d3.scaleLinear();
  let allRows = initialRows;
  let zoomK = 1;
  let zoomFocusYear = null; // year centered while zoomed in
  let width, height;

  function size() {
    const box = root.node().getBoundingClientRect();
    width = Math.max(box.width, 320);
    height = 300;
  }

  function visibleRows() {
    if (zoomK <= 1) return allRows;
    const n = Math.max(3, Math.round(allRows.length / zoomK));
    const centerIdx = zoomFocusYear
      ? allRows.findIndex((r) => r.year === zoomFocusYear)
      : allRows.length - 1;
    let start = Math.max(0, centerIdx - Math.floor(n / 2));
    let end = Math.min(allRows.length, start + n);
    start = Math.max(0, end - n);
    return allRows.slice(start, end);
  }

  function render() {
    size();
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    svg.attr("width", width).attr("height", height);
    gMain.attr("transform", `translate(${margin.left},${margin.top})`);

    const rows = visibleRows();
    x0.domain(rows.map((d) => d.year)).range([0, innerW]);
    x1.domain(FUELS).range([0, x0.bandwidth()]);
    y.domain([0, d3.max(allRows, (r) => d3.max(FUELS, (f) => r[f])) || 1]).range([innerH, 0]).nice();

    const groups = gBars.selectAll("g.year-group").data(rows, (d) => d.year);
    groups.exit().remove();
    const groupsEnter = groups
      .join("g")
      .attr("class", "year-group")
      .attr("transform", (d) => `translate(${x0(d.year)},0)`);

    groupsEnter
      .selectAll("rect")
      .data((d) => FUELS.map((f) => ({ fuel: f, value: d[f], year: d.year })))
      .join("rect")
      .attr("x", (d) => x1(d.fuel))
      .attr("width", x1.bandwidth())
      .attr("fill", (d) => FUEL_COLORS[d.fuel])
      .on("mousemove", (event, d) => {
        showTooltip(
          tooltip,
          root.node(),
          `<strong>${d.year}</strong><br><span style="color:${FUEL_COLORS[d.fuel]}">●</span> ${FUEL_LABELS[d.fuel]}: ${d3.format(",")(d.value)}`,
          event
        );
      })
      .on("mouseleave", () => hideTooltip(tooltip))
      .attr("y", (d) => y(d.value))
      .attr("height", (d) => innerH - y(d.value));

    const ticks = rows.map((d) => d.year).filter((_, i, arr) => arr.length <= 14 || i % 2 === 0);
    gAxisX
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x0).tickValues(ticks).tickFormat(d3.format("d")));
    gAxisY.call(d3.axisLeft(y).ticks(5).tickFormat((d) => d3.format("~s")(d)));

    const zoom = d3
      .zoom()
      .scaleExtent([1, 5])
      .filter((event) => event.type === "wheel" || event.type === "dblclick")
      .on("zoom", (event) => {
        zoomK = event.transform.k;
        if (zoomK > 1 && !zoomFocusYear) {
          const [mx] = d3.pointer(event.sourceEvent ?? event, gMain.node());
          const idx = Math.round((mx / innerW) * (allRows.length - 1));
          zoomFocusYear = allRows[Math.max(0, Math.min(allRows.length - 1, idx))]?.year;
        }
        if (zoomK <= 1) zoomFocusYear = null;
        render();
      });

    svg.call(zoom);
  }

  render();

  return {
    update(newRows) {
      allRows = newRows;
      zoomK = 1;
      zoomFocusYear = null;
      render();
    },
    resize: render,
  };
}

// ---------------------------------------------------------------------------
// 4. Comparison line chart — electric share trajectories across the three
//    datasets (fleet stock vs. new registrations vs. used registrations).
//    Interactions: legend click to isolate a series, hover tooltip.
// ---------------------------------------------------------------------------
function createComparisonChart(selector, series) {
  // series: [{ key, label, color, values: [{year, share}] }]
  const root = d3.select(selector);
  const wrap = root.append("div").attr("class", "chart-svg-wrap");
  const margin = { top: 16, right: 24, bottom: 28, left: 46 };
  const svg = wrap.append("svg").attr("class", "chart-svg");
  const gMain = svg.append("g");
  const gLines = gMain.append("g");
  const gAxisX = gMain.append("g").attr("class", "axis axis-x");
  const gAxisY = gMain.append("g").attr("class", "axis axis-y");
  const hoverLine = gMain.append("line").attr("class", "hover-line").style("opacity", 0);
  const tooltip = makeTooltip(selector);

  const x = d3.scaleLinear();
  const y = d3.scaleLinear();
  let visible = new Set(series.map((s) => s.key));
  let width, height;

  function size() {
    const box = root.node().getBoundingClientRect();
    width = Math.max(box.width, 320);
    height = 320;
  }

  function render() {
    size();
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    svg.attr("width", width).attr("height", height);
    gMain.attr("transform", `translate(${margin.left},${margin.top})`);

    const allYears = series.flatMap((s) => s.values.map((v) => v.year));
    x.domain(d3.extent(allYears)).range([0, innerW]);
    const maxY = d3.max(series.filter((s) => visible.has(s.key)).flatMap((s) => s.values.map((v) => v.share))) || 1;
    y.domain([0, maxY]).range([innerH, 0]).nice();

    const line = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.share))
      .curve(d3.curveMonotoneX);

    gLines
      .selectAll("path")
      .data(series, (d) => d.key)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 2.4)
      .style("opacity", (d) => (visible.has(d.key) ? 1 : 0.1))
      .transition()
      .duration(300)
      .attr("d", (d) => line(d.values));

    gAxisX.attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));
    gAxisY.call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}%`));

    gMain.selectAll("rect.hover-capture").data([null]).join("rect")
      .attr("class", "hover-capture")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const yearGuess = Math.round(x.invert(mx));
        hoverLine.attr("x1", x(yearGuess)).attr("x2", x(yearGuess)).attr("y1", 0).attr("y2", innerH).style("opacity", 1);
        const rows = series
          .filter((s) => visible.has(s.key))
          .map((s) => ({ s, point: s.values.find((v) => v.year === yearGuess) }))
          .filter((r) => r.point);
        if (!rows.length) return;
        showTooltip(
          tooltip,
          root.node(),
          `<strong>${yearGuess}</strong><br>` +
            rows.map((r) => `<span style="color:${r.s.color}">●</span> ${r.s.label}: ${r.point.share.toFixed(1)}%`).join("<br>"),
          event
        );
      })
      .on("mouseleave", () => {
        hideTooltip(tooltip);
        hoverLine.style("opacity", 0);
      });
  }

  render();

  return {
    toggleSeries(key) {
      if (visible.has(key)) visible.delete(key);
      else visible.add(key);
      if (visible.size === 0) visible.add(key);
      render();
    },
    resize: render,
  };
}

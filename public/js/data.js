// Shared constants and data helpers used by all charts and fleet-grid.
// Source: public/data/vienna_emobility.json — generated from MA23 / Statistik Austria
// tables 3.1.8 (fleet stock), 3.1.9 (new registrations), 3.1.10 (used registrations).

// Canonical fuel-type order used for stacking, iteration, and color lookup.
const FUELS       = ["Fossil", "Hybrid", "Elektro"];
const FUEL_LABELS = { Fossil: "Fossil", Hybrid: "Hybrid", Elektro: "Electric" };
const FUEL_COLORS = { Fossil: "#9a9993", Hybrid: "#1d9e75", Elektro: "#378add" };

// Fetches the combined dataset; throws if the request fails so callers can surface the error.
async function loadEMobilityData() {
  const res = await fetch("data/vienna_emobility.json");
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.status}`);
  return res.json();
}

// Collapses a dataset's wide-format rows into { year, Fossil, Hybrid, Elektro, total }.
// Pass "Insgesamt" as category to sum across all vehicle categories (Pkw + Krafträder + Lkw + Sonstige).
// Pass a specific category (e.g. "Pkw") to extract just that column group.
function aggregateByFuel(dataset, category) {
  return dataset.wide.map((row) => {
    const out = { year: row.year };
    if (category === "Insgesamt") {
      // Sum each fuel type across every vehicle category.
      for (const fuel of FUELS) {
        out[fuel] = dataset.categories.reduce(
          (sum, cat) => sum + (row[`${cat}_${fuel}`] || 0),
          0
        );
      }
      out.total = row.total; // pre-computed grand total from the JSON
    } else {
      // Single category: just read the three fuel columns directly.
      let total = 0;
      for (const fuel of FUELS) {
        const v  = row[`${category}_${fuel}`] || 0;
        out[fuel] = v;
        total    += v;
      }
      out.total = total;
    }
    return out;
  });
}

// Converts absolute counts to percentage shares so different years and categories
// are comparable on the same axis (used by the new-registrations line chart).
function shareSeries(rows) {
  return rows.map((row) => {
    const out = { year: row.year, total: row.total };
    for (const fuel of FUELS) {
      out[fuel] = row.total ? (row[fuel] / row.total) * 100 : 0;
    }
    return out;
  });
}

// Returns [{ year, share }] where share is the electric-only percentage for each year.
// Used by the hero stats and the comparison line chart.
function electricShareByYear(dataset, category) {
  const rows = aggregateByFuel(dataset, category);
  return rows.map((r) => ({
    year:  r.year,
    share: r.total ? (r.Elektro / r.total) * 100 : 0,
  }));
}

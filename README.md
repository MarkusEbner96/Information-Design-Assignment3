# Wien fährt um — Vienna's Electric Mobility Transition

An interactive data story about the slow, fast, and social speeds of Vienna's
transition to electric vehicles, based on official MA23 / Statistik Austria
registration data.

## Run locally

Requirements: [Node.js](https://nodejs.org/) (v18+) and npm.

```bash
npm install
npm start
```

The app is served at [http://localhost:3000](http://localhost:3000).

## Project structure

```
public/            stand-alone web app (entry point: public/index.html)
  css/style.css     styling
  js/data.js        data loading + aggregation helpers
  js/charts.js      D3 chart builders (stacked area, multi-line, bars, comparison)
  js/main.js        wiring: navigation, filters, toggles, legends
  js/fleet-grid.js  animated fleet "200 cars" grid (Section 1)
  js/city-3d.js     "Vienna from above" — Three.js 3D district model (spatial view)
  data/             pre-converted JSON datasets, bundled directly into the app
  data/bezirke.json scale-accurate district map, pre-projected from Vienna OGD
data/               original source spreadsheets (Statistik Austria)
scripts/parse_data.py       converts the xlsx tables into public/data/*.json
scripts/build_districts.mjs projects + simplifies the district boundaries -> public/data/bezirke.json
server.js           tiny Express server (for Railway deployment)
```

To regenerate the JSON data from the source spreadsheets:

```bash
pip install pandas openpyxl python-calamine
python scripts/parse_data.py
```

## Data sources

Three official Vienna vehicle-registration tables (MA23 / Statistik Austria):

- Tab. 3.1.8 — Kraftfahrzeugbestand (fleet stock) nach Kraftstoffarten, Wien seit 2011
- Tab. 3.1.9 — Neuzulassungen nach Kraftstoffarten, Wien seit 2007
- Tab. 3.1.10 — Gebrauchtzulassungen nach Kraftstoffarten, Wien seit 2007

District boundaries for the 3D "Vienna from above" view come from the City of
Vienna's Open Government Data (WFS layer `BEZIRKSGRENZEOGD`, EPSG:4326). To
re-fetch and rebuild the compact map:

```bash
curl -s "https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0&typeName=ogdwien:BEZIRKSGRENZEOGD&srsName=EPSG:4326&outputFormat=json" -o public/data/bezirke_raw.json
node scripts/build_districts.mjs
```

Note: the district **boundaries are real and scale-accurate**, but the per-district
density / EV-share **values are illustrative placeholders** — the MA23 tables are
city-wide aggregates with no per-district drive-type breakdown.

# CONTEXT — Marswalk glossary

Terms only. Implementation choices and default numbers live in `src/config.js`.

**Marswalk** — interactive 3D exploration map for planning a single surface EVA at Jezero crater: multi-objective route comparison with a time-synchronized environment replay. Not a global GIS (Mars Trek covers that).

**Science objective** — sample outcrops along the Jezero delta front to test the ancient-lake sedimentary record. Routes are judged against it, not only against speed.

**EVA** — one extravehicular activity: 2 astronauts on foot, about 6–8 h, starting and ending at the Habitat. Rovers are future work.

**Habitat** — the EVA start/end point. Its location is an Assumption, not a real landing site.

**Study area** — the ~5 × 5 km map crop around the delta front where EVAs are planned.

**Science site** — a candidate sampling stop with a stop duration. Destination is the site (or clicked point) the EVA must reach.

**Route** — the round trip Habitat → (Science sites) → Destination → Habitat over the terrain grid.

**Route profile** — one of three semantically distinct routes from A* on the slope grid:
- *Shortest*: minimum distance under the slope limit.
- *Gentlest*: penalizes slope.
- *Science*: visits as many Science sites as fit in the EVA budget.

**Traversability limit** — maximum slope a suited astronaut may cross; cells above it are impassable.

**Return margin** — EVA time budget minus planned route duration. Negative = plan exceeds the budget.

**Mission timeline** — the progress bar; dragging it moves the crew along the selected route and updates every environment value for that position and time.

**Provenance labels** (every number on screen carries one):
- *Observation* — measured by an instrument (e.g. stereo DTM elevation, RAD dose rate).
- *Historical Replay* — a real measured time series replayed on the timeline (e.g. one MEDA sol). Never a forecast.
- *Model Estimate* — computed from a model (e.g. pressure shifted by elevation, cumulative dose).
- *Assumption* — a chosen parameter (slope limit, walking speed, Habitat location, thresholds).
- *Scenario Event* — a deliberately injected event (dust storm, solar particle event). Not a prediction.

**CDOD** — column dust optical depth τ. Shown instead of “dust concentration”; orbital/column values do not equal surface particulate concentration.

**Arrival preview** — a real Perseverance surface image shown on arrival at a site, labeled as representative (the camera location may differ).

**Known non-claims** — MEDA is single-point and historical, not global or real-time weather; RAD is a single-point series at Gale, not a radiation map; terrain shielding is not modeled; Martian wind exerts negligible mechanical force on a person, so it drives dust, not posture.

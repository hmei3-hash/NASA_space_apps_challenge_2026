// Planet-scale dust storm spread: a kinematic model fitted to published timelines.
// It answers one question: "when does dust from this storm reach each base?" It is not a weather model.
//
// Footprint at time t (sols): every point within radius r(t) of a centre c(t) on the sphere.
//   r(t) = min(maxRadiusKm, speed * t)      speed = front expansion speed
//   c(t) moves along `track` (great-circle legs) at `trackSpeedMs`, then stays at the last point.
//   northLimit: dust does not advance poleward of this latitude (2018 storm stopped near 46°N).
// Sources and the fit are documented in docs/RESEARCH.md, section 4.

export const R_KM = 3389.5;
export const SOL_S = 88775;
const D = Math.PI / 180;

export function gcKm(a, b) {
  const dLat = (b.lat - a.lat) * D, dLon = (b.lon - a.lon) * D;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function slerp(a, b, f) {
  const v = (p) => [Math.cos(p.lat * D) * Math.cos(p.lon * D), Math.cos(p.lat * D) * Math.sin(p.lon * D), Math.sin(p.lat * D)];
  const A = v(a), B = v(b), w = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (w < 1e-9) return { ...a };
  const s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
  const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
  return { lat: Math.asin(z) / D, lon: ((Math.atan2(y, x) / D) + 360) % 360 };
}

/** Bases: crewed outposts are an Assumption; each sits at a real landing site so a surface record exists there. */
export const BASES = [
  { id: 'jezero', name: 'Jezero', lat: 18.44, lon: 77.45, mission: 'Perseverance, 2021–' },
  { id: 'gale', name: 'Gale', lat: -4.59, lon: 137.44, mission: 'Curiosity, 2012–' },
  { id: 'meridiani', name: 'Meridiani', lat: -1.95, lon: 354.47, mission: 'Opportunity, 2004–2018' },
  { id: 'elysium', name: 'Elysium', lat: 4.50, lon: 135.62, mission: 'InSight, 2018–2022' },
];

export const SCENARIOS = {
  gds2018: {
    name: '2018 planet-encircling storm',
    kind: 'replay',
    season: 'Ls 185°, start of the dusty season',
    origin: { lat: 31.7, lon: 342, name: 'Acidalia Planitia' },
    track: [], trackSpeedMs: 0,
    speedMs: 6.2, maxRadiusKm: Infinity, northLimit: 46, lifeSols: 60,
    startDate: '30 May 2018',
    blurb: 'First seen on 30 May 2018 as a 1.4×10⁵ km² patch in Acidalia. It ran south down the Acidalia corridor, reached 55°S by 8 June and was declared planet-encircling on 19 June.',
    fit: 'One expansion speed, 6.2 m/s, fitted so the model matches the four dated observations below. Measured front speeds in this storm ranged from 5 to 40 m/s.',
    checks: [
      { what: 'Opportunity (Meridiani): dust rising within days; opacity 10.8 on 10 June', base: 'meridiani', observedSol: [2, 6] },
      { what: 'Dust reaches latitude 55°S by 8 June', point: { lat: -55, lon: 342 }, observedSol: [8, 9.5] },
      { what: 'Curiosity (Gale): dust climbing for days, then more than doubles over 16–17 June to above 8', base: 'gale', observedSol: [14, 18.5] },
      { what: 'Planet-encircling on 19 June', point: { lat: -31.7, lon: 162 }, observedSol: [18, 21] },
    ],
    sources: [
      ['Sánchez-Lavega et al. 2019, GRL: onset and growth of the 2018 storm', 'https://arxiv.org/abs/1906.00963'],
      ['NASA JPL status reports, June 2018', 'https://www.jpl.nasa.gov/news/opportunity-hunkers-down-during-dust-storm/'],
    ],
  },
  reg2022: {
    name: 'January 2022 regional storm',
    kind: 'replay',
    season: 'Ls 153°, unusually early',
    origin: { lat: -30, lon: 107, name: 'Hesperia–Promethei' },
    track: [], trackSpeedMs: 0,
    speedMs: 9.5, maxRadiusKm: 3600, northLimit: 60, lifeSols: 11,
    startDate: '1 January 2022',
    blurb: 'A local storm in the Hesperia–Promethei region grew into a regional storm, moved quickly north across the equator into Isidis and Syrtis Major, and sat over Jezero from 5 to 11 January. It reached the Perseverance, InSight and Curiosity sites.',
    fit: 'Origin coordinates are our reading of the weekly orbital weather report, not a published point. Speed 9.5 m/s is fitted to the storm arriving at Jezero on 5 January.',
    checks: [
      { what: 'Perseverance (Jezero): storm overhead 5–11 January', base: 'jezero', observedSol: [3.5, 5] },
      { what: 'InSight (Elysium) affected during the same week', base: 'elysium', observedSol: [2, 8] },
      { what: 'Curiosity (Gale) affected during the same week', base: 'gale', observedSol: [2, 8] },
    ],
    sources: [
      ['Malin & Cantor 2022, MRO MARCI weather report, 3–9 January 2022', 'https://www.msss.com/msss_images/2022/01/12/'],
      ['Lemmon et al. 2022, GRL: storm in Jezero crater', 'https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2022GL100126'],
      ['NASA: Ingenuity flight delayed by the storm', 'https://mars.nasa.gov/technology/helicopter/status/358/grounded-first-flight-delay-due-to-inclement-weather-on-another-world'],
    ],
  },
  flush: {
    name: 'Typical northern flushing storm',
    kind: 'model',
    season: 'Ls 180–240° or 305–350°, the two northern windows',
    origin: { lat: 50, lon: 115, name: 'Utopia Planitia' },
    track: [{ lat: 25, lon: 98 }, { lat: 0, lon: 92 }, { lat: -25, lon: 95 }], trackSpeedMs: 10,
    speedMs: 5, maxRadiusKm: 1785, northLimit: 75, lifeSols: 16,
    startDate: null,
    blurb: 'A statistical case, not one recorded storm. Northern storms start in Utopia, Acidalia or Arcadia and travel south through low-lying channels, often across the equator. A "major" sequence peaks above 10⁷ km², a disc about 1,800 km in radius.',
    fit: 'Track follows the Utopia channel past Isidis (our sketch of the published route map). Size cap is the 10⁷ km² major-sequence threshold. Speeds are picked from inside the measured 5–40 m/s range.',
    checks: [],
    sources: [
      ['Battalio & Wang 2021, Icarus: Mars Dust Activity Database', 'https://doi.org/10.1016/j.icarus.2020.114059'],
      ['Wang & Richardson 2015, Icarus: origin and trajectory of large storms', 'https://doi.org/10.1016/j.icarus.2013.10.033'],
    ],
  },
};

export class StormSim {
  constructor(key = 'gds2018', speedMs = null) {
    this.key = key; this.sc = SCENARIOS[key];
    this.speedMs = speedMs ?? this.sc.speedMs;
    // when the user overrides the speed, the track speed scales with it
    this.trackMs = this.sc.trackSpeedMs * (this.speedMs / this.sc.speedMs);
    const pts = [this.sc.origin, ...this.sc.track];
    this.legs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, km: gcKm(pts[i], p) }));
    this.arrivals = BASES.map((b) => ({ ...b, km0: gcKm(this.sc.origin, b), sol: this.arrivalSol(b) }));
  }
  centre(sol) {
    let km = this.trackMs * sol * SOL_S / 1000;
    for (const l of this.legs) { if (km <= l.km) return slerp(l.a, l.b, km / l.km); km -= l.km; }
    const last = this.legs.length ? this.legs[this.legs.length - 1].b : this.sc.origin;
    return { lat: last.lat, lon: last.lon };
  }
  radiusKm(sol) { return Math.max(0, Math.min(this.sc.maxRadiusKm, this.speedMs * sol * SOL_S / 1000)); }
  areaKm2(sol) { const r = this.radiusKm(sol) / R_KM; return 2 * Math.PI * R_KM * R_KM * (1 - Math.cos(Math.min(Math.PI, r))); }
  covers(p, sol) { return p.lat <= this.sc.northLimit && gcKm(this.centre(sol), p) <= this.radiusKm(sol); }
  /** First sol the footprint covers p, or null if it never does within the storm's life. */
  arrivalSol(p) {
    for (let s = 0; s <= this.sc.lifeSols; s += 0.02) if (this.covers(p, s)) return +s.toFixed(2);
    return null;
  }
  /**
   * Shared hazard log up to `sol`. Each base learns of the storm from the earliest of:
   * the daily orbital map (first map at sol 1), another base's broadcast, or its own stations.
   */
  log(sol, infer = null, orbiter = true) {
    const ev = [];
    const hit = this.arrivals.filter((a) => a.sol !== null && a.sol <= sol).sort((a, b) => a.sol - b.sol);
    if (orbiter && sol >= 1) ev.push({ sol: 1, who: 'Orbiter', kind: 'orbital', text: 'Daily global map shows a growing dust storm. Watch issued to every base; its origin and speed are not yet known on the surface.' });
    hit.forEach((a, i) => {
      let text = 'Surface stations confirm the dust front here.';
      if (infer && i >= 1) {
        const r = infer(hit.slice(0, i + 1).map((h) => ({ id: h.id, sol: h.sol })), a.sol);
        const next = r && Object.entries(r.eta).map(([id, e]) => `${BASES.find((b) => b.id === id).name} sol ${e.lo.toFixed(1)}–${e.hi.toFixed(1)}`);
        if (r && r.speed) text += ` Shared estimate from ${i + 1} reports: speed ${r.speed.lo.toFixed(0)}–${r.speed.hi.toFixed(0)} m/s${next.length ? `; expect it at ${next.join(', ')}` : ''}.`;
      } else if (i === 0) text += ' First report: one arrival time cannot fix the origin or speed yet.';
      ev.push({ sol: a.sol, who: a.name, kind: 'surface', text });
    });
    return ev.sort((a, b) => a.sol - b.sol);
  }
  /** Warning each base gets, in sols, with and without sharing. */
  warning(orbiter = true) {
    const hit = this.arrivals.filter((a) => a.sol !== null).sort((a, b) => a.sol - b.sol);
    const firstSurface = hit[0]?.sol ?? null;
    return this.arrivals.map((a) => {
      if (a.sol === null) return { ...a, shared: null, relay: null };
      const relay = firstSurface !== null && firstSurface < a.sol ? a.sol - firstSurface : 0;
      const orb = orbiter && a.sol > 1 ? a.sol - 1 : 0;
      return { ...a, relay, shared: Math.max(relay, orb) };
    });
  }
  status(base, sol) {
    const a = this.arrivals.find((x) => x.id === base.id);
    if (a.sol !== null && sol >= a.sol && sol <= this.sc.lifeSols) return 'storm';
    if (a.sol !== null && sol < a.sol && this.log(sol).length) return 'watch';
    return 'clear';
  }
}

// ---------- What the bases can work out on their own ----------
// Nobody is told where the storm started. Each base only knows when the dust front reached it.
// With the same growing-disc model, a candidate origin c is consistent if one speed v and start time t0 explain
// every arrival so far (t_i = t0 + d(c, base_i) / v) and no base still clear should already be covered.
// Searching every origin on a 3° grid gives the set of possible origins and, from it, an arrival range per base.
export const INFER = { gridDeg: 3, toleranceSol: 0.35, vMin: 1, vMax: 40, maxAgeSol: 30 };

let GRID = null;
function grid() {
  if (GRID) return GRID;
  GRID = [];
  for (let lat = -84; lat <= 84; lat += INFER.gridDeg) {
    const step = INFER.gridDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    for (let lon = 0; lon < 360; lon += step) GRID.push({ lat, lon });
  }
  return GRID;
}

/**
 * hits: [{ id, sol }] bases the front has reached by `now`. Returns null with fewer than two hits;
 * otherwise { n, candidates: [{lat, lon, v, t0}], eta: { baseId: { lo, mid, hi } }, speed: { lo, mid, hi } }.
 */
export function inferStorm(hits, now) {
  if (hits.length < 2) return null;
  const hitBases = hits.map((h) => ({ ...BASES.find((b) => b.id === h.id), t: h.sol }));
  const clear = BASES.filter((b) => !hits.some((h) => h.id === b.id));
  const kmPerSol = (ms) => (ms * SOL_S) / 1000;
  const out = [];
  for (const c of grid()) {
    const d = hitBases.map((b) => gcKm(c, b));
    // least squares fit of t = t0 + s·d (s = 1/speed)
    const n = d.length, md = d.reduce((a, x) => a + x, 0) / n, mt = hitBases.reduce((a, b) => a + b.t, 0) / n;
    let sdd = 0, sdt = 0;
    d.forEach((x, i) => { sdd += (x - md) ** 2; sdt += (x - md) * (hitBases[i].t - mt); });
    if (sdd < 1) continue;
    const slope = sdt / sdd; if (slope <= 0) continue;
    const v = 1 / slope;                                    // km per sol
    if (v < kmPerSol(INFER.vMin) || v > kmPerSol(INFER.vMax)) continue;
    const t0 = mt - slope * md;
    if (t0 > Math.min(...hitBases.map((b) => b.t)) || t0 < now - INFER.maxAgeSol) continue;
    const rms = Math.sqrt(d.reduce((a, x, i) => a + (hitBases[i].t - (t0 + x / v)) ** 2, 0) / n);
    if (rms > INFER.toleranceSol) continue;
    if (clear.some((b) => gcKm(c, b) <= v * (now - t0))) continue; // would already have reached a clear base
    out.push({ lat: c.lat, lon: c.lon, v, t0 });
  }
  if (!out.length) return { n: hits.length, candidates: [], eta: {}, speed: null };
  const q = (arr) => { const a = arr.slice().sort((x, y) => x - y); return { lo: a[Math.floor(a.length * 0.05)], mid: a[Math.floor(a.length / 2)], hi: a[Math.floor(a.length * 0.95)] }; };
  const eta = {};
  for (const b of clear) eta[b.id] = q(out.map((c) => c.t0 + gcKm(c, b) / c.v));
  return { n: hits.length, candidates: out, eta, speed: q(out.map((c) => (c.v * 1000) / SOL_S)) };
}

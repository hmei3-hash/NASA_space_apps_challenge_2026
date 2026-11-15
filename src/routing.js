// A* route generation on the slope grid + route profiles (distance, time, gain, slope).
// Pure JS, no three.js. Tested by scripts/test_routing.mjs.

import { CONFIG } from './config.js';

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p; let i = k.length; k.push(key); p.push(pri);
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= pri) break; k[i] = k[j]; p[i] = p[j]; i = j; }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const k = this.k, p = this.p, top = k[0], lk = k.pop(), lp = p.pop(), n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = lk; p[i] = lp;
    }
    return top;
  }
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Walking speed in km/h for a signed grade (rise/run), Tobler hiking function × suit factor. */
export function speedKmh(grade, suit = CONFIG.toblerSuitFactor.value) {
  return 6 * Math.exp(-3.5 * Math.abs(grade + 0.05)) * suit;
}

/**
 * A* on the grid. mode: 'shortest' | 'gentlest'. Hard constraint: cells steeper than maxSlope are impassable.
 * Returns array of cell indices, or null when no traversable path exists.
 */
export function astar(t, start, goal, mode, maxSlope = CONFIG.maxSlopeDeg.value) {
  const { w, h, cell, z, slope } = t;
  const N = w * h;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const gr = Math.floor(goal / w), gc = goal % w;
  const heur = (i) => Math.hypot(Math.floor(i / w) - gr, (i % w) - gc) * cell; // admissible: factor >= 1
  const heap = new MinHeap();
  g[start] = 0; heap.push(start, heur(start));
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const r = Math.floor(cur / w), c = cur % w;
    for (const [dc, dr] of NB) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
      const ni = nr * w + nc;
      if (closed[ni]) continue;
      if (slope[ni] > maxSlope && ni !== goal) continue;
      const run = (dr && dc ? Math.SQRT2 : 1) * cell;
      const d3 = Math.hypot(run, z[ni] - z[cur]);
      let cost = d3;
      if (mode === 'gentlest') {
        const s = slope[ni] / maxSlope;
        cost = d3 * (1 + 6 * s * s);
      }
      const ng = g[cur] + cost;
      if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; heap.push(ni, ng + heur(ni)); }
    }
  }
  if (!isFinite(g[goal])) return null;
  const path = [];
  for (let i = goal; i !== -1; i = came[i]) path.push(i);
  return path.reverse();
}

/** Nearest traversable cell (BFS ring search) — used to snap clicks that land on steep cells. */
export function snapTraversable(t, idx, maxSlope = CONFIG.maxSlopeDeg.value) {
  if (t.slope[idx] <= maxSlope) return idx;
  const r0 = Math.floor(idx / t.w), c0 = idx % t.w;
  for (let rad = 1; rad < 40; rad++) {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r >= t.h || c >= t.w) continue;
      if (t.slope[r * t.w + c] <= maxSlope) return r * t.w + c;
    }
  }
  return idx;
}

function legSamples(t, path) {
  // per-cell points in metres; x east, y south (grid frame), z elevation
  return path.map((i) => ({ i, x: (i % t.w) * t.cell, y: Math.floor(i / t.w) * t.cell, z: t.z[i], slope: t.slope[i] }));
}

/**
 * Build a timed profile from a list of legs. Each leg: {cells:[...], stopAfterMin, stopTag}
 * Returns samples with t (seconds since EVA start) plus summary metrics.
 */
export function buildProfile(t, legs) {
  const samples = [];
  let time = 0, dist = 0, gain = 0, loss = 0, maxSlope = 0, slopeAcc = 0;
  for (const leg of legs) {
    const pts = legSamples(t, leg.cells);
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      if (samples.length) {
        const q = samples[samples.length - 1];
        const run = Math.hypot(p.x - q.x, p.y - q.y);
        if (run > 0) {
          const dz = p.z - q.z, grade = dz / run;
          const seg = Math.hypot(run, dz);
          const dt = (seg / 1000 / speedKmh(grade)) * 3600;
          time += dt; dist += seg; slopeAcc += p.slope * seg;
          if (dz > 0) gain += dz; else loss -= dz;
          maxSlope = Math.max(maxSlope, p.slope);
          samples.push({ ...p, t: time, grade, phase: leg.phase });
          continue;
        }
      }
      samples.push({ ...p, t: time, grade: 0, phase: leg.phase });
    }
    if (leg.stopAfterMin) {
      const last = samples[samples.length - 1];
      time += leg.stopAfterMin * 60;
      samples.push({ ...last, t: time, grade: 0, phase: 'stop', stopTag: leg.stopTag });
    }
  }
  return {
    samples,
    durationS: time,
    distanceM: dist,
    gainM: gain,
    lossM: loss,
    maxSlopeDeg: maxSlope,
    meanSlopeDeg: dist ? slopeAcc / dist : 0,
  };
}

const straightTimeS = (t, a, b) =>
  (Math.hypot((a % t.w) - (b % t.w), Math.floor(a / t.w) - Math.floor(b / t.w)) * t.cell * 1.25 / 1000 / speedKmh(0)) * 3600;

/**
 * Generate the three Route Profiles for a round-trip EVA habitat -> destination -> habitat.
 * sites: [{id, idx}] candidate science sites (grid indices).
 */
export function generateRoutes(t, habitatIdx, destIdx, sites, opts = {}) {
  const maxSlope = opts.maxSlope ?? CONFIG.maxSlopeDeg.value;
  const budgetS = (opts.evaLimitH ?? CONFIG.evaLimitH.value) * 3600;
  const stopMin = opts.stopMin ?? CONFIG.stopMinPerSite.value;
  const out = {};

  for (const mode of ['shortest', 'gentlest']) {
    const there = astar(t, habitatIdx, destIdx, mode, maxSlope);
    if (!there) { out[mode] = null; continue; }
    out[mode] = buildProfile(t, [
      { cells: there, phase: 'out', stopAfterMin: stopMin, stopTag: 'destination' },
      { cells: there.slice().reverse().slice(1), phase: 'return' },
    ]);
    out[mode].visited = [];
  }

  // Science route: greedily insert sites (cheapest insertion by straight-line estimate) while within budget.
  const pool = sites.filter((s) => s.idx !== destIdx);
  let order = [];
  const est = (ord) => {
    const seq = [habitatIdx, ...ord.map((s) => s.idx), destIdx, habitatIdx];
    let s = 0; for (let k = 1; k < seq.length; k++) s += straightTimeS(t, seq[k - 1], seq[k]);
    return s + (ord.length + 1) * stopMin * 60;
  };
  for (;;) {
    let best = null;
    for (const s of pool) {
      if (order.includes(s)) continue;
      for (let pos = 0; pos <= order.length; pos++) {
        const cand = [...order.slice(0, pos), s, ...order.slice(pos)];
        const e = est(cand);
        if (e <= budgetS && (!best || e < best.e)) best = { cand, e };
      }
    }
    if (!best) break;
    order = best.cand;
  }
  const tryBuild = (ord) => {
    const seq = [habitatIdx, ...ord.map((s) => s.idx), destIdx];
    const legs = [];
    for (let k = 1; k < seq.length; k++) {
      const p = astar(t, seq[k - 1], seq[k], 'gentlest', maxSlope);
      if (!p) return null;
      const tag = k < seq.length - 1 ? ord[k - 1].id : 'destination';
      legs.push({ cells: k === 1 ? p : p.slice(1), phase: 'out', stopAfterMin: stopMin, stopTag: tag });
    }
    const back = astar(t, destIdx, habitatIdx, 'gentlest', maxSlope);
    if (!back) return null;
    legs.push({ cells: back.slice(1), phase: 'return' });
    const prof = buildProfile(t, legs);
    prof.visited = ord.map((s) => s.id);
    return prof;
  };
  let sci = tryBuild(order);
  while (sci && sci.durationS > budgetS && order.length) { order = order.slice(0, -1); sci = tryBuild(order); }
  out.science = sci;
  return out;
}

/** Fraction of cells shared between two routes (to tell the user when routes overlap). */
export function overlap(a, b) {
  if (!a || !b) return 0;
  const sa = new Set(a.samples.map((s) => s.i));
  const sb = b.samples.map((s) => s.i);
  return sb.filter((i) => sa.has(i)).length / sb.length;
}

/** Interpolated state at time tS along a profile. */
export function sampleAt(prof, tS) {
  const S = prof.samples;
  if (tS <= S[0].t) return { ...S[0], k: 0 };
  if (tS >= S[S.length - 1].t) return { ...S[S.length - 1], k: S.length - 1 };
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].t <= tS) lo = m; else hi = m; }
  const a = S[lo], b = S[hi], f = (tS - a.t) / Math.max(1e-6, b.t - a.t);
  return {
    x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f,
    slope: b.slope, grade: b.grade, phase: b.phase, stopTag: b.stopTag, i: b.i, k: hi,
    heading: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

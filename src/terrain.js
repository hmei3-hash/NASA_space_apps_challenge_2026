// Terrain grid: real (preprocessed CTX/HiRISE DEM crop) or synthetic fallback.
// Pure data, no three.js, so it can be unit-tested in Node.

import { LABEL } from './config.js';

export function computeSlope(z, w, h, cell) {
  const s = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cl = Math.max(c - 1, 0), cr = Math.min(c + 1, w - 1);
      const ru = Math.max(r - 1, 0), rd = Math.min(r + 1, h - 1);
      const dzdx = (z[r * w + cr] - z[r * w + cl]) / ((cr - cl) * cell);
      const dzdy = (z[rd * w + c] - z[ru * w + c]) / ((rd - ru) * cell);
      s[r * w + c] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    }
  }
  return s;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const N = 256, perm = new Uint8Array(512), val = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = rnd() * 2 - 1; }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const lerp = (a, b, t) => a + (b - a) * t;
  const fade = (t) => t * t * (3 - 2 * t);
  const v2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (i, j) => val[perm[(perm[(i & 255)] + (j & 255)) & 511]];
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), fade(xf)), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), fade(xf)), fade(yf));
  };
  return (x, y, oct = 5) => {
    let a = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { a += amp * v2(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
    return a / norm;
  };
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Synthetic delta-front-like terrain. Clearly labeled SYNTHETIC in the UI. */
export function syntheticTerrain(n = 256, cell = 20, seed = 7) {
  const noise = makeNoise(seed);
  const rnd = mulberry32(seed + 1);
  const z = new Float32Array(n * n);
  const craters = Array.from({ length: 14 }, () => ({ u: rnd(), v: 0.45 + rnd() * 0.55, r: 0.01 + rnd() * 0.035 }));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const u = c / (n - 1), v = r / (n - 1); // v grows southward
      const front = 0.42 + 0.07 * Math.sin(u * 7.0) + 0.035 * Math.sin(u * 17 + 1.3);
      const scarpH = 45 + 25 * noise(u * 3, 9.1, 2);
      const width = 0.035 + 0.02 * (noise(u * 5, 3.3, 2) + 1);
      let h = -2550 + scarpH * smooth(-width, width, front - v);
      h += 6 * noise(u * 12, v * 12) + 1.5 * noise(u * 60, v * 60, 3);
      for (const k of craters) {
        const d = Math.hypot(u - k.u, v - k.v) / k.r;
        if (d < 1.4) h += k.r * 5000 * 0.18 * (d < 1 ? (d * d - 1) : 0.6 * Math.exp(-((d - 1.05) ** 2) / 0.02));
      }
      z[r * n + c] = h;
    }
  }
  return {
    w: n, h: n, cell, z, slope: computeSlope(z, n, n, cell),
    source: { kind: 'synthetic', label: 'Synthetic (procedural)', dem: 'procedural delta-front stand-in', ortho: null },
    orthoUrl: null,
  };
}

export const DEFAULT_SITES_SYNTH = {
  habitat: { name: 'Habitat (assumed site)', u: 0.74, v: 0.80, label: LABEL.ASSUMP },
  sites: [
    { id: 'S1', name: 'Delta front outcrop A', u: 0.30, v: 0.47, label: LABEL.ASSUMP, image: null },
    { id: 'S2', name: 'Delta top, layered cap B', u: 0.55, v: 0.33, label: LABEL.ASSUMP, image: null },
    { id: 'S3', name: 'Boulder field C', u: 0.18, v: 0.62, label: LABEL.ASSUMP, image: null },
  ],
};

async function fetchJson(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

/** Load preprocessed real terrain from public/data, else synthetic. */
export async function loadTerrain() {
  const meta = await fetchJson('data/terrain.json');
  let terrain;
  if (meta) {
    try {
      const buf = await (await fetch('data/' + meta.heights)).arrayBuffer();
      const z = new Float32Array(buf);
      if (z.length !== meta.width * meta.height) throw new Error('size mismatch');
      terrain = {
        w: meta.width, h: meta.height, cell: meta.cellSize, z,
        slope: computeSlope(z, meta.width, meta.height, meta.cellSize),
        source: { kind: 'real', label: LABEL.OBS, dem: meta.demSource, ortho: meta.orthoSource, center: meta.center },
        orthoUrl: meta.ortho ? 'data/' + meta.ortho : null,
      };
    } catch (e) {
      console.warn('terrain.json present but heights failed to load, using synthetic', e);
    }
  }
  if (!terrain) terrain = syntheticTerrain();
  const sites = (await fetchJson('data/sites.json')) || DEFAULT_SITES_SYNTH;
  return { terrain, sites };
}

export function uvToCell(t, u, v) {
  return { c: Math.round(u * (t.w - 1)), r: Math.round(v * (t.h - 1)) };
}

// Time-synchronized environment for the Mission Timeline.
// Sources (in order of preference) are always reported with a provenance label.

import { CONFIG, LABEL } from './config.js';

export const SOL_S = 88775.244;          // one sol in SI seconds
export const MARS_HOUR_S = SOL_S / 24;   // one LTST "hour"
const RHO_AIR = 0.020;                   // kg/m^3, typical near-surface density (Model Estimate)

async function fetchJson(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

// Fallback RAD numbers come from this repo's own processed RAD summary (quiet_2019 window, dose_E median).
const RAD_FALLBACK = {
  baseline: { uGyPerDay: 307.7, signal: 'dose_E (tissue-equivalent plastic)', window: 'quiet 2019-06', site: 'Gale crater (Curiosity RAD)' },
  sep: null,
};

export class Environment {
  constructor() {
    this.meda = null;
    this.rad = RAD_FALLBACK;
    this.scenarios = { dust: { on: false, startS: 1 * 3600 }, sep: { on: false, startS: 1.5 * 3600 } };
    this.refElevation = 0; // elevation at which MEDA pressure is taken to apply (habitat)
  }

  async load() {
    const m = await fetchJson('data/meda_sol.json');
    if (m && Array.isArray(m.bins) && m.bins.length > 4) this.meda = m;
    const r = await fetchJson('data/rad.json');
    if (r && r.baseline) this.rad = r;
    return this;
  }

  ltstH(tS) { return (CONFIG.evaStartLtstH.value + tS / MARS_HOUR_S) % 24; }

  _medaInterp(key, h) {
    const b = this.meda.bins.filter((x) => x[key] !== null && x[key] !== undefined);
    if (!b.length) return null;
    let lo = b[0], hi = b[b.length - 1];
    if (h <= lo.h) return lo[key];
    if (h >= hi.h) return hi[key];
    for (let k = 1; k < b.length; k++) if (b[k].h >= h) { lo = b[k - 1]; hi = b[k]; break; }
    // don't bridge large MEDA data gaps (MEDA samples ~12 h/sol in alternating blocks)
    if (hi.h - lo.h > 1.5) return null;
    const f = (h - lo.h) / Math.max(1e-6, hi.h - lo.h);
    return lo[key] + (hi[key] - lo[key]) * f;
  }

  temperature(tS) {
    const h = this.ltstH(tS);
    if (this.meda) {
      const v = this._medaInterp('T', h);
      if (v !== null) return { v, unit: '°C', label: LABEL.REPLAY, src: `MEDA ATS, sol ${this.meda.sol}, at rover`, short: `MEDA sol ${this.meda.sol}, at the rover` };
    }
    const v = -78 + 58 * Math.max(0, Math.sin((Math.PI * (h - 6)) / 13));
    return { v, unit: '°C', label: LABEL.MODEL, src: 'built-in diurnal placeholder (not MCD)', short: 'Placeholder daily cycle, not measured' };
  }

  pressure(tS, z) {
    const h = this.ltstH(tS);
    let p0 = null, label = LABEL.MODEL, src = 'built-in diurnal placeholder (not MCD)';
    if (this.meda) {
      p0 = this._medaInterp('P', h);
      if (p0 !== null) { label = LABEL.REPLAY; src = `MEDA PS, sol ${this.meda.sol}`; }
    }
    if (p0 === null) p0 = 730 * (1 + 0.025 * Math.cos((2 * Math.PI * (h - 6)) / 24) - 0.01 * Math.cos((4 * Math.PI * (h - 10)) / 24));
    const dz = z - this.refElevation;
    const v = p0 * Math.exp(-dz / CONFIG.pressureScaleHeightM.value);
    if (Math.abs(dz) > 1) { label = `${label} + ${LABEL.MODEL}`; src += ', shifted to local elevation (scale height)'; }
    const short = label.startsWith(LABEL.REPLAY) ? `MEDA at the rover, adjusted to this elevation` : 'Placeholder daily cycle, not measured';
    return { v, unit: 'Pa', label, src, short };
  }

  wind(tS) {
    const h = this.ltstH(tS);
    let v = null, label = LABEL.MODEL, src = 'built-in diurnal placeholder (not MCD)';
    if (this.meda) {
      v = this._medaInterp('W', h);
      if (v !== null) { label = LABEL.REPLAY; src = `MEDA WS, sol ${this.meda.sol}, at rover`; }
    }
    if (v === null) v = 2.5 + 5 * Math.exp(-(((h - 13.5) / 2.5) ** 2));
    if (this.scenarios.dust.on && tS >= this.scenarios.dust.startS) { v = Math.max(v, 15); label = LABEL.SCENARIO; src = 'dust-storm scenario'; }
    const q = 0.5 * RHO_AIR * v * v;
    const short = label === LABEL.REPLAY ? 'MEDA at the rover' : label === LABEL.SCENARIO ? 'Dust storm scenario' : 'Placeholder daily cycle';
    return { v, unit: 'm/s', label, src, short, dynamicPressurePa: q };
  }

  dustTau(tS) {
    const base = CONFIG.dustTauBaseline.value;
    const d = this.scenarios.dust;
    if (d.on && tS >= d.startS) {
      const ramp = Math.min(1, (tS - d.startS) / 1800);
      return { v: base + (CONFIG.dustTauStorm.value - base) * ramp, label: LABEL.SCENARIO, src: 'injected dust-storm event', short: 'Injected dust storm' };
    }
    return { v: base, label: LABEL.ASSUMP, src: 'typical non-storm column dust optical depth', short: 'Typical clear-season value' };
  }

  /** Direct solar beam transmission exp(-tau/mu), mu from a crude LTST sun-elevation model. */
  beamTransmission(tS) {
    const h = this.ltstH(tS);
    const elev = Math.max(0, Math.sin((Math.PI * (h - 6)) / 12)) * (Math.PI / 2) * 0.85;
    const mu = Math.sin(elev);
    const tau = this.dustTau(tS).v;
    return { v: mu > 0.02 ? Math.exp(-tau / mu) : 0, label: LABEL.MODEL, src: 'Beer–Lambert, simple sun-elevation model', short: 'From dust depth and sun height' };
  }

  doseRate(tS) {
    const b = this.rad.baseline;
    const s = this.scenarios.sep;
    if (s.on && this.rad.sep && tS >= s.startS) {
      const hrs = (tS - s.startS) / 3600;
      const P = this.rad.sep;
      let v = P.uGyPerDay[P.uGyPerDay.length - 1];
      for (let k = 1; k < P.tH.length; k++) {
        if (P.tH[k] >= hrs) { const f = (hrs - P.tH[k - 1]) / (P.tH[k] - P.tH[k - 1]); v = P.uGyPerDay[k - 1] + (P.uGyPerDay[k] - P.uGyPerDay[k - 1]) * f; break; }
      }
      return { v, unit: 'µGy/day', label: LABEL.SCENARIO, src: `SEP profile observed by RAD (${P.event}), replayed as a scenario`, short: 'May 2024 RAD solar event, replayed' };
    }
    if (s.on && !this.rad.sep && tS >= s.startS) {
      return { v: b.uGyPerDay * 20, unit: 'µGy/day', label: LABEL.SCENARIO, src: 'SEP scenario (×20 placeholder; run preprocess_rad.py for the observed profile)', short: 'Placeholder solar event (×20)' };
    }
    return { v: b.uGyPerDay, unit: 'µGy/day', label: LABEL.OBS, src: `RAD ${b.signal}, ${b.window}, ${b.site} — not Jezero`, short: 'Curiosity RAD at Gale crater, not Jezero' };
  }

  /** Cumulative dose (µGy) from 0..tS by 60 s integration. */
  cumulativeDose(tS) {
    let acc = 0;
    for (let t = 0; t < tS; t += 60) acc += this.doseRate(t).v * (Math.min(60, tS - t) / 86400);
    return { v: acc, unit: 'µGy', label: LABEL.MODEL, src: 'dose rate × time; no terrain shielding modeled', short: 'Dose rate × time, no shielding modelled' };
  }
}

// Checks the radiation model: pressure shift (Guo et al. 2015) and the nowcast trigger (Löwe et al. 2025)
// on the May 2024 RAD event profile in public/data/rad.json.
import { readFileSync } from 'node:fs';
import { RAD, gcrDose, nowcast } from '../src/radmodel.js';

let bad = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'MISS'} ${msg}`); if (!ok) bad++; };
const rad = JSON.parse(readFileSync(new URL('../public/data/rad.json', import.meta.url)));
const D0 = rad.baseline.uGyPerDay;

check(gcrDose(D0, RAD.pRefPa) === D0, `no shift at the reference pressure (${D0} µGy/day at ${RAD.pRefPa} Pa)`);
check(gcrDose(D0, 900) < gcrDose(D0, 700), 'more air overhead gives a lower dose');
const jez = gcrDose(D0, 730);
console.log(`     Jezero at ~730 Pa: ${jez.toFixed(1)} µGy/day (+${(jez - D0).toFixed(1)} vs Gale's 840 Pa)`);
const H = 11100, p = (dz) => 730 * Math.exp(-dz / H);
console.log(`     100 m higher: ${(gcrDose(D0, p(100)) - jez).toFixed(2)} µGy/day; 2 km higher: ${(gcrDose(D0, p(2000)) - jez).toFixed(1)} µGy/day`);

const P = rad.sep;
const doseAt = (t) => { const h = t / 3600; if (h < 0) return D0; for (let k = 1; k < P.tH.length; k++) if (P.tH[k] >= h) { const f = (h - P.tH[k - 1]) / (P.tH[k] - P.tH[k - 1]); return P.uGyPerDay[k - 1] + (P.uGyPerDay[k] - P.uGyPerDay[k - 1]) * f; } return P.uGyPerDay.at(-1); };
let kPeak = 0; P.uGyPerDay.forEach((v, i) => { if (v > P.uGyPerDay[kPeak]) kPeak = i; });
const peakS = P.tH[kPeak] * 3600;
// readings every 15 min; where onset falls between readings shifts confirmation by up to one reading
const n = nowcast(doseAt, D0, -3600, 8 * 3600);
const late = nowcast((t) => doseAt(t - 1), D0, -3600, 8 * 3600); // onset 1 s after a reading
check(n !== null, 'the nowcast fires on the May 2024 event');
if (n) {
  console.log(`     onset t=0, trigger ${(n.trigger / 60).toFixed(0)} min, confirm ${(n.confirm / 60).toFixed(0)} min, peak ${(peakS / 60).toFixed(0)} min (${Math.round(P.uGyPerDay[kPeak])} µGy/day)`);
  console.log(`     onset just after a reading: confirm ${((late.confirm - 1) / 60).toFixed(0)} min after onset`);
  check(n.confirm <= peakS && late.confirm - 1 <= peakS, 'confirmed before the peak either way');
}
if (bad) { console.error(`${bad} radiation check(s) failed`); process.exit(1); }
console.log('all radiation checks passed');

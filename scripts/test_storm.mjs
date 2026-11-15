// Checks the planet-scale storm model against the dated observations listed in each scenario.
import { StormSim, SCENARIOS, BASES } from '../src/stormsim.js';
let bad = 0;
for (const k of Object.keys(SCENARIOS)) {
  const s = new StormSim(k);
  for (const c of s.sc.checks) {
    const p = c.base ? BASES.find((b) => b.id === c.base) : c.point, m = s.arrivalSol(p);
    const ok = m !== null && m >= c.observedSol[0] && m <= c.observedSol[1];
    console.log(`${ok ? 'ok  ' : 'MISS'} ${k}: model sol ${m}, observed ${c.observedSol[0]}–${c.observedSol[1]}  ${c.what}`);
    if (!ok) bad++;
  }
}
const fast = new StormSim('flush', 40).warning().find((w) => w.id === 'jezero');
if (!(fast.shared === 0)) { console.log('MISS fast storm should beat the daily orbital map'); bad++; }
if (bad) { console.error(`${bad} storm check(s) failed`); process.exit(1); }
console.log('all storm checks passed');

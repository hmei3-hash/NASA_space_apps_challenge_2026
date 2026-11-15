// Checks the planet-scale storm model against the dated observations listed in each scenario.
import { StormSim, SCENARIOS, BASES, inferStorm } from '../src/stormsim.js';
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
// bases infer the 2018 storm without being told its origin: after three reports, Gale's range must contain the true arrival
{
  const s = new StormSim('gds2018'), hits = s.arrivals.filter((a) => a.sol !== null).sort((a, b) => a.sol - b.sol);
  const r = inferStorm(hits.slice(0, 3).map((h) => ({ id: h.id, sol: h.sol })), hits[2].sol + 0.01), g = r.eta.gale, truth = hits.find((h) => h.id === 'gale').sol;
  const ok = g && g.lo <= truth && truth <= g.hi;
  console.log(`${ok ? 'ok  ' : 'MISS'} 2018: from 3 reports bases estimate Gale at sol ${g.lo.toFixed(1)}–${g.hi.toFixed(1)}, true ${truth}`);
  if (!ok) bad++;
}
if (bad) { console.error(`${bad} storm check(s) failed`); process.exit(1); }
console.log('all storm checks passed');

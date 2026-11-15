// Quick sanity tests for routing on the synthetic terrain: node scripts/test_routing.mjs
import { syntheticTerrain, DEFAULT_SITES_SYNTH, uvToCell } from '../src/terrain.js';
import { generateRoutes, astar, speedKmh, sampleAt, overlap } from '../src/routing.js';
import assert from 'node:assert/strict';

const t = syntheticTerrain();
const idx = ({ u, v }) => { const { c, r } = uvToCell(t, u, v); return r * t.w + c; };
const hab = idx(DEFAULT_SITES_SYNTH.habitat);
const sites = DEFAULT_SITES_SYNTH.sites.map((s) => ({ id: s.id, idx: idx(s) }));
const steep = t.slope.filter((s) => s > 15).length / t.slope.length;
console.log(`synthetic grid ${t.w}x${t.h}, cell ${t.cell} m, ${(steep * 100).toFixed(1)}% cells > 15°`);

assert.ok(Math.abs(speedKmh(0) - 3.1) < 0.3, 'flat speed ~3.1 km/h');
assert.ok(speedKmh(0.2) < speedKmh(0), 'uphill slower');

const t0 = Date.now();
const R = generateRoutes(t, hab, sites[1].idx, sites);
console.log(`routes in ${Date.now() - t0} ms`);
for (const [k, r] of Object.entries(R)) {
  assert.ok(r, `${k} route exists`);
  const over = r.samples.filter((s) => s.slope > 15 && s.i !== sites[1].idx).length;
  assert.equal(over, 0, `${k}: no cells over slope limit`);
  assert.equal(r.samples[0].i, hab); assert.equal(r.samples[r.samples.length - 1].i, hab);
  for (let k2 = 1; k2 < r.samples.length; k2++) assert.ok(r.samples[k2].t >= r.samples[k2 - 1].t);
  console.log(k.padEnd(9), `${(r.distanceM / 1000).toFixed(2)} km`, `${(r.durationS / 3600).toFixed(2)} h`, `gain ${r.gainM.toFixed(0)} m`, `max ${r.maxSlopeDeg.toFixed(1)}°`, `mean ${r.meanSlopeDeg.toFixed(1)}°`, 'visits', r.visited.join(',') || '-');
}
assert.ok(R.shortest.distanceM <= R.gentlest.distanceM + 1, 'shortest is shortest');
assert.ok(R.gentlest.meanSlopeDeg <= R.shortest.meanSlopeDeg + 1e-6, 'gentlest is gentler');
assert.ok(R.science.durationS <= 7 * 3600, 'science route within budget');
console.log('overlap shortest/gentlest', overlap(R.shortest, R.gentlest).toFixed(2));
const mid = sampleAt(R.gentlest, R.gentlest.durationS / 2);
assert.ok(Number.isFinite(mid.x) && Number.isFinite(mid.z));
// unreachable when limit is tiny
assert.equal(astar(t, hab, sites[0].idx, 'shortest', 0.5), null);
console.log('all routing tests passed');

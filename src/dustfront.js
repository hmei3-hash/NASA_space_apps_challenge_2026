// Dust-front early warning from a proposed surface weather network around the Exploration Zone.
//
// What comes from sources (docs/RESEARCH.md):
// - Front speed 25 m/s: Jezero, Jan 2022 regional storm (Sánchez-Lavega et al. 2025).
// - Exploration Zone radius ~100 km around the landing site (NASA EZ / field-station concept).
// - Four-lander regional network (ESA Mars Weather Network study, Rajendran et al. 2025).
// - A met package at the landing site measuring continuously, opacity every 10 min (MEPAG MHP SSG 2005).
// Two-team broadcast: an optional second EVA team west of the habitat acts as a mobile station (Assumption).
// What is assumed: where the four stations sit (on the EZ boundary at N/E/S/W), the confirmation
// delay, and a straight north–south front moving east (the 2022 storm reactivated west of Jezero).

export const FRONT = { speedMs: 25, confirmS: 90 };

export const NETWORKS = {
  ez100: { name: 'EZ ring: 4 stations at 100 km + habitat', ringKm: 100 },
  ring30: { name: 'Compact ring: 4 stations at 30 km + habitat', ringKm: 30 },
  habitat: { name: 'Habitat met station only', ringKm: 0 },
};

const BEARINGS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];

export class DustFront {
  /** habitatX/Y in grid metres (x east, y south); arriveHabitatS = mission time the front reaches the habitat. */
  constructor(habitatX, habitatY, arriveHabitatS, networkKey = 'ez100', teamKm = 0) {
    this.hx = habitatX; this.hy = habitatY; this.tHab = arriveHabitatS; this.v = FRONT.speedMs;
    const net = NETWORKS[networkKey] || NETWORKS.ez100;
    this.network = net;
    const ring = net.ringKm ? BEARINGS.map(([id, b]) => {
      const r = (b * Math.PI) / 180;
      return { id: `EZ-${id}`, km: net.ringKm, dir: id, x: habitatX + net.ringKm * 1000 * Math.sin(r), y: habitatY - net.ringKm * 1000 * Math.cos(r) };
    }) : [];
    this.stations = [...ring, { id: 'HAB', km: 0, dir: '', x: habitatX, y: habitatY - 60 }];
    // A second EVA team working west of the habitat (Assumption). It reports the front when the front reaches it,
    // so for everyone east of it the team is one more upwind station.
    if (teamKm > 0) this.stations.push({ id: 'TEAM-B', team: true, km: teamKm, dir: 'W', x: habitatX - teamKm * 1000, y: habitatY + 500 });
  }
  x(t) { return this.hx - this.v * (this.tHab - t); }
  arrivalAt(x) { return this.tHab + (x - this.hx) / this.v; }
  detections() {
    return this.stations.map((s) => ({ ...s, t: this.arrivalAt(s.x) + FRONT.confirmS })).sort((a, b) => a.t - b.t);
  }
  knowledge(t, crewX) {
    const det = this.detections().filter((d) => d.t <= t);
    if (!det.length) return null;
    // speed needs two detections at different east–west positions
    const xs = [...new Map(det.map((d) => [Math.round(d.x), d])).values()];
    let speed = this.v, speedLabel = 'assumed';
    if (xs.length >= 2) { const a = xs[xs.length - 2], b = xs[xs.length - 1]; speed = (b.x - a.x) / (b.t - a.t); speedLabel = 'measured'; }
    const last = det[det.length - 1];
    const frontXEst = last.x + speed * (t - (last.t - FRONT.confirmS));
    return { det, speed, speedLabel, etaS: Math.max(0, (crewX - frontXEst) / speed), frontXEst, passed: frontXEst >= crewX };
  }
}

export const leadTimeS = (km, speed = FRONT.speedMs) => (km * 1000) / speed - FRONT.confirmS;

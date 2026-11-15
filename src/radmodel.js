// Radiation model, two layers. Sources and quotes: docs/RESEARCH.md, section 5.
//
// Layer A, background dose vs air pressure (galactic cosmic rays only):
//   D(P) = D_ref + kappa * (P - P_ref)
//   kappa = -0.13 ± 0.02 µGy/day per Pa, fitted to Curiosity RAD detector E against REMS pressure at Gale
//   (Guo et al. 2015, ApJ; arXiv:1507.03473, section 4.1.2). More air overhead = more shielding = lower dose.
//   We apply the Gale fit to other elevations through the hydrostatic pressure: an extrapolation (Assumption).
//   Not applied to solar particle events: their surface dose depends on the event's energy spectrum.
//
// Layer B, solar-particle-event nowcast (Löwe et al. 2025, Space Weather 23, e2025SW004372):
//   a 15-minute reading above 1.25 × background triggers; the next reading above it too confirms.
//   Our network rule (Assumption): an alert goes out when 2 of the 4 dose sensors have confirmed.
//   Particles arrive everywhere at once, so the sensors add confirmation, not warning time.

export const RAD = {
  kappa: -0.13, kappaErr: 0.02,   // µGy/day per Pa (Guo et al. 2015)
  pRefPa: 840,                    // mean REMS pressure at Gale over the fit period (Guo et al. 2015, section 4.2.1)
  trigger: 1.25,                  // reading / background (Löwe et al. 2025)
  cadenceS: 900,                  // 15-minute readings (Löwe et al. 2025)
  needed: 2,                      // sensors that must confirm (Assumption)
  sensors: 4,                     // dose sensors within 100 km of the habitat (Assumption)
  maxAwayS: 30 * 60,              // "should not move more than 30 minutes away from a shelter" (Löwe et al. 2025)
  // Dose limit. Absorbed dose (µGy) to dose equivalent (mSv): RAD measured 0.21 mGy/day and 0.64 mSv/day on the surface
  // (Hassler et al. 2014, Science), so 1 µGy ≈ 3.05 µSv for this radiation mix. Applied to solar particles too (Assumption).
  quality: 0.64 / 0.21,
  careerLimitMSv: 600,            // NASA career limit (cited in Löwe et al. 2025)
  priorMSv: 350,                  // Assumption: Maya's dose before this EVA, ~180 days of cruise at 1.84 mSv/day plus a few weeks on the surface
};

/** Maya's dose allowance left (mSv) after this EVA's absorbed dose so far (µGy). */
export const limitLeftMSv = (evaUGy) => RAD.careerLimitMSv - RAD.priorMSv - (evaUGy * RAD.quality) / 1000;

/** Background (cosmic-ray) dose rate at pressure p, from a reference dose measured at P_ref. */
export const gcrDose = (refUGyPerDay, pPa) => refUGyPerDay + RAD.kappa * (pPa - RAD.pRefPa);

/**
 * When does the nowcast fire? doseAt(t) is the dose rate one sensor reads (µGy/day); background is that sensor's
 * quiet level. Readings come every 15 min on a fixed clock. Returns { trigger, confirm } times in seconds, or null.
 */
export function nowcast(doseAt, background, fromS, toS) {
  const t0 = Math.ceil(fromS / RAD.cadenceS) * RAD.cadenceS;
  let armed = null;
  for (let t = t0; t <= toS; t += RAD.cadenceS) {
    const over = doseAt(t) > RAD.trigger * background;
    if (over && armed !== null) return { trigger: armed, confirm: t };
    armed = over ? t : null;
  }
  return null;
}

/** Network alert: the time the RAD.needed-th sensor confirms. sensors: [{ id, background, doseAt }]. */
export function networkAlert(sensors, fromS, toS) {
  const hits = sensors.map((s) => ({ id: s.id, ...nowcast(s.doseAt, s.background, fromS, toS) })).filter((h) => h.confirm !== undefined);
  hits.sort((a, b) => a.confirm - b.confirm);
  if (hits.length < RAD.needed) return null;
  return { t: hits[RAD.needed - 1].confirm, first: hits[0], hits };
}

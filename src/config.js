// Every tunable number lives here, with its provenance label.
// Labels (see docs/CONTEXT.md): Observation | Historical Replay | Model Estimate | Assumption | Scenario Event

export const LABEL = {
  OBS: 'Observation',
  REPLAY: 'Historical Replay',
  MODEL: 'Model Estimate',
  ASSUMP: 'Assumption',
  SCENARIO: 'Scenario Event',
};

export const CONFIG = {
  // ---- EVA scenario (Q2) ----
  crewSize: { value: 2, label: LABEL.ASSUMP },
  evaLimitH: { value: 7.0, label: LABEL.ASSUMP, note: 'EVA duration budget (6–8 h range), adjustable' },
  evaStartLtstH: { value: 9.0, label: LABEL.ASSUMP, note: 'EVA starts 09:00 LTST' },
  stopMinPerSite: { value: 30, label: LABEL.ASSUMP, note: 'sampling time at each science site' },

  // ---- Mobility (Q10) ----
  maxSlopeDeg: { value: 15, label: LABEL.ASSUMP, note: 'hard traversability limit, adjustable' },
  // Tobler hiking function scaled by a suit factor: v = 6*exp(-3.5*|g+0.05|) * suit
  toblerSuitFactor: { value: 0.62, label: LABEL.ASSUMP, note: 'gives ~3.1 km/h on flat ground in a suit' },

  // ---- Environment ----
  dustTauBaseline: { value: 0.6, label: LABEL.ASSUMP, note: 'column dust optical depth, typical non-storm Jezero value' },
  dustTauStorm: { value: 2.5, label: LABEL.SCENARIO },
  pressureScaleHeightM: { value: 11100, label: LABEL.MODEL, note: 'isothermal scale height used to shift pressure with elevation' },
  radWarnUGyPerDay: { value: 1000, label: LABEL.ASSUMP, note: 'illustrative warning threshold, NOT a NASA flight rule' },

  // ---- Display ----
  verticalExaggeration: 2.0,
};

export const ROUTE_STYLE = {
  shortest: { name: 'Shortest', color: 0x4fc3f7, desc: 'min distance subject to slope limit' },
  gentlest: { name: 'Gentlest', color: 0x81c784, desc: 'penalizes slope quadratically' },
  science: { name: 'Science', color: 0xffb74d, desc: 'visits science sites that fit the EVA budget' },
  replan: { name: 'Re-planned', color: 0xff5a4e, desc: 'changed mid-EVA after a hazard' },
};

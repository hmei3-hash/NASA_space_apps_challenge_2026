# Mars Radiation-Aware Wearable Health Monitoring + Software ECC

**A lightweight wearable health monitor for Mars surface crews, protected by software ECC so its alerts stay trustworthy when radiation hits both the astronaut and the electronics.**

> NASA International Space Apps Challenge 2026
> Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**
> Team: `<TEAM NAME>` · Local event: `<EVENT>` · Project page: `<SPACE APPS PROJECT URL>`

> ⚠️ **Prototype, not a medical device.** This is a hackathon research prototype. It does not diagnose or treat anyone, and it does not replace a flight surgeon.

---

## Table of Contents
1. [High-Level Project Summary](#high-level-project-summary)
2. [Link to Project Demo](#link-to-project-demo)
3. [Link to Final Project](#link-to-final-project)
4. [Detailed Project Description](#detailed-project-description)
   - [What it does](#what-it-does)
   - [Mission scenario](#mission-scenario)
   - [How it works](#how-it-works)
   - [Radiation-aware data integrity layer: Software ECC](#radiation-aware-data-integrity-layer-software-ecc)
   - [Evaluation](#evaluation)
   - [Benefits and intended impact](#benefits-and-intended-impact)
   - [Tools, languages, hardware and software](#tools-languages-hardware-and-software)
5. [Use of NASA Data and Resources](#use-of-nasa-data-and-resources)
6. [Space Agency Partner and Other Data](#space-agency-partner-and-other-data)
7. [Use of Artificial Intelligence](#use-of-artificial-intelligence)
8. [Getting Started](#getting-started)
9. [Repository Structure](#repository-structure)
10. [Assumptions and Limitations](#assumptions-and-limitations)
11. [Team](#team)
12. [References](#references)
13. [License](#license)

---

## High-Level Project Summary

On Mars, the one-way communication delay can exceed 20 minutes, so astronauts have to judge their own health without real-time help from Earth. We built a health monitoring tool that runs **entirely on a lightweight wearable**. Each astronaut's wearable learns a **personal baseline** for heart rate, HRV, skin temperature, SpO₂, sleep and activity. When a reading deviates from that baseline, the wearable flags it and gives clear, color-coded guidance on what to do next.

Our key insight is that **radiation hurts the crew and the electronics at the same moment**. During a solar particle event (SPE), the dose rate spikes just when alerts matter most. At the same time, bit flips (single-event upsets) in commercial wearables, which are not radiation-hardened, also spike and can silently suppress alarms. A wearable cannot carry heavy metal shielding, so we **trade compute for shielding mass**: a radiation-aware software layer (software ECC/SECDED, plus plausibility checks, redundancy and model scrubbing) protects the monitoring pipeline. Using fault injection driven by NASA radiation measurements, we show that **health alerts stay reliable when they are needed most**.

---

## Link to Project Demo

| Item | Link |
|---|---|
| Demo video (≤ 30 seconds) | `<LINK>` |
| Slides (≤ 7 pages) | `<LINK>` |

Demo storyline:
1. **Cruise phase (fast-forward).** The system builds each astronaut's personal baseline in microgravity.
2. **Landing transition (0.38 g).** Baseline adaptation slows, thresholds widen and the model layer is down-weighted.
3. **EVA with link loss.** The astronaut's wearable keeps detecting and alerting locally, then syncs to the Habitat when the link returns.
4. **Solar particle event.** The dose rate and bit-flip rate surge together. Integrity badges separate *"your heart rate is abnormal"* from *"this reading may be corrupted, please re-measure"*, and the astronaut is guided back to shelter.

## Link to Final Project

| Item | Link |
|---|---|
| Source code (this repository) | https://github.com/hmei3-hash/NASA_space_apps_challenge_2026 |
| Live prototype | `<LINK>` |

---

## Detailed Project Description

### What it does

NASA's Human Research Program identifies five hazards of human spaceflight: **space radiation, isolation and confinement, distance from Earth, gravity fields, and hostile/closed environments**. On long missions, astronauts carry most of the responsibility for noticing changes in their own health. Our tool helps them do that and answers the challenge's guiding questions:

| Challenge question | Our answer |
|---|---|
| What can be measured in space? | Wearable-class signals: HR, HRV, skin temperature, SpO₂, sleep and activity, plus Habitat CO₂ and radiation dose rate |
| How do hazards affect these metrics? | Gravity transitions shift HR, BP and orthostatic tolerance; radiation raises dose *and* corrupts device data; distance removes real-time ground support |
| When should the crew or flight surgeon be alerted? | Rule-based tiers derived from personal baselines and NASA-STD-3001 Vol. 2 limits; ground notification is queued for the next comm window |
| What actions prevent serious conditions? | Template-based guidance with cited sources (re-measure, rest, hydrate, return to Habitat, shelter during an SPE) |

### Mission scenario

**Mars surface stay (Habitat + EVA)**, with the cruise phase used to establish individual baselines.

- **Autonomy is required.** A Mars comm delay of 20+ minutes matches NASA's Earth-Independent Medical Operations (EIMO) direction. The lunar round-trip delay is only seconds, so the autonomy argument is much weaker there.
- **Links drop naturally during EVA** as astronauts move behind terrain. Local alerting with later sync is a real operating mode.
- **Gravity transition.** A baseline built in microgravity will shift after landing in 0.38 g. Very little human data exists for 0.38 g, so our transition parameters are explicitly labeled **conservative assumptions**.

**Radiation environment (approximate dose-equivalent rates):**

| Environment | Dose rate |
|---|---|
| Earth surface (total natural background, much of it from inhaled radon) | 0.005–0.01 mSv/day |
| Mars surface (Curiosity RAD) | 0.5–0.7 mSv/day (≈ 0.64) |
| Interplanetary cruise (MSL RAD) | 1–2 mSv/day (≈ 1.84) |

- **Mars surface is not deep space.** The atmosphere (about 20 g/cm² of CO₂) and the planet itself filter incoming particles. SEP protons and helium below about 150 MeV/nucleon do not reach the surface; only hard-spectrum events do, along with secondary neutrons. Examples measured by RAD: April 2013, September 2017 and May 2024. The May 2024 event (about 8,100 µGy) was the largest surge RAD has seen since landing.
- **Electronics are affected on the surface.** During the May 2024 event, Curiosity's navigation camera images showed "snow" from charged particles striking the sensor, which is a single-event transient in plain sight.
- Fault-injection rates are therefore **tiered by phase**: deep-space rates for cruise, and lower rates for the Mars surface, split between EVA (suit only) and inside the Habitat (shielded).

### How it works

```
 ┌──────────────── Astronaut wearable (edge) ─────────────────────┐
 │  Sensors → Integrity checks → Baseline layer (EWMA + CUSUM)    │──► Local alert + guidance
 │                              → Model layer (INT8 anomaly model)│──► "Suggest re-check"
 └───────────────────────────────┬────────────────────────────────┘
                                 │ intermittent link (EVA)
 ┌───────────────────────────────▼────────────────────────────────┐
 │  Habitat dashboard (sync receiver): trends · data-gap / SEFI   │
 │  detection · SEP warning feed · queued reports for the flight  │
 │  surgeon on Earth                                              │
 └────────────────────────────────────────────────────────────────┘
```

#### 1. Baseline layer: the safety floor (deterministic, explainable, owns all alerts)
- Each metric keeps an **EWMA mean and variance**: μₜ = α·xₜ + (1−α)·μₜ₋₁. Effective memory is about 2/α − 1 samples.
- The z-score is computed against the **previous** baseline *before* updating, so an outlier cannot drag the baseline first.
- Updates are **frozen or slowed during anomalies**, so a sustained fever is never learned as "normal".
- **CUSUM** catches slow drifts that z-scores miss.
- **Cold start:** a warm-up period initialized from population reference values.
- **Gravity-transition mode:** slower baseline adaptation, wider thresholds, model layer paused.

#### 2. Model layer: local small model (advisory only)
- A small multivariate model (autoencoder or Isolation Forest) over HR, HRV, temperature, SpO₂, sleep and activity.
- Exported to **ONNX and quantized to INT8**; runs locally with `onnxruntime`.
- It only issues **"suggest re-check"** and never raises alarms on its own, because it was trained on Earth data and the distribution shifts in space.
- **Model degradation warning.** If the weight checksum fails, the model output disagrees with the baseline for a long time, or the crew is in a gravity transition, the UI shows *"Model degraded — baseline monitoring only"*. The baseline layer keeps alerting, so the system never fails silently.
- Proof of "edge": the demo runs with networking disabled.

#### 3. Guidance and UI
- Color-coded status per metric, with trend charts and a body-map view.
- Each value carries a **data-integrity badge**.
- Guidance text is selected by a **rule engine from cited templates; no LLM generates medical advice**.
- CO₂ limits are **pressure-compensated**: 3 mmHg is about 0.39 % at 760 mmHg, but about 0.57 % in a 10.2 psi (≈ 527 mmHg) exploration atmosphere.

### Radiation-aware data integrity layer: Software ECC

Commercial off-the-shelf (COTS) devices are expected to meet many exploration medical needs, but they are not radiation-hardened and usually lack ECC memory. NASA's ExMC gap list explicitly asks what hardware and software can survive the deep-space radiation environment.

**Why software, not shielding:** a wearable must stay light. Aluminum at 2.7 g/cm³ needs about 3.7 mm of thickness for every 1 g/cm² of shielding, and galactic cosmic rays need tens of g/cm² before shielding helps much. A thin case does almost nothing, so the wearable is effectively unshielded. Software protection adds **zero mass**.

#### Where bit flips hurt along the signal chain
| Location | Effect | Protection |
|---|---|---|
| ADC / analog front end (SET) | One-sample spike or false saturation | Median filter, physiological plausibility check |
| Data buffers (SEU) | Persistent value corruption (exponent flips → orders of magnitude) | CRC / software ECC (SECDED) |
| EWMA state μ | Biased baseline that self-heals by (1−α)ⁿ | Redundant copy compare |
| **EWMA state σ (flipped high)** | **z-scores shrink → all alerts silently suppressed, UI shows "all green"** | σ bounds, redundant copy, re-init on anomaly |
| Alert flags / thresholds | Wrong until rewritten; the most severe case | Software TMR |
| Model weights | Degraded or wrong anomaly scores | Periodic checksum vs. golden copy + reload; on failure fall back to baseline-only mode; FP32 vs. INT8 comparison |
| SEFI (device hang) | Data stream stops | Watchdog; Habitat detects data gaps |

#### Fault-injection rates
| Environment | Upsets / bit / day | Source |
|---|---|---|
| ISS MDM DRAM (10 g/cm² shielding) | 8.5 × 10⁻⁸ | NASA NTRS 20200001591 |
| Deep space, quiet (SOHO) | 5.9 × 10⁻⁷ | same |
| Deep space SPE, Nov 1997 | 4.4 × 10⁻⁶ | same |
| Deep space SPE, Jul 2000 | 4.7 × 10⁻⁵ | same |

- These are 1990s DRAM measurements, used as **order-of-magnitude references only**, not predictions for any specific MCU. They apply to the cruise phase; Mars surface rates are scaled down (see [Mission scenario](#mission-scenario)).
- For a physics-based estimate, the upset rate is R = ∫σ(E)Φ(E)dE for protons and neutrons, and R = ∫σ(L)Φ(L)dL over the LET spectrum for heavy ions. We found no public radiation-test data for our target MCU, so the device cross-section σ is an **assumed parameter swept over several orders of magnitude**, kept separate from the real RAD environment data.
- All injection runs apply a uniform, clearly labeled **acceleration factor**.

### Evaluation

The evaluation chain ends at **health-alert outcomes**, not ECC statistics:

```
RAD environment (real) + device σ (assumed, swept)
  → SEU rate per phase (cruise / EVA / Habitat / SEP)
  → accelerated fault injection
  → protections ON vs OFF
  → silent data corruption count, detection/correction rate, CPU/memory/power overhead
  → ★ missed-alert rate and false-alert rate (protected vs unprotected)
```

Detection quality is measured two ways:
1. **Synthetic anomalies** (step, ramp, spike) injected into multi-day real wearable data (LifeSnaps).
2. **Real labeled events**: COVID-19 symptom-onset dates in the Stanford COVID-19 wearables data. We compare our EWMA/CUSUM detector against the published results of Alavi et al. (2022), who reported 72 % sensitivity for a CuSum detector on Fitbit data in the same study.

| Metric | Result |
|---|---|
| Anomaly detection rate (step / ramp / spike) | TBD |
| False-alert rate | TBD |
| Real-event detection rate and lead time vs. symptom onset | TBD |
| Missed alerts under SPE-level injection, unprotected | TBD |
| Missed alerts under SPE-level injection, protected | TBD |
| Model size FP32 → INT8 | TBD |
| Inference latency per window | TBD |
| Accuracy delta FP32 vs. INT8 | TBD |
| Protection overhead (CPU / memory / power) | TBD (measured after implementation) |

### Benefits and intended impact
- **For crews:** a self-assessment tool that works with no link to Earth and tells the astronaut both *what* is wrong and *whether the reading can be trusted*.
- **For flight surgeons:** queued, integrity-tagged reports instead of raw streams, so a corrupted value is never mistaken for a medical event.
- **For mission designers:** a quantified answer to "how much does software protection buy a COTS wearable?", expressed as missed alerts per SPE rather than abstract bit-error statistics.
- **On Earth:** the same design fits remote and extreme environments (Antarctic stations, high-altitude aviation, remote clinics) where links are unreliable and devices see elevated radiation or harsh conditions.

### Tools, languages, hardware and software
| Area | Choice |
|---|---|
| Languages | Python (simulation, detection, model training); C (wearable firmware) |
| Model | scikit-learn / PyTorch → ONNX → INT8 quantization, `onnxruntime` |
| Hardware | ESP32-class MCU development board running the wearable firmware. **No 3D-printed enclosure and no physical sensors**: sensor streams are replayed from datasets and simulated. A laptop hosts the Habitat dashboard |
| Communication | Intermittent Wi-Fi/BLE sync from the wearable to the dashboard (link loss during EVA is simulated) |
| UI | Web dashboard |

---

## Use of NASA Data and Resources

| Resource | How we used it |
|---|---|
| NASA Human Research Program: 5 Hazards of Human Spaceflight | Framed which hazards affect which metrics |
| NASA Human Research Program: Human Spaceflight Risks | Chose monitored metrics and alert rationale |
| NASA-STD-3001 Vol. 2 Rev. E §6.8.1 | Alert thresholds and when to notify the flight surgeon |
| MSL Curiosity RAD: Hassler et al. 2014, *Science* (NTRS 20180007641) | Mars surface dose rate, LET spectrum and SEP behavior |
| MSL RAD neutron spectrum: Köhler et al. 2014, *JGR Planets* | Surface neutron environment |
| NASA reporting on the May 2024 Mars SEP event (RAD, MAVEN, Mars Odyssey) | Surface SEP magnitude; evidence of particle hits on rover cameras |
| MAVEN SEP instrument | Upstream SEP warning signal for Habitat radiation mode (orbital flux, not used as surface flux) |
| NASA NTRS 20200001591: ISS on-orbit single-event-effect data | SEU/SEFI rates for fault injection |
| NASA NTRS 20090013856 | SPEs increase upset rates 3–30× |
| NASA NTRS 20230010122: Artemis I radiation lessons | Deep-space environment severity; SEU-related flight computer resets |
| NASA NTRS 20100029652: ExMC gap list | Need for radiation-tolerant medical hardware/software |
| NASA NTRS 20160009070: COTS ADC SEE testing | SET transient characteristics |

## Space Agency Partner and Other Data

| Resource | How we used it |
|---|---|
| Canadian Space Agency: Radiation monitoring for astronaut health | Context for crew dose monitoring |
| **LifeSnaps** (Zenodo, CC-BY-4.0; 71 people, 4+ months, Fitbit Sense) | Multi-day personal baselines (HR, SpO₂, temperature, sleep, activity); the cruise → landing → EVA timeline |
| **Stanford COVID-19 Wearables, Phase 1 and 2** (Mishra et al. 2020; Alavi et al. 2022) | Real labeled anomalies (symptom onset / diagnosis dates) and a published CuSum benchmark |
| **PMData** (Simula; 16 people, 5 months, Fitbit Versa 2) | Secondary baseline data; self-reported fatigue, stress and injury as weak labels for EVA workload |
| PhysioNet Wearable Device Dataset v1.0.1 (doi:10.13026/he0v-tf17) | Short-window features and acute stress/exercise spike templates |
| Synthetic circadian data (our generator, fitted to LifeSnaps) | Fallback when real data is missing; **always labeled as synthetic** |

- We did **not** use any individual astronaut data. Astronaut and analog-mission physiological data (e.g. Inspiration4, HERA) are controlled-access and were not used.
- We do **not redistribute** raw datasets. `data/` contains download scripts only; please cite the original authors and follow each dataset's license (PMData may be non-commercial only).

---

## Use of Artificial Intelligence

In accordance with Space Apps rules:

- **AI tools used during development:** `<list tools, e.g. Claude — research assistance, documentation drafting, code review>`
- **In the product:** a small on-device anomaly-detection model (autoencoder / Isolation Forest) trained by the team on public data. **No generative AI produces medical guidance.**
- **AI-generated images/video:** `<none / list>`. Any AI-generated media is watermarked.
- No NASA logos or insignia are used in this project.

---

## Getting Started

> Setup instructions will be finalized with the code.

```bash
git clone https://github.com/hmei3-hash/NASA_space_apps_challenge_2026.git
cd NASA_space_apps_challenge_2026
# pip install -r requirements.txt
# python data/download.py      # fetch public datasets (not committed)
# python -m sim                 # run the mission-timeline simulation
```

## Repository Structure

> Planned layout. Update as code lands.

```
├── sim/            # mission timeline, sensor replay, radiation environment per phase
├── firmware/       # wearable firmware for the ESP32-class board
├── detection/      # EWMA / CUSUM baselines, alert tiers, rule engine
├── model/          # anomaly model training, ONNX export, INT8 quantization
├── integrity/      # fault injection, CRC / SECDED / TMR, weight scrubbing
├── ui/             # crew dashboard
├── data/           # dataset download scripts (no raw data committed)
└── docs/           # figures, slides, evaluation results
```

---

## Assumptions and Limitations

- **Not a medical device.** Thresholds and guidance are for demonstration only.
- Human physiology at **0.38 g** is poorly characterized; transition parameters are conservative assumptions.
- All training and evaluation data come from **ground-based** wearables. No dataset contains microgravity or Mars-gravity effects (fluid shifts, circadian drift), so landing-transition anomalies are **synthetic injections**. Consumer devices are used for relative, within-person changes, not absolute accuracy.
- Upset rates come from 1990s DRAM; device σ is **assumed and swept**, not measured. Injection is **accelerated**.
- Software ECC (SECDED) corrects 1 bit and detects 2 per word; multi-bit upsets in one word are out of scope. It protects data at rest between checks, not registers or in-flight computation.
- Software TMR has common-mode failure (same memory, same CPU, and the voter itself can flip). This is a **proof of principle**, not flight-grade. Real flight systems rely mainly on hardware mitigation (rad-hard parts, ECC, self-checking processor pairs); our layer targets COTS wearables without ECC.
- We found no public incident of a medical device missing an alert due to bit flips and do not claim such harm has occurred.
- Radiation damage to humans is largely irreversible; the tool supports monitoring and response, not reversal.

---

## Team

| Name | Role |
|---|---|
| Hongyi Mei | `<role>` |
| `<name>` | `<role>` |

---

## References

1. NASA Space Apps Challenge: Project Submission Guide and Judging & Awards Guide. https://www.spaceappschallenge.org/resources/
2. Hassler, D. M. et al. (2014). Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover. *Science* 343(6169). doi:10.1126/science.1244797 · https://ntrs.nasa.gov/citations/20180007641
3. Köhler, J. et al. (2014). Measurements of the neutron spectrum on the Martian surface with MSL/RAD. *J. Geophys. Res. Planets* 119, 594–603.
4. Rafkin, S. C. R. et al. (2014). Diurnal variations of energetic particle radiation at the surface of Mars as observed by MSL RAD. *J. Geophys. Res. Planets* 119, 1345–1358. doi:10.1002/2013JE004525
5. NASA (2024). NASA watches Mars light up during epic solar storm. https://phys.org/news/2024-06-nasa-mars-epic-solar-storm.html
6. NASA ISS on-orbit single-event-effect data (MDM, T61P, SOHO comparison, SPE). https://ntrs.nasa.gov/api/citations/20200001591/downloads/20200001591.pdf
7. Artemis I radiation lessons learned (NSREC 2023 poster). https://ntrs.nasa.gov/api/citations/20230010122/downloads/2023-NSREC-Poster.pdf
8. NASA Exploration Medical Capability (ExMC) gap list. https://ntrs.nasa.gov/api/citations/20100029652/downloads/20100029652.pdf
9. SPE effects on upset rates. https://ntrs.nasa.gov/api/citations/20090013856/downloads/20090013856.pdf
10. SEE testing of commercial ADCs. https://ntrs.nasa.gov/api/citations/20160009070/downloads/20160009070.pdf
11. Medical devices for exploration missions (COTS review). *Frontiers in Space Technologies* (2024). doi:10.3389/frspt.2024.1384457
12. Garrett-Bakelman, F. E. et al. NASA Twins Study. https://pmc.ncbi.nlm.nih.gov/articles/PMC7580864
13. Yfantidou, S. et al. (2022). LifeSnaps, a 4-month multi-modal dataset capturing unobtrusive snapshots of our lives in the wild. *Scientific Data*. https://www.nature.com/articles/s41597-022-01764-x · doi:10.5281/zenodo.6826682
14. Mishra, T. et al. (2020). Pre-symptomatic detection of COVID-19 from smartwatch data. *Nature Biomedical Engineering*. Data: https://storage.googleapis.com/gbsc-gcp-project-ipop_public/COVID-19/COVID-19-Wearables.zip
15. Alavi, A. et al. (2022). Real-time alerting system for COVID-19 and other stress events using wearable data. *Nature Medicine*. https://www.nature.com/articles/s41591-021-01593-2
16. Thambawita, V. et al. (2020). PMData: a sports logging dataset. *ACM MMSys '20*. https://datasets.simula.no/pmdata/
17. Hongn, A. et al. (2025). Wearable Device Dataset from Induced Stress and Structured Exercise Sessions (v1.0.1). PhysioNet. https://physionet.org/content/wearable-device-dataset/1.0.1/
18. NASA-STD-3001 Volume 2, Revision E.
19. Bit-flip sensitivity of DNN weights across numeric formats. https://link.springer.com/article/10.1007/s11227-024-06693-7

## License

`<MIT / Apache-2.0 — choose one>`

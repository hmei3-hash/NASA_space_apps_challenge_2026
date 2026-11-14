# Habitat–Astronaut Distributed OS

**Edge-AI health monitoring for Mars surface crews — that stays trustworthy when radiation hits both the astronaut and the electronics.**

> NASA International Space Apps Challenge 2026 · Theme: *The Next Frontier*
> Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**
> Team: `<TEAM NAME>` · Local event: `<EVENT>` · Project page: `<SPACE APPS PROJECT URL>`

> ⚠️ **Prototype, not a medical device.** This is a hackathon research prototype. It does not diagnose, treat, or replace a flight surgeon.

---

## Table of Contents
1. [High-Level Summary](#high-level-summary)
2. [Demo](#demo)
3. [The Challenge & Why It Matters](#the-challenge--why-it-matters)
4. [Mission Scenario](#mission-scenario)
5. [How It Works](#how-it-works)
6. [Radiation-Resilient Data Integrity Layer](#radiation-resilient-data-integrity-layer)
7. [Evaluation](#evaluation)
8. [Use of NASA Data & Resources](#use-of-nasa-data--resources)
9. [Space Agency Partner & Other Data](#space-agency-partner--other-data)
10. [Getting Started](#getting-started)
11. [Repository Structure](#repository-structure)
12. [Assumptions & Limitations](#assumptions--limitations)
13. [Use of Artificial Intelligence](#use-of-artificial-intelligence)
14. [Team](#team)
15. [References](#references)
16. [License](#license)

---

## High-Level Summary

On Mars, one-way communication delay can exceed 20 minutes, so astronauts must assess their own health without real-time help from Earth. We built a health monitoring tool that runs **entirely on the edge**: each astronaut's wearable node learns a **personal baseline** for heart rate, HRV, skin temperature, SpO₂, sleep and activity, and flags deviations with clear, color-coded guidance on what to do next.

Our key insight is that **radiation hurts the crew and the electronics at the same moment**. During a solar particle event (SPE), dose rates spike — exactly when alerts matter most — while bit flips (single-event upsets) in non-radiation-hardened commercial wearables also spike, and can silently suppress alarms. Our system adds a lightweight software data-integrity layer and demonstrates, with fault injection driven by NASA on-orbit upset rates, that **health alerts stay reliable when they are needed most**.

---

## Demo

| Item | Link |
|---|---|
| 30-second demo video | `<LINK>` |
| Slides (≤ 7 pages) | `<LINK>` |
| Live prototype | `<LINK>` |

Demo storyline:
1. **Cruise phase (fast-forward)** — the system builds each astronaut's personal baseline in microgravity.
2. **Landing transition (0.38 g)** — baseline adaptation slows, thresholds widen, AI layer is down-weighted.
3. **EVA with link loss** — the astronaut's node keeps detecting and alerting locally; data syncs to the Habitat when the link returns.
4. **Solar particle event** — dose rate and bit-flip rate surge together; integrity flags separate *"your heart rate is abnormal"* from *"this reading may be corrupted — please re-measure"*, and the Habitat coordinates crew recall.

---

## The Challenge & Why It Matters

NASA's Human Research Program identifies five hazards of human spaceflight: **space radiation, isolation and confinement, distance from Earth, gravity fields, and hostile/closed environments**. On long missions, astronauts carry most of the responsibility for noticing changes in their own health.

Our tool answers the challenge's guiding questions:

| Challenge question | Our answer |
|---|---|
| What can be measured in space? | Wearable-class signals: HR, HRV, skin temperature, SpO₂, sleep, activity; plus Habitat CO₂ and radiation dose rate |
| How do hazards affect these metrics? | Gravity transitions shift HR/BP/orthostatic tolerance; radiation raises dose *and* corrupts device data; distance removes real-time ground support |
| When should crew or flight surgeon be alerted? | Rule-based tiers derived from personal baselines and NASA-STD-3001 Vol. 2 limits; ground notification queued for the next comm window |
| What actions prevent serious conditions? | Template-based guidance with cited sources (re-measure, rest, hydrate, return to Habitat, shelter during SPE) |

---

## Mission Scenario

**Mars surface stay (Habitat + EVA)**, with the cruise phase used to establish individual baselines.

- **Autonomy is required.** Mars comm delay of 20+ minutes aligns with NASA's Earth-Independent Medical Operations (EIMO) direction. (Lunar round-trip delay is only seconds, so the autonomy argument is much weaker there.)
- **Links drop naturally during EVA** — astronauts move out of line of sight behind terrain. Local alerting with later sync is a real operating mode.
- **Radiation environment.** Curiosity's RAD measured ≈ 0.64 mSv/day on the Martian surface versus ≈ 1.84 mSv/day in cruise. Hard-spectrum SEP events can still reach the surface (e.g. April 2013, September 2017, May 2024).
- **Gravity transition.** A baseline built in microgravity will shift after landing in 0.38 g. Very little human data exists for 0.38 g, so our transition parameters are explicitly labeled **conservative assumptions**.

---

## How It Works

```
 ┌──────────────── Astronaut wearable node (edge) ────────────────┐
 │  Sensors → Integrity checks → Safety layer (EWMA + CUSUM)      │──► Local alert + guidance
 │                              → AI layer (INT8 anomaly model)   │──► "Suggest re-check"
 └───────────────────────────────┬────────────────────────────────┘
                                 │ intermittent link (EVA)
 ┌───────────────────────────────▼────────────────────────────────┐
 │  Habitat node: crew dashboard · data-gap / SEFI detection ·    │
 │  radiation mode · queued reports for flight surgeon on Earth   │
 └────────────────────────────────────────────────────────────────┘
```

### 1. Safety layer — personal baselines (deterministic, explainable, owns all alerts)
- Each metric keeps an **EWMA mean and variance**: μₜ = α·xₜ + (1−α)·μₜ₋₁. Effective memory ≈ 2/α − 1 samples.
- A z-score against the **previous** baseline is computed *before* updating, so an outlier cannot drag the baseline first.
- Updates are **frozen or slowed during anomalies**, so a sustained fever is never learned as "normal".
- **CUSUM** catches slow drifts that z-scores miss.
- **Cold start:** warm-up period initialized from population reference values.
- **Gravity-transition mode:** slower baseline adaptation, wider thresholds, AI layer paused.

### 2. AI layer — on-device anomaly model (advisory only)
- Small multivariate model (autoencoder / Isolation Forest) over HR, HRV, temperature, SpO₂, sleep and activity.
- Exported to **ONNX, quantized to INT8**, runs locally with `onnxruntime` / `onnxruntime-web`.
- Only issues **"suggest re-check"** — it never raises alarms on its own (it was trained on Earth data; the distribution shifts in space).
- Proof of "edge": the demo runs with networking disabled.

### 3. Guidance & UI
- Color-coded status per metric with trend charts and a body-map view.
- Each value carries a **data-integrity badge**.
- Guidance text is selected by a **rule engine from cited templates — no LLM generates medical advice**.
- CO₂ limits are **pressure-compensated**: 3 mmHg ≈ 0.39 % at 760 mmHg, but ≈ 0.57 % in a 10.2 psi (≈ 527 mmHg) exploration atmosphere.

---

## Radiation-Resilient Data Integrity Layer

Commercial (COTS) devices are expected to meet many exploration medical needs, but they are not radiation-hardened and usually lack ECC memory. NASA's ExMC gap list explicitly asks what hardware/software can survive the deep-space radiation environment.

### Where bit flips hurt along the signal chain
| Location | Effect | Protection |
|---|---|---|
| ADC / analog front end (SET) | One-sample spike or false saturation | Median filter, physiological plausibility check |
| Data buffers (SEU) | Persistent value corruption (exponent flips → orders of magnitude) | CRC / software ECC (SECDED) |
| EWMA state μ | Biased baseline that self-heals by (1−α)ⁿ | Redundant copy compare |
| **EWMA state σ (flipped high)** | **z-scores shrink → all alerts silently suppressed, UI shows "all green"** | σ bounds, redundant copy, re-init on anomaly |
| Alert flags / thresholds | Wrong until rewritten — most severe | Software TMR |
| Model weights | Degraded or wrong anomaly scores | Periodic checksum vs. golden copy + reload; FP32 vs. INT8 comparison |
| SEFI (device hang) | Data stream stops | Watchdog; Habitat detects data gaps |

### Fault-injection rates (from NASA on-orbit measurements)
| Environment | Upsets / bit / day | Source |
|---|---|---|
| ISS MDM DRAM (10 g/cm² shielding) | 8.5 × 10⁻⁸ | NASA NTRS 20200001591 |
| Deep space, quiet (SOHO) | 5.9 × 10⁻⁷ | same |
| Deep space SPE, Nov 1997 | 4.4 × 10⁻⁶ | same |
| Deep space SPE, Jul 2000 | 4.7 × 10⁻⁵ | same |

These are 1990s DRAM measurements, used as **order-of-magnitude references only** — not predictions for any specific MCU. Device SEU cross-section σ is treated as an **assumed parameter swept over several orders of magnitude**. All injection runs apply a uniform **acceleration factor**, clearly labeled.

---

## Evaluation

The evaluation chain ends at **health-alert outcomes**, not ECC statistics:

```
RAD environment (real) + device σ (assumed, swept)
  → SEU rate per phase (cruise / EVA / Habitat / SEP)
  → accelerated fault injection
  → protections ON vs OFF
  → silent data corruption count, detection/correction rate, CPU/memory overhead
  → ★ missed-alert rate and false-alert rate (protected vs unprotected)
```

| Metric | Result |
|---|---|
| Anomaly detection rate (step / ramp / spike) | TBD |
| False-alert rate | TBD |
| Missed alerts under SPE-level injection — unprotected | TBD |
| Missed alerts under SPE-level injection — protected | TBD |
| Model size FP32 → INT8 | TBD |
| Inference latency per window | TBD |
| Accuracy delta FP32 vs INT8 | TBD |
| Protection overhead (CPU / memory) | TBD |

---

## Use of NASA Data & Resources

| Resource | How we used it |
|---|---|
| NASA Human Research Program — 5 Hazards of Human Spaceflight | Framed which hazards affect which metrics |
| NASA Human Research Program — Human Spaceflight Risks | Chose monitored metrics and alert rationale |
| NASA-STD-3001 Vol. 2 Rev. E §6.8.1 | Alert thresholds and when to notify flight surgeon |
| MSL Curiosity RAD — Hassler et al. 2014, *Science* (NTRS 20180007641) | Mars surface dose rate and SEP behavior |
| NASA NTRS 20200001591 — ISS on-orbit single-event-effect data | SEU/SEFI rates for fault injection |
| NASA NTRS 20090013856 | SPE increases upset rates 3–30× |
| NASA NTRS 20230010122 — Artemis I radiation lessons | Deep-space environment severity; SEU-related flight computer resets |
| NASA NTRS 20100029652 — ExMC gap list | Need for radiation-tolerant medical hardware/software |
| NASA NTRS 20160009070 — COTS ADC SEE testing | SET transient characteristics |
| NASA Starling 1.0 on-orbit autonomy results | Distributed-autonomy design reference |

## Space Agency Partner & Other Data

| Resource | How we used it |
|---|---|
| Canadian Space Agency — Radiation monitoring for astronaut health | Context for crew dose monitoring |
| PhysioNet — Wearable Device Dataset from Induced Stress and Structured Exercise Sessions v1.0.1 (doi:10.13026/he0v-tf17) | Model input features; injected step / ramp / spike anomalies |
| Multi-day wearable data (e.g. LifeSnaps / PMData) or synthetic circadian data | Multi-day baseline timeline — **synthetic data is labeled as such** |

We did **not** use any individual astronaut data.

---

## Getting Started

> Setup instructions will be finalized with the code.

```bash
git clone https://github.com/hmei3-hash/NASA_space_apps_challenge_2026.git
cd NASA_space_apps_challenge_2026
# pip install -r requirements.txt
# python -m <module>   # run simulation
```

## Repository Structure

> Planned layout — update as code lands.

```
├── sim/            # astronaut + Habitat node simulation, mission timeline
├── detection/      # EWMA / CUSUM baselines, alert tiers, rule engine
├── model/          # anomaly model training, ONNX export, INT8 quantization
├── integrity/      # fault injection, CRC / SECDED / TMR, weight scrubbing
├── ui/             # crew dashboard
├── data/           # dataset download scripts (no raw data committed)
└── docs/           # figures, slides, evaluation results
```

---

## Assumptions & Limitations

- **Not a medical device**; thresholds and guidance are for demonstration.
- Human physiology at **0.38 g** is poorly characterized; transition parameters are conservative assumptions.
- Upset rates come from 1990s DRAM; device σ is **assumed and swept**, not measured. Injection is **accelerated**.
- Software ECC (SECDED) corrects 1 bit and detects 2 per word; multi-bit upsets in one word are out of scope. It only protects data at rest between checks, not registers or in-flight computation.
- Software TMR has common-mode failure (same memory, same CPU, the voter itself can flip). This is a **proof of principle**, not flight-grade. Real flight systems rely primarily on hardware mitigation (rad-hard parts, ECC, self-checking processor pairs); our layer targets COTS wearables without ECC.
- We found no public incident of a medical device missing an alert due to bit flips; we do not claim such harm has occurred.
- Training data comes from ground-based wearables, not astronauts.

---

## Use of Artificial Intelligence

In accordance with Space Apps rules:

- **AI tools used:** `<list tools, e.g. Claude — research assistance, documentation drafting, code review>`
- **In the product:** an on-device anomaly-detection model (autoencoder / Isolation Forest) trained by the team on public data. **No generative AI produces medical guidance.**
- **AI-generated images/video:** `<none / list>`; any AI-generated media is watermarked.
- No NASA logos or insignia are used in this project.

---

## Team

| Name | Role |
|---|---|
| Hongyi Mei | `<role>` |
| `<name>` | `<role>` |

---

## References

1. NASA Space Apps Challenge — Project Submission Guide & Judging and Awards Guide. https://www.spaceappschallenge.org/resources/
2. Hassler, D. M. et al. (2014). Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover. *Science* 343(6169). doi:10.1126/science.1244797 · https://ntrs.nasa.gov/citations/20180007641
3. NASA ISS on-orbit single-event-effect data (MDM, T61P, SOHO comparison, SPE). https://ntrs.nasa.gov/api/citations/20200001591/downloads/20200001591.pdf
4. Artemis I radiation lessons learned (NSREC 2023 poster). https://ntrs.nasa.gov/api/citations/20230010122/downloads/2023-NSREC-Poster.pdf
5. NASA Exploration Medical Capability (ExMC) gap list. https://ntrs.nasa.gov/api/citations/20100029652/downloads/20100029652.pdf
6. SPE effects on upset rates. https://ntrs.nasa.gov/api/citations/20090013856/downloads/20090013856.pdf
7. SEE testing of commercial ADCs. https://ntrs.nasa.gov/api/citations/20160009070/downloads/20160009070.pdf
8. Medical devices for exploration missions (COTS review). *Frontiers in Space Technologies* (2024). doi:10.3389/frspt.2024.1384457
9. Garrett-Bakelman, F. E. et al. — NASA Twins Study. https://pmc.ncbi.nlm.nih.gov/articles/PMC7580864
10. PhysioNet Wearable Device Dataset v1.0.1. https://physionet.org/content/wearable-device-dataset/1.0.1/
11. NASA-STD-3001 Volume 2, Revision E.
12. Starling 1.0 — Advancing Autonomy in Distributed Space Systems: Insights from On-Orbit Testing.
13. Bit-flip sensitivity of DNN weights across numeric formats. https://link.springer.com/article/10.1007/s11227-024-06693-7

## License

`<MIT / Apache-2.0 — choose one>`

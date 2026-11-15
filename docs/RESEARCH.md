# Research notes: hazards that interrupt an EVA

Why Marswalk re-plans mid-EVA, and where its numbers come from. Statements are paraphrased from the cited sources; app parameters derived from them are marked **(used in app)**.

## 1. Dust storms

### Jezero, January 2022: a storm front crossing Perseverance
- A regional dust storm passed over the Perseverance site on 5–11 January 2022 (Ls 153°–156°); pressure, temperature and winds all responded. — Lemmon et al. 2022, *GRL*, https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2022GL100126
- The storm reactivated west of Jezero on 8 January 2022 (sol 315). Measurements of the rapid expansion of the dust front give **25 ± 2 m/s**. — Sánchez-Lavega et al. 2025, *JGR Planets*, https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2024JE008565 **(used in app: front speed, front comes from the west)**
- In MEDA pressure, the storm raised the daily pressure range to about 60 Pa (sol 313); the diurnal and semidiurnal tide amplitudes grew by a factor of 2–3. — Sánchez-Lavega et al. 2023, *JGR Planets*, https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2022JE007480
- MEDA sampled at 1 Hz for at least 5 minutes each hour, running continuously only in alternating hours. — Lemmon et al. 2022. A warning network would need continuous sampling.

### Opportunity, June 2018: a storm that grew faster than expected
- First detected 30 May 2018, the storm grew rapidly and was expected to encircle the planet within days. — Spaceflight Now, https://spaceflightnow.com/2018/06/13/huge-dust-storm-knocks-aging-mars-rover-out-of-contact-with-earth/
- It darkened the sky much faster than the 2007 storm. — NASA JPL, https://www.jpl.nasa.gov/news/opportunity-hunkers-down-during-dust-storm/
- NASA lost contact with Opportunity on 10 June 2018; the storm lasted about three months and the rover never answered again. — Eos, https://eos.org/articles/opportunity-rover-mission-complete

### Dust devils: the short-notice, local hazard
- MEDA detects vortices as pressure drops; at Jezero, dust devils are 5–135 m across, and one vortex had a 9.0 Pa drop with 25 m/s winds. Two encounters partially damaged MEDA's wind sensors. — Hueso et al. 2023, *JGR Planets*, https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2022JE007516
- InSight recorded a 9 Pa (13%) pressure drop with a ~20 m/s gust and a 180° wind shift when a vortex passed overhead. — NASA, https://www.nasa.gov/missions/insight/for-insight-dust-cleanings-will-yield-new-science/

### Can storms be forecast?
- There is no known predictor of why one local storm grows to regional scale and another dies. — Lemmon et al. 2022
- Machine-learning forecasts of the OpenMARS reanalysis did not predict large-storm onset; at best they reflected it about 16 hours after it began. — CEUR-WS Vol. 4128, https://ceur-ws.org/Vol-4128/paper2.pdf
- 78% of storms over eight Mars years were preceded by unusually warm, sunny periods; an algorithm predicts some storm types with 64% confidence. — Space.com on Pieris & Hayne (AGU 2024), https://www.space.com/the-universe/mars/sunny-days-on-mars-come-with-a-weather-warning-dust-storms-ahead
- Forecasters argue that reliable prediction needs a network of orbiters and many surface stations. — Space.com, https://www.space.com/34409-mars-weather-forecast-colony-astronauts-weather-extreme-events-dust.html

### What this means for an EVA (our derivation)
Warning lead time from a station *d* km upwind, with front speed *v* and a confirmation delay *c*:

`lead = d / v − c`

| Station distance | Lead at 25 m/s, c = 90 s | Distance a suited crew covers (~3 km/h) |
|---|---|---|
| 10 km | 5 min 10 s | ≈ 0.26 km |
| 20 km | 11 min 50 s | ≈ 0.6 km |
| 30 km | 18 min 30 s | ≈ 0.9 km |

So a crew far from the habitat cannot outrun a front on warning alone. The plan needs a **safe haven within about a kilometre** (here: a pressurized rover staged on the route) and the crew must move on the first detection. The station layout, confirmation delay and rover are Assumptions, not existing infrastructure (see the network section below).

### Weather stations on Mars today, and what has been recommended
- **Today:** Perseverance's MEDA (Jezero) is the only surface weather station whose current status we could confirm. By sol ~1478 its wind sensor ran only 15 minutes every 2 hours (4 h per sol) with damaged boards. — MEDA status, EPSC-DPS 2025, https://meetingorganizer.copernicus.org/EPSC-DPS2025/EPSC-DPS2025-1461.html. Curiosity (with REMS) is still operating at Gale, ~3,700 km away; we did not verify REMS's current status. China's Zhurong carried a climate station but never woke from hibernation after May 2022. — Live Science, https://www.livescience.com/space/space-exploration/china-finally-admits-its-hibernating-mars-rover-may-never-wake-up
- **MEPAG Mars Human Precursor SSG (2005):** a met package on every landed mission; opacity sampled once every 10 minutes through the full sol; surface pressure, wind, temperature, density and dust for at least a Mars year; an orbital "weather station" that tracks storm frequency, size and occurrence and alerts surface-stationed astronauts; pre-descent and pre-ascent sounding probes. It states no number, spacing or layout for a surface network, and says the group did not agree on a minimum number of measurements. — https://hesperia.gsfc.nasa.gov/sspvse/Group_D/MHP_SSG_(06-02-05).pdf
- **NASA Exploration Zone concept:** surface assets concentrated at one landing site; an Exploration Zone is a set of Regions of Interest within about 100 km of it; field-station layouts use ~1 km plume-hazard spacing between landers and the habitat. — Bussey & Hoffman, NTRS 20150013827, https://ntrs.nasa.gov/citations/20150013827; Hoffman, NTRS 20160002370, https://ntrs.nasa.gov/api/citations/20160002370/downloads/20160002370.pdf
- **ESA Mars Weather Network study:** simulated a network of **four landers** at six candidate human exploration zones to reconstruct local winds; no station spacing is given in the abstract. — Rajendran et al., EPSC-DPS 2025, https://meetingorganizer.copernicus.org/EPSC-DPS2025/EPSC-DPS2025-715.html
- **Proposed but not flown:** FMI's MetNet (tens of small landers), MeteoMars penetrators, the MACAWS areostationary constellation.

**How the app uses this (used in app):** default network = a met station at the habitat (MEPAG) plus **four stations on the 100 km Exploration Zone boundary** (count from the ESA study, radius from NASA's EZ). Station positions (N/E/S/W) are our assumption, since no source gives a layout. Two alternatives can be selected for comparison: a compact 30 km ring, and the habitat station alone.

| Network | First detection for a front from the west | Warning to a crew at the habitat |
|---|---|---|
| EZ ring, 100 km | EZ-W | ≈ 65 min |
| Compact ring, 30 km | EZ-W | ≈ 18.5 min |
| Habitat only | HAB | none (detected after arrival) |

## 2. Solar particle events
- August 1972: the largest SEP of solar cycle 20 fell between Apollo 16 and 17; a crew on the lunar surface would have received an estimated 600 rem skin dose and 130 rem to blood-forming organs. — NASA, Working on the Moon, https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html; National Academies, *Storms from the Sun*, https://www.nationalacademies.org/read/10249/chapter/11
- 20 May 2024: Curiosity's RAD measured its largest surge since landing, about 8,100 µGy (≈ 30 chest X-rays) for a person beside the rover; not lethal; cliffsides or lava tubes would add shielding. — NASA via Phys.org, https://phys.org/news/2024-06-nasa-mars-epic-solar-storm.html **(used in app: SEP scenario replays this RAD profile)**
- 28 October 2003: a solar event disabled MARIE on Mars Odyssey, the instrument built to measure this radiation. — JPL archive, https://webarchive.library.unt.edu/eot2008/20090512094433/http://mars.jpl.nasa.gov/odyssey/technology/marie.html

## 3. What the app does and does not claim
- The dust front is a **scenario**: a straight line moving east at the measured 2022 speed. Real fronts are irregular.
- Station detections, the confirmation delay and the shelter rover are **assumptions** that illustrate the warning-time arithmetic above.
- Walking pace in dust (85% on own tracks, 70% on new ground) is an **assumption**.
- After sheltering in the rover, the crew waits until the front plus 45 minutes of gusts have passed (winds peaked as the 2022 storm reached Jezero, Lemmon et al. 2022), then drives home sealed inside at 10 km/h. The 45 minutes and 10 km/h are **assumptions**; 10 km/h is the order of top speed quoted for NASA pressurized-rover concepts. For a solar particle event the crew waits until the dose rate is back under the warning level.
- The planet-scale storm footprint is a **kinematic fit** (section 4), not a weather model and not a forecast.
- Radiation shielding by terrain is **not modelled**.

## 4. How far and how fast a storm spreads (planet scale)

Section 1 covers the last tens of kilometres before a front hits a crew. This section covers the thousands of kilometres before that, which is what lets one base warn another.

### What controls spread and reach
| Factor | Evidence |
|---|---|
| **Season** | Large northern storms appear in two windows, Ls 180–240° and 305–350°; southern ones in Ls 135–245°. Non-global activity peaks in Ls 140–250°. — Wang & Richardson 2015, *Icarus* 251 (NASA Mars Data Analysis Program), https://doi.org/10.1016/j.icarus.2013.10.033; Battalio & Wang 2021, *Icarus* 354, https://doi.org/10.1016/j.icarus.2020.114059 |
| **Where it starts, and the channels it follows** | Sequences start mostly in Acidalia, Utopia and Arcadia (north) and Aonia–Solis–Valles Marineris and Hellas (south). Northern routes run north–south through low-lying meridional channels; southern routes run east–west. Many northern sequences "flush" across the equator. — Wang & Richardson 2015; Battalio & Wang 2021 |
| **Size and persistence (feedback threshold)** | In a climate model, a regional-size storm (~10⁶ km²) only changes the surrounding atmosphere enough for self-induced growth when it persists for about 10 sols; a 1-sol storm does not. — "The cascade from local to global dust storms on Mars", Smithsonian profile, https://profiles.si.edu/display/sro_146141 |
| **Radiative–dynamical feedback** | Explosive growth to global scale comes from dust heating strengthening the Hadley circulation and activating secondary lifting centres. — Basu et al. 2006, *JGR*, https://gfdl.noaa.gov/bibliography/related_files/sb0601.pdf; the 2018 storm's equinox onset does not fit this mechanism neatly. — Sánchez-Lavega et al. 2019 |
| **Dust supply** | The NASA Ames GCM study of 2018 examines how finite surface dust reservoirs limit the storm. — Bertrand et al., https://arxiv.org/abs/1908.02453 |
| **Antecedent growth** | Major sequences (peak area above 10⁷ km²) are preceded by six sols of steadily increasing storm area. — Battalio & Wang 2021 |
| **Predictability** | No known predictor of which local storm grows; NASA's Guzewich in 2018: why some storms go global is not understood. — Lemmon et al. 2022; Space.com 2018 |

### Sizes used as thresholds
- Database floor: 10⁵ km². Regional: more than 1.6 × 10⁶ km² and longer than 3 sols (Cantor et al. 2001). Major sequence: above 10⁷ km² (about a 1,800 km radius disc). — Battalio & Wang 2021

### Dated observations the model is fitted to
**2018 planet-encircling storm (MY34, Ls 185°)**
- 30–31 May: 1.4 × 10⁵ km² patch in Acidalia, centred near 31.7°N, 18°W (342°E). 1–8 June: expanded south along the Acidalia corridor at 5 m/s while spreading east and west at 5–40 m/s; dust reached 55°S by 8 June and stopped near 46°N in the north. — Sánchez-Lavega et al. 2019, *GRL* 46, https://arxiv.org/abs/1906.00963
- Opportunity (Meridiani): opacity 10.8 on 10 June; contact lost. — NASA JPL, https://www.jpl.nasa.gov/news/opportunity-hunkers-down-during-dust-storm/
- Curiosity (Gale): dust more than doubled over the weekend of 16–17 June to above 8; declared planet-encircling 19 June. — NASA JPL (same page); Scientific American / Space.com, https://www.scientificamerican.com/article/massive-dust-storm-engulfs-mars/

**January 2022 regional storm (MY36, Ls 153°)**
- A local storm in Hesperia–Promethei grew into one of the earliest large regional storms on record and moved quickly north across the equator into Isidis and Syrtis Major; it affected all NASA surface assets. — Malin & Cantor 2022, MRO MARCI weather report, https://www.msss.com/msss_images/2022/01/12/
- Over Jezero 5–11 January, peak optical depth about 2. — Lemmon et al. 2022, *GRL*

### The model (src/stormsim.js) and how well it fits
The footprint is a disc on the sphere, centre c(t), radius r(t) = min(r_max, v·t), with an optional northern limit and an optional centre track. One speed v per storm is fitted to the dated observations. Checked by `npm test` (`scripts/test_storm.mjs`):

| Storm | v (fitted) | Observation | Observed (sol after first sighting) | Model |
|---|---|---|---|---|
| 2018 | 6.2 m/s | Dust at Opportunity | 2–6 (opacity 10.8 on 10 June) | 3.8 |
| 2018 | | Dust at 55°S | 8–9.5 | 9.3 |
| 2018 | | Gale opacity above 8 | 14–18.5 | 15.5 |
| 2018 | | Planet-encircling | 18–21 | 19.4 |
| 2022 | 9.5 m/s | Over Jezero | 3.5–5 | 4.0 |
| 2022 | | InSight, Curiosity affected | 2–8 | 3.1, 2.7 |

The fitted 6.2 m/s sits inside the measured 5–40 m/s range for 2018: a disc that grows at one average speed matches the dated arrivals, even though the real edge advanced in fast and slow lobes. The 2022 origin point is our reading of a weekly weather map, not a published coordinate. The third scenario, a "typical northern flushing storm" from Utopia past Isidis, is statistical: its track is our sketch of the published route map, its size cap is the 10⁷ km² major threshold, and its speeds are picked inside the measured range.

### Sharing between bases (what the globe shows)
Bases are placed at four real landing sites (Jezero, Gale, Meridiani, Elysium) so each has a surface record. Crewed outposts there are an **assumption**. Each base learns of a storm from the earliest of: the daily orbital map (MRO MARCI makes one per sol today), a broadcast from a base the storm has already reached, or its own stations. Examples from the model:
- 2018 storm: Meridiani is hit on sol 3.8. Its broadcast gives Jezero 5.3 sols and Gale 11.7 sols of warning, more than either base's own stations (about an hour with a 100 km ring).
- A fast storm (40 m/s in the flushing scenario) reaches Jezero in under 8 hours, before the next daily orbital map: only surface stations and broadcasts warn in time.

### What this does not claim
- It is a replay and sandbox, not a forecast. Storm onset and growth are not predictable today.
- Real storms are lobed, split and merge (MDAD tracks "members" that do exactly this); a disc is the simplest shape that reproduces arrival times.
- The Mars Dust Activity Database itself was not downloaded; its published statistics and thresholds are used.

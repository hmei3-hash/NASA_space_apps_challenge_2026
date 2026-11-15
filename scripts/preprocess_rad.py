"""Build public/data/rad.json from Curiosity RAD dose-rate windows.

Input: a CSV with columns t, dose_E (µGy/day), window  -- e.g. the processed
rad_dose_windows.csv from the main branch (made from CDAWeb MSL_RAD_OBS-L2).

    python scripts/preprocess_rad.py ..\\NASA_space_apps_challenge_2026\\data\\processed\\rad_dose_windows.csv

Output:
  baseline  = median dose_E of the quiet window           -> label Observation (Gale, not Jezero)
  sep       = dose_E time profile of the SEP window, from 2 h before onset to 36 h after,
              re-timed so t=0 is onset                     -> used ONLY as a Scenario Event in the app
"""
import csv, json, sys, statistics
from datetime import datetime
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "public" / "data" / "rad.json"
quiet_name = "quiet_2019"
sep_name = sys.argv[3] if len(sys.argv) > 3 else "sep_2024_05"

rows = {}
with open(src, newline="") as f:
    for r in csv.DictReader(f):
        try:
            v = float(r["dose_E"])
        except (ValueError, KeyError):
            continue
        t = datetime.fromisoformat(r["t"].replace("Z", "+00:00"))
        rows.setdefault(r["window"], []).append((t, v))

quiet = [v for _, v in rows[quiet_name]]
base = statistics.median(quiet)

sep = sorted(rows[sep_name])
onset_i = next(i for i, (_, v) in enumerate(sep) if v > 2 * base)
t0 = sep[onset_i][0]
prof = [((t - t0).total_seconds() / 3600, v) for t, v in sep]
prof = [(h, v) for h, v in prof if -2 <= h <= 36]
# scenario starts at onset: drop pre-onset part but keep it for context in the JSON
post = [(h, v) for h, v in prof if h >= 0]
peak_t, peak_v = max(sep, key=lambda x: x[1])

doc = {
    "source": "Curiosity RAD, CDAWeb MSL_RAD_OBS-L2, dose_E (tissue-equivalent plastic), µGy/day",
    "site": "Gale crater — NOT Jezero; RAD is a single-point time series, not a map",
    "baseline": {
        "uGyPerDay": round(base, 1),
        "signal": "dose_E (tissue-equivalent plastic)",
        "window": f"{quiet_name} median of {len(quiet)} obs",
        "site": "Gale crater (Curiosity RAD)",
    },
    "sep": {
        "event": f"{sep_name}, onset {t0:%Y-%m-%d %H:%M} UTC, peak {peak_v:.0f} µGy/day at {peak_t:%Y-%m-%d %H:%M} UTC",
        "tH": [round(h, 3) for h, _ in post],
        "uGyPerDay": [round(v, 1) for _, v in post],
    },
}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(doc, indent=1))
print(f"baseline {base:.1f} µGy/day; SEP onset {t0}, {len(post)} points, peak {peak_v:.0f} -> {out}")

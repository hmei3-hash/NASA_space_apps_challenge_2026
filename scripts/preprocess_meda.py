"""Turn one sol of MEDA derived CSVs (PS, ATS, WS) into public/data/meda_sol.json.

    python scripts/preprocess_meda.py data_raw\\meda\\sol_0300 --sol 300

Column names differ between MEDA products/releases, so the script auto-detects:
  time:        first column whose name contains LTST (falls back to LMST)
  pressure:    column containing PRESSURE (not uncertainty)            [Pa]
  temperature: column containing AIR_TEMP, else mean of ATS_LOCAL_TEMP*  [K -> °C]
  wind speed:  column containing HORIZONTAL_WIND_SPEED or WIND_SPEED     [m/s]
Use --t-col/--p-col/--temp-col/--w-col to override; headers are printed so you can check.
Output is binned into 10-minute LTST means. Label in the app: Historical Replay (at the rover).
"""
import argparse, csv, json, re, statistics
from collections import defaultdict
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("folder")
ap.add_argument("--sol", type=int, required=True)
ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "public" / "data" / "meda_sol.json"))
ap.add_argument("--t-col"); ap.add_argument("--p-col"); ap.add_argument("--temp-col"); ap.add_argument("--w-col")
ap.add_argument("--bin-min", type=float, default=10)
a = ap.parse_args()

TIME_RE = re.compile(r"(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)")

def hours(s):
    m = TIME_RE.findall(s or "")
    if not m: return None
    hh, mm, ss = m[-1]
    return int(hh) + int(mm) / 60 + float(ss) / 3600

def num(s):
    try:
        v = float(s)
        return None if abs(v) > 1e6 else v
    except (TypeError, ValueError):
        return None

def read(path):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        r = csv.reader(f)
        head = [h.strip().upper() for h in next(r)]
        return head, list(r)

def find(head, wanted, avoid=("UNCERT", "_STD", "FLAG", "QUAL")):
    for w in wanted:
        for i, h in enumerate(head):
            if w in h and not any(x in h for x in avoid):
                return [i]
    return []

files = {k: next(iter(sorted(Path(a.folder).glob(f"*DER_{k}_*.[cC][sS][vV]"))), None) for k in ("PS", "ATS", "WS")}
print("files:", {k: (v.name if v else None) for k, v in files.items()})
bins = defaultdict(lambda: defaultdict(list))
B = a.bin_min / 60

for key, path in files.items():
    if not path: continue
    head, rows = read(path)
    print(f"{key} columns: {head}")
    tcol = [head.index(a.t_col.upper())] if a.t_col else (find(head, ["LTST"]) or find(head, ["LMST"]))
    if key == "PS":
        cols, out_key = ([head.index(a.p_col.upper())] if a.p_col else find(head, ["PRESSURE"])), "P"
    elif key == "ATS":
        if a.temp_col: cols = [head.index(a.temp_col.upper())]
        else: cols = find(head, ["AIR_TEMP"]) or [i for i, h in enumerate(head) if "ATS_LOCAL_TEMP" in h and "UNCERT" not in h]
        out_key = "T"
    else:
        cols, out_key = ([head.index(a.w_col.upper())] if a.w_col else find(head, ["HORIZONTAL_WIND_SPEED", "WIND_SPEED"])), "W"
    if not tcol or not cols:
        print(f"  could not detect columns for {key}; pass --t-col / --{ {'P':'p','T':'temp','W':'w'}[out_key] }-col")
        continue
    print(f"  using time={head[tcol[0]]}, value={[head[c] for c in cols]}")
    for row in rows:
        if len(row) <= max(cols + tcol): continue
        h = hours(row[tcol[0]])
        vals = [num(row[c]) for c in cols]
        vals = [v for v in vals if v is not None]
        if h is None or not vals: continue
        v = statistics.fmean(vals)
        if out_key == "T" and v > 100: v -= 273.15
        ok = {"P": 300 < v < 1300, "T": -150 < v < 60, "W": 0 <= v < 60}[out_key]
        if ok: bins[round(int(h / B) * B + B / 2, 4)][out_key].append(v)

out_bins = [{"h": h, **{k: round(statistics.fmean(v), 3) for k, v in d.items()}} for h, d in sorted(bins.items())]
if not out_bins:
    raise SystemExit("no usable data; check the column report above")
doc = {"sol": a.sol, "source": "Mars 2020 MEDA derived data (PDS Atmospheres), at the rover location",
       "label": "Historical Replay", "binMinutes": a.bin_min, "bins": out_bins}
Path(a.out).write_text(json.dumps(doc, indent=1))
cov = {k: sum(1 for b in out_bins if k in b) for k in "PTW"}
print(f"wrote {a.out}: {len(out_bins)} bins, coverage {cov} (MEDA records ~12 h per sol in alternating blocks; gaps are normal)")

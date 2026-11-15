"""Build public/data/places.json: real Jezero place names + Perseverance's real traverse.

Input: M20_waypoints.json (NASA MMGIS GeoJSON, one point per rover position with properties.sol)
    curl.exe -L -o data_raw\\M20_waypoints.json https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
    python scripts\\build_places.py data_raw\\M20_waypoints.json

How places are located: each feature below is tied to the sol on which Perseverance sealed a sample
there (NASA Mars 2020 sample list / Herd et al. 2025). Its position = the rover's end-of-sol waypoint
on that sol (Observation); the feature itself is within tens of metres of the rover.
`resource` drives the game-style icon; `basis` says what the label rests on.
"""
import json, sys
from pathlib import Path

CATALOG = [
    # name, sol, resource, science, description, basis
    ("Octavia E. Butler Landing", 0, "landing", False,
     "Perseverance landing site (18 Feb 2021).", "NASA name; rover position sol 0"),
    ("Rochette · Artuby Ridge", 194, "igneous", False,
     "Máaz formation igneous rock; cores Montdenier (sol 194) and Montagnac (sol 196).", "NASA sample list"),
    ("Brac · Séítah South", 262, "olivine", True,
     "Séítah formation: coarse olivine-rich igneous rock, lowest exposed unit of the crater floor; cores Salette/Coulettes.", "NASA sample list; Herd et al. 2025"),
    ("Issole · Séítah South", 298, "olivine", False,
     "Séítah formation layered igneous ridge; cores Robine/Malay.", "Herd et al. 2025 sample table"),
    ("Sid (Máaz)", 371, "igneous", False,
     "Máaz formation blocky igneous float; cores Hahonih/Atsah.", "NASA sample list"),
    ("Skinner Ridge · Hawksbill Gap", 490, "carbonate", True,
     "Delta front, layered medium-grained sandstone; carbonate–sulfate cemented basaltic sediment. Cores Swift Run/Skyland.", "NASA sample list; Univ. Oslo MSR-ASL"),
    ("Wildcat Ridge · Hawksbill Gap", 509, "lake", True,
     "Fine-grained lake-bed mudstone with sulfates, some clay; cores Hazeltop/Bearwallow.", "NASA sample list; Univ. Oslo MSR-ASL"),
    ("Amalik · Cape Nukshak", 575, "carbonate", True,
     "Delta front fine-grained carbonate-cemented sediment; cores Shuyak/Mageik.", "NASA sample list"),
    ("Hidden Harbor", 631, "sediment", True,
     "Delta front sedimentary rock; core Kukaklek.", "NASA sample list"),
    ("Observation Mountain megaripple", 634, "regolith", False,
     "Regolith from a megaripple; samples Atmo Mountain/Crosswind Lake.", "Herd et al. 2025 sample table"),
    ("Berea", 749, "sediment", True,
     "Upper fan sedimentary/mixed rock; core Melyn.", "NASA sample list"),
    ("Cheyava Falls · Bright Angel", 1215, "organics", True,
     "'Leopard spot' rock in the Neretva Vallis riverbed; SHERLOC detected organic compounds; core Sapphire Canyon. "
     "Organics are not proof of life.", "NASA PIA26368 / sample list"),
]

src = Path(sys.argv[1])
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "public" / "data" / "places.json"
gj = json.loads(src.read_text(encoding="utf-8"))

pts = []
for f in gj["features"]:
    p = f.get("properties", {})
    g = f.get("geometry") or {}
    if g.get("type") != "Point":
        continue
    lon, lat = g["coordinates"][:2]
    try:
        sol = int(float(p.get("sol")))
    except (TypeError, ValueError):
        continue
    pts.append((sol, float(lat), float(lon)))
pts.sort()
print(f"{len(pts)} waypoints, sols {pts[0][0]}..{pts[-1][0]}")

def at_sol(s):
    best = None
    for sol, lat, lon in pts:
        if sol <= s:
            best = (sol, lat, lon)
        else:
            break
    return best

places = []
for name, sol, res, sci, desc, basis in CATALOG:
    hit = at_sol(sol)
    if not hit:
        print(f"  skip {name}: no waypoint at/before sol {sol}")
        continue
    wsol, lat, lon = hit
    places.append({"name": name, "sol": sol, "waypointSol": wsol, "lat": round(lat, 6), "lon": round(lon, 6),
                   "resource": res, "science": sci, "desc": desc, "basis": basis, "label": "Observation"})
    print(f"  {name:36s} sol {sol:5d} -> waypoint sol {wsol:5d}  {lat:.5f}N {lon:.5f}E")

# thin the traverse to ~1 point per sol for drawing
trav, last = [], None
for sol, lat, lon in pts:
    if sol != last:
        trav.append([round(lat, 6), round(lon, 6), sol]); last = sol

doc = {"source": "NASA/JPL MMGIS M20_waypoints.json (Perseverance end-of-sol positions)",
       "places": places, "traverse": trav}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
lats = [p[1] for p in pts]; lons = [p[2] for p in pts]
print(f"traverse bbox lat {min(lats):.4f}..{max(lats):.4f}, lon {min(lons):.4f}..{max(lons):.4f}")
print(f"wrote {out}")

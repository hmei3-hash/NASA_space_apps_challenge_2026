"""Crop a Jezero DEM (+ optional orthoimage) to a local EVA-scale grid for the web app.

Needs GDAL + numpy (conda-forge):  conda create -n marswalk -c conda-forge python=3.11 gdal numpy -y

    python scripts/preprocess_terrain.py --dem data_raw\\M20_JezeroCrater_CTXDEM_20m.tif ^
        --ortho https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif

--dem / --ortho accept local paths or http(s) URLs (URLs are read with GDAL /vsicurl/, so only the
needed part of a large GeoTIFF is fetched).

Outputs in public/data/: terrain.json, heights.f32 (row 0 = north, little-endian float32, metres),
ortho.jpg, and sites.json (only if it does not exist yet, or with --overwrite-sites).

The output grid is a local equirectangular projection centred on --lat/--lon with true-scale metres
(lat_ts = centre latitude), so 1 cell = --res metres on the ground in both directions.
"""
import argparse, json, math
from pathlib import Path

import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.tiff")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "4")
gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "2")
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")

ap = argparse.ArgumentParser()
ap.add_argument("--dem", required=True)
ap.add_argument("--ortho")
ap.add_argument("--lat", type=float, default=18.455, help="study-area centre (Assumption: delta-front area)")
ap.add_argument("--lon", type=float, default=77.420)
ap.add_argument("--size-km", type=float, default=16.0)
ap.add_argument("--res", type=float, default=25.0, help="DEM cell size in metres (grid = size/res, keep <= ~700)")
ap.add_argument("--ortho-px", type=int, default=4096)
ap.add_argument("--fit-places", help="places.json from build_places.py: centre and size the crop to cover all places + 1.5 km margin")
ap.add_argument("--habitat-lat", type=float, default=18.4447, help="Assumption: near the M2020 landing site")
ap.add_argument("--habitat-lon", type=float, default=77.4508)
ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "public" / "data"))
ap.add_argument("--overwrite-sites", action="store_true")
a = ap.parse_args()
if a.fit_places:
    pl = json.loads(Path(a.fit_places).read_text(encoding="utf-8"))["places"]
    la = [p["lat"] for p in pl]; lo = [p["lon"] for p in pl]
    a.lat, a.lon = (min(la) + max(la)) / 2, (min(lo) + max(lo)) / 2
    km_lat = (max(la) - min(la)) * 59.27
    km_lon = (max(lo) - min(lo)) * 59.27 * math.cos(math.radians(a.lat))
    a.size_km = max(12, math.ceil(max(km_lat, km_lon) + 3.0))
    a.res = max(a.res, round(a.size_km * 1000 / 700))
    print(f"fit to {len(pl)} places: centre {a.lat:.4f}N {a.lon:.4f}E, {a.size_km} km, {a.res} m cells")

def src_path(p):
    return "/vsicurl/" + p if p.startswith(("http://", "https://")) else p

def sphere_radius(ds):
    srs = osr.SpatialReference(wkt=ds.GetProjection())
    return srs.GetSemiMajor()

out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
half = a.size_km * 1000 / 2

dem_src = gdal.Open(src_path(a.dem))
R = sphere_radius(dem_src)
print(f"DEM: {a.dem}\n  size {dem_src.RasterXSize}x{dem_src.RasterYSize}, sphere R={R:.0f} m")
local = f"+proj=eqc +lat_ts={a.lat} +lat_0={a.lat} +lon_0={a.lon} +x_0=0 +y_0=0 +R={R} +units=m +no_defs"
nd = dem_src.GetRasterBand(1).GetNoDataValue()

dem = gdal.Warp("", dem_src, format="MEM", dstSRS=local, outputBounds=(-half, -half, half, half),
                xRes=a.res, yRes=a.res, resampleAlg="bilinear", outputType=gdal.GDT_Float32,
                srcNodata=nd, dstNodata=-1e30, multithread=True)
band = dem.GetRasterBand(1)
z = band.ReadAsArray().astype(np.float32)
bad = (z < -1e20) | ~np.isfinite(z)
if bad.all():
    raise SystemExit("DEM crop is empty: the centre is outside this DEM's coverage. Check --lat/--lon.")
if bad.any():
    print(f"  filling {bad.mean() * 100:.1f}% nodata cells")
    band.SetNoDataValue(-1e30)
    gdal.FillNodata(band, None, 50, 0)
    z = band.ReadAsArray().astype(np.float32)
    still = (z < -1e20) | ~np.isfinite(z)
    if still.any():
        print(f"  WARNING: {still.mean() * 100:.1f}% of the crop is outside DEM coverage; flattened to the median elevation")
        z[still] = np.median(z[~still])
h, w = z.shape
z.astype("<f4").tofile(out / "heights.f32")

gy, gx = np.gradient(z, a.res)
slope = np.degrees(np.arctan(np.hypot(gx, gy)))
print(f"  grid {w}x{h} @ {a.res} m, elevation {z.min():.1f}..{z.max():.1f} m, "
      f"slope median {np.median(slope):.1f}°, >15°: {(slope > 15).mean() * 100:.1f}%")

ortho_name = None
if a.ortho:
    print(f"Ortho: {a.ortho} (cropping, may take a while for large mosaics)")
    o_src = gdal.Open(src_path(a.ortho))
    res_o = a.size_km * 1000 / a.ortho_px
    o = gdal.Warp("", o_src, format="MEM", dstSRS=local.replace(f"+R={R}", f"+R={sphere_radius(o_src)}"),
                  outputBounds=(-half, -half, half, half), xRes=res_o, yRes=res_o,
                  resampleAlg="average", outputType=gdal.GDT_Float32, multithread=True)
    arr = o.GetRasterBand(1).ReadAsArray().astype(np.float32)
    onodata = o_src.GetRasterBand(1).GetNoDataValue()
    valid = np.isfinite(arr) & (arr > 0) & ((arr != onodata) if onodata is not None else True)
    lo, hi = np.percentile(arr[valid], [1, 99]) if valid.any() else (0, 1)
    img = np.clip((arr - lo) / max(1e-6, hi - lo) * 255, 0, 255).astype(np.uint8)
    img[~valid] = 0
    mem = gdal.GetDriverByName("MEM").Create("", img.shape[1], img.shape[0], 1, gdal.GDT_Byte)
    mem.GetRasterBand(1).WriteArray(img)
    gdal.GetDriverByName("JPEG").CreateCopy(str(out / "ortho.jpg"), mem, options=["QUALITY=88"])
    ortho_name = "ortho.jpg"
    print(f"  ortho {img.shape[1]}x{img.shape[0]} @ {res_o:.2f} m/px, valid {valid.mean() * 100:.0f}%")

meta = {
    "width": w, "height": h, "cellSize": a.res, "heights": "heights.f32", "ortho": ortho_name,
    "center": {"lat": a.lat, "lon": a.lon}, "projection": local,
    "demSource": Path(a.dem).name if not a.dem.startswith("http") else a.dem.rsplit("/", 1)[-1],
    "orthoSource": (a.ortho.rsplit("/", 1)[-1] if a.ortho else None),
    "note": "Elevation is Observation-derived (stereo DTM). Study-area centre and size are Assumptions.",
}
(out / "terrain.json").write_text(json.dumps(meta, indent=1))

def latlon_to_uv(lat, lon):
    x = math.radians(lon - a.lon) * R * math.cos(math.radians(a.lat))
    y = math.radians(lat - a.lat) * R
    return round((x + half) / (2 * half), 4), round((half - y) / (2 * half), 4)

sites_path = out / "sites.json"
if a.overwrite_sites or not sites_path.exists():
    hu, hv = latlon_to_uv(a.habitat_lat, a.habitat_lon)
    km = lambda e, n: (round(0.5 + e * 1000 / (2 * half), 4), round(0.5 - n * 1000 / (2 * half), 4))
    placeholders = [("S1", "Delta front outcrop (placeholder)", km(-1.0, 0.3)),
                    ("S2", "Delta top layered unit (placeholder)", km(-1.8, 1.2)),
                    ("S3", "Scarp base boulders (placeholder)", km(-0.3, 1.5))]
    sites = {
        "habitat": {"name": "Habitat (assumed, near M2020 landing site)", "u": hu, "v": hv, "label": "Assumption"},
        "sites": [{"id": i, "name": n, "u": u, "v": v, "label": "Assumption", "image": None} for i, n, (u, v) in placeholders],
        "note": "Science sites are placeholders. Click the map in the app to read u/v, then edit this file.",
    }
    if not (0 <= hu <= 1 and 0 <= hv <= 1):
        print("  WARNING: habitat is outside the crop; moving it to the grid centre")
        sites["habitat"].update(u=0.5, v=0.5)
    sites_path.write_text(json.dumps(sites, indent=1))
    print(f"  wrote {sites_path}")
print(f"done -> {out}")

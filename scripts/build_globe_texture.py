"""Stitch the Viking MDIM 2.1 colour mosaic from NASA Mars Trek tiles into public/data/mars_globe.jpg.

Needs the same conda env as preprocess_terrain.py (GDAL + numpy):
    python scripts/build_globe_texture.py            # zoom 3 -> 4096 x 2048
    python scripts/build_globe_texture.py --zoom 2   # 2048 x 1024, faster

Without this file the app streams the same tiles live from Trek, and falls back to a
labelled procedural texture when offline.
"""
import argparse
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "4")
gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "2")
TREK = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm"

ap = argparse.ArgumentParser()
ap.add_argument("--zoom", type=int, default=3, help="Trek zoom level; z0 is 2x1 tiles of 256 px")
ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "public" / "data" / "mars_globe.jpg"))
a = ap.parse_args()

nx, ny, T = 2 ** (a.zoom + 1), 2 ** a.zoom, 256
img = np.zeros((3, ny * T, nx * T), dtype=np.uint8)
for y in range(ny):
    for x in range(nx):
        url = f"/vsicurl/{TREK}/{a.zoom}/{y}/{x}.jpg"
        ds = gdal.Open(url)
        arr = ds.ReadAsArray()
        if arr.ndim == 2:
            arr = np.stack([arr] * 3)
        img[:, y * T:(y + 1) * T, x * T:(x + 1) * T] = arr[:3, :T, :T]
    print(f"row {y + 1}/{ny}")

mem = gdal.GetDriverByName("MEM").Create("", nx * T, ny * T, 3, gdal.GDT_Byte)
for b in range(3):
    mem.GetRasterBand(b + 1).WriteArray(img[b])
Path(a.out).parent.mkdir(parents=True, exist_ok=True)
gdal.GetDriverByName("JPEG").CreateCopy(a.out, mem, options=["QUALITY=88"])
print(f"wrote {a.out} ({nx * T} x {ny * T}). Source: NASA/JPL/USGS Viking MDIM 2.1 via Mars Trek.")

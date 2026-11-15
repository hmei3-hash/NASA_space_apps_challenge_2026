# Marswalk data download (Windows PowerShell 5+ or PowerShell 7).
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\download_data.ps1                 # everything
#   powershell -ExecutionPolicy Bypass -File scripts\download_data.ps1 -Step terrain   # one step
# Steps: terrain | meda | images | all
# Raw downloads go to data_raw\ (git-ignored). Small processed outputs go to public\data\ (committed).

param(
  [ValidateSet('all', 'terrain', 'meda', 'images')] [string]$Step = 'all',
  [int]$Sol = 300,                       # MEDA sol to replay (Historical Replay)
  [int[]]$ImageSols = @(421, 453, 475),  # Perseverance sols for arrival previews (delta-front campaign, approx.)
  [string[]]$Cameras = @('NAVCAM_LEFT', 'MCZ_LEFT', 'MCZ_RIGHT'),
  [int]$PerSol = 2
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Split-Path -Parent $PSScriptRoot
$Raw = Join-Path $Root 'data_raw'
$Pub = Join-Path $Root 'public\data'
New-Item -ItemType Directory -Force $Raw, $Pub | Out-Null
$Utf8 = New-Object System.Text.UTF8Encoding $false   # JSON without BOM (browsers' JSON.parse rejects a BOM)

function Get-Links([string]$url) {
  $r = Invoke-WebRequest -UseBasicParsing -Uri $url
  $base = [Uri]$url
  $r.Links | ForEach-Object { $_.href } |
    Where-Object { $_ -and $_ -notmatch '^\?' -and $_ -notmatch '^\.\./?$' } |
    ForEach-Object { ([Uri]::new($base, $_)).AbsoluteUri } |
    Where-Object { $_.StartsWith($base.AbsoluteUri) -and $_ -ne $base.AbsoluteUri } |
    Select-Object -Unique
}

# ---------------------------------------------------------------- terrain
if ($Step -in 'all', 'terrain') {
  Write-Host "`n[terrain] CTX DEM mosaic of Jezero, 20 m/px (~87 MB, USGS Astrogeology / JPL)" -ForegroundColor Cyan
  $dem = Join-Path $Raw 'M20_JezeroCrater_CTXDEM_20m.tif'
  if (-not (Test-Path $dem)) {
    curl.exe -L --fail --retry 3 -o $dem 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif'
  } else { Write-Host "  already have $dem" }
  Write-Host "[terrain] Optical: the CTX 6 m orthomosaic is cropped remotely by GDAL (/vsicurl/) in the next step, no full download."
  Write-Host "  Next (needs GDAL):"
  Write-Host "    conda create -n marswalk -c conda-forge python=3.11 gdal numpy -y" -ForegroundColor Yellow
  Write-Host "    conda activate marswalk" -ForegroundColor Yellow
  Write-Host "    python scripts\preprocess_terrain.py --dem data_raw\M20_JezeroCrater_CTXDEM_20m.tif --ortho https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif" -ForegroundColor Yellow
}

# ---------------------------------------------------------------- MEDA
if ($Step -in 'all', 'meda') {
  Write-Host "`n[meda] Mars 2020 MEDA derived data, sol $Sol (PDS Atmospheres node)" -ForegroundColor Cyan
  $base = 'https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/'
  $tag = '{0:D4}' -f $Sol
  $dst = Join-Path $Raw ("meda\sol_$tag")
  New-Item -ItemType Directory -Force $dst | Out-Null
  # Walk at most 3 directory levels, only into folders whose name can contain this sol.
  $queue = @(@{ url = $base; depth = 0 }); $found = @()
  while ($queue.Count -gt 0 -and $found.Count -lt 3) {
    $cur = $queue[0]; $queue = @($queue | Select-Object -Skip 1)
    try { $links = Get-Links $cur.url } catch { Write-Host "  cannot list $($cur.url): $($_.Exception.Message)"; continue }
    foreach ($l in $links) {
      $name = ($l.TrimEnd('/') -split '/')[-1]
      if ($l.EndsWith('/')) {
        if ($cur.depth -ge 3) { continue }
        $ok = $false
        if ($name -match "sol_?$tag$") { $ok = $true }
        elseif ($name -match 'sol_?(\d{4,5})_(\d{4,5})') { $ok = ([int]$matches[1] -le $Sol -and [int]$matches[2] -ge $Sol) }
        elseif ($name -notmatch 'sol') { $ok = $true }   # unknown intermediate level
        if ($ok) { $queue += @{ url = $l; depth = $cur.depth + 1 } }
      } elseif ($name -match "WE__$tag.*DER_(PS|ATS|WS)_.*\.csv$") {
        $found += $l
      }
    }
  }
  if ($found.Count -eq 0) {
    Write-Host "  No DER_PS/ATS/WS CSV found for sol $Sol. Open $base in a browser, find sol $tag, and download the three WE__${tag}*DER_PS/ATS/WS*.CSV files into $dst" -ForegroundColor Red
  } else {
    foreach ($f in $found) {
      $out = Join-Path $dst (($f -split '/')[-1])
      Write-Host "  $f"; curl.exe -L --fail --retry 3 -s -o $out $f
    }
    Write-Host "  Next:  python scripts\preprocess_meda.py data_raw\meda\sol_$tag --sol $Sol" -ForegroundColor Yellow
  }
}

# ---------------------------------------------------------------- raw images (arrival preview)
if ($Step -in 'all', 'images') {
  Write-Host "`n[images] Perseverance raw images for arrival previews" -ForegroundColor Cyan
  $imgDir = Join-Path $Pub 'images'
  New-Item -ItemType Directory -Force $imgDir | Out-Null
  $items = @()
  foreach ($s in $ImageSols) {
    $api = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol=$s&num=100&page=0"
    try { $j = Invoke-RestMethod -Uri $api } catch { Write-Host "  sol ${s}: API error $($_.Exception.Message)"; continue }
    $pick = @($j.images | Where-Object { $Cameras -contains $_.camera.instrument -and (-not $_.sample_type -or $_.sample_type -eq 'Full') })
    if ($pick.Count -eq 0) { $pick = @($j.images | Where-Object { $Cameras -contains $_.camera.instrument }) }
    foreach ($im in ($pick | Select-Object -First $PerSol)) {
      $url = if ($im.image_files.large) { $im.image_files.large } elseif ($im.image_files.medium) { $im.image_files.medium } else { $im.image_files.full_res }
      $ext = [IO.Path]::GetExtension(([Uri]$url).AbsolutePath); if (-not $ext) { $ext = '.jpg' }
      $file = "$($im.imageid)$ext"
      curl.exe -L --fail --retry 3 -s -o (Join-Path $imgDir $file) $url
      Write-Host "  sol $s $($im.camera.instrument) -> $file"
      $items += [ordered]@{ file = $file; sol = $s; camera = $im.camera.instrument; imageid = $im.imageid;
                            caption = "Sol $s - $($im.camera.instrument) - $($im.date_taken_utc)" }
    }
  }
  $json = [ordered]@{ source = 'mars.nasa.gov raw images API (NASA/JPL-Caltech)'; items = $items } | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText((Join-Path $imgDir 'manifest.json'), $json, $Utf8)
  Write-Host "  wrote $($items.Count) images + manifest.json"
}

Write-Host "`nRAD: public\data\rad.json is already built from the main branch's CDAWeb RAD windows (scripts\preprocess_rad.py)."
Write-Host "Run the app:  npm install ; npm run dev" -ForegroundColor Green

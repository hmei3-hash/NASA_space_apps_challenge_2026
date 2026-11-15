import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, LABEL, ROUTE_STYLE } from './config.js';
import { loadTerrain, uvToCell } from './terrain.js';
import { generateRoutes, sampleAt, snapTraversable, overlap } from './routing.js';
import { Environment, MARS_HOUR_S } from './environment.js';
import { makeAstronaut, animate, classifyState, GAIT_TEXT, makeDust, updateDust, SCALE } from './astronaut.js';

const $ = (id) => document.getElementById(id);
const CHIP = { [LABEL.OBS]: 'o', [LABEL.REPLAY]: 'r', [LABEL.MODEL]: 'm', [LABEL.ASSUMP]: 'a', [LABEL.SCENARIO]: 's' };
const chip = (label) => [...new Set(label.split(' + '))].map((l) => `<i class="chip ${CHIP[l] || 'm'}">${l}</i>`).join(' ');
const fmtHM = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const MARS_R = 3396190;

const S = {
  t: null, sites: null, habitatIdx: 0, destIdx: 0, siteIdx: [], routes: {}, sel: 'gentlest',
  tS: 0, playing: false, exag: CONFIG.verticalExaggeration, zmin: 0, images: [],
};
const env = new Environment();

// ---------- three.js scene ----------
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc79a7b);
scene.fog = new THREE.Fog(0xc79a7b, 4000, 14000);
const camera = new THREE.PerspectiveCamera(50, 1, 5, 40000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
scene.add(new THREE.HemisphereLight(0xffe6d0, 0x3b2418, 0.9));
const sun = new THREE.DirectionalLight(0xfff1e0, 2.0);
sun.position.set(-3000, 4000, -1500);
scene.add(sun);

let terrainMesh, routeGroup = new THREE.Group(), markerGroup = new THREE.Group();
scene.add(routeGroup, markerGroup);
const crew = [makeAstronaut(0xf5f5f5), makeAstronaut(0xe3ecff)];
crew.forEach((c) => scene.add(c));
const dust = makeDust();
scene.add(dust);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const W = () => (S.t.w - 1) * S.t.cell;
const H = () => (S.t.h - 1) * S.t.cell;
const toWorld = (x, y, z) => new THREE.Vector3(x - W() / 2, (z - S.zmin) * S.exag, y - H() / 2);
const idxWorld = (i, lift = 0) => toWorld((i % S.t.w) * S.t.cell, Math.floor(i / S.t.w) * S.t.cell, S.t.z[i] + lift);

function buildTerrainMesh() {
  const t = S.t;
  if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }
  const geo = new THREE.PlaneGeometry(W(), H(), t.w - 1, t.h - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, (t.z[i] - S.zmin) * S.exag);
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (t.orthoUrl) {
    const tex = new THREE.TextureLoader().load(t.orthoUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mat.map = tex;
  }
  terrainMesh = new THREE.Mesh(geo, mat);
  scene.add(terrainMesh);
  colorTerrain();
}

function colorTerrain() {
  const t = S.t, col = terrainMesh.geometry.attributes.color;
  const overlay = $('slopeOverlay').checked, lim = CONFIG.maxSlopeDeg.value;
  let zmax = -Infinity; for (const v of t.z) zmax = Math.max(zmax, v);
  const span = Math.max(1, zmax - S.zmin);
  for (let i = 0; i < col.count; i++) {
    let r, g, b;
    if (t.orthoUrl) { r = 1.0; g = 0.78; b = 0.62; } // CTX/HiRISE is greyscale: Mars tint (display only)
    else { const e = (t.z[i] - S.zmin) / span; r = 0.62 + 0.3 * e; g = 0.36 + 0.22 * e; b = 0.24 + 0.14 * e; }
    if (overlay && t.slope[i] > lim) { r = 1; g = 0.1; b = 0.1; }
    else if (overlay && t.slope[i] > lim * 0.7) { r = Math.min(1, r + 0.25); g *= 0.8; }
    col.setXYZ(i, r, g, b);
  }
  col.needsUpdate = true;
}

function labelSprite(text, color = '#fff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,12,10,0.75)'; g.fillRect(0, 0, 512, 96);
  g.font = 'bold 44px system-ui'; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 16, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false }));
  s.scale.set(0.16, 0.03, 1); s.renderOrder = 10;
  return s;
}

function buildMarkers() {
  markerGroup.clear();
  const pin = (idx, color, text, h = 120) => {
    const p = idxWorld(idx);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, h, 8), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(p).add(new THREE.Vector3(0, h / 2, 0)); markerGroup.add(m);
    const l = labelSprite(text, '#' + color.toString(16).padStart(6, '0')); l.position.copy(p).add(new THREE.Vector3(0, h + 70, 0)); markerGroup.add(l);
  };
  pin(S.habitatIdx, 0xffffff, '⌂ ' + S.sites.habitat.name, 160);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
  dome.position.copy(idxWorld(S.habitatIdx)); markerGroup.add(dome);
  S.sites.sites.forEach((s, k) => pin(S.siteIdx[k], 0xffb74d, `${s.id} ${s.name}`));
  const ring = new THREE.Mesh(new THREE.RingGeometry(40, 55, 32), new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.copy(idxWorld(S.destIdx, 2)); markerGroup.add(ring);
  pin(S.destIdx, 0x00e5ff, '◎ Destination', 90);
}

function buildRouteMeshes() {
  routeGroup.clear();
  for (const [key, r] of Object.entries(S.routes)) {
    if (!r) continue;
    const step = Math.max(1, Math.floor(r.samples.length / 600));
    const pts = r.samples.filter((_, k) => k % step === 0).map((p) => toWorld(p.x, p.y, p.z + 4 / S.exag));
    if (pts.length < 2) continue;
    const sel = key === S.sel;
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(2000, pts.length * 2), sel ? 6 : 3, 6, false),
      new THREE.MeshBasicMaterial({ color: ROUTE_STYLE[key].color, transparent: !sel, opacity: sel ? 1 : 0.45 }),
    );
    routeGroup.add(tube);
  }
}

// ---------- routes + comparison ----------
function recompute() {
  const t = S.t;
  const sites = S.sites.sites.map((s, k) => ({ id: s.id, idx: S.siteIdx[k] }));
  S.routes = generateRoutes(t, S.habitatIdx, S.destIdx, sites, { maxSlope: CONFIG.maxSlopeDeg.value, evaLimitH: CONFIG.evaLimitH.value });
  if (!S.routes[S.sel]) S.sel = Object.keys(S.routes).find((k) => S.routes[k]) || S.sel;
  S.tS = 0;
  buildRouteMeshes(); buildMarkers(); renderTable(); drawTrack(); update(0);
}

function routeDose(r) {
  return env.cumulativeDose(r.durationS).v;
}

function renderTable() {
  const keys = Object.keys(ROUTE_STYLE);
  const R = S.routes;
  const budget = CONFIG.evaLimitH.value * 3600;
  const head = keys.map((k) => `<th class="route ${k === S.sel ? 'sel' : ''}" data-k="${k}" style="color:#${ROUTE_STYLE[k].color.toString(16)}">${ROUTE_STYLE[k].name}</th>`).join('');
  const row = (name, lab, f, bad) => `<tr><td>${name} ${lab ? chip(lab) : ''}</td>${keys.map((k) => {
    const r = R[k]; if (!r) return '<td>—</td>';
    return `<td class="${bad && bad(r) ? 'bad' : ''}">${f(r)}</td>`;
  }).join('')}</tr>`;
  const doseLbl = env.scenarios.sep.on ? `${LABEL.MODEL} + ${LABEL.SCENARIO}` : LABEL.MODEL;
  $('routeTable').innerHTML = `<table><tr><th></th>${head}</tr>
    ${row('Distance', null, (r) => (r.distanceM / 1000).toFixed(2) + ' km')}
    ${row('Duration (incl. stops)', LABEL.ASSUMP, (r) => fmtHM(r.durationS), (r) => r.durationS > budget)}
    ${row('Return margin', LABEL.ASSUMP, (r) => fmtHM(Math.abs(budget - r.durationS)) + (r.durationS > budget ? ' over' : ''), (r) => r.durationS > budget)}
    ${row('Elevation gain', S.t.source.kind === 'real' ? LABEL.OBS : null, (r) => Math.round(r.gainM) + ' m')}
    ${row('Max / mean slope', null, (r) => `${r.maxSlopeDeg.toFixed(0)}/${r.meanSlopeDeg.toFixed(1)}°`)}
    ${row('Science sites', null, (r) => r.visited.length ? r.visited.join(', ') : '—')}
    ${row('Est. dose', doseLbl, (r) => Math.round(routeDose(r)) + ' µGy')}
  </table>`;
  $('routeTable').querySelectorAll('th.route').forEach((th) => th.onclick = () => { S.sel = th.dataset.k; buildRouteMeshes(); renderTable(); drawTrack(); update(0); });
  const notes = [];
  const missing = keys.filter((k) => !R[k]);
  if (missing.length) notes.push(`No route under the ${CONFIG.maxSlopeDeg.value}° slope limit for: ${missing.join(', ')}. Raise the limit or pick another destination.`);
  const ov = overlap(R.shortest, R.gentlest);
  if (ov > 0.8) notes.push(`Shortest and Gentlest share ${Math.round(ov * 100)}% of cells — this destination has no meaningfully gentler alternative.`);
  notes.push('Radiation: route differences come from EVA duration only. RAD is a single-point series at Gale; a few km of horizontal travel is not modeled as changing dose.');
  $('routeNote').innerHTML = notes.join('<br>');
}

function drawTrack() {
  const c = $('track'), g = c.getContext('2d');
  c.width = c.clientWidth;
  g.clearRect(0, 0, c.width, c.height);
  const r = S.routes[S.sel]; if (!r) return;
  const D = r.durationS, wpx = c.width;
  for (let k = 1; k < r.samples.length; k++) {
    const a = r.samples[k - 1], b = r.samples[k];
    const x0 = (a.t / D) * wpx, x1 = (b.t / D) * wpx;
    g.fillStyle = b.phase === 'stop' ? '#ffffff' : b.grade > 0.08 ? '#ff7043' : b.grade < -0.08 ? '#8d6e63' : b.phase === 'return' ? '#5d4037' : '#a1887f';
    g.fillRect(x0, 0, Math.max(1, x1 - x0), 12);
  }
  const mark = (sc, color) => { if (sc.on && sc.startS < D) { g.fillStyle = color; g.fillRect((sc.startS / D) * wpx - 1, 0, 3, 12); } };
  mark(env.scenarios.dust, '#ffca28'); mark(env.scenarios.sep, '#ff1744');
  const budget = CONFIG.evaLimitH.value * 3600;
  if (budget < D) { g.fillStyle = '#e040fb'; g.fillRect((budget / D) * wpx - 1, 0, 3, 12); }
}

// ---------- simulation update ----------
function latLon(x, y) {
  const c = S.t.source.center; if (!c) return null;
  const lat = c.lat + (-(y - H() / 2) / MARS_R) * (180 / Math.PI);
  const lon = c.lon + ((x - W() / 2) / (MARS_R * Math.cos((c.lat * Math.PI) / 180))) * (180 / Math.PI);
  return `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;
}

let lastState = null;
function update(dtReal) {
  const r = S.routes[S.sel];
  if (!r) return;
  const p = sampleAt(r, S.tS);
  const behind = sampleAt(r, Math.max(0, S.tS - 25)); // second crew member ~25 s behind
  const z = p.z;
  const T = env.temperature(S.tS), P = env.pressure(S.tS, z), Wd = env.wind(S.tS), tau = env.dustTau(S.tS);
  const beam = env.beamTransmission(S.tS), dr = env.doseRate(S.tS), cum = env.cumulativeDose(S.tS);
  const state = classifyState({ grade: p.grade, phase: p.phase, tau: tau.v, doseRate: dr.v, radWarn: CONFIG.radWarnUGyPerDay.value });
  lastState = state;
  const walking = p.phase !== 'stop' && S.tS < r.durationS;

  [[crew[0], p], [crew[1], behind]].forEach(([fig, q], k) => {
    const w = toWorld(q.x + (k ? 6 : 0), q.y, q.z);
    fig.position.copy(w);
    if (q.heading !== undefined && q.phase !== 'stop') fig.rotation.y = -q.heading + Math.PI / 2;
    animate(fig, k ? classifyState({ grade: q.grade, phase: q.phase, tau: tau.v, doseRate: dr.v, radWarn: Infinity }) : state, dtReal, walking, performance.now() / 1000);
  });
  updateDust(dust, crew[0].position, tau.v, Wd.v, dtReal);
  if ($('follow').checked) {
    const target = crew[0].position.clone().add(new THREE.Vector3(0, 20, 0));
    const delta = target.clone().sub(controls.target);
    controls.target.add(delta.multiplyScalar(Math.min(1, dtReal * 3 + (dtReal === 0 ? 1 : 0))));
    camera.position.add(delta);
  }

  // HUD
  const hud = [];
  if (state.flags.includes('radiation')) hud.push(`<div class="hudmsg rad">☢ RADIATION: ${Math.round(dr.v)} µGy/day &gt; ${CONFIG.radWarnUGyPerDay.value} (illustrative threshold) — return to habitat / shelter</div>`);
  if (state.flags.includes('dust')) hud.push(`<div class="hudmsg dust">Dust: τ=${tau.v.toFixed(1)} · reduced visibility, abrasion & electrostatic risk to equipment</div>`);
  if (S.tS > CONFIG.evaLimitH.value * 3600) hud.push('<div class="hudmsg margin">EVA time budget exceeded</div>');
  $('hud').innerHTML = hud.join('');

  // env panel
  const row = (k, v, x) => `<div class="k">${k}</div><div class="v">${v} ${chip(x.label)}</div><div class="src">${x.src}</div>`;
  const ltst = env.ltstH(S.tS);
  const ll = latLon(p.x, p.y);
  $('envPanel').innerHTML = `<div class="env">
    <div class="k">LTST / elapsed</div><div class="v">${String(Math.floor(ltst)).padStart(2, '0')}:${String(Math.floor((ltst % 1) * 60)).padStart(2, '0')} · T+${fmtHM(S.tS)}</div><div class="src">${CONFIG.evaStartLtstH.value}:00 LTST start ${chip(LABEL.ASSUMP)} · 1 LTST hour = ${(MARS_HOUR_S / 3600).toFixed(4)} h</div>
    <div class="k">Position</div><div class="v">${ll || `${(p.x / 1000).toFixed(2)} km E, ${(p.y / 1000).toFixed(2)} km S`}</div><div class="src">elevation ${z.toFixed(1)} m · local slope ${p.slope.toFixed(1)}° · grade ${(p.grade * 100).toFixed(0)}% ${S.t.source.kind === 'real' ? chip(LABEL.OBS) : '(synthetic terrain)'}</div>
    ${row('Air temperature', `${T.v.toFixed(1)} ${T.unit}`, T)}
    ${row('Pressure', `${P.v.toFixed(0)} ${P.unit}`, P)}
    ${row('Wind speed', `${Wd.v.toFixed(1)} ${Wd.unit}`, { ...Wd, src: `${Wd.src} · dynamic pressure ≈ ${Wd.dynamicPressurePa.toFixed(2)} Pa → mechanical force on crew negligible; wind matters as a dust driver` })}
    ${row('Column dust optical depth τ', tau.v.toFixed(2), tau)}
    ${row('Direct-beam transmission', `${(beam.v * 100).toFixed(0)} %`, beam)}
    ${row('Dose rate', `${Math.round(dr.v)} ${dr.unit}`, dr)}
    ${row('Cumulative EVA dose', `${cum.v.toFixed(1)} ${cum.unit}`, cum)}
    <div class="k">Crew state</div><div class="v">${GAIT_TEXT[state.gait]}</div><div class="src">${CONFIG.crewSize.value} astronauts ${chip(LABEL.ASSUMP)} · drawn ×${SCALE} for visibility · walking speed: Tobler × suit factor ${chip(LABEL.ASSUMP)}</div>
  </div>`;

  // arrival preview when stopped at a site
  showPreview(p.phase === 'stop' ? p.stopTag : null);

  $('scrub').value = Math.round((S.tS / r.durationS) * 1000);
  $('clock').textContent = `T+${fmtHM(S.tS)} / ${fmtHM(r.durationS)} · ${p.phase === 'stop' ? 'stop @ ' + p.stopTag : p.phase}`;
}

let previewKey = null;
function showPreview(tag) {
  if (tag === previewKey) return;
  previewKey = tag;
  const el = $('preview');
  if (!tag) { el.classList.add('hidden'); return; }
  const k = S.sites.sites.findIndex((s) => s.id === tag);
  const site = S.sites.sites[k];
  const img = site?.image ? { file: site.image, caption: site.imageCaption || '' } : S.images[k >= 0 ? k % Math.max(1, S.images.length) : 0];
  const name = site ? `${site.id} ${site.name}` : 'Destination';
  if (!img) {
    el.innerHTML = `<b>Arrival preview — ${name}</b><div class="cap">No surface image downloaded yet. Run <code>scripts\\download_data.ps1</code> (raw images step).</div>`;
  } else {
    el.innerHTML = `<b>Arrival preview — ${name}</b><img src="data/images/${img.file}" alt="Perseverance raw image">
      <div class="cap">${chip(LABEL.OBS)} ${img.caption || ''}<br>Representative Perseverance image; the camera location may differ from this site. Credit: NASA/JPL-Caltech.</div>`;
  }
  el.classList.remove('hidden');
}

// ---------- UI wiring ----------
function renderSites() {
  $('siteList').innerHTML = [
    `<div class="site"><span>⌂ ${S.sites.habitat.name} ${chip(S.sites.habitat.label || LABEL.ASSUMP)}</span></div>`,
    ...S.sites.sites.map((s, k) => `<div class="site"><span>${s.id} ${s.name} ${chip(s.label || LABEL.ASSUMP)}</span><button data-k="${k}">Go here</button></div>`),
  ].join('');
  $('siteList').querySelectorAll('button').forEach((b) => b.onclick = () => { S.destIdx = S.siteIdx[+b.dataset.k]; recompute(); });
}

function wire() {
  $('maxSlope').value = CONFIG.maxSlopeDeg.value;
  $('evaLimit').value = CONFIG.evaLimitH.value;
  $('exag').value = S.exag;
  $('maxSlope').onchange = (e) => { CONFIG.maxSlopeDeg.value = +e.target.value; colorTerrain(); recompute(); };
  $('evaLimit').onchange = (e) => { CONFIG.evaLimitH.value = +e.target.value; recompute(); };
  $('slopeOverlay').onchange = colorTerrain;
  $('exag').oninput = (e) => { S.exag = +e.target.value; buildTerrainMesh(); buildRouteMeshes(); buildMarkers(); update(0); };
  const sc = () => {
    env.scenarios.dust = { on: $('scDust').checked, startS: +$('scDustT').value * 3600 };
    env.scenarios.sep = { on: $('scSep').checked, startS: +$('scSepT').value * 3600 };
    renderTable(); drawTrack(); update(0);
  };
  ['scDust', 'scDustT', 'scSep', 'scSepT'].forEach((id) => $(id).onchange = sc);
  $('play').onclick = () => { S.playing = !S.playing; $('play').textContent = S.playing ? '❚❚' : '▶'; };
  $('scrub').oninput = (e) => { const r = S.routes[S.sel]; if (r) { S.tS = (e.target.value / 1000) * r.durationS; update(0); } };

  // click-to-set destination (ignore drags)
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => down = [e.clientX, e.clientY]);
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(terrainMesh)[0]; if (!hit) return;
    const c = Math.round((hit.point.x + W() / 2) / S.t.cell), r = Math.round((hit.point.z + H() / 2) / S.t.cell);
    if (c < 0 || r < 0 || c >= S.t.w || r >= S.t.h) return;
    const raw = r * S.t.w + c;
    S.destIdx = snapTraversable(S.t, raw, CONFIG.maxSlopeDeg.value);
    const u = (c / (S.t.w - 1)).toFixed(3), v = (r / (S.t.h - 1)).toFixed(3);
    $('clickInfo').innerHTML = `Last click: u=${u}, v=${v}${latLon(c * S.t.cell, r * S.t.cell) ? ' · ' + latLon(c * S.t.cell, r * S.t.cell) : ''}${raw !== S.destIdx ? ' (snapped to nearest cell under slope limit)' : ''}<br>Copy u/v into public/data/sites.json to add a site.`;
    recompute();
  });
}

let prev = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  const r = S.routes[S.sel];
  if (S.playing && r) {
    S.tS = Math.min(r.durationS, S.tS + dt * +$('speed').value);
    if (S.tS >= r.durationS) { S.playing = false; $('play').textContent = '▶'; }
  }
  if (r) update(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

async function main() {
  resize();
  const [{ terrain, sites }] = await Promise.all([loadTerrain(), env.load()]);
  try { const m = await (await fetch('data/images/manifest.json')).json(); S.images = m.items || []; } catch { S.images = []; }
  S.t = terrain; S.sites = sites;
  S.zmin = terrain.z.reduce((a, b) => Math.min(a, b), Infinity);
  const idx = ({ u, v }) => { const { c, r } = uvToCell(terrain, u, v); return snapTraversable(terrain, r * terrain.w + c); };
  S.habitatIdx = idx(sites.habitat);
  S.siteIdx = sites.sites.map(idx);
  S.destIdx = S.siteIdx[1] ?? S.siteIdx[0];
  env.refElevation = terrain.z[S.habitatIdx];

  const badge = $('dataBadge');
  if (terrain.source.kind === 'real') { badge.className = 'badge real'; badge.textContent = `Terrain: ${terrain.source.dem}`; }
  else { badge.className = 'badge synth'; badge.textContent = 'SYNTHETIC TERRAIN — run scripts/download_data.ps1 + preprocess for real Jezero data'; }
  badge.title = `DEM: ${terrain.source.dem}\nOptical: ${terrain.source.ortho || 'none'}\nMEDA: ${env.meda ? 'sol ' + env.meda.sol : 'not loaded (built-in model)'}\nRAD: ${env.rad.sep ? 'baseline + SEP profile' : 'baseline only'}`;

  buildTerrainMesh();
  const h0 = idxWorld(S.habitatIdx);
  controls.target.copy(h0);
  camera.position.copy(h0).add(new THREE.Vector3(-260, 240, 420));
  renderSites(); wire(); recompute();
  requestAnimationFrame(loop);
}
main();

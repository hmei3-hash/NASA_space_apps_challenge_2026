import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, LABEL, ROUTE_STYLE } from './config.js';
import { loadTerrain, uvToCell } from './terrain.js';
import { generateRoutes, sampleAt, snapTraversable, overlap, speedKmh, astar, walkedCells, spliceRoute } from './routing.js';
import { CASES } from './research.js';
import { DustFront, FRONT, NETWORKS } from './dustfront.js';
import { Environment, MARS_HOUR_S } from './environment.js';
import { makeAstronaut, animate, classifyState, GAIT_TEXT, makeDust, updateDust, SCALE } from './astronaut.js';
import { RESOURCE_TYPES, badgeSprite, badgeImgHTML } from './resources.js';
import { ICON_ATTRIBUTION } from './icons.js';
import { makeHabitat, tickHabitat, HAB_SCALE } from './habitat.js';
import { ProfileStrip, GAIT_LABEL } from './profile.js';
import { GlobeView } from './globe.js';
import { Visor, bearing, yawToHeading } from './visor.js';

const $ = (id) => document.getElementById(id);
const CHIP = { [LABEL.OBS]: 'o', [LABEL.REPLAY]: 'r', [LABEL.MODEL]: 'm', [LABEL.ASSUMP]: 'a', [LABEL.SCENARIO]: 's' };
const PVWORD = { o: 'measured', r: 'replay', m: 'model', a: 'assumed', s: 'scenario' };
const chip = (label) => [...new Set(label.split(' + '))].map((l) => { const c = CHIP[l] || 'm'; return `<i class="pv ${c}" title="${l}">${PVWORD[c]}</i>`; }).join(' ');
const fmtMin = (s) => (s < 3600 ? `${Math.max(0, Math.round(s / 60))} min` : `${fmtHM(s)} h`);
const fmtHM = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const MARS_R = 3396190;

const S = {
  t: null, sites: null, habitatIdx: 0, destIdx: 0, siteIdx: [], routes: {}, sel: 'gentlest',
  tS: 0, playing: false, exag: CONFIG.verticalExaggeration, zmin: 0, images: [],
  places: null, view: 'globe', replanInfo: null, handled: { dust: false, sep: false }, fp: false, fpYaw: 0, fpYawOff: 0, fpPitch: -0.08, hiddenKinds: new Set(),
};
const env = new Environment();

// ---------- three.js scene ----------
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc79a7b);
scene.fog = new THREE.Fog(0xc79a7b, 4000, 14000);
const camera = new THREE.PerspectiveCamera(50, 1, 5, 120000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
const hemi = new THREE.HemisphereLight(0xffe6d0, 0x3b2418, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1e0, 2.0);
sun.position.set(-3000, 4000, -1500);
scene.add(sun);

const habitat = makeHabitat(); scene.add(habitat);
let terrainMesh, routeGroup = new THREE.Group(), markerGroup = new THREE.Group(), resGroup = new THREE.Group(), travGroup = new THREE.Group();
scene.add(routeGroup, markerGroup, resGroup, travGroup);
const SKY = new THREE.Color(0xc79a7b), DUSTSKY = new THREE.Color(0x9a6a48);
const crew = [makeAstronaut(0xf4f4f2, 0xd32f2f), makeAstronaut(0xf4f4f2)]; // red thigh band = EV1, plain = EV2
crew.forEach((c) => scene.add(c));
const dust = makeDust();
scene.add(dust);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  globe?.resize(w, h);
}
let globe = null;
const visor = new Visor(viewport);
const GALE = { lat: -5.37, lon: 137.81 };

function siteInfo() {
  const c = S.t.source.center || { lat: 18.455, lon: 77.42 };
  return { lat: c.lat, lon: c.lon, sizeKm: W() / 1000 };
}

function showGlobeCard(which = 'site') {
  const el = $('globeCard'), s = siteInfo();
  if (which === 'gale') {
    el.innerHTML = `<h2>Gale crater</h2><p class="coords">5.4°S, 137.8°E</p>
      <p>Curiosity has measured surface radiation here since 2012. Marswalk's dose rates come from this instrument, about ${Math.round(globe.galeKm).toLocaleString('en-US')} km from Jezero, so they are labelled as Gale data, not Jezero data.</p>
      <button class="ghost" id="gcBack">Back to Jezero</button>`;
    $('gcBack').onclick = () => showGlobeCard('site');
  } else {
    el.innerHTML = `<h2>Jezero crater</h2><p class="coords">${s.lat.toFixed(2)}°N, ${s.lon.toFixed(2)}°E</p>
      <p>A 45 km crater that once held a lake. Perseverance has explored its delta since 2021. The box marks the ${Math.round(s.sizeKm)} km EVA planning area.</p>
      <button class="go" id="gcFly">Fly in to the EVA site</button>
      <p class="src">Globe: ${globe.source || 'loading…'}</p>`;
    $('gcFly').onclick = flyIn;
  }
}

function setView(v) {
  S.view = v;
  const g = v === 'globe';
  document.body.classList.toggle('globe-mode', g);
  controls.enabled = !g && !S.fp;
  globe.setActive(g);
  $('globeBtn').setAttribute('aria-pressed', g);
  if (g) { if (S.fp) $('fpBtn').click(); showGlobeCard('site'); }
}

function flyIn() {
  $('gcFly').disabled = true;
  globe.flyIn(() => {
    setView('local');
    $('fade').style.opacity = 1;
    requestAnimationFrame(() => { $('fade').style.transition = 'opacity 0.9s'; $('fade').style.opacity = 0; setTimeout(() => { $('fade').style.transition = ''; }, 950); });
  });
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
  const c = document.createElement('canvas'), g0 = c.getContext('2d');
  g0.font = 'bold 44px Barlow, system-ui'; const tw = Math.ceil(g0.measureText(text).width) + 32;
  c.width = tw; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(18,21,27,0.8)'; g.fillRect(0, 0, tw, 96);
  g.font = 'bold 44px Barlow, system-ui'; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 16, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false }));
  s.scale.set(0.03 * tw / 96, 0.03, 1); s.renderOrder = 10;
  return s;
}

function placeHabitat() {
  const s = S.fp ? 1 : HAB_SCALE;
  habitat.scale.set(s, s * (S.fp ? 1 : 1), s);
  habitat.position.copy(idxWorld(S.habitatIdx)).add(new THREE.Vector3(0, -0.6 * s, 0));
}

function buildMarkers() {
  markerGroup.clear();
  const pin = (idx, color, text, h = 120) => {
    const p = idxWorld(idx);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, h, 8), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(p).add(new THREE.Vector3(0, h / 2, 0)); markerGroup.add(m);
    const l = labelSprite(text, '#' + color.toString(16).padStart(6, '0')); l.position.copy(p).add(new THREE.Vector3(0, h + 70, 0)); markerGroup.add(l);
  };
  const hb = badgeSprite('habitat', 0.055); hb.position.copy(idxWorld(S.habitatIdx)).add(new THREE.Vector3(0, 80, 0)); hb.userData.habitat = true; markerGroup.add(hb);
  const hl = labelSprite('Habitat'); hl.position.copy(idxWorld(S.habitatIdx)).add(new THREE.Vector3(0, 80, 0)); hl.center.set(0.5, -0.9); markerGroup.add(hl);
  placeHabitat();
  if (!S.places) S.sites.sites.forEach((s, k) => {
    const b = badgeSprite(s.resource || 'sediment'); b.position.copy(idxWorld(S.siteIdx[k])).add(new THREE.Vector3(0, 50, 0));
    b.userData.site = k; markerGroup.add(b);
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(40, 55, 32), new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.copy(idxWorld(S.destIdx, 2)); markerGroup.add(ring);
  pin(S.destIdx, 0x00e5ff, '◎ Destination', 90);
}

function latLonToXY(lat, lon) {
  const c = S.t.source.center;
  const x = ((lon - c.lon) * Math.PI / 180) * MARS_R * Math.cos((c.lat * Math.PI) / 180) + W() / 2;
  const y = H() / 2 - ((lat - c.lat) * Math.PI / 180) * MARS_R; // grid y grows southward
  return { x, y, inside: x >= 0 && y >= 0 && x <= W() && y <= H() };
}
function zAtXY(x, y) {
  const c = Math.min(S.t.w - 1, Math.max(0, Math.round(x / S.t.cell))), r = Math.min(S.t.h - 1, Math.max(0, Math.round(y / S.t.cell)));
  return S.t.z[r * S.t.w + c];
}

function buildPlaces() {
  resGroup.clear(); travGroup.clear();
  if (!S.places) return;
  const pts = [];
  for (const [lat, lon] of S.places.traverse) {
    const q = latLonToXY(lat, lon); if (!q.inside) { if (pts.length > 1) addTrav(pts.splice(0)); else pts.length = 0; continue; }
    pts.push(toWorld(q.x, q.y, zAtXY(q.x, q.y) + 3 / S.exag));
  }
  if (pts.length > 1) addTrav(pts);
  function addTrav(arr) {
    const g = new THREE.BufferGeometry().setFromPoints(arr);
    travGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: true })));
  }
  S.places.places.forEach((p, k) => {
    if (!p._xy.inside || S.hiddenKinds.has(p.resource)) return;
    const b = badgeSprite(p.resource, p.science ? 0.05 : 0.04);
    b.position.copy(toWorld(p._xy.x, p._xy.y, zAtXY(p._xy.x, p._xy.y))).add(new THREE.Vector3(0, 50, 0));
    b.userData.place = k;
    resGroup.add(b);
  });
  travGroup.visible = $('showTrav').checked;
}

// ---------- info cards (resources, habitat, science sites) ----------
const idxXY = (i) => ({ x: (i % S.t.w) * S.t.cell, y: Math.floor(i / S.t.w) * S.t.cell });
const terrLabel = () => (S.t.source.kind === 'real' ? LABEL.OBS : null);

/** Quick reachability estimate from the habitat: straight line x1.25 at flat-ground suit speed. */
function reachEstimate(idx) {
  const a = idxXY(S.habitatIdx), b = idxXY(idx);
  const km = Math.hypot(a.x - b.x, a.y - b.y) / 1000;
  const oneWayH = (km * 1.25) / speedKmh(0);
  const roundH = 2 * oneWayH + CONFIG.stopMinPerSite.value / 60;
  return { km, oneWayH, roundH, fits: roundH <= CONFIG.evaLimitH.value };
}
const fmtH = (h) => fmtHM(h * 3600);

function locationRows(idx) {
  const { x, y } = idxXY(idx), ll = latLon(x, y), tl = terrLabel();
  return [
    ['Coordinates', ll || `${(x / 1000).toFixed(2)} km E, ${(y / 1000).toFixed(2)} km S`, tl],
    ['Elevation', `${S.t.z[idx].toFixed(0)} m`, tl],
    ['Local slope', `${S.t.slope[idx].toFixed(1)}°${S.t.slope[idx] > CONFIG.maxSlopeDeg.value ? ' (above limit)' : ''}`, tl],
  ];
}

function showCard({ kind, title, subtitle, desc, rows, foot, goIdx }) {
  const el = $('preview');
  const rowHTML = rows.map(([k, v, l]) => `<div class="k">${k}</div><div class="v">${v} ${l ? chip(l) : ''}</div>`).join('');
  el.innerHTML = `<div class="pc-head">${badgeImgHTML(kind, 34)}<div><b>${title}</b><br><span class="cap">${subtitle}</span></div><button class="x" id="pcClose">✕</button></div>
    ${desc ? `<div class="cap">${desc}</div>` : ''}
    <div class="env card-rows">${rowHTML}</div>
    ${foot ? `<div class="cap">${foot}</div>` : ''}
    ${goIdx !== undefined ? '<button id="pcGo" class="go">Set as destination</button>' : ''}`;
  el.classList.remove('hidden');
  $('pcClose').onclick = () => { el.classList.add('hidden'); previewKey = null; };
  if (goIdx !== undefined) $('pcGo').onclick = () => { S.destIdx = snapTraversable(S.t, goIdx, CONFIG.maxSlopeDeg.value); recompute(); };
}

function reachRows(idx) {
  const r = reachEstimate(idx), dz = S.t.z[idx] - S.t.z[S.habitatIdx];
  return [
    ['From habitat', `${r.km.toFixed(2)} km straight line, ${dz >= 0 ? '+' : ''}${dz.toFixed(0)} m`, null],
    ['Est. walk (one way)', fmtH(r.oneWayH), LABEL.MODEL],
    ['Est. round trip + stop', `${fmtH(r.roundH)} — ${r.fits ? 'fits' : 'exceeds'} the ${CONFIG.evaLimitH.value} h EVA`, LABEL.ASSUMP],
  ];
}

function showPlaceCard(k) {
  const p = S.places.places[k], t = RESOURCE_TYPES[p.resource], idx = xyIdx(p._xy);
  previewKey = 'place:' + k;
  showCard({
    kind: p.resource, title: p.name, subtitle: `${t.en}${p.science ? ' · science site' : ''}`,
    desc: `${p.desc}<br><i>Why it matters:</i> ${t.why}`,
    rows: [...locationRows(idx), ...reachRows(idx), ['Visited by Perseverance', `sample sol ${p.sol} (waypoint sol ${p.waypointSol})`, LABEL.OBS]],
    foot: `Position = Perseverance end-of-sol waypoint; the feature lies within tens of metres. Basis: ${p.basis}. Walk estimates are straight-line ×1.25; generate routes for real values.`,
    goIdx: idx,
  });
}

function showSiteCard(k) {
  const s = S.sites.sites[k], idx = S.siteIdx[k], kind = s.resource || 'sediment', t = RESOURCE_TYPES[kind];
  if (s.place) { const pk = S.places.places.indexOf(s.place); if (pk >= 0) return showPlaceCard(pk); }
  previewKey = 'site:' + k;
  showCard({ kind, title: `${s.id} ${s.name}`, subtitle: `${t.en} · ${s.label || LABEL.ASSUMP} position`, desc: t.why,
    rows: [...locationRows(idx), ...reachRows(idx)], foot: 'Placeholder site on synthetic terrain.', goIdx: idx });
}

function showHabitatCard() {
  const idx = S.habitatIdx, z = S.t.z[idx], tS = S.tS;
  const T = env.temperature(tS), P = env.pressure(tS, z), dr = env.doseRate(tS), tau = env.dustTau(tS);
  const targets = S.places ? S.places.places.filter((p) => p._xy.inside).map((p) => ({ name: p.name, idx: xyIdx(p._xy) }))
    : S.sites.sites.map((s, k) => ({ name: s.name, idx: S.siteIdx[k] }));
  const est = targets.map((q) => ({ ...q, ...reachEstimate(q.idx) })).sort((a, b) => a.km - b.km);
  const reachable = est.filter((q) => q.fits);
  previewKey = 'habitat';
  showCard({
    kind: 'habitat', title: S.sites.habitat.name, subtitle: 'EVA start / end point',
    desc: RESOURCE_TYPES.habitat.why + ' Location is assumed, not a real landing or base site.',
    rows: [
      ...locationRows(idx),
      ['Crew', `${CONFIG.crewSize.value} astronauts on foot`, LABEL.ASSUMP],
      ['EVA budget', `${CONFIG.evaLimitH.value} h from ${CONFIG.evaStartLtstH.value}:00 LTST`, LABEL.ASSUMP],
      [`Air temp (T+${fmtHM(tS)})`, `${T.v.toFixed(1)} °C`, T.label],
      ['Pressure here', `${P.v.toFixed(0)} Pa`, P.label],
      ['Dust optical depth τ', tau.v.toFixed(2), tau.label],
      ['Dose rate', `${Math.round(dr.v)} µGy/day`, dr.label],
      ['Places in reach', `${reachable.length} of ${est.length} (round trip within budget)`, LABEL.MODEL],
      ['Nearest', est[0] ? `${est[0].name}, ${est[0].km.toFixed(2)} km` : '—', null],
    ],
    foot: 'Environment values follow the timeline. Reach is a straight-line estimate; use the routes for real distances.',
  });
}

const xyIdx = (q) => Math.min(S.t.h - 1, Math.max(0, Math.round(q.y / S.t.cell))) * S.t.w + Math.min(S.t.w - 1, Math.max(0, Math.round(q.x / S.t.cell)));

function renderResourceList() {
  if (!S.places) { $('resList').innerHTML = '<p class="note">Run <code>scripts\\build_places.py</code> to load real Jezero place names.</p>'; return; }
  const inside = S.places.places.map((p, k) => ({ p, k })).filter(({ p }) => p._xy.inside);
  const kinds = [...new Set(inside.map(({ p }) => p.resource))];
  $('resList').innerHTML = `<div class="kinds">${kinds.map((kd) => `<label class="kind"><input type="checkbox" data-kind="${kd}" ${S.hiddenKinds.has(kd) ? '' : 'checked'}>${badgeImgHTML(kd, 18)} ${RESOURCE_TYPES[kd].en}</label>`).join('')}</div>` +
    inside.map(({ p, k }) => `<div class="site">${badgeImgHTML(p.resource, 20)}<span class="pn" data-k="${k}" role="button" tabindex="0">${p.name}</span><small>sol ${p.sol}</small></div>`).join('') +
    `<p class="note">${inside.length}/${S.places.places.length} places inside this map. ${ICON_ATTRIBUTION}</p>`;
  $('resList').querySelectorAll('input[data-kind]').forEach((cb) => cb.onchange = () => {
    cb.checked ? S.hiddenKinds.delete(cb.dataset.kind) : S.hiddenKinds.add(cb.dataset.kind); buildPlaces();
  });
  $('resList').querySelectorAll('.pn').forEach((el) => {
    el.onclick = () => { showPlaceCard(+el.dataset.k); flyTo(S.places.places[+el.dataset.k]._xy); };
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });
}
function flyTo(q) {
  if (S.fp) return;
  $('follow').checked = false;
  const tgt = toWorld(q.x, q.y, zAtXY(q.x, q.y));
  const off = camera.position.clone().sub(controls.target).setLength(900);
  controls.target.copy(tgt); camera.position.copy(tgt).add(off);
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
  S.tS = 0; S.replanInfo = null; S.handled = { dust: false, sep: false }; closeReplan();
  placeRover(); setupFront();
  buildRouteMeshes(); buildMarkers(); renderTable(); drawTrack(); update(0);
}

function routeDose(r) {
  return env.cumulativeDose(r.durationS).v;
}

function routeBlurb(k) {
  const R = S.routes, r = R[k], sh = R.shortest, budget = CONFIG.evaLimitH.value * 3600;
  if (k === 'replan' && r && S.replanInfo) {
    const m = budget - r.durationS;
    return `<div class="rhead">${(r.distanceM / 1000).toFixed(1)} km&ensp;${fmtHM(r.durationS)} h&ensp;max ${r.maxSlopeDeg.toFixed(0)}°</div><div class="rtxt">Changed at T+${fmtHM(S.replanInfo.at)} after the ${S.replanInfo.kind === 'dust' ? 'dust storm' : 'solar particle event'}: ${S.replanInfo.name.toLowerCase()}. <span class="${m < 0 ? 'bad' : 'ok'}">${m < 0 ? 'Over budget by ' + fmtHM(-m) + '.' : fmtHM(m) + ' spare.'}</span></div>`;
  }
  if (!r) return `No route under the ${CONFIG.maxSlopeDeg.value}° slope limit.`;
  const margin = budget - r.durationS;
  const head = `${(r.distanceM / 1000).toFixed(1)} km&ensp;${fmtHM(r.durationS)} h&ensp;max ${r.maxSlopeDeg.toFixed(0)}°`;
  let why = '';
  if (k === 'shortest') why = 'Fastest way to the destination within the slope limit.';
  if (k === 'gentlest') why = sh ? ((overlap(sh, r) > 0.9 || (Math.abs(r.distanceM - sh.distanceM) < 100 && Math.abs(r.maxSlopeDeg - sh.maxSlopeDeg) < 1)) ? 'As easy as Shortest here: the ground is already gentle.'
    : `${r.distanceM >= sh.distanceM ? '+' : ''}${((r.distanceM - sh.distanceM) / 1000).toFixed(1)} km vs Shortest to keep max slope ${r.maxSlopeDeg.toFixed(0)}° (vs ${sh.maxSlopeDeg.toFixed(0)}°).`) : 'Avoids steep ground.';
  if (k === 'science') {
    const names = r.visited.map((id) => S.sites.sites.find((s) => s.id === id)?.name || id);
    why = names.length ? `Samples ${names.length} site${names.length > 1 ? 's' : ''} on the way: ${names.join(', ')}.` : 'No extra science site fits in the EVA budget.';
    if (sh) why += ` +${fmtHM(Math.max(0, r.durationS - sh.durationS))} vs Shortest.`;
  }
  return `<div class="rhead">${head}</div><div class="rtxt">${why} <span class="${margin < 0 ? 'bad' : 'ok'}">${margin < 0 ? 'Over budget by ' + fmtHM(-margin) + '.' : fmtHM(margin) + ' spare to get home.'}</span></div>`;
}

function renderCards() {
  $('routeCards').innerHTML = Object.keys(ROUTE_STYLE).filter((k) => k !== 'replan' || S.routes.replan).map((k) => `<div class="rcard ${k === S.sel ? 'sel' : ''}" data-k="${k}" style="--c:#${ROUTE_STYLE[k].color.toString(16).padStart(6, '0')}">
    <div class="rname">${ROUTE_STYLE[k].name}</div>${routeBlurb(k)}</div>`).join('');
  $('routeCards').querySelectorAll('.rcard').forEach((c) => c.onclick = () => { if (!S.routes[c.dataset.k]) return; S.sel = c.dataset.k; if (S.sel !== 'replan') placeRover(); buildRouteMeshes(); renderTable(); drawTrack(); update(0); });
}

function renderTable() {
  renderCards();
  const keys = Object.keys(ROUTE_STYLE).filter((k) => k !== 'replan' || S.routes.replan);
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

const profile = new ProfileStrip($('profile'), (t) => { S.tS = t; update(0); });
function drawTrack() {
  profile.setRoute(S.routes[S.sel], { dust: env.scenarios.dust, warnS: front ? front.detections()[0].t : undefined, sep: env.scenarios.sep, budgetS: CONFIG.evaLimitH.value * 3600 });
}

// ---------- mid-EVA re-planning + dust-front early warning ----------
const PACE = { dustNew: 0.7, dustTracks: 0.85 }; // Assumption: slower in low visibility, less so on known tracks
let front = null; // DustFront while the dust scenario is on
const dustWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xa8714b, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
dustWall.rotation.y = Math.PI / 2; dustWall.visible = false; scene.add(dustWall);
const stationGroup = new THREE.Group(); scene.add(stationGroup);
const roverGroup = new THREE.Group(); scene.add(roverGroup);

function integrate(fn, t0, t1) { let acc = 0; for (let t = t0; t < t1; t += 60) acc += fn(t) * Math.min(60, t1 - t); return acc; }

/** Pressurized rover staged at the middle of the outbound leg (Assumption): a safe haven within reach. */
function placeRover() {
  roverGroup.clear(); S.roverIdx = null;
  const r = S.routes[S.sel === 'replan' ? 'gentlest' : S.sel] || S.routes.gentlest; if (!r) return;
  const out = r.samples.filter((s) => s.phase === 'out'); if (out.length < 10) return;
  S.roverIdx = out[Math.floor(out.length / 2)].i;
  const p = idxWorld(S.roverIdx);
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 3.4), new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.6 }));
  body.position.y = 2.6;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 3.2), new THREE.MeshStandardMaterial({ color: 0x9fd3ff, emissive: 0x3a6f99, emissiveIntensity: 0.5 }));
  cab.position.set(2.4, 3.4, 0);
  const g = new THREE.Group(); g.add(body, cab);
  for (const [x, z] of [[-2, -1.8], [2, -1.8], [-2, 1.8], [2, 1.8]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 14), new THREE.MeshStandardMaterial({ color: 0x2a2f36 })); w.rotation.x = Math.PI / 2; w.position.set(x, 0.9, z); g.add(w); }
  g.scale.setScalar(S.fp ? 1 : HAB_SCALE); g.position.copy(p); roverGroup.add(g);
  const l = labelSprite('Shelter rover (assumed)', '#9fd3ff'); l.position.copy(p).add(new THREE.Vector3(0, 70, 0)); roverGroup.add(l);
}

const DIRWORD = { N: 'north', E: 'east', S: 'south', W: 'west' };
const stationName = (s) => (s.id === 'HAB' ? 'habitat met station' : `station ${s.id}, ${s.km} km ${DIRWORD[s.dir]}`);

function setupFront() {
  stationGroup.clear(); front = null; dustWall.visible = false;
  const d = env.scenarios.dust; delete d.crewStartS;
  if (!d.on || !S.t) return;
  const h = idxXY(S.habitatIdx);
  front = new DustFront(h.x, h.y, d.startS, $('scNet').value);
  front.stations.forEach((s) => {
    const inside = s.x >= 0 && s.x <= W() && s.y >= 0 && s.y <= H();
    const x = Math.max(0, Math.min(W(), s.x)), y = Math.max(0, Math.min(H(), s.y));
    const pos = toWorld(x, y, zAtXY(x, y));
    if (inside) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 60, 6), new THREE.MeshStandardMaterial({ color: 0xb9bec4 })); mast.position.copy(pos).add(new THREE.Vector3(0, 30, 0)); stationGroup.add(mast);
    }
    s._pos = pos; s._inside = inside; s._lit = false;
    s._label = labelSprite(`${inside ? '' : '→ '}${s.id === 'HAB' ? 'Habitat met station' : `Met station ${s.id}, ${s.km} km`}`, '#9fd3ff');
    s._label.position.copy(pos).add(new THREE.Vector3(0, 90, 0)); stationGroup.add(s._label);
  });
}

function updateFront(tS, crewX) {
  if (!front) { dustWall.visible = false; return null; }
  const fx = front.x(tS);
  dustWall.visible = fx > -4000 && fx < W() + 4000;
  dustWall.scale.set(H() + 6000, 900, 1);
  dustWall.position.set(fx - W() / 2, 450, 0);
  env.scenarios.dust.crewStartS = front.arrivalAt(crewX);
  const K = front.knowledge(tS, crewX);
  for (const s of front.stations) {
    const lit = K ? K.det.some((d) => d.id === s.id) : false;
    if (lit !== s._lit) {
      stationGroup.remove(s._label);
      s._label = labelSprite(`${lit ? 'Dust detected: ' : 'Met station '}${s.id}${s.km ? `, ${s.km} km` : ''}`, lit ? '#ff8a7a' : '#9fd3ff');
      s._label.position.copy(s._pos).add(new THREE.Vector3(0, 90, 0)); stationGroup.add(s._label); s._lit = lit;
    }
  }
  return K;
}

function replanOptions(kind) {
  const t = S.t, r = S.routes[S.sel], tS = S.tS, p = sampleAt(r, tS), cur = p.i;
  const walked = walkedCells(r, tS); if (walked[walked.length - 1] !== cur) walked.push(cur);
  const dust = kind === 'dust', opts = [];
  const finish = (key, name, why, route, shelterIdx, extra = {}) => {
    if (!route) return;
    const end = route.durationS, fromNow = end - tS;
    const sx = shelterIdx !== null ? idxXY(shelterIdx).x : null;
    const frontAt = dust && front && sx !== null ? front.arrivalAt(sx) : null;
    const slack = frontAt !== null ? frontAt - end : null;
    const doseUGy = integrate((x) => env.doseRate(x).v / 86400, tS, end);
    const distNow = Math.max(0, route.distanceM - walkedDistance(r, tS));
    opts.push({ key, name, why, route, fromNow, end, slack, stormS: slack !== null ? Math.max(0, -slack) : null, doseUGy, distNow, maxSlope: route.maxSlopeDeg, ...extra });
  };
  const direct = astar(t, cur, S.habitatIdx, dust ? 'shortest' : 'shortest', CONFIG.maxSlopeDeg.value);
  if (direct && direct.length > 1) finish('direct', 'Head straight home', dust ? 'Fastest path to the habitat. New ground if visibility drops on the way.' : 'Fastest path to shelter in the habitat.',
    spliceRoute(t, r, tS, [{ cells: direct, phase: 'return' }]), S.habitatIdx);
  if (walked.length > 1) finish('retrace', 'Retrace your tracks home', 'Walk back over ground you have already crossed. Easier to follow if the front catches you.',
    spliceRoute(t, r, tS, [{ cells: walked.slice().reverse(), phase: 'return', speedMul: dust ? PACE.dustTracks : 1 }]), S.habitatIdx);
  if (S.roverIdx !== null && S.roverIdx !== undefined) {
    const toRover = astar(t, cur, S.roverIdx, 'shortest', CONFIG.maxSlopeDeg.value);
    if (toRover && toRover.length > 1) finish('rover', 'Shelter in the staged rover', 'Get into the pressurized rover parked on the route and wait the storm out.',
      spliceRoute(t, r, tS, [{ cells: toRover, phase: 'return', stopAfterMin: 1, stopTag: 'rover' }]), S.roverIdx);
  }
  const remaining = r.durationS - tS, est = dust ? remaining / PACE.dustNew : remaining;
  finish('continue', 'Continue the plan', 'Keep going to the destination and stops as planned.', { ...r, durationS: tS + est }, S.habitatIdx, { projected: true });
  const moves = opts.filter((o) => o.key !== 'continue');
  let rec;
  if (dust) rec = moves.filter((o) => o.slack >= 0).sort((a, b) => a.fromNow - b.fromNow)[0] || moves.sort((a, b) => a.stormS - b.stormS)[0];
  else rec = moves.sort((a, b) => a.fromNow - b.fromNow)[0];
  if (rec) rec.recommended = true;
  return opts;
}

function walkedDistance(r, tS) {
  let d = 0; const s = r.samples;
  for (let k = 1; k < s.length && s[k].t <= tS; k++) d += Math.hypot(s[k].x - s[k - 1].x, s[k].y - s[k - 1].y, s[k].z - s[k - 1].z);
  return d;
}

function openReplan(kind) {
  S.playing = false; $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play');
  S.handled[kind] = true;
  const r = S.routes[S.sel], p = sampleAt(r, S.tS);
  const opts = replanOptions(kind), budget = CONFIG.evaLimitH.value * 3600, c = CASES[kind];
  const K = kind === 'dust' && front ? front.knowledge(S.tS, p.x) : null;
  const optHTML = opts.map((o, i) => {
    const m = budget - o.end;
    const verdict = o.slack === null ? '' : o.slack >= 0 ? `<p class="ok">Inside ${fmtMin(o.slack)} before the front</p>` : `<p class="bad">Front arrives ${fmtMin(-o.slack)} before you reach shelter</p>`;
    return `<div class="rp-opt ${o.recommended ? 'rec' : ''}">
      <div class="rp-top"><b>${o.name}</b>${o.recommended ? '<span class="rp-badge">Recommended</span>' : ''}</div>
      <p>${o.why}</p>${o.key === 'continue' ? '' : verdict}
      <dl class="rp-m">
        <div><dt>${o.key === 'rover' ? 'In the rover in' : 'Home in'}</dt><dd>${fmtHM(o.fromNow)}${o.projected ? ' (est.)' : ''}</dd></div>
        <div><dt>Distance</dt><dd>${(o.distNow / 1000).toFixed(1)} km</dd></div>
        <div><dt>Max slope</dt><dd>${o.maxSlope.toFixed(0)}°</dd></div>
        <div><dt>${kind === 'dust' ? 'Exposed to storm' : 'Extra dose'}</dt><dd>${kind === 'dust' ? (o.key === 'continue' ? 'most of it' : fmtMin(o.stormS || 0)) : o.doseUGy.toFixed(1) + ' µGy'}</dd></div>
        <div><dt>EVA margin</dt><dd class="${m < 0 ? 'bad' : ''}">${m < 0 ? '−' + fmtHM(-m) : fmtHM(m)}</dd></div>
      </dl>
      <button class="${o.recommended ? 'go' : 'ghost'}" data-i="${i}">${o.key === 'continue' ? 'Keep the plan' : 'Choose this'}</button>
    </div>`;
  }).join('');
  const first = K?.det[0];
  const head = kind === 'dust'
    ? `<h2 id="rpTitle">Dust front detected ${first ? `at ${stationName(first)}` : ''}. ${K && K.passed ? 'It is already over you.' : `Reaches you in about ${K ? fmtMin(K.etaS) : '?'}.`}</h2>
       <p>Network: ${front.network.name} <i class="pv a">proposed</i>. Moving east at ${K ? K.speed.toFixed(0) : FRONT.speedMs} m/s <i class="pv ${K && K.speedLabel === 'measured' ? 'o' : 'a'}">${K ? K.speedLabel : 'assumed'}</i>, the speed measured for the January 2022 storm at Jezero. Pace drops to ${Math.round(PACE.dustTracks * 100)}% on your own tracks once the dust arrives <i class="pv a">assumed</i>. Earth is 4 to 24 light-minutes away, so this call is yours.</p>`
    : `<h2 id="rpTitle">Solar particle event at T+${fmtHM(S.tS)}. Get to shelter.</h2>
       <p>Dose rate follows the May 2024 RAD event profile <i class="pv s">scenario</i>. Shielding by terrain is not modelled. Earth is 4 to 24 light-minutes away, so this call is yours.</p>`;
  const el = $('replan');
  el.innerHTML = `<div class="rp-card" role="alertdialog" aria-modal="true" aria-labelledby="rpTitle">
    <div class="rp-head">${head}</div>
    <div class="rp-body">
      <div class="rp-opts">${optHTML}</div>
      <aside class="rp-why">
        <h3>${c.title}</h3>
        <ul>${c.points.map((x) => `<li>${x}</li>`).join('')}</ul>
        <p class="lesson">${c.lesson}</p>
        <p class="srcs">Sources: ${c.sources.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join('; ')}. Full notes in docs/RESEARCH.md.</p>
      </aside>
    </div>
  </div>`;
  el.hidden = false;
  el.querySelectorAll('button[data-i]').forEach((b) => b.onclick = () => applyReplan(kind, opts[+b.dataset.i]));
  (el.querySelector('.rp-opt.rec button') || el.querySelector('button'))?.focus();
}

function closeReplan() { const el = $('replan'); if (el) { el.hidden = true; el.innerHTML = ''; } }

function applyReplan(kind, o) {
  closeReplan();
  if (o.key !== 'continue') {
    S.routes.replan = o.route; S.replanInfo = { kind, at: S.tS, name: o.name }; S.sel = 'replan';
    buildRouteMeshes(); renderTable(); drawTrack();
  }
  update(0);
  S.playing = true; $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Pause');
}

// ---------- simulation update ----------
function latLon(x, y) {
  const c = S.t.source.center; if (!c) return null;
  const lat = c.lat + (-(y - H() / 2) / MARS_R) * (180 / Math.PI);
  const lon = c.lon + ((x - W() / 2) / (MARS_R * Math.cos((c.lat * Math.PI) / 180))) * (180 / Math.PI);
  return `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;
}

let lastState = null, lastHud = '';
function update(dtReal) {
  const r = S.routes[S.sel];
  if (!r) return;
  const p = sampleAt(r, S.tS);
  const behind = sampleAt(r, Math.min(r.durationS, S.tS + 12)); // partner ~10 m ahead (visible in first person)
  const z = p.z;
  const T = env.temperature(S.tS), P = env.pressure(S.tS, z), Wd = env.wind(S.tS), tau = env.dustTau(S.tS);
  const beam = env.beamTransmission(S.tS), dr = env.doseRate(S.tS), cum = env.cumulativeDose(S.tS);
  const state = classifyState({ grade: p.grade, phase: p.phase, tau: tau.v, doseRate: dr.v, radWarn: CONFIG.radWarnUGyPerDay.value });
  lastState = state;
  const walking = p.phase !== 'stop' && S.tS < r.durationS;

  [[crew[0], p], [crew[1], behind]].forEach(([fig, q], k) => {
    const w = toWorld(q.x + (k && !S.fp ? 6 : 0), q.y, q.z);
    fig.position.copy(w);
    if (q.heading !== undefined && q.phase !== 'stop') fig.rotation.y = -q.heading + Math.PI / 2;
    animate(fig, k ? classifyState({ grade: q.grade, phase: q.phase, tau: tau.v, doseRate: dr.v, radWarn: Infinity }) : state, dtReal, walking, performance.now() / 1000);
  });
  const K = updateFront(S.tS, p.x);
  updateDust(dust, crew[0].position, tau.v, Wd.v, dtReal);
  crew[0].visible = !S.fp;
  dust.material.size = S.fp ? 0.35 : 4;
  // sky/fog: thicker with dust optical depth (visual cue; visibility itself is not modeled)
  const dustK = Math.min(1, Math.max(0, (tau.v - 0.5) / 2));
  scene.background.copy(SKY).lerp(DUSTSKY, dustK); scene.fog.color.copy(scene.background);
  if (S.fp) {
    scene.fog.near = 30; scene.fog.far = Math.max(250, 9000 / Math.max(0.3, tau.v));
    const ahead = sampleAt(r, Math.min(r.durationS, S.tS + 40));
    if (Math.hypot(ahead.x - p.x, ahead.y - p.y) > 2) {
      const target = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      let d = target - S.fpYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      S.fpYaw += d * Math.min(1, dtReal * 2 + (dtReal === 0 ? 1 : 0));
    }
    const eye = toWorld(p.x, p.y, p.z).add(new THREE.Vector3(0, 2.2 + (p.phase === 'stop' ? 0 : 0.05 * Math.sin(performance.now() / 160)), 0));
    const yaw = S.fpYaw + S.fpYawOff;
    const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(S.fpPitch), Math.sin(S.fpPitch), Math.sin(yaw) * Math.cos(S.fpPitch));
    camera.position.copy(eye); camera.lookAt(eye.clone().add(dir));
  } else {
    scene.fog.near = W() * 0.9; scene.fog.far = W() * 3.5;
  }
  if (!S.fp && $('follow').checked) {
    const target = crew[0].position.clone().add(new THREE.Vector3(0, 20, 0));
    const delta = target.clone().sub(controls.target);
    controls.target.add(delta.multiplyScalar(Math.min(1, dtReal * 3 + (dtReal === 0 ? 1 : 0))));
    camera.position.add(delta);
  }

  // HUD
  const hud = [];
  if (state.flags.includes('radiation')) hud.push(`<div class="hudmsg rad">☢ Radiation ${Math.round(dr.v)} µGy/day, above the ${CONFIG.radWarnUGyPerDay.value} warning level. Head back to the habitat.</div>`);
  if (state.flags.includes('dust')) hud.push(`<div class="hudmsg dust">Dust storm, τ ${tau.v.toFixed(1)}. Visibility down; protect seals, optics and solar panels.</div>`);
  if (S.tS > CONFIG.evaLimitH.value * 3600) hud.push('<div class="hudmsg margin">Past the EVA time budget</div>');
  if (K && !K.passed) hud.push(`<div class="hudmsg dust">Dust front about ${Math.round((p.x - K.frontXEst) / 1000)} km west, moving east at ${K.speed.toFixed(0)} m/s. Reaches you in about ${fmtMin(K.etaS)}.</div>`);
  if (S.sel === 'replan' && S.replanInfo) hud.push(`<div class="hudmsg fp">Re-planned at T+${fmtHM(S.replanInfo.at)}: ${S.replanInfo.name.toLowerCase()}</div>`);
  const hudHTML = hud.join(''); if (hudHTML !== lastHud) { $('hud').innerHTML = hudHTML; lastHud = hudHTML; }
  if (S.fp) updateVisor(r, p, { T, P, Wd, tau, dr, cum, K });

  // conditions tiles
  const tile = (k, v, unit, x, extra = '', cls = '') => `<div class="tile ${cls}" title="${x.src}"><div class="k"><span>${k}</span>${chip(x.label)}</div><div class="v">${v}<small>${unit}</small></div><div class="src">${[x.short, extra].filter(Boolean).join('. ')}</div></div>`;
  const ll = latLon(p.x, p.y);
  const terr = { label: S.t.source.kind === 'real' ? LABEL.OBS : LABEL.ASSUMP, src: S.t.source.kind === 'real' ? 'CTX stereo DEM' : 'synthetic terrain', short: S.t.source.kind === 'real' ? 'CTX stereo elevation model' : 'Synthetic terrain' };
  $('envPanel').innerHTML = `<div class="tiles">
    ${tile('Air temperature', T.v.toFixed(0), ' °C', T)}
    ${tile('Pressure', P.v.toFixed(0), ' Pa', P)}
    ${tile('Wind', Wd.v.toFixed(1), ' m/s', Wd, `Pushes with ${Wd.dynamicPressurePa.toFixed(2)} Pa: too little to move a person, enough to move dust`, 'wide')}
    ${tile('Dust optical depth', tau.v.toFixed(2), '', tau)}
    ${tile('Direct sunlight', (beam.v * 100).toFixed(0), ' %', beam)}
    ${tile('Dose rate', Math.round(dr.v), ' µGy/day', dr, '', dr.v > CONFIG.radWarnUGyPerDay.value ? 'alert' : '')}
    ${tile('Dose this EVA', cum.v.toFixed(1), ' µGy', cum)}
    ${tile('Ground', `${z.toFixed(0)}`, ` m, ${p.slope.toFixed(0)}° slope`, terr, ll || `${(p.x / 1000).toFixed(2)} km E, ${(p.y / 1000).toFixed(2)} km S`, 'wide')}
  </div>`;

  // arrival preview when stopped at a site
  showPreview(p.phase === 'stop' ? p.stopTag : null);

  const ltst = env.ltstH(S.tS);
  $('clock').innerHTML = `<div class="big">T+${fmtHM(S.tS)}</div><div class="small">${String(Math.floor(ltst)).padStart(2, '0')}:${String(Math.floor((ltst % 1) * 60)).padStart(2, '0')} local solar time<br>of ${fmtHM(r.durationS)} planned</div>`;
  profile.draw(S.tS, state, p, dtReal, walking);
  // sun follows local solar time (simple model): low and warm in the morning, high at noon
  const sunEl = Math.max(0.05, Math.sin((Math.PI * (ltst - 6)) / 12)) * 1.2, sunAz = (ltst - 12) / 12 * Math.PI;
  sun.position.set(Math.sin(sunAz) * 5000 * Math.cos(sunEl), Math.sin(sunEl) * 5000, -Math.cos(sunAz) * 2500);
  sun.intensity = 0.6 + 1.8 * beam.v + 0.4; hemi.intensity = 0.55 + 0.5 * (1 - beam.v);
}

// ---------- helmet visor (first person) ----------
function nextStop(r, p) {
  const sm = r.samples;
  for (let j = Math.max(1, p.k); j < sm.length; j++) {
    const s = sm[j];
    if (s.phase !== 'stop' || s.t <= S.tS) continue;
    const arriveT = sm[j - 1].t, here = S.tS >= arriveT;
    let dist = 0;
    if (!here) { let a = p; for (let i = p.k + 1; i < j; i++) { dist += Math.hypot(sm[i].x - a.x, sm[i].y - a.y); a = sm[i]; } }
    const site = S.sites.sites.find((x) => x.id === s.stopTag);
    const name = s.stopTag === 'rover' ? 'ROVER' : site ? site.id : 'DEST';
    return { s, name, text: here ? `sampling, ${fmtMin(s.t - S.tS)} left` : `${(dist / 1000).toFixed(2)} km · ${fmtMin(arriveT - S.tS)}` };
  }
  return null;
}

function updateVisor(r, p, e) {
  const pv = (lbl) => chip(lbl);
  const eye = (x, y, z, up = 2) => toWorld(x, y, z).add(new THREE.Vector3(0, up, 0));
  const ns = nextStop(r, p);
  const h = idxXY(S.habitatIdx), hz = S.t.z[S.habitatIdx];
  const homeM = Math.hypot(h.x - p.x, h.y - p.y);
  const evaLeft = CONFIG.evaLimitH.value * 3600 - S.tS, planLeft = r.durationS - S.tS;
  const mate = crew[1].position, myW = toWorld(p.x, p.y, p.z), mateM = Math.hypot(mate.x - myW.x, mate.z - myW.z);
  const g = p.grade * 100, word = p.phase === 'stop' ? 'Stopped' : g > 3 ? 'Uphill' : g < -3 ? 'Downhill' : 'Level';
  const left = [
    { k: 'EVA left', v: evaLeft >= 0 ? fmtHM(evaLeft) : '−' + fmtHM(-evaLeft), u: '', pv: pv(LABEL.ASSUMP), warn: evaLeft < planLeft || evaLeft < 1800 },
    { k: 'Dose rate', v: Math.round(e.dr.v), u: ' µGy/d', pv: pv(e.dr.label), warn: e.dr.v > CONFIG.radWarnUGyPerDay.value },
    { k: 'EVA dose', v: e.cum.v.toFixed(1), u: ' µGy', pv: pv(e.cum.label) },
    { k: 'Dust τ', v: e.tau.v.toFixed(2), u: '', pv: pv(e.tau.label), warn: e.tau.v > 1.5 },
  ];
  const right = [
    { k: 'Air', v: e.T.v.toFixed(0), u: ' °C', pv: pv(e.T.label) },
    { k: 'Pressure', v: e.P.v.toFixed(0), u: ' Pa', pv: pv(e.P.label) },
    { k: 'Wind', v: e.Wd.v.toFixed(1), u: ' m/s', pv: pv(e.Wd.label) },
  ];
  if (e.K && !e.K.passed) right.unshift({ k: 'Dust front', v: fmtMin(e.K.etaS), u: '', pv: pv(LABEL.SCENARIO), warn: true });
  const rect = viewport.getBoundingClientRect();
  visor.update({
    hdg: yawToHeading(S.fpYaw + S.fpYawOff), camera, w: rect.width, h: rect.height, exag: S.exag,
    left, right,
    next: ns && { name: ns.name, brg: bearing(ns.s.x - p.x, ns.s.y - p.y), world: eye(ns.s.x, ns.s.y, ns.s.z, 3), text: ns.text },
    home: homeM > 25 ? { brg: bearing(h.x - p.x, h.y - p.y), world: eye(h.x, h.y, hz, 6), text: `${(homeM / 1000).toFixed(2)} km` } : null,
    mate: mateM > 1 ? { brg: bearing(mate.x - myW.x, mate.z - myW.z), world: mate.clone().add(new THREE.Vector3(0, 2.6, 0)), text: `${Math.round(mateM)} m` } : null,
    grade: { pct: g, slope: p.slope, word },
  });
}

let previewKey = null;
function showPreview(tag) {
  if (tag === 'rover') tag = null;
  if (tag === previewKey) return;
  if (!tag && previewKey && /^(place|site|habitat)/.test(previewKey)) return; // keep a card the user opened
  previewKey = tag;
  const el = $('preview');
  if (!tag) { el.classList.add('hidden'); return; }
  const k = S.sites.sites.findIndex((s) => s.id === tag);
  const site = S.sites.sites[k];
  const img = site?.image ? { file: site.image, caption: site.imageCaption || '' } : S.images[k >= 0 ? k % Math.max(1, S.images.length) : 0];
  const name = site ? `${site.id} ${site.name}` : 'Destination';
  const desc = site?.place ? `<div class="cap">${badgeImgHTML(site.resource, 18)} ${site.place.desc}</div>` : '';
  if (!img) {
    el.innerHTML = `<b>Arrival preview — ${name}</b>${desc}<div class="cap">No surface image downloaded yet. Run <code>scripts\\download_data.ps1</code> (raw images step).</div>`;
  } else {
    el.innerHTML = `<b>Arrival preview — ${name}</b>${desc}<img src="data/images/${img.file}" alt="Perseverance raw image">
      <div class="cap">${chip(LABEL.OBS)} ${img.caption || ''}<br>Representative Perseverance image; the camera location may differ from this site. Credit: NASA/JPL-Caltech.</div>`;
  }
  el.classList.remove('hidden');
}

// ---------- UI wiring ----------
function renderSites() {
  $('siteList').innerHTML = [
    `<div class="site">${badgeImgHTML('habitat', 20)}<span class="pn" id="habItem" role="button" tabindex="0">${S.sites.habitat.name}</span></div>`,
    ...S.sites.sites.map((s, k) => `<div class="site">${badgeImgHTML(s.resource || 'sediment', 20)}<span class="pn" data-s="${k}" role="button" tabindex="0">${s.id} ${s.name} ${chip(s.label || LABEL.ASSUMP)}</span><button data-k="${k}" aria-label="Set ${s.name} as destination">Go here</button></div>`),
  ].join('');
  $('siteList').querySelectorAll('button').forEach((b) => b.onclick = () => { S.destIdx = S.siteIdx[+b.dataset.k]; recompute(); });
  $('siteList').querySelectorAll('.pn[data-s]').forEach((el) => el.onclick = () => showSiteCard(+el.dataset.s));
  $('habItem').onclick = showHabitatCard;
  $('siteList').querySelectorAll('[role=button]').forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }));
}

function selectTab(name) {
  document.querySelectorAll('[role=tab]').forEach((t) => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('[role=tabpanel]').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
}

function wire() {
  document.querySelectorAll('[role=tab]').forEach((t, i, all) => {
    t.onclick = () => selectTab(t.dataset.tab);
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      const n = all[(i + d + all.length) % all.length]; selectTab(n.dataset.tab); n.focus();
    });
  });
  $('maxSlope').value = CONFIG.maxSlopeDeg.value;
  $('evaLimit').value = CONFIG.evaLimitH.value;
  $('exag').value = S.exag;
  $('maxSlope').onchange = (e) => { CONFIG.maxSlopeDeg.value = +e.target.value; colorTerrain(); recompute(); };
  $('evaLimit').onchange = (e) => { CONFIG.evaLimitH.value = +e.target.value; recompute(); };
  $('slopeOverlay').onchange = colorTerrain;
  $('exag').oninput = (e) => { S.exag = +e.target.value; buildTerrainMesh(); buildRouteMeshes(); buildMarkers(); buildPlaces(); drawTrack(); update(0); };
  const sc = () => {
    env.scenarios.dust = { on: $('scDust').checked, startS: +$('scDustT').value * 3600 };
    env.scenarios.sep = { on: $('scSep').checked, startS: +$('scSepT').value * 3600 };
    S.handled = { dust: false, sep: false }; setupFront();
    renderTable(); drawTrack(); update(0);
  };
  ['scDust', 'scDustT', 'scSep', 'scSepT', 'scNet'].forEach((id) => $(id).onchange = sc);
  const setFP = (on) => {
    if (on && S.view === 'globe') return;
    S.fp = on; $('fpBtn').classList.toggle('on', on); controls.enabled = !on;
    visor.show(on); document.body.classList.toggle('fp-mode', on); $('fpBtn').setAttribute('aria-pressed', on);
    routeGroup.visible = !on; crew.forEach((c) => c.scale.setScalar(on ? 1 : SCALE)); placeHabitat(); placeRover();
    camera.near = on ? 0.3 : 5; camera.fov = on ? 70 : 50; camera.updateProjectionMatrix();
    S.fpYawOff = 0; S.fpPitch = -0.08;
    if (!on) { const c = crew[0].position; controls.target.copy(c); camera.position.copy(c).add(new THREE.Vector3(-260, 240, 420)); }
    update(0);
  };
  $('fpBtn').onclick = () => setFP(!S.fp);
  addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') { if (e.target.tagName !== 'INPUT') setFP(!S.fp); } if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); $('play').click(); } });
  $('showTrav').onchange = () => { travGroup.visible = $('showTrav').checked; };
  $('detailsBtn').onclick = () => { const t = $('routeTable'); t.classList.toggle('hidden'); $('routeNote').classList.toggle('hidden', t.classList.contains('hidden')); $('detailsBtn').textContent = t.classList.contains('hidden') ? 'Show detailed comparison' : 'Hide detailed comparison'; };
  $('play').onclick = () => { S.playing = !S.playing; $('play').textContent = S.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-label', S.playing ? 'Pause' : 'Play'); if (S.playing) selectTab('live'); };


  // click-to-set destination (ignore drags)
  let down = null, last = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; last = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!S.fp || !last || !(e.buttons & 1)) return;
    S.fpYawOff += (e.clientX - last[0]) * 0.004;
    S.fpPitch = Math.max(-1.2, Math.min(0.8, S.fpPitch - (e.clientY - last[1]) * 0.004));
    last = [e.clientX, e.clientY]; update(0);
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    last = null;
    if (S.view === 'globe') return;
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const sp = ray.intersectObjects([...resGroup.children, ...markerGroup.children.filter((o) => o.userData.site !== undefined || o.userData.habitat)])[0];
    if (sp) {
      const u = sp.object.userData;
      if (u.place !== undefined) showPlaceCard(u.place); else if (u.habitat) showHabitatCard(); else showSiteCard(u.site);
      return;
    }
    if (S.fp) return;
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
    const before = S.tS;
    S.tS = Math.min(r.durationS, S.tS + dt * +$('speed').value);
    for (const kind of ['dust', 'sep']) {
      const sc = env.scenarios[kind];
      const at = Math.max(1, kind === 'dust' ? (front ? front.detections()[0].t : Infinity) : sc.startS);
      if (sc.on && !S.handled[kind] && before < at && S.tS >= at && S.sel !== 'replan') { S.tS = at; openReplan(kind); break; }
    }
    if (S.tS >= r.durationS) { S.playing = false; $('play').textContent = '▶'; }
  }
  if (S.view === 'globe') {
    const fade = globe.render(dt);
    if (fade > 0) $('fade').style.opacity = fade;
    requestAnimationFrame(loop);
    return;
  }
  if (r) update(dt);
  tickHabitat(habitat, now / 1000);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

async function main() {
  resize();
  const [{ terrain, sites }] = await Promise.all([loadTerrain(), env.load()]);
  try { const m = await (await fetch('data/images/manifest.json')).json(); S.images = m.items || []; } catch { S.images = []; }
  S.t = terrain; S.sites = sites;
  if (terrain.source.center) {
    try {
      const pl = await (await fetch('data/places.json')).json();
      if (pl && pl.places) S.places = pl;
    } catch { S.places = null; }
  }
  S.zmin = terrain.z.reduce((a, b) => Math.min(a, b), Infinity);
  const idx = ({ u, v }) => { const { c, r } = uvToCell(terrain, u, v); return snapTraversable(terrain, r * terrain.w + c); };
  S.habitatIdx = idx(sites.habitat);
  if (S.places) {
    S.places.places.forEach((p) => { p._xy = latLonToXY(p.lat, p.lon); });
    const sci = S.places.places.filter((p) => p.science && p._xy.inside);
    if (sci.length) {
      sites.sites = sci.map((p, k) => ({ id: 'P' + (k + 1), name: p.name, u: p._xy.x / W(), v: p._xy.y / H(), label: LABEL.OBS, resource: p.resource, image: null, place: p }));
    }
  }
  S.siteIdx = sites.sites.map(idx);
  S.destIdx = S.siteIdx[1] ?? S.siteIdx[0];
  env.refElevation = terrain.z[S.habitatIdx];

  const badge = $('dataBadge');
  if (terrain.source.kind === 'real') { badge.className = 'badge real'; badge.textContent = /ctx/i.test(terrain.source.dem) ? 'Real terrain: USGS CTX elevation model' : /hirise/i.test(terrain.source.dem) ? 'Real terrain: HiRISE elevation model' : 'Real terrain'; }
  else { badge.className = 'badge synth'; badge.textContent = 'Synthetic terrain. Run the data scripts for real Jezero ground.'; }
  badge.title = `DEM: ${terrain.source.dem}\nOptical: ${terrain.source.ortho || 'none'}\nMEDA: ${env.meda ? 'sol ' + env.meda.sol : 'not loaded (built-in model)'}\nRAD: ${env.rad.sep ? 'baseline + SEP profile' : 'baseline only'}`;

  buildTerrainMesh();
  const h0 = idxWorld(S.habitatIdx);
  controls.target.copy(h0);
  camera.position.copy(h0).add(new THREE.Vector3(-260, 240, 420));
  renderSites(); renderResourceList(); wire(); buildPlaces(); recompute();
  globe = new GlobeView(renderer, renderer.domElement, { site: siteInfo(), gale: GALE, onSelect: (w) => showGlobeCard(w) });
  globe.onSource = () => { if (S.view === 'globe') showGlobeCard('site'); };
  resize();
  $('globeBtn').onclick = () => setView(S.view === 'globe' ? 'local' : 'globe');
  setView('globe');
  requestAnimationFrame(loop);
}
main();

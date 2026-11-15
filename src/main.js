import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, LABEL, ROUTE_STYLE } from './config.js';
import { loadTerrain, uvToCell } from './terrain.js';
import { generateRoutes, sampleAt, snapTraversable, overlap, speedKmh } from './routing.js';
import { Environment, MARS_HOUR_S } from './environment.js';
import { makeAstronaut, animate, classifyState, GAIT_TEXT, makeDust, updateDust, SCALE } from './astronaut.js';
import { RESOURCE_TYPES, badgeSprite, badgeImgHTML } from './resources.js';
import { ICON_ATTRIBUTION } from './icons.js';
import { makeHabitat, tickHabitat, HAB_SCALE } from './habitat.js';
import { ProfileStrip, GAIT_LABEL } from './profile.js';

const $ = (id) => document.getElementById(id);
const CHIP = { [LABEL.OBS]: 'o', [LABEL.REPLAY]: 'r', [LABEL.MODEL]: 'm', [LABEL.ASSUMP]: 'a', [LABEL.SCENARIO]: 's' };
const PVWORD = { o: 'measured', r: 'replay', m: 'model', a: 'assumed', s: 'scenario' };
const chip = (label) => [...new Set(label.split(' + '))].map((l) => { const c = CHIP[l] || 'm'; return `<i class="pv ${c}" title="${l}">${PVWORD[c]}</i>`; }).join(' ');
const fmtHM = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const MARS_R = 3396190;

const S = {
  t: null, sites: null, habitatIdx: 0, destIdx: 0, siteIdx: [], routes: {}, sel: 'gentlest',
  tS: 0, playing: false, exag: CONFIG.verticalExaggeration, zmin: 0, images: [],
  places: null, fp: false, fpYaw: 0, fpYawOff: 0, fpPitch: -0.08, hiddenKinds: new Set(),
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
  S.tS = 0;
  buildRouteMeshes(); buildMarkers(); renderTable(); drawTrack(); update(0);
}

function routeDose(r) {
  return env.cumulativeDose(r.durationS).v;
}

function routeBlurb(k) {
  const R = S.routes, r = R[k], sh = R.shortest, budget = CONFIG.evaLimitH.value * 3600;
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
  $('routeCards').innerHTML = Object.keys(ROUTE_STYLE).map((k) => `<div class="rcard ${k === S.sel ? 'sel' : ''}" data-k="${k}" style="--c:#${ROUTE_STYLE[k].color.toString(16).padStart(6, '0')}">
    <div class="rname">${ROUTE_STYLE[k].name}</div>${routeBlurb(k)}</div>`).join('');
  $('routeCards').querySelectorAll('.rcard').forEach((c) => c.onclick = () => { if (!S.routes[c.dataset.k]) return; S.sel = c.dataset.k; buildRouteMeshes(); renderTable(); drawTrack(); update(0); });
}

function renderTable() {
  renderCards();
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

const profile = new ProfileStrip($('profile'), (t) => { S.tS = t; update(0); });
function drawTrack() {
  profile.setRoute(S.routes[S.sel], { dust: env.scenarios.dust, sep: env.scenarios.sep, budgetS: CONFIG.evaLimitH.value * 3600 });
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
  if (S.fp) hud.push('<div class="hudmsg fp">First person. Drag to look around, press F to leave. Relief ×' + S.exag + '.</div>');
  const hudHTML = hud.join(''); if (hudHTML !== lastHud) { $('hud').innerHTML = hudHTML; lastHud = hudHTML; }

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

let previewKey = null;
function showPreview(tag) {
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
    renderTable(); drawTrack(); update(0);
  };
  ['scDust', 'scDustT', 'scSep', 'scSepT'].forEach((id) => $(id).onchange = sc);
  const setFP = (on) => {
    S.fp = on; $('fpBtn').classList.toggle('on', on); controls.enabled = !on;
    routeGroup.visible = !on; crew.forEach((c) => c.scale.setScalar(on ? 1 : SCALE)); placeHabitat();
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
    S.tS = Math.min(r.durationS, S.tS + dt * +$('speed').value);
    if (S.tS >= r.durationS) { S.playing = false; $('play').textContent = '▶'; }
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
  requestAnimationFrame(loop);
}
main();

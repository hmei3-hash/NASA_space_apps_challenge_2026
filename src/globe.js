// Whole-Mars globe view: Viking colour mosaic (NASA Mars Trek), Jezero and Gale markers,
// study-area box, and a fly-in transition to the local EVA map.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm';
const R_KM = 3389.5;

/** lat/lon (deg, east-positive) -> point on a unit sphere, matching THREE.SphereGeometry's UV layout. */
export function latLonToVec3(lat, lon, r = 1) {
  const phi = ((lon + 180) * Math.PI) / 180, theta = ((90 - lat) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

function greatCircleKm(a, b) {
  const t = Math.PI / 180, dLat = (b.lat - a.lat) * t, dLon = (b.lon - a.lon) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/** Try, in order: pre-built texture file, live Trek tiles (z=2, 8x4), procedural fallback. */
async function loadMarsTexture(onSource) {
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  try {
    const img = await loadImg('data/mars_globe.jpg');
    onSource('Viking colour mosaic (NASA Mars Trek), local copy');
    return new THREE.Texture(img);
  } catch { /* fall through */ }
  try {
    const z = 2, nx = 8, ny = 4, T = 256;
    const c = document.createElement('canvas'); c.width = nx * T; c.height = ny * T;
    const g = c.getContext('2d');
    const jobs = [];
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) jobs.push(loadImg(`${TREK}/${z}/${y}/${x}.jpg`).then((im) => g.drawImage(im, x * T, y * T, T, T)));
    await Promise.all(jobs);
    g.getImageData(0, 0, 1, 1); // throws if the canvas is CORS-tainted
    onSource('Viking colour mosaic, streamed from NASA Mars Trek');
    return new THREE.CanvasTexture(c);
  } catch { /* fall through */ }
  // procedural stand-in, clearly labelled in the UI
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#b5683f'; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 1024, y = 40 + Math.random() * 432, r = 4 + Math.random() * 40;
    g.fillStyle = `rgba(${60 + Math.random() * 60},${30 + Math.random() * 30},${20 + Math.random() * 20},${0.08 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(245,240,235,0.85)'; g.fillRect(0, 0, 1024, 18); g.fillRect(0, 498, 1024, 14);
  onSource('Procedural stand-in (run scripts/build_globe_texture.py for the real mosaic)');
  return new THREE.CanvasTexture(c);
}

function textSprite(text) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), F = "600 44px 'Barlow Condensed', 'Barlow', sans-serif";
  g.font = F; c.width = Math.ceil(g.measureText(text).width) + 28; c.height = 60;
  g.font = F; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = 'rgba(5,6,10,0.85)'; g.strokeText(text, 14, 31); g.fillStyle = '#f1e7d8'; g.fillText(text, 14, 31);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set((c.width / c.height) * 0.07, 0.07, 1); sp.renderOrder = 5;
  return sp;
}

export class GlobeView {
  constructor(renderer, dom, { site, gale, onSelect, extraBases = [] }) {
    this.renderer = renderer; this.dom = dom; this.site = site; this.onSelect = onSelect;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, dom);
    Object.assign(this.controls, { enableDamping: true, enablePan: false, minDistance: 1.25, maxDistance: 6, rotateSpeed: 0.5, autoRotate: true, autoRotateSpeed: 0.35 });
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });
    this.source = '';

    // stars
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20); pos.set([v.x, v.y, v.z], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true, transparent: true, opacity: 0.8 })));

    // lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    // key light rides with the camera (upper left), so the visible hemisphere is always lit with a soft terminator
    const sun = new THREE.DirectionalLight(0xfff4e6, 2.6); sun.position.set(-3, 2, 1.5); this.camera.add(sun); this.scene.add(this.camera);

    // planet
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }));
    this.scene.add(this.planet);
    loadMarsTexture((s) => { this.source = s; this.onSource?.(s); }).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.needsUpdate = true;
      this.planet.material.map = tex; this.planet.material.needsUpdate = true;
    });
    // thin dusty atmosphere (fresnel rim)
    const atm = new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color(0xe3a873) } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(normalize(-vP), vN)), 2.5); gl_FragColor = vec4(c, f*0.9); }',
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 32), atm));

    // markers
    this.markers = new THREE.Group(); this.scene.add(this.markers);
    this.siteMarker = this._pin(site.lat, site.lon, 0xe3b26b, 0.022);
    this.galeMarker = this._pin(gale.lat, gale.lon, 0x7fb2d9, 0.014);
    // study-area box
    const half = (site.sizeKm || 12) / 2 / 59.27, hl = half / Math.cos((site.lat * Math.PI) / 180);
    const box = [[-half, -hl], [-half, hl], [half, hl], [half, -hl], [-half, -hl]].map(([a, b]) => latLonToVec3(site.lat + a, site.lon + b, 1.002));
    this.markers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(box), new THREE.LineBasicMaterial({ color: 0xe3b26b })));
    // great-circle arc Gale -> Jezero (where the radiation data comes from)
    const A = latLonToVec3(gale.lat, gale.lon), B = latLonToVec3(site.lat, site.lon), arc = [];
    for (let i = 0; i <= 64; i++) { const t = i / 64; const v = A.clone().lerp(B, t).normalize(); arc.push(v.multiplyScalar(1 + 0.12 * Math.sin(Math.PI * t))); }
    const arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc), new THREE.LineDashedMaterial({ color: 0x7fb2d9, dashSize: 0.02, gapSize: 0.015 }));
    arcLine.computeLineDistances(); this.markers.add(arcLine);
    this.galeKm = greatCircleKm(gale, site);

    // other bases (assumed outposts at real landing sites) and name labels
    this.basePins = { jezero: this.siteMarker, gale: this.galeMarker };
    for (const b of extraBases) this.basePins[b.id] = this._pin(b.lat, b.lon, 0x7fb2d9, 0.014);
    this.baseLabels = {};
    for (const b of [{ id: 'jezero', name: 'Jezero', ...site }, { id: 'gale', name: 'Gale', ...gale }, ...extraBases]) {
      const l = textSprite(b.name); l.position.copy(latLonToVec3(b.lat + (b.id === 'elysium' ? 3.5 : b.id === 'gale' ? -3.5 : 0), b.lon, 1.06)); this.markers.add(l); this.baseLabels[b.id] = l;
    }

    // dust storm footprint: a shell just above the surface, drawn by a shader
    this.stormU = { c: { value: new THREE.Vector3(1, 0, 0) }, rad: { value: 0 }, nlim: { value: 1 }, t: { value: 0 }, k: { value: 0 } };
    this.storm = new THREE.Mesh(new THREE.SphereGeometry(1.012, 160, 80), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.stormU,
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = normalize(position); vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: `
        uniform vec3 c; uniform float rad; uniform float nlim; uniform float t; uniform float k;
        varying vec3 vP; varying vec3 vN; varying vec3 vV;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
        float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*n3(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
        void main(){
          if (rad <= 0.0 || k <= 0.0) discard;
          float d = acos(clamp(dot(vP, c), -1.0, 1.0));
          // swirl the sampling point around the storm centre so the cloud visibly turns and billows
          float ang = 0.9 * (1.0 - d/max(rad, 0.001)) + t*0.05;
          vec3 ax = c; vec3 q = vP*cos(ang) + cross(ax, vP)*sin(ang) + ax*dot(ax, vP)*(1.0-cos(ang));
          float w = fbm(q*7.0 + vec3(t*0.03, 0.0, -t*0.02));
          float fine = fbm(q*24.0 - vec3(0.0, t*0.06, 0.0));
          float edge = rad * (0.86 + 0.28*w);
          float a = 1.0 - smoothstep(edge*0.78, edge, d);
          a *= 1.0 - smoothstep(nlim - 0.03, nlim + 0.02, vP.y);       // northern limit (vP.y = sin lat)
          float core = 1.0 - smoothstep(0.0, edge, d);
          float dens = clamp(a * (0.50 + 0.38*w + 0.22*fine + 0.25*core), 0.0, 0.93) * k;
          float front = smoothstep(edge*0.70, edge*0.95, d) * a;        // brighter, lifted leading edge
          vec3 col = mix(vec3(0.72, 0.53, 0.34), vec3(0.90, 0.74, 0.52), fine);
          col = mix(col, vec3(0.97, 0.86, 0.66), front*0.55);
          float lit = 0.55 + 0.45*max(dot(vN, normalize(vec3(-0.6, 0.4, 0.7))), 0.0);
          gl_FragColor = vec4(col*lit, dens);
        }`,
    }));
    this.scene.add(this.storm);

    this._home();
    // click a marker
    this.ray = new THREE.Raycaster(); this.ray.params.Points = { threshold: 0.02 };
    let down = null;
    dom.addEventListener('pointerdown', (e) => { if (this.active) down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', (e) => {
      if (!this.active || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = dom.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = this.ray.intersectObjects(Object.values(this.basePins), true)[0];
      if (!hit) return;
      const id = Object.keys(this.basePins).find((k) => this.basePins[k] === hit.object.parent || this.basePins[k] === hit.object);
      this.onSelect?.(id === 'jezero' ? 'site' : id);
    });
  }

  _pin(lat, lon, color, size) {
    const g = new THREE.Group();
    const p = latLonToVec3(lat, lon);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), new THREE.MeshBasicMaterial({ color }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(size * 1.6, size * 2.1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    g.add(dot, ring); g.position.copy(p.multiplyScalar(1.004)); g.lookAt(0, 0, 0);
    g.userData.ring = ring;
    this.markers.add(g);
    return g;
  }

  _home() {
    const h = this.home || { lat: this.site.lat - 8, lon: this.site.lon - 25 };
    const v = latLonToVec3(h.lat, h.lon).multiplyScalar(3.4);
    this.camera.position.copy(v); this.controls.target.set(0, 0, 0); this.controls.update();
  }

  /** Draw the storm footprint. centre {lat,lon}, radiusKm, northLimit (deg), strength 0..1. */
  setStorm(centre, radiusKm, northLimit = 90, strength = 1) {
    if (!centre || radiusKm <= 0) { this.stormU.rad.value = 0; return; }
    this.stormU.c.value.copy(latLonToVec3(centre.lat, centre.lon));
    this.stormU.rad.value = Math.min(Math.PI, radiusKm / R_KM);
    this.stormU.nlim.value = Math.sin((northLimit * Math.PI) / 180);
    this.stormU.k.value = strength;
  }
  /** Possible storm origins the bases have inferred (small dots on the surface). */
  setCandidates(list) {
    if (!this.cand) {
      this.cand = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x9fd3ff, size: 0.018, transparent: true, opacity: 0.9, depthWrite: false }));
      this.cand.renderOrder = 4; this.scene.add(this.cand);
    }
    const pos = new Float32Array((list?.length || 0) * 3);
    (list || []).forEach((c, i) => { const v = latLonToVec3(c.lat, c.lon, 1.02); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
    this.cand.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.cand.geometry.computeBoundingSphere();
    this.cand.visible = !!(list && list.length);
  }
  setBaseStatus(id, status) {
    const pin = this.basePins[id]; if (!pin || pin.userData.status === status) return;
    pin.userData.status = status;
    const col = status === 'storm' ? 0xff5a4e : status === 'watch' ? 0xffb35c : id === 'jezero' ? 0xe3b26b : 0x7fb2d9;
    pin.children.forEach((m) => m.material.color.setHex(col));
  }
  /** Where the globe view starts; also moves there now if the globe is showing. */
  setHome(lat, lon) { this.home = { lat: Math.max(-35, Math.min(35, lat)), lon }; if (this.active && !this._fly) this._home(); }

  resize(w, h) {
    this.camera.aspect = w / h;
    // leave room for the hazard panel on the right: shift the planet left on wide screens
    if (w > 900) this.camera.setViewOffset(w, h, Math.min(220, w * 0.2), 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setActive(on) { this.active = on; this.controls.enabled = on; if (on) { this.controls.autoRotate = true; this._home(); } }

  /** Animate the camera down onto the site, then call done(). */
  flyIn(done, ms = 1800) {
    this.controls.autoRotate = false; this.controls.enabled = false;
    const from = this.camera.position.clone(), to = latLonToVec3(this.site.lat, this.site.lon).multiplyScalar(1.03);
    const t0 = performance.now();
    this._fly = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      // travel along the sphere, then descend
      const dir = from.clone().normalize().lerp(to.clone().normalize(), Math.min(1, e * 1.4)).normalize();
      const r = from.length() + (to.length() - from.length()) * e;
      this.camera.position.copy(dir.multiplyScalar(r)); this.camera.lookAt(latLonToVec3(this.site.lat, this.site.lon));
      if (t >= 1) { this._fly = null; done(); }
      return t;
    };
  }

  render(dt) {
    const now = performance.now();
    this.stormU.t.value = now / 1000;
    let fade = 0;
    if (this._fly) { const t = this._fly(now); fade = Math.max(0, (t - 0.7) / 0.3); } else this.controls.update();
    const s = 1 + 0.35 * Math.sin(now / 300);
    for (const p of Object.values(this.basePins)) { const on = p === this.siteMarker || p.userData.status === 'storm' || p.userData.status === 'watch'; const q = on ? s : 1; p.userData.ring.scale.set(q, q, q); }
    const cd = this.camera.position.clone().normalize();
    for (const l of Object.values(this.baseLabels)) l.visible = l.position.clone().normalize().dot(cd) > 0.25;
    this.renderer.render(this.scene, this.camera);
    return fade;
  }
}

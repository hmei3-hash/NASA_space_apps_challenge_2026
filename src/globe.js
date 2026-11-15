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

export class GlobeView {
  constructor(renderer, dom, { site, gale, onSelect }) {
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

    this._home();
    // click a marker
    this.ray = new THREE.Raycaster(); this.ray.params.Points = { threshold: 0.02 };
    let down = null;
    dom.addEventListener('pointerdown', (e) => { if (this.active) down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', (e) => {
      if (!this.active || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = dom.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = this.ray.intersectObjects([this.siteMarker, this.galeMarker], true)[0];
      if (hit) this.onSelect?.(hit.object.parent === this.galeMarker || hit.object === this.galeMarker ? 'gale' : 'site');
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
    const v = latLonToVec3(this.site.lat - 8, this.site.lon - 25).multiplyScalar(3.3);
    this.camera.position.copy(v); this.controls.target.set(0, 0, 0); this.controls.update();
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

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
    let fade = 0;
    if (this._fly) { const t = this._fly(now); fade = Math.max(0, (t - 0.7) / 0.3); } else this.controls.update();
    const s = 1 + 0.35 * Math.sin(now / 300);
    this.siteMarker.userData.ring.scale.set(s, s, s);
    this.renderer.render(this.scene, this.camera);
    return fade;
  }
}

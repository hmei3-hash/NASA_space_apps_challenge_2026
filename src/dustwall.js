// Advancing dust front on the local map: layered, billowing walls plus a dust deck behind the leading edge.
// Purely visual. Where the front is and when it arrives come from dustfront.js.
import * as THREE from 'three';

const NOISE = `
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*n2(p); p = p*2.02 + vec2(3.1, 7.7); a *= 0.5; } return s; }`;

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';

// vertical wall: u runs along the front, v goes up
const WALL_FRAG = `
  uniform float t; uniform float seed; uniform float dens; uniform float span;
  varying vec2 vUv; ${NOISE}
  void main(){
    float u = vUv.x*span + seed*13.0;
    float top = 0.50 + 0.42*fbm(vec2(u*0.9 + t*0.02, seed + t*0.015));      // ragged, slowly changing crest
    float a = 1.0 - smoothstep(top-0.22, top, vUv.y);
    float body = fbm(vec2(u*3.0 - t*0.03, vUv.y*5.0 - t*0.10 + seed));      // dust rolling upward
    float puff = fbm(vec2(u*9.0 + t*0.05, vUv.y*14.0 - t*0.22));
    a *= 0.55 + 0.45*body + 0.25*puff;
    a *= smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);       // soften the far ends
    vec3 base = vec3(0.30, 0.18, 0.10), mid = vec3(0.55, 0.36, 0.21), crest = vec3(0.88, 0.70, 0.49);
    float hgt = clamp(vUv.y/top, 0.0, 1.0);
    vec3 col = mix(base, mid, smoothstep(0.0, 0.5, hgt) + body*0.3);
    col = mix(col, crest, smoothstep(0.55, 1.0, hgt)*0.8 + puff*0.25);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0)*dens);
  }`;

// horizontal deck behind the front: u runs along the front, v=1 at the leading edge, v=0 far behind
const DECK_FRAG = `
  uniform float t; uniform float dens; uniform float span;
  varying vec2 vUv; ${NOISE}
  void main(){
    float u = vUv.x*span;
    float n = fbm(vec2(u*2.2 + t*0.02, vUv.y*6.0 + t*0.06));
    float lead = 1.0 - smoothstep(0.90 + 0.08*fbm(vec2(u*1.3, t*0.02)), 1.0, vUv.y);
    float a = (0.45 + 0.55*n) * lead * smoothstep(0.0, 0.25, vUv.y);
    a *= smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
    vec3 col = mix(vec3(0.42, 0.27, 0.16), vec3(0.74, 0.55, 0.36), n);
    gl_FragColor = vec4(col, a*dens);
  }`;

const LAYERS = [[0, 1.0, 0.80], [-180, 0.86, 0.62], [-480, 1.05, 0.58], [-950, 1.18, 0.55], [-1700, 1.28, 0.50]]; // [metres behind, height factor, density]
const DECK_M = 9000;

export function makeDustWall() {
  const g = new THREE.Group(); g.visible = false;
  const mats = [];
  const mat = (frag, extra) => { const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: VERT, fragmentShader: frag, uniforms: { t: { value: 0 }, span: { value: 10 }, ...extra } }); mats.push(m); return m; };
  LAYERS.forEach(([dx, hf, dens], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(WALL_FRAG, { seed: { value: i * 1.37 + 0.5 }, dens: { value: dens } }));
    m.rotation.y = Math.PI / 2; m.userData = { dx, hf }; m.renderOrder = 10 + i; g.add(m);
  });
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(DECK_FRAG, { dens: { value: 0.62 } }));
  deck.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); deck.renderOrder = 9; g.add(deck);
  g.userData = { mats, deck };
  return g;
}

/** frontX: world x of the leading edge. length: extent along the front (m). height: wall height (world units). */
export function updateDustWall(g, frontX, length, height, timeS, firstPerson = false) {
  const { mats, deck } = g.userData;
  for (const m of mats) { m.uniforms.t.value = timeS; m.uniforms.span.value = length / 1500; }
  for (const c of g.children) {
    if (c === deck) continue;
    const h = height * c.userData.hf;
    c.scale.set(length, h, 1); c.position.set(frontX + c.userData.dx, h / 2 - 20, 0);
  }
  deck.visible = !firstPerson;                      // from inside, the fog and sky already carry the dust
  deck.scale.set(length, DECK_M, 1); deck.position.set(frontX - DECK_M / 2, height * 0.55, 0);
}

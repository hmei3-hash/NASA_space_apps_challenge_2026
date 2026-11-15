// Astronaut figure + data-driven animation states.
// Animations only reflect data or labeled scenario events (no "wind lean": Martian wind
// exerts negligible force on a person, see Environment.wind().dynamicPressurePa).
import * as THREE from 'three';

export const SCALE = 12; // figure drawn ×12 so it is visible on a 5 km map (stated in the UI)

export function classifyState({ grade, phase, tau, doseRate, radWarn }) {
  const flags = [];
  let gait = 'normal';
  if (phase === 'stop') gait = 'sampling';
  else if (grade > 0.08) gait = 'uphill';
  else if (grade < -0.08) gait = 'downhill';
  if (tau > 1.2) flags.push('dust');
  if (doseRate > radWarn) flags.push('radiation');
  return { gait, flags };
}

export const GAIT_TEXT = {
  normal: 'Normal walking',
  uphill: 'Climbing slowly (uphill grade)',
  downhill: 'Descending cautiously',
  sampling: 'Stopped: sampling / observing',
};

// ---------------------------------------------------------------------------
// Procedural EVA-suit astronaut: jointed hierarchy (hips → torso → shoulders/elbows,
// hips → thighs → knees → ankles) driven by pose targets per gait. No external model file.
// Faces +Z, Y up, ~1.9 units tall.
// ---------------------------------------------------------------------------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...o });

function seg(len, r, mat, rings, ringMat) {
  // a limb segment hanging down from its joint pivot
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 12), mat);
  m.position.y = -len / 2; pivot.add(m);
  for (const t of rings) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.16, 6, 16), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = -len * t; pivot.add(ring);
  }
  return pivot;
}

export function makeAstronaut(tint = 0xf2f2f2, stripe = null) {
  const suit = M(tint), joint = M(0xbfc3c7), dark = M(0x2b2f33), grey = M(0xd6d9dc);
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.98; root.add(hips);

  // lower torso / brief
  const brief = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.2, 16), suit); brief.position.y = 0.02; hips.add(brief);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), joint); belt.rotation.x = Math.PI / 2; belt.position.y = 0.12; hips.add(belt);

  const torso = new THREE.Group(); torso.position.y = 0.12; hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.3, 6, 16), suit); chest.scale.set(1.05, 1, 0.82); chest.position.y = 0.3; torso.add(chest);
  const hut = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.24, 0.16, 16), grey); hut.scale.z = 0.85; hut.position.y = 0.5; torso.add(hut); // hard upper torso
  // display & control module on the chest
  const dcm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.08), grey); dcm.position.set(0, 0.3, 0.22); torso.add(dcm);
  [[-0.07, 0xff5252], [0, 0x69f0ae], [0.07, 0x40c4ff]].forEach(([x, c]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), M(c, { emissive: c, emissiveIntensity: 0.6 }));
    b.position.set(x, 0.31, 0.265); torso.add(b);
  });
  // life-support backpack (PLSS)
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.24), grey); pack.position.set(0, 0.36, -0.29); torso.add(pack);
  const packTop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12), grey); packTop.rotation.z = Math.PI / 2; packTop.position.set(0, 0.7, -0.29); torso.add(packTop);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.02), dark); vent.position.set(0, 0.2, -0.415); torso.add(vent);

  // helmet
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 20), joint); neck.rotation.x = Math.PI / 2; head.add(neck);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), suit); shell.position.y = 0.16; head.add(shell);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.205, 24, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ color: 0xc9971a, metalness: 0.85, roughness: 0.18, emissive: 0x3a2400, emissiveIntensity: 0.4 }));
  visor.position.y = 0.16; head.add(visor);
  [-1, 1].forEach((sx) => {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), M(0xffffff, { emissive: 0xfff3c0, emissiveIntensity: 1 }));
    lamp.rotation.x = Math.PI / 2; lamp.position.set(sx * 0.17, 0.25, 0.08); head.add(lamp);
  });

  // arms
  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.31, 0.5, 0); torso.add(sh);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), suit); sh.add(cap);
    const upper = seg(0.32, 0.075, suit, [0.15], joint); sh.add(upper);
    const el = new THREE.Group(); el.position.y = -0.32; upper.add(el);
    const fore = seg(0.28, 0.068, suit, [0.2, 0.85], joint); el.add(fore);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), dark); glove.scale.set(1, 1.25, 0.8); glove.position.y = -0.32; fore.add(glove);
    return { sh, el, fore };
  };
  const aL = arm(-1), aR = arm(1);
  // sampling scoop in the right hand (shown while sampling)
  const tool = new THREE.Group(); tool.position.y = -0.36; aR.fore.add(tool);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), joint); handle.position.y = -0.2; tool.add(handle);
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.1), grey); scoop.position.y = -0.46; tool.add(scoop);
  tool.visible = false;

  // legs
  const leg = (sx) => {
    const th = new THREE.Group(); th.position.set(sx * 0.11, -0.04, 0); hips.add(th);
    const thigh = seg(0.45, 0.095, suit, [0.1], joint); th.add(thigh);
    if (stripe !== null) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 14, 1, true), M(stripe, { side: THREE.DoubleSide }));
      band.position.y = -0.22; thigh.add(band);
    }
    const kn = new THREE.Group(); kn.position.y = -0.45; thigh.add(kn);
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), joint); kn.add(kneeCap);
    const shin = seg(0.42, 0.085, suit, [0.75], joint); kn.add(shin);
    const an = new THREE.Group(); an.position.y = -0.42; shin.add(an);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.28), grey); boot.position.set(0, -0.05, 0.05); an.add(boot);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.3), dark); sole.position.set(0, -0.11, 0.05); an.add(sole);
    return { th, kn, an };
  };
  const lL = leg(-1), lR = leg(1);

  root.userData = {
    hips, torso, head, tool, phase: 0,
    J: { shL: aL.sh, elL: aL.el, shR: aR.sh, elR: aR.el, thL: lL.th, knL: lL.kn, anL: lL.an, thR: lR.th, knR: lR.kn, anR: lR.an },
  };
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(SCALE);

  // radiation ring (hidden by default)
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 32), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false; root.add(ring); root.userData.ring = ring;
  return root;
}

// Gait parameters (Assumption-level stylization; posture is driven by terrain grade and route phase).
const GAIT = {
  normal:   { rate: 5.5, A: 0.45, K: 0.65, kBase: 0.08, lean: 0.06, arm: 0.35, hipY: 0.98 },
  uphill:   { rate: 3.2, A: 0.6, K: 1.0, kBase: 0.25, lean: 0.38, arm: 0.25, hipY: 0.94 },
  downhill: { rate: 4.0, A: 0.28, K: 0.4, kBase: 0.3, lean: -0.1, arm: 0.2, hipY: 0.91 },
};

function poseTargets(state, ph, walking, t) {
  const T = {};
  if (state.gait === 'sampling') {
    // kneel on the right knee, reach down with the scoop
    Object.assign(T, { thL: -1.35, knL: 1.4, anL: -0.05, thR: 0.15, knR: 1.6, anR: 0.6, shL: -0.3, elL: -0.6,
      shR: -1.15 + 0.12 * Math.sin(t * 2.5), elR: -0.35, torso: 0.42, head: 0.25, hipY: 0.56 });
    return T;
  }
  const g = GAIT[state.gait] || GAIT.normal;
  const w = walking ? 1 : 0;
  const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI), cL = Math.cos(ph), cR = Math.cos(ph + Math.PI);
  T.thL = -g.A * sL * w; T.thR = -g.A * sR * w;
  T.knL = g.kBase + g.K * Math.max(0, cL) * w; T.knR = g.kBase + g.K * Math.max(0, cR) * w;
  T.anL = -0.25 * Math.max(0, cL) * w - (state.gait === 'uphill' ? 0.2 : 0); T.anR = -0.25 * Math.max(0, cR) * w - (state.gait === 'uphill' ? 0.2 : 0);
  T.shL = g.arm * sL * w; T.shR = g.arm * sR * w;
  T.elL = -0.35 - 0.2 * Math.max(0, -sL) * w; T.elR = -0.35 - 0.2 * Math.max(0, -sR) * w;
  T.torso = g.lean; T.head = state.gait === 'downhill' ? 0.18 : -0.05; // look down when descending
  T.hipY = (walking ? g.hipY - 0.025 * Math.abs(Math.cos(ph)) : 0.98 + 0.005 * Math.sin(t * 1.5));
  return T;
}

/** Advance the animation. dtReal = real seconds since last frame; walking = moving in sim time. */
export function animate(fig, state, dtReal, walking, timeNow) {
  const u = fig.userData;
  const g = GAIT[state.gait] || GAIT.normal;
  if (walking && state.gait !== 'sampling') u.phase += dtReal * g.rate;
  const T = poseTargets(state, u.phase, walking, timeNow);
  const k = Math.min(1, dtReal * 8 + (dtReal === 0 ? 1 : 0));
  for (const [name, j] of Object.entries(u.J)) j.rotation.x += ((T[name] ?? 0) - j.rotation.x) * k;
  u.torso.rotation.x += (T.torso - u.torso.rotation.x) * k;
  u.head.rotation.x += (T.head - u.head.rotation.x) * k;
  u.hips.position.y += (T.hipY - u.hips.position.y) * k;
  u.tool.visible = state.gait === 'sampling';
  const rad = state.flags.includes('radiation');
  u.ring.visible = rad;
  if (rad) { const s = 1 + 0.25 * Math.sin(timeNow * 6); u.ring.scale.set(s, s, s); }
}

export function makeDust(count = 600) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { pos[3 * i] = (Math.random() - 0.5) * 160; pos[3 * i + 1] = Math.random() * 60; pos[3 * i + 2] = (Math.random() - 0.5) * 160; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe0a070, size: 4, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.0, depthWrite: false }));
  pts.frustumCulled = false;
  return pts;
}

export function updateDust(pts, center, tau, windMs, dtReal) {
  const target = tau > 1.2 ? Math.min(0.85, (tau - 1.0) / 2) : 0;
  pts.material.opacity += (target - pts.material.opacity) * Math.min(1, dtReal * 2);
  pts.visible = pts.material.opacity > 0.01;
  pts.position.set(center.x, center.y, center.z);
  const a = pts.geometry.attributes.position;
  const drift = windMs * dtReal * 6;
  for (let i = 0; i < a.count; i++) {
    let x = a.getX(i) + drift, y = a.getY(i) + Math.sin(i + x * 0.05) * 0.2;
    if (x > 80) x -= 160;
    a.setX(i, x); a.setY(i, ((y % 60) + 60) % 60);
  }
  a.needsUpdate = true;
}

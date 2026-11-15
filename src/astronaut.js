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

function suitMat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }); }

export function makeAstronaut(tint = 0xf2f2f2) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const white = suitMat(tint);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 8), white); torso.position.y = 1.15; body.add(torso);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), suitMat(0xbdbdbd)); pack.position.set(0, 1.2, -0.3); body.add(pack);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), white); helmet.position.y = 1.72; body.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.9, roughness: 0.2 }));
  visor.position.set(0, 1.72, 0.08); body.add(visor);
  const limb = (len, r) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 6), white); m.position.y = -len / 2 - r; const p = new THREE.Group(); p.add(m); return p; };
  const legL = limb(0.62, 0.11), legR = limb(0.62, 0.11); legL.position.set(-0.14, 0.85, 0); legR.position.set(0.14, 0.85, 0);
  const armL = limb(0.5, 0.08), armR = limb(0.5, 0.08); armL.position.set(-0.38, 1.4, 0); armR.position.set(0.38, 1.4, 0);
  g.add(legL, legR); body.add(armL, armR);
  g.userData = { body, legL, legR, armL, armR, phase: 0 };
  g.scale.setScalar(SCALE);

  // radiation ring (hidden by default)
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 32), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false; g.add(ring); g.userData.ring = ring;
  return g;
}

/** Advance the walk cycle. dtReal = real seconds since last frame; walking = whether moving in sim time. */
export function animate(fig, state, dtReal, walking, timeNow) {
  const u = fig.userData;
  const rate = { normal: 6, uphill: 3.2, downhill: 4, sampling: 0 }[state.gait] ?? 6;
  if (walking && state.gait !== 'sampling') u.phase += dtReal * rate;
  const amp = { normal: 0.55, uphill: 0.7, downhill: 0.3, sampling: 0 }[state.gait] ?? 0.5;
  const s = Math.sin(u.phase) * amp * (walking ? 1 : 0);
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
  // posture: lean into the slope when climbing (terrain-driven), lean back slightly when descending
  const lean = state.gait === 'uphill' ? 0.32 : state.gait === 'downhill' ? -0.12 : 0;
  u.body.rotation.x += (lean - u.body.rotation.x) * Math.min(1, dtReal * 4);
  // fatigue cue on climbs: slight bob
  u.body.position.y = state.gait === 'uphill' ? -0.04 * Math.abs(Math.sin(u.phase * 0.5)) : 0;
  if (state.gait === 'sampling') { u.armR.rotation.x = -1.1 + 0.15 * Math.sin(timeNow * 3); }
  const rad = state.flags.includes('radiation');
  u.ring.visible = rad;
  if (rad) { const k = 1 + 0.25 * Math.sin(timeNow * 6); u.ring.scale.set(k, k, k); }
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

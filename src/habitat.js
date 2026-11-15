// Procedural surface habitat: inflatable dome + horizontal lab module + airlock,
// regolith shielding berm, solar array, comms mast. Units = metres (true scale), Y up.
// The whole group is drawn larger in the overview map (HAB_SCALE) and at true scale in first person.
import * as THREE from 'three';

export const HAB_SCALE = 4;

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });

export function makeHabitat() {
  const g = new THREE.Group();
  const shell = M(0xeeeae2), rib = M(0xb9bec4, { metalness: 0.4, roughness: 0.4 }), berm = M(0x9a6a4c, { roughness: 1 });
  const dark = M(0x2a2f36), glass = M(0x9fd3ff, { emissive: 0x6fb6ff, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.3 });
  const panel = M(0x1f3b63, { metalness: 0.5, roughness: 0.3, emissive: 0x0a1a33, emissiveIntensity: 0.4 });

  // regolith berm around the dome (radiation shielding)
  const bermProfile = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; bermProfile.push(new THREE.Vector2(7.2 + 3.2 * t, 2.6 * Math.cos(t * Math.PI / 2))); }
  bermProfile.push(new THREE.Vector2(10.4, 0));
  const bermMesh = new THREE.Mesh(new THREE.LatheGeometry(bermProfile, 48), berm); g.add(bermMesh);

  // inflatable main dome with ribs
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), shell); dome.scale.y = 0.78; g.add(dome);
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(7.02, 0.08, 6, 48, Math.PI), rib);
    r.rotation.y = (i / 8) * Math.PI; r.scale.y = 0.78; g.add(r);
  }
  [1.6, 3.3].forEach((h) => {
    const rr = Math.sqrt(49 - (h / 0.78) ** 2);
    const band = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.07, 6, 48), rib); band.rotation.x = Math.PI / 2; band.position.y = h; g.add(band);
  });
  const cupola = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); cupola.position.y = 5.3; g.add(cupola);
  // window strip
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.1), glass);
    w.position.set(Math.cos(a) * 6.55, 2.4, Math.sin(a) * 6.55); w.lookAt(0, 2.4, 0); g.add(w);
  }

  // horizontal lab module (east) with end caps, half-buried in regolith bags
  const lab = new THREE.Group(); lab.position.set(13, 2.3, 0); g.add(lab);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 9, 32), shell); tube.rotation.z = Math.PI / 2; lab.add(tube);
  [-4.5, 4.5].forEach((x) => { const cap = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 12), shell); cap.scale.x = 0.35; cap.position.x = x; lab.add(cap); });
  [-3, -1, 1, 3].forEach((x) => { const r = new THREE.Mesh(new THREE.TorusGeometry(2.22, 0.07, 6, 32), rib); r.rotation.y = Math.PI / 2; r.position.x = x; lab.add(r); });
  const sandbags = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 5.2), berm); sandbags.position.y = -1.7; lab.add(sandbags);
  // connecting tunnel
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4, 20), shell); tunnel.rotation.z = Math.PI / 2; tunnel.position.set(8, 1.6, 0); g.add(tunnel);

  // airlock with suitports (south side)
  const al = new THREE.Group(); al.position.set(0, 0, 8.4); g.add(al);
  const alBody = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 24), shell); alBody.rotation.x = Math.PI / 2; alBody.position.y = 1.7; al.add(alBody);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.15, 24), dark); hatch.rotation.x = Math.PI / 2; hatch.position.set(0, 1.7, 1.65); al.add(hatch);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), M(0xffd27a, { emissive: 0xffb347, emissiveIntensity: 1.5 })); lamp.position.set(0, 3.1, 1.5); al.add(lamp);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 3), dark); ramp.position.set(0, 0.3, 3); ramp.rotation.x = 0.18; al.add(ramp);

  // solar array (west)
  const solar = new THREE.Group(); solar.position.set(-18, 0, -2); g.add(solar);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const p = new THREE.Group(); p.position.set(col * 4.4 - 6.6, 1.6, row * 4.6 - 2.3);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 3.2), panel); pane.rotation.x = -0.45; p.add(pane);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.05, 3.3), rib); frame.rotation.x = -0.45; frame.position.y = -0.06; p.add(frame);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), rib); post.position.y = -0.8; p.add(post);
    solar.add(p);
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 10, 6), dark); cable.rotation.z = Math.PI / 2; cable.position.set(-10, 0.1, -2); g.add(cable);

  // comms mast + dish (north)
  const mast = new THREE.Group(); mast.position.set(4, 0, -11); g.add(mast);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 8), rib); pole.position.y = 4.5; mast.add(pole);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), shell);
  dish.position.y = 8.6; dish.rotation.x = -2.2; mast.add(dish);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M(0xff4d4d, { emissive: 0xff2020, emissiveIntensity: 2 })); beacon.position.y = 9.2; mast.add(beacon);
  g.userData.beacon = beacon;

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Blink the comms beacon. */
export function tickHabitat(hab, t) {
  const b = hab.userData.beacon; if (b) b.material.emissiveIntensity = Math.sin(t * 3) > 0.6 ? 2.5 : 0.2;
}

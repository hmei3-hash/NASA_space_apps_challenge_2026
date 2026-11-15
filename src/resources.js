// Civ-style "resource" badges for real Jezero places (icons: game-icons.net, CC BY 3.0).
import * as THREE from 'three';
import { ICONS } from './icons.js';

export const RESOURCE_TYPES = {
  lake:      { en: 'Lake-bed mudstone', color: '#1e88e5', why: 'Fine layers that settled in standing water: the best record of the ancient lake and its habitability.' },
  carbonate: { en: 'Carbonate-bearing', color: '#26c6da', why: 'Carbonates form in water and can preserve chemical traces of past environments.' },
  olivine:   { en: 'Olivine-rich igneous', color: '#43a047', why: 'Olivine-rich igneous rock: dates the crater floor and records water–rock alteration.' },
  igneous:   { en: 'Igneous rock', color: '#c62828', why: 'Igneous rock can give absolute ages for Jezero history.' },
  sediment:  { en: 'Sedimentary rock', color: '#8d6e63', why: 'Sediment the river carried into the lake.' },
  organics:  { en: 'Organics detected', color: '#8e24aa', why: 'Organic compounds detected: a priority astrobiology target (not proof of life).' },
  regolith:  { en: 'Regolith / megaripple', color: '#d4a056', why: 'Loose surface material: relevant to dust hazards and in-situ resource use.' },
  depot:     { en: 'Sample depot', color: '#f9a825', why: 'Cached sample tubes for a future return to Earth.' },
  landing:   { en: 'Landing site', color: '#eceff1', why: 'Historic landing site on flat, well-characterized ground.' },
  habitat:   { en: 'Habitat', color: '#ffffff', why: 'EVA start and end point.' },
};

const cache = new Map();

/** Badge texture: coloured disc + white ring + white icon (SVG -> canvas). */
export function badgeTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const t = RESOURCE_TYPES[kind] || RESOURCE_TYPES.sediment;
  const icon = ICONS[kind] || ICONS.sediment;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <circle cx="64" cy="64" r="58" fill="${t.color}" stroke="#fff" stroke-width="7"/>
    <circle cx="64" cy="64" r="50" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="3"/>
    <g transform="translate(30 30) scale(0.1328)" fill="${kind === 'landing' || kind === 'habitat' ? '#263238' : '#fff'}">${icon.body.replace(/fill="currentColor"/g, '')}</g>
  </svg>`;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => { canvas.getContext('2d').drawImage(img, 0, 0); tex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  cache.set(kind, tex);
  return tex;
}

export function badgeSprite(kind, size = 0.045) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(kind), depthTest: false, sizeAttenuation: false, transparent: true }));
  s.scale.set(size, size, 1);
  s.renderOrder = 20;
  return s;
}

/** Small inline <img> for HTML lists. */
export function badgeImgHTML(kind, px = 22) {
  const t = RESOURCE_TYPES[kind] || RESOURCE_TYPES.sediment;
  const icon = ICONS[kind] || ICONS.sediment;
  const fill = kind === 'landing' || kind === 'habitat' ? '#263238' : '#fff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="58" fill="${t.color}" stroke="#fff" stroke-width="7"/><g transform="translate(30 30) scale(0.1328)" fill="${fill}">${icon.body.replace(/fill="currentColor"/g, '')}</g></svg>`;
  return `<img class="badge-ic" width="${px}" height="${px}" alt="${t.en}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
}

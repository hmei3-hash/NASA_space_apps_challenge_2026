// Civ-style "resource" badges for real Jezero places (icons: game-icons.net, CC BY 3.0).
import * as THREE from 'three';
import { ICONS } from './icons.js';

export const RESOURCE_TYPES = {
  lake:      { zh: '古湖泊沉积', en: 'Lake-bed mudstone', color: '#1e88e5' },
  carbonate: { zh: '碳酸盐', en: 'Carbonate-bearing', color: '#26c6da' },
  olivine:   { zh: '橄榄石火成岩', en: 'Olivine-rich igneous', color: '#43a047' },
  igneous:   { zh: '火成岩', en: 'Igneous rock', color: '#c62828' },
  sediment:  { zh: '沉积岩', en: 'Sedimentary rock', color: '#8d6e63' },
  organics:  { zh: '有机物信号', en: 'Organics detected', color: '#8e24aa' },
  regolith:  { zh: '风化层/沙波', en: 'Regolith / megaripple', color: '#d4a056' },
  depot:     { zh: '样品库', en: 'Sample depot', color: '#f9a825' },
  landing:   { zh: '着陆点', en: 'Landing site', color: '#eceff1' },
  habitat:   { zh: '栖息舱', en: 'Habitat', color: '#ffffff' },
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

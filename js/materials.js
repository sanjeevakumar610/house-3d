// Materials. Floor textures are drawn procedurally on canvases so the site has no image assets.
import * as THREE from 'three';

function canvasTexture(size, draw, repeatFt) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // floor UVs are in feet, so one texture tile covers repeatFt × repeatFt feet
  tex.repeat.set(1 / repeatFt, 1 / repeatFt);
  return tex;
}

// seeded random so textures look the same on every load
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

const drawTiles = (base, grout, n, jitter) => (g, s) => {
  const r = rng(7);
  const cell = s / n;
  g.fillStyle = grout; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (r() - 0.5) * jitter;
    g.fillStyle = shade(base, v);
    g.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
  }
};

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

function drawMarble(g, s) {
  const r = rng(11);
  g.fillStyle = '#efece6'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 14; k++) {
    g.strokeStyle = `rgba(120,120,125,${0.08 + r() * 0.18})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    let x = r() * s, y = 0;
    g.moveTo(x, y);
    while (y < s) { x += (r() - 0.5) * 60; y += 20 + r() * 30; g.lineTo(x, y); }
    g.stroke();
  }
  // slab joints (2 × 2 slabs per texture)
  g.strokeStyle = 'rgba(160,155,150,0.6)'; g.lineWidth = 2;
  g.strokeRect(1, 1, s / 2 - 2, s / 2 - 2); g.strokeRect(s / 2 + 1, 1, s / 2 - 2, s / 2 - 2);
  g.strokeRect(1, s / 2 + 1, s / 2 - 2, s / 2 - 2); g.strokeRect(s / 2 + 1, s / 2 + 1, s / 2 - 2, s / 2 - 2);
}

function drawWood(g, s) {
  const r = rng(3);
  const planks = 8, w = s / planks;
  for (let i = 0; i < planks; i++) {
    const base = new THREE.Color().setHSL(0.07 + r() * 0.02, 0.45, 0.32 + r() * 0.1);
    g.fillStyle = '#' + base.getHexString(); g.fillRect(i * w, 0, w, s);
    for (let k = 0; k < 18; k++) {
      g.strokeStyle = `rgba(40,20,5,${0.05 + r() * 0.12})`; g.lineWidth = 1;
      const x = i * w + r() * w;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 4, s / 3, x - 4, (2 * s) / 3, x, s); g.stroke();
    }
    g.fillStyle = 'rgba(20,10,0,0.45)'; g.fillRect(i * w, 0, 1.5, s);
    const cut = r() * s; g.fillRect(i * w, cut, w, 1.5);
  }
}

function drawPaving(g, s) {
  const r = rng(5);
  g.fillStyle = '#8d8a84'; g.fillRect(0, 0, s, s);
  const n = 8, c = s / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n + 1; i++) {
    const off = j % 2 ? c / 2 : 0;
    g.fillStyle = shade('#b9b3a8', (r() - 0.5) * 0.08);
    g.fillRect(i * c - off + 2, j * c + 2, c - 4, c - 4);
  }
}

function drawGranite(g, s) {
  const r = rng(13);
  g.fillStyle = '#3a3836'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 9000; k++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(20,18,17,${0.4 + r() * 0.5})` : v < 0.85 ? `rgba(120,112,104,${0.3 + r() * 0.5})` : `rgba(190,170,150,${0.4 + r() * 0.4})`;
    const sz = 1 + r() * 3;
    g.fillRect(r() * s, r() * s, sz, sz);
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  g.strokeRect(1, 1, s / 2 - 2, s - 2); g.strokeRect(s / 2 + 1, 1, s / 2 - 2, s - 2);
}

function drawGrass(g, s) {
  const r = rng(9);
  g.fillStyle = '#5f8a3e'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 4000; k++) {
    g.fillStyle = `rgba(${40 + r() * 60},${100 + r() * 60},${30 + r() * 30},0.5)`;
    g.fillRect(r() * s, r() * s, 2, 2);
  }
}

function drawCorrugated(g, s) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const grd = g.createLinearGradient((i * s) / n, 0, ((i + 1) * s) / n, 0);
    grd.addColorStop(0, '#9a9d9f'); grd.addColorStop(0.5, '#c9cccd'); grd.addColorStop(1, '#8e9193');
    g.fillStyle = grd; g.fillRect((i * s) / n, 0, s / n + 1, s);
  }
}

// Floor finishes the user can pick from (Step 4 uses the same keys)
export const FLOOR_FINISHES = {
  tiles: { label: 'Ceramic tiles (2×2 ft)', make: () => canvasTexture(512, drawTiles('#d8d2c6', '#9c968c', 4, 0.04), 8), roughness: 0.35 },
  marble: { label: 'Marble (2×2 ft slabs)', make: () => canvasTexture(1024, drawMarble, 4), roughness: 0.15 },
  wood: { label: 'Wood planks', make: () => canvasTexture(512, drawWood, 4), roughness: 0.6 },
  granite: { label: 'Granite (2×4 ft slabs)', make: () => canvasTexture(512, drawGranite, 4), roughness: 0.2 },
  bathTiles: { label: 'Anti-skid tiles (1×1 ft)', make: () => canvasTexture(512, drawTiles('#a9b9bd', '#6f7b7e', 8, 0.05), 8), roughness: 0.7 },
  paving: { label: 'Paving blocks', make: () => canvasTexture(512, drawPaving, 6), roughness: 0.9 },
};

const floorCache = {};
export function floorMaterial(key) {
  if (!floorCache[key]) {
    const f = FLOOR_FINISHES[key];
    floorCache[key] = new THREE.MeshStandardMaterial({ map: f.make(), roughness: f.roughness });
  }
  return floorCache[key];
}

export const DEFAULT_WALL = '#f2eee6';
export const DEFAULT_EXTERIOR = '#e9e2d3';

export function paintMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
}

export const M = {
  plaster: new THREE.MeshStandardMaterial({ color: '#e2ddd3', roughness: 0.95 }),
  ceiling: new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 1 }),
  slabEdge: new THREE.MeshStandardMaterial({ color: '#d6d0c4', roughness: 1 }),
  plinth: new THREE.MeshStandardMaterial({ color: '#8f8679', roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: '#b8b2a8', roughness: 1 }),
  column: new THREE.MeshStandardMaterial({ color: '#ebe6dc', roughness: 0.95 }),
  timber: new THREE.MeshStandardMaterial({ color: '#7a4a26', roughness: 0.6 }),
  screen: new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.6 }),
  aluminium: new THREE.MeshStandardMaterial({ color: '#5c6166', roughness: 0.4, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: '#a8c8d8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }),
  rail: new THREE.MeshStandardMaterial({ color: '#3d4247', roughness: 0.4, metalness: 0.7 }),
  roof: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }),
  roofUnder: new THREE.MeshStandardMaterial({ color: '#c9b08a', roughness: 0.9 }),
  tank: new THREE.MeshStandardMaterial({ color: '#2f3a44', roughness: 0.6 }),
  stair: new THREE.MeshStandardMaterial({ color: '#cfc9bd', roughness: 0.7 }),
  boundary: new THREE.MeshStandardMaterial({ color: '#cbc4b6', roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ color: '#45474a', roughness: 1 }),
  plot: null,
  grass: null,
  line: new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 1.5, gapSize: 1 }),
};

export function initSiteMaterials() {
  M.grass = new THREE.MeshStandardMaterial({ map: canvasTexture(256, drawGrass, 6), roughness: 1 });
  M.plot = new THREE.MeshStandardMaterial({ map: canvasTexture(256, drawGrass, 4), color: '#cfe0b8', roughness: 1 });
  const roofTex = canvasTexture(256, drawCorrugated, 2.5);
  M.roof.map = roofTex;
  M.roof.needsUpdate = true;
}

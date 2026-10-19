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
  terracotta: { label: 'Terracotta tiles (1×1 ft)', make: () => canvasTexture(512, drawTiles('#b8643f', '#7d4a33', 8, 0.08), 8), roughness: 0.8 },
  paving: { label: 'Paving blocks', make: () => canvasTexture(512, drawPaving, 6), roughness: 0.9 },
};

// ------------------------------------------------------------------ facade finishes (styles)
function drawBrick(g, s) {
  const r = rng(21);
  g.fillStyle = '#b9a99a'; g.fillRect(0, 0, s, s);
  const rows = 16, h = s / rows, w = s / 5.33; // 9" × 3" bricks on a 4 ft tile
  for (let j = 0; j < rows; j++) for (let i = -1; i < 7; i++) {
    const x = i * w + (j % 2 ? w / 2 : 0);
    g.fillStyle = new THREE.Color().setHSL(0.03 + r() * 0.02, 0.5 + r() * 0.15, 0.33 + r() * 0.1).getStyle();
    g.fillRect(x + 2, j * h + 2, w - 4, h - 4);
  }
}
function drawStone(base, joint) {
  return (g, s) => {
    const r = rng(17);
    g.fillStyle = joint; g.fillRect(0, 0, s, s);
    let y = 0;
    while (y < s) {
      const h = s / 10 + r() * (s / 8);
      let x = -r() * 60;
      while (x < s) { const w = s / 6 + r() * (s / 3); g.fillStyle = shade(base, (r() - 0.5) * 0.12); g.fillRect(x + 3, y + 3, w - 6, h - 6); x += w; }
      y += h;
    }
  };
}
function drawConcrete(g, s) {
  const r = rng(31);
  g.fillStyle = '#a9a59e'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 6000; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '70,70,68' : '210,206,198'},${0.05 + r() * 0.08})`; g.fillRect(r() * s, r() * s, 2 + r() * 4, 1 + r() * 2); }
  // board marks every 6", tie holes on a 2 ft grid
  g.strokeStyle = 'rgba(60,58,55,0.35)'; g.lineWidth = 2;
  for (let y = 0; y < s; y += s / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  g.fillStyle = 'rgba(50,48,45,0.55)';
  for (let x = s / 4; x < s; x += s / 2) for (let y = s / 4; y < s; y += s / 2) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
}
function drawBoards(hue, light, gap) {
  return (g, s) => {
    const r = rng(41);
    const n = 8, w = s / n;
    g.fillStyle = gap; g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      g.fillStyle = new THREE.Color().setHSL(hue + r() * 0.015, 0.4, light + r() * 0.06).getStyle();
      g.fillRect(i * w + 2, 0, w - 4, s);
      for (let k = 0; k < 10; k++) { g.strokeStyle = `rgba(30,15,5,${0.06 + r() * 0.1})`; g.lineWidth = 1; const x = i * w + 4 + r() * (w - 8); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 6, s); g.stroke(); }
    }
  };
}
function drawCharred(g, s) {
  const r = rng(43);
  g.fillStyle = '#1c1a19'; g.fillRect(0, 0, s, s);
  const n = 8, w = s / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgb(${28 + r() * 10},${25 + r() * 8},${23 + r() * 8})`; g.fillRect(i * w + 1, 0, w - 2, s);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(80,70,60,${r() * 0.25})`; g.fillRect(i * w + r() * w, r() * s, 2 + r() * 6, 1.5); }
  }
}
function drawPerforated(g, s) {
  g.clearRect(0, 0, s, s);
  g.fillStyle = '#2b2d30'; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'destination-out';
  const n = 16, c = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.beginPath(); g.arc(i * c + c / 2 + (j % 2 ? c / 2 : 0), j * c + c / 2, c * 0.3, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-over';
}
function drawJali(g, s) {
  g.clearRect(0, 0, s, s);
  g.fillStyle = '#e8dcc6'; g.fillRect(0, 0, s, s);
  const n = 4, c = s / n; // 1 ft breeze blocks
  g.strokeStyle = '#b9ab92'; g.lineWidth = 4;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, s); g.moveTo(0, i * c); g.lineTo(s, i * c); g.stroke(); }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * c, y = j * c, m = c / 2;
    for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { g.beginPath(); g.arc(x + m * qx + m / 2, y + m * qy + m / 2, m * 0.36, 0, Math.PI * 2); g.fill(); }
  }
  g.globalCompositeOperation = 'source-over';
}
function drawLeaves(g, s) {
  const r = rng(53);
  g.fillStyle = '#2f4f24'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 2600; k++) {
    g.fillStyle = new THREE.Color().setHSL(0.22 + r() * 0.1, 0.45 + r() * 0.2, 0.18 + r() * 0.22).getStyle();
    g.beginPath(); g.ellipse(r() * s, r() * s, 3 + r() * 7, 2 + r() * 4, r() * Math.PI, 0, Math.PI * 2); g.fill();
  }
}
function drawGravel(g, s) {
  const r = rng(61);
  g.fillStyle = '#c9c4ba'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(${150 + r() * 80},${145 + r() * 75},${135 + r() * 70},0.8)`; g.fillRect(r() * s, r() * s, 2 + r() * 3, 2 + r() * 3); }
  g.strokeStyle = 'rgba(120,114,104,0.35)'; g.lineWidth = 2; // raked lines
  for (let y = 6; y < s; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
}

// overlay finishes on outside walls; uv is in feet along the wall and up
const CLAD_DEFS = {
  brick: [() => canvasTexture(512, drawBrick, 4), 0.9],
  stoneDark: [() => canvasTexture(512, drawStone('#4a4a48', '#2a2a29'), 4), 0.9],
  stoneLight: [() => canvasTexture(512, drawStone('#cfcac0', '#a9a397'), 4), 0.9],
  stoneWarm: [() => canvasTexture(512, drawStone('#b9a487', '#8b7a63'), 4), 0.9],
  stoneBlack: [() => canvasTexture(512, drawGranite, 4), 0.25],
  concrete: [() => canvasTexture(512, drawConcrete, 4), 0.95],
  timber: [() => canvasTexture(512, drawBoards(0.07, 0.36, '#3a2414'), 3), 0.7],
  charred: [() => canvasTexture(512, drawCharred, 3), 0.85],
  leaves: [() => canvasTexture(512, drawLeaves, 3), 1],
  gravel: [() => canvasTexture(512, drawGravel, 4), 1],
};
const cladCache = {};
export function cladMaterial(key) {
  if (!cladCache[key]) {
    const [make, rough] = CLAD_DEFS[key];
    cladCache[key] = new THREE.MeshStandardMaterial({ map: make(), roughness: rough, metalness: key === 'stoneBlack' ? 0.1 : 0 });
  }
  return cladCache[key];
}
export const CLAD_LABEL = {
  brick: 'Brick slip cladding', stoneDark: 'Dark stone cladding', stoneLight: 'Light stone cladding', stoneWarm: 'Sandstone cladding',
  stoneBlack: 'Black granite cladding', concrete: 'Board-marked concrete finish', timber: 'Timber-look (WPC) cladding', charred: 'Charred timber cladding', leaves: 'Green wall',
};

// solid finishes used by frames, fins, railings, trims and so on
const FIN = {
  alu: { color: '#5c6166', roughness: 0.4, metalness: 0.6 },
  charcoal: { color: '#34373a', roughness: 0.45, metalness: 0.5 },
  black: { color: '#1d1e20', roughness: 0.5, metalness: 0.4 },
  white: { color: '#f3f3f0', roughness: 0.6, metalness: 0.1 },
  gold: { color: '#d8b25e', roughness: 0.32, metalness: 0.35, emissive: '#3a2a08', emissiveIntensity: 0.4 },
  bronze: { color: '#5a4636', roughness: 0.4, metalness: 0.6 },
  blue: { color: '#2f5e7a', roughness: 0.5, metalness: 0.2 },
  timber: { color: '#9b6a3e', roughness: 0.7 },
  timberFin: { color: '#a0703f', roughness: 0.6, metalness: 0.15 },
  concrete: { color: '#a9a59e', roughness: 0.95 },
  terracotta: { color: '#b9643f', roughness: 0.85 },
  soil: { color: '#4a3526', roughness: 1 },
  plant: { color: '#3f6b2f', roughness: 0.9 },
  plant2: { color: '#5a8a3a', roughness: 0.9 },
  bloom: { color: '#c2457a', roughness: 0.9 },
  trunk: { color: '#6b4a32', roughness: 0.9 },
  bamboo: { color: '#7d9a46', roughness: 0.6 },
  stone: { color: '#8c8780', roughness: 0.9 },
  light: { color: '#ffe2a8', emissive: '#ffcf70', emissiveIntensity: 1.4, roughness: 0.4 },
};
const finCache = {};
export function finishMat(key) {
  if (finCache[key]) return finCache[key];
  if (key === 'perforated') finCache[key] = new THREE.MeshStandardMaterial({ map: canvasTexture(512, drawPerforated, 3), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
  else if (key === 'jali') finCache[key] = new THREE.MeshStandardMaterial({ map: canvasTexture(512, drawJali, 4), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
  else if (CLAD_DEFS[key]) finCache[key] = cladMaterial(key);
  else finCache[key] = new THREE.MeshStandardMaterial(FIN[key] || FIN.alu);
  return finCache[key];
}

const GLASS = {
  clear: { color: '#a8c8d8', opacity: 0.28 },
  bronze: { color: '#7a5a3c', opacity: 0.5 },
  blue: { color: '#8fb8cf', opacity: 0.36 },
};
const glassCache = {};
export function glassMaterial(key) {
  if (key === 'clear' || !GLASS[key]) return M.glass;
  return (glassCache[key] ||= new THREE.MeshStandardMaterial({ color: GLASS[key].color, roughness: 0.05, metalness: 0.2, transparent: true, opacity: GLASS[key].opacity, depthWrite: false }));
}

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

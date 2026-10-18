// Furniture catalogue (real-world sizes in feet) and simple procedural models.
// Model axes: width along X, depth along Z, the front faces +Z, the back (headboard, sofa back,
// counter back) is at −Z. rot is the rotation about the vertical axis in radians.
import * as THREE from 'three';

const mat = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const MAT = {
  wood: mat('#8a5a36', 0.6), woodDark: mat('#5b3a22', 0.6), woodLight: mat('#c49a6c', 0.6),
  fabric: mat('#6f7f8c', 0.95), fabricWarm: mat('#9c7b62', 0.95), cushion: mat('#d8cfc2', 0.95),
  linen: mat('#f1ede6', 0.95), pillow: mat('#ffffff', 0.95), blanket: mat('#7d93a6', 0.95),
  granite: mat('#2f2f33', 0.25), carcass: mat('#e8e2d8', 0.6), steel: mat('#b9bcbf', 0.3, 0.8),
  black: mat('#26282b', 0.5), white: mat('#f4f4f2', 0.4), glassDark: mat('#1b2026', 0.15, 0.3),
};

export const CATALOG = {
  'bed-double': { label: 'Double bed', w: 4.5, d: 6.25, group: 'Bedroom' },
  'bed-queen': { label: 'Queen bed', w: 5, d: 6.5, group: 'Bedroom' },
  'bed-single': { label: 'Single bed', w: 3, d: 6.25, group: 'Bedroom' },
  bedside: { label: 'Bedside table', w: 1.5, d: 1.25, group: 'Bedroom' },
  'wardrobe-2': { label: 'Wardrobe, 2 door', w: 3, d: 2, group: 'Bedroom' },
  'wardrobe-3': { label: 'Wardrobe, 3 door', w: 4.5, d: 2, group: 'Bedroom' },
  desk: { label: 'Study desk', w: 4, d: 1.75, group: 'Bedroom' },
  'sofa-3': { label: 'Sofa, 3 seat', w: 6.5, d: 2.9, group: 'Living' },
  'sofa-2': { label: 'Sofa, 2 seat', w: 4.75, d: 2.9, group: 'Living' },
  armchair: { label: 'Armchair', w: 2.6, d: 2.7, group: 'Living' },
  'coffee-table': { label: 'Coffee table', w: 3.5, d: 1.75, group: 'Living' },
  'tv-unit': { label: 'TV unit', w: 5, d: 1.33, group: 'Living' },
  'dining-4': { label: 'Dining table, 4 seat', w: 4, d: 2.75, group: 'Dining' },
  'dining-6': { label: 'Dining table, 6 seat', w: 3, d: 5, group: 'Dining' },
  chair: { label: 'Chair', w: 1.5, d: 1.6, group: 'Dining' },
  counter: { label: 'Kitchen counter', w: 6, d: 2, group: 'Kitchen', resizable: true },
  'counter-sink': { label: 'Sink counter', w: 4, d: 2, group: 'Kitchen', resizable: true },
  'counter-hob': { label: 'Hob counter', w: 4, d: 2, group: 'Kitchen', resizable: true },
  fridge: { label: 'Fridge', w: 2.3, d: 2.3, group: 'Kitchen' },
};

// box helper: size and centre (x, y bottom-up, z) in the item's local frame
function bx(g, w, h, d, x, y, z, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function bed(g, w, d) {
  bx(g, w, 0.9, d, 0, 0.25, 0, MAT.wood);                                   // frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, 0.2, 0.25, 0.2, sx * (w / 2 - 0.15), 0, sz * (d / 2 - 0.15), MAT.woodDark);
  bx(g, w - 0.15, 0.65, d - 0.25, 0, 1.15, 0.05, MAT.linen);               // mattress
  bx(g, w, 2.4, 0.2, 0, 0.6, -d / 2 + 0.1, MAT.woodDark);                  // headboard
  const pw = w > 3.5 ? (w - 0.5) / 2 : w - 0.4;
  for (const px of w > 3.5 ? [-(pw / 2 + 0.1), pw / 2 + 0.1] : [0]) bx(g, pw, 0.35, 1.1, px, 1.8, -d / 2 + 0.85, MAT.pillow);
  bx(g, w - 0.1, 0.12, d * 0.5, 0, 1.8, d * 0.2, MAT.blanket);             // blanket
}

function sofa(g, w, d, m = MAT.fabric) {
  const arm = 0.55, seatH = 1.4;
  bx(g, w, 0.9, d, 0, 0.3, 0, m);                                          // base
  bx(g, w, 1.6, 0.7, 0, 1.2, -d / 2 + 0.35, m);                            // back
  bx(g, arm, 0.9, d, -w / 2 + arm / 2, 1.2, 0, m);                         // arms
  bx(g, arm, 0.9, d, w / 2 - arm / 2, 1.2, 0, m);
  const seats = Math.max(1, Math.round((w - 2 * arm) / 2));
  const cw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) bx(g, cw - 0.06, 0.25, d - 0.8, -w / 2 + arm + cw * (i + 0.5), 1.2, 0.3, MAT.cushion);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, 0.15, 0.3, 0.15, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2), MAT.woodDark);
  return seatH;
}

function table(g, w, d, h, top = MAT.woodLight, legs = MAT.woodDark) {
  bx(g, w, 0.12, d, 0, h - 0.12, 0, top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, 0.17, h - 0.12, 0.17, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2), legs);
}

function chair(g, x = 0, z = 0, rot = 0) {
  const c = new THREE.Group();
  bx(c, 1.4, 0.12, 1.4, 0, 1.4, 0, MAT.woodLight);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(c, 0.12, 1.4, 0.12, sx * 0.6, 0, sz * 0.6, MAT.woodDark);
  bx(c, 1.4, 1.5, 0.12, 0, 1.52, -0.64, MAT.woodDark);
  c.position.set(x, 0, z);
  c.rotation.y = rot;
  g.add(c);
}

function counter(g, w, d, kind) {
  const h = 2.83; // 34"
  bx(g, w, 0.3, d - 0.2, 0, 0, 0.1 - 0.1, MAT.black);                     // kick plate
  bx(g, w, h - 0.4, d - 0.1, 0, 0.3, -0.05, MAT.carcass);                 // cabinets
  const doors = Math.max(1, Math.round(w / 1.5));
  for (let i = 1; i < doors; i++) bx(g, 0.03, h - 0.6, 0.02, -w / 2 + (w * i) / doors, 0.4, d / 2 - 0.08, MAT.steel);
  bx(g, w + 0.05, 0.1, d, 0, h - 0.1, 0, MAT.granite);                     // granite top
  if (kind === 'sink') {
    bx(g, 1.8, 0.02, 1.2, 0, h, 0.1, MAT.steel);
    const tap = bx(g, 0.08, 0.7, 0.08, 0, h, -d / 2 + 0.3, MAT.steel);
    tap.position.y = h + 0.35;
  }
  if (kind === 'hob') {
    bx(g, 2.2, 0.04, 1.4, 0, h, 0, MAT.glassDark);
    for (const [px, pz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 20), MAT.steel);
      ring.rotation.x = Math.PI / 2; ring.position.set(px, h + 0.06, pz); g.add(ring);
    }
  }
}

function wardrobe(g, w, d) {
  const h = 7;
  bx(g, w, h, d, 0, 0, 0, MAT.woodLight);
  const doors = Math.round(w / 1.5);
  for (let i = 1; i < doors; i++) bx(g, 0.03, h - 0.4, 0.02, -w / 2 + (w * i) / doors, 0.2, d / 2 + 0.01, MAT.woodDark);
  for (let i = 0; i < doors; i++) bx(g, 0.05, 0.6, 0.06, -w / 2 + (w * (i + 0.5)) / doors + 0.25, 3.2, d / 2 + 0.03, MAT.steel);
}

export function makeModel(type, w, d) {
  const g = new THREE.Group();
  switch (type) {
    case 'bed-double': case 'bed-queen': case 'bed-single': bed(g, w, d); break;
    case 'bedside': bx(g, w, 1.8, d, 0, 0, 0, MAT.wood); bx(g, w - 0.1, 0.02, 0.02, 0, 1.2, d / 2 + 0.01, MAT.woodDark); break;
    case 'wardrobe-2': case 'wardrobe-3': wardrobe(g, w, d); break;
    case 'desk': table(g, w, d, 2.5, MAT.woodLight, MAT.wood); bx(g, w * 0.35, 1.9, d - 0.2, w / 2 - w * 0.175 - 0.1, 0.4, 0, MAT.wood); break;
    case 'sofa-3': case 'sofa-2': sofa(g, w, d); break;
    case 'armchair': sofa(g, w, d, MAT.fabricWarm); break;
    case 'coffee-table': table(g, w, d, 1.4); break;
    case 'tv-unit': bx(g, w, 1.6, d, 0, 0.2, 0, MAT.woodDark); bx(g, 3.6, 2.1, 0.12, 0, 1.9, -d / 2 + 0.2, MAT.black); break;
    case 'dining-4':
      table(g, w, d, 2.5);
      chair(g, -w / 4, d / 2 + 0.3, Math.PI); chair(g, w / 4, d / 2 + 0.3, Math.PI);
      chair(g, -w / 4, -d / 2 - 0.3, 0); chair(g, w / 4, -d / 2 - 0.3, 0);
      break;
    case 'dining-6':
      table(g, w, d, 2.5);
      for (const z of [-d / 4, d / 4]) { chair(g, -w / 2 - 0.4, z, Math.PI / 2); chair(g, w / 2 + 0.4, z, -Math.PI / 2); }
      chair(g, 0, -d / 2 - 0.4, 0); chair(g, 0, d / 2 + 0.4, Math.PI);
      break;
    case 'chair': chair(g); break;
    case 'counter': counter(g, w, d, null); break;
    case 'counter-sink': counter(g, w, d, 'sink'); break;
    case 'counter-hob': counter(g, w, d, 'hob'); break;
    case 'fridge': bx(g, w, 5.5, d, 0, 0, 0, MAT.white); bx(g, 0.06, 1.4, 0.08, w / 2 - 0.3, 2.6, d / 2 + 0.04, MAT.steel); bx(g, w, 0.02, 0.02, 0, 3.6, d / 2 + 0.01, MAT.steel); break;
    default: bx(g, w, 2, d, 0, 0, 0, MAT.wood);
  }
  return g;
}

// Footprint used for walk-mode collisions and click targets: the dining sets include their chairs
export function footprint(type, w, d) {
  if (type === 'dining-4') return { w, d: d + 2.2 };
  if (type === 'dining-6') return { w: w + 2.4, d: d + 2.4 };
  return { w, d };
}

// The architect's furniture layout from the plans (plan feet; rot as above).
const R90 = Math.PI / 2;
export const DEFAULT_FURNITURE = [
  // ground floor
  { type: 'bed-double', x: 9.12, y: 3.73, rot: 0 },
  { type: 'bedside', x: 5.95, y: 1.25, rot: 0 },
  { type: 'bedside', x: 12.3, y: 1.25, rot: 0 },
  { type: 'sofa-3', x: 5.8, y: 16.7, rot: Math.PI },
  { type: 'sofa-2', x: 2.15, y: 13.2, rot: R90 },
  { type: 'coffee-table', x: 5.67, y: 14.2, rot: 0 },
  { type: 'dining-6', x: 14.74, y: 17.9, rot: 0 },
  { type: 'armchair', x: 17.0, y: 22.9, rot: -R90 - 0.13 },
  { type: 'armchair', x: 16.6, y: 25.9, rot: -R90 - 0.13 },
  { type: 'counter-sink', x: 19.95, y: 5.73, rot: 0, w: 4.4, d: 2 },
  { type: 'counter-hob', x: 20.15, y: 10.3, rot: -R90 - 0.1667, w: 7.1, d: 2 },
  // upper floor
  { type: 'bed-double', x: 8.86, y: 3.73, rot: 0, floor: 'uf' },
  { type: 'bedside', x: 5.7, y: 1.25, rot: 0, floor: 'uf' },
  { type: 'bedside', x: 12.05, y: 1.25, rot: 0, floor: 'uf' },
  { type: 'bed-double', x: 17.4, y: 10.5, rot: -R90, floor: 'uf' },
  { type: 'armchair', x: 15.3, y: 14.6, rot: Math.PI, floor: 'uf' },
  { type: 'armchair', x: 18.1, y: 14.4, rot: Math.PI, floor: 'uf' },
  { type: 'bed-double', x: 14.1, y: 24.5, rot: R90, floor: 'uf' },
  { type: 'desk', x: 16.6, y: 18.8, rot: 0, floor: 'uf' },
  { type: 'chair', x: 16.6, y: 19.9, rot: Math.PI, floor: 'uf' },
  { type: 'bed-double', x: 4.05, y: 27.8, rot: R90, floor: 'uf' },
];

// Geometry helpers. Plan coordinates are feet: x = east along the plan, y = towards the road.
// Three.js world: X = plan x, Z = plan y, Y = height.
import * as THREE from 'three';

// Wall face material slots used by prism()
export const FACE = { LEFT: 0, RIGHT: 1, TOP: 2, BOTTOM: 3, END: 4 };

// A straight wall piece from plan point a to b, thickness t, bottom zb, top za at a and zb2 at b.
// "Left" is the side of +n where n = (-dy, dx) of a→b. Returns a non-indexed BufferGeometry with
// one material group per face so each side of a wall can be painted separately.
export function prism(a, b, t, zBottom, zTopA, zTopB = zTopA) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const nx = (-dy / L) * (t / 2), ny = (dx / L) * (t / 2);
  // plan corners: aL, bL, bR, aR
  const aL = [a[0] + nx, a[1] + ny], bL = [b[0] + nx, b[1] + ny];
  const aR = [a[0] - nx, a[1] - ny], bR = [b[0] - nx, b[1] - ny];
  const V = (p, h) => [p[0], h, p[1]];
  const pos = [], uv = [], groups = [];
  const quad = (p0, p1, p2, p3, slot, uvs) => {
    const start = pos.length / 3;
    pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    uv.push(...uvs[0], ...uvs[1], ...uvs[2], ...uvs[0], ...uvs[2], ...uvs[3]);
    groups.push([start, 6, slot]);
  };
  const along = (u0, u1, h0, h1, h2, h3) => [[u0, h0], [u1, h1], [u1, h2], [u0, h3]];
  // winding chosen so every face's normal points out of the prism
  quad(V(aL, zBottom), V(bL, zBottom), V(bL, zTopB), V(aL, zTopA), FACE.LEFT, [[0, zBottom], [L, zBottom], [L, zTopB], [0, zTopA]]);
  quad(V(bR, zBottom), V(aR, zBottom), V(aR, zTopA), V(bR, zTopB), FACE.RIGHT, [[L, zBottom], [0, zBottom], [0, zTopA], [L, zTopB]]);
  quad(V(aL, zTopA), V(bL, zTopB), V(bR, zTopB), V(aR, zTopA), FACE.TOP, along(0, L, 0, 0, t, t));
  quad(V(aL, zBottom), V(aR, zBottom), V(bR, zBottom), V(bL, zBottom), FACE.BOTTOM, along(0, t, 0, 0, L, L));
  quad(V(aR, zBottom), V(aL, zBottom), V(aL, zTopA), V(aR, zTopA), FACE.END, along(0, t, zBottom, zBottom, zTopA, zTopA));
  quad(V(bL, zBottom), V(bR, zBottom), V(bR, zTopB), V(bL, zTopB), FACE.END, along(0, t, zBottom, zBottom, zTopB, zTopB));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  g.computeVertexNormals();
  return g;
}

// Ensure a polygon is counter-clockwise when seen from above (+Y), which in plan (x, y) with
// y pointing towards the road means clockwise in standard maths orientation.
function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

// Flat horizontal polygon at height h. faceUp: normal +Y (floor) or -Y (ceiling).
// heightAt(x, y) optionally gives a per-vertex height (used for sloping roof planes).
export function flatPoly(poly, h, faceUp = true, heightAt = null, uvScale = 1) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(shape);
  // ShapeGeometry lies in XY with normal +Z; map shape (x, y) → world (x, h, y)
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, x, heightAt ? heightAt(x, y) : h, y);
    uv.setXY(i, x / uvScale, y / uvScale);
  }
  // Mapping (x, y) → (x, ·, y) mirrors the winding; ShapeGeometry is CCW in XY so after the swap
  // triangles face -Y. Flip for floors.
  if (faceUp) flipWinding(g);
  g.computeVertexNormals();
  return g;
}

export function flipWinding(g) {
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) { const b = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b); }
    idx.needsUpdate = true;
  }
}

// Vertical band around a polygon's edge between z0 and z1 (outward facing), e.g. slab edges.
export function polyEdge(poly, z0, z1) {
  const ccw = signedArea(poly) > 0; // in plan maths orientation
  const pos = [];
  for (let i = 0; i < poly.length; i++) {
    let a = poly[i], b = poly[(i + 1) % poly.length];
    if (ccw) [a, b] = [b, a]; // keeps the band's normals pointing outwards
    pos.push(a[0], z0, a[1], b[0], z0, b[1], b[0], z1, b[1], a[0], z0, a[1], b[0], z1, b[1], a[0], z1, a[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPoly([px, py], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function distToSegment([px, py], a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

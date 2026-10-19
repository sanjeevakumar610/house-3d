// Builds the Three.js model from a plan variant (see variant.js): any number of storeys, a pitched
// roof (as drawn) or a flat roof terrace, and the facade style's frames, glass, railings and cladding.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { prism, FACE, flatPoly, polyEdge, centroid, pointInPoly, distToSegment } from './geom.js';
import { M, floorMaterial, paintMaterial, DEFAULT_WALL, DEFAULT_EXTERIOR, finishMat, glassMaterial, cladMaterial } from './materials.js';
import { buildFacade, buildCanopy } from './facade.js';

const SILL_FRAME = 0.12; // ft, frame section for windows and doors
let SM = null;           // materials of the style being built

const UPPER = new Set(['uf', 'uf2']);
const floorMatch = (rule, fk) => rule === 'all' || (rule === 'upper' ? UPPER.has(fk) : (rule || []).includes(fk));
const orientOf = (nx, ny) => (Math.abs(ny) >= Math.abs(nx) ? (ny > 0 ? 'front' : 'rear') : nx > 0 ? 'east' : 'west');

export function buildHouse(plan) {
  const st = plan.style;
  SM = {
    st,
    frame: st.frame === 'alu' ? M.aluminium : finishMat(st.frame),
    glass: glassMaterial(st.glass),
    rail: st.rail === 'black' ? finishMat('black') : M.rail,
    solid: paintMaterial(st.ext || DEFAULT_EXTERIOR),
    coping: st.features?.some((f) => f.type === 'coping') ? finishMat('terracotta') : null,
  };
  const groups = { ufCeiling: new THREE.Group(), roof: new THREE.Group(), site: new THREE.Group(), labels: {} };
  groups.ufCeiling.name = 'ufCeiling'; groups.roof.name = 'roof'; groups.site.name = 'site';
  for (const fk of plan.floorKeys) {
    groups[fk] = new THREE.Group(); groups[fk].name = fk;
    groups.labels[fk] = new THREE.Group(); groups.labels[fk].name = 'labels-' + fk;
  }
  const root = new THREE.Group();
  for (const fk of plan.floorKeys) root.add(groups[fk], groups.labels[fk]);
  root.add(groups.ufCeiling, groups.roof, groups.site);

  const rooms = [];   // { id, floor, data, floorMesh, finish }
  const walls = [];   // { id, floor, data, meshes, clipped }
  const faces = new Map(); // paintable wall faces, see faceFor()
  const clad = {};    // cladding sq ft: { mat: { floor: area } }
  const extras = [];  // facade items for the cost tab: { key, sec, qty, note }

  // roof height (underside of sheets) at plan y, for the pitched roof
  const R = plan.roof;
  const roofZ = (y) => {
    const t = y <= R.ridgeY
      ? (y - R.wallLineNorth) / (R.ridgeY - R.wallLineNorth)
      : (R.wallLineSouth - y) / (R.wallLineSouth - R.ridgeY);
    return R.eaves + (R.ridge - R.eaves) * t;
  };

  // ------------------------------------------------------------------ floors (slabs)
  for (const fk of plan.floorKeys) {
    const fl = plan.floors[fk], m = plan.meta[fk], group = groups[fk];
    for (const r of fl.rooms) {
      const finish = r.wet ? 'bathTiles' : r.stair ? null : r.id === 'gf-carporch' ? 'paving'
        : r.terrace ? (st.terraceFinish || 'bathTiles') : r.outdoor && fk !== 'gf' ? 'bathTiles' : 'tiles';
      const top = r.level;
      const mat = finish ? floorMaterial(finish) : M.stair;
      const floorMesh = new THREE.Mesh(flatPoly(r.poly, top, true), mat);
      floorMesh.receiveShadow = true;
      floorMesh.userData = { type: 'floor', roomId: r.id, floor: fk };
      group.add(floorMesh);
      if (!r.noSlab) {
        const bottom = fk === 'gf' ? 0 : m.zb - (m.ffl - r.level);
        group.add(new THREE.Mesh(polyEdge(r.poly, bottom, top), fk === 'gf' ? M.plinth : M.slabEdge));
        // underside of an upper floor slab is the ceiling of the floor below
        if (fk !== 'gf') group.add(new THREE.Mesh(flatPoly(r.poly, bottom, false), M.ceiling));
      }
      if (m.roofOver && !r.outdoor) {
        const ceil = new THREE.Mesh(flatPoly(r.poly, m.ceil - 0.02, false), M.ceiling);
        ceil.userData = { type: 'ceiling', roomId: r.id };
        groups.ufCeiling.add(ceil);
      }
      rooms.push({ id: r.id, floor: fk, data: r, floorMesh, finish });

      const label = document.createElement('div');
      label.className = 'room-label';
      label.textContent = r.name;
      const obj = new CSS2DObject(label);
      const [cx, cy] = centroid(r.poly);
      obj.position.set(cx, top + 0.3, cy);
      if (!(r.terrace && r.area < 30)) groups.labels[fk].add(obj);
    }
    // ceiling over the stair well under the pitched roof
    if (m.roofOver) for (const v of fl.voids) if (v.id === 'stairwell') groups.ufCeiling.add(new THREE.Mesh(flatPoly(v.poly, m.ceil - 0.02, false), M.ceiling));
  }

  // ------------------------------------------------------------------ walls
  for (const fk of plan.floorKeys) {
    const fl = plan.floors[fk], m = plan.meta[fk], group = groups[fk];
    const ffl = m.ffl, zb = m.zb, ceilingZ = m.ceil;
    const indoor = fl.rooms.filter((r) => !r.outdoor).map((r) => r.poly).concat(fl.voids.map((v) => v.poly));
    const isIndoor = (p) => indoor.some((poly) => pointInPoly(p, poly));

    for (const w of fl.walls) {
      const [ax, ay] = w.a, [bx, by] = w.b;
      const len = w.length, ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
      const at = (s) => [ax + ux * s, ay + uy * s];

      // extend ends that butt into another wall so corners close
      const ext = (P) => {
        let e = 0;
        for (const v of fl.walls) {
          if (v === w || v.kind === 'screen') continue;
          if (distToSegment(P, v.a, v.b) > v.thickness / 2 + 0.03) continue;
          const vx = (v.b[0] - v.a[0]) / v.length, vy = (v.b[1] - v.a[1]) / v.length;
          const sin = Math.abs(ux * vy - uy * vx);
          if (sin < 0.5) continue;
          e = Math.max(e, Math.min(v.thickness / 2 / sin - 0.01, 0.6));
        }
        return e;
      };
      const e0 = w.kind === 'screen' ? 0 : ext(w.a);
      const e1 = w.kind === 'screen' ? 0 : ext(w.b);

      // which side faces outside (decides whether this wall rises to the roof)
      const mid = at(len / 2), off = w.thickness / 2 + 0.4;
      const leftOut = !isIndoor([mid[0] + nx * off, mid[1] + ny * off]);
      const rightOut = !isIndoor([mid[0] - nx * off, mid[1] - ny * off]);

      if (w.kind === 'screen') { group.add(timberScreen(w, at, ux, uy, ffl, ceilingZ)); continue; }
      if (w.kind === 'parapet' && /rail|bal/.test(w.id)) {
        const external = /bal|rf-rail/.test(w.id);
        group.add(railing(at(-e0), at(len + e1), ffl, w.height, external ? st.rail : 'steel', zb));
        continue;
      }

      const followsRoof = m.roofOver && w.kind === 'wall' && (leftOut || rightOut);
      const topAt = (s) => {
        if (w.height != null) return ffl + w.height;
        return followsRoof ? Math.max(ceilingZ, roofZ(at(s)[1]) - 0.05) : ceilingZ;
      };

      // Each side of the wall is split by the room it faces, so a wall shared by two rooms can be
      // painted per room. A face is identified by wall + side + room ("ext" when it faces outside).
      const sideKey = (s, sign) => {
        const p = [ax + ux * s + nx * sign * off, ay + uy * s + ny * sign * off];
        const r = roomAtFloor(fl, p);
        if (r) return r.id;
        const v = fl.voids.find((q) => pointInPoly(p, q.poly));
        return v ? 'void-' + v.id : 'ext';
      };
      const orient = { L: orientOf(nx, ny), R: orientOf(-nx, -ny) };
      const faceFor = (side, roomKey) => {
        const key = `${w.id}|${side}|${roomKey}`;
        if (!faces.has(key)) {
          const room = fl.rooms.find((q) => q.id === roomKey) || null;
          const voidArea = roomKey.startsWith('void-') ? fl.voids.find((q) => 'void-' + q.id === roomKey) : null;
          const exterior = room ? !!room.outdoor : !voidArea;
          let color = exterior ? (st.ext || DEFAULT_EXTERIOR) : DEFAULT_WALL;
          if (exterior) for (const p of st.paint || []) if (floorMatch(p.floors, fk) && (p.orient === 'all' || p.orient.includes(orient[side])) && (!p.walls || p.walls.test(w.id))) color = p.color;
          faces.set(key, { key, wallId: w.id, floor: fk, side, orient: orient[side], roomId: room ? room.id : voidArea ? roomKey : null, roomName: room ? room.name : voidArea ? voidArea.name : 'Exterior', exterior, area: 0, cladArea: 0, defaultColor: color, material: paintMaterial(color) });
        }
        return faces.get(key);
      };
      // cladding bands that cover this outside face
      const cladFor = (f) => {
        if (!f.exterior) return [];
        const out = [];
        for (const c of st.clad || []) {
          if (!floorMatch(c.floors, fk) || !(c.orient === 'all' || c.orient.includes(f.orient)) || (c.walls && !c.walls.test(w.id))) continue;
          out.push({ mat: c.mat, z0: c.z ? ffl + c.z[0] : -Infinity, z1: c.z ? ffl + c.z[1] : Infinity });
        }
        return out;
      };

      const rec = { id: w.id, floor: fk, data: w, meshes: [], clipped: [] };
      walls.push(rec);

      // break points along the wall: ends, ridge crossing (so tops stay planar), openings, room changes
      const cuts = [-e0, len + e1];
      if (followsRoof) {
        const sR = Math.abs(uy) > 1e-6 ? (R.ridgeY - ay) / uy : NaN;
        if (sR > 0 && sR < len) cuts.push(sR);
      }
      const ops = w.openings.slice().sort((p, q) => p.from - q.from);
      for (const o of ops) cuts.push(o.from, o.to);
      for (const sign of [1, -1]) {
        let prev = sideKey(-e0 + 0.05, sign);
        for (let sx = -e0 + 0.25; sx < len + e1 - 0.05; sx += 0.2) {
          const k = sideKey(sx, sign);
          if (k !== prev) { cuts.push(sx - 0.1); prev = k; }
        }
      }
      const uniq = [...new Set(cuts.map((c) => +c.toFixed(3)))].sort((p, q) => p - q);

      const addPiece = (s0, s1, z0, z1a, z1b) => {
        if (s1 - s0 < 0.005 || z1a - z0 < 0.005) return;
        const sm = (s0 + s1) / 2;
        const fL = faceFor('L', sideKey(sm, 1)), fR = faceFor('R', sideKey(sm, -1));
        const mats = [];
        mats[FACE.LEFT] = fL.material; mats[FACE.RIGHT] = fR.material;
        mats[FACE.TOP] = M.plaster; mats[FACE.BOTTOM] = M.plaster; mats[FACE.END] = M.plaster;
        // paintable area of each side: from floor (or ground, outside) up to ceiling (or wall top, outside)
        for (const f of [fL, fR]) {
          const from = Math.max(z0, f.exterior ? 0 : ffl);
          const to = f.exterior ? (z1a + z1b) / 2 : Math.min((z1a + z1b) / 2, ceilingZ);
          if (to > from) f.area += (s1 - s0) * (to - from);
        }
        const mesh = new THREE.Mesh(prism(at(s0), at(s1), w.thickness, z0, z1a, z1b), mats);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData = { type: 'wall', wallId: w.id, floor: fk, faces: { [FACE.LEFT]: fL.key, [FACE.RIGHT]: fR.key } };
        group.add(mesh);
        rec.meshes.push(mesh);
        // cladding laid over outside faces
        for (const [f, sign] of [[fL, 1], [fR, -1]]) {
          for (const c of cladFor(f)) {
            const za = Math.max(z0, c.z0, f.exterior ? 0 : ffl), zt = Math.min(Math.min(z1a, z1b), c.z1);
            if (zt - za < 0.05) continue;
            const ov = new THREE.Mesh(overlayQuad(at(s0), at(s1), s0, s1, w.thickness, sign, za, zt), cladMaterial(c.mat));
            ov.receiveShadow = true;
            ov.userData = { type: 'clad', clad: c.mat, wallId: w.id, floor: fk };
            group.add(ov);
            const a = (s1 - s0) * (zt - za);
            f.cladArea += a;
            (clad[c.mat] ||= {})[fk] = ((clad[c.mat] || {})[fk] || 0) + a;
          }
        }
      };

      for (let i = 0; i < uniq.length - 1; i++) {
        const s0 = uniq[i], s1 = uniq[i + 1], sm = (s0 + s1) / 2;
        const here = ops.filter((q) => sm > q.from && sm < q.to).sort((p, q) => p.sill - q.sill);
        const t0 = topAt(s0), t1 = topAt(s1);
        if (!here.length) { addPiece(s0, s1, zb, t0, t1); continue; }
        // one or more openings stacked in this span (a vent above a sliding door, say)
        let z = zb;
        for (const o of here) {
          const sillZ = ffl + o.sill;
          let headZ = sillZ + o.height;
          const room = Math.min(t0, t1) - 0.25;
          if (headZ > room) { headZ = room; rec.clipped.push(o.tag); }
          if (headZ <= sillZ + 0.3 || sillZ < z - 0.01) continue; // no room for it
          addPiece(s0, s1, z, sillZ, sillZ);
          // opening fills are drawn once per opening, not per room-split piece
          if (Math.abs(s0 - o.from) < 0.01) group.add(openingFill(o, at(o.from), at(o.to), ux, uy, w.thickness, sillZ, headZ));
          z = headZ;
        }
        addPiece(s0, s1, z, t0, t1);
      }
    }

    // columns (9" × 9")
    const ch = [zb, ceilingZ];
    for (const [x, y] of fl.columns) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.75, ch[1] - ch[0], 0.75), M.column);
      c.position.set(x, (ch[0] + ch[1]) / 2, y);
      c.castShadow = true;
      group.add(c);
    }
  }

  plan.stairs.forEach((S, i) => groups[S.from].add(buildStair(plan, S, i)));
  if (plan.flat) buildTerrace(plan, groups.rf);
  else buildRoof(plan, groups.roof, roofZ);
  buildCanopy(plan, groups.roof, SM);
  buildSite(plan, groups.site);

  const house = { root, groups, rooms, walls, faces, roofZ, clad, extras };
  buildFacade(plan, house, SM);
  return house;
}

function roomAtFloor(fl, p) {
  return fl.rooms.find((r) => pointInPoly(p, r.poly)) || null;
}

// flat quad laid on one side of a wall piece (sign +1 = left face), slightly proud of it
function overlayQuad(a, b, s0, s1, t, sign, z0, z1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const o = sign * (t / 2 + 0.015), nx = (-dy / L) * o, ny = (dx / L) * o;
  const A = [a[0] + nx, a[1] + ny], B = [b[0] + nx, b[1] + ny];
  const V = (p, h) => [p[0], h, p[1]];
  const q = sign > 0 ? [V(A, z0), V(B, z0), V(B, z1), V(A, z1)] : [V(B, z0), V(A, z0), V(A, z1), V(B, z1)];
  const uv = sign > 0 ? [[s0, z0], [s1, z0], [s1, z1], [s0, z1]] : [[s1, z0], [s0, z0], [s0, z1], [s1, z1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([...uv[0], ...uv[1], ...uv[2], ...uv[0], ...uv[2], ...uv[3]], 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ openings
export function orientedBox(w, h, d, cx, cy, cz, ux, uy, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  m.rotation.y = -Math.atan2(uy, ux);
  return m;
}

function openingFill(o, a, b, ux, uy, t, z0, z1) {
  const g = new THREE.Group();
  const w = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  const h = z1 - z0, f = SILL_FRAME;
  if (o.kind === 'arch') return g;
  if (o.kind === 'vent') return ventFill(o, w, h, cx, cy, z0, ux, uy, t);
  const frameMat = o.kind === 'door' ? M.timber : SM.frame;
  const depth = o.kind === 'door' ? t : 0.25;
  // jambs and head
  g.add(orientedBox(f, h, depth, cx - ux * (w / 2 - f / 2), z0 + h / 2, cy - uy * (w / 2 - f / 2), ux, uy, frameMat));
  g.add(orientedBox(f, h, depth, cx + ux * (w / 2 - f / 2), z0 + h / 2, cy + uy * (w / 2 - f / 2), ux, uy, frameMat));
  g.add(orientedBox(w, f, depth, cx, z1 - f / 2, cy, ux, uy, frameMat));
  if (o.kind === 'door') return g; // doorways are left open so you can walk through
  g.add(orientedBox(w, f, depth, cx, z0 + f / 2, cy, ux, uy, frameMat));
  // sashes: vertical mullions between panes
  const base = o.tag.replace(/[A-Z]$/, '');
  const panes = o.kind === 'fixed' ? 1 : base.startsWith('SD') ? (o.width > 6 ? 3 : 2) : base === 'W02' ? 2 : base === 'F01' || base === 'W06' || base === 'W09' ? 1 : base === 'W08' ? 3 : 2;
  for (let i = 1; i < panes; i++) {
    const s = -w / 2 + (w * i) / panes;
    g.add(orientedBox(f * 0.6, h, depth * 0.8, cx + ux * s, z0 + h / 2, cy + uy * s, ux, uy, frameMat));
  }
  // steel-look grid: glazing bars about every 1'-3"
  if (o.grid) {
    const cols = Math.max(2, Math.round(w / 1.25)), rows = Math.max(2, Math.round(h / 1.4));
    for (let i = 1; i < cols; i++) { const s = -w / 2 + (w * i) / cols; g.add(orientedBox(0.04, h, 0.06, cx + ux * s, z0 + h / 2, cy + uy * s, ux, uy, frameMat)); }
    for (let j = 1; j < rows; j++) g.add(orientedBox(w, 0.04, 0.06, cx, z0 + (h * j) / rows, cy, ux, uy, frameMat));
  }
  const glass = orientedBox(w - 2 * f, h - 2 * f, 0.03, cx, z0 + h / 2, cy, ux, uy, SM.glass);
  glass.userData = { type: 'glass' };
  g.add(glass);
  if (o.arched) g.add(archSpandrel(w, h, cx, cy, z0, ux, uy, t));
  return g;
}

// louvre blades (or a breeze-block panel) in the vent band above a sliding door
function ventFill(o, w, h, cx, cy, z0, ux, uy, t) {
  const g = new THREE.Group();
  if (o.vent === 'jali') {
    const p = orientedBox(w, h, t * 0.9, cx, z0 + h / 2, cy, ux, uy, finishMat('jali'));
    g.add(p);
    return g;
  }
  const n = Math.max(3, Math.round(h / 0.22));
  for (let i = 0; i < n; i++) {
    const blade = orientedBox(w, 0.04, 0.22, cx, z0 + (h * (i + 0.5)) / n, cy, ux, uy, SM.frame);
    blade.rotateX(-0.5);
    g.add(blade);
  }
  g.add(orientedBox(w, 0.08, 0.25, cx, z0 + 0.04, cy, ux, uy, SM.frame));
  g.add(orientedBox(w, 0.08, 0.25, cx, z0 + h - 0.04, cy, ux, uy, SM.frame));
  return g;
}

// the two curved corners that turn a rectangular opening into an arch
function archSpandrel(w, h, cx, cy, z0, ux, uy, t) {
  const rise = Math.min(w / 2, 1.25, h * 0.3);
  const R = (rise * rise + (w / 2) * (w / 2)) / (2 * rise), yc = h - 0.04 - R;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h); s.lineTo(w / 2, h); s.lineTo(w / 2, h - rise - 0.04);
  const a0 = Math.atan2(h - rise - 0.04 - yc, w / 2), a1 = Math.PI - a0;
  for (let i = 0; i <= 24; i++) { const a = a0 + ((a1 - a0) * i) / 24; s.lineTo(R * Math.cos(a), yc + R * Math.sin(a)); }
  s.lineTo(-w / 2, h);
  const geo = new THREE.ExtrudeGeometry(s, { depth: t + 0.02, bevelEnabled: false });
  geo.translate(0, 0, -(t + 0.02) / 2);
  const m = new THREE.Mesh(geo, SM.solid);
  m.position.set(cx, z0, cy);
  m.rotation.y = -Math.atan2(uy, ux);
  m.castShadow = true;
  return m;
}

function timberScreen(w, at, ux, uy, ffl, top) {
  const g = new THREE.Group();
  const slat = 0.12, gap = 0.18;
  const h = top - ffl;
  for (let s = 0.06; s < w.length; s += slat + gap) {
    const [x, y] = at(s + slat / 2);
    g.add(orientedBox(slat, h, w.thickness * 0.8, x, ffl + h / 2, y, ux, uy, M.screen));
  }
  const [mx, my] = at(w.length / 2);
  g.add(orientedBox(w.length, 0.2, w.thickness, mx, top - 0.1, my, ux, uy, M.screen));
  return g;
}

// balcony, terrace and stair-well guards in the style's railing type
function railing(a, b, ffl, height, type = 'steel', zb = ffl) {
  const g = new THREE.Group();
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const top = ffl + height;
  const bars = (mat) => {
    g.add(orientedBox(len, 0.12, 0.18, mx, top - 0.06, my, ux, uy, mat));
    g.add(orientedBox(len, 0.08, 0.1, mx, ffl + 0.3, my, ux, uy, mat));
    for (let s = 0.25; s < len; s += 0.4) g.add(orientedBox(0.05, height, 0.05, a[0] + ux * s, ffl + height / 2, a[1] + uy * s, ux, uy, mat));
  };
  const glass = (rail) => {
    const p = orientedBox(len, height - 0.15, 0.05, mx, ffl + (height - 0.15) / 2 + 0.05, my, ux, uy, SM.glass);
    p.userData = { type: 'glass' };
    g.add(p);
    g.add(orientedBox(len, 0.12, 0.14, mx, ffl + 0.06, my, ux, uy, rail));
    g.add(orientedBox(len, 0.07, 0.1, mx, top - 0.04, my, ux, uy, rail));
  };
  const solid = (h) => {
    const s = orientedBox(len, h + (ffl - zb), 0.5, mx, zb + (h + ffl - zb) / 2, my, ux, uy, SM.solid);
    s.castShadow = s.receiveShadow = true;
    g.add(s);
    if (SM.coping) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len, 12, 1, false, 0, Math.PI), SM.coping);
      c.rotation.set(0, -Math.atan2(uy, ux), Math.PI / 2);
      c.position.set(mx, ffl + h, my);
      g.add(c);
    }
  };
  switch (type) {
    case 'glass': glass(M.aluminium); break;
    case 'glassGold': glass(finishMat('gold')); break;
    case 'glassSolid': solid(1.6); glass(finishMat('black')); break;
    case 'solid': solid(height); break;
    case 'planter': {
      solid(2.4);
      for (let s = 0.5; s < len - 0.3; s += 0.9) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + ((s * 7) % 3) * 0.06, 0), finishMat(s % 2 > 1 ? 'plant2' : 'plant'));
        bush.position.set(a[0] + ux * s, ffl + 2.75, a[1] + uy * s);
        bush.scale.y = 0.75;
        g.add(bush);
      }
      break;
    }
    case 'timber': {
      const t = finishMat('timber');
      for (const z of [0.5, 1.2, 1.9, 2.6]) g.add(orientedBox(len, 0.35, 0.1, mx, ffl + z, my, ux, uy, t));
      g.add(orientedBox(len, 0.12, 0.3, mx, top - 0.06, my, ux, uy, t));
      for (let s = 0.1; s < len; s += 3) g.add(orientedBox(0.15, height, 0.15, a[0] + ux * s, ffl + height / 2, a[1] + uy * s, ux, uy, finishMat('black')));
      break;
    }
    case 'vslats': {
      const t = finishMat('timber');
      for (let s = 0.08; s < len; s += 0.28) g.add(orientedBox(0.12, height, 0.12, a[0] + ux * s, ffl + height / 2, a[1] + uy * s, ux, uy, t));
      g.add(orientedBox(len, 0.12, 0.16, mx, top - 0.06, my, ux, uy, finishMat('black')));
      break;
    }
    case 'black': bars(finishMat('black')); break;
    default: bars(M.rail);
  }
  return g;
}

// ------------------------------------------------------------------ stairs
// Treads as plan rectangles with their top height. Steps 1-7 run west, 8-11 are winders at the
// west end, 12-18 run east and arrive at the floor above. Shared with the walk controller.
export function stairSteps(S) {
  const steps = [];
  const add = (n, x0, x1, y0, y1, solid) => steps.push({
    n, x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), top: S.base + n * S.riser, solid,
  });
  for (let n = 1; n <= 7; n++) add(n, S.lower.x[n - 1], S.lower.x[n], S.lower.y, S.lower.y2, S.solidLower);
  const wy0 = S.winder.y, wy1 = S.winder.y2, strip = (wy1 - wy0) / 4;
  for (let k = 0; k < 4; k++) add(8 + k, S.winder.x, S.winder.x2, wy1 - (k + 1) * strip, wy1 - k * strip, S.solidLower && k < 2);
  for (let n = 12; n <= 18; n++) add(n, S.upper.x[n - 12], S.upper.x[n - 11], S.upper.y, S.upper.y2, false);
  return steps;
}

const LANDING = { uf: 'uf-landing', uf2: 'u2-landing', rf: 'rf-landing' };

function buildStair(plan, S, idx) {
  const g = new THREE.Group();
  g.name = 'stair';
  const waist = 0.45;
  for (const st of stairSteps(S)) {
    const bottom = st.solid ? S.base : st.top - S.riser - waist;
    const m = new THREE.Mesh(new THREE.BoxGeometry(st.x1 - st.x0, st.top - bottom, st.y1 - st.y0), M.stair);
    m.position.set((st.x0 + st.x1) / 2, (st.top + bottom) / 2, (st.y0 + st.y1) / 2);
    m.castShadow = m.receiveShadow = true;
    const roomId = idx === 0 && st.top <= plan.levels.gf + 5 ? 'gf-stair' : LANDING[S.to];
    m.userData = { type: 'stair', step: st.n, top: st.top, roomId };
    g.add(m);
  }

  const rail = (x0, z0, x1, z1, y) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), M.rail);
    m.position.set((x0 + x1) / 2, (z0 + z1) / 2, y);
    m.rotation.z = Math.atan2(z1 - z0, x1 - x0) - Math.PI / 2;
    g.add(m);
    const posts = Math.max(2, Math.round(len / 2.5));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), M.rail);
      p.position.set(x, z - 1.5, y);
      g.add(p);
    }
  };
  const h = 3;
  if (idx === 0) {
    // open (living room) side of the upper flight and the car-porch side of the lower flight
    rail(S.upper.x[0], S.base + 11 * S.riser + h, S.upper.x[7], S.base + 18 * S.riser + h, S.upper.y + 0.1);
    rail(S.lower.x[0], S.base + h, S.lower.x[7], S.base + 7 * S.riser + h, S.lower.y2 - 0.1);
  } else {
    // stacked flights: one rail each side of the gap between them
    rail(S.lower.x[0], S.base + h, S.lower.x[7], S.base + 7 * S.riser + h, S.lower.y + 0.08);
    rail(S.upper.x[0], S.base + 11 * S.riser + h, S.upper.x[7], S.base + 18 * S.riser + h, S.upper.y2 - 0.08);
  }
  return g;
}

// ------------------------------------------------------------------ pitched roof + tank room
function buildRoof(plan, group, roofZ) {
  const R = plan.roof;
  const sheet = 0.12;
  for (const poly of [R.north, R.south]) {
    const top = new THREE.Mesh(flatPoly(poly, 0, true, (x, y) => roofZ(y) + sheet), M.roof);
    top.castShadow = true; top.receiveShadow = true;
    group.add(top);
    group.add(new THREE.Mesh(flatPoly(poly, 0, false, (x, y) => roofZ(y)), M.roofUnder));
  }
  // tank room: walls from the top floor ceiling to its top, RCC slab with the tank
  const T = R.tankRoom;
  const [x0, y0] = T.poly[0], [x1, y1] = T.poly[2];
  const t = 0.5, zc = R.eaves;
  const wallsT = [[[x0, y0 + t / 2], [x1, y0 + t / 2]], [[x1 - t / 2, y0], [x1 - t / 2, y1]], [[x1, y1 - t / 2], [x0, y1 - t / 2]], [[x0 + t / 2, y1], [x0 + t / 2, y0]]];
  for (const [a, b] of wallsT) {
    const m = new THREE.Mesh(prism(a, b, t, zc, T.top), [M.plaster, M.plaster, M.plaster, M.plaster, M.plaster]);
    m.castShadow = true;
    group.add(m);
  }
  // tank floor slab with the glass-covered light well cut out
  const lw = plan.floors[plan.top].voids.find((v) => v.id === 'lightwell').poly;
  const slabShape = new THREE.Shape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => new THREE.Vector2(x, y)));
  slabShape.holes.push(new THREE.Path(lw.map(([x, y]) => new THREE.Vector2(x, y))));
  const sg = new THREE.ShapeGeometry(slabShape);
  const p = sg.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), T.floor, p.getY(i));
  const idx = sg.index; for (let i = 0; i < idx.count; i += 3) { const b2 = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b2); }
  sg.computeVertexNormals();
  group.add(new THREE.Mesh(sg, M.concrete));
  group.add(new THREE.Mesh(flatPoly(lw, T.floor, true), M.glass));
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 4, 24), M.tank);
  tank.position.set(5.5, T.floor + 2, 14.86);
  tank.castShadow = true;
  group.add(tank);
}

// ------------------------------------------------------------------ flat roof terrace
// Roof slab (with its overhang and fascia), stair-head room slab with the water tank on top, and a
// louvred skylight over the light well that lets hot air out.
function buildTerrace(plan, group) {
  const T = plan.floors.rf.terrace, m = plan.meta.rf, st = plan.style;
  const z = m.ffl - 0.02;
  const fasciaH = Math.max(plan.slab, st.fascia?.h || plan.slab);
  const shape = new THREE.Shape(T.slab.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of T.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: fasciaH, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); // shape (x, y) → world (x, -depth..0, y)
  geo.translate(0, z, 0);
  const slab = new THREE.Mesh(geo, [M.ceiling, finishMat(st.fascia?.mat || 'white')]);
  slab.castShadow = slab.receiveShadow = true;
  slab.userData = { type: 'roofslab' };
  group.add(slab);

  // stair-head room roof and the water tank
  const H = T.head;
  const hs = new THREE.Mesh(new THREE.BoxGeometry(H.x1 - H.x0 + 0.6, 0.45, H.y1 - H.y0 + 0.6), finishMat(st.fascia?.mat || 'white'));
  hs.position.set((H.x0 + H.x1) / 2, H.top + 0.225, (H.y0 + H.y1) / 2);
  hs.castShadow = true;
  group.add(hs);
  const under = new THREE.Mesh(flatPoly([[H.x0, H.y0], [H.x1, H.y0], [H.x1, H.y1], [H.x0, H.y1]], H.top - 0.01, false), M.ceiling);
  group.add(under);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 4, 24), M.tank);
  tank.position.set(4.2, H.top + 0.45 + 2, 20.1);
  tank.castShadow = true;
  group.add(tank);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 4.2), M.concrete);
  stand.position.set(4.2, H.top + 0.6, 20.1);
  group.add(stand);

  // louvred skylight box over the light well: glass on top, louvres on three sides
  const S = T.sky, base = m.ffl + S.curb, topZ = m.ffl + S.top;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0 + 0.4, 0.08, S.y1 - S.y0 + 0.4), M.glass);
  glass.position.set((S.x0 + S.x1) / 2, topZ + 0.04, (S.y0 + S.y1) / 2);
  glass.userData = { type: 'glass' };
  group.add(glass);
  const frame = SM.frame;
  const sides = [[[S.x0, S.y0], [S.x1, S.y0]], [[S.x1, S.y0], [S.x1, S.y1]], [[S.x1, S.y1], [S.x0, S.y1]]];
  for (const [a, b] of sides) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    for (let zz = base + 0.15; zz < topZ - 0.05; zz += 0.25) {
      const bl = orientedBox(len, 0.04, 0.22, cx, zz, cy, ux, uy, frame);
      bl.rotateX(-0.5);
      group.add(bl);
    }
    group.add(orientedBox(0.12, topZ - base, 0.12, a[0], (base + topZ) / 2, a[1], ux, uy, frame));
  }
}

// ------------------------------------------------------------------ site
function buildSite(plan, group) {
  const S = plan.site;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(12, -0.05, 20);
  ground.receiveShadow = true;
  group.add(ground);
  const plot = new THREE.Mesh(flatPoly(S.plot, -0.02, true), M.plot);
  plot.receiveShadow = true;
  group.add(plot);
  group.add(new THREE.Mesh(flatPoly(S.road, -0.01, true), M.road));
  // boundary walls on the three non-road sides
  const P = S.plot, t = 0.375;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if (Math.abs(a[1] - S.road[0][1]) < 0.01 && Math.abs(b[1] - S.road[0][1]) < 0.01) continue; // road edge
    const m = new THREE.Mesh(prism(a, b, t, 0, S.boundaryHeight), [M.boundary, M.boundary, M.boundary, M.boundary, M.boundary]);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  const [l0, l1] = S.buildingLine;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(l0[0], 0.05, l0[1]), new THREE.Vector3(l1[0], 0.05, l1[1])]), M.line);
  line.computeLineDistances();
  group.add(line);
}

// free GPU memory of a house that is being replaced (shared materials are kept)
export function disposeHouse(house) {
  const shared = new Set(Object.values(M));
  house.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.element) o.element.remove();
  });
  for (const f of house.faces.values()) if (!shared.has(f.material)) f.material.dispose();
  house.root.removeFromParent();
}

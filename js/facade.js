// Style features: fins, frames, screens, planters, green wall, trims, sunshade blades, pergola,
// plants, front gate, zen garden, lights and the car porch canopy. Each feature also records its
// quantity in house.extras so the Cost tab can price the look.
import * as THREE from 'three';
import { flatPoly, polyEdge } from './geom.js';
import { M, finishMat, cladMaterial } from './materials.js';
import { upperOutline, offsetPoly } from './variant.js';

const CLAD_KEYS = new Set(['brick', 'stoneDark', 'stoneLight', 'stoneWarm', 'stoneBlack', 'concrete', 'timber', 'charred']);
const mat = (k) => (CLAD_KEYS.has(k) ? cladMaterial(k) : finishMat(k));

function box(w, h, d, x, y, z, m, rotY = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.rotation.y = rotY;
  b.castShadow = true; b.receiveShadow = true;
  return b;
}
// a box spanning plan x0..x1, y0..y1 and height z0..z1
const span = (x0, x1, y0, y1, z0, z1, m) => box(Math.abs(x1 - x0), Math.abs(z1 - z0), Math.abs(y1 - y0), (x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2, m);

// vertical panel facing the road (+y) or sideways (+x), uv in feet so textures keep their scale
function panel(w, h, m, x, z, y, facing = 'y') {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  const p = new THREE.Mesh(g, m);
  p.position.set(x, z, y);
  if (facing === 'x') p.rotation.y = Math.PI / 2;
  p.receiveShadow = true;
  return p;
}

// front balconies of every upper floor
function fronts(plan) {
  const out = [];
  plan.floorKeys.forEach((fk, i) => {
    if (fk !== 'uf' && fk !== 'uf2') return;
    const fl = plan.floors[fk], m = plan.meta[fk], p = fk === 'uf' ? 'uf' : 'u2';
    const W = (s) => fl.walls.find((w) => w.id === `${p}-${s}`);
    const next = plan.floorKeys[i + 1];
    const top = next ? plan.meta[next].zb : m.ceil;
    const b3 = W('bal3-front'), b4 = W('bal4-front');
    out.push({
      fk, m, top, isTop: fk === plan.top,
      bal3: { x0: 10.51, x1: b3.b[0] + 0.2, y: b3.a[1] + 0.25, inner: 29.628, wall: W('bed3-south') },
      bal4: { x0: 0, x1: 10.51, y: b4.a[1] + 0.25, inner: 32.633, wall: W('bed4-south') },
    });
  });
  return out;
}

export function buildFacade(plan, house, SM) {
  const st = plan.style;
  const G = house.groups;
  const extra = (key, sec, qty, note) => { if (qty > 0) house.extras.push({ key, sec, qty, note }); };
  const F = fronts(plan);
  const fascia = Math.max(plan.slab, st.fascia?.h || plan.slab);
  const topOf = (f) => f.top + (f.isTop && plan.flat ? fascia : plan.slab);

  for (const ft of st.features || []) {
    switch (ft.type) {
      case 'fins': {
        let run = 0;
        for (const f of F) {
          const b = f[ft.at], z0 = f.m.zb, z1 = topOf(f), m = mat(ft.mat);
          for (let x = b.x0 + 0.35; x < b.x1 - 0.2; x += ft.spacing) {
            G[f.fk].add(span(x - ft.width / 2, x + ft.width / 2, b.y + 0.35, b.y + 0.35 + ft.depth, z0, z1, m));
            run += z1 - z0;
          }
        }
        extra(ft.mat === 'gold' ? 'finsGold' : 'fins', 'ext', run);
        break;
      }
      case 'frames': {
        let vol = 0;
        const T = ft.thick, P = ft.project, m = mat(ft.mat);
        for (const f of F) for (const b of [f.bal3, f.bal4]) {
          const y0 = b.inner, y1 = b.y + P, z0 = f.m.zb - 0.35, z1 = topOf(f) + 0.35;
          const parts = [
            [b.x0, b.x0 + T, y0, y1, z0, z1], [b.x1 - T, b.x1, y0, y1, z0, z1],
            [b.x0, b.x1, y0, y1, z1 - T, z1], [b.x0, b.x1, b.y - 0.1, y1, z0, f.m.ffl + 0.35],
          ];
          for (const [a, c, d, e, g, h] of parts) { G[f.fk].add(span(a, c, d, e, g, h, m)); vol += Math.abs((c - a) * (e - d) * (h - g)); }
        }
        extra('frameConcrete', 'ext', vol * 0.55, 'hollow box frames, about 55% solid');
        break;
      }
      case 'screen': {
        if (ft.at === 'stairhead') break; // built as breeze-block panels in the stair-head wall
        let area = 0;
        for (const f of F) {
          const b = f[ft.at], z0 = f.m.ffl - 0.2, z1 = topOf(f) - 0.1, y = b.y + 0.6;
          const w = b.x1 - b.x0 - 0.3;
          if (ft.kind === 'vslats') {
            const cover = ft.cover || 1, wc = w * cover, start = ft.at === 'bal4' ? b.x0 + 0.15 : b.x1 - 0.15 - wc;
            const t = mat(ft.mat);
            for (let x = start; x < start + wc; x += 0.27) G[f.fk].add(span(x, x + 0.15, y - 0.08, y + 0.08, z0, z1, t));
            G[f.fk].add(span(start, start + wc, y - 0.1, y + 0.1, z1 - 0.15, z1, finishMat('black')));
            area += wc * (z1 - z0);
          } else {
            G[f.fk].add(panel(w, z1 - z0, mat(ft.mat), (b.x0 + b.x1) / 2, (z0 + z1) / 2, y));
            const fr = finishMat('black');
            G[f.fk].add(span(b.x0 + 0.1, b.x1 - 0.1, y - 0.06, y + 0.06, z1 - 0.12, z1, fr));
            G[f.fk].add(span(b.x0 + 0.1, b.x1 - 0.1, y - 0.06, y + 0.06, z0, z0 + 0.12, fr));
            area += w * (z1 - z0);
          }
        }
        extra(ft.kind === 'perforated' ? 'perfScreen' : ft.kind === 'jali' ? 'jali' : 'screen', 'ext', area);
        break;
      }
      case 'planters': {
        let run = 0;
        const m = mat(ft.mat);
        const trough = (g, x0, x1, y0, y1, z) => {
          g.add(span(x0, x1, y0, y1, z, z + 1.4, m));
          g.add(span(x0 + 0.1, x1 - 0.1, y0 + 0.1, y1 - 0.1, z + 1.4, z + 1.45, finishMat('soil')));
          plantsAlong(g, x0, x1, y0, y1, z + 1.45);
          run += Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        };
        for (const f of F) {
          const g = G[f.fk], z = f.m.ffl - 0.08;
          trough(g, f.bal4.x0 + 0.6, f.bal4.x1 - 0.6, f.bal4.y - 1.75, f.bal4.y - 0.55, z);
          trough(g, f.bal3.x0 + 0.4, f.bal3.x1 - 0.9, f.bal3.y - 1.75, f.bal3.y - 0.55, z);
          trough(g, 15.5, 16.75, 0.6, 5.5, z);
          trough(g, 17.5, 21.8, 3.45, 4.45, z);
        }
        if (plan.flat) {
          const o = upperOutline(plan.floors[plan.top]), y4 = Math.max(...o.map((p) => p[1])) - 0.5;
          trough(G.rf, 0.7, 9.9, y4 - 1.3, y4 - 0.1, plan.meta.rf.ffl - 0.02);
        }
        extra('planter', 'ext', run);
        break;
      }
      case 'greenWall': {
        const leaves = cladMaterial('leaves');
        const ceil = plan.meta.gf.ceil;
        G.gf.add(panel(9, ceil - 1.6, leaves, 0.53, (1.2 + ceil) / 2, 27.85, 'x'));
        G.site.add(panel(7, 4.6, leaves, -0.1, 2.5, 36.4, 'x'));
        extra('greenWall', 'ext', 9 * (ceil - 1.6) + 7 * 4.6);
        break;
      }
      case 'trims': {
        let run = 0;
        const m = mat(ft.mat);
        for (const f of F) {
          const o = offsetPoly(upperOutline(plan.floors[f.fk]), 0.07);
          const band = new THREE.Mesh(polyEdge(o, f.m.zb - 0.12, f.m.ffl + 0.18), m);
          G[f.fk].add(band);
          run += o.reduce((s, p, i) => s + Math.hypot(o[(i + 1) % o.length][0] - p[0], o[(i + 1) % o.length][1] - p[1]), 0);
        }
        extra('trim', 'ext', run);
        break;
      }
      case 'coping': {
        if (!plan.flat) break;
        const m = mat(ft.mat), rf = plan.floors.rf, z = plan.meta.rf.ffl;
        let run = 0;
        for (const w of rf.walls) {
          if (!/^rf-par/.test(w.id)) continue;
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, w.length + 0.5, 12, 1, false, 0, Math.PI), m);
          c.rotation.set(0, -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]), Math.PI / 2);
          c.position.set((w.a[0] + w.b[0]) / 2, z + w.height, (w.a[1] + w.b[1]) / 2);
          G.rf.add(c);
          run += w.length;
        }
        extra('copingTerracotta', 'ext', run);
        break;
      }
      case 'blades': {
        let area = 0;
        const m = mat(ft.mat);
        if (ft.thin) {
          // slim canopies over every front sliding door and the front door
          const over = (g, x0, x1, yWall, z) => { g.add(span(x0, x1, yWall, yWall + ft.depth, z, z + 0.15, m)); area += (x1 - x0) * ft.depth; };
          for (const f of F) for (const b of [f.bal3, f.bal4]) {
            const w = b.wall;
            for (const o of w.openings) {
              if (o.kind !== 'sliding') continue;
              const xs = [w.a[0] + ((w.b[0] - w.a[0]) * o.from) / w.length, w.a[0] + ((w.b[0] - w.a[0]) * o.to) / w.length].sort((p, q) => p - q);
              over(G[f.fk], xs[0] - 0.4, xs[1] + 0.4, w.a[1] + 0.25, f.m.ffl + Math.min(o.sill + o.height, 8.6) + 0.35);
            }
          }
          over(G.gf, 10.4, 18.0, 28.13, plan.meta.gf.ffl + 7.6);
        } else {
          // the floor slabs run on past the balconies as deep sunshades
          for (const f of F) {
            if (f.isTop && plan.flat) continue; // the roof overhang shades the top floor
            for (const b of [f.bal3, f.bal4]) {
              G[f.fk].add(span(b.x0, b.x1, b.y - 0.1, b.y + ft.depth, f.top - 0.05, f.top + plan.slab, m));
              area += (b.x1 - b.x0) * ft.depth;
            }
          }
        }
        extra('blades', 'ext', area);
        break;
      }
      case 'pergola': {
        if (!plan.flat) break;
        const o = upperOutline(plan.floors[plan.top]);
        const y1 = Math.max(...o.map((p) => p[1])) - 1.2, x0 = 1.0, x1 = 9.6, y0 = 23.8, z = plan.meta.rf.ffl;
        const m = mat(ft.mat), h = 8;
        for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) G.rf.add(span(x - 0.2, x + 0.2, y - 0.2, y + 0.2, z, z + h, m));
        G.rf.add(span(x0 - 0.3, x1 + 0.3, y0 - 0.15, y0 + 0.15, z + h - 0.6, z + h, m));
        G.rf.add(span(x0 - 0.3, x1 + 0.3, y1 - 0.15, y1 + 0.15, z + h - 0.6, z + h, m));
        for (let x = x0; x <= x1 + 0.01; x += 1.2) G.rf.add(span(x - 0.08, x + 0.08, y0 - 0.6, y1 + 0.6, z + h, z + h + 0.5, m));
        if (ft.creepers) for (let x = x0 + 0.5; x < x1; x += 1.6) for (let y = y0 + 0.5; y < y1; y += 2.2) {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), finishMat((x + y) % 3 > 1.5 ? 'plant2' : 'plant'));
          b.position.set(x, z + h + 0.7, y); b.scale.y = 0.5; G.rf.add(b);
        }
        extra('pergola', 'ext', (x1 - x0) * (y1 - y0));
        break;
      }
      case 'plants': for (const [x, y] of ft.spots) G.site.add(plant(ft.kind, x, y)); extra('garden', 'ext', ft.spots.length * 20, 'plants and beds'); break;
      case 'gate': extra('gate', 'ext', gate(G.site, ft)); break;
      case 'zen': extra('garden', 'ext', zen(G.site), 'gravel, stones and bamboo'); break;
      case 'lights': {
        const m = finishMat('light');
        for (let x = 11; x < 18; x += 2.4) G.gf.add(span(x - 0.15, x + 0.15, 28.15, 28.35, 0.05, 0.12, m));
        for (const f of F) for (const b of [f.bal3, f.bal4]) for (let x = b.x0 + 1.5; x < b.x1 - 1; x += 3) G[f.fk].add(span(x - 0.2, x + 0.2, b.y - 1.4, b.y - 1, f.m.zb - 0.04, f.m.zb, m));
        break;
      }
      default: break;
    }
  }
}

// ------------------------------------------------------------------ plants
function plantsAlong(g, x0, x1, y0, y1, z) {
  const along = Math.abs(x1 - x0) > Math.abs(y1 - y0);
  const L = along ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
  for (let s = 0.45; s < L - 0.2; s += 0.8) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + ((s * 13) % 5) * 0.04, 0), finishMat((s * 3) % 2 > 1 ? 'plant2' : 'plant'));
    b.position.set(along ? Math.min(x0, x1) + s : (x0 + x1) / 2, z + 0.35, along ? (y0 + y1) / 2 : Math.min(y0, y1) + s);
    b.castShadow = true;
    g.add(b);
  }
}

function plant(kind, x, y) {
  const g = new THREE.Group();
  const blob = (r, px, py, pz, k = 'plant') => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), finishMat(k)); b.position.set(px, py, pz); b.castShadow = true; g.add(b); return b; };
  if (kind === 'palm') {
    const h = 15;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 8), finishMat('trunk'));
    trunk.position.set(x, h / 2, y); trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 0.9), finishMat(i % 2 ? 'plant' : 'plant2'));
      f.position.set(x + Math.cos(a) * 2.4, h - 0.6, y + Math.sin(a) * 2.4);
      f.rotation.set(0, -a, -0.45);
      f.castShadow = true;
      g.add(f);
    }
  } else if (kind === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 7, 8), finishMat('trunk'));
    trunk.position.set(x, 3.5, y); g.add(trunk);
    blob(2.6, x, 9, y); blob(1.9, x + 1.4, 8, y + 0.5, 'plant2'); blob(1.8, x - 1.2, 8.4, y - 0.6);
  } else if (kind === 'olive') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.6, 14), finishMat('terracotta'));
    pot.position.set(x, 0.8, y); g.add(pot);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.6, 6), finishMat('trunk'));
    trunk.position.set(x, 3.2, y); g.add(trunk);
    blob(1.3, x, 5.4, y, 'plant2'); blob(0.9, x + 0.8, 4.8, y + 0.3, 'plant2');
  } else {
    blob(1.2, x, 1, y); blob(0.9, x + 0.9, 0.8, y + 0.4, 'plant2'); blob(0.5, x - 0.5, 1.6, y - 0.3, 'bloom');
  }
  return g;
}

// ------------------------------------------------------------------ front gate and fence
// Along the road edge: car gate, pedestrian gate and a fence panel between four piers.
function gate(group, ft) {
  const y = 40.133 - 0.25, m = mat(ft.mat), pier = mat(ft.pier || 'white'), black = finishMat('black');
  for (const x of [0.0, 10.65, 14.35, 18.15]) group.add(span(x - 0.5, x + 0.5, y - 0.5, y + 0.5, 0, 6, pier));
  const H = 5.4;
  const parts = [[0.6, 10.05], [11.25, 13.75], [14.95, 17.55]];
  let area = 0;
  parts.forEach(([x0, x1], i) => {
    const w = x1 - x0;
    area += w * H;
    if (ft.kind === 'slotWall' && i === 2) {
      for (let z = 0; z < H; z += 0.9) group.add(span(x0, x1, y - 0.25, y + 0.25, z, z + 0.7, m));
      return;
    }
    switch (ft.kind) {
      case 'hslats': case 'slotWall':
        for (let z = 0.3; z < H; z += 0.45) group.add(span(x0, x1, y - 0.06, y + 0.06, z, z + 0.32, ft.kind === 'slotWall' ? black : m));
        break;
      case 'vbars':
        for (let x = x0 + 0.15; x < x1; x += 0.35) group.add(span(x - 0.03, x + 0.03, y - 0.03, y + 0.03, 0.2, H, m));
        group.add(span(x0, x1, y - 0.05, y + 0.05, H - 0.15, H, m));
        group.add(span(x0, x1, y - 0.05, y + 0.05, 0.2, 0.35, m));
        break;
      case 'vslats':
        for (let x = x0 + 0.1; x < x1 - 0.1; x += 0.42) group.add(span(x, x + 0.3, y - 0.06, y + 0.06, 0.2, H, m));
        group.add(span(x0, x1, y - 0.08, y + 0.08, H - 0.12, H, black));
        break;
      case 'jali':
        group.add(panel(w, H - 0.2, finishMat('jali'), (x0 + x1) / 2, H / 2 + 0.1, y));
        break;
      default: break;
    }
  });
  return area;
}

// ------------------------------------------------------------------ zen garden
function zen(group) {
  const poly = [[14.4, 33.2], [19.9, 33.2], [18.75, 39.85], [14.4, 39.85]];
  group.add(new THREE.Mesh(flatPoly(poly, 0.03, true), cladMaterial('gravel')));
  const stone = finishMat('stone');
  for (const [x, y, r] of [[15.8, 35.2, 0.9], [17.4, 36.8, 0.6], [16.2, 38.2, 0.45]]) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), stone);
    s.position.set(x, r * 0.35, y); s.scale.y = 0.6; s.castShadow = true; group.add(s);
  }
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 12), stone);
    s.position.set(12.3 + (i % 2) * 0.5, 0.06, 39.3 - i * 1.2); group.add(s);
  }
  for (let i = 0; i < 14; i++) {
    const y = 33.6 + i * 0.32, x = 19.55 - (y - 33.2) * 0.17 - (i % 3) * 0.18, h = 11 + (i % 4) * 1.5;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 5), finishMat('bamboo'));
    c.position.set(x, h / 2, y); group.add(c);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), finishMat('plant2'));
    l.position.set(x - 0.2, h - 0.6, y); l.scale.set(0.8, 1.6, 0.8); group.add(l);
  }
  return 5 * 6.6;
}

// ------------------------------------------------------------------ car porch canopy
export function buildCanopy(plan, group, SM) {
  const C = plan.roof.carPorchRoof, st = plan.style;
  const ys = C.poly.map((q) => q[1]), xs = C.poly.map((q) => q[0]);
  const yA = Math.min(...ys), yB = Math.max(...ys), xA = Math.min(...xs), xB = Math.max(...xs);
  const area = (xB - xA) * (yB - yA);
  switch (st.canopy || 'sheet') {
    case 'sheet': {
      const zAt = (x, y) => C.level - 0.2 - ((y - yA) / (yB - yA)) * 0.6;
      group.add(new THREE.Mesh(flatPoly(C.poly, 0, true, zAt), M.roof));
      break;
    }
    case 'concrete': group.add(span(xA, xB, yA, yB, C.level - 0.75, C.level - 0.1, finishMat(st.fascia?.mat === 'concrete' ? 'concrete' : 'white'))); break;
    case 'glass': case 'steelGlass': {
      const fr = st.canopy === 'steelGlass' ? finishMat('black') : SM.frame;
      const g = span(xA, xB, yA, yB, C.level - 0.45, C.level - 0.4, M.glass);
      g.userData = { type: 'glass' };
      group.add(g);
      for (let x = xA + 0.1; x <= xB; x += 2.6) group.add(span(x - 0.1, x + 0.1, yA, yB, C.level - 0.75, C.level - 0.45, fr));
      group.add(span(xA, xB, yB - 0.2, yB, C.level - 0.75, C.level - 0.45, fr));
      break;
    }
    case 'pergola': {
      const t = finishMat('timber');
      for (let x = xA + 0.2; x <= xB; x += 0.9) group.add(span(x - 0.08, x + 0.08, yA, yB, C.level - 0.85, C.level - 0.3, t));
      group.add(span(xA, xB, yB - 0.25, yB, C.level - 1.1, C.level - 0.6, t));
      for (const x of [xA + 0.2, xB - 0.2]) group.add(span(x - 0.2, x + 0.2, yB - 0.45, yB - 0.05, 0, C.level - 0.6, finishMat('black')));
      break;
    }
    default: break;
  }
  return { type: st.canopy || 'sheet', area };
}

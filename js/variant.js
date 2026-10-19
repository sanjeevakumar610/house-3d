// House variants: floor count (G+1 / G+2) and facade style. Each variant is a new plan object
// derived from the architect's plan (data/plan.json), so the builder, the walker, the room panel
// and the cost tab all read the same shape whatever the choice.
import { styleById, FRAME_LABEL } from './styles.js';
import { pointInPoly } from './geom.js';

export const FLOOR_NAMES = { gf: 'Ground floor', uf: 'First floor', uf2: 'Second floor', rf: 'Roof terrace' };
export const FLOOR_SHORT = { gf: 'Ground', uf: 'First', uf2: 'Second', rf: 'Roof' };
const F2F = 10;            // floor to floor, ft
const HEAD_H = 8.5;        // stair-head room on the roof terrace, ft
const PARAPET = 3.5;       // roof terrace parapet, ft
const UPPER_STAIR_Y2 = 22.633; // upper flights stop at the Bed 04 wall
const r3 = (v) => Math.round(v * 1000) / 1000;

// windows added by the styles (sizes in ft; head at 7'-0" unless the sill says otherwise)
const EXTRA_SCHEDULE = {
  W05: { w: 3, h: 4, kind: 'window', desc: '2-sash casement window' },
  W06: { w: 1.5, h: 6, kind: 'window', desc: 'Slot window, 1 sash' },
  W07: { w: 4, h: 5, kind: 'window', desc: '4-pane casement window' },
  W08: { w: 6, h: 2.5, kind: 'window', desc: 'Ribbon window, 3 sash' },
  W09: { w: 2, h: 7, kind: 'window', desc: 'Tall slim window' },
  W10: { w: 5, h: 1.5, kind: 'window', desc: 'High window, top hung' },
  W11: { w: 4, h: 9, kind: 'fixed', desc: 'Fixed corner glass, floor to ceiling' },
  W12: { w: 3, h: 5, kind: 'window', desc: 'Arched casement window' },
  W01T: { w: 4, h: 9, kind: 'window', desc: 'Tall glass and louvre panel beside the door' },
  SD03T: { w: 7.5, h: 9, kind: 'sliding', desc: '3-sash sliding, floor to ceiling' },
  SD05T: { w: 9, h: 9, kind: 'sliding', desc: '3-sash sliding, floor to ceiling' },
};

// where side windows go on the east walls: [wall, preferred centre, allowed range] (ft along wall)
const SIDE_SPOTS = [
  ['gf-east-upper', 5.8, [2.4, 9.3]],     // kitchen / pantry
  ['gf-east-lower', 4.8, [3.6, 6.0]],     // dining (between the column and the entrance)
  ['gf-east-lower', 9.8, [6.4, 13.2]],    // entrance
  ['uf-east-upper', 4.4, [0.9, 8.1]],     // Bed 02
  ['uf-east-lower', 9.0, [3.9, 14.6]],    // Bed 03
];

export function makeVariant(base, { floors = 2, style = 'original' } = {}) {
  const st = styleById(style);
  const plan = structuredClone(base);
  plan.style = st;
  plan.variant = { floors: floors === 3 ? 3 : 2, style: st.id };
  plan.schedule = { ...plan.schedule };
  const flat = st.roof === 'flat';
  const O = st.openings || {};

  // ---------------------------------------------------------------- openings and balconies
  if (O.frontBalcony) deepenBalconies(plan, 'uf', O.frontBalcony);
  applyOpenings(plan, st);

  // ---------------------------------------------------------------- second upper floor
  if (plan.variant.floors === 3) plan.floors.uf2 = copyFloor(plan.floors.uf, F2F);
  const keys = plan.variant.floors === 3 ? ['gf', 'uf', 'uf2'] : ['gf', 'uf'];
  const top = keys[keys.length - 1];
  const ffl = { gf: plan.levels.gf, uf: plan.levels.uf, uf2: plan.levels.uf + F2F };
  if (flat) ffl.rf = ffl[top] + F2F;
  plan.levels = { ...plan.levels, uf2: ffl.uf2, uf2Bath: ffl.uf2 - 1 / 12 };
  plan.floorKeys = flat ? [...keys, 'rf'] : keys;
  plan.top = top;
  plan.flat = flat;

  // ---------------------------------------------------------------- pitched roof (Original)
  const R = plan.roof;
  const dz = ffl[top] - plan.levels.uf;
  if (!flat && dz) {
    R.ridge += dz; R.eaves += dz;
    R.tankRoom.floor += dz; R.tankRoom.top += dz;
  }
  // the car porch canopy starts in front of the (possibly deeper) Bed 04 balcony
  const b4 = plan.floors.uf.walls.find((w) => w.id === 'uf-bal4-front');
  const y0 = Math.max(R.carPorchRoof.poly[0][1], r3(b4.a[1] + 0.25));
  R.carPorchRoof.poly = R.carPorchRoof.poly.map(([x, y]) => [x, y < 37 ? y0 : y]);

  // ---------------------------------------------------------------- per-floor heights
  plan.meta = {};
  plan.floorKeys.forEach((fk, i) => {
    const next = plan.floorKeys[i + 1];
    const ceil = fk === 'rf' ? ffl.rf + HEAD_H - plan.slab
      : next ? ffl[next] - plan.slab
        : R.eaves; // pitched roof over the top floor
    plan.meta[fk] = { key: fk, name: FLOOR_NAMES[fk], short: FLOOR_SHORT[fk], ffl: ffl[fk], zb: fk === 'gf' ? 0 : ffl[fk] - plan.slab, ceil, roofOver: !flat && fk === top };
  });

  // ---------------------------------------------------------------- roof terrace
  if (flat) plan.floors.rf = terraceFloor(plan, top, ffl.rf, st);

  // ---------------------------------------------------------------- stairs
  // gf→uf as drawn; every further flight repeats it in the same well, 2'-6" wide (Bed 04 wall)
  const S0 = plan.stair;
  plan.stairs = [{ ...S0, from: 'gf', to: 'uf', solidLower: true }];
  for (let i = 1; i < plan.floorKeys.length; i++) {
    const from = plan.floorKeys[i], to = plan.floorKeys[i + 1];
    if (!to) break;
    plan.stairs.push({
      base: ffl[from], riser: (ffl[to] - ffl[from]) / S0.risers, risers: S0.risers, width: 2.5,
      lower: { ...S0.lower, y2: UPPER_STAIR_Y2 }, upper: { ...S0.upper }, winder: { ...S0.winder, y2: UPPER_STAIR_Y2 },
      from, to, solidLower: false,
    });
    // the guard rail at the head of the stair well gives way to the next flight
    const fl = plan.floors[from];
    fl.walls = fl.walls.filter((w) => !/-stair-rail-east$/.test(w.id));
  }
  return plan;
}

// ------------------------------------------------------------------ balconies
// Deepen the two front balconies (Bed 03, Bed 04) to a clear depth of d ft.
function deepenBalconies(plan, p, d) {
  const fl = plan.floors[p === 'uf' ? 'uf' : 'uf2'];
  const W = (s) => fl.walls.find((w) => w.id === `${p}-${s}`);
  const R = (s) => fl.rooms.find((r) => r.id === `${p}-${s}`);
  // Bed 03 balcony: its east side follows the slanting east wall
  const in3 = 29.622, f3 = r3(in3 + d), c3 = r3(f3 + 0.25);
  const eastRoom = (y) => r3(17.856 - 0.1593 * (y - in3));
  const eastWall = (y) => r3(18.089 - 0.1258 * (y - 29.378));
  setRoom(R('bal3'), [[10.511, in3], [17.856, in3], [eastRoom(f3), f3], [10.511, f3]]);
  setEnds(W('bal3-east'), W('bal3-east').a, [eastWall(c3), c3]);
  setEnds(W('bal3-front'), [10.261, c3], [eastWall(c3), c3]);
  // Bed 04 balcony (over the car porch)
  const in4 = 32.633, f4 = r3(in4 + d), c4 = r3(f4 + 0.25);
  setRoom(R('bal4'), [[0.5, in4], [10.011, in4], [10.011, f4], [0.5, f4]]);
  setEnds(W('bal4-west'), [0.25, in4], [0.25, c4]);
  setEnds(W('bal4-front'), [0.25, c4], [10.261, c4]);
  setEnds(W('bal4-east'), [10.261, in4], [10.261, c4]);
  plan.balconyDepth = d;
}

function setEnds(w, a, b) { w.a = a; w.b = b; w.length = r3(Math.hypot(b[0] - a[0], b[1] - a[1])); }
function setRoom(r, poly) {
  r.poly = poly;
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
  r.area = r3(Math.abs(a) / 2);
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  r.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ------------------------------------------------------------------ openings
function applyOpenings(plan, st) {
  const O = st.openings || {};
  const sched = plan.schedule;
  const frame = FRAME_LABEL[st.frame] || 'aluminium';
  const useTag = (tag, def) => { if (!sched[tag]) sched[tag] = { ...def }; return sched[tag]; };
  const floors = [plan.floors.gf, plan.floors.uf];
  const wall = (id) => floors.flatMap((f) => f.walls).find((w) => w.id === id);

  if (O.frontTall) {
    const t3 = wall('uf-bed3-south')?.openings.find((o) => o.tag === 'SD03');
    if (t3) Object.assign(t3, { tag: 'SD03T', sill: 0, height: 9.25 }), useTag('SD03T', EXTRA_SCHEDULE.SD03T);
    const w4 = wall('uf-bed4-south'), t5 = w4?.openings.find((o) => o.tag === 'SD05');
    if (t5) {
      const c = (t5.from + t5.to) / 2, half = Math.min(4.5, w4.length / 2 - 0.35);
      Object.assign(t5, { tag: 'SD05T', from: r3(c - half), to: r3(c + half), width: r3(2 * half), sill: 0, height: 9.25 });
      useTag('SD05T', EXTRA_SCHEDULE.SD05T);
    }
  }
  if (O.entryTall) {
    const w1 = wall('gf-entrance-front')?.openings.find((o) => o.tag === 'W01');
    if (w1) Object.assign(w1, { tag: 'W01T', sill: 0, height: 9.25 }), useTag('W01T', EXTRA_SCHEDULE.W01T);
  }
  if (O.corner) {
    useTag('W11', EXTRA_SCHEDULE.W11);
    place(wall('uf-east-lower'), 'W11', 12.9, 4, 0, 9.25, [10.8, 15.0], sched);
  }
  if (O.side) {
    const s = O.side;
    useTag(s.tag, { ...(EXTRA_SCHEDULE[s.tag] || { kind: 'window', desc: 'Side window' }), w: s.w, h: s.h });
    for (const [id, c, range] of SIDE_SPOTS) place(wall(id), s.tag, c, s.w, s.sill, s.h, range, sched);
  }
  // every window and sliding door: frame finish, arches, grid frames, vents above sliders
  for (const fl of floors) for (const w of fl.walls) {
    const extra = [];
    for (const o of w.openings) {
      if (o.kind === 'door' || o.kind === 'arch') continue;
      if (O.grid) o.grid = true;
      if (O.arched) {
        o.arched = true;
        if (o.tag !== 'W12') {
          const tag = o.tag + 'A';
          useTag(tag, { ...sched[o.tag], desc: sched[o.tag].desc + ', arched head', h: sched[o.tag].h + 0.75 });
          o.tag = tag;
          o.height = r3(o.height + 0.75);
        }
      }
      if (O.vents && o.kind === 'sliding' && o.sill + o.height <= 7.2) {
        extra.push({ tag: 'V01', kind: 'vent', vent: O.ventKind || 'louvre', from: o.from, to: o.to, width: o.width, sill: 7.35, height: 1.0 });
      }
    }
    w.openings.push(...extra);
  }
  plan.frameLabel = frame;
}

// add an opening near `centre` inside `range`, avoiding the openings already on the wall
function place(w, tag, centre, width, sill, height, range, sched) {
  if (!w) return;
  const busy = w.openings.filter((o) => o.kind !== 'vent').map((o) => [o.from - 0.4, o.to + 0.4]).sort((a, b) => a[0] - b[0]);
  // free intervals inside the allowed range
  const free = [];
  let s = range[0];
  for (const [a, b] of busy) { if (b <= s) continue; if (a > s) free.push([s, Math.min(a, range[1])]); s = Math.max(s, b); if (s >= range[1]) break; }
  if (s < range[1]) free.push([s, range[1]]);
  let best = null;
  for (const [a, b] of free) {
    const wd = Math.min(width, b - a);
    if (wd < Math.min(width, 1.5) - 1e-6) continue;
    const c = Math.max(a + wd / 2, Math.min(b - wd / 2, centre));
    const score = Math.abs(c - centre) - wd * 2;
    if (!best || score < best.score) best = { c, wd, score };
  }
  if (!best) return;
  const kind = sched[tag]?.kind || 'window';
  w.openings.push({ tag, kind, from: r3(best.c - best.wd / 2), to: r3(best.c + best.wd / 2), width: r3(best.wd), sill: sill, height: height });
  w.openings.sort((p, q) => p.from - q.from);
}

// ------------------------------------------------------------------ second floor
function copyFloor(fl, dz) {
  const c = structuredClone(fl);
  const rid = (id) => id.replace(/^uf-/, 'u2-');
  c.name = FLOOR_NAMES.uf2;
  for (const w of c.walls) w.id = rid(w.id);
  for (const r of c.rooms) { r.id = rid(r.id); r.level = r3(r.level + dz); }
  return c;
}

// ------------------------------------------------------------------ roof terrace
// Outer outline of an upper floor (outside faces of its walls and balcony parapets).
export function upperOutline(fl) {
  const p = fl.walls.find((w) => w.id.endsWith('-bal3-front')).id.split('-')[0];
  const W = (s) => fl.walls.find((w) => w.id === `${p}-${s}`);
  const y3 = W('bal3-front').a[1] + 0.25, y4 = W('bal4-front').a[1] + 0.25;
  const xE = (y) => r3(18.089 - 0.1258 * (y - 29.378) + 0.25);
  return [[0.8, 0], [17.31, 0], [17.31, 3.19], [22.95, 3.19], [22.53, 5.7], [21.06, 14.16], [20.42, 14.16], [18.34, 29.38], [xE(y3), y3], [10.51, y3], [10.51, y4], [0, y4], [0, 4.45]].map(([x, y]) => [r3(x), r3(y)]);
}

// Flat roof slab outline: the floor outline grown by the style's overhang, kept inside the plot
// (none on the west boundary, little at the rear and east, one straight edge across the front).
export function roofSlabOutline(plan, outline, overhang) {
  const ov = Math.max(0.5, overhang);
  const ovR = Math.min(ov, 0.4), ovE = Math.min(ov, 1.5), ovNE = Math.min(ov, 1);
  const yFront = Math.max(...outline.map((p) => p[1]));
  const yF = r3(Math.min(yFront + ov, 39.6));
  const east = (y) => 20.42 - (y - 14.16) * 0.13667;
  return [[0, -ovR], [17.31 + ovNE, -ovR], [17.31 + ovNE, 3.19 - ovR], [22.95 + ovE, 3.19 - ovR], [22.53 + ovE, 5.7], [21.06 + ovE, 14.16], [east(yF) + ovE, yF], [0, yF]].map(([x, y]) => [r3(x), r3(y)]);
}

// polygon offset with mitred corners; d > 0 grows the polygon
export function offsetPoly(poly, d) {
  let A = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; A += x1 * y2 - x2 * y1; }
  const s = A > 0 ? 1 : -1;
  const n = poly.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const nx = (s * dy) / L, ny = (-s * dx) / L; // outward normal
    lines.push({ p: [a[0] + nx * d, a[1] + ny * d], d: [dx / L, dy / L] });
  }
  return lines.map((l, i) => {
    const m = lines[(i + n - 1) % n];
    const den = m.d[0] * l.d[1] - m.d[1] * l.d[0];
    if (Math.abs(den) < 1e-6) return l.p;
    const t = ((l.p[0] - m.p[0]) * l.d[1] - (l.p[1] - m.p[1]) * l.d[0]) / den;
    return [r3(m.p[0] + m.d[0] * t), r3(m.p[1] + m.d[1] * t)];
  });
}

// Sutherland–Hodgman clip of a polygon to an axis-aligned box
function clipBox(poly, x0, y0, x1, y1) {
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]]];
  let out = poly;
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out.map(([x, y]) => [r3(x), r3(y)]);
}

function terraceFloor(plan, top, z, st) {
  const topFl = plan.floors[top];
  const outline = upperOutline(topFl);
  const centre = offsetPoly(outline, -0.25);
  const inner = offsetPoly(outline, -0.5);
  const glassRail = st.rail === 'glass' || st.rail === 'glassGold';
  const walls = [];
  const wall = (id, a, b, t, kind, h, ops = []) => walls.push({ id, a, b, length: r3(Math.hypot(b[0] - a[0], b[1] - a[1])), thickness: t, kind, height: h, openings: ops });

  // parapets round the edge; the west one breaks where the stair-head room stands
  centre.forEach((a, i) => {
    const b = centre[(i + 1) % centre.length];
    const id = `rf-${glassRail ? 'rail' : 'par'}-${i}`;
    if (Math.abs(a[0] - 0.25) < 0.01 && Math.abs(b[0] - 0.25) < 0.01) {
      const ys = [a[1], b[1]].sort((p, q) => p - q);
      if (ys[0] < 17.05) wall(id + 'a', [0.25, ys[1] > 17.05 ? 17.05 : ys[1]], [0.25, ys[0]], 0.5, 'parapet', PARAPET);
      if (ys[1] > 23.13) wall(id + 'b', [0.25, ys[1]], [0.25, 23.13], 0.5, 'parapet', PARAPET);
      return;
    }
    wall(id, a, b, 0.5, 'parapet', PARAPET);
  });
  // stair-head room over the stair well, door to the terrace on its east side
  const ys = [17.3, 22.883], xe = 10.983;
  wall('rf-head-n', [0.25, ys[0]], [xe, ys[0]], 0.5, 'wall', HEAD_H);
  // a breeze-block (jali) south wall lets hot air out of the stair well (Green Facade)
  const jali = (st.features || []).some((f) => f.type === 'screen' && f.at === 'stairhead');
  wall('rf-head-s', [0.25, ys[1]], [xe, ys[1]], 0.5, 'wall', HEAD_H,
    jali ? [{ tag: 'V01', kind: 'vent', vent: 'jali', from: 0.6, to: 10.1, width: 9.5, sill: 1, height: 6.5 }] : []);
  wall('rf-head-w', [0.25, ys[0]], [0.25, ys[1]], 0.5, 'wall', HEAD_H);
  wall('rf-head-e', [xe, ys[0]], [xe, ys[1]], 0.5, 'wall', HEAD_H, [{ tag: 'D02', kind: 'door', from: 0.55, to: 3.55, width: 3, sill: 0, height: 7 }]);
  // low curb round the light well skylight
  wall('rf-sky-n', [0.25, 9.833], [3.833, 9.833], 0.333, 'parapet', 1.5);
  wall('rf-sky-e', [3.833, 9.833], [3.833, 13.133], 0.333, 'parapet', 1.5);
  wall('rf-sky-s', [3.833, 13.133], [0.25, 13.133], 0.333, 'parapet', 1.5);

  // walkable terrace, split round the skylight and the stair-head room
  const bands = [[-5, -5, 60, 9.667], [4.0, 9.667, 60, 13.3], [-5, 13.3, 60, 17.05], [11.233, 17.05, 60, 23.133], [-5, 23.133, 60, 60]];
  const rooms = [];
  bands.forEach(([x0, y0, x1, y1], i) => {
    const poly = clipBox(inner, x0, y0, x1, y1);
    if (poly.length < 3) return;
    const r = { id: `rf-terrace-${i + 1}`, name: 'Roof terrace', level: z, outdoor: true, terrace: true, noSlab: true };
    setRoom(r, poly);
    if (r.area > 1) rooms.push(r);
  });
  const landing = { id: 'rf-landing', name: 'Stair head', level: z, noSlab: true };
  setRoom(landing, [[8.256, 17.544], [10.733, 17.544], [10.733, 22.633], [8.256, 22.633]]);
  rooms.push(landing);

  const lw = topFl.voids.find((v) => v.id === 'lightwell').poly;
  const sw = topFl.voids.find((v) => v.id === 'stairwell').poly;
  return {
    name: FLOOR_NAMES.rf, walls, rooms, columns: [],
    voids: [{ id: 'stairwell', name: 'Stair well', poly: sw }, { id: 'lightwell', name: 'Light well skylight', poly: lw }],
    terrace: {
      outline, slab: roofSlabOutline(plan, outline, st.overhang || 1), holes: [lw, sw],
      head: { x0: 0, x1: 11.233, y0: 17.05, y1: 23.133, top: z + HEAD_H },
      sky: { x0: 0.25, x1: 3.833, y0: 9.833, y1: 13.133, curb: 1.5, top: 3 },
      parapet: PARAPET,
    },
  };
}

// which floor key a height belongs to (for walking and picking)
export function floorAtHeight(plan, feet) {
  let best = plan.floorKeys[0];
  for (const fk of plan.floorKeys) if (feet >= plan.meta[fk].ffl - 0.6) best = fk;
  return best;
}

export function isUpper(fk) { return fk !== 'gf' && fk !== 'rf'; }
export { pointInPoly };

// Material quantity take-off from the model (plan variant geometry + current design).
// Works in feet / cubic feet. Sections: fd (foundation), one per storey, roof, ext (facade & style).
import { pointInPoly } from '../geom.js';
import { PALETTE } from '../design.js';

const BAG = 1.226;      // cu ft per 50 kg cement bag
const CUBE = 100;       // cu ft per cube
const MM = 1 / 304.8;   // ft per mm
const COLS = 0.75;      // column size, ft (9")

const kgPerFt = (d) => 0.3048 * (d * d) / 162;
const steelKey = (d) => (d === 6 ? 'r6' : 't' + d);
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
const polyPerim = (p) => p.reduce((s, q, i) => s + Math.hypot(p[(i + 1) % p.length][0] - q[0], p[(i + 1) % p.length][1] - q[1]), 0);
const dist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const lightness = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};

const CLAD_PRICE = { brick: 'cladBrick', stoneDark: 'cladStone', stoneLight: 'cladStone', stoneWarm: 'cladStone', stoneBlack: 'cladGranite', concrete: 'cladConcrete', timber: 'cladTimber', charred: 'cladCharred' };

// cost sections for a plan variant: [key, label]
export function sectionsFor(plan) {
  const names = { gf: 'Ground floor', uf: 'First floor', uf2: 'Second floor' };
  return [['fd', 'Foundation'], ...plan.floorKeys.filter((k) => k !== 'rf').map((k) => [k, names[k]]), ['roof', plan.flat ? 'Roof terrace & tank' : 'Roof & tank'], ['ext', 'Facade & style']];
}

export function computeQuantities({ plan, house, designer, A, walling }) {
  const sections = sectionsFor(plan);
  const SEC = sections.map(([k]) => k);
  const secOf = (fk) => (fk === 'rf' ? 'roof' : fk);
  const M_ = plan.meta;
  const st = plan.style;
  const ups = plan.floorKeys.filter((k) => k === 'uf' || k === 'uf2');
  const g2 = ups.length === 2;
  const top = plan.top;
  const Q = {};
  const add = (key, sec, v) => { if (!v || !isFinite(v)) return; (Q[key] ||= Object.fromEntries(SEC.map((k) => [k, 0])))[sec] += v; };
  const elements = [];
  const el = (sec, name, qty, unit) => elements.push({ sec, name, qty, unit });

  const concrete = (sec, vol, [c, s, a]) => {
    const dry = vol * 1.54, t = c + s + a;
    add('cement', sec, (dry * c) / t / BAG); add('sand', sec, (dry * s) / t / CUBE); add('metal', sec, (dry * a) / t / CUBE);
  };
  const mortar = (sec, vol, [c, s]) => {
    const dry = vol * 1.3, t = c + s;
    add('cement', sec, (dry * c) / t / BAG); add('sand', sec, (dry * s) / t / CUBE);
  };
  const bars = (sec, d, ft) => add(steelKey(d), sec, ft * kgPerFt(d));
  const ties = (sec, len, spacing, perim) => bars(sec, 6, (Math.ceil(len / spacing) + 1) * perim);
  const RCC = [1, 2, 4], MASS = [1, 3, 6];

  const masonry = (w) => w.kind === 'wall' || (w.kind === 'parapet' && !/rail|bal/.test(w.id));
  const thick = (w) => w.thickness >= 0.4;
  const extWalls = new Set([...house.faces.values()].filter((f) => f.exterior).map((f) => f.wallId));
  const walls = (fk) => plan.floors[fk].walls;
  const upsized = g2 ? ' (G+2 upsized: estimate only, needs a structural engineer)' : '';

  // ------------------------------------------------------------ foundation
  const gfW = walls('gf').filter(masonry);
  const gfCols = plan.floors.gf.columns;
  const ecc = gfCols.filter(([x]) => x < 1).length, typ = gfCols.length - ecc;
  const fs = g2 ? A.g2Footing : 3, fdep = g2 ? A.g2FootingD / 12 : 10 / 12;
  const fVol = fs * fs * fdep;
  const meshBars = 2 * (Math.floor((fs * 12) / 6) + 1) * (fs + 0.67);
  concrete('fd', gfCols.length * fVol, RCC);
  concrete('fd', gfCols.length * fs * fs * (2 / 12), MASS);
  bars('fd', g2 ? 12 : 10, typ * meshBars); // mesh @ 6" both ways, bent ends
  bars('fd', g2 ? 16 : 12, ecc * meshBars);
  el('fd', `Column footings ${fs}'×${fs}'×${Math.round(fdep * 12)}" (${typ} typical, ${ecc} eccentric)${upsized}`, gfCols.length * fVol, 'cu ft');

  const Lpb = gfW.filter(thick).reduce((s, w) => s + w.length, 0);
  const Lrub = Math.max(0, Lpb - gfCols.length * fs);
  const rubVol = Lrub * A.rubbleW * A.rubbleD;
  add('rubble', 'fd', (rubVol * 1.25) / CUBE);
  mortar('fd', rubVol * 0.3, [1, 5]);
  concrete('fd', Lrub * A.rubbleW * 0.25, MASS);
  el('fd', `Rubble masonry wall foundation ${A.rubbleW}' × ${A.rubbleD}' (${Lrub.toFixed(0)} ft run)`, rubVol, 'cu ft');
  concrete('fd', Lpb * 0.5 * 0.5, RCC);
  bars('fd', 10, Lpb * 4 * 1.1);
  ties('fd', Lpb, 0.5, 1.67);
  el('fd', `Plinth beam 6"×6", 4T10 (${Lpb.toFixed(0)} ft)`, Lpb * 0.25, 'cu ft');
  mortar('fd', Lpb * 0.5 * 20 * MM, [1, 3]);
  el('fd', 'Damp-proof course 20 mm, 1:3', Lpb * 0.5, 'sq ft');

  const gfRooms = plan.floors.gf.rooms;
  const gfArea = gfRooms.reduce((s, r) => s + r.area, 0);
  concrete('fd', gfArea * (A.gfConcrete / 12), MASS);
  el('fd', `Ground floor concrete ${A.gfConcrete}" (1:3:6)`, gfArea, 'sq ft');
  const fill = gfRooms.reduce((s, r) => s + r.area * Math.max(0, r.level - A.gfConcrete / 12 - 0.1), 0);
  add('earth', 'fd', fill / CUBE);
  el('fd', 'Earth filling under the ground floor', fill, 'cu ft');

  // ------------------------------------------------------------ columns
  const depthTyp = fs - fdep, depthEcc = fs + 0.5 - fdep;
  for (const [x] of gfCols) {
    const h = (x < 1 ? depthEcc : depthTyp) + plan.levels.uf;
    concrete('gf', h * COLS * COLS, RCC);
    bars('gf', g2 || x < 1 ? 16 : 12, 4 * (h + 1.5 + 2));
    ties('gf', h, 0.5, 2.67);
  }
  el('gf', `Columns 9"×9" from footing to first floor (${gfCols.length})${g2 ? ', 4T16' : ''}`, gfCols.length * (depthTyp + plan.levels.uf) * COLS * COLS, 'cu ft');
  for (const fk of ups) {
    const cols = plan.floors[fk].columns, m = M_[fk];
    const colH = m.roofOver ? m.ceil - m.ffl : 10;
    const d = g2 && fk === 'uf' ? 16 : 12;
    concrete(fk, cols.length * colH * COLS * COLS, RCC);
    bars(fk, d, cols.length * 4 * (colH + 2));
    ties(fk, colH * cols.length, 0.5, 2.67);
    el(fk, `Columns 9"×9", ${m.name.toLowerCase()} (${cols.length}), 4T${d}`, cols.length * colH * COLS * COLS, 'cu ft');
  }

  // ------------------------------------------------------------ walls (masonry, lintels)
  const wallArea = Object.fromEntries(SEC.map((k) => [k, { six: 0, four: 0 }]));
  const lintels = (sec, w) => {
    for (const o of w.openings) {
      if (o.kind === 'vent' && w.openings.some((q) => q !== o && q.from === o.from)) continue; // shares the slider's lintel
      const len = o.width + 1, t = w.thickness;
      concrete(sec, len * t * 0.5, RCC);
      bars(sec, 10, len * (thick(w) ? 4 : 2));
      ties(sec, len, 0.667, thick(w) ? 1.67 : 1.33);
    }
  };
  const wallTake = (fk, height) => {
    const sec = secOf(fk), cols = plan.floors[fk].columns, m = M_[fk];
    for (const w of walls(fk).filter(masonry)) {
      const h = w.height != null ? w.height : height;
      let area = w.length * h;
      if (m.roofOver && w.height == null && extWalls.has(w.id)) {
        // gable infill up to the roof on outside walls
        const uy = (w.b[1] - w.a[1]) / w.length;
        for (let s = 0.125; s < w.length; s += 0.25) area += 0.25 * Math.max(0, house.roofZ(w.a[1] + uy * s) - 0.05 - m.ceil);
      }
      for (const o of w.openings) area -= o.width * Math.min(o.height, h);
      for (const c of cols) if (dist(c, w.a, w.b) < w.thickness / 2 + 0.3) area -= 0.5 * COLS * h;
      wallArea[sec][thick(w) ? 'six' : 'four'] += Math.max(0, area);
      lintels(sec, w);
    }
  };
  plan.floorKeys.forEach((fk, i) => {
    const m = M_[fk], next = plan.floorKeys[i + 1];
    if (fk === 'rf') return wallTake(fk, 0);
    wallTake(fk, m.roofOver ? m.ceil - 0.5 - m.ffl : M_[next].ffl - 1 - m.ffl); // floor to beam soffit
  });

  // solid balcony walls drawn as railings in some styles
  const solidRail = { solid: 1, planter: 2.4 / 3, glassSolid: 1.6 / 3 }[st.rail];
  if (solidRail) for (const fk of ups) for (const w of walls(fk)) if (/bal/.test(w.id) && w.kind === 'parapet') wallArea[fk].six += w.length * w.height * solidRail;

  // tank room walls (pitched roof)
  const R = plan.roof, T = R.tankRoom;
  const tW = T.poly[2][0] - T.poly[0][0], tD = T.poly[2][1] - T.poly[0][1];
  const tPer = 2 * (tW - 0.5 + tD - 0.5);
  if (!plan.flat) wallArea.roof.six += tPer * (T.top - R.eaves - plan.slab);

  for (const sec of SEC) {
    const { six, four } = wallArea[sec];
    if (!(six + four)) continue;
    if (walling === 'blocks') {
      add('block6', sec, six * 1.05); add('block4', sec, four * 1.05);
      mortar(sec, six * 0.035 + four * 0.025, [1, 5]);
    } else {
      add('bricks', sec, (six + four) * 5.5);
      mortar(sec, (six + four) * 0.062, [1, 5]);
    }
    el(sec, `${walling === 'blocks' ? 'Block' : 'Brick'}work: 6" walls ${six.toFixed(0)} sq ft, 4" walls ${four.toFixed(0)} sq ft`, six + four, 'sq ft');
  }

  // ------------------------------------------------------------ beams and slabs
  const slabT = A.slab / 12;
  const T2 = plan.flat ? plan.floors.rf.terrace : null;
  plan.floorKeys.forEach((fk, i) => {
    if (fk === 'gf') return;
    const below = plan.floorKeys[i - 1], sec = fk === 'rf' ? 'roof' : secOf(below);
    // beams under the walls the slab carries (the roof slab sits on the top floor's walls)
    const Lb = walls(fk === 'rf' ? below : fk).filter((w) => masonry(w) && thick(w) && w.height == null).reduce((s, w) => s + w.length, 0);
    concrete(sec, Lb * 0.75 * (1 - slabT), RCC);
    bars(sec, 16, Lb * 2 * 1.1); bars(sec, 12, Lb * 2 * 1.1);
    ties(sec, Lb, 0.5, 3.17);
    el(sec, `${fk === 'rf' ? 'Roof' : 'Floor'} beams 9"×12" (${Lb.toFixed(0)} ft)`, Lb * 0.75 * (1 - slabT), 'cu ft');
    const area = fk === 'rf'
      ? polyArea(T2.slab) - T2.holes.reduce((s, h) => s + polyArea(h), 0)
      : plan.floors[fk].rooms.reduce((s, r) => s + r.area, 0) + walls(fk).filter(masonry).reduce((s, w) => s + w.length * w.thickness, 0);
    concrete(sec, area * slabT, RCC);
    bars(sec, 10, area * 4 * 1.3 * 1.05);
    el(sec, `${fk === 'rf' ? 'Roof slab with overhang' : M_[fk].name + ' slab'} ${A.slab}" (${area.toFixed(0)} sq ft)`, area * slabT, 'cu ft');
    mortar(sec, area * 12 * MM * (1 + A.plasterAllow / 100), [1, 3]);
    el(sec, `Ceiling plaster under the ${fk === 'rf' ? 'roof' : M_[fk].name.toLowerCase()} slab, 12 mm`, area, 'sq ft');
  });
  if (!plan.flat) {
    const Lr = walls(top).filter((w) => masonry(w) && thick(w)).reduce((s, w) => s + w.length, 0);
    concrete(top, Lr * 0.25, RCC);
    bars(top, 10, Lr * 4 * 1.1);
    ties(top, Lr, 0.667, 1.67);
    el(top, `Ring beam 6"×6" at wall plate (${Lr.toFixed(0)} ft)`, Lr * 0.25, 'cu ft');
  }

  // staircases: 2 flights + winders, 5" waist
  let stairFinish = 0;
  plan.stairs.forEach((S) => {
    const sec = secOf(S.from);
    const flight = Math.hypot(7 * 0.75, 7 * S.riser);
    const landing = (S.winder.x2 - S.winder.x) * (S.winder.y2 - S.winder.y);
    const stairSlab = 2 * flight * S.width + landing;
    const vol = stairSlab * slabT + S.risers * 0.5 * 0.75 * S.riser * S.width;
    concrete(sec, vol, RCC);
    bars(sec, 10, stairSlab * (2 + 1.33) * 1.15);
    el(sec, `RCC staircase, ${S.risers} risers (${M_[S.from].short} to ${M_[S.to].short.toLowerCase()})`, vol, 'cu ft');
    const fin = S.risers * (0.75 + S.riser) * S.width;
    add('tiles', sec, fin); mortar(sec, fin * 20 * MM, [1, 4]);
    stairFinish += fin;
    add('railing', sec, 2 * flight + (S.from === 'gf' ? 2 : 1));
  });

  // water tank: tank room (pitched) or stand on the stair-head room (flat roof)
  const lw = plan.floors[top].voids.find((v) => v.id === 'lightwell').poly;
  if (!plan.flat) {
    const tankSlab = tW * tD - polyArea(lw);
    concrete('roof', tankSlab * slabT, RCC);
    bars('roof', 10, tankSlab * 4 * 1.3 * 1.05);
    concrete('roof', tPer * 0.75 * (0.75 - slabT), RCC);
    bars('roof', 12, tPer * 4 * 1.1); ties('roof', tPer, 0.5, 2.67);
    concrete('roof', tPer * 0.25, RCC);
    bars('roof', 10, tPer * 4 * 1.1); ties('roof', tPer, 0.667, 1.67);
    const tColH = T.top - R.eaves;
    concrete('roof', 2 * tColH * COLS * COLS, RCC);
    bars('roof', 12, 2 * 4 * (tColH + 2)); ties('roof', 2 * tColH, 0.5, 2.67);
    el('roof', `Water tank floor slab and beams (${tankSlab.toFixed(0)} sq ft)`, tankSlab * slabT + tPer * 0.75 * (0.75 - slabT), 'cu ft');
  } else {
    const H = T2.head, hA = (H.x1 - H.x0 + 0.6) * (H.y1 - H.y0 + 0.6), hP = 2 * (H.x1 - H.x0 + H.y1 - H.y0);
    concrete('roof', hA * slabT + hP * 0.5 * 0.5, RCC);
    bars('roof', 10, hA * 4 * 1.3 + hP * 4 * 1.1); ties('roof', hP, 0.667, 1.67);
    concrete('roof', 4.2 * 4.2 * 0.3, RCC);
    el('roof', `Stair-head room roof slab and ring beam, tank stand (${hA.toFixed(0)} sq ft)`, hA * slabT + hP * 0.25, 'cu ft');
    // terrace: waterproofing with upturns, 50 mm screed to falls, parapet coping
    const walk = plan.floors.rf.rooms.reduce((s, r) => s + r.area, 0);
    add('roofWaterproof', 'roof', walk * 1.15);
    mortar('roof', walk * 50 * MM, [1, 3]);
    el('roof', `Roof terrace waterproofing and 50 mm screed (${walk.toFixed(0)} sq ft)`, walk, 'sq ft');
    if (!st.features?.some((f) => f.type === 'coping')) add('coping', 'roof', walls('rf').filter((w) => /^rf-par/.test(w.id)).reduce((s, w) => s + w.length, 0));
    add('skylight', 'roof', (T2.sky.x1 - T2.sky.x0) * (T2.sky.y1 - T2.sky.y0));
  }

  // ------------------------------------------------------------ plaster, tiles, paint
  const ceilH = (r, fk) => M_[fk].ceil - r.level;
  const roomOf = (fk, id) => plan.floors[fk].rooms.find((r) => r.id === id);
  const tiled = new Map(); // face key → tiled sq ft
  const rawArea = { int: {}, ext: {} };
  for (const f of house.faces.values()) {
    const sec = secOf(f.floor);
    rawArea[f.exterior ? 'ext' : 'int'][sec] = (rawArea[f.exterior ? 'ext' : 'int'][sec] || 0) + f.area;
    const r = f.roomId && roomOf(f.floor, f.roomId);
    if (r && r.wet) {
      const t = f.area * Math.min(1, A.bathTileHeight / ceilH(r, f.floor));
      tiled.set(f.key, t);
      add('wallTiles', sec, t);
    }
  }
  for (const sec of SEC) {
    const i = rawArea.int[sec] || 0, x = rawArea.ext[sec] || 0;
    if (!(i + x)) continue;
    const allow = 1 + A.plasterAllow / 100;
    mortar(sec, i * 20 * MM * allow, [1, 5]);
    mortar(sec, x * 25 * MM * allow, [1, 5]);
    el(sec, `Plaster: internal ${i.toFixed(0)} sq ft (20 mm), external ${x.toFixed(0)} sq ft (25 mm)`, i + x, 'sq ft');
  }
  const tankExt = plan.flat ? 0 : tPer * (T.top - R.eaves), tankInt = plan.flat ? 0 : tPer * (T.top - T.floor);
  if (!plan.flat) mortar('roof', (tankExt * 25 * MM + tankInt * 20 * MM) * (1 + A.plasterAllow / 100), [1, 5]);

  // kitchen counters: granite top and backsplash tiles, taken off the walls of their room
  const backsplash = {}; // room id → sq ft
  for (const it of designer.items) {
    if (!it.type.startsWith('counter') || !plan.floors[it.floor]) continue;
    add('graniteTop', secOf(it.floor), it.w * it.d);
    const t = it.w * A.backsplash;
    add('wallTiles', secOf(it.floor), t);
    const r = plan.floors[it.floor].rooms.find((q) => pointInPoly([it.x, it.y], q.poly));
    if (r) backsplash[r.id] = (backsplash[r.id] || 0) + t;
  }

  // paint by colour (walls), ceilings, soffits; cladding covers some outside faces
  const m2 = 0.092903;
  const colours = new Map();
  const roomPaintArea = {};
  for (const f of house.faces.values()) {
    if (f.exterior || !f.roomId) continue;
    roomPaintArea[f.roomId] = (roomPaintArea[f.roomId] || 0) + f.area - (tiled.get(f.key) || 0);
  }
  const paintRows = [];
  for (const f of house.faces.values()) {
    const hex = '#' + f.material.color.getHexString();
    let area = f.area - (tiled.get(f.key) || 0) - (f.cladArea || 0);
    if (!f.exterior && f.roomId && backsplash[f.roomId]) area -= (backsplash[f.roomId] * area) / roomPaintArea[f.roomId];
    if (area <= 0) continue;
    const kind = f.exterior ? 'ext' : 'int', sec = secOf(f.floor);
    const k = kind + hex + sec;
    if (!colours.has(k)) colours.set(k, { hex, kind, sec, area: 0 });
    colours.get(k).area += area;
  }
  let primerM2 = 0;
  const pushPaint = (row) => {
    if (!(row.area > 0)) return;
    const isExt = row.kind === 'ext';
    const coats = isExt ? A.extCoats : lightness(row.hex) < 0.35 ? A.darkCoats : A.coats;
    const litres = (row.area * m2 * coats) / (isExt ? A.extCoverage : A.coverage);
    add(isExt ? 'paintExt' : 'paintInt', row.sec, litres);
    primerM2 += row.area * m2;
    paintRows.push({ ...row, coats, litres, name: colourName(row.hex, st) });
  };
  for (const c of colours.values()) pushPaint({ hex: c.hex, kind: c.kind, sec: c.sec, area: c.area, what: c.kind === 'ext' ? 'Exterior walls' : 'Interior walls' });
  const intWhite = '#fbfaf7';
  for (const fk of plan.floorKeys) {
    if (fk === 'rf') continue;
    const m = M_[fk], rooms = plan.floors[fk].rooms.filter((r) => !r.outdoor);
    let area = rooms.reduce((s, r) => s + r.area, 0);
    if (m.roofOver) {
      area += polyArea(plan.floors[fk].voids.find((v) => v.id === 'stairwell').poly);
      if (!A.ufCeiling) continue;
      add('ceiling', fk, area);
    }
    pushPaint({ hex: intWhite, kind: 'int', sec: fk, area, what: 'Ceilings' });
  }
  const ext = st.ext || '#e9e2d3';
  pushPaint({ hex: ext, kind: 'ext', sec: 'gf', area: gfRooms.filter((r) => r.outdoor).reduce((s, r) => s + r.area, 0) * 0.6, what: 'Porch and verandah soffits' });
  if (!plan.flat) pushPaint({ hex: ext, kind: 'ext', sec: 'roof', area: tankExt, what: 'Water tank room' });
  else pushPaint({ hex: intWhite, kind: 'ext', sec: 'roof', area: polyArea(T2.slab) - polyArea(T2.outline), what: 'Roof overhang soffit' });
  for (const sec of SEC) {
    const secM2 = paintRows.filter((p) => p.sec === sec).reduce((s, p) => s + p.area * m2, 0);
    add('primer', sec, secM2 / A.primerCoverage);
  }

  // floor finishes
  const finishRows = [];
  for (const r of house.rooms) {
    if (!r.finish) continue;
    // the user's choice for this room, else this house's own default (styles differ on the terrace)
    const fin = designer.floors[r.id] || r.finish;
    const d = r.data, sec = secOf(r.floor);
    const skirt = d.wet || d.outdoor || fin === 'paving' ? 0 : polyPerim(d.poly) * (A.skirting / 12);
    const qty = d.area + skirt;
    add(fin, sec, qty);
    if (fin === 'paving') add('sand', sec, (d.area * (2 / 12)) / CUBE);
    else mortar(sec, qty * 20 * MM, fin === 'wood' ? [1, 3] : [1, 4]);
    finishRows.push({ sec, room: d.terrace ? 'Roof terrace' : d.name, finish: fin, area: d.area, skirting: skirt });
  }
  finishRows.push({ sec: 'gf', room: 'Staircase treads & risers', finish: 'tiles', area: stairFinish, skirting: 0 });
  // merge the terrace pieces into one row
  const merged = [];
  for (const f of finishRows) {
    const same = merged.find((g) => g.room === 'Roof terrace' && f.room === 'Roof terrace' && g.finish === f.finish);
    if (same) { same.area += f.area; continue; }
    merged.push({ ...f });
  }

  // waterproofing: bath floors (+ upturns) and balconies
  for (const fk of plan.floorKeys) for (const r of plan.floors[fk].rooms) {
    if (r.wet) add('waterproof', secOf(fk), r.area * 1.3);
    else if (r.outdoor && !r.terrace && fk !== 'gf') add('waterproof', secOf(fk), r.area);
  }

  // ------------------------------------------------------------ pitched roof
  if (!plan.flat) {
    const sN = (R.ridge - R.eaves) / (R.ridgeY - R.wallLineNorth), sS = (R.ridge - R.eaves) / (R.wallLineSouth - R.ridgeY);
    const planes = [[R.north, sN], [R.south, sS]].map(([poly, s]) => {
      const area = polyArea(poly), ys = poly.map((p) => p[1]);
      const depth = Math.max(...ys) - Math.min(...ys), width = area / depth, k = Math.sqrt(1 + s * s);
      return { area: area * k, width, slopeLen: depth * k };
    });
    const roofArea = planes.reduce((s, p) => s + p.area, 0);
    const sheets = (roofArea / A.sheetCover) * 1.05;
    add('sheets', 'roof', sheets); add('fixings', 'roof', sheets);
    // ridge = the north plane's edges that lie on the ridge line (the tank room takes the rest)
    let ridgeLen = 0;
    R.north.forEach((p, i) => {
      const q = R.north[(i + 1) % R.north.length];
      if (Math.abs(p[1] - R.ridgeY) < 0.05 && Math.abs(q[1] - R.ridgeY) < 0.05) ridgeLen += Math.abs(q[0] - p[0]);
    });
    add('ridge', 'roof', Math.ceil(ridgeLen / 3) + 1);
    let tCuft = 0, eaves = 0, rakes = 0;
    for (const p of planes) {
      tCuft += (Math.ceil(p.width / A.rafter) + 1) * p.slopeLen * (8 / 144);   // 2"×4" rafters
      tCuft += (Math.ceil(p.slopeLen / A.batten) + 1) * p.width * (4 / 144);   // 2"×2" battens
      tCuft += p.width * (12 / 144);                                            // 3"×4" wall plate
      eaves += p.width; rakes += 2 * p.slopeLen;
    }
    tCuft += ridgeLen * (12 / 144);                                             // 2"×6" ridge plate
    add('timber', 'roof', tCuft * 1.1);
    add('gutter', 'roof', eaves); add('downpipe', 'roof', 4 * (R.eaves + 1));
    add('valance', 'roof', eaves + rakes);
    add('glassCover', 'roof', polyArea(lw));
    el('roof', `Roof sheeting on slope (${planes.map((p) => p.area.toFixed(0)).join(' + ')} sq ft)`, roofArea, 'sq ft');
  } else {
    // flat roof drains: rainwater outlets and downpipes down the building
    add('downpipe', 'roof', 4 * (M_.rf.ffl + 1));
  }

  // car porch canopy
  const C = R.carPorchRoof;
  const canopy = polyArea(C.poly);
  switch (st.canopy || 'sheet') {
    case 'sheet': add('canopySheet', 'roof', canopy * 1.1); add('canopySteel', 'roof', canopy * 2.5); break;
    case 'concrete': concrete('roof', canopy * 0.55, RCC); bars('roof', 10, canopy * 4 * 1.3); el('roof', `Concrete car porch canopy (${canopy.toFixed(0)} sq ft)`, canopy * 0.55, 'cu ft'); break;
    case 'glass': case 'steelGlass': add('glassCanopy', 'roof', canopy); break;
    case 'pergola': add('pergola', 'roof', canopy); break;
    default: break;
  }

  // ------------------------------------------------------------ railings, screens, vents
  const RAIL_KEY = { glass: 'glassRail', glassGold: 'glassRail', glassSolid: 'glassRail', timber: 'timberRail', vslats: 'timberRail', black: 'railing', steel: 'railing' };
  for (const fk of plan.floorKeys) for (const w of walls(fk)) {
    if (w.kind !== 'parapet' || !/rail|bal/.test(w.id)) continue;
    const external = /bal|rf-rail/.test(w.id);
    const key = external ? RAIL_KEY[st.rail] : 'railing';
    if (key) add(key, secOf(fk), w.length);
  }
  const scr = walls('gf').filter((w) => w.kind === 'screen').reduce((s, w) => s + w.length, 0);
  add('screen', 'gf', scr * (M_.gf.ceil - M_.gf.ffl));
  for (const fk of plan.floorKeys) for (const w of walls(fk)) for (const o of w.openings) {
    if (o.kind !== 'vent') continue;
    if (o.vent === 'jali') add('jali', secOf(fk), o.width * o.height); else add('vent', secOf(fk), o.width);
  }

  // ------------------------------------------------------------ facade & style
  for (const [m, byFloor] of Object.entries(house.clad || {})) {
    const area = Object.values(byFloor).reduce((s, v) => s + v, 0);
    add(CLAD_PRICE[m] || 'cladStone', 'ext', area);
    mortar('ext', area * 15 * MM, [1, 3]); // fixing bed
  }
  for (const x of house.extras || []) {
    if (x.key === 'frameConcrete') { concrete('ext', x.qty, RCC); add('t10', 'ext', x.qty * 2.5); el('ext', `Projecting concrete frames (${x.note})`, x.qty, 'cu ft'); continue; }
    add(x.key, x.sec || 'ext', x.qty);
  }

  // ------------------------------------------------------------ wastage, binding wire
  const waste = { cement: A.wasteCement, sand: A.wasteSand, metal: A.wasteMetal, r6: A.wasteSteel, t10: A.wasteSteel, t12: A.wasteSteel, t16: A.wasteSteel, bricks: A.wasteBricks, block6: A.wasteBricks, block4: A.wasteBricks, tiles: A.wasteTiles, bathTiles: A.wasteTiles, marble: A.wasteTiles, granite: A.wasteTiles, wood: A.wasteTiles, paving: A.wasteTiles, terracotta: A.wasteTiles, wallTiles: A.wasteTiles, graniteTop: A.wasteTiles };
  for (const [k, pct] of Object.entries(waste)) if (Q[k]) for (const s in Q[k]) Q[k][s] *= 1 + pct / 100;
  for (const s of SEC) {
    const kg = ['r6', 't10', 't12', 't16'].reduce((t, k) => t + (Q[k]?.[s] || 0), 0);
    add('wire', s, kg * 0.01);
  }

  // doors and windows (arches are masonry openings and vents are priced per foot above)
  const openings = {};
  for (const fk of plan.floorKeys) for (const w of walls(fk)) for (const o of w.openings) {
    if (o.kind === 'arch' || o.kind === 'vent') continue;
    const s = plan.schedule[o.tag] || { w: o.width, h: o.height, desc: o.kind };
    openings[o.tag] ||= { tag: o.tag, kind: o.kind, desc: s.desc, w: s.w, h: s.h, size: `${ftinS(s.w)} × ${ftinS(s.h)}`, qty: Object.fromEntries(SEC.map((k) => [k, 0])) };
    openings[o.tag].qty[secOf(fk)]++;
  }

  return { Q, sections, elements, openings: Object.values(openings).sort((a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true })), paintRows, finishRows: merged, walling };
}

function ftinS(f) { let ft = Math.floor(f + 1e-6), i = Math.round((f - ft) * 12); if (i === 12) { ft++; i = 0; } return `${ft}'-${i}"`; }
function colourName(hex, st) {
  const h = hex.toLowerCase();
  const p = PALETTE.find(([, c]) => c.toLowerCase() === h);
  if (p) return p[0];
  if (h === '#fbfaf7') return 'Ceiling white';
  if (h === '#f2eee6') return 'Default interior';
  if (h === '#e9e2d3') return 'Default exterior';
  if (st && h === (st.ext || '').toLowerCase()) return `${st.name} exterior`;
  for (const q of st?.paint || []) if (h === q.color.toLowerCase()) return `${st.name} accent`;
  return 'Custom ' + hex;
}

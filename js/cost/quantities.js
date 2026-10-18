// Material quantity take-off from the model (plan geometry + current design).
// Works in feet / cubic feet; results per section: fd (foundation), gf, uf, roof.
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

export function computeQuantities({ plan, house, designer, A, walling }) {
  const L = plan.levels;
  const Q = {};
  const add = (key, sec, v) => { if (!v || !isFinite(v)) return; (Q[key] ||= { fd: 0, gf: 0, uf: 0, roof: 0 })[sec] += v; };
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

  // ------------------------------------------------------------ foundation
  const gfW = plan.floors.gf.walls.filter(masonry);
  const ufW = plan.floors.uf.walls.filter(masonry);
  const gfCols = plan.floors.gf.columns, ufCols = plan.floors.uf.columns;
  const ecc = gfCols.filter(([x]) => x < 1).length, typ = gfCols.length - ecc;
  const fVol = 3 * 3 * (10 / 12);
  concrete('fd', gfCols.length * fVol, RCC);
  concrete('fd', gfCols.length * 3 * 3 * (2 / 12), MASS);
  bars('fd', 10, typ * 14 * 3.67); // T10 @ 6" both ways, 7 bars each way, bent ends
  bars('fd', 12, ecc * 14 * 3.67);
  el('fd', `Column footings 3'×3'×10" (${typ} typical, ${ecc} eccentric)`, gfCols.length * fVol, 'cu ft');

  const Lpb = gfW.filter(thick).reduce((s, w) => s + w.length, 0);
  const Lrub = Math.max(0, Lpb - gfCols.length * 3);
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

  const gfRooms = plan.floors.gf.rooms, ufRooms = plan.floors.uf.rooms;
  const gfArea = gfRooms.reduce((s, r) => s + r.area, 0);
  concrete('fd', gfArea * (A.gfConcrete / 12), MASS);
  el('fd', `Ground floor concrete ${A.gfConcrete}" (1:3:6)`, gfArea, 'sq ft');
  const fill = gfRooms.reduce((s, r) => s + r.area * Math.max(0, r.level - A.gfConcrete / 12 - 0.1), 0);
  add('earth', 'fd', fill / CUBE);
  el('fd', 'Earth filling under the ground floor', fill, 'cu ft');

  // ------------------------------------------------------------ columns
  const depthTyp = 3 - 10 / 12, depthEcc = 3.5 - 10 / 12;
  for (const [x] of gfCols) {
    const h = (x < 1 ? depthEcc : depthTyp) + L.uf;
    concrete('gf', h * COLS * COLS, RCC);
    bars('gf', x < 1 ? 16 : 12, 4 * (h + 1.5 + 2));
    ties('gf', h, 0.5, 2.67);
  }
  el('gf', `Columns 9"×9" from footing to upper floor (${gfCols.length})`, gfCols.length * (depthTyp + L.uf) * COLS * COLS, 'cu ft');
  const ufColH = L.ufEaves - L.uf;
  concrete('uf', ufCols.length * ufColH * COLS * COLS, RCC);
  bars('uf', 12, ufCols.length * 4 * (ufColH + 2));
  ties('uf', ufColH * ufCols.length, 0.5, 2.67);
  el('uf', `Columns 9"×9", upper floor (${ufCols.length})`, ufCols.length * ufColH * COLS * COLS, 'cu ft');

  // ------------------------------------------------------------ walls (masonry, lintels)
  const wallArea = { gf: { six: 0, four: 0 }, uf: { six: 0, four: 0 }, roof: { six: 0, four: 0 } };
  const lintels = (sec, w) => {
    for (const o of w.openings) {
      const len = o.width + 1, t = w.thickness;
      concrete(sec, len * t * 0.5, RCC);
      bars(sec, 10, len * (thick(w) ? 4 : 2));
      ties(sec, len, 0.667, thick(w) ? 1.67 : 1.33);
    }
  };
  const wallTake = (sec, walls, cols, height) => {
    for (const w of walls) {
      let h = w.height != null ? w.height : height;
      let area = w.length * h;
      if (sec === 'uf' && w.height == null && extWalls.has(w.id)) {
        // gable infill up to the roof on outside walls
        const ux = (w.b[0] - w.a[0]) / w.length, uy = (w.b[1] - w.a[1]) / w.length;
        for (let s = 0.125; s < w.length; s += 0.25) area += 0.25 * Math.max(0, house.roofZ(w.a[1] + uy * s) - 0.05 - L.ufEaves);
      }
      for (const o of w.openings) area -= o.width * Math.min(o.height, h);
      for (const c of cols) if (dist(c, w.a, w.b) < w.thickness / 2 + 0.3) area -= 0.5 * COLS * h;
      wallArea[sec][thick(w) ? 'six' : 'four'] += Math.max(0, area);
      lintels(sec, w);
    }
  };
  wallTake('gf', gfW, gfCols, L.uf - 1 - L.gf);          // plinth (FFL) to floor-beam soffit
  wallTake('uf', ufW, ufCols, L.ufEaves - 0.5 - L.uf);   // floor to ring-beam soffit

  // tank room walls
  const T = plan.roof.tankRoom;
  const tW = T.poly[2][0] - T.poly[0][0], tD = T.poly[2][1] - T.poly[0][1];
  const tPer = 2 * (tW - 0.5 + tD - 0.5);
  wallArea.roof.six += tPer * (T.top - L.ufEaves - plan.slab);

  for (const sec of ['gf', 'uf', 'roof']) {
    const { six, four } = wallArea[sec];
    if (walling === 'blocks') {
      add('block6', sec, six * 1.05); add('block4', sec, four * 1.05);
      mortar(sec, six * 0.035 + four * 0.025, [1, 5]);
    } else {
      add('bricks', sec, (six + four) * 5.5);
      mortar(sec, (six + four) * 0.062, [1, 5]);
    }
    if (six + four) el(sec, `${walling === 'blocks' ? 'Block' : 'Brick'}work: 6" walls ${six.toFixed(0)} sq ft, 4" walls ${four.toFixed(0)} sq ft`, six + four, 'sq ft');
  }

  // ------------------------------------------------------------ beams and slabs
  const Lfb = ufW.filter(thick).reduce((s, w) => s + w.length, 0);
  const slabT = A.slab / 12;
  concrete('gf', Lfb * 0.75 * (1 - slabT), RCC);
  bars('gf', 16, Lfb * 2 * 1.1); bars('gf', 12, Lfb * 2 * 1.1);
  ties('gf', Lfb, 0.5, 3.17);
  el('gf', `Floor beams 9"×12" under upper walls (${Lfb.toFixed(0)} ft)`, Lfb * 0.75 * (1 - slabT), 'cu ft');

  const ufSlab = ufRooms.reduce((s, r) => s + r.area, 0) + ufW.reduce((s, w) => s + w.length * w.thickness, 0);
  concrete('gf', ufSlab * slabT, RCC);
  bars('gf', 10, ufSlab * 4 * 1.3 * 1.05);
  el('gf', `Upper floor slab ${A.slab}" (${ufSlab.toFixed(0)} sq ft)`, ufSlab * slabT, 'cu ft');

  concrete('uf', Lfb * 0.25, RCC);
  bars('uf', 10, Lfb * 4 * 1.1);
  ties('uf', Lfb, 0.667, 1.67);
  el('uf', `Ring beam 6"×6" at wall plate (${Lfb.toFixed(0)} ft)`, Lfb * 0.25, 'cu ft');

  // staircase: 2 flights + winders, 5" waist
  const S = plan.stair;
  const flight = Math.hypot(7 * 0.75, 7 * S.riser);
  const landing = (S.winder.x2 - S.winder.x) * (S.winder.y2 - S.winder.y);
  const stairSlab = 2 * flight * S.width + landing;
  const stairVol = stairSlab * slabT + S.risers * 0.5 * 0.75 * S.riser * S.width;
  concrete('gf', stairVol, RCC);
  bars('gf', 10, stairSlab * (2 + 1.33) * 1.15);
  el('gf', 'RCC staircase, 18 risers', stairVol, 'cu ft');

  // tank room: slab (light well cut out), beams, top band, column extensions
  const lw = plan.floors.uf.voids.find((v) => v.id === 'lightwell').poly;
  const tankSlab = tW * tD - polyArea(lw);
  concrete('roof', tankSlab * slabT, RCC);
  bars('roof', 10, tankSlab * 4 * 1.3 * 1.05);
  concrete('roof', tPer * 0.75 * (0.75 - slabT), RCC);
  bars('roof', 12, tPer * 4 * 1.1); ties('roof', tPer, 0.5, 2.67);
  concrete('roof', tPer * 0.25, RCC);
  bars('roof', 10, tPer * 4 * 1.1); ties('roof', tPer, 0.667, 1.67);
  const tColH = T.top - L.ufEaves;
  concrete('roof', 2 * tColH * COLS * COLS, RCC);
  bars('roof', 12, 2 * 4 * (tColH + 2)); ties('roof', 2 * tColH, 0.5, 2.67);
  el('roof', `Water tank floor slab and beams (${tankSlab.toFixed(0)} sq ft)`, tankSlab * slabT + tPer * 0.75 * (0.75 - slabT), 'cu ft');

  // ------------------------------------------------------------ plaster, tiles, paint
  const ceilH = (r, fk) => (fk === 'gf' ? L.uf - plan.slab : L.ufEaves) - r.level;
  const roomOf = (fk, id) => plan.floors[fk].rooms.find((r) => r.id === id);
  const tiled = new Map(); // face key → tiled sq ft
  const rawArea = { int: { gf: 0, uf: 0 }, ext: { gf: 0, uf: 0 } };
  for (const f of house.faces.values()) {
    rawArea[f.exterior ? 'ext' : 'int'][f.floor] += f.area;
    const r = f.roomId && roomOf(f.floor, f.roomId);
    if (r && r.wet) {
      const t = f.area * Math.min(1, A.bathTileHeight / ceilH(r, f.floor));
      tiled.set(f.key, t);
      add('wallTiles', f.floor, t);
    }
  }
  for (const fk of ['gf', 'uf']) {
    const allow = 1 + A.plasterAllow / 100;
    mortar(fk, rawArea.int[fk] * 20 * MM * allow, [1, 5]);
    mortar(fk, rawArea.ext[fk] * 25 * MM * allow, [1, 5]);
    el(fk, `Plaster: internal ${rawArea.int[fk].toFixed(0)} sq ft (20 mm), external ${rawArea.ext[fk].toFixed(0)} sq ft (25 mm)`, rawArea.int[fk] + rawArea.ext[fk], 'sq ft');
  }
  mortar('gf', ufSlab * 12 * MM * (1 + A.plasterAllow / 100), [1, 3]);
  el('gf', 'Ceiling plaster under upper slab, 12 mm', ufSlab, 'sq ft');
  const tankExt = tPer * (T.top - L.ufEaves), tankInt = tPer * (T.top - T.floor);
  mortar('roof', (tankExt * 25 * MM + tankInt * 20 * MM) * (1 + A.plasterAllow / 100), [1, 5]);

  // kitchen counters: granite top and backsplash tiles, taken off the walls of their room
  const backsplash = {}; // room id → sq ft
  for (const it of designer.items) {
    if (!it.type.startsWith('counter')) continue;
    add('graniteTop', it.floor, it.w * it.d);
    const t = it.w * A.backsplash;
    add('wallTiles', it.floor, t);
    const r = plan.floors[it.floor].rooms.find((q) => pointInPoly([it.x, it.y], q.poly));
    if (r) backsplash[r.id] = (backsplash[r.id] || 0) + t;
  }

  // paint by colour (interior walls), ceilings, exterior
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
    let area = f.area - (tiled.get(f.key) || 0);
    if (!f.exterior && f.roomId && backsplash[f.roomId]) area -= (backsplash[f.roomId] * area) / roomPaintArea[f.roomId];
    if (area <= 0) continue;
    const kind = f.exterior ? 'ext' : 'int';
    const k = kind + hex + f.floor;
    if (!colours.has(k)) colours.set(k, { hex, kind, floor: f.floor, area: 0 });
    colours.get(k).area += area;
  }
  const intWhite = '#fbfaf7';
  const gfCeil = gfRooms.filter((r) => !r.outdoor).reduce((s, r) => s + r.area, 0);
  const ufCeil = A.ufCeiling ? ufRooms.filter((r) => !r.outdoor).reduce((s, r) => s + r.area, 0) + polyArea(plan.floors.uf.voids.find((v) => v.id === 'stairwell').poly) : 0;
  if (ufCeil) add('ceiling', 'uf', ufCeil);
  let primerM2 = 0;
  const pushPaint = (row) => {
    const isExt = row.kind === 'ext';
    const coats = isExt ? A.extCoats : lightness(row.hex) < 0.35 ? A.darkCoats : A.coats;
    const litres = (row.area * m2 * coats) / (isExt ? A.extCoverage : A.coverage);
    add(isExt ? 'paintExt' : 'paintInt', row.sec, litres);
    primerM2 += row.area * m2;
    paintRows.push({ ...row, coats, litres, name: colourName(row.hex) });
  };
  for (const c of colours.values()) pushPaint({ hex: c.hex, kind: c.kind, sec: c.floor, area: c.area, what: c.kind === 'ext' ? 'Exterior walls' : 'Interior walls' });
  pushPaint({ hex: intWhite, kind: 'int', sec: 'gf', area: gfCeil, what: 'Ceilings' });
  if (ufCeil) pushPaint({ hex: intWhite, kind: 'int', sec: 'uf', area: ufCeil, what: 'Ceilings' });
  const soffits = gfRooms.filter((r) => r.outdoor).reduce((s, r) => s + r.area, 0) * 0.6;
  pushPaint({ hex: '#e9e2d3', kind: 'ext', sec: 'gf', area: soffits, what: 'Porch and verandah soffits' });
  pushPaint({ hex: '#e9e2d3', kind: 'ext', sec: 'roof', area: tankExt, what: 'Water tank room' });
  for (const sec of ['gf', 'uf', 'roof']) {
    const secM2 = paintRows.filter((p) => p.sec === sec).reduce((s, p) => s + p.area * m2, 0);
    add('primer', sec, secM2 / A.primerCoverage);
  }

  // floor finishes
  const finishRows = [];
  for (const r of house.rooms) {
    if (!r.finish) continue;
    const fin = designer.finishOf(r.id);
    const d = r.data;
    const skirt = d.wet || d.outdoor || fin === 'paving' ? 0 : polyPerim(d.poly) * (A.skirting / 12);
    const qty = d.area + skirt;
    add(fin, r.floor, qty);
    if (fin === 'paving') add('sand', r.floor, (d.area * (2 / 12)) / CUBE);
    else mortar(r.floor, qty * 20 * MM, fin === 'wood' ? [1, 3] : [1, 4]);
    finishRows.push({ sec: r.floor, room: d.name, finish: fin, area: d.area, skirting: skirt });
  }
  const stairFinish = S.risers * (0.75 + S.riser) * S.width;
  add('tiles', 'gf', stairFinish); mortar('gf', stairFinish * 20 * MM, [1, 4]);
  finishRows.push({ sec: 'gf', room: 'Staircase treads & risers', finish: 'tiles', area: stairFinish, skirting: 0 });

  // waterproofing: bath floors (+ upturns) and balconies
  for (const [fk, fl] of Object.entries(plan.floors)) for (const r of fl.rooms) {
    if (r.wet) add('waterproof', fk, r.area * 1.3);
    else if (r.outdoor && fk === 'uf') add('waterproof', fk, r.area);
  }

  // ------------------------------------------------------------ roof
  const R = plan.roof;
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
  const canopy = polyArea(R.carPorchRoof.poly);
  add('canopySheet', 'roof', canopy * 1.1); add('canopySteel', 'roof', canopy * 2.5);
  el('roof', `Roof sheeting on slope (${planes.map((p) => p.area.toFixed(0)).join(' + ')} sq ft)`, roofArea, 'sq ft');

  // ------------------------------------------------------------ other
  const railLen = plan.floors.uf.walls.filter((w) => /rail|bal/.test(w.id)).reduce((s, w) => s + w.length, 0);
  add('railing', 'uf', railLen);
  add('railing', 'gf', 2 * flight + 2);
  const scr = plan.floors.gf.walls.filter((w) => w.kind === 'screen').reduce((s, w) => s + w.length, 0);
  add('screen', 'gf', scr * (L.uf - plan.slab - L.gf));

  // ------------------------------------------------------------ wastage, binding wire
  const waste = { cement: A.wasteCement, sand: A.wasteSand, metal: A.wasteMetal, r6: A.wasteSteel, t10: A.wasteSteel, t12: A.wasteSteel, t16: A.wasteSteel, bricks: A.wasteBricks, block6: A.wasteBricks, block4: A.wasteBricks, tiles: A.wasteTiles, bathTiles: A.wasteTiles, marble: A.wasteTiles, granite: A.wasteTiles, wood: A.wasteTiles, paving: A.wasteTiles, wallTiles: A.wasteTiles, graniteTop: A.wasteTiles };
  for (const [k, pct] of Object.entries(waste)) if (Q[k]) for (const s in Q[k]) Q[k][s] *= 1 + pct / 100;
  for (const s of ['fd', 'gf', 'uf', 'roof']) {
    const kg = ['r6', 't10', 't12', 't16'].reduce((t, k) => t + (Q[k]?.[s] || 0), 0);
    add('wire', s, kg * 0.01);
  }

  // doors and windows (arches are masonry openings, not priced items)
  const openings = {};
  for (const [fk, fl] of Object.entries(plan.floors)) for (const w of fl.walls) for (const o of w.openings) {
    if (o.kind === 'arch') continue;
    const s = plan.schedule[o.tag];
    openings[o.tag] ||= { tag: o.tag, desc: s.desc, size: `${ftinS(s.w)} × ${ftinS(s.h)}`, qty: { gf: 0, uf: 0 } };
    openings[o.tag].qty[fk]++;
  }

  return { Q, elements, openings: Object.values(openings).sort((a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true })), paintRows, finishRows, walling };
}

function ftinS(f) { let ft = Math.floor(f + 1e-6), i = Math.round((f - ft) * 12); if (i === 12) { ft++; i = 0; } return `${ft}'-${i}"`; }
function colourName(hex) {
  const p = PALETTE.find(([, c]) => c.toLowerCase() === hex.toLowerCase());
  if (p) return p[0];
  if (hex.toLowerCase() === '#fbfaf7') return 'Ceiling white';
  if (hex.toLowerCase() === '#f2eee6') return 'Default interior';
  if (hex.toLowerCase() === '#e9e2d3') return 'Default exterior';
  return 'Custom ' + hex;
}

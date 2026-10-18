// Unit prices (LKR) and estimating assumptions. Rates are rough PLACEHOLDERS for Colombo,
// meant to be replaced with current quotes in the Cost tab. Material only, no labour.

export const SECTIONS = [
  ['fd', 'Foundation'],
  ['gf', 'Ground floor'],
  ['uf', 'Upper floor'],
  ['roof', 'Roof & tank'],
];

// key → [category, description, unit, placeholder rate]
export const PRICE_LIST = {
  cement: ['Concrete & masonry', 'Cement (50 kg bag)', 'bag', 2500],
  sand: ['Concrete & masonry', 'Sand', 'cube', 26000],
  metal: ['Concrete & masonry', 'Metal / aggregate ¾"', 'cube', 15000],
  rubble: ['Concrete & masonry', 'Rubble (foundation stone)', 'cube', 9000],
  earth: ['Concrete & masonry', 'Earth / gravel filling', 'cube', 6500],
  r6: ['Steel', 'Steel R6 (6 mm mild steel)', 'kg', 310],
  t10: ['Steel', 'Steel T10 (10 mm tor)', 'kg', 300],
  t12: ['Steel', 'Steel T12 (12 mm tor)', 'kg', 300],
  t16: ['Steel', 'Steel T16 (16 mm tor)', 'kg', 300],
  wire: ['Steel', 'Binding wire', 'kg', 450],
  bricks: ['Walling', 'Bricks', 'nos', 25],
  block6: ['Walling', 'Cement blocks 6"', 'nos', 95],
  block4: ['Walling', 'Cement blocks 4"', 'nos', 75],
  tiles: ['Floor & wall finishes', 'Floor tiles, ceramic 2×2', 'sq ft', 280],
  bathTiles: ['Floor & wall finishes', 'Floor tiles, anti-skid 1×1', 'sq ft', 250],
  marble: ['Floor & wall finishes', 'Marble', 'sq ft', 1200],
  granite: ['Floor & wall finishes', 'Granite flooring', 'sq ft', 950],
  wood: ['Floor & wall finishes', 'Wood flooring', 'sq ft', 750],
  paving: ['Floor & wall finishes', 'Paving blocks', 'sq ft', 180],
  wallTiles: ['Floor & wall finishes', 'Wall tiles', 'sq ft', 260],
  graniteTop: ['Floor & wall finishes', 'Kitchen counter granite top', 'sq ft', 950],
  paintInt: ['Paint', 'Interior emulsion', 'litre', 2600],
  paintExt: ['Paint', 'Exterior weather-coat', 'litre', 3800],
  primer: ['Paint', 'Primer / sealer', 'litre', 1900],
  sheets: ['Roofing', 'Cement corrugated sheets 8 ft', 'nos', 4000],
  ridge: ['Roofing', 'Ridge capping', 'nos', 1600],
  fixings: ['Roofing', 'Roof fixing sets (per sheet)', 'set', 300],
  timber: ['Roofing', 'Treated timber (rafters, battens, plates)', 'cu ft', 7500],
  gutter: ['Roofing', 'Zn/Al gutters', 'rft', 1100],
  downpipe: ['Roofing', 'Downpipes', 'rft', 650],
  valance: ['Roofing', 'Valance / barge boards', 'rft', 450],
  glassCover: ['Roofing', 'Light-well glass cover', 'sq ft', 2500],
  canopySheet: ['Roofing', 'Car porch canopy sheets', 'sq ft', 450],
  canopySteel: ['Roofing', 'Car porch canopy steel frame', 'kg', 650],
  ceiling: ['Other', 'Ceiling boards with frame (upper floor)', 'sq ft', 280],
  railing: ['Other', 'Steel railings and handrails', 'rft', 4500],
  screen: ['Other', 'Timber screen', 'sq ft', 3500],
  waterproof: ['Other', 'Waterproofing (baths, balconies)', 'sq ft', 120],
};

// Doors and windows, priced each (complete with frame and ironmongery)
export const OPENING_PRICES = {
  D01: 95000, D02: 75000, D03: 55000, D04: 32000, D05: 45000, D06: 48000,
  W01: 81000, W02: 54000, W03: 34000, W04: 20500,
  SD01: 105000, SD02: 105000, SD03: 157500, SD04: 91000, SD05: 168000, F01: 18000,
};

export const DEFAULT_RATES = Object.fromEntries([
  ...Object.entries(PRICE_LIST).map(([k, v]) => [k, v[3]]),
  ...Object.entries(OPENING_PRICES).map(([k, v]) => ['op:' + k, v]),
]);

// Editable assumptions: [label, unit, default, group]
export const ASSUMPTIONS = {
  wasteCement: ['Cement wastage', '%', 2, 'Wastage'],
  wasteSand: ['Sand wastage', '%', 10, 'Wastage'],
  wasteMetal: ['Metal wastage', '%', 5, 'Wastage'],
  wasteSteel: ['Steel wastage and laps', '%', 7, 'Wastage'],
  wasteBricks: ['Brick / block breakage', '%', 5, 'Wastage'],
  wasteTiles: ['Tile & stone cutting waste', '%', 8, 'Wastage'],
  plasterAllow: ['Extra plaster mortar for uneven walls', '%', 20, 'Wastage'],
  coverage: ['Paint coverage, interior', 'm² per litre per coat', 10, 'Paint'],
  coats: ['Interior coats', 'coats', 2, 'Paint'],
  darkCoats: ['Coats for dark colours', 'coats', 3, 'Paint'],
  extCoverage: ['Paint coverage, exterior', 'm² per litre per coat', 8, 'Paint'],
  extCoats: ['Exterior coats', 'coats', 2, 'Paint'],
  primerCoverage: ['Primer coverage (1 coat)', 'm² per litre', 10, 'Paint'],
  bathTileHeight: ['Bathroom wall tiles up to', 'ft', 7, 'Finishes'],
  backsplash: ['Kitchen backsplash height', 'ft', 2, 'Finishes'],
  skirting: ['Tile skirting height', 'in', 4, 'Finishes'],
  slab: ['Floor slab thickness', 'in', 5, 'Structure'],
  gfConcrete: ['Ground floor concrete (1:3:6)', 'in', 3, 'Structure'],
  rubbleW: ['Rubble foundation width', 'ft', 1.5, 'Structure'],
  rubbleD: ['Rubble foundation depth', 'ft', 2.5, 'Structure'],
  rafter: ['Rafter spacing', 'ft', 2, 'Roof'],
  batten: ['Batten / purlin spacing', 'ft', 3, 'Roof'],
  sheetCover: ['Effective cover per roof sheet', 'sq ft', 22.5, 'Roof'],
  ufCeiling: ['Ceiling boards on upper floor (1 = yes, 0 = no)', '', 1, 'Finishes'],
};
export const DEFAULT_ASSUMPTIONS = Object.fromEntries(Object.entries(ASSUMPTIONS).map(([k, v]) => [k, v[2]]));

export const NOTES = [
  'Material quantities only: no labour, transport, formwork, scaffolding, plumbing, electrical, sanitary fittings or kitchen cabinets.',
  'Structural concrete 1:2:4 (¾" metal). Lean and mass concrete 1:3:6. Brickwork mortar 1:5, plaster 1:5 (ceilings 1:3), tile bedding 1:4.',
  'Footings 3\'-0" × 3\'-0" × 10": 5 eccentric footings on the west boundary (4T16 columns, T12 @ 6" mesh), 7 typical (4T12, T10 @ 6"), as drawn.',
  'Columns 9" × 9", ties R6 @ 6". Plinth beam 6" × 6" with 4T10, as drawn.',
  'Not on the drawings, assumed: floor beams 9" × 12" (2T16 + 2T12, R6 @ 6"); 5" slabs with T10 @ 6" both ways plus 30% top steel; ring beam 6" × 6" (4T10); lintels 6" deep (4T10, 2T10 in 4" walls).',
  'Bricks at 5.5 per sq ft of half-brick wall; cement blocks at 1.05 per sq ft. Openings and columns are deducted from wall areas.',
  'Dry volume factors: concrete ×1.54, mortar ×1.30. One cement bag = 1.226 cu ft. One cube = 100 cu ft.',
  'Paint litres follow the colours on the model: dark colours get extra coats. Bathrooms are tiled to the set height; the kitchen backsplash follows the counters placed in the model.',
  'Rates are placeholders. Replace them with current Colombo market prices.',
];

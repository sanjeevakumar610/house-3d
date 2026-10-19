// Facade styles. Option 0 is the architect's design; 1-9 are flat-roof facelifts. Each style is
// plain data read by variant.js (openings, balconies, roof) and facade.js / build.js (looks).
//
// openings:  frontBalcony  clear depth of the front balconies, ft
//            side          window added on the east (side) walls { tag, w, h, sill, kind }
//            vents         louvre band above every sliding door (hot air out, rain stays out)
//            frontTall     front sliding doors become floor-to-ceiling glass
//            corner        fixed corner glass beside Bed 03's balcony
//            entryTall     tall glass beside the front door
//            arched        arched heads on windows and sliding doors
//            grid          steel-look grid frames on every window
// clad:      overlay finishes on outside wall faces { floors, orient, walls, z:[from,to] above FFL, mat }
// paint:     default outside colours for some faces { floors, orient, walls, color }
// features:  extra geometry built by facade.js

export const STYLES = [
  {
    id: 'original', n: 0, name: 'Original', long: 'Original (as drawn)',
    blurb: "The architect's design: pitched cement-sheet roof, aluminium windows and steel railings.",
    changes: ['Openings exactly as drawn'],
    swatch: ['#e9e2d3', '#ffffff', '#5c6166'],
    roof: 'pitched', ext: '#e9e2d3', frame: 'alu', glass: 'clear', rail: 'steel', canopy: 'sheet', factor: 1,
    openings: {}, clad: [], paint: [], features: [],
  },
  {
    id: 'tropical', n: 1, name: 'Tropical Modern',
    blurb: 'White walls under a thin roof slab that overhangs 4 ft, timber-look fins shading the front glass, a dark stone base and a timber pergola on the roof terrace.',
    changes: ['Front balconies 4 ft deep', "Side windows 3'×4' on the east walls (dining, entrance, kitchen, Bed 02, Bed 03)", 'Louvre vents above every sliding door'],
    cautions: ['The deeper front balconies project past the building line, so check with the council.'],
    swatch: ['#f4f2ec', '#a0703f', '#3b3d3f'],
    roof: 'flat', overhang: 4, fascia: { h: 0.6, mat: 'white' }, ext: '#f4f2ec', frame: 'charcoal', glass: 'clear', rail: 'glass', canopy: 'pergola', terraceFinish: 'wood', factor: 1.05,
    openings: { frontBalcony: 4, side: { tag: 'W05', w: 3, h: 4, sill: 3 }, vents: true },
    clad: [
      { floors: ['gf'], orient: 'all', z: [-1, 2.5], mat: 'stoneDark' },
      { floors: 'upper', orient: ['front'], walls: /bed4-south$/, mat: 'timber' },
    ],
    paint: [],
    features: [
      { type: 'fins', at: 'bal3', mat: 'timberFin', spacing: 0.85, depth: 0.7, width: 0.18 },
      { type: 'pergola', mat: 'timber' },
      { type: 'plants', kind: 'palm', spots: [[16.8, 34.6], [18.3, 38.4]] },
      { type: 'gate', kind: 'hslats', mat: 'timber', pier: 'stoneDark' },
      { type: 'skylight' },
    ],
  },
  {
    id: 'whitebox', n: 2, name: 'White Box',
    blurb: 'Crisp white cubes. A deep concrete frame projects around each front balcony, with black window frames and tall slot windows down the side.',
    changes: ['Front balconies 3 ft deep, inside projecting frames', "Front sliding doors become floor-to-ceiling glass", "Tall slot windows 1'6\"×6' on the east walls"],
    cautions: ['Full-height glass faces the afternoon sun, but the deep frames shade most of it.'],
    swatch: ['#f7f7f4', '#1f2123', '#c8c8c4'],
    roof: 'flat', overhang: 0.75, fascia: { h: 0.6, mat: 'white' }, ext: '#f7f7f4', frame: 'black', glass: 'clear', rail: 'glassSolid', canopy: 'concrete', terraceFinish: 'bathTiles', factor: 1.1,
    openings: { frontBalcony: 3, frontTall: true, side: { tag: 'W06', w: 1.5, h: 6, sill: 1 } },
    clad: [{ floors: ['gf'], orient: 'all', z: [-1, 0.4], mat: 'concrete' }],
    paint: [],
    features: [
      { type: 'frames', mat: 'white', thick: 1.1, project: 1.25 },
      { type: 'plants', kind: 'tree', spots: [[17, 37]] },
      { type: 'gate', kind: 'slotWall', mat: 'white', pier: 'white' },
      { type: 'skylight' },
    ],
  },
  {
    id: 'industrial', n: 3, name: 'Industrial Urban',
    blurb: 'Exposed brick on the front and side, black steel grid windows, a perforated metal screen over the car-porch side and a plain parapet roof.',
    changes: ['Front balconies 3 ft deep', "Big grid windows 4'×5' on the east walls", 'Black steel grid frames on every window', 'Louvre vents above every sliding door'],
    cautions: ['The perforated screen cuts glare and still lets air through, but it darkens Bed 04 a little.'],
    swatch: ['#9a4f36', '#1c1d1f', '#6b6f72'],
    roof: 'flat', overhang: 0.5, fascia: { h: 0.5, mat: 'black' }, ext: '#6b6f72', frame: 'black', glass: 'clear', rail: 'black', canopy: 'steelGlass', terraceFinish: 'paving', factor: 1.35,
    openings: { frontBalcony: 3, side: { tag: 'W07', w: 4, h: 5, sill: 2 }, vents: true, grid: true },
    clad: [
      { floors: 'all', orient: ['front', 'east'], mat: 'brick' },
      { floors: ['rf'], orient: 'all', mat: 'brick' },
    ],
    paint: [],
    features: [
      { type: 'screen', at: 'bal4', kind: 'perforated', mat: 'perforated' },
      { type: 'gate', kind: 'vbars', mat: 'black', pier: 'brick' },
      { type: 'plants', kind: 'tree', spots: [[17, 37]] },
      { type: 'skylight' },
    ],
  },
  {
    id: 'concrete', n: 4, name: 'Concrete & Timber',
    blurb: 'Grey board-marked concrete below and warm timber cladding above, with timber railings, long ribbon windows and planter boxes on every balcony.',
    changes: ['Front balconies 4 ft deep, with planters', "Ribbon windows 6'×2'6\" high on the east walls (privacy plus light)", 'Louvre vents above every sliding door'],
    cautions: ['Timber outside needs oiling every 1 to 2 years in Colombo. Timber-look aluminium (WPC) avoids that.'],
    swatch: ['#a9a59e', '#9b6a3e', '#2b2c2d'],
    roof: 'flat', overhang: 1.5, fascia: { h: 0.75, mat: 'concrete' }, ext: '#d6d1c8', frame: 'charcoal', glass: 'clear', rail: 'timber', canopy: 'concrete', terraceFinish: 'paving', factor: 1.05,
    openings: { frontBalcony: 4, side: { tag: 'W08', w: 6, h: 2.5, sill: 4.5 }, vents: true },
    clad: [
      { floors: ['gf'], orient: 'all', mat: 'concrete' },
      { floors: 'upper', orient: ['front', 'east'], mat: 'timber' },
      { floors: ['rf'], orient: 'all', mat: 'concrete' },
    ],
    paint: [],
    features: [
      { type: 'planters', at: 'all', mat: 'concrete' },
      { type: 'screen', at: 'bal4', kind: 'vslats', mat: 'timber', cover: 0.45 },
      { type: 'gate', kind: 'hslats', mat: 'timber', pier: 'concrete' },
      { type: 'plants', kind: 'tree', spots: [[17, 37]] },
      { type: 'skylight' },
    ],
  },
  {
    id: 'green', n: 5, name: 'Green Facade',
    blurb: 'Earthy sand and terracotta walls, planters on every balcony and the terrace, a green wall along the car porch, and breeze-block (jali) screens that let the house breathe.',
    changes: ['Front balconies 4 ft deep, with planters', "Side windows 3'×4' on the east walls", 'Breeze-block vents above every sliding door'],
    cautions: ['Planters and green walls need drip irrigation and a waterproofed tray, so allow for both.'],
    swatch: ['#d9c7a7', '#b9643f', '#4f7a3a'],
    roof: 'flat', overhang: 2, fascia: { h: 0.6, mat: 'terracotta' }, ext: '#ddcdb0', frame: 'bronze', glass: 'clear', rail: 'planter', canopy: 'pergola', terraceFinish: 'terracotta', factor: 1.1,
    openings: { frontBalcony: 4, side: { tag: 'W05', w: 3, h: 4, sill: 3 }, vents: true, ventKind: 'jali' },
    clad: [{ floors: ['gf'], orient: 'all', z: [-1, 2.5], mat: 'stoneWarm' }],
    paint: [{ floors: 'upper', orient: ['front'], walls: /bed4-south$/, color: '#c07a52' }],
    features: [
      { type: 'planters', at: 'all', mat: 'terracotta' },
      { type: 'greenWall', at: 'porch' },
      { type: 'screen', at: 'stairhead', kind: 'jali', mat: 'jali' },
      { type: 'pergola', mat: 'timber', creepers: true },
      { type: 'plants', kind: 'bush', spots: [[15.6, 34.4], [17.8, 36.4], [16.2, 38.8]] },
      { type: 'gate', kind: 'jali', mat: 'jali', pier: 'stoneWarm' },
      { type: 'skylight' },
    ],
  },
  {
    id: 'luxury', n: 6, name: 'Charcoal & Gold',
    blurb: 'Deep charcoal walls with brass-gold fins, trims and frames, bronze-tinted glass, a black granite base and soft uplights.',
    changes: ['Front balconies 4 ft deep', 'Front sliding doors become floor-to-ceiling bronze glass', "Tall slim windows 2'×7' on the east walls"],
    cautions: ['Dark walls absorb heat. Use a solar-reflective (cool) dark paint and keep the deep overhang.'],
    swatch: ['#3a3c3f', '#c9a14a', '#7a5a3c'],
    roof: 'flat', overhang: 2.5, fascia: { h: 0.7, mat: 'gold' }, ext: '#3d3f42', frame: 'gold', glass: 'bronze', rail: 'glassGold', canopy: 'glass', terraceFinish: 'granite', factor: 1.6,
    openings: { frontBalcony: 4, frontTall: true, side: { tag: 'W09', w: 2, h: 7, sill: 0.5 } },
    clad: [{ floors: ['gf'], orient: 'all', z: [-1, 3], mat: 'stoneBlack' }],
    paint: [],
    features: [
      { type: 'fins', at: 'bal4', mat: 'gold', spacing: 1.6, depth: 0.5, width: 0.16 },
      { type: 'trims', mat: 'gold' },
      { type: 'lights' },
      { type: 'gate', kind: 'vslats', mat: 'gold', pier: 'stoneBlack' },
      { type: 'plants', kind: 'tree', spots: [[17, 37]] },
      { type: 'skylight' },
    ],
  },
  {
    id: 'glass', n: 7, name: 'Glass Modern',
    blurb: 'Large glazed fronts with frameless glass railings and slim white frames. Deep sunshade blades over every floor keep the afternoon sun off the glass.',
    changes: ['Front balconies 4 ft deep', 'Front sliding doors become floor-to-ceiling glass', "Corner glass 4'×9' beside Bed 03's balcony", 'Tall glass beside the front door', "Side windows 4'×5' on the east walls"],
    cautions: ['A lot of glass faces west. Use low-E solar-control glass and keep the sunshade blades, or the bedrooms will overheat.'],
    swatch: ['#f2f3f3', '#9fc3d6', '#d0d3d4'],
    roof: 'flat', overhang: 3, fascia: { h: 0.5, mat: 'white' }, ext: '#f2f3f3', frame: 'white', glass: 'blue', rail: 'glass', canopy: 'glass', terraceFinish: 'bathTiles', factor: 1.25,
    openings: { frontBalcony: 4, frontTall: true, corner: true, entryTall: true, side: { tag: 'W07', w: 4, h: 5, sill: 2 } },
    clad: [{ floors: ['gf'], orient: 'all', z: [-1, 2], mat: 'stoneLight' }],
    paint: [],
    features: [
      { type: 'blades', depth: 3, mat: 'white' },
      { type: 'gate', kind: 'hslats', mat: 'white', pier: 'stoneLight' },
      { type: 'plants', kind: 'tree', spots: [[17, 37]] },
      { type: 'skylight' },
    ],
  },
  {
    id: 'med', n: 8, name: 'Mediterranean Modern',
    blurb: 'White render with arched openings, solid balcony walls with rounded terracotta copings, terracotta bands and floors, and potted olive trees.',
    changes: ['Front balconies 3 ft deep with solid walls', 'Arched heads on all windows and sliding doors', "Arched side windows 3'×5' on the east walls"],
    cautions: ['Arches lower the usable head of each window by about 1 ft. The openings are slightly taller to make up for it.'],
    swatch: ['#fbf8f1', '#c4693f', '#2f5e7a'],
    roof: 'flat', overhang: 1, fascia: { h: 0.5, mat: 'terracotta' }, ext: '#fbf8f1', frame: 'blue', glass: 'clear', rail: 'solid', canopy: 'pergola', terraceFinish: 'terracotta', factor: 1.2,
    openings: { frontBalcony: 3, side: { tag: 'W12', w: 3, h: 5, sill: 2.25 }, arched: true },
    clad: [{ floors: ['gf'], orient: 'all', z: [-1, 1.5], mat: 'stoneWarm' }],
    paint: [],
    features: [
      { type: 'coping', mat: 'terracotta' },
      { type: 'trims', mat: 'terracotta' },
      { type: 'plants', kind: 'olive', spots: [[15.2, 34.2], [17.6, 36.8], [15.6, 39.0]] },
      { type: 'gate', kind: 'vbars', mat: 'black', pier: 'white' },
      { type: 'skylight' },
    ],
  },
  {
    id: 'japanese', n: 9, name: 'Japanese Minimal',
    blurb: 'Off-white walls with a charred-timber ground floor, vertical timber screens over the balconies, slim black canopies, high windows for privacy, and a gravel-and-bamboo garden.',
    changes: ['Front balconies 3 ft deep behind sliding timber screens', "High windows 5'×1'6\" on the east walls (light and privacy)", 'Louvre vents above every sliding door'],
    cautions: ['The timber screens cut the afternoon sun a lot, but the bedrooms are a little darker in the morning.'],
    swatch: ['#f1eee7', '#2a2522', '#a87b4f'],
    roof: 'flat', overhang: 3, fascia: { h: 0.35, mat: 'black' }, ext: '#f1eee7', frame: 'black', glass: 'clear', rail: 'vslats', canopy: 'pergola', terraceFinish: 'wood', factor: 1.15,
    openings: { frontBalcony: 3, side: { tag: 'W10', w: 5, h: 1.5, sill: 5.5 }, vents: true },
    clad: [{ floors: ['gf'], orient: ['front', 'east'], mat: 'charred' }],
    paint: [],
    features: [
      { type: 'screen', at: 'bal3', kind: 'vslats', mat: 'timber', cover: 0.6 },
      { type: 'screen', at: 'bal4', kind: 'vslats', mat: 'timber', cover: 0.6 },
      { type: 'blades', depth: 2, mat: 'black', thin: true },
      { type: 'zen' },
      { type: 'gate', kind: 'vslats', mat: 'timber', pier: 'charred' },
      { type: 'skylight' },
    ],
  },
];

export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

// window and door frame finishes: price factor applied to every window, sliding door and vent
export const FRAME_LABEL = {
  alu: 'aluminium', charcoal: 'charcoal aluminium', black: 'black steel-look aluminium', white: 'white aluminium',
  gold: 'brass-gold aluminium', bronze: 'bronze aluminium', blue: 'painted timber-look aluminium',
};

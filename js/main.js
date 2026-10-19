import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildHouse, disposeHouse } from './build.js';
import { initSiteMaterials } from './materials.js';
import { Walker } from './walk.js';
import { centroid } from './geom.js';
import { RoomInfo } from './dims.js';
import { Designer } from './design.js';
import { CostTab } from './cost/cost.js';
import { makeVariant } from './variant.js';
import { STYLES, styleById } from './styles.js';

const mobile = matchMedia('(pointer: coarse)').matches;
if (mobile) document.body.classList.add('touch');
const host = document.getElementById('viewport');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
host.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe0ec');
scene.fog = new THREE.Fog('#cfe0ec', 150, 400);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.3, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 8;
controls.maxDistance = 220;

const hemi = new THREE.HemisphereLight('#e8f1ff', '#a39886', 1.1);
scene.add(hemi);
// extra fill used indoors in walk mode, where the roof shades the sun
const indoor = new THREE.AmbientLight('#fff8ee', 0);
scene.add(indoor);
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(-40, 75, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 50, bottom: -45, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
scene.add(sun);

initSiteMaterials();
const basePlan = await (await fetch('data/plan.json')).json();

// ------------------------------------------------------------------ which variant to show
// a link like ?floors=3&style=tropical opens that option; otherwise the last one used here
const AUTOSAVE = 'house3d.autosave.v1';
function startVariant() {
  const q = new URLSearchParams(location.search);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AUTOSAVE))?.variant; } catch { /* storage blocked */ }
  const floors = +(q.get('floors') || saved?.floors || 2);
  const style = q.get('style') || saved?.style || 'original';
  return { floors: floors === 3 ? 3 : 2, style: styleById(style).id };
}
let variant = startVariant();
let plan = makeVariant(basePlan, variant);
let house = buildHouse(plan);
scene.add(house.root);
const G = () => house.groups;

// centre of the house footprint
const centre = new THREE.Vector3(11, 8, 19);
sun.target.position.copy(centre);
scene.add(sun.target);

const FLOOR_TAB = { gf: 'Ground floor', uf: 'First floor', uf2: 'Second floor' };
function viewFor(v) {
  if (v === 'house') {
    const lift = plan.meta[plan.top].ffl - 11;
    return { cam: [-34, 38 + lift * 1.3, 72 + lift * 0.8], target: [11, 8 + lift * 0.55, 19] };
  }
  const ffl = plan.meta[v].ffl;
  return { cam: [-6, 52 + ffl * 0.8, 52 + ffl * 0.2], target: [11, ffl - 1, 20] };
}
const state = { view: 'house', roof: true, labels: true, mode: 'orbit' };
const viewKeys = () => ['house', ...plan.floorKeys.filter((k) => k !== 'rf')];

const viewsNav = document.querySelector('.views');
function renderViewTabs() {
  if (!viewKeys().includes(state.view)) state.view = 'house';
  viewsNav.innerHTML = viewKeys().map((k) => `<button data-view="${k}" role="tab" class="${state.view === k ? 'active' : ''}">${k === 'house' ? 'Whole house' : FLOOR_TAB[k]}</button>`).join('');
}
viewsNav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  state.view = b.dataset.view;
  viewsNav.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
  applyView();
});

function applyView(animate = true) {
  const v = state.view, keys = plan.floorKeys, idx = keys.indexOf(v);
  roomInfo?.hide();
  for (const fk of keys) G()[fk].visible = v === 'house' ? fk !== 'rf' || state.roof : fk !== 'rf' && keys.indexOf(fk) <= idx;
  G().ufCeiling.visible = v === 'house' && state.roof;
  G().roof.visible = v === 'house' && state.roof;
  const labelsOn = state.labels && !(v === 'house' && state.roof);
  for (const fk of keys) G().labels[fk].visible = labelsOn && (v === 'house' ? fk !== 'rf' : fk === v);
  document.getElementById('tgl-roof').closest('label').classList.toggle('disabled', v !== 'house');
  if (animate) flyTo(viewFor(v));
}

let fly = null;
function flyTo({ cam, target }) {
  fly = { t: 0, fromCam: camera.position.clone(), fromTarget: controls.target.clone(), toCam: new THREE.Vector3(...cam), toTarget: new THREE.Vector3(...target) };
}

document.getElementById('tgl-roof').addEventListener('change', (e) => { state.roof = e.target.checked; applyView(false); });
document.getElementById('tgl-labels').addEventListener('change', (e) => { state.labels = e.target.checked; applyView(false); });

// ------------------------------------------------------------------ walk mode, rooms, design, cost
const walker = new Walker(camera, renderer.domElement, plan);
const roomInfo = new RoomInfo(plan, house, camera, renderer.domElement);
const designer = new Designer({
  plan, house, camera, dom: renderer.domElement, host, controls, walker,
  getView: () => state.view,
  getVariant: () => ({ ...variant }),
});
// a saved design opened later brings its own floors and style
designer.requestVariant = (v, design, notify) => applyVariant(v, design, notify);
const costTab = new CostTab({
  plan, house, designer,
  compare: (style) => {
    const p = makeVariant(basePlan, { floors: variant.floors, style });
    const h = buildHouse(p);
    return { plan: p, house: h, dispose: () => disposeHouse(h) };
  },
  onPickStyle: (style) => applyVariant({ ...variant, style }),
});
designer.onChange = () => costTab.designChanged();
document.getElementById('btn-cost').addEventListener('click', () => { designer.setTool(null); roomInfo.hide(); closeStyles(); costTab.show(); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && costTab.open) costTab.hide(); });
// the room panel and the design panel share the screen edge on phones
document.querySelectorAll('#dock button').forEach((b) => b.addEventListener('click', () => { roomInfo.hide(); closeStyles(); }));

// a click or tap (not a drag) on a floor shows that room's dimensions
let press = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.isPrimary) press = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!press || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y), quick = performance.now() - press.t < 400;
  press = null;
  if (moved > 6 || !quick) return;
  if (state.mode === 'walk' && walker.consumeLockClick()) return;
  // with the mouse captured, clicks act at the crosshair in the middle of the screen
  const [cx, cy] = designer.pointerXY(e);
  if (designer.handleClick(cx, cy)) { roomInfo.hide(); return; }
  const id = roomInfo.pick(cx, cy);
  if (id) roomInfo.show(id); else roomInfo.hide();
});
const hint = document.getElementById('hint');
const HINTS = {
  orbit: mobile ? 'Drag to rotate · pinch to zoom · tap a room for its size' : 'Drag to rotate · scroll to zoom · right-drag to pan · click a room for its size · keys 0-9 switch style',
  walk: mobile ? 'Left pad to walk · drag to look · tap the floor for room size' : 'Click the view to look around with the mouse · W A S D or arrows to move · Shift to run',
  walkLocked: 'Mouse to look · W A S D to move · Shift to run · click a floor for its size · Esc frees the mouse',
  walkDrag: 'Drag to look around · W A S D or arrows to move · Shift to run · click a floor for its size',
};

// "Go to" list: front of the house, then every room
const gotoSel = document.getElementById('goto');
let spots = [];
function buildSpots() {
  spots = [{ name: 'Front gate (outside)', x: 13, y: 38.5, level: 0, yaw: 0 }];
  for (const fk of plan.floorKeys) {
    const m = plan.meta[fk];
    let terrace = null;
    for (const r of plan.floors[fk].rooms) {
      if (r.stair) continue;
      if (r.terrace) { if (!terrace || r.area > terrace.area) terrace = r; continue; }
      const [x, y] = centroid(r.poly);
      spots.push({ name: `${m.short} · ${r.name}`, x, y, level: r.level, yaw: 0 });
    }
    if (terrace) { const [x, y] = centroid(terrace.poly); spots.push({ name: 'Roof terrace', x, y, level: terrace.level, yaw: 0 }); }
  }
  gotoSel.replaceChildren(...spots.map((p, i) => new Option(p.name, i)));
}
buildSpots();
gotoSel.addEventListener('change', () => {
  const p = spots[gotoSel.value];
  walker.teleport(p.x, p.y, p.level, p.yaw);
  gotoSel.blur();
});

// keep at least ~80° of horizontal view so portrait phones don't feel like a tunnel
function walkFov() {
  const h = THREE.MathUtils.degToRad(80);
  const v = 2 * Math.atan(Math.tan(h / 2) / camera.aspect);
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 65, 100);
}

function showAllForWalk() {
  for (const fk of plan.floorKeys) { G()[fk].visible = true; G().labels[fk].visible = false; }
  G().ufCeiling.visible = G().roof.visible = true;
}

let orbitSaved = null;
function enterWalk() {
  state.mode = 'walk';
  roomInfo.hide();
  closeStyles();
  document.body.classList.add('walking');
  orbitSaved = { cam: camera.position.clone(), target: controls.target.clone() };
  fly = null;
  controls.enabled = false;
  showAllForWalk();
  camera.fov = walkFov(); camera.near = 0.1; camera.updateProjectionMatrix();
  hemi.intensity = 1.3; hemi.groundColor.set('#e9e3d8'); indoor.intensity = 0.9;
  const start = spots.find((p) => p.name.endsWith('Entrance')) || spots[0];
  gotoSel.value = spots.indexOf(start);
  walker.enable(start.x, start.y, start.level, 0);
  hint.textContent = mobile || walker.canLock ? HINTS.walk : HINTS.walkDrag;
}
function exitWalk() {
  state.mode = 'orbit';
  roomInfo.hide();
  document.body.classList.remove('walking');
  walker.disable();
  camera.fov = 45; camera.near = 0.3; camera.updateProjectionMatrix();
  camera.rotation.order = 'XYZ';
  hemi.intensity = 1.1; hemi.groundColor.set('#a39886'); indoor.intensity = 0;
  controls.enabled = true;
  camera.position.copy(orbitSaved.cam);
  controls.target.copy(orbitSaved.target);
  applyView(false);
  hint.textContent = HINTS.orbit;
}
document.getElementById('btn-walk').addEventListener('click', enterWalk);
document.getElementById('btn-exit').addEventListener('click', exitWalk);
// Esc first frees a captured mouse (the browser does that); a second Esc leaves walk mode
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || state.mode !== 'walk') return;
  if (walker.mouseLocked || performance.now() - walker.unlockedAt < 400) return;
  exitWalk();
});
walker.onLockChange = (locked) => { if (state.mode === 'walk') hint.textContent = locked ? HINTS.walkLocked : walker.canLock ? HINTS.walk : HINTS.walkDrag; };
hint.textContent = HINTS.orbit;

// ------------------------------------------------------------------ floors and facade style
function applyVariant(v, design = null, notify = true) {
  v = { floors: v.floors === 3 ? 3 : 2, style: styleById(v.style).id };
  const snap = design || designer.snapshot();
  const walking = state.mode === 'walk';
  const pos = walking ? { x: walker.pos.x, y: walker.pos.y, feet: walker.feet, yaw: walker.yaw, floor: walker.floor } : null;
  roomInfo.hide();
  disposeHouse(house);
  variant = v;
  plan = makeVariant(basePlan, v);
  house = buildHouse(plan);
  scene.add(house.root);
  walker.setPlan(plan);
  roomInfo.setHouse(plan, house);
  designer.setHouse(plan, house, snap);
  costTab.setHouse(plan, house);
  renderViewTabs();
  buildSpots();
  updateStyleUI();
  if (walking) {
    showAllForWalk();
    // stay where you are unless that floor no longer exists
    if (!plan.floorKeys.includes(pos.floor)) {
      const p = spots.find((s) => s.name.endsWith('Entrance')) || spots[0];
      walker.teleport(p.x, p.y, p.level, pos.yaw);
    }
  } else applyView(false);
  const q = new URLSearchParams(location.search);
  q.set('floors', v.floors); q.set('style', v.style);
  history.replaceState(null, '', '?' + q.toString());
  if (notify) designer.changed();
}

const stylePanel = document.getElementById('style-panel');
const styleGrid = stylePanel.querySelector('.styles');
const styleInfo = stylePanel.querySelector('.style-info');
styleGrid.innerHTML = STYLES.map((s) => `
  <button class="style-card" data-style="${s.id}" title="${s.long || s.name} (key ${s.n})">
    <span class="sw-strip">${s.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
    <b><em>${s.n}</em>${s.name}</b>
    <small>${s.roof === 'flat' ? 'Flat roof, terrace' : 'Pitched roof'}</small>
  </button>`).join('');
function updateStyleUI() {
  const st = plan.style;
  styleGrid.querySelectorAll('.style-card').forEach((b) => b.classList.toggle('on', b.dataset.style === st.id));
  document.querySelectorAll('.floors button').forEach((b) => b.classList.toggle('on', +b.dataset.floors === variant.floors));
  document.getElementById('style-num').textContent = st.n;
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  styleInfo.innerHTML = `
    <h4><span>${st.n}</span> ${esc(st.long || st.name)}</h4>
    <p>${esc(st.blurb)}</p>
    <h5>Openings</h5><ul>${st.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    ${st.cautions?.length ? `<h5>Check</h5><ul class="cautions">${st.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${st.roof === 'flat' ? '<p class="fine">Flat roof with a terrace: the stair carries on to a stair-head room, and the water tank sits on top of it.</p>' : ''}`;
}
updateStyleUI();
styleGrid.addEventListener('click', (e) => {
  const b = e.target.closest('.style-card');
  if (b && b.dataset.style !== variant.style) applyVariant({ ...variant, style: b.dataset.style });
});
stylePanel.querySelector('[data-step="-1"]').addEventListener('click', () => stepStyle(-1));
stylePanel.querySelector('[data-step="1"]').addEventListener('click', () => stepStyle(1));
function stepStyle(d) {
  const i = STYLES.findIndex((s) => s.id === variant.style);
  applyVariant({ ...variant, style: STYLES[(i + d + STYLES.length) % STYLES.length].id });
}
// sit just below the top bar, which wraps onto more rows on narrow windows
function placeStylePanel() {
  if (matchMedia('(max-width: 760px)').matches) { stylePanel.style.top = ''; return; }
  stylePanel.style.top = Math.round(document.querySelector('.bar').getBoundingClientRect().bottom + 8) + 'px';
}
addEventListener('resize', placeStylePanel);
function openStyles() { designer.setTool(null); roomInfo.hide(); stylePanel.hidden = false; placeStylePanel(); document.body.classList.add('styling'); }
function closeStyles() { stylePanel.hidden = true; document.body.classList.remove('styling'); }
document.getElementById('btn-style').addEventListener('click', () => (stylePanel.hidden ? openStyles() : closeStyles()));
stylePanel.querySelector('.close').addEventListener('click', closeStyles);
document.querySelectorAll('.floors button').forEach((b) => b.addEventListener('click', () => {
  if (+b.dataset.floors !== variant.floors) applyVariant({ ...variant, floors: +b.dataset.floors });
}));
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Escape' && !stylePanel.hidden) { closeStyles(); return; }
  const n = /^Digit(\d)$/.exec(e.code)?.[1];
  if (n != null) { const s = STYLES.find((q) => q.n === +n); if (s && s.id !== variant.style) applyVariant({ ...variant, style: s.id }); }
});

renderViewTabs();
const v0 = viewFor('house');
camera.position.set(...v0.cam);
controls.target.set(...v0.target);
applyView(false);
document.getElementById('loading').remove();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  if (state.mode === 'walk') camera.fov = walkFov();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 0.9);
    const k = fly.t * fly.t * (3 - 2 * fly.t);
    camera.position.lerpVectors(fly.fromCam, fly.toCam, k);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
    if (fly.t >= 1) fly = null;
  }
  if (state.mode === 'walk') walker.update(dt);
  else controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

// handy for debugging from the console
window.__house = {
  scene, camera, controls, renderer, walker, roomInfo, designer, costTab, enterWalk, exitWalk, applyVariant,
  get house() { return house; }, get plan() { return plan; }, get variant() { return variant; },
  render() { if (state.mode !== 'walk') controls.update(); renderer.render(scene, camera); labelRenderer.render(scene, camera); },
};

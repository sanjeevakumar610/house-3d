import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildHouse } from './build.js';
import { initSiteMaterials } from './materials.js';
import { Walker } from './walk.js';
import { centroid } from './geom.js';
import { RoomInfo } from './dims.js';
import { Designer } from './design.js';
import { CostTab } from './cost/cost.js';

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
sun.position.set(-40, 70, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
scene.add(sun);

initSiteMaterials();
const plan = await (await fetch('data/plan.json')).json();
const house = buildHouse(plan);
scene.add(house.root);
const G = house.groups;

// centre of the house footprint
const centre = new THREE.Vector3(11, 8, 19);
sun.target.position.copy(centre);
scene.add(sun.target);

const VIEWS = {
  house: { cam: [-34, 38, 72], target: [11, 8, 19] },
  gf: { cam: [-6, 52, 52], target: [11, 0, 20] },
  uf: { cam: [-6, 60, 54], target: [11, 10, 20] },
};
const state = { view: 'house', roof: true, labels: true, mode: 'orbit' };

function applyView(animate = true) {
  const v = state.view;
  roomInfo?.hide();
  G.uf.visible = v !== 'gf';
  G.ufCeiling.visible = v === 'house' && state.roof;
  G.roof.visible = v === 'house' && state.roof;
  const labelsOn = state.labels && !(v === 'house' && state.roof);
  G.labelsGf.visible = labelsOn && (v === 'gf' || v === 'house');
  G.labelsUf.visible = labelsOn && (v === 'uf' || v === 'house');
  document.getElementById('tgl-roof').closest('label').classList.toggle('disabled', v !== 'house');
  if (animate) flyTo(VIEWS[v]);
}

let fly = null;
function flyTo({ cam, target }) {
  fly = { t: 0, fromCam: camera.position.clone(), fromTarget: controls.target.clone(), toCam: new THREE.Vector3(...cam), toTarget: new THREE.Vector3(...target) };
}

document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.views button').forEach((x) => x.classList.toggle('active', x === b));
  state.view = b.dataset.view;
  applyView();
}));
document.getElementById('tgl-roof').addEventListener('change', (e) => { state.roof = e.target.checked; applyView(false); });
document.getElementById('tgl-labels').addEventListener('change', (e) => { state.labels = e.target.checked; applyView(false); });

// ------------------------------------------------------------------ walk mode
const walker = new Walker(camera, renderer.domElement, plan);
const roomInfo = new RoomInfo(plan, house, camera, renderer.domElement);
const designer = new Designer({
  plan, house, camera, dom: renderer.domElement, host, controls, walker,
  getView: () => state.view,
});
const costTab = new CostTab({ plan, house, designer });
designer.onChange = () => costTab.designChanged();
document.getElementById('btn-cost').addEventListener('click', () => { designer.setTool(null); roomInfo.hide(); costTab.show(); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && costTab.open) costTab.hide(); });
// the room panel and the design panel share the screen edge on phones
document.querySelectorAll('#dock button').forEach((b) => b.addEventListener('click', () => roomInfo.hide()));

// a click or tap (not a drag) on a floor shows that room's dimensions
let press = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.isPrimary) press = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!press || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y), quick = performance.now() - press.t < 400;
  press = null;
  if (moved > 6 || !quick) return;
  if (designer.handleClick(e.clientX, e.clientY)) { roomInfo.hide(); return; }
  const id = roomInfo.pick(e.clientX, e.clientY);
  if (id) roomInfo.show(id); else roomInfo.hide();
});
const hint = document.getElementById('hint');
const HINTS = {
  orbit: mobile ? 'Drag to rotate · pinch to zoom · tap a room for its size' : 'Drag to rotate · scroll to zoom · right-drag to pan · click a room for its size',
  walk: mobile ? 'Left pad to walk · drag to look · tap the floor for room size' : 'W A S D / arrows to walk · drag to look · Shift to run · click the floor for room size',
};

// "Go to" list: front of the house, then every room
const gotoSel = document.getElementById('goto');
const spots = [{ name: 'Front gate (outside)', x: 13, y: 38.5, level: 0, yaw: 0 }];
for (const [fk, fl] of Object.entries(plan.floors)) {
  for (const r of fl.rooms) {
    if (r.stair) continue;
    const [x, y] = centroid(r.poly);
    spots.push({ name: `${fk === 'gf' ? 'Ground' : 'Upper'} · ${r.name}`, x, y, level: r.level, yaw: 0 });
  }
}
spots.forEach((p, i) => gotoSel.add(new Option(p.name, i)));
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

let orbitSaved = null;
function enterWalk() {
  state.mode = 'walk';
  roomInfo.hide();
  document.body.classList.add('walking');
  orbitSaved = { cam: camera.position.clone(), target: controls.target.clone() };
  fly = null;
  controls.enabled = false;
  G.uf.visible = G.ufCeiling.visible = G.roof.visible = true;
  G.labelsGf.visible = G.labelsUf.visible = false;
  camera.fov = walkFov(); camera.near = 0.1; camera.updateProjectionMatrix();
  hemi.intensity = 1.3; hemi.groundColor.set('#e9e3d8'); indoor.intensity = 0.9;
  const start = spots.find((p) => p.name.endsWith('Entrance')) || spots[0];
  gotoSel.value = spots.indexOf(start);
  walker.enable(start.x, start.y, start.level, 0);
  hint.textContent = HINTS.walk;
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
addEventListener('keydown', (e) => { if (e.code === 'Escape' && state.mode === 'walk') exitWalk(); });
hint.textContent = HINTS.orbit;

camera.position.set(...VIEWS.house.cam);
controls.target.set(...VIEWS.house.target);
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
  scene, camera, controls, house, plan, renderer, walker, roomInfo, designer, costTab, enterWalk, exitWalk,
  render() { if (state.mode !== 'walk') controls.update(); renderer.render(scene, camera); labelRenderer.render(scene, camera); },
};

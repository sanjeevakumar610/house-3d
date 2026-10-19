// Step 4: customisation. Wall paint, floor finishes, furniture and save/load.
// The design state is plain data (see snapshot()) so it can be saved, exported and costed.
import * as THREE from 'three';
import { pointInPoly } from './geom.js';
import { FLOOR_FINISHES, floorMaterial, CLAD_LABEL } from './materials.js';
import { CATALOG, DEFAULT_FURNITURE, makeModel, footprint } from './furniture.js';
import { ftin } from './dims.js';

export const PALETTE = [
  ['Brilliant white', '#f6f5f0'], ['Off white', '#efe9dc'], ['Magnolia', '#f1e7d3'], ['Ivory', '#eee3c8'],
  ['Cream', '#f2e2b6'], ['Butter yellow', '#f5dc8c'], ['Peach', '#f6d2b8'], ['Terracotta', '#c9714f'],
  ['Sky blue', '#cfe3ee'], ['Mint', '#d6eadb'], ['Sage', '#b9c8a8'], ['Lavender', '#ddd3e8'],
  ['Light grey', '#d9d9d6'], ['Warm grey', '#c9c1b5'], ['Charcoal', '#4a4d50'], ['Navy', '#2f4058'],
];
const AUTOSAVE = 'house3d.autosave.v1';
const SAVES = 'house3d.saves.v1';
const SNAP = 0.25; // ft

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

export class Designer {
  constructor({ plan, house, camera, dom, host, controls, walker, getView, onChange, getVariant, requestVariant }) {
    Object.assign(this, { plan, house, camera, dom, host, controls, walker, getView, getVariant, requestVariant });
    this.onChange = onChange || (() => {});
    this.tool = null;              // null | 'paint' | 'floor' | 'furniture' | 'save'
    this.color = PALETTE[0][1];
    this.finish = 'marble';
    this.paint = {};               // interior face key → colour
    this.extPaint = {};            // style id → { exterior face key → colour }
    this.floors = {};              // room id → finish key
    this.items = [];               // { id, type, x, y, rot, w, d, floor, group }
    this.selected = null;
    this.nextId = 1;
    this.ray = new THREE.Raycaster();
    this.attachGroups();

    this.buildUI();
    this.bindPointer();
    const saved = store.get(AUTOSAVE);
    this.load(saved || this.defaultDesign(), false);
  }

  // furniture lives in each storey's group so it hides with its floor
  attachGroups() {
    this.furnGroups = {};
    for (const fk of this.plan.floorKeys) {
      this.furnGroups[fk] = new THREE.Group();
      this.furnGroups[fk].name = 'furniture-' + fk;
      this.house.groups[fk].add(this.furnGroups[fk]);
    }
    this.roomFinishDefault = Object.fromEntries(this.house.rooms.map((r) => [r.id, r.finish]));
  }

  get styleId() { return this.plan.style?.id || 'original'; }

  // the house was rebuilt for another floor count or style: carry the design over
  setHouse(plan, house, design) {
    const snap = design || this.snapshot();
    this.cancelMove();
    this.select(null);
    for (const it of this.items) it.group.removeFromParent();
    this.plan = plan;
    this.house = house;
    this.attachGroups();
    this.load(snap, false, true);
  }

  // ------------------------------------------------------------ state
  defaultDesign() {
    return { version: 2, paint: {}, extPaint: {}, floors: {}, furniture: DEFAULT_FURNITURE.map((f) => ({ ...f, floor: f.floor || 'gf' })) };
  }

  snapshot() {
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      variant: this.getVariant?.(),
      paint: { ...this.paint },
      extPaint: structuredClone(this.extPaint),
      floors: { ...this.floors },
      uf2Seeded: !!this.uf2Seeded,
      furniture: this.items.map(({ type, x, y, rot, w, d, floor }) => ({ type, x: +x.toFixed(3), y: +y.toFixed(3), rot: +rot.toFixed(4), w, d, floor })),
    };
  }

  load(design, notify = true, sameVariant = false) {
    // a saved design brings its floor count and style with it
    if (!sameVariant && design.variant && this.requestVariant) {
      const v = this.getVariant();
      if (v.floors !== design.variant.floors || v.style !== design.variant.style) { this.requestVariant(design.variant, design, notify); return; }
    }
    // paint: interior colours, and outside colours per style (older saves had them mixed in)
    const faces = this.house.faces;
    this.paint = {};
    this.extPaint = structuredClone(design.extPaint || {});
    for (const f of faces.values()) f.material.color.set(f.defaultColor);
    for (const [k, c] of Object.entries(design.paint || {})) {
      const f = faces.get(k);
      if (f?.exterior) { if (!design.extPaint) (this.extPaint.original ||= {})[k] = c; continue; }
      this.paint[k] = c; // kept even when that floor isn't built right now
      if (f) f.material.color.set(c);
    }
    for (const [k, c] of Object.entries(this.extPaint[this.styleId] || {})) faces.get(k)?.material.color.set(c);
    // floors
    this.floors = { ...(design.floors || {}) };
    for (const r of this.house.rooms) {
      if (!r.finish) continue;
      const fin = FLOOR_FINISHES[this.floors[r.id]] ? this.floors[r.id] : r.finish;
      r.floorMesh.material = floorMaterial(fin);
    }
    // furniture (items on a floor that isn't built right now are kept, just not shown)
    this.select(null);
    for (const it of this.items) it.group.removeFromParent();
    this.items = [];
    for (const f of design.furniture || []) this.addItem(f, false);
    this.uf2Seeded = !!design.uf2Seeded;
    if (this.plan.floors.uf2 && !this.uf2Seeded) {
      // first time with a second floor: furnish it like the first floor
      if (!this.items.some((it) => it.floor === 'uf2')) for (const f of DEFAULT_FURNITURE.filter((q) => q.floor === 'uf')) this.addItem({ ...f, floor: 'uf2' }, false);
      this.uf2Seeded = true;
    }
    this.syncObstacles();
    if (notify) this.changed();
  }

  changed() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const ok = store.set(AUTOSAVE, this.snapshot());
      this.ui.status.textContent = ok ? `Saved on this device at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'This browser blocks saving. Use "Download design file" to keep your changes.';
    }, 400);
    this.onChange();
  }

  // ------------------------------------------------------------ paint & floors
  setFaceColor(key, color, notify = true) {
    const f = this.house.faces.get(key);
    if (!f) return;
    f.material.color.set(color);
    const map = f.exterior ? (this.extPaint[this.styleId] ||= {}) : this.paint;
    if (color.toLowerCase() === f.defaultColor.toLowerCase()) delete map[key]; else map[key] = color;
    if (notify) this.changed();
  }

  paintFace(key) {
    const f = this.house.faces.get(key);
    if (!f) return;
    if (this.ui.wholeRoom.checked) {
      // every face that looks into the same room (or every exterior face)
      for (const g of this.house.faces.values()) {
        if (f.exterior ? g.exterior : g.roomId === f.roomId) this.setFaceColor(g.key, this.color, false);
      }
    } else this.setFaceColor(key, this.color, false);
    this.toast(`Painted ${this.ui.wholeRoom.checked ? (f.exterior ? 'all exterior walls' : 'all walls of ' + f.roomName) : (f.exterior ? 'exterior wall' : f.roomName + ' wall')}`);
    this.changed();
  }

  setFloor(roomId, finish, notify = true) {
    const r = this.house.rooms.find((q) => q.id === roomId);
    if (!r || !r.finish || !FLOOR_FINISHES[finish]) return;
    r.floorMesh.material = floorMaterial(finish);
    if (finish === this.roomFinishDefault[roomId]) delete this.floors[roomId]; else this.floors[roomId] = finish;
    if (notify) this.changed();
  }

  finishOf(roomId) {
    return this.floors[roomId] || this.roomFinishDefault[roomId];
  }

  // ------------------------------------------------------------ furniture
  storeyRooms(floor) { return this.plan.floors[floor]?.rooms || []; }

  levelAt(floor, x, y) {
    const r = this.storeyRooms(floor).find((q) => pointInPoly([x, y], q.poly));
    return r ? r.level : floor === 'gf' ? 0 : this.plan.meta[floor]?.ffl ?? 0;
  }

  addItem(spec, select = true) {
    const cat = CATALOG[spec.type];
    if (!cat) return null;
    const it = { id: this.nextId++, type: spec.type, x: spec.x, y: spec.y, rot: spec.rot || 0, w: spec.w || cat.w, d: spec.d || cat.d, floor: spec.floor || 'gf' };
    it.group = new THREE.Group();
    it.group.userData = { type: 'furniture', itemId: it.id };
    this.furnGroups[it.floor]?.add(it.group);
    this.rebuildItem(it);
    this.items.push(it);
    if (select) { this.select(it); this.syncObstacles(); this.changed(); }
    return it;
  }

  rebuildItem(it) {
    it.group.clear();
    const model = makeModel(it.type, it.w, it.d);
    model.traverse((o) => { if (o.isMesh) o.userData = { type: 'furniture', itemId: it.id }; });
    it.group.add(model);
    this.placeItem(it);
    if (this.selected === it) this.addOutline(it);
  }

  placeItem(it) {
    it.group.position.set(it.x, this.levelAt(it.floor, it.x, it.y), it.y);
    it.group.rotation.y = it.rot;
  }

  addOutline(it) {
    it.group.children.filter((c) => c.userData.outline).forEach((c) => it.group.remove(c));
    const fp = footprint(it.type, it.w, it.d);
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(fp.w + 0.2, 0.05, fp.d + 0.2)),
      new THREE.LineBasicMaterial({ color: '#e07b39', depthTest: false }));
    box.position.y = 0.05;
    box.renderOrder = 10;
    box.userData = { outline: true };
    it.group.add(box);
  }

  select(it) {
    if (this.moving && this.moving.it !== it) this.cancelMove();
    if (this.selected && this.selected !== it) {
      this.selected.group.children.filter((c) => c.userData.outline).forEach((c) => this.selected.group.remove(c));
    }
    this.selected = it;
    if (it) this.addOutline(it);
    this.updateSelectionBar();
  }

  removeSelected() {
    const it = this.selected;
    if (!it) return;
    this.select(null);
    it.group.removeFromParent();
    this.items = this.items.filter((q) => q !== it);
    this.syncObstacles();
    this.changed();
  }

  rotateSelected(deg) {
    const it = this.selected;
    if (!it) return;
    it.rot = THREE.MathUtils.euclideanModulo(it.rot + THREE.MathUtils.degToRad(deg) + Math.PI, Math.PI * 2) - Math.PI;
    this.placeItem(it);
    if (this.moving) return; // saved when it's placed
    this.syncObstacles();
    this.changed();
  }

  duplicateSelected() {
    const it = this.selected;
    if (!it) return;
    this.addItem({ ...it, x: it.x + 1, y: it.y + 1 });
  }

  // where to drop a new item: in front of the walker, or the middle of the current view
  dropPoint() {
    if (this.walker.enabled) {
      const f = this.walker.floor, s = Math.sin(this.walker.yaw), c = Math.cos(this.walker.yaw);
      return { floor: f, x: this.walker.pos.x - s * 4, y: this.walker.pos.y - c * 4 };
    }
    const view = this.getView();
    const floor = this.plan.floorKeys.includes(view) ? view : 'gf';
    const t = this.controls.target;
    const rooms = this.storeyRooms(floor).filter((r) => !r.stair && !r.outdoor);
    const inside = rooms.find((r) => pointInPoly([t.x, t.z], r.poly));
    if (inside) return { floor, x: t.x, y: t.z };
    const r = rooms.find((q) => /living|bed/i.test(q.name)) || rooms[0];
    return { floor, x: (r.bbox[0] + r.bbox[2]) / 2, y: (r.bbox[1] + r.bbox[3]) / 2 };
  }

  syncObstacles() {
    this.walker.setObstacles(this.items.filter((it) => this.plan.floors[it.floor]).map((it) => {
      const fp = footprint(it.type, it.w, it.d);
      return { x: it.x, y: it.y, hw: fp.w / 2, hd: fp.d / 2, rot: it.rot, floor: it.floor, low: it.type === 'coffee-table' };
    }));
  }

  // ------------------------------------------------------------ picking
  hitAt(clientX, clientY, objects) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    for (const h of this.ray.intersectObjects(objects, true)) {
      if (!isVisible(h.object)) continue;
      const t = h.object.userData.type;
      if (t === 'glass' || h.object.userData.outline || inNamed(h.object, ['roof', 'ufCeiling', 'room-dims'])) continue;
      return h;
    }
    return null;
  }

  furnitureAt(x, y) {
    const h = this.hitAt(x, y, [this.house.root]);
    if (!h || h.object.userData.type !== 'furniture') return null;
    return this.items.find((q) => q.id === h.object.userData.itemId) || null;
  }

  // ------------------------------------------------------------ moving furniture
  // Furniture never moves by accident: select it, press Move (or M), then click where it goes.
  // While moving, the item follows the mouse, or the crosshair when the mouse is captured.
  pointerXY(e) {
    if (document.pointerLockElement === this.dom) {
      const r = this.dom.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }
    return [e.clientX, e.clientY];
  }

  moveTo(x, y) {
    const it = this.moving?.it;
    if (!it) return;
    const rect = this.dom.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), this.camera);
    this.plane.constant = -this.levelAt(it.floor, it.x, it.y);
    if (!this.ray.ray.intersectPlane(this.plane, this.planeHit)) return;
    // ignore points far away (looking at the sky, or past the plot)
    if (Math.hypot(this.planeHit.x - 11, this.planeHit.z - 20) > 45) return;
    it.x = Math.round(this.planeHit.x / SNAP) * SNAP;
    it.y = Math.round(this.planeHit.z / SNAP) * SNAP;
    this.placeItem(it);
  }

  startMove() {
    const it = this.selected;
    if (!it) return;
    this.moving = { it, from: { x: it.x, y: it.y } };
    this.updateSelectionBar();
    this.toast(this.walker.enabled ? 'Aim where it should go and click to place it. Esc cancels' : 'Click where it should go. R rotates, Esc cancels');
  }

  finishMove() {
    if (!this.moving) return;
    this.moving = null;
    this.syncObstacles();
    this.updateSelectionBar();
    this.changed();
    this.toast('Placed');
  }

  cancelMove() {
    if (!this.moving) return;
    const { it, from } = this.moving;
    it.x = from.x; it.y = from.y;
    this.placeItem(it);
    this.moving = null;
    this.updateSelectionBar();
  }

  // a click (not a drag) in the 3D view; returns true when the designer used it
  handleClick(x, y) {
    if (this.moving) { this.moveTo(x, y); this.finishMove(); return true; }
    if (this.tool === 'paint') {
      const h = this.hitAt(x, y, [this.house.root]);
      if (h && h.object.userData.type === 'clad') { this.toast(`This wall has ${CLAD_LABEL[h.object.userData.clad].toLowerCase()} in this style. Paint shows on rendered walls only`); return true; }
      const key = h && h.object.userData.type === 'wall' ? h.object.userData.faces?.[h.face.materialIndex] : null;
      if (key) this.paintFace(key); else this.toast('Click on a wall to paint it');
      return true;
    }
    if (this.tool === 'floor') {
      const h = this.hitAt(x, y, [this.house.root]);
      const id = h && h.object.userData.type === 'floor' ? h.object.userData.roomId : null;
      const r = id && this.house.rooms.find((q) => q.id === id);
      if (r && r.finish) {
        this.setFloor(id, this.finish);
        this.lastFloorRoom = r;
        this.toast(`${r.data.name}: ${FLOOR_FINISHES[this.finish].label}`);
      } else this.toast('Click on a room floor to change it');
      return true;
    }
    // while walking, furniture is only picked when the Furniture tool is open
    if (this.walker.enabled && this.tool !== 'furniture') return false;
    const it = this.furnitureAt(x, y);
    if (it) { this.select(it); return true; }
    if (this.selected) { this.select(null); return this.tool === 'furniture'; }
    return false;
  }

  bindPointer() {
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.planeHit = new THREE.Vector3();
    // preview while moving: plain mouse movement (not while a button is held to turn the camera)
    this.host.addEventListener('pointermove', (e) => {
      if (!this.moving || e.target !== this.dom || e.pointerType !== 'mouse' || e.buttons || document.pointerLockElement) return;
      this.moveTo(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', () => {
      if (!this.moving || document.pointerLockElement !== this.dom) return;
      const [x, y] = this.pointerXY({});
      this.moveTo(x, y);
    });
    // keyboard: M move/place, R rotate, Delete remove, Esc cancels a move (before anything else sees Esc)
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.moving) { this.cancelMove(); e.stopImmediatePropagation(); }
    }, true);
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea') || !this.selected) return;
      if (e.code === 'Delete' || e.code === 'Backspace') { this.removeSelected(); e.preventDefault(); }
      if (e.code === 'KeyR') this.rotateSelected(e.shiftKey ? -15 : 15);
      if (e.code === 'KeyM') { if (this.moving) this.finishMove(); else this.startMove(); }
    });
  }

  // ------------------------------------------------------------ UI
  buildUI() {
    const $ = (s) => document.querySelector(s);
    this.ui = {
      dock: $('#dock'), panel: $('#design-panel'), title: $('#design-panel h3'), body: $('#design-panel .body'),
      selbar: $('#selection-bar'), toastEl: $('#toast'),
    };
    this.ui.dock.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.setTool(this.tool === b.dataset.tool ? null : b.dataset.tool)));
    $('#design-panel .close').addEventListener('click', () => this.setTool(null));

    // paint panel
    const paint = document.createElement('div');
    paint.innerHTML = `
      <p class="help">Pick a colour, then click any wall. Each side of a wall is painted separately.</p>
      <div class="swatches">${PALETTE.map(([n, c]) => `<button class="sw" title="${n}" style="--c:${c}" data-c="${c}"></button>`).join('')}</div>
      <label class="row">Custom colour <input type="color" id="paint-custom" value="#f6f5f0"></label>
      <label class="row"><input type="checkbox" id="paint-room"> Paint the whole room at once</label>
      <div class="current">Selected: <span class="chip"></span> <b class="cname"></b></div>`;
    this.ui.wholeRoom = paint.querySelector('#paint-room');
    const setColor = (c, name) => {
      this.color = c;
      paint.querySelector('.chip').style.background = c;
      paint.querySelector('.cname').textContent = name || c;
      paint.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s.dataset.c === c));
    };
    paint.querySelectorAll('.sw').forEach((s) => s.addEventListener('click', () => setColor(s.dataset.c, s.title)));
    paint.querySelector('#paint-custom').addEventListener('input', (e) => setColor(e.target.value));
    setColor(PALETTE[0][1], PALETTE[0][0]);

    // floor panel
    const floor = document.createElement('div');
    floor.innerHTML = `
      <p class="help">Pick a finish, then click a room's floor.</p>
      <div class="finishes">${Object.entries(FLOOR_FINISHES).map(([k, f]) => `<button class="fin" data-k="${k}"><span class="prev" data-k="${k}"></span>${f.label}</button>`).join('')}</div>
      <button class="wide" id="floor-all">Use this finish in every room on that floor</button>`;
    floor.querySelectorAll('.fin').forEach((b) => b.addEventListener('click', () => {
      this.finish = b.dataset.k;
      floor.querySelectorAll('.fin').forEach((x) => x.classList.toggle('on', x === b));
    }));
    floor.querySelector(`.fin[data-k="${this.finish}"]`).classList.add('on');
    floor.querySelector('#floor-all').addEventListener('click', () => {
      const view = this.getView();
      const fk = this.lastFloorRoom?.floor || (this.plan.floorKeys.includes(view) ? view : 'gf');
      for (const r of this.house.rooms) if (r.floor === fk && r.finish && !r.data.outdoor && !r.data.wet) this.setFloor(r.id, this.finish, false);
      this.toast(`${FLOOR_FINISHES[this.finish].label} in all ${this.plan.meta[fk].name.toLowerCase()} rooms (baths unchanged)`);
      this.changed();
    });
    // texture previews
    floor.querySelectorAll('.prev').forEach((p) => {
      const img = floorMaterial(p.dataset.k).map.image;
      p.style.backgroundImage = `url(${img.toDataURL()})`;
    });

    // furniture panel
    const furn = document.createElement('div');
    const groups = {};
    for (const [k, c] of Object.entries(CATALOG)) (groups[c.group] ||= []).push([k, c]);
    furn.innerHTML = `<p class="help">Tap an item to add it. Click a piece to select it, then use Move, rotate or Delete.</p>` +
      Object.entries(groups).map(([g, list]) => `<h4>${g}</h4><div class="catalog">${list.map(([k, c]) => `<button data-k="${k}"><b>${c.label}</b><span>${ftin(c.w)} × ${ftin(c.d)}</span></button>`).join('')}</div>`).join('');
    furn.querySelectorAll('.catalog button').forEach((b) => b.addEventListener('click', () => {
      const p = this.dropPoint();
      this.addItem({ type: b.dataset.k, ...p, rot: this.walker.enabled ? this.walker.yaw + Math.PI : 0 });
      this.toast(`Added ${CATALOG[b.dataset.k].label}. Press Move to place it`);
    }));

    // save panel
    const save = document.createElement('div');
    save.innerHTML = `
      <p class="help status"></p>
      <div class="row"><input id="save-name" placeholder="Name this design" maxlength="40"><button id="save-as">Save</button></div>
      <ul class="saves"></ul>
      <div class="row gap"><button class="wide" id="export">Download design file</button></div>
      <div class="row gap"><label class="wide filebtn">Open design file<input type="file" id="import" accept=".json,application/json" hidden></label></div>
      <div class="row gap"><button class="wide danger" id="reset">Reset to the architect's design</button></div>`;
    this.ui.status = save.querySelector('.status');
    this.ui.status.textContent = 'Changes are saved automatically on this device.';
    save.querySelector('#save-as').addEventListener('click', () => {
      const name = save.querySelector('#save-name').value.trim() || `Design ${new Date().toLocaleString()}`;
      const all = store.get(SAVES) || {};
      all[name] = this.snapshot();
      if (store.set(SAVES, all)) { save.querySelector('#save-name').value = ''; this.renderSaves(); this.toast(`Saved "${name}"`); } else this.toast('This browser blocks saving. Download the design file instead');
    });
    save.querySelector('#export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.snapshot(), null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `house-design-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    save.querySelector('#import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!d || typeof d !== 'object' || !('furniture' in d || 'paint' in d)) throw new Error('not a design file');
        this.load(d); this.toast(`Opened ${file.name}`);
      } catch { this.toast('That file is not a house design file'); }
      e.target.value = '';
    });
    save.querySelector('#reset').addEventListener('click', () => {
      if (confirm("Reset paint, floors and furniture to the architect's design? Your named saves are kept.")) { this.load(this.defaultDesign()); this.toast('Reset to the original design'); }
    });
    this.ui.saveList = save.querySelector('.saves');

    this.ui.views = { paint: ['Paint walls', paint], floor: ['Floor finishes', floor], furniture: ['Furniture', furn], save: ['Save & load', save] };

    // selection bar
    const sb = this.ui.selbar;
    sb.querySelector('[data-a="rl"]').addEventListener('click', () => this.rotateSelected(15));
    sb.querySelector('[data-a="rr"]').addEventListener('click', () => this.rotateSelected(-15));
    sb.querySelector('[data-a="r90"]').addEventListener('click', () => this.rotateSelected(90));
    sb.querySelector('[data-a="dup"]').addEventListener('click', () => this.duplicateSelected());
    sb.querySelector('[data-a="del"]').addEventListener('click', () => this.removeSelected());
    sb.querySelector('[data-a="close"]').addEventListener('click', () => this.select(null));
    sb.querySelector('[data-a="move"]').addEventListener('click', () => (this.moving ? this.cancelMove() : this.startMove()));
    sb.querySelector('input[type=range]').addEventListener('input', (e) => {
      const it = this.selected;
      if (!it) return;
      it.w = +e.target.value;
      this.rebuildItem(it);
      this.updateSelectionBar();
    });
    sb.querySelector('input[type=range]').addEventListener('change', () => { this.syncObstacles(); this.changed(); });
  }

  renderSaves() {
    const all = store.get(SAVES) || {};
    const names = Object.keys(all).sort((a, b) => (all[b].savedAt || '').localeCompare(all[a].savedAt || ''));
    this.ui.saveList.innerHTML = names.length ? '' : '<li class="none">No named saves yet</li>';
    for (const n of names) {
      const li = document.createElement('li');
      const when = all[n].savedAt ? new Date(all[n].savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
      li.innerHTML = `<span><b></b><small>${when}</small></span><button data-a="load">Open</button><button data-a="del" aria-label="Delete">×</button>`;
      li.querySelector('b').textContent = n;
      li.querySelector('[data-a=load]').addEventListener('click', () => { this.load(all[n]); this.toast(`Opened "${n}"`); });
      li.querySelector('[data-a=del]').addEventListener('click', () => {
        if (!confirm(`Delete the saved design "${n}"?`)) return;
        const cur = store.get(SAVES) || {}; delete cur[n]; store.set(SAVES, cur); this.renderSaves();
      });
      this.ui.saveList.append(li);
    }
  }

  setTool(tool) {
    this.tool = tool;
    this.ui.dock.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    document.body.classList.toggle('designing', !!tool);
    if (!tool) { this.ui.panel.hidden = true; return; }
    const [title, el] = this.ui.views[tool];
    this.ui.title.textContent = title;
    this.ui.body.replaceChildren(el);
    if (tool === 'save') this.renderSaves();
    this.ui.panel.hidden = false;
    if (tool === 'paint' || tool === 'floor') this.select(null);
  }

  updateSelectionBar() {
    const it = this.selected, sb = this.ui.selbar;
    if (!it) { sb.hidden = true; return; }
    const c = CATALOG[it.type];
    sb.querySelector('.name').textContent = c.label;
    sb.querySelector('.size').textContent = this.moving ? 'Click where it should go' : `${ftin(it.w)} × ${ftin(it.d)}`;
    const mv = sb.querySelector('[data-a="move"]');
    mv.textContent = this.moving ? 'Cancel move' : 'Move';
    mv.classList.toggle('on', !!this.moving);
    const range = sb.querySelector('.len');
    range.hidden = !c.resizable;
    if (c.resizable) { const r = range.querySelector('input'); r.value = it.w; range.querySelector('span').textContent = ftin(it.w); }
    sb.hidden = false;
  }

  toast(msg) {
    const t = this.ui.toastEl;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
}

function isVisible(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function inNamed(o, names) { for (; o; o = o.parent) if (names.includes(o.name)) return true; return false; }

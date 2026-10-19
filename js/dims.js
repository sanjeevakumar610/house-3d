// Room dimensions: click/tap a floor to highlight the room, label each side with its length and
// show a panel with size, area, heights and the room's doors and windows.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { flatPoly, centroid, pointInPoly } from './geom.js';

export const ftin = (f) => {
  const neg = f < 0; f = Math.abs(f);
  let ft = Math.floor(f + 1e-6), inch = Math.round((f - ft) * 12);
  if (inch === 12) { ft++; inch = 0; }
  return `${neg ? '−' : ''}${ft}'-${inch}"`;
};
export const metres = (f) => (f * 0.3048).toFixed(2);
const KIND = { door: 'door', sliding: 'sliding door', window: 'window', arch: 'arch', fixed: 'fixed glass', vent: 'louvre vent' };

export class RoomInfo {
  constructor(plan, house, camera, dom) {
    this.plan = plan;
    this.house = house;
    this.camera = camera;
    this.dom = dom;
    this.group = new THREE.Group();
    this.group.name = 'room-dims';
    house.root.add(this.group);
    this.ray = new THREE.Raycaster();
    this.panel = document.getElementById('room-panel');
    this.panel.querySelector('.close').addEventListener('click', () => this.hide());
    this.current = null;
    this.indexOpenings();
  }

  // a different variant of the house (floor count or style)
  setHouse(plan, house) {
    this.hide();
    this.plan = plan;
    this.house = house;
    house.root.add(this.group);
    this.indexOpenings();
  }

  // which rooms each opening connects (looked up once)
  indexOpenings() {
    this.openings = {};
    for (const fk of this.plan.floorKeys) {
      const fl = this.plan.floors[fk];
      for (const w of fl.walls) for (const o of w.openings) {
        const ux = (w.b[0] - w.a[0]) / w.length, uy = (w.b[1] - w.a[1]) / w.length;
        const c = (o.from + o.to) / 2, mid = [w.a[0] + ux * c, w.a[1] + uy * c], off = w.thickness / 2 + 0.3;
        const sideA = [mid[0] - uy * off, mid[1] + ux * off], sideB = [mid[0] + uy * off, mid[1] - ux * off];
        const ra = fl.rooms.find((r) => pointInPoly(sideA, r.poly)), rb = fl.rooms.find((r) => pointInPoly(sideB, r.poly));
        for (const [r, other] of [[ra, rb], [rb, ra]]) {
          if (!r || r === other) continue;
          (this.openings[r.id] ||= []).push({ ...o, to: other ? other.name : 'outside' });
        }
      }
    }
  }

  roomById(id) {
    for (const fk of this.plan.floorKeys) {
      const r = this.plan.floors[fk].rooms.find((q) => q.id === id);
      if (r) return { room: r, floor: fk };
    }
    return null;
  }

  // returns the room id under a screen point, or null
  pick(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObject(this.house.root, true);
    for (const h of hits) {
      if (!visible(h.object)) continue;
      const t = h.object.userData.type;
      if (t === 'glass' || inGroup(h.object, 'roof') || inGroup(h.object, 'ufCeiling') || inGroup(h.object, 'room-dims')) continue;
      if (t === 'floor') return h.object.userData.roomId;
      if (t === 'stair') return h.object.userData.roomId;
      return null; // a wall or something else is in front
    }
    return null;
  }

  show(id) {
    const found = this.roomById(id);
    if (!found) return this.hide();
    const { room: r, floor } = found;
    this.clear3d();
    this.current = id;

    // highlight + side lengths drawn on the floor
    const fill = new THREE.Mesh(flatPoly(r.poly, r.level + 0.03, true),
      new THREE.MeshBasicMaterial({ color: '#e07b39', transparent: true, opacity: 0.28, depthWrite: false }));
    this.group.add(fill);
    const pts = r.poly.map(([x, y]) => new THREE.Vector3(x, r.level + 0.05, y));
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#c4581f' }));
    this.group.add(outline);
    const [cx, cy] = centroid(r.poly);
    for (let i = 0; i < r.poly.length; i++) {
      const a = r.poly[i], b = r.poly[(i + 1) % r.poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1.5) continue;
      let mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      // nudge the label into the room
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      const s = (cx - mx) * nx + (cy - my) * ny > 0 ? 1 : -1;
      mx += nx * s * 0.9; my += ny * s * 0.9;
      const el = document.createElement('div');
      el.className = 'dim-label';
      el.textContent = ftin(len);
      const lbl = new CSS2DObject(el);
      lbl.position.set(mx, r.level + 0.1, my);
      this.group.add(lbl);
    }

    // panel
    const [x0, y0, x1, y1] = r.bbox;
    const W = x1 - x0, D = y1 - y0;
    const rect = r.poly.length === 4 && r.poly.every(([x, y]) => (Math.abs(x - x0) < 0.05 || Math.abs(x - x1) < 0.05) && (Math.abs(y - y0) < 0.05 || Math.abs(y - y1) < 0.05));
    const m = this.plan.meta[floor];
    const ch = m.ceil - r.level;
    let perim = 0;
    for (let i = 0; i < r.poly.length; i++) { const a = r.poly[i], b = r.poly[(i + 1) % r.poly.length]; perim += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const ops = (this.openings[id] || []).map((o) => `<li><b>${o.tag}</b> ${ftin(o.width)} × ${ftin(o.height)} ${o.vent === 'jali' ? 'breeze-block vent' : KIND[o.kind]} <span>→ ${o.to}</span></li>`).join('');

    this.panel.querySelector('h3').textContent = r.name;
    this.panel.querySelector('.sub').textContent = `${m.name} · floor level +${ftin(r.level)}`;
    this.panel.querySelector('.body').innerHTML = `
      <dl>
        <dt>${rect ? 'Size' : 'Overall size'}</dt><dd>${ftin(W)} × ${ftin(D)} <span>(${metres(W)} × ${metres(D)} m)</span>${rect ? '' : '<em>Irregular shape: side lengths are marked on the floor</em>'}</dd>
        <dt>Floor area</dt><dd>${r.area.toFixed(0)} sq ft <span>(${(r.area * 0.092903).toFixed(1)} m²)</span></dd>
        ${r.terrace ? '<dt>Above</dt><dd>Open to the sky <span>(3\'-6" parapet)</span></dd>' : `<dt>${r.outdoor ? 'Height to slab' : m.roofOver ? 'Height to eaves' : 'Ceiling height'}</dt><dd>${ftin(ch)} <span>(${metres(ch)} m)</span></dd>`}
        <dt>Perimeter</dt><dd>${ftin(perim)} <span>(${metres(perim)} m)</span></dd>
      </dl>
      <h4>Doors &amp; windows</h4>
      ${ops ? `<ul>${ops}</ul>` : '<p class="none">None (open to the next space)</p>'}`;
    this.panel.hidden = false;
  }

  clear3d() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      if (o.element) o.element.remove();
      o.geometry?.dispose();
      o.material?.dispose();
    }
  }

  hide() {
    this.clear3d();
    this.current = null;
    this.panel.hidden = true;
  }
}

function visible(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function inGroup(o, name) { for (; o; o = o.parent) if (o.name === name) return true; return false; }

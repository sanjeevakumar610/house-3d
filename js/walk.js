// First-person walk mode: keyboard / drag-to-look on desktop, joystick + drag on touch screens.
// Collides with walls (doorways, arches and sliding doors are passable), follows floor levels
// and climbs the staircase.
import * as THREE from 'three';
import { pointInPoly, distToSegment } from './geom.js';
import { stairSteps } from './build.js';
import { floorAtHeight } from './variant.js';

const EYE = 5.25;        // eye height above the floor, ft (≈ 1.6 m)
const RADIUS = 0.75;     // body radius, ft
const STEP_UP = 1.25;    // tallest rise you can walk up, ft (lets you take the winders comfortably)
const HEADROOM = 5.3;    // clearance needed under stair soffits, ft
const BODY = 5.6;        // body height used for collisions, ft
const WALK = 4.5, RUN = 9; // ft/s
const PASSABLE = new Set(['door', 'arch', 'sliding']);

export class Walker {
  constructor(camera, dom, plan) {
    this.camera = camera;
    this.dom = dom;
    this.plan = plan;
    this.enabled = false;
    this.pos = new THREE.Vector2();
    this.feet = 1;
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.obstacles = [];
    this.buildColliders();
    this.bindInput();
  }

  // a different variant of the house (floor count or style)
  setPlan(plan) { this.plan = plan; this.buildColliders(); }

  // ------------------------------------------------------------ world data
  buildColliders() {
    const P = this.plan;
    const segs = [];
    for (const fk of P.floorKeys) {
      const fl = P.floors[fk], m = P.meta[fk];
      const ffl = m.ffl, zb = m.zb, zt = m.ceil;
      for (const w of fl.walls) {
        const top = w.height != null ? ffl + w.height : zt;
        const ux = (w.b[0] - w.a[0]) / w.length, uy = (w.b[1] - w.a[1]) / w.length;
        const at = (s) => [w.a[0] + ux * s, w.a[1] + uy * s];
        const gaps = w.openings.filter((o) => PASSABLE.has(o.kind)).sort((p, q) => p.from - q.from);
        let s = 0;
        for (const g of gaps) { if (g.from > s) segs.push({ a: at(s), b: at(g.from), r: w.thickness / 2, bottom: zb, top, floor: fk }); s = Math.max(s, g.to); }
        if (s < w.length) segs.push({ a: at(s), b: at(w.length), r: w.thickness / 2, bottom: zb, top, floor: fk });
      }
      for (const c of fl.columns) segs.push({ a: c, b: c, r: 0.375, bottom: zb, top: zt, floor: fk });
    }
    // stair handrails: the open sides of the flights and winders
    P.stairs.forEach((S, i) => {
      if (i === 0) {
        segs.push({ a: [S.lower.x[7], S.lower.y2 - 0.1], b: [S.lower.x[0], S.lower.y2 - 0.1], r: 0.05, bottom: 0, top: 12, floor: 'gf' });
        segs.push({ a: [S.winder.x, S.upper.y + 0.1], b: [S.upper.x[7], S.upper.y + 0.1], r: 0.05, bottom: S.base + 3, top: 12, floor: 'gf', onStairOnly: true });
      } else {
        // stacked flights: the rail along the gap between them
        segs.push({ a: [S.winder.x2, S.upper.y2], b: [S.lower.x[0], S.upper.y2], r: 0.06, bottom: S.base, top: S.base + 12, floor: S.from });
      }
    });
    this.segs = segs;

    // walkable surfaces: room floors, stair treads; outside everything is the ground (0)
    this.surfaces = [];
    for (const fk of P.floorKeys) for (const r of P.floors[fk].rooms) {
      this.surfaces.push({ top: r.level, bottom: r.level > 5 ? r.level - 0.5 : 0, contains: (p) => pointInPoly(p, r.poly) });
    }
    for (const S of P.stairs) for (const st of stairSteps(S)) {
      const bottom = st.solid ? S.base : st.top - S.riser - 0.45;
      this.surfaces.push({ top: st.top, bottom, contains: ([x, y]) => x >= st.x0 && x <= st.x1 && y >= st.y0 && y <= st.y1 });
    }
    this.stairBoxes = P.stairs.map((S) => ({ x0: S.winder.x, x1: S.lower.x[0], y0: S.upper.y, y1: S.lower.y2, base: S.base }));
  }

  // furniture footprints: { x, y, hw, hd, rot, floor } (rotated rectangles)
  setObstacles(list) { this.obstacles = list; }

  pushOutOfFurniture(p, floor) {
    for (const o of this.obstacles) {
      if (o.floor !== floor) continue;
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      const dx = p.x - o.x, dy = p.y - o.y;
      const lx = dx * c - dy * s, lz = dx * s + dy * c; // into the item's frame
      let qx = Math.max(-o.hw, Math.min(o.hw, lx)), qz = Math.max(-o.hd, Math.min(o.hd, lz));
      let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
      if (d >= RADIUS) continue;
      if (d < 1e-6) { // centre is inside the footprint: leave by the nearest side
        const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
        if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; qx = Math.sign(lx) * o.hw; } else { ex = 0; ez = Math.sign(lz) || 1; qz = Math.sign(lz) * o.hd; }
        d = 1;
      }
      const nx = qx + (ex / d) * RADIUS, nz = qz + (ez / d) * RADIUS;
      p.x = o.x + nx * c + nz * s;
      p.y = o.y - nx * s + nz * c;
    }
  }

  groundAt(p, feet) {
    let best = -Infinity;
    for (const s of this.surfaces) if (s.top <= feet + STEP_UP && s.top > best && s.contains(p)) best = s.top;
    return best === -Infinity ? 0 : best;
  }

  collide(p) {
    const onStair = this.stairBoxes.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 && this.feet > b.base + 1);
    // only the walls of the storey you are on; the stair's top steps already count as upstairs
    const floor = floorAtHeight(this.plan, this.feet);
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const s of this.segs) {
        if (s.floor !== floor || (s.onStairOnly && !onStair)) continue;
        if (s.top <= this.feet + 0.35 || s.bottom >= this.feet + BODY) continue;
        const min = s.r + RADIUS;
        const d = distToSegment([p.x, p.y], s.a, s.b);
        if (d >= min) continue;
        // closest point on the segment
        const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((p.x - s.a[0]) * dx + (p.y - s.a[1]) * dy) / L2)) : 0;
        const qx = s.a[0] + dx * t, qy = s.a[1] + dy * t;
        if (d < 1e-6) continue;
        p.x = qx + ((p.x - qx) / d) * min;
        p.y = qy + ((p.y - qy) / d) * min;
        moved = true;
      }
      if (!moved) break;
    }
    this.pushOutOfFurniture(p, floor);
  }

  // ------------------------------------------------------------ input
  bindInput() {
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.closest?.('select, input')) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Desktop: click the view to capture the mouse (pointer lock), then just move the mouse to
    // look around, like a first-person game. Esc frees the mouse. Touch screens drag to look.
    this.canLock = !matchMedia('(pointer: coarse)').matches && 'requestPointerLock' in this.dom;
    this.lockRequestedAt = 0;
    this.unlockedAt = 0;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.dom;
      if (!locked) { this.unlockedAt = performance.now(); this.keys.clear(); }
      document.body.classList.toggle('mouse-locked', locked);
      this.onLockChange?.(locked);
    });
    const noLock = () => { this.canLock = false; document.body.classList.add('no-lock'); this.onLockChange?.(false); };
    document.addEventListener('pointerlockerror', noLock);
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      const k = 0.0022;
      this.yaw -= e.movementX * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * k, -1.45, 1.45);
    });

    const look = new Map();
    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (this.canLock && e.pointerType === 'mouse') {
        if (document.pointerLockElement !== this.dom) {
          this.lockRequestedAt = performance.now();
          try { this.dom.requestPointerLock()?.catch?.(noLock); } catch { noLock(); }
        }
        return;
      }
      // drag to look: touch, or a mouse where the browser won't capture it
      look.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dom.setPointerCapture(e.pointerId);
    });
    this.dom.addEventListener('pointermove', (e) => {
      const l = look.get(e.pointerId);
      if (!l || !this.enabled) return;
      // touch drags the view like a photo; a mouse turns the way it moves, as in games
      const k = e.pointerType === 'touch' ? 0.006 : -0.004;
      this.yaw += (e.clientX - l.x) * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - l.y) * k, -1.45, 1.45);
      l.x = e.clientX; l.y = e.clientY;
    });
    const end = (e) => look.delete(e.pointerId);
    this.dom.addEventListener('pointerup', end);
    this.dom.addEventListener('pointercancel', end);

    // on-screen joystick
    const pad = document.getElementById('joystick'), knob = pad.querySelector('.knob');
    let jid = null;
    const setJoy = (e) => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      this.joy.x = x; this.joy.y = y;
      knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
    };
    pad.addEventListener('pointerdown', (e) => { jid = e.pointerId; pad.setPointerCapture(jid); setJoy(e); e.stopPropagation(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === jid) setJoy(e); });
    const jend = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', jend);
    pad.addEventListener('pointercancel', jend);
  }

  // ------------------------------------------------------------ control
  enable(x, y, level, yaw = this.yaw) {
    this.enabled = true;
    this.teleport(x, y, level, yaw);
    this.camera.rotation.order = 'YXZ';
  }

  teleport(x, y, level, yaw = this.yaw) {
    this.pos.set(x, y);
    this.feet = level;
    this.eyeY = level + EYE;
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = 0;
  }

  disable() {
    this.enabled = false;
    this.keys.clear();
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  // the click that captures the mouse shouldn't also count as a click on the scene
  consumeLockClick() { return performance.now() - this.lockRequestedAt < 600; }

  get mouseLocked() { return document.pointerLockElement === this.dom; }

  update(dt) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    let f = 0, s = 0, turn = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (k.has('KeyQ')) turn += 1;
    if (k.has('KeyE')) turn -= 1;
    f -= this.joy.y; s += this.joy.x;
    this.yaw += turn * 1.8 * dt;

    const mag = Math.hypot(f, s);
    if (mag > 1) { f /= mag; s /= mag; }
    const speed = (run ? RUN : WALK) * dt;
    // forward in world XZ for yaw: (-sin, -cos); right: (cos, -sin). Plan y is world Z.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const next = new THREE.Vector2(this.pos.x + (-sin * f + cos * s) * speed, this.pos.y + (-cos * f - sin * s) * speed);
    this.collide(next);
    // don't walk up anything taller than a step
    // a tread or slab that is too tall to step onto but low enough to hit is an obstacle
    const blocked = (x, y) => this.surfaces.some((sf) => sf.top > this.feet + STEP_UP && sf.bottom < this.feet + HEADROOM && sf.contains([x, y]));
    // slide along the obstacle if the diagonal move is blocked
    if (!blocked(next.x, next.y)) this.pos.copy(next);
    else if (!blocked(next.x, this.pos.y)) this.pos.x = next.x;
    else if (!blocked(this.pos.x, next.y)) this.pos.y = next.y;

    const ground = this.groundAt([this.pos.x, this.pos.y], this.feet);
    if (ground >= this.feet) { this.feet = ground; this.vy = 0; }
    else { this.vy -= 32 * dt; this.feet = Math.max(ground, this.feet + this.vy * dt); if (this.feet === ground) this.vy = 0; }

    // smooth the eye so stairs feel like steps, not jolts
    const target = this.feet + EYE;
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * 12);
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.y);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // which floor the walker is on
  get floor() { return floorAtHeight(this.plan, this.feet); }
}

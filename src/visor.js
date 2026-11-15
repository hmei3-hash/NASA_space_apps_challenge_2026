// First-person helmet visor: a HUD drawn over the 3D view while walking the route.
// Everything shown here also appears in the Live conditions tab (with full source notes),
// so the visor is aria-hidden; warnings still go through the #hud live region.

const FOV_DEG = 90;           // degrees of heading shown across the compass tape
const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const norm = (d) => ((d % 360) + 360) % 360;
const delta = (a, b) => ((b - a + 540) % 360) - 180;   // signed difference a->b in (-180, 180]

export class Visor {
  constructor(host) {
    this.el = document.createElement('div');
    this.el.id = 'visor';
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `
      <div class="v-glass"></div>
      <div class="v-compass"><div class="v-tape"></div><div class="v-caret"></div><div class="v-hdg"></div></div>
      <div class="v-col v-left"></div>
      <div class="v-col v-right"></div>
      <div class="v-reticle"></div>
      <div class="v-grade"></div>
      <div class="v-wp next"><i></i><b></b><span></span></div>
      <div class="v-wp home"><i></i><b>HAB</b><span></span></div>
      <div class="v-wp mate"><i></i><b>EV2</b><span></span></div>
      <div class="v-help">Drag to look around · F to leave · relief ×<span class="v-exag"></span></div>`;
    host.appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this._last = {};
  }

  show(on) { this.el.hidden = !on; }

  _set(sel, html) { if (this._last[sel] !== html) { this.q(sel).innerHTML = html; this._last[sel] = html; } }

  _tape(hdg, marks) {
    const items = [];
    const lo = Math.ceil((hdg - FOV_DEG / 2) / 5) * 5;
    for (let d = lo; d <= hdg + FOV_DEG / 2; d += 5) {
      const x = 50 + (delta(hdg, norm(d)) / FOV_DEG) * 100, n = norm(d);
      const lbl = CARD[n] ?? (n % 15 === 0 ? String(n).padStart(3, '0') : '');
      items.push(`<span class="tk${CARD[n] ? ' card' : ''}${n % 15 ? ' minor' : ''}" style="left:${x.toFixed(2)}%">${lbl}</span>`);
    }
    for (const m of marks) {
      const dd = delta(hdg, m.brg), x = 50 + (Math.max(-FOV_DEG / 2, Math.min(FOV_DEG / 2, dd)) / FOV_DEG) * 100;
      items.push(`<span class="bm ${m.cls}${Math.abs(dd) > FOV_DEG / 2 ? ' edge' : ''}" style="left:${x.toFixed(2)}%">${m.label}</span>`);
    }
    return items.join('');
  }

  /** Put a marker on screen at a world position; clamp to the visor edge when it is off-screen or behind. */
  _place(sel, world, camera, w, h, text) {
    const el = this.q(sel);
    if (!world) { el.style.display = 'none'; return; }
    el.style.display = '';
    const v = world.clone().project(camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const m = 0.92, off = behind || Math.abs(x) > m || Math.abs(y) > m;
    if (off) { const k = m / Math.max(Math.abs(x), Math.abs(y), 1e-6); x *= k; y *= k; }
    el.classList.toggle('off', off);
    el.style.transform = `translate(${((x + 1) / 2) * w}px, ${((1 - y) / 2) * h}px)`;
    el.querySelector('span').textContent = text;
  }

  /**
   * d: { hdg, camera, w, h, exag,
   *      left: [{k, v, u, pv, warn}], right: [...],
   *      next: {name, world, brg, text}, home: {world, brg, text}, mate: {world, text},
   *      grade: {pct, slope, word} }
   */
  update(d) {
    if (this.el.hidden) return;
    const marks = [];
    if (d.next) marks.push({ brg: d.next.brg, cls: 'next', label: '◆' });
    if (d.home) marks.push({ brg: d.home.brg, cls: 'home', label: '⌂' });
    if (d.mate) marks.push({ brg: d.mate.brg, cls: 'mate', label: '●' });
    this.q('.v-tape').innerHTML = this._tape(d.hdg, marks);
    this._set('.v-hdg', String(Math.round(norm(d.hdg)) % 360).padStart(3, '0') + '°');
    const rows = (list) => list.map((r) => `<div class="vr${r.warn ? ' warn' : ''}"><span class="k">${r.k}</span><span class="v">${r.v}<small>${r.u || ''}</small></span>${r.pv || ''}</div>`).join('');
    this._set('.v-left', rows(d.left));
    this._set('.v-right', rows(d.right));
    const g = d.grade;
    this._set('.v-grade', `<span class="gw ${g.word.toLowerCase()}">${g.word}</span><span>${g.pct >= 0 ? '+' : ''}${g.pct.toFixed(0)}% grade</span><span>${g.slope.toFixed(0)}° ground</span>`);
    this.q('.v-wp.next b').textContent = d.next ? d.next.name : '';
    this._place('.v-wp.next', d.next?.world, d.camera, d.w, d.h, d.next?.text || '');
    this._place('.v-wp.home', d.home?.world, d.camera, d.w, d.h, d.home?.text || '');
    this._place('.v-wp.mate', d.mate?.world, d.camera, d.w, d.h, d.mate?.text || '');
    this._set('.v-exag', String(d.exag));
  }
}

/** Compass bearing (deg clockwise from north) from map metres; map x = east, y = south. */
export const bearing = (dx, dy) => norm((Math.atan2(dx, -dy) * 180) / Math.PI);
/** Heading of a first-person yaw (world x = east, world z = south). */
export const yawToHeading = (yaw) => bearing(Math.cos(yaw), Math.sin(yaw));

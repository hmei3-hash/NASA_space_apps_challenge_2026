// Traverse profile strip: elevation along the selected route vs mission time, coloured by gait,
// with a small animated astronaut riding the profile at the current time. Click/drag to scrub.

const COL = {
  uphill: '#e8894a', downhill: '#6fa8dc', normal: '#b99a7c', stop: '#f2efe9',
  done: 1, todo: 0.42, grid: 'rgba(236,230,220,0.08)', text: '#9aa3ad', ink: '#ece6dc',
};
const GAIT = {
  normal: { A: 0.42, K: 0.7, kBase: 0.08, lean: 0.06, rate: 7 },
  uphill: { A: 0.55, K: 1.05, kBase: 0.25, lean: 0.38, rate: 4.2 },
  downhill: { A: 0.28, K: 0.45, kBase: 0.3, lean: -0.12, rate: 5 },
};
export const GAIT_LABEL = { normal: 'Level ground', uphill: 'Climbing', downhill: 'Descending', sampling: 'Sampling' };

const gaitOf = (s) => (s.phase === 'stop' ? 'stop' : s.grade > 0.08 ? 'uphill' : s.grade < -0.08 ? 'downhill' : 'normal');

export class ProfileStrip {
  constructor(canvas, onScrub) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.onScrub = onScrub;
    this.route = null; this.phase = 0; this.pad = { l: 46, r: 14, t: 46, b: 22 };
    let drag = false;
    const at = (e) => {
      if (!this.route) return;
      const r = this.c.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left - this.pad.l) / (r.width - this.pad.l - this.pad.r)));
      this.onScrub(f * this.end());
    };
    canvas.addEventListener('pointerdown', (e) => { drag = true; canvas.setPointerCapture(e.pointerId); at(e); });
    canvas.addEventListener('pointermove', (e) => { if (drag) at(e); });
    canvas.addEventListener('pointerup', () => { drag = false; });
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider'); canvas.setAttribute('aria-valuemin', '0');
    canvas.addEventListener('keydown', (e) => {
      if (!this.route) return;
      const step = this.end() / 100;
      if (e.key === 'ArrowRight') { this.onScrub(Math.min(this.end(), this.t + step)); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { this.onScrub(Math.max(0, this.t - step)); e.preventDefault(); }
    });
  }

  setRoute(route, opts) {
    this.route = route; this.opts = opts;
    if (!route) return;
    let lo = Infinity, hi = -Infinity;
    for (const s of route.samples) { lo = Math.min(lo, s.z); hi = Math.max(hi, s.z); }
    const span = Math.max(20, hi - lo);
    this.zlo = lo - span * 0.12; this.zhi = hi + span * 0.12;
  }

  /** Timeline length: the route, or longer when the view continues after the crew is home. */
  end() { return Math.max(this.route?.durationS || 0, this.opts?.endS || 0); }

  _resize() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = this.c.clientWidth, h = this.c.clientHeight;
    if (this.c.width !== Math.round(w * dpr) || this.c.height !== Math.round(h * dpr)) { this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr); }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  draw(tS, state, here, dtReal, walking) {
    this.t = tS;
    const { w, h } = this._resize(), g = this.g, P = this.pad, R = this.route;
    g.clearRect(0, 0, w, h);
    if (!R) { g.fillStyle = COL.text; g.font = '13px Barlow, sans-serif'; g.fillText('No route under the slope limit — pick another destination.', P.l, h / 2); return; }
    const D = this.end(), RD = R.durationS, iw = w - P.l - P.r, ih = h - P.t - P.b;
    const X = (t) => P.l + (t / D) * iw;
    const Y = (z) => P.t + ih - ((z - this.zlo) / (this.zhi - this.zlo)) * ih;

    // grid: hour ticks + elevation labels
    g.font = '11px "Barlow Condensed", Barlow, sans-serif'; g.textBaseline = 'top';
    for (let hr = 0; hr * 3600 <= D; hr++) {
      const x = X(hr * 3600); g.fillStyle = COL.grid; g.fillRect(x, P.t - 6, 1, ih + 6);
      g.fillStyle = COL.text; g.fillText(`${hr} h`, x + 3, h - P.b + 6);
    }
    g.textBaseline = 'middle'; g.textAlign = 'right';
    [this.zlo + (this.zhi - this.zlo) * 0.15, this.zlo + (this.zhi - this.zlo) * 0.85].forEach((z) => { g.fillStyle = COL.text; g.fillText(`${Math.round(z)} m`, P.l - 6, Y(z)); });
    g.textAlign = 'left';

    // profile area, coloured per segment by gait (opaque), then the not-yet-walked part is dimmed
    const S = R.samples;
    for (let k = 1; k < S.length; k++) {
      const a = S[k - 1], b = S[k];
      if (b.t <= a.t) continue;
      const x0 = X(a.t), x1 = X(b.t), gt = gaitOf(b);
      g.fillStyle = gt === 'stop' ? '#3a4250' : COL[gt];
      const xe = x1 + 0.7; // overlap to avoid hairline gaps
      g.beginPath(); g.moveTo(x0, Y(a.z)); g.lineTo(xe, Y(b.z)); g.lineTo(xe, P.t + ih); g.lineTo(x0, P.t + ih); g.closePath(); g.fill();
      if (gt === 'stop' && x1 - x0 > 46) {
        g.fillStyle = COL.ink; g.font = '11px Barlow, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
        g.fillText(`stop ${Math.round((b.t - a.t) / 60)} min${b.stopTag && b.stopTag !== 'destination' ? ' at ' + b.stopTag : ''}`, (x0 + x1) / 2, P.t + ih - 10);
        g.textAlign = 'left';
      }
    }
    if (D > RD) {
      const last = S[S.length - 1], x0 = X(RD), x1 = X(D), y = Y(last.z);
      g.fillStyle = '#2b3a4c'; g.fillRect(x0, y, x1 - x0, P.t + ih - y);
      g.fillStyle = '#9fd3ff'; g.fillRect(x0, y - 1, x1 - x0, 2);
      if (x1 - x0 > 60) { g.fillStyle = COL.ink; g.font = '11px Barlow, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('inside the habitat', (x0 + x1) / 2, P.t + ih - 10); g.textAlign = 'left'; }
    }
    const cxNow = X(Math.min(tS, D));
    g.fillStyle = 'rgba(26,31,39,0.55)'; g.fillRect(cxNow, P.t - 2, X(D) - cxNow + 1, ih + 2);
    // ridge line
    g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 1.2; g.beginPath();
    S.forEach((s, k) => (k ? g.lineTo(X(s.t), Y(s.z)) : g.moveTo(X(s.t), Y(s.z)))); g.stroke();

    // event markers
    const mark = (t, color, text, dashed) => {
      if (t > D) return; const x = X(t);
      g.strokeStyle = color; g.lineWidth = 2; g.setLineDash(dashed ? [4, 3] : []);
      g.beginPath(); g.moveTo(x, P.t - 8); g.lineTo(x, P.t + ih); g.stroke(); g.setLineDash([]);
      g.fillStyle = color; g.font = '11px "Barlow Condensed", Barlow, sans-serif'; g.textBaseline = 'bottom'; g.fillText(text, x + 3, P.t - 8);
    };
    const o = this.opts || {};
    if (o.warnS !== undefined && o.dust?.on) mark(o.warnS, '#f2c14e', 'dust warning', true);
    if (o.dust?.on) mark(o.dust.startS, '#c98a4a', 'front at habitat');
    if (o.sep?.on) mark(o.sep.startS, '#ff5a4e', 'solar particle event');
    if (o.budgetS < D) mark(o.budgetS, '#b48cf2', 'EVA limit', true);

    // current position: cursor + mini astronaut standing on the profile
    const cx = X(Math.min(tS, D)), cz = here.z, cy = Y(cz);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, P.t - 4); g.lineTo(cx, P.t + ih); g.stroke();
    const gait = state.gait === 'sampling' ? 'sampling' : state.gait;
    if (walking && gait !== 'sampling') this.phase += dtReal * (GAIT[gait] || GAIT.normal).rate;
    drawMiniAstronaut(g, cx, cy, gait, this.phase, walking, performance.now() / 1000, 40);

    // expose position to assistive tech
    const hm = (s) => `${Math.floor(s / 3600)} hours ${Math.round((s % 3600) / 60)} minutes`;
    this.c.setAttribute('aria-valuemax', String(Math.round(D)));
    this.c.setAttribute('aria-valuenow', String(Math.round(tS)));
    this.c.setAttribute('aria-valuetext', `${hm(tS)} into the EVA, ${gait === 'sampling' ? 'sampling' : GAIT_LABEL[gait].toLowerCase()}, elevation ${Math.round(cz)} metres`);
    // state bubble
    const pct = Math.round(here.grade * 100);
    const label = tS >= RD - 1 ? 'Inside the habitat' : here.stopTag === 'rover' ? 'Sheltering in the rover' : here.phase === 'drive' ? 'Driving home in the rover' : gait === 'sampling' ? `Sampling${here.stopTag ? ' at ' + here.stopTag : ''}` : `${GAIT_LABEL[gait]}${gait === 'normal' ? '' : ` ${pct > 0 ? '+' : ''}${pct}% grade`}`;
    g.font = '600 12px Barlow, sans-serif'; const tw = g.measureText(label).width;
    let bx = cx + 18; if (bx + tw + 14 > w - 2) bx = cx - 18 - tw - 14;
    const by = Math.max(2, cy - 58);
    g.fillStyle = 'rgba(20,24,31,0.92)'; roundRect(g, bx, by, tw + 14, 20, 10); g.fill();
    g.strokeStyle = gait === 'sampling' ? COL.stop : COL[gait] || COL.normal; g.lineWidth = 1.5; roundRect(g, bx, by, tw + 14, 20, 10); g.stroke();
    g.fillStyle = COL.ink; g.textBaseline = 'middle'; g.fillText(label, bx + 7, by + 10.5);
  }
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** Side-view astronaut (facing right), feet at (x, y), height px. */
export function drawMiniAstronaut(g, x, y, gait, ph, walking, t, H = 30) {
  const u = H / 1.9; // px per "metre"
  let thL, knL, thR, knR, lean, hipY, armL, armR;
  if (gait === 'sampling') {
    thL = 1.35; knL = 1.4; thR = -0.15; knR = 1.6; lean = 0.45; hipY = 0.56; armL = 0.3; armR = 1.15 + 0.12 * Math.sin(t * 2.5);
  } else {
    const p = GAIT[gait] || GAIT.normal, w = walking ? 1 : 0;
    thL = p.A * Math.sin(ph) * w; thR = p.A * Math.sin(ph + Math.PI) * w;
    knL = p.kBase + p.K * Math.max(0, Math.cos(ph)) * w; knR = p.kBase + p.K * Math.max(0, Math.cos(ph + Math.PI)) * w;
    lean = p.lean; hipY = walking ? 0.97 - 0.025 * Math.abs(Math.cos(ph)) : 0.98 + 0.006 * Math.sin(t * 1.5);
    armL = -0.35 * Math.sin(ph) * w; armR = -0.35 * Math.sin(ph + Math.PI) * w;
  }
  const hx = x, hy = y - hipY * u;
  const leg = (th, kn, color) => {
    const kx = hx + Math.sin(th) * 0.45 * u, ky = hy + Math.cos(th) * 0.45 * u;
    const sa = th - kn, fx = kx + Math.sin(sa) * 0.47 * u, fy = ky + Math.cos(sa) * 0.47 * u;
    g.strokeStyle = color; g.lineWidth = 0.19 * u; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
    g.fillStyle = '#5b636d'; g.fillRect(fx - 0.06 * u, fy - 0.03 * u, 0.3 * u, 0.1 * u); // boot
  };
  g.save();
  // ground shadow
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y + 1, 0.4 * u, 0.08 * u, 0, 0, Math.PI * 2); g.fill();
  leg(thR, knR, '#c9ccd0');
  // torso (rotated by lean about the hip)
  g.translate(hx, hy); g.rotate(lean);
  g.fillStyle = '#9aa1a9'; roundRect(g, -0.42 * u, -0.78 * u, 0.24 * u, 0.62 * u, 0.05 * u); g.fill(); // backpack
  g.fillStyle = '#f4f2ee'; roundRect(g, -0.2 * u, -0.72 * u, 0.4 * u, 0.74 * u, 0.12 * u); g.fill(); // torso
  g.fillStyle = '#7fb2d9'; g.fillRect(0.12 * u, -0.5 * u, 0.06 * u, 0.12 * u); // chest panel light
  // helmet + visor
  g.fillStyle = '#f4f2ee'; g.beginPath(); g.arc(0.02 * u, -0.95 * u, 0.22 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d9a520'; g.beginPath(); g.arc(0.06 * u, -0.95 * u, 0.16 * u, -1.0, 1.0); g.lineTo(0.06 * u, -0.95 * u); g.closePath(); g.fill();
  // arms
  const arm = (a, color) => {
    const sx = 0, sy = -0.6 * u, ex = sx + Math.sin(a) * 0.3 * u, ey = sy + Math.cos(a) * 0.3 * u;
    const fx = ex + Math.sin(a + 0.4) * 0.3 * u, fy = ey + Math.cos(a + 0.4) * 0.3 * u;
    g.strokeStyle = color; g.lineWidth = 0.15 * u; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(fx, fy); g.stroke();
    return [fx, fy];
  };
  arm(armL, '#c9ccd0');
  g.restore();
  leg(thL, knL, '#f4f2ee');
  g.save(); g.translate(hx, hy); g.rotate(lean);
  const [tx, ty] = (() => {
    const sx = 0, sy = -0.6 * u, ex = sx + Math.sin(armR) * 0.3 * u, ey = sy + Math.cos(armR) * 0.3 * u;
    const fx = ex + Math.sin(armR + 0.4) * 0.3 * u, fy = ey + Math.cos(armR + 0.4) * 0.3 * u;
    g.strokeStyle = '#f4f2ee'; g.lineWidth = 0.15 * u; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(fx, fy); g.stroke();
    return [fx, fy];
  })();
  if (gait === 'sampling') { g.strokeStyle = '#c9ccd0'; g.lineWidth = 0.05 * u; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + 0.25 * u, ty + 0.45 * u); g.stroke(); }
  g.restore();
}

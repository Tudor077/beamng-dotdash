// DotDash - the renderer. Knows nothing about BeamNG: hand it a canvas, then
// call update(data) with plain numbers whenever new ones arrive. The game
// adapter (app.js) and the browser preview (preview.html) both drive this.
//
// Performance: one 2D canvas, redrawn only when data arrives (the game streams
// at ~30-60 Hz), no DOM churn, no layout. Static parts - the dot grid of the
// G meter - are drawn once into an offscreen canvas and blitted.
//
// data = {
//   speed: m/s, rpm, maxRpm, gear: "N" | "R" | "1".., throttle 0..1, brake 0..1,
//   gx, gy: g (lateral, longitudinal), water, oil: °C, fuel: 0..1,
//   abs, tcs: bool (active), speedText, speedUnit: optional, from the game's units
// }

(function (root) {
  "use strict";

  const WHITE = "#ffffff", RED = "#D71920", DIM = "#262626", MUTE = "#6b6b6b", GREY = "#B1B3B3";
  const RPM_DOTS = 34;
  const TRAIL = 24;

  function DotDash(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = Object.assign({ fonts: {} }, opts || {});
    this.trail = [];
    this.timer = { state: "idle", t0: 0, best: null, last: null };
    this.peakG = 0;
    this.blink = 0;
    this.data = null;
    this._grid = null;
    this.resize();
  }

  DotDash.prototype.resize = function () {
    const r = this.cv.getBoundingClientRect();
    const dpr = root.devicePixelRatio || 1;
    this.W = Math.max(200, r.width);
    this.H = Math.max(80, r.height);
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.dpr = dpr;
    this._grid = null;                       // geometry changed: rebuild the static layer
    if (this.data) this.draw();
  };

  // ---- the 0-100 km/h timer: arms at a standstill, runs from the first metre
  // 0-100 km/h, or 0-60 mph when the game shows mph
  DotDash.prototype._timer = function (ms, unit, now) {
    const t = this.timer, mph = /mph/i.test(unit || "");
    if (mph !== this.mph) { this.mph = mph; t.state = "idle"; t.best = t.last = null; }
    const v = ms * (mph ? 2.23694 : 3.6), target = mph ? 60 : 100;
    if (v < 0.5) { t.state = "armed"; return; }
    if (t.state === "armed" && v >= 0.5) { t.state = "run"; t.t0 = now; }
    if (t.state === "run" && v >= target) {
      t.last = (now - t.t0) / 1000;
      if (t.best === null || t.last < t.best) t.best = t.last;
      t.state = "done";
    }
  };

  DotDash.prototype.update = function (d) {
    const now = performance.now();
    this._timer(d.speed || 0, d.speedUnit, now);
    this.trail.push([d.gx || 0, d.gy || 0]);
    if (this.trail.length > TRAIL) this.trail.shift();
    this.peakG = Math.max(this.peakG * 0.999, Math.hypot(d.gx || 0, d.gy || 0));
    this.data = d;
    this.draw(now);
  };

  DotDash.prototype._font = function (kind, px) {
    const f = this.opts.fonts;
    const fam = { dot: f.dot || "'NDot 55', 'DD Mono', 'Consolas', monospace",
                  head: f.head || "'NType82 Headline', 'DD Head', 'Segoe UI', sans-serif",
                  mono: f.mono || "'NType82 Mono', 'DD Mono', 'Consolas', monospace" }[kind];
    return `${px}px ${fam}`;
  };

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // G meter: dots inside a circle, rings at 0.5 g and 1 g - static, cached
  DotDash.prototype._gridLayer = function (cx, cy, R) {
    const g = document.createElement("canvas");
    g.width = this.cv.width; g.height = this.cv.height;
    const c = g.getContext("2d");
    c.scale(this.dpr, this.dpr);
    const step = Math.max(6, R / 7);
    for (let y = -R; y <= R; y += step)
      for (let x = -R; x <= R; x += step)
        if (x * x + y * y <= R * R) {
          c.fillStyle = (Math.abs(x) < 1 || Math.abs(y) < 1) ? "#3a3a3a" : "#1f1f1f";
          c.beginPath(); c.arc(cx + x, cy + y, 1.6, 0, 6.283); c.fill();
        }
    c.strokeStyle = "#2a2a2a"; c.lineWidth = 1;
    for (const k of [0.5, 1]) { c.beginPath(); c.arc(cx, cy, R * k, 0, 6.283); c.stroke(); }
    return g;
  };

  DotDash.prototype.draw = function (now) {
    const d = this.data, c = this.ctx, W = this.W, H = this.H;
    now = now || performance.now();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    // card
    rr(c, 0, 0, W, H, Math.min(24, H * 0.14));
    c.fillStyle = "rgba(0,0,0,0.84)"; c.fill();

    const P = Math.max(12, H * 0.08);           // padding
    const maxRpm = d.maxRpm > 0 ? d.maxRpm : 7000;
    const frac = Math.min(1, Math.max(0, (d.rpm || 0) / maxRpm));
    const shift = frac >= 0.95;
    this.blink = shift ? (Math.floor(now / 70) % 2) : 0;

    // ---- RPM glyph row ----
    const rowY = P, rowH = Math.max(6, H * 0.055);
    const gap = Math.max(2, W * 0.004);
    const dw = (W - 2 * P - gap * (RPM_DOTS - 1)) / RPM_DOTS;
    const lit = Math.round(frac * RPM_DOTS);
    const redFrom = Math.floor(RPM_DOTS * 0.82);
    if ((root.DOT_STYLE || {}).gauge !== "dots" && root.dotGaugeBar) {
      root.dotGaugeBar(c, P, W - P, rowY + rowH / 2, rowH, frac, 0.82, shift, this.blink);
    } else for (let i = 0; i < RPM_DOTS; i++) {
      const on = i < lit;
      let col = DIM;
      if (on) col = shift ? (this.blink ? RED : "#5a0b0e") : (i >= redFrom ? RED : WHITE);
      else if (i >= redFrom) col = "#2a1112";
      c.fillStyle = col;
      rr(c, P + i * (dw + gap), rowY, dw, rowH, rowH / 2); c.fill();
    }
    c.font = this._font("mono", Math.max(9, H * 0.05));
    c.fillStyle = MUTE; c.textAlign = "left"; c.textBaseline = "top";
    c.fillText("RPM " + Math.round(d.rpm || 0), P, rowY + rowH + 6);
    c.textAlign = "right";
    c.fillText(Math.round(maxRpm / 100) / 10 + "K", W - P, rowY + rowH + 6);
    // 0-100 km/h, centred under the rpm row: runs live, then holds the time;
    // red when it is the best of the session
    const t = this.timer;
    const running = t.state === "run";
    const timeTxt = running ? ((now - t.t0) / 1000).toFixed(1) + "s"
                  : t.last !== null ? t.last.toFixed(2) + "s" : "--.--";
    const isBest = t.best !== null && t.last === t.best && t.state === "done";
    c.textAlign = "center";
    const lbl = (this.mph ? "0-60" : "0-100") + "  ";
    const wl = c.measureText(lbl).width, wt = c.measureText(timeTxt).width;
    const cx0 = W / 2 - (wl + wt) / 2;
    c.textAlign = "left";
    c.fillStyle = MUTE; c.fillText(lbl, cx0, rowY + rowH + 6);
    c.fillStyle = isBest ? RED : running ? WHITE : GREY; c.fillText(timeTxt, cx0 + wl, rowY + rowH + 6);

    // ---- layout below the row ----
    const top = rowY + rowH + H * 0.12;
    const bottomH = H * 0.2;
    const midH = H - top - bottomH - P * 0.6;
    const gR = Math.min(midH / 2, W * 0.13);
    const gCx = W - P - gR, gCy = top + midH / 2;

    // ---- speed, NDot ----
    const kmh = (d.speed || 0) * 3.6;
    const spd = d.speedText !== undefined ? d.speedText : String(Math.round(kmh));
    const sz = midH * 1.02;
    const speedRight = W * 0.42;
    // dim leading zeros, like a real dot display
    const pad = "000".slice(Math.min(3, spd.length));
    if ((root.DOT_STYLE || {}).digits && ["dot"].indexOf(root.DOT_STYLE.digits) < 0 && root.dotNum) {
      const f = (k, px) => this._font(k, px), ym = top + midH * 0.86 - sz * 0.36;
      const wSpd = root.dotNumWidth(c, spd, sz, f), gapW = root.dotNumWidth(c, "00", sz, f) - 2 * root.dotNumWidth(c, "0", sz, f);
      if (pad) root.dotNum(c, pad, speedRight - wSpd + gapW, ym, sz, "#1c1c1c", "right", f);
      root.dotNum(c, spd, speedRight, ym, sz, WHITE, "right", f);
    } else {
      c.font = this._font("dot", sz);
      c.textBaseline = "alphabetic"; c.textAlign = "right";
      const wSpd = c.measureText(spd).width;
      c.fillStyle = "#1c1c1c"; c.fillText(pad, speedRight - wSpd, top + midH * 0.86);
      c.fillStyle = WHITE; c.fillText(spd, speedRight, top + midH * 0.86);
    }
    c.font = this._font("mono", Math.max(9, H * 0.05));
    c.fillStyle = GREY; c.textAlign = "left";
    c.fillText((d.speedUnit || "km/h").toUpperCase(), speedRight + 8, top + midH * 0.86);

    // ---- gear, in a ring that turns red at the shift point ----
    const gx0 = speedRight + (gCx - gR - speedRight) / 2 + 10, gy0 = gCy;
    const ringR = Math.min(midH * 0.5, (gCx - gR - speedRight) * 0.32);
    c.beginPath(); c.arc(gx0, gy0, ringR, 0, 6.283);
    c.fillStyle = shift && this.blink ? RED : "#111"; c.fill();
    c.strokeStyle = shift ? RED : "#333"; c.lineWidth = 2; c.stroke();
    // rpm progress around the ring
    c.beginPath(); c.arc(gx0, gy0, ringR + 5, -Math.PI / 2, -Math.PI / 2 + frac * 6.283);
    c.strokeStyle = frac >= 0.82 ? RED : WHITE; c.lineWidth = 2.5; c.stroke();
    const g = d.gear === undefined ? "N" : String(d.gear), m = /^([SM])(\d+)$/.exec(g);
    c.textAlign = "center"; c.textBaseline = "middle";
    if (m) {   // "S3" / "M4": the number big, the mode letter small beside it
      c.font = this._font("head", ringR * 1.05); const wn = c.measureText(m[2]).width;
      c.fillStyle = WHITE; c.fillText(m[2], gx0 + ringR * 0.12, gy0 + ringR * 0.06);
      c.font = this._font("mono", ringR * 0.42);
      c.fillStyle = m[1] === "S" ? RED : GREY; c.fillText(m[1], gx0 + ringR * 0.12 - wn / 2 - ringR * 0.22, gy0 - ringR * 0.22);
    } else {
      c.font = this._font("head", ringR * (g.length > 1 ? 0.85 : 1.15));
      c.fillStyle = WHITE; c.fillText(g, gx0, gy0 + ringR * 0.06);
    }

    // ---- G meter ----
    if (!this._grid) this._grid = this._gridLayer(gCx, gCy, gR);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this._grid, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const GMAX = 1.5;
    const toXY = (p) => [gCx + Math.max(-1, Math.min(1, p[0] / GMAX)) * gR,
                         gCy - Math.max(-1, Math.min(1, p[1] / GMAX)) * gR];
    this.trail.forEach((p, i) => {
      const [x, y] = toXY(p);
      c.globalAlpha = (i + 1) / this.trail.length * 0.6;
      c.fillStyle = WHITE; c.beginPath(); c.arc(x, y, 1.8, 0, 6.283); c.fill();
    });
    c.globalAlpha = 1;
    const [px, py] = toXY([d.gx || 0, d.gy || 0]);
    c.fillStyle = RED; c.beginPath(); c.arc(px, py, Math.max(4, gR * 0.08), 0, 6.283); c.fill();
    c.font = this._font("mono", Math.max(9, H * 0.05));
    c.textBaseline = "middle";
    const gLineY = H - P - (H * 0.2) * 0.55;
    c.fillStyle = WHITE; c.textAlign = "right";
    c.fillText(Math.hypot(d.gx || 0, d.gy || 0).toFixed(2) + "G", gCx + gR, gLineY);
    c.fillStyle = MUTE; c.textAlign = "left";
    c.fillText("PK " + this.peakG.toFixed(2), gCx - gR, gLineY);

    // ---- bottom strip: pedals as dot bars, then the readouts ----
    const by = H - P - bottomH * 0.55;
    const fs = Math.max(9, H * 0.052);
    c.font = this._font("mono", fs); c.textBaseline = "middle";
    const bar = (x, label, v, col) => {
      c.fillStyle = MUTE; c.textAlign = "left"; c.fillText(label, x, by);
      const n = 8, s = fs * 0.62, x0 = x + c.measureText(label + " ").width;
      for (let i = 0; i < n; i++) {
        c.fillStyle = i < Math.round(v * n) ? col : DIM;
        c.beginPath(); c.arc(x0 + i * (s + 2) + s / 2, by, s / 2, 0, 6.283); c.fill();
      }
      return x0 + n * (s + 2) + fs;
    };
    let x = P;
    x = bar(x, "THR", d.throttle || 0, WHITE);
    x = bar(x, "BRK", d.brake || 0, RED);

    const items = [];
    if (d.water !== undefined) items.push(["H2O", d.waterText || Math.round(d.water) + "°", d.water > 115]);
    if (d.oil !== undefined) items.push(["OIL", d.oilText || Math.round(d.oil) + "°", d.oil > 130]);
    if (d.fuel !== undefined) items.push(["FUEL", Math.round(d.fuel * 100) + "%", d.fuel < 0.1]);
    if (d.abs) items.push(["ABS", "", true]);
    if (d.tcs) items.push(["TCS", "", true]);
    // stop short of the G meter's column - its readouts live under it
    const limit = gCx - gR - fs;
    for (const [label, val, warn, best] of items) {
      const w = c.measureText(label + " " + val).width;
      if (x + w > limit) break;
      c.fillStyle = MUTE; c.textAlign = "left"; c.fillText(label, x, by);
      x += c.measureText(label + " ").width;
      c.fillStyle = warn ? RED : best ? RED : WHITE;
      c.fillText(val, x, by);
      x += c.measureText(val).width + fs * 1.2;
    }
  };

  root.DotDash = DotDash;
})(typeof window !== "undefined" ? window : this);

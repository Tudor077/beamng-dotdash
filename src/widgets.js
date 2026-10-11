// DotDash widgets - one canvas each, so each can be its own BeamNG app and be
// placed, sized and hidden on its own. They all take the object streams.js
// makes (dotData) and redraw only when it arrives.
//
//   DotTacho     rpm and speed in one round gauge, gear, fuel, water, warnings
//   DotBoost     turbo pressure, bar, with vacuum and a peak hold
//   DotGMeter    lateral / longitudinal G with a trail and peak
//   DotPedals    clutch, brake, throttle, handbrake as thick bars with %
//   DotPedalsClear  the same with no background and the % inside the bars
//   DotRpm       the rpm glyph row on its own, with a shift light
//   DotGearRing  the gear in a circle with the revs round it
//   DotGear      the current gear, big, with the gearbox type and 4/6
//   DotGears     every gear of the box on a row, current lit, next one red at the limit
//   DotInfo      water, oil, fuel as readouts with dot bars
//   DotTimer     0-100 and 0-200 km/h, session bests
//   DotStartStop the engine button - drawn here, pressed in the adapter

(function (root) {
  "use strict";

  var WHITE = "#ffffff", RED = "#D71920", DIM = "#232323", DIMRED = "#2a1112",
      MUTE = "#6b6b6b", GREY = "#B1B3B3", CARD = "rgba(0,0,0,0.84)";
  var TAU = Math.PI * 2;
  var A0 = 0.75 * Math.PI, A1 = 2.25 * Math.PI;      // gauges sweep 270°, open at the bottom

  function font(kind, px) {
    // a private build can embed its own faces; the public one falls back to
    // Overpass / Overpass Mono, which ship with BeamNG itself (see build.py)
    var fam = { dot: "'NDot 55', 'DD Mono', Consolas, monospace",
                head: "'NType82 Headline', 'DD Head', 'Segoe UI', sans-serif",
                mono: "'NType82 Mono', 'DD Mono', Consolas, monospace" }[kind];
    return Math.max(8, px) + "px " + fam;
  }
  function dot(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function text(c, s, x, y, f, col, align, base) {
    c.font = f; c.fillStyle = col; c.textAlign = align || "center"; c.textBaseline = base || "middle";
    c.fillText(s, x, y);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // A gear as the gearbox names it. "S3" / "M4" (sport / manual mode of an
  // automatic or DCT) get the number big and the mode letter small beside it;
  // everything else - P R N D, 1-9, R2 - is set as it is.
  function gearText(c, g, x, y, size, col) {
    g = g === undefined || g === null ? "N" : String(g);
    var m = /^([SM])(\d+)$/.exec(g);
    if (!m) { text(c, g, x, y, font("head", size * (g.length > 1 ? 0.78 : 1)), col); return; }
    c.font = font("head", size); var wn = c.measureText(m[2]).width;
    c.font = font("mono", size * 0.42); var wl = c.measureText(m[1]).width;
    var gap = size * 0.05, x0 = x - (wn + gap + wl) / 2;
    text(c, m[1], x0 + wl / 2, y - size * 0.22, font("mono", size * 0.42), m[1] === "S" ? RED : GREY);
    text(c, m[2], x0 + wl + gap + wn / 2, y, font("head", size), col);
  }
  root.dotGearText = gearText;
  // figures in the chosen look (numfont.js): NDot, tiled grid or solid block
  function num(c, s, x, y, size, col, align) { root.dotNum(c, s, x, y, size, col, align, font); }
  function lineGauges() { return (root.DOT_STYLE || {}).gauge !== "dots"; }

  // ---- the shared part: canvas sizing, redraw on data ----------------------
  function Base(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.data = null;
    this.resize();
  }
  Base.prototype.resize = function () {
    var r = this.cv.getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
    this.W = Math.max(40, r.width); this.H = Math.max(40, r.height); this.dpr = dpr;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.cache = null;
    if (this.data) this.draw();
  };
  Base.prototype.update = function (d) {
    if (!d) return;
    var now = performance.now();
    this.data = d;
    if (this.tick) this.tick(d, now);
    this.draw(now);
  };
  Base.prototype.draw = function (now) {
    var c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    this.paint(c, this.W, this.H, now || performance.now(), this.data);
  };
  // round card centred in the canvas; returns centre and radius
  Base.prototype.disc = function (c) {
    var S = Math.min(this.W, this.H), cx = this.W / 2, cy = this.H / 2;
    c.beginPath(); c.arc(cx, cy, S / 2, 0, TAU);
    c.fillStyle = CARD; c.fill();
    return { S: S, cx: cx, cy: cy, R: S / 2 };
  };
  Base.prototype.card = function (c) {
    rr(c, 0, 0, this.W, this.H, Math.min(22, Math.min(this.W, this.H) * 0.16));
    c.fillStyle = CARD; c.fill();
  };
  function make(paint, tick, init) {
    function W(canvas) { if (init) init.call(this); Base.call(this, canvas); }
    W.prototype = Object.create(Base.prototype);
    W.prototype.paint = paint;
    if (tick) W.prototype.tick = tick;
    return W;
  }

  // dots along the gauge arc; lit(i, frac) -> colour
  function arcDots(c, cx, cy, rad, n, size, colour) {
    for (var i = 0; i < n; i++) {
      var f = n === 1 ? 0 : i / (n - 1), a = A0 + (A1 - A0) * f;
      dot(c, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, size, colour(i, f));
    }
  }

  // ---- tacho: rpm round the outside, speed in the middle ------------------
  root.DotTacho = make(function (c, W, H, now, d) {
    var g = this.disc(c), S = g.S, cx = g.cx, cy = g.cy, R = g.R;
    var maxRpm = d.maxRpm > 0 ? d.maxRpm : 7000;
    var maxK = Math.ceil(maxRpm / 1000), scale = maxK * 1000;
    var frac = clamp((d.rpm || 0) / scale, 0, 1);
    var redFrom = maxRpm * 0.9 / scale;
    var shift = (d.rpm || 0) >= maxRpm * 0.95;
    var blink = shift && Math.floor(now / 70) % 2;
    var n = clamp(maxK * 5, 30, 60);

    if (lineGauges()) root.dotGaugeArc(c, cx, cy, R * 0.86, Math.max(4, S * 0.045), A0, A1, frac, redFrom, shift, blink);
    else arcDots(c, cx, cy, R * 0.86, n, Math.max(2, S * 0.016), function (i, f) {
      var on = f <= frac + 1e-6 && frac > 0, red = f >= redFrom;
      if (on) return shift ? (blink ? RED : "#5a0b0e") : red ? RED : WHITE;
      return red ? DIMRED : DIM;
    });
    for (var k = 0; k <= maxK; k++) {
      var a = A0 + (A1 - A0) * (k / maxK);
      text(c, String(k), cx + Math.cos(a) * R * 0.71, cy + Math.sin(a) * R * 0.71,
           font("mono", S * 0.055), k * 1000 >= maxRpm * 0.9 ? RED : GREY);
    }

    // speed, unit, gear - stacked in the middle, clear of the scale ends
    var spd = d.speedText !== undefined ? d.speedText : String(Math.round((d.speed || 0) * 3.6));
    num(c, spd, cx, cy - S * 0.06, S * 0.2, WHITE);
    text(c, (d.speedUnit || "km/h").toUpperCase(), cx, cy + S * 0.065, font("mono", S * 0.04), GREY);
    var gy = cy + S * 0.18;
    gearText(c, d.gear, cx, gy, S * 0.12, shift ? RED : WHITE);
    text(c, "×1000 RPM", cx, cy - S * 0.27, font("mono", S * 0.032), MUTE);

    // turn signals either side of the gear
    var sx = S * 0.12, t = S * 0.028;
    var SIGNAL = "#FFC700";                     // turn signals in yellow
    c.fillStyle = d.signalL ? SIGNAL : DIM;
    c.beginPath(); c.moveTo(cx - sx - t, gy); c.lineTo(cx - sx + t * 0.6, gy - t); c.lineTo(cx - sx + t * 0.6, gy + t); c.fill();
    c.fillStyle = d.signalR ? SIGNAL : DIM;
    c.beginPath(); c.moveTo(cx + sx + t, gy); c.lineTo(cx + sx - t * 0.6, gy - t); c.lineTo(cx + sx - t * 0.6, gy + t); c.fill();

    // a row of warning marks, lit when active
    var fs = S * 0.034, gap = S * 0.03;
    var row = function (items, y) {
      c.font = font("mono", fs);
      var total = items.reduce(function (s2, m2) { return s2 + c.measureText(m2[0]).width; }, 0) + gap * (items.length - 1);
      var x = cx - total / 2;
      items.forEach(function (m2) {
        var w2 = c.measureText(m2[0]).width;
        text(c, m2[0], x + w2 / 2, y, font("mono", fs), m2[1]);
        x += w2 + gap;
      });
    };
    row([["ABS", d.abs ? RED : "#333"], ["TCS", d.tcs ? RED : "#333"], ["P", d.handbrake ? RED : "#333"],
         ["LO", d.lowbeam ? WHITE : "#333"], ["FOG", d.fog ? WHITE : "#333"], ["HI", d.highbeam ? WHITE : "#333"]], cy + S * 0.29);
    // water and fuel as readouts, red when they need you
    var hot = d.water !== undefined && d.water > 115, low = d.fuel !== undefined && d.fuel < 0.15;
    row([["H2O " + (d.waterText || (d.water === undefined ? "--" : Math.round(d.water) + "°")), hot ? RED : GREY],
         ["FUEL " + (d.fuel === undefined ? "--" : Math.round(d.fuel * 100) + "%"), low ? RED : GREY]], cy + S * 0.37);
  });

  // ---- boost: vacuum below zero in grey, boost above in white, red near max ----
  // In whatever pressure unit the player chose in the game (bar, kPa, psi,
  // inHg): the stream is kPa, root.dotPressure converts. The scale is rounded
  // to steps that read well in that unit.
  var STEP = { "Bar": 0.5, "PSI": 5, "kPa": 50, "in.Hg": 10 };
  root.DotBoost = make(function (c, W, H, now, d) {
    var g = this.disc(c), S = g.S, cx = g.cx, cy = g.cy, R = g.R;
    var conv = root.dotPressure || function (k) { return { val: k / 100, unit: "Bar" }; };
    var have = d.boostKpa !== undefined;
    var unit = conv(100).unit, step = STEP[unit] || 1, dec = unit === "Bar" ? 1 : 0;
    var hiK = Math.max(150, (d.maxBoostKpa || 150) * 1.1);
    var lo = conv(-100).val, hi = Math.ceil(conv(hiK).val / step) * step;
    var b = have ? clamp(conv(d.boostKpa).val, lo, hi) : 0;
    var maxB = conv(d.maxBoostKpa || hiK).val;
    var pos = function (v) { return (v - lo) / (hi - lo); };
    var z = pos(0), cur = pos(b), redFrom = pos(maxB * 0.85);
    this.peak = Math.max((this.peak || 0) - step * 0.004, b);
    if (this.unit !== unit) { this.peak = b; this.unit = unit; }   // units changed in the menu
    if (lineGauges()) {
      var blinkB = Math.floor(now / 90) % 2;
      root.dotGaugeArcFrom(c, cx, cy, R * 0.84, Math.max(4, S * 0.05), A0, A1, z, have ? cur : z, redFrom,
                           have && b < 0, blinkB, have ? pos(this.peak) : null);
    } else {
      arcDots(c, cx, cy, R * 0.84, 34, Math.max(2, S * 0.022), function (i, f) {
        var on = b >= 0 ? (f >= z - 1e-6 && f <= cur + 1e-6) : (f <= z + 1e-6 && f >= cur - 1e-6);
        if (!have) return DIM;
        if (on) return b < 0 ? MUTE : (f >= redFrom ? RED : WHITE);
        return f >= redFrom ? DIMRED : DIM;
      });
      if (have && this.peak > step * 0.1) {     // peak hold, just inside the ring
        var a = A0 + (A1 - A0) * pos(this.peak);
        dot(c, cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7, Math.max(2, S * 0.02), RED);
      }
    }
    [lo, 0, hi].forEach(function (v) {
      var a2 = A0 + (A1 - A0) * pos(v);
      text(c, v.toFixed(Math.abs(v) < 10 && v % 1 ? 1 : 0), cx + Math.cos(a2) * R * 0.62, cy + Math.sin(a2) * R * 0.62,
           font("mono", S * 0.06), MUTE);
    });
    num(c, have ? b.toFixed(dec) : "--", cx, cy - S * 0.02, S * (dec ? 0.26 : 0.22),
        have && b >= maxB * 0.85 ? RED : WHITE);
    text(c, unit.toUpperCase(), cx, cy + S * 0.16, font("mono", S * 0.06), GREY);
    text(c, have ? "PK " + this.peak.toFixed(dec) : "NO TURBO", cx, cy + S * 0.36, font("mono", S * 0.05), MUTE);
  });

  // ---- G meter --------------------------------------------------------------
  root.DotGMeter = make(function (c, W, H, now, d) {
    var g = this.disc(c), S = g.S, cx = g.cx, cy = g.cy, R = g.R * 0.78, GMAX = 1.5;
    var step = Math.max(6, R / 7);
    for (var y = -R; y <= R + 0.1; y += step)
      for (var x = -R; x <= R + 0.1; x += step)
        if (x * x + y * y <= R * R)
          dot(c, cx + x, cy + y, Math.max(1.2, S * 0.007), (Math.abs(x) < 1 || Math.abs(y) < 1) ? "#3a3a3a" : "#1c1c1c");
    c.strokeStyle = "#2a2a2a"; c.lineWidth = 1;
    [0.5, 1].forEach(function (k) { c.beginPath(); c.arc(cx, cy, R * k / GMAX, 0, TAU); c.stroke(); });
    var xy = function (p) {
      return [cx + clamp(p[0] / GMAX, -1, 1) * R, cy - clamp(p[1] / GMAX, -1, 1) * R];
    };
    this.trail.forEach(function (p, i, arr) {
      var q = xy(p); c.globalAlpha = (i + 1) / arr.length * 0.6; dot(c, q[0], q[1], Math.max(1.5, S * 0.01), WHITE);
    });
    c.globalAlpha = 1;
    var p = xy([d.gx || 0, d.gy || 0]);
    dot(c, p[0], p[1], Math.max(3, S * 0.035), RED);
    text(c, Math.hypot(d.gx || 0, d.gy || 0).toFixed(2) + "G", cx, cy + g.R * 0.88, font("mono", S * 0.055), WHITE);
    text(c, "PK " + this.peak.toFixed(2), cx, cy - g.R * 0.88, font("mono", S * 0.05), MUTE);
  }, function (d) {
    this.trail.push([d.gx || 0, d.gy || 0]);
    if (this.trail.length > 28) this.trail.shift();
    this.peak = Math.max(this.peak * 0.999, Math.hypot(d.gx || 0, d.gy || 0));
  }, function () { this.trail = []; this.peak = 0; });

  // ---- pedals: clutch, brake, throttle, handbrake - thick bars with 0-100% ----
  // One solid bar each, barely rounded, wide enough to read from the corner of
  // your eye.
  var YELLOW = "#FFC700";                       // N-yellow, from the brand palette

  // Text with a dark outline, for drawing straight over the game.
  function outlined(c, s, x, y, f, col, lw) {
    c.font = f; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineJoin = "round"; c.lineWidth = lw; c.strokeStyle = "rgba(0,0,0,0.85)";
    c.strokeText(s, x, y);
    c.fillStyle = col; c.fillText(s, x, y);
  }

  // clear: no card, the % written inside each bar, outlines on the text so it
  // reads over sky and tarmac alike
  function pedals(clear) {
    return make(function (c, W, H, now, d) {
      if (!clear) this.card(c);
      var tcsBlink = d.tcs && Math.floor(now / 120) % 2;
      var cols = [
        ["CLU", d.clutch, GREY],
        ["BRK", d.brake, RED],
        ["THR", d.throttle, tcsBlink ? MUTE : WHITE],      // blinks while TCS cuts in
        ["HBK", d.parkingbrake, YELLOW]
      ];
      var pad = Math.min(W, H) * (clear ? 0.03 : 0.08), colW = (W - pad * 2) / cols.length;
      var top = clear ? H * 0.04 : H * 0.2, bottom = H * 0.84;
      var bw = colW * (clear ? 0.78 : 0.7);
      var fs = Math.min(colW * 0.3, H * 0.085);
      cols.forEach(function (col, j) {
        var x = pad + colW * (j + 0.5), v = clamp(col[1] || 0, 0, 1);
        var colour = (j === 1 && d.abs && Math.floor(now / 80) % 2) ? "#ff5a5f" : col[2];
        // one continuous bar: a dark track, filled from the bottom
        var rad = Math.min(3, bw * 0.06), hFull = bottom - top;
        rr(c, x - bw / 2, top, bw, hFull, rad);
        c.fillStyle = clear ? "rgba(20,20,20,0.55)" : DIM; c.fill();
        if (v > 0.002) {
          var hv = Math.max(rad * 2, hFull * v);
          rr(c, x - bw / 2, bottom - hv, bw, hv, rad);
          c.fillStyle = colour; c.fill();
        }
        var pct = String(Math.round(v * 100));
        if (clear) {
          // inside the bar, at its top like the stock pedals; outlined so it
          // reads on any fill
          var pf = Math.min(bw * 0.42, fs * 1.6);
          root.dotNumOutlined(c, pct, x, top + pf * 0.75, pf, WHITE, "center", font, Math.max(3, fs * 0.35));
          outlined(c, col[0], x, H * 0.93, font("mono", fs * 0.85), v > 0.005 ? col[2] : GREY, Math.max(2.5, fs * 0.3));
        } else {
          num(c, pct, x, H * 0.1, fs * 1.3, v > 0.005 ? WHITE : MUTE);
          text(c, col[0], x, H * 0.93, font("mono", fs * 0.8), v > 0.005 ? col[2] : MUTE);
        }
      });
    });
  }
  root.DotPedals = pedals(false);
  root.DotPedalsClear = pedals(true);

  // ---- gears: the whole box on one row, the one you're in lit --------------
  // Manual: R, N, 1..n from engineInfo (how many the gearbox really has).
  // Automatic: P R N D 2 1. Near the limiter the next gear lights red - shift.
  root.DotGears = make(function (c, W, H, now, d) {
    this.card(c);
    var items, cur;
    if (d.gearbox === "manual" && d.gearsF > 0) {
      items = ["R", "N"];
      for (var i = 1; i <= d.gearsF; i++) items.push(String(i));
      cur = d.gearIndex < 0 ? "R" : d.gearIndex === 0 ? "N" : String(d.gearIndex);
    } else {
      // automatic / DCT: the selector positions. In sport or manual mode the
      // S or M slot lights and carries the gear ("S3", "M4").
      items = ["P", "R", "N", "D", "S", "M"];
      cur = String(d.gear || "N");
      var mode = /^([SM])(\d+)$/.exec(cur);
      if (mode) { items[items.indexOf(mode[1])] = cur; }
      else if (items.indexOf(cur) < 0) items.push(cur);       // "1", "2" low ranges
    }
    var at = items.indexOf(cur);
    var maxRpm = d.maxRpm > 0 ? d.maxRpm : 7000;
    var hint = d.gearbox === "manual" && (d.rpm || 0) >= maxRpm * 0.9 && at >= 1 && at < items.length - 1;
    var shift = (d.rpm || 0) >= maxRpm * 0.95, blink = Math.floor(now / 90) % 2;
    var pad = Math.min(W, H) * 0.14, cw = (W - pad * 2) / items.length;
    var ph = Math.min(H - pad * 2, cw * 1.25), pw = Math.min(cw * 0.86, ph);
    var cy = H / 2, fs = ph * 0.62;
    items.forEach(function (g, k) {
      var x = pad + cw * (k + 0.5);
      if (k === at) {
        rr(c, x - pw / 2, cy - ph / 2, pw, ph, Math.min(pw, ph) * 0.3);
        c.fillStyle = shift && blink ? RED : WHITE; c.fill();
        gearText(c, g, x, cy + fs * 0.04, fs * (g.length > 1 ? 0.8 : 1), shift && blink ? WHITE : "#000");
      } else {
        var next = hint && k === at + 1;
        if (next) {
          rr(c, x - pw / 2, cy - ph / 2, pw, ph, Math.min(pw, ph) * 0.3);
          c.strokeStyle = RED; c.lineWidth = 2; c.stroke();
        }
        text(c, g, x, cy + fs * 0.04, font("head", fs * 0.78), next ? RED : g === "R" ? "#5a5a5a" : MUTE);
      }
    });
  });

  // ---- gear: just a box with the gear in it - R, N, 1, 2, 3... -----------
  // Flashes red at the shift point; nothing else on it.
  root.DotGear = make(function (c, W, H, now, d) {
    this.card(c);
    var maxRpm = d.maxRpm > 0 ? d.maxRpm : 7000;
    var shift = (d.rpm || 0) >= maxRpm * 0.95 && Math.floor(now / 90) % 2;
    var S = Math.min(W, H);
    gearText(c, d.gear, W / 2, H / 2 + S * 0.04, S * 0.72, shift ? RED : WHITE);
  });

  // ---- rpm bar: the glyph row on its own, with the rpm in dot digits ------
  root.DotRpm = make(function (c, W, H, now, d) {
    this.card(c);
    var maxRpm = d.maxRpm > 0 ? d.maxRpm : 7000;
    var frac = clamp((d.rpm || 0) / maxRpm, 0, 1);
    var shift = frac >= 0.95, blink = shift && Math.floor(now / 70) % 2;
    var pad = Math.min(W, H) * 0.22;
    var numW = Math.min(W * 0.24, H * 1.9);
    num(c, String(Math.round(d.rpm || 0)), pad + numW, H / 2, H * 0.42, shift ? RED : WHITE, "right");
    var x0 = pad + numW + pad * 0.8, x1 = W - pad, n = 32;
    if (lineGauges()) {
      root.dotGaugeBar(c, x0, x1, H / 2, Math.max(5, H * 0.24), frac, 0.82, shift, blink);
      return;
    }
    var gap = Math.max(2, (x1 - x0) * 0.006), dw = (x1 - x0 - gap * (n - 1)) / n;
    var bh = Math.max(6, H * 0.34), y = H / 2 - bh / 2;
    var lit = Math.round(frac * n), redFrom = Math.floor(n * 0.82);
    for (var i = 0; i < n; i++) {
      var col = DIM;
      if (i < lit) col = shift ? (blink ? RED : "#5a0b0e") : (i >= redFrom ? RED : WHITE);
      else if (i >= redFrom) col = DIMRED;
      rr(c, x0 + i * (dw + gap), y, dw, bh, Math.min(dw, bh) / 2);
      c.fillStyle = col; c.fill();
    }
  });

  // ---- gear ring: the gear in a circle with the revs around it --------------
  // The middle of the main DotDash card, on its own.
  root.DotGearRing = make(function (c, W, H, now, d) {
    var g = this.disc(c), S = g.S, cx = g.cx, cy = g.cy, R = g.R;
    var maxRpm = d.maxRpm > 0 ? d.maxRpm : 7000;
    var frac = clamp((d.rpm || 0) / maxRpm, 0, 1);
    var shift = frac >= 0.95, blink = shift && Math.floor(now / 70) % 2;
    var rr2 = R * 0.82, lw = Math.max(4, S * 0.07);
    root.dotGaugeArc(c, cx, cy, rr2, lw, -Math.PI / 2, Math.PI * 1.5, frac, 0.82, shift, blink);
    if (blink) { c.beginPath(); c.arc(cx, cy, rr2 - lw * 1.2, 0, TAU); c.fillStyle = RED; c.fill(); }
    gearText(c, d.gear, cx, cy + S * 0.03, S * 0.5, WHITE);
  });

  // ---- info: water, oil, fuel --------------------------------------------------
  root.DotInfo = make(function (c, W, H, now, d) {
    this.card(c);
    var rows = [
      ["H2O", d.water, d.waterText || (d.water === undefined ? "--" : Math.round(d.water) + "°"), d.water === undefined ? 0 : (d.water - 50) / 80, d.water > 115],
      ["OIL", d.oil, d.oilText || (d.oil === undefined ? "--" : Math.round(d.oil) + "°"), d.oil === undefined ? 0 : (d.oil - 50) / 100, d.oil > 130],
      ["FUEL", d.fuel, d.fuel === undefined ? "--" : Math.round(d.fuel * 100) + "%", d.fuel || 0, d.fuel !== undefined && d.fuel < 0.15]
    ];
    var pad = Math.min(W, H) * 0.12, rh = (H - pad * 2) / rows.length, fs = Math.min(rh * 0.42, W * 0.08);
    rows.forEach(function (r, i) {
      var y = pad + rh * (i + 0.5);
      text(c, r[0], pad, y, font("mono", fs), MUTE, "left");
      num(c, r[2], W - pad, y, fs * 1.25, r[4] ? RED : WHITE, "right");
      var n = 10, x0 = pad + fs * 3.2, x1 = W - pad - fs * 3.4, s = (x1 - x0) / n;
      var lit = Math.round(clamp(r[3], 0, 1) * n);
      for (var k = 0; k < n; k++) dot(c, x0 + s * (k + 0.5), y, Math.min(s * 0.32, fs * 0.28), k < lit ? (r[4] ? RED : WHITE) : DIM);
    });
  });

  // ---- 0-100 / 0-200 timer ------------------------------------------------------
  root.DotTimer = make(function (c, W, H, now, d) {
    this.card(c);
    var t = this.t, pad = Math.min(W, H) * 0.12;
    var big = t.state === "run" ? (now - t.t0) / 1000 : t.last100;
    var mph = this.mph;
    text(c, mph ? "0-60 MPH" : "0-100 KM/H", pad, pad * 1.1, font("mono", H * 0.11), MUTE, "left", "top");
    text(c, t.state === "run" ? "LIVE" : t.state === "armed" ? "READY" : "", W - pad, pad * 1.1,
         font("mono", H * 0.11), t.state === "run" ? RED : MUTE, "right", "top");
    var best100 = t.state !== "run" && t.last100 !== null && t.last100 === t.best100;
    num(c, big === null || big === undefined ? "--.--" : big.toFixed(2), W / 2, H * 0.52,
        H * 0.34, best100 ? RED : WHITE);
    var line = "BEST " + (t.best100 === null ? "--.--" : t.best100.toFixed(2)) +
               (mph ? "   0-120 " : "   0-200 ") + (t.last200 === null ? "--.--" : t.last200.toFixed(2));
    text(c, line, W / 2, H - pad * 1.1, font("mono", H * 0.095), GREY, "center", "bottom");
  }, function (d, now) {
    // 0-100 / 0-200 km/h, or 0-60 / 0-120 mph when the game is set to mph
    var mph = /mph/i.test(d.speedUnit || "");
    if (mph !== this.mph) { this.mph = mph; this.t = { state: "idle", t0: 0, last100: null, best100: null, last200: null }; }
    var t = this.t, v = (d.speed || 0) * (mph ? 2.23694 : 3.6);
    var a = mph ? 60 : 100, b = mph ? 120 : 200;
    if (v < 0.5) { t.state = "armed"; return; }
    if (t.state === "armed") { t.state = "run"; t.t0 = now; }
    if (t.state === "run" || t.state === "200") {
      var s = (now - t.t0) / 1000;
      if (t.state === "run" && v >= a) {
        t.last100 = s; if (t.best100 === null || s < t.best100) t.best100 = s; t.state = "200";
      }
      if (t.state === "200" && v >= b) { t.last200 = s; t.state = "done"; }
    }
  }, function () { this.t = { state: "idle", t0: 0, last100: null, best100: null, last200: null }; });

  // ---- start / stop button, with the drivetrain controls round it ----------
  // The game sends the drivetrain buttons itself (diff locks, range box, 4WD,
  // hubs, ESC, drive modes, N2O, JATO) through ChangePowerTrainButtons; apps.js
  // keeps them in this.buttons. Each gets a drawn icon in the dash's own style
  // instead of BeamNG's icon font; the full name shows on hover.
  // icon kind + state for each of the game's icons. Text only where text is
  // the clearest sign (N2O, ESC, L / H); everything else is drawn.
  var ICONS = {
    powertrain_differential_open:   ["diffOpen", "off"],
    powertrain_differential_lsd:    ["diffLsd", "mid"],
    powertrain_differential_closed: ["diffLock", "on"],
    powertrain_rangebox_high:       ["text:H", "off"],
    powertrain_rangebox_low:        ["text:L", "on"],
    powertrain_shaft_connected:     ["shaftOn", "on"],
    powertrain_shaft_disconnected:  ["shaftOff", "off"],
    powertrain_wheel_connected:     ["hubOn", "on"],
    powertrain_wheel_disconnected:  ["hubOff", "off"],
    powertrain_esc:                 ["text:ESC", "color"],
    powertrain_n2o:                 ["text:N2O", "ring"],
    powertrain_jato:                ["jato", "ring"]
  };
  function label(b) {
    return ICONS[b.icon] || ["mode", b.color ? "color" : "off"];
  }
  function hex(c2) { return c2 ? "#" + String(c2).replace(/^#/, "") : null; }

  // The drawn icons, in a box of half-size r round (x, y), in colour col.
  function icon(c, kind, x, y, r, col) {
    var lw = Math.max(1.5, r * 0.16);
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = "round";
    var line = function (x0, y0, x1, y1) { c.beginPath(); c.moveTo(x + x0 * r, y + y0 * r); c.lineTo(x + x1 * r, y + y1 * r); c.stroke(); };
    var ring = function (rad) { c.beginPath(); c.arc(x, y, rad * r, 0, TAU); c.stroke(); };
    var disc = function (dx, dy, rad) { c.beginPath(); c.arc(x + dx * r, y + dy * r, rad * r, 0, TAU); c.fill(); };
    if (kind.indexOf("diff") === 0) {
      // the differential: a ring gear with the two half shafts
      ring(0.42);
      if (kind === "diffOpen") { line(-0.95, 0, -0.55, 0); line(0.55, 0, 0.95, 0); }
      else if (kind === "diffLsd") { line(-0.95, 0, -0.55, 0); line(0.55, 0, 0.95, 0); disc(0, 0, 0.14); }
      else { line(-0.95, 0, 0.95, 0); disc(0, 0, 0.24); }       // locked: one shaft straight through
    } else if (kind === "shaftOn" || kind === "shaftOff") {
      // a drive shaft between two axles: joined, or with a gap
      line(-0.85, -0.55, -0.85, 0.55); line(0.85, -0.55, 0.85, 0.55);
      if (kind === "shaftOn") line(-0.85, 0, 0.85, 0);
      else { line(-0.85, 0, -0.25, 0); line(0.25, 0, 0.85, 0); }
    } else if (kind === "hubOn" || kind === "hubOff") {
      // a wheel and its hub: locked to the axle, or free
      ring(0.5); disc(0, 0, 0.14);
      if (kind === "hubOn") line(-0.98, 0, -0.5, 0);
      else line(-0.98, 0, -0.7, 0);
    } else if (kind === "jato") {
      // a rocket going right, with its flame
      c.beginPath(); c.moveTo(x + 0.75 * r, y); c.lineTo(x - 0.2 * r, y - 0.38 * r); c.lineTo(x - 0.2 * r, y + 0.38 * r); c.closePath(); c.fill();
      disc(-0.48, 0, 0.13); disc(-0.78, 0, 0.09);
    } else {
      // any other control (drive modes...): a dial of dots with a pointer
      for (var i = 0; i < 6; i++) { var a2 = i / 6 * TAU; disc(Math.cos(a2) * 0.55, Math.sin(a2) * 0.55, 0.09); }
      line(0, 0, 0.32, -0.32);
    }
    c.lineCap = "butt";
  }

  // Text that shrinks until it fits the width it is given.
  function fitText(c, s, x, y, kind, size, maxW, col) {
    c.font = font(kind, size);
    var tw = c.measureText(s).width;
    if (tw > maxW) size = size * maxW / tw;
    text(c, s, x, y, font(kind, size), col);
  }

  // where things are - shared with the click handler in apps.js.
  // The start button keeps one size whatever the car has; the drivetrain
  // buttons go outside it on a half circle to its right, top to bottom, and
  // the app is simply wider to make room.
  root.dotStartLayout = function (W, H, n) {
    var R0 = Math.min(H * 0.44, W * 0.5 - 2);
    var cx = R0 + 2, cy = H / 2;
    var spots = [];
    if (n) {
      var orbit = R0 * 1.34;
      var br0 = R0 * 0.21;
      var half = Math.asin(Math.min(0.95, (H / 2 - br0 - 2) / orbit));     // as tall as the box allows
      var span = Math.min(half * 2, Math.PI * 0.9);
      var step = n > 1 ? span / (n - 1) : 0;
      var br = n > 1 ? Math.min(br0, orbit * Math.sin(step / 2) * 0.9) : br0;
      for (var i = 0; i < n; i++) {
        var ang = n > 1 ? -span / 2 + i * step : 0;
        spots.push({ x: cx + Math.cos(ang) * orbit, y: cy + Math.sin(ang) * orbit, r: br });
      }
    }
    return { S: R0 * 2, cx: cx, cy: cy, R: R0, inner: R0, spots: spots };
  };

  root.DotStartStop = make(function (c, W, H, now, d) {
    var btns = this.buttons || [];
    var L = root.dotStartLayout(W, H, btns.length);
    var cx = L.cx, cy = L.cy, ri = L.inner;
    var on = (d.ignition || 0) > 0, run = !!d.running, press = !!this.pressed;
    var hover = this.hover;

    // the start button: its own disc, always the same size
    c.beginPath(); c.arc(cx, cy, ri, 0, TAU);
    c.fillStyle = CARD; c.fill();
    c.beginPath(); c.arc(cx, cy, ri * 0.82, 0, TAU);
    c.strokeStyle = press ? RED : run ? WHITE : on ? GREY : "#333"; c.lineWidth = Math.max(2, ri * 0.07); c.stroke();
    for (var i = 0; i < 12; i++) {
      var a = -Math.PI / 2 + i / 12 * TAU;
      var lit = run || (press && i === Math.floor(now / 60) % 12);
      dot(c, cx + Math.cos(a) * ri * 0.93, cy + Math.sin(a) * ri * 0.93, Math.max(1.4, ri * 0.032), lit ? (press ? RED : WHITE) : DIM);
    }
    // the hovered control's name takes the place of "ENGINE", shrunk to fit
    var tip = hover !== null && hover !== undefined && btns[hover]
      ? String(btns[hover].tooltip || "").toUpperCase() : "";
    fitText(c, tip || "ENGINE", cx, cy - ri * 0.36, "mono", ri * 0.14, ri * 1.2, tip ? RED : MUTE);
    text(c, "START", cx, cy - ri * 0.02, font("head", ri * 0.27), on || run ? WHITE : GREY);
    text(c, "STOP", cx, cy + ri * 0.27, font("head", ri * 0.27), on || run ? WHITE : GREY);
    dot(c, cx, cy + ri * 0.56, Math.max(2, ri * 0.05), run ? RED : on ? "#5a0b0e" : DIM);

    // the drivetrain buttons, each on its own small disc
    btns.forEach(function (b, k) {
      var p = L.spots[k], m = label(b), kind = m[0], state = m[1], col = hex(b.color);
      var hot = hover === k;
      // every button is dark; engaged ones (diff locked, low range, 4WD, hub
      // locked) get a red ring, half-way ones (LSD) a grey one
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU);
      c.fillStyle = hot ? "rgba(38,38,38,0.92)" : CARD; c.fill();
      var ringCol = state === "on" ? RED : state === "mid" ? GREY : state === "color" && col ? col : "#2e2e2e";
      c.strokeStyle = hot ? WHITE : ringCol; c.lineWidth = Math.max(1.5, p.r * 0.12); c.stroke();
      if (state === "ring" && isFinite(b.ringValue)) {      // tank level for N2O / JATO
        c.beginPath(); c.arc(p.x, p.y, p.r * 0.8, -Math.PI / 2, -Math.PI / 2 + clamp(b.ringValue, 0, 1) * TAU);
        c.strokeStyle = col || WHITE; c.lineWidth = Math.max(1.5, p.r * 0.14); c.stroke();
      }
      var fg = state === "off" ? GREY : WHITE;
      if (kind.indexOf("text:") === 0) {
        var s = kind.slice(5);
        fitText(c, s, p.x, p.y + p.r * 0.04, "mono", p.r * (s.length > 1 ? 0.78 : 1.1), p.r * 1.6, fg);
      } else {
        icon(c, kind, p.x, p.y, p.r * 0.78, fg);
      }
    });
  }, null, function () { this.buttons = []; this.hover = null; });
})(typeof window !== "undefined" ? window : this);

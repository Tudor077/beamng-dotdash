// Figures in several looks, after phone lock-screen clock faces:
//
//   dot    NDot 55, the dot-matrix font (the original look)
//   grid   digits built from small square tiles, like the tiled clock face
//   block  the same shapes solid and wide, like the big clock face
//   wide   the lock-screen clock face ("520"): very wide, thick bars, thin
//          slits between them, outer corners rounded. Not a 3x5 grid of
//          equal cells - the rows are bar / slit / bar / slit / bar
//   ntype      NType82 Mono - every figure the same width, so live numbers
//              don't shuffle sideways as they change (the default)
//   ntypehead  NType82 Headline, the display face
//   led    the same shapes in big round dots, like the dotted clock face -
//          the NDot feel, but with dots large enough to read at a glance
//
// grid and block are drawn, not typeset: each digit is a 3x5 bitmap of
// strokes, so no font file is needed and they read at any size.
//
// root.DOT_STYLE.digits picks the look for every widget; dotNum() draws.

(function (root) {
  "use strict";

  root.DOT_STYLE = root.DOT_STYLE || { digits: "ntype", gauge: "line" };
  // typeset faces: which font, and how big next to NDot for the same height
  var TYPESET = { dot: ["dot", 1], ntype: ["mono", 1.02], ntypehead: ["head", 1.0] };

  var G = {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["110", "010", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "001", "001", "001"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
    "-": ["000", "000", "111", "000", "000"],
    ".": ["0", "0", "0", "0", "1"],
    " ": ["0", "0", "0", "0", "0"]
  };

  // the wide face: its own patterns (0 has a slit, not a hole), row heights
  // and column widths, as shares of the digit height
  var WIDE = {
    "0": ["111", "111", "101", "111", "111"],
    "1": ["110", "010", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "001", "001", "001"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
    "-": ["000", "000", "111", "000", "000"],
    ".": ["0", "0", "0", "0", "1"],
    " ": ["0", "0", "0", "0", "0"]
  };
  var WROWS = [0.3, 0.12, 0.16, 0.12, 0.3];
  var WCOLS = [0.27, 0.62, 0.27];             // a glyph is ~1.16 x its height
  function wideCols(g) { return g[0].length === 1 ? [0.27] : WCOLS; }
  function wideW(g, h) { return wideCols(g).reduce(function (a, b) { return a + b; }, 0) * h; }

  function drawWide(c, s, x0, y, h, col) {
    var gap = h * 0.16, y0 = y - h / 2, rad = h * 0.13;
    c.fillStyle = col;
    for (var i = 0; i < s.length; i++) {
      var g = WIDE[s[i]] || WIDE[" "], cols = wideCols(g);
      var cy = y0;
      for (var r = 0; r < 5; r++) {
        var rh = WROWS[r] * h, cx = x0;
        for (var k = 0; k < cols.length; k++) {
          var cw = cols[k] * h;
          if (g[r][k] === "1") {
            var onp = function (rr2, kk) { return rr2 >= 0 && rr2 < 5 && kk >= 0 && kk < cols.length && g[rr2][kk] === "1"; };
            var tl = !onp(r - 1, k) && !onp(r, k - 1), tr = !onp(r - 1, k) && !onp(r, k + 1);
            var bl = !onp(r + 1, k) && !onp(r, k - 1), br = !onp(r + 1, k) && !onp(r, k + 1);
            var rr = Math.min(rad, rh, cw);
            c.beginPath();
            if (c.roundRect) c.roundRect(cx - 0.3, cy - 0.3, cw + 0.6, rh + 0.6, [tl ? rr : 0, tr ? rr : 0, br ? rr : 0, bl ? rr : 0]);
            else c.rect(cx - 0.3, cy - 0.3, cw + 0.6, rh + 0.6);
            c.fill();
          }
          cx += cw;
        }
        cy += rh;
      }
      x0 += wideW(g, h) + (i < s.length - 1 ? gap : 0);
    }
  }
  function measureWide(s, h) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += wideW(WIDE[s[i]] || WIDE[" "], h) + (i < s.length - 1 ? h * 0.16 : 0);
    return w;
  }

  // width of one glyph cell, as a share of the digit height
  function cellW(style) { return style === "block" ? 0.3 : 0.26; }
  function on(g, r, k) { return r >= 0 && r < 5 && k >= 0 && k < g[0].length && g[r][k] === "1"; }

  function measure(s, h, style) {
    if (style === "wide") return measureWide(s, h);
    var cw = h / 5 * (cellW(style) * 5), gap = cw * 0.55, w = 0;
    for (var i = 0; i < s.length; i++) {
      var g = G[s[i]] || G[" "];
      w += g[0].length * cw + (i < s.length - 1 ? gap : 0);
    }
    return w;
  }

  function draw(c, s, x, y, h, style, col, align) {
    if (style === "wide") {
      var ww = measureWide(s, h);
      drawWide(c, s, align === "right" ? x - ww : align === "left" ? x : x - ww / 2, y, h, col);
      return;
    }
    var cw = h / 5 * (cellW(style) * 5), ch = h / 5, gap = cw * 0.55;
    var w = measure(s, h, style);
    var x0 = align === "right" ? x - w : align === "left" ? x : x - w / 2;
    var y0 = y - h / 2;
    c.fillStyle = col;
    for (var i = 0; i < s.length; i++) {
      var g = G[s[i]] || G[" "];
      for (var r = 0; r < 5; r++)
        for (var k = 0; k < g[r].length; k++) {
          if (g[r][k] !== "1") continue;
          var cx = x0 + k * cw, cy = y0 + r * ch;
          if (style === "block") {
            // solid: cells overlap a hair so the stroke has no seams; the
            // outer corners of each stroke are rounded, like the clock face
            var rad = Math.min(cw, ch) * 0.32;
            var tl = !on(g, r - 1, k) && !on(g, r, k - 1), tr = !on(g, r - 1, k) && !on(g, r, k + 1);
            var bl = !on(g, r + 1, k) && !on(g, r, k - 1), br = !on(g, r + 1, k) && !on(g, r, k + 1);
            c.beginPath();
            if (c.roundRect) c.roundRect(cx - 0.25, cy - 0.25, cw + 0.5, ch + 0.5, [tl ? rad : 0, tr ? rad : 0, br ? rad : 0, bl ? rad : 0]);
            else c.rect(cx - 0.25, cy - 0.25, cw + 0.5, ch + 0.5);
            c.fill();
          } else if (style === "led") {
            // round dots, 2x2 per stroke cell
            var dr = Math.min(cw, ch) / 4 * 0.86;
            for (var a2 = 0; a2 < 2; a2++)
              for (var b2 = 0; b2 < 2; b2++) {
                c.beginPath(); c.arc(cx + (a2 + 0.5) * cw / 2, cy + (b2 + 0.5) * ch / 2, dr, 0, 6.2832); c.fill();
              }
          } else {
            // tiled: each stroke cell is 2x2 tiles with thin gaps
            var t = Math.max(0.6, Math.min(cw, ch) * 0.07);
            for (var a = 0; a < 2; a++)
              for (var b = 0; b < 2; b++)
                c.fillRect(cx + a * cw / 2 + t / 2, cy + b * ch / 2 + t / 2, cw / 2 - t, ch / 2 - t);
          }
        }
      x0 += g[0].length * cw + gap;
    }
  }

  // size is the font size the caller would have given NDot; digits come out
  // the same height either way, so layouts don't move when the style changes.
  // A trailing unit ("92°", "42%") is set in the mono font after the figures.
  function split(s) {
    var m = /^([0-9.\- ]+)(\D*)$/.exec(s);
    return m ? [m[1], m[2]] : null;
  }
  root.dotNumWidth = function (c, s, size, fontFn) {
    var style = root.DOT_STYLE.digits, p = split(String(s)), ts = TYPESET[style];
    if (ts || !p) { ts = ts || TYPESET.dot; c.font = fontFn(ts[0], size * ts[1]); return c.measureText(String(s)).width; }
    c.font = fontFn("mono", size * 0.5);
    return measure(p[0], size * 0.72, style) + (p[1] ? size * 0.08 + c.measureText(p[1]).width : 0);
  };
  root.dotNum = function (c, s, x, y, size, col, align, fontFn) {
    var style = root.DOT_STYLE.digits;
    s = String(s);
    var p = split(s), ts = TYPESET[style];
    align = align || "center";
    if (ts || !p) {
      ts = ts || TYPESET.dot;
      c.font = fontFn(ts[0], size * ts[1]); c.fillStyle = col;
      c.textAlign = align; c.textBaseline = "middle";
      c.fillText(s, x, y);
      return;
    }
    var h = size * 0.72, w = root.dotNumWidth(c, s, size, fontFn);
    var x0 = align === "right" ? x - w : align === "left" ? x : x - w / 2;
    draw(c, p[0], x0, y, h, style, col, "left");
    if (p[1]) {
      c.font = fontFn("mono", size * 0.5); c.fillStyle = col;
      c.textAlign = "left"; c.textBaseline = "top";
      c.fillText(p[1], x0 + measure(p[0], h, style) + size * 0.08, y - h / 2);
    }
  };
  // the same with a dark outline, for drawing straight over the game
  root.dotNumOutlined = function (c, s, x, y, size, col, align, fontFn, lw) {
    var ts = TYPESET[root.DOT_STYLE.digits];
    if (ts || !split(String(s))) {
      ts = ts || TYPESET.dot;
      c.font = fontFn(ts[0], size * ts[1]); c.textAlign = align || "center"; c.textBaseline = "middle";
      c.lineJoin = "round"; c.lineWidth = lw; c.strokeStyle = "rgba(0,0,0,0.85)";
      c.strokeText(String(s), x, y); c.fillStyle = col; c.fillText(String(s), x, y);
      return;
    }
    var o = lw * 0.45;
    [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]].forEach(function (d) {
      root.dotNum(c, s, x + d[0], y + d[1], size, "rgba(0,0,0,0.85)", align, fontFn);
    });
    root.dotNum(c, s, x, y, size, col, align, fontFn);
  };

  // ---- rev gauges as one thick continuous line ------------------------------
  // The fill fades in from the start, so the eye goes to where the revs are;
  // a short needle across the line marks the exact point. The redline is a
  // dim red stretch of the track, and turns bright as the revs reach it.
  var RED = "#D71920", TRACK = "#1b1b1b", TRACKRED = "#3a1013";

  // The fade is mixed into the track colour, not drawn with transparency: the
  // arc is many short pieces that overlap a hair, and with alpha every
  // overlap came out darker - a row of little squares along the gauge.
  // Opaque pieces overlap invisibly.
  function mix(c0, c1, t) {
    return "rgb(" + Math.round(c0[0] + (c1[0] - c0[0]) * t) + "," + Math.round(c0[1] + (c1[1] - c0[1]) * t) +
           "," + Math.round(c0[2] + (c1[2] - c0[2]) * t) + ")";
  }
  var T_RGB = [27, 27, 27], W_RGB = [255, 255, 255], R_RGB = [215, 25, 32], G_RGB = [177, 179, 179];
  function fadeCol(f, frac, red, shift, blink) {
    if (shift) return blink ? RED : "#7a0f13";
    var a = 0.16 + 0.84 * Math.pow(frac > 0 ? f / frac : 1, 1.6);   // faint at the start, full at the needle
    return mix(T_RGB, red ? R_RGB : W_RGB, a);
  }

  // Stroke the arc between fractions lo..hi of the sweep a0..a1, coloured by
  // colorAt(f). With createConicGradient it is one stroke and perfectly
  // smooth. Without it, pieces about 2 px long - short arcs at low revs used
  // to get a dozen pieces anyway, and the fade showed as steps.
  function fadeArc(c, cx, cy, rad, lw, a0, a1, lo, hi, colorAt) {
    if (hi - lo < 0.0005) return;
    var sweep = a1 - a0;
    c.lineWidth = lw; c.lineCap = "butt";
    if (c.createConicGradient) {
      var g = c.createConicGradient(a0, cx, cy), n = 24;
      for (var i = 0; i <= n; i++) {
        var f = lo + (hi - lo) * i / n;
        g.addColorStop(Math.min(1, Math.max(0, (f * sweep) / TAU2)), colorAt(f));
      }
      c.beginPath(); c.arc(cx, cy, rad, a0 + sweep * lo, a0 + sweep * hi);
      c.strokeStyle = g; c.stroke();
      return;
    }
    var len = rad * sweep * (hi - lo), m = Math.max(4, Math.ceil(len / 2)), step = (hi - lo) / m;
    for (var k = 0; k < m; k++) {
      // overlap each piece by a fixed pixel: a share of a 2 px piece is less
      // than the anti-aliased edge, and the seams showed as dips
      var f0 = lo + k * step, over = 1.2 / (rad * sweep);
      var f1 = Math.min(hi, f0 + step + over);
      c.beginPath(); c.arc(cx, cy, rad, a0 + sweep * f0, a0 + sweep * f1);
      c.strokeStyle = colorAt(f0 + step / 2); c.stroke();
    }
  }
  var TAU2 = Math.PI * 2;

  root.dotGaugeArc = function (c, cx, cy, rad, lw, a0, a1, frac, redFrom, shift, blink) {
    c.lineCap = "butt"; c.lineWidth = lw;
    c.beginPath(); c.arc(cx, cy, rad, a0, a0 + (a1 - a0) * redFrom); c.strokeStyle = TRACK; c.stroke();
    if (redFrom < 1) { c.beginPath(); c.arc(cx, cy, rad, a0 + (a1 - a0) * redFrom, a1); c.strokeStyle = TRACKRED; c.stroke(); }
    if (frac > 0.002) {
      // white up to the redline, red after it - two strokes, so the change is sharp
      fadeArc(c, cx, cy, rad, lw, a0, a1, 0, Math.min(frac, redFrom),
              function (f) { return fadeCol(f, frac, false, shift, blink); });
      if (frac > redFrom)
        fadeArc(c, cx, cy, rad, lw, a0, a1, redFrom, frac,
                function (f) { return fadeCol(f, frac, true, shift, blink); });
    }
    // the needle: a short bar across the line, only where the revs are
    var a = a0 + (a1 - a0) * frac, ca = Math.cos(a), sa = Math.sin(a);
    var r0 = rad - lw * 1.05, r1 = rad + lw * 1.05;
    c.lineCap = "round";
    c.beginPath(); c.moveTo(cx + ca * r0, cy + sa * r0); c.lineTo(cx + ca * r1, cy + sa * r1);
    c.strokeStyle = "rgba(0,0,0,0.9)"; c.lineWidth = Math.max(4, lw * 0.5); c.stroke();
    c.beginPath(); c.moveTo(cx + ca * r0, cy + sa * r0); c.lineTo(cx + ca * r1, cy + sa * r1);
    c.strokeStyle = shift || frac >= redFrom ? RED : "#ffffff"; c.lineWidth = Math.max(2, lw * 0.26); c.stroke();
    c.lineCap = "butt";
  };

  // like dotGaugeArc, but filled between `from` and `to` (both 0..1 of the
  // sweep) - for the boost gauge, where the fill runs from 0 bar either way
  root.dotGaugeArcFrom = function (c, cx, cy, rad, lw, a0, a1, from, to, redFrom, vacuum, blink, peak) {
    c.lineCap = "butt"; c.lineWidth = lw;
    c.beginPath(); c.arc(cx, cy, rad, a0, a0 + (a1 - a0) * redFrom); c.strokeStyle = TRACK; c.stroke();
    if (redFrom < 1) { c.beginPath(); c.arc(cx, cy, rad, a0 + (a1 - a0) * redFrom, a1); c.strokeStyle = TRACKRED; c.stroke(); }
    var lo = Math.min(from, to), hi = Math.max(from, to), span = hi - lo;
    if (span > 0.002) {
      // fade from the zero point out to the needle
      var fadeAt = function (f) {
        var t = vacuum ? (hi - f) / span : (f - lo) / span;
        return 0.16 + 0.84 * Math.pow(Math.max(0, Math.min(1, t)), 1.6);
      };
      if (vacuum) fadeArc(c, cx, cy, rad, lw, a0, a1, lo, hi, function (f) { return mix(T_RGB, G_RGB, fadeAt(f) * 0.8); });
      else {
        fadeArc(c, cx, cy, rad, lw, a0, a1, lo, Math.min(hi, redFrom), function (f) { return mix(T_RGB, W_RGB, fadeAt(f)); });
        if (hi > redFrom) fadeArc(c, cx, cy, rad, lw, a0, a1, Math.max(lo, redFrom), hi, function (f) { return mix(T_RGB, R_RGB, fadeAt(f)); });
      }
    }
    // zero mark: a thin tick across the track
    var az = a0 + (a1 - a0) * from;
    c.beginPath(); c.moveTo(cx + Math.cos(az) * (rad - lw * 0.7), cy + Math.sin(az) * (rad - lw * 0.7));
    c.lineTo(cx + Math.cos(az) * (rad + lw * 0.7), cy + Math.sin(az) * (rad + lw * 0.7));
    c.strokeStyle = "#555"; c.lineWidth = Math.max(1, lw * 0.12); c.stroke();
    // peak hold: a small red tick
    if (peak !== null && peak !== undefined && peak > from + 0.01) {
      var ap = a0 + (a1 - a0) * peak;
      c.beginPath(); c.moveTo(cx + Math.cos(ap) * (rad - lw * 0.5), cy + Math.sin(ap) * (rad - lw * 0.5));
      c.lineTo(cx + Math.cos(ap) * (rad + lw * 0.5), cy + Math.sin(ap) * (rad + lw * 0.5));
      c.strokeStyle = RED; c.lineWidth = Math.max(1.5, lw * 0.2); c.stroke();
    }
    // the needle
    var an = a0 + (a1 - a0) * to, ca = Math.cos(an), sa = Math.sin(an);
    var r0 = rad - lw * 1.05, r1 = rad + lw * 1.05;
    c.lineCap = "round";
    c.beginPath(); c.moveTo(cx + ca * r0, cy + sa * r0); c.lineTo(cx + ca * r1, cy + sa * r1);
    c.strokeStyle = "rgba(0,0,0,0.9)"; c.lineWidth = Math.max(4, lw * 0.5); c.stroke();
    c.beginPath(); c.moveTo(cx + ca * r0, cy + sa * r0); c.lineTo(cx + ca * r1, cy + sa * r1);
    c.strokeStyle = !vacuum && to >= redFrom ? (blink ? RED : "#ff5a5f") : "#ffffff"; c.lineWidth = Math.max(2, lw * 0.26); c.stroke();
    c.lineCap = "butt";
  };

  root.dotGaugeBar = function (c, x0, x1, y, h, frac, redFrom, shift, blink) {
    var W = x1 - x0, xr = x0 + W * redFrom, xv = x0 + W * frac, r = Math.min(3, h * 0.2);
    var box = function (xa, xb, col) {
      if (xb - xa < 0.5) return;
      c.beginPath();
      if (c.roundRect) c.roundRect(xa, y - h / 2, xb - xa, h, r); else c.rect(xa, y - h / 2, xb - xa, h);
      c.fillStyle = col; c.fill();
    };
    box(x0, xr, TRACK); box(xr, x1, TRACKRED);
    if (frac > 0.002) {
      if (shift) box(x0, xv, blink ? RED : "#7a0f13");
      else {
        var g = c.createLinearGradient(x0, 0, Math.max(x0 + 1, xv), 0);
        g.addColorStop(0, mix(T_RGB, W_RGB, 0.16)); g.addColorStop(1, "#ffffff");
        box(x0, Math.min(xv, xr), g);
        if (xv > xr) {
          var g2 = c.createLinearGradient(xr, 0, Math.max(xr + 1, xv), 0);
          g2.addColorStop(0, mix(T_RGB, R_RGB, 0.55)); g2.addColorStop(1, RED);
          box(xr, xv, g2);
        }
      }
    }
    // the needle: a short upright bar, only where the revs are
    var nh = h * 2.1, nw = Math.max(2, h * 0.22);
    c.fillStyle = "rgba(0,0,0,0.9)"; c.fillRect(xv - nw / 2 - 1.5, y - nh / 2 - 1.5, nw + 3, nh + 3);
    c.fillStyle = shift || frac >= redFrom ? RED : "#ffffff"; c.fillRect(xv - nw / 2, y - nh / 2, nw, nh);
  };
})(typeof window !== "undefined" ? window : this);

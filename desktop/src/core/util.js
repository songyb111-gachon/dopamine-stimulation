'use strict';
/* ================================================================
   core/util.js — shared math + easing, no dependencies.
   Loaded first; everything else in core/ and games/ builds on this.
   ================================================================ */
window.Util = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const norm360 = a => ((a % 360) + 360) % 360;
  // shortest signed difference a-b, in [-180, 180)
  const signedDelta = (a, b) => ((a - b + 540) % 360 + 360) % 360 - 180;
  const rad = d => (d - 90) * Math.PI / 180; // dial convention: 0deg = 12 o'clock, clockwise
  const backOut = t => { const s = 1.70158; t -= 1; return t * t * ((s + 1) * t + s) + 1; };
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function hashStr(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return (h ^ (h >>> 16)) >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function kstDateStr() {
    const d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function mixColor(hex1, hex2, t) {
    const h = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const a = h(hex1), b = h(hex2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';
  }

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
      this.moveTo(x + r.tl, y);
      this.lineTo(x + w - r.tr, y);
      this.arcTo(x + w, y, x + w, y + r.tr, r.tr);
      this.lineTo(x + w, y + h - r.br);
      this.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
      this.lineTo(x + r.bl, y + h);
      this.arcTo(x, y + h, x, y + h - r.bl, r.bl);
      this.lineTo(x, y + r.tl);
      this.arcTo(x, y, x + r.tl, y, r.tl);
      return this;
    };
  }

  const digitWidthCache = {};
  function drawTabular(g, text, x, y) {
    let dw = digitWidthCache[g.font];
    if (dw === undefined) { dw = g.measureText('0').width; digitWidthCache[g.font] = dw; }
    const total = text.length * dw;
    let cx0 = x - total / 2;
    const prev = g.textAlign; g.textAlign = 'center';
    for (const ch of text) { g.fillText(ch, cx0 + dw / 2, y); cx0 += dw; }
    g.textAlign = prev;
  }

  return {
    TAU, clamp, lerp, rand, norm360, signedDelta, rad, backOut, easeOut, easeInOut,
    hashStr, mulberry32, kstDateStr, mixColor, drawTabular,
    FONT: '-apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  };
})();

'use strict';
/* ================================================================
   core/fx.js — shared juice: particle pool, floating popups, sliding
   banners, center stamps, shockwaves, and the one-at-a-time achievement
   toast queue. Every game reuses this instead of reinventing feedback.
   ================================================================ */
window.FX = (() => {
  const U = window.Util;
  const POOL_N = 320;
  let pool = [];
  let pops = [], banners = [], stamps = [], waves = [];
  let achToastQueue = [], achToast = null;
  let reduceMotion = false;

  function init() {
    pool = [];
    for (let i = 0; i < POOL_N; i++) pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', kind: 0, rot: 0, vr: 0 });
  }
  function setReduceMotion(v) { reduceMotion = !!v; }

  function reset() {
    for (const p of pool) p.on = false;
    pops = []; banners = []; stamps = []; waves = [];
  }

  function spawnP(x, y, vx, vy, life, size, color, kind) {
    for (let i = 0; i < POOL_N; i++) {
      const p = pool[i];
      if (!p.on) {
        p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.life = life; p.max = life; p.size = size; p.color = color;
        p.kind = kind || 0; p.rot = U.rand(0, U.TAU); p.vr = U.rand(-6, 6);
        return;
      }
    }
  }
  function burst(x, y, n, color, speed, kind) {
    if (reduceMotion) n = Math.ceil(n * 0.35);
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU), v = U.rand(speed * 0.35, speed);
      spawnP(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.4, kind === 1 ? 1.2 : 0.6), U.rand(2, kind === 1 ? 6 : 4), color, kind);
    }
  }
  function popup(text, x, y, size, color, punch) {
    pops.push({ text, x, y, life: 0.8, max: 0.8, size, color, vy: -66, punch: punch || 0 });
  }
  function pushBanner(text, color, dur, size) {
    const slot = Math.min(banners.length, 2);
    banners.push({ text, color, t: 0, dur: dur || 1.1, size: size || 30, slot });
  }
  function pushStamp(text, color, dur, size) {
    stamps.push({ text, color, t: 0, dur: dur || 1.0, size: size || 64 });
  }
  function pushWave() { waves.push({ t: 0 }); }

  function queueAchToast(text) { achToastQueue.push(text); }
  function updateAchToast(dt) {
    if (achToast) {
      achToast.t += dt;
      if (achToast.t >= achToast.dur) achToast = null;
    }
    if (!achToast && achToastQueue.length) achToast = { text: achToastQueue.shift(), t: 0, dur: 1.9 };
  }
  function clearAchToast() { achToast = null; achToastQueue = []; }

  function compact(arr, keepFn) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) if (keepFn(arr[i])) arr[w++] = arr[i];
    arr.length = w;
  }

  function update(dt, edt) {
    for (let i = 0; i < POOL_N; i++) {
      const p = pool[i];
      if (!p.on) continue;
      p.life -= edt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * edt; p.y += p.vy * edt;
      p.vy += (p.kind === 1 ? 420 : 200) * edt;
      p.rot += p.vr * edt;
    }
    compact(waves, wv => (wv.t += edt) < 0.3);
    compact(pops, p => { p.life -= dt; p.y += p.vy * dt; return p.life > 0; });
    compact(banners, b => (b.t += dt) < b.dur);
    compact(stamps, s2 => (s2.t += dt) < s2.dur);
    updateAchToast(dt);
  }

  function renderParticles(g) {
    g.save();
    for (const p of pool) {
      if (!p.on) continue;
      const f = p.life / p.max;
      g.globalAlpha = f;
      if (p.kind === 1) {
        g.save();
        g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        g.restore();
      } else {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size * f, 0, U.TAU); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
    }
    g.restore(); g.globalAlpha = 1;
  }

  function renderPops(g, FONT) {
    for (const p of pops) {
      const f = p.life / p.max;
      let sc = 1;
      if (p.punch) { const pt = 1 - f; sc = pt < 0.15 ? 1 + 0.3 * Math.sin(pt / 0.15 * Math.PI) : 1; }
      g.globalAlpha = Math.min(1, f * 2);
      g.fillStyle = p.color;
      g.font = '700 ' + Math.round(p.size * sc) + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
  }

  function renderBanners(g, FONT, cx, topY) {
    for (const b of banners) {
      const f = U.clamp(b.t / 0.3, 0, 1);
      const x = U.lerp(cx + 260, cx, U.backOut(f));
      const fade = b.t > b.dur - 0.3 ? (b.dur - b.t) / 0.3 : 1;
      g.globalAlpha = fade;
      g.font = '800 ' + b.size + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowBlur = 16; g.shadowColor = b.color;
      g.fillStyle = b.color;
      g.fillText(b.text, x, topY - (b.slot || 0) * 34);
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }

  function renderStamps(g, FONT, cx, cy) {
    for (const s2 of stamps) {
      const f = U.clamp(s2.t / 0.25, 0, 1);
      const sc = U.lerp(2.2, 1, U.backOut(f));
      const fade = s2.t > s2.dur - 0.3 ? (s2.dur - s2.t) / 0.3 : 1;
      g.globalAlpha = 0.9 * fade;
      g.font = '900 ' + Math.round(s2.size * sc) + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowBlur = 24; g.shadowColor = s2.color;
      g.fillStyle = s2.color;
      g.fillText(s2.text, cx, cy);
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }

  function renderWaves(g, cx, cy, R) {
    for (const wv of waves) {
      const f = wv.t / 0.3;
      g.globalAlpha = 1 - f;
      g.beginPath();
      g.arc(cx, cy, R * (0.2 + 1.2 * f), 0, U.TAU);
      g.lineWidth = 3 * (1 - f) + 1;
      g.strokeStyle = '#FFFFFF';
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  function renderAchToast(g, FONT, cx, y, color) {
    if (!achToast) return;
    const f = U.clamp(achToast.t / 0.3, 0, 1);
    const x = U.lerp(cx + 260, cx, U.backOut(f));
    const fade = achToast.t > achToast.dur - 0.3 ? (achToast.dur - achToast.t) / 0.3 : 1;
    g.globalAlpha = fade;
    g.font = '700 21px ' + FONT;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowBlur = 14; g.shadowColor = color;
    g.fillStyle = color;
    g.fillText(achToast.text, x, y);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  return {
    init, reset, setReduceMotion,
    spawnP, burst, popup, pushBanner, pushStamp, pushWave,
    queueAchToast, clearAchToast,
    update, renderParticles, renderPops, renderBanners, renderStamps, renderWaves, renderAchToast,
    get pool() { return pool; }, get banners() { return banners; }, get achToastActive() { return !!achToast; },
  };
})();

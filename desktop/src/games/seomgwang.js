'use strict';
/* ================================================================
   games/seomgwang.js — 섬광 (Flash): a fast reaction/reflex game.
   One circular target spawns at a time with a shrinking countdown
   ring telegraphing its own lifespan. Tap it early = PERFECT, tap it
   late = GOOD (combo reset), tap empty space or let it expire = MISS
   (run ends). Occasional decoy targets punish trigger-happy taps.
   Spatially distinct from CHALNA's rotational dial — pure point-and-tap.
   ================================================================ */
(() => {
  const U = window.Util, Save = window.Save, Theme = window.Theme, FX = window.FX;
  const A = window.CoreAudio, SFX = window.SFX, Ach = window.Achievements;

  const ACCENT = '#FF6B4A'; // warm coral — reads well on every theme bg, distinct from CHALNA's gold

  // difficulty ramp tuning (n = successful hits, 3-hit grace before ramp kicks in)
  const LIFE_BASE = 900, LIFE_FLOOR = 380, LIFE_K = 14;      // ms
  const RAD_BASE = 34, RAD_FLOOR = 20, RAD_K = 0.35;         // px
  const PERFECT_FRAC = 0.35;                                  // fraction of CURRENT lifespan

  const DECOY_MIN_HITS = 8, DECOY_CHANCE = 0.25;
  const FEVER_EVERY = 8, FEVER_DUR = 6, FEVER_LIFE_MULT = 1.2, FEVER_SCORE_MULT = 2;
  const MILESTONE_EVERY = 10, MILESTONE_BONUS = 50;
  const PERFECT_BASE = 25, GOOD_BASE = 10;

  const RESULT_LOCKOUT = 0.35;   // seconds of input lockout after death
  const MISS_FLASH_DUR = 0.28;
  const REROLL_MIN_DIST = 80;    // px — reroll once if too close to previous spawn
  const SIDE_MARGIN = 20, TOP_MARGIN = 72, BOTTOM_MARGIN = 22; // clear of corner icons

  const DEFAULTS = { bestScore: 0, bestStreak: 0, lifetimePerfects: 0, totalRuns: 0 };

  function multForStreak(streak) {
    if (streak >= 15) return 5;
    if (streak >= 10) return 4;
    if (streak >= 6) return 3;
    if (streak >= 3) return 2;
    return 1;
  }

  function taunt(hits, bestStreakRun) {
    if (bestStreakRun >= 15) return '번쩍! 눈부신 반응속도';
    if (bestStreakRun >= 8) return '꽤 하는데?';
    if (hits >= 10) return '나쁘지 않아요';
    if (hits >= 3) return '다음엔 더 빠르게';
    return '워밍업이 더 필요해요';
  }

  function playPerfectSound(streak, fever) {
    const n = Math.min(streak, 20);
    const f0 = 523.25 * Math.pow(2, n / 12);
    A.tone('sine', f0, f0 * 1.25, 0.003, 0.10, fever ? 0.20 : 0.16);
    A.tone('triangle', f0 * 1.5, 0, 0.003, 0.07, 0.09);
    if (fever) A.tone('square', f0 * 2, 0, 0.003, 0.05, 0.05);
  }
  function playDecoySound() {
    A.tone('square', 500, 110, 0.004, 0.32, 0.16);
    A.tone('square', 506, 112, 0.004, 0.32, 0.10);
    A.noise(0.15, 0.12, 'highpass', 900, 0);
  }

  window.Games = window.Games || {};
  window.Games.seomgwang = {
    id: 'seomgwang', name: '섬광', genre: '반응속도', accentColor: ACCENT,

    init(hubAPI) {
      this.hub = hubAPI;
      this.gd = Save.gameData('seomgwang', DEFAULTS);
      Ach.register('seomgwang', {
        seomgwang_first_perfect: '섬광: 첫 반응',
        seomgwang_streak_10: '섬광: 연속 10',
        seomgwang_decoy_fooled: '섬광: 미끼에 속음',
        seomgwang_lifetime_100: '섬광: 누적 반응 100',
        seomgwang_runs_50: '섬광: 50판 플레이',
        seomgwang_fever_first: '섬광: 첫 피버',
      });
    },

    onEnter() {
      FX.reset();
      this.phase = 'ready'; // 'ready' | 'playing' | 'results'
      this.t = 0;
      this.target = null;
      this.lastWasDecoy = false;
      this.lastPos = null;
      this.hitStopT = 0;
      this.missFlashT = 0;
      this.lockoutT = 0;
      this.score = 0; this.streak = 0; this.mult = 1;
      this.hits = 0; this.perfects = 0; this.perfectStreak = 0;
      this.bestStreakRun = 0;
      this.feverActive = false; this.feverTimer = 0;
      this.deathReason = '';
      this.isNewRecord = false;
    },

    onExit() {},
    resize(W, H) {},

    _startRun() {
      this.target = null;
      this.lastWasDecoy = false;
      this.lastPos = null;
      this.hitStopT = 0; this.missFlashT = 0; this.lockoutT = 0;
      this.score = 0; this.streak = 0; this.mult = 1;
      this.hits = 0; this.perfects = 0; this.perfectStreak = 0;
      this.bestStreakRun = 0;
      this.feverActive = false; this.feverTimer = 0;
      this.phase = 'playing';
      this._spawnTarget();
      A.resume();
    },

    _pickPos(r) {
      const W = this.hub.W, H = this.hub.H;
      const minX = Math.min(SIDE_MARGIN + r, W / 2), maxX = Math.max(minX, W - SIDE_MARGIN - r);
      const minY = Math.min(TOP_MARGIN + r, H / 2), maxY = Math.max(minY, H - BOTTOM_MARGIN - r);
      const roll = () => ({ x: U.rand(minX, maxX), y: U.rand(minY, maxY) });
      let p = roll();
      if (this.lastPos) {
        const dx = p.x - this.lastPos.x, dy = p.y - this.lastPos.y;
        if (dx * dx + dy * dy < REROLL_MIN_DIST * REROLL_MIN_DIST) p = roll();
      }
      return p;
    },

    _spawnTarget() {
      const k2 = Math.max(0, this.hits - 3);
      let lifespanMs = Math.max(LIFE_FLOOR, LIFE_BASE - LIFE_K * k2);
      if (this.feverActive) lifespanMs *= FEVER_LIFE_MULT;
      let r = Math.max(RAD_FLOOR, RAD_BASE - RAD_K * k2);
      const spaceCap = Math.max(14, (Math.min(this.hub.W, this.hub.H) - TOP_MARGIN - BOTTOM_MARGIN) / 2 - 4);
      r = Math.min(r, spaceCap);

      const isDecoy = this.hits >= DECOY_MIN_HITS && !this.lastWasDecoy && Math.random() < DECOY_CHANCE;
      const pos = this._pickPos(r);
      this.lastPos = pos;
      this.lastWasDecoy = isDecoy;

      const lifespan = lifespanMs / 1000;
      this.target = {
        x: pos.x, y: pos.y, r, age: 0, lifespan,
        perfectWindow: lifespan * PERFECT_FRAC,
        isDecoy,
      };
    },

    _checkMilestone() {
      if (this.hits > 0 && this.hits % MILESTONE_EVERY === 0) {
        this.score += MILESTONE_BONUS;
        FX.pushBanner(this.hits + '타!', Theme.PAL.perfect, 1.2, 26);
        SFX.sMilestone();
      }
    },

    _triggerFever() {
      this.feverActive = true;
      this.feverTimer = FEVER_DUR;
      FX.pushStamp('FEVER!', ACCENT, 1.0, 60);
      SFX.sShimmer();
      Ach.unlock('seomgwang_fever_first');
    },

    _handleHit() {
      const t = this.target;
      const feverMult = this.feverActive ? FEVER_SCORE_MULT : 1;
      const isPerfect = t.age <= t.perfectWindow;
      const reduceMotion = !!Save.data.settings.reduceMotion;

      if (isPerfect) {
        this.streak++;
        this.perfectStreak++;
        this.mult = multForStreak(this.streak);
        const gain = PERFECT_BASE * this.mult * feverMult;
        this.score += gain;
        this.hits++; this.perfects++;
        this.gd.lifetimePerfects++;
        this.bestStreakRun = Math.max(this.bestStreakRun, this.streak);

        if (!reduceMotion) this.hitStopT = 0.04;
        FX.burst(t.x, t.y, 24, Theme.PAL.perfect, 340, 0);
        FX.popup('PERFECT +' + gain, t.x, t.y - 12, 20, Theme.PAL.perfect, 1);
        playPerfectSound(this.streak, this.feverActive);

        if (this.gd.lifetimePerfects === 1) Ach.unlock('seomgwang_first_perfect');
        if (this.streak >= 10) Ach.unlock('seomgwang_streak_10');
        if (this.gd.lifetimePerfects >= 100) Ach.unlock('seomgwang_lifetime_100');
        if (this.perfectStreak > 0 && this.perfectStreak % FEVER_EVERY === 0) this._triggerFever();
        this._checkMilestone();
      } else {
        const prevMult = this.mult;
        const goodGain = GOOD_BASE * feverMult;
        const perfectPay = PERFECT_BASE * prevMult * feverMult;
        const forgone = Math.max(0, perfectPay - goodGain);
        this.score += goodGain;
        this.hits++;
        this.perfectStreak = 0;
        this.streak = 0; this.mult = 1;

        FX.burst(t.x, t.y, 6, Theme.PAL.good, 140, 0);
        FX.popup('GOOD +' + goodGain, t.x, t.y - 12, 15, Theme.PAL.good, 0);
        if (forgone > 0) FX.popup('-' + forgone + ' 놓침', t.x, t.y + 16, 12, Theme.SEM.gray, 0);
        SFX.sGood();
        this._checkMilestone();
      }
      this._spawnTarget();
    },

    _endRun(reason) {
      if (this.phase !== 'playing') return;
      const missPos = this.target ? { x: this.target.x, y: this.target.y } : { x: this.hub.CX, y: this.hub.CY };
      this.phase = 'results';
      this.deathReason = reason;
      this.lockoutT = RESULT_LOCKOUT;
      this.missFlashT = MISS_FLASH_DUR;
      this.target = null;

      // clear any pops/banners/stamps still floating from the last hit — the
      // results screen below has its own fixed static layout, and a stray
      // world-position popup landing near screen center would visually
      // collide with it (leftover-text-over-text class of bug).
      FX.reset();

      const prevBest = this.gd.bestScore;
      this.isNewRecord = this.score > 0 && this.score > prevBest;
      this.gd.totalRuns++;
      this.gd.bestScore = Math.max(this.gd.bestScore, this.score);
      this.gd.bestStreak = Math.max(this.gd.bestStreak, this.bestStreakRun);
      Save.write();

      const xpGain = Math.floor(this.score / 8) + this.perfects * 3;
      const coinGain = Math.floor(this.hits / 5);
      this.hub.reportRunEnd({ xpGain, coinGain });

      if (this.gd.totalRuns >= 50) Ach.unlock('seomgwang_runs_50');

      if (reason === 'decoy') {
        Ach.unlock('seomgwang_decoy_fooled');
        FX.burst(missPos.x, missPos.y, 14, Theme.SEM.gray, 220, 1);
        playDecoySound();
      } else {
        FX.burst(missPos.x, missPos.y, 12, Theme.SEM.miss, 220, 0);
        SFX.sMiss();
      }
    },

    onPointer(x, y, down) {
      if (down === false) return; // defensive; hub only ever sends true
      if (this.phase === 'ready') { this._startRun(); return; }
      if (this.phase === 'results') { if (this.lockoutT > 0) return; this._startRun(); return; }
      if (this.phase !== 'playing' || !this.target) return;
      const t = this.target;
      const dx = x - t.x, dy = y - t.y;
      if (dx * dx + dy * dy <= t.r * t.r) {
        if (t.isDecoy) this._endRun('decoy');
        else this._handleHit();
      } else {
        this._endRun('empty');
      }
    },

    onKey(e) {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      if (this.phase === 'ready') this._startRun();
      else if (this.phase === 'results' && this.lockoutT <= 0) this._startRun();
    },

    update(dt) {
      this.t += dt;
      let edt = dt;
      if (this.hitStopT > 0) {
        this.hitStopT -= dt;
        edt = dt * 0.12;
        if (this.hitStopT < 0) this.hitStopT = 0;
      }
      FX.update(dt, edt);

      if (this.phase === 'results') {
        if (this.lockoutT > 0) this.lockoutT = Math.max(0, this.lockoutT - dt);
        if (this.missFlashT > 0) this.missFlashT = Math.max(0, this.missFlashT - dt);
        return;
      }
      if (this.phase !== 'playing') return;

      if (this.feverActive) {
        this.feverTimer -= edt;
        if (this.feverTimer <= 0) { this.feverActive = false; this.feverTimer = 0; }
      }
      if (this.target) {
        this.target.age += edt;
        if (this.target.age >= this.target.lifespan) {
          if (this.target.isDecoy) this._spawnTarget();
          else this._endRun('timeout');
        }
      }
    },

    _drawTarget(g, t) {
      const PAL = Theme.PAL, SEM = Theme.SEM;
      const remainFrac = U.clamp(1 - t.age / t.lifespan, 0, 1);
      const inPerfect = t.age <= t.perfectWindow;
      const popIn = t.age < 0.12 ? U.lerp(0.6, 1, U.easeOut(t.age / 0.12)) : 1;
      g.save();
      g.translate(t.x, t.y);
      g.scale(popIn, popIn);

      if (t.isDecoy) {
        g.beginPath(); g.arc(0, 0, t.r, 0, U.TAU);
        g.fillStyle = 'rgba(138,147,166,0.16)'; g.fill();
        g.save();
        g.beginPath(); g.arc(0, 0, t.r - 2, 0, U.TAU); g.clip();
        g.strokeStyle = 'rgba(138,147,166,0.4)'; g.lineWidth = 2;
        for (let i = -t.r * 2; i <= t.r * 2; i += 8) {
          g.beginPath(); g.moveTo(i - t.r, -t.r); g.lineTo(i + t.r, t.r); g.stroke();
        }
        g.restore();
        g.lineWidth = 2; g.strokeStyle = 'rgba(138,147,166,0.55)'; g.stroke();
        g.setLineDash([5, 5]);
        g.beginPath(); g.arc(0, 0, t.r + 6, -Math.PI / 2, -Math.PI / 2 + U.TAU * remainFrac);
        g.strokeStyle = SEM.gray; g.lineWidth = 3; g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(245,247,250,0.45)';
        g.beginPath(); g.moveTo(0, -6); g.lineTo(6, 5); g.lineTo(-6, 5); g.closePath(); g.fill();
      } else {
        const grd = g.createRadialGradient(0, 0, 0, 0, 0, t.r);
        grd.addColorStop(0, U.mixColor(ACCENT, '#FFFFFF', 0.18));
        grd.addColorStop(1, U.mixColor(ACCENT, PAL.bg, 0.35));
        g.beginPath(); g.arc(0, 0, t.r, 0, U.TAU); g.fillStyle = grd; g.fill();
        g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke();
        const ringColor = inPerfect ? PAL.perfect : PAL.good;
        g.beginPath();
        g.arc(0, 0, t.r + 7, -Math.PI / 2, -Math.PI / 2 + U.TAU * remainFrac);
        g.strokeStyle = ringColor; g.lineWidth = 4; g.lineCap = 'round'; g.stroke();
      }
      g.restore();
    },

    render(g) {
      const hub = this.hub, PAL = Theme.PAL, SEM = Theme.SEM;
      const CX = hub.CX, CY = hub.CY, W = hub.W, H = hub.H;
      g.textAlign = 'center'; g.textBaseline = 'middle';

      if (this.feverActive) {
        const reduceMotion = !!Save.data.settings.reduceMotion;
        const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.t * 10);
        g.save();
        g.globalAlpha = 0.05 + 0.05 * pulse;
        g.fillStyle = ACCENT;
        g.fillRect(0, 0, W, H);
        g.restore();
      }

      if (this.phase === 'ready') {
        g.fillStyle = ACCENT; g.font = '900 ' + Math.round(Math.min(40, W * 0.11)) + 'px ' + U.FONT;
        g.shadowBlur = 22; g.shadowColor = ACCENT;
        g.fillText('섬광', CX, CY - 90);
        g.shadowBlur = 0;
        g.fillStyle = SEM.gray; g.font = '500 13px ' + U.FONT;
        g.fillText('표적이 사라지기 전에, 빠르게 탭하세요', CX, CY - 46);
        if (this.gd.bestScore > 0) {
          g.fillText('최고 ' + this.gd.bestScore, CX, CY - 14);
        }
        const pulse = 0.6 + 0.4 * Math.sin(this.t * 4);
        g.globalAlpha = pulse;
        g.fillStyle = PAL.good; g.font = '700 16px ' + U.FONT;
        g.fillText('탭해서 시작', CX, CY + 50);
        g.globalAlpha = 1;
      } else if (this.phase === 'playing') {
        if (this.target) this._drawTarget(g, this.target);

        // NOTE: hub renders its own achievement toast at fixed (CX,46) on top of
        // everything, so our HUD must clear that band (~y 34-60) — score sits
        // just above it, streak/fever sit comfortably below it.
        g.fillStyle = PAL.ink; g.font = '800 22px ' + U.FONT;
        U.drawTabular(g, String(this.score), CX, 22);

        g.fillStyle = this.mult > 1 ? PAL.perfect : SEM.gray;
        g.font = '600 13px ' + U.FONT;
        g.fillText('연속 ' + this.streak + '   ×' + this.mult, CX, 72);

        if (this.feverActive) {
          g.fillStyle = ACCENT; g.font = '700 12px ' + U.FONT;
          g.fillText('FEVER ' + Math.ceil(this.feverTimer) + 's', CX, 92);
        }

        FX.renderParticles(g);
        FX.renderPops(g, U.FONT);
        FX.renderBanners(g, U.FONT, CX, 118);
        FX.renderStamps(g, U.FONT, CX, CY);
      } else if (this.phase === 'results') {
        g.save();
        g.globalAlpha = 0.6; g.fillStyle = PAL.bg; g.fillRect(0, 0, W, H);
        g.restore();
        FX.renderParticles(g);

        g.fillStyle = SEM.miss; g.font = '800 26px ' + U.FONT;
        g.fillText('게임 오버', CX, CY - 130);

        g.fillStyle = PAL.ink; g.font = '800 34px ' + U.FONT;
        U.drawTabular(g, '점수 ' + this.score, CX, CY - 84);

        if (this.isNewRecord) {
          g.fillStyle = PAL.perfect; g.font = '700 16px ' + U.FONT;
          g.fillText('신기록!', CX, CY - 50);
        } else {
          g.fillStyle = SEM.gray; g.font = '500 14px ' + U.FONT;
          g.fillText('최고 ' + this.gd.bestScore, CX, CY - 50);
        }

        if (this.deathReason === 'decoy') {
          g.fillStyle = U.mixColor(SEM.miss, SEM.gray, 0.5); g.font = '700 14px ' + U.FONT;
          g.fillText('미끼에 속았다!', CX, CY - 22);
        } else {
          g.fillStyle = SEM.gray; g.font = '500 13px ' + U.FONT;
          g.fillText(taunt(this.hits, this.bestStreakRun), CX, CY - 22);
        }

        g.fillStyle = SEM.gray; g.font = '500 12px ' + U.FONT;
        g.fillText('반응 ' + this.hits + ' · 퍼펙트 ' + this.perfects, CX, CY + 4);

        const locked = this.lockoutT > 0;
        const pulse = locked ? 0.5 : 0.6 + 0.4 * Math.sin(this.t * 4);
        g.globalAlpha = pulse;
        g.fillStyle = locked ? SEM.gray : PAL.good;
        g.font = '700 15px ' + U.FONT;
        g.fillText('탭해서 다시 시작', CX, CY + 46);
        g.globalAlpha = 1;

        FX.renderPops(g, U.FONT);
        FX.renderBanners(g, U.FONT, CX, 104);
        FX.renderStamps(g, U.FONT, CX, CY);
      }

      if (this.missFlashT > 0) {
        g.save();
        g.globalAlpha = (this.missFlashT / MISS_FLASH_DUR) * 0.35;
        g.fillStyle = SEM.miss;
        g.fillRect(0, 0, W, H);
        g.restore();
      }
    },

    summary() {
      const gd = Save.gameData('seomgwang', DEFAULTS);
      return gd.bestScore > 0 ? '최고 ' + gd.bestScore : '';
    },
  };
})();

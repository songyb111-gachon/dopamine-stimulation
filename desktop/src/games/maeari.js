'use strict';
/* ================================================================
   games/maeari.js — 메아리 (Echo): a Simon-says sequence-memory game.
   N pads sit evenly around a ring, each with its own position + tone +
   glyph (colorblind-safe triple-encoding; hue is extra flavor on top).
   Each round: watch a growing sequence light up (PLAYBACK, input locked),
   then repeat it exactly by tapping the pads in order (RECALL). A wrong
   tap or a timeout ends the run and reveals the pad you should have
   hit. Cognitively distinct from CHALNA (reflex timing) and 섬광
   (reaction speed) — this one is pure working-memory load.
   ================================================================ */
(() => {
  const U = window.Util, Save = window.Save, Theme = window.Theme, FX = window.FX;
  const A = window.CoreAudio, SFX = window.SFX, Ach = window.Achievements;

  const ACCENT = '#9B6BFF'; // violet — distinct from CHALNA gold / 섬광 coral, pairs with SEM.ach

  // pad glyph ids (position + tone are the real encoding; shape is a bonus, hue is flavor)
  const SHAPE_CIRCLE = 0, SHAPE_TRIANGLE = 1, SHAPE_SQUARE = 2, SHAPE_DIAMOND = 3, SHAPE_STAR = 4, SHAPE_CROSS = 5;
  const PAD_COLORS = ['#3ADBC4', '#4FA8FF', '#B98CFF', '#FF7AC6', '#7CE58A', '#FF9F4A'];
  const PAD_FREQS = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]; // C4 D4 E4 G4 A4 C5 — major pentatonic

  const LIT_DUR = 0.32;              // seconds a pad stays lit + toned during playback
  const PRE_DELAY = 0.28;            // pause before the first pad lights each round
  const ROUND_END_PAUSE = 0.5;       // pause after round completion before next playback
  const RECALL_TIMEOUT = 2.2;        // generous per-tap window during recall (memory load drives difficulty, not this)
  const QUICK_TAP_THRESHOLD = 0.65;  // any tap slower than this anywhere in the round -> GOOD, not PERFECT
  const REVEAL_DUR = 1.15;           // miss reveal hold before the results screen
  const RESULT_LOCKOUT = 0.35;

  const FEVER_EVERY = 6, FEVER_DUR = 6;
  const MILESTONE_EVERY = 5, MILESTONE_BONUS = 50;
  const BASE_POINTS = 15;

  const DEFAULTS = { bestScore: 0, bestRound: 0, lifetimePerfectRounds: 0, totalRuns: 0 };

  function multForStreak(streak) {
    if (streak >= 15) return 5;
    if (streak >= 10) return 4;
    if (streak >= 6) return 3;
    if (streak >= 3) return 2;
    return 1;
  }
  function padCountForRound(roundNumber) {
    if (roundNumber <= 4) return 4;
    if (roundNumber <= 9) return 5;
    return 6;
  }
  function seqLenForRound(roundNumber) { return roundNumber + 2; }
  function playbackGapForRound(completedRounds) {
    const t = U.clamp(completedRounds / 17, 0, 1);
    return U.lerp(0.42, 0.22, t);
  }
  function genSequence(n, length) {
    const seq = [];
    for (let i = 0; i < length; i++) seq.push(Math.floor(Math.random() * n));
    return seq;
  }
  function pickTaunt(ctx) {
    if (ctx.isNewBestRound) return '신기록이에요! 다음엔 더 멀리';
    if (ctx.isTimeout) return '시간 안에 손이 안 갔네요';
    if (ctx.missedAtLastStep) return '한 스텝만 더 기억했으면...';
    if (ctx.missedAtFirstStep) return '처음부터 다시 볼까요?';
    return '다시 하면 넘길 수 있어요';
  }
  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + gg + ',' + b + ',' + a + ')';
  }
  function drawStar(g, cx, cy, outerR, innerR, points) {
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }
  function drawPadIcon(g, shape, cx, cy, size, color) {
    g.save();
    g.fillStyle = color;
    switch (shape % 6) {
      case SHAPE_CIRCLE:
        g.beginPath(); g.arc(cx, cy, size * 0.5, 0, U.TAU); g.fill();
        break;
      case SHAPE_TRIANGLE:
        g.beginPath(); g.moveTo(cx, cy - size * 0.56); g.lineTo(cx + size * 0.5, cy + size * 0.38);
        g.lineTo(cx - size * 0.5, cy + size * 0.38); g.closePath(); g.fill();
        break;
      case SHAPE_SQUARE:
        g.fillRect(cx - size * 0.4, cy - size * 0.4, size * 0.8, size * 0.8);
        break;
      case SHAPE_DIAMOND:
        g.beginPath(); g.moveTo(cx, cy - size * 0.56); g.lineTo(cx + size * 0.45, cy);
        g.lineTo(cx, cy + size * 0.56); g.lineTo(cx - size * 0.45, cy); g.closePath(); g.fill();
        break;
      case SHAPE_STAR:
        drawStar(g, cx, cy, size * 0.52, size * 0.22, 5); g.fill();
        break;
      case SHAPE_CROSS: {
        const th = size * 0.22;
        g.fillRect(cx - th / 2, cy - size * 0.5, th, size);
        g.fillRect(cx - size * 0.5, cy - th / 2, size, th);
        break;
      }
    }
    g.restore();
  }

  window.Games = window.Games || {};
  window.Games.maeari = {
    id: 'maeari', name: '메아리', genre: '기억력', accentColor: ACCENT,

    init(hubAPI) {
      this.hub = hubAPI;
      this.gd = Save.gameData('maeari', DEFAULTS);
      Ach.register('maeari', {
        maeari_first_perfect_round: '메아리: 첫 완벽한 라운드',
        maeari_round_10: '메아리: 10라운드 돌파',
        maeari_streak_6: '메아리: 연속 완벽 6',
        maeari_lifetime_perfects_50: '메아리: 누적 완벽 라운드 50',
        maeari_runs_50: '메아리: 50판 플레이',
        maeari_fever_first: '메아리: 첫 피버',
      });
      this.N = 4; this.pads = []; this.padGlow = [];
      this.ringCX = 0; this.ringCY = 0; this.ringR = 0;
      this.animT = 0; this.shakeTimer = 0;
      this.phase = 'playback'; this.sequence = []; this.recallIndex = 0;
      this.roundNumber = 1; this.roundsCompleted = 0; this.score = 0;
    },

    onEnter() {
      FX.reset();
      this.animT = 0;
      this._startRun();
    },
    onExit() {},
    resize(W, H) { this._computePadLayout(); },

    _startRun() {
      this.score = 0;
      this.roundsCompleted = 0;
      this.perfectStreak = 0;
      this.multiplier = 1;
      this.feverTimer = 0;
      this.perfectRoundsThisRun = 0;
      this.totalRoundsCompletedThisRun = 0;
      this.runFinalized = false;
      this.missInfo = null;
      this.flashWrong = null;
      this.flashCorrect = null;
      this.taunt = '';
      this.isNewBestRound = false;
      this.shakeTimer = 0;
      FX.reset();
      this._startRound();
    },

    _startRound() {
      this.roundNumber = this.roundsCompleted + 1;
      this.N = padCountForRound(this.roundNumber);
      this._computePadLayout();
      this.seqLen = seqLenForRound(this.roundNumber);
      this.sequence = genSequence(this.N, this.seqLen);
      this.recallIndex = 0;
      this.hadSlowTapThisRound = false;
      this.recallGapTimer = 0;
      this.playbackGap = playbackGapForRound(this.roundsCompleted);
      this.playbackStep = -1;
      this.playbackTimer = 0;
      this.flashWrong = null; this.flashCorrect = null;
      this.phase = 'playback';
    },

    _computePadLayout() {
      const hub = this.hub;
      if (!hub) return;
      const minWH = Math.min(hub.W, hub.H);
      this.ringCX = hub.CX;
      this.ringCY = hub.CY + minWH * 0.02;
      this.ringR = minWH * 0.30;
      const n = this.N || 4;
      const pads = [];
      for (let i = 0; i < n; i++) {
        const angleDeg = i * (360 / n);
        const a = U.rad(angleDeg);
        pads.push({ x: this.ringCX + this.ringR * Math.cos(a), y: this.ringCY + this.ringR * Math.sin(a) });
      }
      const chord = 2 * this.ringR * Math.sin(Math.PI / n);
      const padR = U.clamp(chord * 0.38, 22, 58);
      for (const p of pads) p.r = padR;
      this.pads = pads;
      if (this.padGlow.length !== n) this.padGlow = new Array(n).fill(0);
    },

    _lightPad(idx) {
      this.padGlow[idx] = 1;
      this._playPadTone(idx, { fever: this.feverTimer > 0 });
    },
    _playPadTone(idx, opts) {
      opts = opts || {};
      const freq = PAD_FREQS[idx % PAD_FREQS.length];
      const dur = opts.short ? 0.16 : 0.32;
      const vol = opts.short ? 0.16 : 0.20;
      A.tone('sine', freq, 0, 0.008, dur, vol);
      if (opts.fever) {
        A.tone('sine', freq * 1.5, 0, 0.02, dur * 0.9, 0.08);
        A.tone('sine', freq * 2, 0, 0.03, dur * 0.8, 0.05);
      }
    },

    _hitTestPad(x, y) {
      for (let i = 0; i < this.pads.length; i++) {
        const p = this.pads[i];
        const dx = x - p.x, dy = y - p.y;
        if (dx * dx + dy * dy <= p.r * p.r) return i;
      }
      return -1;
    },

    _handleRecallTap(idx) {
      const expected = this.sequence[this.recallIndex];
      if (idx === expected) {
        const elapsed = this.recallGapTimer;
        if (elapsed > QUICK_TAP_THRESHOLD) this.hadSlowTapThisRound = true;
        const pad = this.pads[idx];
        this.padGlow[idx] = 1;
        this._playPadTone(idx, { short: true, fever: this.feverTimer > 0 });
        FX.burst(pad.x, pad.y, Save.data.settings.reduceMotion ? 4 : 9, PAD_COLORS[idx % PAD_COLORS.length], 110, 0);
        this.recallIndex++;
        this.recallGapTimer = 0;
        if (this.recallIndex >= this.sequence.length) this._completeRound();
      } else {
        this._triggerMiss(idx, false);
      }
    },

    _completeRound() {
      const isPerfect = !this.hadSlowTapThisRound;
      const roundLen = this.sequence.length;
      const feverActive = this.feverTimer > 0;
      const base = BASE_POINTS * roundLen * this.multiplier * (feverActive ? 2 : 1);
      const cx = this.ringCX, cy = this.ringCY;
      let pts;
      if (isPerfect) {
        pts = base;
        this.perfectStreak++;
        this.perfectRoundsThisRun++;
        Ach.unlock('maeari_first_perfect_round');
        if (this.perfectStreak === 6) Ach.unlock('maeari_streak_6');
        FX.popup('PERFECT +' + pts, cx, cy - 60, 20, Theme.PAL.perfect, 1);
        FX.burst(cx, cy, Save.data.settings.reduceMotion ? 6 : 16, Theme.PAL.perfect, 160, 0);
        SFX.sGood();
      } else {
        pts = Math.floor(base / 2);
        const forgone = base - pts;
        this.perfectStreak = 0;
        FX.popup('GOOD +' + pts, cx, cy - 60, 18, Theme.PAL.good, 0);
        FX.popup('놓친 보너스 -' + forgone, cx, cy - 34, 12, Theme.SEM.gray, 0);
        SFX.sSoftFail();
      }
      this.score += pts;
      this.totalRoundsCompletedThisRun++;
      this.roundsCompleted++;
      this.multiplier = multForStreak(this.perfectStreak);

      if (this.roundsCompleted === 10) Ach.unlock('maeari_round_10');
      if (this.roundsCompleted % MILESTONE_EVERY === 0) {
        this.score += MILESTONE_BONUS;
        FX.pushBanner(this.roundsCompleted + '라운드!', Theme.PAL.perfect, 1.3, 28);
        SFX.sMilestone();
      }
      if (isPerfect && this.perfectStreak > 0 && this.perfectStreak % FEVER_EVERY === 0) {
        this.feverTimer = FEVER_DUR;
        FX.pushStamp('피버!', Theme.PAL.perfect, 1.1, 60);
        SFX.sShimmer();
        Ach.unlock('maeari_fever_first');
      }

      this.phase = 'roundEnd';
      this.roundEndTimer = ROUND_END_PAUSE;
    },

    _triggerMiss(wrongIdx, isTimeout) {
      if (this.phase !== 'recall') return;
      const correctIdx = this.sequence[this.recallIndex];
      const recallIndexAtMiss = this.recallIndex;
      this.flashWrong = wrongIdx >= 0 ? { idx: wrongIdx } : null;
      this.flashCorrect = { idx: correctIdx };
      SFX.sMiss();
      const wp = wrongIdx >= 0 ? this.pads[wrongIdx] : null;
      const cp = this.pads[correctIdx];
      if (wp) FX.burst(wp.x, wp.y, 10, Theme.SEM.miss, 140, 0);
      if (cp) FX.burst(cp.x, cp.y, 10, Theme.PAL.perfect, 140, 0);
      this.shakeTimer = Save.data.settings.reduceMotion ? 0 : 0.35;
      this.missInfo = { isTimeout };
      this.phase = 'reveal';
      this.revealTimer = REVEAL_DUR;
      this._finalizeRun();
      this.taunt = pickTaunt({
        isNewBestRound: this.isNewBestRound,
        isTimeout,
        missedAtLastStep: recallIndexAtMiss === this.sequence.length - 1,
        missedAtFirstStep: recallIndexAtMiss === 0,
      });
    },

    _finalizeRun() {
      if (this.runFinalized) return;
      this.runFinalized = true;
      const gd = this.gd;
      const finalRoundReached = this.roundNumber;
      this.isNewBestRound = finalRoundReached > gd.bestRound;
      gd.bestScore = Math.max(gd.bestScore, this.score);
      gd.bestRound = Math.max(gd.bestRound, finalRoundReached);
      gd.lifetimePerfectRounds += this.perfectRoundsThisRun;
      gd.totalRuns += 1;
      Save.write();

      if (gd.lifetimePerfectRounds >= 50) Ach.unlock('maeari_lifetime_perfects_50');
      if (gd.totalRuns >= 50) Ach.unlock('maeari_runs_50');

      const xpGain = Math.floor(this.score / 8) + this.perfectRoundsThisRun * 3;
      const coinGain = Math.floor(this.totalRoundsCompletedThisRun / 3);
      this.hub.reportRunEnd({ xpGain, coinGain });
    },

    onPointer(x, y, down) {
      if (down === false) return; // defensive; hub only ever sends true
      if (this.phase === 'results') {
        if (this.resultsLockTimer > 0) return;
        SFX.sUiOpen();
        this._startRun();
        return;
      }
      if (this.phase !== 'recall') return;
      const idx = this._hitTestPad(x, y);
      if (idx < 0) return;
      this._handleRecallTap(idx);
    },

    onKey(e) {},

    update(dt) {
      this.animT += dt;
      FX.update(dt, dt);
      for (let i = 0; i < this.padGlow.length; i++) {
        if (this.padGlow[i] > 0) this.padGlow[i] = Math.max(0, this.padGlow[i] - dt / 0.45);
      }
      if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      if (this.feverTimer > 0) this.feverTimer = Math.max(0, this.feverTimer - dt);

      if (this.phase === 'playback') {
        this._updatePlayback(dt);
      } else if (this.phase === 'recall') {
        this.recallGapTimer += dt;
        if (this.recallGapTimer > RECALL_TIMEOUT) this._triggerMiss(-1, true);
      } else if (this.phase === 'roundEnd') {
        this.roundEndTimer -= dt;
        if (this.roundEndTimer <= 0) this._startRound();
      } else if (this.phase === 'reveal') {
        this.revealTimer -= dt;
        if (this.revealTimer <= 0) { this.phase = 'results'; this.resultsLockTimer = RESULT_LOCKOUT; }
      } else if (this.phase === 'results') {
        if (this.resultsLockTimer > 0) this.resultsLockTimer = Math.max(0, this.resultsLockTimer - dt);
      }
    },

    _updatePlayback(dt) {
      this.playbackTimer += dt;
      const stepTotal = LIT_DUR + this.playbackGap;
      if (this.playbackStep === -1) {
        if (this.playbackTimer >= PRE_DELAY) {
          this.playbackStep = 0; this.playbackTimer = 0;
          this._lightPad(this.sequence[0]);
        }
      } else if (this.playbackTimer >= stepTotal) {
        this.playbackStep++;
        this.playbackTimer = 0;
        if (this.playbackStep < this.sequence.length) this._lightPad(this.sequence[this.playbackStep]);
        else { this.phase = 'recall'; this.recallGapTimer = 0; }
      }
    },

    _renderHUD(g) {
      // NOTE: the hub renders its own achievement toast centered at (CX, 46) on
      // top of every game (an integration screenshot caught our score text
      // directly overlapping it) — our HUD must start clear of that band.
      const hub = this.hub, PAL = Theme.PAL, SEM = Theme.SEM;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = PAL.ink; g.font = '800 22px ' + U.FONT;
      g.fillText(this.score + '점', hub.CX, 66);
      g.fillStyle = this.multiplier > 1 ? PAL.perfect : SEM.gray; g.font = '700 13px ' + U.FONT;
      g.fillText('×' + this.multiplier + '  ·  ' + this.roundNumber + '라운드', hub.CX, 90);
      const hint = this.phase === 'playback' ? '잘 보세요' : (this.phase === 'recall' ? '순서대로 탭하세요' : '');
      if (hint) { g.fillStyle = SEM.gray; g.font = '500 12px ' + U.FONT; g.fillText(hint, hub.CX, 110); }
      if (this.feverTimer > 0) {
        g.fillStyle = PAL.perfect; g.font = '800 14px ' + U.FONT;
        g.fillText('FEVER ' + this.feverTimer.toFixed(1) + 's', hub.CX, hub.H - 24);
      }
    },

    _renderPads(g) {
      const PAL = Theme.PAL, SEM = Theme.SEM;
      for (let i = 0; i < this.pads.length; i++) {
        const p = this.pads[i];
        const glow = this.padGlow[i] || 0;
        const isFlashWrong = this.flashWrong && this.flashWrong.idx === i;
        const isFlashCorrect = this.flashCorrect && this.flashCorrect.idx === i;
        g.save();
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, U.TAU);
        let fillAlpha = 0.20 + glow * 0.55;
        let fillColor = PAD_COLORS[i % PAD_COLORS.length];
        if (isFlashWrong) { fillColor = SEM.miss; fillAlpha = 0.78; }
        else if (isFlashCorrect) { fillColor = PAL.perfect; fillAlpha = 0.82; }
        g.globalAlpha = fillAlpha; g.fillStyle = fillColor; g.fill(); g.globalAlpha = 1;
        const strokeColor = isFlashWrong ? SEM.miss : (isFlashCorrect ? PAL.perfect : PAD_COLORS[i % PAD_COLORS.length]);
        g.lineWidth = 2 + glow * 2 + (isFlashWrong || isFlashCorrect ? 2 : 0);
        g.strokeStyle = strokeColor;
        if (glow > 0.05 || isFlashWrong || isFlashCorrect) {
          g.shadowBlur = 18 * glow + (isFlashWrong || isFlashCorrect ? 24 : 0);
          g.shadowColor = strokeColor;
        }
        g.stroke(); g.shadowBlur = 0;
        const iconColor = (isFlashWrong || isFlashCorrect || glow > 0.4) ? PAL.bg : PAL.ink;
        drawPadIcon(g, i, p.x, p.y, p.r * 0.85, iconColor);
        g.restore();
      }
    },

    _renderCenterIndicator(g) {
      if (!this.sequence.length) return;
      const PAL = Theme.PAL;
      const total = this.sequence.length;
      const progressIdx = this.phase === 'playback' ? (this.playbackStep + 1) : this.recallIndex;
      const frac = U.clamp(progressIdx / total, 0, 1);
      const r = Math.min(38, this.ringR * 0.32);
      g.save();
      g.translate(this.ringCX, this.ringCY);
      g.beginPath(); g.arc(0, 0, r, 0, U.TAU); g.strokeStyle = 'rgba(245,247,250,0.15)'; g.lineWidth = 5; g.stroke();
      if (frac > 0) {
        g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + frac * U.TAU);
        g.strokeStyle = PAL.perfect; g.lineWidth = 5; g.lineCap = 'round'; g.stroke();
      }
      g.fillStyle = PAL.ink; g.font = '700 15px ' + U.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(Math.max(0, progressIdx) + '/' + total, 0, 0);
      g.restore();
    },

    _renderResults(g) {
      const hub = this.hub, PAL = Theme.PAL, SEM = Theme.SEM;
      const W = hub.W, H = hub.H, CX = hub.CX, CY = hub.CY;
      g.save();
      g.globalAlpha = 0.74; g.fillStyle = PAL.bg; g.fillRect(0, 0, W, H);
      g.restore();

      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = SEM.miss; g.font = '800 24px ' + U.FONT;
      g.fillText(this.missInfo && this.missInfo.isTimeout ? '시간 초과' : '틀렸어요', CX, CY - 120);

      g.fillStyle = PAL.ink; g.font = '900 38px ' + U.FONT;
      g.fillText(this.score + '점', CX, CY - 76);

      if (this.isNewBestRound) {
        g.fillStyle = PAL.perfect; g.font = '700 15px ' + U.FONT;
        g.fillText('신기록!', CX, CY - 40);
      } else {
        g.fillStyle = SEM.gray; g.font = '500 14px ' + U.FONT;
        g.fillText('최고 ' + this.gd.bestRound + '라운드', CX, CY - 40);
      }

      g.fillStyle = SEM.gray; g.font = '500 13px ' + U.FONT;
      g.fillText(this.taunt, CX, CY - 12);

      g.font = '500 12px ' + U.FONT;
      g.fillText('완료 ' + this.roundsCompleted + '라운드 · 완벽 ' + this.perfectRoundsThisRun + '회', CX, CY + 12);

      const locked = this.resultsLockTimer > 0;
      const pulse = locked ? 0.5 : 0.6 + 0.4 * Math.sin(this.animT * 4);
      g.globalAlpha = pulse;
      g.fillStyle = locked ? SEM.gray : this.accentColor;
      g.font = '700 15px ' + U.FONT;
      g.fillText('탭해서 다시 시작', CX, CY + 54);
      g.globalAlpha = 1;

      FX.renderPops(g, U.FONT);
      FX.renderBanners(g, U.FONT, CX, 104);
    },

    render(g) {
      const hub = this.hub, PAL = Theme.PAL;
      if (!hub) return;
      g.save();
      if (this.shakeTimer > 0) {
        const mag = 6 * (this.shakeTimer / 0.35);
        const ox = Math.sin(this.animT * 55) * mag, oy = Math.cos(this.animT * 47) * mag * 0.6;
        g.translate(ox, oy);
      }
      if (this.feverTimer > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(this.animT * 6);
        const grad = g.createRadialGradient(hub.CX, hub.CY, 0, hub.CX, hub.CY, Math.max(hub.W, hub.H) * 0.6);
        grad.addColorStop(0, hexToRgba(PAL.perfect, 0.10 + 0.08 * pulse));
        grad.addColorStop(1, hexToRgba(PAL.perfect, 0));
        g.fillStyle = grad; g.fillRect(0, 0, hub.W, hub.H);
      }

      if (this.phase === 'results') {
        this._renderResults(g);
      } else {
        this._renderHUD(g);
        this._renderPads(g);
        this._renderCenterIndicator(g);
        FX.renderParticles(g);
        FX.renderPops(g, U.FONT);
        FX.renderBanners(g, U.FONT, hub.CX, 46);
        FX.renderStamps(g, U.FONT, this.ringCX, this.ringCY);
      }
      g.restore();
    },

    summary() {
      const gd = Save.gameData('maeari', DEFAULTS);
      return gd.bestRound > 0 ? '최고 ' + gd.bestRound + '라운드' : '';
    },
  };
})();

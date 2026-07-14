'use strict';
/* ================================================================
   games/nakha.js — 낙하 (Nakha, "Falling"): lane-based catch/dodge.
   3 vertical lanes, objects fall straight down, tap a lane to act on
   whatever is in its catch zone right now. Genre-defining skill is
   split spatial attention across 3 simultaneous lanes (distinct from
   CHALNA's rotational timing, Seomgwang's single-target reflex, and
   Maeari's memory recall). Input is press-only, exactly like every
   other game in this compilation — no drag, no hold, no move-tracking.
   ================================================================ */
window.Games = window.Games || {};
(() => {
  const U = window.Util, Theme = window.Theme, FX = window.FX, SFX = window.SFX;
  const Ach = window.Achievements, Save = window.Save, A = window.CoreAudio;

  function wrapText(g, text, cx, cy, maxWidth, lineH) {
    const words = text.split(' ');
    let line = '', lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const startY = cy - (lines.length - 1) * lineH / 2;
    lines.forEach((ln, i) => g.fillText(ln, cx, startY + i * lineH));
  }

  const TAUNTS = {
    bad: ['가시는 피하라고 있는 거예요!', '함정에 손이 먼저 나갔네요'],
    empty: ['거긴 아무것도 없었는데요', '허공만 잡으셨어요'],
    drop: ['코앞에서 놓쳤어요', '그건 잡았어야죠'],
    gold: ['골드 욕심이 화근이었네요', '금빛에 홀려 다음 걸 놓쳤어요'],
    streak: ['좋은 연속 기록이었는데 아쉽네요', '콤보가 아까워요'],
  };

  window.Games.nakha = {
    id: 'nakha', name: '낙하', genre: '순발력', accentColor: '#2ED9A8',

    init(hubAPI) {
      this.hub = hubAPI;
      Ach.register('nakha', {
        nakha_first_perfect: '낙하: 첫 퍼펙트 캐치',
        nakha_streak_10: '낙하: 연속 캐치 10',
        nakha_gold_first: '낙하: 첫 골드',
        nakha_lifetime_100: '낙하: 누적 캐치 100',
        nakha_runs_50: '낙하: 50판 플레이',
        nakha_fever_first: '낙하: 첫 피버',
      });
      /* __TEMP_DEBUG_HOOK__ */
      if (typeof location !== 'undefined' && location.search.indexOf('debug=1') >= 0) {
        const self = this;
        window.__DBG = {
          get objects() { return self.objects; },
          get score() { return self.score; },
          get streak() { return self.streak; },
          get mult() { return self.mult; },
          get catches() { return self.catches; },
          get phase() { return self.phase; },
          get feverT() { return self.feverT; },
          get catchCenterY() { return self.catchCenterY; },
          forceSpawn(lane, kind, gold) {
            self.objects = self.objects.filter(o => o.lane !== lane);
            const speed = self.fallDistance / self.crossingTime(self.catches);
            self.objects.push({ lane, y: self.spawnY, kind: kind || 'good', gold: !!gold, speed, r: self.objR });
          },
          setY(lane, y) { const o = self.objects.find(o => o.lane === lane); if (o) o.y = y; },
          tap(lane) { self.handleTap(lane); },
        };
      }
      /* __END_TEMP_DEBUG_HOOK__ */
    },

    onEnter() {
      FX.reset();
      this.gd = Save.gameData('nakha', { bestScore: 0, bestStreak: 0, lifetimeCatches: 0, totalRuns: 0 });
      this.startRun();
    },
    onExit() {},

    resize(W, H) {
      this.laneW = W / 3;
      this.playTop = 90;
      this.playBottom = H - 24;
      this.playH = this.playBottom - this.playTop;
      this.spawnY = this.playTop - 30;
      this.fallDistance = this.playBottom - this.spawnY;
      const maxSpeed = this.fallDistance / 0.9;      // crossing-time floor
      const maxGoodHalfH = 0.24 * maxSpeed / 2;        // good-window floor
      this.catchCenterY = this.playBottom - 10 - maxGoodHalfH;
      this.objR = Math.max(14, Math.min(this.laneW * 0.26, 26));
    },

    startRun() {
      this.phase = 'play';
      this.objects = [];
      this.score = 0; this.streak = 0; this.mult = 1;
      this.catches = 0; this.totalCatchesRun = 0; this.perfectsRun = 0; this.bestStreakRun = 0;
      this.feverT = 0; this.feverChain = 0;
      this.lastGoodGold = false; this.lastActionGold = false;
      this.spawnTimer = 0.6;
      this.resultsT = 0; this.missReason = ''; this.wasGoldJustBefore = false; this.taunt = '';
    },

    /* ---------------- difficulty ramp (n = successful catches this run) ---------------- */
    rampT(n) { const en = Math.max(0, n - 3); return U.clamp(en / 30, 0, 1); },
    crossingTime(n) { return U.lerp(2.2, 0.9, U.easeOut(this.rampT(n))); },
    perfectWin(n) { return U.lerp(0.16, 0.10, U.easeOut(this.rampT(n))); },
    goodWin(n) { return U.lerp(0.40, 0.24, U.easeOut(this.rampT(n))); },
    spawnInterval(n) { return U.lerp(0.9, 0.45, U.easeOut(this.rampT(n))); },
    badChance(n) { if (n < 6) return 0; return U.lerp(1 / 6, 1 / 4, U.clamp((n - 6) / 24, 0, 1)); },
    maxSimultaneous(n) { return n >= 13 ? 2 : 1; },

    laneCenterX(lane) { return this.laneW * lane + this.laneW / 2; },

    trySpawn() {
      const n = this.catches;
      const activeLanes = this.objects.map(o => o.lane);
      const freeLanes = [0, 1, 2].filter(l => activeLanes.indexOf(l) < 0);
      if (!freeLanes.length) return;
      if (this.objects.length >= this.maxSimultaneous(n)) return;
      const lane = freeLanes[(Math.random() * freeLanes.length) | 0];
      let kind = 'good';
      if (Math.random() < this.badChance(n)) kind = 'bad';
      let gold = false;
      if (kind === 'good' && n >= 10 && Math.random() < 1 / 8 && !this.lastGoodGold) gold = true;
      if (kind === 'good') this.lastGoodGold = gold;
      const speed = this.fallDistance / this.crossingTime(n);
      this.objects.push({ lane, y: this.spawnY, kind, gold, speed, r: this.objR });
    },

    removeObject(obj) {
      const i = this.objects.indexOf(obj);
      if (i >= 0) this.objects.splice(i, 1);
    },

    update(dt) {
      FX.update(dt, dt);
      if (this.phase === 'results') { this.resultsT += dt; return; }
      if (this.phase !== 'play') return;

      if (this.feverT > 0) this.feverT = Math.max(0, this.feverT - dt);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.trySpawn(); this.spawnTimer = this.spawnInterval(this.catches); }

      for (let i = this.objects.length - 1; i >= 0; i--) {
        const o = this.objects[i];
        o.y += o.speed * dt;
        if (o.y >= this.playBottom) {
          if (o.kind === 'good') {
            this.objects.splice(i, 1);
            this.endRun('drop', o.lane, o);
            return;
          }
          this.objects.splice(i, 1);
        }
      }
    },

    handleTap(lane) {
      const obj = this.objects.find(o => o.lane === lane);
      if (obj) {
        const goodHalfH = this.goodWin(this.catches) * obj.speed / 2;
        const dy = Math.abs(obj.y - this.catchCenterY);
        if (dy <= goodHalfH) {
          if (obj.kind === 'bad') { this.removeObject(obj); this.endRun('bad', lane, obj); return; }
          let perfWin = this.perfectWin(this.catches);
          if (this.feverT > 0) perfWin *= 1.2;
          const perfectHalfH = perfWin * obj.speed / 2;
          const isPerfect = dy <= perfectHalfH;
          this.removeObject(obj);
          if (isPerfect) this.onPerfect(obj, lane); else this.onGood(obj, lane);
          return;
        }
      }
      this.endRun('empty', lane, null);
    },

    checkMilestone() {
      if (this.catches > 0 && this.catches % 10 === 0) {
        this.score += 50;
        FX.pushBanner(this.catches + '개!', Theme.PAL.perfect, 1.3, 30);
        SFX.sMilestone();
      }
    },

    sfxPerfect(streak) {
      const base = 700 + Math.min(streak, 15) * 22;
      A.tone('sine', base, base * 1.15, 0.004, 0.11, 0.13);
      A.tone('triangle', base * 1.5, 0, 0.006, 0.09, 0.07);
    },

    onPerfect(obj, lane) {
      this.streak++;
      this.catches++; this.totalCatchesRun++; this.perfectsRun++;
      this.bestStreakRun = Math.max(this.bestStreakRun, this.streak);
      this.mult = this.multFor(this.streak);
      this.feverChain++;
      let pts = 25 * this.mult;
      if (obj.gold) pts *= 3;
      if (this.feverT > 0) pts *= 2;
      pts = Math.round(pts);
      this.score += pts;

      const x = this.laneCenterX(lane), y = this.catchCenterY;
      FX.popup('+' + pts, x, y, obj.gold ? 24 : 20, Theme.PAL.perfect, 1);
      FX.burst(x, y, obj.gold ? 24 : 16, Theme.PAL.perfect, 180, 0);
      this.sfxPerfect(this.streak);
      if (obj.gold) SFX.sCoin();

      Ach.unlock('nakha_first_perfect');
      if (obj.gold) Ach.unlock('nakha_gold_first');
      if (this.streak >= 10) Ach.unlock('nakha_streak_10');

      if (this.feverChain >= 8) {
        this.feverT = 6;
        this.feverChain = 0;
        FX.pushStamp('FEVER!', Theme.PAL.perfect, 1.0, 60);
        FX.pushBanner('피버!', Theme.PAL.perfect, 1.2, 28);
        Ach.unlock('nakha_fever_first');
      }

      this.checkMilestone();
      this.lastActionGold = obj.gold;
    },

    onGood(obj, lane) {
      this.catches++; this.totalCatchesRun++;
      const curMult = this.multFor(this.streak);
      let pts = 10 * curMult;
      if (this.feverT > 0) pts *= 2;
      pts = Math.round(pts);
      this.score += pts;

      const x = this.laneCenterX(lane), y = this.catchCenterY;
      FX.popup('+' + pts, x, y, 15, Theme.SEM.gray, 0);
      FX.burst(x, y, 8, Theme.SEM.goodFx, 90, 0);
      SFX.sGood();

      this.streak = 0; this.mult = 1; this.feverChain = 0;
      this.checkMilestone();
      this.lastActionGold = false;
    },

    multFor(streak) {
      if (streak >= 15) return 5;
      if (streak >= 10) return 4;
      if (streak >= 6) return 3;
      if (streak >= 3) return 2;
      return 1;
    },

    endRun(reason, lane, obj) {
      this.phase = 'results';
      this.resultsT = 0;
      this.missReason = reason;
      this.wasGoldJustBefore = this.lastActionGold;

      SFX.sMiss();
      const x = this.laneCenterX(lane);
      FX.burst(x, this.catchCenterY, 20, Theme.SEM.miss, 200, 0);
      FX.pushStamp('MISS', Theme.SEM.miss, 0.9, 54);

      const gd = this.gd;
      gd.totalRuns++;
      gd.lifetimeCatches += this.totalCatchesRun;
      if (this.score > gd.bestScore) gd.bestScore = this.score;
      if (this.bestStreakRun > gd.bestStreak) gd.bestStreak = this.bestStreakRun;
      Save.write();

      const xpGain = Math.floor(this.score / 8) + this.perfectsRun * 3;
      const coinGain = Math.floor(this.totalCatchesRun / 5);
      this.hub.reportRunEnd({ xpGain, coinGain });

      if (gd.lifetimeCatches >= 100) Ach.unlock('nakha_lifetime_100');
      if (gd.totalRuns >= 50) Ach.unlock('nakha_runs_50');

      this.taunt = this.pickTaunt();
      this.objects.length = 0;
    },

    pickTaunt() {
      let pool;
      if (this.wasGoldJustBefore) pool = TAUNTS.gold;
      else if (this.missReason === 'bad') pool = TAUNTS.bad;
      else if (this.missReason === 'empty') pool = TAUNTS.empty;
      else pool = TAUNTS.drop;
      if (this.bestStreakRun >= 8 && Math.random() < 0.4) pool = pool.concat(TAUNTS.streak);
      return pool[(Math.random() * pool.length) | 0];
    },

    /* ---------------- render ---------------- */
    render(g) {
      const hub = this.hub, PAL = Theme.PAL, SEM = Theme.SEM, W = hub.W, H = hub.H;

      if (this.feverT > 0) {
        g.save();
        g.globalAlpha = 0.07 + 0.05 * Math.sin(performance.now() / 150);
        g.fillStyle = PAL.perfect;
        g.fillRect(0, 0, W, H);
        g.restore();
      }

      g.save();
      g.strokeStyle = 'rgba(245,247,250,0.12)'; g.lineWidth = 1;
      for (let l = 1; l < 3; l++) {
        const x = this.laneW * l;
        g.beginPath(); g.moveTo(x, this.playTop); g.lineTo(x, this.playBottom); g.stroke();
      }
      g.restore();

      const n = this.catches;
      const speedNow = this.fallDistance / this.crossingTime(n);
      const goodH = this.goodWin(n) * speedNow;
      let perfWinV = this.perfectWin(n); if (this.feverT > 0) perfWinV *= 1.2;
      const perfH = perfWinV * speedNow;
      const zTop = this.catchCenterY - goodH / 2, zBot = this.catchCenterY + goodH / 2;
      const pTop = this.catchCenterY - perfH / 2, pBot = this.catchCenterY + perfH / 2;
      for (let l = 0; l < 3; l++) {
        const x0 = this.laneW * l + 4, w = this.laneW - 8;
        g.save();
        g.beginPath(); g.roundRect(x0, zTop, w, zBot - zTop, 8);
        g.fillStyle = this.feverT > 0 ? 'rgba(255,201,64,0.14)' : 'rgba(57,197,232,0.10)';
        g.fill();
        g.beginPath(); g.roundRect(x0, pTop, w, pBot - pTop, 5);
        g.globalAlpha = 0.30; g.fillStyle = PAL.perfect; g.fill();
        g.globalAlpha = 0.55; g.strokeStyle = PAL.perfect; g.lineWidth = 1.5; g.stroke();
        g.globalAlpha = 1;
        g.beginPath(); g.moveTo(x0, this.catchCenterY); g.lineTo(x0 + w, this.catchCenterY);
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1; g.stroke();
        g.restore();
      }

      for (const o of this.objects) this.drawObject(g, o);

      FX.renderParticles(g);
      FX.renderPops(g, U.FONT);
      FX.renderBanners(g, U.FONT, hub.CX, this.playTop + 60);
      FX.renderStamps(g, U.FONT, hub.CX, hub.CY);

      if (this.phase === 'play') this.renderHud(g);
      else if (this.phase === 'results') this.renderResults(g);
    },

    drawObject(g, o) {
      const x = this.laneCenterX(o.lane), y = o.y, r = o.r;
      g.save();
      if (o.kind === 'good') {
        const color = o.gold ? Theme.PAL.perfect : U.mixColor(Theme.PAL.good, Theme.PAL.perfect, this.feverT > 0 ? 0.8 : 0.5);
        g.shadowBlur = o.gold ? 22 : 14; g.shadowColor = color;
        g.beginPath(); g.arc(x, y, r, 0, U.TAU); g.fillStyle = color; g.fill();
        g.shadowBlur = 0;
        g.beginPath(); g.arc(x, y, r * 0.55, 0, U.TAU);
        g.strokeStyle = 'rgba(10,14,26,0.35)'; g.lineWidth = 2; g.stroke();
        if (o.gold) {
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5;
          g.beginPath(); g.arc(x, y, r * 0.8, 0, U.TAU); g.stroke();
        }
      } else {
        const color = Theme.SEM.miss;
        g.shadowBlur = 12; g.shadowColor = color;
        g.fillStyle = color;
        g.beginPath();
        const spikes = 8;
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (Math.PI * i) / spikes;
          const rad = i % 2 === 0 ? r : r * 0.48;
          const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.fill();
        g.shadowBlur = 0;
      }
      g.restore();
    },

    renderHud(g) {
      const hub = this.hub, PAL = Theme.PAL, SEM = Theme.SEM;
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillStyle = SEM.gray; g.font = '600 11px ' + U.FONT;
      g.fillText('점수', 16, 28);
      g.fillStyle = PAL.ink; g.font = '800 22px ' + U.FONT;
      g.fillText(String(this.score), 16, 50);
      g.fillStyle = SEM.gray; g.font = '500 11px ' + U.FONT;
      g.fillText('최고 ' + this.gd.bestScore, 16, 66);

      g.textAlign = 'right';
      g.fillStyle = this.mult > 1 ? PAL.perfect : SEM.gray; g.font = '700 16px ' + U.FONT;
      g.fillText('x' + this.mult, hub.W - 16, 32);
      g.fillStyle = SEM.gray; g.font = '500 11px ' + U.FONT;
      g.fillText('연속 ' + this.streak, hub.W - 16, 48);
      if (this.feverT > 0) {
        g.fillStyle = PAL.perfect; g.font = '700 12px ' + U.FONT;
        g.fillText('피버 ' + this.feverT.toFixed(1) + 's', hub.W - 16, 66);
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
    },

    renderResults(g) {
      const hub = this.hub, PAL = Theme.PAL, SEM = Theme.SEM, W = hub.W, H = hub.H, CX = hub.CX, CY = hub.CY;
      g.save();
      g.fillStyle = 'rgba(5,7,14,0.72)';
      g.fillRect(0, 0, W, H);

      const panelW = Math.min(320, W - 48), panelH = 260;
      const px = CX - panelW / 2, py = CY - panelH / 2;
      g.beginPath(); g.roundRect(px, py, panelW, panelH, 18);
      g.fillStyle = 'rgba(20,24,38,0.92)'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(245,247,250,0.15)'; g.stroke();

      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = SEM.miss; g.font = '800 22px ' + U.FONT;
      g.fillText('게임 종료', CX, py + 40);

      g.fillStyle = PAL.ink; g.font = '900 34px ' + U.FONT;
      g.fillText(String(this.score), CX, py + 90);
      g.fillStyle = SEM.gray; g.font = '600 13px ' + U.FONT;
      g.fillText('최고 ' + this.gd.bestScore, CX, py + 116);

      g.fillStyle = PAL.ink; g.font = '500 14px ' + U.FONT;
      wrapText(g, this.taunt, CX, py + 152, panelW - 40, 18);

      const ready = this.resultsT >= 0.35;
      g.globalAlpha = ready ? (0.6 + 0.4 * Math.sin(performance.now() / 220)) : 0.35;
      g.fillStyle = PAL.perfect; g.font = '700 15px ' + U.FONT;
      g.fillText('탭해서 다시 시작', CX, py + panelH - 30);
      g.globalAlpha = 1;
      g.restore();
      g.textAlign = 'center'; g.textBaseline = 'middle';
    },

    onPointer(x, y, down) {
      if (!down) return;
      if (this.phase === 'results') {
        if (this.resultsT >= 0.35) this.startRun();
        return;
      }
      if (this.phase !== 'play') return;
      const laneW = this.hub.W / 3;
      let lane = Math.floor(x / laneW);
      lane = U.clamp(lane, 0, 2);
      this.handleTap(lane);
    },

    onKey(e) {},

    summary() {
      const gd = Save.gameData('nakha', { bestScore: 0, bestStreak: 0, lifetimeCatches: 0, totalRuns: 0 });
      return gd.bestScore > 0 ? '최고 ' + gd.bestScore : '';
    },
  };
})();

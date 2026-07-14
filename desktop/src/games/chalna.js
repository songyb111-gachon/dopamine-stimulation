'use strict';
/* ================================================================
   games/chalna.js — 찰나 (CHALNA), the flagship timing game, ported onto
   the arcade's shared core (audio/particles/theme/save/achievements).
   Geometry/scoring/difficulty formulas are unchanged from the standalone
   web build; only persistence, cosmetics, audio primitives, and top-level
   navigation now go through the shared hub instead of owning them locally.
   All angles in degrees; 0° = 12 o'clock, clockwise positive.
   ================================================================ */
window.Games = window.Games || {};

(() => {
  const U = window.Util, A = window.CoreAudio, SFX = window.SFX, FX = window.FX, Theme = window.Theme, Save = window.Save, Ach = window.Achievements;
  const { TAU, clamp, lerp, rand, norm360, signedDelta, rad, backOut, easeOut, FONT, hashStr, mulberry32, kstDateStr, drawTabular, mixColor } = U;

  // semantic extras not covered by Theme.SEM (fever pink, decoy gray) — CHALNA-only
  const COL_FEVER = '#FF6AD5', COL_DECOY = '#4C6270';

  const S = {
    title: '찰나', tagline: '0.03초의 완벽을 쫓아라',
    tapRestart: '탭해서 다시 시작', hint: '바늘이 금색 띠를 지날 때, 탭!',
    perfect: '퍼펙트!', streak: n => '퍼펙트 x' + n, good: '굿',
    plus: n => '+' + n, foregone: n => '-' + n + ' 놓침',
    nearPerfect: n => '퍼펙트까지 ' + n + 'ms!',
    missLate: s => s + '초 늦었어요!', missEarly: s => s + '초 빨랐어요!',
    fever: '피버!', goldHit: '골드 x3!', milestone: n => n + '타!',
    toBest: n => '최고까지 ' + n + '점', newRecord: '신기록!',
    lblScore: '점수', lblBest: '최고 점수', lblBestStreak: '최고 연속 퍼펙트', lblLifetime: '누적 퍼펙트',
    newFlare: 'NEW!',
    menuClassic: '클래식', menuDaily: '데일리 챌린지', menuZen: '젠 모드',
    lockedLv: n => 'Lv.' + n + ' 해금',
    zenTimeLeft: n => '젠 · ' + n + '초',
    lvLabel: n => 'Lv.' + n, coinsLabel: n => '코인 ' + n,
    decoyTaunt: '미끼 아크에 속았다!', decoyMissMsg: '미끼였어요!',
    chainClear: '체인 완성!',
    resultReward: (xp, coins) => 'XP +' + xp + '   코인 +' + coins,
    zenTimeUp: '시간 종료!', zenResultBest: '젠 모드 최고',
    dailyResultBest: '오늘의 최고', dailyStreakLine: n => n + '일 연속 도전',
  };

  const ACH_NAMES = {
    chalna_first_perfect: '찰나: 첫 퍼펙트', chalna_streak_10: '찰나: 퍼펙트 x10', chalna_streak_20: '찰나: 퍼펙트 x20',
    chalna_fever_first: '찰나: 첫 피버', chalna_gold_first: '찰나: 첫 골드', chalna_chain_clear: '찰나: 체인 클리어',
    chalna_decoy_fooled: '찰나: 미끼에 낚임', chalna_lifetime_100: '찰나: 누적 퍼펙트 100', chalna_lifetime_1000: '찰나: 누적 퍼펙트 1000',
    chalna_runs_50: '찰나: 50판 플레이', chalna_near_miss_1ms: '찰나: 1ms 아쉬움', chalna_daily_first_play: '찰나: 데일리 첫 도전',
    chalna_daily_streak_7: '찰나: 데일리 7일 연속', chalna_zen_complete: '찰나: 젠 모드 완주', chalna_record_x5: '찰나: 신기록 5회',
  };

  const CST_MENU = 0, CST_PLAY = 1, CST_DYING = 2, CST_OVER = 3;
  let cstate = CST_MENU;
  let mode = 'classic'; // classic | daily | zen

  let hub = null, save = null; // save = Save.gameData('chalna', {...}), CHALNA-only fields

  let needle = 0, dir = 1;
  let arc = null, decoy = null, lastGold = false;
  let travelSinceSpawn = 0, arcAge = 0;
  let hits = 0, score = 0, streak = 0;
  let runMaxStreak = 0, runPerfects = 0, runChainClears = 0;
  let startBest = 0, startBestStreak = 0;
  let recordBroken = false, scoreGold = false;
  let fever = false, feverT = 0, feverMix = 0, feverSend = null;
  let hitStop = 0, shakeT = 0, shakeMag = 0;
  let pulsePhase = 0, clickAcc = 0;
  let nearMsgCd = 0, hbTimer = 0, hbOn = false;
  let grace = 0, speedEase = 1;
  let streakPunchT = 0, streakDeflateT = 0;
  let inputLockUntil = 0;
  let trail = [];
  let chainLinksLeft = 0, chainPerfects = 0, chainTotal = 0;
  let zenTimeLeft = 60;
  let runElapsed = 0;
  let liveGhost = [], ghostRecordAcc = 0, ghostPlaybackIdx = 0;
  let lastRunXP = 0, lastRunCoins = 0;
  let RNG = Math.random;
  const randR = (a, b) => a + RNG() * (b - a);

  let frags = [], flashes = []; // CHALNA-only entity lists (arc shatter / miss-edge flash)

  let dieT = 0, ghostAngle = 0, missSecs = 0, missLate = false, missArcGold = false, missEdgeMs = 0, deathReason = 'edge';
  let panelT = 0, countT = 0, countDone = false, shownScore = 0, lastBlip = -1;
  let tauntText = '', newBest = false, newBestStreak = false, confettiFired = false;

  let lastNow = performance.now();
  let timeScale = 1;

  function compact(arr, keepFn) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) if (keepFn(arr[i])) arr[w++] = arr[i];
    arr.length = w;
  }

  const mult = st => st >= 15 ? 5 : st >= 10 ? 4 : st >= 6 ? 3 : st >= 3 ? 2 : 1;
  const omega = n => Math.min(200 + 7 * Math.max(0, n - 3), 460);
  const goodW = n => Math.max(42 - 0.5 * Math.max(0, n - 3), omega(n) * 0.070);
  const perfW = n => Math.max(goodW(n) * 0.28, omega(n) * 0.030);
  function effPerfW() {
    const base = arc.p * (fever ? 1.2 : 1);
    if (arc.mod === 'shrink') {
      const frac = clamp(travelSinceSpawn / Math.max(1, arc.dist0), 0, 1);
      return lerp(arc.p * 1.35, arc.p * 0.65, frac) * (fever ? 1.2 : 1);
    }
    return base;
  }
  function arcCenterNow() {
    if (!arc) return 0;
    if (arc.mod === 'wobble') return norm360(arc.center0 + 5 * Math.sin(TAU * arc.wFreq * arcAge + arc.wPhase));
    return arc.center;
  }

  function isWobbleUnlocked() { return Save.data.level >= 3; }
  function isShrinkUnlocked() { return Save.data.level >= 5; }
  function isDecoyUnlocked() { return Save.data.level >= 8; }
  function isChainUnlocked() { return Save.data.level >= 12; }
  function isDailyUnlocked() { return Save.data.level >= 2; }

  function pickTaunt(missEdge) {
    if (hits % 10 === 9) return '한 타만 더 하면 ' + (hits + 1) + '타였는데...';
    if (streak >= 6 && streak < 8) return '피버 직전이었는데!';
    if (missEdge <= 20) return '한 끗 차이... 겨우 ' + Math.max(1, Math.round(missEdge)) + 'ms!';
    if (missArcGold) return '골드 욕심이 과했나?';
    if (startBest > 0 && score < startBest && score >= 0.9 * startBest)
      return '최고 기록까지 단 ' + (startBest - score) + '점!';
    if (streak >= 10) return '연속 퍼펙트 ' + streak + '에서... 아깝다!';
    if (hits < 5) return '워밍업은 끝났죠?';
    return '다시 하면 넘길 수 있어요';
  }

  function spawnChainLink() {
    const n = hits;
    const dist0 = randR(40, 70);
    arc = { center: norm360(needle + dir * dist0), w: goodW(n) * 0.6, p: perfW(n), gold: false, mod: 'chain', dist0, center0: 0, wFreq: 0, wPhase: 0 };
    decoy = null;
    travelSinceSpawn = 0; arcAge = 0;
  }

  function spawnArc() {
    decoy = null;
    const n = hits;

    if (chainLinksLeft === 0 && n >= 15 && isChainUnlocked() && RNG() < 0.10) {
      chainLinksLeft = 3; chainPerfects = 0; chainTotal = 0;
      spawnChainLink();
      return;
    }

    let mod = null, gold = false;
    if (n >= 10 && !lastGold && RNG() < 1 / 8) gold = true;
    else if (n >= 6 && isWobbleUnlocked() && RNG() < 0.20) mod = 'wobble';
    else if (n >= 6 && isShrinkUnlocked() && RNG() < 0.20) mod = 'shrink';
    else if (n >= 10 && isDecoyUnlocked() && RNG() < 0.25) mod = 'decoy';
    lastGold = gold;

    const dist0 = randR(100, 260);
    const center = norm360(needle + dir * dist0);
    arc = {
      center, w: goodW(n), p: perfW(n), gold, mod, dist0,
      center0: center, wFreq: 1.1 + 0.02 * Math.min(n, 40), wPhase: RNG() * TAU,
    };
    travelSinceSpawn = 0; arcAge = 0;

    if (mod === 'wobble') { A.tone('sine', 300, 0, 0.02, 0.5, 0.05); A.tone('sine', 306, 0, 0.02, 0.5, 0.05); }
    if (mod === 'shrink') A.tone('triangle', 900, 1400, 0.01, 0.35, 0.08);

    if (mod === 'decoy') {
      const dWidth = goodW(n) * 0.75;
      let dCenter = 0, ok = false;
      for (let tries = 0; tries < 5; tries++) {
        dCenter = norm360(needle + dir * randR(35, 70));
        if (Math.abs(signedDelta(dCenter, center)) >= (dWidth + arc.w) / 2 + 12) { ok = true; break; }
      }
      if (ok) decoy = { center: dCenter, w: dWidth };
      else arc.mod = null;
    }
  }

  function startRun(m) {
    mode = m || 'classic';
    cstate = CST_PLAY;
    score = 0; hits = 0; streak = 0; runMaxStreak = 0; runPerfects = 0; runChainClears = 0;
    startBest = save.bestScore; startBestStreak = save.bestStreak;
    recordBroken = false; scoreGold = false;
    fever = false; feverT = 0; feverMix = 0;
    hitStop = 0; shakeT = 0; pulsePhase = 0; clickAcc = 0;
    nearMsgCd = 0; hbTimer = 0; hbOn = false;
    grace = 0; speedEase = 1; lastGold = false;
    streakPunchT = 0; streakDeflateT = 0;
    chainLinksLeft = 0; chainPerfects = 0; chainTotal = 0;
    zenTimeLeft = 60; runElapsed = 0;
    liveGhost = []; ghostRecordAcc = 0; ghostPlaybackIdx = 0;
    trail = []; frags = []; flashes = [];
    FX.reset();

    RNG = mode === 'daily' ? mulberry32(hashStr('chalna-' + kstDateStr())) : Math.random;
    dir = RNG() < 0.5 ? 1 : -1;
    if (mode === 'daily') Ach.unlock('chalna_daily_first_play');

    spawnArc();
  }

  const tipX = (a, CX, R) => CX + Math.cos(rad(a)) * R;
  const tipY = (a, CY, R) => CY + Math.sin(rad(a)) * R;

  function checkRecord(CX, CY, R) {
    if (mode !== 'classic') return;
    const PAL = Theme.PAL;
    if (!recordBroken && startBest > 0 && score > startBest) {
      recordBroken = true; scoreGold = true;
      save.bestScore = score; save.recordBreaks = (save.recordBreaks || 0) + 1; Save.write();
      FX.pushBanner(S.newRecord, PAL.perfect, 1.6, 34);
      SFX.sShimmer();
      if (save.recordBreaks >= 5) Ach.unlock('chalna_record_x5');
      for (let i = 0; i < 40; i++) FX.burst(CX, CY - R - 20, 1, PAL.perfect, 260, 1);
    } else if (recordBroken && score > save.bestScore) {
      save.bestScore = score; Save.write();
    } else if (startBest === 0 && score > save.bestScore) {
      save.bestScore = score; Save.write();
    }
  }

  function startFever() {
    fever = true; feverT = 6;
    if (feverSend) feverSend.wet.gain.setTargetAtTime(0.35, A.context.currentTime, 0.05);
    A.tone('sine', 160, 60, 0.01, 0.4, 0.35); A.noise(0.3, 0.12, 'bandpass', 400, 4000);
    Ach.unlock('chalna_fever_first');
    FX.pushStamp(S.fever, COL_FEVER, 1.0, 64);
  }
  function endFever() {
    fever = false;
    if (feverSend) feverSend.wet.gain.setTargetAtTime(0, A.context.currentTime, 0.1);
  }

  function bookkeepHit(CX, CY, R) {
    hits++;
    if (hits % 10 === 0) {
      score += 50;
      FX.pushBanner(S.milestone(hits), Theme.SEM.white, 1.1, 30);
      FX.popup(S.plus(50), CX, CY - R * 0.45, 22, Theme.SEM.white, 0);
      SFX.sMilestone();
    }
    checkRecord(CX, CY, R);
  }

  function chainFinisherBonus(CX, CY) {
    const PAL = Theme.PAL;
    const bonus = 150 * mult(streak);
    score += bonus;
    FX.popup(S.chainClear, CX, CY - 40, 30, PAL.perfect, 1);
    FX.popup(S.plus(bonus), CX, CY, 28, PAL.perfect, 1);
    A.tone('sine', 660, 0, 0.006, 0.18, 0.2);
    setTimeout(() => A.tone('sine', 880, 0, 0.006, 0.18, 0.2), 90);
    setTimeout(() => A.tone('sine', 1320, 0, 0.006, 0.35, 0.22), 180);
    A.tone('sine', 1980, 0, 0.01, 0.4, 0.08);
    Ach.unlock('chalna_chain_clear');
    runChainClears++;
    FX.burst(CX, CY, 60, PAL.perfect, 420, 0);
    FX.pushWave();
  }

  function doPerfect(CX, CY, R) {
    const PAL = Theme.PAL;
    const gold = arc.gold;
    const isChain = arc.mod === 'chain';
    const pts = 25 * mult(streak) * (fever ? 2 : 1) * (gold ? 3 : 1);
    score += pts;
    streak++;
    streakPunchT = 0.15;
    runMaxStreak = Math.max(runMaxStreak, streak);
    runPerfects++; save.lifetimePerfects = (save.lifetimePerfects || 0) + 1;
    if (save.lifetimePerfects === 1) Ach.unlock('chalna_first_perfect');
    if (save.lifetimePerfects === 100) Ach.unlock('chalna_lifetime_100');
    if (save.lifetimePerfects === 1000) Ach.unlock('chalna_lifetime_1000');
    if (streak === 10) Ach.unlock('chalna_streak_10');
    if (streak === 20) Ach.unlock('chalna_streak_20');
    if (gold) Ach.unlock('chalna_gold_first');

    const notReduced = !Save.data.settings.reduceMotion;
    if (notReduced) { hitStop = 0.04; shakeT = 0.12; shakeMag = 12; }
    const cNow = arcCenterNow();
    const tx = tipX(needle, CX, R), ty = tipY(needle, CY, R);
    FX.burst(tx, ty, 24, PAL.perfect, 340, 0);
    FX.pushWave();
    if (notReduced) for (let i = 0; i < 3; i++)
      frags.push({ a0: cNow - arc.w / 2 + (i * arc.w) / 3, span: arc.w / 3, r: R, vr: rand(40, 120), va: rand(-90, 90), t: 0 });
    FX.popup(S.plus(pts), tx, ty - 26, 26, gold ? PAL.perfect : Theme.SEM.white, 1);
    FX.popup(S.perfect, CX, CY - R * 0.15, 32, PAL.perfect, 1);
    if (gold) FX.popup(S.goldHit, CX, CY - R * 0.30, 30, PAL.perfect, 1);
    const semis = Math.min(streak, 24);
    const f = 523.25 * Math.pow(2, semis / 12);
    A.tone('sine', f, 0, 0.008, 0.2, 0.26);
    A.tone('triangle', f, 0, 0.008, 0.2, 0.12);
    if (streak > 0 && streak % 5 === 0) A.tone('sine', f * 1.5, 0, 0.008, 0.2, 0.26 * 0.158);
    A.noise(0.03, 0.15, 'highpass', 3000, 0);
    if (gold) { A.tone('sine', f * 2, 0, 0.008, 0.25, 0.12); A.tone('sine', 1320, 0, 0.005, 0.3, 0.08); }
    A.buzz(10);
    if (streak % 8 === 0) startFever();
    bookkeepHit(CX, CY, R);

    if (isChain) {
      chainPerfects++; chainTotal++;
      A.tone('sine', 880 + chainTotal * 110, 0, 0.005, 0.12, 0.14);
      chainLinksLeft--;
      if (chainLinksLeft > 0) { spawnChainLink(); return; }
      if (chainPerfects === 3) chainFinisherBonus(CX, CY);
      dir = -dir; spawnArc();
      return;
    }
    dir = -dir; spawnArc();
  }

  function doGood(absD, CX, CY, R) {
    const prevStreak = streak;
    const pre = mult(streak);
    const pts = 10 * pre * (fever ? 2 : 1);
    const perfectWouldPay = 25 * pre * (fever ? 2 : 1) * (arc.gold ? 3 : 1);
    const w = omega(hits) * Math.max(speedEase, 0.01);
    const msToPerf = (absD - effPerfW() / 2) / w * 1000;
    score += pts;
    streak = 0;
    if (prevStreak > 0) streakDeflateT = 0.12;
    const tx = tipX(needle, CX, R), ty = tipY(needle, CY, R);
    FX.burst(tx, ty, 8, Theme.SEM.goodFx, 180, 0);
    FX.popup(S.good, tx, ty - 44, 18, Theme.SEM.goodFx, 0);
    FX.popup(S.plus(pts), tx, ty - 22, 20, Theme.SEM.goodFx, 0);
    FX.popup(S.foregone(perfectWouldPay), tx, ty + 6, 15, Theme.SEM.gray, 0);
    if (msToPerf <= 15 && nearMsgCd <= 0) {
      FX.popup(S.nearPerfect(Math.max(1, Math.round(msToPerf))), CX, CY - R * 0.55, 24, '#FFE9AF', 1);
      if (msToPerf <= 1) Ach.unlock('chalna_near_miss_1ms');
      nearMsgCd = 3;
    }
    SFX.sGood();
    bookkeepHit(CX, CY, R);

    if (arc.mod === 'chain') chainLinksLeft = 0;
    dir = -dir; spawnArc();
  }

  function doZenMiss(CX, CY, R) {
    streak = 0;
    const tx = tipX(needle, CX, R), ty = tipY(needle, CY, R);
    FX.popup('아쉬워요', tx, ty - 30, 18, Theme.SEM.miss, 0);
    SFX.sSoftFail(); A.buzz(8);
    bookkeepHit(CX, CY, R);
    if (arc.mod === 'chain') chainLinksLeft = 0;
    dir = -dir; spawnArc();
  }

  function finalizeRunRewards() {
    save.totalRuns = (save.totalRuns || 0) + 1;
    const xpGain = Math.floor(score / 8) + runPerfects * 3 + runChainClears * 10;
    const factor = mode === 'zen' ? 0.4 : 1;
    lastRunXP = Math.floor(xpGain * factor);
    lastRunCoins = Math.floor(hits / 5);
    hub.reportRunEnd({ xpGain: lastRunXP, coinGain: lastRunCoins });
    if (mode === 'daily') {
      const today = kstDateStr();
      const prev = save.dailyBestByDate[today] || 0;
      if (score > prev) save.dailyBestByDate[today] = score;
      updateDailyStreak(today);
    }
    if (mode === 'zen') save.zenBest = Math.max(save.zenBest || 0, score);
    if (save.totalRuns === 50) Ach.unlock('chalna_runs_50');
    Save.write();
  }

  function updateDailyStreak(today) {
    if (save.lastDailyDate === today) return;
    if (save.lastDailyDate) {
      const prev = new Date(save.lastDailyDate + 'T00:00:00Z');
      const cur = new Date(today + 'T00:00:00Z');
      const diffDays = Math.round((cur - prev) / 86400000);
      save.dailyStreak = diffDays === 1 ? (save.dailyStreak || 0) + 1 : 1;
    } else {
      save.dailyStreak = 1;
    }
    save.lastDailyDate = today;
    if (save.dailyStreak >= 7) Ach.unlock('chalna_daily_streak_7');
  }

  function doMiss(signedOffset, reason) {
    reason = reason || 'edge';
    deathReason = reason;
    if (reason === 'edge') {
      const w = omega(hits) * Math.max(speedEase, 0.01);
      missSecs = Math.abs(signedOffset) / w;
      missLate = signedOffset > 0;
      missEdgeMs = (Math.abs(signedOffset) - arc.w / 2) / w * 1000;
      if (Math.abs(signedOffset) <= 1.5 * arc.w)
        flashes.push({ ang: arc.center + dir * Math.sign(signedOffset || 1) * arc.w / 2, t: 0 });
      tauntText = pickTaunt(missEdgeMs);
    } else {
      missSecs = 0; missLate = true; missEdgeMs = 999;
      flashes.push({ ang: decoy ? decoy.center : needle, t: 0 });
      tauntText = S.decoyTaunt;
    }
    missArcGold = arc.gold;
    ghostAngle = needle;
    endFever();
    if (reason === 'decoy') {
      A.tone('square', 500, 200, 0.005, 0.15, 0.16); A.tone('square', 260, 120, 0.005, 0.2, 0.12); A.noise(0.1, 0.1, 'bandpass', 1200, 400);
      Ach.unlock('chalna_decoy_fooled');
    } else { SFX.sMiss(); }
    A.buzz(20);
    newBest = mode === 'classic' && score > startBest;
    newBestStreak = mode === 'classic' && runMaxStreak > startBestStreak;
    if (mode === 'classic') {
      save.bestScore = Math.max(save.bestScore || 0, score);
      save.bestStreak = Math.max(save.bestStreak || 0, runMaxStreak);
      if (newBest) save.ghost = liveGhost.slice();
    }
    finalizeRunRewards();
    cstate = CST_DYING; dieT = 0;
  }

  function doZenTimeUp() {
    newBest = false; newBestStreak = false;
    finalizeRunRewards();
    Ach.unlock('chalna_zen_complete');
    tauntText = S.zenTimeUp;
    cstate = CST_OVER; panelT = 0; countT = 0; countDone = false;
    shownScore = 0; lastBlip = -1; confettiFired = false;
  }

  function ghostAngleAt(t) {
    const gh = save.ghost;
    if (!gh || gh.length < 2) return null;
    while (ghostPlaybackIdx < gh.length - 2 && gh[ghostPlaybackIdx + 1].t < t) ghostPlaybackIdx++;
    const a = gh[ghostPlaybackIdx], b = gh[Math.min(ghostPlaybackIdx + 1, gh.length - 1)];
    if (t > b.t) return null;
    const span = b.t - a.t;
    const f = span > 0 ? clamp((t - a.t) / span, 0, 1) : 0;
    const d = signedDelta(b.a, a.a);
    return norm360(a.a + d * f);
  }

  function getR(W, H) { return Math.max(80, Math.min(0.36 * Math.min(W, H), H / 2 - 150)); }

  function getMenuCardRects(CX, CY, R, W, H) {
    const cardW = Math.min(340, W - 48), cardH = 50, gap = 10;
    const total = 3 * cardH + 2 * gap;
    const startY = Math.max(CY + R * 0.35, H - total - 96);
    const x = CX - cardW / 2;
    return [
      { id: 'classic', label: S.menuClassic, x, y: startY, w: cardW, h: cardH, locked: false, lv: 1 },
      { id: 'daily', label: S.menuDaily, x, y: startY + (cardH + gap), w: cardW, h: cardH, locked: !isDailyUnlocked(), lv: 2 },
      { id: 'zen', label: S.menuZen, x, y: startY + 2 * (cardH + gap), w: cardW, h: cardH, locked: false, lv: 1 },
    ];
  }

  function judge(CX, CY, R) {
    const t = performance.now();
    const el = clamp((t - lastNow) / 1000, 0, 0.05);
    const advance = dir * omega(hits) * speedEase * timeScale * el;
    needle = norm360(needle + advance);
    travelSinceSpawn += Math.abs(advance);
    lastNow = t;

    const center = arcCenterNow();
    const P = effPerfW();
    const dRaw = signedDelta(needle, center);
    const absD = Math.abs(dRaw);

    if (absD <= P / 2) { doPerfect(CX, CY, R); return; }
    if (absD <= arc.w / 2) { doGood(absD, CX, CY, R); return; }

    if (decoy) {
      const dd = Math.abs(signedDelta(needle, decoy.center));
      if (dd <= decoy.w / 2) {
        if (mode === 'zen') doZenMiss(CX, CY, R);
        else doMiss(travelSinceSpawn - arc.dist0, 'decoy');
        return;
      }
    }

    const signedOffset = travelSinceSpawn - arc.dist0;
    if (mode === 'zen') doZenMiss(CX, CY, R);
    else doMiss(signedOffset, 'edge');
  }

  function onTap(x, y, fromPointer) {
    const CX = hub.CX, CY = hub.CY, W = hub.W, H = hub.H, R = getR(W, H);
    if (grace > 0) return;
    const now = performance.now();
    if (now < inputLockUntil) return;

    if (cstate === CST_MENU) {
      if (!fromPointer) { startRun('classic'); return; }
      const cards = getMenuCardRects(CX, CY, R, W, H);
      for (const c of cards) {
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
          if (c.locked) { SFX.sClick(); return; }
          startRun(c.id); inputLockUntil = now + 50; return;
        }
      }
      return;
    }
    if (cstate === CST_PLAY) { judge(CX, CY, R); inputLockUntil = now + 50; return; }
    if (cstate === CST_OVER) {
      if (panelT < 0.4) return;
      if (!countDone) { countDone = true; shownScore = score; inputLockUntil = now + 50; return; }
      startRun(mode); inputLockUntil = now + 50;
    }
  }

  function update(dt) {
    const CX = hub.CX, CY = hub.CY, W = hub.W, H = hub.H, R = getR(W, H);

    if (hitStop > 0) hitStop -= dt;
    timeScale = hitStop > 0 ? 0 : (cstate === CST_DYING ? 0.25 : 1);
    const sdt = dt * timeScale;

    if (nearMsgCd > 0) nearMsgCd -= dt;
    if (shakeT > 0) shakeT -= dt;
    if (streakPunchT > 0) streakPunchT -= dt;
    if (streakDeflateT > 0) streakDeflateT -= dt;
    feverMix += ((fever ? 1 : 0) - feverMix) * Math.min(1, dt * 8);

    if (cstate === CST_MENU) {
      needle = norm360(needle + 40 * dt);
    } else if (cstate === CST_PLAY) {
      if (grace > 0) {
        grace -= dt;
      } else {
        if (speedEase < 1) speedEase = Math.min(1, speedEase + dt / 0.3);
        const advance = dir * omega(hits) * speedEase * sdt;
        needle = norm360(needle + advance);
        travelSinceSpawn += Math.abs(advance);
        arcAge += sdt;
        runElapsed += sdt;
        if (mode === 'zen') {
          zenTimeLeft -= sdt;
          if (zenTimeLeft <= 0) { zenTimeLeft = 0; doZenTimeUp(); }
        }
        if (mode === 'classic') {
          ghostRecordAcc += sdt;
          if (ghostRecordAcc >= 0.05) {
            ghostRecordAcc -= 0.05;
            if (liveGhost.length < 2400) liveGhost.push({ t: Math.round(runElapsed * 1000) / 1000, a: needle });
          }
        }
      }
      if (fever && grace <= 0) { feverT -= sdt; if (feverT <= 0) endFever(); }
      if (arc) {
        const cNow = arcCenterNow();
        const distAhead = norm360((cNow - needle) * dir);
        const tta = Math.max(0.001, distAhead / (omega(hits) * Math.max(speedEase, 0.01)));
        pulsePhase += clamp(1 / tta, 1, 12) * sdt * TAU;
        if (grace <= 0 && timeScale > 0) {
          clickAcc += clamp(1 / tta, 2, 16) * sdt;
          if (clickAcc >= 1) { clickAcc -= 1; SFX.sClick(); }
        }
      }
      if (fever) { trail.unshift(needle); if (trail.length > 10) trail.pop(); }
      else if (trail.length) trail.pop();
      hbOn = mode === 'classic' && startBest > 0 && !recordBroken && score >= 0.85 * startBest;
      if (hbOn) { hbTimer += dt; if (hbTimer >= 0.6) { hbTimer -= 0.6; A.tone('sine', 55, 0, 0.01, 0.09, 0.16); setTimeout(() => A.tone('sine', 55, 0, 0.01, 0.09, 0.12), 100); } }
    } else if (cstate === CST_DYING) {
      dieT += dt;
      needle = norm360(needle + dir * omega(hits) * sdt);
      if (dieT >= 0.6) {
        cstate = CST_OVER; panelT = 0; countT = 0; countDone = false;
        shownScore = 0; lastBlip = -1; confettiFired = false;
      }
    } else if (cstate === CST_OVER) {
      panelT += dt;
      if (!countDone) {
        countT += dt;
        const f = easeOut(clamp(countT / 0.7, 0, 1));
        shownScore = Math.round(score * f);
        const blipIdx = Math.floor(countT / 0.06);
        if (blipIdx !== lastBlip && panelT > 0.25 && shownScore > 0) { lastBlip = blipIdx; SFX.sBlip(blipIdx); }
        if (countT >= 0.7) { countDone = true; shownScore = score; }
      }
      if (countDone && !confettiFired) {
        confettiFired = true;
        if ((newBest || newBestStreak) && !Save.data.settings.reduceMotion) {
          for (let i = 0; i < 40; i++)
            FX.spawnP(rand(CX - 140, CX + 140), H - Math.min(420, H * 0.62) + 20, rand(-80, 80), rand(-320, -120), rand(0.8, 1.4), rand(3, 6), Math.random() < 0.5 ? Theme.PAL.perfect : Theme.SEM.white, 1);
        }
      }
    }

    const edt = cstate === CST_OVER ? dt : sdt;
    compact(frags, fr => { fr.t += edt; fr.r += fr.vr * edt; fr.a0 += fr.va * edt; return fr.t < 0.5; });
    compact(flashes, fl => (fl.t += dt) < 0.5);
    FX.update(dt, edt);
  }

  function arcStrokeF(g, CX, CY) {
    return (center, width, radius, lw, style, blur, blurColor) => {
      g.beginPath();
      g.arc(CX, CY, radius, rad(center - width / 2), rad(center + width / 2));
      g.lineWidth = lw; g.strokeStyle = style;
      if (blur) { g.shadowBlur = blur; g.shadowColor = blurColor || style; }
      g.stroke();
      g.shadowBlur = 0;
    };
  }

  function render(g) {
    const PAL = Theme.PAL;
    const CX = hub.CX, CY = hub.CY, W = hub.W, H = hub.H, R = getR(W, H);
    const arcStroke = arcStrokeF(g, CX, CY);
    const now = performance.now();

    if (shakeT > 0) {
      const m = shakeMag * (shakeT / 0.12) * (shakeT / 0.12);
      g.translate(rand(-m, m), rand(-m, m));
    }
    if (feverMix > 0.001) {
      const bg = mixColor(PAL.bg, PAL.bgHi, feverMix);
      g.fillStyle = bg;
      g.fillRect(-20, -20, W + 40, H + 40);
    }
    if (hbOn && cstate === CST_PLAY) {
      const pulse = 0.10 + 0.06 * Math.max(0, Math.sin(hbTimer / 0.6 * TAU));
      g.globalAlpha = pulse;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(-20, -20, W + 40, H + 40);
      g.globalAlpha = 1;
    }

    const inGame = cstate === CST_PLAY || cstate === CST_DYING || cstate === CST_OVER;

    if (inGame && mode === 'classic' && startBest > 0) {
      arcStroke(180, 360, R + 16, 4, 'rgba(255,255,255,0.07)');
      const frac = clamp(score / startBest, 0, 1);
      if (frac > 0)
        arcStroke(frac * 180, frac * 360, R + 16, 4, recordBroken ? PAL.perfect : 'rgba(245,247,250,0.55)', recordBroken ? 8 : 0);
      g.save();
      g.strokeStyle = PAL.perfect; g.lineWidth = 3;
      g.beginPath(); g.moveTo(CX, CY - R - 24); g.lineTo(CX, CY - R - 8); g.stroke();
      g.restore();
    }

    g.beginPath();
    g.arc(CX, CY, R, 0, TAU);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(245,247,250,0.12)';
    g.stroke();
    g.beginPath(); g.arc(CX, CY, 4, 0, TAU); g.fillStyle = 'rgba(245,247,250,0.5)'; g.fill();

    if (fever) {
      const ff = clamp(feverT / 6, 0, 1);
      arcStroke(ff * 180, ff * 360, R - 12, 3, COL_FEVER, 6);
    }

    if ((cstate === CST_PLAY || cstate === CST_DYING) && arc) {
      const lw = Math.max(14, R * 0.10);
      const cNow = arcCenterNow();
      const goodCol = arc.gold ? PAL.perfect : PAL.good;

      if (decoy) {
        g.save();
        g.setLineDash([9, 7]);
        arcStroke(decoy.center, decoy.w, R, lw * 0.8, COL_DECOY, 0);
        g.restore();
      }

      arcStroke(cNow, arc.w, R, lw, goodCol, 14, goodCol);
      const P = effPerfW();
      const pb = 0.72 + 0.28 * Math.sin(pulsePhase);
      g.globalAlpha = cstate === CST_DYING ? 0.6 : pb;
      arcStroke(cNow, P, R, lw + 6, arc.gold ? '#FFF3C4' : PAL.perfect, 18, PAL.perfect);
      g.globalAlpha = 1;
      if (arc.gold) {
        const t = now / 1000;
        for (let i = 0; i < 5; i++) {
          const sa = cNow - arc.w / 2 + ((t * 26 + i * 41) % arc.w);
          const al = 0.4 + 0.6 * Math.abs(Math.sin(t * 5 + i * 1.7));
          g.globalAlpha = al;
          g.fillStyle = '#FFFFFF';
          g.beginPath();
          g.arc(CX + Math.cos(rad(sa)) * R, CY + Math.sin(rad(sa)) * R, 1.8, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      if (arc.mod === 'chain') {
        for (let i = 0; i < 3; i++) {
          g.fillStyle = i < chainTotal ? PAL.perfect : 'rgba(245,247,250,0.25)';
          g.beginPath(); g.arc(CX - 20 + i * 20, CY - R - 66, 5, 0, TAU); g.fill();
        }
      }
    }

    if (frags.length) {
      g.save();
      for (const fr of frags) {
        g.globalAlpha = 1 - fr.t / 0.5;
        g.beginPath();
        g.arc(CX, CY, fr.r, rad(fr.a0), rad(fr.a0 + fr.span));
        g.lineWidth = 8; g.strokeStyle = PAL.perfect;
        g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
    }

    for (const fl of flashes) {
      g.globalAlpha = (1 - fl.t / 0.5) * (Math.floor(fl.t * 12) % 2 === 0 ? 1 : 0.3);
      arcStroke(fl.ang, 4, R, Math.max(18, R * 0.12), '#FFFFFF', 16);
      g.globalAlpha = 1;
    }

    FX.renderWaves(g, CX, CY, R);

    if (trail.length > 1) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 1; i < trail.length; i++) {
        g.globalAlpha = 0.35 * (1 - i / trail.length);
        g.beginPath();
        g.moveTo(CX, CY);
        g.lineTo(tipX(trail[i], CX, R), tipY(trail[i], CY, R));
        g.lineWidth = 2.5;
        g.strokeStyle = Theme.trailColor;
        g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
    }

    if (mode === 'classic' && cstate === CST_PLAY) {
      const ga = ghostAngleAt(runElapsed);
      if (ga !== null) {
        g.save();
        g.setLineDash([4, 5]); g.globalAlpha = 0.28; g.strokeStyle = '#9FB4FF'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(CX, CY); g.lineTo(tipX(ga, CX, R), tipY(ga, CY, R)); g.stroke();
        g.restore();
      }
    }

    const drawNeedle = (ang, alpha, color) => {
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = color; g.lineWidth = 3; g.lineCap = 'round';
      g.shadowBlur = 12; g.shadowColor = color;
      g.beginPath(); g.moveTo(CX, CY); g.lineTo(tipX(ang, CX, R), tipY(ang, CY, R)); g.stroke();
      g.restore();
    };
    if (cstate === CST_DYING) {
      drawNeedle(needle, 0.6, PAL.needle);
      if (Math.floor(dieT * 4) % 2 === 0) drawNeedle(ghostAngle, 0.4, Theme.SEM.miss);
    } else if (cstate === CST_MENU || cstate === CST_PLAY) {
      drawNeedle(needle, 1, PAL.needle);
    }

    FX.renderParticles(g);
    FX.renderPops(g, FONT);
    FX.renderBanners(g, FONT, CX, CY - R - 46);
    FX.renderStamps(g, FONT, CX, CY);

    if (cstate === CST_MENU) renderMenu(g, now, CX, CY, R, W, H);
    if (cstate === CST_PLAY || cstate === CST_DYING) renderHUD(g, CX, CY, R, W);
    if (cstate === CST_DYING) renderDying(g, CX, CY, R, W);
    if (cstate === CST_OVER) renderPanel(g, now, CX, CY, W, H);
  }

  function renderMenu(g, now, CX, CY, R, W, H) {
    const PAL = Theme.PAL;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = PAL.needle;
    const titleSize = Math.round(Math.min(88, W * 0.19));
    g.font = '900 ' + titleSize + 'px ' + FONT;
    g.shadowBlur = 30; g.shadowColor = PAL.good;
    g.fillText(S.title, CX, CY - R * 0.62);
    g.shadowBlur = 0;
    g.font = '400 16px ' + FONT;
    g.fillStyle = Theme.SEM.gray;
    g.fillText(S.tagline, CX, CY - R * 0.62 + titleSize * 0.62);

    g.font = '500 13px ' + FONT;
    g.fillStyle = 'rgba(245,247,250,0.7)';
    const ry = CY - R * 0.62 + titleSize * 0.62 + 34;
    g.fillText(S.lvLabel(Save.data.level) + '   ' + S.lblBest + ' ' + save.bestScore, CX, ry);
    if (!save.totalRuns) {
      g.fillStyle = PAL.perfect;
      g.font = '600 14px ' + FONT;
      g.fillText(S.hint, CX, ry + 22);
    }

    const cards = getMenuCardRects(CX, CY, R, W, H);
    for (const c of cards) {
      g.save();
      g.beginPath();
      g.roundRect(c.x, c.y, c.w, c.h, 14);
      g.fillStyle = c.locked ? 'rgba(245,247,250,0.05)' : 'rgba(245,247,250,0.10)';
      g.fill();
      if (!c.locked) { g.lineWidth = 1.5; g.strokeStyle = 'rgba(245,247,250,0.18)'; g.stroke(); }
      g.fillStyle = c.locked ? Theme.SEM.gray : PAL.needle;
      g.font = '700 19px ' + FONT;
      g.fillText(c.label, c.x + c.w / 2, c.y + c.h / 2 - (c.locked ? 8 : 0));
      if (c.locked) {
        g.font = '600 12px ' + FONT;
        g.fillStyle = PAL.good;
        g.fillText(S.lockedLv(c.lv), c.x + c.w / 2, c.y + c.h / 2 + 14);
      } else if (c.id === 'daily' && save.dailyStreak > 0) {
        g.font = '600 12px ' + FONT;
        g.fillStyle = PAL.perfect;
        g.fillText(S.dailyStreakLine(save.dailyStreak), c.x + c.w / 2, c.y + c.h - 10);
      }
      g.restore();
    }

    const pulse = 0.55 + 0.45 * Math.sin(now / 400);
    g.globalAlpha = pulse * 0.7;
    g.fillStyle = Theme.SEM.gray;
    g.font = '500 12px ' + FONT;
    g.fillText('↑ 모드를 선택하세요', CX, cards[0].y - 14);
    g.globalAlpha = 1;
  }

  function renderHUD(g, CX, CY, R, W) {
    const PAL = Theme.PAL;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = scoreGold ? PAL.perfect : PAL.needle;
    g.font = '800 44px ' + FONT;
    if (scoreGold) { g.shadowBlur = 14; g.shadowColor = PAL.perfect; }
    drawTabular(g, String(score), CX, 56);
    g.shadowBlur = 0;

    const m = mult(streak);
    if (cstate === CST_PLAY || cstate === CST_DYING) {
      let chipScale = 1;
      if (streakDeflateT > 0) chipScale = lerp(1.3, 1, easeOut(1 - streakDeflateT / 0.12));
      const chipX = CX + 28 + String(score).length * 13 + 24;
      g.save();
      g.translate(chipX, 56); g.scale(chipScale, chipScale); g.translate(-chipX, -56);
      g.fillStyle = m > 1 ? PAL.perfect : 'rgba(245,247,250,0.25)';
      g.beginPath();
      const cw = 44, ch = 25;
      g.roundRect(chipX - cw / 2, 56 - ch / 2, cw, ch, 12);
      g.fill();
      g.fillStyle = m > 1 ? '#1A1408' : Theme.SEM.gray;
      g.font = '800 15px ' + FONT;
      g.fillText('x' + m, chipX, 57);
      g.restore();
    }

    if (streak > 0) {
      let scale = 1;
      if (streakPunchT > 0) scale = 1 + 0.3 * Math.sin((1 - streakPunchT / 0.15) * Math.PI);
      g.save();
      g.translate(CX, 92); g.scale(scale, scale);
      g.fillStyle = PAL.perfect;
      g.font = '700 ' + Math.min(22 + streak, 36) + 'px ' + FONT;
      g.fillText(S.streak(streak), 0, 0);
      g.restore();
    }

    if (hbOn && cstate === CST_PLAY) {
      g.fillStyle = PAL.perfect;
      g.font = '600 14px ' + FONT;
      g.fillText(S.toBest(startBest - score), CX, streak > 0 ? 118 : 92);
    }

    if (mode === 'zen' && cstate === CST_PLAY) {
      g.textAlign = 'right';
      g.fillStyle = zenTimeLeft <= 10 ? Theme.SEM.miss : Theme.SEM.gray;
      g.font = '600 13px ' + FONT;
      g.fillText(S.zenTimeLeft(Math.ceil(zenTimeLeft)), W - 56, 30);
    }
    g.textAlign = 'center';
  }

  function renderDying(g, CX, CY, R, W) {
    const f = clamp(dieT / 0.6, 0, 1);
    g.fillStyle = 'rgba(90,96,110,' + (0.55 * f).toFixed(3) + ')';
    g.fillRect(-20, -20, W + 40, hub.H + 40);
    const tf = clamp(dieT / 0.35, 0, 1);
    const sc = lerp(3, 1, backOut(tf));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = Theme.SEM.miss;
    g.font = '900 ' + Math.round(Math.min(38, W * 0.085) * sc) + 'px ' + FONT;
    const msg = deathReason === 'decoy' ? S.decoyMissMsg : (missLate ? S.missLate : S.missEarly)(missSecs.toFixed(3));
    g.shadowBlur = 20; g.shadowColor = Theme.SEM.miss;
    g.fillText(msg, CX, CY + R * 0.55);
    g.shadowBlur = 0;
  }

  function renderPanel(g, now, CX, CY, W, H) {
    const PAL = Theme.PAL;
    const Hp = Math.min(440, H * 0.66);
    const f = clamp(panelT / 0.25, 0, 1);
    const top = H - Hp * backOut(f);
    g.save();
    g.fillStyle = 'rgba(13,18,32,0.96)';
    g.beginPath();
    g.roundRect(8, top, W - 16, Hp + 24, 18);
    g.fill();
    if (newBest) {
      g.strokeStyle = PAL.perfect; g.lineWidth = 2;
      g.shadowBlur = 12; g.shadowColor = PAL.perfect;
      g.beginPath(); g.roundRect(8, top, W - 16, Hp + 24, 18); g.stroke();
      g.shadowBlur = 0;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = Theme.SEM.gray;
    g.font = '600 16px ' + FONT;
    g.fillText(tauntText, CX, top + 38);
    g.fillStyle = Theme.SEM.gray; g.font = '500 14px ' + FONT;
    g.fillText(S.lblScore, CX, top + 74);
    g.fillStyle = newBest ? PAL.perfect : PAL.needle;
    g.font = '800 50px ' + FONT;
    drawTabular(g, String(shownScore), CX, top + 112);

    let rows;
    if (mode === 'zen') {
      rows = [[S.zenResultBest, save.zenBest || 0, save.zenBest === score && score > 0], [S.lblLifetime, save.lifetimePerfects || 0, false]];
    } else if (mode === 'daily') {
      rows = [[S.dailyResultBest, save.dailyBestByDate[kstDateStr()] || 0, newBest], [S.lblBestStreak, save.bestStreak || 0, newBestStreak]];
    } else {
      rows = [[S.lblBest, save.bestScore || 0, newBest], [S.lblBestStreak, save.bestStreak || 0, newBestStreak], [S.lblLifetime, save.lifetimePerfects || 0, false]];
    }
    let ry = top + 164;
    for (const [lbl, val, isNew] of rows) {
      g.textAlign = 'left';
      g.fillStyle = Theme.SEM.gray; g.font = '500 14px ' + FONT;
      g.fillText(lbl, CX - 130, ry);
      g.textAlign = 'right';
      g.fillStyle = PAL.needle; g.font = '700 17px ' + FONT;
      g.fillText(String(val), CX + (isNew ? 74 : 130), ry);
      if (isNew && countDone) {
        const pulse2 = 1 + 0.12 * Math.sin(now / 120);
        g.textAlign = 'right';
        g.fillStyle = PAL.perfect;
        g.font = '800 ' + Math.round(15 * pulse2) + 'px ' + FONT;
        g.shadowBlur = 10; g.shadowColor = PAL.perfect;
        g.fillText(S.newFlare, CX + 130, ry);
        g.shadowBlur = 0;
      }
      ry += 30;
    }

    if (countDone) {
      g.textAlign = 'center';
      g.fillStyle = Theme.SEM.ach; g.font = '600 15px ' + FONT;
      g.fillText(S.resultReward(lastRunXP, lastRunCoins), CX, ry + 6);
    }

    if (panelT >= 0.4) {
      const pulse = 0.55 + 0.45 * Math.sin(now / 400);
      g.globalAlpha = pulse;
      g.textAlign = 'center';
      g.fillStyle = PAL.needle;
      g.font = '700 18px ' + FONT;
      g.fillText(S.tapRestart, CX, top + Hp - 34);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  window.Games.chalna = {
    id: 'chalna', name: '찰나', genre: '타이밍', accentColor: '#FFC940',

    init(hubAPI) {
      hub = hubAPI;
      save = Save.gameData('chalna', {
        bestScore: 0, bestStreak: 0, lifetimePerfects: 0, totalRuns: 0, recordBreaks: 0,
        dailyBestByDate: {}, dailyStreak: 0, lastDailyDate: '', zenBest: 0, ghost: [],
      });
      Ach.register('chalna', ACH_NAMES);
      feverSend = A.createSend(0.16, 0.3);
    },
    onEnter() { cstate = CST_MENU; needle = 0; lastNow = performance.now(); },
    onExit() {},
    resize() {},
    update(dt) { update(dt); },
    render(g) { render(g); },
    onPointer(x, y, down) { if (down) onTap(x, y, true); },
    onKey(e) { if (e.code === 'Space' || e.code === 'Enter') { onTap(0, 0, false); } },
    summary() { return save && save.totalRuns ? '최고 ' + save.bestScore : ''; },
  };
})();

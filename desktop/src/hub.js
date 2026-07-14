'use strict';
/* ================================================================
   hub.js — the arcade shell. Owns the canvas, the rAF loop, resize,
   input routing, and three top-level screens: HOME (cabinet select),
   GAME (delegates to the active game module), COLLECTION (global
   progression). Games plug in via window.Games[id] — see games/_template.js
   for the exact contract.
   ================================================================ */
(() => {
  const U = window.Util, Save = window.Save, Theme = window.Theme, FX = window.FX;
  const A = window.CoreAudio, SFX = window.SFX, Ach = window.Achievements;

  const ST_HOME = 0, ST_GAME = 1, ST_COLLECTION = 2;
  let state = ST_HOME;
  let paused = false;
  let activeGameId = null;

  const canvas = document.getElementById('c');
  const g = canvas.getContext('2d');
  let W = 0, H = 0, CX = 0, CY = 0, DPR = 1;
  let ambientGrad = null;

  function resize() {
    DPR = U.clamp(window.devicePixelRatio || 1, 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    CX = W / 2; CY = H / 2;
    ambientGrad = g.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.7);
    ambientGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
    ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
    if (activeGameId && window.Games[activeGameId].resize) window.Games[activeGameId].resize(W, H);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  /* ---------------- registry ordering (display order in the hub) ---------------- */
  const GAME_ORDER = ['chalna', 'seomgwang', 'maeari', 'nakha'];

  function gameList() {
    return GAME_ORDER.filter(id => window.Games[id]).map(id => window.Games[id]);
  }

  /* ---------------- hub API passed to every game ---------------- */
  function makeHubAPI() {
    return {
      get W() { return W; }, get H() { return H; }, get CX() { return CX; }, get CY() { return CY; },
      exitToHub() { switchToHome(); },
      reportRunEnd(result) { applyRunReward(result); },
    };
  }
  const hubAPI = makeHubAPI();

  function applyRunReward(result) {
    result = result || {};
    const xpGain = Math.max(0, Math.floor(result.xpGain || 0));
    const coinGain = Math.max(0, Math.floor(result.coinGain || 0));
    Save.data.coins += coinGain;
    Save.grantXP(xpGain, onLevelUp);
    playedGames.add(activeGameId);
    if (playedGames.size >= GAME_ORDER.length) Ach.unlock('meta_all_games');
    Save.write();
    return { xpGain, coinGain };
  }
  const playedGames = new Set();

  function onLevelUp(newLevel) {
    FX.pushBanner('Lv.' + newLevel + ' 달성!', Theme.PAL.perfect, 1.6, 30);
    SFX.sLevelUp();
    if (newLevel === 5) Ach.unlock('meta_level_5');
    if (newLevel === 10) Ach.unlock('meta_level_10');
    if (newLevel === 12) Ach.unlock('meta_level_12');
  }

  /* ---------------- navigation ---------------- */
  function switchToHome() {
    if (activeGameId && window.Games[activeGameId].onExit) window.Games[activeGameId].onExit();
    activeGameId = null;
    state = ST_HOME;
    SFX.sUiBack();
  }
  function enterGame(id) {
    const gm = window.Games[id];
    if (!gm) return;
    activeGameId = id;
    state = ST_GAME;
    if (!gm.__inited) { gm.init(hubAPI); gm.__inited = true; }
    if (gm.resize) gm.resize(W, H);
    if (gm.onEnter) gm.onEnter();
    SFX.sUiOpen();
  }
  function openCollection() {
    state = ST_COLLECTION;
    SFX.sUiOpen();
  }

  /* ---------------- input ---------------- */
  let muted = false;
  const muteRect = () => ({ x: W - 44, y: 12, w: 32, h: 32 });
  const backRect = () => ({ x: 12, y: 12, w: 32, h: 32 });
  function within(r, x, y, pad) { pad = pad || 6; return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }

  function getCardRects() {
    const list = gameList();
    const cardW = Math.min(340, W - 48), cardH = 64, gap = 12;
    const total = list.length * cardH + (list.length - 1) * gap + 2 * (cardH * 0.72 + gap);
    const startY = Math.max(CY - total / 2 + 40, 150);
    const x = CX - cardW / 2;
    const rects = list.map((gm, i) => ({ id: gm.id, gm, x, y: startY + i * (cardH + gap), w: cardW, h: cardH }));
    const afterGames = rects.length ? rects[rects.length - 1].y + cardH + gap : startY;
    rects.push({ id: '__collection', x, y: afterGames, w: cardW, h: cardH * 0.72, special: 'collection' });
    return rects;
  }

  function onPointer(x, y, down) {
    A.init(); A.resume();
    if (!down) return;
    if (within(muteRect(), x, y)) { muted = !muted; A.setMuted(muted); return; }
    if (state !== ST_HOME && within(backRect(), x, y)) {
      if (state === ST_GAME) switchToHome(); else { state = ST_HOME; SFX.sUiBack(); }
      return;
    }
    if (state === ST_HOME) {
      for (const r of getCardRects()) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          if (r.special === 'collection') openCollection();
          else enterGame(r.id);
          return;
        }
      }
      return;
    }
    if (state === ST_GAME) {
      const gm = window.Games[activeGameId];
      if (gm && gm.onPointer) gm.onPointer(x, y, true);
      return;
    }
    if (state === ST_COLLECTION) {
      handleCollectionInput(x, y);
      return;
    }
  }

  window.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    onPointer(e.clientX, e.clientY, true);
  }, { passive: false });
  window.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.key === 'm' || e.key === 'M') { A.init(); muted = !muted; A.setMuted(muted); return; }
    if (e.key === 'Escape') { if (state === ST_GAME) switchToHome(); else if (state === ST_COLLECTION) state = ST_HOME; return; }
    if (state === ST_GAME) {
      const gm = window.Games[activeGameId];
      if (gm && gm.onKey) gm.onKey(e);
    } else if (state === ST_HOME && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault(); enterGame(GAME_ORDER[0]);
    }
  });

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) { if (A.context && A.context.state === 'running') A.context.suspend().catch(() => {}); Save.write(); }
    else { A.resume(); }
  });

  /* ---------------- collection screen ---------------- */
  function collectionLayout() {
    const top = 64;
    let y = top;
    const L = {};
    L.headerY = y; y += 36;
    L.levelBarY = y; y += 34;
    L.coinsY = y; y += 30;
    L.achLabelY = y; y += 20;
    const cols = 6, rows = Math.ceil(Ach.total / cols), dot = 8, dgap = 15;
    const gw = cols * dot * 2 + (cols - 1) * dgap;
    const ax0 = CX - gw / 2;
    L.achDots = [];
    const list = Ach.all();
    for (let i = 0; i < list.length; i++) {
      const c = i % cols, r = (i / cols) | 0;
      L.achDots.push({ item: list[i], x: ax0 + c * (dot * 2 + dgap) + dot, y: y + r * (dot * 2 + dgap) + dot, r: dot });
    }
    y += rows * (dot * 2 + dgap) + 14;
    L.gamesLabelY = y; y += 20;
    const list2 = gameList();
    L.gameStats = list2.map((gm, i) => ({ gm, y: y + i * 26 }));
    y += list2.length * 26 + 14;
    L.themesLabelY = y; y += 20;
    const themeIds = Object.keys(Theme.THEMES), tsize = 50, tgap = 14;
    const tw = themeIds.length * tsize + (themeIds.length - 1) * tgap;
    const tx0 = CX - tw / 2;
    L.themes = themeIds.map((id, i) => ({ id, x: tx0 + i * (tsize + tgap), y, w: tsize, h: tsize }));
    y += tsize + 30;
    L.trailsLabelY = y; y += 20;
    const trailIds = Object.keys(Theme.TRAILS), rsize = 50, rgap = 14;
    const rw = trailIds.length * rsize + (trailIds.length - 1) * rgap;
    const rx0 = CX - rw / 2;
    L.trails = trailIds.map((id, i) => ({ id, x: rx0 + i * (rsize + rgap), y, w: rsize, h: rsize }));
    y += rsize + 26;
    const sw = Math.min(300, W - 48), sh = 38, sgap = 10;
    L.settings = [
      { id: 'reduceMotion', label: '모션 줄이기', x: CX - sw / 2, y, w: sw, h: sh },
      { id: 'colorblind', label: '고대비 색상', x: CX - sw / 2, y: y + sh + sgap, w: sw, h: sh },
    ];
    return L;
  }

  function tryEquipOrBuyTheme(id) {
    const level = Save.data.level;
    if (Theme.isThemeUnlocked(id, level, Save.data.unlockedThemes)) {
      if (Save.data.unlockedThemes.indexOf(id) < 0) Save.data.unlockedThemes.push(id);
      Save.data.activeTheme = id; Theme.apply(id); Save.write(); SFX.sBlip(2); return;
    }
    const price = Theme.THEMES[id].price;
    if (Save.data.coins >= price) {
      Save.data.coins -= price; Save.data.coinsSpent += price;
      Save.data.unlockedThemes.push(id); Save.data.activeTheme = id; Theme.apply(id); Save.write(); SFX.sCoin();
      if (Save.data.coinsSpent >= 100) Ach.unlock('meta_coins_100_spent');
    } else SFX.sClick();
  }
  function tryEquipOrBuyTrail(id) {
    const level = Save.data.level;
    if (Theme.isTrailUnlocked(id, level, Save.data.unlockedTrails)) {
      if (Save.data.unlockedTrails.indexOf(id) < 0) Save.data.unlockedTrails.push(id);
      Save.data.activeTrail = id; Theme.applyTrail(id); Save.write(); SFX.sBlip(2); return;
    }
    const price = Theme.TRAILS[id].price;
    if (Save.data.coins >= price) {
      Save.data.coins -= price; Save.data.coinsSpent += price;
      Save.data.unlockedTrails.push(id); Save.data.activeTrail = id; Theme.applyTrail(id); Save.write(); SFX.sCoin();
      if (Save.data.coinsSpent >= 100) Ach.unlock('meta_coins_100_spent');
    } else SFX.sClick();
  }
  function toggleSetting(id) {
    if (id !== 'reduceMotion' && id !== 'colorblind') return;
    Save.data.settings[id] = !Save.data.settings[id];
    if (id === 'reduceMotion') FX.setReduceMotion(Save.data.settings.reduceMotion);
    Save.write(); SFX.sBlip(1);
  }
  function handleCollectionInput(x, y) {
    const L = collectionLayout();
    for (const r of L.themes) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { tryEquipOrBuyTheme(r.id); return; }
    for (const r of L.trails) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { tryEquipOrBuyTrail(r.id); return; }
    for (const r of L.settings) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { toggleSetting(r.id); return; }
  }

  function renderCollection(now) {
    const L = collectionLayout();
    const PAL = Theme.PAL;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = PAL.ink; g.font = '800 24px ' + U.FONT;
    g.fillText('도감', CX, L.headerY);

    const barW = Math.min(300, W - 64), barH = 10;
    const need = Save.xpToNext(Save.data.level);
    const frac = U.clamp(Save.data.xp / need, 0, 1);
    g.save();
    g.beginPath(); g.roundRect(CX - barW / 2, L.levelBarY, barW, barH, 5);
    g.fillStyle = 'rgba(245,247,250,0.12)'; g.fill();
    if (frac > 0) { g.beginPath(); g.roundRect(CX - barW / 2, L.levelBarY, barW * frac, barH, 5); g.fillStyle = PAL.perfect; g.fill(); }
    g.restore();
    g.fillStyle = Theme.SEM.gray; g.font = '600 13px ' + U.FONT;
    g.fillText('Lv.' + Save.data.level + '  ·  ' + Save.data.xp + '/' + need + ' XP', CX, L.levelBarY - 14);

    g.fillStyle = PAL.perfect; g.font = '700 15px ' + U.FONT;
    g.fillText('코인 ' + Save.data.coins, CX, L.coinsY);

    g.fillStyle = Theme.SEM.gray; g.font = '600 13px ' + U.FONT;
    g.fillText('업적 ' + Ach.countUnlocked() + '/' + Ach.total, CX, L.achLabelY);
    for (const d of L.achDots) {
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, U.TAU);
      g.fillStyle = d.item.unlocked ? PAL.perfect : 'rgba(245,247,250,0.15)';
      g.fill();
      if (d.item.unlocked) { g.shadowBlur = 8; g.shadowColor = PAL.perfect; g.fill(); g.shadowBlur = 0; }
    }

    g.fillStyle = Theme.SEM.gray; g.font = '600 13px ' + U.FONT;
    g.fillText('게임별 기록', CX, L.gamesLabelY);
    g.font = '500 13px ' + U.FONT;
    for (const row of L.gameStats) {
      const summary = row.gm.summary ? row.gm.summary() : '';
      g.textAlign = 'left'; g.fillStyle = PAL.ink;
      g.fillText(row.gm.name, CX - 130, row.y);
      g.textAlign = 'right'; g.fillStyle = Theme.SEM.gray;
      g.fillText(summary, CX + 130, row.y);
    }
    g.textAlign = 'center';

    g.fillStyle = Theme.SEM.gray; g.font = '600 13px ' + U.FONT;
    g.fillText('테마', CX, L.themesLabelY);
    for (const t of L.themes) {
      const meta = Theme.THEMES[t.id];
      const unlocked = Theme.isThemeUnlocked(t.id, Save.data.level, Save.data.unlockedThemes);
      const active = Save.data.activeTheme === t.id;
      g.beginPath(); g.arc(t.x + t.w / 2, t.y + t.h / 2, t.w / 2, 0, U.TAU);
      g.fillStyle = meta.bg; g.fill();
      g.lineWidth = active ? 3 : 1.5;
      g.strokeStyle = active ? PAL.perfect : (unlocked ? 'rgba(245,247,250,0.4)' : 'rgba(245,247,250,0.15)');
      g.stroke();
      g.beginPath(); g.arc(t.x + t.w / 2, t.y + t.h / 2, 6, 0, U.TAU); g.fillStyle = meta.perfect; g.fill();
      g.fillStyle = unlocked ? Theme.SEM.gray : 'rgba(138,147,166,0.6)';
      g.font = '500 10px ' + U.FONT;
      g.fillText(unlocked ? meta.name : (meta.price + '코인'), t.x + t.w / 2, t.y + t.h + 12);
    }

    g.fillStyle = Theme.SEM.gray; g.font = '600 13px ' + U.FONT;
    g.fillText('트레일', CX, L.trailsLabelY);
    for (const t of L.trails) {
      const meta = Theme.TRAILS[t.id];
      const unlocked = Theme.isTrailUnlocked(t.id, Save.data.level, Save.data.unlockedTrails);
      const active = Save.data.activeTrail === t.id;
      g.beginPath(); g.arc(t.x + t.w / 2, t.y + t.h / 2, t.w / 2, 0, U.TAU);
      g.fillStyle = 'rgba(245,247,250,0.08)'; g.fill();
      g.lineWidth = active ? 3 : 1.5;
      g.strokeStyle = active ? meta.color : (unlocked ? 'rgba(245,247,250,0.4)' : 'rgba(245,247,250,0.15)');
      g.stroke();
      g.beginPath(); g.arc(t.x + t.w / 2, t.y + t.h / 2, 6, 0, U.TAU); g.fillStyle = meta.color; g.fill();
      g.fillStyle = unlocked ? Theme.SEM.gray : 'rgba(138,147,166,0.6)';
      g.font = '500 10px ' + U.FONT;
      g.fillText(unlocked ? meta.name : (meta.price + '코인'), t.x + t.w / 2, t.y + t.h + 12);
    }

    for (const s2 of L.settings) {
      g.save();
      g.beginPath(); g.roundRect(s2.x, s2.y, s2.w, s2.h, 10);
      g.fillStyle = 'rgba(245,247,250,0.06)'; g.fill();
      g.textAlign = 'left'; g.fillStyle = PAL.ink; g.font = '600 14px ' + U.FONT;
      g.fillText(s2.label, s2.x + 14, s2.y + s2.h / 2);
      const on = !!Save.data.settings[s2.id];
      g.textAlign = 'right'; g.fillStyle = on ? PAL.perfect : Theme.SEM.gray; g.font = '700 13px ' + U.FONT;
      g.fillText(on ? 'ON' : 'OFF', s2.x + s2.w - 14, s2.y + s2.h / 2);
      g.restore();
    }
    g.textAlign = 'center';
  }

  /* ---------------- home screen ---------------- */
  let idleT = 0;
  function renderHome(now) {
    const PAL = Theme.PAL;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = PAL.ink;
    const titleSize = Math.round(Math.min(52, W * 0.13));
    g.font = '900 ' + titleSize + 'px ' + U.FONT;
    g.shadowBlur = 26; g.shadowColor = PAL.good;
    g.fillText('찰나 아케이드', CX, 96);
    g.shadowBlur = 0;
    g.font = '400 14px ' + U.FONT;
    g.fillStyle = Theme.SEM.gray;
    g.fillText('한 번의 탭, 네 가지 게임', CX, 96 + titleSize * 0.62);

    g.font = '500 13px ' + U.FONT;
    g.fillStyle = 'rgba(245,247,250,0.7)';
    g.fillText('Lv.' + Save.data.level + '   코인 ' + Save.data.coins, CX, 96 + titleSize * 0.62 + 24);

    for (const r of getCardRects()) {
      g.save();
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, 16);
      g.fillStyle = r.special ? 'rgba(245,247,250,0.06)' : 'rgba(245,247,250,0.10)';
      g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(245,247,250,0.18)'; g.stroke();
      if (r.special === 'collection') {
        g.fillStyle = PAL.ink; g.font = '700 17px ' + U.FONT;
        g.fillText('도감', r.x + r.w / 2, r.y + r.h / 2);
      } else {
        const gm = r.gm;
        g.textAlign = 'left';
        g.fillStyle = PAL.ink; g.font = '800 19px ' + U.FONT;
        g.fillText(gm.name, r.x + 20, r.y + r.h / 2 - 12);
        g.fillStyle = Theme.SEM.gray; g.font = '500 12px ' + U.FONT;
        g.fillText(gm.genre + (gm.summary ? '  ·  ' + gm.summary() : ''), r.x + 20, r.y + r.h / 2 + 14);
        g.textAlign = 'right';
        g.fillStyle = gm.accentColor || PAL.perfect; g.font = '900 22px ' + U.FONT;
        g.fillText('▶', r.x + r.w - 20, r.y + r.h / 2);
      }
      g.restore();
    }
    g.textAlign = 'center';

    const pulse = 0.5 + 0.5 * Math.sin(now / 500);
    g.globalAlpha = 0.5 + 0.3 * pulse;
    g.fillStyle = Theme.SEM.gray; g.font = '500 12px ' + U.FONT;
    g.fillText('카드를 탭해서 시작', CX, H - 24);
    g.globalAlpha = 1;
  }

  /* ---------------- chrome (mute/back) ---------------- */
  function renderMute() {
    const r = muteRect();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    g.save();
    g.globalAlpha = 0.75;
    g.strokeStyle = Theme.PAL.ink; g.fillStyle = Theme.PAL.ink; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 9, cy - 4); g.lineTo(cx - 4, cy - 4); g.lineTo(cx + 2, cy - 9);
    g.lineTo(cx + 2, cy + 9); g.lineTo(cx - 4, cy + 4); g.lineTo(cx - 9, cy + 4);
    g.closePath(); g.fill();
    if (muted) {
      g.strokeStyle = Theme.SEM.miss;
      g.beginPath(); g.moveTo(cx + 5, cy - 6); g.lineTo(cx + 13, cy + 6); g.stroke();
      g.beginPath(); g.moveTo(cx + 13, cy - 6); g.lineTo(cx + 5, cy + 6); g.stroke();
    } else {
      g.beginPath(); g.arc(cx + 4, cy, 5, -0.9, 0.9); g.stroke();
      g.beginPath(); g.arc(cx + 4, cy, 9, -0.9, 0.9); g.stroke();
    }
    g.restore();
  }
  function renderBack() {
    const r = backRect();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    g.save();
    g.globalAlpha = 0.75;
    g.strokeStyle = Theme.PAL.ink; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx + 8, cy - 9); g.lineTo(cx - 4, cy); g.lineTo(cx + 8, cy + 9); g.stroke();
    g.restore();
  }

  /* ---------------- main loop ---------------- */
  let lastNow = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = U.clamp((now - lastNow) / 1000, 0, 0.05);
    lastNow = now;
    if (paused) return;

    const PAL = Theme.PAL;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = PAL.bg;
    g.fillRect(-20, -20, W + 40, H + 40);
    g.fillStyle = ambientGrad;
    g.fillRect(-20, -20, W + 40, H + 40);

    if (state === ST_HOME) {
      idleT += dt;
      renderHome(now);
    } else if (state === ST_GAME) {
      const gm = window.Games[activeGameId];
      if (gm) { gm.update(dt); gm.render(g); }
    } else if (state === ST_COLLECTION) {
      renderCollection(now);
    }

    if (state !== ST_HOME) renderBack();
    renderMute();
    FX.renderAchToast(g, U.FONT, CX, 46, Theme.SEM.ach);

    if (idleT > 3600) idleT = 0; // never let this grow unbounded across long sessions
  }

  function boot() {
    Save.load();
    FX.init();
    resize();
    requestAnimationFrame(frame);
  }

  window.Hub = { boot, get state() { return state; }, get activeGameId() { return activeGameId; },
    ST_HOME, ST_GAME, ST_COLLECTION };

  boot();
})();

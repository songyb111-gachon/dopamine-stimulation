'use strict';
/* ================================================================
   core/save.js — ONE profile shared by every game in the arcade:
   level/XP/coins/achievements/cosmetics/settings are global, so playing
   any game feeds the same progression. Each game keeps its own stats
   under data.games[gameId], namespaced and opaque to the hub.
   ================================================================ */
window.Save = (() => {
  const KEY = 'chalna_arcade_save_v1';
  const LEGACY_KEY = 'chalna_save_v2'; // the standalone web CHALNA build

  const data = {
    xp: 0, level: 1, coins: 0, coinsSpent: 0,
    achievements: {},
    unlockedThemes: ['classic'], unlockedTrails: ['classic'],
    activeTheme: 'classic', activeTrail: 'classic',
    settings: { reduceMotion: false, colorblind: false },
    games: {},
  };

  function num(v) { return (Number.isFinite(+v) && +v > 0) ? Math.floor(+v) : 0; }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        data.xp = num(s.xp); data.level = Math.max(1, num(s.level) || 1);
        data.coins = num(s.coins); data.coinsSpent = num(s.coinsSpent);
        if (s.achievements && typeof s.achievements === 'object') data.achievements = s.achievements;
        if (Array.isArray(s.unlockedThemes) && s.unlockedThemes.length) data.unlockedThemes = s.unlockedThemes;
        if (Array.isArray(s.unlockedTrails) && s.unlockedTrails.length) data.unlockedTrails = s.unlockedTrails;
        if (typeof s.activeTheme === 'string') data.activeTheme = s.activeTheme;
        if (typeof s.activeTrail === 'string') data.activeTrail = s.activeTrail;
        if (s.settings && typeof s.settings === 'object') {
          data.settings.reduceMotion = !!s.settings.reduceMotion;
          data.settings.colorblind = !!s.settings.colorblind;
        }
        if (s.games && typeof s.games === 'object') data.games = s.games;
      } else {
        // one-time goodwill import from the standalone web CHALNA save, if present
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
        if (legacy && typeof legacy === 'object') {
          data.xp = num(legacy.xp); data.level = Math.max(1, num(legacy.level) || 1); data.coins = num(legacy.coins);
          data.games.chalna = {
            bestScore: num(legacy.bestScore), bestStreak: num(legacy.bestStreak),
            lifetimePerfects: num(legacy.lifetimePerfects), totalRuns: num(legacy.totalRuns),
            zenBest: num(legacy.zenBest), dailyBestByDate: legacy.dailyBestByDate || {},
            dailyStreak: num(legacy.dailyStreak), lastDailyDate: legacy.lastDailyDate || '',
            ghost: Array.isArray(legacy.ghost) ? legacy.ghost : [],
          };
        }
      }
    } catch (e) { /* private mode → session-only progress */ }
    window.Theme.apply(data.activeTheme);
    window.Theme.applyTrail(data.activeTrail);
    window.FX.setReduceMotion(data.settings.reduceMotion);
  }

  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  // per-game persisted stats, auto-initialized from defaults on first touch
  function gameData(id, defaults) {
    if (!data.games[id]) data.games[id] = JSON.parse(JSON.stringify(defaults));
    return data.games[id];
  }

  function xpToNext(level) { return 80 + 40 * level; }

  // onLevelUp(newLevel) is supplied by the hub so it can push a banner/sound/unlock-check
  function grantXP(amount, onLevelUp) {
    if (amount <= 0) return;
    data.xp += amount;
    while (data.xp >= xpToNext(data.level)) {
      data.xp -= xpToNext(data.level);
      data.level++;
      if (onLevelUp) onLevelUp(data.level);
    }
  }

  return { data, load, write, gameData, xpToNext, grantXP };
})();

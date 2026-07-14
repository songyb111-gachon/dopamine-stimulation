'use strict';
/* ================================================================
   core/achievements.js — one unlock ledger for the whole arcade.
   Games register their own achievement ids/names at load time; the hub
   adds cross-game "meta" achievements. unlock() is idempotent, queues
   a toast (FX), and persists (Save) — call it from anywhere.
   ================================================================ */
window.Achievements = (() => {
  const registry = {}; // id -> { name, gameId }
  let order = [];

  function register(gameId, defs) {
    // defs: { id: name, ... }
    for (const id in defs) {
      if (!registry[id]) order.push(id);
      registry[id] = { name: defs[id], gameId };
    }
  }

  function unlock(id) {
    const Save = window.Save;
    if (Save.data.achievements[id]) return;
    Save.data.achievements[id] = true;
    const meta = registry[id];
    window.FX.queueAchToast('업적 달성: ' + (meta ? meta.name : id));
    window.SFX.sAchievement();
    Save.write();
  }

  function isUnlocked(id) { return !!window.Save.data.achievements[id]; }
  function all() { return order.map(id => ({ id, name: registry[id].name, gameId: registry[id].gameId, unlocked: isUnlocked(id) })); }
  function countUnlocked() { return order.filter(isUnlocked).length; }

  register('meta', {
    meta_level_5: '레벨 5 달성', meta_level_10: '레벨 10 달성', meta_level_12: '레벨 12 달성',
    meta_all_games: '모든 게임 플레이', meta_coins_100_spent: '코인 100 사용',
  });

  return { register, unlock, isUnlocked, all, countUnlocked, get total() { return order.length; } };
})();

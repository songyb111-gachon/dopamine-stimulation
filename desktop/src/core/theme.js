'use strict';
/* ================================================================
   core/theme.js — one visual identity shared by the hub and every game.
   good=cyan-family, perfect/accent=gold-family in every theme, so meaning
   never changes across skins (colorblind-safe by construction).
   ================================================================ */
window.Theme = (() => {
  const THEMES = {
    classic: { name: '기본', bg: '#0A0E1A', bgHi: '#2A0A2E', ink: '#F5F7FA', good: '#39C5E8', perfect: '#FFC940', lv: 1, price: 0 },
    sunset:  { name: '선셋', bg: '#1A0E12', bgHi: '#3A0A1E', ink: '#FFF1E6', good: '#4DD9E8', perfect: '#FFB347', lv: 3, price: 80 },
    mono:    { name: '모노', bg: '#050505', bgHi: '#141414', ink: '#FFFFFF', good: '#8FE3FF', perfect: '#FFD400', lv: 5, price: 120 },
    neon:    { name: '네온', bg: '#05041A', bgHi: '#170838', ink: '#EAFBFF', good: '#28E5FF', perfect: '#FFE93A', lv: 8, price: 180 },
  };
  const TRAILS = {
    classic: { name: '클래식', color: '#FF6AD5', lv: 1, price: 0 },
    jade:    { name: '제이드', color: '#39FF9E', lv: 8, price: 100 },
    prism:   { name: '프리즘', color: '#FFD166', lv: 12, price: 150 },
  };
  // semantic (non-themed) colors — meaning stays fixed regardless of skin
  const SEM = { goodFx: '#5A8DEE', miss: '#FF5A5A', gray: '#8A93A6', white: '#FFFFFF', ach: '#C9A6FF' };

  let PAL = THEMES.classic, trailColor = TRAILS.classic.color;

  function apply(id) { if (THEMES[id]) PAL = THEMES[id]; }
  function applyTrail(id) { if (TRAILS[id]) trailColor = TRAILS[id].color; }
  function isThemeUnlocked(id, level, unlockedThemes) { return !!THEMES[id] && (level >= THEMES[id].lv || unlockedThemes.indexOf(id) >= 0); }
  function isTrailUnlocked(id, level, unlockedTrails) { return !!TRAILS[id] && (level >= TRAILS[id].lv || unlockedTrails.indexOf(id) >= 0); }

  return {
    THEMES, TRAILS, SEM,
    apply, applyTrail, isThemeUnlocked, isTrailUnlocked,
    get PAL() { return PAL; }, get trailColor() { return trailColor; },
  };
})();

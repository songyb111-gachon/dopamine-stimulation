'use strict';
/* ================================================================
   games/_template.js — THE GAME MODULE CONTRACT.
   Not loaded by index.html (underscore prefix); copy this file's shape
   when writing a new game. Every game registers itself on window.Games.

   Available globals (all loaded before any game file):
     window.Util        — TAU, clamp, lerp, rand, norm360, signedDelta, rad,
                           backOut, easeOut, easeInOut, hashStr, mulberry32,
                           kstDateStr, mixColor, drawTabular(g,text,x,y), FONT
     window.CoreAudio    — init(), resume(), setMuted(m), tone(type,f0,f1,attack,dur,vol),
                           noise(dur,vol,filterType,f0,f1), buzz(ms), createSend(delayTime,feedback)
     window.SFX          — sClick, sBlip(i), sMilestone, sShimmer, sAchievement, sLevelUp,
                           sMiss, sGood, sSoftFail, sUiOpen, sUiBack, sCoin
     window.FX            — spawnP, burst(x,y,n,color,speed,kind), popup(text,x,y,size,color,punch),
                           pushBanner(text,color,dur,size), pushStamp(text,color,dur,size), pushWave(),
                           update(dt,edt) [hub calls this via your update if you use FX], renderParticles(g),
                           renderPops(g,FONT), renderBanners(g,FONT,cx,topY), renderStamps(g,FONT,cx,cy),
                           renderWaves(g,cx,cy,R), reset()
                           NOTE: each game must call FX.reset() in onEnter() and FX.update(dt, effectiveDt)
                           once per frame from its own update(dt) — FX is shared/global, not per-game state.
     window.Theme         — THEMES, TRAILS, SEM (goodFx/miss/gray/white/ach), get PAL, get trailColor
     window.Save          — data (xp/level/coins/achievements/settings/...), gameData(id, defaults),
                           xpToNext(level), grantXP(amount, onLevelUp), write()
     window.Achievements  — register(gameId, {id: displayName, ...}), unlock(id), isUnlocked(id)

   Contract (all methods except id/name/genre are called by hub.js):
     id, name, genre, accentColor      — plain fields, shown on the hub's game card
     init(hubAPI)                       — called ONCE, first time the card is tapped. Register
                                          achievements here. Store hubAPI (has W/H/CX/CY getters,
                                          exitToHub(), reportRunEnd({xpGain, coinGain})).
     onEnter()                          — called every time the hub switches TO this game (reset
                                          run-local state here, NOT in init).
     onExit()                           — optional; called when leaving back to hub.
     resize(W, H)                       — optional; recompute any cached layout.
     update(dt)                         — advance your own state machine. dt is seconds, already
                                          clamped to <=0.05 by the hub.
     render(g)                          — draw yourself full-screen on the shared canvas context g.
                                          Use hubAPI.CX/CY or your own resize()-cached values.
     onPointer(x, y, down)              — down is always true (hub only forwards taps, never move/up).
     onKey(e)                           — optional; raw KeyboardEvent, only reaches you while your
                                          game is active (Escape/M are swallowed by the hub already).
     summary()                          — optional; short one-line string shown on the hub card and
                                          in 도감 (e.g. "최고 1200"). Return '' if nothing to show yet.

   Rules shared with the CHALNA web build (games/design/ethics):
     - Read input on press, never release/hold.
     - No currency-for-power, no gambling odds, no dark patterns — coins/XP earned only by playing.
     - Meaning is always color+shape+sound triple-encoded (colorblind-safe).
     - Call hubAPI.reportRunEnd({xpGain, coinGain}) exactly once per completed run (not per hit).
     - Respect Save.data.settings.reduceMotion (fewer/no particles, no hard screen shake) and
       Save.data.settings.colorblind (don't rely on hue alone for any verdict).
   ================================================================ */
window.Games = window.Games || {};
window.Games.__template = {
  id: '__template', name: '템플릿', genre: '장르', accentColor: '#39C5E8',
  init(hubAPI) { this.hub = hubAPI; },
  onEnter() {},
  onExit() {},
  resize(W, H) {},
  update(dt) {},
  render(g) {},
  onPointer(x, y, down) {},
  onKey(e) {},
  summary() { return ''; },
};

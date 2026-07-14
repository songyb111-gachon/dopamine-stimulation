'use strict';
/* ================================================================
   core/sfx.js — named sound effects shared across the hub and every
   game (achievement/level-up/record/UI-click), built on CoreAudio's
   raw tone()/noise() primitives. Game-specific sounds (e.g. CHALNA's
   perfect-pitch-ladder) stay local to that game's own file.
   ================================================================ */
window.SFX = (() => {
  const A = window.CoreAudio;
  const sClick = () => A.noise(0.02, 0.079, 'bandpass', 4000, 0);
  const sBlip = i => A.tone('sine', 600 + i * 28, 0, 0.004, 0.045, 0.07);
  const sMilestone = () => { A.tone('square', 110, 0, 0.01, 0.3, 0.14); A.tone('square', 165, 0, 0.01, 0.3, 0.10); };
  const sShimmer = () => { A.tone('sine', 1567, 0, 0.01, 0.3, 0.09); A.tone('sine', 1568, 0, 0.01, 0.3, 0.09); A.tone('sine', 2093, 0, 0.01, 0.25, 0.06); };
  const sAchievement = () => { A.tone('sine', 784, 0, 0.005, 0.12, 0.12); setTimeout(() => A.tone('sine', 988, 0, 0.005, 0.16, 0.12), 70); };
  const sLevelUp = () => {
    A.tone('triangle', 392, 0, 0.008, 0.15, 0.16);
    setTimeout(() => A.tone('triangle', 523.25, 0, 0.008, 0.2, 0.18), 100);
    setTimeout(() => A.tone('triangle', 659.25, 0, 0.01, 0.3, 0.2), 200);
  };
  const sMiss = () => {
    A.tone('sawtooth', 400, 80, 0.005, 0.5, 0.22);
    A.tone('sawtooth', 406, 82, 0.005, 0.5, 0.12);
    A.noise(0.3, 0.15, 'lowpass', 200, 0);
  };
  const sGood = () => { A.tone('square', 150, 0, 0.005, 0.08, 0.18); A.noise(0.04, 0.06, 'lowpass', 300, 0); };
  const sSoftFail = () => { A.tone('sine', 220, 140, 0.008, 0.2, 0.14); A.noise(0.08, 0.05, 'lowpass', 300, 0); };
  const sUiOpen = () => A.tone('sine', 520, 720, 0.005, 0.12, 0.09);
  const sUiBack = () => A.tone('sine', 480, 320, 0.005, 0.12, 0.08);
  const sCoin = () => { A.tone('square', 988, 0, 0.004, 0.09, 0.10); setTimeout(() => A.tone('square', 1319, 0, 0.004, 0.1, 0.09), 45); };
  return { sClick, sBlip, sMilestone, sShimmer, sAchievement, sLevelUp, sMiss, sGood, sSoftFail, sUiOpen, sUiBack, sCoin };
})();

'use strict';
/* ================================================================
   core/audio.js — one shared WebAudio synth engine for every game.
   All sound is synthesized in real time (oscillators + filtered noise);
   zero audio assets, zero network requests.
   ================================================================ */
window.CoreAudio = (() => {
  let AC = null, bus = null, master = null, comp = null, noiseBuf = null, muted = false;

  function init() {
    if (AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(AC.destination);
      comp = AC.createDynamicsCompressor();
      comp.connect(master);
      bus = AC.createGain();
      bus.connect(comp);
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; master = null; bus = null; comp = null; noiseBuf = null; }
  }

  function resume() { if (AC && AC.state !== 'running') AC.resume().catch(() => {}); }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, AC.currentTime, 0.01);
  }

  function tone(type, f0, f1, attack, dur, vol) {
    if (!AC || muted) return;
    const t0 = AC.currentTime;
    const o = AC.createOscillator(), gn = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(vol, t0 + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(bus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterType, f0, f1) {
    if (!AC || muted) return;
    const t0 = AC.currentTime;
    const src = AC.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 1;
    const fl = AC.createBiquadFilter();
    fl.type = filterType || 'bandpass';
    fl.frequency.setValueAtTime(f0 || 2000, t0);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    fl.Q.value = 1;
    const gn = AC.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl); fl.connect(gn); gn.connect(bus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  // optional per-game feedback send (e.g. CHALNA's fever echo) — returns a wet
  // gain node the game can ramp 0->x itself; independent per call, own delay line.
  function createSend(delayTime, feedback) {
    if (!AC) return { wet: { gain: { setTargetAtTime() {} } } };
    const delay = AC.createDelay(1.0);
    delay.delayTime.value = delayTime;
    const fb = AC.createGain(); fb.gain.value = feedback;
    delay.connect(fb); fb.connect(delay);
    const wet = AC.createGain(); wet.gain.value = 0;
    bus.connect(delay); delay.connect(wet); wet.connect(comp);
    return { wet };
  }

  return {
    init, resume, setMuted, tone, noise, buzz, createSend,
    get muted() { return muted; },
    get context() { return AC; },
    get bus() { return bus; },
  };
})();

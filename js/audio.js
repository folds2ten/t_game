// audio.js — tiny synthesized sound effects (WebAudio, no asset files) and the mute toggle.
'use strict';

const MUTE_KEY = 'deepvale_mute';
const audio = { ctx: null, muted: false, last: {} };
try { audio.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage unavailable */ }

// name -> list of [wave, startHz, endHz, seconds, volume, delay]
const SOUNDS = {
  hit: [['square', 220, 90, 0.07, 0.05]],
  hurt: [['sawtooth', 170, 60, 0.15, 0.07]],
  spell: [['triangle', 480, 1100, 0.18, 0.07]],
  kill: [['square', 320, 110, 0.14, 0.05]],
  loot: [['sine', 880, 1320, 0.08, 0.05]],
  level: [['triangle', 523, 523, 0.12, 0.08], ['triangle', 659, 659, 0.12, 0.08, 0.12], ['triangle', 784, 784, 0.3, 0.08, 0.24]],
  quest: [['triangle', 660, 660, 0.1, 0.08], ['triangle', 990, 990, 0.25, 0.08, 0.1]],
  death: [['sawtooth', 300, 40, 0.9, 0.09]],
};

function tone(a, wave, f0, f1, dur, vol, delay = 0) {
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function sfx(name) {
  if (audio.muted || !SOUNDS[name]) return;
  const now = performance.now();
  if (now - (audio.last[name] || 0) < 50) return; // area spells hit many things at once
  audio.last[name] = now;
  try {
    if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    for (const s of SOUNDS[name]) tone(audio.ctx, ...s);
  } catch (e) { /* audio unavailable */ }
}

function toggleMute() {
  audio.muted = !audio.muted;
  try { localStorage.setItem(MUTE_KEY, audio.muted ? '1' : '0'); } catch (e) { /* ignore */ }
}

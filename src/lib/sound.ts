"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "harnkan:stamp-sound";
const EVENT_NAME = "harnkan:sound-change";

let audioCtx: AudioContext | null = null;

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStampSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // Ignore storage errors (private mode / quota).
  }
  if (enabled) playStampThud(true);
}

/** Subscribes to the opt-in rubber-stamp sonic feedback preference (muted by default). */
export function useStampSound() {
  const enabled = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT_NAME, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT_NAME, cb);
        window.removeEventListener("storage", cb);
      };
    },
    readEnabled,
    () => false,
  );
  return [enabled, setStampSoundEnabled] as const;
}

/**
 * Synthesizes a subtle, tactile rubber-stamp "thud" on paper via Web Audio API.
 * Only plays when the user has opted in (or during the opt-in preview click).
 */
export function playStampThud(force = false) {
  if (typeof window === "undefined") return;
  if (!force && !readEnabled()) return;

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  try {
    audioCtx ??= new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const now = audioCtx.currentTime;

    // 1. Low rubber-and-wood desk thud (155Hz -> 48Hz)
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.085);
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(0.18, now + 0.004);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(oscGain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.1);

    // 2. Short filtered paper-contact slap
    const sampleCount = Math.floor(audioCtx.sampleRate * 0.032);
    const buffer = audioCtx.createBuffer(1, sampleCount, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.35));
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 920;
    filter.Q.value = 1.4;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.09, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    noise.connect(filter).connect(noiseGain).connect(audioCtx.destination);
    noise.start(now);
    noise.stop(now + 0.035);
  } catch {
    // Graceful no-op if audio is blocked by browser policy.
  }
}

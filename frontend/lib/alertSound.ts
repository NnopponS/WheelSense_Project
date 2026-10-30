const STORAGE_KEY = "wheelsense_alert_sound";

export function getAlertSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setAlertSoundEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
}

let audioCtx: AudioContext | null = null;

/** Call from a click handler so browsers allow AudioContext.resume(). */
export function primeAlertAudioFromUserGesture(): void {
  if (typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  if (!audioCtx) {
    audioCtx = new Ctor();
  }
  void audioCtx.resume().catch(() => {});
}

export function playAlertChime(): void {
  if (!getAlertSoundEnabled() || typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {});
  }
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const duration = 1.5;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, now + (duration / steps) * i);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
  gain.gain.setValueAtTime(0.3, now + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

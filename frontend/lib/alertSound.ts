const STORAGE_KEY = "wheelsense_alert_sound";
const ALARM_URL = "/sounds/fall-alarm.wav";

export function getAlertSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setAlertSoundEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
}

let audioCtx: AudioContext | null = null;
let alarmEl: HTMLAudioElement | null = null;
let alarmPlaying = false;

function getAlarmElement(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!alarmEl) {
    alarmEl = new Audio(ALARM_URL);
    alarmEl.loop = true;
    alarmEl.preload = "auto";
  }
  return alarmEl;
}

/** Call from a click handler so browsers allow AudioContext.resume() and later media playback. */
export function primeAlertAudioFromUserGesture(): void {
  if (typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor && !audioCtx) {
    audioCtx = new Ctor();
  }
  void audioCtx?.resume().catch(() => {});
  getAlarmElement()?.load();
}

/** Loop the fall-alarm siren; idempotent — safe to call on every poll. */
export function startAlertAlarm(): void {
  if (!getAlertSoundEnabled() || alarmPlaying) return;
  const el = getAlarmElement();
  if (!el) return;
  alarmPlaying = true;
  void el.play().catch(() => {
    alarmPlaying = false;
  });
}

/** Stop the siren; idempotent. */
export function stopAlertAlarm(): void {
  alarmPlaying = false;
  const el = alarmEl;
  if (!el) return;
  el.pause();
  try {
    el.currentTime = 0;
  } catch {
    /* not seekable yet */
  }
}

/** One-shot siren burst (e.g. a single critical alert arrival). */
export function playAlertChime(): void {
  if (!getAlertSoundEnabled() || typeof window === "undefined" || alarmPlaying) return;
  const el = getAlarmElement();
  if (!el) return;
  const once = el.cloneNode(true) as HTMLAudioElement;
  once.loop = false;
  void once.play().catch(() => {});
}

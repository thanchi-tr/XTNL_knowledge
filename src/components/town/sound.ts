/**
 * The town's few sounds (design M1, "Moments and juice"): short oscillator
 * blips, no sound files. They stay silent until the player first clicks or
 * presses a key on the page, since a page should make no sound it was not
 * invited to (and browsers allow none before that). A mute toggle beside the
 * speed buttons turns them off, remembered under 'tg-sound'.
 *
 *   cart   660 to 880 Hz over 120 ms: a delivery has come in
 *   wave   three notes rising: a wave is broken
 *   alarm  two 90 ms squares at 440 Hz: a raid is on its way
 *   peril  220 Hz: the town is in danger of ending
 */

export type Cue = "cart" | "wave" | "alarm" | "peril";

const KEY = "tg-sound";
const GAIN = 0.08;

let audio: AudioContext | null = null;
/** A gesture has been seen on this page. */
let armed = false;
let muted: boolean | null = null;

/** Whether sound is on: remembered across visits; on until muted. */
export function soundOn(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(KEY) === "off";
    } catch {
      muted = false; // no storage: on for this visit
    }
  }
  return !muted;
}

export function setSound(on: boolean) {
  muted = !on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* no storage: remembered for this visit */
  }
  if (on) wake();
}

/** Waits for the player's first click or key on the page before any sound can play. Returns the cleanup. */
export function armSound(): () => void {
  if (typeof window === "undefined" || armed) return () => {};
  const off = () => {
    window.removeEventListener("pointerdown", go, true);
    window.removeEventListener("keydown", go, true);
  };
  const go = () => {
    armed = true;
    wake();
    off();
  };
  window.addEventListener("pointerdown", go, true);
  window.addEventListener("keydown", go, true);
  return off;
}

/** The audio context, made or resumed inside a gesture's turn so the browser lets it run. */
function wake() {
  if (!armed || !soundOn()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null; // no audio on this device: the town plays on silent
  }
}

/** One blip, sliding from `from` to `to` Hz, with a short rise and fall so it does not click. */
function tone(a: AudioContext, at: number, from: number, to: number, dur: number, type: OscillatorType) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to !== from) o.frequency.linearRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(GAIN, at + 0.008);
  g.gain.setValueAtTime(GAIN, at + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.01);
}

/** Plays a cue, if sound is on and the player has touched the page; otherwise nothing, and nothing is queued. */
export function play(cue: Cue) {
  if (!armed || !soundOn()) return;
  wake();
  const a = audio;
  if (!a || a.state !== "running") return;
  const t = a.currentTime + 0.01;
  try {
    if (cue === "cart") tone(a, t, 660, 880, 0.12, "triangle");
    else if (cue === "wave") [523.25, 659.25, 783.99].forEach((f, i) => tone(a, t + i * 0.1, f, f, 0.09, "triangle"));
    else if (cue === "alarm") [0, 0.15].forEach((d) => tone(a, t + d, 440, 440, 0.09, "square"));
    else tone(a, t, 220, 220, 0.3, "sine");
  } catch {
    /* a closed or broken context: skip the sound, never the game */
  }
}

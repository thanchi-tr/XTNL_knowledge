/**
 * FROZEN CONTRACT — the one celebration queue (L0-foundation, redesign "Sigil & Slate").
 * Client-side. Every tier writes its words to ONE polite live region and to the dev log.
 *
 *   mark(opts)  → Promise<void>     Tier 0. In place, immediately. Sound 1318 Hz · haptic 8 ms.
 *        Flies "+N" from opts.from to its OWN ledger (ledgerTarget(kind) by default) and
 *        resolves when it lands, so the ledger owner can countTo() + bump().
 *   chime(opts)                     Tier 1. In place, < 1 s: sweep + seeded burst of 8.
 *        If opts.ringEl is off-screen, the ToastDock carries a closing mini ring.
 *   enqueue(event)                  Tier 2 / 3. One at a time, highest tier first.
 *        A registered presenter (L3's CelebrationHost) renders it and calls done().
 *        Events already seen in this tab are ignored (a moment plays once).
 *   celebrate(event, visuals?)      Routes any event by its tier (T0 → mark, T1 → chime, T2/3 → enqueue).
 *   registerPresenter(fn, { fallback? }) → unregister      hasPresenter()
 *   openRun(id) / closeRun() → merged[]
 *        While a review run is open, T2 events merge into the run (its recap renders them)
 *        and T3 events wait until the run closes.
 *   ledgerTarget("xp" | "pts" | "mp")  the visible [data-ledger-target] cell, else the top-bar MiniLedger
 *   announce(text)                  the one role=status live region
 *   sound(kind) / haptic(kind)      opt-in per device; silent in Still
 *   getLog(), subscribeLog(fn), clearLog()   the dev celebration log (/dev/style)
 *
 * Nothing here is random: bursts are seeded by the event id.
 */
import {
  KIND_TIER,
  PREFS_STORAGE_KEY,
  parsePrefs,
  type AmountFact,
  type CelebrationEvent,
  type CelebrationTier,
  type CurrencyKind,
  type T0Kind,
  type T1Kind,
} from "./celebration-types";
import { burst, center, fly, formatFigure, inViewport, motionLevel } from "./motion";
import { pushToast } from "../components/ui/toast-store";

const isBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

// ─── Live region ────────────────────────────────────────────────────────────

let live: HTMLDivElement | null = null;

/** Writes one sentence to the app's single polite live region. */
export function announce(text: string): void {
  if (!isBrowser() || !text) return;
  if (!live || !live.isConnected) {
    live = document.createElement("div");
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("data-celebrate-live", "");
    document.body.appendChild(live);
  }
  const region = live;
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = text;
  }, 30);
}

// ─── Dev log ────────────────────────────────────────────────────────────────

export interface LogEntry {
  at: number;
  tier: CelebrationTier;
  kind: string;
  text: string;
}

const LOG_KEY = "xtnl:celebration-log";
const LOG_MAX = 200;
let logEntries: LogEntry[] | null = null;
const logListeners = new Set<() => void>();

function loadLog(): LogEntry[] {
  if (logEntries) return logEntries;
  logEntries = [];
  if (isBrowser()) {
    try {
      const raw = window.sessionStorage.getItem(LOG_KEY);
      if (raw) logEntries = (JSON.parse(raw) as LogEntry[]).slice(-LOG_MAX);
    } catch {
      logEntries = [];
    }
  }
  return logEntries;
}

function writeLog(tier: CelebrationTier, kind: string, text: string): void {
  const next = [...loadLog(), { at: Date.now(), tier, kind, text }].slice(-LOG_MAX);
  logEntries = next;
  if (isBrowser()) {
    try {
      window.sessionStorage.setItem(LOG_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the in-memory log still works */
    }
  }
  for (const l of logListeners) l();
}

const NO_LOG: LogEntry[] = [];
export function getLog(): LogEntry[] {
  return isBrowser() ? loadLog() : NO_LOG;
}
export function getServerLog(): LogEntry[] {
  return NO_LOG;
}
export function subscribeLog(fn: () => void): () => void {
  logListeners.add(fn);
  return () => {
    logListeners.delete(fn);
  };
}
export function clearLog(): void {
  logEntries = [];
  if (isBrowser()) {
    try {
      window.sessionStorage.removeItem(LOG_KEY);
    } catch {
      /* ignore */
    }
  }
  for (const l of logListeners) l();
}

// ─── Sound and haptics (per device, off by default, silent in Still) ────────

export type FeedbackKind = "mark" | "chime" | "seal" | "ascend";

/** [frequency Hz, delay s, length s]. Fixed pitches per tier. */
export const TONES: Readonly<Record<FeedbackKind, readonly (readonly [number, number, number])[]>> = {
  mark: [[1318, 0, 0.07]],
  chime: [
    [784, 0, 0.32],
    [1175, 0.08, 0.38],
  ],
  seal: [
    [523, 0, 0.5],
    [784, 0.09, 0.5],
    [1047, 0.18, 0.6],
  ],
  ascend: [
    [392, 0, 0.7],
    [587, 0.12, 0.7],
    [784, 0.24, 0.8],
    [1175, 0.4, 0.9],
  ],
};

export const HAPTICS: Readonly<Record<FeedbackKind, number | readonly number[]>> = {
  mark: 8,
  chime: [12, 40, 18],
  seal: [14, 50, 22, 50, 40],
  ascend: [20, 80, 20, 80, 40, 120, 60],
};

const TIER_FEEDBACK: Record<CelebrationTier, FeedbackKind> = { 0: "mark", 1: "chime", 2: "seal", 3: "ascend" };

function devicePrefs() {
  if (!isBrowser()) return parsePrefs(null);
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    return parsePrefs(null);
  }
}

type AudioCtor = typeof AudioContext;
let audio: AudioContext | null = null;

export function sound(kind: FeedbackKind): void {
  if (!isBrowser() || motionLevel() === "still" || devicePrefs().sound !== "soft") return;
  try {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return;
    audio = audio ?? new Ctor();
    const t = audio.currentTime;
    for (const [f, d, len] of TONES[kind]) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.04, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
      o.connect(g).connect(audio.destination);
      o.start(t + d);
      o.stop(t + d + len + 0.02);
    }
  } catch {
    /* audio is decoration */
  }
}

export function haptic(kind: FeedbackKind): void {
  if (!isBrowser() || motionLevel() === "still" || devicePrefs().haptics !== "on") return;
  try {
    const pattern = HAPTICS[kind];
    navigator.vibrate?.(typeof pattern === "number" ? pattern : [...pattern]);
  } catch {
    /* ignore */
  }
}

// ─── Ledger targets ─────────────────────────────────────────────────────────

/**
 * Where a +N token lands: the page's own cell ([data-ledger-target="xp"]) when
 * it is on screen, otherwise the top-bar MiniLedger ([data-mini-ledger="xp"]),
 * which docks once the page's cells scroll away. Null when neither is shown.
 */
export function ledgerTarget(kind: CurrencyKind): Element | null {
  if (!isBrowser()) return null;
  const cells = Array.from(document.querySelectorAll(`[data-ledger-target="${kind}"]`));
  const visible = cells.find((c) => inViewport(c, 60));
  if (visible) return visible;
  const mini = document.querySelector(`.mini-ledger.show [data-mini-ledger="${kind}"]`);
  if (mini && inViewport(mini)) return mini;
  return null;
}

/** "+4.2" for a credit, "−3.8" for a debit (a true minus). */
export function signedFigure(value: number, dp = 1): string {
  const f = formatFigure(Math.abs(value), dp);
  if (value > 0) return `+${f}`;
  if (value < 0) return `−${f}`;
  return f;
}

const CURRENCY_WORD: Record<CurrencyKind, string> = { xp: "life XP", pts: "review pts", mp: "MP" };

// ─── Tier 0 · Mark ──────────────────────────────────────────────────────────

export interface MarkOptions {
  kind: T0Kind;
  /** The fact, for the log and the live region ("Kept Morning meds · paid 3.6 exactly"). */
  text: string;
  /** Deterministic id (`tick:<instanceId>`). */
  id?: string;
  /** The exact amount paid; flies as "+4.2" to its own ledger. */
  amount?: AmountFact;
  /** Where it was earned (the price pill, the answer). */
  from?: Element | null;
  /** Override the landing target; default ledgerTarget(amount.kind). */
  to?: Element | null;
  /** Announce the fact (default true). */
  say?: boolean;
}

export function mark(o: MarkOptions): Promise<void> {
  sound("mark");
  haptic("mark");
  writeLog(0, o.kind, o.text);
  if (o.say !== false) announce(o.text);
  if (!o.amount || !isBrowser()) return Promise.resolve();
  const target = o.to !== undefined ? o.to : ledgerTarget(o.amount.kind);
  const text = signedFigure(o.amount.value);
  if (!target) return Promise.resolve();
  return fly(o.from ?? null, target, {
    text: motionLevel() === "full" ? text : `${text} ${CURRENCY_WORD[o.amount.kind]}`,
    kind: o.amount.kind,
  });
}

// ─── Tier 1 · Chime ─────────────────────────────────────────────────────────

export interface ChimeOptions {
  kind: T1Kind;
  /** Deterministic id; the burst seed. */
  id: string;
  /** "Musts kept", for the log and (by default) the live region. */
  text: string;
  say?: string;
  /** A light sweep crosses this tile once. */
  sweepEl?: Element | null;
  /** A seeded burst of 8 from its centre. */
  burstEl?: Element | null;
  /** The ring that closed. Off-screen → the toast carries a closing mini ring. */
  ringEl?: Element | null;
  /** The toast's line when the ring was off-screen (default: text). */
  toastTitle?: string;
}

export function chime(o: ChimeOptions): void {
  if (isBrowser()) {
    if (o.sweepEl instanceof HTMLElement) {
      const el = o.sweepEl;
      el.classList.add("sweep");
      el.classList.remove("go");
      void el.offsetWidth;
      el.classList.add("go");
      window.setTimeout(() => el.classList.remove("go"), 1000);
    }
    if (o.burstEl) {
      const [x, y] = center(o.burstEl);
      burst(x, y, 8, o.id, { color: "var(--light)", spread: 46 });
    }
    if (o.ringEl && !inViewport(o.ringEl)) {
      pushToast({ title: o.toastTitle ?? o.text, ring: true, holdMs: 5000, key: `chime:${o.id}` });
    }
  }
  sound("chime");
  haptic("chime");
  announce(o.say ?? o.text);
  writeLog(1, o.kind, o.text);
}

// ─── Tier 2 / 3 · the queue ─────────────────────────────────────────────────

/** Renders one T2/T3 and calls done() once it is dismissed (or its in-panel hold passes). */
export type Presenter = (event: CelebrationEvent, done: () => void) => void;

/** L3's CelebrationHost is the primary presenter; /dev/style may add a fallback that only plays when no primary exists. */
let primary: Presenter | null = null;
let fallback: Presenter | null = null;
const queue: CelebrationEvent[] = [];
const seen = new Set<string>();
let busy = false;
let run: { id: string; merged: CelebrationEvent[] } | null = null;
const queueListeners = new Set<() => void>();

function queueChanged() {
  for (const l of queueListeners) l();
}

/** Highest tier first; FIFO within a tier. Exported for the checks. */
export function nextIndex(items: readonly Pick<CelebrationEvent, "tier">[], runOpen: boolean): number {
  let best = -1;
  for (let i = 0; i < items.length; i++) {
    const t = items[i].tier;
    if (runOpen && t === 3) continue; // T3 waits for the run to close
    if (best < 0 || t > items[best].tier) best = i;
  }
  return best;
}

function sayOf(ev: CelebrationEvent): string {
  if (ev.facts.say) return ev.facts.say;
  const parts = [ev.facts.eyebrow, ev.facts.title, ...(ev.facts.lines ?? [])];
  if (ev.facts.amounts?.length) {
    parts.push(ev.facts.amounts.map((a) => `${signedFigure(a.value)} ${a.label ?? CURRENCY_WORD[a.kind]}`).join(", "));
  }
  if (ev.facts.cost) parts.push(ev.facts.cost);
  return parts.filter(Boolean).join(". ");
}

function pump(): void {
  const presenter = primary ?? fallback;
  if (busy || !presenter) return;
  const i = nextIndex(queue, run !== null);
  if (i < 0) return;
  const [ev] = queue.splice(i, 1);
  busy = true;
  const fb = TIER_FEEDBACK[ev.tier];
  sound(fb);
  haptic(fb);
  announce(sayOf(ev));
  writeLog(ev.tier, ev.kind, `${ev.facts.title}${ev.facts.numeral ? ` ${ev.facts.numeral.from ?? ""}→${ev.facts.numeral.to}` : ""}`);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    busy = false;
    queueChanged();
    pump();
  };
  queueChanged();
  try {
    presenter(ev, done);
  } catch {
    done();
  }
}

/** Queues a T2 or T3. T0/T1 passed here are routed to the log only (they render in place). */
export function enqueue(ev: CelebrationEvent): void {
  if (ev.tier < 2) {
    writeLog(ev.tier, ev.kind, ev.facts.title);
    return;
  }
  if (seen.has(ev.id) || ev.shownAt) return;
  seen.add(ev.id);
  if (run && ev.tier === 2) {
    run.merged.push(ev);
    writeLog(2, ev.kind, `${ev.facts.title} (merged into the run)`);
    queueChanged();
    return;
  }
  queue.push(ev);
  queueChanged();
  pump();
}

export interface CelebrateVisuals {
  from?: Element | null;
  to?: Element | null;
  sweepEl?: Element | null;
  burstEl?: Element | null;
  ringEl?: Element | null;
}

/** One entry point for any event: T0 → mark, T1 → chime, T2/T3 → enqueue. */
export function celebrate(ev: CelebrationEvent, v: CelebrateVisuals = {}): Promise<void> {
  const tier = KIND_TIER[ev.kind] ?? ev.tier;
  if (tier === 0) {
    return mark({ kind: ev.kind as T0Kind, id: ev.id, text: ev.facts.say ?? ev.facts.title, amount: ev.facts.amounts?.[0], from: v.from, to: v.to });
  }
  if (tier === 1) {
    chime({ kind: ev.kind as T1Kind, id: ev.id, text: ev.facts.title, say: ev.facts.say, sweepEl: v.sweepEl, burstEl: v.burstEl, ringEl: v.ringEl });
    return Promise.resolve();
  }
  enqueue(ev);
  return Promise.resolve();
}

/**
 * L3's CelebrationHost registers here once. Queued events start playing as
 * soon as a presenter exists. `{ fallback: true }` (the /dev/style preview)
 * only plays while no primary presenter is registered.
 */
export function registerPresenter(p: Presenter, opts: { fallback?: boolean } = {}): () => void {
  if (opts.fallback) fallback = p;
  else primary = p;
  pump();
  return () => {
    if (opts.fallback) {
      if (fallback === p) fallback = null;
    } else if (primary === p) primary = null;
  };
}

export function hasPresenter(): boolean {
  return primary !== null;
}

/** A review run opens: T2s merge into it, T3s wait. */
export function openRun(id: string): void {
  run = { id, merged: [] };
  queueChanged();
}

/** The run's recap takes the merged T2s; held T3s start playing. */
export function closeRun(): CelebrationEvent[] {
  const merged = run?.merged ?? [];
  run = null;
  queueChanged();
  pump();
  return merged;
}

export function queueState(): { pending: number; busy: boolean; runOpen: boolean } {
  return { pending: queue.length, busy, runOpen: run !== null };
}

export function subscribeQueue(fn: () => void): () => void {
  queueListeners.add(fn);
  return () => {
    queueListeners.delete(fn);
  };
}

/** For Replay (You › Moments, T3 only): plays an already-seen event again, bypassing the seen set. */
export function replay(ev: CelebrationEvent): void {
  if (ev.tier < 2) return;
  queue.push({ ...ev, shownAt: null });
  queueChanged();
  pump();
}

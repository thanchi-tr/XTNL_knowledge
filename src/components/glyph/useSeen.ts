"use client";

/**
 * Seen-once events and last-seen meters (ui-motion.md §5.6, D8, D30, H13).
 *
 *   useSeenEvent(key, value, ref, { threshold?, label? }) → { changed, from, inViewAtHydration }
 *       One-shot events. Stores the value only after the element was ≥ threshold (50%) on
 *       screen; a first-ever view stores and returns changed=false. An event never seen during a
 *       mount is not consumed: it plays the next time it is seen.
 *   useSeenValue(key, value) → number | null
 *       Meters: the frozen useLastSeen semantics (null on first render, null when equal), stored in
 *       the same index.
 *   usePlayOnSeen(ref, key, value, motion, opts?)
 *       useSeenEvent + playGlyph once: the motion when armed offscreen, its accent when the element
 *       was ≥ 50% in view at hydration. Chain motions (reach, build, rank-rise, seal) go through
 *       sequence() (H13).
 *   useSinceLine() → SinceLine | null      the SINCE_LINE when > 6 events were pending at mount
 *
 * Storage: one localStorage entry per roadmap and basis,
 *   xtnl:seen:ev:${roadmapId}:${basis} → { at, e: { [what]: value } }   (strings stored as hashSeed)
 * read once per page into a module cache, written in one batch per frame; a newer basis deletes the
 * roadmap's older entries of the same basis family; all ev: entries together keep ≤ 300 `what` values
 * (the least recently written entry goes first).
 *
 * Basis (D8), two families that live side by side, built with the helpers below:
 *   proficiencyBasis(basisVersion, hashSeed(basisSignature(detail.basis)))  → "prof/…"  (meter:proficiency,
 *     horizon, measure:${key} when its target changed)
 *   planBasis(acceptedDay, planVersion)                                    → "plan/…"  (the rest)
 * roadmap-ui-model computes the inputs (R0). `what` never names the surface when the same fact shows
 * on two (rank, seal, reach, date, horizon, meter:proficiency).
 *
 * Arming (D30): measured once in a layout effect. ≥ 50% visible → only the accent may play.
 * Otherwise a shared IntersectionObserver (rootMargin 25% below the viewport) arms the from-state
 * (data-mg-armed, glyph.css) as the element approaches, and a second shared observer plays it at
 * 50% in view. Never under Still.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { hashSeed, motionLevel } from "@/lib/motion";
import {
  CHAIN_ORDER,
  MOTION_LICENCE,
  currentSince,
  playGlyph,
  sequence,
  sequenceAtMount,
  subscribeSince,
  type GlyphMotion,
  type PlayGlyphOptions,
  type SinceLine,
} from "@/lib/glyph-motion";

export type SeenKey = { roadmapId: string; basis: string; what: string };
export type SeenValue = number | string;

export const SEEN_EV_PREFIX = "xtnl:seen:ev:";
export const SEEN_CAP = 300;
export const SEEN_THRESHOLD = 0.5;

// ─── The store ──────────────────────────────────────────────────────────────

interface Entry {
  at: number;
  e: Record<string, number>;
}

const cache = new Map<string, Entry | null>();
const dirty = new Set<string>();
let flushPending = false;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function entryKeyOf(k: Pick<SeenKey, "roadmapId" | "basis">): string {
  if (k.roadmapId.includes(":")) throw new Error("SeenKey: roadmapId has no ':'");
  return `${SEEN_EV_PREFIX}${k.roadmapId}:${k.basis}`;
}

/**
 * The two basis families of D8. A newer basis replaces only its own family's
 * entry, so the Proficiency entry and the plan entry of one roadmap live side by side.
 *   proficiencyBasis(basisVersion, hashSeed(basisSignature(detail.basis)))  → "prof/3:2166136261"
 *   planBasis(acceptedDay, planVersion)                                    → "plan/2026-10-05:2"
 */
export function proficiencyBasis(basisVersion: number | string, signatureHash: number | string): string {
  return `prof/${basisVersion}:${signatureHash}`;
}
export function planBasis(acceptedDay: string, planVersion: number | string): string {
  return `plan/${acceptedDay}:${planVersion}`;
}

/** An entry key's roadmap and basis family (the part of the basis before "/", or ""). */
export function splitEntryKey(key: string): { rid: string; basis: string; family: string } {
  const rest = key.slice(SEEN_EV_PREFIX.length);
  const i = rest.indexOf(":");
  const rid = i < 0 ? rest : rest.slice(0, i);
  const basis = i < 0 ? "" : rest.slice(i + 1);
  const slash = basis.indexOf("/");
  return { rid, basis, family: slash < 0 ? "" : basis.slice(0, slash) };
}

/** A stored token: numbers as themselves, strings as hashSeed. */
export function seenToken(v: SeenValue): number {
  return typeof v === "number" ? v : hashSeed(v);
}

function parse(raw: string | null): Entry | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Entry;
    return o && typeof o === "object" && o.e && typeof o.e === "object" ? { at: Number(o.at) || 0, e: o.e } : null;
  } catch {
    return null;
  }
}

/** One getItem per entry per page. */
function load(key: string): Entry | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  const ls = storage();
  let entry: Entry | null = null;
  try {
    entry = ls ? parse(ls.getItem(key)) : null;
  } catch {
    entry = null;
  }
  cache.set(key, entry);
  return entry;
}

/** The value this viewer last saw for a key, or null. */
export function readSeen(k: SeenKey): number | null {
  const v = load(entryKeyOf(k))?.e[k.what];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Records the value (batched: written at the next frame). */
export function writeSeen(k: SeenKey, value: SeenValue): void {
  const key = entryKeyOf(k);
  const entry = load(key) ?? { at: 0, e: {} };
  entry.e[k.what] = seenToken(value);
  entry.at = Date.now();
  cache.set(key, entry);
  dirty.add(key);
  if (!flushPending) {
    flushPending = true;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => flushSeen());
    else setTimeout(() => flushSeen(), 16);
  }
}

function evKeys(ls: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(SEEN_EV_PREFIX)) out.push(k);
  }
  return out;
}

/** Writes every dirty entry (one batch), prunes older bases of the same roadmap, keeps ≤ 300 values. */
export function flushSeen(): void {
  flushPending = false;
  const ls = storage();
  if (!ls || dirty.size === 0) {
    dirty.clear();
    return;
  }
  const written = [...dirty];
  dirty.clear();
  try {
    for (const key of written) {
      const entry = cache.get(key);
      if (entry) ls.setItem(key, JSON.stringify(entry));
    }
    const keys = evKeys(ls);
    // a newer basis deletes the roadmap's older entries of the same basis family
    // (a Proficiency basis never deletes the plan basis beside it, and the other way round)
    for (const key of written) {
      const { rid, family } = splitEntryKey(key);
      for (const other of keys) {
        if (other === key || written.includes(other)) continue;
        const o = splitEntryKey(other);
        if (o.rid === rid && o.family === family) {
          ls.removeItem(other);
          cache.delete(other);
        }
      }
    }
    // the cap: ≤ 300 `what` values across every ev: entry; the least recently written entry goes first
    const live = evKeys(ls).map((k) => ({ k, entry: cache.has(k) ? cache.get(k)! : parse(ls.getItem(k)) }));
    let total = live.reduce((s, x) => s + (x.entry ? Object.keys(x.entry.e).length : 0), 0);
    live.sort((a, b) => (a.entry?.at ?? 0) - (b.entry?.at ?? 0));
    for (const x of live) {
      if (total <= SEEN_CAP) break;
      total -= x.entry ? Object.keys(x.entry.e).length : 0;
      ls.removeItem(x.k);
      cache.delete(x.k);
    }
  } catch {
    // storage full or blocked: the motion is a nicety, never a fact
  }
}

/** Forgets the module cache (the checks; a test page). */
export function __resetSeenStore(): void {
  cache.clear();
  dirty.clear();
  flushPending = false;
  mountBatch.length = 0;
  batchScheduled = false;
}

// ─── Visibility ─────────────────────────────────────────────────────────────

/** The share of an element's box inside the viewport (0..1). */
export function visibleRatio(el: Element): number {
  if (typeof window === "undefined") return 0;
  const r = el.getBoundingClientRect();
  const area = r.width * r.height;
  if (area <= 0) return 0;
  const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
  return (w * h) / area;
}

interface Watch {
  onArm: (near: boolean) => void;
  onVisible: () => void;
}

const watches = new Map<Element, Set<Watch>>();
let armObserver: IntersectionObserver | null = null;
let playObserver: IntersectionObserver | null = null;

function observers(): { arm: IntersectionObserver; play: IntersectionObserver } | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!armObserver) {
    armObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) for (const w of [...(watches.get(e.target) ?? [])]) w.onArm(e.isIntersecting);
      },
      { rootMargin: "0px 0px 25% 0px", threshold: 0 }
    );
  }
  if (!playObserver) {
    playObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= SEEN_THRESHOLD - 0.001) for (const w of [...(watches.get(e.target) ?? [])]) w.onVisible();
      },
      { threshold: [SEEN_THRESHOLD] }
    );
  }
  return { arm: armObserver, play: playObserver };
}

function watch(el: Element, w: Watch): () => void {
  const obs = observers();
  if (!obs) return () => undefined;
  const set = watches.get(el) ?? new Set<Watch>();
  const first = set.size === 0;
  set.add(w);
  watches.set(el, set);
  if (first) {
    obs.arm.observe(el);
    obs.play.observe(el);
  }
  return () => {
    if (!set.delete(w) || set.size > 0) return;
    watches.delete(el);
    obs.arm.unobserve(el);
    obs.play.unobserve(el);
  };
}

// ─── The mount batch (H13) ──────────────────────────────────────────────────

interface Pending {
  label: string;
  /** > 6 pending: jump to the end state (store, no motion). */
  consume: () => void;
  /** ≤ 6 pending: go on (play now if in view, else wait to be seen). */
  then: () => void;
}
const mountBatch: Pending[] = [];
let batchScheduled = false;

/** The events pending at one mount: more than SINCE_MAX all jump to their end state, named once by the SINCE_LINE. */
function settleBatch(): void {
  batchScheduled = false;
  const batch = mountBatch.splice(0);
  const skip = sequenceAtMount(batch.map((b) => b.label)) != null;
  for (const b of batch) (skip ? b.consume : b.then)();
}

/** Joins the mount batch; the returned function leaves it (a tracker disposed before the batch settles). */
function joinBatch(p: Pending): () => void {
  mountBatch.push(p);
  if (!batchScheduled) {
    batchScheduled = true;
    setTimeout(settleBatch, 0);
  }
  return () => {
    const i = mountBatch.indexOf(p);
    if (i >= 0) mountBatch.splice(i, 1);
  };
}

// ─── The tracker (imperative; the hooks are thin wrappers) ──────────────────

export interface SeenOutcome {
  changed: boolean;
  /** The last-seen token (a string value's hashSeed), or null. */
  from: number | null;
  inViewAtHydration: boolean;
}

export interface TrackOptions {
  threshold?: number;
  /** The SINCE_LINE words for this event ("milestone 2 reached"). */
  label?: string;
  /** Arm the from-state while offscreen (data-mg-armed). Default true. */
  arm?: boolean;
  /** Called once when a changed value is seen (the motion runs here). */
  onChange: (o: SeenOutcome) => void;
}

/**
 * Tracks one seen-once event on an element. Returns a disposer.
 *   first-ever view → stores (when seen), never changed
 *   same value      → nothing
 *   changed, in view at hydration → onChange({ inViewAtHydration: true }) after the mount batch, then stores
 *   changed, offscreen → arms as it approaches; onChange at 50% in view, then stores; never seen → not stored
 */
export function trackSeenEvent(el: Element, key: SeenKey, value: SeenValue, opts: TrackOptions): () => void {
  const threshold = opts.threshold ?? SEEN_THRESHOLD;
  const token = seenToken(value);
  const stored = readSeen(key);
  const inView = visibleRatio(el) >= threshold;
  let disposed = false;
  let consumed = false;
  const store = () => writeSeen(key, value);
  const disarm = () => el.removeAttribute?.("data-mg-armed");

  if (stored === token) return () => undefined;
  if (stored === null) {
    if (inView) {
      store();
      return () => undefined;
    }
    const stop = watch(el, {
      onArm: () => undefined,
      onVisible: () => {
        store();
        stop();
      },
    });
    return stop;
  }

  const fire = (inViewAtHydration: boolean) => {
    if (disposed || consumed) return;
    consumed = true;
    disarm();
    store();
    opts.onChange({ changed: true, from: stored, inViewAtHydration });
  };
  let stop: () => void = () => undefined;
  const leave = joinBatch({
    label: opts.label ?? key.what,
    consume: () => {
      if (disposed) return;
      consumed = true;
      disarm();
      store();
    },
    then: () => {
      if (disposed || consumed) return;
      if (inView) fire(true);
      else {
        stop = watch(el, {
          onArm: (near) => {
            if (opts.arm === false || consumed || motionLevel() === "still") return;
            if (near && visibleRatio(el) < threshold) el.setAttribute?.("data-mg-armed", "");
            else if (!near) disarm();
          },
          onVisible: () => {
            fire(false);
            stop();
          },
        });
      }
    },
  });
  return () => {
    disposed = true;
    leave();
    disarm();
    stop();
  };
}

/** useSeenValue's step: the last-seen value (null when unseen or equal), and the current one stored. */
export function seenValueStep(key: SeenKey, value: number): number | null {
  const prev = readSeen(key);
  writeSeen(key, value);
  return prev !== null && prev !== value ? prev : null;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

const idOf = (k: SeenKey | null) => (k ? `${k.roadmapId}|${k.basis}|${k.what}` : "");

/** `key` null: nothing is tracked (a surface with no seen key, e.g. a fixture). */
export function useSeenEvent(key: SeenKey | null, value: SeenValue, ref: RefObject<Element | null>, opts?: { threshold?: number; label?: string }): SeenOutcome {
  const [out, setOut] = useState<SeenOutcome>({ changed: false, from: null, inViewAtHydration: false });
  const id = idOf(key);
  const threshold = opts?.threshold;
  const label = opts?.label;
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    keyRef.current = key;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    const k = keyRef.current;
    if (!el || !k) return;
    return trackSeenEvent(el, k, value, { threshold, label, onChange: setOut });
    // the key's identity is its string id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, value, threshold, label]);
  return out;
}

export function useSeenValue(key: SeenKey | null, value: number): number | null {
  const [seen, setSeen] = useState<number | null>(null);
  const id = idOf(key);
  const keyRef = useRef(key);
  // one step per (key, value): an effect that runs twice (Strict Mode) must not read back the value it just stored
  const stepRef = useRef<{ id: string; value: number; prev: number | null } | null>(null);
  useLayoutEffect(() => {
    keyRef.current = key;
  });
  useEffect(() => {
    const k = keyRef.current;
    if (!k) return;
    const memo = stepRef.current;
    const prev = memo && memo.id === id && memo.value === value ? memo.prev : seenValueStep(k, value);
    stepRef.current = { id, value, prev };
    // A stored last-seen value is an external system; syncing it into state after mount is the point.
    setSeen(prev);
  }, [id, value]);
  return seen;
}

export function usePlayOnSeen(
  ref: RefObject<Element | null>,
  key: SeenKey | null,
  value: SeenValue,
  motion: GlyphMotion,
  opts?: Omit<PlayGlyphOptions, "licence" | "accent"> & { label?: string; when?: (from: number | null, to: number) => boolean }
): void {
  const id = idOf(key);
  const keyRef = useRef(key);
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    keyRef.current = key;
    optsRef.current = opts;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    const k = keyRef.current;
    if (!el || !k) return;
    return trackSeenEvent(el, k, value, {
      label: optsRef.current?.label,
      onChange: ({ from, inViewAtHydration }) => {
        const o = optsRef.current;
        if (o?.when && !o.when(from, seenToken(value))) return;
        const { label: _label, when: _when, ...rest } = o ?? {};
        void _label;
        void _when;
        const run = () => playGlyph(el, motion, { ...rest, licence: MOTION_LICENCE[motion], accent: inViewAtHydration });
        const order = CHAIN_ORDER[motion];
        if (order != null) sequence({ run, order });
        else void run();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, value, motion]);
}

export function useSinceLine(): SinceLine | null {
  return useSyncExternalStore(subscribeSince, currentSince, () => null);
}

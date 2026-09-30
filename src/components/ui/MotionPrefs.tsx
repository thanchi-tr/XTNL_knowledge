"use client";

/**
 * FROZEN CONTRACT — Feedback prefs on the client (L0-foundation).
 *
 *   <MotionPrefsProvider/>      mounted once by AppShell: follows prefers-reduced-motion while
 *                               the pref is "system", and other tabs' changes (storage event)
 *   useMotionPref() → { prefs, motion, setPref }
 *     prefs   FeedbackPrefs (theme, motion, sound, haptics, autoAdvance)
 *     motion  the resolved level on html[data-motion]: "full" | "calm" | "still"
 *     setPref(key, value)   writes html[data-*], the localStorage mirror the pre-paint
 *                           script reads, and (theme, motion, autoAdvance) L3's savePrefs
 *   readPrefs(), currentMotion()   non-React readers
 *
 * Sound and haptics are per device: they stay in localStorage only.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { savePrefs } from "@/app/actions/celebrations";
import {
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  parsePrefs,
  resolveMotion,
  type FeedbackPrefs,
  type MotionLevel,
} from "@/lib/celebration-types";

const listeners = new Set<() => void>();
let cache: FeedbackPrefs | null = null;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function readPrefs(): FeedbackPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  if (cache) return cache;
  try {
    cache = parsePrefs(window.localStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  return cache;
}

export function currentMotion(): MotionLevel {
  return resolveMotion(readPrefs().motion, reducedMotion());
}

function apply(prefs: FeedbackPrefs) {
  const root = document.documentElement;
  root.setAttribute("data-theme", prefs.theme);
  root.setAttribute("data-motion", resolveMotion(prefs.motion, reducedMotion()));
}

function emit() {
  for (const l of listeners) l();
}

export function setPref<K extends keyof FeedbackPrefs>(key: K, value: FeedbackPrefs[K]): void {
  const next = { ...readPrefs(), [key]: value } as FeedbackPrefs;
  cache = next;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the attribute still applies for this page */
  }
  apply(next);
  emit();
  if (key === "theme" || key === "motion" || key === "autoAdvance") {
    void savePrefs({ [key]: value } as Partial<FeedbackPrefs>).catch(() => undefined);
  }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const serverPrefs = () => DEFAULT_PREFS;

export function useMotionPref(): { prefs: FeedbackPrefs; motion: MotionLevel; setPref: typeof setPref } {
  const prefs = useSyncExternalStore(subscribe, readPrefs, serverPrefs);
  const motion = useSyncExternalStore(subscribe, currentMotion, () => "full" as MotionLevel);
  return { prefs, motion, setPref };
}

export function MotionPrefsProvider({ children }: { children?: ReactNode }) {
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMq = () => {
      if (readPrefs().motion === "system") {
        apply(readPrefs());
        emit();
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFS_STORAGE_KEY) return;
      cache = null;
      apply(readPrefs());
      emit();
    };
    mq?.addEventListener("change", onMq);
    window.addEventListener("storage", onStorage);
    return () => {
      mq?.removeEventListener("change", onMq);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return <>{children}</>;
}

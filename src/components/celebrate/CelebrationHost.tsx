"use client";

/**
 * L3-celebrate — the one presenter for Seals (T2) and Ascensions (T3).
 * Mounted once by the root layout (zero props; L0 placed it).
 *
 *   - Registers as the primary presenter of L0's queue (src/lib/celebrate.ts):
 *     one moment at a time, highest tier first; T2s that fire during a review
 *     run merge into its recap and T3s wait for the run to close (the queue).
 *   - T2 → SealCard at the dock (stacked above any live toast), or inside a
 *     staged target with no button (done after its hold ceiling).
 *     T3 → AscensionCurtain with the staged art, backdrop, node and action.
 *   - Marks each persisted moment seen as it starts (first sight wins, so the
 *     other device never replays it) through /api/celebrations, off the Server
 *     Action queue so it never delays a tick or an answer.
 *   - On load, on return to the tab (at most once a minute) and on
 *     refreshPending(): pulls unseen moments (deferred ones surface on the next
 *     open) and the account's Feedback prefs, which win over this device's
 *     mirror; a device whose account never saved any seeds it once.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { savePrefs } from "@/app/actions/celebrations";
import { readPrefs, setPref } from "@/components/ui/MotionPrefs";
import { enqueue, registerPresenter } from "@/lib/celebrate";
import { DEFAULT_PREFS, parsePrefs, type CelebrationEvent, type FeedbackPrefs } from "@/lib/celebration-types";
import { AscensionCurtain } from "./AscensionCurtain";
import { SealCard } from "./SealCard";
import { CELEBRATIONS_URL, REFRESH_EVENT, ackShown, takeStaged, type StagedExtras } from "./stage";
import "./celebrate.css";

interface Showing {
  ev: CelebrationEvent;
  done: () => void;
  extras: StagedExtras;
}

const ACCOUNT_KEYS = ["theme", "motion", "autoAdvance"] as const;
const PULL_EVERY_MS = 60_000;

/**
 * Per key: a value the account chose wins over this device's mirror; a key the
 * account never chose is seeded from this device when the device chose one.
 */
function reconcilePrefs(server: Partial<FeedbackPrefs> | null): void {
  const local = readPrefs();
  const raw = (server ?? {}) as Record<string, unknown>;
  const parsed = parsePrefs(raw);
  const seed: Partial<FeedbackPrefs> = {};
  for (const k of ACCOUNT_KEYS) {
    // Only a value the account chose, and a valid one (this came over the network).
    const theirs = k in raw && raw[k] === parsed[k] ? parsed[k] : undefined;
    if (theirs !== undefined) {
      if (theirs !== local[k]) setPref(k, theirs as never);
    } else if (local[k] !== DEFAULT_PREFS[k]) {
      (seed as Record<string, string>)[k] = local[k];
    }
  }
  if (Object.keys(seed).length) void savePrefs(seed).catch(() => undefined);
}

function isEvent(v: unknown): v is CelebrationEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<CelebrationEvent>;
  return typeof e.id === "string" && (e.tier === 2 || e.tier === 3) && typeof e.kind === "string" && !!e.facts && Array.isArray(e.what);
}

export function CelebrationHost() {
  const [showing, setShowing] = useState<Showing | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // The portal target only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(document.body);
    return registerPresenter((ev, done) => {
      ackShown([ev]);
      setShowing({ ev, done, extras: takeStaged(ev.id) ?? {} });
    });
  }, []);

  // Pull unseen moments and the account prefs: on load, on return, on request.
  useEffect(() => {
    let last = 0;
    let first = true;
    let inflight = false;
    const pull = async (force: boolean) => {
      if (inflight || (!force && Date.now() - last < PULL_EVERY_MS)) return;
      inflight = true;
      last = Date.now();
      try {
        const res = await fetch(CELEBRATIONS_URL, { cache: "no-store", headers: { accept: "application/json" } });
        if (!res.ok) return;
        const body = (await res.json()) as { pending?: unknown[]; prefs?: Partial<FeedbackPrefs> | null };
        if (first) {
          first = false;
          reconcilePrefs(body.prefs ?? null);
        }
        for (const ev of body.pending ?? []) if (isEvent(ev)) enqueue(ev);
      } catch {
        /* offline: the next open tries again */
      } finally {
        inflight = false;
      }
    };
    void pull(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull(false);
    };
    const onRefresh = () => void pull(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, []);

  if (!showing || !host) return null;
  const { ev, extras } = showing;
  const finish = () => {
    const d = showing.done;
    setShowing(null);
    d();
  };

  if (ev.tier === 3) {
    return createPortal(
      <AscensionCurtain
        key={ev.id}
        ev={ev}
        art={extras.art}
        backdrop={extras.backdrop}
        sky={extras.sky}
        fromEl={extras.fromEl}
        primary={extras.primary}
        onDone={finish}
      />,
      host
    );
  }
  if (extras.target && extras.target.isConnected) {
    return createPortal(<InlineSeal key={ev.id} ev={ev} onHoldEnd={finish} />, extras.target);
  }
  return createPortal(
    <SealDock>
      <SealCard key={ev.id} ev={ev} onDone={finish} />
    </SealDock>,
    host
  );
}

/** A staged in-panel Seal: no button; the queue moves on after its hold ceiling (1.4 s, mastery 2.2 s). */
function InlineSeal({ ev, onHoldEnd }: { ev: CelebrationEvent; onHoldEnd: () => void }) {
  const cb = useRef(onHoldEnd);
  useEffect(() => {
    cb.current = onHoldEnd;
  }, [onHoldEnd]);
  useEffect(() => {
    const t = window.setTimeout(() => cb.current(), ev.facts.holdMs ?? 1400);
    return () => window.clearTimeout(t);
  }, [ev.id, ev.facts.holdMs]);
  return <SealCard ev={ev} inline />;
}

/** The dock the Seal sits in: the toast dock's slot, lifted above any live toast. */
function SealDock({ children }: { children: ReactNode }) {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const toastDock = Array.from(document.querySelectorAll<HTMLElement>(".dock")).find((d) => !d.classList.contains("seal-dock"));
    if (!toastDock || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = toastDock.getBoundingClientRect().height;
      setLift(h > 0 ? Math.ceil(h) + 8 : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(toastDock);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="dock seal-dock" style={{ "--dock-lift": `${lift}px` } as CSSProperties}>
      {children}
    </div>
  );
}

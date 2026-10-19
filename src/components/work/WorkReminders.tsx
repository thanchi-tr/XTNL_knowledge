"use client";

/**
 * The in-app reminder (2026-10-20): mounted once by the root layout, on every page, it needs no setup (no VAPID keys,
 * no scheduler, no permission). It knows the user's open scheduled tasks with a reminder (GET /api/scheduled/due:
 * due from a day ago to a day ahead), asks again every BANNER_POLL_MS while the page is visible and whenever it comes
 * back (focus, visibilitychange), and sets a local timer for the next one due, so a task that comes due while the app
 * is open shows on time.
 *
 * When one comes due: a banner above the bottom navigation (never over the capture button; top right from 600), in a
 * polite live region, never taking focus. It says the task's title, its customer (name · ID), when and the channel;
 * its actions: Done, Snooze 10 min, Open (the task on its agenda) and dismiss (×). Several at once stack into
 * "3 due · Next: <title>" (the actions act on the next one). With it, a soft sound and a short haptic, by this
 * device's own Settings › Feedback choices (on by default; silent in Still), and no movement unless motion is Full.
 *
 * Once per device per due time: each task's id@dueAt is recorded in localStorage (BANNER_STORAGE_KEY; every read and
 * write in try/catch, pruned after a few days) when it shows, so a reload or another page never shows it twice, and a
 * snoozed or moved task (a new dueAt) shows again. It never marks a reminder sent: that is the push dispatcher's.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { doneScheduledTask, reopenScheduledTask, snoozeScheduledTask } from "@/app/actions/scheduled-tasks";
import {
  BANNER_POLL_MS,
  BANNER_STORAGE_KEY,
  REMINDER_HAPTIC,
  REMINDER_TONES,
  bannerHeadOf,
  bannerKeyOf,
  bannerMetaOf,
  bannerQueueOf,
  nextBannerInMs,
  prunedShown,
  scheduledTaskHref,
  type BannerTask,
} from "@/lib/scheduled-tasks";
import { DEVICE_PREFS_STORAGE_KEY, PREFS_STORAGE_KEY, readStoredPrefs } from "@/lib/celebration-types";
import { motionLevel } from "@/lib/motion";
import { Icon } from "@/components/ui/Icon";
import { pushToast } from "@/components/ui/toast-store";
import { ChannelGlyph } from "./ChannelGlyph";
import "./reminders.css";

export const DUE_ROUTE = "/api/scheduled/due";

/** This device's shown keys (id@dueAt → when it was due), pruned; {} when storage is unavailable. */
function readShown(now: number): Record<string, number> {
  try {
    return prunedShown(JSON.parse(window.localStorage.getItem(BANNER_STORAGE_KEY) ?? "{}"), now);
  } catch {
    return {};
  }
}

function writeShown(shown: Record<string, number>): void {
  try {
    window.localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(shown));
  } catch {
    /* private mode: it may show again on another page; never a crash */
  }
}

type AudioCtor = typeof AudioContext;
let audio: AudioContext | null = null;

/** The soft sound and the short haptic, by this device's own choices; silent in Still. */
function chimeOnce(): void {
  if (motionLevel() === "still") return;
  let prefs = readStoredPrefs(null, null);
  try {
    prefs = readStoredPrefs(window.localStorage.getItem(PREFS_STORAGE_KEY), window.localStorage.getItem(DEVICE_PREFS_STORAGE_KEY));
  } catch {
    /* the defaults: sound soft, haptics on */
  }
  if (prefs.sound === "soft") {
    try {
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (Ctor) {
        audio = audio ?? new Ctor();
        if (audio.state === "suspended") void audio.resume().catch(() => undefined);
        const t = audio.currentTime;
        for (const [f, d, len, gain] of REMINDER_TONES) {
          const o = audio.createOscillator();
          const g = audio.createGain();
          o.type = "sine";
          o.frequency.value = f;
          g.gain.setValueAtTime(0, t + d);
          g.gain.linearRampToValueAtTime(gain, t + d + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
          o.connect(g).connect(audio.destination);
          o.start(t + d);
          o.stop(t + d + len + 0.02);
        }
      }
    } catch {
      /* sound is a courtesy */
    }
  }
  if (prefs.haptics === "on") {
    try {
      navigator.vibrate?.([...REMINDER_HAPTIC]);
    } catch {
      /* ignore */
    }
  }
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: "Couldn't reach the server. Try again." };
  }
}

export function WorkReminders() {
  const [tasks, setTasks] = useState<BannerTask[]>([]);
  const [stack, setStack] = useState<BannerTask[]>([]);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  /** The clock the banner's words read (the server's, learnt from each answer), set when a task joins it. */
  const [clock, setClock] = useState(0);
  const skew = useRef(0);

  const load = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetch(DUE_ROUTE, { cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) return;
      const body = (await res.json()) as { nowIso?: string; tasks?: BannerTask[] };
      if (body.nowIso) {
        const server = Date.parse(body.nowIso);
        if (Number.isFinite(server)) skew.current = server - Date.now();
      }
      setTasks(Array.isArray(body.tasks) ? body.tasks : []);
    } catch {
      /* offline: keep what we have; the next poll asks again */
    }
  }, []);

  // The read: now, every minute while visible, and whenever the page comes back.
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(), BANNER_POLL_MS);
    const onBack = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [load]);

  // What has come due and not shown on this device joins the banner (once); a local timer wakes for the next one. The
  // device's record is written when the banner draws them (in the frame), so an effect run that is cancelled (Strict
  // Mode's double run, a quick navigation) never marks a task shown that nobody saw.
  useEffect(() => {
    const now = Date.now() + skew.current;
    const keys = new Set(Object.keys(readShown(now)));
    const due = bannerQueueOf(tasks, now, keys);
    let raf: number | null = null;
    if (due.length > 0) {
      raf = window.requestAnimationFrame(() => {
        const shown = readShown(Date.now() + skew.current);
        for (const t of due) shown[bannerKeyOf(t)] = Date.parse(t.dueAt);
        writeShown(shown);
        setStack((s) => [...s.filter((x) => !due.some((d) => d.id === x.id)), ...due]);
        setClock(Date.now() + skew.current);
        setLine(null);
        setFresh(motionLevel() === "full");
        chimeOnce();
      });
      for (const t of due) keys.add(bannerKeyOf(t));
    }
    const wait = nextBannerInMs(tasks, now, keys);
    const timer = wait !== null ? window.setTimeout(() => setTick((n) => n + 1), wait + 250) : null;
    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [tasks, tick]);

  // The entrance mark lasts one beat.
  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setFresh(false), 400);
    return () => window.clearTimeout(t);
  }, [fresh]);

  const head = stack[0] ?? null;

  function drop(id: string) {
    setStack((s) => s.filter((x) => x.id !== id));
    setTasks((ts) => ts.filter((x) => x.id !== id));
  }

  function done(t: BannerTask) {
    setBusy(true);
    void call(() => doneScheduledTask(t.id, null, { refresh: true })).then((res) => {
      setBusy(false);
      if (!res.ok) {
        setLine(res.error);
        return;
      }
      drop(t.id);
      pushToast({ key: `st-done-${t.id}`, title: "Done", body: t.title, holdMs: 10_000, action: { label: "Undo", onAction: () => void call(() => reopenScheduledTask(t.id, null, { refresh: true })) } });
    });
  }

  function snooze(t: BannerTask) {
    setBusy(true);
    void call(() => snoozeScheduledTask(t.id, "10min", { refresh: true })).then((res) => {
      setBusy(false);
      if (!res.ok) {
        setLine(res.error);
        return;
      }
      drop(t.id);
      // Back in ten minutes: its new due time is a new key, so it shows again then.
      void load();
    });
  }

  return (
    <div className="wrm" role="status" aria-live="polite" aria-atomic="true">
      {head && (
        <section className="wrm-card" data-fresh={fresh ? "" : undefined} aria-label={stack.length > 1 ? `${stack.length} scheduled tasks due` : "Scheduled task due"}>
          <div className="wrm-top">
            <span className="wrm-glyph">
              <ChannelGlyph channel={head.channel} />
            </span>
            <div className="wrm-words">
              <span className="wrm-eyebrow">{stack.length > 1 ? "Scheduled tasks" : "Scheduled task"} · {head.boardName}</span>
              <b className="wrm-title">{bannerHeadOf(stack)}</b>
              <span className="wrm-meta">{bannerMetaOf(head, new Date(clock))}</span>
              {line && <span className="wrm-line">{line}</span>}
            </div>
            <button type="button" className="wrm-x" onClick={() => setStack([])} aria-label={stack.length > 1 ? "Dismiss these reminders" : "Dismiss this reminder"}>
              <Icon name="x" />
            </button>
          </div>
          <div className="wrm-acts">
            <button type="button" className="wrm-act wrm-done" onClick={() => done(head)} disabled={busy}>
              <Icon name="check" />
              Done
            </button>
            <button type="button" className="wrm-act" onClick={() => snooze(head)} disabled={busy}>
              <Icon name="clock" />
              Snooze 10 min
            </button>
            <Link className="wrm-act" href={scheduledTaskHref(head.boardId, head.id)} onClick={() => setStack((s) => s.filter((x) => x.id !== head.id))}>
              Open
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

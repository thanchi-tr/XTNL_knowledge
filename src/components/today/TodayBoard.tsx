"use client";

import "./today.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  applyOps,
  buildBoard,
  canUndo,
  projectRow,
  questOf,
  reflected,
  ruleOf,
  type BoardData,
  type BoardOp,
  type BoardRow,
  type InboxChoice,
} from "@/lib/today-board";
import type { DailyStreak } from "@/lib/streak-curve";
import { fullDayInputOf, fullDayOf, type FullDayRingKind } from "@/lib/full-day";
import { isTypingTarget } from "@/lib/capture-parse";
import { announce, chime, mark } from "@/lib/celebrate";
import type { T1Kind } from "@/lib/celebration-types";
import {
  againTask,
  archiveTask,
  clarifyInbox,
  completeTask,
  goalProgress,
  renameTask,
  rescheduleTask,
  resizeTask,
  setBandOverride,
  setDailyCapacity,
  skipTask,
  unarchiveTask,
  undoCompletion,
} from "@/app/actions/tasks";
import { openCapture } from "@/components/capture/events";
import { Button } from "@/components/ui/Button";
import { Icon, Sigil } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { dismissToast, pushToast } from "@/components/ui/toast-store";
import { cx } from "@/components/ui/cx";
import { TaskRow } from "./TaskRow";
import { TaskDrawer, type DrawerWork } from "./TaskDrawer";
import { NextUp } from "./NextUp";
import { GoalsStrip } from "./GoalsStrip";
import { InboxSheet } from "./InboxSheet";
import { CapacityPanel } from "./CapacityTile";
import { ReceiptSheet } from "./ReceiptSheet";
import { UndoToast, focusUndoOnce } from "./UndoToast";
import { DayLedger } from "./DayLedger";
import { Lane } from "./Lane";
import { AskCard } from "./AskCard";
import { CloseDaySheet, type CloseItem } from "./CloseDaySheet";
import { fmtXp } from "./format";
import { holdLedger, useAfterFlight } from "./ledger-gate";
import {
  REMOVE_UNDO_MS,
  boardDayEnded,
  capacityChosen,
  closeDayProminent,
  dayMomentsOf,
  laneTally,
  mergeSkew,
  momentText,
  nextBoardTick,
  nextUpOf,
  receiptIdOf,
  recordByLabel,
  rowMinutes,
  splitTodayLane,
  todayAsksOf,
  todayLaneNote,
  tomorrowOffer,
  upcomingOf,
  type AskNotice,
  type DayMoment,
  type DaySnapshot,
} from "./board-ui";

interface Props {
  data: BoardData;
  streak: DailyStreak;
  /** When the server rendered this board (ISO): the clock for the undo window until the next tap. */
  nowIso: string;
  /** The notification feed's notices (Asks read the same feed as the bell). */
  notices: AskNotice[];
  /** Today's focus field line ("Statistics pays +32% today"), or null. */
  focus: string | null;
  /** Encounters ready, by name. */
  bosses: string[];
  /** The clock line under the board (LiveClock, the zone, the rules link). */
  footer?: ReactNode;
}

interface Pending {
  op: BoardOp;
  /** The server has answered; drop it once the props show it. */
  settled: boolean;
  /** The props it was applied over, to tell whether a refresh has landed since. */
  base: BoardData;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** An Archive or a Drop, with its Undo on screen for REMOVE_UNDO_MS. */
interface Removal {
  /** The hide op that took the row off the board. */
  opId: string;
  templateId: string;
  verb: "Archived" | "Dropped";
  title: string;
  timer: number;
  /** When its Undo expires (Date.now clock). */
  until: number;
}

const REFRESH = { refresh: true } as const;

// Event-handler clocks, kept at module level: they run on a tap, never
// during render, which is what keeps the server and browser renders equal.
let opSeq = 0;
const tapTime = (): number => Date.now();
const nextOpId = (): string => `${tapTime().toString(36)}-${(opSeq += 1)}`;
/** An id no other tap, tab or device will produce: the goal '+1' dedupe key. */
const freshKey = (): string => `${nextOpId()}-${Math.random().toString(36).slice(2, 8)}`;
/** The device clock's offset from the server's (board-ui.ts, mergeSkew); learnt per session from render times. */
let clockSkew: number | null = null;
/** Now, on the server's clock: what undo windows, cooldowns and the day edge are judged against. */
const serverNow = (): number => Date.now() + (clockSkew ?? 0);
/** Tier 1 moments already shown in this tab: an undo and a re-tick never chime twice. */
const firedMoments = new Set<string>();
/** A day moment only follows a tap made this recently (never a refresh, never arrival). */
const MOMENT_WINDOW_MS = 4000;

function without<V>(record: Record<string, V>, key: string): Record<string, V> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * The Today board: what the day asks for, in the order it is worth doing
 * (redesign "Sigil & Slate": one DOM, three orders by container width).
 *
 * The board holds its own optimistic copy of the day: a tick lands on the
 * tap, every other row re-prices against the new knee base straight away
 * (the same `planCompletion` the server pays with), and the view reconciles
 * from props when the action's refreshed page arrives. Pending operations
 * that the fresh props already show are dropped without a flash; a failed
 * one snaps back and says why.
 *
 * Archive and Drop keep an Undo on screen for ten seconds (the ToastDock,
 * or a line inside the inbox sheet). The board keeps its own clock honest
 * without polling: one timer to the next moment something on screen
 * changes by itself (an Undo expiring, midnight, the 04:00 day edge).
 *
 * Rewards are the redesign's ladder and nothing louder: a tick is Tier 0
 * (the check draws, the "+N" token flies to the life-XP cell, the figure
 * counts up); the first deed of the day, a closed ring, a kept Must lane
 * and a Full day are Tier 1, once, after a tap, never on arrival. Every
 * number is the real one.
 */
export function TodayBoard({ data, streak, nowIso, notices, focus, bosses, footer }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Information, not failure: a tick that was already recorded, or priced differently than its row said. */
  const [notice, setNotice] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  /** Minutes picked in the open drawer. They belong to that drawer: closing it forgets them. */
  const [drawerMinutes, setDrawerMinutes] = useState<number | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [yesterdayOpen, setYesterdayOpen] = useState(false);
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [anytimeOpen, setAnytimeOpen] = useState(false);
  const [busyGoals, setBusyGoals] = useState(false);
  /** Resizes, self-ratings and renames in flight, by template. */
  const [working, setWorking] = useState<Record<string, DrawerWork>>({});
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [capacityBusy, setCapacityBusy] = useState(false);
  /** Visual beats of a Tier 1 moment, cleared once they have played. */
  const [beat, setBeat] = useState<{ glint: Set<FullDayRingKind>; full: boolean; lane: boolean } | null>(null);
  // The undo window's clock, on the server's time: its render time, then the
  // time of the last tap or timer (serverNow). Never read during render, so
  // hydration matches.
  const [clock, setClock] = useState(() => Date.parse(nowIso));

  // Reconcile with fresh props during render: an effect would paint the
  // stale board once, then flash to the new one.
  const [seen, setSeen] = useState({ data, nowIso });
  if (seen.data !== data || seen.nowIso !== nowIso) {
    // A new day's board: yesterday's notices ('a new day started…') are done.
    if (seen.data.today !== data.today) setNotice(null);
    setSeen({ data, nowIso });
    setClock((c) => Math.max(c, Date.parse(nowIso)));
    setPending((prev) => prev.filter((p) => !p.settled && !reflected(data, p.op)));
  }

  // Settling reads the latest props, which only matter after a commit.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  // Each server render says what time it was there; the board's clock runs on that.
  useEffect(() => {
    clockSkew = mergeSkew(clockSkew, Date.parse(nowIso), Date.now());
  }, [nowIso]);
  /** The removal whose Undo is on screen, for its timer. Written only by handlers. */
  const removalRef = useRef<Removal | null>(null);
  /** When the player last ticked: a day moment only follows a tap. */
  const actedAt = useRef(0);

  // Elements the Tier 1 moments light.
  const dayTileRef = useRef<HTMLElement | null>(null);
  const sealRef = useRef<HTMLDivElement | null>(null);
  const fullStampRef = useRef<HTMLSpanElement | null>(null);
  const mustRingRef = useRef<HTMLDivElement | null>(null);
  const questRingRef = useRef<HTMLDivElement | null>(null);
  const lifeRingRef = useRef<HTMLDivElement | null>(null);
  const mustBodyRef = useRef<HTMLDivElement | null>(null);

  const ops = useMemo(() => pending.map((p) => p.op), [pending]);
  const current = useMemo(() => applyOps(data, ops), [data, ops]);
  const board = useMemo(() => buildBoard(current), [current]);
  const quest = useMemo(
    () =>
      questOf({
        dayOpenQty: current.ledger.today.dayOpenQty,
        reviews: current.ledger.today.reviews,
        dueNow: current.dueNow ?? 0,
        reviewXp: current.ledger.today.reviewXp,
      }),
    [current]
  );
  const fullDay = useMemo(() => fullDayOf(fullDayInputOf(current, board, quest)), [current, board, quest]);
  // The removed row is gone from the board, so its in-flight write blocks
  // nothing else: the inbox's other items stay usable while a Drop lands.
  const removedId = removal?.opId ?? null;
  const busyTemplates = useMemo(
    () =>
      new Set(
        pending.filter((p) => !p.settled && p.op.id !== removedId).map((p) => ("templateId" in p.op ? p.op.templateId : null))
      ),
    [pending, removedId]
  );

  const closeReceipt = useCallback(() => setReceiptKey(null), []);
  const closeInbox = useCallback(() => setInboxOpen(false), []);

  /**
   * Sends one write whose optimistic op (if any) is already applied, and on
   * the answer either settles it (with anything the server returned to fold
   * in) or takes it back and shows the reason.
   */
  const send = useCallback(
    <T,>(op: BoardOp | null, call: () => Promise<Result<T>>, onOk?: (value: T) => Partial<BoardOp> | void) => {
      startTransition(async () => {
        let res: Result<T>;
        try {
          res = await call();
        } catch {
          res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
        }
        if (!res.ok) {
          if (op) setPending((prev) => prev.filter((p) => p.op.id !== op.id));
          setError(res.error);
          return;
        }
        const patch = onOk?.(res.value);
        if (!op) return;
        setPending((prev) =>
          prev.flatMap((p) => {
            if (p.op.id !== op.id) return [p];
            const next = (patch ? { ...p.op, ...patch } : p.op) as BoardOp;
            const latest = dataRef.current;
            // Already on screen from the refreshed props: nothing left to hold.
            if (reflected(latest, next)) return [];
            if (next.kind === "hide" && latest !== p.base) return [];
            return [{ ...p, op: next, settled: true }];
          })
        );
      });
    },
    []
  );

  /** Applies an op now and sends its write. */
  function dispatch<T>(op: BoardOp | null, call: () => Promise<Result<T>>, onOk?: (value: T) => Partial<BoardOp> | void) {
    setError(null);
    setNotice(null);
    setClock((c) => Math.max(c, serverNow()));
    if (op) setPending((prev) => [...prev, { op, settled: false, base: data }]);
    send(op, call, onOk);
  }

  /** A slower write from the drawer (resize, self-rating, rename): marked as working until it answers. */
  function work<T>(templateId: string, w: DrawerWork, call: () => Promise<Result<T>>, onOk?: (value: T) => void) {
    setWorking((prev) => ({ ...prev, [templateId]: w }));
    dispatch(
      null,
      async () => {
        try {
          return await call();
        } finally {
          setWorking((prev) => without(prev, templateId));
        }
      },
      onOk
    );
  }

  // ── Archive and Drop, with Undo ─────────────────────────────────────────

  /**
   * Archives (or drops) at once — the write is durable the moment it lands —
   * and keeps 'Archived · title · Undo' on screen for ten seconds. Undo is
   * unarchiveTask, which brings the task back with its history and streak.
   */
  function remove(row: { id: string; title: string }, verb: Removal["verb"], call: () => Promise<Result<unknown>>) {
    const prior = removalRef.current;
    if (prior) window.clearTimeout(prior.timer);
    const op: BoardOp = { id: nextOpId(), kind: "hide", templateId: row.id };
    // Nothing to undo if the removal itself failed: the row snaps back with
    // the error, and the Undo goes with it.
    const dropUndo = () => {
      const r = removalRef.current;
      if (!r || r.opId !== op.id) return;
      window.clearTimeout(r.timer);
      removalRef.current = null;
      setRemoval(null);
    };
    dispatch(op, async () => {
      let res: Result<unknown>;
      try {
        res = await call();
      } catch (err) {
        dropUndo();
        throw err;
      }
      if (!res.ok) dropUndo();
      return res;
    });
    const next: Removal = {
      opId: op.id,
      templateId: row.id,
      verb,
      title: row.title,
      timer: window.setTimeout(dropUndo, REMOVE_UNDO_MS),
      until: tapTime() + REMOVE_UNDO_MS,
    };
    removalRef.current = next;
    setRemoval(next);
  }

  function undoRemoval() {
    const r = removalRef.current;
    if (!r) return;
    window.clearTimeout(r.timer);
    removalRef.current = null;
    setRemoval(null);
    // The row stays hidden until the restore lands, then comes back with the
    // refreshed props. Server actions run in order, so the archive is always
    // undone after it, never before.
    dispatch(null, () => unarchiveTask(r.templateId, REFRESH), () => {
      setPending((prev) => prev.filter((p) => p.op.id !== r.opId));
      setNotice(`${r.title} is back.`);
    });
  }

  // No timer outlives the board.
  useEffect(() => () => window.clearTimeout(removalRef.current?.timer), []);

  // The Undo lives in the ToastDock while no sheet covers it (inside the
  // inbox sheet it is a line of the sheet: the dock sits under the scrim).
  const undoRemovalRef = useRef(undoRemoval);
  useEffect(() => {
    undoRemovalRef.current = undoRemoval;
  });
  useEffect(() => {
    if (!removal || inboxOpen) return;
    const id = pushToast({
      key: "today-removal",
      title: removal.verb,
      body: removal.title,
      action: { label: "Undo", onAction: () => undoRemovalRef.current() },
      holdMs: Math.max(0, removal.until - Date.now()),
    });
    // The row that held focus has gone: focus moves to Undo, once per removal.
    const t = window.setTimeout(() => {
      const toasts = document.querySelectorAll<HTMLElement>(".dock .toast");
      focusUndoOnce(removal.opId, toasts[toasts.length - 1]?.querySelector<HTMLElement>("button"));
    }, 60);
    return () => {
      window.clearTimeout(t);
      dismissToast(id);
    };
  }, [removal, inboxOpen]);

  // ── The board's clock ───────────────────────────────────────────────────

  const lanes = useMemo(() => [...board.must, ...board.todayRows, ...board.yesterdayRows, ...board.anytime], [board]);
  const nextTick = useMemo(() => nextBoardTick({ rows: lanes, today: data.today, clockMs: clock }), [lanes, data.today, clock]);
  // One timer to the next moment the screen changes by itself: an Undo
  // expiring, midnight, the day edge. Re-armed whenever the clock moves
  // (the timer itself, or a tap); never a polling loop.
  useEffect(() => {
    if (nextTick == null) return;
    const t = window.setTimeout(() => setClock((c) => Math.max(c, serverNow())), Math.max(0, nextTick - serverNow()) + 50);
    return () => window.clearTimeout(t);
  }, [nextTick, clock]);

  // Back on the tab: the clock catches up, and a board from a day that has
  // since ended reloads as today's.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = serverNow();
      setClock((c) => Math.max(c, now));
      if (boardDayEnded(dataRef.current.today, now)) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const dayEnded = boardDayEnded(data.today, clock);

  /** A tap on a board whose day has ended would book on the wrong day: reload instead. */
  function staleDay(): boolean {
    const now = serverNow();
    if (!boardDayEnded(data.today, now)) return false;
    setClock((c) => Math.max(c, now));
    setNotice("A new day started at 04:00. Loading today's board.");
    router.refresh();
    return true;
  }

  // ── Tier 0: the tick's own feedback ─────────────────────────────────────

  /** Marks a completion in place and flies its "+N" to the life-XP cell (or the MiniLedger). */
  function markTick(row: BoardRow, xp: number, from: Element | null | undefined) {
    actedAt.current = tapTime();
    const flight = mark({
      kind: "tick",
      id: `tick:${row.key}:${row.slot}`,
      text: `Kept ${row.template.title} · paid ${fmtXp(xp)} exactly`,
      amount: xp > 0 ? { kind: "xp", value: xp } : undefined,
      from: from ?? null,
    });
    if (xp > 0) holdLedger("xp", flight);
  }

  // ── Writes ──────────────────────────────────────────────────────────────

  function complete(row: BoardRow, opts: { minutes?: number | null; mvv?: boolean } = {}, from?: Element | null) {
    if (staleDay()) return;
    const id = nextOpId();
    // What the row said this tick would pay. The server's price is the
    // authority; if the day moved under the board (a size landed, another
    // device ticked), the difference is said out loud rather than hidden.
    const shown = opts.mvv ? projectRow(current, row, { mvv: true }) : opts.minutes != null ? projectRow(current, row, { minutes: opts.minutes }) : row.projection;
    const op: BoardOp = {
      id,
      kind: "complete",
      templateId: row.template.id,
      day: row.day,
      slot: row.slot,
      minutes: opts.minutes ?? null,
      mvv: opts.mvv,
      at: new Date().toISOString(),
    };
    setOpenKey(null);
    setDrawerMinutes(null);
    markTick(row, shown.xp, from);
    dispatch(
      op,
      // The row's own day: the server books only today or yesterday by its
      // own clock, so a board left open across 04:00 is refused, not misbooked.
      () => completeTask(row.template.id, { day: row.day, minutes: opts.minutes ?? null, mvv: opts.mvv }, REFRESH),
      (v) => {
        if (v.duplicate) setNotice(`${row.template.title} was already recorded. Nothing is paid twice.`);
        else if (Math.abs(v.receipt.xp - shown.xp) > 0.05) {
          setNotice(`${row.template.title} paid ${fmtXp(v.receipt.xp)} XP, not ≈ ${fmtXp(shown.xp)}: its size or today's total changed since the board loaded.`);
        }
        return { instanceId: v.instanceId, receipt: v.receipt };
      }
    );
  }

  function again(row: BoardRow, minutes: number | null) {
    if (staleDay()) return;
    const op: BoardOp = {
      id: nextOpId(),
      kind: "complete",
      templateId: row.template.id,
      day: row.day,
      slot: row.slot,
      minutes,
      at: new Date().toISOString(),
    };
    setOpenKey(null);
    setDrawerMinutes(null);
    markTick(row, projectRow(current, row, { minutes }).xp, null);
    dispatch(op, () => againTask(row.template.id, { minutes }, REFRESH), (v) => ({ instanceId: v.instanceId, receipt: v.receipt, slot: v.slot }));
  }

  function undo(row: BoardRow) {
    const instanceId = row.instanceId;
    if (!instanceId || instanceId.startsWith("opt:")) return;
    const xp = row.paid?.xp ?? 0;
    dispatch({ id: nextOpId(), kind: "undo", instanceId }, () => undoCompletion(instanceId, REFRESH));
    announce(`Undone. ${fmtXp(xp)} life XP taken back; nothing else changed.`);
  }

  function skip(row: BoardRow) {
    if (staleDay()) return;
    setOpenKey(null);
    setDrawerMinutes(null);
    dispatch({ id: nextOpId(), kind: "skip", templateId: row.template.id, day: row.day }, () => skipTask(row.template.id, REFRESH));
  }

  function moveToTomorrow(row: BoardRow) {
    if (ruleOf(row.template)) return skip(row);
    if (staleDay()) return;
    setOpenKey(null);
    setDrawerMinutes(null);
    dispatch({ id: nextOpId(), kind: "hide", templateId: row.template.id }, () => rescheduleTask(row.template.id, "tomorrow", REFRESH));
  }

  function archive(row: BoardRow) {
    setOpenKey(null);
    setDrawerMinutes(null);
    const templateId = row.template.id;
    remove({ id: templateId, title: row.template.title }, "Archived", () => archiveTask(templateId, REFRESH));
  }

  function clarify(templateId: string, choice: InboxChoice, parentId?: string) {
    if (choice === "drop") {
      const title = current.templates.find((t) => t.id === templateId)?.title ?? "Inbox item";
      remove({ id: templateId, title }, "Dropped", () => clarifyInbox(templateId, "drop", null, REFRESH));
      return;
    }
    dispatch(
      { id: nextOpId(), kind: "hide", templateId },
      () => clarifyInbox(templateId, choice, parentId ?? null, REFRESH),
      (v) => {
        if (v.href) router.push(v.href);
      }
    );
  }

  function progressGoal(goalId: string) {
    setBusyGoals(true);
    dispatch(null, async () => {
      try {
        // A fresh key per tap: a tap that reaches the server twice counts once.
        return await goalProgress(goalId, 1, { ...REFRESH, opId: freshKey() });
      } finally {
        // Cleared on every outcome, a thrown network error included, so the
        // goal buttons never stay disabled until a reload.
        setBusyGoals(false);
      }
    });
  }

  function setCapacity(minutes: number) {
    setCapacityBusy(true);
    dispatch(null, async () => {
      try {
        return await setDailyCapacity(minutes, REFRESH);
      } finally {
        setCapacityBusy(false);
      }
    });
  }

  function resize(row: BoardRow) {
    const title = row.template.title;
    work(row.template.id, { kind: "resize" }, () => resizeTask(row.template.id, REFRESH), (v) => {
      setNotice(
        v.outcome === "copied"
          ? `${title} took the size of an earlier task with the same name.`
          : `The AI sized ${title} again. The Size panel shows the new grade.`
      );
    });
  }

  // ── The day: streak, Full-day rings, and its Tier 1 moments ─────────────

  // The seal and the streak move with the first tick of the day, before the
  // round trip: a day with any live completion is an active day.
  const todayActive = streak.last7Days[streak.last7Days.length - 1] ?? false;
  const keptToday = todayActive || board.activeToday;
  const streakNow = streak.current + (!todayActive && board.activeToday ? 1 : 0);
  const mustTally = laneTally(board.must);
  const mustLaneKept = mustTally.total > 0 && mustTally.kept === mustTally.total;

  const snapshot: DaySnapshot = {
    kept: keptToday,
    rings: { musts: fullDay.rings[0].met, quest: fullDay.rings[1].met, life: fullDay.rings[2].met },
    full: fullDay.full,
    mustLane: mustLaneKept,
  };
  const dayKey = `${keptToday}|${streakNow}|${mustLaneKept}|${fullDay.rings.map((r) => `${r.value}/${r.target}/${r.met}`).join(",")}`;
  // Held back while a tick's token is in the air: the seal, the numeral and
  // the rings move when it lands, not before (ledger-gate.ts).
  const shown = useAfterFlight({ snapshot, fullDay, streakNow, mustLaneKept }, dayKey);

  const prevSnapshot = useRef<DaySnapshot>(shown.snapshot);
  const shownKey = `${shown.snapshot.kept}|${shown.snapshot.rings.musts}|${shown.snapshot.rings.quest}|${shown.snapshot.rings.life}|${shown.snapshot.full}|${shown.snapshot.mustLane}`;
  const momentCtx = useRef({ streak: shown.streakNow, musts: mustTally.total, today: data.today });
  useEffect(() => {
    momentCtx.current = { streak: shown.streakNow, musts: mustTally.total, today: data.today };
  });
  function playMoments(moments: DayMoment[]) {
    const ctx = momentCtx.current;
    // One chime per tap, the loudest meaning first; the others ride along in its sentence and glints.
    const primary: DayMoment = moments.includes("full-day")
      ? "full-day"
      : moments.includes("lane-kept")
        ? "lane-kept"
        : moments.includes("day-kept")
          ? "day-kept"
          : moments[0];
    const id = `${primary}:${ctx.today}`;
    if (firedMoments.has(id)) return;
    firedMoments.add(id);

    const glint = new Set<FullDayRingKind>();
    if (moments.includes("ring-musts")) glint.add("musts");
    if (moments.includes("ring-quest")) glint.add("quest");
    if (moments.includes("ring-life")) glint.add("life");
    setBeat({ glint, full: moments.includes("full-day"), lane: moments.includes("lane-kept") });
    window.setTimeout(() => setBeat(null), 1000);

    const say = moments
      .filter((m) => !(m === "ring-musts" && moments.includes("lane-kept")))
      .map((m) => momentText(m, ctx))
      .join(" ");
    const kind: T1Kind = primary === "full-day" ? "full-day" : primary === "lane-kept" ? "lane-kept" : primary === "day-kept" ? "day-kept" : "ring-closed";
    const ringRef = primary === "ring-quest" ? questRingRef : primary === "ring-life" ? lifeRingRef : mustRingRef;
    const text =
      primary === "full-day"
        ? "Full day"
        : primary === "lane-kept"
          ? `Musts kept, ${ctx.musts} of ${ctx.musts}`
          : primary === "day-kept"
            ? `Day ${ctx.streak} kept`
            : primary === "ring-quest"
              ? "Quest ring closed"
              : "Life ring closed";
    chime({
      kind,
      id,
      text,
      say,
      sweepEl: primary === "lane-kept" ? mustBodyRef.current : dayTileRef.current,
      burstEl: primary === "full-day" ? fullStampRef.current : primary === "day-kept" ? sealRef.current : ringRef.current,
      ringEl: primary === "day-kept" ? null : primary === "full-day" ? dayTileRef.current : ringRef.current,
    });
  }

  useEffect(() => {
    const prev = prevSnapshot.current;
    const next = shown.snapshot;
    prevSnapshot.current = next;
    // Only after a tap: never on arrival, never on a refresh or another tab's work.
    if (Date.now() - actedAt.current > MOMENT_WINDOW_MS) return;
    const moments = dayMomentsOf(prev, next);
    if (moments.length === 0) return;
    playMoments(moments);
    // `shown` travels with its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  // ── R starts the review quest (the Next up card's key hint) ─────────────

  const next = nextUpOf({
    quest: {
      reviews: quest.progress,
      target: quest.target,
      dueNow: quest.dueNow,
      met: fullDay.rings[1].met,
      cap: fullDay.rings[1].target,
    },
    must: board.must,
  });
  const questNext = next.kind === "quest";
  useEffect(() => {
    if (!questNext) return;
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "r" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isTypingTarget(target) || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      router.push("/review");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questNext, router]);

  // ── Rows ────────────────────────────────────────────────────────────────

  const renderRow = (row: BoardRow) => {
    const key = row.key;
    const drawerOpen = openKey === key;
    const minutes = rowMinutes(key, openKey, drawerMinutes);
    const projection = minutes != null ? projectRow(current, row, { minutes }) : row.projection;
    const busy = busyTemplates.has(row.template.id);
    const paid = row.paid;
    const undoable =
      row.state === "done" &&
      !!row.instanceId &&
      !row.instanceId.startsWith("opt:") &&
      !!paid &&
      !paid.undone &&
      !row.auto &&
      canUndo(new Date(paid.occurredAt), new Date(clock));
    const w = working[row.template.id] ?? null;

    return (
      <TaskRow
        key={key}
        row={row}
        projection={projection}
        drawerOpen={drawerOpen}
        undoable={undoable}
        busy={busy}
        receiptOpen={receiptKey === key}
        receiptId={receiptIdOf(key)}
        pendingTitle={w?.kind === "rename" ? w.title : null}
        onTick={(from) => complete(row, { minutes }, from)}
        onUndo={() => undo(row)}
        onToggleDrawer={() => {
          setOpenKey((k) => (k === key ? null : key));
          setDrawerMinutes(null);
        }}
        onToggleReceipt={() => setReceiptKey((k) => (k === key ? null : key))}
        onMinimum={row.lane === "must" && row.template.mvv ? (from) => complete(row, { mvv: true }, from) : undefined}
      >
        <TaskDrawer
          row={row}
          now={clock}
          today={current.today}
          minutes={minutes}
          onMinutes={setDrawerMinutes}
          projection={projection}
          minimumProjection={row.template.mvv ? projectRow(current, row, { mvv: true }) : null}
          busy={busy}
          working={w}
          onDone={() => complete(row, { minutes })}
          onMinimum={() => complete(row, { mvv: true })}
          onSkip={() => skip(row)}
          onTomorrow={() => moveToTomorrow(row)}
          onAgain={() => again(row, minutes)}
          onRename={(title) => work(row.template.id, { kind: "rename", title }, () => renameTask(row.template.id, title, REFRESH))}
          onArchive={() => archive(row)}
          onOverride={(n) => work(row.template.id, { kind: "rate", override: n }, () => setBandOverride(row.template.id, n, REFRESH))}
          onResize={() => resize(row)}
        />
      </TaskRow>
    );
  };

  const openCount = (rows: BoardRow[]) => rows.filter((r) => r.state === "open" || r.state === "locked").length;
  const goalsForInbox = useMemo(
    () => [...board.goals.SHORT, ...board.goals.MID, ...board.goals.LONG].map((g) => ({ id: g.template.id, title: g.template.title })),
    [board.goals]
  );
  const upcoming = useMemo(
    () => upcomingOf(current, new Set([...board.must, ...board.todayRows].map((r) => r.template.id))),
    [current, board.must, board.todayRows]
  );
  const chosenCapacity = capacityChosen(current);
  const laneNote = todayLaneNote({ templates: current.templates.length, clear: board.clear, todayRows: board.todayRows.length });
  const { planned, habits } = splitTodayLane(board.todayRows);
  const plannedTally = laneTally(planned);
  const habitTally = laneTally(habits);
  const yesterdayOpenCount = openCount(board.yesterdayRows);
  const recordBy = recordByLabel(data.today, clock);
  const asks = todayAsksOf({ yesterdayOpen: yesterdayOpenCount, recordBy, notices });
  const receiptRow = receiptKey ? (lanes.find((r) => r.key === receiptKey) ?? null) : null;
  const receiptMinutes = receiptRow ? rowMinutes(receiptRow.key, openKey, drawerMinutes) : null;
  const receiptPaid = !!receiptRow && receiptRow.state === "done" && !!receiptRow.paid?.receipt;
  const receipt = receiptRow
    ? receiptPaid
      ? receiptRow.paid!.receipt
      : receiptMinutes != null
        ? projectRow(current, receiptRow, { minutes: receiptMinutes })
        : receiptRow.projection
    : null;

  const streakCaption: ReactNode = keptToday ? (
    <>
      <b>Kept today.</b> Safe until 04:00.
    </>
  ) : streakNow > 0 ? (
    "Not kept yet. Any tick or review keeps it."
  ) : (
    "Any tick or review starts a streak."
  );

  // Close the day: what is still open, with the moves the server accepts.
  const closeItems: CloseItem[] = [
    ...board.must
      .filter((r) => r.state === "open" && r.template.mvv)
      .map<CloseItem>((r) => ({
        key: r.key,
        title: r.template.title,
        meta: `Must${r.dueLabel ? ` · ${r.dueLabel}` : ""} · still open`,
        choices: [{ id: "minimum", label: `Do the minimum · ${r.template.mvv}` }],
      })),
    ...planned
      .filter((r) => r.state === "open" && tomorrowOffer(r.template, current.today).show)
      .map<CloseItem>((r) => ({
        key: r.key,
        title: r.template.title,
        meta: r.template.dueKind === "DEADLINE" ? `${r.dueLabel ?? "deadline"} · keeps its deadline` : "Planned · carries forward, never late",
        choices: [{ id: "tomorrow", label: "Tomorrow" }],
      })),
  ];
  const rowByKey = new Map(lanes.map((r) => [r.key, r]));
  const onCloseChoice = (key: string, choice: string) => {
    const r = rowByKey.get(key);
    if (!r) return;
    if (choice === "minimum") complete(r, { mvv: true });
    else if (choice === "tomorrow") moveToTomorrow(r);
  };
  const rollAll = () => {
    for (const item of closeItems) if (item.choices.some((c) => c.id === "tomorrow")) onCloseChoice(item.key, "tomorrow");
  };
  const prominent = closeDayProminent(clock);

  const firstRunHint = (
    <p className="lane-note">
      Nothing planned yet. <span className="hint-compact">Tap + in the tab bar</span>
      <span className="hint-wide">Press c or Capture</span> and type one line, e.g. <span className="t-mono">gym legs 60m every mon,thu !</span>{" "}
      <button type="button" className="lane-note-link" onClick={() => openCapture()}>
        Capture one now
      </button>
    </p>
  );
  const plannedNote =
    laneNote === "first-run" ? (
      firstRunHint
    ) : laneNote === "clear" && planned.length === 0 ? (
      <p className="lane-note">Board clear. Anything else is extra.</p>
    ) : laneNote === "only-musts" ? (
      <p className="lane-note">Nothing else due today. The Must lane is what is left.</p>
    ) : null;

  return (
    <div className="page today-board cq-main">
      <div className="board">
        <div className="c1">
          {dayEnded && !notice && (
            <div role="status" className="card today-note o1">
              <span>A new day started at 04:00. This board is yesterday&apos;s.</span>
              <Button variant="secondary" onClick={() => router.refresh()}>
                Load today
              </Button>
            </div>
          )}
          {notice && !error && (
            <div role="status" className="card today-note o1">
              <span>{notice}</span>
              <Button variant="quiet" onClick={() => setNotice(null)}>
                OK
              </Button>
            </div>
          )}
          {error && (
            <div role="alert" className="card today-note o1" data-kind="error">
              <span>{error}</span>
              <Button variant="quiet" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </div>
          )}

          <div className="o2">
            <DayLedger
              streak={{ count: shown.streakNow, capped: streak.capped, kept: shown.snapshot.kept }}
              caption={streakCaption}
              freezes={streak.bankedFreezes > 0 ? { banked: streak.bankedFreezes } : null}
              fullDay={shown.fullDay}
              settles={false}
              glint={beat?.glint}
              stampLanding={beat?.full}
              xp={board.lifeXpToday}
              pts={board.reviewXpToday}
              planned={{ minutes: board.planned, capacity: board.capacity, chosen: chosenCapacity, over: board.over }}
              onCapacity={() => setCapacityOpen(true)}
              refs={{
                tile: dayTileRef,
                seal: sealRef,
                fullStamp: fullStampRef,
                rings: { musts: mustRingRef, quest: questRingRef, life: lifeRingRef },
              }}
            />
          </div>

          <div className="o3">
            <NextUp
              next={next}
              focus={focus}
              bosses={bosses}
              quota={null}
              mustPrice={next.kind === "must" ? next.row.projection.xp : undefined}
              busy={next.kind === "must" ? busyTemplates.has(next.row.template.id) : false}
              onKeepMust={next.kind === "must" ? () => complete(next.row, {}, null) : undefined}
            />
          </div>

          {asks.map((a) => (
            <AskCard
              key={a.id}
              className="o4"
              title={a.title}
              detail={a.detail}
              action={a.action}
              href={a.href}
              tone={a.tone}
              onAction={a.id === "yesterday" ? () => setYesterdayOpen(true) : undefined}
            />
          ))}
        </div>

        <div className="c2">
          {board.must.length > 0 && (
            <Lane
              id="must"
              title="Must"
              must
              kept={shown.mustLaneKept}
              landing={beat?.lane}
              bodyRef={mustBodyRef}
              count={`${mustTally.kept} of ${mustTally.total} kept`}
              className="o5"
            >
              {board.must.map(renderRow)}
            </Lane>
          )}
          {(planned.length > 0 || habits.length === 0) && (
            <Lane id="planned" title="Planned" count={planned.length > 0 ? `${plannedTally.kept} of ${plannedTally.total}` : undefined} className="o6" note={plannedNote}>
              {planned.map(renderRow)}
            </Lane>
          )}
          {habits.length > 0 && (
            <Lane id="habits" title="Habits" count={`${habitTally.kept} of ${habitTally.total}`} className="o7" note={habits.length > 0 && planned.length === 0 ? plannedNote : null}>
              {habits.map(renderRow)}
            </Lane>
          )}
        </div>

        <div className="c3">
          <div className="o9">
            <GoalsStrip goals={board.goals} busy={busyGoals} onProgress={progressGoal} />
          </div>

          <section className="card today-side-rows o10" aria-label="Inbox and Anytime">
            <button type="button" className="collapsed" onClick={() => setInboxOpen(true)} aria-haspopup="dialog">
              <Icon name="inbox" className="ink-1" />
              <b>Inbox</b>
              <span>{board.inbox.length > 0 ? `${board.inbox.length} to sort` : "empty"}</span>
              <Icon name="chev" size={16} className="ink-2" />
            </button>
            {(board.anytime.length > 0 || board.later > 0 || upcoming.length > 0) && (
              <>
                <button type="button" className="collapsed" aria-expanded={anytimeOpen} aria-controls="anytime-rows" onClick={() => setAnytimeOpen((o) => !o)}>
                  <Sigil track="craft" className="ink-1" />
                  <b>Anytime</b>
                  <span>
                    {openCount(board.anytime)}
                    {board.later > 0 ? ` · ${board.later} planned later` : ""}
                    {upcoming.length > 0 ? ` · ${upcoming.length} repeating later` : ""}
                  </span>
                  <Icon name="chev" size={16} className={cx("ink-2 chev", anytimeOpen && "open")} />
                </button>
                {anytimeOpen && (
                  <div id="anytime-rows" className="anytime-rows">
                    {board.anytime.map(renderRow)}
                    {upcoming.length > 0 && (
                      <div className="today-upcoming">
                        <p className="t-eyebrow">Coming up</p>
                        <ul>
                          {upcoming.map((u) => (
                            <li key={u.templateId}>
                              <span className="today-upcoming-title">{u.title}</span>
                              <span className="today-upcoming-day">{u.label}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card today-close o11" data-prominent={prominent ? "1" : undefined}>
            <button type="button" className="close-day" onClick={() => setCloseOpen(true)} aria-haspopup="dialog">
              <span className="ic">
                <Icon name="moon" />
              </span>
              <span className="close-txt">
                <b>Close the day</b>
                <span>{closeItems.length > 0 ? `${closeItems.length} still open: move it, or do a must's minimum.` : "Nothing left open. Rest well."}</span>
              </span>
              <Icon name="chev" size={16} className="ink-2" />
            </button>
          </section>

          <div className="foot-note o11">
            <p>Life XP and review points are two ledgers. They are never added together.</p>
            {footer}
          </div>
        </div>
      </div>

      <ReceiptSheet
        open={!!receiptRow}
        onClose={closeReceipt}
        id={receiptIdOf(receiptKey ?? "none")}
        title={receiptRow?.template.title ?? "Receipt"}
        receipt={receipt}
        paid={receiptPaid}
      />

      <InboxSheet
        open={inboxOpen}
        items={board.inbox}
        goals={goalsForInbox}
        busy={busyTemplates.size > 0}
        onClarify={clarify}
        onClose={closeInbox}
        undo={removal && inboxOpen ? <UndoToast id={removal.opId} verb={removal.verb} title={removal.title} onUndo={undoRemoval} /> : null}
      />

      <Sheet
        open={yesterdayOpen}
        onClose={() => setYesterdayOpen(false)}
        title="Record yesterday"
        description={`Anything you tick pays at the full rate, ${recordBy}.`}
      >
        {board.yesterdayRows.length === 0 ? (
          <p className="t-meta">Nothing from yesterday is left to record.</p>
        ) : (
          <div className="card lane-body sheet-rows">{board.yesterdayRows.map(renderRow)}</div>
        )}
      </Sheet>

      <Sheet open={capacityOpen} onClose={() => setCapacityOpen(false)} title="Capacity" description="Planned time against the day you have.">
        <CapacityPanel
          planned={board.planned}
          capacity={board.capacity}
          over={board.over}
          chosen={chosenCapacity}
          suggestion={board.suggestion}
          today={current.today}
          busy={board.suggestion ? busyTemplates.has(board.suggestion.template.id) : false}
          settingBusy={capacityBusy}
          onMove={moveToTomorrow}
          onSetCapacity={setCapacity}
        />
      </Sheet>

      <CloseDaySheet
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        description="Optional. Move what is left, or do a must's minimum. Moving changes nothing already paid."
        items={closeItems}
        onChoose={onCloseChoice}
        onRollAll={closeItems.some((i) => i.choices.some((c) => c.id === "tomorrow")) ? rollAll : undefined}
        busy={busyTemplates.size > 0}
        doneLabel="Done"
        onDone={() => setCloseOpen(false)}
      />
    </div>
  );
}

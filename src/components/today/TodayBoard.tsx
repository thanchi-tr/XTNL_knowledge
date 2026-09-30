"use client";

import "./today.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BOARD_COLUMNS,
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
  type BoardSection,
  type InboxChoice,
} from "@/lib/today-board";
import type { DailyStreak } from "@/lib/streak-curve";
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
import { StatTile } from "@/components/dashboard/StatTile";
import { openCapture } from "@/components/capture/CaptureFab";
import { TaskRow } from "./TaskRow";
import { TaskDrawer, type DrawerWork } from "./TaskDrawer";
import { QuestCard } from "./QuestCard";
import { GoalsStrip } from "./GoalsStrip";
import { InboxSheet } from "./InboxSheet";
import { CapacityTile } from "./CapacityTile";
import { ReceiptPopover } from "./ReceiptPopover";
import { UndoToast } from "./UndoToast";
import { fmtXp } from "./format";
import {
  REMOVE_UNDO_MS,
  boardDayEnded,
  capacityChosen,
  mergeSkew,
  nextBoardTick,
  receiptIdOf,
  recordByLabel,
  rowMinutes,
  todayLaneNote,
  upcomingOf,
} from "./board-ui";

interface Props {
  data: BoardData;
  streak: DailyStreak;
  /** When the server rendered this board (ISO): the clock for the undo window until the next tap. */
  nowIso: string;
  quota: { line: string; met: boolean } | null;
  bossReady: number;
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

function without<V>(record: Record<string, V>, key: string): Record<string, V> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * The Today board: what the day asks for, in the order it is worth doing.
 *
 * The board holds its own optimistic copy of the day, the LoadoutBar
 * pattern (LoadoutBar.tsx): a tick lands on the tap, every other row
 * re-prices against the new knee base straight away (the same
 * `planCompletion` the server pays with), and the view reconciles from
 * props when the action's refreshed page arrives. Pending operations that
 * the fresh props already show are dropped without a flash; a failed one
 * snaps back and says why.
 *
 * Archive and Drop are held for ten seconds with an Undo on screen before
 * they are sent, so taking one back costs nothing. The board keeps its own
 * clock honest without polling: one timer to the next moment something on
 * screen changes by itself (an Undo expiring, midnight, the 04:00 day edge).
 *
 * Deliberately no celebration: a tick fills and draws its check in under
 * 300 ms and that is all. The day is not a slot machine.
 */
export function TodayBoard({ data, streak, nowIso, quota, bossReady }: Props) {
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
  const [busyGoals, setBusyGoals] = useState(false);
  /** Resizes, self-ratings and renames in flight, by template. */
  const [working, setWorking] = useState<Record<string, DrawerWork>>({});
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [capacityBusy, setCapacityBusy] = useState(false);
  // The undo window's clock, on the server's time: its render time, then the
  // time of the last tap or timer (serverNow). Never read during render, so
  // hydration matches.
  const [clock, setClock] = useState(() => Date.parse(nowIso));

  // Reconcile with fresh props during render, as LoadoutBar does: an effect
  // would paint the stale board once, then flash to the new one.
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

  const ops = useMemo(() => pending.map((p) => p.op), [pending]);
  const current = useMemo(() => applyOps(data, ops), [data, ops]);
  const board = useMemo(() => buildBoard(current), [current]);
  const quest = questOf({
    dayOpenQty: current.ledger.today.dayOpenQty,
    reviews: current.ledger.today.reviews,
    dueNow: current.dueNow ?? 0,
    reviewXp: current.ledger.today.reviewXp,
  });
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
    const next: Removal = { opId: op.id, templateId: row.id, verb, title: row.title, timer: window.setTimeout(dropUndo, REMOVE_UNDO_MS) };
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

  // ── Writes ──────────────────────────────────────────────────────────────

  function complete(row: BoardRow, opts: { minutes?: number | null; mvv?: boolean } = {}) {
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
    dispatch(op, () => againTask(row.template.id, { minutes }, REFRESH), (v) => ({ instanceId: v.instanceId, receipt: v.receipt, slot: v.slot }));
  }

  function undo(row: BoardRow) {
    const instanceId = row.instanceId;
    if (!instanceId || instanceId.startsWith("opt:")) return;
    dispatch({ id: nextOpId(), kind: "undo", instanceId }, () => undoCompletion(instanceId, REFRESH));
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
    const receipt = row.state === "done" && paid?.receipt ? paid.receipt : projection;
    const receiptOpen = receiptKey === key;
    const receiptId = receiptIdOf(key);
    const w = working[row.template.id] ?? null;

    return (
      <TaskRow
        key={key}
        row={row}
        projection={projection}
        drawerOpen={drawerOpen}
        undoable={undoable}
        busy={busy}
        receiptOpen={receiptOpen}
        receiptId={receiptId}
        pendingTitle={w?.kind === "rename" ? w.title : null}
        onTick={() => complete(row, { minutes })}
        onUndo={() => undo(row)}
        onToggleDrawer={() => {
          setOpenKey((k) => (k === key ? null : key));
          setDrawerMinutes(null);
        }}
        onToggleReceipt={() => setReceiptKey((k) => (k === key ? null : key))}
        onMinimum={row.lane === "must" && row.template.mvv ? () => complete(row, { mvv: true }) : undefined}
        receipt={
          receiptOpen ? (
            <ReceiptPopover
              id={receiptId}
              receipt={receipt}
              paid={row.state === "done" && !!paid?.receipt}
              title={row.template.title}
              onClose={closeReceipt}
            />
          ) : null
        }
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

  // The streak tile moves with the first tick of the day, before the round
  // trip: a day with any live completion is an active day.
  const todayActive = streak.last7Days[streak.last7Days.length - 1] ?? false;
  const streakNow = streak.current + (!todayActive && board.activeToday ? 1 : 0);
  const aliveToday = todayActive || board.activeToday;

  const sections: Record<BoardSection, ReactNode> = {
    quest: <QuestCard key="quest" quest={quest} quota={quota} bossReady={bossReady} />,
    must:
      board.must.length > 0 ? (
        <section key="must" className="card today-lane" data-lane="must" aria-labelledby="lane-must">
          <div className="today-lane-head">
            <h2 id="lane-must" className="panel-title today-lane-title">
              Must
            </h2>
            <span className="today-lane-count">{openCount(board.must)} open</span>
          </div>
          <div className="today-rows">{board.must.map(renderRow)}</div>
        </section>
      ) : null,
    today: (
      <section key="today" className="card today-lane" data-lane="today" aria-labelledby="lane-today">
        <div className="today-lane-head">
          <h2 id="lane-today" className="panel-title">
            Today
          </h2>
          <span className="today-lane-count">{openCount(board.todayRows)} open</span>
        </div>
        {laneNote === "first-run" ? (
          <p className="today-empty">
            Nothing planned yet.{" "}
            <span className="sm:hidden">Tap the green + at the bottom left</span>
            <span className="hidden sm:inline">
              Press <span className="mono">c</span> or <span className="mono">+ Capture</span>
            </span>{" "}
            and type one line, e.g. <span className="mono">gym legs 60m every mon,thu !</span>{" "}
            <button type="button" className="today-inline-link" onClick={() => openCapture()}>
              Capture one now
            </button>
          </p>
        ) : laneNote === "clear" ? (
          <p className="today-empty" style={{ color: "var(--green)" }}>
            Board clear. Anything else is extra.
          </p>
        ) : laneNote === "only-musts" ? (
          <p className="today-empty">Nothing else due today. The Must list is what is left.</p>
        ) : null}
        {board.todayRows.length > 0 && <div className="today-rows">{board.todayRows.map(renderRow)}</div>}
      </section>
    ),
    yesterday:
      board.yesterdayRows.length > 0 ? (
        <section key="yesterday" className="card today-lane" data-lane="yesterday">
          <details>
            <summary>
              <span className="panel-title">Yesterday</span>
              <span className="today-lane-count" style={{ marginLeft: "auto" }}>
                {openCount(board.yesterdayRows)} open · {recordByLabel(data.today, clock)}
              </span>
            </summary>
            <div className="today-rows">{board.yesterdayRows.map(renderRow)}</div>
          </details>
        </section>
      ) : null,
    goals: <GoalsStrip key="goals" goals={board.goals} busy={busyGoals} onProgress={progressGoal} />,
    anytime:
      board.anytime.length > 0 || board.later > 0 || upcoming.length > 0 ? (
        <section key="anytime" className="card today-lane" data-lane="anytime">
          <details open>
            <summary>
              <span className="panel-title">Anytime</span>
              <span className="today-lane-count" style={{ marginLeft: "auto" }}>
                {openCount(board.anytime)} open
                {board.later > 0 ? ` · ${board.later} planned later` : ""}
                {upcoming.length > 0 ? ` · ${upcoming.length} repeating later` : ""}
              </span>
            </summary>
            {board.anytime.length > 0 && <div className="today-rows">{board.anytime.map(renderRow)}</div>}
            {upcoming.length > 0 && (
              <div className="today-upcoming">
                <p className="label-xs">Coming up</p>
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
          </details>
        </section>
      ) : null,
    inbox: (
      <section key="inbox" className="card flex items-center justify-between gap-3" style={{ padding: "10px 14px" }}>
        <span style={{ fontSize: 12, color: board.inbox.length > 0 ? "var(--ink-1)" : "var(--ink-3)" }}>
          {board.inbox.length > 0 ? "Captured, not yet sorted" : "Inbox empty"}
        </span>
        <button
          type="button"
          className={`chip ${board.inbox.length > 0 ? "chip-blue" : "chip-muted"}`}
          style={{ minHeight: 40, padding: "0 12px", cursor: "pointer" }}
          onClick={() => setInboxOpen(true)}
          aria-haspopup="dialog"
        >
          Inbox {board.inbox.length}
        </button>
      </section>
    ),
  };

  const undoToast = removal ? (
    <UndoToast id={removal.opId} verb={removal.verb} title={removal.title} onUndo={undoRemoval} inline={inboxOpen} />
  ) : null;

  return (
    <>
      {dayEnded && !notice && (
        <div role="status" className="card mb-3 flex items-start justify-between gap-3" style={{ padding: "10px 14px", borderColor: "rgba(77,156,245,0.3)" }}>
          <span style={{ fontSize: 12.5, color: "var(--blue)" }}>A new day started at 04:00. This board is yesterday&apos;s.</span>
          <button type="button" className="btn-ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => router.refresh()}>
            Load today
          </button>
        </div>
      )}
      {notice && !error && (
        <div role="status" className="card mb-3 flex items-start justify-between gap-3" style={{ padding: "10px 14px", borderColor: "rgba(77,156,245,0.3)" }}>
          <span style={{ fontSize: 12.5, color: "var(--blue)" }}>{notice}</span>
          <button type="button" className="btn-ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="card mb-3 flex items-start justify-between gap-3" style={{ padding: "10px 14px", borderColor: "rgba(240,58,87,0.3)" }}>
          <span style={{ fontSize: 12.5, color: "var(--red)" }}>{error}</span>
          <button type="button" className="btn-ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="fade-up fade-up-1 mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Day streak"
          value={String(streakNow)}
          unit={streakNow === 1 ? "day" : "days"}
          tone={streakNow > 0 ? "green" : undefined}
          sub={
            board.habits.total > 0
              ? `${board.habits.done} of ${board.habits.total} habits kept today`
              : aliveToday
                ? "Today counts"
                : "Any tick or review keeps it"
          }
        />
        <div className="card flex min-w-0 flex-col gap-2" style={{ padding: "18px 16px" }}>
          <span className="label-xs">Today</span>
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="mono" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: board.lifeXpToday > 0 ? "var(--green)" : "var(--ink-0)" }}>
              {fmtXp(board.lifeXpToday)}
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}> life XP</span>
            </span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1, color: "var(--ink-1)" }}>
              {fmtXp(board.reviewXpToday)}
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}> review pts</span>
            </span>
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>Two ledgers, never added together</span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <CapacityTile
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
        </div>
      </section>

      <div className="fade-up fade-up-2 grid items-start gap-3 fold:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {BOARD_COLUMNS.map((column, i) => (
          <div key={i} className="grid min-w-0 gap-3">
            {column.map((s) => sections[s])}
          </div>
        ))}
      </div>

      {!inboxOpen && undoToast}

      {inboxOpen && (
        <InboxSheet
          items={board.inbox}
          goals={goalsForInbox}
          busy={busyTemplates.size > 0}
          onClarify={clarify}
          onClose={closeInbox}
          undo={undoToast}
        />
      )}
    </>
  );
}

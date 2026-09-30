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
  skipTask,
  undoCompletion,
} from "@/app/actions/tasks";
import { StatTile } from "@/components/dashboard/StatTile";
import { TaskRow } from "./TaskRow";
import { TaskDrawer } from "./TaskDrawer";
import { QuestCard } from "./QuestCard";
import { GoalsStrip } from "./GoalsStrip";
import { InboxSheet } from "./InboxSheet";
import { CapacityTile } from "./CapacityTile";
import { ReceiptPopover } from "./ReceiptPopover";
import { fmtXp } from "./format";

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

const REFRESH = { refresh: true } as const;

// Event-handler clocks, kept at module level: they run on a tap, never
// during render, which is what keeps the server and browser renders equal.
let opSeq = 0;
const tapTime = (): number => Date.now();
const nextOpId = (): string => `${tapTime().toString(36)}-${(opSeq += 1)}`;

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
  const [minutesByKey, setMinutesByKey] = useState<Record<string, number | null>>({});
  const [inboxOpen, setInboxOpen] = useState(false);
  const [busyGoals, setBusyGoals] = useState(false);
  // The undo window's clock: the server's render time, then the time of the
  // last tap. Never `Date.now()` during render, so hydration matches.
  const [clock, setClock] = useState(() => Date.parse(nowIso));

  // Reconcile with fresh props during render, as LoadoutBar does: an effect
  // would paint the stale board once, then flash to the new one.
  const [seen, setSeen] = useState({ data, nowIso });
  if (seen.data !== data || seen.nowIso !== nowIso) {
    setSeen({ data, nowIso });
    setClock((c) => Math.max(c, Date.parse(nowIso)));
    setPending((prev) => prev.filter((p) => !p.settled && !reflected(data, p.op)));
  }

  // Settling reads the latest props, which only matter after a commit.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const ops = useMemo(() => pending.map((p) => p.op), [pending]);
  const current = useMemo(() => applyOps(data, ops), [data, ops]);
  const board = useMemo(() => buildBoard(current), [current]);
  const quest = questOf({
    dayOpenQty: current.ledger.today.dayOpenQty,
    reviews: current.ledger.today.reviews,
    dueNow: current.dueNow ?? 0,
    reviewXp: current.ledger.today.reviewXp,
  });
  const busyTemplates = useMemo(
    () => new Set(pending.filter((p) => !p.settled).map((p) => ("templateId" in p.op ? p.op.templateId : null))),
    [pending]
  );

  const closeReceipt = useCallback(() => setReceiptKey(null), []);
  const closeInbox = useCallback(() => setInboxOpen(false), []);

  /**
   * Runs one write: applies its optimistic op now, sends it, and on the
   * answer either settles it (with anything the server returned to fold
   * in) or takes it back and shows the reason.
   */
  function dispatch<T>(op: BoardOp | null, call: () => Promise<Result<T>>, onOk?: (value: T) => Partial<BoardOp> | void) {
    setError(null);
    setNotice(null);
    setClock(tapTime());
    if (op) setPending((prev) => [...prev, { op, settled: false, base: data }]);
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
  }

  const dayArg = (row: BoardRow): "today" | "yesterday" => (row.day === data.today ? "today" : "yesterday");

  function complete(row: BoardRow, opts: { minutes?: number | null; mvv?: boolean } = {}) {
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
    setMinutesByKey((m) => ({ ...m, [row.key]: null }));
    dispatch(
      op,
      () => completeTask(row.template.id, { day: dayArg(row), slot: row.slot, minutes: opts.minutes ?? null, mvv: opts.mvv }, REFRESH),
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
    dispatch(op, () => againTask(row.template.id, { minutes }, REFRESH), (v) => ({ instanceId: v.instanceId, receipt: v.receipt, slot: v.slot }));
  }

  function undo(row: BoardRow) {
    const instanceId = row.instanceId;
    if (!instanceId || instanceId.startsWith("opt:")) return;
    dispatch({ id: nextOpId(), kind: "undo", instanceId }, () => undoCompletion(instanceId, REFRESH));
  }

  function skip(row: BoardRow) {
    setOpenKey(null);
    dispatch({ id: nextOpId(), kind: "skip", templateId: row.template.id, day: row.day }, () => skipTask(row.template.id, REFRESH));
  }

  function moveToTomorrow(row: BoardRow) {
    if (ruleOf(row.template)) return skip(row);
    setOpenKey(null);
    dispatch({ id: nextOpId(), kind: "hide", templateId: row.template.id }, () => rescheduleTask(row.template.id, "tomorrow", REFRESH));
  }

  function archive(row: BoardRow) {
    setOpenKey(null);
    dispatch({ id: nextOpId(), kind: "hide", templateId: row.template.id }, () => archiveTask(row.template.id, REFRESH));
  }

  function clarify(templateId: string, choice: InboxChoice, parentId?: string) {
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
      const res = await goalProgress(goalId, 1, REFRESH);
      setBusyGoals(false);
      return res;
    });
  }

  const renderRow = (row: BoardRow) => {
    const key = row.key;
    const minutes = minutesByKey[key] ?? null;
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

    return (
      <TaskRow
        key={key}
        row={row}
        projection={projection}
        drawerOpen={openKey === key}
        undoable={undoable}
        busy={busy}
        onTick={() => complete(row, { minutes })}
        onUndo={() => undo(row)}
        onToggleDrawer={() => setOpenKey((k) => (k === key ? null : key))}
        onToggleReceipt={() => setReceiptKey((k) => (k === key ? null : key))}
        onMinimum={row.lane === "must" && row.template.mvv ? () => complete(row, { mvv: true }) : undefined}
        receipt={
          receiptKey === key ? (
            <ReceiptPopover
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
          minutes={minutes}
          onMinutes={(m) => setMinutesByKey((prev) => ({ ...prev, [key]: m }))}
          projection={projection}
          minimumProjection={row.template.mvv ? projectRow(current, row, { mvv: true }) : null}
          busy={busy}
          onDone={() => complete(row, { minutes })}
          onMinimum={() => complete(row, { mvv: true })}
          onSkip={() => skip(row)}
          onTomorrow={() => moveToTomorrow(row)}
          onAgain={() => again(row, minutes)}
          onRename={(title) => dispatch(null, () => renameTask(row.template.id, title, REFRESH))}
          onArchive={() => archive(row)}
          onOverride={(n) => dispatch(null, () => setBandOverride(row.template.id, n, REFRESH))}
          onResize={() => dispatch(null, () => resizeTask(row.template.id, REFRESH))}
        />
      </TaskRow>
    );
  };

  const openCount = (rows: BoardRow[]) => rows.filter((r) => r.state === "open" || r.state === "locked").length;
  const goalsForInbox = useMemo(
    () => [...board.goals.SHORT, ...board.goals.MID, ...board.goals.LONG].map((g) => ({ id: g.template.id, title: g.template.title })),
    [board.goals]
  );

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
        {current.templates.length === 0 ? (
          <p className="today-empty">
            Nothing planned yet. Press <span className="mono">c</span> or <span className="mono">+ Capture</span> and type one line, e.g.{" "}
            <span className="mono">gym legs 60m every mon,thu !</span>
          </p>
        ) : (
          board.clear && (
            <p className="today-empty" style={{ color: "var(--green)" }}>
              Board clear. Anything else is extra.
            </p>
          )
        )}
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
                {openCount(board.yesterdayRows)} open · record until 04:00
              </span>
            </summary>
            <div className="today-rows">{board.yesterdayRows.map(renderRow)}</div>
          </details>
        </section>
      ) : null,
    goals: <GoalsStrip key="goals" goals={board.goals} busy={busyGoals} onProgress={progressGoal} />,
    anytime:
      board.anytime.length > 0 || board.later > 0 ? (
        <section key="anytime" className="card today-lane" data-lane="anytime">
          <details open>
            <summary>
              <span className="panel-title">Anytime</span>
              <span className="today-lane-count" style={{ marginLeft: "auto" }}>
                {openCount(board.anytime)} open
                {board.later > 0 ? ` · ${board.later} planned later` : ""}
              </span>
            </summary>
            {board.anytime.length > 0 && <div className="today-rows">{board.anytime.map(renderRow)}</div>}
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
          style={{ minHeight: 36, cursor: "pointer" }}
          onClick={() => setInboxOpen(true)}
          aria-haspopup="dialog"
        >
          Inbox {board.inbox.length}
        </button>
      </section>
    ),
  };

  return (
    <>
      {notice && !error && (
        <div role="status" className="card mb-3 flex items-start justify-between gap-3" style={{ padding: "10px 14px", borderColor: "rgba(77,156,245,0.3)" }}>
          <span style={{ fontSize: 12.5, color: "var(--blue)" }}>{notice}</span>
          <button type="button" className="btn-ghost" style={{ minHeight: 34, padding: "0 12px" }} onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="card mb-3 flex items-start justify-between gap-3" style={{ padding: "10px 14px", borderColor: "rgba(240,58,87,0.3)" }}>
          <span style={{ fontSize: 12.5, color: "var(--red)" }}>{error}</span>
          <button type="button" className="btn-ghost" style={{ minHeight: 34, padding: "0 12px" }} onClick={() => setError(null)}>
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
            suggestion={board.suggestion}
            busy={board.suggestion ? busyTemplates.has(board.suggestion.template.id) : false}
            onMove={moveToTomorrow}
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

      {inboxOpen && (
        <InboxSheet
          items={board.inbox}
          goals={goalsForInbox}
          busy={busyTemplates.size > 0}
          onClarify={clarify}
          onClose={closeInbox}
        />
      )}
    </>
  );
}

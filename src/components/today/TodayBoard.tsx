"use client";

import { TodayFooter } from "./TodayFooter";
import "./today.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyOps,
  buildBoard,
  canUndo,
  dutyFloorOf,
  onRestMustsIn,
  projectRow,
  questOf,
  reflected,
  ruleOf,
  seekPlaceOf,
  type BoardData,
  type BoardOp,
  type BoardRow,
  type InboxChoice,
} from "@/lib/today-board";
// The server's DailyStreak (streak-curve's plus M2's endedOn, endedAfter, freezeWillCover); type-only, erased from the client bundle.
import type { DailyStreak } from "@/lib/streak";
import { fullDayInputOf, fullDayOf, type FullDayRingKind } from "@/lib/full-day";
import { announce, chime, mark } from "@/lib/celebrate";
import type { T1Kind } from "@/lib/celebration-types";
import type { PlaceLane } from "@/lib/life-types";
import { motionLevel } from "@/lib/motion";
import { GOAL_ALREADY_CLOSED } from "@/lib/goals";
import type { CapturedItem } from "@/app/actions/capture";
import {
  againTask,
  archiveTask,
  clarifyInbox,
  closeGoal,
  completeTask,
  goalProgress,
  previewGoalClose,
  rescheduleGoal,
  renameTask,
  rescheduleTask,
  resizeTask,
  setBandOverride,
  setDailyCapacity,
  skipTask,
  tickStep,
  unarchiveTask,
  undoCompletion,
} from "@/app/actions/tasks";
import { CAPTURED_EVENT, openCapture } from "@/components/capture/events";
import { presentAll } from "@/components/celebrate/stage";
import { Button } from "@/components/ui/Button";
import { Icon, Sigil } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { dismissToast, pushToast } from "@/components/ui/toast-store";
import { cx } from "@/components/ui/cx";
import { TaskRow } from "./TaskRow";
import { TaskDrawer, type DrawerRule, type DrawerWork } from "./TaskDrawer";
import { NextUp } from "./NextUp";
import { GOALS_HEADING_ID, GOAL_CLOSE_CHIP, GoalsStrip } from "./GoalsStrip";
import { GoalCloseSheet, GoalRescheduleSheet, type GoalClosePreview, type GoalCloseRoadmap } from "./GoalSheets";
import { onSeekTemplate } from "@/components/roadmap/roadmap-events";
import { InboxSheet } from "./InboxSheet";
import { CapacityPanel } from "./CapacityTile";
import { ReceiptSheet } from "./ReceiptSheet";
import { UndoToast, focusUndoOnce } from "./UndoToast";
import { DayLedger, StreakCard } from "./DayLedger";
import { Lane } from "./Lane";
import { AskBadge } from "./AskBadge";
import { CloseDaySheet } from "./CloseDaySheet";
import { fmtXp } from "./format";
import { holdLedger, useAfterFlight } from "./ledger-gate";
import {
  HELD_GLYPH,
  RECORD_YESTERDAY_EVENT,
  REMOVE_UNDO_MS,
  SHEET_PARAM,
  YESTERDAY_SHEET,
  askHostOf,
  boardDayEnded,
  cancellableOf,
  capacityChosen,
  closeDayProminent,
  closeItemsOf,
  dayLedgerDutyOf,
  dayMomentsOf,
  deferredNoticeOf,
  goalAfterClose,
  goalClosedNotice,
  goalRescheduledNotice,
  hhmmOf,
  keptAtOf,
  laneTally,
  madeUpLineOf,
  makeUpViewOf,
  mergeSkew,
  missPromptCopyOf,
  missPromptKey,
  missPromptOf,
  momentText,
  mustLaneOf,
  nextBoardTick,
  nextUpOf,
  o1CardOf,
  owedSummaryOf,
  owedTotalOf,
  receiptIdOf,
  recordByLabel,
  restOptionsOf,
  restSwitchOf,
  rollAllKeysOf,
  rowMinutes,
  ruleChangeOf,
  settledKey,
  splitTodayLane,
  todayAsksOf,
  todayLaneNote,
  upcomingOf,
  vacationRangeError,
  withHeldExcused,
  yesterdayActiveOf,
  yesterdaySheetOf,
  type AskNotice,
  type DayMoment,
  type DaySnapshot,
} from "./board-ui";
import { addDays, type DayKey } from "@/lib/life-day";
import { dayLabel, declaredAheadOf, fullWeekday, restBannerOf, settledNoticeOf, type DeclaredDay, type DutyBoard, type OwedCard } from "@/lib/duty-view";
import {
  acceptLoss,
  cancelPendingChange,
  cancelRest,
  declareRest,
  declareSick,
  doMinimum,
  makeUp,
  setCompulsory,
  setCompulsoryOnRest,
  setMinimum,
  setVacation,
  settleYesterday,
  spendFreeze,
  undoMakeUp,
  type DutyActionResult,
  type MakeUpResult,
} from "@/app/actions/duty";
import { saveReflection } from "@/app/actions/rituals";
import { MakeUpCard, OwedRow, OwedSummary } from "./m2/MakeUpCard";
import { RestBannerCard, YesterdaySettled, type SettledChip as NoticeChip } from "./m2/Notices";
import { CancelList, FreezeOption, RestControls, SettleFooter, VacationForm } from "./m2/Sheets";
import { MissPrompt } from "./MissPrompt";
import { namedOfTitle, type TodayNamedTitles } from "./NamedTitle";
import { Chip } from "@/components/ui/Chip";
import { HeldGlyph } from "@/components/ui/Icon";

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
  /** The live clock line under the board: plain strings, so no server-made JSX crosses into this client tree. */
  footClock?: { time: string; zone: string; tz: string };
  /**
   * Whether life counts yet (the page's isLaunched(today)). Before, goals
   * show progress only: no stated MP and no Close.
   */
  launched?: boolean;
  /**
   * Roadmap (F16 seam 16, F17): the week quests card, rendered by the page
   * (`<WeekQuests variant="today" …/>`) and drawn inside .o9 directly after
   * the goals, in a wrapper that carries data-compact while Close the day is
   * prominent. Quiet by design: it adds no Ask, no count and no row to the
   * board; buildBoard and todayCountsOf never see it. Absent: no card.
   */
  questsSlot?: ReactNode;
  /**
   * The live fix (contracts §22.11, ruling 67): a plan-born template's Gemini-named Domain names, by template id
   * (roadmap-quests-server loadTodayNamedTitles), and the mark the page renders (<NamedMark/>, passed as a node like
   * questsSlot). Its title shows each such name with pv.named (NamedTitle over namedPartsOf of the title as it
   * stands). Absent: every title plain, as before.
   */
  namedTitles?: TodayNamedTitles | null;
}

/** The goal the Close sheet is open on: its preview, and the close's own refusal if it had one. */
interface GoalCloseTarget {
  id: string;
  title: string;
  preview: GoalClosePreview;
  error: string | null;
  /** False while the sheet slides away: the target stays so its title does not change mid-exit. */
  open: boolean;
  /** A ROADMAP goal's zero reason and reset note, kept with the target so they do not vanish mid-exit. */
  roadmap?: GoalCloseRoadmap | null;
}

/** The goal the Reschedule sheet is open on. */
interface GoalReschedTarget {
  id: string;
  title: string;
  error: string | null;
  open: boolean;
  /** One per opening: the date field starts fresh each time. */
  nonce: number;
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

/** How long the board looks for a capture's row (the refreshed props may land after the toast). */
const SEEK_MS = 5000;
/** How long a found capture stays outlined (and says 'just added'). */
const JUST_ADDED_MS = 1600;
/** Places that live inside the collapsed Anytime card: a capture there opens it. */
const ANYTIME_PLACES: ReadonlySet<PlaceLane> = new Set<PlaceLane>(["anytime", "later", "upcoming"]);
/** The flash link a capture toast's 'View' writes: /today#t-<templateId>. */
const FLASH_HASH = /^#t-([A-Za-z0-9_-]{1,64})$/;
/** The week quests card sits 16 px under the goals inside .o9 (the board's own gap between sections). */
const QUESTS_SLOT_STYLE = { marginTop: 16 } as const;

/**
 * A row a week quest asked for (SEEK_TEMPLATE_EVENT, roadmap F17): outlined
 * for JUST_ADDED_MS like a found capture, but without 'just added' in its
 * name (it was not). Focus moves to the row's title (the drawer's opener),
 * never its tick, so a keyboard or screen reader lands on the task and no
 * stray key completes it. The outline is the board's own [data-just-added]
 * rule, set on the element directly because the row's React prop marks
 * captures only.
 */
function flashSought(el: HTMLElement) {
  el.setAttribute("data-just-added", "1");
  window.setTimeout(() => el.removeAttribute("data-just-added"), JUST_ADDED_MS);
  el.querySelector<HTMLElement>(".r-open")?.focus({ preventScroll: true });
}

function without<V>(record: Record<string, V>, key: string): Record<string, V> {
  const next = { ...record };
  delete next[key];
  return next;
}

// ── M2: device-local flags (a settled notice seen or dismissed, a miss
// prompt put off). Every access is wrapped: storage can be missing or throw
// (a private window, blocked site data); then the flag lives for this tab.

function readFlags(keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of keys) {
      const v = window.localStorage.getItem(k);
      if (v != null) out[k] = v;
    }
  } catch {
    // No storage: every flag reads unset.
  }
  return out;
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // No storage: the flag lives in state for this tab only.
  }
}

/** A make-up (or a write-off) resolved in place: its card says so until the refresh after the one that removed it. */
interface MadeUpEntry {
  card: OwedCard;
  state: "repaid" | "minimum" | "written-off";
  line: string;
  /** The refreshed props no longer list it as owed: the next refresh drops it. */
  landed: boolean;
}

function madeUpAfterRefresh(prev: Record<string, MadeUpEntry>, d: BoardData): Record<string, MadeUpEntry> {
  const ids = Object.keys(prev);
  if (ids.length === 0) return prev;
  const open = new Set((d.duty?.owed ?? []).map((c) => c.instanceId));
  const next: Record<string, MadeUpEntry> = {};
  for (const id of ids) {
    const e = prev[id];
    if (e.landed) continue;
    next[id] = open.has(id) ? e : { ...e, landed: true };
  }
  return next;
}

/** A rule change's answer, read defensively (archive and clarify answer with it once lane C defers them). */
function deferredDayOf(v: unknown): DayKey | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { effect?: unknown; effectiveDay?: unknown };
  return o.effect === "deferred" && typeof o.effectiveDay === "string" ? o.effectiveDay : null;
}

/** The declarations the board knows of: DutyBoard.declared when sent, else the three days RestState names. */
function declaredOf(duty: DutyBoard | null, today: DayKey): DeclaredDay[] {
  if (!duty) return [];
  if (duty.declared) return duty.declared;
  const out: DeclaredDay[] = [];
  const add = (day: DayKey, kind: DeclaredDay["kind"] | null) => {
    if (kind) out.push({ day, kind });
  };
  add(addDays(today, -1), duty.rest.yesterday);
  add(today, duty.rest.today);
  add(addDays(today, 1), duty.rest.tomorrow);
  return out;
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
 *
 * M2 (Duty, from BoardData.duty): open debts render only inside the Must
 * lane (one MakeUpCard, or one collapsed OwedSummary) and in the Owed row
 * (.o8); .o1 holds one Duty card at most (YesterdaySettled, else the rest
 * banner); Record yesterday gains its honesty line, the freeze switch and
 * the Settle footer; the drawer gains a must's rule pills; Close the day
 * gains the note, the mood and 'Rest <weekday>'. A make-up is Tier 0
 * (makeup-paid), the last debt Tier 1 (nothing-owed); a settled notice
 * plays its Tier 1 in place the first time a device sees it. Before Duty's
 * launch the board is the pre-M2 board (debts, which only settlement
 * writes, render whenever they exist).
 */
export function TodayBoard({ data, streak, nowIso, notices, focus, bosses, footClock, launched = false, namedTitles, questsSlot = null }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  /** The Close sheet (M5, launched only) and whether its close is in flight. */
  const [goalClose, setGoalClose] = useState<GoalCloseTarget | null>(null);
  const [goalClosing, setGoalClosing] = useState(false);
  /**
   * After a close, where focus goes once the sheet has shut: the next
   * goal's Close chip (by its goal id), else the Goals heading (null). The
   * sheet hands focus back to its opener, the closed card's chip, which
   * the refreshed board removes; without this, focus would fall to <body>.
   */
  const [focusAfterClose, setFocusAfterClose] = useState<{ next: string | null } | null>(null);
  /** The Reschedule sheet (a goal carried past its due day) and whether its save is in flight. */
  const [goalResched, setGoalResched] = useState<GoalReschedTarget | null>(null);
  const [reschedBusy, setReschedBusy] = useState(false);
  /** Resizes, self-ratings and renames in flight, by template. */
  const [working, setWorking] = useState<Record<string, DrawerWork>>({});
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [capacityBusy, setCapacityBusy] = useState(false);
  // ── M2 (Duty) ──
  /** The collapsed OwedSummary is open (the Owed row opens it). */
  const [owedOpen, setOwedOpen] = useState(false);
  /** Make-ups resolved in place, by instance id. */
  const [madeUp, setMadeUp] = useState<Record<string, MadeUpEntry>>({});
  /** A make-up, minimum, undo or 'Accept the loss' in flight (the instance id). */
  const [owedBusy, setOwedBusy] = useState<string | null>(null);
  /** A Duty write in flight that is not a card's: settle, freeze, rest, rule pills, reflection. */
  const [dutyBusy, setDutyBusy] = useState(false);
  /** Plan time off is open, and its vacation form. */
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [vacationOpen, setVacationOpen] = useState(false);
  /** Close the day's note and mood (never graded). */
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  /** Device-local flags, read after mount (null until then, so the server and first client render agree). */
  const [flags, setFlags] = useState<Record<string, string> | null>(null);
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
    if (seen.data !== data) setMadeUp((prev) => madeUpAfterRefresh(prev, data));
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
  const streakCardRef = useRef<HTMLElement | null>(null);
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
  // Today's held musts (a rest day) count as excused, as settlement will record them (decision 15).
  const fullDay = useMemo(() => fullDayOf(fullDayInputOf(withHeldExcused(current, board.must), board, quest)), [current, board, quest]);
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

  // ── A capture lands: open where it went, find its row, outline it ───────
  //
  // The sheet fires CAPTURED_EVENT with the server's CapturedItem (its
  // `where` is today-board placeOf, the rule this board files by), and a
  // toast's 'View' link elsewhere arrives as /today#t-<id>. Either way the
  // board opens the place (Anytime for anytime, planned later and coming
  // up; the Inbox row only flashes, its sheet stays shut), waits for the
  // row to be drawn (the refreshed props can land after the toast; it gives
  // up after SEEK_MS), scrolls it into view (smoothly only in Full motion)
  // and outlines it for JUST_ADDED_MS, with 'just added' in its name.

  /**
   * A task to find: its template id, when the search began, and whether a
   * week quest row asked for it (sought: flashed and focused, never called
   * 'just added') rather than a capture landing.
   */
  const [seek, setSeek] = useState<{ id: string; at: number; sought?: boolean } | null>(null);
  /** The template whose row (or goal) is outlined right now. */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  /** A capture went to the Inbox: its row flashes. */
  const [inboxFlash, setInboxFlash] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const showCaptured = useCallback((id: string, lane: PlaceLane | null) => {
    if (lane === "inbox") {
      setInboxFlash(true);
      return;
    }
    if (lane && ANYTIME_PLACES.has(lane)) setAnytimeOpen(true);
    setSeek({ id, at: Date.now() });
  }, []);

  useEffect(() => {
    const onCaptured = (e: Event) => {
      const item = (e as CustomEvent<CapturedItem | undefined>).detail;
      if (!item || typeof item.id !== "string") return;
      showCaptured(item.id, item.where?.lane ?? null);
    };
    window.addEventListener(CAPTURED_EVENT, onCaptured);
    return () => window.removeEventListener(CAPTURED_EVENT, onCaptured);
  }, [showCaptured]);

  // '#t-<id>' on arrival: flash that row, then drop the hash so a reload or Back never flashes again.
  useEffect(() => {
    const m = FLASH_HASH.exec(window.location.hash);
    if (!m) return;
    const raf = window.requestAnimationFrame(() => {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      showCaptured(m[1], null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [showCaptured]);

  // A week quest row on Today (roadmap F17: PRACTICE and STEP rows are
  // buttons, never '#t-' links, and carry no data-template-id) asks for its
  // task: the same seek, which opens Anytime when the task is there.
  useEffect(() => onSeekTemplate(({ templateId }) => setSeek({ id: templateId, at: Date.now(), sought: true })), []);

  // Look once the board has drawn: on every new board, and once Anytime opens.
  useEffect(() => {
    if (!seek) return;
    const raf = window.requestAnimationFrame(() => {
      const sel = `[data-template-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(seek.id) : seek.id}"]`;
      const el = boardRef.current?.querySelector<HTMLElement>(sel);
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: motionLevel() === "full" ? "smooth" : "instant" });
        if (seek.sought) flashSought(el);
        else setJustAdded(seek.id);
        setSeek(null);
        return;
      }
      // Not drawn yet. A '#t-' link (or a week quest row) names no place:
      // once the data holds the template, open the place the board files it in.
      const place = seekPlaceOf(current, seek.id);
      if (!place.found) return;
      if (place.open === "inbox") {
        setInboxFlash(true);
        setSeek(null);
      } else if (place.open === "anytime") {
        setAnytimeOpen(true);
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [seek, current, anytimeOpen]);

  // Give up on a row that never comes (archived meanwhile, or done earlier and off the board).
  useEffect(() => {
    if (!seek) return;
    const t = window.setTimeout(() => setSeek((s) => (s && s.at === seek.at ? null : s)), Math.max(0, seek.at + SEEK_MS - Date.now()));
    return () => window.clearTimeout(t);
  }, [seek]);

  useEffect(() => {
    if (!justAdded) return;
    const t = window.setTimeout(() => setJustAdded(null), JUST_ADDED_MS);
    return () => window.clearTimeout(t);
  }, [justAdded]);

  useEffect(() => {
    if (!inboxFlash) return;
    const t = window.setTimeout(() => setInboxFlash(false), JUST_ADDED_MS);
    return () => window.clearTimeout(t);
  }, [inboxFlash]);

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
      // M2 (F3): the server deferred it (a must, once Duty is live): the row comes back and says when it leaves.
      const deferred = res.ok ? deferredDayOf(res.value) : null;
      if (deferred) {
        dropUndo();
        setPending((prev) => prev.filter((p) => p.op.id !== op.id));
        setNotice(deferredNoticeOf(row.title, "archive", deferred));
      }
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

  /**
   * A row's steps: one step on or off, or every step (stepId null: the row's tick and the drawer's Done when it has
   * steps). The server re-prices what the task pays (the share ticked; a must only when all are done); a gain flies
   * to the ledger like a tick, a loss is said.
   */
  function tickSteps(row: BoardRow, stepId: string | null, done: boolean, from?: Element | null) {
    if (staleDay()) return;
    work(
      row.template.id,
      { kind: "steps" },
      () => tickStep(row.template.id, stepId, done, REFRESH),
      (v) => {
        presentAll(v.celebrations);
        if (v.delta > 0) markTick(row, v.delta, from);
        else if (v.delta < 0) announce(`${fmtXp(-v.delta)} life XP taken back with that step.`);
      }
    );
  }
  /** Rows whose tick goes through their steps: today's, with steps, not already paid by a whole tick. */
  const viaSteps = (row: BoardRow) => !!row.steps && !row.steps.checklist && row.state === "open";

  /**
   * A forgotten tick: today's row ticked for yesterday (completeTask with day 'yesterday', the server's
   * yesterdayBookable gate). It pays against yesterday's ledger and counts on yesterday, as if ticked then.
   */
  function recordYesterday(row: BoardRow) {
    if (staleDay()) return;
    dispatch(
      null,
      () => completeTask(row.template.id, { day: "yesterday" }, REFRESH),
      (v) => {
        presentAll(v.celebrations);
        setNotice(`Recorded for yesterday: ${row.template.title} · paid ${fmtXp(v.receipt.xp)}. Undo it from Record yesterday.`);
      }
    );
  }

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
        // The server's moments for this tick (a streak milestone, a habit
        // rung, a finished goal): Seals and Ascensions only, since
        // presentAll skips T1 and the board chimes its own.
        presentAll(v.celebrations);
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
    dispatch(op, () => againTask(row.template.id, { minutes }, REFRESH), (v) => {
      presentAll(v.celebrations);
      return { instanceId: v.instanceId, receipt: v.receipt, slot: v.slot };
    });
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

  /** The clock and launch state a rule change is classified against (duty-rule.ts classifyChange, as the server does). */
  const ruleCtx = () => ({ today: current.today, nowMs: serverNow(), live: board.dutyLive });

  function archive(row: BoardRow) {
    setOpenKey(null);
    setDrawerMinutes(null);
    const templateId = row.template.id;
    // M2 (F3): once Duty is live, archiving a must (past its 60-minute typo
    // grace) waits seven days. The row stays, with 'must · ends Thu 8 Oct'.
    const change = row.template.compulsory ? ruleChangeOf(row.template, { archived: true }, ruleCtx()) : null;
    if (change?.effectiveDay) {
      const day = change.effectiveDay;
      dispatch(null, () => archiveTask(templateId, REFRESH), (v) => setNotice(deferredNoticeOf(row.template.title, "archive", deferredDayOf(v) ?? day)));
      return;
    }
    remove({ id: templateId, title: row.template.title }, "Archived", () => archiveTask(templateId, REFRESH));
  }

  function clarify(templateId: string, choice: InboxChoice, parentId?: string) {
    if (choice === "drop") {
      const title = current.templates.find((t) => t.id === templateId)?.title ?? "Inbox item";
      remove({ id: templateId, title }, "Dropped", () => clarifyInbox(templateId, "drop", null, REFRESH));
      return;
    }
    const op: BoardOp = { id: nextOpId(), kind: "hide", templateId };
    dispatch(
      op,
      () => clarifyInbox(templateId, choice, parentId ?? null, REFRESH),
      (v) => {
        // M2 (F3): a must's idea / anytime / tomorrow can be deferred too: it stays where it was, and says so.
        const deferred = deferredDayOf(v);
        if (deferred) {
          const title = current.templates.find((t) => t.id === templateId)?.title ?? "That must";
          setPending((prev) => prev.filter((p) => p.op.id !== op.id));
          setNotice(deferredNoticeOf(title, "archive", deferred));
          return;
        }
        if (v.href) router.push(v.href);
      }
    );
  }

  function progressGoal(goalId: string) {
    setBusyGoals(true);
    dispatch(
      null,
      async () => {
        try {
          // A fresh key per tap: a tap that reaches the server twice counts once.
          return await goalProgress(goalId, 1, { ...REFRESH, opId: freshKey() });
        } finally {
          // Cleared on every outcome, a thrown network error included, so the
          // goal buttons never stay disabled until a reload.
          setBusyGoals(false);
        }
      },
      // A finished goal is a Seal (Short, Mid) or an Ascension (Long).
      (v) => presentAll(v.celebrations)
    );
  }

  const goalTitleOf = (goalId: string): string =>
    Object.values(board.goals)
      .flat()
      .find((g) => g.template.id === goalId)?.template.title ?? "Goal";

  /** A ROADMAP goal's zero reason and reset note, for its Close sheet (null for every other goal). */
  const goalRoadmapOf = (goalId: string): GoalCloseRoadmap | null => {
    const rm = Object.values(board.goals)
      .flat()
      .find((g) => g.template.id === goalId)?.roadmap;
    return rm && (rm.zeroReason || rm.note) ? { zeroReason: rm.zeroReason, note: rm.note } : null;
  };

  /**
   * Reads what closing now pays (read-only) into the open Close sheet, if it
   * is still open on this goal. A null preview means the goal is not open
   * any more (closed on another device or tab): the board is refreshed, so
   * its card and Close chip leave the strip.
   */
  function loadGoalPreview(goalId: string) {
    const put = (preview: GoalClosePreview) => setGoalClose((c) => (c && c.id === goalId ? { ...c, preview } : c));
    previewGoalClose(goalId).then(
      (res) => {
        put(res.ok ? { state: "ready", payout: res.value } : { state: "error", error: res.error });
        if (res.ok && res.value === null) router.refresh();
      },
      () => put({ state: "error", error: "Couldn't reach the server. Check the connection and try again." })
    );
  }

  // After a successful close, once the sheet has shut (its own effect hands
  // focus to the closed card's chip first), move focus to a target that
  // outlives the refresh: the next goal's Close chip, else the Goals heading.
  useEffect(() => {
    if (!focusAfterClose) return;
    const raf = window.requestAnimationFrame(() => {
      const card = focusAfterClose.next
        ? Array.from(document.querySelectorAll<HTMLElement>(".today-goals [data-template-id]")).find((el) => el.dataset.templateId === focusAfterClose.next)
        : undefined;
      const target = card?.querySelector<HTMLElement>(GOAL_CLOSE_CHIP) ?? document.getElementById(GOALS_HEADING_ID);
      target?.focus({ preventScroll: false });
      setFocusAfterClose(null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [focusAfterClose]);

  /** Close: the sheet opens on the exact figure closing now pays, and why. */
  function openGoalClose(goalId: string) {
    if (!launched) return;
    setError(null);
    setNotice(null);
    setGoalClose({ id: goalId, title: goalTitleOf(goalId), preview: { state: "loading" }, error: null, open: true, roadmap: goalRoadmapOf(goalId) });
    loadGoalPreview(goalId);
  }

  /**
   * Confirm: closeGoal decides again as it writes (the same rule), pays
   * once, and returns its moments (a Seal stating the MP), presented the way
   * a tick's are. A refusal stays in the sheet with a fresh figure; a close
   * that paid other than the sheet said says both.
   */
  function confirmGoalClose() {
    const target = goalClose;
    if (!target || !target.open || target.preview.state !== "ready" || !target.preview.payout || goalClosing) return;
    const shown = target.preview.payout;
    setGoalClosing(true);
    setGoalClose({ ...target, error: null });
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof closeGoal>>;
      try {
        res = await closeGoal(target.id, REFRESH);
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
      } finally {
        setGoalClosing(false);
      }
      if (!res.ok) {
        const error = res.error;
        setGoalClose((c) => (c && c.id === target.id ? { ...c, error, preview: { state: "loading" } } : c));
        // Closed elsewhere (another device or tab): the card leaves the strip now, not on a manual reload.
        if (error === GOAL_ALREADY_CLOSED) router.refresh();
        loadGoalPreview(target.id);
        return;
      }
      const v = res.value;
      const drawn = Array.from(document.querySelectorAll<HTMLElement>(".today-goals [data-template-id]")).map((el) => el.dataset.templateId ?? "");
      setFocusAfterClose({ next: goalAfterClose(drawn, target.id) });
      setGoalClose((c) => (c && c.id === target.id ? { ...c, open: false } : c));
      presentAll(v.celebrations);
      setNotice(goalClosedNotice(target.title, shown, { paid: v.paid, why: v.why }));
    });
  }

  function openGoalResched(goalId: string) {
    setError(null);
    setNotice(null);
    setGoalResched((c) => ({ id: goalId, title: goalTitleOf(goalId), error: null, open: true, nonce: (c?.nonce ?? 0) + 1 }));
  }

  /** Reschedule: only the due day moves (no MP, so it is offered before launch too). */
  function saveGoalResched(day: string) {
    const target = goalResched;
    if (!target || !target.open || reschedBusy) return;
    setReschedBusy(true);
    setGoalResched({ ...target, error: null });
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof rescheduleGoal>>;
      try {
        res = await rescheduleGoal(target.id, day, REFRESH);
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
      } finally {
        setReschedBusy(false);
      }
      if (!res.ok) {
        const error = res.error;
        setGoalResched((c) => (c && c.id === target.id ? { ...c, error } : c));
        return;
      }
      setGoalResched((c) => (c && c.id === target.id ? { ...c, open: false } : c));
      setNotice(goalRescheduledNotice(target.title, res.value.dueDay, current.today));
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
      sweepEl: primary === "lane-kept" ? mustBodyRef.current : primary === "day-kept" ? streakCardRef.current : dayTileRef.current,
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

  // ── Next up (its 'R' key hint is the global 'r' of src/lib/shortcuts.ts,
  // answered by <Shortcuts/> on every page, not only while the quest is next) ──

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
        onTick={(from) => (viaSteps(row) ? tickSteps(row, null, true, from) : complete(row, { minutes }, from))}
        onUndo={() => undo(row)}
        onToggleDrawer={() => {
          setOpenKey((k) => (k === key ? null : key));
          setDrawerMinutes(null);
        }}
        onToggleReceipt={() => setReceiptKey((k) => (k === key ? null : key))}
        onMinimum={row.lane === "must" && row.template.mvv ? (from) => complete(row, { mvv: true }, from) : undefined}
        justAdded={justAdded === row.template.id}
        restToday={board.restToday}
        named={namedOfTitle(namedTitles, row.template.id)}
        namedMark={namedTitles?.mark}
        taskStyle={current.styles?.[row.template.id] ?? null}
        onStep={(stepId, done, from) => tickSteps(row, stepId, done, from)}
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
          onDone={() => (viaSteps(row) ? tickSteps(row, null, true) : complete(row, { minutes }))}
          onYesterday={() => recordYesterday(row)}
          onMinimum={() => complete(row, { mvv: true })}
          onSkip={() => skip(row)}
          onTomorrow={() => moveToTomorrow(row)}
          onAgain={() => again(row, minutes)}
          onRename={(title) => work(row.template.id, { kind: "rename", title }, () => renameTask(row.template.id, title, REFRESH))}
          onArchive={() => archive(row)}
          onOverride={(n) => work(row.template.id, { kind: "rate", override: n }, () => setBandOverride(row.template.id, n, REFRESH))}
          onResize={() => resize(row)}
          rule={drawerOpen ? drawerRuleOf(row) : null}
          taskStyle={current.styles?.[row.template.id] ?? null}
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
  // Today's rows that can still be ticked for yesterday (the Record yesterday sheet's second list), once each.
  const forgotten = [...board.must, ...board.todayRows, ...board.anytime].filter(
    (r, i, all) => r.recordYesterday && all.findIndex((x) => x.template.id === r.template.id) === i && !board.yesterdayRows.some((y) => y.template.id === r.template.id)
  );
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

  // "Kept today, 08:05.": the first deed's time, when the board holds it (a
  // review or a new idea may have kept the day first; then no time is said).
  const keptAt = keptToday ? keptAtOf(current) : null;
  const streakCaption: ReactNode = keptToday ? (
    <>
      <b>{keptAt ? `Kept today, ${hhmmOf(Date.parse(keptAt))}.` : "Kept today."}</b> Safe until 04:00.
    </>
  ) : streakNow > 0 ? (
    "Not kept yet. Any tick or review keeps it."
  ) : (
    "Any tick or review starts a streak."
  );

  // ── M2: Duty on the board (F3, F8, F10, F12, F13) ───────────────────────
  //
  // Debt shows only inside the Must lane (one card, or one collapsed
  // summary) and in the Owed row at the foot of the lanes; the board never
  // opens on red. Before launch every piece below answers with the pre-M2
  // board (duty absent or not live), except open debts, which render
  // whenever they exist (decision 2).

  const duty = current.duty ?? null;
  const live = board.dutyLive;
  const launchDay = duty?.launchDay ?? null;
  const declared = declaredOf(duty, current.today);
  const yesterdayActive = yesterdayActiveOf(streak, current);
  const ledgerDuty = dayLedgerDutyOf({ duty, streak, kept: shown.snapshot.kept, full: shown.fullDay.full, today: current.today, yesterdayActive });
  /** Rule changes classified on the board's clock (render); the server decides again when it writes. */
  const viewCtx = { today: current.today, nowMs: clock, live };

  // Device-local flags for what is on screen, read once mounted.
  const flagSig = [duty?.cursor ? settledKey(duty.cursor) : "", ...(duty?.owed ?? []).map((c) => missPromptKey(c.templateId, c.lastMissDay))]
    .filter(Boolean)
    .join("|");
  useEffect(() => {
    // Storage is read only after mount, so the server and the first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlags(readFlags(flagSig ? flagSig.split("|") : []));
  }, [flagSig]);
  const setFlag = (key: string, value: string) => {
    writeFlag(key, value);
    setFlags((f) => ({ ...(f ?? {}), [key]: value }));
  };

  // .o1: one card at most: the settled notice (until dismissed on this device), else the rest banner.
  const settled = live && duty ? settledNoticeOf(duty.settled, duty.cursor, current.today, { floor: dutyFloorOf(duty) }) : null;
  const stillOwedOnRest = board.must.filter((r) => r.template.compulsory && r.template.compulsoryOnRest && r.state === "open").length;
  // A rest or vacation from tomorrow: the 'Even on rest days' musts due on those days stay owed, and the banner says so.
  const ahead = duty ? declaredAheadOf(duty.rest, current.today) : null;
  const stillOwedAhead = ahead ? onRestMustsIn(current.templates, ahead.from, ahead.to) : 0;
  const banner = duty ? restBannerOf(duty.rest, current.today, { stillOwed: stillOwedOnRest, stillOwedTomorrow: stillOwedAhead }) : null;
  const o1 = settled && flags === null ? null : o1CardOf({ settled, settledDismissed: !!settled && flags?.[settledKey(settled.day)] === "dismissed", banner });
  const settledRef = useRef<HTMLElement | null>(null);
  const settledShownDay = o1 === "settled" && settled ? settled.day : null;
  const settledRepaired = !!settled?.repairedDay;
  const settledTitle = settled?.title ?? "Yesterday settled";
  const settledSeen = settledShownDay != null && !!flags?.[settledKey(settledShownDay)];
  useEffect(() => {
    if (!settledShownDay || settledSeen) return;
    // Tier 1, rendered in place the first time this device sees it (F12, F16). Nothing is stored server-side.
    writeFlag(settledKey(settledShownDay), "seen");
    chime({ kind: settledRepaired ? "day-repaired" : "yesterday-settled", id: `settled:${settledShownDay}`, text: settledTitle, burstEl: settledRef.current });
  }, [settledShownDay, settledSeen, settledRepaired, settledTitle]);
  const dismissSettled = () => {
    if (settled) setFlag(settledKey(settled.day), "dismissed");
  };
  const settledChips: NoticeChip[] = (settled?.chips ?? []).map((c) =>
    c.tone === "held" ? { tone: "held", held: "freeze", text: c.text } : c.tone === "kept" ? { tone: "kept", icon: "check", text: c.text } : { tone: "quiet", text: c.text }
  );

  // The Must lane: today's musts, then the debts (one card, or one collapsed summary once two are open).
  const openOwed = board.owed.filter((c) => !madeUp[c.instanceId]);
  const laneCards = [...board.owed, ...Object.values(madeUp).map((e) => e.card).filter((c) => !board.owed.some((o) => o.instanceId === c.instanceId))].sort(
    (a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title) || a.instanceId.localeCompare(b.instanceId)
  );
  const mustView = mustLaneOf({ must: board.must, owed: laneCards, restToday: board.restToday, live, launchDay, today: current.today });
  const owedTotal = owedTotalOf(openOwed);
  const prompt = missPromptOf(openOwed, (k) => flags === null || !!flags[k], live);

  /** One Duty write that is not a card's (settle, freeze, rest, the rule pills, the reflection). */
  function dutyWrite<T>(call: () => Promise<Result<T>>, onOk?: (value: T) => void) {
    setDutyBusy(true);
    dispatch(
      null,
      async () => {
        try {
          return await call();
        } finally {
          setDutyBusy(false);
        }
      },
      onOk
    );
  }

  /**
   * Make up (or do the minimum of) a missed must. Optimistic: the card
   * resolves in place on the tap ('Made up. Nothing owed.'), the "+N" token
   * flies to the life-XP cell (Tier 0, makeup-paid: the repayment and the
   * make-up both land in today's life XP), the last debt sweeps the Must
   * lane (Tier 1, nothing-owed), and Undo waits in the ToastDock. A refusal
   * takes the card back and says why.
   */
  function makeUpOwed(card: OwedCard, minimum: boolean, from: Element | null) {
    if (staleDay() || owedBusy) return;
    const shownXp = minimum ? (card.minimumXp ?? 0) : card.makeUpXp;
    const amount = Math.round((shownXp + card.debtXp) * 10) / 10;
    actedAt.current = tapTime();
    const flight = mark({
      kind: "makeup-paid",
      id: `makeup:${card.instanceId}`,
      text: `Made up ${card.title} · repaid ${fmtXp(card.debtXp)}, about ${fmtXp(shownXp)} for the make-up`,
      amount: amount > 0 ? { kind: "xp", value: amount } : undefined,
      from,
    });
    if (amount > 0) holdLedger("xp", flight);
    setMadeUp((prev) => ({
      ...prev,
      [card.instanceId]: { card, state: minimum && card.restoresToday ? "minimum" : "repaid", line: minimum ? "Minimum done." : "Made up.", landed: false },
    }));
    setOwedBusy(card.instanceId);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      let res: DutyActionResult<MakeUpResult>;
      try {
        res = minimum ? await doMinimum(card.instanceId, REFRESH) : await makeUp(card.instanceId, REFRESH);
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
      }
      setOwedBusy(null);
      if (!res.ok) {
        setMadeUp((prev) => without(prev, card.instanceId));
        setError(res.error);
        return;
      }
      const v = res.value;
      setMadeUp((prev) =>
        prev[card.instanceId] ? { ...prev, [card.instanceId]: { ...prev[card.instanceId], state: v.status === "DONE_MVV" ? "minimum" : "repaid", line: madeUpLineOf(v) } } : prev
      );
      if (Math.abs(v.xp - shownXp) > 0.05) setNotice(`${card.title}'s make-up paid ${fmtXp(v.xp)} XP, not about ${fmtXp(shownXp)}: today's total changed since the board loaded.`);
      if (v.clearedLast) {
        chime({ kind: "nothing-owed", id: `nothing-owed:${current.today}:${v.instanceId}`, text: "Nothing owed", say: "Nothing owed. Every debt is made up.", sweepEl: mustBodyRef.current });
      }
      pushToast({ key: `makeup:${v.instanceId}`, title: minimum ? "Minimum done" : "Made up", body: card.title, action: { label: "Undo", onAction: () => undoOwed(card) }, holdMs: REMOVE_UNDO_MS });
    });
  }

  /** Takes a make-up back (10 minutes, the same life day): the debt reopens and the day nets to zero. */
  function undoOwed(card: OwedCard) {
    setOwedBusy(card.instanceId);
    dispatch(
      null,
      async () => {
        try {
          return await undoMakeUp(card.instanceId, REFRESH);
        } finally {
          setOwedBusy(null);
        }
      },
      () => {
        setMadeUp((prev) => without(prev, card.instanceId));
        announce(`Make-up undone. ${card.title} is owed again; nothing else changed.`);
      }
    );
  }

  /**
   * 'Accept the loss' (Settings › Days on, the debt 14 days old): its DEBT
   * row stays; nothing more is owed. The card resolves as written off (a
   * quiet chip, never 'Repaid'): nothing was repaid.
   */
  function acceptLossOwed(card: OwedCard) {
    setOwedBusy(card.instanceId);
    dispatch(
      null,
      async () => {
        try {
          return await acceptLoss(card.instanceId, REFRESH);
        } finally {
          setOwedBusy(null);
        }
      },
      (v) => {
        const line = `Its −${fmtXp(v.debtXp)} stays in Duty XP; nothing more is owed.`;
        setMadeUp((prev) => ({ ...prev, [card.instanceId]: { card, state: "written-off", line, landed: false } }));
        announce(`${card.title} is written off. ${line}`);
      }
    );
  }

  /** The Owed row at the foot of the lanes: to the Must lane, with its summary open. */
  function openOwedRow() {
    setOwedOpen(true);
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-lane="must"]`);
    el?.scrollIntoView({ block: "start", behavior: motionLevel() === "full" ? "smooth" : "instant" });
  }

  const unflagLine = (title: string, v: { effect: "immediate" | "deferred"; effectiveDay: DayKey | null }) =>
    v.effect === "deferred" && v.effectiveDay ? deferredNoticeOf(title, "unflag", v.effectiveDay) : `${title} is no longer a must.`;

  /** The drawer's rule pills (F3): only once Duty has a launch day; a must, or a template with a change pending. */
  function drawerRuleOf(row: BoardRow): DrawerRule | null {
    const t = row.template;
    if (!launchDay || (!t.compulsory && !row.pendingNext)) return null;
    return {
      pending: row.pendingNext ?? null,
      onRest: !!t.compulsoryOnRest,
      unflagFrom: ruleChangeOf(t, { compulsory: false }, viewCtx).effectiveDay,
      restOffFrom: ruleChangeOf(t, { compulsoryOnRest: false }, viewCtx).effectiveDay,
      onNotMust: () => dutyWrite(() => setCompulsory(t.id, false, REFRESH), (v) => setNotice(unflagLine(t.title, v))),
      onOnRest: (on) =>
        dutyWrite(
          () => setCompulsoryOnRest(t.id, on, REFRESH),
          (v) =>
            setNotice(
              on
                ? `${t.title} is owed even on rest days, from today.`
                : v.effect === "deferred" && v.effectiveDay
                  ? deferredNoticeOf(t.title, "rest-off", v.effectiveDay)
                  : `${t.title} is held on rest days again.`
            )
        ),
      onKeep: () => dutyWrite(() => cancelPendingChange(t.id, REFRESH), () => setNotice(`${t.title} keeps its rule. Nothing changes.`)),
    };
  }

  // Record yesterday (decision 24): the honesty line, the freeze switch and the sticky Settle footer.
  const ys = yesterdaySheetOf({ yesterday: current.yesterday, recordBy, duty, yesterdayActive });
  function settleNow() {
    const day = fullWeekday(current.yesterday);
    dutyWrite(
      () => settleYesterday(REFRESH),
      () => {
        setYesterdayOpen(false);
        pushToast({ key: "settled-yesterday", title: `${day} is settled`, body: "It is locked now. Anything missed is made up from its card.", holdMs: 6000 });
      }
    );
  }
  function spendFreezeNow(on: boolean) {
    if (!on) return;
    dutyWrite(
      () => spendFreeze(REFRESH),
      (v) => announce(`A freeze covers ${fullWeekday(v.day)}. ${v.left} left.`)
    );
  }

  // Time off (F9 through RestControls; F13's 'Rest <weekday>' switch).
  const restOptions = restOptionsOf({ today: current.today, launchDay, declared });
  const cancellable = cancellableOf(declared, current.today);
  const restSwitch = restSwitchOf({ today: current.today, launchDay, declared });
  const tomorrow = addDays(current.today, 1);
  const vacationMin = launchDay && launchDay > tomorrow ? launchDay : tomorrow;
  const heldSaid = (day: DayKey) => `${fullWeekday(day)} is held: nothing is owed and the streak holds.`;
  function restAction(kind: "rest" | "sick" | "away", day: DayKey | null) {
    if (kind === "away") {
      setVacationOpen((o) => !o);
      return;
    }
    if (kind === "sick") {
      dutyWrite(() => declareSick(REFRESH), (v) => setNotice(heldSaid(v.day)));
      return;
    }
    if (day) dutyWrite(() => declareRest(day, REFRESH), (v) => setNotice(heldSaid(v.day)));
  }
  function submitVacation(from: DayKey, to: DayKey) {
    dutyWrite(
      () => setVacation(from, to, REFRESH),
      (v) => {
        setVacationOpen(false);
        setNotice(`Vacation set: ${v.days} days, ${dayLabel(v.from)} to ${dayLabel(v.to)}. ${v.budgetLeft} vacation days left in the year.`);
      }
    );
  }
  function cancelDeclared(from: DayKey, to?: DayKey) {
    dutyWrite(
      () => cancelRest(from, to && to !== from ? to : undefined, REFRESH),
      (v) => setNotice(v.cancelled.length === 1 ? `${fullWeekday(v.cancelled[0])} is an ordinary day again.` : `${v.cancelled.length} days are ordinary days again.`)
    );
  }

  // Close the day (F13): what is still open, with the moves the server accepts (board-ui.ts closeItemsOf).
  const closeItems = closeItemsOf({ must: board.must, todayRows: board.todayRows, today: current.today, live });
  const rowByKey = new Map(lanes.map((r) => [r.key, r]));
  const onCloseChoice = (key: string, choice: string) => {
    const r = rowByKey.get(key);
    if (!r) return;
    if (choice === "minimum") complete(r, { mvv: true });
    else if (choice === "tomorrow") moveToTomorrow(r);
    else if (choice === "anytime") clarify(r.template.id, "anytime");
    else if (choice === "drop") remove({ id: r.template.id, title: r.template.title }, "Dropped", () => archiveTask(r.template.id, REFRESH));
    else if (choice === "skip") skip(r);
  };
  const rollKeys = rollAllKeysOf(closeItems);
  const rollAll = () => {
    for (const key of rollKeys) onCloseChoice(key, "tomorrow");
  };
  const closeDone = () => {
    const clean = note.trim();
    if (live && (clean || mood != null)) {
      dutyWrite(
        () => saveReflection(current.today, clean, mood, REFRESH),
        () => {
          setNote("");
          setMood(null);
          announce("Noted. Never graded.");
        }
      );
    }
    setCloseOpen(false);
  };
  const reflection = live
    ? {
        note,
        onNote: setNote,
        mood,
        onMood: (m: number) => setMood((x) => (x === m ? null : m)),
        restTomorrow: !!restSwitch?.checked,
        onRestTomorrow: (v: boolean) => {
          if (!restSwitch) return;
          if (v) dutyWrite(() => declareRest(restSwitch.day, REFRESH));
          else dutyWrite(() => cancelRest(restSwitch.day, undefined, REFRESH));
        },
        restLabel: restSwitch?.label,
        restDisabledReason: restSwitch?.disabledReason ?? null,
        showRest: !!restSwitch,
      }
    : undefined;

  // The Asks: a badge on the block each concerns (the streak, Next up), never a card of their own; every one is a tap away.
  const asksOn = (host: "streak" | "next") => asks.filter((a) => askHostOf(a) === host);
  const askAction = (a: (typeof asks)[number]) => (a.id === "yesterday" ? () => setYesterdayOpen(true) : undefined);

  // The 'y' shortcut on this page opens Record yesterday.
  useEffect(() => {
    const open = () => setYesterdayOpen(true);
    window.addEventListener(RECORD_YESTERDAY_EVENT, open);
    return () => window.removeEventListener(RECORD_YESTERDAY_EVENT, open);
  }, []);
  // /today?sheet=yesterday opens it too (then the parameter goes), on arrival
  // and on a same-route navigation (the bell's Record link while on /today:
  // the board keeps its instance, so a mount-only read would miss it). Keyed
  // on the router's search params; the page is force-dynamic, so they are
  // known at render and need no Suspense boundary.
  const sheetWanted = searchParams.get(SHEET_PARAM) === YESTERDAY_SHEET;
  useEffect(() => {
    if (!sheetWanted) return;
    // Deferred, and the address rewritten only when it fires, so a cancelled
    // first run (Strict Mode mounts effects twice) leaves the parameter for the second.
    const raf = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete(SHEET_PARAM);
      const q = params.toString();
      // `null` state, as the Next docs show: the router patches replaceState and keeps its search params in step.
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
      setYesterdayOpen(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [sheetWanted]);

  /** One owed card (and, under it, the miss prompt when this template has earned one). */
  const renderOwedCard = (card: OwedCard) => {
    const done = madeUp[card.instanceId];
    const view = makeUpViewOf(card, current.today);
    return (
      <MakeUpCard
        key={card.instanceId}
        item={{ ...view, resolved: done ? { repaid: done.line, minimum: done.line, writtenOff: done.line } : undefined }}
        state={done ? done.state : "open"}
        busy={owedBusy === card.instanceId || busyTemplates.has(card.templateId)}
        onMakeUp={(from) => makeUpOwed(card, false, from)}
        onMinimum={view.minimum ? (from) => makeUpOwed(card, true, from) : undefined}
        onAcceptLoss={card.canWriteOff ? () => acceptLossOwed(card) : undefined}
      >
        {!done && prompt?.instanceId === card.instanceId && (
          <MissPrompt
            copy={missPromptCopyOf(card, viewCtx)}
            busy={dutyBusy}
            onAddMinimum={(text) => dutyWrite(() => setMinimum(card.templateId, text, null, REFRESH), (v) => setNotice(`${card.title} has a minimum version now: ${v.mvv}.`))}
            onStop={() => dutyWrite(() => setCompulsory(card.templateId, false, REFRESH), (v) => setNotice(unflagLine(card.title, v)))}
            onNotNow={() => setFlag(missPromptKey(card.templateId, card.lastMissDay), "later")}
          />
        )}
      </MakeUpCard>
    );
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
      <div className="board" ref={boardRef}>
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
          {/* M2: one Duty card at most in .o1 (board-ui.ts o1CardOf); never owed-toned, never hiding the Record-yesterday Ask. */}
          {o1 === "settled" && settled && (
            <div className="o1">
              <YesterdaySettled sectionRef={settledRef} title={settledTitle} chips={settledChips} note={settled.note ?? ""} onOk={dismissSettled} />
            </div>
          )}
          {o1 === "rest" && banner && (
            <div className="o1">
              <RestBannerCard
                held={HELD_GLYPH[banner.kind]}
                text={banner.text}
                cancelLabel={banner.cancelLabel}
                onCancel={banner.cancelDay ? () => cancelDeclared(banner.cancelDay!, banner.cancelTo ?? undefined) : undefined}
                busy={dutyBusy}
              />
            </div>
          )}

          {/* The streak is its own block, first on a phone; what waits on the days (record yesterday, the weekly review)
              is a badge in its corner. */}
          <div className="o2 ask-host">
            <StreakCard
              streak={{ count: shown.streakNow, capped: streak.capped, kept: shown.snapshot.kept, broken: ledgerDuty.broken }}
              caption={ledgerDuty.caption ?? streakCaption}
              freezes={ledgerDuty.freezes}
              heldNote={ledgerDuty.heldNote}
              sealRef={sealRef}
              cardRef={streakCardRef}
            >
              {/* Always one tap away: what was due yesterday, and anything else forgotten (a tick counts on yesterday). */}
              <button type="button" className="today-streak-y" aria-haspopup="dialog" onClick={() => setYesterdayOpen(true)}>
                Record yesterday{yesterdayOpenCount > 0 ? ` · ${yesterdayOpenCount} open` : ""}
                <Icon name="chev" size={14} />
              </button>
            </StreakCard>
            <AskBadge asks={asksOn("streak")} label="your streak" onAction={askAction} />
          </div>

          {/* The day's ledger (Full day, life XP, review pts, capacity): after the lanes and Next up on a phone. */}
          <div className="o12">
            <DayLedger
              streakApart
              streak={{ count: shown.streakNow, capped: streak.capped, kept: shown.snapshot.kept, broken: ledgerDuty.broken }}
              caption={ledgerDuty.caption ?? streakCaption}
              freezes={ledgerDuty.freezes}
              heldNote={ledgerDuty.heldNote}
              fullNote={ledgerDuty.fullNote ?? undefined}
              aside={ledgerDuty.aside ?? undefined}
              fullDay={shown.fullDay}
              settles={ledgerDuty.settles}
              glint={beat?.glint}
              stampLanding={beat?.full}
              xp={board.lifeXpToday}
              pts={board.reviewXpToday}
              planned={{ minutes: board.planned, capacity: board.capacity, chosen: chosenCapacity, over: board.over }}
              onCapacity={() => setCapacityOpen(true)}
              refs={{
                tile: dayTileRef,
                fullStamp: fullStampRef,
                rings: { musts: mustRingRef, quest: questRingRef, life: lifeRingRef },
              }}
            />
          </div>

          <div className="o3 ask-host">
            <NextUp
              next={next}
              focus={focus}
              bosses={bosses}
              quota={null}
              mustPrice={next.kind === "must" ? next.row.projection.xp : undefined}
              busy={next.kind === "must" ? busyTemplates.has(next.row.template.id) : false}
              onKeepMust={next.kind === "must" ? () => complete(next.row, {}, null) : undefined}
            />
            <AskBadge asks={asksOn("next")} label="your reviews" onAction={askAction} />
          </div>
        </div>

        <div className="c2" data-tour="today-lanes">
          {mustView.show && (
            <Lane
              id="must"
              title="Must"
              must
              kept={shown.mustLaneKept}
              landing={beat?.lane}
              bodyRef={mustBodyRef}
              count={mustView.count ?? undefined}
              badge={
                mustView.chips.length > 0
                  ? mustView.chips.map((c) => (
                      <Chip key={c.text} tone={c.tone} held={c.held} icon={c.icon}>
                        {c.text}
                      </Chip>
                    ))
                  : undefined
              }
              className="o5"
            >
              {board.must.map(renderRow)}
              {/* M2: the debts after today's musts: one card, or one collapsed summary once two are open. */}
              {openOwed.length >= 2 ? (
                <OwedSummary
                  total={owedTotal}
                  count={openOwed.length}
                  {...owedSummaryOf(openOwed, current.today)}
                  open={owedOpen}
                  onOpenChange={setOwedOpen}
                >
                  {laneCards.map(renderOwedCard)}
                </OwedSummary>
              ) : (
                laneCards.map(renderOwedCard)
              )}
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
          {/* M2: 'Owed: 2 · −12.5' at the foot of the lanes; nothing at 0. A tap goes to the Must lane, summary open. */}
          {openOwed.length > 0 && (
            <div className="o8">
              <OwedRow count={openOwed.length} total={owedTotal} onOpen={openOwedRow} />
            </div>
          )}
        </div>

        <div className="c3">
          <div className="o9">
            <GoalsStrip
              goals={board.goals}
              busy={busyGoals || goalClosing || reschedBusy}
              onProgress={progressGoal}
              launched={launched}
              onClose={launched ? openGoalClose : undefined}
              onReschedule={openGoalResched}
              justAdded={justAdded}
              namedTitles={namedTitles}
            />
            {/* Roadmap F17: the week quests card under the goals. Quiet: no Ask, no count, never red; one line while Close the day is prominent. */}
            {questsSlot != null && questsSlot !== false && (
              <div className="rm-quests-slot" data-compact={prominent ? "1" : undefined} style={QUESTS_SLOT_STYLE}>
                {questsSlot}
              </div>
            )}
          </div>

          <section className="card today-side-rows o10" aria-label="Inbox and Anytime">
            <button
              type="button"
              className="collapsed"
              onClick={() => setInboxOpen(true)}
              aria-haspopup="dialog"
              data-just-added={inboxFlash ? "1" : undefined}
            >
              <Icon name="inbox" className="ink-1" />
              <b>
                Inbox
                {inboxFlash && <span className="sr-only">, a capture just landed here</span>}
              </b>
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
                    {board.laterRows.length > 0 && (
                      <div className="today-upcoming">
                        <p className="t-eyebrow">Planned later</p>
                        <ul>
                          {board.laterRows.map((l) => (
                            <li key={l.templateId} data-template-id={l.templateId} data-just-added={justAdded === l.templateId ? "1" : undefined}>
                              <span className="today-upcoming-title">
                                {l.title}
                                {justAdded === l.templateId && <span className="sr-only">, just added</span>}
                              </span>
                              <span className="today-upcoming-day">{l.label}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {upcoming.length > 0 && (
                      <div className="today-upcoming">
                        <p className="t-eyebrow">Coming up</p>
                        <ul>
                          {upcoming.map((u) => (
                            <li key={u.templateId} data-template-id={u.templateId} data-just-added={justAdded === u.templateId ? "1" : undefined}>
                              <span className="today-upcoming-title">
                                {u.title}
                                {justAdded === u.templateId && <span className="sr-only">, just added</span>}
                              </span>
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
                <span>
                  {closeItems.length > 0
                    ? live
                      ? `${closeItems.length} still open: move it, do a minimum, or leave it.`
                      : `${closeItems.length} still open: move it, or do a must's minimum.`
                    : "Nothing left open. Rest well."}
                </span>
              </span>
              <Icon name="chev" size={16} className="ink-2" />
            </button>
            {/* M2: the always-present way to rest, be sick or plan a vacation, once Duty has a launch day. */}
            {launchDay && (
              <div className="close-more">
                <button type="button" className="close-off" onClick={() => setTimeOffOpen(true)} aria-haspopup="dialog">
                  <HeldGlyph kind="rest" size={18} />
                  Time off
                </button>
              </div>
            )}
          </section>

          <div className="foot-note o11">
            <p>Life XP and review points are two ledgers. They are never added together.</p>
            {footClock && <TodayFooter time={footClock.time} zone={footClock.zone} tz={footClock.tz} />}
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
        title={ys.title}
        description={ys.description}
        footer={ys.settle ? <SettleFooter label={ys.settle.label} until={ys.settle.until} lock={ys.settle.lock} onSettle={settleNow} busy={dutyBusy} /> : undefined}
      >
        {ys.honesty && <p className="y-honesty">{ys.honesty}</p>}
        {board.yesterdayRows.length === 0 ? (
          <p className="t-meta">Nothing that was due yesterday is left to record.</p>
        ) : (
          <div className="card lane-body sheet-rows">{board.yesterdayRows.map(renderRow)}</div>
        )}
        {/* A forgotten tick: anything else the server would book for yesterday, one tap each. */}
        {forgotten.length > 0 && (
          <section className="y-more" aria-label="Something else you did yesterday">
            <p className="t-eyebrow">Something else you did yesterday?</p>
            <ul className="y-more-list">
              {forgotten.map((r) => (
                <li key={r.key} className="y-more-row">
                  <span className="y-more-title">{r.template.title}</span>
                  <button type="button" className="today-pill y-more-btn" disabled={busyTemplates.has(r.template.id)} onClick={() => recordYesterday(r)}>
                    Did it yesterday · ≈ {fmtXp(r.recordYesterday!.xp)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {ys.freeze && (
          <FreezeOption label={ys.freeze.label} sub={ys.freeze.sub} checked={ys.freeze.checked} disabled={ys.freeze.disabled || dutyBusy} onChange={spendFreezeNow} />
        )}
        {yesterdayOpen && error && (
          <p role="alert" className="t-meta">
            {error}
          </p>
        )}
      </Sheet>

      {launchDay && (
        <RestControls
          open={timeOffOpen}
          onClose={() => {
            setTimeOffOpen(false);
            setVacationOpen(false);
          }}
          options={restOptions.map((o) => ({
            kind: o.kind,
            title: o.title,
            meta: o.meta,
            action: o.action,
            disabledReason: o.disabledReason,
            onAction: () => restAction(o.kind, o.day),
          }))}
          extra={
            <>
              {vacationOpen && (
                <VacationForm
                  min={vacationMin}
                  initialTo={addDays(vacationMin, 6)}
                  validate={(from, to) => vacationRangeError(from, to, { today: current.today, launchDay })}
                  onSubmit={submitVacation}
                  busy={dutyBusy}
                />
              )}
              <CancelList
                items={cancellable.map((c) => ({ key: `${c.from}|${c.to}`, label: c.label, held: HELD_GLYPH[c.kind] }))}
                onCancel={(key) => {
                  const [from, to] = key.split("|");
                  cancelDeclared(from, to);
                }}
                busy={dutyBusy}
              />
              {timeOffOpen && error && (
                <p role="alert" className="t-meta">
                  {error}
                </p>
              )}
            </>
          }
        />
      )}

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

      <GoalCloseSheet
        open={!!goalClose?.open}
        title={goalClose?.title ?? "Goal"}
        preview={goalClose?.preview ?? { state: "loading" }}
        busy={goalClosing}
        error={goalClose?.error ?? null}
        roadmap={goalClose?.roadmap ?? null}
        onConfirm={confirmGoalClose}
        onClose={() => {
          if (!goalClosing) setGoalClose((c) => (c ? { ...c, open: false } : c));
        }}
      />

      <GoalRescheduleSheet
        open={!!goalResched?.open}
        formKey={goalResched?.nonce ?? 0}
        title={goalResched?.title ?? "Goal"}
        today={current.today}
        busy={reschedBusy}
        error={goalResched?.error ?? null}
        onSave={saveGoalResched}
        onClose={() => {
          if (!reschedBusy) setGoalResched((c) => (c ? { ...c, open: false } : c));
        }}
      />

      <CloseDaySheet
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        description="Optional. Move what is left, or do a must's minimum. Moving changes nothing already paid."
        items={closeItems}
        onChoose={onCloseChoice}
        onRollAll={rollKeys.length > 0 ? rollAll : undefined}
        reflection={reflection}
        busy={busyTemplates.size > 0 || dutyBusy}
        doneLabel={live ? "Close today" : "Done"}
        onDone={closeDone}
      />
    </div>
  );
}

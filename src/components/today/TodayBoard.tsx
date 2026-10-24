"use client";

import { TodayFooter } from "./TodayFooter";
import "./today.css";
import "./momentum.css";
import "./decisions.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
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
import { fullDayInputOf, fullDayOf } from "@/lib/full-day";
import { announce, chime, mark, type MomentumT1Kind } from "@/lib/celebrate";
import type { CelebrationEvent, T1Kind } from "@/lib/celebration-types";
import type { PlaceLane, Receipt } from "@/lib/life-types";
import type { MomentumView } from "@/lib/momentum-server";
import type { CreditTags } from "@/lib/credits";
import { burst, center, motionLevel } from "@/lib/motion";
import { GOAL_ALREADY_CLOSED } from "@/lib/goals";
import type { CapturedItem } from "@/app/actions/capture";
import {
  abortTask,
  againTask,
  archiveTask,
  clarifyInbox,
  closeGoal,
  completeTask,
  deferTask,
  goalProgress,
  previewGoalClose,
  rescheduleGoal,
  renameTask,
  rescheduleTask,
  resizeTask,
  setBandOverride,
  setDailyCapacity,
  skipTask,
  discardTaskTimer,
  startTaskTimer,
  stopTaskTimer,
  tickStep,
  unarchiveTask,
  undoCompletion,
  undoDecision,
} from "@/app/actions/tasks";
import { timerConfirmOf, timerMinutesOf } from "@/lib/proof";
import { CAPTURED_EVENT, openCapture } from "@/components/capture/events";
import { presentAll } from "@/components/celebrate/stage";
import { Button } from "@/components/ui/Button";
import { Icon, Sigil } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { dismissToast, pushToast } from "@/components/ui/toast-store";
import { cx } from "@/components/ui/cx";
import { TaskRow } from "./TaskRow";
import { TaskDrawer, type DrawerDecision, type DrawerRule, type DrawerWork } from "./TaskDrawer";
import { DecisionSheet, type DecisionSubmit, type DecisionTarget } from "./DecisionSheet";
import {
  canUndoDecision,
  decisionOpOf,
  decisionToastOf,
  deferNudgeOf,
  deferShapeOf,
  deferredLineOf,
  mustCountOf,
  nextDecisionTick,
  type DecisionOutcome,
  type DeferredItem,
} from "@/lib/task-decisions";
import { GOALS_HEADING_ID, GOAL_CLOSE_CHIP, GoalsStrip } from "./GoalsStrip";
import { GoalCloseSheet, GoalRescheduleSheet, type GoalClosePreview, type GoalCloseRoadmap } from "./GoalSheets";
import { onSeekTemplate } from "@/components/roadmap/roadmap-events";
import { InboxSheet } from "./InboxSheet";
import { CapacityPanel } from "./CapacityTile";
import { ReceiptSheet } from "./ReceiptSheet";
import { UndoToast, focusUndoOnce } from "./UndoToast";
import { PlanCard } from "./PlanCard";
import { Lane } from "./Lane";
import { DailyStrip } from "./DailyStrip";
import { DAILY_QUESTS_TITLE, dailyQuestsOf, mustNoticeOf, restoredNoticeOf } from "@/lib/daily-quests";
import { DonePile } from "./DonePile";
import { BoardClearCard } from "./BoardClearCard";
import { AskBadge } from "./AskBadge";
import { CloseDaySheet } from "./CloseDaySheet";
import { fmtXp } from "./format";
import { holdLedger, useAfterFlight } from "./ledger-gate";
import {
  HELD_GLYPH,
  LANE_OF_MOMENT,
  RECORD_YESTERDAY_EVENT,
  REMOVE_UNDO_MS,
  SHEET_PARAM,
  YESTERDAY_SHEET,
  askHostOf,
  boardClearKey,
  boardClearOf,
  boardClearViewOf,
  boardDayEnded,
  cancellableOf,
  capacityChosen,
  closeDayProminent,
  closeItemsOf,
  dayMomentsOf,
  deferredNoticeOf,
  donePileOf,
  donePileShown,
  firstTomorrowOf,
  goalAfterClose,
  goalClosedNotice,
  goalRescheduledNotice,
  laneRowsOf,
  laneTally,
  madeUpLineOf,
  makeUpOptsOf,
  makeUpViewOf,
  mergeSkew,
  missPromptCopyOf,
  missPromptKey,
  missPromptOf,
  momentText,
  mustLaneOf,
  nextBoardTick,
  o1CardOf,
  owedSummaryOf,
  owedTotalOf,
  primaryMomentOf,
  receiptIdOf,
  recordByLabel,
  restOptionsOf,
  restSwitchOf,
  rollAllKeysOf,
  rowMinutes,
  ruleChangeOf,
  settledKey,
  splitTodayLane,
  tickMotionOf,
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
  type LaneChip,
  type RowMotion,
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
import { openChest, setFlameSkin, swapQuest } from "@/app/actions/momentum";
import { MomentumCard, momentumMarkOf, paidDiffersFromShown, type MomentumCardActions } from "./MomentumCard";
import { MakeUpCard, OwedRow, OwedSummary, type MakeUpReport } from "./m2/MakeUpCard";
import { RestBannerCard, YesterdaySettled, type SettledChip as NoticeChip } from "./m2/Notices";
import { CancelList, FreezeOption, RestControls, SettleFooter, VacationForm } from "./m2/Sheets";
import { MissPrompt } from "./MissPrompt";
import { namedOfTitle, type TodayNamedTitles } from "./NamedTitle";
import { Chip } from "@/components/ui/Chip";
import { HeldGlyph } from "@/components/ui/Icon";
import { captureExampleOf } from "@/components/capture/capture-ui";

interface Props {
  data: BoardData;
  streak: DailyStreak;
  /** When the server rendered this board (ISO): the clock for the undo window until the next tap. */
  nowIso: string;
  /** The notification feed's notices (Asks read the same feed as the bell; Today shows the Tasks section's only). */
  notices: AskNotice[];
  /** The clock line under the board (LiveClock, the zone, the rules link). */
  /** The live clock line under the board: plain strings, so no server-made JSX crosses into this client tree. */
  footClock?: { time: string; zone: string; tz: string };
  /**
   * Whether life counts yet (the page's isLaunched(today)). Before, goals
   * show progress only: no stated MP and no Close.
   */
  launched?: boolean;
  /**
   * The three sections: Today is the Tasks section. What is due in the other two (Ideas: reviews, this week's
   * roadmap quests, ready encounters; Body: a weigh-in) is the page's one slim strip (<DueElsewhere/> over
   * due-elsewhere.ts), drawn first in the side column. Only drawn: it adds no Ask, no count and no row to the
   * board; buildBoard and todayCountsOf never see it. Absent or null: no strip.
   */
  elsewhere?: ReactNode;
  /**
   * The Main quest card (blueprint P15, D11; the page's <MainQuestCard/> over main-quest-card.ts), drawn in the side
   * column above the goals (its key results). Only drawn, like the strip: it adds no Ask, no count and no row to the
   * board; buildBoard and todayCountsOf never see it. A work tab never shows it. Absent or null: no card.
   */
  mainQuest?: ReactNode;
  /**
   * Blueprint P32 (D36): the week's calibration card on Mondays (the page's <NextWeekCard/>, "This week"), drawn in the
   * side column above the Main quest. Only drawn: it adds no Ask, no count and no row to the board; buildBoard and
   * todayCountsOf never see it. A work tab never shows it. Absent or null: no card (always, while the audit is off).
   */
  nextWeek?: ReactNode;
  /**
   * The live fix (contracts §22.11, ruling 67): a plan-born template's Gemini-named Domain names, by template id
   * (roadmap-quests-server loadTodayNamedTitles), and the mark the page renders (<NamedMark/>, passed as a node like
   * the strip). Its title shows each such name with pv.named (NamedTitle over namedPartsOf of the title as it
   * stands). Absent: every title plain, as before.
   */
  namedTitles?: TodayNamedTitles | null;
  /**
   * A work tab (work-boards.ts; /today/work/<id>/tasks, the Office workspace's Tasks page, 2026-10-20): the same board
   * over that tab's own tasks, kept out of the game, in the workspace's skin (data-skin="work"): no colour code and no
   * diamond marks, no XP or band figures, no streaks, no moments, no Board clear card, no flourish and no pluck (the
   * kit's calm check, and its words to the live region). Its name and menu are the work frame's header. There is no
   * life XP, no capacity, no Record yesterday card, no goals, no Close the day and no price on any row. Absent: the
   * personal Board, exactly as before.
   */
  work?: WorkBoardView | null;
  /**
   * Momentum (momentum.md §E.1; the page's loadMomentum after settleMomentum): the Momentum card at the top of the
   * side column. `{live: false}` (before MOMENTUM_LAUNCH_DAY), absent or null: no card, and the board is exactly as
   * before. A work tab never shows it.
   */
  momentum?: MomentumView | null;
  /** The render's settleMomentum wrote rows: the card asks the celebration host to pull their moments now. */
  momentumSettled?: boolean;
  /**
   * Credits (blueprint P16; credits.ts creditTagsOn, from the model in force today): the Momentum card's Quest sheet
   * price tags. Absent or null (CREDITS_LAUNCH_DAY not in force): no tag, and the card is exactly as before.
   */
  credits?: CreditTags | null;
}

/** The Momentum card's writes (actions/momentum), passed down so the card imports no server code. */
const MOMENTUM_ACTIONS: MomentumCardActions = { openChest, swapQuest, setFlameSkin };

/** Momentum's tick T1s the board plays from the server's answer (celebration-detect detectMomentum), loudest first. */
const MOMENTUM_TICK_T1: readonly MomentumT1Kind[] = ["momentum-kept", "quest-done", "freeze-held"];

/** Each template's open-row price ("≈ N XP") on the board: the Quest sheet's why names the task quest's own. */
function openPricesOf(rows: readonly BoardRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r.state === "open" && !(r.template.id in out)) out[r.template.id] = r.projection.xp;
  return out;
}

/** The work tab a board is (TodayBoard's `work`). */
export interface WorkBoardView {
  id: string;
  name: string;
  /** The tab keeps a customer list (WorkBoard.crmOn); the work frame's sub-navigation links it. */
  crmOn?: boolean;
  /** The tab keeps an order list (WorkBoard.ordersOn); the work frame's sub-navigation links it. */
  ordersOn?: boolean;
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
/**
 * The moments only a tick makes (a lane kept, the board clear): a defer, a skip or a move that empties a lane is not
 * a deed, so these need a tick in the window, not just a tap. A work tab plays none of them (the work skin).
 */
const TICK_MOMENTS: ReadonlySet<DayMoment> = new Set<DayMoment>(["lane-kept", "planned-kept", "habits-kept", "board-clear"]);
/** How long a row that just landed in Done today (or came back to its lane) keeps its arrival mark: longer than either. */
const ARRIVAL_MS = 400;

/** The OS asks for less motion: an explicit Full pref still plays Calm's tick (board-ui tickMotionOf). */
const reducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Where focus goes once a row has left its place (a tick sent it to Done today, an Undo brought it back): the row a
 * key names (its tick, or its title while the tick waits), else the lane's heading, else Anytime's toggle. Only when
 * focus was on the row that moved: nothing else is ever pulled.
 */
interface Refocus {
  rowKey: string | null;
  lane: string | null;
  anytime: boolean;
}

/** How long the board looks for a capture's row (the refreshed props may land after the toast). */
const SEEK_MS = 5000;
/** How long a found capture stays outlined (and says 'just added'). */
const JUST_ADDED_MS = 1600;
/** Places that live inside the collapsed Anytime card: a capture there opens it. */
const ANYTIME_PLACES: ReadonlySet<PlaceLane> = new Set<PlaceLane>(["anytime", "later", "upcoming"]);
/** The flash link a capture toast's 'View' writes: /today#t-<templateId>. */
const FLASH_HASH = /^#t-([A-Za-z0-9_-]{1,64})$/;

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

/** A tick's pages proof (blueprint P24): { proof: { kind: 'PAGES', qty } } with pages picked, else nothing (the server's gate decides). */
function pagesProofOf(pages: number | null | undefined): { proof?: { kind: "PAGES"; qty: number } } {
  return pages != null && pages >= 1 ? { proof: { kind: "PAGES", qty: pages } } : {};
}

/** A timer start's key (P23): a UUID from the browser's own crypto, so a retried start starts it once. */
function newTimerClientId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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
 * The three sections (Ideas, Tasks, Body): Today is the Tasks section and
 * shows only the tasks due today, the Must, Planned and Habits lanes, the
 * Inbox and Anytime, the day's capacity (the plan card) and the task goals.
 * The review quest, the roadmap's week quests and aim line, the encounters
 * and the Ideas Asks live on the Ideas landing (/review); the streak and the
 * Full day on Character (/you); weight and walks on Body (/train). What is
 * due there is the page's one slim strip (`elsewhere`), drawn first.
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
 * (the check draws, the "+N" token flies to the plan card's life-XP cell,
 * the figure counts up); the first deed of the day, a closed ring, a kept
 * Must lane and a Full day are Tier 1, once, after a tap, never on arrival
 * (the kept lane in place; the others, whose tiles are Character's, as a
 * toast with its ring). Every number is the real one.
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
/**
 * One chip under the Daily quests header (board-ui LaneChip). Blueprint P29: the streak multiplier's chip is a 44 px link
 * to the rules page's Streak card, its full words (streakDescribe) its accessible name and title; every other chip is
 * the plain Chip it always was.
 */
function LaneChipView({ chip }: { chip: LaneChip }) {
  const body = (
    <Chip tone={chip.tone} held={chip.held} icon={chip.icon}>
      {chip.text}
    </Chip>
  );
  if (!chip.href) return body;
  return (
    <Link href={chip.href} className="lane-chip-link" aria-label={chip.label} title={chip.label}>
      {body}
    </Link>
  );
}

export function TodayBoard({ data, streak, nowIso, notices, footClock, launched = false, namedTitles, work: workTab = null, momentum = null, momentumSettled = false, credits = null, elsewhere = null, mainQuest = null, nextWeek = null }: Props) {
  /** A work tab: nothing of the game (no XP, no moments, no goals, no plan card). */
  const isWork = workTab !== null;
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
  /** Pages picked in the open drawer (blueprint P24: a reading task's), the same way: closing it forgets them. */
  const [drawerPages, setDrawerPages] = useState<number | null>(null);
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
  /** Defer… and Abort… (task-decisions.ts): the sheet, the task it is open on, and its write in flight. */
  const [decide, setDecide] = useState<{ mode: "defer" | "abort"; templateId: string; target: DecisionTarget; nowMs: number; open: boolean; nonce: number } | null>(null);
  const [decideBusy, setDecideBusy] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
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
  /** The visual beat of a Tier 1 moment on the board (a lane's KEPT stamp landing), cleared once it has played. */
  const [beat, setBeat] = useState<{ lanes: readonly string[] } | null>(null);
  /** Rows just ticked, on their way out of their lane into Done today (board-ui TICK_MOTION): held, then folding. */
  const [exits, setExits] = useState<Record<string, "hold" | "out">>({});
  /** A row that just landed in Done today, or that an Undo just put back in its lane: its arrival plays once. */
  const [arrivals, setArrivals] = useState<Record<string, "arrive" | "enter">>({});
  /** Where focus goes once the row it was on has moved (after the commit that moved it). */
  const [refocus, setRefocus] = useState<Refocus | null>(null);
  /** Proof of work (P23, P24): a tick that opened its drawer at the chips moves focus to the first chip (this row's key). */
  const [chipFocus, setChipFocus] = useState<string | null>(null);
  /** Done today shows all its rows (folded: the latest DONE_PILE_FOLDED). */
  const [doneOpen, setDoneOpen] = useState(false);
  /** The Board clear card was just played by a tap: it eases in this once (never on arrival). */
  const [clearFresh, setClearFresh] = useState(false);
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
  /** When a tick last landed (markTick): a lane kept and the board clear follow a tick, never a defer or a skip. */
  const tickedAt = useRef(0);
  /** The timers of rows on their way (TICK_MOTION); none outlives the board. */
  const motionTimers = useRef(new Set<number>());
  useEffect(() => {
    const timers = motionTimers.current;
    return () => {
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
    };
  }, []);
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      motionTimers.current.delete(t);
      fn();
    }, ms);
    motionTimers.current.add(t);
  };

  // The element a Tier 1 moment lights on the board (the streak and the Full day live on Character now).
  const mustBodyRef = useRef<HTMLDivElement | null>(null);

  const ops = useMemo(() => pending.map((p) => p.op), [pending]);
  const current = useMemo(() => applyOps(data, ops), [data, ops]);
  // On the board's clock: a deferred task comes back the moment its time passes (task-decisions.ts).
  const board = useMemo(() => buildBoard(current, [], clock), [current, clock]);
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
    dispatch(null, () => unarchiveTask(r.templateId, REFRESH), (v) => {
      setPending((prev) => prev.filter((p) => p.op.id !== r.opId));
      // Daily quests (D14): a must brought back near or past the cap stays a must, and says how many that day holds.
      setNotice(restoredNoticeOf(r.title, v.mustNote));
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
  const questPrices = useMemo(() => openPricesOf(lanes), [lanes]);
  // A hidden task's return and a decision's Undo closing move the board's clock too (task-decisions.ts).
  const decisionTimes = useMemo(
    () => [...board.deferred, ...Object.values(current.decisions ?? {}).flatMap((f) => (f.last ? [{ until: "", decidedAt: f.last.at }] : []))],
    [board.deferred, current.decisions]
  );
  const nextTick = useMemo(() => {
    const rows = nextBoardTick({ rows: lanes, today: data.today, clockMs: clock });
    const decided = nextDecisionTick(decisionTimes, clock);
    return rows == null ? decided : decided == null ? rows : Math.min(rows, decided);
  }, [lanes, data.today, clock, decisionTimes]);
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
    tickedAt.current = actedAt.current;
    // The work skin: a calm check. No mark (no pluck, no haptic, no flight): its words go to the live region only.
    if (isWork) {
      announce(`Done: ${row.template.title}`);
      return;
    }
    const paid = xp;
    const flight = mark({
      kind: "tick",
      id: `tick:${row.key}:${row.slot}`,
      text: `Kept ${row.template.title} · paid ${fmtXp(xp)} exactly`,
      amount: paid > 0 ? { kind: "xp", value: paid } : undefined,
      from: from ?? null,
    });
    if (paid > 0) holdLedger("xp", flight);
  }

  /** The row element a key names on the board (a lane's or Anytime's; Done today's when `pile`). */
  function rowElOf(rowKey: string, pile = false): HTMLElement | undefined {
    const rows = boardRef.current ? Array.from(boardRef.current.querySelectorAll<HTMLElement>(".t-row")) : [];
    return rows.find((r) => r.dataset.rowKey === rowKey && !!r.closest(".today-done") === pile);
  }

  /** Where focus goes once this row has left its place, if focus is on it now (Refocus): the next row still there, else its lane's heading. */
  function refocusAfter(rowKey: string): Refocus | null {
    const el = rowElOf(rowKey);
    const active = document.activeElement;
    if (!el || !(active instanceof Node) || !el.contains(active)) return null;
    let next = el.nextElementSibling;
    while (next && !(next instanceof HTMLElement && next.classList.contains("t-row") && next.dataset.state !== "done" && !next.dataset.motion)) next = next.nextElementSibling;
    return {
      rowKey: next instanceof HTMLElement ? (next.dataset.rowKey ?? null) : null,
      lane: el.closest<HTMLElement>(".today-lane")?.dataset.lane ?? null,
      anytime: !!el.closest("#anytime-rows"),
    };
  }

  /**
   * A ticked row's way into Done today (board-ui TICK_MOTION, ui-motion D10 as revised): it holds in its lane while
   * its ring fills, the check draws, one ripple rings and the strike sweeps; then it folds out and lands in Done today.
   * Still: there at once. Focus, if it was on the row, moves to the next row's tick, else the lane's heading.
   */
  function leaveLane(row: BoardRow) {
    const key = row.key;
    const focus = refocusAfter(key);
    const m = tickMotionOf(motionLevel(), reducedMotion());
    if (m.hold + m.out <= 0) {
      if (focus) setRefocus(focus);
      return;
    }
    setExits((e) => ({ ...e, [key]: "hold" }));
    later(() => setExits((e) => (e[key] === "hold" ? { ...e, [key]: "out" } : e)), m.hold);
    later(() => {
      setExits((e) => (key in e ? without(e, key) : e));
      setArrivals((a) => ({ ...a, [key]: "arrive" }));
      later(() => setArrivals((a) => (a[key] === "arrive" ? without(a, key) : a)), ARRIVAL_MS);
      if (focus) setRefocus(focus);
    }, m.hold + m.out);
  }

  // A tick that opened its drawer at the chips (a proof or reading row): focus lands on the first chip, once painted.
  useEffect(() => {
    if (!chipFocus) return;
    const raf = window.requestAnimationFrame(() => {
      rowElOf(chipFocus)?.querySelector<HTMLButtonElement>("[data-chips] button:not(:disabled)")?.focus();
      setChipFocus(null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [chipFocus]);

  // Focus follows a row that moved, once the commit that moved it has painted.
  useEffect(() => {
    if (!refocus) return;
    const raf = window.requestAnimationFrame(() => {
      const row = refocus.rowKey ? rowElOf(refocus.rowKey) : undefined;
      const tick = row?.querySelector<HTMLButtonElement>("button.tick");
      const target =
        (tick && !tick.disabled ? tick : row?.querySelector<HTMLElement>(".r-open")) ??
        (refocus.lane ? document.getElementById(`lane-${refocus.lane}`) : null) ??
        (refocus.anytime ? boardRef.current?.querySelector<HTMLElement>('[aria-controls="anytime-rows"]') : null);
      target?.focus();
      setRefocus(null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [refocus]);

  /**
   * Momentum's Tier 0 once the server has paid (momentum.md §A.4, §E.3): a crit's gold "Crit ×2 · +24" (receiptCritOf
   * on the paid receipt; never projected), or a chain link's "Chain 3", in place on the row. A work tab pays nothing.
   */
  function markMomentum(row: BoardRow, receipt: Receipt | null | undefined) {
    if (isWork) return;
    const m = momentumMarkOf(receipt);
    if (!m) return;
    const from = boardRef.current?.querySelector(`[data-template-id="${row.template.id}"]`) ?? null;
    void mark({ kind: m.kind, id: `${m.kind}:${row.key}:${row.slot}`, text: m.text, from });
  }

  /**
   * Momentum's Tier 1 from the server's answer to a tap (momentum.md §G.1; ids 't1:<key>'): the run kept today
   * (it replaces the board's own day-kept chime, which the moments effect holds back while the run is still open),
   * a quest of Today's three done, a freeze that held. One chime per tap, the loudest; the others ride in its sentence.
   * The T2/T3s of the same answer are presentAll's.
   */
  function playMomentumT1(evs: readonly CelebrationEvent[] | null | undefined) {
    if (isWork) return;
    const ones = (evs ?? [])
      .filter((e) => e.tier === 1 && (MOMENTUM_TICK_T1 as readonly string[]).includes(e.kind))
      .sort((a, b) => MOMENTUM_TICK_T1.indexOf(a.kind as MomentumT1Kind) - MOMENTUM_TICK_T1.indexOf(b.kind as MomentumT1Kind));
    const lead = ones[0];
    if (!lead) return;
    const words = (e: CelebrationEvent) => [e.facts.eyebrow, e.facts.title].filter(Boolean).join(" · ");
    const said = (e: CelebrationEvent) => e.facts.say ?? [e.facts.eyebrow, e.facts.title, ...(e.facts.lines ?? [])].filter(Boolean).join(". ");
    chime({
      kind: lead.kind as MomentumT1Kind,
      id: lead.id,
      text: words(lead),
      say: ones.map(said).join(" "),
      sweepEl: document.getElementById("momentum"),
      ringEl: null,
    });
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
        playMomentumT1(v.celebrations);
        if (v.delta > 0) {
          markTick(row, v.delta, from);
          markMomentum(row, v.receipt);
        }
        else if (v.delta < 0) announce(`${fmtXp(-v.delta)} life XP taken back with that step.`);
      }
    );
  }
  /**
   * Rows whose tick goes through their steps: today's, with steps, not already paid by a whole tick. A proof row (P23)
   * never does: it is paid by its whole tick with its minutes. Nor does a reading task (P24): its whole tick, its pages.
   */
  const viaSteps = (row: BoardRow) => !!row.steps && !row.steps.checklist && row.state === "open" && !row.proof && !row.pages;

  /**
   * Proof of work (blueprint P23): a proof row's tick takes the drawer's minutes, else its timer's; with neither it opens
   * the drawer at its minute chips (the server would refuse it: "Log the minutes"). A timer that ran across 04:00 or
   * past twice the estimate opens the drawer too, saying so: its Done there (`confirmed`) is the one that counts it.
   * Every other row ticks as before.
   * Pages proof (P24): a reading task's tick takes the drawer's pages; with a day's target and fewer picked, it opens the
   * drawer at its page chips with the target picked, one tap from "Done · 30 pages" (the server would refuse it).
   * Either way the drawer's first chip takes focus and the reason is announced (the tick itself checks nothing).
   */
  function tickRow(row: BoardRow, minutes: number | null, from?: Element | null, confirmed = false) {
    const timer = row.proof?.timer ?? null;
    const pages = openKey === row.key ? drawerPages : null;
    const toChips = (line: string) => {
      if (openKey !== row.key) setDrawerMinutes(null);
      setOpenKey(row.key);
      setChipFocus(row.key);
      announce(`${row.template.title}: ${line}`);
    };
    if (row.pages?.target != null && (pages == null || pages < row.pages.target)) {
      toChips(`pick the pages you read, at least ${row.pages.target}.`);
      setDrawerPages(row.pages.target);
      return;
    }
    if (row.proof && minutes == null) {
      const now = serverNow();
      const timed = timer ? timerMinutesOf(timer, now) : 0;
      const ask = timer && timed >= 1 && !confirmed ? timerConfirmOf(timer, row.day, row.estMinutes, now) : null;
      if (timer && timed >= 1 && !ask) return complete(row, { sessionId: timer.sessionId, timed, pages }, from);
      toChips(ask ?? "pick the minutes it took, or start its timer.");
      return;
    }
    complete(row, { minutes, pages }, from);
  }

  /** Proof of work (P23): starts a proof row's timer (a start stops any other running one); its tick then counts it. */
  function startTimer(row: BoardRow) {
    if (staleDay()) return;
    const clientId = newTimerClientId();
    work(row.template.id, { kind: "timer" }, () => startTaskTimer(row.template.id, clientId, REFRESH), () =>
      setNotice(`Timer started: ${row.template.title}. Tick it when you stop; the time it ran counts.`)
    );
  }

  /** Stops a proof row's timer; its minutes wait for the tick (Resume adds more after a break). */
  function stopTimer(row: BoardRow) {
    const timer = row.proof?.timer;
    if (!timer) return;
    work(row.template.id, { kind: "timer" }, () => stopTaskTimer(timer.sessionId, REFRESH), (v) =>
      setNotice(`Timer stopped: ${row.template.title}, ${timerMinutesOf(v, Date.parse(v.endedAt ?? v.startedAt))} min. Tick it to count them, or Resume.`)
    );
  }

  /** Discards a proof row's stopped timer (a mis-tap, or a timer that didn't time the work): it counts nothing. */
  function discardTimer(row: BoardRow) {
    const timer = row.proof?.timer;
    if (!timer) return;
    work(row.template.id, { kind: "timer" }, () => discardTaskTimer(timer.sessionId, REFRESH), () =>
      setNotice(`Timer discarded: ${row.template.title}. It counts nothing; pick the minutes, or start it again.`)
    );
  }

  /**
   * A forgotten tick: today's row ticked for yesterday (completeTask with day 'yesterday', the server's
   * yesterdayBookable gate). It pays against yesterday's ledger and counts on yesterday, as if ticked then.
   */
  function recordYesterday(row: BoardRow, minutes: number | null = null, pages: number | null = null) {
    if (staleDay()) return;
    dispatch(
      null,
      // A proof row (P23) records yesterday with the drawer's minutes, a reading task (P24) with its pages; any other row
      // as before.
      () =>
        completeTask(
          row.template.id,
          { ...(row.proof && minutes != null ? { day: "yesterday", minutes } : { day: "yesterday" }), ...(row.pages ? pagesProofOf(pages) : {}) },
          REFRESH
        ),
      (v) => {
        presentAll(v.celebrations);
        playMomentumT1(v.celebrations);
        if (!v.duplicate) markMomentum(row, v.receipt);
        setNotice(
          isWork
            ? `Recorded for yesterday: ${row.template.title}.`
            : `Recorded for yesterday: ${row.template.title} · paid ${fmtXp(v.receipt.xp)}. Undo it from Record yesterday.`
        );
      }
    );
  }

  function complete(row: BoardRow, opts: { minutes?: number | null; mvv?: boolean; sessionId?: string; timed?: number; pages?: number | null } = {}, from?: Element | null) {
    if (staleDay()) return;
    const id = nextOpId();
    // Proof of work (P23): a tick that counts a timer prices at the timer's minutes, bounded by them as the server
    // bounds it (the server's are the authority).
    const timerCount = opts.minutes == null && !!opts.sessionId && opts.timed != null;
    const shownMinutes = opts.minutes ?? (timerCount ? (opts.timed ?? null) : null);
    // What the row said this tick would pay. The server's price is the
    // authority; if the day moved under the board (a size landed, another
    // device ticked), the difference is said out loud rather than hidden.
    const shown = opts.mvv
      ? projectRow(current, row, { mvv: true })
      : shownMinutes != null
        ? projectRow(current, row, { minutes: shownMinutes, ...(timerCount ? { wall: shownMinutes } : {}) })
        : row.projection;
    const op: BoardOp = {
      id,
      kind: "complete",
      templateId: row.template.id,
      day: row.day,
      slot: row.slot,
      minutes: shownMinutes,
      mvv: opts.mvv,
      at: new Date().toISOString(),
    };
    setOpenKey(null);
    setDrawerMinutes(null);
    setDrawerPages(null);
    markTick(row, shown.xp, from);
    // Off to Done today (yesterday's rows stay in Record yesterday).
    if (row.lane !== "yesterday") leaveLane(row);
    dispatch(
      op,
      // The row's own day: the server books only today or yesterday by its
      // own clock, so a board left open across 04:00 is refused, not misbooked.
      // A reading task's pages (P24) ride along as its proof; every other tick is as before.
      () => completeTask(row.template.id, { day: row.day, minutes: opts.minutes ?? null, mvv: opts.mvv, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}), ...(opts.mvv ? {} : pagesProofOf(opts.pages)) }, REFRESH),
      (v) => {
        // The server's moments for this tick (a streak milestone, a habit
        // rung, a finished goal): Seals and Ascensions only, since
        // presentAll skips T1 and the board chimes its own.
        presentAll(v.celebrations);
        playMomentumT1(v.celebrations);
        if (v.duplicate) setNotice(isWork ? `${row.template.title} was already done.` : `${row.template.title} was already recorded. Nothing is paid twice.`);
        else if (!isWork && Math.abs(v.receipt.xp - shown.xp) > 0.05) {
          // A crit (X) and the chain (M, which depends on when the tap lands) are luck: the difference they explain is not
          // a notice (momentum.md §A.4, §A.5).
          if (paidDiffersFromShown(v.receipt, shown)) {
            setNotice(`${row.template.title} paid ${fmtXp(v.receipt.xp)} XP, not ≈ ${fmtXp(shown.xp)}: its size or today's total changed since the board loaded.`);
          }
        }
        if (!v.duplicate) markMomentum(row, v.receipt);
        return { instanceId: v.instanceId, receipt: v.receipt };
      }
    );
  }

  function again(row: BoardRow, minutes: number | null, pages: number | null = null) {
    if (staleDay()) return;
    // Proof of work (P23): a proof habit's Again takes the drawer's minutes, else its timer's.
    const timer = minutes == null && row.proof?.timer ? row.proof.timer : null;
    if (timer) minutes = Math.max(1, timerMinutesOf(timer, serverNow()));
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
    setDrawerPages(null);
    markTick(row, projectRow(current, row, { minutes, ...(timer ? { wall: minutes } : {}) }).xp, null);
    // A reading task's Again (P24) brings its pages, as its first tick did.
    dispatch(op, () => againTask(row.template.id, { ...(timer ? { sessionId: timer.sessionId } : { minutes }), ...(row.pages ? pagesProofOf(pages) : {}) }, REFRESH), (v) => {
      presentAll(v.celebrations);
      playMomentumT1(v.celebrations);
      if (!v.duplicate) markMomentum(row, v.receipt);
      return { instanceId: v.instanceId, receipt: v.receipt, slot: v.slot };
    });
  }

  function undo(row: BoardRow) {
    const instanceId = row.instanceId;
    if (!instanceId || instanceId.startsWith("opt:")) return;
    const xp = row.paid?.xp ?? 0;
    // Back from Done today to its lane, the reverse of its way out (it unfolds there); focus follows it if it was on it.
    if (row.lane !== "yesterday") {
      const key = row.key;
      const focused = rowElOf(key, true)?.contains(document.activeElement) ?? false;
      if (tickMotionOf(motionLevel(), reducedMotion()).out > 0) {
        setArrivals((a) => ({ ...a, [key]: "enter" }));
        later(() => setArrivals((a) => (a[key] === "enter" ? without(a, key) : a)), ARRIVAL_MS);
      }
      if (focused) setRefocus({ rowKey: key, lane: null, anytime: false });
    }
    dispatch({ id: nextOpId(), kind: "undo", instanceId }, () => undoCompletion(instanceId, REFRESH));
    announce(isWork ? `Undone. ${row.template.title} is open again.` : `Undone. ${fmtXp(xp)} life XP taken back; nothing else changed.`);
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

  // ── Defer and abort (task-decisions.ts) ────────────────────────────────

  /** Opens Defer… or Abort… on a row: what the sheet says depends on its kind (a must, a habit, a deadline, a one-off). */
  function openDecision(row: BoardRow, mode: "defer" | "abort") {
    const t = row.template;
    const facts = current.decisions?.[t.id];
    // A must's archive waits seven days once Duty is live: the sheet says when, before the tap (the server decides again).
    const ends = t.compulsory ? ruleChangeOf(t, { archived: true }, ruleCtx()).effectiveDay : null;
    setDecideError(null);
    setDecide((c) => ({
      mode,
      templateId: t.id,
      nowMs: serverNow(),
      open: true,
      nonce: (c?.nonce ?? 0) + 1,
      target: {
        title: t.title,
        shape: deferShapeOf(t),
        recurring: !!ruleOf(t),
        must: t.compulsory && !isWork,
        work: isWork,
        dueLabel: t.dueKind === "DEADLINE" ? row.dueLabel : null,
        defers: facts?.defers ?? 0,
        endsOn: ends ? dayLabel(ends) : null,
      },
    }));
  }

  /** Sends the sheet's decision; on its answer the sheet closes, the board holds the change and the Undo goes to the dock. */
  function submitDecision(v: DecisionSubmit) {
    const target = decide;
    if (!target || !target.open || decideBusy) return;
    if (staleDay()) return;
    setDecideBusy(true);
    setDecideError(null);
    startTransition(async () => {
      let res: Result<DecisionOutcome>;
      try {
        res =
          target.mode === "defer"
            ? await deferTask(target.templateId, { reason: v.reason, reasonTag: v.reasonTag, until: v.until }, REFRESH)
            : await abortTask(target.templateId, { reason: v.reason, reasonTag: v.reasonTag, scope: v.scope }, REFRESH);
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
      } finally {
        setDecideBusy(false);
      }
      if (!res.ok) {
        const error = res.error;
        setDecideError(error);
        return;
      }
      const out = res.value;
      actedAt.current = tapTime();
      setDecide((c) => (c ? { ...c, open: false } : c));
      setOpenKey(null);
      setDrawerMinutes(null);
      // Held until the refreshed props show it (a settled op goes with the next props).
      const hold = decisionOpOf(out, current.today);
      if (hold) setPending((prev) => [...prev, { op: { id: nextOpId(), ...hold } as BoardOp, settled: true, base: dataRef.current }]);
      // A must's series waits out its seven days: the row stays, and says when it leaves.
      if (out.archive?.effect === "deferred" && out.archive.effectiveDay) setNotice(deferredNoticeOf(out.title, "archive", out.archive.effectiveDay));
      const toast = decisionToastOf(out, serverNow());
      pushToast({ key: `decision:${out.decisionId}`, title: toast.title, body: toast.body, action: { label: "Undo", onAction: () => undoDecisionNow(out.decisionId, out.templateId, out.title) }, holdMs: REMOVE_UNDO_MS });
      announce(`${toast.title}. ${toast.body}`);
    });
  }

  /** Takes a defer or an abort back (ten minutes, the same day): exactly what it changed comes back. */
  function undoDecisionNow(decisionId: string, templateId: string, title: string) {
    dispatch(null, () => undoDecision(decisionId, REFRESH), (v) => {
      setPending((prev) => prev.filter((p) => !(p.op.kind === "defer" || p.op.kind === "hide" || p.op.kind === "skip") || p.op.templateId !== templateId));
      setNotice(restoredNoticeOf(title, v.mustNote));
    });
  }

  /** The drawer's decision lines: the third defer's nudge, and an abort just this time still undoable. */
  function drawerDecisionOf(row: BoardRow): DrawerDecision | null {
    const facts = current.decisions?.[row.template.id];
    if (!facts) return null;
    const last = facts.last;
    const recent =
      last && last.kind === "ABORT" && last.scope === "ONCE" && last.day === current.today && row.state === "skipped" && canUndoDecision(last.at, clock)
        ? { line: `Aborted just this time · ${last.reason}`, onUndo: () => undoDecisionNow(last.id, row.template.id, row.template.title) }
        : null;
    const nudge = deferNudgeOf(facts.defers);
    return nudge || recent ? { nudge, recent } : null;
  }

  /** A hidden task where the board still names it: the Must lane's quiet item, or a line of Anytime's Deferred list. */
  const decisionUndoOf = (item: DeferredItem) =>
    item.decisionId && item.decidedAt && canUndoDecision(item.decidedAt, clock) ? () => undoDecisionNow(item.decisionId!, item.templateId, item.title) : null;

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
        // Daily quests (D14): a must that left the inbox past the cap is an ordinary task now, and says so.
        if (v.mustNote) {
          const title = current.templates.find((t) => t.id === templateId)?.title ?? "That must";
          setNotice(mustNoticeOf(title, v.mustNote));
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

  // ── The day's Tier 1 moments ───────────────────────────────────────────
  //
  // The streak and the Full day are drawn on Character (/you) now; Today
  // still knows them, because a tick here is what keeps the day, closes a
  // ring or makes a Full day, and the moment follows the tap that made it.
  // A day with any live completion is an active day, before the round trip.
  const todayActive = streak.last7Days[streak.last7Days.length - 1] ?? false;
  const keptToday = todayActive || board.activeToday;
  const streakNow = streak.current + (!todayActive && board.activeToday ? 1 : 0);
  // Today's musts hidden by a defer or an abort count, and are not kept (task-decisions.ts mustCountOf).
  const mustTally = mustCountOf(laneTally(board.must), board.deferred);
  const mustLaneKept = mustTally.total > 0 && mustTally.kept === mustTally.total;
  // The Planned and Habits lanes (Today's rows split by board-ui), each kept once every row asking is done, and the
  // Board clear once nothing in the three lanes is open and something there is done.
  const { planned, habits } = splitTodayLane(board.todayRows);
  const plannedTally = laneTally(planned);
  const habitTally = laneTally(habits);
  const plannedKept = plannedTally.total > 0 && plannedTally.kept === plannedTally.total;
  const habitsKept = habitTally.total > 0 && habitTally.kept === habitTally.total;
  const boardClear = boardClearOf({ clear: board.clear, done: [...board.must, ...board.todayRows].filter((r) => r.state === "done").length });
  // Done today: every done row of the lanes and Anytime (presentation only; every count above reads the lanes).
  const dayRows = [...board.must, ...board.todayRows, ...board.anytime];
  const doneToday = donePileOf(dayRows, { work: isWork });

  const snapshot: DaySnapshot = {
    kept: keptToday,
    rings: { musts: fullDay.rings[0].met, quest: fullDay.rings[1].met, life: fullDay.rings[2].met },
    full: fullDay.full,
    mustLane: mustLaneKept,
    planned: plannedKept,
    habits: habitsKept,
    clear: boardClear,
  };
  const dayKey = `${keptToday}|${streakNow}|${mustLaneKept}|${plannedKept}|${habitsKept}|${boardClear}|${fullDay.rings.map((r) => `${r.value}/${r.target}/${r.met}`).join(",")}`;
  // Held back while a tick's token is in the air: the moments play when it
  // lands, not before (ledger-gate.ts).
  const shown = useAfterFlight({ snapshot, streakNow, mustLaneKept }, dayKey);

  const prevSnapshot = useRef<DaySnapshot>(shown.snapshot);
  /** Today's momentum run has no action yet: the first tick's momentum-kept (the server's T1) is this tap's chime. */
  const momentumOpen = !isWork && !!momentum?.live && !momentum.run.todayKept;
  const shownKey = `${shown.snapshot.kept}|${shown.snapshot.rings.musts}|${shown.snapshot.rings.quest}|${shown.snapshot.rings.life}|${shown.snapshot.full}|${shown.snapshot.mustLane}|${!!shown.snapshot.planned}|${!!shown.snapshot.habits}|${!!shown.snapshot.clear}`;
  const workId = workTab?.id ?? null;
  const momentCtx = useRef({ streak: shown.streakNow, musts: mustTally.total, planned: plannedTally.total, habits: habitTally.total, done: doneToday.count, today: data.today, workId });
  useEffect(() => {
    momentCtx.current = { streak: shown.streakNow, musts: mustTally.total, planned: plannedTally.total, habits: habitTally.total, done: doneToday.count, today: data.today, workId };
  });
  /** A lane on the board, by its id: its header (where its stamp lands and its burst starts) and its card. */
  const laneEl = (lane: string, part: ".lane-h" | ".lane-body") => boardRef.current?.querySelector<HTMLElement>(`.today-lane[data-lane="${lane}"] ${part}`) ?? null;
  /** Where a lane's burst starts: its KEPT stamp as it lands, else its diamond, else its header. */
  const laneBurstEl = (lane: string) => {
    const h = laneEl(lane, ".lane-h");
    return h?.querySelector<HTMLElement>(".lane-stamp") ?? h?.querySelector<HTMLElement>(".lane-mark") ?? h;
  };
  function playMoments(all: DayMoment[]) {
    const ctx = momentCtx.current;
    // Each moment once per life day (and per work tab): an undo and a re-tick never play it twice.
    const idOf = (m: DayMoment) => `${ctx.workId ? `work:${ctx.workId}:` : ""}${m}:${ctx.today}`;
    const moments = all.filter((m) => !firedMoments.has(idOf(m)));
    for (const m of all) firedMoments.add(idOf(m));
    // One chime per tap, the loudest meaning first; the others ride along in its sentence, and each lane lands its stamp.
    const primary = primaryMomentOf(moments);
    if (!primary) return;
    const id = idOf(primary);

    const lanes = moments.flatMap((m) => LANE_OF_MOMENT[m] ?? []);
    const primaryLane = LANE_OF_MOMENT[primary] ?? null;
    if (lanes.length > 0) {
      setBeat({ lanes });
      window.setTimeout(() => setBeat(null), 1000);
    }
    // Every lane kept on this tap gets its small seeded burst at its header (the chime's own burst for the loudest one).
    for (const m of moments) {
      const lane = LANE_OF_MOMENT[m];
      const at = lane && lane !== primaryLane ? laneBurstEl(lane) : null;
      if (at) {
        const [x, y] = center(at);
        burst(x, y, 8, idOf(m), { color: "var(--light)", spread: 46 });
      }
    }
    // The Board clear card holds the day (until OK); the chime is this tap's.
    if (moments.includes("board-clear")) {
      const key = boardClearKey(ctx.today, ctx.workId);
      writeFlag(key, "shown");
      setFlags((f) => ({ ...(f ?? {}), [key]: "shown" }));
      setClearFresh(true);
      window.setTimeout(() => setClearFresh(false), 1000);
    }

    const say = moments
      .filter((m) => !(m === "ring-musts" && moments.includes("lane-kept")))
      .map((m) => momentText(m, ctx))
      .join(" ");
    const kind: T1Kind =
      primary === "full-day" ? "full-day" : primary === "board-clear" ? "board-clear" : primaryLane ? "lane-kept" : primary === "day-kept" ? "day-kept" : "ring-closed";
    const text =
      primary === "full-day"
        ? "Full day"
        : primary === "board-clear"
          ? "Board clear"
          : primary === "lane-kept"
            ? `Musts kept, ${ctx.musts} of ${ctx.musts}`
            : primary === "planned-kept"
              ? `Planned kept, ${ctx.planned} of ${ctx.planned}`
              : primary === "habits-kept"
                ? `Habits kept, ${ctx.habits} of ${ctx.habits}`
                : primary === "day-kept"
                  ? `Day ${ctx.streak} kept`
                  : primary === "ring-quest"
                    ? "Quest ring closed"
                    : primary === "ring-musts"
                      ? "Musts ring closed"
                      : "Life ring closed";
    // A lane is on the board: its kept line sweeps across its card and the burst starts at its header, where the
    // stamp lands. The Board clear card is on the board too. The streak, the rings and the Full day are Character's
    // tiles, so their moment shows as the toast with its closing ring.
    const lane = primaryLane != null;
    chime({
      kind,
      id,
      text,
      say,
      sweepEl: lane ? laneEl(primaryLane, ".lane-body") : null,
      burstEl: lane ? laneBurstEl(primaryLane) : null,
      ringEl: null,
    });
    if (!lane && primary !== "board-clear") pushToast({ title: text, ring: true, holdMs: 5000, key: `chime:${id}` });
  }

  useEffect(() => {
    const prev = prevSnapshot.current;
    const next = shown.snapshot;
    prevSnapshot.current = next;
    // A lane kept and the board clear follow a tick (a defer or a skip that empties a lane is no deed).
    const ticked = Date.now() - tickedAt.current <= MOMENT_WINDOW_MS;
    // Only after a tap: never on arrival, never on a refresh or another tab's work. Never on a work tab (the work skin:
    // no lane stamps, no bursts, no Board clear, no chime).
    if (isWork || Date.now() - actedAt.current > MOMENT_WINDOW_MS) return;
    // Momentum (§G.1): while today's run is still open, the tap's server answer brings momentum-kept, which replaces
    // the day-kept chime (one chime for one tick); the board holds its own back.
    const moments = dayMomentsOf(prev, next).filter((m) => !(m === "day-kept" && momentumOpen));
    const played = moments.filter((m) => ticked || !TICK_MOMENTS.has(m));
    if (played.length === 0) return;
    playMoments(played);
    // `shown` travels with its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  // ── Rows ────────────────────────────────────────────────────────────────

  /** A row's way (board-ui RowMotion): held or folding while it leaves its lane, landing in Done today, or back after an Undo. */
  const motionOf = (row: BoardRow, pile: boolean): RowMotion | null => {
    const key = row.key;
    if (row.state === "done") return !pile && exits[key] ? exits[key] : pile && arrivals[key] === "arrive" ? "arrive" : null;
    return !pile && arrivals[key] === "enter" ? "enter" : null;
  };

  /** A row in a lane (or Anytime, or Record yesterday); `pile` draws it compact in Done today. */
  const rowView = (row: BoardRow, pile: boolean) => {
    const key = row.key;
    const drawerOpen = openKey === key;
    const minutes = rowMinutes(key, openKey, drawerMinutes);
    // Pages proof (P24): the pages picked in this row's open drawer (a reading task's), as its minutes are.
    const pagesPicked = rowMinutes(key, openKey, drawerPages);
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
        onTick={(from) => (viaSteps(row) ? tickSteps(row, null, true, from) : tickRow(row, minutes, from))}
        onUndo={() => undo(row)}
        onToggleDrawer={() => {
          setOpenKey((k) => (k === key ? null : key));
          setDrawerMinutes(null);
          setDrawerPages(null);
        }}
        onToggleReceipt={() => setReceiptKey((k) => (k === key ? null : key))}
        onMinimum={row.lane === "must" && row.template.mvv ? (from) => complete(row, { mvv: true }, from) : undefined}
        justAdded={justAdded === row.template.id}
        restToday={board.restToday}
        named={namedOfTitle(namedTitles, row.template.id)}
        namedMark={namedTitles?.mark}
        taskStyle={current.styles?.[row.template.id] ?? null}
        onStep={(stepId, done, from) => tickSteps(row, stepId, done, from)}
        motion={motionOf(row, pile)}
        variant={pile ? "pile" : undefined}
        timer={row.proof ? { busy: w?.kind === "timer", onStart: () => startTimer(row), onStop: () => stopTimer(row), onDiscard: () => discardTimer(row) } : null}
        work={isWork}
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
          onDone={() => (viaSteps(row) ? tickSteps(row, null, true) : tickRow(row, minutes, null, true))}
          onYesterday={() => recordYesterday(row, minutes, pagesPicked)}
          onMinimum={() => complete(row, { mvv: true })}
          onSkip={() => skip(row)}
          onTomorrow={() => moveToTomorrow(row)}
          onAgain={() => again(row, minutes, pagesPicked)}
          onRename={(title) => work(row.template.id, { kind: "rename", title }, () => renameTask(row.template.id, title, REFRESH))}
          onArchive={() => archive(row)}
          onDefer={() => openDecision(row, "defer")}
          onAbort={() => openDecision(row, "abort")}
          decision={drawerOpen ? drawerDecisionOf(row) : null}
          onOverride={(n) => work(row.template.id, { kind: "rate", override: n }, () => setBandOverride(row.template.id, n, REFRESH))}
          onResize={() => resize(row)}
          rule={drawerOpen ? drawerRuleOf(row) : null}
          taskStyle={current.styles?.[row.template.id] ?? null}
          work={isWork}
          proof={row.proof ? { timer: row.proof.timer, project: (m) => projectRow(current, row, { minutes: m, wall: m }) } : null}
          pages={row.pages ? { target: row.pages.target, picked: pagesPicked, onPick: setDrawerPages } : null}
        />
      </TaskRow>
    );
  };
  const renderRow = (row: BoardRow) => rowView(row, false);
  const renderPileRow = (row: BoardRow) => rowView(row, true);

  const openCount = (rows: BoardRow[]) => rows.filter((r) => r.state === "open" || r.state === "locked").length;
  const goalsForInbox = useMemo(
    () => [...board.goals.SHORT, ...board.goals.MID, ...board.goals.LONG].map((g) => ({ id: g.template.id, title: g.template.title })),
    [board.goals]
  );
  const upcoming = useMemo(
    () => upcomingOf(current, new Set([...board.must.map((r) => r.template.id), ...board.todayRows.map((r) => r.template.id), ...board.deferred.map((i) => i.templateId)])),
    [current, board.must, board.todayRows, board.deferred]
  );
  const chosenCapacity = capacityChosen(current);
  const laneNote = todayLaneNote({ templates: current.templates.length, clear: board.clear, todayRows: board.todayRows.length });
  // Done rows rest in Done today: each lane draws what is still open (and a row still on its way out), or "All kept".
  const leaving = (key: string) => key in exits;
  const mustRows = laneRowsOf(board.must, leaving);
  const plannedRows = laneRowsOf(planned, leaving);
  const habitRows = laneRowsOf(habits, leaving);
  const anytimeRows = laneRowsOf(board.anytime, leaving);
  const allKeptLine = <p className="lane-note lane-all">{isWork ? "All done" : "All kept"}</p>;
  const pile = donePileOf(dayRows, { work: isWork, leaving });
  const pileShown = donePileShown(pile.rows, doneOpen);
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
  /** Rule changes classified on the board's clock (render); the server decides again when it writes. */
  const viewCtx = { today: current.today, nowMs: clock, live };

  // Device-local flags for what is on screen, read once mounted.
  const clearKey = boardClearKey(current.today, workTab?.id ?? null);
  const flagSig = [duty?.cursor ? settledKey(duty.cursor) : "", ...(duty?.owed ?? []).map((c) => missPromptKey(c.templateId, c.lastMissDay)), clearKey]
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

  // Board clear: once the tap that cleared the board has played it, the card holds the life day while the board stays
  // clear, until OK (this device). Its figures are the board's own; a work tab says only the tasks done.
  const clearView =
    !isWork && shown.snapshot.clear && flags?.[clearKey] === "shown"
      ? boardClearViewOf({
          done: doneToday.count,
          work: isWork,
          lifeXp: board.lifeXpToday,
          momentum: !isWork && momentum?.live ? { run: momentum.run.current, quests: momentum.quests.length, questsDone: momentum.done } : null,
          tomorrow: firstTomorrowOf({ tomorrow: addDays(current.today, 1), later: board.laterRows, upcoming }),
        })
      : null;
  const dismissClear = () => {
    setFlag(clearKey, "dismissed");
    // Focus, if it was on the card, goes to the board's first lane.
    if (document.activeElement?.closest(".today-clear")) setRefocus({ rowKey: null, lane: boardRef.current?.querySelector<HTMLElement>(".today-lane")?.dataset.lane ?? null, anytime: false });
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
  // Daily quests (D14, D15): the personal Board's Must lane is the Daily Quests, with its 1/0 strip; a work tab's stays "Must".
  const daily = isWork ? null : dailyQuestsOf(board);
  // Blueprint P21 (D19): the one Rest Token bank, the Momentum card's own number, as the Daily quests' 'Rest tokens 2' chip.
  const restTokens = !isWork && momentum?.live ? momentum.run.bank : null;
  // Blueprint P29 (D25): the streak multiplier's chip, 'Streak ×1.16 · day 3', only while the server sends it.
  const streakChip = !isWork && board.streak ? board.streak : null;
  const mustView = mustLaneOf({ must: board.must, owed: laneCards, restToday: board.restToday, live, launchDay, today: current.today, deferred: board.deferred, ...(daily ? { daily } : {}), restTokens, ...(streakChip ? { streak: streakChip } : {}) });
  const hiddenMusts = board.deferred.filter((i) => i.must);
  const hiddenOther = board.deferred.filter((i) => !i.must);
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
  function makeUpOwed(card: OwedCard, minimum: boolean, from: Element | null, report?: MakeUpReport) {
    if (staleDay() || owedBusy) return;
    // P20 review: a proof make-up flies and is compared at the price its picks showed, not the estimate's.
    const shownXp = minimum ? (card.minimumXp ?? 0) : (report?.price ?? card.makeUpXp);
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
        // Proof of work (P20): a deep-work or reading must's make-up carries what its chips picked.
        res = minimum ? await doMinimum(card.instanceId, REFRESH) : await makeUp(card.instanceId, { ...REFRESH, ...makeUpOptsOf(report) });
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
      // P20 review: compared with what the card showed (a proof make-up's projected price), so a clock-bounded count is said too.
      if (Math.abs(v.xp - shownXp) > 0.05) {
        const why = report?.minutes ? "today's total, or the time since today's own tick, changed it" : "today's total changed since the board loaded";
        setNotice(`${card.title}'s make-up paid ${fmtXp(v.xp)} XP, not about ${fmtXp(shownXp)}: ${why}.`);
      }
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
      (v) => announce(`A rest token covers ${fullWeekday(v.day)}. ${v.left} left.`)
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
  // P21 review: what today's open musts can count on from the Rest Token bank (FreezeState.forToday), so the line is honest.
  const closeItems = closeItemsOf({ must: board.must, todayRows: board.todayRows, today: current.today, live, tokens: live ? (duty?.freezes.forToday ?? duty?.freezes.banked ?? 0) : null });
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

  // The Asks: the Tasks section's only (record yesterday, the weekly review, the week audit), a badge on the plan card, never a card
  // of their own; every one is a tap away. Ideas' Asks (cards past grace, the quota, a penalty) stay in the bell.
  const taskAsks = asks.filter((a) => askHostOf(a) === "tasks");
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
        onMakeUp={(from, report) => makeUpOwed(card, false, from, report)}
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

  /** A must hidden by a decision, in the Must lane: quiet, counted as not kept ("Deferred to Tue 09:00 · No time · not kept"). */
  const renderHiddenMust = (item: DeferredItem) => {
    const undoIt = decisionUndoOf(item);
    return (
      <div key={item.templateId} className="t-deferred" data-template-id={item.templateId} data-just-added={justAdded === item.templateId ? "1" : undefined}>
        <span className="t-deferred-mark" aria-hidden="true" />
        <span className="t-deferred-txt">
          <span className="t-deferred-title">{item.title}</span>
          <span className="t-deferred-meta">
            {deferredLineOf(item, clock)}
            {isWork ? "" : item.held ? " · held by today's rest" : " · not kept"}
          </span>
        </span>
        {undoIt && (
          <button type="button" className="dec-undo" onClick={undoIt} disabled={busyTemplates.has(item.templateId)} aria-label={`Undo: ${item.kind === "DEFER" ? "defer" : "abort"} ${item.title}`}>
            Undo
          </button>
        )}
      </div>
    );
  };

  const firstRunHint = (
    <p className="lane-note">
      Nothing planned yet. <span className="hint-compact">Tap + in the tab bar</span>
      <span className="hint-wide">Press c or Capture</span> and type one line, e.g. <span className="t-mono">{captureExampleOf(isWork)}</span>{" "}
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
    <div className="page today-board cq-main" data-skin={isWork ? "work" : undefined}>
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
          {/* Board clear (once per life day, after the tick that cleared it): the one-card summary, at the top. */}
          {clearView && (
            <div className="o1">
              <BoardClearCard view={clearView} fresh={clearFresh} onDismiss={dismissClear} />
            </div>
          )}
          {/* Momentum (momentum.md §E.1): above the Duty card and the strip, only once it is live; never on a work tab. */}
          {!isWork && momentum?.live && (
            <div className="o1">
              <MomentumCard view={momentum} nowIso={nowIso} actions={MOMENTUM_ACTIONS} prices={questPrices} settled={momentumSettled} credits={credits} />
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

          {/* The three sections: what is due in Ideas and Body, one slim strip of links out (the page's slot). */}
          {elsewhere != null && elsewhere !== false && <div className="o2">{elsewhere}</div>}

          {/* A work tab (work-boards.ts) draws no card here: its name and menu are the work frame's header (the Office
              workspace, 2026-10-20). Nothing of the game: no capacity, no life XP, no Asks. */}

          {/* The day's plan (capacity, the life XP the ticks paid, Record yesterday), before the lanes on a phone; what
              waits on the Tasks section (record yesterday, the weekly review) is a badge in its corner. */}
          {!isWork && (
            <div className="o2 ask-host">
              <PlanCard
                planned={{ minutes: board.planned, capacity: board.capacity, chosen: chosenCapacity, over: board.over }}
                onCapacity={() => setCapacityOpen(true)}
                xp={board.lifeXpToday}
                pts={board.reviewXpToday}
                yesterdayOpen={yesterdayOpenCount}
                onYesterday={() => setYesterdayOpen(true)}
              >
                <AskBadge asks={taskAsks} label="today's tasks" onAction={askAction} />
              </PlanCard>
            </div>
          )}
        </div>

        <div className="c2" data-tour="today-lanes">
          {/* P29: no musts and no debts hide the lane, but the streak multiplier still prices every full tick: its chip alone. */}
          {!mustView.show && mustView.solo && (
            <div className="lane-chips streak-solo o5">
              <LaneChipView chip={mustView.solo} />
            </div>
          )}
          {mustView.show && (
            <Lane
              id="must"
              title={daily ? DAILY_QUESTS_TITLE : "Must"}
              must={!isWork}
              kept={!isWork && shown.mustLaneKept}
              landing={!!beat?.lanes.includes("must")}
              bodyRef={mustBodyRef}
              count={mustView.count ?? undefined}
              strip={daily ? <DailyStrip daily={daily} /> : undefined}
              badge={mustView.chips.length > 0 ? mustView.chips.map((c) => <LaneChipView key={c.text} chip={c} />) : undefined}
              className="o5"
            >
              {mustRows.allDone && hiddenMusts.length === 0 && allKeptLine}
              {mustRows.rows.map(renderRow)}
              {hiddenMusts.map(renderHiddenMust)}
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
            <Lane
              id="planned"
              title="Planned"
              count={planned.length > 0 ? `${plannedTally.kept} of ${plannedTally.total}` : undefined}
              kept={!isWork && !!shown.snapshot.planned}
              landing={!!beat?.lanes.includes("planned")}
              className="o6"
              note={plannedNote}
            >
              {plannedRows.allDone && allKeptLine}
              {plannedRows.rows.map(renderRow)}
            </Lane>
          )}
          {habits.length > 0 && (
            <Lane
              id="habits"
              title="Habits"
              habit={!isWork}
              count={`${habitTally.kept} of ${habitTally.total}`}
              kept={!isWork && !!shown.snapshot.habits}
              landing={!!beat?.lanes.includes("habits")}
              className="o7"
              note={habits.length > 0 && planned.length === 0 ? plannedNote : null}
              action={
                // Each habit's year (Tasks › Habits); the personal Board's habits only (a work tab's are not tracked there).
                isWork ? undefined : (
                  <Link className="lane-link" href="/today/habits" aria-label="Year: each habit's track record">
                    Year
                  </Link>
                )
              }
            >
              {habitRows.allDone && allKeptLine}
              {habitRows.rows.map(renderRow)}
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
          {/* The week's calibration (blueprint P32), Mondays only: only drawn; never on a work tab. */}
          {!isWork && nextWeek != null && nextWeek !== false && <div className="o9">{nextWeek}</div>}
          {/* The Main quest (blueprint P15): the roadmap goal above its key results, only drawn; never on a work tab. */}
          {!isWork && mainQuest != null && mainQuest !== false && <div className="o9">{mainQuest}</div>}
          {/* A work tab (work-boards.ts) draws no goals (GoalsStrip off). Its scheduled tasks (the call backs' and the
              customer tasks' one list, 2026-10-20) are the work frame's Agenda, never on this board. */}
          <div className="o9">
            <GoalsStrip
              off={isWork}
              goals={board.goals}
              busy={busyGoals || goalClosing || reschedBusy}
              onProgress={progressGoal}
              launched={launched}
              onClose={launched ? openGoalClose : undefined}
              onReschedule={openGoalResched}
              justAdded={justAdded}
              namedTitles={namedTitles}
            />
          </div>

          {/* Done today: where a ticked row rests (latest first; folded to three), above Inbox and Anytime. */}
          <DonePile pile={pile} open={doneOpen} hidden={pileShown.hidden} onToggle={() => setDoneOpen((o) => !o)} className="o13">
            {pileShown.shown.map(renderPileRow)}
          </DonePile>

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
            {(board.anytime.length > 0 || board.later > 0 || upcoming.length > 0 || hiddenOther.length > 0) && (
              <>
                <button type="button" className="collapsed" aria-expanded={anytimeOpen} aria-controls="anytime-rows" onClick={() => setAnytimeOpen((o) => !o)}>
                  <Sigil track="craft" className="ink-1" />
                  <b>Anytime</b>
                  <span>
                    {openCount(board.anytime)}
                    {board.later > 0 ? ` · ${board.later} planned later` : ""}
                    {hiddenOther.length > 0 ? ` · ${hiddenOther.length} deferred` : ""}
                    {upcoming.length > 0 ? ` · ${upcoming.length} repeating later` : ""}
                  </span>
                  <Icon name="chev" size={16} className={cx("ink-2 chev", anytimeOpen && "open")} />
                </button>
                {anytimeOpen && (
                  <div id="anytime-rows" className="anytime-rows">
                    {anytimeRows.rows.map(renderRow)}
                    {/* Defer and abort (task-decisions.ts): what is off the board for now, when it comes back and why. */}
                    {hiddenOther.length > 0 && (
                      <div className="today-upcoming dec-deferred">
                        <p className="t-eyebrow">Deferred</p>
                        <ul>
                          {hiddenOther.map((i) => {
                            const undoIt = decisionUndoOf(i);
                            return (
                              <li key={i.templateId} data-template-id={i.templateId} data-just-added={justAdded === i.templateId ? "1" : undefined}>
                                <span className="dec-when">
                                  <span className="today-upcoming-title">{i.title}</span>
                                  <span className="today-upcoming-day">
                                    {deferredLineOf(i, clock)}
                                    {i.defers >= 2 ? ` · ${i.defers}×` : ""}
                                  </span>
                                </span>
                                {undoIt && (
                                  <button type="button" className="dec-undo" onClick={undoIt} disabled={busyTemplates.has(i.templateId)} aria-label={`Undo: defer ${i.title}`}>
                                    Undo
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
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

          {!isWork && (
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
          )}

          <div className="foot-note o11">
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
        work={isWork}
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
                    Did it yesterday{isWork ? "" : ` · ≈ ${fmtXp(r.recordYesterday!.xp)}`}
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

      <DecisionSheet
        open={!!decide?.open}
        mode={decide?.mode ?? "defer"}
        formKey={decide?.nonce ?? 0}
        target={decide?.target ?? null}
        nowMs={decide?.nowMs ?? clock}
        busy={decideBusy}
        error={decideError}
        onSubmit={submitDecision}
        onClose={() => {
          if (!decideBusy) setDecide((c) => (c ? { ...c, open: false } : c));
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

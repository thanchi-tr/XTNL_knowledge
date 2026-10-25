/**
 * The Today board's and the capture sheet's view rules
 * (src/components/today/board-ui.ts, src/components/capture/capture-ui.ts
 * and layers.ts): what the board offers, when an Undo stops being on offer,
 * what the capacity tile may claim, where a new habit shows up, which layer
 * an Escape closes, where Tab goes in a modal, and which keys undo a capture.
 *
 * The redesign (Sigil & Slate, lane L1) adds: the Full-day rings
 * (src/lib/full-day.ts), Next up's priority, the Asks the board shows, the
 * Tier 1 moments a tap may fire, and "To Inbox". The review fixes (F1) add:
 * the moments around a tick (today-board.ts withMoments, with fakes), the
 * kept time, the quest estimate and cap shared with /review, past grace as
 * an ink Ask, and guards against class names that are Tailwind utilities.
 *
 * The capture improvement (capture.md, lane B) adds the sheet's rules:
 * the Enter table (burst capture), the 'Added here' list and the dock's
 * choice on close, Edit, the tap-to-add row over a table of lines, the
 * toast copy by case, the block-once Must gate, auto-retry, the paste
 * split, suggestions and the vocabulary cache, Back closes, the
 * '#capture=' link and the duplicate note.
 *
 * Plus source guards for the few rules that live only in markup and CSS
 * (touch-target sizes, the 12 px floor, no legacy tokens, the animated
 * properties, the sheets joining the Escape stack, one date in the top bar,
 * the tick as a checkbox). They read the files as text; nothing runs a
 * browser, a server or a database.
 *
 * The roadmap (roadmap.md F16 seams 4, 16, 17; F17; lane T) adds: the week
 * quests slot inside .o9 after the goals (data-compact while Close the day
 * is prominent), the seek from a week quest row, the page's one wave and
 * fallback freeze, ROADMAP goal cards, the review quest's markup pinned
 * byte for byte, and the fixture states. The fix round adds, card by card:
 * a goal never measured again reads 'not measured · pays nothing' with its
 * note (never '× progress'), a paid lineage's reason keeps its day, and the
 * card never says 'not recorded on this server' (stored readings only). It
 * imports roadmap-events, so scripts/_no-model.ts comes first (F16 seam
 * 22): no check reaches a model.
 *
 * Revision 4 (roadmap-rev4.md F-R4-3, lane T) adds Today's one quiet aim
 * line: loadAimStep and cookies() in the page's one wave, the slot holding
 * the week quests or else the aim line (never both), the compact hide keyed
 * on Close the day being due (the evening AND something to close, not the
 * clock alone), nothing in the counts, the Asks, the bell or a write, and
 * the fifteen fixture states, each roadmap-invite todayAimLineOf's own answer
 * (it imports roadmap-invite, after _no-model). The fix rounds add the HIDDEN
 * prompt ('hide:'), the count gates' START lines and the contract's rank
 * indices; fix round 2 adds Today's SET × writing 'hide:' (the 4 weeks its
 * label promises), the two in-place states in a copy of the board's columns,
 * and the line's text fit: an estimate from Inter's own advance widths that
 * every copy Today can draw fits the 3-line clamp (≤ 72 px) at 344 and in the
 * board's real column at ui-audit's widths. ui-audit's browser pass stays the
 * gate; this fails first when a copy grows. The finishing round adds the
 * drawer's Machine grade line on a plan-born task ('rm:…'): "the plan set
 * ~Nm", never "you said", and no AI band or Model row (TaskDrawer rendered).
 *
 * A PENDING line is another lane's open item this check tracks; with
 * --strict each one fails.
 *
 *   npx tsx scripts/today-ui-check.ts [--strict]
 */
import "./_no-model";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays, dayEndOf, dayKeyOf, dayStartOf, weekdayOf, zonedToInstant, type DayKey } from "../src/lib/life-day";
import { parseCapture, shiftReverted, type KeyLike } from "../src/lib/capture-parse";
import { BAND_OVERRIDE_COOLDOWN_DAYS, debtFor, selfRatingOpen, selfRatingOpensOn } from "../src/lib/life-grade";
import { normTitleOf } from "../src/lib/life-lexicon";
import { parseRule } from "../src/lib/recurrence";
import {
  UNDO_WINDOW_MS,
  asksToday,
  boardStreakOptionsOf,
  buildBoard,
  canUndo,
  isSettledOn,
  isUnsettledDutyDay,
  moveBlockOf,
  onRestMustsIn,
  questOf,
  seekPlaceOf,
  statsFor,
  weekQuestsShownOnToday,
  withMoments,
  type BoardData,
  type BoardInstance,
  type BoardRow,
  type BoardTemplate,
  type DayLedger,
  type PaidRecord,
} from "../src/lib/today-board";
import {
  REMOVE_UNDO_MS,
  boardDayEnded,
  calendarKeyOf,
  capacityChosen,
  capacityView,
  mergeSkew,
  nextBoardTick,
  ratingGate,
  receiptIdOf,
  recordByLabel,
  rowMinutes,
  streakCaptionOf,
  tickLabelOf,
  todayLaneNote,
  tomorrowOffer,
  undoExpiryOf,
  upcomingOf,
} from "../src/components/today/board-ui";
// The three sections: Today's "due elsewhere" strip and Character's day cards (moved off Today).
import { BODY_HREF, IDEAS_HREF, dueElsewhereOf, questsOpenOf, weighInDueOf } from "../src/components/today/due-elsewhere";
import { DueElsewhere } from "../src/components/today/DueElsewhere";
import { CHECK_DRAFT_WORD, OPEN_ROADMAP_WORD, SET_MAIN_QUEST_WORD, mainQuestCardOf } from "../src/components/today/main-quest-card";
import { MAIN_QUEST, SPRINT, SPRINT_PROVISIONAL_LINE, SPRINT_SHORT, mainQuestOf, mainQuestPickOf, milestoneUnderWay } from "../src/lib/main-quest";
import type { AimCardView, WeekQuestsView as MqWeekView, WeekQuestRow as MqRow } from "../src/lib/roadmap-types";
import { dayCardsOf } from "../src/components/home/day-cards";
import { isUndoCaptureKey, nextOccurrenceNote, toInboxLine } from "../src/components/capture/capture-ui";
import {
  ACTIVE_SCAN_MAX,
  ADDED_MAX,
  CAPTURE_FRAGMENT,
  CAPTURE_OPEN_HASH,
  CAPTURE_TAGS,
  EDIT_BUSY_NOTE,
  EDIT_EXPIRED_NOTE,
  EDIT_SAVING_NOTE,
  EDIT_TOO_LATE,
  EDIT_UNSAVED_NOTE,
  FILING_WHERE,
  IDEA_SELF_FILING_UI,
  LEGEND,
  MENU_NAME,
  MUST_WARNING,
  NOT_MUST_TAIL,
  OLD_KEPT_BODY,
  PASTE_CAP_NOTE,
  REMOVED_SHOW_MS,
  SUBMIT_GUARD_MS,
  SUMMARY_BODY_MAX,
  TOUCH_HINT,
  VOCAB_FRESH_MS,
  VOCAB_IDLE_MS,
  VOCAB_REFRESH_DELAY_MS,
  addedAnnouncement,
  addedReducer,
  addedRowCopy,
  applyInsert,
  canEditEntry,
  caretContext,
  caretPrefix,
  caretWord,
  dockToastChoice,
  duplicateNote,
  duplicateOf,
  editFill,
  editRefusalNote,
  enterAction,
  goalInsertText,
  goalSuggestions,
  historyOnClose,
  historyOnOpen,
  historyOnPop,
  ideaChipLabel,
  insertChipLabel,
  insertMenuOptions,
  insertRowChips,
  insertedNote,
  menuNote,
  mustFixInserts,
  mustGate,
  nextPruneAt,
  parsePendingList,
  pendingDayNote,
  parseVocabCache,
  primaryAction,
  PASTE_AS_NEW,
  TICKED_EARLIER_TAIL,
  TICKED_EARLIER_WHERE,
  TICKED_PRIMARY,
  TICK_PRIMARY,
  readCaptureFragment,
  recentChips,
  replaceCaretWord,
  replacingOf,
  splitPastedLines,
  stampLine,
  submitAllowed,
  summaryCopy,
  tagSuggestions,
  tickMatchOf,
  tickWantsRefresh,
  tickedAnnouncement,
  titleSlot,
  toastCopy,
  undoGoneCopy,
  unsentLabel,
  unsentSavedCopy,
  visibleAdded,
  vocabOnOpen,
  vocabPriceable,
  vocabRefreshDecision,
  vocabStale,
  wherePreviewOf,
  type AddedEntry,
  type CloseReason,
  type EnterAction,
  type EnterSource,
  type Insert,
} from "../src/components/capture/capture-ui";
import {
  MAX_AUTO_ATTEMPTS,
  PENDING_STALE_MS,
  RETRY_DELAYS_MS,
  isNetworkFailure,
  mayRetryNow,
  nextRetryDelay,
  queueAdd,
  queueDue,
  queueRemove,
  queueSettle,
  queueWake,
} from "../src/components/capture/capture-queue";
import { ToastBody, dockToastOf, type ToastHandlers } from "../src/components/capture/CaptureToast";
import { InsertRow } from "../src/components/capture/InsertRow";
import { JustAdded } from "../src/components/capture/JustAdded";
import { CaptureChips, TICK_GRADE_LABEL, TICK_PAID_LABEL } from "../src/components/capture/CaptureChips";
import { PastePreview } from "../src/components/capture/PastePreview";
import { CAPTURE_BATCH_MAX, CAPTURE_UNDO_MS, type ParsedCapture } from "../src/lib/life-types";
import type { CaptureActiveTitle, CapturedItem } from "../src/app/actions/capture";
import { QUEST_CAP, fullDayInputOf, fullDayOf, lifeDeedsOf, lifeRingOf, mustsRingOf, questRingOf } from "../src/lib/full-day";
import { REVIEW_QUEST_CARDS, minutesFor, questTargetOf } from "../src/lib/review-facts";
import {
  closeDayProminent,
  dayMomentsOf,
  hhmmOf,
  keptAtOf,
  laneTally,
  nextUpOf,
  questMinutesOf,
  splitTodayLane,
  tickNameOf,
  todayAsksOf,
  type DaySnapshot,
} from "../src/components/today/board-ui";
import { createLayerStack, wrapFocus, type EscapeKeyLike } from "../src/components/capture/layers";
import {
  FULL_DAY_PAY_LINE,
  HELD_GLYPH,
  RECORD_YESTERDAY_EVENT,
  RECORD_YESTERDAY_HREF,
  WEEK_REVIEW_NOTICE,
  askHostOf,
  asksShown,
  cancellableOf,
  closeItemsOf,
  dayLedgerDutyOf,
  deferredNoticeOf,
  madeUpLineOf,
  makeUpViewOf,
  makeUpWindowOf,
  missPromptCopyOf,
  missPromptKey,
  missPromptOf,
  mustLaneOf,
  o1CardOf,
  owedSummaryOf,
  owedTotalOf,
  pendingLineOf,
  pendingMetaOf,
  restOptionsOf,
  restSwitchOf,
  rollAllKeysOf,
  ruleChangeOf,
  settledKey,
  vacationRangeError,
  withHeldExcused,
  yesterdayActiveOf,
  yesterdaySheetOf,
  type MustLaneView,
  type StreakDutyFields,
} from "../src/components/today/board-ui";
// Blueprint P29: the streak chip's link and words.
import { STREAK_RULES_HREF, streakDescribe, streakViewOf } from "../src/lib/streak-mult";
import { declaredAheadOf, makeUpCopy, owedViewOf, restBannerOf, restStateOf, settledNoticeOf, type DutyBoard, type OwedCard, type SettledFact } from "../src/lib/duty-view";
import { WRITTEN_OFF_SUB, WRITTEN_OFF_TEXT, makeUpWordsOf } from "../src/components/today/m2/makeup-words";
// Type-only (erased): the server streak the board is typed with, so the Day ledger reads lane B's own field names.
import type { DailyStreak as ServerDailyStreak } from "../src/lib/streak";
import { settledFor } from "../src/lib/duty-economy";
import { MissPrompt } from "../src/components/today/MissPrompt";
import {
  GOAL_CLOSE_FINAL,
  carriedFigure,
  goalCardCopy,
  goalAfterClose,
  goalCloseCopy,
  goalClosedNotice,
  goalRescheduleError,
  goalRescheduleRange,
  goalRescheduledNotice,
} from "../src/components/today/board-ui";
import { GoalsStrip } from "../src/components/today/GoalsStrip";
import { GOAL_ALREADY_CLOSED, type GoalPayout } from "../src/lib/goals";
import {
  AIM_FIRST,
  AIM_LADDERS,
  AIM_LINE_FIXTURES,
  AIM_MON,
  PART_DOMAIN_NAMES,
  QUEST_FIXTURES,
  aimLineKindOf,
  aimLineOfFixture,
  fixtureBoard,
  fixtureRoadmapBoard,
  fixtureRoadmapBoardData,
  type AimLineFixture,
} from "../src/app/dev/style/today/fixtures";
import { NextUp } from "../src/components/today/NextUp";
import { TaskDrawer } from "../src/components/today/TaskDrawer";
import { TaskRow } from "../src/components/today/TaskRow";
import { NextWeekBody } from "../src/components/home/NextWeekBody";
import { calibrationOf, nextWeekViewOf, type CalibrationWeek } from "../src/lib/week-calibration";
import { Lane } from "../src/components/today/Lane";
import { rowAccentOf } from "../src/components/today/board-ui";
import { SEEK_TEMPLATE_EVENT, onSeekTemplate, seekTemplate } from "../src/components/roadmap/roadmap-events";
import { AIM_INVITE_SINCE, AIM_LATER_DAYS, AIM_STEP_COOKIE, aimPromptOf, hideCookieValue, laterCookieValue, stepCookieValue } from "../src/lib/roadmap-invite";
import {
  AIM_RANKS,
  MAX_MILESTONES,
  RANK_MILESTONE_MAX,
  ROADMAP_GOALS_LIVE,
  STAGE_KEYS,
  STAGE_LEVEL,
  STAGE_RANK,
  WEEK_QUEST_PARTS_TODAY,
  parseMeasureKey,
  rankIndexForStage,
  roadmapGoalsLive,
  stageLabelOf,
  type AimLineView,
} from "../src/lib/roadmap-types";
import { BODY_SAFE_KINDS, catalogEntryOf } from "../src/lib/roadmap-catalog";
import { AIM_NOT_NOW_SET_LABEL, GEMINI_MILESTONE_LABEL, aimLineCopy } from "../src/components/roadmap/roadmap-copy";

const TZ = "Australia/Sydney";
// Thursday 1 October 2026 (AEST; Sydney's DST starts Sunday 4 October).
const TODAY: DayKey = "2026-10-01";
const WED: DayKey = "2026-09-30";
const at = (key: DayKey, h: number, mi = 0): number => {
  const [y, m, d] = key.split("-").map(Number);
  return zonedToInstant(y, m, d, h, TZ).getTime() + mi * 60_000;
};

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
/** --strict: every PENDING line (another lane's open item) is a failure. */
const STRICT = process.argv.includes("--strict");
let pendingCount = 0;
/** A check another lane's change turns green: PASS once `ok`, else PENDING (FAIL under --strict), naming its owner. */
function pending(owner: string, name: string, ok: boolean, detail = "") {
  if (ok || STRICT) return check(name, ok, detail);
  pendingCount++;
  console.log(`PENDING (${owner}) ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────

function tpl(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: normTitleOf(p.title),
    recurrence: null,
    dueDay: null,
    dueKind: null,
    intrinsic: false,
    autoMetric: null,
    mvv: null,
    track: "DUTY",
    band: "STANDARD",
    bandOverride: 0,
    estMinutes: 30,
    machineMinutes: 30,
    kind: "TASK",
    inbox: false,
    startDay: addDays(TODAY, -60),
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: "STANDARD",
    aiBand: null,
    gradeSource: "LEXICAL",
    gradeConfidence: 0.4,
    gradeBasis: null,
    gradeModel: null,
    gradePromptVersion: null,
    gradeAttempts: 1,
    gradeFrozen: true,
    sizing: false,
    bandOverrideAt: null,
    gradeFrozenAt: null,
    topAttribute: null,
    note: null,
    completedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    sortOrder: 0,
    ...p,
  };
}

function ledger(day: DayKey): DayLedger {
  return { day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null };
}

function board(today: DayKey, templates: BoardTemplate[], history: BoardInstance[] = [], extra: Partial<BoardData> = {}): BoardData {
  const stats: BoardData["stats"] = {};
  for (const t of templates) {
    const rule = t.recurrence ? parseRule(t.recurrence) : null;
    if (rule) stats[t.id] = statsFor(t, rule, history.filter((i) => i.templateId === t.id), today);
  }
  return {
    today,
    yesterday: addDays(today, -1),
    capacityMin: 240,
    templates,
    instances: history,
    stats,
    ledger: { today: ledger(today), yesterday: ledger(addDays(today, -1)) },
    paid: {},
    goalQty: {},
    dueNow: 0,
    ...extra,
  };
}

const paidAt = (ms: number, undone = false): PaidRecord => ({
  eventId: "e1",
  instanceId: "i1",
  receipt: null,
  occurredAt: new Date(ms).toISOString(),
  xp: 4,
  undone,
});

const row = (state: BoardRow["state"], paid: PaidRecord | null = null) => ({ state, paid });

// ── The tick's label (no aria-pressed, one coherent action) ───────────────

{
  const r = { state: "done" as const, progress: null, template: { title: "Gym legs" } };
  check("tick: a done, undoable row is labelled as its action", tickLabelOf(r, true) === "Undo Gym legs");
  const closed = tickLabelOf(r, false);
  check("tick: a done row past its undo says done, never Undo", closed === "Gym legs, done" && !closed.includes("Undo"));
  check("tick: an open row says Complete", tickLabelOf({ ...r, state: "open" }, false) === "Complete Gym legs");
  check(
    "tick: a locked study row names its target",
    tickLabelOf({ state: "locked", progress: { done: 3, target: 20, label: "3/20 reviews", met: false }, template: { title: "Review" } }, false) ===
      "Review completes itself at 3/20 reviews"
  );
  const id = receiptIdOf("tpl_1:2026-10-01");
  check("receipt id: a valid, stable DOM id", /^receipt-[A-Za-z0-9_-]+$/.test(id) && id === receiptIdOf("tpl_1:2026-10-01"), id);
}

// ── The undo window expires on screen ─────────────────────────────────────

{
  const tick = at(TODAY, 10);
  const expiry = undoExpiryOf(tick, TZ);
  check("undo expiry: ten minutes after the tick", expiry === tick + UNDO_WINDOW_MS + 1);
  check("undo expiry: canUndo holds just before it", canUndo(new Date(tick), new Date(expiry - 1), TZ));
  check("undo expiry: canUndo is gone at it", !canUndo(new Date(tick), new Date(expiry), TZ));

  const late = at(TODAY, 27, 55); // 03:55 on Friday, still Thursday's life day
  const edge = dayEndOf(TODAY, TZ).getTime();
  check("undo expiry: the day edge cuts a late-night window short", undoExpiryOf(late, TZ) === edge);
  check("undo expiry: canUndo agrees at the edge", canUndo(new Date(late), new Date(edge - 1), TZ) && !canUndo(new Date(late), new Date(edge), TZ));

  const t1 = nextBoardTick({ rows: [row("done", paidAt(tick))], today: TODAY, clockMs: tick + 5 * 60_000 }, TZ);
  check("board tick: arms for the Undo that expires next", t1 === expiry, `${t1} vs ${expiry}`);
  const t2 = nextBoardTick({ rows: [row("done", paidAt(tick))], today: TODAY, clockMs: expiry }, TZ);
  check("board tick: after the Undo, the next is local midnight", t2 === at("2026-10-02", 0), `${t2 && new Date(t2).toISOString()}`);
  const t3 = nextBoardTick({ rows: [row("done", paidAt(tick, true))], today: TODAY, clockMs: tick }, TZ);
  check("board tick: an undone row arms nothing", t3 === at("2026-10-02", 0));
  const t4 = nextBoardTick({ rows: [], today: TODAY, clockMs: at("2026-10-02", 1) }, TZ);
  check("board tick: after midnight, the 04:00 day edge", t4 === edge);
  check("board tick: open rows arm nothing", nextBoardTick({ rows: [row("open")], today: TODAY, clockMs: tick }, TZ) === at("2026-10-02", 0));

  check("day ended: not before 04:00", !boardDayEnded(TODAY, edge - 1, TZ));
  check("day ended: from 04:00", boardDayEnded(TODAY, edge, TZ));

  // A phone two hours fast, at 03:00 server time: the board must not think
  // the day has ended (and reload on every tap) because the phone says 05:00.
  const server = at(TODAY, 27); // 03:00 Friday, still Thursday's day
  const phone = server + 2 * 3_600_000 + 300; // + 300 ms latency
  const skew = mergeSkew(null, server, phone);
  check("skew: a fast phone is corrected to the server's clock", !boardDayEnded(TODAY, phone + skew, TZ) && boardDayEnded(TODAY, phone, TZ));
  check("skew: a stale (cached) render never drags the estimate back", mergeSkew(skew, server - 3_600_000, phone + 1000) === skew);
  check("skew: a fresher render improves it", mergeSkew(skew, server + 1000, phone + 1000 - 200) === skew + 200);
  check("skew: garbage leaves it alone", mergeSkew(skew, Number.NaN, phone) === skew && mergeSkew(null, Number.NaN, phone) === 0);
}

// ── The Yesterday lane's limit, true when read ────────────────────────────

{
  check("record-by: at 10:00 it is 04:00 tomorrow", recordByLabel(TODAY, at(TODAY, 10), TZ) === "record by 04:00 tomorrow", recordByLabel(TODAY, at(TODAY, 10), TZ));
  check("record-by: at 23:59 still tomorrow", recordByLabel(TODAY, at(TODAY, 23, 59), TZ) === "record by 04:00 tomorrow");
  check("record-by: at 01:00 it is this morning", recordByLabel(TODAY, at(TODAY, 25), TZ) === "record by 04:00 this morning", recordByLabel(TODAY, at(TODAY, 25), TZ));
  check("record-by: never the bare 'until 04:00'", !recordByLabel(TODAY, at(TODAY, 10), TZ).includes("until"));
  // Across the DST change (Sunday 4 Oct, 02:00 → 03:00): the edge still reads 04:00.
  const sat: DayKey = "2026-10-03";
  check("record-by: the DST night still ends at 04:00", recordByLabel(sat, at(sat, 12), TZ) === "record by 04:00 tomorrow", recordByLabel(sat, at(sat, 12), TZ));
  check("calendar key: 01:00 Friday is Friday on the calendar", calendarKeyOf(at(TODAY, 25), TZ) === "2026-10-02");
}

// ── 'Tomorrow' only where the server accepts it ───────────────────────────

{
  type Movable = Parameters<typeof tomorrowOffer>[0];
  const one = (p: Partial<Movable>): Movable => ({ recurrence: null, compulsory: false, dueKind: null, dueDay: null, completedAt: null, ...p });
  const must = tomorrowOffer(one({ compulsory: true, dueKind: "DEADLINE", dueDay: TODAY }), TODAY);
  check("tomorrow: hidden on a compulsory deadline due today, with the server's reason", !must.show && !!must.reason, must.reason ?? "");
  const lateMust = tomorrowOffer(one({ compulsory: true, dueKind: "DEADLINE", dueDay: addDays(TODAY, -2) }), TODAY);
  check("tomorrow: hidden on a late compulsory deadline", !lateMust.show && !!lateMust.reason);
  check("tomorrow: a compulsory deadline two days out may be put off to tomorrow", tomorrowOffer(one({ compulsory: true, dueKind: "DEADLINE", dueDay: addDays(TODAY, 2) }), TODAY).show);
  check("tomorrow: hidden on a one-off already done", !tomorrowOffer(one({ completedAt: "2026-10-01T01:00:00.000Z" }), TODAY).show);
  check("tomorrow: offered on a planned one-off", tomorrowOffer(one({ dueKind: "PLANNED", dueDay: TODAY }), TODAY).show);
  check("tomorrow: offered on an undated one-off", tomorrowOffer(one({}), TODAY).show);
  const habit = tomorrowOffer(one({ recurrence: "DAILY" }), TODAY);
  check("tomorrow: never on a repeating task (Skip covers it)", !habit.show && habit.reason === null);
  // Parity: the drawer offers exactly the moves rescheduleCore accepts.
  const cases: Movable[] = [];
  for (const compulsory of [false, true])
    for (const dueKind of [null, "PLANNED", "DEADLINE"] as const)
      for (const gap of [-3, -1, 0, 1, 2, 5]) cases.push(one({ compulsory, dueKind, dueDay: dueKind ? addDays(TODAY, gap) : null }));
  const agree = cases.every((c) => tomorrowOffer(c, TODAY).show === (moveBlockOf(c, addDays(TODAY, 1), TODAY) === null));
  check("tomorrow: agrees with the server's moveBlockOf on every one-off shape", agree);
}

// ── The self-rating cooldown, mirrored ────────────────────────────────────

{
  const now = at(TODAY, 12);
  const day = 86_400_000;
  const cases: [string, string | null, string | null, boolean][] = [
    ["never rated", new Date(now - 10 * day).toISOString(), null, true],
    ["rated before the first tick", new Date(now - 3 * day).toISOString(), new Date(now - 5 * day).toISOString(), true],
    ["rated after the first tick, 2 days ago", new Date(now - 10 * day).toISOString(), new Date(now - 2 * day).toISOString(), false],
    ["rated after the first tick, 8 days ago", new Date(now - 20 * day).toISOString(), new Date(now - 8 * day).toISOString(), true],
    ["not yet ticked", null, new Date(now - 1 * day).toISOString(), true],
  ];
  for (const [name, frozen, rated, open] of cases) {
    const g = ratingGate({ gradeFrozenAt: frozen, bandOverrideAt: rated }, now);
    const server = selfRatingOpen({ firstCompletedAt: frozen ? new Date(frozen) : null, bandOverrideAt: rated ? new Date(rated) : null }, new Date(now));
    check(`rating gate: ${name}`, g.open === open && g.open === server);
  }
  const closed = ratingGate({ gradeFrozenAt: new Date(now - 10 * day).toISOString(), bandOverrideAt: new Date(now - 2 * day).toISOString() }, now);
  // It reopens at 04:00 on the life day the server names, not 7 × 24 h after the rating.
  const opensOn = selfRatingOpensOn({ firstCompletedAt: new Date(now - 10 * day), bandOverrideAt: new Date(now - 2 * day) });
  check(
    "rating gate: says when it reopens (04:00 on the server's life day)",
    opensOn !== null && closed.nextAt === dayStartOf(opensOn).getTime() && opensOn === addDays(dayKeyOf(new Date(now - 2 * day)), BAND_OVERRIDE_COOLDOWN_DAYS)
  );
}

// ── Capacity: no warning against a default nobody chose ───────────────────

{
  const unset = capacityView({ over: 80, chosen: false });
  check("capacity: over the default does not warn", !unset.warn && unset.tone === "blue" && !unset.offerMove && unset.suffixDefault);
  const set = capacityView({ over: 80, chosen: true });
  check("capacity: over a chosen capacity warns and offers a move", set.warn && set.tone === "amber" && set.offerMove && !set.suffixDefault);
  const within = capacityView({ over: 0, chosen: true });
  check("capacity: within a chosen capacity is calm", !within.warn && within.tone === "blue");
  const d = board(TODAY, []);
  check("capacity: board data without the flag reads as the default", !capacityChosen(d));
  check("capacity: the server's flag is honoured once present", capacityChosen({ ...d, capacitySet: true } as BoardData));
}

// ── A habit captured on a day it does not run lands somewhere ─────────────

{
  const monThu = tpl({ id: "gym", title: "Gym legs", recurrence: "DOW:1,4", startDay: WED, createdAt: "2026-09-30T02:00:00.000Z" });
  const daily = tpl({ id: "floss", title: "Floss", recurrence: "DAILY" });
  const target = tpl({ id: "run", title: "Run", recurrence: "TARGET:3/W" });
  const phase = tpl({ id: "gutters", title: "Clean gutters", recurrence: "EVERY:14", startDay: "2026-10-05" });
  const goal = tpl({ id: "g", title: "Get fit", kind: "GOAL", recurrence: null });
  const d = board(WED, [monThu, daily, target, phase, goal]);
  const b = buildBoard(d);
  const onToday = new Set([...b.must, ...b.todayRows].map((r) => r.template.id));
  check("upcoming: the Mon/Thu habit is on no lane on a Wednesday", !onToday.has("gym") && ![...b.anytime, ...b.yesterdayRows].some((r) => r.template.id === "gym"));
  const up = upcomingOf(d, onToday);
  const gym = up.find((u) => u.templateId === "gym");
  check("upcoming: it is listed, due Thursday ('tomorrow')", gym?.next === TODAY && gym.label === "tomorrow", JSON.stringify(gym));
  const gutters = up.find((u) => u.templateId === "gutters");
  check("upcoming: a phased rule starting Monday is listed for Monday", gutters?.next === "2026-10-05" && gutters.label === "Mon", JSON.stringify(gutters));
  check("upcoming: due-today and TARGET habits and goals are not listed", !up.some((u) => ["floss", "run", "g"].includes(u.templateId)));
  check("upcoming: sorted by the day it falls", up.map((u) => u.templateId).join(",") === "gym,gutters", up.map((u) => u.templateId).join(","));
  const thu = board(TODAY, [monThu]);
  const bThu = buildBoard(thu);
  const onThu = new Set([...bThu.must, ...bThu.todayRows].map((r) => r.template.id));
  check("upcoming: on its day it is on the board, not in the list", onThu.has("gym") && upcomingOf(thu, onThu).length === 0);
}

{
  const note = (line: string, today: DayKey) => nextOccurrenceNote(parseCapture(line, { today }), today);
  check("capture toast: Mon/Thu captured on a Wednesday says Next: tomorrow", note("gym legs every mon,thu", WED) === "Next: tomorrow", String(note("gym legs every mon,thu", WED)));
  check("capture toast: Mon/Thu captured on a Tuesday says Next: Thu", note("gym legs every mon,thu", "2026-09-29") === "Next: Thu", String(note("gym legs every mon,thu", "2026-09-29")));
  check("capture toast: captured on its day says nothing (it is on the board)", note("gym legs every mon,thu", TODAY) === null);
  check("capture toast: 'every 2 weeks on mon' says Next: Mon", note("every 2 weeks on mon clean gutters", TODAY) === "Next: Mon", String(note("every 2 weeks on mon clean gutters", TODAY)));
  check("capture toast: a daily habit says nothing", note("floss daily", TODAY) === null);
  check("capture toast: a weekly target says nothing", note("run 3x/week", TODAY) === null);
  check("capture toast: a one-off says nothing", note("call mum fri", TODAY) === null);
}

// ── Lane copy and drawer minutes ──────────────────────────────────────────

{
  check("today lane: first run", todayLaneNote({ templates: 0, clear: true, todayRows: 0 }) === "first-run");
  check("today lane: clear", todayLaneNote({ templates: 3, clear: true, todayRows: 0 }) === "clear");
  check("today lane: only musts left — a line, not an empty card", todayLaneNote({ templates: 3, clear: false, todayRows: 0 }) === "only-musts");
  check("today lane: rows speak for themselves", todayLaneNote({ templates: 3, clear: false, todayRows: 2 }) === null);
  check("drawer minutes: priced while that drawer is open", rowMinutes("a", "a", 45) === 45);
  check("drawer minutes: forgotten once it closes", rowMinutes("a", null, 45) === null);
  check("drawer minutes: never leak to another row", rowMinutes("b", "a", 45) === null);
  check("removals: Undo lasts ten seconds", REMOVE_UNDO_MS === 10_000);
}

// ── Escape closes only the top-most layer ─────────────────────────────────

{
  const closed: string[] = [];
  const stack = createLayerStack();
  const esc = (p: Partial<EscapeKeyLike> = {}): EscapeKeyLike & { prevented: boolean } => {
    const e = { key: "Escape", defaultPrevented: false, prevented: false, preventDefault() { e.prevented = true; }, ...p };
    return e;
  };
  const popReceipt = stack.push(() => closed.push("receipt"));
  stack.push(() => closed.push("inbox"));
  const popCapture = stack.push(() => closed.push("capture"));
  const e1 = esc();
  stack.handle(e1);
  check("escape: closes only the top layer", closed.join(",") === "capture" && e1.prevented, closed.join(","));
  popCapture();
  stack.handle(esc());
  check("escape: then the one below", closed.join(",") === "capture,inbox");
  check("escape: a key already claimed closes nothing", !stack.handle(esc({ defaultPrevented: true })) && closed.length === 2);
  check("escape: other keys close nothing", !stack.handle(esc({ key: "Enter" })) && closed.length === 2);
  check("escape: not while composing text", !stack.handle(esc({ isComposing: true })) && closed.length === 2);
  popReceipt();
  const inboxStill = stack.size() === 1;
  stack.handle(esc());
  check("escape: a layer removed out of order leaves the rest in order", inboxStill && closed.join(",") === "capture,inbox,inbox");
}

// ── Tab stays inside a modal ──────────────────────────────────────────────

{
  const els = ["input", "save", "chip", "link"];
  check("focus trap: Tab from the last wraps to the first", wrapFocus(els, "link", false) === "input");
  check("focus trap: Shift+Tab from the first wraps to the last", wrapFocus(els, "input", true) === "link");
  check("focus trap: Tab in the middle is left to the browser", wrapFocus(els, "save", false) === null && wrapFocus(els, "chip", true) === null);
  check("focus trap: focus outside is pulled back in", wrapFocus(els, "page", false) === "input" && wrapFocus(els, null, true) === "link");
  check("focus trap: nothing focusable, nothing to do", wrapFocus([], null, false) === null);
}

// ── Undoing a capture from the keyboard ───────────────────────────────────

{
  const key = (p: Partial<KeyLike>): KeyLike => ({ key: "z", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...p });
  const body = { tagName: "BODY", closest: () => null };
  const input = { tagName: "INPUT", closest: () => null };
  check("undo key: Ctrl+Z", isUndoCaptureKey(key({ ctrlKey: true }), body, false));
  check("undo key: Cmd+Z", isUndoCaptureKey(key({ metaKey: true }), body, false));
  check("undo key: Ctrl+Shift+Z is redo, not undo", !isUndoCaptureKey(key({ ctrlKey: true, shiftKey: true }), body, false));
  check("undo key: a bare z does nothing", !isUndoCaptureKey(key({}), body, false));
  check("undo key: never in a text field", !isUndoCaptureKey(key({ ctrlKey: true }), input, false));
  check("undo key: never mid-review", !isUndoCaptureKey(key({ ctrlKey: true }), body, true));
  check("undo key: never a key already taken", !isUndoCaptureKey(key({ ctrlKey: true, defaultPrevented: true }), body, false));
  check("undo key: never on auto-repeat", !isUndoCaptureKey(key({ ctrlKey: true, repeat: true }), body, false));
}

// ── The Full-day rings (src/lib/full-day.ts: the M2 FULL_DAY rule, read-only) ──

{
  const none = mustsRingOf({ kept: 0, total: 0 });
  check("full day: no musts today is met (nothing to keep), and says so", none.met && none.caption === "None today");
  const some = mustsRingOf({ kept: 1, total: 3 });
  check("full day: 1 of 3 musts is open", !some.met && some.caption === "1 of 3" && some.value === 1 && some.target === 3);
  check("full day: all musts kept closes the ring", mustsRingOf({ kept: 3, total: 3 }).met);

  const nothing = questRingOf({ reviews: 0, target: 0, dueNow: 0 });
  check("full day: nothing due at open meets the quest", nothing.met && nothing.caption === "Nothing due");
  const backlog = questRingOf({ reviews: 3, target: 142, dueNow: 139 });
  check("full day: a backlog is capped at 15 (never '3 of 142')", backlog.target === QUEST_CAP && backlog.caption === "3 of 15" && !backlog.met, backlog.caption);
  check("full day: 15 reviews meet the quest whatever is still due", questRingOf({ reviews: 15, target: 142, dueNow: 127 }).met);
  check("full day: a small queue is its own target", questRingOf({ reviews: 5, target: 5, dueNow: 0 }).caption === "5 of 5");
  // M2 decision 7: "queue clear" is no clause any more (a live dueNow cannot be rebuilt at d + 2).
  const cleared = questRingOf({ reviews: 3, target: 5, dueNow: 0 });
  check("full day: a clear queue alone no longer meets the quest (decision 7)", !cleared.met && cleared.caption === "3 of 5", cleared.caption);
  const noOpen = questRingOf({ reviews: 14, target: null });
  check("full day: with no DAY_OPEN row the quest needs 15 reviews", !noOpen.met && noOpen.caption === "14 of 15" && questRingOf({ reviews: 15, target: null }).met, noOpen.caption);
  const questFromBoard = questOf({ dayOpenQty: 40, reviews: 7, dueNow: 33, reviewXp: 20 });
  check("full day: the quest ring agrees with questOf's target", questRingOf({ reviews: questFromBoard.progress, target: questFromBoard.target, dueNow: questFromBoard.dueNow }).caption === "7 of 15");

  check("full day: no life deed yet", !lifeRingOf(0).met && lifeRingOf(0).caption === "0 of 1");
  check("full day: two deeds still read 1 of 1", lifeRingOf(2).met && lifeRingOf(2).caption === "1 of 1");
  check("full day: no deed, no Life ring (workouts went with M4)", !lifeRingOf(0).met && lifeRingOf(1).met);

  const full = fullDayOf({ musts: { kept: 2, total: 2 }, quest: { reviews: 15, target: 30, dueNow: 15 }, lifeDeeds: 1 });
  check("full day: all three rings make a Full day", full.full && full.met === 3);
  const two = fullDayOf({ musts: { kept: 1, total: 2 }, quest: { reviews: 15, target: 30, dueNow: 15 }, lifeDeeds: 1 });
  check("full day: two of three is not a Full day", !two.full && two.met === 2);

  // Life deeds: study-linked completions are paid by the reviews and never make a day on their own.
  const study = tpl({ id: "rev", title: "Review 20", autoMetric: "REVIEWS", autoTarget: 20 });
  const play = tpl({ id: "guitar", title: "Guitar", intrinsic: true });
  const chore = tpl({ id: "bins", title: "Take out bins" });
  const led = ledger(TODAY);
  led.completions = [
    { eventId: "e1", templateId: "rev", groupKey: "review", intro: false, raw: 0, xp: 0, sink: "NONE" },
    { eventId: "e2", templateId: "guitar", groupKey: "guitar", intro: false, raw: 0, xp: 0, sink: "NONE" },
    { eventId: "e3", templateId: "gone", groupKey: "gone", intro: false, raw: 4, xp: 4, sink: "TRACK" },
    { eventId: "e4", templateId: "gone2", groupKey: "gone2", intro: false, raw: 0, xp: 0, sink: "NONE" },
  ];
  const deeds = lifeDeedsOf({ templates: [study, play, chore], ledger: { today: led, yesterday: ledger(WED) } });
  check("life deeds: a study task is not one; #play is; an archived task counts by its sink", deeds === 2, String(deeds));

  // Musts kept: done (the minimum included) or excused (M2).
  const m1 = tpl({ id: "m1", title: "Meds", compulsory: true, recurrence: "DAILY", mvv: "1 pill" });
  const m2 = tpl({ id: "m2", title: "Stretch", compulsory: true, recurrence: "DAILY" });
  const m3 = tpl({ id: "m3", title: "Timesheet", compulsory: true, dueKind: "DEADLINE", dueDay: TODAY });
  const inst: BoardInstance[] = [
    { id: "i1", templateId: "m1", day: TODAY, slot: 0, status: "DONE_MVV", source: "manual", xpPaid: 1 },
    { id: "i2", templateId: "m2", day: TODAY, slot: 0, status: "EXCUSED", source: "manual", xpPaid: 0 },
  ];
  const d = board(TODAY, [m1, m2, m3], inst);
  const b = buildBoard(d);
  const q = questOf({ dayOpenQty: 0, reviews: 0, dueNow: 0, reviewXp: 0 });
  const input = fullDayInputOf(d, b, q);
  check("full day: the minimum and an excused must both count as kept", input.musts.kept === 2 && input.musts.total === 3, JSON.stringify(input.musts));
  check("board: a minimum completion shows as 'Minimum kept'", b.must.find((r) => r.template.id === "m1")?.minimum === true && b.must.find((r) => r.template.id === "m3")?.minimum === false);
  check("lane tally: done against every row that still asks", JSON.stringify(laneTally(b.must)) === JSON.stringify({ kept: 1, total: 3 }));
}

// ── Next up: the quest, then the oldest Must, then nothing ────────────────

{
  const older = tpl({ id: "old", title: "Old must", compulsory: true, dueKind: "PLANNED", dueDay: addDays(TODAY, -2), createdAt: "2026-09-20T00:00:00.000Z" });
  const newer = tpl({ id: "new", title: "New must", compulsory: true, dueKind: "DEADLINE", dueDay: TODAY, createdAt: "2026-09-01T00:00:00.000Z" });
  const b = buildBoard(board(TODAY, [newer, older]));
  const openQuest = { reviews: 2, target: 40, dueNow: 38, met: false, cap: 15 };
  const n1 = nextUpOf({ quest: openQuest, must: b.must });
  check("next up: the quest leads while its ring is open", n1.kind === "quest" && n1.cards === 15 && n1.dueAtOpen === 40);
  const n2 = nextUpOf({ quest: { ...openQuest, met: true }, must: b.must });
  check("next up: then the oldest open Must (carried from Tue beats due today)", n2.kind === "must" && n2.row.template.id === "old", n2.kind === "must" ? n2.row.template.id : n2.kind);
  const n3 = nextUpOf({ quest: { ...openQuest, met: true, dueNow: 4 }, must: [] });
  check("next up: nothing asking, with optional review still due", n3.kind === "clear" && n3.dueNow === 4);
}

// ── Asks: only what the board does not already carry ──────────────────────

{
  const notice = (id: string, group: string, tone: "good" | "warn" | "bad" | "info", title = id) => ({ id, group, tone, title, detail: `${id} detail`, href: "/x", action: "Go" });
  const asks = todayAsksOf({
    yesterdayOpen: 2,
    recordBy: "record by 04:00 tomorrow",
    notices: [
      notice("due", "Due", "info"),
      notice("overdue", "Due", "bad"),
      notice("musts", "Due", "info"),
      notice("inbox", "Due", "info"),
      notice("quota", "Due", "warn"),
      notice("quota-met", "Due", "good"),
      notice("focus", "Due", "good"),
      notice("bosses", "Challenges", "good"),
      notice("boon-x", "Active effects", "good"),
      { id: "debuff-SHAKEN", group: "Active effects", tone: "bad" as const, title: "Shaken", detail: "−10% · until Fri" },
    ],
  });
  check("asks: yesterday first, then past grace, the quota and a penalty", asks.map((a) => a.id).join(",") === "yesterday,overdue,quota,debuff-SHAKEN", asks.map((a) => a.id).join(","));
  check("asks: yesterday opens its sheet (no link) and says when it closes", !asks[0].href && asks[0].title === "Yesterday: 2 to record" && asks[0].detail.includes("04:00"));
  check("asks: a penalty is owed-toned and says how to act", asks[3].tone === "owed" && !!asks[3].href && asks[3].action.length > 0);
  // Due is never a hue: cards past grace are a date (the feed tones them 'bad'), so an ink diamond and a clock.
  check("asks: past grace is ink (never owed) and carries the clock glyph", asks[1].id === "overdue" && asks[1].tone === "ask" && asks[1].clock === true);
  check("asks: only the past-grace Ask carries the clock", asks.filter((a) => a.clock).map((a) => a.id).join(",") === "overdue");
  check("asks: owed only for a penalty", asks.filter((a) => a.tone === "owed").map((a) => a.id).join(",") === "debuff-SHAKEN");
  check("asks: good news never nags", !asks.some((a) => ["quota-met", "focus", "bosses", "boon-x"].includes(a.id)));
  check("asks: nothing from yesterday, no card", todayAsksOf({ yesterdayOpen: 0, recordBy: "", notices: [] }).length === 0);
}

// ── Tier 1 moments: only what closed, only once, never on an undo ─────────

{
  const snap = (p: Omit<Partial<DaySnapshot>, "rings"> & { rings?: Partial<DaySnapshot["rings"]> } = {}): DaySnapshot => ({
    kept: false,
    full: false,
    mustLane: false,
    ...p,
    rings: { musts: false, quest: false, life: false, ...p.rings },
  });
  const first = dayMomentsOf(snap(), snap({ kept: true, rings: { life: true } }));
  check("moments: the first deed keeps the day and closes the Life ring", first.join(",") === "day-kept,ring-life", first.join(","));
  const musts = dayMomentsOf(snap({ kept: true, rings: { life: true } }), snap({ kept: true, mustLane: true, rings: { life: true, musts: true } }));
  check("moments: the last must closes the Musts ring and keeps the lane", musts.join(",") === "ring-musts,lane-kept", musts.join(","));
  const full = dayMomentsOf(snap({ kept: true, rings: { life: true, quest: true } }), snap({ kept: true, full: true, mustLane: true, rings: { life: true, quest: true, musts: true } }));
  check("moments: the third ring makes the Full day", full.includes("full-day"));
  check("moments: an undo re-opens silently", dayMomentsOf(snap({ kept: true, rings: { life: true } }), snap()).length === 0);
  check("moments: nothing changed, nothing fires", dayMomentsOf(snap({ kept: true }), snap({ kept: true })).length === 0);
}

// ── Small view rules ──────────────────────────────────────────────────────

{
  check("tick name: the task itself (the checkbox carries done)", tickNameOf({ state: "open", progress: null, template: { title: "Meds" } }) === "Meds");
  check(
    "tick name: a locked study row says what completes it",
    tickNameOf({ state: "locked", progress: { done: 3, target: 20, label: "3/20 reviews", met: false }, template: { title: "Review" } }) === "Review, completes itself at 3/20 reviews"
  );
  const split = splitTodayLane([{ template: { recurrence: null } }, { template: { recurrence: "DAILY" } }, { template: { recurrence: "nonsense" } }]);
  check("lanes: one-offs are Planned, anything with a rule is a Habit", split.planned.length === 2 && split.habits.length === 1);
  check("close the day: quiet at 17:59", !closeDayProminent(at(TODAY, 17, 59), TZ));
  check("close the day: stands out from 18:00", closeDayProminent(at(TODAY, 18), TZ));
  check("close the day: still out after midnight (same life day)", closeDayProminent(at(TODAY, 25), TZ));
  check("close the day: quiet again from 04:00", !closeDayProminent(at(TODAY, 28), TZ));
  for (const line of ["call mum fri", "gym legs 60m every mon,thu !", "submit expenses by fri 5pm must"]) {
    const before = parseCapture(line, { today: TODAY });
    const after = parseCapture(toInboxLine(line), { today: TODAY });
    check(`to inbox: '${line}' goes to the Inbox through the parser's own '?', title unchanged`, after.inbox && after.title === before.title, `${after.title} | ${before.title}`);
  }
}

// ── Review fixes (F1): the kept time, the quest estimate and target ───────

{
  const done = (eventId: string, iso: string, undone = false): PaidRecord => ({ eventId, instanceId: `i-${eventId}`, receipt: null, occurredAt: iso, xp: 3, undone });
  const comp = (eventId: string) => ({ eventId, templateId: "t", groupKey: "t", intro: false, raw: 3, xp: 3, sink: "TRACK" as const });
  const day = (p: Partial<DayLedger>): Pick<BoardData, "paid" | "ledger"> & { paid: Record<string, PaidRecord> } => ({
    paid: {},
    ledger: { today: { ...ledger(TODAY), ...p }, yesterday: ledger(WED) },
  });
  const t0805 = new Date(at(TODAY, 8, 5)).toISOString();
  const t0930 = new Date(at(TODAY, 9, 30)).toISOString();
  const two = { ...day({ completions: [comp("b"), comp("a")] }), paid: { i1: done("a", t0930), i2: done("b", t0805) } };
  check("kept at: the earliest live tick of the day", keptAtOf(two) === t0805 && hhmmOf(Date.parse(t0805), TZ) === "08:05", String(keptAtOf(two)));
  check("kept at: no time when a review may have kept the day first", keptAtOf({ ...two, ledger: { ...two.ledger, today: { ...two.ledger.today, reviews: 1 } } }) === null);
  check("kept at: no time when a new idea may have kept it first", keptAtOf({ ...two, ledger: { ...two.ledger, today: { ...two.ledger.today, ideas: 1 } } }) === null);
  check("kept at: an undone tick is not the time", keptAtOf({ ...day({ completions: [comp("a")] }), paid: { i1: done("a", t0805, true) } }) === null);
  check("kept at: a deed the board cannot time says no time", keptAtOf({ ...day({ completions: [comp("a"), comp("x")] }), paid: { i1: done("a", t0805) } }) === null);
  check("kept at: nothing kept, nothing said", keptAtOf(day({})) === null);

  check("quest estimate: the hub's own rate for the cards still to go", questMinutesOf({ cards: 15, reviews: 0 }) === minutesFor(15) && questMinutesOf({ cards: 15, reviews: 12 }) === minutesFor(3));
  check("quest estimate: never 0 min, never negative past the target", questMinutesOf({ cards: 15, reviews: 40 }) === minutesFor(0) && minutesFor(0) >= 1);
  check("quest cap: the Quest ring's cap is the /review hub's (review-facts REVIEW_QUEST_CARDS)", QUEST_CAP === REVIEW_QUEST_CARDS);
  const agree = [
    [null, 0, 0],
    [null, 3, 4],
    [null, 2, 140],
    [40, 2, 38],
    [5, 5, 0],
    [0, 0, 0],
  ].every(([open, reviews, due]) => {
    const q = questOf({ dayOpenQty: open, reviews: reviews as number, dueNow: due as number, reviewXp: 0 });
    const ring = questRingOf({ reviews: q.progress, target: q.target, dueNow: q.dueNow });
    const hub = questTargetOf(open, reviews as number, due as number);
    return hub === 0 ? ring.caption === "Nothing due" : ring.target === hub;
  });
  check("quest target: Today's ring and the /review hub (questTargetOf) agree on every shape", agree);
}

// ── Moments around a board write (today-board withMoments, used by tasks.ts) ──

const asyncChecks: Promise<void>[] = [];
asyncChecks.push(
  (async () => {
    type Snap = { n: number };
    const log: string[] = [];
    let reads = 0;
    const snapshot = async (): Promise<Snap> => {
      log.push("snapshot");
      reads += 1;
      return { n: reads };
    };
    const detect = async (b: Snap, a: Snap) => {
      log.push(`detect ${b.n}->${a.n}`);
      return [`moment ${b.n}->${a.n}`];
    };
    const okWrite = async () => {
      log.push("write");
      return { ok: true as const, value: { paid: 3.6, duplicate: false } };
    };

    const r1 = await withMoments({ snapshot, detect, write: okWrite });
    check(
      "moments: before, write, after, diff, in that order; the write's value is kept",
      log.join(",") === "snapshot,write,snapshot,detect 1->2" && r1.ok && r1.value.paid === 3.6 && r1.value.celebrations.join() === "moment 1->2",
      log.join(",")
    );

    log.length = 0;
    const r2 = await withMoments({ snapshot, detect, write: async () => ({ ok: false as const, error: "That task is archived." }) });
    check("moments: a refused write takes no second snapshot and keeps its error", log.join(",") === "snapshot" && !r2.ok && r2.error === "That task is archived.", log.join(","));

    log.length = 0;
    const r3 = await withMoments({ snapshot, detect, write: async () => ({ ok: true as const, value: { duplicate: true } }), changed: (v) => !v.duplicate });
    check("moments: a double tap's stored answer changes nothing and fires nothing", log.join(",") === "snapshot" && r3.ok && r3.value.celebrations.length === 0, log.join(","));

    let wrote = 0;
    const r4 = await withMoments({
      snapshot: async () => {
        throw new Error("db down");
      },
      detect,
      write: async () => {
        wrote += 1;
        return { ok: true as const, value: { qty: 1 } };
      },
    });
    check("moments: a failed snapshot never fails the write (it lands once, with no moments)", wrote === 1 && r4.ok && r4.value.celebrations.length === 0 && r4.value.qty === 1);

    const r5 = await withMoments({
      snapshot,
      detect: async () => {
        throw new Error("persist failed");
      },
      write: okWrite,
    });
    check("moments: a failed diff never fails the write", r5.ok && r5.value.celebrations.length === 0);
  })().catch((err) => check("moments: the checks ran", false, String(err)))
);

// ── Source guards: markup and CSS rules no function holds ─────────────────

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const exists = (p: string) => {
  try {
    readFileSync(join(ROOT, p));
    return true;
  } catch {
    return false;
  }
};

/** The value of `prop` in the first rule whose selector list is exactly `selector` (optionally inside a media block). */
function cssValue(css: string, selector: string, prop: string, media?: string): number | null {
  let scope = css;
  if (media) {
    const i = css.indexOf(media);
    if (i < 0) return null;
    scope = css.slice(i);
  }
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, "m").exec(scope);
  if (!m) return null;
  const v = new RegExp(`(^|[;\\s])${prop}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(m[2]);
  return v ? Number(v[2]) : null;
}

{
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const today = strip(read("src/components/today/today.css"));
  const capture = strip(read("src/app/capture.css"));
  const atLeast = (name: string, v: number | null, min: number) => check(`touch target: ${name} ≥ ${min}px`, v != null && v >= min, String(v));
  atLeast("a row", cssValue(today, ".t-row .row", "min-height"), 64);
  atLeast("the row's title (opens the drawer)", cssValue(today, ".t-row .r-open", "min-height"), 44);
  atLeast("Minimum and the inline Undo", cssValue(today, ".t-row .r-act", "min-height"), 40);
  atLeast(".today-pill (drawer chips)", cssValue(today, ".today-pill", "min-height"), 40);
  atLeast(".today-band (self-rating)", cssValue(today, ".today-band", "min-height"), 40);
  atLeast("the first-run 'Capture one now'", cssValue(today, ".lane-note-link", "min-height"), 40);
  atLeast("the capacity cell", cssValue(today, ".today-day .cap-cell", "min-height"), 44);
  atLeast("Did / Didn't / Tomorrow choices", cssValue(today, ".y-opt", "min-height"), 44);
  atLeast("mood buttons", cssValue(today, ".moods button", "height"), 44);
  atLeast("the capture line", cssValue(capture, ".capture-input", "min-height"), 52);

  // The 12 px floor, in every font-size and font shorthand the board and the sheet write.
  const sizes = (css: string) => [
    ...[...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])),
    ...[...css.matchAll(/font:\s*(?:[a-z]+\s+)*\d{3}\s+(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])),
  ];
  const small = [...sizes(today), ...sizes(capture)].filter((n) => n < 12);
  check("type: nothing under 12 px in today.css or capture.css", small.length === 0, small.join(","));

  // Legacy aliases are gone from what this lane restyled.
  const legacy = /var\(--(ink-3|green(-10|-06|-hi)?|amber(-10)?|red(-10)?|blue(-10)?|line-act|line-hi|line|nav-h|base|sub|lift)\)/;
  const tsx = [
    "src/components/today/TodayBoard.tsx",
    "src/components/today/TaskRow.tsx",
    "src/components/today/TaskDrawer.tsx",
    "src/components/today/DayLedger.tsx",
    "src/components/today/NextUp.tsx",
    "src/components/today/GoalsStrip.tsx",
    "src/components/today/GoalSheets.tsx",
    "src/components/today/InboxSheet.tsx",
    "src/components/today/CapacityTile.tsx",
    "src/components/capture/QuickCapture.tsx",
    "src/components/capture/CaptureChips.tsx",
    "src/app/today/page.tsx",
    "src/app/today/rules/page.tsx",
  ];
  const withLegacy = [["today.css", today], ["capture.css", capture], ...tsx.map((f) => [f, read(f)])].filter(([, src]) => legacy.test(src)).map(([f]) => f);
  check("tokens: no legacy aliases (--ink-3, --green, --amber, --red, --blue, --line…) in L1's files", withLegacy.length === 0, withLegacy.join(", "));
  const oldToast = /var\(--nav-h/.test(today + capture) || /\+ 22px \+ 60px/.test(today + capture);
  check("toasts: no hand-summed offsets (the ToastDock owns the place)", !oldToast);

  // Motion: only transform and opacity (and stroke-dashoffset) in the keyframes; no layer is fixed inside the board.
  const bad: string[] = [];
  for (const [f, css] of [["today.css", today], ["capture.css", capture]] as const) {
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
      for (const d of m[2].matchAll(/([a-z-]+)\s*:/g)) if (!["transform", "opacity", "stroke-dashoffset"].includes(d[1])) bad.push(`${f} ${m[1]}: ${d[1]}`);
    }
  }
  check("motion: today.css and capture.css keyframes animate only transform and opacity", bad.length === 0, bad.join("; "));
  check("motion: no infinite animation on the board or the sheet", !/infinite/.test(today + capture));
  check("container: nothing in today.css is position: fixed (the board root is the main container)", !/position:\s*fixed/.test(today));
  check("layers: the capture sheet sits above other sheets", /\.capture-sheet\s*\{[^}]*z-index:\s*calc\(var\(--z-sheet\) \+ 3\)/.test(capture) && /\.scrim\.capture-backdrop\s*\{[^}]*calc\(var\(--z-sheet\) \+ 2\)/.test(capture));

  const row = read("src/components/today/TaskRow.tsx");
  check("a11y: the tick is the kit's checkbox, with no aria-pressed", row.includes("<Tick") && !row.includes("aria-pressed"));
  check("a11y: the price pill says whether its receipt is open, and which", row.includes("expanded={props.receiptOpen}") && row.includes("controls={props.receiptId}"));
  const boardSrc = read("src/components/today/TodayBoard.tsx");
  check("a11y: the receipt sheet carries the id the price pill points at", /<ReceiptSheet[\s\S]*?id=\{receiptIdOf\(/.test(boardSrc));
  check("phone: the first-run hint names the tab bar's +", boardSrc.includes("Tap + in the tab bar"));
  check(
    "undo: Archive and Drop both show an Undo, and Undo is unarchiveTask",
    /function archive[\s\S]*?remove\(/.test(boardSrc) && /choice === "drop"[\s\S]*?remove\(/.test(boardSrc) && /function undoRemoval[\s\S]*?unarchiveTask\(/.test(boardSrc)
  );
  check("undo: the removal's Undo goes to the ToastDock, not a hand-placed toast", boardSrc.includes("pushToast(") && boardSrc.includes("dismissToast("));
  check("day: a tick sends the row's own day, not 'today'/'yesterday'", /completeTask\(row\.template\.id, \{ day: row\.day/.test(boardSrc));
  check("rewards: a tick is Tier 0 through celebrate.mark, a moment Tier 1 through celebrate.chime", boardSrc.includes("mark({") && boardSrc.includes("chime({") && boardSrc.includes('kind: "tick"'));
  check("rewards: a moment needs a tap (never arrival)", boardSrc.includes("MOMENT_WINDOW_MS") && boardSrc.includes("actedAt.current"));
  check("container: the board root opts into the main container", boardSrc.includes("cq-main"));
  const quick = read("src/components/capture/QuickCapture.tsx");
  check("capture: a save sends its line's nonce as the retry key", quick.includes("captureKey: line.nonce"));
  check("capture: the sheet is portalled to <body> under [data-capture-ui]", quick.includes("createPortal(") && quick.includes("data-capture-ui"));
  check("capture: the toast goes to the one ToastDock", quick.includes("pushToast(") && !quick.includes('className="capture-toast"'));
  check("capture: the corner button is gone and the event name stays in components/capture", !exists("src/components/capture/CaptureFab.tsx") && read("src/components/capture/events.ts").includes('"xtnl:capture"'));
  check("escape: QuickCapture joins the layer stack, no document listener of its own", quick.includes("pushEscapeLayer(") && !/document\.addEventListener\("keydown"/.test(quick));
  for (const f of ["src/components/today/ReceiptSheet.tsx", "src/components/today/InboxSheet.tsx", "src/components/today/CloseDaySheet.tsx", "src/components/today/GoalSheets.tsx"]) {
    const src = read(f);
    check(`escape: ${f.split("/").pop()} is the kit's Sheet (one Escape stack, focus trap)`, src.includes("<Sheet") && !/document\.addEventListener\("keydown"/.test(src));
  }
  for (const f of [...tsx, "src/components/today/DayLedger.tsx"]) {
    if (/from "framer-motion"/.test(read(f))) check(`motion: ${f} does not import framer-motion`, false);
  }
  const page = read("src/app/today/page.tsx");
  check("top bar: the date is printed once, by ShellTitle", (page.match(/longDate\(/g) ?? []).length === 1 && page.includes("<ShellTitle") && !page.includes("clock.date"));
  check("top bar: the page renders no <main> or <h1> of its own", !/<main[\s>]/.test(page) && !/<h1[\s>]/.test(page));
  // The footer line is rendered by TodayFooter inside the board from three strings (no server-made JSX crosses into the client tree).
  const foot = read("src/components/today/TodayFooter.tsx");
  check("footer: the clock is live and prints its zone", foot.includes("<LiveClock") && foot.includes("zone={zone}") && page.includes("zone: clock.zone"));
}

// ── Source guards for the review fixes (F1) ───────────────────────────────

{
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const today = strip(read("src/components/today/today.css"));
  const capture = strip(read("src/app/capture.css"));

  // Ticks celebrate: the server diffs a snapshot taken before and after with the tick scope, the board presents.
  const actions = code(read("src/app/actions/tasks.ts"));
  const fnBody = (name: string) => {
    const i = actions.indexOf(`export async function ${name}(`);
    const j = actions.indexOf("export async function", i + 1);
    return i < 0 ? "" : actions.slice(i, j < 0 ? undefined : j);
  };
  for (const name of ["completeTask", "againTask"]) {
    check(`rewards: ${name} runs inside aroundTick with the tick scope and its template`, /aroundTick\(\s*userId,\s*\{ scope: "tick", templateIds: \[templateId\] \}/.test(fnBody(name)));
    check(`rewards: ${name} skips the diff for a double tap's stored answer`, fnBody(name).includes("(v) => !v.duplicate"));
  }
  check("rewards: goalProgress runs inside aroundTick (streak and goals)", /aroundTick\(userId, \{ scope: GOAL_PARTS \}/.test(fnBody("goalProgress")) && /GOAL_PARTS = \["streak", "goals"\]/.test(actions));
  check(
    "rewards: aroundTick snapshots with captureSnapshot and diffs with cause 'tick' through withMoments",
    /withMoments\(\{[\s\S]*captureSnapshot\(userId, snap\)[\s\S]*detectCelebrations\(before, after, \{ cause: "tick" \}\)/.test(actions)
  );
  const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
  const presents = boardSrc.match(/presentAll\(v\.celebrations\)/g) ?? [];
  check(
    "rewards: the board presents the tick's, Again's, a step tick's, a forgotten tick's (yesterday), the goal +1's and a goal close's moments (T2/T3)",
    presents.length === 6 && boardSrc.includes('from "@/components/celebrate/stage"'),
    String(presents.length)
  );
  // The three sections: the streak moved to Character (/you). Its caption is board-ui's streakCaptionOf, fed keptAtOf
  // over Today's own board data by day-cards.ts, and the board itself draws no streak.
  {
    const uiSrc = code(read("src/components/today/board-ui.ts"));
    const cardsSrc = code(read("src/components/home/day-cards.ts"));
    const at = new Date(Date.UTC(2026, 9, 1, 6, 5)).toISOString(); // a first tick; the caption says it in the life zone (hhmmOf)
    const kept = streakCaptionOf({ kept: true, keptAt: at, count: 4 });
    check(
      "streak caption (Character): 'Kept today, 08:05.' from keptAtOf, with the plain line as its fallback, then 'Safe until 04:00.'",
      uiSrc.includes("`Kept today, ${hhmmOf(") &&
        uiSrc.includes('"Kept today."') &&
        /keptAt: kept \? keptAtOf\(data\) : null/.test(cardsSrc) &&
        kept.lead === `Kept today, ${hhmmOf(Date.parse(at))}.` &&
        kept.rest === " Safe until 04:00." &&
        streakCaptionOf({ kept: true, keptAt: null, count: 4 }).lead === "Kept today." &&
        streakCaptionOf({ kept: false, keptAt: null, count: 4 }).rest === "Not kept yet. Any tick or review keeps it." &&
        streakCaptionOf({ kept: false, keptAt: null, count: 0 }).rest === "Any tick or review starts a streak." &&
        !/keptAtOf|<StreakCard|streakCaption/.test(boardSrc),
      JSON.stringify(kept)
    );
  }
  check(
    "asks: the badge's pop-over passes the Ask's clock to the card",
    read("src/components/today/AskBadge.tsx").includes("clock={a.clock}") && read("src/components/today/AskCard.tsx").includes('<Icon name="clock"')
  );

  // Next up: the focus line wraps inside the card; the estimate is the hub's; the action is full width without `block`.
  const nextUp = code(read("src/components/today/NextUp.tsx"));
  check("next up: the focus line is not the nowrap .cur (it wraps inside the card)", nextUp.includes('className="focus-what"') && !/className="cur">\s*<Sigil track="know"/.test(nextUp));
  const focusRule = /\.today-hero \.focus-what\s*\{([^}]*)\}/.exec(today)?.[1] ?? "";
  check("next up: .focus-what can shrink and wrap (min-width 0, never nowrap)", /min-width:\s*0/.test(focusRule) && !/nowrap/.test(focusRule) && /flex-wrap:\s*wrap/.test(/\.today-hero \.focus-line\s*\{([^}]*)\}/.exec(today)?.[1] ?? ""));
  check("next up: the quest card states the hub's estimate", nextUp.includes("about {questMinutesOf(next)} min"));

  // Class names: none of L1's may also be a Tailwind utility (the utilities layer wins: `block`, `ring`, `grow`…).
  // The bare-word utilities of Tailwind v4.3 (its design system's class list), plus the display/position ones with a dash.
  const TW = new Set(
    "absolute antialiased block border capitalize collapse container contents fixed flex grayscale grid grow hidden inline invert invisible isolate italic lowercase ordinal outline overline relative resize ring sepia shadow shrink static sticky table transform transition truncate underline uppercase visible inline-block inline-flex inline-grid inline-table flow-root list-item table-cell table-row line-through no-underline not-italic normal-case".split(
      " "
    )
  );
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((n) => {
      const p = `${dir}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
    });
  const files = [...walk("src/components/today"), ...walk("src/components/capture"), ...walk("src/app/today"), ...walk("src/app/dev/style/today"), "src/app/capture.css"];
  const clashes: string[] = [];
  for (const f of files) {
    const src = read(f);
    const names: string[] = [];
    if (f.endsWith(".css")) for (const m of strip(src).matchAll(/\.([a-zA-Z][\w-]*)/g)) names.push(m[1]);
    else {
      for (const m of src.matchAll(/className=\{?["'`]([^"'`]*)["'`]/g)) names.push(...m[1].split(/\s+/));
      for (const m of src.matchAll(/cx\(([^)]*)\)/g)) for (const s of m[1].matchAll(/["'`]([^"'`]*)["'`]/g)) names.push(...s[1].split(/\s+/));
    }
    for (const n of names) if (TW.has(n)) clashes.push(`${f}: .${n}`);
  }
  check("class names: none of L1's is also a Tailwind utility (block, ring, grow, contents…)", clashes.length === 0, clashes.join("; "));

  // Capture: the in-sheet word-hint strip is L5's .wc-bar now.
  check("capture: the word-hint margin targets .wc-bar (not the retired .word-hints)", /\.capture-sheet \.wc-bar:not\(\[data-floating\]\)\s*\{/.test(capture) && !/\.word-hints/.test(capture));

  // Inputs: 16 px on phones (base.css's rule is in @layer base, which this layer beats).
  check("inputs: .today-input is 16 px under 600 px", /@media \(max-width: 599px\)\s*\{\s*\.today-input\s*\{\s*font-size:\s*16px/.test(today));

  // Footer: the rules link is a 40 px target.
  check("touch target: the footer's rules link ≥ 40px", (cssValue(today, ".today-board .foot-note .foot-link", "min-height") ?? 0) >= 40 && read("src/components/today/TodayFooter.tsx").includes('className="foot-link"'));
}

// ═══ Goals on Today (M5 phase B, m5-refit F15) ════════════════════════════
// Close only once life counts (a close before launch would write a permanent
// paid-nothing row); Reschedule for a goal carried past its due day, before
// and after launch (it writes no MP); the Carried copy; the Close sheet's
// exact figure and why.

{
  const late = tpl({ id: "gl", title: "Ship the paper", kind: "GOAL", horizon: "MID", krMetric: "CHILDREN", dueDay: addDays(TODAY, -5), track: "CRAFT", goalMp: 6 });
  const kids = [
    tpl({ id: "gl1", title: "Outline", parentId: "gl", completedAt: "2026-09-20T00:00:00.000Z" }),
    tpl({ id: "gl2", title: "Draft", parentId: "gl" }),
    tpl({ id: "gl3", title: "Edit", parentId: "gl" }),
    tpl({ id: "gl4", title: "Submit", parentId: "gl" }),
  ];
  const short = tpl({ id: "gs", title: "File the tax return", kind: "GOAL", horizon: "SHORT", krMetric: "CHILDREN", dueDay: addDays(TODAY, 9), goalMp: 1 });
  const shortKid = tpl({ id: "gs1", title: "Gather receipts", parentId: "gs", completedAt: "2026-09-29T00:00:00.000Z" });
  const closed = tpl({ id: "gc", title: "Closed goal", kind: "GOAL", horizon: "LONG", closedScore: 0.8, completedAt: "2026-09-30T00:00:00.000Z" });
  const b = buildBoard(board(TODAY, [late, ...kids, short, shortKid, closed]));
  const lateCard = b.goals.MID.find((g) => g.template.id === "gl")!;
  const shortCard = b.goals.SHORT.find((g) => g.template.id === "gs")!;

  const before = goalCardCopy(lateCard, false);
  const after = goalCardCopy(lateCard, true);
  check("goal copy: carried before launch is 'Carried 0.25 · Reschedule?'", before.carried === "Carried 0.25 · Reschedule?", before.carried ?? "null");
  check("goal copy: carried once life counts is 'Carried 0.25 · Reschedule or close?'", after.carried === "Carried 0.25 · Reschedule or close?", after.carried ?? "null");
  check("goal copy: a goal not past due carries nothing", goalCardCopy(shortCard, true).carried === null);
  check("goal copy: Close only once life counts", !before.canClose && after.canClose);
  check("goal copy: no stated MP before launch", before.pays === null);
  check(
    "goal copy: from launch, the stated rule: Short 'pays ⬡ 1 when done', Mid 'pays ⬡ 6 × progress from 70%'",
    goalCardCopy(shortCard, true).pays === "pays ⬡ 1 when done" && after.pays === "pays ⬡ 6 × progress from 70%",
    `${goalCardCopy(shortCard, true).pays} / ${after.pays}`
  );
  check("goal copy: the stated MP is the goal's own, frozen (goalMp 4 reads ⬡ 4)", goalCardCopy({ ...lateCard, template: { ...lateCard.template, goalMp: 4 } }, true).pays === "pays ⬡ 4 × progress from 70%");
  check("goal copy: a goal from before goalMp was stated reads its horizon's rule", goalCardCopy({ ...lateCard, template: { ...lateCard.template, goalMp: null } }, true).pays === "pays ⬡ 6 × progress from 70%");
  check("goal copy: the track is named beside its sigil", after.track === "Craft" && after.horizon === "Mid");
  check("goal copy: Carried rounds down (0.559 → 0.55, never 0.56)", carriedFigure(0.559) === "0.55" && carriedFigure(0.29) === "0.29");

  const render = (launched: boolean) =>
    renderToStaticMarkup(createElement(GoalsStrip, { goals: b.goals, busy: false, onProgress: () => {}, launched, onClose: () => {}, onReschedule: () => {} }));
  const pre = render(false);
  const post = render(true);
  const closeBtn = /aria-label="Close [^"]*"/g;
  check("goal strip: no Close button before launch", (pre.match(closeBtn) ?? []).length === 0, String((pre.match(closeBtn) ?? []).length));
  check("goal strip: a Close button per open goal once life counts", (post.match(closeBtn) ?? []).length === 2, String((post.match(closeBtn) ?? []).length));
  const reschedBtn = /aria-label="Reschedule Ship the paper"/;
  check("goal strip: Reschedule on the carried goal, before and after launch", reschedBtn.test(pre) && reschedBtn.test(post) && !/aria-label="Reschedule File the tax return"/.test(post));
  check("goal strip: the Carried line, before and after launch", pre.includes("Carried 0.25 · Reschedule?") && post.includes("Carried 0.25 · Reschedule or close?"));
  check("goal strip: before launch it says the steps pay; from launch it states the goal's MP", pre.includes("pays through its steps") && !pre.includes("× progress") && post.includes("× progress from 70%") && !post.includes("pays through its steps"));
  check("goal strip: the closed goal is not drawn", !pre.includes("Closed goal") && !post.includes("Closed goal"));
  check("goal strip: the percentage is floored (1 of 4 → 25%; 1 of 1 → 100%)", post.includes(">25%<") && post.includes(">100%<"));
  check("goal strip: each goal shows its track's sigil (Craft, Duty)", post.includes('href="#s-craft"') && post.includes('href="#s-duty"'));
  const noClose = renderToStaticMarkup(createElement(GoalsStrip, { goals: b.goals, busy: false, onProgress: () => {}, launched: false }));
  check("goal strip: without the handlers it offers neither control", !/aria-label="(Close|Reschedule) /.test(noClose));

  // /dev/style/today shows the launched card: the stated MP, Close, and a goal carried past its due day.
  const fixtures = read("src/app/dev/style/today/TodayFixtures.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(
    "fixture: /dev/style/today passes launched with no-op onClose and onReschedule, and no payoutOf (GoalsStrip has none)",
    /<GoalsStrip goals=\{board\.goals\}[^\n]*? launched onClose=\{\(\) => undefined\} onReschedule=\{\(\) => undefined\} \/>/.test(fixtures) &&
      !/payoutOf/.test(fixtures) &&
      !/payoutOf/.test(read("src/components/today/GoalsStrip.tsx"))
  );
  const fixtureHtml = renderToStaticMarkup(createElement(GoalsStrip, { goals: fixtureBoard().goals, busy: false, onProgress: () => {}, launched: true, onClose: () => {}, onReschedule: () => {} }));
  check(
    "fixture: its board has a past-due goal, so the Carried row, Reschedule and Close all render",
    fixtureHtml.includes("Carried 0.50 · Reschedule or close?") && /aria-label="Reschedule Clear out the garage"/.test(fixtureHtml) && (fixtureHtml.match(/aria-label="Close [^"]*"/g) ?? []).length === 3,
    String((fixtureHtml.match(/aria-label="Close [^"]*"/g) ?? []).length)
  );

  // The Close sheet: the exact figure closing now pays, and why.
  const payout = (p: Partial<GoalPayout>): GoalPayout => ({ horizon: "MID", track: "CRAFT", reason: "GOAL_MID", stated: 6, bar: 0.7, scaled: 4.8, g: 0.8, pays: 4.8, why: null, depth: 1, ...p });
  const full = goalCloseCopy(payout({}));
  check(
    "close sheet: 'Closing now pays ⬡ 4.8', its basis and depth, 'Close and take ⬡ 4.8'",
    full.head === "Closing now pays ⬡ 4.8" && full.why === null && full.basis === "80% done · pays ⬡ 6 × progress from 70%" && full.depth === "Craft depth +1" && full.confirm === "Close and take ⬡ 4.8",
    JSON.stringify(full)
  );
  const below = goalCloseCopy(payout({ g: 0.6923, scaled: 4.15, pays: 0, why: "below 70%", depth: 0 }));
  check("close sheet: below the bar it pays 0 and says why ('below 70%'), 69% floored", below.head === "Closing now pays 0" && below.why === "below 70%" && below.basis?.startsWith("69% done") === true && below.confirm === "Close for 0" && below.depth === null, JSON.stringify(below));
  const trimmed = goalCloseCopy(payout({ horizon: "SHORT", reason: "GOAL_SHORT", stated: 1, bar: 1, scaled: 1, g: 1, pays: 0.5, why: "the week's life MP cap", depth: 0 }));
  check("close sheet: a trimmed Short close states the trimmed figure and the cap", trimmed.head === "Closing now pays ⬡ 0.5" && trimmed.why === "the week's life MP cap" && trimmed.basis === "100% done · pays ⬡ 1 when done");
  const unmeasured = goalCloseCopy(payout({ g: null, scaled: 0, pays: 0, why: "not measured", depth: 0 }));
  check("close sheet: an unmeasured goal says so", unmeasured.basis?.startsWith("not measured · ") === true && unmeasured.why === "not measured");
  const gone = goalCloseCopy(null);
  check("close sheet: a goal no longer open offers no Confirm", gone.confirm === null && gone.head === "This goal is already closed.");
  check(
    "close sheet: closing is final and settled once, a close for 0 included (never 'paid once' above a 'Close for 0')",
    GOAL_CLOSE_FINAL === "Closing is final. The goal leaves Today and is settled once, even when it pays 0; its steps stay where they are." && !GOAL_CLOSE_FINAL.includes("paid once"),
    GOAL_CLOSE_FINAL
  );
  check("close notice: the paid figure, its unit a word ('It paid 4.8 MP')", goalClosedNotice("Ship the paper", payout({}), { paid: 4.8, why: null }) === "Ship the paper closed. It paid 4.8 MP.");
  check(
    "close notice: when the close paid other than the sheet said, it says both",
    goalClosedNotice("Ship the paper", payout({}), { paid: 3, why: "the week's life MP cap" }) === "Ship the paper closed. It paid 3 MP, not 4.8 MP: the week's life MP cap. Something changed after the sheet opened."
  );
  check("close notice: paid 0 says why", goalClosedNotice("X", payout({ pays: 0, why: "below 70%" }), { paid: 0, why: "below 70%" }) === "X closed. It paid 0: below 70%.");
  check(
    "close notice: a close that paid where the sheet said 0 states both ('It paid 1 MP, not 0')",
    goalClosedNotice("X", payout({ pays: 0, why: "below 70%" }), { paid: 1, why: null }) === "X closed. It paid 1 MP, not 0. Something changed after the sheet opened."
  );
  // Notices are plain text in a role=status line: no '⬡' glyph in any of them (redesign: Unicode glyph icons are removed).
  const glyphNotices: string[] = [];
  for (const shown of [null, payout({}), payout({ pays: 0, why: "below 70%" }), payout({ pays: 0.5 })]) {
    for (const paid of [0, 0.5, 1, 3, 4.8, 18]) {
      const line = goalClosedNotice("Goal", shown, { paid, why: paid === 0 ? "below 70%" : null });
      if (line.includes("⬡") || (paid > 0 && !line.includes(" MP"))) glyphNotices.push(line);
    }
  }
  check("close notice: no '⬡' in any close notice, and every paid figure carries ' MP'", glyphNotices.length === 0, glyphNotices.slice(0, 2).join(" | "));

  // Reschedule: today to ten years out, a week ahead to start; the server's own refusals.
  const range = goalRescheduleRange(TODAY);
  check("reschedule: today to ten years out, starting a week ahead", range.min === TODAY && range.max === addDays(TODAY, 3650) && range.initial === addDays(TODAY, 7));
  check(
    "reschedule: yesterday, past ten years and a blank day are refused as the server does",
    goalRescheduleError(addDays(TODAY, -1), TODAY) === "Pick today or a later day." && goalRescheduleError(addDays(TODAY, 3651), TODAY) === "Pick a day within ten years." && goalRescheduleError("", TODAY) === "Pick a day." && goalRescheduleError(TODAY, TODAY) === null
  );
  check("reschedule: the notice names the new day", goalRescheduledNotice("Ship the paper", addDays(TODAY, 1), TODAY) === "Ship the paper is now due tomorrow. Nothing else changed.");

  // Wiring (source): Close reads previewGoalClose, Confirm is closeGoal with a refresh and its moments presented;
  // Reschedule is rescheduleGoal; the page passes launched and judges weeks in an after() of its own.
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
  const fn = (name: string) => {
    const i = boardSrc.indexOf(`function ${name}(`);
    const j = boardSrc.indexOf("\n  function ", i + 1);
    return i < 0 ? "" : boardSrc.slice(i, j < 0 ? undefined : j);
  };
  check("wiring: Close opens only once life counts, on previewGoalClose's figure", /if \(!launched\) return;/.test(fn("openGoalClose")) && fn("loadGoalPreview").includes("previewGoalClose(goalId)"));
  check("wiring: the strip gets Close only when launched", boardSrc.includes("onClose={launched ? openGoalClose : undefined}") && boardSrc.includes("launched={launched}"));
  check(
    "wiring: Confirm is closeGoal({ refresh: true }) and presents its moments like a tick",
    fn("confirmGoalClose").includes("closeGoal(target.id, REFRESH)") && fn("confirmGoalClose").includes("presentAll(v.celebrations)")
  );
  check("wiring: a refused close stays in the sheet with a fresh figure", /if \(!res\.ok\)[\s\S]*?loadGoalPreview\(target\.id\)/.test(fn("confirmGoalClose")));
  check("wiring: a preview that comes back null (closed elsewhere) refreshes the board", /if \(res\.ok && res\.value === null\) router\.refresh\(\);/.test(fn("loadGoalPreview")));
  const goalsSrv = read("src/lib/goals-server.ts");
  check(
    "wiring: a close refused 'Already closed.' refreshes the board, so the card and its Close chip leave the strip",
    GOAL_ALREADY_CLOSED === "Already closed." &&
      /if \(error === GOAL_ALREADY_CLOSED\) router\.refresh\(\);/.test(fn("confirmGoalClose")) &&
      /closed \? GOAL_ALREADY_CLOSED :/.test(goalsSrv) &&
      /isDuplicateActivity\(err\)\) return \{ ok: false, error: GOAL_ALREADY_CLOSED \}/.test(goalsSrv)
  );
  // Focus after a close: the closed card (and the chip that opened the sheet) leaves the strip.
  check(
    "focus: after a close, the next goal drawn after it, else the one before, else none (the heading)",
    typeof goalAfterClose === "function" &&
      goalAfterClose(["a", "b", "c"], "b") === "c" &&
      goalAfterClose(["a", "b", "c"], "c") === "b" && goalAfterClose(["a", "b", "c"], "a") === "b" && goalAfterClose(["a"], "a") === null && goalAfterClose([], "a") === null && goalAfterClose(["a", "b"], "z") === "a"
  );
  check(
    "focus: a successful close records the next goal before the sheet shuts, and an effect focuses its Close chip or the Goals heading",
    /setFocusAfterClose\(\{ next: goalAfterClose\(drawn, target\.id\) \}\);\s*setGoalClose\(\(c\) => \(c && c\.id === target\.id \? \{ \.\.\.c, open: false \} : c\)\);/.test(fn("confirmGoalClose")) &&
      /querySelector<HTMLElement>\(GOAL_CLOSE_CHIP\) \?\? document\.getElementById\(GOALS_HEADING_ID\)/.test(boardSrc) &&
      /requestAnimationFrame\(/.test(boardSrc.slice(Math.max(0, boardSrc.indexOf("if (!focusAfterClose) return;"))))
  );
  check("focus: the Goals heading can take focus (tabindex -1) and each Close chip is marked", post.includes('id="goals-h" tabindex="-1"') && (post.match(/data-goal-close=""/g) ?? []).length === 2);
  // Every notice the board shows is plain text: no '⬡' literal in a setNotice call, and the notice helpers it calls have none.
  const noticeArgs: string[] = [];
  for (let i = boardSrc.indexOf("setNotice("); i >= 0; i = boardSrc.indexOf("setNotice(", i + 1)) {
    let depth = 0;
    let j = i + "setNotice".length;
    for (; j < boardSrc.length; j++) {
      if (boardSrc[j] === "(") depth++;
      else if (boardSrc[j] === ")" && --depth === 0) break;
    }
    noticeArgs.push(boardSrc.slice(i, j + 1));
  }
  const helpers = new Set(noticeArgs.flatMap((a) => [...a.slice("setNotice(".length).matchAll(/\b(\w+Notice)\(/g)].map((m) => m[1])));
  const uiSrc = code(read("src/components/today/board-ui.ts"));
  const bodyOf = (name: string) => {
    const i = uiSrc.indexOf(`export function ${name}(`);
    const j = uiSrc.indexOf("\nexport ", i + 1);
    return i < 0 ? "" : uiSrc.slice(i, j < 0 ? undefined : j);
  };
  check(
    "notices: no string setNotice receives contains '⬡' (literals, and the helpers goalClosedNotice and goalRescheduledNotice)",
    noticeArgs.length >= 6 &&
      noticeArgs.every((a) => !a.includes("⬡")) &&
      [...helpers].every((h) => bodyOf(h).length > 0 && !bodyOf(h).includes("⬡")) &&
      helpers.has("goalClosedNotice") &&
      helpers.has("goalRescheduledNotice"),
    `${noticeArgs.length} calls; helpers ${[...helpers].join(", ")}`
  );
  // The kit Sheet's dismiss button is named by closeLabel; the Close-goal sheet calls it 'Cancel'.
  const sheetSrc = code(read("src/components/ui/Sheet.tsx"));
  const goalSheets = code(read("src/components/today/GoalSheets.tsx"));
  check(
    "close sheet: the kit Sheet takes closeLabel (default 'Close') and the Close-goal sheet's dismiss reads 'Cancel'",
    /closeLabel\?: string;/.test(sheetSrc) &&
      /closeLabel = "Close"/.test(sheetSrc) &&
      /<IconButton icon="x" label=\{closeLabel\}/.test(sheetSrc) &&
      /export function GoalCloseSheet[\s\S]*?<Sheet[\s\S]*?closeLabel="Cancel"[\s\S]*?<\/Sheet>[\s\S]*?export function GoalRescheduleSheet/.test(goalSheets) &&
      (goalSheets.match(/closeLabel=/g) ?? []).length === 1
  );
  check("wiring: Reschedule is rescheduleGoal with the picked day and a refresh", fn("saveGoalResched").includes("rescheduleGoal(target.id, day, REFRESH)"));
  check("wiring: the Close and Reschedule sheets are the kit's Sheet", read("src/components/today/GoalSheets.tsx").split("<Sheet").length === 3);
  const page = code(read("src/app/today/page.tsx"));
  check("page: launched is isLaunched(today)", page.includes("launched={isLaunched(day)}") && page.includes('from "@/lib/life-economy"'));
  // M2 (F5, F12): settlement then the week judge, in one single-flight chain (maybeMaintainLife), replaces the bare judge.
  check(
    "page: settlement and the week judge run in maybeMaintainLife's own after(), never awaited by the render",
    /after\(\(\) => maybeMaintainLife\(userId\)\);/.test(page) && page.includes('from "@/lib/settlement"') && !page.includes("maybeJudgeWeeks")
  );

  // Targets and type.
  const css = read("src/components/today/today.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("touch target: the goal actions (Reschedule, Close) are 40 px chips at least 44 wide", (cssValue(css, ".today-goals .goal-acts .btn-chip", "min-width") ?? 0) >= 44 && read("src/components/today/GoalsStrip.tsx").includes("<ChipButton"));
}

// ═══ The capture sheet (capture.md, lane B) ═══════════════════════════════
// Today is Thu 1 Oct 2026 throughout, as in capture.md's examples.

/** A saved capture as the server answers it. */
function capItem(p: Partial<CapturedItem> & { id: string; title: string }): CapturedItem {
  return {
    projectedXp: 8.3,
    describe: "",
    kind: "TASK",
    mode: "TASK",
    doneNow: false,
    doneNowError: null,
    duplicate: false,
    href: null,
    where: { lane: "anytime", label: "Anytime" },
    ...p,
  };
}

function addedEntry(id: string, at: number, line = { text: `line ${id}`, reverted: [] as { start: number; end: number }[] }): AddedEntry {
  return { key: `k-${id}`, item: capItem({ id, title: `Title ${id}` }), line, at };
}

// ── Burst capture: what one press does (enterAction) ──────────────────────

{
  const expected = (coarse: boolean, shift: boolean, composing: boolean, source: EnterSource, done: boolean): EnterAction => {
    if (source === "button") return "save-close";
    if (coarse) return composing ? "wait-composition" : done ? "close" : "save-stay";
    if (composing) return "ignore";
    return shift ? "save-stay" : "save-close";
  };
  const wrong: string[] = [];
  let n = 0;
  for (const coarse of [false, true])
    for (const shift of [false, true])
      for (const composing of [false, true])
        for (const source of ["key", "submit", "button"] as EnterSource[])
          for (const done of [false, true]) {
            n++;
            const got = enterAction({ coarse, shift, composing, source, done });
            if (got !== expected(coarse, shift, composing, source, done))
              wrong.push(`${coarse ? "coarse" : "fine"}/${shift ? "shift" : "-"}/${composing ? "ime" : "-"}/${source}/${done ? "done" : "-"}=${got}`);
          }
  check(`enter: the whole table (coarse × shift × composing × key/submit/button × Done, ${n} rows)`, n === 48 && wrong.length === 0, wrong.join("; "));
  // U12: after a burst the line is empty and the primary reads Done; the action key does what Done does.
  const burstDone = primaryAction({ editing: false, coarse: true, empty: true, sentThisOpening: 3, parsed: null }).done;
  check(
    "enter: after a burst, the action key on the empty line closes the sheet (Done), by keydown or the form's submit",
    burstDone && enterAction({ coarse: true, shift: false, composing: false, source: "key", done: burstDone }) === "close" && enterAction({ coarse: true, shift: false, composing: false, source: "submit", done: burstDone }) === "close"
  );
  check(
    "enter: Done never closes from a desktop Enter, mid-composition, or while editing",
    enterAction({ coarse: false, shift: false, composing: false, source: "key", done: true }) === "save-close" &&
      enterAction({ coarse: true, shift: false, composing: true, source: "submit", done: true }) === "wait-composition" &&
      !primaryAction({ editing: true, coarse: true, empty: true, sentThisOpening: 3, parsed: null }).done
  );
  check("enter: desktop Enter saves and closes", enterAction({ coarse: false, shift: false, composing: false, source: "key" }) === "save-close");
  check("enter: desktop Shift+Enter saves and stays", enterAction({ coarse: false, shift: true, composing: false, source: "key" }) === "save-stay");
  check("enter: a desktop Telex commit is not a submit", enterAction({ coarse: false, shift: false, composing: true, source: "key" }) === "ignore");
  check("enter: the phone's action key saves and stays (keydown or the form's submit)", enterAction({ coarse: true, shift: false, composing: false, source: "key" }) === "save-stay" && enterAction({ coarse: true, shift: false, composing: false, source: "submit" }) === "save-stay");
  check("enter: the phone's action key mid-composition waits for compositionend", enterAction({ coarse: true, shift: false, composing: true, source: "submit" }) === "wait-composition");
  check("enter: Add (and To Inbox) always saves and closes", enterAction({ coarse: true, shift: false, composing: true, source: "button" }) === "save-close");

  check("enter: a second submit inside 300 ms is the same press", SUBMIT_GUARD_MS === 300 && !submitAllowed(1_000, 1_299) && submitAllowed(1_000, 1_300) && submitAllowed(0, 1_000));
  // The press that saved the last line must not also close (its keydown and the form's submit can both arrive).
  const quickSrc = read("src/components/capture/QuickCapture.tsx");
  check(
    "enter wiring: the action key's close goes through the 300 ms guard and closes as Done",
    /const closeFromKey = \(\) => \{[\s\S]*?submitAllowed\(lastSubmitAt\.current, now\)[\s\S]*?closeSheet\("done"\)/.test(quickSrc) &&
      (quickSrc.match(/if \(action === "close"\) \{\s*closeFromKey\(\);/g) ?? []).length === 2 &&
      /const primaryIsDone = \(\) => !paste && primaryAction\(/.test(quickSrc)
  );

  const p = (over: Partial<Parameters<typeof primaryAction>[0]>) =>
    primaryAction({ editing: false, coarse: true, empty: true, sentThisOpening: 0, parsed: null, ...over });
  check("primary: a phone with an empty line after a line went reads Done and only closes", p({ sentThisOpening: 1 }).label === "Done" && p({ sentThisOpening: 1 }).done);
  check("primary: no Done before anything went in this opening", p({}).label === "Add" && !p({}).done);
  check("primary: no Done on a desktop (Shift+Enter bursts close with Esc)", !p({ coarse: false, sentThisOpening: 3 }).done);
  check("primary: while editing it reads Save change, even on an empty line", p({ editing: true, sentThisOpening: 2 }).label === "Save change" && !p({ editing: true, sentThisOpening: 2 }).done);
  const parsedOf = (t: string) => parseCapture(t, { today: TODAY });
  check("primary: names what Add does (Inbox, goal, done)", p({ empty: false, parsed: parsedOf("did it rain?") }).label === "Add to Inbox" && p({ empty: false, parsed: parsedOf("goal: run a marathon") }).label === "Add goal" && p({ empty: false, parsed: parsedOf("x run 30m") }).label === "Add as done" && p({ empty: false, parsed: parsedOf("buy milk") }).label === "Add");
  check("footer: the touch hint", TOUCH_HINT === "Enter adds the next line · Add closes");
  check("legend: it mentions the one-box idea form", LEGEND.includes("idea: Q :: A"));
}

// ── 'Added here': the list, the dock's choice on close ────────────────────

{
  const t0 = 1_000_000;
  let s = addedReducer([], { type: "add", entry: addedEntry("a", t0) });
  s = addedReducer(s, { type: "add", entry: addedEntry("b", t0 + 1_000) });
  check("added: newest first", s.map((e) => e.item.id).join(",") === "b,a");
  s = addedReducer(s, { type: "add", entry: addedEntry("a", t0 + 2_000) });
  check("added: one row per capture (a retry's answer does not add a second)", s.map((e) => e.item.id).join(",") === "a,b");
  const replaced = addedReducer(s, { type: "replace", oldId: "b", entry: addedEntry("c", t0 + 3_000) });
  check("added: an edit's row takes the old capture's place", replaced.map((e) => e.item.id).join(",") === "c,a");
  const dropped = addedReducer(s, { type: "drop", id: "b" });
  check("added: a capture an edit replaced elsewhere ('gone') leaves the list, never as 'Removed'", dropped.map((e) => e.item.id).join(",") === "a" && !dropped.some((e) => e.removedAt !== undefined));

  const undone = addedReducer(s, { type: "removed", id: "b", now: t0 + 5_000 });
  const b = undone.find((e) => e.item.id === "b");
  check("added: Undo turns the row into 'Removed' (it stays for a moment)", !!b && b.removedAt === t0 + 5_000 && !canEditEntry(b, t0 + 5_000));
  check("added: the removed row goes after 4 s", REMOVED_SHOW_MS === 4_000 && addedReducer(undone, { type: "prune", now: t0 + 5_000 + 3_999 }).some((e) => e.item.id === "b") && !addedReducer(undone, { type: "prune", now: t0 + 5_000 + 4_000 }).some((e) => e.item.id === "b"));
  const one = [addedEntry("x", t0)];
  check("added: pruned at 10 minutes (CAPTURE_UNDO_MS), when Edit and Undo stop", CAPTURE_UNDO_MS === 600_000 && addedReducer(one, { type: "prune", now: t0 + 599_999 }).length === 1 && addedReducer(one, { type: "prune", now: t0 + 600_000 }).length === 0);
  check("added: Edit and Undo are offered under 10 minutes only", canEditEntry(one[0], t0 + 599_999) && !canEditEntry(one[0], t0 + 600_000));
  check("added: the next expiry is the earliest row's (one timer)", nextPruneAt([addedEntry("x", t0), { ...addedEntry("y", t0 - 50_000), removedAt: t0 }]) === t0 + REMOVED_SHOW_MS && nextPruneAt([]) === null);
  let many: AddedEntry[] = [];
  for (let i = 0; i < ADDED_MAX + 5; i++) many = addedReducer(many, { type: "add", entry: addedEntry(`m${i}`, t0 + i) });
  check(`added: capped at ${ADDED_MAX}, the oldest dropped`, many.length === ADDED_MAX && many[0].item.id === `m${ADDED_MAX + 4}` && !many.some((e) => e.item.id === "m0"));
  const five = Array.from({ length: 7 }, (_, i) => i);
  check("added: 3 rows under 600 px, then '+N more'", visibleAdded(five, false, false).shown.length === 3 && visibleAdded(five, false, false).more === 4);
  check("added: 5 rows from 600 px", visibleAdded(five, true, false).shown.length === 5 && visibleAdded(five, true, false).more === 2);
  check("added: '+N more' shows them all", visibleAdded(five, false, true).shown.length === 7 && visibleAdded(five, false, true).more === 0);
  check("added: the live sentence", addedAnnouncement("Pay rent", "Planned later · Fri 2 Oct", 2) === "Added Pay rent → Planned later · Fri 2 Oct. 2 added.");
  const row = addedRowCopy(capItem({ id: "r", title: "Gym", where: { lane: "upcoming", label: "Habits · next Mon" }, projectedXp: 21 }));
  check("added: a row is title · where · ≈ price", row.title === "Gym" && row.where === "Habits · next Mon" && row.figure === "≈ 21", JSON.stringify(row));
  check("added: a ticked row shows what the tick paid, exactly", addedRowCopy(capItem({ id: "d", title: "Run", doneNow: true, projectedXp: 8.3 })).figure === "+8.3");
  check("added: a goal or an idea draft shows no price", addedRowCopy(capItem({ id: "g", title: "Get fit", kind: "GOAL", projectedXp: 0 })).figure === null && addedRowCopy(capItem({ id: "i", title: "Q", kind: "IDEA_DRAFT", projectedXp: 5 })).figure === null);

  check("dock: nothing added, nothing new", dockToastChoice(0) === "none");
  check("dock: one line keeps today's toast with Undo", dockToastChoice(1) === "single");
  check("dock: two or more say 'N added' with Show", dockToastChoice(2) === "summary" && dockToastChoice(7) === "summary");
  const sum = summaryCopy(["Buy milk", "Eggs", "Bread"]);
  check("dock: 'N added', the titles joined with ' · '", sum.title === "3 added" && sum.body === "Buy milk · Eggs · Bread");
  const long = summaryCopy(Array.from({ length: 12 }, (_, i) => `A fairly long task title ${i}`));
  check("dock: the joined titles are cut to fit, with an ellipsis", long.body.length <= SUMMARY_BODY_MAX && long.body.endsWith("…"));
}

// ── Edit a line just saved ────────────────────────────────────────────────

{
  const t0 = 2_000_000;
  const spans = [{ start: 6, end: 9 }];
  const entry = addedEntry("e", t0, { text: "meet sat team mon", reverted: spans });
  const fill = editFill("", entry, t0 + 1_000);
  check("edit: fills an empty line with the exact text that was sent", fill.ok && fill.text === "meet sat team mon" && fill.caret === "meet sat team mon".length);
  check("edit: the reverted spans come back verbatim (a copy, not the stored array)", fill.ok && JSON.stringify(fill.reverted) === JSON.stringify(spans) && fill.reverted !== spans && fill.reverted[0] !== spans[0]);
  check("edit: a line with text is left alone ('Finish or clear the line first.')", !editFill("half typed", entry, t0).ok && (editFill("half typed", entry, t0) as { reason: string }).reason === "busy" && EDIT_BUSY_NOTE === "Finish or clear the line first.");
  check("edit: a line of spaces counts as empty", editFill("   ", entry, t0).ok);
  check("edit: not past 10 minutes", !editFill("", entry, t0 + 600_000).ok && (editFill("", entry, t0 + 600_000) as { reason: string }).reason === "expired");
  check("edit: not on an undone row", !editFill("", { ...entry, removedAt: t0 + 10 }, t0 + 20).ok);
  const pending = stampLine({ text: "gym mon, wed", reverted: [] }, 7, t0, "ab12cd", "tpl_123");
  check("edit: the pending entry carries replaces:<oldId>", pending.replaces === "tpl_123" && /^[A-Za-z0-9:_-]{4,64}$/.test(pending.nonce));
  const back = parsePendingList(JSON.parse(JSON.stringify([pending])));
  check("edit: replaces survives the trip through storage (a retry after a reload repeats the recapture)", back.length === 1 && back[0].replaces === "tpl_123" && back[0].nonce === pending.nonce && back[0].text === "gym mon, wed");
  check("edit: a new line carries no replaces", stampLine({ text: "x", reverted: [] }, 1, t0, "zz").replaces === undefined);
  check("edit: a malformed replaces is dropped, never sent", stampLine({ text: "x", reverted: [] }, 1, t0, "zz", "bad id!").replaces === undefined && parsePendingList([{ ...pending, replaces: "<script>" }])[0].replaces === undefined);
  const nonces = new Set(Array.from({ length: 50 }, (_, i) => stampLine({ text: "x", reverted: [] }, i, t0, "same").nonce));
  check("edit: every stamped line has its own nonce", nonces.size === 50);
  check("pending: malformed entries are dropped, a valid one passes", parsePendingList([null, 3, { text: "a" }, { text: "", nonce: "abcd", at: 1 }, { text: "ok", nonce: "abcd", at: 1 }]).map((p) => p.text).join() === "ok" && parsePendingList("nope").length === 0);
  check("edit: the too-late copy", EDIT_TOO_LATE === "Too late to edit (10 min). Save it as a new line?");
}

// ── An edit on its way locks its capture (C1: never two rows, never a double tick) ──

{
  const t0 = 3_000_000;
  const x = addedEntry("x", t0, { text: "x run 30m", reverted: [] });
  const y = addedEntry("y", t0);
  const sending = replacingOf([{ replaces: "x", state: "sending" }]);
  const refused = editFill("", x, t0 + 1_000, sending);
  check(
    "edit lock: Edit is refused while an edit of that entry is pending (a second edit would write a second row)",
    !refused.ok && refused.reason === "pending" && editRefusalNote("pending", sending.get("x")) === EDIT_SAVING_NOTE && EDIT_SAVING_NOTE === "Saving the edit…"
  );
  check("edit lock: the pending reason wins over a busy line", (editFill("half typed", x, t0, sending) as { reason: string }).reason === "pending");
  check("edit lock: other captures are untouched, and once the edit settles Edit is offered again", editFill("", y, t0 + 1_000, sending).ok && editFill("", x, t0 + 1_000, replacingOf([])).ok);
  const mixed = replacingOf([
    { replaces: "a", state: "queued" },
    { replaces: "b", state: "failed" },
    { replaces: "c", state: "failed" },
    { replaces: "c", state: "sending" },
    { state: "queued" },
  ]);
  check(
    "edit lock: queued and in-flight edits say 'Saving the edit…', a failed one says it waits below, a new line locks nothing",
    mixed.get("a") === EDIT_SAVING_NOTE && mixed.get("b") === EDIT_UNSAVED_NOTE && mixed.get("c") === EDIT_SAVING_NOTE && mixed.size === 3,
    JSON.stringify([...mixed])
  );
  check("edit lock: the refusal notes by reason", editRefusalNote("busy") === EDIT_BUSY_NOTE && editRefusalNote("expired") === EDIT_EXPIRED_NOTE && editRefusalNote("pending", EDIT_UNSAVED_NOTE) === EDIT_UNSAVED_NOTE);

  // The 'Added here' row: Edit and Undo off, with the reason in place of where it went.
  const html = renderToStaticMarkup(
    createElement(JustAdded, {
      entries: [x, y],
      wide: true,
      showAll: false,
      onShowAll: () => {},
      onEdit: () => {},
      onUndo: () => {},
      busy: new Set<string>(),
      locked: sending,
    })
  );
  const rows = html.split("<li").slice(1);
  const rowX = rows.find((r) => r.includes("Title x")) ?? "";
  const rowY = rows.find((r) => r.includes("Title y")) ?? "";
  check(
    "edit lock: the row being replaced shows 'Saving the edit…' and its Edit and Undo are disabled",
    rowX.includes("Saving the edit…") && (rowX.match(/<button[^>]*disabled=""/g) ?? []).length === 2 && !rowX.includes("Anytime"),
    rowX
  );
  check("edit lock: the other rows keep Edit and Undo", rowY.includes("Anytime") && !/disabled=""/.test(rowY));
  check("a11y: the 'Added here' section takes no focus of its own (no tabindex)", !/<section[^>]*tabindex/i.test(html));

  // The dock's toast: neither Edit nor Undo while the edit is on its way, and the body says why.
  const handlers: ToastHandlers = { onUndo: () => {}, onEdit: () => {}, onOpen: () => {}, onShow: () => {}, onSaveAsNew: () => {} };
  const toast = { kind: "added" as const, key: 1, item: x.item, notMust: false, update: false };
  const lockedDock = dockToastOf(toast, { offToday: false, lock: EDIT_SAVING_NOTE }, handlers);
  const lockedBody = renderToStaticMarkup(createElement("div", null, lockedDock.body));
  check("edit lock: the dock offers no Undo while an edit of its capture is on its way", lockedDock.action === undefined && lockedBody.includes("Saving the edit…") && !lockedBody.includes(">Edit<"), lockedBody);
  const openDock = dockToastOf(toast, { offToday: false }, handlers);
  check("edit lock: …and Undo and Edit come back once it settled", openDock.action?.label === "Undo" && renderToStaticMarkup(createElement("div", null, openDock.body)).includes(">Edit<"));
  const gone = undoGoneCopy("Run");
  check("undo: an Undo of a row an edit replaced ('gone') says so honestly, never 'Removed'", gone.head === "Not undone" && gone.message === "“Run” is no longer the row on the board: an edit replaced it." && !/Removed/.test(gone.head + gone.message));
  const resentOld = toastCopy({ id: "t1", title: "Run", projectedXp: 0, kind: "TASK", doneNow: false, doneNowError: "Saved on Wed 30 Sep; tick it on Today.", duplicate: true, href: null, where: { lane: "anytime", label: "Anytime" } } as Parameters<typeof toastCopy>[0]);
  check("toast: a resend of another day's done-now line says why it was not ticked today", resentOld.head === "Already saved" && resentOld.tail === "Saved on Wed 30 Sep; tick it on Today." && resentOld.body.includes("tick it on Today"), resentOld.body);
  check("unsent: a refused line from another life day shows its day note before Retry, not the old error", /u\.state === "queued" \? "Waiting to save · it retries on its own" : \(\(day && pendingDayNote\(u, day\)\) \?\? u\.error\)/.test(read("src/components/capture/QuickCapture.tsx")));
  check(
    "dock: an edit of a line the same opening added changes that line — 'N added' counts rows, not sends",
    /if \(editing && o\.ids\.includes\(editing\.oldId\)\) o\.merged \+= 1;/.test(read("src/components/capture/QuickCapture.tsx")) &&
      read("src/components/capture/QuickCapture.tsx").includes("dockToastChoice(o.sent - o.merged)") &&
      /const at = update && item\.replacedId \? o\.ids\.indexOf\(item\.replacedId\) : -1;\s*if \(at >= 0\) \{\s*o\.titles\[at\] = item\.title;/.test(read("src/components/capture/QuickCapture.tsx"))
  );
  const goneMissing = undoGoneCopy("Run", "That capture no longer exists.");
  check("undo: a 'gone' for a row that no longer exists carries the server's own sentence, not 'an edit replaced it'", goneMissing.message === "“Run”: That capture no longer exists." && !/edit replaced/.test(goneMissing.message), goneMissing.message);
  const quick = read("src/components/capture/QuickCapture.tsx");
  check(
    "edit lock: the sheet locks from the unsent list and the edits in flight, and passes the lock to the list, the dock and Undo",
    /const replacing = useMemo\(\(\) => \{[\s\S]*?unsent\.map[\s\S]*?sendingEdits\.values\(\)[\s\S]*?replacingOf\(lines\)/.test(quick) &&
      quick.includes("locked={replacing}") &&
      quick.includes("lock: dockLock") &&
      /const undo = \(item: CapturedItem\) => \{[\s\S]*?replacingRef\.current\.get\(item\.id\)[\s\S]*?return;/.test(quick) &&
      /if \(oldId\) setSendingEdits\(/.test(quick)
  );
  check("undo: a 'gone' answer drops the row and shows the honest copy", /\.code === "gone"/.test(quick) && /dispatchAdded\(\{ type: "drop", id: item\.id \}\)[\s\S]*?undoGoneCopy\(item\.title, res\.error\)/.test(quick));
  check("undo: a capture taken back (or gone) is not flashed on the board when the sheet closes", /if \(\(res\.ok \|\| res\.gone\) && heldCaptured\.current\?\.id === item\.id\) heldCaptured\.current = null;/.test(quick));
  const closeBody = /const closeSheet = useCallback\([\s\S]*?\[showToast, flashHeld\]/.exec(quick)?.[0] ?? "";
  check("close: the held-back vocabulary refresh is deferred a task, so a save that closed the sheet is in flight before it decides", /window\.setTimeout\(\(\) => considerRef\.current\(\), 0\)/.test(closeBody) && !/^\s*considerRef\.current\(\);\s*$/m.test(closeBody), `closeSheet: ${closeBody.length} chars`);
}

// ── Another day's unsent line is never sent on its own (C2) ───────────────

{
  const line = { text: "call dentist tmr", reverted: [] };
  const lateThu = stampLine(line, 1, at(TODAY, 23, 50), "ab");
  check("pending day: a stamped line carries its life day", lateThu.day === TODAY);
  check("pending day: stamped by the 04:00 life day (03:59 Fri is still Thu)", stampLine(line, 2, at(TODAY, 27, 59), "ab").day === TODAY && stampLine(line, 3, at(TODAY, 28), "ab").day === "2026-10-02");
  const back = parsePendingList(JSON.parse(JSON.stringify([lateThu])));
  check("pending day: the day survives storage", back.length === 1 && back[0].day === TODAY);
  check("pending day: today's line goes on its own", pendingDayNote(lateThu, TODAY) === null);
  check(
    "pending day: Thursday's line on Friday is not sent on its own, and says why",
    pendingDayNote(lateThu, "2026-10-02") === "Captured on Thu 1 Oct · check its day, then Retry",
    String(pendingDayNote(lateThu, "2026-10-02"))
  );
  const old = parsePendingList([{ text: "stretch daily", nonce: "abcd", at: 1 }]);
  check("pending day: an old entry with no day counts as another day's", old.length === 1 && old[0].day === undefined && pendingDayNote(old[0], TODAY) === "Captured on an earlier day · check its day, then Retry");
  check("pending day: a malformed day is dropped (and so counts as another day's)", parsePendingList([{ text: "x", nonce: "abcd", at: 1, day: "tomorrow" }])[0].day === undefined);
  const quick = read("src/components/capture/QuickCapture.tsx");
  check(
    "pending day: on restore, another day's line goes to the failed list with its note (never queued)",
    /readPending\(\)\.map\(\(p\) => restoredUnsent\(p, today\)\)/.test(quick) &&
      /function restoredUnsent[\s\S]*?pendingDayNote\(p, today\)[\s\S]*?state: "failed"[\s\S]*?error: note/.test(quick)
  );
  check(
    "pending day: a flush moves another day's queued line to the failed list before anything is sent",
    /const flush = \(all: boolean\) => \{[\s\S]*?pendingDayNote\(u, today\)[\s\S]*?state: "failed"[\s\S]*?queueDue\(/.test(quick)
  );
  check("pending day: a manual Retry re-stamps the line for today and sends it", /const retry = \(u: Unsent\) => \{[\s\S]*?\{ \.\.\.pendingOf\(u\), day: today \}[\s\S]*?sendLine\(line, "manual"\)/.test(quick));
  check("pending day: the unsent list keeps the day through every settle", /function pendingOf[\s\S]*?line\.day \? \{ day: line\.day \}/.test(quick) && /const base = pendingOf\(line\);/.test(quick));
}

// ── The tap-to-add grammar row (applyInsert over a table of lines) ────────

{
  const GOALS = [
    { id: "g1", title: "Run a marathon" },
    { id: "g2", title: "Fitness" },
  ];
  type Span = { start: number; end: number };
  const BASES: { text: string; reverted?: Span[]; note: string }[] = [
    { text: "", note: "an empty line" },
    { text: "tmr", note: "an empty title with a date" },
    { text: "x tmr", note: "an empty title after the done mark" },
    { text: "pay rent", note: "a plain title" },
    { text: "did i lock the door?", note: "a trailing attached '?'" },
    { text: "call bank ?", note: "a trailing ' ?'" },
    { text: "pay rent !", note: "a trailing '!' with no day" },
    { text: "call mum fri", note: "an existing date" },
    { text: "pay rent by thu", note: "an existing deadline" },
    { text: "read 30m", note: "an existing duration" },
    { text: "gym every mon", note: "an existing schedule" },
    { text: "meet sat team", reverted: [{ start: 5, end: 8 }], note: "a reverted span" },
    { text: "meet sat team fri", reverted: [{ start: 5, end: 8 }], note: "a reverted span and a date" },
    { text: "file tax ^Fitness", note: "an existing goal" },
    { text: "x run 30m", note: "a done-now line" },
    { text: "buy milk #care", note: "a tag" },
    { text: "goal: run a marathon", note: "the goal prefix" },
    { text: "idea: what is X :: an answer", note: "the idea prefix" },
  ];
  const family = (f: string) => (f === "deadline" ? "date" : f);
  const words = (text: string, spans: readonly Span[]) => spans.map((s) => text.slice(s.start, s.end));
  const label = (l: string) => l.replace(/^by\s+/i, "").toLowerCase();

  /** Everything the row offers on this line: the top row's inserts, each open-able menu's options, and the Must fixes when the warning shows. */
  const offered = (parsed: ParsedCapture, text: string): Insert[] => {
    const out: Insert[] = [];
    for (const c of insertRowChips(parsed, text)) {
      if (c.insert) out.push(c.insert);
      if (c.menu) for (const o of insertMenuOptions(c.menu, { today: TODAY, goals: GOALS })) if (o.insert && !o.disabled) out.push(o.insert);
    }
    if (parsed.compulsoryWarning) for (const f of mustFixInserts(TODAY)) out.push(f.insert);
    return out;
  };

  /** The intended reading of an insert, from its words alone. */
  const intended = (ins: Insert) => parseCapture(`task ${ins.text}`, { today: TODAY });

  const failures: string[] = [];
  let rows = 0;
  for (const base of BASES) {
    const rev = base.reverted ?? [];
    const before = parseCapture(base.text, { today: TODAY, reverted: rev });
    for (const ins of offered(before, base.text)) {
      rows++;
      const tag = `"${base.text}" + ${JSON.stringify(ins.text)}${ins.must ? " (Must)" : ""}`;
      const r = applyInsert(base.text, rev, ins, before, { today: TODAY });
      if (!r) {
        failures.push(`${tag}: null`);
        continue;
      }
      const after = parseCapture(r.text, { today: TODAY, reverted: r.reverted });
      const fam = family(ins.field);
      const mine = after.tokens.filter((t) => family(t.field) === fam);
      const want = intended(ins);
      // 1. The intended token is there, with the expected reading and label.
      let landed = true;
      if (ins.field === "date") {
        const w = want.tokens.find((t) => family(t.field) === "date");
        landed = !!w && after.dueDay === want.dueDay && mine.some((t) => label(t.label) === label(w.label));
      } else if (ins.field === "recurrence") landed = after.recurrence === want.recurrence && mine.some((t) => t.label === want.tokens.find((x) => x.field === "recurrence")?.label);
      else if (ins.field === "duration") landed = after.estMinutes === want.estMinutes && mine.length === 1;
      else if (ins.field === "parent") landed = after.parentHint === want.parentHint && mine.length === 1;
      else if (ins.field === "inbox") landed = after.inbox;
      else if (ins.field === "compulsory") landed = after.tokens.some((t) => t.field === "compulsory");
      else if (ins.field === "mode") landed = after.mode === (ins.text.startsWith("goal") ? "GOAL" : "IDEA");
      if (ins.must && !after.compulsory) landed = false;
      if (!landed) failures.push(`${tag} → "${r.text}": the intended token is missing (${after.tokens.map((t) => `${t.field}:${t.label}`).join(" | ")})`);
      // 2. The rest of the parse is unchanged: the title, and every other field the line had.
      // 'idea: ' is the exception by nature: an idea's question is the whole line, word for word.
      if (ins.field === "mode" && after.mode === "IDEA") {
        if (after.title.toLowerCase() !== base.text.trim().toLowerCase()) failures.push(`${tag} → "${r.text}": the question "${after.title}" lost words`);
      } else if (ins.field === "mode") {
        // A new goal keeps the line's words as its title (its own grammar reads a date, never a schedule or a Must).
        if (!after.title.toLowerCase().includes(before.title.toLowerCase())) failures.push(`${tag} → "${r.text}": the goal "${after.title}" lost "${before.title}"`);
      } else if (before.title && after.title !== before.title) failures.push(`${tag} → "${r.text}": title "${before.title}" became "${after.title}"`);
      const stable = new Set(["duration", "parent", "tag", "done", "inbox", "recurrence", "horizon", "study"]);
      for (const t of before.tokens) {
        const f = family(t.field);
        if (f === fam || ins.field === "mode") continue;
        const still = after.tokens.filter((x) => family(x.field) === f);
        if (still.length === 0) failures.push(`${tag} → "${r.text}": lost its ${t.field} (${t.label})`);
        else if (stable.has(f) && !still.some((x) => x.label === t.label)) failures.push(`${tag} → "${r.text}": ${t.field} read "${still[0].label}", was "${t.label}"`);
      }
      // 3. Never on a reverted span; the kept words stay word for word.
      if (JSON.stringify(words(r.text, r.reverted)) !== JSON.stringify(words(base.text, rev))) failures.push(`${tag} → "${r.text}": the reverted words moved`);
      if (after.tokens.some((t) => r.reverted.some((s) => t.start < s.end && t.end > s.start))) failures.push(`${tag} → "${r.text}": a token overlaps a reverted span`);
      // 4. Replace, never append, when the field is there.
      if (["date", "recurrence", "duration", "parent"].includes(fam) && before.tokens.some((t) => family(t.field) === fam) && mine.length !== 1) failures.push(`${tag} → "${r.text}": ${mine.length} ${fam} tokens (appended, not replaced)`);
      // 5. A trailing '?' stays last (and still reads as the Inbox).
      if (base.text.trimEnd().endsWith("?") && !(r.text.trimEnd().endsWith("?") && after.inbox)) failures.push(`${tag} → "${r.text}": the '?' is no longer last`);
      // 6. The caret: at the end, or at the title's place (before the grammar) on a line with no title yet.
      if (!before.title && (ins.field !== "mode" || base.text.trim())) {
        if (r.text[r.caret] !== " " || r.caret !== titleSlot(r.text, after) + (r.caret > 0 ? 1 : 0)) failures.push(`${tag} → "${r.text}": the caret ${r.caret} is not at the title's place`);
      } else if (r.caret !== r.text.length) failures.push(`${tag}: the caret is not at the end`);
    }
  }
  check(`insert row: every offered option over ${BASES.length} base lines holds (${rows} inserts)`, rows > 300 && failures.length === 0, failures.slice(0, 8).join("; "));

  // U1: a chip on a line with no title, then the title typed where the caret is: the token survives
  // the typing (no 'tmrcall bank'), and '!' / '?' stay last. Every chip the row offers, on each such line.
  const TITLE = "call bank";
  const typedFailures: string[] = [];
  let typedRows = 0;
  for (const base of ["", "tmr", "x tmr", "goal: ", "x", "x ", "done "]) {
    const before = parseCapture(base, { today: TODAY });
    for (const ins of offered(before, base)) {
      // A lone done mark ('x', 'done ') is the title until grammar follows it. A goal or idea is never
      // done now, so a mode prefix in front makes the mark title text; and the parser reads 'done … ?'
      // as a question, not a done mark. Neither is an insert the title could survive.
      if (/^(x|done)\s*$/.test(base) && (ins.field === "mode" || (base.startsWith("done") && ins.field === "inbox"))) continue;
      typedRows++;
      const tag = `"${base}" + ${JSON.stringify(ins.text)}${ins.must ? " (Must)" : ""} → type "${TITLE}"`;
      const r = applyInsert(base, [], ins, before, { today: TODAY });
      if (!r) {
        typedFailures.push(`${tag}: null`);
        continue;
      }
      const typed = `${r.text.slice(0, r.caret)}${TITLE}${r.text.slice(r.caret)}`;
      const after = parseCapture(typed, { today: TODAY, reverted: shiftReverted(r.text, typed, r.reverted) });
      const want = intended(ins);
      // A prefix put in front of 'x tmr' makes the rest part of the goal's or the idea's words: the title leads them.
      let ok = ins.field === "mode" ? after.title.toLowerCase().startsWith("call bank") : after.title === "Call bank";
      if (ins.field === "date") ok &&= after.dueDay === want.dueDay;
      else if (ins.field === "recurrence") ok &&= after.recurrence === want.recurrence;
      else if (ins.field === "duration") ok &&= after.estMinutes === want.estMinutes;
      else if (ins.field === "parent") ok &&= after.parentHint === want.parentHint;
      else if (ins.field === "inbox") ok &&= after.inbox && typed.trimEnd().endsWith("?");
      else if (ins.field === "compulsory") ok &&= after.tokens.some((t) => t.field === "compulsory") && typed.trimEnd().endsWith("!");
      else if (ins.field === "mode") ok &&= after.mode === (ins.text.startsWith("goal") ? "GOAL" : "IDEA");
      if (ins.must) ok &&= after.compulsory && typed.trimEnd().endsWith("!");
      // What the line already had stays read: the done mark, the date, the goal prefix.
      if (/^(x|done)\b/.test(base) && ins.field !== "mode") ok &&= after.doneNow;
      if (base.startsWith("goal:")) ok &&= after.mode === "GOAL";
      if (base === "tmr" && ins.field !== "date" && ins.field !== "mode") ok &&= after.dueDay === "2026-10-02";
      if (!ok) typedFailures.push(`${tag} → "${typed}": ${JSON.stringify({ title: after.title, due: after.dueDay, rule: after.recurrence, est: after.estMinutes, inbox: after.inbox, c: after.compulsory, mode: after.mode })}`);
    }
  }
  check(`insert row: on a line with no title, every chip then the typed title reads as intended (${typedRows} rows)`, typedRows > 50 && typedFailures.length === 0, typedFailures.slice(0, 6).join("; "));
  const mustEmpty = applyInsert("", [], { text: "by fri", field: "date", must: true }, parseCapture("", { today: TODAY }), { today: TODAY });
  check("insert row: '' + Must·By Fri is ' by fri !', caret 0, so 'pay rent' types in front", mustEmpty?.text === " by fri !" && mustEmpty.caret === 0, JSON.stringify(mustEmpty));
  const doneFirst = applyInsert("x tmr", [], { text: "30m", field: "duration" }, parseCapture("x tmr", { today: TODAY }), { today: TODAY });
  check("insert row: after a leading 'x' the title goes after the mark ('x  tmr 30m', caret 2)", doneFirst?.text === "x  tmr 30m" && doneFirst.caret === 2, JSON.stringify(doneFirst));

  // Acceptance 2 (Thu 1 Oct 2026): 'pay rent' + When·'Tmr · Fri' + Must + Add, in 12 taps.
  const p0 = parseCapture("pay rent", { today: TODAY });
  const tmrChip = insertMenuOptions("when", { today: TODAY, goals: [] }).find((o) => o.label === "Tmr · Fri");
  const s1 = tmrChip?.insert ? applyInsert("pay rent", [], tmrChip.insert, p0, { today: TODAY }) : null;
  const p1 = s1 ? parseCapture(s1.text, { today: TODAY }) : null;
  const must = p1 && s1 ? insertRowChips(p1, s1.text).find((c) => c.id === "must") : undefined;
  const s2 = must?.insert && s1 && p1 ? applyInsert(s1.text, s1.reverted, must.insert, p1, { today: TODAY }) : null;
  const p2 = s2 ? parseCapture(s2.text, { today: TODAY }) : null;
  // Typed letters, then When, 'Tmr · Fri', Must (one tap: the line has a day) and Add.
  const taps = "pay rent".length + 1 + 1 + (must && !must.menu ? 1 : 2) + 1;
  check(
    "insert row: acceptance 2 — 'pay rent' + When·'Tmr · Fri' + Must + Add is a DEADLINE on Fri 2 Oct, compulsory, 'Pay rent', in 12 taps",
    !!p2 && p2.dueDay === "2026-10-02" && p2.dueKind === "DEADLINE" && p2.compulsory && !p2.compulsoryWarning && p2.title === "Pay rent" && s2?.text === "pay rent tmr !" && taps === 12,
    `${s2?.text} ${taps} taps ${JSON.stringify(p2 && { dueDay: p2.dueDay, dueKind: p2.dueKind, compulsory: p2.compulsory, title: p2.title })}`
  );

  // The row itself.
  const ids = (t: string) => insertRowChips(parseCapture(t, { today: TODAY }), t).map((c) => c.id).join(",");
  check("insert row: When ▾ · Repeat ▾ · Must · Time ▾ · Goal ▾ · Inbox · Idea", ids("pay rent") === "when,repeat,must,time,goal,inbox,idea", ids("pay rent"));
  const narrowIds = (t: string) => insertRowChips(parseCapture(t, { today: TODAY }), t, { narrow: true }).map((c) => c.id).join(",");
  check("insert row: under 400 px, Inbox and Idea come before Goal ▾ on a line without a goal", narrowIds("pay rent") === "when,repeat,must,time,inbox,idea,goal", narrowIds("pay rent"));
  check("insert row: …but a line with a goal keeps Goal ▾ in its place (its link is replaced there)", narrowIds("file tax ^Fitness") === "when,repeat,must,time,goal,inbox,idea", narrowIds("file tax ^Fitness"));
  check("insert row: Inbox hides on a line ending in '?'", !ids("did i lock the door?").includes("inbox") && !ids("call bank ?").includes("inbox"));
  check("insert row: Idea hides on a line with a mode prefix", ids("goal: run a marathon") === "when");
  check("insert row: an idea line has no row (its word hints take the slot)", ids("idea: what is X") === "");
  const mustOf = (t: string) => insertRowChips(parseCapture(t, { today: TODAY }), t).find((c) => c.id === "must");
  check("insert row: Must inserts ' !' straight away when the line has a day or a fixed schedule", mustOf("call mum fri")?.insert?.text === "!" && mustOf("gym every mon")?.insert?.text === "!" && !mustOf("call mum fri")?.menu);
  check("insert row: with no day, Must opens by today · by tmr · by fri · every thu", mustOf("pay rent")?.menu === "must" && insertMenuOptions("must", { today: TODAY, goals: [] }).map((o) => o.insert?.text).join(",") === "by today,by tmr,by fri,every thu");
  const when = insertMenuOptions("when", { today: TODAY, goals: [] });
  check(
    "insert row: When offers Today, one 'Tmr · Fri', the five days after tomorrow (weak days as 'on sat'), Next week",
    when.map((o) => o.insert?.text).join(",") === "today,tmr,on sat,on sun,mon,tue,wed,next week" && when.map((o) => o.label).join(",") === "Today,Tmr · Fri,Sat,Sun,Mon,Tue,Wed,Next week",
    when.map((o) => `${o.label}=${o.insert?.text}`).join(",")
  );
  const dayChips = when.filter((o) => o.id !== "when-next-week");
  check(
    "insert row: no two day chips give the same day (tomorrow is not also listed by name), and the sixth day is reachable",
    new Set(dayChips.map((o) => (o.insert ? parseCapture(`task ${o.insert.text}`, { today: TODAY }).dueDay : o.id))).size === dayChips.length && dayChips.length === 7
  );
  check("insert row: 'Tmr · Fri' is named 'Tomorrow, Friday' for a screen reader", when[1].name === "Tomorrow, Friday: Add “tmr” to the line");
  check("insert row: 'wed' (6 days out) is Wed 7 Oct", parseCapture("task wed", { today: TODAY }).dueDay === "2026-10-07");
  check("insert row: Repeat offers Daily, Weekdays, Every <today>, 3×/week, Weekly", insertMenuOptions("repeat", { today: TODAY, goals: [] }).map((o) => o.insert?.text).join(",") === "daily,weekdays,every thu,3x/week,weekly");
  check("insert row: Time offers 10m … 2h", insertMenuOptions("time", { today: TODAY, goals: [] }).map((o) => o.insert?.text).join(",") === "10m,15m,30m,45m,1h,2h");
  const noGoals = insertMenuOptions("goal", { today: TODAY, goals: [] });
  check("insert row: Goal with none open is 'New goal', then a disabled 'No open goals'", noGoals.length === 2 && noGoals[0].label === "New goal" && noGoals[1].label === "No open goals" && !!noGoals[1].disabled);
  // U6: the goal case gets its chip ('goal: '), and linking reads as linking.
  const goalMenu = insertMenuOptions("goal", { today: TODAY, goals: [{ id: "g1", title: "Run a marathon" }] });
  check(
    "insert row: Goal ▾ starts with 'New goal' (the 'goal: ' prefix), then 'Link to' and the open goals named as links",
    goalMenu[0].label === "New goal" && goalMenu[0].insert?.text === "goal: " && goalMenu[0].insert.field === "mode" && goalMenu[1].eyebrow === true && goalMenu[1].label === "Link to" && goalMenu[2].name === "Link to the goal “Run a marathon”" && goalMenu[2].insert?.field === "parent",
    goalMenu.map((o) => o.label).join(",")
  );
  check("insert row: 'New goal' hides when the line already has a mode prefix", insertMenuOptions("goal", { today: TODAY, goals: [], hasMode: true }).every((o) => o.insert?.field !== "mode"));
  const halfMarathon = "run a half marathon by march";
  const newGoal = goalMenu[0].insert ? applyInsert(halfMarathon, [], goalMenu[0].insert, parseCapture(halfMarathon, { today: TODAY }), { today: TODAY }) : null;
  const goalRead = newGoal ? parseCapture(newGoal.text, { today: TODAY }) : null;
  check("insert row: 'New goal' on 'run a half marathon by march' makes it a goal (no ':' typed)", newGoal?.text === `goal: ${halfMarathon}` && goalRead?.mode === "GOAL" && goalRead.title === "Run a half marathon", newGoal?.text);
  check("insert row: a goal's title is quoted when it has a space", goalInsertText("Run a marathon") === '^"Run a marathon"' && goalInsertText("Fitness") === "^Fitness" && goalInsertText('Say "hi" daily') === '^"Say hi daily"');
  check(
    "insert row: the chip's name and the live note (which never reads like a save)",
    insertChipLabel({ text: "tmr", field: "date" }) === "Add “tmr” to the line" && insertedNote({ text: "tmr", field: "date" }) === "Added “tmr” to the line"
  );
  check("insert row: a menu opening and closing is said ('When options', 'Back')", menuNote("when") === "When options" && menuNote("goal") === "Goal options" && menuNote(null) === "Back" && MENU_NAME.must === "Must");
  // The row hides Must on an Inbox line, but the rule holds anyway: a Must's '!' goes before a trailing '?'.
  const qLines = ["did i lock the door?", "call bank ?", "pay rent by thu ?"];
  const mustOnQ = qLines.flatMap((t) =>
    [{ text: "!", field: "compulsory" } as Insert, ...insertMenuOptions("must", { today: TODAY, goals: [] }).flatMap((o) => (o.insert ? [o.insert] : []))].map((ins) => {
      const r = applyInsert(t, [], ins, parseCapture(t, { today: TODAY }), { today: TODAY });
      const p = r ? parseCapture(r.text, { today: TODAY }) : null;
      return { t, out: r?.text ?? "", ok: !!r && r.text.trimEnd().endsWith("?") && !!p && p.inbox && p.tokens.some((x) => x.field === "compulsory") };
    })
  );
  check("insert row: a Must on a line ending in '?' keeps the '?' last ('call bank ! ?')", mustOnQ.every((m) => m.ok), mustOnQ.filter((m) => !m.ok).map((m) => m.out).join(" | "));
  check("insert row: a second '!' is never added", applyInsert("pay rent !", [], { text: "!", field: "compulsory" }, parseCapture("pay rent !", { today: TODAY }))?.text === "pay rent !");
  const deadline = applyInsert("pay rent by thu", [], { text: "fri", field: "date" }, parseCapture("pay rent by thu", { today: TODAY }));
  check("insert row: a day replacing a deadline keeps it a deadline ('by thu' → 'by fri')", deadline?.text === "pay rent by fri");
  check("insert row: nothing is added past the line's length cap", applyInsert("a".repeat(498), [], { text: "next week", field: "date" }, parseCapture("a".repeat(498), { today: TODAY })) === null);
}

// ── What the toast says, by case ──────────────────────────────────────────

{
  const where = (lane: CapturedItem["where"]["lane"], label: string) => ({ lane, label });
  const normal = toastCopy(capItem({ id: "n", title: "Pay rent", where: where("later", "Planned later · Fri 2 Oct"), projectedXp: 8.3 }));
  check("toast: normal is 'Added' · '<title> → <where> · ≈ 8.3'", normal.head === "Added" && normal.body === "Pay rent → Planned later · Fri 2 Oct · ≈ 8.3" && normal.figure?.exact === false, normal.body);
  const ticked = toastCopy(capItem({ id: "t", title: "Run", doneNow: true, projectedXp: 8.3, where: where("done", "Done today") }));
  check("toast: done-now ticked is 'Done' · '<title> · +8.3', exact, no ≈", ticked.head === "Done" && ticked.body === "Run · +8.3" && ticked.figure?.exact === true && !ticked.body.includes("≈"), ticked.body);
  const notTicked = toastCopy(capItem({ id: "u", title: "Gym", doneNowError: "It isn't due today.", where: where("upcoming", "Habits · next Mon") }));
  check("toast: done-now not ticked is 'Saved, not ticked' with the reason", notTicked.head === "Saved, not ticked" && notTicked.body === "Gym → Habits · next Mon · It isn't due today.", notTicked.body);
  const dup = toastCopy(capItem({ id: "d", title: "Pay rent", duplicate: true, where: where("planned", "Planned") }));
  check("toast: a retry that found its row is 'Already saved' (no price)", dup.head === "Already saved" && dup.body === "Pay rent → Planned" && !dup.figure);
  const idea = toastCopy(capItem({ id: "i", title: "What is X", kind: "IDEA_DRAFT", mode: "IDEA", href: "/add?draft=i", where: where("inbox", "Inbox") }));
  check("toast: an idea draft is 'Idea in Inbox' · '<question> → Inbox' with Finish", idea.head === "Idea in Inbox" && idea.body === "What is X → Inbox" && idea.link?.label === "Finish" && idea.link.href === "/add?draft=i" && !idea.figure);
  const filing = toastCopy(capItem({ id: "f", title: "What is X", kind: "IDEA_DRAFT", mode: "IDEA", filing: true, href: "/add?draft=f", where: where("inbox", "Inbox · filing") }));
  check("toast: a self-filing idea is 'Idea saved' · 'filing now …', no points", filing.head === "Idea saved" && filing.body === `What is X → ${FILING_WHERE}` && !filing.figure && !filing.link);
  const goal = toastCopy(capItem({ id: "g", title: "Run a marathon", kind: "GOAL", mode: "GOAL", projectedXp: 0, where: where("goals", "Goals") }));
  check("toast: a goal is 'Goal added' · '<title> → Goals'", goal.head === "Goal added" && goal.body === "Run a marathon → Goals");
  const notMust = toastCopy(capItem({ id: "m", title: "Pay rent", where: where("anytime", "Anytime") }), { notMust: true });
  check("toast: a Must with no day saves as 'Added (not a Must)'", notMust.head === "Added (not a Must)" && notMust.body.endsWith(`· ${NOT_MUST_TAIL}`) && NOT_MUST_TAIL === "needs a day or a schedule to be a Must", notMust.body);
  const updated = toastCopy(capItem({ id: "n2", title: "Gym", where: where("habits", "Habits"), projectedXp: 0 }), { update: true });
  check("toast: an edit is 'Updated' · '<new title> → <where>'", updated.head === "Updated" && updated.body === "Gym → Habits");
  const kept = toastCopy(capItem({ id: "n3", title: "Gym", oldKept: true }), { update: true });
  check("toast: an edit whose old line stood is 'Saved the new line' with the honest body", kept.head === "Saved the new line" && kept.body === OLD_KEPT_BODY && OLD_KEPT_BODY === "The old one couldn't be removed. Archive it on Today.");
  const keptTick = toastCopy(capItem({ id: "n4", title: "Run", oldKept: true, doneNowError: "Not ticked: the old line still stands." }), { update: true });
  check("toast: …and a done-now edit left unticked says so", keptTick.body === `${OLD_KEPT_BODY} Not ticked: the old line still stands.`, keptTick.body);
  const reTicked = toastCopy(capItem({ id: "n5", title: "Run", doneNow: true, projectedXp: 9.1, where: { lane: "done", label: "Done today" } }), { update: true });
  check("toast: an edited done-now line shows what its tick paid, exactly", reTicked.head === "Updated" && reTicked.body === "Run → Done today · +9.1", reTicked.body);
  const reFailed = toastCopy(capItem({ id: "n6", title: "Gym", doneNowError: "It isn't due today.", where: { lane: "upcoming", label: "Habits · next Mon" } }), { update: true });
  check("toast: an edited done-now line that was not ticked says why", reFailed.body === "Gym → Habits · next Mon · It isn't due today.", reFailed.body);
  check("toast: off /today the body adds View → /today#t-<id>", toastCopy(capItem({ id: "abc", title: "X" }), { offToday: true }).link?.href === "/today#t-abc" && toastCopy(capItem({ id: "abc", title: "X" })).link === null);
  check("toast: no ≈ for an unpriced line (never a guessed number)", toastCopy(capItem({ id: "z", title: "X", projectedXp: 0 })).figure === null && toastCopy(capItem({ id: "z", title: "X", projectedXp: Number.NaN })).figure === null);
  check("idea chip: honest about filing (off until the lead turns it on)", ideaChipLabel(true, true) === "Files itself as an Idea" && ideaChipLabel(false) === "Inbox draft · finish it in the full form" && ideaChipLabel(true, false).startsWith("Inbox draft"));
  const capSrc = read("src/app/actions/capture.ts");
  const server = /const IDEA_SELF_FILING = (true|false);/.exec(capSrc)?.[1];
  check("idea chip: the sheet's IDEA_SELF_FILING_UI equals the server's IDEA_SELF_FILING", server !== undefined && String(IDEA_SELF_FILING_UI) === server, `server ${server}, sheet ${IDEA_SELF_FILING_UI}`);
}

// ── Block-once: a Must with no day ────────────────────────────────────────

{
  const line = "pay rent !";
  const warned = !!parseCapture(line, { today: TODAY }).compulsoryWarning;
  const first = mustGate(null, line, warned);
  check("must gate: the line warns (a Must with no day)", warned);
  check("must gate: the first Enter does not save", first.action === "block" && first.blocked === line);
  const second = mustGate(first.blocked, line, warned);
  check("must gate: a second Enter on the same text saves it as a normal task", second.action === "save-not-must" && second.blocked === null);
  const edited = mustGate(first.blocked, "pay rent soon !", true);
  check("must gate: an edited text blocks again", edited.action === "block" && edited.blocked === "pay rent soon !");
  check("must gate: no warning, no gate", mustGate(null, "pay rent fri !", false).action === "save" && mustGate("x", "x", false).action === "save");
  check("must gate: the warning's words", MUST_WARNING === "A Must needs a day to be judged on. Tap one, or press Enter again to add it as a normal task.");
  const fixes = mustFixInserts(TODAY);
  check("must gate: the fixes are by today · by tmr · by fri · every thu", fixes.map((f) => f.label).join(",") === "By today,By tmr,By Fri,Every Thu");
  const fixed = fixes.map((f) => applyInsert(line, [], f.insert, parseCapture(line, { today: TODAY }), { today: TODAY })?.text ?? "");
  check("must gate: each fix lands before the trailing '!' and makes a real Must", fixed.join("|") === "pay rent by today !|pay rent by tmr !|pay rent by fri !|pay rent every thu !" && fixed.every((t) => { const p = parseCapture(t, { today: TODAY }); return p.compulsory && !p.compulsoryWarning; }), fixed.join("|"));
}

// ── Unsent lines retry themselves (capture-queue.ts) ──────────────────────

{
  check("retry: 2 s, 10 s, 60 s, 300 s, then stop", [0, 1, 2, 3, 4].map(nextRetryDelay).join(",") === "2000,10000,60000,300000," && MAX_AUTO_ATTEMPTS === 4 && RETRY_DELAYS_MS.length === 4);
  check("retry: nonsense attempt counts stop", nextRetryDelay(-1) === null && nextRetryDelay(1.5) === null);
  check("retry: a thrown action or a failed fetch is the network", isNetworkFailure(new TypeError("Failed to fetch")) && isNetworkFailure(new Error("An unexpected response was received from the server.")) && isNetworkFailure(undefined));
  check("retry: a server answer ({ok:false}) is not (it would be refused again)", !isNetworkFailure({ ok: false, error: "Add a few words." }));
  check("retry: a pending line from an earlier load retries once it is 15 s old", PENDING_STALE_MS === 15_000);

  const now = 10_000;
  let q = queueAdd([], "n1", now + 2_000);
  q = queueAdd(q, "n1", now + 99_000);
  check("queue: one entry per nonce (the same line is never queued twice)", q.length === 1 && q[0].nextAt === now + 2_000);
  q = queueAdd(q, "n2", now + 5_000);
  check("queue: only what is due goes", queueDue(q, now + 2_000, new Set()).join() === "n1");
  check("queue: a line in flight is never sent again", queueDue(q, now + 9_000, new Set(["n1"])).join() === "n2" && queueDue(q, now, new Set(["n1", "n2"]), true).length === 0);
  check("queue: a trigger (online, visible, the sheet opened) sends every idle line", queueDue(q, now, new Set(), true).join() === "n1,n2");
  check("queue: a manual Retry pre-empts the timer (not due yet, still allowed now)", !queueDue(q, now, new Set()).includes("n2") && mayRetryNow("n2", new Set()) && !mayRetryNow("n2", new Set(["n2"])));
  check("queue: one timer, for the earliest idle line", queueWake(q, new Set()) === now + 2_000 && queueWake(q, new Set(["n1"])) === now + 5_000 && queueWake([], new Set()) === null);

  const first = queueSettle([], "a", "network", now, false);
  check("queue: a first send lost to the network waits 2 s (no attempt used)", !first.giveUp && first.queue[0].attempts === 0 && first.queue[0].nextAt === now + 2_000);
  let s = first;
  const steps: number[] = [];
  for (let i = 0; i < 4 && !s.giveUp; i++) {
    s = queueSettle(s.queue, "a", "network", now, true);
    if (!s.giveUp) steps.push(s.queue[0].nextAt - now);
  }
  check("queue: automatic attempts back off 10 s, 60 s, 300 s, then give up (the failed list)", steps.join(",") === "10000,60000,300000" && s.giveUp && s.queue.length === 0, `${steps.join(",")} giveUp=${s.giveUp}`);
  const manual = queueSettle(queueSettle([], "b", "network", now, true).queue, "b", "network", now, false);
  check("queue: a manual Retry that fails uses no attempt", manual.queue[0].attempts === 1);
  check("queue: saved or refused leaves the queue", queueSettle(q, "n1", "saved", now, true).queue.map((i) => i.nonce).join() === "n2" && queueSettle(q, "n2", "refused", now, false).queue.map((i) => i.nonce).join() === "n1" && queueRemove(q, "n1").length === 1);

  check("retry summary: nothing when no retried line was new", unsentSavedCopy(0) === null);
  check("retry summary: 'N unsent lines saved'", unsentSavedCopy(1) === "1 unsent line saved" && unsentSavedCopy(3) === "3 unsent lines saved");
  check("unsent count: the + button's description", unsentLabel(0) === "" && unsentLabel(1) === "1 line waiting to save" && unsentLabel(2) === "2 lines waiting to save");
}

// ── Paste a list: one task per line ───────────────────────────────────────

{
  const split = (raw: string) => splitPastedLines(raw).lines.join("|");
  check("paste: bullets and checkboxes are stripped", split("- one\n* two\n• three\n– four\n[ ] five\n[x] six\n[X] seven\n- [ ] eight") === "one|two|three|four|five|six|seven|eight", split("- one\n* two\n• three\n– four\n[ ] five\n[x] six\n[X] seven\n- [ ] eight"));
  check("paste: numbering '1.' and '1)' is stripped", split("1. call bank\n2) pay rent\n10. file tax") === "call bank|pay rent|file tax");
  check("paste: CRLF and CR split like LF", split("a\r\nb\rc\nd") === "a|b|c|d");
  check("paste: blank lines are dropped", split("a\n\n   \n\t\nb") === "a|b");
  const many = splitPastedLines(Array.from({ length: 25 }, (_, i) => `task ${i + 1}`).join("\n"));
  check(`paste: at most ${CAPTURE_BATCH_MAX} lines, with the note`, many.lines.length === CAPTURE_BATCH_MAX && many.truncated && PASTE_CAP_NOTE === "Only the first 20 lines are added." && !splitPastedLines("a\nb").truncated);
  check("paste: a single line stays a normal paste", splitPastedLines("just one line").lines.length === 1 && splitPastedLines("  - one\n\n").lines.length === 1);
  check("paste: numbers inside a line are kept ('2 eggs', '3.5 hours')", split("2 eggs\n3.5 hours study") === "2 eggs|3.5 hours study");
  const milk = splitPastedLines("buy milk\neggs tmr\nbread").lines;
  const days = milk.map((l) => parseCapture(l, { today: TODAY }).dueDay);
  check("paste: 'buy milk / eggs tmr / bread' is 3 lines, only line 2 dated", milk.length === 3 && days[0] === null && days[1] === "2026-10-02" && days[2] === null, JSON.stringify(days));
  check("paste: lines are NFC (the Vietnamese rules read one form)", splitPastedLines("go\u0323i me\u0323 mai\nb").lines[0] === "gọi mẹ mai");
  check("where preview: the sheet shapes the line with the server's own captureShapeOf (no mirrored copy to drift)", /export function wherePreviewOf[\s\S]*?\.\.\.captureShapeOf\(parsed, today\)/.test(read("src/components/capture/capture-ui.ts")) && !/export function wherePreviewOf[\s\S]*?allowsCompulsory\(/.test(read("src/components/capture/capture-ui.ts")));
  const guess = (t: string) => wherePreviewOf(parseCapture(t, { today: TODAY }), TODAY).label;
  check("paste: each row's where-guess is the board's own words", guess("buy milk") === "Anytime" && guess("call mum sat") === "Planned later · Sat 3 Oct" && guess("did i lock the door?") === "Inbox" && guess("gym every mon") === "Habits · next Mon" && guess("x run 30m") === "Done today" && guess("goal: run a marathon") === "Goals", [guess("buy milk"), guess("call mum sat"), guess("gym every mon")].join(" / "));
}

// ── Suggestions and the vocabulary cache ──────────────────────────────────

{
  check("suggest: '^' at the caret wants goals", caretContext("call bank ^mar", 14) === "goal" && caretContext("^", 1) === "goal");
  check("suggest: '#' at the caret wants tags", caretContext("stretch #bo", 11) === "tag");
  check("suggest: an empty line wants Recent", caretContext("", 0) === "empty" && caretContext("   ", 2) === "empty");
  check("suggest: any other word wants the insert row", caretContext("pay rent", 8) === null && caretContext("call ^mar bank", 13) === null);
  check("suggest: the caret inside a '^' word still counts", caretContext("call ^mar bank", 7) === "goal" && caretWord("call ^mar bank", 7).word === "^mar");
  check("suggest: the typed prefix, quote and all", caretPrefix("^mar") === "mar" && caretPrefix('^"run a') === "run a" && caretPrefix("#bo") === "bo");
  const goals = [
    { id: "1", title: "Fitness" },
    { id: "2", title: "Run a marathon" },
    { id: "3", title: "Marathon prep" },
    { id: "4", title: "Read more" },
  ];
  check("suggest: goals that start with the prefix come first, then any containing it", goalSuggestions(goals, "mar").map((g) => g.id).join() === "3,2", goalSuggestions(goals, "mar").map((g) => g.id).join());
  check("suggest: case is ignored; an empty prefix lists the open goals", goalSuggestions(goals, "RUN").map((g) => g.id).join() === "2" && goalSuggestions(goals, "").length === 4);
  check("suggest: at most six", goalSuggestions(Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, title: `Goal ${i}` })), "goal").length === 6);
  const picked = replaceCaretWord("call bank ^mar", [], 14, goalInsertText("Run a marathon"));
  check("suggest: a goal replaces the '^' word, quoted, and the caret moves past it", picked?.text === 'call bank ^"Run a marathon" ' && picked.caret === picked.text.length && parseCapture(picked.text, { today: TODAY }).parentHint === "Run a marathon");
  check("suggest: tags are the eight the parser reads, filtered by the prefix", CAPTURE_TAGS.join(",") === "body,duty,craft,care,play,short,mid,long" && tagSuggestions("c").join() === "craft,care" && tagSuggestions("").length === 6 && tagSuggestions("body").length === 0);
  check("suggest: Recent is distinct (case and spacing aside), at most six", recentChips(["Gym legs", "gym  legs", "", "a", "b", "c", "d", "e", "f"]).join("|") === "Gym legs|a|b|c|d|e");

  const cache = { day: TODAY, goals: [{ id: "g", title: "Fitness" }], recent: ["gym legs 60m every mon,thu"], rawBefore: 12.5, active: [{ normTitle: "gym", title: "Gym", where: { lane: "habits" as const, label: "Habits" } }], at: 5_000 };
  const back = parseVocabCache(JSON.parse(JSON.stringify(cache)));
  check("vocab cache: round trips through storage", JSON.stringify(back) === JSON.stringify(cache));
  check("vocab cache: malformed is no cache", parseVocabCache(null) === null && parseVocabCache({ day: "today", at: 1 }) === null && parseVocabCache({ day: TODAY }) === null);
  check("vocab cache: a different life day is stale and never prices", vocabStale(cache, "2026-10-02", 5_001) && !vocabPriceable(cache, "2026-10-02", 5_001));
  check("vocab cache: today's, fresh, prices at once", !vocabStale(cache, TODAY, 5_000 + VOCAB_FRESH_MS - 1) && vocabPriceable(cache, TODAY, 5_000 + VOCAB_FRESH_MS - 1));
  check("vocab cache: older than five minutes is refreshed, and stops pricing", vocabStale(cache, TODAY, 5_000 + VOCAB_FRESH_MS) && !vocabPriceable(cache, TODAY, 5_000 + VOCAB_FRESH_MS) && vocabStale(null, TODAY, 0));

  // U8: every fresh opening decides again whether the cached ≈ may show.
  const priced = { ...cache, priced: true };
  check("vocab on open: a vocabulary priced over five minutes ago stops pricing at the next opening ('priced on save')", vocabOnOpen(priced, TODAY, 5_000 + VOCAB_FRESH_MS)?.priced === false);
  check("vocab on open: another life day's stops pricing too", vocabOnOpen(priced, "2026-10-02", 5_001)?.priced === false);
  check("vocab on open: a fresh one keeps pricing (the same object, nothing re-rendered)", vocabOnOpen(priced, TODAY, 5_000 + VOCAB_FRESH_MS - 1) === priced && vocabOnOpen(null, TODAY, 0) === null);
  const quickV = read("src/components/capture/QuickCapture.tsx");
  check("vocab on open: openSheet re-decides on every fresh opening (not only the first)", /if \(!wasOpen\) \{[\s\S]*?setVocab\(\(v\) => vocabOnOpen\(v, today, Date\.now\(\)\)\)[\s\S]*?\n      \}/.test(quickV));

  const d = (over: Partial<Parameters<typeof vocabRefreshDecision>[0]>) =>
    vocabRefreshDecision({
      now: 0,
      openedAt: 0,
      savesInFlight: 0,
      savedThisOpening: false,
      refreshedThisOpening: false,
      stale: true,
      coarseOpen: false,
      lineEmpty: true,
      emptyForMs: 0,
      ...over,
    });
  const flight: string[] = [];
  for (const saved of [false, true]) for (const stale of [false, true]) for (const now of [0, VOCAB_REFRESH_DELAY_MS, 60_000]) if (d({ savesInFlight: 1, savedThisOpening: saved, stale, now }) === "start") flight.push(`${saved}/${stale}/${now}`);
  check("vocab refresh: never starts while a save is in flight (a save never waits behind it)", flight.length === 0, flight.join("; "));
  check("vocab refresh: after the opening's first save resolves", d({ savedThisOpening: true, stale: false }) === "start");
  check("vocab refresh: 1.5 s after open when stale and nothing is saving", d({ now: VOCAB_REFRESH_DELAY_MS - 1 }) === "wait" && d({ now: VOCAB_REFRESH_DELAY_MS }) === "start" && VOCAB_REFRESH_DELAY_MS === 1_500);
  check("vocab refresh: a fresh cache is not refetched on open", d({ stale: false, now: 60_000 }) === "skip");
  check("vocab refresh: once per opening", d({ refreshedThisOpening: true, savedThisOpening: true }) === "skip");

  // U9: on an open phone sheet, a save mid-burst never waits behind the refresh: it waits for a pause.
  check("vocab refresh: a phone mid-burst (a line being typed) waits, even after a save", d({ coarseOpen: true, savedThisOpening: true, lineEmpty: false }) === "wait");
  check(
    "vocab refresh: a phone's empty line must stay empty 2 s first",
    VOCAB_IDLE_MS === 2_000 && d({ coarseOpen: true, savedThisOpening: true, emptyForMs: VOCAB_IDLE_MS - 1 }) === "wait" && d({ coarseOpen: true, savedThisOpening: true, emptyForMs: VOCAB_IDLE_MS }) === "start"
  );
  check("vocab refresh: once the sheet has closed it may start at once", d({ coarseOpen: false, savedThisOpening: true, lineEmpty: false }) === "start");
  const expectRefresh = (x: Parameters<typeof vocabRefreshDecision>[0]) => {
    if (x.refreshedThisOpening) return "skip";
    if (x.savesInFlight > 0) return "wait";
    if (!x.savedThisOpening && !x.stale) return "skip";
    if (!x.savedThisOpening && x.now - x.openedAt < VOCAB_REFRESH_DELAY_MS) return "wait";
    if (x.coarseOpen && (!x.lineEmpty || x.emptyForMs < VOCAB_IDLE_MS)) return "wait";
    return "start";
  };
  const refreshWrong: string[] = [];
  let refreshRows = 0;
  for (const refreshedThisOpening of [false, true])
    for (const savesInFlight of [0, 1])
      for (const savedThisOpening of [false, true])
        for (const stale of [false, true])
          for (const now of [0, VOCAB_REFRESH_DELAY_MS])
            for (const coarseOpen of [false, true])
              for (const lineEmpty of [false, true])
                for (const emptyForMs of [0, VOCAB_IDLE_MS - 1, VOCAB_IDLE_MS]) {
                  refreshRows++;
                  const x = { now, openedAt: 0, savesInFlight, savedThisOpening, refreshedThisOpening, stale, coarseOpen, lineEmpty, emptyForMs };
                  if (vocabRefreshDecision(x) !== expectRefresh(x)) refreshWrong.push(JSON.stringify(x));
                }
  check(`vocab refresh: the whole table (${refreshRows} rows)`, refreshRows === 384 && refreshWrong.length === 0, refreshWrong.slice(0, 3).join("; "));
  check(
    "vocab refresh: the sheet asks again when it closes, and when a phone's line has been empty long enough",
    /const closeSheet = useCallback\([\s\S]*?window\.setTimeout\(\(\) => considerRef\.current\(\), 0\);\s*\},\s*\[showToast, flashHeld\]/.test(quickV) &&
      /if \(!open \|\| !coarse \|\| !lineEmpty\) return;[\s\S]*?VOCAB_IDLE_MS/.test(quickV) &&
      quickV.includes("coarseOpen: openRef.current && coarseRef.current")
  );
}

// ── Back closes the sheet on a phone (the history decision) ───────────────

{
  check("history: a phone pushes '#capture-open' on open, once", CAPTURE_OPEN_HASH === "#capture-open" && historyOnOpen({ coarse: true, hash: "", pushed: false }) === "push" && historyOnOpen({ coarse: true, hash: "", pushed: true }) === "none" && historyOnOpen({ coarse: true, hash: CAPTURE_OPEN_HASH, pushed: false }) === "none");
  check("history: never on a fine pointer", historyOnOpen({ coarse: false, hash: "", pushed: false }) === "none");
  check("history: Back (the hash gone) closes the open sheet", historyOnPop({ open: true, hash: "" }) === "close" && historyOnPop({ open: true, hash: CAPTURE_OPEN_HASH }) === "none" && historyOnPop({ open: false, hash: "" }) === "none");
  const reasons: CloseReason[] = ["back", "escape", "scrim", "button", "save", "done", "navigate"];
  const wrong: string[] = [];
  for (const reason of reasons)
    for (const hash of ["", CAPTURE_OPEN_HASH, "#t-abc"])
      for (const coarse of [false, true])
        for (const pushed of [false, true]) {
          const want = coarse && pushed && reason !== "back" && reason !== "navigate" && hash === CAPTURE_OPEN_HASH ? "back" : "none";
          const got = historyOnClose({ reason, hash, coarse, pushed });
          if (got !== want) wrong.push(`${reason}/${hash || "-"}/${coarse ? "coarse" : "fine"}/${pushed ? "pushed" : "-"}=${got}`);
        }
  check("history: the close table (reason × hash × coarse × pushed) → back() or nothing", wrong.length === 0, wrong.join("; "));
  check("history: Escape, the scrim, ×, Add and Done on a phone take the entry back", (["escape", "scrim", "button", "save", "done"] as CloseReason[]).every((reason) => historyOnClose({ reason, hash: CAPTURE_OPEN_HASH, coarse: true, pushed: true }) === "back"));
  check("history: following the Idea link (navigate) closes without back()", historyOnClose({ reason: "navigate", hash: CAPTURE_OPEN_HASH, coarse: true, pushed: true }) === "none");
}

// ── Prefill from a link: '#capture=<encoded>' ─────────────────────────────

{
  check("fragment: encoded spaces and %23", readCaptureFragment(`${CAPTURE_FRAGMENT}buy%20milk%20tmr%20%23care`) === "buy milk tmr #care");
  check("fragment: '+' is a space, %2B a plus", readCaptureFragment("#capture=call+mum+fri") === "call mum fri" && readCaptureFragment("#capture=c%2B%2B%20book") === "c++ book");
  check("fragment: Vietnamese text, NFC", readCaptureFragment(`#capture=${encodeURIComponent("họp team 3h chiều thứ 2")}`) === "họp team 3h chiều thứ 2" && readCaptureFragment(`#capture=${encodeURIComponent("gọi mẹ mai".normalize("NFD"))}`) === "gọi mẹ mai");
  const long = readCaptureFragment(`#capture=${"a".repeat(600)}`);
  check("fragment: more than 500 characters is cut to 500", long?.length === 500);
  check("fragment: anything else is ignored ('#t-abc', '#capture-open', a query)", readCaptureFragment("#t-abc") === null && readCaptureFragment(CAPTURE_OPEN_HASH) === null && readCaptureFragment("?capture=task") === null);
  check("fragment: an empty value is null", readCaptureFragment("#capture=") === null && readCaptureFragment("#capture=%20%20") === null);
  check("fragment: malformed encoding is null, never a throw", readCaptureFragment("#capture=%E0%A4%A") === null);
  check("fragment: control characters become spaces", readCaptureFragment("#capture=a%0Ab%09c") === "a b c");
}

// ── The quiet duplicate note ──────────────────────────────────────────────

{
  const active: CaptureActiveTitle[] = [
    { normTitle: normTitleOf("Gym legs"), title: "Gym legs", where: { lane: "habits", label: "Habits" } },
    { normTitle: normTitleOf("Pay rent"), title: "Pay rent", where: { lane: "later", label: "Planned later · Fri 2 Oct" } },
  ];
  const hit = duplicateOf("pay  RENT", active);
  check("duplicate: matched on normTitle equality", hit?.title === "Pay rent");
  check("duplicate: never on a part of a title", duplicateOf("Pay", active) === null && duplicateOf("Pay rent now", active) === null && duplicateOf("", active) === null);
  check("duplicate: the line being edited is not its own duplicate", duplicateOf("Pay rent", active, normTitleOf("Pay rent")) === null);
  const big: CaptureActiveTitle[] = Array.from({ length: ACTIVE_SCAN_MAX }, (_, i) => ({ normTitle: `t${i}`, title: `T${i}`, where: { lane: "anytime", label: "Anytime" } }));
  big.push({ normTitle: normTitleOf("Past the cap"), title: "Past the cap", where: { lane: "anytime", label: "Anytime" } });
  check(`duplicate: only the first ${ACTIVE_SCAN_MAX} are scanned`, duplicateOf("Past the cap", big) === null && duplicateOf("T5", big)?.title === "T5");
  check("duplicate: the note's words", hit !== null && duplicateNote(hit) === "Already on your board: Pay rent · Planned later · Fri 2 Oct");
}

// ── Blueprint P6 (D33): a done-now line ticks the row it names ────────────

{
  const p = (line: string) => parseCapture(line, { today: "2026-10-01" });
  const active: CaptureActiveTitle[] = [
    { normTitle: normTitleOf("Gym"), title: "Gym", where: { lane: "habits", label: "Habits" }, tick: "open" },
    { normTitle: normTitleOf("Stretch"), title: "Stretch", where: { lane: "done", label: "Done today" }, tick: "done" },
    { normTitle: normTitleOf("Read the novel"), title: "Read the novel", where: { lane: "habits", label: "Habits" } },
  ];
  const gym = tickMatchOf(p("x gym 45m"), active);
  check("P6 chip: 'x gym 45m' names the Gym habit (the server's rule over the sheet's list)", gym?.title === "Gym" && gym.tick === "open");
  check("P6 chip: a row ticked today already is named too ('Already ticked'); a row that offers no tick never is", tickMatchOf(p("x stretch"), active)?.tick === "done" && tickMatchOf(p("x read the novel"), active) === null);
  check(
    "P6 chip: never during an edit, on a work tab, once tapped (asNew), for a line that is not a plain done-now line, or past the first ACTIVE_SCAN_MAX titles",
    tickMatchOf(p("x gym"), active, { editing: true }) === null &&
      tickMatchOf(p("x gym"), active, { work: true }) === null &&
      tickMatchOf(p("x gym"), active, { asNew: true }) === null &&
      tickMatchOf(p("gym"), active) === null &&
      tickMatchOf(p("x gym daily"), active) === null &&
      tickMatchOf(p("x gym?"), active) === null &&
      tickMatchOf(p("x gym"), [...Array.from({ length: ACTIVE_SCAN_MAX }, (_, i): CaptureActiveTitle => ({ normTitle: `t${i}`, title: `T${i}`, where: { lane: "anytime", label: "Anytime" } })), active[0]]) === null
  );
  check(
    "P6 primary: a line that ticks the row it names reads 'Tick it' (it adds nothing); any other done-now line still 'Add as done'",
    primaryAction({ editing: false, coarse: false, empty: false, sentThisOpening: 0, parsed: p("x gym"), ticks: true }).label === TICK_PRIMARY &&
      TICK_PRIMARY === "Tick it" &&
      primaryAction({ editing: false, coarse: false, empty: false, sentThisOpening: 0, parsed: p("x gym") }).label === "Add as done" &&
      primaryAction({ editing: false, coarse: true, empty: true, sentThisOpening: 2, parsed: p(""), ticks: true }).label === "Done"
  );
  check(
    "P6 review primary: a row ticked today already reads 'Already ticked' (the line writes and pays nothing), an open one 'Tick it'",
    primaryAction({ editing: false, coarse: false, empty: false, sentThisOpening: 0, parsed: p("x stretch"), ticks: "done" }).label === TICKED_PRIMARY &&
      TICKED_PRIMARY === "Already ticked" &&
      primaryAction({ editing: false, coarse: false, empty: false, sentThisOpening: 0, parsed: p("x gym"), ticks: "open" }).label === TICK_PRIMARY
  );
  check(
    "P6 review chip: only from a list that is today's and fresh (fresh false: no chip, the line reads 'Add as done' until the list is read again)",
    tickMatchOf(p("x gym"), active, { fresh: false }) === null && tickMatchOf(p("x gym"), active, { fresh: true })?.title === "Gym"
  );
  check(
    "P6 review refresh: a line that asks a tick over a list not fresh is read again at once; a fresh list, an edit, a work tab, a tapped chip or a line that asks no tick never is",
    tickWantsRefresh(p("x gym 45m"), { fresh: false }) &&
      !tickWantsRefresh(p("x gym 45m"), { fresh: true }) &&
      !tickWantsRefresh(p("x gym 45m"), { fresh: false, editing: true }) &&
      !tickWantsRefresh(p("x gym 45m"), { fresh: false, work: true }) &&
      !tickWantsRefresh(p("x gym 45m"), { fresh: false, asNew: true }) &&
      !tickWantsRefresh(p("gym 45m"), { fresh: false }) &&
      !tickWantsRefresh(null, { fresh: false })
  );

  // What the chips draw: the tick chip in place of the duplicate note, one tap away from a new task.
  const chips = (line: string, ticks: CaptureActiveTitle | null) =>
    renderToStaticMarkup(
      createElement(CaptureChips, {
        text: line,
        parsed: p(line),
        goals: [],
        rawBefore: 0,
        onRevert: () => {},
        compact: false,
        feedsOpen: false,
        onToggleFeeds: () => {},
        duplicate: active[0],
        ticks,
        onTickAsNew: () => {},
        mustBlocked: false,
        mustFixes: [],
        onFix: () => {},
        duty: { today: "2026-10-01", launchDay: null },
        proof: { live: false, work: false },
      })
    );
  const ticking = chips("x gym 45m fri !", gym);
  const plain = chips("x gym 45m fri !", null);
  check(
    "P6 chips: 'Ticks: Gym (Habits)' as a button whose tap makes it a new task, in place of the duplicate note",
    /class="chip btn-chip capture-chip capture-ticks"/.test(ticking) &&
      ticking.includes('<span class="capture-ticks-lead">Ticks:</span><span class="capture-ticks-title">Gym</span><span class="capture-ticks-lane">(Habits)</span>') &&
      ticking.includes('aria-label="Ticks: Gym (Habits). Tap to add it as a new task instead."') && !ticking.includes("Already on your board") && plain.includes("Already on your board: Gym · Habits") && !plain.includes("Ticks:"),
    ticking.slice(0, 600)
  );
  check(
    "P6 chips: the tick pays its row's price, so the grade chip says so (no ≈ for the line's words, no Feeds)",
    ticking.includes(`>${TICK_GRADE_LABEL.replace("'", "&#x27;")}<`) && TICK_GRADE_LABEL === "Pays its row's price" && !ticking.includes("≈") && !ticking.includes("capture-feeds") && plain.includes("≈")
  );
  check(
    "P6 chips: a line that ticks the row it names takes no Must from the line, so a Must with no day shows no warning, and the sheet's gate never stops its Enter",
    chips("x gym !", gym).includes("Ticks: Gym (Habits)") && !chips("x gym !", gym).includes("capture-warning") && chips("x gym !", null).includes("capture-warning") &&
      /const ticking = !weighed && !!v && tickMatchOf\(read, v\.active, \{ editing: !!editing, work: workBoardRef\.current !== null, asNew, fresh: v\.day === day && v\.priced \}\) !== null;/.test(read("src/components/capture/QuickCapture.tsx")) &&
      /mustGate\(blocked, line\.text, \(!!read\.compulsoryWarning && !ticking\) \|\| out !== null\)/.test(read("src/components/capture/QuickCapture.tsx"))
  );
  const dashed = (html: string) => (html.match(/data-warn="1"/g) ?? []).length;
  check("P6 chips: only the done mark and the minutes go with the tick: the day and the Must are dashed (not taken)", dashed(ticking) === 2 && dashed(plain) === 0, `${dashed(ticking)} / ${dashed(plain)}`);
  // P6 review: a row ticked today already takes nothing from the line, so nothing promises a tick or a payment.
  const stretchMatch = tickMatchOf(p("x stretch 20m"), active);
  const already = chips("x stretch 20m", stretchMatch);
  check(
    "P6 review chips: 'Already ticked: Stretch (Done today)'; the grade chip says 'Paid already' (dashed, never 'Pays its row's price'), and the minutes are dashed too",
    already.includes('<span class="capture-ticks-lead">Already ticked:</span><span class="capture-ticks-title">Stretch</span><span class="capture-ticks-lane">(Done today)</span>') &&
      already.includes(`>${TICK_PAID_LABEL}<`) && TICK_PAID_LABEL === "Paid already" && !already.includes("Pays its row") && !already.includes("≈") && dashed(already) === 2,
    `${dashed(already)} ${already.slice(0, 900)}`
  );

  // What a tick of the named row says, in the toast, the 'Added here' row, the live region and on the phone.
  const ticked = capItem({ id: "gym", title: "Gym", doneNow: true, projectedXp: 8.3, where: { lane: "done", label: "Done today" }, ticked: { from: "Habits", instanceId: "i1" } });
  const earlier = capItem({ id: "stretch", title: "Stretch", projectedXp: 2.2, where: { lane: "done", label: "Done today" }, ticked: { from: "Done today", instanceId: "i2", earlier: true } });
  const tc = toastCopy(ticked);
  const ec = toastCopy(earlier);
  check("P6 toast: 'Ticked · Gym (Habits) · +8.3' (exact), never 'Added'", tc.head === "Ticked" && tc.body === "Gym (Habits) · +8.3" && tc.figure?.exact === true, JSON.stringify(tc));
  check("P6 toast: a row ticked earlier today: 'Already ticked · Stretch → Done today · Nothing is paid twice.', no figure", ec.head === "Already ticked" && ec.body === `Stretch → Done today · ${TICKED_EARLIER_TAIL}` && ec.figure === null, JSON.stringify(ec));
  check(
    "P6 'Added here': 'Gym · Ticked · Habits · +8.3'; a row ticked earlier: 'Ticked earlier today', no figure",
    JSON.stringify(addedRowCopy(ticked)) === JSON.stringify({ title: "Gym", where: "Ticked · Habits", figure: "+8.3" }) && JSON.stringify(addedRowCopy(earlier)) === JSON.stringify({ title: "Stretch", where: TICKED_EARLIER_WHERE, figure: null })
  );
  check("P6 live region: 'Ticked Gym (Habits).' and 'Stretch was already ticked today. Nothing is paid twice.'", tickedAnnouncement(ticked) === "Ticked Gym (Habits)." && tickedAnnouncement(earlier) === `Stretch was already ticked today. ${TICKED_EARLIER_TAIL}`);
  const handlers: ToastHandlers = { onUndo: () => {}, onEdit: () => {}, onOpen: () => {}, onShow: () => {}, onSaveAsNew: () => {} };
  const dockTicked = dockToastOf({ kind: "added", key: 1, item: ticked, notMust: false, update: false }, { offToday: false }, handlers);
  const dockEarlier = dockToastOf({ kind: "added", key: 2, item: earlier, notMust: false, update: false }, { offToday: false }, handlers);
  const dockBody = renderToStaticMarkup(createElement("div", null, dockTicked.body));
  check("P6 dock: Undo (it takes the tick back) and no Edit (no row of its own was saved); a row ticked earlier offers neither", dockTicked.action?.label === "Undo" && !dockBody.includes(">Edit<") && dockEarlier.action === undefined);
  const list = renderToStaticMarkup(
    createElement(JustAdded, {
      entries: [
        { key: "a", item: ticked, line: { text: "x gym 45m", reverted: [] }, at: 0 },
        { key: "b", item: earlier, line: { text: "x stretch", reverted: [] }, at: 0 },
      ],
      wide: true,
      showAll: true,
      onShowAll: () => {},
      onEdit: () => {},
      onUndo: () => {},
      busy: new Set<string>(),
      locked: new Map<string, string>(),
    })
  );
  check("P6 'Added here': no Edit on a tick of the named row; its Undo says it takes the tick back; none on one ticked earlier", !list.includes(">Edit<") && (list.match(/>Undo</g) ?? []).length === 1 && list.includes('aria-label="Undo the tick of Gym"'), list.slice(0, 800));
  const undone = renderToStaticMarkup(
    createElement(JustAdded, { entries: [{ key: "a", item: ticked, line: { text: "x gym 45m", reverted: [] }, at: 0, removedAt: 1 }], wide: true, showAll: true, onShowAll: () => {}, onEdit: () => {}, onUndo: () => {}, busy: new Set<string>(), locked: new Map<string, string>() })
  );
  check("P6 'Added here': an undone tick reads 'Tick taken back · Gym' (the row stays; only the tick went), never 'Removed'", undone.includes("Tick taken back · ") && !undone.includes("Removed") && /head: TICK_TAKEN_BACK \}\);/.test(read("src/components/capture/QuickCapture.tsx")));

  // The chip's choice travels with the line, retries included.
  const stamped = { ...stampLine({ text: "x gym", reverted: [] }, 1, Date.parse("2026-10-01T01:00:00.000Z"), "abc"), asNew: true as const };
  check("P6 pending: a line turned back into a new task keeps asNew through storage; any other value is dropped", parsePendingList([stamped])[0]?.asNew === true && parsePendingList([{ ...stamped, asNew: "yes" }])[0]?.asNew === undefined);
  const cache = parseVocabCache({ day: "2026-10-01", at: 1, goals: [], recent: [], rawBefore: 0, active: [{ normTitle: "gym", title: "Gym", where: { lane: "habits", label: "Habits" }, tick: "open" }, { normTitle: "run", title: "Run", where: { lane: "anytime", label: "Anytime" }, tick: "nope" }] });
  check("P6 vocabulary cache: a title keeps its tick ('open' or 'done'); anything else (a cache from before P6) offers none", cache?.active[0].tick === "open" && cache?.active[1].tick === undefined);

  // The sheet's wiring, read from the source.
  const quick = read("src/components/capture/QuickCapture.tsx");
  check(
    "P6 sheet: the match is tickMatchOf over the vocabulary (never on a paste, an aim, a weigh-in or an idea), and the primary reads it",
    /vocab && !paste && !aimCap && !weighIn && !ideaMode\s*\?\s*tickMatchOf\(parsed, vocab\.active, \{ editing: !!editing, work: workBoard !== null, asNew: asNewHere, fresh: tickFresh \}\)/.test(quick) &&
      /const tickFresh = !!vocab && vocab\.day === day && vocab\.priced;/.test(quick) &&
      /primaryAction\(\{ editing: !!editing, coarse, empty, sentThisOpening, parsed, ticks: tickMatch \? \(tickMatch\.tick \?\? true\) : null \}\)/.test(quick) &&
      /ticks=\{tickMatch\}\s*onTickAsNew=\{tickAsNew\}/.test(quick)
  );
  check(
    "P6 sheet: a tapped chip makes the line asNew on its stamp, the send passes it, and the stored line keeps it",
    /const asNew = asNewNorm !== null && asNewNorm === normTitleOf\(read\.title\);/.test(quick) &&
      /const pending: PendingLine = asNew \? \{ \.\.\.stamped, asNew: true \} : stamped;/.test(quick) &&
      /weightUnit, asNew: line\.asNew === true \}\);/.test(quick) &&
      /\.\.\.\(line\.asNew \? \{ asNew: true as const \} : \{\}\)/.test(quick)
  );
  check(
    "P6 sheet: the Undo of a tick of the named row is the tick's (undoCompletion with its instance), never undoCapture of the row",
    /if \(item\.ticked\) \{\s*undoTick\(item\);\s*return;\s*\}/.test(quick) && /await undoCompletion\(ticked\.instanceId, \{ refresh: onTodayRef\.current \}\)/.test(quick) && /!toast\.item\.ticked\?\.earlier \? toast\.item : null/.test(quick)
  );
  check(
    "P6 review sheet: a line that asks a tick over a list not fresh has it read at once (once per opening, never with a save in flight, the refresh after a save still its own), a pasted list's too",
    /if \(openRef\.current && tickRefreshRef\.current && !o\.tickRead\) \{\s*o\.tickRead = true;\s*loadVocab\(false\);\s*return;\s*\}/.test(quick) &&
      /useEffect\(\(\) => \{\s*if \(tickRefresh\) considerVocab\(\);\s*\}, \[tickRefresh, considerVocab\]\);/.test(quick) &&
      /const tickRefresh = open && !aimCap && \(paste \? pasteAsksTick : tickWantsRefresh\(parsed, \{ fresh: tickFresh, editing: !!editing, work: onWork, asNew: asNewHere \}\)\);/.test(quick)
  );
  check(
    "P6 review sheet: the chip's 'a new task' ends with its line: an emptied, saved or replaced line drops it, and so does closing the sheet",
    /if \(!next\.trim\(\)\) setAsNewNorm\(null\);/.test(quick) && /setBlocked\(null\);\s*setAsNewNorm\(null\);\s*setFeedsOpen\(false\);/.test(quick)
  );

  // P6 review: a pasted list's done-now lines say which row they tick, each with its own 'As a new task' toggle.
  const pasted = (asNew?: boolean[]) =>
    renderToStaticMarkup(createElement(PastePreview, { lines: ["x gym 45m", "buy milk"], truncated: false, today: "2026-10-01", onRemove: () => {}, active, asNew, onToggleAsNew: () => {} }));
  const pastedTick = pasted();
  const pastedNew = pasted([true, false]);
  check(
    "P6 review paste: a pasted done-now line previews the row it ticks ('Ticks: Gym (Habits)') with a 44 px 'As a new task' toggle; pressed, it previews the new task",
    pastedTick.includes("Ticks: Gym (Habits)") && (pastedTick.match(/capture-paste-new/g) ?? []).length === 1 && pastedTick.includes('aria-pressed="false"') && pastedTick.includes(`>${PASTE_AS_NEW}<`) &&
      pastedTick.includes('aria-label="Add “x gym 45m” as a new task instead of ticking Gym"') &&
      !pastedNew.includes("Ticks:") && pastedNew.includes('aria-pressed="true"') && pastedNew.includes("Done today") &&
      !renderToStaticMarkup(createElement(PastePreview, { lines: ["x gym 45m", "buy milk"], truncated: false, today: "2026-10-01", onRemove: () => {}, active: null })).includes("Ticks:"),
    pastedTick.slice(0, 900)
  );
  check(
    "P6 review paste: the preview reads the sheet's list only while fresh, a toggled line is stamped asNew and the batch sends it",
    /active=\{vocab && tickFresh \? vocab\.active : null\}/.test(quick) &&
      /return paste\.asNew\?\.\[i\] \? \{ \.\.\.stamped, asNew: true \} : stamped;/.test(quick) &&
      /\.\.\.\(l\.asNew \? \{ asNew: true \} : \{\}\) \}\)\),/.test(quick)
  );
  const board = read("src/components/today/TodayBoard.tsx");
  check("P6 board: a tick of the named row is found and flashed (sought), never called 'just added'", /if \(item\.ticked\) setSeek\(\{ id: item\.id, at: Date\.now\(\), sought: true \}\);\s*else showCaptured\(item\.id, item\.where\?\.lane \?\? null\);/.test(board));
}

// ── Source guards for the sheet (markup and CSS no function holds) ────────

{
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const quick = read("src/components/capture/QuickCapture.tsx");
  const css = strip(read("src/app/capture.css"));
  const chrome = read("src/components/shell/Chrome.tsx");
  const form = /<form className="capture-form" noValidate onSubmit=\{onFormSubmit\}>([\s\S]*?)<\/form>/.exec(quick)?.[1] ?? "";
  check(
    "enter wiring: only the line sits in the form, a wrapping textarea whose line break submits it (no button inside)",
    (form.match(/<textarea/g) ?? []).length === 1 &&
      !form.includes("<input") &&
      !form.includes("<button") &&
      /function onLineBreak\(e: Event\) \{[\s\S]*?insertLineBreak[\s\S]*?e\.preventDefault\(\);\s*\(e\.target as HTMLTextAreaElement\)\.form\?\.requestSubmit\(\);/.test(quick) &&
      quick.includes('addEventListener("beforeinput", onLineBreak)')
  );
  check("enter wiring: a line break that slips into the line becomes a space (the line stays one line)", /const raw = \/\[\\r\\n\]\/\.test\(input\) \? input\.replace\(\/\\r\?\\n\/g, " "\) : input;/.test(quick));
  check("enter wiring: enterKeyHint is 'send' on a phone and 'done' on a desktop, never 'next'", quick.includes('enterKeyHint={coarse ? "send" : "done"}') && !/enterKeyHint=["{][^}\n]*next/.test(quick));
  check("enter wiring: an action key mid-composition saves once on compositionend", /onCompositionEnd=\{[\s\S]*?submitAfterComposition\.current[\s\S]*?submit\(/.test(quick));
  check("enter wiring: coarse is read on open (pointer: coarse)", quick.includes('matchMedia("(pointer: coarse)")'));
  check("autocorrect: the line uses the task profile", quick.includes('useAutocorrect(onLineChange, true, "task")'));
  check("save: the line is stored as pending before it is sent", /addPending\(pending\);[\s\S]*?sendLine\(pending, "user"\)/.test(quick));
  check("save: a pasted list is stamped and stored before the one call", /const lines = paste\.lines\.map\([\s\S]*?stampLine[\s\S]*?addPending\(\.\.\.lines\)[\s\S]*?sendBatch\(lines\)/.test(quick));
  check("retry: online, the tab becoming visible and the sheet opening send the queue", quick.includes('addEventListener("online"') && quick.includes('addEventListener("visibilitychange"') && quick.includes("flushRef.current(true)"));
  check("retry: offline says Queued, never 'Didn't save'", read("src/components/capture/CaptureToast.tsx").includes(`title: "Queued"`) && read("src/components/capture/CaptureToast.tsx").includes("Saves when you're back online."));
  check("unsent: the root carries data-capture-unsent and the sr text is portalled with the sheet", quick.includes("root.dataset.captureUnsent = String(") && quick.includes("delete root.dataset.captureUnsent") && /<span id="capture-unsent" className="sr-only">/.test(quick));
  check("unsent: the three capture buttons are described by #capture-unsent (the only shell edit)", (chrome.match(/aria-describedby="capture-unsent"/g) ?? []).length === 3);
  const dot = /html\[data-capture-unsent\] :is\(\.tab-plus, \.r-plus, \.sb-capture\)::after\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  check("unsent: an 8 px ink dot with a 2 px --bar ring, static", /width:\s*8px/.test(dot) && /height:\s*8px/.test(dot) && /background:\s*var\(--ink-0\)/.test(dot) && /0 0 0 2px var\(--bar\)/.test(dot) && !/animation|transition/.test(dot));
  // Word completion (2026-10-13, word-model-check has the rest): the model loads at once for an idea line and with the
  // background refresh for a task line (never ahead of a save); completion is on for both, off where the slot is not its.
  check(
    "vocab: the words load at once for an idea line and with the background refresh otherwise; completion on idea and task lines",
    quick.includes("loadCaptureVocabulary(withWords ? { words: true } : undefined)") &&
      /if \(openRef\.current && ideaModeRef\.current && !v\?\.words\) \{\s*o\.refreshed = true;\s*loadVocab\(true\);/.test(quick) &&
      /o\.refreshed = true;\s*loadVocab\(!v\?\.words\);/.test(quick) &&
      quick.includes("useWordComplete(vocab?.words ?? null, { enabled: wordsOn, mayFlush: wordsMayFlush })")
  );
  check("ideas: the Idea link writes the handoff, never the URL", /const onIdeaLink[\s\S]*?writeIdeaHandoff\(\{ question: s\.question, answer: s\.answer \?\? "", sheetText: t \}\)/.test(quick) && /href="\/add"/.test(quick));
  check("ideas: /add's clear event empties the line only while it still matches", /SHEET_DRAFT_CLEARED_EVENT[\s\S]*?lineRef\.current\.text !== detail\.text/.test(quick) || /lineRef\.current\.text !== detail\.text[\s\S]*?SHEET_DRAFT_CLEARED_EVENT/.test(quick));
  check("back: pushState is hash-only and guarded by the decision", quick.includes('window.history.pushState(null, "", CAPTURE_OPEN_HASH)') && /historyOnOpen\(/.test(quick) && /historyOnClose\(/.test(quick));
  check("fragment: a link only fills the line (it opens the sheet, never saves)", quick.includes('openSheet({ text: linked, source: "link" })') && quick.includes("readCaptureFragment(hash)"));
  check("paste: the clipboard's plain text is read on paste only", quick.includes('clipboardData?.getData("text/plain")') && !/navigator\.clipboard/.test(quick));
  check("word hints: no data-hints padding switch is left", !/data-hints/.test(css) && !/data-hints/.test(quick));

  // The cover-screen layout: growth above the line, nothing below it changes height.
  const rule = (sel: string) => new RegExp(`(^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[2] ?? "";
  check("layout: the sheet sits on the keyboard (bottom: var(--kb))", /bottom:\s*var\(--kb, 0px\)/.test(rule(".capture-sheet")));
  check("layout: the region above the line takes the growth and scrolls", /flex:\s*1 1 auto/.test(rule(".capture-scroll")) && /min-height:\s*0/.test(rule(".capture-scroll")) && /overflow-y:\s*auto/.test(rule(".capture-scroll")));
  check("layout: the line's region is fixed (flex none)", /flex:\s*none/.test(rule(".capture-fixed")));
  check("layout: the unfolded Fold's panel sits on the keys while --kb > 0", /\.capture-sheet\[data-kb="1"\]\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*calc\(var\(--kb, 0px\) \+ 12px\)/.test(css));
  check("layout: the insert row is one row that scrolls sideways", /flex-wrap:\s*nowrap/.test(rule(".capture-insert")) && /overflow-x:\s*auto/.test(rule(".capture-insert")));
  check("layout: an idea line's word hints keep their height (in flow)", (cssValue(css, ".capture-hints", "min-height") ?? 0) >= 40);
  const at = (name: string, sel: string, min: number) => check(`touch target: ${name} ≥ ${min}px`, (cssValue(css, sel, "min-height") ?? 0) >= min, String(cssValue(css, sel, "min-height")));
  at("the rows' Edit, Undo, Retry, Dismiss", ".btn.capture-row-btn", 40);
  at("an 'Added here' row", ".capture-added-row,\n.capture-paste-row", 44);
  at("the editing pill (Cancel)", ".capture-editing", 40);
  at("the insert row", ".capture-insert", 40);
  at("the footer row (the Idea link)", ".capture-foot-row", 40);
  // P6 review: the done-now chips are 44 px (the one way to keep a line as a new task, D33).
  at("the done-now line's 'Ticks:' chip", ".chip.btn-chip.capture-ticks", 44);
  at("a pasted done-now line's 'As a new task'", ".chip.btn-chip.capture-paste-new", 44);
  check(
    "layout (P6 review): on a narrow screen only the 'Ticks:' chip's title is cut short (an ellipsis); 'Ticks:', the lane and the x never shrink, and its row may take the whole width",
    /flex:\s*none/.test(rule(".capture-ticks > *")) &&
      /min-width:\s*0/.test(rule(".capture-ticks .capture-ticks-title")) && /overflow:\s*hidden/.test(rule(".capture-ticks .capture-ticks-title")) && /text-overflow:\s*ellipsis/.test(rule(".capture-ticks .capture-ticks-title")) && /flex:\s*0 1 auto/.test(rule(".capture-ticks .capture-ticks-title")) &&
      /max-width:\s*100%/.test(rule(".capture-sheet[data-layout] .capture-chip-row.capture-ticks-row > li")) && /min-width:\s*0/.test(rule(".capture-sheet[data-layout] .capture-chip-row.capture-ticks-row > li"))
  );
  const insertRow = read("src/components/capture/InsertRow.tsx");
  check("insert row: every chip is the kit's 40 px chip button and keeps the line's focus", (insertRow.match(/className="chip btn-chip capture-ins"/g) ?? []).length >= 3 && (insertRow.match(/onMouseDown=\{keepFocus\}/g) ?? []).length >= 3);
  check("insert row: role=group 'Add to the line', the opener carries aria-expanded", insertRow.includes('role="group" aria-label="Add to the line"') && insertRow.includes("aria-expanded={expanded}"));
  check("inputs: the line is 16 px (no zoom on phones)", /font:\s*400 16px/.test(rule(".capture-input")));
  const chips = read("src/components/capture/CaptureChips.tsx");
  check("honest ≈: no price until today's vocabulary has loaded ('priced on save')", chips.includes('"priced on save"') && /rawBefore === null\) return \{ sizing, minutes, xp: null \}/.test(chips));

  // U3: the pinned footer is one row (the hint and the Idea link side by side), never the panel's column.
  check("layout: the pinned footer is the row alone (not also .capture-foot, whose column it would inherit)", quick.includes('<div className="capture-foot-row" id="capture-help">') && !/className="capture-foot capture-foot-row"/.test(quick));
  check("layout: .capture-foot-row is a row in its own right", /flex-direction:\s*row/.test(rule(".capture-foot-row")) && !/flex-direction:\s*column/.test(rule(".capture-foot-row")));

  // U4: the back chip (icon only) is 40 px wide, like every chip in the row.
  check("touch target: an insert chip (the icon-only back chip) is ≥ 40px wide", (cssValue(css, ".capture-ins", "min-width") ?? 0) >= 40 && /justify-content:\s*center/.test(rule(".capture-ins")), String(cssValue(css, ".capture-ins", "min-width")));

  // U7: the hidden scrollbar's place is taken by an edge fade; the cover screen drops the ▾ glyphs.
  check(
    "insert row: an overflowing row fades the edge with chips past it (data-fade end, start, both)",
    ["end", "start", "both"].every((f) => new RegExp(`\\.capture-insert\\[data-fade="${f}"\\]\\s*\\{[^}]*mask-image:\\s*linear-gradient`).test(css)) &&
      /function useEdgeFade[\s\S]*?scrollWidth - row\.clientWidth - row\.scrollLeft[\s\S]*?setAttribute\("data-fade"/.test(insertRow) &&
      (insertRow.match(/useEdgeFade\(rowRef,/g) ?? []).length === 2
  );
  check("insert row: under 400 px the ▾ glyphs go (aria-expanded still says it is a menu)", /@media \(max-width: 399px\)\s*\{\s*\.capture-ins svg\.i\.capture-ins-chev\s*\{\s*display:\s*none/.test(css) && insertRow.includes('useMediaQuery("(max-width: 399px)")'));

  // U10 and U4, rendered: the opener is the same element in both states, and says which.
  const row = (menu: Parameters<typeof InsertRow>[0]["menu"], text = "pay rent") =>
    renderToStaticMarkup(
      createElement(InsertRow, { parsed: parseCapture(text, { today: TODAY }), text, today: TODAY, goals: [{ id: "g1", title: "Run a marathon" }], menu, onMenu: () => {}, onInsert: () => {} })
    );
  const top = row(null);
  const inWhen = row("when");
  const openerTop = /<button[^>]*data-menu-opener="when"[^>]*>/.exec(top)?.[0] ?? "";
  const openerOpen = /<button[^>]*data-menu-opener="when"[^>]*>/.exec(inWhen)?.[0] ?? "";
  check(
    "a11y: the When opener says aria-expanded=false on the row and true in its menu, where it is the back chip (the first chip)",
    /aria-expanded="false"/.test(openerTop) && /aria-expanded="true"/.test(openerOpen) && /aria-label="When options\. Back"/.test(openerOpen) && inWhen.indexOf(openerOpen) < inWhen.indexOf("Today"),
    `${openerTop} | ${openerOpen}`
  );
  check(
    "a11y: the opener and its back chip are one element — one key ('opener:<menu>') in one array, so opening a menu never unmounts it",
    (insertRow.match(/key=\{`opener:\$\{opens\}`\}/g) ?? []).length === 1 &&
      insertRow.includes("if (c.menu) return opener(c.menu, c.label, false);") &&
      insertRow.includes("{menu ? [opener(menu, MENU_NAME[menu], true), ...items] : items}") &&
      !/\{menu && \(/.test(insertRow)
  );
  check("a11y: 'Tmr · Fri' is named for a screen reader, and the goal menu's 'Link to' is not a chip", inWhen.includes('aria-label="Tomorrow, Friday: Add “tmr” to the line"') && /<span class="capture-ins-eyebrow" aria-hidden="true">Link to<\/span>/.test(row("goal")));
  check(
    "a11y: Escape in an open menu closes the menu first (the row, the line, and the sheet's Escape layer)",
    /const onRowKeyDown[\s\S]*?e\.key !== "Escape" \|\| !menu[\s\S]*?e\.preventDefault\(\);[\s\S]*?onMenu\(null\)/.test(insertRow) &&
      insertRow.includes("onKeyDown={onRowKeyDown}") &&
      /if \(e\.key === "Escape" && !e\.nativeEvent\.isComposing\) \{\s*e\.preventDefault\(\);\s*if \(menu\) closeMenu\(\);\s*else closeSheet\("escape"\);/.test(quick) &&
      /pushEscapeLayer\(\(\) => \{\s*if \(menuRef\.current\) \{[\s\S]*?return;\s*\}\s*closeSheet\("escape"\);/.test(quick)
  );
  check("a11y: a menu opening or closing is announced", /const onMenu = \(next: InsertMenu \| null\) => \{\s*setMenu\(next\);\s*announce\(menuNote\(next\)\);/.test(quick) && quick.includes("onMenu={onMenu}"));

  // U2: a tap anywhere in the sheet keeps the line's focus (and the phone keyboard); the line comes back after a row's action.
  check(
    "focus: the sheet's mousedown keeps the line focused unless the tap is on a text field",
    /const onSheetMouseDown = [\s\S]*?document\.activeElement !== input[\s\S]*?closest\('input, textarea, select, \[contenteditable\]:not\(\[contenteditable="false"\]\)'\)[\s\S]*?e\.preventDefault\(\);/.test(quick) &&
      quick.includes("onMouseDown={onSheetMouseDown}")
  );
  check(
    "focus: Undo, Retry, Dismiss, Save as new and OK give the line its focus back on a phone",
    /const refocusLine = \(\) => \{\s*if \(openRef\.current && coarseRef\.current\) focusInput\(\);/.test(quick) && (quick.match(/refocusLine\(\);/g) ?? []).length >= 5
  );

  // U5: the board's flash waits for the sheet to close (it would play behind the scrim).
  check(
    "flash: a capture confirmed while the sheet is open is held, and the board hears of it when the sheet closes",
    /if \(openRef\.current\) heldCaptured\.current = item;\s*else window\.dispatchEvent\(new CustomEvent<CapturedItem>\(CAPTURED_EVENT/.test(quick) &&
      /const held = heldCaptured\.current;\s*heldCaptured\.current = null;\s*if \(held\) flashHeld\(held, decision === "back"\);/.test(quick) &&
      (quick.match(/CAPTURED_EVENT, \{ detail: item \}/g) ?? []).length === 2
  );
  // TodayBoard flashes one row at a time (one `seek`), so the last capture is the one to show.
  // (A week quest row's seek shares the one slot, marked `sought`: roadmap F17.)
  check(
    "flash: the board seeks one capture at a time (so the sheet holds the last one)",
    /const \[seek, setSeek\] = useState<\{ id: string; at: number(; sought\?: boolean)? \} \| null>/.test(read("src/components/today/TodayBoard.tsx"))
  );

  // U13: the toast's '·' is its own aria-hidden span, outside every link and button.
  const body = renderToStaticMarkup(
    createElement(ToastBody, { copy: toastCopy(capItem({ id: "abc", title: "Pay rent" }), { offToday: true }), onEdit: () => {} })
  );
  const actions = [...body.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
  check(
    "a11y: the toast's '·' separators are aria-hidden spans, never inside Edit or View (nor in their names)",
    actions.length === 2 && actions.every((t) => !t.includes("·")) && (body.match(/<span class="capture-toast-sep" aria-hidden="true">·<\/span>/g) ?? []).length === 3,
    body
  );
  check("a11y: no generated '·' on the toast line's children (a ::before would join the link)", !/capture-toast-line[^{]*::before/.test(css));
}

// ═══ M2: Duty on Today (lane D: F3 UI, F10 strip, F12, F13 sheet) ═════════
// The board never opens on red: debt only inside the Must lane (one card or
// one collapsed summary) and the Owed row; one .o1 card at most; no row shows
// a break settlement has not judged; before launch, the pre-M2 board exactly.

{
  const LAUNCH: DayKey = "2026-09-28"; // a Monday before TODAY, so these fixtures are live
  const dutyOf = (p: Partial<DutyBoard> = {}): DutyBoard => ({
    live: true,
    launchDay: LAUNCH,
    cursor: addDays(TODAY, -2),
    owed: [],
    rest: { yesterday: null, today: null, tomorrow: null, vacationUntil: null },
    freezes: { banked: 0, willCover: false },
    pending: {},
    settled: [],
    ...p,
  });
  const owedCard = (p: Partial<OwedCard> & { instanceId: string; templateId: string; title: string; day: DayKey }): OwedCard => ({
    archived: false,
    slot: 0,
    debtXp: 4.2,
    restoreBy: addDays(p.day, 2),
    restoresToday: true,
    restoresStreak: 12,
    mvv: null,
    makeUpXp: 3.5,
    minimumXp: null,
    studyLinked: false,
    canWriteOff: false,
    ...p,
  });
  const TUE = addDays(TODAY, -2);
  const MON = addDays(TODAY, -3);
  const stretch = owedCard({ instanceId: "o1", templateId: "s", title: "Stretch", day: TUE });
  const dishes = owedCard({ instanceId: "o2", templateId: "d", title: "Dishes", day: MON, debtXp: 8.3 });

  // owedViewOf: 0 → none, 1 → inline, 2+ → summary.
  check("owed view: no debt, no card", owedViewOf([]).kind === "none");
  const one = owedViewOf([stretch]);
  check("owed view: one debt is one inline MakeUpCard", one.kind === "inline" && one.card.instanceId === "o1");
  const two = owedViewOf([stretch, dishes]);
  check(
    "owed view: two or more collapse into one summary, oldest first, with the true total",
    two.kind === "summary" && two.count === 2 && two.totalDebt === 12.5 && two.cards[0].instanceId === "o2",
    JSON.stringify(two.kind === "summary" ? { n: two.count, t: two.totalDebt } : two)
  );
  check("owed row: 'Owed: 2 · −12.5' sums the open debts", owedTotalOf([stretch, dishes]) === 12.5 && owedTotalOf([]) === 0);

  // Asks: never the owed or the yesterday-musts notice; the weekly review is one; two visible, then 'n more'.
  const duty = todayAsksOf({
    yesterdayOpen: 1,
    recordBy: "record by 04:00 tomorrow",
    notices: [
      { id: "owed", group: "Due", tone: "warn", title: "Owed: 2 · −12.5 XP", detail: "" },
      { id: "yesterday-musts", group: "Due", tone: "info", title: "Yesterday: 2 musts open", detail: "" },
      { id: WEEK_REVIEW_NOTICE, group: "Due", tone: "info", title: "Weekly review", detail: "The week of 28 Sep, while it is open" },
    ],
  });
  check("asks: todayAsksOf ignores the owed and the record notices; the weekly review is an Ask", duty.map((a) => a.id).join(",") === `yesterday,${WEEK_REVIEW_NOTICE}`, duty.map((a) => a.id).join(","));
  check("asks: nothing Duty brings is owed-toned", duty.every((a) => a.tone === "ask") && duty[1].href === "/today/week?view=run");
  const four = ["a", "b", "c", "d"];
  check(
    "asks: two visible at most, then 'n more'",
    asksShown(four, false).shown.length === 2 && asksShown(four, false).more === 2 && asksShown(four, true).more === 0 && asksShown(four.slice(0, 2), false).more === 0
  );

  // Next up never selects a make-up: debts are not Must rows.
  const owing = buildBoard(board(TODAY, [], [], { duty: dutyOf({ owed: [stretch, dishes] }) }));
  const nu = nextUpOf({ quest: { reviews: 15, target: 15, dueNow: 0, met: true, cap: 15 }, must: owing.must });
  check("next up: never a make-up", nu.kind === "clear" && owing.owed.length === 2 && owing.must.length === 0, nu.kind);

  // The Must lane: renders with debts only; its chips are held or quiet, never owed.
  const lane = mustLaneOf({ must: [], owed: [stretch], restToday: null, live: true, launchDay: LAUNCH, today: TODAY });
  check("must lane: renders with debts only, and no 'n of m kept' for no musts", lane.show && lane.count === null && lane.owed.kind === "inline");
  check("must lane: nothing owed, no musts, no lane", !mustLaneOf({ must: [], owed: [], restToday: null, live: true, launchDay: LAUNCH, today: TODAY }).show);
  const rest = mustLaneOf({ must: [], owed: [stretch], restToday: "REST", live: true, launchDay: LAUNCH, today: TODAY });
  check("must lane: a rest day adds the held chip 'Rest · nothing owed'", rest.chips.length === 1 && rest.chips[0].tone === "held" && rest.chips[0].held === "rest" && rest.chips[0].text === "Rest · nothing owed");
  const ahead = mustLaneOf({ must: [], owed: [], restToday: null, live: false, launchDay: "2026-10-12", today: TODAY });
  check("must lane: before launch with a launch day set, 'Musts carry stakes from Mon 12 Oct' (held, quiet)", ahead.chips[0]?.text === "Musts carry stakes from Mon 12 Oct" && ahead.chips[0].tone === "held");
  check("must lane: no launch day, no chip (the pre-M2 lane)", mustLaneOf({ must: [], owed: [], restToday: null, live: false, launchDay: null, today: TODAY }).chips.length === 0);
  // Blueprint P9 (D14, D15): the Must lane is the Daily Quests; quiet chips for the minimum and a day over the cap.
  const dq = mustLaneOf({ must: [], owed: [stretch], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, daily: { minimum: 1, over: 2 } });
  check(
    "must lane (daily quests): '1 at minimum' and '2 over the cap' are quiet chips; none with no minimum and nothing over",
    dq.chips.map((c) => `${c.tone}:${c.text}`).join("|") === "quiet:1 at minimum|quiet:2 over the cap" &&
      mustLaneOf({ must: [], owed: [stretch], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, daily: { minimum: 0, over: 0 } }).chips.length === 0
  );
  {
    const tb = read("src/components/today/TodayBoard.tsx").replace(/\r\n/g, "\n");
    check(
      "must lane (daily quests): the personal Board titles it 'Daily quests' with its 1/0 strip under the header; a work tab keeps 'Must', no strip",
      /const daily = isWork \? null : dailyQuestsOf\(board\);/.test(tb) &&
        /title=\{daily \? DAILY_QUESTS_TITLE : "Must"\}/.test(tb) &&
        /strip=\{daily \? <DailyStrip daily=\{daily\} \/> : undefined\}/.test(tb) &&
        // Re-pinned by blueprint P29: the lane also takes the streak multiplier's chip (absent while it is off).
        /deferred: board\.deferred, \.\.\.\(daily \? \{ daily \} : \{\}\), restTokens, \.\.\.\(streakChip \? \{ streak: streakChip \} : \{\}\) \}\);/.test(tb)
    );
    // Blueprint P21 (D19): the one Rest Token bank as the Daily quests' held chip, the Momentum card's own number.
    const tokens = mustLaneOf({ must: [], owed: [stretch], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, restTokens: 2 });
    check(
      "P21 must lane: 'Rest tokens 2' is the last chip, held, with the freeze glyph (the word and the glyph, never colour alone); 0 is said as it is",
      JSON.stringify(tokens.chips[tokens.chips.length - 1]) === JSON.stringify({ tone: "held", held: "freeze", text: "Rest tokens 2" }) &&
        mustLaneOf({ must: [], owed: [stretch], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, restTokens: 0 }).chips.some((c) => c.text === "Rest tokens 0"),
      JSON.stringify(tokens.chips)
    );
    check(
      "P21 must lane: no chip without a live bank (null or absent), and the board passes momentum's run.bank on the personal Board only",
      !mustLaneOf({ must: [], owed: [stretch], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, restTokens: null }).chips.some((c) => /Rest tokens/.test(c.text)) &&
        !lane.chips.some((c) => /Rest tokens/.test(c.text)) &&
        /const restTokens = !isWork && momentum\?\.live \? momentum\.run\.bank : null;/.test(tb)
    );
    // Blueprint P29 (D25): the streak multiplier as the Daily quests' quiet chip, 'Streak ×1.16 · day 3', before the Rest
    // tokens one; only while the server sends Board.streak (the multiplier in force), and on the personal Board only.
    const streakLane = mustLaneOf({ must: [], owed: [stretch], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, restTokens: 2, streak: streakViewOf({ days: 3, floor: false }) });
    check(
      "P29 must lane: 'Streak ×1.16 · day 3' is a quiet chip just before 'Rest tokens 2' (words, never colour alone); none without Board.streak, and the board passes it on the personal Board only",
      streakLane.chips.map((c) => `${c.tone}:${c.text}`).slice(-2).join("|") === "quiet:Streak ×1.16 · day 3|held:Rest tokens 2" &&
        !tokens.chips.some((c) => /Streak/.test(c.text)) &&
        /const streakChip = !isWork && board\.streak \? board\.streak : null;/.test(tb),
      JSON.stringify(streakLane.chips)
    );
    // Review (P29): the chip says what it pays and links to the rules' Streak card (a 44 px link), and on a day with no
    // musts and no debts (the lane hidden) it stands alone, since the multiplier still prices every full tick.
    const streakChipOf = (v: MustLaneView) => [...v.chips, ...(v.solo ? [v.solo] : [])].find((c) => /^Streak/.test(c.text));
    const noMusts = mustLaneOf({ must: [], owed: [], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, restTokens: 2, streak: streakViewOf({ days: 3, floor: false }) });
    check(
      "P29 must lane: the streak chip is a link to /today/rules#streak with its words for a screen reader ('3 Full days in a row: every full tick pays ×1.16.')",
      streakChipOf(streakLane)?.href === STREAK_RULES_HREF && STREAK_RULES_HREF === "/today/rules#streak" && streakChipOf(streakLane)?.label === streakDescribe({ days: 3, floor: false }) && !streakLane.solo,
      JSON.stringify(streakChipOf(streakLane))
    );
    check(
      "P29 must lane: with no musts and no debts the lane hides and the chip is `solo` (Today draws it alone); never without Board.streak",
      !noMusts.show && noMusts.solo?.text === "Streak ×1.16 · day 3" && noMusts.solo.href === STREAK_RULES_HREF &&
        !mustLaneOf({ must: [], owed: [], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, restTokens: 2 }).solo &&
        !("solo" in mustLaneOf({ must: [], owed: [], restToday: null, live: true, launchDay: LAUNCH, today: TODAY, restTokens: 2 }))
    );
    check(
      "P29 Today: the chips draw through LaneChipView (a link chip is a 44 px Link with its label; every other chip the plain Chip), and the solo chip renders only while the lane is hidden",
      /mustView\.chips\.map\(\(c\) => <LaneChipView key=\{c\.text\} chip=\{c\} \/>\)/.test(tb) &&
        /\{!mustView\.show && mustView\.solo && \(\s*<div className="lane-chips streak-solo o5">\s*<LaneChipView chip=\{mustView\.solo\} \/>/.test(tb) &&
        /<Link href=\{chip\.href\} className="lane-chip-link" aria-label=\{chip\.label\} title=\{chip\.label\}>/.test(tb) &&
        /\.lane-chip-link \{ display: inline-flex; align-items: center; min-height: 44px;/.test(read("src/components/today/today.css"))
    );
    const laneHtml = renderToStaticMarkup(createElement(Lane, { id: "must", title: "Daily quests", must: true, count: "1 of 2 kept", strip: createElement("ol", { className: "dq-strip" }), badge: createElement("span", null, "chip") }));
    check(
      "must lane (daily quests): Lane draws the strip after the header and before the chips",
      laneHtml.indexOf('<ol class="dq-strip">') > laneHtml.indexOf(">Daily quests</h2>") && laneHtml.indexOf('<ol class="dq-strip">') < laneHtml.indexOf('<div class="lane-chips">'),
      laneHtml.slice(0, 160)
    );
    const tcss = read("src/components/today/today.css").replace(/\r\n/g, "\n");
    check(
      "must lane (daily quests): the strip's cells are tokens only (--line-2, --kept, the minimum a lighter --kept), never a 44 px target",
      tcss.includes('.today-lane .dq-cell[data-bit="1"] { background: var(--kept); }') &&
        tcss.includes(".today-lane .dq-cell[data-min] { background: color-mix(in srgb, var(--kept) 55%, var(--card)); }") &&
        /\.today-lane \.dq-cell \{ flex: 0 1 28px; min-width: 8px; height: 6px; border-radius: 3px; background: var\(--line-2\); \}/.test(tcss) &&
        !/<button|onClick/.test(read("src/components/today/DailyStrip.tsx"))
    );
  }

  // The make-up card's words: never blaming, the true minus, the window true when read.
  const priced = { ...stretch, template: { ...tpl({ id: "s", title: "Stretch", recurrence: "DAILY", estMinutes: 10, machineMinutes: 10 }) } };
  check("make-up copy: what is open and what makes it right, no blame", makeUpCopy(priced, TODAY) === "Tuesday's Stretch is still open. 10 min makes it right.", makeUpCopy(priced, TODAY));
  check("make-up copy: a study must says a make-up pays 0 and clears it", makeUpCopy({ ...stretch, studyLinked: true }, TODAY).endsWith("A make-up pays 0 and clears it."));
  const v = makeUpViewOf({ ...stretch, mvv: "5 min", minimumXp: 1.1 }, TODAY);
  check("make-up card: '−4.2 owed' is the debt, 'Stretch · Tuesday' when, the minimum priced", v.owed === 4.2 && v.when === "Stretch · Tuesday" && v.minimum?.label === "5 min" && v.minimum.price === 1.1 && v.makeUpPrice === 3.5);
  check("make-up card: within the window it says what comes back, and by when", makeUpWindowOf(stretch, TODAY) === "Within Fri 04:00 it brings back its streak of 12.", makeUpWindowOf(stretch, TODAY));
  check("make-up card: the restore budget spent, it says so", makeUpWindowOf({ ...stretch, restoresToday: false }, TODAY).startsWith("Its streak was already repaired this week"));
  check("make-up card: past the window, it clears the debt only", makeUpWindowOf({ ...dishes, day: addDays(TODAY, -5), restoreBy: addDays(TODAY, -3), restoresToday: false }, TODAY).startsWith("Past the two-day window"));
  check("make-up card: a retired template reads '(archived)'", makeUpViewOf({ ...stretch, archived: true }, TODAY).when === "Stretch (archived) · Tuesday");
  check("make-up: the resolved line says what was repaid and paid", madeUpLineOf({ xp: 3.5, debtXp: 4.2, restored: true, status: "DONE_LATE" }) === "Repaid 4.2 and paid 3.5 exactly; its streak is back.");
  // M2 review: 'Accept the loss' resolves as written off — a quiet chip and its own words, never 'Repaid' or 'Made up'.
  const wo = makeUpWordsOf({ text: "t", window: "w", resolved: { repaid: "r", minimum: "m" } }, "written-off");
  const woOwn = makeUpWordsOf({ text: "t", window: "w", resolved: { repaid: "r", minimum: "m", writtenOff: "Its −4.2 stays in Duty XP; nothing more is owed." } }, "written-off");
  check(
    "make-up card: a write-off reads 'Written off. The miss stays on the ledger.' with a quiet chip, never Repaid",
    wo.chip === "written-off" && wo.text === WRITTEN_OFF_TEXT && wo.text === "Written off. The miss stays on the ledger." && wo.sub === WRITTEN_OFF_SUB && woOwn.sub === "Its −4.2 stays in Duty XP; nothing more is owed." && !/Repaid|Made up/.test(`${wo.text} ${wo.sub}`)
  );
  check(
    "make-up card: open, repaid and minimum keep their words",
    makeUpWordsOf({ text: "t", window: "w" }, "open").text === "t" &&
      makeUpWordsOf({ text: "t", window: "w" }, "open").sub === "w" &&
      makeUpWordsOf({ text: "t", window: "w", resolved: { repaid: "r", minimum: "m" } }, "repaid").text === "Made up. Nothing owed." &&
      makeUpWordsOf({ text: "t", window: "w", resolved: { repaid: "r", minimum: "m" } }, "minimum").sub === "m"
  );
  check("owed summary: '2 musts · since Monday', and the soonest window", owedSummaryOf([stretch, dishes], TODAY).when === "2 musts · since Monday" && owedSummaryOf([stretch, dishes], TODAY).sub.startsWith("Dishes: Within"));

  // One .o1 card at most: the settled notice until dismissed, else the rest banner.
  const settledRows: SettledFact[] = [
    { source: "DEBT", day: TUE, xp: -4.2, qty: null, templateId: "s", dedupeKey: `debt:s:${TUE}:0` },
    { source: "FULL_DAY", day: TUE, xp: 0, qty: 1, templateId: null, dedupeKey: `fullday:${TUE}` },
    { source: "REPAIR", day: MON, xp: 0, qty: 1, templateId: null, dedupeKey: `repair:${MON}` },
    { source: "FREEZE_EARN", day: TUE, xp: 0, qty: 1, templateId: null, dedupeKey: `freeze-earn:${TUE}` },
  ];
  const notice = settledNoticeOf(settledRows, TUE, TODAY);
  const banner = restBannerOf({ yesterday: null, today: "REST", tomorrow: null, vacationUntil: null }, TODAY);
  check(
    "o1: one card at most (the settled notice first, then the rest banner)",
    o1CardOf({ settled: notice, settledDismissed: false, banner }) === "settled" &&
      o1CardOf({ settled: notice, settledDismissed: true, banner }) === "rest" &&
      o1CardOf({ settled: null, settledDismissed: false, banner: null }) === null
  );

  // settledNoticeOf: once per d, only while today ≤ d + 2, never an owed chip.
  check("settled: the latest settled day, while today ≤ d + 2", notice?.day === TUE && settledNoticeOf(settledRows, TUE, addDays(TUE, 3)) === null && settledNoticeOf(settledRows, TUE, addDays(TUE, 1))?.day === TUE);
  check("settled: never an owed chip (the debt is a quiet line pointing to the Must lane)", !!notice && notice.chips.every((c) => c.tone === "kept" || c.tone === "held" || c.tone === "quiet") && notice.chips.some((c) => c.tone === "quiet" && c.text.includes("Must lane")));
  check("settled: a Full day, the day it repaired, and a freeze earned", !!notice && notice.fullDay && notice.repairedDay === MON && notice.title === "Tuesday was a Full day." && notice.chips.some((c) => c.text === "Freeze earned"));
  check("settled: nothing to say, no notice; no cursor, no notice", settledNoticeOf([], TUE, TODAY) === null && settledNoticeOf(settledRows, null, TODAY) === null);
  check("settled: dismissed per device under 'settled:<d>'", settledKey(TUE) === `settled:${TUE}`);
  check("settled: an early settle says the day is locked", settledNoticeOf(settledRows.map((r) => ({ ...r, day: WED })), WED, TODAY)?.note?.includes("locked") === true);
  // M2 review: on d + 2 an early settle and the 04:00 one look alike, so the note claims neither; the Full-day chip says 'up to'.
  check("settled: on d + 2 the note is neutral (never 'Judged at 04:00 today')", notice?.note === "Settled; nothing else changed.", notice?.note ?? "");
  check(
    "settled: the Full-day chip says 'up to +0.5 MP' (the weekly cap can trim it to 0)",
    !!notice && notice.chips.some((c) => c.text === "Full day · up to +0.5 MP when the week is judged") && !notice.chips.some((c) => c.text.includes("· MP when"))
  );
  // M2 review blocker: the launch cursor (firstDutyDay − 1) is no settled day, so it says nothing (settledFor's floor).
  check(
    "settled: a cursor below the floor (the launch cursor) gives no notice; at or above it, the notice",
    settledNoticeOf(settledRows, TUE, TODAY, { floor: addDays(TUE, 1) }) === null && settledNoticeOf(settledRows, TUE, TODAY, { floor: TUE })?.day === TUE
  );

  // The rest banner: a held glyph and words; Cancel only for a day not started; 'Even on rest days' musts still owed.
  check("rest banner: words plus the held glyph, and nothing to cancel once the day started", banner?.text === "Rest day. Nothing is owed today." && banner.kind === "REST" && HELD_GLYPH[banner.kind] === "rest" && banner.cancelDay === null);
  const owedOnRest = restBannerOf({ yesterday: null, today: "REST", tomorrow: null, vacationUntil: null }, TODAY, { stillOwed: 1 });
  check("rest banner: an 'Even on rest days' must is still owed, and it says so", !!owedOnRest && owedOnRest.text.includes("still owed") && !owedOnRest.text.includes("Nothing is owed"));
  const away = restBannerOf({ yesterday: null, today: "VACATION", tomorrow: "VACATION", vacationUntil: addDays(TODAY, 4) }, TODAY);
  check("rest banner: a vacation says until when, and can end after today", away?.text.startsWith("Vacation until Mon 5 Oct.") === true && away?.cancelDay === addDays(TODAY, 1) && away?.cancelTo === addDays(TODAY, 4), away?.text);
  const restTomorrow = restBannerOf({ yesterday: null, today: null, tomorrow: "REST", vacationUntil: null }, TODAY);
  check("rest banner: a rest declared for tomorrow can be cancelled", restTomorrow?.text === "Rest tomorrow (Fri 2 Oct). Nothing will be owed." && restTomorrow.cancelDay === addDays(TODAY, 1));
  const awayNext = restBannerOf({ yesterday: null, today: null, tomorrow: "VACATION", vacationUntil: null, vacationFromTomorrowUntil: addDays(TODAY, 5) }, TODAY);
  const awayUnknown = restBannerOf({ yesterday: null, today: null, tomorrow: "VACATION", vacationUntil: null }, TODAY);
  check(
    "rest banner: a vacation from tomorrow names its last day, and never a made-up one",
    awayNext?.text === "Vacation from tomorrow until Tue 6 Oct. Nothing will be owed." && awayNext.cancelTo === addDays(TODAY, 5) && awayUnknown?.text === "Vacation from tomorrow. Nothing will be owed." && awayUnknown.cancelDay === null,
    `${awayNext?.text} | ${awayUnknown?.text}`
  );
  check("rest banner: nothing declared, no banner", restBannerOf({ yesterday: "REST", today: null, tomorrow: null, vacationUntil: null }, TODAY) === null);
  // M2 review: a banner for tomorrow never says 'Nothing will be owed' while an 'Even on rest days' must is due then.
  const restTomorrowOwed = restBannerOf({ yesterday: null, today: null, tomorrow: "REST", vacationUntil: null }, TODAY, { stillOwedTomorrow: 1 });
  const awayNextOwed = restBannerOf({ yesterday: null, today: null, tomorrow: "VACATION", vacationUntil: null, vacationFromTomorrowUntil: addDays(TODAY, 5) }, TODAY, { stillOwedTomorrow: 2 });
  check(
    "rest banner: tomorrow's 'Even on rest days' musts stay owed, and it says so (rest and vacation)",
    restTomorrowOwed?.text === "Rest tomorrow (Fri 2 Oct). Only your 'Even on rest days' must will be owed." &&
      awayNextOwed?.text === "Vacation from tomorrow until Tue 6 Oct. Only your 'Even on rest days' musts will be owed." &&
      !restTomorrowOwed.text.includes("Nothing will be owed"),
    `${restTomorrowOwed?.text} | ${awayNextOwed?.text}`
  );
  check(
    "rest banner: the declared days a tomorrow banner speaks for (tomorrow, or the vacation's run; none when today is held)",
    JSON.stringify(declaredAheadOf({ yesterday: null, today: null, tomorrow: "REST", vacationUntil: null }, TODAY)) === JSON.stringify({ from: addDays(TODAY, 1), to: addDays(TODAY, 1) }) &&
      JSON.stringify(declaredAheadOf({ yesterday: null, today: null, tomorrow: "VACATION", vacationUntil: null, vacationFromTomorrowUntil: addDays(TODAY, 5) }, TODAY)) ===
        JSON.stringify({ from: addDays(TODAY, 1), to: addDays(TODAY, 5) }) &&
      declaredAheadOf({ yesterday: null, today: "REST", tomorrow: "REST", vacationUntil: null }, TODAY) === null &&
      declaredAheadOf({ yesterday: null, today: null, tomorrow: null, vacationUntil: null }, TODAY) === null
  );
  {
    const FRI = addDays(TODAY, 1);
    const medsDaily = tpl({ id: "medsD", title: "Meds", recurrence: "DAILY", compulsory: true, compulsoryOnRest: true });
    const gymDaily = tpl({ id: "gymD", title: "Gym", recurrence: "DAILY", compulsory: true });
    const monOnly = tpl({ id: "monO", title: "Bins", recurrence: "DOW:1", compulsory: true, compulsoryOnRest: true });
    const runTarget = tpl({ id: "runT", title: "Run", recurrence: "TARGET:3/W", compulsory: true, compulsoryOnRest: true });
    const restOffSoon = tpl({ id: "roS", title: "Stretch", recurrence: "DAILY", compulsory: true, compulsoryOnRest: true, pendingChange: { v: 1, next: { effectiveDay: FRI, compulsoryOnRest: false } } });
    const inboxMust = tpl({ id: "inbM", title: "Pills?", recurrence: "DAILY", compulsory: true, compulsoryOnRest: true, inbox: true });
    check(
      "rest banner: onRestMustsIn counts the 'Even on rest days' musts due on the declared days (a TARGET one too), never a plain must, an inbox item, or one whose 'Even on rest days' ends first",
      onRestMustsIn([medsDaily, gymDaily, inboxMust, restOffSoon], FRI, FRI) === 1 &&
        onRestMustsIn([monOnly], FRI, FRI) === 0 &&
        onRestMustsIn([monOnly], FRI, addDays(FRI, 4)) === 1 &&
        onRestMustsIn([runTarget], FRI, FRI) === 1 &&
        onRestMustsIn([gymDaily], FRI, addDays(FRI, 6)) === 0,
      [onRestMustsIn([medsDaily, gymDaily, inboxMust, restOffSoon], FRI, FRI), onRestMustsIn([monOnly], FRI, addDays(FRI, 4)), onRestMustsIn([runTarget], FRI, FRI)].join(",")
    );
  }
  const restRows = [
    { day: addDays(TODAY, 1), kind: "REST", declaredAt: new Date(at(TODAY, 9)), cancelledAt: null },
    { day: addDays(TODAY, 2), kind: "REST", declaredAt: new Date(at(addDays(TODAY, 2), 9)), cancelledAt: null },
  ];
  const rs = restStateOf(restRows, TODAY);
  check("rest state: a REST declared after its day started never counts (heldDaysOf's rule)", rs.rest.tomorrow === "REST" && rs.declared.length === 1);

  // Rest day d, opened at d + 2 before settlement: no row shows a broken streak.
  const walk = tpl({ id: "walk", title: "Walk", recurrence: "DAILY", startDay: addDays(TODAY, -20) });
  const walkRule = parseRule("DAILY")!;
  const hist: BoardInstance[] = [];
  for (let n = 20; n >= 3; n--) {
    const day = addDays(TODAY, -n);
    if (day !== TUE) hist.push({ id: `w${n}`, templateId: "walk", day, slot: 0, status: "DONE", source: "manual", xpPaid: 1 });
  }
  const restOn = TUE;
  const histRest = hist;
  const cursor = addDays(restOn, -1);
  const bare = statsFor(walk, walkRule, histRest, TODAY);
  const held = statsFor(walk, walkRule, histRest, TODAY, boardStreakOptionsOf(walk, { live: true, cursor, restDays: new Set([restOn]), freezeDays: new Set() }));
  check("rest day d at d + 2, before settlement: the read without the cursor would show a break; the board's reads hold it", bare.streak.before.days === 0 && held.streak.before.days > 0, `${bare.streak.before.days} / ${held.streak.before.days}`);
  const unsettled = statsFor(walk, walkRule, histRest, TODAY, boardStreakOptionsOf(walk, { live: true, cursor, restDays: new Set(), freezeDays: new Set() }));
  check("an unsettled day with nothing recorded reads pending, never a break", unsettled.streak.before.days > 0);
  check("before launch, the habit reads take no options (M1/M5 behaviour)", Object.keys(boardStreakOptionsOf(walk, { live: false, cursor, restDays: new Set([restOn]), freezeDays: new Set() })).length === 0);
  const meds = tpl({ id: "meds", title: "Meds", recurrence: "DAILY", compulsory: true, compulsoryOnRest: true });
  const medsOpts = boardStreakOptionsOf(meds, { live: true, cursor, restDays: new Set([restOn]), freezeDays: new Set([addDays(TODAY, -5)]) });
  check("an 'Even on rest days' must is held by freeze days only", !!medsOpts.heldDays && !medsOpts.heldDays.has(restOn) && medsOpts.heldDays.has(addDays(TODAY, -5)));

  // Record yesterday: the freeze switch is hidden for an active yesterday.
  const dutyY = dutyOf({ freezes: { banked: 1, willCover: true } });
  const idle = yesterdaySheetOf({ yesterday: WED, recordBy: "record by 04:00 tomorrow", duty: dutyY, yesterdayActive: false });
  const busy = yesterdaySheetOf({ yesterday: WED, recordBy: "record by 04:00 tomorrow", duty: dutyY, yesterdayActive: true });
  // Re-pinned by the P21 review (one bank, one word beside the 'Rest tokens' chip): 'Use a rest token for Wed'.
  check("record yesterday: the freeze switch for an idle yesterday with a freeze banked", idle.freeze?.label === "Use a rest token for Wed" && idle.freeze.sub === "Covers all of Wednesday's musts · 0 left after" && !idle.freeze.checked);
  check("record yesterday: the freeze switch is hidden for an active yesterday", busy.freeze === null);
  check("record yesterday: no freeze banked, no switch", yesterdaySheetOf({ yesterday: WED, recordBy: "", duty: dutyOf(), yesterdayActive: false }).freeze === null);
  check("record yesterday: a freeze already used shows on, and stays on", yesterdaySheetOf({ yesterday: WED, recordBy: "", duty: dutyOf({ freezes: { banked: 0, willCover: true, usedYesterday: true } }), yesterdayActive: false }).freeze?.checked === true);
  check(
    "record yesterday: titled by its day, with the honesty line and the sticky Settle footer",
    idle.title === "Record Wednesday" &&
      idle.honesty === "Tick only what you did on Wednesday. Doing it now? Settle Wednesday first: its make-up pays ×0.85 and brings its streak back." &&
      idle.settle?.label === "Settle Wednesday now" &&
      idle.settle.until === "Or leave it: it settles on its own at Fri 04:00." &&
      idle.settle.lock === "Settling locks Wednesday."
  );
  // P21 review (D19): a must that would owe is open on yesterday and a token is banked: settling spends it, so the
  // sheet says so instead of promising a make-up; left alone, 'if-today' says the token covers it only after a task.
  const tokenSheet = (musts: "covers" | "if-today") =>
    yesterdaySheetOf({ yesterday: WED, recordBy: "", duty: dutyOf({ freezes: { banked: 1, willCover: musts === "covers", musts, forYesterday: 1, leftAfter: 0 } }), yesterdayActive: true });
  const covers = tokenSheet("covers");
  const ifToday = tokenSheet("if-today");
  check(
    "P21 review: record yesterday with a token for its open musts: settling spends it ('0 left after'), nothing owed, no make-up promised",
    covers.honesty === "Tick only what you did on Wednesday. Settling Wednesday spends a rest token on its open musts (0 left after): nothing owed, nothing to make up." &&
      covers.settle?.until === "Or leave it: it settles on its own at Fri 04:00." &&
      !/×0\.85/.test(covers.honesty ?? ""),
    covers.honesty ?? ""
  );
  check(
    "P21 review: …'if-today': the same honesty line, and the footer says the token covers it then only if today has a task done",
    ifToday.honesty === covers.honesty && ifToday.settle?.until === "Or leave it: it settles on its own at Fri 04:00. A rest token covers its open musts then only if today has a task done.",
    ifToday.settle?.until ?? ""
  );
  const early = yesterdaySheetOf({ yesterday: WED, recordBy: "", duty: dutyOf({ cursor: WED, freezes: { banked: 1, willCover: false } }), yesterdayActive: false });
  check("record yesterday: settled early, no footer and no switch", early.settle === null && early.freeze === null && early.honesty === null);
  const pre = yesterdaySheetOf({ yesterday: WED, recordBy: "record by 04:00 tomorrow", duty: dutyOf({ live: false, launchDay: null, cursor: null }), yesterdayActive: false });
  check("record yesterday: before launch, the pre-M2 sheet exactly", pre.title === "Record yesterday" && pre.description === "Anything you tick pays at the full rate, record by 04:00 tomorrow." && !pre.honesty && !pre.settle && !pre.freeze);
  check("record yesterday: settled early, it says '<Day> is settled' (settledFor holds)", early.description === "Wednesday is settled. Anything missed is made up from its card.", early.description);
  // M2 review: the 'is settled' line only when settledFor is true.
  const sameAsPre = (v: ReturnType<typeof yesterdaySheetOf>) => v.title === "Record yesterday" && v.description === "Anything you tick pays at the full rate, record by 04:00 tomorrow." && !v.honesty && !v.settle && !v.freeze;
  const noCursor = yesterdaySheetOf({ yesterday: WED, recordBy: "record by 04:00 tomorrow", duty: dutyOf({ cursor: null, freezes: { banked: 1, willCover: false } }), yesterdayActive: false });
  check("record yesterday: Duty live with no cursor yet — never 'settled'; the pre-M2 sheet, no Settle, no freeze", sameAsPre(noCursor), JSON.stringify(noCursor));
  // The launch Monday: the launch script set the cursor to firstDutyDay − 1 = Sunday, a day Duty never judges.
  const LAUNCH_MON: DayKey = "2026-10-12";
  const SUN: DayKey = "2026-10-11";
  const launchDay = yesterdaySheetOf({
    yesterday: SUN,
    recordBy: "record by 04:00 tomorrow",
    duty: dutyOf({ launchDay: LAUNCH_MON, floor: LAUNCH_MON, cursor: SUN, freezes: { banked: 1, willCover: false } }),
    yesterdayActive: false,
  });
  check("record yesterday: on the launch Monday the pre-Duty Sunday is recordable (the pre-M2 sheet), never 'Sunday is settled'", sameAsPre(launchDay), JSON.stringify(launchDay));
  const launchNoFloor = yesterdaySheetOf({ yesterday: SUN, recordBy: "record by 04:00 tomorrow", duty: dutyOf({ launchDay: LAUNCH_MON, cursor: SUN }), yesterdayActive: false });
  check("record yesterday: without DutyBoard.floor the launch day is the floor (its lower bound), same answer", sameAsPre(launchNoFloor));
  // After a post-launch reset: epochDay = today, cursor = today − 1 (newLifeSettingsDays), floor = the epoch.
  const reset = yesterdaySheetOf({ yesterday: WED, recordBy: "record by 04:00 tomorrow", duty: dutyOf({ floor: TODAY, cursor: WED }), yesterdayActive: false });
  check("record yesterday: the day before a reset's epoch is below the floor — recordable, never 'settled'", sameAsPre(reset), JSON.stringify(reset));
  check(
    "settledFor is the board's rule: below the floor never settled; a null floor (no launch day) keeps the cursor-only lock",
    !isSettledOn(dutyOf({ launchDay: LAUNCH_MON, floor: LAUNCH_MON, cursor: SUN }), SUN) &&
      isSettledOn(dutyOf({ cursor: WED }), WED) &&
      isSettledOn(dutyOf({ launchDay: null, floor: null, cursor: WED, live: false }), WED) === settledFor(WED, WED, null) &&
      !isSettledOn(null, WED) &&
      !isUnsettledDutyDay(dutyOf({ launchDay: LAUNCH_MON, floor: LAUNCH_MON, cursor: SUN }), SUN) &&
      isUnsettledDutyDay(dutyOf(), WED) &&
      !isUnsettledDutyDay(dutyOf({ live: false }), WED)
  );
  // Before launch the script may already have set the cursor (Sun 11 Oct) while today is Thu 8 Oct: nothing before it is locked.
  check(
    "pre-launch with the cursor set ahead: no pre-launch day is settled (ticks on today and yesterday stay open)",
    !isSettledOn(dutyOf({ live: false, launchDay: LAUNCH_MON, floor: LAUNCH_MON, cursor: SUN }), "2026-10-07") && !isSettledOn(dutyOf({ live: false, launchDay: LAUNCH_MON, floor: LAUNCH_MON, cursor: SUN }), "2026-10-08")
  );
  // M2 review (decision 12): once a freeze covers yesterday, nothing more is recorded on it.
  const frozen = yesterdaySheetOf({ yesterday: WED, recordBy: "", duty: dutyOf({ freezes: { banked: 0, willCover: true, usedYesterday: true } }), yesterdayActive: false });
  check(
    "record yesterday: a freeze used, no honesty line to tick by, and it says the freeze covers the day",
    frozen.honesty === null && frozen.description === "A rest token covers Wednesday, so nothing more is recorded on it." && frozen.freeze?.checked === true && !!frozen.settle,
    frozen.description
  );
  check("record yesterday: its deep link and the 'y' event", RECORD_YESTERDAY_HREF === "/today?sheet=yesterday" && RECORD_YESTERDAY_EVENT === "xtnl:today:record-yesterday");
  check("record yesterday: activity is the streak's own, or a live tick on yesterday", yesterdayActiveOf({ last7Days: [false, false, false, false, false, true, false] }, { ledger: { today: ledger(TODAY), yesterday: ledger(WED) } }) && !yesterdayActiveOf({ last7Days: [true, true, true, true, true, false, true] }, { ledger: { today: ledger(TODAY), yesterday: ledger(WED) } }));

  // The miss prompt: three in a row; 'Not now' hides it until the next miss; one at most.
  const gym = owedCard({ instanceId: "g1", templateId: "gym", title: "Gym", day: TUE, missRun: 3, lastMissDay: TUE, compulsory: true, createdAt: "2026-06-01T00:00:00.000Z" });
  const putOff = new Set<string>();
  check("miss prompt: after three misses in a row", missPromptOf([gym], (k) => putOff.has(k), true)?.instanceId === "g1");
  putOff.add(missPromptKey("gym", TUE));
  check(
    "miss prompt: 'Not now' hides it until the next miss",
    missPromptOf([gym], (k) => putOff.has(k), true) === null && missPromptOf([{ ...gym, instanceId: "g2", day: WED, lastMissDay: WED, missRun: 4 }], (k) => putOff.has(k), true)?.instanceId === "g2"
  );
  check(
    "miss prompt: not at two, not before launch, one at most",
    missPromptOf([{ ...gym, missRun: 2 }], () => false, true) === null &&
      missPromptOf([gym], () => false, false) === null &&
      missPromptOf([gym, { ...gym, instanceId: "x1", templateId: "other", missRun: 5 }], () => false, true)?.templateId === "other"
  );
  const copyOld = missPromptCopyOf(gym, { today: TODAY, nowMs: at(TODAY, 9), live: true });
  check("miss prompt: 'Add a minimum version', and 'Stop it being a must · from Thu 8 Oct' (seven days)", copyOld.addMinimum && copyOld.stop === "Stop it being a must · from Thu 8 Oct", copyOld.stop ?? "");
  const fresh = missPromptCopyOf({ ...gym, createdAt: new Date(at(TODAY, 9) - 10 * 60_000).toISOString() }, { today: TODAY, nowMs: at(TODAY, 9), live: true });
  check("miss prompt: inside the 60-minute typo grace it stops at once", fresh.stop === "Stop it being a must");
  const mp = renderToStaticMarkup(createElement(MissPrompt, { copy: copyOld, onAddMinimum: () => {}, onStop: () => {}, onNotNow: () => {} }));
  check("miss prompt: renders its three answers (Add a minimum version, Stop, Not now)", mp.includes("Add a minimum version") && mp.includes("Stop it being a must · from Thu 8 Oct") && mp.includes("Not now"));

  // The akrasia horizon in the drawer (F3): a must's archive keeps the row; un-flag deferred; on immediate.
  const old = { compulsory: true, compulsoryOnRest: true, createdAt: "2026-06-01T00:00:00.000Z" };
  const ctx = { today: TODAY, nowMs: at(TODAY, 9), live: true };
  check("drawer: a must's archive is deferred to today + 7 (the row stays)", ruleChangeOf(old, { archived: true }, ctx).effectiveDay === addDays(TODAY, 7));
  check("drawer: 'Not a must' deferred; 'Even on rest days' on immediate, off deferred", ruleChangeOf(old, { compulsory: false }, ctx).effect === "deferred" && ruleChangeOf({ ...old, compulsoryOnRest: false }, { compulsoryOnRest: true }, ctx).effect === "immediate" && ruleChangeOf(old, { compulsoryOnRest: false }, ctx).effect === "deferred");
  check("drawer: before launch every edit is immediate", ruleChangeOf(old, { archived: true }, { ...ctx, live: false }).effect === "immediate");
  check("drawer: the pending line and the row's meta", pendingLineOf({ effectiveDay: "2026-10-08", archive: true }) === "Pending: archived on Thu 8 Oct" && pendingMetaOf({ effectiveDay: "2026-10-08", archive: true }) === "must · ends Thu 8 Oct");
  check("drawer: a deferred answer says when, and how to keep it", deferredNoticeOf("Stretch", "archive", "2026-10-08") === "Stretch leaves Today on Thu 8 Oct. A must takes seven days to weaken; Keep it in its drawer cancels.");

  // The Day ledger: F8's freeze and streak states, F10's copy.
  const streakOf = (p: Partial<StreakDutyFields> = {}): StreakDutyFields => ({
    current: 5,
    last7Days: [true, true, true, true, true, false, false],
    held7Days: [false, false, false, false, false, false, false],
    bankedFreezes: 0,
    ...p,
  });
  const pre2 = dayLedgerDutyOf({ duty: null, streak: streakOf({ bankedFreezes: 1 }), kept: false, full: false, today: TODAY, yesterdayActive: false });
  check("day ledger: before launch, the pre-M2 tile exactly", !pre2.settles && pre2.freezes?.banked === 1 && !pre2.caption && !pre2.heldNote && !pre2.fullNote && !pre2.broken);
  const cover = dayLedgerDutyOf({ duty: dutyOf({ freezes: { banked: 2, willCover: true } }), streak: streakOf(), kept: false, full: false, today: TODAY, yesterdayActive: false });
  check("day ledger: 'A rest token will cover Wed' and the real balance", cover.heldNote === "A rest token will cover Wed" && cover.freezes?.banked === 2 && cover.settles);
  // P21 review (D19): an active yesterday whose open musts a token will take, or will once today has a task done.
  const activeCover = (musts: "covers" | "if-today" | null) =>
    dayLedgerDutyOf({ duty: dutyOf({ freezes: { banked: 1, willCover: musts === "covers", musts } }), streak: streakOf({ last7Days: [true, true, true, true, true, true, false] }), kept: false, full: false, today: TODAY, yesterdayActive: true }).heldNote;
  check(
    "P21 review: day ledger, an active yesterday: 'A rest token will cover Wed's open musts', or 'A task today, and a rest token covers…', or nothing",
    activeCover("covers") === "A rest token will cover Wed's open musts" && activeCover("if-today") === "A task today, and a rest token covers Wed's open musts" && activeCover(null) === null,
    String(activeCover("if-today"))
  );
  // P21 review: once Duty is live the chip still says 0 as it is (as before Duty, Today's chip and the phone's).
  const zeroLive = dayLedgerDutyOf({ duty: dutyOf({ freezes: { banked: 0, willCover: false } }), streak: streakOf({ restTokens: 0 }), kept: false, full: false, today: TODAY, yesterdayActive: false });
  const zeroOld = dayLedgerDutyOf({ duty: dutyOf({ freezes: { banked: 0, willCover: false } }), streak: streakOf(), kept: false, full: false, today: TODAY, yesterdayActive: false });
  check("P21 review: day ledger with Duty live: 'Rest tokens 0' while the bank is live; a pre-P21 streak still hides 0", zeroLive.freezes?.banked === 0 && zeroOld.freezes === null, JSON.stringify(zeroLive.freezes));
  const warn = dayLedgerDutyOf({ duty: dutyOf(), streak: streakOf(), kept: false, full: false, today: TODAY, yesterdayActive: false });
  check("day ledger: without a freeze, when yesterday must be recorded by", warn.caption === "Wednesday had nothing yet; record it by Fri 04:00 or the streak ends." && warn.heldNote === null, warn.caption ?? "");
  const ended = dayLedgerDutyOf({ duty: dutyOf(), streak: streakOf({ current: 0, endedOn: TUE, endedAfter: 23 }), kept: false, full: false, today: TODAY, yesterdayActive: false });
  check("day ledger: once judged and broken, the hollow flame and 'Ended Tuesday at 23 days', never a red 0", ended.broken && ended.caption === "Ended Tuesday at 23 days. Any tick or review starts a new one.");
  // M2 review: the run length is lane B's endedAfter, and a break past the week is dated, not a bare weekday.
  const endedOld = dayLedgerDutyOf({ duty: dutyOf(), streak: streakOf({ current: 0, endedOn: "2026-09-15", endedAfter: 9 }), kept: false, full: false, today: TODAY, yesterdayActive: false });
  const endedY = dayLedgerDutyOf({ duty: dutyOf(), streak: streakOf({ current: 0, endedOn: WED, endedAfter: 1 }), kept: false, full: false, today: TODAY, yesterdayActive: false });
  check(
    "day ledger: 'Ended on Tue 15 Sep at 9 days' past the week, 'Ended yesterday at 1 day'",
    endedOld.caption === "Ended on Tue 15 Sep at 9 days. Any tick or review starts a new one." && endedY.caption === "Ended yesterday at 1 day. Any tick or review starts a new one.",
    `${endedOld.caption} | ${endedY.caption}`
  );
  // The board is typed with lib/streak.ts DailyStreak: its M2 fields fit the ledger's, by lane B's names (a compile-time check).
  const serverStreak: ServerDailyStreak = { current: 0, last7Days: [], held7Days: [], bankedFreezes: 0, endedOn: TUE, endedAfter: 23, freezeWillCover: false, heldInRun: 0, restTokens: 2 };
  const asLedger: StreakDutyFields = serverStreak;
  check("day ledger: the server's DailyStreak is read as it is (endedAfter, not a field lane B never writes; P21: restTokens)", asLedger.endedAfter === 23 && asLedger.restTokens === 2);
  // Launch Monday: yesterday (Sunday) is below the floor — no 'record it by … or the streak ends', no repair hint for it.
  const launchLedger = dayLedgerDutyOf({
    duty: dutyOf({ launchDay: "2026-10-12", floor: "2026-10-12", cursor: "2026-10-11", lastRepairDay: null }),
    streak: streakOf(),
    kept: false,
    full: false,
    today: "2026-10-12",
    yesterdayActive: false,
  });
  check("day ledger: on the launch Monday the pre-Duty Sunday gets no Duty warning and no repair hint", launchLedger.caption === null && launchLedger.heldNote === null && !launchLedger.fullNote?.includes("repairs"), JSON.stringify(launchLedger));
  check("day ledger: the Full-day pay line (F10)", warn.aside === "up to +0.5 MP, paid when the week is judged (Wed)" && FULL_DAY_PAY_LINE === warn.aside);
  const repair = dayLedgerDutyOf({ duty: dutyOf({ lastRepairDay: null }), streak: streakOf(), kept: false, full: false, today: TODAY, yesterdayActive: false });
  check("day ledger: the repair hint, once a week, only when the last repair is known", repair.fullNote === "A Full day today repairs Wednesday · once a week." && warn.fullNote !== repair.fullNote);
  check("day ledger: no repair hint inside seven days of the last", dayLedgerDutyOf({ duty: dutyOf({ lastRepairDay: addDays(TODAY, -4) }), streak: streakOf(), kept: false, full: false, today: TODAY, yesterdayActive: false }).fullNote !== repair.fullNote);

  // Close the day (F13): every open must; Tomorrow / Anytime / Drop; Skip today; Roll all never makes anything late.
  const cMvv = tpl({ id: "cm", title: "Pushups", recurrence: "DAILY", compulsory: true, mvv: "10 pushups" });
  const cBare = tpl({ id: "cb", title: "Timesheet", recurrence: "DAILY", compulsory: true });
  const plan = tpl({ id: "pl", title: "Call mum", dueKind: "PLANNED", dueDay: TODAY });
  const dl = tpl({ id: "dl", title: "Send invoice", dueKind: "DEADLINE", dueDay: TODAY });
  const hab = tpl({ id: "hb", title: "Read", recurrence: "DAILY" });
  const cd = board(TODAY, [cMvv, cBare, plan, dl, hab]);
  const cb = buildBoard(cd);
  const live = closeItemsOf({ must: cb.must, todayRows: cb.todayRows, today: TODAY, live: true });
  const byId = (id: string) => live.find((i) => i.key.startsWith(`${id}:`));
  check("close: a must with a minimum offers it", byId("cm")?.choices.map((c) => c.id).join() === "minimum");
  check(
    "close: a must without one is listed with the honest line and no choice",
    byId("cb")?.choices.length === 0 && byId("cb")?.meta === `Left open, Thursday is judged Sat 04:00: −${debtFor(cBare).toFixed(1)} owed, made up at ×0.85`,
    byId("cb")?.meta
  );
  // P21 review (D19): with a token today's musts can count on, the line says it covers them if still banked then.
  const tokenClose = closeItemsOf({ must: cb.must, todayRows: cb.todayRows, today: TODAY, live: true, tokens: 1 }).find((i) => i.key.startsWith("cb:"));
  check(
    "P21 review: close, a token banked: 'a rest token covers it if one is still banked then, else −X owed'; none banked: the debt line",
    tokenClose?.meta === `Left open, Thursday is judged Sat 04:00: a rest token covers it if one is still banked then, else −${debtFor(cBare).toFixed(1)} owed` &&
      closeItemsOf({ must: cb.must, todayRows: cb.todayRows, today: TODAY, live: true, tokens: 0 }).find((i) => i.key.startsWith("cb:"))?.meta === byId("cb")?.meta,
    tokenClose?.meta
  );
  check("close: a planned one-off gets Tomorrow, Anytime and Drop", byId("pl")?.choices.map((c) => c.id).join() === "tomorrow,anytime,drop");
  check("close: a deadline keeps it (no Anytime) and Roll all skips it", byId("dl")?.choices.map((c) => c.id).join() === "tomorrow,drop" && !byId("dl")?.roll);
  check("close: a habit gets Skip today", byId("hb")?.choices.map((c) => c.id).join() === "skip");
  check("close: 'Roll all' moves PLANNED one-offs only, so it never makes an item late", rollAllKeysOf(live).join() === `pl:${TODAY}`);
  const preClose = closeItemsOf({ must: cb.must, todayRows: cb.todayRows, today: TODAY, live: false });
  check("close: before launch, the pre-M2 list exactly (a must's minimum, a one-off's Tomorrow)", preClose.map((i) => `${i.key.split(":")[0]}:${i.choices.map((c) => c.id).join("+")}`).join() === "cm:minimum,dl:tomorrow,pl:tomorrow");
  const restDay = buildBoard({ ...cd, duty: dutyOf({ rest: { yesterday: null, today: "REST", tomorrow: null, vacationUntil: null } }) });
  check("close: on a rest day a held must is not listed (nothing is owed)", !closeItemsOf({ must: restDay.must, todayRows: restDay.todayRows, today: TODAY, live: true }).some((i) => i.key.startsWith("cb:")));
  // M2 review: a held row owes nothing today — not an open must for the bell or the nav badge, not tallied, never next up.
  check(
    "rest day: held musts and habits are not counted open (counts.musts / counts.due feed the bell and the nav badge)",
    cb.counts.musts === 2 && restDay.counts.musts === 0 && cb.counts.due === 3 && restDay.counts.due === 2,
    JSON.stringify({ plain: cb.counts, rest: restDay.counts })
  );
  check("rest day: the Must lane never reads '0 of 2 kept' under 'Rest · nothing owed'", (() => {
    const lane = mustLaneOf({ must: restDay.must, owed: [], restToday: "REST", live: true, launchDay: LAUNCH, today: TODAY });
    return laneTally(restDay.must).total === 0 && lane.count === null && lane.chips[0]?.text === "Rest · nothing owed" && mustLaneOf({ must: cb.must, owed: [], restToday: null, live: true, launchDay: LAUNCH, today: TODAY }).count === "0 of 2 kept";
  })());
  check(
    "rest day: a held must done anyway is kept in the tally; a held open one is not asked (asksToday)",
    laneTally([{ state: "done", heldToday: true }, { state: "open", heldToday: true }, { state: "open" }]).kept === 1 &&
      laneTally([{ state: "done", heldToday: true }, { state: "open", heldToday: true }, { state: "open" }]).total === 2 &&
      !asksToday({ state: "open", heldToday: true }) &&
      asksToday({ state: "done", heldToday: true }) &&
      !asksToday({ state: "skipped" })
  );
  check("rest day: next up never picks a held must", nextUpOf({ quest: { reviews: 15, target: 15, dueNow: 0, met: true, cap: 15 }, must: restDay.must }).kind === "clear" && nextUpOf({ quest: { reviews: 15, target: 15, dueNow: 0, met: true, cap: 15 }, must: cb.must }).kind === "must");
  check("rest day: a held row asks no capacity", restDay.planned < cb.planned, `${restDay.planned} / ${cb.planned}`);

  // Time off (F9 controls, F13 switch).
  const noLaunch = restOptionsOf({ today: TODAY, launchDay: null, declared: [] });
  check("time off: nothing before Duty has a launch day", noLaunch.every((o) => o.disabledReason === "Time off arrives with Duty."));
  const beforeLaunch = restOptionsOf({ today: TODAY, launchDay: "2026-10-12", declared: [] });
  check("time off: nothing for a day before the launch day", beforeLaunch[0].disabledReason === "Time off counts from Mon 12 Oct." && beforeLaunch[1].disabledReason === "Time off counts from Mon 12 Oct.");
  const capped = restOptionsOf({ today: TODAY, launchDay: LAUNCH, declared: [{ day: "2026-09-28", kind: "REST" }, { day: "2026-09-29", kind: "REST" }] });
  check("time off: two rest days in a week, the third says why", capped[0].title === "Rest Friday" && capped[0].disabledReason?.startsWith("Two rest days that week already") === true, capped[0].disabledReason ?? "");
  const sick = restOptionsOf({ today: TODAY, launchDay: LAUNCH, declared: [{ day: "2026-09-26", kind: "SICK" }] });
  check("time off: sick once per 14 days, with the next day it is on offer", sick[1].disabledReason === "Sick used on 26 Sep; next from 10 Oct.", sick[1].disabledReason ?? "");
  check(
    "time off: a vacation is 3 to 30 days from tomorrow",
    vacationRangeError(addDays(TODAY, 1), addDays(TODAY, 2), { today: TODAY, launchDay: LAUNCH })?.includes("at least 3") === true &&
      vacationRangeError(addDays(TODAY, 1), addDays(TODAY, 31), { today: TODAY, launchDay: LAUNCH })?.includes("at most 30") === true &&
      vacationRangeError(TODAY, addDays(TODAY, 4), { today: TODAY, launchDay: LAUNCH }) === "A vacation starts tomorrow at the earliest." &&
      vacationRangeError(addDays(TODAY, 1), addDays(TODAY, 5), { today: TODAY, launchDay: LAUNCH }) === null
  );
  const sw = restSwitchOf({ today: TODAY, launchDay: LAUNCH, declared: [] });
  check("close: the rest switch names its day ('Rest Friday')", sw?.label === "Rest Friday" && !sw.checked && sw.disabledReason === null && restSwitchOf({ today: TODAY, launchDay: null, declared: [] }) === null);
  check("close: a declared rest shows the switch on", restSwitchOf({ today: TODAY, launchDay: LAUNCH, declared: [{ day: addDays(TODAY, 1), kind: "REST" }] })?.checked === true);
  const runs = cancellableOf(
    [
      { day: addDays(TODAY, 1), kind: "REST" },
      { day: addDays(TODAY, 4), kind: "VACATION" },
      { day: addDays(TODAY, 5), kind: "VACATION" },
      { day: addDays(TODAY, 6), kind: "VACATION" },
      { day: TODAY, kind: "SICK" },
    ],
    TODAY
  );
  check("time off: future declarations can be cancelled, a vacation as one run; a started day cannot", runs.map((r) => r.label).join(" | ") === "Rest Fri 2 Oct | Vacation Mon 5 Oct – Wed 7 Oct", runs.map((r) => r.label).join(" | "));

  // Before launch the board is the pre-M2 board, exactly.
  const t1 = tpl({ id: "p1", title: "Gym", recurrence: "DAILY", compulsory: true });
  const t2 = tpl({ id: "p2", title: "Invoice", dueKind: "DEADLINE", dueDay: WED, compulsory: true });
  const pd = board(TODAY, [t1, t2, plan, hab]);
  const sig = (b: ReturnType<typeof buildBoard>) => JSON.stringify([b.must, b.todayRows, b.yesterdayRows, b.anytime].map((rows) => rows.map((r) => `${r.key}:${r.state}:${r.lane}`)));
  const offDuty = dutyOf({ live: false, launchDay: null, cursor: null });
  check("pre-launch: with Duty data that is not live, the lanes are the pre-M2 lanes exactly", sig(buildBoard(pd)) === sig(buildBoard({ ...pd, duty: offDuty })) && buildBoard({ ...pd, duty: offDuty }).owed.length === 0);
  check("pre-launch: the full-day rings read the same with no held day", JSON.stringify(withHeldExcused(pd, buildBoard(pd).must)) === JSON.stringify(pd));
}

// ── Source guards for M2 on Today (markup rules no function holds) ────────

{
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
  // The board's root (a work tab adds data-skin="work", 2026-10-20).
  const jsx = boardSrc.slice(boardSrc.indexOf('<div className="page today-board cq-main"'));
  const mustAt = jsx.indexOf('id="must"');
  check("never on red: debt cards render only inside the Must lane", mustAt > 0 && jsx.indexOf("renderOwedCard") > mustAt && jsx.indexOf("<OwedSummary") > mustAt);
  check("never on red: the Owed row sits in .o8, after the lanes", /className="o8">\s*<OwedRow/.test(jsx) && jsx.indexOf("<OwedRow") > jsx.indexOf('id="habits"'));
  check("never on red: no owed tone is written on the board itself", !/tone="owed"/.test(boardSrc));
  check("o1: the settled notice and the rest banner are one choice (o1CardOf)", /o1 === "settled"/.test(jsx) && /o1 === "rest"/.test(jsx) && /o1CardOf\(/.test(boardSrc));
  check(
    "storage: every localStorage access is in a try (readFlags, writeFlag)",
    (boardSrc.match(/localStorage/g) ?? []).length === 2 && /function readFlags[\s\S]*?try \{[\s\S]*?localStorage\.getItem[\s\S]*?\} catch/.test(boardSrc) && /function writeFlag[\s\S]*?try \{\s*window\.localStorage\.setItem[\s\S]*?\} catch/.test(boardSrc)
  );
  check("storage: MissPrompt keeps nothing of its own (the board writes its 'Not now')", !/localStorage/.test(read("src/components/today/MissPrompt.tsx")));
  check("rewards: a make-up is Tier 0 makeup-paid; the last debt Tier 1 nothing-owed", boardSrc.includes('kind: "makeup-paid"') && boardSrc.includes('kind: "nothing-owed"'));
  check("rewards: the settled notice plays yesterday-settled or day-repaired in place, once per device", boardSrc.includes('"day-repaired" : "yesterday-settled"') && boardSrc.includes('writeFlag(settledKey(settledShownDay), "seen")'));
  check("record yesterday: the board answers ?sheet=yesterday and the 'y' event", boardSrc.includes("addEventListener(RECORD_YESTERDAY_EVENT") && boardSrc.includes("searchParams.get(SHEET_PARAM) === YESTERDAY_SHEET"));
  // M2 review: the bell's Record link (/today?sheet=yesterday) on /today itself is a same-route navigation: the board keeps its
  // instance, so the parameter is read from the router's search params, in an effect keyed on it, never on mount only.
  check(
    "record yesterday: ?sheet=yesterday is read through useSearchParams in an effect keyed on it (a same-route link opens the sheet)",
    /const searchParams = useSearchParams\(\)/.test(boardSrc) &&
      /const sheetWanted = searchParams\.get\(SHEET_PARAM\) === YESTERDAY_SHEET;\s*useEffect\(\(\) => \{\s*if \(!sheetWanted\) return;[\s\S]*?setYesterdayOpen\(true\)[\s\S]*?\}, \[sheetWanted\]\)/.test(boardSrc)
  );
  check("streak: the board is typed with lib/streak.ts DailyStreak (type-only), so endedOn and endedAfter are lane B's", /import type \{ DailyStreak \} from "@\/lib\/streak";/.test(boardSrc));
  check("make-up: 'Accept the loss' resolves the card as written off, never repaid", /state: "written-off"/.test(boardSrc) && /writtenOff: done\.line/.test(boardSrc));
  check("settled notice: read with the floor (settledFor)", boardSrc.includes("settledNoticeOf(duty.settled, duty.cursor, current.today, { floor: dutyFloorOf(duty) })"));
  check("rest banner: tomorrow's 'Even on rest days' musts are counted for it", boardSrc.includes("stillOwedTomorrow: stillOwedAhead") && boardSrc.includes("onRestMustsIn(current.templates, ahead.from, ahead.to)"));
  const drawerSrc = code(read("src/components/today/TaskDrawer.tsx"));
  check("drawer: 'Even on rest days' says before the tap when turning it off takes effect", drawerSrc.includes("Even on rest days{props.rule.onRest && props.rule.restOffFrom ? ` · off from ${dayLabel(props.rule.restOffFrom)}` : \"\"}"));
  const cardSrc = code(read("src/components/today/m2/MakeUpCard.tsx"));
  check("MakeUpCard: its words are makeup-words.ts's, a write-off wears the quiet 'Written off' chip", cardSrc.includes("makeUpWordsOf(item, state)") && /words\.chip === "written-off" \? \(\s*<Chip>Written off<\/Chip>/.test(cardSrc));
  check("drawer: a must's deferred archive dispatches no hide op (the row stays)", /if \(change\?\.effectiveDay\) \{[\s\S]*?dispatch\(null, \(\) => archiveTask\(templateId, REFRESH\)/.test(boardSrc));
  check("the full-day rings count today's held musts as excused (settlement agrees)", boardSrc.includes("fullDayInputOf(withHeldExcused(current, board.must), board, quest)"));
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const today = strip(read("src/components/today/today.css"));
  const atLeast = (name: string, v: number | null, min: number) => check(`touch target: ${name} ≥ ${min}px`, v != null && v >= min, String(v));
  atLeast("'Time off' beside Close the day", cssValue(today, ".today-close .close-off", "min-height"), 44);
  {
    // The Asks are a badge on the block they concern, every one a tap away; no Ask card on the board. The three
    // sections: Today shows the Tasks section's Asks only (record yesterday, the weekly review), on the plan card;
    // Ideas' (cards past grace, the quota, a penalty) stay in the bell, never on Today.
    const badge = read("src/components/today/AskBadge.tsx");
    check(
      "asks: one badge, on the plan card, holding the Tasks section's Asks (askHostOf 'tasks'); no Ideas Ask and no Ask card of their own on the board",
      /<div className="o2 ask-host">\s*<PlanCard[\s\S]*?<AskBadge asks=\{taskAsks\}[^>]*\/>\s*<\/PlanCard>/.test(boardSrc) &&
        boardSrc.includes('const taskAsks = asks.filter((a) => askHostOf(a) === "tasks");') &&
        (boardSrc.match(/<AskBadge\b/g) ?? []).length === 1 &&
        !/"ideas"/.test(boardSrc) &&
        !boardSrc.includes("<AskCard")
    );
    check(
      "asks: askHostOf puts yesterday and the weekly review in Tasks, the rest (past grace, the quota, a penalty) in Ideas",
      askHostOf({ id: "yesterday" }) === "tasks" &&
        askHostOf({ id: WEEK_REVIEW_NOTICE }) === "tasks" &&
        askHostOf({ id: "quota" }) === "ideas" &&
        askHostOf({ id: "overdue" }) === "ideas" &&
        askHostOf({ id: "debuff-SHAKEN" }) === "ideas"
    );
    check(
      "asks: the badge says what waits in words, opens a dialog pop-over, closes on Escape (focus back) and on a tap outside",
      badge.includes("aria-label={said}") && badge.includes('role="dialog"') && /e\.key !== "Escape"[\s\S]*?button\.current\?\.focus\(\)/.test(badge) && badge.includes('addEventListener("pointerdown"')
    );
    const pulse = /\.ask-badge-dot::before \{ animation: ask-ping [^;]* (\d+); \}/.exec(today)?.[1];
    check("asks: the badge's radial pulse rings three times, then rests; reduced motion shows it at rest", pulse === "3" && /prefers-reduced-motion: reduce\) \{ \.ask-badge-dot::before, \.ask-badge-dot::after \{ animation: none; \}/.test(today), String(pulse));
    atLeast("the Asks' badge", cssValue(today, ".ask-badge", "height"), 40);
  }
  // M2 review (344 px): a long minimum label wraps inside the card instead of spilling past it (.btn is nowrap; the lane body clips).
  const actsBtn = /(^|[}\s])\.makeup \.acts \.btn\s*\{([^}]*)\}/m.exec(today)?.[2] ?? "";
  check("MakeUpCard: its action buttons wrap within the card at 344 px", /white-space:\s*normal/.test(actsBtn) && /max-width:\s*100%/.test(actsBtn), actsBtn);
  check("MakeUpCard: a written-off card's rail is quiet (never kept)", /\.makeup\[data-state="written-off"\]::before \{ background: var\(--line-ctl\); \}/.test(today));
  check("MakeUpCard: 'Accept the loss' is the quiet third action", /onAcceptLoss && \([\s\S]*?Accept the loss/.test(read("src/components/today/m2/MakeUpCard.tsx")));
  check("CloseDaySheet: no rested-bonus promise (decision 33 defers it)", !/rested bonus/i.test(read("src/components/today/CloseDaySheet.tsx")));
}

// ═══ The three sections: Today is the Tasks section ══════════════════════════
// Today shows the tasks due today (the Must, Planned and Habits lanes, the
// Inbox and Anytime, the plan card's capacity, the task goals) and one slim
// "due elsewhere" strip of links out. No review quest (Next up), no roadmap
// card or aim line, no encounter, no streak or Full day on the board: those
// live on the Ideas landing (/review) and on Character (/you).
{
  const code = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
  const page = code(read("src/app/today/page.tsx"));
  const props = /interface Props \{([\s\S]*?)\n\}/.exec(boardSrc)?.[1] ?? "";
  check(
    "sections: Today renders no review, roadmap or encounter card, no streak and no Full day (no NextUp, StreakCard, DayLedger, WeekQuests, AimLine, AimCard; no focus or bosses prop); the Main quest card (P15) is Today's own MainQuestCard, a slot",
    !/<NextUp\b|<StreakCard\b|<DayLedger\b|<WeekQuests\b|<AimLine\b|<AimCard\b|<BossPanel\b|nextUpOf\(|questsSlot/.test(boardSrc) &&
      !/^\s*(focus|bosses)\??:/m.test(props) &&
      !/<NextUp\b|<StreakCard\b|<DayLedger\b|<WeekQuests\b|<AimLine\b|<AimCard\b|questsSlot|bosses=\{|focus=\{/.test(page) &&
      !/from "@\/components\/(today\/(NextUp|DayLedger)|roadmap\/(WeekQuests|AimLine|AimCard))"/.test(page) &&
      props.length > 0
  );
  check(
    "sections: the strip and the plan card head the side column (both .o2, the strip first), before the lanes on a phone; the plan card hosts Record yesterday",
    boardSrc.indexOf('{elsewhere != null && elsewhere !== false && <div className="o2">{elsewhere}</div>}') >= 0 &&
      boardSrc.indexOf('{elsewhere != null && elsewhere !== false && <div className="o2">{elsewhere}</div>}') < boardSrc.indexOf('<div className="o2 ask-host">') &&
      boardSrc.indexOf('<div className="o2 ask-host">') < boardSrc.indexOf('<div className="c2"') &&
      /<PlanCard[\s\S]*?yesterdayOpen=\{yesterdayOpenCount\}\s*onYesterday=\{\(\) => setYesterdayOpen\(true\)\}/.test(boardSrc) &&
      /onCapacity=\{\(\) => setCapacityOpen\(true\)\}/.test(boardSrc)
  );
  check(
    "sections: the page computes the strip from what it already loads (the board's due count, this week's open quests, the ready encounters, the Body section's weigh-in) and hands it to the board as a slot, none when empty",
    /reviewsDue: board\.dueNow \?\? null,/.test(page) &&
      /questsOpen: quests && weekQuestsShownOnToday\(quests\.view\) \? questsOpenOf\(quests\.view\) : 0,/.test(page) &&
      /bossesReady: bosses\.filter\(\(b\) => b\.availability\.status === "ready"\)\.length,/.test(page) &&
      /weighInDue: weighInDueOf\(weight\),/.test(page) &&
      /loadWeightView\(userId, now\)\.catch\(\(\) => null\)/.test(page) &&
      page.includes("elsewhere={elsewhere.length > 0 ? <DueElsewhere rows={elsewhere} /> : null}")
  );
  // The strip's rows, run.
  const all = dueElsewhereOf({ reviewsDue: 12, questsOpen: 1, bossesReady: 1, weighInDue: true });
  // Re-pinned for blueprint P15 (D11, one vocabulary): the roadmap's open rows are the main quest's sprint, so the strip
  // says "sprint 1 left" ("1 left in this week's sprint"), the Main quest card's words, never "quest".
  const itemWords = (i: { lead?: string; n: number | null; word: string }) => [i.lead, i.n ?? "", i.word].filter((x) => x !== undefined && x !== "").join(" ");
  check(
    "due elsewhere: '12 reviews · sprint 1 left · boss → Ideas' (/review) and 'weigh-in → Body' (/train), each with its spoken long form",
    all.length === 2 &&
      all[0].href === IDEAS_HREF &&
      IDEAS_HREF === "/review" &&
      all[0].label === "Ideas" &&
      all[0].items.map(itemWords).join(" · ") === "12 reviews · sprint 1 left · boss" &&
      all[0].said === "Ideas: 12 reviews due, 1 left in this week's sprint, 1 boss ready" &&
      all[1].href === BODY_HREF &&
      BODY_HREF === "/train" &&
      all[1].label === "Body" &&
      all[1].items.map((i) => i.word).join() === "weigh-in" &&
      all[1].said === "Body: no weigh-in yet today",
    JSON.stringify(all.map((r) => [r.href, r.said]))
  );
  check(
    "due elsewhere: hidden when nothing is due elsewhere; a section with nothing due has no row; plurals and a lone boss read right",
    dueElsewhereOf({ reviewsDue: 0, questsOpen: 0, bossesReady: 0, weighInDue: false }).length === 0 &&
      dueElsewhereOf({ reviewsDue: null, questsOpen: -2, bossesReady: 0, weighInDue: false }).length === 0 &&
      dueElsewhereOf({ reviewsDue: 0, questsOpen: 0, bossesReady: 0, weighInDue: true }).map((r) => r.section).join() === "body" &&
      dueElsewhereOf({ reviewsDue: 1, questsOpen: 2, bossesReady: 3, weighInDue: false })[0].items.map(itemWords).join(" · ") === "1 review · sprint 2 left · 3 bosses"
  );
  check(
    "due elsewhere (P15, D11): the sprint's item is main-quest's word, never 'quest' (the Main quest card beside it says 'This week's sprint')",
    SPRINT_SHORT.toLowerCase() === "sprint" &&
      dueElsewhereOf({ reviewsDue: 0, questsOpen: 3, bossesReady: 0, weighInDue: false })[0].items.every((i) => i.lead === "sprint" && i.word === "left" && i.said === `3 left in ${SPRINT.charAt(0).toLowerCase()}${SPRINT.slice(1)}` && !/quest/i.test(`${i.lead} ${i.word} ${i.said}`))
  );
  check(
    "due elsewhere: a weigh-in is due only for someone who weighs in (a reading or a target) and has not logged today; never for someone who never weighs",
    !weighInDueOf({ loggedToday: false, latest: null, goal: { targetKg: null } }) &&
      weighInDueOf({ loggedToday: false, latest: { day: TODAY }, goal: { targetKg: null } }) &&
      weighInDueOf({ loggedToday: false, latest: null, goal: { targetKg: 70 } }) &&
      !weighInDueOf({ loggedToday: true, latest: { day: TODAY }, goal: { targetKg: 70 } }) &&
      !weighInDueOf(null)
  );
  check("due elsewhere: open quests are the week's rows not done (never negative)", questsOpenOf({ total: 5, done: 2 }) === 3 && questsOpenOf({ total: 2, done: 3 }) === 0 && questsOpenOf(null) === 0);
  // The strip, rendered: one link per row, the glyphs and words aria-hidden, the long form its accessible name.
  const stripHtml = renderToStaticMarkup(createElement(DueElsewhere, { rows: all }));
  check(
    "due elsewhere: rendered, it links to Ideas (/review) and Body (/train); the visible glyph-led line is aria-hidden and the row's long form is its name; never red",
    (stripHtml.match(/<a [^>]*class="away-row"/g) ?? []).length === 2 &&
      stripHtml.includes('href="/review"') &&
      stripHtml.includes('href="/train"') &&
      stripHtml.includes('<span class="sr-only">Ideas: 12 reviews due, 1 left in this week&#x27;s sprint, 1 boss ready</span>') &&
      stripHtml.includes('<span class="away-it" data-kind="quests"><svg') &&
      /data-kind="quests">[\s\S]*?<\/svg><span>sprint<\/span><b class="num">1<\/b><span>left<\/span><\/span>/.test(stripHtml) &&
      (stripHtml.match(/class="away-items" aria-hidden="true"/g) ?? []).length === 2 &&
      ["#i-study", "#i-flag", "#i-sword", "#i-train"].every((g) => stripHtml.includes(g)) &&
      !/owed|danger|warn|gold/.test(stripHtml + read("src/components/today/DueElsewhere.tsx")) &&
      renderToStaticMarkup(createElement(DueElsewhere, { rows: [] })) === "",
    stripHtml.slice(0, 160)
  );
  {
    const css = read("src/components/today/today.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const atLeast = (name: string, v: number | null, min: number) => check(`touch target: ${name} ≥ ${min}px`, v != null && v >= min, String(v));
    atLeast("a 'due elsewhere' row", cssValue(css, ".today-away .away-row", "min-height"), 44);
    atLeast("the plan card's capacity cell", cssValue(css, ".today-plan .plan-cap", "min-height"), 44);
    atLeast("the plan card's Record yesterday", cssValue(css, ".today-plan .plan-y", "min-height"), 44);
    const away = [...css.matchAll(/\.today-away[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join(";");
    check("due elsewhere: due is ink, never a hue (no owed, warn or gold in its rules)", away.length > 0 && !/--owed|--warn|--gold|--danger/.test(away));
  }
  // The day's Tier 1 moments still follow the tick that made them: a kept lane in place, the others (their tiles are
  // Character's) as the toast with its ring. Re-pinned 2026-10-15 (ui-motion D10a): any lane (Must, Planned, Habits)
  // sweeps its own card and bursts at its header, where its stamp lands; the Board clear card is its own, no toast.
  check(
    "moments: a kept lane (Must, Planned or Habits) sweeps its card and bursts at its header; the day kept, a ring and the Full day show as a toast with its ring; Board clear shows its card",
    /sweepEl: lane \? laneEl\(primaryLane, "\.lane-body"\) : null,\s*burstEl: lane \? laneBurstEl\(primaryLane\) : null,\s*ringEl: null,/.test(boardSrc) &&
      boardSrc.includes('if (!lane && primary !== "board-clear") pushToast({ title: text, ring: true, holdMs: 5000, key: `chime:${id}` });') &&
      /const laneBurstEl = \(lane: string\) => \{\s*const h = laneEl\(lane, "\.lane-h"\);\s*return h\?\.querySelector<HTMLElement>\("\.lane-stamp"\)/.test(boardSrc)
  );
  // Character's day cards: the streak and the Full day, by Today's own rules over Today's own data.
  {
    const must = tpl({ id: "meds", title: "Morning meds", compulsory: true, dueKind: "DEADLINE", dueDay: TODAY });
    const streak = { current: 3, last7Days: [true, true, true, true, true, true, false], held7Days: [false, false, false, false, false, false, false], bankedFreezes: 0 };
    const v = dayCardsOf(board(TODAY, [must]), streak);
    check(
      "Character: the streak card reads Today's board and the streak (3, not kept yet, its caption), and the Full day its rings (the Must open, 0 of 3 met before any deed)",
      v.streak.count === 3 &&
        !v.streak.kept &&
        !v.streak.broken &&
        v.caption.lead === null &&
        v.caption.rest === "Not kept yet. Any tick or review keeps it." &&
        v.fullDay.rings.length === 3 &&
        v.fullDay.rings[0].kind === "musts" &&
        !v.fullDay.rings[0].met &&
        !v.fullDay.full &&
        !v.settles &&
        v.freezes === null &&
        v.yesterdayOpen === 0,
      JSON.stringify({ streak: v.streak, caption: v.caption, met: v.fullDay.met })
    );
    const you = code(read("src/app/you/page.tsx"));
    check(
      "Character: /you draws the day cards (DayCards over dayCardsOf, Today's cached board and the streak in its one wave), and the cards link Record yesterday to Today's sheet",
      /\{day && <DayCards view=\{day\} \/>\}/.test(you) &&
        /await Promise\.all\(\[loadSheet\(userId, now\), loadTodayBoard\(userId, today, now\)\.catch\(\(\) => null\), getDailyStreak\(userId\)\.catch\(\(\) => null\)\]\);/.test(you) &&
        /const day = dayCardsOrNull\(board, streak\);/.test(you) &&
        /return dayCardsOf\(board, streak\);/.test(you) &&
        /href=\{RECORD_YESTERDAY_HREF\}/.test(read("src/components/home/DayCards.tsx")) &&
        RECORD_YESTERDAY_HREF === "/today?sheet=yesterday"
    );
  }
}
// The strip's word budget (ui-motion.md §3.1, counted by scripts/word-count.mjs at 344): glyph-led, ≤ 12 app words
// with every row at its fullest (all four items), its long forms sr-only.
asyncChecks.push(
  (async () => {
    const wc = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const fullest = renderToStaticMarkup(createElement(DueElsewhere, { rows: dueElsewhereOf({ reviewsDue: 112, questsOpen: 5, bossesReady: 3, weighInDue: true }) }));
    const counted = wc.countAppWords(fullest, { width: 344 });
    check(
      "due elsewhere (§3.1): the strip at its fullest is ≤ 12 app words at 344 (glyph + figure + a short word; the long forms are sr-only)",
      counted.count > 0 && counted.count <= 12 && !counted.words.includes("roadmap"),
      `${counted.count}: ${counted.words.join(" ")}`
    );
  })()
);

// ═══ Roadmap off Today (roadmap.md F16 seams 4, 16, 17, 18; F17; lane T; the three sections) ═══
// The app is three sections (Ideas, Tasks, Body) and Today is Tasks: the week
// quests card and the aim line moved to the Ideas landing (/review: IdeasLead,
// first in the hub's first column), still quiet: never an Ask, a count or a
// link into Review. Today keeps only a count in its "due elsewhere" strip.
// A ROADMAP goal (a task goal) still names the evidence of the part that sets its g.
{
  const code = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
  const leadSrc = code(read("src/app/review/IdeasLead.tsx"));
  const hubSrc = code(read("src/components/workspace/WorkspaceView.tsx"));

  // F16 seam 16, moved: the card is the Ideas lead's, first in the hub's first column, and Today draws no slot.
  // Re-pinned 2026-10-15 (ui-motion D10a): Done today (DonePile, .o13) sits between the goals and Inbox and Anytime.
  const o9 = /<div className="o9">([\s\S]*?)<\/div>\s*(?:<DonePile [\s\S]*?<\/DonePile>\s*)?<section className="card today-side-rows o10"/.exec(boardSrc)?.[1] ?? "";
  check(
    "week quests: the card sits in the Ideas landing's lead (WeekQuests variant today, its seek rows answered by SeekToToday), drawn first in the hub's first column; Today's .o9 holds the goals (and, from P15, the Main quest slot before them; never the week quests card)",
    // Re-pinned for P15 (D12): the lead hands the card today's life day, for the sprint's Sunday words.
    /<SeekToToday \/>\s*<WeekQuests variant="today" view=\{quests\} today=\{today\} \/>/.test(leadSrc) &&
      /<div className="rv-col">\s*\{lead\}\s*\{focus && <RoadmapFocus/.test(hubSrc) &&
      o9.includes("<GoalsStrip") &&
      !/rm-quests-slot|questsSlot|<WeekQuests|<AimLine/.test(boardSrc),
    o9.slice(0, 80)
  );
  check(
    "week quests: compact on the Ideas landing, always (its one summary line, opened in place: the wrapper's data-compact, roadmap.css's own rule), never hidden (no close-due); Today's evening rule still keys Close the day",
    /<div className="rv-lead-quests" data-compact="1">\s*<SeekToToday \/>\s*<WeekQuests variant="today" view=\{quests\} today=\{today\} \/>\s*<\/div>/.test(leadSrc) &&
      (leadSrc.match(/data-compact/g) ?? []).length === 1 &&
      !/data-close-due|rm-quests-slot|rm-aim-slot/.test(leadSrc) &&
      /\[data-compact\] \.rm-quests-today:not\(\[data-open\]\) \.rm-quests-full \{ display: none; \}/.test(read("src/components/roadmap/roadmap.css")) &&
      /const prominent = closeDayProminent\(clock\);/.test(boardSrc) &&
      boardSrc.includes('data-prominent={prominent ? "1" : undefined}')
  );
  check(
    "week quests: the evening rule — compact from 18:00 until the 04:00 edge, not at 17:59 or 04:00",
    closeDayProminent(at(TODAY, 18)) && closeDayProminent(at("2026-10-02", 3, 59)) && !closeDayProminent(at(TODAY, 17, 59)) && !closeDayProminent(at("2026-10-02", 4))
  );
  check(
    "week quests: the Ideas lead carries no data-template-id (Today's own lookups can never find it); a seek row opens its task on Today (/today#t-<id>, todayTaskHref)",
    !leadSrc.includes("data-template-id") &&
      /onSeekTemplate\(\(\{ templateId \}\) => router\.push\(todayTaskHref\(templateId\)\)\)/.test(code(read("src/app/review/SeekToToday.tsx")))
  );
  // Roadmap ruling N29 (roadmap rework 1, P3): Gemini's milestone title on the Review hub's Study card is never bare: the
  // visible mark (LayerBand's pv.suggest) and its spoken «Gemini's milestone · not checked» ride with it, only when the
  // title is Gemini's, and review.css selects data-gemini so the attribute is never a bare hook. The source here (this
  // check loads no stylesheet-bearing component); the render is pinned in roadmap-ui-check ("roadmap focus (ruling N29)").
  {
    const focusSrc = code(read("src/components/workspace/RoadmapFocus.tsx"));
    check(
      "roadmap focus (ruling N29): the h2 marks Gemini's title with LayerBand's visible mark (pv.suggest) and the spoken «Gemini's milestone · not checked», only when the title is Gemini's (code's \"Layer k\" stays bare); review.css selects .rv-focus-title[data-gemini]",
      /<h2 id="rv-focus-h" className="rv-focus-title" data-gemini=\{focus\.geminiTitle \? "" : undefined\}>\s*\{focus\.geminiTitle \? \(\s*<>\s*<span data-wc="name">\{focus\.title\}<\/span>\s*<Mark glyph="pv\.suggest" size=\{12\} \/>\s*<span className="sr-only">\{GEMINI_MILESTONE_LABEL\}<\/span>\s*<\/>\s*\) : \(\s*focus\.title\s*\)\}\s*<\/h2>/.test(focusSrc) &&
        /import \{ GEMINI_MILESTONE_LABEL \} from "@\/components\/roadmap\/roadmap-copy";/.test(focusSrc) &&
        GEMINI_MILESTONE_LABEL === "Gemini's milestone · not checked" &&
        /\.rv-focus-title\[data-gemini\] \{ display: flex; align-items: center; flex-wrap: wrap; gap: 6px; \}/.test(read("src/components/workspace/review.css")),
      "RoadmapFocus.tsx / review.css"
    );
  }
  // Today's one slot now is the strip: it only renders, and never reaches buildBoard, the counts or the Asks.
  const slotLines = boardSrc.split(/\r?\n/).filter((l) => l.includes("elsewhere"));
  // Re-pinned for blueprint P32: the props line now also takes the week's calibration slot (nextWeek), after mainQuest.
  const allowed = [/^\s*elsewhere\?: ReactNode;\s*$/, /elsewhere = null, mainQuest = null(?:, nextWeek = null)? \}: Props\) \{\s*$/, /^\s*\{elsewhere != null && elsewhere !== false && <div className="o2">\{elsewhere\}<\/div>\}\s*$/];
  check(
    "due elsewhere: the board's strip slot is only typed, received and drawn (no count, no Ask, no buildBoard input)",
    slotLines.length === 3 && slotLines.every((l) => allowed.some((r) => r.test(l))),
    slotLines.map((l) => l.trim()).join(" | ")
  );
  check(
    "week quests: no quest word reaches the board's counts or Asks (buildBoard, todayCountsOf, todayAsksOf untouched)",
    !/weekQuest|WeekQuest|questsSlot/.test(code(read("src/components/today/board-ui.ts"))) && !/weekQuest|WeekQuest|roadmap/i.test(code(read("src/lib/notifications.ts")))
  );

  // F16 seam 16: the seek listener; F17: a PRACTICE or STEP row on Today seeks its task, opening Anytime when needed.
  check(
    "seek: the board listens with onSeekTemplate and runs its own seek, marked as sought",
    /useEffect\(\(\) => onSeekTemplate\(\(\{ templateId \}\) => setSeek\(\{ id: templateId, at: Date\.now\(\), sought: true \}\)\), \[\]\);/.test(boardSrc) &&
      boardSrc.includes('from "@/components/roadmap/roadmap-events"')
  );
  const flash = /function flashSought\(el: HTMLElement\) \{([\s\S]*?)\n\}/.exec(boardSrc)?.[1] ?? "";
  check(
    "seek: a found row is flashed (sought: outlined and focused, never called 'just added'), else its place opens (Anytime) or the Inbox flashes",
    /if \(seek\.sought\) flashSought\(el\);\s*else setJustAdded\(seek\.id\);/.test(boardSrc) &&
      /const place = seekPlaceOf\(current, seek\.id\);[\s\S]*?place\.open === "anytime"\) \{\s*setAnytimeOpen\(true\);/.test(boardSrc) &&
      flash.includes('setAttribute("data-just-added", "1")') &&
      // Focus goes to the row's title (the drawer's opener), never its tick: no stray key completes the task.
      flash.includes('querySelector<HTMLElement>(".r-open")?.focus({ preventScroll: true })') &&
      !/querySelector[^\n]*\bbutton\b/.test(flash) &&
      !flash.includes("setJustAdded"),
    flash.trim().slice(0, 120)
  );
  const practice = tpl({ id: "rgp", title: "Backtest", recurrence: "TARGET:3/W", track: "CRAFT" });
  const step = tpl({ id: "rgs", title: "Set a maximum daily loss", track: "CRAFT" });
  const seekBoard = board(TODAY, [practice, step]);
  check(
    "seek: a step waiting in Anytime opens Anytime; the practice is found where the board files it; an unknown id gives up",
    seekPlaceOf(seekBoard, "rgs").open === "anytime" && seekPlaceOf(seekBoard, "rgp").found && seekPlaceOf(seekBoard, "rgp").open !== "inbox" && !seekPlaceOf(seekBoard, "gone").found,
    JSON.stringify([seekPlaceOf(seekBoard, "rgs"), seekPlaceOf(seekBoard, "rgp")])
  );
  {
    // The event itself, through lane 0's helpers, on a stand-in window (nothing else here touches it).
    const g = globalThis as { window?: unknown };
    const had = "window" in g;
    const before = g.window;
    g.window = new EventTarget();
    const got: string[] = [];
    try {
      const off = onSeekTemplate(({ templateId }) => got.push(templateId));
      seekTemplate("rgp");
      seekTemplate("bad id with spaces");
      off();
      seekTemplate("rgs");
    } finally {
      if (had) g.window = before;
      else delete g.window;
    }
    check("seek: a row's seekTemplate reaches the board's listener once, a bad id never, and nothing after unsubscribing", got.join() === "rgp" && SEEK_TEMPLATE_EVENT === "xtnl:seek-template", got.join());
  }

  // F16 seam 17: Today loads the week in the board's one wave (for the strip's count), with no Suspense, and freezes a
  // missing week after the response; the Ideas landing loads it in its own one wave for the card, and freezes it too.
  const page = code(read("src/app/today/page.tsx"));
  const reviewPage = code(read("src/app/review/page.tsx"));
  const wave = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(page)?.[1] ?? "";
  const reviewWave = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(reviewPage)?.[1] ?? "";
  check(
    "page: loadWeekQuests joins loadTodayBoard in one Promise.all (a failure reads as no count), with no Suspense or fallback; the Ideas landing reads it in its one wave (a failure reads as no card)",
    /loadTodayBoard\(userId, day, now\)/.test(wave) &&
      /loadWeekQuests\(userId, now\)\.catch\(\(\) => null\)/.test(wave) &&
      !/Suspense/.test(page) &&
      /loadWeekQuests\(userId, now\)\.catch\(\(\) => null\)/.test(reviewWave) &&
      (reviewPage.match(/Promise\.all\(/g) ?? []).length === 1 &&
      !/Suspense/.test(reviewPage)
  );
  // Revision 4 (F-R4-3), moved: the lead holds the aim line when no week quests show, so the two never appear together.
  check(
    "page: the Ideas lead is <WeekQuests variant=\"today\"> for an OPEN week with a quest, else the aim line, else (no goal open) one link to the roadmap, else nothing; Today draws neither",
    /const weekQuests = quests && weekQuestsShownOnToday\(quests\.view\) \? quests\.view : null;/.test(reviewPage) &&
      /<IdeasLead\s+quests=\{weekQuests\}\s+aimLine=\{weekQuests \? null : aimLine\}\s+noAim=\{noAim\}/.test(reviewPage) &&
      /const noAim = aimStep != null && aimStep\.open == null && !\(\(aimStep\.openCount \?\? 0\) > 0\);/.test(reviewPage) &&
      /lead=\{lead\}/.test(reviewPage) &&
      /const roadmap = quests \? \([\s\S]*?<WeekQuests variant="today" view=\{quests\} today=\{today\} \/>[\s\S]*?\) : aimLine \? \(\s*<AimLine view=\{aimLine\} \/>\s*\) : noAim \? \([\s\S]*?href=\{ROADMAP_HREF\}[\s\S]*?\) : null;/.test(leadSrc) &&
      // P15 (D12): the page hands the lead its life day, for the sprint's Sunday words.
      /bossesReady=\{bosses\.filter\(\(b\) => b\.availability\.status === "ready"\)\.map\(\(b\) => b\.archetype\.name\)\}\s+today=\{today\}\s+\/>/.test(reviewPage) &&
      !/<WeekQuests\b|<AimLine\b|aimLine|questsSlot|components\/roadmap\/(WeekQuests|AimLine)/.test(page)
  );
  check(
    "page: a week not yet frozen is frozen after the response (RENDER), never on a writes-off server (Today and the Ideas landing)",
    [page, reviewPage].every((p) => /if \(quests && !quests\.frozen && !quests\.view\.writesOff\) \{\s*after\(\(\) => freezeWeekQuests\(userId, now, "RENDER"\)\);\s*\}/.test(p))
  );
  // F16 seam 3: the board's own read carries the stored series (one query, only for an open ROADMAP goal), so
  // Today and the weekly review's goals check-in read the same g; the page queries nothing of its own.
  const tasksSrc = code(read("src/lib/tasks.ts"));
  check(
    "board read: loadTodayBoard attaches roadmapGoals (today-board roadmapGoalIdsOf → loadRoadmapGoalSeries) under the 'roadmap' tag; the page adds no query",
    /cached\(`today:\$\{userId\}:\$\{day\}`, \["life", "activity", "ideas", "roadmap"\]/.test(tasksSrc) &&
      /const ids = roadmapGoalIdsOf\(templates\);\s*if \(ids\.length === 0\) return \{\};/.test(tasksSrc) &&
      !/loadRoadmapGoalSeries/.test(page)
  );
  check(
    "week quests: Today's card only for an OPEN week with a quest",
    weekQuestsShownOnToday({ state: "OPEN", rows: [1] }) && !weekQuestsShownOnToday({ state: "OPEN", rows: [] }) && !weekQuestsShownOnToday({ state: "HELD", rows: [1] }) && !weekQuestsShownOnToday(null)
  );

  // The review quest keeps every word it has: Next up's quest card, byte for byte, and the Full-day ring's label.
  const nuHtml = renderToStaticMarkup(
    createElement(NextUp, { next: nextUpOf({ quest: { reviews: 6, target: 26, dueNow: 20, met: false, cap: 15 }, must: [] }), focus: null, bosses: [], quota: null, reviewHref: "/review" })
  );
  const NEXT_UP_QUEST_HTML =
    '<section class="card today-hero" aria-labelledby="nu-h"><div class="hero-top"><span class="t-eyebrow">Next up · Quest</span><span class="t-meta num">about 3 min</span></div><h2 id="nu-h" class="t-display-m">Clear the review quest</h2><p class="t-meta">6 of 15 done · 15 cards of 26 due · paid in review points, 0 life XP</p><div class="segs hero-segs" role="img" aria-label="Quest: 6 of 15 reviewed"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="cur"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><a class="btn btn-primary lg btn-block" aria-keyshortcuts="r" href="/review"><svg class="i" aria-hidden="true" focusable="false"><use href="#i-study"></use></svg>Start review<span class="kbd" aria-hidden="true">R</span></a></section>';
  check("review quest: Next up's quest card renders byte for byte as before the roadmap", nuHtml === NEXT_UP_QUEST_HTML, nuHtml.slice(0, 120));
  const ring = fullDayOf({ musts: { kept: 1, total: 2 }, quest: { reviews: 6, target: 26, dueNow: 20 }, lifeDeeds: 1 }).rings.find((r) => r.kind === "quest");
  check("review quest: the Full-day ring still reads 'Quest · 6 of 15'", ring?.label === "Quest" && ring.caption === "6 of 15", `${ring?.label} ${ring?.caption}`);
  check(
    "review quest: its files import nothing of the roadmap",
    ["src/components/today/NextUp.tsx", "src/components/today/DayLedger.tsx", "src/components/today/board-ui.ts", "src/lib/full-day.ts", "src/lib/review-facts.ts"].every((f) => !/roadmap/i.test(code(read(f))))
  );

  // No week quest row links to Review or carries data-template-id (R5's component; a guard that holds before and after it lands).
  const roadmapUi = readdirSync(join(ROOT, "src/components/roadmap"))
    .filter((n) => n.endsWith(".tsx"))
    .map((n) => code(read(`src/components/roadmap/${n}`)));
  check(
    "week quests: no roadmap component carries data-template-id or links to /review",
    roadmapUi.length > 0 && roadmapUi.every((s) => !s.includes("data-template-id") && !/href=\{?["'`]\/review/.test(s))
  );

  // ROADMAP goals on the strip (seam 4): the evidence of the binding part and when it was measured, the
  // chip, 'pays nothing · …' with its reason, the reset note in ink; never +1, never an owed tone.
  const rmHtml = renderToStaticMarkup(
    createElement(GoalsStrip, { goals: fixtureRoadmapBoard().goals, busy: false, onProgress: () => {}, launched: true, onClose: () => {}, onReschedule: () => {} })
  );
  check(
    "roadmap goal: '23% · tested by your reviews · slowest: cards at level 6+ · measured 09:12', with its stated ⬡ 6",
    rmHtml.includes(">23%<") && rmHtml.includes("· tested by your reviews · slowest: cards at level 6+ · measured 09:12") && rmHtml.includes("× progress from 70%"),
    rmHtml.slice(0, 400)
  );
  check("roadmap goal: the quiet chip 'Roadmap · milestone 2 of 6'", rmHtml.includes('<span class="chip">Roadmap · milestone 2 of 6</span>'));
  check("roadmap goal: a 0-stated milestone reads 'pays nothing · knowledge is paid by reviews'", rmHtml.includes("pays nothing · knowledge is paid by reviews"));
  check(
    "roadmap goal: a reset-archived one reads 'not measured', says 'measures removed by a reset', and draws no meter",
    rmHtml.includes(">not measured<") && rmHtml.includes("measures removed by a reset") && (rmHtml.match(/role="meter"/g) ?? []).length === 3,
    String((rmHtml.match(/role="meter"/g) ?? []).length)
  );
  check(
    "roadmap goal: no +1 on a measured-from-records goal, no owed tone, a Close per goal",
    !rmHtml.includes("Add one to") && !/owed/.test(rmHtml) && (rmHtml.match(/aria-label="Close [^"]*"/g) ?? []).length === 5
  );
  // The fix round, card by card (each goal is one `.goal` div keyed by its template id).
  const rmCard = (id: string) => {
    const at = rmHtml.indexOf(`data-template-id="${id}"`);
    if (at < 0) return "";
    const next = rmHtml.indexOf('<div class="goal"', at);
    return rmHtml.slice(at, next < 0 ? undefined : next);
  };
  // Never measured again (an archived roadmap; a row replaced by Start again, roadmap-types isSupersededRow):
  // its close pays 0 whatever it stated, so the card says 'pays nothing' and never offers '× progress'.
  const gone = ["rm-reset", "rm-again"].map(rmCard);
  check(
    "roadmap goal: never measured again ('measures removed by a reset', 'replaced by Start again') reads 'not measured · pays nothing', the note in ink, no meter, no '× progress'",
    gone.every((h) => h.includes(">not measured<") && h.includes("· pays nothing") && !h.includes("× progress") && !h.includes('role="meter"') && /<p class="t-meta goal-note">/.test(h)) &&
      gone[0].includes(">measures removed by a reset<") &&
      gone[1].includes(">replaced by Start again<") &&
      gone[1].includes("Roadmap · milestone 4 of 6"),
    gone.map((h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)).join(" | ")
  );
  check(
    "roadmap goal: a measured goal keeps its stated rule ('pays ⬡ 6 × progress from 70%')",
    rmCard("rm-goal").includes("× progress from 70%") && !rmCard("rm-goal").includes("pays nothing"),
    rmCard("rm-goal").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
  );
  {
    // A milestone just started (no reading yet, no note) may still be measured: 'not measured yet', and its rule stands.
    const fd = fixtureRoadmapBoardData();
    const fresh = renderToStaticMarkup(
      createElement(GoalsStrip, {
        goals: buildBoard({ ...fd, roadmapGoals: { ...fd.roadmapGoals, "rm-goal": { series: [], ord: 2, of: 6, zeroReason: null, note: null } } }).goals,
        busy: false,
        onProgress: () => {},
        launched: true,
        onClose: () => {},
        onReschedule: () => {},
      })
    );
    const at = fresh.indexOf('data-template-id="rm-goal"');
    const one = at < 0 ? "" : fresh.slice(at, fresh.indexOf('<div class="goal"', at));
    check(
      "roadmap goal: no reading yet reads 'not measured yet' with its stated rule (never 'pays nothing': a reading may still come)",
      one.includes(">not measured yet<") && one.includes("× progress from 70%") && !one.includes("pays nothing"),
      one.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
    );
  }
  // Before life counts nothing states MP: a never-measured goal reads 'pays through its steps' like every other goal.
  const preHtml = renderToStaticMarkup(createElement(GoalsStrip, { goals: fixtureRoadmapBoard().goals, busy: false, onProgress: () => {}, launched: false }));
  check(
    "roadmap goal: before launch no card states a payout (not even 'pays nothing' for a goal never measured again)",
    !preHtml.includes("pays nothing") && !preHtml.includes("× progress") && (preHtml.match(/pays through its steps/g) ?? []).length === 5
  );
  // Lens 2 minor (LINEAGE_PAID drops its date): the day it paid reaches the card.
  check(
    "roadmap goal: a paid lineage reads 'pays nothing · this milestone already paid on 18 Sep' beside its measured figure",
    rmCard("rm-paid").includes("pays nothing · this milestone already paid on 18 Sep") && rmCard("rm-paid").includes(">55%<"),
    rmCard("rm-paid").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
  );
  // Contract §9.3 (writes off): Today's card shows the stored readings with their real 'measured' time, so it never
  // says NOT_RECORDED_HERE; only the Close sheet's live figure (payout.readingNote, computed on the request) does.
  check(
    "roadmap goal: the strip and the board's card words never print 'not recorded on this server' (stored readings only)",
    !/not recorded/i.test(code(read("src/components/today/GoalsStrip.tsx"))) &&
      !/not recorded/i.test(/export function roadmapGoalCardOf[\s\S]*?\n\}/.exec(code(read("src/lib/today-board.ts")))?.[0] ?? "not recorded") &&
      !/NOT_RECORDED_HERE/.test(code(read("src/lib/today-board.ts")))
  );

  // The Close sheet: the zero reason, the reset note and the payout's readingNote (a writes-off server's live figure).
  const sheets = code(read("src/components/today/GoalSheets.tsx"));
  check(
    "close sheet: a ROADMAP goal adds 'Pays nothing · <reason>', its reset note and 'Live figure · not recorded on this server'",
    sheets.includes("Pays nothing · {roadmap.zeroReason}") && sheets.includes("{capitalised(roadmap.note)}") && /preview\.payout\?\.readingNote/.test(sheets) && sheets.includes("Live figure · {readingNote}") &&
      /roadmap=\{goalClose\?\.roadmap \?\? null\}/.test(boardSrc)
  );

  // F23 (lane T): /dev/style/today shows the six week quests states, compact in the board's own slot.
  const fx = code(read("src/app/dev/style/today/TodayFixtures.tsx"));
  check(
    "fixture: the nine states — open, partial, all done, compact, writes off, practice-only (generator 1), and rev 4's parts, more parts, body plan with the health line (generator 2)",
    QUEST_FIXTURES.map((f) => f.key).join() === "open,partial,done,compact,writes-off,practice-only,parts,parts-more,body-health" &&
      QUEST_FIXTURES.filter((f) => f.input.set.generator === 2).map((f) => f.key).join() === "parts,parts-more,body-health" &&
      QUEST_FIXTURES.filter((f) => f.compact).map((f) => f.key).join() === "compact" &&
      QUEST_FIXTURES.find((f) => f.key === "writes-off")?.input.writesOff === true &&
      QUEST_FIXTURES.find((f) => f.key === "practice-only")?.input.set.quests.every((q) => q.kind === "PRACTICE") === true
  );
  check(
    "fixture: each state is drawn by WeekQuests (variant today) in an rm-quests-slot, compact via data-compact; the views come from weekQuestsViewOf",
    /<div className="rm-quests-slot" data-compact=\{q\.compact \? "1" : undefined\}>\s*<WeekQuests variant="today" view=\{q\.view\} \/>/.test(fx) && /return weekQuestsViewOf\(f\.input\);/.test(fx) && !/\b(measured|recorded|selfReported)\(/.test(fx)
  );
  const labels = QUEST_FIXTURES.flatMap((f) => f.input.set.quests.map((q) => q.label));
  check(
    "fixture: week quest labels start with their verb or name, never 'Quest', and hold no bare 'n of N'",
    labels.every((l) => /^(Bring|Add|Step: |Checkpoint: |[A-Z])/.test(l) && !/^Quest/i.test(l) && !/\b\d+ of \d+\b/.test(l)),
    labels.join(" | ")
  );
  check(
    "fixture: the done state is all done, the open state none, the partial state some",
    (() => {
      const st = (k: string) => QUEST_FIXTURES.find((f) => f.key === k)!.input.progress;
      return st("done").every((p) => p.done) && st("open").every((p) => !p.done && p.progress === 0) && st("partial").some((p) => p.done) && st("partial").some((p) => !p.done);
    })()
  );
}

// ═══ Revision 4: the aim line, moved to the Ideas landing (roadmap-rev4.md F-R4-3; lane T; the three sections) ═══
// One quiet line in the Ideas lead (/review), only when no week quests show:
// SET on fresh-start days with its back-off, DRAFT, START. Loaded in the
// Ideas page's one wave; never a count, an Ask, the bell, red or a write.
// Today (the Tasks section) draws it no more, and so has no evening hide for
// it; its Close the day keeps the evening rule.
{
  const code = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const todayPage = code(read("src/app/today/page.tsx"));
  const page = code(read("src/app/review/page.tsx"));
  const leadSrc = code(read("src/app/review/IdeasLead.tsx"));
  const boardSrc = code(read("src/components/today/TodayBoard.tsx"));

  // The loads: loadAimStep (R4) and cookies() join the Ideas page's one wave; nothing else is read for the line.
  const wave = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(page)?.[1] ?? "";
  check(
    "aim line: loadAimStep (a failure reads as no line) and cookies() sit in the Ideas page's one Promise.all; Today reads neither",
    (page.match(/Promise\.all\(/g) ?? []).length === 1 &&
      /const \[allFields, bosses, day, progression, streak, lastSeen, focusRows, quests, aimStep, jar\] = await Promise\.all\(\[/.test(page) &&
      /loadAimStep\(userId, now\)\.catch\(\(\) => null\),/.test(wave) &&
      /\bcookies\(\),?\s*$/.test(wave.trim()) &&
      !/await cookies\(\)/.test(page) &&
      !/loadAimStep|cookies\(\)|AIM_PROMPT_COOKIE|todayAimLineOf/.test(todayPage),
    wave.replace(/\s+/g, " ").trim()
  );
  check("aim line: the page never calls loadAimCard (loadAimStep is the line's own ≤ 4-read loader)", !/loadAimCard/.test(page) && page.includes('import { loadAimStep } from "@/lib/roadmap-server";'));
  // The rule: roadmap-invite todayAimLineOf over the step, the prompt from aimPromptOf (the stored switch and the
  // 'later:', 'hide:' or 'off' cookie), the anchor cookie, the step snooze cookie, the life day, and the Start gate in force
  // (blueprint P14: roadmapGoalsLive(), which is ROADMAP_GOALS_LIVE in production and false while the code value is).
  check(
    "aim line: todayAimLineOf reads the step, aimPromptOf(cookie, aimSuggestions, today), both cookies, the life day and roadmapGoalsLive() (ROADMAP_GOALS_LIVE, false in code)",
    /const aimCookie = jar\.get\(AIM_PROMPT_COOKIE\)\?\.value;\s*const aimLine = todayAimLineOf\(\{\s*step: aimStep,\s*prompt: aimPromptOf\(aimCookie, aimStep\?\.aimSuggestions \?\? null, today\),\s*cookie: aimCookie,\s*stepCookie: jar\.get\(AIM_STEP_COOKIE\)\?\.value,\s*today,\s*(?:\/\/[^\n]*\n\s*)?goalsLive: roadmapGoalsLive\(\),\s*\}\);/.test(
      page
    ) &&
      !/\bROADMAP_GOALS_LIVE\b/.test(page) &&
      ROADMAP_GOALS_LIVE === false &&
      roadmapGoalsLive({ NODE_ENV: "production" }) === false &&
      roadmapGoalsLive({ NODE_ENV: "production", XTNL_ROADMAP_GOALS_LIVE: "1" }) === false &&
      /const today = todayKey\(now\);/.test(page) &&
      AIM_STEP_COOKIE === "xtnl-aim-step"
  );
  // Fix round (lane 0's HIDDEN prompt): the page never branches on the prompt itself, so every AimPrompt value
  // (ASK, LATER, HIDDEN, OFF, and any later one) reaches the line only through todayAimLineOf.
  check(
    "aim line: the page and the lead never branch on the prompt (no AimPrompt literal, no prompt comparison): a new prompt state needs no Ideas code",
    !/"(?:ASK|LATER|HIDDEN|OFF)"/.test(page + leadSrc) && !/prompt\s*[!=]==/.test(page + leadSrc) && (page.match(/aimPromptOf\(/g) ?? []).length === 1
  );
  // The fixtures read the line exactly as the page does (so every fixture state is the page's own answer).
  const fxSrc = code(read("src/app/dev/style/today/fixtures.ts"));
  check(
    "aim line: the fixtures' aimLineOfFixture reads todayAimLineOf with the page's own arguments",
    /return todayAimLineOf\(\{\s*step: f\.step,\s*prompt: aimPromptOf\(f\.cookie, f\.step\.aimSuggestions \?\? null, f\.today\),\s*cookie: f\.cookie,\s*stepCookie: f\.stepCookie,\s*today: f\.today,\s*goalsLive: f\.goalsLive,\s*\}\);/.test(fxSrc)
  );

  // The evening hide was Today's (F-R4-3: the line hid while Close the day was due). Off Today there is no Close the
  // day beside it, so the Ideas lead draws the line in no close-due wrapper (its one data-compact is the week quests
  // card's own, which never holds the line); Today keeps its evening rule for Close the day itself, over its own
  // board's close list, and builds no second board.
  check(
    "aim line: off Today the line has no evening hide (no rm-quests-slot, rm-aim-slot or data-close-due on the Ideas lead; the line sits outside the quests' compact wrapper); Today's data-prominent is still the evening clock (closeDayProminent)",
    !/rm-quests-slot|rm-aim-slot|data-close-due/.test(leadSrc) &&
      /\) : aimLine \? \(\s*<AimLine view=\{aimLine\} \/>\s*\) :/.test(leadSrc) &&
      /const prominent = closeDayProminent\(clock\);/.test(boardSrc) &&
      !/rm-quests-slot|data-compact/.test(boardSrc)
  );
  check(
    "aim line: Today builds no second board for it (no buildBoard or closeItemsOf in the page); the board's Close the day list is closeItemsOf over its own board",
    !/buildBoard\(|closeItemsOf\(|closeDue/.test(todayPage) &&
      /const closeItems = closeItemsOf\(\{ must: board\.must, todayRows: board\.todayRows, today: current\.today, live, tokens: live \? \(duty\?\.freezes\.forToday \?\? duty\?\.freezes\.banked \?\? 0\) : null \}\);/.test(boardSrc) &&
      /const live = board\.dutyLive;/.test(boardSrc)
  );
  {
    const closeDueOf = (data: BoardData): boolean => {
      const b = buildBoard(data);
      return closeItemsOf({ must: b.must, todayRows: b.todayRows, today: b.today, live: b.dutyLive }).length > 0;
    };
    const meds = tpl({ id: "meds", title: "Morning meds", compulsory: true, dueKind: "DEADLINE", dueDay: TODAY, mvv: "take them" });
    check(
      "aim line: close-due with a must still open; not with nothing left open (an evening with nothing to close still shows the line)",
      closeDueOf(board(TODAY, [meds])) && !closeDueOf(board(TODAY, [])) && closeDayProminent(at(TODAY, 19))
    );
  }
  // The rule in roadmap.css (R5's file; spec F-R4-3 "the compact :has rule"): hide the slot only when it is compact
  // AND its aim slot is close-due. Binding once AimLine is no longer lane 0's shell; until then it is printed PENDING.
  const rmCss = code(read("src/components/roadmap/roadmap.css"));
  const HIDE_RULE = /\.rm-quests-slot\[data-compact\]:has\(> \.rm-aim-slot\[data-close-due\]\)\s*\{\s*display:\s*none;?\s*\}/;
  const aimLineShell = /STUB:/.test(read("src/components/roadmap/AimLine.tsx"));
  const hideRuleName = "aim line: roadmap.css hides the slot only while compact AND close-due: .rm-quests-slot[data-compact]:has(> .rm-aim-slot[data-close-due]) { display: none; }";
  if (!aimLineShell) check(hideRuleName, HIDE_RULE.test(rmCss));
  else pending("R5", hideRuleName, HIDE_RULE.test(rmCss), "binding once AimLine.tsx loses its STUB marker");
  const aimSelectors = [...rmCss.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => s.includes("rm-aim") && s.includes("data-compact"));
  check(
    "aim line: no rule hides it on the evening clock alone (every selector naming rm-aim with data-compact also needs data-close-due)",
    aimSelectors.every((s) => s.includes("data-close-due")),
    aimSelectors.join(" | ")
  );

  // Quiet by construction: the lead adds no class of its own beyond plain rows, and nothing reaches the counts.
  const roadmapExpr = /const roadmap = ([\s\S]*?) : null;/.exec(leadSrc)?.[1] ?? "";
  check(
    "aim line: the lead's roadmap slot is plain (no owed, warn, danger or gold class; no data-template-id; no /review link)",
    roadmapExpr.includes("<AimLine view={aimLine} />") && !/owed|warn|danger|gold|data-template-id|\/review/.test(roadmapExpr),
    roadmapExpr.replace(/\s+/g, " ").trim().slice(0, 200)
  );
  check(
    "aim line: the Ideas page and its lead write nothing for it (no action import, no snooze, no handoff, no after() for the aim); Today neither",
    [page, leadSrc, todayPage].every((p) => !/@\/app\/actions/.test(p) && !/snoozeAim|setAimSuggestions|writeAimHandoff|dismissAimPrompt/.test(p) && !/after\([^)]*aim/i.test(p))
  );
  const shellFiles = readdirSync(join(ROOT, "src/components/shell"))
    .filter((n) => /\.(tsx?|css)$/.test(n))
    .map((n) => `src/components/shell/${n}`);
  const quiet = [
    "src/components/today/board-ui.ts",
    "src/lib/today-board.ts",
    "src/lib/tasks.ts",
    "src/lib/notifications.ts",
    "src/components/today/TodayBoard.tsx",
    "src/app/today/page.tsx",
    "src/components/today/due-elsewhere.ts",
    "src/components/today/DueElsewhere.tsx",
    ...shellFiles,
  ];
  const loud = quiet.filter((f) => /aimLine|AimLine|aimStep|AimStep|rm-aim/.test(code(read(f))));
  check(
    "aim line: board-ui.ts, todayCountsOf (tasks.ts), notifications.ts, the board, the Today page and its strip, and the shell (nav count, bell, Asks) never name it",
    shellFiles.length > 0 && loud.length === 0,
    loud.join(", ")
  );
  const countsFn = /export function todayCountsOf[\s\S]*?\n\}/.exec(code(read("src/lib/tasks.ts")))?.[0] ?? "";
  check("aim line: todayCountsOf counts no roadmap row", countsFn.length > 0 && !/roadmap|aim/i.test(countsFn));

  // The fixture states (F-R4-3 Files: SET WEEK, MONTH, BACK and NEXT, backed off, DRAFT, START and compact).
  const want: Record<AimLineFixture["key"], ReturnType<typeof aimLineKindOf>> = {
    "set-week": "SET WEEK",
    "set-month": "SET MONTH",
    "set-back": "SET BACK",
    "set-next": "SET NEXT",
    "backed-off": null,
    "backed-off-first": "SET MONTH",
    hidden: null,
    draft: "DRAFT",
    start: "START",
    "start-keeps": "START",
    "start-track": "START",
    "start-part": "START",
    "start-part-depth": "START",
    compact: "SET WEEK",
    "compact-clear": "SET WEEK",
  };
  check(
    "aim fixtures: the fifteen states, in order (fix round: hidden, the longest START line, a count gate at the depth)",
    AIM_LINE_FIXTURES.map((f) => f.key).join() ===
      "set-week,set-month,set-back,set-next,backed-off,backed-off-first,hidden,draft,start,start-keeps,start-track,start-part,start-part-depth,compact,compact-clear",
    AIM_LINE_FIXTURES.map((f) => f.key).join()
  );
  check(
    "aim fixtures: the days are what they say (Mon 8 Mar 2027; Thu 1 Apr 2027), after AIM_INVITE_SINCE (the back-off's floor never moves them)",
    weekdayOf(AIM_MON) === 1 && !AIM_MON.endsWith("-01") && weekdayOf(AIM_FIRST) === 4 && AIM_FIRST.endsWith("-01") && AIM_INVITE_SINCE < "2027-01-01",
    AIM_INVITE_SINCE
  );
  const got = AIM_LINE_FIXTURES.map((f) => [f.key, aimLineKindOf(aimLineOfFixture(f))] as const);
  check(
    "aim fixtures: each state is todayAimLineOf's own answer, and the one it says",
    got.every(([k, kind]) => kind === want[k] && kind === AIM_LINE_FIXTURES.find((f) => f.key === k)?.expect),
    got.map(([k, kind]) => `${k}=${kind}`).join(" ")
  );
  const fx = (k: AimLineFixture["key"]) => AIM_LINE_FIXTURES.find((f) => f.key === k)!;
  const startOf = (k: AimLineFixture["key"]) => {
    const v = aimLineOfFixture(fx(k));
    return v && v.kind === "START" ? { ord: v.ord, stage: v.stageName, gives: v.givesRank, href: v.href } : null;
  };
  check(
    "aim fixtures: START names the stage from STAGE_NAMES and the rank it gives ('Milestone 2 · Familiar … Journeyman'); between two gates it keeps your rank; a track plan names no stage; a count gate reads 'Familiar, part 1'",
    JSON.stringify([startOf("start"), startOf("start-keeps"), startOf("start-track"), startOf("start-part")]) ===
      JSON.stringify([
        { ord: 2, stage: "Familiar", gives: "Journeyman", href: "/you/roadmap#now" },
        { ord: 4, stage: "Toward Mastered", gives: null, href: "/you/roadmap#now" },
        { ord: 2, stage: null, gives: "Journeyman", href: "/you/roadmap#now" },
        { ord: 1, stage: "Familiar, part 1", gives: "Journeyman", href: "/you/roadmap#now" },
      ]),
    JSON.stringify([startOf("start"), startOf("start-keeps"), startOf("start-track"), startOf("start-part")])
  );
  // Fix round (lens 2, contracts §15.4): the fixtures' rank indices are the contract's, not typed guesses.
  {
    const bad = Object.entries(AIM_LADDERS).flatMap(([name, l]) =>
      l.rows
        .map(([stage, gate, rank], i) => [i + 1, stage, gate, rank, l.depth == null ? i + 1 : rankIndexForStage(stage, gate, l.depth)] as const)
        .filter(([, , , rank, want]) => rank !== want)
        .map(([ord, stage, gate, rank, want]) => `${name} #${ord} ${stage}@${gate}: ${rank} vs ${want}`)
    );
    const ranks = (k: keyof typeof AIM_LADDERS) => AIM_LADDERS[k].rows.map(([, , r]) => r).join();
    check(
      "aim fixtures: every ladder's rank index is rankIndexForStage(stage, gate level, depth) (a track plan's k-th stage ranks k); the new learner ranks [2, 2, 3, 4, 4, 5] and the pack [2, 3, 4, 4, 5] (F-R4-12)",
      bad.length === 0 && ranks("learner") === "2,2,3,4,4,5" && ranks("pack") === "2,3,4,4,5",
      bad.join(" | ")
    );
  }
  {
    // A library holding Fluent at depth Mastered: the count gate counts toward level 12 itself, with retry entries
    // (the 'r' segment), so Today's START line must not promise the depth's rank before the depth is held.
    const v = aimLineOfFixture(fx("start-part-depth"));
    const held = AIM_LADDERS["held-fluent"].rows.filter(([, , , h]) => h).length;
    check(
      "aim fixtures: a count gate at the depth (a library holding Fluent, aimed at Mastered) reads 'Milestone 5 · Mastered, part 1' and gives Expert, never Virtuoso before the depth is held; the four held stages give no rank and are skipped",
      v?.kind === "START" &&
        v.ord === 5 &&
        v.stageName === "Mastered, part 1" &&
        v.givesRank === "Expert" &&
        held === 4 &&
        rankIndexForStage("PART", 12, 12) === STAGE_RANK.FLUENT &&
        rankIndexForStage("PART", 12) === STAGE_RANK.FLUENT &&
        rankIndexForStage("MASTERED", 12, 12) === STAGE_RANK.MASTERED &&
        rankIndexForStage("PART", 6, 12) === STAGE_RANK.FAMILIAR,
      JSON.stringify(v)
    );
  }
  check(
    "aim fixtures: START never shows while ROADMAP_GOALS_LIVE is false (each START state assumes it on, and with it off gives nothing); the other states assume it as shipped",
    (["start", "start-keeps", "start-track"] as const).every((k) => fx(k).goalsLive && aimLineOfFixture({ ...fx(k), goalsLive: false }) === null) &&
      AIM_LINE_FIXTURES.filter((f) => f.expect !== "START").every((f) => !f.goalsLive),
    `ROADMAP_GOALS_LIVE is ${ROADMAP_GOALS_LIVE}`
  );
  check(
    "aim fixtures: the Settings switch (aimSuggestions false) and a legacy 'off' cookie silence SET only; DRAFT and START still show",
    aimLineOfFixture({ ...fx("set-week"), step: { ...fx("set-week").step, aimSuggestions: false } }) === null &&
      aimLineOfFixture({ ...fx("set-week"), cookie: "off" }) === null &&
      aimLineKindOf(aimLineOfFixture({ ...fx("draft"), step: { ...fx("draft").step, aimSuggestions: false } })) === "DRAFT" &&
      aimLineKindOf(aimLineOfFixture({ ...fx("start"), cookie: "off" })) === "START"
  );
  check(
    "aim fixtures: 'Not now' on DRAFT (the step cookie) hides it the next day; on SET (Today's ×: a fresh 'hide:' cookie) hides SET, as the /you ASK card's 'later:' does",
    aimLineOfFixture({ ...fx("draft"), stepCookie: stepCookieValue("DRAFT", "rm-fx", AIM_MON) }) === null &&
      aimLineOfFixture({ ...fx("set-week"), cookie: hideCookieValue(addDays(AIM_MON, -1)) }) === null &&
      aimLineOfFixture({ ...fx("set-week"), cookie: laterCookieValue(addDays(AIM_MON, -1)) }) === null
  );
  // Fix round 2 (lens 1 and lens 3 minor, the Today SET × ruling): Today's SET × is labelled "Not now: no aim
  // suggestions for 4 weeks" (the /you LATER line's × label), so it writes what that label promises: 'hide:'
  // (hideAimPrompt), which /you reads as HIDDEN (no "Set an aim →" line) and Today as nothing for AIM_LATER_DAYS,
  // the 1st included. 'later:' (snoozeAimPrompt) would leave /you's LATER line, an aim suggestion, under that label.
  {
    const aimLineSrc = code(read("src/components/roadmap/AimLine.tsx"));
    const setAction = /kind\s*===\s*"SET"\s*\?\s*a\.(\w+)\(/.exec(aimLineSrc)?.[1] ?? null;
    const xDay = addDays(AIM_MON, -1); // Sun 7 Mar 2027: the × on a Sunday's line
    const after = (today: DayKey) => aimLineOfFixture({ ...fx("set-week"), today, step: { ...fx("set-week").step, lastOpenBefore: addDays(today, -1) }, cookie: hideCookieValue(xDay) });
    check(
      "aim line: Today's SET × calls hideAimPrompt ('hide:'), the 4 weeks its label promises: /you reads HIDDEN, not LATER's 'Set an aim →'; after a × on Sun 7 Mar the next Monday and the next 1st (Thu 1 Apr, day 25) show nothing, and Mon 5 Apr (day 29) asks again",
      setAction === "hideAimPrompt" &&
        !/snoozeAimPrompt/.test(aimLineSrc) &&
        AIM_NOT_NOW_SET_LABEL === `Not now: no aim suggestions for ${AIM_LATER_DAYS / 7} weeks` &&
        aimPromptOf(hideCookieValue(xDay), null, addDays(xDay, 1)) === "HIDDEN" &&
        aimPromptOf(laterCookieValue(xDay), null, addDays(xDay, 1)) === "LATER" &&
        after(AIM_MON) === null &&
        after(AIM_FIRST) === null &&
        aimLineKindOf(after(addDays(xDay, AIM_LATER_DAYS + 1))) === "SET WEEK",
      `SET × → ${setAction} · label "${AIM_NOT_NOW_SET_LABEL}" · Mon 5 Apr: ${aimLineKindOf(after(addDays(xDay, AIM_LATER_DAYS + 1)))}`
    );
  }
  // Fix round (lens 3 #9, lane 0's HIDDEN): "Not now" on the /you LATER line writes 'hide:<day>'. Its label says
  // "no aim suggestions for 4 weeks", so Today's SET keeps quiet for AIM_LATER_DAYS too, the 1st included.
  {
    const mon29 = addDays(AIM_FIRST, -3); // Mon 29 Mar 2027, 7 days after the 'hide:' of Mon 22 Mar
    const hide = hideCookieValue(addDays(AIM_FIRST, -10));
    const on29 = (cookie: string) => aimLineOfFixture({ ...fx("set-week"), today: mon29, step: { ...fx("set-week").step, lastOpenBefore: addDays(mon29, -1) }, cookie });
    check(
      "aim fixtures: the /you line's 'Not now' (a 'hide:' cookie, the HIDDEN prompt) quiets SET on Today for 4 weeks: a Monday and the 1st give nothing, where the same days ask without it",
      fx("hidden").cookie === hide &&
        hide === `hide:${addDays(AIM_FIRST, -10)}` &&
        aimPromptOf(hide, null, AIM_FIRST) === "HIDDEN" &&
        aimLineOfFixture(fx("hidden")) === null &&
        aimLineKindOf(aimLineOfFixture(fx("backed-off-first"))) === "SET MONTH" &&
        weekdayOf(mon29) === 1 &&
        on29(hide) === null &&
        aimLineKindOf(on29(laterCookieValue(addDays(mon29, -31)))) === "SET WEEK"
    );
    const onMon = (cookie: string | undefined) => aimLineKindOf(aimLineOfFixture({ ...fx("set-week"), cookie }));
    check(
      "aim fixtures: on its 28th day 'hide:' asks again and the back-off starts from there (askAnchorOf counts it like 'later:'); a day earlier it still hides",
      AIM_LATER_DAYS === 28 &&
        onMon(hideCookieValue(addDays(AIM_MON, -27))) === null &&
        onMon(hideCookieValue(addDays(AIM_MON, -28))) === "SET WEEK" &&
        onMon(hideCookieValue(addDays(AIM_MON, -31))) === "SET WEEK" &&
        onMon(undefined) === null,
      `-27: ${onMon(hideCookieValue(addDays(AIM_MON, -27)))} · -28: ${onMon(hideCookieValue(addDays(AIM_MON, -28)))} · -31: ${onMon(hideCookieValue(addDays(AIM_MON, -31)))} · none (backed off since AIM_INVITE_SINCE): ${onMon(undefined)}`
    );
    check(
      "aim fixtures: 'hide:' silences SET only: DRAFT and START (the user's own pending work) still show",
      aimLineKindOf(aimLineOfFixture({ ...fx("draft"), cookie: hide })) === "DRAFT" && aimLineKindOf(aimLineOfFixture({ ...fx("start"), cookie: hide })) === "START"
    );
  }
  check(
    "aim fixtures: the two compact states are the evening (data-compact), one with something to close (hidden) and one with nothing (shown); no other state is compact",
    AIM_LINE_FIXTURES.filter((f) => f.compact).map((f) => `${f.key}:${f.closeDue}`).join() === "compact:true,compact-clear:false" && AIM_LINE_FIXTURES.every((f) => f.compact || !f.closeDue)
  );
  const fxPage = code(read("src/app/dev/style/today/TodayFixtures.tsx"));
  check(
    "aim fixtures: drawn by AimLine in the board's slot exactly as the page draws it (rm-quests-slot data-compact > rm-aim-slot data-close-due), from aimLineOfFixture, inside the fixtures provider (Not now saves nothing)",
    /<div className="rm-quests-slot" data-compact=\{a\.compact \? "1" : undefined\}>\s*<div className="rm-aim-slot" data-close-due=\{a\.closeDue \? "1" : undefined\}>\s*<AimLine view=\{a\.view\} \/>/.test(fxPage) &&
      /AIM_LINE_FIXTURES\.map\(\(f\) => \(\{ \.\.\.f, view: aimLineOfFixture\(f\) \}\)\)/.test(fxPage) &&
      /<FixtureRoadmapProvider>[\s\S]*?<AimLine view=\{p\.view\} \/>[\s\S]*?<AimLine view=\{a\.view\} \/>[\s\S]*?<\/FixtureRoadmapProvider>/.test(fxPage)
  );
  // The week quests card's generator-2 states (F-R4-13, F-R4-14), in the same fixture list as rev 3's six.
  const v2 = QUEST_FIXTURES.filter((f) => f.input.set.generator === 2);
  const parted = v2.flatMap((f) => f.input.set.quests.filter((q) => (q.kind === "RAISE" || q.kind === "ADD") && (q.parts?.length ?? 0) > 0));
  check(
    "quest parts: each parted row is RAISE or ADD, its count the sum of its parts, its label the spec's ('Bring {n} cards to level {L}+', 'Add {n} cards'), every part's Domain named",
    parted.length === 3 &&
      parted.every((q) => {
        if (q.kind !== "RAISE" && q.kind !== "ADD") return false;
        const parts = q.parts ?? [];
        const sum = parts.reduce((s, p) => s + p.count, 0);
        const label = q.kind === "RAISE" ? `Bring ${q.count} cards to level ${q.minLevel}+` : `Add ${q.count} cards`;
        return sum === q.count && q.label === label && parts.every((p) => Object.prototype.hasOwnProperty.call(PART_DOMAIN_NAMES, p.domainId));
      }),
    parted.map((q) => q.label).join(" | ")
  );
  check(
    "quest parts: every RAISE part's measure is its one Domain's, at the row's level, with the recall segment 'r' (parseMeasureKey)",
    parted.every((q) => {
      if (q.kind !== "RAISE") return true;
      return (q.parts ?? []).every((p) => {
        const k = parseMeasureKey(p.measureKey);
        return k?.kind === "CARDS_AT_LEVEL" && k.domainIds.join() === p.domainId && k.level === q.minLevel && k.segment === "r";
      });
    })
  );
  check(
    "quest parts: progress is Σ_d clamp(v_d − floor_d, 0, count_d) over the parts, done only when every part is",
    v2.every((f) =>
      f.input.progress.every((p) => !p.parts || (p.progress === p.parts.reduce((s, x) => s + x.progress, 0) && p.done === p.parts.every((x) => x.done) && p.parts.every((x) => x.progress >= 0 && x.progress <= x.count)))
    )
  );
  check(
    "quest parts: one state has more parts than Today shows (WEEK_QUEST_PARTS_TODAY), so '+n more' is drawn",
    WEEK_QUEST_PARTS_TODAY === 2 && QUEST_FIXTURES.find((f) => f.key === "parts-more")!.input.set.quests.some((q) => q.kind === "RAISE" && (q.parts?.length ?? 0) > WEEK_QUEST_PARTS_TODAY)
  );
  const bodyFx = QUEST_FIXTURES.find((f) => f.key === "body-health")!.input;
  const bodySafe = BODY_SAFE_KINDS.map((k) => catalogEntryOf(k)?.template ?? "?");
  check(
    "quest parts: the body plan with constraints is practice-only, health on (HEALTH_LINE under each row), every session a catalog body-safe type",
    bodyFx.health === true && bodyFx.set.quests.length > 0 && bodyFx.set.quests.every((q) => q.kind === "PRACTICE" && bodySafe.some((t) => q.label.startsWith(`${t} · `))),
    bodySafe.join(", ")
  );
  check(
    "quest parts: rev 3's six states stay generator 1 with no parts, names or health (they render as before)",
    QUEST_FIXTURES.filter((f) => f.input.set.generator === 1).length === 6 &&
      QUEST_FIXTURES.filter((f) => f.input.set.generator === 1).every((f) => f.input.domainNames == null && !f.input.health && f.input.set.quests.every((q) => !("parts" in q)) && f.input.progress.every((p) => !p.parts))
  );
  // Fix round 2: the in-place states sit in a copy of the board's own columns (.board > .c1 .c2 .c3 > .o9, as
  // TodayBoard renders them), outside the fixture grid, so the line has c3's real width at 932 and 1440 (a fixture
  // cell is wider there); the second is the longest line, so ui-audit measures "no clamped text" on the tightest copy.
  check(
    "aim fixtures: two states in place, in a copy of the board's columns (c3 > o9: the goals, then the slot), outside the fixture grid: SET WEEK and the longest line (start-part); a width lab only, since the live line is the Ideas lead's and the board draws no slot",
    /\{aimInPlace\.map\(\(p\) => \(\s*<div key=\{p\.key\} className="dev-aim-board" data-state=\{`aim-\$\{p\.key\}`\}>[\s\S]*?<div className="board">\s*<div className="c1" \/>\s*<div className="c2" \/>\s*<div className="c3">\s*<div className="o9">\s*<GoalsStrip[^\n]*?\/>\s*<div className="rm-quests-slot" style=\{AIM_SLOT_STYLE\}>\s*<div className="rm-aim-slot">\s*<AimLine view=\{p\.view\} \/>/.test(
      fxPage
    ) &&
      // The side column may open with the Asks (what needs you) before the goals; the slot is still c3 > o9.
      // Re-pinned for blueprint P32: the week's calibration card (Mondays only) may come first, above the Main quest.
      /<div className="c3">(?:\s*\{\/\*[\s\S]*?\*\/\})?(?:\s*\{!isWork && nextWeek != null && nextWeek !== false && <div className="o9">\{nextWeek\}<\/div>\})?(?:\s*\{\/\*[\s\S]*?\*\/\})?(?:\s*\{!isWork && mainQuest != null && mainQuest !== false && <div className="o9">\{mainQuest\}<\/div>\})?(?:\s*\{\/\*[\s\S]*?\*\/\})?(?:\s*\{asksOnScreen\.map[\s\S]*?\{asksMore\} more\s*<\/button>\s*\)\})?\s*<div className="o9">\s*<GoalsStrip/.test(boardSrc) &&
      fxPage.indexOf("aimInPlace.map(") >= 0 &&
      fxPage.indexOf("aimInPlace.map(") < fxPage.search(/<div className="dev-grid">\s*\{aimStates\.map\(/) &&
      /key: "in-place", fixture: "set-week"/.test(fxPage) &&
      /key: "in-place-longest", fixture: "start-part"/.test(fxPage) &&
      /const AIM_SLOT_STYLE = \{ marginTop: 16 \} as const;/.test(fxPage) &&
      !/QUESTS_SLOT_STYLE|rm-quests-slot|questsSlot/.test(boardSrc)
  );
  {
    const fxCss = code(read("src/app/dev/style/today/today-fixtures.css"));
    check(
      "aim fixtures: the board copy is full page width (no fixture grid, no width of its own), so today.css's .today-board .board columns size it",
      /\.dev-today \.dev-aim-board \{ display: flex; flex-direction: column; gap: 8px; min-width: 0; margin-bottom: 28px; \}/.test(fxCss) &&
        !/dev-aim-board[^{]*\{[^}]*(?:[{;]\s*(?:max-)?width:|grid-template)/.test(fxCss) &&
        /className="page today-board cq-main dev-today"/.test(fxPage)
    );
  }
}

// ═══ Fix round 2 (lane T): the aim line's text fits its 3-line clamp ═══════
// Acceptance gates the line at ≤ 72 px at 344 with no clamped text, in ui-audit (the lead's browser pass);
// nothing here runs a browser. This is an estimate from the font's own advance widths and the CSS's own numbers,
// so a copy that would reach a 4th line (which the clamp cuts, taking the rank words with it) fails here before
// any browser run: the Names ruling on "(level 12)" in the START line, a longer stage or rank name, a new SET
// variant. It also finds where the line's column is narrower than at 344 (a PENDING line for R5's clamp). The three
// sections moved the line from Today's side column (c3) to the Ideas landing's lead, first in the review hub's first
// column (.rv-hub > .rv-col), so the column it is measured in is that one (review.css), not the board's (today.css).
{
  const code = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  // Inter as src/app/layout.tsx loads it (next/font/google, the latin subset, the variable wght axis): advance
  // widths in font units (2048 per em) for U+0020–U+007E, then FIT_EXTRA, at wght 400 and 600 (HVAR applied).
  // Read from .next/static/media/83afe278b6a6bb3c-s.p.2bn3s6zvc0dyp.woff2 (sha256 c940764593d0fe5d…) on Mon 5 Oct
  // 2026. Kerning (GPOS) is not applied; in Inter it almost always narrows a line, so the estimate errs wide.
  const FIT_UPM = 2048;
  const FIT_EXTRA = "·’‘“”–—…";
  const FIT_ADV: Readonly<Record<400 | 600, string>> = {
    400:
      "576,589,954,1297,1314,2011,1319,614,747,747,1026,1355,590,942,590,738,1292,833,1249,1265,1323,1215,1270,1159,1267,1270,590,618,1355,1355,1355,1047,1978,1413,1340,1496,1478,1231,1209,1528,1522,550,1169,1376,1158,1850,1543,1566,1308,1566,1318,1314,1322,1524,1413,2018,1397,1390,1288,747,738,747,965,934,661,1150,1254,1170,1254,1194,758,1256,1211,496,496,1124,496,1794,1210,1228,1254,1254,771,1081,670,1211,1151,1676,1118,1151,1131,873,681,873,1355,590,534,534,902,902,1024,2048,1770",
    600:
      "509,665,1084,1321,1334,2062,1361,673,766,766,1114,1381,660,954,660,780,1358,870,1279,1307,1369,1259,1315,1183,1316,1315,660,680,1381,1381,1381,1120,2054,1499,1351,1510,1479,1241,1204,1535,1528,568,1189,1448,1158,1893,1556,1575,1322,1584,1338,1334,1356,1506,1499,2097,1482,1469,1342,766,780,766,989,964,725,1179,1281,1196,1281,1213,800,1284,1259,540,540,1171,540,1849,1258,1249,1281,1281,818,1130,729,1259,1208,1724,1170,1211,1162,938,741,938,1381,660,610,610,1053,1041,1024,2048,1979",
  };
  const FIT_CHARS = [...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), ...FIT_EXTRA];
  const advOf = (w: 400 | 600) => {
    const units = FIT_ADV[w].split(",").map(Number);
    return new Map(FIT_CHARS.map((ch, i) => [ch, units[i]] as const));
  };
  const ADV = { 400: advOf(400), 600: advOf(600) } as const;
  const unknownChars = new Set<string>();
  const widthPx = (s: string, w: 400 | 600, px: number) =>
    ([...s].reduce((sum, ch) => {
      const a = ADV[w].get(ch);
      if (a == null) unknownChars.add(ch);
      return sum + (a ?? FIT_UPM); // an unknown glyph counts a full em, and fails the table check below
    }, 0) *
      px) /
    FIT_UPM;
  check(
    "text fit: the width table holds every character, 103 per weight, the same order (U+0020–U+007E, then · ’ ‘ “ ” – — …)",
    FIT_ADV[400].split(",").length === FIT_CHARS.length && FIT_ADV[600].split(",").length === FIT_CHARS.length && FIT_CHARS.length === 103 && widthPx("Aim", 400, FIT_UPM) === 1413 + 496 + 1794 && widthPx("Aim", 600, FIT_UPM) === 1499 + 540 + 1849
  );

  /**
   * Greedy wrap at spaces, as a browser wraps the line: the lead's words at 600, then the rest's at 400 (AimLine
   * renders `<b>{lead}</b>{" " + rest}`, so the space before the rest is in the 400 run). A word wider than the
   * column takes a line of its own (overflow-wrap: anywhere would split it; no copy here has one).
   */
  const linesOf = (lead: string, rest: string, width: number, px: number): number => {
    const words: [string, 400 | 600][] = [...lead.split(" ").map((w) => [w, 600] as [string, 600]), ...(rest ? rest.split(" ").map((w) => [w, 400] as [string, 400]) : [])];
    let n = 1;
    let x = 0;
    words.forEach(([w, weight], i) => {
      const ww = widthPx(w, weight, px);
      const sp = i === 0 ? 0 : widthPx(" ", weight, px);
      if (x > 0 && x + sp + ww > width) {
        n += 1;
        x = ww;
      } else x += (x > 0 ? sp : 0) + ww;
    });
    return n;
  };
  /** The narrowest text column (to 1/64 px, a browser's layout unit) at which the copy takes at most n lines. */
  const narrowestFor = (lead: string, rest: string, n: number, px: number): number => {
    let lo = 0;
    let hi = 4096;
    while (hi - lo > 1 / 64) {
      const mid = (lo + hi) / 2;
      if (linesOf(lead, rest, mid, px) <= n) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  // The CSS's own numbers: the line (roadmap.css, R5), the card's border and the page (components.css), the nav
  // (tokens.css, components.css) and the review hub's columns (review.css). Read, not typed, so a change re-runs the model.
  const rmCss = code(read("src/components/roadmap/roadmap.css"));
  const compCss = code(read("src/app/styles/components.css"));
  const tokensCss = code(read("src/app/styles/tokens.css"));
  const reviewCss = code(read("src/components/workspace/review.css"));
  const hubSrc = code(read("src/components/workspace/WorkspaceView.tsx"));
  const ruleOf = (src: string, selector: string): string => {
    const re = new RegExp(`(?:^|[\\n{}])\\s*${selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&")} \\{([^}]*)\\}`);
    return re.exec(src)?.[1] ?? "";
  };
  const num = (re: RegExp, src: string): number => {
    const m = re.exec(src);
    return m ? Number(m[1]) : NaN;
  };
  const linePad = /padding: (\d+)px (\d+)px (\d+)px (\d+)px/.exec(ruleOf(rmCss, ".rm-aim-line"))?.slice(1).map(Number) ?? [];
  const L = {
    padTop: linePad[0] ?? NaN,
    padRight: linePad[1] ?? NaN,
    padBottom: linePad[2] ?? NaN,
    padLeft: linePad[3] ?? NaN,
    gap: num(/gap: (\d+)px/, ruleOf(rmCss, ".rm-aim-line")),
    linkGap: num(/gap: (\d+)px/, ruleOf(rmCss, ".rm-aim-line-a")),
    fontPx: num(/font-size: (\d+)px/, ruleOf(rmCss, ".rm-aim-line-a")),
    lineHeight: num(/line-height: (\d+)px/, ruleOf(rmCss, ".rm-aim-line-a")),
    glyph: num(/width: (\d+)px/, ruleOf(rmCss, ".rm-aim-line-a > svg")),
    x: num(/(?:^|[;{\s])width: (\d+)px/, ruleOf(rmCss, ".rm-aim-line .rm-aim-line-x")),
    clamp: num(/-webkit-line-clamp: (\d+)/, ruleOf(rmCss, ".rm-aim-line-t")),
    bold: num(/font-weight: (\d+)/, ruleOf(rmCss, ".rm-aim-line-t b")),
    border: num(/border: (\d+)px solid/, ruleOf(compCss, ".card")),
    pagePad: num(/padding: \d+px (\d+)px \d+px/, ruleOf(compCss, ".page")),
    pageMax: num(/max-width: (\d+)px/, ruleOf(compCss, ".page")),
    railW: num(/--rail-w:\s*(\d+)px/, tokensCss),
    sideW: num(/--sidebar-w:\s*(\d+)px/, tokensCss),
    railAt: num(/@media \(min-width: (\d+)px\) \{\s*\.app \{ display: grid; grid-template-columns: var\(--rail-w\)/, compCss),
    sideAt: num(/@media \(min-width: (\d+)px\) \{\s*\.app \{ grid-template-columns: var\(--sidebar-w\)/, compCss),
  };
  const pageSteps = [...compCss.matchAll(/@container main \(min-width: (\d+)px\) \{ \.page \{ padding: \d+px (\d+)px \d+px; \} \}/g)].map((m) => [Number(m[1]), Number(m[2])] as const).sort((a, b) => a[0] - b[0]);
  // The review hub's grid steps: each `@container main (min-width: W) { .rv-hub { grid-template-columns: … } }` of
  // review.css, with the base rule's gap, and the lead's column: the first (WorkspaceView draws {lead} first in the
  // first .rv-col, pinned below).
  type GridStep = { at: number; fr: number[]; gap: number; col: number };
  const gridSteps: GridStep[] = [];
  const hubGap = num(/gap: (\d+)px/, ruleOf(reviewCss, ".rv-hub"));
  const leadCol = /<div className="rv-hub">\s*<div className="rv-col">\s*\{lead\}/.test(hubSrc) ? 1 : NaN;
  for (const m of reviewCss.matchAll(/@container main \(min-width: (\d+)px\) \{ \.rv-hub \{ grid-template-columns: ([^;]+);/g)) {
    gridSteps.push({ at: Number(m[1]), fr: [...m[2].matchAll(/minmax\(0, ([\d.]+)fr\)/g)].map((f) => Number(f[1])), gap: hubGap, col: leadCol });
  }
  gridSteps.sort((a, b) => a.at - b.at);
  // The clamp in force at a container width: the base rule, then any `@container main (min-width: W)` block in
  // roadmap.css that sets .rm-aim-line-t's clamp (a number, or none/unset), or makes it a block (no clamp).
  const clampSteps: [number, number][] = [];
  {
    const re = /@container main \(min-width: (\d+)px\) \{/g;
    for (let m = re.exec(rmCss); m; m = re.exec(rmCss)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < rmCss.length && depth > 0; i++) depth += rmCss[i] === "{" ? 1 : rmCss[i] === "}" ? -1 : 0;
      // Any rule in the block whose selector ends in .rm-aim-line-t (".rm-aim-line-t", ".rm-aim-line .rm-aim-line-t", …).
      const block = rmCss.slice(m.index + m[0].length, i - 1);
      const t = [...block.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((r) => /\.rm-aim-line-t\s*$/.test(r[1].split(",").pop() ?? "")).map((r) => r[2]).join(";");
      const c = /-webkit-line-clamp:\s*(\d+|none|unset|initial)/.exec(t)?.[1];
      if (c) clampSteps.push([Number(m[1]), /^\d+$/.test(c) ? Number(c) : Infinity]);
      else if (/display:\s*block/.test(t)) clampSteps.push([Number(m[1]), Infinity]);
    }
    clampSteps.sort((a, b) => a[0] - b[0]);
  }
  const clampAt = (main: number) => clampSteps.filter(([w]) => main >= w).reduce((c, [, v]) => v, L.clamp);
  /** The text column of the aim line in the Ideas lead (.rv-hub > the first .rv-col) at viewport width vw: no scrollbar (a phone's overlays; a desktop's classic one narrows it further). */
  const columnAt = (vw: number) => {
    const nav = vw >= L.sideAt ? L.sideW : vw >= L.railAt ? L.railW : 0;
    const main = vw - nav;
    const padX = pageSteps.filter(([w]) => main >= w).reduce((p, [, x]) => x, L.pagePad);
    const content = Math.min(main, L.pageMax) - 2 * padX;
    const g = gridSteps.filter((s) => main >= s.at).pop();
    const col = g ? ((content - g.gap * (g.fr.length - 1)) * g.fr[g.col - 1]) / g.fr.reduce((s, f) => s + f, 0) : content;
    const text = col - 2 * L.border - L.padLeft - L.padRight - L.gap - L.x - L.glyph - L.linkGap;
    return { main, col, text, clamp: clampAt(main) };
  };
  const modelRead = Object.values(L).every((v) => Number.isFinite(v)) && pageSteps.length >= 1 && gridSteps.length >= 1 && gridSteps.every((s) => s.fr.length >= 2 && Number.isFinite(s.gap) && s.col >= 1 && s.col <= s.fr.length);
  check(
    "text fit: the layout model reads its numbers from the CSS (the line, the card border, the page padding and max width, the rail and sidebar, the review hub's column steps, the lead in its first column)",
    modelRead,
    `${JSON.stringify(L)} · page ${JSON.stringify(pageSteps)} · grid ${JSON.stringify(gridSteps)} · clamp steps ${JSON.stringify(clampSteps)}`
  );
  check(
    "text fit: the table's text is the line's (Inter 14 px, lead 600, rest 400), and 3 lines fit 72 px: 3 × 19 + 6 + 6 + 2 × 1 border = 71",
    L.fontPx === 14 && L.bold === 600 && L.clamp === 3 && L.clamp * L.lineHeight + L.padTop + L.padBottom + 2 * L.border <= 72 && /--font-ui: var\(--font-inter\)/.test(tokensCss),
    `${L.clamp} × ${L.lineHeight} + ${L.padTop} + ${L.padBottom} + 2 × ${L.border} = ${L.clamp * L.lineHeight + L.padTop + L.padBottom + 2 * L.border}`
  );
  const at344 = columnAt(344);
  check(
    "text fit: at 344 the text column is 216 px (344 − 2 × 16 page = 312 card − 2 border − 14 − 6 padding − 4 gap − 40 × − 20 glyph − 10 gap)",
    Math.abs(at344.text - 216) < 1e-9 && at344.col === 312,
    `${at344.text} px`
  );

  // Every copy the aim line can draw: the fixtures' lines, every SET variant and DRAFT, and every START a plan can reach
  // (each stage label stageLabelOf gives, a track plan's none, at every place 1..MAX_MILESTONES, with every rank a
  // milestone can give or none). The cross product is wider than real plans (a "Toward …" stage keeps your rank).
  type Copy = { key: string; lead: string; rest: string };
  const copyOf = (key: string, v: AimLineView): Copy => ({ key, ...aimLineCopy(v) });
  const fixtureCopies = AIM_LINE_FIXTURES.flatMap((f) => {
    const v = aimLineOfFixture(f);
    return v ? [copyOf(f.key, v)] : [];
  });
  const stageLabels: (string | null)[] = [
    null,
    ...STAGE_KEYS.map((s) => stageLabelOf(s)),
    ...STAGE_KEYS.slice(1).map((s) => stageLabelOf("BETWEEN", STAGE_LEVEL[s] - 1)),
    ...STAGE_KEYS.map((s) => stageLabelOf("PART", STAGE_LEVEL[s])),
  ].filter((s, i, all) => all.indexOf(s) === i);
  const ranks = [null, ...AIM_RANKS.slice(1, RANK_MILESTONE_MAX + 1)];
  const startCopies: Copy[] = [];
  for (let ord = 1; ord <= MAX_MILESTONES; ord++)
    for (const stageName of stageLabels) for (const givesRank of ranks) startCopies.push(copyOf(`START ${ord} ${stageName ?? "track"} ${givesRank ?? "keeps"}`, { kind: "START", milestoneId: "m", ord, stageName, givesRank, href: "/you/roadmap#now" }));
  const otherCopies = [
    ...(["WEEK", "MONTH", "BACK", "NEXT"] as const).map((variant) => copyOf(`SET ${variant}`, { kind: "SET", variant, href: "/you/roadmap/new" })),
    copyOf("DRAFT", { kind: "DRAFT", roadmapId: "r", href: "/you/roadmap" }),
  ];
  const all = [...otherCopies, ...startCopies];
  const need = new Map(all.map((c) => [c.key, narrowestFor(c.lead, c.rest, L.clamp, L.fontPx)] as const));
  check(
    "text fit: the copies are what the space says (a stage label for every gate, 'Toward …' and 'part 1' stage, Aspirant … Virtuoso and none, places 1–6; 15 labels × 6 ranks × 6 places + 5)",
    stageLabels.length === 15 && stageLabels.every((s) => s === null || s.length > 0) && ranks.length === 6 && ranks[ranks.length - 1] === "Virtuoso" && all.length === 15 * 6 * 6 + 5 && fixtureCopies.length === 13 && unknownChars.size === 0,
    `${all.length} copies; labels ${stageLabels.map((s) => s ?? "(track)").join(" | ")}${unknownChars.size ? ` · unknown characters ${[...unknownChars].join("")}` : ""}`
  );
  // The binding part: Acceptance's widths. At 344 and 375 the hub is one column (the lead is the page's width) and the
  // clamp must be the base 3 lines (the 72 px gate); at 932 and 1440 the line sits in the hub's first column (the in-place fixture
  // states draw it there for ui-audit), where a clamp R5 lifts cuts nothing.
  for (const vw of [344, 375, 932, 1440]) {
    const col = columnAt(vw);
    const needOf = (c: Copy): number =>
      col.clamp === L.clamp ? (need.get(c.key) ?? Infinity) : Number.isFinite(col.clamp) ? narrowestFor(c.lead, c.rest, col.clamp, L.fontPx) : 0;
    const over = all.filter((c) => needOf(c) > col.text);
    const least = all.map((c) => [c.key, needOf(c)] as const).sort((x, y) => y[1] - x[1])[0];
    check(
      `text fit (estimate): at ${vw} every copy the aim line can draw (${all.length}) fits ${Number.isFinite(col.clamp) ? `the ${col.clamp}-line clamp` : "(no clamp at this width)"} in the Ideas lead's column (text ${col.text.toFixed(1)} px; column ${col.col.toFixed(1)})`,
      (vw > 375 || col.clamp === L.clamp) && over.length === 0,
      over.length
        ? over.slice(0, 6).map((c) => `${c.key} needs ${needOf(c).toFixed(1)}`).join(" | ")
        : Number.isFinite(col.clamp)
          ? `least spare ${(col.text - least[1]).toFixed(1)} px (${least[0]} needs ${least[1].toFixed(1)} px)`
          : "no clamp"
    );
  }
  {
    const fxNeed = fixtureCopies.map((c) => [c.key, narrowestFor(c.lead, c.rest, L.clamp, L.fontPx)] as const).sort((a, b) => b[1] - a[1]);
    check(
      "text fit (estimate): the fixtures' longest line is start-part (a new learner's count gate), the in-place state ui-audit measures; it fits 3 lines at 344 with its spare printed",
      fxNeed[0]?.[0] === "start-part" && fxNeed[0][1] <= at344.text,
      fxNeed.slice(0, 4).map(([k, w]) => `${k} ${w.toFixed(1)} px`).join(" · ") + ` · spare at 344: ${(at344.text - (fxNeed[0]?.[1] ?? 0)).toFixed(1)} px`
    );
  }
  // For the lead's Names ruling (contracts §16.10: "(level 12)" on the Today START line): what it would cost at 344.
  {
    const lv = [
      ["Milestone 6 · Mastered (level 12) is ready to start.", "Reaching it gives the Aim rank Virtuoso."],
      ["Milestone 5 · Mastered (level 12), part 1 is ready to start.", "Reaching it gives the Aim rank Expert."],
      ["Milestone 1 · Familiar (level 6), part 1 is ready to start.", "Reaching it gives the Aim rank Journeyman."],
    ] as const;
    console.log(`NOTE text fit, for the "(level 12)" ruling: at 344 (${at344.text} px) ${lv.map(([l, r]) => `"${l}" → ${linesOf(l, r, at344.text, L.fontPx)} lines`).join(" · ")} (a 4th line is cut by the clamp)`);
  }
  // Between ui-audit's widths the line's column may be narrower than at 344 (the hub's two columns from a 760 px
  // container), and there the 3-line clamp would cut real lines, the rank words first. R5's roadmap.css owns the clamp:
  // lifting it in a `@container main (min-width: …)` block (the copy is code-owned and bounded; only 344 has the
  // 72 px gate) turns this green. Swept over every viewport from 344 (the narrowest the app is laid out for) to
  // 1920, with the fixtures' lines.
  {
    const cut: number[] = [];
    let worst: { vw: number; key: string; text: number; need: number } | null = null;
    const fxNeed = new Map(fixtureCopies.map((c) => [c.key, (n: number) => narrowestFor(c.lead, c.rest, n, L.fontPx)] as const));
    const needAt = new Map<string, number>();
    for (let vw = 344; vw <= 1920; vw++) {
      const col = columnAt(vw);
      if (!Number.isFinite(col.clamp)) continue;
      const hit = fixtureCopies.filter((c) => {
        const k = `${c.key}@${col.clamp}`;
        if (!needAt.has(k)) needAt.set(k, fxNeed.get(c.key)!(col.clamp));
        return needAt.get(k)! > col.text;
      });
      if (hit.length) {
        cut.push(vw);
        const h = hit.map((c) => ({ vw, key: c.key, text: col.text, need: needAt.get(`${c.key}@${col.clamp}`)! })).sort((a, b) => b.need - b.text - (a.need - a.text))[0];
        if (!worst || h.need - h.text > worst.need - worst.text) worst = h;
      }
    }
    const ranges = cut.reduce<[number, number][]>((r, vw) => {
      const last = r[r.length - 1];
      if (last && last[1] === vw - 1) last[1] = vw;
      else r.push([vw, vw]);
      return r;
    }, []);
    const longest = fixtureCopies.find((c) => c.key === "start-part");
    const at = (vw: number) => {
      const col = columnAt(vw);
      return `${vw}: ${col.text.toFixed(1)} px, start-part ${longest ? linesOf(longest.lead, longest.rest, col.text, L.fontPx) : "?"} lines`;
    };
    pending(
      "R5",
      "text fit (estimate): no viewport from 344 to 1920 clamps a fixture line in the Ideas lead's column (were it narrower than at 344 at some widths, the 3-line clamp would cut the rank words)",
      ranges.length === 0,
      ranges.length
        ? `clamped at ${ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ")} px wide; worst ${worst?.key} at ${worst?.vw} (needs ${worst?.need.toFixed(1)} of ${worst?.text.toFixed(1)} px) · ${[768, 1366].map(at).join(" · ")}`
        : ""
    );
  }
}

// ═══ Rev 4 finishing round: a plan-born task's Machine grade line ══════════
// A plan-born task (roadmap Start, captureKey 'rm:…') takes its minutes from the plan (a practice's band minutes,
// roadmap-server bandMinutes), not from the player, so its drawer never says "you said ~Nm": code words it as
// "the plan set ~Nm". No model sizes one either, so an AI band or model a stale row still carries is not shown.
// Rendered for real (TaskDrawer through renderToStaticMarkup), from rows buildBoard makes; an ordinary row is the control.
{
  const drawerRowOf = (t: BoardTemplate): BoardRow | null => {
    const b = buildBoard(board(TODAY, [t]));
    return [...b.must, ...b.todayRows, ...b.anytime, ...b.yesterdayRows].find((r) => r.template.id === t.id) ?? null;
  };
  const drawerHtml = (r: BoardRow): string =>
    renderToStaticMarkup(
      createElement(TaskDrawer, {
        row: r,
        now: at(TODAY, 9),
        today: TODAY,
        minutes: null,
        onMinutes: () => {},
        projection: r.projection,
        minimumProjection: null,
        busy: false,
        working: null,
        onDone: () => {},
        onMinimum: () => {},
        onSkip: () => {},
        onTomorrow: () => {},
        onAgain: () => {},
        onRename: () => {},
        onArchive: () => {},
        onOverride: () => {},
        onResize: () => {},
      })
    );
  /** The Machine grade line's text, React's text-node separators dropped. */
  const gradeLineOf = (html: string): string | null => /<dt>Machine grade<\/dt><dd>([\s\S]*?)<\/dd>/.exec(html)?.[1].replace(/<!-- -->/g, "") ?? null;
  // The plan's minutes (45, a practice's band) differ from the machine's (30), and a stale AI band and model sit on the row.
  const practice = (captureKey: string | null) =>
    tpl({
      id: captureKey ? "rm-practice" : "ord-practice",
      title: "Timed drill",
      kind: "HABIT",
      recurrence: "TARGET:3/W",
      track: "CRAFT",
      category: "STUDY",
      band: "STANDARD",
      estMinutes: 45,
      machineMinutes: 30,
      aiBand: "DEMANDING",
      gradeSource: "AI",
      gradeModel: "model-x",
      captureKey,
    });
  const bornRow = drawerRowOf(practice("rm:ms-1:p0"));
  const ordRow = drawerRowOf(practice(null));
  const bornHtml = bornRow ? drawerHtml(bornRow) : "";
  const ordHtml = ordRow ? drawerHtml(ordRow) : "";
  const born = gradeLineOf(bornHtml);
  const ord = gradeLineOf(ordHtml);
  check(
    "drawer: a plan-born ('rm:') task's Machine grade line says the plan set its minutes (code's words), never 'you said'",
    born != null && born.includes(" · the plan set ~45 min (counts up to 1h)") && !/you said/i.test(bornHtml),
    String(born)
  );
  check(
    "drawer: …and shows no AI band and no Model row (no model sizes a plan-born task), even when a stale row carries them",
    born != null && !born.includes("AI said") && !bornHtml.includes("<dt>Model</dt>") && !bornHtml.includes("model-x"),
    String(born)
  );
  check(
    "drawer (control): an ordinary task with the same minutes still says 'you said ~45 min', its AI band and its Model row",
    ord != null && ord.includes(" · you said ~45 min (counts up to 1h)") && !ord.includes("the plan set") && ord.includes(" · AI said ") && ordHtml.includes("<dt>Model</dt>"),
    String(ord)
  );
  // A plan-born step whose minutes are the machine's own: no minutes clause at all, so no attribution to anyone.
  const stepRow = drawerRowOf(tpl({ id: "rm-step", title: "Outline the proof", captureKey: "rm:ms-1:s0", estMinutes: 30, machineMinutes: 30 }));
  const step = stepRow ? gradeLineOf(drawerHtml(stepRow)) : null;
  check(
    "drawer: a plan-born step at the machine's own minutes carries no minutes clause (neither 'the plan set' nor 'you said')",
    step != null && !step.includes("the plan set") && !step.includes("you said") && step.endsWith("~30 min"),
    String(step)
  );
}

// ===== R1 Today (UI motion lane R1: AimLine, WeekQuests; ui-motion.md §3.2 rows 10–11, §7.10, §7.11, §11.4) =====
// The /dev/style/today states rendered for real (WeekQuests over weekQuestsViewOf, AimLine over todayAimLineOf),
// counted with scripts/word-count.mjs: fewer words, the honesty kept on the card or one tap away, and Today calm
// (D10): no shader, no WAIT card, no loop, no burst, a static aim line. Only this block is lane R1's.
asyncChecks.push(
  (async () => {
    const { default: NodeModule } = await import("node:module");
    const ext = (NodeModule as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions;
    // The roadmap and glyph components import their CSS (Node can't load it).
    if (!ext[".css"]) ext[".css"] = (m) => void (m.exports = {});
    const wc = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const { WeekQuests, weekQuestKeyRowsOf } = await import("../src/components/roadmap/WeekQuests");
    const { AimLine } = await import("../src/components/roadmap/AimLine");
    const { FixtureRoadmapProvider } = await import("../src/components/roadmap/roadmap-runtime");
    const { weekQuestsViewOf } = await import("../src/lib/roadmap-quests");
    const rmCopy = await import("../src/components/roadmap/roadmap-copy");
    const { MOTION_QUEST_FIXTURES } = await import("../src/app/dev/style/today/fixtures");
    const R = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement(FixtureRoadmapProvider, null, el));
    const flat = (t: string) => t.replace(/\s+/g, " ").trim();
    const visible = (h: string) => flat(wc.visibleText(h, { width: 344 }).replace(/\n/g, " "));
    const words = (h: string) => wc.countAppWords(h, { width: 344 }).count;
    type El = { tag?: string; attrs: Record<string, string>; children: El[] };
    const elsOf = (h: string) => wc.elementsOf(wc.parseMarkup(h) as never) as unknown as El[];
    const textIn = (e: El) => flat(wc.textOfNode(e as never) as string);
    /** The marked block (data-wc-block="…"): from its opening tag to its balanced close. */
    const blockOf = (h: string, name: string): string => {
      const m = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\sdata-wc-block="${name}"`).exec(h);
      if (!m) return "";
      const re = new RegExp(`<(/?)${m[1]}\\b[^>]*?(/?)>`, "g");
      re.lastIndex = m.index;
      let depth = 0;
      for (let t = re.exec(h); t; t = re.exec(h)) {
        if (t[1]) depth--;
        else if (!t[2]) depth++;
        if (depth === 0) return h.slice(m.index, re.lastIndex);
      }
      return h.slice(m.index);
    };
    /** App words on each visible line (row 10: ≤ 8 a line). */
    const worstLine = (h: string): { n: number; line: string } => {
      type Run = { text: string; kind: string; block?: boolean };
      const runs = wc.runsOf(wc.parseMarkup(h) as never, { width: 344 }) as unknown as Run[];
      const rules = wc.wordRules();
      let worst = { n: 0, line: "" };
      let cur: Run[] = [];
      const flush = () => {
        const toks = wc.classifyRuns(cur as never, rules) as unknown as { text: string; kind: string }[];
        const n = toks.filter((t) => t.kind === "app").length;
        if (n > worst.n) worst = { n, line: toks.map((t) => t.text).join(" ") };
        cur = [];
      };
      for (const r of runs) {
        if (r.block) flush();
        else cur.push(r);
      }
      flush();
      return worst;
    };
    const calm = (h: string) => !/class="[^"]*\bshd\b|data-wait|data-play|data-burst|owed|danger|gold/.test(h);

    // Week quests: every /dev/style/today state (and the SEEN state), as the page draws it.
    const states = [...QUEST_FIXTURES, ...MOTION_QUEST_FIXTURES].map((f) => ({ key: f.key, view: weekQuestsViewOf(f.input), html: "" }));
    for (const s of states) s.html = R(createElement(WeekQuests, { variant: "today", view: s.view }));
    const open = states.filter((s) => s.view.done < s.view.total);
    check("R1 week quests: every Today state renders, and no card draws a shader slot, a WAIT card, data-play or a burst hook, or anything red (D10)", states.length === 10 && states.every((s) => s.html.length > 0 && calm(s.html)));
    const counted = open.map((s) => ({ key: s.key, v2: s.view.rows.some((r) => r.parts), n: words(blockOf(s.html, "week-quests")), line: worstLine(blockOf(s.html, "week-quests")) }));
    const overWords = counted.filter((x) => x.n > 34 || x.n === 0 || (!x.v2 && x.line.n > 8));
    check(
      "R1 week quests (§3.2 row 10): each open card is ≤ 34 app words (ui-audit's live gate), counted in its data-wc-block; no line over 8 on the generator-1 states",
      open.length >= 8 && overWords.length === 0,
      overWords.map((x) => `${x.key}: ${x.n} (line ${x.line.n}: ${x.line.line})`).join(" | ")
    );
    // A generator-2 practice's name (a catalog name over Domain names) is a name (§3.1), but Today's practice row can't
    // mark it while roadmap-ui-check pins the bare 'Backtest<span class="rm-q-dim">' markup (R1 handoff): reported only.
    for (const x of counted.filter((c) => c.v2 && c.line.n > 8)) console.log(`NOTE R1 week quests: ${x.key}'s longest line is ${x.line.n} app words with its practice name counted (${x.line.line})`);
    check(
      "R1 week quests (§11.4): ≤ 3 rows before 'n more'; «pays nothing» on every open card",
      open.every((s) => {
        const block = blockOf(s.html, "week-quests");
        const rows = (block.match(/class="rm-quest-(?:row|line)(?:[ "])/g) ?? []).length;
        const more = s.view.rows.length - 3;
        return rows === Math.min(3, s.view.rows.length) && (more > 0 ? block.includes(`${more} more</button>`) : !block.includes("rm-quest-more")) && visible(block).includes(rmCopy.SHORT_PAYS_NOTHING);
      })
    );
    const keyMissing = open.flatMap((s) => {
      const key = elsOf(s.html).find((e) => e.attrs["data-tip-panel"] === "key");
      const kt = key ? textIn(key) : "";
      return weekQuestKeyRowsOf(s.view)
        .filter((l) => !kt.includes(flat(l)))
        .map((l) => `${s.key}: ${l}`);
    });
    const placed = open.flatMap((s) => s.view.rows.filter((r) => r.place || r.dueLine)).length;
    check("R1 week quests (§11.4): the card Key lists each row's place and due sentence (and its quota and slip), in a hidden panel", placed > 5 && keyMissing.length === 0, keyMissing.slice(0, 3).join(" | "));
    const body = states.find((s) => s.key === "body-health")!;
    check(
      "R1 week quests (D12, §11.4): the body plan's card shows one «Not medical advice · ask a professional», opening HEALTH_LINE (once in the markup); no other state shows one",
      (visible(body.html).match(/Not medical advice · ask a professional/g) ?? []).length === 1 &&
        body.html.split(rmCopy.HEALTH_LINE).length === 2 &&
        /<button[^>]*data-hc="health"[^>]*aria-controls="[^"]+"/.test(body.html) &&
        states.filter((s) => s !== body).every((s) => !visible(s.html).includes(rmCopy.SHORT_HEALTH))
    );
    const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const wqSrc = strip(read("src/components/roadmap/WeekQuests.tsx"));
    check("R1 week quests (H9): Today's card moves only by SEEN — the done check (a check draw: today) and meters from the last-seen count; no burst, no shader", /"quest-done", \{\s*today: onToday,/.test(wqSrc) && !/burst|@\/components\/fx|ShaderSlot|HorizonField|DraftWeave/.test(wqSrc));

    // The aim line: every state, ≤ 8 app words, static, and START keeps its verb.
    const lines = AIM_LINE_FIXTURES.map((f) => ({ key: f.key, v: aimLineOfFixture(f) })).flatMap((x) => (x.v ? [{ key: x.key, v: x.v, html: R(createElement(AimLine, { view: x.v })) }] : []));
    const overLine = lines.map((l) => ({ key: l.key, n: words(blockOf(l.html, "aim-line")) })).filter((x) => x.n > 8 || x.n === 0);
    check("R1 aim line (§3.2 row 11): every state is ≤ 8 app words in its data-wc-block", lines.length > 5 && overLine.length === 0, overLine.map((x) => `${x.key}: ${x.n}`).join(", "));
    const starts = lines.filter((l) => l.v.kind === "START" && l.v.givesRank);
    check(
      "R1 aim line (C2-B3, §11.4): START keeps 'Gives … Aim rank X', the rank's medallion in its next-rank (active) shape, never held",
      starts.length >= 3 &&
        starts.every((l) => l.v.kind === "START" && visible(l.html).endsWith(`Gives Aim rank ${l.v.givesRank}.`) && /data-g="rank\.\d" data-s="active"/.test(l.html) && !/data-g="rank\.\d" data-s="done"/.test(l.html))
    );
    const lineSrc = strip(read("src/components/roadmap/AimLine.tsx"));
    check(
      "R1 aim line (D10, §11.4): no animated glyph — no usePlayOnSeen, seen hook or glyph motion — no shader, no data-play, no title",
      !/usePlayOnSeen|useSeen|playGlyph|glyph-motion|@\/components\/fx/.test(lineSrc) && lines.every((l) => calm(l.html) && !/\stitle="/.test(l.html) && !/year or three/.test(l.html))
    );
    const fxSrc = strip(read("src/app/dev/style/today/TodayFixtures.tsx"));
    check("R1 (§11.4): /dev/style/today imports no shader slot and sets no data-play or data-wait", !/@\/components\/fx|data-play|data-wait/.test(fxSrc));
  })()
);
// ===== /R1 =====

// ═══ The Today card's colour code: a must and a habit ═════════════════════
// tokens.css "Lane": --must (duty, warm) and --habit (recurring, cool), in every theme; contrast-check measures them
// (text on every surface, the rail and ring as marks, ΔE from each other and every signal and currency hue). Here:
// which rows wear which (board-ui rowAccentOf, the same answer as the tick's shape), TaskRow and Lane rendered for
// real, the board's lanes, and today.css painting the code through the two tokens only, with no layout change.
// Colour is never alone: the must keeps its diamond tick, every lane its name; Planned, Anytime and Inbox stay ink.
{
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokensCss = strip(read("src/app/styles/tokens.css"));
  const themes: [string, string][] = [["Night (also .theme-night)", /(?:^|\})\s*:root, \.theme-night\s*\{([^}]*)\}/m.exec(tokensCss)?.[1] ?? ""]];
  for (const m of tokensCss.matchAll(/:root\[data-theme="([a-z-]+)"\]\s*\{([^}]*)\}/g)) themes.push([m[1], m[2]]);
  const hexOf = (body: string, name: string) => new RegExp(`(?:^|[;\\s])${name}:\\s*(#[0-9a-f]{6})\\s*(?:;|$)`, "i").exec(body)?.[1]?.toLowerCase() ?? null;
  const values = new Set<string>();
  for (const [name, body] of themes) {
    const must = hexOf(body, "--must");
    const habit = hexOf(body, "--habit");
    if (must) values.add(must);
    if (habit) values.add(habit);
    check(`colour code: the ${name} theme declares --must and --habit itself, two different colours`, must != null && habit != null && must !== habit, `${must} / ${habit}`);
  }
  check("colour code: every theme in tokens.css is checked (Night and Vellum at least)", themes.length >= 2 && themes.some(([n]) => n === "vellum"), themes.map(([n]) => n).join(", "));

  // Which rows wear which: a must (the Must lane, or compulsory anywhere), a habit (a rule), the rest none.
  const meds = tpl({ id: "cc-meds", title: "Morning meds", compulsory: true, recurrence: "DAILY" });
  const rent = tpl({ id: "cc-rent", title: "Pay rent", compulsory: true, dueKind: "DEADLINE", dueDay: TODAY });
  const floss = tpl({ id: "cc-floss", title: "Floss", recurrence: "DAILY" });
  const call = tpl({ id: "cc-call", title: "Call mum", dueKind: "PLANNED", dueDay: TODAY });
  const anytimeOne = tpl({ id: "cc-read", title: "Read a chapter" });
  const cb = buildBoard(board(TODAY, [meds, rent, floss, call, anytimeOne]));
  const { planned: ccPlanned, habits: ccHabits } = splitTodayLane(cb.todayRows);
  const rowOf = (id: string) => [...cb.must, ...cb.todayRows, ...cb.anytime].find((r) => r.template.id === id) ?? null;
  const expect: [string, string | null, string][] = [
    ["cc-meds", "must", "a recurring must (Must lane)"],
    ["cc-rent", "must", "a one-off must (Must lane)"],
    ["cc-floss", "habit", "a habit (Habits lane)"],
    ["cc-call", null, "a planned one-off (Planned lane)"],
    ["cc-read", null, "an anytime one-off (Anytime)"],
  ];
  const where = {
    must: cb.must.map((r) => r.template.id),
    habits: ccHabits.map((r) => r.template.id),
    planned: ccPlanned.map((r) => r.template.id),
    anytime: cb.anytime.map((r) => r.template.id),
  };
  check(
    "colour code fixtures: the musts sit in the Must lane, the habit in Habits, the one-offs in Planned and Anytime",
    where.must.includes("cc-meds") && where.must.includes("cc-rent") && where.habits.join() === "cc-floss" && where.planned.join() === "cc-call" && where.anytime.join() === "cc-read",
    JSON.stringify(where)
  );
  for (const [id, want, what] of expect) {
    const r = rowOf(id);
    check(`colour code: ${what} → ${want ?? "no code (ink)"}`, r != null && rowAccentOf(r) === want, String(r && rowAccentOf(r)));
  }
  check(
    "colour code: a compulsory row outside the Must lane (yesterday's, Anytime) still wears --must; a must's rule never makes it a habit",
    rowAccentOf({ lane: "yesterday", template: { compulsory: true, recurrence: null } }) === "must" &&
      rowAccentOf({ lane: "anytime", template: { compulsory: true, recurrence: null } }) === "must" &&
      rowAccentOf({ lane: "must", template: { compulsory: true, recurrence: "DAILY" } }) === "must" &&
      rowAccentOf({ lane: "today", template: { compulsory: false, recurrence: "TARGET:3/W" } }) === "habit" &&
      rowAccentOf({ lane: "today", template: { compulsory: false, recurrence: null } }) === null
  );

  // TaskRow rendered: the code on the row, and the tick's shape from the same answer (colour never alone).
  const rowHtml = (r: BoardRow) =>
    renderToStaticMarkup(
      createElement(TaskRow, {
        row: r,
        projection: r.projection,
        drawerOpen: false,
        undoable: false,
        busy: false,
        receiptOpen: false,
        receiptId: "rcpt",
        onTick: () => {},
        onUndo: () => {},
        onToggleDrawer: () => {},
        onToggleReceipt: () => {},
      })
    );
  const head = (html: string) => /^<div class="t-row"[^>]*>/.exec(html)?.[0] ?? "";
  const shapeOf = (html: string) => /class="tick[^"]*"[^>]*data-shape="(\w+)"/.exec(html)?.[1] ?? /data-shape="(\w+)"/.exec(html)?.[1] ?? null;
  for (const [id, want, what] of expect) {
    const r = rowOf(id);
    const html = r ? rowHtml(r) : "";
    const accent = /data-accent="(\w+)"/.exec(head(html))?.[1] ?? null;
    const shape = shapeOf(html);
    check(
      `colour code: TaskRow draws ${what} with ${want ? `data-accent="${want}"` : "no data-accent"} and a ${want === "must" ? "diamond" : "circle"} tick`,
      html !== "" && accent === want && shape === (want === "must" ? "diamond" : "circle"),
      `${accent} · ${shape}`
    );
  }

  // Lane rendered: the Must lane and the Habits lane carry their class, the name stays the label; others carry none.
  const laneHtml = (p: { must?: boolean; habit?: boolean }, title: string) => renderToStaticMarkup(createElement(Lane, { id: title.toLowerCase(), title, ...p }));
  const mustLane = laneHtml({ must: true }, "Must");
  const habitLane = laneHtml({ habit: true }, "Habits");
  const plainLane = laneHtml({}, "Planned");
  check(
    "colour code: Lane wears lane-must / lane-habit (and keeps its name and diamond); a plain lane neither",
    /class="today-lane lane-must"/.test(mustLane) && />Must<\/h2>/.test(mustLane) && mustLane.includes('class="lane-mark"') &&
      /class="today-lane lane-habit"/.test(habitLane) && />Habits<\/h2>/.test(habitLane) && habitLane.includes('class="lane-mark"') &&
      !/lane-must|lane-habit/.test(plainLane),
    `${head(mustLane) || mustLane.slice(0, 60)} | ${habitLane.slice(0, 60)} | ${plainLane.slice(0, 60)}`
  );
  const boardJsx = read("src/components/today/TodayBoard.tsx");
  const laneTag = (id: string) => new RegExp(`<Lane\\s+id="${id}"[\\s\\S]*?>`).exec(boardJsx)?.[0] ?? "";
  // The work skin (the Office workspace's Tasks page, 2026-10-20) draws no colour code: `must` and `habit` only off a work tab.
  check(
    "colour code: the board's Must lane is `must`, its Habits lane `habit` (the personal Board; a work tab's neither), its Planned lane neither",
    /\smust=\{!isWork\}\s/.test(laneTag("must")) && /\shabit=\{!isWork\}\s/.test(laneTag("habits")) && !/\s(must|habit)[\s=]/.test(laneTag("planned")),
    `${laneTag("habits").slice(0, 80)}`
  );

  // today.css paints the code through the tokens only.
  const css = strip(read("src/components/today/today.css"));
  const rule = (sel: string) => new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1]?.trim() ?? null;
  for (const k of ["must", "habit"] as const) {
    const t = `var(--${k})`;
    const lane = k === "must" ? ".today-lane.lane-must" : ".today-lane.lane-habit";
    check(`colour code css: the ${k} lane's diamond and name wear ${t}`, rule(`${lane} .lane-mark`) === `border-color: ${t};` && rule(`${lane} .lane-h h2`) === `color: ${t};`, `${rule(`${lane} .lane-mark`)} | ${rule(`${lane} .lane-h h2`)}`);
    check(`colour code css: a ${k} row's leading rail is ${t}`, rule(`.t-row[data-accent="${k}"]::before`) === `background: ${t};`, String(rule(`.t-row[data-accent="${k}"]::before`)));
    check(
      `colour code css: a ${k} row's open, enabled tick ring is ${t} (done stays kept, disabled stays mute)`,
      rule(`.t-row[data-accent="${k}"] .tick[data-state="open"]:not(:disabled) .tick-ring`) === `border-color: ${t};`,
      String(rule(`.t-row[data-accent="${k}"] .tick[data-state="open"]:not(:disabled) .tick-ring`))
    );
  }
  check(
    "colour code css: a kept Must lane's diamond still fills kept (its rule follows the code's)",
    css.indexOf(".today-lane.kept .lane-mark") > css.indexOf(".today-lane.lane-must .lane-mark") && css.indexOf(".today-lane.lane-must .lane-mark") >= 0
  );
  const accents = new Set([...css.matchAll(/data-accent="(\w+)"/g)].map((m) => m[1]));
  check("colour code css: only a must and a habit wear a code (Planned, Anytime and Inbox stay ink)", [...accents].sort().join() === "habit,must" && !/lane-planned|lane-anytime|lane-inbox/.test(css), [...accents].join());
  const railRule = rule(".t-row[data-accent]::before") ?? "";
  const railW = Number(/(?:^|;)\s*width:\s*(\d+)px/.exec(railRule)?.[1] ?? NaN);
  const rowPadLeft = Number(/padding:\s*\d+px \d+px \d+px (\d+)px/.exec(rule(".t-row .row") ?? "")?.[1] ?? NaN);
  check(
    "colour code css: the rail is out of flow and fits in the row's left padding (no layout change; the 44 px tick keeps its column)",
    /position:\s*absolute/.test(railRule) && /left:\s*0/.test(railRule) && /pointer-events:\s*none/.test(railRule) && railW <= rowPadLeft && /grid-template-columns:\s*44px /.test(rule(".t-row .row") ?? ""),
    `${railW} ≤ ${rowPadLeft}`
  );
  // Never raw hex: the token values live in tokens.css alone (no component, sheet or other style copies them).
  const walkSrc = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((n) => {
      const p = `${dir}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walkSrc(p) : /\.(tsx?|css|mjs)$/.test(n) ? [p] : [];
    });
  const copies = values.size === 0 ? ["(no values read)"] : walkSrc("src").filter((f) => f !== "src/app/styles/tokens.css" && [...values].some((v) => read(f).toLowerCase().includes(v)));
  check("colour code: no file but tokens.css spells a --must or --habit value (components use the tokens)", copies.length === 0, copies.join(", "));
  const codeRules = [...css.matchAll(/([^{}]*(?:data-accent|lane-must|lane-habit)[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]);
  check("colour code css: the code's rules hold no literal colour (#…, rgb(), hsl())", codeRules.length >= 8 && codeRules.every((b) => !/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(b)), String(codeRules.length));
}

// ═══ Momentum on Today (momentum.md §E.1–§E.3, §G.1 lane E; ui-motion D10) ═══════════════════
// The Momentum card, its chest sheet and the crit's T0, rendered over fixtures (the card takes its actions as props,
// so nothing here reaches a server). Critical pins only: inert before launch (no card, Today's markup unchanged),
// every card target ≥ 44 px at 344, no XP total or meter on the strip, a static flame, the odds in the chest sheet,
// the crit's gold mark and the notice that ignores what a crit explains, and never a work tab.
asyncChecks.push(
  (async () => {
    const { default: NodeModule } = await import("node:module");
    const ext = (NodeModule as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions;
    if (!ext[".css"]) ext[".css"] = (m) => void (m.exports = {});
    const mc = await import("../src/components/today/MomentumCard");
    const { ChestBody } = await import("../src/components/today/ChestSheet");
    const { QuestRows, QUEST_FOOTER, questWhyOf } = await import("../src/components/today/QuestSheet");
    const M = await import("../src/lib/momentum");
    const { TONES, TICK_LADDER } = await import("../src/lib/celebrate");
    const { kneePay } = await import("../src/lib/life-grade");
    const { FLAME_PATH } = await import("../src/components/glyph/paths/flame");
    type View = import("../src/lib/momentum-server").MomentumView;
    type Live = Extract<View, { live: true }>;
    const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const DAY = "2026-10-19" as DayKey;
    const NOW = "2026-10-19T03:00:00.000Z";
    const noop = async () => ({ ok: false as const, error: "fixture" });
    const actions = { openChest: noop, swapQuest: noop, setFlameSkin: noop };
    const points = { earned: 5, spent: 3, available: 2, countedXp: 1712, nextAt: 1890, weekCounted: 640, weekCap: 700 };
    const grid = Array.from({ length: 35 }, (_, i) => ({ day: addDays(DAY, i - 34), mark: (i === 34 ? "active" : i === 33 ? "held" : i < 10 ? "before" : "active") as "active" | "held" | "before" }));
    const live = (over: Partial<Live> = {}): Live => ({
      live: true,
      day: DAY,
      frozen: true,
      writesOff: false,
      done: 1,
      quests: [
        { slot: "PLAN", quest: { slot: "PLAN", kind: "REVIEWS", count: 10, title: "Review 10 cards", why: "40 cards due" }, identity: "PLAN:REVIEWS", done: false, swapsLeft: 0 },
        { slot: "BODY", quest: { slot: "BODY", kind: "MOVE", minutes: 20, title: "Move 20 min", why: "60 of 150 effort min this week" }, identity: "BODY:MOVE:20", done: true, swapsLeft: 0 },
        { slot: "TASK", quest: { slot: "TASK", kind: "TEMPLATE", templateId: "t1", track: "CRAFT", raw: 23, score: 34.5, title: "Write the report", why: "Your biggest due task" }, identity: "TASK:TEMPLATE:t1", done: false, swapsLeft: 1 },
      ],
      chest: { state: "locked", done: 1, of: 3, receipt: null, track: "CRAFT", sinceRare: 3, pityIn: 7, rareBonus: 0, odds: M.chestOdds(0), yesterday: null },
      run: { current: 12, longest: 41, bank: 2, freezeMax: 2, nextFreezeIn: 4, earned: 3, used: 2, heldInRun: 1, heldYesterday: true, todayKept: true, atRisk: false, grid },
      chain: { links: 2, mult: 1.06, nextMult: 1.09, lastAt: "2026-10-19T02:40:00.000Z", until: "2026-10-19T03:25:00.000Z", windowMin: 45 },
      lsp: { DISCIPLINE: points, PATHFINDER: points, VITALITY: points },
      perks: [],
      flameSkin: null,
      trim: null,
      cosmetics: [],
      ...over,
    });
    const card = (view: View) => renderToStaticMarkup(createElement(mc.MomentumCard, { view, nowIso: NOW, actions, prices: { t1: 23.4 } }));

    // Inert before launch: no card, nothing drawn; the page passes a view only when live; a work tab never shows one.
    const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
    const pageSrc = code(read("src/app/today/page.tsx"));
    check(
      "momentum inert: with no launch day (an explicit null) momentumLive is false for every day, and a {live: false} view renders nothing at all",
      !M.momentumLive(DAY, null) && !M.momentumLive("2099-12-31", null) && !M.momentumLive(DAY, "2026-10-20") && card({ live: false, day: DAY }) === ""
    );
    check(
      "momentum launched: MOMENTUM_LAUNCH_DAY is 2026-10-12, so momentumLive is true from that day (DAY, 19 October, is live) and false the day before",
      M.MOMENTUM_LAUNCH_DAY === "2026-10-12" &&
        M.momentumLaunchDay({ NODE_ENV: "production" }) === M.MOMENTUM_LAUNCH_DAY &&
        M.momentumLive(DAY, M.MOMENTUM_LAUNCH_DAY) &&
        M.momentumLive("2026-10-12", M.MOMENTUM_LAUNCH_DAY) &&
        !M.momentumLive("2026-10-11", M.MOMENTUM_LAUNCH_DAY) &&
        card(live()) !== ""
    );
    check(
      "momentum inert: loadMomentum answers {live: false} before launch without a read (momentum-server's early return)",
      /if \(!momentumLive\(today, ctx\.launch\)\) return \{ live: false, day: today \};/.test(code(read("src/lib/momentum-server.ts")))
    );
    check(
      "momentum inert: the board draws the card only when the view is live and never on a work tab; the page passes a view only when live",
      /\{!isWork && momentum\?\.live && \(\s*<div className="o1">\s*<MomentumCard /.test(boardSrc) &&
        (boardSrc.match(/<MomentumCard\b/g) ?? []).length === 1 &&
        /momentum=\{momentum\?\.live \? momentum : null\}/.test(pageSrc) &&
        !/momentum/i.test(code(read("src/app/today/work/[boardId]/page.tsx")))
    );
    check(
      "momentum: the page settles momentum (awaited, before the wave) and reads it in the board's one wave (a failure reads as no card)",
      /const settled = await settleMomentum\(userId, day, \{ now \}\);/.test(pageSrc) &&
        pageSrc.indexOf("await settleMomentum(") < pageSrc.indexOf("await Promise.all([") &&
        /loadMomentum\(userId, day, \{ now \}\)\.catch\(\(\) => null\)/.test(/await Promise\.all\(\[([\s\S]*?)\]\);/.exec(pageSrc)?.[1] ?? "") &&
        /momentumSettled=\{settled\.wrote\}/.test(pageSrc)
    );
    check(
      "momentum: the card sits at the top of the side column (.o1), after the notices and before the Duty card and the strip",
      boardSrc.indexOf("<MomentumCard") > boardSrc.indexOf('<div role="alert" className="card today-note o1"') &&
        boardSrc.indexOf("<MomentumCard") < boardSrc.indexOf('{o1 === "settled" && settled && (') &&
        boardSrc.indexOf("<MomentumCard") < boardSrc.indexOf("{elsewhere != null && elsewhere !== false")
    );

    // Targets at 344 px: the card's content box is 278 px (16 px gutter, 16 px padding).
    const css = strip(read("src/components/today/momentum.css"));
    const v = (sel: string, prop: string) => cssValue(css, sel, prop);
    check("momentum css: the card pads 16 px sideways (278 px content at 344)", /\.mo-card \{[^}]*padding: 12px 16px;/.test(css));
    check("momentum touch target: the flame button ≥ 104 × 44 px", (v(".mo-flame", "min-width") ?? 0) >= 104 && (v(".mo-flame", "min-height") ?? 0) >= 44);
    check("momentum touch target: the chest button 44 × 44 px", [v(".mo-chest", "width"), v(".mo-chest", "min-width"), v(".mo-chest", "height"), v(".mo-chest", "min-height")].every((x) => (x ?? 0) >= 44));
    const gap = v(".mo-pips", "gap") ?? 99;
    const pipW = (278 - 2 * gap) / 3;
    check(
      "momentum touch target: three pips in one row at 344, each ≥ 44 px tall and ≥ 87 px wide (3 columns, gap 8)",
      /\.mo-pips \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/.test(css) && gap === 8 && pipW >= 87 && (v(".mo-pip", "min-height") ?? 0) >= 44,
      `${pipW.toFixed(1)} px`
    );
    const rowOne = 104 + (3 * 18 + 2 * 2) + 44 + 44 + 3 * 8; // flame, three freezes (Spare flame), "3 of 3" (≈ 44), chest, three gaps
    check("momentum touch target: row 1 fits 278 px even with three freezes", rowOne <= 278 && (v(".mo-fz svg", "width") ?? 99) <= 18, String(rowOne));
    check("momentum touch target: flame skins 44 × 44, the odds disclosure 44 tall", (v(".mo-skin", "min-width") ?? 0) >= 44 && (v(".mo-skin", "min-height") ?? 0) >= 44 && (v(".mo-odds summary", "min-height") ?? 0) >= 44);
    const sizes = [...css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    check("momentum type: nothing under 12 px in momentum.css", sizes.length > 0 && sizes.every((n) => n >= 12), sizes.join(","));
    check("momentum css: tokens only (no hex, rgb() or hsl())", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(css));

    // No XP total, fill or meter on the strip (§E.1: Today's three is not the dropped daily XP bar).
    const states = [
      live(),
      live({ done: 3, quests: live().quests.map((q) => ({ ...q, done: true, swapsLeft: 0 })), chest: { ...live().chest, state: "ready", done: 3 } }),
      live({
        done: 3,
        quests: live().quests.map((q) => ({ ...q, done: true, swapsLeft: 0 })),
        chest: { ...live().chest, state: "opened", done: 3, receipt: { v: "chest-1", u1: 0.1, u2: 0.2, tier: "COMMON", item: null, xp: 20, mp: 0, freeze: false, cosmetic: null, pity: false, sinceRare: 3 } },
      }),
    ];
    const htmls = states.map(card);
    check(
      "momentum strip: no XP total, no fill and no meter in any state (no 'XP', no <meter>, no progressbar, no width style)",
      htmls.every((h) => !/XP/.test(h) && !/<meter|role="progressbar"|class="[^"]*\bmeter\b|style="[^"]*width:\s*[\d.]+%/.test(h)),
      htmls.map((h) => (/.{0,40}XP.{0,20}/.exec(h) ?? [""])[0]).join(" | ")
    );
    check(
      "momentum strip: Today's three are three named, binary pips (Task, Plan, Body) with the run, the freezes and 'n of 3'",
      (htmls[0].match(/class="mo-pip"/g) ?? []).length === 3 &&
        /Task<\/span>[\s\S]*Plan<\/span>[\s\S]*Body<\/span>/.test(htmls[0]) &&
        htmls[0].includes("12 days") &&
        htmls[0].includes('aria-label="2 freezes banked"') &&
        />1 of 3</.test(htmls[0].replace(/<!-- -->/g, "")) &&
        htmls[0].includes("Chain 2 · keep it within 45 min")
    );
    check(
      "momentum strip: collapses to row 1 once 3 of 3 are done and the chest is opened (no pips, no chain)",
      htmls[2].includes("data-collapsed") && !htmls[2].includes('class="mo-pip"') && !htmls[2].includes("mo-chain") && htmls[1].includes('class="mo-pip"')
    );
    check(
      "momentum strip: the chest reads locked, ready (a lit edge) or opened",
      htmls[0].includes('data-state="locked"') && htmls[1].includes('data-state="ready"') && htmls[2].includes('data-state="opened"') && /\.mo-chest\[data-state="ready"\]/.test(css)
    );

    // A static flame: the kit's path, no <animate>, and nothing in momentum.css animates it; the one keyframe is a chest's
    // contents fading in (opacity only), after a tap, never a loop.
    const flameCss = [...css.matchAll(/([^{}]*\.mo-flame[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]).join(" ");
    const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    check(
      "momentum flame: static (the kit's flame path, no <animate>, no animation or transition on any flame rule, no loop anywhere)",
      htmls[0].includes(`<path d="${FLAME_PATH}"`) && !/<animate|animation/.test(htmls[0]) && flameCss.length > 0 && !/animation|transition/.test(flameCss) && !/infinite/.test(css)
    );
    check(
      "momentum flame: hollow at a run of 0",
      card(live({ run: { ...live().run, current: 0, heldYesterday: false } })).includes("data-hollow")
    );
    check(
      "momentum motion: the one keyframe animates opacity only, and only a chest's revealed contents use it",
      keyframes.length === 1 &&
        [...keyframes[0][2].matchAll(/([a-z-]+)\s*:/g)].every((d) => d[1] === "opacity") &&
        (css.match(/animation:/g) ?? []).length === 1 &&
        /\.mo-contents\[data-reveal\] \{ animation:/.test(css)
    );

    // The chest sheet: Open, the published odds and the pity count; reveal only on a tap.
    const chest = live().chest;
    const run = live().run;
    const body = (c: typeof chest) => renderToStaticMarkup(createElement(ChestBody, { chest: c, run, trim: null, onOpen: () => {} })).replace(/<!-- -->/g, "");
    const locked = body(chest);
    const ready = body({ ...chest, state: "ready", done: 3 });
    const winds = body({ ...chest, state: "ready", done: 3, rareBonus: 4, odds: M.chestOdds(4) });
    check(
      "chest sheet: the Odds are shown, every figure from chestOdds and MOMENTUM.CHEST, with the pity count ('rare in ≤ n')",
      locked.includes("60% · 20 XP · 28% · 8 MP · 12% rare (freeze 4.8%, hoard 4.2%, cosmetic 3.0%) · a rare at least every 10 chests · rare in ≤ 7 · 3 chests since your last rare") &&
        /<details class="mo-odds" open="">/.test(locked) &&
        mc.chestOddsLine(chest) === "60% · 20 XP · 28% · 8 MP · 12% rare (freeze 4.8%, hoard 4.2%, cosmetic 3.0%) · a rare at least every 10 chests · rare in ≤ 7 · 3 chests since your last rare",
      mc.chestOddsLine(chest)
    );
    check("chest sheet: Fair winds shows today's odds (16% rare, from Common)", winds.includes("56% · 20 XP · 28% · 8 MP · 16% rare (freeze 6.4%, hoard 5.6%, cosmetic 4.0%)") && winds.includes("Fair winds"));
    const openTag = (h: string) => /<button([^>]*)>Open<\/button>/.exec(h)?.[1] ?? "";
    check(
      "chest sheet: Open is a full-width primary, enabled only when ready; locked says what is left and that missing it costs nothing",
      /class="btn btn-primary btn-block"/.test(openTag(locked)) &&
        /disabled=""/.test(openTag(locked)) &&
        locked.includes("1 of 3 done") &&
        locked.includes("missing it costs nothing") &&
        /class="btn btn-primary btn-block"/.test(openTag(ready)) &&
        !/disabled/.test(openTag(ready)),
      `${openTag(locked)} | ${openTag(ready)}`
    );
    const sheetSrc = code(read("src/components/today/ChestSheet.tsx"));
    check(
      "chest sheet: it opens only on a tap (Open's handler), never on arrival (no effect), and renders ChestBody with ChestOdds",
      /onOpen=\{\(\) => void openToday\(\)\}/.test(sheetSrc) && (sheetSrc.match(/openChest\(/g) ?? []).length === 1 && !/useEffect/.test(sheetSrc) && /<ChestBody\b/.test(sheetSrc) && /<ChestOdds chest=\{chest\} \/>/.test(sheetSrc)
    );
    const rare = { v: "chest-1" as const, u1: 0.95, u2: 0.6, tier: "RARE" as const, item: "HOARD" as const, xp: 40, mp: 12, freeze: false, cosmetic: null, pity: false, sinceRare: 3 };
    const full = { ...rare, u2: 0.1, item: "FREEZE" as const, xp: 0, mp: 8 };
    check(
      "chest sheet: exact contents ('+40 XP → Craft', '+12 MP'; 'Freeze bank full · +8 MP'), and the next hook",
      JSON.stringify(mc.chestLinesOf(rare, "CRAFT")) === JSON.stringify(["+40 XP → Craft", "+12 MP"]) &&
        JSON.stringify(mc.chestLinesOf(full, "CRAFT")) === JSON.stringify(["Freeze bank full · +8 MP"]) &&
        mc.chestTierLabel(rare) === "Rare · Hoard" &&
        mc.nextHookOf(run) === "Run 12 → 13 tomorrow · freeze bank full" &&
        mc.nextHookOf({ ...run, bank: 1, todayKept: false, current: 4 }) === "Run 5 → 6 tomorrow · freeze in 4 days",
      `${mc.chestLinesOf(rare, "CRAFT").join(" | ")} · ${mc.nextHookOf(run)}`
    );

    // The quest sheet: the row's own price as its why, swaps left, the footer.
    const rows = renderToStaticMarkup(createElement(QuestRows, { quests: mc.questsInStripOrder(live().quests), prices: { t1: 23.4 } })).replace(/<!-- -->/g, "");
    check(
      "quest sheet: why with the row's own '≈ N XP', Go for open quests, Swap with the count left, and the footer",
      questWhyOf(live().quests[2], { t1: 23.4 }) === "Your biggest due task · ≈ 23.4 XP" &&
        rows.includes("Swap · 1 left") &&
        (rows.match(/>Go</g) ?? []).length === 2 &&
        QUEST_FOOTER === "1 of 3 keeps your run · 3 of 3 opens the chest" &&
        /\.mo-qrow \{[^}]*min-height: 56px;/.test(css)
    );

    // The crit (§A.5, §E.3): a gold T0 in place, the mark's tone up a fifth; the notice ignores what X explains.
    const crit = {
      v: "life-2",
      factors: [
        { key: "B" as const, label: "Standard", value: 10 },
        { key: "M" as const, label: "2 links", value: 1.06 },
        { key: "X" as const, label: "crit", value: 2, note: "sealed roll 0.031 under 0.080" },
      ],
      minutes: 30,
      raw: 24,
      kneeBefore: 0,
      xp: 24,
      track: "CRAFT" as const,
    };
    const plain = { ...crit, v: "life-1", factors: crit.factors.filter((f) => f.key === "B"), raw: 12, xp: 12 };
    check(
      "crit: the mark reads 'Crit ×2 · +24.0' (with the chain), a link alone 'Chain 2', a plain tick nothing",
      mc.momentumMarkOf(crit)?.kind === "crit" &&
        mc.momentumMarkOf(crit)?.text === "Crit ×2 · +24.0 · Chain 2" &&
        mc.momentumMarkOf({ ...crit, factors: crit.factors.filter((f) => f.key !== "X") })?.text === "Chain 2" &&
        mc.momentumMarkOf(plain) === null,
      JSON.stringify(mc.momentumMarkOf(crit))
    );
    check(
      "crit: the paid-vs-projected notice ignores the difference X explains, and still says any other",
      mc.xpWithoutCrit(crit) === kneePay(0, 12) && !mc.paidDiffersFromShown(crit, 12) && mc.paidDiffersFromShown(crit, 10) && !mc.paidDiffersFromShown(plain, 12.04) && mc.paidDiffersFromShown(plain, 12.2)
    );
    // The chain is luck too (it depends on when the tap lands): a row projected with a link that the server did not
    // give (two ticks a minute apart) says nothing; a real change of size still does.
    const linked = { ...plain, v: "life-2", factors: [plain.factors[0], { key: "M" as const, label: "1 link", value: 1.03 }], raw: 12.4, xp: 12.4 };
    check(
      "chain: the notice compares paid and projected without the chain or the crit; a projected link the tap did not get is no notice",
      !mc.paidDiffersFromShown(plain, linked) && !mc.paidDiffersFromShown(linked, plain) && mc.paidDiffersFromShown({ ...plain, raw: 13, xp: 13 }, linked),
      `${mc.xpWithoutLuck(plain)} vs ${mc.xpWithoutLuck(linked)}`
    );
    const celebrateSrc = code(read("src/lib/celebrate.ts"));
    check(
      "crit: the T0 'crit' variant is a gold numeral in place, its tone (1976 Hz, unchanged) a fifth above the tick pluck's top rung, and never flies",
      TONES.crit[0][0] === 1976 && Math.abs(TONES.mark[0][0] * 2 ** (TICK_LADDER[TICK_LADDER.length - 1] / 12) * 2 ** (7 / 12) - TONES.crit[0][0]) < 1 &&
        /if \(o\.kind === "crit" \|\| o\.kind === "chain"\) \{\s*momentumLabel\([^)]*\);\s*return Promise\.resolve\(\);\s*\}/.test(celebrateSrc) &&
        /"--tok", "var\(--gold-m\)"/.test(celebrateSrc)
    );
    check(
      "crit: the board marks it after the server pays (a tick, Again, a step that finishes, yesterday recorded), and keeps the old notice gate",
      (boardSrc.match(/markMomentum\(row, v\.receipt\)/g) ?? []).length === 4 &&
        /else if \(!isWork && Math\.abs\(v\.receipt\.xp - shown\.xp\) > 0\.05\) \{[^}]*?if \(paidDiffersFromShown\(v\.receipt, shown\)\)/.test(boardSrc) &&
        /function markMomentum\(row: BoardRow, receipt: Receipt \| null \| undefined\) \{\s*if \(isWork\) return;/.test(boardSrc)
    );
  })()
);

// ═══ Momentum's moments on Today (momentum.md §A.8, §E.2, §G.1; lane D's kinds, lane E's presenters) ═══════════════
// A tap's answer brings its T1s ('t1:<key>'): momentum-kept replaces the board's own day-kept (one chime for one tick),
// plus quest-done and freeze-held; the chest sheet plays the server's chest (T1) or chest-rare (T2); a milestone's or a
// capstone's Ascension shows its fact lines, with Done as the gold primary and the place as the quiet secondary.
asyncChecks.push(
  (async () => {
    const { default: NodeModule } = await import("node:module");
    const ext = (NodeModule as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions;
    if (!ext[".css"]) ext[".css"] = (m) => void (m.exports = {});
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
    check(
      "momentum T1: every tap's answer (a tick, Again, a step, yesterday recorded) plays the server's momentum-kept, quest-done and freeze-held, loudest first, as one chime",
      (boardSrc.match(/playMomentumT1\(v\.celebrations\);/g) ?? []).length === 4 &&
        /const MOMENTUM_TICK_T1: readonly MomentumT1Kind\[\] = \["momentum-kept", "quest-done", "freeze-held"\];/.test(boardSrc) &&
        /function playMomentumT1\([^)]*\) \{\s*if \(isWork\) return;/.test(boardSrc) &&
        (boardSrc.slice(boardSrc.indexOf("function playMomentumT1("), boardSrc.indexOf("function playMomentumT1(") + 1600).match(/chime\(/g) ?? []).length === 1
    );
    check(
      "momentum T1: while today's run is open the board holds its own day-kept back (the server's momentum-kept replaces it); otherwise day-kept is as before",
      /const momentumOpen = !isWork && !!momentum\?\.live && !momentum\.run\.todayKept;/.test(boardSrc) &&
        /const moments = dayMomentsOf\(prev, next\)\.filter\(\(m\) => !\(m === "day-kept" && momentumOpen\)\);/.test(boardSrc)
    );
    const sheetSrc = code(read("src/components/today/ChestSheet.tsx"));
    check(
      "chest moments: the sheet presents the server's chest-rare (T2) and chimes its chest (T1, its own id), once; a double tap plays nothing",
      /presentAll\(v\.celebrations\);/.test(sheetSrc) &&
        /const t1 = v\.celebrations\.find\(\(e\) => e\.tier === 1 && e\.kind === "chest"\);/.test(sheetSrc) &&
        /chime\(\{ kind: "chest", id: t1\.id,/.test(sheetSrc) &&
        /else if \(!v\.duplicate && v\.receipt\.tier !== "RARE"/.test(sheetSrc)
    );
    const { AscensionCurtain, defaultPrimary, defaultSecondary } = await import("../src/components/celebrate/AscensionCurtain");
    const ev = (kind: string, href?: string) =>
      ({
        id: `c-${kind}`,
        tier: 3,
        kind,
        facts: {
          eyebrow: "Milestone reached",
          kicker: "Milestone reached",
          title: "Familiar",
          epithet: "Read the news in Japanese",
          lines: ["Stage 2 of 5 · 34 days", "Confirmed on your readings, 12 Oct"],
          grants: ["+120 XP → Craft", "+50 MP"],
          ...(href ? { href } : {}),
          material: "gold",
        },
        what: [],
      }) as never;
    const html = (e: never) => renderToStaticMarkup(createElement(AscensionCurtain, { ev: e, onDone: () => {} }));
    const ms = html(ev("milestone", "/you/roadmap?r=rm1"));
    const cap = html(ev("capstone", "/skills/life"));
    const title = html(ev("title"));
    check(
      "ceremony: a milestone's Ascension shows its fact lines (stage and days, the readings' date) between the epithet and the grants",
      /<div class="t-epithet">[^<]*<\/div><div class="cur-lines"><p>Stage 2 of 5 · 34 days<\/p><p>Confirmed on your readings, 12 Oct<\/p><\/div><ul class="grants">/.test(ms)
    );
    check(
      // Re-pinned for blueprint P2 (D6): the Life tree is "Life perks".
      "ceremony: milestone and capstone close with Done (gold primary) and lead on quietly (See the roadmap → facts.href; See Life perks → /skills/life)",
      /<div class="cur-acts"><button type="button" class="btn btn-gold">Done<\/button><a class="btn btn-quiet" href="\/you\/roadmap\?r=rm1">See the roadmap<\/a><\/div>/.test(ms) &&
        /<button type="button" class="btn btn-gold">Done<\/button><a class="btn btn-quiet" href="\/skills\/life">See Life perks<\/a>/.test(cap) &&
        defaultSecondary({ kind: "capstone", facts: { title: "x" } } as never)?.href === "/skills/life" &&
        defaultPrimary({ kind: "milestone" } as never)?.label === "Done"
    );
    check(
      "ceremony: every other Ascension is unchanged (its gold primary, then a quiet Done)",
      /<a class="btn btn-gold" href="\/you">See your sheet<\/a><button type="button" class="btn btn-quiet">Done<\/button>/.test(title) && defaultSecondary({ kind: "title", facts: { title: "x" } } as never) === null,
      (/<div class="cur-acts">[\s\S]*?<\/div>/.exec(title) ?? [""])[0]
    );
  })()
);

// ═══ The tick's flourish and Done today (ui-motion D10a, the user's decision 2026-10-15) ═══════════════════
// Rich but quick: the press, the ring filling in its code, the check, one ripple and the strike sweep, then the row
// folds out of its lane into "Done today". Critical pins only: the timings per motion level (Full ≤ 600 ms, Calm
// shorter and opacity-only, Still none, reduced motion Calm's) and today.css writing the same numbers; the pile's
// count, order and XP sum (a work tab none); every lane's honest count and its "All kept"; a lane kept and the board
// clear once per life day, after a tick; Board clear's card; and where focus goes when a row leaves.
asyncChecks.push(
  (async () => {
    const { default: NodeModule } = await import("node:module");
    const ext = (NodeModule as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions;
    if (!ext[".css"]) ext[".css"] = (m) => void (m.exports = {});
    const ui = await import("../src/components/today/board-ui");
    const { DonePile } = await import("../src/components/today/DonePile");
    const { BoardClearCard } = await import("../src/components/today/BoardClearCard");
    const { T1_KINDS, KIND_TIER } = await import("../src/lib/celebration-types");
    const lf = (src: string) => src.replace(/\r\n/g, "\n");
    const strip = (css: string) => lf(css).replace(/\/\*[\s\S]*?\*\//g, "");
    const code = (src: string) => lf(src).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const css = strip(read("src/components/today/today.css"));
    const boardSrc = code(read("src/components/today/TodayBoard.tsx"));
    const rowSrc = code(read("src/components/today/TaskRow.tsx"));
    /** The body of the first rule whose selector is exactly `sel` (outside or inside a media block). */
    const body = (sel: string, from = 0): string => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "m").exec(css.slice(from))?.[1]?.trim() ?? "";
    };

    // ── The timings, per level ──
    const { full, calm, still } = ui.TICK_MOTION;
    check(
      "tick motion (Full): the press, the fill, the check, one ripple and the strike all finish inside the 450 ms hold, and the fold ends by 600 ms",
      full.hold + full.out <= 600 && [full.press, full.fill, full.check, full.ripple, full.strike].every((v) => v > 0 && v <= full.hold),
      JSON.stringify(full)
    );
    check(
      "tick motion (Calm): shorter and opacity-only (no press, ripple or sweep; a fade under 260 ms, no fold)",
      calm.hold + calm.out < full.hold + full.out && calm.press === 0 && calm.ripple === 0 && calm.strike === 0 && calm.out > 0 && calm.out <= 260 && calm.fill <= 260 && calm.check <= 260,
      JSON.stringify(calm)
    );
    check("tick motion (Still): nothing (the row is in Done today at once)", Object.values(still).every((v) => v === 0));
    check(
      "tick motion: the OS's reduced motion plays Calm's even under an explicit Full; Still wins over everything",
      ui.tickMotionOf("full", false) === full && ui.tickMotionOf("full", true) === calm && ui.tickMotionOf("calm", false) === calm && ui.tickMotionOf("still", false) === still && ui.tickMotionOf("still", true) === still
    );

    // ── today.css writes the same numbers, rests on the finished state, and Calm / reduced motion strip it ──
    const tokens = strip(read("src/app/styles/tokens.css"));
    const reduced = css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .t-row");
    check(
      "tick css (Full): press .94 on pointerdown (--t-press = 90), the ripple 420 ms, the strike 240 ms after 60, the fold 150 ms (grid-template-rows 0fr and opacity)",
      body('.t-row .tick[data-press] .tick-ring') === "transform: scale(.94);" &&
        body('.t-row .tick[data-shape="diamond"][data-press] .tick-ring') === "transform: rotate(45deg) scale(.94);" &&
        /--t-press:90ms/.test(tokens) &&
        full.press === 90 &&
        body('.t-row[data-motion="hold"] .tick[data-state="done"]::after') === `animation: today-ripple ${full.ripple}ms var(--ease-out) 1;` &&
        /animation: today-strike 240ms var\(--ease-out\) 60ms both;/.test(css) &&
        240 + 60 === full.strike &&
        body('.t-row[data-motion="out"]') === `grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows ${full.out}ms var(--ease-inout), opacity ${full.out}ms var(--ease-out);`,
      body('.t-row[data-motion="out"]')
    );
    check(
      "tick css: the rest state is the finished one (the row's track 1fr; the ripple at opacity 0; the strike only while it leaves)",
      /^display: grid; grid-template-rows: 1fr;/.test(body(".t-row")) && /opacity: 0;/.test(body(".t-row .tick::after")) && !/animation/.test(body(".t-row .tick::after"))
    );
    check(
      "tick css (Calm): no press, ripple or sweep; the fold is an opacity fade of calm.out ms with the track kept",
      /html\[data-motion="calm"\] \.t-row \.tick\[data-press\] \.tick-ring,\s*html\[data-motion="still"\] \.t-row \.tick\[data-press\] \.tick-ring \{ transform: none; \}/.test(css) &&
        body('html[data-motion="calm"] .t-row[data-motion="hold"] .tick[data-state="done"]::after') === "animation: none;" &&
        body('html[data-motion="calm"] .t-row:is([data-motion="hold"], [data-motion="out"]) .row.done .r-name::after') === "animation: none;" &&
        body('html[data-motion="calm"] .t-row[data-motion="out"]') === `grid-template-rows: 1fr; transition: opacity ${calm.out}ms var(--ease-out);`
    );
    check(
      "tick css (reduced motion): the same strip inside @media (prefers-reduced-motion: reduce); Still kills every animation and transition (tokens.css)",
      reduced > 0 &&
        body(".t-row .tick[data-press] .tick-ring", reduced) === "transform: none;" &&
        body('.t-row[data-motion="hold"] .tick[data-state="done"]::after', reduced) === "animation: none;" &&
        body('.t-row[data-motion="out"]', reduced) === `grid-template-rows: 1fr; transition: opacity ${calm.out}ms var(--ease-out);` &&
        /html\[data-motion="still"\] \*, html\[data-motion="still"\] \*::before, html\[data-motion="still"\] \*::after \{ animation:none !important; transition:none !important; \}/.test(tokens)
    );
    const layoutTransitions = [...css.matchAll(/([^{}]*)\{([^}]*transition:[^}]*)\}/g)].filter((m) => /grid-template-rows \d/.test(m[2])).map((m) => m[1].trim());
    check(
      "tick css: the fold is the only layout transition on Today (grid-template-rows on a leaving or returning row, ≤ 160 ms)",
      layoutTransitions.join(" | ") === '.t-row[data-motion="out"] | .t-row[data-motion="enter"]' &&
        [...css.matchAll(/grid-template-rows (\d+)ms/g)].every((m) => Number(m[1]) <= 160),
      layoutTransitions.join(" | ")
    );
    check(
      "tick css: the ring fills in the row's code while it leaves (--tick-c: --must, --habit, else --kept; tokens only), and rests kept in Done today",
      body('.t-row:is([data-motion="hold"], [data-motion="out"]) .tick[data-state="done"] .tick-ring') === "background: var(--tick-c); border-color: var(--tick-c);" &&
        body('.t-row[data-accent="must"]') === "--tick-c: var(--must);" &&
        body('.t-row[data-accent="habit"]') === "--tick-c: var(--habit);" &&
        /--tick-c: var\(--kept\);/.test(body(".t-row")) &&
        /text-decoration: line-through;/.test(body('.t-row[data-variant="pile"] .row.done .r-name'))
    );
    const atLeast = (name: string, v: number | null, min: number) => check(`touch target: ${name} ≥ ${min}px`, v != null && v >= min, String(v));
    atLeast("a Done today row", cssValue(css, '.t-row[data-variant="pile"] .row', "min-height"), 52);
    atLeast("Done today's Show more", cssValue(css, ".today-done .done-more", "min-height"), 44);
    check(
      "Done today sits after the goals and above Inbox and Anytime (.o13 between .o9 and .o10) in the side column",
      /\.today-board \.o9 \{ order: 10; \} \.today-board \.o13 \{ order: 11; \} \.today-board \.o10 \{ order: 12; \} \.today-board \.o11 \{ order: 13; \}/.test(css) &&
        /<\/div>\s*<DonePile pile=\{pile\} open=\{doneOpen\} hidden=\{pileShown\.hidden\} onToggle=\{\(\) => setDoneOpen\(\(o\) => !o\)\} className="o13">\s*\{pileShown\.shown\.map\(renderPileRow\)\}\s*<\/DonePile>\s*<section className="card today-side-rows o10"/.test(boardSrc)
    );

    // ── Done today: its count, its order and its XP sum ──
    const iso = (h: number, mi = 0) => new Date(at(TODAY, h, mi)).toISOString();
    const tick = (id: string, when: string) => ({ id: `op-${id}`, kind: "complete" as const, templateId: id, day: TODAY, slot: 0, at: when });
    const dMeds = tpl({ id: "dp-meds", title: "Morning meds", compulsory: true, dueKind: "DEADLINE", dueDay: TODAY });
    const dRent = tpl({ id: "dp-rent", title: "Pay rent", compulsory: true, dueKind: "DEADLINE", dueDay: TODAY });
    const dCall = tpl({ id: "dp-call", title: "Call the landlord", dueKind: "PLANNED", dueDay: TODAY });
    const dThesis = tpl({ id: "dp-thesis", title: "Thesis outline", dueKind: "PLANNED", dueDay: TODAY });
    const dFloss = tpl({ id: "dp-floss", title: "Floss", recurrence: "DAILY" });
    const dRead = tpl({ id: "dp-read", title: "Read a chapter" });
    const data = board(TODAY, [dMeds, dRent, dCall, dThesis, dFloss, dRead]);
    const ticks = [tick("dp-meds", iso(8)), tick("dp-call", iso(9)), tick("dp-floss", iso(10)), tick("dp-read", iso(11))];
    const day = buildBoard(data, ticks);
    const all = [...day.must, ...day.todayRows, ...day.anytime];
    const pile = ui.donePileOf(all);
    const paidSum = Math.round(all.filter((r) => r.state === "done").reduce((s, r) => s + (r.paid && !r.paid.undone ? r.paid.xp : 0), 0) * 10) / 10;
    check(
      "Done today: every done row of the lanes and Anytime, latest first, its XP the sum of what each row's pill paid",
      pile.count === 4 &&
        pile.rows.map((r) => r.template.id).join() === "dp-read,dp-floss,dp-call,dp-meds" &&
        pile.xp === paidSum &&
        pile.xp > 0 &&
        pile.label === `Done today · 4 · +${paidSum.toFixed(1)} XP` &&
        pile.speech === `Done today: 4 tasks, ${paidSum.toFixed(1)} life XP`,
      `${pile.label} · ${pile.rows.map((r) => r.template.id).join()}`
    );
    const undone = { ...pile.rows[0], key: "x:undone", paid: pile.rows[0].paid ? { ...pile.rows[0].paid, undone: true } : null };
    const yesterdays = { ...pile.rows[1], key: "x:yesterday", lane: "yesterday" as const };
    check(
      "Done today: a row still folding out of its lane joins once it is out; yesterday's rows stay in Record yesterday; an undone payment adds nothing",
      ui.donePileOf(all, { leaving: (k) => k === pile.rows[0].key }).count === 3 &&
        ui.donePileOf([...all, yesterdays]).count === 4 &&
        ui.donePileOf([undone]).xp === 0 &&
        ui.donePileOf([undone]).count === 1
    );
    const workPile = ui.donePileOf(all, { work: true });
    check(
      "Done today (work tab): 'Done today · 4' — no XP in its label, its sum or its spoken form",
      workPile.label === "Done today · 4" && workPile.xp === 0 && workPile.speech === "Done today: 4 tasks" && !/XP/.test(workPile.label + workPile.speech)
    );
    const folded = ui.donePileShown(pile.rows, false);
    const opened = ui.donePileShown(pile.rows, true);
    check(
      "Done today: folded it shows the latest three (DONE_PILE_FOLDED), open every row",
      ui.DONE_PILE_FOLDED === 3 && folded.shown.length === 3 && folded.hidden === 1 && folded.shown[0] === pile.rows[0] && opened.shown.length === 4 && opened.hidden === 0
    );
    const pileHtml = renderToStaticMarkup(createElement(DonePile, { pile, open: false, hidden: 1, onToggle: () => {} }));
    const workHtml = renderToStaticMarkup(createElement(DonePile, { pile: workPile, open: false, hidden: 1, onToggle: () => {} }));
    check(
      "Done today rendered: its heading says 'Done today · n · +X XP' (spoken in full), Show n more says how many and what it controls; a work tab's says no XP; nothing at 0",
      pileHtml.includes(`<b>Done today</b><span class="done-figs num"> · ${pile.figures}</span>`) &&
        pileHtml.includes(`<span class="sr-only">${pile.speech}</span>`) &&
        /<button type="button" class="done-more" aria-expanded="false" aria-controls="done-today-rows">Show 1 more/.test(pileHtml) &&
        !/XP/.test(workHtml) &&
        renderToStaticMarkup(createElement(DonePile, { pile: ui.donePileOf([]), open: false, hidden: 0, onToggle: () => {} })) === ""
    );

    // ── Lanes keep their honest counts; a lane whose rows are all done says "All kept" ──
    const mustNow = ui.laneRowsOf(day.must, () => false);
    const bothMusts = buildBoard(data, [...ticks, tick("dp-rent", iso(12))]);
    const mustDone = ui.laneRowsOf(bothMusts.must, () => false);
    const mustLeaving = ui.laneRowsOf(bothMusts.must, (k) => k === bothMusts.must.find((r) => r.template.id === "dp-rent")?.key);
    check(
      "lanes: a done row leaves its lane but still counts ('1 of 2 kept', then '2 of 2'); with every row done the lane draws none and says All kept",
      mustNow.rows.map((r) => r.template.id).join() === "dp-rent" &&
        !mustNow.allDone &&
        laneTally(day.must).kept === 1 &&
        laneTally(day.must).total === 2 &&
        mustDone.allDone &&
        mustDone.rows.length === 0 &&
        laneTally(bothMusts.must).kept === 2 &&
        laneTally(bothMusts.must).total === 2 &&
        mustLeaving.rows.length === 1 &&
        !mustLeaving.allDone
    );
    check(
      "lanes (board): Must, Planned and Habits draw their open rows, 'All kept' (a work tab 'All done') once all are done, and keep laneTally's count; Planned and Habits wear their stamp too (never on a work tab: no stamp)",
      boardSrc.includes('const allKeptLine = <p className="lane-note lane-all">{isWork ? "All done" : "All kept"}</p>;') &&
        boardSrc.includes("{mustRows.allDone && hiddenMusts.length === 0 && allKeptLine}") &&
        boardSrc.includes("{plannedRows.allDone && allKeptLine}") &&
        boardSrc.includes("{habitRows.allDone && allKeptLine}") &&
        /count=\{planned\.length > 0 \? `\$\{plannedTally\.kept\} of \$\{plannedTally\.total\}` : undefined\}\s*kept=\{!isWork && !!shown\.snapshot\.planned\}/.test(boardSrc) &&
        /count=\{`\$\{habitTally\.kept\} of \$\{habitTally\.total\}`\}\s*kept=\{!isWork && !!shown\.snapshot\.habits\}/.test(boardSrc) &&
        boardSrc.includes("const plannedTally = laneTally(planned);") &&
        boardSrc.includes("{anytimeRows.rows.map(renderRow)}")
    );

    // ── A lane kept and the board clear: once per life day, after a tick ──
    const snap = (p: Partial<DaySnapshot> = {}): DaySnapshot => ({ kept: true, full: false, mustLane: false, rings: { musts: false, quest: false, life: false }, ...p });
    check(
      "moments: Planned and Habits kept, then the board clear, each on its false → true only (an undo re-opens silently)",
      ui.dayMomentsOf(snap(), snap({ planned: true })).join() === "planned-kept" &&
        ui.dayMomentsOf(snap({ planned: true }), snap({ planned: true, habits: true, clear: true })).join() === "habits-kept,board-clear" &&
        ui.dayMomentsOf(snap({ clear: true, planned: true }), snap()).length === 0 &&
        ui.dayMomentsOf(snap({ clear: true }), snap({ clear: true })).length === 0
    );
    check(
      "moments: one chime per tap, the loudest first (Full day, Board clear, a lane: Must first, the day kept, a ring)",
      ui.primaryMomentOf(["day-kept", "planned-kept", "board-clear"]) === "board-clear" &&
        ui.primaryMomentOf(["board-clear", "full-day"]) === "full-day" &&
        ui.primaryMomentOf(["habits-kept", "lane-kept"]) === "lane-kept" &&
        ui.primaryMomentOf(["ring-life", "day-kept"]) === "day-kept" &&
        ui.primaryMomentOf([]) === null
    );
    check(
      "board clear: needs a clear board with something done on it; its flag is per life day (a work tab's carries its id); its sentence says the count",
      !ui.boardClearOf({ clear: true, done: 0 }) &&
        !ui.boardClearOf({ clear: false, done: 3 }) &&
        ui.boardClearOf({ clear: true, done: 1 }) &&
        ui.boardClearKey(TODAY) === `board-clear:${TODAY}` &&
        ui.boardClearKey(TODAY, "wb1") === `board-clear:work:wb1:${TODAY}` &&
        ui.momentText("board-clear", { streak: 3, musts: 2, done: 5 }) === "Board clear: 5 done today." &&
        ui.momentText("planned-kept", { streak: 3, musts: 2 }) === "Planned lane kept."
    );
    check(
      "board clear: a T1 kind on the ladder ('board-clear'), its chime id 'board-clear:<day>' (a work tab's 'work:<id>:…'); every moment of a tap is marked fired, so each plays once per life day",
      (T1_KINDS as readonly string[]).includes("board-clear") &&
        KIND_TIER["board-clear"] === 1 &&
        boardSrc.includes("const idOf = (m: DayMoment) => `${ctx.workId ? `work:${ctx.workId}:` : \"\"}${m}:${ctx.today}`;") &&
        /const moments = all\.filter\(\(m\) => !firedMoments\.has\(idOf\(m\)\)\);\s*for \(const m of all\) firedMoments\.add\(idOf\(m\)\);/.test(boardSrc) &&
        /primary === "board-clear" \? "board-clear"/.test(boardSrc)
    );
    check(
      "board clear: the card shows once its tap played it (flag 'shown'), while the board stays clear, until OK ('dismissed'); it eases in only on that tap, never on arrival; never on a work tab",
      /if \(moments\.includes\("board-clear"\)\) \{\s*const key = boardClearKey\(ctx\.today, ctx\.workId\);\s*writeFlag\(key, "shown"\);/.test(boardSrc) &&
        /const clearView =\s*!isWork && shown\.snapshot\.clear && flags\?\.\[clearKey\] === "shown"/.test(boardSrc) &&
        boardSrc.includes('setFlag(clearKey, "dismissed");') &&
        boardSrc.includes("<BoardClearCard view={clearView} fresh={clearFresh} onDismiss={dismissClear} />") &&
        /\.today-clear\[data-fresh="1"\] \{ animation: today-clear-in/.test(css) &&
        !/animation/.test(body(".today-clear"))
    );
    check(
      "moments: a lane kept and the board clear follow a tick (not a defer, a skip or a move); a work tab plays none (the work skin, 2026-10-20)",
      boardSrc.includes('const TICK_MOMENTS: ReadonlySet<DayMoment> = new Set<DayMoment>(["lane-kept", "planned-kept", "habits-kept", "board-clear"]);') &&
        boardSrc.includes("const played = moments.filter((m) => ticked || !TICK_MOMENTS.has(m));") &&
        !/if \(isWork && ticked\)/.test(boardSrc) &&
        /if \(isWork \|\| Date\.now\(\) - actedAt\.current > MOMENT_WINDOW_MS\) return;/.test(boardSrc) &&
        /tickedAt\.current = actedAt\.current;/.test(boardSrc)
    );
    const view = ui.boardClearViewOf({ done: 5, lifeXp: 34.44, momentum: { run: 12, quests: 3, questsDone: 2 }, tomorrow: { title: "Book the dentist", more: 1 } });
    const workView = ui.boardClearViewOf({ done: 1, work: true, lifeXp: 9, momentum: { run: 3, quests: 3, questsDone: 1 }, tomorrow: { title: "x", more: 0 } });
    const clearHtml = renderToStaticMarkup(createElement(BoardClearCard, { view, onDismiss: () => {} }));
    check(
      "Board clear card: 'Board clear', the tasks done, the day's life XP, the run and the quests when live, and tomorrow's first thing; a work tab the tasks done only",
      view.lines.join(" | ") === "5 tasks done | +34.4 life XP today | Run 12 days · 2 of 3 quests | Tomorrow: Book the dentist · 1 more" &&
        workView.lines.join(" | ") === "1 task done" &&
        clearHtml.includes('<h2 id="board-clear-h">Board clear</h2>') &&
        clearHtml.includes("<li>+34.4 life XP today</li>") &&
        /aria-label="OK, put Board clear away for today"/.test(clearHtml) &&
        !/data-fresh/.test(clearHtml),
      view.lines.join(" | ")
    );
    check(
      "Board clear: tomorrow's first thing is a one-off planned for tomorrow, else a habit back tomorrow; nothing for later days",
      ui.firstTomorrowOf({ tomorrow: "2026-10-02", later: [{ title: "Dentist", day: "2026-10-02" }, { title: "Later", day: "2026-10-05" }], upcoming: [{ title: "Gym", next: "2026-10-02" }] })?.title === "Dentist" &&
        ui.firstTomorrowOf({ tomorrow: "2026-10-02", later: [{ title: "Dentist", day: "2026-10-02" }], upcoming: [{ title: "Gym", next: "2026-10-02" }] })?.more === 1 &&
        ui.firstTomorrowOf({ tomorrow: "2026-10-02", later: [], upcoming: [{ title: "Gym", next: "2026-10-02" }] })?.title === "Gym" &&
        ui.firstTomorrowOf({ tomorrow: "2026-10-02", later: [{ title: "Later", day: "2026-10-05" }], upcoming: [] }) === null
    );

    // ── The row: its motion, its compact form, its press; the live region; focus after it leaves ──
    const floss = day.todayRows.find((r) => r.template.id === "dp-floss")!;
    const rowHtml = (motion: import("../src/components/today/board-ui").RowMotion | null, variant?: "pile", work?: boolean) =>
      renderToStaticMarkup(
        createElement(TaskRow, {
          row: floss,
          projection: floss.projection,
          drawerOpen: false,
          undoable: true,
          busy: false,
          receiptOpen: false,
          receiptId: "r",
          onTick: () => {},
          onUndo: () => {},
          onToggleDrawer: () => {},
          onToggleReceipt: () => {},
          motion,
          variant,
          work,
        })
      );
    const held = rowHtml("hold");
    const piled = rowHtml(null, "pile");
    check(
      "TaskRow: a leaving row carries data-motion and its key; a Done today row is compact (data-variant pile) and a work tab's has no price; the title text sits in .r-name (the strike's width)",
      /^<div class="t-row"[^>]*data-row-key="dp-floss:2026-10-01"[^>]*data-motion="hold"/.test(held) &&
        /^<div class="t-row"[^>]*data-variant="pile"/.test(piled) &&
        !/data-motion/.test(piled) &&
        /<span class="r-name">Floss<\/span>/.test(piled) &&
        /class="price/.test(piled) &&
        !/class="price/.test(rowHtml(null, "pile", true)) &&
        /<div class="t-row-in">/.test(piled)
    );
    check(
      "TaskRow: the press is set on pointerdown and cleared on release, cancel or leave (never on a disabled tick); Done today folds a row's steps",
      /onPointerDown=\{pressOn\}\s*onPointerUp=\{pressOff\}\s*onPointerCancel=\{pressOff\}\s*onPointerLeave=\{pressOff\}/.test(rowSrc) &&
        /if \(!e\.currentTarget\.disabled\) e\.currentTarget\.dataset\.press = "1";/.test(rowSrc) &&
        /\{!pile && row\.steps && props\.onStep && row\.state !== "locked" && \(/.test(rowSrc)
    );
    check(
      "a tick: the live region still says 'Kept <title> · paid N exactly' (a work tab 'Done: <title>', and no mark: a calm check); the row then leaves its lane (yesterday's rows stay)",
      boardSrc.includes("text: `Kept ${row.template.title} · paid ${fmtXp(xp)} exactly`,") &&
        /if \(isWork\) \{\s*announce\(`Done: \$\{row\.template\.title\}`\);\s*return;\s*\}/.test(boardSrc) &&
        /markTick\(row, shown\.xp, from\);\s*if \(row\.lane !== "yesterday"\) leaveLane\(row\);\s*dispatch\(/.test(boardSrc)
    );
    check(
      "a tick's way out: held (TICK_MOTION.hold), then folding (out), then in Done today; at Still at once; its timers die with the board",
      /function leaveLane\(row: BoardRow\) \{\s*const key = row\.key;\s*const focus = refocusAfter\(key\);\s*const m = tickMotionOf\(motionLevel\(\), reducedMotion\(\)\);\s*if \(m\.hold \+ m\.out <= 0\) \{\s*if \(focus\) setRefocus\(focus\);\s*return;\s*\}/.test(boardSrc) &&
        /later\(\(\) => setExits\(\(e\) => \(e\[key\] === "hold" \? \{ \.\.\.e, \[key\]: "out" \} : e\)\), m\.hold\);/.test(boardSrc) &&
        /later\(\(\) => \{\s*setExits\(\(e\) => \(key in e \? without\(e, key\) : e\)\);[\s\S]*?if \(focus\) setRefocus\(focus\);\s*\}, m\.hold \+ m\.out\);/.test(boardSrc) &&
        /for \(const t of timers\) window\.clearTimeout\(t\);/.test(boardSrc)
    );
    check(
      "focus: only when it was on the row that left, it goes to the next row still in the lane (its tick, or its title while the tick waits), else the lane's heading (tabIndex -1), else Anytime's toggle",
      /if \(!el \|\| !\(active instanceof Node\) \|\| !el\.contains\(active\)\) return null;/.test(boardSrc) &&
        /next\.dataset\.state !== "done" && !next\.dataset\.motion/.test(boardSrc) &&
        /\(tick && !tick\.disabled \? tick : row\?\.querySelector<HTMLElement>\("\.r-open"\)\) \?\?\s*\(refocus\.lane \? document\.getElementById\(`lane-\$\{refocus\.lane\}`\) : null\) \?\?\s*\(refocus\.anytime \?/.test(boardSrc) &&
        /<h2 id="lane-planned" tabindex="-1">Planned<\/h2>/.test(renderToStaticMarkup(createElement(Lane, { id: "planned", title: "Planned" })))
    );
    check(
      "an Undo from Done today: the row unfolds back in its lane (enter, unless Still) and focus follows it to its title (P6 review: the board key u's too)",
      /setArrivals\(\(a\) => \(\{ \.\.\.a, \[key\]: "enter" \}\)\);/.test(boardSrc) &&
        /if \(focused \|\| byKey\) setRefocus\(\{ rowKey: key, lane: null, anytime: false \}\);/.test(boardSrc) &&
        /el\.style\.transition = "none";\s*el\.style\.gridTemplateRows = "0fr";\s*el\.style\.opacity = "0";\s*void el\.offsetHeight;\s*el\.style\.transition = "";\s*el\.style\.gridTemplateRows = "";/.test(rowSrc) &&
        /^transition: grid-template-rows 160ms var\(--ease-out\), opacity 160ms var\(--ease-out\);$/.test(body('.t-row[data-motion="enter"]'))
    );
    check(
      "ui-motion D10 records the user's decision (D10a: the tick's flourish and Done today; D10b: sound and haptics on by default)",
      /\| D10 \| Today stays calm at rest[^\n]*\*\*D10a \(the user's decision, 2026-10-15\)[^\n]*Done today[^\n]*\*\*D10b:\*\* Settings › Feedback defaults to Sound Soft and Haptics On/.test(lf(read("docs/life-plan/ui-motion.md")))
    );
  })().catch((err) => check("the tick's flourish and Done today: the checks ran", false, String(err)))
);

// ═══ Blueprint P15: the Main quest card in Today's side column (D11, D12) ═══
// The roadmap goal is the main quest; its milestone, this week's sprint and one link out sit above the goals (its key
// results). Read only: no Ask, no count, no tick, no Start while ROADMAP_GOALS_LIVE is off; the Sunday share is
// "provisional · final Wed 04:00", never a verdict.
{
  console.log("— P15: the Main quest card —");
  const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)?.slice(0, 400)}, want ${JSON.stringify(want)?.slice(0, 400)}`);
  const code = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const card = (over: Partial<AimCardView>): AimCardView => ({
    state: "ACTIVE",
    roadmapId: "rm1",
    hasKey: false,
    writesOff: false,
    goalsLive: false,
    aim: "Trade for a living",
    area: null,
    targetDay: "2027-06-30",
    aimChecked: true,
    over: false,
    draftItems: null,
    targetLowered: null,
    measuredAt: null,
    rank: null,
    proficiency: null,
    milestone: null,
    weekQuests: null,
    questWeekUnfrozen: false,
    reachedDay: null,
    doneDay: null,
    aimSuggestions: null,
    ...over,
  });
  type Ms = NonNullable<AimCardView["milestone"]>;
  const ms = (over: Partial<Ms>): Ms => ({ id: "ms2", ord: 2, of: 6, title: "Familiar with the basics", status: "STARTED", headline: null, percent: 42, pace: null, dueDay: "2026-11-08", reachedDay: null, countsFrom: null, start: null, ...over });
  const row = (over: Partial<MqRow> & Pick<MqRow, "ord" | "kind" | "label" | "count" | "unit">, progress: number): MqRow => ({
    evidence: "SELF_REPORTED",
    figure: { value: progress as never, caption: "" },
    done: false,
    dueLine: null,
    quotaLine: null,
    slipLine: null,
    seekTemplateId: null,
    place: null,
    href: null,
    ...over,
  });
  const week = (rows: MqRow[], over: Partial<MqWeekView> = {}): MqWeekView => ({
    milestoneId: "ms2",
    milestoneOrd: 2,
    milestoneOf: 6,
    milestoneTitle: "Familiar with the basics",
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    state: "OPEN",
    rows,
    done: rows.filter((r) => r.done).length,
    total: rows.length,
    level: 6,
    frozen: true,
    writesOff: false,
    basis: [],
    cappedBy: null,
    notes: [],
    ...over,
  });
  const WED = "2026-10-21" as DayKey;
  const SUN = "2026-10-25" as DayKey;
  const practice = row({ ord: 2, kind: "PRACTICE", label: "Backtest · 3 sessions × 30 min", count: 3, unit: "session", seekTemplateId: "hab1", place: "in Habits" }, 1);
  const raise = row({ ord: 1, kind: "RAISE", label: "Bring 3 cards to level 6+", count: 3, unit: "card", evidence: "TESTED" }, 1);
  const add = row({ ord: 3, kind: "ADD", label: "Add 5 cards to Risk Management", count: 5, unit: "card", evidence: "RECORDED", href: "/add?field=f1&domain=d1", parts: [{ domainId: "d1", name: "Risk Management" as never, count: 5, progress: 2, done: false }] }, 2);

  // The model: every state in neutral words; Start only while the switch is on (and on a server that writes).
  const planned = (goalsLive: boolean, writesOff = false) => mainQuestOf(card({ state: "ACCEPTED", goalsLive, writesOff, milestone: ms({ id: "ms1", ord: 1, status: "PLANNED", percent: null, dueDay: null }) }), week([practice]), WED);
  eq(
    "P15 mainQuestOf: a planned milestone reads 'Milestone 1 is planned.' with nothing to start while ROADMAP_GOALS_LIVE is off; 'ready to start' and startable only with it on and a server that writes; never a sprint before Start",
    [planned(false), planned(true), planned(true, true)].map((q) => [q.state, q.line, q.startable, q.sprint]),
    [["PLANNED", "Milestone 1 is planned.", false, null], ["PLANNED", "Milestone 1 is ready to start.", true, null], ["PLANNED", "Milestone 1 is planned.", false, null]]
  );
  eq(
    "P15 mainQuestOf: the other states' one line (draft, under way, past due, a pending reach, paused, done, an older plan, none)",
    [
      mainQuestOf(card({ state: "DRAFT", draftItems: 6 }), null, WED).line,
      mainQuestOf(card({ milestone: ms({}) }), null, WED).line,
      mainQuestOf(card({ state: "PAST_DUE", milestone: ms({ status: "PAST_DUE", dueDay: "2026-10-18" }) }), null, WED).line,
      mainQuestOf(card({ milestone: ms({ status: "PENDING_REACH", countsFrom: "2026-10-22" }) }), null, WED).line,
      mainQuestOf(card({ paused: { since: "2026-10-06" } }), null, WED).line,
      mainQuestOf(card({ state: "DONE", reachedDay: "2026-10-03" }), null, WED).line,
      mainQuestOf(card({ legacy: true }), null, WED).state,
      mainQuestOf(card({ state: "EMPTY", roadmapId: null }), null, WED).line,
      mainQuestOf(null, null, WED).state,
    ],
    [
      "A draft is waiting for your check · 6 items.",
      "42% of the way · due Sun 8 Nov",
      "Milestone 2 was due Sun 18 Oct: close or reschedule it.",
      "Reached · counts from Thu.",
      "Paused since 6 Oct.",
      "Reached 3 Oct.",
      "LEGACY",
      "No main quest yet.",
      "NONE",
    ]
  );
  const active = mainQuestOf(card({ label: "Trading", milestone: ms({}) }), week([raise, practice, add]), WED);
  check("P15 mainQuestOf: the goal's own name leads (else its aim); the sprint is its milestone's own, and another milestone's set is not", active.title === "Trading" && active.sprint?.milestoneId === "ms2" && mainQuestOf(card({ milestone: ms({ id: "other" }) }), week([practice]), WED).sprint === null);

  // The card: one link out, picked by the roadmap page's own priority over the sprint's open rows.
  const v = mainQuestCardOf(active, [raise, practice, add])!;
  // Re-pinned for the P15 review: the milestone travels as its head and its title with the title's provenance (the card
  // draws the chip and the strike), no longer one flat string.
  eq(
    "P15 card: 'Main quest', the quest, 'Milestone 2 of 6' and its title (with its class and struck spans), its line, 'This week's sprint · 0 of 3 done' mid-week, and the first open row by the roadmap's order (ADD first: it has somewhere to go)",
    v,
    {
      heading: MAIN_QUEST,
      aside: null,
      title: "Trading",
      milestone: { head: "Milestone 2 of 6", title: "Familiar with the basics", titleClass: null, titleStruck: [] },
      line: "42% of the way · due Sun 8 Nov",
      sprint: `${SPRINT} · 0 of 3 done`,
      action: { label: "Add 3 cards to Risk Management", href: "/add?field=f1&domain=d1" },
    }
  );
  // Re-pinned for the P15 review: on Today a same-page '#t-' link does nothing once the board has mounted (roadmap-events),
  // so a practice's or a step's row is a seek (the board's own find), never '/today#t-…'.
  const stepRow = row({ ord: 4, kind: "STEP", label: "Step: Write the trading plan", count: 1, unit: "step", seekTemplateId: "stp1" }, 0);
  const lostRow = row({ ord: 2, kind: "PRACTICE", label: "Backtest · 3 sessions × 30 min", count: 3, unit: "session" }, 1);
  eq(
    "P15 card: a practice or step row seeks its task on Today (never a '/today#t-' link); a Bring row (before it in the roadmap's order) the roadmap's week section, never /review; a practice with no task to seek goes to the roadmap's week, never a same-page /today link",
    [mainQuestCardOf(active, [practice])!.action, mainQuestCardOf(active, [stepRow])!.action, mainQuestCardOf(active, [raise, practice])!.action, mainQuestCardOf(active, [lostRow])!.action],
    [{ label: "Practise Backtest · 2 sessions", seek: "hab1" }, { label: "Write the trading plan", seek: "stp1" }, { label: "Review 2 cards", href: "/you/roadmap#week-quests" }, { label: "Practise Backtest · 2 sessions", href: "/you/roadmap#week-quests" }]
  );
  const anyAction = [raise, practice, add, stepRow, lostRow].flatMap((r) => [mainQuestCardOf(active, [r])?.action]).filter((a) => a != null);
  check("P15 card: no action is a link that stays on Today (/today, /today#…)", anyAction.every((a) => !("href" in a) || !/^\/today(?:$|[#?])/.test(a.href)), JSON.stringify(anyAction));
  const sundayQuest = mainQuestOf(card({ milestone: ms({}) }), week([raise, practice]), SUN);
  check("P15 card (D12): on the sprint's Sunday its share reads 'provisional · final Wed 04:00', never a verdict", mainQuestCardOf(sundayQuest, null)!.sprint === `${SPRINT} · 0 of 2 done · ${SPRINT_PROVISIONAL_LINE}` && !/\b(kept|missed|failed|verdict)\b/i.test(mainQuestCardOf(sundayQuest, null)!.sprint ?? ""));
  const off = mainQuestCardOf(planned(false), null)!;
  const on = mainQuestCardOf(planned(true), null)!;
  check(
    "P15 card: with ROADMAP_GOALS_LIVE off no Start anywhere ('Open roadmap'); on, 'Start milestone 1' links to the roadmap page's Now (Start itself stays there)",
    JSON.stringify(off.action) === JSON.stringify({ label: OPEN_ROADMAP_WORD, href: "/you/roadmap" }) && !/start/i.test(JSON.stringify(off)) && JSON.stringify(on.action) === JSON.stringify({ label: "Start milestone 1", href: "/you/roadmap#now" })
  );
  // Roadmap rework 1, P2 (ruling N28): a planned TOPICS layer's study is the card's one action while it is locked or Start is off.
  const study = { key: "T3", name: "Markov chains", domainId: "d1", fieldId: "f1", cards: 3, floor: 8, due: 4, layer: 1, geminiNamed: true };
  const plannedStudy = (goalsLive: boolean, locked: boolean, due = 4) => mainQuestOf(card({ state: "ACCEPTED", goalsLive, milestone: ms({ id: "ms1", ord: 1, status: "PLANNED", percent: null, dueDay: null, ...(locked ? { locked: true } : {}) }), study: { ...study, due } }), week([practice]), WED);
  eq(
    "N28 mainQuestOf: a planned layer carries its study while Start is off, or while the layer is locked even with Start live (startable false, 'is planned.'); with Start offered the study is null (Start is the action); never a sprint",
    [plannedStudy(false, false), plannedStudy(true, true), plannedStudy(true, false)].map((q) => [q.state, q.line, q.startable, q.study?.name ?? null, q.sprint]),
    [["PLANNED", "Milestone 1 is planned.", false, "Markov chains", null], ["PLANNED", "Milestone 1 is planned.", false, "Markov chains", null], ["PLANNED", "Milestone 1 is ready to start.", true, null, null]]
  );
  // Ruling N27 as the review round reads it: on a locked layer the server's study is the lock's first unmet parent (AimStudyView.locked), so the card's
  // action is the roadmap hero's own primary, "Add n cards to <parent>" to the add flow placed in that Domain.
  const lockedParent = mainQuestOf(card({ state: "ACCEPTED", goalsLive: true, milestone: ms({ id: "ms2", ord: 2, status: "PLANNED", percent: null, dueDay: null, locked: true }), study: { key: "T1", name: "Bayes rule", domainId: "d0", fieldId: "f1", cards: 5, floor: 8, due: 2, layer: 1, geminiNamed: false, locked: true } }), week([practice]), WED);
  eq(
    "N28 card: the one action is 'Study Markov chains · 3 of 8 · 4 due' to that Domain's review run (never the bare /review), with the Domain's name and its Gemini mark for the card to draw (the review round); 'Add an idea to Markov chains' to /add placed in the Domain with none due; a locked layer's study is the lock's parent and the action the hero's own, 'Add 3 cards to Bayes rule' to /add placed in that Domain (ruling N27); Start live and unlocked keeps 'Start milestone 1'",
    [mainQuestCardOf(plannedStudy(false, false), null)!.action, mainQuestCardOf(plannedStudy(true, true), null)!.action, mainQuestCardOf(plannedStudy(false, false, 0), null)!.action, mainQuestCardOf(lockedParent, null)!.action, mainQuestCardOf(plannedStudy(true, false), null)!.action],
    [
      { label: "Study Markov chains · 3 of 8 · 4 due", href: "/review?view=run&domain=d1", name: "Markov chains", geminiNamed: true },
      { label: "Study Markov chains · 3 of 8 · 4 due", href: "/review?view=run&domain=d1", name: "Markov chains", geminiNamed: true },
      { label: "Add an idea to Markov chains", href: "/add?field=f1&domain=d1", name: "Markov chains", geminiNamed: true },
      { label: "Add 3 cards to Bayes rule", href: "/add?field=f1&domain=d0", name: "Bayes rule", geminiNamed: false },
      { label: "Start milestone 1", href: "/you/roadmap#now" },
    ]
  );
  eq(
    "P15 card: no main quest — a quiet 'none yet' with 'Set a main quest', or nothing once the aim suggestions are off; a draft says 'Check the draft'",
    [mainQuestCardOf(mainQuestOf(card({ state: "EMPTY", roadmapId: null }), null, WED), null), mainQuestCardOf(mainQuestOf(card({ state: "EMPTY", roadmapId: null, aimSuggestions: false }), null, WED), null), mainQuestCardOf(mainQuestOf(card({ state: "DRAFT", draftItems: 0 }), null, WED), null)?.action?.label],
    [{ heading: MAIN_QUEST, aside: "none yet", title: null, milestone: null, line: "No main quest yet.", sprint: null, action: { label: SET_MAIN_QUEST_WORD, href: "/you/roadmap/new" } }, null, CHECK_DRAFT_WORD]
  );

  // The render: a labelled section, the kit's header, one 44 px link, no control that writes, never red. Imported here,
  // after the CSS stub: the title's chip (ProvenanceChip) brings the glyph kit, which imports its CSS (Node can't load it).
  // React marks the seams between adjacent text nodes with <!-- -->; the words are read without them.
  const text = (h: string) => h.replace(/<!-- -->/g, "");
  const gemini = mainQuestOf(card({ milestone: ms({ title: "Backtest 20 setups", titleClass: "DRAFT", titleStruck: [[9, 11]] }) }), null, WED);
  asyncChecks.push(
    (async () => {
  const { default: NodeModule } = await import("node:module");
  const ext = (NodeModule as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions;
  if (!ext[".css"]) ext[".css"] = (m) => void (m.exports = {});
  const { MainQuestCard } = await import("../src/components/today/MainQuestCard");
  const { MilestoneTitle } = await import("../src/components/today/MilestoneTitle");
  const html = text(renderToStaticMarkup(createElement(MainQuestCard, { view: v })));
  const offHtml = text(renderToStaticMarkup(createElement(MainQuestCard, { view: off })));
  // Ruling N28: the planned layer's study as the card's one link (the Domain's run), rendered.
  const studyHtml = text(renderToStaticMarkup(createElement(MainQuestCard, { view: mainQuestCardOf(plannedStudy(false, false), null) })));
  check(
    "N28 render: the card's one link is the Domain's run with the study line, the Domain's name a name with its pv.named mark (DomainName, 'named by Gemini' spoken: the review round), its milestone line 'Milestone 1 is planned.' kept, and nothing says Start",
    /<a class="mq-act" href="\/review\?view=run&amp;domain=d1"><span>Study <span data-wc="name" data-named="">Markov chains<span class="mg-nm" aria-hidden="true" data-pm="named">[\s\S]*?<span class="sr-only">named by Gemini<\/span><\/span> · 3 of 8 · 4 due<\/span>/.test(studyHtml) &&
      studyHtml.includes("Milestone 1 is planned.") &&
      !/start/i.test(studyHtml.replace(/Study/g, "")) &&
      (studyHtml.match(/<a /g) ?? []).length === 1,
    studyHtml.slice(0, 600)
  );
  check(
    "P15 render: a section labelled 'Main quest' (the kit's SectionHeader h2), data-wc-block, the quest's lines, the sprint with its flag, one link and nothing else to press",
    /^<section class="today-quest" aria-labelledby="main-quest-h" data-wc-block="main-quest"><div class="sec-h">[\s\S]*?<h2 id="main-quest-h">Main quest<\/h2>/.test(html) &&
      html.includes('<p class="mq-title">Trading</p>') &&
      html.includes('<p class="mq-ms">Milestone 2 of 6 · Familiar with the basics</p>') &&
      html.includes('<p class="mq-sprint">') &&
      (html.match(/<a\b/g) ?? []).length === 1 &&
      !/<button\b|<input\b|onClick/.test(html) &&
      renderToStaticMarkup(createElement(MainQuestCard, { view: null })) === "",
    html.slice(0, 300)
  );
  check("P15 render: never red, never a Start while the switch is off", !/owed|danger/.test(html + offHtml) && !/Start/.test(offHtml) && offHtml.includes(">Open roadmap<"));
  // The P15 review: a practice's row on Today is a seek button (the board's own find), with the link's look and size.
  const seekHtml = text(renderToStaticMarkup(createElement(MainQuestCard, { view: mainQuestCardOf(active, [practice]) })));
  const seekSrc = code(read("src/components/today/MainQuestSeek.tsx"));
  check(
    "P15 render: a practice's row is one 44 px seek button (type=button, .mq-act, its label and chevron), no link, no '#t-' anywhere; it calls roadmap-events seekTemplate and nothing else",
    /<button type="button" class="mq-act"><span>Practise Backtest · 2 sessions<\/span><svg/.test(seekHtml) &&
      !/<a\b|#t-/.test(seekHtml) &&
      (seekHtml.match(/<button\b/g) ?? []).length === 1 &&
      /^"use client";/.test(read("src/components/today/MainQuestSeek.tsx")) &&
      /onClick=\{\(\) => seekTemplate\(templateId\)\}/.test(seekSrc) &&
      /import \{ seekTemplate \} from "@\/components\/roadmap\/roadmap-events";/.test(seekSrc) &&
      !/completeTask|router|href/.test(seekSrc) &&
      /\{action &&\s*\("seek" in action \? \(\s*<MainQuestSeek label=\{action\.label\} templateId=\{action\.seek\} \/>/.test(code(read("src/components/today/MainQuestCard.tsx"))) &&
      /useEffect\(\(\) => onSeekTemplate\(/.test(code(read("src/components/today/TodayBoard.tsx"))),
    seekHtml.slice(-300)
  );
  // The P15 review (§22.11): a Gemini milestone title keeps its chip and its struck numbers wherever it is echoed.
  const geminiView = mainQuestCardOf(gemini, null)!;
  const geminiHtml = text(renderToStaticMarkup(createElement(MainQuestCard, { view: geminiView })));
  const keptHtml = text(renderToStaticMarkup(createElement(MilestoneTitle, { m: { head: "Milestone 2 of 6", title: "Read 3 books", titleClass: "KEPT_SUGGESTION", titleStruck: [[5, 6]] } })));
  const yoursHtml = text(renderToStaticMarkup(createElement(MilestoneTitle, { m: { head: "Milestone 2 of 6", title: "Read 3 books", titleClass: "YOURS", titleStruck: [] } })));
  check(
    "P15 render (§22.11): a Gemini milestone title on Today carries its chip ('Gemini suggestion · not checked') and its numbers struck, never rewritten; kept reads 'kept by you · not checked'; the user's own title carries none",
    gemini.milestone?.titleClass === "DRAFT" &&
      JSON.stringify(gemini.milestone?.titleStruck) === "[[9,11]]" &&
      geminiHtml.includes('<p class="mq-ms">Milestone 2 of 6 · Backtest <s>20</s> setups <span class="rm-pv rm-pv-draft mq-pv">Gemini suggestion · not checked</span></p>') &&
      keptHtml === 'Milestone 2 of 6 · Read <s>3</s> books <span class="rm-pv rm-pv-kept mq-pv">Gemini&#x27;s words · kept by you · not checked</span>' &&
      yoursHtml === "Milestone 2 of 6 · Read 3 books" &&
      mainQuestOf(card({ milestone: ms({ titleStruck: [[0, 3], [1, "x"] as never] }) }), null, WED).milestone?.titleStruck.length === 1,
    geminiHtml.slice(-260)
  );
    })()
  );
  const css = read("src/components/today/today.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const qcss = [...css.matchAll(/\.today-quest[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
  const qsizes = [...qcss.matchAll(/font:[^;]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  check(
    "P15 css: the link is a 44 px target; tokens only (no hex, rgb or named colour); no text under 12 px; every text line free to wrap at 344",
    (cssValue(css, ".today-quest .mq-act", "min-height") ?? 0) >= 44 &&
      qcss.length > 200 &&
      !/#[0-9a-f]{3,8}\b|rgba?\(|\b(?:white|black|red|green|blue)\b/i.test(qcss) &&
      qsizes.length >= 4 &&
      qsizes.every((n) => n >= 12) &&
      [".mq-title", ".mq-ms", ".mq-line", ".mq-sprint"].every((c) => new RegExp(`\\.today-quest \\${c} \\{[^}]*overflow-wrap: anywhere`).test(css))
  );
  const pvcss = [...css.matchAll(/\.mq-pv[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
  check(
    "P15 css (the review): the seek button wears the link's look (full width, no button chrome); the Gemini chip (.mq-pv) is tokens only, 12 px, a rim never a hue, free to wrap",
    /\.today-quest button\.mq-act \{[^}]*width: 100%;[^}]*border: 0;[^}]*border-top: 1px solid var\(--line-1\);[^}]*background: none;/.test(css) &&
      pvcss.length > 100 &&
      !/#[0-9a-f]{3,8}\b|rgba?\(|\b(?:white|black|red|green|blue|gold|owed)\b/i.test(pvcss) &&
      /\.mq-pv \{[^}]*font: 600 12px\/16px var\(--font-ui\);[^}]*overflow-wrap: anywhere;/.test(css) &&
      /\.mq-pv\.rm-pv-draft \{ border-color: var\(--line-ctl\); color: var\(--ink-0\); \}/.test(css) &&
      /\.mq-pv\.rm-pv-kept \{ border-color: var\(--ink-mute\); color: var\(--ink-2\); \}/.test(css)
  );

  // The page and the board: a slot like the strip, read in the one wave, never on a work tab, never a count or an Ask.
  const page = code(read("src/app/today/page.tsx"));
  const board = code(read("src/components/today/TodayBoard.tsx"));
  const wave = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(page)?.[1] ?? "";
  // Re-pinned for the P15 review: the main quest is main-quest-server's pick (the lowest seat whose milestone is under
  // way, else the lowest open seat) and its sprint that goal's own week, so a draft on seat 1 never hides seat 2's.
  check(
    "P15 page: loadMainQuestCard joins the one wave (a failure reads as no card), then the quest's own week (loadMainQuestWeek, reusing the strip's set when it is that one), mainQuestOf over them, the card handed to the board as a slot",
    /loadMainQuestCard\(userId, now\)\.catch\(\(\) => null\)/.test(wave) &&
      !/loadAimCard\b/.test(page) &&
      /import \{ loadMainQuestCard, loadMainQuestWeek \} from "@\/lib\/main-quest-server";/.test(page) &&
      /const questWeek = await loadMainQuestWeek\(userId, now, questCard, quests\?\.view \?\? null\)\.catch\(\(\) => null\);/.test(page) &&
      /const mainQuest = mainQuestOf\(questCard, questWeek, day\);/.test(page) &&
      /const mainQuestView = questCard \? mainQuestCardOf\(mainQuest, questWeek\?\.rows \?\? null\) : null;/.test(page) &&
      /mainQuest=\{mainQuestView \? <MainQuestCard view=\{mainQuestView\} \/> : null\}/.test(page) &&
      !/<AimCard\b|<AimLine\b|<WeekQuests\b/.test(page)
  );
  // The pick (lib/main-quest mainQuestPickOf over loadAimCards' cards, in seat order).
  const seat = (id: string, over: Partial<AimCardView>) => card({ roadmapId: id, ...over });
  const draft1 = seat("rm1", { state: "DRAFT", draftItems: 3 });
  const planned1 = seat("rm1", { state: "ACCEPTED", milestone: ms({ id: "ms1", ord: 1, status: "PLANNED", percent: null }) });
  const running2 = seat("rm2", { milestone: ms({ id: "ms9" }) });
  const pastDue2 = seat("rm2", { state: "PAST_DUE", milestone: ms({ id: "ms9", status: "PAST_DUE" }) });
  eq(
    "P15 pick: the lowest seat whose milestone is under way (a draft or a planned goal on seat 1 never hides seat 2's running sprint), else the lowest seat; none with no card",
    [
      mainQuestPickOf([draft1, running2])?.roadmapId,
      mainQuestPickOf([planned1, running2])?.roadmapId,
      mainQuestPickOf([planned1, pastDue2])?.roadmapId,
      mainQuestPickOf([running2, seat("rm3", { milestone: ms({ id: "ms7" }) })])?.roadmapId,
      mainQuestPickOf([draft1, planned1])?.roadmapId,
      mainQuestPickOf([seat("rm4", { paused: { since: "2026-10-06" }, milestone: ms({}) })])?.roadmapId,
      mainQuestPickOf([]),
      mainQuestPickOf(null),
    ],
    ["rm2", "rm2", "rm2", "rm2", "rm1", "rm4", null, null]
  );
  check(
    "P15 pick: under way is started, past due or reached (never planned, paused, a draft or an older plan)",
    milestoneUnderWay(running2) && milestoneUnderWay(pastDue2) && milestoneUnderWay(seat("r", { milestone: ms({ status: "PENDING_REACH" }) })) && !milestoneUnderWay(planned1) && !milestoneUnderWay(draft1) && !milestoneUnderWay(seat("r", { legacy: true, milestone: ms({}) })) && !milestoneUnderWay(seat("r", { paused: { since: "2026-10-06" }, milestone: ms({}) })) && !milestoneUnderWay(null)
  );
  const mqs = code(read("src/lib/main-quest-server.ts"));
  check(
    "P15 main-quest-server: the card is mainQuestPickOf(loadAimCards) (the cached cards /you shares); the week is the caller's lowest-seat set only when it is the card's milestone's, else loadWeekQuests with the goal's roadmapId; nothing when not under way; it writes nothing",
    /return mainQuestPickOf\(await loadAimCards\(userId, now\)\);/.test(mqs) &&
      /if \(!card \|\| !milestoneUnderWay\(card\) \|\| !card\.roadmapId \|\| !card\.milestone\) return null;/.test(mqs) &&
      /if \(lowest && lowest\.milestoneId === msId\) return lowest;/.test(mqs) &&
      /loadWeekQuests\(userId, now, \{ roadmapId: card\.roadmapId \}\)/.test(mqs) &&
      !/prisma|freeze|settle|create|update|upsert|delete/i.test(mqs.replace(/loadWeekQuests|loadAimCards|loadMainQuest\w*/g, ""))
  );
  const slot = board.split(/\r?\n/).filter((l) => /mainQuest/.test(l));
  check(
    "P15 board: the Main quest slot is only typed, received and drawn in c3's .o9 before the goals, never on a work tab",
    slot.length === 3 &&
      /^\s*mainQuest\?: ReactNode;\s*$/.test(slot[0]) &&
      // Re-pinned for blueprint P32: the props line now also takes the week's calibration slot (nextWeek), after it.
      /mainQuest = null(?:, nextWeek = null)? \}: Props\) \{\s*$/.test(slot[1]) &&
      /^\s*\{!isWork && mainQuest != null && mainQuest !== false && <div className="o9">\{mainQuest\}<\/div>\}\s*$/.test(slot[2]) &&
      board.indexOf("<div className=\"o9\">{mainQuest}</div>") > board.indexOf('<div className="c3">') &&
      board.indexOf("<div className=\"o9\">{mainQuest}</div>") < board.indexOf("<GoalsStrip"),
    slot.map((l) => l.trim()).join(" | ")
  );
  const quietFiles = ["src/components/today/board-ui.ts", "src/lib/today-board.ts", "src/lib/tasks.ts", "src/lib/notifications.ts"];
  const loud = quietFiles.filter((f) => /mainQuest|MainQuest|main-quest/.test(code(read(f))));
  check("P15: the counts, the Asks and the bell never read the main quest (board-ui, today-board, tasks, notifications)", loud.length === 0, loud.join(", "));
}

// Blueprint P31 (D35): a side quest's row on Today. Its due bit carries the side glyph and its words ("Side quest · expires
// Sat") in the due bit's own ink (no lane colour, no new hue); data-side marks it; the drawer says why it was offered.
// An ordinary deadline row is the control: its clock and "by Sat", no side mark anywhere.
{
  const sideTplOf = (over: Partial<BoardTemplate> = {}) => tpl({ id: "sq-walk", title: "20-minute walk", track: "BODY", dueDay: "2026-10-03", dueKind: "DEADLINE", captureKey: "side:body:week:2026-W40", note: "Body has 40 of 150 effort minutes this week. A 20-minute walk adds to them. Letting it expire costs nothing.", ...over });
  const b = buildBoard(board(TODAY, [sideTplOf(), tpl({ id: "sq-chore", title: "Vacuum", dueDay: "2026-10-03", dueKind: "DEADLINE" })]));
  const row = (id: string) => [...b.todayRows, ...b.anytime].find((r) => r.template.id === id)!;
  const html = (r: BoardRow) =>
    renderToStaticMarkup(
      createElement(TaskRow, { row: r, projection: r.projection, drawerOpen: false, undoable: false, busy: false, receiptOpen: false, receiptId: "rcpt", onTick: () => {}, onUndo: () => {}, onToggleDrawer: () => {}, onToggleReceipt: () => {} })
    );
  const side = html(row("sq-walk"));
  const chore = html(row("sq-chore"));
  check(
    "P31 TaskRow: a side quest's due bit is the side glyph and 'Side quest · expires Sat' (data-side), in the due bit's ink; the row wears no lane colour",
    /<div class="t-row"[^>]*data-side="1"/.test(side) &&
      /<span class="r-bit due" data-side="1"><svg class="i"[^>]*><use href="#i-side"><\/use><\/svg>Side quest · expires Sat<\/span>/.test(side) &&
      !/data-accent=/.test(/^<div class="t-row"[^>]*>/.exec(side)?.[0] ?? "x"),
    side.slice(0, 600)
  );
  check("P31 TaskRow: an ordinary deadline row is exactly as before (its clock and 'by Sat', no side mark)", /<use href="#i-clock"><\/use><\/svg>by Sat<\/span>/.test(chore) && !/data-side/.test(chore));
  const drawer = renderToStaticMarkup(
    createElement(TaskDrawer, {
      row: row("sq-walk"),
      now: at(TODAY, 9),
      today: TODAY,
      minutes: null,
      onMinutes: () => {},
      projection: row("sq-walk").projection,
      minimumProjection: null,
      busy: false,
      working: null,
      onDone: () => {},
      onMinimum: () => {},
      onSkip: () => {},
      onTomorrow: () => {},
      onAgain: () => {},
      onRename: () => {},
      onArchive: () => {},
      onOverride: () => {},
      onResize: () => {},
    })
  );
  check("P31 TaskDrawer: a side quest's drawer says why it was offered (its note), letting it expire costing nothing", /<p class="today-drawer-note" data-side="1">Body has 40 of 150 effort minutes this week\. A 20-minute walk adds to them\. Letting it expire costs nothing\.<\/p>/.test(drawer));
  check("P31 board: an open side quest never counts due on Today (the chore does)", b.counts.due === 1);
  // P31 review: put off past its expiry it would only be gone; and an open one asks nothing of the day's end either.
  const lastDay = "2026-10-03";
  const last = buildBoard(board(lastDay, [sideTplOf({ startDay: TODAY })]));
  const lastRow = [...last.todayRows].find((r) => r.template.id === "sq-walk")!;
  const drawerOn = (r: BoardRow, today: string) =>
    renderToStaticMarkup(
      createElement(TaskDrawer, {
        row: r, now: at(today, 9), today, minutes: null, onMinutes: () => {}, projection: r.projection, minimumProjection: null, busy: false, working: null,
        onDone: () => {}, onMinimum: () => {}, onSkip: () => {}, onTomorrow: () => {}, onAgain: () => {}, onRename: () => {}, onArchive: () => {}, onOverride: () => {}, onResize: () => {},
        onDefer: () => {}, onAbort: () => {}, noMonth: true,
      })
    );
  const lastDrawer = drawerOn(lastRow, lastDay);
  check(
    "P31 TaskDrawer: on a side quest's last day there is no Tomorrow pill, the refusal is said in its place, and there is never a Defer… (Abort… still drops it)",
    !/>Tomorrow</.test(lastDrawer) && /<p class="today-drawer-note">This side quest expires today, so it can&#x27;t move past that\. Letting it go costs nothing\.<\/p>/.test(lastDrawer) && !/Defer…/.test(lastDrawer) && /Abort…/.test(lastDrawer),
    lastDrawer.slice(0, 900)
  );
  check("P31 TaskDrawer: before its last day Tomorrow is still offered, and an ordinary row keeps its Defer…", />Tomorrow</.test(drawerOn(row("sq-walk"), TODAY)) && /Defer…/.test(drawerOn(row("sq-chore"), TODAY)));
  check(
    "P31 Close the day: an open side quest is never listed (it asks nothing of the day), before Duty and after; the chore is",
    [true, false].every((live) => { const items = closeItemsOf({ must: b.must, todayRows: b.todayRows, today: TODAY, live }); return !items.some((i) => i.key === row("sq-walk").key) && (live ? items.some((i) => i.key === row("sq-chore").key) : true); })
  );
}

// Blueprint P32 (D36): the week's calibration on Today, Mondays only ("This week"), in the side column above the Main
// quest. Only drawn: no Ask, no count, no row; a work tab never shows it; no rate and no target on Today (D17).
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const page = strip(read("src/app/today/page.tsx"));
  const boardSrc = strip(read("src/components/today/TodayBoard.tsx"));
  check(
    "P32 Today: the calibration card is read on Mondays only (no read on any other day, none while the audit is off) and passed as a node",
    /const nextWeekLoad = weekdayOf\(day\) === 1 \? loadNextWeek\(userId, now\)\.catch\(\(\) => null\) : Promise\.resolve\(null\);/.test(page) &&
      /nextWeek=\{nextWeek \? <NextWeekCard view=\{nextWeek\} title="This week" headingId="nw-today-h" \/> : null\}/.test(page)
  );
  check(
    "P32 TodayBoard: drawn in the side column above the Main quest, never on a work tab; buildBoard and the counts never see it",
    /\{!isWork && nextWeek != null && nextWeek !== false && <div className="o9">\{nextWeek\}<\/div>\}\s*(?:\{\}\s*)?\{!isWork && mainQuest != null/.test(boardSrc) &&
      !/nextWeek/.test(strip(read("src/lib/today-board.ts"))) &&
      !/nextWeek/.test(strip(read("src/components/today/board-ui.ts")))
  );
  const cw: CalibrationWeek = { weekKey: "2026-W43", monday: "2026-10-19", target: 85, daily: { kept: 6, due: 14, rows: [{ templateId: "gym", title: "Gym", kept: 2, due: 7 }, { templateId: "floss", title: "Floss", kept: 4, due: 7 }] }, tracked: [200, 180, 0, 160, 220, 60, null] };
  const prev: CalibrationWeek = { ...cw, weekKey: "2026-W42", monday: "2026-10-12", daily: { kept: 8, due: 14, rows: [{ templateId: "gym", title: "Gym", kept: 3, due: 7 }, { templateId: "floss", title: "Floss", kept: 5, due: 7 }] } };
  const cal = calibrationOf(cw, [prev], { declared: 300, musts: [{ templateId: "gym", title: "Gym", strength: 0.3, pending: false }, { templateId: "floss", title: "Floss", strength: 0.4, pending: false }], habits: [] })!;
  const view = nextWeekViewOf(cal, { capacity: 300, templates: [{ id: "gym", compulsory: true, archived: false, pendingNotMustDay: "2026-11-02" }, { id: "floss", compulsory: true, archived: false, pendingNotMustDay: null }] });
  const html = renderToStaticMarkup(createElement(NextWeekBody, { view, title: "This week", headingId: "nw-today-h", busy: false, error: null, done: {}, kept: new Set<string>(), onAccept: () => {}, onKeep: () => {} }));
  check(
    "P32 card on Today: 'This week · Week of 26 Oct', the lighter sizes, the capacity and Floss on offer (Accept / Keep), Gym already eased ('Not a must from Mon 2 Nov.')",
    html.includes('<h2 id="nw-today-h"') &&
      html.includes(">This week<") &&
      html.includes('<span class="aside">Week of 26 Oct</span>') &&
      html.includes('<p class="nw-sizes">Move 10 min · Finish any 2 tasks</p>') &&
      (html.match(/>Accept<\/button>/g) ?? []).length === 2 &&
      (html.match(/>Keep<\/button>/g) ?? []).length === 2 &&
      html.includes('<span class="nw-state" role="status">Not a must from Mon 2 Nov.</span>'),
    html.slice(0, 900)
  );
  check("P32 card on Today: no rate, no target, no '%' (D17: the audit's alone)", !/%|\b85\b/.test(html.replace(/Week of 26 Oct/, "")));
}

// The async checks (withMoments) settle before the tally.
void Promise.all(asyncChecks).then(() => {
  console.log(`\n${passed} passed, ${failed} failed${pendingCount > 0 ? `, ${pendingCount} PENDING (another lane's; --strict fails them)` : ""}`);
  if (failed > 0) process.exit(1);
});

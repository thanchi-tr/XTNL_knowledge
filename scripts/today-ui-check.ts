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
 *   npx tsx scripts/today-ui-check.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays, dayEndOf, dayKeyOf, dayStartOf, zonedToInstant, type DayKey } from "../src/lib/life-day";
import { parseCapture, shiftReverted, type KeyLike } from "../src/lib/capture-parse";
import { BAND_OVERRIDE_COOLDOWN_DAYS, selfRatingOpen, selfRatingOpensOn } from "../src/lib/life-grade";
import { normTitleOf } from "../src/lib/life-lexicon";
import { parseRule } from "../src/lib/recurrence";
import {
  UNDO_WINDOW_MS,
  buildBoard,
  canUndo,
  moveBlockOf,
  questOf,
  statsFor,
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
  tickLabelOf,
  todayLaneNote,
  tomorrowOffer,
  undoExpiryOf,
  upcomingOf,
} from "../src/components/today/board-ui";
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
  readCaptureFragment,
  recentChips,
  replaceCaretWord,
  replacingOf,
  splitPastedLines,
  stampLine,
  submitAllowed,
  summaryCopy,
  tagSuggestions,
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
  const cleared = questRingOf({ reviews: 3, target: 5, dueNow: 0 });
  check("full day: a clear queue meets the quest, honestly worded", cleared.met && cleared.caption === "3 of 5 · queue clear" && cleared.value === cleared.target, cleared.caption);
  const questFromBoard = questOf({ dayOpenQty: 40, reviews: 7, dueNow: 33, reviewXp: 20 });
  check("full day: the quest ring agrees with questOf's target", questRingOf({ reviews: questFromBoard.progress, target: questFromBoard.target, dueNow: questFromBoard.dueNow }).caption === "7 of 15");

  check("full day: no life deed yet", !lifeRingOf(0).met && lifeRingOf(0).caption === "0 of 1");
  check("full day: two deeds still read 1 of 1", lifeRingOf(2).met && lifeRingOf(2).caption === "1 of 1");
  check("full day: a workout (M4) is a life deed", lifeRingOf(0, 1).met);

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
  for (const f of ["src/components/today/ReceiptSheet.tsx", "src/components/today/InboxSheet.tsx", "src/components/today/CloseDaySheet.tsx"]) {
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
  check("rewards: the board presents the tick's, Again's and the goal's moments (T2/T3)", presents.length === 3 && boardSrc.includes('from "@/components/celebrate/stage"'), String(presents.length));
  check("streak caption: 'Kept today, 08:05.' from keptAtOf, with the plain line as its fallback", /keptAtOf\(current\)/.test(boardSrc) && boardSrc.includes("`Kept today, ${hhmmOf(") && boardSrc.includes('"Kept today."'));
  check("asks: the board passes the Ask's clock to the card", boardSrc.includes("clock={a.clock}") && read("src/components/today/AskCard.tsx").includes('<Icon name="clock"'));

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

// ── Source guards for the sheet (markup and CSS no function holds) ────────

{
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const quick = read("src/components/capture/QuickCapture.tsx");
  const css = strip(read("src/app/capture.css"));
  const chrome = read("src/components/shell/Chrome.tsx");
  const form = /<form className="capture-form" noValidate onSubmit=\{onFormSubmit\}>([\s\S]*?)<\/form>/.exec(quick)?.[1] ?? "";
  check("enter wiring: only the line sits in the form (no button inside, so any action key submits it)", form.includes("<input") && !form.includes("<button") && (form.match(/<input/g) ?? []).length === 1);
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
  check("vocab: the idea words load only for idea lines", quick.includes("loadCaptureVocabulary(withWords ? { words: true } : undefined)") && quick.includes("useWordComplete(ideaMode ?"));
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
  check("flash: the board seeks one capture at a time (so the sheet holds the last one)", /const \[seek, setSeek\] = useState<\{ id: string; at: number \} \| null>/.test(read("src/components/today/TodayBoard.tsx")));

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

// The async checks (withMoments) settle before the tally.
void Promise.all(asyncChecks).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});

/**
 * The Today board's and the capture sheet's view rules
 * (src/components/today/board-ui.ts, src/components/capture/capture-ui.ts
 * and layers.ts): what the board offers, when an Undo stops being on offer,
 * what the capacity tile may claim, where a new habit shows up, which layer
 * an Escape closes, where Tab goes in a modal, and which keys undo a capture.
 *
 * The redesign (Sigil & Slate, lane L1) adds: the Full-day rings
 * (src/lib/full-day.ts), Next up's priority, the Asks the board shows, the
 * Tier 1 moments a tap may fire, and "To Inbox".
 *
 * Plus source guards for the few rules that live only in markup and CSS
 * (touch-target sizes, the 12 px floor, no legacy tokens, the animated
 * properties, the sheets joining the Escape stack, one date in the top bar,
 * the tick as a checkbox). They read the files as text; nothing runs a
 * browser, a server or a database.
 *
 *   npx tsx scripts/today-ui-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, dayEndOf, dayKeyOf, dayStartOf, zonedToInstant, type DayKey } from "../src/lib/life-day";
import { parseCapture, type KeyLike } from "../src/lib/capture-parse";
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
import { QUEST_CAP, fullDayInputOf, fullDayOf, lifeDeedsOf, lifeRingOf, mustsRingOf, questRingOf } from "../src/lib/full-day";
import {
  closeDayProminent,
  dayMomentsOf,
  laneTally,
  nextUpOf,
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
  check("footer: the clock is live and prints its zone", page.includes("<LiveClock") && page.includes("zone={clock.zone}"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

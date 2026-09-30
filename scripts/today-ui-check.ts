/**
 * The Today board's and the capture sheet's view rules
 * (src/components/today/board-ui.ts, src/components/capture/capture-ui.ts
 * and layers.ts): what the board offers, when an Undo stops being on offer,
 * what the capacity tile may claim, where a new habit shows up, which layer
 * an Escape closes, where Tab goes in a modal, and which keys undo a capture.
 *
 * Plus source guards for the few rules that live only in markup and CSS
 * (touch-target sizes, the corner button's layer, one date in the header,
 * no aria-pressed on the tick). They read the files as text; nothing runs a
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
import { isUndoCaptureKey, nextOccurrenceNote } from "../src/components/capture/capture-ui";
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

// ── Source guards: markup and CSS rules no function holds ─────────────────

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

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
  const today = read("src/components/today/today.css");
  const capture = read("src/app/capture.css");
  const atLeast = (name: string, v: number | null, min: number) => check(`touch target: ${name} ≥ ${min}px`, v != null && v >= min, String(v));
  atLeast(".today-tick height", cssValue(today, ".today-tick", "height"), 44);
  atLeast(".today-pill min-height", cssValue(today, ".today-pill", "min-height"), 40);
  atLeast(".today-more width", cssValue(today, ".today-more", "width"), 44);
  atLeast(".today-undo (Minimum, inline Undo) min-height", cssValue(today, ".today-undo", "min-height"), 40);
  atLeast(".today-band min-height", cssValue(today, ".today-band", "min-height"), 40);
  atLeast(".today-toast-action min-height", cssValue(today, ".today-toast-action", "min-height"), 44);
  atLeast(".today-inline-link min-height", cssValue(today, ".today-inline-link", "min-height"), 40);
  atLeast(".capture-toast-action min-height", cssValue(capture, ".capture-toast-action", "min-height"), 44);
  atLeast(".capture-close min-height", cssValue(capture, ".capture-close", "min-height"), 40);
  atLeast(".capture-idea-link min-height", cssValue(capture, ".capture-idea-link", "min-height"), 40);
  atLeast(".capture-chip min-height on touch", cssValue(capture, ".capture-chip", "min-height", "@media (pointer: coarse)"), 40);
  const fab = cssValue(capture, ".capture-fab", "z-index");
  const sheet = cssValue(capture, ".capture-sheet", "z-index");
  check("layers: the corner button sits below pickers (30) and dialogs", fab != null && fab < 30 && sheet != null && fab < sheet, `fab ${fab}, sheet ${sheet}`);

  const row = read("src/components/today/TaskRow.tsx");
  const tickButton = row.slice(row.indexOf('className="today-tick"'), row.indexOf("</button>", row.indexOf('className="today-tick"')));
  check("a11y: the tick has no aria-pressed", !tickButton.includes("aria-pressed"));
  check("a11y: the XP button says whether its receipt is open, and which", row.includes("aria-expanded={props.receiptOpen}") && row.includes("aria-controls={props.receiptOpen ? props.receiptId : undefined}"));
  const boardSrc = read("src/components/today/TodayBoard.tsx");
  check("a11y: the receipt panel carries the id the XP button points at", /<ReceiptPopover[\s\S]*?id=\{receiptId\}/.test(boardSrc));
  check("phone: the first-run hint names the + button", boardSrc.includes("Tap the green + at the bottom left"));
  check(
    "undo: Archive and Drop both show an Undo, and Undo is unarchiveTask",
    /function archive[\s\S]*?remove\(/.test(boardSrc) && /choice === "drop"[\s\S]*?remove\(/.test(boardSrc) && /function undoRemoval[\s\S]*?unarchiveTask\(/.test(boardSrc)
  );
  check("day: a tick sends the row's own day, not 'today'/'yesterday'", /completeTask\(row\.template\.id, \{ day: row\.day/.test(boardSrc));
  check("capture: a save sends its line's nonce as the retry key", read("src/components/capture/QuickCapture.tsx").includes("captureKey: line.nonce"));
  for (const f of ["src/components/today/ReceiptPopover.tsx", "src/components/today/InboxSheet.tsx", "src/components/capture/QuickCapture.tsx"]) {
    const src = read(f);
    check(`escape: ${f.split("/").pop()} joins the layer stack, no document listener of its own`, src.includes("pushEscapeLayer(") && !/document\.addEventListener\("keydown"/.test(src));
  }
  const page = read("src/app/today/page.tsx");
  check("header: the date is printed once", (page.match(/clock\.date/g) ?? []).length === 1);
  check("header: the clock is live", page.includes("<LiveClock"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

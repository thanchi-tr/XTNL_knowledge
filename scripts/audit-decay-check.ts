/**
 * The weekly audit's "Decaying this week" and its delivery (docs/life-plan/blueprint-plan-2026-10-22.md P12; blueprint
 * 5.2c and 5.2e; decision D37), behind AUDIT_LAUNCH_DAY like the audit itself (P11).
 *
 *   §1 the sources, each read from what the app keeps and never applied: a trait below its score at the 7-day
 *      FieldSnapshot (rows before LEVEL_RULE_SINCE ignored without error), a Field or a Domain that fell this week, a
 *      habit whose strength fell or dropped a rung, a kept-week run the week's judge ended (a held week bridges it),
 *      the ideas past grace, mastery points lost to idle decay;
 *   §2 the block: its order, the caps per kind and in all, the count uncapped, the parts that couldn't be read;
 *   §3 the words (neutral, each line a link to its fix) and the stored shape read back;
 *   §4 the frozen copy keeps the decay it was frozen with (a P11 copy without it reads none);
 *   §5 the card: the block's rows are its only links (44 px or more), tokens only;
 *   §6 "Week audit ready" on Today: an Ask on the plan card, naming the week only (the 85% stays on the audit, D17);
 *   §7 the server reads only (no write, no decay applied), each part soft; inert while AUDIT_LAUNCH_DAY is null;
 *   §8 the phone: `week.decaying`, the Sunday 19:00 Sydney reminder's wiring (local, no push), and the package.
 *
 * Pure: no database, no clock, no model. The bell's row and its count are shell-check's; the phone's reply is
 * mobile-api-check's; the reminder's clock is the Android app's AuditAlarmTest.
 *
 *   npx tsx scripts/audit-decay-check.ts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DayKey } from "../src/lib/life-day";
import { ATTRIBUTES, emptyComposition, type AttributeScores, type Composition } from "../src/lib/attributes";
import { LEVEL_RULE_SINCE } from "../src/lib/xp";
import { emptyLifeLedger, keptWeekBonusPercent, trackStateAt, type LifeLedger } from "../src/lib/life-tracks";
import {
  DECAY_KINDS,
  DECAY_PER_KIND,
  DECAY_SHOWN,
  DECAY_TOP,
  LAST_WEEK_ANCHOR,
  TRAIT_LOOKBACK_DAYS,
  decayHeading,
  decayMoreOf,
  decayingOf,
  dropLinesOf,
  habitLinesOf,
  ideaLinesOf,
  mpLinesOf,
  parseDecaying,
  snapshotThenOf,
  streakLinesOf,
  streakWeekOf,
  traitLinesOf,
  traitScoresOf,
  traitSinceOf,
  type AuditDecaying,
  type DecayLine,
  type TraitField,
} from "../src/lib/audit-decay";
import { AUDIT_LAUNCH_DAY, auditEventInput, auditReadyNotices, frozenAuditOf, parseAuditReceipt, weekAuditOf, type AuditTemplate } from "../src/lib/week-audit";
import { checkDecayingOf, checkWeekOf } from "../src/lib/mobile-api";
import { askHostOf, todayAsksOf, WEEK_AUDIT_HREF } from "../src/components/today/board-ui";
import { WeekAuditCard } from "../src/components/home/WeekAudit";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, g === w ? "" : `got ${g}, want ${w}`);
}

const comp = (parts: Partial<Composition>): Composition => ({ ...emptyComposition(), ...parts });
const scores = (parts: Partial<AttributeScores>): AttributeScores => ({ ...(emptyComposition() as AttributeScores), ...parts });

// ═══ §1 The sources ═══════════════════════════════════════════════════════

console.log("— §1 the sources —");
check("traits are measured against the snapshot 7 days back (UTC days, as FieldSnapshot rows are dated)", TRAIT_LOOKBACK_DAYS === 7 && traitSinceOf(new Date("2026-10-25T08:00:00Z")) === "2026-10-18" && traitSinceOf(new Date("2026-10-26T17:15:00Z")) === "2026-10-19");
const snaps = [
  { day: "2026-10-08", level: 40 },
  { day: "2026-10-10", level: 38 },
  { day: "2026-10-12", level: 6 },
  { day: "2026-10-14", level: 7 },
];
eq(
  "acceptance: FieldSnapshot rows before 2026-10-11 (the old Σ L^0.75 level) are ignored without error; the earliest on or after the window is used; none reads null",
  [LEVEL_RULE_SINCE, snapshotThenOf(snaps, "2026-10-07")?.day, snapshotThenOf(snaps, "2026-10-13")?.day, snapshotThenOf(snaps.slice(0, 2), "2026-10-01"), snapshotThenOf([], "2026-10-15"), snapshotThenOf([{ day: "2026-10-16", level: NaN }], "2026-10-15")],
  ["2026-10-11", "2026-10-12", "2026-10-14", null, null, null]
);
const logicField = (thenLevel: number | null, breadth = 8, fieldLevel = 4): TraitField => ({ name: "Formal logic", breadth, fieldLevel, thenLevel, composition: comp({ LOGIC: 60, ABSTRACT: 40 }) });
const fell = traitScoresOf([logicField(5)], { then: [], now: [] });
eq("a Field that stood at L5 a week ago and reads L4 now: its breadth then is scaled (breadthAsOf), and its traits fall", [fell.then.LOGIC, fell.now.LOGIC, fell.then.ABSTRACT, fell.now.ABSTRACT], [6, 4.8, 4, 3.2]);
eq("…as trait lines, the largest fall first, each opening its trait's page", traitLinesOf(fell).map((l) => [l.title, l.href, l.action]), [["Logic 6.0 → 4.8", "/skills/logic", "Open"], ["Abstract 4.0 → 3.2", "/skills/abstract", "Open"]]);
check("a Field with no snapshot reads as now (no line), and so does one that rose", traitLinesOf(traitScoresOf([logicField(null)], { then: [], now: [] })).length === 0 && traitLinesOf(traitScoresOf([logicField(3)], { then: [], now: [] })).length === 0);
check("a fall that rounds away at one decimal is no line (41.24 → 41.21)", traitLinesOf({ then: scores({ LOGIC: 41.24 }), now: scores({ LOGIC: 41.21 }) }).length === 0 && traitLinesOf({ then: scores({ LOGIC: 41.26 }), now: scores({ LOGIC: 41.21 }) }).length === 1);
check(
  "the life rows join both ends (a track's attribute bonus lost is a trait's fall too)",
  traitLinesOf(traitScoresOf([], { then: [{ fieldName: "Life · Body", level: 5.6, composition: comp({ PHYSICAL: 100 }), source: "LIFE" }], now: [{ fieldName: "Life · Body", level: 5, composition: comp({ PHYSICAL: 100 }), source: "LIFE" }] }))[0]?.title === "Physical 5.6 → 5.0"
);

const drops = dropLinesOf([
  { kind: "domain", id: "d1", name: "Probability", fieldId: "f1", level: 3, droppedFrom: 4, fading: 2 },
  { kind: "field", id: "f1", name: "Statistics", fieldId: "f1", level: 5, droppedFrom: 6, fading: 0 },
  { kind: "domain", id: "d2", name: "Sets", fieldId: "f1", level: 4, droppedFrom: 4, fading: 1 },
  { kind: "domain", id: "d3", name: "Graphs", fieldId: "f2", level: 1, droppedFrom: 3, fading: 1 },
]);
eq(
  "drops: the Fields first, then the Domains (the biggest fall first); a level already won back is no line",
  drops.map((l) => [l.key, l.title, l.href]),
  [
    ["field:f1", "Statistics field fell to L5 (from L6)", "/library/field/f1"],
    ["domain:d3", "Graphs fell to L1 (from L3)", "/library/field/f2"],
    ["domain:d1", "Probability fell to L3 (from L4)", "/library/field/f1"],
  ]
);
eq("…with the ideas fading in it, and what brings the level back", [drops[2].detail, drops[1].detail, drops[0].detail], ["2 ideas fading in it. Reviewing them brings the level back.", "1 idea fading in it. Reviewing it brings the level back.", "Its ideas count for less until they are reviewed."]);
eq("ideas past grace: one line opening Review; none at 0", [ideaLinesOf({ fading: 4, forgetting: 1 }).map((l) => [l.title, l.href, l.action]), ideaLinesOf({ fading: 0, forgetting: 0 })], [[["5 ideas fading", "/review", "Review"]], []]);

const habits = habitLinesOf([
  { id: "h-gym", title: "Gym", before: 0.62, after: 0.58 },
  { id: "h-read", title: "Read", before: 0.4, after: 0.36 },
  { id: "h-floss", title: "Floss", before: 0.301, after: 0.297 },
  { id: "h-walk", title: "Walk", before: 0.5, after: 0.55 },
  { id: "h-new", title: "Yoga", before: 0.904, after: 0.88 },
]);
eq(
  "habits: a whole-point fall or more, those that dropped a rung first (Established → Forming, Automatic → Established), then the largest fall; a rise or a fraction of a point is no line",
  habits.map((l) => l.title),
  ["Gym: Established → Forming", "Yoga: Automatic → Established", "Read weakened"]
);
eq("…each says its strength and opens its card on Tasks › Habits", [habits[0].detail, habits[0].href], ["Strength 62% → 58% this week. Each kept day raises it again.", "/today/habits#h-gym"]);

// The kept-week runs, read from a real ledger: four kept Body weeks, then the week of 12 October missed (judged
// Wednesday 21 October, inside the audited week of 19 October); Care's week of 12 October held (a rest week).
const week = (track: "BODY" | "CARE", weekKey: string, sunday: DayKey, mark: "kept" | "held" | "missed") => ({ track, weekKey, sunday, kept: mark === "kept", held: mark === "held", detail: "" });
const ledger: LifeLedger = {
  ...emptyLifeLedger("2026-09-01"),
  weeks: [
    ...([["2026-W38", "2026-09-20"], ["2026-W39", "2026-09-27"], ["2026-W40", "2026-10-04"], ["2026-W41", "2026-10-11"]] as const).flatMap(([k, s]) => [week("BODY", k, s, "kept"), week("CARE", k, s, "kept")]),
    week("BODY", "2026-W42", "2026-10-18", "missed"),
    week("CARE", "2026-W42", "2026-10-18", "held"),
  ],
};
const judged = streakWeekOf("2026-10-19", "2026-10-25");
const run = (day: DayKey) => trackStateAt(ledger, day).map((s) => ({ track: s.track, keptStreak: s.keptStreak }));
const streaks = judged ? streakLinesOf({ before: run("2026-10-11"), after: run(judged), sunday: judged }) : [];
check("the week judged inside the audited one: the Sunday before its Monday, once its Wednesday has come (none before)", judged === "2026-10-18" && streakWeekOf("2026-10-19", "2026-10-20") === null && streakWeekOf("2026-10-19", "2026-10-21") === "2026-10-18");
eq(
  "streaks: Body's 4-week run ended by the missed week (its fix: the Last week card, the judged week's reasons); Care's held week bridges its run (no line)",
  streaks.map((l) => [l.key, l.title, l.href]),
  [["streak:BODY", "Body: 4 kept weeks in a row ended", "/today/week#last-week"]]
);
eq("…naming the week and the trait bonus it took (keptWeekBonusPercent)", [streaks[0]?.detail, Number(keptWeekBonusPercent(4).toFixed(1))], ["The week of 12 Oct was not kept, so its +13.2% to the traits is gone. A kept week starts the run again.", 13.2]);
eq("mastery points: the week's idle decay as one line (the debits only); none when nothing was taken", [mpLinesOf([{ delta: -1.25 }, { delta: -1.19 }, { delta: 3 }]).map((l) => [l.title, l.detail, l.href]), mpLinesOf([]), mpLinesOf([{ delta: 0 }])], [[["2.44 MP to idle decay", "2 days of it this week: unspent points erode while an emblem they could already buy waits.", "/skills"]], [], []]);

// ═══ §2 The block ═════════════════════════════════════════════════════════

console.log("— §2 the block —");
const many = decayingOf({
  traits: { then: scores(Object.fromEntries(ATTRIBUTES.map((a) => [a, 10]))), now: scores(Object.fromEntries(ATTRIBUTES.map((a, i) => [a, 9 - i * 0.1]))) },
  drops: [
    { kind: "domain", id: "d1", name: "A", fieldId: "f", level: 1, droppedFrom: 2, fading: 0 },
    { kind: "domain", id: "d2", name: "B", fieldId: "f", level: 1, droppedFrom: 2, fading: 0 },
    { kind: "domain", id: "d3", name: "C", fieldId: "f", level: 1, droppedFrom: 2, fading: 0 },
    { kind: "domain", id: "d4", name: "D", fieldId: "f", level: 1, droppedFrom: 2, fading: 0 },
  ],
  ideas: { fading: 3, forgetting: 0 },
  mp: [{ delta: -1 }],
  streaks: { before: [{ track: "BODY", keptStreak: 2 }], after: [{ track: "BODY", keptStreak: 0 }], sunday: "2026-10-18" },
  unread: 1,
});
// Re-pinned for blueprint P28: an idle attribute's condition is its own kind, before the traits it lowers (read only while
// DECAY_LAUNCH_DAY is in force; this fixture has none, so its lines are as before).
eq(
  "order (a run ended, a level lost, a habit, the ideas, a condition (P28), the traits, MP), at most 3 of a kind and 8 in all; the count is everything found",
  [DECAY_KINDS, DECAY_PER_KIND, DECAY_SHOWN, many.lines.map((l) => l.kind), many.count, many.unread],
  [["streak", "field", "domain", "habit", "ideas", "condition", "trait", "mp"], 3, 8, ["streak", "domain", "domain", "domain", "ideas", "trait", "trait", "trait"], 1 + 4 + 1 + 13 + 1, 1]
);
eq("the block's lines are unique", new Set(many.lines.map((l) => l.key)).size, many.lines.length);
eq("nothing read: an empty block (count 0), and the parts that failed are counted", [decayingOf({}), decayingOf({ unread: 2 }).unread], [{ count: 0, lines: [], unread: 0 }, 2]);

// ═══ §3 The words ═════════════════════════════════════════════════════════

console.log("— §3 the words —");
eq("the heading counts what fell", [decayHeading(many), decayHeading({ count: 0 })], ["Decaying this week · 20", "Decaying this week"]);
eq(
  "under the lines: what is not shown, what couldn't be read, or that nothing fell (said, never guessed)",
  [decayMoreOf(many), decayMoreOf({ count: 0, lines: [], unread: 0 }), decayMoreOf({ count: 0, lines: [], unread: 1 }), decayMoreOf({ count: 1, lines: ideaLinesOf({ fading: 1, forgetting: 0 }), unread: 0 })],
  ["12 more not shown. 1 source couldn't be read.", "Nothing fell this week.", "Nothing found in what could be read. 1 source couldn't be read.", null]
);
const allLines: DecayLine[] = [...many.lines, ...drops, ...habits, ...streaks, ...traitLinesOf(fell), ...mpLinesOf([{ delta: -1 }])];
const bad = allLines.flatMap((l) => [l.title, l.detail]).find((w) => /\bfail|\bbad\b|\bpoor|\blazy|shame|\bbehind\b|do better|!/i.test(w));
check("neutral words (harm H12): no fail, bad, poor, lazy, shame, behind, do better, and no '!'", bad === undefined, bad ?? "");
check("each line links to its fix: an in-app path and an action word", allLines.every((l) => l.href.startsWith("/") && !l.href.startsWith("//") && /^(Open|Review|See|Unlock)$/.test(l.action)));
const stored = parseDecaying(JSON.parse(JSON.stringify(many)));
check("the stored block reads back as written", JSON.stringify(stored) === JSON.stringify(many));
eq(
  "a stored block this version can't read is none; a line that is not one (an outside link, an unknown kind) is dropped, the count kept",
  [parseDecaying(null), parseDecaying({ count: -1, lines: [], unread: 0 }), parseDecaying({ count: 2, lines: [{ ...many.lines[0], href: "https://example.com" }, { ...many.lines[1], kind: "boss" }, many.lines[2]], unread: 0 })?.lines.map((l) => l.key), parseDecaying({ count: 2, lines: [], unread: 0 })?.count],
  [null, null, [many.lines[2].key], 2]
);

// ═══ §4 The frozen copy keeps its decay ═══════════════════════════════════

console.log("— §4 the frozen copy —");
const T = (id: string, over: Partial<AuditTemplate> = {}): AuditTemplate => ({
  id, title: id, kind: "HABIT", recurrence: "DAILY", startDay: "2026-10-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null, ...over,
});
const W43 = { weekKey: "2026-W43", monday: "2026-10-19", sunday: "2026-10-25" };
const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];
const MONDAY = "2026-10-26";
const turn = new Date("2026-10-25T17:15:00Z");
const frozenWith = (decaying: AuditDecaying | null) =>
  weekAuditOf({ week: W43, launchDay: "2026-10-19", templates: [T("gym")], instances: days.map((d) => ({ templateId: "gym", day: d, status: "DONE" })), decaying, today: MONDAY, now: turn });
const live = frozenWith(many);
const input = auditEventInput(live, MONDAY, turn);
const copy = parseAuditReceipt(JSON.parse(JSON.stringify(input.receipt)));
check("the copy stores the decay it was frozen with (receipt.decaying), and reads it back unchanged", copy !== null && JSON.stringify(copy.decaying) === JSON.stringify(many) && JSON.stringify(frozenAuditOf(copy, MONDAY, "2026-10-19").decaying) === JSON.stringify(many));
check("…still a v1 receipt (decaying is optional), with no pay: sink NONE, xp 0", (input.receipt as unknown as { v: number }).v === 1 && input.sink === "NONE" && input.xp === 0);
const p11 = { ...(JSON.parse(JSON.stringify(input.receipt)) as Record<string, unknown>) };
delete p11.decaying;
const old = parseAuditReceipt(p11);
check("a copy frozen without it (P11) reads, with no decay block (null), never an empty one", old !== null && old.decaying === null && frozenAuditOf(old, MONDAY, "2026-10-19").decaying === null);
check("a live read without the decay read hands the card none (null)", frozenWith(null).decaying === null && weekAuditOf({ week: W43, launchDay: "2026-10-19", templates: [], instances: [], today: MONDAY, now: turn }).decaying === null);

// ═══ §5 The card ══════════════════════════════════════════════════════════

console.log("— §5 the card —");
const small = decayingOf({ drops: [{ kind: "domain", id: "d1", name: "Probability", fieldId: "f1", level: 3, droppedFrom: 4, fading: 2 }], ideas: { fading: 1, forgetting: 0 } });
const card = renderToStaticMarkup(createElement(WeekAuditCard, { audit: { ...live, decaying: small }, today: MONDAY }));
const links = [...card.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1]);
check(
  "the card lists 'Decaying this week · 2', each line a link to its fix with its action word",
  card.includes('<p class="t-eyebrow wa-weak-h">Decaying this week · 2</p>') &&
    card.includes('<ul class="wa-decay" aria-label="Decaying this week">') &&
    card.includes('<a class="wa-decay-row" href="/library/field/f1"><span class="wa-decay-txt"><span class="wa-decay-title">Probability fell to L3 (from L4)</span>') &&
    card.includes('<span class="wa-decay-act">Review</span>'),
  card.slice(card.indexOf("Decaying"))
);
eq("…the decay rows are the card's only links (and it has no button or input)", [links, /<(button|input)\b/.test(card)], [["/library/field/f1", "/review"], false]);
// A broken streak's fix is on the page the card is on (the Last week card): its anchor alone, so it scrolls there on
// /today/week and within step 1 of the review run (the card and the Last week card are both there), never leaving the run.
const withStreak = renderToStaticMarkup(createElement(WeekAuditCard, { audit: { ...live, decaying: decayingOf({ streaks: { before: run("2026-10-11"), after: run("2026-10-18"), sunday: "2026-10-18" } }) }, today: MONDAY }));
const weekPage = read("src/app/today/week/page.tsx").replace(/\r\n/g, "\n");
check(
  "the streak line links to the Last week card's anchor alone (#last-week): on /today/week it scrolls there, in the run it stays in step 1; the card's section carries the id",
  LAST_WEEK_ANCHOR === "last-week" &&
    withStreak.includes('<a class="wa-decay-row" href="#last-week"><span class="wa-decay-txt"><span class="wa-decay-title">Body: 4 kept weeks in a row ended</span>') &&
    !withStreak.includes('href="/today/week') &&
    /<section id=\{LAST_WEEK_ANCHOR\} aria-labelledby="lw-h">/.test(weekPage) &&
    /\{lastWeek && <LastWeekCard week=\{lastWeek\} today=\{today\} \/>\}/.test(weekPage),
  withStreak.slice(withStreak.indexOf("wa-decay\""), withStreak.indexOf("wa-decay\"") + 200)
);
const none = renderToStaticMarkup(createElement(WeekAuditCard, { audit: { ...live, decaying: { count: 0, lines: [], unread: 0 } }, today: MONDAY }));
check("nothing fell: the heading and 'Nothing fell this week.', no list", none.includes(">Decaying this week</p>") && none.includes("Nothing fell this week.") && !none.includes("wa-decay\""));
const unread = renderToStaticMarkup(createElement(WeekAuditCard, { audit: { ...live, decaying: null }, today: MONDAY }));
check("no decay read: no block at all (never 'nothing fell' on a guess)", !unread.includes("Decaying") && !/<a\b/.test(unread));
const css = read("src/components/home/week-audit.css");
const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
check(
  "week-audit.css: a decay row is a 44 px target at least, with a focus ring; tokens only; no text under 12 px",
  /\.wa-decay-row \{[^}]*min-height: 44px;/.test(body) &&
    /\.wa-decay-row:focus-visible \{ outline: 2px solid var\(--focus\);/.test(body) &&
    !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(body) &&
    [...body.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)].every((m) => Number(m[1]) >= 12) &&
    /\.wa-decay-title \{[^}]*overflow-wrap: anywhere;/.test(body) &&
    /\.wa-decay-detail \{[^}]*overflow-wrap: anywhere;/.test(body)
);

// ═══ §6 "Week audit ready" on Today ═══════════════════════════════════════

console.log("— §6 Today's Ask —");
const [ready] = auditReadyNotices(new Date("2026-10-25T08:00:00Z"), "2026-10-25", "2026-10-19");
const asks = todayAsksOf({ yesterdayOpen: 0, recordBy: "by Tue 04:00", notices: ready ? [ready] : [] });
eq("Today shows it as an Ask on the plan card (the Tasks section's), opening the audit", asks.map((a) => [a.id, a.title, a.action, a.href, a.tone, askHostOf(a)]), [["week-audit", "Week audit ready", "Open", "/today/week", "ask", "tasks"]]);
check("D17: it names the week, never a rate or the 85% target; the Ask's default link is the audit's", WEEK_AUDIT_HREF === "/today/week" && !/\d+ ?%/.test(`${ready?.title} ${ready?.detail}`));
check("as shipped (AUDIT_LAUNCH_DAY null) there is no notice, so no Ask", AUDIT_LAUNCH_DAY === null && auditReadyNotices(new Date("2026-10-25T08:00:00Z"), "2026-10-25").length === 0);

// ═══ §7 The server reads only ═════════════════════════════════════════════

console.log("— §7 the server —");
const server = code("src/lib/audit-decay-server.ts");
check(
  "audit-decay-server only reads: no create, update, upsert, delete, raw SQL, ledger write, decay or settlement call",
  !/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$queryRaw|\$transaction/.test(server) && !/decayStaleMastery|degrade|\bsettle\w*\(|mintLife|activityData|invalidate/.test(server)
);
check(
  // Re-pinned for blueprint P28: a sixth part, the conditions (skill-decay-server loadConditionItems: null with no read
  // while DECAY_LAUNCH_DAY is off, so nothing is counted unread then).
  "each part soft on its own: a failed read is counted (unread) and left out, never guessed",
  (server.match(/\.catch\(soft</g) ?? []).length === 6 && /unread \+= 1;/.test(server) && /decayingOf\(\{ traits, drops: knowledge\?\.drops \?\? null, ideas: knowledge\?\.ideas \?\? null, habits, streaks, mp, conditions, unread \}\)/.test(server)
);
check(
  "the reads: snapshots from LEVEL_RULE_SINCE's floor, drops still below droppedFrom since the week's Monday 04:00, idle decay rows of the week, the habits at the Sunday before",
  /snapshots: \{ where: \{ day: \{ gte: levelRuleSnapshotFloor\(dateColumn\(sinceKey\)\) \} \}/.test(server) &&
    /droppedAt: \{ gte: since, lte: now \}/.test(server) &&
    /reason: "DECAY", createdAt: \{ gte: since, lte: now \}/.test(server) &&
    /readHabitStrengths\(userId, addDays\(week\.monday, -1\), today\)/.test(server) &&
    /const since = dayStartOf\(week\.monday\);/.test(server)
);
const wa = code("src/lib/week-audit-server.ts");
check(
  "week-audit-server reads the decay beside the week's facts, live and for the freeze (one copy, decay included), and its cache drops on a review or a level change",
  (wa.match(/Promise\.all\(\[readQuestFacts\(userId, week\.monday, today, \{ habits: true \}\), decayOf\(userId, week, now\)\]\)/g) ?? []).length === 2 &&
    /\["life", "activity", "fields", "ideas", "progress"\]/.test(wa) &&
    /if \(!week \|\| launchDay == null\) return null;\s*return cached\(/.test(wa)
);
check("the decay's rules hold no Prisma, no clock and no randomness (audit-decay.ts)", !/from "\.\/prisma"|@prisma\/client|new Date\(\)|Date\.now|Math\.random/.test(code("src/lib/audit-decay.ts")));

// ═══ §8 The phone and the package ═════════════════════════════════════════

console.log("— §8 the phone and the package —");
eq("the phone's `week.decaying`: the count, the first DECAY_TOP lines' kind, title and detail, what couldn't be read", [DECAY_TOP, checkDecayingOf(small), checkDecayingOf(null), checkWeekOf({ ...live, decaying: small })?.decaying?.count], [3, { count: 2, top: small.lines.map((l) => ({ kind: l.kind, title: l.title, detail: l.detail })), unread: 0 }, null, 2]);
const nav = read("android/app/src/main/java/com/xtnl/app/ui/Nav.kt");
const vm = read("android/app/src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt");
const settings = read("android/app/src/main/java/com/xtnl/app/data/AppSettings.kt");
const reminder = read("android/app/src/main/java/com/xtnl/app/notify/AuditReminder.kt");
// The switch, not the week (a week is null before the first audited Sunday's 18:00 and when its read fails), and only
// from the source in use: an answer from a source just switched away from never sets it.
check(
  "D37 on the phone: xtnl://app/week opens the audit; the reminder is armed from the server's `auditOn` (never demo data, never a stale source's answer), on by default, re-armed at start",
  /path == "\/week" -> \{\s*tab = Tab\.MORE\s*more = MoreRoute\.WEB\s*webPath = AuditAlarm\.WEB_PATH/.test(nav) &&
    /if \(source != graph\.source\) return@launch\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(r is Outcome\.Ok && source != "demo"\) graph\.auditReminder\.sawAudit\(r\.value\.auditOn\)/.test(vm) &&
    !/sawWeek|week != null/.test(vm) &&
    /auditReminder = prefs\.getBoolean\(K_AUDIT_REMINDER, true\)/.test(settings) &&
    /graph\.auditReminder\.sync\(\)/.test(read("android/app/src/main/java/com/xtnl/app/XtnlApp.kt")) &&
    /if \(!AuditAlarm\.armed\(p\.auditReminder, p\.auditLive\)\) \{\s*am\.cancel\(pi\)/.test(reminder) &&
    /AlarmManager\.RTC_WAKEUP/.test(reminder)
);
check(
  "…a source switched (another address, demo data on or off) clears the switch until that source's first check, and the alarm is re-synced",
  /val moved = origin != _state\.value\.server[\s\S]*?if \(moved\) edit\.putBoolean\(K_AUDIT_LIVE, false\)/.test(settings) &&
    /val moved = on != _state\.value\.demo[\s\S]*?if \(moved\) edit\.putBoolean\(K_AUDIT_LIVE, false\)/.test(settings) &&
    /distinctUntilChanged\(\)\.drop\(1\)\.collect \{\s*\/\/[^\n]*\n\s*graph\.auditReminder\.sync\(\)/.test(vm)
);
const manifest = read("android/app/src/main/AndroidManifest.xml");
check(
  "…19:00 exact while Alarms & reminders is allowed (SCHEDULE_EXACT_ALARM, the user's grant, re-armed when granted; never USE_EXACT_ALARM), else Android's inexact alarm, and Settings says 'up to an hour later'",
  /<uses-permission android:name="android\.permission\.SCHEDULE_EXACT_ALARM" \/>/.test(manifest) &&
    !/USE_EXACT_ALARM/.test(manifest.replace(/<!--[\s\S]*?-->/g, "")) &&
    /android:name="\.notify\.AuditExactReceiver"[\s\S]*?android\.app\.action\.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED/.test(manifest) &&
    /if \(exact\(context\)\) am\.setExactAndAllowWhileIdle\(AlarmManager\.RTC_WAKEUP, at, pi\)\s*else am\.setAndAllowWhileIdle\(AlarmManager\.RTC_WAKEUP, at, pi\)/.test(reminder) &&
    /or up to an hour later: Android's exact alarms are off for XTNL\./.test(read("android/app/src/main/java/com/xtnl/app/core/AuditAlarm.kt")) &&
    /ACTION_REQUEST_SCHEDULE_EXACT_ALARM/.test(read("android/app/src/main/java/com/xtnl/app/ui/more/MoreScreens.kt")) &&
    /within the hour after 19:00/.test(read("android/README.md").replace(/\s+/g, " ")) &&
    !/a few minutes/.test(read("android/README.md") + reminder)
);
check(
  "…the notification only when allowed (Android 13+ asks once), and the Settings toggle under Notifications",
  /AuditAlarm\.armed\(p\.auditReminder, p\.auditLive\) && permitted\(context\)\) post\(context\)/.test(reminder) &&
    /Section\("Notifications"\)/.test(read("android/app/src/main/java/com/xtnl/app/ui/more/MoreScreens.kt")) &&
    /graph\.settings\.setNotifyAsked\(\)\s*notifyAsk\.launch\(Manifest\.permission\.POST_NOTIFICATIONS\)/.test(read("android/app/src/main/java/com/xtnl/app/ui/AppRoot.kt"))
);
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const chain = pkg.scripts["life:check"].split("&&").map((s) => s.trim());
check(
  "package.json: life:check runs this check right after week-audit-check; audit-decay:check runs it alone",
  chain[chain.indexOf("tsx scripts/week-audit-check.ts") + 1] === "tsx scripts/audit-decay-check.ts" && pkg.scripts["audit-decay:check"] === "tsx scripts/audit-decay-check.ts"
);
check("no migration for it: the decay rides in the AUDIT row's receipt (a JSON column)", /model ActivityEvent \{[\s\S]*?\n\s*receipt\s+Json\??/.test(read("prisma/schema.prisma")));

console.log(`\naudit-decay-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

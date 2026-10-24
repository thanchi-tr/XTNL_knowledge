/**
 * Pages proof (blueprint 2.7, plan P24; decision D21, harms H9 and H10): the phase's own check. Pure: no database, no
 * network, no clock of its own.
 *
 *   npx tsx scripts/proof-pages-check.ts      (life:check runs it, right after proof-check)
 *
 * It pins:
 *   1. Inert: with PROOF_LAUNCH_DAY null (or a day before it) a reading task is gated nowhere, its receipt and its row
 *      are byte for byte a plain task's, and only PAGES of every autoMetric is ticked by hand (completesItself).
 *   2. Capture: the token is 'pg' or 'pages', never 'p' ('30p' stays 30 minutes); the count is the day's target; the
 *      server writes the parse's autoMetric and target only (no other column).
 *   3. The gate: with a day's target a full tick with no pages, or fewer, is refused ("Log the pages"); the minimum
 *      version, #play, an automatic tick and a task with no target never are; the chips start at the target.
 *   4. The receipt: a reading task's is 'life-3' with proof.pages, at exactly the price it had; never repriced.
 *   5. The board: a reading task's row carries row.pages (its target) and no row.proof; every other row is unchanged;
 *      a reading task is an ordinary task to every self-completion read (yesterday, steps, defer, audit, timer).
 *   6. The server: the tick holds the gate (tickProofOf), writes the two columns only for a reading task's tick in
 *      force, a done-now line ticks with its own pages, Again and steps follow the plain rules, and the actions and the
 *      phone pass { kind: 'PAGES', qty } through, cleaned.
 *   7. The migration is additive (BEGIN/COMMIT, two nullable columns and their CHECKs, nothing else), the schema
 *      carries it, and autoMetric has no CHECK anywhere (so PAGES needed no SQL).
 *   8. The web: the drawer's page chips and "Done · 30 pages", Done held until the pages are picked, a reading row's
 *      "log 30 pages" and its done row's "30 pages"; a chore row exactly as before; the audit SQL and the rules page.
 */
import "./_no-model";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskRow } from "../src/components/today/TaskRow";
import { TaskDrawer } from "../src/components/today/TaskDrawer";
import { priceTask } from "../src/lib/life-grade";
import {
  PAGES_METRIC,
  PAGES_QTY_MAX,
  PAGES_REFUSAL_PREFIX,
  PAGE_CHIPS_FREE,
  PROOF_LAUNCH_DAY,
  PROOF_QTY_KINDS,
  cleanTickProof,
  pageChipsOf,
  pagesGated,
  pagesLabelOf,
  pagesQtyOf,
  pagesRefusalOf,
  pagesRowNoteOf,
  pagesTargetOf,
  priceProofOf,
  proofRuleLines,
  tickPagesOf,
} from "../src/lib/proof";
import { completesItself, type PriceInput, type Receipt } from "../src/lib/life-types";
import { buildBoard, planCompletion, statsFor, yesterdayBookable, yesterdayRecordable, type BoardData, type BoardRow, type BoardTemplate, type DayLedger } from "../src/lib/today-board";
import { stepsAllowed } from "../src/lib/subtasks";
import { timerTemplateRefusalOf } from "../src/lib/task-sessions-server";
import { tickProofInputOf } from "../src/lib/mobile-api";
import { parseCapture } from "../src/lib/capture-parse";
import { normTitleOf } from "../src/lib/life-lexicon";
import { parseRule } from "../src/lib/recurrence";
import { addDays, type DayKey } from "../src/lib/life-day";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** Source without comments, so a word in a doc comment never passes for code. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
}
const section = (s: string) => console.log(`\n── ${s}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Thrown BadInput (mobile-api bad) as a boolean. */
const throws = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

const LAUNCH: DayKey = "2026-10-26";
const TODAY: DayKey = "2026-10-27";
const YESTERDAY = addDays(TODAY, -1);
const NOW = new Date("2026-10-27T01:00:00.000Z"); // 12:00 Sydney, life day 2026-10-27

function tpl(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: normTitleOf(p.title), recurrence: null, dueDay: null, dueKind: null, intrinsic: false, autoMetric: null, mvv: null, track: "CRAFT", band: "STANDARD", bandOverride: 0,
    estMinutes: 30, machineMinutes: 30, kind: "TASK", inbox: false, startDay: addDays(TODAY, -30), horizon: null, parentId: null, krMetric: null, krTarget: null, krUnit: null,
    compulsory: false, autoTarget: null, category: "OTHER", lexicalBand: p.band ?? "STANDARD", aiBand: null, gradeSource: "LEXICAL", gradeConfidence: 0.4, gradeBasis: null,
    gradeModel: null, gradePromptVersion: null, gradeAttempts: 1, gradeFrozen: true, sizing: false, bandOverrideAt: null, gradeFrozenAt: null, topAttribute: null, note: null,
    completedAt: null, createdAt: "2026-06-01T00:00:00.000Z", sortOrder: 0, ...p,
  };
}
const ledgerOf = (day: DayKey): DayLedger => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null });
const READ = tpl({ id: "read", title: "Read 30 pages", category: "STUDY", recurrence: "DAILY", estMinutes: 40, machineMinutes: 40, autoMetric: "PAGES", autoTarget: 30, mvv: "1 page" });
const PLAIN_READ = { ...READ, autoMetric: null, autoTarget: null };
const DISHES = tpl({ id: "dishes", title: "Dishes", category: "CHORE", band: "INTRO", estMinutes: 15, machineMinutes: 15, recurrence: "DAILY", track: "DUTY" });
const NOVEL = tpl({ id: "novel", title: "Read the novel", category: "STUDY", dueDay: TODAY, dueKind: "PLANNED", autoMetric: "PAGES", autoTarget: null });
function data(templates: BoardTemplate[], proof?: BoardData["proof"]): BoardData {
  const stats: BoardData["stats"] = {};
  for (const t of templates) {
    const rule = t.recurrence ? parseRule(t.recurrence) : null;
    if (rule) stats[t.id] = statsFor(t, rule, [], TODAY);
  }
  return { today: TODAY, yesterday: YESTERDAY, capacityMin: 240, templates, instances: [], stats, ledger: { today: ledgerOf(TODAY), yesterday: ledgerOf(YESTERDAY) }, paid: {}, goalQty: {}, dueNow: 0, ...(proof ? { proof } : {}) };
}
const rowsOf = (d: BoardData) => {
  const b = buildBoard(d, [], NOW.getTime());
  return [...b.must, ...b.todayRows, ...b.anytime];
};

// ── 1. Inert ────────────────────────────────────────────────────────────────

section("1. inert until PROOF_LAUNCH_DAY: a reading task is a plain task");
check("PROOF_LAUNCH_DAY is null in code (P24 rides on P23's switch, flipped only on the user's go)", PROOF_LAUNCH_DAY === null);
check(
  "pagesGated: a PAGES task on the personal Board from the launch day only; never while off, before it, on a work tab, or for another metric",
  pagesGated(READ, TODAY, LAUNCH) && !pagesGated(READ, TODAY, null) && !pagesGated(READ, addDays(LAUNCH, -1), LAUNCH) && !pagesGated({ ...READ, boardId: "b1" }, TODAY, LAUNCH) && !pagesGated({ ...READ, autoMetric: "REVIEWS" }, TODAY, LAUNCH) && !pagesGated(DISHES, TODAY, LAUNCH)
);
check(
  "completesItself: exactly the old `!!autoMetric` for every metric stored before P24; PAGES alone is ticked by hand",
  ["REVIEWS", "IDEAS", "REVIEW_DUE", "STEPS", "WORKOUT"].every((m) => completesItself(m)) && !completesItself(PAGES_METRIC) && !completesItself(null) && !completesItself(undefined) && !completesItself("")
);
const offRows = rowsOf(data([READ, DISHES]));
const plainRows = rowsOf(data([PLAIN_READ, DISHES]));
check(
  "with proof off the reading row is the plain task's row (projection, lane, state, record yesterday, steps), no pages key and no proof key",
  offRows.length === 2 &&
    offRows.every((r) => !("pages" in r) && !("proof" in r)) &&
    same(offRows.map((r) => [r.lane, r.state, r.projection, r.recordYesterday, r.auto, r.progress]), plainRows.map((r) => [r.lane, r.state, r.projection, r.recordYesterday, r.auto, r.progress]))
);
check("priceProofOf records nothing for a reading task while off (null and absent facts alike)", priceProofOf(READ, TODAY, { launchDay: null, pages: 30 }) === null && priceProofOf(READ, TODAY, null) === null);

// ── 2. Capture ──────────────────────────────────────────────────────────────

section("2. capture: 'pg' or 'pages', never 'p'");
const c30 = parseCapture("read 30 pages daily", { today: TODAY });
check("'read 30 pages daily': a reading habit, autoMetric PAGES, the day's target 30, the words kept in the title", c30.autoMetric === "PAGES" && c30.autoTarget === 30 && c30.kind === "HABIT" && c30.title === "Read 30 pages" && c30.tokens.some((t) => t.field === "pages" && t.label === "Proof · 30 pages"));
check("'30pg' and '30 pgs' read the same; '1 page a day' is 1", parseCapture("read 30pg", { today: TODAY }).autoTarget === 30 && parseCapture("read 30 pgs", { today: TODAY }).autoTarget === 30 && parseCapture("read 1 page a day", { today: TODAY }).autoTarget === 1);
const c30p = parseCapture("read 30p", { today: TODAY });
check("'30p' is still 30 minutes (Vietnamese phút), never pages", c30p.autoMetric === null && c30p.estMinutes === 30);
check("a length ('a 10 page essay'), a whole book ('600 pages') and a goal are no day's pages", parseCapture("write a 10 page essay", { today: TODAY }).autoMetric === null && parseCapture("read 600 pages", { today: TODAY }).autoMetric === null && parseCapture("goal: read 300 pages by dec", { today: TODAY }).autoMetric === null);
const tasksSrc = code("src/lib/tasks.ts");
check(
  "the server writes the parse's metric and its target (clamped 1..500), never on a work tab or a goal; no column of its own",
  /const autoMetric = parsed\.autoMetric && kind !== "GOAL" && !boardId \? parsed\.autoMetric : null;/.test(tasksSrc) && /Math\.max\(1, Math\.min\(500, Math\.round\(parsed\.autoTarget\)\)\)/.test(tasksSrc) && !/proofKind:\s*"PAGES"[^}]*captureSource/.test(tasksSrc)
);

// ── 3. The gate ─────────────────────────────────────────────────────────────

section("3. the gate: a full tick of a reading task takes its pages (D21; H9: proof for opted-in work only)");
const none = pagesRefusalOf({ gated: true, target: 30, pages: null });
const below = pagesRefusalOf({ gated: true, target: 30, pages: 20 });
check("no pages, or fewer than the day's 30, is refused, each line opening 'Log the pages'", !!none && none.startsWith(PAGES_REFUSAL_PREFIX) && /at least 30 pages/.test(none) && !!below && below.startsWith(PAGES_REFUSAL_PREFIX) && /20 pages is below the day's 30/.test(below));
check("30 or more pass", pagesRefusalOf({ gated: true, target: 30, pages: 30 }) === null && pagesRefusalOf({ gated: true, target: 30, pages: 31 }) === null);
check(
  "the minimum version, an automatic tick, #play (pays nothing), no target, and a task not gated are never refused",
  [{ mvv: true }, { auto: true }, { pays: false }].every((x) => pagesRefusalOf({ gated: true, target: 30, pages: null, ...x }) === null) &&
    pagesRefusalOf({ gated: true, target: null, pages: null }) === null &&
    pagesRefusalOf({ gated: false, target: 30, pages: null }) === null
);
check("pagesQtyOf: whole pages 1..2000 (more is the most); 0, below 0, not a number is none", pagesQtyOf(30.4) === 30 && pagesQtyOf(2500) === PAGES_QTY_MAX && PAGES_QTY_MAX === 2000 && [0, -3, Number.NaN, "30", null, undefined, 0.4].every((x) => pagesQtyOf(x) === null));
check("pagesTargetOf reads autoTarget the same way (null with none)", pagesTargetOf({ autoTarget: 30 }) === 30 && pagesTargetOf({ autoTarget: null }) === null && pagesTargetOf({}) === null);
check("the chips start at the target ('Done · 30 pages'): 30, 45, 60; 1 → 1, 2; none → 10, 20, 30, 50", same(pageChipsOf(30), [30, 45, 60]) && same(pageChipsOf(1), [1, 2]) && same(pageChipsOf(null), [...PAGE_CHIPS_FREE]) && same(PAGE_CHIPS_FREE, [10, 20, 30, 50]));
check("the words: '30 pages', '1 page', 'log 30 pages', 'log the pages'", pagesLabelOf(30) === "30 pages" && pagesLabelOf(1) === "1 page" && pagesRowNoteOf(30) === "log 30 pages" && pagesRowNoteOf(null) === "log the pages");

// ── 4. The receipt ──────────────────────────────────────────────────────────

section("4. the receipt: 'life-3' with proof.pages, at exactly the old price");
check(
  "priceProofOf in force: a reading task records its pages (gated false: no minutes asked); with #proof as well both; the default rule's minutes untouched",
  same(priceProofOf(READ, TODAY, { launchDay: LAUNCH, pages: 30 }), { gated: false, wall: null, pages: 30 }) &&
    same(priceProofOf(READ, TODAY, { launchDay: LAUNCH }), { gated: false, wall: null, pages: null }) &&
    same(priceProofOf({ ...READ, proof: "MINUTES" }, TODAY, { launchDay: LAUNCH, wall: 50, pages: 31 }), { gated: true, wall: 50, pages: 31 }) &&
    same(priceProofOf({ proof: "MINUTES", category: "WORK", boardId: null }, TODAY, { launchDay: LAUNCH, wall: 50 }), { gated: true, wall: 50 })
);
const input: PriceInput = { band: "STANDARD", bandOverride: 0, machineMinutes: 40, estMinutes: 40, minutes: null, timing: "ON_TIME", recurring: true, streakDays: 0, repeatN: 1, introBefore: 0, mode: "FULL" };
const plainReceipt = priceTask(input, { rawBefore: 0 }, "CRAFT");
const pagesReceipt = priceTask(input, { rawBefore: 0 }, "CRAFT", null, { gated: false, wall: null, pages: 30 });
check("the price is the plain task's to the digit (raw, minutes, XP, every factor), and the receipt says 30 pages", pagesReceipt.v === "life-3" && pagesReceipt.raw === plainReceipt.raw && pagesReceipt.xp === plainReceipt.xp && same(pagesReceipt.factors, plainReceipt.factors) && pagesReceipt.proof?.pages === 30);
const plan = planCompletion({ template: READ, day: TODAY, today: TODAY, slot: 0, ledger: ledgerOf(TODAY), streakDays: 0, proof: { launchDay: LAUNCH, pages: 45 } });
const planOff = planCompletion({ template: READ, day: TODAY, today: TODAY, slot: 0, ledger: ledgerOf(TODAY), streakDays: 0 });
check("the server's plan carries the pages to the receipt; pays to TRACK as manual (never a study link's NONE); without the facts byte for byte as before", plan.receipt.proof?.pages === 45 && plan.sink === "TRACK" && plan.source === "manual" && plan.receipt.xp === planOff.receipt.xp && planOff.receipt.v === "life-1" && !("proof" in planOff.receipt));

// ── 5. The board and the self-completion reads ─────────────────────────────

section("5. the board: row.pages on a reading task only; an ordinary task to every other read");
const onRows = rowsOf(data([READ, DISHES, NOVEL], { launchDay: LAUNCH, timers: [] }));
const on = (id: string) => onRows.find((r) => r.template.id === id)!;
check("in force: the reading habit's row carries pages {target 30} and no proof (it asks pages, not minutes); no target → pages {target null}", same(on("read").pages, { target: 30 }) && on("read").proof === undefined && same(on("novel").pages, { target: null }));
const offOf = (id: string) => rowsOf(data([READ, DISHES, NOVEL])).find((r) => r.template.id === id)!;
check(
  "its projection is the plain price ('life-3', proof.pages null); the chore's row has no pages and is byte for byte as before",
  on("read").projection.raw === offOf("read").projection.raw && on("read").projection.proof?.pages === null && !("pages" in on("dishes")) && same(on("dishes"), offOf("dishes"))
);
check("a launch day after today gates nothing (forward only, H10)", rowsOf(data([READ], { launchDay: addDays(TODAY, 1), timers: [] })).every((r) => !("pages" in r)));
const rule = parseRule("DAILY");
check(
  "a reading task records yesterday, takes steps and a timer like any task (a study link takes none)",
  yesterdayRecordable(READ, rule, YESTERDAY, null) === yesterdayRecordable(PLAIN_READ, rule, YESTERDAY, null) &&
    yesterdayRecordable(READ, rule, YESTERDAY, null) &&
    yesterdayBookable(NOVEL, null, YESTERDAY, null) === yesterdayBookable({ ...NOVEL, autoMetric: null }, null, YESTERDAY, null) &&
    !yesterdayRecordable({ ...READ, autoMetric: "REVIEWS" }, rule, YESTERDAY, null) &&
    stepsAllowed({ kind: "HABIT", autoMetric: "PAGES" }) &&
    !stepsAllowed({ kind: "HABIT", autoMetric: "REVIEWS" }) &&
    timerTemplateRefusalOf({ id: "read", kind: "HABIT", boardId: null, archivedAt: null, autoMetric: "PAGES" }) === null &&
    timerTemplateRefusalOf({ id: "s", kind: "HABIT", boardId: null, archivedAt: null, autoMetric: "REVIEWS" }) !== null
);
check(
  "the reads that leave out self-completing tasks use completesItself (defer, the habits audit, momentum's quest options, the decay audit's habits, the drawer's Defer, Again)",
  /if \(completesItself\(t\.autoMetric\)\) return planFail\(DEFER_AUTO\);/.test(code("src/lib/task-decisions.ts")) &&
    /if \(!rule \|\| completesItself\(t\.autoMetric\) \|\| t\.intrinsic\) continue;/.test(code("src/lib/week-audit.ts")) &&
    /!completesItself\(c\.autoMetric\) &&/.test(code("src/lib/momentum-server.ts")) &&
    /OR: \[\{ autoMetric: null \}, \{ autoMetric: "PAGES" \}\]/.test(code("src/lib/audit-decay-server.ts")) &&
    /props\.onDefer && !completesItself\(t\.autoMetric\)/.test(code("src/components/today/TaskDrawer.tsx")) &&
    /if \(completesItself\(read\.t\.autoMetric\)\) return fail\("A study task completes once a day\."\);/.test(tasksSrc)
);
const chips = code("src/components/capture/CaptureChips.tsx");
check("the capture sheet prices a reading line as paying work, never 'paid by reviews' (only a study link is)", /parsed\.intrinsic \? "PLAY" : studyLinked\(parsed\) \? "STUDY" : "FULL"/.test(chips) && /\) : studyLinked\(parsed\) \? \(\s*"paid by reviews"/.test(chips) && !/parsed\.autoMetric \? /.test(chips));

// ── 6. The server ───────────────────────────────────────────────────────────

section("6. the server: the gate at the tick, the two columns, the actions and the phone");
check(
  "tickProofOf holds the gate after the minutes (the template's target; the minimum and automatic ticks bring no pages) and hands the pages to the plan",
  /const pagesOn = pagesGated\(template, a\.day, p\.launchDay\);/.test(tasksSrc) &&
    /const pages = pagesOn && plain \? pagesQtyOf\(a\.pages\) : null;/.test(tasksSrc) &&
    /pagesRefusalOf\(\{ gated: pagesOn, target: pagesTargetOf\(template\), mvv: a\.mvv, auto: a\.auto \|\| !!a\.workoutId, pays, pages \}\)/.test(tasksSrc) &&
    // Re-pinned (review): the timer the facts name is the latest of the segments counted.
    /facts: \{ launchDay: p\.launchDay, wall, session: latest\?\.id \?\? null, \.\.\.\(pagesOn \? \{ pages \} : \{\}\) \}/.test(tasksSrc) &&
    tasksSrc.indexOf("proofRefusalOf({ gated") < tasksSrc.indexOf("pagesRefusalOf({ gated")
);
check(
  "settleOnce writes proofKind and proofQty only for a reading task's tick in force (a re-tick bringing none clears them); every other tick's instance is as before",
  /const pagesCols = proof\.pagesOn \? \(proof\.pages != null \? \{ proofKind: "PAGES", proofQty: proof\.pages \} : \{ proofKind: null, proofQty: null \}\) : null;/.test(tasksSrc) &&
    /\.\.\.\(pagesCols\?\.proofKind \? pagesCols : \{\}\),/.test(tasksSrc) &&
    /\.\.\.\(pagesCols \?\? \{\}\),/.test(tasksSrc) &&
    (tasksSrc.match(/proofQty/g) ?? []).length === 2
);
check(
  "a done-now reading line ticks with its own pages; the tick, Again and the steps follow the plain rules",
  /const target = t\.autoMetric === "PAGES" \? pagesTargetOf\(t\) : null;/.test(tasksSrc) &&
    /\.\.\.\(target != null \? \{ proof: \{ kind: "PAGES", qty: target \} \} : \{\}\)/.test(tasksSrc) &&
    (tasksSrc.match(/pages: tickPagesOf\(opts\.proof\)/g) ?? []).length === 2 &&
    /\|\| pagesGated\(t, day, read\.proof\.launchDay\)\)\) \{/.test(tasksSrc)
);
const actions = code("src/app/actions/tasks.ts");
check("the actions take { kind: 'PAGES', qty } (cleanTickProof: whole pages, else none) for the tick and Again", (actions.match(/\.\.\.proofOf\(input\?\.proof\),/g) ?? []).length === 2 && /const proof = cleanTickProof\(x\);\s*return proof \? \{ proof \} : \{\};/.test(actions));
check(
  "cleanTickProof and tickPagesOf: PAGES only, whole pages, else none",
  same(cleanTickProof({ kind: "PAGES", qty: 30.2 }), { kind: "PAGES", qty: 30 }) && cleanTickProof({ kind: "MINUTES", qty: 30 }) === null && cleanTickProof({ kind: "PAGES", qty: 0 }) === null && cleanTickProof("30") === null && cleanTickProof(null) === null && tickPagesOf({ kind: "PAGES", qty: 12 }) === 12 && tickPagesOf(undefined) === null && same(PROOF_QTY_KINDS, ["PAGES"])
);
check(
  "the phone's proof: { kind: 'PAGES', qty } whole 1..2000, null absent; any other shape is a 400",
  same(tickProofInputOf({ kind: "PAGES", qty: 30 }), { kind: "PAGES", qty: 30 }) &&
    tickProofInputOf(null) === undefined &&
    tickProofInputOf(undefined) === undefined &&
    [{ kind: "PAGES", qty: 0 }, { kind: "PAGES", qty: 2001 }, { kind: "PAGES", qty: 1.5 }, { kind: "MINUTES", qty: 3 }, { kind: "PAGES", qty: 3, x: 1 }, [3], "3", 3].every((v) => throws(() => tickProofInputOf(v)))
);

// ── 7. The migration ────────────────────────────────────────────────────────

section("7. the migration is additive; the schema carries it; PAGES needed no SQL");
const sql = read("prisma/migrations/20270102000000_proof_qty/migration.sql");
const stmts = sql.replace(/--.*$/gm, "");
check(
  "BEGIN/COMMIT; two nullable TaskInstance columns and three CHECKs; nothing dropped, renamed, retyped, backfilled or deleted; no other table",
  /^BEGIN;/m.test(stmts) &&
    /^COMMIT;/m.test(stmts) &&
    /ALTER TABLE "public"\."TaskInstance" ADD COLUMN "proofKind" TEXT;/.test(stmts) &&
    /ALTER TABLE "public"\."TaskInstance" ADD COLUMN "proofQty" DOUBLE PRECISION;/.test(stmts) &&
    /"TaskInstance_proofKind_check" CHECK \("proofKind" IS NULL OR "proofKind" IN \('PAGES'\)\)/.test(stmts) &&
    /"TaskInstance_proofQty_check" CHECK \("proofQty" IS NULL OR \("proofQty" > 0 AND "proofQty" <= 2000\)\)/.test(stmts) &&
    /"TaskInstance_proof_pair_check" CHECK \(\("proofKind" IS NULL\) = \("proofQty" IS NULL\)\)/.test(stmts) &&
    !/\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE|INSERT|CREATE)\b|ALTER COLUMN|DEFAULT|NOT NULL/i.test(stmts) &&
    (stmts.match(/ALTER TABLE "public"\."(\w+)"/g) ?? []).every((x) => x.includes('"TaskInstance"')) &&
    /^[\x00-\x7f]*$/.test(sql) &&
    !sql.includes("\r")
);
const schema = read("prisma/schema.prisma");
check("schema.prisma: TaskInstance.proofKind String? and proofQty Float?, the three CHECKs named; the autoMetric doc names PAGES", /^\s+proofKind\s+String\?\r?$/m.test(schema) && /^\s+proofQty\s+Float\?\r?$/m.test(schema) && ["TaskInstance_proofKind_check", "TaskInstance_proofQty_check", "TaskInstance_proof_pair_check"].every((c) => schema.includes(c)) && /REVIEWS \| IDEAS \| REVIEW_DUE \| STEPS \| WORKOUT: completes itself from activity\. PAGES/.test(schema));
const migrations = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d));
check("no migration ever put a CHECK on TaskTemplate.autoMetric (it is TEXT), so the new value needed no SQL", migrations.length > 20 && migrations.every((d) => !/CHECK\s*\([^)]*"autoMetric"/i.test(read(`prisma/migrations/${d}/migration.sql`))));
check("proof_qty is the one migration after task_proof (the plan's timestamp), and nothing writes the columns but the tick", migrations.includes("20270102000000_proof_qty") && migrations.indexOf("20270102000000_proof_qty") === migrations.indexOf("20270101000000_task_proof") + 1 && ["src/lib/task-sessions-server.ts", "src/lib/mobile-api-server.ts", "src/lib/settlement.ts", "src/lib/duty.ts"].every((f) => !code(f).includes("proofQty")));

// ── 8. The web ──────────────────────────────────────────────────────────────

section("8. the web: 'Done · 30 pages'; a chore still ticks in one tap");
const rowHtml = (r: BoardRow) =>
  renderToStaticMarkup(
    createElement(TaskRow, { row: r, projection: r.projection, drawerOpen: false, undoable: false, busy: false, receiptOpen: false, receiptId: "rcpt", onTick: () => {}, onUndo: () => {}, onToggleDrawer: () => {}, onToggleReceipt: () => {} })
  );
check("a reading row says 'log 30 pages'; a chore row draws exactly as with proof off", /log 30 pages/.test(rowHtml(on("read"))) && rowHtml(on("dishes")) === rowHtml(offOf("dishes")) && !/pages/.test(rowHtml(on("dishes"))));
const doneReceipt: Receipt = { ...pagesReceipt };
const doneRow = { ...on("read"), state: "done", timesDone: 1, instanceId: "i1", paid: { eventId: "e1", instanceId: "i1", receipt: doneReceipt, occurredAt: NOW.toISOString(), xp: doneReceipt.xp, undone: false } } as BoardRow;
check("its done row says the pages it read, from its receipt", /<span class="r-bit">30 pages<\/span>/.test(rowHtml(doneRow)));
const drawerHtml = (r: BoardRow, pages: { target: number | null; picked: number | null } | null) =>
  renderToStaticMarkup(
    createElement(TaskDrawer, {
      row: r,
      now: NOW.getTime(),
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
      noMonth: true,
      pages: pages ? { ...pages, onPick: () => {} } : null,
    })
  );
const noPick = drawerHtml(on("read"), { target: 30, picked: null });
const picked = drawerHtml(on("read"), { target: 30, picked: 30 });
const doneButton = (html: string) => /<button type="button" class="today-pill" data-tone="primary"[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";
check(
  // Re-pinned (review): the 44 px is now real, the chip groups' own rule (today.css [data-chips]), not the 40 px pill's.
  "the drawer: page chips 30, 45 and 60 pages (a 44 px pill each, aria-pressed); Done held with 'pick the pages' until picked, then 'Done · 30 pages' with its price",
  /aria-label="Pages read" data-chips="pages"/.test(noPick) &&
    /\.today-drawer-row\[data-chips\] \.today-pill \{ min-height: 44px; \}/.test(read("src/components/today/today.css")) &&
    (noPick.match(/class="today-pill num" aria-pressed="false">(30|45|60) pages</g) ?? []).length === 3 &&
    /disabled=""/.test(doneButton(noPick)) &&
    /pick the pages/.test(doneButton(noPick).replace(/<!-- -->/g, "")) &&
    !/disabled=""/.test(doneButton(picked)) &&
    /Done · 30 pages · ≈/.test(doneButton(picked).replace(/<!-- -->/g, "")) &&
    /aria-pressed="true">30 pages</.test(picked)
);
const choreDrawer = drawerHtml(on("dishes"), null);
check(
  "without the pages prop the drawer has no page chips and Done ticks at the estimate, exactly as before",
  !/Pages read|pages/.test(choreDrawer) && !/disabled=""/.test(doneButton(choreDrawer)) && /Done · ~15 min · ≈/.test(doneButton(choreDrawer).replace(/<!-- -->/g, "")),
  doneButton(choreDrawer).replace(/<!-- -->/g, "")
);
const board = code("src/components/today/TodayBoard.tsx");
check(
  "the board: a reading row's tick with fewer pages than its target opens the drawer at its chips, the target picked; Again and yesterday carry the pages; its steps are a checklist",
  // Re-pinned (review): the drawer opens through toChips (focus on its first chip, the reason announced), target picked.
  /if \(row\.pages\?\.target != null && \(pages == null \|\| pages < row\.pages\.target\)\) \{\s*toChips\(`pick the pages you read, at least \$\{row\.pages\.target\}\.`\);\s*setDrawerPages\(row\.pages\.target\);\s*return;\s*\}/.test(board) &&
    /const toChips = \(line: string\) => \{\s*if \(openKey !== row\.key\) setDrawerMinutes\(null\);\s*setOpenKey\(row\.key\);\s*setChipFocus\(row\.key\);/.test(board) &&
    /onAgain=\{\(\) => again\(row, minutes, pagesPicked\)\}/.test(board) &&
    /onYesterday=\{\(\) => recordYesterday\(row, minutes, pagesPicked\)\}/.test(board) &&
    /&& !row\.proof && !row\.pages;/.test(board) &&
    /pages=\{row\.pages \? \{ target: row\.pages\.target, picked: pagesPicked, onPick: setDrawerPages \} : null\}/.test(board)
);
const audit = read("scripts/life-audit.sql");
check("the audit's 'auto task paid' never flags a reading task (it pays like any task)", /AND tt\."autoMetric" IS NOT NULL AND tt\."autoMetric" <> 'PAGES'/.test(audit));
check("the rules page's proof card (shown only in force) says the pages rule, '30p' still minutes, never priced", proofRuleLines().some((l) => /'30 pages' or '30pg'/.test(l) && /'30p' is still 30 minutes/.test(l) && /never priced/.test(l)));

console.log(`\nproof-pages-check: ${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;

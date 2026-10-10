/**
 * Steps (subtasks, migration life_subtasks): the pay rule (subtasks.ts stepPayOf), the price with a step share
 * (life-grade priceTask's K), the tick set, the board's rows, the components rendered, the wiring of the tick and
 * the drawer's editor, and the migration (new tables only). No task gets steps at capture.
 *
 * Pure: no database, no clock, no model.
 *
 *   npx tsx scripts/subtasks-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STEPS_MAX, cleanStepTitle, nextTicks, paidByStepsOf, stepPayOf, stepsAllowed, stepsLine } from "../src/lib/subtasks";
import { priceTask, stepShareOf } from "../src/lib/life-grade";
import { buildBoard, planCompletion, type BoardData, type BoardRow } from "../src/lib/today-board";
import type { PriceInput } from "../src/lib/life-types";
import { fixtureBoardData } from "../src/app/dev/style/today/fixtures";
import { StepsList } from "../src/components/today/StepsList";
import { StepsEditor } from "../src/components/today/StepsEditor";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// ── The pay rule ──────────────────────────────────────────────────────────
{
  check("rule: nothing ticked pays nothing", stepPayOf({ compulsory: false, done: 0, total: 3 }).kind === "none");
  const part = stepPayOf({ compulsory: false, done: 2, total: 5 });
  check("rule: a task pays the share of its steps ticked (partial XP)", part.kind === "pay" && part.steps.done === 2 && part.steps.total === 5);
  check("rule: a must pays nothing for a part", stepPayOf({ compulsory: true, done: 4, total: 5 }).kind === "none");
  const mustAll = stepPayOf({ compulsory: true, done: 5, total: 5 });
  check("rule: a must pays in full once every step is done", mustAll.kind === "pay" && mustAll.steps.done === 5);
  check("rule: counts are clamped (more ticked than steps reads as all)", (() => { const p = stepPayOf({ compulsory: false, done: 9, total: 3 }); return p.kind === "pay" && p.steps.done === 3; })());
  check("rule: no steps pays nothing through steps", stepPayOf({ compulsory: false, done: 0, total: 0 }).kind === "none");
  check("words: '2 of 5 steps', '1 of 1 step'", stepsLine(2, 5) === "2 of 5 steps" && stepsLine(1, 1) === "1 of 1 step");
}

// ── The price: K is the share on a full completion ─────────────────────────
{
  const base: PriceInput = { band: "STANDARD", bandOverride: 0, machineMinutes: 30, estMinutes: 30, timing: "ON_TIME", recurring: false, streakDays: 0, repeatN: 1, introBefore: 0, mode: "FULL" };
  const full = priceTask(base, { rawBefore: 0 }, "DUTY");
  const two5 = priceTask({ ...base, steps: { done: 2, total: 5 } }, { rawBefore: 0 }, "DUTY");
  const all = priceTask({ ...base, steps: { done: 5, total: 5 } }, { rawBefore: 0 }, "DUTY");
  const k = (r: typeof full) => r.factors.find((f) => f.key === "K");
  check("price: 2 of 5 steps pays K 0.4 of the full price", k(two5)?.value === 0.4 && Math.abs(two5.raw - Math.round(full.raw * 0.4 * 10) / 10) <= 0.1, `${two5.raw} vs ${full.raw}`);
  check("price: the receipt names the share ('2 of 5 steps') and carries it (steps)", k(two5)?.label === "2 of 5 steps" && two5.steps?.done === 2 && two5.steps?.total === 5);
  check("price: every step done pays the full price, K 1", all.raw === full.raw && k(all)?.value === 1 && k(all)?.label === "full" && all.steps?.done === 5);
  check("price: no steps leaves the receipt exactly as before (no steps key)", JSON.stringify(full) === JSON.stringify(priceTask({ ...base, steps: null }, { rawBefore: 0 }, "DUTY")) && !("steps" in full));
  const mvv = priceTask({ ...base, mode: "MVV", steps: { done: 1, total: 4 } }, { rawBefore: 0 }, "DUTY");
  check("price: a minimum completion ignores steps (its own K 0.3)", k(mvv)?.value === 0.3 && !("steps" in mvv));
  check("price: a share never pays more than the full price", two5.raw <= full.raw && all.raw <= full.raw);
  check("price: a bad share is no share", stepShareOf({ done: 3, total: 2 }) === null && stepShareOf({ done: 1, total: 0 }) === null && stepShareOf({ done: 0.5, total: 2 }) === null && stepShareOf({ done: 1, total: 51 }) === null);
  check("price: the knee applies to a share as to any raw", priceTask({ ...base, steps: { done: 2, total: 5 } }, { rawBefore: 150 }, "DUTY").xp < two5.xp);
}

// ── The plan and the stored receipt ─────────────────────────────────────────
{
  const data = fixtureBoardData();
  const t = data.templates.find((x) => x.id === "groceries")!;
  const plan = planCompletion({ template: t, day: data.today, today: data.today, slot: 0, ledger: data.ledger.today, streakDays: 0, steps: { done: 1, total: 2 } });
  check("plan: planCompletion passes the share to the price (K 0.5)", plan.receipt.factors.find((f) => f.key === "K")?.value === 0.5 && plan.status === "DONE");
  check("receipt: a step-paid receipt is told apart (paidByStepsOf); a whole tick's is not", paidByStepsOf(plan.receipt)?.done === 1 && paidByStepsOf(planCompletion({ template: t, day: data.today, today: data.today, slot: 0, ledger: data.ledger.today, streakDays: 0 }).receipt) === null && paidByStepsOf(null) === null);
}

// ── Ticks, titles, who can have steps ───────────────────────────────────────
{
  const ids = ["a", "b", "c"];
  check("ticks: one on", [...nextTicks(ids, new Set(["a"]), { stepId: "b", done: true })].sort().join() === "a,b");
  check("ticks: one off", [...nextTicks(ids, new Set(["a", "b"]), { stepId: "a", done: false })].join() === "b");
  check("ticks: all on (the row's tick, the drawer's Done)", nextTicks(ids, new Set(), { stepId: null, done: true }).size === 3);
  check("ticks: a removed step's tick no longer counts", [...nextTicks(["a"], new Set(["a", "gone"]), { stepId: "a", done: true })].join() === "a");
  check("titles: trimmed and folded; empty is none; capped", cleanStepTitle("  buy   milk ") === "buy milk" && cleanStepTitle("   ") === null && (cleanStepTitle("x".repeat(200))?.length ?? 0) === 80 && cleanStepTitle(3) === null);
  check("who: tasks and habits, never goals, idea drafts or study tasks", stepsAllowed({ kind: "TASK", autoMetric: null }) && stepsAllowed({ kind: "HABIT", autoMetric: null }) && !stepsAllowed({ kind: "GOAL", autoMetric: null }) && !stepsAllowed({ kind: "IDEA_DRAFT", autoMetric: null }) && !stepsAllowed({ kind: "HABIT", autoMetric: "REVIEWS" }));
  check("cap: twelve steps at most", STEPS_MAX === 12);
}

// ── The board ───────────────────────────────────────────────────────────────
{
  const data = fixtureBoardData();
  const rowOf = (d: BoardData, id: string): BoardRow | undefined => {
    const b = buildBoard(d);
    return [...b.must, ...b.todayRows, ...b.anytime, ...b.yesterdayRows].find((r) => r.template.id === id && r.day === d.today);
  };
  check("board: no steps until some are added (no data.subtasks, no row.steps)", data.subtasks === undefined && (rowOf(data, "groceries")?.steps ?? null) === null);
  const withSteps: BoardData = { ...data, subtasks: { groceries: { items: [{ id: "s1", title: "Milk", ord: 0 }, { id: "s2", title: "Bread", ord: 1 }], done: ["s1"] } } };
  const r = rowOf(withSteps, "groceries");
  check("board: today's row carries its steps and today's ticks", r?.steps?.items.length === 2 && r.steps.done.join() === "s1" && r.steps.partial === false && r.steps.checklist === false);
}

// ── Components ──────────────────────────────────────────────────────────────
{
  const steps = { items: [{ id: "s1", title: "Milk", ord: 0 }, { id: "s2", title: "Bread", ord: 1 }], done: ["s1"], partial: true, checklist: false };
  const list = renderToStaticMarkup(createElement(StepsList, { steps, compulsory: false, paidXp: 4.5, busy: false, onStep: () => {} }));
  check("list: a checkbox per step, ticked as today", (list.match(/type="checkbox"/g) ?? []).length === 2 && (list.match(/checked=""/g) ?? []).length === 1 && list.includes("Milk") && list.includes("Bread"));
  check("list: says the share and what it paid so far", list.includes("1 of 2 steps") && list.includes("paid 4.5 so far") && list.includes("Each step you tick pays its share"));
  const must = renderToStaticMarkup(createElement(StepsList, { steps: { ...steps, partial: false }, compulsory: true, paidXp: null, busy: false, onStep: () => {} }));
  check("list: a must says it pays only when every step is done", must.includes("A must pays only when every step is done."));
  const none = { add: async () => ({ ok: false as const, error: "x" }), rename: async () => ({ ok: false as const, error: "x" }), remove: async () => ({ ok: false as const, error: "x" }) };
  const ed = renderToStaticMarkup(createElement(StepsEditor, { templateId: "t", items: [], compulsory: false, save: none }));
  check("editor: an empty list invites the first step (Add a step)", ed.includes("Break it into steps") && ed.includes('placeholder="Add a step"'));
  const ed2 = renderToStaticMarkup(createElement(StepsEditor, { templateId: "t", items: steps.items, compulsory: false, save: none }));
  check("editor: each step can be renamed and removed", (ed2.match(/aria-label="Step \d"/g) ?? []).length === 2 && (ed2.match(/aria-label="Remove step/g) ?? []).length === 2);
}

// ── Wiring ──────────────────────────────────────────────────────────────────
{
  const tasks = read("src/lib/tasks.ts");
  const core = /export async function stepTickCore[\s\S]*?\n\}\n\nasync function stepTickOnce[\s\S]*?\n\}\n/.exec(tasks)?.[0] ?? "";
  check("server: a re-price takes the completions' lock and the freshness guard, in one transaction", /lifeLockOp\(userId\)/.test(core) && /freshnessGuardOp\(userId, day, read\.kneeRows/.test(core) && /prisma\.\$transaction\(ops\)/.test(core));
  check("server: the row that stood is undone exactly (undoEventInput) before the new one is written", /if \(live\) \{\s*ops\.push\(\s*activityOp\(\s*userId,\s*undoEventInput\(/.test(core) && /attempt: undoCount \+ \(live \? 1 : 0\)/.test(core));
  check("server: priced against the day without the row it replaces (ledgerWithout)", /const ledger = live \? ledgerWithout\(read\.ledger, live\) : read\.ledger;/.test(core));
  check("server: the rule is stepPayOf with the template's compulsory flag", /stepPayOf\(\{ compulsory: t\.compulsory, done: after\.size, total: ids\.length \}\)/.test(core));
  check("server: a task paid by a whole tick keeps it; its steps are a checklist", /const wholeTick = !!inst && isDoneStatus\(inst\.status\) && !liveSteps;/.test(core));
  check("server: an undo of a step-paid tick clears that day's ticks", /if \(paidByStepsOf\(ev\.receipt\)\) \{\s*ops\.push\(prisma\.taskSubtaskTick\.deleteMany/.test(tasks));
  check("server: the board loads steps in its own wave, fail soft", /loadSubtasks\(userId, day\)/.test(tasks) && /isMissingSubtaskTable/.test(read("src/lib/subtasks-server.ts")));
  const creates = ["src/lib/tasks.ts", "src/app/actions/capture.ts", "src/lib/capture-parse.ts"].filter((f) => /taskSubtask\.create/.test(read(f)));
  check("capture: no task is made with steps (only the drawer's add creates one)", creates.length === 0 && /prisma\.taskSubtask\.create\(/.test(read("src/lib/subtasks-server.ts")), creates.join(","));
  const drawer = read("src/components/today/TaskDrawer.tsx");
  check("drawer: the step editor shows only inside Edit", /\{editing && stepsAllowed\(t\) && row\.lane !== "yesterday" && \(\s*<StepsEditor/.test(drawer));
  const board = read("src/components/today/TodayBoard.tsx");
  check("board: a row with steps ticks through them (every step), its steps one by one", /onTick=\{\(from\) => \(viaSteps\(row\) \? tickSteps\(row, null, true, from\) : complete\(row, \{ minutes \}, from\)\)\}/.test(board) && /onStep=\{\(stepId, done, from\) => tickSteps\(row, stepId, done, from\)\}/.test(board));
  const sql = read("prisma/migrations/20261210000000_life_subtasks/migration.sql").replace(/--.*$/gm, "");
  check("migration: two new tables only, no ALTER, DROP or foreign key", (sql.match(/CREATE TABLE/g) ?? []).length === 2 && !/\b(ALTER|DROP|REFERENCES)\b/.test(sql));
}

console.log(`\nsubtasks-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * The credits guard (docs/life-plan/blueprint-plan-2026-10-22.md P0; blueprint 4.1 and D27): XP is
 * never spent, and the Mall spends credits only. So no file named credits* or mall* imports or
 * writes Domain points, a sink-TRACK (or DOMAIN) ActivityEvent row, or a MasteryLedgerEntry: credits
 * are their own derived ledger (P16), and a Mall purchase (P19) is a sink-NONE record that pays
 * and costs no XP, MP or point.
 *
 * A target is any file under src/ with a path segment that starts with credit or mall, read as
 * scripts/_ledger-writers.ts isTarget does (credits-server.ts, a mall/ folder and MallCard.tsx
 * count). P16 adds the first two, src/lib/credits.ts and src/lib/credits-server.ts; a later phase's
 * file that breaks the rule fails it at once. A target may not:
 *   - write the ledger directly: an ActivityEvent, MasteryLedgerEntry or CapitalLedgerEntry
 *     mutation (Prisma or raw SQL), or a Domain's totalPoints, or call a mint helper or
 *     domainDebitOp. An ActivityEvent row goes through activity.ts, so its sink is checked:
 *   - call recordActivity / activityOp / activityData without `sink: "NONE"` written in the call
 *     (activityData honours an explicit sink, pinned below): the row must be an object literal with
 *     `sink: "NONE"` among its own members and after its last spread (a later `...row` would
 *     override it); or name the helpers as a value (passed on, a call this check cannot read);
 *   - import a value from a writer module (_ledger-writers.ts writerModulesOf), except the names
 *     CREDITS_MAY_IMPORT lists: activity.ts's three ways in (checked per call above) and its
 *     post-commit helpers, tasks.ts lifeLockOp (P19's buy copies buyPerkCore's lock), and (P16)
 *     momentum-server's four read helpers the wallet counts Today's three with (readDayFacts,
 *     questRowsOf, questDone, emptyDayFacts), each pinned below to hold no write, no commit and no
 *     invalidation. So mastery.ts, capital.ts, srs.ts and every paying core stay out. `import type`
 *     is fine.
 * And (P16) no credits* or mall* file mutates any table at all, rolls a die (D32), or reads a penalty.
 *
 * P16, the derived ledger (blueprint 4.1, 4.2; D27 to D29), on fixtures: CREDITS_LAUNCH_DAY is null in
 * code and its override works outside production only; the model is the plan's table, whole credits,
 * null before the launch day; the fold's golden (3 quests + the 3-of-3 bonus + 2 kept track weeks =
 * 70); no backfill (the weekIsBackfill rule); goals, milestones and checkpoints only when they pay MP;
 * the Mall's buys and refunds; undoing a quest-completing tick lowers today's credits (credits-server's
 * readWallet over a fake store, through momentum-server's own questDone); with the switch null nothing
 * is read; the wallet on the web (the Quest sheet's price tags, the purse's line, the rules card) only
 * once credits count; balance-horizon 3g bars a credits import from every roadmap module.
 *
 * P17, the capital dividend retired (blueprint 4.2; D28, harm H19): it retires on the same switch
 * (credits.ts dividendRetiredOn), so with CREDITS_LAUNCH_DAY null nothing changes; once retired,
 * capital.ts claimDividend answers 'retired' before any read or write (run here with no database
 * reachable), the claim action refuses before it loads progression, and You › Stats stops computing
 * the dividend and shows the kept balance read only (null when unreadable, never a made-up 0). Every
 * row stays: the capital writes in src are still exactly claimDividend's, the unwired purchaseAugment's
 * and the typed 'everything' reset's, and no credits* or mall* file names capital (nothing converts).
 * scripts/capital-balance.ts, the lead's read of the live balance, is read only in its text: the
 * launch scripts' project-ref guard before its first query, three groupBy SELECTs and nothing else,
 * and no check chain runs it.
 *
 * P18, the Mall's catalog (blueprint 4.3; D30, harm H5): migration 20261231000000_mall is one
 * additive transaction (one table, its CHECKs and indexes, timestamptz, no data), and its price CHECK
 * is validatePrice's range, so both refuse 0 and 100001; the price hint is deterministic ("≈ 2 good
 * days", "calibrating" until 14 complete days of credits, and while they are off); only what the user
 * lists is priced (no starter reward anywhere: no insert but the Add's, an empty catalog lists
 * nothing) and #play, sleep, naps and rest days are refused, as is a #play task's own title; the
 * catalog's writes (on a fake store) need life writes on, and an archive keeps the row (no delete
 * exists); the page, the nav row and its bag icon, the honour copy and no Buy (P19). The P16 rule
 * above is extended, not loosened: a mall* file may write MallReward and nothing else, through
 * mall-server.ts alone, and no mall* file reaches mobile-api-cores (its paying cores).
 *
 * P19, the Mall's buy, burn and undo (blueprint 4.4, 4.5; D31, D32, harms H6 and H7): MALL_BUY and MALL_REFUND join the
 * ledger's vocabulary as sink-NONE, xp-0 records that are never streak days, written by mall-server.ts alone through one
 * activityOp call; a purchase burns exactly its price and never more than the balance (no overdraft); a balance below
 * zero (only an undone quest's doing) refuses every purchase and reads "earn it back"; a cooldown holds; two concurrent
 * buys (the Fold and the desktop) cannot overspend (lifeLockOp, the row-count guard, one re-read); a resend of the same
 * clientId writes once; an undo works only within 10 minutes, once; no penalty path names a Mall row or credits; the
 * receipt is mall-1; the Seal is one honest T2 per new purchase; nothing reads while credits are off. The rules above
 * are extended, never loosened: a mall* file may now import the Mall's own cores from mall-server.ts (a writer since
 * P19, held to the same sink-NONE rule here), its actions and its mobile binding, by name; and its mutations are the
 * P18 list plus the purchase's one $transaction and its guard's $executeRaw.
 *
 * No database, no model, no clock: text, pure functions and fake stores. Exits 1 on any failure.
 * DATABASE_URL and DIRECT_URL are pointed at an unroutable address before anything loads Prisma, so a
 * query a check did not mean to send fails here and never reaches a database (roadmap-measures-check's
 * idiom). _no-model comes first all the same: the fixtures below spell imports of writer actions, and
 * roadmap-contract-check's import walk follows them to roadmap modules.
 *
 *   npx tsx scripts/credits-check.ts
 */
import "./_no-model";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ACTIVITY_WRITERS,
  LEDGER_HELPERS,
  LEDGER_TABLE_WRITES,
  LEDGER_WRITES as LEDGER_WRITES_RE,
  ROOT,
  callArgsOf,
  codeOf,
  excerpt,
  importsOf,
  isTarget,
  readCode,
  splitTopLevel,
  srcFiles,
  withoutImports,
  writerModulesOf,
} from "./_ledger-writers";

// No database: any query fails at once on this address (nothing below means to send one; P17's claim proves it sends none).
process.env.DATABASE_URL = "postgresql://no-db:no-db@127.0.0.1:9/no_db";
process.env.DIRECT_URL = process.env.DATABASE_URL;

/** momentum-server's read helpers a credits file may import (P16): the day's facts and the quest-done rule. */
const MOMENTUM_READS = ["readDayFacts", "questRowsOf", "questDone", "emptyDayFacts"] as const;

/** credits* and mall*, as isTarget reads a path segment (credit covers credit-ledger and credits). */
const CREDITS_PREFIXES = ["credit", "mall"] as const;

/** The only values a target may import from a writer module, by module. */
const CREDITS_MAY_IMPORT: Readonly<Record<string, readonly string[]>> = {
  "src/lib/activity.ts": [...ACTIVITY_WRITERS, "invalidateActivity", "isDuplicateActivity", "activityTags"],
  "src/lib/tasks.ts": ["lifeLockOp"],
  // P16: the wallet counts Today's three exactly as Today does; each is pinned below to be a read.
  "src/lib/momentum-server.ts": [...MOMENTUM_READS],
  // P19: mall-server.ts writes the Mall's MALL_BUY and MALL_REFUND rows (activityOp, sink "NONE"), so it is a writer
  // module now, and its action and the action's carriers with it. Each is itself a mall* target that this rule reads, so a
  // Mall file may take the Mall's own cores from them, by name, and nothing else.
  "src/lib/mall-server.ts": ["loadMall", "addRewardCore", "editRewardCore", "archiveRewardCore", "buyRewardCore", "undoBuyCore", "withMallMoments"],
  "src/app/actions/mall.ts": ["addReward", "editReward", "archiveReward", "buyReward", "undoBuy"],
  "src/lib/mall-mobile-cores.ts": ["realMallDeps"],
};
/** The Mall's own writer modules (P19): mall-server, its action and the action's carriers; each a mall* target, so the rule above reads it too. */
const MALL_WRITERS = ["src/lib/mall-server.ts", "src/app/actions/mall.ts", "src/lib/mall-mobile-cores.ts", "src/app/you/mall/page.tsx"] as const;

/** The ledger helpers but activity.ts's own (those are allowed with `sink: "NONE"`). */
const MINT_HELPERS = new RegExp(LEDGER_HELPERS.source.replace(/recordActivity\|activityOp\|activityData\|/, ""));

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Why `code` (the file `rel`) breaks the rule; empty when it holds none. */
function offencesOf(rel: string, code: string, writers: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const table = excerpt(LEDGER_TABLE_WRITES, code);
  if (table) out.push(`writes the ledger directly (${table})`);
  const mint = excerpt(MINT_HELPERS, code);
  if (mint) out.push(`calls ${mint}`);
  const body = withoutImports(code);
  for (const name of ACTIVITY_WRITERS) {
    for (const args of callArgsOf(body, name)) {
      const flat = args.replace(/\s+/g, " ").slice(0, 80);
      // The row (the second argument, less a trailing `as …` or `satisfies …`), as an object literal's own
      // members: a nested `sink` or one in a value chosen at run time is not the row's.
      const row = (splitTopLevel(args)[1] ?? "").trim().replace(/\s+(?:as|satisfies)\s+[^{}()]*$/, "");
      const members = /^\{[\s\S]*\}$/.test(row) ? splitTopLevel(row.slice(1, -1)).map((m) => m.trim()) : [];
      const lastNone = members.map((m) => /^["']?sink["']?\s*:\s*["']NONE["']/.test(m)).lastIndexOf(true);
      const lastSpread = members.map((m) => m.startsWith("...")).lastIndexOf(true);
      if (/\bsink\s*:\s*["'](TRACK|DOMAIN)["']/.test(args)) out.push(`${name} writes a paying row (${flat})`);
      else if (lastNone < 0) out.push(`${name} without sink: "NONE" on the row written in the call (${flat})`);
      else if (lastSpread > lastNone) out.push(`${name} spreads a row after sink: "NONE", which can override it (${flat})`);
    }
    if (new RegExp(`\\b${name}\\b(?!\\s*\\()`).test(body)) out.push(`${name} used as a value (passed on, its rows can't be read here)`);
  }
  for (const i of importsOf(code, rel)) {
    if (i.resolved == null || !writers.has(i.resolved)) continue;
    const may = CREDITS_MAY_IMPORT[i.resolved] ?? [];
    const barred = i.names.filter((n) => !may.includes(n));
    if (barred.length) out.push(`imports ${barred.join(", ")} from the writer ${i.resolved}`);
  }
  return out;
}

const files = srcFiles();
const cache = new Map<string, string>();
const code = (rel: string) => cache.get(rel) ?? (cache.set(rel, readCode(rel)), cache.get(rel) as string);
const writers = writerModulesOf(files, code);

console.log("— the writers, and the names a credits file may import —");
{
  const known = ["src/lib/activity.ts", "src/lib/mastery.ts", "src/lib/capital.ts", "src/lib/srs.ts", "src/lib/tasks.ts", "src/app/actions/ideas.ts", "src/app/actions/skills.ts", "src/lib/idea-filing.ts"];
  const missing = known.filter((f) => !writers.has(f));
  check(
    "the scan finds the writers of MP (mastery, the emblem actions), capital, Domain points (srs, the idea actions and idea-filing's wrapper) and ActivityEvent rows (activity, tasks)",
    missing.length === 0,
    missing.length ? `missing ${missing.join(", ")}` : `${writers.size} writer modules among ${files.length} src files`
  );
  const gone = Object.entries(CREDITS_MAY_IMPORT).flatMap(([f, names]) =>
    names.filter((n) => !new RegExp(`^export\\s+(?:async\\s+)?(?:function|const)\\s+${n}\\b`, "m").test(code(f))).map((n) => `${f} ${n}`)
  );
  check("every name CREDITS_MAY_IMPORT allows is still exported where it says", gone.length === 0, gone.join(", "));
  check(
    "(P19) the Mall's writer modules are exactly mall-server.ts, its action and the action's two carriers (the mobile binding and You › Mall's page), each itself a mall* target held to this rule",
    MALL_WRITERS.every((m) => writers.has(m) && isTarget(m, CREDITS_PREFIXES)) && [...writers].filter((w) => isTarget(w, CREDITS_PREFIXES)).sort().join(",") === [...MALL_WRITERS].sort().join(","),
    [...writers].filter((w) => isTarget(w, CREDITS_PREFIXES)).join(", ")
  );
  const activity = code("src/lib/activity.ts");
  check(
    "activity.ts honours an explicit sink (activityData: e.sink ?? DEFAULT_SINK), and activityOp and recordActivity both build their row with it",
    /const sink = e\.sink \?\? DEFAULT_SINK\[e\.source\];/.test(activity) && callArgsOf(activity, "activityData").filter((a) => a.trim() === "userId, e").length >= 2
  );
  check("…and a lock is only a lock: tasks.ts lifeLockOp takes the advisory lock and writes nothing", /export function lifeLockOp\(userId: string\) \{\s*return prisma\.\$executeRaw`SELECT pg_advisory_xact_lock\(/.test(code("src/lib/tasks.ts")));
  // P16: momentum-server is a writer module (its commits), so a credits file may take only its read helpers, each a
  // function whose own body holds no ledger write, no Prisma mutation, no store commit and no cache invalidation.
  const ms = code("src/lib/momentum-server.ts");
  const bodyOf = (name: string): string => {
    const at = ms.search(new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`, "m"));
    if (at < 0) return "";
    const open = ms.indexOf("{", ms.indexOf(")", at));
    let depth = 0;
    for (let i = open; i < ms.length; i++) {
      if (ms[i] === "{") depth++;
      else if (ms[i] === "}" && --depth === 0) return ms.slice(at, i + 1);
    }
    return "";
  };
  const MUTATION = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$transaction|\.commit\s*\(|\binvalidate\w*\s*\(/;
  const unread = MOMENTUM_READS.filter((n) => {
    const b = bodyOf(n);
    return b.length === 0 || LEDGER_WRITES_RE.test(b) || MUTATION.test(b);
  });
  check(
    `…and momentum-server's ${MOMENTUM_READS.join(", ")} are reads: each body holds no ledger write, mutation, commit or invalidation (P16)`,
    unread.length === 0 && bodyOf("readDayFacts").includes("findMany") && bodyOf("questDone").includes("doneTemplates"),
    unread.join(", ")
  );
}

console.log("— the matcher, on fixtures —");
{
  const FROM = "src/lib/mall-server.ts";
  const caught: [string, string][] = [
    ["a TRACK row", `ops.push(activityOp(userId, { source: "TASK", sink: "TRACK", track: "DUTY", xp: 10 }));`],
    ["a DOMAIN row", `await recordActivity(userId, { source: "REVIEW", sink: "DOMAIN", xp: 2 });`],
    ["a row left to its source's default sink", `ops.push(activityOp(userId, { source: "MALL_BUY", xp: 0 }));`],
    ["a row whose input is built elsewhere", `ops.push(activityOp(userId, input));`],
    ['a spread after sink: "NONE" (the spread row\'s sink wins)', `ops.push(activityOp(userId, { sink: "NONE", ...paidRow }));`],
    ['sink: "NONE" only inside a nested value', `ops.push(activityOp(userId, { ...paidRow, receipt: { sink: "NONE" } }));`],
    ["a row chosen at run time", `ops.push(activityOp(userId, paid ? row : { source: "MALL_BUY", sink: "NONE", xp: 0 }));`],
    ["a helper passed on", `const ops = events.map(activityOp.bind(null, userId));`],
    ["a direct ActivityEvent create (it skips the sink rules)", `await prisma.activityEvent.create({ data });`],
    ["an MP mint", `ops.push(...mintLifeMasteryOps(userId, mint));`],
    ["an MP spend", `await prisma.masteryLedgerEntry.create({ data: { userId, amount: -40, reason: "MALL" } });`],
    ["a capital write", `await prisma.capitalLedgerEntry.create({ data });`],
    ["Domain points", `await prisma.domain.update({ where: { id }, data: { totalPoints: { decrement: 10 } } });`],
    ["Domain points through raw SQL", 'await prisma.$executeRaw`UPDATE "Domain" SET "totalPoints" = 0`;'],
    ["Domain points past a nested object", `await prisma.domain.update({ where: { id }, data: { level: { set: 2 }, totalPoints: 0 } });`],
    ["lower-case raw SQL into MasteryLedgerEntry", 'await prisma.$executeRaw`insert into "MasteryLedgerEntry" ("id") values (${id})`;'],
    ["a value import from mastery.ts (MP is not credits)", `import { getMasteryBalanceFresh } from "@/lib/mastery";`],
    ["a value import from srs.ts", `import { applyReviewResult } from "./srs";`],
    ["a paying core from tasks.ts", `import { completeInstanceCore, lifeLockOp } from "./tasks";`],
    ["a paying server action", `import { completeTask } from "@/app/actions/tasks";`],
    ["a lib wrapper around a paying action (idea-filing.ts calls submitIdea)", `import { fileIdeaDraftCore } from "@/lib/idea-filing";`],
  ];
  const clean: [string, string][] = [
    ["a NONE record and the allowed imports", `import { activityOp, isDuplicateActivity, invalidateActivity } from "./activity";\nimport { lifeLockOp } from "./tasks";\nconst ops = [lifeLockOp(userId), activityOp(userId, { source: "MALL_BUY", sink: "NONE", xp: 0, dedupeKey: \`buy:\${clientId}\` })];`],
    ['a spread before sink: "NONE", one nested after it, and a satisfies', `ops.push(activityOp(userId, { ...base, sink: "NONE", xp: 0, detail: [...parts].join(", ") } satisfies ActivityInput));`],
    ["type imports from the writers", `import type { ActivityInput } from "./activity";\nimport type { LifeMint } from "@/lib/mastery";`],
    ["a fold over rows it read", `const rows = await prisma.activityEvent.findMany({ where: { userId, source: { in: ["CHEST", "WEEK"] }, sink: "TRACK" } });`],
    ["a writer named in a comment", `// never mintLifeMasteryOps(userId, m) or activityOp(userId, e) here\nexport const PRICE_MIN = 1;`],
  ];
  // Through codeOf, as readCode reads every real file.
  const missed = caught.filter(([, src]) => offencesOf(FROM, codeOf(src), writers).length === 0).map(([n]) => n);
  const flagged = clean.flatMap(([n, src]) => {
    const o = offencesOf(FROM, codeOf(src), writers);
    return o.length ? [`${n}: ${o.join("; ")}`] : [];
  });
  check(`the matcher catches every way to pay or spend from a credits file (${caught.length} fixtures)`, missed.length === 0, missed.join(", "));
  check(`…and passes a sink-NONE record, the allowed imports, reads, types and comments (${clean.length} fixtures)`, flagged.length === 0, flagged.join(" | "));
}

console.log("— the rule —");
{
  const targets = files.filter((f) => isTarget(f, CREDITS_PREFIXES));
  const offenders = targets.flatMap((f) => offencesOf(f, code(f), writers).map((o) => `${f} ${o}`));
  check(
    "no credits* or mall* file imports or writes Domain points, a sink-TRACK ActivityEvent row or a MasteryLedgerEntry",
    offenders.length === 0,
    offenders.length ? offenders.join("; ") : targets.length ? `${targets.length} read: ${targets.join(", ")}` : "no such file yet (P16's credits and P18–P19's Mall files land here)"
  );
}

// ═══ P16: the derived ledger (blueprint 4.1, 4.2; D27, D28, D29) ═══════════════════════════════

/** P16's checks: pure fixtures, a fake store and static renders; no database, no clock. */
async function p16(): Promise<void> {
  const C = await import("../src/lib/credits");
  const S = await import("../src/lib/credits-server");
  const { weekIsBackfill, weekRowKey, BACKFILL_PREFIX, momentumMintKey, goalMintKey } = await import("../src/lib/life-economy");
  const { chestRowKey, summitChestRowKey, milestoneRowKey, checkpointRowKey, planWeekRowKey } = await import("../src/lib/momentum");
  const { weekKeyOf } = await import("../src/lib/life-day");

  console.log("— P16: the switch and the model —");
  const creditsSrc = code("src/lib/credits.ts");
  check(
    "CREDITS_LAUNCH_DAY is null in code (inert until the user's direct go), and this run sets no override",
    C.CREDITS_LAUNCH_DAY === null && /export const CREDITS_LAUNCH_DAY = null as DayKey \| null;/.test(creditsSrc) && process.env[C.CREDITS_LAUNCH_DAY_ENV] === undefined && C.creditsLaunchDay() === null
  );
  check(
    "the override XTNL_CREDITS_LAUNCH_DAY works outside production only, and only as a real day",
    C.creditsLaunchDay({ NODE_ENV: "development", XTNL_CREDITS_LAUNCH_DAY: "2026-10-26" }) === "2026-10-26" &&
      C.creditsLaunchDay({ NODE_ENV: "production", XTNL_CREDITS_LAUNCH_DAY: "2026-10-26" }) === null &&
      C.creditsLaunchDay({ NODE_ENV: "development", XTNL_CREDITS_LAUNCH_DAY: "2026-02-30" }) === null &&
      C.CREDITS_LAUNCH_DAY_ENV === "XTNL_CREDITS_LAUNCH_DAY"
  );
  check(
    "creditModelOn is dated: null before the launch day, credits-1 from it, null on every day while there is none",
    C.creditModelOn("2026-10-25", "2026-10-26") === null && C.creditModelOn("2026-10-26", "2026-10-26") === C.CREDITS_V1 && C.creditModelOn("2031-01-01", "2026-10-26") === C.CREDITS_V1 && C.creditModelOn("2031-01-01", null) === null && C.creditModelOn("2031-01-01") === null
  );
  const M = C.CREDITS_V1;
  const table = [M.quest, M.threeOfThree, M.keptWeek, M.planWeek, M.checkpoint, M.milestone, M.goal.SHORT, M.goal.MID, M.goal.LONG];
  check(
    "the income table is the plan's (D29): 10 a quest, 10 for 3 of 3, 15 a kept track week, 25 a plan week, 25 a checkpoint, 100 a milestone, goals 10 / 40×g / 120×g; whole credits",
    JSON.stringify(table) === JSON.stringify([10, 10, 15, 25, 25, 100, 10, 40, 120]) && table.every(Number.isInteger) && M.v === "credits-1",
    table.join(", ")
  );
  check(
    "goals: Short in full; Mid and Long × g (clamped to 0..1), rounded to a whole credit",
    C.goalCreditOf(M, "SHORT", 0.2) === 10 && C.goalCreditOf(M, "MID", 0.83) === 33 && C.goalCreditOf(M, "LONG", 0.7) === 84 && C.goalCreditOf(M, "MID", 1.4) === 40 && C.goalCreditOf(M, "MID", null) === 0 && C.goalCreditOf(M, "LONG", Number.NaN) === 0
  );

  console.log("— P16: the fold —");
  // Launch Wednesday 21 October; the wallet read on Wednesday 28th; the week of 19 October has its Sunday on the 25th.
  const L = "2026-10-21";
  const T = "2026-10-28";
  const SUN = "2026-10-25";
  const WK = weekKeyOf(SUN);
  type Row = import("../src/lib/credits").CreditRow;
  const row = (source: string, day: string, dedupeKey: string, over: Partial<Row> = {}): Row => ({ source, day, dedupeKey, qty: null, detail: null, templateId: null, ...over });
  const fold = (rows: Row[], questDays: { day: string; inForce: number; done: number }[] = [], extra: Partial<import("../src/lib/credits").CreditsFoldInput> = {}) =>
    C.foldCredits({ today: T, launchDay: L, questDays, rows, goalScores: new Map(), ...extra });
  const golden = fold([row("CHEST", T, chestRowKey(T)), row("WEEK", SUN, weekRowKey("BODY", WK), { qty: 1 }), row("WEEK", SUN, weekRowKey("CRAFT", WK), { qty: 1 })], [{ day: T, inForce: 3, done: 3 }]);
  check(
    "the fold's golden: 3 quests + the 3-of-3 bonus + 2 kept track weeks = 70 (today 40: the weeks are dated their Sunday)",
    golden.earned === 70 && golden.balance === 70 && golden.today === 40 && golden.byKind.QUEST === 30 && golden.byKind.THREE_OF_THREE === 10 && golden.byKind.KEPT_WEEK === 30,
    JSON.stringify({ earned: golden.earned, today: golden.today, byKind: golden.byKind })
  );
  const none = fold(
    [
      row("WEEK", "2026-10-18", weekRowKey("BODY", weekKeyOf("2026-10-18")), { qty: 1 }),
      row("WEEK", SUN, weekRowKey("DUTY", WK), { qty: 1, detail: `${BACKFILL_PREFIX}kept` }),
      row("WEEK", SUN, weekRowKey("CARE", WK), { qty: 0, detail: "Held · 5 rest days" }),
      row("CHEST", "2026-10-20", chestRowKey("2026-10-20")),
      row("CHEST", T, summitChestRowKey("lin-1")),
      row("CHEST", "2026-10-29", chestRowKey("2026-10-29")),
      row("PLAN_WEEK", "2026-10-18", planWeekRowKey("qw-0")),
      row("DEBT", T, "debt:x", { qty: 20 }),
      row("FORGET", T, "forget:x", { qty: 5 }),
    ],
    [
      { day: "2026-10-20", inForce: 3, done: 3 },
      { day: "2026-10-29", inForce: 3, done: 3 },
    ]
  );
  check(
    "no backfill and nothing else counts: a day or a week's Sunday before the launch day, a backfill week, a held week (qty 0), a Summit chest, a row dated after today, a debt or a forgotten level",
    none.earned === 0 && none.lines.length === 0 && none.balance === 0,
    JSON.stringify(none.lines)
  );
  // The weekIsBackfill rule: launch Wednesday 21st, the week of the 19th has its Sunday on the 25th, so it counts.
  check(
    "a week counts by its Sunday, as weekIsBackfill reads it: the week of 19 Oct (Sunday the 25th) counts from a Wednesday launch; the week before does not",
    !weekIsBackfill(SUN, L) && weekIsBackfill("2026-10-18", L) && fold([row("WEEK", SUN, weekRowKey("BODY", WK), { qty: 1 })]).earned === M.keptWeek
  );
  const goalRows = [
    row("MP_MINT", T, goalMintKey("g-short"), { qty: 1, detail: "GOAL_SHORT", templateId: "g-short" }),
    row("MP_MINT", T, goalMintKey("g-mid"), { qty: 4.98, detail: "GOAL_MID", templateId: "g-mid" }),
    row("MP_MINT", T, goalMintKey("g-long"), { qty: 14, detail: "GOAL_LONG", templateId: "g-long" }),
    row("MP_MINT", T, goalMintKey("g-zero"), { qty: 0, detail: "GOAL_MID · below 70%", templateId: "g-zero" }),
    row("MP_MINT", T, goalMintKey("g-unscored"), { qty: 3, detail: "GOAL_MID", templateId: "g-unscored" }),
  ];
  const goals = fold(goalRows, [], { goalScores: new Map([["g-mid", 0.83], ["g-long", 0.7], ["g-zero", 0.5]]) });
  check(
    "goals pay only when their close paid MP (its bar, age and windows): Short 10, Mid 40 × 0.83 = 33, Long 120 × 0.7 = 84; a close that paid 0 and a Mid with no score pay nothing",
    goals.byKind.GOAL === 10 + 33 + 84 && goals.lines.length === 3,
    JSON.stringify(goals.lines)
  );
  const road = fold([
    row("MILESTONE", "2026-10-22", milestoneRowKey("lin-a")),
    row("MP_MINT", "2026-10-22", momentumMintKey("LIFE_MILESTONE", "lin-a"), { qty: 50 }),
    row("MILESTONE", "2026-10-23", milestoneRowKey("lin-b")),
    row("MP_MINT", "2026-10-23", momentumMintKey("LIFE_MILESTONE", "lin-b"), { qty: 0, detail: "LIFE_MILESTONE · 2 milestones paid in the last 30 days" }),
    row("CHECKPOINT", "2026-10-22", checkpointRowKey("it-a")),
    row("MP_MINT", "2026-10-22", momentumMintKey("LIFE_CHECKPOINT", "it-a"), { qty: 12 }),
    row("CHECKPOINT", "2026-10-24", checkpointRowKey("it-b")),
    row("PLAN_WEEK", SUN, planWeekRowKey("qw-1")),
  ]);
  check(
    "milestones and checkpoints pay only when their MP paid (MP's own 30-day windows): 100 and 25; one refused by the window and one with no mint pay nothing; a kept plan week 25",
    road.byKind.MILESTONE === 100 && road.byKind.CHECKPOINT === 25 && road.byKind.PLAN_WEEK === 25 && road.earned === 150,
    JSON.stringify(road.lines)
  );
  const mall = fold([row("CHEST", T, chestRowKey(T))], [{ day: T, inForce: 3, done: 3 }], {
    spends: [
      { source: "MALL_BUY", day: T, qty: 30 },
      { source: "MALL_REFUND", day: T, qty: 30 },
      { source: "MALL_BUY", day: T, qty: 25 },
      { source: "MALL_BUY", day: "2026-10-20", qty: 99 },
    ],
  });
  check(
    "balance = earned − bought + refunded (the Mall's rows, P19): 40 − 55 + 30 = 15; a row before the launch day counts nothing",
    mall.earned === 40 && mall.spent === 55 && mall.refunded === 30 && mall.balance === 15
  );
  const allLines = [...golden.lines, ...goals.lines, ...road.lines, ...mall.lines];
  check("every line is a whole, positive number of credits", allLines.length > 0 && allLines.every((l) => Number.isInteger(l.amount) && l.amount > 0));
  check(
    "a quest day counts its done quests only up to the quests in force, never twice for one day",
    fold([], [{ day: T, inForce: 2, done: 3 }, { day: T, inForce: 3, done: 3 }]).byKind.QUEST === 20
  );

  console.log("— P16: the wallet's reads (a fake store) —");
  type Store = import("../src/lib/credits-server").CreditsStore;
  const quest = {
    plan: { slot: "PLAN" as const, kind: "TEMPLATE" as const, role: "PRACTICE" as const, templateId: "t-plan", roadmapId: "r1", title: "Plan practice" },
    body: { slot: "BODY" as const, kind: "TEMPLATE" as const, templateId: "t-body", title: "Walk" },
    task: { slot: "TASK" as const, kind: "TEMPLATE" as const, templateId: "t-task", track: "CRAFT" as const, raw: 12, score: 12, title: "Write" },
  };
  const NOW = new Date("2026-10-28T02:00:00.000Z"); // Wednesday 28 October, 13:00 in Sydney
  const facts = (done: string[]) => ({ ...emptyFacts(T), doneTemplates: new Set(done) });
  const emptyFacts = (await import("../src/lib/momentum-server")).emptyDayFacts;
  const fakeStore = (done: string[], calls: string[]): Store => ({
    questSets: async (_u, from, to) => {
      calls.push(`questSets ${from}..${to}`);
      return [{ source: "QUEST_SET", day: T, receipt: { v: "quests-1", day: T, quests: [quest.plan, quest.body, quest.task] } }];
    },
    dayFacts: async (_u, days) => {
      calls.push(`dayFacts ${days.length}`);
      return new Map(days.map((d) => [d, d === T ? facts(done) : emptyFacts(d)]));
    },
    incomeRows: async () => {
      calls.push("incomeRows");
      return [row("CHEST", T, chestRowKey(T)), row("WEEK", SUN, weekRowKey("BODY", WK), { qty: 1 }), row("WEEK", SUN, weekRowKey("CRAFT", WK), { qty: 1 })];
    },
    goalScores: async () => {
      calls.push("goalScores");
      return new Map();
    },
    spendRows: async () => {
      calls.push("spendRows");
      return [];
    },
  });
  const calls: string[] = [];
  const all3 = await S.readWallet("u1", NOW, { store: fakeStore(["t-plan", "t-body", "t-task"], calls), launchDay: L });
  const undone = await S.readWallet("u1", NOW, { store: fakeStore(["t-plan", "t-body"], []), launchDay: L });
  check(
    "readWallet over a fake store: 3 of 3 done (momentum-server's questDone over the day's facts), the chest and 2 kept weeks = 70, today 40",
    all3.live && all3.balance === 70 && all3.today === 40,
    JSON.stringify(all3)
  );
  check(
    "undoing a quest-completing tick lowers today's credits by its 10 on the next read (the chest, opened at 3 of 3, stays, as the chest itself does)",
    all3.live && undone.live && undone.today === all3.today - M.quest && undone.balance === all3.balance - M.quest && undone.byKind.THREE_OF_THREE === M.threeOfThree,
    JSON.stringify(undone)
  );
  check(
    "one wave of reads from the launch day through today (8 days of facts), then the closed goals' g; the store has no write to call",
    calls.slice(0, 4).sort().join(" | ") === ["dayFacts 8", `questSets ${L}..${T}`, "incomeRows", "spendRows"].sort().join(" | ") && calls[4] === "goalScores" && calls.length === 5,
    calls.join(" | ")
  );
  check("the default store is reads only: its five methods, each a findMany (or momentum-server's readDayFacts)", (() => {
    const src = code("src/lib/credits-server.ts");
    const storeSrc = src.slice(src.indexOf("export const prismaCreditsStore"), src.indexOf("/** The life days from the launch day"));
    return Object.keys(S.prismaCreditsStore).sort().join(",") === "dayFacts,goalScores,incomeRows,questSets,spendRows" && (storeSrc.match(/\.findMany\(/g) ?? []).length === 4 && /dayFacts: readDayFacts,/.test(storeSrc);
  })());
  const offCalls: string[] = [];
  const off = await S.loadWallet("u1", NOW, { store: fakeStore([], offCalls), launchDay: null });
  const ahead = await S.loadWallet("u1", NOW, { store: fakeStore([], offCalls), launchDay: "2026-11-02" });
  const shipped = await S.loadWallet("u1", NOW, { store: fakeStore([], offCalls) });
  const shippedRead = await S.readWallet("u1", NOW, { store: fakeStore([], offCalls) });
  check(
    "with the switch null (as shipped), or a launch day still ahead, the wallet is {live: false} and nothing is read",
    !off.live && !ahead.live && !shipped.live && !shippedRead.live && offCalls.length === 0 && off.day === T
  );

  console.log("— P16: credits* and mall* files write nothing, roll nothing, read no penalty —");
  const targets = files.filter((f) => isTarget(f, CREDITS_PREFIXES));
  const ANY_MUTATION = /\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$queryRaw|\$transaction/;
  const mutating = targets.filter((f) => isTarget(f, ["credit"]) && ANY_MUTATION.test(code(f)));
  // Extended for P18 (never loosened): the Mall's catalog is a table of its own, so a mall* file may write it, and only
  // it: every mutation in every credits* or mall* file is listed here, and the list must be exactly mall-server.ts's
  // MallReward create (a reward listed) and its two updateMany (an edit, an archive), and editRewardCore's call of the
  // store's own update (prismaMallStore.update is that edit's updateMany; P18 pins the store's methods). No delete (an
  // archive keeps the row), and nothing in a credits* file at all. Extended for P19: the purchase store's one $transaction
  // and its guard's $executeRaw (a SELECT that divides by zero); its row goes through activityOp, which P19 pins.
  const MUTATION_CALLS = /\b(\w+)\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(|\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe|transaction)\b/g;
  const mutations = targets.flatMap((f) => [...code(f).matchAll(MUTATION_CALLS)].map((m) => `${f} ${m[1] ? `${m[1]}.${m[2]}` : `$${m[3]}`}`)).sort();
  check(
    "no credits* file mutates any table or runs raw SQL (the fold writes no rows); a mall* file's only mutations are mall-server.ts's MallReward create and updateMany (P18's catalog: a reward listed, edited or archived) and (P19) the purchase's one $transaction and its guard's $executeRaw",
    targets.includes("src/lib/credits.ts") &&
      targets.includes("src/lib/credits-server.ts") &&
      mutating.length === 0 &&
      JSON.stringify(mutations) ===
        JSON.stringify(["src/lib/mall-server.ts $executeRaw", "src/lib/mall-server.ts $transaction", "src/lib/mall-server.ts mallReward.create", "src/lib/mall-server.ts mallReward.updateMany", "src/lib/mall-server.ts mallReward.updateMany", "src/lib/mall-server.ts store.update"]),
    [...mutating, ...mutations].join(", ")
  );
  const rolling = targets.filter((f) => /Math\.random|\broll\s*\(|momentumRoll|momentum-roll|createHmac/.test(code(f)));
  check("credits are deterministic (D32): no credits* or mall* file draws a random number or rolls", rolling.length === 0, rolling.join(", "));
  const penal = targets.filter((f) => /["'](DEBT|DEBT_REPAID|DEBT_WRITTEN_OFF|FORGET|UNDO)["']/.test(code(f)));
  check(
    "penalties never debit credits (D31): the fold reads only its income and the Mall's rows, and no credits* or mall* file names a debt, forgetting or undo source",
    JSON.stringify([...C.CREDIT_SOURCES]) === JSON.stringify(["CHEST", "WEEK", "PLAN_WEEK", "MILESTONE", "CHECKPOINT", "MP_MINT"]) && JSON.stringify([...C.CREDIT_SPEND_SOURCES]) === JSON.stringify(["MALL_BUY", "MALL_REFUND"]) && penal.length === 0,
    penal.join(", ")
  );
  check("the wallet reads its quests through momentum-server's own rule (questRowsOf, questDone): no second copy of 'done'", /questRowsOf\(sets, day\)/.test(code("src/lib/credits-server.ts")) && /questDone\(x, f\)/.test(code("src/lib/credits-server.ts")) && !/doneTemplates/.test(code("src/lib/credits-server.ts")));
  check("the wallet is cached on the life, activity and roadmap tags, and never while off", /return cached\(`credits:wallet:\$\{userId\}:\$\{today\}:\$\{launch\}`, \["life", "activity", "roadmap"\]/.test(code("src/lib/credits-server.ts")) && /if \(launch == null \|\| !creditsOn\(today, launch\)\) return OFF_WALLET\(today\);\s*if \(deps\.store\)/.test(code("src/lib/credits-server.ts")));
  {
    // The review of 2026-10-24: a wallet load that left before a write committed (a tick's 'activity') must neither be
    // stored for the TTL nor handed to a caller who reads after the write (the phone's second tick joining the first's).
    const { cached, invalidate, invalidateAll } = await import("../src/lib/cache");
    let loads = 0;
    const hold: { release?: () => void } = {};
    const gate = new Promise<void>((r) => (hold.release = r));
    const slow = () => cached("credits-check:inflight", ["activity"], async () => (++loads === 1 ? (await gate, "before the write") : "after the write"));
    const first = slow();
    const joined = slow();
    invalidate("activity"); // the write commits while the first load is out
    const after = slow();
    hold.release?.();
    const got = await Promise.all([first, joined, after]);
    const next = await slow();
    let epochLoads = 0;
    const untagged = () => cached("credits-check:untagged", [], async () => ++epochLoads);
    await untagged();
    invalidate("activity", "life");
    const keptThroughWrites = (await untagged()) === 1;
    invalidateAll();
    const forgotten = (await untagged()) === 2;
    check(
      "the cache (lib/cache.ts) never keeps a load that left before a write: a caller before the write joins it, one after starts its own, and the old one is not stored; an untagged entry survives a write but not a reset",
      got[0] === "before the write" && got[1] === "before the write" && got[2] === "after the write" && next === "after the write" && loads === 2 && keptThroughWrites && forgotten,
      `${JSON.stringify(got)} then ${next}; ${loads} loads`
    );
  }

  console.log("— P16: the wallet on the web —");
  const { QuestRows, questCreditTagOf, questCreditFootOf } = await import("../src/components/today/QuestSheet");
  const { CharacterHero } = await import("../src/components/home/CharacterHero");
  const { titleDistance } = await import("../src/components/home/sheet-math");
  const views = [
    { slot: "PLAN" as const, quest: quest.plan, identity: "PLAN:TEMPLATE:t-plan", done: true, swapsLeft: 0 },
    { slot: "TASK" as const, quest: { ...quest.task, why: "Your biggest due task" }, identity: "TASK:TEMPLATE:t-task", done: false, swapsLeft: 1 },
  ];
  const tags = C.creditTagsOn(L, L);
  const rowsOff = renderToStaticMarkup(createElement(QuestRows, { quests: views, prices: { "t-task": 23.4 } }));
  const rowsNull = renderToStaticMarkup(createElement(QuestRows, { quests: views, prices: { "t-task": 23.4 }, credits: C.creditTagsOn(L) }));
  const rowsOn = renderToStaticMarkup(createElement(QuestRows, { quests: views, prices: { "t-task": 23.4 }, credits: tags, frozen: true })).replace(/<!-- -->/g, "");
  const rowsPreview = renderToStaticMarkup(createElement(QuestRows, { quests: views, prices: { "t-task": 23.4 }, credits: tags, frozen: false })).replace(/<!-- -->/g, "");
  check(
    "the Quest sheet's rows: no tag while credits are off (the markup is exactly as before); '+10 cr' on an open row and '+10 cr earned' on a done one once they count",
    C.creditTagsOn(L) === null && rowsNull === rowsOff && !/mo-cr|\bcr\b/.test(rowsOff) && tags != null && rowsOn.includes(">+10 cr<") && rowsOn.includes(">+10 cr earned<") &&
      questCreditTagOf({ done: false }, null) === null && questCreditFootOf(null) === null && questCreditFootOf(tags) === "Each done adds +10 cr · 3 of 3 adds +10 cr when the chest opens"
  );
  // The review of 2026-10-24: a preview (no QUEST_SET row yet, frozen false) is a day the wallet skips, and the set fixed
  // later may differ, so a done preview row never claims credits "earned"; the sheet passes the view's own frozen.
  check(
    "…and on a preview day (the set not written yet) a done row says only '+10 cr', never 'earned', and the footer says credits count once the set is fixed; the sheet passes its frozen to the rows",
    tags != null && !rowsPreview.includes("earned") && (rowsPreview.match(/>\+10 cr</g) ?? []).length === 2 &&
      questCreditTagOf({ done: true }, tags) === "+10 cr" && questCreditTagOf({ done: true }, tags, true) === "+10 cr earned" &&
      questCreditFootOf(tags, false) === "Each done adds +10 cr · 3 of 3 adds +10 cr when the chest opens · credits count once the day's set is fixed" &&
      /credits=\{credits\} frozen=\{frozen\} \/>/.test(code("src/components/today/QuestSheet.tsx")) && /\{questCreditFootOf\(credits, frozen\)\}/.test(code("src/components/today/QuestSheet.tsx")) &&
      /frozen=\{view\.frozen\}/.test(code("src/components/today/MomentumCard.tsx"))
  );
  const hero = (credits: { balance: number; today: number } | null) =>
    renderToStaticMarkup(createElement(CharacterHero, { level: 14, progress: 0.5, title: "Adept", epithet: "of the Deep Archive", transcendent: false, dominant: null, distance: titleDistance(14.5), tracks: null, balance: 100, credits, mastered: 3, owned: 3, poolSize: 10, seenKey: "check:credits" }));
  const heroOff = hero(null).replace(/<!-- -->/g, "");
  const heroOn = hero({ balance: 1240, today: 40 }).replace(/<!-- -->/g, "");
  check(
    "the purse: no Credits line while credits are off; once they count, the balance and what today earned ('1,240 cr', '+40 cr today'; 'none yet today' at 0)",
    !/purse-cr|Credits/.test(heroOff) && heroOn.includes("purse-cr") && heroOn.includes("1,240 cr") && heroOn.includes("+40 cr today") && hero({ balance: 0, today: 0 }).replace(/<!-- -->/g, "").includes("none yet today")
  );
  const page = code("src/app/today/page.tsx");
  const board = code("src/components/today/TodayBoard.tsx");
  const card = code("src/components/today/MomentumCard.tsx");
  check(
    "Today passes creditTagsOn(day) (no read) through TodayBoard and the Momentum card to the Quest sheet",
    /const credits = creditTagsOn\(day\);/.test(page) && /credits=\{credits\}/.test(page) && /settled=\{momentumSettled\} credits=\{credits\} \/>/.test(board) && /credits=\{credits\}\s*\/>/.test(card)
  );
  const rules = code("src/app/today/rules/page.tsx");
  check(
    "the rules page: the Credits card only once credits count (creditModelOn today), every figure from credits.ts; the Ground rules line says whether they count yet",
    /const creditsModel = creditModelOn\(today, creditsLaunch\);/.test(rules) &&
      /\{creditsModel && creditsLaunch && \(\s*<section aria-labelledby="rules-credits"/.test(rules) &&
      /<Card id="credits" title="Credits: earned by doing"/.test(rules) &&
      /creditRows\(model\)\.map/.test(rules) &&
      /const creditsCount = creditModelOn\(todayKey\(\)\) != null;/.test(rules) &&
      /Credits are built but not counted yet/.test(read("src/app/today/rules/page.tsx")) &&
      /it runs on honour/.test(read("src/app/today/rules/page.tsx"))
  );
  const rowsText = C.creditRows(M).map((r) => `${r.amount} ${r.per}`).join(" | ");
  check(
    "the published table is the model's and MP's own windows: every figure in creditRows comes from CREDITS_V1 or ROADMAP_MP_WINDOWS",
    C.creditRows(M).length === C.CREDIT_KINDS.length && rowsText.includes("2 in any 30 days") && rowsText.startsWith("10 each") && !/\b\d+\b/.test(creditsSrc.slice(creditsSrc.indexOf("export function creditRows"), creditsSrc.indexOf("export function creditRows") + 2000).replace(/\$\{[^}]*\}/g, "")),
    rowsText
  );

  console.log("— P16: the roadmap never touches credits (balance-horizon 3g) —");
  const bh = read("scripts/balance-horizon.ts");
  const ledgerWriters = bh.slice(bh.indexOf("const LEDGER_WRITERS ="), bh.indexOf("const offenders = roadmapFiles"));
  check(
    "balance-horizon 3g's matcher also bars a credits* or mall* import from every roadmap module (its printed line is unchanged)",
    ledgerWriters.includes(String.raw`([Cc]redit|[Mm]all)[\w-]*["']/;`) && ledgerWriters.includes(String.raw`@\/lib\/|@\/components\/`)
  );
}

// ═══ P17: the capital dividend retired (blueprint 4.2; D28, harm H19) ═══════════════════════════

/** P17's checks: the switch, the refusals, the page's wiring, the rows kept, and the balance script read only. */
async function p17(): Promise<void> {
  const C = await import("../src/lib/credits");
  console.log("— P17: the dividend retires with credits, on the same switch (D28) —");
  check(
    "dividendRetiredOn is creditsOn: never while the switch is null (as shipped, so nothing changes until the user's go), not before the launch day, and from it on",
    !C.dividendRetiredOn("2031-01-01") &&
      !C.dividendRetiredOn("2031-01-01", null) &&
      !C.dividendRetiredOn("2026-10-25", "2026-10-26") &&
      C.dividendRetiredOn("2026-10-26", "2026-10-26") &&
      C.dividendRetiredOn("2031-01-01", "2026-10-26") &&
      /export function dividendRetiredOn\(day: DayKey, launchDay: DayKey \| null = creditsLaunchDay\(\)\): boolean \{\s*return creditsOn\(day, launchDay\);\s*\}/.test(code("src/lib/credits.ts"))
  );
  check(
    "capital.ts claimDividend's first statement is the retirement: 'retired' before pendingDividend, a balance read or the row it writes",
    /export async function claimDividend\(\s*userId: string,\s*activeSkills: Skill\[\],\s*now: Date = new Date\(\),\s*launchDay\?: DayKey \| null\s*\): Promise<ClaimResult> \{\s*if \(dividendRetiredOn\(todayKey\(now\), launchDay\)\) return \{ status: "retired" \};\s*const pending = await pendingDividend\(/.test(code("src/lib/capital.ts"))
  );
  // Run for real: no database is reachable from this process, so a read or a write would throw rather than answer.
  const Cap = await import("../src/lib/capital");
  const refused = await Cap.claimDividend("u1", [], new Date("2026-10-28T02:00:00.000Z"), "2026-10-21").catch((err: unknown) => ({
    threw: (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 100),
  }));
  check(
    "…and run with no database reachable, a claim on or after the launch day answers {status: 'retired'}: nothing read, nothing written",
    JSON.stringify(refused) === JSON.stringify({ status: "retired" }),
    JSON.stringify(refused)
  );
  const action = code("src/app/actions/capital.ts");
  check(
    "the claim action refuses before it loads progression (claimDividend refuses on its own too), says so honestly and revalidates Stats; no claim is reported",
    /export async function claimCapital\(\): Promise<ClaimActionResult> \{\s*try \{\s*if \(dividendRetiredOn\(todayKey\(\)\)\) \{\s*revalidatePath\("\/you\/stats"\);\s*return \{ ok: false, error: RETIRED \};\s*\}\s*const userId = getCurrentUserId\(\);\s*const progression = await loadProgressionFresh\(userId\);/.test(action) &&
      /if \(res\.status === "retired"\) \{\s*revalidatePath\("\/you\/stats"\);\s*return \{ ok: false, error: RETIRED \};\s*\}/.test(action) &&
      /const RETIRED = "The dividend has stopped: credits replaced it\. Your capital is kept as it was\.";/.test(action)
  );
  const stats = code("src/app/you/_lib/stats.ts");
  check(
    "You › Stats stops computing the dividend once retired (no pendingDividend call) and reads the kept balance as it was: null when unreadable, never a made-up 0; while it runs, the same figures as before",
    /const retiredSince = creditsLaunch != null && dividendRetiredOn\(todayKey\(now\), creditsLaunch\) \? creditsLaunch : null;/.test(stats) &&
      /retiredSince != null\s*\? Promise\.resolve\(null\)\s*: pendingDividend\(userId, progression\.activeSkills\)/.test(stats) &&
      /getCapitalBalance\(userId\)\.catch\(\(\) => null\)/.test(stats) &&
      /\? \{ retired: true, since: retiredSince, balance \}/.test(stats) &&
      /: \{ retired: false, amount: pending\?\.amount \?\? 0, perHour: pending\?\.perHour \?\? 0, capped: pending\?\.capped \?\? false, balance: balance \?\? 0 \}/.test(stats)
  );

  console.log("— P17: every row stays, nothing converts, no new capital writer —");
  const CAPITAL_WRITE =
    /\bcapitalLedgerEntry\s*\.\s*(create|createMany|createManyAndReturn|upsert|update|updateMany|delete|deleteMany)\b|\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"public"\.)?"CapitalLedgerEntry"/gi;
  const capitalWrites = files.flatMap((f) => [...code(f).matchAll(CAPITAL_WRITE)].map((m) => `${f} ${m[1] ?? m[2]}`)).sort();
  check(
    "the capital writes in src are still exactly claimDividend's and purchaseAugment's creates (capital.ts) and the typed 'everything' reset's deleteMany (reset.ts): P17 adds no writer and deletes no row",
    JSON.stringify(capitalWrites) === JSON.stringify(["src/app/actions/reset.ts deleteMany", "src/lib/capital.ts create", "src/lib/capital.ts create"]),
    capitalWrites.join(", ")
  );
  const augmentCallers = files.filter((f) => f !== "src/lib/capital.ts" && /\bpurchaseAugment\b/.test(code(f)));
  check("purchaseAugment stays unwired: no src file but capital.ts names it", augmentCallers.length === 0, augmentCallers.join(", "));
  const targets = files.filter((f) => isTarget(f, CREDITS_PREFIXES));
  const naming = targets.filter((f) => /capital|pendingDividend|claimDividend/i.test(code(f)));
  check(
    "nothing converts capital into credits: no credits* or mall* file names capital in its code (the fold reads only its own sources)",
    targets.length > 0 && naming.length === 0,
    naming.join(", ")
  );

  console.log("— P17: scripts/capital-balance.ts reads the live balance, read only —");
  const raw = read("scripts/capital-balance.ts");
  const script = code("scripts/capital-balance.ts");
  const statics = [...raw.matchAll(/^import\s+(?:type\s+)?(?:[^;]*?from\s+)?"([^"]+)";/gm)].map((m) => m[1]);
  check(
    "its first two imports are _no-model and dotenv/config (no model can be called; the URLs it checks are the ones Prisma will use)",
    statics[0] === "./_no-model" && statics[1] === "dotenv/config",
    statics.join(", ")
  );
  const MUTATES = /\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(|\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe|transaction|runCommandRaw)\b/;
  const queries = [...script.matchAll(/\bprisma\.(\w+)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`);
  check(
    "its text holds no mutation, raw SQL, transaction or ledger write: its only queries are three groupBy SELECTs (CapitalLedgerEntry by user and by reason, EmblemAugment by user)",
    !MUTATES.test(script) && !LEDGER_WRITES_RE.test(script) && JSON.stringify(queries) === JSON.stringify(["capitalLedgerEntry.groupBy", "capitalLedgerEntry.groupBy", "emblemAugment.groupBy"]),
    queries.join(", ")
  );
  const main = script.slice(script.indexOf("async function main("));
  const guardAt = main.indexOf("const target = launchTargetOf({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL });");
  const refuseAt = main.search(/if \(target\.kind === "refused"\) \{[\s\S]*?process\.exitCode = 2;\s*return;\s*\}/);
  const firstQuery = main.search(/\bprisma\.\w+\.\w+\s*\(/);
  check(
    "the launch scripts' project-ref guard (settlement.ts launchTargetOf: xtnl-idea or the rehearsal mirror) runs before its first query, and a refusal exits 2 with nothing read",
    guardAt >= 0 && refuseAt > guardAt && firstQuery > refuseAt && /import \{ launchTargetOf \} from "\.\.\/src\/lib\/settlement";/.test(raw)
  );
  check(
    "it reads the switch as the production server does (the code constant; the rehearsal override only on the mirror), and says it wrote nothing",
    /const launch: DayKey \| null = target\.kind === "rehearsal" \? creditsLaunchDay\(\) : CREDITS_LAUNCH_DAY;/.test(script) &&
      /dividendRetiredOn\(today, launch\)/.test(script) &&
      /Nothing was written: three SELECTs, no conversion\./.test(script)
  );
  const pkg = readFileSync(join(ROOT, "package.json"), "utf8");
  check("no check chain (or any package.json script) runs it: it reads a real database, for the lead only", !/capital-balance/.test(pkg));
}

// ═══ P18: the Mall's catalog (blueprint 4.3; D30, harm H5) ═══════════════════════════════════════

/** P18's checks: the migration's text, the pure rules, the catalog's cores on a fake store, the web's renders. */
async function p18(): Promise<void> {
  const M = await import("../src/lib/mall");
  const S = await import("../src/lib/mall-server");
  const C = await import("../src/lib/credits");
  const CS = await import("../src/lib/credits-server");
  const { normTitleOf } = await import("../src/lib/life-lexicon");
  const { addDays, todayKey } = await import("../src/lib/life-day");
  type Row = import("../src/lib/mall").MallRewardRow;
  type Store = import("../src/lib/mall-server").MallStore;

  console.log("— P18: migration 20261231000000_mall and the model —");
  const sqlRaw = read("prisma/migrations/20261231000000_mall/migration.sql");
  const sql = sqlRaw.replace(/--.*$/gm, "");
  const stmts = sql.split(";").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  const shapes = stmts.map((x) =>
    x === "BEGIN" || x === "COMMIT"
      ? x
      : /^CREATE TABLE "public"\."MallReward" \(/.test(x)
        ? "TABLE"
        : /^ALTER TABLE "public"\."MallReward" ADD CONSTRAINT "MallReward_\w+_check" CHECK \(/.test(x)
          ? "CHECK"
          : /^CREATE (UNIQUE )?INDEX "MallReward_\w+" ON "public"\."MallReward"\(/.test(x)
            ? "INDEX"
            : `other: ${x.slice(0, 60)}`
  );
  check(
    "the migration is one transaction that adds one table, its five CHECKs and its two indexes, and nothing else (additive: no DROP, RENAME, other table or data)",
    JSON.stringify(shapes) === JSON.stringify(["BEGIN", "TABLE", "CHECK", "CHECK", "CHECK", "CHECK", "CHECK", "INDEX", "INDEX", "COMMIT"]) && !/\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE|INSERT|ALTER COLUMN)\b/i.test(sql),
    shapes.join(", ")
  );
  check(
    "every timestamp is timestamptz (archivedAt, createdAt, updatedAt), and the table carries the plan's columns",
    /"archivedAt" TIMESTAMPTZ\(3\),/.test(sql) &&
      /"createdAt" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP,/.test(sql) &&
      /"updatedAt" TIMESTAMPTZ\(3\) NOT NULL,/.test(sql) &&
      !/\bTIMESTAMP\(3\)/.test(sql) &&
      ['"title" TEXT NOT NULL', '"category" TEXT NOT NULL', '"price" INTEGER NOT NULL', '"note" TEXT,', '"cooldownDays" INTEGER,', '"sortOrder" INTEGER NOT NULL DEFAULT 0'].every((c) => sql.includes(c))
  );
  const priceCheck = /"MallReward_price_check" CHECK \("price" BETWEEN (\d+) AND (\d+)\)/.exec(sql);
  check(
    "the price CHECK is validatePrice's range (1..100000): both refuse 0 and 100001 and take 1 and 100000",
    !!priceCheck && Number(priceCheck[1]) === M.PRICE_MIN && Number(priceCheck[2]) === M.PRICE_MAX && M.PRICE_MIN === 1 && M.PRICE_MAX === 100000 &&
      !M.validatePrice(0).ok && !M.validatePrice(100001).ok && M.validatePrice(1).ok && M.validatePrice(100000).ok,
    priceCheck ? `${priceCheck[1]}..${priceCheck[2]}` : "no price CHECK"
  );
  const catCheck = /"MallReward_category_check" CHECK \("category" IN \(([^)]*)\)\)/.exec(sql);
  check(
    "the other CHECKs are mall.ts's own bounds: the five categories, a title of 1..60, a note of 1..200, a cooldown of 1..365",
    !!catCheck && JSON.stringify(catCheck[1].split(",").map((x) => x.trim().replace(/'/g, ""))) === JSON.stringify([...M.MALL_CATEGORIES]) &&
      sql.includes(`CHECK (char_length("title") BETWEEN 1 AND ${M.REWARD_TITLE_MAX})`) &&
      sql.includes(`CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND ${M.REWARD_NOTE_MAX})`) &&
      sql.includes(`CHECK ("cooldownDays" IS NULL OR "cooldownDays" BETWEEN ${M.COOLDOWN_MIN} AND ${M.COOLDOWN_MAX})`)
  );
  check(
    "the plan's index on (userId, archivedAt), and one live reward a title (any case: a resend on another instance lists it once)",
    sql.includes('CREATE INDEX "MallReward_userId_archivedAt_idx" ON "public"."MallReward"("userId", "archivedAt")') &&
      sql.includes('CREATE UNIQUE INDEX "MallReward_userId_title_live_key" ON "public"."MallReward"("userId", lower("title")) WHERE "archivedAt" IS NULL')
  );
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model MallReward {"), schema.indexOf("}", schema.indexOf("model MallReward {")) + 1);
  check(
    "schema.prisma's MallReward matches it (price Int, the timestamps timestamptz, the index) and names the CHECKs and the partial index Prisma can't declare",
    model.length > 50 &&
      /\bprice\s+Int\b/.test(model) &&
      /\barchivedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/.test(model) &&
      /\bcreatedAt\s+DateTime\s+@default\(now\(\)\) @db\.Timestamptz\(3\)/.test(model) &&
      /\bupdatedAt\s+DateTime\s+@updatedAt @db\.Timestamptz\(3\)/.test(model) &&
      /@@index\(\[userId, archivedAt\]\)/.test(model) &&
      ["MallReward_title_check", "MallReward_category_check", "MallReward_price_check", "MallReward_note_check", "MallReward_cooldown_check", "MallReward_userId_title_live_key"].every((n) => schema.includes(n))
  );

  console.log("— P18: the price and its hint (deterministic, D32) —");
  const takes = [1, 100000, "1,000", " 120 ", "2 500"].map((v) => M.validatePrice(v));
  const refuses = [0, 100001, -5, 1.5, "1.5", "abc", "", null, undefined, Number.NaN, Number.POSITIVE_INFINITY].map((v) => M.validatePrice(v));
  check(
    "validatePrice: whole credits from 1 to 100,000, typed or sent (\"1,000\" is 1000); 0, 100001, a fraction, text and nothing are refused",
    JSON.stringify(takes.map((t) => (t.ok ? t.value : null))) === JSON.stringify([1, 100000, 1000, 120, 2500]) && refuses.every((r) => !r.ok),
    JSON.stringify(refuses.filter((r) => r.ok))
  );
  check(
    "validateCooldown: none (null or empty), else whole days from 1 to 365",
    [null, undefined, ""].every((v) => { const r = M.validateCooldown(v); return r.ok && r.value === null; }) &&
      (() => { const r = M.validateCooldown(7); return r.ok && r.value === 7; })() &&
      [0, 366, 1.5, "x"].every((v) => !M.validateCooldown(v).ok)
  );
  const T = "2026-11-20";
  const earned = (n: number, from: number, amount: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ day: addDays(T, from + i), earned: amount(i) }));
  const G = (launchDay: string | null, days: { day: string; earned: number }[]) => M.goodDayOf({ launchDay, today: T, days });
  const five = [10, 40, 40, 50, 90];
  check(
    "goodDayOf: calibrating while credits are off, on the launch day, and for 13 complete days; from 14, the median of the days that earned credits",
    JSON.stringify(G(null, earned(20, -20, () => 40))) === JSON.stringify({ calibrating: true, days: 0 }) &&
      JSON.stringify(G(T, [])) === JSON.stringify({ calibrating: true, days: 0 }) &&
      JSON.stringify(G(addDays(T, -13), earned(13, -13, () => 40))) === JSON.stringify({ calibrating: true, days: 13 }) &&
      JSON.stringify(G(addDays(T, -14), earned(5, -5, (i) => five[i]))) === JSON.stringify({ calibrating: false, credits: 40, days: 14, earningDays: 5 }) &&
      (() => { const g = G(addDays(T, -20), earned(2, -2, (i) => [30, 50][i])); return !g.calibrating && g.credits === 40; })()
  );
  check(
    "goodDayOf reads the last 28 complete days only: a day before them, today's own credits and a day that earned none never count; none earning in the window still calibrates",
    (() => {
      const g = G(addDays(T, -60), [{ day: addDays(T, -29), earned: 999 }, { day: addDays(T, -28), earned: 20 }, { day: addDays(T, -1), earned: 0 }, { day: T, earned: 999 }]);
      return !g.calibrating && g.credits === 20 && g.days === 28 && g.earningDays === 1;
    })() &&
      JSON.stringify(G(addDays(T, -60), [{ day: addDays(T, -40), earned: 50 }])) === JSON.stringify({ calibrating: true, days: 60 })
  );
  const good = { calibrating: false as const, credits: 40, days: 28, earningDays: 20 };
  check(
    "priceHint: ≈ n good days at the nearest whole one, '≈ 1 good day', 'under half a good day'; 'calibrating' without a good day; the same input gives the same words",
    M.priceHint(80, good) === "≈ 2 good days" &&
      M.priceHint(40, good) === "≈ 1 good day" &&
      M.priceHint(60, good) === "≈ 2 good days" &&
      M.priceHint(400, good) === "≈ 10 good days" &&
      M.priceHint(15, good) === "under half a good day" &&
      M.priceHint(120, { calibrating: true, days: 3 }) === M.PRICE_HINT_CALIBRATING &&
      M.PRICE_HINT_CALIBRATING === "calibrating" &&
      M.priceHint(80, good) === M.priceHint(80, { ...good })
  );
  const mallSrc = code("src/lib/mall.ts");
  check("mall.ts reads no clock and draws nothing: the hint is the rows' alone", !/new Date\(|Date\.now|Math\.random|performance\.now/.test(mallSrc));
  const goldenLines = C.foldCredits({
    today: "2026-10-28",
    launchDay: "2026-10-21",
    questDays: [{ day: "2026-10-28", inForce: 3, done: 3 }],
    rows: [{ source: "CHEST", day: "2026-10-28", dedupeKey: "chest:2026-10-28", qty: null, detail: null, templateId: null }],
    goalScores: new Map(),
  });
  check(
    "credits.ts earnedDaysOf sums the fold's lines by their own day, oldest first, only days that earned (the hint's input; spends are not lines)",
    JSON.stringify(C.earnedDaysOf(goldenLines)) === JSON.stringify([{ day: "2026-10-28", earned: 40 }]) &&
      JSON.stringify(C.earnedDaysOf({ lines: [{ kind: "KEPT_WEEK", day: "2026-10-25", amount: 15, key: "a" }, { kind: "QUEST", day: "2026-10-22", amount: 10, key: "b" }, { kind: "KEPT_WEEK", day: "2026-10-25", amount: 15, key: "c" }] })) ===
        JSON.stringify([{ day: "2026-10-22", earned: 10 }, { day: "2026-10-25", earned: 30 }])
  );
  const offCalls: string[] = [];
  const countingStore: import("../src/lib/credits-server").CreditsStore = {
    questSets: async () => (offCalls.push("questSets"), []),
    dayFacts: async () => (offCalls.push("dayFacts"), new Map()),
    incomeRows: async () => (offCalls.push("incomeRows"), [{ source: "CHEST", day: "2026-10-28", dedupeKey: "chest:2026-10-28", qty: null, detail: null, templateId: null }]),
    goalScores: async () => (offCalls.push("goalScores"), new Map()),
    spendRows: async () => (offCalls.push("spendRows"), []),
  };
  const NOW28 = new Date("2026-10-28T02:00:00.000Z");
  const offDays = await CS.loadWalletDays("u1", NOW28, { store: countingStore, launchDay: null });
  const offRead = await CS.readWalletDays("u1", NOW28, { store: countingStore });
  check("loadWalletDays and readWalletDays: {live: false} and no days, with nothing read, while the switch is null (as shipped)", !offDays.wallet.live && offDays.days.length === 0 && !offRead.wallet.live && offCalls.length === 0);
  const liveDays = await CS.loadWalletDays("u1", NOW28, { store: countingStore, launchDay: "2026-10-21" });
  const liveWalletOnly = await CS.readWallet("u1", NOW28, { store: countingStore, launchDay: "2026-10-21" });
  check(
    "…and once credits count, the same wallet as readWallet and each earning day, from one fold (one wave of reads)",
    JSON.stringify(liveDays.wallet) === JSON.stringify(liveWalletOnly) && JSON.stringify(liveDays.days) === JSON.stringify([{ day: "2026-10-28", earned: 10 }]) && offCalls.filter((c) => c === "incomeRows").length === 2
  );
  check(
    "loadWalletDays is cached on loadWallet's own tags under its own key, never while off; loadWallet itself is unchanged",
    /return cached\(`credits:wallet-days:\$\{userId\}:\$\{today\}:\$\{launch\}`, \["life", "activity", "roadmap"\], \(\) => readWalletDays\(userId, now, \{ launchDay: launch \}\)\);/.test(code("src/lib/credits-server.ts")) &&
      /if \(launch == null \|\| !creditsOn\(today, launch\)\) return \{ wallet: OFF_WALLET\(today\), days: \[\] \};\s*if \(deps\.store\) return readWalletDays/.test(code("src/lib/credits-server.ts"))
  );

  console.log("— P18: only what the user lists is priced; #play, rest days and sleep never are (D30, H5) —");
  const play = new Set([normTitleOf("Guitar")]);
  const refusedTitles = ["#play guitar", "Guitar #play", "Sleep in", "A lie-in", "Nap", "An afternoon nap", "Rest day", "Two days off", "Resting", "Guitar"];
  const pricedTitles = ["Restaurant dinner", "Film night", "Play Zelda for an hour", "Takeaway", "New headphones", "Interest-free gadget"];
  const notRefused = refusedTitles.filter((t) => M.freeRefusalOf(t, play) == null);
  const wronglyRefused = pricedTitles.filter((t) => M.freeRefusalOf(t, play) != null);
  check(
    `freeRefusalOf refuses #play, sleep, naps, a lie-in, rest days and a #play task's own title (${refusedTitles.length}); a restaurant, a film or a game is priceable (${pricedTitles.length})`,
    notRefused.length === 0 && wronglyRefused.length === 0 && M.freeRefusalOf("Guitar", play) === "“Guitar” is #play on your board, so it stays free.",
    [...notRefused.map((t) => `not refused: ${t}`), ...wronglyRefused.map((t) => `refused: ${t}`)].join(", ")
  );
  const ctx = { live: [{ id: "r1", title: "Takeaway night" }], playTitles: play };
  const cleaned = M.cleanRewardInput({ title: "  Film   night ", category: "SCREEN", price: "60", note: "  ", cooldownDays: "" }, ctx);
  check(
    "cleanRewardInput: one line, trimmed; an empty note and cooldown are none; a title already listed (any case), past 60, an unknown category or a note past 200 is refused",
    cleaned.ok && JSON.stringify(cleaned.value) === JSON.stringify({ title: "Film night", category: "SCREEN", price: 60, note: null, cooldownDays: null }) &&
      !M.cleanRewardInput({ title: "takeaway NIGHT", category: "TREAT", price: 10 }, ctx).ok &&
      !M.cleanRewardInput({ title: "x".repeat(61), category: "TREAT", price: 10 }, ctx).ok &&
      !M.cleanRewardInput({ title: "Gig", category: "FOOD", price: 10 }, ctx).ok &&
      !M.cleanRewardInput({ title: "Gig", category: "OUTING", price: 10, note: "n".repeat(201) }, ctx).ok &&
      !M.cleanRewardInput({ title: "Sleep in", category: "OTHER", price: 10 }, ctx).ok
  );
  const full = { live: Array.from({ length: M.REWARDS_MAX }, (_, i) => ({ id: `r${i}`, title: `R${i}` })), playTitles: new Set<string>() };
  const row0: Row = { id: "r0", title: "R0", category: "TREAT", price: 10, note: null, cooldownDays: null, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null };
  check(
    `the ${M.REWARDS_MAX}th live reward is the last (an archive frees a place); an edit takes no new place and keeps its own title`,
    !M.cleanRewardInput({ title: "One more", category: "TREAT", price: 10 }, full).ok && M.planRewardEdit(row0, { price: 20 }, full).ok && M.REWARDS_MAX === 60
  );
  const noStarter = !/\btitle:\s*["'`]/.test(mallSrc) && !/INSERT/i.test(sql);
  const seeds = readdirSync(join(ROOT, "prisma")).filter((f) => /\.(ts|js|mjs|cjs)$/.test(f)).filter((f) => /mallReward|MallReward/.test(readFileSync(join(ROOT, "prisma", f), "utf8")));
  check(
    "no starter rewards: the migration inserts nothing, no seed writes a reward, mall.ts lists none (its examples are hints in the Add form), and the only insert is addRewardCore's",
    noStarter && seeds.length === 0 && (code("src/lib/mall-server.ts").match(/\.insert\(/g) ?? []).length === 1 && /export async function addRewardCore[\s\S]*?await d\.store\.insert\(userId/.test(code("src/lib/mall-server.ts")),
    seeds.join(", ")
  );

  console.log("— P18: the catalog's cores (a fake store) —");
  const live: Row[] = [
    { ...row0, id: "rw-thai", title: "Takeaway night", price: 120, sortOrder: 0 },
    { ...row0, id: "rw-film", title: "Film night", category: "SCREEN", price: 60, sortOrder: 3 },
  ];
  const archivedRows: Row[] = [{ ...row0, id: "rw-old", title: "Old game", category: "SCREEN", archivedAt: "2026-10-20T03:00:00.000Z" }];
  const fake = (log: string[], over: Partial<Store> = {}): Store => ({
    live: async () => (log.push("live"), live),
    archived: async (_u, take) => (log.push(`archived ${take}`), archivedRows),
    byId: async (_u, id) => (log.push(`byId ${id}`), [...live, ...archivedRows].find((r) => r.id === id) ?? null),
    insert: async (_u, d) => (log.push(`insert ${d.title} ${d.price} @${d.sortOrder}`), "rw-new"),
    update: async (_u, id, d) => (log.push(`update ${id} ${d.title} ${d.price}`), 1),
    archive: async (_u, id) => (log.push(`archive ${id}`), 1),
    playTitles: async () => (log.push("playTitles"), [normTitleOf("Guitar")]),
    ...over,
  });
  const ON = { env: { NODE_ENV: "production" } };
  const OFF = { env: { NODE_ENV: "development" } };
  const offLog: string[] = [];
  const offRes = await Promise.all([
    S.addRewardCore("u1", { title: "Gig", category: "OUTING", price: 400 }, { store: fake(offLog), ...OFF }),
    S.editRewardCore("u1", "rw-thai", { price: 1 }, { store: fake(offLog), ...OFF }),
    S.archiveRewardCore("u1", "rw-thai", { store: fake(offLog), ...OFF }),
  ]);
  check("every write needs life writes on: a dev server sharing the database records nothing and says so", offRes.every((r) => !r.ok && r.error === S.MALL_WRITES_OFF) && offLog.length === 0, offLog.join(", "));
  const addLog: string[] = [];
  const added = await S.addRewardCore("u1", { title: "A gig", category: "OUTING", price: 400 }, { store: fake(addLog), ...ON });
  const refusedLog: string[] = [];
  const refusedAdds = await Promise.all(
    [{ title: "Nap", price: 10 }, { title: "Guitar", price: 10 }, { title: "Gig", price: 0 }, { title: "Film NIGHT", price: 10 }].map((x) => S.addRewardCore("u1", { ...x, category: "OTHER" }, { store: fake(refusedLog), ...ON }))
  );
  check(
    "addRewardCore lists a reward after the live ones (sortOrder 4) and answers its id; a refused one (a nap, a #play task, a price of 0, a title listed) inserts nothing",
    added.ok && added.value.id === "rw-new" && addLog.includes("insert A gig 400 @4") && refusedAdds.every((r) => !r.ok) && !refusedLog.some((l) => l.startsWith("insert")),
    [...addLog, ...refusedLog].join(" | ")
  );
  const editLog: string[] = [];
  const edited = await S.editRewardCore("u1", "rw-thai", { price: "150" }, { store: fake(editLog), ...ON });
  const editGone = await S.editRewardCore("u1", "rw-old", { price: 5 }, { store: fake(editLog), ...ON });
  const editPlay = await S.editRewardCore("u1", "rw-thai", { title: "Sleep in" }, { store: fake(editLog), ...ON });
  check(
    "editRewardCore changes a live reward in place (its own title is no duplicate); an archived one is gone; an edit to a free title is refused",
    edited.ok && editLog.includes("update rw-thai Takeaway night 150") && !editGone.ok && editGone.error === M.REWARD_GONE && !editPlay.ok && editPlay.error === M.FREE_REST_LINE && editLog.filter((l) => l.startsWith("update")).length === 1,
    editLog.join(" | ")
  );
  const archLog: string[] = [];
  const at = new Date("2026-10-24T01:00:00.000Z");
  const archivedNow = await S.archiveRewardCore("u1", "rw-film", { store: fake(archLog), ...ON, now: () => at });
  const archGone = await S.archiveRewardCore("u1", "rw-film", { store: fake([], { archive: async () => 0 }), ...ON });
  check(
    "archiveRewardCore sets archivedAt and keeps the row (the store has no delete at all); archiving one already gone says so",
    archivedNow.ok && JSON.stringify(archLog) === JSON.stringify(["archive rw-film"]) && !archGone.ok && archGone.error === M.REWARD_GONE &&
      JSON.stringify(Object.keys(S.prismaMallStore).sort()) === JSON.stringify(["archive", "archived", "byId", "insert", "live", "playTitles", "update"]) &&
      !/\b(delete|deleteMany)\b/.test(code("src/lib/mall-server.ts"))
  );
  const { Prisma } = await import("@prisma/client");
  const P2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
  const raced = await S.addRewardCore("u1", { title: "A gig", category: "OUTING", price: 400 }, { store: fake([], { insert: async () => Promise.reject(P2002) }), ...ON });
  check("two adds racing on one title (the partial unique index) answer a line, never a throw", !raced.ok && /changed meanwhile/.test(raced.error));
  const viewLog: string[] = [];
  // As credits-server loadWalletDays answers while CREDITS_LAUNCH_DAY is null: {live: false} and no days, no read.
  const offWallet = async (_u: string, now: Date) => ({ wallet: C.OFF_WALLET(todayKey(now)), days: [] });
  const view = await S.loadMall("u1", { store: fake(viewLog), wallet: offWallet, now: () => at, ...ON });
  check(
    "loadMall: the live rewards by category with each hint ('calibrating' while credits are off), the archived kept and listed, writes on; it writes nothing",
    view.ready && view.writesOn && JSON.stringify(view.groups.map((g) => [g.category, g.rewards.map((r) => r.id)])) === JSON.stringify([["TREAT", ["rw-thai"]], ["SCREEN", ["rw-film"]]]) &&
      view.rewards.every((r) => r.hint === "calibrating") && view.goodDay.calibrating && view.archived.length === 1 && view.archived[0].id === "rw-old" &&
      !viewLog.some((l) => /^(insert|update|archive )/.test(l)) && viewLog.includes(`archived ${S.ARCHIVED_SHOWN}`),
    viewLog.join(" | ")
  );
  const missing = Object.assign(new Error("The table `public.MallReward` does not exist in the current database."), { code: "P2021", meta: { table: "public.MallReward" } });
  const stale = new TypeError("Cannot read properties of undefined (reading 'findMany')");
  const before = await S.loadMall("u1", { store: fake([], { live: async () => Promise.reject(missing) }), wallet: offWallet, ...ON });
  const staleView = await S.loadMall("u1", { store: fake([], { live: async () => Promise.reject(stale) }), wallet: offWallet, ...ON });
  const addBefore = await S.addRewardCore("u1", { title: "A gig", category: "OUTING", price: 400 }, { store: fake([], { live: async () => Promise.reject(missing) }), ...ON });
  check(
    "before the migration (no MallReward table, or a client generated before it): no rewards and ready false, and an add says the Mall isn't set up",
    !before.ready && before.rewards.length === 0 && !staleView.ready && !addBefore.ok && addBefore.error === S.MALL_NOT_READY
  );

  console.log("— P18: the Mall on the web —");
  const { PROFILE, MALL_PATH, titleFor } = await import("../src/components/shell/nav");
  const rows = PROFILE.subs.map((s) => s.label);
  const mallSub = PROFILE.subs.find((s) => s.href === "/you/mall");
  check(
    "the profile menu has Mall (/you/mall) right after Loadout, with the bag, titled You · Mall from the path",
    MALL_PATH === "/you/mall" && mallSub?.label === "Mall" && mallSub.icon === "bag" && rows.indexOf("Mall") === rows.indexOf("Loadout") + 1 && JSON.stringify(titleFor("/you/mall")) === JSON.stringify({ eyebrow: "You", title: "Mall" })
  );
  const iconSrc = read("src/components/ui/Icon.tsx");
  check("the bag is a new kit icon: 'bag' in IconName and its own i-bag symbol", /\| "bag";/.test(iconSrc) && /<symbol id="i-bag" viewBox="0 0 24 24"><path d="[^"]+"\/><\/symbol>/.test(iconSrc));
  const page = code("src/app/you/mall/page.tsx");
  check(
    "the page reads loadMall(getCurrentUserId()) on each load (force-dynamic) and passes the five actions (P19: buy and undo too), the Buy states and the purchases to the board",
    /const mall = await loadMall\(getCurrentUserId\(\)\);/.test(page) && /export const dynamic = "force-dynamic";/.test(page) && /const MALL_ACTIONS = \{ addReward, editReward, archiveReward, buyReward, undoBuy \};/.test(page) && /actions=\{MALL_ACTIONS\}/.test(page) && /buy: mall\.buy, purchases: mall\.purchases/.test(page)
  );
  const actions = code("src/app/actions/mall.ts");
  check(
    "actions/mall.ts: a 'use server' file whose three actions each call their core, and refresh only when asked (a catalog change only once it lands)",
    /^\s*"use server";/.test(read("src/app/actions/mall.ts")) && /return addRewardCore\(userId, \{/.test(actions) && /return editRewardCore\(userId, id, clean\);/.test(actions) && /return archiveRewardCore\(userId, id\);/.test(actions) &&
      /if \(\(res\.ok \|\| on === "answer"\) && opts\?\.refresh === true\) refresh\(\);/.test(actions) && /fn: \(userId: string\) => Promise<MallResult<T>>, on: RefreshOn = "ok"\)/.test(actions) &&
      (actions.match(/"answer"\s*\);/g) ?? []).length === 2
  );
  // The review of 2026-10-24: the page said the Mall "suggests none" while the Add form listed examples (one of them a
  // game session, a hobby D30 keeps free when it is #play) and a price placeholder that read like a value.
  const hobby = /\b(game|gaming|play|sport|run|walk|hike|trip|holiday|rest|sleep|nap|day off|hobby)\b/i;
  check(
    "the Mall's copy is literally true: it starts empty and lists nothing for you (never 'suggests none' beside the examples); the Add form's examples are neutral, never a hobby, a trip or a rest; no price placeholder",
    M.MALL_ONLY_YOURS === "Only the rewards you list are priced. The Mall starts empty: nothing is listed for you." && !/suggests/.test(M.MALL_ONLY_YOURS) &&
      M.MALL_CATEGORIES.every((c) => !hobby.test(M.MALL_CATEGORY_EXAMPLES[c])) && !/placeholder="\d/.test(read("src/components/home/MallBoard.tsx")),
    M.MALL_CATEGORIES.map((c) => M.MALL_CATEGORY_EXAMPLES[c]).join(" | ")
  );
  const { MallBoard, RewardFields, MALL_WRITES_OFF_NOTE } = await import("../src/components/home/MallBoard");
  const plain = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const noActions = {
    addReward: async () => ({ ok: true as const, value: { id: "x" } }),
    editReward: async () => ({ ok: true as const, value: { id: "x" } }),
    archiveReward: async () => ({ ok: true as const, value: null }),
    buyReward: async () => ({ ok: false as const, error: "no" }),
    undoBuy: async () => ({ ok: false as const, error: "no" }),
  };
  const boardOf = (data: Partial<import("../src/components/home/MallBoard").MallBoardData>) =>
    plain(renderToStaticMarkup(createElement(MallBoard, { data: { wallet: view.wallet, goodDay: view.goodDay, rewards: view.rewards, groups: view.groups, archived: view.archived, writesOn: true, ready: true, ...data }, actions: noActions })));
  const board = boardOf({});
  check(
    "the board: the wallet header says credits aren't counted yet (no balance), the honour note, #play stays free, each reward's price and hint, the archived kept, an Add button, and (re-pinned for P19) the buying rules but no Buy while credits are off",
    board.includes("Credits aren't counted yet") && !/\d cr<\/b>/.test(board.slice(0, board.indexOf("How the Mall works"))) &&
      board.includes(M.MALL_HONOUR) && board.includes(M.MALL_FREE) && board.includes(M.MALL_BUYING) && board.includes(M.BUY_CREDITS_OFF) &&
      board.includes(">120 cr<") && board.includes("price hint: calibrating") && board.includes("Archived rewards") && board.includes("Old game") &&
      board.includes(">Add a reward<") && !/>\s*Buy\b/.test(board)
  );
  const liveBoard = boardOf({ wallet: { live: true, day: "2026-10-24", launchDay: "2026-09-01", balance: 1240, today: 40, earned: 1240, spent: 0, refunded: 0, byKind: { QUEST: 0, THREE_OF_THREE: 0, KEPT_WEEK: 0, PLAN_WEEK: 0, CHECKPOINT: 0, MILESTONE: 0, GOAL: 0 } }, goodDay: good, rewards: live.map((r) => M.rewardViewOf(r, good)), groups: M.groupsOf(live.map((r) => M.rewardViewOf(r, good))) });
  check("…once credits count: the balance and today's, what a good day is, and each hint ('≈ 3 good days')", liveBoard.includes(">1,240 cr<") && liveBoard.includes("+40 cr today") && liveBoard.includes("A good day is 40 cr") && liveBoard.includes("≈ 3 good days"));
  const emptyBoard = boardOf({ rewards: [], groups: [], archived: [] });
  const offBoard = boardOf({ writesOn: false });
  check("an empty catalog says so and suggests nothing; a server whose writes are off says nothing is recorded, and offers no Edit", emptyBoard.includes(M.MALL_EMPTY) && !emptyBoard.includes("ml-row") && offBoard.includes(MALL_WRITES_OFF_NOTE) && !offBoard.includes(">Edit<"));
  const form = plain(renderToStaticMarkup(createElement(RewardFields, { goodDay: good, actions: noActions, onDone: () => {} })));
  check(
    "the Add sheet's form: the reward, its category (the five), its price in cr, a note and a cooldown, then Add the reward",
    ["Reward", "Category", "Price", "Note (optional)", "Cooldown (optional)", "Add the reward"].every((w) => form.includes(`>${w}<`)) && M.MALL_CATEGORIES.every((c) => form.includes(`value="${c}"`)) && new RegExp(`maxlength="${M.REWARD_TITLE_MAX}"`, "i").test(form)
  );
  const rulesFlat = read("src/app/today/rules/page.tsx").replace(/\s+/g, " ");
  check(
    "the rules page says the Mall prices only what the user lists, none is listed for them, and play, rest days and sleep are never priced; (re-pinned for P19) a purchase is permission now, on honour",
    /The Mall prices only the rewards you list \(You › Mall\), and none is listed for you\. Play, rest days and sleep are never priced/.test(rulesFlat) && /A purchase is permission now: Buy, then Confirm, burns exactly the price/.test(rulesFlat) && /Like the rest of the Mall, it runs on honour/.test(rulesFlat)
  );

  console.log("— P18: no mall* file reaches a paying core —");
  const mallTargets = files.filter((f) => isTarget(f, ["mall"]));
  const reaching = mallTargets.filter((f) => /mobile-api-cores|realMobileDeps/.test(code(f)));
  check(
    "no mall* file imports mobile-api-cores (it carries completeTask and submitReview): the Mall's routes run on mall-mobile-cores, the Mall's read and its add alone",
    reaching.length === 0 && mallTargets.includes("src/lib/mall-mobile-cores.ts") && mallTargets.includes("src/app/api/mobile/v1/mall/route.ts") && mallTargets.includes("src/app/api/mobile/v1/mall/rewards/route.ts"),
    reaching.join(", ")
  );
}

// ═══ P19: the Mall's buy, burn and undo (blueprint 4.4, 4.5; D31, D32, harms H6 and H7) ═══════════════

/** P19's checks: the vocabulary, the pure rules, the cores on fake stores, the moments, the page and the penalty paths. */
async function p19(): Promise<void> {
  const M = await import("../src/lib/mall");
  const S = await import("../src/lib/mall-server");
  const C = await import("../src/lib/credits");
  const { activityData, DEFAULT_SINK } = await import("../src/lib/activity");
  const { NEVER_STREAK_SOURCES, STREAK_SOURCES, countsForStreakOf } = await import("../src/lib/streak-curve");
  const { Prisma } = await import("@prisma/client");
  const { addDays } = await import("../src/lib/life-day");
  type Row = import("../src/lib/mall").MallRewardRow;
  type PRow = import("../src/lib/mall").PurchaseRow;
  type PStore = import("../src/lib/mall-server").PurchaseStore;
  type PWrite = import("../src/lib/mall-server").PurchaseWrite;

  console.log("— P19: the vocabulary (MALL_BUY, MALL_REFUND: sink NONE, xp 0, never a streak day) —");
  const lifeTypes = read("src/lib/life-types.ts");
  check(
    "ActivitySource gains MALL_BUY and MALL_REFUND; DEFAULT_SINK is NONE for both; both are never streak days, whatever a writer asks; they are the credits fold's spend sources",
    /\| "MALL_BUY"/.test(lifeTypes) && /\| "MALL_REFUND"/.test(lifeTypes) && DEFAULT_SINK.MALL_BUY === "NONE" && DEFAULT_SINK.MALL_REFUND === "NONE" &&
      (["MALL_BUY", "MALL_REFUND"] as const).every((s) => NEVER_STREAK_SOURCES.has(s) && !STREAK_SOURCES.has(s) && countsForStreakOf(s, true) === false) &&
      JSON.stringify([...C.CREDIT_SPEND_SOURCES]) === JSON.stringify(["MALL_BUY", "MALL_REFUND"])
  );
  const data = activityData("u1", { source: "MALL_BUY", sink: "NONE", day: "2026-10-28", occurredAt: new Date("2026-10-28T10:05:00.000Z"), xp: 0, qty: 120, countsForStreak: true, dedupeKey: "buy:abc" });
  check(
    "a MALL_BUY row as activity.ts writes it: sink NONE, no track, xp 0, no raw XP, qty the price, never a streak day (even asked), keyed 'buy:<clientId>'",
    data.sink === "NONE" && data.track === null && data.xp === 0 && data.rawXp === null && data.qty === 120 && data.countsForStreak === false && data.dedupeKey === "buy:abc"
  );
  const ms = code("src/lib/mall-server.ts");
  const ops = callArgsOf(ms, "activityOp");
  check(
    "mall-server.ts writes the Mall's rows through one activityOp call, its row literal carrying sink \"NONE\", xp 0 and countsForStreak false, and no other ledger helper",
    ops.length === 1 && /\bsink: "NONE",/.test(ops[0]) && /\bxp: 0,/.test(ops[0]) && /\bcountsForStreak: false,/.test(ops[0]) && !/recordActivity\(|activityData\(|mintLifeMasteryOps|lifeMintData/.test(ms)
  );
  const namers = files.filter((f) => /\bMALL_(BUY|REFUND)\b/.test(code(f))).sort();
  check(
    "only the vocabulary (life-types, activity, streak-curve), the credits fold and the Mall's own modules name MALL_BUY or MALL_REFUND: no other file writes, reads or prices a purchase",
    JSON.stringify(namers) === JSON.stringify(["src/lib/activity.ts", "src/lib/credits.ts", "src/lib/life-types.ts", "src/lib/mall-server.ts", "src/lib/mall.ts", "src/lib/streak-curve.ts"]),
    namers.join(", ")
  );
  const PENALTY_PATHS = files.filter((f) => /^src\/lib\/(settlement|duty[\w-]*|srs|forgetting|tasks|degrade[\w-]*)\.ts$/.test(f) || /^src\/app\/actions\/(duty|tasks|review)\.ts$/.test(f));
  const penaltyNames = PENALTY_PATHS.filter((f) => /MALL_|CREDIT_SPEND_SOURCES|credits-server|from "\.\/credits"|from "@\/lib\/credits"|from "\.\/mall|from "@\/lib\/mall/.test(code(f)));
  check(
    `penalties never debit credits (D31): no penalty path (settlement, Duty, debt, forgetting, the tick and the review: ${PENALTY_PATHS.length} files) names a Mall row or imports credits or the Mall`,
    PENALTY_PATHS.length >= 6 && penaltyNames.length === 0 && PENALTY_PATHS.includes("src/lib/settlement.ts") && PENALTY_PATHS.includes("src/lib/srs.ts"),
    penaltyNames.join(", ")
  );

  console.log("— P19: the rules (pure, deterministic) —");
  const T = "2026-10-28";
  const reward = (over: Partial<Row> = {}): Row => ({ id: "rw-thai", title: "Takeaway night", category: "TREAT", price: 120, note: null, cooldownDays: null, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null, ...over });
  const buyRow = (id: string, day: string, qty: number, over: Partial<PRow> = {}): PRow => ({ id, source: "MALL_BUY", day, occurredAt: `${day}T10:05:00.000Z`, qty, sourceId: "rw-thai", dedupeKey: `buy:${id}`, receipt: null, ...over });
  const refundRow = (buyId: string, day: string, qty: number): PRow => ({ id: `rf-${buyId}`, source: "MALL_REFUND", day, occurredAt: `${day}T10:09:00.000Z`, qty, sourceId: buyId, dedupeKey: M.refundRowKey(buyId), receipt: null });
  const rows = [buyRow("b1", "2026-10-22", 60), buyRow("b2", "2026-10-23", 40), refundRow("b2", "2026-10-23", 40)];
  const fold = C.foldCredits({ today: T, launchDay: "2026-10-21", questDays: [{ day: T, inForce: 3, done: 3 }], rows: [], goalScores: new Map(), spends: rows.map((r) => ({ source: r.source, day: r.day, qty: r.qty })) });
  check(
    "balanceOf is the wallet's own balance: earned − spent + refunded over the same rows (30 − 60 − 40 + 40 = −30, the fold's figure)",
    M.balanceOf(fold.earned, rows) === fold.balance && fold.balance === -30 && JSON.stringify(M.spendsOf(rows)) === JSON.stringify({ spent: 100, refunded: 40 })
  );
  const NO_PLAY: ReadonlySet<string> = new Set<string>();
  const plan = (r: Row, earned: number, rs: PRow[] = []) => M.planBuy({ reward: r, earned, rows: rs, today: T, playTitles: NO_PLAY });
  const exact = plan(reward(), 120);
  const over = plan(reward(), 119);
  check(
    "no overdraft (D31, H6): a price above the balance is refused with the shortfall; exactly the balance burns it to 0; whole credits only",
    exact.ok && exact.value.balanceBefore === 120 && exact.value.balanceAfter === 0 && exact.value.price === 120 &&
      !over.ok && over.error === "Takeaway night costs 120 cr; you have 119 cr (1 cr short)." && over.error === M.shortLine("Takeaway night", 120, 119)
  );
  const negative = plan(reward({ price: 1 }), 100, [buyRow("b1", "2026-10-27", 110)]);
  check(
    "a balance below zero (an undone quest took back credits a purchase had spent) refuses every purchase, even of 1 cr, and says 'earn it back'",
    !negative.ok && negative.error === "You're at −10 cr: earn it back before you buy." && M.MALL_EARN_BACK === "earn it back"
  );
  const cool = reward({ cooldownDays: 7 });
  const inCooldown = plan(cool, 1000, [buyRow("b1", "2026-10-22", 120)]);
  const pastCooldown = M.planBuy({ reward: cool, earned: 1000, rows: [buyRow("b1", "2026-10-21", 120)], today: T, playTitles: NO_PLAY });
  const undoneDoesNotCount = plan(cool, 1000, [buyRow("b1", "2026-10-27", 120), refundRow("b1", "2026-10-27", 120)]);
  check(
    "a cooldown holds until its day (bought the 22nd, every 7 days: next on Thu 29 Oct), not after it, and an undone purchase does not count",
    !inCooldown.ok && inCooldown.error === "At most once every 7 days: next on Thu 29 Oct." && pastCooldown.ok && undoneDoesNotCount.ok && M.cooldownUntil("rw-thai", 7, [buyRow("b1", "2026-10-22", 120)], T) === "2026-10-29"
  );
  check("an archived reward can't be bought (it is gone)", (() => { const p = plan(reward({ archivedAt: "2026-10-20T00:00:00.000Z" }), 1000); return !p.ok && p.error === M.REWARD_GONE; })());
  {
    // The review of 2026-10-24 (D30, H5): the #play check ran only at add and edit, so a reward listed before a task of
    // the same title became #play stayed buyable. planBuy reads the user's #play titles at every buy.
    const { normTitleOf } = await import("../src/lib/life-lexicon");
    const gaming = reward({ id: "rw-game", title: "Gaming session", category: "SCREEN", price: 50 });
    const nowPlay = new Set([normTitleOf("gaming  SESSION")]);
    const refused = M.planBuy({ reward: gaming, earned: 1000, rows: [], today: T, playTitles: nowPlay });
    const fine = M.planBuy({ reward: gaming, earned: 1000, rows: [], today: T, playTitles: NO_PLAY });
    check(
      "a reward whose title has since become a #play task on the board stays free (D30): planBuy refuses it at any balance and says to archive it; with no such task it buys",
      !refused.ok && refused.error === "“Gaming session” is #play on your board, so it stays free. It can't be bought: archive this reward." && refused.error === M.freeBuyRefusal(M.freeRefusalOf("Gaming session", nowPlay) ?? "") && fine.ok
    );
  }
  const receipt = exact.ok ? M.receiptOfBuy(reward({ cooldownDays: 7 }), exact.value) : null;
  check(
    "the receipt is {v: 'mall-1', …}: the reward as it stood, its price and the balance either side, frozen on the row (an edit never reprices it)",
    !!receipt && M.isMallReceipt(receipt) && JSON.stringify(receipt) === JSON.stringify({ v: "mall-1", kind: "BUY", rewardId: "rw-thai", title: "Takeaway night", category: "TREAT", price: 120, balanceBefore: 120, balanceAfter: 0, cooldownDays: 7 }) && M.MALL_RECEIPT_V === "mall-1"
  );
  const b = buyRow("b9", T, 120, { occurredAt: "2026-10-28T10:05:00.000Z" });
  const at = (iso: string) => Date.parse(iso);
  const inside = M.planRefund({ buy: b, rows: [b], earned: 120, nowMs: at("2026-10-28T10:15:00.000Z") });
  const late = M.planRefund({ buy: b, rows: [b], earned: 120, nowMs: at("2026-10-28T10:15:00.001Z") });
  const again = M.planRefund({ buy: b, rows: [b, refundRow("b9", T, 120)], earned: 120, nowMs: at("2026-10-28T10:06:00.000Z") });
  const notABuy = M.planRefund({ buy: refundRow("b9", T, 120), rows: [], earned: 0, nowMs: at("2026-10-28T10:06:00.000Z") });
  check(
    "an undo works only within 10 minutes (10:00 exactly still undoes; a millisecond past is too late), once (a repeat is a duplicate), and only of a purchase",
    M.MALL_UNDO_MINUTES === 10 && inside.ok && !inside.value.duplicate && inside.value.balanceAfter === 120 && !late.ok && late.error === M.UNDO_TOO_LATE &&
      again.ok && again.value.duplicate && !notABuy.ok && notABuy.error === M.PURCHASE_GONE
  );
  const views = M.purchasesOf([buyRow("b1", "2026-10-27", 60), b, refundRow("b1", "2026-10-27", 60)], at("2026-10-28T10:07:00.000Z"));
  check(
    "purchasesOf: newest first, Sydney's clock ('21:05'), an undo window only while open, an undone one says so",
    views.length === 2 && views[0].id === "b9" && views[0].at === "21:05" && views[0].undoUntilMs === at("2026-10-28T10:15:00.000Z") && views[0].line === "Bought Wed 28 Oct at 21:05" &&
      views[1].refunded && views[1].undoUntilMs === null && views[1].line === "Bought Tue 27 Oct at 21:05 · undone, 60 cr back",
    JSON.stringify(views)
  );
  const live = (balance: number, earned = balance) => ({ live: true as const, day: T, launchDay: "2026-10-21", balance, today: 0, earned, spent: earned - balance, refunded: 0, byKind: { QUEST: 0, THREE_OF_THREE: 0, KEPT_WEEK: 0, PLAN_WEEK: 0, CHECKPOINT: 0, MILESTONE: 0, GOAL: 0 } });
  const ctx = (over: Partial<import("../src/lib/mall").BuyContext> = {}): import("../src/lib/mall").BuyContext => ({ wallet: live(200), rowsRead: true, rows: [], writesOn: true, ready: true, today: T, playTitles: NO_PLAY, ...over });
  check(
    "buyStateOf: credits off, a server whose writes are off, unread purchases and too few credits each say why; a reward the balance covers can be bought",
    M.buyStateOf(reward(), ctx({ wallet: C.OFF_WALLET(T) })).why === M.BUY_CREDITS_OFF && M.buyStateOf(reward(), ctx({ writesOn: false })).can === false &&
      M.buyStateOf(reward(), ctx({ rowsRead: false })).can === false && M.buyStateOf(reward({ price: 201 }), ctx()).why === "Takeaway night costs 201 cr; you have 200 cr (1 cr short)." &&
      M.buyStateOf(reward(), ctx()).can === true &&
      // The header's own figure below zero refuses too, whatever the rows' sum says (the page never contradicts its wallet).
      M.buyStateOf(reward({ price: 1 }), ctx({ wallet: live(-10, 500) })).why === "You're at −10 cr: earn it back before you buy."
  );
  check(
    "buyStateOf (D30): a title that is #play on the board now is never offered, before any balance line, and unread #play titles offer nothing",
    M.buyStateOf(reward(), ctx({ playTitles: new Set(["takeaway night"]), wallet: live(-10, 500) })).why === "“Takeaway night” is #play on your board, so it stays free. It can't be bought: archive this reward." &&
      M.buyStateOf(reward(), ctx({ playTitles: null })).why === "Your board couldn't be read just now." && M.buyStateOf(reward(), ctx({ playTitles: null })).can === false
  );
  const neg = M.mallWalletLines(live(-10, 100));
  check("the header after an undo-driven drop: '−10 cr', 'earn it back' (shown plainly, never charged)", neg.balance === "−10 cr" && neg.line === "earn it back: buying waits until you're back at 0");

  console.log("— P19: the buy and the undo (fake stores) —");
  const NOW = new Date("2026-10-28T10:05:00.000Z"); // Wednesday 28 October, 21:05 in Sydney
  const LAUNCH = "2026-10-21";
  const catalog = (over: Partial<Row>[] = []): import("../src/lib/mall-server").MallStore => {
    const rewards = [reward(), reward({ id: "rw-film", title: "Film night", category: "SCREEN", price: 60 }), ...over.map((o) => reward(o))];
    return {
      live: async () => rewards.filter((r) => r.archivedAt == null),
      archived: async () => rewards.filter((r) => r.archivedAt != null),
      byId: async (_u, id) => rewards.find((r) => r.id === id) ?? null,
      insert: async () => "rw-new",
      update: async () => 1,
      archive: async () => 1,
      playTitles: async () => [],
    };
  };
  /** A ledger of the Mall's rows that holds the guard and the key as Postgres does; `gate` holds every read until both racers have read once. */
  const ledger = (initial: PRow[] = [], gate?: { want: number }) => {
    const log: string[] = [];
    const all: PRow[] = [...initial];
    const writes: PWrite[] = [];
    let reads = 0;
    let open: (() => void) | null = null;
    const opened = new Promise<void>((r) => (open = r));
    const store: PStore = {
      rows: async () => {
        log.push("rows");
        reads++;
        if (gate && reads <= gate.want) {
          if (reads === gate.want) open?.();
          await opened;
        }
        return all.map((r) => ({ ...r }));
      },
      commit: async (_u, w) => {
        log.push(`commit ${w.event.source} ${w.event.qty} guard=${w.guardCount}`);
        if (w.guardCount != null && w.guardCount !== all.length) throw new Error("division by zero");
        if (all.some((r) => r.dedupeKey === w.event.dedupeKey)) throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
        writes.push(w);
        const id = `ev-${all.length + 1}`;
        all.push({ id, source: w.event.source, day: w.event.day, occurredAt: w.event.occurredAt.toISOString(), qty: w.event.qty, sourceId: w.event.sourceId, dedupeKey: w.event.dedupeKey, receipt: w.event.receipt });
        return id;
      },
    };
    return { store, log, all, writes };
  };
  const earnedWallet = (earned: number) => async () => live(earned, earned);
  const ON = { env: { NODE_ENV: "production" } };
  const deps = (l: ReturnType<typeof ledger>, earned: number, over: Partial<import("../src/lib/mall-server").MallDeps> = {}) => ({ store: catalog(), purchases: l.store, freshWallet: earnedWallet(earned), launchDay: LAUNCH, now: () => NOW, ...ON, ...over });
  const CID = "0b7c8f2e-5a1d-4c3b-9e8f-1a2b3c4d5e6f";

  const offL = ledger();
  const offs = await Promise.all([
    S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(offL, 500, { env: { NODE_ENV: "development" } })),
    S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(offL, 500, { launchDay: null })),
    S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, { store: catalog(), purchases: offL.store, freshWallet: earnedWallet(500), now: () => NOW, ...ON }),
    S.undoBuyCore("u1", { purchaseId: "ev-1" }, deps(offL, 500, { launchDay: null })),
    S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: "x" }, deps(offL, 500)),
  ]);
  check(
    "a server whose writes are off, credits off (CREDITS_LAUNCH_DAY null, as shipped) and a purchase with no id each refuse with nothing read or written",
    !offs[0].ok && offs[0].error === S.MALL_WRITES_OFF && !offs[1].ok && offs[1].error === M.BUY_CREDITS_OFF && !offs[2].ok && offs[2].error === M.BUY_CREDITS_OFF &&
      !offs[3].ok && offs[3].error === M.BUY_CREDITS_OFF && !offs[4].ok && offs[4].error === S.PURCHASE_NO_ID && offL.log.length === 0,
    offL.log.join(", ")
  );
  const one = ledger();
  const bought = await S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(one, 150));
  const w0 = one.writes[0];
  check(
    "a purchase: one commit of the MALL_BUY row, its qty the price, keyed 'buy:<clientId>', its receipt mall-1, guarded on the Mall's row count it read; it burns exactly 120 of 150",
    bought.ok && bought.value.delta === -120 && bought.value.balance === 30 && !bought.value.duplicate && bought.value.purchase.id === "ev-1" && bought.value.purchase.undoUntilMs === NOW.getTime() + 600_000 &&
      one.writes.length === 1 && w0.event.source === "MALL_BUY" && w0.event.qty === 120 && w0.event.dedupeKey === `buy:${CID}` && w0.guardCount === 0 && M.isMallReceipt(w0.event.receipt) && w0.event.receipt.balanceAfter === 30 && w0.event.sourceId === "rw-thai",
    JSON.stringify(bought)
  );
  const resend = await S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(one, 150));
  check(
    "a resend with the same clientId writes once: it answers the purchase already made (duplicate, delta 0, the same row) and commits nothing",
    resend.ok && resend.value.duplicate && resend.value.delta === 0 && resend.value.balance === 30 && resend.value.purchase.id === "ev-1" && one.writes.length === 1
  );
  // Two devices at once (the Fold and the desktop): both read before either writes.
  const race = ledger([], { want: 2 });
  const [onFold, onDesk] = await Promise.all([
    S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: "fold-0000-0001" }, deps(race, 150)),
    S.buyRewardCore("u1", { rewardId: "rw-film", clientId: "desk-0000-0001" }, deps(race, 150)),
  ]);
  const spent = race.all.filter((r) => r.source === "MALL_BUY").reduce((s, r) => s + (r.qty ?? 0), 0);
  check(
    "two concurrent buys (the Fold and the desktop) cannot overspend: both read 150, the first commits, the second's guard is stale, it re-reads once and is refused on what is left (no overdraft)",
    [onFold, onDesk].filter((x) => x.ok).length === 1 && (spent === 120 || spent === 60) && (() => { const lost = [onFold, onDesk].find((x) => !x.ok); return !!lost && !lost.ok && /costs (120|60) cr; you have (30|90) cr/.test(lost.error); })() &&
      race.log.filter((l) => l.startsWith("commit")).length === 2 && race.log.filter((l) => l === "rows").length === 3,
    race.log.join(", ")
  );
  const fits = ledger([], { want: 2 });
  const [f1, f2] = await Promise.all([
    S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: "fold-0000-0002" }, deps(fits, 500)),
    S.buyRewardCore("u1", { rewardId: "rw-film", clientId: "desk-0000-0002" }, deps(fits, 500)),
  ]);
  check(
    "…and when both fit, the second lands after its one re-read, on the balance the first left (500 − 120 − 60 = 320), each guarded on the count it read",
    f1.ok && f2.ok && fits.all.length === 2 && M.balanceOf(500, fits.all) === 320 && fits.writes.map((w) => w.guardCount).sort().join(",") === "0,1",
    fits.log.join(", ")
  );
  const stale: PStore = { rows: async () => [], commit: async () => Promise.reject(new Error("division by zero")) };
  const staleTwice = await S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(ledger(), 500, { purchases: stale }));
  check("a guard stale twice says so (\"Your credits changed meanwhile\"): one re-read only, never a guess", !staleTwice.ok && staleTwice.error === S.MALL_STALE);
  const keyed = ledger();
  const keyedStore: PStore = {
    rows: keyed.store.rows,
    commit: async (u, w) => {
      await keyed.store.commit(u, w);
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    },
  };
  const raced = await S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(keyed, 500, { purchases: keyedStore }));
  check("the same clientId landing meanwhile on another instance (the row's unique key): the purchase it wrote is answered, once", raced.ok && raced.value.duplicate && keyed.all.length === 1);
  // An undo-driven drop: 150 earned, 120 spent; then the quest is undone and earned falls to 100.
  const drop = ledger();
  await S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(drop, 130));
  const afterDrop = await S.buyRewardCore("u1", { rewardId: "rw-film", clientId: "desk-0000-0003" }, deps(drop, 110));
  check(
    "after an undo-driven drop below zero (earned 110, spent 120: −10) a purchase is refused, 'earn it back', and nothing is written",
    !afterDrop.ok && afterDrop.error === "You're at −10 cr: earn it back before you buy." && drop.all.length === 1
  );
  const cooled = ledger();
  await S.buyRewardCore("u1", { rewardId: "rw-cool", clientId: CID }, deps(cooled, 900, { store: catalog([{ id: "rw-cool", title: "Gig", category: "OUTING", price: 100, cooldownDays: 7 }]) }));
  const cooledAgain = await S.buyRewardCore("u1", { rewardId: "rw-cool", clientId: "next-0000-0001" }, deps(cooled, 900, { store: catalog([{ id: "rw-cool", title: "Gig", category: "OUTING", price: 100, cooldownDays: 7 }]) }));
  check("the cooldown holds across purchases: bought today, again today is refused until Wed 4 Nov", !cooledAgain.ok && cooledAgain.error === "At most once every 7 days: next on Wed 4 Nov." && cooled.all.length === 1);
  const gone = await S.buyRewardCore("u1", { rewardId: "rw-none", clientId: CID }, deps(ledger(), 900));
  check("a reward that isn't there is gone, nothing written", !gone.ok && gone.error === M.REWARD_GONE);
  {
    // Listed first, then a #play task of the same title appears on the board: Buy is refused at the core and nothing is
    // written; archiving it still works (the edit is refused for the same reason, so the line says to archive).
    const playLog: string[] = [];
    const listed = catalog([{ id: "rw-game", title: "Gaming session", category: "SCREEN", price: 50 }]);
    const becamePlay: import("../src/lib/mall-server").MallStore = { ...listed, playTitles: async () => (playLog.push("playTitles"), ["gaming session"]) };
    const playL = ledger();
    const playBuy = await S.buyRewardCore("u1", { rewardId: "rw-game", clientId: CID }, deps(playL, 900, { store: becamePlay }));
    const otherBuy = await S.buyRewardCore("u1", { rewardId: "rw-film", clientId: "film-0000-0001" }, deps(playL, 900, { store: becamePlay }));
    const archived = await S.archiveRewardCore("u1", "rw-game", deps(playL, 900, { store: becamePlay }));
    check(
      "a reward listed before a #play task took its title is refused at the buy (D30, H5: #play is never priced), nothing is written, the line says to archive it, and it can be archived; another reward still buys",
      !playBuy.ok && playBuy.error === "“Gaming session” is #play on your board, so it stays free. It can't be bought: archive this reward." &&
        playL.writes.length === 1 && playL.writes[0].event.sourceId === "rw-film" && otherBuy.ok && archived.ok && playLog.length === 2,
      JSON.stringify([playBuy, playLog])
    );
  }

  const undoL = ledger();
  await S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(undoL, 150));
  const undoAt = (iso: string) => S.undoBuyCore("u1", { purchaseId: "ev-1" }, deps(undoL, 150, { now: () => new Date(iso) }));
  const undone = await undoAt("2026-10-28T10:14:59.000Z");
  const undoneAgain = await undoAt("2026-10-28T10:15:30.000Z");
  const refund = undoL.writes.find((w) => w.event.source === "MALL_REFUND");
  check(
    "an undo inside its ten minutes: one MALL_REFUND row, its qty the price, keyed 'refund:<buyId>', with no guard (it can only give back); the balance is whole again; a repeat answers the first",
    undone.ok && undone.value.delta === 120 && undone.value.balance === 150 && !undone.value.duplicate && !!refund && refund.event.qty === 120 && refund.event.dedupeKey === "refund:ev-1" && refund.guardCount === null && refund.event.sourceId === "ev-1" &&
      undoneAgain.ok && undoneAgain.value.duplicate && undoneAgain.value.delta === 0 && undoL.writes.length === 2,
    JSON.stringify([undone, undoneAgain])
  );
  const lateL = ledger();
  await S.buyRewardCore("u1", { rewardId: "rw-thai", clientId: CID }, deps(lateL, 150));
  const tooLate = await S.undoBuyCore("u1", { purchaseId: "ev-1" }, deps(lateL, 150, { now: () => new Date("2026-10-28T10:15:01.000Z") }));
  const noSuch = await S.undoBuyCore("u1", { purchaseId: "ev-9" }, deps(lateL, 150));
  check("a refund works only within 10 minutes: at 10:01 past the buy it is refused and nothing is written; a purchase that isn't there is gone", !tooLate.ok && tooLate.error === M.UNDO_TOO_LATE && lateL.writes.length === 1 && !noSuch.ok && noSuch.error === M.PURCHASE_GONE);

  console.log("— P19: the store, the guard, the moments, the part —");
  const storeSrc = ms.slice(ms.indexOf("export const prismaPurchaseStore"), ms.indexOf("const depsOf"));
  check(
    "the purchase store: its rows are a findMany of the two sources; its commit is one $transaction of lifeLockOp first, the guard when set, then the row, and it clears 'activity' after",
    JSON.stringify(Object.keys(S.prismaPurchaseStore).sort()) === JSON.stringify(["commit", "rows"]) &&
      /prisma\.activityEvent\.findMany\(\{\s*where: \{ userId, source: \{ in: \[\.\.\.CREDIT_SPEND_SOURCES\] \} \}/.test(storeSrc) &&
      /const ops: Prisma\.PrismaPromise<unknown>\[\] = \[lifeLockOp\(userId\)\];\s*if \(w\.guardCount != null\) ops\.push\(prisma\.\$executeRaw\(purchaseGuardSql\(userId, w\.guardCount\)\)\);\s*ops\.push\(\s*activityOp\(userId, \{/.test(storeSrc) &&
      /const done = await prisma\.\$transaction\(ops\);/.test(storeSrc) && /finally \{\s*invalidateActivity\(\{ source: e\.source, sink: "NONE" \}\);/.test(storeSrc)
  );
  const guard = S.purchaseGuardSql("u1", 3);
  check(
    "the guard counts the user's MALL_BUY and MALL_REFUND rows and divides by zero unless they are still the count read (as momentum's row guard does)",
    /SELECT 1 \/ \(CASE WHEN \(SELECT COUNT\(\*\) FROM "ActivityEvent" WHERE "userId" = \? AND "source" IN \(\?,\s?\?\)\) = \?::int THEN 1 ELSE 0 END\)/.test(guard.sql.replace(/\$\d+/g, "?")) && JSON.stringify(guard.values) === JSON.stringify(["u1", "MALL_BUY", "MALL_REFUND", 3]),
    guard.sql
  );
  const snaps: string[] = [];
  const fakeMoments = { capture: async () => (snaps.push("snap"), {}), detect: async () => [{ id: "c1", tier: 2 as const, kind: "mall-buy" as const, facts: { eyebrow: "Mall", title: "Takeaway night bought", numeral: { from: null, to: 120 } }, what: [] }] };
  const withSeal = await S.withMallMoments("u1", async () => ({ ok: true, value: { duplicate: false } }), (v) => !v.duplicate, { moments: fakeMoments });
  const repeatNoSnap = await S.withMallMoments("u1", async () => ({ ok: true, value: { duplicate: true } }), (v) => !v.duplicate, { moments: fakeMoments });
  const refusedNoSnap = await S.withMallMoments("u1", async () => ({ ok: false as const, error: "no" }), () => true, { moments: fakeMoments });
  check(
    "a purchase's moments: the 'mall' snapshot before and after a new purchase returns its Seal; a repeat or a refusal takes no second snapshot and plays nothing",
    withSeal.ok && withSeal.value.celebrations.length === 1 && withSeal.value.celebrations[0].kind === "mall-buy" && repeatNoSnap.ok && repeatNoSnap.value.celebrations.length === 0 && !refusedNoSnap.ok && snaps.length === 4,
    snaps.join(",")
  );
  const partCalls: string[] = [];
  const partStore: PStore = { rows: async () => (partCalls.push("rows"), [buyRow("b1", T, 60), buyRow("b2", T, 40), refundRow("b2", T, 40)]), commit: async () => "x" };
  const partOff = await S.readMallPart("u1", NOW, { purchases: partStore });
  const partOn = await S.readMallPart("u1", NOW, { purchases: partStore, launchDay: LAUNCH });
  check(
    "the celebrations' 'mall' part: null with no read while credits are off (as shipped: nothing Mall-shaped can play), else the purchases with their undone flags",
    partOff === null && partCalls.length === 1 && !!partOn && partOn.buys.length === 2 && partOn.buys[1].refunded && !partOn.buys[0].refunded && /mall: \(\) => readMall\(userId, now\)/.test(code("src/lib/snapshot.ts")) && /mall: \["activity"\]/.test(code("src/lib/snapshot.ts"))
  );
  const { diffProgress } = await import("../src/lib/celebration-detect");
  const { KIND_TIER, honestyProblem } = await import("../src/lib/celebration-types");
  const before = { parts: ["mall" as const], mall: { buys: [] } };
  const after = { parts: ["mall" as const], mall: { buys: [{ id: "ev-1", day: T, title: "Takeaway night", price: 120, before: 150, after: 30, refunded: false }, { id: "ev-2", day: T, title: "Film night", price: 60, before: 90, after: 30, refunded: true }] } };
  const drafts = diffProgress(before, after);
  check(
    "the Seal: one T2 'mall-buy' per new purchase ('mall-buy:<rowId>'), honest (the price as its numeral, the credits either side), never an XP or MP amount; an undone one plays nothing",
    KIND_TIER["mall-buy"] === 2 && drafts.length === 1 && drafts[0].dedupeKey === "mall-buy:ev-1" && drafts[0].facts.numeral?.to === 120 && !drafts[0].facts.amounts?.length &&
      drafts[0].what.some((w) => w.value === "150 → 30 cr") && honestyProblem({ id: "x", tier: 2, kind: "mall-buy", facts: drafts[0].facts, what: drafts[0].what }) === null && diffProgress(after, after).length === 0
  );

  console.log("— P19: the page, the actions and the copy —");
  const viewLog: string[] = [];
  const pl = ledger([buyRow("ev-1", T, 120, { occurredAt: "2026-10-28T10:01:00.000Z" })]);
  const liveView = await S.loadMall("u1", { store: catalog(), wallet: async () => ({ wallet: live(30, 150), days: [] }), purchases: pl.store, launchDay: LAUNCH, now: () => NOW, ...ON });
  const offCatalog = catalog();
  const offView = await S.loadMall("u1", { store: { ...offCatalog, playTitles: async () => (viewLog.push("playTitles"), []) }, wallet: async () => ({ wallet: C.OFF_WALLET(T), days: [] }), purchases: { rows: async () => (viewLog.push("rows"), []), commit: async () => "x" }, now: () => NOW, ...ON });
  const playView = await S.loadMall("u1", { store: { ...catalog(), playTitles: async () => ["film night"] }, wallet: async () => ({ wallet: live(500, 500), days: [] }), purchases: ledger().store, launchDay: LAUNCH, now: () => NOW, ...ON });
  const playUnread = await S.loadMall("u1", { store: { ...catalog(), playTitles: async () => Promise.reject(new Error("no board")) }, wallet: async () => ({ wallet: live(500, 500), days: [] }), purchases: ledger().store, launchDay: LAUNCH, now: () => NOW, ...ON });
  check(
    "loadMall: while credits count, each reward's Buy state and the purchases (undoable until 21:11, drawn by the server on the life day's clock); while off nothing more is read (no purchases, no #play titles) and no reward can be bought",
    liveView.buy["rw-thai"].can === false && /costs 120 cr; you have 30 cr/.test(liveView.buy["rw-thai"].why ?? "") && liveView.buy["rw-film"].can === false &&
      liveView.purchases.length === 1 && liveView.purchases[0].undoUntilMs === Date.parse("2026-10-28T10:11:00.000Z") && liveView.purchases[0].undoUntilAt === "21:11" &&
      offView.purchases.length === 0 && viewLog.length === 0 && Object.values(offView.buy).every((x) => !x.can && x.why === M.BUY_CREDITS_OFF)
  );
  check(
    "loadMall (D30): a reward whose title is #play on the board now shows no buyable state (the line says to archive it) while the others still buy; unread #play titles offer nothing",
    playView.buy["rw-film"].can === false && /is #play on your board, so it stays free\. It can't be bought: archive this reward\./.test(playView.buy["rw-film"].why ?? "") && playView.buy["rw-thai"].can === true &&
      Object.values(playUnread.buy).every((x) => !x.can && x.why === "Your board couldn't be read just now.")
  );
  const actions = code("src/app/actions/mall.ts");
  check(
    "actions/mall.ts: buyReward wraps buyRewardCore in the purchase's moments (a repeat takes no second snapshot), undoBuy calls undoBuyCore; both refresh when asked on every answer, a refusal too (so the wallet header and the Buy states follow the server's words)",
    /return withMallMoments\(userId, \(\) => buyRewardCore\(userId, \{ rewardId, clientId \}\), \(v\) => !v\.duplicate\);/.test(actions) && /return undoBuyCore\(userId, \{ purchaseId \}\);/.test(actions) && /if \(!isPurchaseClientId\(clientId\)\)/.test(actions) &&
      /return run\(\s*"buyReward",\s*opts,\s*async \(userId\) => \{[\s\S]*?\},\s*"answer"\s*\);/.test(actions) && /return run\(\s*"undoBuy",\s*opts,\s*async \(userId\) => \{[\s\S]*?\},\s*"answer"\s*\);/.test(actions) &&
      /if \(\(res\.ok \|\| on === "answer"\) && opts\?\.refresh === true\) refresh\(\);/.test(actions)
  );
  const { MallBoard } = await import("../src/components/home/MallBoard");
  const plain = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const noop = async () => ({ ok: true as const, value: { id: "x" } });
  const acts = { addReward: noop, editReward: noop, archiveReward: async () => ({ ok: true as const, value: null }), buyReward: async () => ({ ok: false as const, error: "no" }), undoBuy: async () => ({ ok: false as const, error: "no" }) };
  const liveBoard = plain(renderToStaticMarkup(createElement(MallBoard, { data: { wallet: liveView.wallet, goodDay: liveView.goodDay, rewards: liveView.rewards, groups: liveView.groups, archived: [], writesOn: true, ready: true, buy: { "rw-thai": { can: false, why: "Takeaway night costs 120 cr; you have 30 cr (90 cr short)." }, "rw-film": { can: true, why: null } }, purchases: liveView.purchases }, actions: acts })));
  check(
    "the board once credits count: Buy on each reward (then Confirm), one that can't be bought disabled with its why, the purchases with Undo until its minute, the honour and buying notes",
    (liveBoard.match(/>Buy</g) ?? []).length === 2 && liveBoard.includes('aria-label="Buy Film night for 60 cr"') && /disabled=""[^>]*aria-label="Buy Takeaway night for 120 cr"|aria-label="Buy Takeaway night for 120 cr"[^>]*disabled=""/.test(liveBoard) &&
      liveBoard.includes("you have 30 cr (90 cr short)") && liveBoard.includes(">Purchases<") && liveBoard.includes(">Undo<") && liveBoard.includes("until 21:11") && liveBoard.includes(M.MALL_BUYING) && liveBoard.includes(M.MALL_HONOUR),
    liveBoard.slice(0, 400)
  );
  {
    // The review of 2026-10-24: on a phone (one column) up to 20 purchases sat above the rewards; an undone purchase read
    // "+60 cr" as if it were income; the board drew its own Sydney clock beside the server's LIFE_TZ one.
    const { purchaseFigureOf, boughtRowLine } = await import("../src/components/home/MallBoard");
    const boardSrc = code("src/components/home/MallBoard.tsx");
    const undone = M.purchasesOf([buyRow("b1", "2026-10-27", 60, { sourceId: "rw-film" }), refundRow("b1", "2026-10-27", 60)], NOW.getTime())[0];
    const withUndone = plain(renderToStaticMarkup(createElement(MallBoard, { data: { wallet: liveView.wallet, goodDay: liveView.goodDay, rewards: liveView.rewards, groups: liveView.groups, archived: [], writesOn: true, ready: true, buy: liveView.buy, purchases: [...liveView.purchases, undone] }, actions: acts })));
    const firstBuy = withUndone.indexOf(">Buy<");
    const purchasesAt = withUndone.indexOf(">Purchases<");
    check(
      "the board puts the rewards (and their Buy) before the purchase history in its one-column order, and the purchases under the rewards from 760 px too",
      firstBuy > 0 && purchasesAt > firstBuy && withUndone.lastIndexOf(">Buy<") < purchasesAt
    );
    check(
      "an undone purchase's figure is its price alone, struck through (net nothing: never '+60 cr', which reads as income); a live one is '−120 cr'",
      purchaseFigureOf(undone) === "60 cr" && purchaseFigureOf({ refunded: false, priceLine: "120 cr" }) === "−120 cr" && withUndone.includes('class="ml-price ml-void">60 cr<') && !withUndone.includes("+60 cr") &&
        /\.ml-price\.ml-void \{ text-decoration: line-through;/.test(read("src/components/home/you.css")) && undone.line === "Bought Tue 27 Oct at 21:05 · undone, 60 cr back"
    );
    check(
      "the board draws no zone of its own: Undo's 'until' is the server's (PurchaseView undoUntilAt, LIFE_TZ) and the archived day reads LIFE_TZ; no 'Australia/Sydney' in it",
      !/Australia\/Sydney/.test(boardSrc) && /until \{p\.undoUntilAt\}/.test(boardSrc) && /timeZone: LIFE_TZ,/.test(boardSrc) && /import \{ LIFE_TZ \} from "@\/lib\/life-day";/.test(boardSrc) && !/new Intl\.DateTimeFormat/.test(boardSrc)
    );
    check(
      "a purchase says so in words under its own row (the Seal is decoration and may not play), pointing to Undo; a repeat says nothing was spent twice; a refusal's line shows once when the Buy state already says it",
      boughtRowLine("Film night", { purchase: { ...undone, price: 60 }, balance: 90, duplicate: false }) === "Film night bought for 60 cr · 90 cr left. Undo it in Purchases for 10 minutes." &&
        boughtRowLine("Film night", { purchase: undone, balance: 90, duplicate: true }) === "Film night was already bought: nothing is spent twice." &&
        /setDone\(boughtRowLine\(r\.title, res\.value\)\);/.test(boardSrc) && /\{error && error !== why && \(/.test(boardSrc)
    );
  }
  const negBoard = plain(renderToStaticMarkup(createElement(MallBoard, { data: { wallet: live(-10, 110), goodDay: { calibrating: true, days: 7 }, rewards: [], groups: [], archived: [], writesOn: true, ready: true }, actions: acts })));
  check("…and after an undo-driven drop the header shows '−10 cr' and 'earn it back' plainly", negBoard.includes(">−10 cr<") && negBoard.includes("earn it back: buying waits until you're back at 0"));
  const board = code("src/components/home/MallBoard.tsx");
  check(
    "the Buy keeps its client id until the server answers (a retry is the same purchase), the Seal joins the queue, and the balance burns under ACT only for a new purchase",
    /clientId\.current \?\?= newClientId\(\);/.test(board) && /clientId\.current = null;\s*setDone\(boughtRowLine\(r\.title, res\.value\)\);\s*onBought\(res\.value\);/.test(board) && /if \(ev\.tier >= 2\) enqueue\(ev\);/.test(board) && /if \(!v\.duplicate\) void playGlyph\(balanceRef\.current, "burn", \{ licence: "ACT" \}\);/.test(board) && !/Math\.random/.test(board)
  );
  const rulesFlat = read("src/app/today/rules/page.tsx").replace(/\s+/g, " ");
  check(
    "the rules page: a purchase is permission now, exactly the price and never more than the balance (no overdraft), undone for MALL_UNDO_MINUTES, on honour; below zero only after an undo, never charged; no penalty takes credits",
    /A purchase is permission now: Buy, then Confirm, burns exactly the price, never more than your balance \(there is no overdraft and no credit line\), and it can be undone for \{MALL_UNDO_MINUTES\} minutes\./.test(rulesFlat) &&
      /A balance goes below zero one way only: an undone quest takes back credits a purchase had already spent\./.test(rulesFlat) && /No penalty ever takes credits\./.test(rulesFlat) && /import \{ MALL_UNDO_MINUTES \} from "@\/lib\/mall";/.test(rulesFlat)
  );
  const day = addDays(T, 1);
  check("deterministic (D32): the same rows give the same plan, the same views and the same states, on every server", JSON.stringify(plan(cool, 1000, [buyRow("b1", "2026-10-22", 120)])) === JSON.stringify(M.planBuy({ reward: cool, earned: 1000, rows: [buyRow("b1", "2026-10-22", 120)], today: T, playTitles: NO_PLAY })) && day === "2026-10-29");
}

// The file's own reads, for the P16 to P19 checks above.
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

/** One block's checks: a throw counts as one failure, and the next block still runs. */
async function run(name: string, block: () => Promise<void>): Promise<void> {
  try {
    await block();
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}'s checks threw — ${err instanceof Error ? err.stack : String(err)}`);
  }
}

run("P16", p16)
  .then(() => run("P17", p17))
  .then(() => run("P18", p18))
  .then(() => run("P19", p19))
  .finally(() => {
    console.log("");
    console.log(`credits-check: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });

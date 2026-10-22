/**
 * The credits guard (docs/life-plan/blueprint-plan-2026-10-22.md P0; blueprint 4.1 and D27): XP is
 * never spent, and the Mall spends credits only. So no file named credits* or mall* imports or
 * writes Domain points, a sink-TRACK (or DOMAIN) ActivityEvent row, or a MasteryLedgerEntry: credits
 * are their own derived ledger (P16), and a Mall purchase (P19) is a sink-NONE record that pays
 * and costs no XP, MP or point.
 *
 * A target is any file under src/ with a path segment that starts with credit or mall, read as
 * scripts/_ledger-writers.ts isTarget does (credits-server.ts, a mall/ folder and MallCard.tsx
 * count). None exists yet, so this passes with no target and fails the moment a later phase adds
 * one that breaks the rule. A target may not:
 *   - write the ledger directly: an ActivityEvent, MasteryLedgerEntry or CapitalLedgerEntry
 *     mutation (Prisma or raw SQL), or a Domain's totalPoints, or call a mint helper or
 *     domainDebitOp. An ActivityEvent row goes through activity.ts, so its sink is checked:
 *   - call recordActivity / activityOp / activityData without `sink: "NONE"` written in the call
 *     (activityData honours an explicit sink, pinned below): the row must be an object literal with
 *     `sink: "NONE"` among its own members and after its last spread (a later `...row` would
 *     override it); or name the helpers as a value (passed on, a call this check cannot read);
 *   - import a value from a writer module (_ledger-writers.ts writerModulesOf), except the names
 *     CREDITS_MAY_IMPORT lists: activity.ts's three ways in (checked per call above) and its
 *     post-commit helpers, and tasks.ts lifeLockOp (P19's buy copies buyPerkCore's lock). So
 *     mastery.ts, capital.ts, srs.ts and every paying core stay out. `import type` is fine.
 *
 * Text only: no database, no model, no clock. Exits 1 on any failure. _no-model comes first all the same:
 * the fixtures below spell imports of writer actions, and roadmap-contract-check's import walk follows
 * them to roadmap modules.
 *
 *   npx tsx scripts/credits-check.ts
 */
import "./_no-model";
import {
  ACTIVITY_WRITERS,
  LEDGER_HELPERS,
  LEDGER_TABLE_WRITES,
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

/** credits* and mall*, as isTarget reads a path segment (credit covers credit-ledger and credits). */
const CREDITS_PREFIXES = ["credit", "mall"] as const;

/** The only values a target may import from a writer module, by module. */
const CREDITS_MAY_IMPORT: Readonly<Record<string, readonly string[]>> = {
  "src/lib/activity.ts": [...ACTIVITY_WRITERS, "invalidateActivity", "isDuplicateActivity", "activityTags"],
  "src/lib/tasks.ts": ["lifeLockOp"],
};

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
  const activity = code("src/lib/activity.ts");
  check(
    "activity.ts honours an explicit sink (activityData: e.sink ?? DEFAULT_SINK), and activityOp and recordActivity both build their row with it",
    /const sink = e\.sink \?\? DEFAULT_SINK\[e\.source\];/.test(activity) && callArgsOf(activity, "activityData").filter((a) => a.trim() === "userId, e").length >= 2
  );
  check("…and a lock is only a lock: tasks.ts lifeLockOp takes the advisory lock and writes nothing", /export function lifeLockOp\(userId: string\) \{\s*return prisma\.\$executeRaw`SELECT pg_advisory_xact_lock\(/.test(code("src/lib/tasks.ts")));
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

console.log("");
console.log(`credits-check: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

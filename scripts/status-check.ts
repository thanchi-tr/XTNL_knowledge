/**
 * The status guard (docs/life-plan/blueprint-plan-2026-10-22.md P0): no file named avatar*,
 * competency* or status-panel* holds a ledger writer. The Status panel (P1), avatar targets (P4)
 * and competencies (P5) are readings: they are derived from the ledger and never add to it, so no
 * XP, MP or Domain point can come from them (blueprint D9: a competency's tier-up is a Seal only).
 *
 * A target is any file under src/ with a path segment that starts with avatar, competenc
 * (competency, competencies) or status-panel, read as scripts/_ledger-writers.ts isTarget does
 * (StatusPanel.tsx and an avatar/ folder count). None exists yet, so this passes with no target
 * and fails the moment a later phase adds one that writes. A target may not:
 *   - write the ledger itself: an ActivityEvent row of any sink, a MasteryLedgerEntry or a
 *     CapitalLedgerEntry (Prisma or raw SQL), or a Domain's totalPoints;
 *   - call a ledger helper (activity.ts recordActivity / activityOp / activityData, mastery.ts's
 *     mint helpers, srs.ts domainDebitOp: balance-horizon 3g's LEDGER_WRITERS names);
 *   - import a value from a writer module (_ledger-writers.ts writerModulesOf: every src file
 *     with a ledger write, found by the same scan, every "use server" action importing one, and
 *     every module importing such an action, as mobile-api-cores.ts and idea-filing.ts do).
 *     `import type` is fine.
 *
 * Text only: no database, no model, no clock. Exits 1 on any failure. _no-model comes first all the same:
 * the fixtures below spell imports of writer actions, and roadmap-contract-check's import walk follows
 * them to roadmap modules.
 *
 *   npx tsx scripts/status-check.ts
 */
import "./_no-model";
import { LEDGER_WRITES, codeOf, excerpt, importsOf, isTarget, readCode, srcFiles, writerModulesOf } from "./_ledger-writers";

/** avatar*, competency* and status-panel*, as isTarget reads a path segment. */
const STATUS_PREFIXES = ["avatar", "competenc", "statuspanel"] as const;

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
  const write = excerpt(LEDGER_WRITES, code);
  if (write) out.push(`writes the ledger (${write})`);
  for (const i of importsOf(code, rel)) {
    if (i.names.length > 0 && i.resolved != null && writers.has(i.resolved)) out.push(`imports ${i.names.join(", ")} from the writer ${i.resolved}`);
  }
  return out;
}

const files = srcFiles();
const cache = new Map<string, string>();
const code = (rel: string) => cache.get(rel) ?? (cache.set(rel, readCode(rel)), cache.get(rel) as string);
const writers = writerModulesOf(files, code);

console.log("— the writers the scan finds —");
{
  const known = [
    "src/lib/activity.ts",
    "src/lib/mastery.ts",
    "src/lib/capital.ts",
    "src/lib/srs.ts",
    "src/lib/tasks.ts",
    "src/lib/settlement.ts",
    "src/lib/momentum-server.ts",
    "src/app/actions/ideas.ts",
    "src/app/actions/skills.ts",
    "src/app/actions/tasks.ts",
    "src/lib/mobile-api-cores.ts",
    "src/lib/idea-filing.ts",
  ];
  const missing = known.filter((f) => !writers.has(f));
  check(
    "the scan finds today's writers: activity, mastery, capital, srs, tasks, settlement, momentum-server, the idea and emblem actions, the task actions that call them, and the lib modules that carry an action (mobile-api-cores, idea-filing)",
    missing.length === 0,
    missing.length ? `missing ${missing.join(", ")}` : `${writers.size} writer modules among ${files.length} src files`
  );
}

console.log("— the matcher, on fixtures —");
{
  const FROM = "src/lib/status-panel.ts";
  const caught: [string, string][] = [
    ["a TRACK row through activityOp", `ops.push(activityOp(userId, { source: "TASK", sink: "TRACK", track: "DUTY", xp: 4 }));`],
    ["a NONE row through recordActivity (a status file writes no row at all)", `await recordActivity(userId, { source: "WEEK", sink: "NONE" });`],
    ["a direct ActivityEvent create", `await prisma.activityEvent.create({ data });`],
    ["an MP mint", `ops.push(...mintLifeMasteryOps(userId, mint));`],
    ["a MasteryLedgerEntry create", `await prisma.masteryLedgerEntry.create({ data: { userId, amount: 1 } });`],
    ["a CapitalLedgerEntry upsert", `await client.capitalLedgerEntry.upsert({ where, create, update });`],
    ["Domain points through Prisma", `await prisma.domain.update({ where: { id }, data: { totalPoints: { increment: 5 } } });`],
    ["Domain points through raw SQL", 'await prisma.$executeRaw`UPDATE "public"."Domain" SET "totalPoints" = 0 WHERE "id" = ${id}`;'],
    ["an INSERT into MasteryLedgerEntry", 'await prisma.$executeRaw`INSERT INTO "MasteryLedgerEntry" ("id") VALUES (${id})`;'],
    ["the same INSERT in lower case", 'await prisma.$executeRaw`insert into "MasteryLedgerEntry" ("id") values (${id})`;'],
    ["Domain points past a nested object", `await prisma.domain.update({ where: { id }, data: { level: { set: 2 }, totalPoints: 0 } });`],
    ["a value import from mastery.ts", `import { getMasteryBalanceFresh } from "@/lib/mastery";`],
    ["a value import from tasks.ts", `import { completeInstanceCore } from "./tasks";`],
    ["a server action that pays", `import { completeTask } from "@/app/actions/tasks";`],
    ["a lib module carrying paying actions (realMobileDeps holds completeTask, submitReview …)", `import { realMobileDeps } from "@/lib/mobile-api-cores";`],
    ["a namespace import of activity.ts", `import * as A from "@/lib/activity";`],
    ["a dynamic import of srs.ts", `const srs = await import("@/lib/srs");`],
  ];
  const clean: [string, string][] = [
    ["a type import from mastery.ts", `import type { LifeMint } from "@/lib/mastery";`],
    ["type-only names from activity.ts", `import { type ActivityInput } from "@/lib/activity";`],
    ["a read of TRACK rows", `const rows = await prisma.activityEvent.findMany({ where: { userId, sink: "TRACK" } });`],
    ["a Domain's points read into a row", `return domains.map((d) => ({ composition: d.composition, totalPoints: d.totalPoints }));`],
    ["a writer named in a comment", `// never prisma.activityEvent.create here\n/* nor mintLifeMasteryOps(userId, m) */\nexport const x = 1;`],
    ["a value import from a module that only reads", `import { lifeTracksView } from "@/lib/life-tracks";`],
  ];
  // Through codeOf, as readCode reads every real file.
  const missed = caught.filter(([, src]) => offencesOf(FROM, codeOf(src), writers).length === 0).map(([n]) => n);
  const flagged = clean.flatMap(([n, src]) => {
    const o = offencesOf(FROM, codeOf(src), writers);
    return o.length ? [`${n}: ${o.join("; ")}`] : [];
  });
  check(`the matcher catches every writer form (${caught.length} fixtures)`, missed.length === 0, missed.join(", "));
  check(`…and passes reads, types and comments (${clean.length} fixtures)`, flagged.length === 0, flagged.join(" | "));
}

console.log("— the rule —");
{
  const targets = files.filter((f) => isTarget(f, STATUS_PREFIXES));
  const offenders = targets.flatMap((f) => offencesOf(f, code(f), writers).map((o) => `${f} ${o}`));
  check(
    "no avatar*, competency* or status-panel* file writes the ledger or imports a writer",
    offenders.length === 0,
    offenders.length ? offenders.join("; ") : targets.length ? `${targets.length} read: ${targets.join(", ")}` : "no such file yet (P1's status-panel, P4's avatar and P5's competency files land here)"
  );
}

console.log("");
console.log(`status-check: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

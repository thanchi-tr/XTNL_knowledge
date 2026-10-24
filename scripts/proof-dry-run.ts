/**
 * Blueprint P23 (docs/life-plan/blueprint-plan-2026-10-22.md; decision D20, harm H9): the default deep-work set as a
 * dry run. It lists which of the user's templates the default rule would mark as proof (WORK, STUDY or CREATIVE at
 * Demanding or above, on the personal Board: proof.ts isDefaultDeepWork), so the user can approve the list first.
 * Nothing is switched on from it: the approved set is applied later, on the user's go, by its own reviewed write.
 * Run by the lead only; no check chain runs it, since it reads a real database.
 *
 *   npx tsx scripts/proof-dry-run.ts            the list, grouped by board (always the personal Board) and track
 *   npx tsx scripts/proof-dry-run.ts --json     the same rows as JSON, for the approval record
 *
 * What it prints, for every user with a live template (the default user, DEFAULT_USER_ID, first and marked):
 *   - each template the rule would mark: its title, track, the band a tick pays at (the self-rating included) and the
 *     machine band when they differ, its category, its kind and rule, its board ("personal"), and its id;
 *   - the near misses, so the user can see where the line falls: personal TASK or HABIT templates in WORK, STUDY or
 *     CREATIVE that the rule leaves out (below Demanding, #play, completing themselves from activity, or a finished
 *     one-off), each with the reason;
 *   - the counts, and how many live work-tab templates the rule never touches.
 *
 * READ ONLY. Prisma's read API only (findMany): no create, update, upsert, delete, raw SQL or transaction, so every
 * statement it sends is a SELECT. It never reads or writes TaskTemplate.proof (so it runs the same before and after
 * the migration 20270101000000_task_proof), nothing is marked, and no row is touched. scripts/proof-check.ts holds
 * this in the text.
 *
 * The database guard (settlement.ts launchTargetOf, the launch scripts' own), before the first query (Prisma connects
 * on its first query, not on import): DATABASE_URL, and DIRECT_URL when set, must both name the xtnl-idea project
 * (ref xvlkujmtdcpaoxdftgpl) or both the rehearsal mirror (localhost:55432). XTNL_thesis, any other database and two
 * URLs that disagree are refused before a connection is made. Hosts and users are printed, never a password.
 *
 * Exit code: 0 printed, 1 a read failed, 2 the guard refused.
 */
import "./_no-model";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { BAND_META, TRACK_LABEL, effBand, isTrack, toBand } from "../src/lib/life-grade";
import { DEEP_WORK_CATEGORIES, DEEP_WORK_MIN_BAND, PROOF_LAUNCH_DAY, isDefaultDeepWork, type DeepWorkCandidate } from "../src/lib/proof";
import { launchTargetOf } from "../src/lib/settlement";

const JSON_OUT = process.argv.includes("--json");

/** The columns the rule reads, and the words the list shows. TaskTemplate.proof is never selected. */
const SELECT = {
  id: true,
  userId: true,
  title: true,
  kind: true,
  category: true,
  track: true,
  band: true,
  bandOverride: true,
  boardId: true,
  archivedAt: true,
  intrinsic: true,
  autoMetric: true,
  recurrence: true,
  completedAt: true,
} as const;

type Row = DeepWorkCandidate & { id: string; userId: string; title: string; track: string };

/** Why the rule leaves a personal deep-work-category template out (null: it marks it). */
function missOf(t: Row): string | null {
  if (isDefaultDeepWork(t)) return null;
  if (t.kind !== "TASK" && t.kind !== "HABIT") return `a ${t.kind.toLowerCase().replace("_", " ")}`;
  if (t.intrinsic) return "#play (pays nothing, so nothing to prove)";
  if (t.autoMetric != null) return `completes itself from activity (${t.autoMetric})`;
  if (!t.recurrence && t.completedAt != null) return "a finished one-off";
  return `${BAND_META[effBand(toBand(t.band), t.bandOverride)].label}, below ${BAND_META[DEEP_WORK_MIN_BAND].label}`;
}

function bandText(t: Row): string {
  const machine = toBand(t.band);
  const priced = effBand(machine, t.bandOverride);
  return priced === machine ? BAND_META[priced].label : `${BAND_META[priced].label} (self-rated from ${BAND_META[machine].label})`;
}

const trackText = (t: Row): string => (isTrack(t.track) ? TRACK_LABEL[t.track] : t.track);
const ruleText = (t: Row): string => (t.recurrence ? `${t.kind.toLowerCase()} · ${t.recurrence}` : t.kind.toLowerCase());

async function main(): Promise<void> {
  // ── Where this reads (before any query) ──
  const target = launchTargetOf({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL });
  if (target.kind === "refused") {
    console.error("Refusing to read: this script reads the xtnl-idea project or the rehearsal mirror, nothing else.");
    console.error(`  target: ${target.label}`);
    for (const p of target.problems) console.error(`  - ${p}`);
    process.exitCode = 2;
    return;
  }
  const defaultUser = process.env.DEFAULT_USER_ID?.trim() || null;

  // ── The reads: two SELECTs, nothing else ──
  const [personal, workTabs] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { archivedAt: null, boardId: null, category: { in: [...DEEP_WORK_CATEGORIES] } },
      select: SELECT,
      orderBy: [{ userId: "asc" }, { track: "asc" }, { title: "asc" }],
    }),
    prisma.taskTemplate.findMany({ where: { archivedAt: null, boardId: { not: null } }, select: { userId: true } }),
  ]);
  const rows = personal as Row[];

  const users = [...new Set([...rows.map((r) => r.userId), ...(defaultUser ? [defaultUser] : [])])].sort((a, b) =>
    a === defaultUser ? -1 : b === defaultUser ? 1 : a.localeCompare(b)
  );

  if (JSON_OUT) {
    const out = users.map((userId) => {
      const mine = rows.filter((r) => r.userId === userId);
      return {
        userId,
        default: userId === defaultUser,
        marked: mine.filter((r) => isDefaultDeepWork(r)).map((r) => ({ id: r.id, title: r.title, track: trackText(r), band: bandText(r), category: r.category, kind: r.kind, recurrence: r.recurrence, board: "personal" })),
        left: mine.filter((r) => !isDefaultDeepWork(r)).map((r) => ({ id: r.id, title: r.title, why: missOf(r) })),
        workTabTemplates: workTabs.filter((w) => w.userId === userId).length,
      };
    });
    console.log(JSON.stringify({ rule: { categories: DEEP_WORK_CATEGORIES, minBand: DEEP_WORK_MIN_BAND, board: "personal" }, users: out }, null, 2));
    return;
  }

  console.log(`Proof of work: the default deep-work set, a dry run (blueprint P23, D20) · ${target.label} · read only`);
  console.log(`Rule: ${DEEP_WORK_CATEGORIES.join(", ")} at ${BAND_META[DEEP_WORK_MIN_BAND].label} or above (as a tick pays it), a live task or habit on the personal Board.`);
  console.log(`PROOF_LAUNCH_DAY ${PROOF_LAUNCH_DAY ?? "null"} in code: nothing is gated until the user's go, and nothing below is marked by this run.`);
  if (users.length === 0) console.log("\nNo live personal template in WORK, STUDY or CREATIVE, and DEFAULT_USER_ID is not set: the default set is empty.");
  if (!defaultUser) console.log("\nDEFAULT_USER_ID is not set: every user with a candidate is listed.");

  for (const userId of users) {
    const mine = rows.filter((r) => r.userId === userId);
    const marked = mine.filter((r) => isDefaultDeepWork(r));
    const left = mine.filter((r) => !isDefaultDeepWork(r));
    const work = workTabs.filter((w) => w.userId === userId).length;
    console.log(`\n── ${userId}${userId === defaultUser ? " (DEFAULT_USER_ID, the app's user)" : ""}`);
    console.log(`  would mark ${marked.length} ${marked.length === 1 ? "template" : "templates"} as proof (board: personal)`);
    for (const r of marked) {
      console.log(`    ✓ ${r.title}  · ${trackText(r)} · ${bandText(r)} · ${r.category} · ${ruleText(r)} · board personal · ${r.id}`);
    }
    if (left.length > 0) {
      console.log(`  left out (${left.length}), so the line can be checked:`);
      for (const r of left) console.log(`    · ${r.title}  · ${trackText(r)} · ${r.category} · ${missOf(r)} · ${r.id}`);
    }
    console.log(`  work tabs: ${work} live ${work === 1 ? "template" : "templates"}, never in the set (work pays no XP).`);
  }

  console.log("\nNothing was written: two SELECTs. Show the user the ✓ list; the approved set is applied later, on their go.");
}

main()
  .catch((err) => {
    console.error("A read failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

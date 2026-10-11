/**
 * Recompute every stored Domain and Field level from the formulas (xp.ts domainLevel / fieldLevel).
 *
 * Stored levels drifted above the formula: Domains created before 2026-10-11 defaulted to level 1 while
 * empty, and a Field was summed from those stored values (leveling.ts now recomputes siblings). Levels are
 * derived data, so this only rewrites the two level columns; no Idea, point or Domain is touched.
 *
 * Step 2 (also 2026-10-11): fieldLevel is depth first (the best Domain counts fully, the next half, the
 * next a quarter …), so every Field with more than one Domain, or one Domain above level 1, moves. The
 * attributes read breadth from the Domain levels (xp.ts fieldBreadth), not this column, so no attribute
 * score moves. FieldSnapshot rows are not rewritten: the ones dated before xp.ts LEVEL_RULE_SINCE hold
 * the old Field level, and every week-old reader (the You sheet's Knowledge gain and ghost, the Stats
 * deltas, progress-rate.ts) treats them as missing. The weekly quota reads breadth (field-quota.ts), so it
 * asks what it asked before.
 *
 *   npx tsx --env-file=.env scripts/backfill-levels.ts            dry run: prints every change, writes nothing
 *   npx tsx --env-file=.env scripts/backfill-levels.ts --apply    writes the changes in one transaction
 */
import { PrismaClient } from "@prisma/client";
import { domainLevel, fieldLevel } from "../src/lib/xp";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const fields = await prisma.field.findMany({
    select: {
      id: true,
      name: true,
      level: true,
      domains: { select: { id: true, name: true, level: true, totalPoints: true, ideas: { where: { isArchived: false }, select: { level: true } } } },
    },
  });
  const ops = [];
  let domainChanges = 0;
  for (const f of fields) {
    const levels: number[] = [];
    for (const d of f.domains) {
      const real = domainLevel(d.totalPoints, d.ideas.map((i) => i.level));
      levels.push(real);
      if (real !== d.level) {
        domainChanges += 1;
        ops.push(prisma.domain.update({ where: { id: d.id }, data: { level: real } }));
      }
    }
    const realField = fieldLevel(levels);
    const tag = realField !== f.level ? `${f.level} → ${realField}` : `${f.level} (unchanged)`;
    console.log(`Field ${f.name}: ${tag} · ${f.domains.length} Domains`);
    if (realField !== f.level) ops.push(prisma.field.update({ where: { id: f.id }, data: { level: realField } }));
  }
  console.log(`${domainChanges} Domain level(s) and ${ops.length - domainChanges} Field level(s) differ from the formula.`);
  if (!APPLY) {
    console.log("Dry run: nothing written. Pass --apply to write.");
    return;
  }
  await prisma.$transaction(ops);
  console.log(`Applied ${ops.length} update(s).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

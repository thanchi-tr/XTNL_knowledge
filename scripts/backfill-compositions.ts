/**
 * One-shot backfill: assigns a keyword-derived default attribute
 * composition (attributes.ts's `defaultCompositionFor`) to every Field that
 * currently has zero `FieldAttribute` rows — every Field created before
 * `createField`/`seed.ts` started populating this at creation time.
 * Without this, the whole attribute-score substrate the skill system reads
 * stays empty for those Fields.
 *
 * Run with: npm run db:backfill-compositions
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ATTRIBUTES, defaultCompositionFor } from "../src/lib/attributes";

async function main() {
  const fields = await prisma.field.findMany({
    select: { id: true, name: true, _count: { select: { attributes: true } } },
  });
  const bare = fields.filter((f) => f._count.attributes === 0);

  console.log(`Backfilling composition for ${bare.length} Field(s) with no attribute weights...`);

  for (const field of bare) {
    const composition = defaultCompositionFor(field.name);
    await prisma.fieldAttribute.createMany({
      data: ATTRIBUTES.map((attribute) => ({ fieldId: field.id, attribute, weight: composition[attribute] })),
    });
    console.log(`  ${field.name}`);
  }

  console.log("Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * One-shot backfill: runs automatic attribute assignment over everything
 * that already exists.
 *
 * Inference only fires at creation time, so without this every Domain and
 * Idea predating it stays unattributed — and since `loadFieldRows` now
 * blends Domain compositions into each Field's effective split, a database
 * where no Domain has one would silently keep scoring on Field names alone.
 *
 * Order matters: Fields first (they are the prior for Domains), then
 * Domains (the prior for Ideas), then Ideas folded back into their Domain.
 *
 * Idempotent. Re-running re-derives the same values from the same text —
 * except that Idea observations would be counted twice, so `--ideas` is
 * opt-in and resets each Domain's observation counter before folding.
 *
 * Run with: npm run db:backfill-attributes [-- --ideas]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ATTRIBUTES, emptyComposition, type Composition } from "../src/lib/attributes";
import { inferComposition, blendObservation, dominantOf } from "../src/lib/attribute-inference";
import { compositionRows } from "../src/lib/attribute-assignment";
import { embeddingTextFromStored } from "../src/lib/embedding-text";

const withIdeas = process.argv.includes("--ideas");

async function main() {
  const fields = await prisma.field.findMany({
    select: {
      id: true,
      name: true,
      attributes: { select: { attribute: true, weight: true } },
      domains: {
        select: {
          id: true,
          name: true,
          _count: { select: { attributes: true } },
          ideas: { select: { id: true, question: true, answer: true, questionType: true, title: true, tags: true } },
        },
      },
    },
  });

  let domainsWritten = 0;
  let ideasWritten = 0;

  for (const field of fields) {
    const fieldComp = emptyComposition();
    for (const a of field.attributes) fieldComp[a.attribute] = a.weight;

    // A Field with no stored split at all gets one from its own name.
    const fieldHasSplit = ATTRIBUTES.some((a) => fieldComp[a] > 0);
    let prior: Composition = fieldComp;
    if (!fieldHasSplit) {
      prior = inferComposition({ text: field.name }).composition;
      await prisma.$transaction(
        compositionRows(prior).map((r) =>
          prisma.fieldAttribute.upsert({
            where: { fieldId_attribute: { fieldId: field.id, attribute: r.attribute } },
            create: { fieldId: field.id, ...r },
            update: { weight: r.weight },
          })
        )
      );
    }

    for (const domain of field.domains) {
      let composition = inferComposition({ text: domain.name, prior }).composition;

      if (withIdeas) {
        // Fold every existing Idea in, oldest first, exactly as live
        // submission would have. The counter starts at zero so the pull
        // curve matches what a fresh Domain would have experienced.
        let observations = 0;
        for (const idea of domain.ideas) {
          const text = [
            idea.title ?? "",
            idea.tags.join(" "),
            embeddingTextFromStored(idea.questionType, idea.question, idea.answer),
          ].join(" ");

          const observed = inferComposition({ text, prior: composition, questionType: idea.questionType }).composition;
          composition = blendObservation(composition, observed, observations);
          observations += 1;

          const dominant = dominantOf(observed);
          await prisma.idea.update({ where: { id: idea.id }, data: { attribute: dominant } });
          ideasWritten += 1;
        }
        await prisma.domain.update({
          where: { id: domain.id },
          data: { attributeObservations: observations },
        });
      }

      await prisma.$transaction(
        compositionRows(composition).map((r) =>
          prisma.domainAttribute.upsert({
            where: { domainId_attribute: { domainId: domain.id, attribute: r.attribute } },
            create: { domainId: domain.id, ...r },
            update: { weight: r.weight },
          })
        )
      );
      domainsWritten += 1;
    }

    console.log(`  ${field.name}: ${field.domains.length} domains`);
  }

  console.log(`\nDone. ${domainsWritten} domains attributed${withIdeas ? `, ${ideasWritten} ideas labelled` : " (ideas skipped — pass --ideas)"}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * One-shot backfill: embeds every Idea whose `embedding` column is still
 * null (all Phase-1-seeded Ideas, plus anything created before
 * GEMINI_API_KEY was configured). Without this, DomainDiscoveryService has
 * nothing to compare new submissions against — every Field would route as
 * NOVELTY forever regardless of what already exists.
 *
 * Run with: npm run db:backfill-embeddings
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { embedText } from "../src/lib/gemini";
import { embeddingTextFromStored } from "../src/lib/embedding-text";
import { toVectorLiteral } from "../src/lib/vector";
import type { QuestionType } from "@prisma/client";

interface UnembeddedIdea {
  id: string;
  question: string;
  answer: string;
  questionType: QuestionType;
}

async function main() {
  const rows = await prisma.$queryRaw<UnembeddedIdea[]>`
    SELECT id, question, answer, "questionType"
    FROM "Idea"
    WHERE embedding IS NULL
    ORDER BY "createdAt"
  `;

  console.log(`Backfilling embeddings for ${rows.length} Idea(s)...`);

  let done = 0;
  for (const row of rows) {
    const contentText = embeddingTextFromStored(row.questionType, row.question, row.answer);
    const embedding = await embedText(contentText);
    const literal = toVectorLiteral(embedding);
    await prisma.$executeRaw`UPDATE "Idea" SET embedding = ${literal}::vector WHERE id = ${row.id}`;
    done += 1;
    if (done % 10 === 0 || done === rows.length) {
      console.log(`  ${done}/${rows.length}`);
    }
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

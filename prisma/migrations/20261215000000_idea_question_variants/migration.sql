-- idea_question_variants: additive. One new table only; no existing table is altered, no foreign keys.
-- IdeaVariant: other wordings of an idea's question (same answer); a review shows one of them, or the original, at
-- random. Hand-authored to match `prisma migrate diff` for the model in schema.prisma.
--
-- Target: the xtnl-idea Supabase project ONLY. Check the project ref first, then apply with
-- `npx prisma db execute --file prisma/migrations/20261215000000_idea_question_variants/migration.sql --schema prisma/schema.prisma`
-- and `npx prisma migrate resolve --applied 20261215000000_idea_question_variants`.
-- Deployed code tolerates the table being absent: reads fail soft (no variants) and the form says so on save.

-- CreateTable
CREATE TABLE "public"."IdeaVariant" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdeaVariant_ideaId_idx" ON "public"."IdeaVariant"("ideaId");

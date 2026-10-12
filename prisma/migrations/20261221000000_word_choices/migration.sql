-- word_choices (2026-10-13): word completion remembers the user's choices. Per word and the word before it, how often
-- a suggestion was picked and how often it was typed past. Additive only: one new table and its indexes.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
BEGIN;
CREATE TABLE "public"."WordChoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "picks" INTEGER NOT NULL DEFAULT 0,
    "passes" INTEGER NOT NULL DEFAULT 0,
    "lastPickAt" TIMESTAMP(3),
    "lastPassAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WordChoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WordChoice_userId_word_context_key" ON "public"."WordChoice"("userId", "word", "context");
CREATE INDEX "WordChoice_userId_idx" ON "public"."WordChoice"("userId");
COMMIT;

-- Hand-authored, per this project's convention (see the add_field_snapshot
-- migration header for why `prisma migrate dev` cannot run against this
-- database).
--
-- Automatic difficulty on Idea: 0-100, derived from what the card asks —
-- its format, how much must be produced, vocabulary density and required
-- precision. See src/lib/difficulty.ts.
--
-- Purely additive and non-blocking: a NOT NULL column with a constant
-- default is a catalogue-only change on Postgres 11+, so it does not rewrite
-- the table.
--
-- Defaults to 0 rather than to a guessed mid-scale value. 0 is outside the
-- range the scorer produces for any real card, so existing rows are
-- distinguishable as "never scored" instead of being silently indistinguishable
-- from genuinely trivial ones. `backfillDifficulty` in src/app/actions/difficulty.ts
-- fills them in from their stored question and answer.
ALTER TABLE "public"."Idea"
  ADD COLUMN "difficulty" INTEGER NOT NULL DEFAULT 0;

-- The library filters and sorts on this, and a partial index keeps the
-- unscored rows out of it.
CREATE INDEX "Idea_difficulty_idx"
  ON "public"."Idea" ("difficulty")
  WHERE "difficulty" > 0;

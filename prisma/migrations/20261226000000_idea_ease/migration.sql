-- idea_ease (2026-10-14): per-idea ease on the Ebbinghaus curve, and misses that count once a day so a wrong answer
-- can return at the end of the session. Idea.ease (1 = the ladder's baseline), Idea.cycleMissed (a miss in this due
-- cycle), Idea.lapseDay (the life day of the latest miss). Additive: three columns; existing ideas with a pending
-- miss (failedAttempts > 0) keep it as cycleMissed. Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
BEGIN;
ALTER TABLE "public"."Idea" ADD COLUMN "ease" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "public"."Idea" ADD COLUMN "cycleMissed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Idea" ADD COLUMN "lapseDay" DATE;
UPDATE "public"."Idea" SET "cycleMissed" = true WHERE "failedAttempts" > 0;
COMMIT;

-- idea_leveling (2026-10-13): levels are earned properly and their drops are told. Idea.cleanStreak counts clean
-- recalls in a row (from L8 up a level needs two); Domain/Field.droppedFrom + droppedAt record the last drop of a
-- level, so the Library and the bell can say "fell to L3". Additive only: four nullable columns and one with a default.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
BEGIN;
ALTER TABLE "public"."Idea" ADD COLUMN "cleanStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."Domain" ADD COLUMN "droppedFrom" INTEGER;
ALTER TABLE "public"."Domain" ADD COLUMN "droppedAt" TIMESTAMP(3);
ALTER TABLE "public"."Field" ADD COLUMN "droppedFrom" DOUBLE PRECISION;
ALTER TABLE "public"."Field" ADD COLUMN "droppedAt" TIMESTAMP(3);
COMMIT;

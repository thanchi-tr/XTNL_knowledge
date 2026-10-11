-- level_defaults_zero: an empty Domain or Field is level 0, not 1 (2026-10-11).
-- The old defaults (Domain.level 1, Field.level 1.0) counted every new, empty Domain as a full level in
-- its Field, so a topic plan that created 30 empty Domains read as Field level 30 and character ~15.
-- Defaults only: no row is rewritten here (scripts/backfill-levels.ts recomputes stored levels).
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
ALTER TABLE "public"."Domain" ALTER COLUMN "level" SET DEFAULT 0;
ALTER TABLE "public"."Field" ALTER COLUMN "level" SET DEFAULT 0;

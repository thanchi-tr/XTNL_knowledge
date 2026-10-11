-- momentum (2026-10-12, docs/life-plan/momentum.md §D.4): two nullable preference columns on UserPrefs.
-- nudge: 'on' | 'off', null = on (the evening momentum push). flameSkin: a cosmetic id, null = the default flame.
-- Additive only: no default, no backfill, no row rewritten. Target: the xtnl-idea Supabase project ONLY.
BEGIN;
ALTER TABLE "public"."UserPrefs" ADD COLUMN "nudge" TEXT;
ALTER TABLE "public"."UserPrefs" ADD COLUMN "flameSkin" TEXT;
COMMIT;

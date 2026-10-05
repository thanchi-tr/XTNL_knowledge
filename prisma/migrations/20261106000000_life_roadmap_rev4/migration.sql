-- life_roadmap_rev4: an aim's depth, its date mode, coverage overrides, the
-- area-suggestion switch and the exam date; a milestone's stage; an item's
-- catalog key; the stored aim-suggestions setting.
-- Additive: 8 columns on 4 tables, each nullable or with a default;
-- no foreign key. Target: the xtnl-idea Supabase project ONLY.
-- Rehearse locally first.
--
-- Hand-authored from docs/life-plan/roadmap-rev4.md (Migration) to match the
-- eight fields added to schema.prisma (Roadmap, RoadmapMilestone, RoadmapItem
-- and LifeSettings; no other model is edited). Written by lane 0, not applied.
-- The lead follows data-model.md PROCEDURE and roadmap-rev4.md Migration (the
-- diff decides only these four tables and eight columns; the pre-apply grep;
-- the rehearsal; the project-ref check), then runs `prisma db execute --file`
-- on this file, `prisma migrate resolve --applied
-- 20261106000000_life_roadmap_rev4` and `prisma generate`. Apply it before the
-- push that ships code reading these columns; until then those reads fall
-- back as for a missing table (a P2022 naming one of the eight).

ALTER TABLE "public"."Roadmap" ADD COLUMN "depth" INTEGER;
ALTER TABLE "public"."Roadmap" ADD COLUMN "dateMode" TEXT NOT NULL DEFAULT 'CHOSEN';
ALTER TABLE "public"."Roadmap" ADD COLUMN "coverage" JSONB;
ALTER TABLE "public"."Roadmap" ADD COLUMN "suggestAreas" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Roadmap" ADD COLUMN "examDay" DATE;
ALTER TABLE "public"."RoadmapMilestone" ADD COLUMN "stage" TEXT;
ALTER TABLE "public"."RoadmapItem" ADD COLUMN "catalogKey" TEXT;
ALTER TABLE "public"."LifeSettings" ADD COLUMN "aimSuggestions" BOOLEAN;

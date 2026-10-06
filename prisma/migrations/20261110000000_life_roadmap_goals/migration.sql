-- life_roadmap_goals: revision 5 (docs/life-plan/roadmap-topic-map.md, F-R5-15): up to 3 open goals.
-- Additive: five nullable columns on Roadmap, the slot backfill on open rows, one CHECK and two
-- partial unique indexes; no foreign key; no column dropped, renamed or retyped.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
--
-- Hand-authored from docs/life-plan/data-model.md (ROADMAP MIGRATION A; contracts §23.1; lane 2).
-- Prisma 6 cannot declare the partial unique indexes or the CHECK; schema.prisma names them in a
-- /// comment on Roadmap, and PROCEDURE step 3 deletes any DROP of them that `migrate diff` proposes.
--
-- PRE-APPLY (abort if it returns a row): no user may hold more than one open roadmap.
--   SELECT "userId", count(*) FROM "public"."Roadmap" WHERE "status" IN ('DRAFT','ACTIVE') GROUP BY "userId" HAVING count(*) > 1;
BEGIN;
ALTER TABLE "public"."Roadmap" ADD COLUMN "slot" INTEGER;
ALTER TABLE "public"."Roadmap" ADD COLUMN "label" TEXT;
ALTER TABLE "public"."Roadmap" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "public"."Roadmap" ADD COLUMN "pauseReason" TEXT;
ALTER TABLE "public"."Roadmap" ADD COLUMN "createKey" TEXT;
UPDATE "public"."Roadmap" SET "slot" = 1 WHERE "status" IN ('DRAFT','ACTIVE');
ALTER TABLE "public"."Roadmap" ADD CONSTRAINT "Roadmap_slot_range" CHECK ("slot" IS NULL OR "slot" BETWEEN 1 AND 3);
CREATE UNIQUE INDEX "Roadmap_userId_slot_open_key" ON "public"."Roadmap"("userId", "slot") WHERE "status" IN ('DRAFT','ACTIVE');
CREATE UNIQUE INDEX "Roadmap_userId_createKey_key" ON "public"."Roadmap"("userId", "createKey") WHERE "createKey" IS NOT NULL;
COMMIT;

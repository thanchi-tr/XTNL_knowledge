-- proof_qty (2026-10-24, docs/life-plan/blueprint-plan-2026-10-22.md P24; blueprint 2.7, decision D21): pages proof.
-- A reading task ('read 30 pages', '30pg'; never '30p', which stays 30 minutes) is TaskTemplate.autoMetric 'PAGES' with
-- its day's target in autoTarget: autoMetric is TEXT with no CHECK, so the new value needs no SQL. Its tick records the
-- pages it read on two new nullable columns of TaskInstance:
--   proofKind   'PAGES': what proofQty counts (src/lib/proof.ts PROOF_QTY_KINDS). Null on every other instance.
--   proofQty    the pages the tick reported, whole, 1 to 2000 (proof.ts PAGES_QTY_MAX). Null with none.
-- Both are set together or not at all. They are a record, never a price: the tick pays exactly what it paid before
-- (its 'life-3' receipt carries the same pages as proof.pages), and nothing in the economy reads them to pay.
-- Only a pages task's tick writes them (tasks.ts settleOnce), and only while PROOF_LAUNCH_DAY is in force (null in code):
-- until the user's go nothing writes or reads either column.
-- Additive only: two nullable columns with no default (no table rewrite) and their CHECKs; no column is dropped,
-- renamed or retyped, and nothing is backfilled. No timestamp column is added.
-- Apply this BEFORE PROOF_LAUNCH_DAY is set (it waits on 20270101000000_task_proof): from that day a pages task's tick
-- writes these columns.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first.
-- Prisma 6 cannot declare the CHECKs (TaskInstance_proofKind_check, TaskInstance_proofQty_check,
-- TaskInstance_proof_pair_check); schema.prisma names them on the model, and a future `migrate diff` proposal to drop
-- them must be deleted, never applied.
BEGIN;
ALTER TABLE "public"."TaskInstance" ADD COLUMN "proofKind" TEXT;
ALTER TABLE "public"."TaskInstance" ADD COLUMN "proofQty" DOUBLE PRECISION;
-- The kinds this build knows: PAGES (P24). Null is no proof quantity.
ALTER TABLE "public"."TaskInstance" ADD CONSTRAINT "TaskInstance_proofKind_check" CHECK ("proofKind" IS NULL OR "proofKind" IN ('PAGES'));
-- A tick never records more than 2000 pages, and never 0 or fewer.
ALTER TABLE "public"."TaskInstance" ADD CONSTRAINT "TaskInstance_proofQty_check" CHECK ("proofQty" IS NULL OR ("proofQty" > 0 AND "proofQty" <= 2000));
-- A quantity always says what it counts, and a kind always has its quantity.
ALTER TABLE "public"."TaskInstance" ADD CONSTRAINT "TaskInstance_proof_pair_check" CHECK (("proofKind" IS NULL) = ("proofQty" IS NULL));
COMMIT;

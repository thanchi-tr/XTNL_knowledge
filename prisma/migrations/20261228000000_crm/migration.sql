-- crm (2026-10-20): Phase 2 of the Office workspace's customer list. Additive only:
--   Customer       status (LEAD | PROSPECT | CUSTOMER | INACTIVE; every existing customer reads CUSTOMER), tags (the
--                  user's own, lowercase; none to start), email, company, address
--   ScheduledTask  collectionId: the task collection it belongs to (nullable; SET NULL)
--   WorkBoard      followUpDays: the follow-up alert (default 30; null is off)
--   CustomerCheck  a customer's Check log: Rate, Home, Work and the day it was recorded (Record at)
--   TaskCollection a customer's task collections (optionally for one of their orders)
--   Deal           the tab's deals pipeline (New · Quoted · Won · Lost; AUD cents; the order a Won deal became)
-- Every new timestamp is timestamptz (as ScheduledTask's); Record at and a deal's expected close are calendar days.
-- No column is dropped, renamed or retyped, no row is rewritten, and nothing is backfilled beyond the defaults.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
-- Prisma 6 cannot declare the CHECKs (Customer_status_check, WorkBoard_followUpDays_check, CustomerCheck_some_check,
-- Deal_stage_check, Deal_valueCents_check); schema.prisma names them on their models, and a future `migrate diff`
-- proposal to drop them must be deleted, never applied.
BEGIN;
ALTER TABLE "public"."Customer" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "public"."Customer" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "public"."Customer" ADD COLUMN "email" TEXT;
ALTER TABLE "public"."Customer" ADD COLUMN "company" TEXT;
ALTER TABLE "public"."Customer" ADD COLUMN "address" TEXT;
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_status_check" CHECK ("status" IN ('LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE'));

ALTER TABLE "public"."WorkBoard" ADD COLUMN "followUpDays" INTEGER DEFAULT 30;
ALTER TABLE "public"."WorkBoard" ADD CONSTRAINT "WorkBoard_followUpDays_check" CHECK ("followUpDays" IS NULL OR ("followUpDays" >= 1 AND "followUpDays" <= 365));

CREATE TABLE "public"."CustomerCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rate" TEXT,
    "home" TEXT,
    "work" TEXT,
    "recordedAt" DATE NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CustomerCheck_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."CustomerCheck" ADD CONSTRAINT "CustomerCheck_some_check" CHECK ("rate" IS NOT NULL OR "home" IS NOT NULL OR "work" IS NOT NULL);
CREATE INDEX "CustomerCheck_customerId_recordedAt_idx" ON "public"."CustomerCheck"("customerId", "recordedAt");

CREATE TABLE "public"."TaskCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TaskCollection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskCollection_customerId_closedAt_idx" ON "public"."TaskCollection"("customerId", "closedAt");
CREATE INDEX "TaskCollection_boardId_closedAt_idx" ON "public"."TaskCollection"("boardId", "closedAt");
CREATE INDEX "TaskCollection_orderId_idx" ON "public"."TaskCollection"("orderId");

ALTER TABLE "public"."ScheduledTask" ADD COLUMN "collectionId" TEXT;
CREATE INDEX "ScheduledTask_collectionId_idx" ON "public"."ScheduledTask"("collectionId");

CREATE TABLE "public"."Deal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "customerId" TEXT,
    "title" TEXT NOT NULL,
    "valueCents" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "expectedCloseDay" DATE,
    "note" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "orderId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_stage_check" CHECK ("stage" IN ('NEW', 'QUOTED', 'WON', 'LOST'));
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_valueCents_check" CHECK ("valueCents" >= 0);
CREATE INDEX "Deal_boardId_stage_sortOrder_idx" ON "public"."Deal"("boardId", "stage", "sortOrder");
CREATE INDEX "Deal_customerId_idx" ON "public"."Deal"("customerId");
CREATE INDEX "Deal_orderId_idx" ON "public"."Deal"("orderId");

-- Keys: a tab's rows RESTRICT (a tab is archived, never deleted); a customer's own checks and collections RESTRICT (a
-- customer is archived, never deleted); a task's collection, a deal's customer and every order link SET NULL.
ALTER TABLE "public"."CustomerCheck" ADD CONSTRAINT "CustomerCheck_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."TaskCollection" ADD CONSTRAINT "TaskCollection_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."TaskCollection" ADD CONSTRAINT "TaskCollection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."TaskCollection" ADD CONSTRAINT "TaskCollection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."ScheduledTask" ADD CONSTRAINT "ScheduledTask_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "public"."TaskCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

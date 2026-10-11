-- customers (2026-10-12): a CRM inside a work tab. A customer (own ID number, name, nickname, phone), an interaction log
-- (date, PURCHASE | INQUIRY | COMPLAINT | CREDIT_CHECK, brief) and scheduled tasks with a one-time push reminder.
-- Additive only: three new tables, WorkBoard.crmOn (default false) and a nullable CallBack.customerId, their indexes and
-- foreign keys, one partial unique index. No row is rewritten; no column is dropped or retyped.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
-- Prisma 6 cannot declare the partial unique index; schema.prisma names it on Customer, and a future `migrate diff`
-- proposal to drop it must be deleted, never applied.
BEGIN;
ALTER TABLE "public"."WorkBoard" ADD COLUMN "crmOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."CallBack" ADD COLUMN "customerId" TEXT;

CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "phone" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_boardId_number_open_key" ON "public"."Customer"("boardId", lower("number")) WHERE "archivedAt" IS NULL;

CREATE TABLE "public"."CustomerInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "brief" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerInteraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."CustomerTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "remind" BOOLEAN NOT NULL DEFAULT true,
    "doneAt" TIMESTAMP(3),
    "remindSentAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Customer_userId_boardId_idx" ON "public"."Customer"("userId", "boardId");
CREATE INDEX "CustomerInteraction_customerId_at_idx" ON "public"."CustomerInteraction"("customerId", "at");
CREATE INDEX "CustomerTask_customerId_dueAt_idx" ON "public"."CustomerTask"("customerId", "dueAt");
CREATE INDEX "CustomerTask_dueAt_idx" ON "public"."CustomerTask"("dueAt");

ALTER TABLE "public"."CallBack" ADD CONSTRAINT "CallBack_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CustomerInteraction" ADD CONSTRAINT "CustomerInteraction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CustomerTask" ADD CONSTRAINT "CustomerTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;

-- work_orders (2026-10-14): an order list on a work tab. Each line: name, contact, item, ordered (and when), a date,
-- and an optional link to a CRM customer of the same tab. WorkBoard.ordersOn switches the list on (off by default).
-- Additive only: one column with a default, one new table, its index and foreign keys.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
BEGIN;
ALTER TABLE "public"."WorkBoard" ADD COLUMN "ordersOn" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "public"."WorkOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "item" TEXT NOT NULL,
    "ordered" BOOLEAN NOT NULL DEFAULT false,
    "orderedAt" TIMESTAMP(3),
    "date" DATE,
    "customerId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkOrder_userId_boardId_idx" ON "public"."WorkOrder"("userId", "boardId");
ALTER TABLE "public"."WorkOrder" ADD CONSTRAINT "WorkOrder_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."WorkOrder" ADD CONSTRAINT "WorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

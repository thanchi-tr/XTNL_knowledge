-- customer_info (2026-10-14): a customer's info notes. Each: a detail text and when it was recorded (default now,
-- editable); archivedAt hides one. Additive only: one new table, its index and foreign key.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
BEGIN;
CREATE TABLE "public"."CustomerInfo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerInfo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerInfo_customerId_recordedAt_idx" ON "public"."CustomerInfo"("customerId", "recordedAt");
ALTER TABLE "public"."CustomerInfo" ADD CONSTRAINT "CustomerInfo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;

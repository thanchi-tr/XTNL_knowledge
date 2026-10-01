-- body_weight: additive. Two new tables only; no existing table is altered.
-- Hand-authored to match `prisma migrate diff` output for BodyWeight and
-- WeightGoal in schema.prisma. No foreign keys, like ActivityEvent.
--
-- Target: the xtnl-idea Supabase project ONLY (never XTNL_thesis). Check the
-- project ref first, rehearse on the local mirror, then apply with
-- `prisma db execute --file prisma/migrations/20261015000000_body_weight/migration.sql`
-- and `prisma migrate resolve --applied 20261015000000_body_weight`.
-- Deployed code tolerates the tables being absent: src/lib/weight-server.ts
-- reads fail soft (the card shows nothing logged) and writes say so.

-- CreateTable
CREATE TABLE "BodyWeight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kg" DECIMAL(6,2) NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "targetKg" DECIMAL(6,2),
    "targetDay" DATE,
    "startKg" DECIMAL(6,2),
    "startDay" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyWeight_userId_day_idx" ON "BodyWeight"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "BodyWeight_userId_day_key" ON "BodyWeight"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "WeightGoal_userId_key" ON "WeightGoal"("userId");

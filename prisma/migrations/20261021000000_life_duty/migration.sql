-- life_duty (M2): declared rest, sick and vacation days. Additive: one new
-- table, no existing table is altered, no foreign key (like ActivityEvent).
-- Hand-authored to match `prisma migrate diff` output for model RestDay in
-- schema.prisma. TaskInstance.status gains MADE_UP as a TEXT value only (no
-- SQL). Standing rest weekdays are deferred (m2-refit.md decision 14), so
-- LifeSettings is untouched.
--
-- Target: the xtnl-idea Supabase project ONLY (never XTNL_thesis). Check the
-- project ref first, rehearse on the local mirror, then apply with
-- `prisma db execute --file prisma/migrations/20261021000000_life_duty/migration.sql`
-- and `prisma migrate resolve --applied 20261021000000_life_duty`.
-- The code that reads RestDay deploys after this is applied.

-- CreateTable
CREATE TABLE "public"."RestDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "RestDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestDay_userId_day_key" ON "public"."RestDay"("userId", "day");

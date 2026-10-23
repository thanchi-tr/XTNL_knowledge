-- mall (2026-10-24, docs/life-plan/blueprint-plan-2026-10-22.md P18; blueprint 4.3, decision D30): the Mall's
-- catalog. One new table, MallReward: a reward the user lists, with a price in credits. Only what the user lists is
-- priced: there are no starter rewards (nothing is inserted here), and #play, rest days and sleep are never priced
-- (mall.ts cleanRewardInput refuses them; the app can't block leisure, so the Mall is a commitment device that runs
-- on honour).
--   title          1-60 characters; one live reward a title (in any case), so two racing adds cannot both write it
--   category       TREAT | SCREEN | OUTING | PURCHASE | OTHER (mall.ts MALL_CATEGORIES)
--   price          whole credits, 1 to 100,000 (mall.ts validatePrice: 0 and 100001 are refused, here and there)
--   note           an optional line, at most 200 characters
--   cooldownDays   an optional "at most once every n days", 1 to 365 (P19's buy reads it; nothing reads it before)
--   archivedAt     set by an archive; the row stays. A reward is never deleted.
-- A record of what the user will pay, never a payment: no row here pays or costs XP, MP, a Domain point, capital or a
-- credit. Credits are derived (credits.ts, P16) and nothing reads this table to count them; the buy (P19) records a
-- sink-NONE ActivityEvent with its own receipt, so editing a price later never reprices a purchase.
-- Plain TEXT ids with no foreign key (as the avatar's and the skills'). Every timestamp is timestamptz.
-- Additive only: no existing table is altered, no column is dropped, renamed or retyped, and nothing is backfilled.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first.
-- Prisma 6 cannot declare the CHECKs (MallReward_title_check, MallReward_category_check, MallReward_price_check,
-- MallReward_note_check, MallReward_cooldown_check) or the partial unique index (MallReward_userId_title_live_key);
-- schema.prisma names them on the model, and a future `migrate diff` proposal to drop them must be deleted, never
-- applied.
BEGIN;
CREATE TABLE "public"."MallReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "note" TEXT,
    "cooldownDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "MallReward_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."MallReward" ADD CONSTRAINT "MallReward_title_check" CHECK (char_length("title") BETWEEN 1 AND 60);
ALTER TABLE "public"."MallReward" ADD CONSTRAINT "MallReward_category_check" CHECK ("category" IN ('TREAT', 'SCREEN', 'OUTING', 'PURCHASE', 'OTHER'));
-- Whole credits, never free and never past 100,000: 0 and 100001 are refused.
ALTER TABLE "public"."MallReward" ADD CONSTRAINT "MallReward_price_check" CHECK ("price" BETWEEN 1 AND 100000);
ALTER TABLE "public"."MallReward" ADD CONSTRAINT "MallReward_note_check" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 200);
ALTER TABLE "public"."MallReward" ADD CONSTRAINT "MallReward_cooldown_check" CHECK ("cooldownDays" IS NULL OR "cooldownDays" BETWEEN 1 AND 365);
-- The Mall page's read (a user's live rewards, then the archived ones).
CREATE INDEX "MallReward_userId_archivedAt_idx" ON "public"."MallReward"("userId", "archivedAt");
-- One live reward a title (in any case): a resend of one add on another server instance cannot write it twice.
CREATE UNIQUE INDEX "MallReward_userId_title_live_key" ON "public"."MallReward"("userId", lower("title")) WHERE "archivedAt" IS NULL;
COMMIT;

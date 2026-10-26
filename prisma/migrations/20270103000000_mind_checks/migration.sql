-- mind_checks (2026-10-27, docs/life-plan/health-2026-10-27.md D1, D5, D8; health-brief-2026-10-27.md §2.2): the
-- 5-second check-in. Two new tables:
--   MoodCheck      one check-in: one tap on the 9×9 grid, then an optional stress rating, word and tags
--     day          the life day it was felt on (src/lib/life-day.ts dateColumn of `at`)
--     at           the instant it was felt (a queued phone send keeps its own instant)
--     valence      pleasantness, −4..+4 (src/lib/mind.ts GRID_MIN..GRID_MAX)
--     energy       −4..+4
--     stress       "How stressed are you right now?" 0..4 (Not at all .. Very much); null when skipped
--     word         an optional feeling word, at most 24 characters (mind.ts WORD_MAX)
--     tags         up to 8 context tags (mind.ts TAGS_MAX); '{}' when none
--     trigger      prompted | self | close (self-initiated entries skew, so the view says how many were prompted)
--     via          web | today | check | widget | tile | notify | capture | close: the surface it came from
--     promptedAt   when the prompt it answered was shown; null when it was not prompted
--     tookMs       time from opening the sheet to saving it, 0..600000 ms (the 5-second claim is measured); null
--     clientId     the save's key: a resend of one check-in (a retried request, the phone's queue) answers the row
--                  it wrote, once
--   MindPrefs      one row a user: a pause (pausedUntil, the life day check-ins resume) and the day the low-pattern
--                  card was last hidden (lowSeenAt; once hidden, it stays hidden 7 days)
-- A record, never a reward: no row pays or costs XP, MP, a streak day, a quest, a side-quest input, a Mall credit or
-- a calibration input, and nothing in the economy reads either table. No check-in is an ActivityEvent, so the 'life'
-- reset never deletes one (as it never deletes a weigh-in) and each one can be deleted on its own.
-- Plain TEXT ids with no foreign key. Every timestamp is timestamptz.
-- Additive only: two new tables and their indexes; no existing table is altered, no column is dropped, renamed or
-- retyped, and nothing is backfilled.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first,
-- run `migrate status`, parse the ref out of DIRECT_URL, then apply with
-- `npx prisma db execute --file prisma/migrations/20270103000000_mind_checks/migration.sql --schema prisma/schema.prisma`
-- and `npx prisma migrate resolve --applied 20270103000000_mind_checks`, then `npx prisma generate`.
-- Deployed code tolerates the tables being absent: reads fail soft (src/lib/mind-server.ts isMissingMindTable: the
-- view reads ready: false and nothing logged) and writes say so in one plain line. A check-in, a pause and a hide also
-- wait for MIND_LAUNCH_DAY (src/lib/mind.ts, null in code). The two deletes never wait (the user can always remove what
-- was recorded), but they only delete and clear, never insert, so applying this changes nothing until the switch flips.
-- Prisma 6 cannot declare the CHECKs (MoodCheck_valence_check, MoodCheck_energy_check, MoodCheck_stress_check,
-- MoodCheck_word_check, MoodCheck_tags_check, MoodCheck_trigger_check, MoodCheck_via_check, MoodCheck_tookMs_check,
-- MoodCheck_clientId_check) or "tags" NOT NULL (Prisma 6 declares a list column nullable); schema.prisma names them on
-- the model, and a future `migrate diff` proposal to drop them must be deleted, never applied.
BEGIN;
CREATE TABLE "public"."MoodCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "valence" SMALLINT NOT NULL,
    "energy" SMALLINT NOT NULL,
    "stress" SMALLINT,
    "word" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "trigger" TEXT NOT NULL DEFAULT 'self',
    "via" TEXT NOT NULL DEFAULT 'web',
    "promptedAt" TIMESTAMPTZ(3),
    "tookMs" INTEGER,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MoodCheck_pkey" PRIMARY KEY ("id")
);
-- One tap on the 9×9 grid: each axis is a whole step from −4 to +4.
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_valence_check" CHECK ("valence" BETWEEN -4 AND 4);
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_energy_check" CHECK ("energy" BETWEEN -4 AND 4);
-- Five labelled levels, Not at all (0) to Very much (4); null when skipped.
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_stress_check" CHECK ("stress" IS NULL OR "stress" BETWEEN 0 AND 4);
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_word_check" CHECK ("word" IS NULL OR char_length("word") BETWEEN 1 AND 24);
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_tags_check" CHECK (cardinality("tags") <= 8);
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_trigger_check" CHECK ("trigger" IN ('prompted', 'self', 'close'));
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_via_check" CHECK ("via" IN ('web', 'today', 'check', 'widget', 'tile', 'notify', 'capture', 'close'));
-- Ten minutes at most: a sheet left open longer is not a measurement of the tap.
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_tookMs_check" CHECK ("tookMs" IS NULL OR "tookMs" BETWEEN 0 AND 600000);
ALTER TABLE "public"."MoodCheck" ADD CONSTRAINT "MoodCheck_clientId_check" CHECK (char_length("clientId") BETWEEN 1 AND 64);
-- A resend of one check-in (a retried request, the phone's queue, a second instance) finds the row it wrote.
CREATE UNIQUE INDEX "MoodCheck_userId_clientId_key" ON "public"."MoodCheck"("userId", "clientId");
-- The Mind view's read (a user's check-ins over a span of life days).
CREATE INDEX "MoodCheck_userId_day_idx" ON "public"."MoodCheck"("userId", "day");
-- The latest check-in's read (the last instant, today's count).
CREATE INDEX "MoodCheck_userId_at_idx" ON "public"."MoodCheck"("userId", "at");
CREATE TABLE "public"."MindPrefs" (
    "userId" TEXT NOT NULL,
    "pausedUntil" DATE,
    "lowSeenAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "MindPrefs_pkey" PRIMARY KEY ("userId")
);
COMMIT;

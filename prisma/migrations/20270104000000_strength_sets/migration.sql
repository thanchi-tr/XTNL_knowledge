-- strength_sets (2026-10-27, docs/life-plan/health-2026-10-27.md D10-D18; health-brief-2026-10-27.md §3.2): exercise
-- variety and the lift logger. Ten new nullable columns on ExerciseSession and three new tables:
--   ExerciseSession  stays the one header for every kind (src/lib/exercise.ts EXERCISE_KINDS: WALK, RUN, CYCLE, SWIM,
--                    ROW, ELLIPTICAL, HIIT, CIRCUIT, SPORT, YOGA, MOBILITY, LIFT). No CHECK is put on the existing
--                    "kind" column (the core enforces EXERCISE_KINDS), and "distanceKm" stays NOT NULL: 0 is "no
--                    distance" for a kind that has none (D11), so a rolled-back build reads "0 km" and never crashes.
--     variant        the kind's variant (exercise.ts KIND_SPECS): a run's TREADMILL, a ride's SPIN, a swim's stroke,
--                    the SPORT played, the YOGA style; null when none
--     label          the user's name for it, 1..40 characters ("Push day"; the sport of a SPORT OTHER)
--     startedAt      a live session's wall clock (a LIFT logged set by set): when it started
--     endedAt        when it ended; null while it is open. One open session a user (the partial unique below)
--     avgHr, maxHr   beats a minute, 30..250, as a watch or the user gives them; maxHr at or above avgHr
--     avgWatts       1..2000 W (a power meter, a stationary bike, an erg)
--     poolM          a swim's pool length, 10..100 m (lengths × poolM is the distance); null for open water
--     sessionRpe     "How hard was it?" 0..10 (CR10, Foster 2001): a record only, never priced (dropped.md:8)
--     clientId       a save's key: a resend of one session (a retried request, the phone's queue) answers the row it
--                    wrote, once; null on a session typed on the web before this
--   UserMovement     a movement the user adds (the starter library lives in code, src/lib/training-library.ts
--                    STARTER_MOVEMENTS, never seeded): name, its normal form (one live movement per name), the
--                    pattern, the equipment, primary and secondary muscles (the free-exercise-db vocabulary), the load
--                    kind (EXT | PAIR | ONE | BW | TIME | CARRY), a body fraction for BW, unilateral, its weight step
--                    and its rest. Archived, never deleted: a set logged with it keeps its key.
--   ExerciseEntry    one movement in a LIFT session, in order (so "Repeat Push day" and the phone's "Next: Bench"
--                    exist before any set): the movement key (a library key, or 'u:' and a UserMovement id), the
--                    superset group, and the body weight it was logged against (a snapshot, for BW loads)
--   ExerciseSet      one "Set done": its order in the entry, the set kind (WARMUP | WORKING | DROP | MINI), the head
--                    set a DROP or MINI continues (chainOf), the load in kg (EXT the total, PAIR and ONE one implement,
--                    BW the signed added load: −20 is 20 kg of assistance), reps, RIR (0..5, 5 is "4+"), the failure
--                    and AMRAP flags, a hold's seconds, a carry's metres, the rest the timer gave it, when it was
--                    done, and its clientId (each set is one idempotent insert, so the phone's queue replays safely).
--                    The movement key and the session's life day are copied onto it for the history reads.
-- A record, never a reward (D12, D13): no row pays or costs XP, MP, a streak day, a quest, a kept week, a skill hour,
-- a side-quest input, a Mall credit or a calibration input, and nothing in the economy reads the three new tables or
-- the new columns. A walk pays exactly as before (its 'walk-1' receipt is untouched); every other kind is a record
-- until SESSION_PAY_LAUNCH_DAY (exercise.ts, null in code). The one effect a record may have is "Counts as": the
-- user's own linked EXERCISE habit is ticked as a manual tick would be, at the habit's own price.
-- Kilograms are stored and the unit is display only (WeightGoal.unit); distances are stored in km (sets: metres).
-- Plain TEXT ids with no foreign key: a session's delete removes its entries and sets in the same transaction.
-- Every new timestamp is timestamptz; the life days are DATE.
-- Additive only: ten nullable columns with no default (no table rewrite), their named CHECKs (every existing row
-- holds NULL in each, so each passes), two unique indexes on ExerciseSession, and three new tables with their
-- indexes. No existing column is altered, dropped, renamed or retyped, and nothing is backfilled.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first,
-- run `migrate status`, parse the ref out of DIRECT_URL, then apply with
-- `npx prisma db execute --file prisma/migrations/20270104000000_strength_sets/migration.sql --schema prisma/schema.prisma`
-- and `npx prisma migrate resolve --applied 20270104000000_strength_sets`, then `npx prisma generate`.
-- Deployed code tolerates its absence: every ExerciseSession read and write selects its columns by name (the walk
-- card never asks for a new one), a reader of the new columns falls back to the walk-only view on P2022/42703, and
-- the new tables' reads fail soft on P2021/42P01 (nothing logged) while their writes say so in one plain line.
-- Prisma 6 cannot declare the CHECKs (ExerciseSession_variant_check, ExerciseSession_label_check,
-- ExerciseSession_ended_check, ExerciseSession_avgHr_check, ExerciseSession_maxHr_check, ExerciseSession_hr_check,
-- ExerciseSession_avgWatts_check, ExerciseSession_poolM_check, ExerciseSession_sessionRpe_check,
-- ExerciseSession_clientId_check; UserMovement_name_check, UserMovement_normName_check, UserMovement_pattern_check,
-- UserMovement_equipment_check, UserMovement_primary_check, UserMovement_secondary_check, UserMovement_load_check,
-- UserMovement_bodyFraction_check, UserMovement_stepKg_check, UserMovement_restSec_check; ExerciseEntry_movementKey_check,
-- ExerciseEntry_ord_check, ExerciseEntry_groupNo_check, ExerciseEntry_bodyKg_check, ExerciseEntry_note_check;
-- ExerciseSet_movementKey_check, ExerciseSet_ord_check, ExerciseSet_kind_check, ExerciseSet_chainOf_check,
-- ExerciseSet_chain_check, ExerciseSet_weightKg_check, ExerciseSet_reps_check, ExerciseSet_rir_check,
-- ExerciseSet_flags_check, ExerciseSet_durationSec_check, ExerciseSet_distanceM_check, ExerciseSet_restSec_check,
-- ExerciseSet_measure_check, ExerciseSet_clientId_check), the list columns' NOT NULL (Prisma 6 declares a list column
-- nullable), or the partial unique indexes (ExerciseSession_userId_open_key, UserMovement_userId_normName_live_key);
-- schema.prisma names them on the models, and a future `migrate diff` proposal to drop them must be deleted, never
-- applied.
BEGIN;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "variant" TEXT;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "label" TEXT;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "startedAt" TIMESTAMPTZ(3);
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "endedAt" TIMESTAMPTZ(3);
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "avgHr" SMALLINT;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "maxHr" SMALLINT;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "avgWatts" SMALLINT;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "poolM" REAL;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "sessionRpe" SMALLINT;
ALTER TABLE "public"."ExerciseSession" ADD COLUMN "clientId" TEXT;
-- An upper-case key (exercise.ts KIND_SPECS holds which variants each kind takes).
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_variant_check" CHECK ("variant" IS NULL OR "variant" ~ '^[A-Z][A-Z_]{0,23}$');
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_label_check" CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 40);
-- A session ends at or after it started, and only a started one ends.
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_ended_check" CHECK ("endedAt" IS NULL OR ("startedAt" IS NOT NULL AND "endedAt" >= "startedAt"));
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_avgHr_check" CHECK ("avgHr" IS NULL OR "avgHr" BETWEEN 30 AND 250);
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_maxHr_check" CHECK ("maxHr" IS NULL OR "maxHr" BETWEEN 30 AND 250);
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_hr_check" CHECK ("avgHr" IS NULL OR "maxHr" IS NULL OR "maxHr" >= "avgHr");
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_avgWatts_check" CHECK ("avgWatts" IS NULL OR "avgWatts" BETWEEN 1 AND 2000);
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_poolM_check" CHECK ("poolM" IS NULL OR "poolM" BETWEEN 10 AND 100);
-- CR10: 0 (rest) to 10 (maximal). A record only.
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_sessionRpe_check" CHECK ("sessionRpe" IS NULL OR "sessionRpe" BETWEEN 0 AND 10);
ALTER TABLE "public"."ExerciseSession" ADD CONSTRAINT "ExerciseSession_clientId_check" CHECK ("clientId" IS NULL OR char_length("clientId") BETWEEN 1 AND 64);
-- A resend of one session (a retried request, the phone's queue, a second instance) finds the row it wrote. NULLs are
-- distinct, so every session typed without a key stays allowed.
CREATE UNIQUE INDEX "ExerciseSession_userId_clientId_key" ON "public"."ExerciseSession"("userId", "clientId");
-- One open session a user: two starts racing on two devices cannot both leave one open.
CREATE UNIQUE INDEX "ExerciseSession_userId_open_key" ON "public"."ExerciseSession"("userId") WHERE "startedAt" IS NOT NULL AND "endedAt" IS NULL;
CREATE TABLE "public"."UserMovement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normName" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "primaryMuscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "secondaryMuscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "load" TEXT NOT NULL DEFAULT 'EXT',
    "bodyFraction" REAL,
    "unilateral" BOOLEAN NOT NULL DEFAULT false,
    "stepKg" REAL,
    "restSec" INTEGER,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "UserMovement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_name_check" CHECK (char_length("name") BETWEEN 1 AND 40);
-- training-library.ts normNameOf: lower case, single spaces, letters, digits and spaces only.
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_normName_check" CHECK (char_length("normName") BETWEEN 1 AND 40);
-- training-library.ts PATTERNS, EQUIPMENT, MUSCLES and LOAD_KINDS.
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_pattern_check" CHECK ("pattern" IN ('SQUAT', 'HINGE', 'LUNGE', 'PUSH_H', 'PUSH_V', 'PULL_H', 'PULL_V', 'CARRY', 'CORE', 'ISOLATION'));
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_equipment_check" CHECK ("equipment" IN ('BARBELL', 'DUMBBELL', 'KETTLEBELL', 'MACHINE', 'CABLE', 'EZ_BAR', 'BODY', 'BAND', 'OTHER'));
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_primary_check" CHECK (cardinality("primaryMuscles") BETWEEN 1 AND 4 AND "primaryMuscles" <@ ARRAY['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps']::TEXT[]);
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_secondary_check" CHECK (cardinality("secondaryMuscles") <= 6 AND "secondaryMuscles" <@ ARRAY['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps']::TEXT[]);
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_load_check" CHECK ("load" IN ('EXT', 'PAIR', 'ONE', 'BW', 'TIME', 'CARRY'));
-- Only a bodyweight movement has a body fraction (1.0 a pull-up, 0.65 a push-up); null is reps only.
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_bodyFraction_check" CHECK ("bodyFraction" IS NULL OR ("load" = 'BW' AND "bodyFraction" BETWEEN 0.05 AND 1));
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_stepKg_check" CHECK ("stepKg" IS NULL OR "stepKg" BETWEEN 0.25 AND 25);
ALTER TABLE "public"."UserMovement" ADD CONSTRAINT "UserMovement_restSec_check" CHECK ("restSec" IS NULL OR "restSec" BETWEEN 0 AND 600);
-- The picker's read: a user's movements.
CREATE INDEX "UserMovement_userId_idx" ON "public"."UserMovement"("userId");
-- One live movement per name: an archived one frees its name.
CREATE UNIQUE INDEX "UserMovement_userId_normName_live_key" ON "public"."UserMovement"("userId", "normName") WHERE "archivedAt" IS NULL;
CREATE TABLE "public"."ExerciseEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "movementKey" TEXT NOT NULL,
    "ord" SMALLINT NOT NULL,
    "groupNo" SMALLINT,
    "bodyKg" DECIMAL(6,2),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ExerciseEntry_pkey" PRIMARY KEY ("id")
);
-- A library key (training-library.ts STARTER_MOVEMENTS) or 'u:' and a UserMovement id.
ALTER TABLE "public"."ExerciseEntry" ADD CONSTRAINT "ExerciseEntry_movementKey_check" CHECK ("movementKey" ~ '^([a-z][a-z0-9_]{0,47}|u:[A-Za-z0-9_-]{1,64})$');
ALTER TABLE "public"."ExerciseEntry" ADD CONSTRAINT "ExerciseEntry_ord_check" CHECK ("ord" BETWEEN 1 AND 50);
ALTER TABLE "public"."ExerciseEntry" ADD CONSTRAINT "ExerciseEntry_groupNo_check" CHECK ("groupNo" IS NULL OR "groupNo" BETWEEN 1 AND 50);
-- weight.ts MIN_KG..MAX_KG: the BodyWeight reading the entry was logged against.
ALTER TABLE "public"."ExerciseEntry" ADD CONSTRAINT "ExerciseEntry_bodyKg_check" CHECK ("bodyKg" IS NULL OR "bodyKg" BETWEEN 20 AND 400);
ALTER TABLE "public"."ExerciseEntry" ADD CONSTRAINT "ExerciseEntry_note_check" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 200);
-- A session's read (its movements in order) and its delete.
CREATE INDEX "ExerciseEntry_sessionId_idx" ON "public"."ExerciseEntry"("sessionId");
-- "Last time" for a movement: the user's entries of it.
CREATE INDEX "ExerciseEntry_userId_movementKey_idx" ON "public"."ExerciseEntry"("userId", "movementKey");
CREATE TABLE "public"."ExerciseSet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "movementKey" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "ord" SMALLINT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'WORKING',
    "chainOf" SMALLINT,
    "weightKg" DECIMAL(6,2),
    "reps" SMALLINT,
    "rir" SMALLINT,
    "toFailure" BOOLEAN NOT NULL DEFAULT false,
    "amrap" BOOLEAN NOT NULL DEFAULT false,
    "durationSec" INTEGER,
    "distanceM" REAL,
    "restSec" INTEGER,
    "doneAt" TIMESTAMPTZ(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ExerciseSet_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_movementKey_check" CHECK ("movementKey" ~ '^([a-z][a-z0-9_]{0,47}|u:[A-Za-z0-9_-]{1,64})$');
-- The set's place in its entry: set 1, 2, 3, …
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_ord_check" CHECK ("ord" BETWEEN 1 AND 100);
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_kind_check" CHECK ("kind" IN ('WARMUP', 'WORKING', 'DROP', 'MINI'));
-- A DROP or MINI names the head set it continues, earlier in the same entry.
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_chainOf_check" CHECK ("chainOf" IS NULL OR ("chainOf" >= 1 AND "chainOf" < "ord"));
-- chainOf is null exactly when the set is a WARMUP or a WORKING set.
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_chain_check" CHECK (("chainOf" IS NULL) = ("kind" IN ('WARMUP', 'WORKING')));
-- EXT the total, PAIR and ONE one implement, BW the signed added load (−200 is the most assistance).
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_weightKg_check" CHECK ("weightKg" IS NULL OR "weightKg" BETWEEN -200 AND 500);
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_reps_check" CHECK ("reps" IS NULL OR "reps" BETWEEN 1 AND 100);
-- Reps in reserve: 0..4, and 5 for "4+". Optional, a record only.
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_rir_check" CHECK ("rir" IS NULL OR "rir" BETWEEN 0 AND 5);
-- To failure means no reps in reserve, and never on a warm-up; AMRAP is a working set's target.
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_flags_check" CHECK ((NOT "toFailure" OR ("kind" <> 'WARMUP' AND ("rir" IS NULL OR "rir" = 0))) AND (NOT "amrap" OR "kind" = 'WORKING'));
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_durationSec_check" CHECK ("durationSec" IS NULL OR "durationSec" BETWEEN 1 AND 3600);
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_distanceM_check" CHECK ("distanceM" IS NULL OR ("distanceM" > 0 AND "distanceM" <= 10000));
-- The rest the timer gave it (never typed).
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_restSec_check" CHECK ("restSec" IS NULL OR "restSec" BETWEEN 0 AND 3600);
-- A set records something: reps, a hold's seconds or a carry's metres.
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_measure_check" CHECK ("reps" IS NOT NULL OR "durationSec" IS NOT NULL OR "distanceM" IS NOT NULL);
ALTER TABLE "public"."ExerciseSet" ADD CONSTRAINT "ExerciseSet_clientId_check" CHECK (char_length("clientId") BETWEEN 1 AND 64);
-- A resend of one "Set done" (a retried request, the phone's queue) finds the row it wrote.
CREATE UNIQUE INDEX "ExerciseSet_userId_clientId_key" ON "public"."ExerciseSet"("userId", "clientId");
-- An entry's sets in order.
CREATE INDEX "ExerciseSet_entryId_idx" ON "public"."ExerciseSet"("entryId");
-- A session's read and its delete.
CREATE INDEX "ExerciseSet_sessionId_idx" ON "public"."ExerciseSet"("sessionId");
-- A movement's history (heaviest, rep maxes, e1RM, last time) over a span of life days.
CREATE INDEX "ExerciseSet_userId_movementKey_day_idx" ON "public"."ExerciseSet"("userId", "movementKey", "day");
COMMIT;

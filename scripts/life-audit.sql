-- Life ledger audit. Read-only: every statement is a SELECT inside a
-- READ ONLY transaction that is rolled back, so it cannot change a row even
-- if pasted whole into the Supabase SQL editor.
--
-- The rule it checks: knowledge is never paid twice. A review or a new Idea
-- is credited to a Domain by srs.ts / ideas.ts and recorded in the ledger
-- with sink DOMAIN; life XP is only ever SUM(xp) WHERE sink = 'TRACK'. So no
-- TRACK row may describe the same thing (share a sourceId) as a REVIEW or
-- IDEA_CREATE row, and a study-linked task pays 0.
--
-- Every query below should return zero rows (or, for the last, two equal
-- numbers). Run by hand; no script calls this.
--
--   psql "$DIRECT_URL" -f scripts/life-audit.sql

BEGIN TRANSACTION READ ONLY;

-- 1. Double pay: a TRACK row about the same Idea as a review or Idea row.
SELECT t.id, t."userId", t.source, t."sourceId", t.xp, t.day
FROM "ActivityEvent" t
WHERE t.sink = 'TRACK'
  AND t."sourceId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "ActivityEvent" k
    WHERE k."userId" = t."userId"
      AND k."sourceId" = t."sourceId"
      AND k.source IN ('REVIEW', 'IDEA_CREATE')
  );

-- 2. Knowledge rows outside the DOMAIN sink, or DOMAIN rows that are not knowledge.
SELECT id, "userId", source, sink, xp, day
FROM "ActivityEvent"
WHERE (source IN ('REVIEW', 'IDEA_CREATE') AND sink <> 'DOMAIN')
   OR (sink = 'DOMAIN' AND source NOT IN ('REVIEW', 'IDEA_CREATE'));

-- 3. Study-linked tasks (paid by reviews) that paid life XP anyway.
SELECT e.id, e."userId", e."templateId", e.xp, e.sink, e.day
FROM "ActivityEvent" e
JOIN "TaskTemplate" t ON t.id = e."templateId"
WHERE e.source = 'TASK'
  AND t."autoMetric" IN ('REVIEWS', 'IDEAS', 'REVIEW_DUE')
  AND (e.sink = 'TRACK' OR e.xp <> 0);

-- 4. TRACK rows no level can count: no track, or a track outside the four.
SELECT id, "userId", source, track, xp, day
FROM "ActivityEvent"
WHERE sink = 'TRACK' AND (track IS NULL OR track NOT IN ('BODY', 'DUTY', 'CRAFT', 'CARE'));

-- 5. Rows that must never count toward the streak but do.
SELECT id, "userId", source, day
FROM "ActivityEvent"
WHERE "countsForStreak"
  AND source IN ('STEPS', 'DAY_OPEN', 'DEBT', 'ADJUST', 'FREEZE_EARN', 'FREEZE_USE', 'REFLECTION', 'UNDO');

-- 6. Non-finite amounts, which would poison every sum they join.
SELECT id, "userId", source, xp, "rawXp", qty
FROM "ActivityEvent"
WHERE xp = 'NaN'::float8 OR xp IN ('Infinity'::float8, '-Infinity'::float8)
   OR "rawXp" = 'NaN'::float8 OR "rawXp" IN ('Infinity'::float8, '-Infinity'::float8);

-- 7. Every passed review since the ledger went live wrote both its mastery
--    fraction and its REVIEW row in one transaction, so the two counts match.
--    (Backfilled 'bf:' rows are excluded; the window starts at the first live row.)
WITH live AS (
  SELECT "userId", MIN("occurredAt") AS since
  FROM "ActivityEvent"
  WHERE source = 'REVIEW' AND "dedupeKey" IS NULL
  GROUP BY "userId"
)
SELECT
  l."userId",
  (SELECT COUNT(*) FROM "ActivityEvent" e
    WHERE e."userId" = l."userId" AND e.source = 'REVIEW' AND e."dedupeKey" IS NULL
      AND e.detail LIKE 'advanced%' AND e."occurredAt" >= l.since) AS passed_review_rows,
  (SELECT COUNT(*) FROM "MasteryLedgerEntry" m
    WHERE m."userId" = l."userId" AND m.reason = 'REVIEW_FRACTION' AND m."createdAt" >= l.since) AS review_fraction_rows
FROM live l;

ROLLBACK;

-- Hand-authored, per this project's convention (see the add_field_snapshot
-- migration header for why `prisma migrate dev` cannot be used here).
--
-- Repairs a regression introduced by 20260812120000_skill_loadout.
--
-- That migration added `equippedSlot` defaulting to NULL, which is correct
-- for the column but wrong as a starting state: every skill a player had
-- already unlocked was silently benched, so accounts that previously had
-- effects applying woke up with none. Unlocking had been the only gate;
-- moving the gate without carrying existing unlocks across it takes away
-- something already paid for.
--
-- This assigns slots to the first ten skills of any account that has *no*
-- skills equipped at all, oldest unlock first. The "none equipped" guard is
-- what makes it safe to run after the feature is live: an account that has
-- deliberately benched everything down to zero is left alone rather than
-- having its loadout silently repopulated.

WITH untouched AS (
    -- Accounts that have never equipped anything.
    SELECT "userId"
    FROM "UnlockedSkill"
    GROUP BY "userId"
    HAVING count("equippedSlot") = 0
),
ranked AS (
    SELECT
        u.id,
        row_number() OVER (
            PARTITION BY u."userId"
            ORDER BY u."unlockedAt", u.id
        ) - 1 AS slot
    FROM "UnlockedSkill" u
    JOIN untouched t ON t."userId" = u."userId"
)
UPDATE "UnlockedSkill" AS u
SET "equippedSlot" = r.slot
FROM ranked r
WHERE u.id = r.id
  AND r.slot < 10;

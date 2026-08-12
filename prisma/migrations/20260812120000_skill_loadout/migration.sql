-- Hand-authored, as with every migration in this project: Supabase's default
-- extensions make `prisma migrate dev`'s drift pre-flight fail, so migrations
-- are written by hand, applied directly, then recorded with
--   npx prisma migrate resolve --applied 20260812120000_skill_loadout
--
-- Adds the loadout slot. Owning a skill no longer makes it do anything —
-- only the ten equipped skills fold into ActiveModifiers. Every existing
-- UnlockedSkill row lands benched (NULL), which is the correct default:
-- an account that previously had every effect at once should have to
-- choose ten, not silently keep them all.

ALTER TABLE "UnlockedSkill" ADD COLUMN "equippedSlot" INTEGER;

-- One skill per slot. Partial, because NULL means "benched" and any number
-- of skills may be benched at once — a plain UNIQUE would allow only one
-- benched skill per user in Postgres... except that Postgres already treats
-- NULLs as distinct in a UNIQUE index, so this is equivalent. It is written
-- as a partial index anyway so the intent is explicit and the index stays
-- small on accounts holding hundreds of benched skills.
CREATE UNIQUE INDEX "UnlockedSkill_userId_equippedSlot_key"
    ON "UnlockedSkill"("userId", "equippedSlot")
    WHERE "equippedSlot" IS NOT NULL;

-- Slots are 0..9. Enforced here as well as in the action, because a bad
-- index would silently create an eleventh slot no UI could ever show.
ALTER TABLE "UnlockedSkill"
    ADD CONSTRAINT "UnlockedSkill_equippedSlot_range"
    CHECK ("equippedSlot" IS NULL OR ("equippedSlot" >= 0 AND "equippedSlot" <= 9));

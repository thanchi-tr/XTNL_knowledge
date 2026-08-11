-- Hand-authored, like the Phase 1 pgvector migration.
--
-- `prisma migrate dev` refuses to run past its pre-flight drift check on
-- this database: Supabase's own default extensions (pgcrypto, uuid-ossp,
-- pg_stat_statements, supabase_vault) exist in the real database but were
-- never created by our migration history, so a from-scratch shadow-database
-- replay never matches the real target and Prisma reports "drift" asking
-- to reset the whole schema. That's a false positive from infrastructure
-- Supabase provisions by default, not anything this app manages — see the
-- README's Supabase section for the same story with the P4002 error. This
-- table has no vector/extension dependency, so unlike the Phase 1
-- migration there's nothing extension-specific here — it's just a plain
-- CREATE TABLE Prisma would have generated itself if the drift check
-- hadn't blocked it.
--
-- Applied directly against the DB, then recorded as already-applied via
-- `prisma migrate resolve --applied` (see README) rather than through
-- `migrate dev`/`migrate deploy`.

CREATE TABLE "FieldSnapshot" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "level" DOUBLE PRECISION NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FieldSnapshot_fieldId_day_key" ON "FieldSnapshot"("fieldId", "day");

ALTER TABLE "FieldSnapshot"
    ADD CONSTRAINT "FieldSnapshot_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES "Field"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

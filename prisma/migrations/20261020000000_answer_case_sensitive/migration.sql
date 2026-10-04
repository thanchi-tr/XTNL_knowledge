-- answer_case_sensitive: additive. One column on "Idea" with a default, so
-- every existing idea keeps grading as before except that capitals no longer
-- count (the new default). Nothing is rewritten.
--
-- Target: the xtnl-idea Supabase project ONLY (never XTNL_thesis). Check the
-- project ref first, rehearse on the local mirror, then apply with
-- `prisma db execute --file prisma/migrations/20261020000000_answer_case_sensitive/migration.sql`
-- and `prisma migrate resolve --applied 20261020000000_answer_case_sensitive`.

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN "answerCaseSensitive" BOOLEAN NOT NULL DEFAULT false;

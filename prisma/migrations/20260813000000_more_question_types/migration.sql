-- Hand-authored, per this project's convention (see the add_field_snapshot
-- migration header for why `prisma migrate dev` cannot run against this
-- database).
--
-- Four new drill formats. Purely additive: `ALTER TYPE ... ADD VALUE` leaves
-- every existing row untouched, and no existing Idea can be any of these.
--
-- Each is committed separately because Postgres will not let a new enum
-- value be *used* in the same transaction that adds it. That is not a
-- constraint this migration hits (nothing here inserts), but running them
-- as separate statements keeps the file replayable if someone later appends
-- a data step to it.

ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'CLOZE';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'LIST';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'ORDER';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'NUMERIC';

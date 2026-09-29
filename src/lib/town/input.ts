import type { Attribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadFieldLevels } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { getDailyStreak } from "@/lib/streak";
import { depthOf } from "@/lib/skill-form";
import { dueCutoff } from "@/lib/due";
import { clearedField, schoolOf, type FieldDaily, type School, type TownInput } from "./rules";

/**
 * Reads the player's real knowledge into the town's rule inputs.
 *
 * Server-only. Nothing here is invented for the town: every number is one the
 * rest of the app already tracks — Field levels, attribute scores, the
 * streak, the loadout — which is the point. The town is a lens on progress,
 * so it must not have a progress bar of its own.
 */
export async function loadTownInput(userId: string): Promise<TownInput> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [fields, progression, streak, recent, domains, dueRemaining, newIdeasToday, daily] = await Promise.all([
    loadFieldLevels(),
    loadProgression(userId),
    getDailyStreak(),
    prisma.idea.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { domain: { select: { field: { select: { name: true } } } } },
    }),
    prisma.domain.findMany({ select: { level: true } }),
    // The same "due" the review queue uses: anything scheduled on or before today.
    prisma.idea.count({ where: { isArchived: false, dueDate: { lte: dueCutoff(new Date()) } } }),
    prisma.idea.count({ where: { createdAt: { gte: dayStart } } }),
    loadFieldDaily(userId, dayStart, weekAgo),
  ]);

  const schools: Record<School, number> = { commerce: 0, science: 0, mind: 0 };
  for (const f of fields) {
    const s = schoolOf(f.name);
    if (s) schools[s] += f.level;
  }

  const newIdeasThisWeek: Record<School, number> = { commerce: 0, science: 0, mind: 0 };
  for (const r of recent) {
    const s = schoolOf(r.domain.field.name);
    if (s) newIdeasThisWeek[s] += 1;
  }

  const equippedAttributes: Attribute[] = progression.activeSkills.flatMap((s) => s.attributes);
  const peakDepth = progression.activeSkills.reduce((m, s) => Math.max(m, depthOf(s)), 0);

  // Passes and misses both come from the mastery ledger, which gets one row
  // per answer and none for anything else. "Touched today" (updatedAt) also
  // counts new ideas, merges and the midnight degrade, which would read a day
  // with no review as a day of effort.
  const passedToday = daily.reduce((a, f) => a + (f.passed ?? [0, 0, 0, 0]).reduce((x, y) => x + y, 0), 0);
  const missedToday = daily.reduce((a, f) => a + (f.misses ?? 0), 0);

  return {
    schools,
    scores: progression.scores,
    streakDays: streak.current,
    equippedAttributes,
    peakDepth,
    reviewsToday: passedToday,
    reviewsAttempted: passedToday + missedToday,
    newIdeasThisWeek,
    emblems: progression.activeSkills.map((s) => ({ code: s.code, name: s.name, attributes: s.attributes, depth: depthOf(s) })),
    domainPeak: domains.reduce((m, d) => Math.max(m, d.level), 0),
    domainSum: domains.reduce((a, d) => a + d.level, 0),
    dueRemaining,
    newIdeasToday,
    fields: daily,
    day: localDay(dayStart),
  };
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Each Field's day: ideas added and how new they were, cards touched,
 * answers passed (by depth) and missed, whether it was cleared, cards
 * mastered, still due and long overdue, Domains opened, its streak and what
 * it trains. Three grouped queries — the ideas, today's mastery ledger,
 * today's new Domains — plus the attribute split and the streak rows the rest
 * of the app keeps, all at once. Study is read from the ledger only: it holds
 * one row per answer, and the midnight degrade writes none.
 */
async function loadFieldDaily(userId: string, dayStart: Date, weekAgo: Date): Promise<FieldDaily[]> {
  const cutoff = dueCutoff(new Date());
  const overdueCut = new Date(dayStart.getTime() - 86_400_000);
  const [fields, counts, ledger, domainsToday, attrs, streaks] = await Promise.all([
    prisma.field.findMany({ select: { id: true, name: true, level: true } }),
    prisma.$queryRaw<{ field: string; ideas_today: bigint; ideas_week: bigint; reviewed_today: bigint; due: bigint; overdue: bigint; novelty: number | null }[]>`
      SELECT d."fieldId" AS field,
        COUNT(*) FILTER (WHERE i."createdAt" >= ${dayStart}) AS ideas_today,
        COUNT(*) FILTER (WHERE i."createdAt" >= ${weekAgo}) AS ideas_week,
        COUNT(*) FILTER (WHERE i."updatedAt" >= ${dayStart} AND i."createdAt" < ${dayStart}) AS reviewed_today,
        COUNT(*) FILTER (WHERE NOT i."isArchived" AND i."dueDate" <= ${cutoff}) AS due,
        COUNT(*) FILTER (WHERE NOT i."isArchived" AND i."dueDate" < ${overdueCut}) AS overdue,
        SUM(LEAST(1.5, i."yieldPoints" / NULLIF(i."basePoints", 0))) FILTER (WHERE i."createdAt" >= ${dayStart}) AS novelty
      FROM "Idea" i JOIN "Domain" d ON d.id = i."domainId"
      GROUP BY d."fieldId"
    `,
    // A pass leaves the card one level up, so its level now is the depth it was recalled at, plus one.
    // Misses are the zero-delta REVIEW_MISS rows. `fdue` is the Field's due
    // count after its last answer today, from that answer's detail (rules.ts
    // `reviewDetail`; the pattern takes the first `fdue=`, as
    // `parseReviewDetail` does); null when no row today carries one.
    prisma.$queryRaw<{ field: string; p1: bigint; p2: bigint; p3: bigint; p4: bigint; mastered: bigint; misses: bigint; fdue: number | null }[]>`
      SELECT d."fieldId" AS field,
        COUNT(*) FILTER (WHERE m.reason = 'REVIEW_FRACTION' AND i.level <= 3) AS p1,
        COUNT(*) FILTER (WHERE m.reason = 'REVIEW_FRACTION' AND i.level BETWEEN 4 AND 6) AS p2,
        COUNT(*) FILTER (WHERE m.reason = 'REVIEW_FRACTION' AND i.level BETWEEN 7 AND 9) AS p3,
        COUNT(*) FILTER (WHERE m.reason = 'REVIEW_FRACTION' AND i.level >= 10) AS p4,
        COUNT(*) FILTER (WHERE m.reason = 'IDEA_MASTERED') AS mastered,
        COUNT(*) FILTER (WHERE m.reason = 'REVIEW_MISS') AS misses,
        CAST((ARRAY_AGG(SUBSTRING(m.detail FROM 'fdue=([0-9]+)') ORDER BY m."createdAt" DESC, m.id DESC)
          FILTER (WHERE m.reason IN ('REVIEW_FRACTION', 'REVIEW_MISS') AND m.detail ~ 'fdue=[0-9]'))[1] AS integer) AS fdue
      FROM "MasteryLedgerEntry" m
      JOIN "Idea" i ON i.id = m."ideaId"
      JOIN "Domain" d ON d.id = i."domainId"
      WHERE m."userId" = ${userId}
        AND m."createdAt" >= ${dayStart}
        AND m.reason IN ('REVIEW_FRACTION', 'REVIEW_MISS', 'IDEA_MASTERED')
      GROUP BY d."fieldId"
    `,
    prisma.$queryRaw<{ field: string; n: bigint }[]>`
      SELECT "fieldId" AS field, COUNT(*) AS n FROM "Domain" WHERE "createdAt" >= ${dayStart} GROUP BY "fieldId"
    `,
    prisma.fieldAttribute.findMany({ select: { fieldId: true, attribute: true, weight: true } }),
    prisma.fieldStreak.findMany({ where: { userId }, select: { fieldId: true, currentDays: true, bestDays: true, lastActiveDay: true } }),
  ]);
  const byField = new Map(counts.map((c) => [c.field, c]));
  const passes = new Map(ledger.map((l) => [l.field, l]));
  const opened = new Map(domainsToday.map((d) => [d.field, Number(d.n)]));
  const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const yesterdayUtc = new Date(todayUtc.getTime() - 86_400_000);
  return fields.map((f) => {
    const c = byField.get(f.id);
    const n = (x: bigint | undefined) => Number(x ?? 0);
    const top = attrs.filter((a) => a.fieldId === f.id).sort((a, b) => b.weight - a.weight).slice(0, 2).map((a) => a.attribute);
    const st = streaks.find((x) => x.fieldId === f.id);
    // A streak is alive through today if its last active day is today or yesterday.
    const alive = st && st.lastActiveDay.getTime() >= yesterdayUtc.getTime();
    const reviewedToday = n(c?.reviewed_today);
    const dueRemaining = n(c?.due);
    const l = passes.get(f.id);
    const passed: [number, number, number, number] = [n(l?.p1), n(l?.p2), n(l?.p3), n(l?.p4)];
    const passedToday = passed[0] + passed[1] + passed[2] + passed[3];
    const misses = n(l?.misses);
    // Cleared on answers alone. A Field whose rows today carry no counts (on
    // the day this shipped, or if srs.ts could not take them) reads the live
    // due count instead — still on ledger passes, so a Field nobody answered
    // in, however empty the degrade left it, is never cleared.
    const cleared = clearedField({ passes: passedToday, misses, fdue: l?.fdue ?? dueRemaining });
    return {
      id: f.id,
      name: f.name,
      school: schoolOf(f.name),
      level: f.level,
      attrs: top,
      ideasToday: n(c?.ideas_today),
      ideasWeek: n(c?.ideas_week),
      reviewedToday,
      dueRemaining,
      overdue: n(c?.overdue),
      streak: alive ? st!.currentDays : 0,
      bestStreak: st?.bestDays ?? 0,
      complete: cleared,
      cleared,
      passed,
      failed: misses,
      misses,
      mastered: n(l?.mastered),
      novelty: Number(c?.novelty ?? 0),
      newDomains: opened.get(f.id) ?? 0,
    };
  });
}

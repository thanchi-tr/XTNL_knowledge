/**
 * Two kinds of snapshot live here.
 *
 * 1. The progress snapshot (L3-celebrate): `readProgress(userId, opts)` reads
 *    the state the celebration detectors diff (src/lib/celebration-detect.ts).
 *    Each part is read through the process cache under the tags its writers
 *    already invalidate, so the BEFORE snapshot is usually free and the AFTER
 *    one (taken after the write invalidated its tags) is a fresh read. Never
 *    React `cache()`: inside one server action it would hand the after
 *    snapshot the before one's object, and nothing could ever diff.
 * 2. FieldSnapshot rows (further down): one per Field per day, for the
 *    Dashboard's 7-days-ago ghost radar.
 */
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate, type CacheTag } from "./cache";
import { bossFor, bossMasteryReward } from "./bosses";
import {
  partsOf,
  type BossesPart,
  type GoalsPart,
  type HabitsPart,
  type LedgerPart,
  type LedgerRow,
  type LevelsPart,
  type MasteredPart,
  type ProgressData,
  type ReadyPart,
  type SkillsPart,
  type SnapshotPart,
  type SnapshotScope,
  type StreakPart,
} from "./celebration-detect";
import { HABIT_WINDOW_DAYS, habitStrength, perDutyStreak } from "./habit";
import { addDays, dateColumn, keyOfDateColumn, todayKey, weekKeyOf, type DayKey } from "./life-day";
import { parseRule } from "./recurrence";
import { getSkill, SKILL_POOL } from "./skill-pool";
import { HELD_SOURCES, computeStreak, streakWindowStart } from "./streak-curve";

// ─── The progress snapshot (celebrations) ───────────────────────────────────

export interface ReadProgressOptions {
  /**
   * A preset (SNAPSHOT_SCOPES) or a list of parts. Pass one: `review` is 4
   * queries, the default is ~8 (every part except `ready`, and `habits` only
   * with templateIds). Take the same scope before and after.
   */
  scope?: SnapshotScope | readonly SnapshotPart[];
  /** `habits` only: the templates to read (the ticked one). Default: every active recurring template. */
  templateIds?: readonly string[];
  /** Bypass the process cache (for a writer that does not invalidate its tags). */
  fresh?: boolean;
  now?: Date;
}

/** Wide enough for the 365-day milestone; the board's own streak read covers 70. */
const STREAK_READ_DAYS = 400;
/** WEEK and PR rows: about two months back is plenty for a before/after diff. */
const LEDGER_READ_DAYS = 63;

const PART_TAGS: Record<SnapshotPart, CacheTag[]> = {
  levels: ["fields", "ideas", "progress"],
  mastered: ["progress", "ideas", "activity"],
  streak: ["activity"],
  skills: ["progress"],
  goals: ["life", "activity"],
  bosses: ["progress", "activity"],
  ledger: ["activity"],
  habits: ["life", "activity"],
  tracks: ["life", "activity"],
  ready: ["fields", "ideas", "progress", "life"],
};

const round2 = (v: number) => Math.round(v * 100) / 100;

async function readLevels(userId: string): Promise<LevelsPart> {
  const [fields, owned] = await Promise.all([
    prisma.field.findMany({
      relationLoadStrategy: "join",
      orderBy: { name: "asc" },
      select: { id: true, name: true, level: true, domains: { select: { id: true, name: true, level: true } } },
    }),
    prisma.unlockedSkill.findMany({ where: { userId }, select: { skillCode: true } }),
  ]);
  return {
    fields: fields.map((f) => ({ id: f.id, name: f.name, level: f.level })),
    domains: fields.flatMap((f) => f.domains.map((d) => ({ id: d.id, name: d.name, fieldId: f.id, level: d.level }))),
    ultimates: owned.filter((o) => getSkill(o.skillCode)?.rank === "ULTIMATE").length,
  };
}

async function readMastered(userId: string): Promise<MasteredPart> {
  const rows = await prisma.masteryLedgerEntry.findMany({
    where: { userId, reason: "IDEA_MASTERED", ideaId: { not: null } },
    select: { ideaId: true, delta: true },
  });
  const ideas: Record<string, number> = {};
  for (const r of rows) if (r.ideaId) ideas[r.ideaId] = round2((ideas[r.ideaId] ?? 0) + r.delta);
  return { ideas };
}

async function readStreak(userId: string, now: Date): Promise<StreakPart> {
  const today = todayKey(now);
  // streak.ts's one query over a longer window: the same CASE as streakUnitsOf.
  const rows = await prisma.$queryRaw<{ day: Date; units: number; held: number }[]>`
    SELECT "day",
           SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END)::int AS units,
           SUM(CASE WHEN "source" IN (${Prisma.join([...HELD_SOURCES])}) THEN 1 ELSE 0 END)::int AS held
    FROM "ActivityEvent"
    WHERE "userId" = ${userId} AND "day" >= ${streakWindowStart(today, STREAK_READ_DAYS)}::date
    GROUP BY "day"
  `;
  const active = new Set<DayKey>();
  const heldDays = new Set<DayKey>();
  for (const r of rows) {
    const key = keyOfDateColumn(new Date(r.day));
    if (r.units > 0) active.add(key);
    if (r.held > 0) heldDays.add(key);
  }
  const streak = computeStreak(active, heldDays, today, { windowDays: STREAK_READ_DAYS });
  // Held days inside the current run (freezes arrive in M2; 0 until then).
  let held = 0;
  for (let i = 1; i < STREAK_READ_DAYS; i++) {
    const key = addDays(today, -i);
    if (active.has(key)) continue;
    if (heldDays.has(key)) {
      held += 1;
      continue;
    }
    break;
  }
  return { today, current: streak.current, todayActive: active.has(today), held };
}

async function readSkills(userId: string): Promise<SkillsPart> {
  const [owned, agg] = await Promise.all([
    prisma.unlockedSkill.findMany({ where: { userId }, select: { skillCode: true, masteryPaid: true }, orderBy: { unlockedAt: "asc" } }),
    prisma.masteryLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } }),
  ]);
  return { owned: owned.map((o) => ({ code: o.skillCode, paid: o.masteryPaid })), mp: round2(agg._sum.delta ?? 0) };
}

async function readGoals(userId: string): Promise<GoalsPart> {
  const rows = await prisma.taskTemplate.findMany({
    where: { userId, kind: "GOAL", OR: [{ completedAt: { not: null } }, { closedScore: { not: null } }] },
    select: { id: true, title: true, horizon: true, goalMp: true, closedScore: true, krTarget: true, krUnit: true },
  });
  return { done: rows };
}

async function readBosses(userId: string): Promise<BossesPart> {
  const rows = await prisma.bossEncounter.findMany({
    where: { userId },
    select: { fieldId: true, tier: true, victories: true, field: { select: { name: true } } },
  });
  return {
    rows: rows.map((r) => ({
      fieldId: r.fieldId,
      fieldName: r.field.name,
      tier: r.tier,
      victories: r.victories,
      name: bossFor(r.fieldId, r.tier).name,
      reward: bossMasteryReward(r.tier),
    })),
  };
}

async function readLedger(userId: string, now: Date): Promise<LedgerPart> {
  const since = dateColumn(addDays(todayKey(now), -LEDGER_READ_DAYS));
  const rows = await prisma.activityEvent.findMany({
    where: { userId, source: { in: ["WEEK", "PR"] }, day: { gte: since } },
    select: { id: true, source: true, track: true, day: true, xp: true, qty: true, detail: true, dedupeKey: true },
  });
  const weeks: LedgerRow[] = [];
  const prs: LedgerRow[] = [];
  for (const r of rows) {
    const day = keyOfDateColumn(r.day);
    const row: LedgerRow = { key: r.dedupeKey ?? r.id, track: r.track, day, xp: r.xp, qty: r.qty, detail: r.detail };
    if (r.source === "WEEK") {
      // M5: qty 1 = kept, 0 = not; a backfilled week counts for depth only and is never a moment.
      if (!(r.qty != null && r.qty > 0) || r.detail === "backfill") continue;
      const m = /^week:[^:]+:(.+)$/.exec(r.dedupeKey ?? "");
      weeks.push({ ...row, week: m ? m[1] : weekKeyOf(day) });
    } else prs.push(row);
  }
  return { weeks, prs };
}

async function readHabits(userId: string, now: Date, templateIds?: readonly string[]): Promise<HabitsPart> {
  const today = todayKey(now);
  const since = dateColumn(addDays(today, -(HABIT_WINDOW_DAYS - 1)));
  const ids = templateIds && templateIds.length ? [...templateIds] : null;
  const [templates, instances] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { userId, archivedAt: null, recurrence: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, title: true, recurrence: true, startDay: true },
    }),
    prisma.taskInstance.findMany({
      where: {
        userId,
        day: { gte: since },
        ...(ids ? { templateId: { in: ids } } : { template: { archivedAt: null, recurrence: { not: null } } }),
      },
      select: { templateId: true, day: true, status: true },
    }),
  ]);
  const byTemplate = new Map<string, { day: DayKey; status: string }[]>();
  for (const i of instances) {
    const list = byTemplate.get(i.templateId) ?? [];
    list.push({ day: keyOfDateColumn(i.day), status: i.status });
    byTemplate.set(i.templateId, list);
  }
  const rows: HabitsPart["rows"] = [];
  for (const t of templates) {
    const rule = parseRule(t.recurrence);
    if (!rule) continue;
    const start = keyOfDateColumn(t.startDay);
    const list = byTemplate.get(t.id) ?? [];
    rows.push({ id: t.id, title: t.title, strength: habitStrength(rule, start, today, list), kept: perDutyStreak(rule, start, today, list).kept });
  }
  return { rows };
}

async function readReady(userId: string): Promise<ReadyPart> {
  // The costly part (every gate over the whole pool), so it is opt-in and loaded lazily.
  const [{ loadProgressionFresh, unlockBlockers }, { getMasteryBalanceFresh }] = await Promise.all([import("./skill-effects"), import("./mastery")]);
  const [progression, balance] = await Promise.all([loadProgressionFresh(userId), getMasteryBalanceFresh(userId)]);
  const codes = SKILL_POOL.filter((s) => unlockBlockers(s, progression.scores, progression.ownedCodes, balance, progression.modifiers).length === 0).map((s) => s.code);
  return { codes };
}

type ReadablePart = Exclude<SnapshotPart, "tracks">;

/**
 * Reads the parts a scope asks for. A part that fails to read is left out, so
 * the diff simply skips it: a flaky read can hide a moment, never invent one.
 */
export async function readProgress(userId: string, opts: ReadProgressOptions = {}): Promise<ProgressData> {
  const now = opts.now ?? new Date();
  // `tracks` is not read until M5 lands life-tracks.ts; its detector is ready.
  // With no scope, `habits` (every recurring template's 400 days) is read only for named templates.
  const namedHabits = Boolean(opts.templateIds && opts.templateIds.length);
  const wanted = partsOf(opts.scope).filter((p): p is ReadablePart => p !== "tracks" && !(p === "habits" && opts.scope == null && !namedHabits));
  const idsKey = opts.templateIds && opts.templateIds.length ? [...opts.templateIds].sort().join(",") : "all";
  const loaders: Record<ReadablePart, () => Promise<unknown>> = {
    levels: () => readLevels(userId),
    mastered: () => readMastered(userId),
    streak: () => readStreak(userId, now),
    skills: () => readSkills(userId),
    goals: () => readGoals(userId),
    bosses: () => readBosses(userId),
    ledger: () => readLedger(userId, now),
    habits: () => readHabits(userId, now, opts.templateIds),
    ready: () => readReady(userId),
  };
  const results = await Promise.all(
    wanted.map(async (part): Promise<[ReadablePart, unknown]> => {
      const key = `celebrate:${part}:${userId}${part === "habits" ? `:${idsKey}` : ""}`;
      try {
        return [part, opts.fresh ? await loaders[part]() : await cached(key, PART_TAGS[part], loaders[part])];
      } catch (err) {
        console.error(`[celebrations] snapshot part ${part} failed`, err);
        return [part, null];
      }
    })
  );
  const data: ProgressData = { parts: [] };
  for (const [part, value] of results) {
    if (value == null) continue;
    (data as unknown as Record<string, unknown>)[part] = value;
    data.parts.push(part);
  }
  return data;
}

// ─── FieldSnapshot (the Dashboard's ghost radar) ────────────────────────────

function truncateToDay(d: Date): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

/**
 * Writes (upserts) today's snapshot for every Field. Safe to call on every
 * Dashboard view — `@@unique([fieldId, day])` means calling it 50 times in
 * one day just overwrites the same row with the latest numbers, which is
 * exactly what we want (today's snapshot should reflect today's current
 * state, not the state at whatever moment it was first written).
 */
export async function recordTodaySnapshot(): Promise<void> {
  const day = truncateToDay(new Date());
  const fields = await prisma.field.findMany({
    include: { domains: { select: { totalPoints: true } } },
  });

  await Promise.all(
    fields.map((f) =>
      prisma.fieldSnapshot.upsert({
        where: { fieldId_day: { fieldId: f.id, day } },
        create: {
          fieldId: f.id,
          day,
          level: f.level,
          totalPoints: f.domains.reduce((sum, d) => sum + d.totalPoints, 0),
        },
        update: {
          level: f.level,
          totalPoints: f.domains.reduce((sum, d) => sum + d.totalPoints, 0),
        },
      })
    )
  );
  // Today's own snapshot row changed; the 7-day-ago ghost has not, but the
  // key is cheap to drop and stale ghosts are worse than a re-query.
  invalidate("fields");
}

export interface GhostFieldLevel {
  fieldName: string;
  level: number;
}

/**
 * The snapshot from exactly 7 days ago, per Field — the "ghost" the Dashboard
 * radar compares against. Returns an empty array until snapshots have
 * actually been accumulating for a week; there's no synthetic fallback.
 */
export const getGhostLevelsFromDaysAgo = cache(async (daysAgo: number): Promise<GhostFieldLevel[]> => {
  return cached(`ghostLevels:${daysAgo}`, ["fields"], async () => {
    const day = truncateToDay(new Date());
    day.setUTCDate(day.getUTCDate() - daysAgo);

    const rows = await prisma.fieldSnapshot.findMany({
      where: { day },
      include: { field: { select: { name: true } } },
    });

    return rows.map((r) => ({ fieldName: r.field.name, level: r.level }));
  });
});

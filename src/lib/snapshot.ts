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
 *
 * M2 (lane B, F8, F11, F16): the streak part is streak.ts's own read and fold
 * (readStreakFacts, dailyStreakOf: rest days through duty-rule heldDaysOf,
 * freezes, the pending rule), the habits part reads with the settlement
 * cursor and held days as the board does, and the ledger part reads a WEEK
 * row's mark through life-tracks weekMarkOf and carries the full-day mints
 * for the week Seal.
 */
import { cache } from "react";
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
  type TracksPart,
} from "./celebration-detect";
import { HABIT_WINDOW_DAYS, habitStrength, perDutyStreak, type StreakOptions } from "./habit";
import { addDays, dateColumn, keyOfDateColumn, todayKey, weekKeyOf, type DayKey } from "./life-day";
import {
  GOAL_DEPTH_CAP,
  GOAL_MINT_PREFIX,
  GOAL_RULES,
  goalIdOfMintKey,
  isBackfillDetail,
  isLaunched,
  parseMintDetail,
  parseWeekRowKey,
  weekKeptMintKey,
} from "./life-economy";
import { dutyLaunchDay, fullDayMintKey, isDutyLaunched } from "./duty-economy";
import { heldDaysOf } from "./duty-rule";
import { loadLifeLedger } from "./life-tracks-server";
import { lifeTracksView, notLaunchedView, weekMarkOf, type LifeTracksView } from "./life-tracks";
import { TRACKS, type Track } from "./life-types";
import { parseRule } from "./recurrence";
import { getSkill, SKILL_POOL } from "./skill-pool";
import { dailyStreakOf, readStreakFacts } from "./streak";

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
  // 'life': the levels part carries the track levels once life is launched.
  levels: ["fields", "ideas", "progress", "life"],
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

/**
 * The life tracks as of this snapshot's instant, built here from the
 * process-cached ledger (loadLifeLedger, on 'life', which every TRACK, WEEK
 * and MP write invalidates) — never through loadLifeTracks. That one is
 * wrapped in React cache(), which keys a Date argument by identity: when a
 * before and an after snapshot share one `now` (the week judge passes its
 * clock to both), the after snapshot would get the before one's view back,
 * miss every track level-up and character change the write caused, and
 * cache that stale part under celebrate:* (the rule at the top of this file;
 * M5 review C1).
 */
async function readLife(userId: string, now: Date): Promise<LifeTracksView> {
  const today = todayKey(now);
  return isLaunched(today) ? lifeTracksView(await loadLifeLedger(userId), today) : notLaunchedView(today);
}

async function readLevels(userId: string, now: Date): Promise<LevelsPart> {
  const [fields, owned, life] = await Promise.all([
    prisma.field.findMany({
      relationLoadStrategy: "join",
      orderBy: { name: "asc" },
      select: { id: true, name: true, level: true, domains: { select: { id: true, name: true, level: true } } },
    }),
    prisma.unlockedSkill.findMany({ where: { userId }, select: { skillCode: true } }),
    readLife(userId, now),
  ]);
  return {
    fields: fields.map((f) => ({ id: f.id, name: f.name, level: f.level })),
    domains: fields.flatMap((f) => f.domains.map((d) => ({ id: d.id, name: d.name, fieldId: f.id, level: d.level }))),
    ultimates: owned.filter((o) => getSkill(o.skillCode)?.rank === "ULTIMATE").length,
    // Only once launched: the character counts tracks only when both snapshots carry them.
    ...(life.launched ? { tracks: { ...life.levels } } : {}),
  };
}

/** The four track levels (all 0 before launch, so nothing diffs). */
async function readTracks(userId: string, now: Date): Promise<TracksPart> {
  const life = await readLife(userId, now);
  return { levels: { ...life.levels } };
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

/**
 * streak.ts's one query and its one fold over a longer window (readStreakFacts,
 * dailyStreakOf: the same CASE as streakUnitsOf, the same held days through
 * duty-rule heldDaysOf, the same pending rule while Duty is live), so the
 * milestones and the board can never disagree about a day.
 */
async function readStreak(userId: string, now: Date): Promise<StreakPart> {
  const streak = dailyStreakOf(await readStreakFacts(userId, now, STREAK_READ_DAYS));
  return { today: todayKey(now), current: streak.current, todayActive: streak.last7Days[6] === true, held: streak.heldInRun };
}

async function readSkills(userId: string): Promise<SkillsPart> {
  const [owned, agg] = await Promise.all([
    prisma.unlockedSkill.findMany({ where: { userId }, select: { skillCode: true, masteryPaid: true }, orderBy: { unlockedAt: "asc" } }),
    prisma.masteryLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } }),
  ]);
  return { owned: owned.map((o) => ({ code: o.skillCode, paid: o.masteryPaid })), mp: round2(agg._sum.delta ?? 0) };
}

const isTrack = (t: unknown): t is Track => typeof t === "string" && (TRACKS as readonly string[]).includes(t);
const GOAL_DEPTH_BY_REASON = new Map<string, number>(Object.values(GOAL_RULES).map((r) => [r.reason, r.depth]));

/**
 * Closed goals (closedScore set: closing is explicit and final), each with
 * what its 'mp:GOAL:<id>' decision row paid, the why and the track, and the
 * track depth the close added. Depth is replayed from the paid goal rows in
 * order (day, then time): what a close adds is min(2, total after) −
 * min(2, total before) on its track, the same rule as the payout's depth.
 */
async function readGoals(userId: string): Promise<GoalsPart> {
  const [rows, mints] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { userId, kind: "GOAL", closedScore: { not: null } },
      select: { id: true, title: true, horizon: true, goalMp: true, closedScore: true, krTarget: true, krUnit: true, track: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", dedupeKey: { startsWith: GOAL_MINT_PREFIX } },
      select: { dedupeKey: true, track: true, templateId: true, day: true, occurredAt: true, qty: true, detail: true },
    }),
  ]);
  const goalMints = mints
    .map((m) => ({ ...m, goalId: goalIdOfMintKey(m.dedupeKey) }))
    .filter((m): m is typeof m & { goalId: string } => m.goalId != null)
    .sort((x, y) => x.day.getTime() - y.day.getTime() || x.occurredAt.getTime() - y.occurredAt.getTime() || (x.dedupeKey ?? "").localeCompare(y.dedupeKey ?? ""));
  const trackOfGoal = new Map(rows.map((r) => [r.id, r.track]));
  const decided = new Map<string, { paid: number; why: string | null; track: string | null; depth: number }>();
  const depthSoFar = new Map<string, number>();
  for (const m of goalMints) {
    const { reason, why } = parseMintDetail(m.detail);
    const paid = round2(Math.max(0, m.qty ?? 0));
    const track = isTrack(m.track) ? m.track : isTrack(trackOfGoal.get(m.goalId)) ? (trackOfGoal.get(m.goalId) as Track) : null;
    let depth = 0;
    if (paid > 0 && track) {
      const before = depthSoFar.get(track) ?? 0;
      const after = before + (GOAL_DEPTH_BY_REASON.get(reason) ?? 0);
      depth = Math.min(GOAL_DEPTH_CAP, after) - Math.min(GOAL_DEPTH_CAP, before);
      depthSoFar.set(track, after);
    }
    decided.set(m.goalId, { paid, why, track, depth });
  }
  return {
    done: rows.map(({ track, ...r }) => {
      const d = decided.get(r.id);
      return d ? { ...r, paid: d.paid, why: d.why, track: d.track ?? track, depth: d.depth } : { ...r, track };
    }),
  };
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

/**
 * Kept WEEK rows (each with the MP its kept-week mint paid), PR rows and
 * (M2) the full-day mints, in one query. A WEEK row's track is its stored
 * column (activity.ts keeps it on WEEK and MP_MINT rows), else the one in its
 * dedupe key. A kept week's mint shares its day (the week's Sunday) and a
 * full day's mint is dated the full day, so the same window reads them all.
 * A WEEK row's mark is read by life-tracks weekMarkOf (qty and receipt), never
 * from its detail line: only a kept one is a moment.
 */
async function readLedger(userId: string, now: Date): Promise<LedgerPart> {
  const since = dateColumn(addDays(todayKey(now), -LEDGER_READ_DAYS));
  const rows = await prisma.activityEvent.findMany({
    where: { userId, source: { in: ["WEEK", "PR", "MP_MINT"] }, day: { gte: since } },
    select: { id: true, source: true, track: true, day: true, xp: true, qty: true, detail: true, dedupeKey: true, receipt: true },
  });
  const minted = new Map<string, number>();
  for (const r of rows) if (r.source === "MP_MINT" && r.dedupeKey) minted.set(r.dedupeKey, r.qty ?? 0);
  const weeks: LedgerRow[] = [];
  const prs: LedgerRow[] = [];
  const fullDays: LedgerRow[] = [];
  for (const r of rows) {
    const day = keyOfDateColumn(r.day);
    const row: LedgerRow = { key: r.dedupeKey ?? r.id, track: r.track, day, xp: r.xp, qty: r.qty, detail: r.detail };
    if (r.source === "MP_MINT") {
      // A full day's mint ('mp:LIFE_FULL_DAY:<d>', qty 0 when trimmed): the week Seal states what it paid.
      if (r.dedupeKey && r.dedupeKey === fullDayMintKey(day)) fullDays.push({ ...row, week: weekKeyOf(day), mp: round2(r.qty ?? 0) });
      continue;
    }
    if (r.source === "WEEK") {
      // Only a kept week is a moment (a held or not-kept one is qty 0); a backfilled week ('backfill · …') counts for depth only.
      if (weekMarkOf({ qty: r.qty, receipt: r.receipt }) !== "kept" || isBackfillDetail(r.detail)) continue;
      const key = parseWeekRowKey(r.dedupeKey);
      const track = isTrack(r.track) ? r.track : (key?.track ?? null);
      const week = key?.weekKey ?? weekKeyOf(day);
      const mp = track ? minted.get(weekKeptMintKey(track, week)) : undefined;
      weeks.push({ ...row, track, week, ...(mp != null ? { mp: round2(mp) } : {}) });
    } else prs.push(row);
  }
  return { weeks, prs, fullDays };
}

/**
 * Habit strength and the per-duty run of each recurring template. Once a
 * Duty launch day is set, the same round trip also reads the settlement
 * cursor, the RestDay rows (duty-rule heldDaysOf) and the FREEZE_USE days,
 * and the habit reads take them as the board's do (decision 15): an
 * unsettled day reads pending while Duty is live, and a held day reads held
 * (a compulsoryOnRest must is held by a freeze day only).
 */
async function readHabits(userId: string, now: Date, templateIds?: readonly string[]): Promise<HabitsPart> {
  const today = todayKey(now);
  const sinceKey = addDays(today, -(HABIT_WINDOW_DAYS - 1));
  const since = dateColumn(sinceKey);
  const ids = templateIds && templateIds.length ? [...templateIds] : null;
  const launch = dutyLaunchDay();
  const restFrom = launch != null && today >= launch ? (sinceKey > launch ? sinceKey : launch) : null;
  const [templates, instances, settings, restRows, freezeRows] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { userId, archivedAt: null, recurrence: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, title: true, recurrence: true, startDay: true, compulsory: true, compulsoryOnRest: true },
    }),
    prisma.taskInstance.findMany({
      where: {
        userId,
        day: { gte: since },
        ...(ids ? { templateId: { in: ids } } : { template: { archivedAt: null, recurrence: { not: null } } }),
      },
      select: { templateId: true, day: true, status: true, repaired: true },
    }),
    launch != null ? prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true } }) : Promise.resolve(null),
    restFrom
      ? prisma.restDay.findMany({
          where: { userId, day: { gte: dateColumn(restFrom), lte: dateColumn(today) } },
          select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
        })
      : Promise.resolve([] as { day: Date; kind: string; declaredAt: Date; cancelledAt: Date | null }[]),
    restFrom
      ? prisma.activityEvent.findMany({ where: { userId, source: "FREEZE_USE", day: { gte: dateColumn(restFrom), lte: dateColumn(today) } }, select: { day: true } })
      : Promise.resolve([] as { day: Date }[]),
  ]);
  const byTemplate = new Map<string, { day: DayKey; status: string; repaired: boolean }[]>();
  for (const i of instances) {
    const list = byTemplate.get(i.templateId) ?? [];
    list.push({ day: keyOfDateColumn(i.day), status: i.status, repaired: i.repaired });
    byTemplate.set(i.templateId, list);
  }
  // M2: the cursor (only while Duty is live) and the held days; both inert before a launch day is set.
  const settledThroughDay = isDutyLaunched(today, launch) && settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null;
  const freezeDays = new Set<DayKey>(freezeRows.map((r) => keyOfDateColumn(r.day)));
  const heldDays = new Set<DayKey>(freezeDays);
  if (restFrom) {
    const rest = restRows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
    for (const d of heldDaysOf(rest, restFrom, today)) heldDays.add(d);
  }
  const rows: HabitsPart["rows"] = [];
  for (const t of templates) {
    const rule = parseRule(t.recurrence);
    if (!rule) continue;
    const start = keyOfDateColumn(t.startDay);
    const list = byTemplate.get(t.id) ?? [];
    const opts: StreakOptions =
      launch == null ? {} : { settledThroughDay, heldDays: t.compulsory && t.compulsoryOnRest ? freezeDays : heldDays };
    rows.push({ id: t.id, title: t.title, strength: habitStrength(rule, start, today, list, opts), kept: perDutyStreak(rule, start, today, list, opts).kept });
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

type ReadablePart = SnapshotPart;

/**
 * Reads the parts a scope asks for. A part that fails to read is left out, so
 * the diff simply skips it: a flaky read can hide a moment, never invent one.
 */
export async function readProgress(userId: string, opts: ReadProgressOptions = {}): Promise<ProgressData> {
  const now = opts.now ?? new Date();
  // With no scope, `habits` (every recurring template's 400 days) is read only for named templates.
  const namedHabits = Boolean(opts.templateIds && opts.templateIds.length);
  const wanted = partsOf(opts.scope).filter((p): p is ReadablePart => !(p === "habits" && opts.scope == null && !namedHabits));
  const idsKey = opts.templateIds && opts.templateIds.length ? [...opts.templateIds].sort().join(",") : "all";
  const loaders: Record<ReadablePart, () => Promise<unknown>> = {
    levels: () => readLevels(userId, now),
    mastered: () => readMastered(userId),
    streak: () => readStreak(userId, now),
    skills: () => readSkills(userId),
    goals: () => readGoals(userId),
    bosses: () => readBosses(userId),
    ledger: () => readLedger(userId, now),
    habits: () => readHabits(userId, now, opts.templateIds),
    tracks: () => readTracks(userId, now),
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

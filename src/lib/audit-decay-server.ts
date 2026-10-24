/**
 * The reads behind the weekly audit's "Decaying this week" (server only; every rule and every word is audit-decay.ts's).
 * Read only: nothing here writes, pays, settles, judges or applies a decay. Each source is read on its own and a source
 * that fails is left out and counted (`unread`), never guessed: a missing line, never a missing audit.
 *
 *   readAuditDecay(userId, week, now) → AuditDecaying
 *       Called by week-audit-server.ts: for a live (provisional) read, and once by freezeWeekAudit, whose copy then keeps
 *       it. The audited week runs from its Monday 04:00 to the read:
 *         traits   each Field's breadth now against its FieldSnapshot TRAIT_LOOKBACK_DAYS back (rows before
 *                  LEVEL_RULE_SINCE skipped), the life rows at both ends once life is launched (progress-rate.ts)
 *         drops    Domains and Fields whose droppedAt falls in the week and that are still below droppedFrom, with
 *                  the ideas past grace in each (at the loadout's grace extension, as the bell reads them)
 *         ideas    the ideas past grace now (the same read)
 *         habits   each personal habit's strength (habit.ts habitStrength, as the board reads it: the settlement
 *                  cursor and held days once Duty is live) at the Sunday before the week and now; #play and study
 *                  tasks that complete themselves are left out, as on the audit's habits line
 *         streaks  the life tracks' kept-week runs before and after the week judged inside this one (streakWeekOf)
 *         mp       this week's idle-decay rows (MasteryLedgerEntry reason DECAY)
 *         condition  (blueprint P28) each attribute's and skill's condition at the read (skill-decay-server
 *                  loadConditionItems): only while DECAY_LAUNCH_DAY is in force; before it nothing is read and nothing
 *                  is counted unread
 */
import { prisma } from "./prisma";
import { addDays, dateColumn, dayStartOf, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { PERSONAL_BOARD } from "./work-boards";
import { emptyComposition, type Composition } from "./attributes";
import { fieldBreadth, levelRuleSnapshotFloor } from "./xp";
import { ideaStatusOf } from "./forgetting";
import { HABIT_WINDOW_DAYS, habitStrength, type StreakOptions } from "./habit";
import { parseRule } from "./recurrence";
import { dutyLaunchDay, isDutyLaunched } from "./duty-economy";
import { heldDaysOf } from "./duty-rule";
import { isLaunched, trackCurveOn } from "./life-economy";
import { lifeContributionsAt, trackStateAt } from "./life-tracks";
import { loadLifeLedger } from "./life-tracks-server";
import { loadConditionItems } from "./skill-decay-server";
import type { ConditionItem } from "./skill-decay";
import {
  decayingOf,
  snapshotThenOf,
  streakWeekOf,
  traitScoresOf,
  traitSinceOf,
  type AuditDecaying,
  type DecayFacts,
  type HabitStrengthFact,
  type LevelDropFact,
  type TraitField,
} from "./audit-decay";

/** The week being audited: its Monday (the decay window opens at its 04:00). */
export interface DecayWeek {
  monday: DayKey;
}

export async function readAuditDecay(userId: string, week: DecayWeek, now: Date): Promise<AuditDecaying> {
  const today = todayKey(now);
  const since = dayStartOf(week.monday);
  let unread = 0;
  const soft = <T,>(what: string) => (err: unknown): T | null => {
    unread += 1;
    console.error(`Week audit: ${what} failed to read; it is left out of the decay.`, err);
    return null;
  };
  const [traits, knowledge, habits, streaks, mp, conditions] = await Promise.all([
    readTraits(userId, now, today).catch(soft<DecayFacts["traits"]>("the traits")),
    readKnowledge(userId, since, now).catch(soft<{ drops: LevelDropFact[]; ideas: { fading: number; forgetting: number } }>("the levels and ideas")),
    readHabitStrengths(userId, addDays(week.monday, -1), today).catch(soft<HabitStrengthFact[]>("the habits")),
    readStreaks(userId, week.monday, today).catch(soft<DecayFacts["streaks"]>("the kept-week runs")),
    prisma.masteryLedgerEntry
      .findMany({ where: { userId, reason: "DECAY", createdAt: { gte: since, lte: now } }, select: { delta: true } })
      .catch(soft<{ delta: number }[]>("idle decay")),
    loadConditionItems(userId, now).catch(soft<ConditionItem[]>("the conditions")),
  ]);
  return decayingOf({ traits, drops: knowledge?.drops ?? null, ideas: knowledge?.ideas ?? null, habits, streaks, mp, conditions, unread });
}

/** The traits then (the snapshot TRAIT_LOOKBACK_DAYS back) and now; null when no Field has a snapshot to compare. */
async function readTraits(userId: string, now: Date, today: DayKey): Promise<DecayFacts["traits"]> {
  const sinceKey = traitSinceOf(now);
  const [fields, ledger] = await Promise.all([
    prisma.field.findMany({
      select: {
        name: true,
        level: true,
        attributes: { select: { attribute: true, weight: true } },
        domains: { select: { level: true } },
        snapshots: { where: { day: { gte: levelRuleSnapshotFloor(dateColumn(sinceKey)) } }, orderBy: { day: "asc" }, take: 1, select: { day: true, level: true } },
      },
    }),
    loadLifeLedger(userId),
  ]);
  const read = fields.map((f) => {
    const composition = emptyComposition();
    for (const a of f.attributes) composition[a.attribute] = a.weight;
    const then = snapshotThenOf(f.snapshots.map((s) => ({ day: keyOfDateColumn(s.day), level: s.level })), sinceKey);
    const row: TraitField = { name: f.name, breadth: fieldBreadth(f.domains.map((d) => d.level)), fieldLevel: f.level, thenLevel: then?.level ?? null, composition: composition as Composition };
    return { row, day: then?.day ?? null };
  });
  // The life rows' "then" is the oldest snapshot day used; with no snapshot at all there is nothing to compare.
  const thenDay = read.reduce<DayKey | null>((min, r) => (r.day != null && (min == null || r.day < min) ? r.day : min), null);
  if (thenDay == null) return null;
  const rows = read.map((r) => r.row);
  // The life rows at both ends only once life is launched (the attribute scores' own gate).
  const life = ledger.epochDay != null && isLaunched(today) ? ledger : null;
  // Both ends on today's track curve (blueprint P3): a curve flip is never a trait that rose or fell.
  const curve = trackCurveOn(today);
  return traitScoresOf(rows, { then: life ? lifeContributionsAt(life, thenDay, curve) : [], now: life ? lifeContributionsAt(life, today, curve) : [] });
}

/** The Domains and Fields that fell this week (not yet won back), and the ideas past grace now, by Domain and Field. */
async function readKnowledge(userId: string, since: Date, now: Date): Promise<{ drops: LevelDropFact[]; ideas: { fading: number; forgetting: number } }> {
  const [ideas, domains, fields, grace] = await Promise.all([
    prisma.idea.findMany({ where: { isArchived: false, dueDate: { lt: now } }, select: { domainId: true, level: true, dueDate: true, ease: true, domain: { select: { fieldId: true } } } }),
    prisma.domain.findMany({ where: { droppedAt: { gte: since, lte: now } }, select: { id: true, name: true, level: true, droppedFrom: true, fieldId: true } }),
    prisma.field.findMany({ where: { droppedAt: { gte: since, lte: now } }, select: { id: true, name: true, level: true, droppedFrom: true } }),
    graceExtraOf(userId),
  ]);
  const byDomain = new Map<string, number>();
  const byField = new Map<string, number>();
  const count = { fading: 0, forgetting: 0 };
  for (const i of ideas) {
    const status = ideaStatusOf(i, now, grace);
    if (status !== "fading" && status !== "forgetting") continue;
    count[status] += 1;
    byDomain.set(i.domainId, (byDomain.get(i.domainId) ?? 0) + 1);
    byField.set(i.domain.fieldId, (byField.get(i.domain.fieldId) ?? 0) + 1);
  }
  const drops: LevelDropFact[] = [
    ...fields.flatMap((f) => (f.droppedFrom != null ? [{ kind: "field" as const, id: f.id, name: f.name, fieldId: f.id, level: f.level, droppedFrom: f.droppedFrom, fading: byField.get(f.id) ?? 0 }] : [])),
    ...domains.flatMap((d) => (d.droppedFrom != null ? [{ kind: "domain" as const, id: d.id, name: d.name, fieldId: d.fieldId, level: d.level, droppedFrom: d.droppedFrom, fading: byDomain.get(d.id) ?? 0 }] : [])),
  ];
  return { drops, ideas: count };
}

/** The loadout's GRACE_EXTENSION days (as the bell reads the ideas past grace); none when it can't be read. */
async function graceExtraOf(userId: string): Promise<number> {
  try {
    // Loaded on use: skill-effects reaches the life tracks and the loadout, which this file's callers need not load.
    const { loadModifiers } = await import("./skill-effects");
    return Math.max(0, (await loadModifiers(userId)).graceExtraDays || 0);
  } catch {
    return 0;
  }
}

/**
 * Each personal habit's strength at `before` (the Sunday ending the week before) and today, read as the board reads
 * it (snapshot.ts readHabits: the personal Board's templates with a repeat rule; once Duty is live, the settlement
 * cursor and the held days). The earlier read sees only the instances of days up to it.
 */
async function readHabitStrengths(userId: string, before: DayKey, today: DayKey): Promise<HabitStrengthFact[]> {
  const sinceKey = addDays(today, -(HABIT_WINDOW_DAYS - 1));
  const launch = dutyLaunchDay();
  const restFrom = launch != null && today >= launch ? (sinceKey > launch ? sinceKey : launch) : null;
  const [templates, instances, settings, restRows, freezeRows] = await Promise.all([
    prisma.taskTemplate.findMany({
      // A habit that completes itself is left out; a pages task (autoMetric PAGES, P24) is ticked by hand, so it is in.
      where: { userId, archivedAt: null, recurrence: { not: null }, intrinsic: false, OR: [{ autoMetric: null }, { autoMetric: "PAGES" }], ...PERSONAL_BOARD },
      select: { id: true, title: true, recurrence: true, startDay: true, compulsory: true, compulsoryOnRest: true },
    }),
    prisma.taskInstance.findMany({
      where: { userId, day: { gte: dateColumn(sinceKey) }, template: { archivedAt: null, recurrence: { not: null }, ...PERSONAL_BOARD } },
      select: { templateId: true, day: true, status: true, repaired: true },
    }),
    launch != null ? prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true } }) : Promise.resolve(null),
    restFrom
      ? prisma.restDay.findMany({ where: { userId, day: { gte: dateColumn(restFrom), lte: dateColumn(today) } }, select: { day: true, kind: true, declaredAt: true, cancelledAt: true } })
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
  const settledThroughDay = isDutyLaunched(today, launch) && settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null;
  const freezeDays = new Set<DayKey>(freezeRows.map((r) => keyOfDateColumn(r.day)));
  const heldDays = new Set<DayKey>(freezeDays);
  if (restFrom) {
    const rest = restRows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
    for (const d of heldDaysOf(rest, restFrom, today)) heldDays.add(d);
  }
  const out: HabitStrengthFact[] = [];
  for (const t of templates) {
    const rule = parseRule(t.recurrence);
    if (!rule) continue;
    const start = keyOfDateColumn(t.startDay);
    if (start > before) continue;
    const list = byTemplate.get(t.id) ?? [];
    const opts: StreakOptions = launch == null ? {} : { settledThroughDay, heldDays: t.compulsory && t.compulsoryOnRest ? freezeDays : heldDays };
    out.push({
      id: t.id,
      title: t.title,
      before: habitStrength(rule, start, before, list.filter((i) => i.day <= before), opts),
      after: habitStrength(rule, start, today, list, opts),
    });
  }
  return out;
}

/** The life tracks' kept-week runs before and after the week judged inside this one; null before its verdict, or before life launched. */
async function readStreaks(userId: string, monday: DayKey, today: DayKey): Promise<DecayFacts["streaks"]> {
  const sunday = streakWeekOf(monday, today);
  if (!sunday || !isLaunched(today)) return null;
  const ledger = await loadLifeLedger(userId);
  if (ledger.epochDay == null) return null;
  const run = (day: DayKey) => trackStateAt(ledger, day).map((s) => ({ track: s.track, keptStreak: s.keptStreak }));
  return { before: run(addDays(sunday, -7)), after: run(sunday), sunday };
}

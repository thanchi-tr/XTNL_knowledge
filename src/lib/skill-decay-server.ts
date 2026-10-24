/**
 * Condition decay's read (server only; every rule and every word is skill-decay.ts's; blueprint P28, decisions D24 and
 * D24b). Read only: nothing here writes, pays, settles or judges, and nothing is ever stored, so a condition is derived
 * on every read and a thaw needs no write (scripts/skill-decay-check.ts pins that this file holds no ledger write and
 * imports no writer).
 *
 *   loadConditionBasis(userId, now?, deps?) → ConditionBasis | null
 *       Null at once, with no read, while condition decay is not in force: from the later of DECAY_LAUNCH_DAY and
 *       DUTY_LAUNCH_DAY (skill-decay decayFromOf; a rest, sick or vacation day is declared and held only once Duty is
 *       live), which is also the day idle days count from. Otherwise, through the process cache (keyed by that day and
 *       today, so the 04:00 turn reads afresh; cleared by every tick, walk, review and idea):
 *         tracks      each track's last practice: its latest TASK or WORKOUT row (sink TRACK) on or before today, net of
 *                     its 'undo:<id>' reversal (the families read's own rule), as Vitality, Duty, Craft and Care
 *         knowledge   the latest REVIEW or IDEA_CREATE row on or before today, as Intellect
 *         held        the Rest Token bank's own read (rest-tokens-server readRestTokens through yesterday): the declared
 *                     rest, sick and vacation days and the FREEZE_USE days (both from the Duty launch day, as the bank
 *                     reads them), and the days the fold's tokens held or covered, from the decay launch day on
 *       A skill's last practice is its own view's (competency.ts SkillView.lastDay), read with the skills.
 *
 *   loadConditionItems(userId, now?) → ConditionItem[] | null
 *       Every attribute's and live skill's condition (skill-decay conditionItemsOf over the basis and the Skills page's
 *       own read): the audit's condition source and the phone's /check `skills`. Null at once while decay is off.
 *
 * The reads are injectable (ConditionDeps), so the checks drive the composition with no database.
 */
import { prisma } from "./prisma";
import { cached } from "./cache";
import { addDays, dateColumn, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { isTrack } from "./life-grade";
import { readRestTokens } from "./rest-tokens-server";
import { restTokenFold } from "./rest-tokens";
import { SKILL_ATTRIBUTE_OF_TRACK } from "./competency";
import { loadSkills } from "./competency-server";
import { STATUS_KEYS, type StatusKey } from "./status-panel";
import { dutyLaunchDay } from "./duty-economy";
import { conditionItemsOf, decayFromOf, decayLaunchDay, decayOn, type ConditionBasis, type ConditionItem } from "./skill-decay";

/** What the basis reads, each injectable. */
export interface ConditionReads {
  /** Each track's last practice day on or before `today`. */
  trackDays: (userId: string, today: DayKey) => Promise<readonly { track: string; day: DayKey }[]>;
  /** The last review answered or idea added on or before `today`; null with none. */
  knowledgeDay: (userId: string, today: DayKey) => Promise<DayKey | null>;
  /** The held days from `launch` to the day before `today`. */
  heldDays: (userId: string, launch: DayKey, today: DayKey) => Promise<readonly DayKey[]>;
}

/** The real reads. */
export const prismaConditionReads: ConditionReads = {
  async trackDays(userId, today) {
    const rows = await prisma.$queryRaw<{ track: string | null; day: Date | null }[]>`
      SELECT e."track", MAX(e."day") AS "day"
      FROM "ActivityEvent" e
      WHERE e."userId" = ${userId} AND e."sink" = 'TRACK' AND e."track" IS NOT NULL AND e."source" IN ('TASK', 'WORKOUT') AND e."day" <= ${today}::date
        AND (e."dedupeKey" IS NULL OR e."dedupeKey" NOT LIKE 'undo:%')
        AND NOT EXISTS (SELECT 1 FROM "ActivityEvent" u WHERE u."userId" = e."userId" AND u."dedupeKey" = 'undo:' || e."id")
      GROUP BY e."track"
    `;
    return rows.flatMap((r) => (r.track && r.day ? [{ track: r.track, day: keyOfDateColumn(new Date(r.day)) }] : []));
  },
  async knowledgeDay(userId, today) {
    const r = await prisma.activityEvent.aggregate({ where: { userId, source: { in: ["REVIEW", "IDEA_CREATE"] }, day: { lte: dateColumn(today) } }, _max: { day: true } });
    return r._max.day ? keyOfDateColumn(r._max.day) : null;
  },
  async heldDays(userId, launch, today) {
    const yesterday = addDays(today, -1);
    if (yesterday < launch) return [];
    const t = await readRestTokens(prisma, userId, yesterday);
    if (!t) return [];
    const fold = restTokenFold(t, today, yesterday);
    const held = new Set<DayKey>([...t.rest, ...t.spent, ...fold.heldDays, ...fold.coveredDays]);
    return [...held].filter((d) => d >= launch && d < today).sort();
  },
};

export interface ConditionDeps {
  /**
   * The day condition decay is in force from (default decayFromOf(decayLaunchDay(), dutyLaunchDay()): the later of its
   * own launch day and Duty's); null: off. Idle days count from it.
   */
  launch?: DayKey | null;
  /** Injected reads (the checks): then nothing is cached. */
  reads?: Partial<ConditionReads>;
}

/** The basis: each attribute's last practice and the held days, read once. */
export async function readConditionBasis(userId: string, launch: DayKey, today: DayKey, reads: ConditionReads = prismaConditionReads): Promise<ConditionBasis> {
  const [tracks, knowledge, held] = await Promise.all([reads.trackDays(userId, today), reads.knowledgeDay(userId, today), reads.heldDays(userId, launch, today)]);
  const last = Object.fromEntries(STATUS_KEYS.map((k) => [k, null])) as Record<StatusKey, DayKey | null>;
  for (const r of tracks) {
    if (!isTrack(r.track) || r.day > today) continue;
    const key = SKILL_ATTRIBUTE_OF_TRACK[r.track];
    if (last[key] == null || r.day > last[key]!) last[key] = r.day;
  }
  last.INTELLECT = knowledge != null && knowledge <= today ? knowledge : null;
  return { launch, today, held: [...new Set(held)].filter((d) => d >= launch && d < today).sort(), last };
}

/** The basis on `now`'s life day, or null while condition decay is not in force (then nothing is read). */
export async function loadConditionBasis(userId: string, now: Date = new Date(), deps: ConditionDeps = {}): Promise<ConditionBasis | null> {
  // In force from the later of DECAY_LAUNCH_DAY and DUTY_LAUNCH_DAY: before Duty a day away can't be declared or held.
  const launch = deps.launch === undefined ? decayFromOf(decayLaunchDay(), dutyLaunchDay()) : deps.launch;
  const today = todayKey(now);
  if (launch == null || !decayOn(today, launch)) return null;
  if (deps.reads) return readConditionBasis(userId, launch, today, { ...prismaConditionReads, ...deps.reads });
  return cached(`conditions:${userId}:${launch}:${today}`, ["life", "activity", "ideas"], () => readConditionBasis(userId, launch, today));
}

/** Every attribute's and live skill's condition on `now`'s life day; null at once (nothing read) while decay is off. */
export async function loadConditionItems(userId: string, now: Date = new Date(), deps: ConditionDeps = {}): Promise<ConditionItem[] | null> {
  const basis = await loadConditionBasis(userId, now, deps);
  if (!basis) return null;
  const skills = await loadSkills(userId, { fields: false });
  return conditionItemsOf(basis, skills.skills);
}

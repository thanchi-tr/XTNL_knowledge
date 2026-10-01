/**
 * FROZEN CONTRACT (M5 lane 0 shell; lane A implements, F4) — the lazy,
 * idempotent weekly judgement: which closed life weeks are due a verdict,
 * whether each track kept its week, and what a kept week mints. The pure
 * analogue of a settlement plan; life-weeks-server.ts judgeClosedWeeks and
 * maybeJudgeWeeks (lane A) read the state, apply the plans and write.
 *
 * Spec: docs/life-plan/m5-refit.md F4; contract table:
 * docs/life-plan/m5-contracts.md. Pure and client-importable: life-day,
 * life-economy, recurrence (occurrencesBetween) and habit (instanceOutcome,
 * the one kept/held/missed rule), all pure; no Prisma, no clock.
 *
 * Week W (Monday–Sunday life days, ISO week key 'YYYY-Www') is judged from
 * Wednesday 04:00 after its Sunday, so a Sunday recorded on Monday (the
 * record window) and M2's 48-hour make-ups are always in before the verdict.
 * One WEEK row per (track, week) — dedupeKey 'week:<TRACK>:<YYYY-Www>', qty 1
 * kept or 0, sink NONE, day = the Sunday, detail = the reason line — and,
 * for a kept week whose Sunday is on or after the launch day, one
 * LIFE_WEEK_KEPT mint of 1.5 MP within the 8 MP life-week cap. Re-planning
 * after applying a plan yields nothing.
 *
 * Exports (frozen):
 *
 *   Shapes        WeekTaskRow · WeekTemplate · WeekInstance · WeekMintRow · WeekJudgeState
 *                 WeekTrackPlan · WeekPlan
 *   Final (lane 0) lastJudgeableSunday(today) · judgeDayOf(sunday)
 *   Lane A (F4)   planWeeks(state)
 *   Added (lane A, compatible) WeekToJudge · weeksToJudge(today, epochDay, judged, maxWeeks?):
 *                 the weeks a run covers, so the server reads exactly their days
 *
 * M2's rest days arrive as heldDays: an occurrence on a held day with no
 * instance holds instead of missing (empty, so inert, in M5).
 */
import { instanceOutcome } from "./habit";
import { addDays, weekKeyOf, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import {
  BACKFILL_PREFIX,
  BODY_EFFORT_MINUTES,
  DUTY_FALLBACK_COMPLETIONS,
  DUTY_MIN_OCCURRENCES,
  EFFORT_CATEGORY,
  KEPT_MIN_DAYS,
  KEPT_MIN_RAW,
  LIFE_MP,
  WEEK_JUDGE_LAG_DAYS,
  WEEK_JUDGE_MAX_WEEKS,
  cappedMp,
  effortWeightOfB,
  isCappedReason,
  round2,
  weekIsBackfill,
  weekKeptMintKey,
  weekRowKey,
  type LifeMintInput,
} from "./life-economy";
import { TRACKS, type Category, type InstanceStatus, type Receipt, type TaskKind, type Track } from "./life-types";
import { WEEKDAY_SHORT, occurrencesBetween, parseRule } from "./recurrence";

// ── State (one fresh read per run) ────────────────────────────────────────

/** A TASK or UNDO row with sink TRACK, joined to its template's category. */
export interface WeekTaskRow {
  id: string;
  source: "TASK" | "UNDO";
  /** An UNDO's 'undo:<id>' names the TASK row it takes back; UNDO rows count for nothing else. */
  dedupeKey: string | null;
  day: DayKey;
  track: Track;
  templateId: string | null;
  rawXp: number;
  /** The paying receipt: its B factor and minutes give BODY's effort minutes. */
  receipt: Receipt | null;
  /** TaskTemplate.category; only EXERCISE counts toward effort minutes. null when the template is gone. */
  category: Category | null;
}

/** A compulsory TASK or HABIT template (archived ones included), for DUTY's occurrences. */
export interface WeekTemplate {
  id: string;
  kind: TaskKind;
  /** recurrence.ts grammar; null for a one-off. */
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  /** The life day it was archived; occurrences on and after it are not counted. */
  archivedDay: DayKey | null;
}

export interface WeekInstance {
  templateId: string;
  day: DayKey;
  status: InstanceStatus;
}

/** An MP_MINT row dated in the range; reason from life-economy parseMintDetail. */
export interface WeekMintRow {
  day: DayKey;
  qty: number;
  reason: string;
}

export interface WeekJudgeState {
  today: DayKey;
  /** life-economy lifeLaunchDay(). Null plans nothing. */
  launchDay: DayKey | null;
  /** LifeSettings.epochDay. Null plans nothing; the epoch week counts its days ≥ epochDay only. */
  epochDay: DayKey | null;
  /** Dedupe keys of the WEEK rows already written ('week:<TRACK>:<YYYY-Www>'). */
  judged: ReadonlySet<string>;
  rows: readonly WeekTaskRow[];
  templates: readonly WeekTemplate[];
  instances: readonly WeekInstance[];
  mints: readonly WeekMintRow[];
  /** Days held by rest, sickness or vacation: empty in M5 (M2 fills it from RestDay). */
  heldDays: ReadonlySet<DayKey>;
  /** Weeks per run; defaults to WEEK_JUDGE_MAX_WEEKS (12). */
  maxWeeks?: number;
}

// ── Plans ─────────────────────────────────────────────────────────────────

export interface WeekTrackPlan {
  track: Track;
  kept: boolean;
  /** 'Kept · 4 days · 52.0 raw XP' or 'Not kept · …', with BACKFILL_PREFIX before launch. */
  detail: string;
}

export interface WeekPlan {
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
  /** sunday < launchDay: written for depth, never minted. */
  backfill: boolean;
  /** Only the tracks still missing their WEEK row, in TRACKS order (BODY, DUTY, CRAFT, CARE). */
  tracks: WeekTrackPlan[];
  /** LIFE_WEEK_KEPT mints for kept tracks, in TRACKS order, within the week's cap. Empty for backfill. */
  mints: LifeMintInput[];
}

// ── Final helpers (lane 0) ────────────────────────────────────────────────

/**
 * The latest Sunday whose week may be judged today: the Sunday on or before
 * today − 3. On Tuesday the week that ended two days ago is not yet
 * judgeable; from Wednesday it is.
 */
export function lastJudgeableSunday(today: DayKey): DayKey {
  const d = addDays(today, -WEEK_JUDGE_LAG_DAYS);
  const dow = weekdayOf(d);
  return dow === 7 ? d : addDays(d, -dow);
}

/** The life day a week ending on `sunday` is first judged: the Wednesday after it. */
export function judgeDayOf(sunday: DayKey): DayKey {
  return addDays(sunday, WEEK_JUDGE_LAG_DAYS);
}

// ── Lane A (F4) ───────────────────────────────────────────────────────────

/** A week still due a verdict: its key, its days and the tracks without a WEEK row. */
export interface WeekToJudge {
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
  missing: Track[];
}

/**
 * Which weeks a run judges, oldest first: every week from the epoch's week
 * to the week of lastJudgeableSunday(today) that still misses a track's WEEK
 * row, at most maxWeeks. Empty when epochDay is null. planWeeks plans exactly
 * these; life-weeks-server.ts reads exactly their days.
 */
export function weeksToJudge(
  today: DayKey,
  epochDay: DayKey | null,
  judged: ReadonlySet<string>,
  maxWeeks: number = WEEK_JUDGE_MAX_WEEKS
): WeekToJudge[] {
  if (!epochDay) return [];
  const last = lastJudgeableSunday(today);
  const limit = Math.max(0, Math.floor(maxWeeks));
  const out: WeekToJudge[] = [];
  for (let monday = weekStartKeyOf(epochDay); addDays(monday, 6) <= last && out.length < limit; monday = addDays(monday, 7)) {
    const weekKey = weekKeyOf(monday);
    const missing = TRACKS.filter((t) => !judged.has(weekRowKey(t, weekKey)));
    if (missing.length > 0) out.push({ weekKey, monday, sunday: addDays(monday, 6), missing });
  }
  return out;
}

/** What one track did in one week, from its live TASK rows (undone ticks excluded). */
interface TrackWeek {
  days: number;
  completions: number;
  raw: number;
  /** BODY: Σ receipt minutes × effortWeightOfB(B) over EXERCISE rows. */
  effortMinutes: number;
}

/** One compulsory occurrence in the week and what became of it. day is null for a weekly target's (no one day owns it). */
interface Occurrence {
  day: DayKey | null;
  outcome: "kept" | "held" | "missed";
}

const plural = (n: number, one: string, many: string = `${one}s`): string => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const rawText = (x: number): string => x.toFixed(1);

/** The B factor of a paying receipt (the band base: 5, 10, 20, 35), or NaN. */
function bFactorOf(receipt: Receipt | null): number {
  const b = receipt?.factors?.find((f) => f.key === "B");
  return typeof b?.value === "number" ? b.value : Number.NaN;
}

/** Live TASK rows per track and day, for a week's [from, to]: the judge's only view of activity. */
function trackWeekOf(rows: readonly WeekTaskRow[], track: Track, from: DayKey, to: DayKey): TrackWeek {
  const days = new Set<DayKey>();
  let completions = 0;
  let raw = 0;
  let effort = 0;
  for (const r of rows) {
    if (r.track !== track || r.day < from || r.day > to) continue;
    days.add(r.day);
    completions += 1;
    if (Number.isFinite(r.rawXp)) raw += r.rawXp;
    if (track === "BODY" && r.category === EFFORT_CATEGORY && r.receipt) {
      const minutes = Number(r.receipt.minutes);
      if (Number.isFinite(minutes) && minutes > 0) effort += minutes * effortWeightOfB(bFactorOf(r.receipt));
    }
  }
  return { days: days.size, completions, raw: round2(raw), effortMinutes: Math.round(effort) };
}

/** Statuses of each template's instances, by day. */
function instancesByTemplate(instances: readonly WeekInstance[]): Map<string, Map<DayKey, string[]>> {
  const out = new Map<string, Map<DayKey, string[]>>();
  for (const i of instances) {
    let days = out.get(i.templateId);
    if (!days) out.set(i.templateId, (days = new Map()));
    const list = days.get(i.day);
    if (list) list.push(i.status);
    else days.set(i.day, [i.status]);
  }
  return out;
}

const minKey = (a: DayKey, b: DayKey): DayKey => (a < b ? a : b);
const maxKey = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);

/**
 * DUTY's compulsory occurrences in the week, over every compulsory TASK or
 * HABIT template on any track, on days ≥ max(startDay, epochDay) and before
 * the day it was archived:
 *   - a fixed schedule: its occurrencesBetween days, each read by
 *     instanceOutcome; no instance is missed (a held day — M2's rest — holds);
 *   - TARGET:n/W: n occurrences, kept = min(n, kept days), held = min(n −
 *     kept, held days), the rest missed; skipped the week it started after
 *     Monday or was archived in; a monthly target is not judged weekly;
 *   - a compulsory one-off due in the week: one occurrence, kept or held by
 *     an instance on or before its due day, else missed.
 */
function dutyOccurrences(
  templates: readonly WeekTemplate[],
  byTemplate: Map<string, Map<DayKey, string[]>>,
  heldDays: ReadonlySet<DayKey>,
  epochDay: DayKey,
  monday: DayKey,
  sunday: DayKey
): Occurrence[] {
  const out: Occurrence[] = [];
  const noInstance = (day: DayKey): Occurrence["outcome"] => (heldDays.has(day) ? "held" : "missed");
  for (const t of templates) {
    if (t.kind !== "TASK" && t.kind !== "HABIT") continue;
    const start = maxKey(t.startDay, epochDay);
    const from = maxKey(monday, start);
    const to = t.archivedDay ? minKey(sunday, addDays(t.archivedDay, -1)) : sunday;
    if (from > to) continue;
    const days = byTemplate.get(t.id) ?? new Map<DayKey, string[]>();
    const rule = parseRule(t.recurrence);

    if (!rule) {
      if (!t.dueDay || t.dueDay < from || t.dueDay > to) continue;
      const statuses: string[] = [];
      for (const [day, list] of days) if (day <= t.dueDay) statuses.push(...list);
      out.push({ day: t.dueDay, outcome: instanceOutcome(statuses) ?? noInstance(t.dueDay) });
      continue;
    }

    if (rule.kind === "TARGET") {
      if (rule.per !== "W" || start > monday || (t.archivedDay && t.archivedDay <= sunday)) continue;
      let keptDays = 0;
      let heldCount = 0;
      for (let d = monday; d <= sunday; d = addDays(d, 1)) {
        const o = instanceOutcome(days.get(d));
        if (o === "kept") keptDays += 1;
        else if (o === "held" || (o === null && heldDays.has(d))) heldCount += 1;
      }
      const kept = Math.min(rule.n, keptDays);
      const held = Math.min(rule.n - kept, heldCount);
      for (let i = 0; i < rule.n; i++) out.push({ day: null, outcome: i < kept ? "kept" : i < kept + held ? "held" : "missed" });
      continue;
    }

    // AFTER has no fixed day to miss (it can never be compulsory); occurrencesBetween returns none for it.
    for (const day of occurrencesBetween(rule, t.startDay, from, to)) {
      out.push({ day, outcome: instanceOutcome(days.get(day)) ?? noInstance(day) });
    }
  }
  return out;
}

/** '1 must missed (Tue)', '3 musts missed (Mon, Thu)', '2 musts missed (weekly target)'. */
function mustsMissedText(missed: readonly Occurrence[]): string {
  const days = [...new Set(missed.flatMap((o) => (o.day ? [o.day] : [])))].sort();
  const where: string[] = days.map((d) => WEEKDAY_SHORT[weekdayOf(d) - 1]);
  if (missed.some((o) => o.day === null)) where.push("weekly target");
  return `${plural(missed.length, "must")} missed (${where.join(", ")})`;
}

/**
 * One track's verdict and its reason line:
 *   kept      'Kept · 4 days · 52.0 raw XP' (BODY + ' · 180 effort min'; DUTY + ' · 5 musts kept' when there were musts)
 *   not kept  'Not kept · ' + the failing parts, in the order '2 of 3 days', '12.0 of 30 raw XP',
 *             '90 of 150 effort min', '1 must missed (Tue)', '4 of 5 completions'
 * CRAFT, CARE: days ≥ 3 and raw ≥ 30. BODY: also effort ≥ 150 (EXERCISE receipts only).
 * DUTY: any missed must breaks the week; with ≥ 3 musts it needs raw ≥ 30; with
 * 0–2 (none missed), ≥ 5 completions on ≥ 3 days and raw ≥ 30.
 */
function judgeTrack(track: Track, w: TrackWeek, occ: readonly Occurrence[]): { kept: boolean; detail: string } {
  const daysOk = w.days >= KEPT_MIN_DAYS;
  const rawOk = w.raw >= KEPT_MIN_RAW;
  const daysPart = `${w.days} of ${KEPT_MIN_DAYS} days`;
  const rawPart = `${rawText(w.raw)} of ${KEPT_MIN_RAW} raw XP`;
  const keptHead = `Kept · ${plural(w.days, "day")} · ${rawText(w.raw)} raw XP`;

  if (track === "BODY") {
    const effortOk = w.effortMinutes >= BODY_EFFORT_MINUTES;
    if (daysOk && rawOk && effortOk) return { kept: true, detail: `${keptHead} · ${w.effortMinutes} effort min` };
    const parts = [!daysOk && daysPart, !rawOk && rawPart, !effortOk && `${w.effortMinutes} of ${BODY_EFFORT_MINUTES} effort min`];
    return { kept: false, detail: `Not kept · ${parts.filter(Boolean).join(" · ")}` };
  }

  if (track === "DUTY") {
    const missed = occ.filter((o) => o.outcome === "missed");
    if (missed.length > 0) return { kept: false, detail: `Not kept · ${mustsMissedText(missed)}` };
    const keptMusts = occ.filter((o) => o.outcome === "kept").length;
    const heldMusts = occ.length - keptMusts;
    const mustsPart =
      occ.length === 0
        ? ""
        : keptMusts === 0
          ? ` · ${plural(heldMusts, "must")} held`
          : ` · ${plural(keptMusts, "must")} kept${heldMusts > 0 ? `, ${heldMusts} held` : ""}`;
    if (occ.length >= DUTY_MIN_OCCURRENCES) {
      return rawOk ? { kept: true, detail: `${keptHead}${mustsPart}` } : { kept: false, detail: `Not kept · ${rawPart}` };
    }
    const completionsOk = w.completions >= DUTY_FALLBACK_COMPLETIONS;
    if (completionsOk && daysOk && rawOk) return { kept: true, detail: `${keptHead}${mustsPart}` };
    const parts = [!daysOk && daysPart, !rawOk && rawPart, !completionsOk && `${w.completions} of ${DUTY_FALLBACK_COMPLETIONS} completions`];
    return { kept: false, detail: `Not kept · ${parts.filter(Boolean).join(" · ")}` };
  }

  if (daysOk && rawOk) return { kept: true, detail: keptHead };
  return { kept: false, detail: `Not kept · ${[!daysOk && daysPart, !rawOk && rawPart].filter(Boolean).join(" · ")}` };
}

/**
 * The weeks to judge, oldest first: from weekKeyOf(epochDay) to the week of
 * lastJudgeableSunday(today), skipping tracks already judged, at most
 * maxWeeks. Empty when launchDay or epochDay is null.
 *
 * Per week: each missing track's verdict from the live TASK rows dated in
 * the week (the epoch week from epochDay on), and — unless the week is
 * backfill (its Sunday before the launch day: 'backfill · ' reason, no MP) —
 * one LIFE_WEEK_KEPT mint per kept track in TRACKS order, dated the Sunday,
 * each round2(min(1.5, 8 − used)) where used is the capped MP already dated
 * in the week (Short goals closed that week first). In M5 a week holds at
 * most 2 × 1 + 4 × 1.5 = 8, so nothing is trimmed until M2's full days.
 */
export function planWeeks(state: WeekJudgeState): WeekPlan[] {
  const { launchDay, epochDay } = state;
  if (!launchDay || !epochDay) return [];
  const weeks = weeksToJudge(state.today, epochDay, state.judged, state.maxWeeks ?? WEEK_JUDGE_MAX_WEEKS);
  if (weeks.length === 0) return [];

  // An UNDO 'undo:<id>' takes TASK row <id> back; UNDO rows count for nothing else.
  const undone = new Set<string>();
  for (const r of state.rows) if (r.source === "UNDO" && r.dedupeKey?.startsWith("undo:")) undone.add(r.dedupeKey.slice(5));
  const live = state.rows.filter((r) => r.source === "TASK" && !undone.has(r.id));
  const byTemplate = instancesByTemplate(state.instances);

  return weeks.map(({ weekKey, monday, sunday, missing }) => {
    const from = maxKey(monday, epochDay);
    const backfill = weekIsBackfill(sunday, launchDay);
    const occ = missing.includes("DUTY") ? dutyOccurrences(state.templates, byTemplate, state.heldDays, epochDay, monday, sunday) : [];
    const tracks: WeekTrackPlan[] = missing.map((track) => {
      const verdict = judgeTrack(track, trackWeekOf(live, track, from, sunday), track === "DUTY" ? occ : []);
      return { track, kept: verdict.kept, detail: backfill ? `${BACKFILL_PREFIX}${verdict.detail}` : verdict.detail };
    });

    const mints: LifeMintInput[] = [];
    if (!backfill) {
      let used = 0;
      for (const m of state.mints) {
        if (m.day >= monday && m.day <= sunday && isCappedReason(m.reason) && Number.isFinite(m.qty)) used += Math.max(0, m.qty);
      }
      used = round2(used);
      for (const t of tracks) {
        if (!t.kept) continue;
        const delta = cappedMp(LIFE_MP.WEEK_KEPT, used);
        if (!(delta > 0)) continue;
        mints.push({
          reason: "LIFE_WEEK_KEPT",
          delta,
          why: `kept week ${weekKey}${delta < LIFE_MP.WEEK_KEPT ? " · trimmed by the weekly cap" : ""}`,
          dedupeKey: weekKeptMintKey(t.track, weekKey),
          day: sunday,
          track: t.track,
        });
        used = round2(used + delta);
      }
    }
    return { weekKey, monday, sunday, backfill, tracks, mints };
  });
}

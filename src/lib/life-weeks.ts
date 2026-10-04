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
 * the one kept/held/missed rule), all pure; no Prisma, no clock. M2 adds
 * duty-economy and duty-rule, both pure.
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
 *   Added (M5 review C2) ledgerWithPlans(ledger, plans): the ledger as it will read once the
 *                 plans are written, for the launch script's dry run
 *
 * M2 (lane B, a compatible change; m2-refit.md decisions 5, 6, 15, 16, 18, 20, 21, 31 and F11).
 * Every addition is optional, so every M5 state and fixture judges exactly as before:
 *
 *   Duty weeks     A week whose Sunday is on or after DUTY_LAUNCH_DAY (WeekJudgeState.dutyLaunchDay)
 *                  is a Duty week. Every earlier week, and every week while there is no Duty
 *                  launch day, is judged by the M5 rules unchanged.
 *   The DUTY gate  DutyGate · isDutyWeek(sunday, dutyLaunchDay) · dutyGated(sunday, today, gate):
 *                  a Duty week's DUTY row (and its full-day mints) waits until settlement has
 *                  settled its Sunday (duty-economy settledFor(sunday, cursor, firstDutyDay), the
 *                  one settled-day rule). BODY, CRAFT and CARE never wait. weeksToJudge(…, gate?)
 *                  leaves a gated DUTY out of `missing` and skips a week with nothing else
 *                  missing, so a stuck settlement never stops the others.
 *   Musts          In a Duty week DUTY's occurrences read the rule on each day (duty-rule ruleOn,
 *                  expectedOn: pending changes, prior segments, inbox items never expected),
 *                  TARGET units through habit.ts targetUnits (made-up slots count), a deadline
 *                  one-off kept when it is done (DONE, DONE_LATE or DONE_MVV, whichever path) by
 *                  dueDay + 2 or repaired on its due day (decision 18, settlement's rule), and the
 *                  held days read per day as settlement does: a freeze day holds every must, a
 *                  rest day every must not 'Even on rest days' under the rule on that day.
 *   Held weeks     restDays (declared rest, sick, vacation) pro-rate the floors (life-economy
 *                  keptFloorsOf); a track whose floors are not met is 'held' when the week has
 *                  ≥ 5 rest days (WEEK qty 0, receipt {mark: 'held', restDays}, 'Held · 5 rest
 *                  days'); a missed must is never held. A held week mints nothing.
 *   Full days      In the run that writes a Duty week's DUTY row, one 'mp:LIFE_FULL_DAY:<d>'
 *                  mint per settled full day (fullDays), after the kept tracks, in day order,
 *                  inside the cap; a trimmed one is a qty-0 decision row.
 *   WeekTemplate gains compulsory?, compulsoryOnRest?, inbox?, dueKind?, pendingChange?;
 *   WeekInstance gains repaired?; WeekMintRow gains key?; WeekJudgeState gains dutyLaunchDay?,
 *   settledThroughDay?, restDays?, fullDays?; WeekTrackPlan gains held? and restDays?.
 */
import { instanceOutcome, targetUnits } from "./habit";
import { addDays, weekKeyOf, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import {
  BACKFILL_PREFIX,
  EFFORT_CATEGORY,
  DUTY_MIN_OCCURRENCES,
  HELD_PREFIX,
  HELD_WEEK_REST_DAYS,
  LIFE_MP,
  WEEK_JUDGE_LAG_DAYS,
  WEEK_JUDGE_MAX_WEEKS,
  cappedMp,
  effortWeightOfB,
  isCappedReason,
  keptFloorsOf,
  round2,
  weekIsBackfill,
  weekKeptMintKey,
  weekRowKey,
  type KeptFloors,
  type LifeMintInput,
} from "./life-economy";
import { MAKEUP_RESTORE_DAYS, firstDutyDay, fullDayMintKey, isDutyLaunched, settledFor } from "./duty-economy";
import { expectedOn, ruleOn, type DutyTemplate } from "./duty-rule";
import { TRACKS, type Category, type InstanceStatus, type Receipt, type TaskKind, type Track } from "./life-types";
import type { LifeLedger } from "./life-tracks";
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

/**
 * A compulsory TASK or HABIT template (archived ones included), for DUTY's
 * occurrences. M2 also reads every template with a pendingChange (decision
 * 16), each judged per day through ruleOn. The M2 fields are optional; absent
 * they read as the M5 read did: compulsory, not compulsoryOnRest, not in the
 * inbox, a one-off's due kind DEADLINE, no rule history.
 */
export interface WeekTemplate {
  id: string;
  kind: TaskKind;
  /** recurrence.ts grammar; null for a one-off. */
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  /** The life day it was archived; occurrences on and after it are not counted. */
  archivedDay: DayKey | null;
  /** M2: TaskTemplate.compulsory (the column; ruleOn applies the history). Absent: true. */
  compulsory?: boolean;
  /** M2: 'Even on rest days': a rest day does not hold it; only a freeze day does. Absent: false. */
  compulsoryOnRest?: boolean;
  /** M2: an unclarified inbox item is never expected (decision 31). Absent: false. */
  inbox?: boolean;
  /** M2: PLANNED | DEADLINE; only a DEADLINE one-off is a must. Absent: DEADLINE for a one-off. */
  dueKind?: string | null;
  /** M2: TaskTemplate.pendingChange (raw Json or parsed), read by duty-rule ruleOn. */
  pendingChange?: unknown;
}

export interface WeekInstance {
  templateId: string;
  day: DayKey;
  status: InstanceStatus;
  /** M2: TaskInstance.repaired, a make-up inside the restore window (a TARGET make-up slot is its own unit). */
  repaired?: boolean;
}

/** An MP_MINT row dated in the range; reason from life-economy parseMintDetail. */
export interface WeekMintRow {
  day: DayKey;
  qty: number;
  reason: string;
  /** M2: its dedupe key, so a full-day mint already written is never planned again. */
  key?: string | null;
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
  /** Days held: M2's rest, sick and vacation days (restDays) plus freeze days (FREEZE_USE). Empty in M5. */
  heldDays: ReadonlySet<DayKey>;
  /** Weeks per run; defaults to WEEK_JUDGE_MAX_WEEKS (12). */
  maxWeeks?: number;
  /** M2: duty-economy dutyLaunchDay(). Null or absent: no Duty week, every week judged as in M5. */
  dutyLaunchDay?: DayKey | null;
  /** M2: LifeSettings.settledThroughDay, the settlement cursor (the DUTY gate, decision 5). */
  settledThroughDay?: DayKey | null;
  /** M2: duty-rule heldDaysOf over RestDay rows (no freeze days): what pro-rates the floors. */
  restDays?: ReadonlySet<DayKey>;
  /** M2: the days with a FULL_DAY row (settled full days), for the full-day mints (decision 6). */
  fullDays?: readonly DayKey[];
}

// ── Plans ─────────────────────────────────────────────────────────────────

export interface WeekTrackPlan {
  track: Track;
  kept: boolean;
  /** 'Kept · 4 days · 52.0 raw XP' or 'Not kept · …', with BACKFILL_PREFIX before launch. M2: 'Held · 5 rest days'. */
  detail: string;
  /** M2: held, not kept (qty 0, receipt {mark: 'held', restDays}). Absent: not held. */
  held?: boolean;
  /** M2: the week's rest days, on a held track. */
  restDays?: number;
}

export interface WeekPlan {
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
  /** sunday < launchDay: written for depth, never minted. */
  backfill: boolean;
  /** Only the tracks still missing their WEEK row, in TRACKS order (BODY, DUTY, CRAFT, CARE). */
  tracks: WeekTrackPlan[];
  /**
   * LIFE_WEEK_KEPT mints for kept tracks, in TRACKS order, within the week's
   * cap; then (M2, in the run that writes DUTY) one LIFE_FULL_DAY mint per
   * full day, in day order. Empty for backfill.
   */
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

// ── The DUTY gate (M2, decision 5) ────────────────────────────────────────

/** What the DUTY gate reads: the Duty launch day, the settlement cursor and (for settledFor's floor) the epoch. */
export interface DutyGate {
  dutyLaunchDay?: DayKey | null;
  settledThroughDay?: DayKey | null;
  /** LifeSettings.epochDay: the floor is firstDutyDay(epochDay). Absent: the launch day is the floor. weeksToJudge fills it. */
  epochDay?: DayKey | null;
}

/** A Duty week: its Sunday is on or after DUTY_LAUNCH_DAY (a Monday, so the week is wholly M2). */
export function isDutyWeek(sunday: DayKey, dutyLaunchDay: DayKey | null | undefined): boolean {
  return dutyLaunchDay != null && sunday >= dutyLaunchDay;
}

/**
 * Whether the week ending `sunday` must wait for settlement before its DUTY
 * row (and its full-day mints) is planned: a Duty week, Duty launched on
 * `today`, and its Sunday not yet settled under the one settled-day rule,
 * duty-economy settledFor(sunday, cursor, firstDutyDay(epochDay)) (a null
 * cursor settles nothing). A Duty week's Sunday is never before that floor
 * (it is ≥ the launch day, and the judge starts at the epoch's week), so the
 * floor only keeps this check the same rule as every other.
 */
export function dutyGated(sunday: DayKey, today: DayKey, gate: DutyGate | null | undefined): boolean {
  const launch = gate?.dutyLaunchDay ?? null;
  if (!isDutyWeek(sunday, launch) || !isDutyLaunched(today, launch)) return false;
  const floor = firstDutyDay(gate?.epochDay ?? launch!, launch);
  return !settledFor(sunday, gate?.settledThroughDay ?? null, floor);
}

// ── Lane A (F4) ───────────────────────────────────────────────────────────

/** A week still due a verdict: its key, its days and the tracks without a WEEK row. */
export interface WeekToJudge {
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
  /** The tracks without a WEEK row that may be judged now (M2: a gated DUTY is left out). */
  missing: Track[];
}

/**
 * Which weeks a run judges, oldest first: every week from the epoch's week
 * to the week of lastJudgeableSunday(today) that still misses a track's WEEK
 * row, at most maxWeeks. Empty when epochDay is null. planWeeks plans exactly
 * these; life-weeks-server.ts reads exactly their days.
 *
 * M2: with a gate, a Duty week whose Sunday is not settled leaves DUTY out of
 * `missing` (it waits for settlement) and is skipped when nothing else is
 * missing, so it never holds a place in the run. Without a gate (or without a
 * Duty launch day) this is the M5 function exactly.
 */
export function weeksToJudge(
  today: DayKey,
  epochDay: DayKey | null,
  judged: ReadonlySet<string>,
  maxWeeks: number = WEEK_JUDGE_MAX_WEEKS,
  gate?: DutyGate | null
): WeekToJudge[] {
  if (!epochDay) return [];
  const last = lastJudgeableSunday(today);
  const limit = Math.max(0, Math.floor(maxWeeks));
  const out: WeekToJudge[] = [];
  const g: DutyGate | null = gate ? { ...gate, epochDay: gate.epochDay ?? epochDay } : null;
  for (let monday = weekStartKeyOf(epochDay); addDays(monday, 6) <= last && out.length < limit; monday = addDays(monday, 7)) {
    const weekKey = weekKeyOf(monday);
    const sunday = addDays(monday, 6);
    const held = dutyGated(sunday, today, g);
    const missing = TRACKS.filter((t) => !judged.has(weekRowKey(t, weekKey)) && !(held && t === "DUTY"));
    if (missing.length > 0) out.push({ weekKey, monday, sunday, missing });
  }
  return out;
}

/**
 * The ledger as loadLifeLedger will read it once `plans` are written: a copy
 * with each planned WEEK row (kept or not, its reason line) and each planned
 * LIFE_WEEK_KEPT mint (dated the Sunday) folded in. A row the ledger already
 * holds (by week and track, or by mint key) is not added twice. The launch
 * script's dry run computes its tracks, character level, title, attributes,
 * emblems and decay from this, so its figures are what --apply writes.
 */
export function ledgerWithPlans(ledger: LifeLedger, plans: readonly WeekPlan[]): LifeLedger {
  const haveWeek = new Set(ledger.weeks.map((w) => weekRowKey(w.track, w.weekKey)));
  const haveMint = new Set(ledger.mints.map((m) => m.key));
  const weeks = [...ledger.weeks];
  const mints = [...ledger.mints];
  for (const p of plans) {
    for (const t of p.tracks) {
      const key = weekRowKey(t.track, p.weekKey);
      if (haveWeek.has(key)) continue;
      haveWeek.add(key);
      weeks.push({ track: t.track, weekKey: p.weekKey, sunday: p.sunday, kept: t.kept, detail: t.detail, ...(t.held ? { held: true } : {}) });
    }
    for (const m of p.mints) {
      if (haveMint.has(m.dedupeKey)) continue;
      haveMint.add(m.dedupeKey);
      mints.push({ key: m.dedupeKey, track: m.track ?? null, templateId: m.templateId ?? null, day: m.day, qty: m.delta, reason: m.reason, why: m.why ?? null });
    }
  }
  return { ...ledger, weeks, mints };
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
/** A floor as the reason line states it: 30 and 150 as whole numbers, a pro-rated 21.4 or 107.1 to one decimal. */
const floorText = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));

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

/** Each template's instances, as they are (M2's TARGET units need the slots and their repaired flag). */
function instanceListsByTemplate(instances: readonly WeekInstance[]): Map<string, WeekInstance[]> {
  const out = new Map<string, WeekInstance[]>();
  for (const i of instances) {
    const list = out.get(i.templateId);
    if (list) list.push(i);
    else out.set(i.templateId, [i]);
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
 * The M5 rules: every week that is not a Duty week (M2) is judged by these,
 * unchanged.
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
    // The M5 read was compulsory templates only; M2 also reads templates with a pendingChange.
    if (t.compulsory === false) continue;
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

/** A WeekTemplate as duty-rule reads it, with the M5 read's defaults for absent M2 fields. */
function dutyTemplateOf(t: WeekTemplate): DutyTemplate {
  return {
    kind: t.kind,
    recurrence: t.recurrence,
    startDay: t.startDay,
    dueDay: t.dueDay,
    dueKind: t.dueKind !== undefined ? t.dueKind : t.recurrence ? null : "DEADLINE",
    compulsory: t.compulsory ?? true,
    compulsoryOnRest: t.compulsoryOnRest ?? false,
    inbox: t.inbox ?? false,
    archivedDay: t.archivedDay,
    pendingChange: t.pendingChange,
  };
}

/** The statuses that do a deadline one-off: settlement-plan's DONE_STATUSES (a late make-up's MADE_UP is not one). */
const DEADLINE_DONE: ReadonlySet<string> = new Set<string>(["DONE", "DONE_LATE", "DONE_MVV"]);

/**
 * The statuses that decide a compulsory DEADLINE one-off due on `due` in a
 * Duty week (decision 18, one rule with settlement): every instance dated on
 * or before the due day (settlement's MISSED or EXCUSED, a make-up that
 * repaired it), plus every done one (DONE, DONE_LATE or DONE_MVV, whichever
 * path recorded it — a late minimum included) dated by dueDay + 2, the
 * restore window. Settlement charges nothing for a one-off done before its
 * due day settles, and the judge then counts it kept (DONE, DONE_LATE) or
 * held (DONE_MVV), as on time. A tick after dueDay + 2 is outside the
 * window: the judge never counts it (m2-refit.md F4's tests: "done on
 * d + 3 before settlement ran owes nothing (and the judge will not count it
 * kept)").
 */
function deadlineStatusesOf(list: readonly WeekInstance[], due: DayKey): string[] {
  const lastLate = addDays(due, MAKEUP_RESTORE_DAYS);
  return list.filter((i) => i.day <= due || (DEADLINE_DONE.has(i.status) && i.day <= lastLate)).map((i) => i.status);
}

/**
 * DUTY's occurrences in a Duty week (M2, F11). The same three kinds as
 * dutyOccurrences, read through the rule in force on each day:
 *   - a fixed schedule: every day d of the week (d ≥ max(startDay, epochDay))
 *     with ruleOn(t, d).compulsory and expectedOn(t, d) — so a weakening that
 *     took effect on Thursday still owes Monday to Wednesday, a pending archive
 *     owes nothing from its effective day, and an inbox item is never owed;
 *   - TARGET:n/W, compulsory under the rule on both Monday and Sunday (the
 *     whole period: a weakening before the close drops it, a strengthening
 *     mid-week is never retroactive): habit.ts targetUnits, so each made-up
 *     slot is its own unit and a MADE_UP slot counts nothing; its held days
 *     are read per day (settlement-plan step 6's set): a freeze day, and a
 *     rest day on which the rule in force was not 'Even on rest days';
 *   - a DEADLINE one-off compulsory on its due day (decision 18): decided by
 *     its instances on or before the due day (a make-up repairs the due
 *     day's own instance) and by a done one (DONE, DONE_LATE or DONE_MVV,
 *     whichever path: a late minimum too) dated by dueDay + 2.
 * With no instance an occurrence is held on a held day (heldOn: a freeze
 * day; a rest day unless that day's rule is 'Even on rest days') and missed
 * otherwise. Once settlement has settled the week (the gate) every expected
 * occurrence has its instance.
 */
function dutyOccurrencesM2(
  templates: readonly WeekTemplate[],
  byTemplate: Map<string, Map<DayKey, string[]>>,
  lists: Map<string, WeekInstance[]>,
  heldDays: ReadonlySet<DayKey>,
  restDays: ReadonlySet<DayKey>,
  epochDay: DayKey,
  monday: DayKey,
  sunday: DayKey
): Occurrence[] {
  const out: Occurrence[] = [];
  const freezeDays = new Set<DayKey>([...heldDays].filter((d) => !restDays.has(d)));
  // Settlement's held rule, per day: a freeze holds every must; a declared rest day holds a must
  // unless the rule in force on that day is 'Even on rest days' (settlement-plan steps 2, 3 and 6).
  const heldOn = (rule: { compulsoryOnRest: boolean }, d: DayKey): boolean =>
    freezeDays.has(d) || (!rule.compulsoryOnRest && (restDays.has(d) || heldDays.has(d)));
  for (const t of templates) {
    if (t.kind !== "TASK" && t.kind !== "HABIT") continue;
    const dt = dutyTemplateOf(t);
    const start = maxKey(t.startDay, epochDay);
    const from = maxKey(monday, start);
    if (from > sunday) continue;
    const days = byTemplate.get(t.id) ?? new Map<DayKey, string[]>();
    const list = lists.get(t.id) ?? [];
    const rule = parseRule(t.recurrence);

    if (!rule) {
      const due = t.dueDay;
      if (!due || due < from || due > sunday) continue;
      const r = ruleOn(dt, due);
      if (!r.compulsory || !expectedOn(r, due)) continue;
      out.push({ day: due, outcome: instanceOutcome(deadlineStatusesOf(list, due)) ?? (heldOn(r, due) ? "held" : "missed") });
      continue;
    }

    if (rule.kind === "TARGET") {
      if (rule.per !== "W" || start > monday) continue;
      // A must for the whole period: a weakening before Sunday drops it, and a strengthening after
      // Monday is never retroactive (decision 16).
      const r = ruleOn(dt, sunday);
      if (!r.compulsory || !ruleOn(dt, monday).compulsory || dt.inbox || (r.archivedDay && r.archivedDay <= sunday)) continue;
      // The held days per day, under the rule in force on each: 'Even on rest days' switched on (or
      // off) mid-week changes only the days it covers, as in settlement's TARGET close.
      const held = new Set<DayKey>();
      for (let x = monday; x <= sunday; x = addDays(x, 1)) if (heldOn(ruleOn(dt, x), x)) held.add(x);
      const units = targetUnits(rule, { start: monday, end: sunday }, list, held);
      for (let i = 0; i < rule.n; i++) out.push({ day: null, outcome: i < units.kept ? "kept" : i < units.kept + units.held ? "held" : "missed" });
      continue;
    }

    for (let d = from; d <= sunday; d = addDays(d, 1)) {
      const r = ruleOn(dt, d);
      if (!r.compulsory || !expectedOn(r, d)) continue;
      out.push({ day: d, outcome: instanceOutcome(days.get(d)) ?? (heldOn(r, d) ? "held" : "missed") });
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

interface Verdict {
  kept: boolean;
  detail: string;
  /** M2: held (floors not met, ≥ HELD_WEEK_REST_DAYS rest days). */
  held?: boolean;
  /** A missed must: DUTY is never held then (the user's "streak hit", decision 23). */
  mustMissed?: boolean;
}

/**
 * One track's verdict and its reason line, against its floors (M5's 3 days,
 * 30 raw, 150 effort min and 5 completions; pro-rated by M2's rest days):
 *   kept      'Kept · 4 days · 52.0 raw XP' (BODY + ' · 180 effort min'; DUTY + ' · 5 musts kept' when there were musts)
 *   not kept  'Not kept · ' + the failing parts, in the order '2 of 3 days', '12.0 of 30 raw XP',
 *             '90 of 150 effort min', '1 must missed (Tue)', '4 of 5 completions'
 * CRAFT, CARE: days ≥ 3 and raw ≥ 30. BODY: also effort ≥ 150 (EXERCISE receipts only).
 * DUTY: any missed must breaks the week; with ≥ 3 musts it needs raw ≥ 30; with
 * 0–2 (none missed), ≥ 5 completions on ≥ 3 days and raw ≥ 30.
 */
function verdictOf(track: Track, w: TrackWeek, occ: readonly Occurrence[], floors: KeptFloors): Verdict {
  const daysOk = w.days >= floors.days;
  const rawOk = w.raw >= floors.raw;
  const daysPart = `${w.days} of ${floors.days} days`;
  const rawPart = `${rawText(w.raw)} of ${floorText(floors.raw)} raw XP`;
  const keptHead = `Kept · ${plural(w.days, "day")} · ${rawText(w.raw)} raw XP`;

  if (track === "BODY") {
    const effortOk = w.effortMinutes >= floors.effortMinutes;
    if (daysOk && rawOk && effortOk) return { kept: true, detail: `${keptHead} · ${w.effortMinutes} effort min` };
    const parts = [!daysOk && daysPart, !rawOk && rawPart, !effortOk && `${w.effortMinutes} of ${floorText(floors.effortMinutes)} effort min`];
    return { kept: false, detail: `Not kept · ${parts.filter(Boolean).join(" · ")}` };
  }

  if (track === "DUTY") {
    const missed = occ.filter((o) => o.outcome === "missed");
    if (missed.length > 0) return { kept: false, detail: `Not kept · ${mustsMissedText(missed)}`, mustMissed: true };
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
    const completionsOk = w.completions >= floors.dutyCompletions;
    if (completionsOk && daysOk && rawOk) return { kept: true, detail: `${keptHead}${mustsPart}` };
    const parts = [!daysOk && daysPart, !rawOk && rawPart, !completionsOk && `${w.completions} of ${floors.dutyCompletions} completions`];
    return { kept: false, detail: `Not kept · ${parts.filter(Boolean).join(" · ")}` };
  }

  if (daysOk && rawOk) return { kept: true, detail: keptHead };
  return { kept: false, detail: `Not kept · ${[!daysOk && daysPart, !rawOk && rawPart].filter(Boolean).join(" · ")}` };
}

/**
 * verdictOf, then M2's rest days (decision 20): a kept week names them
 * (' · 2 rest days'); a week whose pro-rated floors are not met is Held when
 * it has ≥ HELD_WEEK_REST_DAYS rest days ('Held · 5 rest days'), unless a
 * must was missed. With no rest days this is verdictOf exactly.
 */
function judgeTrack(track: Track, w: TrackWeek, occ: readonly Occurrence[], floors: KeptFloors): Verdict {
  const v = verdictOf(track, w, occ, floors);
  const rest = floors.restDays;
  if (rest <= 0) return v;
  if (v.kept) return { ...v, detail: `${v.detail} · ${plural(rest, "rest day")}` };
  if (!v.mustMissed && rest >= HELD_WEEK_REST_DAYS) return { kept: false, held: true, detail: `${HELD_PREFIX}${plural(rest, "rest day")}` };
  return v;
}

/** Days of `set` in [from, to]. */
function countIn(set: ReadonlySet<DayKey> | undefined, from: DayKey, to: DayKey): number {
  let n = 0;
  if (set) for (const d of set) if (d >= from && d <= to) n += 1;
  return n;
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
 *
 * M2 (a Duty week, its Sunday ≥ dutyLaunchDay): DUTY waits for settlement
 * (the gate); DUTY's musts are read through the rule on each day; rest days
 * pro-rate every track's floors and can hold a track; and the run that
 * writes DUTY then mints each settled full day of the week (≥ max(Duty
 * launch, life launch)), in day order, 0.5 within what the cap leaves after
 * the kept tracks: a trimmed one is a qty-0 decision row
 * ('full day <d> · trimmed by the weekly cap'), and a key already written is
 * skipped.
 */
export function planWeeks(state: WeekJudgeState): WeekPlan[] {
  const { launchDay, epochDay } = state;
  if (!launchDay || !epochDay) return [];
  const gate: DutyGate = { dutyLaunchDay: state.dutyLaunchDay ?? null, settledThroughDay: state.settledThroughDay ?? null, epochDay };
  const weeks = weeksToJudge(state.today, epochDay, state.judged, state.maxWeeks ?? WEEK_JUDGE_MAX_WEEKS, gate);
  if (weeks.length === 0) return [];

  // An UNDO 'undo:<id>' takes TASK row <id> back; UNDO rows count for nothing else.
  const undone = new Set<string>();
  for (const r of state.rows) if (r.source === "UNDO" && r.dedupeKey?.startsWith("undo:")) undone.add(r.dedupeKey.slice(5));
  const live = state.rows.filter((r) => r.source === "TASK" && !undone.has(r.id));
  const byTemplate = instancesByTemplate(state.instances);
  const lists = instanceListsByTemplate(state.instances);
  const restDays = state.restDays ?? new Set<DayKey>();
  const mintKeys = new Set<string>();
  for (const m of state.mints) if (m.key) mintKeys.add(m.key);

  return weeks.map(({ weekKey, monday, sunday, missing }) => {
    const from = maxKey(monday, epochDay);
    const backfill = weekIsBackfill(sunday, launchDay);
    const dutyWeek = isDutyWeek(sunday, gate.dutyLaunchDay);
    // Rest days pro-rate only a Duty week: every earlier week keeps the M5 floors.
    const floors = keptFloorsOf(dutyWeek ? countIn(restDays, from, sunday) : 0);
    const occ = !missing.includes("DUTY")
      ? []
      : dutyWeek
        ? dutyOccurrencesM2(state.templates, byTemplate, lists, state.heldDays, restDays, epochDay, monday, sunday)
        : dutyOccurrences(state.templates, byTemplate, state.heldDays, epochDay, monday, sunday);
    const tracks: WeekTrackPlan[] = missing.map((track) => {
      const verdict = judgeTrack(track, trackWeekOf(live, track, from, sunday), track === "DUTY" ? occ : [], floors);
      return {
        track,
        kept: verdict.kept,
        detail: backfill ? `${BACKFILL_PREFIX}${verdict.detail}` : verdict.detail,
        ...(verdict.held ? { held: true, restDays: floors.restDays } : {}),
      };
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
      // Full days (decision 6): last, in the run that writes this Duty week's DUTY row.
      if (dutyWeek && missing.includes("DUTY")) {
        const first = maxKey(maxKey(gate.dutyLaunchDay!, launchDay), from);
        const fullDays = [...new Set(state.fullDays ?? [])].filter((d) => d >= first && d <= sunday).sort();
        for (const d of fullDays) {
          const dedupeKey = fullDayMintKey(d);
          if (mintKeys.has(dedupeKey)) continue;
          const delta = cappedMp(LIFE_MP.FULL_DAY, used);
          mints.push({
            reason: "LIFE_FULL_DAY",
            delta,
            why: `full day ${d}${delta < LIFE_MP.FULL_DAY ? " · trimmed by the weekly cap" : ""}`,
            dedupeKey,
            day: d,
            track: null,
          });
          used = round2(used + delta);
        }
      }
    }
    return { weekKey, monday, sunday, backfill, tracks, mints };
  });
}

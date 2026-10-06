/**
 * Week quests (roadmap lane R6; roadmap.md revision 3, F13, F14): the
 * started milestone sliced into this life week (Monday 04:00 to Monday 04:00,
 * Sydney). Generation and verification are pure, deterministic and
 * client-importable: no Prisma, no clock, no model call. Labels are fixed
 * code templates filled only with YoursText, CodeText, DomainNames and
 * WORKED_OUT numbers. Week quests pay nothing and have no checkbox.
 *
 * Revision 4 (roadmap-rev4.md F-R4-14; WEEK_QUEST_GENERATOR_VERSION 2):
 *   - RAISE is one row with a part per Domain still short: count_d =
 *     min(pace_d, ceil(expectedReach_d)), the reach from roadmap-types'
 *     reach table (the real review rules: a miss costs a day, two in a row
 *     a level, a card past grace drops one; clearance c and off-day
 *     persistence ρ; the long-gap pass rate at level ≥ 9; clean entry on an
 *     `rc` key) at the StartSnapshot's figures, the priors while those were
 *     calibrating. Progress is Σ_d clamp(v_d − floor_d, 0, count_d), read
 *     from each Domain's own measure (recall cards; `rc` counts a retry
 *     entry after its next pass), so a slip in one Domain offsets only its
 *     own part; the row is done when every part is.
 *   - ADD is one row with a part per Domain: newNeeded_d = writeNeedOf(n_d,
 *     the recall cards it holds) = ceil(WRITE_MARGIN × n_d) − those cards
 *     (coverage, not a yield; the basis names the spare from WRITE_MARGIN), a
 *     per-Domain catch-up cap, and the capacity cap on the total, shared out
 *     in proportion to pace_d. Only recall cards count toward it.
 *   - Clean entry on an `rc` part is roadmap-types' one rule (isRetryEntry,
 *     R1's, which the reach DP follows; fix round, contracts §15.1): this
 *     module keeps no second definition.
 *   - Labels: "Bring {n} cards to level {L}+" and "Add {n} cards"; the parts
 *     line ("3 in Probability · 2 in Inference") is questPartsLineOf's.
 *   - A v1 set (no parts) keeps its figures and renders exactly as before.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R6, §14.9. Imports nothing
 * from roadmap-model, roadmap-validate or roadmap-evidence. One of the five
 * files allowed to call the number-brand constructors (questProgress'
 * figures, in weekQuestsViewOf).
 *
 *   weekQuestsFor · questProgress · weekQuestResultsOf · weekDoneShare · questsBehind
 *   weekQuestsViewOf · pastWeekOf
 *   added by R6: questsBehindLine · questWindowOf · nonHeldShareOf · scaledCountOf · unitWord
 *                WeekQuestResultsStored · WEEK_QUEST_CAPTION · WEEK_QUEST_NOTE_PATTERNS
 *   added by R6 (rev 4): questReachOf · questPartsLineOf · shareOutByPace · addSpareText (fix round)
 *                WeekQuestInputExtras · QuestReach · WeekQuestRowV2 · WeekQuestsViewV2
 *                (fix round: the V2 names are aliases of the contract's
 *                WeekQuestRow and WeekQuestsView, which now carry partsLine
 *                and health; isRetryEntry and ReviewRowLike moved to
 *                roadmap-types as isRetryEntry and ReviewLedgerRow)
 *   added by lane 3 (revision 5, contracts §23.3): WeekQuestShare · shareLineOf · shareOfBasis ·
 *                WeekQuestInputExtras.share · WeekQuestsViewInput.goal
 *
 * Every count is WORKED_OUT and every basis line says what produced it. The
 * basis lines are stored with the frozen set (RoadmapQuestWeek.basis), so
 * the "How these were set" sheet shows what was asked and why, never
 * today's recomputation. Lines start with their group ("Bring:", "Add:",
 * "Sessions:", "Step:", "Checkpoint:", "Capacity:", "Week:") so the sheet can
 * group them; the roadmap page's notes are picked out of them by
 * WEEK_QUEST_NOTE_PATTERNS.
 *
 * Revision 5 (contracts §23.3; lane 3): one set per goal. A goal that shares
 * the week with other open goals freezes its set at its share (roadmap-goals
 * sharesOf, read when the set is frozen: the cron's just after Monday 04:00),
 * and the capacity line names it ("Capacity: ≈ 2 h 10 this week (…) · goal
 * 2's 3 of 7 h."). That line is where the share is stored (RoadmapQuestWeek
 * has no column for it): shareOfBasis reads WeekQuestSet.share back from a
 * frozen set's basis. With one goal there is no share, no such words and no
 * `share` key: every set and view is exactly as before. A view of a goal
 * among 2 or more open goals (WeekQuestsViewInput.goal) carries its seat on
 * the view and on each row, and its roadmap links carry ?goal=<id>.
 */
import { goalHrefOf } from "./roadmap-goals";
import { LIFE_TZ, addDays, daysBetween, weekdayOf, type DayKey } from "./life-day";
import { WEEKDAY_SHORT, describeRule, parseRule } from "./recurrence";
import {
  CARD_WRITE_MIN,
  C_PRIOR,
  KEEP_SHARE,
  LONG_GAP_LEVEL,
  NON_RECALL_TYPES,
  P_LONG_CAP,
  P_PRIOR,
  REACH_STRIKE_LIMIT,
  RHO_PRIOR,
  WEEK_QUEST_ADD_MIN_CAP,
  WEEK_QUEST_BEHIND_WRITING_WEEKS,
  WEEK_QUEST_CATCHUP_FACTOR,
  WEEK_QUEST_CHECKPOINT_FROM,
  WEEK_QUEST_EVIDENCE_OF,
  WEEK_QUEST_GENERATOR_VERSION,
  WEEK_QUEST_MAX_PER_KIND,
  WEEK_QUEST_PARTS_TODAY,
  WEEK_QUESTS_PER_WEEK_MAX,
  WRITE_MARGIN,
  domainsText,
  effectiveState,
  bestReach,
  floorBase,
  keptUnits,
  measured,
  plannedUnits,
  reachTable,
  recorded,
  selfReported,
  writeNeedOf,
  type AddPart,
  type AddQuestSpec,
  type CalibratingInput,
  type CheckpointQuestSpec,
  type CodeText,
  type DomainName,
  type EvidenceValue,
  type GoalSlot,
  type PastWeekView,
  type PracticeQuestSpec,
  type QuestEvidence,
  type RaisePart,
  type RaiseQuestSpec,
  type ReachParams,
  type StartSnapshot,
  type StartWeek,
  type StepQuestSpec,
  type WeekQuestCap,
  type WeekQuestCardInput,
  type WeekQuestInput,
  type WeekQuestKind,
  type WeekQuestProgress,
  type WeekQuestResults,
  type WeekQuestRow,
  type WeekQuestSet,
  type WeekQuestSpec,
  type WeekQuestsView,
  type WeekQuestUnit,
  type WeekQuestVariant,
  type YoursText,
} from "./roadmap-types";

// ═══ Small pure helpers ═════════════════════════════════════════════════════

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Float noise guard: 5.6000000001 must not ceil to 7, 2.9999999999 must not floor to 2. */
const EPS = 1e-9;
const ceilSafe = (x: number): number => Math.ceil(x - EPS);
const floorSafe = (x: number): number => Math.floor(x + EPS);
/** ceil(a ÷ b) for b > 0 (0 when b ≤ 0). */
const ceilDiv = (a: number, b: number): number => (b > 0 ? ceilSafe(a / b) : 0);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);
const minDay = (a: DayKey, b: DayKey): DayKey => (a < b ? a : b);

/** "Wed". */
function weekdayWord(key: DayKey): string {
  return WEEKDAY_SHORT[weekdayOf(key) - 1];
}

/** "13 Dec". */
function shortDay(key: DayKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** "Sun 13 Dec". */
function dayLabel(key: DayKey): string {
  return `${weekdayWord(key)} ${shortDay(key)}`;
}

/** "≈ 3 h 10", "≈ 2 h", "≈ 45 min" (rounded to 5 minutes; task estimates are never exact). */
function minutesText(min: number): string {
  const m = Math.max(0, Math.round(min / 5) * 5);
  if (m < 60) return `≈ ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `≈ ${h} h` : `≈ ${h} h ${String(r).padStart(2, "0")}`;
}

/** "Mon 04:15" for an ISO instant, in the life zone (the basis names when card levels were read). */
function readAtLabel(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "at the freeze";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: LIFE_TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("hour")}:${get("minute")}`;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const pct = (x: number): number => Math.round(x * 100);
/** One decimal, no trailing ".0" ("2.4", "3"). */
const oneDecimal = (x: number): string => {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** The eligible (not held) days of [from, to]. */
function eligibleDays(from: DayKey, to: DayKey, held: ReadonlySet<DayKey>): DayKey[] {
  const out: DayKey[] = [];
  if (from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!held.has(d)) out.push(d);
  return out;
}

/** "Statistics'" / "Trading's". */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** Own-property read of a JSON-shaped record (a stored set's maps; '__proto__' and friends never resolve). */
function ownNumber(rec: Readonly<Record<string, unknown>> | null | undefined, key: string): number | null {
  if (!rec || typeof rec !== "object" || !Object.prototype.hasOwnProperty.call(rec, key)) return null;
  const v = rec[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ═══ Labels: code templates whose text slots take only the brands (F13 Labels) ══

/** Generator 2 (F-R4-14): "Bring {n} card(s) to level {L}+"; the Domains are in the parts line. */
function raiseLabel(n: number, level: number): string {
  return `Bring ${n} ${plural(n, "card", "cards")} to level ${level}+`;
}

/** Generator 2 (F-R4-14): "Add {n} card(s)"; the Domains are in the parts line. */
function addLabel(n: number): string {
  return `Add ${n} ${plural(n, "card", "cards")}`;
}

/** "{name} · {n} session(s) × {min} min", or "{name} · {n} day(s) × {min} min" for a DAILY rule. */
function practiceLabel(name: YoursText | CodeText, n: number, unit: "session" | "day", minutes: number): string {
  const word = unit === "day" ? plural(n, "day", "days") : plural(n, "session", "sessions");
  return `${String(name)} · ${n} ${word} × ${minutes} min`;
}

/** "Step: {title}". */
function stepLabel(title: YoursText | CodeText): string {
  return `Step: ${String(title)}`;
}

/** "Checkpoint: {label} · log your score". */
function checkpointLabel(label: YoursText): string {
  return `Checkpoint: ${String(label)} · log your score`;
}

// ═══ Generation (F13) ═══════════════════════════════════════════════════════

/**
 * The basis lines the roadmap page also shows as notes (F18 Now): the
 * PAST_DUE line, the lag line, the below-baseline line, the capacity notes,
 * the end of the writing window and the time overrun. weekQuestsViewOf
 * picks them out of a stored set's basis by these patterns, so a frozen set
 * keeps its notes; the group word ("Bring: ") is dropped from the note.
 */
export const WEEK_QUEST_NOTE_PATTERNS: readonly RegExp[] = [
  /^Week: Milestone \d+ was due /,
  /^Bring: No card in /,
  // v1's wording and generator 2's ("At Start's figures, no card in Inference …").
  /^Bring: At (?:the pass rate stored at Start|Start's figures), no card /,
  // v1's "5 cards already counted …" and generator 2's "Inference: 5 cards already counted …".
  /^Bring: (?:.+?: )?\d+ cards? already counted when you started /,
  /^Add: Practices and reviews fill this week's time/,
  /^Add: No time left for new cards this week/,
  /^Add: No new cards this week/,
  /^Capacity: This week's plan is more than /,
];

// ═══ Revision 4: the reach model, retry entries and parts (F-R4-8, F-R4-14) ══

/**
 * What a week's input may carry beyond the contract's WeekQuestInput (R6,
 * optional): the loadout's reach terms, read with the interval multiplier
 * m when the set is generated. Absent, the base review rules (srs.ts's two
 * strikes, no grace extension) stand, which reads a little low.
 */
export interface WeekQuestInputExtras {
  loadout?: { extraStrikes?: number; graceExtraDays?: number } | null;
  /**
   * Revision 5 (contracts §23.3; lane 3): this goal's share of the week
   * when it shares it with other open goals (roadmap-goals sharesOf, as
   * the set is frozen), with its seat. The capacity was read at this
   * share (RealismInput.share); the capacity line names it, and the set
   * keeps it (WeekQuestSet.share). Absent or null: one goal, as before.
   */
  share?: WeekQuestShare | null;
}

/** A goal's share of the week as a set is frozen with it (contracts §23.3): "goal 2's 3 of 7 h". */
export interface WeekQuestShare {
  slot: GoalSlot;
  /** This goal's hours a week (yours). */
  hours: number;
  /** Every open (DRAFT and ACTIVE) goal's hours together. */
  of: number;
}

/** Hours as the share line writes them: whole hours plain, else one decimal ("3", "7.5"). */
function shareHoursText(h: number): string {
  const v = Number.isFinite(h) ? Math.max(0, h) : 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}

/** The share as the capacity line names it: "goal 2's 3 of 7 h". */
export function shareLineOf(share: WeekQuestShare): string {
  return `goal ${share.slot}'s ${shareHoursText(share.hours)} of ${shareHoursText(share.of)} h`;
}

/** The capacity line's share, as shareLineOf writes it at the line's end. */
const SHARE_IN_CAPACITY = /^Capacity: .* · goal ([1-3])'s (\d+(?:\.\d)?) of (\d+(?:\.\d)?) h\.$/;

/**
 * WeekQuestSet.share read back from a set's basis (revision 5): the hours
 * its capacity line names, or null when the line names none (one goal, an
 * empty set, a set frozen before revision 5). The line is code's own
 * template (shareLineOf), so this is the frozen share, never a recomputation.
 */
export function shareOfBasis(basis: readonly string[]): { hours: number; of: number } | null {
  for (const line of basis) {
    const m = SHARE_IN_CAPACITY.exec(line);
    if (m) return { hours: Number(m[2]), of: Number(m[3]) };
  }
  return null;
}

/** The reach inputs a week keeps from Start (F-R4-14), and the ones that were the app's assumption then. */
export interface QuestReach {
  params: ReachParams;
  /** 'p', 'c', 'rho': the priors stood in (P_PRIOR, C_PRIOR, RHO_PRIOR), named in the basis. */
  assumed: CalibratingInput[];
}

const shareOf = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? clamp(x, 0, 1) : null);

/**
 * RAISE's reach parameters from the StartSnapshot (F-R4-14 "at the start
 * parameters"): p_start, pLong_start = min(p_start, its stored value or
 * P_LONG_CAP), c_start and ρ_start, frozen for the milestone's life. An
 * input that was calibrating at Start (StartSnapshot.calibrating, or rev 3's
 * pCalibrating) or that the snapshot lacks reads as the published prior,
 * never as 1 (F-R4-8: "Never p = 1 or c = 1 while calibrating"). m is the
 * current interval multiplier (the reach this week, as rev 3); the strike
 * limit and grace extension are the loadout's.
 */
export function questReachOf(snapshot: StartSnapshot, m: number, loadout?: WeekQuestInputExtras["loadout"]): QuestReach {
  const assumed: CalibratingInput[] = [];
  const cal = new Set<string>(Array.isArray(snapshot.calibrating) ? snapshot.calibrating : []);
  if (snapshot.pCalibrating) cal.add("p");
  const pick = (key: "p" | "c" | "rho", stored: unknown, prior: number): number => {
    const v = shareOf(stored);
    if (cal.has(key) || v == null) {
      assumed.push(key);
      return prior;
    }
    return v;
  };
  const p = pick("p", snapshot.pStart, P_PRIOR);
  const storedLong = assumed.includes("p") ? null : shareOf(snapshot.pLongStart);
  const pLong = Math.min(p, storedLong ?? P_LONG_CAP, P_LONG_CAP);
  const c = pick("c", snapshot.cStart, C_PRIOR);
  const rho = pick("rho", snapshot.rhoStart, RHO_PRIOR);
  const extraStrikes = Math.max(0, Math.floor(loadout?.extraStrikes ?? 0) || 0);
  const graceExtra = Math.max(0, Math.floor(loadout?.graceExtraDays ?? 0) || 0);
  return {
    params: { p, pLong, c, rho, m: Number.isFinite(m) && m > 0 ? m : 1, strikeLimit: REACH_STRIKE_LIMIT + extraStrikes, graceExtra },
    assumed,
  };
}

/**
 * The parts line of a RAISE or ADD row (F-R4-14): "3 in Probability · 2 in
 * Inference" (RAISE) or "4 to Inference · 2 to Risk Management · multiple
 * choice not counted" (ADD; the last clause only while NON_RECALL_TYPES is
 * non-empty). Today and the Aim card show the first WEEK_QUEST_PARTS_TODAY
 * parts and "+n more Domain(s)"; the roadmap page shows them all. Counts
 * only, never a bare "n of N". null for a row without parts (a v1 row, whose
 * label names its Domains).
 */
export function questPartsLineOf(row: { kind: WeekQuestKind; parts?: readonly { name: DomainName; count: number }[] }, variant: WeekQuestVariant): string | null {
  if ((row.kind !== "RAISE" && row.kind !== "ADD") || !row.parts || row.parts.length === 0) return null;
  const word = row.kind === "RAISE" ? "in" : "to";
  const all = row.parts.map((p) => `${p.count} ${word} ${String(p.name)}`);
  const shown = variant === "roadmap" ? all : all.slice(0, WEEK_QUEST_PARTS_TODAY);
  const more = all.length - shown.length;
  const out = [...shown];
  if (more > 0) out.push(`+${more} more ${plural(more, "Domain", "Domains")}`);
  if (row.kind === "ADD" && NON_RECALL_TYPES.length > 0) out.push("multiple choice not counted");
  return out.join(" · ");
}

/**
 * Shares `total` units out in proportion to `weights`, never giving a part
 * more than its `wants` (ADD's capacity cap over the parts, F-R4-14): each
 * part first takes floor(total × w ÷ Σw) (at most its want), then the units
 * left go one by one to the part with the largest remainder still under its
 * want (ties: the earlier part). Deterministic; Σ ≤ total.
 */
export function shareOutByPace(total: number, wants: readonly number[], weights: readonly number[]): number[] {
  const out = wants.map(() => 0);
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const units = Math.max(0, Math.floor(total));
  if (units === 0 || sum <= 0) return out;
  const exact = weights.map((w) => (units * Math.max(0, w)) / sum);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(Math.max(0, wants[i]), floorSafe(exact[i]));
  let left = units - out.reduce((s, n) => s + n, 0);
  while (left > 0) {
    let best = -1;
    let bestRem = -Infinity;
    for (let i = 0; i < out.length; i++) {
      if (out[i] >= wants[i]) continue;
      const rem = exact[i] - out[i];
      if (rem > bestRem + EPS) {
        best = i;
        bestRem = rem;
      }
    }
    if (best < 0) break;
    out[best] += 1;
    left -= 1;
  }
  return out;
}

/** A part's Domain id: the measure's own (a depth plan's measure is one Domain's), else its scope's first. */
function partDomainOf(c: WeekQuestCardInput): string {
  return c.domainId ?? c.domainIds[0] ?? "";
}

/** "your 85% pass rate" / "an 80% pass rate (the app's assumption until 30 reviews are measured)", and the rest of the reach basis line. */
function reachBasisLine(reach: QuestReach, level: number): string {
  const { p, pLong, c } = reach.params;
  const a = new Set(reach.assumed);
  const parts = [
    a.has("p") ? `an ${pct(p)}% pass rate (the app's assumption until 30 reviews are measured)` : `your ${pct(p)}% pass rate`,
  ];
  if (level > LONG_GAP_LEVEL) parts.push(`${pct(pLong)}% for gaps of 50 days and more (the app's policy: none of your reviews has tested gaps that long yet)`);
  parts.push(a.has("c") ? `${pct(c)}% of your due reviews cleared (the app's assumption)` : `the ${pct(c)}% of your due reviews you clear`);
  parts.push(a.has("rho") ? "missed days bunching together at the app's assumed rate" : "missed days bunching together as they did in your history");
  return `Bring: reach follows the app's review rules (a miss costs a day, two in a row cost a level, a card overdue past its grace drops a level) at Start's figures: ${parts.join(", ")}.`;
}

/**
 * ADD's coverage goal as its basis line words it (F-R4-14; fix round,
 * contracts §15.2): "1.3 × 25 → 33, a 30% spare because some cards lag".
 * The margin and the spare are read from WRITE_MARGIN, never typed, and the
 * goal is writeNeedOf's own arithmetic (ceil(WRITE_MARGIN × n), with its
 * float guard). "→", not "=", because the goal is rounded up (1.3 × 25 is
 * 32.5), as the pace line's "→" is.
 */
export function addSpareText(target: number): string {
  return `${WRITE_MARGIN} × ${target} → ${writeNeedOf(target, 0)}, a ${pct(WRITE_MARGIN - 1)}% spare because some cards lag`;
}

/** The snapshot's week for weekStart, else the nearest planned week before it (a reschedule ran past the plan), else null. */
function snapshotWeekOf(weeks: readonly StartWeek[], weekStart: DayKey): StartWeek | null {
  let best: StartWeek | null = null;
  for (const w of weeks) {
    if (w.weekStart === weekStart) return w;
    if (w.weekStart < weekStart && (!best || w.weekStart > best.weekStart)) best = w;
  }
  return best;
}

/**
 * needRate_{d,w}: the new cards a week Domain d needed when the milestone
 * started (ADD's per-Domain catch-up cap, F-R4-14). In order: the snapshot's
 * week's needRateByDomain; newNeeded_start_d × fw ÷ Ww_start from the
 * snapshot's newNeededByDomain; else (a snapshot written before those
 * fields) Start's whole need rate, shared by this week's needs.
 */
function needRateOf(domainId: string, need: number, needSum: number, snapshot: StartSnapshot, exactWeek: StartWeek | null, fwDays: number): number {
  const byWeek = ownNumber(exactWeek?.needRateByDomain, domainId);
  if (byWeek != null) return Math.max(0, byWeek);
  const atStart = ownNumber(snapshot.newNeededByDomain, domainId);
  if (atStart != null && snapshot.wwStart > 0) return Math.max(0, (atStart * (fwDays / 7)) / snapshot.wwStart);
  const total = exactWeek?.needRate ?? (snapshot.wwStart > 0 ? (snapshot.newNeededStart * (fwDays / 7)) / snapshot.wwStart : 0);
  return needSum > 0 ? Math.max(0, (total * need) / needSum) : 0;
}

/** "1 comes due Tue, 2 Wed, 1 Sat" from the reachable cards' due days. */
function dueLineOf(dueDays: readonly DayKey[]): string | null {
  if (dueDays.length === 0) return null;
  const counts = new Map<DayKey, number>();
  for (const d of [...dueDays].sort()) counts.set(d, (counts.get(d) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(([d, n], i) => (i === 0 ? `${n} ${n === 1 ? "comes" : "come"} due ${weekdayWord(d)}` : `${n} ${weekdayWord(d)}`));
  return parts.join(", ");
}

type Building =
  | Omit<RaiseQuestSpec, "ord">
  | Omit<AddQuestSpec, "ord">
  | Omit<PracticeQuestSpec, "ord">
  | Omit<StepQuestSpec, "ord">
  | Omit<CheckpointQuestSpec, "ord">;

/**
 * The week's set (F13; generator 2, F-R4-14): its state (OPEN, HELD,
 * PAST_DUE), then RAISE, ADD, PRACTICE (in ord), STEP and CHECKPOINT, each
 * count WORKED_OUT from the gap above the floor, the weeks left, the reach
 * model at Start's figures, the coverage's writing need, the catch-up cap and
 * the week's capacity; every basis line says what produced it. RAISE and ADD
 * carry one part per Domain (input.cards, else input.card alone). Never more
 * than WEEK_QUESTS_PER_WEEK_MAX: parts are not quests.
 *
 * Reads only its input: every field is as of Monday 04:00 except card
 * levels (read at the freeze, named in the basis). Defensive about live
 * values a caller may pass: a step done or a checkpoint logged on or after
 * weekStart still counts as open as of Monday.
 */
export function weekQuestsFor(input: WeekQuestInput & WeekQuestInputExtras): WeekQuestSet {
  const { weekStart, milestone } = input;
  const weekEnd = addDays(weekStart, 6);
  const { startedDay, dueDay, snapshot } = milestone;
  const ord = milestone.ord;
  const head = { weekStart, milestoneId: milestone.id, generator: WEEK_QUEST_GENERATOR_VERSION };

  // 0. PAST_DUE: due before this week and the goal still open. No quests.
  if (dueDay < weekStart) {
    return {
      ...head,
      state: "PAST_DUE",
      quests: [],
      basis: [`Week: Milestone ${ord} was due ${dayLabel(dueDay)} — close or reschedule it`],
      cappedBy: null,
    };
  }

  const held = new Set(input.heldDays);
  // 1. Eligible days: the window's days not held.
  const from = maxDay(weekStart, startedDay);
  const to = minDay(weekEnd, dueDay);
  const eDays = eligibleDays(from, to, held);
  const e = eDays.length;
  const basis: string[] = [
    `Week: everything is read as of Mon ${shortDay(weekStart)} 04:00 except card levels, read ${readAtLabel(input.cardLevelsReadAt)}. The set doesn't change this week.`,
  ];
  if (from > weekStart) basis.push(`Week: ${dayLabel(from)} to ${dayLabel(to)} only: the milestone started after the week began.`);
  else if (to < weekEnd) basis.push(`Week: ${dayLabel(from)} to ${dayLabel(to)} only: the milestone is due before the week ends.`);

  // HELD: no eligible day.
  if (e === 0) {
    basis.push("Week: held week: every day of this week's window is a rest, sick or vacation day, so it asks nothing.");
    return { ...head, state: "HELD", quests: [], basis, cappedBy: null };
  }
  const heldIn = daysBetween(from, to) + 1 - e;
  if (heldIn > 0) basis.push(`Week: ${heldIn} ${plural(heldIn, "day is", "days are")} held this week; counts are for the other ${e}.`);

  // 2. Weeks left: Σ |E_w| over this week through the due day's, in days.
  const wDays = eligibleDays(from, dueDay, held).length;

  const built: Building[] = [];
  let cappedBy: WeekQuestCap | null = null;
  const m = input.m;

  // The week's room for new cards (step 4) and its time (step 8) share these.
  const nonHeldWeek = eligibleDays(weekStart, weekEnd, held).length;
  const availE = nonHeldWeek > 0 ? (input.capacity.availableMin * e) / nonHeldWeek : 0;
  const practices = input.practices.slice(0, WEEK_QUEST_MAX_PER_KIND.PRACTICE);
  const practiceUnits = practices.map((p) => plannedUnits(p.rule, { from, to, startDay: p.startDay }, held));
  const practiceMin = practices.reduce((sum, p, i) => sum + practiceUnits[i] * p.bandMinutes, 0);
  const snapWeek = snapshotWeekOf(snapshot.weeks, weekStart);
  const reviewMin = snapWeek ? snapWeek.reviewMin : 0;
  const capacityWords =
    input.capacity.class === "ESTIMATED" && !input.capacity.calibrating
      ? "task estimates, not timed"
      : "your hours × 0.7 while your tracked time is calibrating; unverified";

  // The card measures, one per Domain (generator 2): input.cards, else the one input.card.
  const measures: WeekQuestCardInput[] = input.cards && input.cards.length > 0 ? input.cards : input.card ? [input.card] : [];
  const named = measures.filter((c) => c.domainNames.length > 0);
  if (measures.length > 0 && named.length === 0) {
    basis.push("Bring: the milestone's Domains were removed, so there is nothing to bring or add.");
  } else if (named.length < measures.length) {
    basis.push("Bring: a Domain of the milestone was removed, so nothing is asked for it.");
  }
  const L = named.length > 0 ? named[0].level : null;
  const parts = L == null ? [] : named.filter((c) => c.level === L);
  if (L != null && parts.length < named.length) basis.push(`Bring: a measure at a level other than ${L} isn't asked in this week's rows.`);
  const nameOf = (c: WeekQuestCardInput) => domainsText(c.domainNames, "or");
  const reach = questReachOf(snapshot, m, input.loadout);

  // 3. RAISE (TESTED): one row, a part per Domain still short.
  if (L != null && parts.length > 0) {
    const table = reachTable(reach.params);
    const raiseParts: RaisePart[] = [];
    const domainsOfParts: string[] = [];
    let explained = false;
    let anyReachable = false;
    let anyRetry = false;
    for (const c of parts) {
      const name = nameOf(c);
      const b0 = Math.max(c.v0, c.baseline);
      const gap = Math.max(0, c.target - b0);
      if (c.v0 < c.baseline) {
        const slipped = c.baseline - c.v0;
        basis.push(
          `Bring: ${name}: ${slipped} ${plural(slipped, "card", "cards")} already counted when you started ${plural(slipped, "has", "have")} slipped below level ${L}; bringing ${plural(slipped, "it", "them")} back doesn't move Milestone ${ord}, so this week asks from ${b0}.`
        );
      }
      if (gap === 0) {
        basis.push(`Bring: ${name}: target held — ${c.target} at level ${L}+ ${plural(c.target, "is", "are")} already counted; keep reviewing when due.`);
        continue;
      }
      if (!explained) {
        basis.push(`Bring: weeks left ${oneDecimal(wDays / 7)}, this one included; each Domain is asked for its own gap, and a slip in one Domain doesn't offset another.`);
        basis.push(reachBasisLine(reach, L));
        explained = true;
      }
      // The cards the measure counts: recall cards when the key has its segment; `rc` counts a retry entry at L after its next pass.
      const counted = c.segment ? c.cards.filter((x) => x.recall !== false) : c.cards;
      const clean = c.segment === "rc";
      const eff = counted.map((x) => {
        const s = effectiveState(x, weekStart);
        return { level: s.level, dueDay: s.dueDay, retryEntry: !!x.retryEntry && s.level === x.level };
      });
      const below = eff.filter((x) => x.level < L && bestReach(x, L, m) <= to);
      const retries = clean ? eff.filter((x) => x.level === L && x.retryEntry && x.dueDay <= to) : [];
      const reachable = below.length + retries.length;
      const expected =
        below.reduce((sum, x) => sum + table.reachProb(x.level, L, daysBetween(bestReach(x, L, m), to), clean ? { cleanAt: L } : undefined), 0) +
        retries.reduce((sum, x) => sum + table.reachProb(L, L + 1, daysBetween(x.dueDay, to)), 0);
      const pace = ceilDiv(gap * e, wDays);
      const reachN = ceilSafe(expected);
      const count = Math.min(pace, reachN);
      basis.push(
        `Bring: ${name}: gap ${c.target} − ${b0} = ${gap} ${plural(gap, "card", "cards")} to bring to level ${L}+ (your reading before this week ${c.v0}; the milestone's baseline ${c.baseline}) · pace ${gap} × ${e} ÷ ${wDays} days → ${pace}.`
      );
      if (reachable > 0) {
        anyReachable = true;
        basis.push(
          `Bring: ${name}: ${reachable} ${plural(reachable, "card", "cards")} can reach level ${L} this week if passed on ${plural(reachable, "its", "their")} day; at Start's figures about ${oneDecimal(expected)} (best case ${reachable}). Asked: ${count}.`
        );
      }
      if (retries.length > 0) {
        anyRetry = true;
        basis.push(
          `Bring: ${name}: ${retries.length} ${plural(retries.length, "card", "cards")} reached level ${L} on a retry: ${plural(retries.length, "it counts", "they count")} after ${plural(retries.length, "its", "their")} next review, which this week can bring.`
        );
      }
      if (count === 0) {
        if (reachable === 0) {
          const later = eff
            .filter((x) => x.level < L)
            .map((x) => bestReach(x, L, m))
            .filter((d) => d > to)
            .sort();
          const first = later[0] ?? null;
          const by = first ? later.filter((d) => d <= first).length : 0;
          basis.push(
            first
              ? `Bring: No card in ${name} can reach level ${L} this week even if every review passes; ${by} can by ${dayLabel(first)}.`
              : `Bring: No card in ${name} can reach level ${L} this week even if every review passes.`
          );
        } else {
          basis.push(`Bring: At Start's figures, no card in ${name} is expected to reach level ${L} this week.`);
        }
        continue;
      }
      if (pace > reachN) basis.push(`Bring: ${name}: the pace asks ${pace}, more than this week's reach; it asks ${count}. Whether that is a delay is the pace line's call, not this week's.`);
      raiseParts.push({
        domainId: partDomainOf(c),
        measureKey: c.measureKey,
        floor: b0,
        count,
        dueDays: [...below.map((x) => x.dueDay), ...retries.map((x) => x.dueDay)].sort(),
      });
      for (const id of c.domainIds) if (!domainsOfParts.includes(id)) domainsOfParts.push(id);
    }
    if (anyReachable) basis.push("Bring: a card that was due anyway counts: passing its review is the step. The schedule never lets a card level early.");
    if (explained && !anyRetry && parts.some((c) => c.segment === "rc")) {
      basis.push(`Bring: at level ${L} a card counts once it entered on a first-try pass; one that got there on a next-day retry counts after its next review.`);
    }
    if (raiseParts.length > 0) {
      const total = raiseParts.reduce((s, p) => s + p.count, 0);
      built.push({
        kind: "RAISE",
        label: raiseLabel(total, L),
        count: total,
        unit: "card",
        evidence: WEEK_QUEST_EVIDENCE_OF.RAISE,
        from,
        to,
        measureKey: raiseParts[0].measureKey,
        domainIds: domainsOfParts,
        minLevel: L,
        floor: raiseParts.reduce((s, p) => s + p.floor, 0),
        dueDays: raiseParts.flatMap((p) => p.dueDays).sort(),
        bestCase: false,
        parts: raiseParts,
      });
    }
  }

  // 4. ADD (RECORDED): one row, a part per Domain still short of its coverage (recall cards only).
  const shift = daysBetween(snapshot.dueDay, dueDay);
  const lastCardDay =
    L == null ? null : snapshot.lastCardDay ? addDays(snapshot.lastCardDay, shift) : addDays(dueDay, -floorBase(L, snapshot.m > 0 ? snapshot.m : 1));
  if (L != null && parts.length > 0 && lastCardDay) {
    const pacing = parts.filter((c) => c.rateSource !== "NONE");
    if (pacing.length === 0) {
      basis.push("Add: new cards aren't counted: no pace yet, so no card is asked for.");
    } else {
      for (const c of parts) if (c.rateSource === "NONE") basis.push(`Add: ${nameOf(c)}: new cards aren't counted: no pace yet, so none is asked for.`);
      const fwDays = eligibleDays(from, minDay(to, lastCardDay), held).length;
      if (fwDays === 0) {
        basis.push(`Add: No new cards this week: a card written after ${dayLabel(lastCardDay)} can't reach level ${L} by ${shortDay(dueDay)}.`);
      } else {
        const wwDays = eligibleDays(from, lastCardDay, held).length;
        const exactWeek = snapshot.weeks.find((w) => w.weekStart === weekStart) ?? null;
        const rows = pacing.map((c) => {
          const live = c.cards.filter((x) => x.recall !== false).length;
          const need = writeNeedOf(c.target, live);
          return { c, live, need, pace: ceilDiv(need * fwDays, wwDays) };
        });
        const needSum = rows.reduce((s, r) => s + r.need, 0);
        const sized = rows.map((r) => {
          const needRate = needRateOf(partDomainOf(r.c), r.need, needSum, snapshot, exactWeek, fwDays);
          const cap = Math.max(WEEK_QUEST_ADD_MIN_CAP, ceilSafe(WEEK_QUEST_CATCHUP_FACTOR * needRate));
          return { ...r, needRate, cap, want: Math.min(r.pace, cap) };
        });
        const quotaMin = input.otherFieldQuotas * CARD_WRITE_MIN;
        const room = availE - practiceMin - reviewMin - quotaMin;
        const capFit = floorSafe(Math.max(0, room) / CARD_WRITE_MIN);
        const wantSum = sized.reduce((s, r) => s + r.want, 0);
        const paceSum = sized.reduce((s, r) => s + r.pace, 0);
        const counts = wantSum <= capFit ? sized.map((r) => r.want) : shareOutByPace(capFit, sized.map((r) => r.want), sized.map((r) => r.pace));
        const cappedOf = (i: number): WeekQuestCap | null => (counts[i] < sized[i].want ? "CAPACITY" : sized[i].pace > sized[i].cap ? "CATCHUP" : null);
        const caps = sized.map((_, i) => cappedOf(i));
        cappedBy = caps.includes("CATCHUP") ? "CATCHUP" : caps.includes("CAPACITY") ? "CAPACITY" : null;
        const count = counts.reduce((s, n) => s + n, 0);

        basis.push(`Add: writing weeks left ${oneDecimal(wwDays / 7)} — a card written after ${dayLabel(lastCardDay)} can't reach level ${L} by ${shortDay(dueDay)}.`);
        sized.forEach((r) => {
          // The coverage goal, writeNeedOf's own arithmetic (ceil(WRITE_MARGIN × n_d)); "→" because it is rounded up, like the pace.
          basis.push(
            `Add: ${nameOf(r.c)}: still needed ${r.need} new ${plural(r.need, "card", "cards")} (${addSpareText(r.c.target)}, less the ${r.live} ${plural(r.live, "card", "cards")} it holds) · pace ${r.need} × ${fwDays} ÷ ${wwDays} days → ${r.pace} · most a week ${WEEK_QUEST_CATCHUP_FACTOR} × the ${oneDecimal(r.needRate)} a week the plan needed at Start (at least ${WEEK_QUEST_ADD_MIN_CAP}) → ${r.cap}.`
          );
        });
        if (NON_RECALL_TYPES.length > 0) basis.push("Add: multiple-choice cards don't count: recognising an answer isn't recalling it.");
        basis.push(
          `Add: room ${minutesText(availE)} available − ${minutesText(practiceMin + reviewMin)} of practices and reviews${quotaMin > 0 ? ` − ${minutesText(quotaMin)} for other Fields' weekly quotas (${input.otherFieldQuotas} ${plural(input.otherFieldQuotas, "card", "cards")})` : ""} → ${capFit} ${plural(capFit, "card", "cards")} at ${CARD_WRITE_MIN} min. Asked: ${count}${cappedBy ? "" : "; no cap bound"}.`
        );
        if (input.areaQuotaField) basis.push(`Add: ${possessive(input.areaQuotaField.name)} weekly quota counts these cards too.`);
        if (input.otherFieldQuotas === 0) basis.push("Add: other Fields' weekly quotas: none this week.");
        sized.forEach((r, i) => {
          if (caps[i] !== "CATCHUP") return;
          basis.push(
            `Add: ${nameOf(r.c)}: asks ${counts[i]} of the ${r.pace} new cards needed to stay on plan; ${WEEK_QUEST_CATCHUP_FACTOR} × the ${oneDecimal(r.needRate)} a week the plan needed at Start is the most a week asks. Missed cards are not piled onto the week.`
          );
        });
        if (caps.includes("CAPACITY")) {
          const shared = sized.length > 1 ? `, shared in proportion: ${sized.map((r, i) => `${counts[i]} to ${nameOf(r.c)}`).join(" · ")}` : "";
          basis.push(
            count === 0
              ? "Add: No time left for new cards this week: practices and reviews fill it."
              : `Add: Practices and reviews fill this week's time, so it asks ${count} of the ${paceSum} new cards the plan needs${shared}.`
          );
        }
        const addParts: AddPart[] = [];
        sized.forEach((r, i) => {
          if (counts[i] > 0) addParts.push({ domainId: partDomainOf(r.c), count: counts[i], pace: r.pace, cappedBy: caps[i] });
        });
        if (count > 0) {
          let lead = 0;
          for (let i = 1; i < addParts.length; i++) if (addParts[i].count > addParts[lead].count) lead = i;
          const leadMeasure = sized.find((r) => partDomainOf(r.c) === addParts[lead].domainId)?.c ?? sized[0].c;
          built.push({
            kind: "ADD",
            label: addLabel(count),
            count,
            unit: "card",
            evidence: WEEK_QUEST_EVIDENCE_OF.ADD,
            from,
            to,
            domainIds: addParts.map((p) => p.domainId),
            fieldId: leadMeasure.fieldId,
            quotaField: input.areaQuotaField ? { ...input.areaQuotaField } : null,
            pace: paceSum,
            writingWeeksLeft: wwDays / 7,
            lastCardDay,
            parts: addParts,
          });
        } else if (!caps.includes("CAPACITY")) {
          basis.push("Add: no new cards are needed this week.");
        }
      }
    }
  }

  // 5. PRACTICE (SELF_REPORTED): the plan's own sessions over E; misses never carry over.
  if (input.practices.length > WEEK_QUEST_MAX_PER_KIND.PRACTICE) {
    basis.push(`Sessions: only the first ${WEEK_QUEST_MAX_PER_KIND.PRACTICE} practices get a week quest.`);
  }
  practices.forEach((p, i) => {
    const n = practiceUnits[i];
    const rule = parseRule(p.rule);
    const unit: "session" | "day" = rule?.kind === "DAILY" ? "day" : "session";
    basis.push(`Sessions: ${String(p.name)}, ${describeRule(p.rule, p.startDay).toLowerCase()}, over this week's ${e} open ${plural(e, "day", "days")} → ${n}. Missed sessions don't carry over.`);
    if (n <= 0) return;
    built.push({
      kind: "PRACTICE",
      label: practiceLabel(p.name, n, unit, p.bandMinutes),
      count: n,
      unit,
      evidence: WEEK_QUEST_EVIDENCE_OF.PRACTICE,
      from,
      to,
      templateId: p.templateId,
      minutes: p.bandMinutes,
    });
  });
  if (practices.length > 0) basis.push(`Sessions: the milestone counts ${pct(KEEP_SHARE)}% of planned sessions; the week asks for the plan itself.`);

  // 6. STEP (SELF_REPORTED): the first open step, once its share of the window has passed.
  const span = daysBetween(startedDay, dueDay);
  const sinceStart = Math.max(0, daysBetween(startedDay, weekEnd));
  const lastWeek = dueDay <= weekEnd;
  const elapsedPct = span > 0 ? pct(clamp(sinceStart / span, 0, 1)) : 100;
  let stepMin = 0;
  const steps = [...input.steps].sort((a, b) => a.ord - b.ord);
  const openIdx = steps.findIndex((s) => s.doneDay == null || s.doneDay >= weekStart);
  if (openIdx >= 0) {
    const s = steps.length;
    const i = openIdx + 1;
    const due = span <= 0 || sinceStart * (s + 1) >= i * span || lastWeek;
    const step = steps[openIdx];
    if (due) {
      basis.push(
        lastWeek && !(span <= 0 || sinceStart * (s + 1) >= i * span)
          ? `Step: step ${i} of ${s} ${plural(s, "step", "steps")} is a week quest in the milestone's last week.`
          : `Step: step ${i} of ${s} ${plural(s, "step", "steps")} became a week quest once ${pct(i / (s + 1))}% of the window had passed (${elapsedPct}% at Sunday).`
      );
      stepMin = step.minutes;
      built.push({
        kind: "STEP",
        label: stepLabel(step.title),
        count: 1,
        unit: "step",
        evidence: WEEK_QUEST_EVIDENCE_OF.STEP,
        from,
        to,
        templateId: step.templateId,
        minutes: step.minutes,
      });
    } else {
      basis.push(`Step: step ${i} of ${s} ${plural(s, "step", "steps")} becomes a week quest once ${pct(i / (s + 1))}% of the window has passed (${elapsedPct}% at Sunday).`);
    }
  }

  // 7. CHECKPOINT (SELF_REPORTED, context): from the week the window passes 80%, until logged.
  if (input.checkpoint) {
    const cp = input.checkpoint;
    // The first day the elapsed share reaches WEEK_QUEST_CHECKPOINT_FROM: 5 × elapsed ≥ 4 × span for 0.8.
    const fromDay = span > 0 ? addDays(startedDay, ceilSafe(WEEK_QUEST_CHECKPOINT_FROM * span)) : startedDay;
    const reached = fromDay <= weekEnd;
    const loggedSince = cp.lastLogDay != null && cp.lastLogDay >= fromDay && cp.lastLogDay < weekStart;
    if (!reached) {
      basis.push(`Checkpoint: from the week the window passes ${pct(WEEK_QUEST_CHECKPOINT_FROM)}% (week of ${shortDay(addDays(fromDay, 1 - weekdayOf(fromDay)))}).`);
    } else if (loggedSince) {
      basis.push(`Checkpoint: logged on ${dayLabel(cp.lastLogDay as DayKey)}, so it isn't asked again.`);
    } else {
      basis.push(`Checkpoint: the window has passed ${pct(WEEK_QUEST_CHECKPOINT_FROM)}% (${elapsedPct}% at Sunday) with no score logged since; it never moves progress.`);
      built.push({
        kind: "CHECKPOINT",
        label: checkpointLabel(cp.label),
        count: 1,
        unit: "log",
        evidence: WEEK_QUEST_EVIDENCE_OF.CHECKPOINT,
        from,
        to,
        itemLineageId: cp.itemLineageId,
      });
    }
  }

  // 8. Time: the plan's minutes against the week's capacity (the practices are still asked for).
  // Revision 5: a goal sharing the week names its share, which the set keeps (shareOfBasis reads it back).
  const share = input.share ?? null;
  basis.push(`Capacity: ${minutesText(availE)} this week (${capacityWords})${share ? ` · ${shareLineOf(share)}` : ""}.`);
  const planMin = practiceMin + reviewMin + stepMin;
  if (planMin > availE + EPS) {
    basis.push(`Capacity: This week's plan is more than the time you've shown (${minutesText(planMin)} of ${minutesText(availE)}); the practices are still asked for, as the plan's own.`);
  }

  // 9. Order and cap: RAISE, ADD, PRACTICE (in ord), STEP, CHECKPOINT.
  const order: Record<WeekQuestKind, number> = { RAISE: 0, ADD: 1, PRACTICE: 2, STEP: 3, CHECKPOINT: 4 };
  const sorted = built.map((b, i) => ({ b, i })).sort((x, y) => order[x.b.kind] - order[y.b.kind] || x.i - y.i);
  const quests = sorted.slice(0, WEEK_QUESTS_PER_WEEK_MAX).map(({ b }, i) => ({ ...b, ord: i + 1 }) as WeekQuestSpec);
  if (quests.length === 0) basis.push("Week: nothing to ask this week.");
  return { ...head, state: "OPEN", quests, basis, cappedBy, ...(share ? { share: { hours: share.hours, of: share.of } } : {}) };
}

// ═══ Verification (F14) ═════════════════════════════════════════════════════

/** A set's window: the first and last day its quests count over (the whole life week for an empty set). */
export function questWindowOf(set: WeekQuestSet): { from: DayKey; to: DayKey } {
  if (set.quests.length === 0) return { from: set.weekStart, to: addDays(set.weekStart, 6) };
  let from = set.quests[0].from;
  let to = set.quests[0].to;
  for (const q of set.quests) {
    if (q.from < from) from = q.from;
    if (q.to > to) to = q.to;
  }
  return { from, to };
}

const inWindow = (d: DayKey, spec: { from: DayKey; to: DayKey }) => d >= spec.from && d <= spec.to;

/**
 * One quest's progress from the app's rows (F14), the one function every
 * surface uses: RAISE net of the floor (TESTED), ADD new non-archived cards
 * in scope (RECORDED), PRACTICE kept units (roadmap-types keptUnits), STEP
 * and CHECKPOINT once in the window (SELF_REPORTED). done = progress ≥ count.
 *
 * RAISE is clamped to [0, count] (a card that slips offsets one that rose);
 * the others are what the rows say, so "10 of 8 cards" can read honestly.
 * Evidence of another kind reads as no progress.
 *
 * Generator 2 (a RAISE or ADD with parts, F-R4-14): each part reads its own
 * Domain's evidence (RAISE byDomain, from that Domain's measure key; ADD
 * addedByDomain, recall cards only), so a slip in one Domain offsets only
 * its own part. RAISE progress is Σ_d clamp(v_d − floor_d, 0, count_d);
 * ADD's is Σ_d min(added_d, count_d), each part's own figure staying what
 * the rows say. The row is done when every part is done.
 */
export function questProgress(spec: WeekQuestSpec, evidence: QuestEvidence): WeekQuestProgress {
  let progress = 0;
  let slipped: WeekQuestProgress["slipped"] = null;
  if (spec.kind === "RAISE" && evidence.kind === "RAISE" && spec.parts && spec.parts.length > 0) {
    const by = evidence.byDomain;
    let high = 0;
    let slipDay: DayKey | null = null;
    const parts = spec.parts.map((part) => {
      const ev = by && Object.prototype.hasOwnProperty.call(by, part.domainId) ? by[part.domainId] : null;
      const got = ev?.value == null ? 0 : clamp(ev.value - part.floor, 0, part.count);
      const top = ev?.high == null ? got : clamp(ev.high - part.floor, 0, part.count);
      high += Math.max(got, top);
      if (top > got && ev?.slipDay && (slipDay == null || ev.slipDay < slipDay)) slipDay = ev.slipDay;
      return { domainId: part.domainId, progress: got, count: part.count, done: got >= part.count };
    });
    progress = parts.reduce((s, p) => s + p.progress, 0);
    if (progress < high) slipped = { from: high, day: slipDay };
    return { ord: spec.ord, progress, count: spec.count, done: parts.every((p) => p.done), slipped, parts };
  }
  if (spec.kind === "ADD" && evidence.kind === "ADD" && spec.parts && spec.parts.length > 0) {
    const parts = spec.parts.map((part) => {
      const added = Math.max(0, Math.floor(ownNumber(evidence.addedByDomain, part.domainId) ?? 0));
      return { domainId: part.domainId, progress: added, count: part.count, done: added >= part.count };
    });
    progress = parts.reduce((s, p) => s + Math.min(p.progress, p.count), 0);
    return { ord: spec.ord, progress, count: spec.count, done: parts.every((p) => p.done), slipped: null, parts };
  }
  if (spec.kind === "RAISE" && evidence.kind === "RAISE") {
    progress = evidence.value == null ? 0 : clamp(evidence.value - spec.floor, 0, spec.count);
    const high = evidence.high == null ? progress : clamp(evidence.high - spec.floor, 0, spec.count);
    if (progress < high) slipped = { from: high, day: evidence.slipDay };
  } else if (spec.kind === "ADD" && evidence.kind === "ADD") {
    progress = Math.max(0, Math.floor(evidence.added));
  } else if (spec.kind === "PRACTICE" && evidence.kind === "PRACTICE") {
    progress = keptUnits(evidence.rule, evidence.startDay, { from: spec.from, to: spec.to }, evidence.instances.filter((i) => inWindow(i.day, spec)));
  } else if (spec.kind === "STEP" && evidence.kind === "STEP") {
    progress = evidence.doneDays.some((d) => inWindow(d, spec)) ? 1 : 0;
  } else if (spec.kind === "CHECKPOINT" && evidence.kind === "CHECKPOINT") {
    progress = evidence.logDays.some((d) => inWindow(d, spec)) ? 1 : 0;
  }
  return { ord: spec.ord, progress, count: spec.count, done: progress >= spec.count, slipped };
}

// ═══ History and finalisation (F14) ═════════════════════════════════════════

/**
 * RoadmapQuestWeek.results as R6 writes it: the contract's shape plus the
 * window's eligible days at the freeze, so a later reader can scale the done
 * share by the share of those days still open (heldAfterFreeze) without
 * re-reading rest days. Readers that know only WeekQuestResults ignore it.
 */
export interface WeekQuestResultsStored extends WeekQuestResults {
  /** The window's days not held as of Monday 04:00 (|E| at generation, over the closed window). */
  eligibleDays?: number;
}

/**
 * A settled week's results (written once, from the Wednesday 04:00 after its
 * Sunday, or 3 days after a mid-week close). `progress` is questProgress
 * over the closed window, one per quest in order; `eligibleDays` (optional)
 * is stored with them for the done share.
 */
export function weekQuestResultsOf(
  set: WeekQuestSet,
  progress: readonly WeekQuestProgress[],
  closedDay: DayKey | null,
  heldAfterFreeze: number,
  eligibleDays?: number
): WeekQuestResultsStored {
  const byOrd = new Map(progress.map((p) => [p.ord, p]));
  const rows = set.quests.map((q) => {
    const p = byOrd.get(q.ord);
    const value = p ? p.progress : 0;
    return { ord: q.ord, progress: value, done: value >= q.count };
  });
  const out: WeekQuestResultsStored = { closedDay, rows, heldAfterFreeze: Math.max(0, Math.floor(heldAfterFreeze)) };
  if (eligibleDays != null && Number.isFinite(eligibleDays)) out.eligibleDays = Math.max(0, Math.floor(eligibleDays));
  return out;
}

/**
 * The share of the window's days still open as now declared: (|E| −
 * heldAfterFreeze) ÷ |E|, from the stored eligibleDays; without it, the
 * window's own length stands in for |E|. 1 with nothing held after the freeze.
 */
export function nonHeldShareOf(set: WeekQuestSet, results: WeekQuestResults): number {
  const held = Math.max(0, results.heldAfterFreeze);
  if (held === 0) return 1;
  const stored = (results as WeekQuestResultsStored).eligibleDays;
  const win = questWindowOf(set);
  const to = results.closedDay && results.closedDay < win.to ? results.closedDay : win.to;
  const base = stored != null && stored > 0 ? stored : Math.max(1, daysBetween(win.from, to) + 1);
  return clamp((base - held) / base, 0, 1);
}

/** count′ = round(count × nonHeldShare) (half up): the count a week with days held after its freeze is read against. 0: excused. */
export function scaledCountOf(count: number, nonHeldShare: number): number {
  return Math.max(0, Math.floor(count * clamp(nonHeldShare, 0, 1) + 0.5 + EPS));
}

/**
 * Σ min(progress, count′) ÷ Σ count′, each count scaled by the window's
 * non-held share as now declared (a sick week is not a missed one), in
 * quest units. 1 when nothing was asked (an empty set, or every count
 * excused): nothing was missed.
 */
export function weekDoneShare(set: WeekQuestSet, results: WeekQuestResults, nonHeldShare: number): number {
  const share = clamp(nonHeldShare, 0, 1);
  const byOrd = new Map(results.rows.map((r) => [r.ord, r]));
  let num = 0;
  let den = 0;
  for (const q of set.quests) {
    const scaled = q.count * share;
    const row = byOrd.get(q.ord);
    num += Math.min(row ? row.progress : 0, scaled);
    den += scaled;
  }
  return den > EPS ? clamp(num / den, 0, 1) : 1;
}

/**
 * QUESTS_BEHIND (F14): the frozen set's ADD capped by CATCHUP with fewer than
 * WEEK_QUEST_BEHIND_WRITING_WEEKS writing weeks left, this one included.
 * Never on HELD or PAST_DUE, never on a CAPACITY cap. Generator 2 (F-R4-14):
 * it fires when any part is capped by CATCHUP; the set's cappedBy is then
 * CATCHUP too (it wins over a CAPACITY part), which R1's triggersOf reads.
 */
export function questsBehind(set: WeekQuestSet | null): boolean {
  if (!set || set.state !== "OPEN" || set.cappedBy !== "CATCHUP") return false;
  const add = set.quests.find((q): q is AddQuestSpec => q.kind === "ADD");
  if (!add || !(add.writingWeeksLeft < WEEK_QUEST_BEHIND_WRITING_WEEKS)) return false;
  return add.parts && add.parts.length > 0 ? add.parts.some((p) => p.cappedBy === "CATCHUP") : true;
}

/**
 * The QUESTS_BEHIND sentence, the roadmap surfaces' one wording: "Behind on
 * new cards for Milestone 2: this week asks 4 of the 8 needed to stay on
 * plan, and writing that can still reach level 6 by 13 Dec ends Sun 22 Nov."
 * null when the trigger does not fire. R1's triggersOf words its TriggerHit
 * the same (roadmap-quests-check pins it) and may import this; the week
 * quests view never adds it to its notes (the trigger banner is its one
 * place).
 */
export function questsBehindLine(set: WeekQuestSet | null, milestone: { ord: number; level: number | null; dueDay: DayKey | null }): string | null {
  if (!set || !questsBehind(set)) return null;
  const add = set.quests.find((q): q is AddQuestSpec => q.kind === "ADD");
  if (!add) return null;
  const level = milestone.level != null ? ` level ${milestone.level}` : " the level";
  const by = milestone.dueDay ? ` by ${shortDay(milestone.dueDay)}` : "";
  const ends = add.lastCardDay ? ` ends ${dayLabel(add.lastCardDay)}` : " ends soon";
  return `Behind on new cards for Milestone ${milestone.ord}: this week asks ${add.count} of the ${add.pace} needed to stay on plan, and writing that can still reach${level}${by}${ends}.`;
}

// ═══ Views (F17, F18, F19) ══════════════════════════════════════════════════

/** The evidence captions, in the spec's words (F14 Verification), per kind and state. */
export const WEEK_QUEST_CAPTION: Readonly<Record<WeekQuestKind, { open: string; done: string }>> = {
  RAISE: { open: "tested by your reviews", done: "tested by your reviews" },
  ADD: { open: "counted by the app; it doesn't judge them", done: "counted by the app; it doesn't judge them" },
  PRACTICE: { open: "from your ticks", done: "from your ticks" },
  STEP: { open: "you tick it", done: "you ticked it" },
  CHECKPOINT: { open: "you log it · doesn't move your progress", done: "you logged it · doesn't move your progress" },
};

/** What weekQuestsViewOf reads beyond the set and its progress. */
export interface WeekQuestsViewInput {
  set: WeekQuestSet;
  progress: readonly WeekQuestProgress[];
  variant: WeekQuestVariant;
  /** dueDay (added by R6, optional): the PAST_DUE and QUESTS_BEHIND notes name it. */
  milestone: { ord: number; of: number; title: string; dueDay?: DayKey | null };
  /** The milestone's card level (the footer's "level 6+"); null without a card measure. */
  level: number | null;
  frozen: boolean;
  writesOff: boolean;
  /** templateId → where its task sits on Today ("in Habits", "in Anytime"). */
  places: Readonly<Record<string, string>>;
  /**
   * Added by R6, optional (the roadmap variant's pass-rate note, F13 step 4):
   * p stored at Start, p now (the caller's throughput), and, when the caller
   * has re-fitted, the target fitted today. "Week quests keep Start's figures."
   */
  passRate?: { start: { p: number; calibrating: boolean }; now: { p: number; calibrating: boolean } | null; fittedNow?: number | null } | null;
  /**
   * Added by R6 (rev 4, optional): the parts' Domain names, read from the
   * Domain rows when the view is built, so a renamed Domain reads its new
   * name. A part whose Domain is gone keeps its count in the row and is left
   * out of the parts list.
   */
  domainNames?: Readonly<Record<string, DomainName>> | null;
  /** Added by R6 (rev 4, optional): a BODY-track plan; its PRACTICE rows carry `health` (HEALTH_LINE as the row's sub-line, F-R4-13). */
  health?: boolean;
  /**
   * Revision 5 (contracts §23.3, §23.5; lane 3): the goal, only while 2 or
   * more goals are open (D39): the view and each row carry its seat (Today's
   * seat glyph), the view its frozen share, and a link to the roadmap page
   * carries ?goal=<id> (goalHrefOf). Absent: one goal, exactly as before.
   */
  goal?: { roadmapId: string; slot: GoalSlot } | null;
}

/**
 * A row as weekQuestsViewOf builds it (R6, rev 4). The fix round put its two
 * optional fields on the contract (roadmap-types WeekQuestRow, contracts
 * §15.11): `partsLine`, the variant's parts line (questPartsLineOf), on a
 * RAISE or ADD row with parts; `health`, only ever true, on a PRACTICE row of
 * a BODY plan (the component shows HEALTH_LINE under it). A v1 row carries
 * neither, so it renders exactly as before. Kept as an alias, so a reader
 * needs no cast.
 */
export type WeekQuestRowV2 = WeekQuestRow;

/** weekQuestsViewOf's result: the contract's WeekQuestsView (an alias, kept for the names). */
export type WeekQuestsViewV2 = WeekQuestsView;

const TODAY_ORDER: Record<WeekQuestKind, number> = { RAISE: 0, ADD: 1, STEP: 2, PRACTICE: 3, CHECKPOINT: 4 };

function figureOf(spec: WeekQuestSpec, progress: number, done: boolean, variant: WeekQuestVariant): EvidenceValue {
  const words = WEEK_QUEST_CAPTION[spec.kind];
  let caption = done ? words.done : words.open;
  if (spec.kind === "PRACTICE" && variant === "roadmap") caption = `${caption} · the milestone counts ${pct(KEEP_SHARE)}% of these`;
  const value = spec.evidence === "TESTED" ? measured(progress) : spec.evidence === "RECORDED" ? recorded(progress) : selfReported(progress);
  return { value, caption };
}

function hrefOf(spec: WeekQuestSpec, variant: WeekQuestVariant): string | null {
  switch (spec.kind) {
    case "RAISE":
      return variant === "today" ? "/you/roadmap#now" : null;
    case "ADD": {
      // Generator 2: the part with the largest count (ties: the earlier part); v1: the first Domain in scope.
      let domain = spec.domainIds[0];
      if (spec.parts && spec.parts.length > 0) {
        let lead = spec.parts[0];
        for (const p of spec.parts) if (p.count > lead.count) lead = p;
        domain = lead.domainId;
      }
      if (!domain) return null;
      const params = spec.fieldId ? `field=${encodeURIComponent(spec.fieldId)}&domain=${encodeURIComponent(domain)}` : `domain=${encodeURIComponent(domain)}`;
      return `/add?${params}`;
    }
    case "PRACTICE":
    case "STEP":
      return variant === "today" ? null : `/today#t-${encodeURIComponent(spec.templateId)}`;
    case "CHECKPOINT":
      return variant === "today" ? "/you/roadmap#checkpoint" : null;
  }
}

/** A generator-2 row's parts as the component shows them: its Domain's name, count and verified progress; a part whose Domain is gone is left out. */
function partsOf(spec: WeekQuestSpec, p: WeekQuestProgress | undefined, names: Readonly<Record<string, DomainName>>): NonNullable<WeekQuestRow["parts"]> | null {
  if ((spec.kind !== "RAISE" && spec.kind !== "ADD") || !spec.parts || spec.parts.length === 0) return null;
  const out: NonNullable<WeekQuestRow["parts"]> = [];
  for (const part of spec.parts) {
    const name = Object.prototype.hasOwnProperty.call(names, part.domainId) ? names[part.domainId] : null;
    if (!name) continue;
    const got = p?.parts?.find((x) => x.domainId === part.domainId);
    out.push({ domainId: part.domainId, name, count: part.count, progress: got ? got.progress : 0, done: got ? got.done : false });
  }
  return out;
}

function rowOf(spec: WeekQuestSpec, p: WeekQuestProgress | undefined, input: WeekQuestsViewInput): WeekQuestRowV2 {
  const progress = p ? p.progress : 0;
  const done = p ? p.done : progress >= spec.count;
  const parts = partsOf(spec, p, input.domainNames ?? {});
  let slipLine: string | null = null;
  if (spec.kind === "RAISE" && p?.slipped && p.slipped.from > progress) {
    const n = p.slipped.from - progress;
    slipLine = `${n} ${plural(n, "card", "cards")} slipped back to level ${Math.max(1, spec.minLevel - 1)}${p.slipped.day ? ` on ${weekdayWord(p.slipped.day)}` : ""}`;
  }
  const templateId = spec.kind === "PRACTICE" || spec.kind === "STEP" ? spec.templateId : null;
  const extra: { parts?: NonNullable<WeekQuestRow["parts"]>; partsLine?: string; health?: true } = {};
  if (parts) {
    extra.parts = parts;
    const line = questPartsLineOf({ kind: spec.kind, parts }, input.variant);
    if (line) extra.partsLine = line;
  }
  if (spec.kind === "PRACTICE" && input.health) extra.health = true;
  return {
    ord: spec.ord,
    kind: spec.kind,
    label: spec.label,
    count: spec.count,
    unit: spec.unit,
    evidence: spec.evidence,
    figure: figureOf(spec, progress, done, input.variant),
    done,
    dueLine: spec.kind === "RAISE" ? dueLineOf(spec.dueDays) : null,
    quotaLine: spec.kind === "ADD" && spec.quotaField ? `counts toward ${possessive(spec.quotaField.name)} weekly quota too` : null,
    slipLine,
    seekTemplateId: input.variant === "today" ? templateId : null,
    place: templateId ? (input.places[templateId] ?? null) : null,
    href: goalLinkOf(hrefOf(spec, input.variant), input.goal),
    ...extra,
    ...(input.goal ? { slot: input.goal.slot } : {}),
  };
}

/** A link to the roadmap page names its goal while 2 or more are open (revision 5); every other link, and every link with one goal, is unchanged. */
function goalLinkOf(href: string | null, goal: WeekQuestsViewInput["goal"]): string | null {
  if (!href || !goal || !href.startsWith("/you/roadmap")) return href;
  return goalHrefOf(href, goal.roadmapId);
}

/**
 * The roadmap page's notes (never on Today): PAST_DUE, the lag and baseline
 * lines, the capacity notes, the pass-rate note.
 *
 * Never QUESTS_BEHIND (fix round, Lens 2): that sentence is an F11 trigger,
 * R1's TriggerHit computed from this same frozen set (roadmap-pace
 * triggersOf; questsBehind here is the same rule, and questsBehindLine the
 * same words), and the roadmap page renders it once, in its banner with the
 * levers that act on the open milestone. A note here would print it a second
 * time without them.
 */
function notesOf(input: WeekQuestsViewInput): string[] {
  const { set } = input;
  const notes: string[] = [];
  const strip = (line: string) => line.replace(/^(Week|Bring|Add|Capacity): /, "");
  if (set.state === "PAST_DUE") {
    const line = input.milestone.dueDay
      ? `Milestone ${input.milestone.ord} was due ${dayLabel(input.milestone.dueDay)} — close or reschedule it`
      : (set.basis.find((b) => WEEK_QUEST_NOTE_PATTERNS[0].test(b)) ?? null);
    if (line) notes.push(strip(line));
    return notes;
  }
  for (const line of set.basis) if (WEEK_QUEST_NOTE_PATTERNS.some((re) => re.test(line))) notes.push(strip(line));
  const pr = input.passRate;
  if (pr && pr.now && !pr.now.calibrating && set.state === "OPEN" && input.level != null) {
    const flipped = pr.start.calibrating;
    const moved = !pr.start.calibrating && Math.abs(pr.now.p - pr.start.p) > 0.1;
    if (flipped || moved) {
      const fitted = pr.fittedNow != null ? `; fitted today the target would be ${pr.fittedNow}` : "";
      notes.push(
        flipped
          ? `Your pass rate is now measured (${pct(pr.now.p)}%)${fitted}. Week quests keep Start's figures.`
          : `Your pass rate is now ${pct(pr.now.p)}% (${pct(pr.start.p)}% at Start)${fitted}. Week quests keep Start's figures.`
      );
    }
  }
  return notes;
}

/**
 * The rows as a surface renders them, every figure branded by its evidence
 * with its caption, never a /review link:
 *   today    open rows first, each group in Today's order (Bring, Add, the
 *            step, sessions, the checkpoint); PRACTICE and STEP seek their
 *            task (seekTemplateId); no basis, notes or cap (never on Today);
 *   aim      issue order; links per F13's table;
 *   roadmap  issue order, with the basis lines, the notes (not QUESTS_BEHIND,
 *            which the page's trigger banner shows) and the cap.
 * writesOff marks a live set only: a set read from its frozen row is recorded.
 */
export function weekQuestsViewOf(input: WeekQuestsViewInput): WeekQuestsViewV2 {
  const { set, variant } = input;
  const byOrd = new Map(input.progress.map((p) => [p.ord, p]));
  let rows = set.quests.map((q) => rowOf(q, byOrd.get(q.ord), input));
  if (variant === "today") {
    rows = rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => Number(a.r.done) - Number(b.r.done) || TODAY_ORDER[a.r.kind] - TODAY_ORDER[b.r.kind] || a.i - b.i)
      .map(({ r }) => r);
  }
  const done = rows.filter((r) => r.done).length;
  const onRoadmap = variant !== "today";
  return {
    milestoneId: set.milestoneId,
    milestoneOrd: input.milestone.ord,
    milestoneOf: input.milestone.of,
    milestoneTitle: input.milestone.title,
    weekStart: set.weekStart,
    weekEnd: addDays(set.weekStart, 6),
    state: set.state,
    rows,
    done,
    total: rows.length,
    level: input.level,
    frozen: input.frozen,
    writesOff: input.writesOff && !input.frozen,
    basis: onRoadmap ? [...set.basis] : [],
    cappedBy: onRoadmap ? set.cappedBy : null,
    notes: onRoadmap ? notesOf(input) : [],
    ...(input.goal ? { slot: input.goal.slot, share: set.share ?? shareOfBasis(set.basis) } : {}),
  };
}

/**
 * One "Past week quests" line ("Week of 28 Sep · 4 of 5 done · capped · 2
 * days held", or "still settling" until its results are written). done and
 * total count quests, each read against count′ = round(count × the share of
 * its window's days still open), so a quest whose count′ is 0 is excused and
 * leaves the total. An empty set (held, past due, nothing asked) reads 0 of 0.
 */
export function pastWeekOf(set: WeekQuestSet, results: WeekQuestResults | null, milestoneOrd: number, today: DayKey): PastWeekView {
  void today; // settled means written; a week past its Wednesday the chain hasn't reached yet still reads settling
  const base = { weekStart: set.weekStart, milestoneOrd, capped: set.cappedBy === "CATCHUP" };
  if (!results) return { ...base, settled: false, done: 0, total: 0, heldDays: 0 };
  const share = nonHeldShareOf(set, results);
  const byOrd = new Map(results.rows.map((r) => [r.ord, r]));
  let done = 0;
  let total = 0;
  for (const q of set.quests) {
    const scaled = scaledCountOf(q.count, share);
    if (scaled === 0) continue;
    total += 1;
    if ((byOrd.get(q.ord)?.progress ?? 0) >= scaled) done += 1;
  }
  return { ...base, settled: true, done, total, heldDays: Math.max(0, results.heldAfterFreeze) };
}

/** Units a count reads in ("3 of 8 cards"): exported for the copy and the checks. */
export function unitWord(unit: WeekQuestUnit, n: number): string {
  switch (unit) {
    case "card":
      return plural(n, "card", "cards");
    case "session":
      return plural(n, "session", "sessions");
    case "day":
      return plural(n, "day", "days");
    case "step":
      return plural(n, "step", "steps");
    case "log":
      return plural(n, "score", "scores");
  }
}

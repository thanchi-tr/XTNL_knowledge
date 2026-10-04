/**
 * Week quests (roadmap lane R6; roadmap.md revision 3, F13, F14): the
 * started milestone sliced into this life week (Monday 04:00 to Monday 04:00,
 * Sydney). Generation and verification are pure, deterministic and
 * client-importable: no Prisma, no clock, no model call. Labels are fixed
 * code templates filled only with YoursText, CodeText, DomainNames and
 * WORKED_OUT numbers. Week quests pay nothing and have no checkbox.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R6. Imports nothing from
 * roadmap-model, roadmap-validate or roadmap-evidence. One of the five files
 * allowed to call the number-brand constructors (questProgress' figures, in
 * weekQuestsViewOf).
 *
 *   weekQuestsFor · questProgress · weekQuestResultsOf · weekDoneShare · questsBehind
 *   weekQuestsViewOf · pastWeekOf
 *   added by R6: questsBehindLine · questWindowOf · nonHeldShareOf · scaledCountOf · unitWord
 *                WeekQuestResultsStored · WEEK_QUEST_CAPTION · WEEK_QUEST_NOTE_PATTERNS
 *
 * Every count is WORKED_OUT and every basis line says what produced it. The
 * basis lines are stored with the frozen set (RoadmapQuestWeek.basis), so
 * the "How these were set" sheet shows what was asked and why, never
 * today's recomputation. Lines start with their group ("Bring:", "Add:",
 * "Sessions:", "Step:", "Checkpoint:", "Capacity:", "Week:") so the sheet can
 * group them; the roadmap page's notes are picked out of them by
 * WEEK_QUEST_NOTE_PATTERNS.
 */
import { LIFE_TZ, addDays, daysBetween, weekdayOf, type DayKey } from "./life-day";
import { WEEKDAY_SHORT, describeRule, parseRule } from "./recurrence";
import {
  CARD_WRITE_MIN,
  KEEP_SHARE,
  WEEK_QUEST_ADD_MIN_CAP,
  WEEK_QUEST_BEHIND_WRITING_WEEKS,
  WEEK_QUEST_CATCHUP_FACTOR,
  WEEK_QUEST_CHECKPOINT_FROM,
  WEEK_QUEST_EVIDENCE_OF,
  WEEK_QUEST_GENERATOR_VERSION,
  WEEK_QUEST_MAX_PER_KIND,
  WEEK_QUESTS_PER_WEEK_MAX,
  domainsText,
  effectiveState,
  existingExpected,
  bestReach,
  keptUnits,
  measured,
  passesNeeded,
  plannedUnits,
  recorded,
  selfReported,
  type AddQuestSpec,
  type CheckpointQuestSpec,
  type CodeText,
  type DomainName,
  type EffectiveCard,
  type EvidenceValue,
  type PastWeekView,
  type PracticeQuestSpec,
  type QuestEvidence,
  type RaiseQuestSpec,
  type StartWeek,
  type StepQuestSpec,
  type WeekQuestCap,
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

// ═══ Labels: code templates whose text slots take only the brands (F13 Labels) ══

/** "Bring {n} card(s) in {domains} to level {L}+". */
function raiseLabel(n: number, domains: readonly DomainName[], level: number): string {
  return `Bring ${n} ${plural(n, "card", "cards")} in ${domainsText(domains, "or")} to level ${level}+`;
}

/** "Add {n} card(s) to {domains}". */
function addLabel(n: number, domains: readonly DomainName[]): string {
  return `Add ${n} ${plural(n, "card", "cards")} to ${domainsText(domains, "or")}`;
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
  /^Bring: At the pass rate stored at Start, no card /,
  /^Bring: \d+ cards? already counted when you started /,
  /^Add: Practices and reviews fill this week's time/,
  /^Add: No time left for new cards this week/,
  /^Add: No new cards this week/,
  /^Capacity: This week's plan is more than /,
];

/** The snapshot's week for weekStart, else the nearest planned week before it (a reschedule ran past the plan), else null. */
function snapshotWeekOf(weeks: readonly StartWeek[], weekStart: DayKey): StartWeek | null {
  let best: StartWeek | null = null;
  for (const w of weeks) {
    if (w.weekStart === weekStart) return w;
    if (w.weekStart < weekStart && (!best || w.weekStart > best.weekStart)) best = w;
  }
  return best;
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
 * The week's set (F13): its state (OPEN, HELD, PAST_DUE), then RAISE, ADD,
 * PRACTICE (in ord), STEP and CHECKPOINT, each count WORKED_OUT from the gap
 * above the floor, the weeks left, the spaced-repetition reach at p_start,
 * the catch-up cap and the week's capacity; every basis line says what
 * produced it. Never more than WEEK_QUESTS_PER_WEEK_MAX.
 *
 * Reads only its input: every field is as of Monday 04:00 except card
 * levels (read at the freeze, named in the basis). Defensive about live
 * values a caller may pass: a step done or a checkpoint logged on or after
 * weekStart still counts as open as of Monday.
 */
export function weekQuestsFor(input: WeekQuestInput): WeekQuestSet {
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
  const card = input.card;
  const effective: EffectiveCard[] = card ? card.cards.map((c) => effectiveState(c, weekStart)) : [];
  const pStart = snapshot.pCalibrating ? 1 : snapshot.pStart;
  const bestCase = snapshot.pCalibrating;
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

  if (card && card.domainNames.length === 0) {
    basis.push("Bring: the milestone's Domains were removed, so there is nothing to bring or add.");
  }

  // 3. RAISE (TESTED).
  if (card && card.domainNames.length > 0) {
    const L = card.level;
    const b0 = Math.max(card.v0, card.baseline);
    const gap = Math.max(0, card.target - b0);
    if (card.v0 < card.baseline) {
      const slipped = card.baseline - card.v0;
      basis.push(
        `Bring: ${slipped} ${plural(slipped, "card", "cards")} already counted when you started ${plural(slipped, "has", "have")} slipped below level ${L}; bringing ${plural(slipped, "it", "them")} back doesn't move Milestone ${ord}, so this week asks from ${b0}.`
      );
    }
    if (gap === 0) {
      basis.push(`Bring: target held — ${card.target} at level ${L}+ is already counted; keep reviewing when due.`);
    } else {
      const reachable = effective.filter((c) => c.level < L && bestReach(c, L, m) <= to);
      const expected = bestCase ? reachable.length : reachable.reduce((sum, c) => sum + Math.pow(pStart, passesNeeded(c, L)), 0);
      const pace = ceilDiv(gap * e, wDays);
      const reach = ceilSafe(expected);
      const count = Math.min(pace, reach);
      const domains = domainsText(card.domainNames, "or");
      basis.push(`Bring: gap ${card.target} − ${b0} = ${gap} ${plural(gap, "card", "cards")} to bring to level ${L}+ (your reading before this week ${card.v0}; the milestone's baseline ${card.baseline}).`);
      basis.push(`Bring: weeks left ${oneDecimal(wDays / 7)}, this one included · pace ${gap} × ${e} ÷ ${wDays} days → ${pace}.`);
      if (reachable.length > 0) {
        basis.push(
          bestCase
            ? `Bring: reach ${reachable.length} ${plural(reachable.length, "card", "cards")} can reach level ${L} this week if passed on ${plural(reachable.length, "its", "their")} day (best case — your pass rate was still calibrating at Start). Asked: ${count}.`
            : `Bring: reach ${reachable.length} ${plural(reachable.length, "card", "cards")} can reach level ${L} this week if passed on ${plural(reachable.length, "its", "their")} day; at the ${pct(snapshot.pStart)}% pass rate stored at Start, about ${oneDecimal(expected)} (best case ${reachable.length}). Asked: ${count}.`
        );
        basis.push("Bring: a card that was due anyway counts: passing its review is the step. The schedule never lets a card level early.");
      }
      if (count === 0) {
        if (reachable.length === 0) {
          const later = effective.filter((c) => c.level < L).map((c) => bestReach(c, L, m)).filter((d) => d > to).sort();
          const first = later[0] ?? null;
          const by = first ? later.filter((d) => d <= first).length : 0;
          basis.push(
            first
              ? `Bring: No card in ${domains} can reach level ${L} this week even if every review passes; ${by} can by ${dayLabel(first)}.`
              : `Bring: No card in ${domains} can reach level ${L} this week even if every review passes.`
          );
        } else {
          basis.push(`Bring: At the pass rate stored at Start, no card is expected to reach level ${L} this week.`);
        }
      } else {
        if (pace > reach) basis.push(`Bring: the pace asks ${pace}, more than this week's reach; it asks ${count}. Whether that is a delay is the pace line's call, not this week's.`);
        built.push({
          kind: "RAISE",
          label: raiseLabel(count, card.domainNames, L),
          count,
          unit: "card",
          evidence: WEEK_QUEST_EVIDENCE_OF.RAISE,
          from,
          to,
          measureKey: card.measureKey,
          domainIds: [...card.domainIds],
          minLevel: L,
          floor: b0,
          dueDays: reachable.map((c) => c.dueDay).sort(),
          bestCase,
        });
      }
    }
  }

  // 4. ADD (RECORDED).
  const shift = daysBetween(snapshot.dueDay, dueDay);
  const lastCardDay = snapshot.lastCardDay ? addDays(snapshot.lastCardDay, shift) : null;
  if (card && card.domainNames.length > 0) {
    if (card.rateSource === "NONE") {
      basis.push("Add: new cards aren't counted: no pace yet, so no card is asked for.");
    } else if (!lastCardDay) {
      basis.push("Add: the plan has no writing window for new cards.");
    } else {
      const fwDays = eligibleDays(from, minDay(to, lastCardDay), held).length;
      if (fwDays === 0) {
        basis.push(
          `Add: No new cards this week: a card written after ${dayLabel(lastCardDay)} can't reach level ${card.level} by ${shortDay(dueDay)}.`
        );
      } else {
        const L = card.level;
        const wwDays = eligibleDays(from, lastCardDay, held).length;
        const existing = existingExpected(effective, L, dueDay, pStart, m);
        const yieldStart = snapshot.pCalibrating ? 1 : snapshot.yieldStart;
        const newNeeded = yieldStart > 0 ? Math.max(0, ceilSafe((card.target - existing) / yieldStart)) : 0;
        const pace = ceilDiv(newNeeded * fwDays, wwDays);
        const needRate =
          snapshot.weeks.find((w) => w.weekStart === weekStart)?.needRate ??
          (snapshot.wwStart > 0 ? (snapshot.newNeededStart * (fwDays / 7)) / snapshot.wwStart : 0);
        const cap = Math.max(WEEK_QUEST_ADD_MIN_CAP, ceilSafe(WEEK_QUEST_CATCHUP_FACTOR * needRate));
        const quotaMin = input.otherFieldQuotas * CARD_WRITE_MIN;
        const room = availE - practiceMin - reviewMin - quotaMin;
        const capFit = floorSafe(Math.max(0, room) / CARD_WRITE_MIN);
        const count = Math.min(pace, cap, capFit);
        let capped: WeekQuestCap | null = null;
        if (pace > cap && cap <= capFit) capped = "CATCHUP";
        else if (pace > capFit && capFit < cap) capped = "CAPACITY";
        cappedBy = capped;

        basis.push(
          `Add: still needed ${newNeeded} new ${plural(newNeeded, "card", "cards")} (each has a ${pct(yieldStart)}% chance${bestCase ? ", best case" : ""} of reaching level ${L} by ${shortDay(dueDay)}; your cards already there or on the way count about ${oneDecimal(existing)}).`
        );
        basis.push(
          `Add: writing weeks left ${oneDecimal(wwDays / 7)} — a card written after ${dayLabel(lastCardDay)} can't reach level ${L} by ${shortDay(dueDay)} · pace ${newNeeded} × ${fwDays} ÷ ${wwDays} days → ${pace}.`
        );
        basis.push(`Add: most a week asks ${WEEK_QUEST_CATCHUP_FACTOR} × the ${oneDecimal(needRate)} a week the plan needed at Start (at least ${WEEK_QUEST_ADD_MIN_CAP}) → ${cap}.`);
        basis.push(
          `Add: room ${minutesText(availE)} available − ${minutesText(practiceMin + reviewMin)} of practices and reviews${quotaMin > 0 ? ` − ${minutesText(quotaMin)} for other Fields' weekly quotas (${input.otherFieldQuotas} ${plural(input.otherFieldQuotas, "card", "cards")})` : ""} → ${capFit} ${plural(capFit, "card", "cards")} at ${CARD_WRITE_MIN} min. Asked: ${count}${capped ? "" : "; no cap bound"}.`
        );
        if (input.areaQuotaField) basis.push(`Add: ${possessive(input.areaQuotaField.name)} weekly quota counts these cards too.`);
        if (input.otherFieldQuotas === 0) basis.push("Add: other Fields' weekly quotas: none this week.");
        if (capped === "CATCHUP") {
          basis.push(
            `Add: asks ${count} of the ${pace} new cards needed to stay on plan; ${WEEK_QUEST_CATCHUP_FACTOR} × the ${oneDecimal(needRate)} a week the plan needed at Start is the most a week asks. Missed cards are not piled onto the week.`
          );
        } else if (capped === "CAPACITY") {
          basis.push(
            count === 0
              ? "Add: No time left for new cards this week: practices and reviews fill it."
              : `Add: Practices and reviews fill this week's time, so it asks ${count} of the ${pace} new cards the plan needs.`
          );
        }
        if (count > 0) {
          built.push({
            kind: "ADD",
            label: addLabel(count, card.domainNames),
            count,
            unit: "card",
            evidence: WEEK_QUEST_EVIDENCE_OF.ADD,
            from,
            to,
            domainIds: [...card.domainIds],
            fieldId: card.fieldId,
            quotaField: input.areaQuotaField ? { ...input.areaQuotaField } : null,
            pace,
            writingWeeksLeft: wwDays / 7,
            lastCardDay,
          });
        } else if (capped !== "CAPACITY") {
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
  basis.push(`Capacity: ${minutesText(availE)} this week (${capacityWords}).`);
  const planMin = practiceMin + reviewMin + stepMin;
  if (planMin > availE + EPS) {
    basis.push(`Capacity: This week's plan is more than the time you've shown (${minutesText(planMin)} of ${minutesText(availE)}); the practices are still asked for, as the plan's own.`);
  }

  // 9. Order and cap: RAISE, ADD, PRACTICE (in ord), STEP, CHECKPOINT.
  const order: Record<WeekQuestKind, number> = { RAISE: 0, ADD: 1, PRACTICE: 2, STEP: 3, CHECKPOINT: 4 };
  const sorted = built.map((b, i) => ({ b, i })).sort((x, y) => order[x.b.kind] - order[y.b.kind] || x.i - y.i);
  const quests = sorted.slice(0, WEEK_QUESTS_PER_WEEK_MAX).map(({ b }, i) => ({ ...b, ord: i + 1 }) as WeekQuestSpec);
  if (quests.length === 0) basis.push("Week: nothing to ask this week.");
  return { ...head, state: "OPEN", quests, basis, cappedBy };
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
 */
export function questProgress(spec: WeekQuestSpec, evidence: QuestEvidence): WeekQuestProgress {
  let progress = 0;
  let slipped: WeekQuestProgress["slipped"] = null;
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
 * Never on HELD or PAST_DUE, never on a CAPACITY cap.
 */
export function questsBehind(set: WeekQuestSet | null): boolean {
  if (!set || set.state !== "OPEN" || set.cappedBy !== "CATCHUP") return false;
  const add = set.quests.find((q): q is AddQuestSpec => q.kind === "ADD");
  return !!add && add.writingWeeksLeft < WEEK_QUEST_BEHIND_WRITING_WEEKS;
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
}

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
      const domain = spec.domainIds[0];
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

function rowOf(spec: WeekQuestSpec, p: WeekQuestProgress | undefined, input: WeekQuestsViewInput): WeekQuestRow {
  const progress = p ? p.progress : 0;
  const done = p ? p.done : progress >= spec.count;
  let slipLine: string | null = null;
  if (spec.kind === "RAISE" && p?.slipped && p.slipped.from > progress) {
    const n = p.slipped.from - progress;
    slipLine = `${n} ${plural(n, "card", "cards")} slipped back to level ${Math.max(1, spec.minLevel - 1)}${p.slipped.day ? ` on ${weekdayWord(p.slipped.day)}` : ""}`;
  }
  const templateId = spec.kind === "PRACTICE" || spec.kind === "STEP" ? spec.templateId : null;
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
    href: hrefOf(spec, input.variant),
  };
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
export function weekQuestsViewOf(input: WeekQuestsViewInput): WeekQuestsView {
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

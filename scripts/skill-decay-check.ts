/**
 * Blueprint P28 (3.1b; decisions D24 and D24b; harms H1 and H2 in docs/life-plan/blueprint-plan-2026-10-22.md): condition
 * decay for skills and attributes, behind DECAY_LAUNCH_DAY. Pure: no database (the basis's reads are fakes), no clock
 * (every day is passed in), no env read but the switch's own, no network, no model. PASS/FAIL per line; exits 1 on any
 * failure. It holds whatever the switch is (every launch day here is passed in), so it passes with the override on too.
 *
 *   npx tsx scripts/skill-decay-check.ts      (npm run skill-decay:check; life:check runs it after audit-decay-check)
 *
 *   §1 the switch: null in code, the XTNL_ override honoured only outside production, decayOn from the launch day, and
 *      in force from the later of it and Duty's launch (decayFromOf: rest, sick and vacation days are held only then)
 *   §2 the curve: 100% through the 3-day grace, e^(−λ·(idle − 3)) after, λ 0.02 / 0.01 / 0.005 (D24), the floor 0.5
 *   §3 idle days: no history before the launch → 100%; nothing practised ever → 100%; a 30-day vacation → no decay;
 *      rest-token days and today are never idle; one practice → 100% at once
 *   §4 the basis: each track's last practice to its attribute, Knowledge's to Intellect, the held days inside
 *      [launch, today); nothing read at all while the switch is off
 *   §5 the traits (D24b): every condition at 100% reads exactly the traits before P28; the floor halves each source;
 *      the life rows take their track's condition and the Field rows Intellect's
 *   §6 the emblem freeze (D24b): an owned emblem the lowered traits miss but the full ones meet is frozen ("Frozen ·
 *      Body 12 days idle · a Body tick thaws it (…)"), never re-locked; one practice thaws it, and a thaw plays no unlock
 *      ceremony; one its Fields lost is dormant, never frozen; a level guard (ward, grace, interval, strikes) never
 *      freezes and the guards in force are the full traits' (D24: levels never drop), so forgetting is the same on or off
 *   §7 the views: the Status rows, the Skills page, the Traits card's line, /check's `skills` (rounded down, so the
 *      phone's percent is the web's), the audit's condition lines, and the frozen marks on the strip, the loadout and
 *      the graph; none while off
 *   §8 never history: no level, XP, hours or title moves; the skill-decay files write no ledger and import no writer;
 *      the wiring (skill-effects, the title readers, the rules page, the phone); the package
 */
import "./_no-model";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LEDGER_WRITES, ROOT, excerpt, importsOf, readCode, srcFiles, writerModulesOf } from "./_ledger-writers";
import { addDays, type DayKey } from "../src/lib/life-day";
import { ATTRIBUTES, computeAttributeScores, emptyComposition, type AttributeScores, type Composition, type FieldContribution } from "../src/lib/attributes";
import { SKILL_POOL, type Skill } from "../src/lib/skill-pool";
import { meetsRequirements, resolveWardAnchor } from "../src/lib/skill-gates";
import { diffProgress, type ProgressData } from "../src/lib/celebration-detect";
import { knowledgeRow } from "../src/components/home/sheet-math";
import { statusPanelOf } from "../src/lib/status-panel";
import { StatusPanel } from "../src/components/home/StatusPanel";
import { CompetencyBoard, type CompetencyActions } from "../src/components/home/CompetencyBoard";
import { lifeRowName, type LifeTrackRow } from "../src/lib/life-tracks";
import { NO_SKILL_FACTS, skillsOf, type SkillRow, type SkillTick } from "../src/lib/competency";
import { DECAY_KINDS, NO_DECAY, conditionLinesOf, decayingOf, parseDecaying } from "../src/lib/audit-decay";
import { checkSkillsOf } from "../src/lib/mobile-api";
import { bootstrapScores, conditionedRows, resolveProgression, scoresWithStreak, type FieldRow, type ProgressionReads } from "../src/lib/skill-effects";
import { levelsForgotten } from "../src/lib/forgetting";
import { graceEndsAt } from "../src/lib/xp";
import { AttributeRadar } from "../src/components/home/SheetSections";
import { readConditionBasis, loadConditionBasis, type ConditionReads } from "../src/lib/skill-decay-server";
import {
  ATTRIBUTE_DECAY_CLASS,
  CHECK_CONDITION_BELOW,
  CONDITION_FLOOR,
  CONDITION_GRACE_DAYS,
  CONDITION_NAME,
  DECAY_LAMBDA,
  DECAY_LAUNCH_DAY,
  DECAY_LAUNCH_DAY_ENV,
  FROZEN_HINT,
  FROZEN_NOTE,
  LEVEL_GUARD_KINDS,
  attributeConditionsOf,
  checkConditionsOf,
  conditionItemsOf,
  conditionLineOf,
  conditionNoteOf,
  conditionOf,
  conditionPercent,
  conditionRestoreOf,
  conditionRuleLines,
  conditionTextOf,
  decayFromOf,
  decayLaunchDay,
  decayOn,
  frozenEmblemsOf,
  frozenLineOf,
  guardsLevels,
  idleDaysOf,
  idleFeedersOf,
  missedRequirementOf,
  scaleFieldLevel,
  scaleLifeRows,
  skillConditionOf,
  skillDecayClass,
  traitScaleOf,
  traitsConditionLineOf,
  withLevelGuards,
  type ConditionBasis,
} from "../src/lib/skill-decay";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number, eps = 1e-12) => Math.abs(a - b) <= eps;
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** The launch day in this check (any day: the code constant stays null until the user's go). */
const L: DayKey = "2026-10-26";
const d = (n: number): DayKey => addDays(L, n);
const NONE: Record<"VITALITY" | "INTELLECT" | "CRAFT" | "DUTY" | "CARE", DayKey | null> = { VITALITY: null, INTELLECT: null, CRAFT: null, DUTY: null, CARE: null };
const basisOf = (today: DayKey, last: Partial<typeof NONE>, held: DayKey[] = []): ConditionBasis => ({ launch: L, today, held, last: { ...NONE, ...last } });

// ═══ §1 The switch ═════════════════════════════════════════════════════════

console.log("— §1 the switch —");
check("DECAY_LAUNCH_DAY is null in code (inert until the user's go), its override named XTNL_DECAY_LAUNCH_DAY", DECAY_LAUNCH_DAY === null && DECAY_LAUNCH_DAY_ENV === "XTNL_DECAY_LAUNCH_DAY");
check(
  "the override is honoured only outside production, and only a real day",
  decayLaunchDay({ NODE_ENV: "development", XTNL_DECAY_LAUNCH_DAY: L }) === L &&
    decayLaunchDay({ NODE_ENV: "production", XTNL_DECAY_LAUNCH_DAY: L }) === null &&
    decayLaunchDay({ NODE_ENV: "development", XTNL_DECAY_LAUNCH_DAY: "2026-02-30" }) === null &&
    decayLaunchDay({ NODE_ENV: "development" }) === null
);
check("decayOn: from the launch day on, never before it, never with no launch day", decayOn(L, L) && decayOn(d(40), L) && !decayOn(d(-1), L) && !decayOn(d(40), null));
check(
  "decayFromOf: in force from the later of its own launch and Duty's, never while either is unset (before Duty no rest, sick or vacation day can be declared or held)",
  decayFromOf(L, "2026-10-12") === L && decayFromOf("2026-10-12", L) === L && decayFromOf(L, null) === null && decayFromOf(null, L) === null && decayFromOf(null, null) === null
);

// ═══ §2 The curve ══════════════════════════════════════════════════════════

console.log("— §2 the curve (D24) —");
check("λ: 0.02 physical, 0.01 cognitive, 0.005 the rest; the grace 3 days; the floor 0.5", same(DECAY_LAMBDA, { PHYSICAL: 0.02, COGNITIVE: 0.01, OTHER: 0.005 }) && CONDITION_GRACE_DAYS === 3 && CONDITION_FLOOR === 0.5);
check(
  "the classes: Vitality physical, Intellect and Craft cognitive, Duty and Care the rest; an exercise skill physical, any other skill its attribute's",
  same(ATTRIBUTE_DECAY_CLASS, { VITALITY: "PHYSICAL", INTELLECT: "COGNITIVE", CRAFT: "COGNITIVE", DUTY: "OTHER", CARE: "OTHER" }) &&
    skillDecayClass({ attribute: "VITALITY", kind: "EXERCISE" }) === "PHYSICAL" &&
    skillDecayClass({ attribute: "INTELLECT", kind: "PRACTICE" }) === "COGNITIVE" &&
    skillDecayClass({ attribute: "CARE", kind: "PRACTICE" }) === "OTHER" &&
    skillDecayClass({ attribute: "LOST", kind: "PRACTICE" }) === "OTHER"
);
check("100% through the grace (0 to 3 idle days), at every λ", [0, 1, 2, 3].every((n) => Object.values(DECAY_LAMBDA).every((l) => conditionOf(n, l) === 1)));
check(
  "past it: e^(−λ·(idle − 3)): Body 12 idle days 0.835, Craft 12 days 0.914, Care 12 days 0.956",
  near(conditionOf(12, 0.02), Math.exp(-0.18)) && near(conditionOf(12, 0.01), Math.exp(-0.09)) && near(conditionOf(12, 0.005), Math.exp(-0.045)) && conditionPercent(conditionOf(12, 0.02)) === 83
);
const floorDays = [38, 40, 100, 365, 3650, 1e9];
check(
  "the floor holds at 0.5: Body from 38 idle days on (e^(−0.7) is 0.497), and never below at any idle count or λ",
  conditionOf(37, 0.02) > 0.5 && floorDays.every((n) => conditionOf(n, 0.02) === CONDITION_FLOOR) && [0.005, 0.01, 0.02, 5].every((l) => floorDays.every((n) => conditionOf(n, l) >= CONDITION_FLOOR))
);
check("it only falls: never up with more idle days", Object.values(DECAY_LAMBDA).every((l) => Array.from({ length: 200 }, (_, n) => conditionOf(n + 1, l) <= conditionOf(n, l)).every(Boolean)));
check("bad input reads as no idle time: NaN, negative and fractional idle days, NaN λ", conditionOf(Number.NaN, 0.02) === 1 && conditionOf(-5, 0.02) === 1 && conditionOf(4.9, 0.02) === conditionOf(4, 0.02) && conditionOf(20, Number.NaN) === 1);

// ═══ §3 Idle days ══════════════════════════════════════════════════════════

console.log("— §3 idle days —");
{
  const longAgo = addDays(L, -400);
  check(
    "no history before the launch → 100%: a track last ticked 400 days before it reads 0 idle days on the launch day, 3 three days on (still 100%), and is idle only from the launch",
    idleDaysOf({ lastDay: longAgo, launch: L, today: L }) === 0 &&
      idleDaysOf({ lastDay: longAgo, launch: L, today: d(3) }) === 3 &&
      conditionOf(idleDaysOf({ lastDay: longAgo, launch: L, today: d(3) }), 0.02) === 1 &&
      idleDaysOf({ lastDay: longAgo, launch: L, today: d(13) }) === 13
  );
  check("nothing practised ever → 100% (nothing built yet to keep), however long after the launch", idleDaysOf({ lastDay: null, launch: L, today: d(400) }) === 0 && attributeConditionOfFixture(basisOf(d(400), {}), "VITALITY") === 1);
  const vacation = Array.from({ length: 30 }, (_, i) => d(2 + i));
  const vIdle = idleDaysOf({ lastDay: d(1), launch: L, today: d(32), held: new Set(vacation) });
  check(
    "a 30-day vacation → no decay: Body ticked on day 1, away days 2 to 31, read on day 32: 0 idle days, 100%",
    vIdle === 0 && attributeConditionOfFixture(basisOf(d(32), { VITALITY: d(1) }, vacation), "VITALITY") === 1,
    `idle ${vIdle}`
  );
  check(
    "…and the day after it counts again: day 36 is 4 idle days (days 32 to 35), so Body reads e^(−0.02)",
    near(attributeConditionOfFixture(basisOf(d(36), { VITALITY: d(1) }, vacation), "VITALITY"), Math.exp(-0.02))
  );
  check("a rest-token (freeze) day and a rest or sick day are never idle", idleDaysOf({ lastDay: d(0), launch: L, today: d(6), held: new Set([d(2), d(4)]) }) === 3);
  check("today is never idle (it isn't over), and a practice today is 0 idle days", idleDaysOf({ lastDay: d(9), launch: L, today: d(10) }) === 0 && idleDaysOf({ lastDay: d(10), launch: L, today: d(10) }) === 0);
  check(
    "one practice brings it back to 100% at once: 60 idle days at the floor, then a tick on day 61",
    attributeConditionOfFixture(basisOf(d(61), { VITALITY: d(0) }), "VITALITY") === 0.5 && attributeConditionOfFixture(basisOf(d(61), { VITALITY: d(61) }), "VITALITY") === 1
  );
  check("before the launch day nothing is idle", idleDaysOf({ lastDay: d(-30), launch: L, today: d(-1) }) === 0);
}

function attributeConditionOfFixture(b: ConditionBasis, key: keyof typeof NONE): number {
  return attributeConditionsOf(b)[key].condition;
}

// ═══ §4 The basis ══════════════════════════════════════════════════════════

console.log("— §4 the basis —");
void (async () => {
  try {
    const calls: string[] = [];
    const reads: ConditionReads = {
      trackDays: async (_u, today) => (calls.push(`tracks ${today}`), [
        { track: "BODY", day: d(2) },
        { track: "CRAFT", day: d(5) },
        { track: "NOT_A_TRACK", day: d(9) },
        { track: "CARE", day: d(30) },
      ]),
      knowledgeDay: async (_u, today) => (calls.push(`knowledge ${today}`), d(4)),
      heldDays: async (_u, launch, today) => (calls.push(`held ${launch} ${today}`), [d(-3), d(3), d(3), d(7), d(10), d(11)]),
    };
    const now = new Date(`${d(10)}T02:00:00.000Z`); // 13:00 in Sydney on day 10
    const b = await loadConditionBasis("u1", now, { launch: L, reads });
    check(
      "each track's last practice to its attribute (Body → Vitality), Knowledge's to Intellect; an unknown track and a day after today are dropped",
      b != null && same(b.last, { VITALITY: d(2), INTELLECT: d(4), CRAFT: d(5), DUTY: null, CARE: null }),
      JSON.stringify(b?.last)
    );
    check("the held days inside [launch, today), once each, ascending", b != null && same(b.held, [d(3), d(7)]) && b.today === d(10) && b.launch === L, JSON.stringify(b?.held));
    check("…read once each, for today's life day", same(calls, [`tracks ${d(10)}`, `knowledge ${d(10)}`, `held ${L} ${d(10)}`]));
    const offCalls: string[] = [];
    const tripwire: ConditionReads = {
      trackDays: async () => (offCalls.push("tracks"), []),
      knowledgeDay: async () => (offCalls.push("knowledge"), null),
      heldDays: async () => (offCalls.push("held"), []),
    };
    const off = await loadConditionBasis("u1", now, { launch: null, reads: tripwire });
    const ahead = await loadConditionBasis("u1", now, { launch: d(11), reads: tripwire });
    check("while the switch is off (no launch day, or one ahead) the basis is null and nothing is read", off === null && ahead === null && offCalls.length === 0);
    check("as shipped (DECAY_LAUNCH_DAY null, no override) the default read is null with no read", DECAY_LAUNCH_DAY !== null || process.env[DECAY_LAUNCH_DAY_ENV] !== undefined || (await loadConditionBasis("u1", now)) === null);
    const direct = await readConditionBasis("u1", L, d(10), reads);
    check("readConditionBasis is the same read the cache wraps", same(direct, b));
    if (b) {
      const c = attributeConditionsOf(b);
      check(
        "on day 10: Vitality 5 idle days (days 3 to 9, less the held days 3 and 7), Intellect 4, Craft 3 (100%), Duty and Care never practised (100%)",
        c.VITALITY.idleDays === 5 && c.INTELLECT.idleDays === 4 && c.CRAFT.idleDays === 3 && c.CRAFT.condition === 1 && c.DUTY.condition === 1 && c.CARE.condition === 1 && near(c.VITALITY.condition, Math.exp(-0.04)),
        JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.idleDays])))
      );
    }
  } catch (err) {
    check("the basis section ran to the end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
  }
  // The loadout strip reaches its stylesheet: a stylesheet is nothing here.
  (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
    m.exports = {};
  };
  rest((await import("../src/components/skills/LoadoutStrip")).LoadoutStrip);
})();

function rest(LoadoutStrip: typeof import("../src/components/skills/LoadoutStrip").LoadoutStrip): void {
  // ═══ §5 The traits (D24b) ════════════════════════════════════════════════

  console.log("— §5 the traits (D24b) —");
  const comp = (weights: Partial<Composition>): Composition => ({ ...emptyComposition(), ...weights });
  const fields: FieldRow[] = [
    { id: "f-stats", name: "Statistics", level: 14, composition: comp({ STATISTIC: 60, LOGIC: 40 }) },
    { id: "f-art", name: "Drawing", level: 6, composition: comp({ CREATIVITY: 70, ABSTRACT: 30 }) },
  ];
  const life: FieldContribution[] = [
    { fieldName: lifeRowName("BODY"), level: 9, composition: comp({ PHYSICAL: 50, STUBBORNNESS: 50 }), source: "LIFE" },
    { fieldName: lifeRowName("CRAFT"), level: 7, composition: comp({ CREATIVITY: 40, LOGIC: 60 }), source: "LIFE" },
    { fieldName: lifeRowName("DUTY"), level: 5, composition: comp({ SELF_RESPECT: 100 }), source: "LIFE" },
    { fieldName: lifeRowName("CARE"), level: 4, composition: comp({ COMPASSION: 100 }), source: "LIFE" },
  ];
  const streaks = { "f-stats": 9.4 };
  const full = scoresWithStreak(fields, streaks, 1, life);
  const at = (c: number) => ({ condition: c });
  const all = (c: number) => traitScaleOf({ VITALITY: at(c), INTELLECT: at(c), CRAFT: at(c), DUTY: at(c), CARE: at(c) });
  const unity = conditionedRows(fields, life, all(1));
  check("every condition at 100% reads exactly the traits before P28 (the same scores, to the last digit)", same(scoresWithStreak(unity.rows, streaks, 1, unity.lifeRows), full));
  const half = conditionedRows(fields, life, all(CONDITION_FLOOR));
  const halfScores = scoresWithStreak(half.rows, streaks, 1, half.lifeRows);
  check("at the floor every source gives half (each trait half, to the rounding)", ATTRIBUTES.every((a) => Math.abs(halfScores[a] - full[a] / 2) <= 0.011), JSON.stringify(halfScores));
  const bodyOnly = traitScaleOf({ VITALITY: at(0.8), INTELLECT: at(1), CRAFT: at(1), DUTY: at(1), CARE: at(1) });
  const scaledLife = scaleLifeRows(life, bodyOnly);
  check(
    "an idle Body lowers only Life · Body (its level × Vitality's condition); the other rows, the Fields and the input are as they were",
    near(scaledLife[0].level, 9 * 0.8) && scaledLife.slice(1).every((r, i) => r.level === life[i + 1].level && r.fieldName === life[i + 1].fieldName) && life[0].level === 9 && conditionedRows(fields, life, bodyOnly).rows.every((f, i) => f.level === fields[i].level)
  );
  const knowIdle = traitScaleOf({ VITALITY: at(1), INTELLECT: at(0.7), CRAFT: at(1), DUTY: at(1), CARE: at(1) });
  check(
    "an idle Intellect lowers every Field row (its breadth × Intellect's condition) and no life row",
    near(scaleFieldLevel(14, knowIdle), 9.8) && conditionedRows(fields, life, knowIdle).rows.every((f, i) => near(f.level, fields[i].level * 0.7)) && conditionedRows(fields, life, knowIdle).lifeRows.every((r, i) => r.level === life[i].level)
  );
  const lowered = scoresWithStreak(conditionedRows(fields, life, bodyOnly).rows, streaks, 1, conditionedRows(fields, life, bodyOnly).lifeRows);
  check("a lowered trait is never above its full value", ATTRIBUTES.every((a) => lowered[a] <= full[a]) && lowered.PHYSICAL < full.PHYSICAL && lowered.STATISTIC === full.STATISTIC);

  // ═══ §6 The emblem freeze (D24b) ═════════════════════════════════════════

  console.log("— §6 the emblem freeze (D24b) —");
  // Not a level guard (those never freeze: §6b).
  const emblem = SKILL_POOL.find((s) => s.rank === "PURE" && s.attributes.length === 1 && s.attributes[0] === "PHYSICAL" && !s.breadthRequirement && s.requiredScore > 10 && !guardsLevels(s)) as Skill;
  const need = emblem.requiredScore;
  const scoresWith = (physical: number): AttributeScores => ({ ...computeAttributeScores([]), PHYSICAL: physical });
  const fullSide = { scores: scoresWith(need + 1), resonancePercent: 0 };
  const lowSide = { scores: scoresWith(need - 0.5), resonancePercent: 0 };
  const frozen = frozenEmblemsOf([emblem], lowSide, fullSide);
  const want = `Frozen · thaws at Physical ${Number.isInteger(need) ? need.toLocaleString("en-GB") : need.toLocaleString("en-GB", { maximumFractionDigits: 1 })}`;
  check(`frozen: an owned emblem (${emblem.name}, Physical ${need}) the lowered traits miss and the full ones meet: "${want}"`, same(frozen, { [emblem.code]: want }) && frozenLineOf({ label: "Physical", need }) === want, JSON.stringify(frozen));
  check("…its effect pauses: it is not active on the lowered traits (it leaves the fold), and is on the full ones", !meetsRequirements(emblem, lowSide.scores) && meetsRequirements(emblem, fullSide.scores));
  check("it thaws once the trait is back at the requirement: nothing is frozen (no write, no step)", same(frozenEmblemsOf([emblem], { scores: scoresWith(need), resonancePercent: 0 }, fullSide), {}));
  check(
    "dormant, never frozen: an emblem its Fields lost (the full traits miss it too) is not the condition's doing",
    same(frozenEmblemsOf([emblem], lowSide, { scores: scoresWith(need - 1), resonancePercent: 0 }), {}) && missedRequirementOf(emblem, lowSide.scores)?.need === need
  );
  check(
    "the gate's factor counts on each side: RESONANCE on the lowered side can hold it in effect, DOUBT can freeze it",
    same(frozenEmblemsOf([emblem], { scores: scoresWith(need * 0.95), resonancePercent: 10 }, fullSide), {}) && Object.keys(frozenEmblemsOf([emblem], { scores: scoresWith(need), resonancePercent: 0 }, { scores: scoresWith(need * 2), resonancePercent: 0 }, 10)).length === 1
  );
  const snap = (codes: readonly string[]): ProgressData => ({ parts: ["skills"], skills: { owned: codes.map((code) => ({ code, paid: emblem.masteryCost })), mp: 40 } });
  const owned = [emblem.code];
  const thaw = diffProgress(snap(owned), snap(owned));
  const bought = diffProgress(snap([]), snap(owned));
  check(
    "a freeze and a thaw play no ceremony: ownership is the same rows before and after (only a new UnlockedSkill row is an unlock)",
    thaw.length === 0 && bought.some((x) => x.kind === "emblem-unlock" || x.kind === "first-ultimate"),
    JSON.stringify(thaw.map((x) => x.kind))
  );
  check(
    "the frozen note says it stays owned, that one practice on the idle attribute thaws it (never 'by itself': waiting never does), with nothing to unlock again",
    /stays yours/.test(FROZEN_NOTE) && /One practice on that attribute brings the trait back and thaws it/.test(FROZEN_NOTE) && /nothing to unlock again/.test(FROZEN_NOTE) && !/by itself/.test(FROZEN_NOTE) &&
      FROZEN_HINT === "thaws with practice, nothing to unlock"
  );
  // The line names what is idle and what thaws it (review): the idle attributes feeding the missed trait.
  const feederConds = { VITALITY: { condition: 0.8, idleDays: 14 }, INTELLECT: { condition: 0.7, idleDays: 39 }, CRAFT: { condition: 0.9, idleDays: 13 }, DUTY: { condition: 1, idleDays: 2 }, CARE: { condition: 1, idleDays: 0 } };
  const sources = { fields, life };
  check(
    "idleFeedersOf: the idle attributes whose sources feed the trait, the lowest first (Logic: Knowledge's Fields and Craft's life row; Physical: Body's; Compassion: Care at 100%, none)",
    same(idleFeedersOf("LOGIC", sources, feederConds).map((c) => c.key), ["INTELLECT", "CRAFT"]) &&
      same(idleFeedersOf("PHYSICAL", sources, feederConds).map((c) => c.key), ["VITALITY"]) &&
      same(idleFeedersOf("COMPASSION", sources, feederConds), []),
    JSON.stringify(idleFeedersOf("LOGIC", sources, feederConds))
  );
  check(
    "the frozen line: one idle attribute names its days and the practice that thaws it, then the trait; two name both; none says only the thaw point",
    frozenLineOf({ label: "Critical Thinking", need: 14.2 }, [{ key: "INTELLECT", name: "Knowledge", idleDays: 12 }]) === "Frozen · Knowledge 12 days idle · a review or a new idea thaws it (Critical Thinking 14.2)" &&
      frozenLineOf({ label: "Physical", need: 120 }, [{ key: "VITALITY", name: "Body", idleDays: 12 }, { key: "CRAFT", name: "Craft", idleDays: 9 }]) === "Frozen · Body 12 days idle, Craft 9 days idle · practice on them thaws it (Physical 120)" &&
      frozenLineOf({ label: "Physical", need: 120 }) === "Frozen · thaws at Physical 120"
  );
  const frozenWith = frozenEmblemsOf([emblem], lowSide, fullSide, 0, (trait) => (trait === "PHYSICAL" ? [{ key: "VITALITY", name: "Body", condition: 0.8, idleDays: 14 }] : []));
  check(
    "frozenEmblemsOf names the causes its reader finds for the missed trait",
    frozenWith[emblem.code] === frozenLineOf({ label: "Physical", need }, [{ key: "VITALITY", name: "Body", idleDays: 14 }]) && frozenWith[emblem.code].includes("a Body tick thaws it"),
    JSON.stringify(frozenWith)
  );

  // Levels never drop (D24 over D24b's pause): a level guard never freezes, and the guards in force are the full fold's.
  console.log("— §6b the level guards (D24: an idle attribute never costs a card a level) —");
  const tier1 = (kind: string) => SKILL_POOL.find((x) => x.rank === "PURE" && x.tier === 1 && x.effect.kind === kind && x.prerequisites.length === 0) as Skill;
  const guards = ["GRACE_EXTENSION", "DEGRADATION_WARD", "INTERVAL_DILATION", "STRIKE_TOLERANCE"].map(tier1);
  const yieldEmblem = tier1("REVIEW_YIELD");
  const kit = [...guards, yieldEmblem];
  check(
    "the guards: a ward, grace before forgetting, longer intervals and strike tolerance (guardsLevels); a review-yield emblem is not one",
    same([...LEVEL_GUARD_KINDS].sort(), ["DEGRADATION_WARD", "GRACE_EXTENSION", "INTERVAL_DILATION", "STRIKE_TOLERANCE"]) && guards.every(guardsLevels) && !guardsLevels(yieldEmblem) && kit.every((x) => x != null)
  );
  const kitAttrs = [...new Set(kit.map((x) => x.attributes[0]))];
  const kitNeed = Math.max(...kit.map((x) => x.requiredScore));
  // One Field feeding every attribute the kit needs, at 1.5× each requirement: Intellect at the floor halves it under them all.
  const kitField: FieldRow = { id: "f-kit", name: "Everything", level: (1.5 * kitNeed * 100) / (100 / kitAttrs.length), composition: comp(Object.fromEntries(kitAttrs.map((a) => [a, 100 / kitAttrs.length]))) };
  const reads = (basis: ConditionBasis | null): ProgressionReads => ({
    rows: [kitField],
    streakBonuses: {},
    owned: kit.map((x, i) => ({ skillCode: x.code, equippedSlot: i })),
    debuffs: [],
    boons: [],
    augments: [],
    lifeRows: [],
    basis,
  });
  const idleMind = basisOf(d(100), { INTELLECT: d(0) });
  const off = resolveProgression(reads(null));
  const on = resolveProgression(reads(idleMind));
  const codes = (xs: readonly Skill[]) => xs.map((x) => x.code).sort();
  check(
    "the fixture: Intellect at the floor (99 days idle) lowers every trait the kit needs under its requirement; with decay off all five are in effect",
    attributeConditionsOf(idleMind).INTELLECT.condition === CONDITION_FLOOR && kitAttrs.every((a) => on.scores[a] < kitNeed && on.fullScores[a] >= kitNeed) && same(codes(off.activeSkills), codes(kit)),
    JSON.stringify(kitAttrs.map((a) => [a, on.scores[a], on.fullScores[a]]))
  );
  check(
    "a level guard never freezes: the four guards stay in effect (owned, equipped, active) while the review-yield emblem freezes",
    guards.every((g) => on.activeSkills.some((x) => x.code === g.code) && on.frozen[g.code] == null && on.loadout.find((e) => e?.skill.code === g.code)?.frozen === null) &&
      on.frozen[yieldEmblem.code] != null && on.frozenSkills.some((x) => x.code === yieldEmblem.code) && !on.activeSkills.some((x) => x.code === yieldEmblem.code),
    JSON.stringify(on.frozen)
  );
  const guardFields = (m: typeof on.modifiers) => [m.graceExtraDays, m.intervalMultiplier, m.wardCharges, m.extraStrikes];
  check(
    "the guards in force are exactly decay-off's (grace, interval, ward charges, strikes); the frozen emblem's own effect is paused",
    same(guardFields(on.modifiers), guardFields(off.modifiers)) && off.modifiers.graceExtraDays > 0 && off.modifiers.wardCharges > 0 && off.modifiers.extraStrikes > 0 && off.modifiers.intervalMultiplier > 1 &&
      off.modifiers.reviewYieldMultiplier > 1 && on.modifiers.reviewYieldMultiplier === 1,
    JSON.stringify([guardFields(on.modifiers), guardFields(off.modifiers), on.modifiers.reviewYieldMultiplier])
  );
  check(
    "withLevelGuards: the lowered fold with every guard the full fold's, nothing else",
    same(withLevelGuards({ ...off.modifiers, graceExtraDays: 0, wardCharges: 0, extraStrikes: 0, intervalMultiplier: 1, reviewYieldMultiplier: 1 }, off.modifiers), { ...off.modifiers, reviewYieldMultiplier: 1 })
  );
  check(
    "the ward's charge reads the full traits' emblems (fullActiveSkills): the same anchor as with decay off; off, the very same array as activeSkills",
    same(codes(on.fullActiveSkills), codes(off.activeSkills)) && resolveWardAnchor(on.fullActiveSkills)?.code === resolveWardAnchor(off.activeSkills)?.code && resolveWardAnchor(off.activeSkills) != null && off.fullActiveSkills === off.activeSkills
  );
  const due = new Date("2026-10-01T00:00:00.000Z");
  const sameForgetting = Array.from({ length: 11 }, (_, i) => i + 2).every((level) =>
    Array.from({ length: 121 }, (_, o) => o).every((o) => levelsForgotten(level, o, on.modifiers.graceExtraDays) === levelsForgotten(level, o, off.modifiers.graceExtraDays)) &&
    graceEndsAt(due, level, on.modifiers.graceExtraDays).getTime() === graceEndsAt(due, level, off.modifiers.graceExtraDays).getTime()
  );
  check("forgetting is identical with decay on or off: every level 2 to 12 over 0 to 120 days overdue forgets the same, its grace ends the same day", sameForgetting);
  check(
    "while decay is off nothing of it shows: no frozen emblem, the full traits are the same object, and the one fold is the modifiers",
    same(off.frozen, {}) && off.fullScores === off.scores && off.frozenSkills.length === 0
  );
  check(
    "a frozen emblem's line names the idle attribute and what thaws it (Knowledge: a review or a new idea)",
    /^Frozen · Knowledge 99 days idle · a review or a new idea thaws it \(/.test(on.frozen[yieldEmblem.code] ?? ""),
    on.frozen[yieldEmblem.code]
  );
  const bootFull = bootstrapScores(fields, streaks, life, [emblem], new Set(), new Set(), 0);
  check("bootstrapScores is the two passes (full condition: the scores before P28)", same(bootFull.scores, full) && bootFull.resonancePercent === 0);

  // ═══ §7 The views ════════════════════════════════════════════════════════

  console.log("— §7 the views —");
  const row = (track: LifeTrackRow["track"], name: string): LifeTrackRow => ({
    track,
    name,
    sigil: track.toLowerCase() as LifeTrackRow["sigil"],
    level: 4,
    xp: 600,
    nextXp: 900,
    cap: 6,
    atCap: false,
    keptWeeks: 5,
    keptStreak: 1,
    goalDepth: 0,
    banked: 0.2,
    now: 0.4,
    weeks: ["kept"],
    line: "600 / 900 XP · depth cap 6",
    edge: 0.5,
  });
  const tracks = [row("DUTY", "Duty"), row("CRAFT", "Craft"), row("BODY", "Body"), row("CARE", "Care")];
  const k = knowledgeRow([{ name: "Statistics", level: 9 }], []);
  const basis = basisOf(d(16), { VITALITY: d(2), INTELLECT: d(15), CRAFT: d(14), DUTY: d(0), CARE: d(9) }, [d(5)]);
  const conds = attributeConditionsOf(basis);
  const panelOn = statusPanelOf({ launched: true, rows: tracks }, k, null, null, conds);
  const panelOff = statusPanelOf({ launched: true, rows: tracks }, k, null, null);
  check(
    "the Status rows carry their attribute's condition; none while off; the level, meter and line stay the track's",
    panelOn.rows.every((r) => r.condition != null && r.condition.condition === conds[r.key].condition) && panelOff.rows.every((r) => r.condition === null) &&
      panelOn.rows.every((r, i) => r.level === panelOff.rows[i].level && r.progress === panelOff.rows[i].progress && r.line === panelOff.rows[i].line)
  );
  const htmlOn = renderToStaticMarkup(createElement(StatusPanel, { panel: panelOn, capital: null }));
  const htmlOff = renderToStaticMarkup(createElement(StatusPanel, { panel: panelOff, capital: null }));
  const bodyLine = conditionNoteOf({ kind: "attribute", key: "VITALITY", attribute: "VITALITY", name: "Body", ...conds.VITALITY });
  check(
    `the Status card says the plan's words under an idle row: "${bodyLine}"; nothing at 100%, nothing while off`,
    bodyLine === `Body ${conditionPercent(conds.VITALITY.condition)}% · 12 days idle · a Body tick restores it` &&
      htmlOn.includes(bodyLine) &&
      !htmlOn.includes("Knowledge 100%") &&
      (htmlOn.match(/status-cond/g) ?? []).length === panelOn.rows.filter((r) => r.condition!.condition < 1).length &&
      !htmlOff.includes("status-cond"),
    `${(htmlOn.match(/status-cond/g) ?? []).length} lines`
  );
  check("the words: 'Body 81% · 13 days idle', '1 day idle', the percent rounded down", conditionTextOf("Body", { condition: 0.8187, idleDays: 13 }) === "Body 81% · 13 days idle" && conditionLineOf({ condition: 0.995, idleDays: 1 }) === "99% · 1 day idle");
  const skillRow = (id: string, over: Partial<SkillRow> = {}): SkillRow => ({ id, name: id, attribute: "CRAFT", kind: "PRACTICE", fieldId: null, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null, ...over });
  const tick = (id: string, templateId: string, day: DayKey, undone = false): SkillTick => ({ id, templateId, dedupeKey: `task:${id}`, receiptMinutes: 30, instanceMinutes: 30, instanceSource: "manual", day, undone });
  const views = skillsOf(
    [skillRow("sk-guitar", { name: "Guitar" }), skillRow("sk-walk", { name: "Walking", attribute: "VITALITY", kind: "EXERCISE" }), skillRow("sk-new", { name: "Spanish", attribute: "INTELLECT" })],
    {
      ...NO_SKILL_FACTS,
      templates: [{ id: "t-guitar", title: "Guitar", kind: "HABIT", competencyId: "sk-guitar", roadmapCompetencyId: null, boardId: null, estMinutes: 30 }],
      ticks: [tick("e1", "t-guitar", d(3)), tick("e2", "t-guitar", d(6), true)],
      walks: { minutes: 90, count: 2, lastDay: d(1) },
    }
  );
  const byName = new Map(views.map((v) => [v.name, v]));
  check(
    "a skill's last practice: its latest live tick (an undone one doesn't count), an exercise skill's latest walk, none with nothing",
    byName.get("Guitar")?.lastDay === d(3) && byName.get("Walking")?.lastDay === d(1) && byName.get("Spanish")?.lastDay === null
  );
  check(
    "a skill's condition: its class's λ over its own idle days, less the held day (Guitar 11 idle days at 0.01, Walking 13 at 0.02, Spanish never practised: 100%)",
    near(skillConditionOf(byName.get("Guitar")!, basis).condition, conditionOf(11, 0.01)) &&
      near(skillConditionOf(byName.get("Walking")!, basis).condition, conditionOf(13, 0.02)) &&
      skillConditionOf(byName.get("Spanish")!, basis).condition === 1
  );
  const noop = async () => ({ ok: false as const, error: "off" });
  const actions: CompetencyActions = { addSkill: noop, addSuggestedSkill: noop, editSkill: noop, archiveSkill: noop, linkRoadmapSkill: noop };
  const boardData = { skills: views, fields: [], suggestions: [], roadmaps: [], writesOn: false, ready: true };
  const skillConds = Object.fromEntries(views.map((v) => [v.id, skillConditionOf(v, basis)]));
  const boardOn = renderToStaticMarkup(createElement(CompetencyBoard, { data: { ...boardData, conditions: skillConds }, actions }));
  const boardOff = renderToStaticMarkup(createElement(CompetencyBoard, { data: boardData, actions }));
  check(
    "an exercise skill's restore names a walk too (its last practice reads the latest walk): 'Walking …% · 13 days idle · a walk or a tick of a task linked to it restores it'",
    conditionRestoreOf({ kind: "skill", key: "sk-walk", attribute: "VITALITY", skillKind: "EXERCISE" }) === "a walk or a tick of a task linked to it" &&
      conditionRestoreOf({ kind: "skill", key: "sk-guitar", attribute: "CRAFT", skillKind: "PRACTICE" }) === "a tick of a task linked to it" &&
      boardOn.includes(`Walking ${conditionPercent(conditionOf(13, 0.02))}% · 13 days idle · a walk or a tick of a task linked to it restores it`)
  );
  check(
    "the Skills page says it under an idle skill ('Guitar 92% · 11 days idle · a tick of a task linked to it restores it'); its hours and tier never move; nothing while off",
    boardOn.includes(`Guitar ${conditionPercent(conditionOf(11, 0.01))}% · 11 days idle · a tick of a task linked to it restores it`) &&
      !boardOn.includes("Spanish 100%") &&
      !boardOff.includes("status-cond") &&
      boardOn.replace(/<div class="t-meta status-cond">[^<]*<\/div>/g, "") === boardOff
  );
  const items = conditionItemsOf(basis, views);
  check(
    "the items: the five attributes in the Status card's order and names, then the skills",
    same(items.map((i) => i.name), ["Body", "Knowledge", "Craft", "Duty", "Care", "Walking", "Guitar", "Spanish"]) && same(Object.values(CONDITION_NAME), ["Body", "Knowledge", "Craft", "Duty", "Care"])
  );
  const listed = checkConditionsOf(items);
  check(
    "/check's skills: every item under 0.9, the lowest first, 3 decimals; checkSkillsOf is that list; none while off",
    CHECK_CONDITION_BELOW === 0.9 && listed.every((x) => x.condition < 0.9) && listed.every((x, i) => i === 0 || listed[i - 1].condition <= x.condition) && same(checkSkillsOf(items), listed) && same(checkSkillsOf(null), []) && listed.length > 0,
    JSON.stringify(listed)
  );
  check(
    "the items carry an exercise skill's kind, so the audit's line names a walk too",
    items.find((i) => i.name === "Walking")?.skillKind === "EXERCISE" && /A walk or a tick of a task linked to it brings it back/.test(conditionLinesOf(items).find((l) => /Walking/.test(l.title))?.detail ?? "")
  );
  // The phone floors the whole percent it is sent; the condition goes rounded down to 3 decimals so it says the web's.
  const phonePercent = (c: number) => Math.floor(Math.min(1, Math.max(0, c)) * 100 + 1e-9);
  const awkward = [[32, 0.02], [58, 0.005], [61, 0.01], [66, 0.005], [102, 0.005], [112, 0.005], [119, 0.005], [130, 0.005]].map(([idle, l], i): typeof items[number] => ({
    kind: "attribute",
    key: `k${i}`,
    name: `Item ${i}`,
    attribute: "CARE",
    condition: conditionOf(idle, l),
    idleDays: idle,
  }));
  check(
    "/check's condition is rounded down to 3 decimals, so the phone's percent is the web's at every awkward day (Body 32 days idle: 0.559, 55% on both)",
    checkConditionsOf(awkward).every((x) => phonePercent(x.condition) === conditionPercent(awkward.find((a) => a.name === x.name)!.condition)) && checkConditionsOf([awkward[0]])[0].condition === 0.559,
    JSON.stringify(checkConditionsOf(awkward).map((x) => [x.name, x.condition]))
  );
  // The Traits card (D24b: the radar reads the lowered traits) says why, in one quiet line, only while it is so.
  const allFull = attributeConditionsOf(basisOf(d(2), { VITALITY: d(1), INTELLECT: d(1) }));
  check(
    "the Traits card's line: 'Read at condition: Body 79% · a Body tick restores it'; two or more name each and 'practice restores them'; none at 100% or while off",
    traitsConditionLineOf({ ...allFull, VITALITY: { ...allFull.VITALITY, condition: 0.79, idleDays: 15 } }) === "Read at condition: Body 79% · a Body tick restores it" &&
      traitsConditionLineOf(conds) === `Read at condition: ${["VITALITY", "DUTY", "CRAFT", "CARE", "INTELLECT"].filter((k) => conds[k as keyof typeof conds].condition < 1).sort((a, b) => conds[a as keyof typeof conds].condition - conds[b as keyof typeof conds].condition).map((k) => `${CONDITION_NAME[k as keyof typeof conds]} ${conditionPercent(conds[k as keyof typeof conds].condition)}%`).join(", ")} · practice restores them` &&
      traitsConditionLineOf(allFull) === null &&
      traitsConditionLineOf(null) === null,
    String(traitsConditionLineOf(conds))
  );
  const radarArgs = { radar: { rings: [], spokes: [], ghost: null, now: "", markers: [], labels: [] }, hasGhost: false, top: [] } as unknown as Parameters<typeof AttributeRadar>[0];
  const radarOff = renderToStaticMarkup(createElement(AttributeRadar, radarArgs));
  const radarOn = renderToStaticMarkup(createElement(AttributeRadar, { ...radarArgs, conditionLine: "Read at condition: Body 79% · a Body tick restores it" }));
  check(
    "the radar card draws the line first inside the card, and nothing without it (the /you page passes it only while it is so)",
    radarOn.includes('<p class="t-meta status-cond radar-cond">Read at condition: Body 79% · a Body tick restores it</p>') && !radarOff.includes("radar-cond") &&
      /\{\.\.\.\(traitsLine \? \{ conditionLine: traitsLine \} : \{\}\)\}/.test(read("src/app/you/page.tsx"))
  );
  // The frozen marks outside the sheets (review): the strip draws a frozen emblem owned and dimmed, never the locked coin.
  const stripSlots = [
    { slot: 0, skill: emblem, active: false, frozen: frozenLineOf({ label: "Physical", need }) },
    { slot: 1, skill: emblem, active: false },
    { slot: 2, skill: null, active: false },
  ];
  const stripHtml = renderToStaticMarkup(createElement(LoadoutStrip, { slots: stripSlots }));
  const stripOff = renderToStaticMarkup(createElement(LoadoutStrip, { slots: stripSlots.map(({ slot, skill, active }) => ({ slot, skill, active })) }));
  check(
    "the loadout strip: a frozen emblem is an owned coin with the freeze glyph (one locked coin left: the dormant one), and the label counts it; while off it is as before",
    (stripHtml.match(/class="coin locked"/g) ?? []).length === 1 && stripHtml.includes('class="lo-frozen"') && stripHtml.includes("#h-freeze") && stripHtml.includes("1 frozen") &&
      (stripOff.match(/class="coin locked"/g) ?? []).length === 2 && !stripOff.includes("lo-frozen") && !stripOff.includes("frozen"),
    stripHtml.slice(0, 300)
  );
  const lines = conditionLinesOf(items);
  const block = decayingOf({ conditions: items });
  check(
    "the audit's decaying block gains the condition source: one line an item below 100%, before the traits, linking where its row is",
    DECAY_KINDS.indexOf("condition") === DECAY_KINDS.indexOf("trait") - 1 &&
      lines.length === items.filter((i) => i.condition < 1).length &&
      lines[0].kind === "condition" &&
      lines.every((l) => /condition \d+%$/.test(l.title) && /nothing it built is lost/.test(l.detail) && (l.href === "/you" || l.href === "/you/skills")) &&
      block.lines.every((l) => l.kind === "condition") && block.count === lines.length,
    JSON.stringify(lines.map((l) => l.title))
  );
  check("while off the block is exactly as before (no conditions read: nothing added, nothing unread)", same(decayingOf({ conditions: null }), NO_DECAY) && same(decayingOf({}), NO_DECAY));
  check("a frozen copy with condition lines reads back (parseDecaying keeps the new kind)", same(parseDecaying(JSON.parse(JSON.stringify(block)))?.lines.map((l) => l.kind), block.lines.map((l) => l.kind)));
  check("the copy is neutral: no verdict, no shame", lines.every((l) => !/fail|lost your|lazy|penalt|shame|should/i.test(`${l.title} ${l.detail}`)));

  // ═══ §8 Never history, and the wiring ════════════════════════════════════

  console.log("— §8 never history, and the wiring —");
  const files = srcFiles();
  const cache = new Map<string, string>();
  const code = (rel: string) => cache.get(rel) ?? (cache.set(rel, readCode(rel)), cache.get(rel) as string);
  const writers = writerModulesOf(files, code);
  const targets = files.filter((f) => /skill-decay/.test(f));
  const offenders = targets.flatMap((f) => {
    const out: string[] = [];
    const w = excerpt(LEDGER_WRITES, code(f));
    if (w) out.push(`${f} writes the ledger (${w})`);
    for (const i of importsOf(code(f), f)) if (i.names.length > 0 && i.resolved != null && writers.has(i.resolved)) out.push(`${f} imports ${i.names.join(", ")} from the writer ${i.resolved}`);
    return out;
  });
  check("skill-decay.ts and skill-decay-server.ts write no ledger and import no writer", targets.length === 2 && offenders.length === 0, offenders.join("; ") || targets.join(", "));
  const server = code("src/lib/skill-decay-server.ts");
  check(
    "the server only reads: no create, update, upsert, delete, execute or transaction",
    !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction/.test(server) && /\$queryRaw/.test(server)
  );
  const pure = code("src/lib/skill-decay.ts");
  check("the rules hold no Prisma, no clock and no randomness", !/from "\.\/prisma"|@prisma\/client|new Date\(|Date\.now|Math\.random/.test(pure));
  const effects = code("src/lib/skill-effects.ts");
  check(
    "skill-effects: the full traits are the two passes before P28; the lowered ones only with a basis; the frozen emblems leave the fold; nothing is written",
    /const full = bootstrapScores\(rows, streakBonuses, lifeRows, equippedSkills, amplified, grafted, penalty\);/.test(effects) &&
      /const conditions = basis \? attributeConditionsOf\(basis\) : null;\s*const scale = conditions \? traitScaleOf\(conditions\) : null;/.test(effects) &&
      /const lowered = scale \? loweredBy\(scale\) : full;/.test(effects) &&
      /const isActive = \(s: Skill\) => meetsRequirements\(s, scores, lowered\.resonancePercent, penalty\) \|\| \(guardsLevels\(s\) && meetsFull\(s\)\);/.test(effects) &&
      /scale && conditions \? frozenEmblemsOf\(ownedSkills, lowered, full, penalty, \(trait\) => idleFeedersOf\(trait, \{ fields: rows, life: lifeRows \}, conditions\)\) : \{\};/.test(effects) &&
      /modifiers: scale \? withLevelGuards\(folded, foldOf\(fullActiveSkills, resolveResonance\(fullActiveSkills\)\)\) : folded,/.test(effects) &&
      /return resolveProgression\(\{ rows, streakBonuses, owned, debuffs, boons, augments, lifeRows, basis \}\);/.test(effects) &&
      /fullScores: full\.scores,/.test(effects) &&
      (effects.match(/unlockedSkill\.(create|update|upsert|delete)/g) ?? []).length === 1
  );
  const srsCode = code("src/lib/srs.ts");
  check(
    "the ward's charge reads the full traits' emblems at both sites (a review's degrade and the daily forgetting pass), never the lowered ones",
    (srsCode.match(/tryConsumeWardCharge\(userId, progression\.fullActiveSkills, now\)/g) ?? []).length === 2 && !/tryConsumeWardCharge\(userId, progression\.activeSkills/.test(srsCode)
  );
  check(
    "capital pauses with the freeze (its rate reads the emblems in effect) and is priced at the claim's rate, as for any dormant emblem: written down where the rate is",
    /capitalRate: computeRate\(activeSkills, augments\),/.test(effects) && /priced at\s+\*?\s*the claim's rate/.test(read("src/lib/skill-effects.ts")) && /retires at CREDITS_LAUNCH_DAY/.test(read("src/lib/skill-effects.ts"))
  );
  check(
    "decay waits for Duty: the default basis reads decayFromOf(decayLaunchDay(), dutyLaunchDay()), and the rules page the same",
    /const launch = deps\.launch === undefined \? decayFromOf\(decayLaunchDay\(\), dutyLaunchDay\(\)\) : deps\.launch;/.test(server) &&
      /const decayLaunch = decayFromOf\(decayLaunchDay\(\), dutyLaunch\);/.test(code("src/app/today/rules/page.tsx"))
  );
  check(
    "titles never drop: the title and its epithet read the full traits (the shell and the sheet), the same scores while off",
    /computeTitle\(level, progression\.fullScores, ultimateCount\)/.test(code("src/lib/shell-data.ts")) &&
      /computeTitle\(level, progression\.fullScores, ultimates\)/.test(code("src/app/you/_lib/sheet.ts")) &&
      /dominant: dominantAttribute\(progression\.fullScores\)/.test(code("src/app/you/_lib/sheet.ts"))
  );
  const levelReaders = ["src/lib/life-tracks.ts", "src/lib/life-economy.ts", "src/lib/character.ts", "src/lib/xp.ts", "src/lib/life-grade.ts", "src/lib/competency.ts", "src/lib/settlement.ts", "src/lib/life-weeks.ts", "src/lib/credits.ts"];
  check("no level, XP, hours, pay or credits module reads the condition", levelReaders.every((f) => !/skill-decay/.test(code(f))), levelReaders.filter((f) => /skill-decay/.test(code(f))).join(", "));
  const rules = code("src/app/today/rules/page.tsx");
  check(
    "the rules page: a Condition card only once decay is in force, its lines from conditionRuleLines (every figure from the code)",
    /const decayLive = decayLaunch != null && decayOn\(today, decayLaunch\);/.test(rules) && /\{decayLive && decayLaunch && <DecayRules launchDay=\{decayLaunch\} \/>\}/.test(rules) && /conditionRuleLines\(\)\.map/.test(rules)
  );
  const ruleText = conditionRuleLines().join(" ");
  const ruleSrc = read("src/lib/skill-decay.ts").slice(read("src/lib/skill-decay.ts").indexOf("export function conditionRuleLines"));
  const typed = [...ruleSrc.replace(/\$\{[^}]*\}/g, "").matchAll(/\d+/g)].map((m) => m[0]);
  check(
    "the rules' lines read 0.02, 0.01, 0.005, 3 days and 50% from the constants, and type no number by hand",
    ruleText.includes("0.02") && ruleText.includes("0.01") && ruleText.includes("0.005") && ruleText.includes(`${CONDITION_GRACE_DAYS} idle days`) && ruleText.includes("50%") && typed.length === 0,
    typed.join(", ")
  );
  const you = code("src/app/you/page.tsx");
  check(
    "/you: the conditions are the Status card's fifth input, read beside the wave (null while off, and on a failed read)",
    /const conditionRead = loadConditionBasis\(userId, now\)\.catch\(\(\) => null\);/.test(you) &&
      /const status = statusPanelOf\(s\.life, s\.knowledge, avatar, skills \? skills\.skills : null, basis \? attributeConditionsOf\(basis\) : null\);/.test(you)
  );
  check(
    "the emblems: the ladder, the detail, the graph and the loadout grid name a frozen emblem from the server's own read (owned, never locked)",
    /\.\.\.\(Object\.keys\(progression\.frozen\)\.length > 0 \? \{ frozen: progression\.frozen \} : \{\}\),/.test(code("src/components/skills/SkillsScreen.tsx")) &&
      /const frozen = state === "owned" \? \(ctx\.frozen\?\.\[skill\.code\] \?\? null\) : null;/.test(code("src/components/skills/EmblemDetail.tsx")) &&
      /<Chip tone="held" held="freeze" className="frozen-chip">/.test(code("src/components/skills/EmblemDetail.tsx")) &&
      /if \(ctx\.frozen\?\.\[skill\.code\]\) \{\s*map\.set\(skill\.code, "frozen"\);/.test(code("src/components/skills/PathView.tsx")) &&
      /\.\.\.\(e\?\.frozen \? \{ frozen: e\.frozen \} : \{\}\)/.test(code("src/app/you/loadout/page.tsx")) &&
      /current\.frozen \? \(\s*<Chip tone="held" held="freeze" className="frozen-chip">/.test(code("src/components/skills/LoadoutGrid.tsx")) &&
      /\.chip\.frozen-chip \{ white-space: normal; max-width: 100%;/.test(read("src/components/skills/skills.css"))
  );
  const grid = code("src/components/skills/LoadoutGrid.tsx");
  const tree = code("src/components/skills/SkillTree.tsx");
  check(
    "the frozen marks (review): a frozen slot draws dimmed with the freeze glyph, a frozen bench emblem says its line before it is equipped, the graph draws the freeze glyph (never a bare held dot) and says it thaws with practice",
    /cx\("lo-slot", !s\.active && "dormant", s\.frozen && "frozen", glint\?\.slot === s\.slot && "glint"\)/.test(grid) &&
      /\{s\.frozen && <HeldGlyph kind="freeze" className="lo-freeze" \/>\}/.test(grid) &&
      /\{frozen\?\.\[skill\.code\] && \(\s*<span className="t-meta lo-frozen-note">\s*<HeldGlyph kind="freeze" \/> \{frozen\[skill\.code\]\}/.test(grid) &&
      /\.\.\.\(Object\.keys\(progression\.frozen\)\.length > 0 \? \{ frozen: progression\.frozen \} : \{\}\)/.test(code("src/app/you/loadout/page.tsx")) &&
      /<use href="#h-freeze" \/>/.test(tree) && !/fill="var\(--held\)"/.test(tree) && /status === "frozen" \? FROZEN_HINT/.test(tree) && !/thaws by itself/.test(tree)
  );
  check(
    "the strip's callers pass a frozen slot's line (the Review hub and the runner footer), only when there is one",
    /\.\.\.\(e\?\.frozen \? \{ frozen: e\.frozen \} : \{\}\)/.test(code("src/app/review/page.tsx")) && /\.\.\.\(e\?\.frozen \? \{ frozen: e\.frozen \} : \{\}\)/.test(code("src/components/skills/LoadoutStrip.tsx"))
  );
  const audit = code("src/lib/audit-decay-server.ts");
  check("the audit reads the conditions through loadConditionItems, soft on its own (null while off, never counted unread)", /loadConditionItems\(userId, now\)\.catch\(soft<ConditionItem\[\]>\("the conditions"\)\),/.test(audit));
  const kt = read("android/app/src/main/java/com/xtnl/app/ui/check/CheckScreen.kt");
  check("the phone: the Condition card on both displays (after the Week card in each)", (kt.match(/week\(data\.week\)\s*condition\(data\.skills\)/g) ?? []).length === 2);
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const chain = pkg.scripts["life:check"].split("&&").map((x) => x.trim());
  check(
    "package.json: life:check runs this check right after audit-decay-check; skill-decay:check runs it alone",
    chain[chain.indexOf("tsx scripts/audit-decay-check.ts") + 1] === "tsx scripts/skill-decay-check.ts" && pkg.scripts["skill-decay:check"] === "tsx scripts/skill-decay-check.ts"
  );
  check("no migration for it: nothing is stored (no Prisma model or column names a condition)", !/condition/i.test(read("prisma/schema.prisma").replace(/\/\/[^\n]*/g, "")));

  console.log(`\nskill-decay-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

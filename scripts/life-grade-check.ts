/**
 * The life grade on fixed cases: the lexical sizer, the merge that folds a
 * model grade into it, and the published price with its daily knee
 * (src/lib/life-lexicon.ts, src/lib/life-grade.ts).
 *
 * No database and no model. The model's answers are written out by hand,
 * and a model timeout is a promise that never settles, so every rule that
 * decides a number is checked exactly as the server runs it.
 *
 *   npx tsx scripts/life-grade-check.ts
 */
import {
  BAND_BASE,
  CONSISTENCY_CAP,
  KNEE_CAP,
  KNEE_CAP_AT_RAW,
  RAW_WORST_CASE,
  bandIndex,
  clampMinutes,
  describeReceipt,
  effBand,
  estEff,
  kneeG,
  kneeNote,
  kneePay,
  priceTask,
  projectRow,
  timingFor,
} from "../src/lib/life-grade";
import {
  AI_UNAVAILABLE_NOTE,
  bandCapFor,
  gradeChipOf,
  gradeFromCopy,
  gradeFromModel,
  mergeSizing,
  normTitleOf,
  repeatNOf,
  sameDecayGroup,
  sizeLexically,
  sizingSkipReason,
  type GradedTemplate,
} from "../src/lib/life-lexicon";
import { withModelTimeout, type LifeSizingRaw } from "../src/lib/gemini";
import type { Band, Category, PriceInput, Sizing } from "../src/lib/life-types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

/** A small seeded generator, so the random orders are the same on every run. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══ SIZING ═══════════════════════════════════════════════════════════════

console.log("— sizing: 60 canonical titles —");
const CANON: [string, Category, Band][] = [
  ["gym legs", "EXERCISE", "DEMANDING"],
  ["run 5k", "EXERCISE", "DEMANDING"],
  ["evening walk", "EXERCISE", "STANDARD"],
  ["yoga", "EXERCISE", "STANDARD"],
  ["stretch", "EXERCISE", "STANDARD"],
  ["swim laps", "EXERCISE", "DEMANDING"],
  ["50 pushups", "EXERCISE", "STANDARD"],
  ["hike the ridge trail", "EXERCISE", "DEMANDING"],
  ["take meds", "HEALTH", "INTRO"],
  ["dentist appointment", "HEALTH", "STANDARD"],
  ["floss", "HEALTH", "INTRO"],
  ["drink 2L water", "HEALTH", "INTRO"],
  ["blood test", "HEALTH", "STANDARD"],
  ["take out bins", "CHORE", "INTRO"],
  ["wash dishes", "CHORE", "INTRO"],
  ["laundry", "CHORE", "INTRO"],
  ["vacuum the lounge", "CHORE", "INTRO"],
  ["clean bathroom", "CHORE", "STANDARD"],
  ["water plants", "CHORE", "INTRO"],
  ["mow the lawn", "CHORE", "STANDARD"],
  ["declutter garage", "CHORE", "DEMANDING"],
  ["weekly grocery shop", "ERRAND", "STANDARD"],
  ["pick up parcel from post office", "ERRAND", "STANDARD"],
  ["buy milk", "ERRAND", "INTRO"],
  ["haircut", "ERRAND", "STANDARD"],
  ["pay electricity bill", "ADMIN", "INTRO"],
  ["pay rent", "ADMIN", "INTRO"],
  ["file tax return", "ADMIN", "DEMANDING"],
  ["renew passport", "ADMIN", "DEMANDING"],
  ["book dentist", "ADMIN", "INTRO"],
  ["plan the week", "ADMIN", "STANDARD"],
  ["reply to one email", "WORK", "INTRO"],
  ["prepare slides for Monday", "WORK", "DEMANDING"],
  ["write quarterly report", "WORK", "DEMANDING"],
  ["team standup", "WORK", "STANDARD"],
  ["fix login bug", "WORK", "DEMANDING"],
  ["update CV", "WORK", "DEMANDING"],
  ["study chapter", "STUDY", "DEMANDING"],
  ["review lecture notes", "STUDY", "DEMANDING"],
  ["write a thesis chapter draft", "STUDY", "SEVERE"],
  ["duolingo", "STUDY", "STANDARD"],
  ["read 20 pages", "STUDY", "STANDARD"],
  ["exam revision", "STUDY", "DEMANDING"],
  ["piano practice", "CREATIVE", "STANDARD"],
  ["sketch", "CREATIVE", "STANDARD"],
  ["write blog post", "CREATIVE", "STANDARD"],
  ["edit photos", "CREATIVE", "STANDARD"],
  ["call mum", "SOCIAL", "STANDARD"],
  ["visit grandma", "SOCIAL", "STANDARD"],
  ["coffee with Alex", "SOCIAL", "STANDARD"],
  ["text Sam back", "SOCIAL", "INTRO"],
  ["feed the cat", "CARE", "INTRO"],
  ["walk the dog", "CARE", "STANDARD"],
  ["school pickup", "CARE", "STANDARD"],
  ["help neighbour with boxes", "CARE", "STANDARD"],
  ["meditate", "SPIRIT", "INTRO"],
  ["journal", "SPIRIT", "INTRO"],
  ["morning prayer", "SPIRIT", "INTRO"],
  ["church", "SPIRIT", "STANDARD"],
  ["think about holiday", "OTHER", "STANDARD"],
];
{
  let exact = 0;
  let withinOne = 0;
  const misses: string[] = [];
  for (const [title, cat, band] of CANON) {
    const s = sizeLexically(title);
    if (s.category === cat) exact++;
    else misses.push(`"${title}" ${s.category} (wanted ${cat})`);
    if (Math.abs(bandIndex(s.band) - bandIndex(band)) <= 1) withinOne++;
    else misses.push(`"${title}" band ${s.band} (wanted ${band})`);
  }
  check("fixture count is 60", CANON.length === 60, String(CANON.length));
  check("category exact ≥ 50/60", exact >= 50, `${exact}/60`);
  check("band within one step 60/60", withinOne === 60, `${withinOne}/60`);
  for (const m of misses) console.log(`      miss: ${m}`);
}

console.log("— sizing: lexical basics —");
{
  const none = sizeLexically("think about holiday");
  check(
    "no match is OTHER / STANDARD / 30m at confidence 0",
    none.category === "OTHER" && none.band === "STANDARD" && none.machineMinutes === 30 && none.confidence === 0 && none.basis === "no rule matched"
  );
  const tagged = sizeLexically("gym legs", { tagTrack: "CARE" });
  check("a tag overrides the category's track", tagged.track === "CARE" && tagged.category === "EXERCISE");
  const s = sizeLexically("gym legs");
  const sum = Object.values(s.composition).reduce((a, b) => a + (b ?? 0), 0);
  check("lexical composition sums to 100", sum === 100, String(sum));
  check("lexical confidence is S/(S+5): one strength-3 hit is 0.375", near(s.confidence, 0.375, 1e-3), String(s.confidence));
  check("the same title sizes identically", JSON.stringify(sizeLexically("Gym legs")) === JSON.stringify(sizeLexically("Gym legs")));
  const typed = sizeLexically("take out bins", { minutes: 480 });
  check("typed minutes never move the machine grade", typed.machineMinutes === 5 && typed.band === "INTRO", typed.basis);
  check("…but the basis says what they count as", typed.basis.includes("counts as 10m"), typed.basis);
  check("'run errands' is not a run", sizeLexically("run errands").category === "ERRAND");
  check("'paint the fence' is a chore, 'painting' is creative", sizeLexically("paint the fence").category === "CHORE" && sizeLexically("painting").category === "CREATIVE");
}

console.log("— sizing: titles and decay groups —");
check("normTitleOf('Gym - legs 60m!') = 'gym legs'", normTitleOf("Gym - legs 60m!") === "gym legs", normTitleOf("Gym - legs 60m!"));
check("normTitleOf drops stop-words: 'Do the dishes' = 'dishes'", normTitleOf("Do the dishes") === "dishes", normTitleOf("Do the dishes"));
check("normTitleOf keeps a digits-only title grouping with itself", normTitleOf("5k") === "5k");
check("near-identical titles share a decay group", sameDecayGroup("wash dishes", "wash dishess"));
check("different chores do not", !sameDecayGroup("wash dishes", "laundry"));
check(
  "repeatN counts the same template and near-copies",
  repeatNOf({ templateId: "t1", normTitle: "call mum" }, [
    { templateId: "t1", normTitle: "call mum" },
    { templateId: "t2", normTitle: "call mum" },
    { templateId: "t3", normTitle: "laundry" },
  ]) === 3
);

console.log("— sizing: merge fixtures —");
const lex = (over: Partial<Sizing> = {}): Sizing => ({ ...sizeLexically("gym legs"), ...over });
const ai = (over: Partial<LifeSizingRaw> = {}): LifeSizingRaw => ({
  category: "EXERCISE",
  band: "DEMANDING",
  durationBand: "D60",
  attributes: [{ attribute: "PHYSICAL", weight: 70 }, { attribute: "STUBBORNNESS", weight: 30 }],
  rationale: "A heavy lower-body session.",
  ...over,
});
{
  const m = mergeSizing(lex(), ai({ category: "SPORTS", band: "EXTREME", durationBand: "D7", attributes: [{ attribute: "STRENGTH", weight: 50 }] }));
  check(
    "an invalid enum keeps its lexical value",
    m.category === "EXERCISE" && m.band === "DEMANDING" && m.durationBand === "D60" && m.aiBand === null,
    `${m.category}/${m.band}/${m.durationBand}`
  );
  check("…and every invalid field is reported", ["category", "band", "durationBand", "attributes"].every((f) => m.invalid.includes(f)), m.invalid.join(","));

  const locked = mergeSizing(lex({ band: "INTRO", confidence: 0.7 }), ai({ band: "SEVERE", durationBand: "D60" }));
  check("a 3-step jump at lexical confidence 0.7 moves one step", locked.band === "STANDARD", locked.band);
  const unlocked = mergeSizing(lex({ band: "INTRO", confidence: 0.5 }), ai({ band: "SEVERE", durationBand: "D60" }));
  check("…at confidence 0.5 the model's band stands", unlocked.band === "SEVERE", unlocked.band);
  const oneStep = mergeSizing(lex({ band: "STANDARD", confidence: 0.9 }), ai({ band: "DEMANDING", durationBand: "D60" }));
  check("…and a one-step change is never limited", oneStep.band === "DEMANDING", oneStep.band);

  const d5 = mergeSizing(lex({ confidence: 0 }), ai({ band: "SEVERE", durationBand: "D5" }));
  const d15 = mergeSizing(lex({ confidence: 0 }), ai({ band: "SEVERE", durationBand: "D15" }));
  const d20 = mergeSizing(lex({ confidence: 0 }), ai({ band: "SEVERE", durationBand: "D20" }));
  check("D5 caps the band at STANDARD", d5.band === "STANDARD" && bandCapFor(5) === "STANDARD", d5.band);
  check("D15 caps the band at DEMANDING", d15.band === "DEMANDING" && bandCapFor(15) === "DEMANDING", d15.band);
  check("D20 is not capped", d20.band === "SEVERE", d20.band);

  const rnd = prng(7);
  const attrs = ["PHYSICAL", "MIND", "FAITH", "COMPASSION", "LOGIC", "NOT_AN_ATTRIBUTE"];
  let allHundred = true;
  for (let i = 0; i < 500; i++) {
    const n = Math.floor(rnd() * 4);
    const list = Array.from({ length: n }, () => ({ attribute: attrs[Math.floor(rnd() * attrs.length)], weight: Math.floor(rnd() * 140) - 20 }));
    const title = CANON[Math.floor(rnd() * CANON.length)][0];
    const merged = mergeSizing(sizeLexically(title), ai({ attributes: list }));
    const total = Object.values(merged.composition).reduce((a, b) => a + (b ?? 0), 0);
    if (total !== 100) allHundred = false;
  }
  check("composition always sums to 100 (500 random merges)", allHundred);

  const merged = mergeSizing(lex({ confidence: 0.4 }), ai());
  check("model grade confidence is 0.6 + 0.4 × lexical", near(merged.confidence, 0.76, 1e-9), String(merged.confidence));
  check("category decides the track unless tagged", mergeSizing(lex(), ai({ category: "SOCIAL" })).track === "CARE" && mergeSizing(lex(), ai({ category: "SOCIAL" }), { tagTrack: "BODY" }).track === "BODY");
  check("the rationale becomes the basis, cut to 200", mergeSizing(lex(), ai({ rationale: "x".repeat(500) })).basis.length === 200);
  check("typed ~480m on a D5 machine band gives est_eff 10", estEff(480, 5) === 10, String(estEff(480, 5)));
}

console.log("— sizing: what a run writes —");
const template = (over: Partial<GradedTemplate> = {}): GradedTemplate => ({
  id: "tpl_1",
  title: "gym legs",
  track: "BODY",
  trackSource: "CATEGORY",
  estMinutes: 60,
  minutesSource: "LEXICAL",
  gradeSource: "LEXICAL",
  gradePromptVersion: null,
  gradeBasis: '"gym" → Exercise · Demanding · 60m',
  gradeFrozenAt: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  ...over,
});
async function modelChecks() {
  console.log("— sizing: a model that fails or answers —");
  const hang = new Promise<LifeSizingRaw>(() => {});
  const timedOut = await withModelTimeout(hang, 30);
  check("a stubbed model that never answers times out as a value", timedOut.ok === false);
  const upd = gradeFromModel(template(), timedOut, { model: "stub", promptVersion: 1, now: new Date() });
  const keys = Object.keys(upd).sort().join(",");
  check("a timeout keeps the lexical grade (writes only attempts and basis)", keys === "gradeAttemptsIncrement,gradeBasis", keys);
  check("…increments gradeAttempts", upd.gradeAttemptsIncrement === 1);
  check("…and notes 'AI unavailable' once", upd.gradeBasis?.endsWith(AI_UNAVAILABLE_NOTE) === true);
  const again = gradeFromModel(template({ gradeBasis: upd.gradeBasis ?? null }), timedOut, { model: "stub", promptVersion: 1, now: new Date() });
  check("…never twice", again.gradeBasis === upd.gradeBasis, again.gradeBasis);

  const rejects = await withModelTimeout(Promise.reject(new Error("GEMINI_API_KEY is not set")), 1000);
  check("a model error is a value too", rejects.ok === false && !rejects.ok && rejects.error.includes("GEMINI_API_KEY"));

  const ok = await withModelTimeout(Promise.resolve(ai({ band: "STANDARD", durationBand: "D45" })), 1000);
  const good = gradeFromModel(template(), ok, { model: "stub", promptVersion: 1, now: new Date("2026-10-01T01:00:00Z") });
  check(
    "a success writes the merged grade, source AI, and counts the attempt",
    good.gradeSource === "AI" && good.band === "STANDARD" && good.machineMinutes === 45 && good.gradeAttemptsIncrement === 1 && !!good.aiGradedAt
  );
  check("…and grade-set minutes follow the new machine minutes", good.estMinutes === 45 && good.minutesSource === "AI");
  const typedMinutes = gradeFromModel(template({ minutesSource: "USER", estMinutes: 90 }), ok, { model: "stub", promptVersion: 1, now: new Date() });
  check("…but typed minutes stay the user's", !("estMinutes" in typedMinutes) && !("minutesSource" in typedMinutes));
  check("a sizing run never writes bandOverride", !("bandOverride" in good) && !("bandOverride" in upd));
}
{
  const copy = gradeFromCopy(template(), {
    id: "tpl_0",
    category: "EXERCISE",
    band: "DEMANDING",
    aiBand: "SEVERE",
    machineMinutes: 60,
    composition: { PHYSICAL: 70, STUBBORNNESS: 30 },
    gradeConfidence: 0.8,
    gradeBasis: "A heavy lower-body session.",
    gradeModel: "gemini-3.5-flash-lite",
    gradePromptVersion: 1,
  });
  check("a copied grade keeps COPIED and names its source", copy.gradeSource === "COPIED" && copy.gradeCopiedFrom === "tpl_0");
  check("…never carries bandOverride", !("bandOverride" in copy));
  check("…is not a model call (no attempt, not counted against the cap)", !("gradeAttemptsIncrement" in copy) && !("aiGradedAt" in copy));
  const now = new Date("2026-10-01T10:00:00Z");
  check("a frozen grade is never sized", sizingSkipReason({ ...template(), gradeFrozenAt: now }, now, { promptVersion: 1 }) === "frozen");
  check("a grade past 24 h is never sized", sizingSkipReason(template(), new Date("2026-10-02T00:00:01Z"), { promptVersion: 1 }) === "expired");
  check("a current AI grade is done unless resized", sizingSkipReason(template({ gradeSource: "AI", gradePromptVersion: 1 }), now, { promptVersion: 1 }) === "done" && sizingSkipReason(template({ gradeSource: "AI", gradePromptVersion: 1 }), now, { promptVersion: 1, force: true }) === null);
  const chipBase = { gradeSource: "LEXICAL", gradeConfidence: 0.4, gradeAttempts: 0, gradeFrozenAt: null, bandOverride: 0, createdAt: now };
  check("chip: sizing… just after capture", gradeChipOf(chipBase, now).label === "sizing…");
  check("chip: lexical · 40% · AI unavailable after a failure", gradeChipOf({ ...chipBase, gradeAttempts: 1 }, now).label === "lexical · 40% · AI unavailable");
  check("chip: AI · 84%", gradeChipOf({ ...chipBase, gradeSource: "AI", gradeConfidence: 0.84, gradeAttempts: 1 }, now).label === "AI · 84%");
  check("chip: self-rated, then frozen", gradeChipOf({ ...chipBase, bandOverride: 1 }, now).label === "self-rated" && gradeChipOf({ ...chipBase, gradeFrozenAt: now }, now).label === "frozen");
}

// ═══ PRICING ══════════════════════════════════════════════════════════════

const base: PriceInput = {
  band: "STANDARD",
  bandOverride: 0,
  machineMinutes: 30,
  estMinutes: 30,
  minutes: null,
  timing: "ON_TIME",
  recurring: false,
  streakDays: 0,
  repeatN: 1,
  introBefore: 0,
  mode: "FULL",
};
const price = (over: Partial<PriceInput>, rawBefore = 0) => priceTask({ ...base, ...over }, { rawBefore }, "DUTY");

console.log("— pricing: golden prices —");
{
  const tax = price({ band: "DEMANDING", machineMinutes: 120, estMinutes: 120, minutes: 150 });
  check("'File tax return', DEMANDING, est 120, done in 150: 20 × 1.333 = 26.7", tax.raw === 26.7 && tax.xp === 26.7, describeReceipt(tax));
  const dishes = price({ band: "INTRO", machineMinutes: 15, estMinutes: 15, recurring: true, streakDays: 30 });
  check("'Dishes', daily INTRO, est 15, 30-day streak: 5 × 0.833 × 1.137 = 4.7", dishes.raw === 4.7, describeReceipt(dishes));
  const mum = price({ band: "STANDARD", machineMinutes: 20, estMinutes: 20, repeatN: 2 });
  check("'Call mum', STANDARD 20 min, second call today: 10 × 0.9 × 0.861 = 7.7", mum.raw === 7.7, describeReceipt(mum));
  check("knee: R_before 90, raw 25 → 24.0", kneePay(90, 25).toFixed(1) === "24.0", kneePay(90, 25).toFixed(4));
  const knee = price({ band: "STANDARD", machineMinutes: 30, estMinutes: 30 }, 90);
  check("…and the receipt pays through the knee", knee.raw === 10 && near(knee.xp, kneePay(90, 10), 0.0005), `${knee.xp}`);
  const mvv = price({ band: "STANDARD", machineMinutes: 30, estMinutes: 15, recurring: true, streakDays: 40, mode: "MVV" });
  check("MVV of 'stretch 15m': 0.3 × 10 × 0.833 = 2.5, with C = 1", mvv.raw === 2.5 && mvv.factors.find((f) => f.key === "C")?.value === 1, describeReceipt(mvv));
  const bins = price({ band: "INTRO", machineMinutes: 5, estMinutes: 5, introBefore: 6 });
  check("7th INTRO today ('bins', 5 min): 5 × 0.643 × 0.905 = 2.9", bins.raw === 2.9, describeReceipt(bins));
  const sixth = price({ band: "INTRO", machineMinutes: 5, estMinutes: 5, introBefore: 5 });
  check("…while the 6th still pays in full", sixth.raw === 3.2, String(sixth.raw));
}

console.log("— pricing: the worst forged task —");
{
  check("RAW_WORST_CASE = SEVERE 35 × 1.4 × 1.2 = 58.8", RAW_WORST_CASE === 58.8 && near(CONSISTENCY_CAP, 1.2), String(RAW_WORST_CASE));
  const honest = price({ band: "SEVERE", machineMinutes: 240, estMinutes: 480, minutes: 480, recurring: true, streakDays: 64 });
  check("a SEVERE 240-min task at 480 min and a 64-day streak prices 58.8", honest.raw === 58.8, String(honest.raw));
  const forged = price({ band: "SEVERE", bandOverride: 9, machineMinutes: 240, estMinutes: 99999, minutes: 99999, recurring: true, streakDays: 1e9, repeatN: -4, introBefore: -9 });
  check("no forged input prices above 58.8", forged.raw === 58.8, String(forged.raw));
  const nan = price({ band: "SEVERE", machineMinutes: NaN, estMinutes: NaN, minutes: NaN, streakDays: NaN, repeatN: NaN, introBefore: NaN });
  check("NaN inputs price finitely", Number.isFinite(nan.raw) && Number.isFinite(nan.xp), String(nan.raw));
  check("a self-rating tops out one band above the machine", effBand("DEMANDING", 5) === "SEVERE" && effBand("STANDARD", 2) === "DEMANDING" && effBand("INTRO", -3) === "INTRO" && effBand("SEVERE", -3) === "INTRO");
  check("the day tops out at 300 (the knee cap)", kneeG(1e6) === KNEE_CAP && near(kneeG(KNEE_CAP_AT_RAW), KNEE_CAP, 1e-9));
}

console.log("— pricing: monotonicity —");
{
  let minutesOk = true;
  for (const band of ["INTRO", "STANDARD", "DEMANDING", "SEVERE"] as Band[]) {
    for (const est of [5, 15, 30, 60, 120, 240, 480]) {
      let prev = -1;
      for (let m = -10; m <= 600; m += 1) {
        const r = price({ band, machineMinutes: Math.min(240, est), estMinutes: est, minutes: m }).raw;
        if (r < prev) minutesOk = false;
        prev = r;
      }
    }
  }
  check("more minutes never pays less", minutesOk);
  let dOk = true;
  let prevD = Infinity;
  for (let n = 1; n <= 12; n++) {
    const d = price({ repeatN: n }).factors.find((f) => f.key === "D")!.value;
    if (d >= prevD) dOk = false;
    prevD = d;
  }
  check("D decreases with each repeat", dOk);
  let vOk = true;
  let prevV = Infinity;
  for (let k = 5; k <= 16; k++) {
    const v = price({ band: "INTRO", machineMinutes: 5, estMinutes: 5, introBefore: k }).factors.find((f) => f.key === "V")!.value;
    if (v >= prevV) vOk = false;
    prevV = v;
  }
  check("V decreases past the sixth routine task", vOk);
  check("V never touches non-INTRO work", price({ band: "STANDARD", introBefore: 50 }).factors.find((f) => f.key === "V")!.value === 1);
  let cOk = true;
  let prevC = 0;
  for (let d = 0; d <= 100; d++) {
    const c = price({ recurring: true, streakDays: d }).factors.find((f) => f.key === "C")!.value;
    if (c < prevC) cOk = false;
    prevC = c;
  }
  check("C never falls as a streak grows, and caps at 1.20", cOk && prevC === 1.2, String(prevC));
}

console.log("— pricing: clamps —");
{
  const e = estEff(120, 120);
  check("minutes 99999 → 2 × est_eff", price({ band: "DEMANDING", machineMinutes: 120, estMinutes: 120, minutes: 99999 }).minutes === 2 * e);
  check("minutes −5 → 0.5 × est_eff", price({ band: "DEMANDING", machineMinutes: 120, estMinutes: 120, minutes: -5 }).minutes === 0.5 * e);
  check("no minutes reported → est_eff", price({ band: "DEMANDING", machineMinutes: 120, estMinutes: 120 }).minutes === e);
  check("reported minutes never exceed 480", clampMinutes(99999, 480) === 480);
  check("typed estimates clamp to 1..480", estEff(0, 30) === 1 && estEff(9999, 240) === 480);
  const withRpe = priceTask({ ...base, rpe: 10 } as PriceInput & { rpe: number }, { rawBefore: 0 }, "DUTY");
  check("RPE is ignored for tasks", JSON.stringify(withRpe) === JSON.stringify(price({})));
  check("K: play and study-linked tasks pay 0", price({ mode: "PLAY" }).raw === 0 && price({ mode: "STUDY" }).raw === 0);
  check("compulsory never changes the price (it is not an input)", !("compulsory" in base));
  check("timing: a passed DEADLINE is late", timingFor({ dueKind: "DEADLINE", dueDay: "2026-10-05", day: "2026-10-06" }) === "LATE");
  check("timing: a carried PLANNED day is never late", timingFor({ dueKind: "PLANNED", dueDay: "2026-10-05", day: "2026-10-09" }) === "ON_TIME");
  check("timing: late pays 0.85", price({ timing: "LATE" }).raw === 8.5 && price({ timing: "MAKE_UP" }).raw === 8.5);
}

console.log("— pricing: the knee —");
{
  const rnd = prng(20261005);
  const raws = Array.from({ length: 14 }, () => Math.round(rnd() * 600) / 10);
  const total = raws.reduce((a, b) => a + b, 0);
  const expected = kneeG(total);
  let worst = 0;
  const sums: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const order = [...raws];
    for (let j = order.length - 1; j > 0; j--) {
      const k = Math.floor(rnd() * (j + 1));
      [order[j], order[k]] = [order[k], order[j]];
    }
    let before = 0;
    let paid = 0;
    for (const raw of order) {
      // Rounded as a receipt rounds its xp, so the drift measured is the stored one.
      paid += Math.round(kneePay(before, raw) * 1000) / 1000;
      before += raw;
    }
    sums.push(paid);
    worst = Math.max(worst, Math.abs(paid - expected));
  }
  const spread = Math.max(...sums) - Math.min(...sums);
  check("order-invariant over 1,000 random orders, within 0.05 of g(ΣR)", worst <= 0.05 && spread <= 0.05, `ΣR ${total.toFixed(1)}, worst ${worst.toFixed(4)}, spread ${spread.toFixed(4)}`);
  check("g is continuous at 100", near(kneeG(100), 100) && near(kneeG(100 + 1e-9), 100, 1e-6) && near(kneeG(100 - 1e-9), 100, 1e-6));
  check("g is the identity up to 100", kneeG(0) === 0 && kneeG(46) === 46);
  check("the knee note reads the day's position", kneeNote({ kneeBefore: 19.3, raw: 26.7, xp: 26.7 }) === "full rate (46 of 100 used today)", kneeNote({ kneeBefore: 19.3, raw: 26.7, xp: 26.7 }));
}

console.log("— pricing: receipts —");
{
  const a = price({ band: "DEMANDING", machineMinutes: 120, estMinutes: 120, minutes: 150 }, 12.5);
  const b = price({ band: "DEMANDING", machineMinutes: 120, estMinutes: 120, minutes: 150 }, 12.5);
  check("identical receipt JSON for identical input", JSON.stringify(a) === JSON.stringify(b));
  check("every receipt carries its formula version", a.v === "life-1");
  const self = price({ band: "STANDARD", bandOverride: 1 });
  check("a self-rated receipt says so", self.selfRated === true && self.factors[0].value === BAND_BASE.DEMANDING && !!self.factors[0].note);
  const row = projectRow(
    { band: "INTRO", bandOverride: 0, machineMinutes: 15, estMinutes: 15, recurrence: "DAILY", intrinsic: false, autoMetric: null, track: "DUTY" },
    { rawBefore: 40, streakDays: 30, repeatN: 1, introBefore: 2 }
  );
  const direct = priceTask({ ...base, band: "INTRO", machineMinutes: 15, estMinutes: 15, recurring: true, streakDays: 30, introBefore: 2 }, { rawBefore: 40 }, "DUTY");
  check("a row's projection is priceTask for the same context", JSON.stringify(row) === JSON.stringify(direct));
  const study = projectRow(
    { band: "STANDARD", bandOverride: 0, machineMinutes: 30, estMinutes: 30, recurrence: "DAILY", intrinsic: false, autoMetric: "REVIEWS", track: "CRAFT" },
    { rawBefore: 0 }
  );
  check("a study-linked row projects 0, 'paid by reviews'", study.xp === 0 && study.factors.some((f) => f.label === "paid by reviews"));
}

// The model checks await a stubbed timeout, so they run last and the
// verdict waits for them.
modelChecks().then(() => {
  if (failed > 0) {
    console.log(`\n${failed} FAILED`);
    process.exit(1);
  }
  console.log("\nall passed");
});

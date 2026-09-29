/**
 * Checks the bridge between the review app and the town: the pure rules that
 * turn today's answers into what the town reads. No database and no town is
 * needed — every function here is pure, which is what makes the study signal
 * checkable at all. Prints what it checked and exits non-zero on a failure.
 *
 * Run with `npx tsx scripts/town-bridge-check.ts`.
 */
import {
  MISS_WEIGHT, MUSTER_CAP, clearedField, musterOf, musterShare, parseReviewDetail, reviewDetail,
  type FieldDaily, type ReviewDetail, type TownInput,
} from "../src/lib/town/rules";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
  if (!ok) failures++;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── The ledger's review detail ────────────────────────────
console.log("review detail");
{
  const cases: ReviewDetail[] = [
    { lv: 5, due: 12, fdue: 3 },
    { lv: 2, due: 0, fdue: 0 },
    { lv: 20, due: 1234, fdue: 987 },
    { due: 7, fdue: 2 },
    { due: 0, fdue: 0 },
  ];
  for (const d of cases) {
    const text = reviewDetail(d);
    const back = parseReviewDetail(text);
    check(same(back, d) && (d.lv !== undefined || !(back && "lv" in back)), `"${text}" reads back as written`);
  }
  check(reviewDetail({ lv: 5, due: 12, fdue: 3 }) === "lv=5;due=12;fdue=3", "a pass writes lv=<newLevel>;due=<due>;fdue=<fdue>");
  check(reviewDetail({ due: 12, fdue: 3 }) === "due=12;fdue=3", "a miss writes due=<due>;fdue=<fdue>, with no level");

  // Rows written before the counts were recorded, and other reasons' text.
  const legacy: (string | null | undefined)[] = [
    null,
    undefined,
    "",
    "Idle 12d with unspent points that could already be spent.",
    "MEMORY_WARD_1",
    "Crisp and specific: names the mechanism and one limit of it.",
    "due=3",
    "fdue=3",
    "lv=4",
    "due=x;fdue=1",
    "due=-1;fdue=0",
  ];
  for (const d of legacy) check(parseReviewDetail(d) === null, `legacy detail ${JSON.stringify(d)} reads as no counts`);

  // The fields are found wherever they sit, so they can follow other text.
  check(same(parseReviewDetail("A graded rationale. lv=3;due=2;fdue=0"), { lv: 3, due: 2, fdue: 0 }), "counts appended after free text are still found");
  check(same(parseReviewDetail("fdue=4;due=9"), { due: 9, fdue: 4 }), "order does not matter");
  check(same(parseReviewDetail("due=9;fdue=4;fdue=6"), { due: 9, fdue: 4 }), "the first fdue wins, as input.ts's SQL reads it");
  check(parseReviewDetail("fdue=5")?.due === undefined, "'fdue' is never read as 'due'");

  // input.ts reads fdue in SQL with SUBSTRING(detail FROM 'fdue=([0-9]+)'). The same pattern here must
  // find the same number the writer wrote, for passes and misses alike.
  const sql = (text: string) => /fdue=([0-9]+)/.exec(text)?.[1];
  check(cases.every((d) => sql(reviewDetail(d)) === String(d.fdue)), "the SQL pattern reads back every fdue the writer wrote");
}

// ── A Field cleared ───────────────────────────────────────
console.log("cleared Field");
{
  // passes 0 or 1, fdue 0 or 1, misses 0 or above the passes.
  const rows: [passes: number, misses: number, fdue: number, want: boolean][] = [
    [0, 0, 0, false],
    [0, 0, 1, false],
    [0, 2, 0, false],
    [0, 2, 1, false],
    [1, 0, 0, true],
    [1, 0, 1, false],
    [1, 2, 0, false],
    [1, 2, 1, false],
  ];
  for (const [passes, misses, fdue, want] of rows) {
    check(clearedField({ passes, misses, fdue }) === want, `passes ${passes}, misses ${misses}, ${fdue} left due: ${want ? "cleared" : "not cleared"}`);
  }
  check(clearedField({ passes: 3, misses: 3, fdue: 0 }), "exactly half right clears it");
  check(!clearedField({ passes: 3, misses: 4, fdue: 0 }), "one more miss than passes does not");
  // The bug this replaces: the midnight degrade pushes every overdue card a day out and touches it, so a
  // Field nobody opened read as reviewed with nothing due. With no answers there is nothing to clear.
  check(!clearedField({ passes: 0, misses: 0, fdue: 0 }), "a Field emptied by the midnight degrade, with no answers, is not cleared");
}

// ── The muster ────────────────────────────────────────────
console.log("muster");
{
  const fd = (o: Partial<FieldDaily>): FieldDaily => ({
    id: "f", name: "Statistics", school: "science", level: 6, attrs: [], ideasToday: 0, ideasWeek: 0,
    reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
  });
  const at = (fields: FieldDaily[], dueRemaining: number): TownInput => ({
    schools: { commerce: 0, science: 0, mind: 0 }, scores: {}, streakDays: 0, equippedAttributes: [], peakDepth: 0, reviewsToday: 0,
    newIdeasThisWeek: { commerce: 0, science: 0, mind: 0 }, emblems: [], domainPeak: 0, domainSum: 0, dueRemaining, newIdeasToday: 0, fields,
  });
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  const half = musterOf(at([fd({ passed: [12, 8, 0, 0] })], 20));
  check(half.passes === 20 && half.answered === 20 && half.target === 40 && near(half.share, 0.5), `20 right of 40 answered-plus-due: share ${half.share} of target ${half.target}`);

  const idle = musterOf(at([fd({})], 0));
  check(idle.target === 0 && idle.share === 1, `nothing due and nothing answered: share ${idle.share}, nothing was asked`);
  const done = musterOf(at([fd({ passed: [9, 3, 0, 0] })], 0));
  check(done.target === 12 && done.share === 1, `nothing left due after 12 right answers: share ${done.share}`);

  const mixed = musterOf(at([fd({ passed: [10, 0, 0, 0], misses: 10 })], 20));
  check(MISS_WEIGHT === 0.5 && mixed.answered === 20 && near(mixed.share, (10 + 0.5 * 10) / 40), `10 right, 10 wrong, 20 due: a miss weighs half (share ${mixed.share})`);
  const garbage = musterOf(at([fd({ misses: 40 })], 0));
  check(near(garbage.share, 0.5), `40 wrong answers and nothing left due reach only half (share ${garbage.share})`);

  const backlog = musterOf(at([fd({ passed: [40, 0, 0, 0] })], 60));
  check(MUSTER_CAP === 40 && backlog.target === 40 && backlog.share === 1, `40 right on a 100-card backlog: the target is capped at ${backlog.target}, share ${backlog.share}`);
  const start = musterOf(at([fd({ passed: [10, 0, 0, 0] })], 90));
  check(start.target === 40 && near(start.share, 0.25), `10 right on a 100-card backlog: share ${start.share}`);

  const many = musterOf(at([fd({ passed: [1, 2, 3, 4], misses: 1 }), fd({ id: "g", name: "Philosophy", passed: [0, 0, 0, 5], misses: 2 })], 7));
  check(many.passes === 15 && many.misses === 3 && many.due === 7 && many.target === 25, `passes count every depth band across every Field (${many.passes} right, ${many.misses} wrong, ${many.due} due)`);

  const bare = musterOf(at([fd({ passed: [4, 0, 0, 0], failed: 3 })], 4));
  check(bare.misses === 0 && bare.target === 8, "only the ledger's misses count: a fixture's `failed` alone is not a miss");
  const none = musterOf({ ...at([], 5), fields: undefined });
  check(none.target === 5 && none.share === 0, `no Fields at all and 5 due: share ${none.share}`);

  // The target does not move as the day is worked: each answer moves a card from due to answered.
  const steps = [0, 5, 10, 15, 20].map((k) => musterShare(k, 0, 20 - k));
  check(steps.every((m) => m.target === 20) && steps.every((m, i) => i === 0 || m.share > steps[i - 1].share), `working through 20 due cards: the target holds at 20 while the share climbs ${steps.map((m) => m.share).join(" → ")}`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);

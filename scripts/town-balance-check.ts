/**
 * The difficulty contract (docs/town-survival-systems.md §10, §13, §19): the
 * same scripted town on sixteen maps, played several ways.
 *
 *   G0  static player, true zero study     reported only: no streak, no emblems, 21 cards due and none answered
 *   G1  static player, no study            falls on every map, median day 8–30
 *   G2  study multiplies strategy          the steward lasts at least a fifth longer with study (G5 against G6);
 *                                          a static player's study is reported only — study feeds the purpose tier,
 *                                          which counts only once the tiers under it are met (docs §19.1)
 *   G3  static player, neglected study     falls no later than G1 (median)
 *   G4  strategist, active study           reported only: defence by forecast, nothing else
 *   G5  steward, active study              plays the needs (./town-steward): lasts at least 1.6× G1, and 42 days (median)
 *   G6  steward, no study                  strategy alone: lasts at least 1.3× G1 (median)
 *
 * The frozen lines keep 'none' as their no-study base, though it carries a
 * 12-day streak, emblem depth 6 and ten reviews; G0 is the true zero beside
 * them, reported for the contract that replaces these lines (docs §24).
 *
 * And the shape of it (§19.4), on six seeds: a run of good decisions carries
 * a town; no single one decides it.
 *
 *   D1  one decision, made or not, moves Wellbeing and Hope by at most a tenth of their range in the next day
 *   D2  giving up the steward's run of decisions (the static player's chores from day 12) costs the town
 *       at least twice as many days as a single different decision moves its fall, and at least five
 *
 * The work is a list of jobs (one town on one map, or one branch of a D
 * probe), each giving one row. Run whole it plays them in turn; with
 * `--shard i/n` it plays its share and prints each row as a JSON line, for
 * ./run-shards to merge. Either way one report() reads the rows, so the table
 * and the verdicts cannot differ between the two.
 *
 *   npm run town:balance                     sharded (./run-shards), the gate
 *   npx tsx scripts/town-balance-check.ts    in one process, the same output
 *     --part G|D          only the G lines, or only the D probe
 *     --seeds 42,7        other seeds, for both parts (a slice for testing)
 *     --lines G1,G5       only these G lines (the verdicts that need others are skipped)
 *     --force-fail G1     report that verdict failed whatever the numbers (to test the runner)
 *
 * Exits non-zero if the contract breaks.
 */
import { newTown, clock } from "../src/lib/town/sim/state";
import { profileFor } from "../src/lib/town/rules";
import { FOG } from "../src/lib/town/sim/vision";
import { holdFestival, type SimContext } from "../src/lib/town/sim/tick";
import { place, recruit, setPolicy } from "../src/lib/town/sim/actions";
import { checkPlacement, center } from "../src/lib/town/sim/world";
import type { GameState, StructureType } from "../src/lib/town/sim/types";
import { opening, playthrough, runFrom, studyInput, type Study, type Style } from "./town-playthrough";
import { newMemory, type StewardMemory } from "./town-steward";
import { invokedAs, jobsOfShard, shardArg, type ShardJob } from "./run-shards";

export const SEEDS = [42, 7, 99, 123, 2024, 31337, 5, 77, 11, 256, 404, 1001, 4242, 8080, 9001, 65535];
export const D_SEEDS = [42, 7, 99, 123, 2024, 5];
export const LIMIT = 60;

export type LineId = "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6";
export type VerdictId = "G1" | "G2" | "G3" | "G5" | "G6" | "D1" | "D2";

export const RUNS: { id: LineId; name: string; study: Study; style: Style }[] = [
  { id: "G0", name: "G0 static, true zero (info)", study: "zero", style: "static" },
  { id: "G1", name: "G1 static, no study", study: "none", style: "static" },
  { id: "G2", name: "G2 static, active study", study: "active", style: "static" },
  { id: "G3", name: "G3 static, neglected study", study: "neglect", style: "static" },
  { id: "G4", name: "G4 strategist, active study", study: "active", style: "strategist" },
  { id: "G5", name: "G5 steward, active study", study: "active", style: "steward" },
  { id: "G6", name: "G6 steward, no study", study: "none", style: "steward" },
];

/**
 * Verdicts that already failed at the M1 baseline (docs §24.0), each held to
 * its baseline median, in days, give or take HOLD_DAYS, until M2's contract
 * replaces the frozen lines. The median held is the line's own (G2: G5's,
 * D2: the days the run given up costs). Empty: every verdict gates on its
 * own terms.
 */
export const HELD: Partial<Record<VerdictId, number>> = {};
export const HOLD_DAYS = 2;

// ── the D probe's branches ─────────────────────────────────────────────────
// A town played well to day 12, then branched: the steward carries on (ref), or makes one different
// decision first and carries on, or gives up its way for the static player's. A day later the
// town is probed (D1); every branch then plays to day 60 and its fall day is compared (D2).

const nearHall = (s: GameState, ctx: SimContext, type: StructureType): boolean => {
  const hall = s.structures.find((b) => b.type === "townhall");
  if (!hall) return false;
  const [cx, cy] = center(hall).map(Math.round);
  for (let r = 2; r < 16; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
    if (checkPlacement(s, type, x, y).ok && !place(s, ctx, type, x, y)) return true;
  }
  return false;
};
const DECISIONS: { name: string; apply: (s: GameState, ctx: SimContext, mem: StewardMemory) => void }[] = [
  { name: "a festival", apply: (s) => { s.res.meals += 120; s.res.coin += 100; s.res.wood += 60; holdFestival(s); } },
  { name: "an extra house", apply: (s, ctx) => { s.res.wood += 30; s.res.stone += 20; nearHall(s, ctx, "house"); } },
  { name: "an extra tower", apply: (s, ctx) => { s.res.wood += 20; s.res.stone += 50; nearHall(s, ctx, "watchtower"); } },
  { name: "an extra recruit", apply: (s) => { s.res.coin += 30; for (const b of s.structures) if (b.type === "barracks" && !recruit(s, b.id)) break; } },
  { name: "a build skipped", apply: (_s, _ctx, mem) => { mem.nextBuildAt += 6 * 60; } },
  { name: "a cold night", apply: (s) => setPolicy(s, { heat: 4 }) },
];
const REF = "steward alone";
const SWITCH = "the static player's way";
const BRANCHES = [REF, ...DECISIONS.map((d) => d.name), SWITCH];

// ── jobs and rows ──────────────────────────────────────────────────────────

export type BalanceJob = ShardJob & ({ part: "G"; line: LineId; seed: number } | { part: "D"; seed: number; branch: string });

/** One G town: the day it fell (null if it stood) and why. */
export type GRow = { job: string; part: "G"; line: LineId; seed: number; fell: number | null; cause: string | null };
/**
 * One D branch. Null day: the town fell before day 12 and the seed sits the probe out. Wellbeing and Hope a day after
 * the branch (not for the switch), and the day it fell, LIMIT + 1 if it stood.
 */
export type DRow = { job: string; part: "D"; seed: number; branch: string; day: number | null; well?: number; hope?: number; fell?: number };
export type BalanceRow = GRow | DRow;

type Opts = { parts: ("G" | "D")[]; seeds: number[]; dSeeds: number[]; lines: LineId[]; forceFail: string[] };

function optsOf(argv: string[]): Opts {
  const val = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (flag: string) => val(flag)?.split(",").map((x) => x.trim()).filter(Boolean);
  const part = val("--part")?.toUpperCase();
  if (part !== undefined && part !== "G" && part !== "D") throw new Error(`--part takes G or D, not ${part}`);
  const seeds = list("--seeds")?.map(Number);
  if (seeds?.some((x) => !Number.isInteger(x))) throw new Error(`--seeds takes whole numbers: ${val("--seeds")}`);
  const lines = list("--lines")?.map((x) => x.toUpperCase());
  const unknown = lines?.filter((x) => !RUNS.some((r) => r.id === x));
  if (unknown?.length) throw new Error(`--lines: no such line ${unknown.join(", ")}`);
  return {
    parts: part ? [part] : ["G", "D"],
    seeds: seeds ?? SEEDS,
    dSeeds: seeds ?? D_SEEDS,
    lines: (lines as LineId[] | undefined) ?? RUNS.map((r) => r.id),
    forceFail: list("--force-fail")?.map((x) => x.toUpperCase()) ?? [],
  };
}

/**
 * Every job the arguments ask for, in report order. The cost is a rough guess
 * in static-run units, from timed runs (a steward's town takes about five
 * times a static one's; a D branch replays 12 days and then plays 48), so the
 * shards come out even.
 */
export function jobs(argv: string[]): BalanceJob[] {
  const o = optsOf(argv);
  const out: BalanceJob[] = [];
  if (o.parts.includes("G")) {
    for (const run of RUNS) {
      if (!o.lines.includes(run.id)) continue;
      const cost = run.style === "steward" ? 5 : 1;
      for (const seed of o.seeds) out.push({ key: `G:${run.id}:${seed}`, cost, part: "G", line: run.id, seed });
    }
  }
  if (o.parts.includes("D")) {
    for (const seed of o.dSeeds) for (const branch of BRANCHES) {
      out.push({ key: `D:${seed}:${branch}`, cost: branch === SWITCH ? 3 : 7, part: "D", seed, branch });
    }
  }
  return out;
}

const fallDay = (s: GameState) => s.fallen?.day ?? LIMIT + 1;

/** The town on day 12, once per seed per process: every branch starts from a copy of it, as the unsharded probe always did. */
const bases = new Map<number, { day: number; state: string; mem: string } | null>();
function baseFor(seed: number, ctx: SimContext) {
  if (!bases.has(seed)) {
    const s = newTown(seed, 20);
    opening(s, ctx);
    const mem = newMemory();
    runFrom(s, ctx, "steward", 12 * 24, undefined, mem);
    bases.set(seed, s.fallen ? null : { day: clock(s.time).day, state: JSON.stringify(s), mem: JSON.stringify(mem) });
  }
  return bases.get(seed)!;
}

/** Plays one job and returns its row. */
export function runJob(job: BalanceJob): BalanceRow {
  FOG.rules = false;
  if (job.part === "G") {
    const run = RUNS.find((r) => r.id === job.line)!;
    const o = playthrough(job.seed, run.study, run.style, undefined, LIMIT);
    return { job: job.key, part: "G", line: job.line, seed: job.seed, fell: o.fell, cause: o.cause ?? null };
  }
  const input = studyInput("active");
  const ctx: SimContext = { profile: profileFor(input), input };
  const base = baseFor(job.seed, ctx);
  const row: DRow = { job: job.key, part: "D", seed: job.seed, branch: job.branch, day: base?.day ?? null };
  if (!base) return row;
  const g: GameState = JSON.parse(base.state);
  const rest = (LIMIT - base.day + 1) * 24;
  if (job.branch === SWITCH) {
    runFrom(g, ctx, "static", rest);
    return { ...row, fell: fallDay(g) };
  }
  const gm: StewardMemory = JSON.parse(base.mem);
  DECISIONS.find((d) => d.name === job.branch)?.apply(g, ctx, gm);
  runFrom(g, ctx, "steward", 24, undefined, gm);
  const well = g.needs?.well ?? 0;
  const hope = g.mood;
  runFrom(g, ctx, "steward", rest - 24, undefined, gm);
  return { ...row, well, hope, fell: fallDay(g) };
}

/** A progress line for one finished job. */
export function label(r: BalanceRow): string {
  if (r.part === "G") return `${r.line} seed ${r.seed}: ${r.fell === null ? "stood" : `fell day ${r.fell} (${r.cause ?? "sacked"})`}`;
  return `D seed ${r.seed} ${r.branch}: ${r.day === null ? "fell before day 12" : `fell day ${r.fell}`}`;
}

// ── the report ─────────────────────────────────────────────────────────────

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const shown = (d: number) => (d > LIMIT ? "60+" : String(d));

/**
 * Prints the table and the verdicts from the rows, in job order, and returns
 * how many verdicts failed. The one place the contract is judged: the sharded
 * runner and the single process both end here.
 */
export function report(rows: BalanceRow[], argv: string[], log: (line: string) => void = console.log): number {
  const o = optsOf(argv);
  let failures = 0;
  const verdict = (id: VerdictId, ok: boolean, what: string, held?: number) => {
    const forced = o.forceFail.includes(id);
    const base = HELD[id];
    const holds = !ok && !forced && base !== undefined && held !== undefined && Math.abs(held - base) <= HOLD_DAYS;
    const pass = (ok || holds) && !forced;
    const note = forced ? " (forced to fail)" : holds ? ` (held: failing since the baseline, median ${held} within ${HOLD_DAYS} days of its ${base})` : !ok && base !== undefined ? ` (held to ${base} ± ${HOLD_DAYS} days, and outside it)` : "";
    log(`${pass ? (holds ? "  held" : "  ok  ") : "  FAIL"} ${what}${note}`);
    if (!pass) failures++;
  };
  const skip = (id: VerdictId, needs: LineId[]) => log(`  skip ${id}: line${needs.length > 1 ? "s" : ""} ${needs.join(", ")} not run`);

  if (o.parts.includes("G")) {
    const g = new Map<LineId, number[]>();
    for (const run of RUNS) {
      if (!o.lines.includes(run.id)) continue;
      const mine = rows.filter((r): r is GRow => r.part === "G" && r.line === run.id);
      const days = mine.map((r) => r.fell ?? LIMIT + 1);
      const causes = mine.map((r) => (r.fell === null ? "stood" : r.cause ?? "sacked"));
      g.set(run.id, days);
      log(`${run.name.padEnd(30)} median ${String(median(days)).padStart(4)}  days ${days.map(shown).join(" ")}  (${causes.join(", ")})`);
    }
    const need = (id: VerdictId, lines: LineId[], then: (...xs: number[][]) => void) => {
      if (lines.every((l) => g.has(l))) then(...lines.map((l) => g.get(l)!));
      else skip(id, lines.filter((l) => !g.has(l)));
    };
    need("G1", ["G1"], (g1) => verdict("G1", g1.every((d) => d <= LIMIT) && median(g1) >= 8 && median(g1) <= 30, `G1 a static player without study falls on every map (median day ${median(g1)}, ${g1.filter((d) => d >= 8 && d <= 30).length} of ${g1.length} within days 8–30)`, median(g1)));
    if (g.has("G0")) log(`  info G0 a static player at a true zero of study: median ${median(g.get("G0")!)}${g.has("G1") ? ` (the frozen base, 'none': ${median(g.get("G1")!)})` : ""}`);
    need("G2", ["G5", "G6"], (g5, g6) => verdict("G2", median(g5) >= 1.2 * median(g6), `G2 study multiplies strategy: the steward lasts ${median(g5)} days with it, ${median(g6)} without (median)`, median(g5)));
    if (g.has("G2") && g.has("G1")) log(`  info G2 a static player's study: median ${median(g.get("G2")!)} with it, ${median(g.get("G1")!)} without — it feeds a pyramid whose base is failing`);
    need("G3", ["G1", "G3"], (g1, g3) => verdict("G3", median(g3) <= median(g1), `G3 neglected study lasts no longer (median ${median(g3)} against ${median(g1)})`, median(g3)));
    if (g.has("G4")) log(`  info G4 the forecast-reading strategist with active study: median ${median(g.get("G4")!)}${g.has("G2") ? ` (static with study: ${median(g.get("G2")!)})` : ""}`);
    need("G5", ["G1", "G5"], (g1, g5) => verdict("G5", median(g5) >= 1.6 * median(g1) && median(g5) >= 42, `G5 the steward with active study lasts ${median(g5)} days (median), ${(median(g5) / median(g1)).toFixed(1)}× the static player's ${median(g1)}`, median(g5)));
    need("G6", ["G1", "G6"], (g1, g6) => verdict("G6", median(g6) >= 1.3 * median(g1), `G6 the steward without study lasts ${median(g6)} days (median), ${(median(g6) / median(g1)).toFixed(2)}× the static player's — strategy alone pays`, median(g6)));
  }

  if (o.parts.includes("D")) {
    let worstWell = 0;
    let worstHope = 0;
    const singleDays: number[] = [];
    const switchDays: number[] = [];
    for (const seed of o.dSeeds) {
      const mine = rows.filter((r): r is DRow => r.part === "D" && r.seed === seed);
      const ref = mine.find((r) => r.branch === REF);
      if (!ref || ref.day === null) continue;
      const refFall = ref.fell!;
      for (const d of DECISIONS) {
        const r = mine.find((x) => x.branch === d.name)!;
        const dw = Math.abs(r.well! - ref.well!);
        const dh = Math.abs(r.hope! - ref.hope!);
        worstWell = Math.max(worstWell, dw);
        worstHope = Math.max(worstHope, dh);
        singleDays.push(Math.abs(r.fell! - refFall));
        log(`       seed ${String(seed).padStart(5)} day ${ref.day}: ${d.name.padEnd(16)} a day on: Δwell ${dw.toFixed(3)}, ΔHope ${dh.toFixed(1)}; falls on day ${shown(r.fell!)} (steward alone: ${shown(refFall)})`);
      }
      const sw = mine.find((x) => x.branch === SWITCH)!;
      switchDays.push(refFall - sw.fell!);
      log(`       seed ${String(seed).padStart(5)}: the static player's way from day 12 falls on day ${shown(sw.fell!)} (steward: ${shown(refFall)})`);
    }
    verdict("D1", worstWell <= 0.08 && worstHope <= 10, `D1 no single decision moves the town far in a day (worst Δwell ${worstWell.toFixed(3)} of 1, worst ΔHope ${worstHope.toFixed(1)} of 100)`);
    verdict("D2", median(switchDays) >= Math.max(5, 2 * median(singleDays)),
      `D2 giving up the run of decisions costs ${median(switchDays)} days (median); one different decision moves the fall by ${median(singleDays)}`, median(switchDays));
  }

  log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  return failures;
}

function main() {
  const argv = process.argv.slice(2);
  const all = jobs(argv);
  const shard = shardArg(argv);
  if (shard) {
    // A shard prints nothing but its rows, one JSON line each, for ./run-shards to merge.
    for (const job of jobsOfShard(all, shard)) console.log(JSON.stringify(runJob(job)));
    return;
  }
  const rows = all.map((job, i) => {
    const r = runJob(job);
    console.error(`  [${String(i + 1).padStart(3)}/${all.length}] ${label(r)}`);
    return r;
  });
  process.exit(report(rows, argv) ? 1 : 0);
}

if (invokedAs("town-balance-check")) main();

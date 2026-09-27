/**
 * The difficulty contract (docs/town-survival-systems.md §10, §13): the same
 * scripted town on eight maps, played four ways.
 *
 *   G1  static player, no study data      falls on days 8–30 in at least 6 of 8 maps
 *   G2  static player, active study       lasts longer than G1 (median)
 *   G3  static player, neglected study    falls no later than G1 (median)
 *   G4  strategist, active study          reported only: a script is only as good as its heuristics
 *
 * Run with `npm run town:balance`. Exits non-zero if the contract breaks.
 */
import { playthrough, type Study } from "./town-playthrough";

const SEEDS = [42, 7, 99, 123, 2024, 31337, 5, 77];
const LIMIT = 60;

const runs: { name: string; study: Study; adaptive: boolean }[] = [
  { name: "G1 static, no study", study: "none", adaptive: false },
  { name: "G2 static, active study", study: "active", adaptive: false },
  { name: "G3 static, neglected study", study: "neglect", adaptive: false },
  { name: "G4 strategist, active study", study: "active", adaptive: true },
];

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

const results: Record<string, number[]> = {};
for (const run of runs) {
  const days: number[] = [];
  const causes: string[] = [];
  for (const seed of SEEDS) {
    const o = playthrough(seed, run.study, run.adaptive);
    days.push(o.fell ?? LIMIT + 1);
    causes.push(o.fell === null ? "stood" : o.cause ?? "sacked");
  }
  results[run.name] = days;
  console.log(`${run.name.padEnd(30)} median ${String(median(days)).padStart(4)}  days ${days.map((d) => (d > LIMIT ? "60+" : String(d))).join(" ")}  (${causes.join(", ")})`);
}

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
  if (!ok) failures++;
};
const [g1, g2, g3, g4] = runs.map((r) => results[r.name]);
check(g1.filter((d) => d >= 8 && d <= 30).length >= 6, `G1 a static player without study falls on days 8–30 in ${g1.filter((d) => d >= 8 && d <= 30).length} of 8 maps`);
check(median(g2) > median(g1), `G2 active study lasts longer (median ${median(g2)} against ${median(g1)})`);
check(median(g3) <= median(g1), `G3 neglected study lasts no longer (median ${median(g3)} against ${median(g1)})`);
// G4 is reported, not enforced: a scripted strategist is only as good as its script. Whether each
// answer to a tactic works is checked directly in town-survival-check (N5).
console.log(`  info G4 the scripted strategist with active study: median ${median(g4)} (static with study: ${median(g2)})`);
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);

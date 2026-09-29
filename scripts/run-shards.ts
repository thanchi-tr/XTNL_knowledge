/**
 * Runs a long check across processes. The check lists its work as jobs; each
 * child process plays one shard of them (`--shard i/n`) and prints a JSON
 * line a job; this merges the lines, checks that every job came back once,
 * and hands the rows to the check's own report(), the same one the check
 * prints when run whole. So the table and the verdicts are judged in one
 * place, and the gate is the check's exit code, whichever way it ran.
 *
 *   npx tsx scripts/run-shards.ts [check] [--shards n] [--save rows.jsonl] [--rows rows.jsonl] [the check's own args…]
 *
 * - `check`: a name below (default balance);
 * - `--shards n`: how many processes (default one fewer than the cores, at most 8);
 * - `--save file`: keep the merged rows, one JSON line each;
 * - `--rows file`: report from saved rows instead of playing (a verdict re-read without the 20 minutes).
 *
 * Every other argument goes to the check, in the children and in its report.
 * Exits 1 if a verdict fails, a child fails, or a job brings back no row.
 */
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

/** A unit of work: a key unique in its check, and a rough cost for spreading the work evenly. */
export interface ShardJob {
  key: string;
  cost: number;
}

/** What a check shows the runner. Its rows carry the key of the job that made them in `job`. */
export interface ShardedCheck<J extends ShardJob, R extends { job: string }> {
  jobs(argv: string[]): J[];
  report(rows: R[], argv: string[]): number;
  label(row: R): string;
}

const CHECKS: Record<string, { file: string; load: () => Promise<ShardedCheck<ShardJob, { job: string }>> }> = {
  balance: { file: "town-balance-check.ts", load: () => import("./town-balance-check") },
};

/** Whether this process was started on the named script (and not merely imported by another). */
export function invokedAs(name: string): boolean {
  return path.basename(process.argv[1] ?? "").replace(/\.[cm]?[jt]sx?$/, "") === name;
}

/** `--shard i/n` among the arguments, or null. i counts from 0. */
export function shardArg(argv: string[]): { i: number; n: number } | null {
  const at = argv.indexOf("--shard");
  if (at < 0) return null;
  const m = /^(\d+)\/(\d+)$/.exec(argv[at + 1] ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[1]) >= Number(m[2])) throw new Error(`--shard takes i/n with 0 ≤ i < n, not ${argv[at + 1]}`);
  return { i: Number(m[1]), n: Number(m[2]) };
}

/**
 * Which shard each job goes to: dearest first, each to the shard with the
 * least work so far (ties to the lower shard). Pure, so the runner and every
 * child agree on the split without talking.
 */
export function assignShards(jobs: ShardJob[], n: number): number[] {
  const load = new Array<number>(n).fill(0);
  const at = new Array<number>(jobs.length);
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].cost - jobs[a].cost || a - b);
  for (const j of order) {
    let best = 0;
    for (let k = 1; k < n; k++) if (load[k] < load[best]) best = k;
    at[j] = best;
    load[best] += jobs[j].cost;
  }
  return at;
}

/** The jobs one shard plays, in the check's order. */
export function jobsOfShard<J extends ShardJob>(jobs: J[], shard: { i: number; n: number }): J[] {
  const at = assignShards(jobs, shard.n);
  return jobs.filter((_, k) => at[k] === shard.i);
}

/** Plays one shard in a child process; resolves with its rows and exit code once it ends. */
function playShard(file: string, args: string[], i: number, n: number, onRow: (row: { job: string }) => void): Promise<number> {
  // The child starts as this process did: node with tsx's loader flags, so no second tsx process sits between them.
  const child = spawn(process.execPath, [...process.execArgv, file, ...args, "--shard", `${i}/${n}`], { stdio: ["ignore", "pipe", "inherit"] });
  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const t = line.trim();
    let row: unknown = null;
    if (t.startsWith("{")) {
      try {
        row = JSON.parse(t);
      } catch {
        row = null;
      }
    }
    // Anything else a child prints (a warning from the sim) goes to stderr, where it cannot be taken for a row.
    if (row && typeof (row as { job?: unknown }).job === "string") onRow(row as { job: string });
    else if (t) console.error(`  [shard ${i}] ${line}`);
  });
  return new Promise((done) => {
    child.on("error", (e) => {
      console.error(`  [shard ${i}] could not start: ${e.message}`);
      done(1);
    });
    child.on("close", (code) => done(code ?? 1));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const name = args[0] && !args[0].startsWith("--") ? args.shift()! : "balance";
  const entry = CHECKS[name];
  if (!entry) throw new Error(`no check named ${name} (there are: ${Object.keys(CHECKS).join(", ")})`);
  const own = (flag: string) => {
    const at = args.indexOf(flag);
    if (at < 0) return undefined;
    const v = args[at + 1];
    args.splice(at, 2);
    return v;
  };
  const shardsArg = own("--shards");
  const save = own("--save");
  const from = own("--rows");
  if (args.includes("--shard")) throw new Error("--shard is for the children; the runner takes --shards n");

  const check = await entry.load();
  const all = check.jobs(args);
  const n = Math.max(1, Math.min(all.length, shardsArg ? Number(shardsArg) : Math.min(8, cpus().length - 1)));
  if (!Number.isInteger(n)) throw new Error(`--shards takes a whole number, not ${shardsArg}`);

  const got = new Map<string, { job: string }>();
  const extra: string[] = [];
  const keep = (row: { job: string }) => {
    if (got.has(row.job) || !all.some((j) => j.key === row.job)) extra.push(row.job);
    else got.set(row.job, row);
  };
  let broken = 0;
  const t0 = Date.now();
  if (from) {
    for (const line of fs.readFileSync(from, "utf8").split("\n")) if (line.trim().startsWith("{")) keep(JSON.parse(line));
  } else {
    const file = path.join(path.dirname(process.argv[1]), entry.file);
    console.error(`${name}: ${all.length} jobs on ${n} shards`);
    const codes = await Promise.all(Array.from({ length: n }, (_, i) => playShard(file, args, i, n, (row) => {
      keep(row);
      const secs = Math.round((Date.now() - t0) / 1000);
      console.error(`  [${String(got.size).padStart(3)}/${all.length} ${String(secs).padStart(5)}s shard ${i}] ${check.label(row)}`);
    })));
    codes.forEach((c, i) => {
      if (c !== 0) {
        console.error(`shard ${i} exited with code ${c}`);
        broken++;
      }
    });
  }

  const missing = all.filter((j) => !got.has(j.key)).map((j) => j.key);
  if (missing.length) console.error(`${missing.length} job(s) brought back no row: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", …" : ""}`);
  if (extra.length) console.error(`${extra.length} row(s) matched no job or came twice: ${extra.slice(0, 12).join(", ")}`);
  if (save) fs.writeFileSync(save, all.filter((j) => got.has(j.key)).map((j) => JSON.stringify(got.get(j.key))).join("\n") + "\n");
  if (broken || missing.length || extra.length) {
    // A table missing some of its towns would read as a verdict; there is none to give.
    console.error("no report: the rows are incomplete");
    process.exit(1);
  }
  const failed = check.report(all.map((j) => got.get(j.key)!), args);
  if (!from) console.error(`${name}: ${Math.round((Date.now() - t0) / 1000)} s on ${n} shards`);
  process.exit(failed ? 1 : 0);
}

if (invokedAs("run-shards")) {
  main().catch((e: Error) => {
    console.error(e.stack ?? e.message);
    process.exit(1);
  });
}

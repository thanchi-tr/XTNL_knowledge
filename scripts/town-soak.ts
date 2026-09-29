/**
 * The soak: many whole towns played through, every hour checked for things
 * that must never happen — a number gone NaN or negative, someone working in
 * or living in a building that is gone, a guard posted to a ruin, a band off
 * the map, a trainee who died still holding their place in the school.
 *
 *   npx tsx scripts/town-soak.ts [from] [to] [days]
 *
 * Runs `from`..`to` (1–250 by default), each on its own seed, the styles,
 * the study and the maps in turn. One JSON line a run: its outcome, and each
 * kind of fault found with how often and where first. Exceptions are caught
 * and reported with the day they struck.
 *
 * It also keeps the largest size each list in the state reached, and the
 * slowest game hour to simulate: a list that only grows, or an hour that
 * grows dear, is what makes a long game stutter.
 *
 * Honest endings (design M1): the run's log and the moments keep to their
 * caps, the log's dead add up to the town's, and each run says how many
 * game hours the Peril meter had stood lit, without a break, when the town
 * fell (`warnH`). P1 is the share of dwindled and abandoned towns whose
 * meter was lit a day or more before the fall; it must be P1_MIN or more.
 *
 *   npx tsx scripts/town-soak.ts --report a.jsonl b.jsonl …
 *
 * reads the lines of any number of runs (shards of the 250, say) and prints
 * the exceptions, the faults, the caps and P1, exiting 1 if any fails.
 */
import { readFileSync } from "node:fs";
import { playthrough, type Study, type Style } from "./town-playthrough";
import { clock } from "../src/lib/town/sim/state";
import { perilOf } from "../src/lib/town/sim/psyche";
import { MOMENTS_MAX } from "../src/lib/town/sim/moments";
import { PERIL_SHOW, SAMPLES_MAX, WAVES_MAX } from "../src/lib/town/sim/runlog";
import { LAMP_CAP } from "../src/lib/town/sim/world";
import { CATALOG } from "../src/lib/town/sim/catalog";
import { MAP_H, MAP_W, RESOURCE_KEYS, type GameState } from "../src/lib/town/sim/types";
import type { Biome } from "../src/lib/town/sim/biomes";

/** P1's bar: this share of dwindled and abandoned towns, or more, had the Peril meter lit a day before they fell. */
const P1_MIN = 0.95;
/** A day's warning, in game hours. */
const WARN_H = 24;

const reporting = process.argv[2] === "--report";
const from = reporting ? 1 : Number(process.argv[2] ?? 1);
const to = reporting ? 0 : Number(process.argv[3] ?? 250);
const days = Number(process.argv[4] ?? 60);

type Fault = { n: number; day: number; what: string };

/** The largest length each list (or key count each record) reached: top level, and on any villager. */
function sizes(s: GameState, most: Record<string, number>) {
  const keep = (k: string, n: number) => {
    if (n > (most[k] ?? 0)) most[k] = n;
  };
  for (const [k, v] of Object.entries(s)) {
    if (Array.isArray(v)) keep(k, v.length);
    else if (v && typeof v === "object") keep(`${k}{}`, Object.keys(v).length);
  }
  for (const p of s.villagers) for (const [k, v] of Object.entries(p)) if (Array.isArray(v)) keep(`villager.${k}`, v.length);
}

function inspect(s: GameState, faults: Map<string, Fault>, lastTime: { t: number }) {
  const day = clock(s.time).day;
  const note = (kind: string, what: string) => {
    const f = faults.get(kind);
    if (f) f.n++;
    else faults.set(kind, { n: 1, day, what });
  };
  const fin = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  if (!fin(s.time) || s.time < lastTime.t) note("time", `time ${s.time} after ${lastTime.t}`);
  lastTime.t = s.time;
  for (const k of RESOURCE_KEYS) {
    const v = s.res[k];
    if (!fin(v)) note(`res-nan:${k}`, `${k} = ${v}`);
    else if (v < -1e-6) note(`res-neg:${k}`, `${k} = ${v}`);
  }
  if (!fin(s.mood) || s.mood < -1e-6 || s.mood > 100 + 1e-6) note("mood", `mood ${s.mood}`);
  const byId = new Map(s.structures.map((st) => [st.id, st]));
  const people = new Map(s.villagers.map((v) => [v.id, v]));
  if (byId.size !== s.structures.length) note("dup-structure-id", "two structures share an id");
  if (people.size !== s.villagers.length) note("dup-villager-id", "two villagers share an id");
  for (const v of s.villagers) {
    if (!fin(v.health) || v.health < -1e-6 || v.health > 100 + 1e-6) note("villager-health", `${v.name} health ${v.health}`);
    if (!fin(v.happy)) note("villager-happy", `${v.name} happy ${v.happy}`);
    if (!fin(v.rank) || v.rank < 0) note("villager-rank", `${v.name} rank ${v.rank}`);
    if (v.work != null && !byId.has(v.work)) note("work-gone", `${v.name} works at #${v.work}, which is gone`);
    // Soldiers are posted to a military building and pupils sit in their school, neither on its roster; everyone else must be.
    else if (v.work != null && CATALOG[byId.get(v.work)!.type].category !== "military" && byId.get(v.work)!.training?.villagerId !== v.id && !byId.get(v.work)!.workers.includes(v.id) && !v.champion) note("work-unlisted", `${v.name} works at ${byId.get(v.work)!.type} #${v.work}, which does not list them`);
    if (v.house != null && !byId.has(v.house)) note("house-gone", `${v.name} lives at #${v.house}, which is gone`);
    if (v.guard != null && !byId.has(v.guard)) note("guard-gone", `${v.name} is posted to #${v.guard}, which is gone`);
    if (v.attrs) for (const [k, a] of Object.entries(v.attrs)) if (!Number.isInteger(a) || a < 1 || a > 20) note("attr-range", `${v.name} ${k} ${a}`);
    const b = v.body;
    if (b) for (const k of ["Tc", "Eg", "F", "B", "h2o", "W", "phi"] as const) if (!fin(b[k])) note(`body-nan:${k}`, `${v.name} ${k} = ${b[k]}`);
    if (v.scout && (!fin(v.scout.x) || !fin(v.scout.y))) note("scout-nan", `${v.name} scout at ${v.scout.x},${v.scout.y}`);
  }
  for (const st of s.structures) {
    if (!fin(st.hp) || st.hp < -1e-6) note("structure-hp", `${st.type} #${st.id} hp ${st.hp}`);
    if (!fin(st.condition)) note("structure-condition", `${st.type} #${st.id} condition ${st.condition}`);
    if (st.fuel !== undefined && (!fin(st.fuel) || st.fuel < -1e-6)) note("structure-fuel", `${st.type} #${st.id} fuel ${st.fuel}`);
    if (st.type === "lamppost" && st.fuel !== undefined && st.fuel > LAMP_CAP + 1e-6) note("lamp-overfull", `lamp #${st.id} fuel ${st.fuel}`);
    for (const id of st.workers) {
      const w = people.get(id);
      if (!w) note("worker-gone", `${st.type} #${st.id} lists worker #${id}, who is gone`);
      else if (w.work !== st.id) note("worker-mismatch", `${st.type} #${st.id} lists ${w.name}, who works at #${w.work}`);
    }
    if (st.training && !people.has(st.training.villagerId)) note("trainee-gone", `${st.type} #${st.id} trains #${st.training.villagerId}, who is gone`);
  }
  for (const b of s.roamers ?? []) {
    if (![b.x, b.y, b.tx, b.ty].every(fin)) note("band-nan", `band #${b.id} ${b.kind} at ${b.x},${b.y} → ${b.tx},${b.ty}`);
    else if (b.x < 0 || b.y < 0 || b.x >= MAP_W || b.y >= MAP_H) note("band-off-map", `band #${b.id} ${b.kind} at ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }
  if (s.raid) {
    for (const c of s.raid.combatants) {
      if (![c.x, c.y].every(fin) || !fin(c.hp)) note("combatant-nan", `${c.side} ${c.kind} at ${c.x},${c.y} hp ${c.hp}`);
    }
  }
  const tiles = new Map<number, number>();
  for (const st of s.structures) {
    for (let y = st.y; y < st.y + st.h; y++)
      for (let x = st.x; x < st.x + st.w; x++) {
        const i = y * MAP_W + x;
        const other = tiles.get(i);
        if (other !== undefined) note("structure-overlap", `#${other} and ${st.type} #${st.id} share ${x},${y}`);
        tiles.set(i, st.id);
      }
  }
  const queued = new Set<string>();
  for (const j of s.clearing) {
    const k = `${j.tile}:${j.pick ? 1 : 0}`;
    if (queued.has(k)) note("clearing-dup", `tile ${j.tile} queued twice`);
    queued.add(k);
  }
  for (const j of s.clearing) if (!Number.isInteger(j.tile) || j.tile < 0 || j.tile >= MAP_W * MAP_H || !fin(j.progress)) note("clearing-bad", `job ${JSON.stringify(j)}`);
  const r = s.recognition?.points;
  if (r !== undefined && (!fin(r) || r < 0 || r > 1000)) note("recognition", `points ${r}`);
  // Honest endings: the caps hold, and until the fall (when the log stops) every death is in the log once.
  if ((s.moments?.length ?? 0) > MOMENTS_MAX) note("moments-cap", `${s.moments!.length} moments`);
  const rl = s.runlog;
  if (rl) {
    if (rl.samples.length > SAMPLES_MAX) note("runlog-samples", `${rl.samples.length} samples`);
    if (rl.waves.length > WAVES_MAX) note("runlog-waves", `${rl.waves.length} waves`);
    const logged = Object.values(rl.deaths).reduce((a, n) => a + (n ?? 0), 0) + (rl.before?.deaths ?? 0);
    if (!s.fallen && logged !== s.deaths) note("runlog-deaths", `${logged} in the log, ${s.deaths} dead`);
  } else if (s.time > 2 * 60) note("runlog-missing", "no run log after the first hour");
}

/** The Peril meter as the top bar shows it: a rule's clock running, or food or fuel under PERIL_SHOW days. */
const meterLit = (s: GameState) => {
  const p = perilOf(s);
  return !!p.doom || Math.min(p.foodDays, p.fuelDays) < PERIL_SHOW;
};

interface Line {
  n: number;
  fell: number | null;
  cause?: string;
  error: string | null;
  faults: Record<string, Fault>;
  warnH?: number | null;
  alarms?: Record<string, number>;
}

/** The report over any number of runs' lines: exceptions, faults, the caps, and P1. Exits 1 on any failure. */
function report(files: string[]) {
  const lines: Line[] = files.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l) as Line));
  const errors = lines.filter((l) => l.error);
  const faulted = lines.filter((l) => Object.keys(l.faults).length);
  const kinds = new Map<string, number>();
  for (const l of faulted) for (const [k, f] of Object.entries(l.faults)) kinds.set(k, (kinds.get(k) ?? 0) + f.n);
  const causes = new Map<string, number>();
  for (const l of lines) causes.set(l.fell === null ? "stood" : l.cause ?? "none", (causes.get(l.fell === null ? "stood" : l.cause ?? "none") ?? 0) + 1);
  const ends = lines.filter((l) => l.fell !== null && (l.cause === "dwindled" || l.cause === "abandoned"));
  const warned = ends.filter((l) => (l.warnH ?? 0) >= WARN_H);
  const p1 = ends.length ? warned.length / ends.length : 1;
  const caps = ["moments-cap", "runlog-samples", "runlog-waves", "runlog-deaths", "runlog-missing"].map((k) => `${k} ${kinds.get(k) ?? 0}`);
  console.log(`${lines.length} runs · ${[...causes].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`exceptions: ${errors.length}${errors.length ? ` (runs ${errors.map((l) => l.n).join(", ")})` : ""}`);
  console.log(`faults: ${faulted.length} runs${kinds.size ? ` (${[...kinds].map(([k, n]) => `${k} ×${n}`).join(", ")})` : ""}`);
  console.log(`invariants: ${caps.join(", ")}`);
  const short = ends.filter((l) => (l.warnH ?? 0) < WARN_H).map((l) => `#${l.n} ${l.cause} day ${l.fell}, ${l.warnH ?? 0} h`);
  const lead = ends.map((l) => l.warnH ?? 0).sort((x, y) => x - y);
  const alarms = new Map<string, number>();
  for (const l of lines) for (const [k, n] of Object.entries(l.alarms ?? {})) alarms.set(k, (alarms.get(k) ?? 0) + n);
  console.log(`the meter's warning before a dwindle or abandon: median ${lead[lead.length >> 1] ?? 0} h, least ${lead[0] ?? 0} h; alarms raised in all: ${[...alarms].map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  console.log(`P1: ${warned.length} of ${ends.length} dwindled or abandoned towns had the Peril meter lit ${WARN_H} h or more before the fall (${(p1 * 100).toFixed(1)}%, needs ${P1_MIN * 100}%)${short.length ? `; short: ${short.join("; ")}` : ""}`);
  const ok = !errors.length && !faulted.length && p1 >= P1_MIN;
  console.log(ok ? "soak passed" : "soak FAILED");
  process.exit(ok ? 0 : 1);
}

if (reporting) report(process.argv.slice(3));

const STYLES: Style[] = ["static", "strategist", "steward"];
const STUDIES: Study[] = ["none", "active", "neglect"];
const BIOMES: Biome[] = ["temperate", "desert", "skyisles"];

for (let n = from; n <= to; n++) {
  const style = STYLES[n % 3];
  const study = STUDIES[Math.floor(n / 3) % 3];
  const biome = BIOMES[Math.floor(n / 9) % 3];
  const seed = 1000 + ((n * 7919) % 99991);
  const faults = new Map<string, Fault>();
  const last = { t: 0 };
  const most: Record<string, number> = {};
  let tHour = performance.now();
  let slowest = 0;
  let slowDay = 0;
  const t0 = Date.now();
  let error: string | null = null;
  let fell: number | null = null;
  let cause: string | undefined;
  let day = 0;
  // Since when the Peril meter has stood lit without a break (game minutes), and how long it had at the fall.
  let lit: number | null = null;
  let warnH: number | null = null;
  const alarms: Record<string, number> = {};
  let seenId = 0;
  try {
    const o = playthrough(seed, study, style, (s) => {
      day = clock(s.time).day;
      const spent = performance.now() - tHour;
      if (spent > slowest) {
        slowest = spent;
        slowDay = day;
      }
      inspect(s, faults, last);
      sizes(s, most);
      if (meterLit(s)) lit ??= s.time;
      else lit = null;
      if (s.fallen && warnH === null) warnH = lit === null ? 0 : Math.round((s.fallen.at - lit) / 60);
      for (const m of s.moments ?? []) {
        if (m.id <= seenId) continue;
        seenId = m.id;
        if (m.kind !== "peril" && m.kind !== "audit") continue;
        // The alarms raised, by the first word of their title: dwindling, hope, no (one lives), food, fuel; and the audits.
        const key = m.kind === "audit" ? "audit" : m.title.split(/[:\s]/)[0].toLowerCase();
        alarms[key] = (alarms[key] ?? 0) + 1;
      }
      tHour = performance.now();
    }, days, biome);
    fell = o.fell;
    cause = o.cause;
  } catch (e) {
    const err = e as Error;
    error = `day ${day}: ${err.message}\n${(err.stack ?? "").split("\n").slice(1, 6).join("\n")}`;
  }
  console.log(JSON.stringify({ n, seed, style, study, biome, fell, cause, warnH, alarms, secs: Math.round((Date.now() - t0) / 1000), slowestHourMs: Math.round(slowest), slowDay, error, most, faults: Object.fromEntries(faults) }));
}

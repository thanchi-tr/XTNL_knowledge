/**
 * Health Connect walks, hikes and weight (blueprint 5.1d, plan P27; decision D22, harm H17): the phase's own check.
 * Pure: no database, no network, no clock of its own (the cores run over fake stores; the rest is read as source).
 *
 *   npx tsx scripts/health-ingest-check.ts      (life:check runs it, right after proof-pages-check)
 *
 * It pins:
 *   1. A walk as logWalkCore takes it: its life day (a 03:30 walk is the day before's), its minutes, its incline from
 *      the climb (climb = distance × sin(angle), at most 45°), its note; cleanWalkInput accepts it as it stands.
 *   2. The keys: 'ingest:hc:<externalId>'; the INGEST row pays nothing (sink NONE, xp 0, no knee row, never a streak day)
 *      and names the session it is, or matched.
 *   3. The backfill is record-only (H17): a walk that started before `since` reaches logWalkCore with recordOnly, and
 *      logWalkCore returns the record before any pay or personal best; a newer walk is priced as any walk.
 *   4. One session, one payment: a hand-logged walk that day within 20 % (or 5 min and 0.3 km) is matched, the closest
 *      first, each absorbing one walk at most (claimed, or taken in the batch); two apps' records of one walk (half the
 *      shorter one's minutes in common) are one; nothing is written for a match but its key. Both orders: a walk typed
 *      by hand after Health Connect brought it in is refused with what is there (importedTwinOf, logWalkCore's guard
 *      before its create), and a second hand-typed walk is never refused by another hand-typed one.
 *   5. Once per record: a key on the ledger, or twice in one batch, or raced in (HC_WALK_INGESTED), is a duplicate.
 *   6. Weight: an import never replaces a typed reading or a later import (importReplaces); oldest first, so the day's
 *      latest stays; source 'import' at its measured instant.
 *   7. Writes on the live app only (lifeWritesEnabled): a dev server writes nothing (HC_WRITES_OFF).
 *   8. The wiring: logWalkCore's ingest path is one transaction (the session and its key), Train › Exercise passes
 *      neither ingest nor recordOnly, no other file writes an INGEST row, no migration (no new column or table), and
 *      the phone's sync is off until the user turns it on.
 */
import "./_no-model";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dayKeyOf, type DayKey } from "../src/lib/life-day";
import { cleanWalkInput, walkFactsOf } from "../src/lib/exercise";
import {
  HC_KINDS,
  HC_WALK_INGESTED,
  HC_WRITES_OFF,
  INGEST_KEY_PREFIX,
  INGEST_RECEIPT_V,
  MATCH_KM,
  MATCH_MINUTES,
  MATCH_OVERLAP,
  angleOfClimb,
  durationOf,
  ingestEventInput,
  ingestKeyOf,
  ingestLineOf,
  ingestReceiptOf,
  isBackfill,
  isIngestKey,
  isIngestReceipt,
  HC_ALREADY_HERE_PREFIX,
  alreadyHereLineOf,
  importedTwinOf,
  matchOf,
  overlapShare,
  walkInputOf,
  type HcBatch,
  type HcWalk,
  type SameDaySession,
} from "../src/lib/health-ingest";
import { ingestHealthCore, type IngestStore } from "../src/lib/health-ingest-server";
import { importReplaces } from "../src/lib/weight";
import { DEFAULT_SINK, activityData } from "../src/lib/activity";
import { NEVER_STREAK_SOURCES, STREAK_SOURCES, countsForStreakOf, streakUnitsOf } from "../src/lib/streak-curve";
import type { ActivityInput } from "../src/lib/life-types";
import type { LogWalkOptions } from "../src/lib/exercise-server";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
/** Source without comments, so a word in a doc comment never passes for code. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
}
const section = (s: string) => console.log(`\n── ${s}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Wednesday 21 October 2026, 11:12 in Sydney (AEDT, UTC+11): the life day is the 21st. The sync was switched on at 10:00.
const NOW = new Date("2026-10-21T00:12:00.000Z");
const TODAY: DayKey = "2026-10-21";
const SINCE = new Date("2026-10-20T23:00:00.000Z");
const walk = (over: Partial<HcWalk> = {}): HcWalk => ({
  externalId: "hc-1",
  kind: "WALK",
  start: new Date("2026-10-20T23:20:00.000Z"),
  end: new Date("2026-10-20T23:50:00.000Z"),
  distanceKm: 2.6,
  climbM: null,
  origin: "com.sec.android.app.shealth",
  ...over,
});
const at = (iso: string) => new Date(iso);
const hand = (id: string, durationMin: number, distanceKm: number, over: Partial<SameDaySession> = {}): SameDaySession => ({ id, day: TODAY, durationMin, distanceKm, at: null, claimed: false, ...over });

// ── 1. A walk as logWalkCore takes it ───────────────────────────────────────
section("1. a walk as logWalkCore takes it");
{
  const w = walkInputOf(walk({ kind: "HIKE", distanceKm: 4.04, climbM: 350, start: at("2026-10-20T22:00:00.000Z"), end: at("2026-10-20T23:35:30.000Z") }));
  check(
    "a hike's day is the life day it started on, its minutes end − start (one decimal), its distance two decimals, its note 'Hike · Health Connect'",
    w.day === TODAY && w.durationMin === 95.5 && w.distanceKm === 4.04 && w.note === "Hike · Health Connect",
    JSON.stringify(w)
  );
  check(
    "its incline is the climb over the distance: walkFactsOf reads the climb back (350 m over 4.04 km ≈ 5.0°, ≈ 352 m)",
    w.angleDeg === 5 && Math.abs(walkFactsOf(w).climbM - 350) <= 5,
    `${w.angleDeg}° → ${walkFactsOf(w).climbM} m`
  );
  check(
    "no climb, a zero or missing distance, or a negative climb is flat; a climb over the distance caps at 45°",
    angleOfClimb(3, null) === 0 && angleOfClimb(0, 100) === 0 && angleOfClimb(3, -5) === 0 && angleOfClimb(0.1, 500) === 45 && angleOfClimb(1, 100) === 5.7
  );
  check("a 03:30 walk counts for the day before (the life day turns at 04:00)", walkInputOf(walk({ start: at("2026-10-20T16:30:00.000Z"), end: at("2026-10-20T17:00:00.000Z") })).day === "2026-10-20");
  const clean = cleanWalkInput(w, TODAY);
  check("cleanWalkInput takes it as it stands (logWalkCore checks it again)", clean.ok && same(clean.value, { day: w.day, angleDeg: w.angleDeg, distanceKm: w.distanceKm, durationMin: w.durationMin, note: w.note }), JSON.stringify(clean));
  const none = cleanWalkInput(walkInputOf(walk({ distanceKm: 0 })), TODAY);
  check("a session with no distance is refused by the core's own rule (its line), never saved", !none.ok && /distance/.test(none.ok ? "" : none.error));
  check("Health Connect's kinds are walking and hiking only", same(HC_KINDS, ["WALK", "HIKE"]));
  check("durationOf is end − start in minutes", durationOf(walk()) === 30);
}

// ── 2. The keys and the INGEST row ──────────────────────────────────────────
section("2. the keys and the INGEST row");
{
  check("the key is 'ingest:hc:<externalId>'", ingestKeyOf("a1b2") === "ingest:hc:a1b2" && INGEST_KEY_PREFIX === "ingest:hc:" && isIngestKey("ingest:hc:x") && !isIngestKey("ingest:hc:") && !isIngestKey("workout:x") && !isIngestKey(null));
  const receipt = ingestReceiptOf(walk(), { backfill: true, matched: null });
  const input = ingestEventInput("s1", TODAY, receipt, NOW);
  const row = activityData("u1", input);
  check(
    "the INGEST row: sink NONE, xp 0, no raw (never a knee row), never a streak day, the session as its sourceId, dated the walk's day, keyed by the record",
    row.source === "INGEST" && row.sink === "NONE" && row.xp === 0 && row.rawXp === null && row.countsForStreak === false && row.sourceId === "s1" && row.dedupeKey === "ingest:hc:hc-1" && row.track === null && (row.day as Date).toISOString().startsWith(TODAY),
    JSON.stringify({ ...row, receipt: undefined })
  );
  check(
    "its receipt says where the walk came from and what became of it ('ingest-1', the record's minutes, backfill, matched)",
    isIngestReceipt(receipt) && receipt.v === INGEST_RECEIPT_V && receipt.start === "2026-10-20T23:20:00.000Z" && receipt.end === "2026-10-20T23:50:00.000Z" && receipt.backfill === true && receipt.matched === null && receipt.origin === "com.sec.android.app.shealth" && !isIngestReceipt({ v: "life-1" })
  );
  check(
    "its detail: 'health connect · walk · history' for the backfill, '· already logged' for a match",
    input.detail === "health connect · walk · history" && ingestEventInput("s1", TODAY, ingestReceiptOf(walk({ kind: "HIKE" }), { backfill: false, matched: "s-hand" }), NOW).detail === "health connect · hike · already logged"
  );
  check(
    "INGEST is a record: its default sink is NONE and it is never a streak day, whatever its writer asks (it adds no unit)",
    DEFAULT_SINK.INGEST === "NONE" && NEVER_STREAK_SOURCES.has("INGEST") && !STREAK_SOURCES.has("INGEST") && countsForStreakOf("INGEST", true) === false && streakUnitsOf({ source: "INGEST", countsForStreak: false }) === 0
  );
}

// ── 3–5. The core over a fake store ─────────────────────────────────────────
section("3–5. ingestHealthCore: the backfill, the match, once per record");

interface Fake {
  store: IngestStore;
  keys: Set<string>;
  walks: { externalId: string; recordOnly: boolean; day: DayKey }[];
  matches: ActivityInput[];
  weights: { kg: number; day: DayKey; measuredAt: string; source: string }[];
  reads: string[];
}

/** A fake store: a ledger of keys, the day's sessions, a logWalk that prices a walk as PAID unless recordOnly. */
function fakeStore(sessions: SameDaySession[] = [], opts: { refuse?: Record<string, string>; weightKept?: (kg: number) => boolean; raced?: string[] } = {}): Fake {
  const f: Fake = { keys: new Set(), walks: [], matches: [], weights: [], reads: [], store: null as unknown as IngestStore };
  f.store = {
    ingested: async (_u, ks) => {
      f.reads.push("ingested");
      return new Set(ks.filter((k) => f.keys.has(k)));
    },
    sessionsOn: async (_u, days) => {
      f.reads.push(`sessionsOn:${days.join(",")}`);
      return sessions.filter((s) => days.includes(s.day)).map((s) => ({ ...s }));
    },
    recordMatch: async (_u, input) => {
      if (f.keys.has(input.dedupeKey ?? "")) return false;
      f.keys.add(input.dedupeKey ?? "");
      f.matches.push(input);
      return true;
    },
    logWalk: async (_u, raw, _now, o: LogWalkOptions) => {
      const id = o.ingest?.externalId ?? "";
      if (opts.raced?.includes(id)) return { ok: false, error: HC_WALK_INGESTED };
      if (opts.refuse?.[id]) return { ok: false, error: opts.refuse[id] };
      f.keys.add(ingestKeyOf(id));
      f.walks.push({ externalId: id, recordOnly: o.recordOnly === true, day: raw.day });
      const session = { id: `s-${id}`, kind: "WALK" as const, day: raw.day, angleDeg: raw.angleDeg, distanceKm: raw.distanceKm, durationMin: raw.durationMin, note: raw.note };
      if (o.recordOnly) return { ok: true, value: session };
      return { ok: true, value: { ...session, pay: { kind: "PAID" as const, xp: 12.25, raw: 12.25, intensity: "MODERATE" as const, effortMinutes: 30, crit: false, prs: 0, topUp: null, linkError: null } } };
    },
    logWeight: async (_u, kg, o) => {
      f.weights.push({ kg, day: o.day, measuredAt: o.measuredAt.toISOString(), source: o.source });
      if (kg > 400) return { ok: false, error: "A weight between 20 and 400 kg, please." };
      return { ok: true, value: { day: o.day, replaced: false, ...(opts.weightKept?.(kg) ? { kept: true } : {}) } };
    },
  };
  return f;
}
const LIVE = { NODE_ENV: "production", VERCEL_ENV: "production" };
const run = (f: Fake, batch: Partial<HcBatch>, env: Record<string, string> = LIVE) =>
  ingestHealthCore("u1", { since: SINCE, walks: [], weights: [], ...batch }, { store: f.store, now: () => NOW, env });

(async () => {
  {
    const f = fakeStore();
    const dev = await run(f, { walks: [walk()] }, { NODE_ENV: "development" });
    const preview = await run(f, { walks: [walk()] }, { NODE_ENV: "production", VERCEL_ENV: "preview" });
    check(
      "7. writes on the live app only: a dev server or a Preview build answers HC_WRITES_OFF and reads and writes nothing",
      !dev.ok && dev.error === HC_WRITES_OFF && !preview.ok && preview.error === HC_WRITES_OFF && f.reads.length === 0 && f.walks.length === 0
    );
    const rehearsal = await run(f, { walks: [walk()] }, { NODE_ENV: "development", XTNL_LIFE_JUDGE: "1" });
    check("the local rehearsal (XTNL_LIFE_JUDGE=1) writes, as every life writer does", rehearsal.ok && f.walks.length === 1);
  }
  {
    const f = fakeStore();
    const res = await run(f, {
      walks: [
        walk({ externalId: "late", start: at("2026-10-20T23:30:00.000Z"), end: at("2026-10-21T00:05:00.000Z"), distanceKm: 3 }),
        walk({ externalId: "old", start: at("2026-10-01T21:00:00.000Z"), end: at("2026-10-01T21:40:00.000Z"), distanceKm: 3.2 }),
        walk({ externalId: "morning", start: at("2026-10-20T21:00:00.000Z"), end: at("2026-10-20T21:45:00.000Z"), distanceKm: 4.1 }),
      ],
    });
    check(
      "3. the backfill is record-only: walks that started before since (08:00 today, 1 Oct) reach logWalkCore with recordOnly; the 10:30 one is priced as any walk; oldest first",
      res.ok && same(f.walks.map((w) => [w.externalId, w.recordOnly]), [["old", true], ["morning", true], ["late", false]]),
      JSON.stringify(f.walks)
    );
    check(
      "the summary: 3 in, 1 paid (its XP as logWalkCore priced it), 2 recorded; the line says so",
      res.ok && same(res.value.walks, { added: 3, paid: 1, recorded: 2, matched: 0, duplicate: 0, xp: 12.25 }) && res.value.line === "Health Connect: 3 walks in (1 paid 12.3 XP, 2 recorded)",
      res.ok ? res.value.line : ""
    );
    check("isBackfill: started before since, to the millisecond", isBackfill(walk({ start: at("2026-10-20T22:59:59.999Z") }), SINCE) && !isBackfill(walk({ start: SINCE }), SINCE));
    const again = await run(f, { walks: [walk({ externalId: "late" }), walk({ externalId: "old" }), walk({ externalId: "new" }), walk({ externalId: "new" })] });
    check(
      "5. once per record: keys already on the ledger, and a record twice in one batch, are duplicates; nothing is written for them",
      again.ok && same(again.value.walks, { added: 1, paid: 1, recorded: 0, matched: 0, duplicate: 3, xp: 12.25 }) && f.walks.length === 4,
      JSON.stringify(again.ok ? again.value.walks : again)
    );
  }
  {
    const f = fakeStore([], { raced: ["raced"], refuse: { far: "A distance between 0.01 and 200 km, please." } });
    const res = await run(f, { walks: [walk({ externalId: "raced" }), walk({ externalId: "far", distanceKm: 500, start: at("2026-10-20T23:55:00.000Z"), end: at("2026-10-21T00:10:00.000Z") })] });
    check(
      "a key raced in on another request (logWalkCore's HC_WALK_INGESTED) is a duplicate; a walk the core refuses is listed with the core's own line, and the rest lands",
      res.ok && res.value.walks.duplicate === 1 && same(res.value.refused, [{ kind: "walk", externalId: "far", error: "A distance between 0.01 and 200 km, please." }]) && res.value.line === "Health Connect: 1 skipped",
      JSON.stringify(res)
    );
  }
  {
    // 4. The match: the user typed a 30-minute, 2.5 km walk today and a 60-minute one; Health Connect brings three.
    const f = fakeStore([hand("s-hand", 30, 2.5), hand("s-long", 60, 5), hand("s-old", 31, 2.5, { claimed: true }), hand("s-yday", 30, 2.6, { day: "2026-10-20" })]);
    const res = await run(f, {
      walks: [
        walk({ externalId: "same", start: at("2026-10-20T23:20:00.000Z"), end: at("2026-10-20T23:52:00.000Z"), distanceKm: 2.6 }),
        walk({ externalId: "twin", start: at("2026-10-20T23:55:00.000Z"), end: at("2026-10-21T00:10:00.000Z"), distanceKm: 1.0 }),
        walk({ externalId: "second", start: at("2026-10-21T00:15:00.000Z"), end: at("2026-10-21T00:45:00.000Z"), distanceKm: 2.5 }),
      ],
    });
    check(
      "4. a walk the user logged by hand that day (32 min and 2.6 km against 30 and 2.5) is matched: its key against that session, nothing else written or paid",
      res.ok && f.matches.length === 1 && f.matches[0].sourceId === "s-hand" && f.matches[0].dedupeKey === "ingest:hc:same" && (f.matches[0].receipt as unknown as { matched: string }).matched === "s-hand" && !f.walks.some((w) => w.externalId === "same"),
      JSON.stringify(f.matches.map((m) => m.sourceId))
    );
    check(
      "a hand-logged walk absorbs one walk at most: the second 30-minute walk lands as its own (the claimed one and yesterday's never match)",
      res.ok && f.walks.some((w) => w.externalId === "second") && same(res.value.walks, { added: 2, paid: 2, recorded: 0, matched: 1, duplicate: 0, xp: 24.5 }),
      JSON.stringify(res.ok ? res.value.walks : res)
    );
    check("the day's sessions are read once, for the batch's days", same(f.reads, ["ingested", `sessionsOn:${TODAY}`]));
  }
  {
    // Two apps wrote the same walk (Samsung Health and a watch app): half of the shorter one's minutes in common.
    const f = fakeStore();
    const res = await run(f, {
      walks: [
        walk({ externalId: "samsung", start: at("2026-10-20T23:20:00.000Z"), end: at("2026-10-20T23:50:00.000Z"), origin: "com.sec.android.app.shealth" }),
        walk({ externalId: "watch", start: at("2026-10-20T23:22:00.000Z"), end: at("2026-10-20T23:49:00.000Z"), distanceKm: 2.4, origin: "com.example.watch" }),
      ],
    });
    check(
      "two apps' records of one walk are one session: the second is matched to the first imported one (one payment)",
      res.ok && f.walks.length === 1 && f.matches.length === 1 && f.matches[0].sourceId === "s-samsung" && same(res.value.walks, { added: 1, paid: 1, recorded: 0, matched: 1, duplicate: 0, xp: 12.25 }),
      JSON.stringify(res)
    );
  }
  {
    const s = (iso1: string, iso2: string) => ({ start: at(iso1), end: at(iso2) });
    check(
      "overlapShare: the share of the shorter interval in common (0 apart, 1 inside, 0.5 half)",
      overlapShare(s("2026-10-21T00:00:00Z", "2026-10-21T00:30:00Z"), s("2026-10-21T00:40:00Z", "2026-10-21T01:00:00Z")) === 0 &&
        overlapShare(s("2026-10-21T00:00:00Z", "2026-10-21T01:00:00Z"), s("2026-10-21T00:10:00Z", "2026-10-21T00:20:00Z")) === 1 &&
        overlapShare(s("2026-10-21T00:00:00Z", "2026-10-21T00:20:00Z"), s("2026-10-21T00:10:00Z", "2026-10-21T00:40:00Z")) === 0.5 &&
        MATCH_OVERLAP === 0.5
    );
    const w = walk({ start: at("2026-10-20T23:00:00.000Z"), end: at("2026-10-20T23:40:00.000Z"), distanceKm: 3 });
    check(
      "the tolerance is the larger of 5 min (0.3 km) and 20 %: 40 min / 3 km matches 33 min / 2.5 km, not 31 min or 2.3 km; the closest of two wins",
      matchOf(w, [hand("a", 33, 2.5)], new Set())?.id === "a" &&
        matchOf(w, [hand("a", 31, 3)], new Set()) === null &&
        matchOf(w, [hand("a", 40, 2.3)], new Set()) === null &&
        matchOf(w, [hand("far", 34, 2.5), hand("near", 39, 3)], new Set())?.id === "near" &&
        matchOf(w, [hand("a", 40, 3)], new Set(["a"])) === null &&
        same(MATCH_MINUTES, { abs: 5, share: 0.2 }) &&
        same(MATCH_KM, { abs: 0.3, share: 0.2 })
    );
    // Review: both orders. Hand first, then the import: matchOf above (the import records its key, pays nothing).
    // Import first, then the hand log: the imported session is its twin, and Train › Exercise refuses it.
    const handFirst = fakeStore([hand("typed", 31, 2.6)]);
    const hf = await run(handFirst, { walks: [walk({ externalId: "hc-order" })] });
    const imported = fakeStore([]);
    const ir = await run(imported, { walks: [walk({ externalId: "hc-order" })] });
    const importedSessions: SameDaySession[] = ir.ok ? [{ id: "s-hc-order", day: TODAY, durationMin: 30, distanceKm: 2.6, at: { start: walk().start, end: walk().end }, claimed: false }] : [];
    const twin = importedTwinOf({ day: TODAY, durationMin: 32, distanceKm: 2.5 }, importedSessions);
    check(
      "both orders pay once: hand first, the import is matched (its key only, nothing paid); import first, the same walk typed by hand is refused ('Already here from Health Connect: a 30 min, 2.6 km walk that day. …')",
      hf.ok && hf.value.walks.matched === 1 && hf.value.walks.paid === 0 && handFirst.walks.length === 0 &&
        ir.ok && ir.value.walks.paid === 1 &&
        twin?.id === "s-hc-order" &&
        alreadyHereLineOf(twin) === `${HC_ALREADY_HERE_PREFIX}: a 30 min, 2.6 km walk that day. Nothing was logged twice.`,
      JSON.stringify({ hf: hf.ok ? hf.value.walks : hf, twin })
    );
    check(
      "importedTwinOf: only an imported walk's own session (never a hand-typed one, so two typed walks still log), the same life day, inside the tolerances",
      importedTwinOf({ day: TODAY, durationMin: 30, distanceKm: 2.6 }, [hand("typed", 30, 2.6)]) === null &&
        importedTwinOf({ day: "2026-10-20", durationMin: 30, distanceKm: 2.6 }, importedSessions) === null &&
        importedTwinOf({ day: TODAY, durationMin: 60, distanceKm: 2.6 }, importedSessions) === null &&
        importedTwinOf({ day: TODAY, durationMin: 30, distanceKm: 5 }, importedSessions) === null
    );
  }
  {
    // 6. Weight.
    const f = fakeStore([], { weightKept: (kg) => kg === 82.9 });
    const res = await run(f, {
      weights: [
        { externalId: "kg-late", at: at("2026-10-20T21:30:00.000Z"), kg: 82.4 },
        { externalId: "kg-early", at: at("2026-10-20T20:00:00.000Z"), kg: 82.9 },
        { externalId: "kg-bad", at: at("2026-10-19T20:00:00.000Z"), kg: 4000 },
      ],
    });
    check(
      "6. weigh-ins go through logWeightCore oldest first, source 'import' at the measured instant on its life day; kept and refused are counted, the rest added",
      res.ok &&
        same(f.weights.map((w) => [w.kg, w.day, w.source]), [[4000, "2026-10-20", "import"], [82.9, TODAY, "import"], [82.4, TODAY, "import"]]) &&
        f.weights[2].measuredAt === "2026-10-20T21:30:00.000Z" &&
        same(res.value.weights, { added: 1, kept: 1 }) &&
        same(res.value.refused, [{ kind: "weight", externalId: "kg-bad", error: "A weight between 20 and 400 kg, please." }]) &&
        res.value.line === "Health Connect: 1 weigh-in · 1 skipped",
      JSON.stringify(res)
    );
    const t = (iso: string) => new Date(iso);
    check(
      "importReplaces: a day with no reading takes it; a typed reading (manual, capture) never moves; an import only for a later measurement, so a resend changes nothing",
      importReplaces(null, t("2026-10-21T07:00:00Z")) &&
        !importReplaces({ source: "manual", measuredAt: t("2026-10-21T06:00:00Z") }, t("2026-10-21T07:00:00Z")) &&
        !importReplaces({ source: "capture", measuredAt: t("2026-10-21T06:00:00Z") }, t("2026-10-21T07:00:00Z")) &&
        importReplaces({ source: "import", measuredAt: t("2026-10-21T06:00:00Z") }, t("2026-10-21T07:00:00Z")) &&
        !importReplaces({ source: "import", measuredAt: t("2026-10-21T07:00:00Z") }, t("2026-10-21T07:00:00Z")) &&
        !importReplaces({ source: "import", measuredAt: t("2026-10-21T08:00:00Z") }, t("2026-10-21T07:00:00Z"))
    );
    const ws = code("src/lib/weight-server.ts");
    check(
      "logWeightCore: an import reads the day's source and measuredAt and keeps it as it is (nothing written) unless importReplaces says so; a raced first log keeps what landed",
      /select: \{ id: true, source: true, measuredAt: true \}/.test(ws) && /if \(source === "import" && !importReplaces\(existing, measuredAt\)\) return kept;/.test(ws) && /if \(source === "import"\) return kept;/.test(ws)
    );
    check("nothing new reads as 'Health Connect: nothing new.'", ingestLineOf({ walks: { added: 0, paid: 0, recorded: 0, matched: 0, duplicate: 4, xp: 0 }, weights: { added: 0, kept: 2 }, refused: [] }) === "Health Connect: nothing new.");
  }

  // ── 8. The wiring ─────────────────────────────────────────────────────────
  section("8. the wiring");
  const ex = code("src/lib/exercise-server.ts");
  check(
    "logWalkCore: a Health Connect walk's session and its INGEST row are one transaction (the session's id minted first); a raced key is HC_WALK_INGESTED",
    /const row = opts\.ingest \? await createIngested\(userId, data, v\.day, opts\.ingest, now\) : await prisma\.exerciseSession\.create\(\{ data, select: SESSION_SELECT \}\);/.test(ex) &&
      /const id = globalThis\.crypto\.randomUUID\(\);\s*const event = ingestEventInput\(id, day, receipt, now\);/.test(ex) &&
      /await prisma\.\$transaction\(\[prisma\.exerciseSession\.create\(\{ data: \{ \.\.\.data, id \}, select: SESSION_SELECT \}\), activityOp\(userId, event\)\]\);/.test(ex) &&
      /if \(opts\.ingest && isDuplicateActivity\(err\)\) return \{ ok: false, error: HC_WALK_INGESTED \};/.test(ex)
  );
  check(
    "3. logWalkCore: the backfill returns the record right after the launch gate, before any pay, link or personal best (payWalkCore is the only path to them)",
    /if \(!momentumLive\(session\.day\)\) return \{ ok: true, value: session \};\s*if \(opts\.recordOnly\) return \{ ok: true, value: session \};\s*const pay = await payWalkCore\(userId, session, now, opts\);/.test(ex) &&
      (ex.match(/personalBestsOf\(/g) ?? []).length === 1 && ex.indexOf("personalBestsOf(") > ex.indexOf("async function payOnce")
  );
  check(
    "logWalkCore: a walk typed by hand (no ingest) is checked against that day's imported walks first, and refused with what is there before anything is written",
    /if \(!opts\.ingest\) \{\s*const twin = importedTwinOf\(v, await importedWalksOn\(userId, v\.day\)\);\s*if \(twin\) return \{ ok: false, error: alreadyHereLineOf\(twin\) \};\s*\}\s*let session: ExerciseSessionView;/.test(ex) &&
      /sessions\.filter\(\(s\) => at\.has\(s\.id\)\)/.test(ex) && /!r\.receipt\.matched/.test(ex)
  );
  const action = code("src/app/actions/exercise.ts");
  check(
    "Train › Exercise passes only countsAs (never ingest or recordOnly): a walk typed by hand writes and pays exactly as before, unless Health Connect already brought it in",
    /return logWalkMomentsCore\(userId, input, new Date\(\), \{ countsAs \}\);/.test(action) && !/ingest|recordOnly/.test(action)
  );
  const srv = code("src/lib/health-ingest-server.ts");
  check(
    "ingestHealthCore: the walk through logWalkCore with its key's receipt and recordOnly = the backfill; a match writes the key alone; behind lifeWritesEnabled",
    /store\.logWalk\(userId, input, now, \{ ingest: ingestReceiptOf\(w, \{ backfill, matched: null \}\), recordOnly: backfill \}\)/.test(srv) &&
      /store\.recordMatch\(userId, ingestEventInput\(match\.id, match\.day, ingestReceiptOf\(w, \{ backfill, matched: match\.id \}\), now\)\)/.test(srv) &&
      /logWalk: \(userId, raw, now, opts\) => logWalkCore\(userId, raw, now, opts\),/.test(srv) &&
      /if \(!lifeWritesEnabled\(deps\.env\)\) return \{ ok: false, error: HC_WRITES_OFF \};/.test(srv)
  );
  const srcFiles: string[] = [];
  const walk_ = (d: string) => {
    for (const f of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${f.name}`;
      if (f.isDirectory()) walk_(rel);
      else if (/\.(ts|tsx)$/.test(f.name)) srcFiles.push(rel);
    }
  };
  walk_("src");
  // A row's input names its source and then its sink (a read's where clause names the source alone).
  const ingestWriters = srcFiles.filter((f) => /source: "INGEST",\s*sink:/.test(code(f)));
  const ingestKeyers = srcFiles.filter((f) => /["'`]ingest:hc:/.test(code(f)));
  check(
    "only health-ingest.ts builds an INGEST row or an 'ingest:hc:' key (exercise-server and health-ingest-server write the rows it builds)",
    same(ingestWriters, ["src/lib/health-ingest.ts"]) && same(ingestKeyers, ["src/lib/health-ingest.ts"]),
    `${ingestWriters.join(", ")} | ${ingestKeyers.join(", ")}`
  );
  const ingestCallers = srcFiles.filter((f) => /ingestEventInput\(/.test(code(f)) && f !== "src/lib/health-ingest.ts");
  check("the INGEST row is written by exercise-server (a new walk) and health-ingest-server (a match) only", same(ingestCallers.sort(), ["src/lib/exercise-server.ts", "src/lib/health-ingest-server.ts"]), ingestCallers.join(", "));
  const migrations = readdirSync(join(ROOT, "prisma/migrations"));
  const schema = read("prisma/schema.prisma");
  const exModel = schema.slice(schema.indexOf("model ExerciseSession {"), schema.indexOf("\n}", schema.indexOf("model ExerciseSession {")));
  check(
    "no migration: the dedupe row is the ledger's own unique (userId, dedupeKey), weight's source 'import' already exists, and ExerciseSession is unchanged",
    !migrations.some((m) => /health|ingest|hc_|connect/i.test(m)) && !/externalId|source/.test(exModel) && /@@unique\(\[userId, dedupeKey\]\)/.test(schema) && /\/\/\/ manual \| capture \| import/.test(schema)
  );
  const life = read("package.json");
  check("life:check runs this check right after proof-pages-check", /tsx scripts\/proof-pages-check\.ts && tsx scripts\/health-ingest-check\.ts && tsx scripts\/settle-check\.ts/.test(life));

  // The phone (android/): off until the user turns it on, the rationale and the permissions declared.
  const settings = read("android/app/src/main/java/com/xtnl/app/data/AppSettings.kt");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  check("the phone's sync is off until the user turns it on (AppSettings healthSync defaults to false)", /healthSync = prefs\.getBoolean\(K_HEALTH_SYNC, false\)/.test(settings) && /val healthSync: Boolean = false/.test(settings));
  check(
    "the phone declares walks and weight only (exercise, distance, elevation, weight, background reads), and the rationale Health Connect opens",
    ["READ_EXERCISE", "READ_DISTANCE", "READ_ELEVATION_GAINED", "READ_WEIGHT", "READ_HEALTH_DATA_IN_BACKGROUND"].every((p) => manifest.includes(`android.permission.health.${p}`)) &&
      !/android\.permission\.health\.(READ_STEPS|READ_HEART_RATE|READ_SLEEP|WRITE_)/.test(manifest) &&
      manifest.includes("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE") &&
      manifest.includes("android.intent.category.HEALTH_PERMISSIONS")
  );
  check("the phone's worker exists and posts to /exercise", existsSync(join(ROOT, "android/app/src/main/java/com/xtnl/app/health/HealthSyncWorker.kt")) && /call\("\/exercise"/.test(read("android/app/src/main/java/com/xtnl/app/data/HttpApi.kt")));
  check("TODAY is the life day of NOW", dayKeyOf(NOW) === TODAY);

  console.log(`\nhealth-ingest-check: ${passes} passed, ${failures} failed`);
  if (failures) process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

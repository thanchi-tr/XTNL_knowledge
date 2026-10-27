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
 *   9. D21 (health-2026-10-27.md): every other kind is a record. Each reaches importSessionCore as recordInputOf says
 *      (cleanSessionInput takes it: the kind's own bounds, no distance for a kind with none, a lift as its minutes
 *      alone) under its key 'hc:<externalId>'; no new kind writes an ActivityEvent of any kind (no INGEST row, no
 *      match row, no pay, no habit tick); a replay, a raced key and a deleted import are duplicates; a kind the server
 *      doesn't read is skipped and counted; the twin rule kind by kind (a walk never twins a run), a matched session's
 *      key kept (its resend a duplicate, after its twin is deleted too), two apps' copies of a hand-typed session both
 *      matched; one record id is one session whatever kind it is sent as (a run then a walk, or a walk then a run).
 *   10. The walk path is HEAD cf13f9e's byte for byte: the walk's declarations in health-ingest.ts, its loop (with the
 *      one check for a record id already here as a workout taken out) and store reads in health-ingest-server.ts, and
 *      importedWalksOn (digests; training-check pins logWalkCore and its pay).
 *   11. The phone maps Health Connect's exercise types by the SDK's named constants (never an integer) and asks for no
 *      new permission.
 */
import "./_no-model";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { dayKeyOf, type DayKey } from "../src/lib/life-day";
import {
  DELETED_IMPORT_KIND,
  EXERCISE_KINDS,
  IMPORTED_CLIENT_ID_PREFIX,
  IMPORTED_FROM,
  KIND_SPECS,
  RECORD_KINDS,
  cleanSessionInput,
  cleanWalkInput,
  isImportedSession,
  walkFactsOf,
  type RawSessionInput,
} from "../src/lib/exercise";
import {
  HC_ID_TOO_LONG,
  HC_KINDS,
  HC_KIND_UNREAD,
  HC_RECORD_KINDS,
  HC_WALK_KINDS,
  isHcRecordKind,
  isHcWalkKind,
  recordInputOf,
  recordMatchOf,
  recordNoteOf,
  sessionClientIdOf,
  type HcSession,
  type SameKindSession,
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
import { IMPORT_DELETED, IMPORT_KEY_REFUSED, SESSION_WALK_ELSEWHERE, importSessionCore, type LogWalkOptions } from "../src/lib/exercise-server";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
/** Source without comments, so a word in a doc comment never passes for code. */
const codeOfSrc = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (rel: string) => codeOfSrc(read(rel));

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
  // Re-pinned on purpose (health-2026-10-27.md D21): the kinds widen from walking and hiking to every record kind too.
  check(
    "Health Connect's kinds: walking and hiking as walks, then every record kind (exercise.ts RECORD_KINDS, in order) as records",
    same(HC_WALK_KINDS, ["WALK", "HIKE"]) && same(HC_RECORD_KINDS, RECORD_KINDS) && same(HC_KINDS, [...HC_WALK_KINDS, ...RECORD_KINDS]) && isHcWalkKind("HIKE") && !isHcWalkKind("RUN") && isHcRecordKind("LIFT") && !isHcRecordKind("WALK") && !isHcRecordKind("HIKE")
  );
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
  /** D21: the sessions' own keys ('hc:<id>' clientIds), and each importSessionCore call. */
  clientIds: Set<string>;
  records: { clientId: string; raw: RawSessionInput; start: string; end: string }[];
  /** D21: the imports' own sessions (recordSessionsOn lists them, as the real store does), and each matched key kept. */
  imports: SameKindSession[];
  matchedKeys: string[];
  /** deleteSessionCore on an import: the row stays as its key alone (kind DELETED), so nothing lists or matches it. */
  drop: (clientId: string) => void;
}

interface FakeOpts {
  refuse?: Record<string, string>;
  weightKept?: (kg: number) => boolean;
  raced?: string[];
  /** D21: the record kinds' sessions already there, the keys a raced resend wrote first, and deleted imports' keys. */
  kept?: SameKindSession[];
  racedRecords?: string[];
  /** Deleted imports: their kept key (importedKeys finds it), and one deleted while the batch ran (importSessionCore says so). */
  deleted?: string[];
  deletedRaced?: string[];
}

/**
 * A fake store: a ledger of keys, the day's sessions, a logWalk that prices a walk as PAID unless recordOnly, and (D21) a
 * logRecord that checks its input with cleanSessionInput, as importSessionCore does, and keeps its key.
 */
function fakeStore(sessions: SameDaySession[] = [], opts: FakeOpts = {}): Fake {
  const f: Fake = {
    keys: new Set(),
    walks: [],
    matches: [],
    weights: [],
    reads: [],
    clientIds: new Set(opts.deleted ?? []),
    records: [],
    imports: [],
    matchedKeys: [],
    drop: (clientId) => {
      f.imports = f.imports.filter((x) => x.id !== `s-${clientId}`);
    },
    store: null as unknown as IngestStore,
  };
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
    importedKeys: async (_u, ks) => {
      f.reads.push("importedKeys");
      return new Set(ks.filter((k) => f.clientIds.has(k) && !opts.racedRecords?.includes(k)));
    },
    recordSessionsOn: async (_u, days) => {
      f.reads.push(`recordSessionsOn:${days.join(",")}`);
      return [...(opts.kept ?? []), ...f.imports].filter((s) => days.includes(s.day)).map((s) => ({ ...s }));
    },
    logRecord: async (_u, raw, now, o) => {
      if (opts.deletedRaced?.includes(o.clientId)) return { ok: false, error: IMPORT_DELETED };
      const clean = cleanSessionInput({ ...raw, clientId: undefined }, dayKeyOf(now));
      if (!clean.ok) return clean;
      const view = { id: `s-${o.clientId}`, ...clean.value, startedAt: o.at.start.toISOString(), endedAt: o.at.end.toISOString(), clientId: o.clientId };
      if (opts.racedRecords?.includes(o.clientId)) return { ok: true, value: { ...view, replay: true } };
      f.clientIds.add(o.clientId);
      f.records.push({ clientId: o.clientId, raw, start: view.startedAt, end: view.endedAt });
      f.imports.push({ id: view.id, kind: view.kind, day: view.day, durationMin: view.durationMin, distanceKm: view.distanceKm, at: { start: o.at.start, end: o.at.end }, imported: true });
      return { ok: true, value: { ...view, replay: false } };
    },
    keepMatchedKey: async (_u, key) => {
      if (f.clientIds.has(key)) return false;
      f.clientIds.add(key);
      f.matchedKeys.push(key);
      return true;
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
    check("the keys, the record ids (D21: one already a workout is a duplicate) and the day's sessions are read once each, for the batch's days", same(f.reads, ["ingested", "importedKeys", `sessionsOn:${TODAY}`]), JSON.stringify(f.reads));
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
    check(
      "nothing new reads as 'Health Connect: nothing new.' (a workout's resend too)",
      ingestLineOf({ walks: { added: 0, paid: 0, recorded: 0, matched: 0, duplicate: 4, xp: 0 }, sessions: { added: 0, matched: 0, duplicate: 3 }, weights: { added: 0, kept: 2 }, refused: [] }) === "Health Connect: nothing new."
    );
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
  const exDoc = schema.slice(schema.lastIndexOf("\n\n", schema.indexOf("\nmodel ExerciseSession {")), schema.indexOf("\nmodel ExerciseSession {"));
  const exFields = exModel.split("\n").map((l) => /^\s+(\w+)\s+\S/.exec(l)?.[1]).filter((x): x is string => !!x);
  // Re-pinned on purpose (health-2026-10-27.md D10, D11; migration 20270104000000_strength_sets): ExerciseSession is no
  // longer unchanged. It gains exactly the ten strength_sets columns named below, and still none is a source or an
  // external id (an import stays named by its INGEST row 'ingest:hc:<id>'), in the model or in its comment.
  check(
    "no migration of its own: the dedupe row is the ledger's own unique (userId, dedupeKey), weight's source 'import' already exists, and ExerciseSession gains only strength_sets' ten columns (variant, label, startedAt, endedAt, avgHr, maxHr, avgWatts, poolM, sessionRpe, clientId), none a source or an external id",
    !migrations.some((m) => /health|ingest|hc_|connect/i.test(m)) && !/externalId|source/i.test(exModel) && !/externalId|source/i.test(exDoc) && /@@unique\(\[userId, dedupeKey\]\)/.test(schema) && /\/\/\/ manual \| capture \| import/.test(schema) &&
      same(exFields, ["id", "userId", "day", "kind", "angleDeg", "distanceKm", "durationMin", "note", "createdAt", "variant", "label", "startedAt", "endedAt", "avgHr", "maxHr", "avgWatts", "poolM", "sessionRpe", "clientId"]),
    exFields.join(", ")
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

  // ── 9. D21: every other kind, a record ────────────────────────────────────
  section("9. D21: every other kind is a record (no ledger row, no pay), once per record, its twin kind by kind");
  // 08:00 to 08:28:40 in Sydney on the 21st (a run from a watch app), and the other kinds around it.
  const hcs = (over: Partial<HcSession> = {}): HcSession => ({
    externalId: "hc-r1",
    kind: "RUN",
    variant: null,
    label: null,
    start: at("2026-10-20T21:00:00.000Z"),
    end: at("2026-10-20T21:28:40.000Z"),
    distanceKm: 5.2,
    origin: "com.strava",
    ...over,
  });
  const lift = (over: Partial<HcSession> = {}) => hcs({ externalId: "hc-l1", kind: "LIFT", start: at("2026-10-20T22:00:00.000Z"), end: at("2026-10-20T22:45:00.000Z"), distanceKm: null, ...over });
  {
    const run = recordInputOf(hcs({ variant: "TREADMILL" }));
    const clean = cleanSessionInput(run, TODAY);
    check(
      "a run as importSessionCore takes it: its life day, its minutes to the second (28:40), its distance, the treadmill variant its type named, its note 'Run · Health Connect'; cleanSessionInput takes it",
      run.kind === "RUN" && run.day === TODAY && run.distanceKm === 5.2 && run.variant === "TREADMILL" && run.note === "Run · Health Connect" && !("startedAt" in run) &&
        clean.ok && clean.value.durationMin === 1720 / 60 && clean.value.distanceKm === 5.2 && clean.value.variant === "TREADMILL" && clean.value.clientId === null,
      JSON.stringify({ run, clean })
    );
    const l = recordInputOf(lift({ distanceKm: 3 }));
    const lc = cleanSessionInput(l, TODAY);
    check(
      "a lift is its minutes alone: no distance (even one sent), no movement and no set, its wall clock; cleanSessionInput takes it (45 min, 0 km)",
      same(Object.keys(l).sort(), ["day", "durationMin", "endedAt", "kind", "note", "startedAt"]) && l.note === "Lift · Health Connect" &&
        lc.ok && lc.value.kind === "LIFT" && lc.value.durationMin === 45 && lc.value.distanceKm === 0 && lc.value.startedAt === "2026-10-20T22:00:00.000Z" && lc.value.endedAt === "2026-10-20T22:45:00.000Z",
      JSON.stringify({ l, lc })
    );
    const hiit = cleanSessionInput(recordInputOf(hcs({ kind: "HIIT", distanceKm: null })), TODAY);
    const mobility = cleanSessionInput(recordInputOf(hcs({ kind: "MOBILITY", distanceKm: 1.2 })), TODAY);
    const noRun = cleanSessionInput(recordInputOf(hcs({ distanceKm: null })), TODAY);
    const sport = cleanSessionInput(recordInputOf(hcs({ kind: "SPORT", variant: "OTHER", label: "Rugby", distanceKm: null })), TODAY);
    const noSport = cleanSessionInput(recordInputOf(hcs({ kind: "SPORT", distanceKm: null })), TODAY);
    check(
      "a kind with no distance needs none (HIIT, mobility: 0 km, whatever was sent); a run still needs one, a game its sport ('OTHER' with its name), in the core's own words",
      hiit.ok && hiit.value.distanceKm === 0 && mobility.ok && mobility.value.distanceKm === 0 && !noRun.ok && noRun.error === "A distance, please." &&
        sport.ok && sport.value.variant === "OTHER" && sport.value.label === "Rugby" && !noSport.ok && noSport.error === "Pick a sport.",
      JSON.stringify({ hiit, noRun, noSport })
    );
    const tooShort = cleanSessionInput(recordInputOf(hcs({ kind: "YOGA", distanceKm: null, end: at("2026-10-20T21:00:40.000Z") })), TODAY);
    const yoga = cleanSessionInput(recordInputOf(hcs({ kind: "YOGA", distanceKm: null })), TODAY);
    const farRun = cleanSessionInput(recordInputOf(hcs({ distanceKm: 300 })), TODAY);
    const farRide = cleanSessionInput(recordInputOf(hcs({ kind: "CYCLE", distanceKm: 300 })), TODAY);
    check(
      "each kind's own bounds (KIND_SPECS through cleanSessionInput): under a minute refused, a run of 300 km past its 250 while a ride's 1,000 takes it; yoga with no style is Hatha, the core's own fallback (importSessionCore stores none for an import: section 9's wiring, training-check's stub)",
      !tooShort.ok && tooShort.error === "A duration between 1 and 1440 minutes, please." && !farRun.ok && farRun.error === `A distance between 0.01 and ${KIND_SPECS.RUN.distanceMaxKm} km, please.` && farRide.ok && yoga.ok && yoga.value.variant === "HATHA",
      JSON.stringify({ tooShort, farRun })
    );
    check(
      "every record kind has its note ('Ride · Health Connect', 'Game · Health Connect', 'HIIT session · Health Connect')",
      HC_RECORD_KINDS.every((k) => recordNoteOf(k) === `${KIND_SPECS[k].noun.charAt(0).toUpperCase()}${KIND_SPECS[k].noun.slice(1)} · Health Connect`) && recordNoteOf("CYCLE") === "Ride · Health Connect" && recordNoteOf("SPORT") === "Game · Health Connect" && recordNoteOf("HIIT") === "HIIT session · Health Connect"
    );
    const typed = cleanSessionInput({ kind: "RUN", distanceKm: 5, durationMin: 27, clientId: "hc:hc-r1" }, TODAY);
    check(
      "its key is 'hc:<externalId>' (the session's clientId, never a ledger row), and no save typed on the web or the phone can take it (its key has no ':')",
      sessionClientIdOf("hc-r1") === "hc:hc-r1" && IMPORTED_CLIENT_ID_PREFIX === "hc:" && isImportedSession({ clientId: "hc:hc-r1" }) && !isImportedSession({ clientId: "hc:" }) && !isImportedSession({ clientId: "c-1" }) && !isImportedSession({ clientId: null }) &&
        !typed.ok && IMPORTED_FROM === "from Health Connect" && !(EXERCISE_KINDS as readonly string[]).includes(DELETED_IMPORT_KIND)
    );
  }
  {
    // The core: a walk, a run, a lift and yoga on the 21st, and a kind this server doesn't read.
    const f = fakeStore();
    const batch = {
      walks: [walk({ externalId: "w-1", start: at("2026-10-20T23:20:00.000Z"), end: at("2026-10-20T23:50:00.000Z") })],
      sessions: [hcs(), lift(), hcs({ externalId: "hc-y1", kind: "YOGA", variant: "VINYASA", distanceKm: null, start: at("2026-10-21T06:00:00.000Z"), end: at("2026-10-21T06:45:00.000Z") })],
      unread: [{ externalId: "hc-x1", kind: "SKYDIVING" }],
    };
    const res = await run(f, batch);
    check(
      "a batch: the walk through logWalkCore as always (its INGEST key), the run, the lift and the yoga through importSessionCore under 'hc:<id>', oldest first; the kind it doesn't read skipped and counted",
      res.ok && same(f.walks.map((w) => w.externalId), ["w-1"]) && same(f.records.map((r) => r.clientId), ["hc:hc-r1", "hc:hc-l1", "hc:hc-y1"]) &&
        same(res.value.sessions, { added: 3, matched: 0, duplicate: 0 }) && same(res.value.walks, { added: 1, paid: 1, recorded: 0, matched: 0, duplicate: 0, xp: 12.25 }) &&
        same(res.value.refused, [{ kind: "session", externalId: "hc-x1", error: HC_KIND_UNREAD }]) &&
        res.value.line === "Health Connect: 1 walk in (1 paid 12.3 XP) · 3 workouts recorded · 1 skipped",
      JSON.stringify(res)
    );
    check(
      "no new kind writes an ActivityEvent of any kind: the ledger holds the walk's INGEST key alone, no match row, nothing priced for a workout (the summary's XP is the walk's)",
      same([...f.keys], ["ingest:hc:w-1"]) && f.matches.length === 0 && res.ok && res.value.walks.xp === 12.25
    );
    check(
      "each workout reaches importSessionCore as recordInputOf says, with its Health Connect minutes as the session's start and end",
      same(f.records.map((r) => r.raw), batch.sessions.map(recordInputOf)) && f.records[0].start === "2026-10-20T21:00:00.000Z" && f.records[0].end === "2026-10-20T21:28:40.000Z" && f.records[1].start === "2026-10-20T22:00:00.000Z"
    );
    check("the record kinds' keys and sessions are read once each, for the batch's days", same(f.reads.slice(-2), ["importedKeys", `recordSessionsOn:${TODAY}`]), JSON.stringify(f.reads));
    const again = await run(f, batch);
    check(
      "a replay is all duplicates: the walk by its INGEST key, each workout by its own key; nothing is written again (the unread kind is said again)",
      again.ok && same(again.value.sessions, { added: 0, matched: 0, duplicate: 3 }) && again.value.walks.duplicate === 1 && f.records.length === 3 && f.walks.length === 1 && again.value.line === "Health Connect: 1 skipped",
      JSON.stringify(again)
    );
  }
  {
    const f = fakeStore([], { racedRecords: ["hc:raced"], deleted: ["hc:gone"], deletedRaced: ["hc:gone-raced"] });
    const res = await run(f, {
      sessions: [
        hcs({ externalId: "twice" }),
        hcs({ externalId: "twice" }),
        hcs({ externalId: "raced", start: at("2026-10-21T01:00:00.000Z"), end: at("2026-10-21T01:30:00.000Z") }),
        hcs({ externalId: "gone", start: at("2026-10-21T02:00:00.000Z"), end: at("2026-10-21T02:30:00.000Z") }),
        hcs({ externalId: "gone-raced", start: at("2026-10-21T02:40:00.000Z"), end: at("2026-10-21T02:55:00.000Z") }),
        hcs({ externalId: "no-km", distanceKm: null, start: at("2026-10-21T03:00:00.000Z"), end: at("2026-10-21T03:30:00.000Z") }),
        hcs({ externalId: "x".repeat(62), start: at("2026-10-21T04:00:00.000Z"), end: at("2026-10-21T04:30:00.000Z") }),
      ],
    });
    check(
      "once per record: twice in one batch, a key raced in (importSessionCore's replay) and a workout deleted here (its key kept, or deleted as the batch ran: IMPORT_DELETED) are duplicates; a run with no distance is skipped with the core's line, an id too long for its key with HC_ID_TOO_LONG",
      res.ok && same(res.value.sessions, { added: 1, matched: 0, duplicate: 4 }) &&
        same(res.value.refused, [{ kind: "session", externalId: "no-km", error: "A distance, please." }, { kind: "session", externalId: "x".repeat(62), error: HC_ID_TOO_LONG }]) && same(f.records.map((r) => r.clientId), ["hc:twice"]),
      JSON.stringify(res)
    );
  }
  {
    // The twin rule, kind by kind.
    const kept = (id: string, kind: SameKindSession["kind"], durationMin: number, distanceKm: number, o: Partial<SameKindSession> = {}): SameKindSession => ({ id, kind, day: TODAY, durationMin, distanceKm, at: null, imported: false, ...o });
    const r = hcs({ end: at("2026-10-20T21:31:00.000Z"), distanceKm: 5.1 });
    check(
      "a run typed by hand that day (30 min, 5 km against 31 and 5.1) is this run; 8 km, 45 min, another day or one already taken is not",
      recordMatchOf(r, [kept("hand", "RUN", 30, 5)], new Set())?.id === "hand" &&
        recordMatchOf(r, [kept("hand", "RUN", 30, 8)], new Set()) === null &&
        recordMatchOf(r, [kept("hand", "RUN", 45, 5)], new Set()) === null &&
        recordMatchOf(r, [kept("hand", "RUN", 30, 5, { day: "2026-10-20" })], new Set()) === null &&
        recordMatchOf(r, [kept("hand", "RUN", 30, 5)], new Set(["hand"])) === null
    );
    check(
      "only the same kind: a hand-typed walk never twins a run, nor a run a walk's Health Connect session (sessionsOn reads walks alone), nor yoga a HIIT session",
      recordMatchOf(r, [kept("walk", "WALK", 31, 5.1)], new Set()) === null &&
        recordMatchOf(hcs({ kind: "HIIT", distanceKm: null, end: at("2026-10-20T21:45:00.000Z") }), [kept("yoga", "YOGA", 45, 0)], new Set()) === null &&
        recordMatchOf(hcs({ kind: "YOGA", distanceKm: null, end: at("2026-10-20T21:45:00.000Z") }), [kept("yoga", "YOGA", 44, 0)], new Set())?.id === "yoga"
    );
    const logger = kept("logged", "LIFT", 50, 0, { at: { start: at("2026-10-20T21:55:00.000Z"), end: at("2026-10-20T22:45:00.000Z") } });
    check(
      "a lift from the set logger (its wall clock) is the Health Connect lift that shares half its minutes; a lift that evening is not; another app's import of the run (its minutes) is the run",
      recordMatchOf(lift(), [logger], new Set())?.id === "logged" &&
        recordMatchOf(lift({ start: at("2026-10-21T08:00:00.000Z"), end: at("2026-10-21T08:45:00.000Z") }), [logger], new Set()) === null &&
        recordMatchOf(r, [kept("other-app", "RUN", 28, 5.2, { at: { start: at("2026-10-20T21:02:00.000Z"), end: at("2026-10-20T21:30:00.000Z") }, imported: true })], new Set())?.id === "other-app"
    );
    const morning = kept("hc-morning", "RUN", 30, 5, { at: { start: at("2026-10-20T20:00:00.000Z"), end: at("2026-10-20T20:30:00.000Z") }, imported: true });
    check(
      "a run typed by hand after the same one came in (the import's copy) absorbs no other: an evening run of the same length lands as its own",
      recordMatchOf(hcs({ start: at("2026-10-21T06:00:00.000Z"), end: at("2026-10-21T06:30:00.000Z"), distanceKm: 5 }), [morning, kept("copy", "RUN", 30, 5)], new Set()) === null
    );
    const f = fakeStore([], { kept: [kept("hand", "RUN", 30, 5), kept("hand-2", "RUN", 30, 5, { day: "2026-10-20" })] });
    const res = await run(f, { sessions: [r, hcs({ externalId: "hc-r2", start: at("2026-10-21T06:00:00.000Z"), end: at("2026-10-21T06:31:00.000Z"), distanceKm: 5 })] });
    check(
      "through the core: the run typed by hand is matched (nothing written for it), and it absorbs one run at most, so the second that day lands as its own",
      res.ok && same(res.value.sessions, { added: 1, matched: 1, duplicate: 0 }) && same(f.records.map((x) => x.clientId), ["hc:hc-r2"]) && f.matches.length === 0 && f.keys.size === 0 && res.value.line === "Health Connect: 1 workout recorded · 1 already logged",
      JSON.stringify(res)
    );
    check("…and the matched run keeps its key alone (a row nothing lists), never a ledger row", same(f.matchedKeys, ["hc:hc-r1"]) && f.keys.size === 0, JSON.stringify(f.matchedKeys));
    const resend = await run(f, { sessions: [r, hcs({ externalId: "hc-r2", start: at("2026-10-21T06:00:00.000Z"), end: at("2026-10-21T06:31:00.000Z"), distanceKm: 5 })] });
    check(
      "a resend within the overlap is all duplicates: the matched run by its kept key, though the evening run's import now looks like the hand-typed one (so the hand-typed run is no twin any more), and nothing lands twice",
      resend.ok && same(resend.value.sessions, { added: 0, matched: 0, duplicate: 2 }) && same(f.records.map((x) => x.clientId), ["hc:hc-r2"]) && same(f.matchedKeys, ["hc:hc-r1"]) && resend.value.line === "Health Connect: nothing new.",
      JSON.stringify(resend)
    );
  }
  {
    // Two apps' copies of one run (Samsung Health 07:00-07:30, 5 km; Strava 07:01-07:31, 5.05 km), then the import deleted.
    const f = fakeStore();
    const s1 = hcs({ externalId: "S1", start: at("2026-10-20T20:00:00.000Z"), end: at("2026-10-20T20:30:00.000Z"), distanceKm: 5, origin: "com.sec.android.app.shealth" });
    const s2 = hcs({ externalId: "S2", start: at("2026-10-20T20:01:00.000Z"), end: at("2026-10-20T20:31:00.000Z"), distanceKm: 5.05 });
    const first = await run(f, { sessions: [s1, s2] });
    f.drop("hc:S1");
    const again = await run(f, { sessions: [s1, s2] });
    check(
      "two apps' copies of one run: the first lands, the second is matched to it and keeps its key; once the import is deleted on Train › Exercise, the resend is 2 duplicates and nothing comes back",
      first.ok && same(first.value.sessions, { added: 1, matched: 1, duplicate: 0 }) && same(f.matchedKeys, ["hc:S2"]) &&
        again.ok && same(again.value.sessions, { added: 0, matched: 0, duplicate: 2 }) && same(f.records.map((x) => x.clientId), ["hc:S1"]) && f.keys.size === 0,
      JSON.stringify({ first, again })
    );
  }
  {
    // A hand-typed yoga session (30 min, no times) that two apps both wrote: G1 07:00:00-07:30:00, G2 07:00:30-07:30:30.
    const kept = (id: string, kind: SameKindSession["kind"], durationMin: number): SameKindSession => ({ id, kind, day: TODAY, durationMin, distanceKm: 0, at: null, imported: false });
    const f = fakeStore([], { kept: [kept("hand-yoga", "YOGA", 30)] });
    const g1 = hcs({ externalId: "G1", kind: "YOGA", distanceKm: null, start: at("2026-10-20T20:00:00.000Z"), end: at("2026-10-20T20:30:00.000Z") });
    const g2 = hcs({ externalId: "G2", kind: "YOGA", distanceKm: null, start: at("2026-10-20T20:00:30.000Z"), end: at("2026-10-20T20:30:30.000Z") });
    const res = await run(f, { sessions: [g1, g2] });
    check(
      "a hand-typed session two apps both wrote is matched twice in one sync: the first by its duration, the second by the first's minutes (half in common); nothing is written but the two keys",
      res.ok && same(res.value.sessions, { added: 0, matched: 2, duplicate: 0 }) && f.records.length === 0 && same(f.matchedKeys, ["hc:G1", "hc:G2"]) && res.value.line === "Health Connect: 2 already logged",
      JSON.stringify(res)
    );
  }
  {
    // One record id sent as two kinds (a type corrected in place in Samsung Health): the first kind stays.
    const when = { start: at("2026-10-20T23:20:00.000Z"), end: at("2026-10-21T00:00:00.000Z") };
    const asRun = (externalId: string) => hcs({ externalId, ...when, distanceKm: 4 });
    const asWalk = (externalId: string) => walk({ externalId, ...when, distanceKm: 4 });
    const runFirst = fakeStore();
    const r1 = await run(runFirst, { sessions: [asRun("X1")] });
    const w1 = await run(runFirst, { walks: [asWalk("X1")] });
    check(
      "a run sent again as a walk under the same id is a duplicate: one RUN row, no walk written, nothing paid",
      r1.ok && r1.value.sessions.added === 1 && w1.ok && same(w1.value.walks, { added: 0, paid: 0, recorded: 0, matched: 0, duplicate: 1, xp: 0 }) && runFirst.walks.length === 0 && runFirst.keys.size === 0 && same(runFirst.records.map((x) => x.clientId), ["hc:X1"]),
      JSON.stringify({ r1, w1 })
    );
    const walkFirst = fakeStore();
    const w2 = await run(walkFirst, { walks: [asWalk("X2")] });
    const r2 = await run(walkFirst, { sessions: [asRun("X2")] });
    check(
      "a walk sent again as a run under the same id is a duplicate: one walk, paid once, and no RUN record",
      w2.ok && w2.value.walks.paid === 1 && r2.ok && same(r2.value.sessions, { added: 0, matched: 0, duplicate: 1 }) && walkFirst.records.length === 0 && same(walkFirst.walks.map((x) => x.externalId), ["X2"]),
      JSON.stringify({ w2, r2 })
    );
    const oneBatch = fakeStore();
    const both = await run(oneBatch, { walks: [asWalk("X3")], sessions: [asRun("X3")] });
    check(
      "…and in one batch the walk lands (as always) and the same id as a run is a duplicate",
      both.ok && both.value.walks.added === 1 && same(both.value.sessions, { added: 0, matched: 0, duplicate: 1 }) && oneBatch.records.length === 0,
      JSON.stringify(both)
    );
  }
  {
    // importSessionCore refuses before it reads or writes anything: a key that is not an import's, bad times, a walk.
    const when = { start: at("2026-10-20T21:00:00.000Z"), end: at("2026-10-20T21:30:00.000Z") };
    const typedKey = await importSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 30 }, NOW, { clientId: "c-1", at: when });
    const longKey = await importSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 30 }, NOW, { clientId: `hc:${"x".repeat(62)}`, at: when });
    const backwards = await importSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 30 }, NOW, { clientId: "hc:a", at: { start: when.end, end: when.start } });
    const aWalk = await importSessionCore("u1", { kind: "WALK", distanceKm: 3, durationMin: 30 }, NOW, { clientId: "hc:a", at: when });
    check(
      "importSessionCore takes only an import's key ('hc:', at most 64) and two instants in order, and never a walk (logWalkCore is its one path)",
      same([typedKey, longKey, backwards], [{ ok: false, error: IMPORT_KEY_REFUSED }, { ok: false, error: IMPORT_KEY_REFUSED }, { ok: false, error: IMPORT_KEY_REFUSED }]) && same(aWalk, { ok: false, error: SESSION_WALK_ELSEWHERE })
    );
  }
  {
    // The wiring of the record path, as source.
    const srvSrc = code("src/lib/health-ingest-server.ts");
    const loop = srvSrc.slice(srvSrc.indexOf("for (const u of batch.unread ?? [])"), srvSrc.indexOf("const weights = [...batch.weights]"));
    // The record loop reads the ledger's walk keys to skip a record id already here as a walk, and nothing else of it.
    const LEDGER_KEY_READS = /const asWalk = await store\.ingested\(userId, records\.map\(\(s\) => ingestKeyOf\(s\.externalId\)\)\);|asWalk\.has\(ingestKeyOf\(s\.externalId\)\)|inBatch\.has\(ingestKeyOf\(s\.externalId\)\)/g;
    check(
      "ingestHealthCore's record loop: importSessionCore with recordInputOf and the session's own key and minutes; never a match row, an INGEST key, a walk's core or a price",
      loop.length > 200 && /store\.logRecord\(userId, recordInputOf\(s\), now, \{ clientId: key, at: \{ start: s\.start, end: s\.end \} \}\)/.test(loop) && /const match = recordMatchOf\(s, kept, claimed\);/.test(loop) &&
        !/recordMatch\(|ingestEventInput|ingestKeyOf|ingestReceiptOf|logWalk|activity|xp|pay/i.test(loop.replace(/recordMatchOf/g, "").replace(LEDGER_KEY_READS, "")) &&
        /logRecord: \(userId, raw, now, opts\) => importSessionCore\(userId, raw, now, opts\),/.test(srvSrc) &&
        /where: \{ userId, day: \{ in: days\.map\(dateColumn\) \}, kind: \{ in: \[\.\.\.HC_RECORD_KINDS\] \} \}/.test(srvSrc) && /where: \{ userId, clientId: \{ in: \[\.\.\.keys\] \} \}/.test(srvSrc)
    );
    check(
      "a record id is one session whatever kind it is sent as: the walks skip a key a session holds, the records a key the ledger holds or this batch's walks took (a duplicate, the first kind stays)",
      /const asRecord = await store\.importedKeys\(userId, walks\.map\(\(w\) => sessionClientIdOf\(w\.externalId\)\)\);/.test(srvSrc) &&
        /if \(seen\.has\(key\) \|\| inBatch\.has\(key\) \|\| asRecord\.has\(sessionClientIdOf\(w\.externalId\)\)\) \{\s*out\.walks\.duplicate\+\+;/.test(srvSrc) &&
        /if \(here\.has\(key\) \|\| landed\.has\(key\) \|\| asWalk\.has\(ingestKeyOf\(s\.externalId\)\) \|\| inBatch\.has\(ingestKeyOf\(s\.externalId\)\)\) \{\s*out\.sessions\.duplicate\+\+;/.test(loop)
    );
    check(
      "a match keeps its key (store.keepMatchedKey before it is counted), and one typed without times lends the rest of the batch this session's minutes under its own id",
      /if \(match\.at == null\) \{\s*claimed\.add\(match\.id\);\s*kept\.push\(\{ \.\.\.match, at: \{ start: s\.start, end: s\.end \} \}\);\s*\}\s*if \(await store\.keepMatchedKey\(userId, key, s\)\) out\.sessions\.matched\+\+;\s*else out\.sessions\.duplicate\+\+;\s*continue;/.test(loop) &&
        /keepMatchedKey: \(userId, key, s\) => keepMatchedImportKey\(userId, key, \{ start: s\.start, end: s\.end \}\),/.test(srvSrc)
    );
    const exSrc = read("src/lib/exercise-server.ts");
    const matchedAt = exSrc.indexOf("export async function keepMatchedImportKey(");
    const matched = matchedAt < 0 ? "" : exSrc.slice(matchedAt, exSrc.indexOf("\n}\n", matchedAt) + 3);
    check(
      "keepMatchedImportKey writes one ExerciseSession row of the key alone (kind DELETED_IMPORT_KIND, its day and minutes, no distance) and nothing else; a key there already is false",
      (matched.match(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g) ?? []).length === 1 && /prisma\.exerciseSession\.create\(/.test(matched) &&
        /kind: DELETED_IMPORT_KIND,/.test(matched) && /clientId: key,/.test(matched) && /distanceKm: 0,/.test(matched) && /if \(isUniqueViolation\(err\)\) return false;/.test(matched) &&
        !/\b(activityOp|activityData|activityEvent|linkRecord|completeLinkedCore|priceWalk|\$transaction|\$executeRaw|\$queryRaw)\b/.test(codeOfSrc(matched))
    );
    const fnAt = exSrc.indexOf("export async function importSessionCore(");
    const imp = fnAt < 0 ? "" : exSrc.slice(fnAt, exSrc.indexOf("\n}\n", fnAt) + 3);
    const keepAt = exSrc.indexOf("async function keepImportKey(");
    const keep = keepAt < 0 ? "" : exSrc.slice(keepAt, exSrc.indexOf("\n}\n", keepAt) + 3);
    check(
      "importSessionCore writes one ExerciseSession row (its kind, its key as the clientId, its Health Connect minutes, the variant Health Connect named or none: never yoga's Hatha guessed) and nothing else: no ActivityEvent, no transaction, no price, no habit tick, no moments",
      imp.length > 500 && (imp.match(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g) ?? []).length === 1 && /prisma\.exerciseSession\.create\(/.test(imp) &&
        /clientId: key,/.test(imp) && /startedAt: start,\s*endedAt: end,/.test(imp) && /kind: v\.kind,/.test(imp) &&
        /variant: raw\?\.variant != null && raw\.variant !== "" \? v\.variant : null,/.test(imp) &&
        !/\b(activityOp|activityData|activityEvent|recordActivity|ingestEventInput|walkEventInput|prEventInput|priceWalk|payWalkCore|payOnce|linkRecord|completeLinkedCore|withMoments|captureSnapshot|lifeLockOp|\$transaction|\$executeRaw|\$queryRaw)\b/.test(codeOfSrc(imp))
    );
    check(
      "a deleted import keeps its key: deleteSessionCore first keeps the row as DELETED_IMPORT_KIND (an import's key only, the record kinds only), so a resend is a duplicate; no ledger row",
      /if \(await keepImportKey\(userId, id\)\) return \{ ok: true, value: null \};/.test(exSrc) && /where: \{ id, userId, kind: \{ in: \[\.\.\.RECORD_KINDS\] \}, clientId: \{ startsWith: IMPORTED_CLIENT_ID_PREFIX \} \},\s*data: \{ kind: DELETED_IMPORT_KIND \},/.test(keep) &&
        !/\b(activityOp|activityData|activityEvent|\$transaction)\b/.test(keep) && DELETED_IMPORT_KIND === "DELETED"
    );
    const keyers = (() => {
      const out: string[] = [];
      const walkDir = (d: string) => {
        for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
          const rel = `${d}/${e.name}`;
          if (e.isDirectory()) walkDir(rel);
          else if (/\.(ts|tsx)$/.test(e.name) && /\bsessionClientIdOf\(/.test(code(rel))) out.push(rel);
        }
      };
      walkDir("src");
      return out.sort();
    })();
    check("an import's key is built by health-ingest.ts sessionClientIdOf alone, called by health-ingest-server only", same(keyers, ["src/lib/health-ingest-server.ts", "src/lib/health-ingest.ts"]), keyers.join(", "));
  }

  // ── 10. The walk path, byte for byte ──────────────────────────────────────
  section("10. the walk path is HEAD cf13f9e's byte for byte");
  {
    const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
    const DECL = /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)|let\s+(\w+)|type\s+(\w+)|interface\s+(\w+))/;
    const declsOf = (src: string): Map<string, string> => {
      const out = new Map<string, string>();
      let cur: { name: string; body: string[] } | null = null;
      for (const l of src.split("\n")) {
        const m = DECL.exec(l);
        if (m) {
          if (cur) out.set(cur.name, cur.body.join("\n").trimEnd());
          cur = { name: m.slice(1).find(Boolean)!, body: [l] };
          continue;
        }
        if (cur && /^[A-Za-z/@]/.test(l)) {
          out.set(cur.name, cur.body.join("\n").trimEnd());
          cur = null;
          continue;
        }
        if (cur) cur.body.push(l);
      }
      if (cur) out.set(cur.name, cur.body.join("\n").trimEnd());
      return out;
    };
    // Each digest is the sha256 (first 16 hex) of the declaration's LF text on HEAD cf13f9e (before D21). Re-pin one
    // only when a Health Connect walk is meant to change.
    const WALK_DECLS: Record<string, Record<string, string>> = {
      "src/lib/health-ingest.ts": {
        INGEST_KEY_PREFIX: "12f95a697c8d2b62",
        ingestKeyOf: "28b9cea0d865fc2d",
        isIngestKey: "0fdf716141779ffd",
        round: "7811c2c80f568b12",
        angleOfClimb: "bcbe76ab10212040",
        durationOf: "3189a9cdcf5b7b07",
        walkInputOf: "89442d27657dd4b0",
        isBackfill: "ac54c059fb37e52a",
        SameDaySession: "82277b3181c60e27",
        overlapShare: "0beb3e165132c242",
        MATCH_OVERLAP: "dabe41c25207a9b6",
        MATCH_MINUTES: "6dd14513066c4a24",
        MATCH_KM: "ec4286b6cdc5bbdc",
        near: "b9a8d2dbfbda5179",
        matchOf: "69872d4fa1730d07",
        importedTwinOf: "2e325b6f8219dedb",
        HC_ALREADY_HERE_PREFIX: "39351ac71bfe13bd",
        alreadyHereLineOf: "9bb0dcfd8078b609",
        INGEST_RECEIPT_V: "f27b6a932dff6b51",
        ingestReceiptOf: "3b3fef3fc2c6a7bf",
        isIngestReceipt: "8532c651792cc421",
        ingestEventInput: "81ec809a20373568",
        HC_WRITES_OFF: "b736c65de4690474",
        HC_WALK_INGESTED: "57817f442437fd8c",
      },
      "src/lib/exercise-server.ts": { importedWalksOn: "ec164b6a7ac2637d" },
    };
    const moved = Object.entries(WALK_DECLS).flatMap(([f, ds]) => {
      const d = declsOf(read(f));
      return Object.entries(ds).flatMap(([n, h]) => (d.has(n) && sha(d.get(n)!) === h ? [] : [`${f} ${n}`]));
    });
    check(`the walk's rules, its key, its match and its INGEST row are HEAD's byte for byte (${Object.values(WALK_DECLS).reduce((n, d) => n + Object.keys(d).length, 0)} digests)`, moved.length === 0, moved.join(", "));
    const srv = read("src/lib/health-ingest-server.ts");
    const slice = (a: string, b: string) => {
      const i = srv.indexOf(a);
      const j = i < 0 ? -1 : srv.indexOf(b, i);
      return i < 0 || j < 0 ? "" : srv.slice(i, j);
    };
    // D21's one addition to the walk loop (a record id a session holds is a duplicate) taken out, the loop is HEAD's.
    const loop = slice("  // The walks, oldest first", "\n\n  // D21: every other kind")
      .replace(
        "  // A record id a session holds already (sent before as another kind, a run since corrected to a walk) is that session.\n  const asRecord = await store.importedKeys(userId, walks.map((w) => sessionClientIdOf(w.externalId)));\n",
        ""
      )
      .replace(" || asRecord.has(sessionClientIdOf(w.externalId))", "");
    const weighLoop = slice("  // The weigh-ins", "\n  return { ok: true");
    const store = slice("  sessionsOn: async (userId, days) => {", "  logWalk: (userId, raw, now, opts) => logWalkCore(userId, raw, now, opts),");
    check(
      "ingestHealthCore's walk loop (the keys, the match, logWalkCore, the counts; D21's record-id check taken out), its weigh-in loop and the store's walk reads (sessionsOn, recordMatch) are HEAD's byte for byte, and the walks still come first",
      sha(loop) === "7bbb167a9850bd2a" && sha(weighLoop) === "79d54452f77ad564" && sha(store) === "a16204ebf5aaab63" && srv.indexOf("// The walks, oldest first") < srv.indexOf("// D21: every other kind") && srv.indexOf("// D21: every other kind") < srv.indexOf("// The weigh-ins"),
      `${sha(loop)} ${sha(weighLoop)} ${sha(store)}`
    );
  }

  // ── 11. The phone: named constants, no new permission ─────────────────────
  section("11. the phone maps Health Connect's types by name, and asks for nothing new");
  {
    const line = read("android/app/src/main/java/com/xtnl/app/core/HealthLine.kt");
    const at0 = line.indexOf("val KINDS: Map<Int, Kind> = mapOf(");
    const block = at0 < 0 ? "" : line.slice(at0, line.indexOf("\n    )", at0));
    const entries = block.split("\n").slice(1).filter((l) => l.trim() !== "" && !l.trim().startsWith("//"));
    const odd = entries.filter((l) => !/^\s+ExerciseSessionRecord\.EXERCISE_TYPE_[A-Z_]+ to Kind\("[A-Z]+"(, (variant|label) = "[^"]+")*\),$/.test(l));
    const kinds = new Set(entries.map((l) => /Kind\("([A-Z]+)"/.exec(l)?.[1]));
    check(
      "HealthLine.KINDS maps each Health Connect exercise type by the SDK's named constant (ExerciseSessionRecord.EXERCISE_TYPE_*), never an integer, to a kind the server takes",
      entries.length >= 30 && odd.length === 0 && !/\d/.test(block.replace(/EXERCISE_TYPE_\w+/g, "")) && [...kinds].every((k) => (HC_KINDS as readonly string[]).includes(k ?? "")) && kinds.size === HC_KINDS.length &&
        /fun kindOf\(type: Int\): String\? = KINDS\[type\]\?\.kind/.test(line) && !/const val TYPE_\w+ = \d+/.test(line),
      odd.join(" | ")
    );
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    const declared = [...manifest.matchAll(/android\.permission\.health\.(\w+)/g)].map((m) => m[1]).sort();
    check("no new permission: the manifest's Health Connect reads are the five it had (exercise covers every type)", same([...new Set(declared)], ["READ_DISTANCE", "READ_ELEVATION_GAINED", "READ_EXERCISE", "READ_HEALTH_DATA_IN_BACKGROUND", "READ_WEIGHT"]), declared.join(", "));
  }

  console.log(`\nhealth-ingest-check: ${passes} passed, ${failures} failed`);
  if (failures) process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

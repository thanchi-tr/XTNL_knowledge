/**
 * Health Connect walks, hikes, workouts and weight (blueprint 5.1d, plan P27, decisions D22 and D21 of
 * health-2026-10-27.md), the server half: what POST /api/mobile/v1/exercise runs (mobile-api-server.ts
 * handleExercise). The rules are health-ingest.ts; every write is an existing core's, called the way Train › Exercise
 * and the weigh-in card call it:
 *
 *   ingestHealthCore(userId, batch, deps?)   for each walk, oldest first: a key already on the ledger is a duplicate
 *                                  (nothing written), and so is a record id a session holds already (sent before as
 *                                  another kind); a walk that already is a session that day (a hand-logged one, or
 *                                  another app's over the same minutes: health-ingest.ts matchOf) records its key
 *                                  against that session and nothing else; otherwise exercise-server.ts logWalkCore
 *                                  writes the session and its key in one transaction and prices it as any walk (a
 *                                  live day, today or yesterday, through the knee), except the backfill (started
 *                                  before `since`, H17), which is a record only. Then (D21) each session of another
 *                                  kind, oldest first, a record: a key a session holds already ('hc:<externalId>' as
 *                                  its clientId, a deleted or matched one's included) or the ledger holds (sent before
 *                                  as a walk) is a duplicate; a session of the same kind already there that day
 *                                  (health-ingest.ts recordMatchOf: one typed by hand, another app's over the same
 *                                  minutes, a lift from the set logger) is that session, and only its key is kept
 *                                  (exercise-server.ts keepMatchedImportKey: a row nothing lists, so a resend stays a
 *                                  duplicate); otherwise exercise-server.ts importSessionCore writes the row
 *                                  alone, with no ledger row of any kind, no pay and no habit tick. A kind this server
 *                                  doesn't read is skipped with HC_KIND_UNREAD. Then each weigh-in, through
 *                                  weight-server.ts logWeightCore with source 'import' at its measured instant (an
 *                                  import never replaces a typed reading or a later import).
 *
 * A range a core refuses (a walk under 10 m or over 200 km, a run with no distance, a weight outside 20-400 kg, a day
 * over a year back) skips that item with the core's own line; the rest of the batch still lands. Every write needs
 * lifeWritesEnabled(env) (production, or XTNL_LIFE_JUDGE=1 on the local rehearsal): dev and prod share one database, so
 * a dev server records nothing and says so (HC_WRITES_OFF). Nothing here pays by itself: a walk's pay is logWalkCore's,
 * the INGEST row is sink NONE, xp 0, and a workout writes no ledger row at all. The store and the clock are injectable
 * (IngestDeps), so scripts/health-ingest-check.ts drives the core with no database.
 */
import { prisma } from "./prisma";
import { activityData, invalidateActivity, isDuplicateActivity } from "./activity";
import { lifeWritesEnabled, type LifeEnv } from "./life-economy";
import { dateColumn, dayKeyOf, keyOfDateColumn, type DayKey } from "./life-day";
import {
  IMPORT_DELETED,
  importSessionCore,
  isMissingSessionColumns,
  keepMatchedImportKey,
  logWalkCore,
  type ExerciseResult,
  type ImportedSession,
  type LoggedWalk,
  type LogWalkOptions,
} from "./exercise-server";
import { SESSION_LIMITS, isExerciseKind, isImportedSession, type RawSessionInput } from "./exercise";
import { logWeightCore, type WeightResult } from "./weight-server";
import {
  HC_ID_TOO_LONG,
  HC_KIND_UNREAD,
  HC_RECORD_KINDS,
  HC_WALK_INGESTED,
  HC_WRITES_OFF,
  ingestEventInput,
  ingestKeyOf,
  ingestLineOf,
  ingestReceiptOf,
  isBackfill,
  isIngestReceipt,
  matchOf,
  recordInputOf,
  recordMatchOf,
  sessionClientIdOf,
  walkInputOf,
  type HcBatch,
  type HcSession,
  type IngestSummary,
  type SameDaySession,
  type SameKindSession,
} from "./health-ingest";
import type { ActivityInput } from "./life-types";

export type IngestResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the core reads and writes; the real one is Prisma and the web's own cores. */
export interface IngestStore {
  /** Which of these keys are on the user's ledger already. */
  ingested(userId: string, keys: readonly string[]): Promise<Set<string>>;
  /** The user's walks on these life days, each with its Health Connect minutes when it was imported. */
  sessionsOn(userId: string, days: readonly DayKey[]): Promise<SameDaySession[]>;
  /** A matched walk's key, against the session it already is: true when written, false when the key was there. */
  recordMatch(userId: string, input: ActivityInput): Promise<boolean>;
  /** exercise-server.ts logWalkCore. */
  logWalk(userId: string, raw: ReturnType<typeof walkInputOf>, now: Date, opts: LogWalkOptions): Promise<ExerciseResult<LoggedWalk>>;
  /** D21: which of these 'hc:<externalId>' keys a session holds already (a deleted import's row keeps its key). */
  importedKeys(userId: string, keys: readonly string[]): Promise<Set<string>>;
  /**
   * D21: the user's sessions of the record kinds on these life days, each with its minutes where they are known (an
   * import's Health Connect minutes, a lift's wall clock, an open lift's up to `now`). Never a walk.
   */
  recordSessionsOn(userId: string, days: readonly DayKey[], now: Date): Promise<SameKindSession[]>;
  /** D21: exercise-server.ts importSessionCore. */
  logRecord(userId: string, raw: RawSessionInput, now: Date, opts: { clientId: string; at: { start: Date; end: Date } }): Promise<ExerciseResult<ImportedSession>>;
  /**
   * D21: a matched session's key, kept as a row of its key alone (exercise-server.ts keepMatchedImportKey), so a resend
   * is a duplicate whatever becomes of its twin: true when written, false when the key was there.
   */
  keepMatchedKey(userId: string, key: string, s: HcSession): Promise<boolean>;
  /** weight-server.ts logWeightCore. */
  logWeight(userId: string, kg: number, opts: { day: DayKey; source: "import"; measuredAt: Date; now: Date }): Promise<WeightResult<{ day: DayKey; replaced: boolean; kept?: boolean }>>;
}

export const prismaIngestStore: IngestStore = {
  ingested: async (userId, keys) => {
    if (keys.length === 0) return new Set();
    const rows = await prisma.activityEvent.findMany({ where: { userId, dedupeKey: { in: [...keys] } }, select: { dedupeKey: true } });
    return new Set(rows.map((r) => r.dedupeKey).filter((k): k is string => k != null));
  },
  sessionsOn: async (userId, days) => {
    if (days.length === 0) return [];
    // Walks only (health-brief-2026-10-27.md §3.6 H3): a walk from Health Connect matches a walk, never a run or a swim.
    const sessions = await prisma.exerciseSession.findMany({
      where: { userId, day: { in: days.map(dateColumn) }, kind: "WALK" },
      select: { id: true, day: true, durationMin: true, distanceKm: true },
    });
    if (sessions.length === 0) return [];
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: "INGEST", sourceId: { in: sessions.map((s) => s.id) } },
      select: { sourceId: true, receipt: true },
    });
    // An INGEST row naming a session as its own carries the walk's minutes; one that matched it claims it.
    const at = new Map<string, { start: Date; end: Date }>();
    const claimed = new Set<string>();
    for (const r of rows) {
      if (!r.sourceId || !isIngestReceipt(r.receipt)) continue;
      if (r.receipt.matched) claimed.add(r.sourceId);
      else at.set(r.sourceId, { start: new Date(r.receipt.start), end: new Date(r.receipt.end) });
    }
    return sessions.map((s) => ({
      id: s.id,
      day: keyOfDateColumn(s.day),
      durationMin: s.durationMin,
      distanceKm: s.distanceKm,
      at: at.get(s.id) ?? null,
      claimed: claimed.has(s.id),
    }));
  },
  recordMatch: async (userId, input) => {
    try {
      await prisma.activityEvent.create({ data: activityData(userId, input) });
      return true;
    } catch (err) {
      // The key landed first (a raced resend): it is recorded already.
      if (isDuplicateActivity(err)) return false;
      throw err;
    } finally {
      invalidateActivity(input);
    }
  },
  logWalk: (userId, raw, now, opts) => logWalkCore(userId, raw, now, opts),
  importedKeys: async (userId, keys) => {
    if (keys.length === 0) return new Set();
    try {
      const rows = await prisma.exerciseSession.findMany({ where: { userId, clientId: { in: [...keys] } }, select: { clientId: true } });
      return new Set(rows.map((r) => r.clientId).filter((k): k is string => k != null));
    } catch (err) {
      // Before the strength_sets migration no session has a key, so none was imported (importSessionCore says why).
      if (isMissingSessionColumns(err)) return new Set();
      throw err;
    }
  },
  recordSessionsOn: async (userId, days, now) => {
    if (days.length === 0) return [];
    try {
      // The record kinds only (D21, the twin rule kind by kind): a run matches a run, never a walk or a swim.
      const rows = await prisma.exerciseSession.findMany({
        where: { userId, day: { in: days.map(dateColumn) }, kind: { in: [...HC_RECORD_KINDS] } },
        select: { id: true, day: true, kind: true, durationMin: true, distanceKm: true, startedAt: true, endedAt: true, clientId: true },
      });
      return rows.flatMap((r): SameKindSession[] =>
        isExerciseKind(r.kind)
          ? [
              {
                id: r.id,
                kind: r.kind,
                day: keyOfDateColumn(r.day),
                durationMin: r.durationMin,
                distanceKm: r.distanceKm,
                at: r.startedAt ? { start: r.startedAt, end: r.endedAt ?? now } : null,
                imported: isImportedSession({ clientId: r.clientId }),
              },
            ]
          : []
      );
    } catch (err) {
      if (isMissingSessionColumns(err)) return [];
      throw err;
    }
  },
  logRecord: (userId, raw, now, opts) => importSessionCore(userId, raw, now, opts),
  keepMatchedKey: (userId, key, s) => keepMatchedImportKey(userId, key, { start: s.start, end: s.end }),
  logWeight: (userId, kg, opts) => logWeightCore(userId, kg, opts),
};

export interface IngestDeps {
  store?: IngestStore;
  now?: () => Date;
  env?: LifeEnv;
}

const emptySummary = (): IngestSummary => ({
  walks: { added: 0, paid: 0, recorded: 0, matched: 0, duplicate: 0, xp: 0 },
  sessions: { added: 0, matched: 0, duplicate: 0 },
  weights: { added: 0, kept: 0 },
  refused: [],
});

/** One sync's batch, written through the web's own cores. */
export async function ingestHealthCore(userId: string, batch: HcBatch, deps: IngestDeps = {}): Promise<IngestResult<IngestSummary & { line: string }>> {
  const store = deps.store ?? prismaIngestStore;
  const now = (deps.now ?? (() => new Date()))();
  if (!lifeWritesEnabled(deps.env)) return { ok: false, error: HC_WRITES_OFF };
  const out = emptySummary();

  // The walks, oldest first, so a walk matches the ones before it in the same batch.
  const walks = [...batch.walks].sort((a, b) => a.start.getTime() - b.start.getTime());
  const seen = await store.ingested(userId, walks.map((w) => ingestKeyOf(w.externalId)));
  // A record id a session holds already (sent before as another kind, a run since corrected to a walk) is that session.
  const asRecord = await store.importedKeys(userId, walks.map((w) => sessionClientIdOf(w.externalId)));
  const sessions = await store.sessionsOn(userId, [...new Set(walks.map((w) => dayKeyOf(w.start)))]);
  const taken = new Set<string>();
  const inBatch = new Set<string>();
  for (const w of walks) {
    const key = ingestKeyOf(w.externalId);
    if (seen.has(key) || inBatch.has(key) || asRecord.has(sessionClientIdOf(w.externalId))) {
      out.walks.duplicate++;
      continue;
    }
    inBatch.add(key);
    const backfill = isBackfill(w, batch.since);
    const input = walkInputOf(w);
    const match = matchOf(w, sessions, taken);
    if (match) {
      if (match.at == null) taken.add(match.id);
      const written = await store.recordMatch(userId, ingestEventInput(match.id, match.day, ingestReceiptOf(w, { backfill, matched: match.id }), now));
      if (written) out.walks.matched++;
      else out.walks.duplicate++;
      continue;
    }
    const res = await store.logWalk(userId, input, now, { ingest: ingestReceiptOf(w, { backfill, matched: null }), recordOnly: backfill });
    if (!res.ok) {
      if (res.error === HC_WALK_INGESTED) out.walks.duplicate++;
      else out.refused.push({ kind: "walk", externalId: w.externalId, error: res.error });
      continue;
    }
    out.walks.added++;
    if (res.value.pay?.kind === "PAID") {
      out.walks.paid++;
      out.walks.xp = Math.round((out.walks.xp + res.value.pay.xp) * 1000) / 1000;
    } else out.walks.recorded++;
    sessions.push({ id: res.value.id, day: res.value.day, durationMin: res.value.durationMin, distanceKm: res.value.distanceKm, at: { start: w.start, end: w.end }, claimed: false });
  }

  // D21: every other kind, oldest first, a record each. No ledger row of any kind: a session lands once by its own key
  // ('hc:<externalId>' as its clientId), and one already here that day of the same kind is that session (only its key is
  // kept). A record id already here as a walk (the ledger's key, or this batch's) stays the walk. Never paid, whatever
  // its day, so the backfill changes nothing for one. A kind this server doesn't read is skipped and said, never taken
  // for another.
  for (const u of batch.unread ?? []) out.refused.push({ kind: "session", externalId: u.externalId, error: HC_KIND_UNREAD });
  const records = [...(batch.sessions ?? [])].sort((a, b) => a.start.getTime() - b.start.getTime());
  if (records.length > 0) {
    const asWalk = await store.ingested(userId, records.map((s) => ingestKeyOf(s.externalId)));
    const here = await store.importedKeys(userId, records.map((s) => sessionClientIdOf(s.externalId)));
    const kept = await store.recordSessionsOn(userId, [...new Set(records.map((s) => dayKeyOf(s.start)))], now);
    const claimed = new Set<string>();
    const landed = new Set<string>();
    for (const s of records) {
      const key = sessionClientIdOf(s.externalId);
      if (key.length > SESSION_LIMITS.CLIENT_ID_MAX) {
        out.refused.push({ kind: "session", externalId: s.externalId, error: HC_ID_TOO_LONG });
        continue;
      }
      if (here.has(key) || landed.has(key) || asWalk.has(ingestKeyOf(s.externalId)) || inBatch.has(ingestKeyOf(s.externalId))) {
        out.sessions.duplicate++;
        continue;
      }
      landed.add(key);
      const match = recordMatchOf(s, kept, claimed);
      if (match) {
        if (match.at == null) {
          // One typed without times absorbs this one; another app's copy of it later in the batch twins it by these
          // minutes (half in common), so a session two apps wrote is matched twice, never listed twice.
          claimed.add(match.id);
          kept.push({ ...match, at: { start: s.start, end: s.end } });
        }
        // Its key is kept, so a resend is a duplicate whatever becomes of its twin (a matched walk keeps its INGEST row).
        if (await store.keepMatchedKey(userId, key, s)) out.sessions.matched++;
        else out.sessions.duplicate++;
        continue;
      }
      const res = await store.logRecord(userId, recordInputOf(s), now, { clientId: key, at: { start: s.start, end: s.end } });
      if (!res.ok) {
        if (res.error === IMPORT_DELETED) out.sessions.duplicate++;
        else out.refused.push({ kind: "session", externalId: s.externalId, error: res.error });
        continue;
      }
      if (res.value.replay) {
        out.sessions.duplicate++;
        continue;
      }
      out.sessions.added++;
      kept.push({ id: res.value.id, kind: res.value.kind, day: res.value.day, durationMin: res.value.durationMin, distanceKm: res.value.distanceKm, at: { start: s.start, end: s.end }, imported: true });
    }
  }

  // The weigh-ins, oldest first: the day's latest measurement is the one that stays.
  const weights = [...batch.weights].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const x of weights) {
    const res = await store.logWeight(userId, x.kg, { day: dayKeyOf(x.at), source: "import", measuredAt: x.at, now });
    if (!res.ok) out.refused.push({ kind: "weight", externalId: x.externalId, error: res.error });
    else if (res.value.kept) out.weights.kept++;
    else out.weights.added++;
  }
  return { ok: true, value: { ...out, line: ingestLineOf(out) } };
}

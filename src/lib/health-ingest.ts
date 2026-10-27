/**
 * Health Connect walks, hikes, workouts and weight (blueprint 5.1d "Sub-5-Second Ingestion", plan P27, decisions D22
 * and D21 of health-2026-10-27.md), the pure half. The Android app reads exercise sessions and weigh-ins from Health
 * Connect on the phone (a WorkManager job, off until the user turns it on in the app's Settings) and posts them to POST
 * /api/mobile/v1/exercise (docs/mobile-api.md); health-ingest-server.ts writes them through the web's own cores. This
 * narrowly reverses the M4 drop: walks pay as walks always have, every other kind is a record, and nothing else is
 * read (no steps, no heart rate, no sleep, no new pay rule).
 *
 *   A walk     logWalkCore (exercise-server.ts), exactly as Train › Exercise logs one: one ExerciseSession, priced by the
 *              walk's own rules on a live day (today or yesterday only, through the daily knee; momentum.md §A.6), with
 *              its dedupe row 'ingest:hc:<externalId>' (an INGEST row, sink NONE, xp 0, never a streak day) written in
 *              the same transaction. A resend, a retried job or a second phone is a duplicate: nothing is written twice.
 *              A hike is a walk with its incline (the climb Health Connect measured over the distance: angleOfClimb).
 *   The match  A walk the user already logged by hand on the same life day (or one another app wrote into Health
 *              Connect over the same minutes) is the same walk: its key is recorded against that session and nothing
 *              else is written or paid (one session, one payment). A hand-logged session absorbs one walk at most, so a
 *              second walk that day is never swallowed by it. The other order holds too: a walk typed on Train ›
 *              Exercise after Health Connect brought the same one in (same day, the same tolerances) is refused with
 *              what is already there (importedTwinOf, exercise-server logWalkCore), so it is never paid twice.
 *   Backfill   (H17) A walk that started before the sync was switched on (the request's `since`) is a record only: no
 *              pay and no personal best, whatever its day (logWalkCore's recordOnly). Health Connect lets a new app
 *              read the 30 days before its first grant; those come in as history.
 *   Weight     logWeightCore (weight-server.ts) with source 'import', on the life day it was measured: a record, never a
 *              reward. One reading a day: an import never replaces one typed on the phone or the web, and replaces an
 *              earlier import only with a later measurement (weight.ts importReplaces), so a resend changes nothing.
 *   A workout  (D21) A run, a ride, a swim, a row, an elliptical, HIIT or circuit session, a game, yoga, mobility or a
 *              lift: exercise-server importSessionCore, a RECORD of its kind (exercise.ts KIND_SPECS checks it through
 *              cleanSessionInput, so a kind's own bounds hold; a kind with no distance needs none). It writes no
 *              ActivityEvent of any kind (no WORKOUT, PR or INGEST row), pays nothing and ticks no habit, so it feeds no
 *              streak, quest, kept week, skill hour or personal best. It lands once by its own key, 'hc:<externalId>'
 *              as the session's clientId (ExerciseSession's unique (userId, clientId)), with its Health Connect minutes
 *              as the session's startedAt and endedAt. A lift is its minutes alone (Health Connect carries no load, so
 *              no movement and no set), and its row says "from Health Connect".
 *   Its twin   (D21, kind by kind) A session of the same kind on the same life day is the same session: one whose
 *              minutes are known (an import, a lift's wall clock) when half of the shorter one's minutes are in common,
 *              one typed without times by its duration and distance (MATCH_MINUTES, MATCH_KM), each absorbing one at
 *              most. Nothing is written for a twin. A walk is never a run's twin, nor a run a walk's.
 *   Unread     A kind this server doesn't read (a newer phone's) is skipped and counted, never guessed.
 *
 * Nothing here decides a price, a grade or a level: every rule above is an existing core's. Pure (no Prisma, no
 * clock): scripts/health-ingest-check.ts holds every rule here.
 *
 * Exports
 *   Limits   HC_WALKS_MAX · HC_WEIGHTS_MAX · HC_EXTERNAL_ID_RE · HC_ORIGIN_RE · HC_FUTURE_SLACK_MS · HC_KINDS · HcKind
 *            HC_WALK_KINDS · HcWalkKind · HC_RECORD_KINDS · HcRecordKind · isHcWalkKind · isHcRecordKind
 *   Input    HcWalk · HcSession · HcUnread · HcWeight · HcBatch
 *   Keys     INGEST_KEY_PREFIX · ingestKeyOf(externalId) · isIngestKey(key) · sessionClientIdOf(externalId)
 *   A walk   angleOfClimb(distanceKm, climbM) · walkInputOf(walk) · durationOf(walk) · isBackfill(walk, since)
 *   A workout  recordInputOf(session) · recordNoteOf(kind)
 *   Match    SameDaySession · matchOf(walk, sessions, taken) · overlapShare(a, b) · importedTwinOf(hand, sessions) ·
 *            HC_ALREADY_HERE_PREFIX · alreadyHereLineOf(session) · SameKindSession · recordMatchOf(session, sessions, taken)
 *   Rows     IngestReceipt · INGEST_RECEIPT_V · ingestReceiptOf(walk, opts) · ingestEventInput(sessionId, day, receipt, now) · isIngestReceipt
 *   Words    IngestSummary · ingestLineOf(summary) · HC_WRITES_OFF · HC_WALK_INGESTED · HC_KIND_UNREAD · HC_ID_TOO_LONG
 */
import { dayKeyOf, type DayKey } from "./life-day";
import { IMPORTED_CLIENT_ID_PREFIX, KIND_SPECS, type ExerciseKind, type RawSessionInput } from "./exercise";
import type { ActivityInput, Receipt } from "./life-types";

// ── Limits ──────────────────────────────────────────────────────────────────

/** Walks and weigh-ins one request may carry (the phone sends 50 at a time). */
export const HC_WALKS_MAX = 100;
export const HC_WEIGHTS_MAX = 100;
/** A Health Connect record id (metadata.id, a UUID today), or any id of up to 64 safe characters. */
export const HC_EXTERNAL_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
/** The app that wrote the record into Health Connect (its package name, e.g. com.sec.android.app.shealth). */
export const HC_ORIGIN_RE = /^[A-Za-z0-9_.]{1,100}$/;
/** A session or weigh-in may start at most this far ahead of the server's clock (a phone clock a little fast). */
export const HC_FUTURE_SLACK_MS = 10 * 60_000;

/** A walk: Health Connect's walking and hiking sessions, priced as any walk. */
export const HC_WALK_KINDS = ["WALK", "HIKE"] as const;
export type HcWalkKind = (typeof HC_WALK_KINDS)[number];
/** D21: every other kind the phone maps a Health Connect exercise type to (exercise.ts RECORD_KINDS, in order): a record each. */
export const HC_RECORD_KINDS = ["RUN", "CYCLE", "SWIM", "ROW", "ELLIPTICAL", "HIIT", "CIRCUIT", "SPORT", "YOGA", "MOBILITY", "LIFT"] as const satisfies readonly ExerciseKind[];
export type HcRecordKind = (typeof HC_RECORD_KINDS)[number];
/** What the sync reads: the walks, then every record kind (D21, widened from walking and hiking alone). */
export const HC_KINDS = [...HC_WALK_KINDS, ...HC_RECORD_KINDS] as const;
export type HcKind = (typeof HC_KINDS)[number];

export function isHcWalkKind(x: unknown): x is HcWalkKind {
  return typeof x === "string" && (HC_WALK_KINDS as readonly string[]).includes(x);
}

export function isHcRecordKind(x: unknown): x is HcRecordKind {
  return typeof x === "string" && (HC_RECORD_KINDS as readonly string[]).includes(x);
}

// ── Input ───────────────────────────────────────────────────────────────────

/** One walking or hiking session, as the phone read it (checked for shape by mobile-api.ts exerciseRequestOf). */
export interface HcWalk {
  externalId: string;
  kind: HcWalkKind;
  start: Date;
  end: Date;
  /** Kilometres over the session (Health Connect's distance records inside it, from the session's own app). */
  distanceKm: number;
  /** Metres climbed over the session, when the app recorded it; null otherwise (a flat walk). */
  climbM: number | null;
  /** The app that recorded it (its package name), or null. */
  origin: string | null;
}

/**
 * D21: one session of a record kind, as the phone read it (the kind from the Health Connect exercise type's named
 * constant, android core/HealthLine.kt; checked for shape by mobile-api.ts exerciseRequestOf).
 */
export interface HcSession {
  externalId: string;
  kind: HcRecordKind;
  /** The kind's variant the Health Connect type names (a treadmill run's TREADMILL, a stationary ride's STATIONARY), or null. */
  variant: string | null;
  /** A sport with no variant of its own (SPORT OTHER): its name as the phone says it ("Rugby"), or null. */
  label: string | null;
  start: Date;
  end: Date;
  /** Kilometres over the session from its own app, for a kind with a distance; null when none came. */
  distanceKm: number | null;
  /** The app that recorded it (its package name), or null. */
  origin: string | null;
}

/** A session of a kind this server doesn't read (a newer phone's): skipped and counted, never guessed. */
export interface HcUnread {
  externalId: string;
  kind: string;
}

/** One weigh-in. */
export interface HcWeight {
  externalId: string;
  at: Date;
  kg: number;
}

export interface HcBatch {
  /** When the sync was switched on: a walk that started before it is the backfill, a record only (H17). */
  since: Date;
  walks: HcWalk[];
  /** D21: every other kind, a record each (none from a phone before 2.21). */
  sessions?: HcSession[];
  /** Kinds this server doesn't read: each one is listed in the reply's `refused`. */
  unread?: HcUnread[];
  weights: HcWeight[];
}

// ── Keys ────────────────────────────────────────────────────────────────────

export const INGEST_KEY_PREFIX = "ingest:hc:";

/** The walk's dedupe row: 'ingest:hc:<externalId>' (ActivityEvent's unique (userId, dedupeKey)). */
export function ingestKeyOf(externalId: string): string {
  return `${INGEST_KEY_PREFIX}${externalId}`;
}

export function isIngestKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(INGEST_KEY_PREFIX) && key.length > INGEST_KEY_PREFIX.length;
}

/**
 * D21: a record kind's session is keyed by its own row, never by a ledger row: 'hc:<externalId>' as the
 * ExerciseSession's clientId (its unique (userId, clientId)), so a resend answers the row it wrote. A record id longer
 * than the key allows (SESSION_LIMITS.CLIENT_ID_MAX, 64) is refused with HC_ID_TOO_LONG.
 */
export function sessionClientIdOf(externalId: string): string {
  return `${IMPORTED_CLIENT_ID_PREFIX}${externalId}`;
}

// ── A walk ──────────────────────────────────────────────────────────────────

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * The incline in degrees a hike's climb gives (exercise.ts walkFactsOf reads it back: climb = distance × sin(angle)),
 * to one decimal, at most 45°. No climb, or no distance, is flat (0).
 */
export function angleOfClimb(distanceKm: number, climbM: number | null): number {
  if (climbM == null || !Number.isFinite(climbM) || climbM <= 0 || !Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const ratio = Math.min(1, climbM / (distanceKm * 1000));
  return Math.min(45, round((Math.asin(ratio) * 180) / Math.PI, 1));
}

/** The session's minutes, to one decimal (end − start). */
export function durationOf(w: Pick<HcWalk, "start" | "end">): number {
  return round((w.end.getTime() - w.start.getTime()) / 60_000, 1);
}

/** The note a Health Connect walk is saved with ("Hike · Health Connect"), so Train › Exercise says where it came from. */
export function noteOf(kind: HcWalkKind): string {
  return `${kind === "HIKE" ? "Hike" : "Walk"} · Health Connect`;
}

/**
 * What logWalkCore takes for it (exercise.ts cleanWalkInput checks it again): the life day it started on, its incline
 * from the climb, its distance and minutes, and its note.
 */
export function walkInputOf(w: HcWalk): { day: DayKey; angleDeg: number; distanceKm: number; durationMin: number; note: string } {
  return { day: dayKeyOf(w.start), angleDeg: angleOfClimb(w.distanceKm, w.climbM), distanceKm: round(w.distanceKm, 2), durationMin: durationOf(w), note: noteOf(w.kind) };
}

/** The backfill (H17): a walk that started before the sync was switched on is a record only. */
export function isBackfill(w: Pick<HcWalk, "start">, since: Date): boolean {
  return w.start.getTime() < since.getTime();
}

// ── A workout (D21: a record of its kind) ───────────────────────────────────

/** The note a Health Connect session of a record kind is saved with: "Run · Health Connect", "Lift · Health Connect". */
export function recordNoteOf(kind: HcRecordKind): string {
  const noun = KIND_SPECS[kind].noun;
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} · Health Connect`;
}

/**
 * What importSessionCore takes for it (exercise.ts cleanSessionInput checks it as any session of its kind, so the
 * kind's own bounds hold): the life day it started on, its minutes (end − start; the core keeps them to the second),
 * its distance only where the kind has one (KIND_SPECS: a lift, yoga or HIIT has none, and needs none), the variant or
 * the sport's name the phone gave, its note, and a lift's wall clock (the start and the end). Health Connect carries
 * no load: a lift is its minutes alone. No climb: a run's incline is never guessed from it.
 */
export function recordInputOf(s: HcSession): RawSessionInput {
  const spec = KIND_SPECS[s.kind];
  return {
    kind: s.kind,
    day: dayKeyOf(s.start),
    durationMin: (s.end.getTime() - s.start.getTime()) / 60_000,
    ...(spec.distance != null && s.distanceKm != null ? { distanceKm: round(s.distanceKm, 3) } : {}),
    ...(s.variant != null ? { variant: s.variant } : {}),
    ...(s.label != null ? { label: s.label } : {}),
    ...(spec.wallClock ? { startedAt: s.start.toISOString(), endedAt: s.end.toISOString() } : {}),
    note: recordNoteOf(s.kind),
  };
}

// ── The match (one session, one payment) ────────────────────────────────────

/** A session already on the walk's life day: typed by hand (`at` null), or imported (`at` its Health Connect minutes). */
export interface SameDaySession {
  id: string;
  day: DayKey;
  durationMin: number;
  distanceKm: number;
  at: { start: Date; end: Date } | null;
  /** A hand-logged session an earlier Health Connect walk already matched: it absorbs no other. */
  claimed: boolean;
}

/** The share of the shorter of two intervals that the two have in common (0 to 1). */
export function overlapShare(a: { start: Date; end: Date }, b: { start: Date; end: Date }): number {
  const shorter = Math.min(a.end.getTime() - a.start.getTime(), b.end.getTime() - b.start.getTime());
  if (!(shorter > 0)) return 0;
  const common = Math.min(a.end.getTime(), b.end.getTime()) - Math.max(a.start.getTime(), b.start.getTime());
  return Math.max(0, common) / shorter;
}

/** Two imported walks are one when they share half of the shorter one's minutes (two apps wrote the same walk). */
export const MATCH_OVERLAP = 0.5;
/** A hand-logged walk is this one when its minutes and its distance are both within these (the larger of the two). */
export const MATCH_MINUTES = { abs: 5, share: 0.2 } as const;
export const MATCH_KM = { abs: 0.3, share: 0.2 } as const;

const near = (a: number, b: number, tol: { abs: number; share: number }) => Math.abs(a - b) <= Math.max(tol.abs, tol.share * Math.max(a, b));

/**
 * The session this walk already is, or null. An imported session on the same day matches by its minutes (≥ half of the
 * shorter one in common). A hand-logged one (no minutes known) matches by its duration and distance, the closest first,
 * and only while no Health Connect walk has matched it (`claimed`, or `taken` in this batch): each hand-logged session
 * absorbs one walk at most.
 */
export function matchOf(w: HcWalk, sessions: readonly SameDaySession[], taken: ReadonlySet<string>): SameDaySession | null {
  const day = dayKeyOf(w.start);
  const minutes = durationOf(w);
  const sameDay = sessions.filter((s) => s.day === day);
  const imported = sameDay.find((s) => s.at != null && overlapShare(s.at, w) >= MATCH_OVERLAP);
  if (imported) return imported;
  let best: SameDaySession | null = null;
  let bestGap = Infinity;
  for (const s of sameDay) {
    if (s.at != null || s.claimed || taken.has(s.id)) continue;
    if (!near(s.durationMin, minutes, MATCH_MINUTES) || !near(s.distanceKm, w.distanceKm, MATCH_KM)) continue;
    const gap = Math.abs(s.durationMin - minutes) / Math.max(1, minutes) + Math.abs(s.distanceKm - w.distanceKm) / Math.max(0.01, w.distanceKm);
    if (gap < bestGap) {
      best = s;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * The other order (a walk typed by hand after Health Connect brought it in): the imported session on the same life day
 * whose minutes and distance are both within the match's tolerances (MATCH_MINUTES, MATCH_KM), the closest first, or
 * null. Only an imported walk's own session counts (`at` set): a hand-logged one is never a twin here, so typing two
 * walks by hand works as it always did.
 */
export function importedTwinOf(hand: { day: DayKey; durationMin: number; distanceKm: number }, sessions: readonly SameDaySession[]): SameDaySession | null {
  let best: SameDaySession | null = null;
  let bestGap = Infinity;
  for (const s of sessions) {
    if (s.at == null || s.day !== hand.day) continue;
    if (!near(s.durationMin, hand.durationMin, MATCH_MINUTES) || !near(s.distanceKm, hand.distanceKm, MATCH_KM)) continue;
    const gap = Math.abs(s.durationMin - hand.durationMin) / Math.max(1, hand.durationMin) + Math.abs(s.distanceKm - hand.distanceKm) / Math.max(0.01, hand.distanceKm);
    if (gap < bestGap) {
      best = s;
      bestGap = gap;
    }
  }
  return best;
}

/** How the refusal of a hand-logged twin opens. */
export const HC_ALREADY_HERE_PREFIX = "Already here from Health Connect";

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** "Already here from Health Connect: a 42 min, 3.1 km walk that day. Nothing was logged twice." */
export function alreadyHereLineOf(s: Pick<SameDaySession, "durationMin" | "distanceKm">): string {
  return `${HC_ALREADY_HERE_PREFIX}: a ${Math.round(s.durationMin)} min, ${fmt1(s.distanceKm)} km walk that day. Nothing was logged twice.`;
}

// ── A workout's twin (D21: kind by kind; nothing is written for one) ────────

/** A session of a record kind already on the life day: typed by hand, imported, or a lift from the set logger. */
export interface SameKindSession {
  id: string;
  kind: ExerciseKind;
  day: DayKey;
  durationMin: number;
  /** 0 for a kind with no distance, or a session logged without one. */
  distanceKm: number;
  /** Its minutes, when known: an import's Health Connect minutes, a lift's wall clock (an open one up to now). Null: typed without times. */
  at: { start: Date; end: Date } | null;
  /** Health Connect brought it in (its key is 'hc:<record id>'). */
  imported: boolean;
}

/** The minutes within MATCH_MINUTES, and the distances within MATCH_KM when both sessions have one (else the minutes alone). */
const closeTo = (s: Pick<SameKindSession, "durationMin" | "distanceKm">, minutes: number, km: number): boolean =>
  near(s.durationMin, minutes, MATCH_MINUTES) && (!(s.distanceKm > 0 && km > 0) || near(s.distanceKm, km, MATCH_KM));

/**
 * The session this Health Connect session already is, or null (the twin rule, kind by kind). Only a session of the
 * same kind on the same life day counts: a walk is never a run's twin, nor a lift a circuit's. One whose minutes are
 * known (an import from another app, a lift's wall clock) is this one when half of the shorter one's minutes are in
 * common, the most in common first. One typed without times is this one when its duration (and, if both have one, its
 * distance) is within the match's tolerances, the closest first, and only while it has absorbed no other: not taken in
 * this batch, and not itself the hand-typed copy of a session imported that day (within the same tolerances of one).
 * So each absorbs one Health Connect session at most. A matched session keeps its key (health-ingest-server
 * ingestHealthCore, exercise-server keepMatchedImportKey), so its resend is a duplicate and never reaches this again.
 */
export function recordMatchOf(s: HcSession, sessions: readonly SameKindSession[], taken: ReadonlySet<string>): SameKindSession | null {
  const day = dayKeyOf(s.start);
  const minutes = (s.end.getTime() - s.start.getTime()) / 60_000;
  const km = s.distanceKm ?? 0;
  const same = sessions.filter((x) => x.kind === s.kind && x.day === day);
  let timed: SameKindSession | null = null;
  let most = 0;
  for (const x of same) {
    if (x.at == null) continue;
    const share = overlapShare(x.at, s);
    if (share >= MATCH_OVERLAP && share > most) {
      timed = x;
      most = share;
    }
  }
  if (timed) return timed;
  const imports = same.filter((x) => x.imported);
  let best: SameKindSession | null = null;
  let bestGap = Infinity;
  for (const x of same) {
    if (x.at != null || taken.has(x.id) || !closeTo(x, minutes, km)) continue;
    if (imports.some((i) => closeTo(x, i.durationMin, i.distanceKm))) continue;
    const gap = Math.abs(x.durationMin - minutes) / Math.max(1, minutes) + (x.distanceKm > 0 && km > 0 ? Math.abs(x.distanceKm - km) / Math.max(0.01, km) : 0);
    if (gap < bestGap) {
      best = x;
      bestGap = gap;
    }
  }
  return best;
}

// ── The rows ────────────────────────────────────────────────────────────────

export const INGEST_RECEIPT_V = "ingest-1";

/** The INGEST row's receipt: where the walk came from, its Health Connect minutes, and what became of it. */
export interface IngestReceipt {
  v: typeof INGEST_RECEIPT_V;
  via: "health-connect";
  /** A walk's alone: a record kind's session has no INGEST row (D21). */
  kind: HcWalkKind;
  externalId: string;
  origin: string | null;
  start: string;
  end: string;
  /** Started before the sync was switched on: recorded, never paid (H17). */
  backfill: boolean;
  /** The session it already was (a hand-logged or another app's walk): nothing else was written. Null: it is its own session. */
  matched: string | null;
}

export function ingestReceiptOf(w: HcWalk, opts: { backfill: boolean; matched: string | null }): IngestReceipt {
  return {
    v: INGEST_RECEIPT_V,
    via: "health-connect",
    kind: w.kind,
    externalId: w.externalId,
    origin: w.origin,
    start: w.start.toISOString(),
    end: w.end.toISOString(),
    backfill: opts.backfill,
    matched: opts.matched,
  };
}

export function isIngestReceipt(v: unknown): v is IngestReceipt {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Partial<IngestReceipt>;
  return r.v === INGEST_RECEIPT_V && typeof r.externalId === "string" && typeof r.start === "string" && typeof r.end === "string";
}

/**
 * The walk's dedupe row: source INGEST, sink NONE, xp 0, never a streak day, about the session (`sourceId`) it is or
 * matched, dated the walk's life day. It pays nothing: a walk's pay is its own WORKOUT row, as always.
 */
export function ingestEventInput(sessionId: string, day: DayKey, receipt: IngestReceipt, now: Date): ActivityInput {
  return {
    source: "INGEST",
    sink: "NONE",
    occurredAt: now,
    day,
    sourceId: sessionId,
    xp: 0,
    countsForStreak: false,
    receipt: receipt as unknown as Receipt,
    detail: `health connect · ${receipt.kind === "HIKE" ? "hike" : "walk"}${receipt.matched ? " · already logged" : receipt.backfill ? " · history" : ""}`,
    dedupeKey: ingestKeyOf(receipt.externalId),
  };
}

// ── Words ───────────────────────────────────────────────────────────────────

/** Dev and prod share one database: an import is written by the live app only (lifeWritesEnabled). */
export const HC_WRITES_OFF = "Health Connect imports are recorded by the live app only (this server writes nothing).";
/** logWalkCore's answer when the walk's key landed first on another request (a raced resend): a duplicate. */
export const HC_WALK_INGESTED = "That Health Connect walk is already here.";
/** A session whose kind this server doesn't read (a newer phone's): skipped, never guessed as another kind. */
export const HC_KIND_UNREAD = "Not a kind XTNL reads from Health Connect yet.";
/** A record id too long for its session's key ('hc:' and the id, at most 64 characters): skipped. */
export const HC_ID_TOO_LONG = "That Health Connect record's id is too long to keep.";

export interface IngestSummary {
  walks: { added: number; paid: number; recorded: number; matched: number; duplicate: number; xp: number };
  /** D21: every other kind, a record each: in as its own session, matched to one already here, or a resend. */
  sessions: { added: number; matched: number; duplicate: number };
  weights: { added: number; kept: number };
  refused: { kind: "walk" | "session" | "weight"; externalId: string; error: string }[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The reply's line: "Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 already logged · 1 weigh-in", with
 * any other kind as "· 2 workouts recorded" after the walks (and its matches in "already logged"), or "Health Connect:
 * nothing new." when everything was here already.
 */
export function ingestLineOf(s: IngestSummary): string {
  const parts: string[] = [];
  const w = s.walks;
  const r = s.sessions;
  if (w.added > 0) {
    const how = [w.paid > 0 ? `${w.paid} paid ${round(w.xp, 1)} XP` : null, w.recorded > 0 ? `${w.recorded} recorded` : null].filter(Boolean).join(", ");
    parts.push(`${plural(w.added, "walk")} in${how ? ` (${how})` : ""}`);
  }
  if (r.added > 0) parts.push(`${plural(r.added, "workout")} recorded`);
  if (w.matched + r.matched > 0) parts.push(`${w.matched + r.matched} already logged`);
  if (s.weights.added > 0) parts.push(plural(s.weights.added, "weigh-in"));
  if (s.refused.length > 0) parts.push(`${s.refused.length} skipped`);
  return parts.length ? `Health Connect: ${parts.join(" · ")}` : "Health Connect: nothing new.";
}

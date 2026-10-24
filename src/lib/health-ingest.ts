/**
 * Health Connect walks, hikes and weight (blueprint 5.1d "Sub-5-Second Ingestion", plan P27, decision D22), the pure
 * half. The Android app reads walking and hiking sessions and weigh-ins from Health Connect on the phone (a WorkManager
 * job, off until the user turns it on in the app's Settings) and posts them to POST /api/mobile/v1/exercise
 * (docs/mobile-api.md); health-ingest-server.ts writes them through the web's own cores. This narrowly reverses the M4
 * drop: walks and weight only, no steps, no heart rate, no other workout, no new pay rule.
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
 *
 * Nothing here decides a price, a grade or a level: every rule above is an existing core's. Pure (no Prisma, no
 * clock): scripts/health-ingest-check.ts holds every rule here.
 *
 * Exports
 *   Limits   HC_WALKS_MAX · HC_WEIGHTS_MAX · HC_EXTERNAL_ID_RE · HC_ORIGIN_RE · HC_FUTURE_SLACK_MS · HC_KINDS · HcKind
 *   Input    HcWalk · HcWeight · HcBatch
 *   Keys     INGEST_KEY_PREFIX · ingestKeyOf(externalId) · isIngestKey(key)
 *   A walk   angleOfClimb(distanceKm, climbM) · walkInputOf(walk) · durationOf(walk) · isBackfill(walk, since)
 *   Match    SameDaySession · matchOf(walk, sessions, taken) · overlapShare(a, b) · importedTwinOf(hand, sessions) ·
 *            HC_ALREADY_HERE_PREFIX · alreadyHereLineOf(session)
 *   Rows     IngestReceipt · INGEST_RECEIPT_V · ingestReceiptOf(walk, opts) · ingestEventInput(sessionId, day, receipt, now) · isIngestReceipt
 *   Words    IngestSummary · ingestLineOf(summary) · HC_WRITES_OFF · HC_WALK_INGESTED
 */
import { dayKeyOf, type DayKey } from "./life-day";
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

/** What the sync reads: Health Connect's walking (79) and hiking (37) sessions. */
export const HC_KINDS = ["WALK", "HIKE"] as const;
export type HcKind = (typeof HC_KINDS)[number];

// ── Input ───────────────────────────────────────────────────────────────────

/** One walking or hiking session, as the phone read it (checked for shape by mobile-api.ts exerciseRequestOf). */
export interface HcWalk {
  externalId: string;
  kind: HcKind;
  start: Date;
  end: Date;
  /** Kilometres over the session (Health Connect's distance records inside it, from the session's own app). */
  distanceKm: number;
  /** Metres climbed over the session, when the app recorded it; null otherwise (a flat walk). */
  climbM: number | null;
  /** The app that recorded it (its package name), or null. */
  origin: string | null;
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
export function noteOf(kind: HcKind): string {
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

// ── The rows ────────────────────────────────────────────────────────────────

export const INGEST_RECEIPT_V = "ingest-1";

/** The INGEST row's receipt: where the walk came from, its Health Connect minutes, and what became of it. */
export interface IngestReceipt {
  v: typeof INGEST_RECEIPT_V;
  via: "health-connect";
  kind: HcKind;
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

export interface IngestSummary {
  walks: { added: number; paid: number; recorded: number; matched: number; duplicate: number; xp: number };
  weights: { added: number; kept: number };
  refused: { kind: "walk" | "weight"; externalId: string; error: string }[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The reply's line: "Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 already logged · 1 weigh-in", or
 * "Health Connect: nothing new." when everything was here already.
 */
export function ingestLineOf(s: IngestSummary): string {
  const parts: string[] = [];
  const w = s.walks;
  if (w.added > 0) {
    const how = [w.paid > 0 ? `${w.paid} paid ${round(w.xp, 1)} XP` : null, w.recorded > 0 ? `${w.recorded} recorded` : null].filter(Boolean).join(", ");
    parts.push(`${plural(w.added, "walk")} in${how ? ` (${how})` : ""}`);
  }
  if (w.matched > 0) parts.push(`${w.matched} already logged`);
  if (s.weights.added > 0) parts.push(plural(s.weights.added, "weigh-in"));
  if (s.refused.length > 0) parts.push(`${s.refused.length} skipped`);
  return parts.length ? `Health Connect: ${parts.join(" · ")}` : "Health Connect: nothing new.";
}

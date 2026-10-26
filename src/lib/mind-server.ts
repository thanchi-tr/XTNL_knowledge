/**
 * Mind: the check-in's reads and writes (server only; the rules are mind.ts). Every read fails soft — the tables may
 * be missing on a database the 20270103000000_mind_checks migration has not reached — and returns the empty view with
 * ready: false (and failed: true when the fault is anything but a missing table, so a transient error never reads as
 * "nothing logged" or "not paused"); every write returns { ok: false, error } instead of throwing. Cache tag 'mind'
 * (src/lib/cache.ts) on reads; every write invalidates it.
 *
 *   loadMindView(userId, now?, opts?)          → MindView (the view is read only while mindOn(today); before that it is
 *                                                the empty view with live: false, and nothing is read). With the rows,
 *                                                storedCount: every check-in the user has, the window or not
 *   countChecks(userId)                        → number (how many check-ins are stored: a count, never a value; never
 *                                                waits for the switch, so the off page can offer Delete all; 0 on any
 *                                                failure)
 *   loadOlderChecksCore(userId, before, now?, opts?) → { ok, value: OlderPage } (the check-ins before the 14-day list,
 *                                                OLDER_PAGE at a time, newest first, strictly before the cursor; refused
 *                                                with MIND_OFF while !mindOn(today))
 *   logCheckCore(userId, raw, now?, opts?)     → { ok, value: LoggedCheck } | { ok: false, error }
 *        raw is untrusted (mind.ts cleanCheckInput checks it again); refused with MIND_OFF while !mindOn(today);
 *        idempotent by clientId: a resend with the same values answers the row the first send wrote (replay: true),
 *        never a second row; a resend with a changed pick (the first send landed but its answer was lost, and the
 *        user moved the pick) updates that one row to the new values and answers it
 *   deleteCheckCore(userId, id)                → { ok, value: { deleted } } (the receipt's Undo and each row's Delete;
 *                                                a row that is already gone is not an error)
 *   deleteAllChecksCore(userId)                → { ok, value: { deleted } } ("Delete all check-ins": every check-in,
 *                                                and the low-pattern card's last hide; the pause stays)
 *   pauseCore(userId, until, now?, opts?)      → { ok, value: { pausedUntil } } (until: the life day check-ins resume,
 *                                                after today and within PAUSE_MAX_DAYS; null resumes now)
 *   dismissLowCore(userId, now?, opts?)        → { ok, value: { lowSeenAt } } (hides the low-pattern card for
 *                                                LOW_REPEAT_DAYS)
 *   isMissingMindTable(err) · mindErrorTag(err) · MIND_NOT_READY
 *
 * Gates. A check-in, a pause, a hide and the older pages wait for MIND_LAUNCH_DAY (opts.launchDay overrides it for the
 * checks). The deletes never wait: the user can always remove what was recorded, and countChecks (a count only) tells
 * the off page there is something to remove. These are user-initiated writes, which (as the weight writes) are not
 * behind lifeWritesEnabled; nothing here writes on its own.
 *
 * A record, never a reward: nothing here touches the ledger or an economy table, and none of the economy files import
 * this. Values stay out of every log line (mindErrorTag logs a code or a class name, never a message, since a Prisma
 * message can quote the values it was given), out of URLs and out of anything Gemini reads: nothing here imports
 * anything that reaches it.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { dateColumn, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import {
  CHECK_TRIGGERS,
  CHECK_VIAS,
  EMPTY_PREFS,
  MIND_OFF,
  OLDER_PAGE,
  cleanCheckInput,
  emptyMindView,
  historyStartOf,
  isCheckId,
  isOlderCursor,
  mindLaunchDayOf,
  mindOn,
  mindViewOf,
  olderFromOf,
  pauseDayError,
  receiptLineOf,
  type CheckInput,
  type CheckTrigger,
  type CheckVia,
  type MindPrefsView,
  type MindView,
  type MoodCheckView,
  type OlderCursor,
  type OlderPage,
} from "./mind";

export type MindResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A logged check-in: the row, its receipt, and whether this was a resend of one already logged. */
export interface LoggedCheck extends MoodCheckView {
  /** 'Logged 14:32 · Calm, content' (mind.ts receiptLineOf). */
  line: string;
  /** True when the clientId had logged this row before with the same values (a retry): nothing was written. */
  replay: boolean;
}

/** The switch for one call: omitted reads MIND_LAUNCH_DAY (and the rehearsal override); the checks pass their own. */
export interface MindCoreOptions {
  launchDay?: DayKey | null;
}

export const MIND_NOT_READY = "Check-ins need a one-time database update first.";
const SAVE_FAILED = "Couldn't save that. Try again.";
const LOAD_FAILED = "Couldn't load those. Try again.";
const NOT_AN_ID = "That check-in isn't here.";
const NOT_A_CURSOR = "Those check-ins aren't here.";

/**
 * At most this many rows a view (the shown weeks at three a day are about 250). The cap keeps the NEWEST rows: a flood
 * (production has no login) can crowd out the oldest weeks' baseline, never today's check-ins, their Deletes or the
 * low pattern's last 7 days.
 */
const READ_MAX = 2000;

/** The tables are not there yet (the migration has not reached this database). */
export function isMissingMindTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*(MoodCheck|MindPrefs)[`"]? does not exist/i.test(message);
}

/** What a log line may say about an error: its Prisma code or its class name, never its message. */
export function mindErrorTag(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (err instanceof Error) return err.name;
  return typeof err;
}

let warnedMissing = false;
/** Logs a failure: a missing table once per process, anything else every time (its tag only). */
function logFailure(label: string, err: unknown): void {
  if (isMissingMindTable(err)) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(`${label}: the mind tables are missing (migration 20270103000000_mind_checks not applied); showing nothing logged.`);
    }
    return;
  }
  console.error(`${label} failed: ${mindErrorTag(err)}`);
}

function writeError(label: string, err: unknown): { ok: false; error: string } {
  logFailure(label, err);
  return { ok: false, error: isMissingMindTable(err) ? MIND_NOT_READY : SAVE_FAILED };
}

const launchOf = (opts: MindCoreOptions | undefined): DayKey | null =>
  opts && opts.launchDay !== undefined ? opts.launchDay : mindLaunchDayOf();

const ROW_SELECT = {
  id: true,
  day: true,
  at: true,
  valence: true,
  energy: true,
  stress: true,
  word: true,
  tags: true,
  trigger: true,
  via: true,
} as const;

type Row = {
  id: string;
  day: Date;
  at: Date;
  valence: number;
  energy: number;
  stress: number | null;
  word: string | null;
  tags: string[] | null;
  trigger: string;
  via: string;
};

/** A stored row as the view holds it; an unknown trigger or via (a newer build's) reads as self or web. */
function viewOfRow(r: Row): MoodCheckView {
  return {
    id: r.id,
    day: keyOfDateColumn(r.day),
    at: r.at.toISOString(),
    valence: r.valence,
    energy: r.energy,
    stress: r.stress,
    word: r.word,
    tags: Array.isArray(r.tags) ? r.tags : [],
    trigger: (CHECK_TRIGGERS as readonly string[]).includes(r.trigger) ? (r.trigger as CheckTrigger) : "self",
    via: (CHECK_VIAS as readonly string[]).includes(r.via) ? (r.via as CheckVia) : "web",
  };
}

function loggedOf(r: Row, replay: boolean): LoggedCheck {
  const view = viewOfRow(r);
  return { ...view, line: receiptLineOf(view), replay };
}

/** The window's rows: the newest READ_MAX, read newest first and returned oldest first. */
async function readChecks(userId: string, from: DayKey, to: DayKey): Promise<MoodCheckView[]> {
  const rows = await prisma.moodCheck.findMany({
    where: { userId, day: { gte: dateColumn(from), lte: dateColumn(to) } },
    orderBy: { at: "desc" },
    take: READ_MAX,
    select: ROW_SELECT,
  });
  return rows.map(viewOfRow).reverse();
}

/** How many check-ins the user has stored, any day: a count, no value selected. */
function countRows(userId: string): Promise<number> {
  return prisma.moodCheck.count({ where: { userId } });
}

async function readPrefs(userId: string): Promise<MindPrefsView> {
  const row = await prisma.mindPrefs.findUnique({ where: { userId }, select: { pausedUntil: true, lowSeenAt: true } });
  if (!row) return EMPTY_PREFS;
  return {
    pausedUntil: row.pausedUntil ? keyOfDateColumn(row.pausedUntil) : null,
    lowSeenAt: row.lowSeenAt ? row.lowSeenAt.toISOString() : null,
  };
}

/**
 * The Mind view for today. Before the launch day nothing is read (live: false). A missing table reads as the empty
 * view with ready: false; any other failed read as the empty view with ready: false and failed: true (logged by its
 * tag): the card says it couldn't load, and Today draws no Check in row, so a pause never fails open.
 */
export async function loadMindView(userId: string, now: Date = new Date(), opts?: MindCoreOptions): Promise<MindView> {
  const today = todayKey(now);
  if (!mindOn(today, launchOf(opts))) return emptyMindView(today, { live: false, ready: false });
  try {
    return await cached(`mindView:${userId}:${today}`, ["mind"], async () => {
      const [checks, prefs, storedCount] = await Promise.all([readChecks(userId, historyStartOf(today), today), readPrefs(userId), countRows(userId)]);
      return mindViewOf(checks, prefs, today, { live: true, ready: true, storedCount });
    });
  } catch (err) {
    logFailure("loadMindView", err);
    return emptyMindView(today, { live: true, ready: false, failed: !isMissingMindTable(err) });
  }
}

/**
 * How many check-ins the user has stored: a count, never a value, so it never waits for the switch (Body › Mind's off
 * page offers "Delete all check-ins" for any kept from before, and the deletes never wait either). Cached under
 * 'mind'; any failure, a missing table included, reads as 0 (logged by its tag).
 */
export async function countChecks(userId: string): Promise<number> {
  try {
    return await cached(`mindCount:${userId}`, ["mind"], () => countRows(userId));
  } catch (err) {
    logFailure("countChecks", err);
    return 0;
  }
}

/**
 * One page of the check-ins before the 14-day list (mind.ts olderFromOf(today)), newest first: OLDER_PAGE at most,
 * strictly before the cursor (its `at`, then its id, for rows logged at the same instant), so every stored check-in
 * can be reached and deleted on its own. Refused while the switch is off, as the view is. Not cached: a page is asked
 * for once, by a tap.
 */
export async function loadOlderChecksCore(
  userId: string,
  before: OlderCursor | null,
  now: Date = new Date(),
  opts?: MindCoreOptions
): Promise<MindResult<OlderPage>> {
  const today = todayKey(now);
  if (!mindOn(today, launchOf(opts))) return { ok: false, error: MIND_OFF };
  if (!isOlderCursor(before)) return { ok: false, error: NOT_A_CURSOR };
  const older = { userId, day: { lt: dateColumn(olderFromOf(today)) } };
  const at = before ? new Date(before.at) : null;
  const where = before && at ? { ...older, OR: [{ at: { lt: at } }, { at, id: { lt: before.id } }] } : older;
  try {
    const rows = await prisma.moodCheck.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: OLDER_PAGE + 1, select: ROW_SELECT });
    return { ok: true, value: { checks: rows.slice(0, OLDER_PAGE).map(viewOfRow), more: rows.length > OLDER_PAGE } };
  } catch (err) {
    logFailure("loadOlderChecksCore", err);
    return { ok: false, error: isMissingMindTable(err) ? MIND_NOT_READY : LOAD_FAILED };
  }
}

async function findByClientId(userId: string, clientId: string): Promise<Row | null> {
  return prisma.moodCheck.findUnique({ where: { userId_clientId: { userId, clientId } }, select: ROW_SELECT });
}

/** The stored row already holds what this send says: the pick, stress, the word and the tags in their order. */
function sameValues(r: Row, c: CheckInput): boolean {
  const tags = Array.isArray(r.tags) ? r.tags : [];
  return r.valence === c.valence && r.energy === c.energy && r.stress === c.stress && r.word === c.word && tags.length === c.tags.length && tags.every((t, i) => t === c.tags[i]);
}

/**
 * A clientId already logged: the same values answer that row (replay: true) and write nothing (a retried request,
 * the phone's queue); a changed pick (the first send landed, its answer was lost, and the user moved the pick before
 * Save again) updates that one row's values and measured time, keeping its instant, day and key, and answers it.
 */
async function answerKnown(userId: string, existing: Row, c: CheckInput): Promise<MindResult<LoggedCheck>> {
  if (sameValues(existing, c)) return { ok: true, value: loggedOf(existing, true) };
  const row = await prisma.moodCheck.update({
    where: { userId_clientId: { userId, clientId: c.clientId } },
    data: { valence: c.valence, energy: c.energy, stress: c.stress, word: c.word, tags: c.tags, tookMs: c.tookMs },
    select: ROW_SELECT,
  });
  invalidate("mind");
  return { ok: true, value: loggedOf(row, false) };
}

/**
 * Logs one check-in. Refused while the switch is off. The input is checked here (cleanCheckInput) whatever the caller
 * checked. A clientId already logged is answered by answerKnown (the same values: that row, replay: true, nothing
 * written; a changed pick: that one row updated); two sends racing on the unique (userId, clientId) end the same way.
 */
export async function logCheckCore(userId: string, raw: unknown, now: Date = new Date(), opts?: MindCoreOptions): Promise<MindResult<LoggedCheck>> {
  if (!mindOn(todayKey(now), launchOf(opts))) return { ok: false, error: MIND_OFF };
  const clean = cleanCheckInput(raw, now);
  if (!clean.ok) return clean;
  const c = clean.value;
  try {
    const existing = await findByClientId(userId, c.clientId);
    if (existing) return await answerKnown(userId, existing, c);
    const row = await prisma.moodCheck.create({
      data: {
        userId,
        day: dateColumn(c.day),
        at: c.at,
        valence: c.valence,
        energy: c.energy,
        stress: c.stress,
        word: c.word,
        tags: c.tags,
        trigger: c.trigger,
        via: c.via,
        promptedAt: c.promptedAt,
        tookMs: c.tookMs,
        clientId: c.clientId,
      },
      select: ROW_SELECT,
    });
    invalidate("mind");
    return { ok: true, value: loggedOf(row, false) };
  } catch (err) {
    // A second send of the same check-in won the unique race: answer the row it wrote.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      try {
        const again = await findByClientId(userId, c.clientId);
        if (again) return await answerKnown(userId, again, c);
      } catch (retryErr) {
        return writeError("logCheckCore", retryErr);
      }
    }
    return writeError("logCheckCore", err);
  }
}

/** Deletes one check-in (the receipt's Undo, or its Delete). One that is already gone is not an error (deleted: 0). */
export async function deleteCheckCore(userId: string, id: string): Promise<MindResult<{ deleted: number }>> {
  if (!isCheckId(id)) return { ok: false, error: NOT_AN_ID };
  try {
    const res = await prisma.moodCheck.deleteMany({ where: { userId, id } });
    invalidate("mind");
    return { ok: true, value: { deleted: res.count } };
  } catch (err) {
    return writeError("deleteCheckCore", err);
  }
}

/**
 * Deletes every check-in, and the low-pattern card's last hide with them (a trace of what they held); the pause stays.
 * One transaction: both or neither.
 */
export async function deleteAllChecksCore(userId: string): Promise<MindResult<{ deleted: number }>> {
  try {
    const [res] = await prisma.$transaction([
      prisma.moodCheck.deleteMany({ where: { userId } }),
      prisma.mindPrefs.updateMany({ where: { userId }, data: { lowSeenAt: null } }),
    ]);
    invalidate("mind");
    return { ok: true, value: { deleted: res.count } };
  } catch (err) {
    return writeError("deleteAllChecksCore", err);
  }
}

/** Pauses check-ins until a life day (they resume on it), or resumes them now (null). The check-ins are kept. */
export async function pauseCore(
  userId: string,
  until: DayKey | null,
  now: Date = new Date(),
  opts?: MindCoreOptions
): Promise<MindResult<{ pausedUntil: DayKey | null }>> {
  const today = todayKey(now);
  if (!mindOn(today, launchOf(opts))) return { ok: false, error: MIND_OFF };
  if (until !== null) {
    const err = pauseDayError(until, today);
    if (err) return { ok: false, error: err };
  }
  const pausedUntil = until === null ? null : dateColumn(until);
  try {
    await prisma.mindPrefs.upsert({ where: { userId }, create: { userId, pausedUntil }, update: { pausedUntil } });
    invalidate("mind");
    return { ok: true, value: { pausedUntil: until } };
  } catch (err) {
    return writeError("pauseCore", err);
  }
}

/** Hides the low-pattern card for LOW_REPEAT_DAYS from now (mind.ts lowPatternOf). Nothing is sent anywhere. */
export async function dismissLowCore(userId: string, now: Date = new Date(), opts?: MindCoreOptions): Promise<MindResult<{ lowSeenAt: string }>> {
  if (!mindOn(todayKey(now), launchOf(opts))) return { ok: false, error: MIND_OFF };
  try {
    await prisma.mindPrefs.upsert({ where: { userId }, create: { userId, lowSeenAt: now }, update: { lowSeenAt: now } });
    invalidate("mind");
    return { ok: true, value: { lowSeenAt: now.toISOString() } };
  } catch (err) {
    return writeError("dismissLowCore", err);
  }
}

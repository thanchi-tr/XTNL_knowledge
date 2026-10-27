/**
 * The check-in on the phone (docs/mobile-api.md POST /checkin and POST /checkin/undo; health-2026-10-27.md D1, D2, D9,
 * phase 2; health-brief-2026-10-27.md §2.4): the write's shape and its answer. Pure: it imports Mind's own rules
 * (mind.ts) and the life day alone, never the economy, a server module or anything that reaches Gemini. The handlers
 * are src/lib/mobile-api-server.ts handleCheckin and handleCheckinUndo; mind-mobile-cores.ts binds Mind's own cores.
 *
 * Where a value may be named on the phone's path (scripts/mind-check.ts pins it): here (the body's fields, passed on to
 * mind-server logCheckCore untouched), and the two check-in route files that hand a request to its handler. Nothing
 * else in the mobile API names one: /check's `checkin` block is counts only (mobile-api.ts checkCheckinOf), and the
 * binding hands back a row's id, life day and instant, never its values.
 *
 *   CHECKIN_KEYS · PHONE_VIAS · PHONE_TRIGGERS · CheckinBody · checkinBodyOf(body, clientId)
 *   LoggedCheckin · checkinReplyOf(logged, body, now)     → { id, day, line, words, undoUntil, duplicate }
 *   checkinUndoReplyOf(id, deleted)                       → { id, deleted, line }
 *
 * The answer's `line` is the receipt's frame with the time alone ("Logged 14:32", as Today's strip says it): safe on
 * any surface, the cover screen, a notification and the lock screen included. `words` are the grid's words for the
 * pick ("Calm, content"); the app shows them only on the main screen's sheet, beside the line ("Logged 14:32 · Calm,
 * content", the web sheet's receipt, mind.ts receiptLineOf). The same words and the same frame for every value: no
 * colour judgement, no praise or shame, nothing about how it compares.
 */
import { LIFE_TZ, type DayKey } from "./life-day";
import { GRID_MAX, GRID_MIN, STRESS_LEVELS, TAGS_MAX, UNDO_MS, cellWordsOf, isGridValue, type CheckTrigger, type CheckVia, type RawCheckInput } from "./mind";

/** POST /checkin's fields (and clientId, which the write frame adds). */
export const CHECKIN_KEYS = ["at", "valence", "energy", "stress", "word", "tags", "trigger", "via", "promptedAt", "tookMs"] as const;

/** The phone's surfaces (MoodCheck_via_check's phone values): the Check screen's row, the cover widget, the tile, a prompt. */
export const PHONE_VIAS = ["check", "widget", "tile", "notify"] as const satisfies readonly CheckVia[];
export type PhoneVia = (typeof PHONE_VIAS)[number];

/** How a phone check-in starts: the user's own tap, or a prompt (phase 6). Close the day is the web's. */
export const PHONE_TRIGGERS = ["prompted", "self"] as const satisfies readonly CheckTrigger[];
export type PhoneTrigger = (typeof PHONE_TRIGGERS)[number];

/** A word or a tag sent longer than this is refused as a shape (the core cleans and cuts each to its own maximum). */
export const CHECKIN_TEXT_MAX = 200;

/** The stress levels' stored range (0..4). */
const STRESS_MAX = STRESS_LEVELS.length - 1;

/** A checked body, as mind-server logCheckCore takes it (RawCheckInput; the core checks every field again). */
export interface CheckinBody extends RawCheckInput {
  at: string;
  valence: number;
  energy: number;
  stress: number | null;
  word: string | null;
  tags: string[];
  trigger: PhoneTrigger;
  via: PhoneVia;
  promptedAt: string | null;
  tookMs: number | null;
  clientId: string;
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const absent = (v: unknown): boolean => v === undefined || v === null;

/** An ISO instant ('2026-10-28T03:12:00.000Z' or with an offset), as the mobile API's instants are. */
function isIso(v: unknown): v is string {
  return typeof v === "string" && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v));
}

/**
 * POST /checkin's body, its shape only (a wrong shape is the route's 400): `at` the phone's own instant (ISO), the grid
 * tap (valence and energy, whole steps from GRID_MIN to GRID_MAX), stress 0..4 or none, a word and up to TAGS_MAX tags
 * (text, each at most CHECKIN_TEXT_MAX), the trigger and the phone's surface, promptedAt (ISO) and tookMs (a whole
 * number of milliseconds) or none, and the clientId (required: the check-in's key). The rules on the values (how old
 * `at` may be, the word's and the tags' cleaning, promptedAt's window, tookMs's range) are mind.ts cleanCheckInput's,
 * in logCheckCore. No error line repeats a value.
 */
export function checkinBodyOf(body: Record<string, unknown>, clientId: string | null): Checked<CheckinBody> {
  const fail = (error: string): Checked<CheckinBody> => ({ ok: false, error });
  if (!clientId) return fail("clientId is required here (a UUID): it is the check-in's key, so a retry logs it once.");
  if (!isIso(body.at)) return fail("at must be an ISO instant: when the check-in was made.");
  const steps = `a whole number from ${GRID_MIN} to ${GRID_MAX}`;
  if (!isGridValue(body.valence)) return fail(`valence must be ${steps}.`);
  if (!isGridValue(body.energy)) return fail(`energy must be ${steps}.`);
  const stress = body.stress;
  if (!absent(stress) && (typeof stress !== "number" || !Number.isInteger(stress) || stress < 0 || stress > STRESS_MAX)) return fail(`stress must be a whole number from 0 to ${STRESS_MAX}, or left out.`);
  const word = body.word;
  if (!absent(word) && (typeof word !== "string" || word.length > CHECKIN_TEXT_MAX)) return fail(`word must be text of at most ${CHECKIN_TEXT_MAX} characters, or left out.`);
  const tags = body.tags;
  if (!absent(tags) && (!Array.isArray(tags) || tags.length > TAGS_MAX || tags.some((t) => typeof t !== "string" || t.length > CHECKIN_TEXT_MAX))) {
    return fail(`tags must be a list of at most ${TAGS_MAX} texts, or left out.`);
  }
  const trigger = body.trigger;
  if (typeof trigger !== "string" || !(PHONE_TRIGGERS as readonly string[]).includes(trigger)) return fail("trigger must be 'self' or 'prompted'.");
  const via = body.via;
  if (typeof via !== "string" || !(PHONE_VIAS as readonly string[]).includes(via)) return fail("via must be 'check', 'widget', 'tile' or 'notify'.");
  const promptedAt = body.promptedAt;
  if (!absent(promptedAt) && !isIso(promptedAt)) return fail("promptedAt must be an ISO instant, or left out.");
  const tookMs = body.tookMs;
  if (!absent(tookMs) && (typeof tookMs !== "number" || !Number.isInteger(tookMs) || tookMs < 0)) return fail("tookMs must be a whole number of milliseconds, or left out.");
  return {
    ok: true,
    value: {
      at: body.at,
      valence: body.valence,
      energy: body.energy,
      stress: absent(stress) ? null : (stress as number),
      word: absent(word) ? null : (word as string),
      tags: absent(tags) ? [] : [...(tags as string[])],
      trigger: trigger as PhoneTrigger,
      via: via as PhoneVia,
      promptedAt: absent(promptedAt) ? null : (promptedAt as string),
      tookMs: absent(tookMs) ? null : (tookMs as number),
      clientId,
    },
  };
}

/** What the binding hands back of a logged check-in: never a value (mind-mobile-cores.ts narrows logCheckCore's row). */
export interface LoggedCheckin {
  id: string;
  day: DayKey;
  /** ISO: the instant it was booked at (the phone's own, or the server's clock for one a few minutes ahead). */
  at: string;
  /** A resend of a clientId already logged with the same values: nothing was written. */
  replay: boolean;
}

const clock = new Intl.DateTimeFormat("en-AU", { timeZone: LIFE_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** 'HH:MM' on a 24-hour clock in the life zone (mind.ts receiptLineOf's own clock). */
function clockOf(at: string): string {
  const parts = clock.formatToParts(new Date(at));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/**
 * POST /checkin's answer: the row's id (what POST /checkin/undo names) and life day; `line` the receipt's frame with the
 * time alone, safe on any surface; `words` the grid's words for the pick, for the main screen's sheet only;
 * `undoUntil` when the receipt stops offering Undo (UNDO_MS from this answer, the web receipt's); `duplicate` for a
 * resend the core had already logged with the same values (nothing was written).
 */
export function checkinReplyOf(logged: LoggedCheckin, body: Pick<CheckinBody, "valence" | "energy">, now: Date) {
  return {
    id: logged.id,
    day: logged.day,
    line: `Logged ${clockOf(logged.at)}`,
    words: cellWordsOf(body.valence, body.energy),
    undoUntil: new Date(now.getTime() + UNDO_MS).toISOString(),
    duplicate: logged.replay,
  };
}

/** POST /checkin/undo's answer, in the Today strip's words: "Check-in taken back." (or "Already deleted." for one gone). */
export function checkinUndoReplyOf(id: string, deleted: number) {
  return { id, deleted: deleted > 0 ? 1 : 0, line: deleted > 0 ? "Check-in taken back." : "Already deleted." };
}

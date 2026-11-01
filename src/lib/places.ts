/**
 * Places: the location check-in's rules (the user's request of 2026-11-01: a photo, star ratings for service, food,
 * premises and parking, and a short summary, in a section of its own). Pure and client-safe: no database, no network,
 * nothing that reaches Gemini. src/lib/places-server.ts is the only reader and writer; the components and the fixtures
 * read the views it builds.
 *
 *   cleanVisitInput(raw, now?)       → { ok, value: VisitInput } | { ok: false, error }   the one gate every save goes
 *                                      through (the server checks again whatever the form checked)
 *   placeKeyOf(name) · foldText(s)   the name folded for grouping and search: case, spacing, accents (and the curly
 *                                      quotes and dashes a phone keyboard types)
 *   overallOf(ratings)               the mean of the given ratings to one decimal; null when none is given. Derived on
 *                                      read, never stored
 *   averageOf(visits)                a place's average: the mean of its visits' overalls, to one decimal
 *   placesListOf(visits)             the list's entries, newest first: a place visited once is its visit, a place
 *                                      visited more than once is one entry with its visits, their count and average
 *   filterVisits(visits, query)      the search box (folded, every word must match the name, address or summary)
 *   searchListOf(visits, query)      the list under a search: grouped first, then the places with any matching visit
 *                                      kept, so a place's count and average are always all of its visits
 *   photoOf(bytes, kind)             an uploaded image checked from its own bytes: JPEG or WebP, its pixels read from
 *                                      the file, within FULL_EDGE / THUMB_EDGE and the byte caps, and any metadata
 *                                      segment left in a JPEG dropped (stripJpegMetadata), so no GPS EXIF is stored
 *   photoPlanOf(ords, keep)          an edit's photo moves: the removed ones, and the kept ones closed up from 0
 *   cleanPhotoIds(raw)               the stored photos an edit removes, named by their full image's id (never by a
 *                                      place, which an edit renumbers), so a retried edit removes nothing more
 *   wallInputOf · instantOfWallInput the form's date and time (a datetime-local value) in the life zone, both ways
 *   instantsOfWallInput              every instant a wall time names (two in the hour a fall-back repeats)
 *   dayWordsOf · whenLineOf · …      the copy
 *
 * A record, never a reward: nothing here pays, and nothing in the economy imports it.
 */
import { LIFE_TZ, dayKeyOf, zonedToInstant, type DayKey } from "./life-day";

export type PlacesResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ── Paths ───────────────────────────────────────────────────────────────

export const PLACES_PATH = "/places";
export const PLACES_NEW_PATH = "/places/new";
/** Where photos are uploaded (POST) and, with an id, served (GET). */
export const PHOTO_PATH = "/places/photo";

export function visitHref(id: string): string {
  return `${PLACES_PATH}/${id}`;
}
export function editHref(id: string): string {
  return `${PLACES_PATH}/${id}/edit`;
}
export function photoSrcOf(id: string): string {
  return `${PHOTO_PATH}/${id}`;
}

// ── Limits ──────────────────────────────────────────────────────────────

export const NAME_MAX = 80;
export const ADDRESS_MAX = 160;
export const SUMMARY_MAX = 280;
/** A folded name can be longer than the name (a ligature folds to two letters). */
export const KEY_MAX = 160;
/** Metres; a reading less accurate than this is no location. */
export const ACCURACY_MAX = 100_000;
/** A visit is from this year on (on the life zone's own clock), and no later than now plus the skew (a phone's clock a little ahead). */
export const VISITED_FLOOR_YEAR = 2000;
export const VISITED_SKEW_MS = 10 * 60_000;

export const RATING_KEYS = ["service", "food", "premises", "parking"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export type Ratings = Record<RatingKey, number | null>;
export const RATING_LABELS: Readonly<Record<RatingKey, string>> = { service: "Service", food: "Food", premises: "Premises", parking: "Parking" };
export const RATING_MIN = 1;
export const RATING_MAX = 5;
/** What a number of stars says, beside the stars (never on its own). */
export const RATING_WORDS: Readonly<Record<number, string>> = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very good", 5: "Excellent" };
export const NOT_RATED = "Not rated";
export const NO_RATINGS: Ratings = { service: null, food: null, premises: null, parking: null };

export const PHOTOS_MAX = 4;
export const PHOTO_KINDS = ["full", "thumb"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];
export const PHOTO_MIMES = ["image/jpeg", "image/webp"] as const;
export type PhotoMime = (typeof PHOTO_MIMES)[number];
/** The long edge, in pixels, of a stored photo and of its thumbnail. */
export const FULL_EDGE = 1600;
export const THUMB_EDGE = 480;
/** The byte caps: 1.5 MB a photo, 256 KB a thumbnail. */
export const FULL_MAX_BYTES = 1_572_864;
export const THUMB_MAX_BYTES = 262_144;
/** The browser's re-encode: JPEG at these qualities (lower steps only when a photo is still over its cap). */
export const JPEG_QUALITY = 0.82;
export const THUMB_QUALITY = 0.75;
/** One upload: a photo, its thumbnail and the multipart framing around them. */
export const UPLOAD_MAX_BYTES = FULL_MAX_BYTES + THUMB_MAX_BYTES + 65_536;

// ── Copy ────────────────────────────────────────────────────────────────

export const PLACES_NOT_READY = "Places need a one-time database update first.";
export const PLACES_LOAD_FAILED = "Couldn't load your places. Try again.";
export const PLACES_EMPTY = "No visits yet. Check in at a place to keep its photos, ratings and a few words.";
export const SAVE_FAILED = "Couldn't save that. Try again.";
export const VISIT_GONE = "That visit isn't here.";
export const NAME_NEEDED = "Name the place.";
export const NAME_TOO_LONG = `Keep the name to ${NAME_MAX} characters.`;
export const ADDRESS_TOO_LONG = `Keep the address to ${ADDRESS_MAX} characters.`;
export const SUMMARY_TOO_LONG = `Keep the summary to ${SUMMARY_MAX} characters.`;
export const RATING_BAD = `Pick 1 to ${RATING_MAX} stars, or ${NOT_RATED}.`;
export const LOCATION_BAD = "That location couldn't be read. Tap Use my location again.";
export const WHEN_NEEDED = "Pick when you were there.";
export const WHEN_LATER = "That time is later than now. Pick when you were there.";
export const WHEN_EARLY = "Pick a time from the year 2000 on.";
export const PHOTO_NOT_IMAGE = "That photo couldn't be read. Try a JPEG or WebP image.";
export const PHOTO_TOO_BIG = `That photo is over ${FULL_MAX_BYTES / 1_048_576} MB after resizing.`;
export const PHOTO_TOO_WIDE = `That photo is over ${FULL_EDGE} px.`;
export const THUMB_TOO_BIG = `That thumbnail is over ${THUMB_MAX_BYTES / 1024} KB.`;
export const THUMB_TOO_WIDE = `That thumbnail is over ${THUMB_EDGE} px.`;
export const PHOTO_METADATA = "That photo still carries its metadata. Pick it again.";
export const PHOTO_SLOT_BAD = `A visit holds up to ${PHOTOS_MAX} photos.`;

// ── Text ────────────────────────────────────────────────────────────────

/** A surrogate pair, or a surrogate on its own (no `u` flag: it matches the UTF-16 code units themselves). */
const SURROGATES = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

/** A lone surrogate as U+FFFD (the database refuses one), then NFC. */
function wellFormed(raw: string): string {
  return raw.replace(SURROGATES, (s) => (s.length === 2 ? s : "�")).normalize("NFC");
}

/**
 * The invisible format characters a paste can carry (from a maps app, a web page): the soft hyphen, the zero-width
 * space, the direction marks, embeddings and isolates, and the invisible operators. U+FEFF is already a space to `\s`.
 * The zero-width joiner and non-joiner stay: an emoji sequence and some scripts need them.
 */
const INVISIBLE = /[­​‎‏‪-‮⁠-⁤⁦-⁩]/g;

/** The text with those invisible characters removed (the form's own "Name the place" test uses it too). */
export function stripInvisible(raw: string): string {
  return raw.replace(INVISIBLE, "");
}

/**
 * One line (a name, an address): well formed, the invisible format characters removed, control characters and runs
 * of space as one space, trimmed. Over `max` UTF-16 units (the input's own maxLength, which the database's character
 * count never exceeds) is an error, never a silent cut. Empty is null, so a name of only a zero-width space is none.
 */
export function cleanLine(raw: unknown, max: number, tooLong: string): PlacesResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: SAVE_FAILED };
  const t = stripInvisible(wellFormed(raw)).replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (t.length > max) return { ok: false, error: tooLong };
  return { ok: true, value: t.length > 0 ? t : null };
}

/**
 * The summary: plain text that keeps its line breaks (CRLF as LF, at most one blank line in a row), the invisible
 * format characters removed, every other control character and run of space as one space, each line trimmed. Over
 * SUMMARY_MAX is an error. Empty is null.
 */
export function cleanSummary(raw: unknown): PlacesResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: SAVE_FAILED };
  const t = stripInvisible(wellFormed(raw))
    .replace(/\r\n?/g, "\n")
    .replace(/(?!\n)\p{Cc}/gu, " ")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length > SUMMARY_MAX) return { ok: false, error: SUMMARY_TOO_LONG };
  return { ok: true, value: t.length > 0 ? t : null };
}

/** The summary's first line (the list's card shows it), or null. */
export function firstLineOf(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const line = summary.split("\n").find((l) => l.trim().length > 0);
  return line ? line.trim() : null;
}

/** The lower-case letters with no decomposition, as the letters they are typed as without their marks. */
const UNMARKED: Readonly<Record<string, string>> = { "đ": "d", "ð": "d", "ø": "o", "ł": "l", "æ": "ae", "œ": "oe", "ß": "ss", "ı": "i", "þ": "th" };

/**
 * Text folded for grouping and search: lower case first (so the dot 'İ' gains is a mark too), NFKD with every
 * combining mark dropped, the letters with no decomposition as plain ones (đ ð ø ł æ œ ß ı þ: 'Phở Đức' and 'Pho Duc'
 * are one), every format character dropped (a pasted direction mark or zero-width space never splits a key), the
 * curly quotes and dashes a phone keyboard types as plain ones, every run of space as one, trimmed. 'Café  Lumen',
 * 'cafe lumen' and 'CAFÉ LUMEN' fold to one. Never displayed.
 */
export function foldText(raw: string): string {
  return wellFormed(raw)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[đðøłæœßıþ]/g, (c) => UNMARKED[c] ?? c)
    .replace(/\p{Cf}/gu, "")
    .replace(/[‘’‚‛ʼ`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A place's key: its folded name, at most KEY_MAX units (a dangling high surrogate dropped), never empty for a name. */
export function placeKeyOf(name: string): string {
  const key = foldText(name).slice(0, KEY_MAX).replace(/[\uD800-\uDBFF]$/, "");
  if (key.length > 0) return key;
  return wellFormed(name).toLowerCase().trim().slice(0, KEY_MAX).replace(/[\uD800-\uDBFF]$/, "") || "?";
}

// ── Ratings ─────────────────────────────────────────────────────────────

/** One rating: a whole 1..5, or null ("Not rated"; 0, null and undefined all say it). Anything else is undefined. */
export function cleanRating(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === 0) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < RATING_MIN || v > RATING_MAX) return undefined;
  return v;
}

/** The four ratings, each cleaned; one that isn't a rating is an error (never read as Not rated). */
export function cleanRatings(raw: unknown): PlacesResult<Ratings> {
  if (raw === null || raw === undefined) return { ok: true, value: { ...NO_RATINGS } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: RATING_BAD };
  const r = raw as Record<string, unknown>;
  const out: Ratings = { ...NO_RATINGS };
  for (const k of RATING_KEYS) {
    const v = cleanRating(r[k]);
    if (v === undefined) return { ok: false, error: RATING_BAD };
    out[k] = v;
  }
  return { ok: true, value: out };
}

/** The ratings given (never Not rated), in RATING_KEYS order. */
export function givenRatings(r: Ratings): number[] {
  return RATING_KEYS.map((k) => r[k]).filter((v): v is number => typeof v === "number");
}

/** The overall: the mean of the given ratings to one decimal (half up: 4.25 is 4.3), or null when none is given. */
export function overallOf(r: Ratings): number | null {
  const given = givenRatings(r);
  if (given.length === 0) return null;
  const sum = given.reduce((a, b) => a + b, 0);
  return Math.round((sum * 10) / given.length) / 10;
}

/** The unrounded mean of the given ratings (a place's average is the mean of these), or null. */
function meanOf(r: Ratings): number | null {
  const given = givenRatings(r);
  return given.length === 0 ? null : given.reduce((a, b) => a + b, 0) / given.length;
}

/** A place's average: the mean of its rated visits' overalls (unrounded), to one decimal; null when none is rated. */
export function averageOf(visits: readonly { ratings: Ratings }[]): number | null {
  const means = visits.map((v) => meanOf(v.ratings)).filter((m): m is number => m !== null);
  if (means.length === 0) return null;
  const mean = means.reduce((a, b) => a + b, 0) / means.length;
  return Math.round(mean * 10 + 1e-9) / 10;
}

/** '4.3' (always one decimal), the way every overall and average is shown. */
export function scoreText(score: number): string {
  return score.toFixed(1);
}

/** The stars' accessible name: '4.3 out of 5', '4 out of 5 stars, Very good' for one rating, or 'Not rated'. */
export function starsLabelOf(score: number | null, whole = false): string {
  if (score === null) return NOT_RATED;
  if (whole) return `${score} out of ${RATING_MAX} stars, ${RATING_WORDS[score] ?? ""}`.replace(/, $/, "");
  return `${scoreText(score)} out of ${RATING_MAX}`;
}

/** '3 visits · average 4.2', or '3 visits' when none is rated. */
export function visitsLineOf(count: number, average: number | null): string {
  const visits = count === 1 ? "1 visit" : `${count} visits`;
  return average === null ? visits : `${visits} · average ${scoreText(average)}`;
}

/** '3 visits in all · average 3.8': a visit's page, over its other visits, counts this one too and says so. */
export function visitsInAllLineOf(count: number, average: number | null): string {
  const visits = count === 1 ? "1 visit in all" : `${count} visits in all`;
  return average === null ? visits : `${visits} · average ${scoreText(average)}`;
}

// ── Location ────────────────────────────────────────────────────────────

export interface PlaceLocation {
  lat: number;
  lng: number;
  /** Whole metres; null when the reading gave none. */
  accuracyM: number | null;
}

/** A location from a "Use my location" tap: lat −90..90, lng −180..180 (to 6 decimals), accuracy 0..ACCURACY_MAX m. */
export function cleanLocation(raw: unknown): PlacesResult<PlaceLocation | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: LOCATION_BAD };
  const r = raw as Record<string, unknown>;
  const { lat, lng, accuracyM } = r;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: LOCATION_BAD };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, error: LOCATION_BAD };
  let acc: number | null = null;
  if (accuracyM !== null && accuracyM !== undefined) {
    if (typeof accuracyM !== "number" || !Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > ACCURACY_MAX) return { ok: false, error: LOCATION_BAD };
    acc = Math.round(accuracyM);
  }
  const six = (n: number) => Math.round(n * 1e6) / 1e6;
  return { ok: true, value: { lat: six(lat), lng: six(lng), accuracyM: acc } };
}

/** '-33.868800, 151.209300 · within 12 m'. */
export function locationLineOf(loc: PlaceLocation): string {
  const at = `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
  return loc.accuracyM === null ? at : `${at} · within ${loc.accuracyM} m`;
}

/** A geo: link (Android opens a maps app; nothing is sent to a web service by the link itself). */
export function geoHrefOf(loc: PlaceLocation): string {
  return `geo:${loc.lat},${loc.lng}`;
}

// ── When ────────────────────────────────────────────────────────────────

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

const WALL = new Map<string, Intl.DateTimeFormat>();
function wallFormatter(tz: string): Intl.DateTimeFormat {
  let f = WALL.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    WALL.set(tz, f);
  }
  return f;
}

interface Wall {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}

function wallOf(instant: Date, tz: string): Wall {
  const p: Record<string, number> = {};
  for (const part of wallFormatter(tz).formatToParts(instant)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute };
}

/** The form's date and time for an instant: a datetime-local value ('2026-11-01T13:05') on the life zone's wall clock. */
export function wallInputOf(instant: Date, tz: string = LIFE_TZ): string {
  const w = wallOf(instant, tz);
  return `${pad(w.y, 4)}-${pad(w.m)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`;
}

/**
 * The instant a datetime-local value names on the life zone's wall clock, or null for anything that isn't one (a
 * date that doesn't exist, 24:00, seconds are allowed and dropped). Zones move their clocks on the hour, so the minutes
 * add to the hour's instant.
 */
export function instantOfWallInput(value: unknown, tz: string = LIFE_TZ): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const at = new Date(zonedToInstant(y, mo, d, h, tz).getTime() + mi * 60_000);
  return Number.isFinite(at.getTime()) ? at : null;
}

/**
 * Every instant a datetime-local value names on the life zone's wall clock, ascending: the one instantOfWallInput
 * finds, and the instant an hour either side of it when that reads the same wall time (the hour a fall-back night
 * repeats, 02:00–02:59 in Sydney in April, names two). A time that exists once is one; one that isn't a value, none.
 */
export function instantsOfWallInput(value: unknown, tz: string = LIFE_TZ): Date[] {
  const at = instantOfWallInput(value, tz);
  if (!at) return [];
  const wall = (value as string).trim().slice(0, 16);
  const out = [at];
  for (const shift of [-3_600_000, 3_600_000]) {
    const other = new Date(at.getTime() + shift);
    if (wallInputOf(other, tz) === wall) out.push(other);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function weekdayIndex(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** 'Today', 'Yesterday', 'Sat 31 Oct', or 'Sat 31 Oct 2025' in another year: a life day against today's. */
export function dayWordsOf(day: DayKey, today: DayKey): string {
  if (day === today) return "Today";
  const [ty, tm, td] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10);
  if (day === yesterday) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  const short = `${WEEKDAYS[weekdayIndex(y, m, d)].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
  return y === ty ? short : `${short} ${y}`;
}

/** 'Last visit yesterday', 'Last visit today', 'Last visit Sat 31 Oct': a place's newest visit on its grouped card. */
export function lastVisitLineOf(day: DayKey, today: DayKey): string {
  const w = dayWordsOf(day, today);
  return `Last visit ${w === "Today" || w === "Yesterday" ? w.toLowerCase() : w}`;
}

/** 'Saturday 31 October 2026, 13:05': the visit's own wall date and time in the life zone. */
export function whenLineOf(at: string | Date, tz: string = LIFE_TZ): string {
  const instant = typeof at === "string" ? new Date(at) : at;
  if (!Number.isFinite(instant.getTime())) return "";
  const w = wallOf(instant, tz);
  return `${WEEKDAYS[weekdayIndex(w.y, w.m, w.d)]} ${w.d} ${MONTHS[w.m - 1]} ${w.y}, ${pad(w.h)}:${pad(w.mi)}`;
}

// ── The input ───────────────────────────────────────────────────────────

/** A save's key: a UUID the form makes once per check-in and sends again on every retry. */
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export function isClientId(v: unknown): v is string {
  return typeof v === "string" && CLIENT_ID_RE.test(v);
}

/** A row id (a cuid): what the visit's page, Edit, Delete and the photo route accept. */
export function isVisitId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
}

/** A visit as the server stores it (every field checked). */
export interface VisitInput {
  placeName: string;
  placeKey: string;
  address: string | null;
  location: PlaceLocation | null;
  visitedAt: Date;
  /** The life day of visitedAt (life-day.ts dayKeyOf). */
  day: DayKey;
  ratings: Ratings;
  summary: string | null;
  clientId: string;
}

/**
 * Every save's gate. `raw` is untrusted: placeName (required, 1..NAME_MAX), address (optional, ≤ ADDRESS_MAX), location
 * (optional), visitedLocal (a datetime-local value on the life zone's clock: from the year 2000 on that clock, to now
 * plus VISITED_SKEW_MS; of the two instants a fall-back hour names, the later one that isn't in the future), ratings
 * (each 1..5 or Not rated), summary (optional, ≤ SUMMARY_MAX) and clientId. The life day is the server's own reading
 * of visitedAt. No error line repeats what was typed.
 */
export function cleanVisitInput(raw: unknown, now: Date = new Date(), tz: string = LIFE_TZ): PlacesResult<VisitInput> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: SAVE_FAILED };
  const r = raw as Record<string, unknown>;
  if (!isClientId(r.clientId)) return { ok: false, error: SAVE_FAILED };
  const name = cleanLine(r.placeName, NAME_MAX, NAME_TOO_LONG);
  if (!name.ok) return name;
  if (name.value === null) return { ok: false, error: NAME_NEEDED };
  const address = cleanLine(r.address, ADDRESS_MAX, ADDRESS_TOO_LONG);
  if (!address.ok) return address;
  const location = cleanLocation(r.location);
  if (!location.ok) return location;
  const candidates = instantsOfWallInput(r.visitedLocal, tz);
  if (candidates.length === 0) return { ok: false, error: WHEN_NEEDED };
  const allowed = candidates.filter((c) => c.getTime() <= now.getTime() + VISITED_SKEW_MS);
  if (allowed.length === 0) return { ok: false, error: WHEN_LATER };
  const visitedAt = allowed[allowed.length - 1];
  if (visitedAt.getTime() < zonedToInstant(VISITED_FLOOR_YEAR, 1, 1, 0, tz).getTime()) return { ok: false, error: WHEN_EARLY };
  const ratings = cleanRatings(r.ratings);
  if (!ratings.ok) return ratings;
  const summary = cleanSummary(r.summary);
  if (!summary.ok) return summary;
  return {
    ok: true,
    value: {
      placeName: name.value,
      placeKey: placeKeyOf(name.value),
      address: address.value,
      location: location.value,
      visitedAt,
      day: dayKeyOf(visitedAt, tz),
      ratings: ratings.value,
      summary: summary.value,
      clientId: r.clientId,
    },
  };
}

// ── The views ───────────────────────────────────────────────────────────

/** One stored image as the pages draw it: its id, where it is served, its pixels. */
export interface PhotoImage {
  id: string;
  src: string;
  width: number;
  height: number;
}

/** One of a visit's photos: its place (0..3), the full image and its thumbnail. */
export interface VisitPhoto {
  ord: number;
  full: PhotoImage;
  thumb: PhotoImage | null;
}

/** One visit as the list, the visit's page and the form read it. */
export interface VisitView {
  id: string;
  placeName: string;
  placeKey: string;
  address: string | null;
  location: PlaceLocation | null;
  /** ISO instant. */
  visitedAt: string;
  day: DayKey;
  ratings: Ratings;
  /** overallOf(ratings): derived, never stored. */
  overall: number | null;
  summary: string | null;
  photoCount: number;
  /** The first photo's thumbnail (the list never loads a full image). */
  thumb: PhotoImage | null;
}

export interface PlacesView {
  /** False while the tables are missing (or the read failed: `failed`). */
  ready: boolean;
  failed: boolean;
  today: DayKey;
  /** Newest first. */
  visits: VisitView[];
}

export interface VisitDetail {
  ready: boolean;
  failed: boolean;
  today: DayKey;
  /** Null when there is no such visit. */
  visit: VisitView | null;
  /** In their order (ord). */
  photos: VisitPhoto[];
  /** The other visits to the same place (its placeKey), newest first. */
  others: VisitView[];
}

export function emptyPlacesView(today: DayKey, opts: { ready: boolean; failed?: boolean }): PlacesView {
  return { ready: opts.ready, failed: opts.failed === true, today, visits: [] };
}

export function emptyVisitDetail(today: DayKey, opts: { ready: boolean; failed?: boolean }): VisitDetail {
  return { ready: opts.ready, failed: opts.failed === true, today, visit: null, photos: [], others: [] };
}

/** Newest first: by visitedAt, then by id (two visits at one instant keep one order). */
export function byNewest(a: VisitView, b: VisitView): number {
  if (a.visitedAt !== b.visitedAt) return a.visitedAt < b.visitedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** One entry of the list: a place visited once is its visit; a place visited more than once is one grouped entry. */
export type ListEntry =
  | { kind: "visit"; key: string; visit: VisitView }
  | { kind: "place"; key: string; placeName: string; placeKey: string; latest: VisitView; visits: VisitView[]; count: number; average: number | null };

/**
 * The list's entries, newest first: each place's position is its newest visit's. A place visited more than once (one
 * placeKey) is one entry named by its newest visit, with every visit newest first, their count and their average.
 */
export function placesListOf(visits: readonly VisitView[]): ListEntry[] {
  const sorted = [...visits].sort(byNewest);
  const byKey = new Map<string, VisitView[]>();
  for (const v of sorted) {
    const list = byKey.get(v.placeKey);
    if (list) list.push(v);
    else byKey.set(v.placeKey, [v]);
  }
  const out: ListEntry[] = [];
  for (const [key, list] of byKey) {
    const latest = list[0];
    if (list.length === 1) out.push({ kind: "visit", key: `v:${latest.id}`, visit: latest });
    else out.push({ kind: "place", key: `p:${key}`, placeName: latest.placeName, placeKey: key, latest, visits: list, count: list.length, average: averageOf(list) });
  }
  return out;
}

/** The search box: every folded word must be in the visit's folded name, address or summary. An empty query is all. */
export function filterVisits(visits: readonly VisitView[], query: string): VisitView[] {
  const words = foldText(query).split(" ").filter((w) => w.length > 0);
  if (words.length === 0) return [...visits];
  return visits.filter((v) => {
    const hay = foldText([v.placeName, v.address ?? "", v.summary ?? ""].join(" \n "));
    return words.every((w) => hay.includes(w));
  });
}

/**
 * The list under a search: every visit grouped first (placesListOf), then each entry kept when any of its visits
 * matches (filterVisits). A place's count, average and newest visit are always all of its visits, whatever the query.
 */
export function searchListOf(visits: readonly VisitView[], query: string): ListEntry[] {
  const all = placesListOf(visits);
  const hit = new Set(filterVisits(visits, query).map((v) => v.id));
  return all.filter((e) => (e.kind === "visit" ? hit.has(e.visit.id) : e.visits.some((v) => hit.has(v.id))));
}

/** The known places for the form's suggestions: each place's newest name, newest first, at most `max`. */
export function knownPlacesOf(visits: readonly VisitView[], max = 50): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...visits].sort(byNewest)) {
    if (seen.has(v.placeKey)) continue;
    seen.add(v.placeKey);
    out.push(v.placeName);
    if (out.length >= max) break;
  }
  return out;
}

// ── The form's draft ────────────────────────────────────────────────────

/** What the form starts from: blank (a new check-in, its time now) or a visit (Edit). */
export interface PlaceDraft {
  placeName: string;
  address: string;
  location: PlaceLocation | null;
  visitedLocal: string;
  ratings: Ratings;
  summary: string;
  /** The visit's stored photos (Edit). */
  photos: VisitPhoto[];
}

export function blankDraft(now: Date, tz: string = LIFE_TZ): PlaceDraft {
  return { placeName: "", address: "", location: null, visitedLocal: wallInputOf(now, tz), ratings: { ...NO_RATINGS }, summary: "", photos: [] };
}

export function draftOfVisit(visit: VisitView, photos: readonly VisitPhoto[], tz: string = LIFE_TZ): PlaceDraft {
  return {
    placeName: visit.placeName,
    address: visit.address ?? "",
    location: visit.location,
    visitedLocal: wallInputOf(new Date(visit.visitedAt), tz),
    ratings: { ...visit.ratings },
    summary: visit.summary ?? "",
    photos: [...photos].sort((a, b) => a.ord - b.ord),
  };
}

/** How long a text is as the limits count it (UTF-16 units, the input's own maxLength). */
export function lengthOf(s: string): number {
  return s.length;
}

// ── Photos: the edit's moves ────────────────────────────────────────────

/**
 * The stored photos an edit removes, named by their full image's id (an id never changes when an edit closes the
 * places up, so a retried edit, or one from a page drawn before another tab's edit, removes nothing it didn't name):
 * strings that can be a row id, each once, at most PHOTOS_MAX. Anything else is dropped.
 */
export function cleanPhotoIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => isVisitId(v)))].slice(0, PHOTOS_MAX);
}

/** Places as a plan reads them: whole 0..3, each once, ascending. Anything else is dropped. */
function cleanOrds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < PHOTOS_MAX);
  return [...new Set(ok)].sort((a, b) => a - b);
}

export interface PhotoPlan {
  /** The places whose photos the edit removes. */
  remove: number[];
  /** The kept photos closed up from 0, ascending (so no move lands on a place still taken). */
  moves: { from: number; to: number }[];
  /** How many photos the visit keeps: new ones go at this place and after. */
  count: number;
}

/** An edit's photo moves: the stored places not kept are removed, and the kept ones close up from 0 in their order. */
export function photoPlanOf(stored: readonly number[], keep: readonly number[]): PhotoPlan {
  const have = [...new Set(stored)].sort((a, b) => a - b);
  const kept = cleanOrds(keep).filter((o) => have.includes(o));
  const remove = have.filter((o) => !kept.includes(o));
  const moves = kept.map((from, to) => ({ from, to })).filter((m) => m.from !== m.to);
  return { remove, moves, count: kept.length };
}

/** A photo's size inside a long edge, its shape kept (never enlarged): the browser's resize and the server's check. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// ── Photos: the bytes ───────────────────────────────────────────────────

export interface ImageInfo {
  mime: PhotoMime;
  width: number;
  height: number;
}

/** A JPEG's size from its frame header (any SOF marker), or null when the file isn't a readable JPEG. */
function jpegInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    while (i + 1 < b.length && b[i + 1] === 0xff) i++;
    const m = b[i + 1];
    if (m === 0xd9 || m === 0xda) return null;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 3 >= b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (sof) {
      if (len < 7) return null;
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return width > 0 && height > 0 ? { mime: "image/jpeg", width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** A marker segment that carries metadata (EXIF and GPS in APP1, XMP, ICC, maker notes, comments): never stored. */
function isMetadataMarker(m: number): boolean {
  // APP1..APP15 except APP14 (Adobe's colour transform, which decoding needs); COM. APP0 (JFIF) stays.
  return (m >= 0xe1 && m <= 0xef && m !== 0xee) || m === 0xfe;
}

/**
 * The JPEG with every metadata segment dropped (stripJpegMetadata), its scans and tables kept byte for byte and
 * anything after the end marker cut; null when it isn't a whole, readable JPEG. A browser's canvas re-encode carries
 * none already; this holds the rule for any client.
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let sawFrame = false;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    while (i + 1 < b.length && b[i + 1] === 0xff) i++;
    if (i + 1 >= b.length) return null;
    const m = b[i + 1];
    if (m === 0xd9) {
      parts.push(b.subarray(i, i + 2));
      if (!sawFrame) return null;
      const total = parts.reduce((n, p) => n + p.length, 0);
      const out = new Uint8Array(total);
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
      return out;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 3 >= b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) sawFrame = true;
    if (!isMetadataMarker(m)) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
    if (m === 0xda) {
      // The entropy-coded scan runs to the next marker that is neither a stuffed 0xFF00 nor a restart marker.
      const start = i;
      while (i < b.length) {
        if (b[i] === 0xff && i + 1 < b.length) {
          const next = b[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i += 2;
            continue;
          }
          if (next === 0xff) {
            i += 1;
            continue;
          }
          break;
        }
        i++;
      }
      parts.push(b.subarray(start, i));
    }
  }
  return null;
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...Array.from(b.subarray(at, at + n)));
const le32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** A WebP's size (VP8, VP8L or VP8X) and whether it carries EXIF or XMP; null when it isn't a readable WebP. */
function webpInfo(b: Uint8Array): (ImageInfo & { metadata: boolean }) | null {
  if (b.length < 20 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  let i = 12;
  let size: { width: number; height: number } | null = null;
  let metadata = false;
  while (i + 8 <= b.length) {
    const fourcc = ascii(b, i, 4);
    const len = le32(b, i + 4);
    const p = i + 8;
    if (p + len > b.length) return null;
    if (fourcc === "EXIF" || fourcc === "XMP ") metadata = true;
    if (fourcc === "VP8X" && len >= 10) {
      if ((b[p] & 0x0c) !== 0) metadata = true;
      size ??= { width: 1 + (b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16)), height: 1 + (b[p + 7] | (b[p + 8] << 8) | (b[p + 9] << 16)) };
    } else if (fourcc === "VP8 " && len >= 10 && !size) {
      if (b[p + 3] !== 0x9d || b[p + 4] !== 0x01 || b[p + 5] !== 0x2a) return null;
      size = { width: (b[p + 6] | (b[p + 7] << 8)) & 0x3fff, height: (b[p + 8] | (b[p + 9] << 8)) & 0x3fff };
    } else if (fourcc === "VP8L" && len >= 5 && !size) {
      if (b[p] !== 0x2f) return null;
      const bits = le32(b, p + 1);
      size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    i = p + len + (len % 2);
  }
  if (!size || size.width < 1 || size.height < 1) return null;
  return { mime: "image/webp", width: size.width, height: size.height, metadata };
}

/** What a file is, from its own bytes: a JPEG or a WebP and its pixels, or null. Never the name or the claimed type. */
export function imageInfoOf(b: Uint8Array): ImageInfo | null {
  const jpeg = jpegInfo(b);
  if (jpeg) return jpeg;
  const webp = webpInfo(b);
  return webp ? { mime: webp.mime, width: webp.width, height: webp.height } : null;
}

/** A photo as stored: its type and pixels read from its bytes, and the bytes with no metadata left. */
export interface CheckedPhoto extends ImageInfo {
  bytes: Uint8Array;
  sizeBytes: number;
}

/**
 * An uploaded image checked from its own bytes. A JPEG has its metadata segments dropped first (so the caps and the
 * stored bytes are what is kept); a WebP that carries EXIF or XMP is refused (the browser's re-encode never writes
 * them). A full photo is at most FULL_EDGE px each way and FULL_MAX_BYTES; a thumbnail THUMB_EDGE and THUMB_MAX_BYTES.
 */
export function photoOf(raw: Uint8Array, kind: PhotoKind): PlacesResult<CheckedPhoto> {
  if (!(raw instanceof Uint8Array) || raw.length === 0) return { ok: false, error: PHOTO_NOT_IMAGE };
  const full = kind === "full";
  if (raw.length > (full ? FULL_MAX_BYTES : THUMB_MAX_BYTES) * 4) return { ok: false, error: full ? PHOTO_TOO_BIG : THUMB_TOO_BIG };
  let bytes: Uint8Array;
  let info: ImageInfo;
  const jpeg = jpegInfo(raw);
  if (jpeg) {
    const stripped = stripJpegMetadata(raw);
    if (!stripped) return { ok: false, error: PHOTO_NOT_IMAGE };
    bytes = stripped;
    info = jpeg;
  } else {
    const webp = webpInfo(raw);
    if (!webp) return { ok: false, error: PHOTO_NOT_IMAGE };
    if (webp.metadata) return { ok: false, error: PHOTO_METADATA };
    bytes = raw;
    info = { mime: webp.mime, width: webp.width, height: webp.height };
  }
  const edge = full ? FULL_EDGE : THUMB_EDGE;
  if (info.width > edge || info.height > edge) return { ok: false, error: full ? PHOTO_TOO_WIDE : THUMB_TOO_WIDE };
  if (bytes.length > (full ? FULL_MAX_BYTES : THUMB_MAX_BYTES)) return { ok: false, error: full ? PHOTO_TOO_BIG : THUMB_TOO_BIG };
  return { ok: true, value: { ...info, bytes, sizeBytes: bytes.length } };
}

/** A photo's place in its visit: a whole 0..PHOTOS_MAX − 1 (from a form field's text), or null. */
export function photoOrdOf(raw: unknown): number | null {
  const n = typeof raw === "string" && /^\d$/.test(raw) ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isInteger(n) && n >= 0 && n < PHOTOS_MAX ? n : null;
}

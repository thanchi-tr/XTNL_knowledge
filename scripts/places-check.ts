/**
 * Places, the location check-in (the user's request of 2026-11-01: a photo, star ratings for service, food, premises
 * and parking, and a short summary, in a section of its own): the pure rules (src/lib/places.ts), the server
 * (src/lib/places-server.ts) and the photo route's handlers on a stubbed Prisma client, the actions
 * (src/app/actions/places.ts), the components (src/components/places), the migration and the guards around them:
 *
 *   §1  the input: cleanVisitInput's edges (the name, the address, the summary, the ratings, the location, when and its
 *       life day, the clientId), text always well formed, and no error line repeats a value;
 *   §2  the place key: case, spacing and accents folded (and the quotes and dashes a phone types), never empty;
 *   §3  the overall: the mean of the given ratings to one decimal, over every one of the 1296 rating sets against an
 *       integer formula; a place's average; the words;
 *   §4  the list: grouping (a place visited more than once is one entry with its count and average), the order, the
 *       search, the suggestions, the day words;
 *   §5  photos: the bytes checked from themselves (JPEG and WebP, the pixels, the caps after the strip), every metadata
 *       segment dropped (EXIF with its GPS, XMP, ICC, comments, anything after the end), the scans kept byte for byte,
 *       a WebP with metadata refused; the edit's photo plan; the resize maths;
 *   §6  the server and the route on a stubbed client: fail-soft reads (a missing table reads not ready; any other
 *       failure not ready and failed), the reads never select a photo's bytes for a list, clientId replay (and a changed
 *       retry updating its one row, the unique race), writes that answer { ok: false } and never throw, the delete's
 *       cascade (the visit first), an Edit's photos named by id (a retried or stale Edit removes nothing more), an
 *       upload racing a delete on a store with row locks (no orphan photo either way; the stub's calls are lazy, as
 *       Prisma's are, and a transaction is a list or a function), the photo's checks before any read, the 'places'
 *       tag cleared by every write, the upload's same-site,
 *       type and size gates, the image's headers, log lines with no value; the actions copy their input;
 *   §7  guards: the economy guard both ways (no economy file imports Places; Places reaches no economy file), no ledger
 *       or other table touched, no Gemini reachable (not even a type), only Places' own files import Places, the 'life'
 *       reset leaves visits alone, the cache tag;
 *   §8  the migration (additive only, BEGIN/COMMIT, the header, named CHECKs that match places.ts, its name, newest)
 *       and the schema;
 *   §9  the UI: the star groups (accessible radio groups of six, 44 px), 16 px inputs, the 12 px floor, tokens only, no
 *       motion, "Use my location" only on its tap, no EXIF passthrough (only the canvas's blobs are sent), the two file
 *       inputs, the list, the form, a visit, the fixtures and their audit, the shell's Places section, Tailwind;
 *   §10 the chain (life:check runs this right after work-orders-check; places:check runs it alone).
 *
 * No database: importing places-server.ts only builds the idle Prisma client, and every call the server makes here goes
 * to a stub, which is checked to be in place before the first one. Run it with a dead DATABASE_URL.
 *
 *   npx tsx scripts/places-check.ts      (npm run places:check; life:check runs it after work-orders-check)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { Prisma } from "@prisma/client";
import { dateColumn, dayKeyOf } from "../src/lib/life-day";
import {
  ACCURACY_MAX,
  ADDRESS_MAX,
  ADDRESS_TOO_LONG,
  FULL_EDGE,
  FULL_MAX_BYTES,
  KEY_MAX,
  LOCATION_BAD,
  NAME_MAX,
  NAME_NEEDED,
  NAME_TOO_LONG,
  NOT_RATED,
  NO_RATINGS,
  PHOTOS_MAX,
  PHOTO_KINDS,
  PHOTO_METADATA,
  PHOTO_MIMES,
  PHOTO_NOT_IMAGE,
  PHOTO_SLOT_BAD,
  PHOTO_TOO_BIG,
  PHOTO_TOO_WIDE,
  PLACES_EMPTY,
  PLACES_LOAD_FAILED,
  PLACES_NOT_READY,
  RATING_BAD,
  RATING_KEYS,
  RATING_MAX,
  SAVE_FAILED,
  SUMMARY_MAX,
  SUMMARY_TOO_LONG,
  THUMB_EDGE,
  THUMB_MAX_BYTES,
  THUMB_TOO_BIG,
  THUMB_TOO_WIDE,
  UPLOAD_MAX_BYTES,
  VISIT_GONE,
  WHEN_EARLY,
  WHEN_LATER,
  WHEN_NEEDED,
  averageOf,
  blankDraft,
  cleanPhotoIds,
  cleanRatings,
  cleanSummary,
  cleanVisitInput,
  dayWordsOf,
  draftOfVisit,
  filterVisits,
  firstLineOf,
  fitWithin,
  foldText,
  imageInfoOf,
  instantOfWallInput,
  instantsOfWallInput,
  knownPlacesOf,
  lastVisitLineOf,
  overallOf,
  photoOf,
  photoOrdOf,
  photoPlanOf,
  placeKeyOf,
  placesListOf,
  scoreText,
  searchListOf,
  starsLabelOf,
  stripInvisible,
  stripJpegMetadata,
  visitsInAllLineOf,
  visitsLineOf,
  wallInputOf,
  whenLineOf,
  type PlacesResult,
  type Ratings,
  type VisitPhoto,
  type VisitView,
} from "../src/lib/places";
import {
  PHOTO_CACHE,
  deleteVisitCore,
  handlePhotoGet,
  handlePhotoUpload,
  isMissingPlacesTable,
  loadPhotoCore,
  loadPlacesView,
  loadVisitDetail,
  placesErrorTag,
  saveVisitCore,
  savePhotoCore,
  updateVisitCore,
} from "../src/lib/places-server";
import { prisma } from "../src/lib/prisma";
import { ALL_TAGS } from "../src/lib/cache";
import { SECTIONS, sectionById } from "../src/components/shell/nav";
import { DETAIL_FIXTURES, FIXTURE_VISITS, LIST_FIXTURES, LUMEN_LATEST, PLACES_FIXTURE_NOW, PLACES_FIXTURE_STATES, PLACES_FIXTURE_TODAY, fixturePhotos } from "../src/components/places/fixtures";
import { StarInput } from "../src/components/places/StarInput";
import { LOCATION_OFF, PlaceForm } from "../src/components/places/PlaceForm";
import { NO_MATCH, PlacesList } from "../src/components/places/PlacesList";
import { DELETE_CONFIRM, VisitDetail } from "../src/components/places/VisitDetail";
import { PlacesFixtures } from "../src/app/dev/style/places/PlacesFixtures";
import { overflowLineOf } from "../src/components/places/PhotoPicker";
import type { DeleteVisit, VisitFormActions } from "../src/components/places/types";

const ROOT = resolve(__dirname, "..");
/** A file as text, line endings as LF (a Windows checkout may hold CRLF). */
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const rel = (abs: string) => relative(ROOT, abs).replace(/\\/g, "/");

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  if (!ok) console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const eq = (name: string, got: unknown, want: unknown) => check(name, same(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
/** Code without comments (block, and line comments that aren't inside a URL or a string's start). */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
/** One top-level function's text, to the next top-level declaration. */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`\\n(?:export )?(?:async )?function ${name}\\b`).exec(src);
  if (!m) return "";
  const next = src.slice(m.index + 1).search(/\n(?:export |function |async function |const |interface |type )/);
  return next < 0 ? src.slice(m.index) : src.slice(m.index, m.index + 1 + next);
}

/** Sunday 1 November 2026, 12:30 in Sydney. */
const NOW = new Date("2026-11-01T01:30:00.000Z");
const CID = "8b9e3f0c-2d7a-4c1e-9f5b-1a2b3c4d5e6f";
const base = (o: Record<string, unknown> = {}) => ({ placeName: "Café Lumen", visitedLocal: "2026-11-01T12:00", clientId: CID, ...o });
const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error ?? null);

// ── §1 The input ──────────────────────────────────────────────────────────
console.log("— the input");
{
  const ok = cleanVisitInput(base({ address: "  12  Harbour Lane ", ratings: { service: 5, food: 4, premises: 0, parking: null }, summary: "Good.\r\nGo early." }), NOW);
  check(
    "a whole check-in: the name kept as typed, its key folded, the address tidied, the ratings (0 and null are Not rated), the summary's CRLF as LF",
    ok.ok && ok.value.placeName === "Café Lumen" && ok.value.placeKey === "cafe lumen" && ok.value.address === "12 Harbour Lane" && same(ok.value.ratings, { service: 5, food: 4, premises: null, parking: null }) && ok.value.summary === "Good.\nGo early.",
    JSON.stringify(ok)
  );
  check("…its instant is the life zone's wall clock (12:00 in Sydney is 01:00 UTC in November), its life day that day", ok.ok && ok.value.visitedAt.toISOString() === "2026-11-01T01:00:00.000Z" && ok.value.day === "2026-11-01");
  const at1 = cleanVisitInput(base({ visitedLocal: "2026-11-01T01:30" }), NOW);
  const at4 = cleanVisitInput(base({ visitedLocal: "2026-11-01T04:00" }), NOW);
  eq("the life day turns at 04:00 (life-day.ts): 01:30 is the day before, 04:00 the day itself", [at1.ok && at1.value.day, at4.ok && at4.value.day], ["2026-10-31", "2026-11-01"]);

  const A = "a";
  eq(
    "the name: required (empty or blank), 1..80 (80 kept, 81 refused, never cut), a string",
    [err(cleanVisitInput(base({ placeName: "" }), NOW)), err(cleanVisitInput(base({ placeName: "  \t " }), NOW)), err(cleanVisitInput(base({ placeName: A.repeat(NAME_MAX) }), NOW)), err(cleanVisitInput(base({ placeName: A.repeat(NAME_MAX + 1) }), NOW)), err(cleanVisitInput(base({ placeName: 42 }), NOW)), err(cleanVisitInput(base({ placeName: undefined }), NOW))],
    [NAME_NEEDED, NAME_NEEDED, null, NAME_TOO_LONG, SAVE_FAILED, NAME_NEEDED]
  );
  const ctl = cleanVisitInput(base({ placeName: " The\u0007  Old\nMill\u0000 " }), NOW);
  check("…control characters and runs of space are one space, trimmed", ctl.ok && ctl.value.placeName === "The Old Mill", JSON.stringify(ctl));
  const lone = cleanVisitInput(base({ placeName: "Cafe \uD83D", summary: "ok \uDC00 then 😀" }), NOW);
  eq(
    "invisible format characters are removed (the soft hyphen, the zero-width space, the direction marks, embeddings, isolates): a name of only those is no name",
    [err(cleanVisitInput(base({ placeName: "\u200B" }), NOW)), err(cleanVisitInput(base({ placeName: "\u200E \u200F" }), NOW)), err(cleanVisitInput(base({ placeName: "\u00AD\u2060\u2066\u202A" }), NOW))],
    [NAME_NEEDED, NAME_NEEDED, NAME_NEEDED]
  );
  const pasted = cleanVisitInput(base({ placeName: "\u200ECafe\u200B Lumen\u200F", summary: "Go\u00AD early\u2069" }), NOW);
  const zwj = cleanVisitInput(base({ placeName: "Chef \u{1F469}\u200D\u{1F373} Bar" }), NOW);
  check(
    "…from a pasted name and summary; the zero-width joiner stays (an emoji sequence needs it)",
    pasted.ok && pasted.value.placeName === "Cafe Lumen" && pasted.value.summary === "Go early" && zwj.ok && zwj.value.placeName.includes("\u200D") && stripInvisible("a\u200Bb\u200Dc") === "ab\u200Dc",
    JSON.stringify([pasted, zwj])
  );
  check("…a lone surrogate is U+FFFD (the database refuses one); a pair is kept", lone.ok && lone.value.placeName === "Cafe �" && lone.value.summary === "ok � then 😀", JSON.stringify(lone));
  const nfc = cleanVisitInput(base({ placeName: "Café Lumen" }), NOW);
  check("…NFC: an accent typed as a mark is one letter, and keys like the composed one", nfc.ok && nfc.value.placeName === "Café Lumen" && nfc.value.placeKey === "cafe lumen");
  eq(
    "the address: optional (null, blank), 160 kept, 161 refused",
    [cleanVisitInput(base({ address: null }), NOW).ok, (() => {
      const r = cleanVisitInput(base({ address: "   " }), NOW);
      return r.ok ? r.value.address : "x";
    })(), err(cleanVisitInput(base({ address: A.repeat(ADDRESS_MAX) }), NOW)), err(cleanVisitInput(base({ address: A.repeat(ADDRESS_MAX + 1) }), NOW))],
    [true, null, null, ADDRESS_TOO_LONG]
  );
  eq(
    "the summary: optional, plain text, 280 kept and 281 refused, line breaks kept with at most one blank line, each line trimmed",
    [
      err(cleanVisitInput(base({ summary: A.repeat(SUMMARY_MAX) }), NOW)),
      err(cleanVisitInput(base({ summary: A.repeat(SUMMARY_MAX + 1) }), NOW)),
      cleanSummary("  one  \n\n\n\n  two\t\tthree  \r\n"),
      cleanSummary("   \n  \n"),
      cleanSummary(null),
      cleanSummary(7),
    ],
    [null, SUMMARY_TOO_LONG, { ok: true, value: "one\n\ntwo three" }, { ok: true, value: null }, { ok: true, value: null }, { ok: false, error: SAVE_FAILED }]
  );
  eq(
    "the ratings: each a whole 1..5, or Not rated (0, null, undefined, a missing key); anything else refused, never read as Not rated",
    [
      cleanRatings({ service: 1, food: 5 }),
      cleanRatings(undefined),
      ...[6, -1, 0.5, "3", true, Number.NaN, Infinity].map((v) => err(cleanRatings({ service: v }))),
      err(cleanRatings([1, 2])),
      err(cleanRatings("5")),
    ],
    [
      { ok: true, value: { service: 1, food: 5, premises: null, parking: null } },
      { ok: true, value: NO_RATINGS },
      RATING_BAD,
      RATING_BAD,
      RATING_BAD,
      RATING_BAD,
      RATING_BAD,
      RATING_BAD,
      RATING_BAD,
      RATING_BAD,
      RATING_BAD,
    ]
  );
  const loc = cleanVisitInput(base({ location: { lat: -33.86881234, lng: 151.20929876, accuracyM: 12.6 } }), NOW);
  check("the location: kept to 6 decimals (about 0.1 m), its accuracy in whole metres", loc.ok && same(loc.value.location, { lat: -33.868812, lng: 151.209299, accuracyM: 13 }), JSON.stringify(loc.ok && loc.value.location));
  eq(
    "…optional (null, or no accuracy), and refused outside lat ±90, lng ±180, accuracy 0..100000, or not numbers",
    [
      cleanVisitInput(base({ location: null }), NOW).ok,
      (() => {
        const r = cleanVisitInput(base({ location: { lat: 0, lng: 0 } }), NOW);
        return r.ok ? r.value.location : null;
      })(),
      ...[{ lat: 90.1, lng: 0 }, { lat: 0, lng: -180.5 }, { lat: Number.NaN, lng: 0 }, { lat: "1", lng: 2 }, { lat: 1, lng: 2, accuracyM: -1 }, { lat: 1, lng: 2, accuracyM: ACCURACY_MAX + 1 }, [1, 2], "here"].map((l) => err(cleanVisitInput(base({ location: l }), NOW))),
      err(cleanVisitInput(base({ location: { lat: 90, lng: -180, accuracyM: ACCURACY_MAX } }), NOW)),
    ],
    [true, { lat: 0, lng: 0, accuracyM: null }, LOCATION_BAD, LOCATION_BAD, LOCATION_BAD, LOCATION_BAD, LOCATION_BAD, LOCATION_BAD, LOCATION_BAD, LOCATION_BAD, null]
  );
  eq(
    "when: a datetime-local value (seconds allowed); not one, a day that doesn't exist, 24:00 or a non-string is refused",
    ["2026-11-01T12:00:59", "2026-11-01 12:00", "2026-02-30T10:00", "2026-11-01T24:00", "2026-13-01T10:00", "", "soon", 1730000000000].map((v) => err(cleanVisitInput(base({ visitedLocal: v }), NOW))),
    [null, WHEN_NEEDED, WHEN_NEEDED, WHEN_NEEDED, WHEN_NEEDED, WHEN_NEEDED, WHEN_NEEDED, WHEN_NEEDED]
  );
  eq(
    "…no later than now plus 10 minutes (a phone's clock a little ahead), from the year 2000 on the life zone's own clock (its first hours in Sydney are 1999 in UTC, and kept)",
    ["2026-11-01T12:39", "2026-11-01T12:41", "2027-01-01T00:00", "2000-01-01T12:00", "2000-01-01T00:00", "2000-01-01T10:59", "1999-12-31T23:59", "1999-12-31T10:00"].map((v) => err(cleanVisitInput(base({ visitedLocal: v }), NOW))),
    [null, WHEN_LATER, WHEN_LATER, null, null, null, WHEN_EARLY, WHEN_EARLY]
  );
  {
    // The fall-back night (Sydney, Sunday 5 April 2026): 02:00–02:59 happens twice, AEDT (15:00Z–15:59Z) then AEST.
    const at = (iso: string) => new Date(iso);
    const when = (local: string, now: Date) => {
      const r = cleanVisitInput(base({ visitedLocal: local }), now);
      return r.ok ? r.value.visitedAt.toISOString() : r.error;
    };
    eq(
      "a wall time a fall-back repeats names both its instants; one that exists once, one; a skipped one (spring forward) still one; a non-value none",
      [instantsOfWallInput("2026-04-05T02:30").map((d) => d.toISOString()), instantsOfWallInput("2026-04-05T03:30").length, instantsOfWallInput("2026-10-04T02:30").length, instantsOfWallInput("soon").length],
      [["2026-04-04T15:30:00.000Z", "2026-04-04T16:30:00.000Z"], 1, 1, 0]
    );
    eq("…the default 'now' in the first pass is kept, never refused as later than now (the later instant that isn't in the future)", when("2026-04-05T02:30", at("2026-04-04T15:30:00Z")), "2026-04-04T15:30:00.000Z");
    eq("…and once the second pass has come, the second pass (today's choice, so stored rows and edits are unchanged)", when("2026-04-05T02:30", at("2026-04-04T16:45:00Z")), "2026-04-04T16:30:00.000Z");
    const trips = ["2026-04-04T15:00:00Z", "2026-04-04T15:30:00Z", "2026-04-04T15:59:00Z", "2026-04-04T16:00:00Z", "2026-04-04T16:30:00Z"].map((iso) => {
      const t = at(iso);
      return when(wallInputOf(t), t) === t.toISOString();
    });
    check("…instant to wall to save, through the repeated hour: the default time saves as the instant it was read at", trips.every(Boolean), JSON.stringify(trips));
  }
  check("instantOfWallInput and wallInputOf agree both ways on the life zone's clock (a DST day included)", ["2026-10-04T01:59", "2026-10-04T03:00", "2026-04-05T02:30", "2026-11-01T23:59", "2027-01-01T00:00"].every((v) => wallInputOf(instantOfWallInput(v)!) === v));
  eq(
    "the clientId: 8..64 letters, digits, - and _ (a UUID); anything else refused as a failed save (no value said)",
    [CID, "abcdefgh", "a".repeat(64), "a".repeat(65), "short", "has space here", "", undefined].map((c) => err(cleanVisitInput(base({ clientId: c }), NOW))),
    [null, null, null, SAVE_FAILED, SAVE_FAILED, SAVE_FAILED, SAVE_FAILED, SAVE_FAILED]
  );
  eq("nothing to check is a failed save", [null, undefined, "x", [base()], 5].map((r) => err(cleanVisitInput(r, NOW))), [SAVE_FAILED, SAVE_FAILED, SAVE_FAILED, SAVE_FAILED, SAVE_FAILED]);
  const SENT = "Sentinelvalue";
  const lines = [
    cleanVisitInput(base({ placeName: `${SENT}${"x".repeat(90)}` }), NOW),
    cleanVisitInput(base({ address: `${SENT}${"x".repeat(170)}` }), NOW),
    cleanVisitInput(base({ summary: `${SENT}${"x".repeat(300)}` }), NOW),
    cleanVisitInput(base({ ratings: { food: SENT } }), NOW),
    cleanVisitInput(base({ location: { lat: SENT, lng: 1 } }), NOW),
    cleanVisitInput(base({ visitedLocal: SENT }), NOW),
    cleanVisitInput(base({ clientId: SENT + " !" }), NOW),
  ].map(err);
  check("no error line repeats what was typed", lines.every((l) => l !== null && !l.includes(SENT)), lines.join(" | "));
}

// ── §2 The place key ──────────────────────────────────────────────────────
console.log("— the place key");
{
  const one = ["Café Lumen", "cafe lumen", "CAFE  Lumen", " café\tlumen ", "Café LUMEN", "ＣＡＦＥ Lumen"];
  eq("case, spacing, accents (and full-width letters, NFKD) fold to one key", [...new Set(one.map(placeKeyOf))], ["cafe lumen"]);
  eq("the quotes and dashes a phone keyboard types fold to plain ones", [placeKeyOf("Joe’s Diner"), placeKeyOf("Joe's Diner"), placeKeyOf("North–South Bar"), placeKeyOf("“The” Pub")], ["joe's diner", "joe's diner", "north-south bar", '"the" pub']);
  check("different places keep different keys", new Set(["Café Lumen", "Café Lumière", "Lumen Café", "Cafe Lumen 2"].map(placeKeyOf)).size === 4);
  check(`a key is at most KEY_MAX (${KEY_MAX}) and never ends on half a pair; a ligature's fold can be longer than the name`, placeKeyOf("ﬁ".repeat(NAME_MAX)) === "fi".repeat(NAME_MAX) && placeKeyOf(`${"a".repeat(KEY_MAX - 1)}😀`).length === KEY_MAX - 1);
  check("a name that folds to nothing still has a key (never empty: the CHECK)", placeKeyOf("́").length > 0 && placeKeyOf("́̂").length > 0);
  eq("foldText is the same fold (the search box uses it)", foldText("  CAFÉ\n Lumen "), "cafe lumen");
  const pairs: [string, string][] = [
    ["Phở Đức", "Pho Duc"],
    ["Bánh mì Đà Nẵng", "Banh mi Da Nang"],
    ["Øresund", "Oresund"],
    ["Łódź", "Lodz"],
    ["Straße", "Strasse"],
    ["Æble", "Aeble"],
    ["İstanbul Kebap", "istanbul kebap"],
    ["Þingvellir", "Thingvellir"],
    ["\u200ECafe Lumen", "Cafe Lumen"],
    ["Caf\u200Be", "cafe"],
    ["Cafe\u2066 Lumen\u2069", "cafe lumen"],
  ];
  const split = pairs.filter(([a, b]) => placeKeyOf(a) !== placeKeyOf(b));
  check(
    "letters with no decomposition fold too (Đ đ ð ø ł æ œ ß ı þ, and the dot İ gains), and every format character is dropped: each pair is one key",
    split.length === 0,
    split.map(([a, b]) => `${placeKeyOf(a)} / ${placeKeyOf(b)}`).join(", ")
  );
  const pho: VisitView = { ...FIXTURE_VISITS[1], id: "pho", placeName: "Phở Đức", placeKey: placeKeyOf("Phở Đức"), address: null, summary: null };
  check("…so the search finds them typed plainly ('duc' finds Phở Đức)", foldText("Phở Đức").includes("duc") && filterVisits([pho], "duc").length === 1 && filterVisits([pho], "pho duc").length === 1);
  check("…and a key still fits KEY_MAX when the folds lengthen it (ß, a ligature)", placeKeyOf("ß".repeat(NAME_MAX)).length === KEY_MAX && placeKeyOf("ﬃ".repeat(NAME_MAX)).length === KEY_MAX);
}

// ── §3 The overall ────────────────────────────────────────────────────────
console.log("— the overall");
{
  const r = (s: number | null, f: number | null, p: number | null, k: number | null): Ratings => ({ service: s, food: f, premises: p, parking: k });
  eq(
    "the overall: the mean of the given ratings to one decimal, half up; none given is null",
    [overallOf(r(null, null, null, null)), overallOf(r(5, null, null, null)), overallOf(r(5, 4, 4, null)), overallOf(r(5, 4, null, null)), overallOf(r(4, 5, 5, 5)), overallOf(r(3, 4, 4, 4)), overallOf(r(1, 2, 2, 2)), overallOf(r(2, 2, 3, null)), overallOf(r(5, 5, 4, null)), overallOf(r(1, 1, 1, 1))],
    [null, 5, 4.3, 4.5, 4.8, 3.8, 1.8, 2.3, 4.7, 1]
  );
  // Every rating set (Not rated or 1..5, four times: 1296) against an integer formula: round half up of 10·sum/n.
  const V = [null, 1, 2, 3, 4, 5];
  let bad = 0;
  let sets = 0;
  for (const s of V) for (const f of V) for (const p of V) for (const k of V) {
    sets++;
    const given = [s, f, p, k].filter((x): x is number => x !== null);
    const want = given.length === 0 ? null : Math.floor((given.reduce((a, b) => a + b, 0) * 20 + given.length) / (2 * given.length)) / 10;
    if (overallOf(r(s, f, p, k)) !== want) bad++;
  }
  check(`the overall matches an integer formula on every one of the ${sets} rating sets`, sets === 1296 && bad === 0, String(bad));
  const v = (ratings: Ratings) => ({ ratings });
  eq(
    "a place's average: the mean of its rated visits' overalls (unrounded) to one decimal; unrated visits left out; none rated is null",
    [averageOf([v(r(5, 4, 4, null)), v(r(4, 4, 4, null))]), averageOf([v(r(5, 4, 4, null)), v(NO_RATINGS)]), averageOf([v(NO_RATINGS)]), averageOf([]), averageOf([v(r(4, 5, null, null)), v(r(4, null, null, null))])],
    [4.2, 4.3, null, null, 4.3]
  );
  eq("the figure is always one decimal", [scoreText(5), scoreText(4.25), scoreText(3)], ["5.0", "4.3", "3.0"]);
  eq("the stars' names: an overall, one rating with its word, and none", [starsLabelOf(4.3), starsLabelOf(4, true), starsLabelOf(1, true), starsLabelOf(null)], ["4.3 out of 5", "4 out of 5 stars, Very good", "1 out of 5 stars, Poor", NOT_RATED]);
  eq("a place's line: its visits and its average", [visitsLineOf(3, 4.2), visitsLineOf(1, null), visitsLineOf(2, 5)], ["3 visits · average 4.2", "1 visit", "2 visits · average 5.0"]);
}

// ── §4 The list ───────────────────────────────────────────────────────────
console.log("— the list");
{
  const entries = placesListOf(FIXTURE_VISITS);
  eq(
    "the fixtures group: Café Lumen (typed three ways) is one entry of 3 visits; the rest are their own visit; newest first",
    entries.map((e) => (e.kind === "place" ? ["place", e.placeName, e.count, e.visits.map((x) => x.id)] : ["visit", e.visit.id])),
    [["place", "Café Lumen", 3, ["fx-lumen-3", "fx-lumen-2", "fx-lumen-1"]], ["visit", "fx-fish"], ["visit", "fx-pool"], ["visit", "fx-diner"]]
  );
  const lumen = entries[0];
  check("…named by its newest visit, with the average of its visits", lumen.kind === "place" && lumen.latest.id === "fx-lumen-3" && lumen.average === averageOf(lumen.visits) && lumen.average !== null);
  const shuffled = [...FIXTURE_VISITS].reverse();
  check("the order is the visits' own (newest first), whatever order they arrive in", same(placesListOf(shuffled), entries));
  const t = "2026-10-10T00:00:00.000Z";
  const mk = (id: string, name: string, at = t): VisitView => ({ ...FIXTURE_VISITS[1], id, placeName: name, placeKey: placeKeyOf(name), visitedAt: at });
  eq("two visits at one instant keep one order (by id)", placesListOf([mk("b", "X"), mk("c", "Y"), mk("a", "Z")]).map((e) => e.key), ["v:c", "v:b", "v:a"]);
  eq("keys are unique per entry", new Set(entries.map((e) => e.key)).size, entries.length);
  eq(
    "the search: folded, every word must match the name, address or summary; empty is everything; no match is nothing",
    [
      filterVisits(FIXTURE_VISITS, "lumen").map((x) => x.id),
      filterVisits(FIXTURE_VISITS, "  CAFÉ ").length,
      filterVisits(FIXTURE_VISITS, "chips").map((x) => x.id),
      filterVisits(FIXTURE_VISITS, "harbour").map((x) => x.id),
      filterVisits(FIXTURE_VISITS, "harbour chips").map((x) => x.id),
      filterVisits(FIXTURE_VISITS, "").length,
      filterVisits(FIXTURE_VISITS, "zzz").length,
    ],
    [["fx-lumen-3", "fx-lumen-2", "fx-lumen-1"], 3, ["fx-fish"], ["fx-lumen-3", "fx-fish"], ["fx-fish"], FIXTURE_VISITS.length, 0]
  );
  {
    // The list under a search: grouped first, then filtered, so a place's count, average and newest visit never move.
    const whole = placesListOf(FIXTURE_VISITS);
    const lumenAll = FIXTURE_VISITS.filter((v) => v.placeKey === "cafe lumen");
    const lumenOf = (q: string) => searchListOf(FIXTURE_VISITS, q).find((e) => e.kind === "place" && e.placeKey === "cafe lumen");
    const the = lumenOf("the");
    check(
      "the search keeps a place's whole group: 'the' (two of Café Lumen's summaries) still draws one entry of 3 visits, their average over all three, its newest fx-lumen-3",
      !!the && the.kind === "place" && the.count === 3 && the.average === averageOf(lumenAll) && the.average === 3.8 && the.latest.id === "fx-lumen-3",
      JSON.stringify(the && the.kind === "place" ? [the.count, the.average, the.latest.id] : the)
    );
    const harbour = searchListOf(FIXTURE_VISITS, "harbour");
    check("…'harbour' (one Café Lumen visit's address) keeps Café Lumen a place of 3, never a single visit's card", harbour.some((e) => e.kind === "place" && e.placeKey === "cafe lumen" && e.count === 3) && !harbour.some((e) => e.kind === "visit" && e.visit.placeKey === "cafe lumen"));
    eq("…'zzz' is nothing; an empty query is the whole list", [searchListOf(FIXTURE_VISITS, "zzz").length, same(searchListOf(FIXTURE_VISITS, ""), whole)], [0, true]);
    const wholeOf = new Map(whole.map((e) => [e.key, e]));
    const moved = ["the", "harbour", "lumen", "chips", "first", "go early", "parking", "x"].flatMap((q) =>
      searchListOf(FIXTURE_VISITS, q)
        .filter((e) => e.kind === "place")
        .filter((e) => {
          const w = wholeOf.get(e.key);
          return !w || w.kind !== "place" || e.kind !== "place" || e.count !== w.count || e.average !== w.average || e.latest.id !== w.latest.id;
        })
        .map((e) => `${q}: ${e.key}`)
    );
    check("…for every query, each place's count, average and newest visit are the unfiltered list's", moved.length === 0, moved.join(", "));
  }
  eq("the suggestions: each place once, by its newest name, newest first", knownPlacesOf(FIXTURE_VISITS).slice(0, 3), ["Café Lumen", "Harbour Fish Bar", "Northside Pool"]);
  eq(
    "the day words: Today, Yesterday, a day this year, a day another year",
    [dayWordsOf("2026-11-01", "2026-11-01"), dayWordsOf("2026-10-31", "2026-11-01"), dayWordsOf("2026-10-29", "2026-11-01"), dayWordsOf("2025-12-14", "2026-11-01"), dayWordsOf("2026-12-31", "2027-01-01")],
    ["Today", "Yesterday", "Thu 29 Oct", "Sun 14 Dec 2025", "Yesterday"]
  );
  eq("a visit's own date and time, in the life zone", whenLineOf(LUMEN_LATEST.visitedAt), "Saturday 31 October 2026, 13:05");
  eq(
    "a grouped card's newest visit: 'Last visit' with today and yesterday in lower case, a day as its words",
    [lastVisitLineOf("2026-10-31", "2026-11-01"), lastVisitLineOf("2026-11-01", "2026-11-01"), lastVisitLineOf("2026-10-31", "2026-11-03"), lastVisitLineOf("2025-12-14", "2026-11-01")],
    ["Last visit yesterday", "Last visit today", "Last visit Sat 31 Oct", "Last visit Sun 14 Dec 2025"]
  );
  eq("a visit's page counts every visit to the place, this one too, and says so", [visitsInAllLineOf(3, 3.8), visitsInAllLineOf(2, null), visitsInAllLineOf(1, 5)], ["3 visits in all · average 3.8", "2 visits in all", "1 visit in all · average 5.0"]);
  eq("the summary's first line (the card's)", [firstLineOf("\n  First  \nsecond"), firstLineOf(null), firstLineOf("   ")], ["First", null, null]);
  const d = draftOfVisit(LUMEN_LATEST, [...fixturePhotos(LUMEN_LATEST.id, 4)].reverse());
  check("Edit starts from the visit: its fields, its time on the wall clock, its photos in order", d.placeName === LUMEN_LATEST.placeName && d.visitedLocal === "2026-10-31T13:05" && same(d.photos.map((p) => p.ord), [0, 1, 2, 3]) && same(d.ratings, LUMEN_LATEST.ratings));
  eq("a new check-in starts now (the life zone's clock), blank", blankDraft(NOW), { placeName: "", address: "", location: null, visitedLocal: "2026-11-01T12:30", ratings: NO_RATINGS, summary: "", photos: [] });
}

// ── §5 Photos ─────────────────────────────────────────────────────────────
console.log("— photos");
const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const u8 = (...parts: (number[] | Uint8Array)[]) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const seg = (marker: number, payload: number[] | Uint8Array) => u8([0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff], payload);
const SCAN = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a];
interface JpegOpts {
  width: number;
  height: number;
  exif?: boolean;
  icc?: boolean;
  xmp?: boolean;
  comment?: boolean;
  adobe?: boolean;
  trailing?: boolean;
  between?: boolean;
  pad?: number;
  bigExif?: number;
}
/** A small, well-formed JPEG's structure (headers, tables, scans), with the metadata asked for. Not decodable pixels: only its structure is read. */
function jpeg(o: JpegOpts): Uint8Array {
  const parts: (number[] | Uint8Array)[] = [[0xff, 0xd8], seg(0xe0, [...enc("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])];
  if (o.exif) parts.push(seg(0xe1, [...enc("Exif"), 0, 0, ...enc("GPSLatitude -33.8688 SentinelGPS")]));
  if (o.bigExif) parts.push(seg(0xe1, u8(enc("Exif"), [0, 0], new Uint8Array(o.bigExif).fill(0x41))));
  if (o.icc) parts.push(seg(0xe2, [...enc("ICC_PROFILE"), 0, 1, 1, ...enc("SentinelICC")]));
  if (o.adobe) parts.push(seg(0xee, [...enc("Adobe"), 0, 100, 0, 0, 0, 0, 1]));
  parts.push(seg(0xdb, [0, ...new Array(64).fill(1)]));
  if (o.xmp) parts.push(seg(0xe1, [...enc("http://ns.adobe.com/xap/1.0/"), 0, ...enc("<x:xmpmeta>SentinelXMP</x:xmpmeta>")]));
  if (o.comment) parts.push(seg(0xfe, enc("SentinelCOM")));
  parts.push(seg(o.between ? 0xc2 : 0xc0, [8, (o.height >> 8) & 0xff, o.height & 0xff, (o.width >> 8) & 0xff, o.width & 0xff, 1, 1, 0x11, 0]));
  parts.push(seg(0xc4, [0, ...new Array(16).fill(0)]));
  parts.push(seg(0xda, [1, 1, 0, 0, 63, 0]), SCAN);
  if (o.pad) parts.push(new Uint8Array(o.pad).fill(0x11));
  if (o.between) parts.push(seg(0xe1, [...enc("Exif"), 0, 0, ...enc("SentinelMID")]), seg(0xc4, [0x10, ...new Array(16).fill(0)]), seg(0xda, [1, 1, 0, 1, 63, 0]), SCAN);
  parts.push([0xff, 0xd9]);
  if (o.trailing) parts.push(enc("SentinelTAIL after the end"));
  return u8(...parts);
}
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const chunk = (fourcc: string, payload: number[]) => [...enc(fourcc), ...le32(payload.length), ...payload, ...(payload.length % 2 ? [0] : [])];
const riff = (...chunks: number[][]) => {
  const body = [...enc("WEBP"), ...chunks.flat()];
  return u8(enc("RIFF"), le32(body.length), body);
};
const vp8 = (w: number, h: number) => chunk("VP8 ", [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, w & 0xff, (w >> 8) & 0x3f, h & 0xff, (h >> 8) & 0x3f, 0, 0]);
const vp8l = (w: number, h: number) => {
  const bits = ((w - 1) | ((h - 1) << 14)) >>> 0;
  return chunk("VP8L", [0x2f, ...le32(bits), 0, 0, 0]);
};
const vp8x = (w: number, h: number, flags: number) => chunk("VP8X", [flags, 0, 0, 0, (w - 1) & 0xff, ((w - 1) >> 8) & 0xff, ((w - 1) >> 16) & 0xff, (h - 1) & 0xff, ((h - 1) >> 8) & 0xff, ((h - 1) >> 16) & 0xff]);
const hasText = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, "latin1"));
const indexOfSeq = (b: Uint8Array, seq: number[]) => Buffer.from(b).indexOf(Buffer.from(seq));
{
  const dirty = jpeg({ width: 1600, height: 1200, exif: true, icc: true, xmp: true, comment: true, adobe: true, trailing: true });
  const p = photoOf(dirty, "full");
  check("a JPEG is read from its own bytes: its type and its pixels from the frame header", p.ok && p.value.mime === "image/jpeg" && p.value.width === 1600 && p.value.height === 1200, JSON.stringify(p.ok ? { ...p.value, bytes: p.value.bytes.length } : p));
  const kept = p.ok ? p.value.bytes : new Uint8Array(0);
  check(
    "every metadata segment is dropped before it is stored: EXIF with its GPS, XMP, the ICC profile, the comment, anything after the end marker",
    kept.length > 0 && !hasText(kept, "Exif") && !hasText(kept, "SentinelGPS") && !hasText(kept, "SentinelXMP") && !hasText(kept, "SentinelICC") && !hasText(kept, "SentinelCOM") && !hasText(kept, "SentinelTAIL")
  );
  check(
    "…and what decoding needs is kept: JFIF, Adobe's colour transform, the tables and the frame, the scan byte for byte (stuffed bytes and restarts), the end marker",
    hasText(kept, "JFIF") && hasText(kept, "Adobe") && kept[0] === 0xff && kept[1] === 0xd8 && kept[kept.length - 2] === 0xff && kept[kept.length - 1] === 0xd9 && indexOfSeq(kept, SCAN) > 0 && imageInfoOf(kept)?.width === 1600
  );
  check("…its size is what is stored (sizeBytes is the kept length)", p.ok && p.value.sizeBytes === kept.length && kept.length < dirty.length);
  const clean = jpeg({ width: 800, height: 600 });
  const c = stripJpegMetadata(clean);
  check("a JPEG with no metadata is kept byte for byte", !!c && Buffer.from(c).equals(Buffer.from(clean)));
  const prog = stripJpegMetadata(jpeg({ width: 640, height: 480, between: true }));
  check("a progressive JPEG keeps every scan, and metadata between its scans is dropped too", !!prog && !hasText(prog, "SentinelMID") && Buffer.from(prog).indexOf(Buffer.from(SCAN)) !== Buffer.from(prog).lastIndexOf(Buffer.from(SCAN)));
  eq(
    "the edges: 1600 px each way is a photo, 1601 is refused; 480 is a thumbnail, 481 is refused",
    [err(photoOf(jpeg({ width: FULL_EDGE, height: FULL_EDGE }), "full")), err(photoOf(jpeg({ width: FULL_EDGE + 1, height: 900 }), "full")), err(photoOf(jpeg({ width: 900, height: FULL_EDGE + 1 }), "full")), err(photoOf(jpeg({ width: THUMB_EDGE, height: 360 }), "thumb")), err(photoOf(jpeg({ width: 360, height: THUMB_EDGE + 1 }), "thumb")), err(photoOf(jpeg({ width: 1200, height: 900 }), "thumb"))],
    [null, PHOTO_TOO_WIDE, PHOTO_TOO_WIDE, null, THUMB_TOO_WIDE, THUMB_TOO_WIDE]
  );
  const baseLen = jpeg({ width: 1600, height: 1200 }).length;
  const atCap = jpeg({ width: 1600, height: 1200, pad: FULL_MAX_BYTES - baseLen });
  const overCap = jpeg({ width: 1600, height: 1200, pad: FULL_MAX_BYTES - baseLen + 1 });
  const thumbBase = jpeg({ width: 480, height: 360 }).length;
  eq(
    `the caps: a photo of exactly ${FULL_MAX_BYTES} bytes is kept, one byte more refused; a thumbnail of ${THUMB_MAX_BYTES} kept, one more refused`,
    [atCap.length, err(photoOf(atCap, "full")), err(photoOf(overCap, "full")), err(photoOf(jpeg({ width: 480, height: 360, pad: THUMB_MAX_BYTES - thumbBase }), "thumb")), err(photoOf(jpeg({ width: 480, height: 360, pad: THUMB_MAX_BYTES - thumbBase + 1 }), "thumb"))],
    [FULL_MAX_BYTES, null, PHOTO_TOO_BIG, null, THUMB_TOO_BIG]
  );
  const heavy = jpeg({ width: 1600, height: 1200, pad: FULL_MAX_BYTES - baseLen - 10, bigExif: 60_000 });
  const h = photoOf(heavy, "full");
  check("…measured after the strip: a photo over the cap only by its metadata is kept, without it", heavy.length > FULL_MAX_BYTES && h.ok && h.value.sizeBytes <= FULL_MAX_BYTES && !hasText(h.value.bytes, "Exif"));
  const png = u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], new Uint8Array(40));
  const gif = u8(enc("GIF89a"), new Uint8Array(20));
  const svg = u8(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
  const truncated = jpeg({ width: 100, height: 100 }).slice(0, 40);
  const noFrame = u8([0xff, 0xd8], seg(0xe0, enc("JFIF")), seg(0xda, [1]), [1, 2, 3, 0xff, 0xd9]);
  eq(
    "anything that isn't a whole JPEG or WebP is refused: PNG, GIF, SVG (a script), a cut-off JPEG, one with no frame, nothing, random bytes",
    [png, gif, svg, truncated, noFrame, new Uint8Array(0), u8(Array.from({ length: 300 }, (_, i) => (i * 73) % 251))].map((b) => err(photoOf(b, "full"))),
    [PHOTO_NOT_IMAGE, PHOTO_NOT_IMAGE, PHOTO_NOT_IMAGE, PHOTO_NOT_IMAGE, PHOTO_NOT_IMAGE, PHOTO_NOT_IMAGE, PHOTO_NOT_IMAGE]
  );
  eq(
    "a WebP is read from its own chunks (VP8, VP8L, VP8X), and one that carries EXIF or XMP is refused (the browser's re-encode writes none)",
    [
      (() => {
        const r = photoOf(riff(vp8(1600, 900)), "full");
        return r.ok ? [r.value.mime, r.value.width, r.value.height] : r.error;
      })(),
      (() => {
        const r = photoOf(riff(vp8l(480, 320)), "thumb");
        return r.ok ? [r.value.mime, r.value.width, r.value.height] : r.error;
      })(),
      (() => {
        const r = photoOf(riff(vp8x(1200, 800, 0), vp8(1200, 800)), "full");
        return r.ok ? [r.value.width, r.value.height] : r.error;
      })(),
      err(photoOf(riff(vp8x(1200, 800, 0x08), vp8(1200, 800), chunk("EXIF", enc("SentinelGPS"))), "full")),
      err(photoOf(riff(vp8x(1200, 800, 0x04), vp8(1200, 800)), "full")),
      err(photoOf(riff(vp8(1200, 800), chunk("XMP ", enc("x"))), "full")),
      err(photoOf(riff(vp8(1601, 800)), "full")),
      err(photoOf(riff(chunk("JUNK", [1, 2])), "full")),
    ],
    [["image/webp", 1600, 900], ["image/webp", 480, 320], [1200, 800], PHOTO_METADATA, PHOTO_METADATA, PHOTO_METADATA, PHOTO_TOO_WIDE, PHOTO_NOT_IMAGE]
  );
  eq("the stored types are JPEG and WebP only, in two sizes", [PHOTO_MIMES, PHOTO_KINDS], [["image/jpeg", "image/webp"], ["full", "thumb"]]);
  eq("a photo's place: a whole 0..3 (from a form field's text or a number), anything else none", ["0", "3", "4", "-1", "1.5", "", "01", " 2", 2, 3.5, null].map(photoOrdOf), [0, 3, null, null, null, null, null, null, 2, null, null]);
  eq(
    "an edit's photo plan: the places not kept are removed, the kept ones close up from 0 in their order, new ones go after them",
    [photoPlanOf([0, 1, 2, 3], [1, 3]), photoPlanOf([0, 1, 2], []), photoPlanOf([0, 1], [0, 1]), photoPlanOf([0, 2], [2, 2, 7, -1, "1" as never, 0]), photoPlanOf([], [0, 1])],
    [
      { remove: [0, 2], moves: [{ from: 1, to: 0 }, { from: 3, to: 1 }], count: 2 },
      { remove: [0, 1, 2], moves: [], count: 0 },
      { remove: [], moves: [], count: 2 },
      { remove: [], moves: [{ from: 2, to: 1 }], count: 2 },
      { remove: [], moves: [], count: 0 },
    ]
  );
  // Every plan over every stored set and kept subset: applied in order (removes, then moves), no move lands on a place still taken.
  let collisions = 0;
  for (let storedMask = 0; storedMask < 16; storedMask++) {
    const stored = [0, 1, 2, 3].filter((o) => storedMask & (1 << o));
    for (let keepMask = 0; keepMask < 16; keepMask++) {
      const keep = [0, 1, 2, 3].filter((o) => keepMask & (1 << o));
      const plan = photoPlanOf(stored, keep);
      const taken = new Set(stored.filter((o) => !plan.remove.includes(o)));
      for (const m of plan.moves) {
        if (taken.has(m.to)) collisions++;
        taken.delete(m.from);
        taken.add(m.to);
      }
      if (!same([...taken].sort(), Array.from({ length: plan.count }, (_, i) => i))) collisions++;
    }
  }
  check("…over all 256 stored and kept sets, no move lands on a place still taken, and the kept end up at 0..n−1", collisions === 0, String(collisions));
  eq(
    "cleanPhotoIds: an edit names the photos it removes by their full image's id (never a place): strings that can be an id, once each, at most 4; anything else dropped",
    [cleanPhotoIds(["ph_b", "ph_a", "ph_b", 3, null, "not an id!", "", "a/b"]), cleanPhotoIds(["a", "b", "c", "d", "e"]), cleanPhotoIds("ph_a"), cleanPhotoIds(null)],
    [["ph_b", "ph_a"], ["a", "b", "c", "d"], [], []]
  );
  eq(
    "the resize: inside the long edge, its shape kept, never enlarged",
    [fitWithin(4000, 3000, FULL_EDGE), fitWithin(3000, 4000, FULL_EDGE), fitWithin(800, 600, FULL_EDGE), fitWithin(4032, 3024, THUMB_EDGE), fitWithin(16000, 10, FULL_EDGE), fitWithin(0, 10, FULL_EDGE)],
    [{ width: 1600, height: 1200 }, { width: 1200, height: 1600 }, { width: 800, height: 600 }, { width: 480, height: 360 }, { width: 1600, height: 1 }, { width: 0, height: 0 }]
  );
  check(`one upload is a photo, its thumbnail and the framing (${UPLOAD_MAX_BYTES} bytes), well under a 4.5 MB function body`, UPLOAD_MAX_BYTES === FULL_MAX_BYTES + THUMB_MAX_BYTES + 65_536 && UPLOAD_MAX_BYTES < 4.5 * 1_000_000);
  eq("a visit holds four photos", PHOTOS_MAX, 4);
  eq("the overflow line", [overflowLineOf(0), overflowLineOf(1), overflowLineOf(3)], [null, "Up to 4 photos. 1 wasn't added.", "Up to 4 photos. 3 weren't added."]);
}

// ── §6 The server and the route, on a stubbed client ─────────────────────
const STUB_NAMES = [
  "locationCheckin.findMany",
  "locationCheckin.findFirst",
  "locationCheckin.findUnique",
  "locationCheckin.create",
  "locationCheckin.updateMany",
  "locationCheckin.deleteMany",
  "locationPhoto.findMany",
  "locationPhoto.findFirst",
  "locationPhoto.count",
  "locationPhoto.create",
  "locationPhoto.deleteMany",
  "locationPhoto.updateMany",
] as const;
/** The client's methods, and the one a transaction's client adds ($queryRaw: the row lock). */
type StubName = (typeof STUB_NAMES)[number] | "$queryRaw";
/** A transaction's row locks, released when it ends (commits or rolls back). */
interface TxCtx {
  held: (() => void)[];
}
type Handler = (a: unknown, ctx: TxCtx | null) => unknown;
const db = prisma as unknown as { locationCheckin: Record<string, unknown>; locationPhoto: Record<string, unknown>; $transaction: unknown };
const calls: string[] = [];
const argsOf: Partial<Record<StubName, unknown[]>> = {};
let answers: Partial<Record<StubName, Handler>> = {};
const stubs = new Map<string, unknown>();
const originals = new Map<string, unknown>();
function answer(next: Partial<Record<StubName, Handler>>) {
  calls.length = 0;
  for (const k of [...STUB_NAMES, "$queryRaw" as const]) delete argsOf[k];
  answers = next;
}
/**
 * One call as Prisma makes it: lazy (it runs when awaited, so a batch transaction runs its writes in order, one after
 * another), in the transaction that awaits it (a batch sets `ctx` before it awaits each one; an interactive
 * transaction's client makes its calls with its own).
 */
interface Op extends PromiseLike<unknown> {
  ctx: TxCtx | null;
}
function op(name: StubName, a: unknown, ctx: TxCtx | null = null): Op {
  calls.push(name);
  (argsOf[name] ??= []).push(a);
  let ran: Promise<unknown> | null = null;
  const o: Op = {
    ctx,
    then(onOk, onErr) {
      ran ??= (async () => {
        const h = answers[name];
        if (!h) throw new Error(`places-check: nothing stubbed for ${name}`);
        return h(a, o.ctx);
      })();
      return ran.then(onOk, onErr);
    },
  };
  return o;
}
/** Row locks (FOR SHARE, and the lock a DELETE or UPDATE takes), as one holder at a time: enough to order two writers. */
const rowLocks = new Map<string, Promise<void>>();
async function lockRow(id: string, ctx: TxCtx | null): Promise<void> {
  if (!ctx) throw new Error("places-check: a row lock outside a transaction");
  for (let held = rowLocks.get(id); held; held = rowLocks.get(id)) await held;
  let release!: () => void;
  rowLocks.set(id, new Promise<void>((r) => (release = r)));
  ctx.held.push(() => {
    rowLocks.delete(id);
    release();
  });
}
function install() {
  for (const name of STUB_NAMES) {
    const [model, method] = name.split(".") as ["locationCheckin" | "locationPhoto", string];
    originals.set(name, db[model][method]);
    const stub = (a: unknown) => op(name, a);
    db[model][method] = stub;
    stubs.set(name, stub);
  }
  originals.set("$transaction", db.$transaction);
  const clientOf = (ctx: TxCtx) => {
    const model = (m: "locationCheckin" | "locationPhoto") =>
      Object.fromEntries(STUB_NAMES.filter((n) => n.startsWith(`${m}.`)).map((n) => [n.split(".")[1], (a: unknown) => op(n, a, ctx)]));
    return {
      locationCheckin: model("locationCheckin"),
      locationPhoto: model("locationPhoto"),
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => op("$queryRaw", { sql: strings.join("?"), values }, ctx),
    };
  };
  const tx = async (ops: unknown) => {
    calls.push("$transaction");
    const ctx: TxCtx = { held: [] };
    try {
      if (typeof ops === "function") return await (ops as (client: unknown) => Promise<unknown>)(clientOf(ctx));
      if (!Array.isArray(ops)) throw new Error("places-check: a transaction is a list of writes or a function");
      const out: unknown[] = [];
      for (const o of ops as Op[]) {
        o.ctx = ctx;
        out.push(await o);
      }
      return out;
    } finally {
      for (const release of ctx.held.splice(0)) release();
    }
  };
  db.$transaction = tx;
  stubs.set("$transaction", tx);
}
const inPlace = () =>
  STUB_NAMES.every((n) => {
    const [model, method] = n.split(".") as ["locationCheckin" | "locationPhoto", string];
    return db[model][method] === stubs.get(n);
  }) && db.$transaction === stubs.get("$transaction");
function uninstall() {
  for (const name of STUB_NAMES) {
    const [model, method] = name.split(".") as ["locationCheckin" | "locationPhoto", string];
    db[model][method] = originals.get(name);
  }
  db.$transaction = originals.get("$transaction");
}
const known = (c: string, message = "x") => new Prisma.PrismaClientKnownRequestError(message, { code: c, clientVersion: "6" });
interface Row {
  id: string;
  placeName: string;
  placeKey: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  visitedAt: Date;
  day: Date;
  service: number | null;
  food: number | null;
  premises: number | null;
  parking: number | null;
  summary: string | null;
}
function row(o: Partial<Row> = {}): Row {
  const at = o.visitedAt ?? new Date("2026-11-01T01:00:00.000Z");
  return { id: "ck_row", placeName: "Café Lumen", placeKey: "cafe lumen", address: null, lat: null, lng: null, accuracyM: null, visitedAt: at, day: dateColumn(dayKeyOf(at)), service: 5, food: 4, premises: 4, parking: null, summary: "Good.", ...o };
}
const thumbRow = (checkinId: string, ord: number, id = `th_${checkinId}_${ord}`) => ({ id, checkinId, ord, kind: "thumb", width: 480, height: 360 });
const fullRow = (checkinId: string, ord: number, id = `ph_${checkinId}_${ord}`) => ({ id, checkinId, ord, kind: "full", width: 1600, height: 1200 });
const VISIT_SELECT = { id: true, placeName: true, placeKey: true, address: true, lat: true, lng: true, accuracyM: true, visitedAt: true, day: true, service: true, food: true, premises: true, parking: true, summary: true };
const META = { id: true, checkinId: true, ord: true, kind: true, width: true, height: true };

async function serverChecks(logged: string[]) {
  console.log("— server (stubbed client)");
  check(
    "isMissingPlacesTable: P2021, Postgres 42P01, or 'relation …LocationCheckin/LocationPhoto… does not exist'; nothing else",
    isMissingPlacesTable(known("P2021")) && !isMissingPlacesTable(known("P2002")) && isMissingPlacesTable(new Error('relation "public.LocationCheckin" does not exist')) && isMissingPlacesTable(new Error('relation "LocationPhoto" does not exist')) && isMissingPlacesTable(new Error("ERROR: 42P01")) && !isMissingPlacesTable(new Error('relation "public.MoodCheck" does not exist')) && !isMissingPlacesTable(new Error("timeout")) && !isMissingPlacesTable(null)
  );
  eq("placesErrorTag: a Prisma code or a class name, never the message", [placesErrorTag(known("P2000", "value too long: Sentinelvalue")), placesErrorTag(new TypeError("Sentinelvalue")), placesErrorTag("Sentinelvalue"), placesErrorTag(undefined)], ["P2000", "TypeError", "string", "undefined"]);

  install();
  if (!inPlace()) {
    check("the stubs are in place before any server call", false, "a delegate did not take its stub; the server checks are skipped so nothing reaches a database");
    uninstall();
    return;
  }
  check("the stubs are in place before any server call (nothing below reaches a database)", true);
  const threw: string[] = [];
  const run = async <R>(label: string, f: () => Promise<R>): Promise<R | null> => {
    try {
      return await f();
    } catch (e) {
      threw.push(`${label}: ${(e as Error).name} ${(e as Error).message}`);
      return null;
    }
  };

  // Reads.
  const later = row({ id: "ck_b", placeName: "Harbour Fish Bar", placeKey: "harbour fish bar", visitedAt: new Date("2026-10-30T08:00:00.000Z"), service: null, food: 5, premises: null, parking: null, lat: -33.86, lng: 151.2, accuracyM: 9 });
  const newer = row({ id: "ck_a" });
  answer({ "locationCheckin.findMany": () => [later, newer], "locationPhoto.findMany": () => [thumbRow("ck_a", 2), thumbRow("ck_a", 0), thumbRow("ck_a", 1)] });
  const v = await run("list", () => loadPlacesView("u-read", NOW));
  check(
    "the list: ready, every visit newest first, its overall derived (never read), its first thumbnail (the lowest place) and its photo count",
    !!v && v.ready && !v.failed && same(v.visits.map((x) => x.id), ["ck_a", "ck_b"]) && v.visits[0].overall === 4.3 && v.visits[0].thumb?.id === "th_ck_a_0" && v.visits[0].thumb?.src === "/places/photo/th_ck_a_0" && v.visits[0].photoCount === 3 && v.visits[1].thumb === null && v.visits[1].overall === 5,
    JSON.stringify(v?.visits.map((x) => [x.id, x.overall, x.thumb?.id, x.photoCount]))
  );
  check("…a location only when both coordinates are there; the life day from its DATE column", !!v && same(v.visits[1].location, { lat: -33.86, lng: 151.2, accuracyM: 9 }) && v.visits[0].location === null && v.visits[0].day === "2026-11-01");
  eq(
    "the list's reads: the user's newest 1000 visits (their columns only, no clientId), and their thumbnails' ids and sizes, never a photo's bytes",
    [argsOf["locationCheckin.findMany"]?.[0], argsOf["locationPhoto.findMany"]?.[0]],
    [
      { where: { userId: "u-read" }, orderBy: [{ visitedAt: "desc" }, { id: "desc" }], take: 1000, select: VISIT_SELECT },
      { where: { userId: "u-read", kind: "thumb" }, select: META },
    ]
  );
  await run("list cached", () => loadPlacesView("u-read", NOW));
  check("…cached under 'places' (a second read within the TTL queries nothing)", calls.length === 2, calls.join(","));
  answer({ "locationCheckin.findMany": () => Promise.reject(known("P2021")), "locationPhoto.findMany": () => [] });
  const missing = await run("list missing", () => loadPlacesView("u-missing", NOW));
  answer({ "locationCheckin.findMany": () => Promise.reject(new Error("Sentinelvalue timeout")), "locationPhoto.findMany": () => [] });
  const down = await run("list down", () => loadPlacesView("u-down", NOW));
  check(
    "fail soft: a missing table reads not ready (the page says a database update is needed); any other failure not ready and failed (never 'no visits yet'); never a throw",
    !!missing && !missing.ready && !missing.failed && missing.visits.length === 0 && !!down && !down.ready && down.failed && down.visits.length === 0
  );

  answer({
    "locationCheckin.findFirst": () => row({ id: "ck_d" }),
    "locationPhoto.findMany": (a) => ((a as { where: { kind?: string } }).where.kind === "thumb" ? [thumbRow("ck_o", 0)] : [fullRow("ck_d", 1), thumbRow("ck_d", 1), fullRow("ck_d", 0), thumbRow("ck_d", 0), thumbRow("ck_d", 3)]),
    "locationCheckin.findMany": () => [row({ id: "ck_o", visitedAt: new Date("2026-10-01T01:00:00.000Z") })],
  });
  const d = await run("detail", () => loadVisitDetail("u-d", "ck_d", NOW));
  check(
    "a visit's page: its photos in order (each place's full image and thumbnail; a place with no full image skipped), its other visits by place key",
    !!d && d.ready && d.visit?.id === "ck_d" && same(d.photos.map((p) => [p.ord, p.full.id, p.thumb?.id]), [[0, "ph_ck_d_0", "th_ck_d_0"], [1, "ph_ck_d_1", "th_ck_d_1"]]) && d.visit?.photoCount === 2 && d.visit?.thumb?.id === "th_ck_d_0" && same(d.others.map((o) => [o.id, o.thumb?.id]), [["ck_o", "th_ck_o_0"]]),
    JSON.stringify(d)
  );
  eq(
    "…its reads: the user's own visit, its photos' metadata (never bytes), the other visits to the same place (not this one), their thumbnails",
    [argsOf["locationCheckin.findFirst"]?.[0], argsOf["locationPhoto.findMany"]?.[0], argsOf["locationCheckin.findMany"]?.[0], argsOf["locationPhoto.findMany"]?.[1]],
    [
      { where: { id: "ck_d", userId: "u-d" }, select: VISIT_SELECT },
      { where: { userId: "u-d", checkinId: "ck_d" }, select: META },
      { where: { userId: "u-d", placeKey: "cafe lumen", NOT: { id: "ck_d" } }, orderBy: [{ visitedAt: "desc" }, { id: "desc" }], take: 50, select: VISIT_SELECT },
      { where: { userId: "u-d", kind: "thumb", checkinId: { in: ["ck_o"] } }, select: META },
    ]
  );
  answer({ "locationCheckin.findFirst": () => null });
  const gone = await run("detail gone", () => loadVisitDetail("u-d", "ck_gone", NOW));
  answer({});
  const badId = await run("detail bad", () => loadVisitDetail("u-d", "not an id!", NOW));
  check("a visit that isn't there reads visit: null (ready); an id that can't be one is read from nowhere", !!gone && gone.ready && gone.visit === null && !!badId && badId.visit === null && calls.length === 0);
  answer({ "locationCheckin.findFirst": () => Promise.reject(known("P2021")) });
  const dm = await run("detail missing", () => loadVisitDetail("u-d2", "ck_d", NOW));
  answer({ "locationCheckin.findFirst": () => Promise.reject(new Error("down")) });
  const dd = await run("detail down", () => loadVisitDetail("u-d3", "ck_d", NOW));
  check("…and fails soft as the list does", !!dm && !dm.ready && !dm.failed && !!dd && !dd.ready && dd.failed);

  // A new check-in.
  answer({});
  const refused = await run("bad input", () => saveVisitCore("u-w", base({ placeName: "" }), NOW));
  eq("a save checks its input again before any call", [refused, calls.length], [{ ok: false, error: NAME_NEEDED }, 0]);
  answer({ "locationCheckin.findMany": () => [], "locationPhoto.findMany": () => [] });
  await run("prime", () => loadPlacesView("u-w", NOW));
  answer({ "locationCheckin.findUnique": () => null, "locationCheckin.create": () => ({ id: "ck_new" }) });
  const s = await run("save", () => saveVisitCore("u-w", base({ ratings: { service: 4 }, location: { lat: -33.8, lng: 151.2, accuracyM: 20 }, summary: "Nice." }), NOW));
  const data = (argsOf["locationCheckin.create"]?.[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  check("a new check-in: the clientId read first, then one row, its id back (no replay, no photos yet)", !!s && same(s, { ok: true, value: { id: "ck_new", replay: false, photoCount: 0 } }) && same(calls, ["locationCheckin.findUnique", "locationCheckin.create"]), JSON.stringify(s));
  check(
    "…the row: the user's, its clientId, the name and its key, the location's three columns, the instant and its life day (DATE), the four ratings, the summary; no overall stored",
    data.userId === "u-w" && data.clientId === CID && data.placeName === "Café Lumen" && data.placeKey === "cafe lumen" && data.lat === -33.8 && data.lng === 151.2 && data.accuracyM === 20 &&
      (data.visitedAt as Date).toISOString() === "2026-11-01T01:00:00.000Z" && (data.day as Date).toISOString() === "2026-11-01T00:00:00.000Z" && data.service === 4 && data.food === null && data.summary === "Nice." && !("overall" in data) &&
      Object.keys(data).length === 15,
    JSON.stringify(data)
  );
  answer({ "locationCheckin.findMany": () => [row({ id: "ck_new" })], "locationPhoto.findMany": () => [] });
  const after = await run("after save", () => loadPlacesView("u-w", NOW));
  check("…and the 'places' tag is cleared: the next list reads again", !!after && after.visits.length === 1 && calls.includes("locationCheckin.findMany"));

  const stored = row({ id: "ck_known", placeName: "Café Lumen", visitedAt: new Date("2026-11-01T01:00:00.000Z"), service: 5, food: 4, premises: 4, parking: null, summary: "Good." });
  answer({ "locationCheckin.findUnique": () => stored, "locationPhoto.count": () => 2 });
  const replay = await run("replay", () => saveVisitCore("u-w", base({ ratings: { service: 5, food: 4, premises: 4 }, summary: "Good." }), NOW));
  check("clientId replay: a resend with the same values answers the row the first send wrote (replay: true, its photos counted), and writes nothing", !!replay && same(replay, { ok: true, value: { id: "ck_known", replay: true, photoCount: 2 } }) && !calls.includes("locationCheckin.create") && !calls.includes("locationCheckin.updateMany"), calls.join(","));
  eq("…the key is the user's and the clientId", argsOf["locationCheckin.findUnique"]?.[0], { where: { userId_clientId: { userId: "u-w", clientId: CID } }, select: VISIT_SELECT });
  answer({ "locationCheckin.findUnique": () => stored, "locationPhoto.count": () => 0, "locationCheckin.updateMany": () => ({ count: 1 }) });
  const changed = await run("changed", () => saveVisitCore("u-w", base({ ratings: { service: 2, food: 4, premises: 4 }, summary: "Good." }), NOW));
  check(
    "…a resend with changed values (the first answer was lost and the form changed) updates that one row, scoped to the user, and answers it",
    !!changed && same(changed, { ok: true, value: { id: "ck_known", replay: false, photoCount: 0 } }) && same((argsOf["locationCheckin.updateMany"]?.[0] as { where?: unknown })?.where, { id: "ck_known", userId: "u-w" }) && !calls.includes("locationCheckin.create")
  );
  let lookups = 0;
  answer({
    "locationCheckin.findUnique": () => (lookups++ === 0 ? null : stored),
    "locationCheckin.create": () => Promise.reject(known("P2002")),
    "locationPhoto.count": () => 0,
  });
  const race = await run("race", () => saveVisitCore("u-w", base({ ratings: { service: 5, food: 4, premises: 4 }, summary: "Good." }), NOW));
  check("…two sends racing on the unique (userId, clientId) end the same way: the loser answers the winner's row", !!race && race.ok && race.value.id === "ck_known" && race.value.replay);
  answer({ "locationCheckin.findUnique": () => null, "locationCheckin.create": () => Promise.reject(known("P2021")) });
  const sm = await run("save missing", () => saveVisitCore("u-w", base(), NOW));
  answer({ "locationCheckin.findUnique": () => null, "locationCheckin.create": () => Promise.reject(known("P2000", "value too long: Sentinelvalue")) });
  const sd = await run("save down", () => saveVisitCore("u-w", base(), NOW));
  eq("a failed save answers { ok: false } in one plain line (the not-ready line before the migration), never a throw", [sm, sd], [{ ok: false, error: PLACES_NOT_READY }, { ok: false, error: SAVE_FAILED }]);

  // Edit.
  answer({});
  eq("an edit of an id that can't be one, or of bad input, is refused before any call", [await run("upd bad id", () => updateVisitCore("u-w", "a b", base(), [], NOW)), await run("upd bad", () => updateVisitCore("u-w", "ck_e", base({ summary: "x".repeat(281) }), [], NOW)), calls.length], [{ ok: false, error: VISIT_GONE }, { ok: false, error: SUMMARY_TOO_LONG }, 0]);
  answer({ "locationCheckin.updateMany": () => ({ count: 0 }) });
  const ug = await run("upd gone", () => updateVisitCore("u-w", "ck_e", base(), ["ph_0"], NOW));
  eq("…of a visit that isn't there (the fields' update finds no row), VISIT_GONE, and no photo is read or touched", [ug, calls], [{ ok: false, error: VISIT_GONE }, ["$transaction", "locationCheckin.updateMany"]]);
  answer({
    "locationCheckin.updateMany": () => ({ count: 1 }),
    "locationPhoto.findMany": () => [0, 1, 2, 3].map((o) => ({ id: `ph_${o}`, ord: o })),
    "locationPhoto.deleteMany": () => ({ count: 4 }),
    "locationPhoto.updateMany": () => ({ count: 2 }),
  });
  const u = await run("upd", () => updateVisitCore("u-w", "ck_e", base({ placeName: "Cafe Lumen", ratings: { food: 3 } }), ["ph_2", "ph_0"], NOW));
  check(
    "an edit: one transaction: the fields first (their row lock), then the stored photos read, the ones named by id removed (both sizes) and the rest closed up in order; its photo count says where new ones go",
    !!u && same(u, { ok: true, value: { id: "ck_e", replay: false, photoCount: 2 } }) &&
      same(calls, ["$transaction", "locationCheckin.updateMany", "locationPhoto.findMany", "locationPhoto.deleteMany", "locationPhoto.updateMany", "locationPhoto.updateMany"]) &&
      same(argsOf["locationPhoto.deleteMany"]?.[0], { where: { userId: "u-w", checkinId: "ck_e", ord: { in: [0, 2] } } }) &&
      same(argsOf["locationPhoto.updateMany"], [{ where: { userId: "u-w", checkinId: "ck_e", ord: 1 }, data: { ord: 0 } }, { where: { userId: "u-w", checkinId: "ck_e", ord: 3 }, data: { ord: 1 } }]) &&
      same((argsOf["locationCheckin.updateMany"]?.[0] as { where?: unknown })?.where, { id: "ck_e", userId: "u-w" }) &&
      same(argsOf["locationPhoto.findMany"]?.[0], { where: { userId: "u-w", checkinId: "ck_e", kind: "full" }, select: { id: true, ord: true } }),
    calls.join(",")
  );
  const ud = (argsOf["locationCheckin.updateMany"]?.[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  check("…the edit writes the fields only (never the clientId, never the user)", ud.placeName === "Cafe Lumen" && ud.food === 3 && ud.service === null && !("clientId" in ud) && !("userId" in ud), JSON.stringify(ud));

  {
    // A retried or stale Edit, on a store that keeps what each commit did. Photos are named by id, so a replay after a
    // lost answer, or an edit drawn before another tab's, removes only what it named.
    type P = { id: string; checkinId: string; ord: number; kind: string };
    let photos: P[] = [];
    const seed = (ids: string[]) => {
      photos = ids.flatMap((id, ord) => [
        { id, checkinId: "ck_s", ord, kind: "full" },
        { id: `${id}_t`, checkinId: "ck_s", ord, kind: "thumb" },
      ]);
    };
    const held = () => photos.filter((x) => x.kind === "full").sort((a, b) => a.ord - b.ord).map((x) => `${x.id}@${x.ord}`);
    const pairsOk = () => photos.filter((x) => x.kind === "full").every((f) => photos.some((t) => t.kind === "thumb" && t.id === `${f.id}_t` && t.ord === f.ord));
    answer({});
    const store = {
      "locationCheckin.updateMany": () => ({ count: 1 }),
      "locationPhoto.findMany": () => photos.filter((x) => x.kind === "full").map((x) => ({ id: x.id, ord: x.ord })),
      "locationPhoto.deleteMany": (a: unknown) => {
        const w = (a as { where: { ord: { in: number[] } } }).where;
        const before = photos.length;
        photos = photos.filter((x) => !w.ord.in.includes(x.ord));
        return { count: before - photos.length };
      },
      "locationPhoto.updateMany": (a: unknown) => {
        const { where: w, data } = a as { where: { ord: number }; data: { ord: number } };
        let n = 0;
        for (const x of photos) {
          if (x.ord !== w.ord) continue;
          x.ord = data.ord;
          n++;
        }
        return { count: n };
      },
    };
    const edit = async (remove: string[]) => {
      answer(store);
      const r = await run("upd store", () => updateVisitCore("u-w", "ck_s", base(), remove, NOW));
      return { r, writes: calls.filter((c) => c === "locationPhoto.deleteMany" || c === "locationPhoto.updateMany").length };
    };
    seed(["A", "B", "C"]);
    const first = await edit(["B"]);
    const afterFirst = held();
    const again = await edit(["B"]);
    check(
      "a retried Edit (its answer lost): A@0 B@1 C@2 with B removed holds A@0 C@1; the same edit sent again removes nothing and moves nothing (photoCount 2 both times)",
      same(afterFirst, ["A@0", "C@1"]) && same(held(), ["A@0", "C@1"]) && first.r?.ok === true && first.r.value.photoCount === 2 && again.r?.ok === true && again.r.value.photoCount === 2 && again.writes === 0 && pairsOk(),
      JSON.stringify([afterFirst, held(), first, again])
    );
    seed(["P0", "P1", "P2", "P3"]);
    await edit(["P0", "P2"]);
    const four = held();
    const four2 = await edit(["P0", "P2"]);
    check("…four photos with the first and third removed hold P1@0 P3@1, and the replay keeps them both", same(four, ["P1@0", "P3@1"]) && same(held(), ["P1@0", "P3@1"]) && four2.writes === 0 && four2.r?.ok === true && four2.r.value.photoCount === 2 && pairsOk(), JSON.stringify([four, held()]));
    seed(["A", "B", "C", "D"]);
    const stale = await edit(["B"]);
    check("a stale Edit (D was added in another tab after this page was drawn): removing B keeps D, closed up after C (A@0 C@1 D@2, photoCount 3)", same(held(), ["A@0", "C@1", "D@2"]) && stale.r?.ok === true && stale.r.value.photoCount === 3 && pairsOk(), JSON.stringify(held()));
    seed(["A", "B"]);
    const unknown = await edit(["X", "Y"]);
    check("…an id the visit doesn't hold removes nothing (never read as a place)", same(held(), ["A@0", "B@1"]) && unknown.writes === 0 && unknown.r?.ok === true && unknown.r.value.photoCount === 2);
  }

  // Delete: the cascade.
  answer({});
  eq("a delete of an id that can't be one is refused before any call", [await run("del bad", () => deleteVisitCore("u-w", "x y")), calls.length], [{ ok: false, error: VISIT_GONE }, 0]);
  answer({ "locationPhoto.deleteMany": () => ({ count: 8 }), "locationCheckin.deleteMany": () => ({ count: 1 }) });
  const del = await run("del", () => deleteVisitCore("u-w", "ck_e"));
  check(
    "a delete: one transaction, the visit first (its row lock waits for an upload in flight), then every photo of it (both sizes, the user's); the visit's count back",
    !!del && same(del, { ok: true, value: { deleted: 1 } }) && same(calls, ["locationCheckin.deleteMany", "locationPhoto.deleteMany", "$transaction"]) && same(argsOf["locationPhoto.deleteMany"]?.[0], { where: { userId: "u-w", checkinId: "ck_e" } }) && same(argsOf["locationCheckin.deleteMany"]?.[0], { where: { userId: "u-w", id: "ck_e" } })
  );
  answer({ "locationPhoto.deleteMany": () => ({ count: 0 }), "locationCheckin.deleteMany": () => ({ count: 0 }) });
  eq("…a visit already gone is not an error (deleted: 0)", await run("del gone", () => deleteVisitCore("u-w", "ck_e")), { ok: true, value: { deleted: 0 } });
  answer({ "locationPhoto.deleteMany": () => Promise.reject(known("P2021")), "locationCheckin.deleteMany": () => ({ count: 0 }) });
  eq("…a failed delete answers { ok: false }", await run("del missing", () => deleteVisitCore("u-w", "ck_e")), { ok: false, error: PLACES_NOT_READY });

  // Photos.
  const full = jpeg({ width: 1600, height: 1200, exif: true, comment: true });
  const thumb = jpeg({ width: 480, height: 360, exif: true });
  answer({});
  eq(
    "a photo is checked from its bytes before anything is read: a bad place, a bad id, a photo or a thumbnail the checks refuse",
    [
      await run("ph ord", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "4", full, thumb })),
      await run("ph id", () => savePhotoCore("u-w", { visitId: "x y", ord: "0", full, thumb })),
      await run("ph full", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "0", full: jpeg({ width: 2000, height: 100 }), thumb })),
      await run("ph thumb", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "0", full, thumb: full })),
      await run("ph png", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "0", full: u8([0x89, 0x50, 0x4e, 0x47]), thumb })),
      calls.length,
    ],
    [{ ok: false, error: PHOTO_SLOT_BAD }, { ok: false, error: VISIT_GONE }, { ok: false, error: PHOTO_TOO_WIDE }, { ok: false, error: THUMB_TOO_WIDE }, { ok: false, error: PHOTO_NOT_IMAGE }, 0]
  );
  answer({ "$queryRaw": () => [] });
  const pg = await run("ph gone", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "1", full, thumb }));
  eq("…a photo for a visit that isn't the user's (or isn't there) is refused, nothing written", [pg, calls], [{ ok: false, error: VISIT_GONE }, ["$transaction", "$queryRaw"]]);
  let made = 0;
  answer({
    "$queryRaw": () => [{ id: "ck_p" }],
    "locationPhoto.deleteMany": () => ({ count: 2 }),
    "locationPhoto.create": (a) => {
      const dd = (a as { data: { width: number; height: number } }).data;
      made++;
      return { id: `ph_new_${made}`, width: dd.width, height: dd.height };
    },
  });
  const ph = await run("ph", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "1", full, thumb }));
  const creates = (argsOf["locationPhoto.create"] ?? []).map((a) => (a as { data: Record<string, unknown> }).data);
  check(
    "a photo: one transaction that checks the visit under a lock on its row, empties its place (both sizes) and writes the photo and its thumbnail as new rows; their ids, sources and sizes back",
    !!ph && ph.ok && same(ph.value, { ord: 1, full: { id: "ph_new_1", src: "/places/photo/ph_new_1", width: 1600, height: 1200 }, thumb: { id: "ph_new_2", src: "/places/photo/ph_new_2", width: 480, height: 360 } }) &&
      same(calls, ["$transaction", "$queryRaw", "locationPhoto.deleteMany", "locationPhoto.create", "locationPhoto.create"]) && same(argsOf["locationPhoto.deleteMany"]?.[0], { where: { userId: "u-w", checkinId: "ck_p", ord: 1 } }),
    JSON.stringify(ph)
  );
  const lockQ = argsOf["$queryRaw"]?.[0] as { sql: string; values: unknown[] } | undefined;
  check(
    "…the check is the user's own visit's row, read FOR SHARE (a delete waits for this commit; this waits for a delete's)",
    !!lockQ && /^SELECT "id" FROM "public"\."LocationCheckin" WHERE "id" = \? AND "userId" = \? FOR SHARE$/.test(lockQ.sql) && same(lockQ.values, ["ck_p", "u-w"]),
    JSON.stringify(lockQ)
  );
  check(
    "…each row: the user's, the visit, its place, its kind, the type and pixels read from the bytes, the bytes with no metadata (no EXIF, no GPS, no comment), sizeBytes their length",
    creates.length === 2 && creates.map((c) => c.kind).join() === "full,thumb" && creates.every((c) => c.userId === "u-w" && c.checkinId === "ck_p" && c.ord === 1 && c.mime === "image/jpeg") &&
      creates.every((c) => c.bytes instanceof Uint8Array && !hasText(c.bytes as Uint8Array, "Exif") && !hasText(c.bytes as Uint8Array, "SentinelGPS") && !hasText(c.bytes as Uint8Array, "SentinelCOM") && (c.bytes as Uint8Array).length === c.sizeBytes) &&
      creates[0].width === 1600 && creates[1].width === 480
  );
  answer({ "$queryRaw": () => [{ id: "ck_p" }], "locationPhoto.deleteMany": () => ({ count: 0 }), "locationPhoto.create": () => Promise.reject(known("P2021")) });
  eq("…a failed photo answers { ok: false }", await run("ph missing", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "0", full, thumb })), { ok: false, error: PLACES_NOT_READY });
  answer({ "$queryRaw": () => Promise.reject(known("P2021")) });
  eq("…and so does a missing table at the lock", await run("ph lock missing", () => savePhotoCore("u-w", { visitId: "ck_p", ord: "0", full, thumb })), { ok: false, error: PLACES_NOT_READY });

  {
    // An upload racing a delete, on a store with row locks: whichever takes the visit's row first, no photo row is left
    // for a visit that is gone.
    type P = { id: string; checkinId: string; ord: number; kind: string };
    const visits = new Set<string>();
    let photos: P[] = [];
    let seq = 0;
    const idOf = (a: unknown) => (a as { values: unknown[] }).values[0] as string;
    const race: { del?: Promise<PlacesResult<{ deleted: number }>>; up?: Promise<PlacesResult<VisitPhoto>> } = {};
    const storeAnswers = (hooks: { onLock?: () => void; onDelete?: (id: string) => void }): Partial<Record<StubName, Handler>> => ({
      $queryRaw: async (a, ctx) => {
        const id = idOf(a);
        await lockRow(id, ctx);
        hooks.onLock?.();
        return visits.has(id) ? [{ id }] : [];
      },
      "locationCheckin.deleteMany": async (a, ctx) => {
        const id = (a as { where: { id: string } }).where.id;
        await lockRow(id, ctx);
        hooks.onDelete?.(id);
        return { count: visits.delete(id) ? 1 : 0 };
      },
      "locationPhoto.deleteMany": (a) => {
        const w = (a as { where: { checkinId: string; ord?: number } }).where;
        const before = photos.length;
        photos = photos.filter((x) => !(x.checkinId === w.checkinId && (w.ord === undefined || x.ord === w.ord)));
        return { count: before - photos.length };
      },
      "locationPhoto.create": (a) => {
        const d = (a as { data: { checkinId: string; ord: number; kind: string; width: number; height: number } }).data;
        const id = `ph_race_${++seq}`;
        photos.push({ id, checkinId: d.checkinId, ord: d.ord, kind: d.kind });
        return { id, width: d.width, height: d.height };
      },
    });
    visits.add("ck_r1");
    answer(
      storeAnswers({
        // A delete arrives while the upload holds the row (between its check and its writes).
        onLock: () => {
          race.del ??= deleteVisitCore("u-r", "ck_r1");
        },
      })
    );
    const up1 = await run("race up", () => savePhotoCore("u-r", { visitId: "ck_r1", ord: "0", full, thumb }));
    const del1 = await race.del;
    check(
      "an upload that takes the visit's row first, with a delete arriving mid-write: the upload lands, the delete waits for its commit, then removes the visit and the new rows with it (no orphan photo)",
      !!up1 && up1.ok && !!del1 && del1.ok && del1.value.deleted === 1 && !visits.has("ck_r1") && photos.filter((x) => x.checkinId === "ck_r1").length === 0 && seq === 2,
      JSON.stringify({ up1, del1, photos })
    );
    visits.add("ck_r2");
    photos = [];
    seq = 0;
    answer(
      storeAnswers({
        // An upload arrives while the delete holds the row (its visit deleted, not yet committed).
        onDelete: (id) => {
          race.up ??= savePhotoCore("u-r", { visitId: id, ord: "1", full, thumb });
        },
      })
    );
    const del2 = await run("race del", () => deleteVisitCore("u-r", "ck_r2"));
    const up2 = await race.up;
    check(
      "…a delete that takes the row first: the upload waits for its commit, finds no visit, answers VISIT_GONE and creates nothing",
      !!del2 && del2.ok && del2.value.deleted === 1 && !!up2 && !up2.ok && up2.error === VISIT_GONE && !calls.includes("locationPhoto.create") && photos.length === 0 && rowLocks.size === 0,
      JSON.stringify({ del2, up2, photos, calls })
    );
  }
  answer({ "locationPhoto.findFirst": () => ({ mime: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }) });
  const lp = await run("load photo", () => loadPhotoCore("u-w", "ph_1"));
  check("an image's read: the user's own, its type and bytes only", !!lp && lp.ok && lp.value.mime === "image/jpeg" && same(argsOf["locationPhoto.findFirst"]?.[0], { where: { id: "ph_1", userId: "u-w" }, select: { mime: true, bytes: true } }));
  answer({ "locationPhoto.findFirst": () => null });
  eq("…one that isn't there is VISIT_GONE", await run("load photo gone", () => loadPhotoCore("u-w", "ph_x")), { ok: false, error: VISIT_GONE });

  // The route.
  const URL0 = "https://xtnl.test/places/photo";
  const form = (o: { full?: Uint8Array | null; thumb?: Uint8Array | null; visitId?: string; ord?: string } = {}) => {
    const fd = new FormData();
    fd.append("visitId", o.visitId ?? "ck_p");
    fd.append("ord", o.ord ?? "0");
    if (o.full !== null) fd.append("full", new Blob([new Uint8Array(o.full ?? full)], { type: "image/jpeg" }), "photo.jpg");
    if (o.thumb !== null) fd.append("thumb", new Blob([new Uint8Array(o.thumb ?? thumb)], { type: "image/jpeg" }), "thumb.jpg");
    return fd;
  };
  const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request(URL0, { method: "POST", body, headers: { "sec-fetch-site": "same-origin", origin: "https://xtnl.test", ...headers } });
  const seen: unknown[] = [];
  const fakeSave: typeof savePhotoCore = async (userId, input) => {
    seen.push({ userId, visitId: input.visitId, ord: input.ord, full: input.full.length, thumb: input.thumb.length });
    return input.visitId === "ck_gone" ? { ok: false, error: VISIT_GONE } : input.visitId === "ck_bad" ? { ok: false, error: PHOTO_TOO_BIG } : input.visitId === "ck_nr" ? { ok: false, error: PLACES_NOT_READY } : { ok: true, value: { ord: 0, full: { id: "a", src: "/places/photo/a", width: 1, height: 1 }, thumb: null } };
  };
  const deps = { userId: () => "u-route", save: fakeSave };
  const statusOf = async (r: Request) => (await handlePhotoUpload(r, deps)).status;
  const okRes = await handlePhotoUpload(post(form()), deps);
  const okBody = (await okRes.json()) as { ok: boolean };
  check(
    "the upload: a same-site multipart post reaches the core with its fields and both files' bytes; 200, JSON, never cached",
    okRes.status === 200 && okBody.ok === true && okRes.headers.get("cache-control") === "no-store" && /application\/json/.test(okRes.headers.get("content-type") ?? "") && same(seen[0], { userId: "u-route", visitId: "ck_p", ord: "0", full: full.length, thumb: thumb.length }),
    JSON.stringify(seen[0])
  );
  eq(
    "…another site is refused (403: Sec-Fetch-Site cross-site or same-site, or an Origin that isn't this host)",
    [await statusOf(post(form(), { "sec-fetch-site": "cross-site" })), await statusOf(post(form(), { "sec-fetch-site": "same-site" })), await statusOf(post(form(), { origin: "https://evil.example" })), await statusOf(post(form(), { origin: "null" }))],
    [403, 403, 403, 403]
  );
  eq("…JSON or text is refused (415); a missing file is a bad request (400)", [await statusOf(post(JSON.stringify({ a: 1 }), { "content-type": "application/json" })), await statusOf(post(form({ thumb: null }))), await statusOf(post(form({ full: null })))], [415, 400, 400]);
  const big = new Uint8Array(UPLOAD_MAX_BYTES + 10).fill(0x11);
  const declared = await statusOf(post(form({ full: big })));
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < 4; i++) c.enqueue(new Uint8Array(UPLOAD_MAX_BYTES / 2));
      c.close();
    },
  });
  const streamed = await handlePhotoUpload(new Request(URL0, { method: "POST", body: stream, headers: { "content-type": "multipart/form-data; boundary=x", "sec-fetch-site": "same-origin" }, duplex: "half" } as RequestInit), deps);
  eq(`…a body over UPLOAD_MAX_BYTES is refused (413), whether its length is declared or not (read no further)`, [declared, streamed.status], [413, 413]);
  eq("…the core's answers as statuses: a visit not there 404, a refused photo 422, before the migration 503", [await statusOf(post(form({ visitId: "ck_gone" }))), await statusOf(post(form({ visitId: "ck_bad" }))), await statusOf(post(form({ visitId: "ck_nr" })))], [404, 422, 503]);
  const realUpload = await handlePhotoUpload(post(form({ visitId: "x y" })), { userId: () => "u-route" });
  check("…and with the real core, a bad id is refused before any read (404)", realUpload.status === 404);

  const get = (headers: Record<string, string> = {}) => new Request(`${URL0}/ph_1`, { headers: { "sec-fetch-site": "same-origin", ...headers } });
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const loadDeps = { userId: () => "u-route", load: async (_u: string, id: string) => (id === "ph_1" ? { ok: true as const, value: { mime: "image/webp", bytes: image } } : { ok: false as const, error: VISIT_GONE }) };
  const g = await handlePhotoGet(get(), "ph_1", loadDeps);
  const gBytes = new Uint8Array(await g.arrayBuffer());
  check(
    "the image: 200 with its own type and length, nosniff, inline, and cached private and immutable (an id is never reused)",
    g.status === 200 && g.headers.get("content-type") === "image/webp" && g.headers.get("content-length") === "4" && g.headers.get("x-content-type-options") === "nosniff" && g.headers.get("cache-control") === PHOTO_CACHE && PHOTO_CACHE === "private, max-age=31536000, immutable" && Buffer.from(gBytes).equals(Buffer.from(image))
  );
  const gn = await handlePhotoGet(get({ "sec-fetch-site": "none" }), "ph_1", loadDeps);
  const gx = await handlePhotoGet(get({ "sec-fetch-site": "cross-site" }), "ph_1", loadDeps);
  const gm = await handlePhotoGet(get(), "ph_2", loadDeps);
  const gb = await handlePhotoGet(get(), "a/b", loadDeps);
  eq(
    "…opened on its own (none) it is served; another site never gets it (403); one that isn't there, or an id that can't be one, 404; errors never cached",
    [gn.status, gx.status, gm.status, gb.status, gx.headers.get("cache-control"), gm.headers.get("cache-control")],
    [200, 403, 404, 404, "no-store", "no-store"]
  );
  check("no core threw: every failure above came back as a value", threw.length === 0, threw.join(", "));

  await actionChecks();
  uninstall();
  const leaks = logged.filter((l) => /Sentinelvalue|Café|cafe lumen|-33\.8|DEFAULT_USER_ID/.test(l));
  const shapes = logged.filter((l) => !/^(loadPlacesView|loadVisitDetail|saveVisitCore|updateVisitCore|deleteVisitCore|savePhotoCore|loadPhotoCore|handlePhotoUpload|handlePhotoGet|saveVisit|updateVisit|deleteVisit)(?: failed: [\w]+|: the places tables are missing \(migration 20270105000000_place_checkins not applied\); showing no visits\.)$/.test(l));
  check(`the log lines (${logged.length}) say a label and a code or class name only: no value, no message`, logged.length >= 4 && leaks.length === 0 && shapes.length === 0, [...leaks, ...shapes].slice(0, 4).join(" | "));
  check("a missing table is said once per process, not on every read", logged.filter((l) => /the places tables are missing/.test(l)).length === 1);
}

async function actionChecks() {
  console.log("— actions");
  const env = process.env as Record<string, string | undefined>;
  const prev = env.DEFAULT_USER_ID;
  try {
    const A = await import("../src/app/actions/places");
    env.DEFAULT_USER_ID = "u-act";
    answer({});
    eq(
      "the actions check what the browser sends: nothing, an id that can't be one",
      [await A.saveVisit(null as never), await A.updateVisit("a b", base() as never, []), await A.deleteVisit("x y"), calls.length],
      [{ ok: false, error: "Nothing to save." }, { ok: false, error: "That visit isn't here." }, { ok: false, error: "That visit isn't here." }, 0]
    );
    answer({ "locationCheckin.findUnique": () => null, "locationCheckin.create": () => ({ id: "ck_act" }) });
    const res = await A.saveVisit({ ...base(), ratings: { food: 3, extra: 9 }, userId: "someone-else", overall: 5, xp: 50, day: "2020-01-01" } as never);
    const data = (argsOf["locationCheckin.create"]?.[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    check(
      "the input is copied by name: a sent userId, overall, day or anything else is dropped; the user is the server's",
      res.ok && data.userId === "u-act" && !("xp" in data) && !("overall" in data) && !("extra" in data) && (data.day as Date).toISOString() === "2026-11-01T00:00:00.000Z" && Object.keys(data).length === 15,
      JSON.stringify(data)
    );
    answer({ "locationPhoto.findMany": () => [{ id: "ph_a", ord: 0 }, { id: "ph_b", ord: 1 }], "locationCheckin.updateMany": () => ({ count: 1 }), "locationPhoto.deleteMany": () => ({ count: 2 }), "locationPhoto.updateMany": () => ({ count: 2 }) });
    const up = await A.updateVisit("ck_e", base() as never, ["ph_a", 7 as never, "not an id!", "ph_a"]);
    check(
      "Edit removes only the stored photos it names by id (a number, or a string that can't be an id, is dropped before the core); the rest close up",
      up.ok && up.value.photoCount === 1 && same(argsOf["locationPhoto.deleteMany"]?.[0], { where: { userId: "u-act", checkinId: "ck_e", ord: { in: [0] } } }) && same(argsOf["locationPhoto.updateMany"]?.[0], { where: { userId: "u-act", checkinId: "ck_e", ord: 1 }, data: { ord: 0 } })
    );
    answer({});
    const shapes = await Promise.all([[5, 4], "5", 5, true].map((r) => A.saveVisit({ ...base(), ratings: r } as never)));
    eq("the action's copy never turns malformed ratings into Not rated: an array, a string, a number or a boolean answers RATING_BAD, before any call", [shapes, calls.length], [[{ ok: false, error: RATING_BAD }, { ok: false, error: RATING_BAD }, { ok: false, error: RATING_BAD }, { ok: false, error: RATING_BAD }], 0]);
    for (const r of [null, undefined]) {
      answer({ "locationCheckin.findUnique": () => null, "locationCheckin.create": () => ({ id: "ck_nr" }) });
      const res = await A.saveVisit({ ...base(), ...(r === undefined ? {} : { ratings: r }) } as never);
      const d = (argsOf["locationCheckin.create"]?.[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
      check(`…ratings ${r === null ? "null" : "omitted"} still saves, all four Not rated`, res.ok && d.service === null && d.food === null && d.premises === null && d.parking === null, JSON.stringify(res));
    }
    answer({ "locationPhoto.deleteMany": () => ({ count: 2 }), "locationCheckin.deleteMany": () => ({ count: 1 }) });
    const dl = await A.deleteVisit("ck_e");
    check("Delete answers its count", dl.ok && dl.value.deleted === 1);
    env.DEFAULT_USER_ID = "";
    answer({});
    eq("an action that can't name its user answers a plain line and never throws", await A.deleteVisit("ck_e"), { ok: false, error: "Couldn't save that. Try again." });
  } finally {
    if (prev === undefined) delete env.DEFAULT_USER_ID;
    else env.DEFAULT_USER_ID = prev;
  }
  const src = read("src/app/actions/places.ts");
  check(
    "the actions: 'use server', each through run() (the user from getCurrentUserId, refresh() only when asked, a throw as one plain line)",
    src.startsWith('"use server";') && /const res = await fn\(getCurrentUserId\(\)\);\s*if \(res\.ok && opts\?\.refresh === true\) refresh\(\);/.test(src) && (code(src).match(/return run\("/g) ?? []).length === 3
  );
}

// ── §7 Guards ─────────────────────────────────────────────────────────────
console.log("— guards");
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
interface Spec {
  spec: string;
  typeOnly: boolean;
}
function specsOf(src: string): Spec[] {
  const c = code(src);
  const out: Spec[] = [];
  for (const m of c.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/gm)) out.push({ spec: m[2], typeOnly: !!m[1] });
  for (const m of c.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
  return out;
}
function resolveSpec(from: string, spec: string): string | null {
  let b: string;
  if (spec.startsWith("@/")) b = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) b = resolve(dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = b + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
function closureOf(starts: string[], types: boolean): { files: Set<string>; pkgs: Set<string> } {
  const files = new Set<string>();
  const pkgs = new Set<string>();
  const stack = starts.map((s) => resolve(ROOT, s));
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    if (!/\.tsx?$/.test(f)) continue;
    for (const s of specsOf(readFileSync(f, "utf8"))) {
      if (s.typeOnly && !types) continue;
      const r = resolveSpec(f, s.spec);
      if (r) stack.push(r);
      else if (!s.spec.startsWith(".") && !s.spec.startsWith("@/")) pkgs.add(s.spec);
    }
  }
  return { files, pkgs };
}
const PLACES_CODE = [
  "src/lib/places.ts",
  "src/lib/places-server.ts",
  "src/app/actions/places.ts",
  ...filesUnder(join(ROOT, "src/app/places")).map(rel),
  ...filesUnder(join(ROOT, "src/components/places")).map(rel),
  ...filesUnder(join(ROOT, "src/app/dev/style/places")).map(rel),
];
const PLACES_SET = new Set(PLACES_CODE.map((p) => resolve(ROOT, p)));
const SRC_FILES = filesUnder(join(ROOT, "src"));
check(`the Places code is where it should be (${PLACES_CODE.length} files: the rules, the server, the actions, the pages, the routes, the components, the fixtures)`, PLACES_CODE.length >= 20 && ["src/app/places/photo/route.ts", "src/app/places/photo/[id]/route.ts", "src/app/places/[id]/edit/page.tsx"].every((f) => PLACES_CODE.includes(f)), PLACES_CODE.join(", "));
const ECONOMY = [
  "life-economy", "life-tracks", "life-tracks-server", "activity", "mastery", "celebrations", "celebration-detect", "celebration-types", "celebrate", "xp", "streak", "streak-curve",
  "streak-mult", "streak-mult-server", "today-board", "goals", "goals-server", "momentum", "momentum-server", "momentum-roll", "daily-quests", "daily-quests-server", "side-quests",
  "side-quests-server", "week-calibration", "week-calibration-server", "week-audit", "week-audit-server", "mall", "mall-server", "mall-mobile-cores", "credits", "credits-server", "duty-economy",
  "settlement", "rest-tokens", "rest-tokens-server", "main-quest", "main-quest-server", "status-panel", "status-panel-server", "competency", "competency-server", "proof", "skill-decay",
  "skill-decay-server", "roadmap-economy", "roadmap-quests", "roadmap-quests-server", "life-weeks", "life-weeks-server", "tasks", "duty", "rituals", "life-grade", "leveling",
].filter((f) => existsSync(resolve(ROOT, `src/lib/${f}.ts`)));
check(`the economy list names real files (${ECONOMY.length}: the ledger, streaks, quests, side quests, calibration, the Mall, credits, celebrations …)`, ECONOMY.length >= 45 && ["activity", "xp", "streak", "mall", "credits", "momentum", "tasks"].every((f) => ECONOMY.includes(f)));
{
  // One way: no economy file (nor anything it reaches) imports a Places module …
  const econReach = closureOf(ECONOMY.map((f) => `src/lib/${f}.ts`), true);
  const hits = [...econReach.files].filter((f) => PLACES_SET.has(f)).map(rel);
  check("no economy file imports Places, directly or through anything it reaches (no XP, MP, streak, quest, Mall, credit or celebration from a visit)", hits.length === 0, hits.join(", "));
  // … and only Places' own files import a Places module at all (a new importer is a decision, pinned here on purpose).
  const importers = SRC_FILES.filter((f) => !PLACES_SET.has(f) && specsOf(readFileSync(f, "utf8")).some((s) => {
    const r = resolveSpec(f, s.spec);
    return r !== null && PLACES_SET.has(r);
  })).map(rel);
  check("only Places' own files import a Places module (the shell links /places by its path; no other page, route or job reads a visit)", importers.length === 0, importers.join(", "));
  // The other way: Places imports nothing from the economy, directly or through anything it reaches.
  const ECON_IMPORT = new RegExp(`from\\s+["'](?:\\./|@/lib/)(?:${ECONOMY.join("|")})["']`);
  const direct = PLACES_CODE.filter((f) => ECON_IMPORT.test(read(f)));
  check("Places' own files import nothing from the economy", direct.length === 0, direct.join(", "));
  const reach = closureOf(PLACES_CODE, false);
  const econReached = [...reach.files].map(rel).filter((f) => ECONOMY.some((e) => f === `src/lib/${e}.ts`));
  check(`…nor does anything they reach (${reach.files.size} files walked)`, econReached.length === 0 && reach.files.has(resolve(ROOT, "src/components/ui/Button.tsx")), econReached.join(", "));
  const WORDS = /recordActivity|activityEvent|celebrat|\bxp\b|\bmp\b|\bstreaks?\b|\bquests?\b|\breward|\bbonus\b|\bmall\b|\bcredits?\b|\bmark\(|\benqueue\(|\bchime\(|\bannounce\(/i;
  const worded = PLACES_CODE.filter((f) => WORDS.test(code(read(f))));
  check("no Places code (comments aside) writes a ledger row, pays, celebrates or names a streak, quest, Mall or credit", worded.length === 0, worded.map((f) => `${f}: ${WORDS.exec(code(read(f)))?.[0]}`).join(", "));
  const server = code(read("src/lib/places-server.ts"));
  const models = [...new Set([...server.matchAll(/\bprisma\.(\$?\w+)/g)].map((m) => m[1]))].sort();
  eq("the server touches its two tables and the transaction, nothing else (no ledger, no other model)", models, ["$transaction", "locationCheckin", "locationPhoto"]);
  const txModels = [...new Set([...server.matchAll(/\btx\.(\$?\w+)/g)].map((m) => m[1]))].sort();
  eq("…and inside a transaction, the same two tables and the one row lock ($queryRaw), nothing else", txModels, ["$queryRaw", "locationCheckin", "locationPhoto"]);
  const raws = [...server.matchAll(/\$queryRaw(?:<[^>]*>)?`([^`]*)`/g)].map((m) => m[1]);
  check(
    "…the one raw query reads the user's own visit's id FOR SHARE (no write, no other table, nothing unsafe)",
    raws.length === 1 && /^SELECT "id" FROM "public"\."LocationCheckin" WHERE "id" = \$\{visitId\} AND "userId" = \$\{userId\} FOR SHARE$/.test(raws[0]) && !/\$executeRaw|Unsafe\(/.test(server),
    raws.join(" | ")
  );
  const upd = fnBody(server, "updateVisitCore");
  const del = fnBody(server, "deleteVisitCore");
  const ph = fnBody(server, "savePhotoCore");
  check(
    "by source: an edit names its removed photos by id (cleanPhotoIds), locks the visit with the fields' update first and reads the photos inside that transaction; a delete deletes the visit before its photos; an upload checks the visit inside its write's transaction",
    /const removeIds = new Set\(cleanPhotoIds\(remove\)\);/.test(upd) && /prisma\.\$transaction\(async \(tx\) => \{\s*const updated = await tx\.locationCheckin\.updateMany\(/.test(upd) && /const stored = await tx\.locationPhoto\.findMany\(\{ where: \{ userId, checkinId: id, kind: "full" \}, select: \{ id: true, ord: true \} \}\);/.test(upd) &&
      /\[\s*prisma\.locationCheckin\.deleteMany\(\{ where: \{ userId, id \} \}\),\s*prisma\.locationPhoto\.deleteMany\(\{ where: \{ userId, checkinId: id \} \}\),\s*\]/.test(del) &&
      /prisma\.\$transaction\(async \(tx\) => \{\s*const locked = await tx\.\$queryRaw/.test(ph) && !/locationCheckin\.findFirst/.test(ph) && !/cleanKeepOrds|keepOrds/.test(server)
  );
  const prismaUsers = PLACES_CODE.filter((f) => /from\s+["'](?:\.\/|@\/lib\/)prisma["']/.test(read(f)));
  eq("only the server imports the client", prismaUsers, ["src/lib/places-server.ts"]);
}
{
  const geminiFile = resolve(ROOT, "src/lib/gemini.ts");
  const direct = SRC_FILES.filter((f) => specsOf(readFileSync(f, "utf8")).some((s) => s.spec.startsWith("@google/") || resolveSpec(f, s.spec) === geminiFile));
  check("the walk sees Gemini's importers (life-sizing.ts, roadmap-model.ts among them)", direct.map(rel).includes("src/lib/life-sizing.ts") && direct.map(rel).includes("src/lib/roadmap-model.ts"), direct.map(rel).join(", "));
  const reach = closureOf(PLACES_CODE, true);
  const hit = [...reach.files].filter((f) => f === geminiFile || direct.includes(f)).map(rel);
  const pkg = [...reach.pkgs].filter((p) => p.startsWith("@google/"));
  check("no Gemini module is reachable from Places (not gemini.ts, not any of its importers, not @google/*, not even a type)", hit.length === 0 && pkg.length === 0 && !PLACES_CODE.some((f) => /gemini/i.test(code(read(f)))), [...hit, ...pkg].join(", "));
  eq("places.ts imports only ./life-day (pure, client-safe)", specsOf(read("src/lib/places.ts")).map((s) => s.spec), ["./life-day"]);
  eq("places-server.ts imports Prisma, the client, the cache, life-day, the user and places only", specsOf(read("src/lib/places-server.ts")).map((s) => s.spec), ["@prisma/client", "./prisma", "./cache", "./life-day", "./user", "./places"]);
  eq("the actions import refresh, the user, places and places-server only", specsOf(read("src/app/actions/places.ts")).map((s) => s.spec), ["next/cache", "@/lib/user", "@/lib/places", "@/lib/places-server"]);
  const comps = filesUnder(join(ROOT, "src/components/places")).map(rel);
  const stray: string[] = [];
  for (const f of comps) {
    for (const s of specsOf(read(f))) {
      if ((s.spec === "@/lib/places-server" || s.spec === "@/app/actions/places") && s.typeOnly) continue;
      if (s.spec === "next/navigation" && f === "src/components/places/PlacesRoutes.tsx") continue;
      if (!/^(react|next\/link|@\/lib\/places|@\/lib\/life-day|@\/components\/ui\/[\w-]+|\.\/[\w.-]+)$/.test(s.spec)) stray.push(`${f}: ${s.spec}${s.typeOnly ? " (type)" : ""}`);
    }
  }
  check("the components import React, Link, places, life-day, the ui kit and each other; the server and the actions only as types; the router only in PlacesRoutes", stray.length === 0, stray.join(", "));
  const routes = ["src/app/places/photo/route.ts", "src/app/places/photo/[id]/route.ts"].map((f) => code(read(f)));
  check(
    "the two route files hand the request to their handler and nothing else (a route file exports its methods and segment config)",
    /export async function POST\(request: Request\): Promise<Response> \{\s*return handlePhotoUpload\(request\);\s*\}/.test(routes[0]) && /const \{ id \} = await params;\s*return handlePhotoGet\(request, id\);/.test(routes[1]) &&
      routes.every((r) => [...r.matchAll(/^export (?:const|async function) (\w+)/gm)].every((m) => ["POST", "GET", "dynamic"].includes(m[1])) && !/console\.|prisma/.test(r))
  );
}
{
  const resetFiles = ["src/app/actions/reset.ts", "src/lib/reset-scopes.ts"].filter((f) => existsSync(resolve(ROOT, f)));
  check("the 'life' reset (and 'everything') leaves visits alone, as it leaves weigh-ins; each is deleted on its own", resetFiles.length === 2 && resetFiles.every((f) => !/locationCheckin|LocationCheckin|locationPhoto|LocationPhoto/.test(read(f))));
  const cache = read("src/lib/cache.ts");
  check("'places' is a cache tag, not one of the shell's (nothing in the shell reads a visit)", /\| "places";/.test(cache) && !(ALL_TAGS as string[]).includes("places"));
  const server = code(read("src/lib/places-server.ts"));
  const writes = ["saveVisitCore", "answerKnown", "updateVisitCore", "deleteVisitCore", "savePhotoCore"];
  check(
    "the two page reads are cached under 'places' (the list one key a user, a visit one a visit) and every write clears it",
    (server.match(/cached\(`placesView:\$\{userId\}`, \["places"\]/g) ?? []).length === 1 && (server.match(/cached\(`placesVisit:\$\{userId\}:\$\{id\}`, \["places"\]/g) ?? []).length === 1 && writes.every((n) => /invalidate\("places"\)/.test(fnBody(server, n))) && (server.match(/invalidate\("places"\)/g) ?? []).length === 5
  );
  check("Math.random appears in no Places file", PLACES_CODE.every((f) => !/Math\.random/.test(code(read(f)))));
  const save = fnBody(server, "saveVisitCore");
  check(
    "clientId replay, by source: the input checked again, the key read before the create, a hit answered by answerKnown, a lost race read again",
    /const clean = cleanVisitInput\(raw, now\);/.test(save) && /const existing = await findByClientId\(userId, v\.clientId\);\s*if \(existing\) return await answerKnown\(userId, existing, v\);\s*const row = await prisma\.locationCheckin\.create\(/.test(save) && /err\.code === "P2002"/.test(save) && /const again = await findByClientId\(userId, v\.clientId\);/.test(save)
  );
  const consoles = [read("src/lib/places-server.ts"), read("src/app/actions/places.ts")].flatMap((s) => [...code(s).matchAll(/console\.(?:log|info|warn|error|debug)\((`[^`]*`|[^)]*)\)/g)].map((m) => m[1]));
  const loose = consoles.filter((a) => {
    const inter = [...a.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
    return !/^`[^`]*`$/.test(a.trim()) || inter.some((x) => x !== "label" && x !== "placesErrorTag(err)");
  });
  check(`every log line in the server and the actions says a label and the error's tag only (${consoles.length} lines)`, consoles.length >= 4 && loose.length === 0, loose.join(" | "));
  const compLogs = filesUnder(join(ROOT, "src/components/places")).filter((f) => /console\./.test(code(readFileSync(f, "utf8"))));
  check("no Places component logs anything", compLogs.length === 0, compLogs.map(rel).join(", "));
}

// ── §8 The migration and the schema ───────────────────────────────────────
console.log("— migration");
{
  const NAME = "20270105000000_place_checkins";
  const path = `prisma/migrations/${NAME}/migration.sql`;
  const sql = existsSync(resolve(ROOT, path)) ? read(path) : "";
  check("the migration is there, hand-authored (no CR in it)", sql.length > 0 && !readFileSync(resolve(ROOT, path), "utf8").includes("\r"));
  check("its name avoids the words other checks reserve (health, ingest, hc_, connect, audit, mobile, roadmap)", !/health|ingest|hc_|connect|audit|mobile|roadmap/i.test(NAME));
  const newest = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
  check("it is the newest migration, right after strength_sets", newest[newest.length - 1] === NAME && newest[newest.length - 2] === "20270104000000_strength_sets", newest.slice(-2).join(", "));
  const header = sql.split("\n").filter((l) => l.startsWith("--")).join("\n");
  check(
    "the header says what it adds, that it is additive only, the target ref (never XTNL_thesis), the apply commands, that the code tolerates its absence, and that a record pays nothing",
    /Additive only/.test(header) && /xvlkujmtdcpaoxdftgpl/.test(header) && /never XTNL_thesis/.test(header) && /migrate status/.test(header) && header.includes(`prisma db execute --file prisma/migrations/${NAME}/migration.sql --schema prisma/schema.prisma`) &&
      header.includes(`migrate resolve --applied ${NAME}`) && /P2021\/42P01/.test(header) && /isMissingPlacesTable/.test(header) && /A record, never a reward/.test(header) && /GPS/.test(header)
  );
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const stmts = body.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  check("one transaction: BEGIN first, COMMIT last, once each", stmts[0] === "BEGIN" && stmts[stmts.length - 1] === "COMMIT" && stmts.filter((s) => s === "BEGIN").length === 1 && stmts.filter((s) => s === "COMMIT").length === 1);
  const SHAPES = [/^BEGIN$/, /^COMMIT$/, /^CREATE TABLE "public"\."(LocationCheckin|LocationPhoto)" \(/, /^ALTER TABLE "public"\."(LocationCheckin|LocationPhoto)" ADD CONSTRAINT "\1_\w+_check" CHECK \(/, /^CREATE (UNIQUE )?INDEX "(LocationCheckin|LocationPhoto)_\w+" ON "public"\."\2"\(/];
  const odd = stmts.filter((s) => !SHAPES.some((re) => re.test(s)));
  check("additive only: two new tables, their named CHECKs and their indexes; an ALTER only on a table it creates", odd.length === 0 && stmts.filter((s) => s.startsWith("CREATE TABLE")).length === 2, odd.join(" | "));
  check("no DROP, TRUNCATE, DELETE, UPDATE, RENAME, INSERT, GRANT, ALTER COLUMN or foreign key anywhere", !/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|INSERT|GRANT|REVOKE|ALTER COLUMN|REFERENCES|FOREIGN KEY)\b/.test(body));
  const q = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
  const want: Record<string, string> = {
    LocationCheckin_placeName_check: `char_length("placeName") BETWEEN 1 AND ${NAME_MAX}`,
    LocationCheckin_placeKey_check: `char_length("placeKey") BETWEEN 1 AND ${KEY_MAX}`,
    LocationCheckin_address_check: `"address" IS NULL OR char_length("address") BETWEEN 1 AND ${ADDRESS_MAX}`,
    LocationCheckin_lat_check: `"lat" IS NULL OR "lat" BETWEEN -90 AND 90`,
    LocationCheckin_lng_check: `"lng" IS NULL OR "lng" BETWEEN -180 AND 180`,
    LocationCheckin_accuracyM_check: `"accuracyM" IS NULL OR "accuracyM" BETWEEN 0 AND ${ACCURACY_MAX}`,
    LocationCheckin_location_check: `(("lat" IS NULL) = ("lng" IS NULL)) AND ("accuracyM" IS NULL OR "lat" IS NOT NULL)`,
    ...Object.fromEntries(RATING_KEYS.map((k) => [`LocationCheckin_${k}_check`, `"${k}" IS NULL OR "${k}" BETWEEN 1 AND ${RATING_MAX}`])),
    LocationCheckin_summary_check: `"summary" IS NULL OR char_length("summary") BETWEEN 1 AND ${SUMMARY_MAX}`,
    LocationCheckin_clientId_check: `char_length("clientId") BETWEEN 1 AND 64`,
    LocationPhoto_ord_check: `"ord" BETWEEN 0 AND ${PHOTOS_MAX - 1}`,
    LocationPhoto_kind_check: `"kind" IN (${q(PHOTO_KINDS)})`,
    LocationPhoto_mime_check: `"mime" IN (${q(PHOTO_MIMES)})`,
    LocationPhoto_width_check: `"width" BETWEEN 1 AND ${FULL_EDGE}`,
    LocationPhoto_height_check: `"height" BETWEEN 1 AND ${FULL_EDGE}`,
    LocationPhoto_thumb_check: `"kind" = 'full' OR ("width" <= ${THUMB_EDGE} AND "height" <= ${THUMB_EDGE})`,
    LocationPhoto_sizeBytes_check: `"sizeBytes" BETWEEN 1 AND ${FULL_MAX_BYTES} AND "sizeBytes" = octet_length("bytes")`,
    LocationPhoto_thumbSize_check: `"kind" = 'full' OR "sizeBytes" <= ${THUMB_MAX_BYTES}`,
  };
  const named = [...body.matchAll(/ADD CONSTRAINT "(\w+)" CHECK \((.*)\);/g)].map((m) => [m[1], m[2]] as const);
  eq(`${Object.keys(want).length} named CHECKs, each the rule places.ts holds (the lengths, the ratings, the location, the photo's place, kinds, types, edges and caps)`, Object.fromEntries(named), want);
  check("every CHECK is a named constraint (none inline in a CREATE TABLE), and the header names each one", (body.match(/\bCHECK \(/g) ?? []).length === Object.keys(want).length && Object.keys(want).every((n) => header.includes(n)));
  check(
    "the columns: cuid TEXT ids, a life day DATE, timestamptz(3) instants, SMALLINT ratings and places, DOUBLE PRECISION coordinates, BYTEA bytes, clientId NOT NULL",
    /"id" TEXT NOT NULL/.test(body) && /"day" DATE NOT NULL/.test(body) && /"visitedAt" TIMESTAMPTZ\(3\) NOT NULL/.test(body) && /"createdAt" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/.test(body) && /"updatedAt" TIMESTAMPTZ\(3\) NOT NULL/.test(body) &&
      RATING_KEYS.every((k) => new RegExp(`"${k}" SMALLINT,`).test(body)) && /"lat" DOUBLE PRECISION,/.test(body) && /"lng" DOUBLE PRECISION,/.test(body) && /"bytes" BYTEA NOT NULL/.test(body) && /"ord" SMALLINT NOT NULL/.test(body) && /"clientId" TEXT NOT NULL/.test(body) && !/TIMESTAMP\(3\)|TIMESTAMP NOT|"\w+" TIMESTAMP,/.test(body)
  );
  check(
    "the replay key is unique (userId, clientId); one photo of each size in each place (checkinId, ord, kind); the reads indexed",
    /CREATE UNIQUE INDEX "LocationCheckin_userId_clientId_key" ON "public"\."LocationCheckin"\("userId", "clientId"\)/.test(body) && /CREATE UNIQUE INDEX "LocationPhoto_checkinId_ord_kind_key" ON "public"\."LocationPhoto"\("checkinId", "ord", "kind"\)/.test(body) &&
      /CREATE INDEX "LocationCheckin_userId_visitedAt_idx" ON "public"\."LocationCheckin"\("userId", "visitedAt"\)/.test(body) && /CREATE INDEX "LocationCheckin_userId_placeKey_idx" ON "public"\."LocationCheckin"\("userId", "placeKey"\)/.test(body) && /CREATE INDEX "LocationPhoto_userId_kind_idx" ON "public"\."LocationPhoto"\("userId", "kind"\)/.test(body)
  );
  const others = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => d !== NAME && existsSync(join(ROOT, "prisma/migrations", d, "migration.sql")));
  const touching = others.filter((d) => /"LocationCheckin"|"LocationPhoto"/.test(read(`prisma/migrations/${d}/migration.sql`)));
  check(`no other migration touches the two tables (${others.length} others read)`, touching.length === 0 && others.length > 30, touching.join(", "));
  const schema = read("prisma/schema.prisma");
  const model = (n: string) => new RegExp(`\\nmodel ${n} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
  const fieldsOf = (b: string) => b.split("\n").map((l) => /^\s+(\w+)\s+\S/.exec(l)?.[1]).filter((x): x is string => !!x && !x.startsWith("@@"));
  const ck = model("LocationCheckin");
  const ph = model("LocationPhoto");
  eq("schema: LocationCheckin's columns, as the migration makes them", fieldsOf(ck), ["id", "userId", "placeName", "placeKey", "address", "lat", "lng", "accuracyM", "visitedAt", "day", "service", "food", "premises", "parking", "summary", "clientId", "createdAt", "updatedAt"]);
  eq("schema: LocationPhoto's columns", fieldsOf(ph), ["id", "userId", "checkinId", "ord", "kind", "mime", "width", "height", "bytes", "sizeBytes", "createdAt"]);
  check(
    "schema: the types (cuid ids, Timestamptz(3), Date, SmallInt ratings, Float coordinates, Bytes), the unique keys and indexes, no relation, the public schema",
    /\n\s+id\s+String\s+@id @default\(cuid\(\)\)/.test(ck) && /\n\s+visitedAt\s+DateTime\s+@db\.Timestamptz\(3\)/.test(ck) && /\n\s+day\s+DateTime\s+@db\.Date/.test(ck) && RATING_KEYS.every((k) => new RegExp(`\\n\\s+${k}\\s+Int\\?\\s+@db\\.SmallInt`).test(ck)) &&
      /\n\s+lat\s+Float\?/.test(ck) && /\n\s+bytes\s+Bytes\n/.test(ph) && /@@unique\(\[userId, clientId\]\)/.test(ck) && /@@index\(\[userId, visitedAt\]\)/.test(ck) && /@@index\(\[userId, placeKey\]\)/.test(ck) && /@@unique\(\[checkinId, ord, kind\]\)/.test(ph) && /@@index\(\[userId, kind\]\)/.test(ph) &&
      !/@relation/.test(ck + ph) && /@@schema\("public"\)/.test(ck) && /@@schema\("public"\)/.test(ph)
  );
  const doc = schema.slice(schema.indexOf("// ── Places:"), schema.indexOf("\nmodel LocationPhoto {"));
  check("schema: the models' comments name every CHECK Prisma 6 can't declare", Object.keys(want).every((n) => doc.includes(n)), Object.keys(want).filter((n) => !doc.includes(n)).join(", "));
}

// ── §9 The UI ─────────────────────────────────────────────────────────────
console.log("— the UI");
const FAKE_CALLS: string[] = [];
const FAKE: VisitFormActions = {
  saveVisit: async () => {
    FAKE_CALLS.push("saveVisit");
    return { ok: true, value: { id: "x", replay: false, photoCount: 0 } };
  },
  updateVisit: async () => {
    FAKE_CALLS.push("updateVisit");
    return { ok: true, value: { id: "x", replay: false, photoCount: 0 } };
  },
};
const noop = () => {};
const FAKE_DELETE: DeleteVisit = async () => ({ ok: true, value: { deleted: 1 } });
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const textOf = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const CSS = read("src/components/places/places.css");
interface Rule {
  selector: string;
  body: string;
  at: string[];
}
function cssRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (s: string, at: string[]) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf("{", i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") depth--;
        j++;
      }
      const inner = s.slice(open + 1, j - 1);
      if (head.startsWith("@media") || head.startsWith("@layer") || head.startsWith("@supports")) walk(inner, [...at, head]);
      else out.push({ selector: head.replace(/^.*;\s*/, ""), body: inner, at });
      i = j;
    }
  };
  walk(src, []);
  return out;
}
const RULES = cssRules(CSS);
const bodyOf = (sel: string) => RULES.filter((r) => r.selector.split(",").map((x) => x.trim()).includes(sel)).map((r) => r.body).join(";");
const px = (b: string, prop: string) => Number(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([\\d.]+)px`).exec(b)?.[1] ?? 0);
{
  // The star groups.
  const star = html(createElement(StarInput, { name: "food", label: "Food", value: 3, onChange: noop }));
  const radios = [...star.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
  const names = new Set(radios.map((r) => /name="([^"]+)"/.exec(r)?.[1]));
  const head = /<p id="([^"]+)" class="pl-rate-h">/.exec(star)?.[1];
  check(
    "a rating is an accessible radio group: role radiogroup named by its visible heading, six native radios under one name (one Tab stop, the arrows move), Not rated first",
    /role="radiogroup"/.test(star) && !!head && star.includes(`aria-labelledby="${head}"`) && radios.length === 6 && names.size === 1 && /value="0"/.test(radios[0]) && radios.slice(1).every((r, i) => r.includes(`value="${i + 1}"`))
  );
  check("…each star named '1 star' … '5 stars'; the chosen one checked; the stars up to it filled; Not rated says so in words", ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"].every((n) => star.includes(`<span class="sr-only">${n}</span>`)) && radios.filter((r) => /checked=""/.test(r)).length === 1 && radios.some((r) => /checked=""/.test(r) && /value="3"/.test(r)) && (star.match(/class="pl-star" data-on=""/g) ?? []).length === 3 && star.includes(NOT_RATED));
  const none = html(createElement(StarInput, { name: "parking", label: "Parking", value: null, onChange: noop }));
  check("…with no rating, Not rated is the checked radio and no star is filled", /<input [^>]*checked="" value="0"\/>|<input [^>]*value="0" checked=""\/>/.test(none) && !/data-on/.test(none) && textOf(none).includes("Parking · Not rated"));
  check("44 px targets: every star and Not rated (and a 28 px star inside), every Remove, Add, the group toggle; rows at least 44", px(bodyOf(".pl-star"), "width") >= 44 && px(bodyOf(".pl-star"), "height") >= 44 && px(bodyOf(".pl-none"), "min-height") >= 44 && px(bodyOf(".pl-tile .pl-remove"), "width") >= 44 && px(bodyOf(".pl-tile .pl-remove"), "height") >= 44 && px(bodyOf(".pl-add"), "min-height") >= 44 && px(bodyOf(".pl-toggle"), "min-height") >= 44 && px(bodyOf(".pl-row"), "min-height") >= 44 && px(bodyOf(".pl-input"), "min-height") >= 44 && px(bodyOf(".pl-geo"), "min-height") >= 44);
  check("five stars fit 344 inside a card: 5 × 44 = 220 px, under the 312 px of content less a card's padding", 5 * px(bodyOf(".pl-star"), "width") <= 312 - 2 * 14 - 2);
  check("inputs are 16 px at every width (the phone never zooms): .pl-input sets 16 px and nothing makes it smaller", /font:\s*500 16px/.test(bodyOf(".pl-input")) && !RULES.some((r) => /pl-input/.test(r.selector) && /font(?:-size)?\s*:[^;]*\b(1[0-5]|[0-9])px/.test(r.body)));
  const sizes = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/font(?:-size)?\s*:\s*(?:\d{3}\s+)?(?:italic\s+)?([\d.]+)px/g)].map((m) => Number(m[1]));
  check(`the 12 px floor: every font size in places.css is 12 px or more (${sizes.length} sizes)`, sizes.length > 10 && sizes.every((s) => s >= 12), sizes.filter((s) => s < 12).join(", "));
  const raw = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  check("tokens only: no hex, rgb(), hsl() or named colour in places.css (no new colour)", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(|:\s*(white|black|red|green|blue|gold|orange)\b/i.test(raw));
  check("no hue says anything: never --owed, --kept, --warn, --held, --must or a currency's colour", !/--(owed|kept|warn|held|must|habit|xp|pts|mp)\b/.test(raw));
  check("nothing animates: no keyframes, animation or transition", !/@keyframes|animation|transition/.test(raw));
  check("in @layer components after the layer order; every class namespaced pl-", raw.trimStart().startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(raw) && [...raw.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].every((m) => m[1].startsWith("pl-") || ["btn", "i", "card"].includes(m[1])));
  const pages = ["src/app/places/page.tsx", "src/app/places/new/page.tsx", "src/app/places/[id]/page.tsx", "src/app/places/[id]/edit/page.tsx", "src/app/dev/style/places/page.tsx"];
  check("the sheet is imported by the pages that draw it, never by a component (so the checks can render them)", pages.every((p) => read(p).includes('import "@/components/places/places.css";')) && filesUnder(join(ROOT, "src/components/places")).every((f) => !/\.css["']/.test(readFileSync(f, "utf8"))));
  check("every page reads the user's rows at request time (force-dynamic) and the routes too", [...pages.slice(0, 4), "src/app/places/photo/route.ts", "src/app/places/photo/[id]/route.ts"].every((p) => /export const dynamic = "force-dynamic";/.test(read(p))));
}
{
  // Location only on its tap; no EXIF passthrough; the two file inputs.
  const form = code(read("src/components/places/PlaceForm.tsx"));
  const geoFiles = SRC_FILES.filter((f) => /\bgeolocation\b/.test(code(readFileSync(f, "utf8")))).map(rel);
  check(
    "'Use my location' only on its tap: the one geolocation call is getCurrentPosition inside locate(), which only the button's onClick calls; no watchPosition, no effect asks, no other file asks",
    same(geoFiles, ["src/components/places/PlaceForm.tsx"]) && (form.match(/getCurrentPosition\(/g) ?? []).length === 1 && /function locate\(\) \{[\s\S]*navigator\.geolocation\.getCurrentPosition\(/.test(fnBody(form, "PlaceForm")) && (form.match(/\blocate\b/g) ?? []).length === 2 && /onClick=\{locate\}/.test(form) && !/watchPosition/.test(form) && !/useEffect\([^)]*geolocation/.test(form)
  );
  const up = code(read("src/components/places/upload.ts"));
  const encSrc = code(read("src/components/places/photo-encode.ts"));
  const picker = code(read("src/components/places/PhotoPicker.tsx"));
  check(
    "no EXIF passthrough: the upload sends only the two blobs the canvas made (never a picked File), and the encoder re-encodes from canvas pixels as JPEG, the orientation applied by the browser's decode",
    (up.match(/form\.append\(/g) ?? []).length === 4 && /form\.append\("full", photo\.full\.blob, "photo\.jpg"\)/.test(up) && /form\.append\("thumb", photo\.thumb\.blob, "thumb\.jpg"\)/.test(up) && !/\bFile\b|\.files\b/.test(up) &&
      /canvas\.toBlob\(\(b\) => resolve\(b\), "image\/jpeg", quality\)/.test(encSrc) && /imageOrientation: "from-image"/.test(encSrc) && /ctx\.drawImage\(src, 0, 0, size\.width, size\.height\)/.test(encSrc) && /res = await encode\(t\.file\);/.test(picker) && !/upload\([^)]*file/i.test(form)
  );
  check(
    "the browser's caps match the server's: the encoder draws inside FULL_EDGE and THUMB_EDGE at JPEG_QUALITY and THUMB_QUALITY, under FULL_MAX_BYTES and THUMB_MAX_BYTES",
    /encodeWithin\(decoded\.source, decoded\.width, decoded\.height, FULL_EDGE, JPEG_QUALITY, FULL_MAX_BYTES\)/.test(encSrc) && /encodeWithin\(decoded\.source, decoded\.width, decoded\.height, THUMB_EDGE, THUMB_QUALITY, THUMB_MAX_BYTES\)/.test(encSrc)
  );
  const inputs = [...picker.matchAll(/<input type="file"[^>]*\/>/g)].map((m) => m[0]);
  check(
    'the photo inputs: <input type="file" accept="image/*" capture="environment" multiple> (Take a photo) and the same without capture (Choose photos: the gallery), each visually hidden under a 44 px label',
    inputs.length === 2 && /accept="image\/\*" capture="environment" multiple className="sr-only"/.test(inputs[0]) && /accept="image\/\*" multiple className="sr-only"/.test(inputs[1]) && !/capture/.test(inputs[1])
  );
  const fd = code(read("src/components/places/PlaceForm.tsx"));
  check("one clientId per check-in: made at the first Save, sent again on a retry", /clientId\.current \?\?= newClientId\(\);/.test(fd) && fd.split("newClientId()").length - 1 === 2 && /export function newClientId\(\): string/.test(fd));
  check("a photo's place is fixed at its first send, so a retry replaces it rather than adding one", /let ord = it\.ord;\s*if \(ord === null\)/.test(fd) && /photos\.patch\(it\.key, \{ status: "uploading", ord \}\);/.test(fd));
  const comps = filesUnder(join(ROOT, "src/components/places")).filter((f) => !f.endsWith("PlacesRoutes.tsx") && !f.endsWith("upload.ts"));
  check("no Places component touches a URL (no router, search params, location or fetch) but the two that must: the routes' binding and the upload", comps.every((f) => !/useRouter|useSearchParams|URLSearchParams|window\.location|\bfetch\(|history\.(push|replace)State/.test(code(readFileSync(f, "utf8")))), comps.filter((f) => /useRouter|\bfetch\(/.test(code(readFileSync(f, "utf8")))).map(rel).join(", "));
}
{
  // The form.
  const empty = html(createElement(PlaceForm, { mode: "new", draft: blankDraft(PLACES_FIXTURE_NOW), actions: FAKE, onDone: noop, cancelHref: "/places", knownPlaces: ["Café Lumen"] }));
  const field = (name: string) => new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`).exec(empty)?.[0] ?? "";
  check(
    "the empty form: Place (required, at most 80), Address (optional, 160), When (a date and time, now), Summary (280, its count), the four ratings, Use my location, the photo inputs, Save",
    /required=""/.test(field("placeName")) && /maxLength="80"/.test(field("placeName")) && /maxLength="160"/.test(field("placeAddress")) && /type="datetime-local"[^>]*value="2026-11-01T12:30"/.test(field("visitedLocal")) && /maxLength="280"/.test(field("summary")) &&
      (empty.match(/role="radiogroup"/g) ?? []).length === 4 && ["Service", "Food", "Premises", "Parking"].every((l) => empty.includes(`${l}<span`)) && textOf(empty).includes("Use my location") && (empty.match(/type="file"/g) ?? []).length === 2 && textOf(empty).includes("Save check-in") && textOf(empty).includes("0/280"),
    textOf(empty).slice(0, 400)
  );
  check("…the user's places offered as the name is typed (a datalist), no location until the tap, Overall not rated yet", /<datalist id="[^"]+"><option value="Café Lumen"><\/option><\/datalist>/.test(empty) && !/within \d+ m/.test(empty) && textOf(empty).includes(`Overall ${NOT_RATED}`));
  {
    // Enter never saves: the keyboard's Next moves on, and only the Save button's click saves.
    const src = code(read("src/components/places/PlaceForm.tsx"));
    const nextInputs = [...src.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0]).filter((i) => /enterKeyHint="next"/.test(i));
    const moves = nextInputs.map((i) => /onKeyDown=\{enterMovesTo\(`\$\{id\}-(\w+)`\)\}/.exec(i)?.[1] ?? null);
    check(
      "Enter never saves a half-filled check-in: every input with enterKeyHint=\"next\" (Place, Address) has an Enter onKeyDown that moves focus on (Address, When), skipping an IME's Enter",
      nextInputs.length === 2 && same(moves, ["address", "at"]) && /if \(e\.key !== "Enter" \|\| e\.nativeEvent\.isComposing\) return;\s*e\.preventDefault\(\);\s*document\.getElementById\(nextId\)\?\.focus\(\);/.test(src) && /id=\{`\$\{id\}-address`\}/.test(src) && /id=\{`\$\{id\}-at`\}/.test(src),
      JSON.stringify(moves)
    );
    check(
      "…the form's submit only cancels (an implicit submit never calls save); Save is a type=\"button\" whose click saves; no submit button anywhere",
      /<form className="pl-form" onSubmit=\{\(e\) => e\.preventDefault\(\)\}/.test(src) && /<Button type="button" variant="primary" size="lg" onClick=\{\(\) => void save\(\)\} disabled=\{locked\}>/.test(src) && !/type="submit"/.test(src) && !/onSubmit=\{save\}/.test(src) && /async function save\(\) \{/.test(src) && !/type="submit"/.test(empty)
    );
    check("…the client's own 'Name the place' test removes the invisible characters first, as the server's does", /if \(!stripInvisible\(placeName\)\.trim\(\)\) \{/.test(src));
    check(
      "the address field never invites the browser's own address: autocomplete off, named placeAddress, no street-address, address-*, shipping or billing token",
      /autoComplete="off"/.test(field("placeAddress")) && !/autoComplete="(?:street-address|address-|shipping|billing)/i.test(read("src/components/places/PlaceForm.tsx")) && !/name="address"/.test(empty)
    );
  }
  const filled = html(createElement(PlaceForm, { mode: "edit", visitId: LUMEN_LATEST.id, draft: draftOfVisit(LUMEN_LATEST, fixturePhotos(LUMEN_LATEST.id, 4)), actions: FAKE, onDone: noop, cancelHref: "/places/x" }));
  check(
    "the filled form (Edit): the visit's fields, its location line with Remove location, the ratings checked, the overall, four stored photos each with Remove, the inputs closed at four",
    /value="Café Lumen"/.test(filled) && /-33\.858800, 151\.180100 · within 12 m/.test(filled) && textOf(filled).includes("Remove location") && (filled.match(/checked=""/g) ?? []).length === 4 && textOf(filled).includes("Overall") && textOf(filled).includes("4.3") &&
      [1, 2, 3, 4].every((n) => filled.includes(`aria-label="Remove photo ${n}"`)) && (filled.match(/<input type="file"[^>]*disabled=""/g) ?? []).length === 2 && textOf(filled).includes("Save changes"),
    textOf(filled).slice(0, 300)
  );
  check(
    "…the location line is a flex row: the pin beside the coordinates (one span), never on a line of its own",
    /<p class="pl-loc-line"><svg [^>]*>[\s\S]*?<\/svg><span>-33\.858800, 151\.180100 · within 12 m<\/span><\/p>/.test(filled) && /display:\s*flex/.test(bodyOf(".pl-loc-line")) && /align-items:\s*center/.test(bodyOf(".pl-loc-line")) && /min-width:\s*0/.test(bodyOf(".pl-loc-line"))
  );
}
{
  // The list.
  const l = (k: keyof typeof LIST_FIXTURES) => html(createElement(PlacesList, { view: LIST_FIXTURES[k] }));
  const grouped = l("list-grouped");
  check("empty: one plain line and Check in", textOf(l("list-empty")).includes(PLACES_EMPTY) && /href="\/places\/new"/.test(l("list-empty")));
  check("not ready and failed: their own plain lines, never the empty list", textOf(l("list-not-ready")).includes(PLACES_NOT_READY) && textOf(l("list-failed")).includes(PLACES_LOAD_FAILED) && !textOf(l("list-failed")).includes(PLACES_EMPTY));
  check(
    "grouped: Café Lumen once, with its 3 visits and their average, and Show the 3 visits (a 44 px button, aria-expanded); the rest their own cards; a search box",
    (grouped.match(/data-place="cafe lumen"/g) ?? []).length === 1 && textOf(grouped).includes(visitsLineOf(3, averageOf(FIXTURE_VISITS.filter((v) => v.placeKey === "cafe lumen")))) && /aria-expanded="false"[^>]*>[\s\S]*?Show the 3 visits/.test(grouped) &&
      ["fx-fish", "fx-pool", "fx-diner"].every((id) => grouped.includes(`href="/places/${id}"`)) && /type="search"/.test(grouped),
    textOf(grouped).slice(0, 300)
  );
  const imgs = [...grouped.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
  check("the list loads thumbnails only (never a full image), each with its size and lazily", imgs.length > 0 && imgs.every((i) => /width="480" height="360"/.test(i) && /loading="lazy"/.test(i) && /alt=""/.test(i)));
  const lumenAvg = averageOf(FIXTURE_VISITS.filter((v) => v.placeKey === "cafe lumen"));
  check(
    "each card: its stars named for the screen reader (a place's as its average), its day words, the summary's first line only",
    grouped.includes(`aria-label="Average ${starsLabelOf(lumenAvg)}"`) && grouped.includes(`aria-label="${starsLabelOf(4)}"`) && textOf(grouped).includes("Last visit yesterday") && !textOf(grouped).includes("Last Yesterday") && textOf(grouped).includes("Thu 29 Oct") && textOf(grouped).includes("Sun 14 Dec 2025") &&
      textOf(grouped).includes("Best chips in a while.") && !textOf(grouped).includes("The queue moves fast."),
    textOf(grouped)
  );
  check("…and a place with no photo draws the pin, not an empty image", /class="pl-thumb pl-thumb-none"/.test(grouped));
  const groupRing = bodyOf(".pl-group > a.pl-card:focus-visible");
  check(
    "a grouped card's focus ring is drawn inside its group (which clips it): a negative outline-offset, its top corners the card's inner rounding",
    /outline-offset:\s*-2px/.test(groupRing) && /border-radius:\s*calc\(var\(--r-card\) - 1px\) calc\(var\(--r-card\) - 1px\) 0 0/.test(groupRing) && /overflow:\s*hidden/.test(bodyOf(".pl-group"))
  );
}
{
  // A visit.
  const d = (k: keyof typeof DETAIL_FIXTURES) => html(createElement(VisitDetail, { detail: DETAIL_FIXTURES[k], deleteVisit: FAKE_DELETE, onDeleted: noop }));
  const four = d("visit-four-photos");
  const two = d("visit-two-ratings");
  const fulls = [...four.matchAll(/<img [^>]*class="pl-full"[^>]*>/g)].map((m) => m[0]);
  check(
    "a visit with four photos: each full image large (1600 × 1200, the first loaded at once), named Photo n of 4",
    fulls.length === 4 && fulls.every((f, i) => f.includes(`alt="Photo ${i + 1} of 4"`) && /width="1600" height="1200"/.test(f)) && /loading="eager"/.test(fulls[0]) && fulls.slice(1).every((f) => /loading="lazy"/.test(f))
  );
  check(
    "…the four ratings with Not rated in words, the overall, the summary, where (the geo: link), Edit and Delete, its other visits with their count and average",
    textOf(four).includes("Parking Not rated") && textOf(four).includes("Overall") && four.includes('aria-label="4.3 out of 5"') && textOf(four).includes("Busy after 10") && /href="geo:-33\.8588,151\.1801"/.test(four) && /href="\/places\/fx-lumen-3\/edit"/.test(four) && textOf(four).includes("Delete") &&
      textOf(four).includes("Other visits to Café Lumen") && textOf(four).includes(visitsInAllLineOf(3, averageOf([LUMEN_LATEST, ...DETAIL_FIXTURES["visit-four-photos"].others]))) && textOf(four).includes("3 visits in all · average 3.8"),
    textOf(four).slice(0, 400)
  );
  check(
    "a visit's title is the display heading the other Places pages use (t-display-m, wrapped by pl-title, never the 16 px card name), and so is Edit's",
    /<h1 class="t-display-m pl-note pl-title">Café Lumen<\/h1>/.test(four) && !/<h1[^>]*pl-name/.test(four) && /overflow-wrap:\s*anywhere/.test(bodyOf(".pl-title")) && !/\b(font|color)\s*:/.test(bodyOf(".pl-title")) &&
      /<h1 className="t-display-m pl-note pl-title">\{detail\.visit\.placeName\}<\/h1>/.test(read("src/app/places/[id]/edit/page.tsx"))
  );
  check("a visit with two ratings: the other two say Not rated, and the overall is the mean of the two (4.0)", (textOf(two).match(new RegExp(NOT_RATED, "g")) ?? []).length === 2 && two.includes('aria-label="4.0 out of 5"') && !textOf(two).includes("Other visits"));
  check("not ready and gone: one plain line each, with the way back", textOf(d("visit-not-ready")).includes(PLACES_NOT_READY) && textOf(d("visit-gone")).includes(VISIT_GONE) && /href="\/places"/.test(d("visit-gone")));
  const all = [four, two, html(createElement(PlacesList, { view: LIST_FIXTURES["list-grouped"] }))].join("");
  check("plain words: no exclamation mark anywhere Places draws, and none in its copy", !/!/.test(textOf(all)) && !PLACES_CODE.some((f) => [...code(read(f)).matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)].some((m) => /[A-Za-z]!(\s|$)/.test(m[1] ?? m[2] ?? ""))));
}
{
  // The fixtures, the audit and the shell.
  const fx = read("src/app/dev/style/places/page.tsx");
  check("the fixtures page reads ?state= as one of PLACES_FIXTURE_STATES (a fixed name, never a value), gated like every /dev/style page", /if \(!devStyleEnabled\(\)\) notFound\(\);/.test(fx) && /const state = isPlacesFixtureState\(raw\) \? raw : null;/.test(fx));
  eq(
    "the fixture states: the list (empty, grouped, a group opened, no match, not ready, failed), the form (empty, filled, not ready, its photo tiles, the unsent footer, the location refused), a visit (four photos, two ratings, the Delete confirm open, not ready, gone)",
    [...PLACES_FIXTURE_STATES],
    ["list-empty", "list-grouped", "list-group-open", "list-no-match", "list-not-ready", "list-failed", "form-empty", "form-filled", "form-not-ready", "form-photo-states", "form-unsent", "form-location-off", "visit-four-photos", "visit-two-ratings", "visit-delete-armed", "visit-not-ready", "visit-gone"]
  );
  {
    // Each new state draws what the 344 audit should measure (the fixtures page itself, its fake actions).
    const fx = (s: (typeof PLACES_FIXTURE_STATES)[number]) => html(createElement(PlacesFixtures, { state: s }));
    const tiles = fx("form-photo-states");
    const tileLines = [...tiles.matchAll(/<span class="pl-tile-note">([^<]*)<\/span>/g)].map((m) => m[1].replace(/&#x27;|&#39;/g, "'"));
    check(
      "form-photo-states: four tiles (the most), preparing, not an image, too large and not sent, each with its Remove; the refused ones said in the alert",
      same(tileLines, ["Preparing…", PHOTO_NOT_IMAGE, PHOTO_TOO_BIG, "Not sent yet"]) && [1, 2, 3, 4].every((n) => tiles.includes(`aria-label="Remove photo ${n}"`)) && textOf(tiles).includes("2 photos couldn't be prepared") && (tiles.match(/<input type="file"[^>]*disabled=""/g) ?? []).length === 2,
      JSON.stringify(tileLines)
    );
    const unsent = fx("form-unsent");
    check("form-unsent: the visit saved, its one photo not sent: the line, Send them again and Go on without them (and no Save)", textOf(unsent).includes("1 photo didn't send. The visit is saved.") && textOf(unsent).includes("Send them again") && textOf(unsent).includes("Go on without them") && !textOf(unsent).includes("Save check-in") && textOf(unsent).includes("Not sent yet"));
    check("form-location-off: the browser's refusal said in its line, Use my location still there; form-not-ready: the one-time update line over the form", textOf(fx("form-location-off")).includes(LOCATION_OFF) && textOf(fx("form-location-off")).includes("Use my location") && textOf(fx("form-not-ready")).includes(PLACES_NOT_READY));
    const armed = fx("visit-delete-armed");
    check("visit-delete-armed: the confirm open (its question, Delete visit and Keep it), Edit gone", textOf(armed).includes(DELETE_CONFIRM) && textOf(armed).includes("Delete visit") && textOf(armed).includes("Keep it") && !/href="\/places\/fx-fish\/edit"/.test(armed));
    const open = fx("list-group-open");
    check("list-group-open: Café Lumen's group opened (aria-expanded true, Hide the 3 visits) with its three rows", /aria-expanded="true"/.test(open) && textOf(open).includes("Hide the 3 visits") && (open.match(/class="pl-row"/g) ?? []).length === 3);
    const none = fx("list-no-match");
    check("list-no-match: the search holds a query nothing matches, and the list says so", textOf(none).includes(NO_MATCH) && /type="search"[^>]*value="zzz"|value="zzz"[^>]*type="search"/.test(none) && !/class="pl-list"/.test(none));
    const note = bodyOf(".pl-tile-note");
    const notePad = Number(/padding:\s*(\d+)px/.exec(note)?.[1] ?? 0);
    check("a tile's line sits at its foot, clear of the Remove on its corner (padding-top at least 4 + 44 px)", /place-items:\s*end center/.test(note) && notePad >= 4 + px(bodyOf(".pl-tile .pl-remove"), "height") && /top:\s*4px/.test(bodyOf(".pl-tile .pl-remove")));
  }
  {
    const loads = ["src/app/places/loading.tsx", "src/app/places/new/loading.tsx", "src/app/places/[id]/loading.tsx", "src/app/places/[id]/edit/loading.tsx"];
    check("each Places route has its own loading.tsx at its own geometry (the list, the form, a visit, Edit's form), so nothing jumps at 344", loads.every((f) => existsSync(resolve(ROOT, f))));
    const sk = read("src/components/places/Skeletons.tsx");
    check(
      "…the form's for Check in and Edit, the visit's for a visit; each aria-busy with an sr-only line, no shimmer",
      /<FormSkeleton label="Loading the form" \/>/.test(read(loads[1])) && /<VisitSkeleton \/>/.test(read(loads[2])) && /<FormSkeleton label="Loading the form" \/>/.test(read(loads[3])) &&
        (sk.match(/aria-busy="true"/g) ?? []).length === 2 && (sk.match(/className="sr-only"/g) ?? []).length === 2 && !/shimmer|animation/.test(code(sk)) && /aspectRatio: "4 \/ 3"/.test(sk)
    );
  }
  check("the fixture day is Sunday 1 November 2026", PLACES_FIXTURE_TODAY === "2026-11-01");
  const fakes = code(read("src/app/dev/style/places/PlacesFixtures.tsx"));
  check("the fixtures' fakes save nothing (no server action, no route, no fetch)", !/@\/app\/actions|places-server|\bfetch\(|\/places\/photo/.test(fakes) && /upload=\{FAKE_UPLOAD\}/.test(fakes));
  const audit = read("scripts/ui-audit.mjs");
  const listed = /"\/dev\/style\/places",\s*\.\.\.\[([^\]]*)\]\.map\(\(s\) => `\/dev\/style\/places\?state=\$\{s\}`\)/.exec(audit);
  check(
    "ui-audit audits /places and /places/new, the fixtures page and every fixture state alone",
    /"\/places",\s*"\/places\/new",\s*\];/.test(audit) && !!listed && same([...listed[1].matchAll(/"([\w-]+)"/g)].map((m) => m[1]), [...PLACES_FIXTURE_STATES])
  );
  const places = SECTIONS.find((s) => s.id === "places");
  check("the shell: Places is its own section after Body (/places, the pin), Visits and Check in its pages", !!places && SECTIONS.indexOf(places) === 3 && places.href === "/places" && places.icon === "pin" && same(sectionById("places").subs.map((s) => s.href), ["/places", "/places/new"]));
  const icon = read("src/components/ui/Icon.tsx");
  check("the pin is a kit icon: 'pin' in IconName (before the bag) and its own i-pin symbol", /\| "pin" \| "bag";/.test(icon) && /<symbol id="i-pin" viewBox="0 0 24 24">/.test(icon));
  const chrome = code(read("src/components/shell/Chrome.tsx"));
  check("the tab bar draws Places after Body, and Places has no count on its tab", /\{tab\(body\)\}\s*\{tab\(places\)\}/.test(chrome) && /if \(id === "body"\) return data\.badges\.train;\s*return 0;/.test(chrome));
}

// ── §10 Tailwind and the chain ────────────────────────────────────────────
async function tailwindCollisions() {
  console.log("— tailwind");
  const twDir = join(ROOT, "node_modules/tailwindcss");
  const tw = await compile(read("src/app/globals.css"), {
    base: join(ROOT, "src/app"),
    loadStylesheet: async (id: string, b: string) => {
      if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
      if (b.startsWith(twDir)) {
        const p = join(b, id);
        return { path: p, base: twDir, content: readFileSync(p, "utf8") };
      }
      return { path: join(b, id), base: b, content: "" };
    },
  });
  const KIT = new Set<string>(["sr-only"]);
  for (const f of readdirSync(join(ROOT, "src/app/styles")).filter((n) => n.endsWith(".css"))) {
    for (const m of read(`src/app/styles/${f}`).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) KIT.add(m[1]);
  }
  const drawn = [
    html(createElement(PlacesList, { view: LIST_FIXTURES["list-grouped"] })),
    html(createElement(VisitDetail, { detail: DETAIL_FIXTURES["visit-four-photos"], deleteVisit: FAKE_DELETE, onDeleted: noop })),
    html(createElement(PlaceForm, { mode: "new", draft: blankDraft(NOW), actions: FAKE, onDone: noop, cancelHref: "/places" })),
  ];
  const names = new Set<string>();
  for (const m of CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1]);
  for (const h of drawn) for (const m of h.matchAll(/class="([^"]+)"/g)) for (const n of m[1].split(/\s+/)) if (n && !KIT.has(n)) names.add(n);
  const has = (css: string, n: string) => css.includes(`.${n} {`);
  const before = tw.build([]);
  const after = tw.build([...names]);
  const hits = [...names].filter((n) => has(after, n) && !has(before, n));
  check(`no Places class is a generated Tailwind utility (${names.size} names)`, hits.length === 0, hits.join(", "));
  check("the probe really compiles utilities (block is one)", has(tw.build(["block"]), "block"));
  const own = [...names].filter((n) => !KIT.has(n));
  check("every class the Places components draw is the kit's or namespaced pl-*", own.every((n) => n.startsWith("pl-")), own.filter((n) => !n.startsWith("pl-")).join(", "));
}

function chainChecks() {
  console.log("— chain");
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "life:check runs this check right after work-orders-check, before character-check; npm run places:check runs it alone",
    pkg.scripts["life:check"].includes("tsx scripts/work-orders-check.ts && tsx scripts/places-check.ts && tsx scripts/character-check.ts") && pkg.scripts["places:check"] === "tsx scripts/places-check.ts"
  );
}

(async () => {
  const logged: string[] = [];
  const realError = console.error;
  const realWarn = console.warn;
  console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  try {
    await serverChecks(logged);
  } catch (e) {
    check("the server checks run", false, `${(e as Error).name}: ${(e as Error).message}`);
  } finally {
    console.error = realError;
    console.warn = realWarn;
  }
  try {
    await tailwindCollisions();
  } catch (e) {
    check("the Tailwind probe runs", false, String(e));
  }
  chainChecks();
  check("rendering called no action", FAKE_CALLS.length === 0, FAKE_CALLS.join(", "));
  console.log(`\nplaces-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

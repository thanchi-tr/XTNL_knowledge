/**
 * Places: the location check-in's reads and writes (server only; the rules are places.ts), and the photo route's two
 * handlers. Every read fails soft — the tables may be missing on a database the 20270105000000_place_checkins migration
 * has not reached — and returns the empty view with ready: false (and failed: true when the fault is anything but a
 * missing table, so a transient error never reads as "no visits yet"); every write returns { ok: false, error }
 * instead of throwing. Cache tag 'places' (src/lib/cache.ts) on the two page reads; every write invalidates it.
 *
 *   loadPlacesView(userId, now?)                 → PlacesView (every visit, newest first, the newest READ_MAX; each
 *                                                  with its first thumbnail's id and size, never a photo's bytes)
 *   loadVisitDetail(userId, id, now?)            → VisitDetail (the visit, its photos in order, and its other visits to
 *                                                  the same place, newest first)
 *   saveVisitCore(userId, raw, now?)             → { ok, value: SavedVisit } (a new check-in; idempotent by clientId: a
 *                                                  resend with the same values answers the row the first send wrote,
 *                                                  replay: true, and a resend with changed values updates that row)
 *   updateVisitCore(userId, id, raw, remove, now?) → { ok, value: SavedVisit } (Edit: the fields, and the photos named
 *                                                  in `remove` by id removed, the rest closed up from 0; photoCount
 *                                                  says where new ones go; a retry removes nothing more)
 *   deleteVisitCore(userId, id)                  → { ok, value: { deleted } } (the visit, then every photo of it, in
 *                                                  one transaction; a visit already gone is not an error)
 *   savePhotoCore(userId, input)                 → { ok, value: VisitPhoto } (one photo and its thumbnail into one of
 *                                                  the visit's four places, replacing what was there: new rows, new
 *                                                  ids; the visit checked under a lock on its row, so an upload never
 *                                                  outlives a delete)
 *   loadPhotoCore(userId, id)                    → { ok, value: { mime, bytes } } (one image's bytes, for the route)
 *   handlePhotoUpload(request, deps?)            POST /places/photo (multipart: visitId, ord, full, thumb): same origin
 *                                                  only, UPLOAD_MAX_BYTES at most, JSON back, never cached
 *   handlePhotoGet(request, id, deps?)           GET /places/photo/<id>: the image with its own type, cached as
 *                                                  immutable (an id is never reused); never served to another site
 *   isMissingPlacesTable(err) · placesErrorTag(err)
 *
 * These are user-initiated writes (as the weight and check-in writes), which are not behind lifeWritesEnabled; nothing
 * here writes on its own. A record, never a reward: nothing here touches the ledger or an economy table, and none of
 * the economy files import this. Log lines carry a label and the error's code or class name, never a message (a
 * Prisma message can quote the values it was given), and nothing here imports anything that reaches Gemini.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { dateColumn, keyOfDateColumn, todayKey } from "./life-day";
import { getCurrentUserId } from "./user";
import {
  PHOTO_SLOT_BAD,
  PLACES_NOT_READY,
  SAVE_FAILED,
  UPLOAD_MAX_BYTES,
  VISIT_GONE,
  byNewest,
  cleanPhotoIds,
  cleanVisitInput,
  emptyPlacesView,
  emptyVisitDetail,
  isVisitId,
  overallOf,
  photoOf,
  photoOrdOf,
  photoPlanOf,
  photoSrcOf,
  type CheckedPhoto,
  type PhotoImage,
  type PlacesResult,
  type PlacesView,
  type Ratings,
  type VisitDetail,
  type VisitInput,
  type VisitPhoto,
  type VisitView,
} from "./places";

export type { PlacesResult };

/** A saved visit: its id, whether this was a resend of one already saved, and how many photos it keeps. */
export interface SavedVisit {
  id: string;
  replay: boolean;
  photoCount: number;
}

/** The newest visits a list reads (a personal list; the cap keeps a flood from slowing the page). */
const READ_MAX = 1000;
/** The other visits a visit's page lists. */
const OTHERS_MAX = 50;

/** The tables are not there yet (the migration has not reached this database). */
export function isMissingPlacesTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*(LocationCheckin|LocationPhoto)[`"]? does not exist/i.test(message);
}

/** What a log line may say about an error: its Prisma code or its class name, never its message. */
export function placesErrorTag(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (err instanceof Error) return err.name;
  return typeof err;
}

let warnedMissing = false;
/** Logs a failure: a missing table once per process, anything else every time (its tag only). */
function logFailure(label: string, err: unknown): void {
  if (isMissingPlacesTable(err)) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(`${label}: the places tables are missing (migration 20270105000000_place_checkins not applied); showing no visits.`);
    }
    return;
  }
  console.error(`${label} failed: ${placesErrorTag(err)}`);
}

function writeError(label: string, err: unknown): { ok: false; error: string } {
  logFailure(label, err);
  return { ok: false, error: isMissingPlacesTable(err) ? PLACES_NOT_READY : SAVE_FAILED };
}

const VISIT_SELECT = {
  id: true,
  placeName: true,
  placeKey: true,
  address: true,
  lat: true,
  lng: true,
  accuracyM: true,
  visitedAt: true,
  day: true,
  service: true,
  food: true,
  premises: true,
  parking: true,
  summary: true,
} as const;

type VisitRow = {
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
};

/** A photo row's metadata: never its bytes. */
const PHOTO_META = { id: true, checkinId: true, ord: true, kind: true, width: true, height: true } as const;
type PhotoMetaRow = { id: string; checkinId: string; ord: number; kind: string; width: number; height: number };

const imageOf = (r: { id: string; width: number; height: number }): PhotoImage => ({ id: r.id, src: photoSrcOf(r.id), width: r.width, height: r.height });

function ratingsOf(r: VisitRow): Ratings {
  return { service: r.service, food: r.food, premises: r.premises, parking: r.parking };
}

/** A stored row as the views hold it. */
function viewOfRow(r: VisitRow, photos: { count: number; thumb: PhotoImage | null }): VisitView {
  const ratings = ratingsOf(r);
  return {
    id: r.id,
    placeName: r.placeName,
    placeKey: r.placeKey,
    address: r.address,
    location: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng, accuracyM: r.accuracyM } : null,
    visitedAt: r.visitedAt.toISOString(),
    day: keyOfDateColumn(r.day),
    ratings,
    overall: overallOf(ratings),
    summary: r.summary,
    photoCount: photos.count,
    thumb: photos.thumb,
  };
}

/** Each visit's photo count and first thumbnail, from the thumbnails' metadata. */
function thumbsByVisit(rows: readonly PhotoMetaRow[]): Map<string, { count: number; thumb: PhotoImage | null }> {
  const out = new Map<string, { count: number; thumb: PhotoImage | null; ord: number }>();
  for (const r of rows) {
    const cur = out.get(r.checkinId);
    if (!cur) out.set(r.checkinId, { count: 1, thumb: imageOf(r), ord: r.ord });
    else {
      cur.count += 1;
      if (r.ord < cur.ord) {
        cur.thumb = imageOf(r);
        cur.ord = r.ord;
      }
    }
  }
  return out;
}

const NO_PHOTOS = { count: 0, thumb: null };

/**
 * The list for today: every visit, newest first (the newest READ_MAX), with its first thumbnail. A missing table reads
 * as the empty view with ready: false; any other failed read as ready: false and failed: true (logged by its tag), so
 * the page says it couldn't load rather than "no visits yet".
 */
export async function loadPlacesView(userId: string, now: Date = new Date()): Promise<PlacesView> {
  const today = todayKey(now);
  try {
    return await cached(`placesView:${userId}`, ["places"], async () => {
      const [rows, thumbs] = await Promise.all([
        prisma.locationCheckin.findMany({ where: { userId }, orderBy: [{ visitedAt: "desc" }, { id: "desc" }], take: READ_MAX, select: VISIT_SELECT }),
        prisma.locationPhoto.findMany({ where: { userId, kind: "thumb" }, select: PHOTO_META }),
      ]);
      const byVisit = thumbsByVisit(thumbs);
      const visits = rows.map((r) => viewOfRow(r, byVisit.get(r.id) ?? NO_PHOTOS)).sort(byNewest);
      return { ready: true, failed: false, today, visits };
    }).then((v) => ({ ...v, today }));
  } catch (err) {
    logFailure("loadPlacesView", err);
    return emptyPlacesView(today, { ready: false, failed: !isMissingPlacesTable(err) });
  }
}

/** A visit's photos, in order: each place's full image and its thumbnail (a place with no full image is skipped). */
function photosOf(rows: readonly PhotoMetaRow[]): VisitPhoto[] {
  const byOrd = new Map<number, { full?: PhotoImage; thumb?: PhotoImage }>();
  for (const r of rows) {
    const slot = byOrd.get(r.ord) ?? {};
    if (r.kind === "full") slot.full = imageOf(r);
    else if (r.kind === "thumb") slot.thumb = imageOf(r);
    byOrd.set(r.ord, slot);
  }
  return [...byOrd.entries()]
    .filter((e): e is [number, { full: PhotoImage; thumb?: PhotoImage }] => !!e[1].full)
    .sort((a, b) => a[0] - b[0])
    .map(([ord, s]) => ({ ord, full: s.full, thumb: s.thumb ?? null }));
}

/**
 * One visit's page: the visit, its photos in order, and the other visits to the same place, newest first. A visit
 * that isn't there reads as visit: null (ready). Fails soft as the list does.
 */
export async function loadVisitDetail(userId: string, id: string, now: Date = new Date()): Promise<VisitDetail> {
  const today = todayKey(now);
  if (!isVisitId(id)) return emptyVisitDetail(today, { ready: true });
  try {
    return await cached(`placesVisit:${userId}:${id}`, ["places"], async () => {
      const row = await prisma.locationCheckin.findFirst({ where: { id, userId }, select: VISIT_SELECT });
      if (!row) return emptyVisitDetail(today, { ready: true });
      const [photoRows, otherRows] = await Promise.all([
        prisma.locationPhoto.findMany({ where: { userId, checkinId: id }, select: PHOTO_META }),
        prisma.locationCheckin.findMany({ where: { userId, placeKey: row.placeKey, NOT: { id } }, orderBy: [{ visitedAt: "desc" }, { id: "desc" }], take: OTHERS_MAX, select: VISIT_SELECT }),
      ]);
      const photos = photosOf(photoRows);
      const otherThumbs =
        otherRows.length === 0
          ? new Map<string, { count: number; thumb: PhotoImage | null }>()
          : thumbsByVisit(await prisma.locationPhoto.findMany({ where: { userId, kind: "thumb", checkinId: { in: otherRows.map((o) => o.id) } }, select: PHOTO_META }));
      const thumb = photos[0]?.thumb ?? null;
      return {
        ready: true,
        failed: false,
        today,
        visit: viewOfRow(row, { count: photos.length, thumb }),
        photos,
        others: otherRows.map((o) => viewOfRow(o, otherThumbs.get(o.id) ?? NO_PHOTOS)).sort(byNewest),
      };
    }).then((d) => ({ ...d, today }));
  } catch (err) {
    logFailure("loadVisitDetail", err);
    return emptyVisitDetail(today, { ready: false, failed: !isMissingPlacesTable(err) });
  }
}

/** The columns a cleaned input writes (the same for a new visit and an edit). */
function dataOf(v: VisitInput) {
  return {
    placeName: v.placeName,
    placeKey: v.placeKey,
    address: v.address,
    lat: v.location?.lat ?? null,
    lng: v.location?.lng ?? null,
    accuracyM: v.location?.accuracyM ?? null,
    visitedAt: v.visitedAt,
    day: dateColumn(v.day),
    service: v.ratings.service,
    food: v.ratings.food,
    premises: v.ratings.premises,
    parking: v.ratings.parking,
    summary: v.summary,
  };
}

/** The stored row already holds what this send says. */
function sameValues(r: VisitRow, v: VisitInput): boolean {
  const d = dataOf(v);
  return (
    r.placeName === d.placeName &&
    r.address === d.address &&
    r.lat === d.lat &&
    r.lng === d.lng &&
    r.accuracyM === d.accuracyM &&
    r.visitedAt.getTime() === d.visitedAt.getTime() &&
    r.service === d.service &&
    r.food === d.food &&
    r.premises === d.premises &&
    r.parking === d.parking &&
    r.summary === d.summary
  );
}

async function findByClientId(userId: string, clientId: string): Promise<VisitRow | null> {
  return prisma.locationCheckin.findUnique({ where: { userId_clientId: { userId, clientId } }, select: VISIT_SELECT });
}

/** How many photos a visit keeps (its full images). */
function photoCountOf(userId: string, id: string): Promise<number> {
  return prisma.locationPhoto.count({ where: { userId, checkinId: id, kind: "full" } });
}

/**
 * A clientId already saved: the same values answer that row (replay: true) and write nothing (a retried request, a
 * second tap); changed values (the first send landed, its answer was lost, and the user changed the form before Save
 * again) update that one row, keeping its key, and answer it.
 */
async function answerKnown(userId: string, existing: VisitRow, v: VisitInput): Promise<PlacesResult<SavedVisit>> {
  const photoCount = await photoCountOf(userId, existing.id);
  if (sameValues(existing, v)) return { ok: true, value: { id: existing.id, replay: true, photoCount } };
  await prisma.locationCheckin.updateMany({ where: { id: existing.id, userId }, data: dataOf(v) });
  invalidate("places");
  return { ok: true, value: { id: existing.id, replay: false, photoCount } };
}

/**
 * Saves one new check-in. The input is checked here (cleanVisitInput) whatever the form checked. A clientId already
 * saved is answered by answerKnown; two sends racing on the unique (userId, clientId) end the same way.
 */
export async function saveVisitCore(userId: string, raw: unknown, now: Date = new Date()): Promise<PlacesResult<SavedVisit>> {
  const clean = cleanVisitInput(raw, now);
  if (!clean.ok) return clean;
  const v = clean.value;
  try {
    const existing = await findByClientId(userId, v.clientId);
    if (existing) return await answerKnown(userId, existing, v);
    const row = await prisma.locationCheckin.create({ data: { userId, clientId: v.clientId, ...dataOf(v) }, select: { id: true } });
    invalidate("places");
    return { ok: true, value: { id: row.id, replay: false, photoCount: 0 } };
  } catch (err) {
    // A second send of the same check-in won the unique race: answer the row it wrote.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      try {
        const again = await findByClientId(userId, v.clientId);
        if (again) return await answerKnown(userId, again, v);
      } catch (retryErr) {
        return writeError("saveVisitCore", retryErr);
      }
    }
    return writeError("saveVisitCore", err);
  }
}

/**
 * Edits one visit: its fields (checked again), and its photos: the stored ones named in `remove` (by their full
 * image's id, places.ts cleanPhotoIds) are removed, with their thumbnails, and the rest close up from 0 (photoPlanOf),
 * all in one transaction. The fields' update comes first and locks the visit's row, so an upload or a delete in flight
 * finishes first, and the photos are read inside the transaction after it. Ids never change when places close up, so
 * a retried edit (its answer lost) removes nothing more, and a photo this edit never saw is kept. The clientId of an
 * edit is the form's and is not stored (the visit keeps the key it was saved with).
 */
export async function updateVisitCore(userId: string, id: string, raw: unknown, remove: unknown, now: Date = new Date()): Promise<PlacesResult<SavedVisit>> {
  if (!isVisitId(id)) return { ok: false, error: VISIT_GONE };
  const clean = cleanVisitInput(raw, now);
  if (!clean.ok) return clean;
  const removeIds = new Set(cleanPhotoIds(remove));
  try {
    const count = await prisma.$transaction(async (tx) => {
      const updated = await tx.locationCheckin.updateMany({ where: { id, userId }, data: dataOf(clean.value) });
      if (updated.count === 0) return null;
      const stored = await tx.locationPhoto.findMany({ where: { userId, checkinId: id, kind: "full" }, select: { id: true, ord: true } });
      const plan = photoPlanOf(
        stored.map((s) => s.ord),
        stored.filter((s) => !removeIds.has(s.id)).map((s) => s.ord)
      );
      if (plan.remove.length > 0) await tx.locationPhoto.deleteMany({ where: { userId, checkinId: id, ord: { in: plan.remove } } });
      for (const m of plan.moves) await tx.locationPhoto.updateMany({ where: { userId, checkinId: id, ord: m.from }, data: { ord: m.to } });
      return plan.count;
    });
    if (count === null) return { ok: false, error: VISIT_GONE };
    invalidate("places");
    return { ok: true, value: { id, replay: false, photoCount: count } };
  } catch (err) {
    return writeError("updateVisitCore", err);
  }
}

/**
 * Deletes one visit and every photo of it, in one transaction: the visit first (its row lock waits for an upload in
 * flight to commit), then its photos (read after that commit, so an upload that won the race is removed too). One
 * that is already gone is not an error (deleted: 0).
 */
export async function deleteVisitCore(userId: string, id: string): Promise<PlacesResult<{ deleted: number }>> {
  if (!isVisitId(id)) return { ok: false, error: VISIT_GONE };
  try {
    const [res] = await prisma.$transaction([
      prisma.locationCheckin.deleteMany({ where: { userId, id } }),
      prisma.locationPhoto.deleteMany({ where: { userId, checkinId: id } }),
    ]);
    invalidate("places");
    return { ok: true, value: { deleted: res.count } };
  } catch (err) {
    return writeError("deleteVisitCore", err);
  }
}

export interface PhotoUpload {
  visitId: unknown;
  ord: unknown;
  full: Uint8Array;
  thumb: Uint8Array;
}

/**
 * One photo and its thumbnail into one of a visit's four places. Both are checked from their own bytes (places.ts
 * photoOf: JPEG or WebP, the pixels and the caps, a JPEG's metadata dropped) before anything is read. The visit is
 * checked inside the write's transaction under a share lock on its row (FOR SHARE): a delete that got there first has
 * committed before the check reads, so the upload answers VISIT_GONE and writes nothing; a delete that comes second
 * waits for this commit, then removes these rows with the rest (deleteVisitCore deletes the visit first). What held
 * that place is removed in the same transaction, so a retried upload replaces rather than adds, and every stored
 * image gets a new id (the served URL is never reused for other bytes).
 */
export async function savePhotoCore(userId: string, input: PhotoUpload): Promise<PlacesResult<VisitPhoto>> {
  if (!isVisitId(input.visitId)) return { ok: false, error: VISIT_GONE };
  const ord = photoOrdOf(input.ord);
  if (ord === null) return { ok: false, error: PHOTO_SLOT_BAD };
  const full = photoOf(input.full, "full");
  if (!full.ok) return full;
  const thumb = photoOf(input.thumb, "thumb");
  if (!thumb.ok) return thumb;
  const visitId = input.visitId;
  try {
    const row = (kind: "full" | "thumb", p: CheckedPhoto) => ({
      userId,
      checkinId: visitId,
      ord,
      kind,
      mime: p.mime,
      width: p.width,
      height: p.height,
      bytes: new Uint8Array(p.bytes),
      sizeBytes: p.sizeBytes,
    });
    const meta = { id: true, width: true, height: true } as const;
    const saved = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "public"."LocationCheckin" WHERE "id" = ${visitId} AND "userId" = ${userId} FOR SHARE`;
      if (locked.length === 0) return null;
      await tx.locationPhoto.deleteMany({ where: { userId, checkinId: visitId, ord } });
      const f = await tx.locationPhoto.create({ data: row("full", full.value), select: meta });
      const t = await tx.locationPhoto.create({ data: row("thumb", thumb.value), select: meta });
      return [f, t] as const;
    });
    if (!saved) return { ok: false, error: VISIT_GONE };
    const [f, t] = saved;
    invalidate("places");
    return { ok: true, value: { ord, full: imageOf(f), thumb: imageOf(t) } };
  } catch (err) {
    return writeError("savePhotoCore", err);
  }
}

/** One stored image's type and bytes (the user's own only). */
export async function loadPhotoCore(userId: string, id: string): Promise<PlacesResult<{ mime: string; bytes: Uint8Array }>> {
  if (!isVisitId(id)) return { ok: false, error: VISIT_GONE };
  try {
    const row = await prisma.locationPhoto.findFirst({ where: { id, userId }, select: { mime: true, bytes: true } });
    if (!row) return { ok: false, error: VISIT_GONE };
    return { ok: true, value: { mime: row.mime, bytes: row.bytes } };
  } catch (err) {
    logFailure("loadPhotoCore", err);
    return { ok: false, error: isMissingPlacesTable(err) ? PLACES_NOT_READY : SAVE_FAILED };
  }
}

// ── The photo route ──────────────────────────────────────────────────────

export interface PhotoRouteDeps {
  userId?: () => string;
  save?: typeof savePhotoCore;
  load?: typeof loadPhotoCore;
}

/** The HTTP status for a core's answer. */
function statusOf(res: PlacesResult<unknown>): number {
  if (res.ok) return 200;
  if (res.error === VISIT_GONE) return 404;
  if (res.error === PLACES_NOT_READY) return 503;
  if (res.error === SAVE_FAILED) return 500;
  return 422;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/**
 * A request from this site only: a browser's Sec-Fetch-Site (when sent) is same-origin (or none: the user's own
 * navigation), and an Origin (when sent) names this host.
 */
export function sameSite(request: Request, allowNavigation: boolean): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && !(allowNavigation && site === "none")) return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(request.url).host);
  } catch {
    /* no URL host to compare */
  }
  for (const h of [request.headers.get("host"), request.headers.get("x-forwarded-host")]) if (h) hosts.add(h.split(",")[0].trim());
  return hosts.has(host);
}

/** The body, at most `max` bytes (a longer one is null, read no further). */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      // Read no further (the rest is left unread; cancelling under a runtime's own pipe can throw outside this call).
      reader.releaseLock();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function bytesOf(v: FormDataEntryValue | null): Promise<Uint8Array | null> {
  if (!v || typeof v === "string") return null;
  return new Uint8Array(await v.arrayBuffer());
}

/**
 * POST /places/photo: one photo and its thumbnail (multipart: visitId, ord, full, thumb). Same site only (403),
 * multipart only (415), UPLOAD_MAX_BYTES at most (413, read no further), then the core's checks. Answers JSON, never
 * cached: 200 with the photo's ids and sizes, 404 for a visit that isn't there, 422 for a photo the checks refuse,
 * 503 before the migration, 500 otherwise. Logs nothing but the core's tags.
 */
export async function handlePhotoUpload(request: Request, deps: PhotoRouteDeps = {}): Promise<Response> {
  if (!sameSite(request, false)) return json({ ok: false, error: "Same site only." }, 403);
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;\s*boundary=/i.test(type)) return json({ ok: false, error: "Send the photo as a form." }, 415);
  let body: Uint8Array | null;
  try {
    body = await readCapped(request, UPLOAD_MAX_BYTES);
  } catch {
    return json({ ok: false, error: SAVE_FAILED }, 400);
  }
  if (!body) return json({ ok: false, error: "That photo is too large to send." }, 413);
  let form: FormData;
  try {
    form = await new Response(new Blob([new Uint8Array(body)]), { headers: { "content-type": type } }).formData();
  } catch {
    return json({ ok: false, error: SAVE_FAILED }, 400);
  }
  const [full, thumb] = await Promise.all([bytesOf(form.get("full")), bytesOf(form.get("thumb"))]);
  if (!full || !thumb) return json({ ok: false, error: SAVE_FAILED }, 400);
  let res: PlacesResult<VisitPhoto>;
  try {
    const userId = (deps.userId ?? getCurrentUserId)();
    res = await (deps.save ?? savePhotoCore)(userId, { visitId: form.get("visitId"), ord: form.get("ord"), full, thumb });
  } catch (err) {
    console.error(`handlePhotoUpload failed: ${placesErrorTag(err)}`);
    return json({ ok: false, error: SAVE_FAILED }, 500);
  }
  return json(res, statusOf(res));
}

/** The cache an image is served with: the user's own (private), and immutable, since an id is never reused. */
export const PHOTO_CACHE = "private, max-age=31536000, immutable";

/**
 * GET /places/photo/<id>: one stored image with its own Content-Type, its length, nosniff, and PHOTO_CACHE. Another
 * site never gets it (403: no hotlinking a private photo); a missing one is 404, before the migration 503, never cached.
 */
export async function handlePhotoGet(request: Request, id: string, deps: PhotoRouteDeps = {}): Promise<Response> {
  const noStore = { "cache-control": "no-store" };
  if (!sameSite(request, true)) return new Response(null, { status: 403, headers: noStore });
  if (!isVisitId(id)) return new Response(null, { status: 404, headers: noStore });
  let res: PlacesResult<{ mime: string; bytes: Uint8Array }>;
  try {
    res = await (deps.load ?? loadPhotoCore)((deps.userId ?? getCurrentUserId)(), id);
  } catch (err) {
    console.error(`handlePhotoGet failed: ${placesErrorTag(err)}`);
    return new Response(null, { status: 500, headers: noStore });
  }
  if (!res.ok) return new Response(null, { status: statusOf(res), headers: noStore });
  const bytes = new Uint8Array(res.value.bytes);
  return new Response(new Blob([bytes], { type: res.value.mime }), {
    status: 200,
    headers: {
      "content-type": res.value.mime,
      "content-length": String(bytes.length),
      "cache-control": PHOTO_CACHE,
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}


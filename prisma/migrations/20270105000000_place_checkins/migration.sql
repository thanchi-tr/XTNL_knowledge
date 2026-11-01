-- place_checkins (2026-11-01, the user's request: "a new Feature set call Location checkin: it allow to input picture,
-- start rating (service, food, premises, parking), and a short summary. it should a completely different tab"): Places,
-- its own section beside Ideas, Tasks and Body. Two new tables:
--   LocationCheckin  one visit to a place
--     placeName      what the user called it, 1..80 characters (src/lib/places.ts NAME_MAX)
--     placeKey       the name folded for grouping (places.ts placeKeyOf: case, spacing and accents), 1..160 characters;
--                    repeat visits to one place share it
--     address        an optional address, 1..160 characters (places.ts ADDRESS_MAX)
--     lat, lng       where the user was, only when they tapped "Use my location" (the browser's geolocation, never
--                    read on its own); both or neither
--     accuracyM      the reading's accuracy in whole metres, 0..100000; null without a location
--     visitedAt      when the user was there (default now; the form edits the date and the time)
--     day            the life day of visitedAt (src/lib/life-day.ts dayKeyOf: a 01:00 visit counts for the day before)
--     service, food, premises, parking
--                    each 1..5 stars, or null: "Not rated" (a place with no food or no parking). The overall is the
--                    mean of the given ratings to one decimal, derived on read and never stored
--     summary        an optional short summary, plain text, 1..280 characters (places.ts SUMMARY_MAX)
--     clientId       the save's key: a resend of one check-in (a retried request) answers the row it wrote, once
--   LocationPhoto    one stored image of a visit, at most 4 a visit (ord 0..3), each in two sizes (kind):
--     full           long edge at most 1600 px, at most 1.5 MB (1572864 bytes)
--     thumb          long edge at most 480 px, at most 256 KB (262144 bytes): what the list loads
--                    Both are resized and re-encoded in the browser before upload (a canvas draw: the browser applies
--                    the photo's orientation, and the re-encode leaves its metadata, GPS included, behind); the server
--                    checks the bytes again (places.ts photoOf: JPEG or WebP only, the size and the pixels read from
--                    the file itself, and any metadata segment left in a JPEG dropped before it is stored)
--     bytes          the image (bytea); sizeBytes its length. Served by GET /places/photo/<id> with its own type and
--                    an immutable cache: an id is never reused (a replaced photo is a new row with a new id)
-- A record, never a reward: no row pays or costs XP, MP, a streak day, a quest, a side-quest input, a Mall credit or a
-- calibration input, nothing in the economy reads either table, and no check-in is an ActivityEvent, so the 'life'
-- reset never deletes one (as it never deletes a weigh-in) and each one is deleted on its own, with its photos.
-- Plain TEXT ids (cuid) with no foreign key: a check-in's delete removes its photos in the same transaction.
-- Every timestamp is timestamptz; the life day is DATE.
-- Additive only: two new tables and their indexes; no existing table is altered, no column is dropped, renamed or
-- retyped, and nothing is backfilled.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first,
-- run `migrate status`, parse the ref out of DIRECT_URL, then apply with
-- `npx prisma db execute --file prisma/migrations/20270105000000_place_checkins/migration.sql --schema prisma/schema.prisma`
-- and `npx prisma migrate resolve --applied 20270105000000_place_checkins`, then `npx prisma generate`.
-- Deployed code tolerates the tables being absent: reads fail soft on P2021/42P01 (src/lib/places-server.ts
-- isMissingPlacesTable: the pages read ready: false and say "Places need a one-time database update first.") and
-- writes say so in that one plain line. Nothing writes on its own: every row is a user's save.
-- Prisma 6 cannot declare the CHECKs (LocationCheckin_placeName_check, LocationCheckin_placeKey_check,
-- LocationCheckin_address_check, LocationCheckin_lat_check, LocationCheckin_lng_check, LocationCheckin_accuracyM_check,
-- LocationCheckin_location_check, LocationCheckin_service_check, LocationCheckin_food_check,
-- LocationCheckin_premises_check, LocationCheckin_parking_check, LocationCheckin_summary_check,
-- LocationCheckin_clientId_check; LocationPhoto_ord_check, LocationPhoto_kind_check, LocationPhoto_mime_check,
-- LocationPhoto_width_check, LocationPhoto_height_check, LocationPhoto_thumb_check, LocationPhoto_sizeBytes_check,
-- LocationPhoto_thumbSize_check); schema.prisma names them on the models, and a future `migrate diff` proposal to drop
-- them must be deleted, never applied.
BEGIN;
CREATE TABLE "public"."LocationCheckin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "placeKey" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" INTEGER,
    "visitedAt" TIMESTAMPTZ(3) NOT NULL,
    "day" DATE NOT NULL,
    "service" SMALLINT,
    "food" SMALLINT,
    "premises" SMALLINT,
    "parking" SMALLINT,
    "summary" TEXT,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "LocationCheckin_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_placeName_check" CHECK (char_length("placeName") BETWEEN 1 AND 80);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_placeKey_check" CHECK (char_length("placeKey") BETWEEN 1 AND 160);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_address_check" CHECK ("address" IS NULL OR char_length("address") BETWEEN 1 AND 160);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_lat_check" CHECK ("lat" IS NULL OR "lat" BETWEEN -90 AND 90);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_lng_check" CHECK ("lng" IS NULL OR "lng" BETWEEN -180 AND 180);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_accuracyM_check" CHECK ("accuracyM" IS NULL OR "accuracyM" BETWEEN 0 AND 100000);
-- A location is both coordinates or neither, and an accuracy only comes with one.
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_location_check" CHECK ((("lat" IS NULL) = ("lng" IS NULL)) AND ("accuracyM" IS NULL OR "lat" IS NOT NULL));
-- Each rating is 1..5 stars, or null: "Not rated".
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_service_check" CHECK ("service" IS NULL OR "service" BETWEEN 1 AND 5);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_food_check" CHECK ("food" IS NULL OR "food" BETWEEN 1 AND 5);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_premises_check" CHECK ("premises" IS NULL OR "premises" BETWEEN 1 AND 5);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_parking_check" CHECK ("parking" IS NULL OR "parking" BETWEEN 1 AND 5);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_summary_check" CHECK ("summary" IS NULL OR char_length("summary") BETWEEN 1 AND 280);
ALTER TABLE "public"."LocationCheckin" ADD CONSTRAINT "LocationCheckin_clientId_check" CHECK (char_length("clientId") BETWEEN 1 AND 64);
-- A resend of one check-in (a retried request, a second tap on Save) finds the row it wrote.
CREATE UNIQUE INDEX "LocationCheckin_userId_clientId_key" ON "public"."LocationCheckin"("userId", "clientId");
-- The list's read (a user's visits, newest first).
CREATE INDEX "LocationCheckin_userId_visitedAt_idx" ON "public"."LocationCheckin"("userId", "visitedAt");
-- A visit's other visits to the same place.
CREATE INDEX "LocationCheckin_userId_placeKey_idx" ON "public"."LocationCheckin"("userId", "placeKey");
CREATE TABLE "public"."LocationPhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "ord" SMALLINT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" SMALLINT NOT NULL,
    "height" SMALLINT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationPhoto_pkey" PRIMARY KEY ("id")
);
-- At most 4 photos a visit: four places, 0..3.
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_ord_check" CHECK ("ord" BETWEEN 0 AND 3);
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_kind_check" CHECK ("kind" IN ('full', 'thumb'));
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_mime_check" CHECK ("mime" IN ('image/jpeg', 'image/webp'));
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_width_check" CHECK ("width" BETWEEN 1 AND 1600);
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_height_check" CHECK ("height" BETWEEN 1 AND 1600);
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_thumb_check" CHECK ("kind" = 'full' OR ("width" <= 480 AND "height" <= 480));
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_sizeBytes_check" CHECK ("sizeBytes" BETWEEN 1 AND 1572864 AND "sizeBytes" = octet_length("bytes"));
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_thumbSize_check" CHECK ("kind" = 'full' OR "sizeBytes" <= 262144);
-- One full image and one thumbnail in each of a visit's four places.
CREATE UNIQUE INDEX "LocationPhoto_checkinId_ord_kind_key" ON "public"."LocationPhoto"("checkinId", "ord", "kind");
-- The list's read: a user's thumbnails (their sizes and ids only, never their bytes).
CREATE INDEX "LocationPhoto_userId_kind_idx" ON "public"."LocationPhoto"("userId", "kind");
COMMIT;

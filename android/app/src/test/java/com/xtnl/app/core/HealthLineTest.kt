package com.xtnl.app.core

import androidx.health.connect.client.records.ExerciseSessionRecord
import com.xtnl.app.data.HealthBatch
import com.xtnl.app.data.HealthSessionCounts
import com.xtnl.app.data.HealthWalkCounts
import com.xtnl.app.data.HealthWeightCounts
import com.xtnl.app.data.healthBody
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Duration
import java.time.Instant

/**
 * Health Connect's walks, hikes, workouts and weight (blueprint P27, D22; D21): what is read, how it is sent, and the
 * words. Every exercise type here is the SDK's named constant (ExerciseSessionRecord.EXERCISE_TYPE_*), never a number.
 */
class HealthLineTest {
    private fun at(iso: String): Instant = Instant.parse(iso)
    private fun session(id: String = "a1b2-c3", type: Int = WALKING, start: String = "2026-10-20T23:20:00Z", end: String = "2026-10-20T23:50:00Z", m: Double? = 2600.0, climb: Double? = null, origin: String? = "com.sec.android.app.shealth") =
        HealthLine.Session(id, type, at(start), at(end), m, climb, origin)

    private companion object {
        const val WALKING = ExerciseSessionRecord.EXERCISE_TYPE_WALKING
        const val HIKING = ExerciseSessionRecord.EXERCISE_TYPE_HIKING
        const val RUNNING = ExerciseSessionRecord.EXERCISE_TYPE_RUNNING

        /** The server's kinds (health-ingest.ts HC_KINDS) and each one's variant keys (exercise.ts KIND_SPECS). */
        val SERVER_KINDS = listOf("WALK", "HIKE", "RUN", "CYCLE", "SWIM", "ROW", "ELLIPTICAL", "HIIT", "CIRCUIT", "SPORT", "YOGA", "MOBILITY", "LIFT")
        val VARIANTS = mapOf(
            "RUN" to setOf("ROAD", "TREADMILL", "TRAIL", "TRACK"),
            "CYCLE" to setOf("ROAD", "MTB", "STATIONARY", "SPIN"),
            "SWIM" to setOf("FREESTYLE", "BREAST", "BACK", "FLY", "MIXED"),
            "SPORT" to setOf("BASKETBALL", "SOCCER", "TENNIS", "TENNIS_DOUBLES", "BADMINTON", "SQUASH", "TABLE_TENNIS", "VOLLEYBALL", "MARTIAL_ARTS", "BOXING", "CLIMBING", "BOULDERING", "JUMP_ROPE", "OTHER"),
            "YOGA" to setOf("HATHA", "VINYASA", "POWER", "PILATES"),
        )

        fun source(rel: String): String =
            (File("src/main/java/com/xtnl/app/$rel").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/$rel")).readText().replace("\r\n", "\n")
    }

    /** D21: each Health Connect type the sync reads, by its named constant, to the server's kind and the variant it names. */
    @Test fun eachTypeIsMappedByItsNamedConstant() {
        fun k(type: Int) = HealthLine.KINDS[type]
        assertEquals(HealthLine.Kind("WALK"), k(ExerciseSessionRecord.EXERCISE_TYPE_WALKING))
        assertEquals(HealthLine.Kind("HIKE"), k(ExerciseSessionRecord.EXERCISE_TYPE_HIKING))
        assertEquals(HealthLine.Kind("RUN"), k(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING))
        assertEquals(HealthLine.Kind("RUN", variant = "TREADMILL"), k(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL))
        assertEquals(HealthLine.Kind("CYCLE"), k(ExerciseSessionRecord.EXERCISE_TYPE_BIKING))
        assertEquals(HealthLine.Kind("CYCLE", variant = "STATIONARY"), k(ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY))
        assertEquals(HealthLine.Kind("SWIM"), k(ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL))
        assertEquals(HealthLine.Kind("SWIM"), k(ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER))
        assertEquals(HealthLine.Kind("ROW"), k(ExerciseSessionRecord.EXERCISE_TYPE_ROWING))
        assertEquals(HealthLine.Kind("ROW"), k(ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE))
        assertEquals(HealthLine.Kind("ELLIPTICAL"), k(ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL))
        assertEquals(HealthLine.Kind("HIIT"), k(ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING))
        assertEquals(HealthLine.Kind("CIRCUIT"), k(ExerciseSessionRecord.EXERCISE_TYPE_BOOT_CAMP))
        assertEquals(HealthLine.Kind("CIRCUIT"), k(ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS))
        assertEquals(HealthLine.Kind("SPORT", variant = "BADMINTON"), k(ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON))
        assertEquals(HealthLine.Kind("SPORT", variant = "CLIMBING"), k(ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING))
        assertEquals(HealthLine.Kind("SPORT", variant = "MARTIAL_ARTS"), k(ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS))
        // Tennis says neither singles nor doubles, and boxing isn't said to be bag work: each keeps its own name.
        assertEquals(HealthLine.Kind("SPORT", variant = "OTHER", label = "Tennis"), k(ExerciseSessionRecord.EXERCISE_TYPE_TENNIS))
        assertEquals(HealthLine.Kind("SPORT", variant = "OTHER", label = "Boxing"), k(ExerciseSessionRecord.EXERCISE_TYPE_BOXING))
        assertEquals(HealthLine.Kind("SPORT", variant = "OTHER", label = "Rugby"), k(ExerciseSessionRecord.EXERCISE_TYPE_RUGBY))
        assertEquals(HealthLine.Kind("YOGA"), k(ExerciseSessionRecord.EXERCISE_TYPE_YOGA))
        assertEquals(HealthLine.Kind("YOGA", variant = "PILATES"), k(ExerciseSessionRecord.EXERCISE_TYPE_PILATES))
        assertEquals(HealthLine.Kind("MOBILITY"), k(ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING))
        assertEquals(HealthLine.Kind("LIFT"), k(ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING))
        assertEquals(HealthLine.Kind("LIFT"), k(ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING))
        // Anything else is never guessed: skipped, and counted.
        for (t in listOf(
            ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT,
            ExerciseSessionRecord.EXERCISE_TYPE_DANCING,
            ExerciseSessionRecord.EXERCISE_TYPE_GOLF,
            ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS,
            ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR,
            ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
            ExerciseSessionRecord.EXERCISE_TYPE_PADDLING,
        )) assertNull(HealthLine.kindOf(t))
        // Every kind the server takes is reached, and nothing it doesn't take is sent.
        assertEquals(SERVER_KINDS.toSet(), HealthLine.KINDS.values.map { it.kind }.toSet())
    }

    /** D21: a variant is always the server's own key for that kind; a name goes only with a sport of its own (OTHER). */
    @Test fun eachVariantIsTheServersOwnKey() {
        for ((type, k) in HealthLine.KINDS) {
            val v = k.variant ?: continue
            assertTrue("$type → ${k.kind} $v", v in (VARIANTS[k.kind] ?: emptySet()))
        }
        for (k in HealthLine.KINDS.values) {
            if (k.label != null) {
                assertEquals("SPORT", k.kind)
                assertEquals("OTHER", k.variant)
                assertTrue(k.label, k.label.length in 1..40)
            }
            if (k.kind == "SPORT") assertTrue("a game always names its sport", k.variant != null)
        }
    }

    /** D21: no integer stands in for an exercise type: the map, the reader and these tests use the named constants alone. */
    @Test fun noIntegerLiteralIsUsedForAnExerciseType() {
        val line = source("core/HealthLine.kt")
        val at0 = line.indexOf("val KINDS: Map<Int, Kind> = mapOf(")
        assertTrue("the map is there", at0 > 0)
        val block = line.substring(at0, line.indexOf("\n    )", at0))
        val entries = block.lines().drop(1).map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("//") }
        assertTrue("${entries.size} entries", entries.size >= 30)
        for (e in entries) assertTrue(e, Regex("""^ExerciseSessionRecord\.EXERCISE_TYPE_[A-Z_]+ to Kind\("[A-Z]+"(, (variant|label) = "[^"]+")*\),$""").matches(e))
        assertFalse("no digit in the map but the constants' names", Regex("""\d""").containsMatchIn(block.replace(Regex("""EXERCISE_TYPE_\w+"""), "")))
        assertFalse("no TYPE_* = <number>", Regex("""const val TYPE_\w+\s*=\s*\d+""").containsMatchIn(line))
        val reader = source("health/HealthReader.kt")
        assertFalse("the reader compares no type with a number", Regex("""exerciseType\s*(==|!=|in)\s*\d""").containsMatchIn(reader))
        assertTrue(reader.contains("HealthLine.readsDistance(r.exerciseType)"))
        val test = (File("src/test/java/com/xtnl/app/core/HealthLineTest.kt").takeIf { it.exists() } ?: File("app/src/test/java/com/xtnl/app/core/HealthLineTest.kt")).readText()
        assertFalse("these tests pass no number as a type", Regex("""type = \d""").containsMatchIn(test) || Regex("""kindOf\(\d""").containsMatchIn(test))
    }

    /** D21: each kind sent as the server takes it: a run with its distance, a lift with none (its minutes only). */
    @Test fun eachKindIsSentAsTheServerTakesIt() {
        val sent = HealthLine.sessionsOf(
            listOf(
                session(id = "run", type = ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL, start = "2026-10-20T21:00:00Z", end = "2026-10-20T21:28:40Z", m = 5204.6, climb = 30.0),
                session(id = "lift", type = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, start = "2026-10-20T22:00:00Z", end = "2026-10-20T22:45:00Z", m = 1200.0, climb = 4.0),
                session(id = "rugby", type = ExerciseSessionRecord.EXERCISE_TYPE_RUGBY, start = "2026-10-20T23:00:00Z", end = "2026-10-21T00:20:00Z", m = null),
                session(id = "spin", type = ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY, start = "2026-10-21T01:00:00Z", end = "2026-10-21T01:45:00Z", m = null),
                session(id = "dance", type = ExerciseSessionRecord.EXERCISE_TYPE_DANCING, start = "2026-10-21T02:00:00Z", end = "2026-10-21T03:00:00Z", m = null),
                session(id = "walk", start = "2026-10-21T04:00:00Z", end = "2026-10-21T04:30:00Z"),
            ),
        )
        assertEquals(listOf("run", "lift", "rugby", "walk"), sent.map { it.externalId })
        val run = sent[0]
        assertEquals("RUN", run.kind)
        assertEquals("TREADMILL", run.variant)
        assertEquals(5.205, run.distanceKm!!, 1e-9)
        assertNull("a run's climb is never sent: its incline isn't guessed", run.climbM)
        val lift = sent[1]
        assertEquals("LIFT", lift.kind)
        assertNull("a lift is its minutes only: no distance", lift.distanceKm)
        assertNull(lift.climbM)
        assertNull(lift.variant)
        assertEquals(HealthLine.Kind("SPORT", "OTHER", "Rugby"), HealthLine.Kind(sent[2].kind, sent[2].variant, sent[2].label))
        assertNull(sent[2].distanceKm)
        // The walk is sent exactly as before: its distance, no variant, no name.
        assertEquals(2.6, sent[3].distanceKm!!, 1e-9)
        assertNull(sent[3].variant)
        assertNull(sent[3].label)
        // A ride with no distance (the server would ask its watts) and a type it doesn't read are said, never sent.
        val read = listOf(
            session(id = "spin", type = ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY, m = null),
            session(id = "row", type = ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE, m = 5.0),
            session(id = "dance", type = ExerciseSessionRecord.EXERCISE_TYPE_DANCING, m = null),
            session(id = "golf", type = ExerciseSessionRecord.EXERCISE_TYPE_GOLF, m = 3000.0),
            session(id = "yoga", type = ExerciseSessionRecord.EXERCISE_TYPE_YOGA, m = null),
            session(id = "walk", m = null),
        )
        assertEquals(listOf("yoga"), HealthLine.sessionsOf(read).map { it.externalId })
        assertEquals(1, HealthLine.skippedNoDistance(read))
        assertEquals(2, HealthLine.skippedWorkoutsNoDistance(read))
        assertEquals(2, HealthLine.skippedUnread(read))
        assertEquals(
            "Health Connect: nothing new. · 1 walk skipped: no distance from their app · 2 workouts skipped: no distance from their app · 2 workouts skipped: not a kind XTNL reads yet",
            HealthLine.withSkipped("Health Connect: nothing new.", 1, 2, 2),
        )
        assertEquals("Health Connect: nothing new. · 1 workout skipped: not a kind XTNL reads yet", HealthLine.withSkipped("Health Connect: nothing new.", 0, 0, 1))
        // On the wire: a lift's body names only what it is (its id, kind and minutes); a game its sport's name too.
        val body = healthBody(HealthBatch(since = "2026-10-20T20:00:00Z", walks = sent))
        val walks = body["walks"] as JsonArray
        assertEquals(setOf("externalId", "kind", "start", "end", "distanceKm", "origin", "variant"), (walks[0] as JsonObject).keys)
        assertEquals(setOf("externalId", "kind", "start", "end", "origin"), (walks[1] as JsonObject).keys)
        assertEquals(setOf("externalId", "kind", "start", "end", "origin", "variant", "label"), (walks[2] as JsonObject).keys)
        assertEquals(setOf("externalId", "kind", "start", "end", "distanceKm", "origin"), (walks[3] as JsonObject).keys)
        // Only what walks always read is read: a kind with no distance needs no distance read, and only a walk a climb.
        assertTrue(HealthLine.readsDistance(ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL) && !HealthLine.readsDistance(ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING) && !HealthLine.readsDistance(ExerciseSessionRecord.EXERCISE_TYPE_DANCING))
        assertTrue(HealthLine.readsClimb(HIKING) && HealthLine.readsClimb(WALKING) && !HealthLine.readsClimb(RUNNING))
    }

    @Test fun onlyMappedTypesAreSentAndWalksAsBefore() {
        val sent = HealthLine.walksOf(listOf(session(type = RUNNING), session(id = "w", type = WALKING), session(id = "h", type = HIKING, climb = 160.0)))
        assertEquals(listOf("w" to "WALK", "h" to "HIKE"), sent.map { it.externalId to it.kind })
        assertEquals(listOf("a1b2-c3" to "RUN", "w" to "WALK", "h" to "HIKE"), HealthLine.sessionsOf(listOf(session(type = RUNNING), session(id = "w", type = WALKING), session(id = "h", type = HIKING, climb = 160.0))).map { it.externalId to it.kind })
    }

    @Test fun aWalkIsSentWithItsDistanceClimbAndOrigin() {
        val w = HealthLine.walksOf(listOf(session(m = 4123.4567, climb = 160.04, type = HIKING))).single()
        assertEquals(4.123, w.distanceKm!!, 1e-9)
        assertEquals(160.0, w.climbM!!, 1e-9)
        assertEquals("2026-10-20T23:20:00Z", w.start)
        assertEquals("2026-10-20T23:50:00Z", w.end)
        assertEquals("com.sec.android.app.shealth", w.origin)
        // No climb, a zero one or a bad package are left out (absent, never null on the wire).
        val flat = HealthLine.walksOf(listOf(session(climb = 0.0, origin = "not a package!"))).single()
        assertNull(flat.climbM)
        assertNull(flat.origin)
    }

    @Test fun aSessionTheServerCantLogIsNeverSent() {
        val skipped = HealthLine.walksOf(
            listOf(
                session(id = "no-distance", m = null),
                session(id = "five-metres", m = 5.0),
                session(id = "too-far", m = 250_000.0),
                session(id = "backwards", start = "2026-10-21T00:00:00Z", end = "2026-10-20T23:00:00Z"),
                session(id = "two-days", start = "2026-10-19T00:00:00Z", end = "2026-10-21T00:00:00Z"),
                session(id = "bad id with spaces"),
                session(id = "x".repeat(65)),
            ),
        )
        assertTrue(skipped.isEmpty())
    }

    /** D21: the same filter holds for a kind with no distance (a lift, yoga, a game), item by item; none is "no distance". */
    @Test fun aWorkoutTheServerCantLogIsNeverSent() {
        val lift = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING
        val yoga = ExerciseSessionRecord.EXERCISE_TYPE_YOGA
        val rugby = ExerciseSessionRecord.EXERCISE_TYPE_RUGBY
        val bad = listOf(lift, yoga, rugby).flatMap { type ->
            listOf(
                session(id = "backwards-$type", type = type, m = null, start = "2026-10-21T00:00:00Z", end = "2026-10-20T23:00:00Z"),
                session(id = "two-days-$type", type = type, m = null, start = "2026-10-19T00:00:00Z", end = "2026-10-21T00:00:00Z"),
                session(id = "bad id with spaces", type = type, m = null),
                session(id = "x".repeat(65), type = type, m = null),
            )
        }
        assertTrue(HealthLine.sessionsOf(bad).isEmpty())
        assertEquals(0, HealthLine.skippedWorkoutsNoDistance(bad))
        // One good lift among them is sent alone: the filter is per item, never the whole list.
        val sent = HealthLine.sessionsOf(bad + session(id = "lift-ok", type = lift, m = null))
        assertEquals(listOf("lift-ok" to "LIFT"), sent.map { it.externalId to it.kind })
    }

    @Test fun walksAndWeighInsGoOldestFirst() {
        val walks = HealthLine.walksOf(listOf(session(id = "late", start = "2026-10-21T01:00:00Z", end = "2026-10-21T01:30:00Z"), session(id = "early")))
        assertEquals(listOf("early", "late"), walks.map { it.externalId })
        val kg = HealthLine.weightsOf(
            listOf(
                HealthLine.Weigh("k2", at("2026-10-21T21:00:00Z"), 82.456),
                HealthLine.Weigh("k1", at("2026-10-20T21:00:00Z"), 82.9),
                HealthLine.Weigh("bad", at("2026-10-20T20:00:00Z"), 4000.0),
                HealthLine.Weigh("low", at("2026-10-20T20:00:00Z"), 12.0),
            ),
        )
        assertEquals(listOf("k1", "k2"), kg.map { it.externalId })
        assertEquals(82.46, kg[1].kg, 1e-9)
    }

    @Test fun batchesOfFiftyCarryTheSince() {
        val since = at("2026-10-20T23:00:00Z")
        val walks = HealthLine.walksOf((0 until 120).map { i -> session(id = "w$i", start = "2026-10-20T23:20:00Z", end = "2026-10-20T23:50:00Z") })
        val weights = HealthLine.weightsOf((0 until 30).map { HealthLine.Weigh("k$it", at("2026-10-20T21:00:00Z"), 82.0) })
        val b = HealthLine.batches(walks, weights, since)
        assertEquals(listOf(50, 50, 20), b.map { it.walks.size })
        assertEquals(listOf(30, 0, 0), b.map { it.weights.size })
        assertTrue(b.all { it.since == "2026-10-20T23:00:00Z" })
        assertTrue(b.all { it.walks.size <= HealthLine.SERVER_MAX && it.weights.size <= HealthLine.SERVER_MAX })
        assertTrue(HealthLine.batches(emptyList(), emptyList(), since).isEmpty())
    }

    @Test fun theFirstSyncReadsThirtyDaysThenFromTheLastLessTwoDays() {
        val since = at("2026-10-20T23:00:00Z")
        val now = at("2026-10-21T00:12:00Z")
        // First: the 30 days of history Health Connect lets a new app read (recorded, never paid, on the server).
        assertEquals(since.minus(Duration.ofDays(30)), HealthLine.readFrom(since, null, now))
        // Later: the last success less 48 hours (a late watch sync is still caught; a resend is a duplicate).
        val last = at("2026-11-10T08:00:00Z")
        assertEquals(last.minus(Duration.ofHours(48)), HealthLine.readFrom(since, last, at("2026-11-10T14:00:00Z")))
        // Never before the 30-day floor, never after now.
        assertEquals(since.minus(Duration.ofDays(30)), HealthLine.readFrom(since, since.minus(Duration.ofDays(40)), now))
        assertTrue(!HealthLine.readFrom(since, now.plusSeconds(3600), now).isAfter(now))
    }

    @Test fun theAppsOwnSyncIsAtMostEveryFifteenMinutesAndOnlyWhileOn() {
        val now = at("2026-10-21T00:12:00Z")
        assertFalse(HealthLine.foregroundDue(false, null, now))
        assertTrue(HealthLine.foregroundDue(true, null, now))
        assertFalse(HealthLine.foregroundDue(true, now.minusSeconds(14 * 60), now))
        assertTrue(HealthLine.foregroundDue(true, now.minusSeconds(15 * 60), now))
    }

    @Test fun itIsOffUntilTheUserTurnsItOnAndAsksForWalksAndWeightOnly() {
        val asked = HealthLine.asked(backgroundAvailable = true)
        assertEquals(
            setOf(
                "android.permission.health.READ_EXERCISE",
                "android.permission.health.READ_DISTANCE",
                "android.permission.health.READ_ELEVATION_GAINED",
                "android.permission.health.READ_WEIGHT",
                "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND",
            ),
            asked,
        )
        assertFalse(HealthLine.READ_IN_BACKGROUND in HealthLine.asked(backgroundAvailable = false))
        assertTrue(asked.none { it.contains("WRITE") || it.contains("STEPS") || it.contains("HEART") || it.contains("SLEEP") })
        // Ready once a session, its distance and a weigh-in are allowed (the climb and the background are extras).
        assertTrue(HealthLine.ready(HealthLine.REQUIRED))
        assertFalse(HealthLine.ready(setOf(HealthLine.READ_EXERCISE, HealthLine.READ_WEIGHT)))
        val now = at("2026-10-21T00:12:00Z")
        assertEquals("Off: nothing is read from Health Connect.", HealthLine.settingsLine(false, HealthLine.Availability.AVAILABLE, asked, now, "x", null, now))
    }

    /** The permission rationale: every permission asked for has its reason, and the rules say the backfill is never paid. */
    @Test fun theRationaleExplainsEveryPermissionAndTheRules() {
        for (p in HealthLine.asked(backgroundAvailable = true)) assertTrue(p, HealthLine.REASONS[p]?.isNotBlank() == true)
        assertEquals(HealthLine.asked(true), HealthLine.REASONS.keys)
        val rules = HealthLine.RULES.joinToString(" ")
        assertTrue(rules.contains("recorded, never paid, never a personal best"))
        assertTrue(rules.contains("never paid twice"))
        assertTrue(rules.contains("one you type after it came in is refused"))
        // D21: every other workout is a record, never paid, and a lift is its minutes alone.
        assertTrue(rules.contains("comes in as a record on Train › Exercise: never paid"))
        assertTrue(rules.contains("A lift comes in as its minutes only"))
        assertTrue(rules.contains("One you typed yourself is never replaced"))
        assertTrue(rules.contains("Nothing is written to Health Connect"))
        assertTrue(HealthLine.RATIONALE_TITLE.isNotBlank() && HealthLine.RATIONALE_LEAD.contains("Health Connect"))
    }

    @Test fun settingsSaysWhereItStands() {
        val now = at("2026-10-21T07:12:00Z")
        val ok = HealthLine.REQUIRED
        val a = HealthLine.Availability.AVAILABLE
        assertEquals("Health Connect isn't on this phone.", HealthLine.settingsLine(true, HealthLine.Availability.UNAVAILABLE, ok, null, null, null, now))
        assertEquals("Health Connect needs an update from the Play Store first.", HealthLine.settingsLine(true, HealthLine.Availability.NEEDS_UPDATE, ok, null, null, null, now))
        assertEquals("Allow XTNL to read exercise, distance and weight in Health Connect.", HealthLine.settingsLine(true, a, setOf(HealthLine.READ_WEIGHT), null, null, null, now))
        assertEquals("Waiting for the first sync: the last 30 days come in as history, never paid.", HealthLine.settingsLine(true, a, ok, null, null, null, now))
        // Today (the life day): the clock alone; the server's line less its prefix.
        assertEquals(
            "Last synced 18:05 · 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 weigh-in",
            HealthLine.settingsLine(true, a, ok, at("2026-10-21T07:05:00Z"), "Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 weigh-in", null, now),
        )
        assertEquals("Last synced Tue 20 Oct, 18:05 · nothing new.", HealthLine.settingsLine(true, a, ok, at("2026-10-20T07:05:00Z"), "Health Connect: nothing new.", null, now))
        assertEquals("Last try didn't land: Can't reach x. Check the connection.", HealthLine.settingsLine(true, a, ok, null, null, "Can't reach x. Check the connection.", now))
        assertEquals("Syncs about every 6 hours, and when the app opens.", HealthLine.backgroundLine(true, ok + HealthLine.READ_IN_BACKGROUND))
        assertTrue(HealthLine.backgroundLine(true, ok).startsWith("Syncs when the app opens."))
        // No background reads on this phone: no job is armed, so the line never promises one.
        assertEquals("Syncs when the app opens.", HealthLine.backgroundLine(false, ok + HealthLine.READ_IN_BACKGROUND))
        assertTrue(HealthLine.backgroundReady(true, ok + HealthLine.READ_IN_BACKGROUND))
        assertFalse(HealthLine.backgroundReady(true, ok))
        assertFalse(HealthLine.backgroundReady(false, ok + HealthLine.READ_IN_BACKGROUND))
    }

    /** A walk whose app wrote no distance is never silently skipped: the sync's line counts it. */
    @Test fun walksWithNoDistanceAreCountedAndSaid() {
        val read = listOf(session(id = "ok"), session(id = "none", m = null), session(id = "five", m = 5.0), session(id = "run", type = RUNNING, m = null), session(id = "far", m = 250_000.0))
        assertEquals(listOf("ok", "far").filter { id -> HealthLine.walksOf(read).any { it.externalId == id } }, listOf("ok"))
        assertEquals(2, HealthLine.skippedNoDistance(read))
        // D21: the run with no distance is a workout skipped, never a walk.
        assertEquals(1, HealthLine.skippedWorkoutsNoDistance(read))
        assertEquals("1 walk skipped: no distance from their app", HealthLine.skippedNote(1))
        assertNull(HealthLine.skippedNote(0))
        assertEquals("Health Connect: nothing new. · 2 walks skipped: no distance from their app", HealthLine.withSkipped("Health Connect: nothing new.", 2))
        assertEquals("Health Connect: nothing new.", HealthLine.withSkipped("Health Connect: nothing new.", 0))
    }

    /** The demo's line is the server's own words (health-ingest.ts ingestLineOf; health-ingest-check pins the same lines). */
    @Test fun theSyncLineIsTheServersWords() {
        assertEquals(
            "Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 already logged · 1 weigh-in",
            HealthLine.syncLine(HealthWalkCounts(added = 2, paid = 1, recorded = 1, matched = 1, xp = 18.4), HealthWeightCounts(added = 1), 0),
        )
        assertEquals("Health Connect: 3 walks in (1 paid 12.3 XP, 2 recorded)", HealthLine.syncLine(HealthWalkCounts(added = 3, paid = 1, recorded = 2, xp = 12.25), HealthWeightCounts(), 0))
        assertEquals("Health Connect: 1 weigh-in · 1 skipped", HealthLine.syncLine(HealthWalkCounts(), HealthWeightCounts(added = 1), 1))
        assertEquals("Health Connect: nothing new.", HealthLine.syncLine(HealthWalkCounts(duplicate = 4), HealthWeightCounts(kept = 2), 0))
        assertEquals(HealthWalkCounts(3, 2, 1, 1, 5, 30.6), HealthLine.sum(HealthWalkCounts(1, 1, 0, 1, 2, 18.36), HealthWalkCounts(2, 1, 1, 0, 3, 12.25)))
        assertEquals("nothing new.", HealthLine.shortLine(null))
        // D21: the workouts, after the walks; their matches join "already logged" (health-ingest-check pins the same lines).
        assertEquals(
            "Health Connect: 1 walk in (1 paid 12.3 XP) · 3 workouts recorded · 1 skipped",
            HealthLine.syncLine(HealthWalkCounts(added = 1, paid = 1, xp = 12.25), HealthSessionCounts(added = 3), HealthWeightCounts(), 1),
        )
        assertEquals("Health Connect: 1 workout recorded · 1 already logged", HealthLine.syncLine(HealthWalkCounts(), HealthSessionCounts(added = 1, matched = 1), HealthWeightCounts(), 0))
        assertEquals("Health Connect: nothing new.", HealthLine.syncLine(HealthWalkCounts(), HealthSessionCounts(duplicate = 3), HealthWeightCounts(), 0))
        assertEquals(HealthSessionCounts(3, 1, 4), HealthLine.sum(HealthSessionCounts(1, 1, 3), HealthSessionCounts(2, 0, 1)))
    }
}

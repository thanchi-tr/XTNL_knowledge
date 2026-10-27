package com.xtnl.app.core

import androidx.health.connect.client.records.ExerciseSessionRecord
import com.xtnl.app.data.HealthBatch
import com.xtnl.app.data.HealthSessionCounts
import com.xtnl.app.data.HealthWalk
import com.xtnl.app.data.HealthWalkCounts
import com.xtnl.app.data.HealthWeight
import com.xtnl.app.data.HealthWeightCounts
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.round

/**
 * Health Connect's walks, hikes, workouts and weight (blueprint 5.1d, plan P27, decision D22, widened by D21 of
 * docs/life-plan/health-2026-10-27.md): the rules and the words, pure (no Android; the exercise types are the SDK's
 * named constants, compiled in). health/HealthSync reads Health Connect and posts through these; Settings › Health
 * Connect and the rationale screen say these words. The server owns every rule that pays or records
 * (docs/mobile-api.md POST /exercise): the phone only reads, shapes and sends.
 *
 *  - **Off until the user turns it on** (Settings › Health Connect), after the rationale and Health Connect's own
 *    permission dialog. Walks, workouts and weight only: exercise sessions of the types [KINDS] maps (by name, never
 *    a number), their distance where the kind has one and a hike's climb, and weigh-ins. A type it doesn't map is
 *    skipped and counted. Never steps, heart rate or sleep, and nothing is written to Health Connect. No new
 *    permission: READ_EXERCISE covers every exercise type.
 *  - On the server a walk or a hike is priced as any walk; every other kind is a record (no pay), and a lift comes in
 *    as its minutes only (Health Connect carries no load).
 *  - **The backfill is record-only** (H17): `since` is the moment the sync was switched on; a walk that started before
 *    it is history on the server (recorded, never paid, never a personal best). The first sync reads the 30 days
 *    Health Connect lets a new app see; each later one reads from its last success, less 48 hours (a watch that syncs
 *    late is still caught; the server answers a resend as a duplicate).
 *  - Batches of 50 sessions and 50 weigh-ins (the server takes 100).
 */
object HealthLine {
    // ── What is read ────────────────────────────────────────────────────────

    /**
     * What one Health Connect exercise type is here: the server's kind, and the variant or the sport's name the type
     * itself says (a treadmill run's TREADMILL, rugby's own name), never a guess. WALK and HIKE are walks on the server;
     * every other kind is a record.
     */
    data class Kind(val kind: String, val variant: String? = null, val label: String? = null)

    /**
     * Health Connect's exercise types the sync reads, by the SDK's named constants (never a number: the research
     * reports disagreed on several, rowing 46 or 54, pilates 41 or 48, HIIT 34 or 36). Pilates is a yoga style here, as
     * on the web, so a pilates session typed by hand is its twin. Any other type is skipped and counted
     * ([skippedUnread]). HealthLineTest and health-ingest-check pin it.
     */
    val KINDS: Map<Int, Kind> = mapOf(
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING to Kind("WALK"),
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING to Kind("HIKE"),
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to Kind("RUN"),
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL to Kind("RUN", variant = "TREADMILL"),
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING to Kind("CYCLE"),
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY to Kind("CYCLE", variant = "STATIONARY"),
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL to Kind("SWIM"),
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER to Kind("SWIM"),
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING to Kind("ROW"),
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE to Kind("ROW"),
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL to Kind("ELLIPTICAL"),
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to Kind("HIIT"),
        ExerciseSessionRecord.EXERCISE_TYPE_BOOT_CAMP to Kind("CIRCUIT"),
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS to Kind("CIRCUIT"),
        // A game: its sport as the variant where the server has that sport.
        ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON to Kind("SPORT", variant = "BADMINTON"),
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL to Kind("SPORT", variant = "BASKETBALL"),
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER to Kind("SPORT", variant = "SOCCER"),
        ExerciseSessionRecord.EXERCISE_TYPE_SQUASH to Kind("SPORT", variant = "SQUASH"),
        ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS to Kind("SPORT", variant = "TABLE_TENNIS"),
        ExerciseSessionRecord.EXERCISE_TYPE_VOLLEYBALL to Kind("SPORT", variant = "VOLLEYBALL"),
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS to Kind("SPORT", variant = "MARTIAL_ARTS"),
        ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING to Kind("SPORT", variant = "CLIMBING"),
        // Every other racquet or team sport keeps its own name (OTHER): tennis says neither singles nor doubles, and
        // boxing isn't said to be bag work, so neither takes the variant that would say so.
        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS to Kind("SPORT", variant = "OTHER", label = "Tennis"),
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING to Kind("SPORT", variant = "OTHER", label = "Boxing"),
        ExerciseSessionRecord.EXERCISE_TYPE_RACQUETBALL to Kind("SPORT", variant = "OTHER", label = "Racquetball"),
        ExerciseSessionRecord.EXERCISE_TYPE_BASEBALL to Kind("SPORT", variant = "OTHER", label = "Baseball"),
        ExerciseSessionRecord.EXERCISE_TYPE_SOFTBALL to Kind("SPORT", variant = "OTHER", label = "Softball"),
        ExerciseSessionRecord.EXERCISE_TYPE_CRICKET to Kind("SPORT", variant = "OTHER", label = "Cricket"),
        ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AMERICAN to Kind("SPORT", variant = "OTHER", label = "American football"),
        ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AUSTRALIAN to Kind("SPORT", variant = "OTHER", label = "Australian football"),
        ExerciseSessionRecord.EXERCISE_TYPE_HANDBALL to Kind("SPORT", variant = "OTHER", label = "Handball"),
        ExerciseSessionRecord.EXERCISE_TYPE_ICE_HOCKEY to Kind("SPORT", variant = "OTHER", label = "Ice hockey"),
        ExerciseSessionRecord.EXERCISE_TYPE_ROLLER_HOCKEY to Kind("SPORT", variant = "OTHER", label = "Roller hockey"),
        ExerciseSessionRecord.EXERCISE_TYPE_RUGBY to Kind("SPORT", variant = "OTHER", label = "Rugby"),
        ExerciseSessionRecord.EXERCISE_TYPE_WATER_POLO to Kind("SPORT", variant = "OTHER", label = "Water polo"),
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA to Kind("YOGA"),
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES to Kind("YOGA", variant = "PILATES"),
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING to Kind("MOBILITY"),
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING to Kind("LIFT"),
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING to Kind("LIFT"),
    )

    fun kindOf(type: Int): String? = KINDS[type]?.kind

    /** The walks: priced on the server as walks always were, with the climb of a hike. */
    val WALK_KINDS: Set<String> = setOf("WALK", "HIKE")

    /**
     * The kinds sent with their distance, which need at least 10 m of it from their own app: a walk and a hike as
     * before, a run, a swim and a row (the server asks one), and a ride (a stationary bike with none can't be logged
     * without its watts, which Health Connect's session doesn't carry). Every other kind is sent without one.
     */
    val DISTANCE_KINDS: Set<String> = WALK_KINDS + setOf("RUN", "CYCLE", "SWIM", "ROW")

    /** Whether the sync reads this type's distance (its own app's, summed over the session). */
    fun readsDistance(type: Int): Boolean = kindOf(type) in DISTANCE_KINDS

    /** Whether the sync reads this type's climb (a walk's or a hike's; a run's incline is never guessed from one). */
    fun readsClimb(type: Int): Boolean = kindOf(type) in WALK_KINDS

    /** The permissions, as Android names them; the manifest declares each (HealthManifestTest pins it). */
    const val READ_EXERCISE = "android.permission.health.READ_EXERCISE"
    const val READ_DISTANCE = "android.permission.health.READ_DISTANCE"
    const val READ_ELEVATION = "android.permission.health.READ_ELEVATION_GAINED"
    const val READ_WEIGHT = "android.permission.health.READ_WEIGHT"
    /** Android 15+ (Health Connect's background-read feature): the job may read while the app is closed. */
    const val READ_IN_BACKGROUND = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"

    /** Without these there is nothing to sync: a session, its distance, a weigh-in. */
    val REQUIRED: Set<String> = setOf(READ_EXERCISE, READ_DISTANCE, READ_WEIGHT)

    /** What the app asks for: the required three, a hike's climb, and background reads where the phone has them. */
    fun asked(backgroundAvailable: Boolean): Set<String> =
        REQUIRED + READ_ELEVATION + (if (backgroundAvailable) setOf(READ_IN_BACKGROUND) else emptySet())

    fun ready(granted: Set<String>): Boolean = granted.containsAll(REQUIRED)

    /** The background job can run: the phone has Health Connect's background reads and the user allowed them. */
    fun backgroundReady(available: Boolean, granted: Set<String>): Boolean = available && READ_IN_BACKGROUND in granted

    /** Health Connect's own app (Android 13 and below; from 14 it is part of the system). */
    const val PROVIDER = "com.google.android.apps.healthdata"

    const val BATCH = 50
    const val SERVER_MAX = 100
    /** Health Connect lets a new app read this far back before its first grant. */
    const val HISTORY_DAYS = 30L
    const val OVERLAP_HOURS = 48L
    /** The background job's period (WorkManager; at most this often, when the phone allows it). */
    const val EVERY_HOURS = 6L
    /** The app's own sync when it comes to the front, at most this often. */
    const val FOREGROUND_MINUTES = 15L

    // ── The records ─────────────────────────────────────────────────────────

    /** A session as Health Connect holds it, with its distance and climb summed from its own app's records. */
    data class Session(
        val id: String,
        val type: Int,
        val start: Instant,
        val end: Instant,
        val distanceM: Double?,
        val climbM: Double?,
        val origin: String?,
    )

    data class Weigh(val id: String, val at: Instant, val kg: Double)

    private val ID = Regex("^[A-Za-z0-9_.:-]{1,64}$")
    private val PACKAGE = Regex("^[A-Za-z0-9_.]{1,100}$")
    private const val DAY_MINUTES = 24 * 60L

    private fun r(x: Double, dp: Int): Double {
        var f = 1.0
        repeat(dp) { f *= 10 }
        return round(x * f) / f
    }

    /** A session the server can log at all: an id it takes, a start before its end, at most a day long. */
    private fun loggable(s: Session): Boolean =
        ID.matches(s.id) && s.end.isAfter(s.start) && Duration.between(s.start, s.end).toMinutes() <= DAY_MINUTES

    /** The distance a session of a [DISTANCE_KINDS] kind must have: at least 10 m, at most 200 km for a walk, 1,000 km else. */
    private fun distanceOk(kind: String, metres: Double?): Boolean =
        metres != null && metres >= 10.0 && metres <= (if (kind in WALK_KINDS) 200_000.0 else 1_000_000.0)

    /**
     * The sessions to send, oldest first: every type [KINDS] maps, with an id the server takes, a start before its end
     * and at most a day long. A walk is sent exactly as it always was: at least 10 m walked (a session with no distance
     * isn't a walk the server can log), its climb only when above 0. A run, a ride, a swim or a row needs at least 10 m
     * too; every other kind (a lift, yoga, HIIT, a game) is sent with no distance, since it needs none, and none sends a
     * climb. The variant or the sport's name its type says goes with it; the origin only when it is a package name.
     */
    fun sessionsOf(sessions: List<Session>): List<HealthWalk> = sessions.mapNotNull { s ->
        val k = KINDS[s.type] ?: return@mapNotNull null
        if (!loggable(s)) return@mapNotNull null
        val distance = k.kind in DISTANCE_KINDS
        if (distance && !distanceOk(k.kind, s.distanceM)) return@mapNotNull null
        HealthWalk(
            externalId = s.id,
            kind = k.kind,
            start = s.start.toString(),
            end = s.end.toString(),
            distanceKm = if (distance) s.distanceM?.let { r(it / 1000.0, 3) } else null,
            climbM = if (k.kind in WALK_KINDS) s.climbM?.takeIf { it > 0 && it.isFinite() }?.let { r(it, 1) } else null,
            origin = s.origin?.takeIf { PACKAGE.matches(it) },
            variant = k.variant,
            label = k.label,
        )
    }.sortedBy { it.start }

    /** Of the sessions [sessionsOf] would send, the walks and hikes. */
    fun walksOf(sessions: List<Session>): List<HealthWalk> = sessionsOf(sessions).filter { it.kind in WALK_KINDS }

    /**
     * The walking and hiking sessions [sessionsOf] drops for want of a distance (none from the app that recorded them,
     * or under 10 m): the sync says how many, so a walk app that writes no distance is never silently skipped.
     */
    fun skippedNoDistance(sessions: List<Session>): Int = sessions.count { s ->
        kindOf(s.type) in WALK_KINDS && loggable(s) && s.distanceM.let { it == null || !(it >= 10.0) }
    }

    /** The runs, rides, swims and rows [sessionsOf] drops the same way (no distance from their app, or under 10 m). */
    fun skippedWorkoutsNoDistance(sessions: List<Session>): Int = sessions.count { s ->
        val kind = kindOf(s.type)
        kind != null && kind !in WALK_KINDS && kind in DISTANCE_KINDS && loggable(s) && s.distanceM.let { it == null || !(it >= 10.0) }
    }

    /** The sessions of a type [KINDS] doesn't map: skipped and counted, never sent as another kind. */
    fun skippedUnread(sessions: List<Session>): Int = sessions.count { KINDS[it.type] == null }

    /** "2 walks skipped: no distance from their app" (null with none). */
    fun skippedNote(n: Int): String? = if (n <= 0) null else "$n walk${if (n == 1) "" else "s"} skipped: no distance from their app"

    private fun workouts(n: Int, why: String): String? = if (n <= 0) null else "$n workout${if (n == 1) "" else "s"} skipped: $why"

    /** The sync's line with the walks it skipped for no distance after it ("Health Connect: nothing new. · 2 walks skipped: …"). */
    fun withSkipped(line: String, n: Int): String = withSkipped(line, n, 0, 0)

    /**
     * The same, then the workouts skipped for no distance and those of a kind it doesn't read: "… · 1 workout skipped:
     * no distance from their app · 2 workouts skipped: not a kind XTNL reads yet".
     */
    fun withSkipped(line: String, walks: Int, workoutsNoDistance: Int, unread: Int): String =
        listOfNotNull(line, skippedNote(walks), workouts(workoutsNoDistance, "no distance from their app"), workouts(unread, "not a kind XTNL reads yet")).joinToString(" · ")

    /** The weigh-ins to send: an id the server takes and 20 to 400 kg (the server's own range). */
    fun weightsOf(list: List<Weigh>): List<HealthWeight> = list
        .filter { ID.matches(it.id) && it.kg.isFinite() && it.kg >= 20.0 && it.kg <= 400.0 }
        .sortedBy { it.at }
        .map { HealthWeight(it.id, it.at.toString(), r(it.kg, 2)) }

    /** The batches to post, 50 sessions (walks and workouts) and 50 weigh-ins at a time; none when there is nothing to send. */
    fun batches(walks: List<HealthWalk>, weights: List<HealthWeight>, since: Instant): List<HealthBatch> {
        val w = walks.chunked(BATCH)
        val k = weights.chunked(BATCH)
        val n = maxOf(w.size, k.size)
        return (0 until n).map { i -> HealthBatch(since.toString(), w.getOrElse(i) { emptyList() }, k.getOrElse(i) { emptyList() }) }
    }

    /**
     * Where a sync starts reading: its last success less 48 hours, never before the 30 days ahead of the switch-on (the
     * history Health Connect lets the app see); the first sync reads those whole 30 days.
     */
    fun readFrom(since: Instant, lastSyncAt: Instant?, now: Instant): Instant {
        val floor = since.minus(Duration.ofDays(HISTORY_DAYS))
        val from = lastSyncAt?.minus(Duration.ofHours(OVERLAP_HOURS)) ?: floor
        return minOf(now, maxOf(floor, from))
    }

    /** Whether the app's own sync on coming to the front is due (on, and the last one at least 15 minutes ago). */
    fun foregroundDue(on: Boolean, lastTryAt: Instant?, now: Instant): Boolean =
        on && (lastTryAt == null || !now.isBefore(lastTryAt.plus(Duration.ofMinutes(FOREGROUND_MINUTES))))

    // ── The words ───────────────────────────────────────────────────────────

    const val TITLE = "Health Connect"
    const val TOGGLE = "Walks, workouts and weight"
    const val TOGGLE_SUB = "Read from Health Connect, so you don't log them by hand"

    enum class Availability { AVAILABLE, NEEDS_UPDATE, UNAVAILABLE }

    /** The line under the toggle: off, not on this phone, waiting on a permission or the first sync, or the last one. */
    fun settingsLine(
        on: Boolean,
        availability: Availability,
        granted: Set<String>,
        lastSyncAt: Instant?,
        lastLine: String?,
        lastError: String?,
        now: Instant,
        h24: Boolean = true,
    ): String = when {
        !on -> "Off: nothing is read from Health Connect."
        availability == Availability.UNAVAILABLE -> "Health Connect isn't on this phone."
        availability == Availability.NEEDS_UPDATE -> "Health Connect needs an update from the Play Store first."
        !ready(granted) -> "Allow XTNL to read exercise, distance and weight in Health Connect."
        lastError != null -> "Last try didn't land: $lastError"
        lastSyncAt == null -> "Waiting for the first sync: the last 30 days come in as history, never paid."
        else -> "Last synced ${whenLabel(lastSyncAt, now, h24)} · ${shortLine(lastLine)}"
    }

    /** "18:05" today (the life day), else "Tue 20 Oct, 18:05". */
    fun whenLabel(at: Instant, now: Instant, h24: Boolean = true): String {
        val clock = TimeLabels.clock(at, h24 = h24)
        if (TimeLabels.lifeDay(at) == TimeLabels.lifeDay(now)) return clock
        return at.atZone(TimeLabels.SYDNEY).format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)) + ", " + clock
    }

    /** The server's line less its "Health Connect: " prefix (the section's title says it). */
    fun shortLine(line: String?): String = (line ?: "nothing new.").removePrefix("Health Connect: ").trim().ifEmpty { "nothing new." }

    /** How the job runs: in the background where Android allows it and the user did, else when the app opens. */
    fun backgroundLine(backgroundAvailable: Boolean, granted: Set<String>): String = when {
        backgroundReady(backgroundAvailable, granted) -> "Syncs about every $EVERY_HOURS hours, and when the app opens."
        backgroundAvailable -> "Syncs when the app opens. Allow background reads in Health Connect to sync while it's closed."
        else -> "Syncs when the app opens."
    }

    /**
     * The server's own line for a batch (health-ingest.ts ingestLineOf), for the demo data and a sum of batches:
     * "Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 2 workouts recorded · 1 already logged · 1 weigh-in",
     * or "Health Connect: nothing new.".
     */
    fun syncLine(walks: HealthWalkCounts, sessions: HealthSessionCounts, weights: HealthWeightCounts, refused: Int): String {
        val parts = mutableListOf<String>()
        fun plural(n: Int, one: String) = "$n ${if (n == 1) one else "${one}s"}"
        if (walks.added > 0) {
            val how = listOfNotNull(
                if (walks.paid > 0) "${walks.paid} paid ${Fmt.figure(walks.xp)} XP" else null,
                if (walks.recorded > 0) "${walks.recorded} recorded" else null,
            ).joinToString(", ")
            parts += "${plural(walks.added, "walk")} in${if (how.isNotEmpty()) " ($how)" else ""}"
        }
        if (sessions.added > 0) parts += "${plural(sessions.added, "workout")} recorded"
        if (walks.matched + sessions.matched > 0) parts += "${walks.matched + sessions.matched} already logged"
        if (weights.added > 0) parts += plural(weights.added, "weigh-in")
        if (refused > 0) parts += "$refused skipped"
        return if (parts.isEmpty()) "Health Connect: nothing new." else "Health Connect: ${parts.joinToString(" · ")}"
    }

    /** The same with no workouts (a walks-only batch: its words exactly as before). */
    fun syncLine(walks: HealthWalkCounts, weights: HealthWeightCounts, refused: Int): String = syncLine(walks, HealthSessionCounts(), weights, refused)

    /** A sync's summary of several batches, added up (the last batch's refusals, counted). */
    fun sum(a: HealthWalkCounts, b: HealthWalkCounts) = HealthWalkCounts(
        a.added + b.added, a.paid + b.paid, a.recorded + b.recorded, a.matched + b.matched, a.duplicate + b.duplicate, r(a.xp + b.xp, 1),
    )

    fun sum(a: HealthSessionCounts, b: HealthSessionCounts) = HealthSessionCounts(a.added + b.added, a.matched + b.matched, a.duplicate + b.duplicate)

    fun sum(a: HealthWeightCounts, b: HealthWeightCounts) = HealthWeightCounts(a.added + b.added, a.kept + b.kept)

    // ── The rationale (Health Connect opens it from its own settings, and Settings shows it before asking) ──

    const val RATIONALE_TITLE = "Walks, workouts and weight from Health Connect"
    const val RATIONALE_LEAD =
        "XTNL can read your walks, hikes, other workouts and weigh-ins from Health Connect, so they arrive by themselves instead of being logged by hand."

    /** Why each permission is asked for, one line each (every asked permission has one: HealthLineTest pins it). */
    val REASONS: Map<String, String> = linkedMapOf(
        READ_EXERCISE to "Exercise sessions (walks, hikes, runs, rides, swims, lifts and more): when they started, how long they took and what kind they were.",
        READ_DISTANCE to "How far each walk, run, ride, swim or row went, from the app that recorded it.",
        READ_ELEVATION to "The climb on a hike, so its incline counts.",
        READ_WEIGHT to "Your weigh-ins, for Body's weight card.",
        READ_IN_BACKGROUND to "Reading while XTNL is closed, so the sync runs in the background.",
    )

    /** What happens with what is read (the server's rules, in its words). */
    val RULES: List<String> = listOf(
        "Walks from before you turn this on come in as history: recorded, never paid, never a personal best.",
        "A newer walk is priced exactly as one you log on Train › Exercise. A walk you already logged by hand is matched, and one you type after it came in is refused: never paid twice.",
        "Every other workout (a run, a ride, a swim, a game, yoga, a lift) comes in as a record on Train › Exercise: never paid. A lift comes in as its minutes only, and one you already logged is matched, never listed twice.",
        "A weigh-in is a record. One you typed yourself is never replaced.",
        "Nothing else is read: no steps, heart rate or sleep. Nothing is written to Health Connect.",
        "It is sent only to your XTNL server. Turn it off here, or take the permissions back in Health Connect, at any time.",
    )
}

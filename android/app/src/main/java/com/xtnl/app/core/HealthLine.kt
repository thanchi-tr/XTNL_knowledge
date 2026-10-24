package com.xtnl.app.core

import com.xtnl.app.data.HealthBatch
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
 * Health Connect's walks, hikes and weight (blueprint 5.1d, plan P27, decision D22): the rules and the words, pure (no
 * Android). health/HealthSync reads Health Connect and posts through these; Settings › Health Connect and the rationale
 * screen say these words. The server owns every rule that pays or records (docs/mobile-api.md POST /exercise): the
 * phone only reads, shapes and sends.
 *
 *  - **Off until the user turns it on** (Settings › Health Connect), after the rationale and Health Connect's own
 *    permission dialog. Walks and weight only: walking (79) and hiking (37) sessions, their distance and climb, and
 *    weigh-ins. Never steps, heart rate, sleep or another workout, and nothing is written to Health Connect.
 *  - **The backfill is record-only** (H17): `since` is the moment the sync was switched on; a walk that started before
 *    it is history on the server (recorded, never paid, never a personal best). The first sync reads the 30 days
 *    Health Connect lets a new app see; each later one reads from its last success, less 48 hours (a watch that syncs
 *    late is still caught; the server answers a resend as a duplicate).
 *  - Batches of 50 walks and 50 weigh-ins (the server takes 100).
 */
object HealthLine {
    // ── What is read ────────────────────────────────────────────────────────

    /** Health Connect's exercise types the sync reads (ExerciseSessionRecord.EXERCISE_TYPE_WALKING and _HIKING). */
    const val TYPE_WALKING = 79
    const val TYPE_HIKING = 37

    fun kindOf(type: Int): String? = when (type) {
        TYPE_WALKING -> "WALK"
        TYPE_HIKING -> "HIKE"
        else -> null
    }

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

    /**
     * The walks to send: walking and hiking sessions with an id the server takes, a start before their end, at most a
     * day long, and at least 10 m walked (a session with no distance isn't a walk the server can log). The climb is
     * kept only when it is above 0; the origin only when it is a package name.
     */
    fun walksOf(sessions: List<Session>): List<HealthWalk> = sessions.mapNotNull { s ->
        val kind = kindOf(s.type) ?: return@mapNotNull null
        if (!ID.matches(s.id)) return@mapNotNull null
        val minutes = Duration.between(s.start, s.end).toMinutes()
        if (!s.end.isAfter(s.start) || minutes > DAY_MINUTES) return@mapNotNull null
        val metres = s.distanceM ?: return@mapNotNull null
        if (!(metres >= 10.0) || metres > 200_000.0) return@mapNotNull null
        HealthWalk(
            externalId = s.id,
            kind = kind,
            start = s.start.toString(),
            end = s.end.toString(),
            distanceKm = r(metres / 1000.0, 3),
            climbM = s.climbM?.takeIf { it > 0 && it.isFinite() }?.let { r(it, 1) },
            origin = s.origin?.takeIf { PACKAGE.matches(it) },
        )
    }.sortedBy { it.start }

    /**
     * The walking and hiking sessions [walksOf] drops for want of a distance (none from the app that recorded them, or
     * under 10 m): the sync says how many, so a walk app that writes no distance is never silently skipped.
     */
    fun skippedNoDistance(sessions: List<Session>): Int = sessions.count { s ->
        kindOf(s.type) != null && ID.matches(s.id) && s.end.isAfter(s.start) && Duration.between(s.start, s.end).toMinutes() <= DAY_MINUTES &&
            s.distanceM.let { it == null || !(it >= 10.0) }
    }

    /** "2 walks skipped: no distance from their app" (null with none). */
    fun skippedNote(n: Int): String? = if (n <= 0) null else "$n walk${if (n == 1) "" else "s"} skipped: no distance from their app"

    /** The sync's line with the walks it skipped for no distance after it ("Health Connect: nothing new. · 2 walks skipped: …"). */
    fun withSkipped(line: String, n: Int): String = skippedNote(n)?.let { "$line · $it" } ?: line

    /** The weigh-ins to send: an id the server takes and 20 to 400 kg (the server's own range). */
    fun weightsOf(list: List<Weigh>): List<HealthWeight> = list
        .filter { ID.matches(it.id) && it.kg.isFinite() && it.kg >= 20.0 && it.kg <= 400.0 }
        .sortedBy { it.at }
        .map { HealthWeight(it.id, it.at.toString(), r(it.kg, 2)) }

    /** The batches to post, 50 walks and 50 weigh-ins at a time; none when there is nothing to send. */
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
    const val TOGGLE = "Walks, hikes and weight"
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
        !ready(granted) -> "Allow XTNL to read walks, distance and weight in Health Connect."
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
     * The server's own line for a batch (health-ingest.ts ingestLineOf), for the demo data: "Health Connect: 2 walks in
     * (1 paid 18.4 XP, 1 recorded) · 1 already logged · 1 weigh-in", or "Health Connect: nothing new.".
     */
    fun syncLine(walks: HealthWalkCounts, weights: HealthWeightCounts, refused: Int): String {
        val parts = mutableListOf<String>()
        fun plural(n: Int, one: String) = "$n ${if (n == 1) one else "${one}s"}"
        if (walks.added > 0) {
            val how = listOfNotNull(
                if (walks.paid > 0) "${walks.paid} paid ${Fmt.figure(walks.xp)} XP" else null,
                if (walks.recorded > 0) "${walks.recorded} recorded" else null,
            ).joinToString(", ")
            parts += "${plural(walks.added, "walk")} in${if (how.isNotEmpty()) " ($how)" else ""}"
        }
        if (walks.matched > 0) parts += "${walks.matched} already logged"
        if (weights.added > 0) parts += plural(weights.added, "weigh-in")
        if (refused > 0) parts += "$refused skipped"
        return if (parts.isEmpty()) "Health Connect: nothing new." else "Health Connect: ${parts.joinToString(" · ")}"
    }

    /** A sync's summary of several batches, added up (the last batch's refusals, counted). */
    fun sum(a: HealthWalkCounts, b: HealthWalkCounts) = HealthWalkCounts(
        a.added + b.added, a.paid + b.paid, a.recorded + b.recorded, a.matched + b.matched, a.duplicate + b.duplicate, r(a.xp + b.xp, 1),
    )

    fun sum(a: HealthWeightCounts, b: HealthWeightCounts) = HealthWeightCounts(a.added + b.added, a.kept + b.kept)

    // ── The rationale (Health Connect opens it from its own settings, and Settings shows it before asking) ──

    const val RATIONALE_TITLE = "Walks and weight from Health Connect"
    const val RATIONALE_LEAD =
        "XTNL can read your walks, hikes and weigh-ins from Health Connect, so they arrive by themselves instead of being logged by hand."

    /** Why each permission is asked for, one line each (every asked permission has one: HealthLineTest pins it). */
    val REASONS: Map<String, String> = linkedMapOf(
        READ_EXERCISE to "Walking and hiking sessions: when they started and how long they took.",
        READ_DISTANCE to "How far each walk went, from the app that recorded it.",
        READ_ELEVATION to "The climb on a hike, so its incline counts.",
        READ_WEIGHT to "Your weigh-ins, for Body's weight card.",
        READ_IN_BACKGROUND to "Reading while XTNL is closed, so the sync runs in the background.",
    )

    /** What happens with what is read (the server's rules, in its words). */
    val RULES: List<String> = listOf(
        "Walks from before you turn this on come in as history: recorded, never paid, never a personal best.",
        "A newer walk is priced exactly as one you log on Train › Exercise. A walk you already logged by hand is matched, and one you type after it came in is refused: never paid twice.",
        "A weigh-in is a record. One you typed yourself is never replaced.",
        "Nothing else is read: no steps, heart rate, sleep or other workouts. Nothing is written to Health Connect.",
        "It is sent only to your XTNL server. Turn it off here, or take the permissions back in Health Connect, at any time.",
    )
}

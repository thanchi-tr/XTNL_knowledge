package com.xtnl.app.health

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.xtnl.app.core.HealthLine
import com.xtnl.app.core.TimeLabels
import com.xtnl.app.data.AppSettings
import com.xtnl.app.data.HealthSessionCounts
import com.xtnl.app.data.HealthWalkCounts
import com.xtnl.app.data.HealthWeightCounts
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.XtnlApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * The Health Connect sync (blueprint 5.1d, P27, decision D22; core/HealthLine holds the rules and the words). Off until
 * the user turns it on in Settings › Health Connect: until then nothing is read and no job is armed. Once on:
 *
 *  - a WorkManager job about every 6 hours (online only), armed only where Android lets it read while the app is closed
 *    (Health Connect's background reads, available and allowed): without them no job is armed, and a run that finds
 *    them taken back since ends quietly (it never writes an error over the last good sync). The app syncs when it is
 *    opened either way ([runIfDue], at most every 15 minutes), and re-arms or cancels the job as the grant now stands;
 *  - each run reads exercise sessions and weigh-ins from where the last one left off (less 48 hours; the first reads
 *    Health Connect's 30 days of history) and posts them to `POST /exercise` 50 at a time. The server writes each walk
 *    once per record, matches one the user typed by hand, and records the backfill (before `since`) without pay; every
 *    other kind (D21) is a record of its own kind, once per record, never paid, and a lift is its minutes alone.
 *
 * One run at a time (the job and the app never overlap). Settings shows the last run's line or why it didn't land.
 */
class HealthSync(private val app: Context, private val settings: AppSettings, private val api: () -> XtnlApi) {
    private val reader = HealthReader(app)
    private val lock = Mutex()
    /** Where the job is armed or cancelled (a grant is read off the main thread). */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    sealed interface Run {
        data object Off : Run
        data object Unavailable : Run
        data object NoPermission : Run
        data class Done(val line: String) : Run
        data class Failed(val message: String, val offline: Boolean) : Run
    }

    fun availability(): HealthLine.Availability = runCatching { reader.availability() }.getOrDefault(HealthLine.Availability.UNAVAILABLE)

    suspend fun granted(): Set<String> =
        if (availability() != HealthLine.Availability.AVAILABLE) emptySet() else runCatching { reader.granted() }.getOrDefault(emptySet())

    fun backgroundAvailable(): Boolean = availability() == HealthLine.Availability.AVAILABLE && reader.backgroundAvailable()

    /** Arms the periodic job while the sync is on and background reads are allowed, else cancels it (see [arm]). */
    fun schedule() {
        scope.launch { arm() }
    }

    /**
     * One job, kept across restarts: armed while the sync is on and Health Connect lets the app read in the background
     * (HealthLine.backgroundReady), cancelled otherwise, so a job that could only be refused never runs.
     */
    suspend fun arm() {
        val wm = runCatching { WorkManager.getInstance(app) }.getOrNull() ?: return
        if (!settings.state.value.healthSync || !HealthLine.backgroundReady(backgroundAvailable(), granted())) {
            wm.cancelUniqueWork(PERIODIC)
            return
        }
        val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val job = PeriodicWorkRequestBuilder<HealthSyncWorker>(HealthLine.EVERY_HOURS, TimeUnit.HOURS).setConstraints(online).build()
        wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, job)
    }

    /** Settings › Health Connect's toggle: on starts the history at now (`since`), off stops reading and the job. */
    fun setEnabled(on: Boolean, now: Instant = Instant.now()) {
        settings.setHealthSync(on, now)
        schedule()
    }

    /** The app came to the front: the job re-armed (or cancelled) as the grants now stand, and a run when one is due. */
    suspend fun runIfDue(now: Instant = Instant.now()) {
        val p = settings.state.value
        if (p.healthSync) arm()
        if (HealthLine.foregroundDue(p.healthSync, TimeLabels.parseInstant(p.healthTriedAt), now)) run(now)
    }

    /**
     * One run: read, shape, post. Never throws; what happened is in Settings' line. A [background] run (the job) without
     * background reads allowed ends quietly as NoPermission and cancels the job: it never records a failure, so the
     * last good sync's line stays and the app's own sync on opening isn't held back.
     */
    suspend fun run(now: Instant = Instant.now(), background: Boolean = false): Run = lock.withLock {
        val p = settings.state.value
        if (!p.healthSync) return@withLock Run.Off
        if (availability() != HealthLine.Availability.AVAILABLE) return@withLock Run.Unavailable
        val granted = granted()
        if (!HealthLine.ready(granted)) return@withLock Run.NoPermission
        if (background && !HealthLine.backgroundReady(backgroundAvailable(), granted)) {
            schedule()
            return@withLock Run.NoPermission
        }
        val since = TimeLabels.parseInstant(p.healthSince) ?: now.also { settings.setHealthSync(true, it) }
        val from = HealthLine.readFrom(since, TimeLabels.parseInstant(p.healthLastAt), now)
        val read = try {
            reader.sessions(from, now, climb = HealthLine.READ_ELEVATION in granted) to reader.weights(from, now)
        } catch (e: SecurityException) {
            // Android 15+ refuses a read while the app is closed without the background permission: quiet in the
            // background (the app syncs when it opens), said only when the user is looking.
            if (background) return@withLock Run.NoPermission
            return@withLock failed(now, BACKGROUND_REFUSED, offline = false)
        } catch (e: Exception) {
            return@withLock failed(now, READ_FAILED, offline = false)
        }
        val sessions = HealthLine.sessionsOf(read.first)
        val weights = HealthLine.weightsOf(read.second)
        // Walks and workouts dropped for no distance from their app, and types it doesn't read, are said, never
        // silently skipped.
        val noDistance = HealthLine.skippedNoDistance(read.first)
        val workoutsNoDistance = HealthLine.skippedWorkoutsNoDistance(read.first)
        val unread = HealthLine.skippedUnread(read.first)
        val batches = HealthLine.batches(sessions, weights, since)
        var walked = HealthWalkCounts()
        var worked = HealthSessionCounts()
        var weighed = HealthWeightCounts()
        var refused = 0
        var line: String? = null
        for (b in batches) {
            when (val r = api().syncHealth(b, UUID.randomUUID().toString())) {
                is Outcome.Ok -> {
                    walked = HealthLine.sum(walked, r.value.walks)
                    worked = HealthLine.sum(worked, r.value.sessions)
                    weighed = HealthLine.sum(weighed, r.value.weights)
                    refused += r.value.refused.size
                    line = r.value.line
                }
                // What landed before it stays (the next run sends it again and the server answers it as duplicates).
                is Outcome.Err -> return@withLock failed(now, r.message, r.offline)
            }
        }
        // One batch: the server's own line; several: the same words over their sum; then what was skipped here.
        val said = HealthLine.withSkipped(if (batches.size == 1 && line != null) line else HealthLine.syncLine(walked, worked, weighed, refused), noDistance, workoutsNoDistance, unread)
        settings.setHealthSynced(now, said)
        Run.Done(said)
    }

    private fun failed(now: Instant, message: String, offline: Boolean): Run {
        settings.setHealthFailed(now, message)
        return Run.Failed(message, offline)
    }

    companion object {
        const val PERIODIC = "health-connect-sync"
        const val BACKGROUND_REFUSED = "Health Connect reads only while XTNL is open here, so it syncs when you open the app."
        const val READ_FAILED = "Health Connect couldn't be read. It tries again later."
    }
}

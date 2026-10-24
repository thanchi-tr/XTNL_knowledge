package com.xtnl.app.health

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.xtnl.app.XtnlApp

/**
 * The periodic job: one background run (an offline one is retried, at most three times; anything else waits for the
 * next period). Without background reads allowed it ends quietly and the job is cancelled (HealthSync.run).
 */
class HealthSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val sync = (applicationContext as? XtnlApp)?.graph?.healthSync ?: return Result.success()
        return when (val r = sync.run(background = true)) {
            is HealthSync.Run.Failed -> if (r.offline && runAttemptCount < 3) Result.retry() else Result.success()
            else -> Result.success()
        }
    }
}

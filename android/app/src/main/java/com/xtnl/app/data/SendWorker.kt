package com.xtnl.app.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.xtnl.app.XtnlApp
import com.xtnl.app.core.SendLine
import java.util.concurrent.TimeUnit

/**
 * The offline queue's job (blueprint P8; data/SendQueue): one pass once the phone is online. A pass that couldn't land
 * (no answer, a server fault) is retried with backoff, 30 s doubling; one the server holds (its token) or that sent
 * everything ends. Each new waiting write arms another run behind any that waits, so none is missed.
 */
class SendWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val queue = (applicationContext as? XtnlApp)?.graph?.sendQueue ?: return Result.success()
        return if (queue.pass() == SendQueue.Pass.RETRY) Result.retry() else Result.success()
    }

    companion object {
        private const val WORK = "xtnl.send-queue"

        /** Arms a run (online only), after any already waiting. A test without WorkManager arms nothing. */
        fun arm(context: Context) {
            val wm = runCatching { WorkManager.getInstance(context) }.getOrNull() ?: return
            val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val job = OneTimeWorkRequestBuilder<SendWorker>()
                .setConstraints(online)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, SendLine.BACKOFF_SECONDS, TimeUnit.SECONDS)
                .build()
            runCatching { wm.enqueueUniqueWork(WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, job) }
        }
    }
}

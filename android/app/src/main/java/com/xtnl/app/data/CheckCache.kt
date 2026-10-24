package com.xtnl.app.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.io.File

/**
 * The last GET /check that arrived, so the home screen has something true to
 * show offline ("Offline · updated 10:42"). One file, keyed by where it came
 * from: a cache from another server, or from demo data, is never shown.
 * P8: [latest] is the entry last read or written (the widget follows it), and a
 * write the offline queue landed is followed in it ([follow]).
 */
class CheckCache(context: Context, private val onWrite: () -> Unit = {}) {
    private val file = File(context.filesDir, "check-cache.json")

    @Serializable
    data class Entry(val source: String, val fetchedAtMs: Long, val data: CheckData)

    private val _latest = MutableStateFlow<Entry?>(null)
    /** The entry last read or written, whatever its source (a reader checks it is its own). */
    val latest: StateFlow<Entry?> = _latest.asStateFlow()

    suspend fun read(source: String): Entry? = withContext(Dispatchers.IO) {
        runCatching {
            if (!file.exists()) return@withContext null
            Net.json.decodeFromString(Entry.serializer(), file.readText()).takeIf { it.source == source }
        }.getOrNull()?.also { _latest.value = it }
    }

    /** [notify] false: the widget's own read, which needs no second refresh of itself. */
    suspend fun write(source: String, data: CheckData, atMs: Long = System.currentTimeMillis(), notify: Boolean = true) = withContext(Dispatchers.IO) {
        runCatching {
            val tmp = File(file.parentFile, file.name + ".tmp")
            val entry = Entry(source, atMs, data)
            tmp.writeText(Net.json.encodeToString(Entry.serializer(), entry))
            if (!tmp.renameTo(file)) {
                file.delete()
                tmp.renameTo(file)
            }
            _latest.value = entry
        }
        if (notify) onWrite()
        Unit
    }

    /**
     * A queued write that landed (blueprint P8), followed in the cache, so the widget and an offline Check show it done
     * until the next /check: a tick's row (on the lane its day names) done with what it paid, a Done's work item gone.
     * The cache keeps its own time: it is still the /check it was, with what landed since.
     */
    suspend fun follow(landed: Landed) {
        val e = read(landed.item.source) ?: return
        val next = followed(e.data, landed)
        if (next != e.data) write(e.source, next, e.fetchedAtMs)
    }

    /**
     * P8 review: a tick made on Check that landed, followed the same way, so the widget (poked by the write) stops
     * listing a row the app has ticked; a tick answers with no /check after it, so nothing else would tell it.
     */
    suspend fun followTick(source: String, templateId: String, day: String, mvv: Boolean, xp: Double?) {
        val e = read(source) ?: return
        val next = ticked(e.data, templateId, day, mvv, xp)
        if (next != e.data) write(e.source, next, e.fetchedAtMs)
    }

    companion object {
        /** [data] with [landed] in it (pure; see [follow]). */
        fun followed(data: CheckData, landed: Landed): CheckData {
            val item = landed.item
            return when (landed) {
                is Landed.Tick -> ticked(data, item.templateId.orEmpty(), item.day, item.mvv, landed.result.xp)
                is Landed.Work -> data.copy(work = data.work.filter { it.id != item.workId })
                is Landed.Log -> data
            }
        }

        /** [data] with [templateId]'s row on the lane [day] names done, with what it paid ([xp]; pure; see [followTick]). */
        fun ticked(data: CheckData, templateId: String, day: String, mvv: Boolean, xp: Double?): CheckData {
            val status = if (mvv) "DONE_MVV" else "DONE"
            val done = { t: TaskItem -> if (t.templateId == templateId && t.open) t.copy(status = status, xpHint = xp ?: t.xpHint, timer = null) else t }
            return when (day) {
                data.day -> data.copy(tasks = data.tasks.map(done))
                data.yesterday?.day -> data.copy(yesterday = data.yesterday.copy(tasks = data.yesterday.tasks.map(done)))
                else -> data
            }
        }
    }
}

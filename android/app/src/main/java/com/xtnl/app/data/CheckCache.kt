package com.xtnl.app.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.io.File

/**
 * The last GET /check that arrived, so the home screen has something true to
 * show offline ("Offline · updated 10:42"). One file, keyed by where it came
 * from: a cache from another server, or from demo data, is never shown.
 */
class CheckCache(context: Context) {
    private val file = File(context.filesDir, "check-cache.json")

    @Serializable
    data class Entry(val source: String, val fetchedAtMs: Long, val data: CheckData)

    suspend fun read(source: String): Entry? = withContext(Dispatchers.IO) {
        runCatching {
            if (!file.exists()) return@withContext null
            Net.json.decodeFromString(Entry.serializer(), file.readText()).takeIf { it.source == source }
        }.getOrNull()
    }

    suspend fun write(source: String, data: CheckData, atMs: Long = System.currentTimeMillis()) = withContext(Dispatchers.IO) {
        runCatching {
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(Net.json.encodeToString(Entry.serializer(), Entry(source, atMs, data)))
            if (!tmp.renameTo(file)) {
                file.delete()
                tmp.renameTo(file)
            }
        }
        Unit
    }
}

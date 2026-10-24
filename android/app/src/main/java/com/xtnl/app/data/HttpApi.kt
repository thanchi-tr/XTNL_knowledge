package com.xtnl.app.data

import com.xtnl.app.BuildConfig
import com.xtnl.app.core.ServerAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import kotlin.coroutines.resume

object Net {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        isLenient = true
    }

    /** Ordinary calls: quick to give up, so a dead connection shows the cache fast. */
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    /** POST /ideas embeds and files the idea: give it time. */
    val slowClient: OkHttpClient by lazy {
        client.newBuilder().readTimeout(75, TimeUnit.SECONDS).callTimeout(90, TimeUnit.SECONDS).build()
    }

    val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
}

/**
 * The server, through `<server>/api/mobile/v1`. The address and the token are
 * read on every call, so a change in Settings takes effect at once.
 */
class HttpApi(
    private val server: () -> String,
    private val token: () -> String?,
) : XtnlApi {

    private fun url(path: String) = server().trimEnd('/') + "/api/mobile/v1" + path

    /** A finished exchange: the status and body, or the IOException that stopped it. */
    private class Raw(val status: Int, val text: String?, val failure: IOException?)

    private suspend fun execute(client: OkHttpClient, request: Request): Raw = suspendCancellableCoroutine { cont ->
        val call = client.newCall(request)
        cont.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) cont.resume(Raw(0, null, e))
            }

            override fun onResponse(call: Call, response: Response) {
                val raw = response.use { r ->
                    try {
                        Raw(r.code, r.body?.string().orEmpty(), null)
                    } catch (e: IOException) {
                        Raw(r.code, null, e)
                    }
                }
                if (cont.isActive) cont.resume(raw)
            }
        })
    }

    private fun request(path: String, body: JsonObject?): Request {
        val b = Request.Builder()
            .url(url(path))
            .header("Accept", "application/json")
            .header("User-Agent", "XTNLAndroid/${BuildConfig.VERSION_NAME}")
        token()?.takeIf { it.isNotBlank() }?.let { b.header("Authorization", "Bearer $it") }
        if (body != null) b.post(Net.json.encodeToString(JsonObject.serializer(), body).toRequestBody(Net.JSON_TYPE)) else b.get()
        return b.build()
    }

    private suspend fun <T> call(path: String, body: JsonObject?, ser: KSerializer<T>, slow: Boolean = false): Outcome<T> {
        // The request is built off the main thread too: its token may first have to be opened by the Keystore.
        val raw = withContext(Dispatchers.IO) {
            val req = try {
                request(path, body)
            } catch (e: IllegalArgumentException) {
                return@withContext null
            }
            execute(if (slow) Net.slowClient else Net.client, req)
        } ?: return Outcome.Err("The server address isn't valid. Check it in Settings.", code = "bad")
        val text = raw.text ?: return Outcome.Err(offlineLine(raw.failure), offline = true)
        return parse(raw.status, text, ser)
    }

    private fun offlineLine(e: IOException?): String {
        val host = ServerAddress.hostOf(server())
        return when (e) {
            is UnknownHostException -> "Can't reach $host. Check the connection."
            is SocketTimeoutException -> "$host took too long to answer. Try again."
            is ConnectException -> "$host didn't answer. Is the server running?"
            is SSLException -> "Couldn't make a secure connection to $host."
            else -> "Can't reach $host. Check the connection."
        }
    }

    companion object {
        const val AUTH_LINE = "The server wants its API token. Set the API token in More › Settings."

        /** The envelope: `{ok:true, data}` or `{ok:false, error, code}`; anything else becomes a plain line. */
        fun <T> parse(status: Int, text: String, ser: KSerializer<T>): Outcome<T> {
            val obj = runCatching { Net.json.parseToJsonElement(text) as? JsonObject }.getOrNull()
            if (obj == null) {
                return Outcome.Err(
                    when (status) {
                        401, 403 -> AUTH_LINE
                        404 -> "This server has no mobile API (404). Check the address in Settings."
                        in 500..599 -> "The server had a problem ($status). Try again."
                        else -> "The server sent something unexpected ($status)."
                    },
                    code = if (status == 401) "auth" else null,
                    status = status,
                )
            }
            val ok = (obj["ok"] as? JsonPrimitive)?.booleanOrNull == true
            if (!ok || status !in 200..299) {
                val code = (obj["code"] as? JsonPrimitive)?.contentOrNull ?: if (status == 401) "auth" else null
                // A missing or wrong token: say where to fix it, whatever the server's words.
                if (code == "auth") return Outcome.Err(AUTH_LINE, code = "auth", status = status)
                val line = (obj["error"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: "The server said no ($status)."
                return Outcome.Err(line, code = code, status = status)
            }
            val data: JsonElement = obj["data"] ?: JsonObject(emptyMap())
            return try {
                Outcome.Ok(Net.json.decodeFromJsonElement(ser, data))
            } catch (e: Exception) {
                Outcome.Err("The server's answer didn't fit this app version. Update the app or the server.", code = "server", status = status)
            }
        }
    }

    override suspend fun check() = call("/check", null, CheckData.serializer())

    override suspend fun completeTask(templateId: String, mvv: Boolean, clientId: String, minutes: Int?, sessionId: String?, pages: Int?) =
        call("/tasks/complete", buildJsonObject {
            put("templateId", templateId)
            put("day", "today")
            if (mvv) put("mvv", true)
            minutes?.let { put("minutes", it) }
            sessionId?.let { put("sessionId", it) }
            // P24: a reading task's pages.
            pages?.let { putJsonObject("proof") { put("kind", "PAGES"); put("qty", it) } }
            put("clientId", clientId)
        }, CompleteResult.serializer())

    override suspend fun startTimer(templateId: String, clientId: String) =
        call("/tasks/start", buildJsonObject { put("templateId", templateId); put("clientId", clientId) }, TimerResult.serializer())

    override suspend fun stopTimer(sessionId: String, clientId: String) =
        call("/tasks/stop", buildJsonObject { put("sessionId", sessionId); put("clientId", clientId) }, TimerResult.serializer())

    override suspend fun undoTask(instanceId: String, clientId: String) =
        call("/tasks/undo", buildJsonObject { put("instanceId", instanceId); put("clientId", clientId) }, UndoTaskResult.serializer())

    // P22: an owed card's action; the clientId is required (the server answers a retry once).
    override suspend fun makeUp(instanceId: String, action: String, clientId: String, minutes: Int?, pages: Int?) =
        call("/tasks/makeup", buildJsonObject {
            put("instanceId", instanceId)
            put("action", action)
            minutes?.let { put("minutes", it) }
            pages?.let { putJsonObject("proof") { put("kind", "PAGES"); put("qty", it) } }
            put("clientId", clientId)
        }, MakeUpResult.serializer())

    override suspend fun workDone(id: String, clientId: String) =
        call("/work/done", buildJsonObject { put("id", id); put("clientId", clientId) }, WorkResult.serializer())

    override suspend fun workReopen(id: String, clientId: String) =
        call("/work/reopen", buildJsonObject { put("id", id); put("clientId", clientId) }, WorkResult.serializer())

    override suspend fun reviewQueue(limit: Int) =
        call("/review/queue?limit=${limit.coerceIn(1, 50)}", null, ReviewQueue.serializer())

    override suspend fun answer(ideaId: String, answer: JsonElement, combo: Int, sessionMisses: Int, clientId: String) =
        call("/review/answer", buildJsonObject {
            put("ideaId", ideaId)
            put("answer", answer)
            put("combo", combo)
            put("sessionMisses", sessionMisses)
            put("clientId", clientId)
        }, AnswerResult.serializer())

    override suspend fun log(text: String, section: String, clientId: String) =
        call("/log", buildJsonObject {
            put("text", text)
            put("section", section)
            put("clientId", clientId)
        }, LogResult.serializer())

    override suspend fun logUndo(undo: JsonObject, clientId: String): Outcome<Unit> =
        call("/log/undo", JsonObject(undo + ("clientId" to JsonPrimitive(clientId))), JsonObject.serializer()).map { }

    override suspend fun ideasMeta() = call("/ideas/meta", null, IdeasMeta.serializer())

    override suspend fun createIdea(body: JsonObject) = call("/ideas", body, IdeaResult.serializer(), slow = true)

    override suspend fun quests() = call("/quests", null, QuestsData.serializer())

    override suspend fun status() = call("/status", null, StatusPanel.serializer())

    override suspend fun mall() = call("/mall", null, MallData.serializer())

    override suspend fun addReward(title: String, category: String, price: Int, note: String?, cooldownDays: Int?, clientId: String) =
        call("/mall/rewards", buildJsonObject {
            put("title", title)
            put("category", category)
            put("price", price)
            if (note != null) put("note", note)
            if (cooldownDays != null) put("cooldownDays", cooldownDays)
            put("clientId", clientId)
        }, AddRewardResult.serializer())

    override suspend fun buyReward(rewardId: String, clientId: String) =
        call("/mall/buy", buildJsonObject {
            put("rewardId", rewardId)
            put("clientId", clientId)
        }, BuyResult.serializer())

    override suspend fun undoBuy(purchaseId: String, clientId: String) =
        call("/mall/undo", buildJsonObject {
            put("purchaseId", purchaseId)
            put("clientId", clientId)
        }, UndoBuyResult.serializer())

    // P27: a batch of Health Connect's walks and weigh-ins (the server writes each walk once per record).
    override suspend fun syncHealth(batch: HealthBatch, clientId: String) =
        call("/exercise", JsonObject(healthBody(batch) + ("clientId" to JsonPrimitive(clientId))), HealthSyncResult.serializer(), slow = true)
}

/** The batch as POST /exercise reads it: absent fields left out (an optional climb or origin is never sent as null). */
internal fun healthBody(batch: HealthBatch): JsonObject =
    Net.json.encodeToJsonElement(HealthBatch.serializer(), batch) as JsonObject

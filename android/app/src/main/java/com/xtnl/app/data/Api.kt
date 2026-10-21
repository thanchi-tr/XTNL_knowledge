package com.xtnl.app.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** A call's result: the data, or a line the app can show as is (the server's `error`). */
sealed interface Outcome<out T> {
    data class Ok<T>(val value: T) : Outcome<T>
    data class Err(
        val message: String,
        val code: String? = null,
        val status: Int? = null,
        /** The server couldn't be reached at all (no answer), as opposed to answering "no". */
        val offline: Boolean = false,
    ) : Outcome<Nothing>
}

inline fun <T, R> Outcome<T>.map(f: (T) -> R): Outcome<R> = when (this) {
    is Outcome.Ok -> Outcome.Ok(f(value))
    is Outcome.Err -> this
}

/**
 * The mobile API (docs/mobile-api.md). Two implementations: [HttpApi] (the
 * server) and [DemoApi] (realistic fake data, chosen in Settings). Every
 * write takes the clientId the caller generated, so a retry of the same deed
 * sends the same id and the server answers it once.
 */
interface XtnlApi {
    suspend fun check(): Outcome<CheckData>
    suspend fun completeTask(templateId: String, mvv: Boolean, clientId: String): Outcome<CompleteResult>
    suspend fun undoTask(instanceId: String, clientId: String): Outcome<UndoTaskResult>
    suspend fun workDone(id: String, clientId: String): Outcome<WorkResult>
    suspend fun workReopen(id: String, clientId: String): Outcome<WorkResult>
    suspend fun reviewQueue(limit: Int): Outcome<ReviewQueue>
    suspend fun answer(ideaId: String, answer: JsonElement, combo: Int, sessionMisses: Int, clientId: String): Outcome<AnswerResult>
    suspend fun log(text: String, section: String, clientId: String): Outcome<LogResult>
    suspend fun logUndo(undo: JsonObject, clientId: String): Outcome<Unit>
    suspend fun ideasMeta(): Outcome<IdeasMeta>
    suspend fun createIdea(body: JsonObject): Outcome<IdeaResult>
}

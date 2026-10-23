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
    /** The main quest, this week's sprint and Today's three (read only; blueprint P15). */
    suspend fun quests(): Outcome<QuestsData>
    /** The five attributes, Capital's reading, the avatar targets and the skills: the web's Status card (read only; blueprint P1, P4, P5). */
    suspend fun status(): Outcome<StatusPanel>
    /** You › Mall: the rewards the user lists, each with its price and hint, and the credits over them (read only; blueprint P18). */
    suspend fun mall(): Outcome<MallData>
    /** Lists a reward, as You › Mall's Add sheet does (blueprint P18). Edit and archive stay on the web. */
    suspend fun addReward(title: String, category: String, price: Int, note: String?, cooldownDays: Int?, clientId: String): Outcome<AddRewardResult>
    /**
     * Buys a reward, as Buy then Confirm on You › Mall does (blueprint P19): its price in credits, never more than the
     * balance. [clientId] is required and is the purchase's key: a retry sends the same one, and it is bought once.
     */
    suspend fun buyReward(rewardId: String, clientId: String): Outcome<BuyResult>
    /** Undoes a purchase inside its ten minutes (blueprint P19), once. */
    suspend fun undoBuy(purchaseId: String, clientId: String): Outcome<UndoBuyResult>
}

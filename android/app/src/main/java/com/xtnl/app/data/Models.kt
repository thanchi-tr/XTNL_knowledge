package com.xtnl.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/*
 * The mobile API's shapes (docs/mobile-api.md, v1). Enum-like fields stay
 * strings so a value the server adds later never breaks a decode; unknown
 * keys are ignored (Net.json).
 */

// ── GET /check ──────────────────────────────────────────────────────────────

@Serializable
data class CheckData(
    val now: String? = null,
    val day: String? = null,
    val dayLabel: String? = null,
    val tasks: List<TaskItem> = emptyList(),
    val tasksSummary: TasksSummary? = null,
    val review: ReviewSummary? = null,
    val work: List<WorkItem> = emptyList(),
    val level: LevelInfo? = null,
    val streak: StreakInfo? = null,
)

@Serializable
data class TaskItem(
    val templateId: String,
    val title: String,
    val lane: String = "TASK",
    val status: String = "OPEN",
    val minutes: Int? = null,
    val mvv: String? = null,
    val icon: String? = null,
    val dueLabel: String? = null,
    val xpHint: Double? = null,
) {
    /** Can be ticked (a LOCKED study task completes itself from the day's reviews). */
    val open: Boolean get() = status == "OPEN"
    val locked: Boolean get() = status == "LOCKED"
    val kept: Boolean get() = status == "DONE" || status == "DONE_MVV"
    /**
     * A row the web's Board clear counts (today-board.ts): Must, Planned and Habits alike, held and skipped
     * rows aside. The app shows the server's own figure (tasksSummary, a tick's allDone); this is the demo's.
     */
    val countsForBoard: Boolean get() = status != "HELD" && status != "SKIPPED"
}

@Serializable
data class TasksSummary(val open: Int = 0, val done: Int = 0, val allDone: Boolean = false)

@Serializable
data class ReviewSummary(val due: Int = 0, val doneToday: Int = 0, val target: Int? = null, val nextDueAt: String? = null)

@Serializable
data class WorkItem(
    val id: String,
    val boardId: String? = null,
    val boardName: String? = null,
    val title: String,
    val dueAt: String? = null,
    val allDay: Boolean = false,
    val channel: String = "OTHER",
    val overdue: Boolean = false,
    val collection: String? = null,
    val customer: Customer? = null,
)

@Serializable
data class Customer(val id: String? = null, val name: String, val number: String? = null, val phone: String? = null)

@Serializable
data class LevelInfo(val level: Int = 1, val title: String? = null, val progress: Double = 0.0)

@Serializable
data class StreakInfo(val days: Int = 0, val keptToday: Boolean = false, val freezes: Int = 0)

// ── Tasks and work ──────────────────────────────────────────────────────────

@Serializable
data class CompleteResult(
    val instanceId: String,
    val xp: Double = 0.0,
    val line: String? = null,
    val allDone: Boolean = false,
    val celebrations: List<JsonElement> = emptyList(),
    /** The character's level after this tick (null from an older server, or when it couldn't be read): the seal's exact step. */
    val level: LevelInfo? = null,
)

@Serializable
data class UndoTaskResult(val xp: Double = 0.0, val level: LevelInfo? = null)

@Serializable
data class WorkResult(val id: String? = null, val doneAt: String? = null)

// ── Review ──────────────────────────────────────────────────────────────────

@Serializable
data class ReviewQueue(val now: String? = null, val dueTotal: Int = 0, val cards: List<ReviewCard> = emptyList())

@Serializable
data class ReviewCard(
    val ideaId: String,
    val type: String,
    val prompt: String,
    val promptHasMath: Boolean = false,
    val options: List<String>? = null,
    val listCount: Int? = null,
    val orderItems: List<String>? = null,
    val blanks: Int? = null,
    val unit: String? = null,
    val level: Int? = null,
    val field: String? = null,
    val domain: String? = null,
)

/** The meaning check's call on a short answer whose wording missed. */
@Serializable
data class Judged(val correct: Boolean? = null, val reason: String? = null)

/** Today's review quest; `target` is null until the day's first open fixes it (keep /check's). */
@Serializable
data class Quest(val done: Int = 0, val target: Int? = null)

@Serializable
data class AnswerResult(
    val correct: Boolean = false,
    /** A string by the contract; an array is shown as a list. */
    val expected: JsonElement? = null,
    val explanation: String? = null,
    val judged: Judged? = null,
    /** Review points paid (0 on a miss): review points, never life XP. */
    val xp: Double = 0.0,
    val comboNext: Int = 0,
    val multiplier: Double? = null,
    val levelFrom: Int? = null,
    val levelTo: Int? = null,
    val nextDueDay: String? = null,
    val retry: Boolean = false,
    val trueFact: String? = null,
    val quest: Quest? = null,
    val streakSecured: Boolean = false,
    val celebrations: List<JsonElement> = emptyList(),
) {
    val expectedText: String?
        get() = when (val e = expected) {
            null, JsonNull -> null
            is JsonPrimitive -> e.contentOrNull
            is JsonArray -> e.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString("\n")
            is JsonObject -> e.values.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString("\n")
        }
    val leveledUp: Boolean get() = levelFrom != null && levelTo != null && levelTo > levelFrom
}

/** "Quest done" style titles out of a celebrations list, whatever its exact shape. */
fun celebrationTitles(list: List<JsonElement>): List<String> = list.mapNotNull { el ->
    (el as? JsonObject)?.get("title")?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
}

// ── Log ─────────────────────────────────────────────────────────────────────

@Serializable
data class LogResult(
    /** "task" | "goal" | "weight" | "idea-draft". */
    val kind: String = "task",
    /** The task, goal or draft's id (an idea draft's is the draftId POST /ideas finishes). */
    val id: String? = null,
    val title: String? = null,
    val line: String? = null,
    /** Sent back as is to /log/undo. */
    val undo: JsonObject? = null,
)

// ── Ideas ───────────────────────────────────────────────────────────────────

@Serializable
data class FormatMeta(val type: String, val label: String? = null, val points: Double? = null, val help: String? = null)

@Serializable
data class IdeasMeta(
    val formats: List<FormatMeta> = emptyList(),
    /** Strings or {value,label} objects; read with [collectionChoices]. */
    val collections: List<JsonElement> = emptyList(),
)

data class Choice(val value: String, val label: String)

fun collectionChoices(meta: IdeasMeta?): List<Choice> = meta?.collections.orEmpty().mapNotNull { el ->
    when (el) {
        is JsonPrimitive -> el.contentOrNull?.let { Choice(it, prettyEnum(it)) }
        is JsonObject -> {
            fun s(k: String) = (el[k] as? JsonPrimitive)?.contentOrNull
            val v = s("value") ?: s("id") ?: s("label") ?: s("name")
            v?.let { Choice(it, s("label") ?: s("name") ?: prettyEnum(it)) }
        }
        else -> null
    }
}

/** "ACTIONABLE" → "Actionable". */
fun prettyEnum(s: String): String =
    if (s.all { it.isUpperCase() || it == '_' }) s.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() } else s

@Serializable
data class IdeaResult(
    val status: String = "created",
    val ideaId: String? = null,
    val title: String? = null,
    val field: String? = null,
    val domain: String? = null,
    val points: Double? = null,
    val line: String? = null,
)

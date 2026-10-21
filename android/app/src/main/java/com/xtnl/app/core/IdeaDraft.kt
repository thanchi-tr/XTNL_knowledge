package com.xtnl.app.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The seven New idea formats, in the web form's order (Alt+1…7 pick them).
 * [wire] is the app's type name on the wire (the contract calls the web's
 * MULTI "MCQ"), unless GET /ideas/meta names another.
 */
enum class IdeaFormat(val wire: String, val label: String, val hint: String) {
    SHORT("SHORT", "Short", "Free text, graded on similarity"),
    CLOZE("CLOZE", "Cloze", "Wrap answers in {{…}} to blank them"),
    NUMERIC("NUMERIC", "Numeric", "A value, graded within a tolerance"),
    MULTI("MCQ", "Multiple choice", "Pick the one right option"),
    LIST("LIST", "List", "Name every item; order ignored"),
    ORDER("ORDER", "Order", "Arrange the steps in sequence"),
    FORMULA("FORMULA", "Formula", "Proved by algebraic equivalence");

    companion object {
        fun of(type: String): IdeaFormat? = when (type.uppercase()) {
            "MCQ", "MULTI" -> MULTI
            else -> entries.firstOrNull { it.wire == type.uppercase() }
        }
    }
}

/**
 * Everything typed into New idea. Each format keeps its own content, so
 * switching formats (a chip or Alt+1…7) loses nothing, as on the web.
 */
data class IdeaDraft(
    val question: String = "",
    val answer: String = "",
    /** SHORT: capitals must match. */
    val caseSensitive: Boolean = false,
    val clozeText: String = "",
    val numericPrompt: String = "",
    val numericValue: String = "",
    val tolerance: String = "",
    val unit: String = "",
    val options: List<String> = listOf("", ""),
    val correct: Int = 0,
    val listPrompt: String = "",
    val listItems: List<String> = listOf("", ""),
    val orderPrompt: String = "",
    val orderItems: List<String> = listOf("", ""),
    val formulaQuestion: String = "",
    val formulaAnswer: String = "",
    /** null = the form's default (BOOK). */
    val collection: String? = null,
    /** The quick line's idea draft this finishes (POST /log's id); it leaves the Inbox. */
    val draftId: String? = null,
) {
    /** The content of [f] cleared, the rest (and the collection) kept: what a create leaves behind. */
    fun cleared(f: IdeaFormat): IdeaDraft = when (f) {
        IdeaFormat.SHORT -> copy(question = "", answer = "", draftId = null)
        IdeaFormat.CLOZE -> copy(clozeText = "", draftId = null)
        IdeaFormat.NUMERIC -> copy(numericPrompt = "", numericValue = "", tolerance = "", draftId = null)
        IdeaFormat.MULTI -> copy(options = listOf("", ""), correct = 0, draftId = null)
        IdeaFormat.LIST -> copy(listPrompt = "", listItems = listOf("", ""), draftId = null)
        IdeaFormat.ORDER -> copy(orderPrompt = "", orderItems = listOf("", ""), draftId = null)
        IdeaFormat.FORMULA -> copy(formulaQuestion = "", formulaAnswer = "", draftId = null)
    }

    fun isEmpty(f: IdeaFormat): Boolean = this.cleared(f) == this.copy(draftId = null)

    companion object {
        /**
         * An idea draft from the quick line, opened in the form: `Q :: A` (the web's idea line)
         * becomes a Short question and answer; a bare line becomes the question.
         */
        fun fromLine(line: String, draftId: String?, keep: IdeaDraft = IdeaDraft()): IdeaDraft {
            val body = line.trim().removePrefix("idea:").trim()
            val q = body.substringBefore("::").trim()
            val a = if ("::" in body) body.substringAfter("::").trim() else ""
            return keep.copy(question = q, answer = a, draftId = draftId)
        }
    }
}

object IdeaBody {
    private val CLOZE = Regex("""\{\{([^}]+)\}\}""")

    fun clozeAnswers(text: String): List<String> = CLOZE.findAll(text).map { it.groupValues[1].trim() }.toList()

    /** The learner's view of a cloze: "The capital of France is [1]." */
    fun clozeBlanked(text: String): String {
        var n = 0
        return CLOZE.replace(text) { n++; "[$n]" }
    }

    /** Wraps [start, end) of [text] in {{ }} (Blank it). An empty selection inserts an empty pair with the caret inside. */
    fun blankIt(text: String, start: Int, end: Int): Pair<String, Int> {
        val a = start.coerceIn(0, text.length)
        val b = end.coerceIn(a, text.length)
        val inner = text.substring(a, b)
        val out = text.substring(0, a) + "{{" + inner + "}}" + text.substring(b)
        return out to (a + 2 + inner.length + if (inner.isEmpty()) 0 else 2)
    }

    private fun filled(items: List<String>) = items.map { it.trim() }.filter { it.isNotEmpty() }

    /** The server's limits: each text at most 4,000 characters, each list at most 50 rows. */
    const val TEXT_MAX = 4000
    const val ROWS_MAX = 50

    private fun tooLong(f: IdeaFormat, d: IdeaDraft): Boolean {
        val texts = when (f) {
            IdeaFormat.SHORT -> listOf(d.question, d.answer)
            IdeaFormat.CLOZE -> listOf(d.clozeText)
            IdeaFormat.NUMERIC -> listOf(d.numericPrompt, d.numericValue, d.tolerance, d.unit)
            IdeaFormat.MULTI -> d.options
            IdeaFormat.LIST -> listOf(d.listPrompt) + d.listItems
            IdeaFormat.ORDER -> listOf(d.orderPrompt) + d.orderItems
            IdeaFormat.FORMULA -> listOf(d.formulaQuestion, d.formulaAnswer)
        }
        val rows = when (f) { IdeaFormat.MULTI -> d.options.size; IdeaFormat.LIST -> d.listItems.size; IdeaFormat.ORDER -> d.orderItems.size; else -> 0 }
        return texts.any { it.length > TEXT_MAX } || rows > ROWS_MAX
    }

    /** Why Create can't send yet, or null when it can. */
    fun problem(f: IdeaFormat, d: IdeaDraft): String? = if (tooLong(f, d)) "That's too long to save." else when (f) {
        IdeaFormat.SHORT -> when {
            d.question.isBlank() -> "Write the question."
            d.answer.isBlank() -> "Write the answer."
            else -> null
        }
        IdeaFormat.CLOZE -> when {
            d.clozeText.isBlank() -> "Write the sentence."
            clozeAnswers(d.clozeText).isEmpty() -> "Wrap at least one answer in {{…}}."
            clozeAnswers(d.clozeText).any { it.isEmpty() } -> "A blank is empty."
            else -> null
        }
        IdeaFormat.NUMERIC -> when {
            d.numericPrompt.isBlank() -> "Write the question."
            AnswerShape.numeric(d.numericValue).toDoubleOrNull() == null -> "The value must be a number."
            d.tolerance.isNotBlank() && AnswerShape.numeric(d.tolerance).toDoubleOrNull()?.let { it >= 0 } != true -> "The tolerance must be a number, 0 or more."
            else -> null
        }
        IdeaFormat.MULTI -> when {
            filled(d.options).size < 2 -> "Give at least two options."
            d.options.getOrNull(d.correct).isNullOrBlank() -> "Fill in the right option."
            filled(d.options).size != filled(d.options).distinct().size -> "Two options are the same."
            else -> null
        }
        IdeaFormat.LIST -> when {
            d.listPrompt.isBlank() -> "Write the prompt."
            filled(d.listItems).size < 2 -> "Give at least two items."
            else -> null
        }
        IdeaFormat.ORDER -> when {
            d.orderPrompt.isBlank() -> "Write the prompt."
            filled(d.orderItems).size < 2 -> "Give at least two steps."
            else -> null
        }
        IdeaFormat.FORMULA -> when {
            d.formulaQuestion.isBlank() -> "Write the question."
            d.formulaAnswer.isBlank() -> "Write the formula."
            else -> null
        }
    }

    /**
     * The POST /ideas body, with only the keys the format uses (the server
     * refuses any other):
     *   SHORT    question, answer, caseSensitive (only when true)
     *   CLOZE    question (the sentence with {{…}} around each blank)
     *   NUMERIC  question, answer (the value as typed), tolerance (when given), unit (when given)
     *   MCQ      options, answer (the right option's text, one of options)
     *   LIST     question, listItems        ORDER  question, orderItems (the true order)
     *   FORMULA  question, answer
     * plus collection (when chosen), draftId (when finishing a quick-line draft) and clientId.
     */
    fun build(f: IdeaFormat, d: IdeaDraft, clientId: String, wireType: String = f.wire): JsonObject = buildJsonObject {
        put("type", wireType)
        when (f) {
            IdeaFormat.SHORT -> {
                put("question", d.question.trim())
                put("answer", d.answer.trim())
                if (d.caseSensitive) put("caseSensitive", true)
            }
            IdeaFormat.FORMULA -> {
                put("question", d.formulaQuestion.trim())
                put("answer", d.formulaAnswer.trim())
            }
            IdeaFormat.CLOZE -> put("question", d.clozeText.trim())
            IdeaFormat.NUMERIC -> {
                put("question", d.numericPrompt.trim())
                put("answer", AnswerShape.numeric(d.numericValue))
                if (d.tolerance.isNotBlank()) put("tolerance", AnswerShape.numeric(d.tolerance))
                if (d.unit.isNotBlank()) put("unit", d.unit.trim())
            }
            IdeaFormat.MULTI -> {
                put("options", JsonArray(filled(d.options).map(::JsonPrimitive)))
                put("answer", d.options.getOrNull(d.correct)?.trim().orEmpty())
            }
            IdeaFormat.LIST -> {
                put("question", d.listPrompt.trim())
                put("listItems", JsonArray(filled(d.listItems).map(::JsonPrimitive)))
            }
            IdeaFormat.ORDER -> {
                put("question", d.orderPrompt.trim())
                put("orderItems", JsonArray(filled(d.orderItems).map(::JsonPrimitive)))
            }
        }
        d.collection?.let { put("collection", it) }
        d.draftId?.let { put("draftId", it) }
        if (clientId.isNotEmpty()) put("clientId", clientId)
    }
}

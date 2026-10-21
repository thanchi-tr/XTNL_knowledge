package com.xtnl.app.core

import com.xtnl.app.data.ReviewCard
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/** A review card's input kind (MULTI is the web form's name for MCQ). */
enum class CardKind { SHORT, NUMERIC, FORMULA, MCQ, LIST, ORDER, CLOZE;
    companion object {
        fun of(type: String): CardKind = when (type.uppercase()) {
            "NUMERIC" -> NUMERIC
            "FORMULA" -> FORMULA
            "MCQ", "MULTI" -> MCQ
            "LIST" -> LIST
            "ORDER" -> ORDER
            "CLOZE" -> CLOZE
            else -> SHORT
        }
    }
}

/**
 * What the learner has entered for one card so far. One shape for every
 * type, so the draft survives a fold, a rotation or a format the UI shows
 * differently on each display.
 */
data class AnswerDraft(
    val text: String = "",
    val choice: Int? = null,
    val rows: List<String> = emptyList(),
    val order: List<String> = emptyList(),
    val blanks: List<String> = emptyList(),
) {
    companion object {
        /** The empty draft a card starts with: one row per list item, the server's shuffled order, one field per blank. */
        fun start(card: ReviewCard): AnswerDraft = when (CardKind.of(card.type)) {
            CardKind.LIST -> AnswerDraft(rows = List((card.listCount ?: 3).coerceIn(1, 50)) { "" })
            CardKind.ORDER -> AnswerDraft(order = card.orderItems.orEmpty())
            CardKind.CLOZE -> AnswerDraft(blanks = List(clozeBlanks(card).coerceIn(1, 50)) { "" })
            else -> AnswerDraft()
        }

        /** The contract's `blanks`, else the prompt's numbered markers `[1]`, `[2]` … (or `____` runs). */
        fun clozeBlanks(card: ReviewCard): Int = card.blanks
            ?: Regex("""\[\d+]""").findAll(card.prompt).count().takeIf { it > 0 }
            ?: Regex("_{3,}").findAll(card.prompt).count().coerceAtLeast(1)
    }
}

/**
 * The `answer` field of POST /review/answer, per type, as the contract says:
 *   SHORT, NUMERIC, FORMULA, MCQ → a string (MCQ: the chosen option exactly as given in `options`)
 *   LIST, ORDER                  → a string array (LIST: the filled rows; ORDER: `orderItems` as arranged)
 *   CLOZE                        → an array of the blanks in order
 * Like the web runner, nothing empty is sent (the server refuses a blank string
 * or an empty item): [ready] holds Check until every needed part is filled.
 */
object AnswerShape {
    fun shape(card: ReviewCard, d: AnswerDraft): JsonElement = when (CardKind.of(card.type)) {
        CardKind.SHORT, CardKind.FORMULA -> JsonPrimitive(d.text.trim())
        CardKind.NUMERIC -> JsonPrimitive(numeric(d.text))
        CardKind.MCQ -> JsonPrimitive(card.options?.getOrNull(d.choice ?: -1) ?: "")
        CardKind.LIST -> JsonArray(d.rows.map { it.trim() }.filter { it.isNotEmpty() }.map(::JsonPrimitive))
        CardKind.ORDER -> JsonArray(d.order.map(::JsonPrimitive))
        CardKind.CLOZE -> JsonArray(d.blanks.map { JsonPrimitive(it.trim()) })
    }

    /** Can the learner send this yet? (Anything typed counts; grading is the server's.) */
    fun ready(card: ReviewCard, d: AnswerDraft): Boolean = when (CardKind.of(card.type)) {
        CardKind.SHORT, CardKind.FORMULA -> d.text.isNotBlank()
        CardKind.NUMERIC -> numeric(d.text).isNotEmpty()
        CardKind.MCQ -> d.choice != null && d.choice in card.options.orEmpty().indices
        CardKind.LIST -> d.rows.any { it.isNotBlank() }
        CardKind.ORDER -> d.order.isNotEmpty()
        CardKind.CLOZE -> d.blanks.isNotEmpty() && d.blanks.all { it.isNotBlank() }
    }

    /**
     * A typed figure, tidied: spaces and thin spaces out, and commas read the way
     * the server's grader reads them (it drops them as thousands separators):
     * "1,000", "12,500" and "1,000,000" group thousands, and "1,000.5" keeps its
     * dot. Only a comma that can't be a thousands separator ("9,81", "0,5") is
     * read as the decimal point.
     */
    fun numeric(raw: String): String {
        val s = raw.trim().replace(" ", "").replace(" ", "").replace(" ", "").replace('−', '-')
        return when {
            ',' !in s -> s
            '.' in s || THOUSANDS.matches(s) || s.count { it == ',' } > 1 -> s.replace(",", "")
            else -> s.replace(',', '.')
        }
    }

    /** Commas grouping thousands: "1,000", "-12,500", "1,000,000" (not "0,500", "9,81" or "1,2345"). */
    private val THOUSANDS = Regex("""[+-]?[1-9]\d{0,2}(,\d{3})+""")

    /**
     * Which of the equal steps row [i] is (0 for the first "wash", 1 for the second). Two steps may
     * share their text, so a row is known by its text and this, which no move ever changes.
     */
    fun occurrence(order: List<String>, i: Int): Int = order.take(i).count { it == order.getOrNull(i) }

    /** Where the [n]th [item] (counting from 0) sits in [order] now, or -1. */
    fun indexOfOccurrence(order: List<String>, item: String, n: Int): Int {
        var seen = 0
        order.forEachIndexed { i, s ->
            if (s == item) {
                if (seen == n) return i
                seen++
            }
        }
        return -1
    }

    /** Moves one ORDER item from [from] to [to] (drag or the up/down buttons). */
    fun move(order: List<String>, from: Int, to: Int): List<String> {
        if (from !in order.indices) return order
        val target = to.coerceIn(0, order.lastIndex)
        if (from == target) return order
        val out = order.toMutableList()
        val item = out.removeAt(from)
        out.add(target, item)
        return out
    }
}

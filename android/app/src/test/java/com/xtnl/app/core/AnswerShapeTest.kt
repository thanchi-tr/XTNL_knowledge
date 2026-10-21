package com.xtnl.app.core

import com.xtnl.app.data.ReviewCard
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AnswerShapeTest {
    private fun card(type: String, prompt: String = "Q", options: List<String>? = null, listCount: Int? = null, orderItems: List<String>? = null, blanks: Int? = null) =
        ReviewCard("i1", type, prompt, options = options, listCount = listCount, orderItems = orderItems, blanks = blanks)

    private fun arr(vararg s: String) = JsonArray(s.map(::JsonPrimitive))

    @Test fun shortFormulaAndNumericAreTrimmedStrings() {
        assertEquals(JsonPrimitive("ATP"), AnswerShape.shape(card("SHORT"), AnswerDraft(text = "  ATP ")))
        assertEquals(JsonPrimitive("sqrt(x^2+y^2)"), AnswerShape.shape(card("FORMULA"), AnswerDraft(text = "sqrt(x^2+y^2)\n")))
        assertEquals(JsonPrimitive("9.81"), AnswerShape.shape(card("NUMERIC"), AnswerDraft(text = " 9,81 ")))
    }

    @Test fun numericTidiesSeparatorsAndMinus() {
        assertEquals("9.81", AnswerShape.numeric("9,81"))
        assertEquals("1000.5", AnswerShape.numeric("1,000.5"))
        assertEquals("1000000", AnswerShape.numeric("1,000,000"))
        assertEquals("-3.2", AnswerShape.numeric("−3.2"))
        assertEquals("72", AnswerShape.numeric(" 7 2 "))
    }

    @Test fun aThousandsCommaIsNeverReadAsTheDecimalPoint() {
        // The server's grader drops commas, so "1,000" is 1000 on the web; the app must agree.
        assertEquals("1000", AnswerShape.numeric("1,000"))
        assertEquals("12500", AnswerShape.numeric("12,500"))
        assertEquals("250000", AnswerShape.numeric("250,000"))
        assertEquals("-12500", AnswerShape.numeric("−12,500"))
        assertEquals("1000", AnswerShape.numeric(" 1,000 "))
        assertEquals(JsonPrimitive("1000"), AnswerShape.shape(card("NUMERIC"), AnswerDraft(text = "1,000")))
        // A comma that can't group thousands is still a decimal comma.
        assertEquals("0.5", AnswerShape.numeric("0,5"))
        assertEquals("0.500", AnswerShape.numeric("0,500"))
        assertEquals("1.2345", AnswerShape.numeric("1,2345"))
        // Indian grouping and other comma runs lose every comma, as the server does.
        assertEquals("125000", AnswerShape.numeric("1,25,000"))
    }

    @Test fun aNewNumericIdeaKeepsItsThousands() {
        val d = IdeaDraft(numericPrompt = "Metres in a kilometre?", numericValue = "1,000", tolerance = "0,5")
        assertEquals(null, IdeaBody.problem(IdeaFormat.NUMERIC, d))
        val body = IdeaBody.build(IdeaFormat.NUMERIC, d, "c1")
        assertEquals(JsonPrimitive("1000"), body["answer"])
        assertEquals(JsonPrimitive("0.5"), body["tolerance"])
    }

    @Test fun mcqSendsTheOptionTextExactlyAsGiven() {
        val c = card("MCQ", options = listOf("Mercury", "Jupiter"))
        assertEquals(JsonPrimitive("Jupiter"), AnswerShape.shape(c, AnswerDraft(choice = 1)))
        assertTrue(AnswerShape.ready(c, AnswerDraft(choice = 1)))
        assertFalse(AnswerShape.ready(c, AnswerDraft()))
        assertFalse(AnswerShape.ready(c, AnswerDraft(choice = 5)))
        // MULTI (the web's name) reads as MCQ.
        assertEquals(CardKind.MCQ, CardKind.of("MULTI"))
    }

    @Test fun listSendsOnlyFilledRowsTrimmed() {
        val c = card("LIST", listCount = 4)
        val d = AnswerDraft.start(c)
        assertEquals(4, d.rows.size)
        assertFalse(AnswerShape.ready(c, d))
        val filled = d.copy(rows = listOf(" Adenine", "", "Thymine ", " "))
        assertEquals(arr("Adenine", "Thymine"), AnswerShape.shape(c, filled))
        assertTrue(AnswerShape.ready(c, filled))
    }

    @Test fun orderSendsTheArrangedItemsAndStartsInTheServersOrder() {
        val c = card("ORDER", orderItems = listOf("Metaphase", "Prophase", "Anaphase"))
        val d = AnswerDraft.start(c)
        assertEquals(listOf("Metaphase", "Prophase", "Anaphase"), d.order)
        val moved = d.copy(order = AnswerShape.move(d.order, 1, 0))
        assertEquals(arr("Prophase", "Metaphase", "Anaphase"), AnswerShape.shape(c, moved))
    }

    @Test fun moveClampsAndIgnoresBadIndexes() {
        val l = listOf("a", "b", "c")
        assertEquals(listOf("b", "c", "a"), AnswerShape.move(l, 0, 9))
        assertEquals(l, AnswerShape.move(l, 7, 0))
        assertEquals(l, AnswerShape.move(l, 1, 1))
        assertEquals(listOf("a", "c", "b"), AnswerShape.move(l, 2, 1))
    }

    @Test fun equalStepsAreToldApartByTheirOccurrence() {
        val l = listOf("wash", "rinse", "wash")
        assertEquals(listOf(0, 0, 1), l.indices.map { AnswerShape.occurrence(l, it) })
        assertEquals(0, AnswerShape.indexOfOccurrence(l, "wash", 0))
        assertEquals(2, AnswerShape.indexOfOccurrence(l, "wash", 1))
        assertEquals(-1, AnswerShape.indexOfOccurrence(l, "wash", 2))
        // Dragging the second "wash" up moves that row, not the first one.
        val moved = AnswerShape.move(l, AnswerShape.indexOfOccurrence(l, "wash", 1), 1)
        assertEquals(listOf("wash", "wash", "rinse"), moved)
        assertEquals(1, AnswerShape.indexOfOccurrence(moved, "wash", 1))
        // A step and its occurrence stay one key (no two rows share one).
        assertEquals(3, l.indices.map { l[it] to AnswerShape.occurrence(l, it) }.toSet().size)
    }

    @Test fun clozeIsTheBlanksInOrderAndNeedsEveryBlank() {
        val c = card("CLOZE", prompt = "The capital is [1], the largest city [2].", blanks = 2)
        val d = AnswerDraft.start(c)
        assertEquals(2, d.blanks.size)
        val half = d.copy(blanks = listOf("Canberra", ""))
        assertFalse("nothing empty is sent", AnswerShape.ready(c, half))
        val full = d.copy(blanks = listOf(" Canberra", "Sydney "))
        assertTrue(AnswerShape.ready(c, full))
        assertEquals(arr("Canberra", "Sydney"), AnswerShape.shape(c, full))
    }

    @Test fun clozeBlankCountFallsBackToTheNumberedMarkers() {
        assertEquals(3, AnswerDraft.clozeBlanks(card("CLOZE", prompt = "[1] and [2] then [3]")))
        assertEquals(2, AnswerDraft.clozeBlanks(card("CLOZE", prompt = "____ and ____")))
        assertEquals(1, AnswerDraft.clozeBlanks(card("CLOZE", prompt = "no markers")))
        assertEquals(4, AnswerDraft.clozeBlanks(card("CLOZE", prompt = "[1]", blanks = 4)))
    }

    @Test fun blankTextIsNotReady() {
        assertFalse(AnswerShape.ready(card("SHORT"), AnswerDraft(text = "   ")))
        assertFalse(AnswerShape.ready(card("NUMERIC"), AnswerDraft(text = " ")))
        assertTrue(AnswerShape.ready(card("NUMERIC"), AnswerDraft(text = "3")))
    }
}

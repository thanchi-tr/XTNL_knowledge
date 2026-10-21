package com.xtnl.app.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** POST /ideas: only the keys each format uses (the server refuses any other). */
class IdeaBodyTest {
    private val content = setOf("question", "answer", "options", "listItems", "orderItems", "unit", "tolerance", "caseSensitive")
    private val used = mapOf(
        IdeaFormat.SHORT to setOf("question", "answer", "caseSensitive"),
        IdeaFormat.CLOZE to setOf("question"),
        IdeaFormat.NUMERIC to setOf("question", "answer", "tolerance", "unit"),
        IdeaFormat.MULTI to setOf("options", "answer"),
        IdeaFormat.LIST to setOf("question", "listItems"),
        IdeaFormat.ORDER to setOf("question", "orderItems"),
        IdeaFormat.FORMULA to setOf("question", "answer"),
    )

    private val full = IdeaDraft(
        question = "What makes ATP?", answer = "Mitochondria", caseSensitive = true,
        clozeText = "The capital of France is {{Paris}}.",
        numericPrompt = "g at sea level?", numericValue = "9,81", tolerance = "0.05", unit = "m/s²",
        options = listOf("Jupiter", "Mars", ""), correct = 0,
        listPrompt = "DNA bases", listItems = listOf("A", "T", " "),
        orderPrompt = "Mitosis", orderItems = listOf("Prophase", "Metaphase"),
        formulaQuestion = "Norm of (x, y)", formulaAnswer = "sqrt(x^2+y^2)",
    )

    @Test fun everyFormatSendsOnlyItsOwnFields() {
        for (f in IdeaFormat.entries) {
            val body = IdeaBody.build(f, full, "c1")
            val sentContent = body.keys.filter { it in content }.toSet()
            assertTrue("$f sent $sentContent", used.getValue(f).containsAll(sentContent))
            assertEquals(JsonPrimitive("c1"), body["clientId"])
            assertNull("collection is left out for the default", body["collection"])
        }
    }

    @Test fun multipleChoiceIsMcqOnTheWireWithTheRightOptionsText() {
        val body = IdeaBody.build(IdeaFormat.MULTI, full, "c")
        assertEquals("MCQ", body["type"]!!.jsonPrimitive.content)
        assertEquals("Jupiter", body["answer"]!!.jsonPrimitive.content)
        assertEquals(JsonArray(listOf(JsonPrimitive("Jupiter"), JsonPrimitive("Mars"))), body["options"])
        assertEquals(IdeaFormat.MULTI, IdeaFormat.of("MCQ"))
        assertEquals(IdeaFormat.MULTI, IdeaFormat.of("MULTI"))
    }

    @Test fun shapesPerFormat() {
        val cloze = IdeaBody.build(IdeaFormat.CLOZE, full, "c")
        assertEquals("The capital of France is {{Paris}}.", cloze["question"]!!.jsonPrimitive.content)
        val numeric = IdeaBody.build(IdeaFormat.NUMERIC, full, "c")
        assertEquals("9.81", numeric["answer"]!!.jsonPrimitive.content)
        assertEquals("0.05", numeric["tolerance"]!!.jsonPrimitive.content)
        assertEquals("m/s²", numeric["unit"]!!.jsonPrimitive.content)
        val list = IdeaBody.build(IdeaFormat.LIST, full, "c")
        assertEquals(JsonArray(listOf(JsonPrimitive("A"), JsonPrimitive("T"))), list["listItems"])
        val short = IdeaBody.build(IdeaFormat.SHORT, full, "c")
        assertEquals(JsonPrimitive(true), short["caseSensitive"])
        assertNull(IdeaBody.build(IdeaFormat.SHORT, full.copy(caseSensitive = false), "c")["caseSensitive"])
        assertNull("tolerance left out when empty", IdeaBody.build(IdeaFormat.NUMERIC, full.copy(tolerance = ""), "c")["tolerance"])
    }

    @Test fun collectionAndDraftIdWhenSet() {
        val body = IdeaBody.build(IdeaFormat.SHORT, full.copy(collection = "ACTIONABLE", draftId = "d1"), "c")
        assertEquals("ACTIONABLE", body["collection"]!!.jsonPrimitive.content)
        assertEquals("d1", body["draftId"]!!.jsonPrimitive.content)
        assertNull("no clientId for the comparison copy", IdeaBody.build(IdeaFormat.SHORT, full, "")["clientId"])
    }

    @Test fun problemsNameWhatIsMissing() {
        assertEquals("Write the answer.", IdeaBody.problem(IdeaFormat.SHORT, IdeaDraft(question = "Q")))
        assertEquals("Wrap at least one answer in {{…}}.", IdeaBody.problem(IdeaFormat.CLOZE, IdeaDraft(clozeText = "no blanks")))
        assertEquals("The value must be a number.", IdeaBody.problem(IdeaFormat.NUMERIC, IdeaDraft(numericPrompt = "Q", numericValue = "abc")))
        assertEquals("Give at least two options.", IdeaBody.problem(IdeaFormat.MULTI, IdeaDraft(options = listOf("one", ""))))
        assertEquals("Two options are the same.", IdeaBody.problem(IdeaFormat.MULTI, IdeaDraft(options = listOf("a", "a"))))
        assertEquals("Give at least two steps.", IdeaBody.problem(IdeaFormat.ORDER, IdeaDraft(orderPrompt = "P", orderItems = listOf("x", ""))))
        assertEquals("That's too long to save.", IdeaBody.problem(IdeaFormat.SHORT, IdeaDraft(question = "x".repeat(4001), answer = "a")))
        for (f in IdeaFormat.entries) assertNull("$f", IdeaBody.problem(f, full))
    }

    @Test fun blankItWrapsTheSelection() {
        assertEquals("The capital is {{Paris}}." to 24, IdeaBody.blankIt("The capital is Paris.", 15, 20))
        assertEquals("Hi {{}}" to 5, IdeaBody.blankIt("Hi ", 3, 3))
        assertEquals(listOf("Paris", "France"), IdeaBody.clozeAnswers("{{Paris}} is in {{ France }}"))
        assertEquals("[1] is in [2]", IdeaBody.clozeBlanked("{{Paris}} is in {{France}}"))
    }

    @Test fun anIdeaLineOpensInTheForm() {
        val d = IdeaDraft.fromLine("idea: Why is the sky blue? :: Rayleigh scattering", "draft-1")
        assertEquals("Why is the sky blue?", d.question)
        assertEquals("Rayleigh scattering", d.answer)
        assertEquals("draft-1", d.draftId)
        val bare = IdeaDraft.fromLine("leaves change colour", null)
        assertEquals("leaves change colour", bare.question)
        assertEquals("", bare.answer)
    }

    @Test fun clearingKeepsTheCollectionAndOtherFormats() {
        val d = full.copy(collection = "PROPOSAL", draftId = "d").cleared(IdeaFormat.SHORT)
        assertEquals("", d.question)
        assertEquals("PROPOSAL", d.collection)
        assertNull(d.draftId)
        assertNotNull(d.clozeText.takeIf { it.isNotEmpty() })
        assertTrue(IdeaDraft().isEmpty(IdeaFormat.LIST))
    }
}

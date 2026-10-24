package com.xtnl.app.core

import com.xtnl.app.data.OwedItem
import com.xtnl.app.data.OwedMinimum
import com.xtnl.app.data.OwedPages
import com.xtnl.app.data.OwedProof
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The owed cards' words (blueprint P22): the server's figures in the web card's words, and Make up's proof gate. */
class OwedLineTest {
    private val stretch = OwedItem(
        "o1", "t1", "Stretch", debt = 4.2, makeUpXp = 3.5, minimum = OwedMinimum("1 stretch", 1.1),
        whenLine = "Stretch · Monday", text = "Monday's Stretch is still open. 10 min makes it right.", window = "Within Thu 04:00 it brings back its streak of 12.",
    )
    private val bank = OwedItem("o2", "t2", "Call the bank", debt = 8.3, makeUpXp = 2.6, canAcceptLoss = true)

    @Test fun theHeadAndTheChipSayTheDebtAsATrueMinus() {
        assertEquals("Owed: 2 · −12.5 XP", OwedLine.header(listOf(stretch, bank)))
        assertEquals("Owed: 1 · −4.2 XP", OwedLine.header(listOf(stretch)))
        assertEquals("−4.2 owed", OwedLine.debtChip(stretch))
        assertEquals(12.5, OwedLine.total(listOf(stretch, bank)), 1e-9)
    }

    @Test fun theButtonsCarryTheServersPrices() {
        assertEquals("Make up · ≈ 3.5", OwedLine.makeUpLabel(stretch))
        assertEquals("Do minimum · ≈ 1.1", OwedLine.minimumLabel(stretch))
        assertEquals("1 stretch", OwedLine.minimumWords(stretch))
        assertNull(OwedLine.minimumLabel(bank))
        assertEquals("Accept the loss", OwedLine.ACCEPT)
    }

    @Test fun theRateLineSaysTimesPointEightFiveAndTheWholeDebt() {
        assertEquals("A make-up pays ×0.85 and repays all 4.2.", OwedLine.rateLine(stretch))
        assertEquals("A make-up pays 0 and repays all 4.2.", OwedLine.rateLine(stretch.copy(studyLinked = true)))
    }

    @Test fun makeUpWaitsForDutyAndForItsProof() {
        assertTrue(OwedLine.canMakeUp(stretch, dutyOn = true, minutes = null, pages = null))
        assertFalse(OwedLine.canMakeUp(stretch, dutyOn = false, minutes = null, pages = null))
        val deep = stretch.copy(proof = OwedProof(minutes = listOf(15, 30, 45)))
        assertEquals(listOf(15, 30, 45), OwedLine.minuteChips(deep))
        assertFalse(OwedLine.canMakeUp(deep, true, null, null))
        assertEquals("Like its tick, its make-up counts its time: pick the minutes it took.", OwedLine.needs(deep, null, null))
        assertTrue(OwedLine.canMakeUp(deep, true, 30, null))
        val reading = stretch.copy(proof = OwedProof(pages = OwedPages(target = 30, chips = listOf(10, 20, 30, 40))))
        assertEquals(listOf(10, 20, 30, 40), OwedLine.pageChips(reading))
        assertFalse(OwedLine.canMakeUp(reading, true, null, 20))
        assertTrue(OwedLine.needs(reading, null, 20)!!.contains("at least 30 pages"))
        assertTrue(OwedLine.canMakeUp(reading, true, null, 30))
        // Optional pages (no target): nothing to wait for.
        assertTrue(OwedLine.canMakeUp(stretch.copy(proof = OwedProof(pages = OwedPages(target = null, chips = listOf(10)))), true, null, null))
    }

    @Test fun talkBackReadsTheWholeCardInOrder() {
        assertEquals(
            "Stretch · Monday. −4.2 owed. Monday's Stretch is still open. 10 min makes it right. Within Thu 04:00 it brings back its streak of 12.",
            OwedLine.describe(stretch),
        )
        assertEquals("Call the bank. −8.3 owed.", OwedLine.describe(bank))
    }

    /** P22 review: Undo only for a make-up or a minimum whose window the server sent; which refusals take a card away. */
    @Test fun undoIsOfferedOnlyWhileTheServerSaysAndAGoneDebtLeaves() {
        assertTrue(OwedLine.undoable(OwedLine.MAKEUP, "2026-10-21T00:22:00Z"))
        assertTrue(OwedLine.undoable(OwedLine.MINIMUM, "2026-10-21T00:22:00Z"))
        assertFalse(OwedLine.undoable(OwedLine.MAKEUP, null))
        assertFalse(OwedLine.undoable(OwedLine.ACCEPT_LOSS, "2026-10-21T00:22:00Z"))
        assertFalse(OwedLine.undoable(OwedLine.UNDO, "2026-10-21T00:22:00Z"))
        assertTrue(OwedLine.cardGone(OwedLine.MAKEUP, "gone", "That debt no longer exists."))
        assertTrue(OwedLine.cardGone(OwedLine.MINIMUM, "conflict", OwedLine.NOT_OWED))
        assertFalse(OwedLine.cardGone(OwedLine.MAKEUP, "conflict", "Log the minutes first."))
        assertFalse("an undo's refusal never takes a card away", OwedLine.cardGone(OwedLine.UNDO, "gone", "That make-up no longer exists."))
    }

    @Test fun nothingBlames() {
        val words = listOf(OwedLine.header(listOf(stretch)), OwedLine.rateLine(stretch), OwedLine.ON_THE_WEB, OwedLine.needs(stretch.copy(proof = OwedProof(minutes = listOf(10))), null, null)!!)
        assertTrue(words.none { Regex("fail|lost|penalt|shame|overdue", RegexOption.IGNORE_CASE).containsMatchIn(it) })
    }
}

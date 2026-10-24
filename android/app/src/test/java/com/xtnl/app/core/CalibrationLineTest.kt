package com.xtnl.app.core

import com.xtnl.app.data.CalibrationChange
import com.xtnl.app.data.CalibrationSizes
import com.xtnl.app.data.CheckCalibration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Next week's calibration (P32, D36): the web card's words, read only; the card shows only while the server sends one. */
class CalibrationLineTest {
    private val cal = CheckCalibration(
        weekKey = "2026-W44",
        label = "Week of 26 Oct",
        sizes = CalibrationSizes(move = 30, any = 3, line = "Move 30 min · Finish any 3 tasks", basis = "Nearly every daily quest was kept last week: a little more."),
        changes = listOf(
            CalibrationChange("capacity", "capacity", "Plan 195 min a day", "A median of 230 tracked min a day over 4 weeks, scaled by how last week's daily quests compare with the audit's target. You set 240."),
            CalibrationChange("step:read", "step-up", "Read: make it a must", "Nearly every daily quest was kept last week, and each is Established; Read is Established.", state = "accepted", line = "A must now."),
        ),
    )

    @Test fun showsOnlyWhenSent() {
        assertTrue(CalibrationLine.shows(cal))
        assertFalse("none while the audit is off, or from an older server", CalibrationLine.shows(null))
    }

    @Test fun eachSuggestionSaysWhereItStands() {
        assertEquals("On offer on the web", CalibrationLine.stateLine(cal.changes[0]))
        assertEquals("the server's words once it stands", "A must now.", CalibrationLine.stateLine(cal.changes[1]))
        assertEquals("No longer on the board.", CalibrationLine.stateLine(CalibrationChange("ease:x", "ease", "X: not a must", "", state = "gone")))
    }

    /** A Keep on the web never reaches the phone, so the footer says where the choice is and never counts or asks. */
    @Test fun theFooterSaysWhereTheChoiceIsOnlyWhileOneIsOnOffer() {
        assertEquals("Accept and Keep are on the web.", CalibrationLine.footer(cal))
        assertNull(CalibrationLine.footer(cal.copy(changes = cal.changes.drop(1))))
        assertEquals("Accept and Keep are on the web.", CalibrationLine.footer(cal.copy(changes = cal.changes.map { it.copy(state = "open") })))
    }

    @Test fun theCardInWordsNamesNoRateOrTarget() {
        val words = CalibrationLine.description(cal)
        assertTrue(words.startsWith("This week, Week of 26 Oct, Move 30 min · Finish any 3 tasks, Nearly every daily quest was kept last week: a little more."))
        assertTrue(words.endsWith("Accept and Keep are on the web."))
        assertFalse("D17: no rate and no target on the card", words.contains("%"))
    }
}

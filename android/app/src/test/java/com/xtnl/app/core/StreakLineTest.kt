package com.xtnl.app.core

import com.xtnl.app.data.StreakInfo
import com.xtnl.app.data.StreakMultiplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The streak multiplier chip (blueprint P29): the server's line in the web's words, and no chip without it. */
class StreakLineTest {
    @Test fun chipSaysTheServersLine() {
        assertEquals("Streak ×1.16 · day 3", StreakLine.chip(StreakMultiplier(1.16, 3, line = "Streak ×1.16 · day 3")))
    }

    @Test fun chipIsBuiltTheWebsWayWithoutALine() {
        assertEquals("Streak ×1.16 · day 3", StreakLine.chip(StreakMultiplier(1.16, 3)))
        assertEquals("Streak ×1.20 · day 12", StreakLine.chip(StreakMultiplier(1.2, 12)))
        assertEquals("Streak ×1.20 · day 400+", StreakLine.chip(StreakMultiplier(1.2, 400, floor = true)))
        assertEquals("Streak ×1.00", StreakLine.chip(StreakMultiplier(1.0, 0)))
        assertEquals("×1.10", StreakLine.mult(1.1025))
    }

    @Test fun showsOnlyWhileTheServerSendsIt() {
        assertTrue(StreakLine.shows(StreakInfo(12, true, multiplier = StreakMultiplier(1.05, 1))))
        assertFalse(StreakLine.shows(StreakInfo(12, true, freezes = 2, restTokens = 2)))
        assertFalse(StreakLine.shows(null))
        assertNull(StreakLine.of(StreakInfo(3, false)))
    }

    @Test fun talkBackSaysTheDaysAndWhatTheyPay() {
        assertEquals("3 Full days in a row: every full tick pays ×1.16.", StreakLine.describe(StreakMultiplier(1.16, 3)))
        assertEquals("1 Full day in a row: every full tick pays ×1.05.", StreakLine.describe(StreakMultiplier(1.05, 1)))
        assertEquals("400 or more Full days in a row: every full tick pays ×1.20.", StreakLine.describe(StreakMultiplier(1.2, 400, floor = true)))
        assertEquals("Streak multiplier ×1.00: a Full day starts it.", StreakLine.describe(StreakMultiplier(1.0, 0)))
    }
}

package com.xtnl.app.core

import com.xtnl.app.data.StreakInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Rest tokens chip (blueprint P21): the server's one bank in the web's words, and no chip without it. */
class RestTokenLineTest {
    @Test fun chipSaysTheBankInTheWebsWords() {
        assertEquals("Rest tokens 2", RestTokenLine.chip(2))
        assertEquals("Rest tokens 0", RestTokenLine.chip(0))
        assertEquals("Rest tokens 0", RestTokenLine.chip(-1))
    }

    @Test fun showsOnlyWhileTheServerSendsTheBank() {
        assertTrue(RestTokenLine.shows(StreakInfo(12, true, freezes = 2, restTokens = 2)))
        assertTrue(RestTokenLine.shows(StreakInfo(0, false, freezes = 0, restTokens = 0)))
        assertFalse(RestTokenLine.shows(StreakInfo(12, true, freezes = 0)))
        assertFalse(RestTokenLine.shows(null))
        assertNull(RestTokenLine.tokens(StreakInfo(3, false)))
        assertEquals(1, RestTokenLine.tokens(StreakInfo(3, false, freezes = 1, restTokens = 1)))
    }

    @Test fun talkBackSaysTheCountAndWhatOneDoes() {
        assertEquals("1 rest token banked. One holds a missed day.", RestTokenLine.describe(1))
        assertEquals("3 rest tokens banked. One holds a missed day.", RestTokenLine.describe(3))
    }
}

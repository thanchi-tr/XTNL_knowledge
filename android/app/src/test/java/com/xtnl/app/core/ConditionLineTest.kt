package com.xtnl.app.core

import com.xtnl.app.data.CheckSkill
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Check screen's Condition card (P28, D24): the web's words, floored percents, and no card with nothing idle. */
class ConditionLineTest {
    private val body = CheckSkill("attribute", "Body", 0.819, 13)
    private val walking = CheckSkill("skill", "Walking", 0.5, 60)

    @Test fun itSaysThePlansWords() {
        assertEquals("Body 81% · 13 days idle", ConditionLine.line(body))
        assertEquals("Walking 50% · 60 days idle", ConditionLine.line(walking))
        assertEquals("Care 89% · 1 day idle", ConditionLine.line(CheckSkill("attribute", "Care", 0.8999, 1)))
        assertEquals("2 under 90%", ConditionLine.header(listOf(walking, body)))
        assertEquals("skill", ConditionLine.kindWord(walking))
        assertEquals("attribute", ConditionLine.kindWord(body))
    }

    @Test fun aPercentIsRoundedDownAndBounded() {
        assertEquals(99, ConditionLine.percent(0.995))
        assertEquals(50, ConditionLine.percent(0.5))
        assertEquals(100, ConditionLine.percent(1.2))
        assertEquals(0, ConditionLine.percent(-1.0))
    }

    @Test fun itShowsOnlyWhileTheServerSendsSomething() {
        assertTrue(ConditionLine.shows(listOf(body)))
        // Switched off on the server (DECAY_LAUNCH_DAY null), nothing under 90%, or an older server: no card.
        assertFalse(ConditionLine.shows(emptyList()))
        assertFalse(ConditionLine.shows(null))
    }

    @Test fun talkBackHearsEveryLineAndWhatNeverDrops() {
        assertEquals(
            "Condition: Walking 50% · 60 days idle, Body 81% · 13 days idle. Levels, XP and hours never drop. One practice brings it back to 100%.",
            ConditionLine.description(listOf(walking, body)),
        )
    }
}

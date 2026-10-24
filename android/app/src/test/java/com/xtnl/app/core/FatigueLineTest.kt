package com.xtnl.app.core

import com.xtnl.app.data.Fatigue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** The review screen's fatigue line (blueprint P30): the server's `until` in plain words, and no line without it. */
class FatigueLineTest {
    // 9:30 am Sydney (AEDT, UTC+11) on 26 Oct.
    private val now = Instant.parse("2026-10-25T22:30:00Z")

    @Test fun showsOnlyWhileTheServerSendsOneStillInEffect() {
        assertTrue(FatigueLine.shows(Fatigue("2026-10-26T05:00:00Z"), now))
        assertFalse(FatigueLine.shows(null, now))
        assertFalse(FatigueLine.shows(Fatigue(null), now))
        assertFalse(FatigueLine.shows(Fatigue("not a time"), now))
        // Lifted already by the server's clock: no line.
        assertNull(FatigueLine.until(Fatigue("2026-10-25T22:00:00Z"), now))
        assertNull(FatigueLine.until(Fatigue("2026-10-25T22:30:00Z"), now))
        // No clock to compare with: the server's word stands.
        assertEquals(Instant.parse("2026-10-25T22:00:00Z"), FatigueLine.until(Fatigue("2026-10-25T22:00:00Z"), null))
    }

    @Test fun lineSaysWhenItLifts() {
        // 05:00Z is 4:00 pm Sydney the same day.
        assertEquals("Fatigued until 4:00 pm", FatigueLine.line(Instant.parse("2026-10-26T05:00:00Z"), now))
        assertEquals("Fatigued until 16:00", FatigueLine.line(Instant.parse("2026-10-26T05:00:00Z"), now, h24 = true))
        // 18 hours after 9:30 pm is 3:30 pm the next calendar day.
        val late = Instant.parse("2026-10-26T10:30:00Z")
        assertEquals("Fatigued until tomorrow 3:30 pm", FatigueLine.line(late.plusSeconds(18 * 3600), late))
    }

    @Test fun talkBackReadsTheLineAndItsNote() {
        assertEquals(
            "Fatigued until 4:00 pm. A lower combo ceiling for now. Answers still pay, and it lifts by itself.",
            FatigueLine.describe(Instant.parse("2026-10-26T05:00:00Z"), now),
        )
    }

    @Test fun theNoteCarriesNoNumberAndNoReproach() {
        assertFalse(Regex("\\d").containsMatchIn(FatigueLine.NOTE))
        assertFalse(Regex("(?i)fail|lazy|should|must").containsMatchIn(FatigueLine.NOTE))
    }
}

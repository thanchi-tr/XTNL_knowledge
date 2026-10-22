package com.xtnl.app.core

import com.xtnl.app.data.DecayItem
import com.xtnl.app.data.WeekAudit
import com.xtnl.app.data.WeekDecaying
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Week card (D12, D15-D17): the web audit's words; when the numbers are from; the target only in plain words. */
class WeekLineTest {
    private val sunday = WeekAudit(
        weekKey = "2026-W43", label = "Week of 19 Oct", rate = 82, kept = 23, due = 28, minimum = 2, skipped = 1, held = 0,
        open = 2, short = 1, target = 85, status = "provisional", calibrating = false, asOfDay = null,
    )

    @Test fun provisionalOnSundayNight() {
        assertEquals("82% · 23 of 28 kept", WeekLine.headline(sunday))
        assertEquals("Provisional", WeekLine.status(sunday))
        assertEquals("Target 85% · 1 more kept would reach it", WeekLine.target(sunday))
        assertEquals(listOf("2 at minimum", "1 skipped", "2 still open"), WeekLine.notes(sunday))
        assertEquals(
            "Week audit, Week of 19 Oct, 82% · 23 of 28 kept, Provisional, Target 85% · 1 more kept would reach it, 2 at minimum, 1 skipped, 2 still open",
            WeekLine.description(sunday),
        )
    }

    @Test fun frozenAsOfMondayThenFinal() {
        val frozen = sunday.copy(status = "frozen", asOfDay = "2026-10-26", open = 0)
        assertEquals("As of Mon 04:00", WeekLine.status(frozen))
        assertEquals("Target 85% · 1 more kept would have reached it", WeekLine.target(frozen))
        assertEquals("As of Mon 04:00 · final", WeekLine.status(frozen.copy(status = "final")))
        // Sunday's quest open at the freeze stays so in the copy.
        assertEquals(listOf("2 at minimum", "1 skipped", "1 open when frozen"), WeekLine.notes(frozen.copy(open = 1)))
        // A Tuesday catch-up says so; a copy whose day can't be read is never called frozen.
        assertEquals("As of Tue 04:00", WeekLine.status(frozen.copy(asOfDay = "2026-10-27")))
        assertEquals("Provisional", WeekLine.status(frozen.copy(asOfDay = "soon")))
    }

    @Test fun metCalibratingAndNothingDue() {
        assertEquals("Target 85% · met", WeekLine.target(sunday.copy(rate = 90, kept = 27, due = 30, short = 0)))
        assertEquals("Calibrating: the 85% target applies from week 3", WeekLine.target(sunday.copy(calibrating = true)))
        val none = sunday.copy(rate = null, kept = 0, due = 0, short = 0, minimum = 0, skipped = 0, open = 0)
        assertEquals("No daily quests were due", WeekLine.headline(none))
        assertEquals("Target 85%", WeekLine.target(none))
        assertTrue(WeekLine.notes(none).isEmpty())
    }

    /** P12 (blueprint 5.2c): "Decaying this week", its count, its first three lines, and what the web lists beyond them. */
    @Test fun decayingThisWeek() {
        val four = WeekDecaying(
            count = 4,
            top = listOf(
                DecayItem("domain", "Probability fell to L3 (from L4)", "2 ideas fading in it. Reviewing them brings the level back."),
                DecayItem("habit", "Stretch: Established → Forming", "Strength 61% → 57% this week. Each kept day raises it again."),
                DecayItem("ideas", "5 ideas fading", "Past grace, an idea counts for less in its Domain every day until it is reviewed."),
            ),
        )
        val w = sunday.copy(decaying = four)
        assertEquals("Decaying this week · 4", WeekLine.decayHeading(w))
        assertEquals(listOf("Probability fell to L3 (from L4)", "Stretch: Established → Forming", "5 ideas fading"), WeekLine.decayLines(w).map { it.title })
        assertEquals("1 more on the web audit.", WeekLine.decayNote(w))
        assertTrue(WeekLine.description(w).endsWith("Decaying this week · 4, Probability fell to L3 (from L4), Stretch: Established → Forming, 5 ideas fading, 1 more on the web audit."))
        // Nothing fell; a part that couldn't be read is said, never guessed; an older server (or a copy without it): no block.
        val none = sunday.copy(decaying = WeekDecaying())
        assertEquals("Decaying this week", WeekLine.decayHeading(none))
        assertTrue(WeekLine.decayLines(none).isEmpty())
        assertEquals("Nothing fell this week.", WeekLine.decayNote(none))
        assertEquals("Nothing found in what could be read. 1 source couldn't be read.", WeekLine.decayNote(sunday.copy(decaying = WeekDecaying(unread = 1))))
        assertEquals("1 more on the web audit. 2 sources couldn't be read.", WeekLine.decayNote(sunday.copy(decaying = four.copy(unread = 2))))
        assertNull(WeekLine.decayHeading(sunday))
        assertNull(WeekLine.decayNote(sunday))
        assertTrue(WeekLine.decayLines(sunday).isEmpty())
        // Never more than three lines, whatever arrives.
        assertEquals(3, WeekLine.decayLines(sunday.copy(decaying = four.copy(count = 5, top = four.top + DecayItem("mp", "0.4 MP to idle decay")))).size)
    }

    @Test fun itShowsOnlyWhileTheServerSendsAWeek() {
        assertTrue(WeekLine.shows(sunday))
        // The audit switched off (AUDIT_LAUNCH_DAY null), or an older server: no card.
        assertFalse(WeekLine.shows(null))
    }
}

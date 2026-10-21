package com.xtnl.app.core

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** "now" is Wed 21 Oct 2026, 11:12 am in Sydney (00:12 UTC, AEDT +11). */
class TimeLabelsTest {
    private val now = Instant.parse("2026-10-21T00:12:00Z")
    private fun t(s: String) = Instant.parse(s)

    @Test fun soonIsInMinutes() {
        assertEquals("in 20 min", TimeLabels.due(t("2026-10-21T00:32:00Z"), now, allDay = false))
        assertEquals("in 1 h 30 min", TimeLabels.due(t("2026-10-21T01:42:00Z"), now, allDay = false))
        assertEquals("Now", TimeLabels.due(t("2026-10-21T00:12:20Z"), now, allDay = false))
    }

    @Test fun laterTodayIsAClockTime() {
        assertEquals("at 4:30 pm", TimeLabels.due(t("2026-10-21T05:30:00Z"), now, allDay = false))
        assertEquals("at 16:30", TimeLabels.due(t("2026-10-21T05:30:00Z"), now, allDay = false, h24 = true))
    }

    @Test fun anotherDayNamesTheDay() {
        assertEquals("Tomorrow 9:00 am", TimeLabels.due(t("2026-10-21T22:00:00Z"), now, allDay = false))
        assertEquals("Sat 9:00 am", TimeLabels.due(t("2026-10-23T22:00:00Z"), now, allDay = false))
    }

    @Test fun overdueToday() {
        assertEquals("Overdue 15 min", TimeLabels.due(t("2026-10-20T23:57:00Z"), now, allDay = false))
        assertEquals("Overdue since 8:00 am", TimeLabels.due(t("2026-10-20T21:00:00Z"), now, allDay = false))
    }

    @Test fun overdueSinceAnEarlierDay() {
        assertEquals("Overdue since Mon", TimeLabels.due(t("2026-10-19T00:00:00Z"), now, allDay = false))
        assertEquals("Overdue since 2 Oct", TimeLabels.due(t("2026-10-02T00:00:00Z"), now, allDay = false))
    }

    @Test fun allDayItems() {
        assertEquals("Today", TimeLabels.due(t("2026-10-21T00:00:00Z"), now, allDay = true))
        assertEquals("Overdue since Mon", TimeLabels.due(t("2026-10-19T01:00:00Z"), now, allDay = true))
        assertEquals("Tomorrow", TimeLabels.due(t("2026-10-22T01:00:00Z"), now, allDay = true))
    }

    @Test fun theLifeDayTurnsAt4am() {
        // 2:30 am Thursday in Sydney is still Wednesday's life day; 4:10 am is Thursday's.
        assertEquals(LocalDate.parse("2026-10-21"), TimeLabels.lifeDay(t("2026-10-21T15:30:00Z")))
        assertEquals(LocalDate.parse("2026-10-22"), TimeLabels.lifeDay(t("2026-10-21T17:10:00Z")))
        // A 1 am call is "tonight", never overdue since yesterday.
        assertEquals("Overdue since 1:00 am", TimeLabels.due(t("2026-10-21T14:00:00Z"), t("2026-10-21T16:00:00Z"), allDay = false))
    }

    @Test fun nextDueDayWords() {
        assertEquals("Back tomorrow", TimeLabels.nextDue(LocalDate.parse("2026-10-22"), now))
        assertEquals("Back Sat", TimeLabels.nextDue(LocalDate.parse("2026-10-24"), now))
        assertEquals("Back 29 Oct", TimeLabels.nextDue(LocalDate.parse("2026-10-29"), now))
        assertEquals("Back later today", TimeLabels.nextDue(LocalDate.parse("2026-10-21"), now))
    }

    @Test fun spans() {
        assertEquals("45 min", TimeLabels.span(45))
        assertEquals("2 h", TimeLabels.span(120))
        assertEquals("1 h 5 min", TimeLabels.span(65))
        assertEquals("1 min", TimeLabels.span(0))
    }

    @Test fun nextCardAndUpdated() {
        assertEquals("Next card in 2 h 20 min", TimeLabels.nextCard(t("2026-10-21T02:32:00Z"), now))
        assertEquals("Cards are due now", TimeLabels.nextCard(t("2026-10-21T00:00:00Z"), now))
        assertEquals("updated 10:42", TimeLabels.updated(t("2026-10-20T23:42:00Z"), TimeLabels.SYDNEY, h24 = true))
    }
}

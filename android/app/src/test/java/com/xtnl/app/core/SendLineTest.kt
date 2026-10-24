package com.xtnl.app.core

import com.xtnl.app.data.Outcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** The offline queue's rules and words (blueprint P8, D34): each item's own day, what a pass does, what an answer means. */
class SendLineTest {
    @Test fun aTapsDayIsTheLifeDayByTheServersClock() {
        // 03:59 Sydney (AEDT) on Sun 25 Oct is still Saturday's life day; 04:00 is Sunday's.
        assertEquals("2026-10-24", SendLine.dayKey(Instant.parse("2026-10-24T16:59:00Z")))
        assertEquals("2026-10-25", SendLine.dayKey(Instant.parse("2026-10-24T17:00:00Z")))
        // A Yesterday row's is the day before.
        assertEquals("2026-10-24", SendLine.dayKey(Instant.parse("2026-10-24T17:00:00Z"), yesterday = true))
        // The phone 3 minutes slow: the server's clock as last read moves it over the turn.
        val offset = SendLine.offsetOf("2026-10-24T16:00:00Z", Instant.parse("2026-10-24T15:57:00Z").toEpochMilli())
        assertEquals(180_000L, offset)
        assertEquals("2026-10-25", SendLine.dayKey(SendLine.serverNow(Instant.parse("2026-10-24T16:58:00Z").toEpochMilli(), offset)))
        assertNull(SendLine.offsetOf(null, 1L))
    }

    /** P8 review: a tick's day is the day of the board it was tapped on (the web board's row.day), never the clock's. */
    @Test fun aTicksDayIsItsBoardsNotTheClocks() {
        // A board read at 03:50 Sun (still Saturday's life day): its rows are Sat's, its Yesterday lane Fri's.
        val tapped = Instant.parse("2026-10-24T17:05:00Z") // 04:05 Sun, Sydney: Sunday's life day by the clock
        assertEquals("today's row books on its board's day (the server takes it as yesterday's record)", "2026-10-24", SendLine.tickDayOf("2026-10-24", "2026-10-23", yesterday = false, at = tapped))
        assertEquals("a Yesterday row on its lane's day (the server refuses it: too old, never booked a day off)", "2026-10-23", SendLine.tickDayOf("2026-10-24", "2026-10-23", yesterday = true, at = tapped))
        assertEquals("a lane with no day of its own: the day before the board's", "2026-10-23", SendLine.tickDayOf("2026-10-24", null, yesterday = true, at = tapped))
        assertEquals("a board with no day (an older server): the clock", "2026-10-25", SendLine.tickDayOf(null, null, yesterday = false, at = tapped))
        assertEquals("2026-10-24", SendLine.tickDayOf(null, null, yesterday = true, at = tapped))
        assertEquals("a day that can't be read: the clock", "2026-10-25", SendLine.tickDayOf("soon", null, yesterday = false, at = tapped))
        // A tick queued from that board books on Saturday: the queue sends it (yesterday is still recordable).
        assertEquals(SendLine.Plan.Send, SendLine.plan(SendLine.Kind.TICK, SendLine.tickDayOf("2026-10-24", "2026-10-23", false, tapped), "Gym", "2026-10-25"))
        assertTrue(SendLine.plan(SendLine.Kind.TICK, SendLine.tickDayOf("2026-10-24", "2026-10-23", true, tapped), "Gym", "2026-10-25") is SendLine.Plan.SetAside)
    }

    @Test fun aPassSendsKeepsBackOrSetsAside() {
        val today = "2026-10-25"
        assertEquals(SendLine.Plan.Send, SendLine.plan(SendLine.Kind.TICK, "2026-10-25", "Gym", today))
        assertEquals("a tick from before 04:00 books on yesterday", SendLine.Plan.Send, SendLine.plan(SendLine.Kind.TICK, "2026-10-24", "Gym", today))
        assertEquals(
            SendLine.Plan.SetAside("Gym was ticked Fri 23 Oct. Only today and yesterday can still be recorded, so it wasn't sent."),
            SendLine.plan(SendLine.Kind.TICK, "2026-10-23", "Gym", today),
        )
        assertEquals(SendLine.Plan.Send, SendLine.plan(SendLine.Kind.LOG, "2026-10-25", "buy milk", today))
        assertEquals(
            SendLine.Plan.KeepBack("Typed Sat 24 Oct, before 04:00, and it got no answer, so it may already be saved. Look on Today first: sent now, it saves for today."),
            SendLine.plan(SendLine.Kind.LOG, "2026-10-24", "buy milk", today),
        )
        assertEquals("a Done marks the item, whatever the day", SendLine.Plan.Send, SendLine.plan(SendLine.Kind.WORK_DONE, "2026-10-20", "Call", today))
    }

    @Test fun anAnswerSaysWhatHappensNext() {
        assertEquals(SendLine.After.RETRY, SendLine.after(Outcome.Err("Can't reach it.", offline = true), 0))
        assertEquals(SendLine.After.HOLD, SendLine.after(Outcome.Err("token", code = "auth", status = 401), 0))
        assertEquals(SendLine.After.HOLD, SendLine.after(Outcome.Err("This server has no mobile API (404).", status = 404), 0))
        assertEquals(SendLine.After.HOLD, SendLine.after(Outcome.Err("The server address isn't valid.", code = "bad"), 0))
        assertEquals(SendLine.After.RETRY, SendLine.after(Outcome.Err("fault", code = "server", status = 500), 0))
        assertEquals(SendLine.After.SET_ASIDE, SendLine.after(Outcome.Err("fault", code = "server", status = 500), SendLine.SERVER_TRIES - 1))
        assertEquals(SendLine.After.SET_ASIDE, SendLine.after(Outcome.Err("That task no longer exists.", code = "gone", status = 404), 0))
        assertEquals(SendLine.After.SET_ASIDE, SendLine.after(Outcome.Err("Log the minutes: …", code = "conflict", status = 409), 0))
    }

    @Test fun theWordsSayWhatWaitsAndWhen() {
        assertNull(SendLine.waitingLine(0))
        assertEquals("1 waiting to send", SendLine.waitingLine(1))
        assertEquals("3 waiting to send", SendLine.waitingLine(3))
        assertEquals("No connection: Gym legs will send when you're online. It counts for Sat 24 Oct.", SendLine.queuedTick("Gym legs", "2026-10-24"))
        assertEquals("No connection: Done on Call Jordan back will send when you're online.", SendLine.queuedWork("Call Jordan back"))
        // P8 review: a line that got no answer may have landed; it never says it hadn't left the phone.
        assertEquals("No answer: the line will send when you're online. If it got through, it's saved once.", SendLine.QUEUED_LOG)
        assertEquals("Sent: Gym legs · +8.3 XP · Body", SendLine.sentTick("Gym legs", "+8.3 XP · Body"))
        assertEquals("Sent: Gym legs", SendLine.sentTick("Gym legs", null))
        assertEquals("“buy milk”", SendLine.labelOf(SendLine.Kind.LOG, "buy milk"))
        assertEquals("Gym legs", SendLine.labelOf(SendLine.Kind.TICK, "Gym legs"))
    }
}

package com.xtnl.app.data

import com.xtnl.app.core.CheckinLine
import com.xtnl.app.core.SetLine
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * Demo data answers health phase 2's routes as the server does (docs/mobile-api.md POST /checkin, /checkin/undo,
 * /lift/set and /check's `checkin` and `lift`): a check-in once per clientId, its refusals in the server's words, counts
 * only on /check; the open lift's next set by the logger's prefill, a set once per clientId, the rest after it, and the
 * big jump in plain words, saved as a record.
 */
class DemoCheckinTest {
    /** 14:12 on Wed 28 Oct, Sydney. */
    private val now = Instant.parse("2026-10-28T03:12:05Z")

    private suspend fun check(d: DemoApi) = (d.check() as Outcome.Ok).value

    @Test fun aCheckinLandsOnceAndCheckSaysOnlyTheCounts() = runTest {
        val demo = DemoApi(clock = { now })
        assertEquals(CheckinState(live = true, lastAt = null, todayCount = 0, paused = false), check(demo).checkin)
        val body = CheckinLine.bodyOf(CheckinLine.Cell(2, -1), 1, "check", now.minusSeconds(4), 3_100)
        val r = (demo.checkin(body, "c-1") as Outcome.Ok).value
        assertEquals("Logged 14:12", r.line)
        assertEquals("Calm, content", r.words)
        assertEquals("2026-10-28", r.day)
        assertEquals("2026-10-28T03:12:10Z", r.undoUntil)
        assertFalse(r.duplicate)
        // A resend of the same body answers the first row; another body with the same clientId is a conflict.
        assertEquals(r, (demo.checkin(body, "c-1") as Outcome.Ok).value)
        assertEquals(409, (demo.checkin(body.copy(valence = -2), "c-1") as Outcome.Err).status)
        val c = check(demo).checkin!!
        assertEquals(1, c.todayCount)
        assertEquals(now.minusSeconds(4).toString(), c.lastAt)
        // The undo is the check-in's Delete, harmless twice.
        assertEquals(CheckinUndoResult(r.id, 1, "Check-in taken back."), (demo.checkinUndo(r.id, "u-1") as Outcome.Ok).value)
        assertEquals(CheckinUndoResult(r.id, 0, "Already deleted."), (demo.checkinUndo(r.id, "u-2") as Outcome.Ok).value)
        assertEquals(0, check(demo).checkin!!.todayCount)
    }

    @Test fun aCheckinIsRefusedInTheServersWords() = runTest {
        val demo = DemoApi(clock = { now })
        fun body(at: Instant) = CheckinLine.bodyOf(CheckinLine.Cell(0, 0), null, "tile", at, null)
        val old = demo.checkin(body(Instant.parse("2026-10-19T22:00:00Z")), "o-1") as Outcome.Err
        assertEquals(409, old.status)
        assertEquals("That check-in is more than a week old.", old.message)
        val ahead = demo.checkin(body(now.plusSeconds(600)), "o-2") as Outcome.Err
        assertEquals("A check-in can't be logged ahead of time.", ahead.message)
        // A few minutes ahead is booked at the clock.
        assertEquals("Logged 14:12", (demo.checkin(body(now.plusSeconds(120)), "o-3") as Outcome.Ok).value.line)
        val bad = demo.checkin(CheckinBody(now.toString(), 5, 0), "o-4") as Outcome.Err
        assertEquals(400, bad.status)
        assertEquals("valence must be a whole number from -4 to 4.", bad.message)
        assertEquals(400, (demo.checkin(CheckinBody(now.toString(), 0, 0, via = "lock"), "o-5") as Outcome.Err).status)
    }

    @Test fun theLiftsNextSetFollowsTheLoggersPrefill() = runTest {
        val demo = DemoApi(clock = { now })
        val lift = check(demo).lift!!
        assertEquals("Lift · Push day", SetLine.title(lift))
        val first = lift.next!!
        // The bench's warm-up is done: its second row, 60 × 8, copied from the last lift.
        assertEquals("Next: Bench press 60 kg × 8", SetLine.nextLine(first))
        assertEquals("Set 2 · last 60 × 8", SetLine.detail(first))
        val body = SetLine.bodyOf(lift, first, now.toString())!!
        val r = (demo.liftSet(body, "s-1") as Outcome.Ok).value
        assertEquals("Bench press: logged 60 kg × 8.", r.line)
        assertEquals(180, r.restSec)
        assertNull(r.jump)
        assertEquals(2, r.set!!.ord)
        assertEquals("Next: Bench press 60 kg × 8", SetLine.nextLine(r.lift!!.next))
        assertEquals(3, r.lift!!.next!!.ord)
        // Once per clientId.
        assertEquals(r, (demo.liftSet(body, "s-1") as Outcome.Ok).value)
        assertEquals(3, check(demo).lift!!.next!!.ord)
        // The third copies 60 × 8 again; the fourth is the last lift's 72.5 × 5, a big jump over the best of 60: a record.
        val l2 = check(demo).lift!!
        demo.liftSet(SetLine.bodyOf(l2, l2.next!!, now.toString())!!, "s-2")
        val l3 = check(demo).lift!!
        assertEquals("Next: Bench press 72.5 kg × 5", SetLine.nextLine(l3.next))
        val jumped = (demo.liftSet(SetLine.bodyOf(l3, l3.next!!, now.toString())!!, "s-3") as Outcome.Ok).value
        assertNotNull(jumped.jump)
        assertTrue(jumped.jump!!.line, jumped.jump!!.line.startsWith("Big jump: 72.5 kg (best 60). Saved as a record."))
        assertEquals("/train/exercise", jumped.jump!!.webHref)
        // The bench is done: the next is the overhead press, then the cable fly with nothing to copy.
        assertEquals("Next: Overhead press 40 kg × 8", SetLine.nextLine(jumped.lift!!.next))
    }

    @Test fun aSetIsRefusedInTheCoresWords() = runTest {
        val demo = DemoApi(clock = { now })
        val lift = check(demo).lift!!
        val body = SetLine.bodyOf(lift, lift.next!!, now.toString())!!
        assertEquals("That lift is no longer here.", (demo.liftSet(body.copy(sessionId = "gone"), "g-1") as Outcome.Err).message)
        assertEquals(404, (demo.liftSet(body.copy(entryId = "gone"), "g-2") as Outcome.Err).status)
        assertEquals("Reps from 1 to 100, please.", (demo.liftSet(body.copy(reps = 0), "g-3") as Outcome.Err).message)
        assertEquals("That set's time isn't valid.", (demo.liftSet(body.copy(doneAt = now.plusSeconds(300).toString()), "g-4") as Outcome.Err).message)
    }
}

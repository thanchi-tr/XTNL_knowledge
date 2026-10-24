package com.xtnl.app.core

import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.TaskPages
import com.xtnl.app.data.TaskTimer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** The phone's minutes and proof of work (P7, P23): the web drawer's chips and clamp, proof.ts's timer words, what a tap does. */
class ProofLineTest {
    private val now = Instant.parse("2026-10-24T01:00:00Z")
    private fun timer(startedMinAgo: Long, stoppedMinAgo: Long? = null) = TaskTimer(
        "s1", "t1", now.minusSeconds(startedMinAgo * 60).toString(), stoppedMinAgo?.let { now.minusSeconds(it * 60).toString() }, running = stoppedMinAgo == null,
    )
    private fun task(proof: Boolean, timer: TaskTimer? = null) = TaskItem("t1", "Write the thesis chapter", "TASK", "OPEN", minutes = 90, proof = proof, timer = timer)

    @Test fun theChipsAreTheWebDrawers() {
        assertEquals(listOf(10, 20, 30, 45, 60, 90), ProofLine.CHIPS)
        assertEquals(480, ProofLine.MINUTES_MAX)
        // A proof row's span its estimate, half to twice it (proof.ts proofMinuteChipsOf, the same figures).
        assertEquals(listOf(45, 70, 90, 115, 135, 180), ProofLine.chips(90, proof = true))
        assertEquals(listOf(90, 135, 180, 225, 270, 360), ProofLine.chips(180, proof = true))
        assertEquals(listOf(240, 360, 480), ProofLine.chips(480, proof = true))
        assertEquals(ProofLine.CHIPS, ProofLine.chips(90, proof = false))
    }

    /** A timer's count is what it ran, at most twice the estimate (life-grade clampMinutes with the timer as its wall). */
    @Test fun aTimerCountsWhatItRan() {
        assertEquals(20, ProofLine.countedTimer(20, 90))
        assertEquals(180, ProofLine.countedTimer(200, 90))
        assertEquals(1, ProofLine.countedTimer(1, 90))
        assertNull(ProofLine.timerCountsLine(20, 90))
        assertEquals("Counts 180 of the timer's 200: twice its estimate at most.", ProofLine.timerCountsLine(200, 90))
    }

    /** Stop, then Resume: the earlier segments ride on the timer (priorMinutes), as the web's chip reads them. */
    @Test fun aResumedTimerKeepsItsEarlierMinutes() {
        val resumed = timer(10).copy(priorMinutes = 40)
        assertEquals(50, ProofLine.timerMinutes(resumed, now))
        assertEquals("Timer 50 min", ProofLine.timerLabel(resumed, now))
        assertEquals(480, ProofLine.timerMinutes(timer(100).copy(priorMinutes = 450), now))
    }

    /** A timer across 04:00, or past twice the estimate, opens the sheet first (proof.ts timerConfirmOf). */
    @Test fun aTimerThatMustAskOpensTheSheet() {
        val today = "2026-10-24"
        assertEquals(ProofLine.Tap.TIMER, ProofLine.tapOf(task(proof = true, timer = timer(34).copy(day = today)), now, today))
        assertEquals(ProofLine.Tap.SHEET, ProofLine.tapOf(task(proof = true, timer = timer(34).copy(day = "2026-10-23")), now, today))
        assertEquals(ProofLine.TIMER_CROSSED, ProofLine.timerAsk(timer(34).copy(day = "2026-10-23"), today, 90, now))
        assertEquals(ProofLine.Tap.SHEET, ProofLine.tapOf(task(proof = true, timer = timer(200).copy(day = today)), now, today))
        assertEquals(
            "Its timer ran 200 min, more than twice its estimate: was it left running? Done counts at most 180; pick the minutes it took otherwise.",
            ProofLine.timerAsk(timer(200), today, 90, now),
        )
        // An older server sends no day: only the estimate can ask.
        assertNull(ProofLine.timerAsk(timer(34), today, 90, now))
    }

    /** The drawer's clamp (life-grade clampMinutes), the server's own count: an estimate of 30 reported as 90 counts 60. */
    @Test fun theClampIsTheDrawers() {
        assertEquals(60, ProofLine.counted(90, 30))
        assertEquals(15, ProofLine.counted(10, 30))
        assertEquals(45, ProofLine.counted(45, 30))
        assertEquals(480, ProofLine.counted(480, 300))
        assertEquals(90, ProofLine.counted(90, 90))
        assertEquals("Counts 60 of the 90 you picked: twice its estimate at most.", ProofLine.countsLine(90, 30))
        assertEquals("Counts 15: half its estimate at least.", ProofLine.countsLine(10, 30))
        assertNull(ProofLine.countsLine(45, 30))
        assertNull(ProofLine.countsLine(null, 30))
    }

    /** A chore still ticks in one tap; a proof row ticks with its timer once it has run, else opens the sheet. */
    @Test fun aTapOnAProofRowNeedsItsMinutes() {
        assertEquals(ProofLine.Tap.TICK, ProofLine.tapOf(task(proof = false), now))
        assertEquals(ProofLine.Tap.TICK, ProofLine.tapOf(task(proof = false, timer = timer(30)), now))
        assertEquals(ProofLine.Tap.SHEET, ProofLine.tapOf(task(proof = true), now))
        assertEquals("a timer under a minute is not yet a proof", ProofLine.Tap.SHEET, ProofLine.tapOf(task(proof = true, timer = timer(0)), now))
        assertEquals(ProofLine.Tap.TIMER, ProofLine.tapOf(task(proof = true, timer = timer(34)), now))
        assertEquals(ProofLine.Tap.TIMER, ProofLine.tapOf(task(proof = true, timer = timer(60, stoppedMinAgo = 10)), now))
    }

    /** proof.ts timerMinutesOf and timerLabelOf: whole minutes to the stop (or now), at most 480. */
    @Test fun theTimerReadsAsTheWebs() {
        assertEquals(34, ProofLine.timerMinutes(timer(34), now))
        assertEquals(50, ProofLine.timerMinutes(timer(60, stoppedMinAgo = 10), now))
        assertEquals(480, ProofLine.timerMinutes(timer(600), now))
        assertEquals(0, ProofLine.timerMinutes(TaskTimer("s", "t", "not a time"), now))
        assertEquals("Timer 34 min", ProofLine.timerLabel(timer(34), now))
        assertEquals("Timed 1 h 05", ProofLine.timerLabel(timer(75, stoppedMinAgo = 10), now))
        assertEquals("Timer 8 h 00+", ProofLine.timerLabel(timer(600), now))
    }

    @Test fun theDoneButtonSaysWhatItSends() {
        assertEquals("Done · 45 min", ProofLine.doneLabel(45, null, proof = true, estimate = 90))
        assertEquals("Done · timer 34 min", ProofLine.doneLabel(null, 34, proof = true, estimate = 90))
        assertEquals("Pick the minutes", ProofLine.doneLabel(null, 0, proof = true, estimate = 90))
        assertEquals("Done · ~10 min", ProofLine.doneLabel(null, null, proof = false, estimate = 10))
    }

    private fun reading(target: Int?) = TaskItem("t2", "Read the novel", "HABIT", "OPEN", minutes = 40, pages = TaskPages(target))

    /** P24: a reading task with a day's target opens the sheet; without one, and every other row, ticks as before. */
    @Test fun aTapOnAReadingTaskNeedsItsPages() {
        assertEquals(ProofLine.Tap.SHEET, ProofLine.tapOf(reading(30), now))
        assertEquals(ProofLine.Tap.TICK, ProofLine.tapOf(reading(null), now))
        assertEquals(ProofLine.Tap.TICK, ProofLine.tapOf(task(proof = false), now))
        assertTrue(ProofLine.needsPages(reading(30), null))
        assertTrue(ProofLine.needsPages(reading(30), 29))
        assertFalse(ProofLine.needsPages(reading(30), 30))
        assertFalse(ProofLine.needsPages(reading(null), null))
        assertFalse(ProofLine.needsPages(task(proof = true), null))
    }

    /** proof.ts pageChipsOf, pagesLabelOf, pagesRowNoteOf and pagesRefusalOf, word for word. */
    @Test fun thePagesReadAsTheWebs() {
        assertEquals(listOf(30, 45, 60), ProofLine.pageChips(30))
        assertEquals(listOf(1, 2), ProofLine.pageChips(1))
        assertEquals(listOf(10, 20, 30, 50), ProofLine.pageChips(null))
        assertEquals(2000, ProofLine.PAGES_MAX)
        assertEquals("30 pages", ProofLine.pagesLabel(30))
        assertEquals("1 page", ProofLine.pagesLabel(1))
        assertEquals("log 30 pages", ProofLine.pagesNote(30))
        assertEquals("log the pages", ProofLine.pagesNote(null))
        assertEquals("Log the pages: a full tick of this one takes at least 30 pages. Pick the pages you read.", ProofLine.pagesRefusal(30, null))
        assertEquals("Log the pages: 20 pages is below the day's 30. A full tick takes at least 30 pages.", ProofLine.pagesRefusal(30, 20))
        assertNull(ProofLine.pagesRefusal(30, 30))
        assertNull(ProofLine.pagesRefusal(null, null))
    }

    @Test fun theDoneButtonSaysThePages() {
        assertEquals("Done · 30 pages", ProofLine.doneLabel(null, null, proof = false, estimate = 40, pages = 30))
        assertEquals("Done · 30 pages · 45 min", ProofLine.doneLabel(45, null, proof = false, estimate = 40, pages = 30))
        assertEquals("Pick the pages", ProofLine.doneLabel(null, null, proof = false, estimate = 40, pages = null, pagesNeeded = true))
        assertEquals("Pick the minutes", ProofLine.doneLabel(null, null, proof = true, estimate = 40, pages = 30))
        assertEquals("Done · 30 pages · timer 34 min", ProofLine.doneLabel(null, 34, proof = true, estimate = 40, pages = 30))
    }
}

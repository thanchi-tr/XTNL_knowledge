package com.xtnl.app.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant

/**
 * Review fatigue (blueprint P30, decision D26) as the demo answers it, the server's rule: 199 answers apply nothing, the
 * day's 200th applies Fatigued once, right or wrong, for 18 hours; /check's review.fatigued and the queue say the same.
 */
class DemoFatigueTest {
    private val at = Instant.parse("2026-10-26T00:00:00Z")

    private suspend fun fatigued(api: DemoApi): Fatigue? = (api.check() as Outcome.Ok).value.review!!.fatigued

    @Test fun theDaysTwoHundredthAnswerAppliesItOnce() = runTest {
        val api = DemoApi { at }
        assertNull(fatigued(api))
        assertNull((api.reviewQueue(20) as Outcome.Ok).value.fatigued)
        api.seedAnswersToday(DEMO_FATIGUE_ANSWERS - 2)
        // The 199th answer, a miss: nothing.
        assertTrue(api.answer("d-int", JsonPrimitive("wrong"), 0, 0, "a-199") is Outcome.Ok)
        assertNull(fatigued(api))
        // The 200th, a miss too: applied, whatever the answer's result.
        assertTrue(api.answer("d-int", JsonPrimitive("wrong"), 0, 1, "a-200") is Outcome.Ok)
        val f = fatigued(api)
        assertNotNull(f)
        assertEquals(at.plus(Duration.ofHours(DEMO_FATIGUE_HOURS)).toString(), f!!.until)
        // Once a day: later answers never move it.
        assertTrue(api.answer("d-int", JsonPrimitive("1"), 0, 2, "a-201") is Outcome.Ok)
        assertEquals(f, fatigued(api))
        assertEquals(f, (api.reviewQueue(20) as Outcome.Ok).value.fatigued)
    }

    @Test fun whileFatiguedTheCeilingIsHalved() = runTest {
        val api = DemoApi { at }
        val before = (api.answer("d-int", JsonPrimitive("1"), 12, 0, "b-1") as Outcome.Ok).value.multiplier
        api.seedAnswersToday(DEMO_FATIGUE_ANSWERS)
        api.answer("d-int", JsonPrimitive("1"), 0, 0, "b-2")
        val after = (api.answer("d-int", JsonPrimitive("1"), 12, 0, "b-3") as Outcome.Ok).value.multiplier
        assertEquals(2.0, before!!, 1e-9)
        assertEquals(1.5, after!!, 1e-9)
    }
}

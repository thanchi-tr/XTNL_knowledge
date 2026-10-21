package com.xtnl.app.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Board clear follows the web's rule (Must, Planned and Habits), as the demo answers it and the app shows it. */
class DemoBoardTest {
    @Test fun anOpenHabitKeepsTheBoardFromClearing() = runTest {
        val api = DemoApi()
        for (id in listOf("t-gym", "t-dentist", "t-tax")) {
            val r = api.completeTask(id, mvv = false, clientId = "c-$id") as Outcome.Ok
            assertFalse("$id: habits are still open", r.value.allDone)
        }
        val check = (api.check() as Outcome.Ok).value
        assertFalse(check.tasksSummary!!.allDone)
        assertTrue(check.tasks.any { it.lane == "HABIT" && it.open })
    }

    @Test fun theLastHabitClearsTheBoard() = runTest {
        val api = DemoApi()
        // The study task completes itself from the day's reviews (7 done; the demo starts at 4).
        for (id in listOf("d-atp", "d-planet", "d-g")) {
            val answer = when (id) { "d-atp" -> "ATP"; "d-planet" -> "Jupiter"; else -> "9.81" }
            assertTrue(api.answer(id, JsonPrimitive(answer), 0, 0, "a-$id") is Outcome.Ok)
        }
        val ticks = listOf("t-gym", "t-dentist", "t-tax", "t-read", "t-stretch")
        val results = ticks.map { (api.completeTask(it, mvv = false, clientId = "c-$it") as Outcome.Ok).value.allDone }
        assertEquals(listOf(false, false, false, false, true), results)
        assertTrue((api.check() as Outcome.Ok).value.tasksSummary!!.allDone)
    }
}

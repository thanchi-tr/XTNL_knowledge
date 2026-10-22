package com.xtnl.app.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

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

    /** The daily quests (D14, D15): the Must lane's rows, the minimum counting as kept. */
    @Test fun theDailyQuestsCountTheMustLane() = runTest {
        val api = DemoApi()
        val before = (api.check() as Outcome.Ok).value.daily!!
        assertEquals(listOf("t-gym", "t-floss"), before.quests.map { it.templateId })
        assertEquals(listOf(1, 2, 1, 5), listOf(before.kept, before.total, before.minimum, before.cap))
        assertFalse(before.full)
        assertTrue(api.completeTask("t-gym", mvv = false, clientId = "c-gym") is Outcome.Ok)
        val after = (api.check() as Outcome.Ok).value.daily!!
        assertEquals(2, after.kept)
        assertTrue(after.full)
    }

    /** A sixth must is logged as an ordinary task, never refused; the 4th and 5th say how near the cap. */
    @Test fun aSixthMustIsLoggedAsAnOrdinaryTask() = runTest {
        val api = DemoApi()
        val lines = (1..4).map { (api.log("call mum ! daily", "task", "l-$it") as Outcome.Ok).value.line.orEmpty() }
        assertFalse(lines[0].contains("daily quests"))
        assertTrue(lines[1], lines[1].endsWith("4 of 5 daily quests"))
        assertTrue(lines[2], lines[2].endsWith("5 of 5 daily quests, the cap"))
        assertTrue(lines[3], lines[3].startsWith("Added (not a Must). ") && lines[3].endsWith("Five daily quests is the cap. Soften one first."))
        val check = (api.check() as Outcome.Ok).value
        assertEquals(5, check.tasks.count { it.lane == "MUST" })
        assertEquals(5, check.daily!!.total)
    }

    /** The ideas past their grace (D23), as the server counts them; a card reviewed today leaves the line. */
    @Test fun aReviewedCardLeavesTheFadingLine() = runTest {
        val api = DemoApi()
        val before = (api.check() as Outcome.Ok).value.fading!!
        assertEquals(listOf(3, 1), listOf(before.ideas, before.forgetting))
        assertEquals(listOf("Cell biology" to 2, "Integration" to 1), before.domains.map { it.name to it.ideas })
        assertTrue(api.answer("d-int", JsonPrimitive("1"), 0, 0, "a-int") is Outcome.Ok)
        val after = (api.check() as Outcome.Ok).value.fading!!
        assertEquals(listOf(2, 0), listOf(after.ideas, after.forgetting))
        assertEquals(listOf("Cell biology"), after.domains.map { it.name })
    }

    /** The weekly audit (D12): read live on a Sunday (a tick counts); any other day last week's frozen copy, which never moves. */
    @Test fun aTickMovesTheWeekOnlyWhileItIsProvisional() = runTest {
        val api = DemoApi()
        val before = (api.check() as Outcome.Ok).value.week!!
        assertTrue(api.completeTask("t-gym", mvv = false, clientId = "c-gym") is Outcome.Ok)
        val after = (api.check() as Outcome.Ok).value.week!!
        if (before.status == "provisional") {
            assertEquals(before.kept + 1, after.kept)
            assertEquals(before.open - 1, after.open)
        } else {
            assertEquals(before, after)
            assertTrue(before.asOfDay != null)
        }
        assertEquals(85, after.target)
        assertEquals(after.kept * 100 / after.due, after.rate)
        // P12: "Decaying this week" rides with the week (its count, its first three lines).
        assertEquals(4, after.decaying!!.count)
        assertEquals(3, after.decaying!!.top.size)
    }

    /** The week shown turns at Sunday 18:00 Sydney, as the server's does (week-audit auditWeekAt), not at the 04:00 turn. */
    @Test fun theWeekTurnsProvisionalAtSixOnSundayEvening() = runTest {
        // Sunday 25 October 2026 (AEDT): 17:59 is still last week's copy (final: it was judged Wednesday); 18:00 this week.
        val before = (DemoApi { Instant.parse("2026-10-25T06:59:00Z") }.check() as Outcome.Ok).value
        val after = (DemoApi { Instant.parse("2026-10-25T07:00:00Z") }.check() as Outcome.Ok).value
        assertEquals(listOf("2026-W42", "final", "2026-10-19"), before.week!!.let { listOf(it.weekKey, it.status, it.asOfDay) })
        assertEquals(listOf("2026-W43", "provisional", null), after.week!!.let { listOf(it.weekKey, it.status, it.asOfDay) })
        // Saturday evening is never this week's.
        assertEquals("2026-W42", (DemoApi { Instant.parse("2026-10-24T09:00:00Z") }.check() as Outcome.Ok).value.week!!.weekKey)
        assertTrue(before.auditOn && after.auditOn)
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

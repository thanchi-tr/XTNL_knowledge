package com.xtnl.app.core

import com.xtnl.app.data.DailyQuest
import com.xtnl.app.data.DailyQuests
import com.xtnl.app.data.TaskItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The daily quests strip (D14, D15): the server's cells, each listed quest live from its row; the minimum counts 1. */
class DailyStripTest {
    private val server = DailyQuests(
        kept = 1, total = 3, full = false, cap = 5, minimum = 0, over = 0,
        quests = listOf(DailyQuest("gym", "Gym", kept = true), DailyQuest("meds", "Meds"), DailyQuest("call", "Call")),
    )

    @Test fun aTickHereFlipsItsCellAtOnce() {
        val tasks = listOf(TaskItem("gym", "Gym", "MUST", "DONE"), TaskItem("meds", "Meds", "MUST", "DONE_MVV"))
        val d = DailyStrip.live(server, tasks)!!
        assertEquals(listOf(true, true, false), d.quests.map { it.kept })
        assertEquals(2, d.kept)
        assertEquals(1, d.minimum)
        assertFalse(d.full)
        assertEquals("Daily quests 2 of 3", DailyStrip.header(d))
        assertEquals(listOf("1 at minimum"), DailyStrip.notes(d))
    }

    @Test fun anUndoTakesItBack() {
        val d = DailyStrip.live(server, listOf(TaskItem("gym", "Gym", "MUST", "OPEN")))!!
        assertEquals(0, d.kept)
        assertEquals(listOf(false, false, false), d.quests.map { it.kept })
    }

    @Test fun aQuestTheListDoesNotShowKeepsTheServersCell() {
        val d = DailyStrip.live(server.copy(quests = server.quests.map { if (it.templateId == "call") it.copy(kept = true) else it }), emptyList())!!
        assertTrue(d.quests.last().kept)
        assertEquals(2, d.kept)
    }

    @Test fun everyQuestKeptIsFullAndTheMinimumCountsOne() {
        val tasks = listOf(TaskItem("gym", "Gym", "MUST", "DONE"), TaskItem("meds", "Meds", "MUST", "DONE_MVV"), TaskItem("call", "Call", "MUST", "DONE_MVV"))
        val d = DailyStrip.live(server, tasks)!!
        assertTrue(d.full)
        assertEquals(3, d.kept)
        assertEquals(2, d.minimum)
        assertEquals("Daily quests, 3 of 3 kept, 2 at minimum", DailyStrip.description(d))
    }

    @Test fun aDayOverTheCapSaysSo() {
        assertEquals(listOf("2 over the cap"), DailyStrip.notes(DailyQuests(total = 7, over = 2)))
    }

    @Test fun anOlderServerSendsNone() {
        assertNull(DailyStrip.live(null, emptyList()))
    }
}

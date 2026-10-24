package com.xtnl.app.core

import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.YesterdayLane
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Yesterday section (P7, D34): its rows keyed apart from today's, its count in the web's words, only with a row. */
class YesterdayLineTest {
    @Test fun aYesterdayRowIsKeyedApartFromTodaysRowOfTheSameTemplate() {
        val key = YesterdayLine.key("t-meds")
        assertTrue(key != "t-meds")
        assertTrue(YesterdayLine.isKey(key))
        assertFalse("a template id is today's key", YesterdayLine.isKey("t-meds"))
        assertEquals("t-meds", YesterdayLine.templateOf(key))
        assertEquals("t-meds", YesterdayLine.templateOf("t-meds"))
    }

    @Test fun theSectionShowsOnlyWithARow() {
        assertFalse("an older server sends none", YesterdayLine.shows(null))
        assertFalse("nothing left to record", YesterdayLine.shows(YesterdayLane(day = "2026-10-20", open = 0)))
        assertTrue(YesterdayLine.shows(YesterdayLane(day = "2026-10-20", open = 1, tasks = listOf(TaskItem("t", "Stretch", "HABIT")))))
    }

    @Test fun itsCountIsTheWebs() {
        val open = TaskItem("a", "Stretch", "HABIT")
        val done = open.copy(templateId = "b", status = "DONE")
        assertEquals("2 to record", YesterdayLine.count(listOf(open, open.copy(templateId = "c"), done)))
        assertEquals("all recorded", YesterdayLine.count(listOf(done)))
        assertEquals("For yesterday, Tue 20 Oct, at the full rate.", YesterdayLine.sheetNote("Tue 20 Oct"))
        assertEquals("For yesterday, at the full rate.", YesterdayLine.sheetNote(null))
    }
}

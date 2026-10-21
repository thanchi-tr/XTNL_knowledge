package com.xtnl.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LogPreviewTest {
    private fun task(s: String) = LogPreview.read(s, LogSection.TASK)

    @Test fun theContractsExample() {
        val r = task("gym legs 60m every mon,thu !")
        assertTrue(r.ok)
        assertEquals("Gym legs", r.title)
        assertEquals("Gym legs · Mon, Thu · 60 min · Must", r.line)
    }

    @Test fun daysTimesAndEstimates() {
        assertEquals("Call mum · Tomorrow · 7:00 pm", task("call mum tomorrow 7pm").line)
        assertEquals("Stretch · Every day · 10 min", task("stretch daily 10 min").line)
        assertEquals("Report · By Fri · 90 min", task("report by fri 1h30").line)
        assertEquals("Swim · Weekdays · 45 min", task("swim weekdays 45m").line)
    }

    @Test fun weakDaysOnlyAtTheEdges() {
        assertEquals("Enjoy the sun · Today", task("enjoy the sun today").line)
        assertEquals("Call mum · Sun", task("call mum sun").line)
    }

    @Test fun aBareLongMIsNotMinutes() {
        val r = task("swim 400m")
        assertEquals("Swim 400m · Today", r.line)
    }

    @Test fun anEmptyTaskIsNotOk() {
        assertFalse(task("   ").ok)
    }

    @Test fun weighIns() {
        assertEquals("Weigh-in · 82.4", LogPreview.read("82.4", LogSection.WEIGHT).line)
        assertEquals("Weigh-in · 72.1 kg · yesterday", LogPreview.read("72.1kg yesterday", LogSection.WEIGHT).line)
        assertEquals("Weigh-in · 160 lb", LogPreview.read("160 lb", LogSection.WEIGHT).line)
        assertFalse(LogPreview.read("gym legs", LogSection.WEIGHT).ok)
        assertFalse(LogPreview.read("5", LogSection.WEIGHT).ok)
    }

    @Test fun ideas() {
        val r = LogPreview.read("idea: why do leaves change colour?", LogSection.IDEA)
        assertTrue(r.ok)
        assertEquals("Idea draft · Why do leaves change colour?", r.line)
        assertFalse(LogPreview.read("", LogSection.IDEA).ok)
    }

    @Test fun anIdeaLineLeavesRoomForTheStartTheServerAdds() {
        // The server sends an idea line as "idea: …" and counts those 6 characters in its 500.
        assertEquals(494, LogPreview.maxLine("why do leaves change colour?", LogSection.IDEA))
        assertEquals(500, LogPreview.maxLine("idea: why do leaves change colour?", LogSection.IDEA))
        assertEquals(500, LogPreview.maxLine("I: why?", LogSection.IDEA))
        assertEquals(500, LogPreview.maxLine("why do leaves change colour?", LogSection.TASK))
        assertEquals(500, LogPreview.maxLine("72.4", LogSection.WEIGHT))
    }

    @Test fun sectionsReadTheirWireNames() {
        assertEquals(LogSection.WEIGHT, LogSection.of("weight"))
        assertEquals(LogSection.IDEA, LogSection.of("IDEA"))
        assertEquals(LogSection.TASK, LogSection.of("anything"))
        assertEquals(LogSection.TASK, LogSection.of("task"))
    }
}

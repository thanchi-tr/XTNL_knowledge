package com.xtnl.app.core

import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.WeekAudit
import com.xtnl.app.data.WeekSide
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/** Side quests (P31, D35): the web's words (lib/side-quests.ts sideLabelOf), the server's label first, the week's lane. */
class SideLineTest {
    private val wed = LocalDate.parse("2026-10-21")

    @Test fun theLabelIsTheWebs() {
        assertEquals("Side quest · expires today", SideLine.label(wed, wed))
        assertEquals("Side quest · expires tomorrow", SideLine.label(wed.plusDays(1), wed))
        assertEquals("Side quest · expires Fri", SideLine.label(wed.plusDays(2), wed))
        assertEquals("Side quest · expires 4 Nov", SideLine.label(wed.plusDays(14), wed))
        assertEquals("Side quest · expired yesterday", SideLine.label(wed.minusDays(1), wed))
        assertEquals("further back a date, never a weekday (the web's whenOf)", "Side quest · expired 18 Oct", SideLine.label(wed.minusDays(3), wed))
    }

    @Test fun aRowSaysItOnlyWhenItIsOne() {
        val walk = TaskItem("t", "20-minute walk", side = true, expiresDay = "2026-10-23")
        assertEquals("the server's own label wins", "Side quest · expires Fri", SideLine.of(walk.copy(dueLabel = "Side quest · expires Fri"), null))
        assertEquals("else from its expiry", "Side quest · expires Fri", SideLine.of(walk, wed))
        assertEquals("with no day to read it against, the name alone", "Side quest", SideLine.of(walk, null))
        assertNull("any other row is not one", SideLine.of(TaskItem("t", "Lodge the tax return", dueLabel = "by Fri"), wed))
    }

    @Test fun anOpenSideQuestAsksNothingOfTheDay() {
        val walk = TaskItem("t", "20-minute walk", side = true, expiresDay = "2026-10-23")
        assertEquals(false, walk.countsForBoard)
        assertEquals("done, it counts like any row", true, walk.copy(status = "DONE").countsForBoard)
    }

    @Test fun theWeekCardsLane() {
        val week = WeekAudit(weekKey = "2026-W43", label = "Week of 19 Oct", rate = 82, kept = 23, due = 28)
        assertNull("absent with none", SideLine.audit(week))
        assertEquals("Side quests · 1 of 2 done · not in the rate", SideLine.audit(week.copy(side = WeekSide(done = 1, offered = 2))))
        assertEquals(
            "Week audit, Week of 19 Oct, 82% · 23 of 28 kept, Provisional, Target 85% · 1 more kept would reach it, Side quests · 1 of 2 done · not in the rate",
            WeekLine.description(week.copy(short = 1, side = WeekSide(done = 1, offered = 2))),
        )
    }
}

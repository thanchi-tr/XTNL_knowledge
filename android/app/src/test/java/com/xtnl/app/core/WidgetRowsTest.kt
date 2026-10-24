package com.xtnl.app.core

import com.xtnl.app.data.CheckData
import com.xtnl.app.data.DemoApi
import com.xtnl.app.data.NotSent
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.QueueState
import com.xtnl.app.data.QueuedWrite
import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.TaskPages
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant

/**
 * The cover-screen widget's rows (blueprint P8): today's open musts and habits, musts first, a tick in one tap on every
 * row but a proof or reading one (which opens Check), a waiting tick shown as waiting with nothing more to tap, and the
 * rows a height fits.
 */
class WidgetRowsTest {
    private val now = Instant.parse("2026-10-25T00:12:00Z")

    @Test fun itListsTheDemosOpenMustsAndHabits() = runTest {
        val data = (DemoApi(clock = { now }).check() as Outcome.Ok).value
        val v = WidgetRows.of(data, QueueState(), now, demo = true)
        assertEquals("Today · demo", v.title)
        // Gym legs (Must) first; Floss is kept at the minimum, Run held, Morning meds done: not listed. No one-offs.
        assertEquals(listOf("t-gym", "t-read", "t-novel", "t-stretch"), v.rows.map { it.templateId })
        assertEquals(listOf("MUST", "HABIT", "HABIT", "HABIT"), v.rows.map { it.lane })
        assertEquals(WidgetRows.Tap.TICK, v.rows[0].tap)
        assertEquals("a reading task with a day's target opens Check (its pages)", WidgetRows.Tap.OPEN_APP, v.rows.single { it.templateId == "t-novel" }.tap)
        assertEquals("Must · 60 min", v.rows[0].meta)
        assertEquals("Habit · 40 min · log 30 pages", v.rows.single { it.templateId == "t-novel" }.meta)
        assertEquals("4 open · 2 kept", v.status)
        assertNull(v.note)
        assertNull(v.empty)
    }

    @Test fun aWaitingTickShowsAsWaiting() {
        val data = CheckData(day = "2026-10-25", tasks = listOf(TaskItem("t-gym", "Gym legs", "MUST", "OPEN", minutes = 60), TaskItem("t-stretch", "Stretch", "HABIT", "OPEN")))
        val q = QueueState(
            items = listOf(QueuedWrite.tick("c-1", "s", "2026-10-25", "Gym legs", "t-gym")),
            notSent = listOf(NotSent(QueuedWrite.log("c-2", "s", "2026-10-24", "buy milk", "task"), "Typed …", keptBack = true)),
        )
        val v = WidgetRows.of(data, q, now)
        val gym = v.rows.first()
        assertTrue(gym.waiting)
        assertEquals(WidgetRows.Tap.NONE, gym.tap)
        assertEquals("Must · 60 min · waiting to send", gym.meta)
        assertEquals("Gym legs, waiting to send", WidgetRows.tickLabel(gym))
        assertEquals("Tick Stretch", WidgetRows.tickLabel(v.rows[1]))
        assertEquals("1 open · 1 kept", v.status)
        assertEquals("1 waiting to send · 1 not sent", v.note)
    }

    @Test fun aProofRowOpensCheckAndAnOldBoardSaysItsDay() {
        val data = CheckData(day = "2026-10-24", dayLabel = "Sat 24 Oct", tasks = listOf(TaskItem("t-thesis", "Write", "HABIT", "OPEN", minutes = 90, proof = true), TaskItem("t-read", "Read", "HABIT", "OPEN", pages = TaskPages(30))))
        val v = WidgetRows.of(data, QueueState(), now, offline = true)
        assertEquals("Sat 24 Oct", v.title)
        assertEquals(listOf(WidgetRows.Tap.OPEN_APP, WidgetRows.Tap.OPEN_APP), v.rows.map { it.tap })
        assertEquals("Habit · 90 min · log the minutes", v.rows[0].meta)
        assertEquals("2 open · offline", v.status)
        // P8 review: each row carries its board's day, the day its tick books on (an old board's, never the clock's).
        assertEquals(listOf("2026-10-24", "2026-10-24"), v.rows.map { it.day })
    }

    @Test fun nothingOpenOrNothingRead() {
        val done = CheckData(day = "2026-10-25", tasks = listOf(TaskItem("t-gym", "Gym", "MUST", "DONE"), TaskItem("t-tax", "Tax", "TASK", "OPEN")))
        assertEquals(WidgetRows.NOTHING_OPEN, WidgetRows.of(done, QueueState(), now).empty)
        assertEquals(WidgetRows.NO_BOARD, WidgetRows.of(null, QueueState(), now).empty)
    }

    @Test fun theRowsAHeightFits() {
        assertEquals(1, WidgetRows.capacity(110f))
        assertEquals(3, WidgetRows.capacity(200f))
        assertEquals(4, WidgetRows.capacity(290f))
        assertEquals(6, WidgetRows.capacity(360f))
        assertEquals(WidgetRows.MAX_ROWS, WidgetRows.capacity(2000f))
        // Four rows in a 4 x 2 widget (200 dp): two show, and "+2 more" takes the third's room.
        val rows = (1..4).map { WidgetRows.Row("t$it", "Row $it", "HABIT", "Habit", waiting = false, tap = WidgetRows.Tap.TICK) }
        assertEquals(listOf("t1", "t2") to 2, WidgetRows.fit(rows, 200f).let { (s, n) -> s.map { it.templateId } to n })
        assertEquals(rows to 0, WidgetRows.fit(rows, 290f))
        assertTrue("a row is a 48 dp target", WidgetRows.ROW_DP >= 44)
    }

    /** The budget (ingest-budget-check): a widget tick is one tap: the row's tick runs WidgetTick, which queues it, no dialog. */
    @Test fun aWidgetTickIsOneTap() {
        fun src(p: String) = (File("src/main/java/com/xtnl/app/$p").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/$p")).readText()
        val widget = src("widget/TodayWidget.kt")
        val tick = src("widget/WidgetTick.kt")
        assertTrue(widget.contains("WidgetRows.Tap.TICK -> actionRunCallback<WidgetTick>("))
        assertTrue(widget.contains("Box(if (tick != null) circle.clickable(tick) else circle"))
        assertTrue(tick.contains("queue.enqueue(QueuedWrite.tick("))
        assertTrue("no screen opens on a tick", listOf("startActivity", "actionStartActivity", "Intent", "Dialog").none { tick.contains(it) })
        // P8 review: the tick's day is the row's board's (WidgetTick.DAY), the clock's only for a board with none.
        assertTrue(widget.contains("actionRunCallback<WidgetTick>(WidgetTick.parametersOf(r))"))
        assertTrue(tick.contains("val day = parameters[DAY]?.takeIf { TimeLabels.parseDay(it) != null } ?: queue.today()"))
    }
}

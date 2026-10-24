package com.xtnl.app.core

import com.xtnl.app.data.CheckData
import com.xtnl.app.data.QueueState
import com.xtnl.app.data.TaskItem
import java.time.Instant

/**
 * The cover-screen widget's rows and words (blueprint 5.1b, P8; decision D34; widget/TodayWidget draws them). Pure.
 *
 * It lists today's open Must and Habit rows from the last /check (the stored server's, with its token; demo data's
 * when that is on), the musts first, as Check lists them. Each row has a tick: one tap, which waits on the phone and
 * sends at once when it can (data/SendQueue), so it shows "waiting to send" until it lands and then leaves the list. A
 * proof or reading row (P23, P24) needs its minutes or pages, so its tap opens Check instead, as Check's own tap opens
 * the sheet. Planned one-offs, held, skipped, locked and done rows are not listed.
 */
object WidgetRows {
    /** What a row's tick does. */
    enum class Tap {
        /** The tick, in one tap. */
        TICK,
        /** Opens Check (the row needs its minutes or pages). */
        OPEN_APP,
        /** Nothing: its tick waits to send already. */
        NONE,
    }

    /** A row; [day] is its board's life day (the cached /check's), the day its tick books on (P8 review). */
    data class Row(val templateId: String, val title: String, val lane: String, val meta: String, val waiting: Boolean, val tap: Tap, val day: String? = null)

    data class View(
        val title: String,
        /** "3 open · 2 kept", or why there is nothing ("Can't reach XTNL"). */
        val status: String,
        val rows: List<Row>,
        /** "2 waiting to send" and "1 not sent", or null. */
        val note: String?,
        /** Nothing to show, and why. */
        val empty: String?,
    )

    /** A row's height (dp): its tick is a 48 dp target. */
    const val ROW_DP = 48
    /** The title's band and the padding around it (dp). */
    const val HEAD_DP = 52
    const val MAX_ROWS = 6

    /** The "+2 more" line's height (dp). */
    const val MORE_DP = 24

    /** How many rows fit a widget [heightDp] tall: at least one. */
    fun capacity(heightDp: Float): Int = ((heightDp - HEAD_DP) / ROW_DP).toInt().coerceIn(1, MAX_ROWS)

    /** The rows a widget [heightDp] tall shows, and how many more there are (their line takes a row's room when needed). */
    fun fit(rows: List<Row>, heightDp: Float): Pair<List<Row>, Int> {
        if (rows.size <= capacity(heightDp)) return rows to 0
        val shown = rows.take(capacity(heightDp - MORE_DP))
        return shown to rows.size - shown.size
    }

    const val NOTHING_OPEN = "Nothing open in Must or Habits."
    const val NO_BOARD = "Open XTNL to read today's board."

    private val LANES = listOf("MUST", "HABIT")

    /**
     * The view of [data] (null: nothing read yet) with the queue's [queue] (this source's) over it, at [now] (the server's
     * clock as best known): a row whose tick waits shows so. [demo]: the rows are demo data's.
     */
    fun of(data: CheckData?, queue: QueueState, now: Instant, demo: Boolean = false, offline: Boolean = false): View {
        val waitingLine = SendLine.waitingLine(queue.items.size)?.let { if (queue.held != null) "$it · ${SendLine.HELD}" else it }
        val notSent = queue.notSent.size.takeIf { it > 0 }?.let { "$it not sent" }
        val note = listOfNotNull(waitingLine, notSent).joinToString(" · ").ifEmpty { null }
        if (data == null) return View("Today", "", emptyList(), note, NO_BOARD)
        val today = TimeLabels.lifeDay(now).toString()
        val title = (if (data.day == null || data.day == today) "Today" else data.dayLabel ?: data.day) + if (demo) " · demo" else ""
        val rows = data.tasks
            .filter { it.lane in LANES }
            .mapNotNull { t ->
                val waiting = queue.tickFor(t.templateId, yesterday = false)
                when {
                    waiting != null -> Row(t.templateId, t.title, t.lane, metaOf(t, waiting = true), waiting = true, tap = Tap.NONE, day = data.day)
                    !t.open -> null
                    else -> Row(t.templateId, t.title, t.lane, metaOf(t, waiting = false), waiting = false, tap = tapOf(t, now, data.day), day = data.day)
                }
            }
            .sortedBy { LANES.indexOf(it.lane) }
        val open = rows.count { !it.waiting }
        val kept = data.tasks.count { it.lane in LANES && it.kept } + rows.count { it.waiting }
        val status = listOfNotNull("$open open", "$kept kept".takeIf { kept > 0 }, "offline".takeIf { offline }).joinToString(" · ")
        return View(title, status, rows, note, if (rows.isEmpty()) NOTHING_OPEN else null)
    }

    /** One tap ticks every row but a proof or reading one (Check's own rule, ProofLine.tapOf), which opens Check. */
    fun tapOf(t: TaskItem, now: Instant, today: String?): Tap =
        if (ProofLine.tapOf(t, now, today) == ProofLine.Tap.TICK) Tap.TICK else Tap.OPEN_APP

    /** "Must · 60 min", "Habit · 10 min · log the minutes", "Habit · waiting to send". */
    fun metaOf(t: TaskItem, waiting: Boolean): String = buildList {
        add(if (t.lane == "MUST") "Must" else "Habit")
        t.minutes?.let { add("$it min") }
        when {
            waiting -> add(SendLine.WAITING.lowercase())
            t.proof -> add("log the minutes")
            t.pages?.target != null -> add(ProofLine.pagesNote(t.pages.target))
        }
    }.joinToString(" · ")

    /** TalkBack's words for a row's tick. */
    fun tickLabel(r: Row): String = when (r.tap) {
        Tap.TICK -> "Tick ${r.title}"
        Tap.OPEN_APP -> "Open ${r.title} in XTNL"
        Tap.NONE -> "${r.title}, waiting to send"
    }
}

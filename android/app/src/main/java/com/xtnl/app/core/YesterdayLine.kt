package com.xtnl.app.core

import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.YesterdayLane

/**
 * The Yesterday section on Check (docs/mobile-api.md `/check` `yesterday`; blueprint 5.1b, P7, decision D34): the web's
 * Record yesterday sheet, its first list. What was due yesterday and is still recordable ticks here with day
 * "yesterday" and books at T 1.00 (its ✦ figure is that price), until today's life day ends at 04:00; the server's own
 * line says by when. A row recorded this morning stays, ticked, so it can be undone. Settling yesterday, its rest token
 * and "Something else you did yesterday?" stay on the web.
 *
 * A row's state here is keyed apart from today's ([key]): a daily habit has a row on both lanes, one template.
 */
object YesterdayLine {
    const val TITLE = "Yesterday"

    /** The prefix that keeps a Yesterday row's state (its tick, its motes, its sheet) apart from today's row of the same template. */
    private const val PREFIX = "y:"

    fun key(templateId: String): String = PREFIX + templateId

    fun isKey(key: String): Boolean = key.startsWith(PREFIX)

    /** The template a key names (today's keys are the template id itself). */
    fun templateOf(key: String): String = key.removePrefix(PREFIX)

    /** The section shows while the server lists a row (none from an older server, or with nothing left to record). */
    fun shows(lane: YesterdayLane?): Boolean = !lane?.tasks.isNullOrEmpty()

    /** Its count, as the web's Ask: "2 to record"; with every row ticked, "all recorded". */
    fun count(rows: List<TaskItem>): String {
        val open = rows.count { it.open || it.locked }
        return if (open > 0) "$open to record" else "all recorded"
    }

    /** A tap on a row recorded earlier (on the web, or before the app's last start): its Undo is the web's. */
    const val EARLIER = "Recorded for yesterday earlier. Undo it on the web app."

    /** A tap on a row skipped yesterday. */
    const val SKIPPED = "Skipped yesterday."

    /** The minutes sheet's note on a Yesterday row: "For yesterday, Tue 20 Oct, at the full rate." */
    fun sheetNote(dayLabel: String?): String = "For yesterday" + (dayLabel?.let { ", $it" } ?: "") + ", at the full rate."
}

package com.xtnl.app.core

import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.WeekAudit
import java.time.LocalDate
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * Side quests (docs/mobile-api.md `tasks[].side` and `expiresDay`, `week.side`; blueprint 2.5, P31, decision D35): a
 * small one-off the server offers when the week shows an anomaly, or the user's own `#side` line. It pays its normal
 * price, is never a must, asks nothing of the day while open, and once its day is over it is simply gone, at no cost.
 * The row says so in ink with the side-quest glyph ("Side quest · expires Fri"), never in a lane colour. The words are
 * the web's (lib/side-quests.ts sideLabelOf), so the two never disagree; the server's own label wins when it sends one.
 */
object SideLine {
    const val LABEL = "Side quest"

    /** The week card's lane name (the web's Week audit "Side quests"). */
    const val AUDIT_LANE = "Side quests"

    /**
     * "Side quest · expires Fri" ("· expires today", "· expires tomorrow"); once gone, "Side quest · expired yesterday",
     * and further back a date ("expired 18 Oct"), as the web's whenOf: a weekday only within the week ahead.
     */
    fun label(expiresDay: LocalDate, today: LocalDate): String {
        val gap = ChronoUnit.DAYS.between(today, expiresDay)
        val word = when {
            gap == 0L -> "today"
            gap == 1L -> "tomorrow"
            gap == -1L -> "yesterday"
            gap in 2L..6L -> expiresDay.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)
            else -> "${expiresDay.dayOfMonth} ${expiresDay.month.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)}"
        }
        return "$LABEL · ${if (gap < 0) "expired" else "expires"} $word"
    }

    /** A row's words: the server's label, else the label from its expiry; null on any other row. */
    fun of(t: TaskItem, today: LocalDate?): String? {
        if (!t.side) return null
        t.dueLabel?.takeIf { it.isNotEmpty() }?.let { return it }
        val day = TimeLabels.parseDay(t.expiresDay) ?: return LABEL
        return today?.let { label(day, it) } ?: LABEL
    }

    /** The week card's line, "Side quests · 1 of 2 done · not in the rate"; null when the week had none. */
    fun audit(w: WeekAudit): String? = w.side?.takeIf { it.offered > 0 }?.let { "$AUDIT_LANE · ${it.done} of ${it.offered} done · not in the rate" }
}

package com.xtnl.app.core

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * Time words, read against the server's `now` (never the phone's clock), so
 * "overdue" means what the server means.
 *
 * Days are life days in Australia/Sydney, which turn at 04:00 (a 1 am call is
 * still "tonight"). Clock times are shown in [zone] too.
 */
object TimeLabels {
    val SYDNEY: ZoneId = ZoneId.of("Australia/Sydney")
    const val DAY_TURN_HOUR = 4L

    fun lifeDay(at: Instant, zone: ZoneId = SYDNEY): LocalDate =
        at.atZone(zone).minusHours(DAY_TURN_HOUR).toLocalDate()

    fun parseInstant(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

    fun parseDay(day: String?): LocalDate? = day?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    /** "9:30 am" or "09:30". */
    fun clock(at: Instant, zone: ZoneId = SYDNEY, h24: Boolean = false): String {
        val t = at.atZone(zone)
        return if (h24) t.format(DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH))
        else t.format(DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)).lowercase(Locale.ENGLISH)
    }

    private fun dow(d: LocalDate): String = d.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)

    private fun dayMonth(d: LocalDate): String =
        "${d.dayOfMonth} ${d.month.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)}"

    /** "Mon" within the last six days, else "12 Oct". */
    private fun pastDayWord(day: LocalDate, today: LocalDate): String {
        val ago = ChronoUnit.DAYS.between(day, today)
        return if (ago in 1..6) dow(day) else dayMonth(day)
    }

    /** "Tomorrow", "Thu" within the week ahead, else "29 Oct". */
    private fun futureDayWord(day: LocalDate, today: LocalDate): String {
        val ahead = ChronoUnit.DAYS.between(today, day)
        return when {
            ahead == 1L -> "Tomorrow"
            ahead in 2..6 -> dow(day)
            else -> dayMonth(day)
        }
    }

    /** "1 h 20 min", "45 min", "3 h". */
    fun span(minutes: Long): String {
        val m = if (minutes < 1) 1 else minutes
        val h = m / 60
        val r = m % 60
        return when {
            h == 0L -> "$m min"
            r == 0L -> "$h h"
            else -> "$h h $r min"
        }
    }

    /**
     * A work item's due words: "in 20 min", "at 4:30 pm", "Tomorrow 9:00 am",
     * "Overdue 15 min", "Overdue since 9:00 am", "Overdue since Mon", "Today".
     */
    fun due(dueAt: Instant, now: Instant, allDay: Boolean, zone: ZoneId = SYDNEY, h24: Boolean = false): String {
        val today = lifeDay(now, zone)
        val day = lifeDay(dueAt, zone)
        if (allDay) {
            return when {
                day == today -> "Today"
                day.isBefore(today) -> "Overdue since ${pastDayWord(day, today)}"
                else -> futureDayWord(day, today)
            }
        }
        val mins = Duration.between(now, dueAt).toMinutes()
        val late = dueAt.isBefore(now)
        return if (!late) {
            when {
                mins < 1 -> "Now"
                mins < 60 -> "in $mins min"
                mins < 180 && day == today -> "in ${span(mins)}"
                day == today -> "at ${clock(dueAt, zone, h24)}"
                else -> "${futureDayWord(day, today)} ${clock(dueAt, zone, h24)}"
            }
        } else {
            val ago = Duration.between(dueAt, now).toMinutes()
            when {
                ago < 1 -> "Now"
                day == today && ago < 60 -> "Overdue $ago min"
                day == today -> "Overdue since ${clock(dueAt, zone, h24)}"
                else -> "Overdue since ${pastDayWord(day, today)}"
            }
        }
    }

    /** A review card's next due day after an answer: "Back tomorrow", "Back Thu", "Back 29 Oct". */
    fun nextDue(day: LocalDate, now: Instant, zone: ZoneId = SYDNEY): String {
        val today = lifeDay(now, zone)
        return when {
            !day.isAfter(today) -> "Back later today"
            else -> "Back ${futureDayWord(day, today).let { if (it == "Tomorrow") "tomorrow" else it }}"
        }
    }

    /** "Next card in 2 h" / "Next card at 4:30 pm" / "Next card Tomorrow 9:00 am". */
    fun nextCard(at: Instant, now: Instant, zone: ZoneId = SYDNEY, h24: Boolean = false): String {
        if (!at.isAfter(now)) return "Cards are due now"
        val words = due(at, now, allDay = false, zone = zone, h24 = h24)
        return "Next card $words"
    }

    /** "updated 10:42" for the offline line. */
    fun updated(at: Instant, zone: ZoneId, h24: Boolean): String = "updated ${clock(at, zone, h24)}"
}

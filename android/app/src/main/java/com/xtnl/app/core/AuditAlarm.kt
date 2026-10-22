package com.xtnl.app.core

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

/**
 * The Sunday reminder (decision D37; blueprint 5.2e): a local notification on Sunday at 19:00 Sydney time that the
 * week's audit is ready, opening xtnl://app/week (the web's /today/week). No server push: the phone keeps its own
 * clock. The time is always Sydney's, whatever zone the phone is set to (a trip abroad still gets it at 19:00 Sydney),
 * and DST never moves it (19:00 exists on both changeover Sundays).
 *
 * It is armed only while the server's /check says `auditOn` (the audit is switched on by the user's go,
 * AUDIT_LAUNCH_DAY; from the launch day, before the first `week` is sent) and Settings › Notifications › Week audit is
 * on. Exact while Android allows exact alarms; otherwise Android sends it within the hour after 19:00. Pure: the alarm
 * itself is notify/AuditReminder.
 */
object AuditAlarm {
    val ZONE: ZoneId = ZoneId.of("Australia/Sydney")
    val DAY: DayOfWeek = DayOfWeek.SUNDAY
    const val HOUR = 19

    /** What the notification opens (Nav: the full app at [WEB_PATH]). */
    const val LINK = "xtnl://app/week"
    const val WEB_PATH = "/today/week"

    const val TITLE = "Week audit ready"
    const val TEXT = "The week's daily quests, what was left out, and what is decaying."
    const val CHANNEL_NAME = "Week audit"
    const val CHANNEL_TEXT = "Sunday 19:00 (Sydney): the week's audit is ready."

    /** The next Sunday 19:00 in Sydney strictly after [now]. */
    fun nextAt(now: Instant): Instant {
        val local = now.atZone(ZONE).toLocalDate()
        val thisWeek = sydney(local.with(TemporalAdjusters.nextOrSame(DAY)))
        return if (thisWeek.toInstant().isAfter(now)) thisWeek.toInstant() else sydney(local.with(TemporalAdjusters.next(DAY))).toInstant()
    }

    private fun sydney(day: java.time.LocalDate): ZonedDateTime = day.atTime(HOUR, 0).atZone(ZONE)

    /** Whether the alarm is armed: the reminder on, and the server's audit switched on (its last /check said `auditOn`). */
    fun armed(enabled: Boolean, auditLive: Boolean): Boolean = enabled && auditLive

    /** "Sun 25 Oct, 19:00 Sydney": the next one, in Sydney's own words. */
    fun nextLabel(at: Instant): String =
        at.atZone(ZONE).format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)) + ", %02d:00 Sydney".format(HOUR)

    /**
     * Settings' line under the toggle: off, waiting on the audit, waiting on the permission, or when the next one is;
     * without exact alarms ([exact] false) it says Android may send it up to an hour later.
     */
    fun settingsLine(enabled: Boolean, auditLive: Boolean, permitted: Boolean, now: Instant, exact: Boolean = true): String = when {
        !enabled -> "Off: no Sunday reminder."
        !auditLive -> "It starts once the week audit is switched on for this server."
        !permitted -> "Notifications are off for XTNL in Android's settings, so it can't show."
        exact -> "Next: ${nextLabel(nextAt(now))}."
        else -> "Next: ${nextLabel(nextAt(now))}, or up to an hour later: Android's exact alarms are off for XTNL."
    }

    /** Whether Settings offers Android's Alarms & reminders page: armed and able to show, but not exact. */
    fun offersExact(enabled: Boolean, auditLive: Boolean, permitted: Boolean, exact: Boolean): Boolean = enabled && auditLive && permitted && !exact
}

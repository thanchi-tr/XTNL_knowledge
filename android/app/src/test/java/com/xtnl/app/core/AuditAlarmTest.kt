package com.xtnl.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.TimeZone

/** The Sunday reminder (D37): Sunday 19:00 in Sydney, whatever zone the phone is in, either side of DST. */
class AuditAlarmTest {
    private fun at(iso: String): Instant = Instant.parse(iso)

    @Test fun theNextSundayAtSevenInTheEveningSydneyTime() {
        // Wednesday 21 October 2026, 10:00 AEDT → Sunday 25 October 19:00 AEDT (08:00Z).
        assertEquals(at("2026-10-25T08:00:00Z"), AuditAlarm.nextAt(at("2026-10-20T23:00:00Z")))
        // Sunday 18:59 → that evening; 19:00 itself and after → the Sunday after.
        assertEquals(at("2026-10-25T08:00:00Z"), AuditAlarm.nextAt(at("2026-10-25T07:59:00Z")))
        assertEquals(at("2026-11-01T08:00:00Z"), AuditAlarm.nextAt(at("2026-10-25T08:00:00Z")))
        assertEquals(at("2026-11-01T08:00:00Z"), AuditAlarm.nextAt(at("2026-10-25T08:00:01Z")))
        // Late Saturday night in Sydney is already Sunday there, though still Saturday in UTC.
        assertEquals(at("2026-10-25T08:00:00Z"), AuditAlarm.nextAt(at("2026-10-24T13:30:00Z")))
    }

    @Test fun thePhonesOwnZoneNeverMovesIt() {
        val was = TimeZone.getDefault()
        try {
            val now = at("2026-10-22T03:00:00Z")
            val want = AuditAlarm.nextAt(now)
            for (zone in listOf("America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Pacific/Kiritimati", "UTC")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone))
                assertEquals(zone, want, AuditAlarm.nextAt(now))
            }
            val sydney = want.atZone(ZoneId.of("Australia/Sydney"))
            assertEquals(DayOfWeek.SUNDAY, sydney.dayOfWeek)
            assertEquals(19, sydney.hour)
            assertEquals(0, sydney.minute)
        } finally {
            TimeZone.setDefault(was)
        }
    }

    @Test fun daylightSavingNeverMovesItOffSevenOClock() {
        // DST starts Sunday 4 October 2026 (02:00 → 03:00): 19:00 AEDT is 08:00Z; the Sunday before was AEST, 09:00Z.
        assertEquals(at("2026-09-27T09:00:00Z"), AuditAlarm.nextAt(at("2026-09-24T00:00:00Z")))
        assertEquals(at("2026-10-04T08:00:00Z"), AuditAlarm.nextAt(at("2026-09-27T09:00:00Z")))
        // DST ends Sunday 4 April 2027 (03:00 → 02:00): 19:00 AEST is 09:00Z.
        assertEquals(at("2027-04-04T09:00:00Z"), AuditAlarm.nextAt(at("2027-03-28T08:00:00Z")))
        // A year of re-arming from each firing: every one a Sunday at 19:00 in Sydney, 7 days (± the DST hour) apart.
        var t = AuditAlarm.nextAt(at("2026-10-22T00:00:00Z"))
        repeat(53) {
            val next = AuditAlarm.nextAt(t)
            val local = next.atZone(AuditAlarm.ZONE)
            assertEquals(DayOfWeek.SUNDAY, local.dayOfWeek)
            assertEquals(19, local.hour)
            assertTrue(Duration.between(t, next).toHours() in 167..169)
            t = next
        }
    }

    @Test fun itIsArmedOnlyWhenOnAndTheAuditIsLive() {
        assertTrue(AuditAlarm.armed(enabled = true, auditLive = true))
        assertFalse(AuditAlarm.armed(enabled = true, auditLive = false))
        assertFalse(AuditAlarm.armed(enabled = false, auditLive = true))
        assertFalse(AuditAlarm.armed(enabled = false, auditLive = false))
    }

    @Test fun settingsSaysWhatItWillDo() {
        val now = at("2026-10-22T03:00:00Z")
        assertEquals("Off: no Sunday reminder.", AuditAlarm.settingsLine(false, true, true, now))
        assertEquals("It starts once the week audit is switched on for this server.", AuditAlarm.settingsLine(true, false, true, now))
        assertEquals("Notifications are off for XTNL in Android's settings, so it can't show.", AuditAlarm.settingsLine(true, true, false, now))
        assertEquals("Next: Sun 25 Oct, 19:00 Sydney.", AuditAlarm.settingsLine(true, true, true, now))
        assertEquals("xtnl://app/week", AuditAlarm.LINK)
        assertEquals("/today/week", AuditAlarm.WEB_PATH)
    }

    /**
     * Without exact alarms (Android 12+ until Alarms & reminders is allowed) Android may deliver an inexact alarm up to an
     * hour late: the line says so, and Settings offers the page only when the reminder is armed and can show.
     */
    @Test fun withoutExactAlarmsItSaysUpToAnHourLater() {
        val now = at("2026-10-22T03:00:00Z")
        assertEquals("Next: Sun 25 Oct, 19:00 Sydney, or up to an hour later: Android's exact alarms are off for XTNL.", AuditAlarm.settingsLine(true, true, true, now, exact = false))
        assertEquals("Next: Sun 25 Oct, 19:00 Sydney.", AuditAlarm.settingsLine(true, true, true, now, exact = true))
        assertEquals("It starts once the week audit is switched on for this server.", AuditAlarm.settingsLine(true, false, true, now, exact = false))
        assertTrue(AuditAlarm.offersExact(enabled = true, auditLive = true, permitted = true, exact = false))
        assertFalse(AuditAlarm.offersExact(enabled = true, auditLive = true, permitted = true, exact = true))
        assertFalse(AuditAlarm.offersExact(enabled = true, auditLive = false, permitted = true, exact = false))
        assertFalse(AuditAlarm.offersExact(enabled = false, auditLive = true, permitted = true, exact = false))
        assertFalse(AuditAlarm.offersExact(enabled = true, auditLive = true, permitted = false, exact = false))
    }
}

package com.xtnl.app.core

import com.xtnl.app.data.Fatigue
import java.time.Instant
import java.time.ZoneId

/**
 * The review screen's fatigue line (docs/mobile-api.md `fatigued`; blueprint 3.3b, P30, decision D26): "Fatigued until
 * 10:30 pm", then what it means. The server applies Fatigued once a life day's answers reach 200 and sends when it lifts;
 * the app never counts answers or works it out, it shows what the last /check or /review/queue said.
 *
 * No line while the server sends none (switched off, none in effect, or a server before P30), and none once [until] has
 * passed by the server's clock. Its words carry no number: the server's rules page says the ceiling and the hours.
 */
object FatigueLine {
    /** What it means, under the time: never a charge, and it ends by itself. */
    const val NOTE = "A lower combo ceiling for now. Answers still pay, and it lifts by itself."

    /** When the fatigue in effect lifts, or null for no line: none sent, unreadable, or already over at [now]. */
    fun until(f: Fatigue?, now: Instant?): Instant? {
        val at = TimeLabels.parseInstant(f?.until) ?: return null
        if (now != null && !at.isAfter(now)) return null
        return at
    }

    /** Whether the screen shows the line. */
    fun shows(f: Fatigue?, now: Instant?): Boolean = until(f, now) != null

    /** "Fatigued until 10:30 pm", or "Fatigued until tomorrow 4:30 pm" when it lifts on a later calendar day. */
    fun line(until: Instant, now: Instant, zone: ZoneId = TimeLabels.SYDNEY, h24: Boolean = false): String {
        val later = until.atZone(zone).toLocalDate().isAfter(now.atZone(zone).toLocalDate())
        return "Fatigued until ${if (later) "tomorrow " else ""}${TimeLabels.clock(until, zone, h24)}"
    }

    /** What TalkBack reads: the line and its note, one node. */
    fun describe(until: Instant, now: Instant, zone: ZoneId = TimeLabels.SYDNEY, h24: Boolean = false): String = "${line(until, now, zone, h24)}. $NOTE"
}

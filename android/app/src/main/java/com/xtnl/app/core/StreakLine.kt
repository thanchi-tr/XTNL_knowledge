package com.xtnl.app.core

import com.xtnl.app.data.StreakInfo
import com.xtnl.app.data.StreakMultiplier
import java.util.Locale

/**
 * The streak multiplier chip's words (docs/mobile-api.md `streak.multiplier`; blueprint 3.2a, P29, decision D25): the
 * web's "Streak ×1.16 · day 3" on Today's Daily quests, in the same words. The server folds it from settlement's judged
 * Full days on every read; the app never works it out or steps it on a tick (today is never judged, so a tick never moves
 * it, and the server settles a lagging day before it reads the board), it shows the last /check.
 *
 * No chip while the server sends none (the multiplier switched off, or a server before P29). Day 0 is said as it is,
 * "Streak ×1.00": a count, never a warning.
 */
object StreakLine {
    /** The multiplier to show, or null for no chip. */
    fun of(s: StreakInfo?): StreakMultiplier? = s?.multiplier

    /** Whether the check shows the chip. */
    fun shows(s: StreakInfo?): Boolean = of(s) != null

    /** "×1.16": m(d) to two places, as the web prints it. */
    fun mult(value: Double): String = "×" + String.format(Locale.ENGLISH, "%.2f", if (value.isFinite()) value else 1.0)

    /** The chip's words: the server's own line, else built the web's way ("Streak ×1.16 · day 3", "Streak ×1.00"). */
    fun chip(m: StreakMultiplier): String = m.line.ifBlank { build(m) }

    /** The web's streak-mult streakChipText, for a server that sent no line. */
    fun build(m: StreakMultiplier): String {
        val days = m.fullDays.coerceAtLeast(0)
        return if (days > 0) "Streak ${mult(m.value)} · day $days${if (m.floor) "+" else ""}" else "Streak ${mult(m.value)}"
    }

    /** What TalkBack reads: "3 Full days in a row: every full tick pays ×1.16." */
    fun describe(m: StreakMultiplier): String {
        val days = m.fullDays.coerceAtLeast(0)
        if (days == 0) return "Streak multiplier ${mult(m.value)}: a Full day starts it."
        return "$days${if (m.floor) " or more" else ""} Full ${if (days == 1) "day" else "days"} in a row: every full tick pays ${mult(m.value)}."
    }
}

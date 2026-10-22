package com.xtnl.app.core

import com.xtnl.app.data.DecayItem
import com.xtnl.app.data.WeekAudit
import java.time.format.TextStyle
import java.util.Locale

/**
 * The Check screen's Week card (docs/mobile-api.md `week`; blueprint 5.2a and 5.2b, decisions D12, D15, D16, D17):
 * the web's Week audit card in the same words. The daily quests kept of due as a whole percent, when the numbers are
 * from (provisional while read live, as of Monday 04:00 once frozen, final from Wednesday), the 85% target in plain
 * words (or "calibrating" for the first two weeks), and what was left out. Neutral words: a count, never a verdict.
 * The card shows only while the server sends a week (the audit is switched on by the user's go). P12 (blueprint 5.2c):
 * "Decaying this week", its count and its first three lines (on the web each line opens its fix).
 */
object WeekLine {
    const val TITLE = "Week audit"

    /** Whether the card shows: the server sent a week (null while the audit is off, or from an older server). */
    fun shows(w: WeekAudit?): Boolean = w != null

    /** "86% · 26 of 30 kept", or "No daily quests were due". */
    fun headline(w: WeekAudit): String = w.rate?.let { "$it% · ${w.kept} of ${w.due} kept" } ?: "No daily quests were due"

    /** When the numbers are from: "Provisional", "As of Mon 04:00", "As of Mon 04:00 · final". */
    fun status(w: WeekAudit): String {
        val day = TimeLabels.parseDay(w.asOfDay)
        if (w.status == "provisional" || day == null) return "Provisional"
        val asOf = "As of ${day.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)} 04:00"
        return if (w.status == "final") "$asOf · final" else asOf
    }

    /** The target in plain words (only on the audit): calibrating, met, or how many more would reach it. */
    fun target(w: WeekAudit): String = when {
        w.calibrating -> "Calibrating: the ${w.target}% target applies from week 3"
        w.rate == null -> "Target ${w.target}%"
        w.short == 0 -> "Target ${w.target}% · met"
        else -> "Target ${w.target}% · ${w.short} more kept ${if (w.status == "provisional") "would reach" else "would have reached"} it"
    }

    /**
     * What sits under it: "3 at minimum", "2 skipped", "1 held", "1 still open" (each only when there is one); in a frozen
     * copy the open ones were open when it was frozen ("1 open when frozen").
     */
    fun notes(w: WeekAudit): List<String> = buildList {
        if (w.minimum > 0) add("${w.minimum} at minimum")
        if (w.skipped > 0) add("${w.skipped} skipped")
        if (w.held > 0) add("${w.held} held")
        if (w.open > 0) add(if (w.status == "provisional") "${w.open} still open" else "${w.open} open when frozen")
    }

    /** The most lines the card lists (the server sends at most this many). */
    const val DECAY_TOP = 3

    /** "Decaying this week · 4", or "Decaying this week" with none; null when the server sent no decay (not read). */
    fun decayHeading(w: WeekAudit): String? = w.decaying?.let { if (it.count > 0) "Decaying this week · ${it.count}" else "Decaying this week" }

    /** The lines listed: the server's first three ("Probability fell to L3 (from L4)" and its detail). */
    fun decayLines(w: WeekAudit): List<DecayItem> = w.decaying?.top.orEmpty().take(DECAY_TOP)

    /** Under the lines: that nothing fell, how many more the web audit lists, and what couldn't be read. Null with nothing to say. */
    fun decayNote(w: WeekAudit): String? {
        val d = w.decaying ?: return null
        val parts = buildList {
            val hidden = d.count - decayLines(w).size
            if (d.count == 0) add(if (d.unread > 0) "Nothing found in what could be read." else "Nothing fell this week.")
            else if (hidden > 0) add("$hidden more on the web audit.")
            if (d.unread > 0) add(if (d.unread == 1) "1 source couldn't be read." else "${d.unread} sources couldn't be read.")
        }
        return parts.joinToString(" ").ifEmpty { null }
    }

    /** The card in words, for TalkBack. */
    fun description(w: WeekAudit): String =
        (listOf("$TITLE, ${w.label}", headline(w), status(w), target(w)) + notes(w) + listOfNotNull(decayHeading(w)) + decayLines(w).map { it.title } + listOfNotNull(decayNote(w)))
            .filter { it.isNotEmpty() }.joinToString(", ")
}

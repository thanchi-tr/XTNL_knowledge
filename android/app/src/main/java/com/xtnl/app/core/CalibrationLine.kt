package com.xtnl.app.core

import com.xtnl.app.data.CalibrationChange
import com.xtnl.app.data.CheckCalibration

/**
 * Next week's calibration on the Check screen (docs/mobile-api.md `calibration`; blueprint 5.2d, P32, decision D36): the
 * web's Next week card in its own words, read only. Today's three sizes for the week (Move 10, 20 or 30 min and Finish
 * any 2 or 3 tasks, the fallbacks when no exercise or big task is due), set by themselves, and each suggestion with its
 * basis: on offer on the web, accepted (what stands now) or gone. A Keep on the web is that browser's own note (nothing
 * is sent for it), so the phone never asks for an answer: it says where the choice is, with no count and no call to
 * act. No rate and no target (D17: those are the audit's alone). The card shows only while the server sends one: the
 * weekly audit switched on by the user's go, and two weeks frozen. The words are the server's; only the frame is said
 * here.
 */
object CalibrationLine {
    /** The card's name: the calibration in force is this week's (the web's review calls it "Next week" from the week before). */
    const val TITLE = "This week"

    /** Under the sizes, as the web card says it (lib/week-calibration.ts CALIBRATION_AUTO_NOTE). */
    const val SIZES_NOTE = "Today's fallbacks when no exercise or big task is due. Set automatically; prices don't change."

    /** Whether the card shows: the server sent a calibration (null while none is in force, or from an older server). */
    fun shows(c: CheckCalibration?): Boolean = c != null

    /** The suggestions still on offer. */
    fun open(c: CheckCalibration): List<CalibrationChange> = c.changes.filter { it.state == "open" }

    /** A suggestion's state line: on offer on the web, or what stands (the server's words), or that its task left the board. */
    fun stateLine(ch: CalibrationChange): String = when (ch.state) {
        "open" -> "On offer on the web"
        "gone" -> ch.line ?: "No longer on the board."
        else -> ch.line ?: "Accepted."
    }

    /** Under the suggestions, only while one is on offer: where the choice is, never a prompt (a Keep there may stand already). */
    fun footer(c: CheckCalibration): String? = if (open(c).isEmpty()) null else "Accept and Keep are on the web."

    /** The card in words, for TalkBack. */
    fun description(c: CheckCalibration): String =
        (listOf("$TITLE, ${c.label}", c.sizes.line, c.sizes.basis, SIZES_NOTE) + listOfNotNull(c.capacityNote) +
            c.changes.flatMap { listOf(it.title, it.basis, stateLine(it)) } + listOfNotNull(footer(c)))
            .filter { it.isNotEmpty() }.joinToString(", ")
}

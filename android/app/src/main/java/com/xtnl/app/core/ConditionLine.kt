package com.xtnl.app.core

import com.xtnl.app.data.CheckSkill
import kotlin.math.floor

/**
 * The Check screen's Condition card (docs/mobile-api.md `skills`; blueprint 3.1b, P28, decisions D24 and D24b): the
 * attributes and skills the server finds under 90% condition, the lowest first, each in the web's words ("Body 81% · 13
 * days idle"). Condition is a reading, never lost history: levels, XP and hours never drop, rest, sick, vacation and
 * rest-token days are never idle, and one practice brings it back to 100%. The card shows only while the server sends
 * something (nothing while condition decay is switched off, until the user's go).
 */
object ConditionLine {
    const val TITLE = "Condition"

    /** The server lists what is under this share (skill-decay.ts CHECK_CONDITION_BELOW). */
    const val BELOW_PERCENT = 90

    /** What brings it back, and what never moves, in one line. */
    const val NOTE = "Levels, XP and hours never drop. One practice brings it back to 100%."

    /** Whether the card shows: something under 90% (none, or an older server without `skills`: no card). */
    fun shows(list: List<CheckSkill>?): Boolean = !list.isNullOrEmpty()

    /** A condition as a whole percent, rounded down (as the web: nothing below 100% ever reads 100%). */
    fun percent(condition: Double): Int = floor(condition.coerceIn(0.0, 1.0) * 100 + 1e-9).toInt()

    /** "13 days idle", "1 day idle". */
    fun idle(days: Int): String = if (days == 1) "1 day idle" else "$days days idle"

    /** The web's words: "Body 81% · 13 days idle". */
    fun line(s: CheckSkill): String = "${s.name} ${percent(s.condition)}% · ${idle(s.idleDays)}"

    /** What it is: "attribute" or "skill". */
    fun kindWord(s: CheckSkill): String = if (s.kind == "skill") "skill" else "attribute"

    /** The card's aside: "2 under 90%". */
    fun header(list: List<CheckSkill>): String = "${list.size} under $BELOW_PERCENT%"

    /** The card in words, for TalkBack: "Condition: Body 81% · 13 days idle, Walking 50% · 60 days idle". */
    fun description(list: List<CheckSkill>): String = "$TITLE: " + list.joinToString(", ") { line(it) } + ". $NOTE"
}

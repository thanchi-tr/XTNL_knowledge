package com.xtnl.app.core

import com.xtnl.app.data.StreakInfo

/**
 * The Rest tokens chip's words (docs/mobile-api.md `streak.restTokens`; blueprint 3.2c, P21, decision D19): the web's
 * "Rest tokens 2" on Today's Daily quests and on Character, in the same words. It is the one bank the server folds on
 * every read (the momentum freezes); the app never works it out or steps it on a tick, it shows the last /check.
 *
 * No chip while the server sends no bank (null: momentum not live, an unread bank, or a server before P21). 0 is said
 * as it is: a count, never a warning.
 */
object RestTokenLine {
    /** The bank's name, as the web says it. */
    const val WORD = "Rest tokens"

    /** The bank to show, or null for no chip. */
    fun tokens(s: StreakInfo?): Int? = s?.restTokens?.coerceAtLeast(0)

    /** Whether the check shows the chip. */
    fun shows(s: StreakInfo?): Boolean = tokens(s) != null

    /** The chip's words: "Rest tokens 2". */
    fun chip(n: Int): String = "$WORD ${n.coerceAtLeast(0)}"

    /** What TalkBack reads: "2 rest tokens banked. One holds a missed day." */
    fun describe(n: Int): String {
        val k = n.coerceAtLeast(0)
        return "$k rest ${if (k == 1) "token" else "tokens"} banked. One holds a missed day."
    }
}

package com.xtnl.app.core

import com.xtnl.app.data.CreditsChange
import com.xtnl.app.data.Wallet
import java.util.Locale
import kotlin.math.abs

/**
 * The wallet chip's words (docs/mobile-api.md `credits`; blueprint 4.1 and 4.2, decisions D27 to D29): the web purse's
 * Credits line in the same words, whole credits. The server derives the wallet on every read; the app never works a
 * balance out of its own: a tick's answer carries the wallet the server read after it ([after]), shown until the next
 * /check. A tick's line names what it earned only when no other write of the app's overlapped it ([tickSuffix]): the
 * server's `delta` is the change across the write, and a second tick landing meanwhile counts in it.
 *
 * No chip while the server sends no wallet (credits switched off until the user's go, an unread wallet, an older
 * server). XP is never spent, and no penalty ever takes credits.
 */
object WalletLine {
    /** The unit, as the web says it. */
    const val UNIT = "cr"

    /** A whole figure: "1,240", "−10" (a true minus, as the web's). */
    fun figure(n: Int): String {
        val s = String.format(Locale.UK, "%,d", abs(n.toLong()))
        return if (n < 0) "−$s" else s
    }

    /** The chip's figure: "120 cr". */
    fun balance(w: Wallet): String = "${figure(w.balance)} $UNIT"

    /** Beside it: "+40 today", or "none yet today". */
    fun today(w: Wallet): String = if (w.today > 0) "+${figure(w.today)} $UNIT today" else "none yet today"

    /** What TalkBack reads for the chip: "Credits: 120. 40 earned today." */
    fun describe(w: Wallet): String =
        "Credits: ${figure(w.balance)}. " + if (w.today > 0) "${figure(w.today)} earned today." else "None earned yet today."

    /**
     * The wallet after a tick, from the tick's own answer: the balance and today's figure the server read after it.
     * Only an older server, which sends no `today`, steps the shown today by the change. Null change: the wallet stays.
     */
    fun after(shown: Wallet?, change: CreditsChange?): Wallet? {
        if (change == null) return shown
        change.today?.let { return Wallet(change.balance, it) }
        return Wallet(change.balance, ((shown?.today ?: 0) + change.delta).coerceAtLeast(0))
    }

    /**
     * A tick's credits in its line: " · +10 cr" when it earned some and no other write of the app's overlapped it
     * ([alone]); else nothing (two ticks at once share one change, so neither line claims it; the chip shows it).
     */
    fun tickSuffix(change: CreditsChange?, alone: Boolean = true): String =
        if (alone && change != null && change.delta > 0) " · +${figure(change.delta)} $UNIT" else ""

}

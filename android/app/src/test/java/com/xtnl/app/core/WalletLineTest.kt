package com.xtnl.app.core

import com.xtnl.app.data.CreditsChange
import com.xtnl.app.data.Wallet
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/** The wallet chip (blueprint P16): the web purse's words, the server's figures, a tick's step. */
class WalletLineTest {
    @Test fun figuresAreWholeWithGroupingAndATrueMinus() {
        assertEquals("0", WalletLine.figure(0))
        assertEquals("1,240", WalletLine.figure(1240))
        assertEquals("−10", WalletLine.figure(-10))
    }

    @Test fun theChipSaysTheBalanceAndToday() {
        val w = Wallet(balance = 1240, today = 40)
        assertEquals("1,240 cr", WalletLine.balance(w))
        assertEquals("+40 cr today", WalletLine.today(w))
        assertEquals("none yet today", WalletLine.today(Wallet(120, 0)))
        assertEquals("Credits: 1,240. 40 earned today.", WalletLine.describe(w))
        assertEquals("Credits: 120. None earned yet today.", WalletLine.describe(Wallet(120, 0)))
    }

    /**
     * The review of 2026-10-24: the chip is the wallet the server read after the tick (balance and today), never the
     * shown today plus the change. Two ticks at once: the second's answer says delta 20 (both landed between its reads)
     * and today 20; the chip reads 20, not the 30 that adding the deltas up would give.
     */
    @Test fun aTickSetsTheChipFromTheServersWalletAfterIt() {
        val shown = Wallet(195, 10)
        assertEquals(Wallet(205, 20), WalletLine.after(shown, CreditsChange(delta = 20, balance = 205, today = 20)))
        // A purchase on the web meanwhile: the server's figures as they are (delta never counts a purchase).
        assertEquals(Wallet(85, 20), WalletLine.after(shown, CreditsChange(delta = 10, balance = 85, today = 20)))
        assertEquals(Wallet(10, 10), WalletLine.after(null, CreditsChange(delta = 10, balance = 10, today = 10)))
    }

    /** An older server sends no `today`: then, and only then, the shown today steps by the change. */
    @Test fun anOlderServersTickStepsTheShownWalletByItsOwnAnswer() {
        val shown = Wallet(120, 20)
        assertEquals(Wallet(130, 30), WalletLine.after(shown, CreditsChange(delta = 10, balance = 130)))
        // The balance is always the server's: never shown + delta worked out here.
        assertEquals(Wallet(500, 30), WalletLine.after(shown, CreditsChange(delta = 10, balance = 500)))
        // A tick that finishes nothing changes nothing.
        assertEquals(Wallet(120, 20), WalletLine.after(shown, CreditsChange(delta = 0, balance = 120)))
        // No wallet shown yet (credits just switched on): today is the tick's own change.
        assertEquals(Wallet(10, 10), WalletLine.after(null, CreditsChange(delta = 10, balance = 10)))
        // No credits in the answer (switched off, unread, an older server): the shown wallet stays, or none.
        assertSame(shown, WalletLine.after(shown, null))
        assertNull(WalletLine.after(null, null))
    }

    @Test fun aTickLineCarriesWhatItEarned() {
        assertEquals(" · +10 cr", WalletLine.tickSuffix(CreditsChange(10, 130)))
        assertEquals("", WalletLine.tickSuffix(CreditsChange(0, 120)))
        assertEquals("", WalletLine.tickSuffix(null))
    }

    /** A tick that overlapped another of the app's never names the shared change on its line (the chip shows it). */
    @Test fun anOverlappedTickLineNamesNoCredits() {
        assertEquals("", WalletLine.tickSuffix(CreditsChange(20, 205, 20), alone = false))
        assertEquals(" · +20 cr", WalletLine.tickSuffix(CreditsChange(20, 205, 20), alone = true))
    }
}

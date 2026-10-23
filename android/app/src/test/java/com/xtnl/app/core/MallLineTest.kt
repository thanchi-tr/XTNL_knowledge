package com.xtnl.app.core

import com.xtnl.app.data.MallBuyState
import com.xtnl.app.data.MallCategory
import com.xtnl.app.data.MallData
import com.xtnl.app.data.MallGoodDay
import com.xtnl.app.data.MallLimits
import com.xtnl.app.data.MallPurchase
import com.xtnl.app.data.MallReward
import com.xtnl.app.data.Wallet
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** The Mall's words on the phone (blueprint P18, P19; D30 to D32): the server's figures, its order, the Add form's checks, and buying. */
class MallLineTest {
    private val cats = listOf(MallCategory("TREAT", "Treats"), MallCategory("SCREEN", "Screen time"), MallCategory("OUTING", "Outings"))
    private fun reward(id: String, category: String, price: Int = 120, hint: String = "calibrating", cooldown: String? = null) =
        MallReward(id = id, title = id, category = category, categoryLabel = category.lowercase(), price = price, priceLine = "$price cr", hint = hint, cooldownLine = cooldown)
    private fun data(rewards: List<MallReward> = emptyList(), good: MallGoodDay? = null, writesOn: Boolean = true, ready: Boolean = true) =
        MallData(categories = cats, rewards = rewards, goodDay = good, writesOn = writesOn, ready = ready)

    @Test fun rewardsGroupInTheServersCategoryOrderOnlyWhereThereAreSome() {
        val d = data(listOf(reward("film", "SCREEN"), reward("thai", "TREAT"), reward("pizza", "TREAT"), reward("odd", "LATER")))
        val groups = MallLine.groups(d)
        assertEquals(listOf("TREAT", "SCREEN", "LATER"), groups.map { it.first.key })
        assertEquals(listOf("thai", "pizza"), groups[0].second.map { it.id })
        assertEquals("a category this app doesn't know yet still shows, under the server's label", "later", groups[2].first.label)
        assertEquals(emptyList<Any>(), MallLine.groups(data()))
    }

    /** The server's own rule (mall.ts priceHint), half up as the web's Math.round, on the examples credits-check pins. */
    @Test fun theLiveHintIsTheServersRule() {
        val good = MallGoodDay(credits = 40, days = 28, earningDays = 20)
        assertEquals("≈ 2 good days", MallLine.hintFor(80, good))
        assertEquals("≈ 1 good day", MallLine.hintFor(40, good))
        assertEquals("≈ 2 good days", MallLine.hintFor(60, good))
        assertEquals("≈ 10 good days", MallLine.hintFor(400, good))
        assertEquals("≈ 1 good day", MallLine.hintFor(20, good))
        assertEquals("under half a good day", MallLine.hintFor(15, good))
        assertEquals("≈ 1,250 good days", MallLine.hintFor(50_000, good))
        assertEquals(MallLine.CALIBRATING, MallLine.hintFor(80, null))
    }

    @Test fun aPriceIsWholeCreditsInTheLimits() {
        val l = MallLimits()
        assertEquals(1000, MallLine.priceOf("1,000", l))
        assertEquals(120, MallLine.priceOf(" 120 ", l))
        assertEquals(100_000, MallLine.priceOf("100000", l))
        assertNull(MallLine.priceOf("0", l))
        assertNull(MallLine.priceOf("100001", l))
        assertNull(MallLine.priceOf("1.5", l))
        assertNull(MallLine.priceOf("abc", l))
        assertNull(MallLine.priceOf("", l))
    }

    @Test fun theFormSaysTheHintOrTheRange() {
        assertEquals("That's ≈ 3 good days.", MallLine.formHint("120", data(good = MallGoodDay(40, 28, 20))))
        assertEquals("Price hint: calibrating.", MallLine.formHint("120", data()))
        assertEquals("Whole credits, 1 to 100,000.", MallLine.formHint("0", data()))
    }

    @Test fun theFormChecksBeforeSendingAndTheServerSaysTheRest() {
        val d = data()
        assertNull(MallLine.addRefusal("Takeaway night", "120", "", "", d))
        assertNull(MallLine.addRefusal("Takeaway night", "120", "7", "From the Thai place", d))
        assertEquals("Name the reward.", MallLine.addRefusal("   ", "120", "", "", d))
        assertEquals("Give it a price in credits.", MallLine.addRefusal("Gig", " ", "", "", d))
        assertEquals("A price is a whole number of credits from 1 to 100,000.", MallLine.addRefusal("Gig", "0", "", "", d))
        assertEquals("A cooldown is a whole number of days from 1 to 365, or none.", MallLine.addRefusal("Gig", "40", "366", "", d))
        assertEquals("Keep the name to 60 characters.", MallLine.addRefusal("x".repeat(61), "40", "", "", d))
        assertEquals(MallLine.WRITES_OFF, MallLine.addRefusal("Gig", "40", "", "", data(writesOn = false)))
        assertEquals(MallLine.NOT_READY, MallLine.addRefusal("Gig", "40", "", "", data(ready = false)))
        val full = data(List(60) { reward("r$it", "TREAT") })
        assertEquals("60 rewards is the most: archive one on the web first.", MallLine.addRefusal("Gig", "40", "", "", full))
        // #play, sleep and rest days are the server's to refuse, in its words: the form sends them.
        assertNull(MallLine.addRefusal("Sleep in", "40", "", "", d))
    }

    @Test fun aRowSaysItsHintItsCooldownAndReadsAsOneNode() {
        val r = reward("Takeaway", "TREAT", hint = "≈ 3 good days", cooldown = "at most once every 7 days").copy(note = "Thai")
        assertEquals("≈ 3 good days · at most once every 7 days", MallLine.metaLine(r))
        assertEquals("price hint: calibrating", MallLine.metaLine(reward("x", "TREAT")))
        assertEquals("Takeaway. 120 cr. ≈ 3 good days. at most once every 7 days. Thai.", MallLine.describe(r))
    }

    @Test fun theHeaderShowsABalanceOnlyWhenTheServerSendsOne() {
        assertNull(MallLine.balance(data()))
        assertEquals("1,240 cr", MallLine.balance(data().copy(credits = Wallet(1240, 40))))
    }

    @Test fun anArchivedRowSaysItsDayInSydney() {
        val r = reward("Old game", "SCREEN", price = 30).copy(categoryLabel = "Screen time", archivedAt = "2026-10-20T15:00:00Z")
        assertEquals("30 cr · Screen time · archived 21 Oct", MallLine.archivedLine(r))
        assertEquals("1 reward", MallLine.count(1))
        assertEquals("3 rewards", MallLine.count(3))
        assertEquals("Takeaway night listed at 1,200 cr.", MallLine.addedLine(" Takeaway night ", 1200))
    }

    /** P19: Buy only while credits count and the server sent a state; Confirm names the price; the why is the server's. */
    @Test fun buyIsTheServersStateAndConfirmNamesThePrice() {
        val can = reward("Film night", "SCREEN", price = 60).copy(priceLine = "60 cr", buy = MallBuyState(true, null))
        val cant = reward("Takeaway night", "TREAT").copy(buy = MallBuyState(false, "Takeaway night costs 120 cr; you have 30 cr (90 cr short)."))
        val live = data(listOf(can, cant)).copy(credits = Wallet(30, 0))
        assertTrue(MallLine.showsBuy(live, can) && MallLine.buyable(can))
        assertFalse("credits off: no Buy at all", MallLine.showsBuy(data(listOf(can)), can))
        assertFalse("an older server sends no state: no Buy", MallLine.showsBuy(live, reward("x", "TREAT")))
        assertFalse(MallLine.buyable(cant))
        assertEquals("Takeaway night costs 120 cr; you have 30 cr (90 cr short).", MallLine.whyLine(cant))
        assertNull(MallLine.whyLine(can))
        assertEquals("Confirm · 60 cr", MallLine.confirmLabel(can))
        assertEquals("Buy Film night for 60 cr", MallLine.buyDescription(can, armed = false))
        assertEquals("Confirm · 60 cr: buy Film night", MallLine.buyDescription(can, armed = true))
    }

    /** P19: the server's own words (mall.ts), on the examples credits-check and mobile-api-check pin. */
    @Test fun theBuyingWordsAreTheServers() {
        assertEquals("You're at −10 cr: earn it back before you buy.", MallLine.negativeLine(-10))
        assertEquals("Takeaway night costs 120 cr; you have 119 cr (1 cr short).", MallLine.shortLine("Takeaway night", 120, 119))
        assertEquals("At most once every 7 days: next on Thu 29 Oct.", MallLine.cooldownRefusal(7, LocalDate.parse("2026-10-29")))
        assertEquals("At most once a day: next on Wed 28 Oct.", MallLine.cooldownRefusal(1, LocalDate.parse("2026-10-28")))
        assertEquals("Takeaway night bought for 120 cr · 1,120 cr left.", MallLine.boughtLine("Takeaway night", 120, 1120))
        assertEquals("Takeaway night undone: 120 cr back.", MallLine.undoneLine("Takeaway night", 120))
        val at = Instant.parse("2026-10-28T10:05:00Z")
        assertEquals("Bought Wed 28 Oct at 21:05", MallLine.boughtWhen(LocalDate.parse("2026-10-28"), at, 120, refunded = false))
        assertEquals("Bought Tue 27 Oct at 21:05 · undone, 60 cr back", MallLine.boughtWhen(LocalDate.parse("2026-10-27"), Instant.parse("2026-10-27T10:05:00Z"), 60, refunded = true))
        assertEquals("Too late to undo: a purchase can be undone for 10 minutes.", MallLine.UNDO_TOO_LATE)
    }

    /**
     * The review of 2026-10-24: a lost purchase's clientId is kept only for a retry of that same attempt. Once a read of
     * the Mall lists one more purchase of the reward than when the attempt began, it landed: the id is done, and a new
     * Buy of the same reward (a no-cooldown Coffee out) is a new purchase, never a replay of the lost one.
     */
    @Test fun aKeptPurchaseIdLastsOnlyUntilAReadListsThePurchase() {
        val first = MallPurchase(id = "ev-1", rewardId = "rw-coffee", title = "Coffee out", price = 60, priceLine = "60 cr", undoUntil = "2026-10-28T10:15:00Z")
        val before = data().copy(purchases = listOf(first))
        val known = MallLine.purchaseIdsOf("rw-coffee", before)
        assertEquals(setOf("ev-1"), known)
        assertFalse("the read shows nothing new: the same attempt may still be retried with its id", MallLine.keptBuyLanded("rw-coffee", known, before))
        val landed = before.copy(purchases = listOf(first.copy(id = "ev-2"), first))
        assertTrue("the lost attempt landed: its id is done", MallLine.keptBuyLanded("rw-coffee", known, landed))
        assertFalse("another reward's purchase says nothing about this one", MallLine.keptBuyLanded("rw-film", MallLine.purchaseIdsOf("rw-film", before), landed))
        assertEquals(emptySet<String>(), MallLine.purchaseIdsOf("rw-coffee", null))
        // An undo's kept id: settled once the purchase reads undone, past its window, or gone from the list.
        assertFalse(MallLine.keptUndoSettled("ev-1", before))
        assertTrue(MallLine.keptUndoSettled("ev-1", before.copy(purchases = listOf(first.copy(refunded = true)))))
        assertTrue(MallLine.keptUndoSettled("ev-1", before.copy(purchases = listOf(first.copy(undoUntil = null)))))
        assertTrue(MallLine.keptUndoSettled("ev-1", data()))
    }

    /** P19: Undo while its ten minutes last (the instant itself included), never once undone; below zero is shown plainly. */
    @Test fun undoLastsTenMinutesAndBelowZeroIsPlain() {
        val p = MallPurchase(id = "ev-1", title = "Takeaway night", price = 120, priceLine = "120 cr", at = "21:05", undoUntil = "2026-10-28T10:15:00Z", line = "Bought Wed 28 Oct at 21:05")
        assertTrue(MallLine.undoOpen(p, Instant.parse("2026-10-28T10:14:59Z")))
        assertTrue(MallLine.undoOpen(p, Instant.parse("2026-10-28T10:15:00Z")))
        assertFalse(MallLine.undoOpen(p, Instant.parse("2026-10-28T10:15:01Z")))
        assertFalse("undone: no Undo", MallLine.undoOpen(p.copy(refunded = true), Instant.parse("2026-10-28T10:06:00Z")))
        assertEquals("until 21:15", MallLine.undoUntilLine(p))
        assertEquals("−120 cr", MallLine.purchaseFigure(p))
        // Undone: the price alone, struck through on screen, never "+120 cr" (it spent and got back the same).
        assertEquals("120 cr", MallLine.purchaseFigure(p.copy(refunded = true)))
        assertEquals("Takeaway night. −120 cr. Bought Wed 28 Oct at 21:05.", MallLine.describePurchase(p))
        assertEquals("Takeaway night. 120 cr, undone. Bought Wed 28 Oct at 21:05 · undone, 120 cr back.", MallLine.describePurchase(p.copy(refunded = true, line = "Bought Wed 28 Oct at 21:05 · undone, 120 cr back")))
        val below = data().copy(credits = Wallet(-10, 0))
        assertTrue(MallLine.negative(below))
        assertEquals("−10 cr", MallLine.balance(below))
        assertFalse(MallLine.negative(data().copy(credits = Wallet(0, 0))))
    }
}

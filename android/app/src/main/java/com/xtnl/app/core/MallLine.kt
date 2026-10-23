package com.xtnl.app.core

import com.xtnl.app.data.MallCategory
import com.xtnl.app.data.MallData
import com.xtnl.app.data.MallGoodDay
import com.xtnl.app.data.MallLimits
import com.xtnl.app.data.MallPurchase
import com.xtnl.app.data.MallReward
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.floor

/**
 * The Mall's words on the phone (docs/mobile-api.md `GET /mall`, `POST /mall/rewards`; blueprint 4.3, decision D30): You
 * › Mall in the same words. The rewards the user lists, each with its price in credits and its hint ("≈ 2 good days"),
 * by category, and the credits over them. Every figure is the server's: the app never prices a reward or reckons a
 * balance; the one thing worked out here is the Add form's live hint, by the server's own rule (mall.ts priceHint) on
 * the good day the server sent.
 *
 * Only what the user lists is priced: the Mall starts empty, and nothing here suggests a reward. #play, rest days and
 * sleep are never priced (the server refuses them, in its own words). The app can't block leisure, so the Mall runs on
 * honour. Rewards are added here; edited and archived on the web.
 *
 * Buying (P19, decisions D31 and D32): Buy, then Confirm, as the web. Whether a reward can be bought, and why not, is the
 * server's (each reward's `buy`); a purchase burns exactly its price, never more than the balance, and can be undone for
 * ten minutes, once. A balance below zero shows as it is ("−10 cr", "earn it back") and buys nothing. The words below
 * that the demo also answers with are the server's own (mall.ts), checked on the same examples.
 */
object MallLine {
    const val TITLE = "Mall"
    /** More's row under the title: what the screen holds. */
    const val MORE_SUB = "Rewards you price in credits; #play, rest and sleep stay free"
    /** While the first read is out, and when it failed with nothing read before. */
    const val LOADING = "Reading the Mall…"
    const val FAILED = "Couldn't read the Mall."
    const val CREDITS = "Credits"
    const val REWARDS = "Rewards"
    const val EMPTY = "No rewards yet. List what you'd like to earn, and give each a price in credits."
    const val ADD = "Add a reward"
    const val ADD_BUTTON = "Add the reward"
    const val ADDING = "Adding…"
    const val WEB_EDITS = "Edit or archive a reward on the web, in You › Mall."
    const val WRITES_OFF = "This server records nothing: Mall changes are recorded only on the live app."
    const val NOT_READY = "The Mall isn't set up on this server yet."
    const val ARCHIVED = "Archived"
    const val CALIBRATING = "calibrating"

    // ── Buying (P19) ───────────────────────────────────────────────────────

    const val BUY = "Buy"
    const val BUYING = "Buying…"
    const val PURCHASES = "Purchases"
    const val UNDO = "Undo"
    const val UNDOING = "Undoing…"
    const val EARN_BACK = "earn it back"
    const val UNDO_MINUTES = 10
    /** The server's words (mall.ts UNDO_TOO_LATE). */
    const val UNDO_TOO_LATE = "Too late to undo: a purchase can be undone for 10 minutes."
    const val PURCHASE_GONE = "That purchase is gone."
    const val REWARD_GONE = "That reward is gone."
    const val BUY_CREDITS_OFF = "Credits aren't counted yet, so nothing can be bought."

    /** Buy is drawn only while credits count (the server sends a wallet) and the reward carries a state; else none at all. */
    fun showsBuy(data: MallData, r: MallReward): Boolean = data.credits != null && r.buy != null

    /** The server says it can be bought now. */
    fun buyable(r: MallReward): Boolean = r.buy?.can == true

    /** The second press's words: "Confirm · 120 cr". */
    fun confirmLabel(r: MallReward): String = "Confirm · ${r.priceLine}"

    /** Why it can't be bought now, in the server's words; null when it can (or no state was sent). */
    fun whyLine(r: MallReward): String? = r.buy?.takeIf { !it.can }?.why

    /** What TalkBack reads for the Buy button: "Buy Takeaway night for 120 cr", or the confirm. */
    fun buyDescription(r: MallReward, armed: Boolean): String = if (armed) "${confirmLabel(r)}: buy ${r.title}" else "Buy ${r.title} for ${r.priceLine}"

    /** The instant a purchase stops being undoable, or null (undone, past it, or not sent). */
    fun undoUntil(p: MallPurchase): Instant? = if (p.refunded) null else p.undoUntil?.let { runCatching { Instant.parse(it) }.getOrNull() }

    /** Undo is offered while its ten minutes last, on [now] (the server checks its own clock again). */
    fun undoOpen(p: MallPurchase, now: Instant): Boolean = undoUntil(p)?.let { !now.isAfter(it) } == true

    /** "until 21:15", Sydney's clock, as the web says it. */
    fun undoUntilLine(p: MallPurchase): String? = undoUntil(p)?.let { "until ${TimeLabels.clock(it, h24 = true)}" }

    /**
     * A purchase's figure: "−120 cr" spent; undone, its price alone ("120 cr"), drawn struck through: it spent and got
     * back the same, so it is never a "+120 cr" that reads as income (as the web's purchase rows).
     */
    fun purchaseFigure(p: MallPurchase): String = if (p.refunded) p.priceLine else "−${p.priceLine}"

    /** What TalkBack reads for one purchase (an undone one says so, since a strike-through isn't read). */
    fun describePurchase(p: MallPurchase): String =
        listOf(p.title, purchaseFigure(p) + if (p.refunded) ", undone" else "", p.line).filter { it.isNotBlank() }.joinToString(". ") + "."

    /**
     * A purchase whose reply was lost keeps its clientId, so a retry of that same attempt is the same purchase (the server
     * writes it once). [knownIds] are the purchases of the reward the Mall listed when the attempt began. Once a later
     * read lists one more of that reward, the lost attempt landed (or the other device bought it meanwhile): the id is
     * done, and a new Buy is a new purchase, never a replay of the first (docs/mobile-api.md `POST /mall/buy`).
     */
    fun keptBuyLanded(rewardId: String, knownIds: Set<String>, data: MallData): Boolean =
        data.purchases.any { it.rewardId == rewardId && it.id !in knownIds }

    /** The purchases of [rewardId] the Mall lists now (what a new attempt remembers as already there). */
    fun purchaseIdsOf(rewardId: String, data: MallData?): Set<String> =
        data?.purchases.orEmpty().filter { it.rewardId == rewardId }.map { it.id }.toSet()

    /** An undo whose reply was lost is settled once a read lists that purchase undone, or no longer lists it as undoable. */
    fun keptUndoSettled(purchaseId: String, data: MallData): Boolean =
        data.purchases.firstOrNull { it.id == purchaseId }?.let { it.refunded || it.undoUntil == null } ?: true

    /** "Tue 27 Oct" for a life day, as the server's dayLabelOf. */
    fun dayLabel(d: LocalDate): String = "${d.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)} ${d.dayOfMonth} ${d.month.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)}"

    /** "Bought Wed 28 Oct at 21:05", "… · undone, 120 cr back" (mall.ts purchasesOf). */
    fun boughtWhen(day: LocalDate, at: Instant, price: Int, refunded: Boolean): String {
        val w = "Bought ${dayLabel(day)} at ${TimeLabels.clock(at, h24 = true)}"
        return if (refunded) "$w · undone, ${WalletLine.figure(price)} ${WalletLine.UNIT} back" else w
    }

    /** "You're at −10 cr: earn it back before you buy." (mall.ts negativeLine) */
    fun negativeLine(balance: Int): String = "You're at ${WalletLine.figure(balance)} ${WalletLine.UNIT}: $EARN_BACK before you buy."

    /** The header's line below zero (mall.ts mallWalletLines). */
    const val NEGATIVE_HEADER = "earn it back: buying waits until you're back at 0"

    /** "Takeaway night costs 120 cr; you have 80 cr (40 cr short)." (mall.ts shortLine) */
    fun shortLine(title: String, price: Int, balance: Int): String =
        "$title costs ${WalletLine.figure(price)} ${WalletLine.UNIT}; you have ${WalletLine.figure(balance)} ${WalletLine.UNIT} (${WalletLine.figure(price - balance)} ${WalletLine.UNIT} short)."

    /** "At most once every 7 days: next on Tue 27 Oct." (mall.ts cooldownRefusal) */
    fun cooldownRefusal(days: Int, next: LocalDate): String =
        (if (days == 1) "At most once a day" else "At most once every $days days") + ": next on ${dayLabel(next)}."

    /** "Takeaway night bought for 120 cr · 1,120 cr left." (mall.ts boughtLine) */
    fun boughtLine(title: String, price: Int, balance: Int): String =
        "$title bought for ${WalletLine.figure(price)} ${WalletLine.UNIT} · ${WalletLine.figure(balance)} ${WalletLine.UNIT} left."

    /** "Takeaway night undone: 120 cr back." (mall.ts undoneLine) */
    fun undoneLine(title: String, price: Int): String = "$title undone: ${WalletLine.figure(price)} ${WalletLine.UNIT} back."

    /** The rewards by category, in the server's categories' order, only the categories that hold one (each in the server's order). */
    fun groups(data: MallData): List<Pair<MallCategory, List<MallReward>>> {
        val known = data.categories.map { it.key }.toSet()
        val listed = data.categories.mapNotNull { c -> data.rewards.filter { it.category == c.key }.takeIf { it.isNotEmpty() }?.let { c to it } }
        // A category an older app doesn't know yet still shows, after the known ones, under the server's label.
        val other = data.rewards.filter { it.category !in known }.groupBy { it.category }.map { (key, list) -> MallCategory(key, list.first().categoryLabel.ifBlank { key }) to list }
        return listed + other
    }

    /** "≈ 2 good days" as a row says it; "price hint: calibrating" without a good day. */
    fun hintText(hint: String): String = if (hint == CALIBRATING) "price hint: calibrating" else hint

    /** A row's line under its name: the hint, then the cooldown ("≈ 3 good days · at most once every 7 days"). */
    fun metaLine(r: MallReward): String = hintText(r.hint) + (r.cooldownLine?.let { " · $it" } ?: "")

    /** "2 rewards", "1 reward". */
    fun count(n: Int): String = if (n == 1) "1 reward" else "$n rewards"

    /** The header's figure: the balance ("1,240 cr"; "−10 cr" below zero), or null while credits are off or unread. */
    fun balance(data: MallData): String? = data.credits?.let { WalletLine.balance(it) }

    /** Below zero (an undone quest took back credits a purchase had spent): shown plainly, and nothing can be bought. */
    fun negative(data: MallData): Boolean = (data.credits?.balance ?: 0) < 0

    /** What TalkBack reads for one reward: its name, price, hint, cooldown and note. */
    fun describe(r: MallReward): String =
        listOfNotNull(r.title, r.priceLine, hintText(r.hint), r.cooldownLine, r.note).joinToString(". ") + "."

    /** "Old game · 30 cr · archived 20 Oct" (Sydney's day, as the web says it). */
    fun archivedLine(r: MallReward): String {
        val on = r.archivedAt?.let { runCatching { Instant.parse(it).atZone(TimeLabels.SYDNEY).format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)) }.getOrNull() }
        return listOfNotNull(r.priceLine, r.categoryLabel.ifBlank { null }, on?.let { "archived $it" }).joinToString(" · ")
    }

    /** A whole number as typed: its digits, with spaces, commas or underscores between them ("1,000"); null otherwise. */
    fun wholeOf(text: String): Int? {
        val s = text.replace(Regex("[\\s,_]"), "")
        if (!Regex("^\\d{1,9}$").matches(s)) return null
        return s.toIntOrNull()
    }

    /** A typed price in the limits' range, or null. */
    fun priceOf(text: String, limits: MallLimits): Int? = wholeOf(text)?.takeIf { it in limits.priceMin..limits.priceMax }

    /**
     * The hint for [price] on [goodDay], by the server's rule (mall.ts priceHint): the price over a good day, to the
     * nearest whole one (a half rounds up, as the web's Math.round), "under half a good day" below a half; "calibrating"
     * without a good day.
     */
    fun hintFor(price: Int, goodDay: MallGoodDay?): String {
        if (goodDay == null || goodDay.credits <= 0) return CALIBRATING
        val r = price.toDouble() / goodDay.credits
        if (r < 0.5) return "under half a good day"
        val n = floor(r + 0.5).toLong()
        return if (n == 1L) "≈ 1 good day" else "≈ ${String.format(Locale.UK, "%,d", n)} good days"
    }

    /** The Add form's line under the price: the live hint ("That's ≈ 2 good days."), or the range while it isn't one. */
    fun formHint(priceText: String, data: MallData): String {
        val p = priceOf(priceText, data.limits) ?: return "Whole credits, ${WalletLine.figure(data.limits.priceMin)} to ${WalletLine.figure(data.limits.priceMax)}."
        val h = hintFor(p, data.goodDay)
        return if (h == CALIBRATING) "Price hint: calibrating." else "That's $h."
    }

    /**
     * Why the Add can't be sent yet, or null: the form's own checks (the server checks every rule again, and says why
     * it refuses: #play, sleep, rest days, a title already listed, in its own words).
     */
    fun addRefusal(title: String, priceText: String, cooldownText: String, noteText: String, data: MallData): String? {
        val l = data.limits
        val t = title.trim()
        return when {
            !data.ready -> NOT_READY
            !data.writesOn -> WRITES_OFF
            data.rewards.size >= l.rewardsMax -> "${l.rewardsMax} rewards is the most: archive one on the web first."
            t.isEmpty() -> "Name the reward."
            t.length > l.titleMax -> "Keep the name to ${l.titleMax} characters."
            priceText.isBlank() -> "Give it a price in credits."
            priceOf(priceText, l) == null -> "A price is a whole number of credits from ${WalletLine.figure(l.priceMin)} to ${WalletLine.figure(l.priceMax)}."
            cooldownText.isNotBlank() && wholeOf(cooldownText)?.takeIf { it in l.cooldownMin..l.cooldownMax } == null ->
                "A cooldown is a whole number of days from ${l.cooldownMin} to ${l.cooldownMax}, or none."
            noteText.trim().length > l.noteMax -> "Keep the note to ${l.noteMax} characters."
            else -> null
        }
    }

    /** After an add: "Takeaway night listed at 120 cr." */
    fun addedLine(title: String, price: Int): String = "${title.trim()} listed at ${WalletLine.figure(price)} ${WalletLine.UNIT}."
}

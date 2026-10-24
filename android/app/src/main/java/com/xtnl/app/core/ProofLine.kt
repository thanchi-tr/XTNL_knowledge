package com.xtnl.app.core

import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.TaskTimer
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The phone's minutes and proof of work (docs/mobile-api.md `/tasks/complete`, `/tasks/start`; blueprint P7 and P23,
 * decisions D20 and D34), in the web's words (src/lib/proof.ts, the drawer's chips). The server decides every count: a
 * tick sends the minutes picked here (or names its timer), and the server clamps them as the web drawer does. This
 * only says what a tap does and what the sheet reads.
 *
 *   A chore still ticks in one tap. A proof row (a deep-work task, `proof` on /check) ticks in one tap once its timer
 *   has run a minute; otherwise its tap opens the minutes sheet, since the server would refuse a full tick with no
 *   minutes and no timer ("Log the minutes"). A timer that ran across 04:00, or past twice the estimate, opens the
 *   sheet too (its Done there counts it): proof.ts timerConfirmOf. A proof row's chips are its estimate's shares
 *   (proof.ts proofMinuteChipsOf), so a long deep-work task can report its time.
 *
 *   The count (proof.ts tickWallOf, life-grade clampMinutes): a timer counts what it ran, at most twice the estimate; a
 *   picked report counts with the drawer's clamp, and the timer is closed counting nothing.
 *
 *   Pages (P24, decision D21): a reading task (`pages` on /check) with a day's target opens the sheet at its page chips
 *   (the target picked): the server refuses a full tick with fewer pages ("Log the pages"). Without a target its pages
 *   are optional and it ticks in one tap. The pages are recorded, never priced; the minimum version needs none.
 */
object ProofLine {
    /** The minute chips (the web drawer's MINUTE_CHIPS), on every row but a proof one. */
    val CHIPS: List<Int> = listOf(10, 20, 30, 45, 60, 90)

    /** A proof row's chips, as shares of its estimate (proof.ts PROOF_CHIP_SHARES): half to twice it. */
    val PROOF_SHARES: List<Double> = listOf(0.5, 0.75, 1.0, 1.25, 1.5, 2.0)

    /**
     * The sheet's minute chips: a proof row's are its estimate's shares to the nearest 5 minutes, at least 5 and at most
     * 480, each once (proof.ts proofMinuteChipsOf: 45, 70, 90, 115, 135, 180 for 90); every other row's the fixed ones.
     */
    fun chips(estimate: Int?, proof: Boolean): List<Int> {
        if (!proof) return CHIPS
        val e = estimate?.takeIf { it > 0 } ?: 30
        // JavaScript's Math.round (half up), as the web rounds.
        return PROOF_SHARES.map { f -> min(MINUTES_MAX, max(5, Math.floor(f * e / 5 + 0.5).toInt() * 5)) }.distinct()
    }

    /** Nothing counts past this (life-grade REPORTED_MINUTES_MAX). */
    const val MINUTES_MAX = 480

    /** The sheet's line on a proof row with no minutes picked and no timer run. */
    const val NEEDS_MINUTES = "Deep work counts its time: pick the minutes it took, or start its timer."

    /** P7: on a Yesterday row, which has no timer, the same line without one. */
    const val NEEDS_MINUTES_PICKED = "Deep work counts its time: pick the minutes it took."

    /** What a tap on a row does. */
    enum class Tap {
        /** A tick at the estimate, in one tap (every row but a proof one). */
        TICK,
        /** A proof row whose timer has run: the tick counts the timer. */
        TIMER,
        /** A proof row with no timer run: the minutes sheet opens. */
        SHEET,
    }

    /** What a tap does on [t]; [today] (/check's `day`) tells a timer that ran across 04:00. */
    fun tapOf(t: TaskItem, now: Instant, today: String? = null): Tap = when {
        t.pages?.target != null -> Tap.SHEET
        !t.proof -> Tap.TICK
        t.timer != null && timerMinutes(t.timer, now) >= 1 && timerAsk(t.timer, today, t.minutes, now) == null -> Tap.TIMER
        else -> Tap.SHEET
    }

    /** A timer still running from yesterday (across 04:00): its tap asks first (proof.ts TIMER_CROSSED). */
    const val TIMER_CROSSED = "Its timer ran across the 04:00 turn. Check its minutes before you count them."

    /** A timer past twice its estimate (proof.ts timerOverLineOf). */
    fun timerOverLine(minutes: Int, cap: Int): String =
        "Its timer ran $minutes min, more than twice its estimate: was it left running? Done counts at most $cap; pick the minutes it took otherwise."

    /**
     * Why a timer's tap asks first instead of counting in one tap (proof.ts timerConfirmOf): it started on another day
     * than [today] (it ran across 04:00), or it ran past twice the estimate. Null: one tap counts it.
     */
    fun timerAsk(t: TaskTimer, today: String?, estimate: Int?, now: Instant): String? {
        if (t.day != null && today != null && t.day != today) return TIMER_CROSSED
        val m = timerMinutes(t, now)
        val cap = min(MINUTES_MAX, 2 * max(1, estimate ?: 30))
        return if (m > cap) timerOverLine(m, cap) else null
    }

    private fun instantOrNull(s: String?): Instant? = s?.let { runCatching { Instant.parse(it) }.getOrNull() }

    /** A timer's whole minutes at [now]: its earlier segments, then the latest to its stop (or now), 0..480 (proof.ts timerMinutesOf). */
    fun timerMinutes(t: TaskTimer, now: Instant): Int {
        val from = instantOrNull(t.startedAt) ?: return 0
        val end = instantOrNull(t.endedAt) ?: now
        val m = min(MINUTES_MAX.toLong(), max(0L, Math.floorDiv(end.toEpochMilli() - from.toEpochMilli(), 60_000L)))
        return min(MINUTES_MAX.toLong(), max(0, t.priorMinutes) + m).toInt()
    }

    /** The timer's words: "Timer 12 min" while it runs, "Timed 1 h 05" once stopped (proof.ts timerLabelOf). */
    fun timerLabel(t: TaskTimer, now: Instant): String {
        val m = timerMinutes(t, now)
        val text = if (m >= 60) "${m / 60} h ${(m % 60).toString().padStart(2, '0')}" else "$m min"
        return (if (t.endedAt != null) "Timed " else "Timer ") + text + if (m >= MINUTES_MAX) "+" else ""
    }

    /**
     * What a report counts as, by the web drawer's clamp (life-grade clampMinutes, the server's own): between half and
     * twice the row's estimate, at least 1 and never past 480. 30 reported as 90 counts 60.
     */
    fun counted(reported: Int, estimate: Int): Int {
        val e = max(1, estimate)
        val lo = max(1.0, 0.5 * e)
        val hi = min(MINUTES_MAX.toDouble(), 2.0 * e)
        return reported.toDouble().coerceIn(lo, hi).roundToInt()
    }

    /** What a timer's count counts (life-grade clampMinutes with the timer as its wall): what it ran, at most twice the estimate, at least 1. */
    fun countedTimer(timed: Int, estimate: Int): Int = max(1, min(counted(timed, estimate), timed))

    /**
     * The sheet's Done button: "Done · 45 min", "Done · timer 12 min" or, with neither on a proof row, "Pick the minutes".
     * A reading task's (P24): "Done · 30 pages" (with its minutes when picked), or "Pick the pages" while it still needs them.
     */
    fun doneLabel(minutes: Int?, timerMinutes: Int?, proof: Boolean, estimate: Int?, pages: Int? = null, pagesNeeded: Boolean = false): String {
        val timed = timerMinutes != null && timerMinutes >= 1
        if (pagesNeeded) return "Pick the pages"
        if (pages != null) {
            return when {
                minutes != null -> "Done · ${pagesLabel(pages)} · $minutes min"
                proof && timed -> "Done · ${pagesLabel(pages)} · timer $timerMinutes min"
                proof -> "Pick the minutes"
                else -> "Done · ${pagesLabel(pages)}"
            }
        }
        return when {
            minutes != null -> "Done · $minutes min"
            timed -> "Done · timer $timerMinutes min"
            proof -> "Pick the minutes"
            estimate != null -> "Done · ~$estimate min"
            else -> "Done"
        }
    }

    // ── Pages (P24) ─────────────────────────────────────────────────────────

    /** The most pages one tick records (proof.ts PAGES_QTY_MAX; the server refuses more, 400). */
    const val PAGES_MAX = 2000

    /** Without a target, the page chips (proof.ts PAGE_CHIPS_FREE). */
    val FREE_PAGE_CHIPS: List<Int> = listOf(10, 20, 30, 50)

    /** The page chips: the day's target, half as much again and twice it, never below it (proof.ts pageChipsOf). */
    fun pageChips(target: Int?): List<Int> =
        if (target == null) FREE_PAGE_CHIPS else listOf(target, ceil(target * 1.5).toInt(), target * 2).map { min(PAGES_MAX, it) }.distinct()

    /** "30 pages", "1 page" (proof.ts pagesLabelOf). */
    fun pagesLabel(n: Int): String = "$n page" + if (n == 1) "" else "s"

    /** A reading row's meta bit: "log 30 pages", or "log the pages" with no target (proof.ts pagesRowNoteOf). */
    fun pagesNote(target: Int?): String = target?.let { "log ${pagesLabel(it)}" } ?: "log the pages"

    /** Does a reading task's full tick still need its pages: a day's target, and none or fewer picked. */
    fun needsPages(t: TaskItem, picked: Int?): Boolean = t.pages?.target?.let { picked == null || picked < it } ?: false

    /** The sheet's line while it does. */
    fun needsPagesLine(target: Int): String = "A reading task counts its pages: pick how many you read, at least ${pagesLabel(target)}."

    /** The server's refusal of a full tick with [pages] against the day's [target] (proof.ts pagesRefusalOf), or null when it passes. */
    fun pagesRefusal(target: Int?, pages: Int?): String? = when {
        target == null -> null
        pages == null -> "Log the pages: a full tick of this one takes at least ${pagesLabel(target)}. Pick the pages you read."
        pages < target -> "Log the pages: ${pagesLabel(pages)} is below the day's $target. A full tick takes at least ${pagesLabel(target)}."
        else -> null
    }

    /** Under the chips: what a picked report counts ("Counts 60 of the 90 you picked: twice its estimate at most."), else null. */
    fun countsLine(minutes: Int?, estimate: Int?): String? {
        if (minutes == null || estimate == null) return null
        val c = counted(minutes, estimate)
        return when {
            c == minutes -> null
            c < minutes -> "Counts $c of the $minutes you picked: twice its estimate at most."
            else -> "Counts $c: half its estimate at least."
        }
    }

    /** Under the chips with no minutes picked and a timer run: what its count counts when the clamp moves it, else null. */
    fun timerCountsLine(timed: Int, estimate: Int?): String? {
        if (estimate == null || timed < 1) return null
        val c = countedTimer(timed, estimate)
        return if (c < timed) "Counts $c of the timer's $timed: twice its estimate at most." else null
    }

    /** With a timer open, picked minutes are the report: the timer is closed counting nothing (the server's rule, said before the tap). */
    const val PICKED_OVER_TIMER = "The minutes you picked count instead of its timer's."
}

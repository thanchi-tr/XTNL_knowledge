package com.xtnl.app.feel

import com.xtnl.app.core.HapticScore.Beat
import com.xtnl.app.core.HapticScore.CLICK
import com.xtnl.app.core.HapticScore.LOW_TICK
import com.xtnl.app.core.HapticScore.THUD
import com.xtnl.app.core.HapticScore.TICK
import kotlin.math.min

/**
 * Each moment's haptic score (the motion spec's §3 tables), as absolute times
 * from its trigger: LOW_TICK and TICK for accrual, CLICK for impact, THUD for
 * a weighty stamp, at most four beats. Pure, so the scores can be tested;
 * [Feel] plays them.
 */
object Scores {
    /** A task's tick: the CLICK at 0 climbs with the ladder; the bank beats land on the motes' arrivals. */
    fun tickBank(step: Int, motes: Int, firstMs: Int, lastMs: Int): List<Beat> = buildList {
        if (motes >= 5) add(Beat(LOW_TICK, 0.20f, firstMs))
        add(if (step >= 5) Beat(CLICK, 0.60f, lastMs) else Beat(TICK, 0.30f + 0.04f * step, lastMs))
    }

    fun tickClick(step: Int): Beat = Beat(CLICK, min(0.55f + 0.05f * step, 0.80f), 0)

    /** Without motes (Calm, no target): the mark completing is the second beat. */
    val tickMark = Beat(TICK, 0.30f, 160)

    /** A failed tick or work item: a soft double. */
    val failed = listOf(Beat(LOW_TICK, 0.45f, 0), Beat(LOW_TICK, 0.30f, 100))

    fun boardClear(calm: Boolean): List<Beat> = if (calm) {
        listOf(Beat(CLICK, 0.70f, 120), Beat(TICK, 0.40f, 210))
    } else {
        listOf(Beat(LOW_TICK, 0.35f, 0), Beat(TICK, 0.50f, 100), Beat(CLICK, 0.80f, 220), Beat(TICK, 0.40f, 310))
    }

    /** A right answer: the CLICK by tier, a TICK on the first point's arrival (unless a level up follows), a CLICK at a milestone. */
    fun correct(tier: Int, firstArrivalMs: Int?, bigMoment: Boolean, levelUp: Boolean): List<Beat> = buildList {
        add(Beat(CLICK, min(0.60f + 0.05f * tier, 0.80f), 0))
        if (firstArrivalMs != null && !levelUp) add(Beat(TICK, 0.35f, firstArrivalMs))
        if (bigMoment) add(Beat(CLICK, 0.80f, 280))
    }

    fun correctCalm(): List<Beat> = listOf(Beat(CLICK, 0.65f, 0), Beat(TICK, 0.35f, 160))

    fun miss(retry: Boolean): List<Beat> = buildList {
        add(Beat(LOW_TICK, 0.45f, 0))
        add(Beat(LOW_TICK, 0.30f, 100))
        if (retry) add(Beat(LOW_TICK, 0.20f, 540))
    }

    /** A card's mastery level: three notches, then the close (L = 0). */
    val forgeCard = listOf(Beat(TICK, 0.35f, 0), Beat(TICK, 0.45f, 100), Beat(TICK, 0.55f, 200), Beat(CLICK, 0.85f, 300))

    /** The character's level (T = the last mote's arrival): the sweep's flash, the forge, the close at 500. */
    val forgeCharacter = listOf(Beat(TICK, 0.40f, 160), Beat(TICK, 0.45f, 300), Beat(TICK, 0.55f, 400), Beat(CLICK, 1.0f, 500))

    /** Session complete (S = 0): the seal's contact, the X's parts, and the last lit part (a CLICK for a perfect run). */
    fun session(perfect: Boolean, lastLitMs: Int): List<Beat> = listOf(
        Beat(THUD, 0.70f, 200), Beat(TICK, 0.40f, 300), Beat(TICK, 0.45f, 460),
        if (perfect) Beat(CLICK, 0.90f, 620) else Beat(TICK, 0.50f, lastLitMs),
    )

    /** A new idea's seal: the stamp's contact (from R). */
    val ideaStamp = listOf(Beat(CLICK, 0.70f, 180))

    /** The seal lands on Review (from A). */
    val land = listOf(Beat(CLICK, 0.75f, 0), Beat(TICK, 0.35f, 60))

    val merged = listOf(Beat(TICK, 0.40f, 200))
    val duplicate = listOf(Beat(LOW_TICK, 0.30f, 160))
    val ideaFailed = listOf(Beat(LOW_TICK, 0.30f, 0), Beat(LOW_TICK, 0.25f, 90))

    /** A work item's Done: crisper and lighter than a task. */
    val work = listOf(Beat(CLICK, 0.50f, 0), Beat(TICK, 0.25f, 150))

    /** A Mall purchase (blueprint P19): the CLICK of the Confirm, then the burn cooling in three fading beats. */
    val burn = listOf(Beat(CLICK, 0.65f, 0), Beat(TICK, 0.45f, 110), Beat(TICK, 0.32f, 230), Beat(LOW_TICK, 0.22f, 360))
}

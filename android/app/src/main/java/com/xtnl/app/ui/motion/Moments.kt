package com.xtnl.app.ui.motion

import kotlin.math.max
import kotlin.math.min

/*
 * The moments' numbers, pure (docs: the motion spec, §3). Escalation is by
 * count, never by length: the tick ladder's step and the combo's tier scale
 * how many particles and motes, how fast and how loud, and the top rung holds.
 */

/** A due task checked (moment 1). Times are ms from the release frame T. */
object TickMoment {
    const val IMPACT = 56
    const val MOTES_AT = 80
    const val MOTE_STAGGER = 20
    const val FIRST_ARRIVAL = MOTES_AT + Dur.MOTE
    /** Without motes, the mark completes here (the second beat). */
    const val MARK_DONE = 160
    /** The run lapses this long after the last tick (TickLadder.RUN_MS); the beads fade in reverse. */
    const val BEAD_FADE_STAGGER = 80

    fun streaks(step: Int): Int = 6 + step.coerceIn(0, 5)
    fun speedScale(step: Int): Float = 1f + 0.06f * step.coerceIn(0, 5)
    fun startAngle(step: Int): Float = 13f * step.coerceIn(0, 5)
    fun shockRadiusDp(step: Int): Float = 30f + 1.5f * step.coerceIn(0, 5)
    /** From step 3, 30% of the streaks are spinning xp stars. */
    fun sparkShare(step: Int): Float = if (step >= 3) 0.3f else 0f

    /** Motes per tick: 3 + step (at most 8); the minimum (MVV) sends half, at least 2. */
    fun motes(step: Int, mvv: Boolean): Int {
        val n = min(3 + step.coerceAtLeast(0), 8)
        return if (mvv) max(2, n / 2) else n
    }

    /** Mote k's arrival (ms from T): the first at 400, then every 20 ms; the last by 540. */
    fun arrival(k: Int): Int = FIRST_ARRIVAL + MOTE_STAGGER * k

    fun clickScale(step: Int): Float = min(0.55f + 0.05f * step.coerceAtLeast(0), 0.80f)
    fun bankScale(step: Int): Float = 0.30f + 0.04f * step.coerceIn(0, 5)
}

/**
 * Board clear (moment 2). B waits for the triggering tick's motes to land: cause, then effect. The banner is
 * inserted at B, so the rows below glide down with the roll call; it fades in from B + 120, as they come to rest,
 * and its seal stamps from there to the contact.
 */
object BoardMoment {
    const val BANNER_AT = 0
    const val BANNER_FADE = 120
    const val CONTACT = 220
    const val WAVE_STAGGER = 30
    const val WAVE_MAX = 6
    /** Without motes, B is at least this long after the tick. */
    const val NO_MOTES = 300

    /** B, as an uptime: the later of the event and the tick's last mote (or T + 300 without motes). */
    fun start(eventAt: Long, tickAt: Long?, lastArrivalAt: Long?): Long = when {
        lastArrivalAt != null -> max(eventAt, lastArrivalAt)
        tickAt != null -> max(eventAt, tickAt + NO_MOTES)
        else -> eventAt
    }

    /** The roll call: the [WAVE_MAX] kept rows nearest [origin] (by list index), each with its delay. */
    fun wave(origin: Int, kept: List<Int>): List<Pair<Int, Int>> =
        kept.sortedBy { kotlin.math.abs(it - origin) }.take(WAVE_MAX).map { it to WAVE_STAGGER * kotlin.math.abs(it - origin) }
}

/** A right answer (moment 4). Tiers by comboNext: T0 ≤ 1, T1 2–3, T2 4–5, T3 ≥ 6. */
object ComboMoment {
    const val POINTS_AT = 200
    const val POINTS_STAGGER = 28
    const val COMBO_AT = 240

    fun tier(combo: Int): Int = when {
        combo <= 1 -> 0
        combo <= 3 -> 1
        combo <= 5 -> 2
        else -> 3
    }

    fun streaks(tier: Int): Int = 8 + 2 * tier.coerceIn(0, 3)
    fun pointMotes(tier: Int): Int = 1 + tier.coerceIn(0, 3)
    fun chipImpulse(tier: Int): Float = floatArrayOf(4f, 6f, 9f, 12f)[tier.coerceIn(0, 3)]
    fun clickScale(tier: Int): Float = min(0.60f + 0.05f * tier, 0.80f)
    fun firstArrival(): Int = POINTS_AT + Dur.MOTE
    fun milestone(combo: Int): Boolean = combo == 10 || combo == 20 || combo == 30

    /** The node-X's lit parts at a combo: ×2 node A, ×3 A→B, ×4 node B, ×5 D→S, ×6 the spark (and above). */
    fun parts(combo: Int): Int = when {
        combo >= 6 -> NodeParts.ALL
        combo == 5 -> NodeParts.A or NodeParts.AB or NodeParts.B or NodeParts.D or NodeParts.DS
        combo == 4 -> NodeParts.A or NodeParts.AB or NodeParts.B
        combo == 3 -> NodeParts.A or NodeParts.AB
        combo == 2 -> NodeParts.A
        else -> 0
    }
}

/** The node-X's six parts as bits, in the order they light. */
object NodeParts {
    const val A = 1
    const val AB = 2
    const val B = 4
    const val D = 8
    const val DS = 16
    const val SPARK = 32
    const val ALL = 63
    const val COUNT = 6

    fun has(mask: Int, part: Int): Boolean = mask and part != 0
}

/** Session complete (moment 7): an honest X, by accuracy. */
object SessionMoment {
    /** Below .5 only node A; from .5 A, A→B and B; from .8 also D and D→S; every card recalled, also the spark. */
    fun parts(accuracy: Float, perfect: Boolean): Int {
        var m = NodeParts.A
        if (accuracy >= 0.5f) m = m or NodeParts.AB or NodeParts.B
        if (accuracy >= 0.8f) m = m or NodeParts.D or NodeParts.DS
        if (perfect) m = m or NodeParts.SPARK
        return m
    }

    /** When each part lights (ms from S): A 300, A→B 300–460, B 460, D 420, D→S 420–580, spark 620. */
    fun lastLit(parts: Int): Int = when {
        NodeParts.has(parts, NodeParts.SPARK) -> 620
        NodeParts.has(parts, NodeParts.DS) -> 580
        NodeParts.has(parts, NodeParts.B) -> 460
        else -> 300
    }

    fun earned(perfect: Boolean, questDone: Boolean, accuracy: Float): Boolean = perfect || questDone || accuracy >= 0.8f
    fun shards(accuracy: Float): Int = min(24, (12 + 12 * accuracy).toInt())
    /** SEAL plays honestly: one note under .5, two from .5, three for a perfect run. */
    fun notes(accuracy: Float, perfect: Boolean): Int = when {
        perfect -> 3
        accuracy >= 0.5f -> 2
        else -> 1
    }
}

/** New idea filing (moment 8): a stage every 1.4 s, the last one holds. */
object FilingMoment {
    const val STAGE_MS = 1400
    val STAGES = listOf("Reading your idea", "Finding its field", "Checking it isn't a twin", "Filing it")

    fun stage(elapsedMs: Long): Int = (elapsedMs / STAGE_MS).toInt().coerceIn(0, STAGES.lastIndex)
    fun showSeconds(elapsedMs: Long): Boolean = elapsedMs >= 3_000
    fun slow(elapsedMs: Long): Boolean = elapsedMs >= 10_000
}

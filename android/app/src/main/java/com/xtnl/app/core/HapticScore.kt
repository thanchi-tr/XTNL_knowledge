package com.xtnl.app.core

import kotlin.math.max

/**
 * A moment's haptics as a score: at most [MAX_BEATS] beats, each a primitive
 * at a scale and an absolute time from the moment's trigger. The engine
 * (feel/Feel.kt) turns a score into one VibrationEffect composition, whose
 * primitives take delays: this file is that arithmetic, pure so it can be
 * tested. The primitive ids are VibrationEffect.Composition's own.
 *
 *   sorted by time:  delay = max(0, at − cursor);  cursor = max(at, cursor) + duration
 *
 * Beats of overlapping moments merge into one composition: beats under
 * [MERGE_MS] apart become one (the stronger wins).
 */
object HapticScore {
    const val CLICK = 1
    const val THUD = 2
    const val QUICK_RISE = 4
    const val QUICK_FALL = 6
    const val TICK = 7
    const val LOW_TICK = 8

    /** VibrationEffect's predefined effects, for a motor without primitives. */
    const val EFFECT_CLICK = 0
    const val EFFECT_DOUBLE_CLICK = 1
    const val EFFECT_TICK = 2
    const val EFFECT_HEAVY_CLICK = 5

    const val MAX_BEATS = 4
    const val MERGE_MS = 40

    data class Beat(val prim: Int, val scale: Float, val atMs: Int)

    /** One primitive of the composition: what, how strong, and how long after the previous one ends. */
    data class Step(val prim: Int, val scale: Float, val delayMs: Int)

    /** Measured primitive lengths (ms) for API 30, which has no getPrimitiveDurations. */
    val MEASURED_MS = mapOf(CLICK to 12, THUD to 40, QUICK_RISE to 150, QUICK_FALL to 80, TICK to 6, LOW_TICK to 12)

    /** The moment's strongest [MAX_BEATS] beats (the earlier on a tie), back in time order. */
    fun cap(beats: List<Beat>): List<Beat> =
        if (beats.size <= MAX_BEATS) beats.sortedBy { it.atMs }
        else beats.sortedWith(compareByDescending<Beat> { it.scale }.thenBy { it.atMs }).take(MAX_BEATS).sortedBy { it.atMs }

    /** Beats under [MERGE_MS] apart become one, at the first one's time; the stronger primitive and scale win. */
    fun merge(beats: List<Beat>): List<Beat> {
        val out = ArrayList<Beat>(beats.size)
        for (b in beats.sortedBy { it.atMs }) {
            val last = out.lastOrNull()
            if (last != null && b.atMs - last.atMs < MERGE_MS) {
                out[out.lastIndex] = if (b.scale > last.scale) b.copy(atMs = last.atMs) else last
            } else {
                out += b
            }
        }
        return out
    }

    /**
     * The primitive a motor plays in [prim]'s place: itself when supported, else LOW_TICK → TICK at 0.7,
     * THUD → CLICK; the rises and falls are dropped. Null: nothing to play.
     */
    fun substitute(b: Beat, supported: (Int) -> Boolean): Beat? = when {
        supported(b.prim) -> b
        b.prim == LOW_TICK && supported(TICK) -> b.copy(prim = TICK, scale = b.scale * 0.7f)
        b.prim == THUD && supported(CLICK) -> b.copy(prim = CLICK)
        else -> null
    }

    /** A motor that plays neither CLICK nor TICK gets one predefined effect instead (the moment's strongest beat). */
    fun needsPredefined(supported: (Int) -> Boolean): Boolean = !supported(CLICK) && !supported(TICK)

    /**
     * The composition: [beats] at their times (ms from now), substituted for [supported], merged, as steps.
     * [cursor] is when the motor is free (a primitive still playing): nothing starts before it.
     */
    fun compose(beats: List<Beat>, supported: (Int) -> Boolean, durationOf: (Int) -> Int, cursor: Int = 0): List<Step> {
        var at = cursor
        val out = ArrayList<Step>()
        for (b in merge(beats.mapNotNull { substitute(it, supported) })) {
            val delay = max(0, b.atMs - at)
            out += Step(b.prim, b.scale.coerceIn(0f, 1f), delay)
            at = max(b.atMs, at) + durationOf(b.prim)
        }
        return out
    }

    /** The strongest beat (the first on a tie): what a predefined fallback plays. */
    fun strongest(beats: List<Beat>): Beat? = beats.maxWithOrNull(compareBy<Beat> { weight(it) }.thenByDescending { it.atMs })

    private fun weight(b: Beat): Float = b.scale * when (b.prim) { THUD -> 1.2f; CLICK -> 1f; TICK -> 0.6f; LOW_TICK -> 0.5f; else -> 0.4f }

    /** The predefined effect for a beat: a heavy click for a thud or a strong click, a tick for the ticks. */
    fun predefined(b: Beat): Int = when (b.prim) {
        THUD -> EFFECT_HEAVY_CLICK
        CLICK -> if (b.scale >= 0.85f) EFFECT_HEAVY_CLICK else EFFECT_CLICK
        else -> EFFECT_TICK
    }
}

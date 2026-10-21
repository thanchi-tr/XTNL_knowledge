package com.xtnl.app.core

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * The tick's rising pluck, the same ladder as the web's celebrate.ts:
 * a major pentatonic from E5 to its octave (E F♯ G♯ B C♯ E, in semitones
 * 0 2 4 7 9 12). A tick within [RUN_MS] of the last climbs one step (held at
 * the top); a longer gap starts again at the root. The six rungs are the
 * header seal's six beads, and the step scales the tick's moment (particles,
 * motes, pitch, haptic).
 */
object TickLadder {
    val STEPS = intArrayOf(0, 2, 4, 7, 9, 12)
    const val RUN_MS = 90_000L
    const val ROOT_HZ = 659.26

    data class Run(val atMs: Long, val step: Int)

    /** Where the next tick sits: one step up within RUN_MS of the last, else the root. */
    fun next(prev: Run?, nowMs: Long): Run {
        if (prev == null || nowMs < prev.atMs || nowMs - prev.atMs > RUN_MS) return Run(nowMs, 0)
        return Run(nowMs, min(prev.step + 1, STEPS.size - 1))
    }

    /**
     * An undo takes its rung back: one step down, the run's clock unchanged (it still lapses [RUN_MS] after the
     * last tick); undoing the root ends the run.
     */
    fun back(run: Run?): Run? = when {
        run == null || run.step <= 0 -> null
        else -> run.copy(step = run.step - 1)
    }

    /** The pluck's fundamental at a ladder step (clamped to the ladder). */
    fun frequency(step: Int): Double {
        val i = max(0, min(STEPS.size - 1, step))
        return ROOT_HZ * 2.0.pow(STEPS[i] / 12.0)
    }
}

package com.xtnl.app.ui.motion

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.staticCompositionLocalOf
import com.xtnl.app.data.MotionChoice
import com.xtnl.app.feel.Feel
import kotlin.math.roundToInt

/**
 * How much moves. Full: every effect (springs, particles, the seal's
 * flight). Calm: short fades and settles, no particles or flights. Still:
 * nothing animates; every state is shown at rest. The system's "Remove
 * animations" (animator duration scale 0) always means Still.
 *
 * Calm keeps every sound, haptic and change of information, told in fades
 * and settles of 200 ms or less: travel is halved, a scale changes by 2% at
 * most, and there are no hold frames, particles, flights, sweeps or loops.
 */
enum class MotionLevel {
    FULL, CALM, STILL;

    val particles: Boolean get() = this == FULL
    val moves: Boolean get() = this != STILL

    companion object {
        fun of(choice: MotionChoice, systemScale: Float): MotionLevel = when {
            systemScale == 0f -> STILL
            choice == MotionChoice.STILL -> STILL
            choice == MotionChoice.CALM -> CALM
            else -> FULL
        }

        fun systemScale(context: Context): Float = runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        }.getOrDefault(1f)
    }
}

val LocalMotion = staticCompositionLocalOf { MotionLevel.FULL }
val LocalFeel = staticCompositionLocalOf<Feel?> { null }

/**
 * The web's motion tokens (tokens.css: press 90 · quick 160 · base 240 · slow 420), and the deed grammar's:
 * an impact peaks at [PEAK] (7 frames at 120 Hz), holds a few frames, then settles on a spring.
 */
object Dur {
    const val PRESS = 90
    const val QUICK = 160
    const val BASE = 240
    const val SLOW = 420
    const val PEAK = 56
    /** Hit-stop, in frames: a micro moment (a tick, a correct answer) and a macro one (a seal, a level). */
    const val HOLD_MICRO = 3
    const val HOLD_MACRO = 4
    const val MOTE = 320
    /** Tuned on the Fold 8 with a 960 fps capture: a timed beat is sent this early so it lands on its frame. */
    const val HAPTIC_LEAD_MS = 10
    /** SoundPool's output latency: a timed sound starts this early. (A tap's pluck plays at 0 and lands on the 56 ms peak.) */
    const val AUDIO_LEAD_MS = 40
}

/** A flight's length for its distance: 300 ms + 0.3 ms per dp, within 360–520 ms. */
fun flightMs(distanceDp: Float): Int = (300f + 0.3f * distanceDp).coerceIn(360f, 520f).roundToInt()

/** --ease-out, --ease-inout and --ease-stamp (the last kept only for legacy floaters). */
val EaseOut = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)
val EaseInOut = CubicBezierEasing(0.65f, 0f, 0.35f, 1f)
val EaseStamp = CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f)
/** A stamp's up-stroke: ends at zero velocity, so the peak has no jump. */
val EaseOutCubic = CubicBezierEasing(0.33f, 1f, 0.68f, 1f)
/** Exits, drains, falling stamps. */
val EaseIn = CubicBezierEasing(0.3f, 0f, 1f, 1f)
/** Marks, strokes, edges. */
val EaseDraw = CubicBezierEasing(0.3f, 0f, 0.2f, 1f)
/** A mote: a small wind-up, then an accelerating suction into its target. */
val MoteEase = CubicBezierEasing(0.45f, -0.3f, 0.75f, 0.45f)

/**
 * The spring tokens (mass 1): a damping ratio ζ and a stiffness k. Content and layout move only on ζ ≥ 0.8;
 * the bouncier ones are for rewards.
 */
class Spr private constructor(val damping: Float, val stiffness: Float) {
    fun <T> spec(visibilityThreshold: T? = null): SpringSpec<T> = spring(damping, stiffness, visibilityThreshold)

    companion object {
        /** A press: about 100 ms. */
        val press = Spr(1f, 1500f)
        /** A micro stamp's settle after its hold: one dip of about 3%, settled by about 280 ms. */
        val stamp = Spr(0.45f, 900f)
        /** Level and seal settles, about 420 ms. */
        val stampBig = Spr(0.42f, 600f)
        /** Started with an impulse (initialVelocity = velocity + v0): peak ≈ 1 + 0.019·v0 at about 41 ms. */
        val bump = Spr(0.45f, 900f)
        /** Content enters, about 256 ms. */
        val settle = Spr(0.8f, 380f)
        /** Pills, item placement, panes: about 170 ms with no visible overshoot. */
        val glide = Spr(0.9f, 700f)
        /** Alpha and colour. */
        val fx = Spr(1f, 1600f)
        /** Small node and bead pops. */
        val bead = Spr(0.4f, 900f)
        /** A head-shake, started with an impulse. */
        val shake = Spr(0.3f, 1100f)
        /** The tab pill's leading and trailing edges: it stretches toward the new tab, then gathers. */
        val pillLead = Spr(0.8f, 900f)
        val pillTrail = Spr(0.8f, 400f)
        /** A work item's Done settles crisper than a task. */
        val workStamp = Spr(0.5f, 900f)
    }
}

/** A spring token at this level: as tuned in Full, critically damped and 1.3× stiffer in Calm, a snap in Still. */
fun <T> MotionLevel.spr(s: Spr, visibilityThreshold: T? = null): FiniteAnimationSpec<T> = when (this) {
    MotionLevel.FULL -> spring(s.damping, s.stiffness, visibilityThreshold)
    MotionLevel.CALM -> spring(1f, s.stiffness * 1.3f, visibilityThreshold)
    MotionLevel.STILL -> snap()
}

/** A tween that is shorter in Calm and a snap in Still. */
fun <T> MotionLevel.tweenOf(ms: Int, delay: Int = 0): FiniteAnimationSpec<T> = when (this) {
    MotionLevel.FULL -> tween(ms, delay, EaseOut)
    MotionLevel.CALM -> tween((ms * 0.7f).toInt(), (delay * 0.5f).toInt(), EaseOut)
    MotionLevel.STILL -> snap()
}

/** A list item's fade in or out ([spec], by default animateItem's own), or none in Still: an item just appears or goes. */
fun MotionLevel.fade(spec: FiniteAnimationSpec<Float> = spring(stiffness = Spring.StiffnessMediumLow)): FiniteAnimationSpec<Float>? =
    if (moves) spec else null

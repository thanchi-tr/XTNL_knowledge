package com.xtnl.app.ui.motion

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.hypot
import kotlin.math.min

/*
 * The motion kit: the deed grammar's few moves, shared by every moment.
 * Animated values are read only in draw lambdas and graphicsLayer {}, so a
 * moment redraws its few pixels and never recomposes the screen.
 */

/** Hit-stop: waits [n] frames (the element holds its peak while everything else keeps moving). */
suspend fun holdFrames(n: Int) = repeat(n) { withFrameNanos { } }

/**
 * A stamp: up to [peak] in [upMs] ([ease]; EaseOutCubic ends at zero velocity), a [hold] of a few frames,
 * then [rest] on the [settle] spring. A falling stamp starts above its rest (snapTo(1.5f)) and comes down
 * with EaseIn to just under it.
 */
suspend fun Animatable<Float, AnimationVector1D>.stamp(
    peak: Float,
    upMs: Int = Dur.PEAK,
    hold: Int = Dur.HOLD_MICRO,
    ease: Easing = EaseOutCubic,
    settle: Spr = Spr.stamp,
    rest: Float = 1f,
) {
    animateTo(peak, tween(upMs, easing = ease))
    holdFrames(hold)
    animateTo(rest, settle.spec())
}

/** A bump: an impulse [v0] (per second) into the bump spring from wherever it is. Peak ≈ 1 + 0.019·v0 at about 41 ms. */
suspend fun Animatable<Float, AnimationVector1D>.bump(v0: Float, motion: MotionLevel = MotionLevel.FULL) {
    when (motion) {
        MotionLevel.FULL -> animateTo(1f, Spr.bump.spec(), initialVelocity = velocity + v0)
        // Calm: a scale changes by 2% at most, critically damped.
        MotionLevel.CALM -> animateTo(1f, motion.spr(Spr.bump), initialVelocity = velocity + min(v0, 5f))
        MotionLevel.STILL -> snapTo(1f)
    }
}

/**
 * A scale that bumps each time [key] changes (0 never bumps): read it only inside graphicsLayer, so a bump
 * redraws a layer and recomposes nothing. A new bump starts from the running one's velocity.
 */
@Composable
fun rememberBump(key: Int, v0: Float): () -> Float {
    val motion by rememberUpdatedState(LocalMotion.current)
    val current by rememberUpdatedState(key)
    val a = remember { Animatable(1f) }
    LaunchedEffect(a) {
        var last = current
        snapshotFlow { current }.collect { k ->
            if (k == last) return@collect
            last = k
            if (k == 0 || !motion.moves) return@collect
            launch { a.bump(v0, motion) }
        }
    }
    return { a.value }
}

/**
 * A figure that counts up to [target] (from [from]) in [durMs] after [delayMs], each time [key] changes:
 * only this Text recomposes per frame. It is laid out but unseen until its count starts (a "+0" waiting
 * reads as nothing earned), then fades in over 100 ms. [landBump] (an impulse) bumps it as it lands. Not
 * [play]: shown at rest (a moment already seen, composed again).
 */
@Composable
fun CountUp(
    target: Double,
    key: Any?,
    modifier: Modifier = Modifier,
    style: TextStyle,
    color: Color = Color.Unspecified,
    durMs: Int = 360,
    delayMs: Int = 0,
    from: Double = 0.0,
    landBump: Float = 0f,
    play: Boolean = true,
    format: (Double) -> String,
) {
    val motion = LocalMotion.current
    val counts = play && motion.moves
    val value = remember(key) { Animatable(if (counts) from.toFloat() else target.toFloat()) }
    val shown = remember(key) { Animatable(if (counts && delayMs > 0) 0f else 1f) }
    val land = remember { Animatable(1f) }
    LaunchedEffect(key, target) {
        if (!counts) { value.snapTo(target.toFloat()); shown.snapTo(1f); return@LaunchedEffect }
        if (delayMs > 0) delay(if (motion == MotionLevel.CALM) delayMs / 2L else delayMs.toLong())
        launch { shown.animateTo(1f, tween(100, easing = EaseOut)) }
        value.animateTo(target.toFloat(), motion.tweenOf(durMs))
        if (landBump > 0f) land.bump(landBump, motion)
    }
    Text(format(value.value.toDouble()), modifier.graphicsLayer { scaleX = land.value; scaleY = land.value; alpha = shown.value }, color = color, style = style)
}

/**
 * A number that rolls when it changes: the new figure slides 6 dp in from below (counting up) or above
 * (counting down) as the old one leaves, in 140 ms. Calm crossfades; Still swaps.
 */
@Composable
fun RollingNumber(value: Int, modifier: Modifier = Modifier, style: TextStyle, color: Color = Color.Unspecified, format: (Int) -> String = { it.toString() }) {
    val motion = LocalMotion.current
    val shift = with(LocalDensity.current) { 6.dp.roundToPx() }
    AnimatedContent(
        targetState = value,
        modifier = modifier,
        transitionSpec = {
            val up = targetState > initialState
            when (motion) {
                MotionLevel.FULL ->
                    (slideInVertically(tween(140, easing = EaseOut)) { if (up) shift else -shift } + fadeIn(tween(140, easing = EaseOut))) togetherWith
                        (slideOutVertically(tween(140, easing = EaseIn)) { if (up) -shift else shift } + fadeOut(tween(100, easing = EaseIn)))
                MotionLevel.CALM -> fadeIn(tween(120)) togetherWith fadeOut(tween(90))
                MotionLevel.STILL -> fadeIn(tween(0)) togetherWith fadeOut(tween(0))
            }
        },
        label = "rolling",
    ) { v ->
        Text(format(v), color = color, style = style)
    }
}

/**
 * A radial wash: a disc of [color] grows from [origin] (local px) to the far corner as [progress] goes 0 → 1,
 * clipped to [shape], with a [rimDp] rim of [rim] on its edge that fades as it arrives. Drawn behind the content
 * with no recomposition; the shape's path and the rim's stroke are built once per size.
 */
fun Modifier.flood(progress: () -> Float, origin: () -> Offset, color: Color, shape: Shape, rim: Color = Color.Transparent, rimDp: Float = 6f, radial: () -> Boolean = { true }): Modifier =
    drawWithCache {
        val outline = shape.createOutline(size, layoutDirection, this)
        val clip = Path().apply {
            when (outline) {
                is Outline.Rectangle -> addRect(outline.rect)
                is Outline.Rounded -> addRoundRect(outline.roundRect)
                is Outline.Generic -> addPath(outline.path)
            }
        }
        val rimPx = rimDp.dp.toPx()
        val stroke = Stroke(rimPx)
        val far = hypot(size.width, size.height)
        onDrawBehind {
            val p = progress()
            if (p <= 0f) return@onDrawBehind
            if (!radial()) {
                // Calm: a plain tint crossfade.
                clipPath(clip) { drawRect(color, alpha = p.coerceIn(0f, 1f)) }
                return@onDrawBehind
            }
            val o = origin()
            val r = far * p
            clipPath(clip) {
                drawCircle(color, r, o)
                if (rim.alpha > 0f && p < 1f) drawCircle(rim, (r - rimPx / 2).coerceAtLeast(0f), o, alpha = 1f - p, style = stroke)
            }
        }
    }

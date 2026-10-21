package com.xtnl.app.ui

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue

import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.xtnl.app.core.LayoutMode
import com.xtnl.app.core.Layouts
import com.xtnl.app.core.Panes
import com.xtnl.app.core.WidthClass
import com.xtnl.app.ui.motion.EaseOut
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.Spr
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

/** The hinge in window pixels: a vertical line (book) or a horizontal one (tabletop). */
data class Hinge(val vertical: Boolean, val startPx: Int, val endPx: Int, val halfOpen: Boolean, val separating: Boolean = halfOpen)

data class WindowLayout(val mode: LayoutMode, val hinge: Hinge?)

val LocalWindowLayout = staticCompositionLocalOf { WindowLayout(Layouts.of(475f, 751f, null), null) }

/**
 * Where the destinations' area starts in the window (AppRoot measures it outside the tab transition), or null before
 * it is known. Two panes fill that area, so they split from here: a tab sliding in or out never moves the split.
 */
val LocalPaneOrigin = compositionLocalOf<IntOffset?> { null }

/** What a split last followed (the hinge, the posture, the width class) and where it was. */
private class SplitMemo(var hinge: Hinge?, var stacked: Boolean, var width: WidthClass, var split: Int)

/**
 * Two panes that follow the hinge: side by side, split at a vertical hinge
 * (book) or evenly when flat; or top and bottom, split at a horizontal hinge
 * (tabletop). Each pane gets only its own side of the window insets.
 *
 * The layout is always drawn at its final size: a display switch snaps it
 * (no width tween across a width class). Panes an unfold brings reveal
 * themselves from the hinge (the first comes up from .85 and .98, the second
 * slides out from the hinge); a new hinge on the same display moves the
 * second pane from where the split was, by translation only, and the hinge's
 * hairline fades in at its new place. To or from tabletop: a fade-through.
 * Only the hinge and the posture move it: the panes' own first placement, or
 * the area moving under a tab slide, just takes the split as it is.
 */
@Composable
fun TwoPane(
    modifier: Modifier = Modifier,
    evenFraction: Float = 0.5f,
    gutter: Dp = 12.dp,
    first: @Composable () -> Unit,
    second: @Composable () -> Unit,
) {
    val wl = LocalWindowLayout.current
    val motion = LocalMotion.current
    val density = LocalDensity.current
    val unfold = LocalUnfold.current
    val c = X.c
    val area = LocalPaneOrigin.current
    // Its own place, only where no area is provided (a preview, a test).
    var own by remember { mutableStateOf(IntOffset.Zero) }
    val origin = area ?: own
    val stacked = wl.mode.panes == Panes.TOP_BOTTOM
    // Composed by an unfold (just now): reveal from the hinge.
    val fresh = remember { motion.moves && unfold.seq > 0 && SystemClock.uptimeMillis() - unfold.atMs < 300 }
    val pane1 = remember { Animatable(if (fresh) 0f else 1f) }
    val pane2 = remember { Animatable(if (fresh) 0f else 1f) }
    val bright = remember { Animatable(0f) }
    val line = remember { Animatable(1f) }
    LaunchedEffect(Unit) {
        if (!fresh) return@LaunchedEffect
        coroutineScope {
            launch { pane1.animateTo(1f, if (motion == MotionLevel.FULL) spring(0.9f, 500f) else tween(160)) }
            launch { delay(60); pane2.animateTo(1f, tween(180, easing = EaseOut)) }
            if (motion == MotionLevel.FULL) launch { bright.animateTo(1f, tween(160)); bright.animateTo(0f, tween(320)) }
        }
    }
    BoxWithConstraints(
        modifier
            .fillMaxSize()
            .onGloballyPositioned {
                if (area != null) return@onGloballyPositioned
                val p = it.positionInWindow()
                own = IntOffset(p.x.roundToInt(), p.y.roundToInt())
            }
    ) {
        val total = with(density) { (if (stacked) maxHeight else maxWidth).roundToPx() }
        val hinge = wl.hinge?.takeIf { it.vertical != stacked }
        val gutterPx = with(density) { gutter.roundToPx() }
        val minPane = with(density) { (if (stacked) Layouts.MIN_HALF_DP else Layouts.MIN_PANE_DP).dp.roundToPx() }
        val (split, hingeGap) = Layouts.splitPx(if (stacked) origin.y else origin.x, total, hinge?.startPx, hinge?.endPx, minPane, evenFraction)
        val gap = max(hingeGap, gutterPx)
        val firstSize = (if (hingeGap >= gutterPx) split else split - (gutterPx - hingeGap) / 2).coerceIn(0, total)
        // A new hinge or posture on this display: the split jumps to its new place and the second pane slides there
        // from the old one (translation only, on the glide spring). A new width class (a rotation) just snaps. The
        // memo takes every other change of the split (the first placement, the area moving) without a slide.
        val shift = remember { Animatable(0f) }
        val fade = remember { Animatable(1f) }
        val memo = remember { SplitMemo(hinge, stacked, wl.mode.width, firstSize) }
        val moved = hinge != memo.hinge || stacked != memo.stacked
        val delta = if (moved) memo.split - firstSize else 0
        val posture = stacked != memo.stacked
        val rotated = wl.mode.width != memo.width
        SideEffect { memo.hinge = hinge; memo.stacked = stacked; memo.width = wl.mode.width; memo.split = firstSize }
        LaunchedEffect(hinge, stacked, wl.mode.width) {
            if (!motion.moves || rotated) return@LaunchedEffect
            if (posture) {
                // To or from tabletop: fade through (the old shape is gone at once; the new one comes up 60–260).
                fade.snapTo(0f)
                delay(60)
                fade.animateTo(1f, tween(200, easing = EaseOut))
                return@LaunchedEffect
            }
            if (delta == 0) return@LaunchedEffect
            coroutineScope {
                launch { line.snapTo(0f); line.animateTo(1f, tween(160)) }
                if (motion == MotionLevel.FULL) {
                    shift.snapTo(delta.toFloat())
                    shift.animateTo(0f, Spr.glide.spec())
                }
            }
        }
        val firstDp = with(density) { firstSize.toDp() }
        val gapDp = with(density) { gap.toDp() }
        val base = c.line2
        val lit = c.ink1.copy(alpha = 0.3f)
        val revealPx = with(density) { 24.dp.toPx() }
        val firstPane = Modifier.graphicsLayer {
            val k = pane1.value
            alpha = (0.85f + 0.15f * k) * fade.value
            val s = 0.98f + 0.02f * k
            scaleX = s; scaleY = s
            transformOrigin = if (stacked) TransformOrigin(0.5f, 1f) else TransformOrigin(1f, 0.5f)
            compositingStrategy = CompositingStrategy.ModulateAlpha
        }
        val secondPane = Modifier.graphicsLayer {
            val k = pane2.value
            alpha = k * fade.value
            val off = shift.value - (1f - k) * revealPx
            if (stacked) translationY = off else translationX = off
            compositingStrategy = CompositingStrategy.ModulateAlpha
        }
        val hairline = Modifier.graphicsLayer {
            if (stacked) translationY = shift.value else translationX = shift.value
            alpha = line.value * fade.value
        }
        if (stacked) {
            Column(Modifier.fillMaxSize()) {
                Box(
                    Modifier.fillMaxWidth().height(firstDp).then(firstPane)
                        .consumeWindowInsets(WindowInsets.safeDrawing.union(WindowInsets.ime).only(WindowInsetsSides.Bottom))
                ) { first() }
                Spacer(Modifier.fillMaxWidth().height(gapDp).then(hairline).drawBehind {
                    drawLine(lerp(base, lit, bright.value), Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = 1.dp.toPx())
                })
                Box(Modifier.fillMaxWidth().weight(1f).then(secondPane).consumeWindowInsets(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))) { second() }
            }
        } else {
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxHeight().width(firstDp).then(firstPane)) { first() }
                Spacer(Modifier.fillMaxHeight().width(gapDp).then(hairline).drawBehind {
                    if (hinge != null) drawLine(lerp(base, lit, bright.value), Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), strokeWidth = 1.dp.toPx())
                })
                Box(Modifier.fillMaxHeight().weight(1f).then(secondPane)) { second() }
            }
        }
    }
}

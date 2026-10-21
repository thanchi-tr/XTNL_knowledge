package com.xtnl.app.ui.log

import kotlinx.coroutines.launch
import android.os.Build
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RenderEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.xtnl.app.ui.components.CardShape
import com.xtnl.app.ui.motion.EaseDraw
import com.xtnl.app.ui.motion.EaseIn
import com.xtnl.app.ui.motion.EaseInOut
import com.xtnl.app.ui.motion.EaseOut
import com.xtnl.app.ui.motion.FilingMoment
import com.xtnl.app.ui.motion.LocalFx
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.NodeX
import com.xtnl.app.ui.motion.drawEdge
import com.xtnl.app.ui.motion.hexPath
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.XtnlColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** How a filing ended: a new idea, folded into one you have, a twin (nothing saved), or a refusal. */
internal enum class FilingEnd { CREATED, MERGED, DUPLICATE, FAILED }

/**
 * The New idea form's state while it files (moments 8 and 9): the overlay's fade, the fields' dim and blur and
 * their rise back, how the filing ended and when (frame time), and the newest filed row held back until the seal
 * lands. It lives with the screen, so a moment's tail (the fields' rise, a landing) outlives the overlay.
 */
@Stable
internal class FilingLook(failKey: Int) {
    val overlay = Animatable(0f)
    /** The stage line: it fades out before the fields come back up, so it never sits on them. */
    val line = Animatable(1f)
    /** 0: the fields at rest; 1: dimmed to α .5 and blurred 6 dp under the overlay. */
    val dim = Animatable(0f)
    /** The cleared fields' rise back (1: 8 dp low). */
    val rise = Animatable(0f)
    var showing by mutableStateOf(false)
    var end by mutableStateOf<FilingEnd?>(null)
    var endAt = 0L
    var field by mutableStateOf<String?>(null)
    var playedFail by mutableIntStateOf(failKey)
    /** The newest "Filed this session" row waits for the seal to land (main display). */
    var holdRow by mutableStateOf<String?>(null)
    /** Ticks as the seal lands on Review (the row's ◇ bumps). */
    var landed by mutableIntStateOf(0)
    /** The canvas's centre (root coordinates): where the seal leaves from. */
    var centre: Offset? = null
    internal var blurPx = -1f
    internal var blur: RenderEffect? = null

    /** The fields' blur at this dim: built only when its radius changes (never per frame at rest). */
    fun blurFor(px: Float): RenderEffect? {
        if (px < 0.5f) return null
        if (abs(px - blurPx) >= 0.5f || blur == null) { blurPx = px; blur = BlurEffect(px, px) }
        return blur
    }
}

/** The fields under a filing: dimmed (α .5) and blurred 6 dp on API 31+, α .35 below; the cleared ones rise back up. */
internal fun Modifier.filingFields(look: FilingLook): Modifier = graphicsLayer {
    val d = look.dim.value
    val canBlur = Build.VERSION.SDK_INT >= 31
    alpha = 1f - (if (canBlur) 0.5f else 0.65f) * d
    translationY = look.rise.value * 8.dp.toPx()
    renderEffect = if (canBlur) look.blurFor(6.dp.toPx() * d) else null
}

/** The scene's pure geometry and timing (seconds from the Create tap, in units of the canvas's half size). */
internal object FilingScene {
    const val RING = 0.76f
    const val X_RADIUS = 0.62f

    /** A spring's step response (0 → 1) at [t] s: mass 1, damping ratio [z], stiffness [k]. */
    fun springStep(z: Float, k: Float, t: Float): Float {
        if (t <= 0f) return 0f
        val w = sqrt(k)
        if (z >= 1f) return 1f - (1f + w * t) * exp(-w * t)
        val wd = w * sqrt(1f - z * z)
        return 1f - exp(-z * w * t) * (cos(wd * t) + z * w / wd * sin(wd * t))
    }

    /** 0..1 through a window starting at [start] lasting [dur]. */
    fun win(t: Float, start: Float, dur: Float): Float = ((t - start) / dur).coerceIn(0f, 1f)

    /** Neighbour [k]'s angle on the ring: evenly spaced, orbiting at 0.25 rad/s from stage 2. */
    fun angle(k: Int, t: Float): Float = k * PI.toFloat() / 3f - PI.toFloat() / 2f + 0.25f * max(0f, t - 1.4f)

    private val ROLES = arrayOf(NodeX.B, NodeX.D, NodeX.S)

    /** Which neighbours become B, D and S of the X: the nearest to each, taken in turn (indices into the six). */
    fun assign(t: Float, out: IntArray) {
        val targets = ROLES
        var taken = 0
        for (j in 0 until 3) {
            var best = -1
            var bestD = Float.MAX_VALUE
            for (k in 0 until 6) {
                if (taken and (1 shl k) != 0) continue
                val a = angle(k, t)
                val x = cos(a) * RING
                val y = sin(a) * RING
                val tx = targets[j].x * X_RADIUS
                val ty = targets[j].y * X_RADIUS
                val d = (x - tx) * (x - tx) + (y - ty) * (y - ty)
                if (d < bestD) { bestD = d; best = k }
            }
            out[j] = best
            taken = taken or (1 shl best)
        }
    }
}

/**
 * The wait, made visible: a small graph assembles over four stages (reading, finding its field, checking for a
 * twin, filing), then the answer resolves it — the X closes into the seal, the node folds into its twin, or it
 * drops back to the form. One frame loop writes the scene's time; only the canvas reads it, and the stage line
 * and seconds change by derived state.
 */
@Composable
internal fun FilingOverlay(startedMs: Long, look: FilingLook, field: String?, modifier: Modifier = Modifier) {
    val c = X.c
    val motion = LocalMotion.current
    val fx = LocalFx.current
    val density = LocalDensity.current
    var t by remember { mutableFloatStateOf(((System.currentTimeMillis() - startedMs) / 1000f).coerceAtLeast(0f)) }
    var frame by remember { mutableLongStateOf(0L) }
    LaunchedEffect(startedMs, motion) {
        val t0 = ((System.currentTimeMillis() - startedMs) / 1000f).coerceAtLeast(0f)
        if (motion == MotionLevel.STILL) {
            // No frame loop in Still: the seconds tick on their own.
            var k = 0
            while (true) { t = t0 + k; delay(1000); k++ }
        }
        val start = withFrameNanos { it }
        while (true) {
            withFrameNanos { now ->
                t = t0 + (now - start) / 1_000_000_000f
                frame = now
                if (look.end != null && look.endAt == 0L) look.endAt = now
            }
            // Calm's scene is still between its stages' 200 ms fades and before the answer: no frames then, only a
            // wake for the next stage or second (the seconds line), or at once for the answer.
            val stageS = FilingMoment.STAGE_MS / 1000f
            val fading = t < 3 * stageS + 0.22f && t % stageS < 0.22f
            if (motion == MotionLevel.CALM && look.end == null && !fading) {
                val nextStage = if (t < 3 * stageS) (floor(t / stageS) + 1) * stageS else Float.MAX_VALUE
                val wait = ((min(nextStage, floor(t) + 1f) - t) * 1000f).toLong().coerceAtLeast(16L)
                withTimeoutOrNull(wait) { snapshotFlow { look.end }.first { it != null } }
            }
        }
    }
    val stage by remember { derivedStateOf { FilingMoment.stage((t * 1000).toLong()) } }
    val seconds by remember { derivedStateOf { t.toInt() } }
    val end = look.end
    val line = when (end) {
        FilingEnd.CREATED -> field?.let { "Filed in $it" } ?: "Filed"
        FilingEnd.MERGED -> "Folded into one you have"
        FilingEnd.DUPLICATE -> "Something close is already here"
        FilingEnd.FAILED -> "Not filed"
        null -> FilingMoment.STAGES[stage] + "…"
    }
    val scratch = remember { Scratch() }
    val hex = remember { Path() }
    val colors = c
    Column(
        modifier
            .graphicsLayer { alpha = look.overlay.value }
            .clip(CardShape)
            .drawBehind { drawRect(colors.card, alpha = 0.86f) }
            .padding(vertical = 12.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Canvas(
            Modifier
                .size(112.dp)
                .onGloballyPositioned {
                    val p = it.localToRoot(Offset(it.size.width / 2f, it.size.height / 2f))
                    look.centre = p
                    fx.targets["idea"] = p
                }
        ) {
            frame // redraw each frame
            val tR = if (look.endAt == 0L || frame == 0L) 0f else ((frame - look.endAt) / 1_000_000_000f).coerceAtLeast(0f)
            drawScene(t, end, tR, colors, motion, density.density, scratch, hex)
        }
        Spacer(Modifier.height(10.dp))
        val shift = with(density) { 6.dp.roundToPx() }
        // A fade-through: the old line has left (120 ms) before the new one comes in, so two never print as one.
        AnimatedContent(line, Modifier.graphicsLayer { alpha = look.line.value }, label = "stage", transitionSpec = {
            when (motion) {
                MotionLevel.FULL -> (fadeIn(tween(200, delayMillis = 120, easing = EaseOut)) + slideInVertically(tween(200, delayMillis = 120, easing = EaseOut)) { shift }) togetherWith
                    (fadeOut(tween(120, easing = EaseIn)) + slideOutVertically(tween(120, easing = EaseIn)) { -shift })
                MotionLevel.CALM -> fadeIn(tween(110, delayMillis = 90)) togetherWith fadeOut(tween(90))
                MotionLevel.STILL -> fadeIn(tween(0)) togetherWith fadeOut(tween(0))
            } using null
        }) { s ->
            Text(s, style = MaterialTheme.typography.titleMedium, color = c.ink0)
        }
        when {
            end != null -> Unit
            FilingMoment.slow((seconds * 1000).toLong()) -> Text(
                "Taking longer than usual. You can leave this screen; it will still be filed.",
                style = MaterialTheme.typography.labelMedium, color = c.ink2, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 8.dp),
            )
            FilingMoment.showSeconds((seconds * 1000).toLong()) -> Text("$seconds s", style = MaterialTheme.typography.labelMedium, color = c.ink2)
        }
    }
}

/** The scene's per-frame working space and its strokes, reused: nothing is allocated as it draws. */
private class Scratch {
    val assign = IntArray(3)
    val x = FloatArray(6)
    val y = FloatArray(6)
    val has = BooleanArray(6)
    private var density = 0f
    /** The seal's rim (1.6 dp), the rings (the idea node's, the twin's: 1.5 dp) and the ghost (1.2 dp). */
    var rim = Stroke(1f); private set
    var ring = Stroke(1f); private set
    var ghost = Stroke(1f); private set

    /** Builds the strokes for [d] (once, and again only if the density changes). */
    fun strokesFor(d: Float) {
        if (d == density) return
        density = d
        rim = Stroke(1.6f * d)
        ring = Stroke(1.5f * d)
        ghost = Stroke(1.2f * d)
    }
}

/** The graph at scene time [t] (s), and how it resolves [tR] s after its end. */
private fun DrawScope.drawScene(t: Float, end: FilingEnd?, tR: Float, c: XtnlColors, motion: MotionLevel, density: Float, sc: Scratch, hex: Path) {
    sc.strokesFor(density)
    val assign = sc.assign
    val r0 = size.minDimension / 2
    val o = center
    val full = motion == MotionLevel.FULL
    val still = motion == MotionLevel.STILL
    fun at(x: Float, y: Float) = Offset(o.x + x * r0, o.y + y * r0)
    val stageAt = min(3, (t / 1.4f).toInt())
    // Calm and Still: a static graph per stage (Calm fades each in over 200 ms), the X at stage 4.
    val tt = if (full) t else (stageAt * 1.4f + if (still) 1.39f else min(1.39f, (t - stageAt * 1.4f)))
    val created = end == FilingEnd.CREATED
    val folded = end == FilingEnd.MERGED || end == FilingEnd.DUPLICATE
    val failed = end == FilingEnd.FAILED
    // The answer fast-forwards the X (created) or brings the neighbours in at once (a twin).
    val ff = if (created) EaseOut.transform(FilingScene.win(tR, 0f, 0.12f)) else 0f
    val inN = if (folded) EaseOut.transform(FilingScene.win(tR, 0f, 0.12f)) else 0f
    val out = if (failed) 1f - FilingScene.win(tR, 0f, 0.2f) else 1f

    // Stage 1: five dots converge into the idea node, which grows on the bead spring and breathes.
    if (full && tt < 0.4f && end == null) {
        val p = EaseIn.transform(FilingScene.win(tt, 0f, 0.36f))
        for (k in 0 until 5) {
            val a = k * 2 * PI.toFloat() / 5 - PI.toFloat() / 2
            drawCircle(c.ink2, 2.5f * density, at(cos(a) * 0.8f * (1 - p), sin(a) * 0.8f * (1 - p)), alpha = 1f - p * 0.6f)
        }
    }
    val grow = if (full) FilingScene.springStep(0.4f, 900f, tt - 0.36f) else if (still) 1f else FilingScene.win(tt, 0f, 0.2f)
    val breathe = if (full && tt > 0.8f && end == null) 1f + 0.06f * sin(2 * PI.toFloat() * 0.8f * tt) else 1f

    // Stage 4: the idea node goes to A, the three nearest neighbours to B, D and S; the strokes draw.
    FilingScene.assign(max(tt, 4.2f), assign)
    val q4 = max(if (full) EaseInOut.transform(FilingScene.win(tt, 4.2f, 0.3f)) else if (tt >= 4.2f) (if (still) 1f else FilingScene.win(tt, 4.2f, 0.2f)) else 0f, ff)
    val ab = max(if (full) EaseDraw.transform(FilingScene.win(tt, 4.5f, 0.3f)) else q4, ff)
    val ds = max(if (full) EaseDraw.transform(FilingScene.win(tt, 4.62f, 0.3f)) else q4, ff)
    val xBreathe = if (full && tt > 4.8f && end == null) 1f + 0.04f * (0.5f - 0.5f * cos(2 * PI.toFloat() * (tt - 4.8f) / 1.2f)) else 1f
    val xr = FilingScene.X_RADIUS * xBreathe

    // The created seal: the navy chip stamps in behind the X (R + 80–180), holds, then winds up (R + 213–260) and flies.
    var sealScale = 1f
    var sealDrop = 0f
    var sealShown = false
    if (created && full) {
        sealShown = tR in 0.08f..0.26f
        sealScale = when {
            tR < 0.18f -> 1.5f - 0.56f * EaseIn.transform(FilingScene.win(tR, 0.08f, 0.1f))
            tR < 0.213f -> 0.94f
            else -> 0.94f - 0.04f * EaseIn.transform(FilingScene.win(tR, 0.213f, 0.047f))
        }
        sealDrop = 4f * density * EaseIn.transform(FilingScene.win(tR, 0.213f, 0.047f))
    } else if (created) {
        sealShown = true
        sealScale = 0.96f + 0.04f * FilingScene.win(tR, 0f, 0.16f)
    }
    val gone = created && full && tR >= 0.26f
    if (sealShown) {
        val sr = 28f * density * sealScale
        hexPath(Offset(o.x, o.y + sealDrop), sr, hex)
        val a = if (full) FilingScene.win(tR, 0.08f, 0.03f) else FilingScene.win(tR, 0f, 0.16f)
        drawPath(hex, c.face, alpha = a)
        drawPath(hex, c.mint, alpha = a, style = sc.rim)
    }
    if (gone) return

    val xs = if (sealShown) sealScale else 1f
    val xo = if (sealShown) Offset(0f, sealDrop) else Offset.Zero
    fun xAt(p: Offset) = Offset(o.x + xo.x + p.x * xr * r0 * xs, o.y + xo.y + p.y * xr * r0 * xs)

    // Stage 2: six neighbours on an orbiting ring; probes reach out to them one by one.
    val nodeBase = Offset(o.x, o.y)
    val node = lerpOffset(nodeBase, xAt(NodeX.A), q4)
    for (k in 0 until 6) {
        sc.has[k] = false
        val appear = max(if (full) FilingScene.win(tt, 1.4f + 0.06f * k, 0.2f) else if (tt >= 1.4f) (if (still) 1f else FilingScene.win(tt, 1.4f, 0.2f)) else 0f, max(ff, inN))
        if (appear <= 0f) continue
        val a = FilingScene.angle(k, if (full) tt else 1.4f)
        val ring = Offset(o.x + cos(a) * FilingScene.RING * r0, o.y + sin(a) * FilingScene.RING * r0)
        val role = assign.indexOf(k)
        val target = when (role) { 0 -> xAt(NodeX.B); 1 -> xAt(NodeX.D); 2 -> xAt(NodeX.S); else -> null }
        val p = if (target != null) lerpOffset(ring, target, q4) else ring
        sc.x[k] = p.x; sc.y[k] = p.y; sc.has[k] = true
        var alpha = 0.5f * appear * out
        var color = c.ink2
        var radius = 3.2f * density
        if (target != null && q4 > 0f) {
            alpha = lerp(0.5f, 1f, q4) * appear * out
            color = when (role) { 0 -> lerp(c.ink2, c.cyan, q4); else -> lerp(c.ink2, c.mint, q4) }
            radius = lerp(3.2f, if (role == 0) 3.6f else 3f, q4) * density
        } else if (q4 > 0f) alpha *= 1f - 0.5f * q4
        if (folded) {
            // The twin (neighbour 0's slot): it takes the node in (merged) or pulses (a duplicate); the rest fade.
            val twin = k == assign[0]
            if (twin) {
                val pulse = if (end == FilingEnd.MERGED) pulse(tR - 0.2f, 0.4f, 0.45f, 700f) else pulse(tR - 0.16f, 0.2f, 0.45f, 700f)
                radius *= pulse
                if (end == FilingEnd.MERGED && tR >= 0.2f) color = c.held
                alpha = max(alpha, 0.9f)
            } else alpha *= 1f - FilingScene.win(tR, 0.2f, 0.2f)
        }
        drawCircle(color, radius, p, alpha = alpha)
    }
    if (folded && end == FilingEnd.MERGED && tR >= 0.2f) {
        sc.at(assign[0])?.let { p ->
            val k = FilingScene.win(tR, 0.2f, 0.32f)
            drawCircle(c.held, 4f * density * (1f + 1.4f * k), p, alpha = 0.5f * (1f - k), style = sc.ring)
        }
    }

    // Probes (stage 2): every 420 ms an edge reaches a neighbour (draw 200, hold 120, retract 100).
    if (full && tt in 1.4f..2.8f && end == null || failed && tR < 0.12f && tt in 1.4f..2.8f) {
        val j = floor((tt - 1.4f) / 0.42f).toInt()
        val u = tt - 1.4f - 0.42f * j
        val target = sc.at((2 * j + 1) % 6)
        if (target != null) {
            var reach = when {
                u < 0.2f -> EaseOut.transform(u / 0.2f)
                u < 0.32f -> 1f
                else -> 1f - ((u - 0.32f) / 0.1f).coerceIn(0f, 1f)
            }
            if (failed) reach *= 1f - FilingScene.win(tR, 0f, 0.12f)
            drawEdge(node, target, Offset((node.x + target.x) / 2, (node.y + target.y) / 2), reach, 1f, c.line2, 1.2f * density, 2f * density, c.mint)
        }
    }

    // Stage 3: a ghost of the node orbits it once, then separates and fades (no twin).
    if (full && tt in 2.8f..4.2f && end == null) {
        val th = 2 * PI.toFloat() * FilingScene.win(tt, 2.8f, 1.2f)
        val off = (6f + 10f * FilingScene.win(tt, 4.0f, 0.2f)) * density
        val a = 0.3f * (1f - FilingScene.win(tt, 4.0f, 0.2f))
        drawCircle(c.mint, 8f * density, Offset(node.x + cos(th) * off, node.y + sin(th) * off), alpha = a, style = sc.ghost)
    }

    // The X's strokes (a twin dissolves them: the X never closes).
    val strokes = out * (if (folded) 1f - FilingScene.win(tR, 0f, 0.2f) else 1f)
    if (q4 > 0f && assign[0] >= 0 && strokes > 0f) {
        val b = sc.at(assign[0])
        val d = sc.at(assign[1])
        val s = sc.at(assign[2])
        if (b != null) drawLine(c.mint, node, Offset(node.x + (b.x - node.x) * ab, node.y + (b.y - node.y) * ab), NodeX.W_AB * xr * r0, StrokeCap.Round, alpha = strokes)
        if (d != null && s != null) drawLine(c.mint, d, Offset(d.x + (s.x - d.x) * ds, d.y + (s.y - d.y) * ds), NodeX.W_DS * xr * r0, StrokeCap.Round, alpha = 0.85f * strokes)
    }

    // The idea node: an ink core in a mint ring. A twin draws it toward the other; a refusal drops it back to the form.
    var n = node
    var nodeScale = grow * breathe
    var nodeAlpha = 1f
    when (end) {
        FilingEnd.MERGED -> {
            val twin = sc.at(assign[0])
            if (twin != null) n = lerpOffset(node, twin, EaseInOut.transform(FilingScene.win(tR, 0f, 0.2f)))
            if (tR >= 0.2f) nodeAlpha = 0f
        }
        FilingEnd.DUPLICATE -> {
            val twin = sc.at(assign[0])
            if (twin != null) {
                // Along a dashed edge, 70% of the way to its twin.
                val g = EaseInOut.transform(FilingScene.win(tR, 0f, 0.16f)) * 0.7f
                drawEdge(node, twin, Offset((node.x + twin.x) / 2, (node.y + twin.y) / 2), 1f, g, c.ink2, 1.2f * density, 0f, c.ink2, dashOn = 4f * density, alpha = 0.6f)
                n = lerpOffset(node, twin, g)
            }
            val k = EaseIn.transform(FilingScene.win(tR, 0.16f, 0.24f))
            nodeScale *= 1f - k
            nodeAlpha = 1f - k
        }
        FilingEnd.FAILED -> {
            val k = EaseIn.transform(FilingScene.win(tR, 0f, 0.24f))
            n = Offset(node.x, node.y + 12f * density * k)
            nodeAlpha = 1f - k
        }
        else -> Unit
    }
    if (nodeAlpha > 0f && nodeScale > 0f) {
        val stageAlpha = if (still) 0.4f + 0.2f * stageAt else 1f
        drawCircle(c.mint, 8f * density * nodeScale, n, alpha = nodeAlpha * stageAlpha, style = sc.ring)
        drawCircle(c.ink0, 5f * density * nodeScale, n, alpha = nodeAlpha * stageAlpha)
    }
}

private fun Scratch.at(k: Int): Offset? = if (k in 0..5 && has[k]) Offset(x[k], y[k]) else null

private fun lerpOffset(a: Offset, b: Offset, t: Float) = Offset(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

/** A pulse 1 → [peak] → 1 from [t] = 0 on a spring (ζ, k): the twin taking the node in. */
private fun pulse(t: Float, peak: Float, z: Float, k: Float): Float {
    if (t <= 0f) return 1f
    val w = sqrt(k)
    val wd = w * sqrt(1f - z * z)
    // An impulse response, scaled so its first peak is [peak] over 1.
    val tp = kotlin.math.atan(wd / (z * w)) / wd
    val norm = exp(-z * w * tp) * sin(wd * tp)
    return 1f + peak * exp(-z * w * t) * sin(wd * t) / norm
}

/**
 * The answer to a Create (moment 9), from R (now). Created: the X closes, the navy seal stamps behind it, holds,
 * winds up and flies to Review (its length by distance; a half-open hinge in the way, or nowhere to land, and it
 * lands at once); the overlay fades and the cleared fields rise back. Merged: the node folds into its twin.
 * Duplicate: it reaches 70% of the way to its twin and shrinks away; the fields keep the text, focused.
 */
internal suspend fun sealMoment(
    r: com.xtnl.app.data.IdeaResult, newest: String?, look: FilingLook, vm: LogViewModel, fx: com.xtnl.app.ui.motion.FxState,
    feel: com.xtnl.app.feel.Feel?, snacks: com.xtnl.app.ui.Snacks, motion: MotionLevel, c: XtnlColors, density: Float,
    rail: Boolean, hinge: com.xtnl.app.ui.Hinge?, refocus: () -> Unit,
) = kotlinx.coroutines.coroutineScope {
    val id = "idea:" + (newest ?: r.ideaId ?: "x")
    val end = when (r.status) { "merged" -> FilingEnd.MERGED; "duplicate" -> FilingEnd.DUPLICATE; else -> FilingEnd.CREATED }
    look.field = r.field
    look.end = end
    val full = motion == MotionLevel.FULL
    val pts = r.points?.takeIf { it > 0 }
    val line = listOfNotNull(r.line ?: "Filed", pts?.let { "+${com.xtnl.app.core.Fmt.figure(it)} pts" }).joinToString(" · ")

    /**
     * The overlay out from [at] over [ms]; its stage line goes first (100 ms), then the fields clear, so the line never
     * sits on them as they come back (and the cleared ones rise back from [riseAt]).
     */
    suspend fun clear(at: Int, ms: Int, riseAt: Int?) = kotlinx.coroutines.coroutineScope {
        if (!motion.moves) { look.overlay.snapTo(0f); look.dim.snapTo(0f); look.line.snapTo(0f); return@coroutineScope }
        launch { delay(at.toLong()); look.line.animateTo(0f, tween(100)) }
        launch { delay(at + 100L); look.dim.animateTo(0f, tween(200)) }
        if (riseAt != null && full) launch { delay(max(riseAt, at + 100).toLong()); look.rise.snapTo(1f); look.rise.animateTo(0f, tween(160, easing = EaseOut)) }
        delay(at.toLong())
        look.overlay.animateTo(0f, tween(ms))
    }

    fun landing() {
        fx.targets["review"]?.let { t ->
            fx.shock(t, 12f * density, 32f * density, 2f * density, 240, c.pts, alpha0 = 0.6f, light = c.dark, id = id)
            pts?.let {
                // Over the Review icon, rising: on the rail it stays within the rail's width (never beside the form's own "+10").
                val at = Offset(t.x, t.y - (if (rail) 26f else 30f) * density)
                fx.chip(at, "+${com.xtnl.app.core.Fmt.figure(it)}", c.ink0, c.overlay, com.xtnl.app.ui.motion.FxState.Glyph.LOZENGE, c.pts,
                    dir = com.xtnl.app.ui.motion.FxState.ChipDir.UP, distDp = if (rail) 12f else 20f, durMs = 900, id = id)
            }
        }
        snacks.show(line, tone = com.xtnl.app.ui.SnackTone.KEPT)
        look.holdRow = null
        look.landed++
    }

    when (end) {
        FilingEnd.CREATED -> {
            feel?.stamp(id)
            if (!full) {
                if (motion == MotionLevel.CALM) {
                    // The snackbar comes with the landing (once: a second show would dismiss and re-show it).
                    launch { delay(160); fx.land("review"); landing() }
                    delay(160)
                    clear(0, 120, null)
                } else {
                    clear(0, 0, null)
                    fx.land("review")
                    snacks.show(line, tone = com.xtnl.app.ui.SnackTone.KEPT)
                    look.landed++
                }
            } else {
                look.holdRow = newest
                launch { clear(200, 160, 300) }
                launch {
                    delay(180)
                    // R + 180, contact: the mint hex shock and a ring of dots.
                    look.centre?.let { p ->
                        fx.shock(p, 28f * density, 28f * density * 2.4f, 3f * density, 300, c.mint, hex = true, id = id, light = c.dark)
                        fx.burst(p, 20f * density, 8, listOf(c.mint, c.cyan), seed = id.hashCode(), shape = com.xtnl.app.ui.motion.FxState.Shape.DOT,
                            speed = 300f..500f, drag = 6f, life = 0.3f..0.3f, size0 = 1.8f, size1 = 2.4f, id = id)
                    }
                }
                delay(260)
                // R + 260: the flight, unless a half-open hinge lies across its path.
                val from = look.centre
                val to = fx.targets["review"]
                val blocked = from == null || to == null || hinge != null && hinge.halfOpen && crosses(hinge, from, to)
                if (blocked) {
                    fx.land("review")
                    feel?.landAt(id, 0)
                    landing()
                } else {
                    val ms = fx.fly(
                        from!!, "review", 56f * density, 18f * density, c.face, c.mint, c.mint.copy(alpha = 0.75f),
                        if (rail) com.xtnl.app.ui.motion.FxState.Bow.START else com.xtnl.app.ui.motion.FxState.Bow.UP, id,
                    ) { landing() }
                    feel?.landAt(id, ms.coerceAtLeast(0))
                }
                delay(100)
            }
        }
        FilingEnd.MERGED -> {
            feel?.merge(id)
            launch { delay(if (full) 200 else 0); snacks.show(r.line ?: "You already have this one.", long = true) }
            clear(if (full) 240 else 0, if (motion.moves) 160 else 0, if (full) 360 else null)
        }
        FilingEnd.DUPLICATE -> {
            feel?.duplicate(id)
            snacks.show(r.line ?: "Something close is already here, so nothing was saved.", long = true)
            // The snackbar says it: the stage line doesn't say it again.
            launch { if (motion.moves) look.line.animateTo(0f, tween(100)) else look.line.snapTo(0f) }
            clear(if (full) 320 else 0, if (motion.moves) 160 else 0, null)
            refocus()
        }
        FilingEnd.FAILED -> Unit
    }
    look.showing = false
    vm.sealDone()
}

/** Does the straight path from [a] to [b] cross the hinge (window px)? */
private fun crosses(h: com.xtnl.app.ui.Hinge, a: Offset, b: Offset): Boolean {
    val mid = (h.startPx + h.endPx) / 2f
    return if (h.vertical) (a.x - mid) * (b.x - mid) < 0 else (a.y - mid) * (b.y - mid) < 0
}

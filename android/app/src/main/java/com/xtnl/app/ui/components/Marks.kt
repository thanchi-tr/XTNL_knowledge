package com.xtnl.app.ui.components

import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xtnl.app.ui.motion.Dur
import com.xtnl.app.ui.motion.EaseDraw
import com.xtnl.app.ui.motion.EaseIn
import com.xtnl.app.ui.motion.EaseInOut
import com.xtnl.app.ui.motion.EaseOut
import com.xtnl.app.ui.motion.EaseOutCubic
import com.xtnl.app.ui.motion.LocalFx
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.NodeParts
import com.xtnl.app.ui.motion.NodeXColors
import com.xtnl.app.ui.motion.Spr
import com.xtnl.app.ui.motion.bump
import com.xtnl.app.ui.motion.checkLeg1
import com.xtnl.app.ui.motion.checkLeg2
import com.xtnl.app.ui.motion.drawBeads
import com.xtnl.app.ui.motion.drawCheck
import com.xtnl.app.ui.motion.drawHexTrace
import com.xtnl.app.ui.motion.drawNodeX
import com.xtnl.app.ui.motion.hexPath
import com.xtnl.app.ui.motion.holdFrames
import com.xtnl.app.ui.motion.spr
import com.xtnl.app.ui.motion.stamp
import com.xtnl.app.ui.motion.visibleCenter
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * How a check stamps: the baked anticipation frame ([press]), the up-stroke's peak, the disc's overshoot, the
 * hold, the settle, and the mark's two legs (from [markAt], ms). Hue and intensity tell the kinds of "kept"
 * apart: a work item's Done is lighter than a task's tick, a right answer the strongest.
 */
class StampSpec(
    val press: Float = 0.92f,
    val peak: Float = 1.10f,
    val disc: Float = 1.04f,
    val hold: Int = Dur.HOLD_MICRO,
    val settle: Spr = Spr.stamp,
    val markAt: Int = 40,
    val leg1Ms: Int = 40,
    val leg2Ms: Int = 80,
    /** Held down: the circle squashes this far on the press spring. */
    val squash: Float = 0.90f,
) {
    companion object {
        val Task = StampSpec()
        val Correct = StampSpec(press = 0.88f, peak = 1.12f)
        val Work = StampSpec(peak = 1.08f, settle = Spr.workStamp, leg1Ms = 38, leg2Ms = 72)
    }
}

/**
 * The tick: an open ring in the lane's hue. Checked, the circle (squashed by a press, or by one baked frame)
 * stamps up to its peak in 56 ms as the disc floods past its rim, holds three frames and settles; the mark
 * draws in two legs; [onImpact] gets the circle's root centre at the 56 ms impact (the shock and streaks are
 * the overlay's). Unchecked (Undo), the mark undraws and the disc drains. [enter]: play the check on the
 * first composition too (a right answer's badge). [flash]: a light flash at the impact (Night), added to the disc
 * under the mark, so the mark is never under the light. A roll call ([rollKey]) and a nod ([nodKey]) play when
 * their key moves on while the circle is shown, never because it is composed again (a scroll, a tab switch).
 * Calm: a 140 ms fill, no hold; Still: at rest at once.
 */
@Composable
fun CheckCircle(
    checked: Boolean,
    modifier: Modifier = Modifier,
    ring: Color = X.c.lineCtl,
    fill: Color = X.c.kept,
    mark: Color = X.c.onKept,
    size: Dp = 32.dp,
    held: Boolean = false,
    pressed: () -> Boolean = { false },
    stamp: StampSpec = StampSpec.Task,
    onImpact: ((Offset) -> Unit)? = null,
    rollKey: Int = 0,
    rollDelay: Int = 0,
    nodKey: Int = 0,
    enter: Boolean = false,
    flash: Color? = null,
) {
    val c = X.c
    val motion = LocalMotion.current
    val density = LocalDensity.current
    val start = if (checked && !enter) 1f else 0f
    val disc = remember { Animatable(start) }
    val draw = remember { Animatable(start) }
    val ringAlpha = remember { Animatable(if (start > 0f) 0.4f else 1f) }
    val scale = remember { Animatable(1f) }
    val roll = remember { Animatable(0f) }
    val nod = remember { Animatable(0f) }
    val lit = remember { Animatable(0f) }
    var stamping by remember { mutableStateOf(false) }
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val impact by rememberUpdatedState(onImpact)
    val flashColor by rememberUpdatedState(flash)
    // The keys as composed: only a later one plays.
    var rollSeen by remember { mutableIntStateOf(rollKey) }
    var nodSeen by remember { mutableIntStateOf(nodKey) }

    LaunchedEffect(checked) {
        val target = if (checked) 1f else 0f
        if (disc.targetValue == target && disc.value == target) return@LaunchedEffect
        when {
            motion == MotionLevel.STILL -> {
                disc.snapTo(target); draw.snapTo(target); ringAlpha.snapTo(if (checked) 0.4f else 1f); scale.snapTo(1f)
            }
            checked && motion == MotionLevel.CALM -> coroutineScope {
                launch { ringAlpha.animateTo(0.4f, tween(120)) }
                launch { delay(30); draw.animateTo(1f, tween(140, easing = EaseDraw)) }
                disc.animateTo(1f, tween(140, easing = EaseOut))
            }
            checked -> coroutineScope {
                stamping = true
                try {
                    // The baked anticipation: a tap too quick for the press spring still squashes for a frame.
                    if (scale.value > 0.95f) scale.snapTo(stamp.press)
                    launch { ringAlpha.animateTo(0.4f, tween(80)) }
                    launch { disc.stamp(stamp.disc, hold = stamp.hold, settle = stamp.settle) }
                    launch {
                        delay(Dur.PEAK.toLong())
                        coords?.takeIf { it.isAttached }?.let { co -> impact?.invoke(co.localToRoot(Offset(co.size.width / 2f, co.size.height / 2f))) }
                        if (flashColor != null) { lit.snapTo(0.6f); lit.animateTo(0f, tween(90, easing = EaseOut)) }
                    }
                    launch {
                        delay(stamp.markAt.toLong())
                        draw.animateTo(0.35f, tween(stamp.leg1Ms, easing = EaseDraw))
                        draw.animateTo(1f, tween(stamp.leg2Ms, easing = EaseDraw))
                    }
                    scale.stamp(stamp.peak, hold = stamp.hold, settle = stamp.settle)
                } finally {
                    // A quick undo or a refusal cancels the stamp: the press squash comes back either way.
                    stamping = false
                }
            }
            else -> coroutineScope {
                val calm = motion == MotionLevel.CALM
                lit.snapTo(0f)
                launch { ringAlpha.animateTo(1f, tween(if (calm) 120 else 150)) }
                launch { scale.animateTo(1f, motion.spr(Spr.press)) }
                launch { draw.animateTo(0f, tween(if (calm) 120 else 110, easing = EaseIn)) }
                delay(if (calm) 20 else 40)
                disc.animateTo(0f, tween(if (calm) 120 else 150, easing = EaseIn))
            }
        }
    }
    val motionNow by rememberUpdatedState(motion)
    LaunchedEffect(Unit) {
        // The press: the circle squashes while the row is held (read from the row's interaction, never recomposed).
        snapshotFlow { pressed() }.collect { p ->
            val m = motionNow
            if (stamping || !m.moves) return@collect
            val to = if (p) (if (m == MotionLevel.CALM) 0.97f else stamp.squash) else 1f
            launch { scale.animateTo(to, m.spr(Spr.press)) }
        }
    }
    LaunchedEffect(rollKey) {
        if (rollKey <= rollSeen) return@LaunchedEffect
        rollSeen = rollKey
        if (motion != MotionLevel.FULL) return@LaunchedEffect
        delay(rollDelay.toLong())
        launch { scale.bump(5f) }
        roll.snapTo(0f)
        roll.animateTo(1f, tween(240, easing = EaseOut))
        roll.snapTo(0f)
    }
    LaunchedEffect(nodKey) {
        if (nodKey <= nodSeen) return@LaunchedEffect
        nodSeen = nodKey
        if (!motion.moves) return@LaunchedEffect
        nod.animateTo(0f, keyframes {
            durationMillis = 200
            3f at 40
            -3f at 100
            1.5f at 150
        })
    }
    val strokePx = with(density) { 2.dp.toPx() }
    val ringStroke = remember(strokePx) { Stroke(strokePx) }
    val rollStroke = remember(strokePx) { Stroke(strokePx * 0.75f) }
    val light = c.light
    Canvas(
        modifier
            .size(size)
            .onGloballyPositioned { coords = it }
            .graphicsLayer {
                scaleX = scale.value; scaleY = scale.value
                translationX = nod.value * this.density
            }
    ) {
        val r = this.size.minDimension / 2
        val center = center
        if (held) {
            // Held: a hatched disc inside its ring (a word beside it says so).
            drawCircle(ring.copy(alpha = 0.5f), r - strokePx / 2, center, style = ringStroke)
            val disc0 = Path().apply { addOval(Rect(center, r - strokePx)) }
            clipPath(disc0) {
                val step = 4.dp.toPx()
                var x = -2 * r
                while (x < 2 * r) {
                    drawLine(ring.copy(alpha = 0.45f), Offset(center.x + x, center.y + r), Offset(center.x + x + 2 * r, center.y - r), strokeWidth = 1.2.dp.toPx())
                    x += step
                }
            }
            return@Canvas
        }
        val rl = roll.value
        if (rl > 0f && rl < 1f) drawCircle(light, r + (11.dp.toPx()) * rl, center, alpha = 0.35f * (1f - rl), style = rollStroke)
        if (ringAlpha.value > 0f) drawCircle(ring, r - strokePx / 2, center, alpha = ringAlpha.value, style = ringStroke)
        val d = disc.value
        if (d > 0f) drawCircle(fill, r * d, center)
        val fl = lit.value
        val fc = flashColor
        if (fl > 0f && d > 0f && fc != null) drawCircle(fc, r * d, center, alpha = fl, blendMode = BlendMode.Plus)
        val m = draw.value
        if (m > 0f) drawCheck(center, r, checkLeg1(m), checkLeg2(m), mark, r * 0.2f)
    }
}

/** A thin progress ring (review progress, level progress). */
@Composable
fun ProgressRing(fraction: Float, modifier: Modifier = Modifier, color: Color = X.c.ink0, track: Color = X.c.line2, width: Dp = 3.dp) {
    val motion = LocalMotion.current
    val f by animateFloatAsState(fraction.coerceIn(0f, 1f), if (motion.moves) tween(600) else tween(0), label = "ring")
    Canvas(modifier) {
        val w = width.toPx()
        val d = size.minDimension - w
        val tl = Offset((size.width - d) / 2, (size.height - d) / 2)
        drawArc(track, 0f, 360f, false, tl, Size(d, d), style = Stroke(w))
        if (f > 0f) drawArc(color, -90f, 360f * f, false, tl, Size(d, d), style = Stroke(w, cap = StrokeCap.Round))
    }
}

// ── The level seal ──────────────────────────────────────────────────────────

/**
 * A level seal's moving parts, hoisted so a moment can drive them from outside the seal (motes landing on the
 * ring, the ladder's beads, the forge of a level up) and so they outlive a tab switch. Every value is read only
 * in the seal's draw lambda. While [holds] is above 0 a moment owns the ring and the numeral: the seal's own
 * level and progress wait for it to finish.
 */
@Stable
class SealState(level: Int, progress: Float) {
    val ring = Animatable(progress)
    val ringAlpha = Animatable(1f)
    /** The ring flashing xp → light, its stroke 2.5 → 4 dp (a character level's sweep). */
    val ringFlash = Animatable(0f)
    /** The ring's leading head dot, while it moves. */
    val head = Animatable(0f)
    /** A light arc once round: an arrival whose exact value isn't known yet. */
    val glint = Animatable(0f)
    val scale = Animatable(1f)
    val enter = Animatable(1f)
    val enterAlpha = Animatable(1f)
    val glow = Animatable(0f)
    /** The forge: the outline retraced clockwise in light. */
    val trace = Animatable(0f)
    val traceAlpha = Animatable(0f)
    /** The outline flashing light (the full hexagon, a pulse on the cover). */
    val flash = Animatable(0f)
    val beadLit = Array(6) { Animatable(0f) }
    val beadPop = Array(6) { Animatable(1f) }
    val beadFlash = Array(6) { Animatable(0f) }
    var shownLevel by mutableIntStateOf(level)
    var shownTitle by mutableStateOf<String?>(null)
    var holds by mutableIntStateOf(0)

    internal var coords: LayoutCoordinates? = null
    internal var ringRadius = 0f
    internal val lit = FloatArray(6)
    internal val pop = FloatArray(6)
    internal val flashes = FloatArray(6)

    /** The seal's root centre, or null when less than half of it is visible. */
    fun center(): Offset? = coords?.visibleCenter()

    /** The ring's leading tip (where motes land), or null when the seal is less than half visible. */
    fun tip(): Offset? {
        val c = center() ?: return null
        val a = 2 * PI.toFloat() * (ring.value % 1f) - PI.toFloat() / 2
        return Offset(c.x + ringRadius * cos(a), c.y + ringRadius * sin(a))
    }

    /** The seal's circumradius in px (its hexagon is 0.68 of it). */
    fun radius(): Float = ringRadius

    /** A mote lands: the ring moves to [goal] (keeping its velocity), its head dot rides along, the seal bumps. */
    suspend fun arrive(goal: Float, motion: MotionLevel) = coroutineScope {
        if (motion == MotionLevel.STILL) { ring.snapTo(goal); return@coroutineScope }
        launch { scale.bump(1.5f, motion) }
        head.snapTo(1f)
        ring.animateTo(goal, if (motion == MotionLevel.FULL) spring(0.9f, 400f) else tween(300, easing = EaseOut))
        head.animateTo(0f, tween(120))
    }

    /** An arrival with no exact value yet: a light arc runs once round the ring. */
    suspend fun glintOnce() {
        glint.snapTo(0f)
        glint.animateTo(1f, tween(240, easing = EaseInOut))
        glint.snapTo(0f)
    }

    /** The ring to its exact value (the answer came after the motes). */
    suspend fun settleTo(progress: Float, motion: MotionLevel) {
        if (!motion.moves) ring.snapTo(progress) else ring.animateTo(progress, tween(300, easing = EaseOut))
    }

    /** Bead [k] lights (1 → 1.8 → 1 on the bead spring) and rests lit. */
    suspend fun lightBead(k: Int, motion: MotionLevel) = coroutineScope {
        if (k !in 0..5) return@coroutineScope
        if (motion == MotionLevel.STILL) { beadLit[k].snapTo(1f); return@coroutineScope }
        if (motion == MotionLevel.CALM) { beadLit[k].animateTo(1f, tween(160)); return@coroutineScope }
        launch { beadLit[k].animateTo(1f, tween(60)) }
        beadPop[k].animateTo(1.8f, tween(50, easing = EaseOutCubic))
        beadPop[k].animateTo(1f, Spr.bead.spec())
    }

    /** Bead [k] goes out (an undo), over 200 ms. */
    suspend fun dimBead(k: Int, motion: MotionLevel) {
        if (k !in 0..5) return
        if (!motion.moves) beadLit[k].snapTo(0f) else beadLit[k].animateTo(0f, tween(200))
    }

    /** The beads go out in reverse (the run lapsed): 80 ms apart, 240 ms each. */
    suspend fun fadeBeads(motion: MotionLevel) = coroutineScope {
        for (k in 5 downTo 0) {
            if (beadLit[k].value <= 0f) continue
            if (!motion.moves) { beadLit[k].snapTo(0f); continue }
            launch { beadLit[k].animateTo(0f, tween(240)) }
            delay(80)
        }
    }

    /** Lights beads 0 until [n] at once (a seal composed mid-run). */
    suspend fun showBeads(n: Int) {
        for (k in 0 until 6) beadLit[k].snapTo(if (k < n) 1f else 0f)
    }

    /** The full hexagon at the ladder's top: the outline flashes light, .85 → 1 → .85 over 300 ms. */
    suspend fun flashOutline() {
        flash.animateTo(1f, tween(150))
        flash.animateTo(0f, tween(150))
    }

    /** Board clear: the six beads flash light 25 ms apart (scale 1.6 on the bead spring). */
    suspend fun flashBeads() = coroutineScope {
        for (k in 0 until 6) {
            launch {
                delay(25L * k)
                launch { beadPop[k].animateTo(1.6f, tween(40)); beadPop[k].animateTo(1f, Spr.bead.spec()) }
                beadFlash[k].animateTo(1f, tween(60))
                beadFlash[k].animateTo(0f, tween(220))
            }
        }
    }

    /**
     * A level's forge, from now: the outline retraced clockwise in light ([forgeMs], linear, so its passes meet the
     * notes) as each notch flashes and the seal squats to [squat]; then the close: the numeral rolls to [level], the
     * seal pops to [pop] and holds, settles on the big stamp spring, and the glow blooms. [onClose] runs at the close.
     */
    suspend fun forge(level: Int, title: String?, squat: Float, pop: Float, hold: Int, forgeMs: Int, motion: MotionLevel, onClose: () -> Unit) = coroutineScope {
        if (motion == MotionLevel.STILL) {
            shownLevel = level; title?.let { shownTitle = it }
            for (k in 0 until 6) beadFlash[k].snapTo(0f)
            onClose()
            return@coroutineScope
        }
        if (motion == MotionLevel.CALM) {
            // The outline crossfades tone → light → tone, the numeral crossfades, the seal breathes 2%.
            launch { flash.animateTo(1f, tween(150)); flash.animateTo(0f, tween(150)) }
            delay(forgeMs.toLong())
            shownLevel = level; title?.let { shownTitle = it }
            onClose()
            launch { glow.animateTo(0.5f, tween(120)); glow.animateTo(0f, tween(280)) }
            scale.animateTo(1.02f, spring(1f, 900f))
            scale.animateTo(1f, spring(1f, 900f))
            return@coroutineScope
        }
        launch { scale.animateTo(squat, tween(forgeMs, easing = EaseIn)) }
        launch {
            traceAlpha.snapTo(1f)
            trace.snapTo(0f)
            trace.animateTo(1f, tween(forgeMs, easing = androidx.compose.animation.core.LinearEasing))
        }
        for (k in 0 until 6) {
            launch {
                delay((forgeMs / 6L) * k)
                launch { beadPop[k].animateTo(1.8f, tween(40)); beadPop[k].animateTo(1f, Spr.bead.spec()) }
                beadFlash[k].animateTo(1f, tween(40))
            }
        }
        delay(forgeMs.toLong())
        shownLevel = level
        title?.let { shownTitle = it }
        onClose()
        launch { traceAlpha.animateTo(0f, tween(300)) }
        launch { for (k in 0 until 6) launch { beadFlash[k].animateTo(0f, tween(600, easing = EaseOut)) } }
        launch { glow.animateTo(0.9f, tween(90)); glow.animateTo(0f, tween(600, easing = EaseOut)) }
        scale.animateTo(pop, tween(50, easing = EaseOutCubic))
        holdFrames(hold)
        scale.animateTo(1f, Spr.stampBig.spec())
    }
}

@Composable
fun rememberSealState(level: Int, progress: Float): SealState = remember { SealState(level, progress) }

/**
 * The level seal: a pointy-top hexagon with the level's numeral, a bead at each vertex (the tick ladder's rungs,
 * lit in [litColor]), and a progress ring round it when [progress] is given. Its moving parts live in [state]; its
 * ring and numeral follow [level] and [progress] whenever no moment holds them. With [anchorKey], the ring's tip
 * is a live target for motes (fx.anchors).
 */
@Composable
fun LevelSeal(
    level: Int,
    progress: Float?,
    modifier: Modifier = Modifier,
    size: Dp = 52.dp,
    tone: Color = X.c.ink0,
    litColor: Color = X.c.xp,
    state: SealState = rememberSealState(level, progress ?: 0f),
    anchorKey: String? = null,
) {
    val c = X.c
    val motion = LocalMotion.current
    val fx = LocalFx.current
    val density = LocalDensity.current
    LaunchedEffect(level, progress, state.holds) {
        if (state.holds > 0) return@LaunchedEffect
        state.shownLevel = level
        if (progress != null && state.ring.targetValue != progress) {
            if (!motion.moves || state.ring.value == progress) state.ring.snapTo(progress)
            else state.ring.animateTo(progress, tween(300, easing = EaseOut))
        }
    }
    if (anchorKey != null) {
        androidx.compose.runtime.DisposableEffect(anchorKey, state) {
            fx.anchors[anchorKey] = state::tip
            onDispose { if (fx.anchors[anchorKey] != null) fx.anchors.remove(anchorKey) }
        }
    }
    val hex = remember { Path() }
    val ringPx = with(density) { 2.5.dp.toPx() }
    val outlinePx = with(density) { 1.6.dp.toPx() }
    val tracePx = with(density) { 2.dp.toPx() }
    val headPx = with(density) { 2.5.dp.toPx() }
    val beadPx = with(density) { (size.value * 0.035f).coerceIn(1.4f, 2.6f).dp.toPx() }
    val outline = remember(outlinePx) { Stroke(outlinePx, join = StrokeJoin.Round) }
    // The ring's strokes, made once: the track, and the arc from 2.5 dp to 4 dp as it flashes.
    val track = remember(ringPx) { Stroke(ringPx) }
    val arcs = remember(ringPx) { Array(7) { i -> Stroke(ringPx * (1f + 0.1f * i), cap = StrokeCap.Round) } }
    val light = c.light
    val glowColor = c.lightGlow
    Box(
        modifier
            .size(size)
            .onGloballyPositioned { state.coords = it; state.ringRadius = it.size.width / 2f - ringPx / 2 }
            .graphicsLayer {
                val s = state.scale.value * state.enter.value
                scaleX = s; scaleY = s
                alpha = state.enterAlpha.value
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(
            Modifier
                .size(size)
                .drawWithCache {
                    val r = this.size.minDimension / 2
                    // Cached per size: each frame only changes its alpha.
                    val brush = Brush.radialGradient(listOf(glowColor, Color.Transparent), Offset(this.size.width / 2, this.size.height / 2), r * 1.5f)
                    onDrawBehind {
                        val g = state.glow.value
                        if (g > 0f) drawCircle(brush, r * 1.5f, center, alpha = g.coerceIn(0f, 1f))
                    }
                }
        ) {
            val r = this.size.minDimension / 2
            val center = center
            if (progress != null) {
                val fl = state.ringFlash.value.coerceIn(0f, 1f)
                val arc = arcs[(fl * 6).toInt().coerceIn(0, 6)]
                val d = r * 2 - ringPx
                val tl = Offset(ringPx / 2, ringPx / 2)
                val ra = state.ringAlpha.value
                drawArc(c.line2, 0f, 360f, false, tl, Size(d, d), style = track)
                val p = state.ring.value.coerceIn(0f, 1f)
                if (p > 0f && ra > 0f) {
                    drawArc(lerp(litColor, light, fl), -90f, 360f * p, false, tl, Size(d, d), alpha = ra, style = arc)
                    val h = state.head.value
                    if (h > 0f) {
                        val a = 2 * PI.toFloat() * p - PI.toFloat() / 2
                        drawCircle(light, headPx, Offset(center.x + (r - ringPx / 2) * cos(a), center.y + (r - ringPx / 2) * sin(a)), alpha = h * ra)
                    }
                }
                val gl = state.glint.value
                if (gl > 0f && gl < 1f) drawArc(light, -90f + 360f * gl - 40f, 40f, false, tl, Size(d, d), alpha = 0.8f * (1f - gl), style = arc)
            }
            val hr = r * 0.68f
            hexPath(center, hr, hex)
            drawPath(hex, c.face)
            val f = state.flash.value
            drawPath(hex, if (f > 0f) lerp(tone, light, f) else tone, alpha = 0.85f + 0.15f * f, style = outline)
            drawHexTrace(center, hr, state.trace.value, light, tracePx, state.traceAlpha.value)
            for (k in 0 until 6) {
                state.lit[k] = state.beadLit[k].value * 0.75f
                state.pop[k] = state.beadPop[k].value
                state.flashes[k] = state.beadFlash[k].value
            }
            drawBeads(center, hr, beadPx, tone.copy(alpha = 0.35f), litColor, state.lit, state.pop, state.flashes, light)
        }
        val shift = with(density) { 8.dp.roundToPx() }
        AnimatedContent(
            targetState = state.shownLevel,
            transitionSpec = {
                when (motion) {
                    MotionLevel.FULL -> (slideInVertically(spring(0.6f, 700f, IntOffset.VisibilityThreshold)) { shift } + fadeIn(tween(100))) togetherWith
                        (slideOutVertically(tween(90, easing = EaseIn)) { -shift } + fadeOut(tween(90, easing = EaseIn)))
                    MotionLevel.CALM -> fadeIn(tween(160)) togetherWith fadeOut(tween(160))
                    MotionLevel.STILL -> fadeIn(tween(0)) togetherWith fadeOut(tween(0))
                } using null
            },
            label = "numeral",
        ) { n ->
            Text(
                n.toString(), color = Color(0xFFF1F3F8), fontSize = (size.value * 0.3f).sp, fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif, style = androidx.compose.ui.text.TextStyle(fontFeatureSettings = "tnum"),
            )
        }
    }
}

// ── The session's seal: an honest X ────────────────────────────────────────

/**
 * Session complete's 72 dp seal: the navy hexagon stamps down, its outline traces in light as its beads pop,
 * then the node-X lights only the [parts] the run earned (the rest stay a silhouette). [onContact] gets the root
 * centre and circumradius at the stamp's contact; [onLastLit] the same as the last earned part lights.
 */
@Composable
fun SessionSeal(parts: Int, playKey: Int, modifier: Modifier = Modifier, size: Dp = 72.dp, onContact: ((Offset, Float) -> Unit)? = null, onLastLit: ((Offset, Float) -> Unit)? = null) {
    val c = X.c
    val motion = LocalMotion.current
    val play = playKey != 0 && motion.moves
    val scale = remember(playKey) { Animatable(if (play && motion == MotionLevel.FULL) 1.4f else 1f) }
    val alpha = remember(playKey) { Animatable(if (play) 0f else 1f) }
    val trace = remember(playKey) { Animatable(if (play && motion == MotionLevel.FULL) 0f else 1f) }
    val beads = remember(playKey) { Array(6) { Animatable(if (play && motion == MotionLevel.FULL) 0f else 1f) } }
    val lit = remember(playKey) { Array(NodeParts.COUNT) { i -> Animatable(if (!play || motion == MotionLevel.CALM) (if (NodeParts.has(parts, 1 shl i)) 1f else 0f) else 0f) } }
    val glint = remember(playKey) { Animatable(0f) }
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val contact by rememberUpdatedState(onContact)
    val lastLit by rememberUpdatedState(onLastLit)
    fun at(): Pair<Offset, Float>? = coords?.takeIf { it.isAttached }?.let { co -> co.localToRoot(Offset(co.size.width / 2f, co.size.height / 2f)) to co.size.width / 2f * 0.68f }

    LaunchedEffect(playKey) {
        if (!play) return@LaunchedEffect
        if (motion == MotionLevel.CALM) {
            alpha.animateTo(1f, tween(240))
            return@LaunchedEffect
        }
        coroutineScope {
            delay(80)
            launch { alpha.animateTo(1f, tween(80)) }
            scale.animateTo(0.96f, tween(120, easing = EaseIn))
            // S + 200: contact.
            at()?.let { (p, r) -> contact?.invoke(p, r) }
            launch { holdFrames(Dur.HOLD_MACRO); scale.animateTo(1f, Spr.stamp.spec()) }
            launch { trace.animateTo(1f, tween(300, easing = EaseInOut)) }
            for (k in 0 until 6) launch {
                delay(50L * k)
                beads[k].animateTo(1f, Spr.bead.spec())
            }
            fun part(bit: Int, atMs: Long, draw: Int) = launch {
                if (!NodeParts.has(parts, bit)) return@launch
                delay(atMs - 200)
                val i = Integer.numberOfTrailingZeros(bit)
                if (draw > 0) lit[i].animateTo(1f, tween(draw, easing = EaseDraw)) else lit[i].animateTo(1f, Spr.bead.spec())
            }
            part(NodeParts.A, 300, 0)
            part(NodeParts.AB, 300, 160)
            part(NodeParts.B, 460, 0)
            part(NodeParts.D, 420, 0)
            part(NodeParts.DS, 420, 160)
            part(NodeParts.SPARK, 620, 0)
            launch {
                delay(com.xtnl.app.ui.motion.SessionMoment.lastLit(parts) - 200L)
                at()?.let { (p, r) -> lastLit?.invoke(p, r) }
                if (NodeParts.has(parts, NodeParts.SPARK)) {
                    glint.animateTo(1.25f, tween(120, easing = EaseOutCubic))
                    glint.animateTo(1f, tween(80))
                    glint.animateTo(0f, tween(160, easing = EaseIn))
                }
            }
        }
    }
    val hex = remember { Path() }
    val glintPath = remember { Path() }
    val litBuf = remember { FloatArray(NodeParts.COUNT) }
    val beadBuf = remember { FloatArray(6) }
    val popBuf = remember { FloatArray(6) }
    val zero = remember { FloatArray(6) }
    val colors = remember(c) { NodeXColors(c.mint, c.cyan, Color(0xFFEAFFF5), c.ink2.copy(alpha = 0.25f)) }
    val outline = with(LocalDensity.current) { remember { Stroke(1.6.dp.toPx(), join = StrokeJoin.Round) } }
    Canvas(
        modifier
            .size(size)
            .onGloballyPositioned { coords = it }
            .graphicsLayer { scaleX = scale.value; scaleY = scale.value; this.alpha = alpha.value }
    ) {
        val r = this.size.minDimension / 2
        val hr = r * 0.9f
        hexPath(center, hr, hex)
        drawPath(hex, c.face)
        drawPath(hex, c.mint.copy(alpha = 0.45f), style = outline)
        drawHexTrace(center, hr, trace.value, c.light, 2.dp.toPx(), alpha = 1f - 0.6f * trace.value)
        for (k in 0 until 6) { beadBuf[k] = beads[k].value * 0.8f; popBuf[k] = 1f }
        drawBeads(center, hr, 1.8.dp.toPx(), c.mint.copy(alpha = 0.25f), c.mint, beadBuf, popBuf, zero, c.light)
        for (i in 0 until NodeParts.COUNT) litBuf[i] = lit[i].value
        drawNodeX(center, hr, litBuf, colors, silhouette = true, glint = glint.value, glintTurn = 30f * glint.value, glintPath = glintPath)
    }
}

// ── The combo: a node-X lighting part by part ──────────────────────────────

/**
 * The session bar's combo pill: a 22 dp node-X on raised (its nodes at least 1.8 dp, its strokes 1.5 dp, so a lit part
 * reads), its unlit parts a faint silhouette, lighting the next part as the combo climbs (×2 node A, ×3 A→B, ×4 node B,
 * ×5 D→S, ×6 the spark and its glint, which replays from ×7). The X is the "×": the figure beside it is bare. A
 * break puts the parts out in reverse and the pill shrinks away; its slot closes on the glide spring.
 */
@Composable
fun ComboX(combo: Int, modifier: Modifier = Modifier) {
    val c = X.c
    val motion = LocalMotion.current
    var shown by remember { mutableStateOf(combo >= 2) }
    var number by remember { mutableIntStateOf(combo) }
    val lit = remember { Array(NodeParts.COUNT) { i -> Animatable(if (NodeParts.has(com.xtnl.app.ui.motion.ComboMoment.parts(combo), 1 shl i)) 1f else 0f) } }
    val scale = remember { Animatable(1f) }
    val alpha = remember { Animatable(1f) }
    val glint = remember { Animatable(0f) }
    var last by remember { mutableIntStateOf(combo) }
    LaunchedEffect(combo) {
        val prev = last
        last = combo
        if (combo == prev) return@LaunchedEffect
        val target = com.xtnl.app.ui.motion.ComboMoment.parts(combo)
        if (!motion.moves) {
            shown = combo >= 2; number = combo
            for (i in 0 until NodeParts.COUNT) lit[i].snapTo(if (NodeParts.has(target, 1 shl i)) 1f else 0f)
            return@LaunchedEffect
        }
        if (combo >= 2) {
            if (!shown) {
                shown = true
                alpha.snapTo(1f)
                if (motion == MotionLevel.FULL) { scale.snapTo(0.6f); launch { scale.animateTo(1.08f, tween(90, easing = EaseOutCubic)); scale.animateTo(1f, Spr.stamp.spec()) } }
            }
            number = combo
            delay(if (motion == MotionLevel.FULL) 240 else 0)
            coroutineScope {
                for (i in 0 until NodeParts.COUNT) {
                    val on = NodeParts.has(target, 1 shl i)
                    if (on && lit[i].value < 1f) launch {
                        val stroke = (1 shl i) == NodeParts.AB || (1 shl i) == NodeParts.DS
                        when {
                            motion == MotionLevel.CALM -> lit[i].animateTo(1f, tween(160))
                            stroke -> lit[i].animateTo(1f, tween(160, easing = EaseDraw))
                            else -> lit[i].animateTo(1f, Spr.bead.spec())
                        }
                    }
                }
                if (combo >= 6 && motion == MotionLevel.FULL) launch {
                    delay(60)
                    glint.snapTo(0f)
                    glint.animateTo(1.25f, tween(110, easing = EaseOutCubic))
                    glint.animateTo(1f, tween(90))
                    glint.animateTo(0f, tween(220, easing = EaseIn))
                }
            }
        } else if (shown) {
            // The break: parts out in reverse, then the pill shrinks and fades. Silent.
            if (motion == MotionLevel.FULL) {
                delay(120)
                coroutineScope {
                    var k = 0
                    for (i in NodeParts.COUNT - 1 downTo 0) {
                        if (lit[i].value <= 0f) continue
                        val d = 30L * k++
                        launch { delay(d); lit[i].animateTo(0f, tween(120)) }
                    }
                    launch { delay(140); launch { scale.animateTo(0.9f, tween(160)) }; alpha.animateTo(0f, tween(160)) }
                }
            } else {
                alpha.animateTo(0f, tween(140))
                for (i in 0 until NodeParts.COUNT) lit[i].snapTo(0f)
            }
            shown = false
            scale.snapTo(1f)
            number = combo
        }
    }
    val litBuf = remember { FloatArray(NodeParts.COUNT) }
    val glintPath = remember { Path() }
    val colors = remember(c) { NodeXColors(c.mint, c.cyan, if (c.dark) Color(0xFFEAFFF5) else c.ink0, c.ink2.copy(alpha = 0.12f)) }
    val density = LocalDensity.current
    val minNode = with(density) { 1.8.dp.toPx() }
    val minStroke = with(density) { 1.5.dp.toPx() }
    Row(modifier.animateContentSize(motion.spr(Spr.glide)), verticalAlignment = Alignment.CenterVertically) {
        if (shown) {
            Row(
                Modifier
                    .graphicsLayer { scaleX = scale.value; scaleY = scale.value; this.alpha = alpha.value }
                    .clip(PillShape)
                    .background(c.raised)
                    .padding(start = 5.dp, end = 8.dp, top = 1.dp, bottom = 1.dp)
                    .clearAndSetSemantics { contentDescription = "Combo times $number" },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Canvas(Modifier.size(22.dp)) {
                    for (i in 0 until NodeParts.COUNT) litBuf[i] = lit[i].value
                    drawNodeX(
                        center, this.size.minDimension / 2 * 1.15f, litBuf, colors, silhouette = true, glint = glint.value, glintTurn = 30f * glint.value,
                        glintPath = glintPath, minNode = minNode, minStroke = minStroke,
                    )
                }
                Spacer(Modifier.width(2.dp))
                com.xtnl.app.ui.motion.RollingNumber(number, style = MaterialTheme.typography.labelLarge, color = c.ink0)
            }
        }
    }
}


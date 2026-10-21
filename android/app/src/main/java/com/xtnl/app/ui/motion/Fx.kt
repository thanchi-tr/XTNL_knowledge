package com.xtnl.app.ui.motion

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.animation.core.Easing
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RadialGradientShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.channels.Channel
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/** How the effects sit on each theme: Night adds light (Plus) and glows; Vellum washes, with fewer particles. */
class FxStyle(val dark: Boolean) {
    val blend: BlendMode = if (dark) BlendMode.Plus else BlendMode.SrcOver
    val glowAlpha: Float = if (dark) 1f else 0.55f
    val countFactor: Float = if (dark) 1f else 0.7f

    fun n(count: Int): Int = max(1, (count * countFactor).roundToInt())
}

/**
 * One overlay over the whole window for the moments that cross the layout:
 * streak and shard bursts, shock rings, motes that carry a reward to where
 * it is kept, edges, surface chips, and the new idea's seal flying to the
 * Review tab. One Canvas in its own layer, drawing in root coordinates; one
 * long-lived frame loop that runs only while something is alive and
 * suspends when idle (120 Hz on the Fold). Time is frame time, divided by
 * the system's animator scale.
 *
 * Rewards rise from where the value lives and land where it is kept: a
 * mote's target is a key, re-read every frame ([anchors] first, then
 * [targets]), so a target that scrolls still catches it. Seeded randomness:
 * the same moment draws the same burst. Particles, motes, flights, shocks
 * and edges are Full motion only.
 */
class FxState {
    enum class Shape(internal val id: Int, internal val light: Boolean) {
        DOT(ParticlePool.Shape.DOT, true), EMBER(ParticlePool.Shape.DOT, false), STREAK(ParticlePool.Shape.STREAK, true),
        SHARD(ParticlePool.Shape.SHARD, false), SPARK(ParticlePool.Shape.SPARK, true), LOZENGE(ParticlePool.Shape.LOZENGE, true),
        RAY(ParticlePool.Shape.RAY, true), RING(-1, true),
    }

    enum class ChipDir { UP, END }
    enum class Glyph { NONE, SPARK, LOZENGE, TICK }
    /** Which way a flight bows: up (to the bar) or toward the start edge (to the rail). */
    enum class Bow { UP, START }
    /** A mote's path: leading off toward its target at an angle, an arc over the chord, or up beside an edge (round a card). */
    enum class MotePath { LEAD, ARC, AROUND }

    internal val pool = ParticlePool(160)

    internal class Shock(
        val c: Offset, val r0: Float, val r1: Float, val w0: Float, val w1: Float, val life: Float, val color: Color,
        val hex: Boolean, val fill: Boolean, val alpha0: Float, val light: Boolean, val id: String?, var age: Float = 0f,
    )

    /** A mote: a quadratic from [from] by [control] to its target, or a cubic when it has a [control2]. */
    internal class Mote(
        val from: Offset, val control: Offset, val target: String, var last: Offset, val delay: Float, val life: Float,
        val shape: Shape, val color: Color, val core: Color?, val size0: Float, val size1: Float, val id: String?, val index: Int,
        val onArrive: ((Int) -> Unit)?, val ease: Easing, val control2: Offset? = null, var age: Float = 0f, var fadeAt: Float = -1f,
    )

    internal class Edge(
        val from: Offset, val to: Offset, val control: Offset, val draw: Float, val hold: Float, val retract: Float, val fade: Float,
        val reach: Float, val color: Color, val width: Float, val head: Float, val headColor: Color, val dash: Float, val id: String?, var age: Float = 0f,
    )

    internal class Flight(
        val from: Offset, val toKey: String, var to: Offset, val life: Float, val size0: Float, val size1: Float, val face: Color, val rim: Color,
        val glow: Color, val bow: Bow, val id: String?, val onLand: () -> Unit, var age: Float = 0f, var x: Float = from.x, var y: Float = from.y,
        var vx: Float = 0f, var vy: Float = 0f,
    )

    internal class Chip(
        val at: Offset, val layout: TextLayoutResult, val glyph: Glyph, val glyphColor: Color, val bg: Color, val dir: ChipDir,
        val dist: Float, val life: Float, val id: String?, var age: Float = 0f,
    )

    internal class Cue(val at: Float, val id: String?, val block: () -> Unit, var age: Float = 0f)

    internal val shocks = ArrayList<Shock>()
    internal val motes = ArrayList<Mote>()
    internal val edges = ArrayList<Edge>()
    internal val flights = ArrayList<Flight>()
    internal val chips = ArrayList<Chip>()
    internal val cues = ArrayList<Cue>()
    private val due = ArrayList<Cue>()

    internal var frame by mutableLongStateOf(0L)
    private val wake = Channel<Unit>(Channel.CONFLATED)
    internal var density = 2.625f
    internal var measurer: TextMeasurer? = null

    var motion: MotionLevel = MotionLevel.FULL
        internal set
    var style: FxStyle = FxStyle(true)
        internal set
    /** The system's animator duration scale: time runs faster or slower with it. */
    internal var animScale = 1f

    /** Where things land, in root coordinates: the nav items' centres ("review", "check", …) and the new idea ("idea"). */
    val targets = HashMap<String, Offset>()

    /** Live targets, read every frame (the seal ring's tip, the session's points, the queue's end): null when not visible. */
    val anchors = HashMap<String, () -> Offset?>()

    /** A counter per target that ticks when something lands on it (the nav icon squashes). */
    val bumps = mutableStateMapOf<String, Int>()

    /** Runs with a cancelled moment's id (the activity drops its pending sounds and beats). */
    var onCancel: ((String) -> Unit)? = null

    /** Told when the loop starts and stops (the activity asks for the display's high frame rate meanwhile). */
    var onAlive: ((Boolean) -> Unit)? = null

    fun alive() = pool.count > 0 || shocks.isNotEmpty() || motes.isNotEmpty() || edges.isNotEmpty() || flights.isNotEmpty() || chips.isNotEmpty() || cues.isNotEmpty()

    private fun dp(v: Float) = v * density

    /** Where [key] is now: its anchor if it has one (null when it isn't visible), else its target. */
    fun resolve(key: String): Offset? {
        val a = anchors[key]
        return if (a != null) a() else targets[key]
    }

    private fun woke() { wake.trySend(Unit) }

    /** Lands [key]: its bump counter ticks. */
    fun land(key: String) {
        bumps[key] = (bumps[key] ?: 0) + 1
    }

    // ── Spawning ────────────────────────────────────────────────────────────

    /**
     * A burst of [n] from the edge of a circle ([edgeRadius] px) round [center]: evenly spread from [startAngle]
     * (degrees, 0 = right) over [arc], each jittered ±[jitter]°. Speeds in dp/s, drag per second (exponential),
     * gravity in dp/s² (matter only). A share [sparkShare] of them are spinning [sparkColor] stars.
     */
    fun burst(
        center: Offset, edgeRadius: Float, n: Int, colors: List<Color>, seed: Int, shape: Shape = Shape.STREAK,
        speed: ClosedFloatingPointRange<Float> = 240f..340f, drag: Float = 10f, gravity: Float = 0f,
        life: ClosedFloatingPointRange<Float> = 0.30f..0.42f, startAngle: Float = 0f, arc: Float = 360f, jitter: Float = 10f,
        size0: Float = 2.2f, size1: Float = 0.8f, spin: Float = 0f, upBias: Float = 0f,
        sparkShare: Float = 0f, sparkColor: Color = Color.Unspecified, id: String? = null,
    ) {
        if (!motion.particles || colors.isEmpty() || n <= 0) return
        val r = Random(seed)
        val count = style.n(n)
        for (i in 0 until count) {
            val deg = startAngle + i * arc / count + (r.nextFloat() * 2 - 1) * jitter
            val a = deg * PI.toFloat() / 180f
            val s = dp(speed.start + r.nextFloat() * (speed.endInclusive - speed.start))
            val spark = sparkShare > 0f && r.nextFloat() < sparkShare
            val sh = if (spark) Shape.SPARK else shape
            val c = if (spark) sparkColor else colors[i % colors.size]
            val l = life.start + r.nextFloat() * (life.endInclusive - life.start)
            // A streak tapers from size0 to size1 (dp); anything else is sized within size0..size1 and halves as it goes.
            val s0 = when { spark -> dp(4f); sh == Shape.STREAK -> dp(size0); else -> dp(size0 + r.nextFloat() * (size1 - size0)) }
            val s1 = when { spark -> dp(2f); sh == Shape.STREAK -> dp(size1); else -> s0 * 0.5f }
            pool.spawn(
                center.x + cos(a) * edgeRadius, center.y + sin(a) * edgeRadius, cos(a) * s, sin(a) * s - dp(upBias), l,
                s0, s1, c.toArgb(), sh.id, light = sh.light,
                drag = drag, gravity = dp(gravity), rot = r.nextFloat() * 360f,
                vrot = if (spark) 540f else spin * (r.nextFloat() * 2 - 1), owner = id,
            )
        }
        woke()
    }

    /**
     * Shards from a hexagon's six vertices (radius [r]): [n] in all, fanned ±[fan]° about each vertex's angle,
     * with an upward bias; and [rays] (a ray per vertex, [rayDp] long) when asked.
     */
    fun vertexBurst(
        center: Offset, r: Float, n: Int, colors: List<Color>, seed: Int, fan: Float = 12f,
        speed: ClosedFloatingPointRange<Float> = 220f..380f, drag: Float = 1.6f, gravity: Float = 1000f,
        life: ClosedFloatingPointRange<Float> = 0.65f..0.85f, size: ClosedFloatingPointRange<Float> = 4f..6.5f,
        upBias: Float = 120f, rays: Boolean = true, rayColor: Color = Color.Unspecified, rayDp: Float = 14f, id: String? = null,
    ) {
        if (!motion.particles) return
        val rnd = Random(seed)
        val count = style.n(n)
        for (i in 0 until count) {
            val k = i % 6
            val per = (count + 5 - k) / 6
            val j = i / 6
            val spread = if (per <= 1) 0f else -fan + 2 * fan * j / (per - 1).coerceAtLeast(1)
            val deg = -90f + 60f * k + spread + (rnd.nextFloat() * 2 - 1) * 3f
            val a = deg * PI.toFloat() / 180f
            val v = hexVertex(center, r, k)
            val s = dp(speed.start + rnd.nextFloat() * (speed.endInclusive - speed.start))
            val sz = dp(size.start + rnd.nextFloat() * (size.endInclusive - size.start))
            pool.spawn(
                v.x, v.y, cos(a) * s, sin(a) * s - dp(upBias), life.start + rnd.nextFloat() * (life.endInclusive - life.start),
                sz, sz * 0.6f, colors[i % colors.size].toArgb(), ParticlePool.Shape.SHARD, light = false,
                drag = drag, gravity = dp(gravity), rot = rnd.nextFloat() * 360f, vrot = 540f * (rnd.nextFloat() * 2 - 1), owner = id,
            )
        }
        if (rays) rays(center, r, rayColor.takeIf { it.isSpecified } ?: colors.first(), rayDp, id)
        woke()
    }

    private val Color.isSpecified get() = this != Color.Unspecified

    /** Six rays from a hexagon's vertices: 2 dp wide, [travelDp] out, in 260 ms. */
    fun rays(center: Offset, r: Float, color: Color, travelDp: Float = 14f, id: String? = null) {
        if (!motion.particles) return
        for (k in 0 until 6) {
            val v = hexVertex(center, r, k)
            val a = (-90f + 60f * k) * PI.toFloat() / 180f
            pool.spawn(v.x, v.y, cos(a) * dp(travelDp), sin(a) * dp(travelDp), 0.26f, dp(2f), dp(6f), color.toArgb(), ParticlePool.Shape.RAY, light = true, owner = id)
        }
        woke()
    }

    /** Light dots that ring [center] from [r0] outward (a combo milestone): no gravity, a short life. */
    fun ring(center: Offset, r0: Float, n: Int, color: Color, speedDp: Float, drag: Float, life: Float, seed: Int, id: String? = null) {
        if (!motion.particles) return
        val rnd = Random(seed)
        for (i in 0 until n) {
            val a = (i * 360f / n + rnd.nextFloat() * 8f) * PI.toFloat() / 180f
            pool.spawn(center.x + cos(a) * r0, center.y + sin(a) * r0, cos(a) * dp(speedDp), sin(a) * dp(speedDp), life, dp(2.2f), dp(1.2f), color.toArgb(), ParticlePool.Shape.DOT, light = true, drag = drag, owner = id)
        }
        woke()
    }

    /**
     * Embers that rise and drift up (matter, with buoyancy): the first tick of the day under the flame. Each leaves
     * 35 ms after the last at its own speed (70 dp/s ± 30%) and height, and fades within 0.4 s, below the title.
     */
    fun embers(center: Offset, n: Int, color: Color, seed: Int) {
        if (!motion.particles) return
        val rnd = Random(seed)
        for (i in 0 until n) {
            val x = center.x + dp((rnd.nextFloat() * 2 - 1) * 4f)
            val y = center.y + dp((rnd.nextFloat() * 2 - 1) * 2f)
            val vx = dp((rnd.nextFloat() * 2 - 1) * 20f)
            val vy = -dp(70f * (0.7f + 0.6f * rnd.nextFloat()))
            val life = 0.34f + rnd.nextFloat() * 0.06f
            cue(35 * i) {
                pool.spawn(x, y, vx, vy, life, dp(1.8f), dp(0.8f), color.toArgb(), ParticlePool.Shape.DOT, light = false, drag = 1.5f, gravity = -dp(40f))
                woke()
            }
        }
    }

    /**
     * A shock ring round [center]: radius [r0] → [r1] and width [w0] → [w1] (px) in [ms] on EaseOut, from [alpha0] to
     * nothing; a hexagon when [hex], a filled disc (a flash) when [fill]. [light] ones add light on Night.
     */
    fun shock(center: Offset, r0: Float, r1: Float, w0: Float, ms: Int, color: Color, hex: Boolean = false, id: String? = null, w1: Float = 0f, alpha0: Float = 1f, fill: Boolean = false, light: Boolean = true) {
        if (!motion.particles) return
        shocks += Shock(center, r0, r1, w0, w1, ms / 1000f, color, hex, fill, alpha0, light, id)
        woke()
    }

    /**
     * [n] motes from [from] to the target [toKey] (re-read every frame), each [durMs] on MoteEase, [staggerMs] apart,
     * starting [delayMs] from now. A LEAD path first heads [sideDp] toward the target, turned ±[spreadDeg] (seeded);
     * aimed at a point on a ring round [ring] (the seal's tip), it comes in from outside the ring instead, on the
     * source's side, so it never crosses the seal. An ARC bows [apexDp] over the chord; AROUND runs up beside the
     * edge at [edgeX] (its widest point just there), round a card rather than over its words. [onArrive] runs as each
     * lands (its index). Returns the last arrival in ms from now, or −1 when nothing flew (no target, or not Full motion).
     */
    fun motes(
        from: Offset, toKey: String, n: Int, shape: Shape, color: Color, size0Dp: Float, size1Dp: Float, seed: Int,
        durMs: Int = Dur.MOTE, staggerMs: Int = 20, delayMs: Int = 0, path: MotePath = MotePath.LEAD, sideDp: Float = 56f,
        spreadDeg: Float = 30f, apexDp: Float = 50f, ring: Offset? = null, edgeX: Float = 0f, core: Color? = null, id: String? = null,
        ease: Easing = MoteEase, onArrive: ((Int) -> Unit)? = null,
    ): Int {
        if (!motion.particles || n <= 0) return -1
        val to = resolve(toKey) ?: return -1
        val rnd = Random(seed)
        val dx = to.x - from.x
        val dy = to.y - from.y
        val d = max(1f, hypot(dx, dy))
        for (k in 0 until n) {
            var control2: Offset? = null
            val control = when (path) {
                MotePath.LEAD -> if (ring != null) {
                    // Out past the tip (1.2–1.8 radii) and along the ring toward the source (2.2–2.8 radii): the last
                    // stretch comes in from outside, square to the ring.
                    val rx = to.x - ring.x
                    val ry = to.y - ring.y
                    val rr = max(1f, hypot(rx, ry))
                    val nx = rx / rr
                    val ny = ry / rr
                    var tx = -ny
                    var ty = nx
                    if ((from.x - ring.x) * tx + (from.y - ring.y) * ty < 0) { tx = -tx; ty = -ty }
                    val out = rr * (1.2f + 0.6f * rnd.nextFloat())
                    val side = rr * (2.2f + 0.6f * rnd.nextFloat())
                    Offset(to.x + nx * out + tx * side, to.y + ny * out + ty * side)
                } else {
                    val turn = (if (k % 2 == 0) 1f else -1f) * spreadDeg * (0.5f + 0.5f * rnd.nextFloat()) * PI.toFloat() / 180f
                    val ux = dx / d
                    val uy = dy / d
                    val c = cos(turn)
                    val s = sin(turn)
                    Offset(from.x + (ux * c - uy * s) * dp(sideDp), from.y + (ux * s + uy * c) * dp(sideDp))
                }
                MotePath.ARC -> {
                    // The curve's apex is half the control's offset: the control sits 2 × apex over the chord, upward.
                    var nx = -dy / d
                    var ny = dx / d
                    if (ny > 0) { nx = -nx; ny = -ny }
                    Offset((from.x + to.x) / 2 + nx * dp(apexDp) * 2, (from.y + to.y) / 2 + ny * dp(apexDp) * 2)
                }
                MotePath.AROUND -> {
                    // A cubic with both controls at x = cx, level with each end: its widest point (t = .5) is
                    // .125 (from + to) + .75 cx, set on the edge.
                    val cx = (edgeX - 0.125f * (from.x + to.x)) / 0.75f
                    control2 = Offset(cx, to.y)
                    Offset(cx, from.y)
                }
            }
            motes += Mote(
                from, control, toKey, to, (delayMs + k * staggerMs) / 1000f, durMs / 1000f, shape, color, core,
                dp(size0Dp), dp(size1Dp), id, k, onArrive, ease, control2,
            )
        }
        woke()
        return delayMs + (n - 1) * staggerMs + durMs
    }

    /**
     * An edge from [from] toward [to], bowed by [bend] (px, over the chord): it draws in [drawMs] (EaseDraw) as far as
     * [reach] of the way, holds [holdMs], then retracts in [retractMs] (EaseIn) or fades in [fadeMs] (EaseIn).
     */
    fun edge(
        from: Offset, to: Offset, bend: Float, drawMs: Int, color: Color, width: Float, head: Float, headColor: Color,
        holdMs: Int = 0, retractMs: Int = 0, fadeMs: Int = 0, reach: Float = 1f, dash: Float = 0f, id: String? = null,
    ) {
        if (!motion.particles) return
        val d = max(1f, (to - from).getDistance())
        var nx = -(to.y - from.y) / d
        var ny = (to.x - from.x) / d
        if (ny > 0) { nx = -nx; ny = -ny }
        val control = Offset((from.x + to.x) / 2 + nx * bend, (from.y + to.y) / 2 + ny * bend)
        edges += Edge(from, to, control, drawMs / 1000f, holdMs / 1000f, retractMs / 1000f, fadeMs / 1000f, reach, color, width, head, headColor, dash, id)
        woke()
    }

    /**
     * The new idea's seal flies from [from] to the target [to] (a nav item), re-read every frame. Its length follows
     * the distance ([flightMs]); it shrinks from [startSize] to [endSize] (EaseIn) on a curve bowed [bow]. [onLand] runs
     * as it lands. Returns the flight's length in ms, or −1 when it didn't fly (not Full motion, no target): then
     * [onLand] has already run.
     */
    fun fly(from: Offset, to: String, startSize: Float, endSize: Float, face: Color, rim: Color, glow: Color, bow: Bow, id: String? = null, onLand: () -> Unit): Int {
        val target = resolve(to)
        if (!motion.particles || target == null) {
            land(to)
            onLand()
            return -1
        }
        val ms = flightMs((target - from).getDistance() / density)
        flights += Flight(from, to, target, ms / 1000f, startSize, endSize, face, rim, glow, bow, id, onLand = { land(to); onLand() })
        woke()
        return ms
    }

    /**
     * A surface chip (the off-screen fallback for a reward that can't travel): [text] after a [glyph], on [bg],
     * rising (UP) or sliding toward the end (END) [distDp] over [durMs]. Calm: a short rise in place. Still: nothing
     * (the snackbar says it in words).
     */
    fun chip(at: Offset, text: String, textColor: Color, bg: Color, glyph: Glyph = Glyph.NONE, glyphColor: Color = textColor, dir: ChipDir = ChipDir.UP, distDp: Float = 16f, durMs: Int = 900, id: String? = null) {
        if (!motion.moves) return
        val m = measurer ?: return
        // Measured once, as it spawns: nothing is laid out per frame.
        val layout = m.measure(text, TextStyle(color = textColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"))
        val dist = if (motion == MotionLevel.FULL) dp(distDp) else dp(min(distDp, 8f))
        chips += Chip(at, layout, glyph, glyphColor, bg, dir, dist, durMs / 1000f, id)
        woke()
    }

    /** Runs [block] [atMs] from now on the frame clock, as part of moment [id]. */
    fun cue(atMs: Int, id: String? = null, block: () -> Unit) {
        if (atMs <= 0) { block(); return }
        cues += Cue(atMs / 1000f, id, block)
        woke()
    }

    /** Drops moment [id]: its motes and particles fade out over 80 ms, its cues, edges and shocks go, and its sounds and beats ([onCancel]). */
    fun cancel(id: String) {
        pool.fade(id, 0.08f)
        for (m in motes) if (m.id == id && m.fadeAt < 0f) m.fadeAt = m.age
        cues.removeAll { it.id == id }
        edges.removeAll { it.id == id }
        shocks.removeAll { it.id == id }
        onCancel?.invoke(id)
    }

    /**
     * The display changed under everything (a fold, an unfold, a new layout): flights land at once without their
     * landing sound, motes deliver at once, particles fade out over 120 ms, and cues, edges and shocks are dropped.
     */
    fun settleAll() {
        for (f in flights.toList()) {
            f.id?.let { onCancel?.invoke(it) }
            f.onLand()
        }
        flights.clear()
        for (m in motes.toList()) if (m.fadeAt < 0f) m.onArrive?.invoke(m.index)
        motes.clear()
        pool.fade(null, 0.12f)
        cues.clear()
        edges.clear()
        shocks.clear()
        chips.clear()
    }

    // ── The clock ───────────────────────────────────────────────────────────

    /** The long-lived frame loop: steps while anything is alive, suspends when idle. */
    internal suspend fun run() {
        while (true) {
            if (!alive()) {
                if (frame != 0L) frame = 0L
                onAlive?.invoke(false)
                wake.receive()
                if (!alive()) continue
                onAlive?.invoke(true)
            }
            var last = -1L
            while (alive()) {
                withFrameNanos { now ->
                    val dt = if (last < 0) 0f else (now - last) / 1_000_000_000f
                    last = now
                    step(dt / animScale.coerceAtLeast(0.05f))
                    frame = now
                }
            }
        }
    }

    internal fun step(dt: Float) {
        val d = dt.coerceIn(0f, 0.05f)
        pool.step(d)
        var i = 0
        while (i < shocks.size) {
            val s = shocks[i]
            s.age += d
            if (s.age >= s.life) shocks.removeAt(i) else i++
        }
        i = 0
        while (i < motes.size) {
            val m = motes[i]
            m.age += d
            val t = (m.age - m.delay) / m.life
            if (m.fadeAt >= 0f && m.age - m.fadeAt >= 0.08f) { motes.removeAt(i); continue }
            if (t >= 1f && m.fadeAt < 0f) {
                motes.removeAt(i)
                m.onArrive?.invoke(m.index)
                continue
            }
            resolve(m.target)?.let { m.last = it }
            i++
        }
        i = 0
        while (i < edges.size) {
            val e = edges[i]
            e.age += d
            if (e.age >= e.draw + e.hold + max(e.retract, e.fade)) edges.removeAt(i) else i++
        }
        i = 0
        while (i < flights.size) {
            val f = flights[i]
            f.age += d
            resolve(f.toKey)?.let { f.to = it }
            val t = (f.age / f.life).coerceAtMost(1f)
            val p = flightPos(f, t)
            if (d > 0f) { f.vx = (p.x - f.x) / d; f.vy = (p.y - f.y) / d }
            f.x = p.x; f.y = p.y
            if (t >= 1f) {
                flights.removeAt(i)
                f.onLand()
            } else i++
        }
        i = 0
        while (i < chips.size) {
            val c = chips[i]
            c.age += d
            if (c.age >= c.life) chips.removeAt(i) else i++
        }
        if (cues.isNotEmpty()) {
            due.clear()
            i = 0
            while (i < cues.size) {
                val c = cues[i]
                c.age += d
                if (c.age >= c.at) { due += c; cues.removeAt(i) } else i++
            }
            for (c in due) c.block()
            due.clear()
        }
    }

    internal fun flightPos(f: Flight, t: Float): Offset {
        val e = EaseInOut.transform(t.coerceIn(0f, 1f))
        val dx = f.to.x - f.from.x
        val dy = f.to.y - f.from.y
        val dist = max(1f, hypot(dx, dy))
        var nx = -dy / dist
        var ny = dx / dist
        // The bow: up toward the bar on the cover, toward the rail (the start edge) on the main display.
        when (f.bow) {
            Bow.UP -> if (ny > 0) { nx = -nx; ny = -ny }
            Bow.START -> if (nx > 0) { nx = -nx; ny = -ny }
        }
        val mid = Offset((f.from.x + f.to.x) / 2 + nx * dist * 0.28f, (f.from.y + f.to.y) / 2 + ny * dist * 0.28f)
        return quad(f.from, mid, f.to, e)
    }

    internal fun motePos(m: Mote, t: Float): Offset {
        val e = m.ease.transform(t.coerceIn(0f, 1f))
        val c2 = m.control2
        return if (c2 != null) cubic(m.from, m.control, c2, m.last, e) else quad(m.from, m.control, m.last, e)
    }
}

val LocalFx = staticCompositionLocalOf { FxState() }

/**
 * Where a laid-out thing's centre is (root coordinates), or null when less than [min] of it is visible: its
 * scrolling parents and the window clip it. A reward aimed at a hidden target falls back (its nav item, a chip).
 */
fun LayoutCoordinates.visibleCenter(min: Float = 0.5f): Offset? {
    if (!isAttached) return null
    val w = size.width
    val h = size.height
    if (w <= 0 || h <= 0) return null
    val seen = boundsInWindow()
    if (seen.width * seen.height < min * w * h) return null
    return localToRoot(Offset(w / 2f, h / 2f))
}

@Composable
fun FxLayer(state: FxState, motion: MotionLevel, dark: Boolean, animScale: Float = 1f, modifier: Modifier = Modifier) {
    val density = LocalDensity.current.density
    val measurer = rememberTextMeasurer()
    SideEffect {
        state.motion = motion
        state.density = density
        state.measurer = measurer
        state.animScale = if (animScale > 0f) animScale else 1f
        if (state.style.dark != dark) state.style = FxStyle(dark)
    }
    LaunchedEffect(state) { state.run() }
    val paths = remember { FxPaths() }
    // Its own layer, with no alpha on it, so light added on Night (Plus) blends with the content beneath.
    Canvas(modifier.fillMaxSize().graphicsLayer()) {
        if (state.frame == 0L && !state.alive()) return@Canvas
        val st = state.style
        for (s in state.shocks) drawShock(state, s, paths, st)
        drawParticles(state, paths, st)
        for (e in state.edges) drawEdge(e, st)
        for (m in state.motes) drawMote(state, m, paths, st)
        for (f in state.flights) drawFlight(state, f, paths, st)
        for (c in state.chips) drawChip(state, c, paths)
    }
}

/** The overlay's reusable paths, strokes and glow shaders: nothing is built per frame. */
internal class FxPaths {
    val shard = Path()
    val spark = Path()
    val loz = Path()
    val hex = Path()
    private val strokes = arrayOfNulls<Stroke>(257)
    private val hexStrokes = arrayOfNulls<Stroke>(257)
    private val glowColors = LongArray(8)
    private val glowBrushes = arrayOfNulls<ShaderBrush>(8)
    private var glowNext = 0

    /** A stroke of about [w] px (quarter-pixel steps), made once. */
    fun stroke(w: Float, round: Boolean = false): Stroke {
        val k = (w * 4).roundToInt().coerceIn(1, 256)
        val cache = if (round) hexStrokes else strokes
        return cache[k] ?: (if (round) Stroke(k / 4f, join = StrokeJoin.Round) else Stroke(k / 4f)).also { cache[k] = it }
    }

    /** A unit radial glow of [c] (centre 0,0, radius 1), scaled and stretched where it is drawn. */
    fun glow(c: Color): ShaderBrush {
        val key = c.value.toLong()
        for (i in 0 until 8) if (glowBrushes[i] != null && glowColors[i] == key) return glowBrushes[i]!!
        val b = ShaderBrush(RadialGradientShader(Offset.Zero, 1f, listOf(c, c.copy(alpha = c.alpha * 0.35f), c.copy(alpha = 0f)), listOf(0f, 0.45f, 1f)))
        val at = glowNext
        glowNext = (glowNext + 1) % 8
        glowColors[at] = key
        glowBrushes[at] = b
        return b
    }
}

private fun DrawScope.drawShock(state: FxState, s: FxState.Shock, paths: FxPaths, st: FxStyle) {
    val t = (s.age / s.life).coerceIn(0f, 1f)
    val e = EaseOut.transform(t)
    val a = s.alpha0 * (1f - t)
    if (a <= 0f) return
    val blend = if (s.light) st.blend else BlendMode.SrcOver
    val r = s.r0 + (s.r1 - s.r0) * e
    if (s.fill) {
        drawCircle(s.color, r, s.c, alpha = a, blendMode = blend)
        return
    }
    val w = s.w0 + (s.w1 - s.w0) * e
    if (w <= 0.2f) return
    if (s.hex) drawPath(hexPath(s.c, r, paths.hex), s.color, alpha = a, style = paths.stroke(w, round = true), blendMode = blend)
    else drawCircle(s.color, r, s.c, alpha = a, style = paths.stroke(w), blendMode = blend)
}

private fun DrawScope.drawParticles(state: FxState, paths: FxPaths, st: FxStyle) {
    val p = state.pool
    val d = state.density
    for (i in 0 until p.count) {
        val alpha = p.alpha(i)
        if (alpha <= 0f) continue
        val t = p.t(i)
        val c = Color(p.color[i])
        val blend = if (p.light[i]) st.blend else BlendMode.SrcOver
        val x = p.x[i]
        val y = p.y[i]
        val size = p.size0[i] + (p.size1[i] - p.size0[i]) * t
        when (p.shape[i]) {
            ParticlePool.Shape.DOT -> drawCircle(c, size, Offset(x, y), alpha = alpha, blendMode = blend)
            ParticlePool.Shape.STREAK -> {
                val vx = p.vx[i]
                val vy = p.vy[i]
                val v = sqrt(vx * vx + vy * vy)
                if (v < 1f) continue
                // Its length follows its speed: |v| × 22 ms, within 1.5–10 dp, and never more than it has travelled
                // (born on a disc's rim, its tail never crosses the disc).
                val len = min((v * 0.022f).coerceIn(1.5f * d, 10f * d), hypot(x - p.x0[i], y - p.y0[i]))
                if (len < 0.5f) continue
                drawLine(c, Offset(x - vx / v * len, y - vy / v * len), Offset(x, y), size, StrokeCap.Round, alpha = alpha, blendMode = blend)
            }
            ParticlePool.Shape.SHARD -> {
                val s = p.size0[i]
                val path = paths.shard
                path.reset()
                path.moveTo(0f, -s); path.lineTo(s * 0.55f, 0f); path.lineTo(0f, s); path.lineTo(-s * 0.55f, 0f); path.close()
                translate(x, y) { rotate(p.rot[i], Offset.Zero) { drawPath(path, c, alpha = alpha, blendMode = blend) } }
            }
            ParticlePool.Shape.SPARK -> {
                sparkPath(paths.spark, Offset(x, y), size, size * 0.28f, p.rot[i])
                drawPath(paths.spark, c, alpha = alpha, blendMode = blend)
            }
            ParticlePool.Shape.LOZENGE -> drawLozenge(paths, Offset(x, y), size, c, alpha, d)
            ParticlePool.Shape.RAY -> {
                val e = EaseOut.transform(t)
                val ox = x + p.vx[i] * e
                val oy = y + p.vy[i] * e
                val tail = 0.45f
                drawLine(c, Offset(x + p.vx[i] * e * tail, y + p.vy[i] * e * tail), Offset(ox, oy), p.size0[i], StrokeCap.Round, alpha = alpha, blendMode = blend)
            }
        }
    }
}

private fun DrawScope.drawLozenge(paths: FxPaths, c: Offset, size: Float, color: Color, alpha: Float, density: Float) {
    val path = paths.loz
    path.reset()
    path.moveTo(c.x, c.y - size); path.lineTo(c.x + size * 0.66f, c.y); path.lineTo(c.x, c.y + size); path.lineTo(c.x - size * 0.66f, c.y); path.close()
    drawPath(path, color, alpha = alpha * 0.3f)
    drawPath(path, color, alpha = alpha, style = paths.stroke(1.5f * density, round = true))
}

private fun DrawScope.drawEdge(e: FxState.Edge, st: FxStyle) {
    val drawT = (e.age / e.draw).coerceIn(0f, 1f)
    var progress = EaseDraw.transform(drawT)
    var alpha = 1f
    val after = e.age - e.draw - e.hold
    if (after > 0f) {
        if (e.retract > 0f) progress = 1f - EaseIn.transform((after / e.retract).coerceIn(0f, 1f))
        if (e.fade > 0f) alpha = 1f - EaseIn.transform((after / e.fade).coerceIn(0f, 1f))
    }
    drawEdge(e.from, e.to, e.control, progress, e.reach, e.color, e.width, e.head, e.headColor, e.dash, alpha, st.blend)
}

private fun DrawScope.drawMote(state: FxState, m: FxState.Mote, paths: FxPaths, st: FxStyle) {
    val t = (m.age - m.delay) / m.life
    if (t < 0f) return
    val pos = state.motePos(m, t)
    val size = m.size0 + (m.size1 - m.size0) * t.coerceIn(0f, 1f)
    var alpha = (t / 0.12f).coerceIn(0f, 1f)
    if (m.fadeAt >= 0f) alpha *= (1f - (m.age - m.fadeAt) / 0.08f).coerceIn(0f, 1f)
    if (alpha <= 0f) return
    val blend = if (m.shape.light) st.blend else BlendMode.SrcOver
    // A short tail back along its own path (a frame at 60 Hz behind): the same at any frame rate.
    val back = state.motePos(m, t - 0.05f)
    drawLine(m.color, back, pos, size * 0.45f, StrokeCap.Round, alpha = alpha * 0.4f, blendMode = blend)
    when (m.shape) {
        FxState.Shape.LOZENGE -> drawLozenge(paths, pos, size, m.color, alpha, state.density)
        FxState.Shape.RING -> drawCircle(m.color, size, pos, alpha = alpha, style = paths.stroke(1.5f * state.density))
        FxState.Shape.DOT, FxState.Shape.EMBER -> drawCircle(m.color, size * 0.5f, pos, alpha = alpha, blendMode = blend)
        else -> {
            sparkPath(paths.spark, pos, size, size * 0.3f, 0f)
            drawPath(paths.spark, m.color, alpha = alpha, blendMode = blend)
            m.core?.let { drawCircle(it, size * 0.22f, pos, alpha = alpha, blendMode = blend) }
        }
    }
}

private fun DrawScope.drawFlight(state: FxState, f: FxState.Flight, paths: FxPaths, st: FxStyle) {
    val t = (f.age / f.life).coerceIn(0f, 1f)
    val pos = Offset(f.x, f.y)
    val size = f.size0 + (f.size1 - f.size0) * EaseIn.transform(t)
    val r = size / 2
    // The trail: eight samples back along the curve, fading.
    for (k in 1..8) {
        val tk = t - 0.025f * k
        if (tk <= 0f) break
        val p = state.flightPos(f, tk)
        drawCircle(f.glow, r * 0.3f * (1f - k / 9f), p, alpha = 0.5f * (1f - k / 8f), blendMode = st.blend)
    }
    // The glow, stretched along the velocity (dp/s): sx = 1 + min(.25, |v|/4000), sy = 1/sx.
    val v = hypot(f.vx, f.vy) / state.density
    val sx = 1f + min(0.25f, v / 4000f)
    val angle = atan2(f.vy, f.vx) * 180f / PI.toFloat()
    val g = r * 2.2f
    withTransform({
        translate(pos.x, pos.y)
        rotate(angle, Offset.Zero)
        scale(sx * g, g / sx, Offset.Zero)
    }) {
        drawCircle(paths.glow(f.glow), 1f, Offset.Zero, alpha = st.glowAlpha, blendMode = st.blend)
    }
    hexPath(pos, r, paths.hex)
    drawPath(paths.hex, f.face)
    drawPath(paths.hex, f.rim, style = paths.stroke(max(1f, r * 0.14f), round = true))
    drawCircle(f.rim, r * 0.2f, pos)
}

private fun DrawScope.drawChip(state: FxState, c: FxState.Chip, paths: FxPaths) {
    val t = (c.age / c.life).coerceIn(0f, 1f)
    val travel = c.dist * EaseOut.transform(t)
    val alpha = when {
        c.age < 0.12f -> c.age / 0.12f
        t > 0.6f -> 1f - (t - 0.6f) / 0.4f
        else -> 1f
    }.coerceIn(0f, 1f)
    if (alpha <= 0f) return
    val d = state.density
    val padX = 10f * d
    val padY = 5f * d
    val glyphW = if (c.glyph == FxState.Glyph.NONE) 0f else 16f * d
    val w = c.layout.size.width + padX * 2 + glyphW
    val h = c.layout.size.height + padY * 2
    val cx = if (c.dir == FxState.ChipDir.END) c.at.x + travel else c.at.x
    val cy = if (c.dir == FxState.ChipDir.UP) c.at.y - travel else c.at.y
    val left = cx - w / 2
    val top = cy - h / 2
    drawRoundRect(c.bg, Offset(left, top), Size(w, h), CornerRadius(h / 2, h / 2), alpha = alpha)
    val gc = Offset(left + padX + 5f * d, cy)
    when (c.glyph) {
        FxState.Glyph.SPARK -> {
            sparkPath(paths.spark, gc, 6f * d, 1.6f * d)
            drawPath(paths.spark, c.glyphColor, alpha = alpha)
        }
        FxState.Glyph.LOZENGE -> drawLozenge(paths, gc, 6f * d, c.glyphColor, alpha, d)
        FxState.Glyph.TICK -> drawCheck(gc, 7f * d, 1f, 1f, c.glyphColor, 2f * d, alpha)
        FxState.Glyph.NONE -> Unit
    }
    drawText(c.layout, topLeft = Offset(left + padX + glyphW, top + padY), alpha = alpha)
}

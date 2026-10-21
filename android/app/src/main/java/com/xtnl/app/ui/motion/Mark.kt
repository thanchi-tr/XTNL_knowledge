package com.xtnl.app.ui.motion

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/*
 * The brand's marks, drawn: the hexagonal seal with a bead at each vertex
 * (the tick ladder's six rungs), the node-X of the app icon (art/xtnl-icon.svg),
 * the two-leg check that every "kept" shares, and an edge between two things.
 * Plain DrawScope calls on precomputed geometry: nothing allocated per frame.
 */

/** The node-X in units of the seal's radius (the icon's hexagon is r 36 about 50,50). */
object NodeX {
    val A = Offset(-0.2874f, -0.4564f)
    val B = Offset(0.4876f, 0.4908f)
    val D = Offset(-0.5026f, 0.4908f)
    /** The spark: the top-right node, lit. */
    val S = Offset(0.2293f, -0.3488f)
    const val R_A = 0.099f
    const val R_B = 0.0646f
    const val R_D = 0.0495f
    const val R_SPARK = 0.10f
    const val R_CORE = 0.069f
    const val W_AB = 0.0861f
    const val W_DS = 0.0689f
}

/** The X's colours: the mint strokes and nodes, cyan B, the spark's core; [silhouette] draws the unlit parts. */
class NodeXColors(val mint: Color, val cyan: Color, val core: Color, val silhouette: Color)

/** A pointy-top hexagon's vertex [k] (0 = top, clockwise). */
fun hexVertex(c: Offset, r: Float, k: Int): Offset {
    val a = (-90f + 60f * k) * PI.toFloat() / 180f
    return Offset(c.x + r * cos(a), c.y + r * sin(a))
}

/** A pointy-top hexagon around [c] of circumradius [r]: the rank seal's shape. */
fun hexPath(c: Offset, r: Float, path: Path = Path()): Path {
    path.reset()
    for (k in 0 until 6) {
        val v = hexVertex(c, r, k)
        if (k == 0) path.moveTo(v.x, v.y) else path.lineTo(v.x, v.y)
    }
    path.close()
    return path
}

/** The hexagon's outline from the top vertex, clockwise, as far as [progress] (0..1): the forge's retrace. */
fun DrawScope.drawHexTrace(c: Offset, r: Float, progress: Float, color: Color, width: Float, alpha: Float = 1f, blend: BlendMode = BlendMode.SrcOver) {
    val p = progress.coerceIn(0f, 1f) * 6f
    if (p <= 0f || alpha <= 0f) return
    for (k in 0 until 6) {
        val seg = (p - k).coerceIn(0f, 1f)
        if (seg <= 0f) break
        val a = hexVertex(c, r, k)
        val b = hexVertex(c, r, (k + 1) % 6)
        drawLine(color, a, Offset(a.x + (b.x - a.x) * seg, a.y + (b.y - a.y) * seg), width, StrokeCap.Round, alpha = alpha, blendMode = blend)
    }
}

/**
 * The seal's six beads, one per vertex at radius [r]: each idle in [idle], lit ([lit] 0..1) toward [litColor],
 * popped by [pop] (its scale), and flashed toward [flashColor] by [flash].
 */
fun DrawScope.drawBeads(c: Offset, r: Float, beadR: Float, idle: Color, litColor: Color, lit: FloatArray, pop: FloatArray, flash: FloatArray, flashColor: Color) {
    for (k in 0 until 6) {
        val v = hexVertex(c, r, k)
        val l = lit[k].coerceIn(0f, 1f)
        val f = flash[k].coerceIn(0f, 1f)
        val s = pop[k].coerceAtLeast(0f)
        drawCircle(idle, beadR, v)
        if (l > 0f) drawCircle(litColor, beadR * s, v, alpha = l)
        if (f > 0f) drawCircle(flashColor, beadR * s, v, alpha = f)
    }
}

/**
 * The node-X at [c] for a seal of radius [r]: every part as a [NodeXColors.silhouette] first (when given), then each
 * lit part by its progress in [parts] (A, A→B, B, D, D→S, spark; a node pops by its value, a stroke draws by it).
 * [glint] (0..1+) is the spark's four-point glint, turned by [glintTurn] degrees. Drawn small, no node is under
 * [minNode] px in radius and no stroke under [minStroke] px wide, so each part still reads.
 */
fun DrawScope.drawNodeX(
    c: Offset, r: Float, parts: FloatArray, colors: NodeXColors, silhouette: Boolean, glint: Float = 0f, glintTurn: Float = 0f,
    glintPath: Path? = null, alpha: Float = 1f, minNode: Float = 0f, minStroke: Float = 0f,
) {
    fun at(o: Offset) = Offset(c.x + o.x * r, c.y + o.y * r)
    val a = at(NodeX.A); val b = at(NodeX.B); val d = at(NodeX.D); val s = at(NodeX.S)
    val rA = max(NodeX.R_A * r, minNode)
    val rB = max(NodeX.R_B * r, minNode)
    val rD = max(NodeX.R_D * r, minNode)
    val rS = max(NodeX.R_SPARK * r, minNode)
    val wAB = max(NodeX.W_AB * r, minStroke)
    val wDS = max(NodeX.W_DS * r, minStroke)
    if (silhouette) {
        val sc = colors.silhouette
        drawLine(sc, a, b, wAB, StrokeCap.Round, alpha = alpha)
        drawLine(sc, d, s, wDS, StrokeCap.Round, alpha = alpha)
        drawCircle(sc, rA, a, alpha = alpha)
        drawCircle(sc, rB, b, alpha = alpha)
        drawCircle(sc, rD, d, alpha = alpha)
        drawCircle(sc, rS, s, alpha = alpha)
    }
    val ab = parts[1].coerceIn(0f, 1f)
    if (ab > 0f) drawLine(colors.mint, a, Offset(a.x + (b.x - a.x) * ab, a.y + (b.y - a.y) * ab), wAB, StrokeCap.Round, alpha = alpha)
    val ds = parts[4].coerceIn(0f, 1f)
    if (ds > 0f) drawLine(colors.mint, d, Offset(d.x + (s.x - d.x) * ds, d.y + (s.y - d.y) * ds), wDS, StrokeCap.Round, alpha = alpha * 0.85f)
    if (parts[0] > 0f) drawCircle(colors.mint, rA * parts[0], a, alpha = alpha)
    if (parts[2] > 0f) drawCircle(colors.cyan, rB * parts[2], b, alpha = alpha)
    if (parts[3] > 0f) drawCircle(colors.mint, rD * parts[3], d, alpha = alpha * 0.7f)
    if (parts[5] > 0f) {
        drawCircle(colors.mint, rS * parts[5], s, alpha = alpha * 0.85f)
        drawCircle(colors.core, rS * (NodeX.R_CORE / NodeX.R_SPARK) * parts[5], s, alpha = alpha)
    }
    if (glint > 0f && glintPath != null) {
        val g = r * 0.26f * glint
        sparkPath(glintPath, s, g, g * 0.085f, glintTurn)
        drawPath(glintPath, colors.core, alpha = alpha * glint.coerceAtMost(1f))
    }
}

/** A four-point star at [c] (arm [arm], waist [waist]) turned by [turn] degrees, into [path]: the glint and the SPARK particle. */
fun sparkPath(path: Path, c: Offset, arm: Float, waist: Float, turn: Float = 0f): Path {
    path.reset()
    val t = turn * PI.toFloat() / 180f
    for (k in 0 until 8) {
        val rr = if (k % 2 == 0) arm else waist
        val a = t + k * PI.toFloat() / 4f - PI.toFloat() / 2f
        val x = c.x + rr * cos(a)
        val y = c.y + rr * sin(a)
        if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    return path
}

/**
 * The shared two-leg check: leg 1 (the short stroke, 35% of the path) then leg 2, each by its progress (0..1),
 * round-capped. Every "kept" draws this one: a task, a right answer, a work item's Done, the Board clear seal.
 */
fun DrawScope.drawCheck(c: Offset, r: Float, leg1: Float, leg2: Float, color: Color, width: Float, alpha: Float = 1f) {
    if (leg1 <= 0f) return
    val p0 = Offset(c.x - r * 0.42f, c.y + r * 0.02f)
    val p1 = Offset(c.x - r * 0.12f, c.y + r * 0.32f)
    val p2 = Offset(c.x + r * 0.45f, c.y - r * 0.30f)
    val l1 = leg1.coerceIn(0f, 1f)
    drawLine(color, p0, Offset(p0.x + (p1.x - p0.x) * l1, p0.y + (p1.y - p0.y) * l1), width, StrokeCap.Round, alpha = alpha)
    val l2 = leg2.coerceIn(0f, 1f)
    if (l2 > 0f) drawLine(color, p1, Offset(p1.x + (p2.x - p1.x) * l2, p1.y + (p2.y - p1.y) * l2), width, StrokeCap.Round, alpha = alpha)
}

/** The check's one progress (0..1) split into its legs: leg 1 is the first 35%. */
fun checkLeg1(p: Float) = (p / 0.35f).coerceIn(0f, 1f)
fun checkLeg2(p: Float) = ((p - 0.35f) / 0.65f).coerceIn(0f, 1f)

/** A point on the quadratic Bézier [p0] → [p2] (control [p1]) at [t]. */
fun quad(p0: Offset, p1: Offset, p2: Offset, t: Float): Offset {
    val u = 1f - t
    return Offset(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y)
}

/** A point on the cubic Bézier [p0] → [p3] (controls [p1], [p2]) at [t]. */
fun cubic(p0: Offset, p1: Offset, p2: Offset, p3: Offset, t: Float): Offset {
    val u = 1f - t
    val a = u * u * u
    val b = 3 * u * u * t
    val c = 3 * u * t * t
    val d = t * t * t
    return Offset(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y)
}

/**
 * An edge from [from] toward [to] (bowed by [control]): drawn from its start as far as [progress] × [reach] of the
 * way (in 16 segments, dashed when [dashOn] > 0), with a round [head] dot at its tip in [headColor].
 */
fun DrawScope.drawEdge(from: Offset, to: Offset, control: Offset, progress: Float, reach: Float, color: Color, width: Float, head: Float, headColor: Color, dashOn: Float = 0f, alpha: Float = 1f, blend: BlendMode = BlendMode.SrcOver) {
    val end = (progress * reach).coerceIn(0f, 1f)
    if (end <= 0f || alpha <= 0f) return
    val n = if (dashOn > 0f) 48 else 16
    var prev = from
    var run = 0f
    for (i in 1..n) {
        val t = end * i / n
        val p = quad(from, control, to, t)
        if (dashOn <= 0f) {
            drawLine(color, prev, p, width, StrokeCap.Round, alpha = alpha)
        } else {
            // Dashes by arc length: on for dashOn, off for dashOn.
            val len = (p - prev).getDistance()
            val phase = ((run / dashOn).toInt() % 2 == 0)
            if (phase) drawLine(color, prev, p, width, StrokeCap.Butt, alpha = alpha)
            run += len
        }
        prev = p
    }
    if (head > 0f) drawCircle(headColor, head, prev, alpha = alpha, blendMode = blend)
}


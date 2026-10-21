package com.xtnl.app.ui.motion

import kotlin.math.exp

/**
 * The particles' one physics model, as plain arrays (struct of arrays: no
 * object per particle, nothing allocated per frame). Positions are px and
 * speeds px/s (callers convert from dp). Drag is exponential and integrated
 * exactly, so a burst travels the same at 60 or 120 Hz:
 *
 *   v(t) = g/k + (v0 − g/k)·e^(−k·t)      x(t) = x0 + (g/k)·t + (v0 − g/k)·(1 − e^(−k·t))/k
 *
 * Gravity applies only to matter (shards, embers): a light-class particle
 * (streak, spark, mote, ray, a light dot) never falls. At most [capacity]
 * live at once; a new one past that takes the oldest's slot. Dead ones are
 * swap-removed, so the live ones are always 0 until [count].
 */
class ParticlePool(val capacity: Int = 160) {
    object Shape {
        const val DOT = 0
        const val STREAK = 1
        const val SHARD = 2
        const val SPARK = 3
        const val LOZENGE = 4
        /** A ray: from its origin (x, y) along (vx, vy) — direction × travel — on EaseOut; no physics. */
        const val RAY = 5
    }

    var count = 0
        private set
    val x = FloatArray(capacity)
    val y = FloatArray(capacity)
    /** Where each was born: a streak's tail never reaches back past it (into the disc it left). */
    val x0 = FloatArray(capacity)
    val y0 = FloatArray(capacity)
    val vx = FloatArray(capacity)
    val vy = FloatArray(capacity)
    val age = FloatArray(capacity)
    val life = FloatArray(capacity)
    /** Size at birth and at death (a dot shrinks, a streak tapers, a ray's width and length). */
    val size0 = FloatArray(capacity)
    val size1 = FloatArray(capacity)
    val rot = FloatArray(capacity)
    val vrot = FloatArray(capacity)
    val drag = FloatArray(capacity)
    val gravity = FloatArray(capacity)
    /** Colour as ARGB (Color.toArgb()). */
    val color = IntArray(capacity)
    val shape = IntArray(capacity)
    val light = BooleanArray(capacity)
    /** A forced fade (cancel, settle): the age it started at (−1: none) and its length. */
    val fadeAt = FloatArray(capacity)
    val fadeLen = FloatArray(capacity)
    /** The moment each belongs to, for [fade]. */
    val owner = arrayOfNulls<String>(capacity)
    private val born = LongArray(capacity)
    private var seq = 0L

    /** Adds one and returns its slot. */
    fun spawn(
        x: Float, y: Float, vx: Float, vy: Float, life: Float, size0: Float, size1: Float, color: Int, shape: Int,
        light: Boolean, drag: Float = 0f, gravity: Float = 0f, rot: Float = 0f, vrot: Float = 0f, owner: String? = null,
    ): Int {
        val i = if (count < capacity) count++ else oldest()
        this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy
        x0[i] = x; y0[i] = y
        age[i] = 0f; this.life[i] = life.coerceAtLeast(0.001f)
        this.size0[i] = size0; this.size1[i] = size1
        this.rot[i] = rot; this.vrot[i] = vrot
        this.drag[i] = drag
        this.gravity[i] = if (light) 0f else gravity
        this.color[i] = color; this.shape[i] = shape; this.light[i] = light
        fadeAt[i] = -1f; fadeLen[i] = 0f
        this.owner[i] = owner
        born[i] = seq++
        return i
    }

    private fun oldest(): Int {
        var at = 0
        for (i in 1 until count) if (born[i] < born[at]) at = i
        return at
    }

    /** Advances every particle by [dt] seconds; the spent ones leave. */
    fun step(dt: Float) {
        if (dt <= 0f) return
        var i = 0
        while (i < count) {
            age[i] += dt
            val spent = age[i] >= life[i] || (fadeAt[i] >= 0f && age[i] - fadeAt[i] >= fadeLen[i])
            if (spent) { remove(i); continue }
            if (shape[i] != Shape.RAY) {
                val k = drag[i]
                val g = gravity[i]
                if (k > 1e-4f) {
                    val e = exp(-k * dt)
                    val ix = vx[i]
                    val iy = vy[i] - g / k
                    x[i] += ix * (1f - e) / k
                    y[i] += (g / k) * dt + iy * (1f - e) / k
                    vx[i] = ix * e
                    vy[i] = g / k + iy * e
                } else {
                    x[i] += vx[i] * dt
                    y[i] += vy[i] * dt + 0.5f * g * dt * dt
                    vy[i] += g * dt
                }
                rot[i] += vrot[i] * dt
            }
            i++
        }
    }

    /** 0..1 through its life. */
    fun t(i: Int): Float = (age[i] / life[i]).coerceIn(0f, 1f)

    /** Its opacity: full, then out by the square of its age, and a forced fade on top. */
    fun alpha(i: Int): Float {
        val t = t(i)
        var a = 1f - t * t
        if (fadeAt[i] >= 0f) a *= (1f - (age[i] - fadeAt[i]) / fadeLen[i]).coerceIn(0f, 1f)
        return a.coerceIn(0f, 1f)
    }

    /** Fades [owner]'s particles (all, when null) out over [seconds]. */
    fun fade(owner: String?, seconds: Float) {
        for (i in 0 until count) {
            if (owner != null && this.owner[i] != owner) continue
            if (fadeAt[i] < 0f) { fadeAt[i] = age[i]; fadeLen[i] = seconds.coerceAtLeast(0.001f) }
        }
    }

    fun clear() { count = 0 }

    private fun remove(i: Int) {
        val last = --count
        if (i == last) { owner[i] = null; return }
        x[i] = x[last]; y[i] = y[last]; vx[i] = vx[last]; vy[i] = vy[last]; x0[i] = x0[last]; y0[i] = y0[last]
        age[i] = age[last]; life[i] = life[last]; size0[i] = size0[last]; size1[i] = size1[last]
        rot[i] = rot[last]; vrot[i] = vrot[last]; drag[i] = drag[last]; gravity[i] = gravity[last]
        color[i] = color[last]; shape[i] = shape[last]; light[i] = light[last]
        fadeAt[i] = fadeAt[last]; fadeLen[i] = fadeLen[last]; owner[i] = owner[last]; born[i] = born[last]
        owner[last] = null
    }
}

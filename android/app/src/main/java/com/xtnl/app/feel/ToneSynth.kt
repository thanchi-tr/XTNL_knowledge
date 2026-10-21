package com.xtnl.app.feel

import com.xtnl.app.core.TickLadder
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Short soft tones, synthesized (no audio files): the web's celebrate.ts
 * partials, rendered to 16-bit mono PCM and wrapped as WAV for SoundPool.
 * Each partial is a sine with a quick linear attack and an exponential decay.
 *
 * One key: every tone is in E major, around the tick's E5 pentatonic ladder,
 * and a miss is always quieter than any success. Rendered at the device's
 * native rate (normally 48 kHz), so SoundPool never resamples.
 */
object ToneSynth {
    const val RATE = 48_000

    /**
     * One partial: frequency (Hz), delay (s), length (s), peak (0..1 of full scale), and its attack (s; the default
     * is a pluck's 5 ms for short partials, 12 ms for long ones). An [overtone] rides a voiced note (a harmonic, or
     * the clack's inharmonic one): it isn't a pitch of its own.
     */
    data class Partial(val hz: Double, val delay: Double, val length: Double, val peak: Double, val attack: Double? = null, val overtone: Boolean = false)

    /** The web's gains are tuned for laptop speakers through WebAudio; the phone's speaker wants a little more. */
    private const val LIFT = 3.6
    /** Soft: no mix ever peaks above this. */
    const val CEILING = 0.22

    private const val PLUCK_ATTACK = 0.005
    private const val ATTACK = 0.012

    // E major, equal tempered.
    const val B3 = 246.94
    const val E4 = 329.63
    const val B4 = 493.88
    const val E5 = 659.26
    const val GS5 = 830.61
    const val B5 = 987.77
    const val E6 = 1318.51
    const val GS6 = 1661.22
    const val B6 = 1975.53

    private fun p(hz: Double, delay: Double, length: Double, peak: Double, attack: Double? = null, overtone: Boolean = false) =
        Partial(hz, delay, length, peak * LIFT, attack, overtone)

    /** The tick's pluck at a ladder step: the note, its octave, and a 25 ms pen-tap at the twelfth. */
    fun pluck(step: Int): List<Partial> {
        val f = TickLadder.frequency(step)
        return listOf(p(f, 0.0, 0.20, 0.034), p(f * 2, 0.0, 0.08, 0.014, overtone = true), p(f * 3, 0.0, 0.025, 0.004, overtone = true))
    }

    /** From the ladder's fourth rung: a brighter tap. */
    fun pluckBright(step: Int): List<Partial> {
        val f = TickLadder.frequency(step)
        return listOf(p(f, 0.0, 0.20, 0.034), p(f * 2, 0.0, 0.08, 0.014, overtone = true), p(f * 3, 0.0, 0.04, 0.006, overtone = true))
    }

    /** A mote banked: two small high notes. */
    val BANK = listOf(p(E6, 0.0, 0.12, 0.012, attack = 0.003), p(B6, 0.03, 0.10, 0.008, attack = 0.003))
    /** Board clear, a combo milestone. */
    val CHIME = listOf(p(E5, 0.0, 0.35, 0.030), p(B5, 0.0, 0.32, 0.04), p(E6, 0.09, 0.45, 0.04), p(GS6, 0.20, 0.50, 0.018))
    /** A card's level: four notes at 0, 100, 200 and 300 ms, on the forge's beats. */
    val ASCEND = listOf(p(B4, 0.0, 0.6, 0.04), p(E5, 0.10, 0.6, 0.04), p(GS5, 0.20, 0.7, 0.04), p(B5, 0.30, 0.9, 0.04), p(E6, 0.30, 0.9, 0.024))
    /** The character's level: the same, with a slow low E under the chord and a high G♯ after it. */
    val ASCEND_BIG = ASCEND + listOf(p(E4, 0.30, 1.0, 0.02, attack = 0.120), p(GS6, 0.40, 0.9, 0.012))
    /** Session complete, honestly: one, two or three notes (seal1, seal2, seal3). */
    fun seal(notes: Int): List<Partial> = buildList {
        add(p(E4, 0.0, 0.5, 0.04))
        if (notes >= 2) add(p(B4, 0.16, 0.5, 0.04))
        if (notes >= 3) { add(p(E5, 0.32, 0.7, 0.04)); add(p(GS5, 0.32, 0.7, 0.024)) }
    }
    /** A new idea's seal stamped. */
    val STAMP = listOf(p(E5, 0.0, 0.35, 0.04), p(B5, 0.07, 0.35, 0.03))
    /** The seal lands on Review. */
    val LAND = listOf(p(E6, 0.0, 0.30, 0.02), p(B6, 0.04, 0.25, 0.012))
    /** A miss: two low, quiet, short notes. Calm, never a buzzer. */
    val SOFT = listOf(p(E4, 0.0, 0.16, 0.024), p(B3, 0.06, 0.20, 0.020))
    /** A work item's Done: a short wooden clack at a fixed pitch (B4 and an inharmonic 3.93×). */
    val CLACK = listOf(p(B4, 0.0, 0.12, 0.026, attack = 0.002), p(B4 * 3.93, 0.0, 0.04, 0.008, overtone = true))
    /** An idea folded into one you have. */
    val MERGE = listOf(p(B4, 0.0, 0.14, 0.020))

    /** Every tone the app plays, by name (the cache's files and SoundPool's ids). */
    fun palette(): Map<String, List<Partial>> = buildMap {
        for (s in TickLadder.STEPS.indices) put("pluck$s", pluck(s))
        for (s in 3 until TickLadder.STEPS.size) put("pluckBright$s", pluckBright(s))
        put("bank", BANK)
        put("chime", CHIME)
        put("ascend", ASCEND)
        put("ascendBig", ASCEND_BIG)
        for (n in 1..3) put("seal$n", seal(n))
        put("stamp", STAMP)
        put("land", LAND)
        put("soft", SOFT)
        put("clack", CLACK)
        put("merge", MERGE)
    }

    /** 20 ms of silence: played on the first touch to wake the audio path before the first pluck. */
    fun silence(rate: Int = RATE): FloatArray = FloatArray((0.02 * rate).toInt())

    /** Renders the partials to samples in -1..1, normalised under [CEILING]. */
    fun render(partials: List<Partial>, rate: Int = RATE): FloatArray {
        val end = partials.maxOf { it.delay + it.length } + 0.03
        val n = (end * rate).toInt()
        val out = FloatArray(n)
        for (p in partials) {
            val start = (p.delay * rate).toInt()
            val len = (p.length * rate).toInt()
            val attack = (p.attack ?: if (p.length <= 0.2) PLUCK_ATTACK else ATTACK).coerceAtMost(p.length * 0.9)
            val aN = (attack * rate).toInt().coerceAtLeast(1)
            val peak = min(p.peak, CEILING)
            val w = 2 * PI * p.hz / rate
            for (i in 0 until len) {
                val idx = start + i
                if (idx >= n) break
                val t = i.toDouble() / rate
                val env = if (i < aN) peak * i / aN
                else peak * (0.0001 / peak).pow((t - attack) / (p.length - attack))
                out[idx] += (sin(w * i) * env).toFloat()
            }
        }
        val max = out.maxOfOrNull { kotlin.math.abs(it) } ?: 0f
        if (max > CEILING) {
            val k = (CEILING / max).toFloat()
            for (i in out.indices) out[i] *= k
        }
        // A 3 ms fade at the end so the buffer never clicks off.
        val fade = (0.003 * rate).toInt()
        for (i in 0 until min(fade, n)) out[n - 1 - i] *= i.toFloat() / fade
        return out
    }

    /** 16-bit mono PCM in a RIFF/WAVE container. */
    fun wav(samples: FloatArray, rate: Int = RATE): ByteArray {
        val data = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (s in samples) data.putShort((s.coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort())
        val pcm = data.array()
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray()); putInt(36 + pcm.size); put("WAVE".toByteArray())
            put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1); putInt(rate); putInt(rate * 2); putShort(2); putShort(16)
            put("data".toByteArray()); putInt(pcm.size)
        }.array()
        return ByteArrayOutputStream(44 + pcm.size).apply { write(header); write(pcm) }.toByteArray()
    }
}

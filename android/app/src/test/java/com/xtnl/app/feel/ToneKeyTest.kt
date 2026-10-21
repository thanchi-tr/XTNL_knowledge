package com.xtnl.app.feel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.pow

/** One key: every voiced partial is a pitch of E major (equal tempered), and a miss is the quietest sound. */
class ToneKeyTest {
    /** Every E-major pitch from E2 to E8, in Hz. */
    private val eMajor: List<Double> = (40..112).filter { m -> (m % 12) in setOf(4, 6, 8, 9, 11, 1, 3) }.map { 440.0 * 2.0.pow((it - 69) / 12.0) }

    @Test fun everyVoicedPartialIsInEMajor() {
        for ((name, partials) in ToneSynth.palette()) {
            for (p in partials.filter { !it.overtone }) {
                val nearest = eMajor.minOf { abs(it - p.hz) }
                assertTrue("$name: ${p.hz} Hz is ${"%.2f".format(nearest)} Hz from E major", nearest <= 1.0)
            }
        }
    }

    @Test fun everyToneStaysUnderTheCeiling() {
        for ((name, partials) in ToneSynth.palette()) {
            val samples = ToneSynth.render(partials, 48_000)
            assertTrue(name, samples.all { abs(it) <= ToneSynth.CEILING + 1e-6f })
            assertTrue("$name makes a sound", samples.any { abs(it) > 0.01f })
        }
    }

    @Test fun aMissIsQuieterThanAnySuccess() {
        fun peak(p: List<ToneSynth.Partial>) = ToneSynth.render(p, 48_000).maxOf { abs(it) }
        val soft = peak(ToneSynth.SOFT)
        for (success in listOf(ToneSynth.pluck(0), ToneSynth.CHIME, ToneSynth.ASCEND, ToneSynth.seal(1), ToneSynth.STAMP)) {
            assertTrue(soft < peak(success))
        }
    }

    @Test fun theSealIsHonest() {
        assertEquals(1, ToneSynth.seal(1).size)
        assertEquals(2, ToneSynth.seal(2).size)
        assertEquals(4, ToneSynth.seal(3).size)
        // ASCEND's notes land on the forge's beats: 0, 100, 200 and 300 ms.
        assertEquals(listOf(0.0, 0.10, 0.20, 0.30), ToneSynth.ASCEND.map { it.delay }.distinct())
    }

    @Test fun rendersAtTheNativeRate() {
        val at44 = ToneSynth.render(ToneSynth.BANK, 44_100)
        val at48 = ToneSynth.render(ToneSynth.BANK, 48_000)
        assertEquals(at48.size.toDouble() / at44.size, 48_000.0 / 44_100, 0.01)
    }
}

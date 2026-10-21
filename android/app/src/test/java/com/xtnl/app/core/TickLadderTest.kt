package com.xtnl.app.core

import com.xtnl.app.feel.ToneSynth
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

class TickLadderTest {
    @Test fun theLadderIsAMajorPentatonicToTheOctave() {
        assertArrayEquals(intArrayOf(0, 2, 4, 7, 9, 12), TickLadder.STEPS)
    }

    @Test fun ticksWithin90sClimbAndHoldAtTheTop() {
        var run: TickLadder.Run? = null
        val steps = (0 until 8).map { i -> TickLadder.next(run, 1_000L + i * 10_000L).also { run = it }.step }
        assertEquals(listOf(0, 1, 2, 3, 4, 5, 5, 5), steps)
    }

    @Test fun aLongerGapStartsAgainAtTheRoot() {
        val a = TickLadder.next(null, 0)
        val b = TickLadder.next(a, 60_000)
        assertEquals(1, b.step)
        assertEquals(2, TickLadder.next(b, 60_000 + TickLadder.RUN_MS).step)
        assertEquals(0, TickLadder.next(b, 60_000 + TickLadder.RUN_MS + 1).step)
        // A clock that went backwards is a fresh run.
        assertEquals(0, TickLadder.next(b, 10).step)
    }

    @Test fun anUndoStepsBackAndKeepsTheRunsClock() {
        val r = TickLadder.Run(5_000, 3)
        assertEquals(TickLadder.Run(5_000, 2), TickLadder.back(r))
        // Undoing the root ends the run; nothing to undo stays nothing.
        assertEquals(null, TickLadder.back(TickLadder.Run(5_000, 0)))
        assertEquals(null, TickLadder.back(null))
        // The next tick after an undo climbs from where the undo left it.
        assertEquals(3, TickLadder.next(TickLadder.back(r), 6_000).step)
    }

    @Test fun frequenciesRunFromE5ToE6() {
        assertEquals(659.26, TickLadder.frequency(0), 0.01)
        assertEquals(739.99, TickLadder.frequency(1), 0.05) // F#5
        assertEquals(987.77, TickLadder.frequency(3), 0.05) // B5
        assertEquals(1318.52, TickLadder.frequency(5), 0.05) // E6
        assertEquals(TickLadder.frequency(5), TickLadder.frequency(99), 1e-9)
        assertEquals(TickLadder.frequency(0), TickLadder.frequency(-3), 1e-9)
    }

    @Test fun thePluckIsSoftAndRises() {
        val low = ToneSynth.pluck(0)
        val high = ToneSynth.pluck(5)
        assertEquals(2.0, high[0].hz / low[0].hz, 1e-6)
        val samples = ToneSynth.render(low)
        assertTrue(samples.all { abs(it) <= ToneSynth.CEILING + 1e-6f })
        assertTrue("it makes a sound", samples.any { abs(it) > 0.05f })
    }

    @Test fun wavHeaderIsMono16BitPcm() {
        val wav = ToneSynth.wav(ToneSynth.render(ToneSynth.CHIME))
        assertEquals("RIFF", String(wav, 0, 4))
        assertEquals("WAVE", String(wav, 8, 4))
        val b = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(1, b.getShort(20).toInt()) // PCM
        assertEquals(1, b.getShort(22).toInt()) // mono
        assertEquals(ToneSynth.RATE, b.getInt(24))
        assertEquals(16, b.getShort(34).toInt())
        assertEquals(wav.size - 44, b.getInt(40))
    }
}

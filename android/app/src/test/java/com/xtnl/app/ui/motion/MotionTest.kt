package com.xtnl.app.ui.motion

import androidx.compose.animation.core.FloatSpringSpec
import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.SpringSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/** The motion tokens: the springs' mapping per level and the shapes the moments rely on. */
class MotionTest {
    @Test fun springsMapByLevel() {
        val full = MotionLevel.FULL.spr<Float>(Spr.stamp) as SpringSpec<Float>
        assertEquals(0.45f, full.dampingRatio, 1e-6f)
        assertEquals(900f, full.stiffness, 1e-3f)
        // Calm: critically damped, 1.3× stiffer; Still: a snap.
        val calm = MotionLevel.CALM.spr<Float>(Spr.stamp) as SpringSpec<Float>
        assertEquals(1f, calm.dampingRatio, 1e-6f)
        assertEquals(1170f, calm.stiffness, 1e-2f)
        assertTrue(MotionLevel.STILL.spr<Float>(Spr.stamp) is SnapSpec<Float>)
    }

    @Test fun contentMovesOnlyOnWellDampedSprings() {
        for (s in listOf(Spr.settle, Spr.glide, Spr.fx, Spr.press, Spr.pillLead, Spr.pillTrail)) assertTrue(s.damping >= 0.8f)
        for (s in listOf(Spr.stamp, Spr.stampBig, Spr.bump, Spr.bead)) assertTrue(s.damping in 0.4f..0.5f)
    }

    /** Value of a spring from [from] to [to] with an initial velocity, at [ms]. */
    private fun at(s: Spr, from: Float, to: Float, v0: Float, ms: Long): Float =
        FloatSpringSpec(s.damping, s.stiffness).getValueFromNanos(ms * 1_000_000, from, to, v0)

    @Test fun aBumpPeaksNear1Plus0019TimesItsImpulseAt41ms() {
        for (v0 in listOf(1.5f, 5f, 6f, 15f)) {
            val samples = (0..200).map { at(Spr.bump, 1f, 1f, v0, it.toLong()) }
            val peak = samples.max()
            val atMs = samples.indexOf(peak)
            assertEquals("v0 $v0", 1f + 0.019f * v0, peak, 0.004f * v0)
            assertTrue("peak at $atMs ms", atMs in 36..46)
        }
        // Settled by about 300 ms.
        assertTrue(abs(at(Spr.bump, 1f, 1f, 6f, 300) - 1f) < 0.01f)
    }

    @Test fun aStampSettlesWithOneSmallDip() {
        // From the 1.10 peak back to 1: one dip of a few percent, settled by about 280 ms.
        val samples = (0..400).map { at(Spr.stamp, 1.10f, 1f, 0f, it.toLong()) }
        val dip = samples.min()
        assertTrue("dip $dip", dip in 0.97f..0.995f)
        assertTrue(samples.drop(280).all { abs(it - 1f) < 0.01f })
    }

    @Test fun flightsScaleWithDistanceWithinBounds() {
        assertEquals(360, flightMs(0f))
        assertEquals(420, flightMs(400f))
        assertEquals(480, flightMs(600f))
        assertEquals(520, flightMs(5000f))
    }

    @Test fun easingsEndWhereTheyShould() {
        for (e in listOf(EaseOut, EaseInOut, EaseOutCubic, EaseIn, EaseDraw, MoteEase)) {
            assertEquals(0f, e.transform(0f), 1e-4f)
            assertEquals(1f, e.transform(1f), 1e-4f)
        }
        // A mote winds up (dips below its start) before the suction.
        assertTrue((0..30).any { MoteEase.transform(it / 100f) < 0f })
        // The stamp's up-stroke ends at zero velocity: its last step is far smaller than its first.
        val first = EaseOutCubic.transform(0.05f) - EaseOutCubic.transform(0f)
        val last = EaseOutCubic.transform(1f) - EaseOutCubic.transform(0.95f)
        assertTrue(last < first / 10)
    }
}

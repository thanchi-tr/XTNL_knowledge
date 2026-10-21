package com.xtnl.app.core

import com.xtnl.app.core.HapticScore.Beat
import com.xtnl.app.core.HapticScore.CLICK
import com.xtnl.app.core.HapticScore.LOW_TICK
import com.xtnl.app.core.HapticScore.QUICK_RISE
import com.xtnl.app.core.HapticScore.Step
import com.xtnl.app.core.HapticScore.THUD
import com.xtnl.app.core.HapticScore.TICK
import com.xtnl.app.feel.Scores
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HapticScoreTest {
    private val all: (Int) -> Boolean = { true }
    private val ms: (Int) -> Int = { p -> when (p) { CLICK -> 12; TICK -> 6; LOW_TICK -> 10; THUD -> 40; else -> 20 } }

    @Test fun absoluteTimesBecomeDelaysAfterEachPrimitiveEnds() {
        // CLICK at 0 (12 ms), TICK at 100, LOW_TICK at 105: the last waits for the TICK to end.
        val steps = HapticScore.compose(listOf(Beat(CLICK, 0.6f, 0), Beat(TICK, 0.3f, 100), Beat(LOW_TICK, 0.2f, 300)), all, ms)
        assertEquals(listOf(Step(CLICK, 0.6f, 0), Step(TICK, 0.3f, 88), Step(LOW_TICK, 0.2f, 194)), steps)
    }

    @Test fun aBusyMotorPushesTheFirstBeatBack() {
        val steps = HapticScore.compose(listOf(Beat(TICK, 0.3f, 0), Beat(CLICK, 0.8f, 50)), all, ms, cursor = 20)
        // The tick can't start before 20; it plays at 20 (delay 0 from the cursor), the click at 50 after the tick's 6 ms.
        assertEquals(0, steps[0].delayMs)
        assertEquals(50 - 26, steps[1].delayMs)
    }

    @Test fun beatsUnder40msApartMergeAndTheStrongerWins() {
        val merged = HapticScore.merge(listOf(Beat(TICK, 0.3f, 100), Beat(CLICK, 0.8f, 130), Beat(LOW_TICK, 0.2f, 200)))
        assertEquals(listOf(Beat(CLICK, 0.8f, 100), Beat(LOW_TICK, 0.2f, 200)), merged)
        // Exactly 40 ms apart: two beats.
        assertEquals(2, HapticScore.merge(listOf(Beat(TICK, 0.3f, 0), Beat(TICK, 0.3f, 40))).size)
    }

    @Test fun aMomentKeepsItsFourStrongestBeatsInTimeOrder() {
        val five = listOf(Beat(TICK, 0.2f, 0), Beat(TICK, 0.5f, 100), Beat(CLICK, 0.9f, 200), Beat(TICK, 0.1f, 300), Beat(TICK, 0.4f, 400))
        val kept = HapticScore.cap(five)
        assertEquals(4, kept.size)
        assertEquals(listOf(0, 100, 200, 400), kept.map { it.atMs })
    }

    @Test fun fallbacksPerPrimitive() {
        val noLow: (Int) -> Boolean = { it != LOW_TICK && it != THUD && it != QUICK_RISE }
        assertEquals(Beat(TICK, 0.7f * 0.5f, 0), HapticScore.substitute(Beat(LOW_TICK, 0.5f, 0), noLow))
        assertEquals(Beat(CLICK, 0.7f, 200), HapticScore.substitute(Beat(THUD, 0.7f, 200), noLow))
        assertNull("rises are dropped", HapticScore.substitute(Beat(QUICK_RISE, 0.5f, 0), noLow))
        assertTrue(HapticScore.needsPredefined { false })
        assertFalse(HapticScore.needsPredefined { it == TICK })
    }

    @Test fun withoutPrimitivesTheStrongestBeatPlaysAsAPredefinedEffect() {
        val s = HapticScore.strongest(Scores.boardClear(calm = false))!!
        assertEquals(Beat(CLICK, 0.80f, 220), s)
        assertEquals(HapticScore.EFFECT_CLICK, HapticScore.predefined(s))
        assertEquals(HapticScore.EFFECT_HEAVY_CLICK, HapticScore.predefined(Beat(CLICK, 1.0f, 500)))
        assertEquals(HapticScore.EFFECT_HEAVY_CLICK, HapticScore.predefined(Beat(THUD, 0.7f, 200)))
        assertEquals(HapticScore.EFFECT_TICK, HapticScore.predefined(Beat(LOW_TICK, 0.45f, 0)))
    }

    @Test fun everyMomentHasAtMostFourBeatsAndNeverALongPress() {
        val scores = listOf(
            Scores.tickBank(5, 8, 400, 540), Scores.failed, Scores.boardClear(false), Scores.boardClear(true),
            Scores.correct(3, 520, bigMoment = true, levelUp = false), Scores.miss(true), Scores.forgeCard, Scores.forgeCharacter,
            Scores.session(true, 620), Scores.session(false, 460), Scores.ideaStamp, Scores.land, Scores.merged, Scores.duplicate,
            Scores.ideaFailed, Scores.work,
        )
        for (s in scores) {
            assertTrue("${s.size} beats", s.size in 1..HapticScore.MAX_BEATS)
            assertTrue(s.all { it.scale in 0f..1f && it.atMs >= 0 })
        }
    }

    @Test fun theTickClimbsWithTheLadderAndTheTopRungClicks() {
        assertEquals(0.55f, Scores.tickClick(0).scale, 1e-6f)
        assertEquals(0.80f, Scores.tickClick(9).scale, 1e-6f)
        val low = Scores.tickBank(1, 4, 400, 460)
        assertEquals(listOf(TICK), low.map { it.prim })
        val top = Scores.tickBank(5, 8, 400, 540)
        assertEquals(listOf(Beat(LOW_TICK, 0.20f, 400), Beat(CLICK, 0.60f, 540)), top)
    }

    @Test fun aMissIsSofterThanAnySuccess() {
        val miss = Scores.miss(retry = true)
        assertTrue(miss.all { it.prim == LOW_TICK })
        assertTrue(miss.maxOf { it.scale } < Scores.correct(0, null, false, false).maxOf { it.scale })
    }
}

package com.xtnl.app.ui.motion

import com.xtnl.app.ui.log.FilingScene
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The moments' timelines and escalation: by count, never by length; the top rung holds. */
class MomentsTest {
    @Test fun aTickSendsMoreMotesUpTheLadderAndTheyLandBy540ms() {
        assertEquals(listOf(3, 4, 5, 6, 7, 8), (0..5).map { TickMoment.motes(it, mvv = false) })
        assertEquals(8, TickMoment.motes(9, mvv = false))
        // The minimum sends half, at least two.
        assertEquals(listOf(2, 2, 2, 3, 3, 4), (0..5).map { TickMoment.motes(it, mvv = true) })
        assertEquals(400, TickMoment.arrival(0))
        for (step in 0..5) assertTrue(TickMoment.arrival(TickMoment.motes(step, false) - 1) <= 540)
    }

    @Test fun aTickEscalatesByStepAndHoldsAtTheTop() {
        assertEquals(listOf(6, 7, 8, 9, 10, 11), (0..5).map { TickMoment.streaks(it) })
        assertEquals(TickMoment.streaks(5), TickMoment.streaks(7))
        assertEquals(30f, TickMoment.shockRadiusDp(0), 0f)
        assertEquals(37.5f, TickMoment.shockRadiusDp(5), 1e-4f)
        assertEquals(65f, TickMoment.startAngle(5), 1e-4f)
        assertEquals(0f, TickMoment.sparkShare(2), 0f)
        assertEquals(0.3f, TickMoment.sparkShare(3), 0f)
        assertEquals(0.80f, TickMoment.clickScale(5), 1e-6f)
    }

    @Test fun boardClearWaitsForTheMotes() {
        // B is the later of the event and the tick's last mote; without motes, at least T + 300.
        assertEquals(1_540L, BoardMoment.start(eventAt = 1_300, tickAt = 1_000, lastArrivalAt = 1_540))
        assertEquals(1_600L, BoardMoment.start(eventAt = 1_600, tickAt = 1_000, lastArrivalAt = 1_540))
        assertEquals(1_300L, BoardMoment.start(eventAt = 1_200, tickAt = 1_000, lastArrivalAt = null))
        assertEquals(1_200L, BoardMoment.start(eventAt = 1_200, tickAt = null, lastArrivalAt = null))
    }

    @Test fun theRollCallTakesTheSixNearestOutward() {
        val wave = BoardMoment.wave(origin = 5, kept = listOf(1, 2, 3, 4, 6, 7, 8, 9, 10))
        assertEquals(6, wave.size)
        assertEquals(listOf(4, 6), wave.take(2).map { it.first }.sorted())
        assertEquals(30, wave.first().second)
        assertTrue(wave.zipWithNext().all { (a, b) -> a.second <= b.second })
    }

    @Test fun comboTiersAndTheXLightingPartByPart() {
        assertEquals(listOf(0, 0, 1, 1, 2, 2, 3, 3), (0..7).map { ComboMoment.tier(it) })
        assertEquals(listOf(8, 10, 12, 14), (0..3).map { ComboMoment.streaks(it) })
        assertEquals(listOf(1, 2, 3, 4), (0..3).map { ComboMoment.pointMotes(it) })
        assertEquals(0, ComboMoment.parts(1))
        assertEquals(NodeParts.A, ComboMoment.parts(2))
        assertEquals(NodeParts.A or NodeParts.AB, ComboMoment.parts(3))
        assertEquals(NodeParts.A or NodeParts.AB or NodeParts.B, ComboMoment.parts(4))
        assertFalse(NodeParts.has(ComboMoment.parts(5), NodeParts.SPARK))
        assertEquals(NodeParts.ALL, ComboMoment.parts(6))
        assertEquals(NodeParts.ALL, ComboMoment.parts(12))
        // Each step up lights more, never less.
        for (c in 2..8) assertEquals(ComboMoment.parts(c - 1), ComboMoment.parts(c - 1) and ComboMoment.parts(c))
        assertTrue(ComboMoment.milestone(10) && ComboMoment.milestone(20) && ComboMoment.milestone(30))
        assertFalse(ComboMoment.milestone(11))
        assertEquals(520, ComboMoment.firstArrival())
    }

    @Test fun theSessionsXIsHonest() {
        assertEquals(NodeParts.A, SessionMoment.parts(0.4f, perfect = false))
        assertEquals(NodeParts.A or NodeParts.AB or NodeParts.B, SessionMoment.parts(0.5f, perfect = false))
        assertEquals(NodeParts.ALL and NodeParts.SPARK.inv(), SessionMoment.parts(0.8f, perfect = false))
        assertEquals(NodeParts.ALL, SessionMoment.parts(1f, perfect = true))
        assertEquals(620, SessionMoment.lastLit(NodeParts.ALL))
        assertEquals(580, SessionMoment.lastLit(SessionMoment.parts(0.8f, false)))
        assertEquals(460, SessionMoment.lastLit(SessionMoment.parts(0.6f, false)))
        assertEquals(300, SessionMoment.lastLit(NodeParts.A))
        assertEquals(listOf(1, 2, 3), listOf(SessionMoment.notes(0.3f, false), SessionMoment.notes(0.7f, false), SessionMoment.notes(1f, true)))
        assertEquals(24, SessionMoment.shards(1f))
        assertEquals(18, SessionMoment.shards(0.5f))
        assertTrue(SessionMoment.earned(perfect = false, questDone = true, accuracy = 0.2f))
        assertFalse(SessionMoment.earned(perfect = false, questDone = false, accuracy = 0.7f))
    }

    @Test fun filingStagesEveryOnePointFourSecondsAndTheLastHolds() {
        assertEquals(listOf(0, 0, 1, 2, 3, 3), listOf(0L, 1_399L, 1_400L, 2_800L, 4_200L, 60_000L).map { FilingMoment.stage(it) })
        assertFalse(FilingMoment.showSeconds(2_999))
        assertTrue(FilingMoment.showSeconds(3_000))
        assertTrue(FilingMoment.slow(10_000))
    }

    @Test fun theFilingSceneSettlesAndAssignsTheXOnce() {
        assertEquals(0f, FilingScene.springStep(0.4f, 900f, 0f), 0f)
        assertEquals(1f, FilingScene.springStep(0.4f, 900f, 2f), 1e-3f)
        // The bead spring overshoots once.
        assertTrue((1..400).map { FilingScene.springStep(0.4f, 900f, it / 1000f) }.max() > 1.1f)
        for (t in listOf(4.2f, 5f, 9f)) {
            val roles = IntArray(3)
            FilingScene.assign(t, roles)
            assertEquals(3, roles.toSet().size)
            assertTrue(roles.all { it in 0..5 })
        }
    }
}

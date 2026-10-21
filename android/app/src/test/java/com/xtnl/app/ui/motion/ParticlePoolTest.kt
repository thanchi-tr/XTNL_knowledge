package com.xtnl.app.ui.motion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/** The one physics model: exponential drag that doesn't care about the frame rate, gravity on matter only, a capped pool. */
class ParticlePoolTest {
    private fun run(pool: ParticlePool, hz: Int, seconds: Float) {
        val dt = 1f / hz
        var t = 0f
        while (t < seconds - 1e-6f) { pool.step(dt); t += dt }
    }

    @Test fun dragIsTheSameAt60And120Hz() {
        val a = ParticlePool(4)
        val b = ParticlePool(4)
        for (p in listOf(a, b)) p.spawn(0f, 0f, 300f, -200f, 2f, 2f, 1f, 0, ParticlePool.Shape.SHARD, light = false, drag = 10f, gravity = 1000f)
        run(a, 60, 0.3f)
        run(b, 120, 0.3f)
        assertEquals(a.x[0], b.x[0], 0.05f)
        assertEquals(a.y[0], b.y[0], 0.05f)
        assertEquals(a.vx[0], b.vx[0], 0.05f)
    }

    @Test fun aStreakTravelsAtMostSpeedOverDrag() {
        // 340 dp/s with k = 10 never goes past 34 dp from its edge: the streaks stay in the row.
        val p = ParticlePool(2)
        p.spawn(0f, 0f, 340f, 0f, 1f, 2.2f, 0.8f, 0, ParticlePool.Shape.STREAK, light = true, drag = 10f)
        run(p, 120, 0.9f)
        assertTrue(p.count == 1)
        assertTrue(p.x[0] < 34f)
        assertTrue(p.x[0] > 30f)
    }

    @Test fun lightNeverFallsMatterDoes() {
        val p = ParticlePool(4)
        p.spawn(0f, 0f, 0f, 0f, 1f, 2f, 1f, 0, ParticlePool.Shape.SPARK, light = true, gravity = 1000f)
        p.spawn(0f, 0f, 0f, 0f, 1f, 2f, 1f, 0, ParticlePool.Shape.SHARD, light = false, gravity = 1000f)
        run(p, 120, 0.2f)
        assertEquals(0f, p.y[0], 1e-4f)
        assertEquals(0.5f * 1000f * 0.2f * 0.2f, p.y[1], 0.5f)
    }

    @Test fun theSpentLeaveAndTheOldestIsRecycled() {
        val p = ParticlePool(3)
        p.spawn(0f, 0f, 0f, 0f, 0.1f, 1f, 1f, 1, ParticlePool.Shape.DOT, light = true)
        p.spawn(0f, 0f, 0f, 0f, 1.0f, 1f, 1f, 2, ParticlePool.Shape.DOT, light = true)
        p.spawn(0f, 0f, 0f, 0f, 1.0f, 1f, 1f, 3, ParticlePool.Shape.DOT, light = true)
        // Full: a fourth takes the oldest's slot.
        val slot = p.spawn(0f, 0f, 0f, 0f, 1.0f, 1f, 1f, 4, ParticlePool.Shape.DOT, light = true)
        assertEquals(3, p.count)
        assertEquals(0, slot)
        assertEquals(4, p.color[0])
        run(p, 120, 0.2f)
        assertEquals(3, p.count)
        run(p, 120, 1.0f)
        assertEquals(0, p.count)
    }

    @Test fun aCancelFadesOnlyItsMoment() {
        val p = ParticlePool(4)
        p.spawn(0f, 0f, 0f, 0f, 1f, 1f, 1f, 0, ParticlePool.Shape.DOT, light = true, owner = "a")
        p.spawn(0f, 0f, 0f, 0f, 1f, 1f, 1f, 0, ParticlePool.Shape.DOT, light = true, owner = "b")
        p.fade("a", 0.08f)
        run(p, 120, 0.1f)
        assertEquals(1, p.count)
        assertEquals("b", p.owner[0])
        assertTrue(abs(p.alpha(0) - (1f - (0.1f * 0.1f))) < 0.02f)
    }

    @Test fun aRayDoesNotMove() {
        val p = ParticlePool(1)
        p.spawn(5f, 6f, 14f, 0f, 0.26f, 2f, 6f, 0, ParticlePool.Shape.RAY, light = true)
        run(p, 120, 0.1f)
        assertEquals(5f, p.x[0], 0f)
        assertEquals(6f, p.y[0], 0f)
    }
}

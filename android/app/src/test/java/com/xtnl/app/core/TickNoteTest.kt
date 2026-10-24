package com.xtnl.app.core

import com.xtnl.app.data.TickKnee
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A tick's moments and its knee note (P7, D26): the web's Seals and Ascensions, the server's knee words, said once a day. */
class TickNoteTest {
    private fun moment(tier: Int, kind: String, title: String) = buildJsonObject { put("tier", tier); put("kind", kind); put("title", title) }

    @Test fun onlySealsAndAscensionsAreShown() {
        val list = listOf(
            moment(0, "tick", "Kept"),
            moment(1, "board-clear", "Board clear"),
            moment(2, "streak-milestone", "7 days kept"),
            moment(2, "competency-tier", "Reading reached Tier 2"),
            moment(3, "title", "Practitioner"),
            moment(2, "habit-rung", "7 days kept"),
            JsonPrimitive("not a moment"),
            buildJsonObject { put("tier", 2); put("kind", "goal-finished") },
        )
        assertEquals(
            "tier 2 and 3 by title, each once; the tick's mark, the chimes (Board clear is Check's own) and a skill's tier (the line names it) left out",
            listOf("7 days kept", "Practitioner"),
            TickNote.moments(list),
        )
        assertEquals(emptyList<String>(), TickNote.moments(emptyList()))
    }

    @Test fun theSnackbarSaysTheLineThenTheMomentsThenTheKnee() {
        assertEquals("+8.3 XP · Body", TickNote.message("+8.3 XP · Body", emptyList(), null))
        assertEquals("+8.3 XP · Body\n7 days kept · Practitioner", TickNote.message("+8.3 XP · Body", listOf("7 days kept", "Practitioner"), null))
        assertEquals("+4.1 XP · Body\nFatigue breaker: …", TickNote.message("+4.1 XP · Body", emptyList(), "Fatigue breaker: …"))
        assertEquals("a blank knee line is none", "+4.1 XP · Body", TickNote.message("+4.1 XP · Body", emptyList(), " "))
    }

    @Test fun theKneeIsSaidOnceADayAndStage() {
        val half = TickKnee(day = "2026-10-21", raw = 205.0, rate = 0.48, line = "x")
        assertEquals("2026-10-21:half", TickNote.kneeKey(half))
        assertEquals("2026-10-21:cap", TickNote.kneeKey(half.copy(capped = true, rate = 0.0)))
        assertEquals("yesterday's knee is its own", "2026-10-20:half", TickNote.kneeKey(half.copy(day = "2026-10-20")))
    }

    /** The demo's knee, as the server builds it (mobile-api.ts tickKneeOf; the goldens are mobile-api-check's). */
    @Test fun theKneeIsTheServers() {
        assertNull("none at 5 raw", TickNote.knee(0.0, 5.0, "2026-10-21", yesterday = false))
        assertNull("none at exactly 200 (past it only)", TickNote.knee(195.0, 5.0, "2026-10-21", yesterday = false))
        assertEquals(
            TickKnee("2026-10-21", 205.0, 0.48, false, "Fatigue breaker: past 200 raw today, so a tick now pays ×0.48 or less. The day stops at 300 XP."),
            TickNote.knee(190.0, 15.0, "2026-10-21", yesterday = false),
        )
        assertEquals(
            TickKnee("2026-10-20", 240.0, 0.41, false, "Fatigue breaker: past 200 raw yesterday, so a tick now pays ×0.41 or less. The day stops at 300 XP."),
            TickNote.knee(230.0, 10.0, "2026-10-20", yesterday = true),
        )
        assertEquals(0.46, TickNote.knee(209.6, 5.0, "d", yesterday = false)!!.rate, 1e-9)
        assertEquals(
            TickKnee("2026-10-21", 750.0, 0.0, true, "Fatigue breaker: today reached the day's cap of 300 XP. Ticks still count; they add no more XP today."),
            TickNote.knee(730.0, 20.0, "2026-10-21", yesterday = false),
        )
        assertEquals(
            "Fatigue breaker: yesterday reached the day's cap of 300 XP. Ticks still count; they add no more XP to yesterday.",
            TickNote.knee(800.0, 1.0, "2026-10-20", yesterday = true)!!.line,
        )
        assertEquals(739, Math.round(TickNote.CAP_AT_RAW).toInt())
    }

    @Test fun theKneePaysAsLifeGrades() {
        assertEquals("the full rate to 100 raw", 8.3, TickNote.kneePay(0.0, 8.3), 1e-9)
        assertEquals("R_before 90, raw 25 pays 24.0 (life-grade-check's golden)", 24.0, Math.round(TickNote.kneePay(90.0, 25.0) * 10) / 10.0, 1e-9)
        assertEquals("flat at the cap", 0.0, TickNote.kneePay(TickNote.CAP_AT_RAW, 50.0), 1e-9)
        assertTrue("half rate at 200", kotlin.math.abs((TickNote.kneeG(200.001) - TickNote.kneeG(199.999)) / 0.002 - 0.5) < 1e-4)
    }
}

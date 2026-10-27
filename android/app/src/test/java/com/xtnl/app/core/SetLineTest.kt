package com.xtnl.app.core

import com.xtnl.app.data.CheckData
import com.xtnl.app.data.LiftNext
import com.xtnl.app.data.LiftSetBody
import com.xtnl.app.data.LiftSetResult
import com.xtnl.app.data.Net
import com.xtnl.app.data.OpenLift
import com.xtnl.app.data.liftSetJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The open lift's card and its ✓ (health phase 2; D12): the next set in the server's words, the ✓'s body (the last
 * lift's figures as they are, never `ord`), the rest, and the shapes /check and POST /lift/set answer.
 */
class SetLineTest {
    private val bench = LiftNext(
        "e-bench", "bench_press", "Bench press", ord = 3, kind = "WORKING", weightKg = 60.0, reps = 8, unit = "kg", fromLast = true,
        setText = "60 kg × 8", ghostLine = "last 60 × 8",
    )
    private val lift = OpenLift("lift-1", "Push day", "2026-10-21T07:58:00.000Z", bench)

    @Test fun theCardSaysTheNextSetInTheServersWords() {
        assertEquals("Lift · Push day", SetLine.title(lift))
        assertEquals("Lift", SetLine.title(lift.copy(label = null)))
        assertEquals("Lift", SetLine.title(lift.copy(label = "  ")))
        assertEquals("Next: Bench press 60 kg × 8", SetLine.nextLine(bench))
        assertEquals("Set 3 · last 60 × 8", SetLine.detail(bench))
        assertEquals("Set 1 · Warm-up · last 40 × 10", SetLine.detail(bench.copy(ord = 1, kind = "WARMUP", ghostLine = "last 40 × 10")))
        assertEquals("Set 4 · Drop · last 47.5 × 10", SetLine.detail(bench.copy(ord = 4, kind = "DROP", ghostLine = "last 47.5 × 10")))
        assertEquals("Set 2 · Rest-pause · AMRAP", SetLine.detail(bench.copy(ord = 2, kind = "MINI", amrap = true, ghostLine = null)))
        assertEquals("Done: Bench press 60 kg × 8", SetLine.doneLabel(bench))
        assertEquals("Bench press 60 kg × 8", SetLine.label(bench))
        assertNull("every row done", SetLine.nextLine(null))
    }

    /** A next with nothing to copy (no last lift) has no ✓ on the phone: its figures go in on the web. */
    @Test fun nothingToCopyHasNoTick() {
        val fresh = LiftNext("e-fly", "cable_fly", "Cable fly", ord = 1, fromLast = false)
        assertFalse(SetLine.canTick(fresh))
        assertNull(SetLine.bodyOf(lift, fresh, "2026-10-21T08:14:30.000Z"))
        assertEquals("Next: Cable fly", SetLine.nextLine(fresh))
        assertEquals("Set 1", SetLine.detail(fresh))
        assertFalse(SetLine.canTick(null))
        assertTrue(SetLine.canTick(bench))
        // A hold copies its time, a carry its load and distance.
        assertTrue(SetLine.canTick(LiftNext("e-plank", name = "Plank", durationSec = 65, fromLast = true, setText = "hold 1:05")))
    }

    /** The ✓ sends the set as the last lift had it: its kind and figures in kilograms, its own instant, never `ord` or an outcome. */
    @Test fun theTicksBodyIsTheSetAsItIs() {
        val body = SetLine.bodyOf(lift, bench, "2026-10-21T08:14:30.000Z")!!
        assertEquals(LiftSetBody("lift-1", "e-bench", "2026-10-21T08:14:30.000Z", "WORKING", 60.0, 8), body)
        val json = liftSetJson(body, "c-1")
        assertEquals(setOf("sessionId", "entryId", "doneAt", "kind", "weightKg", "reps", "clientId"), json.keys)
        for (never in listOf("ord", "rir", "toFailure", "restSec", "chainOf", "unit")) assertFalse(never, json.containsKey(never))
        // A drop goes without a chain (the server continues the set before it); an assisted movement's load stays signed.
        val drop = SetLine.bodyOf(lift, bench.copy(kind = "DROP", weightKg = 47.5, reps = 10), "t")!!
        assertEquals("DROP", drop.kind)
        assertEquals(-20.0, SetLine.bodyOf(lift, bench.copy(weightKg = -20.0), "t")!!.weightKg!!, 0.0)
        assertTrue(liftSetJson(SetLine.bodyOf(lift, bench.copy(amrap = true), "t")!!, "c").containsKey("amrap"))
    }

    @Test fun theRestCountsDown() {
        assertEquals(0L, SetLine.restLeftMs(null, 1_000L))
        assertEquals(180_000L, SetLine.restLeftMs(181_000L, 1_000L))
        assertEquals(0L, SetLine.restLeftMs(1_000L, 5_000L))
        assertEquals("Rest 3:00", SetLine.restText(180_000L))
        assertEquals("Rest 2:45", SetLine.restText(164_200L))
        assertEquals("Rest 0:01", SetLine.restText(400L))
        assertEquals("Rest done", SetLine.restText(0L))
        // The rest counts from the ✓'s tap (the web's LiftLogger), not from the answer: a 3 s answer leaves 177 s.
        val tap = 1_000_000L
        val ends = SetLine.restEndsAt(tap, 180, null)
        assertEquals(tap + 180_000L, ends)
        assertEquals(177_000L, SetLine.restLeftMs(ends, tap + 3_000L))
        assertEquals("a rest already over when a slow answer lands: Rest done", SetLine.REST_DONE, SetLine.restText(SetLine.restLeftMs(SetLine.restEndsAt(tap, 20, null), tap + 25_000L)))
        assertNull("none before a drop", SetLine.restEndsAt(tap, 0, 5L))
        assertEquals("a set the queue landed a while ago: the rest shown stays", 5L, SetLine.restEndsAt(null, 180, 5L))
        val vm = (File("src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt")).readText()
        assertTrue(vm.contains("setLanded(body.sessionId, r.value, restFromMs = tapMs)") && vm.contains("({ sendSet(body, label, clientId, tapMs) })"))
    }

    @Test fun theWordsArePlain() {
        // A set waits only after a try that got no answer, which may have landed: never "hadn't left the phone".
        assertEquals("No answer: Bench press 60 kg × 8 will send when you're online. It keeps the time you did it. If it got through, it's saved once.", SetLine.queued("Bench press 60 kg × 8"))
        assertEquals("Taken off the phone. If the first try got through, the set is already logged.", SetLine.TAKEN_BACK)
        val vm = (File("src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt")).readText()
        val cancel = Regex("""fun cancelSet\(clientId: String\) \{[\s\S]*?\n    \}\n""").find(vm)?.value.orEmpty()
        assertTrue(cancel, cancel.contains("SetLine.TAKEN_BACK") && !cancel.contains("SendLine.TAKEN_BACK") && cancel.contains("graph.changes.tryEmit(\"lift\")"))
        assertEquals("Sent: Bench press: logged 60 kg × 8.", SetLine.sent("Bench press 60 kg × 8", "Bench press: logged 60 kg × 8."))
        assertEquals("Sent: Bench press 60 kg × 8", SetLine.sent("Bench press 60 kg × 8", null))
        for (s in listOf(SetLine.ALL_DONE, SetLine.ALL_DONE_NOTE, SetLine.NOTHING_TO_COPY, SetLine.WAITING, SetLine.OPEN_WEB, SetLine.TAKEN_BACK)) assertFalse(s, s.contains('!'))
        assertEquals("/train/exercise", SetLine.WEB_HREF)
    }

    /** The shapes: /check's lift (absent before, and from an older server) and POST /lift/set's answer, a big jump included. */
    @Test fun theShapesReadAsTheServerSendsThem() {
        val check = Net.json.decodeFromString(
            CheckData.serializer(),
            """{"lift":{"sessionId":"lift-1","label":"Push day","startedAt":"2026-10-21T07:58:00.000Z","next":{"entryId":"e-bench","movementKey":"bench_press","name":"Bench press","ord":3,"kind":"WORKING","weightKg":60,"reps":8,"durationSec":null,"distanceM":null,"amrap":false,"unit":"kg","fromLast":true,"setText":"60 kg × 8","ghostLine":"last 60 × 8"}}}""",
        )
        assertEquals(lift, check.lift)
        assertNull(Net.json.decodeFromString(CheckData.serializer(), "{}").lift)
        assertNull(Net.json.decodeFromString(CheckData.serializer(), """{"lift":{"sessionId":"l","label":null,"startedAt":null,"next":null}}""").lift?.next)
        val r = Net.json.decodeFromString(
            LiftSetResult.serializer(),
            """{"set":{"id":"s-1","entryId":"e-bench","ord":4,"kind":"WORKING","chainOf":null,"weightKg":72.5,"reps":5,"rir":null,"toFailure":false,"amrap":false,"durationSec":null,"distanceM":null,"doneAt":"2026-10-21T08:20:00.000Z"},"duplicate":false,"restSec":180,"line":"Bench press: logged 72.5 kg × 5.","jump":{"line":"Big jump: 72.5 kg (best 60). Saved as a record.","webHref":"/train/exercise"},"lift":null}""",
        )
        assertEquals(180, r.restSec)
        assertEquals(72.5, r.set!!.weightKg!!, 0.0)
        assertEquals("/train/exercise", r.jump!!.webHref)
        assertNull("no lift after it: /check is read again", r.lift)
    }
}

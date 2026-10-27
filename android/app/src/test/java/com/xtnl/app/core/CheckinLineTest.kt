package com.xtnl.app.core

import com.xtnl.app.core.HapticScore.Beat
import com.xtnl.app.core.HapticScore.TICK
import com.xtnl.app.data.CheckData
import com.xtnl.app.data.CheckinState
import com.xtnl.app.data.Net
import com.xtnl.app.data.checkinJson
import com.xtnl.app.feel.Scores
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant

/**
 * The 5-second check-in's rules and words on the phone (health phase 2; D1, D2, D5, D9): the web's grid maths and corner
 * words (src/lib/mind.ts), the receipt kept off the cover screen, the time it took, the body it sends, and a /check that
 * carries counts only.
 */
class CheckinLineTest {
    @Test fun aTapSnapsToOneOfNineByNineCells() {
        // A 443 dp grid (the cover screen's 475 dp less 16 dp margins): 49 dp cells.
        val side = 443f
        assertTrue("a cell on the cover screen is at least 49 dp", side / CheckinLine.STEPS >= 49f)
        assertEquals(9, CheckinLine.STEPS)
        assertEquals("the top-left corner: unpleasant, high energy", CheckinLine.Cell(-4, 4), CheckinLine.cellAt(0f, 0f, side, side))
        assertEquals("the bottom-right corner", CheckinLine.Cell(4, -4), CheckinLine.cellAt(side, side, side, side))
        assertEquals("past an edge snaps to the edge cell", CheckinLine.Cell(-4, -4), CheckinLine.cellAt(-20f, side + 30f, side, side))
        assertEquals("the middle", CheckinLine.Cell(0, 0), CheckinLine.cellAt(side / 2, side / 2, side, side))
        assertEquals(CheckinLine.Cell(2, -1), CheckinLine.cellAt(side * 0.75f, side * 0.62f, side, side))
        assertNull("no size, no cell", CheckinLine.cellAt(1f, 1f, 0f, side))
        assertNull(CheckinLine.cellAt(Float.NaN, 1f, side, side))
        // Every cell's centre snaps back to that cell.
        for (v in CheckinLine.MIN..CheckinLine.MAX) for (e in CheckinLine.MIN..CheckinLine.MAX) {
            val (fx, fy) = CheckinLine.centreOf(CheckinLine.Cell(v, e))
            assertEquals(CheckinLine.Cell(v, e), CheckinLine.cellAt(fx * side, fy * side, side, side))
        }
    }

    @Test fun aStepMovesOneCellAndStaysInside() {
        assertEquals("nothing picked starts at the centre", CheckinLine.Cell(1, 0), CheckinLine.move(null, 1, 0))
        assertEquals(CheckinLine.Cell(4, 4), CheckinLine.move(CheckinLine.Cell(4, 4), 1, 1))
        assertEquals(CheckinLine.Cell(-4, -3), CheckinLine.move(CheckinLine.Cell(-4, -4), -1, 1))
    }

    @Test fun theWordsAreTheWebsForEveryCell() {
        assertEquals("Tense, wired", CheckinLine.wordsOf(-2, 3))
        assertEquals("Excited, upbeat", CheckinLine.wordsOf(1, 1))
        assertEquals("Low, drained", CheckinLine.wordsOf(-4, -4))
        assertEquals("Calm, content", CheckinLine.wordsOf(2, -1))
        assertEquals("Neutral, low energy", CheckinLine.wordsOf(0, -2))
        assertEquals("Pleasant, medium energy", CheckinLine.wordsOf(3, 0))
        assertEquals("Neutral, medium energy", CheckinLine.wordsOf(0, 0))
        assertEquals("Unpleasant, medium energy", CheckinLine.wordsOf(-1, 0))
        assertEquals("Neutral, high energy", CheckinLine.wordsOf(0, 2))
        assertEquals("Pleasantness +2, energy −1 · Calm, content", CheckinLine.valueText(CheckinLine.Cell(2, -1)))
        assertEquals(CheckinLine.NOT_PICKED, CheckinLine.valueText(null))
        assertEquals(listOf("Not at all", "A little", "Some", "Quite a lot", "Very much"), CheckinLine.STRESS_LEVELS)
        // The words match the web's own file, so the phone and Body › Mind say the same thing.
        val mind = (File("../src/lib/mind.ts").takeIf { it.exists() } ?: File("../../src/lib/mind.ts")).takeIf { it.exists() }?.readText()
        if (mind != null) {
            for (q in CheckinLine.Quadrant.entries) assertTrue(q.words, mind.contains("\"${q.words}\""))
            for (l in CheckinLine.STRESS_LEVELS) assertTrue(l, mind.contains("label: \"$l\""))
            assertTrue(mind.contains("\"${CheckinLine.GRID_LABEL}\""))
            assertTrue(mind.contains("\"${CheckinLine.QUESTION}\""))
            assertTrue(mind.contains("\"${CheckinLine.STRESS_QUESTION}\""))
        }
    }

    @Test fun aStressTapSavesOnlyOnceTheGridIsPicked() {
        assertFalse(CheckinLine.stressSaves(null))
        assertTrue(CheckinLine.stressSaves(CheckinLine.Cell(0, 0)))
    }

    /** D2: the receipt's words join it only on the main display; the cover screen (visible on a closed phone) gets the time alone. */
    @Test fun theReceiptKeepsItsWordsOffTheCover() {
        assertEquals("Logged 14:12 · Calm, content", CheckinLine.receipt("Logged 14:12", "Calm, content", cover = false))
        assertEquals("Logged 14:12", CheckinLine.receipt("Logged 14:12", "Calm, content", cover = true))
        assertEquals("Logged 14:12", CheckinLine.receipt("Logged 14:12", null, cover = false))
        // Undo for 5 s from the answer, by the server's clock; never more.
        val now = Instant.parse("2026-10-28T03:12:05Z").toEpochMilli()
        assertEquals(5_000L, CheckinLine.undoMs("2026-10-28T03:12:10Z", now))
        assertEquals(2_000L, CheckinLine.undoMs("2026-10-28T03:12:07Z", now))
        assertEquals(0L, CheckinLine.undoMs("2026-10-28T03:12:00Z", now))
        assertEquals(5_000L, CheckinLine.undoMs("2026-10-28T03:13:00Z", now))
        assertEquals(CheckinLine.UNDO_MS, CheckinLine.undoMs(null, now))
    }

    @Test fun theTimeItTookIsMeasuredOrNone() {
        assertEquals(3_400L, CheckinLine.tookMs(10_000L, 13_400L))
        assertNull("the clock moved back", CheckinLine.tookMs(10_000L, 9_000L))
        assertNull("past ten minutes is stored as none", CheckinLine.tookMs(0L, 600_001L))
        assertEquals(600_000L, CheckinLine.tookMs(0L, 600_000L))
    }

    @Test fun theBodyIsTheRoutesAndCarriesItsOwnInstant() {
        val at = Instant.parse("2026-10-28T03:12:05Z")
        val body = CheckinLine.bodyOf(CheckinLine.Cell(2, -1), 1, "widget", at, 4_200)
        assertEquals("2026-10-28T03:12:05Z", body.at)
        assertEquals("self", body.trigger)
        val json = checkinJson(body, "c-1")
        assertEquals(setOf("at", "valence", "energy", "stress", "trigger", "via", "tookMs", "clientId"), json.keys)
        // A skipped stress and an unmeasured time are left out, never sent as null; a stray surface is Check's.
        val bare = checkinJson(CheckinLine.bodyOf(CheckinLine.Cell(0, 0), null, "lock screen", at, null), "c-2")
        assertEquals(setOf("at", "valence", "energy", "trigger", "via", "clientId"), bare.keys)
        assertEquals("check", bare["via"].toString().trim('"'))
        assertEquals("a stress level out of range is none", null, CheckinLine.bodyOf(CheckinLine.Cell(0, 0), 7, "check", at, null).stress)
        assertEquals(listOf("check", "widget", "tile", "notify"), CheckinLine.VIAS)
        assertEquals("tile", CheckinLine.viaOf("tile"))
        assertEquals("check", CheckinLine.viaOf(null))
    }

    /** D9: /check's block is counts only; the row and the widget's button follow the switch and the pause, and say the time alone. */
    @Test fun checkCarriesCountsOnly() {
        val raw = """{"checkin":{"live":true,"lastAt":"2026-10-28T03:12:05.000Z","todayCount":2,"paused":false}}"""
        val data = Net.json.decodeFromString(CheckData.serializer(), raw)
        assertEquals(CheckinState(true, "2026-10-28T03:12:05.000Z", 2, false), data.checkin)
        // Every field the app keeps from it: no valence, energy, stress, word or tag can be held.
        val kept = (Net.json.encodeToJsonElement(CheckinState.serializer(), CheckinState(true, "x", 1, true)) as JsonObject).keys
        assertEquals(setOf("live", "lastAt", "todayCount", "paused"), kept)
        assertTrue(CheckinLine.shows(data.checkin))
        assertFalse("paused: no row, no button", CheckinLine.shows(CheckinState(live = true, paused = true)))
        assertFalse("not live", CheckinLine.shows(CheckinState(live = false)))
        assertFalse("an older server", CheckinLine.shows(null))
        assertTrue("the user's own tap opens it while paused", CheckinLine.canOpen(CheckinState(live = true, paused = true)))
        assertTrue("not read yet: the server decides", CheckinLine.canOpen(null))
        assertFalse(CheckinLine.canOpen(CheckinState(live = false)))
        // 14:12 Sydney on Wed 28 Oct (AEDT).
        assertEquals("Checked in 14:12", CheckinLine.lastLine(data.checkin, "2026-10-28"))
        assertNull("yesterday's says nothing", CheckinLine.lastLine(data.checkin, "2026-10-29"))
        assertNull(CheckinLine.lastLine(CheckinState(live = true), "2026-10-28"))
        // An older server's /check reads as before.
        assertNull(Net.json.decodeFromString(CheckData.serializer(), "{}").checkin)
        assertNull(Net.json.decodeFromString(CheckData.serializer(), """{"checkin":null}""").checkin)
        assertEquals(setOf("checkin"), Net.json.parseToJsonElement(raw).jsonObject.keys)
    }

    @Test fun theQueuesWordsNeverNameAValue() {
        assertEquals("Check-in at 14:12", CheckinLine.queueLabel("2026-10-28T03:12:05Z"))
        assertEquals("Check-in", CheckinLine.queueLabel("soon"))
        assertEquals("Check-in sent · Logged 14:12", CheckinLine.sent("Logged 14:12"))
        assertEquals("The check-in from Mon 19 Oct is more than a week old, so it wasn't sent.", CheckinLine.tooOld("2026-10-19"))
        for (w in CheckinLine.Quadrant.entries.map { it.words } + CheckinLine.STRESS_LEVELS) {
            for (line in listOf(CheckinLine.QUEUED, CheckinLine.TAKEN_BACK, CheckinLine.NOT_OPEN, CheckinLine.UNDO_OFFLINE, CheckinLine.queueLabel("2026-10-28T03:12:05Z"))) {
                assertFalse("$line names $w", line.contains(w))
            }
        }
    }

    /**
     * A check-in waits only after a try that got no answer (HttpApi counts a read timeout as none), so the server may hold
     * it: its queued line says "No answer" and that it is saved once (as SendLine.QUEUED_LOG), and its Undo never says it
     * hadn't left the phone; it says where to delete one that got through.
     */
    @Test fun aQueuedCheckinsUndoNeverSaysItHadntLeft() {
        assertEquals("No answer: the check-in will send when you're online. It keeps the time you made it. If it got through, it's saved once.", CheckinLine.QUEUED)
        assertEquals("Taken back on the phone. If the first try got through, delete it on the web, in Body › Mind.", CheckinLine.TAKEN_BACK)
        for (line in listOf(CheckinLine.QUEUED, CheckinLine.TAKEN_BACK)) assertFalse(line, line.contains("hadn't left") || line.startsWith("No connection"))
        val vm = (File("src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt")).readText()
        val cancel = Regex("""fun cancelCheckin\(clientId: String\) \{[\s\S]*?\n    \}\n""").find(vm)?.value.orEmpty()
        assertTrue(cancel, cancel.contains("CheckinLine.TAKEN_BACK") && !cancel.contains("SendLine.TAKEN_BACK"))
    }

    /**
     * D2: the receipt's words are picked as the snackbar draws (XSnack.coverMessage on the cover screen, by its short
     * side), so the cover turned sideways and a fold mid-receipt never show them; and a receipt with no Undo time left is
     * shown alone (never a 1 ms snackbar).
     */
    @Test fun theReceiptIsWordedAsItDraws() {
        fun src(p: String) = (File("src/main/java/com/xtnl/app/$p").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/$p")).readText()
        val screen = src("ui/check/CheckScreen.kt")
        val logged = Regex("""is CheckViewModel\.Event\.CheckinLogged -> \{[\s\S]*?\n                \}\n""").find(screen)?.value.orEmpty()
        assertTrue(logged, logged.contains("CheckinLine.receipt(e.line, e.words, cover = false)"))
        assertTrue(logged, logged.contains("if (e.undoMs > 0) snacks.show(receipt, \"Undo\", forMs = e.undoMs, coverMessage = e.line)"))
        assertTrue(logged, logged.contains("else snacks.show(receipt, coverMessage = e.line)"))
        assertFalse("no width test of its own: the snackbar decides", screen.contains("screenWidthDp < Layouts.COMPACT_MAX"))
        val snacks = src("ui/Snacks.kt")
        assertTrue(snacks.contains("val onCover = Layouts.onCover(LocalConfiguration.current.smallestScreenWidthDp)"))
        assertTrue(snacks.contains("val message = if (onCover) (v as? XSnack)?.coverMessage ?: v.message else v.message"))
    }

    /** No praise, no shame, no exclamation: the same plain words for every value. */
    @Test fun theCopyIsPlain() {
        val all = listOf(
            CheckinLine.TITLE, CheckinLine.QUESTION, CheckinLine.STRESS_QUESTION, CheckinLine.QUEUED, CheckinLine.TAKEN_BACK, CheckinLine.NOT_OPEN,
            CheckinLine.UNDO_OFFLINE, CheckinLine.SAFETY_FOOTER, CheckinLine.SAFETY_LABEL,
        ) + CheckinLine.Quadrant.entries.map { it.words } + CheckinLine.STRESS_LEVELS
        val praise = Regex("\\b(great|awesome|well done|good job|amazing|nice|keep it up|proud|bad|poor|failed|worse)\\b", RegexOption.IGNORE_CASE)
        for (s in all) {
            assertFalse(s, s.contains('!'))
            assertFalse(s, praise.containsMatchIn(s))
        }
        assertEquals("Need to talk? Lifeline 13 11 14", CheckinLine.SAFETY_FOOTER)
        assertEquals("tel:131114", CheckinLine.LIFELINE_TEL)
        assertEquals("2026-10-27", CheckinLine.SAFETY_CHECKED_ON)
    }

    /** D5: one neutral haptic, a constant: it takes no value, so every pick feels the same. */
    @Test fun theHapticIsOneNeutralTick() {
        assertEquals(listOf(Beat(TICK, 0.30f, 0)), Scores.checkIn)
        // Feel.checkIn plays the constant and no sound.
        val feel = (File("src/main/java/com/xtnl/app/feel/Feel.kt").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/feel/Feel.kt")).readText()
        val fn = Regex("fun checkIn\\(id: String\\)[^\\n]*").find(feel)?.value.orEmpty()
        assertTrue(fn, fn.contains("Scores.checkIn") && !fn.contains("play(") && !fn.contains("soundAt("))
    }

    /** The sheet's Lifeline line opens the dialer (ACTION_DIAL), never a call, and the app asks for no call permission. */
    @Test fun lifelineOpensTheDialerOnly() {
        fun src(p: String) = (File("src/main/$p").takeIf { it.exists() } ?: File("app/src/main/$p")).readText()
        val sheet = src("java/com/xtnl/app/ui/check/CheckinSheet.kt")
        assertTrue(sheet.contains("Intent(Intent.ACTION_DIAL, Uri.parse(CheckinLine.LIFELINE_TEL))"))
        assertFalse(sheet.contains("Intent.ACTION_CALL"))
        assertFalse(src("AndroidManifest.xml").contains("CALL_PHONE"))
        assertTrue("the haptic at the save, the same call for every value", sheet.contains("feel?.checkIn(\"checkin:\$via\")"))
    }
}

package com.xtnl.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The response envelope and the contract's shapes (docs/mobile-api.md). */
class EnvelopeTest {
    @Test fun okDecodesTheData() {
        val r = HttpApi.parse(200, """{"ok":true,"data":{"instanceId":"i1","xp":8.3,"line":"+8.3 XP · Body","allDone":false,"celebrations":[{"tier":1,"kind":"k","title":"T"}],"extra":1}}""", CompleteResult.serializer())
        val v = (r as Outcome.Ok).value
        assertEquals("i1", v.instanceId)
        assertEquals(8.3, v.xp, 1e-9)
        assertEquals(listOf("T"), celebrationTitles(v.celebrations))
    }

    @Test fun anErrorKeepsTheServersLineAndCode() {
        val r = HttpApi.parse(409, """{"ok":false,"error":"Too late to undo.","code":"conflict"}""", UndoTaskResult.serializer()) as Outcome.Err
        assertEquals("Too late to undo.", r.message)
        assertEquals("conflict", r.code)
        assertEquals(409, r.status)
    }

    @Test fun authSaysWhereToSetTheToken() {
        val r = HttpApi.parse(401, """{"ok":false,"error":"Unauthorized","code":"auth"}""", CheckData.serializer()) as Outcome.Err
        assertEquals("auth", r.code)
        assertTrue(r.message.contains("Settings"))
        val plain = HttpApi.parse(401, "Unauthorized", CheckData.serializer()) as Outcome.Err
        assertEquals("auth", plain.code)
    }

    @Test fun notJsonIsAPlainLine() {
        val r = HttpApi.parse(404, "<html>Not found</html>", CheckData.serializer()) as Outcome.Err
        assertTrue(r.message.contains("404"))
        val s = HttpApi.parse(502, "Bad gateway", CheckData.serializer()) as Outcome.Err
        assertTrue(s.message.contains("502"))
    }

    @Test fun theCheckShapeDecodes() {
        val json = """{"ok":true,"data":{"now":"2026-10-21T00:12:00.000Z","day":"2026-10-21","dayLabel":"Wed 21 Oct",
          "tasks":[{"templateId":"t1","title":"Gym legs","lane":"MUST","status":"OPEN","minutes":60,"mvv":"10 squats","icon":"dumbbell","dueLabel":"by Fri","xpHint":8.3},
                   {"templateId":"t2","title":"Review","lane":"TASK","status":"LOCKED","minutes":null,"mvv":null,"icon":null,"dueLabel":null,"xpHint":null}],
          "tasksSummary":{"open":2,"done":0,"allDone":false},
          "review":{"due":12,"doneToday":4,"target":20,"nextDueAt":null},
          "work":[{"id":"w1","boardId":"b","boardName":"Acme Sales","title":"Call Jordan back","dueAt":"2026-10-20T23:00:00.000Z","allDay":false,"channel":"CALL","overdue":true,"collection":null,
                   "customer":{"id":"c","name":"Jordan Lee","number":"1042","phone":"0412 345 678"}}],
          "level":null,"streak":{"days":12,"keptToday":true,"freezes":2}}}"""
        val d = (HttpApi.parse(200, json, CheckData.serializer()) as Outcome.Ok).value
        assertEquals(2, d.tasks.size)
        assertTrue(d.tasks[1].locked)
        assertTrue(d.tasks[0].countsForBoard)
        assertEquals(20, d.review!!.target)
        assertNull(d.level)
        assertEquals("0412 345 678", d.work.single().customer!!.phone)
    }

    /** The week audit's decay (P12): count, top and unread; a week from an older server has none. */
    @Test fun theWeeksDecayDecodes() {
        val week = """"week":{"weekKey":"2026-W43","label":"Week of 19 Oct","rate":86,"kept":26,"due":30,"minimum":3,"skipped":2,"held":0,"open":0,
          "short":0,"target":85,"status":"provisional","calibrating":false,"asOfDay":null"""
        val withDecay = """{"ok":true,"data":{"tasks":[],$week,"decaying":{"count":4,"unread":0,"top":[
          {"kind":"domain","title":"Probability fell to L3 (from L4)","detail":"2 ideas fading in it. Reviewing them brings the level back."}]}}}}"""
        val d = (HttpApi.parse(200, withDecay, CheckData.serializer()) as Outcome.Ok).value.week!!.decaying!!
        assertEquals(4, d.count)
        assertEquals("domain", d.top.single().kind)
        assertEquals("Probability fell to L3 (from L4)", d.top.single().title)
        val older = (HttpApi.parse(200, """{"ok":true,"data":{"tasks":[],$week}}}""", CheckData.serializer()) as Outcome.Ok).value.week!!
        assertNull(older.decaying)
        val notRead = (HttpApi.parse(200, """{"ok":true,"data":{"tasks":[],$week,"decaying":null}}}""", CheckData.serializer()) as Outcome.Ok).value.week!!
        assertNull(notRead.decaying)
    }

    /** The audit's switch (D37: what the Sunday reminder follows): sent beside a null week in the launch week; false from an older server. */
    @Test fun theAuditSwitchDecodes() {
        val on = (HttpApi.parse(200, """{"ok":true,"data":{"tasks":[],"auditOn":true,"week":null}}""", CheckData.serializer()) as Outcome.Ok).value
        assertTrue(on.auditOn)
        assertNull(on.week)
        val older = (HttpApi.parse(200, """{"ok":true,"data":{"tasks":[]}}""", CheckData.serializer()) as Outcome.Ok).value
        assertFalse(older.auditOn)
    }

    @Test fun theAnswerShapeDecodes() {
        val json = """{"ok":true,"data":{"correct":false,"expected":"ATP","explanation":null,"judged":{"correct":false,"reason":"Names something else."},
          "xp":0,"comboNext":0,"multiplier":1,"levelFrom":3,"levelTo":2,"nextDueDay":"2026-10-22","retry":true,"trueFact":"Missed",
          "quest":{"done":5,"target":null},"streakSecured":false,"celebrations":[]}}"""
        val a = (HttpApi.parse(200, json, AnswerResult.serializer()) as Outcome.Ok).value
        assertEquals("ATP", a.expectedText)
        assertEquals(false, a.judged!!.correct)
        assertTrue(a.retry)
        assertNull(a.quest!!.target)
        assertEquals(2, a.levelTo)
    }

    @Test fun collectionsReadEitherShape() {
        val meta = (HttpApi.parse(200, """{"ok":true,"data":{"formats":[{"type":"MCQ","label":"Multiple choice","points":8,"help":"h"}],
            "collections":[{"value":"BOOK","label":"Book"},"PROPOSAL"]}}""", IdeasMeta.serializer()) as Outcome.Ok).value
        assertEquals(listOf(Choice("BOOK", "Book"), Choice("PROPOSAL", "Proposal")), collectionChoices(meta))
    }
}

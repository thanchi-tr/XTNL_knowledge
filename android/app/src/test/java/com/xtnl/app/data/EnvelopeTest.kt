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

    /** GET /status (P1): the doc's shape decodes; Intellect's cap and streak are null; Capital may be null. */
    @Test fun theStatusShapeDecodes() {
        val json = """{"ok":true,"data":{"now":"2026-10-23T00:12:00.000Z","day":"2026-10-23","launched":true,
          "attributes":[{"key":"VITALITY","attribute":"Vitality","name":"Body","level":6,"progress":0.31,"banked":0.25,"cap":9,"atCap":false,"keptStreak":4,
                         "weeks":["kept","missed","held"],"line":"1,960 / 2,401 XP · depth cap 9 · 7 more kept weeks raise it","unit":"xp"},
                        {"key":"INTELLECT","attribute":"Intellect","name":"Knowledge","level":17,"progress":0.52,"banked":0.44,"cap":null,"atCap":false,"keptStreak":null,
                         "weeks":[],"line":"6 Fields, the best counts fully","unit":"pts"}],
          "capital":{"month":"2026-10","label":"October 2026","wonCents":1240000,"won":"${'$'}12,400","deals":1,"line":"1 deal won in October",
                     "history":"September ${'$'}8,200 · August ${'$'}0","months":[{"month":"2026-10","label":"October 2026","wonCents":1240000,"won":"${'$'}12,400","deals":1}]}}}"""
        val d = (HttpApi.parse(200, json, StatusPanel.serializer()) as Outcome.Ok).value
        assertTrue(d.launched)
        assertEquals(listOf("VITALITY", "INTELLECT"), d.attributes.map { it.key })
        assertEquals(9, d.attributes[0].cap)
        assertNull(d.attributes[1].cap)
        assertNull(d.attributes[1].keptStreak)
        assertEquals(listOf("kept", "missed", "held"), d.attributes[0].weeks)
        assertEquals(1_240_000L, d.capital!!.wonCents)
        val none = (HttpApi.parse(200, """{"ok":true,"data":{"launched":false,"attributes":[{"key":"INTELLECT","name":"Knowledge","level":3}],"capital":null}}""", StatusPanel.serializer()) as Outcome.Ok).value
        assertFalse(none.launched)
        assertNull(none.capital)
        assertEquals(3, none.attributes.single().level)
        assertNull("a server before P4 sends no targets", none.targets)
    }

    /** GET /status (P4): the targets decode with the doc's keys; a baseline, a day, a value, a share and a pace may be null; null targets stay null. */
    @Test fun theStatusTargetsDecode() {
        val json = """{"ok":true,"data":{"launched":true,"attributes":[],"capital":null,"targets":[
          {"id":"weight","attribute":"VITALITY","label":"Weight","metric":"WEIGHT","unit":"kg","direction":"DOWN","baseline":85.2,"baselineDay":"2026-10-01",
           "target":75,"targetDay":"2027-03-01","current":82.4,"currentDay":"2026-10-23","source":"WEIGHT","share":0.274,"pace":"ON_PACE",
           "line":"Weight 82.4 → 75 kg · 27% of the way · on pace"},
          {"id":"t2","attribute":"CARE","label":"Calls home","metric":"MANUAL","unit":"","direction":"UP","baseline":null,"baselineDay":null,
           "target":3,"targetDay":null,"current":null,"currentDay":null,"source":"SELF","share":null,"pace":null,"line":"Calls home → 3 · no reading yet · self-reported"}]}}"""
        val d = (HttpApi.parse(200, json, StatusPanel.serializer()) as Outcome.Ok).value
        val t = d.targets!!
        assertEquals(listOf("weight", "t2"), t.map { it.id })
        assertEquals(75.0, t[0].target, 0.0)
        assertEquals(0.274, t[0].share!!, 1e-9)
        assertEquals("ON_PACE", t[0].pace)
        assertNull(t[1].baseline)
        assertNull(t[1].current)
        assertNull(t[1].share)
        assertEquals("SELF", t[1].source)
        val unread = (HttpApi.parse(200, """{"ok":true,"data":{"launched":true,"attributes":[],"capital":null,"targets":null}}""", StatusPanel.serializer()) as Outcome.Ok).value
        assertNull(unread.targets)
    }

    /** GET /status (P5): the skills decode with the doc's keys, each attribute's count; null skills stay null; an older server sends none. */
    @Test fun theStatusSkillsDecode() {
        val json = """{"ok":true,"data":{"launched":true,"attributes":[{"key":"CRAFT","attribute":"Craft","name":"Craft","level":6,"skills":2}],"capital":null,"targets":[],"skills":[
          {"id":"sk1","name":"Writing","attribute":"CRAFT","kind":"PRACTICE","fieldName":null,"hours":142.5,"tier":2,"tierFrom":100,"tierTo":500,
           "progress":0.106,"toNext":357.5,"line":"≈ 142 h (task estimates, not timed)","tierLine":"Tier 2 · 100–500 h · 357 h to Tier 3",
           "ticks":171,"estimated":3,"walks":0,"templates":2},
          {"id":"sk2","name":"Walking","attribute":"VITALITY","kind":"EXERCISE","fieldName":null,"hours":12.5,"tier":1,"tierFrom":0,"tierTo":100,
           "progress":0.125,"toNext":87.5,"line":"12.5 h of walks","tierLine":"Tier 1 · 0–100 h · 87.5 h to Tier 2","ticks":0,"estimated":0,"walks":9,"templates":0}]}}"""
        val d = (HttpApi.parse(200, json, StatusPanel.serializer()) as Outcome.Ok).value
        assertEquals(2, d.attributes.single().skills)
        val s = d.skills!!
        assertEquals(listOf("sk1", "sk2"), s.map { it.id })
        assertEquals(142.5, s[0].hours, 0.0)
        assertEquals(357.5, s[0].toNext!!, 0.0)
        assertEquals("EXERCISE", s[1].kind)
        assertEquals(9, s[1].walks)
        val unread = (HttpApi.parse(200, """{"ok":true,"data":{"launched":true,"attributes":[{"key":"CRAFT","name":"Craft"}],"capital":null,"skills":null}}""", StatusPanel.serializer()) as Outcome.Ok).value
        assertNull(unread.skills)
        assertEquals("an older server sends no count", 0, unread.attributes.single().skills)
    }

    /** POST /tasks/complete (P5): the tick's skill decodes; none from a task that feeds no skill, or an older server. */
    @Test fun theTicksSkillDecodes() {
        val r = HttpApi.parse(200, """{"ok":true,"data":{"instanceId":"i1","xp":4.1,"line":"+4.1 XP · Care","allDone":false,"celebrations":[{"tier":2,"kind":"competency-tier","title":"Reading reached Tier 2"}],
          "level":null,"competency":{"id":"sk-read","name":"Reading","hoursAfter":100.17,"tier":2,"tierUp":true,"line":"≈ 100 h (task estimates, not timed)"}}}""", CompleteResult.serializer())
        val c = (r as Outcome.Ok).value.competency!!
        assertEquals(listOf("sk-read", "Reading"), listOf(c.id, c.name))
        assertEquals(100.17, c.hoursAfter, 0.0)
        assertTrue(c.tierUp)
        assertNull((HttpApi.parse(200, """{"ok":true,"data":{"instanceId":"i1","xp":4.1,"competency":null}}""", CompleteResult.serializer()) as Outcome.Ok).value.competency)
        assertNull((HttpApi.parse(200, """{"ok":true,"data":{"instanceId":"i1","xp":4.1}}""", CompleteResult.serializer()) as Outcome.Ok).value.competency)
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

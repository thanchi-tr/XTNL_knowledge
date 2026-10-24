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

    /** P16: the wallet on /check and a write's credits; null (credits off) and absent (an older server) both read as none. */
    @Test fun creditsDecodeAndTheirAbsenceIsNone() {
        val on = (HttpApi.parse(200, """{"ok":true,"data":{"credits":{"balance":120,"today":40}}}""", CheckData.serializer()) as Outcome.Ok).value
        assertEquals(Wallet(120, 40), on.credits)
        assertNull((HttpApi.parse(200, """{"ok":true,"data":{"credits":null}}""", CheckData.serializer()) as Outcome.Ok).value.credits)
        assertNull((HttpApi.parse(200, """{"ok":true,"data":{}}""", CheckData.serializer()) as Outcome.Ok).value.credits)
        val tick = (HttpApi.parse(200, """{"ok":true,"data":{"instanceId":"i1","credits":{"delta":10,"balance":130,"today":30}}}""", CompleteResult.serializer()) as Outcome.Ok).value
        assertEquals(CreditsChange(10, 130, 30), tick.credits)
        // An older server sends no today: it reads as none (the chip then steps by the change).
        val older = (HttpApi.parse(200, """{"ok":true,"data":{"instanceId":"i1","credits":{"delta":10,"balance":130}}}""", CompleteResult.serializer()) as Outcome.Ok).value
        assertEquals(CreditsChange(10, 130), older.credits)
        assertNull((HttpApi.parse(200, """{"ok":true,"data":{"instanceId":"i1","credits":null}}""", CompleteResult.serializer()) as Outcome.Ok).value.credits)
        assertEquals(CreditsChange(0, 120), (HttpApi.parse(200, """{"ok":true,"data":{"credits":{"delta":0,"balance":120}}}""", AnswerResult.serializer()) as Outcome.Ok).value.credits)
        assertEquals(CreditsChange(10, 50), (HttpApi.parse(200, """{"ok":true,"data":{"kind":"task","credits":{"delta":10,"balance":50}}}""", LogResult.serializer()) as Outcome.Ok).value.credits)
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

    /** P23: a row's proof and timer decode; an older server's row (neither sent) reads as no proof and no timer; the timer routes' answer. */
    @Test fun theProofRowAndTimerDecode() {
        val json = """{"ok":true,"data":{"tasks":[
          {"templateId":"t1","title":"Write the thesis chapter","lane":"TASK","status":"OPEN","minutes":90,"xpHint":26.7,"proof":true,
           "timer":{"sessionId":"s1","templateId":"t1","startedAt":"2026-10-24T00:20:00.000Z","endedAt":null,"running":true}},
          {"templateId":"t2","title":"Dishes","lane":"HABIT","status":"OPEN","minutes":15,"proof":false,"timer":null},
          {"templateId":"t3","title":"Floss","lane":"MUST","status":"OPEN"}]}}"""
        val d = (HttpApi.parse(200, json, CheckData.serializer()) as Outcome.Ok).value
        assertTrue(d.tasks[0].proof)
        assertEquals("s1", d.tasks[0].timer!!.sessionId)
        assertTrue(d.tasks[0].timer!!.running)
        assertNull(d.tasks[0].timer!!.endedAt)
        assertFalse(d.tasks[1].proof)
        assertNull(d.tasks[1].timer)
        assertFalse(d.tasks[2].proof)
        assertNull(d.tasks[2].timer)
        // P24: an older server's row (no `pages`) reads as no reading task.
        assertNull(d.tasks[0].pages)
        assertNull(d.tasks[2].pages)
        val stop = """{"ok":true,"data":{"timer":{"sessionId":"s1","templateId":"t1","startedAt":"2026-10-24T00:20:00.000Z","endedAt":"2026-10-24T00:54:00.000Z","running":false},
          "line":"Timer stopped at 34 min. Tick the task to count them."}}"""
        val r = (HttpApi.parse(200, stop, TimerResult.serializer()) as Outcome.Ok).value
        assertFalse(r.timer!!.running)
        assertEquals("Timer stopped at 34 min. Tick the task to count them.", r.line)
        // Review: an older server sends no day and no earlier segments; a newer one both (a resumed timer).
        assertNull(d.tasks[0].timer!!.day)
        assertEquals(0, d.tasks[0].timer!!.priorMinutes)
        val resumed = """{"ok":true,"data":{"timer":{"sessionId":"s2","templateId":"t1","day":"2026-10-24","startedAt":"2026-10-24T01:20:00.000Z","endedAt":null,"running":true,"priorMinutes":34},
          "line":"Timer started. Tick the task when you stop: the time it ran counts."}}"""
        val t = (HttpApi.parse(200, resumed, TimerResult.serializer()) as Outcome.Ok).value.timer!!
        assertEquals("2026-10-24", t.day)
        assertEquals(34, t.priorMinutes)
    }

    /** P24: a reading task's `pages` decodes, its target or none; `null` reads as no reading task. */
    @Test fun theReadingRowDecodes() {
        val json = """{"ok":true,"data":{"tasks":[
          {"templateId":"t1","title":"Read the novel","lane":"HABIT","status":"OPEN","minutes":40,"proof":false,"timer":null,"pages":{"target":30}},
          {"templateId":"t2","title":"Read","lane":"TASK","status":"OPEN","proof":false,"timer":null,"pages":{"target":null}},
          {"templateId":"t3","title":"Dishes","lane":"HABIT","status":"OPEN","proof":false,"timer":null,"pages":null}]}}"""
        val d = (HttpApi.parse(200, json, CheckData.serializer()) as Outcome.Ok).value
        assertEquals(30, d.tasks[0].pages!!.target)
        assertNull(d.tasks[1].pages!!.target)
        assertNull(d.tasks[2].pages)
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

    /** P18: GET /mall as the doc lists it; credits null while they are off, no good day while the hints calibrate. */
    @Test fun theMallShapeDecodes() {
        val off = (HttpApi.parse(200, """{"ok":true,"data":{"now":"2026-10-24T00:12:00.000Z","day":"2026-10-24","credits":null,
            "creditsLine":"Credits aren't counted yet: they start at none on the day they are switched on.","goodDay":null,
            "hintLine":"Price hints wait for credits: they read your own days once credits are counted.",
            "categories":[{"key":"TREAT","label":"Treats","examples":"a takeaway, a dessert, a coffee out"}],
            "rewards":[{"id":"rw-1","title":"Takeaway night","category":"TREAT","categoryLabel":"Treats","price":120,"priceLine":"120 cr",
              "hint":"calibrating","note":"From the Thai place","cooldownDays":7,"cooldownLine":"at most once every 7 days"}],
            "archived":[{"id":"rw-0","title":"Old game","category":"SCREEN","categoryLabel":"Screen time","price":30,"priceLine":"30 cr",
              "hint":"calibrating","note":null,"cooldownDays":null,"cooldownLine":null,"archivedAt":"2026-10-20T03:00:00.000Z"}],
            "limits":{"titleMax":60,"noteMax":200,"priceMin":1,"priceMax":100000,"cooldownMin":1,"cooldownMax":365,"rewardsMax":60},
            "notes":{"honour":"…runs on honour…","free":"#play, rest days and sleep are never priced: …","onlyYours":"Only the rewards you list are priced.","buying":"Buying isn't built yet."},
            "writesOn":true,"ready":true}}""", MallData.serializer()) as Outcome.Ok).value
        assertNull(off.credits)
        assertNull(off.goodDay)
        assertEquals(120, off.rewards.single().price)
        assertEquals(7, off.rewards.single().cooldownDays)
        assertEquals("2026-10-20T03:00:00.000Z", off.archived.single().archivedAt)
        assertEquals(100_000, off.limits.priceMax)
        assertTrue(off.notes.free.startsWith("#play"))
        val live = (HttpApi.parse(200, """{"ok":true,"data":{"credits":{"balance":1240,"today":40},"goodDay":{"credits":40,"days":28,"earningDays":22}}}""", MallData.serializer()) as Outcome.Ok).value
        assertEquals(Wallet(1240, 40), live.credits)
        assertEquals(MallGoodDay(40, 28, 22), live.goodDay)
        // An older server's answer (no Mall keys at all) reads as an empty Mall, not a crash.
        val bare = (HttpApi.parse(200, """{"ok":true,"data":{}}""", MallData.serializer()) as Outcome.Ok).value
        assertTrue(bare.rewards.isEmpty() && bare.categories.isEmpty() && !bare.writesOn)
        val added = (HttpApi.parse(200, """{"ok":true,"data":{"id":"rw-2","reward":{"id":"rw-2","title":"A gig","category":"OUTING","price":400,"priceLine":"400 cr","hint":"≈ 10 good days"}}}""", AddRewardResult.serializer()) as Outcome.Ok).value
        assertEquals("≈ 10 good days", added.reward!!.hint)
        assertNull((HttpApi.parse(200, """{"ok":true,"data":{"id":"rw-2","reward":null}}""", AddRewardResult.serializer()) as Outcome.Ok).value.reward)
        val refused = HttpApi.parse(409, """{"ok":false,"error":"Sleep, naps and rest days stay free: the Mall never prices them.","code":"conflict"}""", AddRewardResult.serializer()) as Outcome.Err
        assertEquals("Sleep, naps and rest days stay free: the Mall never prices them.", refused.message)
        assertNull("an older server's reward carries no Buy state", off.rewards.single().buy)
        assertTrue("an older server sends no purchases", off.purchases.isEmpty())
    }

    /** P19: GET /mall's Buy states and purchases, POST /mall/buy and POST /mall/undo, as the doc lists them. */
    @Test fun theBuyAndUndoShapesDecode() {
        val mall = (HttpApi.parse(200, """{"ok":true,"data":{"credits":{"balance":1120,"today":40},
            "rewards":[{"id":"rw-1","title":"Takeaway night","category":"TREAT","price":120,"priceLine":"120 cr","hint":"≈ 3 good days",
              "buy":{"can":false,"why":"At most once every 7 days: next on Wed 4 Nov."}}],
            "purchases":[{"id":"ev-1","rewardId":"rw-1","title":"Takeaway night","price":120,"priceLine":"120 cr","day":"2026-10-28",
              "occurredAt":"2026-10-28T10:05:00.000Z","at":"21:05","refunded":false,"undoUntil":"2026-10-28T10:15:00.000Z","line":"Bought Wed 28 Oct at 21:05"}],
            "limits":{"undoMinutes":10}}}""", MallData.serializer()) as Outcome.Ok).value
        assertEquals(MallBuyState(false, "At most once every 7 days: next on Wed 4 Nov."), mall.rewards.single().buy)
        assertEquals("2026-10-28T10:15:00.000Z", mall.purchases.single().undoUntil)
        assertEquals(10, mall.limits.undoMinutes)
        val bought = (HttpApi.parse(200, """{"ok":true,"data":{"purchase":{"id":"ev-1","title":"Takeaway night","price":120,"priceLine":"120 cr","at":"21:05",
            "refunded":false,"undoUntil":"2026-10-28T10:15:00.000Z","line":"Bought Wed 28 Oct at 21:05"},
            "credits":{"delta":-120,"balance":1120},"duplicate":false,"line":"Takeaway night bought for 120 cr · 1,120 cr left.",
            "celebrations":[{"tier":2,"kind":"mall-buy","title":"Takeaway night bought"}]}}""", BuyResult.serializer()) as Outcome.Ok).value
        assertEquals(CreditsChange(-120, 1120), bought.credits)
        assertEquals("ev-1", bought.purchase!!.id)
        assertEquals(listOf("Takeaway night bought"), celebrationTitles(bought.celebrations))
        val repeat = (HttpApi.parse(200, """{"ok":true,"data":{"purchase":{"id":"ev-1"},"credits":{"delta":0,"balance":1120},"duplicate":true}}""", BuyResult.serializer()) as Outcome.Ok).value
        assertTrue("a resend answers the purchase already made", repeat.duplicate && repeat.credits == CreditsChange(0, 1120))
        val short = HttpApi.parse(409, """{"ok":false,"error":"Takeaway night costs 120 cr; you have 30 cr (90 cr short).","code":"conflict"}""", BuyResult.serializer()) as Outcome.Err
        assertEquals("conflict", short.code)
        val undone = (HttpApi.parse(200, """{"ok":true,"data":{"purchaseId":"ev-1","credits":{"delta":120,"balance":1240},"duplicate":false,"line":"Takeaway night undone: 120 cr back."}}""", UndoBuyResult.serializer()) as Outcome.Ok).value
        assertEquals(CreditsChange(120, 1240), undone.credits)
        val late = HttpApi.parse(409, """{"ok":false,"error":"Too late to undo: a purchase can be undone for 10 minutes.","code":"conflict"}""", UndoBuyResult.serializer()) as Outcome.Err
        assertEquals("Too late to undo: a purchase can be undone for 10 minutes.", late.message)
    }

    /** P27: POST /exercise's reply as docs/mobile-api.md shows it, and the body the sync sends (absent fields left out). */
    @Test fun theHealthSyncShapesDecodeAndEncode() {
        val r = (HttpApi.parse(200, """{"ok":true,"data":{"walks":{"added":2,"paid":1,"recorded":1,"matched":1,"duplicate":3,"xp":18.4},
            "weights":{"added":1,"kept":0},"refused":[{"kind":"walk","externalId":"hc-9","error":"A distance between 0.01 and 200 km, please."}],
            "line":"Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 already logged · 1 weigh-in"}}""", HealthSyncResult.serializer()) as Outcome.Ok).value
        assertEquals(HealthWalkCounts(2, 1, 1, 1, 3, 18.4), r.walks)
        assertEquals(HealthWeightCounts(1, 0), r.weights)
        assertEquals(listOf(HealthRefusal("walk", "hc-9", "A distance between 0.01 and 200 km, please.")), r.refused)
        assertTrue(r.line!!.startsWith("Health Connect: 2 walks in"))
        val off = HttpApi.parse(409, """{"ok":false,"error":"Health Connect imports are recorded by the live app only (this server writes nothing).","code":"conflict"}""", HealthSyncResult.serializer()) as Outcome.Err
        assertEquals("conflict", off.code)
        val body = healthBody(
            HealthBatch(
                since = "2026-10-20T23:00:00Z",
                walks = listOf(HealthWalk("hc-1", "WALK", "2026-10-20T23:20:00Z", "2026-10-20T23:50:00Z", 2.6), HealthWalk("hc-2", "HIKE", "2026-10-21T00:00:00Z", "2026-10-21T01:00:00Z", 3.9, climbM = 160.0, origin = "com.sec.android.app.shealth")),
            ),
        )
        assertEquals(setOf("since", "walks"), body.keys)
        val walks = body["walks"] as kotlinx.serialization.json.JsonArray
        assertEquals(setOf("externalId", "kind", "start", "end", "distanceKm"), (walks[0] as kotlinx.serialization.json.JsonObject).keys)
        assertEquals(setOf("externalId", "kind", "start", "end", "distanceKm", "climbM", "origin"), (walks[1] as kotlinx.serialization.json.JsonObject).keys)
    }
}

package com.xtnl.app.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** Board clear follows the web's rule (Must, Planned and Habits), as the demo answers it and the app shows it. */
class DemoBoardTest {
    @Test fun anOpenHabitKeepsTheBoardFromClearing() = runTest {
        val api = DemoApi()
        for (id in listOf("t-gym", "t-dentist", "t-tax")) {
            val r = api.completeTask(id, mvv = false, clientId = "c-$id") as Outcome.Ok
            assertFalse("$id: habits are still open", r.value.allDone)
        }
        val check = (api.check() as Outcome.Ok).value
        assertFalse(check.tasksSummary!!.allDone)
        assertTrue(check.tasks.any { it.lane == "HABIT" && it.open })
    }

    /** The daily quests (D14, D15): the Must lane's rows, the minimum counting as kept. */
    @Test fun theDailyQuestsCountTheMustLane() = runTest {
        val api = DemoApi()
        val before = (api.check() as Outcome.Ok).value.daily!!
        assertEquals(listOf("t-gym", "t-floss"), before.quests.map { it.templateId })
        assertEquals(listOf(1, 2, 1, 5), listOf(before.kept, before.total, before.minimum, before.cap))
        assertFalse(before.full)
        assertTrue(api.completeTask("t-gym", mvv = false, clientId = "c-gym") is Outcome.Ok)
        val after = (api.check() as Outcome.Ok).value.daily!!
        assertEquals(2, after.kept)
        assertTrue(after.full)
    }

    /** A sixth must is logged as an ordinary task, never refused; the 4th and 5th say how near the cap. */
    @Test fun aSixthMustIsLoggedAsAnOrdinaryTask() = runTest {
        val api = DemoApi()
        val lines = (1..4).map { (api.log("call mum ! daily", "task", "l-$it") as Outcome.Ok).value.line.orEmpty() }
        assertFalse(lines[0].contains("daily quests"))
        assertTrue(lines[1], lines[1].endsWith("4 of 5 daily quests"))
        assertTrue(lines[2], lines[2].endsWith("5 of 5 daily quests, the cap"))
        assertTrue(lines[3], lines[3].startsWith("Added (not a Must). ") && lines[3].endsWith("Five daily quests is the cap. Soften one first."))
        val check = (api.check() as Outcome.Ok).value
        assertEquals(5, check.tasks.count { it.lane == "MUST" })
        assertEquals(5, check.daily!!.total)
    }

    /** The ideas past their grace (D23), as the server counts them; a card reviewed today leaves the line. */
    @Test fun aReviewedCardLeavesTheFadingLine() = runTest {
        val api = DemoApi()
        val before = (api.check() as Outcome.Ok).value.fading!!
        assertEquals(listOf(3, 1), listOf(before.ideas, before.forgetting))
        assertEquals(listOf("Cell biology" to 2, "Integration" to 1), before.domains.map { it.name to it.ideas })
        assertTrue(api.answer("d-int", JsonPrimitive("1"), 0, 0, "a-int") is Outcome.Ok)
        val after = (api.check() as Outcome.Ok).value.fading!!
        assertEquals(listOf(2, 0), listOf(after.ideas, after.forgetting))
        assertEquals(listOf("Cell biology"), after.domains.map { it.name })
    }

    /** The weekly audit (D12): read live on a Sunday (a tick counts); any other day last week's frozen copy, which never moves. */
    @Test fun aTickMovesTheWeekOnlyWhileItIsProvisional() = runTest {
        val api = DemoApi()
        val before = (api.check() as Outcome.Ok).value.week!!
        assertTrue(api.completeTask("t-gym", mvv = false, clientId = "c-gym") is Outcome.Ok)
        val after = (api.check() as Outcome.Ok).value.week!!
        if (before.status == "provisional") {
            assertEquals(before.kept + 1, after.kept)
            assertEquals(before.open - 1, after.open)
        } else {
            assertEquals(before, after)
            assertTrue(before.asOfDay != null)
        }
        assertEquals(85, after.target)
        assertEquals(after.kept * 100 / after.due, after.rate)
        // P12: "Decaying this week" rides with the week (its count, its first three lines).
        assertEquals(4, after.decaying!!.count)
        assertEquals(3, after.decaying!!.top.size)
    }

    /** The week shown turns at Sunday 18:00 Sydney, as the server's does (week-audit auditWeekAt), not at the 04:00 turn. */
    @Test fun theWeekTurnsProvisionalAtSixOnSundayEvening() = runTest {
        // Sunday 25 October 2026 (AEDT): 17:59 is still last week's copy (final: it was judged Wednesday); 18:00 this week.
        val before = (DemoApi { Instant.parse("2026-10-25T06:59:00Z") }.check() as Outcome.Ok).value
        val after = (DemoApi { Instant.parse("2026-10-25T07:00:00Z") }.check() as Outcome.Ok).value
        assertEquals(listOf("2026-W42", "final", "2026-10-19"), before.week!!.let { listOf(it.weekKey, it.status, it.asOfDay) })
        assertEquals(listOf("2026-W43", "provisional", null), after.week!!.let { listOf(it.weekKey, it.status, it.asOfDay) })
        // Saturday evening is never this week's.
        assertEquals("2026-W42", (DemoApi { Instant.parse("2026-10-24T09:00:00Z") }.check() as Outcome.Ok).value.week!!.weekKey)
        assertTrue(before.auditOn && after.auditOn)
    }

    /** GET /quests (P15): read only; the demo's quest rows tick tasks on the board, and a tick there shows here. */
    @Test fun theQuestCardsRowsAreTheBoardsTasks() = runTest {
        val api = DemoApi()
        val tasks = (api.check() as Outcome.Ok).value.tasks.map { it.templateId }.toSet()
        val before = (api.quests() as Outcome.Ok).value
        val ids = before.sprint!!.rows.mapNotNull { it.templateId } + before.three!!.quests.mapNotNull { it.templateId }
        assertTrue(ids.isNotEmpty() && ids.all { it in tasks })
        assertFalse(before.mainQuest!!.startOnWeb)
        assertFalse(before.three!!.quests.single { it.templateId == "t-gym" }.done)
        assertTrue(api.completeTask("t-gym", mvv = false, clientId = "c-gym") is Outcome.Ok)
        val after = (api.quests() as Outcome.Ok).value
        assertTrue(after.three!!.quests.single { it.templateId == "t-gym" }.done)
        assertEquals(before.three!!.done + 1, after.three!!.done)
        // A session ticked today moves the sprint's count, never the row's done (D12: 2 of 3 is not the week met).
        assertTrue(api.completeTask("t-read", mvv = false, clientId = "c-read") is Outcome.Ok)
        val read = (api.quests() as Outcome.Ok).value.sprint!!.rows.single { it.templateId == "t-read" }
        assertEquals("2 of 3 sessions", read.countLine)
        assertFalse(read.done)
        // The rows in Today's order, as the server sends them: open first, then Bring, Add, Step, Practice.
        assertEquals(listOf("RAISE", "ADD", "PRACTICE"), before.sprint!!.rows.map { it.kind })
        // The milestone's Gemini title keeps its note and its struck number, as the server sends them.
        assertEquals("Gemini's words · kept by you · not checked", before.mainQuest!!.milestone?.titleNote)
        assertEquals(listOf(listOf(9, 11)), before.mainQuest!!.milestone?.titleStruck)
    }

    /** GET /status (P1): the five attributes in the panel's order, Duty at its cap, Capital a reading; the gym tick moves Vitality's meter. */
    @Test fun theStatusPanelReadsTheBoardsBodyTrack() = runTest {
        val api = DemoApi()
        val before = (api.status() as Outcome.Ok).value
        assertTrue(before.launched)
        assertEquals(listOf("VITALITY", "INTELLECT", "CRAFT", "DUTY", "CARE"), before.attributes.map { it.key })
        assertEquals(listOf("Body", "Knowledge", "Craft", "Duty", "Care"), before.attributes.map { it.name })
        val intellect = before.attributes.single { it.key == "INTELLECT" }
        assertEquals(null, intellect.cap)
        assertEquals(null, intellect.keptStreak)
        assertTrue(intellect.weeks.isEmpty() && intellect.unit == "pts")
        assertTrue(before.attributes.single { it.key == "DUTY" }.atCap)
        assertTrue(before.attributes.all { it.weeks.size <= 8 })
        val capital = before.capital!!
        assertEquals("\$12,400", capital.won)
        assertEquals(3, capital.months.size)
        assertEquals(capital.month, capital.months.first().month)
        val vitality = before.attributes.single { it.key == "VITALITY" }.progress
        assertTrue(api.completeTask("t-gym", mvv = false, clientId = "c-gym") is Outcome.Ok)
        val after = (api.status() as Outcome.Ok).value.attributes.single { it.key == "VITALITY" }
        assertTrue("the gym tick moves Body's meter", after.progress > vitality)
        assertEquals(6, after.level)
        assertTrue(after.line.startsWith("1,968 / 2,401 XP"))
    }

    /** GET /status (P4): the demo's avatar targets, in the web card's order, each the web's own line; a measure of your own is SELF. */
    @Test fun theStatusPanelCarriesTheAvatarTargets() = runTest {
        val p = (DemoApi().status() as Outcome.Ok).value
        val t = p.targets!!
        assertEquals(listOf("VITALITY", "INTELLECT", "CRAFT", "CARE", "CAPITAL"), t.map { it.attribute })
        assertEquals("Weight 82.4 → 75 kg · 38% of the way · on pace", t.first().line)
        assertEquals("WEIGHT", t.first().metric)
        val own = t.single { it.metric == "MANUAL" }
        assertEquals("SELF", own.source)
        assertTrue(own.line.endsWith("self-reported"))
        assertTrue(t.all { it.share == null || it.share!! in 0.0..1.0 })
        assertTrue("every target has a row or Capital's card", t.all { it.attribute == "CAPITAL" || p.attributes.any { a -> a.key == it.attribute } })
    }

    /** GET /status (P5): the demo's skills, most hours first, in the web's words; each attribute counts its own; a skill pays nothing. */
    @Test fun theStatusPanelCarriesTheSkills() = runTest {
        val p = (DemoApi().status() as Outcome.Ok).value
        val s = p.skills!!
        assertEquals(listOf("sk-write", "sk-read", "sk-strength", "sk-walk"), s.map { it.id })
        assertEquals(listOf(2, 1, 1, 1), s.map { it.tier })
        assertEquals("≈ 142 h (task estimates, not timed)", s[0].line)
        assertEquals("Tier 2 · 100–500 h · 357 h to Tier 3", s[0].tierLine)
        assertEquals("12.5 h of walks", s.single { it.kind == "EXERCISE" }.line)
        assertEquals(listOf(2, 1, 1, 0, 0), p.attributes.map { it.skills })
        assertTrue(s.all { it.progress in 0.0..1.0 })
    }

    /** POST /tasks/complete (P5): the read tick takes Reading across 100 h (a tier-up, once); the gym tick reports Strength; others none. */
    @Test fun aTickReportsItsSkillAndATierUpOnce() = runTest {
        val api = DemoApi()
        val read = (api.completeTask("t-read", mvv = false, clientId = "c-read") as Outcome.Ok).value
        val skill = read.competency!!
        assertEquals("Reading", skill.name)
        assertEquals(2, skill.tier)
        assertTrue(skill.tierUp)
        assertTrue(skill.hoursAfter >= 100.0)
        assertEquals(listOf("Reading reached Tier 2"), celebrationTitles(read.celebrations))
        assertTrue((api.undoTask(read.instanceId, "u-read") is Outcome.Ok))
        val again = (api.completeTask("t-read", mvv = false, clientId = "c-read-2") as Outcome.Ok).value
        assertEquals("a tier re-reached never plays twice", false, again.competency!!.tierUp)
        val gym = (api.completeTask("t-gym", mvv = false, clientId = "c-gym") as Outcome.Ok).value
        assertEquals(listOf("Strength", "≈ 42.5 h (task estimates, not timed)"), gym.competency!!.let { listOf(it.name, it.line) })
        assertEquals(null, (api.completeTask("t-dentist", mvv = false, clientId = "c-dentist") as Outcome.Ok).value.competency)
    }

    /**
     * The credits wallet (P16), as a server with credits switched on sends it: /check's balance and today's, a tick on
     * one of Today's three earns its 10 (the minimum version is not done), a tick on any other task earns nothing, an
     * undo takes the 10 back on the next check, and every figure is a whole credit.
     */
    @Test fun aQuestTickEarnsItsCreditsAndAnUndoTakesThemBack() = runTest {
        val api = DemoApi()
        val start = (api.check() as Outcome.Ok).value.credits!!
        assertEquals(Wallet(185, 0), start)
        val gym = (api.completeTask("t-gym", mvv = false, clientId = "c-gym") as Outcome.Ok).value
        assertEquals(CreditsChange(delta = 10, balance = 195, today = 10), gym.credits)
        assertEquals(Wallet(195, 10), (api.check() as Outcome.Ok).value.credits)
        val tax = (api.completeTask("t-tax", mvv = false, clientId = "c-tax") as Outcome.Ok).value
        assertEquals("not one of Today's three: nothing", CreditsChange(delta = 0, balance = 195, today = 10), tax.credits)
        val dentistMin = (api.completeTask("t-dentist", mvv = true, clientId = "c-dentist") as Outcome.Ok).value
        assertEquals("the minimum version is not the quest done", 0, dentistMin.credits!!.delta)
        assertTrue(api.undoTask(gym.instanceId, "u-gym") is Outcome.Ok)
        assertEquals(Wallet(185, 0), (api.check() as Outcome.Ok).value.credits)
        val log = (api.log("x water the plants", "task", "l-1") as Outcome.Ok).value
        assertEquals(CreditsChange(delta = 0, balance = 185, today = 0), log.credits)
    }

    /** P18 (D30): the demo's Mall opens empty (no starter rewards); an add follows the server's rules and words. */
    @Test fun theMallStartsEmptyAndAnAddKeepsTheRules() = runTest {
        val api = DemoApi()
        val first = (api.mall() as Outcome.Ok).value
        assertTrue("nothing is listed for the user", first.rewards.isEmpty() && first.archived.isEmpty())
        assertEquals(Wallet(185, 0), first.credits)
        assertEquals(listOf("TREAT", "SCREEN", "OUTING", "PURCHASE", "OTHER"), first.categories.map { it.key })
        assertTrue(first.notes.free.startsWith("#play, rest days and sleep are never priced"))

        val gig = (api.addReward("A gig", "OUTING", 400, null, null, "m-1") as Outcome.Ok).value
        assertEquals("≈ 10 good days", gig.reward!!.hint)
        val thai = (api.addReward("  Takeaway   night ", "TREAT", 120, " From the Thai place ", 7, "m-2") as Outcome.Ok).value.reward!!
        assertEquals("Takeaway night", thai.title)
        assertEquals("From the Thai place", thai.note)
        assertEquals("at most once every 7 days", thai.cooldownLine)
        val again = (api.addReward("A gig", "OUTING", 400, null, null, "m-1") as Outcome.Ok).value
        assertEquals("the same clientId lists it once", gig.id, again.id)
        assertEquals(listOf("Takeaway night", "A gig"), (api.mall() as Outcome.Ok).value.rewards.map { it.title })

        fun refusal(r: Outcome<AddRewardResult>) = (r as Outcome.Err).let { it.code to it.message }
        assertEquals("conflict" to "A price is a whole number of credits from 1 to 100,000.", refusal(api.addReward("Pizza", "TREAT", 0, null, null, "m-3")))
        assertEquals("conflict" to "A price is a whole number of credits from 1 to 100,000.", refusal(api.addReward("Pizza", "TREAT", 100_001, null, null, "m-4")))
        assertEquals("conflict" to "Sleep, naps and rest days stay free: the Mall never prices them.", refusal(api.addReward("Sleep in", "OTHER", 50, null, null, "m-5")))
        assertEquals("conflict" to "#play stays free: the Mall never prices what you do for its own sake.", refusal(api.addReward("#play guitar", "OTHER", 50, null, null, "m-6")))
        assertEquals("conflict" to "You already list “takeaway NIGHT”.", refusal(api.addReward("takeaway NIGHT", "TREAT", 90, null, null, "m-7")))
        assertEquals("bad", refusal(api.addReward("Pizza", "FOOD", 50, null, null, "m-8")).first)
        assertEquals("a restaurant is not rest", "Restaurant dinner", (api.addReward("Restaurant dinner", "OUTING", 200, null, null, "m-9") as Outcome.Ok).value.reward!!.title)
        assertEquals(3, (api.mall() as Outcome.Ok).value.rewards.size)
    }

    /**
     * P19 (D31): the demo buys as the server does: exactly the price, never more than the balance; a cooldown holds; a
     * resend of the clientId buys once; an undo gives the price back inside its ten minutes, once, and not after.
     */
    @Test fun theDemoBuysExactlyAndUndoesInsideTenMinutes() = runTest {
        var now = Instant.parse("2026-10-28T10:05:00Z")
        val api = DemoApi { now }
        val thai = (api.addReward("Takeaway night", "TREAT", 120, null, 7, "m-1") as Outcome.Ok).value.reward!!
        val gig = (api.addReward("A gig", "OUTING", 400, null, null, "m-2") as Outcome.Ok).value.reward!!
        val before = (api.mall() as Outcome.Ok).value
        assertEquals(Wallet(185, 0), before.credits)
        assertTrue(before.rewards.first { it.id == thai.id }.buy!!.can)
        assertEquals(MallBuyState(false, "A gig costs 400 cr; you have 185 cr (215 cr short)."), before.rewards.first { it.id == gig.id }.buy)

        val bought = (api.buyReward(thai.id, "b-1") as Outcome.Ok).value
        assertEquals(CreditsChange(-120, 65), bought.credits)
        assertEquals("Takeaway night bought for 120 cr · 65 cr left.", bought.line)
        assertEquals(listOf("Takeaway night bought"), celebrationTitles(bought.celebrations))
        val again = (api.buyReward(thai.id, "b-1") as Outcome.Ok).value
        assertEquals("the same clientId buys once", bought.purchase!!.id, again.purchase!!.id)
        val after = (api.mall() as Outcome.Ok).value
        assertEquals(Wallet(65, 0), after.credits)
        assertEquals(1, after.purchases.size)
        assertEquals("At most once every 7 days: next on Wed 4 Nov.", after.rewards.first { it.id == thai.id }.buy!!.why)
        fun refusal(r: Outcome<BuyResult>) = (r as Outcome.Err).let { it.code to it.message }
        assertEquals("conflict" to "At most once every 7 days: next on Wed 4 Nov.", refusal(api.buyReward(thai.id, "b-2")))
        assertEquals("no overdraft", "conflict" to "A gig costs 400 cr; you have 65 cr (335 cr short).", refusal(api.buyReward(gig.id, "b-3")))
        assertEquals("gone" to "That reward is gone.", refusal(api.buyReward("rw-none", "b-4")))

        val purchase = after.purchases.single()
        assertEquals("2026-10-28T10:15:00Z", purchase.undoUntil)
        now = Instant.parse("2026-10-28T10:14:00Z")
        val undone = (api.undoBuy(purchase.id, "u-1") as Outcome.Ok).value
        assertEquals(CreditsChange(120, 185), undone.credits)
        assertTrue("undone once", (api.undoBuy(purchase.id, "u-2") as Outcome.Ok).value.duplicate)
        assertEquals(Wallet(185, 0), (api.mall() as Outcome.Ok).value.credits)
        assertTrue("an undone purchase no longer holds the cooldown", (api.mall() as Outcome.Ok).value.rewards.first { it.id == thai.id }.buy!!.can)

        (api.buyReward(thai.id, "b-5") as Outcome.Ok).value
        now = Instant.parse("2026-10-28T10:30:00Z")
        val second = (api.mall() as Outcome.Ok).value.purchases.first()
        assertNull("past its ten minutes the purchase offers no undo", second.undoUntil)
        assertEquals("conflict" to "Too late to undo: a purchase can be undone for 10 minutes.", (api.undoBuy(second.id, "u-3") as Outcome.Err).let { it.code to it.message })
    }

    @Test fun theLastHabitClearsTheBoard() = runTest {
        val api = DemoApi()
        // The study task completes itself from the day's reviews (7 done; the demo starts at 4).
        for (id in listOf("d-atp", "d-planet", "d-g")) {
            val answer = when (id) { "d-atp" -> "ATP"; "d-planet" -> "Jupiter"; else -> "9.81" }
            assertTrue(api.answer(id, JsonPrimitive(answer), 0, 0, "a-$id") is Outcome.Ok)
        }
        val ticks = listOf("t-gym", "t-dentist", "t-tax", "t-read", "t-stretch")
        val results = ticks.map { (api.completeTask(it, mvv = false, clientId = "c-$it") as Outcome.Ok).value.allDone }
        assertEquals(listOf(false, false, false, false, true), results)
        assertTrue((api.check() as Outcome.Ok).value.tasksSummary!!.allDone)
    }
}

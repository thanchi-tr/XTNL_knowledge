package com.xtnl.app.data

import com.xtnl.app.core.ProofLine
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

    /**
     * P32: the demo's calibration is this life week's (from last week's frozen copy, 24 of 28: the standard sizes), the
     * capacity under the 240 set and on offer, Floss (a must) eased and accepted, pending; no rate or target on it (D17).
     */
    @Test fun theCalibrationIsThisWeeks() = runTest {
        // Monday 26 October 2026, 10:00 AEDT: the week of 26 Oct.
        val cal = (DemoApi { Instant.parse("2026-10-25T23:00:00Z") }.check() as Outcome.Ok).value.calibration!!
        assertEquals(listOf("2026-W44", "Week of 26 Oct", "Move 20 min · Finish any 2 tasks"), listOf(cal.weekKey, cal.label, cal.sizes.line))
        assertEquals(listOf("capacity:open", "ease:t-floss:accepted"), cal.changes.map { "${it.id}:${it.state}" })
        // The server eases a must only, and says "Not a must from …" only while it is still one with the change pending.
        assertEquals("MUST", (DemoApi { Instant.parse("2026-10-25T23:00:00Z") }.check() as Outcome.Ok).value.tasks.first { it.templateId == "t-floss" }.lane)
        assertEquals("Not a must from Mon 2 Nov.", cal.changes[1].line)
        assertTrue(cal.changes.none { "%" in it.basis || "%" in it.title } && "%" !in cal.sizes.basis)
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

    /**
     * P22: the demo's owed cards, as a server with Duty on sends them (oldest first, the days from the check clock): a
     * make-up repays the whole debt at the card's price and restores the day inside its window, the same clientId answers
     * once, Accept the loss only where the card offers it, and a debt already gone is 404 in the server's words.
     */
    @Test fun theDemosOwedCardsMakeUpAndAcceptOnce() = runTest {
        val api = DemoApi { Instant.parse("2026-10-21T00:12:00Z") }
        val check = (api.check() as Outcome.Ok).value
        assertTrue(check.dutyOn)
        assertEquals(listOf("o-bank", "o-stretch"), check.owed.map { it.instanceId })
        val stretch = check.owed.last()
        assertEquals(listOf("2026-10-20", "2026-10-22", "Stretch · Yesterday"), listOf(stretch.day, stretch.restoreBy, stretch.whenLine))
        assertEquals("Within Fri 04:00 it brings back its streak of 6.", stretch.window)
        fun refusal(r: Outcome<MakeUpResult>) = (r as Outcome.Err).let { it.code to it.message }
        assertEquals("only where the card offers it", "conflict", refusal(api.makeUp("o-stretch", "accept", "m-0")).first)
        assertEquals("bad", refusal(api.makeUp("o-stretch", "minimum", "m-00", minutes = 10)).first)

        val made = (api.makeUp("o-stretch", "makeup", "m-1") as Outcome.Ok).value
        assertEquals(listOf("DONE_LATE", "true", "1.9", "4.2"), listOf(made.status, made.restored.toString(), made.xp.toString(), made.debt.toString()))
        assertEquals("Repaid 4.2 and paid 1.9 exactly; its streak is back. 1 still owed.", made.line)
        assertEquals(listOf("o-bank"), made.owed!!.map { it.instanceId })
        assertEquals("the same clientId answers once", made, (api.makeUp("o-stretch", "makeup", "m-1") as Outcome.Ok).value)
        assertEquals("gone" to "That debt no longer exists.", refusal(api.makeUp("o-stretch", "makeup", "m-2")))

        val lost = (api.makeUp("o-bank", "accept", "m-3") as Outcome.Ok).value
        assertEquals(listOf("WRITTEN_OFF", "0.0", "true"), listOf(lost.status, lost.xp.toString(), lost.clearedLast.toString()))
        assertNull(lost.undoUntil)
        assertEquals("Its −3.0 stays in Duty XP; nothing more is owed.", lost.line)
        assertTrue((api.check() as Outcome.Ok).value.owed.isEmpty())
    }

    /** P22 review: a make-up made here is undone here inside its ten minutes (the web card's Undo): the card comes back. */
    @Test fun theDemosMakeUpIsUndoneInsideItsTenMinutes() = runTest {
        var now = Instant.parse("2026-10-21T00:12:00Z")
        val api = DemoApi { now }
        fun refusal(r: Outcome<MakeUpResult>) = (r as Outcome.Err).let { it.code to it.message }
        assertEquals("gone" to "That make-up no longer exists.", refusal(api.makeUp("o-stretch", "undo", "u-0")))
        val made = (api.makeUp("o-stretch", "makeup", "u-1") as Outcome.Ok).value
        assertEquals("2026-10-21T00:22:00Z", made.undoUntil)
        val undone = (api.makeUp("o-stretch", "undo", "u-2") as Outcome.Ok).value
        assertEquals(listOf("undo", "MISSED", "-1.9", "4.2"), listOf(undone.action, undone.status, undone.xp.toString(), undone.debt.toString()))
        assertNull(undone.undoUntil)
        assertEquals("Make-up undone. It is owed again; nothing else changed.", undone.line)
        assertEquals("oldest first again", listOf("o-bank", "o-stretch"), undone.owed!!.map { it.instanceId })
        assertEquals("bad", refusal(api.makeUp("o-stretch", "undo", "u-3", minutes = 10)).first)
        // Past its ten minutes the make-up stands.
        api.makeUp("o-stretch", "makeup", "u-4")
        now = now.plusSeconds(601)
        assertEquals("conflict" to "That make-up can't be undone any more.", refusal(api.makeUp("o-stretch", "undo", "u-5")))
        assertEquals(listOf("o-bank"), (api.check() as Outcome.Ok).value.owed.map { it.instanceId })
    }

    @Test fun theLastHabitClearsTheBoard() = runTest {
        val api = DemoApi()
        // The study task completes itself from the day's reviews (7 done; the demo starts at 4).
        for (id in listOf("d-atp", "d-planet", "d-g")) {
            val answer = when (id) { "d-atp" -> "ATP"; "d-planet" -> "Jupiter"; else -> "9.81" }
            assertTrue(api.answer(id, JsonPrimitive(answer), 0, 0, "a-$id") is Outcome.Ok)
        }
        // Re-pinned for P23: the demo's deep-work row is a proof one, so it is ticked with its minutes (90, its estimate).
        // Re-pinned for P24: the demo's reading task (t-novel) is ticked with its pages (30, the day's target).
        val ticks = listOf("t-gym", "t-dentist", "t-tax", "t-thesis", "t-read", "t-novel", "t-stretch")
        val results = ticks.map {
            (api.completeTask(it, mvv = false, clientId = "c-$it", minutes = if (it == "t-thesis") 90 else null, pages = if (it == "t-novel") 30 else null) as Outcome.Ok).value.allDone
        }
        assertEquals(listOf(false, false, false, false, false, false, true), results)
        assertTrue((api.check() as Outcome.Ok).value.tasksSummary!!.allDone)
    }

    /**
     * P31: the demo's side quest is an ordinary one-off (TASK lane, never a must) that says so ("Side quest · expires …")
     * and asks nothing of the day while open: it never counts in tasksSummary's open (theLastHabitClearsTheBoard clears
     * with it still open); ticked, it counts as done like any row.
     */
    @Test fun aSideQuestAsksNothingOfTheDay() = runTest {
        val api = DemoApi { Instant.parse("2026-10-21T01:00:00Z") }
        val check = (api.check() as Outcome.Ok).value
        val walk = check.tasks.single { it.side }
        assertEquals("TASK", walk.lane)
        assertEquals("Side quest · expires Fri", walk.dueLabel)
        assertEquals("2026-10-23", walk.expiresDay)
        assertTrue("every other row carries no side keys", check.tasks.filter { it.templateId != walk.templateId }.all { !it.side && it.expiresDay == null })
        val before = check.tasksSummary!!
        assertTrue(api.completeTask(walk.templateId, mvv = false, clientId = "c-side") is Outcome.Ok)
        val after = (api.check() as Outcome.Ok).value.tasksSummary!!
        assertEquals("it was never counted open", before.open, after.open)
        assertEquals(before.done + 1, after.done)
        // The week card's lane beside the rate (week.side), never in it.
        assertEquals(WeekSide(done = 1, offered = 2), (api.check() as Outcome.Ok).value.week!!.side)
    }

    /** P23: a proof row's full tick takes its minutes or its timer; a chore and the minimum still tick in one tap. */
    @Test fun aProofRowNeedsItsMinutes() = runTest {
        val api = DemoApi()
        val row = (api.check() as Outcome.Ok).value.tasks.single { it.templateId == "t-thesis" }
        assertTrue(row.proof)
        assertNull(row.timer)
        val refused = api.completeTask("t-thesis", mvv = false, clientId = "c-1") as Outcome.Err
        assertEquals(409, refused.status)
        assertTrue(refused.message, refused.message.startsWith("Log the minutes"))
        assertTrue("a chore ticks in one tap", api.completeTask("t-dentist", mvv = false, clientId = "c-2") is Outcome.Ok)
        val tick = (api.completeTask("t-thesis", mvv = false, clientId = "c-3", minutes = 90) as Outcome.Ok).value
        assertEquals("a 90-minute logged tick prices as its estimate's", 26.7, tick.xp, 0.0)
        // Re-pinned by P29: the demo is a server with the streak multiplier on, so a full tick's line ends with its C.
        assertTrue(tick.line!!, tick.line!!.endsWith(" · 90 min · streak ×1.16"))
        assertEquals(400, (api.completeTask("t-gym", mvv = false, clientId = "c-4", minutes = 481) as Outcome.Err).status)
    }

    /** P23: one timer at a time; a stopped timer waits for the tick, which counts it once. */
    @Test fun aTimerIsCountedByItsTick() = runTest {
        var now = Instant.parse("2026-10-24T01:00:00Z")
        val api = DemoApi(clock = { now })
        val started = (api.startTimer("t-thesis", "s-1") as Outcome.Ok).value.timer!!
        assertTrue(started.running)
        assertEquals("a resend answers the same timer", started, (api.startTimer("t-thesis", "s-1") as Outcome.Ok).value.timer)
        now = now.plusSeconds(10 * 60)
        val other = (api.startTimer("t-tax", "s-2") as Outcome.Ok).value.timer!!
        val rows = (api.check() as Outcome.Ok).value.tasks
        assertFalse("a start stops the other timer", rows.single { it.templateId == "t-thesis" }.timer!!.running)
        assertTrue(rows.single { it.templateId == "t-tax" }.timer!!.running)
        val stopped = (api.stopTimer(other.sessionId, "s-3") as Outcome.Ok).value
        assertFalse(stopped.timer!!.running)
        assertEquals(404, (api.stopTimer("s-gone", "s-4") as Outcome.Err).status)
        val tick = (api.completeTask("t-thesis", mvv = false, clientId = "c-1", sessionId = started.sessionId) as Outcome.Ok).value
        // Re-pinned (review): a timer counts what it ran (the plan's min(reported, clock)), not half the estimate.
        assertTrue(tick.line!!, tick.line!!.endsWith(" · 10 min · streak ×1.16"))
        assertNull("counted once: the timer is gone from the row", (api.check() as Outcome.Ok).value.tasks.single { it.templateId == "t-thesis" }.timer)
    }

    /** Review: a stopped timer is no dead end. A start on it is its Resume, and the tick counts both segments. */
    @Test fun aStoppedTimerResumes() = runTest {
        var now = Instant.parse("2026-10-24T01:00:00Z")
        val api = DemoApi(clock = { now })
        val first = (api.startTimer("t-thesis", "s-1") as Outcome.Ok).value.timer!!
        now = now.plusSeconds(30 * 60)
        api.stopTimer(first.sessionId, "s-2")
        now = now.plusSeconds(60 * 60)
        val resumed = (api.startTimer("t-thesis", "s-3") as Outcome.Ok).value.timer!!
        assertTrue(resumed.running)
        assertEquals("the earlier segment rides on the resumed timer", 30, resumed.priorMinutes)
        assertEquals("2026-10-24", resumed.day)
        now = now.plusSeconds(20 * 60)
        val row = (api.check() as Outcome.Ok).value.tasks.single { it.templateId == "t-thesis" }
        assertEquals(50, ProofLine.timerMinutes(row.timer!!, now))
        val tick = (api.completeTask("t-thesis", mvv = false, clientId = "c-1", sessionId = resumed.sessionId) as Outcome.Ok).value
        assertTrue(tick.line!!, tick.line!!.endsWith(" · 50 min · streak ×1.16"))
    }

    /** Review: picked minutes count instead of an open timer's, and the timer is closed (nothing left running). */
    @Test fun pickedMinutesCloseTheTimer() = runTest {
        var now = Instant.parse("2026-10-24T01:00:00Z")
        val api = DemoApi(clock = { now })
        api.startTimer("t-thesis", "s-1")
        now = now.plusSeconds(12 * 60)
        val tick = (api.completeTask("t-thesis", mvv = false, clientId = "c-1", minutes = 90) as Outcome.Ok).value
        assertTrue("the sheet's 90 counts 90, not the timer's 12", tick.line!!.endsWith(" · 90 min · streak ×1.16"))
        assertNull((api.check() as Outcome.Ok).value.tasks.single { it.templateId == "t-thesis" }.timer)
    }

    /** P24: a reading task's full tick takes its pages, at least the day's 30; its minimum and every other row need none. */
    @Test fun aReadingTaskNeedsItsPages() = runTest {
        val api = DemoApi()
        val row = (api.check() as Outcome.Ok).value.tasks.single { it.templateId == "t-novel" }
        assertEquals(TaskPages(target = 30), row.pages)
        assertFalse("pages, not minutes", row.proof)
        assertNull("every other row carries no pages", (api.check() as Outcome.Ok).value.tasks.firstOrNull { it.templateId != "t-novel" && it.pages != null })
        val none = api.completeTask("t-novel", mvv = false, clientId = "c-1") as Outcome.Err
        assertEquals(409, none.status)
        assertTrue(none.message, none.message.startsWith("Log the pages"))
        val below = api.completeTask("t-novel", mvv = false, clientId = "c-2", pages = 20) as Outcome.Err
        assertEquals(409, below.status)
        assertTrue(below.message, below.message.contains("20 pages is below the day's 30"))
        assertEquals(400, (api.completeTask("t-novel", mvv = false, clientId = "c-3", pages = 2001) as Outcome.Err).status)
        assertTrue("the pages on any other task change nothing", api.completeTask("t-dentist", mvv = false, clientId = "c-4", pages = 12) is Outcome.Ok)
        val tick = (api.completeTask("t-novel", mvv = false, clientId = "c-5", pages = 45) as Outcome.Ok).value
        assertEquals("the pages are recorded, never priced", 5.2, tick.xp, 0.0)
        assertTrue(tick.line!!, tick.line!!.endsWith(" · 45 pages · streak ×1.16"))
    }

    /** P29: /check's streak carries the multiplier (a separate count from the daily streak); a full tick's line says its C. */
    @Test fun theStreakMultiplierRidesOnTheCheckAndTheTickLine() = runTest {
        val api = DemoApi()
        val streak = (api.check() as Outcome.Ok).value.streak!!
        assertEquals(12, streak.days)
        assertEquals(StreakMultiplier(1.16, 3, floor = false, line = "Streak ×1.16 · day 3"), streak.multiplier)
        val tick = (api.completeTask("t-dentist", mvv = false, clientId = "c-1") as Outcome.Ok).value
        assertTrue(tick.line!!, tick.line!!.endsWith(" · streak ×1.16"))
        val min = (api.completeTask("t-stretch", mvv = true, clientId = "c-2") as Outcome.Ok).value
        assertTrue(min.line!!, min.line!!.endsWith(" · minimum"))
        assertFalse("the minimum keeps C at 1.00", min.line!!.contains("streak"))
    }

    /** P24: the minimum version of a reading task still ticks in one tap. */
    @Test fun aReadingTasksMinimumNeedsNoPages() = runTest {
        val api = DemoApi()
        val min = (api.completeTask("t-novel", mvv = true, clientId = "c-1") as Outcome.Ok).value
        assertTrue(min.line!!, min.line!!.endsWith(" · minimum"))
        assertFalse(min.line!!, min.line!!.contains("pages"))
    }

    /**
     * P7: the Yesterday lane, as the server sends it: its rows tick with day "yesterday" (at T 1.00, the row's price, the
     * line ending "· yesterday"), apart from today's row of the same template; a repeat is recorded once, a row the lane
     * doesn't list is refused in the server's words, and an undo opens it again.
     */
    @Test fun aYesterdayRowTicksForYesterday() = runTest {
        val now = Instant.parse("2026-10-21T00:12:00Z")
        val api = DemoApi(clock = { now })
        val check = (api.check() as Outcome.Ok).value
        val lane = check.yesterday!!
        assertEquals(listOf("2026-10-20", "Tue 20 Oct"), listOf(lane.day, lane.dayLabel))
        assertEquals("Anything you tick pays at the full rate, record by 04:00 tomorrow.", lane.line)
        assertEquals(listOf("t-meds", "t-power"), lane.tasks.map { it.templateId })
        assertEquals(2, lane.open)
        assertTrue("today's Morning meds is done; yesterday's is open: one template, two rows", check.tasks.single { it.templateId == "t-meds" }.kept && lane.tasks[0].open)
        val tick = (api.completeTask("t-meds", mvv = false, clientId = "y-1", yesterday = true) as Outcome.Ok).value
        assertEquals("T 1.00: the row's own price", 3.6, tick.xp, 0.0)
        assertEquals("+3.6 XP · Care · yesterday", tick.line)
        assertNull(tick.knee)
        assertEquals("a resend answers the first", tick, (api.completeTask("t-meds", mvv = false, clientId = "y-1", yesterday = true) as Outcome.Ok).value)
        assertEquals("Already recorded. Nothing is paid twice.", (api.completeTask("t-meds", mvv = false, clientId = "y-2", yesterday = true) as Outcome.Ok).value.line)
        val after = (api.check() as Outcome.Ok).value
        assertEquals(listOf("t-power", "t-meds"), after.yesterday!!.tasks.map { it.templateId })
        assertEquals(1, after.yesterday!!.open)
        assertEquals("today's board is untouched", check.tasks, after.tasks)
        val refused = api.completeTask("t-gym", mvv = false, clientId = "y-3", yesterday = true) as Outcome.Err
        assertEquals(409, refused.status)
        assertEquals("Only what was due yesterday can be recorded for yesterday.", refused.message)
        assertEquals(-3.6, (api.undoTask(tick.instanceId, "y-4") as Outcome.Ok).value.xp, 0.0)
        assertEquals(2, (api.check() as Outcome.Ok).value.yesterday!!.open)
    }

    /** P7: after midnight the lane's line says "this morning" (the window still ends at 04:00). */
    @Test fun theYesterdayLineFollowsTheClock() = runTest {
        val api = DemoApi(clock = { Instant.parse("2026-10-21T15:30:00Z") })
        assertEquals("Anything you tick pays at the full rate, record by 04:00 this morning.", (api.check() as Outcome.Ok).value.yesterday!!.line)
    }

    /**
     * P7 (D26): a tick pays through the daily knee, and past 200 raw its answer carries the knee note in the server's
     * words; the demo's own day stays at the full rate, so no tick says it.
     */
    @Test fun aTickPastTwoHundredRawCarriesTheKnee() = runTest {
        val now = Instant.parse("2026-10-21T00:12:00Z")
        val plain = (DemoApi(clock = { now }).completeTask("t-gym", mvv = false, clientId = "k-0") as Outcome.Ok).value
        assertNull(plain.knee)
        assertEquals(8.3, plain.xp, 0.0)
        val api = DemoApi(clock = { now }, kneeToday = 195.0, kneeYesterday = 230.0)
        val gym = (api.completeTask("t-gym", mvv = false, clientId = "k-1") as Outcome.Ok).value
        assertEquals("kneePay(195, 8.3), one decimal", Math.round(com.xtnl.app.core.TickNote.kneePay(195.0, 8.3) * 10) / 10.0, gym.xp, 0.0)
        assertTrue(gym.xp < 8.3)
        assertEquals(TickKnee("2026-10-21", 203.3, 0.49, false, "Fatigue breaker: past 200 raw today, so a tick now pays ×0.49 or less. The day stops at 300 XP."), gym.knee)
        val y = (api.completeTask("t-power", mvv = false, clientId = "k-2", yesterday = true) as Outcome.Ok).value
        assertEquals("yesterday's knee is its own", "2026-10-20", y.knee!!.day)
        assertTrue(y.knee!!.line, y.knee!!.line.startsWith("Fatigue breaker: past 200 raw yesterday"))
    }

    /** P27: a demo sync answers as the server does: the backfill recorded, a newer walk paid, a resend a duplicate. */
    @Test fun aHealthSyncRecordsTheBackfillAndLandsEachWalkOnce() = runTest {
        val now = Instant.parse("2026-10-21T00:12:00Z")
        val api = DemoApi(clock = { now })
        val batch = HealthBatch(
            since = "2026-10-20T23:00:00Z",
            walks = listOf(
                HealthWalk("hc-old", "WALK", "2026-10-20T21:00:00Z", "2026-10-20T21:45:00Z", 4.1),
                HealthWalk("hc-new", "HIKE", "2026-10-20T23:05:00Z", "2026-10-20T23:50:00Z", 3.9, climbM = 160.0),
            ),
            weights = listOf(HealthWeight("hc-kg", "2026-10-20T21:05:00Z", 82.4)),
        )
        val first = (api.syncHealth(batch, "c-1") as Outcome.Ok).value
        assertEquals(HealthWalkCounts(added = 2, paid = 1, recorded = 1, xp = 18.0), first.walks)
        assertEquals(HealthWeightCounts(added = 1), first.weights)
        assertEquals("Health Connect: 2 walks in (1 paid 18 XP, 1 recorded) · 1 weigh-in", first.line)
        // The same clientId answers the first reply; a new one finds every record already here.
        assertEquals(first, (api.syncHealth(batch, "c-1") as Outcome.Ok).value)
        val again = (api.syncHealth(batch, "c-2") as Outcome.Ok).value
        assertEquals(HealthWalkCounts(duplicate = 2), again.walks)
        assertEquals("Health Connect: nothing new.", again.line)
    }

    /** D21: a demo sync records every other kind as the server does: a record, never paid, once per record. */
    @Test fun aHealthSyncRecordsWorkoutsOnceAndNeverPaysThem() = runTest {
        val now = Instant.parse("2026-10-21T00:12:00Z")
        val api = DemoApi(clock = { now })
        val batch = HealthBatch(
            since = "2026-10-20T20:00:00Z",
            walks = listOf(
                HealthWalk("hc-run", "RUN", "2026-10-20T21:00:00Z", "2026-10-20T21:28:40Z", 5.2, variant = "TREADMILL"),
                HealthWalk("hc-lift", "LIFT", "2026-10-20T22:00:00Z", "2026-10-20T22:45:00Z"),
                HealthWalk("hc-row", "ROW", "2026-10-20T23:00:00Z", "2026-10-20T23:20:00Z"),
            ),
        )
        val first = (api.syncHealth(batch, "c-1") as Outcome.Ok).value
        assertEquals(HealthSessionCounts(added = 2), first.sessions)
        assertEquals(HealthWalkCounts(), first.walks)
        assertEquals(listOf(HealthRefusal("session", "hc-row", "A distance in metres, please.")), first.refused)
        assertEquals("Health Connect: 2 workouts recorded · 1 skipped", first.line)
        // A refused workout is never kept (the server writes nothing for it), so the resend refuses it again.
        val again = (api.syncHealth(batch, "c-2") as Outcome.Ok).value
        assertEquals(HealthSessionCounts(duplicate = 2), again.sessions)
        assertEquals(listOf(HealthRefusal("session", "hc-row", "A distance in metres, please.")), again.refused)
        assertEquals("Health Connect: 1 skipped", again.line)
    }

    /** D21: the demo refuses a workout with no distance in the core's words for its kind, and a walk the same way. */
    @Test fun aHealthSyncRefusesInTheServersWordsAndARefusalIsNeverKept() = runTest {
        val now = Instant.parse("2026-10-21T00:12:00Z")
        val api = DemoApi(clock = { now })
        val batch = HealthBatch(
            since = "2026-10-20T20:00:00Z",
            walks = listOf(
                HealthWalk("hc-run", "RUN", "2026-10-20T21:00:00Z", "2026-10-20T21:30:00Z"),
                HealthWalk("hc-ride", "CYCLE", "2026-10-20T21:40:00Z", "2026-10-20T22:10:00Z"),
                HealthWalk("hc-swim", "SWIM", "2026-10-20T22:20:00Z", "2026-10-20T22:50:00Z"),
                HealthWalk("hc-walk", "WALK", "2026-10-20T23:10:00Z", "2026-10-20T23:40:00Z"),
            ),
        )
        val first = (api.syncHealth(batch, "c-1") as Outcome.Ok).value
        assertEquals(
            listOf(
                HealthRefusal("session", "hc-run", "A distance, please."),
                HealthRefusal("session", "hc-ride", "A distance or the average watts, please."),
                HealthRefusal("session", "hc-swim", "A distance in metres, please."),
                HealthRefusal("walk", "hc-walk", "A distance between 0.01 and 200 km, please."),
            ),
            first.refused,
        )
        val again = (api.syncHealth(batch, "c-2") as Outcome.Ok).value
        assertEquals(first.refused, again.refused)
        assertEquals(HealthSessionCounts(), again.sessions)
        assertEquals(HealthWalkCounts(), again.walks)
        assertEquals("Health Connect: 4 skipped", again.line)
    }
}

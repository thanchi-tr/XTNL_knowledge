package com.xtnl.app.core

import com.xtnl.app.data.HttpApi
import com.xtnl.app.data.MainQuest
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.QuestMilestone
import com.xtnl.app.data.QuestStudy
import com.xtnl.app.data.QuestsData
import com.xtnl.app.data.Sprint
import com.xtnl.app.data.SprintRow
import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.ThreeQuest
import com.xtnl.app.data.TodaysThree
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Quest card (P15; D11, D12): the web's Main quest words, no Start while the switch is off, the sprint's Sunday words. */
class QuestLineTest {
    private val active = MainQuest(
        state = "ACTIVE", title = "Trade for a living", line = "42% of the way · due Sun 8 Nov",
        milestone = QuestMilestone(2, 6, "Familiar with the basics", "STARTED", 42, "2026-11-08"),
    )
    private val sprint = Sprint(
        milestoneOrd = 2, weekStart = "2026-10-19", weekEnd = "2026-10-25", done = 1, total = 3,
        rows = listOf(SprintRow("PRACTICE", "Read 20 pages · 3 sessions × 25 min", "1 of 3 sessions", 3, 1.0, "session", false, "t-read")),
    )

    /** Ruling N28: a planned layer's study is said in the web's words, after the line, and never as a Start; none without it. */
    @Test fun thePlannedLayersStudyInTheWebsWords() {
        val study = QuestStudy(name = "Markov chains", domainId = "d1", cards = 3, floor = 8, due = 4, layer = 1, line = "Study Markov chains · 3 of 8 · 4 due", webHref = "/review?view=run&domain=d1")
        val planned = MainQuest(
            state = "PLANNED", title = "Trade for a living", line = "Milestone 1 is planned.",
            milestone = QuestMilestone(1, 4, "Bayes rule, Markov chains · layer 1 of 4", "PLANNED", null, null), study = study,
        )
        assertEquals("Study Markov chains · 3 of 8 · 4 due", QuestLine.studyLine(planned))
        assertNull(QuestLine.studyNote(planned))
        assertNull(QuestLine.startLine(planned))
        assertNull(QuestLine.studyLine(active))
        assertEquals(
            "Main quest, Trade for a living, Milestone 1 of 4 · Bayes rule, Markov chains · layer 1 of 4, Milestone 1 is planned., Study Markov chains · 3 of 8 · 4 due",
            QuestLine.description(QuestsData(mainQuest = planned, sprint = null, three = null)),
        )
        val json = """{"ok":true,"data":{"now":"2026-10-25T00:12:00.000Z","day":"2026-10-25","sprint":null,"three":null,
            "mainQuest":{"state":"PLANNED","title":"T","line":"Milestone 1 is planned.","milestone":null,"startOnWeb":false,"suggest":true,
              "study":{"name":"Markov chains","domainId":"d1","cards":3,"floor":8,"due":0,"layer":1,"geminiNamed":true,"line":"Add an idea to Markov chains","webHref":"/add?domain=d1"}}}}"""
        val r = HttpApi.parse(200, json, QuestsData.serializer())
        assertTrue(r is Outcome.Ok)
        val parsed = (r as Outcome.Ok).value.mainQuest!!
        assertEquals("Add an idea to Markov chains", QuestLine.studyLine(parsed))
        assertTrue(parsed.study!!.geminiNamed)
        // The web's mark on a Gemini-named Domain, said under the line (the review round); never without the study.
        assertEquals("named by Gemini", QuestLine.studyNote(parsed))
        assertEquals("Main quest, T, Milestone 1 is planned., Add an idea to Markov chains, named by Gemini", QuestLine.description(QuestsData(mainQuest = parsed, sprint = null, three = null)))
        assertNull(QuestLine.studyNote(parsed.copy(study = null)))
    }

    @Test fun theMainQuestInTheWebsWords() {
        assertEquals("Trade for a living", QuestLine.headline(active))
        assertEquals("Milestone 2 of 6 · Familiar with the basics", QuestLine.milestone(active))
        assertEquals("42% of the way · due Sun 8 Nov", QuestLine.line(active))
        val q = QuestsData(mainQuest = active, sprint = sprint, three = null)
        assertTrue(QuestLine.shows(q))
        assertEquals(
            "Main quest, Trade for a living, Milestone 2 of 6 · Familiar with the basics, 42% of the way · due Sun 8 Nov, This week's sprint · 1 of 3 done",
            QuestLine.description(q),
        )
    }

    /** ROADMAP_GOALS_LIVE off: a planned milestone says so and nothing offers Start; on, the card says Start is on the web. */
    @Test fun noStartWhileTheSwitchIsOff() {
        val planned = active.copy(state = "PLANNED", line = "Milestone 1 is planned.", milestone = QuestMilestone(1, 6, "Foundations", "PLANNED"), startOnWeb = false)
        assertNull(QuestLine.startLine(planned))
        assertFalse(QuestLine.description(QuestsData(mainQuest = planned)).contains("Start"))
        assertEquals("Start milestone 1 on the web", QuestLine.startLine(planned.copy(startOnWeb = true, line = "Milestone 1 is ready to start.")))
    }

    /** D12: mid-week a count; on its Sunday the server's provisional words; a held week asks nothing; all done says so. */
    @Test fun theSprintIsACountNeverAVerdict() {
        assertEquals("This week's sprint · 1 of 3 done", QuestLine.sprintLine(sprint))
        assertEquals("This week's sprint · 1 of 3 done · provisional · final Wed 04:00", QuestLine.sprintLine(sprint.copy(status = "provisional", line = "provisional · final Wed 04:00")))
        assertEquals("This week's sprint · all 3 done", QuestLine.sprintLine(sprint.copy(done = 3)))
        assertEquals("This week's sprint · held this week", QuestLine.sprintLine(sprint.copy(state = "HELD")))
        assertTrue(QuestLine.rows(sprint.copy(state = "HELD")).isEmpty())
        assertEquals(1, QuestLine.rows(sprint).size)
    }

    /**
     * D12, a count never a verdict: a sprint row reads done only when the server says its week's count is met. Today's
     * session ticked (its task kept on Check) is said, never "· done", and its tick goes; a Today's three quest is done
     * when its task is.
     */
    @Test fun aSprintRowIsDoneOnlyWhenTheServerSaysSo() {
        val row = sprint.rows.single()
        val open = TaskItem(templateId = "t-read", title = "Read 20 pages", status = "OPEN")
        val ticked = open.copy(status = "DONE")
        assertEquals(QuestLine.Row(row.label, "1 of 3 sessions", false), QuestLine.sprintRow(row, open))
        val today = QuestLine.sprintRow(row, ticked)
        assertFalse(today.done)
        assertEquals("1 of 3 sessions · ticked today", today.detail)
        assertFalse(today.detail.endsWith("done"))
        assertEquals("2 of 3 sessions · ticked today", QuestLine.sprintRow(row.copy(countLine = "2 of 3 sessions", progress = 2.0), ticked.copy(status = "DONE_MVV")).detail)
        val met = row.copy(countLine = "3 of 3 sessions · done", progress = 3.0, done = true)
        assertEquals(QuestLine.Row(row.label, "3 of 3 sessions · done", true), QuestLine.sprintRow(met, ticked))
        assertEquals(QuestLine.Row(row.label, "1 of 3 sessions", false), QuestLine.sprintRow(row, null))
        val gym = ThreeQuest("BODY", "Gym legs", false, "t-gym")
        assertEquals(QuestLine.Row("Gym legs", "Body", false), QuestLine.threeRow(gym, TaskItem(templateId = "t-gym", title = "Gym legs", status = "OPEN")))
        assertEquals(QuestLine.Row("Gym legs", "Body · done", true), QuestLine.threeRow(gym, TaskItem(templateId = "t-gym", title = "Gym legs", status = "DONE")))
        assertEquals(QuestLine.Row("Review 12 cards", "Plan · done", true), QuestLine.threeRow(ThreeQuest("PLAN", "Review 12 cards", true), null))
    }

    /** A milestone past its day: no sprint part (the web's card shows none), and the web's words if one is asked for. */
    @Test fun aPastDueSprintShowsNoLine() {
        val pastDue = sprint.copy(state = "PAST_DUE", done = 0, total = 0, rows = emptyList())
        assertFalse(QuestLine.showsSprint(pastDue))
        assertTrue(QuestLine.showsSprint(sprint))
        assertTrue(QuestLine.showsSprint(sprint.copy(state = "HELD")))
        assertEquals("This week's sprint · none while the milestone is past its day", QuestLine.sprintLine(pastDue))
        assertFalse(QuestLine.sprintLine(pastDue).contains("nothing asked"))
        val due = active.copy(state = "PAST_DUE", line = "Milestone 2 was due Sun 18 Oct: close or reschedule it.")
        assertEquals("Main quest, Trade for a living, Milestone 2 of 6 · Familiar with the basics, Milestone 2 was due Sun 18 Oct: close or reschedule it.", QuestLine.description(QuestsData(mainQuest = due, sprint = pastDue)))
    }

    /** §22.11: a Gemini title carries Gemini's words and its numbers struck, as on the web; a bad or stale span never cuts a word. */
    @Test fun aGeminiTitleKeepsItsProvenance() {
        val gemini = active.copy(milestone = QuestMilestone(2, 6, "Backtest 20 setups", "STARTED", 42, null, titleNote = "Gemini suggestion · not checked", titleStruck = listOf(listOf(9, 11))))
        val line = QuestLine.milestone(gemini)!!
        assertEquals("Milestone 2 of 6 · Backtest 20 setups", line)
        assertEquals(listOf("20"), QuestLine.struck(gemini).map { line.substring(it) })
        assertEquals("Gemini suggestion · not checked", QuestLine.titleNote(gemini))
        assertTrue(QuestLine.description(QuestsData(mainQuest = gemini)).contains("Backtest 20 setups, Gemini suggestion · not checked"))
        assertNull(QuestLine.titleNote(active))
        assertTrue(QuestLine.struck(active).isEmpty())
        val padded = gemini.copy(milestone = gemini.milestone!!.copy(title = "  Backtest 20 setups", titleStruck = listOf(listOf(11, 13))))
        assertEquals(listOf("20"), QuestLine.struck(padded).map { QuestLine.milestone(padded)!!.substring(it) })
        val stale = gemini.copy(milestone = gemini.milestone!!.copy(titleStruck = listOf(listOf(9, 11), listOf(10, 12), listOf(15, 99), listOf(3), listOf(-1, 2))))
        assertEquals(listOf("20"), QuestLine.struck(stale).map { line.substring(it) })
    }

    /** After a tick the card is read again when the tick can move its figures, and only then. */
    @Test fun aTickThatMovesTheCardRereadsIt() {
        val three = TodaysThree(done = 0, total = 3, quests = listOf(ThreeQuest("PLAN", "Review 12 cards"), ThreeQuest("BODY", "Gym legs", false, "t-gym"), ThreeQuest("TASK", "Call the dentist", false, "t-dentist")))
        val q = QuestsData(mainQuest = active, sprint = sprint, three = three)
        assertTrue(QuestLine.touches(q, "t-read"))
        assertTrue(QuestLine.touches(q, "t-gym"))
        assertFalse(QuestLine.touches(q, "t-water"))
        assertFalse(QuestLine.touches(null, "t-read"))
        val any = q.copy(three = three.copy(quests = three.quests.dropLast(1) + ThreeQuest("TASK", "Finish any 2 tasks")))
        assertTrue(QuestLine.touches(any, "t-water"))
        assertFalse(QuestLine.touches(any.copy(three = any.three!!.copy(quests = any.three!!.quests.dropLast(1) + ThreeQuest("TASK", "Finish any 2 tasks", true))), "t-water"))
    }

    @Test fun noMainQuestAndTodaysThree() {
        val none = MainQuest(state = "NONE", line = "No main quest yet.")
        assertTrue(QuestLine.showsQuest(none))
        assertEquals("No main quest yet.", QuestLine.headline(none))
        assertNull(QuestLine.line(none))
        assertFalse(QuestLine.showsQuest(none.copy(suggest = false)))
        assertFalse(QuestLine.shows(QuestsData(mainQuest = none.copy(suggest = false))))
        assertFalse(QuestLine.shows(null))
        val three = TodaysThree(done = 1, total = 3, quests = listOf(ThreeQuest("PLAN", "Review 12 cards", true), ThreeQuest("BODY", "Gym legs", false, "t-gym"), ThreeQuest("TASK", "Call the dentist")))
        assertTrue(QuestLine.shows(QuestsData(mainQuest = none.copy(suggest = false), three = three)))
        assertEquals("Today's three · 1 of 3", QuestLine.threeLine(three))
        assertEquals(listOf("Plan", "Body", "Task"), three.quests.map { QuestLine.slotWord(it) })
    }

    /** The server's JSON decodes into the models (the doc's shape, a field the server adds later ignored). */
    @Test fun decodesTheDocsShape() {
        val json = """{"ok":true,"data":{"now":"2026-10-25T00:12:00.000Z","day":"2026-10-25",
            "mainQuest":{"state":"PLANNED","title":"Trade for a living","line":"Milestone 1 is planned.","milestone":{"ord":1,"of":6,"title":"Read 3 books","titleNote":"Gemini suggestion · not checked","titleStruck":[[5,6]],"status":"PLANNED","percent":null,"dueDay":null},"startOnWeb":false,"suggest":true},
            "sprint":null,
            "three":{"done":1,"total":3,"frozen":true,"chest":"locked","quests":[{"slot":"BODY","title":"Gym","done":false,"templateId":"hab1","later":1}]}}}"""
        val r = HttpApi.parse(200, json, QuestsData.serializer())
        assertTrue(r is Outcome.Ok)
        val q = (r as Outcome.Ok).value
        assertEquals("PLANNED", q.mainQuest?.state)
        assertFalse(q.mainQuest!!.startOnWeb)
        assertEquals("Gemini suggestion · not checked", q.mainQuest!!.milestone?.titleNote)
        assertEquals(listOf("3"), QuestLine.struck(q.mainQuest!!).map { QuestLine.milestone(q.mainQuest!!)!!.substring(it) })
        assertNull(q.sprint)
        assertEquals("hab1", q.three?.quests?.single()?.templateId)
    }
}

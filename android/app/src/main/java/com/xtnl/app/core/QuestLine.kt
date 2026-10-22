package com.xtnl.app.core

import com.xtnl.app.data.MainQuest
import com.xtnl.app.data.QuestsData
import com.xtnl.app.data.Sprint
import com.xtnl.app.data.SprintRow
import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.ThreeQuest
import com.xtnl.app.data.TodaysThree

/**
 * The Check screen's Quest card (docs/mobile-api.md `GET /quests`; blueprint 2.1 and 2.2, decisions D11, D12): the web's
 * Main quest card in the same words. One vocabulary: the roadmap goal is the main quest, its stages milestones, its week
 * quests this week's sprint; Today's three stay momentum's. Read only: a practice row or a task quest is ticked like any
 * task (its row on Check), and Start and every plan edit stay on the web ([startLine] only says so, and only while the
 * server offers Start there). The sprint's Sunday words are the server's ("provisional · final Wed 04:00"): a count,
 * never a verdict, so a sprint row reads done only when the server says its week's count is met ([sprintRow]). A
 * milestone title Gemini wrote carries Gemini's words ([titleNote]) and its numbers struck ([struck]), as on the web.
 */
object QuestLine {
    const val TITLE = "Main quest"
    const val SPRINT = "This week's sprint"
    const val THREE = "Today's three"
    /** A sprint row whose task is ticked today, before the week's count is met: said, never shown as done. */
    const val TICKED_TODAY = "ticked today"

    /** One row of the card in words: its label, its detail, and whether it reads done (the kept mark, the dimmed label). */
    data class Row(val label: String, val detail: String, val done: Boolean)

    /** Whether the card shows: a main quest, or a quiet empty one while the aim suggestions are on, or Today's three. */
    fun shows(q: QuestsData?): Boolean {
        if (q == null) return false
        val m = q.mainQuest
        return (m != null && (m.state != "NONE" || m.suggest)) || (q.three?.quests?.isNotEmpty() == true)
    }

    /** Whether the main quest part shows (none at all once the suggestions are off). */
    fun showsQuest(m: MainQuest?): Boolean = m != null && (m.state != "NONE" || m.suggest)

    /** The quest's words, or "No main quest yet." */
    fun headline(m: MainQuest): String = m.title?.takeIf { it.isNotBlank() } ?: m.line.ifBlank { "No main quest yet." }

    /** "Milestone 2 of 6 · Familiar with the basics"; null with no milestone. */
    fun milestone(m: MainQuest): String? = m.milestone?.let { ms ->
        val title = ms.title.trim()
        "Milestone ${ms.ord} of ${ms.of}" + if (title.isNotEmpty()) " · $title" else ""
    }

    /**
     * The title's struck number spans as ranges of [milestone]'s line (the server's `[start, end)` spans of the title,
     * moved past "Milestone n of m · "); a span outside the title or overlapping an earlier one is dropped, as the web's
     * StruckLabel drops it, so a stale span never cuts a word.
     */
    fun struck(m: MainQuest): List<IntRange> {
        val ms = m.milestone ?: return emptyList()
        val title = ms.title.trim()
        if (title.isEmpty()) return emptyList()
        val lead = ms.title.length - ms.title.trimStart().length
        val at = "Milestone ${ms.ord} of ${ms.of} · ".length
        var end = 0
        val out = mutableListOf<IntRange>()
        for (span in ms.titleStruck.filter { it.size == 2 }.sortedBy { it[0] }) {
            val a = span[0] - lead
            val b = span[1] - lead
            if (a < 0 || b <= a || b > title.length || a < end) continue
            out += (at + a) until (at + b)
            end = b
        }
        return out
    }

    /** Gemini's words for a title Gemini wrote ("Gemini suggestion · not checked"), shown beside it; null for the user's or the app's. */
    fun titleNote(m: MainQuest): String? = m.milestone?.titleNote?.takeIf { it.isNotBlank() }

    /** The quest's one line under its words (none on the empty card, where it is the headline). */
    fun line(m: MainQuest): String? = if (m.title.isNullOrBlank()) null else m.line.ifBlank { null }

    /** Start lives on the web: said only when the server offers it there (never while ROADMAP_GOALS_LIVE is off). */
    fun startLine(m: MainQuest): String? = if (m.startOnWeb && m.milestone != null) "Start milestone ${m.milestone.ord} on the web" else null

    /** Whether the sprint part shows: not while its milestone is past its day (the quest's line asks to close or reschedule it), as the web card. */
    fun showsSprint(s: Sprint): Boolean = s.state != "PAST_DUE"

    /** "This week's sprint · 2 of 5 done", "… · all 5 done", with the server's Sunday words ("· provisional · final Wed 04:00"). */
    fun sprintLine(s: Sprint): String {
        if (s.state == "HELD") return "$SPRINT · held this week"
        if (s.state == "PAST_DUE") return "$SPRINT · none while the milestone is past its day"
        val count = when {
            s.total <= 0 -> "nothing asked"
            s.done >= s.total -> "all ${s.total} done"
            else -> "${s.done} of ${s.total} done"
        }
        return listOfNotNull(SPRINT, count, s.line?.takeIf { it.isNotBlank() }).joinToString(" · ")
    }

    /** The rows the card lists (an open week's; a held or past-due week lists none). */
    fun rows(s: Sprint): List<SprintRow> = if (s.state == "OPEN") s.rows else emptyList()

    /**
     * A sprint row: done only when the server says its week's count is met ([SprintRow.done]; D12, a count, never a
     * verdict). A session or step ticked today ([task] kept on Check) is said, never counted as the row done:
     * "1 of 3 sessions · ticked today" until the next read brings "2 of 3 sessions · ticked today".
     */
    fun sprintRow(r: SprintRow, task: TaskItem?): Row {
        val ticked = task?.kept == true && !r.done
        return Row(r.label, if (ticked) "${r.countLine} · $TICKED_TODAY" else r.countLine, r.done)
    }

    /** A Today's three quest: done when the server says so or when its task is kept on Check (a task quest is done when its task is). */
    fun threeRow(q: ThreeQuest, task: TaskItem?): Row {
        val done = q.done || task?.kept == true
        return Row(q.title, if (done) "${slotWord(q)} · done" else slotWord(q), done)
    }

    /** "Today's three · 1 of 3". */
    fun threeLine(t: TodaysThree): String = "$THREE · ${t.done} of ${t.total}"

    /** The slot's word, as the web's pips say it. */
    fun slotWord(q: ThreeQuest): String = when (q.slot) {
        "PLAN" -> "Plan"
        "BODY" -> "Body"
        "TASK" -> "Task"
        else -> q.slot.lowercase().replaceFirstChar { it.uppercase() }
    }

    /**
     * Whether a tick of [templateId] can move the card's figures, so the card is read again after it: a sprint row's or
     * a Today's three quest's task, or any task while Today's three holds an open Task or Body quest with no template of
     * its own (any n tasks, or minutes moved: any tick may count toward it).
     */
    fun touches(q: QuestsData?, templateId: String): Boolean {
        if (q == null) return false
        if (q.sprint?.rows?.any { it.templateId == templateId } == true) return true
        val three = q.three?.quests.orEmpty()
        return three.any { it.templateId == templateId } || three.any { it.templateId == null && !it.done && (it.slot == "TASK" || it.slot == "BODY") }
    }

    /** The card in words, for TalkBack. */
    fun description(q: QuestsData): String {
        val parts = mutableListOf<String>()
        q.mainQuest?.takeIf { showsQuest(it) }?.let { m ->
            parts += TITLE
            parts += headline(m)
            milestone(m)?.let { parts += it }
            titleNote(m)?.let { parts += it }
            line(m)?.let { parts += it }
            startLine(m)?.let { parts += it }
        }
        q.sprint?.takeIf { showsSprint(it) }?.let { parts += sprintLine(it) }
        q.three?.takeIf { it.quests.isNotEmpty() }?.let { t -> parts += threeLine(t) }
        return parts.joinToString(", ")
    }
}

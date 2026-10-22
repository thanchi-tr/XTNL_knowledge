package com.xtnl.app.core

import com.xtnl.app.data.DailyQuests
import com.xtnl.app.data.TaskItem

/**
 * The Check screen's daily quests (docs/mobile-api.md `daily`; decisions D14, D15): the user's musts, at most 5 a
 * day, as the web's Must lane counts them, with a 1/0 cell per quest. Binary is a status only (XP stays graded): the
 * minimum version keeps a quest (it counts 1) and is counted "at minimum".
 *
 * Live: a quest still on today's list reads its row's status, so a tick (or its undo) here flips its cell at once,
 * before the next /check; a quest the list doesn't show (a must deferred or aborted on the web) keeps the server's.
 */
object DailyStrip {
    const val TITLE = "Daily quests"

    /** The server's daily quests with each listed quest's cell read from its row (null from an older server). */
    fun live(daily: DailyQuests?, tasks: List<TaskItem>): DailyQuests? {
        if (daily == null) return null
        val byId = tasks.associateBy { it.templateId }
        val quests = daily.quests.map { q ->
            val t = byId[q.templateId] ?: return@map q
            q.copy(kept = t.kept, minimum = t.status == "DONE_MVV")
        }
        val kept = quests.count { it.kept }
        return daily.copy(quests = quests, kept = kept, minimum = quests.count { it.minimum }, full = quests.isNotEmpty() && kept == quests.size)
    }

    /** The Must lane's header on the phone: "Daily quests 3 of 4". */
    fun header(d: DailyQuests): String = "$TITLE ${d.kept} of ${d.total}"

    /** What sits beside it: "1 at minimum" (each still kept), "1 over the cap" (the day keeps its musts). */
    fun notes(d: DailyQuests): List<String> = buildList {
        if (d.minimum > 0) add("${d.minimum} at minimum")
        if (d.over > 0) add("${d.over} over the cap")
    }

    /** The strip in words, for TalkBack: "Daily quests, 3 of 4 kept, 1 at minimum". */
    fun description(d: DailyQuests): String = (listOf("$TITLE, ${d.kept} of ${d.total} kept") + notes(d)).joinToString(", ")
}

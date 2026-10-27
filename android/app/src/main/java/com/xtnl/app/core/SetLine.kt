package com.xtnl.app.core

import com.xtnl.app.data.LiftNext
import com.xtnl.app.data.LiftSetBody
import com.xtnl.app.data.OpenLift
import com.xtnl.app.data.QueueState

/**
 * The open lift on the phone (docs/mobile-api.md /check's `lift` and POST /lift/set; health-2026-10-27.md D12, D14 to
 * D19, phase 2). Pure: ui/check/LiftCard draws it, CheckViewModel sends the ✓ and data/SendQueue keeps one that got no
 * answer (SET, its own clientId and its own `doneAt`).
 *
 *  - The card is "Lift · Push day", then "Next: Bench press 60 kg × 8" with its ✓: the server's next set, by the web
 *    logger's own prefill, in its own words ([nextLine], [detail]). One tap sends it as it is ([bodyOf]): its kind and
 *    figures in kilograms, never `ord` (the server takes the movement's next place) and never an outcome the phone
 *    didn't ask (RIR, Failure).
 *  - A next with nothing to copy (no last lift for that movement) has no ✓ here: its figures are asked on the web.
 *    Every row done: "+ Set" and Finish stay on the web too.
 *  - After a set, the rest the server gives ([restText]). A big jump is saved as a record; its question (Keep, Confirm,
 *    Fix) is the web's, so the card says so and links there.
 *  - A set is a record (D12): no XP, no moment. Nothing about a lift is a mood value.
 */
object SetLine {
    /** Where Keep, Fix, "+ Set" and Finish live (Train › Exercise, Lift mode). */
    const val WEB_HREF = "/train/exercise"

    const val OPEN_WEB = "Open on the web"
    const val ALL_DONE = "Every row is done"
    const val ALL_DONE_NOTE = "Another set, and Finish with its Counts as, are on the web."
    const val NOTHING_TO_COPY = "No last lift to copy for this one, so its figures go in on the web."
    const val WAITING = "Waiting to send. The next set shows once it lands."
    const val REST_DONE = "Rest done"

    /** The card's eyebrow: "Lift · Push day" ("Lift" with no name). */
    fun title(lift: OpenLift): String = listOfNotNull("Lift", lift.label?.trim()?.takeIf { it.isNotEmpty() }).joinToString(" · ")

    /** A set kind in the logger's words; a working set says nothing. */
    fun kindWord(kind: String): String? = when (kind) {
        "WARMUP" -> "Warm-up"
        "DROP" -> "Drop"
        "MINI" -> "Rest-pause"
        else -> null
    }

    /** One tap can send it: the last lift's set, with its figures. */
    fun canTick(n: LiftNext?): Boolean =
        n != null && n.fromLast && !n.setText.isNullOrBlank() && (n.reps != null || n.durationSec != null || n.distanceM != null || n.weightKg != null)

    /** "Next: Bench press 60 kg × 8"; "Next: Bench press" with nothing to copy; null when every row is done. */
    fun nextLine(n: LiftNext?): String? {
        n ?: return null
        val text = n.setText?.takeIf { n.fromLast && it.isNotBlank() }
        return "Next: " + n.name.ifBlank { "the next set" } + (text?.let { " $it" } ?: "")
    }

    /** The line under it: "Set 3 · last 60 × 8", "Set 1 · Warm-up · last 40 × 10", "Set 4 · Drop". */
    fun detail(n: LiftNext): String =
        listOfNotNull("Set ${n.ord}", kindWord(n.kind), "AMRAP".takeIf { n.amrap }, n.ghostLine?.takeIf { n.fromLast && it.isNotBlank() }).joinToString(" · ")

    /** TalkBack's words for the ✓: "Done: Bench press 60 kg × 8". */
    fun doneLabel(n: LiftNext): String = "Done: " + label(n)

    /** What the queue and the Not sent card call it: "Bench press 60 kg × 8". */
    fun label(n: LiftNext): String = listOfNotNull(n.name.ifBlank { "Set" }, n.setText?.takeIf { it.isNotBlank() }).joinToString(" ")

    /**
     * The ✓'s request: the lift, the movement, the tap's instant [doneAt] and the next set's own kind and figures, as the
     * web row's ✓ sends them. Null when one tap can't send it ([canTick]).
     */
    fun bodyOf(lift: OpenLift, n: LiftNext, doneAt: String): LiftSetBody? {
        if (!canTick(n)) return null
        return LiftSetBody(
            sessionId = lift.sessionId,
            entryId = n.entryId,
            doneAt = doneAt,
            kind = n.kind.takeIf { it.isNotBlank() },
            weightKg = n.weightKg,
            reps = n.reps,
            durationSec = n.durationSec,
            distanceM = n.distanceM,
            amrap = n.amrap,
        )
    }

    /**
     * When the rest after a set ends (wall clock): [restSec] from [restFromMs], the ✓'s tap (the web's LiftLogger counts
     * the rest from the tap, not the answer); none for a rest of 0 (before a drop). [restFromMs] null (a set the queue
     * landed a while ago): the rest shown stays as it was ([current]).
     */
    fun restEndsAt(restFromMs: Long?, restSec: Int, current: Long?): Long? = when {
        restFromMs == null -> current
        restSec > 0 -> restFromMs + restSec * 1000L
        else -> null
    }

    /** The rest left at [nowMs] of one that ends at [endsAtMs] (wall clock); 0 with none or once it is over. */
    fun restLeftMs(endsAtMs: Long?, nowMs: Long): Long = endsAtMs?.let { (it - nowMs).coerceAtLeast(0L) } ?: 0L

    /** "Rest 2:45" (rounded up to the second, so it never says 0:00 while time is left); "Rest done" once it is over. */
    fun restText(leftMs: Long): String {
        if (leftMs <= 0L) return REST_DONE
        val s = (leftMs + 999) / 1000
        return "Rest ${s / 60}:${(s % 60).toString().padStart(2, '0')}"
    }

    /** The sets of [lift] waiting on the phone to send. */
    fun waiting(lift: OpenLift?, queue: QueueState): Int =
        if (lift == null) 0 else queue.items.count { it.kind == SendLine.Kind.SET && it.liftId == lift.sessionId }

    /** A set that got no answer, waiting on the phone (its first try may have landed: it is sent again with the same clientId). */
    fun queued(label: String): String = "No answer: $label will send when you're online. It keeps the time you did it. If it got through, it's saved once."

    /** Undo on a set waiting on the phone: taken off the queue, but its first try may have landed, so it never says it hadn't left. */
    const val TAKEN_BACK = "Taken off the phone. If the first try got through, the set is already logged."

    /** One the queue landed: the server's line ("Bench press: logged 60 kg × 8."), else what it was. */
    fun sent(label: String, line: String?): String = "Sent: " + (line?.takeIf { it.isNotBlank() } ?: label)
}

package com.xtnl.app.core

import com.xtnl.app.data.Outcome
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The offline queue's rules and words (blueprint 5.1b, P8; decision D34). Pure: data/SendQueue keeps what waits and
 * sends it; this says what may wait, which day each item is for, what an answer means, and what the lines read.
 *
 *  - Only five writes ever wait on the phone: a tick (POST /tasks/complete), a quick line (POST /log), a work item's
 *    Done (POST /work/done), a check-in (POST /checkin) and a set of the open lift (POST /lift/set; health phase 2).
 *    Review answers never do ([Kind.ofPath] knows no other route): an answer is graded against the card as it is now,
 *    and the runner moves on only once it is recorded. A check-in and a set are records keyed by their own clientId,
 *    never graded, so they are safe to wait.
 *  - Each item carries its own life day, fixed at the tap, never "today". A tick's is the day of the board its row was
 *    shown on ([tickDayOf]: the web board's own rule, so a board read before 04:00 books its rows on its own day, and
 *    one too old for the server is refused, never booked a day off); a line's and a Done's are the server's clock as
 *    last read ([dayKey]), read before the send, never after its failure. A tick sends its day as its `day` from its
 *    first try, so a tick made before 04:00 books on that day whenever it lands (the server books today or yesterday
 *    by its own clock, and refuses an older day). POST /log saves on the server's today and has no day, so a line goes
 *    only while its day is still the server's (read from /check just before): one from an earlier day is kept back
 *    for the user ("Send for today"). A Done marks the work item itself, never a day's row, so it goes whatever the
 *    day; its key only dates it. A check-in carries its own instant `at` and a set its own `doneAt`, each fixed at the
 *    tap (the server's clock as last read), so one sent late is booked when it was made; its day is that instant's. A
 *    check-in more than a week old is never sent (the server keeps one up to 7 life days back).
 *  - A replay sends the same clientId and the same body as the first try, so the server writes it once (its 10-minute
 *    replay cache, then the cores' own guards: a tick once per day, a line once per capture key, Done idempotent, a
 *    check-in and a set once per clientId).
 */
object SendLine {
    /** The writes that may wait, by the route each replays. */
    enum class Kind(val path: String) {
        TICK("/tasks/complete"),
        LOG("/log"),
        WORK_DONE("/work/done"),
        CHECKIN("/checkin"),
        SET("/lift/set");

        companion object {
            /** The kind that replays [path], or null: every other route (a review answer above all) never waits. */
            fun ofPath(path: String): Kind? = entries.firstOrNull { it.path == path }
        }
    }

    /** At most this many wait at once (a full queue sends the write's own failure back, with its Retry). */
    const val MAX_WAITING = 200

    /** Not-sent notes kept (the newest). */
    const val MAX_NOT_SENT = 20

    /** A server fault (5xx) is tried again this many times before the item is set aside; no answer at all, always. */
    const val SERVER_TRIES = 8

    /** The job's first wait after a pass that couldn't land (WorkManager doubles it each time). */
    const val BACKOFF_SECONDS = 30L

    /** How far the server's clock was from the phone's when it last answered (its `now` less the moment it arrived). */
    fun offsetOf(serverNow: String?, fetchedAtMs: Long?): Long? {
        val at = TimeLabels.parseInstant(serverNow) ?: return null
        return at.toEpochMilli() - (fetchedAtMs ?: return null)
    }

    /** The server's clock now, as best known: the phone's, moved by the last [offsetOf]. */
    fun serverNow(phoneNowMs: Long, offsetMs: Long?): Instant = Instant.ofEpochMilli(phoneNowMs + (offsetMs ?: 0L))

    /** The life day at [at] (the server's clock as last read): today's, or with [yesterday] the day before. */
    fun dayKey(at: Instant, yesterday: Boolean = false): String =
        TimeLabels.lifeDay(at).let { if (yesterday) it.minusDays(1) else it }.toString()

    /**
     * The day a tick of a row is for (P8 review): the day of the board it was tapped on, as the web board sends its
     * row's own day. [boardDay] is the board's (/check's `day`, a cached board's included), [yesterdayDay] its
     * Yesterday lane's; the clock at [at] only when the board names none (an older server). A board read before 04:00
     * and tapped after it books its row on the row's day (the server takes yesterday's as a record, at T 1.00, and
     * refuses an older one), never on a day the row wasn't shown for.
     */
    fun tickDayOf(boardDay: String?, yesterdayDay: String?, yesterday: Boolean, at: Instant): String {
        val board = if (yesterday) yesterdayDay ?: boardDay?.let { d -> TimeLabels.parseDay(d)?.minusDays(1)?.toString() } else boardDay
        return board?.takeIf { TimeLabels.parseDay(it) != null } ?: dayKey(at, yesterday)
    }

    /** "Sun 25 Oct" for a day key; the key as is when it can't be read. */
    fun dayLabel(day: String): String =
        TimeLabels.parseDay(day)?.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)) ?: day

    /** What a pass does with an item when the server's life day is [serverDay]. */
    sealed interface Plan {
        data object Send : Plan
        /** Not sent, and kept for the user: a line from an earlier day ([line] says why). */
        data class KeepBack(val line: String) : Plan
        /** Not sent, set aside with [line]: a tick the server can no longer book. */
        data class SetAside(val line: String) : Plan
    }

    fun plan(kind: Kind, day: String, label: String, serverDay: String): Plan {
        val d = TimeLabels.parseDay(day)
        val s = TimeLabels.parseDay(serverDay) ?: return Plan.Send
        return when (kind) {
            // The server books today or yesterday; anything older it refuses, so it is never sent.
            Kind.TICK -> if (d != null && d.isBefore(s.minusDays(1))) Plan.SetAside(tooOld(label, day)) else Plan.Send
            // /log saves on the server's today: a line from another day waits for the user.
            Kind.LOG -> if (d != s) Plan.KeepBack(keptBack(day)) else Plan.Send
            // Done marks the work item, not a day's row.
            Kind.WORK_DONE -> Plan.Send
            // A check-in is booked at its own instant; the server keeps one up to a week back, so an older one never goes.
            Kind.CHECKIN -> if (d != null && d.isBefore(s.minusDays(CheckinLine.MAX_AGE_DAYS))) Plan.SetAside(CheckinLine.tooOld(day)) else Plan.Send
            // A set is booked at its own instant inside its lift: the server keeps it there, or says why not.
            Kind.SET -> Plan.Send
        }
    }

    /** What a failed send means for the item. */
    enum class After {
        /** No answer, or a server fault: it stays, and the job tries again later. */
        RETRY,
        /** The server wants its API token (or has no mobile API there): everything stays, and the pass stops. */
        HOLD,
        /** The server said no: it is set aside with the server's own line. */
        SET_ASIDE,
    }

    fun after(err: Outcome.Err, tries: Int): After = when {
        err.offline -> After.RETRY
        err.code == "auth" || err.status == 401 || err.status == 403 -> After.HOLD
        // No answer the app could read as the mobile API (a wrong address): nothing is set aside over it.
        err.status == null || (err.status == 404 && err.code == null) -> After.HOLD
        err.status in 500..599 || err.code == "server" -> if (tries + 1 >= SERVER_TRIES) After.SET_ASIDE else After.RETRY
        else -> After.SET_ASIDE
    }

    // ── Words ───────────────────────────────────────────────────────────────

    /** The line under Check's header, the Log field and the widget's title: "2 waiting to send"; none at 0. */
    fun waitingLine(n: Int): String? = if (n <= 0) null else "$n waiting to send"

    /** After the waiting line while the server holds them (its token, a wrong address); the server's own line says why. */
    const val HELD = "held"

    /** A tick that couldn't reach the server and now waits. */
    fun queuedTick(title: String, day: String): String = "No connection: $title will send when you're online. It counts for ${dayLabel(day)}."

    /** A line that got no answer: it may have reached the server, so it is sent again with the same clientId. */
    const val QUEUED_LOG = "No answer: the line will send when you're online. If it got through, it's saved once."

    fun queuedWork(title: String): String = "No connection: Done on $title will send when you're online."

    /** The Log entry's line while it waits. */
    const val WAITING = "Waiting to send"

    /** A tick from before yesterday: the server would refuse it, so it is never sent. */
    fun tooOld(title: String, day: String): String =
        "$title was ticked ${dayLabel(day)}. Only today and yesterday can still be recorded, so it wasn't sent."

    /**
     * A line from an earlier day: kept back for the user, never saved on a day it wasn't typed. It waits only because it
     * got no answer, so its first try may have landed (P8 review): a done-now line that ticked a row then wrote no row
     * the server could find again, and sent now it would tick today's row too. So it says so, and Send for today is the
     * user's call, never promised safe.
     */
    fun keptBack(day: String): String =
        "Typed ${dayLabel(day)}, before 04:00, and it got no answer, so it may already be saved. Look on Today first: sent now, it saves for today."

    /** A tick that landed from the queue: the server's line after its title. */
    fun sentTick(title: String, line: String?): String = "Sent: $title" + (line?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")

    /** Undo on a tick still waiting: it is taken off the phone, nothing was sent. */
    const val TAKEN_BACK = "Taken back. It hadn't left the phone."

    /** Undo while it is on its way. */
    const val SENDING_NOW = "It's sending now. Undo it once it has landed."

    const val NOT_SENT_TITLE = "Not sent"
    const val SEND_FOR_TODAY = "Send for today"
    const val DISCARD = "Discard"
    const val DISMISS = "Dismiss"

    /** A label's quotes for a typed line ("“buy milk”"), a task's or work item's title as is. */
    fun labelOf(kind: Kind, label: String): String = if (kind == Kind.LOG) "“$label”" else label
}

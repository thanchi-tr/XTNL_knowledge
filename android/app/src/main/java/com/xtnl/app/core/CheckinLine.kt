package com.xtnl.app.core

import com.xtnl.app.data.CheckinBody
import com.xtnl.app.data.CheckinState
import java.time.Instant
import kotlin.math.floor

/**
 * The 5-second check-in on the phone (docs/mobile-api.md POST /checkin; health-2026-10-27.md D1, D2, D5, D9, phase 2).
 * Pure: the rules and words are the web's (src/lib/mind.ts), so the phone and Body › Mind say the same thing.
 * ui/check/CheckinSheet draws them, CheckViewModel sends them and data/SendQueue keeps one that got no answer.
 *
 *  - Tap 1 is the 9 × 9 grid, pleasantness across and energy up: ONE control, never 81 buttons. [cellAt] snaps a point
 *    to a cell (valence and energy, −4..+4 each) and [move] steps one (TalkBack's actions, a keyboard's arrows).
 *  - Tap 2 is optional: five labelled stress levels (0..4, Elo's single item). With the grid picked, a stress tap saves
 *    ([stressSaves], the web sheet's rule); before it, a stress tap only picks.
 *  - The words are the web's: the corner words inside a quadrant, plain words on an axis line ([wordsOf]). The same
 *    kind of words and the same neutral haptic (feel/Scores.checkIn) for every value: no colour judgement, no praise or
 *    shame, no count to keep up (D5).
 *  - Privacy (D2, D9): the server's receipt [receipt] line ("Logged 14:12") is safe on any surface. The pick's words join
 *    it only on the main display, never on the cover screen; and never on the widget, the tile, a notification or the
 *    lock screen, which show no check-in words at all. /check's `checkin` block is counts only, so nothing here can read
 *    a value back ([shows], [lastLine]).
 *  - [tookMs] measures the sheet from opening to saving, so the 5-second claim is checked against real taps.
 */
object CheckinLine {
    const val MIN = -4
    const val MAX = 4
    /** Cells along each axis (9: about one step of single-item error). */
    const val STEPS = MAX - MIN + 1

    const val TITLE = "Check in"
    const val QUESTION = "How do you feel right now?"
    /** The grid's accessible name (mind.ts GRID_LABEL). */
    const val GRID_LABEL = "Mood grid: pleasantness across, energy up"
    const val NOT_PICKED = "Nothing picked yet"
    const val STRESS_QUESTION = "How stressed are you right now?"
    /** Elo, Leppänen & Jahkola's five labelled levels, stored 0..4 (mind.ts STRESS_LEVELS). */
    val STRESS_LEVELS = listOf("Not at all", "A little", "Some", "Quite a lot", "Very much")
    const val UNPLEASANT = "Unpleasant"
    const val PLEASANT = "Pleasant"
    const val LOW_ENERGY = "Low energy"
    const val HIGH_ENERGY = "High energy"
    const val SAVE = "Save"
    const val CLOSE = "Close"

    /** The four soft quadrants and their corner words (mind.ts CORNER_WORDS): tense top left, excited top right, low bottom left, calm bottom right. */
    enum class Quadrant(val words: String) {
        TENSE("Tense, wired"),
        EXCITED("Excited, upbeat"),
        LOW("Low, drained"),
        CALM("Calm, content"),
    }

    /** A cell of the grid. */
    data class Cell(val valence: Int, val energy: Int)

    /**
     * The cell under a point of the grid: [x] across from its left edge and [y] down from its top edge, in the units of
     * [width] and [height]. Valence runs left to right, energy bottom to top; a point on or past an edge snaps to the edge
     * cell (mind.ts cellAt). Null for a grid with no size or a point that isn't a number.
     */
    fun cellAt(x: Float, y: Float, width: Float, height: Float): Cell? {
        if (!(width > 0f && height > 0f) || !x.isFinite() || !y.isFinite()) return null
        val col = floor(x / width * STEPS).toInt().coerceIn(0, STEPS - 1)
        val row = floor(y / height * STEPS).toInt().coerceIn(0, STEPS - 1)
        return Cell(MIN + col, MAX - row)
    }

    /** Where a cell's centre sits, as fractions of the grid (across from the left, down from the top): the pick's dot. */
    fun centreOf(cell: Cell): Pair<Float, Float> =
        ((cell.valence - MIN) + 0.5f) / STEPS to ((MAX - cell.energy) + 0.5f) / STEPS

    /** The cell one step away ([dx] across, [dy] up), held inside the grid; one not yet picked starts at the centre (mind.ts moveCell). */
    fun move(cell: Cell?, dx: Int, dy: Int): Cell {
        val from = cell ?: Cell(0, 0)
        return Cell((from.valence + dx).coerceIn(MIN, MAX), (from.energy + dy).coerceIn(MIN, MAX))
    }

    /** The quadrant a cell is in, or null on an axis line (valence 0 or energy 0). */
    fun quadrantOf(valence: Int, energy: Int): Quadrant? = when {
        valence == 0 || energy == 0 -> null
        energy > 0 -> if (valence < 0) Quadrant.TENSE else Quadrant.EXCITED
        else -> if (valence < 0) Quadrant.LOW else Quadrant.CALM
    }

    /** The words for a cell (mind.ts cellWordsOf): its quadrant's corner words, or on an axis line its two sides ("Neutral, low energy"). */
    fun wordsOf(valence: Int, energy: Int): String {
        quadrantOf(valence, energy)?.let { return it.words }
        val v = if (valence < 0) UNPLEASANT else if (valence > 0) PLEASANT else "Neutral"
        val e = if (energy < 0) "low energy" else if (energy > 0) "high energy" else "medium energy"
        return "$v, $e"
    }

    /** A step as the grid says it: "+2", "−2" (a true minus sign), "0". */
    fun signed(n: Int): String = when {
        n > 0 -> "+$n"
        n < 0 -> "−${-n}"
        else -> "0"
    }

    /** TalkBack's value for the grid (mind.ts gridValueTextOf): "Pleasantness +2, energy −1 · Calm, content"; none picked, so says so. */
    fun valueText(cell: Cell?): String =
        cell?.let { "Pleasantness ${signed(it.valence)}, energy ${signed(it.energy)} · ${wordsOf(it.valence, it.energy)}" } ?: NOT_PICKED

    fun isValue(n: Int?): Boolean = n != null && n in MIN..MAX

    /** With the grid picked, a stress tap saves (tap 2); before the grid tap it only picks the level. */
    fun stressSaves(cell: Cell?): Boolean = cell != null

    // ── The receipt ─────────────────────────────────────────────────────────

    /** How long the receipt offers Undo (mind.ts UNDO_MS). */
    const val UNDO_MS = 5_000L

    /** How long Undo stays: until the answer's [undoUntil] by the server's clock ([serverNowMs]), never more than [UNDO_MS]. */
    fun undoMs(undoUntil: String?, serverNowMs: Long): Long {
        val until = TimeLabels.parseInstant(undoUntil) ?: return UNDO_MS
        return (until.toEpochMilli() - serverNowMs).coerceIn(0L, UNDO_MS)
    }

    /**
     * The receipt as a screen shows it: the server's [line] ("Logged 14:12"), and on the main display its [words] after
     * it ("Logged 14:12 · Calm, content", the web sheet's receipt). On the [cover] screen (in either orientation:
     * Layouts.onCover, by its short side) the line alone: it is visible on a closed phone. The snackbar picks between the
     * two as it draws (XSnack.coverMessage), so a fold swaps them at once.
     */
    fun receipt(line: String, words: String?, cover: Boolean): String =
        if (cover || words.isNullOrBlank()) line else "$line · $words"

    /** The time a check-in took above which none is stored (mind.ts TOOK_MS_MAX: ten minutes). */
    const val TOOK_MS_MAX = 600_000L

    /** Opening the sheet to saving it, in milliseconds; null for a time that can't be one (the clock moved back, or past ten minutes). */
    fun tookMs(openedAtMs: Long, savedAtMs: Long): Long? = (savedAtMs - openedAtMs).takeIf { it in 0..TOOK_MS_MAX }

    // ── Where it comes from ─────────────────────────────────────────────────

    /** The phone's surfaces (POST /checkin's `via`): Check's row and the shortcut, the cover widget, the tile, a prompt. */
    val VIAS = listOf("check", "widget", "tile", "notify")

    /** A deep link's `via` (xtnl://app/checkin?via=tile), else Check's. */
    fun viaOf(raw: String?): String = raw?.takeIf { it in VIAS } ?: "check"

    /** The request for a pick saved at [at] (the server's clock as best known), from [via], after [tookMs]. The user's own tap. */
    fun bodyOf(cell: Cell, stress: Int?, via: String, at: Instant, tookMs: Long?): CheckinBody =
        CheckinBody(
            at = at.toString(),
            valence = cell.valence.coerceIn(MIN, MAX),
            energy = cell.energy.coerceIn(MIN, MAX),
            stress = stress?.takeIf { it in STRESS_LEVELS.indices },
            via = viaOf(via),
            tookMs = tookMs,
        )

    // ── What /check says (counts only) ──────────────────────────────────────

    /** Check's row and the widget's button show while the server's check-in is live and not paused. Null (an older server): neither. */
    fun shows(c: CheckinState?): Boolean = c != null && c.live && !c.paused

    /**
     * Whether a deep link (the tile, the shortcut, the widget) may open the sheet: unless the server said the check-in is
     * not live. A pause hides the asks; the user's own tap still opens it (a check-in sent is kept).
     */
    fun canOpen(c: CheckinState?): Boolean = c?.live != false

    /** "Checked in 14:12" for the newest check-in when it is on [today]'s life day; null otherwise. The time only, never what it was. */
    fun lastLine(c: CheckinState?, today: String?): String? {
        val at = TimeLabels.parseInstant(c?.lastAt) ?: return null
        if (today == null || TimeLabels.lifeDay(at).toString() != today) return null
        return "Checked in ${TimeLabels.clock(at, h24 = true)}"
    }

    // ── Safety (health-2026-10-27.md §Safety; mind.ts SAFETY, checked 2026-10-27) ──

    /** Always visible on the sheet: tap to call, through the dialer (ACTION_DIAL: the user presses call; no permission). */
    const val SAFETY_FOOTER = "Need to talk? Lifeline 13 11 14"
    const val SAFETY_LABEL = "Need to talk? Call Lifeline on 13 11 14"
    const val LIFELINE_TEL = "tel:131114"
    const val SAFETY_CHECKED_ON = "2026-10-27"

    // ── The queue's words (never a value: a check-in's label is its time) ──

    /** The server keeps a check-in up to this many life days back (mind.ts AT_MAX_AGE_DAYS). */
    const val MAX_AGE_DAYS = 7L

    /** What the queue and the Not sent card call it: "Check-in at 14:12". */
    fun queueLabel(at: String): String =
        TimeLabels.parseInstant(at)?.let { "Check-in at ${TimeLabels.clock(it, h24 = true)}" } ?: "Check-in"

    /**
     * A check-in that got no answer (HttpApi counts a read timeout as no answer, so its first try may have landed): it is
     * sent again with the same clientId, so it is saved once, the house's QUEUED_LOG wording.
     */
    const val QUEUED = "No answer: the check-in will send when you're online. It keeps the time you made it. If it got through, it's saved once."

    /**
     * Undo on a check-in waiting on the phone: taken off the queue, but its first try may have reached the server (its
     * answer lost), so it never says it hadn't left the phone; Body › Mind's Delete is where one that got through goes.
     */
    const val TAKEN_BACK = "Taken back on the phone. If the first try got through, delete it on the web, in Body › Mind."

    /** One the queue landed: the server's line, the time alone. */
    fun sent(line: String): String = "Check-in sent · ${line.ifBlank { "Logged" }}"

    fun tooOld(day: String): String = "The check-in from ${SendLine.dayLabel(day)} is more than a week old, so it wasn't sent."

    const val NOT_OPEN = "Check-ins aren't open on this server yet."

    /** An Undo with no answer: it never waits; the check-in stays for Body › Mind's Delete. */
    const val UNDO_OFFLINE = "No connection, so the check-in stays. Delete it on the web, in Body › Mind."
}

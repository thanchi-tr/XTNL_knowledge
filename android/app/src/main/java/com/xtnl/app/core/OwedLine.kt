package com.xtnl.app.core

import com.xtnl.app.data.OwedItem

/**
 * The owed cards' words (docs/mobile-api.md `owed` and `POST /tasks/makeup`; blueprint 2.3 and 3.2b, P22, decision D18):
 * the web MakeUpCard's own lines come from the server ([OwedItem.whenLine], [OwedItem.text], [OwedItem.window]); this
 * adds only the buttons' labels and the figures beside them, in the web's words ("−4.2 owed", "Make up · ≈ 3.5", "Do
 * minimum · ≈ 1.1"). A debt is a true minus, never a red wall, and nothing here blames: a card says what is still open
 * and what making it up does.
 *
 * The app never prices a make-up: [OwedItem.makeUpXp] is the server's, at its rate (×0.85, C 1.00), and the make-up
 * repays the whole debt. While the server says Duty is off (`dutyOn` false) a card shows without its actions.
 */
object OwedLine {
    const val TITLE = "Owed"
    const val ACCEPT = "Accept the loss"
    /** A card's line while Duty is off on the server (the phone's make-up is refused then; the web's still works). */
    const val ON_THE_WEB = "Make it up on the web app: Duty isn't switched on here yet."

    /** POST /tasks/makeup's actions; [UNDO] takes a make-up (or its minimum) back inside its ten minutes, as the web card's Undo. */
    const val MAKEUP = "makeup"
    const val MINIMUM = "minimum"
    const val ACCEPT_LOSS = "accept"
    const val UNDO = "undo"

    /** The snackbar's action on a make-up's line while its Undo is open (the answer's `undoUntil`). */
    const val UNDO_LABEL = "Undo"

    /**
     * The server's 409 for a debt made up or written off elsewhere (the web, another device): with its 404 ("That debt
     * no longer exists.") the card is not owed any more, so it leaves and /check is read again.
     */
    const val NOT_OWED = "Nothing is owed there any more."

    /** Whether a refusal of an action on [action] means the card is no longer owed (it leaves). An undo's refusals never do. */
    fun cardGone(action: String, code: String?, message: String): Boolean = action != UNDO && (code == "gone" || message == NOT_OWED)

    /** Whether the snackbar offers Undo for an answer: a make-up or a minimum whose `undoUntil` the server sent. */
    fun undoable(action: String, undoUntil: String?): Boolean = (action == MAKEUP || action == MINIMUM) && !undoUntil.isNullOrBlank()

    /** The open debts' sum, one decimal (the web's Owed row). */
    fun total(owed: List<OwedItem>): Double = Math.round(owed.sumOf { it.debt } * 10) / 10.0

    /** The card's head: "Owed: 2 · −12.5 XP" (the web's Owed notice). */
    fun header(owed: List<OwedItem>): String = "$TITLE: ${owed.size} · −${Fmt.figure(total(owed))} XP"

    /** The owed chip: "−4.2 owed". */
    fun debtChip(o: OwedItem): String = "−${Fmt.figure(o.debt)} owed"

    /** The make-up's rate and what it repays: "A make-up pays ×0.85 and repays all 4.2." (a study must pays 0). */
    fun rateLine(o: OwedItem): String =
        if (o.studyLinked) "A make-up pays 0 and repays all ${Fmt.figure(o.debt)}."
        else "A make-up pays ×${Fmt.figure(o.rate, 2)} and repays all ${Fmt.figure(o.debt)}."

    /** "Make up · ≈ 3.5" (the server's price now). */
    fun makeUpLabel(o: OwedItem): String = "Make up · ≈ ${Fmt.figure(o.makeUpXp)}"

    /** "Do minimum · ≈ 1.1", or null without a minimum version. */
    fun minimumLabel(o: OwedItem): String? = o.minimum?.let { "Do minimum · ≈ ${Fmt.figure(it.xp)}" }

    /** The minimum version's words under its button ("1 stretch"), or null. */
    fun minimumWords(o: OwedItem): String? = o.minimum?.label?.takeIf { it.isNotBlank() }

    /** The minute chips a proof make-up asks for (the server's), or none. */
    fun minuteChips(o: OwedItem): List<Int> = o.proof?.minutes.orEmpty()

    /** The page chips a reading must's make-up asks for (the server's), or none. */
    fun pageChips(o: OwedItem): List<Int> = o.proof?.pages?.chips.orEmpty()

    /**
     * What a full make-up still needs before it can be sent, as its tick does (the server would refuse it: "Log the
     * minutes", "Log the pages"), in plain words; null when it can go. The minimum version never needs any.
     */
    fun needs(o: OwedItem, minutes: Int?, pages: Int?): String? {
        val wants = mutableListOf<String>()
        if (o.proof?.minutes != null && minutes == null) wants += "the minutes it took"
        val target = o.proof?.pages?.target
        if (o.proof?.pages != null && target != null && (pages == null || pages < target)) wants += "at least ${ProofLine.pagesLabel(target)}"
        if (wants.isEmpty()) return null
        return "Like its tick, its make-up counts its ${if (o.proof?.minutes != null) "time" else "pages"}: pick ${wants.joinToString(" and ")}."
    }

    /** Whether Make up can be tapped: Duty on, and its proof (if any) picked. */
    fun canMakeUp(o: OwedItem, dutyOn: Boolean, minutes: Int?, pages: Int?): Boolean = dutyOn && needs(o, minutes, pages) == null

    /** What TalkBack reads for a card: its when, the debt, its line and its window. */
    fun describe(o: OwedItem): String = listOf(o.whenLine.ifBlank { o.title }, debtChip(o), o.text, o.window).filter { it.isNotBlank() }.joinToString(". ") { it.trimEnd('.') } + "."
}

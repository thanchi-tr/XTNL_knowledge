package com.xtnl.app.core

import com.xtnl.app.data.ReviewCard

/** One answered card, as the session summary counts it. */
data class Answered(
    val ideaId: String,
    val correct: Boolean,
    /** Review points paid. */
    val points: Double,
    /** Answered after an earlier miss in this session. */
    val again: Boolean,
)

/**
 * A review run, immutable: every answer returns the next session. What the
 * contract asks the app to keep for one session: the queue, the combo, and
 * each card's miss count (sent as `sessionMisses`).
 *
 * The server owns the retry rule (a miss comes back while this card's misses
 * this session, that one included, are at most 3) and says it with `retry`;
 * the session follows it exactly: retry → the card goes to the end of the
 * queue, at `levelTo`; otherwise it leaves the queue. As a guard against a
 * server that keeps saying retry, a card never comes back more than
 * [MAX_RETURNS] times.
 */
data class ReviewSession(
    val queue: List<ReviewCard>,
    val answered: List<Answered> = emptyList(),
    /** Misses per card this session. */
    val misses: Map<String, Int> = emptyMap(),
    /** Times each card was put back. */
    val returns: Map<String, Int> = emptyMap(),
    /** 0 at the start, then `comboNext` from every answer (as the web runner). */
    val combo: Int = 0,
    val bestCombo: Int = 0,
    /** Review points paid this session. */
    val points: Double = 0.0,
    /** The cards the session started with. */
    val startCount: Int = queue.size,
) {
    val current: ReviewCard? get() = queue.firstOrNull()
    val finished: Boolean get() = queue.isEmpty()

    /** Answers given, and the answers the run will take in all (cards put back add to it). */
    val done: Int get() = answered.size
    val total: Int get() = answered.size + queue.size
    val progress: Float get() = if (total == 0) 1f else done.toFloat() / total

    val correctCount: Int get() = answered.count { it.correct }
    /** Cards cleared on their first showing. */
    val firstTry: Int get() = answered.count { it.correct && !it.again }
    val accuracy: Float get() = if (answered.isEmpty()) 0f else correctCount.toFloat() / answered.size

    /** `sessionMisses` for POST /review/answer: this card's misses earlier in this session. */
    fun sessionMisses(ideaId: String): Int = misses[ideaId] ?: 0

    /** Is this showing of the card a return after a miss? */
    fun isAgain(ideaId: String): Boolean = sessionMisses(ideaId) > 0

    fun answer(correct: Boolean, retry: Boolean, points: Double, comboNext: Int, levelTo: Int? = null): ReviewSession {
        val card = current ?: return this
        val id = card.ideaId
        val rest = queue.drop(1)
        val putBack = !correct && retry && (returns[id] ?: 0) < MAX_RETURNS
        val back = card.copy(level = levelTo ?: card.level)
        return copy(
            queue = if (putBack) rest + back else rest,
            answered = answered + Answered(id, correct, points, isAgain(id)),
            misses = if (correct) misses else misses + (id to sessionMisses(id) + 1),
            returns = if (putBack) returns + (id to (returns[id] ?: 0) + 1) else returns,
            combo = comboNext,
            bestCombo = maxOf(bestCombo, comboNext),
            points = this.points + points,
        )
    }

    /** The cards answered at least once: each has left today's due cards, whatever the answer. */
    val cardsAnswered: Int get() = answered.map { it.ideaId }.distinct().size

    /** The current card leaves the queue with no answer here (deleted on the web, or its answer already recorded). */
    fun skip(): ReviewSession = if (queue.isEmpty()) this else copy(queue = queue.drop(1))

    /** Cards the server sent later (a "Review more" top-up), skipping any already queued. */
    fun plus(cards: List<ReviewCard>): ReviewSession {
        val have = queue.map { it.ideaId }.toSet()
        val fresh = cards.filter { it.ideaId !in have }
        return copy(queue = queue + fresh, startCount = startCount + fresh.size)
    }

    companion object {
        /** The web runner's SESSION_RETURNS_MAX: a card comes back after at most 3 misses a session. */
        const val MAX_RETURNS = 3
    }
}

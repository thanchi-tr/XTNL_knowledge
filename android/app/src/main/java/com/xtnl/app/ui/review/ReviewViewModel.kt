package com.xtnl.app.ui.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtnl.app.AppGraph
import com.xtnl.app.core.AnswerDraft
import com.xtnl.app.core.AnswerShape
import com.xtnl.app.core.ReviewSession
import com.xtnl.app.data.AnswerResult
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.Quest
import com.xtnl.app.data.ReviewCard
import com.xtnl.app.data.celebrationTitles
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * A review run: GET /review/queue, then POST /review/answer per card,
 * following the server's `retry` (the card goes to the end of this session).
 * The session, the draft answer and the last feedback all live here, so
 * folding, unfolding or switching tabs mid-run changes nothing.
 */
class ReviewViewModel(private val graph: AppGraph) : ViewModel() {

    enum class Phase { IDLE, LOADING, ANSWERING, SUBMITTING, FEEDBACK, SUMMARY, EMPTY, ERROR }

    data class Ui(
        val phase: Phase = Phase.IDLE,
        val session: ReviewSession? = null,
        val dueTotal: Int = 0,
        /** Due cards the app can't serve (DIAGRAM, an image to label), known when the queue came back short. */
        val webOnly: Int = 0,
        val draft: AnswerDraft = AnswerDraft(),
        /** The feedback for the card just answered, and that card. */
        val result: AnswerResult? = null,
        val answered: ReviewCard? = null,
        val answeredWasRetry: Boolean = false,
        val error: String? = null,
        val submitError: String? = null,
        /** A line about the run itself: a card deleted on the web was skipped. */
        val note: String? = null,
        val now: String? = null,
        val quest: Quest? = null,
        val streakSecured: Boolean = false,
        val celebrations: List<String> = emptyList(),
        /**
         * Tick per moment, for the animations. They keep counting across runs (a new run, an ended one), so a
         * moment's key is never reused: one played once is never taken for a new one.
         */
        val correctKey: Int = 0,
        val missKey: Int = 0,
        val levelUpKey: Int = 0,
        val summaryKey: Int = 0,
        val levelUps: Int = 0,
        /** The combo before the last answer (a break, a tier entered). */
        val prevCombo: Int = 0,
        /** Ticks with each run started: a card's showing is keyed by it (the same card can open two runs). */
        val run: Int = 0,
    ) {
        val card: ReviewCard? get() = session?.current
        val running: Boolean get() = phase == Phase.ANSWERING || phase == Phase.SUBMITTING || phase == Phase.FEEDBACK
        /**
         * Due cards this run didn't reach (past the queue's limit, or the run ended early), so "Review more" has
         * something to start. Cards, not answers: a missed card's return is the same card.
         */
        val moreDue: Boolean get() = dueTotal - webOnly - (session?.cardsAnswered ?: 0) > 0
    }

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()

    /** The last failed answer: the same card and the same answer again send the same clientId. */
    private var failedAnswer: Triple<String, AnswerDraft, String>? = null

    /** Starts a run. [seed] is /check's quest (done today, target), shown until an answer brings the server's. */
    fun start(seed: Quest? = null) {
        if (_ui.value.phase == Phase.LOADING) return
        // A new run's answers are new answers: none resends an old one's clientId.
        failedAnswer = null
        _ui.update { it.copy(phase = Phase.LOADING, error = null) }
        viewModelScope.launch {
            when (val r = graph.api.reviewQueue(QUEUE_LIMIT)) {
                is Outcome.Ok -> {
                    val cards = r.value.cards
                    // A short queue holds every due card the app can serve: the rest of dueTotal is for the web.
                    val webOnly = if (cards.size < QUEUE_LIMIT) (r.value.dueTotal - cards.size).coerceAtLeast(0) else 0
                    if (cards.isEmpty()) {
                        _ui.update { it.copy(phase = Phase.EMPTY, dueTotal = r.value.dueTotal, webOnly = webOnly, now = r.value.now) }
                    } else {
                        val s = ReviewSession(cards)
                        val u = _ui.value
                        _ui.value = cleared(u).copy(
                            phase = Phase.ANSWERING, session = s, dueTotal = r.value.dueTotal, webOnly = webOnly, now = r.value.now,
                            draft = AnswerDraft.start(cards.first()), quest = seed, run = u.run + 1,
                        )
                    }
                }
                is Outcome.Err -> _ui.update { it.copy(phase = Phase.ERROR, error = r.message) }
            }
        }
    }

    fun edit(change: (AnswerDraft) -> AnswerDraft) = _ui.update { it.copy(draft = change(it.draft), submitError = null) }

    fun ready(): Boolean {
        val u = _ui.value
        val card = u.card ?: return false
        return u.phase == Phase.ANSWERING && AnswerShape.ready(card, u.draft)
    }

    fun submit() {
        val u = _ui.value
        val s = u.session ?: return
        val card = s.current ?: return
        if (u.phase != Phase.ANSWERING || !AnswerShape.ready(card, u.draft)) return
        val clientId = failedAnswer?.takeIf { it.first == card.ideaId && it.second == u.draft }?.third ?: UUID.randomUUID().toString()
        val wasRetry = s.isAgain(card.ideaId)
        _ui.update { it.copy(phase = Phase.SUBMITTING, submitError = null) }
        viewModelScope.launch {
            val r = graph.api.answer(card.ideaId, AnswerShape.shape(card, u.draft), s.combo, s.sessionMisses(card.ideaId), clientId)
            // The run moved on while this was grading (ended, or a new one): the server has the answer, this screen has gone.
            if (_ui.value.session !== s || _ui.value.phase != Phase.SUBMITTING) {
                if (r is Outcome.Ok) graph.changes.tryEmit("review")
                return@launch
            }
            when (r) {
                is Outcome.Ok -> {
                    failedAnswer = null
                    val res = r.value
                    val next = s.answer(res.correct, res.retry, res.xp, res.comboNext, res.levelTo)
                    _ui.update {
                        it.copy(
                            phase = Phase.FEEDBACK, session = next, result = res, answered = card, answeredWasRetry = wasRetry, note = null, prevCombo = s.combo,
                            // A null quest target means "not fixed yet": keep the one we have.
                            quest = res.quest?.let { q -> q.copy(target = q.target ?: it.quest?.target) } ?: it.quest, streakSecured = it.streakSecured || res.streakSecured,
                            celebrations = it.celebrations + celebrationTitles(res.celebrations),
                            correctKey = if (res.correct) it.correctKey + 1 else it.correctKey,
                            missKey = if (!res.correct) it.missKey + 1 else it.missKey,
                            levelUpKey = if (res.leveledUp) it.levelUpKey + 1 else it.levelUpKey,
                            levelUps = if (res.leveledUp) it.levelUps + 1 else it.levelUps,
                        )
                    }
                    graph.changes.tryEmit("review")
                }
                is Outcome.Err -> when {
                    // Deleted on the web: it can never be answered, so the run goes on without it.
                    r.code == "gone" -> skipCard("That card was deleted on the web, so it was skipped.")
                    alreadyRecorded(r) -> {
                        skipCard(r.message)
                        graph.changes.tryEmit("review")
                    }
                    else -> {
                        failedAnswer = Triple(card.ideaId, u.draft, clientId)
                        _ui.update { it.copy(phase = Phase.ANSWERING, submitError = r.message) }
                    }
                }
            }
        }
    }

    /** The current card leaves the run unanswered here; the next one, or the summary, follows. */
    private fun skipCard(note: String) {
        failedAnswer = null
        _ui.update { u ->
            val s = u.session?.skip() ?: return@update u
            val next = s.current
            u.copy(
                session = s,
                // It has left today's due cards either way.
                dueTotal = (u.dueTotal - 1).coerceAtLeast(0),
                phase = when { next != null -> Phase.ANSWERING; s.done > 0 -> Phase.SUMMARY; else -> Phase.EMPTY },
                draft = next?.let { AnswerDraft.start(it) } ?: u.draft,
                submitError = null,
                note = note,
                summaryKey = if (next == null && s.done > 0) u.summaryKey + 1 else u.summaryKey,
            )
        }
    }

    /** After the feedback: the next card, or the summary. */
    fun next() {
        val u = _ui.value
        if (u.phase != Phase.FEEDBACK) return
        val s = u.session ?: return
        val card = s.current
        if (card == null) {
            _ui.update { it.copy(phase = Phase.SUMMARY, summaryKey = it.summaryKey + 1) }
        } else {
            _ui.update { it.copy(phase = Phase.ANSWERING, draft = AnswerDraft.start(card), result = null, answered = null, submitError = null, note = null) }
        }
    }

    /** End the run now: the summary of what was answered. */
    fun finish() {
        val u = _ui.value
        if (u.session == null || u.session.done == 0) {
            _ui.value = cleared(u)
            return
        }
        _ui.update { it.copy(phase = Phase.SUMMARY, summaryKey = it.summaryKey + 1) }
    }

    fun reset() { _ui.value = cleared(_ui.value) }

    /** Nothing of a run, but the moments' keys and the run count go on. */
    private fun cleared(u: Ui) = Ui(correctKey = u.correctKey, missKey = u.missKey, levelUpKey = u.levelUpKey, summaryKey = u.summaryKey, run = u.run)

    companion object {
        /** Cards asked for per run (the web runner's batch). */
        const val QUEUE_LIMIT = 20

        /**
         * 409 `recorded`: a resend of an answer the server already recorded for its clientId (the first reply was lost,
         * or the server failed after the write). Nothing was paid again and the first result isn't sent twice, so the
         * card counts as answered and the run moves on (docs/mobile-api.md, POST /review/answer).
         */
        fun alreadyRecorded(e: Outcome.Err): Boolean = e.code == "recorded"
    }
}

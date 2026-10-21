package com.xtnl.app.ui.review

import com.xtnl.app.core.ReviewSession
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.ReviewCard
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The summary's "Review more": due cards the run didn't reach, counted in cards, not answers. */
class ReviewUiTest {
    private fun cards(n: Int) = (1..n).map { ReviewCard("c$it", "SHORT", "Q $it") }

    private fun answerAll(s0: ReviewSession, missFirst: Int): ReviewSession {
        var s = s0
        // The first [missFirst] cards are missed once and come back at the end, then are recalled.
        var misses = missFirst
        while (!s.finished) {
            val miss = misses > 0 && !s.isAgain(s.current!!.ideaId)
            if (miss) misses--
            s = s.answer(correct = !miss, retry = miss, points = if (miss) 0.0 else 1.0, comboNext = 0)
        }
        return s
    }

    @Test fun retriesDoNotHideTheCardsTheRunNeverReached() {
        // 25 due, 20 served, 5 missed once then recalled: 25 answers, but 5 cards never shown.
        val s = answerAll(ReviewSession(cards(20)), missFirst = 5)
        val ui = ReviewViewModel.Ui(session = s, dueTotal = 25)
        assertTrue(s.done == 25)
        assertTrue(ui.moreDue)
    }

    @Test fun nothingMoreOnceEveryDueCardWasAnswered() {
        val s = answerAll(ReviewSession(cards(12)), missFirst = 3)
        assertFalse(ReviewViewModel.Ui(session = s, dueTotal = 12).moreDue)
    }

    @Test fun diagramsAreNotMoreForTheApp() {
        // 14 due, a short queue of 12: the other 2 are diagrams the app can't serve.
        val s = answerAll(ReviewSession(cards(12)), missFirst = 0)
        assertFalse(ReviewViewModel.Ui(session = s, dueTotal = 14, webOnly = 2).moreDue)
    }

    @Test fun anEarlyEndLeavesMore() {
        val s = ReviewSession(cards(12)).answer(correct = true, retry = false, points = 1.0, comboNext = 1)
        assertTrue(ReviewViewModel.Ui(session = s, dueTotal = 12).moreDue)
    }

    @Test fun onlyTheServersAlreadyRecordedCountsAsRecorded() {
        assertTrue(ReviewViewModel.alreadyRecorded(Outcome.Err("Already recorded.", code = "recorded", status = 409)))
        assertFalse(ReviewViewModel.alreadyRecorded(Outcome.Err("That clientId was already used for a different request.", code = "conflict", status = 409)))
        assertFalse(ReviewViewModel.alreadyRecorded(Outcome.Err("That idea no longer exists.", code = "gone", status = 404)))
    }
}

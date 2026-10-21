package com.xtnl.app.core

import com.xtnl.app.data.ReviewCard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReviewSessionTest {
    private fun cards(vararg ids: String) = ids.map { ReviewCard(it, "SHORT", "Q $it", level = 3) }

    @Test fun aCorrectAnswerLeavesTheQueueAndCarriesTheCombo() {
        var s = ReviewSession(cards("a", "b"))
        assertEquals(0, s.combo)
        s = s.answer(correct = true, retry = false, points = 4.2, comboNext = 1)
        assertEquals(listOf("b"), s.queue.map { it.ideaId })
        assertEquals(1, s.combo)
        assertEquals(4.2, s.points, 1e-9)
        assertEquals(1, s.done)
        assertEquals(2, s.total)
    }

    @Test fun retryPutsTheCardAtTheEndAtLevelTo() {
        var s = ReviewSession(cards("a", "b", "c"))
        s = s.answer(correct = false, retry = true, points = 0.0, comboNext = 0, levelTo = 2)
        assertEquals(listOf("b", "c", "a"), s.queue.map { it.ideaId })
        assertEquals(2, s.queue.last().level)
        assertEquals(4, s.total)
        assertEquals(1, s.sessionMisses("a"))
        assertTrue(s.isAgain("a"))
    }

    @Test fun aMissWithoutRetryLeavesTheQueueButStillCounts() {
        var s = ReviewSession(cards("a", "b"))
        s = s.answer(correct = false, retry = false, points = 0.0, comboNext = 0)
        assertEquals(listOf("b"), s.queue.map { it.ideaId })
        assertEquals(1, s.sessionMisses("a"))
        assertEquals(0, s.correctCount)
    }

    @Test fun sessionMissesIsZeroOnTheFirstAskThenCountsEachMiss() {
        var s = ReviewSession(cards("a"))
        assertEquals(0, s.sessionMisses("a"))
        for (expected in 1..3) {
            s = s.answer(correct = false, retry = true, points = 0.0, comboNext = 0)
            assertEquals(expected, s.sessionMisses("a"))
            assertEquals("a", s.current?.ideaId)
        }
        // The server stops saying retry after the third miss (sessionMisses + 1 > 3); the card leaves.
        s = s.answer(correct = false, retry = false, points = 0.0, comboNext = 0)
        assertTrue(s.finished)
        assertEquals(4, s.sessionMisses("a"))
    }

    @Test fun aServerThatKeepsSayingRetryIsCappedAtThreeReturns() {
        var s = ReviewSession(cards("a"))
        repeat(ReviewSession.MAX_RETURNS) { s = s.answer(correct = false, retry = true, points = 0.0, comboNext = 0) }
        assertFalse(s.finished)
        s = s.answer(correct = false, retry = true, points = 0.0, comboNext = 0)
        assertTrue(s.finished)
    }

    @Test fun aCorrectAnswerIgnoresRetry() {
        var s = ReviewSession(cards("a", "b"))
        s = s.answer(correct = true, retry = true, points = 1.0, comboNext = 1)
        assertEquals(listOf("b"), s.queue.map { it.ideaId })
    }

    @Test fun summaryFiguresCountFirstTriesAndBestCombo() {
        var s = ReviewSession(cards("a", "b"))
        s = s.answer(correct = true, retry = false, points = 4.0, comboNext = 1) // a
        s = s.answer(correct = false, retry = true, points = 0.0, comboNext = 0) // b missed, back
        s = s.answer(correct = true, retry = false, points = 3.0, comboNext = 1) // b again
        assertTrue(s.finished)
        assertNull(s.current)
        assertEquals(3, s.done)
        assertEquals(2, s.correctCount)
        assertEquals(1, s.firstTry)
        assertEquals(1, s.bestCombo)
        assertEquals(7.0, s.points, 1e-9)
        assertEquals(2f / 3f, s.accuracy, 1e-6f)
        assertEquals(1f, s.progress, 1e-6f)
    }

    @Test fun cardsAnsweredCountsEachCardOnceRepeatsAside() {
        // 'Review more' compares the due count with cards, not answers: a missed card's return is one card.
        var s = ReviewSession(cards("a", "b"))
        s = s.answer(correct = false, retry = true, points = 0.0, comboNext = 0) // a missed, back
        s = s.answer(correct = true, retry = false, points = 3.0, comboNext = 1) // b
        s = s.answer(correct = true, retry = false, points = 3.0, comboNext = 2) // a again
        assertEquals(3, s.done)
        assertEquals(2, s.cardsAnswered)
    }

    @Test fun skipDropsTheCurrentCardWithoutAnAnswer() {
        var s = ReviewSession(cards("a", "b")).answer(correct = true, retry = false, points = 1.0, comboNext = 1)
        s = s.skip()
        assertTrue(s.finished)
        assertEquals(1, s.done)
        assertEquals(1, s.combo)
        assertEquals(s, s.skip())
    }

    @Test fun plusAddsOnlyNewCards() {
        val s = ReviewSession(cards("a", "b")).plus(cards("b", "c"))
        assertEquals(listOf("a", "b", "c"), s.queue.map { it.ideaId })
        assertEquals(3, s.startCount)
    }
}

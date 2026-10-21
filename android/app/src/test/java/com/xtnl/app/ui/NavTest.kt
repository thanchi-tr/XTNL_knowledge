package com.xtnl.app.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A tick (Start review, focus the quick line) is acted on once, however often its screen comes back. */
class NavTest {
    @Test fun aStartReviewTickIsTakenOnce() {
        val nav = Nav()
        assertFalse(nav.takeStartReview())
        nav.startReview++
        assertTrue(nav.takeStartReview())
        // Back to Review from another tab: the effect runs again with the same tick.
        assertFalse(nav.takeStartReview())
        nav.startReview++
        assertTrue(nav.takeStartReview())
    }

    @Test fun aFocusTickIsTakenOnce() {
        val nav = Nav()
        nav.focusLog++
        assertTrue(nav.takeFocusLog())
        assertFalse(nav.takeFocusLog())
    }
}

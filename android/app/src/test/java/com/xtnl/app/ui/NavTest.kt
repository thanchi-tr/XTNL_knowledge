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

    /** More › Status (P1): Back goes to More's list, then to Check. */
    @Test fun backFromStatusGoesToMore() {
        val nav = Nav(Tab.MORE, MoreRoute.STATUS)
        assertTrue(nav.canGoBack)
        assertTrue(nav.back())
        assertTrue(nav.tab == Tab.MORE && nav.more == MoreRoute.ROOT)
        assertTrue(nav.back())
        assertTrue(nav.tab == Tab.CHECK)
        assertFalse(nav.back())
    }

    @Test fun aFocusTickIsTakenOnce() {
        val nav = Nav()
        nav.focusLog++
        assertTrue(nav.takeFocusLog())
        assertFalse(nav.takeFocusLog())
    }
}

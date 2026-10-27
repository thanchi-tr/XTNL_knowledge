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

    /** More › Mall (P18): Back goes to More's list, then to Check. */
    @Test fun backFromMallGoesToMore() {
        val nav = Nav(Tab.MORE, MoreRoute.MALL)
        assertTrue(nav.canGoBack)
        assertTrue(nav.back())
        assertTrue(nav.tab == Tab.MORE && nav.more == MoreRoute.ROOT)
        assertTrue(nav.back())
        assertTrue(nav.tab == Tab.CHECK)
        assertFalse(nav.back())
    }

    /** Health phase 2: the check-in sheet's tick (the tile, the widget, the shortcut, Check's row) is acted on once. */
    @Test fun aCheckinTickIsTakenOnce() {
        val nav = Nav()
        assertFalse(nav.takeCheckin())
        nav.checkin++
        assertTrue(nav.takeCheckin())
        assertFalse(nav.takeCheckin())
        // xtnl://app/checkin lands on Check with the sheet's tick and its surface (ScreensTest opens it for real).
        val src = (java.io.File("src/main/java/com/xtnl/app/ui/Nav.kt").takeIf { it.exists() } ?: java.io.File("app/src/main/java/com/xtnl/app/ui/Nav.kt")).readText()
        assertTrue(Regex("""path == "/checkin" -> \{\s*tab = Tab\.CHECK\s*checkinVia = CheckinLine\.viaOf\(uri\.getQueryParameter\("via"\)\)\s*checkin\+\+""").containsMatchIn(src))
    }

    @Test fun aFocusTickIsTakenOnce() {
        val nav = Nav()
        nav.focusLog++
        assertTrue(nav.takeFocusLog())
        assertFalse(nav.takeFocusLog())
    }
}

package com.xtnl.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Galaxy Z Fold 8 at density 420: front 475 × 751 dp, main 704 × 932 dp (932 × 704 sideways). */
class LayoutModeTest {
    @Test fun frontDisplayIsCompactWithTheBottomBar() {
        val m = Layouts.of(475f, 751f, null)
        assertEquals(WidthClass.COMPACT, m.width)
        assertEquals(NavStyle.BAR, m.nav)
        assertEquals(Panes.SINGLE, m.panes)
        assertFalse(m.twoPane)
    }

    @Test fun mainDisplayUprightIsMediumWithTheRailAndTwoPanes() {
        val m = Layouts.of(704f, 932f, null)
        assertEquals(WidthClass.MEDIUM, m.width)
        assertEquals(NavStyle.RAIL, m.nav)
        assertEquals(Panes.SIDE_BY_SIDE, m.panes)
        assertEquals(Posture.FLAT, m.posture)
        assertNull(m.splitDp)
    }

    @Test fun mainDisplaySidewaysIsExpanded() {
        val m = Layouts.of(932f, 704f, null)
        assertEquals(WidthClass.EXPANDED, m.width)
        assertEquals(NavStyle.RAIL, m.nav)
        assertTrue(m.twoPane)
    }

    @Test fun widthClassBoundaries() {
        assertEquals(WidthClass.COMPACT, Layouts.widthClass(599.9f))
        assertEquals(WidthClass.MEDIUM, Layouts.widthClass(600f))
        assertEquals(WidthClass.MEDIUM, Layouts.widthClass(839f))
        assertEquals(WidthClass.EXPANDED, Layouts.widthClass(840f))
    }

    @Test fun bookPostureSplitsAtTheHingeAfterTheRail() {
        val fold = FoldInfo(HingeOrientation.VERTICAL, halfOpen = true, separating = true, startDp = 352f, endDp = 352f)
        val m = Layouts.of(704f, 932f, fold)
        assertEquals(Posture.BOOK, m.posture)
        assertEquals(Panes.SIDE_BY_SIDE, m.panes)
        assertEquals(352f - Layouts.RAIL_DP, m.splitDp!!, 0.01f)
        assertEquals(0f, m.gapDp, 0.01f)
    }

    @Test fun tabletopPutsContentAboveAndControlsBelow() {
        val fold = FoldInfo(HingeOrientation.HORIZONTAL, halfOpen = true, separating = true, startDp = 352f, endDp = 352f)
        val m = Layouts.of(932f, 704f, fold)
        assertEquals(Posture.TABLETOP, m.posture)
        assertEquals(Panes.TOP_BOTTOM, m.panes)
        assertEquals(352f, m.splitDp!!, 0.01f)
    }

    @Test fun aFlatFoldIsAnEvenSplit() {
        val fold = FoldInfo(HingeOrientation.VERTICAL, halfOpen = false, separating = false, startDp = 352f, endDp = 352f)
        val m = Layouts.of(704f, 932f, fold)
        assertEquals(Posture.FLAT, m.posture)
        assertEquals(Panes.SIDE_BY_SIDE, m.panes)
        assertNull(m.splitDp)
    }

    @Test fun aHingeThatLeavesAPaneTooNarrowFallsBackToFlat() {
        val fold = FoldInfo(HingeOrientation.VERTICAL, halfOpen = true, separating = true, startDp = 200f, endDp = 200f)
        val m = Layouts.of(704f, 932f, fold)
        assertEquals(Posture.FLAT, m.posture)
        val low = FoldInfo(HingeOrientation.HORIZONTAL, halfOpen = true, separating = true, startDp = 600f, endDp = 600f)
        assertEquals(Posture.FLAT, Layouts.of(932f, 704f, low).posture)
    }

    @Test fun splitPxFollowsTheHingeOrFallsBackToHalf() {
        // A pane area starting after an 80 dp rail (210 px) on a 1848 px window; the hinge at 924 px.
        assertEquals(714 to 0, Layouts.splitPx(210, 1638, 924, 924, 630))
        assertEquals(819 to 0, Layouts.splitPx(210, 1638, null, null, 630))
        // A hinge with width: the gap is its width.
        assertEquals(714 to 20, Layouts.splitPx(210, 1638, 924, 944, 630))
        // Outside the container (or leaving a narrow pane): half.
        assertEquals(819 to 0, Layouts.splitPx(210, 1638, 300, 300, 630))
    }
}

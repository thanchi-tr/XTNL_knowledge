package com.xtnl.app.core

import kotlin.math.roundToInt

/**
 * Which layout the window gets, from its size and the hinge. Pure, so the
 * rules are tested without a device.
 *
 * Galaxy Z Fold 8 (density 420):
 *   front display     ≈ 475 × 751 dp  → compact: bottom bar, one pane
 *   main, upright     ≈ 704 × 932 dp  → medium: rail, two panes
 *   main, sideways    ≈ 932 × 704 dp  → expanded: rail, two panes
 *   half open, hinge vertical (book)      → two panes split at the hinge
 *   half open, hinge horizontal (tabletop) → content above the hinge, controls below
 */
enum class WidthClass { COMPACT, MEDIUM, EXPANDED }

enum class NavStyle { BAR, RAIL }

enum class Panes {
    /** One column (the front display). */
    SINGLE,
    /** Two panes side by side. */
    SIDE_BY_SIDE,
    /** Content on the top half, controls on the bottom half (tabletop). */
    TOP_BOTTOM,
}

enum class HingeOrientation { VERTICAL, HORIZONTAL }

/** What WindowInfoTracker reported, in window dp. */
data class FoldInfo(
    val orientation: HingeOrientation,
    /** Half open (HALF_OPENED). */
    val halfOpen: Boolean,
    /** The hinge separates the window into two logical areas. */
    val separating: Boolean,
    /** The hinge's start/end along the split axis, in window dp (left/right for vertical, top/bottom for horizontal). */
    val startDp: Float,
    val endDp: Float,
)

enum class Posture { FLAT, BOOK, TABLETOP }

data class LayoutMode(
    val width: WidthClass,
    val nav: NavStyle,
    val panes: Panes,
    val posture: Posture,
    /** Where the first pane ends, in dp from the pane area's start, when the split follows the hinge. Null = an even split. */
    val splitDp: Float? = null,
    /** The gap the hinge occupies between the panes (dp). */
    val gapDp: Float = 0f,
) {
    val twoPane: Boolean get() = panes != Panes.SINGLE
    val compact: Boolean get() = width == WidthClass.COMPACT
}

object Layouts {
    const val COMPACT_MAX = 600f
    const val MEDIUM_MAX = 840f
    const val RAIL_DP = 80f
    /** A pane narrower than this can't hold a task row; fall back to an even split. */
    const val MIN_PANE_DP = 240f
    /** A tabletop half shorter than this can't hold a card; stay in one column. */
    const val MIN_HALF_DP = 200f

    fun widthClass(widthDp: Float): WidthClass = when {
        widthDp < COMPACT_MAX -> WidthClass.COMPACT
        widthDp < MEDIUM_MAX -> WidthClass.MEDIUM
        else -> WidthClass.EXPANDED
    }

    /**
     * @param widthDp, heightDp the window in dp
     * @param fold the hinge, when the display has one inside this window
     * @param topInsetDp the status bar / cutout height above the pane area (for a tabletop split)
     */
    fun of(widthDp: Float, heightDp: Float, fold: FoldInfo?, topInsetDp: Float = 0f): LayoutMode {
        val wc = widthClass(widthDp)
        val nav = if (wc == WidthClass.COMPACT) NavStyle.BAR else NavStyle.RAIL
        val railDp = if (nav == NavStyle.RAIL) RAIL_DP else 0f

        if (fold != null && (fold.halfOpen || fold.separating)) {
            when (fold.orientation) {
                HingeOrientation.VERTICAL -> {
                    val split = fold.startDp - railDp
                    val paneArea = widthDp - railDp
                    val gap = (fold.endDp - fold.startDp).coerceAtLeast(0f)
                    if (split >= MIN_PANE_DP && paneArea - split - gap >= MIN_PANE_DP) {
                        return LayoutMode(wc, nav, Panes.SIDE_BY_SIDE, Posture.BOOK, splitDp = split, gapDp = gap)
                    }
                }
                HingeOrientation.HORIZONTAL -> {
                    val split = fold.startDp - topInsetDp
                    val gap = (fold.endDp - fold.startDp).coerceAtLeast(0f)
                    val below = heightDp - fold.endDp
                    if (fold.halfOpen && split >= MIN_HALF_DP && below >= MIN_HALF_DP) {
                        return LayoutMode(wc, nav, Panes.TOP_BOTTOM, Posture.TABLETOP, splitDp = split, gapDp = gap)
                    }
                }
            }
        }
        val panes = if (wc == WidthClass.COMPACT) Panes.SINGLE else Panes.SIDE_BY_SIDE
        return LayoutMode(wc, nav, panes, Posture.FLAT)
    }

    /**
     * The first pane's size and the gap, in px, for a container that starts at
     * [containerStartPx] and is [containerSizePx] long, given a hinge
     * [hingeStartPx, hingeEndPx) in the same (window) coordinates. Falls back to
     * an even split when the hinge is outside the container or leaves a pane
     * under [minPanePx].
     */
    fun splitPx(containerStartPx: Int, containerSizePx: Int, hingeStartPx: Int?, hingeEndPx: Int?, minPanePx: Int, evenFraction: Float = 0.5f): Pair<Int, Int> {
        val even = (containerSizePx * evenFraction).roundToInt() to 0
        if (hingeStartPx == null || hingeEndPx == null) return even
        val first = hingeStartPx - containerStartPx
        val gap = (hingeEndPx - hingeStartPx).coerceAtLeast(0)
        val second = containerSizePx - first - gap
        if (first < minPanePx || second < minPanePx) return even
        return first to gap
    }
}

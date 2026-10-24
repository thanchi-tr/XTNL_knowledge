package com.xtnl.app.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The app's glyphs: 24-unit line icons with round caps, the same hand as the
 * web's glyph set (1.8 stroke). Tinted by Icon(tint = …).
 */
object Glyphs {
    private fun line(vararg paths: String, width: Float = 1.8f, filled: Set<Int> = emptySet()): ImageVector {
        val b = ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        paths.forEachIndexed { i, d ->
            if (i in filled) {
                b.addPath(pathData = addPathNodes(d), fill = SolidColor(Color.Black))
            } else {
                b.addPath(
                    pathData = addPathNodes(d), stroke = SolidColor(Color.Black), strokeLineWidth = width,
                    strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
                )
            }
        }
        return b.build()
    }

    /** Quick check: a ring with a tick. */
    val Check = line("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M8 12.3l2.7 2.7L16.2 9.4")
    /** Log: a line with a plus. */
    val Log = line("M4 7h10", "M4 12h7", "M4 17h6", "M17 11v8", "M13 15h8")
    /** Review: two stacked cards. */
    val Review = line("M7 6.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z", "M8 3.5h9")
    val More = line("M5 12h.01", "M12 12h.01", "M19 12h.01", width = 3f)
    val Settings = line(
        "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
        "M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 0 1-1.7 1l-.3 2h-4l-.3-2a7.6 7.6 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7.7 7.7 0 0 1 0-3L3.2 9.3l2-3.4 1.9.7a7.6 7.6 0 0 1 1.7-1l.3-2h4l.3 2a7.6 7.6 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7.7 7.7 0 0 1 0 3z",
        width = 1.6f,
    )
    val Globe = line("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M3 12h18", "M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z", width = 1.6f)
    val Phone = line("M6.6 3.5h2.6l1.4 4-1.9 1.3a11 11 0 0 0 6.5 6.5l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z")
    val Message = line("M4 5.5h16v10H9l-5 4z")
    val Mail = line("M3.5 6h17v12h-17z", "M4 6.5l8 6 8-6")
    val Pin = line("M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z", "M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5")
    val Tick = line("M5 12.5l4.5 4.5L19 7.5", width = 2.2f)
    val Undo = line("M9 7L4.5 11.5 9 16", "M5 11.5h9.5a5 5 0 0 1 0 10H12")
    val Send = line("M5 12h13", "M13 6l6 6-6 6", width = 2.2f)
    val Plus = line("M12 5v14", "M5 12h14", width = 2f)
    val Close = line("M6 6l12 12", "M18 6L6 18", width = 2f)
    val Drag = line("M8 7h.01", "M8 12h.01", "M8 17h.01", "M16 7h.01", "M16 12h.01", "M16 17h.01", width = 3f)
    val Up = line("M6 15l6-6 6 6", width = 2f)
    val Down = line("M6 9l6 6 6-6", width = 2f)
    val Back = line("M15 5l-7 7 7 7", width = 2f)
    val Chevron = line("M9 5l7 7-7 7", width = 2f)
    val Refresh = line("M19.5 12a7.5 7.5 0 1 1-2.2-5.3", "M19.5 4.5v4h-4")
    val Clock = line("M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17", "M12 7.5V12l3 2")
    val Offline = line("M3 3l18 18", "M8.5 16.5a5 5 0 0 1 7 0", "M5 13a10 10 0 0 1 4.3-2.5", "M14.7 10.5A10 10 0 0 1 19 13", "M2 9.5a14.5 14.5 0 0 1 4-2.6", "M10.5 5.6A14.6 14.6 0 0 1 22 9.5", "M12 20h.01")
    val Idea = line("M12 3a6 6 0 0 1 3.5 10.9V17h-7v-3.1A6 6 0 0 1 12 3z", "M9.5 20.5h5")
    val Weight = line("M6 5h12l2 15H4z", "M12 9.5l2-2.5", "M9 9a3 3 0 0 1 6 0")
    val Task = line("M5 12.5l3 3 6-7", "M16 9h4", "M16 14h4", width = 1.9f)
    val Info = line("M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17", "M12 11v5", "M12 8h.01", width = 1.8f)
    /** Life XP: a four-point spark. */
    val Spark = line("M12 2.5c.7 5.2 2.3 6.8 7.5 7.5-5.2.7-6.8 2.3-7.5 7.5-.7-5.2-2.3-6.8-7.5-7.5 5.2-.7 6.8-2.3 7.5-7.5z", filled = setOf(0))
    /** Review points: a faceted lozenge. */
    val Lozenge = line("M12 3l6 9-6 9-6-9z", "M6 12h12", "M12 3v18", width = 1.6f)
    /** The streak: a flame. */
    /** A rest token (blueprint P21): the six-armed freeze crystal, the web's held glyph for a freeze. */
    val Freeze = line("M12 3v18", "M4.2 7.5l15.6 9", "M4.2 16.5l15.6-9", "M9.8 4.6L12 6.4l2.2-1.8", "M9.8 19.4L12 17.6l2.2 1.8", width = 1.7f)
    val Flame = line("M12 21c-3.6 0-6-2.4-6-5.6 0-3.7 3.2-5.3 3.9-9.4 2.9 1.6 4.7 4.2 4.9 6.8.7-.6 1.2-1.6 1.3-2.8 1.3 1.4 1.9 3.3 1.9 5.2 0 3.4-2.5 5.8-6 5.8z")
    val Diamond = line("M12 4l7 8-7 8-7-8z", filled = setOf(0))

    /** The Mall (More's row; blueprint P18): the web's bag (the kit's i-bag), what credits are spent on. */
    val Mall = line("M5.5 8.5h13l-1.2 12h-10.6z", "M9 8.5V7a3 3 0 0 1 6 0v1.5")

    /** Status (More's row): a pentagon, one side per attribute. */
    val Status = line("M12 3.5l8.1 5.9-3.1 9.6H7l-3.1-9.6z", "M12 8.5v4l3.4 2.4", "M12 12.5l-3.4 2.4")

    // The track sigils (the web sprite's s-body, s-duty, s-craft, s-care, s-know), for the Status screen's attributes.
    /** Body (Vitality): a triangle. */
    val Body = line("M12 3.5l8.5 15.5h-17z")
    /** Duty: a shield. */
    val Duty = line("M12 3l7 2.8V11c0 4.6-3 8-7 10-4-2-7-5.4-7-10V5.8z")
    /** Craft: a framed square, halved. */
    val Craft = line("M6.5 5h11a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5z", "M5 12h14")
    /** Care: a heart. */
    val Care = line("M12 20s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z")
    /** Knowledge (Intellect): an open book. */
    val Know = line("M12 6.5C9.5 4.8 6.5 4.5 3.5 5.2v13c3-.7 6-.4 8.5 1.3 2.5-1.7 5.5-2 8.5-1.3v-13c-3-.7-6-.4-8.5 1.3z", "M12 6.5v13")
    /** Capital (a reading): the web's task icon "money", a coin with a dollar. */
    val Money = line(
        "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17",
        "M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5",
        "M12 6.5V8", "M12 16v1.5",
    )
}

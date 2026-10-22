package com.xtnl.app.core

import com.xtnl.app.data.Fading

/**
 * The Check screen's "Fading" line (docs/mobile-api.md `fading`; blueprint 3.1a, decision D23): the ideas past their
 * grace, counted as the web's bell counts them ("5 ideas fading"), how many are already losing levels, and the Domains
 * they sit in. Each card keeps its own forgetting curve, and nothing fades within 72 hours of falling due. Every one of
 * them is due, so the line opens Review. It shows only while something is past grace.
 */
object FadingLine {
    const val TITLE = "Fading"

    /** Domain names shown before "+n more". */
    const val NAMES_MAX = 2

    /** Whether the line shows: something past grace (none, or an older server without `fading`: no line). */
    fun shows(f: Fading?): Boolean = f != null && f.ideas > 0

    /** The bell's own words, then what is already going: "5 ideas fading · 2 losing levels". */
    fun headline(f: Fading): String {
        val count = if (f.ideas == 1) "1 idea fading" else "${f.ideas} ideas fading"
        return if (f.forgetting > 0) "$count · ${f.forgetting} losing levels" else count
    }

    /** Where they sit, most first: "Probability, Algebra +1 more" (empty with no Domain). */
    fun places(f: Fading): String {
        if (f.domains.isEmpty()) return ""
        val names = f.domains.take(NAMES_MAX).joinToString(", ") { it.name }
        val more = f.domains.size - NAMES_MAX
        return if (more > 0) "$names +$more more" else names
    }

    /** The line in words, for TalkBack: "Fading: 5 ideas fading · 2 losing levels, in Probability, Algebra +1 more". */
    fun description(f: Fading): String {
        val where = places(f)
        return "$TITLE: ${headline(f)}" + if (where.isNotEmpty()) ", in $where" else ""
    }
}

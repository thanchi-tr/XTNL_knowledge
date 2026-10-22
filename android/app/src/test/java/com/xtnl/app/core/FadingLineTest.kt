package com.xtnl.app.core

import com.xtnl.app.data.Fading
import com.xtnl.app.data.FadingDomain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Check screen's "Fading" line (D23): the bell's count, how many are losing levels, and where the ideas sit. */
class FadingLineTest {
    private val three = Fading(
        ideas = 6, forgetting = 2,
        domains = listOf(FadingDomain("d1", "Probability", 3), FadingDomain("d2", "Algebra", 2), FadingDomain("d3", "Optics", 1)),
    )

    @Test fun itNamesTwoDomainsAndCountsTheRest() {
        assertEquals("6 ideas fading · 2 losing levels", FadingLine.headline(three))
        assertEquals("Probability, Algebra +1 more", FadingLine.places(three))
        assertEquals("Fading: 6 ideas fading · 2 losing levels, in Probability, Algebra +1 more", FadingLine.description(three))
    }

    @Test fun oneIdeaFadingNoneLosingLevels() {
        val one = Fading(ideas = 1, forgetting = 0, domains = listOf(FadingDomain("d1", "Probability", 1)))
        assertEquals("1 idea fading", FadingLine.headline(one))
        assertEquals("Probability", FadingLine.places(one))
        assertEquals("Fading: 1 idea fading, in Probability", FadingLine.description(one))
        assertEquals("Fading: 1 idea fading", FadingLine.description(one.copy(domains = emptyList())))
    }

    @Test fun itShowsOnlyWhileSomethingIsPastGrace() {
        assertTrue(FadingLine.shows(three))
        assertFalse(FadingLine.shows(Fading()))
        // An older server sends no `fading`: no line.
        assertFalse(FadingLine.shows(null))
    }
}

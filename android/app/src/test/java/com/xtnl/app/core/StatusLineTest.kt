package com.xtnl.app.core

import com.xtnl.app.data.CapitalReading
import com.xtnl.app.data.StatusAttribute
import com.xtnl.app.data.StatusPanel
import com.xtnl.app.data.StatusSkill
import com.xtnl.app.data.StatusTarget
import com.xtnl.app.data.TickSkill
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Status screen's words (docs/mobile-api.md `GET /status`; blueprint P1, D1 and D2): the web card's, never a level of its own. */
class StatusLineTest {
    private val body = StatusAttribute(
        "VITALITY", "Vitality", "Body", 6, 0.311, 0.25, cap = 9, keptStreak = 4,
        weeks = listOf("kept", "held", "missed"), line = "1,960 / 2,401 XP · depth cap 9 · 7 more kept weeks raise it", unit = "xp",
    )
    private val duty = StatusAttribute("DUTY", "Duty", "Duty", 7, 1.0, 1.0, cap = 7, atCap = true, keptStreak = 1, weeks = listOf("kept"), line = "Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked")
    private val intellect = StatusAttribute("INTELLECT", "Intellect", "Knowledge", 17, 0.52, 0.44, line = "6 Fields, the best counts fully", unit = "pts")

    @Test fun theTrackNameStaysWithTheBlueprintsWordBesideIt() {
        assertEquals("Body · Vitality", StatusLine.heading(body))
        assertEquals("Knowledge · Intellect", StatusLine.heading(intellect))
        assertEquals("Duty", StatusLine.heading(duty))
        assertEquals("Vitality", StatusLine.sub(body))
        assertNull(StatusLine.sub(duty))
        assertEquals(listOf("VITALITY", "INTELLECT", "CRAFT", "DUTY", "CARE"), StatusLine.KEYS)
    }

    @Test fun theMeterSaysWhatTheWebSays() {
        assertEquals(31, StatusLine.percent(body))
        assertEquals("31% to level 7", StatusLine.meterText(body))
        // Floored and never 100 below the next level (the web TrackRow's rule).
        assertEquals(99, StatusLine.percent(body.copy(progress = 0.9999)))
        assertEquals("capped at level 7", StatusLine.meterText(duty))
        val (banked, now) = StatusLine.meter(body)
        assertEquals(0.25f, banked, 1e-6f)
        assertEquals(0.311f, now, 1e-6f)
        // Capped: the meter is full; banked never above now.
        assertEquals(1f, StatusLine.meter(duty).second, 0f)
        assertEquals(0.2f, StatusLine.meter(body.copy(progress = 0.2, banked = 0.6)).first, 1e-6f)
    }

    @Test fun oneNodeForTalkBack() {
        assertEquals(
            "Body (Vitality), level 6, 31% to level 7. 1,960 / 2,401 XP · depth cap 9 · 7 more kept weeks raise it. Last 3 judged weeks: kept, held, not kept.",
            StatusLine.description(body),
        )
        assertEquals("Knowledge (Intellect), level 17, 52% to level 18. 6 Fields, the best counts fully.", StatusLine.description(intellect))
        assertTrue(StatusLine.description(duty).startsWith("Duty, level 7, capped at level 7."))
        assertTrue(StatusLine.description(duty).endsWith("Last 1 judged week: kept."))
    }

    @Test fun theAsideFollowsWhatCounts() {
        assertEquals(StatusLine.ASIDE, StatusLine.aside(StatusPanel(launched = true, attributes = listOf(body, intellect, duty))))
        // Before life counts: Intellect alone, and nothing promises tracks.
        val before = StatusPanel(launched = false, attributes = listOf(intellect))
        assertEquals("from your Fields", StatusLine.aside(before))
        assertFalse(StatusLine.aside(before).contains("kept weeks"))
    }

    /** P2 (D6): the five axes are Attributes on the phone as on the web's card; nothing calls the screen Status or Skills. */
    @Test fun theScreenIsTitledAttributes() {
        assertEquals("Attributes", StatusLine.TITLE)
        assertEquals("Reading your attributes…", StatusLine.LOADING)
        assertEquals("Couldn't read your attributes.", StatusLine.FAILED)
        assertTrue(StatusLine.MORE_SUB.startsWith("Vitality, Intellect, Craft, Duty and Care"))
        for (words in listOf(StatusLine.TITLE, StatusLine.LOADING, StatusLine.FAILED, StatusLine.MORE_SUB) + StatusLine.ABOUT) {
            assertFalse(words, Regex("\\b([Ss]tatus|[Tt]raits?)\\b").containsMatchIn(words))
        }
        // P5: "skills" is the named competencies' word now (the screen's Skills card), so the More row names them; the
        // screen itself is still never titled Skills (the emblems' old word).
        assertTrue(StatusLine.MORE_SUB.contains("targets and skills"))
        for (words in listOf(StatusLine.TITLE, StatusLine.LOADING, StatusLine.FAILED) + StatusLine.ABOUT) {
            assertFalse(words, Regex("\\b[Ss]kills?\\b").containsMatchIn(words))
        }
    }

    @Test fun capitalIsAReadingOnly() {
        val c = CapitalReading("2026-10", "October 2026", 1_240_000, "\$12,400", 1, line = "1 deal won in October", history = "September \$8,200 · August \$0")
        assertEquals("Capital · reading only", StatusLine.capitalHeading())
        assertEquals("Capital, a reading only: \$12,400 won in October 2026. 1 deal won in October. September \$8,200 · August \$0.", StatusLine.capitalDescription(c))
        assertFalse(StatusLine.capitalDescription(c).contains("level"))
        assertTrue(StatusLine.ABOUT.any { it.contains("pays no XP and has no level") })
    }

    // ── P4: the avatar targets ──────────────────────────────────────────────

    private fun target(id: String, attribute: String, line: String) = StatusTarget(id = id, attribute = attribute, label = id, line = line)
    private val weight = target("weight", "VITALITY", "Weight 82.4 → 75 kg · 38% of the way · on pace")
    private val stats = target("t-stats", "INTELLECT", "Statistics level 9.4 → 12 · 35% of the way · on pace")
    private val revenue = target("t-rev", "CAPITAL", "Revenue \$12,400 → \$20,000 a month · 35% of the way")

    @Test fun eachAttributeTakesItsOwnTargetsAndCapitalItsOwn() {
        val p = StatusPanel(launched = true, attributes = listOf(body, intellect, duty), targets = listOf(weight, stats, revenue))
        assertEquals(listOf("weight"), StatusLine.targetsFor(p, "VITALITY").map { it.id })
        assertEquals(listOf("t-stats"), StatusLine.targetsFor(p, "INTELLECT").map { it.id })
        assertTrue(StatusLine.targetsFor(p, "DUTY").isEmpty())
        assertEquals(listOf("t-rev"), StatusLine.capitalTargets(p).map { it.id })
        assertTrue(StatusLine.unplaced(p).isEmpty())
    }

    @Test fun aTracksTargetBeforeLifeCountsIsKeptApartNeverDropped() {
        val p = StatusPanel(launched = false, attributes = listOf(intellect), targets = listOf(weight, stats, revenue))
        assertEquals(listOf("weight"), StatusLine.unplaced(p).map { it.id })
        assertEquals("Vitality · Weight 82.4 → 75 kg · 38% of the way · on pace", StatusLine.namedLine(weight))
        assertEquals(listOf("t-rev"), StatusLine.capitalTargets(p).map { it.id })
    }

    // ── P5: the skills ──────────────────────────────────────────────────────

    private val writing = StatusSkill(
        "sk1", "Writing", "CRAFT", "PRACTICE", null, 142.5, 2, 100, 500, 0.106, 357.5,
        "≈ 142 h (task estimates, not timed)", "Tier 2 · 100–500 h · 357 h to Tier 3", 171, 3, 0, 2,
    )
    private val walking = StatusSkill("sk2", "Walking", "VITALITY", "EXERCISE", hours = 12.5, progress = 0.125, line = "12.5 h of walks", tierLine = "Tier 1 · 0–100 h · 87.5 h to Tier 2", walks = 9)

    @Test fun eachRowCountsItsSkills() {
        assertNull(StatusLine.skillCount(body))
        assertEquals("1 skill", StatusLine.skillCount(body.copy(skills = 1)))
        assertEquals("2 skills", StatusLine.skillCount(body.copy(skills = 2)))
    }

    @Test fun aSkillSaysWhatTheWebSays() {
        assertEquals("T2", StatusLine.tierBadge(writing))
        assertEquals("Craft", StatusLine.skillSub(writing))
        assertEquals("Vitality · walks count", StatusLine.skillSub(walking))
        assertEquals("Intellect · Economics", StatusLine.skillSub(writing.copy(attribute = "INTELLECT", fieldName = "Economics")))
        assertEquals(10, StatusLine.tierPercent(writing))
        // Floored, and never 100 below the next tier.
        assertEquals(99, StatusLine.tierPercent(writing.copy(progress = 0.9999)))
        assertEquals(
            "Writing, Craft, tier 2, 10% through it. ≈ 142 h (task estimates, not timed). Tier 2 · 100–500 h · 357 h to Tier 3.",
            StatusLine.skillDescription(writing),
        )
        assertTrue(StatusLine.SKILLS_NOTE.contains("pays no XP or MP"))
    }

    @Test fun aTicksLineCarriesItsSkill() {
        val reading = TickSkill("sk-read", "Reading", 99.9, 1, false, "≈ 99.9 h (task estimates, not timed)")
        assertEquals("+4.1 XP · Care · Reading ≈ 99.9 h", StatusLine.tickLine("+4.1 XP · Care", reading))
        assertEquals("+4.1 XP · Care · Reading reached Tier 2", StatusLine.tickLine("+4.1 XP · Care", reading.copy(hoursAfter = 100.2, tier = 2, tierUp = true)))
        assertEquals("+4.1 XP · Care", StatusLine.tickLine("+4.1 XP · Care", null))
        assertEquals("Already recorded. Nothing is paid twice.", StatusLine.tickLine("Already recorded. Nothing is paid twice.", reading))
        assertEquals("Walking 12.5 h of walks", StatusLine.tickLine(null, TickSkill("sk2", "Walking", 12.5, 1, false, "12.5 h of walks")))
    }

    @Test fun unreadTargetsShowNoneAndTalkBackReadsTheLines() {
        val p = StatusPanel(launched = true, attributes = listOf(body), targets = null)
        assertTrue(StatusLine.targetsFor(p, "VITALITY").isEmpty() && StatusLine.unplaced(p).isEmpty() && StatusLine.capitalTargets(p).isEmpty())
        assertEquals("", StatusLine.targetsDescription(emptyList()))
        assertEquals(" Target: ${weight.line}.", StatusLine.targetsDescription(listOf(weight)))
        assertTrue(StatusLine.ABOUT.last().contains("pay nothing"))
    }
}

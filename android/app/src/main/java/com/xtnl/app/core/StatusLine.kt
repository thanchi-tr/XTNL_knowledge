package com.xtnl.app.core

import com.xtnl.app.data.CapitalReading
import com.xtnl.app.data.StatusAttribute
import com.xtnl.app.data.StatusPanel
import com.xtnl.app.data.StatusSkill
import com.xtnl.app.data.StatusTarget
import com.xtnl.app.data.TickSkill
import kotlin.math.floor

/**
 * The Status screen's words (docs/mobile-api.md `GET /status`; blueprint 1.1, decisions D1 and D2): the web's /you
 * Status card in the same words. Five attributes, each its source's own figures from the server (never a level worked
 * out here): Vitality is the Body track, Intellect is Knowledge, Craft, Duty and Care their tracks. The track names stay
 * (Body, Duty, Craft, Care) with the blueprint's word beside them where it differs ("Body · Vitality"). Capital is a
 * reading only: AUD won from won deals, with no level and no XP. Before life counts, Intellect stands alone and no
 * track level is claimed. Titled "Attributes" since blueprint P2 (D6: the five axes are Attributes, the web radar's 13
 * are Traits); the code keeps the Status names (GET /status, MoreRoute.STATUS, xtnl://app/status).
 *
 * Avatar targets (blueprint P4, decisions D3 and D4): each attribute's targets under its row, one line each in the web's
 * own words ("Weight 82.4 → 75 kg · 38% of the way · on pace"); Capital's with the Capital card (shown for them even in
 * a quarter with no deal won); a track's target before life counts, with no row yet, in a card of its own. Read only:
 * they are set on the web, and pay nothing.
 *
 * Skills (blueprint P5, decisions D7 to D9): each attribute's live skills counted under its row ("2 skills"), and a
 * Skills card listing them by hours, each its tier badge, the meter through the tier and the web's own lines ("≈ 142 h
 * (task estimates, not timed)", "Tier 2 · 100–500 h · 357 h to Tier 3"). Named and linked on the web; a tier pays
 * nothing. A tick's skill joins the tick's line on Check ("… · Reading ≈ 99.9 h", or "… · Reading reached Tier 2").
 */
object StatusLine {
    const val TITLE = "Attributes"
    /** While the first read is out, and when it failed with nothing read before. */
    const val LOADING = "Reading your attributes…"
    const val FAILED = "Couldn't read your attributes."
    /** More's row under the title: what the screen holds. */
    const val MORE_SUB = "Vitality, Intellect, Craft, Duty and Care, with targets and skills, and Capital's reading"
    /** The card's aside with the tracks in, and with Intellect alone (the web's own). */
    const val ASIDE = "levels capped by kept weeks and paid goals"
    const val ASIDE_FIELDS = "from your Fields"
    const val CAPITAL = "Capital"
    const val CAPITAL_SUB = "reading only"
    /** The second pane's note: what the five are and what Capital is not. */
    const val ABOUT_TITLE = "How these read"
    val ABOUT: List<String> = listOf(
        "Vitality is your Body track and Intellect is Knowledge, the level of your Fields. Craft, Duty and Care are their own tracks.",
        "A track's level rises with its XP, up to the cap its kept weeks and paid goals set.",
        "Capital is a reading of the deals you won. It pays no XP and has no level.",
        "Targets are your desired self in numbers, set on the web. They pay nothing and move no level.",
    )

    /** Capital's line beside its targets in a quarter with no deal won. */
    const val CAPITAL_NONE = "No deal won in the last three months"
    /** The card of targets whose attribute has no row yet. */
    const val UNPLACED = "Targets"
    const val UNPLACED_SUB = "until life counts"

    /** The blueprint's word for a target's attribute (the five and Capital). */
    private val ATTRIBUTE_NAME = mapOf("VITALITY" to "Vitality", "INTELLECT" to "Intellect", "CRAFT" to "Craft", "DUTY" to "Duty", "CARE" to "Care", "CAPITAL" to CAPITAL)

    /** The five keys, in the panel's order. */
    val KEYS = listOf("VITALITY", "INTELLECT", "CRAFT", "DUTY", "CARE")

    /** The card's aside: how a level is held once the tracks are in; where Intellect comes from before. */
    fun aside(p: StatusPanel): String = if (p.attributes.size > 1) ASIDE else ASIDE_FIELDS

    /** "Body · Vitality"; just "Craft" where the blueprint's word is the track's own. */
    fun heading(a: StatusAttribute): String = if (sub(a) != null) "${a.name} · ${a.attribute}" else a.name

    /** The blueprint's word beside the name, where it differs ("Vitality"); null where it is the same. */
    fun sub(a: StatusAttribute): String? = a.attribute.takeIf { it.isNotBlank() && it != a.name }

    /** The meter's share as the web's TrackRow says it: floored, never 100 below the next level. */
    fun percent(a: StatusAttribute): Int = floor(a.progress.coerceIn(0.0, 0.999) * 100).toInt()

    /** "31% to level 7", or "capped at level 7" while the XP waits at the cap (the web meter's value text). */
    fun meterText(a: StatusAttribute): String = if (a.atCap) "capped at level ${a.level}" else "${percent(a)}% to level ${a.level + 1}"

    /** The pips' words, oldest first: "kept", "held", "not kept" (the web's). */
    fun pipWords(a: StatusAttribute): List<String> = a.weeks.map { if (it == "missed") "not kept" else it }

    /** One node for TalkBack: "Body (Vitality), level 6, 31% to level 7. <line>. Last 8 judged weeks: kept, …". */
    fun description(a: StatusAttribute): String {
        val named = sub(a)?.let { "${a.name} ($it)" } ?: a.name
        val weeks = pipWords(a)
        val pips = if (weeks.isEmpty()) "" else " Last ${weeks.size} judged ${if (weeks.size == 1) "week" else "weeks"}: ${weeks.joinToString(", ")}."
        return "$named, level ${a.level}, ${meterText(a)}. ${a.line}.$pips"
    }

    /** The banked part and this week's gain on the meter, each 0..1 (the gain never below the banked part). */
    fun meter(a: StatusAttribute): Pair<Float, Float> {
        val now = if (a.atCap) 1f else a.progress.toFloat().coerceIn(0f, 1f)
        return a.banked.toFloat().coerceIn(0f, now) to now
    }

    /** An attribute's targets (P4), in the server's order; none when they couldn't be read. */
    fun targetsFor(p: StatusPanel, key: String): List<StatusTarget> = p.targets.orEmpty().filter { it.attribute == key }

    /** Capital's targets, shown with the Capital card. */
    fun capitalTargets(p: StatusPanel): List<StatusTarget> = targetsFor(p, "CAPITAL")

    /** The targets whose attribute has no row shown (a track's, before life counts): shown apart, never dropped. */
    fun unplaced(p: StatusPanel): List<StatusTarget> {
        val shown = p.attributes.map { it.key }.toSet()
        return p.targets.orEmpty().filter { it.attribute != "CAPITAL" && it.attribute !in shown }
    }

    /** "Vitality · Weight 82.4 → 75 kg · …": a target's line where the row is not its attribute's own. */
    fun namedLine(t: StatusTarget): String = "${ATTRIBUTE_NAME[t.attribute] ?: t.attribute} · ${t.line}"

    /** What TalkBack adds to a row for its targets: " Targets: <line>; <line>." (nothing with none). */
    fun targetsDescription(targets: List<StatusTarget>): String =
        if (targets.isEmpty()) "" else " ${if (targets.size == 1) "Target" else "Targets"}: ${targets.joinToString("; ") { it.line }}."

    /** "Capital · reading only". */
    fun capitalHeading(): String = "$CAPITAL · $CAPITAL_SUB"

    /** One node for TalkBack: "Capital, a reading only: $12,400 won in October 2026. 1 deal won in October. …". */
    fun capitalDescription(c: CapitalReading): String =
        "$CAPITAL, a reading only: ${c.won} won in ${c.label}. ${c.line}." + if (c.history.isNotBlank()) " ${c.history}." else ""

    // ── P5: the skills ──────────────────────────────────────────────────────

    /** The Skills card's title and aside (the web page's). */
    const val SKILLS = "Skills"
    const val SKILLS_ASIDE = "by hours · a tier pays nothing"
    /** With none: where they are named. */
    const val SKILLS_NONE = "No skills yet. Name one on the web (You › Skills) and link the tasks you tick for it."
    /** The card's closing note: where the hours come from, and what a tier is. */
    const val SKILLS_NOTE = "Hours come from the minutes of the ticks linked to a skill. A tier-up is a Seal: it pays no XP or MP."

    /** "2 skills" under an attribute's line (the web row's count); null with none. */
    fun skillCount(a: StatusAttribute): String? = when {
        a.skills <= 0 -> null
        a.skills == 1 -> "1 skill"
        else -> "${a.skills} skills"
    }

    /** A skill's tier badge: "T2". */
    fun tierBadge(s: StatusSkill): String = "T${s.tier}"

    /** Under the name: its attribute, "walks count" for an exercise skill, an Intellect skill's Field ("Vitality · walks count"). */
    fun skillSub(s: StatusSkill): String =
        listOfNotNull(ATTRIBUTE_NAME[s.attribute] ?: s.attribute, if (s.kind == "EXERCISE") "walks count" else null, s.fieldName).joinToString(" · ")

    /** The share through the tier, floored (never 100 below the next tier, as the web's meter says it). */
    fun tierPercent(s: StatusSkill): Int = floor(s.progress.coerceIn(0.0, 0.999) * 100).toInt()

    /** One node for TalkBack: "Writing, Craft, tier 2, 10% through it. ≈ 142 h (task estimates, not timed). Tier 2 · …." */
    fun skillDescription(s: StatusSkill): String = "${s.name}, ${skillSub(s)}, tier ${s.tier}, ${tierPercent(s)}% through it. ${s.line}. ${s.tierLine}."

    /**
     * The tick's line with the skill it fed (P5): "+4.1 XP · Care · Reading ≈ 99.9 h"; a tier crossed by this tick:
     * "… · Reading reached Tier 2". Unchanged with no skill (and for a tick already recorded).
     */
    fun tickLine(line: String?, skill: TickSkill?): String? {
        if (skill == null || line?.startsWith("Already recorded") == true) return line
        val part = if (skill.tierUp) "${skill.name} reached Tier ${skill.tier}" else "${skill.name} ${skill.line.substringBefore(" (")}"
        return if (line.isNullOrBlank()) part else "$line · $part"
    }
}

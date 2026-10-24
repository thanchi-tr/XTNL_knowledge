package com.xtnl.app.core

import com.xtnl.app.data.TickKnee
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * What a tick's answer says on Check besides its line (docs/mobile-api.md `/tasks/complete`; blueprint P7, decisions D26
 * and D34): the moments it played and the knee note, in the tick's one snackbar, under its line (one snackbar at a time,
 * so its Undo stays).
 *
 *   Moments: the server's Seals and Ascensions (tier 2 and 3: a streak milestone, a habit rung, a finished goal …), by
 *   their titles, as the web's presentAll shows them. It skips tiers 0 and 1, the tick's own mark and the chimes (Board
 *   clear is Check's own moment). A skill's tier Seal is left out: the line already names it (StatusLine.tickLine).
 *
 *   The knee (P7, 3.3a): the server sends it once the day the tick booked on is past 200 raw, its own words. It is said
 *   once per life day and stage (past half rate, then the day's cap), so a run of ticks past 200 doesn't repeat it; the
 *   cap, or the next day, says it again. It is a reading, never a charge: the tick's xp already carries the knee.
 *
 *   The demo builds the knee as the server does (mobile-api.ts tickKneeOf, life-grade kneeG): [knee] and [kneePay].
 */
object TickNote {
    /** The kinds the tick's line already says (a skill's tier: StatusLine.tickLine). */
    private val SAID = setOf("competency-tier")

    /** The Seals' and Ascensions' titles among a tick's [list] of moments, in order, each once. */
    fun moments(list: List<JsonElement>): List<String> = list.mapNotNull { el ->
        val o = el as? JsonObject ?: return@mapNotNull null
        val tier = (o["tier"] as? JsonPrimitive)?.intOrNull ?: 0
        val kind = (o["kind"] as? JsonPrimitive)?.contentOrNull
        val title = (o["title"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
        if (tier < 2 || kind in SAID) null else title
    }.distinct()

    /** The knee note's key, "2026-10-21:half" or "2026-10-21:cap": said once each a life day. */
    fun kneeKey(k: TickKnee): String = "${k.day.orEmpty()}:${if (k.capped) "cap" else "half"}"

    /** The snackbar's message: the tick's [line], its [moments] under it (" · " between), then the [knee] line when said. */
    fun message(line: String, moments: List<String>, knee: String?): String =
        listOfNotNull(line, moments.takeIf { it.isNotEmpty() }?.joinToString(" · "), knee?.takeIf { it.isNotBlank() }).joinToString("\n")

    // ── The knee, as the server builds it (for the demo) ────────────────────

    /** life-grade's knee: full rate to 100 raw a day, logarithmic above, flat at 300 XP. */
    const val FULL_RATE = 100.0
    const val SCALE = 100.0
    const val CAP = 300.0

    /** Past this the tick's answer carries `knee` (mobile-api.ts KNEE_NOTE_FROM_RAW: FULL_RATE + SCALE, the half-rate point). */
    const val NOTE_FROM_RAW = FULL_RATE + SCALE

    /** The raw total at which the day's pay stops (life-grade KNEE_CAP_AT_RAW, ≈ 739). */
    val CAP_AT_RAW: Double = FULL_RATE + SCALE * (Math.exp((CAP - FULL_RATE) / SCALE) - 1)

    /** g(R) (life-grade kneeG). */
    fun kneeG(r: Double): Double {
        val x = max(0.0, r)
        return if (x <= FULL_RATE) x else min(CAP, FULL_RATE + SCALE * ln(1 + (x - FULL_RATE) / SCALE))
    }

    /** What a tick of [raw] pays on a day already at [before] raw (life-grade kneePay). */
    fun kneePay(before: Double, raw: Double): Double = kneeG(before + raw) - kneeG(before)

    /**
     * The tick's `knee` (mobile-api.ts tickKneeOf): null unless the day's raw after it ([before] + [raw]) is past
     * [NOTE_FROM_RAW]; [day] the life day it booked on, [yesterday] whether that is yesterday (the line's word).
     */
    fun knee(before: Double, raw: Double, day: String?, yesterday: Boolean): TickKnee? {
        val r = max(0.0, before) + max(0.0, raw)
        if (r <= NOTE_FROM_RAW) return null
        val capped = r >= CAP_AT_RAW
        val rate = if (capped) 0.0 else floor(SCALE / (SCALE + r - FULL_RATE) * 100) / 100
        val cap = CAP.toInt()
        val whenWord = if (yesterday) "yesterday" else "today"
        val line = if (capped) {
            "Fatigue breaker: $whenWord reached the day's cap of $cap XP. Ticks still count; they add no more XP ${if (yesterday) "to yesterday" else "today"}."
        } else {
            "Fatigue breaker: past ${NOTE_FROM_RAW.toInt()} raw $whenWord, so a tick now pays ×${"%.2f".format(java.util.Locale.ROOT, rate)} or less. The day stops at $cap XP."
        }
        return TickKnee(day = day, raw = (r * 10).roundToLong() / 10.0, rate = rate, capped = capped, line = line)
    }
}

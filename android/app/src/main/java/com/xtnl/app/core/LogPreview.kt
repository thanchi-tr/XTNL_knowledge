package com.xtnl.app.core

import java.util.Locale

/** The quick line's section, as the capture sheet's section chips: Task · Weigh-in · Idea. */
enum class LogSection(val wire: String, val label: String) {
    TASK("task", "Task"),
    WEIGHT("weight", "Weigh-in"),
    IDEA("idea", "Idea");

    companion object {
        fun of(s: String?): LogSection = entries.firstOrNull { it.wire == s?.lowercase(Locale.ROOT) } ?: TASK
    }
}

/**
 * A one-line preview of how the server will read a quick line, drawn on every
 * keystroke. It reads the common part of the capture grammar (capture-parse.ts)
 * so the preview is usually right; the server parses the same raw text again
 * and only its reading is stored (the "Added" line comes from the server).
 *
 *   "gym legs 60m every mon,thu !" → Gym legs · Mon, Thu · 60 min · Must
 */
object LogPreview {
    enum class Kind { TITLE, SCHEDULE, DATE, TIME, DURATION, MUST, WEIGHT, NOTE }

    data class Token(val kind: Kind, val text: String)

    data class Reading(val title: String, val tokens: List<Token>, val line: String, val ok: Boolean)

    private val DAYS = linkedMapOf(
        "monday" to 1, "mon" to 1, "tuesday" to 2, "tues" to 2, "tue" to 2, "wednesday" to 3, "weds" to 3, "wed" to 3,
        "thursday" to 4, "thurs" to 4, "thur" to 4, "thu" to 4, "friday" to 5, "fri" to 5,
        "saturday" to 6, "sat" to 6, "sunday" to 7, "sun" to 7,
    )
    private val DAY_SHORT = arrayOf("", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    private val WEAK = setOf("sat", "sun")
    private const val DAY_ALT = "monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun"

    /** The server's limit for a quick line, the start it adds included (docs/mobile-api.md, POST /log). */
    const val MAX_LINE = 500
    private const val IDEA_START = "idea: "
    private val IDEA_PREFIX = Regex("""^\s*(?:idea|i)\s*:""", RegexOption.IGNORE_CASE)

    /**
     * How long [text] may be in [section]: the Idea section's line goes out as
     * "idea: …" unless it already starts so (capture-parse's IDEA_PREFIX), and
     * the server counts that start. (A weigh-in is short, so its "weight " never matters.)
     */
    fun maxLine(text: String, section: LogSection): Int =
        if (section == LogSection.IDEA && !IDEA_PREFIX.containsMatchIn(text)) MAX_LINE - IDEA_START.length else MAX_LINE

    fun read(raw: String, section: LogSection): Reading = when (section) {
        LogSection.TASK -> task(raw)
        LogSection.WEIGHT -> weight(raw)
        LogSection.IDEA -> idea(raw)
    }

    // ── Weigh-in ────────────────────────────────────────────────────────────

    private val WEIGHT_RE = Regex("""(?<![\d.])(\d{2,3}(?:[.,]\d{1,2})?)\s*(kg|kgs|kilo|kilos|lb|lbs|pound|pounds)?\b""", RegexOption.IGNORE_CASE)

    /** A weigh-in: "72.4", "72.4 kg", "160 lb", "72.1 yesterday". A bare number is in the user's own unit. */
    fun weight(raw: String): Reading {
        val line = raw.trim().removePrefix("weight").trim()
        val m = WEIGHT_RE.find(line)
        val v = m?.groupValues?.get(1)?.replace(',', '.')?.toDoubleOrNull()
        val unit = m?.groupValues?.get(2)?.takeIf { it.isNotEmpty() }?.lowercase()?.let { if (it.startsWith("l") || it.startsWith("p")) "lb" else "kg" }
        val plausible = v != null && when (unit) { "lb" -> v in 40.0..900.0; else -> v in 20.0..900.0 }
        if (m == null || v == null || !plausible) {
            return Reading("Weigh-in", emptyList(), "Weigh-in · type your weight, e.g. 72.4 or 160 lb", ok = false)
        }
        val shown = (if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()) + (unit?.let { " $it" } ?: "")
        val note = line.removeRange(m.range).trim().trim(',', '·', '-').trim()
        val tokens = buildList {
            add(Token(Kind.WEIGHT, shown))
            if (note.isNotEmpty()) add(Token(Kind.NOTE, note))
        }
        return Reading("Weigh-in", tokens, "Weigh-in · $shown" + if (note.isNotEmpty()) " · $note" else "", ok = true)
    }

    // ── Idea ────────────────────────────────────────────────────────────────

    fun idea(raw: String): Reading {
        val t = raw.trim().removePrefix("idea:").trim()
        if (t.isEmpty()) return Reading("Idea", emptyList(), "Idea draft · write the thought, finish it in New idea", ok = false)
        val shown = if (t.length > 60) t.take(57) + "…" else t
        return Reading(cap(t), listOf(Token(Kind.TITLE, cap(shown))), "Idea draft · ${cap(shown)}", ok = true)
    }

    // ── Task ────────────────────────────────────────────────────────────────

    private class Line(var text: String) {
        val tokens = mutableListOf<Token>()
        /** Cuts [range] out of the line (so later rules can't read it again) and keeps a token. */
        fun claim(range: IntRange, token: Token) {
            text = text.replaceRange(range, " ".repeat(range.last - range.first + 1))
            tokens += token
        }
    }

    fun task(raw: String): Reading {
        val line = Line(" " + raw.trim() + " ")
        var must = false

        // "!" (or "!!") standing alone: compulsory.
        Regex("""(?<=\s)!{1,3}(?=\s)""").find(line.text)?.let { line.claim(it.range, Token(Kind.MUST, "Must")); must = true }

        // Recurrence: every day / daily / weekdays / every mon,thu / every other day.
        Regex("""\b(every\s*day|daily|each\s*day)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let {
            line.claim(it.range, Token(Kind.SCHEDULE, "Every day"))
        } ?: Regex("""\b(every\s+weekday|weekdays)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let {
            line.claim(it.range, Token(Kind.SCHEDULE, "Weekdays"))
        } ?: Regex("""\bevery\s+other\s+day\b""", RegexOption.IGNORE_CASE).find(line.text)?.let {
            line.claim(it.range, Token(Kind.SCHEDULE, "Every 2 days"))
        } ?: Regex("""\b(?:every|each|on)\s+((?:$DAY_ALT)s?(?:\s*(?:,|&|and|\+|/)\s*(?:$DAY_ALT)s?)*)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let { m ->
            val every = m.value.trim().lowercase(Locale.ROOT).startsWith("every") || m.value.trim().lowercase(Locale.ROOT).startsWith("each")
            val days = Regex(DAY_ALT, RegexOption.IGNORE_CASE).findAll(m.groupValues[1]).mapNotNull { DAYS[it.value.lowercase(Locale.ROOT)] }.distinct().sorted().toList()
            if (days.isNotEmpty()) {
                val words = days.joinToString(", ") { DAY_SHORT[it] }
                if (every || days.size > 1) line.claim(m.range, Token(Kind.SCHEDULE, words))
                else line.claim(m.range, Token(Kind.DATE, words))
            }
        }
        // Plural days: "mondays and thursdays".
        if (line.tokens.none { it.kind == Kind.SCHEDULE }) {
            Regex("""\b(mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b""", RegexOption.IGNORE_CASE).findAll(line.text).toList().takeIf { it.isNotEmpty() }?.let { ms ->
                val days = ms.mapNotNull { DAYS[it.value.lowercase(Locale.ROOT).removeSuffix("s")] }.distinct().sorted()
                ms.reversed().forEach { line.text = line.text.replaceRange(it.range, " ".repeat(it.value.length)) }
                line.tokens += Token(Kind.SCHEDULE, days.joinToString(", ") { DAY_SHORT[it] })
            }
        }

        // Deadline: "by fri", "by tomorrow".
        Regex("""\bby\s+(today|tonight|tomorrow|tmrw|tmr|$DAY_ALT)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let { m ->
            line.claim(m.range, Token(Kind.DATE, "By " + dayWord(m.groupValues[1])))
        }
        // A day: today, tonight, tomorrow, or a weekday (sat/sun only closing or opening the line).
        if (line.tokens.none { it.kind == Kind.DATE || it.kind == Kind.SCHEDULE }) {
            Regex("""\b(today|tonight|tomorrow|tomorow|tmrw|tmr)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let { m ->
                line.claim(m.range, Token(Kind.DATE, dayWord(m.groupValues[1])))
            } ?: Regex("""\b($DAY_ALT)\b""", RegexOption.IGNORE_CASE).findAll(line.text).firstOrNull { m ->
                val w = m.value.lowercase(Locale.ROOT)
                w !in WEAK || line.text.substring(m.range.last + 1).isBlank() || line.text.substring(0, m.range.first).isBlank()
            }?.let { m -> line.claim(m.range, Token(Kind.DATE, dayWord(m.value))) }
        }

        // A time: "at 7pm", "7:30 pm", "19:00".
        Regex("""\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let { m ->
            val h = m.groupValues[1].toInt()
            val min = m.groupValues[2].ifEmpty { "00" }
            if (h in 1..12) line.claim(m.range, Token(Kind.TIME, "$h:$min ${m.groupValues[3].lowercase(Locale.ROOT)}"))
        } ?: Regex("""\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b""").find(line.text)?.let { m ->
            line.claim(m.range, Token(Kind.TIME, "${m.groupValues[1].toInt()}:${m.groupValues[2]}"))
        }

        // An estimate: "60m", "45 min", "1h", "1h30", "1.5h", "2 hours".
        Regex("""\b(\d{1,2})\s*h(?:rs?|ours?)?\s*(\d{1,2})\s*(?:m|min|mins)?\b""", RegexOption.IGNORE_CASE).find(line.text)?.let { m ->
            val mins = m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
            if (mins in 1..480) line.claim(m.range, Token(Kind.DURATION, "$mins min"))
        } ?: Regex("""\b(\d{1,2}(?:\.\d)?)\s*(h|hr|hrs|hour|hours)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let { m ->
            val mins = Math.round(m.groupValues[1].toDouble() * 60).toInt()
            if (mins in 1..480) line.claim(m.range, Token(Kind.DURATION, "$mins min"))
        } ?: Regex("""\b(\d{1,3})\s*(m|min|mins|minute|minutes)\b""", RegexOption.IGNORE_CASE).find(line.text)?.let { m ->
            val mins = m.groupValues[1].toInt()
            val bare = m.groupValues[2].equals("m", ignoreCase = true)
            if (mins in 1..480 && !(bare && mins > 240)) line.claim(m.range, Token(Kind.DURATION, "$mins min"))
        }

        val title = cap(line.text.replace(Regex("""\s+"""), " ").trim().trim(',', '-', '·').trim())
        if (title.isEmpty()) return Reading("", line.tokens, "Task · type what to do, e.g. gym legs 60m every mon,thu !", ok = false)
        val order = listOf(Kind.DATE, Kind.SCHEDULE, Kind.TIME, Kind.DURATION, Kind.MUST)
        val sorted = line.tokens.sortedBy { order.indexOf(it.kind) }
        val parts = listOf(title) + sorted.map { it.text }
        if (!must && sorted.none { it.kind == Kind.DATE || it.kind == Kind.SCHEDULE }) {
            return Reading(title, sorted, (parts + "Today").joinToString(" · "), ok = true)
        }
        return Reading(title, sorted, parts.joinToString(" · "), ok = true)
    }

    private fun dayWord(w: String): String = when (val l = w.lowercase(Locale.ROOT)) {
        "today" -> "Today"
        "tonight" -> "Tonight"
        "tomorrow", "tomorow", "tmrw", "tmr" -> "Tomorrow"
        else -> DAYS[l]?.let { DAY_SHORT[it] } ?: cap(l)
    }

    private fun cap(s: String): String = s.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }
}

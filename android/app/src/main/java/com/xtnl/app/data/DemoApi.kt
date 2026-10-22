package com.xtnl.app.data

import com.xtnl.app.core.IdeaFormat
import com.xtnl.app.core.LogPreview
import com.xtnl.app.core.LogSection
import com.xtnl.app.core.ReviewSession
import com.xtnl.app.core.TimeLabels
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.time.temporal.IsoFields
import java.util.Locale
import java.util.UUID
import kotlin.math.abs
import kotlin.math.round

/**
 * Demo data: a believable day with no server, for development and for trying
 * the app (More › Settings › Data › Demo). It keeps its own state while the
 * app runs and follows the contract's rules (docs/mobile-api.md): a clientId
 * answers once, unknown or unused fields are refused like the server refuses
 * them, an answer's `retry` follows the web runner's rule (a miss comes back
 * while the card's misses this session are at most 3), points are review
 * points. It grades loosely. Never the default. [clock] is the check's clock (the tests set it).
 */
class DemoApi(private val clock: () -> Instant = { Instant.now() }) : XtnlApi {
    private val lock = Mutex()

    private data class DemoTask(val item: TaskItem, val instanceId: String? = null)

    private val tasks = mutableListOf(
        DemoTask(TaskItem("t-gym", "Gym legs", "MUST", "OPEN", minutes = 60, mvv = "10 squats", icon = "dumbbell", xpHint = 8.3)),
        // A daily quest kept at the minimum, so the strip shows "1 at minimum" (it still counts as kept).
        DemoTask(TaskItem("t-floss", "Floss", "MUST", "DONE_MVV", minutes = 5, mvv = "one tooth", xpHint = 1.1), "i-floss"),
        DemoTask(TaskItem("t-dentist", "Call the dentist", "TASK", "OPEN", minutes = 10, dueLabel = "late 2d", xpHint = 3.0)),
        DemoTask(TaskItem("t-tax", "Lodge the tax return", "TASK", "OPEN", minutes = 45, dueLabel = "by Fri", xpHint = 6.1)),
        DemoTask(TaskItem("t-study", "Review 5 cards", "TASK", "LOCKED", minutes = 10, xpHint = 2.0)),
        DemoTask(TaskItem("t-read", "Read 20 pages", "HABIT", "OPEN", minutes = 25, mvv = "1 page", icon = "book", xpHint = 4.1)),
        DemoTask(TaskItem("t-stretch", "Stretch", "HABIT", "OPEN", minutes = 10, mvv = "1 stretch", xpHint = 2.2)),
        DemoTask(TaskItem("t-run", "Run 5 km", "HABIT", "HELD", minutes = 35, icon = "run")),
        DemoTask(TaskItem("t-meds", "Morning meds", "HABIT", "DONE", minutes = 2, icon = "pill", xpHint = 3.6), "i-meds"),
    )

    private data class DemoWork(val item: WorkItem, val done: Boolean = false)

    private val work = mutableListOf(
        DemoWork(WorkItem("w-mia", "b-acme", "Acme Sales", "Follow up on the contract", dueAt = at(-3 * 24 * 60), channel = "MESSAGE", overdue = true,
            customer = Customer("c-1101", "Mia Chen", "1101", "0433 210 555"))),
        DemoWork(WorkItem("w-jordan", "b-acme", "Acme Sales", "Call Jordan back", dueAt = at(-35), channel = "CALL", overdue = true,
            collection = "New NBN service", customer = Customer("c-1042", "Jordan Lee", "1042", "0412 345 678"))),
        DemoWork(WorkItem("w-visit", "b-field", "Field Ops", "Install check visit", dueAt = at(0), allDay = true, channel = "VISIT",
            collection = "Installs", customer = Customer("c-0981", "Sam Ortiz", "0981", "0400 123 987"))),
        DemoWork(WorkItem("w-quote", "b-acme", "Acme Sales", "Send the quote", dueAt = at(20), channel = "EMAIL",
            customer = Customer("c-1077", "Priya Nair", "1077", null))),
    )

    // Three ticks from the next level, so the demo shows a character level up (7 Adept → 8 Expert).
    private var level = LevelInfo(7, "Adept", 0.88)
    private var streak = StreakInfo(12, keptToday = false, freezes = 2)
    private var reviewDone = 4
    private val reviewTarget = 20

    private class DemoCard(val card: ReviewCard, val expected: String, val explanation: String?, val accept: (JsonElement) -> Boolean)

    private val cards: List<DemoCard> = listOf(
        text("d-atp", "What molecule does the mitochondrion make most of a cell's energy as?", "ATP", "Adenosine triphosphate, made by oxidative phosphorylation.", 3, "Biology", "Science", also = listOf("adenosine triphosphate")),
        DemoCard(
            ReviewCard("d-cap", "CLOZE", "The capital of Australia is [1], and its largest city is [2].", blanks = 2, level = 2, field = "Geography", domain = "Humanities"),
            "Canberra · Sydney", "Canberra was chosen as a compromise between Sydney and Melbourne.",
        ) { a -> strings(a).map { it.trim().lowercase() } == listOf("canberra", "sydney") },
        DemoCard(
            ReviewCard("d-g", "NUMERIC", "Acceleration due to gravity at sea level?", unit = "m/s²", level = 4, field = "Physics", domain = "Science"),
            "9.81 m/s² (± 0.05)", null,
        ) { a -> a.jsonPrimitive.contentOrNull?.toDoubleOrNull()?.let { abs(it - 9.81) <= 0.05 } == true },
        DemoCard(
            ReviewCard("d-planet", "MCQ", "Which planet has the shortest day?", options = listOf("Mercury", "Jupiter", "Earth", "Mars"), level = 1, field = "Astronomy", domain = "Science"),
            "Jupiter", "Jupiter turns once in about 9 h 56 min.",
        ) { a -> a.jsonPrimitive.contentOrNull == "Jupiter" },
        DemoCard(
            ReviewCard("d-dna", "LIST", "Name the four bases in DNA.", listCount = 4, level = 2, field = "Biology", domain = "Science"),
            "Adenine, Thymine, Cytosine, Guanine", "Order doesn't matter. A pairs with T, C with G.",
        ) { a -> strings(a).map { it.trim().lowercase().take(1) }.toSet() == setOf("a", "t", "c", "g") },
        DemoCard(
            ReviewCard("d-mitosis", "ORDER", "Order the stages of mitosis.", orderItems = listOf("Metaphase", "Telophase", "Prophase", "Anaphase"), level = 3, field = "Biology", domain = "Science"),
            "Prophase → Metaphase → Anaphase → Telophase", "PMAT: the chromosomes condense, line up, part, and two nuclei form.",
        ) { a -> strings(a) == listOf("Prophase", "Metaphase", "Anaphase", "Telophase") },
        DemoCard(
            ReviewCard("d-norm", "FORMULA", "Write the Euclidean norm of a vector \\(v = (x, y)\\).", promptHasMath = true, level = 2, field = "Linear algebra", domain = "Mathematics"),
            "sqrt(x^2 + y^2)", "Pythagoras in two dimensions.",
        ) { a -> formula(a) in setOf("sqrt(x^2+y^2)", "sqrt(y^2+x^2)", "(x^2+y^2)^(1/2)", "(x^2+y^2)^0.5") },
        DemoCard(
            ReviewCard("d-deriv", "FORMULA", "Differentiate \\( f(x) = x^3 \\). \\[ f'(x) = ? \\]", promptHasMath = true, level = 1, field = "Calculus", domain = "Mathematics"),
            "3x^2", "The power rule: bring the 3 down, lower the power by one.",
        ) { a -> formula(a) in setOf("3x^2", "3*x^2", "3x**2") },
        text("d-int", "What is the integral of 2x from 0 to 1?", "1", "x² from 0 to 1 is 1.", 3, "Calculus", "Mathematics"),
        text("d-stage", "In the Acme pipeline, which stage comes after Qualified?", "Proposal", "Lead → Qualified → Proposal → Won.", 1, "Sales", "Work"),
    )
    private val cardLevels = mutableMapOf<String, Int>()
    private val answeredToday = mutableSetOf<String>()

    private data class PastGrace(val ideaId: String, val domain: String, val forgetting: Boolean = false)

    // Three of the due cards past their grace (docs/mobile-api.md `fading`): two fading, one already losing a level. A
    // card answered for the day is reviewed (a new due date), so it leaves the line, as on the server.
    private val pastGrace = listOf(
        PastGrace("d-atp", "Cell biology"),
        PastGrace("d-dna", "Cell biology"),
        PastGrace("d-int", "Integration", forgetting = true),
    )

    private val seenClientIds = mutableMapOf<String, Pair<JsonObject?, Any>>()
    private val logged = mutableMapOf<String, String>() // undo id → task templateId ("" for a weigh-in or a draft)
    private val ideaTitles = mutableSetOf<String>()

    private fun text(id: String, prompt: String, answer: String, why: String?, level: Int, field: String, domain: String, also: List<String> = emptyList()) =
        DemoCard(ReviewCard(id, "SHORT", prompt, level = level, field = field, domain = domain), answer, why) { a ->
            val got = a.jsonPrimitive.contentOrNull.orEmpty().trim().lowercase().trimEnd('.')
            got == answer.lowercase() || got in also
        }

    private fun at(minutesFromNow: Long): String = Instant.now().plus(Duration.ofMinutes(minutesFromNow)).toString()

    private suspend fun pause(ms: Long = 280) = delay(ms)

    /** Progress past 1 is the next level (the demo's titles). */
    private fun gain(l: LevelInfo, by: Double): LevelInfo {
        val p = l.progress + by
        if (p < 1.0) return l.copy(progress = p)
        val next = l.level + 1
        return LevelInfo(next, LEVEL_TITLES[next] ?: l.title, p - 1.0)
    }

    /** A clientId answers once (the same body gets the first result; another body is a conflict), as on the server. */
    @Suppress("UNCHECKED_CAST")
    private inline fun <T : Any> once(clientId: String?, body: JsonObject?, block: () -> Outcome<T>): Outcome<T> {
        if (clientId != null) {
            seenClientIds[clientId]?.let { (b, r) ->
                return if (b == body) r as Outcome<T> else Outcome.Err("That clientId was already used for another request.", code = "conflict", status = 409)
            }
        }
        val out = block()
        if (out is Outcome.Ok && clientId != null) seenClientIds[clientId] = body to out
        return out
    }

    private fun bad(line: String) = Outcome.Err(line, code = "bad", status = 400)

    /** The daily quests as the server counts them (docs/mobile-api.md `daily`): the Must rows that ask today, kept or not. */
    private fun daily(): DailyQuests {
        val quests = tasks.map { it.item }.filter { it.lane == "MUST" && it.status != "HELD" && it.status != "SKIPPED" }
            .map { DailyQuest(it.templateId, it.title, kept = it.kept, minimum = it.status == "DONE_MVV") }
        val kept = quests.count { it.kept }
        return DailyQuests(
            kept = kept, total = quests.size, full = quests.isNotEmpty() && kept == quests.size, cap = MUSTS_PER_DAY_MAX,
            minimum = quests.count { it.minimum }, over = maxOf(0, quests.size - MUSTS_PER_DAY_MAX), quests = quests,
        )
    }

    /** The ideas past their grace as the server counts them (docs/mobile-api.md `fading`): their Domains most first. */
    private fun fading(): Fading {
        val left = pastGrace.filter { it.ideaId !in answeredToday }
        val domains = left.groupBy { it.domain }
            .map { (name, cards) -> FadingDomain("dm-" + name.lowercase().replace(' ', '-'), name, cards.size) }
            .sortedWith(compareByDescending<FadingDomain> { it.ideas }.thenBy { it.name })
        return Fading(ideas = left.size, forgetting = left.count { it.forgetting }, domains = domains)
    }

    /**
     * The weekly audit as the server states it (docs/mobile-api.md `week`; week-audit auditWeekAt): from Sunday 18:00
     * (Sydney) this week as it stands, today's daily quests included (provisional); before that, and on any other day,
     * last week's frozen copy (as of this Monday 04:00, final from Wednesday), which a tick today never moves.
     */
    private fun week(now: Instant, daily: DailyQuests): WeekAudit {
        val day = TimeLabels.lifeDay(now)
        val sunday = day.dayOfWeek == DayOfWeek.SUNDAY && now.atZone(TimeLabels.SYDNEY).hour >= AUDIT_OPENS_HOUR
        val monday = day.with(DayOfWeek.MONDAY).let { if (sunday) it else it.minusWeeks(1) }
        val kept = if (sunday) 18 + daily.kept else 24
        val due = if (sunday) 21 + daily.total else 28
        val need = (WEEK_TARGET * due + 99) / 100
        return WeekAudit(
            weekKey = "%d-W%02d".format(monday.get(IsoFields.WEEK_BASED_YEAR), monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)),
            label = "Week of " + monday.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)),
            rate = if (due > 0) 100 * kept / due else null,
            kept = kept, due = due,
            minimum = if (sunday) 2 + daily.minimum else 3,
            skipped = 1, held = 0,
            open = if (sunday) daily.total - daily.kept else 0,
            short = maxOf(0, need - kept), target = WEEK_TARGET,
            status = when { sunday -> "provisional"; day.dayOfWeek.value >= 3 -> "final"; else -> "frozen" },
            calibrating = false,
            asOfDay = if (sunday) null else day.with(DayOfWeek.MONDAY).toString(),
            decaying = DEMO_DECAYING,
        )
    }

    private fun board(): TasksSummary {
        val rows = tasks.map { it.item }.filter { it.countsForBoard }
        val open = rows.count { it.open || it.locked }
        val done = rows.count { it.kept }
        return TasksSummary(open = open, done = done, allDone = open == 0 && done > 0)
    }

    override suspend fun check(): Outcome<CheckData> {
        pause(420)
        return lock.withLock {
            val now = clock()
            val day = TimeLabels.lifeDay(now)
            val lanes = listOf("MUST", "TASK", "HABIT")
            val ordered = tasks.map { it.item }.sortedWith(compareBy({ if (it.kept) 1 else 0 }, { lanes.indexOf(it.lane) }))
            val daily = daily()
            Outcome.Ok(
                CheckData(
                    now = now.toString(),
                    day = day.toString(),
                    dayLabel = day.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)),
                    tasks = ordered,
                    tasksSummary = board(),
                    daily = daily,
                    review = ReviewSummary(
                        due = cards.count { it.card.ideaId !in answeredToday },
                        doneToday = reviewDone,
                        target = reviewTarget,
                        nextDueAt = now.plus(Duration.ofMinutes(140)).toString(),
                    ),
                    fading = fading(),
                    // As a server with the audit switched on sends it (the reminder never arms from demo data).
                    auditOn = true,
                    week = week(now, daily),
                    work = work.filter { !it.done }.map { it.item },
                    level = level,
                    streak = streak,
                )
            )
        }
    }

    override suspend fun completeTask(templateId: String, mvv: Boolean, clientId: String): Outcome<CompleteResult> {
        pause()
        val body = buildJsonObject { put("templateId", templateId); put("mvv", mvv) }
        return lock.withLock {
            once(clientId, body) {
                val i = tasks.indexOfFirst { it.item.templateId == templateId }
                if (i < 0) return@once Outcome.Err("That task is no longer on today's board.", code = "gone", status = 404)
                val t = tasks[i]
                if (t.item.locked) return@once Outcome.Err("A study task completes itself from today's reviews.", code = "conflict", status = 409)
                if (t.item.kept) return@once Outcome.Ok(CompleteResult(t.instanceId ?: "i-x", 0.0, "Already recorded. Nothing is paid twice.", board().allDone))
                val xp = round((t.item.xpHint ?: 2.0) * (if (mvv) 0.5 else 1.0) * 10) / 10
                val instance = "i-" + UUID.randomUUID().toString().take(8)
                tasks[i] = t.copy(item = t.item.copy(status = if (mvv) "DONE_MVV" else "DONE", xpHint = xp), instanceId = instance)
                if (!streak.keptToday) streak = streak.copy(keptToday = true, days = streak.days + 1)
                level = gain(level, xp / 120.0)
                val track = when (t.item.lane) { "MUST" -> "Body"; "HABIT" -> "Care"; else -> "Duty" }
                val clear = board().allDone
                Outcome.Ok(
                    CompleteResult(
                        instanceId = instance, xp = xp,
                        line = "+$xp XP · $track" + if (mvv) " · minimum" else "",
                        allDone = clear,
                        celebrations = if (clear) listOf(buildJsonObject { put("tier", 1); put("kind", "board-clear"); put("title", "Board clear") }) else emptyList(),
                        level = level,
                    )
                )
            }
        }
    }

    override suspend fun undoTask(instanceId: String, clientId: String): Outcome<UndoTaskResult> {
        pause(200)
        return lock.withLock {
            once(clientId, buildJsonObject { put("instanceId", instanceId) }) {
                val i = tasks.indexOfFirst { it.instanceId == instanceId }
                if (i < 0) return@once Outcome.Ok(UndoTaskResult(0.0, level))
                val t = tasks[i]
                val xp = t.item.xpHint ?: 0.0
                tasks[i] = t.copy(item = t.item.copy(status = "OPEN"), instanceId = null)
                // A level once reached stays (as on the server): an undo drains only this level's progress.
                level = level.copy(progress = (level.progress - xp / 120.0).coerceAtLeast(0.0))
                Outcome.Ok(UndoTaskResult(-xp, level))
            }
        }
    }

    override suspend fun workDone(id: String, clientId: String): Outcome<WorkResult> = workSet(id, clientId, done = true)

    override suspend fun workReopen(id: String, clientId: String): Outcome<WorkResult> = workSet(id, clientId, done = false)

    private suspend fun workSet(id: String, clientId: String, done: Boolean): Outcome<WorkResult> {
        pause(220)
        return lock.withLock {
            once(clientId, buildJsonObject { put("id", id); put("done", done) }) {
                val i = work.indexOfFirst { it.item.id == id }
                if (i < 0) return@once Outcome.Err("That scheduled task is gone.", code = "gone", status = 404)
                work[i] = work[i].copy(done = done)
                Outcome.Ok(WorkResult(id, if (done) Instant.now().toString() else null))
            }
        }
    }

    override suspend fun reviewQueue(limit: Int): Outcome<ReviewQueue> {
        pause(380)
        if (limit !in 1..50) return bad("limit must be 1 to 50.")
        return lock.withLock {
            val due = cards.filter { it.card.ideaId !in answeredToday }.map { c -> c.card.copy(level = cardLevels[c.card.ideaId] ?: c.card.level) }
            Outcome.Ok(ReviewQueue(Instant.now().toString(), due.size, due.take(limit)))
        }
    }

    override suspend fun answer(ideaId: String, answer: JsonElement, combo: Int, sessionMisses: Int, clientId: String): Outcome<AnswerResult> {
        pause(360)
        val parts = (answer as? JsonArray)?.map { (it as? JsonPrimitive)?.contentOrNull } ?: listOf((answer as? JsonPrimitive)?.contentOrNull)
        if (parts.isEmpty() || parts.any { it.isNullOrBlank() }) return bad("Nothing empty: fill every part of the answer.")
        val body = buildJsonObject { put("ideaId", ideaId); put("answer", answer); put("combo", combo); put("sessionMisses", sessionMisses) }
        return lock.withLock {
            once(clientId, body) {
                val c = cards.firstOrNull { it.card.ideaId == ideaId } ?: return@once Outcome.Err("That card is gone.", code = "gone", status = 404)
                val correct = runCatching { c.accept(answer) }.getOrDefault(false)
                // The web runner's rule: a miss comes back while this card's misses this session are at most 3.
                val retry = !correct && sessionMisses + 1 <= ReviewSession.MAX_RETURNS
                val today = TimeLabels.lifeDay(Instant.now())
                val lvl = cardLevels[ideaId] ?: c.card.level ?: 1
                val multiplier = round((1.0 + 0.1 * combo.coerceAtMost(10)) * 10) / 10
                val points = if (correct) round(4.2 * multiplier * 10) / 10 else 0.0
                val levelTo = if (correct) (lvl + 1).coerceAtMost(7) else (lvl - 1).coerceAtLeast(1)
                cardLevels[ideaId] = levelTo
                if (!retry) answeredToday += ideaId
                reviewDone += 1
                if (reviewDone >= 7) tasks.indexOfFirst { it.item.templateId == "t-study" && it.item.locked }.takeIf { it >= 0 }?.let { i ->
                    tasks[i] = tasks[i].copy(item = tasks[i].item.copy(status = "DONE"), instanceId = "i-study")
                }
                val secured = correct && !streak.keptToday
                if (secured) streak = streak.copy(keptToday = true, days = streak.days + 1)
                val nextDue = today.plusDays(if (correct) (1L shl levelTo.coerceAtMost(6)) else 1L)
                val words = parts.firstOrNull().orEmpty()
                Outcome.Ok(
                    AnswerResult(
                        correct = correct,
                        expected = JsonPrimitive(c.expected),
                        explanation = c.explanation,
                        judged = if (c.card.type == "SHORT" && !correct && words.length > 3) Judged(false, "It names something else than the answer.") else null,
                        xp = points,
                        comboNext = if (correct) combo + 1 else 0,
                        multiplier = multiplier,
                        levelFrom = lvl,
                        levelTo = levelTo,
                        nextDueDay = nextDue.toString(),
                        retry = retry,
                        trueFact = if (correct) "Recalled after ${2 + lvl * 3} days" else "Missed: it comes back sooner",
                        quest = Quest(reviewDone, reviewTarget),
                        streakSecured = secured,
                        celebrations = if (reviewDone == reviewTarget) listOf(buildJsonObject { put("tier", 1); put("kind", "quest"); put("title", "Review quest done") }) else emptyList(),
                    )
                )
            }
        }
    }

    override suspend fun log(text: String, section: String, clientId: String): Outcome<LogResult> {
        pause(320)
        if (text.length > 500) return bad("Keep the line to 500 characters.")
        if (text.trim().startsWith("aim:", ignoreCase = true)) return bad("An aim is set on the roadmap, in the web app.")
        val body = buildJsonObject { put("text", text); put("section", section) }
        return lock.withLock {
            once(clientId, body) {
                val sec = LogSection.of(section)
                val reading = LogPreview.read(text, sec)
                if (!reading.ok) return@once bad(
                    when (sec) {
                        LogSection.WEIGHT -> "That isn't a weight. Type a number, like 72.4 or 160 lb."
                        LogSection.IDEA -> "Write the idea first."
                        LogSection.TASK -> "Write what to do."
                    }
                )
                val undoId = "u-" + UUID.randomUUID().toString().take(8)
                when (sec) {
                    LogSection.TASK -> {
                        val id = "t-" + UUID.randomUUID().toString().take(6)
                        val mins = reading.tokens.firstOrNull { it.kind == LogPreview.Kind.DURATION }?.text?.substringBefore(' ')?.toIntOrNull()
                        val asked = reading.tokens.any { it.kind == LogPreview.Kind.MUST }
                        val xp = round((2.0 + (mins ?: 10) / 20.0) * 10) / 10
                        // Daily quests (D14): a sixth must is saved as an ordinary task, never refused; the 4th and 5th warn.
                        val peak = tasks.count { it.item.lane == "MUST" } + 1
                        val capped = asked && peak > MUSTS_PER_DAY_MAX
                        val must = asked && !capped
                        tasks.add(0, DemoTask(TaskItem(id, reading.title, if (must) "MUST" else "TASK", "OPEN", minutes = mins, xpHint = xp)))
                        logged[undoId] = id
                        val head = if (capped) "Added (not a Must)" else "Added"
                        val note = when {
                            capped -> " · Five daily quests is the cap. Soften one first."
                            must && peak >= 4 -> " · $peak of $MUSTS_PER_DAY_MAX daily quests" + if (peak >= MUSTS_PER_DAY_MAX) ", the cap" else ""
                            else -> ""
                        }
                        Outcome.Ok(LogResult("task", id, reading.title, "$head. ${reading.title} → Today · ≈ $xp$note", buildJsonObject { put("kind", "task"); put("id", undoId) }))
                    }
                    LogSection.WEIGHT -> {
                        logged[undoId] = ""
                        val w = reading.tokens.first().text
                        Outcome.Ok(LogResult("weight", "weight:${TimeLabels.lifeDay(Instant.now())}", "Weigh-in", "Weight logged. $w → Body", buildJsonObject { put("kind", "weight"); put("id", undoId) }))
                    }
                    LogSection.IDEA -> {
                        logged[undoId] = ""
                        val draft = "draft-" + UUID.randomUUID().toString().take(8)
                        Outcome.Ok(LogResult("idea-draft", draft, reading.title, "Idea in Inbox", buildJsonObject { put("kind", "draft"); put("id", undoId) }))
                    }
                }
            }
        }
    }

    override suspend fun logUndo(undo: JsonObject, clientId: String): Outcome<Unit> {
        pause(200)
        return lock.withLock {
            once(clientId, undo) {
                val id = (undo["id"] as? JsonPrimitive)?.contentOrNull
                val task = id?.let { logged.remove(it) } ?: return@once Outcome.Ok(Unit)
                if (task.isNotEmpty()) tasks.removeAll { it.item.templateId == task }
                Outcome.Ok(Unit)
            }
        }
    }

    override suspend fun ideasMeta(): Outcome<IdeasMeta> {
        pause(240)
        val points = mapOf(IdeaFormat.SHORT to 10.0, IdeaFormat.CLOZE to 12.0, IdeaFormat.NUMERIC to 10.0, IdeaFormat.MULTI to 8.0,
            IdeaFormat.LIST to 14.0, IdeaFormat.ORDER to 14.0, IdeaFormat.FORMULA to 16.0)
        return Outcome.Ok(
            IdeasMeta(
                formats = IdeaFormat.entries.map { FormatMeta(it.wire, it.label, points[it], it.hint) },
                collections = listOf("BOOK" to "Book", "ACTIONABLE" to "Actionable", "PROPOSAL" to "Proposal").map { (v, l) ->
                    buildJsonObject { put("value", v); put("label", l) }
                },
            )
        )
    }

    /** The keys each format uses (the server refuses any other, so the demo does too). */
    private val formatKeys = mapOf(
        "SHORT" to setOf("question", "answer", "caseSensitive"),
        "CLOZE" to setOf("question"),
        "NUMERIC" to setOf("question", "answer", "tolerance", "unit"),
        "MCQ" to setOf("options", "answer"),
        "LIST" to setOf("question", "listItems"),
        "ORDER" to setOf("question", "orderItems"),
        "FORMULA" to setOf("question", "answer"),
    )
    private val contentKeys = setOf("question", "answer", "options", "listItems", "orderItems", "unit", "tolerance", "caseSensitive")
    private val ideaKeys = contentKeys + setOf("type", "variants", "collection", "draftId", "clientId")

    override suspend fun createIdea(body: JsonObject): Outcome<IdeaResult> {
        val type = (body["type"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        val used = formatKeys[type] ?: return bad("type must be one of SHORT, CLOZE, NUMERIC, MCQ, LIST, ORDER or FORMULA.")
        body.keys.firstOrNull { it !in ideaKeys }?.let { return bad("$it isn't a field of a new idea.") }
        body.keys.firstOrNull { it in contentKeys && it !in used }?.let { return bad("$it isn't used by a $type idea.") }
        // Filing embeds and routes the idea on the server: a few seconds, as there (long enough to see all four stages).
        delay(5200)
        val clientId = (body["clientId"] as? JsonPrimitive)?.contentOrNull
        val content = JsonObject(body - "clientId")
        return lock.withLock {
            once(clientId, content) {
                val question = (body["question"] as? JsonPrimitive)?.contentOrNull.orEmpty()
                val options = (body["options"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
                val title = question.ifBlank { options.joinToString(" / ") }.let { if (it.length > 64) it.take(61) + "…" else it }
                val key = title.lowercase().trim()
                if (cards.any { it.card.prompt.lowercase() == key }) {
                    return@once Outcome.Ok(IdeaResult("duplicate", cards.first { it.card.prompt.lowercase() == key }.card.ideaId, title, null, null, 0.0,
                        "Something close is already here, so nothing was saved. Link it or enrich it from the New idea form on the web."))
                }
                if (key in ideaTitles) {
                    return@once Outcome.Ok(IdeaResult("merged", "n-merged", title, null, null, 0.0,
                        "You already have this one. It was folded into the existing idea, which gains an endorsement. Nothing new was created, so nothing is paid."))
                }
                ideaTitles += key
                val mathy = type == "FORMULA" || type == "NUMERIC"
                val (domain, field) = if (mathy) "Mathematics" to "Algebra" else "Science" to "General science"
                val pts = when (IdeaFormat.of(type)) { IdeaFormat.LIST, IdeaFormat.ORDER -> 14.0; IdeaFormat.FORMULA -> 16.0; IdeaFormat.CLOZE -> 12.0; IdeaFormat.MULTI -> 8.0; else -> 10.0 }
                Outcome.Ok(IdeaResult("created", "n-" + UUID.randomUUID().toString().take(8), title, field, domain, pts, "Filed beside its neighbours in $domain ($field)."))
            }
        }
    }

    private companion object {
        val LEVEL_TITLES = mapOf(7 to "Adept", 8 to "Expert", 9 to "Master", 10 to "Sage")
        /** The server's cap on daily quests (duty-economy MUSTS_PER_DAY_MAX). */
        const val MUSTS_PER_DAY_MAX = 5
        /** The week's "Decaying this week" (audit-decay.ts): four things fell, the first three listed, as the server sends it. */
        val DEMO_DECAYING = WeekDecaying(
            count = 4,
            top = listOf(
                DecayItem("domain", "Probability fell to L3 (from L4)", "2 ideas fading in it. Reviewing them brings the level back."),
                DecayItem("habit", "Stretch: Established → Forming", "Strength 61% → 57% this week. Each kept day raises it again."),
                DecayItem("ideas", "5 ideas fading", "1 already losing levels. Past grace, an idea counts for less every day until it is reviewed."),
            ),
        )

        /** The weekly audit's target, a whole percent (week-audit AUDIT_TARGET). */
        const val WEEK_TARGET = 85
        /** This week's audit opens at this Sydney hour of its Sunday (week-audit AUDIT_OPENS_HOUR). */
        const val AUDIT_OPENS_HOUR = 18

        fun strings(a: JsonElement): List<String> = (a as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        fun formula(a: JsonElement): String = (a as? JsonPrimitive)?.contentOrNull.orEmpty().lowercase().replace(" ", "").replace("**", "^")
    }
}

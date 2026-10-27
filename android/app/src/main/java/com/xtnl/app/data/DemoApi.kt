package com.xtnl.app.data

import com.xtnl.app.core.CheckinLine
import com.xtnl.app.core.HealthLine
import com.xtnl.app.core.IdeaFormat
import com.xtnl.app.core.LogPreview
import com.xtnl.app.core.LogSection
import com.xtnl.app.core.MallLine
import com.xtnl.app.core.OwedLine
import com.xtnl.app.core.ProofLine
import com.xtnl.app.core.ReviewSession
import com.xtnl.app.core.SideLine
import com.xtnl.app.core.StreakLine
import com.xtnl.app.core.TickNote
import com.xtnl.app.core.TimeLabels
import com.xtnl.app.core.WalletLine
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
import kotlinx.serialization.json.putJsonObject
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.time.temporal.IsoFields
import java.util.Locale
import java.util.UUID
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.round

/** Review fatigue (P30) in the demo: the day's answers that apply Fatigued (the server's review-fatigue FATIGUE_ANSWERS). */
internal const val DEMO_FATIGUE_ANSWERS = 200

/** How long it lasts (FATIGUED's own 18 hours). */
internal const val DEMO_FATIGUE_HOURS = 18L

/**
 * Demo data: a believable day with no server, for development and for trying
 * the app (More › Settings › Data › Demo). It keeps its own state while the
 * app runs and follows the contract's rules (docs/mobile-api.md): a clientId
 * answers once, unknown or unused fields are refused like the server refuses
 * them, an answer's `retry` follows the web runner's rule (a miss comes back
 * while the card's misses this session are at most 3), points are review
 * points. It grades loosely. Never the default. [clock] is the check's clock (the tests set it). P7: [kneeToday] and
 * [kneeYesterday] are the raw each day already holds (the ticks before the demo's): a tick pays through the daily knee
 * from there, and its answer carries `knee` past 200 raw, as the server's does. 0 by default, so the demo's ticks stay
 * at the full rate.
 */
class DemoApi(
    private val kneeToday: Double = 0.0,
    private val kneeYesterday: Double = 0.0,
    private val clock: () -> Instant = { Instant.now() },
) : XtnlApi {
    private val lock = Mutex()

    /** A row, its instance once ticked, and the raw its tick put on its day's knee (an undo takes it back). */
    private data class DemoTask(val item: TaskItem, val instanceId: String? = null, val raw: Double = 0.0)

    private val tasks = mutableListOf(
        DemoTask(TaskItem("t-gym", "Gym legs", "MUST", "OPEN", minutes = 60, mvv = "10 squats", icon = "dumbbell", xpHint = 8.3)),
        // A daily quest kept at the minimum, so the strip shows "1 at minimum" (it still counts as kept).
        DemoTask(TaskItem("t-floss", "Floss", "MUST", "DONE_MVV", minutes = 5, mvv = "one tooth", xpHint = 1.1), "i-floss"),
        DemoTask(TaskItem("t-dentist", "Call the dentist", "TASK", "OPEN", minutes = 10, dueLabel = "late 2d", xpHint = 3.0)),
        DemoTask(TaskItem("t-tax", "Lodge the tax return", "TASK", "OPEN", minutes = 45, dueLabel = "by Fri", xpHint = 6.1)),
        // P31: a side quest, as a server with the detectors switched on offers it (Body under 75 of 150 effort minutes):
        // an ordinary one-off in ink with its glyph, never a must; it asks nothing of the day while open.
        DemoTask(sideWalk()),
        // P23: a deep-work task marked proof, as a server with proof of work switched on sends it: its tick takes its
        // minutes (the sheet) or its timer; the minimum and every other row still tick in one tap.
        DemoTask(TaskItem("t-thesis", "Write the thesis chapter", "TASK", "OPEN", minutes = 90, xpHint = 26.7, proof = true)),
        DemoTask(TaskItem("t-study", "Review 5 cards", "TASK", "LOCKED", minutes = 10, xpHint = 2.0)),
        DemoTask(TaskItem("t-read", "Read 20 pages", "HABIT", "OPEN", minutes = 25, mvv = "1 page", icon = "book", xpHint = 4.1)),
        // P24: a reading task, as a server with proof of work switched on sends it: its full tick takes its pages (at least
        // the day's 30, the sheet's chips); its minimum still ticks in one tap.
        DemoTask(TaskItem("t-novel", "Read the novel", "HABIT", "OPEN", minutes = 40, mvv = "1 page", icon = "book", xpHint = 5.2, pages = TaskPages(target = 30))),
        DemoTask(TaskItem("t-stretch", "Stretch", "HABIT", "OPEN", minutes = 10, mvv = "1 stretch", xpHint = 2.2)),
        DemoTask(TaskItem("t-run", "Run 5 km", "HABIT", "HELD", minutes = 35, icon = "run")),
        DemoTask(TaskItem("t-meds", "Morning meds", "HABIT", "DONE", minutes = 2, icon = "pill", xpHint = 3.6), "i-meds"),
    )

    /**
     * P7: the Yesterday lane, as a server whose yesterday is not settled yet sends it (the web's Record yesterday): Morning
     * meds (a habit done today, not ticked yesterday; the same template as today's row) and a one-off due yesterday, on
     * time there. Each tick books on yesterday at T 1.00 (its xpHint), on yesterday's knee. The demo's owed cards come
     * from a server with Duty on, whose early settle would have locked yesterday: the demo shows both, as it shows every
     * switch on at once.
     */
    private val yesterdayTasks = mutableListOf(
        DemoTask(TaskItem("t-meds", "Morning meds", "HABIT", "OPEN", minutes = 2, icon = "pill", xpHint = 3.6)),
        DemoTask(TaskItem("t-power", "Pay the power bill", "TASK", "OPEN", minutes = 15, dueLabel = "by yesterday", xpHint = 4.0)),
    )
    /** P7: the raw each day's ticks here added to its knee. */
    private var rawToday = 0.0
    private var rawYesterday = 0.0

    /** P31: the demo's side quest, expiring two days from the check clock's life day (never past its Sunday, as the server's detectors do). */
    private fun sideWalk(): TaskItem {
        val today = TimeLabels.lifeDay(clock())
        val sunday = today.plusDays((DayOfWeek.SUNDAY.value - today.dayOfWeek.value).toLong())
        val expires = minOf(today.plusDays(2), sunday)
        return TaskItem(
            "t-side-walk", "20-minute walk", "TASK", "OPEN", minutes = 20, dueLabel = SideLine.label(expires, today), xpHint = 3.4,
            side = true, expiresDay = expires.toString(),
        )
    }

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
    // P29: as a server with the streak multiplier switched on sends it (3 judged Full days in a row: ×1.16).
    private var streak = StreakInfo(12, keptToday = false, freezes = 2, restTokens = 2, multiplier = DEMO_STREAK_MULT)
    private var reviewDone = 4
    private val reviewTarget = 20
    /**
     * P30: review fatigue, as a server with it switched on applies it: once the day's answers reach [DEMO_FATIGUE_ANSWERS]
     * (right or wrong) it is applied once that day, for [DEMO_FATIGUE_HOURS] hours, and the combo ceiling is halved meanwhile.
     */
    private var fatigueDay: java.time.LocalDate? = null
    private var fatigueUntil: Instant? = null
    /** P5: the skills' tier Seals already played (once ever a tier, as the server keys them 'competency:<id>:t<n>'). */
    private val skillSeals = mutableSetOf<String>()
    /** P16: the credits earned on the days before today (the demo's wallet, as a server with credits switched on sends it). */
    private val creditsBefore = 185

    /**
     * P22: the open debts, as a server with Duty switched on sends them (oldest first): a one-off missed 15 days ago that
     * Accept the loss is offered for (Settings › Days on), and yesterday's Stretch, inside its two-day window. The days are
     * the check clock's, read on each /check, so the window stays true.
     */
    private data class DemoOwed(val item: OwedItem, val daysAgo: Long)

    /** P22 review: a make-up here, until its ten minutes close (the server's undoUntil): its row, what it paid, the instant. */
    private data class DemoMadeUp(val row: DemoOwed, val xp: Double, val until: Instant)
    private val madeUp = mutableMapOf<String, DemoMadeUp>()

    private val owed = mutableListOf(
        DemoOwed(
            OwedItem(
                "o-bank", "t-bank", "Call the bank", debt = 3.0, restoresToday = false, makeUpXp = 2.6, canAcceptLoss = true,
                text = "Call the bank from 15 days ago is still open. 10 min makes it right.",
                window = "Past the two-day window: a make-up clears the debt; the streak stays as it is.",
            ),
            daysAgo = 15,
        ),
        DemoOwed(
            OwedItem(
                "o-stretch", "t-stretch", "Stretch", debt = 4.2, restoresToday = true, restoresStreak = 6, makeUpXp = 1.9,
                minimum = OwedMinimum("1 stretch", 0.6),
                text = "Yesterday's Stretch is still open. 10 min makes it right.",
            ),
            daysAgo = 1,
        ),
    )

    /** An owed row with its days from the check clock: the missed day, its label, its window (restoreBy = day + 2). */
    private fun owedNow(o: DemoOwed, today: java.time.LocalDate): OwedItem {
        val day = today.minusDays(o.daysAgo)
        val restoreBy = day.plusDays(2)
        val by = restoreBy.plusDays(1).format(DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH))
        val name = if (o.daysAgo == 1L) "Yesterday" else day.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
        return o.item.copy(
            day = day.toString(),
            dayLabel = day.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)),
            restoreBy = restoreBy.toString(),
            whenLine = "${o.item.title} · $name",
            window = if (o.item.restoresToday) "Within $by 04:00 it brings back its streak of ${o.item.restoresStreak}." else o.item.window,
        )
    }

    /** Today's three done (as quests() lists them): the review quest, the gym and the dentist; the minimum is not done. */
    private fun threeDone(): List<Boolean> {
        val done = { id: String -> tasks.firstOrNull { it.item.templateId == id }?.item?.status == "DONE" }
        return listOf(reviewDone >= 12, done("t-gym"), done("t-dentist"))
    }

    /**
     * P16: the wallet as the server derives it: the days before, and today's 10 for each of Today's three done (an undo
     * takes it back). The 3-of-3 bonus comes with the chest, which only the web opens, so the demo never adds it. P19:
     * less what the Mall's purchases spent, plus what their undos gave back (earned − bought + refunded, as the server).
     */
    private fun wallet(): Wallet {
        val today = 10 * threeDone().count { it }
        val spent = purchases.filter { !it.refunded }.sumOf { it.price }
        return Wallet(creditsBefore + today - spent, today)
    }

    /**
     * A write's credits, as the server sends them: the wallet after it (balance and today), and what was earned across it
     * (earned after less earned before; the days before are fixed here, so it is today's change, and a purchase never
     * counts in it).
     */
    private fun creditsSince(before: Wallet): CreditsChange = wallet().let { CreditsChange(it.today - before.today, it.balance, it.today) }

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
            side = DEMO_SIDE_WEEK,
        )
    }

    /**
     * Next week's calibration as a server with the audit on and two weeks frozen sends it (docs/mobile-api.md
     * `calibration`; P32): this life week's, from last week's frozen copy (24 of 28 kept: the target met, so the standard
     * sizes), the capacity suggestion on offer (a median of 205 tracked minutes a day: 210 in 15s, under the 240 set) and
     * Floss, a must, eased and already accepted: still a must until its 'Not a must' takes effect in 7 days (Duty live),
     * as the server says it for a must with that change pending.
     */
    private fun calibration(now: Instant): CheckCalibration {
        val monday = TimeLabels.lifeDay(now).with(DayOfWeek.MONDAY)
        return CheckCalibration(
            weekKey = "%d-W%02d".format(monday.get(IsoFields.WEEK_BASED_YEAR), monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)),
            label = "Week of " + monday.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)),
            sizes = CalibrationSizes(move = 20, any = 2, line = "Move 20 min · Finish any 2 tasks", basis = "Last week's daily quests met the audit's target: the standard sizes."),
            capacityNote = null,
            changes = listOf(
                CalibrationChange(
                    id = "capacity", kind = "capacity", title = "Plan 210 min a day",
                    basis = "A median of 205 tracked min a day over 4 weeks, scaled by how last week's daily quests compare with the audit's target. You set 240.",
                ),
                CalibrationChange(
                    id = "ease:t-floss", kind = "ease", title = "Floss: not a must",
                    basis = "Kept 4 of 7 last week and 5 of 7 the week before: under the audit's target both weeks.",
                    state = "accepted",
                    line = "Not a must from " + monday.plusDays(7).format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)) + ".",
                ),
            ),
        )
    }

    /**
     * P7: /check's `yesterday`, as the server sends it: yesterday's day and label, the sheet's own line (the window ends at
     * 04:00, "tomorrow" before midnight and "this morning" after it, Sydney time), the rows still to record, and the rows.
     */
    private fun yesterdayLane(now: Instant): YesterdayLane {
        val day = TimeLabels.lifeDay(now).minusDays(1)
        val afterMidnight = now.atZone(TimeLabels.SYDNEY).hour < 4
        val rows = yesterdayTasks.map { it.item }
        return YesterdayLane(
            day = day.toString(),
            dayLabel = day.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)),
            line = "Anything you tick pays at the full rate, record by 04:00 ${if (afterMidnight) "this morning" else "tomorrow"}.",
            open = rows.count { it.open || it.locked },
            tasks = rows.filter { !it.kept } + rows.filter { it.kept },
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
                    // P7: the Yesterday lane (the web's Record yesterday sheet), every row not done first.
                    yesterday = yesterdayLane(now),
                    daily = daily,
                    review = ReviewSummary(
                        due = cards.count { it.card.ideaId !in answeredToday },
                        doneToday = reviewDone,
                        target = reviewTarget,
                        nextDueAt = now.plus(Duration.ofMinutes(140)).toString(),
                        // As a server with review fatigue switched on sends it (P30): null until the day's 200th answer.
                        fatigued = fatigueNow(now),
                    ),
                    fading = fading(),
                    // As a server with the audit switched on sends it (the reminder never arms from demo data).
                    auditOn = true,
                    week = week(now, daily),
                    // As a server with the audit on and two weeks frozen sends it (P32): this week's calibration.
                    calibration = calibration(now),
                    // As a server with credits switched on sends it (P16): the demo's wallet chip.
                    credits = wallet(),
                    // As a server with Duty switched on sends it (P22): the make-up cards' actions run.
                    dutyOn = true,
                    owed = owed.map { owedNow(it, day) },
                    // As a server with condition decay switched on sends it (P28): what is under 90%, the lowest first.
                    skills = DEMO_CONDITION,
                    work = work.filter { !it.done }.map { it.item },
                    level = level,
                    streak = streak,
                    // Health phase 2, as a server with MIND_LAUNCH_DAY in force sends it: counts only, never a value.
                    checkin = CheckinState(
                        live = true, lastAt = checks.maxByOrNull { it.at }?.at?.toString(),
                        todayCount = checks.count { TimeLabels.lifeDay(it.at) == day }, paused = false,
                    ),
                    // As a server with a lift under way sends it: the open lift and its next set.
                    lift = liftNow(),
                )
            )
        }
    }

    /**
     * The main quest as a server with it under way sends it (milestone 2 started, its sprint and Today's three), each
     * row's done read from the demo board, so a tick on Check shows here too (a session ticked today moves the count,
     * never the row's done: 2 of 3 sessions is not the week met). The rows in Today's order, as the server sends them
     * (open first, then Bring, Add, Step, Practice). Start stays on the web (startOnWeb false, as with
     * ROADMAP_GOALS_LIVE off). The milestone's title is Gemini's, kept and not checked: its note and its struck number,
     * as the server sends them. On a Sunday the sprint reads provisional, as on the server.
     */
    override suspend fun quests(): Outcome<QuestsData> {
        pause(300)
        return lock.withLock {
            val now = clock()
            val day = TimeLabels.lifeDay(now)
            val monday = day.with(DayOfWeek.MONDAY)
            val kept = { id: String -> tasks.firstOrNull { it.item.templateId == id }?.item?.kept == true }
            val order = mapOf("RAISE" to 0, "ADD" to 1, "STEP" to 2, "PRACTICE" to 3, "CHECKPOINT" to 4)
            val rows = listOf(
                SprintRow("ADD", "Add 4 cards to Risk Management", if (reviewDone >= 6) "4 of 4 cards · done" else "2 of 4 cards", 4, if (reviewDone >= 6) 4.0 else 2.0, "card", reviewDone >= 6),
                SprintRow("RAISE", "Bring 3 cards to level 6+", "1 of 3 cards", 3, 1.0, "card", false),
                SprintRow("PRACTICE", "Read 20 pages · 3 sessions × 25 min", if (kept("t-read")) "2 of 3 sessions" else "1 of 3 sessions", 3, if (kept("t-read")) 2.0 else 1.0, "session", false, "t-read"),
            ).sortedWith(compareBy({ it.done }, { order[it.kind] ?: 9 }))
            val sunday = day.dayOfWeek == DayOfWeek.SUNDAY
            // Done as the server's questDone reads it (P16's wallet counts the same three): the minimum version is not done.
            val (plan, gym, dentist) = threeDone()
            val three = listOf(
                ThreeQuest("PLAN", "Review 12 cards", plan),
                ThreeQuest("BODY", "Gym legs", gym, "t-gym"),
                ThreeQuest("TASK", "Call the dentist", dentist, "t-dentist"),
            )
            Outcome.Ok(
                QuestsData(
                    now = now.toString(),
                    day = day.toString(),
                    mainQuest = MainQuest(
                        state = "ACTIVE", title = "Trade for a living", line = "42% of the way · due Sun ${day.plusWeeks(2).with(DayOfWeek.SUNDAY).format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))}",
                        milestone = QuestMilestone(
                            2, 6, "Backtest 20 setups", "STARTED", 42, day.plusWeeks(2).with(DayOfWeek.SUNDAY).toString(),
                            titleNote = "Gemini's words · kept by you · not checked", titleStruck = listOf(listOf(9, 11)),
                        ),
                        startOnWeb = false,
                    ),
                    sprint = Sprint(
                        milestoneOrd = 2, weekStart = monday.toString(), weekEnd = monday.plusDays(6).toString(),
                        done = rows.count { it.done }, total = rows.size,
                        status = if (sunday) "provisional" else "live", line = if (sunday) "provisional · final Wed 04:00" else null,
                        rows = rows,
                    ),
                    three = TodaysThree(done = three.count { it.done }, total = 3, frozen = true, chest = if (three.all { it.done }) "ready" else "locked", quests = three),
                )
            )
        }
    }

    /**
     * The five attributes as a server with life launched sends them (docs/mobile-api.md `GET /status`), in the panel's
     * order: Vitality (the Body track, read from the demo board, so the gym tick on Check moves its meter here too),
     * Intellect (Knowledge), Craft, Duty (capped at its kept-week cap) and Care (untouched); then Capital, a reading only:
     * one deal won this month, one last month, none the month before. Nothing here is a level of its own. Then the avatar
     * targets (P4), as the web words them: Train's weight goal, a Field's level, Craft's hours, a Care measure of your own
     * (self-reported) and revenue a month; a record, never a level. Then the skills (P5), as You › Skills lists them: each
     * attribute counts its own.
     */
    override suspend fun status(): Outcome<StatusPanel> {
        pause(300)
        return lock.withLock {
            val now = clock()
            val day = TimeLabels.lifeDay(now)
            val kept = { id: String -> tasks.firstOrNull { it.item.templateId == id }?.item?.kept == true }
            val pips = { s: String -> s.map { if (it == 'k') "kept" else if (it == 'h') "held" else "missed" } }
            // Body at level 6 (1,764 XP) toward 7 (2,401 XP); the gym tick adds what it pays.
            val bodyXp = 1960.0 + if (kept("t-gym")) 8.3 else 0.0
            val body = (bodyXp - 1764.0) / (2401.0 - 1764.0)
            val skills = demoSkills()
            val month = { m: java.time.YearMonth -> m.month.getDisplayName(java.time.format.TextStyle.FULL, Locale.ENGLISH) }
            val ym = java.time.YearMonth.from(day)
            val months = listOf(
                CapitalMonth(ym.toString(), "${month(ym)} ${ym.year}", 1_240_000, "\$12,400", 1),
                CapitalMonth(ym.minusMonths(1).toString(), "${month(ym.minusMonths(1))} ${ym.minusMonths(1).year}", 820_000, "\$8,200", 1),
                CapitalMonth(ym.minusMonths(2).toString(), "${month(ym.minusMonths(2))} ${ym.minusMonths(2).year}", 0, "\$0", 0),
            )
            Outcome.Ok(
                StatusPanel(
                    now = now.toString(),
                    day = day.toString(),
                    launched = true,
                    attributes = listOf(
                        StatusAttribute(
                            "VITALITY", "Vitality", "Body", 6, round(body * 1000) / 1000, 0.25, cap = 9, keptStreak = 4, weeks = pips("kkkokkkk"),
                            line = "%,d / 2,401 XP · depth cap 9 · 7 more kept weeks raise it".format(Locale.ENGLISH, bodyXp.toInt()), unit = "xp",
                            skills = skills.count { it.attribute == "VITALITY" },
                        ),
                        StatusAttribute(
                            "INTELLECT", "Intellect", "Knowledge", 17, 0.52, 0.44, line = "6 Fields, the best counts fully · Statistics grew most this week", unit = "pts",
                            skills = skills.count { it.attribute == "INTELLECT" },
                        ),
                        StatusAttribute(
                            "CRAFT", "Craft", "Craft", 6, 0.45, 0.4, cap = 7, keptStreak = 1, weeks = pips("kkkokkok"), line = "2,050 / 2,401 XP · depth cap 7 · 1 more kept week raises it",
                            skills = skills.count { it.attribute == "CRAFT" },
                        ),
                        StatusAttribute("DUTY", "Duty", "Duty", 7, 1.0, 1.0, cap = 7, atCap = true, keptStreak = 1, weeks = pips("kkkkkkok"), line = "Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked"),
                        StatusAttribute("CARE", "Care", "Care", 0, 0.0, 0.0, cap = 2, keptStreak = 0, weeks = pips("oooooooo"), line = "No Care tasks yet · 49 XP reaches level 1"),
                    ),
                    capital = CapitalReading(
                        months[0].month, months[0].label, months[0].wonCents, months[0].won, months[0].deals,
                        line = "1 deal won in ${month(ym)}",
                        history = months.drop(1).joinToString(" · ") { "${it.label.substringBefore(' ')} ${it.won}" },
                        months = months,
                    ),
                    targets = demoTargets(day),
                    skills = skills,
                )
            )
        }
    }

    /**
     * The demo's skills (P5), as the server derives them (competency.ts): Writing (Craft, Tier 2), Reading (Intellect, a
     * read tick short of Tier 2), Strength (Vitality, fed by the gym) and Walking (Vitality, walks count), most hours
     * first, each in the web's own words. Hours come from the ticks linked to each, so a tick on Check moves them here.
     */
    private fun demoSkills(): List<StatusSkill> {
        val kept = { id: String -> tasks.firstOrNull { it.item.templateId == id }?.item?.kept == true }
        val read = kept("t-read")
        val gym = kept("t-gym")
        return listOf(
            demoSkill("sk-write", "Writing", "CRAFT", "PRACTICE", 142.5, ticks = 171, templates = 2),
            demoSkill("sk-read", "Reading", "INTELLECT", "PRACTICE", 99.75 + (if (read) 25.0 / 60 else 0.0), ticks = 239 + (if (read) 1 else 0), templates = 1),
            demoSkill("sk-strength", "Strength", "VITALITY", "PRACTICE", 41.5 + (if (gym) 1.0 else 0.0), ticks = 41 + (if (gym) 1 else 0), templates = 1),
            demoSkill("sk-walk", "Walking", "VITALITY", "EXERCISE", 12.5, ticks = 0, walks = 9, templates = 0),
        ).sortedByDescending { it.hours }
    }

    /** The template a demo skill is fed by (the gym and the read habit; the others have no row on today's board). */
    private val skillOfTemplate = mapOf("t-read" to "sk-read", "t-gym" to "sk-strength")

    /** Hours as the web's lines say them: floored, to 0.1 below 100 h, whole from 100. */
    private fun hoursText(h: Double): String =
        if (h < 100) "%,.1f".format(Locale.ENGLISH, floor(h * 10 + 1e-9) / 10).removeSuffix(".0") else "%,d".format(Locale.ENGLISH, floor(h + 1e-9).toLong())

    /** One skill with the server's tier rules and words (0–100, 100–500, 500–2,000, 2,000–10,000 h). */
    private fun demoSkill(id: String, name: String, attribute: String, kind: String, hours: Double, ticks: Int, walks: Int = 0, templates: Int): StatusSkill {
        val bands = listOf(0 to 100, 100 to 500, 500 to 2000, 2000 to 10000)
        val i = bands.indexOfLast { hours + 1e-9 >= it.first }.coerceAtLeast(0)
        val (from, to) = bands[i]
        val toNext = if (i == bands.lastIndex) null else round((to - hours) * 100) / 100
        val line = if (ticks == 0 && walks > 0) "${hoursText(hours)} h of walks" else "≈ ${hoursText(hours)} h (task estimates, not timed${if (walks > 0) ", walks as logged" else ""})"
        val range = "Tier ${i + 1} · %,d–%,d h".format(Locale.ENGLISH, from, to)
        return StatusSkill(
            id = id, name = name, attribute = attribute, kind = kind, fieldName = null,
            hours = round(hours * 100) / 100, tier = i + 1, tierFrom = from, tierTo = to,
            progress = round(((hours - from) / (to - from)).coerceIn(0.0, 1.0) * 1000) / 1000, toNext = toNext,
            line = line, tierLine = if (toNext == null) range else "$range · ${hoursText(toNext)} h to Tier ${i + 2}",
            ticks = ticks, walks = walks, templates = templates,
        )
    }

    /** A tick's skill (P5), read after the tick as the server does; a tier crossed for the first time is a tier-up (and its Seal). */
    private fun tickSkillOf(templateId: String): Pair<TickSkill, JsonElement?>? {
        val id = skillOfTemplate[templateId] ?: return null
        val s = demoSkills().firstOrNull { it.id == id } ?: return null
        val up = s.tier >= 2 && skillSeals.add("competency:${s.id}:t${s.tier}")
        val seal = if (up) buildJsonObject { put("tier", 2); put("kind", "competency-tier"); put("title", "${s.name} reached Tier ${s.tier}") } else null
        return TickSkill(s.id, s.name, s.hours, s.tier, up, s.line) to seal
    }

    /** The demo's avatar targets (P4), the web's own lines: dated from the first of this month. */
    private fun demoTargets(day: java.time.LocalDate): List<StatusTarget> {
        val from = day.withDayOfMonth(1).toString()
        return listOf(
            StatusTarget("weight", "VITALITY", "Weight", "WEIGHT", "kg", "DOWN", 87.0, from, 75.0, day.plusMonths(4).toString(), 82.4, day.toString(), "WEIGHT", 0.383, "ON_PACE", "Weight 82.4 → 75 kg · 38% of the way · on pace"),
            StatusTarget("t-stats", "INTELLECT", "Statistics level", "FIELD_LEVEL", "level", "UP", 8.0, from, 12.0, day.plusMonths(2).toString(), 9.4, day.toString(), "COMPUTED", 0.35, "ON_PACE", "Statistics level 9.4 → 12 · 35% of the way · on pace"),
            StatusTarget("t-deep", "CRAFT", "Deep work", "TRACK_HOURS", "h", "UP", 4.0, from, 10.0, null, 6.5, null, "COMPUTED", 0.417, null, "Deep work ≈ 6.5 → 10 h a week · 41% of the way"),
            StatusTarget("t-calls", "CARE", "Calls home", "MANUAL", "", "UP", 1.0, from, 3.0, null, 2.0, day.minusDays(1).toString(), "SELF", 0.5, null, "Calls home 2 → 3 · 50% of the way · self-reported"),
            StatusTarget("t-rev", "CAPITAL", "Revenue", "REVENUE_MONTH", "AUD", "UP", 8200.0, from, 20000.0, day.plusMonths(8).toString(), 12400.0, day.toString(), "COMPUTED", 0.356, "ON_PACE", "Revenue \$12,400 → \$20,000 a month · 35% of the way · on pace"),
        )
    }

    // ── The Mall (blueprint P18; D30) ──────────────────────────────────────────

    /** The rewards listed in the demo: none to start (D30: no starter rewards), so its Mall opens empty, as a new one does. */
    private val rewards = mutableListOf<MallReward>()
    /** P19: the demo's purchases, oldest first: each its reward, price as bought, instant and whether it was undone. */
    private class DemoPurchase(val id: String, val rewardId: String, val title: String, val price: Int, val at: Instant, var refunded: Boolean = false)
    private val purchases = mutableListOf<DemoPurchase>()

    /** A reward's Buy state as the server's planBuy decides it: below zero, a cooldown, too few credits; else it can. */
    private fun buyState(r: MallReward, now: Instant): MallBuyState {
        val balance = wallet().balance
        val today = TimeLabels.lifeDay(now)
        return when {
            balance < 0 -> MallBuyState(false, MallLine.negativeLine(balance))
            cooldownNext(r, today) != null -> MallBuyState(false, MallLine.cooldownRefusal(r.cooldownDays ?: 1, cooldownNext(r, today)!!))
            r.price > balance -> MallBuyState(false, MallLine.shortLine(r.title, r.price, balance))
            else -> MallBuyState(true, null)
        }
    }

    /** The day a reward's cooldown lets it be bought again, while still ahead (an undone purchase does not count). */
    private fun cooldownNext(r: MallReward, today: java.time.LocalDate): java.time.LocalDate? {
        val days = r.cooldownDays ?: return null
        val last = purchases.filter { it.rewardId == r.id && !it.refunded }.maxOfOrNull { TimeLabels.lifeDay(it.at) } ?: return null
        val next = last.plusDays(days.toLong())
        return if (today.isBefore(next)) next else null
    }

    /** A purchase as GET /mall lists it, at [now]: its undo window while it lasts. */
    private fun purchaseOf(p: DemoPurchase, now: Instant): MallPurchase {
        val until = p.at.plusSeconds(MallLine.UNDO_MINUTES * 60L)
        return MallPurchase(
            id = p.id, rewardId = p.rewardId, title = p.title, price = p.price, priceLine = "${WalletLine.figure(p.price)} ${WalletLine.UNIT}",
            day = TimeLabels.lifeDay(p.at).toString(), occurredAt = p.at.toString(), at = TimeLabels.clock(p.at, h24 = true), refunded = p.refunded,
            undoUntil = if (!p.refunded && !now.isAfter(until)) until.toString() else null,
            line = MallLine.boughtWhen(TimeLabels.lifeDay(p.at), p.at, p.price, p.refunded),
        )
    }
    /** The demo's good day, as the server reads one from a wallet that has counted for weeks (the demo plays that server). */
    private val demoGoodDay = MallGoodDay(credits = 40, days = 28, earningDays = 21)

    /** You › Mall as the server sends it: the demo's wallet over the rewards listed so far, by category. */
    override suspend fun mall(): Outcome<MallData> {
        pause(220)
        return lock.withLock {
            val now = clock()
            val w = wallet()
            val order = MALL_CATEGORIES.map { it.key }
            Outcome.Ok(
                MallData(
                    now = now.toString(), day = TimeLabels.lifeDay(now).toString(),
                    credits = w, creditsLine = WalletLine.today(w),
                    goodDay = demoGoodDay, hintLine = "A good day is 40 cr: the middle of the 21 days that earned credits in the last 28.",
                    categories = MALL_CATEGORIES,
                    // A stable sort: each category keeps the order its rewards were listed in. P19: each with its Buy state.
                    rewards = rewards.sortedBy { order.indexOf(it.category) }.map { it.copy(buy = buyState(it, now)) },
                    purchases = purchases.asReversed().take(20).map { purchaseOf(it, now) },
                    limits = MallLimits(), notes = MALL_NOTES, writesOn = true, ready = true,
                ),
            )
        }
    }

    /** The Add sheet's save, with the server's checks and its own words (a mistyped field is bad; a rule's refusal a conflict). */
    override suspend fun addReward(title: String, category: String, price: Int, note: String?, cooldownDays: Int?, clientId: String): Outcome<AddRewardResult> {
        pause(260)
        val body = buildJsonObject {
            put("title", title); put("category", category); put("price", price)
            if (note != null) put("note", note)
            if (cooldownDays != null) put("cooldownDays", cooldownDays)
        }
        return lock.withLock {
            once<AddRewardResult>(clientId, body) {
                val t = title.replace(Regex("\\s+"), " ").trim()
                val l = MallLimits()
                val conflict = { line: String -> Outcome.Err(line, code = "conflict", status = 409) }
                when {
                    t.isEmpty() -> bad("title is missing.")
                    title.length > l.titleMax -> bad("title is too long (at most ${l.titleMax} characters).")
                    MALL_CATEGORIES.none { it.key == category } -> bad("category must be one of ${MALL_CATEGORIES.joinToString(", ") { it.key }}.")
                    note != null && note.length > l.noteMax -> bad("note must be text of at most ${l.noteMax} characters.")
                    rewards.size >= l.rewardsMax -> conflict("${l.rewardsMax} rewards is the most: archive one first.")
                    PLAY_TAG.containsMatchIn(t) -> conflict(FREE_PLAY_LINE)
                    REST_WORDS.containsMatchIn(t) -> conflict(FREE_REST_LINE)
                    rewards.any { it.title.equals(t, ignoreCase = true) } -> conflict("You already list “$t”.")
                    price !in l.priceMin..l.priceMax -> conflict(PRICE_RANGE_LINE)
                    cooldownDays != null && cooldownDays !in l.cooldownMin..l.cooldownMax -> conflict(COOLDOWN_RANGE_LINE)
                    else -> {
                        val r = MallReward(
                            id = "rw-" + UUID.randomUUID().toString().take(8), title = t, category = category,
                            categoryLabel = MALL_CATEGORIES.first { it.key == category }.label,
                            price = price, priceLine = "${WalletLine.figure(price)} ${WalletLine.UNIT}", hint = MallLine.hintFor(price, demoGoodDay),
                            note = note?.replace(Regex("\\s+"), " ")?.trim()?.ifEmpty { null }, cooldownDays = cooldownDays,
                            cooldownLine = cooldownDays?.let { if (it == 1) "at most once a day" else "at most once every $it days" },
                        )
                        rewards += r
                        Outcome.Ok(AddRewardResult(r.id, r))
                    }
                }
            }
        }
    }

    /**
     * Buy's Confirm (P19), with the server's rules and words: a reward gone is gone; below zero, a cooldown or too few
     * credits is a conflict; else the price is burnt exactly and the purchase plays its Seal. The same clientId answers
     * once (a resend never buys twice).
     */
    override suspend fun buyReward(rewardId: String, clientId: String): Outcome<BuyResult> {
        pause(260)
        val body = buildJsonObject { put("rewardId", rewardId) }
        return lock.withLock {
            once<BuyResult>(clientId, body) {
                val now = clock()
                val r = rewards.firstOrNull { it.id == rewardId } ?: return@once Outcome.Err(MallLine.REWARD_GONE, code = "gone", status = 404)
                val state = buyState(r, now)
                if (!state.can) return@once Outcome.Err(state.why ?: MallLine.REWARD_GONE, code = "conflict", status = 409)
                val p = DemoPurchase("p-" + UUID.randomUUID().toString().take(8), r.id, r.title, r.price, now)
                purchases += p
                val balance = wallet().balance
                Outcome.Ok(
                    BuyResult(
                        purchase = purchaseOf(p, now), credits = CreditsChange(-p.price, balance), duplicate = false,
                        line = MallLine.boughtLine(r.title, r.price, balance),
                        celebrations = listOf(buildJsonObject { put("tier", 2); put("kind", "mall-buy"); put("title", "${r.title} bought") }),
                    ),
                )
            }
        }
    }

    /** A purchase's Undo (P19): inside its ten minutes, once; past them a conflict in the server's words. */
    override suspend fun undoBuy(purchaseId: String, clientId: String): Outcome<UndoBuyResult> {
        pause(220)
        val body = buildJsonObject { put("purchaseId", purchaseId) }
        return lock.withLock {
            once<UndoBuyResult>(clientId, body) {
                val now = clock()
                val p = purchases.firstOrNull { it.id == purchaseId } ?: return@once Outcome.Err(MallLine.PURCHASE_GONE, code = "gone", status = 404)
                if (p.refunded) return@once Outcome.Ok(UndoBuyResult(p.id, CreditsChange(0, wallet().balance), duplicate = true, line = "${p.title} was already undone."))
                if (now.isAfter(p.at.plusSeconds(MallLine.UNDO_MINUTES * 60L))) return@once Outcome.Err(MallLine.UNDO_TOO_LATE, code = "conflict", status = 409)
                p.refunded = true
                Outcome.Ok(UndoBuyResult(p.id, CreditsChange(p.price, wallet().balance), duplicate = false, line = MallLine.undoneLine(p.title, p.price)))
            }
        }
    }

    /** Health Connect's records already here (P27): a walk lands once per record, as the server's 'ingest:hc:<id>' row. */
    private val healthSeen = mutableSetOf<String>()

    /**
     * A sync's batch (P27), as the server answers it: a record seen before is a duplicate; a walk that started before
     * `since` is the backfill (recorded, never paid); a newer one dated today or yesterday pays about what a walk pays
     * (B 10 a minute-ish, here 0.4 XP a minute); a weigh-in lands. The line is the server's words (HealthLine.syncLine).
     */
    override suspend fun syncHealth(batch: HealthBatch, clientId: String): Outcome<HealthSyncResult> {
        pause(200)
        val body = healthBody(batch)
        return lock.withLock {
            once<HealthSyncResult>(clientId, body) {
                val since = runCatching { Instant.parse(batch.since) }.getOrNull() ?: return@once bad("since must be an ISO instant.")
                if (batch.walks.size > HealthLine.SERVER_MAX || batch.weights.size > HealthLine.SERVER_MAX) return@once bad("walks takes at most ${HealthLine.SERVER_MAX} at a time.")
                val today = TimeLabels.lifeDay(clock())
                var walks = HealthWalkCounts()
                val refused = mutableListOf<HealthRefusal>()
                for (w in batch.walks.sortedBy { it.start }) {
                    val start = runCatching { Instant.parse(w.start) }.getOrNull() ?: return@once bad("walks: start must be an ISO instant.")
                    val end = runCatching { Instant.parse(w.end) }.getOrNull() ?: return@once bad("walks: end must be an ISO instant.")
                    if (!healthSeen.add("w:${w.externalId}")) { walks = walks.copy(duplicate = walks.duplicate + 1); continue }
                    if (w.distanceKm < 0.01) { refused += HealthRefusal("walk", w.externalId, "A distance between 0.01 and 200 km, please."); continue }
                    val minutes = Duration.between(start, end).toMinutes().toDouble()
                    val day = TimeLabels.lifeDay(start)
                    val pays = !start.isBefore(since) && !day.isBefore(today.minusDays(1)) && minutes >= 5
                    walks = if (pays) walks.copy(added = walks.added + 1, paid = walks.paid + 1, xp = round((walks.xp + minutes * 0.4) * 10) / 10)
                    else walks.copy(added = walks.added + 1, recorded = walks.recorded + 1)
                }
                var weights = HealthWeightCounts()
                for (x in batch.weights) {
                    if (!healthSeen.add("kg:${x.externalId}")) { weights = weights.copy(kept = weights.kept + 1); continue }
                    if (x.kg < 20 || x.kg > 400) { refused += HealthRefusal("weight", x.externalId, "A weight between 20 and 400 kg, please."); continue }
                    weights = weights.copy(added = weights.added + 1)
                }
                Outcome.Ok(HealthSyncResult(walks, weights, refused, HealthLine.syncLine(walks, weights, refused.size)))
            }
        }
    }

    // ── The check-in (health phase 2; docs/mobile-api.md POST /checkin, /checkin/undo) ──

    /** A check-in kept here: its id and the instant it was booked at. The demo keeps no value: the counts need none. */
    private data class DemoCheck(val id: String, val at: Instant)
    private val checks = mutableListOf<DemoCheck>()

    /**
     * POST /checkin, as the server answers it: the shape checked (400, the route's words), `at` kept as the core keeps it
     * (a few minutes ahead booked at the clock, further refused; more than 7 life days back refused, 409), once per
     * clientId. The answer's line is the time alone; the words are the grid's (mind.ts cellWordsOf). No ledger row.
     */
    override suspend fun checkin(body: CheckinBody, clientId: String): Outcome<CheckinResult> {
        pause(240)
        val json = JsonObject(checkinJson(body, clientId) - "clientId")
        return lock.withLock {
            once(clientId, json) {
                val now = clock()
                val at = TimeLabels.parseInstant(body.at) ?: return@once bad("at must be an ISO instant: when the check-in was made.")
                val steps = "a whole number from ${CheckinLine.MIN} to ${CheckinLine.MAX}"
                if (!CheckinLine.isValue(body.valence)) return@once bad("valence must be $steps.")
                if (!CheckinLine.isValue(body.energy)) return@once bad("energy must be $steps.")
                if (body.stress != null && body.stress !in CheckinLine.STRESS_LEVELS.indices) return@once bad("stress must be a whole number from 0 to 4, or left out.")
                if (body.trigger != "self" && body.trigger != "prompted") return@once bad("trigger must be 'self' or 'prompted'.")
                if (body.via !in CheckinLine.VIAS) return@once bad("via must be 'check', 'widget', 'tile' or 'notify'.")
                if (body.tookMs != null && body.tookMs < 0) return@once bad("tookMs must be a whole number of milliseconds, or left out.")
                if (at.isAfter(now.plus(Duration.ofMinutes(5)))) return@once Outcome.Err("A check-in can't be logged ahead of time.", code = "conflict", status = 409)
                val booked = if (at.isAfter(now)) now else at
                val day = TimeLabels.lifeDay(booked)
                if (java.time.temporal.ChronoUnit.DAYS.between(day, TimeLabels.lifeDay(now)) > CheckinLine.MAX_AGE_DAYS) {
                    return@once Outcome.Err("That check-in is more than a week old.", code = "conflict", status = 409)
                }
                val id = "mc-" + UUID.randomUUID().toString().take(8)
                checks += DemoCheck(id, booked)
                Outcome.Ok(
                    CheckinResult(
                        id = id, day = day.toString(), line = "Logged ${TimeLabels.clock(booked, h24 = true)}",
                        words = CheckinLine.wordsOf(body.valence, body.energy),
                        undoUntil = now.plusMillis(CheckinLine.UNDO_MS).toString(), duplicate = false,
                    )
                )
            }
        }
    }

    /** POST /checkin/undo, as the server answers it: the check-in's own Delete, harmless twice ("Already deleted."). */
    override suspend fun checkinUndo(id: String, clientId: String): Outcome<CheckinUndoResult> {
        pause(200)
        return lock.withLock {
            if (id.isBlank() || id.length > 64) return@withLock bad("id must be a check-in's id.")
            val gone = checks.removeAll { it.id == id }
            Outcome.Ok(CheckinUndoResult(id, if (gone) 1 else 0, if (gone) "Check-in taken back." else "Already deleted."))
        }
    }

    // ── The lift (health phase 2; docs/mobile-api.md /check's `lift`, POST /lift/set) ──

    /** One of the last lift's sets (kilograms, as stored). */
    private data class DemoSet(val kind: String, val kg: Double, val reps: Int)

    /**
     * A movement of the demo's open lift: its last finished lift's sets (the web logger's prefill), its best working
     * weight of the 8 weeks before (a set over it by more than 15 % asks the big-jump question) and the rest after a set.
     */
    private data class DemoMove(val entryId: String, val key: String, val name: String, val last: List<DemoSet>, val bestKg: Double?, val restSec: Int)

    /**
     * "Push day", started 25 minutes before the demo began, a warm-up of the bench already done. The bench's last lift
     * ended on 72.5 × 5, a big jump never kept on the web (so its best is still 60): copied again, it asks again. The
     * cable fly has no last lift: its first set's figures go in on the web.
     */
    private val liftId = "lift-push"
    private val liftStartedAt: Instant = clock().minus(Duration.ofMinutes(25))
    private val moves = listOf(
        DemoMove("e-bench", "bench_press", "Bench press", listOf(DemoSet("WARMUP", 40.0, 10), DemoSet("WORKING", 60.0, 8), DemoSet("WORKING", 60.0, 8), DemoSet("WORKING", 72.5, 5)), bestKg = 60.0, restSec = 180),
        DemoMove("e-ohp", "overhead_press", "Overhead press", listOf(DemoSet("WORKING", 40.0, 8), DemoSet("WORKING", 40.0, 8), DemoSet("WORKING", 40.0, 6)), bestKg = 42.5, restSec = 180),
        DemoMove("e-fly", "cable_fly", "Cable fly", emptyList(), bestKg = null, restSec = 90),
    )
    private val liftDone: Map<String, MutableList<LiftSet>> = mapOf(
        "e-bench" to mutableListOf(LiftSet("s-warm", "e-bench", 1, "WARMUP", weightKg = 40.0, reps = 10, doneAt = liftStartedAt.plus(Duration.ofMinutes(8)).toString())),
        "e-ohp" to mutableListOf(),
        "e-fly" to mutableListOf(),
    )

    /** "60", "72.5": a weight as the logger writes it. */
    private fun kgText(kg: Double): String = if (kg == floor(kg)) kg.toLong().toString() else kg.toString()

    /** The lift as /check sends it: the next set by the web logger's prefill (the movement being worked first, then the lift's order). */
    private fun liftNow(): OpenLift {
        val rows = moves.mapNotNull { m ->
            val done = liftDone.getValue(m.entryId)
            val fromLast = m.last.isNotEmpty()
            val row = if (fromLast) m.last.getOrNull(done.size) else if (done.isEmpty()) DemoSet("WORKING", 0.0, 0) else null
            row?.let { Triple(m, it, fromLast) }
        }
        val newest = liftDone.values.flatten().maxByOrNull { it.doneAt.orEmpty() }?.entryId
        val pick = rows.firstOrNull { it.first.entryId == newest } ?: rows.firstOrNull()
        val next = pick?.let { (m, r, fromLast) ->
            LiftNext(
                entryId = m.entryId, movementKey = m.key, name = m.name, ord = liftDone.getValue(m.entryId).size + 1, kind = r.kind,
                weightKg = if (fromLast) r.kg else null, reps = if (fromLast) r.reps else null, unit = "kg", fromLast = fromLast,
                setText = if (fromLast) "${kgText(r.kg)} kg × ${r.reps}" else null,
                ghostLine = if (fromLast) "last ${kgText(r.kg)} × ${r.reps}" else null,
            )
        }
        return OpenLift(liftId, "Push day", liftStartedAt.toString(), next)
    }

    /**
     * POST /lift/set, as the server answers it: the lift and the movement must be there (404, the core's words), the
     * figures in the core's bounds (409), the set taking the movement's next place, once per clientId. The rest after it is
     * the movement's (60 after a warm-up); a working set more than 15 % over the best asks the big jump in plain words and
     * stands as a record. No ledger row.
     */
    override suspend fun liftSet(body: LiftSetBody, clientId: String): Outcome<LiftSetResult> {
        pause(260)
        val json = JsonObject(liftSetJson(body, clientId) - "clientId")
        return lock.withLock {
            once(clientId, json) {
                val now = clock()
                if (body.sessionId != liftId) return@once Outcome.Err("That lift is no longer here.", code = "gone", status = 404)
                val m = moves.firstOrNull { it.entryId == body.entryId } ?: return@once Outcome.Err("That movement is no longer in this lift.", code = "gone", status = 404)
                val at = TimeLabels.parseInstant(body.doneAt) ?: return@once bad("doneAt must be an ISO instant.")
                if (at.isAfter(now.plus(Duration.ofMinutes(1)))) return@once Outcome.Err("That set's time isn't valid.", code = "conflict", status = 409)
                val reps = body.reps
                if (reps == null || reps !in 1..100) return@once Outcome.Err("Reps from 1 to 100, please.", code = "conflict", status = 409)
                val kg = body.weightKg ?: 0.0
                if (kg < 0 || kg > 500) return@once Outcome.Err("A weight from 0 to 500 kg, please.", code = "conflict", status = 409)
                val kind = body.kind ?: "WORKING"
                val done = liftDone.getValue(m.entryId)
                val set = LiftSet(
                    "s-" + UUID.randomUUID().toString().take(8), m.entryId, done.size + 1, kind, weightKg = kg, reps = reps, amrap = body.amrap,
                    doneAt = (if (at.isBefore(liftStartedAt)) liftStartedAt else if (at.isAfter(now)) now else at).toString(),
                )
                done += set
                val text = "${kgText(kg)} kg × $reps" + if (body.amrap) " · AMRAP" else ""
                val after = liftNow()
                // The web logger's rest (training.ts restAfterOf, as POST /lift/set answers it): none before this set's
                // drop, 20 s before its rest-pause, else the movement's own (60 after a warm-up).
                val rest = when {
                    after.next?.entryId == m.entryId && after.next.kind == "DROP" -> 0
                    after.next?.entryId == m.entryId && after.next.kind == "MINI" -> 20
                    kind == "WARMUP" -> 60
                    else -> m.restSec
                }
                val best = m.bestKg
                val jump = if (kind == "WORKING" && best != null && kg > best * 1.15) {
                    LiftJump("Big jump: ${kgText(kg)} kg (best ${kgText(best)}). $LIFT_JUMP_NOTE", "/train/exercise")
                } else null
                Outcome.Ok(LiftSetResult(set, duplicate = false, restSec = rest, line = "${m.name}: logged $text.", jump = jump, lift = after))
            }
        }
    }

    override suspend fun completeTask(templateId: String, mvv: Boolean, clientId: String, minutes: Int?, sessionId: String?, pages: Int?, yesterday: Boolean, day: String?): Outcome<CompleteResult> {
        pause()
        val body = buildJsonObject {
            put("templateId", templateId); put("mvv", mvv)
            put("day", day ?: if (yesterday) "yesterday" else "today")
            minutes?.let { put("minutes", it) }
            sessionId?.let { put("sessionId", it) }
            pages?.let { putJsonObject("proof") { put("kind", "PAGES"); put("qty", it) } }
        }
        return lock.withLock {
            once(clientId, body) {
                if (minutes != null && minutes !in 1..ProofLine.MINUTES_MAX) return@once Outcome.Err("minutes must be a whole number from 1 to 480.", code = "bad", status = 400)
                if (pages != null && pages !in 1..ProofLine.PAGES_MAX) return@once Outcome.Err("proof.qty must be a whole number of pages from 1 to ${ProofLine.PAGES_MAX}.", code = "bad", status = 400)
                // P8: the day as the server resolves it (tasks.ts resolveDay), by the check clock: the word, or a day key
                // that is today or yesterday; an older one is refused in the server's words. Yesterday's is the lane's record.
                val today = TimeLabels.lifeDay(clock())
                val booked = if (day == null) (if (yesterday) today.minusDays(1) else today) else TimeLabels.parseDay(day)
                    ?: return@once bad("day must be 'today', 'yesterday' or a YYYY-MM-DD day.")
                if (booked != today && booked != today.minusDays(1)) {
                    return@once Outcome.Err("The board is out of date: that day can no longer be recorded. Refresh and try again.", code = "conflict", status = 409)
                }
                if (booked != today) return@once recordYesterday(templateId, mvv, minutes)
                val i = tasks.indexOfFirst { it.item.templateId == templateId }
                if (i < 0) return@once Outcome.Err("That task is no longer on today's board.", code = "gone", status = 404)
                val t = tasks[i]
                if (t.item.locked) return@once Outcome.Err("A study task completes itself from today's reviews.", code = "conflict", status = 409)
                if (t.item.kept) return@once Outcome.Ok(CompleteResult(t.instanceId ?: "i-x", 0.0, "Already recorded. Nothing is paid twice.", board().allDone, credits = creditsSince(wallet())))
                // P23, as the server gates it: a proof task's full tick takes its minutes or its timer, counted once.
                val timer = t.item.timer
                if (sessionId != null && timer?.sessionId != sessionId) return@once Outcome.Err("That timer is gone.", code = "gone", status = 404)
                val timed = timer?.let { ProofLine.timerMinutes(it, clock()) }?.takeIf { it >= 1 && !mvv }
                val reported = minutes ?: timed
                if (t.item.proof && !mvv && reported == null) {
                    return@once Outcome.Err("Log the minutes: this is deep work, so it counts its time. Pick the minutes, or start its timer.", code = "conflict", status = 409)
                }
                // P24, as the server gates it: a reading task's full tick takes its pages, at least the day's target.
                val read = if (t.item.pages != null && !mvv) pages else null
                ProofLine.pagesRefusal(t.item.pages?.target.takeIf { !mvv }, read)?.let { return@once Outcome.Err(it, code = "conflict", status = 409) }
                val walletBefore = wallet()
                // The minutes as the server counts them, priced by E(m) against the estimate's (life-grade's curve): a
                // report with the drawer's clamp, a timer's count bounded by what it ran (proof.ts tickWallOf).
                val estimate = t.item.minutes ?: 30
                val counted = reported?.let { if (minutes == null) ProofLine.countedTimer(it, estimate) else ProofLine.counted(it, estimate) }
                val effort = { m: Int -> min(1.4, 0.5 + m / (m + 30.0)) }
                val scale = if (counted != null && !mvv) effort(counted) / effort(estimate) else 1.0
                val raw = round((t.item.xpHint ?: 2.0) * (if (mvv) 0.5 else 1.0) * scale * 10) / 10
                // P7: through the daily knee, from the raw today already holds (the full rate to 100 raw: the price as is).
                val before = kneeToday + rawToday
                val xp = round(TickNote.kneePay(before, raw) * 10) / 10
                rawToday += raw
                val instance = "i-" + UUID.randomUUID().toString().take(8)
                // The row's timer is counted, or closed counting nothing (a report, or the minimum, took its place).
                tasks[i] = t.copy(item = t.item.copy(status = if (mvv) "DONE_MVV" else "DONE", xpHint = xp, timer = null), instanceId = instance, raw = raw)
                if (!streak.keptToday) streak = streak.copy(keptToday = true, days = streak.days + 1)
                level = gain(level, xp / 120.0)
                val track = when (t.item.lane) { "MUST" -> "Body"; "HABIT" -> "Care"; else -> "Duty" }
                val clear = board().allDone
                // P5: the skill the task feeds, after the tick (Reading crosses 100 h on the first read tick: Tier 2).
                val skill = tickSkillOf(templateId)
                Outcome.Ok(
                    CompleteResult(
                        instanceId = instance, xp = xp,
                        line = "+$xp XP · $track" + (if (t.item.proof && !mvv && counted != null) " · $counted min" else "") +
                            (read?.let { " · ${ProofLine.pagesLabel(it)}" } ?: "") +
                            // P29: a full tick says its C, as the server's tick line does ('· streak ×1.16'); never the minimum.
                            (if (!mvv) streak.multiplier?.takeIf { it.value > 1.0 }?.let { " · streak ${StreakLine.mult(it.value)}" } ?: "" else "") +
                            if (mvv) " · minimum" else "",
                        allDone = clear,
                        celebrations = listOfNotNull(
                            skill?.second,
                            if (clear) buildJsonObject { put("tier", 1); put("kind", "board-clear"); put("title", "Board clear") } else null,
                        ),
                        level = level,
                        competency = skill?.first,
                        credits = creditsSince(walletBefore),
                        knee = TickNote.knee(before, raw, TimeLabels.lifeDay(clock()).toString(), yesterday = false),
                    )
                )
            }
        }
    }

    /**
     * P7, as the server records a row of the Yesterday lane (day 'yesterday'): only a row the lane lists (else the
     * server's "Only what was due yesterday …", 409), once (a repeat is "Already recorded"), at T 1.00 (its xpHint, the
     * minimum at half), on yesterday's knee; its line ends "· yesterday". It moves nothing on today's board.
     */
    private fun recordYesterday(templateId: String, mvv: Boolean, minutes: Int?): Outcome<CompleteResult> {
        val i = yesterdayTasks.indexOfFirst { it.item.templateId == templateId }
        if (i < 0) return Outcome.Err("Only what was due yesterday can be recorded for yesterday.", code = "conflict", status = 409)
        val t = yesterdayTasks[i]
        if (t.item.kept) return Outcome.Ok(CompleteResult(t.instanceId ?: "i-x", 0.0, "Already recorded. Nothing is paid twice.", board().allDone, credits = creditsSince(wallet())))
        val walletBefore = wallet()
        val estimate = t.item.minutes ?: 30
        val effort = { m: Int -> min(1.4, 0.5 + m / (m + 30.0)) }
        val scale = if (minutes != null && !mvv) effort(ProofLine.counted(minutes, estimate)) / effort(estimate) else 1.0
        val raw = round((t.item.xpHint ?: 2.0) * (if (mvv) 0.5 else 1.0) * scale * 10) / 10
        val before = kneeYesterday + rawYesterday
        val xp = round(TickNote.kneePay(before, raw) * 10) / 10
        rawYesterday += raw
        val instance = "i-" + UUID.randomUUID().toString().take(8)
        yesterdayTasks[i] = t.copy(item = t.item.copy(status = if (mvv) "DONE_MVV" else "DONE", xpHint = xp), instanceId = instance, raw = raw)
        level = gain(level, xp / 120.0)
        val track = when (t.item.lane) { "MUST" -> "Body"; "HABIT" -> "Care"; else -> "Duty" }
        return Outcome.Ok(
            CompleteResult(
                instanceId = instance, xp = xp,
                line = "+$xp XP · $track" + (if (mvv) " · minimum" else "") + " · yesterday",
                allDone = board().allDone,
                level = level,
                credits = creditsSince(walletBefore),
                knee = TickNote.knee(before, raw, TimeLabels.lifeDay(clock()).minusDays(1).toString(), yesterday = true),
            )
        )
    }

    /**
     * P23, as the server runs it: one timer at a time (a start stops any other), a running one answered as it is, and a
     * start on a stopped one is its Resume (a new segment: the earlier minutes ride on it as priorMinutes).
     */
    override suspend fun startTimer(templateId: String, clientId: String): Outcome<TimerResult> {
        pause(200)
        return lock.withLock {
            once(clientId, buildJsonObject { put("templateId", templateId) }) {
                val i = tasks.indexOfFirst { it.item.templateId == templateId }
                if (i < 0) return@once Outcome.Err("That task no longer exists.", code = "gone", status = 404)
                val t = tasks[i]
                if (!t.item.open) return@once Outcome.Err("A timer runs on a task or a habit on your Board.", code = "conflict", status = 409)
                t.item.timer?.takeIf { it.running }?.let { return@once Outcome.Ok(TimerResult(it, "Timer started. Tick the task when you stop: the time it ran counts.")) }
                val now = clock()
                for (j in tasks.indices) {
                    val other = tasks[j].item.timer
                    if (other != null && other.running) tasks[j] = tasks[j].copy(item = tasks[j].item.copy(timer = other.copy(endedAt = now.toString(), running = false)))
                }
                val prior = t.item.timer?.let { ProofLine.timerMinutes(it, now) } ?: 0
                val timer = TaskTimer("s-" + UUID.randomUUID().toString().take(8), templateId, now.toString(), null, running = true, day = TimeLabels.lifeDay(now).toString(), priorMinutes = prior)
                tasks[i] = tasks[i].copy(item = tasks[i].item.copy(timer = timer))
                Outcome.Ok(TimerResult(timer, "Timer started. Tick the task when you stop: the time it ran counts."))
            }
        }
    }

    override suspend fun stopTimer(sessionId: String, clientId: String): Outcome<TimerResult> {
        pause(200)
        return lock.withLock {
            once(clientId, buildJsonObject { put("sessionId", sessionId) }) {
                val i = tasks.indexOfFirst { it.item.timer?.sessionId == sessionId }
                if (i < 0) return@once Outcome.Err("That timer is gone.", code = "gone", status = 404)
                val timer = tasks[i].item.timer!!
                val stopped = if (timer.running) timer.copy(endedAt = clock().toString(), running = false) else timer
                tasks[i] = tasks[i].copy(item = tasks[i].item.copy(timer = stopped))
                Outcome.Ok(TimerResult(stopped, "Timer stopped at ${ProofLine.timerMinutes(stopped, clock())} min. Tick the task to count them."))
            }
        }
    }

    override suspend fun undoTask(instanceId: String, clientId: String): Outcome<UndoTaskResult> {
        pause(200)
        return lock.withLock {
            once(clientId, buildJsonObject { put("instanceId", instanceId) }) {
                // P7: a tick recorded for yesterday is undone the same way, its raw back off yesterday's knee.
                val y = yesterdayTasks.indexOfFirst { it.instanceId == instanceId }
                if (y >= 0) {
                    val t = yesterdayTasks[y]
                    val xp = t.item.xpHint ?: 0.0
                    rawYesterday = (rawYesterday - t.raw).coerceAtLeast(0.0)
                    yesterdayTasks[y] = t.copy(item = t.item.copy(status = "OPEN"), instanceId = null, raw = 0.0)
                    level = level.copy(progress = (level.progress - xp / 120.0).coerceAtLeast(0.0))
                    return@once Outcome.Ok(UndoTaskResult(-xp, level))
                }
                val i = tasks.indexOfFirst { it.instanceId == instanceId }
                if (i < 0) return@once Outcome.Ok(UndoTaskResult(0.0, level))
                val t = tasks[i]
                val xp = t.item.xpHint ?: 0.0
                rawToday = (rawToday - t.raw).coerceAtLeast(0.0)
                tasks[i] = t.copy(item = t.item.copy(status = "OPEN"), instanceId = null, raw = 0.0)
                // A level once reached stays (as on the server): an undo drains only this level's progress.
                level = level.copy(progress = (level.progress - xp / 120.0).coerceAtLeast(0.0))
                Outcome.Ok(UndoTaskResult(-xp, level))
            }
        }
    }

    /**
     * P22, as the server runs an owed card's action: a make-up repays the whole debt and pays its price now (×0.85, the
     * row's makeUpXp), restoring the day inside its window; the minimum pays its own; Accept the loss only where the card
     * offers it, paying nothing; Undo (P22 review) takes a make-up back inside its ten minutes, the debt open again. A
     * clientId answers once; a debt (or a make-up) already gone is 404 in the server's words.
     */
    override suspend fun makeUp(instanceId: String, action: String, clientId: String, minutes: Int?, pages: Int?): Outcome<MakeUpResult> {
        pause(220)
        val body = buildJsonObject {
            put("instanceId", instanceId); put("action", action)
            minutes?.let { put("minutes", it) }
            pages?.let { putJsonObject("proof") { put("kind", "PAGES"); put("qty", it) } }
        }
        return lock.withLock {
            once<MakeUpResult>(clientId, body) {
                if (action !in setOf(OwedLine.MAKEUP, OwedLine.MINIMUM, OwedLine.ACCEPT_LOSS, OwedLine.UNDO)) return@once bad("action must be 'makeup', 'minimum', 'accept' or 'undo'.")
                if (action != OwedLine.MAKEUP && (minutes != null || pages != null)) return@once bad("minutes, sessionId and proof go with a full make-up only (action 'makeup').")
                if (action == OwedLine.UNDO) {
                    val m = madeUp[instanceId] ?: return@once Outcome.Err("That make-up no longer exists.", code = "gone", status = 404)
                    if (clock() > m.until) return@once Outcome.Err("That make-up can't be undone any more.", code = "conflict", status = 409)
                    madeUp.remove(instanceId)
                    owed.add(m.row)
                    owed.sortByDescending { it.daysAgo }
                    level = level.copy(progress = (level.progress - m.xp / 120.0).coerceAtLeast(0.0))
                    val today = TimeLabels.lifeDay(clock())
                    return@once Outcome.Ok(
                        MakeUpResult(
                            instanceId = instanceId, action = OwedLine.UNDO, status = "MISSED", restored = false, xp = -m.xp, debt = m.row.item.debt,
                            owedLeft = owed.size, clearedLast = false, undoUntil = null, line = "Make-up undone. It is owed again; nothing else changed.",
                            allDone = board().allDone, owed = owed.map { owedNow(it, today) }, level = level,
                        )
                    )
                }
                val i = owed.indexOfFirst { it.item.instanceId == instanceId }
                if (i < 0) return@once Outcome.Err("That debt no longer exists.", code = "gone", status = 404)
                val o = owed[i].item
                val oneDp = { v: Double -> String.format(Locale.ENGLISH, "%.1f", v) }
                when (action) {
                    OwedLine.ACCEPT_LOSS -> if (!o.canAcceptLoss) return@once Outcome.Err("Accept the loss opens once a debt is 14 days old and Settings › Days allows it.", code = "conflict", status = 409)
                    OwedLine.MINIMUM -> if (o.minimum == null) return@once Outcome.Err("It has no minimum version yet. Add one first.", code = "conflict", status = 409)
                }
                val row = owed.removeAt(i)
                val walletBefore = wallet()
                val xp = when (action) { OwedLine.MAKEUP -> o.makeUpXp; OwedLine.MINIMUM -> o.minimum?.xp ?: 0.0; else -> 0.0 }
                if (action != OwedLine.ACCEPT_LOSS) madeUp[instanceId] = DemoMadeUp(row, xp, clock().plusSeconds(600))
                if (xp > 0) level = gain(level, xp / 120.0)
                val left = owed.size
                val restored = action != OwedLine.ACCEPT_LOSS && o.restoresToday
                val line = if (action == OwedLine.ACCEPT_LOSS) "Its −${oneDp(o.debt)} stays in Duty XP; nothing more is owed."
                else "Repaid ${oneDp(o.debt)} and paid ${oneDp(xp)} exactly; ${if (!restored) "its streak stays as it was" else if (action == OwedLine.MINIMUM) "its streak holds" else "its streak is back"}. " +
                    if (left == 0) "Nothing is owed." else "$left still owed."
                val today = TimeLabels.lifeDay(clock())
                Outcome.Ok(
                    MakeUpResult(
                        instanceId = o.instanceId, action = action,
                        status = when { action == OwedLine.ACCEPT_LOSS -> "WRITTEN_OFF"; !restored -> "MADE_UP"; action == OwedLine.MINIMUM -> "DONE_MVV"; else -> "DONE_LATE" },
                        restored = restored, xp = xp, debt = o.debt, owedLeft = left, clearedLast = left == 0,
                        undoUntil = if (action == OwedLine.ACCEPT_LOSS) null else clock().plusSeconds(600).toString(),
                        line = line, allDone = board().allDone, owed = owed.map { owedNow(it, today) }, level = level,
                        credits = creditsSince(walletBefore),
                    )
                )
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
            val now = clock()
            Outcome.Ok(ReviewQueue(now.toString(), due.size, due.take(limit), fatigued = fatigueNow(now)))
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
                val walletBefore = wallet()
                val correct = runCatching { c.accept(answer) }.getOrDefault(false)
                // The web runner's rule: a miss comes back while this card's misses this session are at most 3.
                val retry = !correct && sessionMisses + 1 <= ReviewSession.MAX_RETURNS
                val today = TimeLabels.lifeDay(Instant.now())
                val lvl = cardLevels[ideaId] ?: c.card.level ?: 1
                // P30: while Fatigued the ceiling is halved (10 → 5), as the server's FATIGUED fold pays it.
                val ceiling = if (fatigueNow(clock()) != null) 5 else 10
                val multiplier = round((1.0 + 0.1 * combo.coerceAtMost(ceiling)) * 10) / 10
                val points = if (correct) round(4.2 * multiplier * 10) / 10 else 0.0
                val levelTo = if (correct) (lvl + 1).coerceAtMost(7) else (lvl - 1).coerceAtLeast(1)
                cardLevels[ideaId] = levelTo
                if (!retry) answeredToday += ideaId
                reviewDone += 1
                // P30: the answer that reaches the day's 200th applies Fatigued, once that day (after this answer is paid).
                tireIfDue(clock())
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
                        credits = creditsSince(walletBefore),
                    )
                )
            }
        }
    }

    /** P30: the fatigue in effect at [now], as the server sends it: its end, or null with none. */
    private fun fatigueNow(now: Instant): Fatigue? = fatigueUntil?.takeIf { it.isAfter(now) }?.let { Fatigue(it.toString()) }

    /** P30: the day's answers at [DEMO_FATIGUE_ANSWERS] or more apply Fatigued once that day; nothing else ever does. */
    private fun tireIfDue(now: Instant) {
        val day = TimeLabels.lifeDay(now)
        if (reviewDone < DEMO_FATIGUE_ANSWERS || fatigueDay == day) return
        fatigueDay = day
        fatigueUntil = now.plus(Duration.ofHours(DEMO_FATIGUE_HOURS))
    }

    /** The screenshots' seam (ScreensTest, P30): today's answers so far, so the next answer can be the 200th. */
    internal fun seedAnswersToday(n: Int) {
        reviewDone = n.coerceAtLeast(0)
    }

    override suspend fun log(text: String, section: String, clientId: String): Outcome<LogResult> {
        pause(320)
        if (text.length > 500) return bad("Keep the line to 500 characters.")
        if (text.trim().startsWith("aim:", ignoreCase = true)) return bad("An aim is set on the roadmap, in the web app.")
        val body = buildJsonObject { put("text", text); put("section", section) }
        return lock.withLock {
            once(clientId, body) {
                val walletBefore = wallet()
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
                        Outcome.Ok(LogResult("task", id, reading.title, "$head. ${reading.title} → Today · ≈ $xp$note", buildJsonObject { put("kind", "task"); put("id", undoId) }, creditsSince(walletBefore)))
                    }
                    LogSection.WEIGHT -> {
                        logged[undoId] = ""
                        val w = reading.tokens.first().text
                        Outcome.Ok(LogResult("weight", "weight:${TimeLabels.lifeDay(Instant.now())}", "Weigh-in", "Weight logged. $w → Body", buildJsonObject { put("kind", "weight"); put("id", undoId) }, creditsSince(walletBefore)))
                    }
                    LogSection.IDEA -> {
                        logged[undoId] = ""
                        val draft = "draft-" + UUID.randomUUID().toString().take(8)
                        Outcome.Ok(LogResult("idea-draft", draft, reading.title, "Idea in Inbox", buildJsonObject { put("kind", "draft"); put("id", undoId) }, creditsSince(walletBefore)))
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
        /** P31: the week's side quests, as the server sends them beside the rate (one of two done). */
        val DEMO_SIDE_WEEK = WeekSide(done = 1, offered = 2)
        /** The week's "Decaying this week" (audit-decay.ts): four things fell, the first three listed, as the server sends it. */
        val DEMO_DECAYING = WeekDecaying(
            count = 4,
            top = listOf(
                DecayItem("domain", "Probability fell to L3 (from L4)", "2 ideas fading in it. Reviewing them brings the level back."),
                DecayItem("habit", "Stretch: Established → Forming", "Strength 61% → 57% this week. Each kept day raises it again."),
                DecayItem("ideas", "5 ideas fading", "1 already losing levels. Past grace, an idea counts for less every day until it is reviewed."),
            ),
        )

        /**
         * Condition decay (P28), as a server with it switched on sends it: Care idle 31 days (λ 0.005: e^(−0.005 × 28)),
         * and a skill at the floor. Only what is under 90%, the lowest first (skill-decay.ts checkConditionsOf).
         */
        val DEMO_CONDITION = listOf(
            CheckSkill("skill", "Spanish", 0.5, 74),
            CheckSkill("attribute", "Care", 0.869, 31),
        )

        /** The big jump's note after the core's words (mobile-api.ts LIFT_JUMP_NOTE): the set stands; Keep and Fix are the web's. */
        const val LIFT_JUMP_NOTE = "Saved as a record. It counts as a new best only once kept on the web's Finish summary; if the number is wrong, fix it on the web."

        /** The streak multiplier (P29), as the server sends it: 3 judged Full days in a row, min(1.2, 1.05^3) = ×1.16. */
        val DEMO_STREAK_MULT = StreakMultiplier(1.16, 3, floor = false, line = "Streak ×1.16 · day 3")

        /** The weekly audit's target, a whole percent (week-audit AUDIT_TARGET). */
        const val WEEK_TARGET = 85
        /** This week's audit opens at this Sydney hour of its Sunday (week-audit AUDIT_OPENS_HOUR). */
        const val AUDIT_OPENS_HOUR = 18

        /** The Mall's categories and notes, in the server's words (mall.ts MALL_CATEGORIES, MALL_CATEGORY_LABEL, the notes). */
        val MALL_CATEGORIES = listOf(
            MallCategory("TREAT", "Treats", "a takeaway, a dessert, a coffee out"),
            MallCategory("SCREEN", "Screen time", "an episode, a film, a box set"),
            MallCategory("OUTING", "Outings", "a night out, a gig, a show"),
            MallCategory("PURCHASE", "Purchases", "gear, clothes, a gadget"),
            MallCategory("OTHER", "Other", "anything else you'd like to earn"),
        )
        val MALL_NOTES = MallNotes(
            honour = "The app can't block leisure, so the Mall is a commitment device: it runs on honour. You buy a reward before you take it, and the promise is yours to keep.",
            free = "#play, rest days and sleep are never priced: what you do for its own sake, and your recovery, stay free.",
            onlyYours = "Only the rewards you list are priced. The Mall starts empty: nothing is listed for you.",
            buying = "A purchase is permission now: buy the reward, then take it. You can't spend more than you have, and a purchase can be undone for 10 minutes.",
        )
        /** The server's refusals (mall.ts): #play, sleep, naps and rest days stay free; the price's and the cooldown's range. */
        const val FREE_PLAY_LINE = "#play stays free: the Mall never prices what you do for its own sake."
        const val FREE_REST_LINE = "Sleep, naps and rest days stay free: the Mall never prices them."
        const val PRICE_RANGE_LINE = "A price is a whole number of credits from 1 to 100,000."
        const val COOLDOWN_RANGE_LINE = "A cooldown is a whole number of days from 1 to 365, or none."
        val PLAY_TAG = Regex("(^|\\s)#play\\b", RegexOption.IGNORE_CASE)
        val REST_WORDS = Regex("\\b(sleep|sleeps|sleeping|sleep-in|lie-in|lie in|nap|naps|napping|rest|rests|resting|rest day|rest days|day off|days off)\\b", RegexOption.IGNORE_CASE)

        fun strings(a: JsonElement): List<String> = (a as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        fun formula(a: JsonElement): String = (a as? JsonPrimitive)?.contentOrNull.orEmpty().lowercase().replace(" ", "").replace("**", "^")
    }
}

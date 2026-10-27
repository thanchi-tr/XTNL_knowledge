package com.xtnl.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/*
 * The mobile API's shapes (docs/mobile-api.md, v1). Enum-like fields stay
 * strings so a value the server adds later never breaks a decode; unknown
 * keys are ignored (Net.json).
 */

// ── GET /check ──────────────────────────────────────────────────────────────

@Serializable
data class CheckData(
    val now: String? = null,
    val day: String? = null,
    val dayLabel: String? = null,
    val tasks: List<TaskItem> = emptyList(),
    val tasksSummary: TasksSummary? = null,
    /**
     * The Yesterday lane (blueprint 5.1b, P7; decision D34): the web's Record yesterday sheet, what was due yesterday and
     * is still recordable (and what was recorded for it this morning). Null from an older server: no section.
     */
    val yesterday: YesterdayLane? = null,
    /** The daily quests (the user's musts, at most 5 a day): null from an older server. */
    val daily: DailyQuests? = null,
    val review: ReviewSummary? = null,
    /** The ideas past their grace (the web bell's "5 ideas fading"): null from an older server. */
    val fading: Fading? = null,
    /**
     * The weekly audit is switched on for this server (AUDIT_LAUNCH_DAY): the switch alone, never a read, so it is true
     * in the launch week before any [week] is sent and stays true when the audit couldn't be read. The Sunday reminder
     * follows it. False from an older server.
     */
    val auditOn: Boolean = false,
    /** The weekly audit (the web's Week audit card): null while it is switched off, and from an older server. */
    val week: WeekAudit? = null,
    /**
     * Next week's calibration (blueprint 5.2d, P32; decision D36): the web's Next week card, read only. Null while none is
     * in force (the audit switched off, or fewer than two weeks frozen), and from an older server: no card.
     */
    val calibration: CheckCalibration? = null,
    /**
     * The credits wallet (blueprint P16): its balance and what today earned. Null while credits are switched off
     * (CREDITS_LAUNCH_DAY, until the user's go), when it couldn't be read, and from an older server: no wallet chip.
     */
    val credits: Wallet? = null,
    /**
     * Duty is switched on for this server (DUTY_LAUNCH_DAY, blueprint P22): the switch alone, never a read. While false
     * POST /tasks/makeup is refused, so an owed card shows without its actions. False from an older server.
     */
    val dutyOn: Boolean = false,
    /** The open debts (blueprint P22, decision D18), oldest first, in the web MakeUpCard's words; empty with none and from an older server. */
    val owed: List<OwedItem> = emptyList(),
    /**
     * Condition decay (blueprint 3.1b, P28; decisions D24 and D24b): every attribute and skill whose condition is under
     * 0.9, the lowest first. Empty while the server has it switched off (DECAY_LAUNCH_DAY, until the user's go), with
     * nothing under 0.9, and from an older server.
     */
    val skills: List<CheckSkill> = emptyList(),
    val work: List<WorkItem> = emptyList(),
    val level: LevelInfo? = null,
    val streak: StreakInfo? = null,
    /**
     * The 5-second check-in's switch and counts (health phase 2; D1, D2, D9): never a value, so a cached /check that moves
     * between phones carries none. Null from an older server: no Check in row, no widget button.
     */
    val checkin: CheckinState? = null,
    /** The open lift and the set to do next (health phase 2; D12): present only while a lift is open; null otherwise and from an older server. */
    val lift: OpenLift? = null,
)

@Serializable
data class TaskItem(
    val templateId: String,
    val title: String,
    val lane: String = "TASK",
    val status: String = "OPEN",
    val minutes: Int? = null,
    val mvv: String? = null,
    val icon: String? = null,
    val dueLabel: String? = null,
    val xpHint: Double? = null,
    /**
     * Proof of work (blueprint P23): a full tick of this row needs its minutes or its timer (a deep-work task marked
     * proof). The tick opens the minutes sheet instead (unless its timer has run). False while the server has proof of
     * work switched off, and from an older server.
     */
    val proof: Boolean = false,
    /** The row's open timer (running, or stopped and waiting for its tick); null with none. */
    val timer: TaskTimer? = null,
    /**
     * Pages proof (blueprint P24): a reading task. Its full tick reports the pages read (the sheet's chips), at least
     * [TaskPages.target] when it has one, so its tap opens the sheet. Null on every other row, while the server has proof
     * of work switched off, and from an older server.
     */
    val pages: TaskPages? = null,
    /**
     * Side quests (blueprint P31, D35): the row is a side quest, and [expiresDay] ("2026-10-23") the life day it expires
     * after. Its [dueLabel] says so ("Side quest · expires Fri"); it pays its normal price, is never a must, and asks
     * nothing of the day while open. False and null on every other row, and from an older server.
     */
    val side: Boolean = false,
    val expiresDay: String? = null,
) {
    /** Can be ticked (a LOCKED study task completes itself from the day's reviews). */
    val open: Boolean get() = status == "OPEN"
    val locked: Boolean get() = status == "LOCKED"
    val kept: Boolean get() = status == "DONE" || status == "DONE_MVV"
    /**
     * A row the web's Board clear counts (today-board.ts): Must, Planned and Habits alike, held and skipped
     * rows aside, and a side quest still open (P31: it asks nothing of the day; done, it counts). The app shows the
     * server's own figure (tasksSummary, a tick's allDone); this is the demo's.
     */
    val countsForBoard: Boolean get() = status != "HELD" && status != "SKIPPED" && !(side && !kept)
}

@Serializable
data class TasksSummary(val open: Int = 0, val done: Int = 0, val allDone: Boolean = false)

/**
 * /check's `yesterday` (P7): yesterday's life [day] and its [dayLabel], the sheet's [line] ("Anything you tick pays at
 * the full rate, record by 04:00 tomorrow."), the rows still to record ([open]) and every row in [tasks]' own shape, not
 * done first. A row's tick goes with day "yesterday" and books at T 1.00; its `xpHint` is that price. Settling yesterday
 * stays on the web.
 */
@Serializable
data class YesterdayLane(
    val day: String? = null,
    val dayLabel: String? = null,
    val line: String? = null,
    val open: Int = 0,
    val tasks: List<TaskItem> = emptyList(),
)

/** A task's timer (POST /tasks/start; blueprint P23): a row on the server, so it survives an app restart. */
@Serializable
data class TaskTimer(
    val sessionId: String,
    val templateId: String = "",
    val startedAt: String,
    val endedAt: String? = null,
    val running: Boolean = false,
    /** The life day it started on ("2026-10-24"): one still running from yesterday ran across 04:00 (its tap asks first). Null from an older server. */
    val day: String? = null,
    /** The minutes of its earlier segments (stopped, then resumed the same day); 0 with none, and from an older server. */
    val priorMinutes: Int = 0,
)

/** A reading task's pages (/check's `pages`; blueprint P24): the day's target, or null when the pages are optional. */
@Serializable
data class TaskPages(val target: Int? = null)

/** POST /tasks/start and /tasks/stop's answer: the timer as it now stands, and its line. */
@Serializable
data class TimerResult(val timer: TaskTimer? = null, val line: String? = null)

/**
 * The daily quests (docs/mobile-api.md `daily`; decisions D14, D15): the web Must lane's own count and its 1/0 strip.
 * Binary is a status only (XP stays graded): the minimum version keeps a quest and is counted in [minimum].
 */
@Serializable
data class DailyQuests(
    val kept: Int = 0,
    val total: Int = 0,
    /** Every quest kept (false with none). */
    val full: Boolean = false,
    /** At most this many musts a day (5). */
    val cap: Int = 5,
    /** Kept at the minimum version: "n at minimum". */
    val minimum: Int = 0,
    /** Musts past the cap today (the day keeps them): "n over the cap". */
    val over: Int = 0,
    /** One cell per quest, in the lane's order. */
    val quests: List<DailyQuest> = emptyList(),
)

@Serializable
data class DailyQuest(val templateId: String, val title: String = "", val kept: Boolean = false, val minimum: Boolean = false)

/** The Review hub's figures. [fatigued] (blueprint P30): the fatigue in effect, null with none, while off and from an older server. */
@Serializable
data class ReviewSummary(val due: Int = 0, val doneToday: Int = 0, val target: Int? = null, val nextDueAt: String? = null, val fatigued: Fatigue? = null)

/**
 * Review fatigue (docs/mobile-api.md `fatigued`; blueprint 3.3b, P30, decision D26): once a life day's answers reach 200,
 * right or wrong, the server applies Fatigued once that day, a lower combo ceiling for 18 hours. [until] is when the one in
 * effect lifts. Never for a miss or a quiet day, and no sleep rule; the answers' own `multiplier` already carries it. Null
 * while the server has it switched off (FATIGUE_LAUNCH_DAY, until the user's go), with none in effect, and from an older
 * server.
 */
@Serializable
data class Fatigue(val until: String? = null)

/**
 * The ideas past their grace (docs/mobile-api.md `fading`; blueprint 3.1a, decision D23): each card keeps its own
 * forgetting curve, and nothing fades within 72 hours of falling due. [ideas] past grace in all, [forgetting] of them
 * already losing levels, [domains] where they sit, most first. Every one is due, so Review brings it back.
 */
@Serializable
data class Fading(val ideas: Int = 0, val forgetting: Int = 0, val domains: List<FadingDomain> = emptyList())

@Serializable
data class FadingDomain(val id: String? = null, val name: String, val ideas: Int = 0)

/**
 * The weekly audit (docs/mobile-api.md `week`; blueprint 5.2a and 5.2b, decisions D12, D15-D17, D38): the week's daily
 * quests [kept] of [due] as the web's Week audit card counts them (the minimum counts 1; a skip and a held day are left
 * out and shown), [rate] a whole percent rounded down (null with none due), the 85% [target] (shown only on the audit,
 * never on Today), and when the numbers are from: [status] provisional (live), frozen (as of [asOfDay] 04:00), final.
 */
@Serializable
data class WeekAudit(
    val weekKey: String = "",
    /** "Week of 19 Oct". */
    val label: String = "",
    val rate: Int? = null,
    val kept: Int = 0,
    val due: Int = 0,
    /** Kept at the minimum version (each counts as kept). */
    val minimum: Int = 0,
    /** Left out of the rate: skipped, and held (rest, sick, vacation, a freeze). */
    val skipped: Int = 0,
    val held: Int = 0,
    /** Due and still recordable (in [due], not kept). */
    val open: Int = 0,
    /** More kept that would reach the target (0 once met). */
    val short: Int = 0,
    val target: Int = 85,
    /** "provisional" | "frozen" | "final". */
    val status: String = "provisional",
    /** The first two audited weeks: the target is shown, not applied. */
    val calibrating: Boolean = false,
    /** The life day the frozen copy follows (its 04:00); null while provisional. */
    val asOfDay: String? = null,
    /** "Decaying this week" (blueprint 5.2c; P12): its count and first three lines; null when it wasn't read. */
    val decaying: WeekDecaying? = null,
    /** The week's side quests (blueprint P31): offered and done, beside the rate and never in it; null with none, and from an older server. */
    val side: WeekSide? = null,
)

/** A week's side quests (docs/mobile-api.md `week.side`): those added on a day of it, and those done. */
@Serializable
data class WeekSide(val done: Int = 0, val offered: Int = 0)

/**
 * Next week's calibration (docs/mobile-api.md `calibration`; blueprint 5.2d, P32, decision D36): the week it is for, Today's
 * three sizes (set by themselves), the capacity's reading when it changes nothing, and each suggestion with its state. No
 * rate and no target: those are the audit's alone (D17). Accept and Keep stay on the web.
 */
@Serializable
data class CheckCalibration(
    val weekKey: String = "",
    /** "Week of 26 Oct". */
    val label: String = "",
    val sizes: CalibrationSizes = CalibrationSizes(),
    /** "…: your 240 min a day stands." when the capacity suggestion changes nothing; else null. */
    val capacityNote: String? = null,
    val changes: List<CalibrationChange> = emptyList(),
)

/** Today's three for the week: BODY's Move [move] min (10, 20 or 30), TASK's Finish any [any] tasks (2 or 3), and why. */
@Serializable
data class CalibrationSizes(val move: Int = 20, val any: Int = 2, val line: String = "", val basis: String = "")

/**
 * One suggestion: [kind] capacity | ease | step-up, its [title] and [basis] in the web card's words, [state] open (on offer
 * on the web), accepted or gone, and [line] what stands once it is not open ("Not a must from Mon 2 Nov.").
 */
@Serializable
data class CalibrationChange(
    val id: String = "",
    val kind: String = "",
    val title: String = "",
    val basis: String = "",
    val state: String = "open",
    val line: String? = null,
)

/**
 * The audit's "Decaying this week" (docs/mobile-api.md `week.decaying`): what fell over the week, read from what the
 * server keeps and never applied. [count] is everything found, [top] its first three lines in the web block's order,
 * [unread] the sources that couldn't be read (left out, never guessed).
 */
@Serializable
data class WeekDecaying(val count: Int = 0, val top: List<DecayItem> = emptyList(), val unread: Int = 0)

/** One thing that fell: [kind] streak | field | domain | habit | ideas | condition (P28) | trait | mp, and its words. */
@Serializable
data class DecayItem(val kind: String = "", val title: String, val detail: String = "")

/**
 * One idle attribute or skill (docs/mobile-api.md `skills`; blueprint 3.1b, P28): [kind] attribute (named as on the
 * Status card: Body, Knowledge, Craft, Duty, Care) or skill (its own name), [condition] 0.5..1 (3 decimals) and the idle
 * life days behind it. A reading: no level, XP or hours ever drop with it, and one practice brings it back to 1.
 */
@Serializable
data class CheckSkill(val kind: String = "attribute", val name: String, val condition: Double = 1.0, val idleDays: Int = 0)

@Serializable
data class WorkItem(
    val id: String,
    val boardId: String? = null,
    val boardName: String? = null,
    val title: String,
    val dueAt: String? = null,
    val allDay: Boolean = false,
    val channel: String = "OTHER",
    val overdue: Boolean = false,
    val collection: String? = null,
    val customer: Customer? = null,
)

@Serializable
data class Customer(val id: String? = null, val name: String, val number: String? = null, val phone: String? = null)

@Serializable
data class LevelInfo(val level: Int = 1, val title: String? = null, val progress: Double = 0.0)

/**
 * The credits wallet (docs/mobile-api.md `credits`; blueprint 4.1 and 4.2, decisions D27 to D29), whole credits: [balance]
 * is earned less bought plus refunded, [today] what today's life day earned. Derived on the server on every read; XP
 * is never spent, and no penalty ever takes credits.
 */
@Serializable
data class Wallet(val balance: Int = 0, val today: Int = 0)

/**
 * A write's credits (a tick, an answer, a log): [balance] and [today] are the wallet the server read fresh after the
 * write (the chip is set from them, never by adding deltas up); [delta] is what was earned across the write (earned
 * after less earned before: a purchase never counts in it). Another write landing between the server's two reads
 * counts in [delta] too, so it is the change across the write, never its receipt. [today] is null from an older server
 * and on a Mall purchase or undo (there [delta] is exactly −price or +price). Null while credits are off or a read failed.
 */
@Serializable
data class CreditsChange(val delta: Int = 0, val balance: Int = 0, val today: Int? = null)

/**
 * The daily streak (docs/mobile-api.md `streak`). [restTokens] (blueprint P21, decision D19) is the one Rest Token bank,
 * the momentum freezes: null while the bank is not live and from a server before it; [freezes] is the same number (0
 * then), kept for older apps. [multiplier] (blueprint P29, decision D25) is the streak multiplier, a separate count.
 */
@Serializable
data class StreakInfo(
    val days: Int = 0,
    val keptToday: Boolean = false,
    val freezes: Int = 0,
    val restTokens: Int? = null,
    val multiplier: StreakMultiplier? = null,
)

/**
 * The streak multiplier (docs/mobile-api.md `streak.multiplier`; blueprint 3.2a, P29, decision D25): [value] is m(d) =
 * min(1.2, 1.05^d) to two places, the C every full tick pays (each row's xpHint already carries it), [fullDays] is d, the
 * judged Full days in a row (at least that with [floor]), and [line] is Today's chip in the web's words. Null while the
 * server has it switched off (STREAK_LAUNCH_DAY, until the user's go) and from an older server.
 */
@Serializable
data class StreakMultiplier(val value: Double = 1.0, val fullDays: Int = 0, val floor: Boolean = false, val line: String = "")

// ── Duty: the owed cards and POST /tasks/makeup (blueprint P22; decision D18) ──

/**
 * One open debt (docs/mobile-api.md `owed`): what is owed ([debt], life XP, positive; a miss owes at most 20, a task at
 * most 3 open, 100 in all), the missed [day], and the web card's own lines ([whenLine], [text], [window]). A make-up
 * repays it in full and pays [makeUpXp] now, at [rate] (×0.85) with no consistency bonus; within the two days
 * ([restoresToday], through [restoreBy]) it also counts the day as kept. A debt is life XP, never credits.
 */
@Serializable
data class OwedItem(
    val instanceId: String,
    val templateId: String = "",
    val title: String = "",
    val archived: Boolean = false,
    val day: String = "",
    val dayLabel: String = "",
    val debt: Double = 0.0,
    val restoreBy: String? = null,
    val restoresToday: Boolean = false,
    val restoresStreak: Int? = null,
    val rate: Double = 0.85,
    val makeUpXp: Double = 0.0,
    /** The minimum version's words and what its make-up pays; null without one. */
    val minimum: OwedMinimum? = null,
    /** A study must: its make-up pays 0 and clears the debt. */
    val studyLinked: Boolean = false,
    /** Accept the loss is offered (Settings › Days on the web, and the debt 14 days old). */
    val canAcceptLoss: Boolean = false,
    /** Proof of work in force: the chips a full make-up brings, as its tick does; null while it is one tap. */
    val proof: OwedProof? = null,
    /** "Stretch · Monday". */
    @SerialName("when") val whenLine: String = "",
    val text: String = "",
    val window: String = "",
)

@Serializable
data class OwedMinimum(val label: String = "", val xp: Double = 0.0)

/** A proof must's make-up (P20, P22): its minute chips, a reading must's page chips and day target (null: pages optional). */
@Serializable
data class OwedProof(val minutes: List<Int>? = null, val pages: OwedPages? = null)

@Serializable
data class OwedPages(val target: Int? = null, val chips: List<Int> = emptyList())

/**
 * POST /tasks/makeup's answer: the [action] done ("makeup", "minimum" or "accept"), its [status] (DONE_LATE, DONE_MVV,
 * MADE_UP or WRITTEN_OFF), whether the day was [restored], the [xp] paid and the [debt] repaid or written off, the
 * server's [line], and, as a tick's, the cards left ([owed]; null when that read failed), [allDone], the [level] after
 * and the [credits] across it. [duplicate]: a repeat the server already recorded (nothing paid twice).
 */
@Serializable
data class MakeUpResult(
    val instanceId: String = "",
    val action: String = "makeup",
    val status: String = "",
    val restored: Boolean = false,
    val xp: Double = 0.0,
    val debt: Double = 0.0,
    val owedLeft: Int? = null,
    val clearedLast: Boolean? = null,
    val undoUntil: String? = null,
    val duplicate: Boolean = false,
    val line: String? = null,
    val celebrations: List<JsonElement> = emptyList(),
    val allDone: Boolean = false,
    val owed: List<OwedItem>? = null,
    val level: LevelInfo? = null,
    val credits: CreditsChange? = null,
)

// ── GET /quests (blueprint P15) ─────────────────────────────────────────────

/**
 * The main quest, this week's sprint and Today's three (docs/mobile-api.md `GET /quests`; decisions D11, D12), read
 * only. One vocabulary: the roadmap goal is the main quest, its stages milestones, its week quests this week's
 * sprint. Start and plan edits stay on the web; a practice row or a task quest is ticked like any task.
 */
@Serializable
data class QuestsData(
    val now: String? = null,
    val day: String? = null,
    /** Null when the server couldn't read it. */
    val mainQuest: MainQuest? = null,
    /** This week's sprint of the main quest's started milestone; null with none. */
    val sprint: Sprint? = null,
    /** Today's three (momentum); null before its launch or when unread. */
    val three: TodaysThree? = null,
)

/** [state]: NONE | DRAFT | PLANNED | ACTIVE | PAST_DUE | PAUSED | DONE | LEGACY. [startOnWeb] is false while ROADMAP_GOALS_LIVE is off. */
@Serializable
data class MainQuest(
    val state: String = "NONE",
    val title: String? = null,
    val line: String = "",
    val milestone: QuestMilestone? = null,
    val startOnWeb: Boolean = false,
    /** The aim suggestions are on: an empty quest may say so quietly. */
    val suggest: Boolean = true,
    /** Ruling N28: the planned layer's study while it is locked or Start is off (the web card's one action); null otherwise. */
    val study: QuestStudy? = null,
)

/**
 * The topic to study now (GET /quests `study`; roadmap contracts ruling N28): its cards at level 6 of the floor ("n of 8"),
 * its cards due, and the web's own words and link ([line] "Study Markov chains · 3 of 8 · 4 due", [webHref] the Domain's
 * review run, or "Add an idea to …" with none due). The run itself is the web's; the app says the line.
 */
@Serializable
data class QuestStudy(
    val name: String = "",
    val domainId: String = "",
    val cards: Int = 0,
    val floor: Int = 8,
    val due: Int = 0,
    val layer: Int = 0,
    val geminiNamed: Boolean = false,
    val line: String = "",
    val webHref: String = "",
)

/**
 * The main quest's current milestone. Its title keeps its provenance, as on the web (contracts §22.11): [titleNote] is
 * Gemini's words for a title Gemini wrote ("Gemini suggestion · not checked"; null for the user's own or the app's), and
 * [titleStruck] the `[start, end)` spans of [title]'s numbers, struck through, never rewritten.
 */
@Serializable
data class QuestMilestone(
    val ord: Int = 0,
    val of: Int = 0,
    val title: String = "",
    val status: String = "",
    val percent: Int? = null,
    val dueDay: String? = null,
    val titleNote: String? = null,
    val titleStruck: List<List<Int>> = emptyList(),
)

/** [status]: live | provisional ("provisional · final Wed 04:00", never a verdict) | settling. [state] PAST_DUE: no sprint line (the web's card). */
@Serializable
data class Sprint(
    val label: String = "This week's sprint",
    val milestoneOrd: Int = 0,
    val weekStart: String? = null,
    val weekEnd: String? = null,
    val state: String = "OPEN",
    val done: Int = 0,
    val total: Int = 0,
    val status: String = "live",
    val line: String? = null,
    val rows: List<SprintRow> = emptyList(),
)

/**
 * One sprint row: its words and count line; a practice or step's [templateId] is its task on Today. [done] is the
 * server's: the week's count for the row is met (a session ticked today is not the row done).
 */
@Serializable
data class SprintRow(
    val kind: String = "",
    val label: String = "",
    val countLine: String = "",
    val count: Int = 0,
    val progress: Double = 0.0,
    val unit: String = "",
    val done: Boolean = false,
    val templateId: String? = null,
)

@Serializable
data class TodaysThree(val done: Int = 0, val total: Int = 0, val frozen: Boolean = true, val chest: String = "locked", val quests: List<ThreeQuest> = emptyList())

/** [slot]: PLAN | BODY | TASK; a task quest's [templateId] is ticked like any task. */
@Serializable
data class ThreeQuest(val slot: String = "", val title: String = "", val done: Boolean = false, val templateId: String? = null)

// ── GET /status (blueprint P1) ──────────────────────────────────────────────

/**
 * The five attributes and Capital's reading (docs/mobile-api.md `GET /status`; blueprint 1.1, decisions D1 and D2): the
 * web's /you Status card, read only. Each attribute is its source's own figures (Vitality is the Body track, Intellect
 * is Knowledge, Craft, Duty and Care their tracks), never a second formula; Capital is a reading only, with no level
 * and no XP. With them the avatar targets (P4) and the skills (P5), each paying nothing.
 */
@Serializable
data class StatusPanel(
    val now: String? = null,
    val day: String? = null,
    /** Life counts: the four track rows are in. Before, [attributes] holds Intellect alone. */
    val launched: Boolean = false,
    val attributes: List<StatusAttribute> = emptyList(),
    /** Null when no deal was won in the last three months, or when the deals couldn't be read. */
    val capital: CapitalReading? = null,
    /** The avatar targets (P4), in the web card's order; null when they couldn't be read (show none), empty with none. */
    val targets: List<StatusTarget>? = null,
    /** The skills (P5), most hours first; null when they couldn't be read (show none), empty with none. */
    val skills: List<StatusSkill>? = null,
)

/**
 * One attribute: [key] VITALITY | INTELLECT | CRAFT | DUTY | CARE, the blueprint's word ([attribute]) over its
 * source's own name ([name]: Body, Knowledge, Craft, Duty, Care). [progress] is the meter now and [banked] last week's
 * (0..1); [cap] and [keptStreak] are null for Intellect. [weeks]: kept | held | missed, oldest first, at most 8.
 * [unit]: xp (life XP) for a track, pts (review points) for Intellect. [skills] (P5): how many live skills it has (0 from
 * an older server, or when the skills couldn't be read).
 */
@Serializable
data class StatusAttribute(
    val key: String = "",
    val attribute: String = "",
    val name: String = "",
    val level: Int = 0,
    val progress: Double = 0.0,
    val banked: Double = 0.0,
    val cap: Int? = null,
    val atCap: Boolean = false,
    val keptStreak: Int? = null,
    val weeks: List<String> = emptyList(),
    val line: String = "",
    val unit: String = "xp",
    val skills: Int = 0,
)

/** One month of Capital: AUD [wonCents] won (whole cents) and the web's own [won] figure, and how many [deals]. */
@Serializable
data class CapitalMonth(val month: String = "", val label: String = "", val wonCents: Long = 0, val won: String = "", val deals: Int = 0)

/** Capital this month ([line] "1 deal won in October"), the months before ([history]), and the window newest first. */
@Serializable
data class CapitalReading(
    val month: String = "",
    val label: String = "",
    val wonCents: Long = 0,
    val won: String = "",
    val deals: Int = 0,
    val line: String = "",
    val history: String = "",
    val months: List<CapitalMonth> = emptyList(),
)

/**
 * One avatar target (docs/mobile-api.md `GET /status` `targets`; blueprint 1.2, decisions D3 and D4): the desired self in
 * numbers, read only here and set on the web (/you › Edit avatar). [attribute] is one of the five keys or CAPITAL;
 * [metric] is WEIGHT (Train's own goal), EFFORT_MINUTES, FIELD_LEVEL, TRACK_HOURS, REVENUE_MONTH or MANUAL; [source] is
 * COMPUTED (measured by the app), SELF (logged by the user: its [line] says "self-reported") or WEIGHT (Train's trend).
 * [share] is 0..1 of the way from [baseline] (null without one, or with no [current] yet); [pace] is REACHED, ON_PACE,
 * BEHIND, PAST, or null without a target day. A target pays nothing and moves no level.
 */
@Serializable
data class StatusTarget(
    val id: String = "",
    val attribute: String = "",
    val label: String = "",
    val metric: String = "",
    val unit: String = "",
    val direction: String = "UP",
    val baseline: Double? = null,
    val baselineDay: String? = null,
    val target: Double = 0.0,
    val targetDay: String? = null,
    val current: Double? = null,
    val currentDay: String? = null,
    val source: String = "COMPUTED",
    val share: Double? = null,
    val pace: String? = null,
    val line: String = "",
)

/**
 * One skill (docs/mobile-api.md `GET /status` `skills`; blueprint 1.5, decisions D7, D8 and D9): a named competency,
 * read only here and named and linked on the web (You › Skills). [attribute] is one of the five keys; [kind] PRACTICE,
 * or EXERCISE (walks count too). [hours] (2 decimals) are derived on the server from the linked tasks' ticks; [tier] is
 * 1 (0–100 h), 2 (100–500), 3 (500–2,000) or 4 (2,000–10,000), [progress] the share through it (0..1) and [toNext] the
 * hours to the next (null in Tier 4). [line] and [tierLine] are the web's own words. A skill pays nothing.
 */
@Serializable
data class StatusSkill(
    val id: String = "",
    val name: String = "",
    val attribute: String = "",
    val kind: String = "PRACTICE",
    val fieldName: String? = null,
    val hours: Double = 0.0,
    val tier: Int = 1,
    val tierFrom: Int = 0,
    val tierTo: Int = 100,
    val progress: Double = 0.0,
    val toNext: Double? = null,
    val line: String = "",
    val tierLine: String = "",
    val ticks: Int = 0,
    val estimated: Int = 0,
    val walks: Int = 0,
    val templates: Int = 0,
)

// ── GET /mall, POST /mall/rewards, POST /mall/buy, POST /mall/undo (blueprint P18, P19) ──

/**
 * You › Mall (docs/mobile-api.md `GET /mall`; blueprint 4.3 to 4.5, decisions D30 to D32): the rewards the user lists,
 * each with a price in credits and whether it can be bought now, the latest purchases, and the credits over them. Only
 * what the user lists is priced: the server never sends a starter reward. #play, rest days and sleep are never priced
 * (the server refuses them). A purchase burns exactly its price, never more than the balance, and can be undone for
 * ten minutes; it costs no XP or MP.
 */
@Serializable
data class MallData(
    val now: String? = null,
    val day: String? = null,
    /** The wallet, as /check's; null while credits are off (until the user's go) or when it couldn't be read. */
    val credits: Wallet? = null,
    /** The header's line: "+40 cr today", or why there is no balance. */
    val creditsLine: String = "",
    /** What the price hints divide by; null while they calibrate. */
    val goodDay: MallGoodDay? = null,
    /** What a good day is, or why the hints calibrate; null when the wallet couldn't be read. */
    val hintLine: String? = null,
    /** The categories in the page's order (TREAT, SCREEN, OUTING, PURCHASE, OTHER), each with its label and examples. */
    val categories: List<MallCategory> = emptyList(),
    /** The live rewards: by category, each category in the user's order. */
    val rewards: List<MallReward> = emptyList(),
    /** Archived rewards, newest first (kept rows; edited and archived on the web). */
    val archived: List<MallReward> = emptyList(),
    /** P19: the latest purchases, newest first, each with its undo window (empty while credits are off, and from an older server). */
    val purchases: List<MallPurchase> = emptyList(),
    val limits: MallLimits = MallLimits(),
    val notes: MallNotes = MallNotes(),
    /** The server records writes (only the live app does). */
    val writesOn: Boolean = false,
    /** The Mall's table is there (false before its migration: no rewards, and an add is refused). */
    val ready: Boolean = true,
)

/** A good day: the middle of the [earningDays] that earned credits in the last [days] complete life days, in [credits]. */
@Serializable
data class MallGoodDay(val credits: Int = 0, val days: Int = 0, val earningDays: Int = 0)

/** A category: its [key], the web's [label] ("Treats") and the Add form's [examples]. */
@Serializable
data class MallCategory(val key: String = "", val label: String = "", val examples: String = "")

/**
 * One reward: [price] whole credits and the web's [priceLine] ("120 cr"), [hint] "≈ 2 good days" or "calibrating", an
 * optional [note], an optional cooldown ([cooldownDays], the web's [cooldownLine]); [archivedAt] on an archived one.
 */
@Serializable
data class MallReward(
    val id: String = "",
    val title: String = "",
    val category: String = "",
    val categoryLabel: String = "",
    val price: Int = 0,
    val priceLine: String = "",
    val hint: String = "calibrating",
    val note: String? = null,
    val cooldownDays: Int? = null,
    val cooldownLine: String? = null,
    val archivedAt: String? = null,
    /** P19: whether it can be bought now, or the server's line saying why not; null from an older server (no buy). */
    val buy: MallBuyState? = null,
)

/** A reward's Buy state (P19): [can] buy it now, else [why] not, in the server's words (it checks it all again at the buy). */
@Serializable
data class MallBuyState(val can: Boolean = false, val why: String? = null)

/**
 * One purchase (docs/mobile-api.md `purchases`; P19): its [id] (what an undo names), the reward's id and [title] as
 * bought, its [price] and "120 cr", its life [day], the instant and Sydney's "21:05" ([at]), whether it was [refunded],
 * and until when it can be undone ([undoUntil], ten minutes after it; null once undone or past it), with the web's line.
 */
@Serializable
data class MallPurchase(
    val id: String = "",
    val rewardId: String? = null,
    val title: String = "",
    val price: Int = 0,
    val priceLine: String = "",
    val day: String? = null,
    val occurredAt: String? = null,
    val at: String = "",
    val refunded: Boolean = false,
    val undoUntil: String? = null,
    val line: String = "",
)

/** What the Add form keeps (the server checks them again). */
@Serializable
data class MallLimits(
    val titleMax: Int = 60,
    val noteMax: Int = 200,
    val priceMin: Int = 1,
    val priceMax: Int = 100_000,
    val cooldownMin: Int = 1,
    val cooldownMax: Int = 365,
    val rewardsMax: Int = 60,
    /** P19: how long a purchase can be undone. */
    val undoMinutes: Int = 10,
)

/** The page's honour notes, shown as the server words them. */
@Serializable
data class MallNotes(val honour: String = "", val free: String = "", val onlyYours: String = "", val buying: String = "")

/** POST /mall/rewards: the new reward's [id], and the row as GET /mall lists it (null when that read failed). */
@Serializable
data class AddRewardResult(val id: String = "", val reward: MallReward? = null)

/**
 * POST /mall/buy (P19): the [purchase] made (or the one a resend of its clientId already made: [duplicate], delta 0), its
 * [credits] (the change, −price, and the balance it left), the server's [line], and its Seal among [celebrations].
 */
@Serializable
data class BuyResult(
    val purchase: MallPurchase? = null,
    val credits: CreditsChange? = null,
    val duplicate: Boolean = false,
    val line: String? = null,
    val celebrations: List<JsonElement> = emptyList(),
)

/** POST /mall/undo (P19): the purchase undone, its [credits] back (+price; delta 0 on a repeat, [duplicate]) and the line. */
@Serializable
data class UndoBuyResult(
    val purchaseId: String = "",
    val credits: CreditsChange? = null,
    val duplicate: Boolean = false,
    val line: String? = null,
)

// ── Tasks and work ──────────────────────────────────────────────────────────

@Serializable
data class CompleteResult(
    val instanceId: String,
    val xp: Double = 0.0,
    val line: String? = null,
    val allDone: Boolean = false,
    val celebrations: List<JsonElement> = emptyList(),
    /** The character's level after this tick (null from an older server, or when it couldn't be read): the seal's exact step. */
    val level: LevelInfo? = null,
    /** The skill this task feeds (P5), as it stands after the tick; null when it feeds none (or from an older server). */
    val competency: TickSkill? = null,
    /** The tick's credits (P16): the change and the balance; null while credits are off (or from an older server). */
    val credits: CreditsChange? = null,
    /** The knee note (P7, D26): only once the day the tick booked on is past 200 raw; null below it and from an older server. */
    val knee: TickKnee? = null,
)

/**
 * A tick's `knee` (docs/mobile-api.md; blueprint 3.3a, P7): the life [day] it booked on, that day's [raw] total after the
 * tick, the knee's [rate] there, [capped] once the day's 300 XP is reached, and the server's [line] ("Fatigue breaker:
 * past 200 raw today, so a tick now pays ×0.48 or less. The day stops at 300 XP."). A reading: the tick's xp already
 * carries the knee.
 */
@Serializable
data class TickKnee(
    val day: String? = null,
    val raw: Double = 0.0,
    val rate: Double = 1.0,
    val capped: Boolean = false,
    val line: String = "",
)

/** A tick's skill (P5): its [name], [hoursAfter] and [tier] after the tick, its hours [line]; [tierUp] when this tick played the tier's Seal. */
@Serializable
data class TickSkill(
    val id: String = "",
    val name: String = "",
    val hoursAfter: Double = 0.0,
    val tier: Int = 1,
    val tierUp: Boolean = false,
    val line: String = "",
)

@Serializable
data class UndoTaskResult(val xp: Double = 0.0, val level: LevelInfo? = null)

@Serializable
data class WorkResult(val id: String? = null, val doneAt: String? = null)

// ── Review ──────────────────────────────────────────────────────────────────

/** GET /review/queue. [fatigued] (blueprint P30): the fatigue in effect, as /check's `review.fatigued`. */
@Serializable
data class ReviewQueue(val now: String? = null, val dueTotal: Int = 0, val cards: List<ReviewCard> = emptyList(), val fatigued: Fatigue? = null)

@Serializable
data class ReviewCard(
    val ideaId: String,
    val type: String,
    val prompt: String,
    val promptHasMath: Boolean = false,
    val options: List<String>? = null,
    val listCount: Int? = null,
    val orderItems: List<String>? = null,
    val blanks: Int? = null,
    val unit: String? = null,
    val level: Int? = null,
    val field: String? = null,
    val domain: String? = null,
)

/** The meaning check's call on a short answer whose wording missed. */
@Serializable
data class Judged(val correct: Boolean? = null, val reason: String? = null)

/** Today's review quest; `target` is null until the day's first open fixes it (keep /check's). */
@Serializable
data class Quest(val done: Int = 0, val target: Int? = null)

@Serializable
data class AnswerResult(
    val correct: Boolean = false,
    /** A string by the contract; an array is shown as a list. */
    val expected: JsonElement? = null,
    val explanation: String? = null,
    val judged: Judged? = null,
    /** Review points paid (0 on a miss): review points, never life XP. */
    val xp: Double = 0.0,
    val comboNext: Int = 0,
    val multiplier: Double? = null,
    val levelFrom: Int? = null,
    val levelTo: Int? = null,
    val nextDueDay: String? = null,
    val retry: Boolean = false,
    val trueFact: String? = null,
    val quest: Quest? = null,
    val streakSecured: Boolean = false,
    val celebrations: List<JsonElement> = emptyList(),
    /** The answer's credits (P16): +10 when it completes the review quest; null while credits are off. */
    val credits: CreditsChange? = null,
) {
    val expectedText: String?
        get() = when (val e = expected) {
            null, JsonNull -> null
            is JsonPrimitive -> e.contentOrNull
            is JsonArray -> e.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString("\n")
            is JsonObject -> e.values.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString("\n")
        }
    val leveledUp: Boolean get() = levelFrom != null && levelTo != null && levelTo > levelFrom
}

/** "Quest done" style titles out of a celebrations list, whatever its exact shape. */
fun celebrationTitles(list: List<JsonElement>): List<String> = list.mapNotNull { el ->
    (el as? JsonObject)?.get("title")?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
}

// ── Log ─────────────────────────────────────────────────────────────────────

@Serializable
data class LogResult(
    /** "task" | "goal" | "weight" | "idea-draft". */
    val kind: String = "task",
    /** The task, goal or draft's id (an idea draft's is the draftId POST /ideas finishes). */
    val id: String? = null,
    val title: String? = null,
    val line: String? = null,
    /** Sent back as is to /log/undo. */
    val undo: JsonObject? = null,
    /** The line's credits (P16): a done-now line that finishes a quest earns its 10; null while credits are off. */
    val credits: CreditsChange? = null,
)

// ── Ideas ───────────────────────────────────────────────────────────────────

@Serializable
data class FormatMeta(val type: String, val label: String? = null, val points: Double? = null, val help: String? = null)

@Serializable
data class IdeasMeta(
    val formats: List<FormatMeta> = emptyList(),
    /** Strings or {value,label} objects; read with [collectionChoices]. */
    val collections: List<JsonElement> = emptyList(),
)

data class Choice(val value: String, val label: String)

fun collectionChoices(meta: IdeasMeta?): List<Choice> = meta?.collections.orEmpty().mapNotNull { el ->
    when (el) {
        is JsonPrimitive -> el.contentOrNull?.let { Choice(it, prettyEnum(it)) }
        is JsonObject -> {
            fun s(k: String) = (el[k] as? JsonPrimitive)?.contentOrNull
            val v = s("value") ?: s("id") ?: s("label") ?: s("name")
            v?.let { Choice(it, s("label") ?: s("name") ?: prettyEnum(it)) }
        }
        else -> null
    }
}

/** "ACTIONABLE" → "Actionable". */
fun prettyEnum(s: String): String =
    if (s.all { it.isUpperCase() || it == '_' }) s.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() } else s

@Serializable
data class IdeaResult(
    val status: String = "created",
    val ideaId: String? = null,
    val title: String? = null,
    val field: String? = null,
    val domain: String? = null,
    val points: Double? = null,
    val line: String? = null,
)

// ── The check-in: /check's `checkin`, POST /checkin and /checkin/undo (health phase 2; D1, D2, D5, D9) ──

/**
 * /check's `checkin`: [live] while the check-in can be drawn (the server's switch in force and its view read), [paused]
 * while the user paused check-ins on the web (no row and no ask; a check-in sent is still kept), how many today's life
 * day holds and the newest one's instant. Counts only: nothing here says what any check-in was.
 */
@Serializable
data class CheckinState(val live: Boolean = false, val lastAt: String? = null, val todayCount: Int = 0, val paused: Boolean = false)

/**
 * What a check-in sends (POST /checkin): [at] the instant of the tap (ISO, the server's clock as best known, fixed at
 * the tap and sent as is on every try), the grid's pick (whole steps −4..+4), the stress level 0..4 or none, the phone's
 * surface ([via]: check, widget, tile or notify), the user's own tap ([trigger] self) and how long the sheet took. It
 * travels only in the body, never in a URL.
 */
data class CheckinBody(
    val at: String,
    val valence: Int,
    val energy: Int,
    val stress: Int? = null,
    val via: String = "check",
    val tookMs: Long? = null,
    val trigger: String = "self",
)

/**
 * POST /checkin's answer: [line] the receipt with the time alone ("Logged 14:12"), safe on any surface; [words] the
 * grid's words for the pick ("Calm, content"), for the main display's receipt only; [undoUntil] when its Undo goes.
 */
@Serializable
data class CheckinResult(
    val id: String = "",
    val day: String? = null,
    val line: String = "",
    val words: String? = null,
    val undoUntil: String? = null,
    val duplicate: Boolean = false,
)

/** POST /checkin/undo's answer: [deleted] 1, or 0 for one already gone, and the server's line. */
@Serializable
data class CheckinUndoResult(val id: String = "", val deleted: Int = 0, val line: String = "")

// ── The lift: /check's `lift` and POST /lift/set (health phase 2; D12, D14 to D19) ──

/** /check's `lift`: the open lift ([sessionId], its [label], when it started) and the set to do next (null when every row is done). */
@Serializable
data class OpenLift(val sessionId: String, val label: String? = null, val startedAt: String? = null, val next: LiftNext? = null)

/**
 * The set to do next, by the web logger's own prefill: where it lands ([entryId], the movement's next [ord]), its kind
 * and figures (kilograms as stored; a bodyweight movement's signed added load), and its words in [unit]. [fromLast]: the
 * figures are the last lift's set, so one tap sends them as they are; false: nothing to copy (the figures are null).
 */
@Serializable
data class LiftNext(
    val entryId: String,
    val movementKey: String = "",
    val name: String = "",
    val ord: Int = 1,
    val kind: String = "WORKING",
    val weightKg: Double? = null,
    val reps: Int? = null,
    val durationSec: Int? = null,
    val distanceM: Double? = null,
    val amrap: Boolean = false,
    val unit: String = "kg",
    val fromLast: Boolean = false,
    /** "60 kg × 8", "24 kg per dumbbell × 10", "hold 1:05"; null with nothing to copy. */
    val setText: String? = null,
    /** The logger's grey line under the fields: "last 60 × 8"; null with nothing to copy. */
    val ghostLine: String? = null,
)

/**
 * What a set sends (POST /lift/set): the lift and the movement, [doneAt] the instant of the tap (ISO, fixed at the tap),
 * and the set as the web row's ✓ sends it: its kind and figures (kilograms, never the unit shown). Never `ord` (the
 * server takes the movement's next place under its lock) and never an outcome the phone didn't ask (RIR, Failure).
 */
data class LiftSetBody(
    val sessionId: String,
    val entryId: String,
    val doneAt: String,
    val kind: String? = null,
    val weightKg: Double? = null,
    val reps: Int? = null,
    val durationSec: Int? = null,
    val distanceM: Double? = null,
    val amrap: Boolean = false,
)

/** A set as stored (kilograms; [chainOf] the set a drop continues). */
@Serializable
data class LiftSet(
    val id: String = "",
    val entryId: String = "",
    val ord: Int = 0,
    val kind: String = "WORKING",
    val chainOf: Int? = null,
    val weightKg: Double? = null,
    val reps: Int? = null,
    val rir: Int? = null,
    val toFailure: Boolean = false,
    val amrap: Boolean = false,
    val durationSec: Int? = null,
    val distanceM: Double? = null,
    val doneAt: String? = null,
)

/** The big-jump question in plain words: the set stands as a record; Keep, Confirm and Fix are the web's ([webHref]). */
@Serializable
data class LiftJump(val line: String = "", val webHref: String = "/train/exercise")

/**
 * POST /lift/set's answer: the set, [duplicate] for a resend already saved, [restSec] the rest after it (0: none),
 * [line] in the web row's words ("Bench press: logged 60 kg × 8 · RIR 2."), [jump] only for a big jump, and [lift] the
 * lift after the set (null when it is no longer open or the read after failed: /check is read again).
 */
@Serializable
data class LiftSetResult(
    val set: LiftSet? = null,
    val duplicate: Boolean = false,
    val restSec: Int = 0,
    val line: String? = null,
    val jump: LiftJump? = null,
    val lift: OpenLift? = null,
)

// ── POST /exercise (blueprint P27, D21: Health Connect's walks, hikes, workouts and weigh-ins) ──

/**
 * One exercise session as the sync sends it in `walks`: its Health Connect record id, its kind (core/HealthLine.KINDS),
 * its instants (ISO), its distance (a walk always has one; a kind with none sends none), a walk's climb, and the
 * variant or the sport's name its type says. An absent field is left out of the body, so a walk is sent as it always was.
 */
@Serializable
data class HealthWalk(
    val externalId: String,
    val kind: String,
    val start: String,
    val end: String,
    val distanceKm: Double? = null,
    val climbM: Double? = null,
    val origin: String? = null,
    val variant: String? = null,
    val label: String? = null,
)

/** One weigh-in as the sync sends it. */
@Serializable
data class HealthWeight(val externalId: String, val at: String, val kg: Double)

/** A batch: [since] is when the sync was switched on (a walk that started before it is the backfill: recorded, never paid). */
@Serializable
data class HealthBatch(val since: String, val walks: List<HealthWalk> = emptyList(), val weights: List<HealthWeight> = emptyList())

/** POST /exercise's counts: walks [added] ([paid] and [recorded]), [matched] to a walk typed by hand, [duplicate]s, and their [xp]. */
@Serializable
data class HealthWalkCounts(
    val added: Int = 0,
    val paid: Int = 0,
    val recorded: Int = 0,
    val matched: Int = 0,
    val duplicate: Int = 0,
    val xp: Double = 0.0,
)

/** D21: every other kind's counts: [added] as a record of its own, [matched] to one already there, [duplicate]s. Never paid. */
@Serializable
data class HealthSessionCounts(val added: Int = 0, val matched: Int = 0, val duplicate: Int = 0)

@Serializable
data class HealthWeightCounts(val added: Int = 0, val kept: Int = 0)

/** An item a core refused, with its own line (the rest of the batch still landed): a walk, a session or a weigh-in. */
@Serializable
data class HealthRefusal(val kind: String = "walk", val externalId: String = "", val error: String = "")

/** POST /exercise (P27): what the batch did, and the server's [line] (Settings › Health Connect shows it). */
@Serializable
data class HealthSyncResult(
    val walks: HealthWalkCounts = HealthWalkCounts(),
    val sessions: HealthSessionCounts = HealthSessionCounts(),
    val weights: HealthWeightCounts = HealthWeightCounts(),
    val refused: List<HealthRefusal> = emptyList(),
    val line: String? = null,
)

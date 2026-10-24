package com.xtnl.app.ui.check

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtnl.app.AppGraph
import com.xtnl.app.core.DailyStrip
import com.xtnl.app.core.OwedLine
import com.xtnl.app.core.QuestLine
import com.xtnl.app.core.SendLine
import com.xtnl.app.core.StatusLine
import com.xtnl.app.core.TickLadder
import com.xtnl.app.core.TickNote
import com.xtnl.app.core.WalletLine
import com.xtnl.app.core.YesterdayLine
import com.xtnl.app.data.CheckData
import com.xtnl.app.data.DailyQuests
import com.xtnl.app.data.LevelInfo
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.Landed
import com.xtnl.app.data.OwedItem
import com.xtnl.app.data.QueueState
import com.xtnl.app.data.QueuedWrite
import com.xtnl.app.data.QuestsData
import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.Wallet
import com.xtnl.app.data.WorkItem
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * The quick check: GET /check, the tick and its undo, a work item's Done and
 * its reopen. Optimistic: a tick shows at once and is put back (with the
 * server's line) if the server says no. The last /check is cached and shown
 * offline. Beside it, GET /quests (blueprint P15): the main quest, this week's
 * sprint and Today's three, read only; its rows tick through the tasks here.
 * P7: the Yesterday lane's rows tick here too, with day "yesterday"; their
 * state is keyed apart from today's (YesterdayLine.key), since a daily habit
 * has a row on both lanes. P8: a tick carries its row's own life day, fixed at
 * the tap; one that gets no answer at all (and a work item's Done) waits on the
 * phone (data/SendQueue) and stays ticked, "waiting to send", until it lands.
 */
class CheckViewModel(private val graph: AppGraph) : ViewModel() {

    /** A tick made here: its instance (for Undo) once the server has answered. */
    data class Kept(val instanceId: String?, val xp: Double?, val mvv: Boolean, val clientId: String, val atMs: Long = System.currentTimeMillis())

    /**
     * P22 review: an owed card's picks (its minute chip, a reading must's pages), held here so a fold or an unfold (the
     * activity is not recreated, but the list's branch changes) keeps them. [pages] starts at the card's day target.
     */
    data class OwedPick(val minutes: Int? = null, val pages: Int? = null)

    data class Ui(
        val data: CheckData? = null,
        val fetchedAtMs: Long? = null,
        /** Nothing to show yet (no cache either). */
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        /** The last refresh couldn't reach the server: what's shown is the cache. */
        val offline: Boolean = false,
        /** The server answered the last refresh with a refusal (a 401, a 500): its line, shown over the cache instead of "Offline". */
        val refused: String? = null,
        /** That refusal was about the API token (401): the line leads to Settings. */
        val refusedAuth: Boolean = false,
        /** Why there's nothing to show. */
        val error: String? = null,
        /** Ticks made here, by row key: today's rows by template id, the Yesterday lane's by YesterdayLine.key (P7). */
        val kept: Map<String, Kept> = emptyMap(),
        val pending: Set<String> = emptySet(),
        val workHidden: Set<String> = emptySet(),
        /**
         * The web's "Board clear" as the server says it (nothing open in Must, Planned or Habits, at least one
         * done): /check's tasksSummary.allDone, then each tick's allDone, until the next read.
         */
        val allDone: Boolean = false,
        /** Ticks when a tick here just cleared the board (its answer said allDone). */
        val boardClearKey: Int = 0,
        /** The character's level as the last tick answered it (exact), until the next /check brings its own. */
        val tickLevel: LevelInfo? = null,
        /** A level the character just reached, waiting for the header seal to play it (at most 30 s). */
        val levelUp: LevelUp? = null,
        /** Work items whose Done is showing (the row's check and slide), before they leave the list. */
        val workClosing: Set<String> = emptySet(),
        /** GET /quests (P15): the main quest, its sprint and Today's three; null until read (a failed read keeps the last). */
        val quests: QuestsData? = null,
        /** The credits wallet as the last tick answered it (P16: the server's balance), until the next /check brings its own. */
        val tickWallet: Wallet? = null,
        /** P22: owed cards whose action is out (their buttons wait for the server), by instance id. */
        val owedBusy: Set<String> = emptySet(),
        /** P22 review: each owed card's picks, by instance id (absent: none yet, so a reading must's target). */
        val owedPicks: Map<String, OwedPick> = emptyMap(),
        /** P8: the offline queue, this source's: what waits to send, and what was not sent. */
        val queue: QueueState = QueueState(),
    ) {
        /** P22: the open debts, the server's own (the last /check, or a make-up's answer). */
        val owed: List<OwedItem> get() = data?.owed.orEmpty()
        /** P22: the server has Duty switched on (/check's dutyOn): the owed cards' actions run. */
        val dutyOn: Boolean get() = data?.dutyOn == true
        /** The level to show: a tick's answer, else /check's. */
        val level: LevelInfo? get() = tickLevel ?: data?.level
        /** The wallet chip (P16): a tick's answer, else /check's; null while the server sends none (credits off). */
        val wallet: Wallet? get() = tickWallet ?: data?.credits
        val tasks: List<TaskItem>
            get() = data?.tasks.orEmpty().map { t ->
                val k = kept[t.templateId]
                // P8: a tick waiting on the phone (made here or on the widget, before a restart too) shows ticked.
                val q = if (k == null && t.open) queue.tickFor(t.templateId, yesterday = false) else null
                when {
                    k != null -> t.copy(status = if (k.mvv) "DONE_MVV" else "DONE")
                    q != null -> t.copy(status = if (q.mvv) "DONE_MVV" else "DONE")
                    else -> t
                }
            }
        /** P8: the rows (by key) whose tick waits to send. */
        val waitingKeys: Set<String> get() = queue.items.mapNotNull { rowKeyOf(it) }.toSet()
        /**
         * The header's counts: every row the list shows (habits included), so "3 open" matches three open circles; a side
         * quest still open is not counted (P31: it asks nothing of the day, as the web's counts and tasksSummary say).
         */
        val shownOpen: Int get() = tasks.count { (it.open || it.locked) && it.countsForBoard }
        val shownKept: Int get() = tasks.count { it.kept }
        /** The daily quests (the Must lane's count and strip), each listed quest's cell live from its row (DailyStrip). */
        val daily: DailyQuests? get() = DailyStrip.live(data?.daily, tasks)
        /** The web's "Board clear", the server's call (see [allDone]). */
        val boardClear: Boolean get() = allDone
        /** The due work items; one whose Done waits to send (P8) stays off the list. */
        val work: List<WorkItem>
            get() = data?.work.orEmpty().filter { w -> w.id !in workHidden && queue.items.none { it.kind == SendLine.Kind.WORK_DONE && it.workId == w.id } }
        /** P7: the Yesterday lane's rows (the server's, a tick made here shown at once), keyed apart from today's. */
        val yesterday: List<TaskItem>
            get() = data?.yesterday?.tasks.orEmpty().map { t ->
                val k = kept[YesterdayLine.key(t.templateId)]
                val q = if (k == null && t.open) queue.tickFor(t.templateId, yesterday = true) else null
                when {
                    k != null -> t.copy(status = if (k.mvv) "DONE_MVV" else "DONE")
                    q != null -> t.copy(status = if (q.mvv) "DONE_MVV" else "DONE")
                    else -> t
                }
            }
    }

    /** A level up to play, once ([key]), from [from] to [to]; queued at [atMs] (wall clock). */
    data class LevelUp(val key: Int, val from: LevelInfo, val to: LevelInfo, val atMs: Long)

    sealed interface Event {
        /**
         * [level]: the character's level after the tick, when the server sent it; [before], the level shown before it.
         * [templateId] is the row's key (a Yesterday row's is YesterdayLine.key). P7: [moments], the Seals and Ascensions
         * the tick played (TickNote.moments); [knee], the knee note's line when this tick is the first to say it today.
         */
        data class TaskKept(
            val templateId: String, val xp: Double, val line: String?, val hinted: Boolean, val level: LevelInfo? = null, val before: LevelInfo? = null,
            val moments: List<String> = emptyList(), val knee: String? = null,
        ) : Event
        /** A tick the server refused; [retry] sends it again (null when a retry can only fail the same way: a timer that is gone). */
        data class TaskFailed(val templateId: String, val message: String, val retry: (() -> Unit)?) : Event
        /** P8: a tick that got no answer waits on the phone ([message] says so, and the day it counts for); its row stays ticked. */
        data class TaskQueued(val templateId: String, val message: String) : Event
        /** P8: a work item's Done that got no answer waits on the phone; its row stays off the list. */
        data class WorkQueued(val item: WorkItem, val message: String) : Event
        data class TaskUndone(val templateId: String, val xp: Double) : Event
        data class UndoFailed(val message: String) : Event
        data class WorkDone(val item: WorkItem) : Event
        /** [id]: the item whose Done the server refused (its row nods back in), or null (a reopen). */
        data class WorkFailed(val message: String, val id: String? = null, val retry: () -> Unit) : Event
        data class Note(val message: String) : Event
        /** A tick here ([templateId]) just cleared the board: the moment (the roll call, the banner's stamp, the chime). */
        data class BoardClear(val templateId: String) : Event
        /**
         * P22: an owed card's action landed: the server's line; [repaid] a make-up (the kept tone), false for Accept the
         * loss or an undo. [undo] (P22 review): the snackbar's Undo while the make-up's ten minutes are open, else null.
         */
        data class MadeUp(val line: String, val repaid: Boolean, val undo: (() -> Unit)? = null) : Event
        /** P22: the server refused it (or couldn't be reached: then [retry] sends the same action again, the same clientId). */
        data class MakeUpFailed(val message: String, val retry: (() -> Unit)?) : Event
    }

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()

    /** Collected app-wide (AppRoot), so a tick that fails after a switch to another tab still says so. */
    private val _events = MutableSharedFlow<Event>(extraBufferCapacity = 16)
    val events: SharedFlow<Event> = _events.asSharedFlow()

    companion object {
        /** A work item's row stays this long after Done: its check, then (from 260 ms) its slide out. */
        const val WORK_HOLD_MS = 420L
        /** A level up waits this long for the header seal to come on screen. */
        const val LEVEL_UP_QUEUE_MS = 30_000L
        /**
         * The rows keep the order on screen this long after a tick or an undo here (the ladder's run): a background
         * read never moves a row under a finger. A pull to refresh brings the server's order at once.
         */
        const val ORDER_HOLD_MS = TickLadder.RUN_MS

        /**
         * [fresh]'s rows in the order [shown] lists them (a row the server dropped goes); a row the server added goes
         * just after the row the server lists before it, or first.
         */
        /** P8: the Check row a waiting tick is for (a Yesterday row's key for the lane's), or null for any other write. */
        fun rowKeyOf(item: QueuedWrite): String? {
            if (item.kind != SendLine.Kind.TICK) return null
            val id = item.templateId ?: return null
            return if (item.yesterday) YesterdayLine.key(id) else id
        }

        fun holdOrder(shown: List<String>, fresh: List<TaskItem>): List<TaskItem> {
            val at = HashMap<String, Int>(shown.size * 2)
            shown.forEachIndexed { i, id -> at[id] = i }
            val out = fresh.filter { it.templateId in at }.sortedBy { at.getValue(it.templateId) }.toMutableList()
            var after: String? = null
            for (t in fresh) {
                if (t.templateId !in at) out.add(after?.let { a -> out.indexOfFirst { it.templateId == a } + 1 } ?: 0, t)
                after = t.templateId
            }
            return out
        }
    }

    private var refreshJob: Job? = null
    private var questsJob: Job? = null
    /** The last tick or undo here (wall clock): the list holds its order for [ORDER_HOLD_MS] after it. */
    private var touchedAt = 0L
    /** Level ups so far: each one's key, so a played one never plays again. */
    private var levelUps = 0
    /** Undo pressed before the server answered the tick: undo as soon as it does. */
    private val undoWhenKept = mutableSetOf<String>()
    /** P16: ticks that were out at the same time as another tick here (their answers' credits change is shared). */
    private val overlapped = mutableSetOf<String>()
    /** P7: the knee notes already said (TickNote.kneeKey: once each a life day and stage). */
    private val kneeSaid = mutableSetOf<String>()

    init {
        start()
        // A new server or demo mode: start over from that source's cache. A read still out to the old one is dropped.
        viewModelScope.launch {
            graph.settings.state.map { if (it.demo) "demo" else it.server }.distinctUntilChanged().drop(1).collect {
                // The audit was the old source's (Settings cleared it with the switch): the alarm goes until the new one says so.
                graph.auditReminder.sync()
                refreshJob?.cancel()
                questsJob?.cancel()
                overlapped.clear()
                kneeSaid.clear()
                _ui.value = Ui(queue = graph.sendQueue.state.value.of(graph.source))
                start()
            }
        }
        @OptIn(FlowPreview::class)
        viewModelScope.launch {
            graph.changes.debounce(600).collect { refresh(quiet = true) }
        }
        // P8: the offline queue, this source's (what waits, what was not sent), and what lands or is set aside.
        viewModelScope.launch {
            graph.sendQueue.state.collect { q -> _ui.update { it.copy(queue = q.of(graph.source)) } }
        }
        viewModelScope.launch { graph.sendQueue.landed.collect { landedHere(it) } }
        viewModelScope.launch {
            graph.sendQueue.setAside.collect { n ->
                if (n.item.source != graph.source) return@collect
                when (n.item.kind) {
                    SendLine.Kind.TICK -> {
                        val key = rowKeyOf(n.item) ?: return@collect
                        // Its row opens again (it never landed) and says why; the Not sent card keeps the line.
                        if (_ui.value.kept[key]?.clientId == n.item.clientId) _ui.update { it.copy(kept = it.kept - key) }
                        _events.tryEmit(Event.TaskFailed(key, SendLine.NOT_SENT_TITLE + ": " + n.item.label + ". " + n.line, null))
                    }
                    SendLine.Kind.WORK_DONE -> {
                        _ui.update { u -> u.copy(workHidden = u.workHidden - n.item.workId.orEmpty()) }
                        _events.tryEmit(Event.Note(SendLine.NOT_SENT_TITLE + ": Done on " + n.item.label + ". " + n.line))
                    }
                    SendLine.Kind.LOG -> Unit
                }
            }
        }
    }

    /**
     * P8: a tick the queue landed (made here or on the widget): its row is kept with its instance (so its Undo works for
     * its ten minutes), the level and the wallet follow its answer, and its line says it was sent.
     */
    private fun landedHere(l: Landed) {
        if (l.item.source != graph.source) return
        // A Done that landed stays off the list until /check (read again now) no longer lists it.
        if (l is Landed.Work) _ui.update { it.copy(workHidden = it.workHidden + l.item.workId.orEmpty()) }
        if (l !is Landed.Tick) return
        val key = rowKeyOf(l.item) ?: return
        val r = l.result
        val before = _ui.value.level
        touchedAt = System.currentTimeMillis()
        _ui.update {
            it.copy(
                kept = it.kept + (key to Kept(r.instanceId, r.xp, l.item.mvv, l.item.clientId)),
                // Board clear is the server's call; a tick that lands late only ever clears more (no moment is played).
                allDone = it.allDone || r.allDone,
                tickLevel = r.level ?: it.tickLevel,
                levelUp = levelUpOf(it, before, r.level),
                tickWallet = r.credits?.let { c -> WalletLine.after(it.wallet, c) } ?: it.tickWallet,
            )
        }
        val knee = r.knee?.takeIf { it.line.isNotBlank() && kneeSaid.add(TickNote.kneeKey(it)) }?.line
        val line = SendLine.sentTick(l.item.label, StatusLine.tickLine(r.line, r.competency))
        _events.tryEmit(Event.TaskKept(key, r.xp, line, hinted = true, level = r.level, before = before, moments = TickNote.moments(r.celebrations), knee = knee))
    }

    /** P8: the server clock's offset from the phone's at the board's read, so a tap's own day is the server's. */
    private fun offsetMs(): Long? = _ui.value.let { u -> SendLine.offsetOf(u.data?.now, u.fetchedAtMs) }

    /** P8: what waits for this source is sent now (the job takes over if it can't land). */
    fun sendWaiting() {
        if (_ui.value.queue.items.isNotEmpty()) graph.sendQueue.kick()
    }

    /** P8: a kept-back line sent anyway, for today (the server's day as last read). */
    fun sendForToday(clientId: String) {
        val day = SendLine.dayKey(SendLine.serverNow(System.currentTimeMillis(), offsetMs()))
        if (graph.sendQueue.sendForToday(clientId, day)) graph.sendQueue.kick()
    }

    /** P8: a not-sent note read, or a kept-back line discarded. */
    fun dismissNotSent(clientId: String) = graph.sendQueue.dismiss(clientId)

    private fun start() {
        viewModelScope.launch {
            val source = graph.source
            val cached = graph.cache.read(source)
            if (source != graph.source) return@launch
            if (cached != null && _ui.value.data == null) {
                _ui.update { it.copy(data = cached.data, fetchedAtMs = cached.fetchedAtMs, loading = false, allDone = cached.data.tasksSummary?.allDone ?: false) }
            }
            refresh(quiet = cached != null)
        }
    }

    /**
     * GET /quests (P15), beside every refresh: read only, never a spinner or an error of its own. A failed read keeps
     * what is shown; a read that left before Settings switched the source is dropped. [fresh]: after a tick or an undo
     * here that can move the card's figures (QuestLine.touches), a read already out (which may have left before the
     * tick landed) is dropped for a new one, so the counts follow the tick.
     */
    private fun refreshQuests(fresh: Boolean = false) {
        if (questsJob?.isActive == true) {
            if (!fresh) return
            questsJob?.cancel()
        }
        questsJob = viewModelScope.launch {
            val source = graph.source
            val r = graph.api.quests()
            if (source != graph.source) return@launch
            if (r is Outcome.Ok) _ui.update { it.copy(quests = r.value) }
        }
    }

    /** Pull to refresh (quiet = no spinner: on resume, after a deed elsewhere). P8: a pull also sends what waits. */
    fun refresh(quiet: Boolean = false) {
        refreshQuests()
        if (!quiet) sendWaiting()
        if (refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            if (!quiet) _ui.update { it.copy(refreshing = true) }
            val source = graph.source
            val r = graph.api.check()
            if (r is Outcome.Ok) graph.cache.write(source, r.value, System.currentTimeMillis())
            // Settings switched the source while this was out: that source's own read is coming.
            if (source != graph.source) return@launch
            // The Sunday reminder follows the server's switch (`auditOn`, never a read: a week not yet shown or a failed
            // audit read leaves it on); demo data never arms it.
            if (r is Outcome.Ok && source != "demo") graph.auditReminder.sawAudit(r.value.auditOn)
            when (r) {
                is Outcome.Ok -> {
                    val now = System.currentTimeMillis()
                    // P8: the server answered, so what waits for it goes now.
                    sendWaiting()
                    _ui.update { u ->
                        val kept = reconcile(u, r.value)
                        // Just after a tick or an undo, a quiet read keeps the rows where they are on screen.
                        val hold = quiet && now - touchedAt < ORDER_HOLD_MS
                        val shown = u.data?.tasks?.takeIf { hold }
                        val held = shown?.let { r.value.copy(tasks = holdOrder(it.map { t -> t.templateId }, r.value.tasks)) } ?: r.value
                        // P7: the Yesterday lane holds its order the same way (a row ticked here stays under the finger).
                        val shownY = u.data?.yesterday?.tasks?.takeIf { hold }
                        val data = if (shownY != null && held.yesterday != null) held.copy(yesterday = held.yesterday.copy(tasks = holdOrder(shownY.map { t -> t.templateId }, held.yesterday.tasks))) else held
                        u.copy(
                            data = data, fetchedAtMs = now, loading = false, refreshing = false, offline = false, refused = null, refusedAuth = false, error = null,
                            kept = kept, allDone = allDoneOf(u, r.value, kept), workHidden = u.workHidden.intersect(r.value.work.map { it.id }.toSet()),
                            tickLevel = null, levelUp = levelUpOf(u, u.level, r.value.level), tickWallet = null,
                        )
                    }
                }
                is Outcome.Err -> _ui.update { u ->
                    // No answer is "Offline"; an answer that said no (a token, a server fault) says what it said.
                    if (u.data != null) u.copy(refreshing = false, loading = false, offline = r.offline, refused = r.message.takeUnless { r.offline }, refusedAuth = !r.offline && r.code == "auth")
                    else u.copy(refreshing = false, loading = false, error = r.message)
                }
            }
        }
    }

    /** The server's row a key names: today's by template id, a Yesterday row's (P7) in the lane. */
    private fun rowOf(data: CheckData?, key: String): TaskItem? =
        if (YesterdayLine.isKey(key)) data?.yesterday?.tasks?.firstOrNull { YesterdayLine.key(it.templateId) == key }
        else data?.tasks?.firstOrNull { it.templateId == key }

    /** Ticks made here stay ticked while the server still says so (or hasn't heard yet). */
    private fun reconcile(u: Ui, fresh: CheckData): Map<String, Kept> = u.kept.filter { (id, k) ->
        val server = rowOf(fresh, id)
        when {
            server == null -> false
            id in u.pending -> true
            server.kept -> true
            // A refresh that left before the tick landed can still say OPEN.
            else -> k.instanceId == null || System.currentTimeMillis() - k.atMs < 15_000
        }
    }

    /** The server's Board clear, unless this read left before a tick made here landed (then the tick's own answer stands). */
    private fun allDoneOf(u: Ui, fresh: CheckData, kept: Map<String, Kept>): Boolean {
        val behind = u.pending.isNotEmpty() || kept.keys.any { id -> rowOf(fresh, id)?.kept == false }
        return if (behind) u.allDone else fresh.tasksSummary?.allDone ?: false
    }

    /**
     * A higher level than the one shown (a tick's exact answer, or failing that a /check that shows one): the
     * header seal's level up, queued for 30 s. A first read (nothing shown yet) is no level up.
     */
    private fun levelUpOf(u: Ui, before: LevelInfo?, after: LevelInfo?): LevelUp? {
        val queued = u.levelUp?.takeIf { System.currentTimeMillis() - it.atMs < LEVEL_UP_QUEUE_MS }
        if (before == null || after == null || after.level <= before.level) return queued
        return LevelUp(++levelUps, queued?.from ?: before, after, System.currentTimeMillis())
    }

    /** The header seal played (or gave up on) level up [key]. */
    fun levelUpShown(key: Int) = _ui.update { if (it.levelUp?.key == key) it.copy(levelUp = null) else it }

    fun staleFor(ms: Long): Boolean = _ui.value.fetchedAtMs?.let { System.currentTimeMillis() - it > ms } ?: true

    /**
     * A tick, optimistic. [minutes] (the minutes sheet's chip, blueprint P7) and [sessionId] (a proof row's timer, P23)
     * go to the server as they are; it counts them with the web drawer's clamp and gates a proof row's full tick. [pages]
     * (a reading task's, P24) go as its proof; the server gates them against the day's target and never prices them.
     * [yesterday] (P7): a row of the Yesterday lane, sent with day "yesterday" (T 1.00), its state under its own key.
     * P8: [day], the row's own life day, is fixed here at the tap: the day of the board the row was shown on (its
     * Yesterday lane's for a Yesterday row; SendLine.tickDayOf, the web board's rule), and sent as is on every try, so
     * a Retry and the offline queue's replay are the same request. A tick that gets no answer at all waits on the
     * phone (data/SendQueue) and stays ticked; it books on that day. One that lands is followed in the cache, so the
     * widget stops listing the row (CheckCache.followTick).
     */
    fun complete(
        task: TaskItem, mvv: Boolean = false, clientId: String = UUID.randomUUID().toString(), minutes: Int? = null, sessionId: String? = null, pages: Int? = null,
        yesterday: Boolean = false, day: String? = null,
    ) {
        val key = if (yesterday) YesterdayLine.key(task.templateId) else task.templateId
        val before = _ui.value
        if (key in before.pending) return
        val tickDay = day ?: SendLine.tickDayOf(before.data?.day, before.data?.yesterday?.day, yesterday, SendLine.serverNow(System.currentTimeMillis(), offsetMs()))
        val source = graph.source
        touchedAt = System.currentTimeMillis()
        // P16: ticks out at the same time share the server's one change across them (its `delta`), so neither line names
        // it, and /check is read again once the last of them lands (the chip shows each answer's own wallet meanwhile).
        if (before.pending.isNotEmpty()) overlapped += before.pending + key
        _ui.update {
            it.copy(
                kept = it.kept + (key to Kept(null, task.xpHint, mvv, clientId)),
                pending = it.pending + key,
            )
        }
        viewModelScope.launch {
            when (val r = graph.api.completeTask(task.templateId, mvv, clientId, minutes, sessionId, pages, yesterday, tickDay)) {
                is Outcome.Ok -> {
                    // Board clear is the server's call (its allDone, habits included). A tick only ever clears more,
                    // so an earlier tick's answer arriving late never takes a clear board back. One already undone here doesn't count.
                    val counts = r.value.allDone && key !in undoWhenKept
                    val cleared = counts && !_ui.value.allDone
                    val before = _ui.value.level
                    _ui.update {
                        it.copy(
                            kept = it.kept + (key to Kept(r.value.instanceId, r.value.xp, mvv, clientId)), pending = it.pending - key,
                            allDone = it.allDone || counts,
                            boardClearKey = if (cleared) it.boardClearKey + 1 else it.boardClearKey,
                            tickLevel = r.value.level ?: it.tickLevel,
                            levelUp = levelUpOf(it, before, r.value.level),
                            tickWallet = r.value.credits?.let { c -> WalletLine.after(it.wallet, c) } ?: it.tickWallet,
                        )
                    }
                    // P5: the skill the task fed joins the line (its hours now, or the tier this tick reached); P16: the
                    // credits it earned, from its own answer (" · +10 cr"), only when no other tick here overlapped it.
                    val alone = overlapped.remove(key).not()
                    val line = StatusLine.tickLine(r.value.line, r.value.competency)?.let { it + WalletLine.tickSuffix(r.value.credits, alone) }
                    if (!alone && _ui.value.pending.isEmpty() && r.value.credits != null) graph.changes.tryEmit("task")
                    // P7: the moments the tick played (its Seals and Ascensions), and the knee note the first time it is past
                    // 200 raw on its day (then again at the day's cap).
                    val knee = r.value.knee?.takeIf { it.line.isNotBlank() && kneeSaid.add(TickNote.kneeKey(it)) }?.line
                    _events.tryEmit(
                        Event.TaskKept(key, r.value.xp, line, hinted = task.xpHint != null, level = r.value.level, before = before, moments = TickNote.moments(r.value.celebrations), knee = knee)
                    )
                    if (cleared) _events.tryEmit(Event.BoardClear(key))
                    // No level in the answer (an older server): /check brings it, and with it any level up.
                    if (r.value.level == null) graph.changes.tryEmit("task")
                    // P7: a tick for yesterday can change today's board too (a deadline due yesterday leaves today's lane).
                    if (yesterday) graph.changes.tryEmit("task-yesterday")
                    // The Quest card's counts follow a tick that moves them (a sprint row's task, a Today's three quest).
                    if (QuestLine.touches(_ui.value.quests, task.templateId)) refreshQuests(fresh = true)
                    if (undoWhenKept.remove(key)) undo(key)
                    // P8 review: the widget hears of it (no /check follows a tick): its row is done in the cache, which pokes it.
                    else if (source == graph.source) graph.cache.followTick(source, task.templateId, tickDay, mvv, r.value.xp)
                }
                is Outcome.Err -> {
                    overlapped.remove(key)
                    // P8: no answer at all (and not undone meanwhile): the tick waits on the phone, ticked, and books on
                    // its own day when it lands. Demo data never gets here (it answers on the phone).
                    if (r.offline && key !in undoWhenKept && source == graph.source &&
                        graph.sendQueue.enqueue(QueuedWrite.tick(clientId, source, tickDay, task.title, task.templateId, mvv, minutes, sessionId, pages, yesterday))
                    ) {
                        _ui.update { it.copy(pending = it.pending - key) }
                        _events.tryEmit(Event.TaskQueued(key, SendLine.queuedTick(task.title, tickDay)))
                        return@launch
                    }
                    undoWhenKept.remove(key)
                    // P23: a named timer the server no longer has (another device's tick counted it, or it was discarded):
                    // the row drops it here and /check is read again, so the next tap opens the sheet. A retry of the same
                    // timer can only fail the same way, so none is offered.
                    val timerGone = r.code == "gone" && sessionId != null
                    _ui.update {
                        it.copy(
                            kept = it.kept - key, pending = it.pending - key,
                            data = if (!timerGone) it.data else it.data?.copy(tasks = it.data.tasks.map { t -> if (t.templateId == task.templateId && t.timer?.sessionId == sessionId) t.copy(timer = null) else t }),
                        )
                    }
                    if (timerGone) graph.changes.tryEmit("timer")
                    _events.tryEmit(Event.TaskFailed(key, r.message, if (timerGone) null else ({ complete(task, mvv, clientId, minutes, sessionId, pages, yesterday, tickDay) })))
                }
            }
        }
    }

    /**
     * Proof of work (P23): a proof row's timer, started (one runs at a time: the server stops any other). The row shows
     * it from the answer at once; the next /check brings the server's own.
     */
    fun startTimer(task: TaskItem, clientId: String = UUID.randomUUID().toString()) {
        if (task.templateId in _ui.value.pending) return
        viewModelScope.launch {
            when (val r = graph.api.startTimer(task.templateId, clientId)) {
                is Outcome.Ok -> {
                    val timer = r.value.timer
                    _ui.update { s ->
                        s.copy(data = s.data?.copy(tasks = s.data.tasks.map { t ->
                            when {
                                t.templateId == task.templateId -> t.copy(timer = timer)
                                t.timer?.running == true -> t.copy(timer = t.timer.copy(running = false, endedAt = timer?.startedAt))
                                else -> t
                            }
                        }))
                    }
                    _events.tryEmit(Event.Note(r.value.line ?: "Timer started."))
                    graph.changes.tryEmit("timer")
                }
                is Outcome.Err -> _events.tryEmit(Event.Note(r.message))
            }
        }
    }

    /** Its stop: the minutes wait for the tick that counts them. */
    fun stopTimer(task: TaskItem, clientId: String = UUID.randomUUID().toString()) {
        val sessionId = task.timer?.sessionId ?: return
        viewModelScope.launch {
            when (val r = graph.api.stopTimer(sessionId, clientId)) {
                is Outcome.Ok -> {
                    val timer = r.value.timer
                    _ui.update { s -> s.copy(data = s.data?.copy(tasks = s.data.tasks.map { t -> if (t.templateId == task.templateId) t.copy(timer = timer) else t })) }
                    _events.tryEmit(Event.Note(r.value.line ?: "Timer stopped."))
                    graph.changes.tryEmit("timer")
                }
                is Outcome.Err -> _events.tryEmit(Event.Note(r.message))
            }
        }
    }

    /** P22 review: an owed card's chips picked ([minutes], [pages]); held across a fold (see [OwedPick]). */
    fun pickOwed(instanceId: String, minutes: Int?, pages: Int?) =
        _ui.update { it.copy(owedPicks = it.owedPicks + (instanceId to OwedPick(minutes, pages))) }

    /**
     * An owed card's action (P22; docs/mobile-api.md POST /tasks/makeup): [action] make up (×0.85, the whole debt repaid),
     * its minimum, Accept the loss, or (P22 review) undo a make-up made here; a proof must's make-up brings its [minutes]
     * or [pages]. Not optimistic: the card's buttons wait for the server; then the cards are the server's own (the
     * answer's `owed`; without it the card leaves, or an undone one comes back, and the next /check brings the rest), and
     * its line is said, with Undo while the make-up's ten minutes are open. A refusal keeps the card as it was and says
     * why; one saying the debt is no longer owed (made up or written off elsewhere) takes the card away; a retry (offline
     * only) sends the same clientId, so it lands once.
     */
    fun makeUp(card: OwedItem, action: String, minutes: Int? = null, pages: Int? = null, clientId: String = UUID.randomUUID().toString()) {
        if (card.instanceId in _ui.value.owedBusy) return
        _ui.update { it.copy(owedBusy = it.owedBusy + card.instanceId) }
        viewModelScope.launch {
            val source = graph.source
            val r = graph.api.makeUp(card.instanceId, action, clientId, minutes, pages)
            // Settings switched the source meanwhile: the state was started over, so this answer is the old one's.
            if (source != graph.source) return@launch
            when (r) {
                is Outcome.Ok -> {
                    val v = r.value
                    // A /check that left before this landed would bring the old cards back over the answer's: it is
                    // dropped, and the read after the debounce (it starts after the write) is the one that lands.
                    dropRefreshInFlight()
                    _ui.update { u ->
                        val fallback = if (action == OwedLine.UNDO) u.owed.filter { it.instanceId != card.instanceId } + card else u.owed.filter { it.instanceId != card.instanceId }
                        u.copy(
                            owedBusy = u.owedBusy - card.instanceId,
                            owedPicks = u.owedPicks - card.instanceId,
                            data = u.data?.copy(owed = v.owed ?: fallback),
                            tickLevel = v.level ?: u.tickLevel,
                            levelUp = levelUpOf(u, u.level, v.level),
                            tickWallet = v.credits?.let { c -> WalletLine.after(u.wallet, c) } ?: u.tickWallet,
                        )
                    }
                    val undo = if (OwedLine.undoable(action, v.undoUntil)) ({ makeUp(card, OwedLine.UNDO) }) else null
                    _events.tryEmit(Event.MadeUp(v.line ?: "Made up.", repaid = action == OwedLine.MAKEUP || action == OwedLine.MINIMUM, undo = undo))
                    // A make-up is today's work (the streak, Today's three): /check reads it again.
                    graph.changes.tryEmit("makeup")
                }
                is Outcome.Err -> {
                    // Made up or written off elsewhere (404, or "Nothing is owed there any more."): the card leaves.
                    val gone = OwedLine.cardGone(action, r.code, r.message)
                    _ui.update { u ->
                        u.copy(
                            owedBusy = u.owedBusy - card.instanceId,
                            data = if (gone) u.data?.copy(owed = u.data.owed.filter { it.instanceId != card.instanceId }) else u.data,
                        )
                    }
                    _events.tryEmit(Event.MakeUpFailed(r.message, if (r.offline) ({ makeUp(card, action, minutes, pages, clientId) }) else null))
                    // Any answer that said no: the cards follow the server again (a quiet read), so a tap never meets the same refusal.
                    if (!r.offline) graph.changes.tryEmit("makeup")
                }
            }
        }
    }

    /** A /check still out (it may have left before a write here landed): dropped, its spinner with it. */
    private fun dropRefreshInFlight() {
        if (refreshJob?.isActive != true) return
        refreshJob?.cancel()
        _ui.update { it.copy(refreshing = false) }
    }

    /**
     * An undo of a tick made here, by its row key ([key]: a template id, or a Yesterday row's YesterdayLine.key, P7). P8: a
     * tick still waiting on the phone (made here or on the widget) is taken off it, and nothing is sent; one on its way
     * waits for its answer.
     */
    fun undo(key: String) {
        val u = _ui.value
        val waiting = u.queue.items.firstOrNull { rowKeyOf(it) == key }
        if (waiting != null && u.kept[key]?.instanceId == null && key !in u.pending) {
            if (graph.sendQueue.cancel(waiting.clientId)) {
                touchedAt = System.currentTimeMillis()
                _ui.update { it.copy(kept = it.kept - key, allDone = false) }
                _events.tryEmit(Event.Note(SendLine.TAKEN_BACK))
            } else {
                _events.tryEmit(Event.Note(SendLine.SENDING_NOW))
            }
            return
        }
        val k = u.kept[key] ?: return
        val templateId = YesterdayLine.templateOf(key)
        val yesterday = YesterdayLine.isKey(key)
        touchedAt = System.currentTimeMillis()
        // An undone tick opens its task again: the board isn't clear.
        if (key in u.pending || k.instanceId == null) {
            undoWhenKept += key
            _ui.update { it.copy(kept = it.kept - key, allDone = false) }
            return
        }
        _ui.update { it.copy(kept = it.kept - key, allDone = false) }
        val clientId = UUID.randomUUID().toString()
        viewModelScope.launch {
            // The server's copy may already say DONE; show it open until the next refresh agrees.
            _ui.update { s ->
                val open = { t: TaskItem -> if (t.templateId == templateId) t.copy(status = "OPEN") else t }
                s.copy(data = if (yesterday) s.data?.copy(yesterday = s.data.yesterday?.let { y -> y.copy(tasks = y.tasks.map(open)) }) else s.data?.copy(tasks = s.data.tasks.map(open)))
            }
            when (val r = graph.api.undoTask(k.instanceId, clientId)) {
                is Outcome.Ok -> {
                    r.value.level?.let { l -> _ui.update { it.copy(tickLevel = l) } }
                    _events.tryEmit(Event.TaskUndone(key, r.value.xp))
                    graph.changes.tryEmit("task-undo")
                    if (QuestLine.touches(_ui.value.quests, templateId)) refreshQuests(fresh = true)
                }
                is Outcome.Err -> {
                    _ui.update { it.copy(kept = it.kept + (key to k), allDone = it.allDone || u.allDone) }
                    _events.tryEmit(Event.UndoFailed(r.message))
                }
            }
        }
    }

    /**
     * A work item's Done: the row shows its check at once ([Ui.workClosing]) and the server is told at once; the row
     * leaves the list [holdMs] later (once it has slid out), whatever the server is doing. The snackbar waits for the
     * server's OK; a refusal brings the row back.
     */
    fun workDone(item: WorkItem, clientId: String = UUID.randomUUID().toString(), holdMs: Long = WORK_HOLD_MS) {
        if (item.id in _ui.value.workClosing) return
        _ui.update { if (holdMs <= 0) it.copy(workHidden = it.workHidden + item.id) else it.copy(workClosing = it.workClosing + item.id) }
        if (holdMs > 0) viewModelScope.launch {
            delay(holdMs)
            _ui.update { if (item.id in it.workClosing) it.copy(workClosing = it.workClosing - item.id, workHidden = it.workHidden + item.id) else it }
        }
        val source = graph.source
        // P8: its key's day is the tap's (it only dates the item: a Done goes whatever the day), read before the send.
        val day = SendLine.dayKey(SendLine.serverNow(System.currentTimeMillis(), offsetMs()))
        viewModelScope.launch {
            when (val r = graph.api.workDone(item.id, clientId)) {
                is Outcome.Ok -> _events.tryEmit(Event.WorkDone(item))
                is Outcome.Err -> {
                    // P8: no answer at all: the Done waits on the phone (it marks the item, whatever the day it lands).
                    if (r.offline && source == graph.source && graph.sendQueue.enqueue(QueuedWrite.workDone(clientId, source, day, item.title, item.id))) {
                        _events.tryEmit(Event.WorkQueued(item, SendLine.queuedWork(item.title)))
                        return@launch
                    }
                    _ui.update { it.copy(workHidden = it.workHidden - item.id, workClosing = it.workClosing - item.id) }
                    _events.tryEmit(Event.WorkFailed(r.message, item.id) { workDone(item, clientId, holdMs) })
                }
            }
        }
    }

    /** P8: Undo on a Done still waiting: taken off the phone, and its row is back; one on its way waits for its answer. */
    fun cancelWorkDone(item: WorkItem) {
        val waiting = _ui.value.queue.items.firstOrNull { it.kind == SendLine.Kind.WORK_DONE && it.workId == item.id } ?: return
        if (graph.sendQueue.cancel(waiting.clientId)) {
            _ui.update { it.copy(workHidden = it.workHidden - item.id, workClosing = it.workClosing - item.id) }
            _events.tryEmit(Event.Note(SendLine.TAKEN_BACK))
        } else {
            _events.tryEmit(Event.Note(SendLine.SENDING_NOW))
        }
    }

    fun workReopen(item: WorkItem) {
        _ui.update { it.copy(workHidden = it.workHidden - item.id) }
        viewModelScope.launch {
            when (val r = graph.api.workReopen(item.id, UUID.randomUUID().toString())) {
                is Outcome.Ok -> Unit
                is Outcome.Err -> {
                    _ui.update { it.copy(workHidden = it.workHidden + item.id) }
                    _events.tryEmit(Event.WorkFailed(r.message, null) { workReopen(item) })
                }
            }
        }
    }
}

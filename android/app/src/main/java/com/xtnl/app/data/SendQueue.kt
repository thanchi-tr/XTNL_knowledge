package com.xtnl.app.data

import com.xtnl.app.core.SendLine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import java.io.File

/**
 * One write waiting on the phone (blueprint P8, D34; core/SendLine holds the rules): a tick, a quick line or a work
 * item's Done, keyed by its [clientId] (the first try's, so a replay is the same request and the server writes it
 * once). [day] is its own life day, fixed at the tap, never "today": a tick sends it as its `day`. [source] is the server
 * it was made for: it is never sent anywhere else.
 */
@Serializable
data class QueuedWrite(
    val clientId: String,
    val kind: SendLine.Kind,
    val source: String,
    val day: String,
    val atMs: Long,
    /** What the lines call it: the task's title, the line as typed, the work item's title. */
    val label: String,
    // A tick (POST /tasks/complete): its row and what the first try sent.
    val templateId: String? = null,
    val mvv: Boolean = false,
    val minutes: Int? = null,
    val sessionId: String? = null,
    val pages: Int? = null,
    /** The row was on the Yesterday lane (Check keys it apart; its [day] is yesterday's). */
    val yesterday: Boolean = false,
    // A quick line (POST /log).
    val text: String? = null,
    val section: String? = null,
    // A work item's Done (POST /work/done).
    val workId: String? = null,
    /** Server faults so far (a 5xx); set aside at SendLine.SERVER_TRIES. No answer at all is never counted. */
    val tries: Int = 0,
) {
    companion object {
        fun tick(
            clientId: String, source: String, day: String, title: String, templateId: String, mvv: Boolean = false,
            minutes: Int? = null, sessionId: String? = null, pages: Int? = null, yesterday: Boolean = false, atMs: Long = System.currentTimeMillis(),
        ) = QueuedWrite(
            clientId, SendLine.Kind.TICK, source, day, atMs, title,
            templateId = templateId, mvv = mvv, minutes = minutes, sessionId = sessionId, pages = pages, yesterday = yesterday,
        )

        fun log(clientId: String, source: String, day: String, text: String, section: String, atMs: Long = System.currentTimeMillis()) =
            QueuedWrite(clientId, SendLine.Kind.LOG, source, day, atMs, text, text = text, section = section)

        fun workDone(clientId: String, source: String, day: String, title: String, workId: String, atMs: Long = System.currentTimeMillis()) =
            QueuedWrite(clientId, SendLine.Kind.WORK_DONE, source, day, atMs, title, workId = workId)
    }
}

/** An item taken out of the queue unsent, with why ([line]); [keptBack] a line from an earlier day, waiting for the user. */
@Serializable
data class NotSent(val item: QueuedWrite, val line: String, val keptBack: Boolean = false, val atMs: Long = 0L)

/** The queue on disk. */
@Serializable
data class QueueFile(val items: List<QueuedWrite> = emptyList(), val notSent: List<NotSent> = emptyList())

/** What the screens and the widget read: what waits, what was not sent, and whether the server is holding it ([held]). */
data class QueueState(
    val items: List<QueuedWrite> = emptyList(),
    val notSent: List<NotSent> = emptyList(),
    /** Why the last pass stopped with everything kept (the server's token, a wrong address): its line; null while not held. */
    val held: String? = null,
    /** The clientIds on their way now (their Undo waits). */
    val sending: Set<String> = emptySet(),
) {
    /** Only [source]'s: what another server's items wait for is that server. */
    fun of(source: String): QueueState = copy(items = items.filter { it.source == source }, notSent = notSent.filter { it.item.source == source })

    /** A tick waiting for a row (today's lane, or the Yesterday lane's with [yesterday]). */
    fun tickFor(templateId: String, yesterday: Boolean): QueuedWrite? =
        items.firstOrNull { it.kind == SendLine.Kind.TICK && it.templateId == templateId && it.yesterday == yesterday }
}

interface QueueStore {
    fun load(): QueueFile
    fun save(file: QueueFile)
}

/** One file in the app's own storage, written whole (a temporary file, then a rename), as the /check cache is. */
class FileQueueStore(private val file: File) : QueueStore {
    override fun load(): QueueFile = runCatching {
        if (!file.exists()) QueueFile() else Net.json.decodeFromString(QueueFile.serializer(), file.readText())
    }.getOrDefault(QueueFile())

    override fun save(file: QueueFile) {
        runCatching {
            val tmp = File(this.file.parentFile, this.file.name + ".tmp")
            tmp.writeText(Net.json.encodeToString(QueueFile.serializer(), file))
            if (!tmp.renameTo(this.file)) {
                this.file.delete()
                tmp.renameTo(this.file)
            }
        }
    }
}

/** In memory (the tests'). */
class MemoryQueueStore(var file: QueueFile = QueueFile()) : QueueStore {
    override fun load(): QueueFile = file
    override fun save(file: QueueFile) { this.file = file }
}

/** An item that landed, with the server's answer. */
sealed interface Landed {
    val item: QueuedWrite
    data class Tick(override val item: QueuedWrite, val result: CompleteResult) : Landed
    data class Log(override val item: QueuedWrite, val result: LogResult) : Landed
    data class Work(override val item: QueuedWrite, val result: WorkResult) : Landed
}

/**
 * The offline queue (blueprint 5.1b, P8; decision D34). A write that gets no answer at all (Check's tick, Log's line, a
 * work item's Done) and every widget tick waits here, on disk, keyed by its clientId, until a pass sends it: the job
 * (data/SendWorker, online only, with backoff), the app opening or reading /check again, or the widget's tick itself.
 * One pass at a time, oldest first, only the source in use ([source]); demo data never waits (it answers on the phone).
 *
 *   A pass that holds a line reads /check first, for the server's own day (a line saves on the server's today, so one
 *   from an earlier day is kept back, never saved on the wrong day; SendLine.plan). A tick goes with its own `day`. An
 *   answer lands it ([landed]); no answer, or a server fault, leaves it for the next pass; the server's token or a
 *   wrong address holds everything ([QueueState.held]); any other no sets it aside with the server's line ([setAside]).
 *   Undo on an item still waiting takes it off the phone ([cancel]); one on its way waits for its answer.
 */
class SendQueue(
    private val store: QueueStore,
    /** Where the app's data comes from now: the server's origin, or "demo". */
    private val source: () -> String,
    /** The API for the source in use (the server, with that address's own token); null for demo data. */
    private val api: () -> XtnlApi?,
    /** How far the server's clock was from the phone's at the last /check (SendLine.offsetOf), when known. */
    private val offset: suspend () -> Long? = { null },
    private val clock: () -> Long = System::currentTimeMillis,
    /** Arms the job that sends what waits once the phone is online (SendWorker.arm); nothing in the tests. */
    private val arm: () -> Unit = {},
    /** The /check a pass read (the cache keeps it). */
    private val onChecked: suspend (CheckData) -> Unit = {},
) {
    private val lock = Any()
    private val passLock = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(store.load().let { QueueState(it.items, it.notSent) })
    val state: StateFlow<QueueState> = _state.asStateFlow()

    private val _landed = MutableSharedFlow<Landed>(extraBufferCapacity = 64)
    val landed: SharedFlow<Landed> = _landed.asSharedFlow()

    private val _setAside = MutableSharedFlow<NotSent>(extraBufferCapacity = 64)
    val setAside: SharedFlow<NotSent> = _setAside.asSharedFlow()

    /** How a pass ended. */
    enum class Pass {
        /** Nothing of the source in use waited (or demo data is on). */
        IDLE,
        /** Everything it could send landed or was set aside. */
        DONE,
        /** No answer, or a server fault: the job tries again later. */
        RETRY,
        /** The server wants its token (or the address is wrong): nothing moves until that is fixed. */
        HELD,
    }

    /** Demo data never waits: it answers on the phone, and is gone when the app closes. */
    fun accepts(source: String): Boolean = source != DEMO

    /** The server clock's day now, as best known (the waiting items' own keys come from here). */
    suspend fun today(yesterday: Boolean = false): String = SendLine.dayKey(SendLine.serverNow(clock(), offset()), yesterday)

    private fun update(change: (QueueState) -> QueueState): QueueState = synchronized(lock) {
        val before = _state.value
        val next = change(before)
        _state.value = next
        if (next.items != before.items || next.notSent != before.notSent) store.save(QueueFile(next.items, next.notSent))
        next
    }

    /**
     * [item] waits to send (and the job is armed). Once per clientId: the same one again is the one already waiting.
     * False (nothing kept) for demo data and when [SendLine.MAX_WAITING] already wait.
     */
    fun enqueue(item: QueuedWrite): Boolean {
        if (!accepts(item.source)) return false
        var kept = false
        update { s ->
            when {
                s.items.any { it.clientId == item.clientId } -> { kept = true; s }
                s.items.size >= SendLine.MAX_WAITING -> s
                else -> { kept = true; s.copy(items = s.items + item, notSent = s.notSent.filter { it.item.clientId != item.clientId }) }
            }
        }
        if (kept) arm()
        return kept
    }

    /** Undo on a waiting item: taken off the phone, nothing sent. False while it is on its way (or not waiting). */
    fun cancel(clientId: String): Boolean {
        var gone = false
        update { s ->
            if (clientId in s.sending || s.items.none { it.clientId == clientId }) s
            else { gone = true; s.copy(items = s.items.filter { it.clientId != clientId }) }
        }
        return gone
    }

    /** A not-sent note read (or a kept-back line discarded): it goes. */
    fun dismiss(clientId: String) {
        update { s -> s.copy(notSent = s.notSent.filter { it.item.clientId != clientId }) }
    }

    /**
     * A kept-back line the user sends anyway: back in the queue for [day] (today's), with its own clientId and the same
     * body (it has no day). A first try that saved a new row is answered as that row ("Already saved"). One that ticked
     * a row the line named (P6) wrote no row under its key, and the server books a line on its own today, so sent now
     * it ticks today's row as well: SendLine.keptBack says the line may already be saved, and sending is the user's call.
     */
    fun sendForToday(clientId: String, day: String): Boolean {
        var back = false
        update { s ->
            val note = s.notSent.firstOrNull { it.item.clientId == clientId && it.keptBack } ?: return@update s
            back = true
            s.copy(items = s.items + note.item.copy(day = day, tries = 0), notSent = s.notSent - note)
        }
        if (back) arm()
        return back
    }

    /** The screen renders' own queue (ScreensTest): what waits and what was not sent, as a pass would have left them. */
    internal fun restore(file: QueueFile) {
        update { QueueState(file.items, file.notSent) }
    }

    /** A pass now, off the main thread (the app opened, /check answered, a widget tick); the job takes over if it can't land. */
    fun kick() {
        scope.launch { if (pass() == Pass.RETRY) arm() }
    }

    /** One pass over the source in use's items, oldest first (see the class). */
    suspend fun pass(): Pass = passLock.withLock {
        val src = source()
        val api = api()
        if (!accepts(src) || api == null || _state.value.items.none { it.source == src }) return@withLock Pass.IDLE
        // The server's own day when a line waits (POST /log saves on its today); else its clock as last read.
        var serverDay = today()
        // P8 review: /check unanswered (or a fault): the server's day is unknown, so the lines wait for the next pass,
        // and the ticks and Dones behind them (which need no server day) still go. Only the token or a wrong address,
        // which would hold everything anyway, stops the pass.
        var linesWait = false
        if (_state.value.items.any { it.source == src && it.kind == SendLine.Kind.LOG }) {
            when (val r = api.check()) {
                is Outcome.Ok -> {
                    r.value.day?.let { serverDay = it }
                    runCatching { onChecked(r.value) }
                }
                is Outcome.Err -> when (SendLine.after(r, tries = 0)) {
                    SendLine.After.HOLD -> {
                        update { it.copy(held = r.message) }
                        return@withLock Pass.HELD
                    }
                    else -> linesWait = true
                }
            }
        }
        val tried = HashSet<String>()
        while (true) {
            // Settings moved to another source meanwhile: the rest wait for theirs.
            if (source() != src) return@withLock Pass.DONE
            val item = _state.value.items.firstOrNull { it.source == src && it.clientId !in tried } ?: break
            tried += item.clientId
            if (linesWait && item.kind == SendLine.Kind.LOG) continue
            when (val p = SendLine.plan(item.kind, item.day, item.label, serverDay)) {
                is SendLine.Plan.KeepBack -> { putAside(item, p.line, keptBack = true); continue }
                is SendLine.Plan.SetAside -> { putAside(item, p.line); continue }
                SendLine.Plan.Send -> Unit
            }
            update { it.copy(sending = it.sending + item.clientId) }
            val r = try {
                send(api, item)
            } finally {
                update { it.copy(sending = it.sending - item.clientId) }
            }
            when (r) {
                is Outcome.Ok -> {
                    update { s -> s.copy(items = s.items.filter { it.clientId != item.clientId }, held = null) }
                    _landed.tryEmit(r.value)
                }
                is Outcome.Err -> when (SendLine.after(r, item.tries)) {
                    SendLine.After.RETRY -> {
                        if (!r.offline) update { s -> s.copy(items = s.items.map { if (it.clientId == item.clientId) it.copy(tries = it.tries + 1) else it }) }
                        return@withLock Pass.RETRY
                    }
                    SendLine.After.HOLD -> {
                        update { it.copy(held = r.message) }
                        return@withLock Pass.HELD
                    }
                    SendLine.After.SET_ASIDE -> putAside(item, r.message)
                }
            }
        }
        update { it.copy(held = null) }
        if (linesWait) Pass.RETRY else Pass.DONE
    }

    /** The same request the first try made: the same route, the same fields, the same clientId. */
    private suspend fun send(api: XtnlApi, item: QueuedWrite): Outcome<Landed> = when (item.kind) {
        SendLine.Kind.TICK -> api.completeTask(
            item.templateId.orEmpty(), item.mvv, item.clientId, item.minutes, item.sessionId, item.pages, item.yesterday, item.day,
        ).map { Landed.Tick(item, it) }
        SendLine.Kind.LOG -> api.log(item.text.orEmpty(), item.section ?: "task", item.clientId).map { Landed.Log(item, it) }
        SendLine.Kind.WORK_DONE -> api.workDone(item.workId.orEmpty(), item.clientId).map { Landed.Work(item, it) }
    }

    private fun putAside(item: QueuedWrite, line: String, keptBack: Boolean = false) {
        val note = NotSent(item, line, keptBack, clock())
        update { s ->
            s.copy(
                items = s.items.filter { it.clientId != item.clientId },
                notSent = (s.notSent.filter { it.item.clientId != item.clientId } + note).takeLast(SendLine.MAX_NOT_SENT),
            )
        }
        _setAside.tryEmit(note)
    }

    companion object {
        const val DEMO = "demo"
    }
}

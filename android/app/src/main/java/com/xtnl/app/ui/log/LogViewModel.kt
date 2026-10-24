package com.xtnl.app.ui.log

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtnl.app.AppGraph
import com.xtnl.app.core.IdeaBody
import com.xtnl.app.core.IdeaDraft
import com.xtnl.app.core.IdeaFormat
import com.xtnl.app.core.LogPreview
import com.xtnl.app.core.LogSection
import com.xtnl.app.core.SendLine
import com.xtnl.app.data.IdeaResult
import com.xtnl.app.data.IdeasMeta
import com.xtnl.app.data.Landed
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.QueuedWrite
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import java.util.UUID

/**
 * Log: the quick line (POST /log, with Undo) and New idea (GET /ideas/meta,
 * POST /ideas). Everything typed lives here, so a fold, an unfold, a tab
 * switch or a failed send never loses it; a failed send keeps the text and
 * a retry sends the same clientId. P8: a line that gets no answer at all waits
 * on the phone (data/SendQueue), with its own life day, and its entry says
 * "Waiting to send" until it lands (then it reads as any line, with its Undo).
 */
class LogViewModel(private val graph: AppGraph) : ViewModel() {

    data class Entry(
        val key: String,
        val text: String,
        val section: LogSection,
        val line: String,
        val kind: String,
        /** The server's id for it (an idea draft's is the draftId POST /ideas finishes). */
        val serverId: String?,
        val undo: JsonObject?,
        val atMs: Long,
        val undone: Boolean = false,
        /** One clientId for this entry's Undo, so a retried Undo (its answer lost) gets the first result back. */
        val undoClientId: String = UUID.randomUUID().toString(),
        /** P8: it waits on the phone to send (no answer when it was sent). */
        val waiting: Boolean = false,
    )

    /** An idea filed this session, keyed by its request (two filings can answer with equal results). */
    data class Filed(val key: String, val result: IdeaResult)

    data class Ui(
        val text: String = "",
        val section: LogSection = LogSection.TASK,
        val sending: Boolean = false,
        val sendError: String? = null,
        val recent: List<Entry> = emptyList(),
        val format: IdeaFormat = IdeaFormat.SHORT,
        val draft: IdeaDraft = IdeaDraft(),
        val meta: IdeasMeta? = null,
        val metaLoading: Boolean = false,
        val creating: Boolean = false,
        val createStartedMs: Long = 0L,
        val createError: String? = null,
        val created: List<Filed> = emptyList(),
        /**
         * The answer to the last Create, while its moment plays (the seal, a fold into a twin): set in the same update
         * that ends [creating] and clears the draft, so the old content never shows again. [sealDone] ends it.
         */
        val sealing: IdeaResult? = null,
        /** Ticks when a Create fails (the overlay plays the idea going back to the form). */
        val failKey: Int = 0,
        /** P8: the quick lines waiting on the phone to send (this source's). */
        val waiting: Int = 0,
    )

    sealed interface Event {
        data class Added(val entry: Entry) : Event
        data class SendFailed(val message: String) : Event
        /** P8: the line got no answer and waits on the phone. */
        data class Queued(val entry: Entry, val message: String) : Event
        data class Undone(val entry: Entry) : Event
        data class UndoFailed(val message: String) : Event
        data class IdeaCreated(val result: IdeaResult, val format: IdeaFormat) : Event
        data class IdeaFailed(val message: String) : Event
    }

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()
    private val _events = MutableSharedFlow<Event>(extraBufferCapacity = 16)
    val events: SharedFlow<Event> = _events.asSharedFlow()

    /** The last failed send: the same line and section again reuse its clientId (the server answers once). */
    private var failedSend: Triple<String, LogSection, String>? = null
    private var failedCreate: Pair<JsonObject, String>? = null

    init {
        // P8: the lines waiting on the phone (this source's), and what lands or is set aside.
        viewModelScope.launch {
            graph.sendQueue.state.collect { q ->
                val n = q.of(graph.source).items.count { it.kind == SendLine.Kind.LOG }
                _ui.update { it.copy(waiting = n) }
            }
        }
        viewModelScope.launch {
            graph.sendQueue.landed.collect { l ->
                if (l !is Landed.Log || l.item.source != graph.source) return@collect
                val r = l.result
                val section = LogSection.of(l.item.section)
                val e = Entry(l.item.clientId, l.item.text.orEmpty(), section, r.line ?: "Added", r.kind, r.id, r.undo, System.currentTimeMillis())
                _ui.update { u -> u.copy(recent = listOf(e) + u.recent.filter { it.key != e.key }.take(29)) }
                _events.tryEmit(Event.Added(e))
            }
        }
        viewModelScope.launch {
            graph.sendQueue.setAside.collect { n ->
                if (n.item.kind != SendLine.Kind.LOG || n.item.source != graph.source) return@collect
                val line = SendLine.NOT_SENT_TITLE + ": " + n.line
                _ui.update { u -> u.copy(recent = u.recent.map { if (it.key == n.item.clientId) it.copy(line = line, waiting = false) else it }) }
            }
        }
    }

    /** The capture line's limit, the start the server adds included (it refuses longer). */
    fun setText(t: String) = _ui.update { it.copy(text = t.take(LogPreview.maxLine(t, it.section)), sendError = null) }
    fun setSection(s: LogSection) = _ui.update { it.copy(section = s, sendError = null) }

    fun send() {
        val u = _ui.value
        val text = u.text.trim()
        if (text.isEmpty() || u.sending) return
        // Typed in another section, then switched: say so here rather than send what the server will refuse.
        if (text.length > LogPreview.maxLine(text, u.section)) {
            _ui.update { it.copy(sendError = "Keep an idea line to ${LogPreview.maxLine(text, u.section)} characters: the server starts it with \"idea: \".") }
            return
        }
        val clientId = failedSend?.takeIf { it.first == text && it.second == u.section }?.third ?: UUID.randomUUID().toString()
        _ui.update { it.copy(sending = true, sendError = null) }
        viewModelScope.launch {
            // P8: the line's own life day and server, fixed at the tap, before the send: a send that times out across
            // 04:00 keeps the day it was typed on, so the queue keeps it back rather than saving it on the new day.
            val source = graph.source
            val day = graph.sendQueue.today()
            when (val r = graph.api.log(text, u.section.wire, clientId)) {
                is Outcome.Ok -> {
                    failedSend = null
                    val e = Entry(clientId, text, u.section, r.value.line ?: "Added", r.value.kind, r.value.id, r.value.undo, System.currentTimeMillis())
                    // Only clear the field if it still holds what was sent (typing on while it sent is kept).
                    _ui.update { it.copy(sending = false, text = if (it.text.trim() == text) "" else it.text, recent = listOf(e) + it.recent.take(29)) }
                    _events.tryEmit(Event.Added(e))
                    if (r.value.kind == "task" || r.value.kind == "goal") graph.changes.tryEmit("log")
                }
                is Outcome.Err -> {
                    // P8: no answer at all: the line waits on the phone with its own life day (the field is free again),
                    // and is sent once the phone is back online. A line the server said no to keeps the field, as before.
                    if (r.offline && source == graph.source && graph.sendQueue.enqueue(QueuedWrite.log(clientId, source, day, text, u.section.wire))) {
                        failedSend = null
                        val e = Entry(clientId, text, u.section, SendLine.WAITING, "waiting", null, null, System.currentTimeMillis(), waiting = true)
                        _ui.update { it.copy(sending = false, text = if (it.text.trim() == text) "" else it.text, recent = listOf(e) + it.recent.filter { x -> x.key != clientId }.take(29)) }
                        _events.tryEmit(Event.Queued(e, SendLine.QUEUED_LOG))
                        return@launch
                    }
                    failedSend = Triple(text, u.section, clientId)
                    _ui.update { it.copy(sending = false, sendError = r.message) }
                    _events.tryEmit(Event.SendFailed(r.message))
                }
            }
        }
    }

    fun undo(key: String) {
        val e = _ui.value.recent.firstOrNull { it.key == key } ?: return
        val undo = e.undo ?: return
        if (e.undone) return
        _ui.update { u -> u.copy(recent = u.recent.map { if (it.key == key) it.copy(undone = true) else it }) }
        viewModelScope.launch {
            when (val r = graph.api.logUndo(undo, e.undoClientId)) {
                is Outcome.Ok -> {
                    _events.tryEmit(Event.Undone(e))
                    if (e.kind == "task" || e.kind == "goal") graph.changes.tryEmit("log-undo")
                }
                is Outcome.Err -> {
                    _ui.update { u -> u.copy(recent = u.recent.map { if (it.key == key) it.copy(undone = false) else it }) }
                    _events.tryEmit(Event.UndoFailed(r.message))
                }
            }
        }
    }

    /**
     * An idea line saved as a draft, opened in the full form: `Q :: A` fills the
     * Short question and answer, and Create finishes that draft (draftId), so it
     * leaves the Inbox.
     */
    fun draftToForm(entry: Entry) {
        _ui.update { it.copy(format = IdeaFormat.SHORT, draft = IdeaDraft.fromLine(entry.text, entry.serverId, it.draft)) }
    }

    companion object {
        /** [created] with [res] first (at most 20), under a key no other row has, so the list's keys never repeat. */
        fun filed(created: List<Filed>, res: IdeaResult, key: String): List<Filed> {
            val taken = created.map { it.key }.toSet()
            val unique = if (key !in taken) key else generateSequence(2) { it + 1 }.map { "$key#$it" }.first { it !in taken }
            return listOf(Filed(unique, res)) + created.take(19)
        }
    }

    // ── New idea ────────────────────────────────────────────────────────────

    fun loadMeta(force: Boolean = false) {
        val u = _ui.value
        if ((u.meta != null && !force) || u.metaLoading) return
        _ui.update { it.copy(metaLoading = true) }
        viewModelScope.launch {
            val r = graph.api.ideasMeta()
            _ui.update { it.copy(metaLoading = false, meta = (r as? Outcome.Ok)?.value ?: it.meta) }
        }
    }

    /** The filing overlay finished playing the last answer (its fade ended). */
    fun sealDone() = _ui.update { it.copy(sealing = null) }

    fun setFormat(f: IdeaFormat) = _ui.update { it.copy(format = f, createError = null) }

    fun edit(change: (IdeaDraft) -> IdeaDraft) = _ui.update { it.copy(draft = change(it.draft), createError = null) }

    /** The wire type for [f]: the meta's own name for it when the server lists one (MCQ vs MULTI). */
    fun wireType(f: IdeaFormat): String =
        _ui.value.meta?.formats?.firstOrNull { IdeaFormat.of(it.type) == f }?.type ?: f.wire

    fun create() {
        val u = _ui.value
        if (u.creating) return
        IdeaBody.problem(u.format, u.draft)?.let { p ->
            _ui.update { it.copy(createError = p) }
            _events.tryEmit(Event.IdeaFailed(p))
            return
        }
        val fresh = IdeaBody.build(u.format, u.draft, "", wireType(u.format))
        val clientId = failedCreate?.takeIf { it.first == fresh }?.second ?: UUID.randomUUID().toString()
        val body = IdeaBody.build(u.format, u.draft, clientId, wireType(u.format))
        _ui.update { it.copy(creating = true, createStartedMs = System.currentTimeMillis(), createError = null, sealing = null) }
        viewModelScope.launch {
            when (val r = graph.api.createIdea(body)) {
                is Outcome.Ok -> {
                    failedCreate = null
                    val res = r.value
                    _ui.update {
                        it.copy(
                            creating = false,
                            // Capture keeps going: the content clears; the format and collection carry over.
                            draft = if (res.status == "duplicate") it.draft else it.draft.cleared(u.format),
                            created = filed(it.created, res, clientId),
                            sealing = res,
                        )
                    }
                    _events.tryEmit(Event.IdeaCreated(res, u.format))
                    graph.changes.tryEmit("idea")
                }
                is Outcome.Err -> {
                    failedCreate = fresh to clientId
                    _ui.update { it.copy(creating = false, createError = r.message, failKey = it.failKey + 1) }
                    _events.tryEmit(Event.IdeaFailed(r.message))
                }
            }
        }
    }
}

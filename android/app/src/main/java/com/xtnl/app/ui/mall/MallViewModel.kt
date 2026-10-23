package com.xtnl.app.ui.mall

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtnl.app.AppGraph
import com.xtnl.app.core.MallLine
import com.xtnl.app.data.MallData
import com.xtnl.app.data.Outcome
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * The Mall screen's reads and its writes (docs/mobile-api.md `GET /mall`, `POST /mall/rewards`, `POST /mall/buy`,
 * `POST /mall/undo`; blueprint P18, P19): the catalog is read when the screen opens and on a pull; an add sends the
 * form's fields once its own checks pass (MallLine.addRefusal; the server checks every rule again and says why it
 * refuses), keeps its clientId while the same fields are retried (the server lists a reward once), shows the new row at
 * once and reads the Mall again. A read that left before Settings switched the source (another server, demo data) is
 * dropped, and the screen starts over.
 *
 * P19: Buy arms a reward ([arm]); a second press confirms ([buy]). A purchase keeps its clientId while that same attempt
 * is retried (a lost reply, retried, is the same purchase and is bought once), and only until a read of the Mall lists
 * it (MallLine.keptBuyLanded): after that a new Buy is a new purchase, never a replay of the lost one. A refusal comes
 * back in the server's words and reads the Mall again, so the header and every Buy follow what the server said. A
 * purchase that landed steps [Ui.burnSeq] (the screen burns the wallet's figure, with its haptics) and reads the Mall
 * again; Check refreshes its wallet chip. An undo ([undo]) sends the purchase's id inside its ten minutes, on the same rule.
 */
class MallViewModel(private val graph: AppGraph) : ViewModel() {

    data class Ui(
        val data: MallData? = null,
        /** Nothing to show yet. */
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        /** The last read failed: its line (shown over the last good read, if any). */
        val error: String? = null,
        /** An add on its way. */
        val adding: Boolean = false,
        /** Why the last add didn't go: the form's own check, or the server's line. */
        val addError: String? = null,
        /** The last add that landed, in words ("Takeaway night listed at 120 cr."). */
        val added: String? = null,
        /** Steps on each add that landed: the form clears its fields once per step. */
        val addedSeq: Int = 0,
        /** P19: the reward whose Buy is armed (the next press confirms it); null: none. */
        val armedId: String? = null,
        /** A purchase on its way: its reward's id. */
        val buyingId: String? = null,
        /** Why the last purchase didn't go, by the reward's id (the server's line). */
        val buyError: Pair<String, String>? = null,
        /** The last purchase or undo that landed, in the server's words ("Takeaway night bought for 120 cr · 30 cr left."). */
        val bought: String? = null,
        /** Steps on each new purchase that landed (never on a repeat): the wallet's figure burns once per step. */
        val burnSeq: Int = 0,
        /** An undo on its way: the purchase's id. */
        val undoingId: String? = null,
        /** Why the last undo didn't go, by the purchase's id. */
        val undoError: Pair<String, String>? = null,
    )

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()
    private var job: Job? = null
    private var addJob: Job? = null
    private var buyJob: Job? = null
    private var undoJob: Job? = null
    /** A purchase's clientId kept for a retry of the same attempt, and the reward's purchases listed when it began. */
    private data class KeptBuy(val clientId: String, val knownIds: Set<String>)
    /** Each purchase's clientId, kept while its attempt is unanswered, by reward (a retry after a lost reply is the same purchase). */
    private val buyIds = mutableMapOf<String, KeptBuy>()
    private val undoIds = mutableMapOf<String, String>()
    /** The add being retried keeps its clientId (the same fields send the same id, so a lost reply never lists it twice). */
    private var pending: Pair<String, String>? = null

    init {
        viewModelScope.launch {
            graph.settings.state.map { if (it.demo) "demo" else it.server }.distinctUntilChanged().drop(1).collect {
                job?.cancel()
                addJob?.cancel()
                buyJob?.cancel()
                undoJob?.cancel()
                pending = null
                buyIds.clear()
                undoIds.clear()
                _ui.value = Ui()
                refresh(quiet = true)
            }
        }
    }

    /** Read again (quiet = no spinner: the screen opening). One read at a time. */
    fun refresh(quiet: Boolean = false) {
        if (job?.isActive == true) return
        job = viewModelScope.launch {
            if (!quiet) _ui.update { it.copy(refreshing = true) }
            val source = graph.source
            val r = graph.api.mall()
            if (source != graph.source) return@launch
            _ui.update {
                when (r) {
                    is Outcome.Ok -> it.copy(data = r.value, loading = false, refreshing = false, error = null)
                    is Outcome.Err -> it.copy(loading = false, refreshing = false, error = r.message)
                }
            }
            // A lost attempt this read shows landed is done: its id never answers a later, new Buy (or Undo).
            if (r is Outcome.Ok) forgetSettled(r.value)
        }
    }

    /** Drops the kept ids whose lost attempts a read shows settled (MallLine.keptBuyLanded, keptUndoSettled). */
    private fun forgetSettled(data: MallData) {
        if (buyJob?.isActive != true) buyIds.entries.removeAll { (rewardId, kept) -> MallLine.keptBuyLanded(rewardId, kept.knownIds, data) }
        if (undoJob?.isActive != true) undoIds.keys.removeAll { MallLine.keptUndoSettled(it, data) }
    }

    /** Lists a reward from the form's fields as typed. Nothing is sent while the form's own checks say no. */
    fun add(title: String, category: String, priceText: String, noteText: String, cooldownText: String) {
        val data = _ui.value.data ?: return
        if (addJob?.isActive == true) return
        MallLine.addRefusal(title, priceText, cooldownText, noteText, data)?.let { line ->
            _ui.update { it.copy(addError = line, added = null) }
            return
        }
        val price = MallLine.priceOf(priceText, data.limits) ?: return
        val cooldown = cooldownText.takeIf { it.isNotBlank() }?.let { MallLine.wholeOf(it) }
        val note = noteText.trim().ifEmpty { null }
        val t = title.trim()
        val key = listOf(t, category, price, note, cooldown).joinToString("\u0000")
        val clientId = pending?.takeIf { it.first == key }?.second ?: UUID.randomUUID().toString()
        pending = key to clientId
        _ui.update { it.copy(adding = true, addError = null, added = null) }
        addJob = viewModelScope.launch {
            val source = graph.source
            val r = graph.api.addReward(t, category, price, note, cooldown, clientId)
            if (source != graph.source) return@launch
            when (r) {
                is Outcome.Ok -> {
                    pending = null
                    _ui.update { u ->
                        // The new row at once, after its category's others (the server's order); the read below confirms it.
                        val row = r.value.reward
                        val shown = u.data?.let { d -> if (row == null || d.rewards.any { it.id == row.id }) d else d.copy(rewards = d.rewards + row) }
                        u.copy(data = shown, adding = false, added = MallLine.addedLine(t, price), addedSeq = u.addedSeq + 1)
                    }
                    refresh(quiet = true)
                }
                is Outcome.Err -> _ui.update { it.copy(adding = false, addError = r.message) }
            }
        }
    }

    /** Arms a reward's Buy (the next press confirms it), or disarms with null. */
    fun arm(rewardId: String?) {
        _ui.update { it.copy(armedId = rewardId, buyError = null) }
    }

    /** Buys an armed reward: the server burns exactly its price, never more than the balance, or says why not. */
    fun buy(rewardId: String) {
        if (buyJob?.isActive == true) return
        val clientId = buyIds.getOrPut(rewardId) { KeptBuy(UUID.randomUUID().toString(), MallLine.purchaseIdsOf(rewardId, _ui.value.data)) }.clientId
        _ui.update { it.copy(buyingId = rewardId, armedId = null, buyError = null, bought = null) }
        buyJob = viewModelScope.launch {
            val source = graph.source
            val r = graph.api.buyReward(rewardId, clientId)
            if (source != graph.source) return@launch
            when (r) {
                is Outcome.Ok -> {
                    buyIds.remove(rewardId)
                    val v = r.value
                    _ui.update { u ->
                        // The balance the purchase left, at once; the read below brings the rest (the purchase, each Buy state).
                        val shown = u.data?.let { d -> v.credits?.let { c -> d.copy(credits = d.credits?.copy(balance = c.balance) ?: d.credits) } ?: d }
                        u.copy(data = shown, buyingId = null, bought = v.line, burnSeq = if (v.duplicate) u.burnSeq else u.burnSeq + 1)
                    }
                    graph.changes.tryEmit("mall")
                    refresh(quiet = true)
                }
                is Outcome.Err -> {
                    // The server answered no: a new press is a new purchase, and the Mall is read again so the header and
                    // each Buy match its words. No answer at all: the same id goes again, until a read shows it landed.
                    val answered = !r.offline && r.code != "server"
                    if (answered) buyIds.remove(rewardId)
                    _ui.update { it.copy(buyingId = null, buyError = rewardId to r.message) }
                    refresh(quiet = true)
                }
            }
        }
    }

    /** Undoes a purchase inside its ten minutes: its credits come back, once. */
    fun undo(purchaseId: String) {
        if (undoJob?.isActive == true) return
        val clientId = undoIds.getOrPut(purchaseId) { UUID.randomUUID().toString() }
        _ui.update { it.copy(undoingId = purchaseId, undoError = null, bought = null) }
        undoJob = viewModelScope.launch {
            val source = graph.source
            val r = graph.api.undoBuy(purchaseId, clientId)
            if (source != graph.source) return@launch
            when (r) {
                is Outcome.Ok -> {
                    undoIds.remove(purchaseId)
                    _ui.update { u ->
                        val shown = u.data?.let { d -> r.value.credits?.let { c -> d.copy(credits = d.credits?.copy(balance = c.balance) ?: d.credits) } ?: d }
                        u.copy(data = shown, undoingId = null, bought = r.value.line)
                    }
                    graph.changes.tryEmit("mall")
                    refresh(quiet = true)
                }
                is Outcome.Err -> {
                    if (!r.offline && r.code != "server") undoIds.remove(purchaseId)
                    _ui.update { it.copy(undoingId = null, undoError = purchaseId to r.message) }
                    refresh(quiet = true)
                }
            }
        }
    }
}

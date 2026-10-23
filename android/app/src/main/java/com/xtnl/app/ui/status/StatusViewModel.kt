package com.xtnl.app.ui.status

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtnl.app.AppGraph
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.StatusPanel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The Status screen's read: GET /status (blueprint P1), read only. It is read when the screen opens and on a pull, so a
 * tick made on Check shows here the next time it is opened. A failed read keeps what is shown and says why; a read that
 * left before Settings switched the source (another server, demo data) is dropped, and the screen starts over.
 */
class StatusViewModel(private val graph: AppGraph) : ViewModel() {

    data class Ui(
        val data: StatusPanel? = null,
        /** Nothing to show yet. */
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        /** The last read failed: its line (shown over the last good read, if any). */
        val error: String? = null,
    )

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()
    private var job: Job? = null

    init {
        viewModelScope.launch {
            graph.settings.state.map { if (it.demo) "demo" else it.server }.distinctUntilChanged().drop(1).collect {
                job?.cancel()
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
            val r = graph.api.status()
            if (source != graph.source) return@launch
            _ui.update {
                when (r) {
                    is Outcome.Ok -> it.copy(data = r.value, loading = false, refreshing = false, error = null)
                    is Outcome.Err -> it.copy(loading = false, refreshing = false, error = r.message)
                }
            }
        }
    }
}

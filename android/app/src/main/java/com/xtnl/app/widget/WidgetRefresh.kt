package com.xtnl.app.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

/**
 * Draws the widget again (blueprint P8) when what it shows moves: a new /check in the cache, the queue's items, a new
 * source. Several pokes inside [QUIET_MS] draw once. With no widget placed it costs a lookup, and a test with no
 * widget host draws nothing.
 */
class WidgetRefresh(private val app: Context, scope: CoroutineScope) {
    private val pokes = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    init {
        @OptIn(FlowPreview::class)
        scope.launch {
            pokes.debounce(QUIET_MS).collect { runCatching { TodayWidget().updateAll(app) } }
        }
    }

    fun poke() {
        pokes.tryEmit(Unit)
    }

    private companion object {
        const val QUIET_MS = 400L
    }
}

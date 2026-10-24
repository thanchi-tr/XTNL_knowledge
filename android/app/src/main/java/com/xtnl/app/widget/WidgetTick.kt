package com.xtnl.app.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.action.ActionCallback
import com.xtnl.app.XtnlApp
import com.xtnl.app.core.TimeLabels
import com.xtnl.app.core.WidgetRows
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.QueuedWrite
import java.util.UUID

/**
 * A widget row's tick (blueprint P8; ingest-budget-check: one tap). It waits on the phone first (data/SendQueue: its
 * own clientId and its own life day: the day of the board the widget showed it on, [DAY], as Check's tick and the web
 * board's are; the server's clock as last read only for a board with none), so the row shows "waiting to send" at
 * once, then a pass sends it straight away; offline, the queue's job sends it once the phone is back online, and it
 * still books on the day it was ticked (or is set aside unsent when that day is too old to record). No dialog, nothing
 * opened. Demo data answers on the phone: its tick goes to the demo at once and the widget reads the demo's board again.
 */
class WidgetTick : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val graph = (context.applicationContext as? XtnlApp)?.graph ?: return
        val templateId = parameters[TEMPLATE] ?: return
        val title = parameters[TITLE] ?: ""
        val source = graph.source
        val queue = graph.sendQueue
        val day = parameters[DAY]?.takeIf { TimeLabels.parseDay(it) != null } ?: queue.today()
        if (!queue.accepts(source)) {
            val r = graph.api.completeTask(templateId, mvv = false, clientId = UUID.randomUUID().toString(), day = day)
            if (r is Outcome.Ok) (graph.api.check() as? Outcome.Ok)?.let { graph.cache.write(source, it.value) }
            TodayWidget().update(context, glanceId)
            return
        }
        // Once per row: a second tap while its tick waits does nothing more.
        if (queue.state.value.of(source).tickFor(templateId, yesterday = false) != null) return
        // enqueue arms the job too, so a pass that can't land now is sent later, with backoff. The pass runs off this
        // callback (it may wait on the network); the widget follows the queue as it lands.
        queue.enqueue(QueuedWrite.tick(UUID.randomUUID().toString(), source, day, title, templateId))
        TodayWidget().update(context, glanceId)
        queue.kick()
    }

    companion object {
        val TEMPLATE = ActionParameters.Key<String>("templateId")
        val TITLE = ActionParameters.Key<String>("title")
        /** The board's life day the row was shown on (WidgetRows.Row.day): the tick's day (P8 review). */
        val DAY = ActionParameters.Key<String>("day")

        /** A row's tick parameters: its template, its title and, when the board names one, its day. */
        fun parametersOf(r: WidgetRows.Row): ActionParameters =
            r.day?.let { actionParametersOf(TEMPLATE to r.templateId, TITLE to r.title, DAY to it) } ?: actionParametersOf(TEMPLATE to r.templateId, TITLE to r.title)
    }
}

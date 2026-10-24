package com.xtnl.app.widget

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.xtnl.app.MainActivity
import com.xtnl.app.R
import com.xtnl.app.XtnlApp
import com.xtnl.app.core.SendLine
import com.xtnl.app.core.WidgetRows
import com.xtnl.app.data.CheckCache
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.QueueState
import com.xtnl.app.ui.theme.Night
import com.xtnl.app.ui.theme.Vellum

/**
 * The cover-screen widget (blueprint 5.1b, P8; decision D34): today's open musts and habits, each with a tick that is
 * one tap (widget/WidgetTick: it waits on the phone and sends at once when it can, so it works offline too). The rows
 * are the last /check's (the stored server's, with its token; demo data's when that is on), read again when the
 * widget is drawn and the board is older than [STALE_MS] or from another day; the queue's waiting ticks show over them
 * (core/WidgetRows). Sized for the Fold's cover screen (4 × 2 cells there) and it fits the main display's grid too: the
 * rows that fit its height, the rest counted ("+2 more"). The title and a row's name open Check.
 */
class TodayWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Responsive(
        setOf(DpSize(180.dp, 110.dp), DpSize(180.dp, 200.dp), DpSize(300.dp, 110.dp), DpSize(300.dp, 200.dp), DpSize(300.dp, 290.dp), DpSize(300.dp, 360.dp)),
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val graph = (context.applicationContext as XtnlApp).graph
        val source = graph.source
        var entry = graph.cache.read(source)
        var offline = false
        val now = System.currentTimeMillis()
        val today = SendLine.dayKey(SendLine.serverNow(now, entry?.let { SendLine.offsetOf(it.data.now, it.fetchedAtMs) }))
        if (entry == null || now - entry.fetchedAtMs > STALE_MS || entry.data.day != today) {
            when (val r = graph.api.check()) {
                is Outcome.Ok -> {
                    // The widget's own read: written without asking the widget to draw itself again.
                    graph.cache.write(source, r.value, notify = false)
                    entry = CheckCache.Entry(source, System.currentTimeMillis(), r.value)
                }
                is Outcome.Err -> offline = r.offline
            }
        }
        val first = entry
        provideContent {
            // While the widget's session lives, it follows the cache and the queue as they change.
            val latest by graph.cache.latest.collectAsState()
            val queue by graph.sendQueue.state.collectAsState()
            val shown = latest?.takeIf { it.source == source } ?: first
            val q: QueueState = queue.of(source)
            val view = WidgetRows.of(
                shown?.data, q, SendLine.serverNow(System.currentTimeMillis(), shown?.let { SendLine.offsetOf(it.data.now, it.fetchedAtMs) }),
                demo = source == com.xtnl.app.data.SendQueue.DEMO, offline = offline,
            )
            WidgetBody(context, view)
        }
    }

    companion object {
        /** A board older than this is read again when the widget is drawn. */
        const val STALE_MS = 15 * 60_000L
    }
}

/** The receiver Android talks to (its size, its updates, the launcher's add). */
class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

/** The app's own colours (ui/theme: Night after dark, Vellum by day), as the system's dark mode picks. */
private object W {
    val card = ColorProvider(day = Vellum.card, night = Night.card)
    val ink0 = ColorProvider(day = Vellum.ink0, night = Night.ink0)
    val ink2 = ColorProvider(day = Vellum.ink2, night = Night.ink2)
    val line = ColorProvider(day = Vellum.lineCtl, night = Night.lineCtl)
    val kept = ColorProvider(day = Vellum.kept, night = Night.kept)
    val must = ColorProvider(day = Vellum.must, night = Night.must)
    val habit = ColorProvider(day = Vellum.habit, night = Night.habit)
}

private fun openApp(context: Context, path: String) = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("xtnl://app$path")).setComponent(ComponentName(context, MainActivity::class.java)),
)

/** The widget's content for [view] at the size Glance lays it out (the screen renders draw it too). */
@Composable
internal fun WidgetBody(context: Context, view: WidgetRows.View) {
    val size = LocalSize.current
    val (shown, more) = WidgetRows.fit(view.rows, size.height.value)
    val check = openApp(context, "/check")
    Column(
        GlanceModifier.fillMaxSize().appWidgetBackground().background(W.card).cornerRadius(20.dp).padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        Row(GlanceModifier.fillMaxWidth().height(40.dp).padding(horizontal = 6.dp).clickable(check), verticalAlignment = Alignment.CenterVertically) {
            Column(GlanceModifier.defaultWeight()) {
                Text(view.title, style = TextStyle(color = W.ink0, fontSize = 15.sp, fontWeight = FontWeight.Medium), maxLines = 1)
                val sub = listOfNotNull(view.status.ifEmpty { null }, view.note).joinToString(" · ")
                if (sub.isNotEmpty()) Text(sub, style = TextStyle(color = W.ink2, fontSize = 12.sp), maxLines = 1)
            }
        }
        if (view.empty != null && shown.isEmpty()) {
            Box(GlanceModifier.fillMaxWidth().defaultWeight().padding(horizontal = 6.dp).clickable(check), contentAlignment = Alignment.CenterStart) {
                Text(view.empty, style = TextStyle(color = W.ink2, fontSize = 13.sp), maxLines = 2)
            }
            return@Column
        }
        for (r in shown) RowItem(context, r, check)
        if (more > 0) {
            Box(GlanceModifier.fillMaxWidth().height(WidgetRows.MORE_DP.dp).padding(horizontal = 6.dp).clickable(check), contentAlignment = Alignment.CenterStart) {
                Text("+$more more", style = TextStyle(color = W.ink2, fontSize = 12.sp), maxLines = 1)
            }
        }
    }
}

@Composable
private fun RowItem(context: Context, r: WidgetRows.Row, check: androidx.glance.action.Action) {
    val tick = when (r.tap) {
        WidgetRows.Tap.TICK -> actionRunCallback<WidgetTick>(WidgetTick.parametersOf(r))
        WidgetRows.Tap.OPEN_APP -> check
        WidgetRows.Tap.NONE -> null
    }
    Row(GlanceModifier.fillMaxWidth().height(WidgetRows.ROW_DP.dp), verticalAlignment = Alignment.CenterVertically) {
        // The tick: a 48 dp target, in one tap.
        val circle = GlanceModifier.size(WidgetRows.ROW_DP.dp).semantics { contentDescription = WidgetRows.tickLabel(r) }
        Box(if (tick != null) circle.clickable(tick) else circle, contentAlignment = Alignment.Center) {
            Image(
                ImageProvider(if (r.waiting) R.drawable.ic_widget_waiting else R.drawable.ic_widget_open),
                contentDescription = null,
                modifier = GlanceModifier.size(26.dp),
                colorFilter = ColorFilter.tint(if (r.waiting) W.kept else W.line),
            )
        }
        Column(GlanceModifier.defaultWeight().padding(end = 6.dp).clickable(check)) {
            Text(r.title, style = TextStyle(color = W.ink0, fontSize = 14.sp, fontWeight = FontWeight.Medium), maxLines = 1)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(GlanceModifier.size(6.dp).cornerRadius(3.dp).background(if (r.lane == "MUST") W.must else W.habit)) {}
                Spacer(GlanceModifier.width(6.dp))
                Text(r.meta, style = TextStyle(color = W.ink2, fontSize = 12.sp), maxLines = 1)
            }
        }
    }
}

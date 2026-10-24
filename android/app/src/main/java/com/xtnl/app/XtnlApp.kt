package com.xtnl.app

import android.app.Application
import com.xtnl.app.core.SendLine
import com.xtnl.app.data.AppSettings
import com.xtnl.app.data.CheckCache
import com.xtnl.app.data.DemoApi
import com.xtnl.app.data.FileQueueStore
import com.xtnl.app.data.HttpApi
import com.xtnl.app.data.SendQueue
import com.xtnl.app.data.SendWorker
import com.xtnl.app.data.XtnlApi
import com.xtnl.app.feel.Feel
import com.xtnl.app.health.HealthSync
import com.xtnl.app.notify.AuditReminder
import com.xtnl.app.widget.WidgetRefresh
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.io.File

/**
 * The app's few long-lived things. [api] follows Settings › Data on every
 * call: the server ([HttpApi]) by default, or [DemoApi] when demo data is on.
 */
class XtnlApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        // The Sunday reminder: armed again on every start (one alarm, replaced), or cancelled when it is off.
        graph.auditReminder.sync()
        // Health Connect (P27): its job kept armed while the sync is on. Off (the default), nothing is touched.
        if (graph.settings.state.value.healthSync) graph.healthSync.schedule()
        // P8: what waited on the phone when the app last closed goes now (the job takes over if it can't land).
        if (graph.sendQueue.state.value.items.isNotEmpty()) graph.sendQueue.kick()
    }
}

class AppGraph(app: Application) {
    /** The app's own background work: the offline queue's follow-ups and the widget's refresh (P8). */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val settings = AppSettings(app)
    /** The widget (P8), drawn again when the cache or the queue moves. */
    val widgets = WidgetRefresh(app, scope)
    val cache = CheckCache(app) { widgets.poke() }
    val feel = Feel(app) { settings.state.value }
    /** The week audit's Sunday 19:00 (Sydney) reminder (D37): a local alarm and notification, no server push. */
    val auditReminder = AuditReminder(app, settings)

    private val http = HttpApi(server = { settings.state.value.server }, token = { settings.token() })
    private val demo by lazy { DemoApi() }

    val api: XtnlApi get() = if (settings.state.value.demo) demo else http

    /** Health Connect's walks, hikes and weigh-ins (blueprint P27): off until the user turns it on in Settings. */
    val healthSync = HealthSync(app, settings) { api }

    /** Where data comes from, for keying the cache: the server's origin, or "demo". */
    val source: String get() = settings.state.value.let { if (it.demo) SendQueue.DEMO else it.server }

    /** A deed elsewhere changed what Check shows (a logged task, a review answer): Check refreshes quietly. */
    val changes = MutableSharedFlow<String>(extraBufferCapacity = 8)

    /**
     * The offline queue (blueprint P8, D34): a tick, a quick line or a Done that got no answer, and every widget tick,
     * waiting on disk for the server in use (its own address and token), sent by a pass when it can. Demo data never waits.
     */
    val sendQueue = SendQueue(
        store = FileQueueStore(File(app.filesDir, "send-queue.json")),
        source = { source },
        api = { if (settings.state.value.demo) null else http },
        offset = { cache.read(source)?.let { SendLine.offsetOf(it.data.now, it.fetchedAtMs) } },
        arm = { SendWorker.arm(app) },
        onChecked = { d -> cache.write(source, d) },
    )

    init {
        // What landed is followed in the cache (the widget and an offline Check show it done), and Check reads again.
        scope.launch {
            sendQueue.landed.collect { l ->
                cache.follow(l)
                changes.tryEmit("queue")
            }
        }
        // The widget follows what waits and what was not sent.
        scope.launch { sendQueue.state.map { it.items to it.notSent }.distinctUntilChanged().drop(1).collect { widgets.poke() } }
        // A new address, token or source: the widget reads it, and what waits for it tries again.
        scope.launch {
            settings.state.map { Triple(it.server, it.hasToken, it.demo) }.distinctUntilChanged().drop(1).collect {
                widgets.poke()
                sendQueue.kick()
            }
        }
    }
}

package com.xtnl.app

import android.app.Application
import com.xtnl.app.data.AppSettings
import com.xtnl.app.data.CheckCache
import com.xtnl.app.data.DemoApi
import com.xtnl.app.data.HttpApi
import com.xtnl.app.data.XtnlApi
import com.xtnl.app.feel.Feel
import com.xtnl.app.notify.AuditReminder
import kotlinx.coroutines.flow.MutableSharedFlow

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
    }
}

class AppGraph(app: Application) {
    val settings = AppSettings(app)
    val cache = CheckCache(app)
    val feel = Feel(app) { settings.state.value }
    /** The week audit's Sunday 19:00 (Sydney) reminder (D37): a local alarm and notification, no server push. */
    val auditReminder = AuditReminder(app, settings)

    private val http = HttpApi(server = { settings.state.value.server }, token = { settings.token() })
    private val demo by lazy { DemoApi() }

    val api: XtnlApi get() = if (settings.state.value.demo) demo else http

    /** Where data comes from, for keying the cache: the server's origin, or "demo". */
    val source: String get() = settings.state.value.let { if (it.demo) "demo" else it.server }

    /** A deed elsewhere changed what Check shows (a logged task, a review answer): Check refreshes quietly. */
    val changes = MutableSharedFlow<String>(extraBufferCapacity = 8)
}

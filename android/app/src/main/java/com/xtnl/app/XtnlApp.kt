package com.xtnl.app

import android.app.Application
import com.xtnl.app.data.AppSettings
import com.xtnl.app.data.CheckCache
import com.xtnl.app.data.DemoApi
import com.xtnl.app.data.HttpApi
import com.xtnl.app.data.XtnlApi
import com.xtnl.app.feel.Feel
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
    }
}

class AppGraph(app: Application) {
    val settings = AppSettings(app)
    val cache = CheckCache(app)
    val feel = Feel(app) { settings.state.value }

    private val http = HttpApi(server = { settings.state.value.server }, token = { settings.token() })
    private val demo by lazy { DemoApi() }

    val api: XtnlApi get() = if (settings.state.value.demo) demo else http

    /** Where data comes from, for keying the cache: the server's origin, or "demo". */
    val source: String get() = settings.state.value.let { if (it.demo) "demo" else it.server }

    /** A deed elsewhere changed what Check shows (a logged task, a review answer): Check refreshes quietly. */
    val changes = MutableSharedFlow<String>(extraBufferCapacity = 8)
}

package com.xtnl.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import com.xtnl.app.ui.AppRoot
import com.xtnl.app.ui.Hinge
import com.xtnl.app.ui.WindowFacts
import com.xtnl.app.ui.more.WebHolder
import com.xtnl.app.ui.motion.MotionLevel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The one activity. It handles every size change itself (configChanges:
 * fold, unfold, rotation, a hardware keyboard), so nothing reloads: the
 * Compose tree, the ViewModels, the scroll positions, the typed text and a
 * review run all carry straight across, and the layout animates to its new
 * shape. The hinge comes from WindowInfoTracker (book and tabletop postures).
 */
class MainActivity : ComponentActivity() {

    private val facts = MutableStateFlow(WindowFacts())
    private val deepLinks = MutableStateFlow<Uri?>(null)
    private val web = WebHolder()
    private var barsDark: Boolean? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        val graph = (application as XtnlApp).graph
        graph.feel.view = window.decorView
        applyBars(dark = true)
        facts.update { it.copy(systemAnimScale = MotionLevel.systemScale(this)) }
        if (savedInstanceState == null) handleIntent(intent)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                WindowInfoTracker.getOrCreate(this@MainActivity).windowLayoutInfo(this@MainActivity).collect { info ->
                    val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
                    val hinge = fold?.let { f ->
                        val vertical = f.orientation == FoldingFeature.Orientation.VERTICAL
                        Hinge(
                            vertical = vertical,
                            startPx = if (vertical) f.bounds.left else f.bounds.top,
                            endPx = if (vertical) f.bounds.right else f.bounds.bottom,
                            halfOpen = f.state == FoldingFeature.State.HALF_OPENED,
                            separating = f.isSeparating,
                        )
                    }
                    facts.update { it.copy(hinge = hinge) }
                }
            }
        }

        setContent {
            AppRoot(
                graph = graph,
                facts = facts,
                deepLinks = deepLinks,
                onDeepLinkHandled = { deepLinks.value = null },
                webHolder = web,
                onThemeDark = ::applyBars,
                onFxAlive = ::highFrameRate,
            )
        }
    }

    override fun onResume() {
        super.onResume()
        // "Remove animations" may have changed while away.
        facts.update { it.copy(systemAnimScale = MotionLevel.systemScale(this)) }
        // Health Connect (P27): a sync while the app is in front (Android lets a foreground app read; at most every
        // 15 minutes, and only while the sync is on).
        val sync = (application as XtnlApp).graph.healthSync
        lifecycleScope.launch { sync.runIfDue() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    /** Launcher shortcuts and links: xtnl://app/<path>. The v1 shell's "Change address" shortcut opens Settings. */
    private fun handleIntent(intent: Intent?) {
        intent ?: return
        if (intent.action == ACTION_CHANGE_ADDRESS) {
            deepLinks.value = Uri.parse("xtnl://app/settings")
            return
        }
        val data = intent.data ?: return
        if (data.scheme == "xtnl") deepLinks.value = data
    }

    /**
     * While the moments' overlay is running, ask the display for its high rate (Android 15: the Fold's 120 Hz)
     * on the compose view; back to the default when it idles.
     */
    private fun highFrameRate(alive: Boolean) {
        if (Build.VERSION.SDK_INT < 35) return
        val view = findViewById<ViewGroup>(android.R.id.content)?.getChildAt(0) ?: return
        view.requestedFrameRate = if (alive) View.REQUESTED_FRAME_RATE_CATEGORY_HIGH else View.REQUESTED_FRAME_RATE_CATEGORY_DEFAULT
    }

    /** Edge to edge; light icons on Night, dark icons on Vellum. */
    private fun applyBars(dark: Boolean) {
        if (barsDark == dark) return
        barsDark = dark
        val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    override fun onPause() {
        super.onPause()
        android.webkit.CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private companion object {
        const val ACTION_CHANGE_ADDRESS = "com.xtnl.app.CHANGE_ADDRESS"
    }
}

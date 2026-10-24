package com.xtnl.app.health

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.XtnlApp
import com.xtnl.app.ui.more.HealthRationale
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.XtnlTheme
import com.xtnl.app.ui.theme.resolveColors

/**
 * The privacy rationale Health Connect opens for XTNL (blueprint P27): from its permission screen on Android 13 and
 * below (androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE), and from Settings › Health Connect on Android 14 and up
 * (the manifest's VIEW_PERMISSION_USAGE alias). The same words Settings shows before it asks, with Close only. One
 * column, at most 560 dp, on both of the Fold's displays.
 */
class HealthRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val settings = (application as XtnlApp).graph.settings
        setContent {
            val prefs by settings.state.collectAsStateWithLifecycle()
            XtnlTheme(resolveColors(prefs.theme)) {
                Box(
                    Modifier.fillMaxSize().background(X.c.page).windowInsetsPadding(WindowInsets.safeDrawing).verticalScroll(rememberScrollState()),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    HealthRationale(
                        onContinue = null,
                        onClose = { finish() },
                        modifier = Modifier.widthIn(max = 560.dp).padding(horizontal = 16.dp, vertical = 24.dp),
                        closeLabel = "Close",
                    )
                }
            }
        }
    }
}

package com.xtnl.app.ui.more

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.AppGraph
import com.xtnl.app.core.HealthLine
import com.xtnl.app.core.TimeLabels
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Settings › Health Connect (blueprint 5.1d, P27, decision D22, widened by health D21): walks, workouts and weight
 * read from Health Connect. **Off until the user turns it on.** Turning it on shows the rationale first
 * ([HealthRationale]: what is read, and what the server does with it), then Health Connect's own permission dialog;
 * the sync starts only once exercise, distance and weight are allowed. A refusal leaves it off. Under the toggle: the last sync's line (or why it didn't
 * land), Sync now, and the background line (Android 15+ asks separately for reads while the app is closed).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HealthConnectSettings(graph: AppGraph, toggle: @Composable (title: String, sub: String, on: Boolean, onChange: (Boolean) -> Unit) -> Unit) {
    val c = X.c
    val context = LocalContext.current
    val prefs by graph.settings.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var availability by remember { mutableStateOf(graph.healthSync.availability()) }
    var granted by remember { mutableStateOf(emptySet<String>()) }
    var background by remember { mutableStateOf(false) }
    var asking by rememberSaveable { mutableStateOf(false) }
    var note by rememberSaveable { mutableStateOf<String?>(null) }
    var syncing by remember { mutableStateOf(false) }

    fun reread() {
        availability = graph.healthSync.availability()
        background = graph.healthSync.backgroundAvailable()
        scope.launch { granted = graph.healthSync.granted() }
    }

    fun syncNow() {
        syncing = true
        scope.launch {
            graph.healthSync.run()
            syncing = false
        }
    }

    // Back from Health Connect's settings or the Play Store: read both again.
    LifecycleResumeEffect(Unit) {
        reread()
        onPauseOrDispose { }
    }
    val ask = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { got ->
        granted = got
        // Background reads just allowed (or taken back): the job follows the grant as it now stands.
        if (prefs.healthSync) graph.healthSync.schedule()
        if (HealthLine.ready(got)) {
            note = null
            if (!prefs.healthSync) graph.healthSync.setEnabled(true)
            syncNow()
        } else if (!prefs.healthSync) {
            note = "Health Connect didn't allow exercise, distance and weight, so it stays off."
        }
    }

    toggle(HealthLine.TOGGLE, HealthLine.TOGGLE_SUB, prefs.healthSync) { on ->
        note = null
        if (!on) {
            asking = false
            graph.healthSync.setEnabled(false)
        } else if (availability == HealthLine.Availability.AVAILABLE) {
            // The rationale first; Continue asks Health Connect (or starts at once when it already allows the reads).
            asking = true
        } else {
            note = HealthLine.settingsLine(true, availability, emptySet(), null, null, null, Instant.now())
        }
    }
    if (asking && !prefs.healthSync) {
        Spacer(Modifier.height(8.dp))
        HealthRationale(
            onContinue = {
                asking = false
                if (HealthLine.ready(granted)) {
                    graph.healthSync.setEnabled(true)
                    syncNow()
                } else {
                    ask.launch(HealthLine.asked(background))
                }
            },
            onClose = { asking = false },
        )
    }
    Spacer(Modifier.height(6.dp))
    val line = note ?: if (syncing) "Syncing…" else HealthLine.settingsLine(
        prefs.healthSync, availability, granted,
        TimeLabels.parseInstant(prefs.healthLastAt), prefs.healthLine, prefs.healthError, Instant.now(),
    )
    Text(line, color = c.ink2, style = MaterialTheme.typography.labelMedium)
    if (prefs.healthSync && availability == HealthLine.Availability.AVAILABLE) {
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!HealthLine.ready(granted)) XButton("Allow in Health Connect", { ask.launch(HealthLine.asked(background)) }, height = 48.dp)
            else XButton(if (syncing) "Syncing…" else "Sync now", { syncNow() }, kind = ButtonKind.QUIET, height = 48.dp, enabled = !syncing)
            if (background && HealthLine.ready(granted) && HealthLine.READ_IN_BACKGROUND !in granted) {
                XButton("Allow background reads", { ask.launch(setOf(HealthLine.READ_IN_BACKGROUND)) }, kind = ButtonKind.QUIET, height = 48.dp)
            }
        }
        if (HealthLine.ready(granted)) {
            Spacer(Modifier.height(6.dp))
            Text(HealthLine.backgroundLine(background, granted), color = c.ink2, style = MaterialTheme.typography.labelMedium)
        }
    }
    if (availability == HealthLine.Availability.NEEDS_UPDATE || (prefs.healthSync && availability == HealthLine.Availability.UNAVAILABLE)) {
        Spacer(Modifier.height(8.dp))
        XButton("Get Health Connect", {
            try {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${HealthLine.PROVIDER}&url=healthconnect%3A%2F%2Fonboarding"))
                        .setPackage("com.android.vending").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: ActivityNotFoundException) {
            }
        }, kind = ButtonKind.QUIET, height = 48.dp)
    }
    if (prefs.healthSync && availability == HealthLine.Availability.AVAILABLE) {
        Spacer(Modifier.height(4.dp))
        XButton("Health Connect settings", {
            try {
                context.startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: ActivityNotFoundException) {
            }
        }, kind = ButtonKind.QUIET, height = 48.dp)
    }
}

/**
 * The permission rationale (Health Connect requires one): what is read and why, one line a permission, and what the
 * server does with it, in its own rules. Settings shows it before asking ([onContinue] asks); Health Connect opens it
 * from its own settings through [com.xtnl.app.health.HealthRationaleActivity] (no Continue there, only Close).
 */
@Composable
fun HealthRationale(onContinue: (() -> Unit)?, onClose: () -> Unit, modifier: Modifier = Modifier, closeLabel: String = "Not now") {
    val c = X.c
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Eyebrow(HealthLine.TITLE)
        Text(HealthLine.RATIONALE_TITLE, style = MaterialTheme.typography.titleLarge, color = c.ink0, modifier = Modifier.semantics { heading() })
        Text(HealthLine.RATIONALE_LEAD, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
        Text("What it reads", style = MaterialTheme.typography.labelLarge, color = c.ink0, modifier = Modifier.padding(top = 4.dp))
        for (reason in HealthLine.REASONS.values) Bullet(reason)
        Text("What happens with it", style = MaterialTheme.typography.labelLarge, color = c.ink0, modifier = Modifier.padding(top = 4.dp))
        for (rule in HealthLine.RULES) Bullet(rule)
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (onContinue != null) XButton("Continue", onContinue, height = 48.dp)
            XButton(closeLabel, onClose, kind = ButtonKind.QUIET, height = 48.dp)
        }
    }
}

@Composable
private fun Bullet(text: String) {
    val c = X.c
    Row {
        Text("·", style = MaterialTheme.typography.bodyMedium, color = c.ink2)
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
    }
}

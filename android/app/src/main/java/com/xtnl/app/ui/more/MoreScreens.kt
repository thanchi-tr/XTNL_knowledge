package com.xtnl.app.ui.more

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.AppGraph
import com.xtnl.app.BuildConfig
import com.xtnl.app.core.ServerAddress
import com.xtnl.app.data.MotionChoice
import com.xtnl.app.data.Outcome
import com.xtnl.app.data.ThemeChoice
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.CardShape
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XCard
import com.xtnl.app.ui.components.XChip
import com.xtnl.app.ui.components.XField
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun MoreScreen(graph: AppGraph, onSettings: () -> Unit, onFullApp: () -> Unit) {
    val c = X.c
    val prefs by graph.settings.state.collectAsStateWithLifecycle()
    val top = WindowInsets.safeDrawing.only(WindowInsetsSides.Top).asPaddingValues().calculateTopPadding()
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = top + 8.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("More", style = MaterialTheme.typography.headlineMedium, color = c.ink0, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
        MoreRow(Glyphs.Globe, "Open full app", "Everything else: Today, Library, Train, You", onFullApp)
        MoreRow(Glyphs.Settings, "Settings", "Server, token, theme, motion, sound and haptics", onSettings)
        Spacer(Modifier.height(8.dp))
        XCard(Modifier.fillMaxWidth()) {
            Column {
                Eyebrow("Connected to")
                Spacer(Modifier.height(4.dp))
                Text(if (prefs.demo) "Demo data (nothing is sent)" else ServerAddress.hostOf(prefs.server), color = c.ink0, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (prefs.demo) "Switch back to the server in Settings › Data." else if (prefs.hasToken) "With an API token" else "No API token",
                    color = c.ink2, style = MaterialTheme.typography.labelMedium,
                )
            }
        }
        Text("XTNL ${BuildConfig.VERSION_NAME}", color = c.ink2, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 4.dp, top = 8.dp))
    }
}

@Composable
private fun MoreRow(icon: ImageVector, title: String, sub: String, onClick: () -> Unit) {
    val c = X.c
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clip(CardShape).background(c.card).border(1.dp, c.line1, CardShape)
            .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = c.ink1, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = c.ink0, style = MaterialTheme.typography.titleMedium)
            Text(sub, color = c.ink2, style = MaterialTheme.typography.labelMedium)
        }
        Icon(Glyphs.Chevron, null, tint = c.ink2, modifier = Modifier.size(20.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(graph: AppGraph, systemStill: Boolean, onBack: () -> Unit) {
    val c = X.c
    val prefs by graph.settings.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var address by rememberSaveable { mutableStateOf(prefs.server) }
    var addressNote by rememberSaveable { mutableStateOf<String?>(null) }
    var addressOk by rememberSaveable { mutableStateOf(true) }
    var token by rememberSaveable { mutableStateOf("") }
    var tokenNote by rememberSaveable { mutableStateOf<String?>(null) }
    // Not saved: a check still running when Settings is left is cancelled with it, so it must not come back "Checking…".
    var testing by remember { mutableStateOf(false) }
    val top = WindowInsets.safeDrawing.only(WindowInsetsSides.Top).asPaddingValues().calculateTopPadding()

    fun test() {
        testing = true
        addressNote = null
        scope.launch {
            val r = graph.api.check()
            testing = false
            when (r) {
                is Outcome.Ok -> { addressOk = true; addressNote = "Connected · ${r.value.dayLabel ?: "the board answered"}" }
                is Outcome.Err -> { addressOk = false; addressNote = r.message }
            }
        }
    }

    fun save(raw: String) {
        when (val chk = ServerAddress.check(raw)) {
            is ServerAddress.Check.Ok -> {
                address = chk.origin
                graph.settings.setServer(chk.origin)
                if (!prefs.demo) test() else { addressOk = true; addressNote = "Saved. Demo data is on, so nothing is sent." }
            }
            is ServerAddress.Check.Bad -> { addressOk = false; addressNote = chk.reason }
        }
    }

    Column(
        Modifier.fillMaxSize()
            .verticalScroll(rememberScrollState())
            .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom))
            .padding(start = 16.dp, end = 16.dp, top = top + 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            XIconButton(Glyphs.Back, "Back", onBack)
            Text("Settings", style = MaterialTheme.typography.headlineMedium, color = c.ink0)
        }

        Section("Server") {
            XField(
                address, { address = it; addressNote = null }, Modifier.fillMaxWidth(),
                label = "Address", placeholder = ServerAddress.PRODUCTION,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { save(address) }),
            )
            Spacer(Modifier.height(8.dp))
            FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                XChip("Production", prefs.server == ServerAddress.PRODUCTION, { address = ServerAddress.PRODUCTION; save(address) }, height = 44.dp)
                XChip("Local dev (adb reverse)", prefs.server == ServerAddress.LOCAL_DEV, { address = ServerAddress.LOCAL_DEV; save(address) }, height = 44.dp)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                XButton("Save", { save(address) }, height = 48.dp)
                XButton(if (testing) "Checking…" else "Test", { test() }, kind = ButtonKind.QUIET, height = 48.dp, enabled = !testing && !prefs.demo)
            }
            (if (testing) "Checking…" else addressNote)?.let {
                Text(it, color = if (addressOk || testing) c.ink1 else c.owed, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
            }
            Text(
                "Local dev: run the server on port 3100, plug the phone in and run adb reverse tcp:3100 tcp:3100. Plain http:// works only for localhost, 127.0.0.1 and 10.0.2.2.",
                color = c.ink2, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp),
            )
        }

        Section("API token") {
            Text(
                if (prefs.hasToken) "A token is saved for ${ServerAddress.hostOf(prefs.server)} (encrypted on this phone). It is sent as Authorization: Bearer, to that address only."
                else "No token for ${ServerAddress.hostOf(prefs.server)}. Add one if the server has MOBILE_API_TOKEN set.",
                color = c.ink1, style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(8.dp))
            XField(
                token, { token = it; tokenNote = null }, Modifier.fillMaxWidth(), placeholder = if (prefs.hasToken) "Paste a new token to replace it" else "Paste the token",
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done, autoCorrectEnabled = false),
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                XButton("Save token", {
                    val t = token
                    token = ""
                    // The Keystore can take a moment (making its key the first time): off the main thread.
                    scope.launch {
                        val saved = withContext(Dispatchers.IO) { graph.settings.setToken(t) }
                        tokenNote = if (saved) "Saved." else "This phone's keystore refused to store it."
                        if (saved) graph.changes.tryEmit("token")
                    }
                }, height = 48.dp, enabled = token.isNotBlank())
                if (prefs.hasToken) XButton("Remove", {
                    scope.launch {
                        withContext(Dispatchers.IO) { graph.settings.setToken(null) }
                        tokenNote = "Removed."
                        graph.changes.tryEmit("token")
                    }
                }, kind = ButtonKind.QUIET, height = 48.dp)
            }
            tokenNote?.let { Text(it, color = c.ink1, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp)) }
        }

        Section("Theme") {
            Choices(ThemeChoice.entries.map { it to it.label }, prefs.theme) { graph.settings.setTheme(it) }
        }

        Section("Motion") {
            Choices(MotionChoice.entries.map { it to it.label }, prefs.motion) { graph.settings.setMotion(it) }
            Spacer(Modifier.height(6.dp))
            Text(
                when {
                    systemStill -> "The phone's \"Remove animations\" is on, so the app stays Still."
                    prefs.motion == MotionChoice.FULL -> "Springs, sparks and the seal's flight."
                    prefs.motion == MotionChoice.CALM -> "Short fades only: no particles or flights."
                    else -> "Nothing moves; every state shows at rest. Sound is off in Still."
                },
                color = c.ink2, style = MaterialTheme.typography.labelMedium,
            )
        }

        Section("Feedback") {
            Toggle("Sound", "Soft tones: a rising pluck for ticks in a row", prefs.sound) { graph.settings.setSound(it) }
            Toggle("Haptics", "A light tap on a tick, a rise on a new idea", prefs.haptics) { graph.settings.setHaptics(it) }
        }

        Section("Data") {
            Choices(listOf(false to "Server", true to "Demo data"), prefs.demo) { graph.settings.setDemo(it) }
            Spacer(Modifier.height(6.dp))
            Text(
                if (prefs.demo) "Demo data: a made-up day, kept on this phone while the app runs. Nothing reaches the server."
                else "Live: every tick, answer and log goes to the server.",
                color = c.ink2, style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    XCard(Modifier.fillMaxWidth().widthIn(max = 720.dp)) {
        Column {
            Eyebrow(title)
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> Choices(options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit) {
    FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((v, label) in options) XChip(label, v == value, { onChange(v) }, height = 44.dp)
    }
}

@Composable
private fun Toggle(title: String, sub: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val c = X.c
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { onChange(!on) }.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = c.ink0, style = MaterialTheme.typography.titleMedium)
            Text(sub, color = c.ink2, style = MaterialTheme.typography.labelMedium)
        }
        Box {
            Switch(
                on, onChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = c.page, checkedTrackColor = c.ink0,
                    uncheckedThumbColor = c.ink2, uncheckedTrackColor = c.raised, uncheckedBorderColor = c.lineCtl,
                ),
            )
        }
    }
}

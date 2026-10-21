package com.xtnl.app.ui.log

import com.xtnl.app.ui.motion.rememberBump
import kotlinx.coroutines.coroutineScope
import com.xtnl.app.ui.motion.EaseOut
import com.xtnl.app.ui.motion.Spr
import com.xtnl.app.ui.motion.spr
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.core.Fmt
import com.xtnl.app.core.IdeaBody
import com.xtnl.app.core.IdeaDraft
import com.xtnl.app.core.IdeaFormat
import com.xtnl.app.core.LogPreview
import com.xtnl.app.core.LogSection
import com.xtnl.app.core.Panes
import com.xtnl.app.data.IdeaResult
import com.xtnl.app.data.collectionChoices
import com.xtnl.app.ui.LocalSnacks
import com.xtnl.app.ui.LocalWindowLayout
import com.xtnl.app.ui.LogMode
import com.xtnl.app.ui.Nav
import com.xtnl.app.ui.SnackTone
import com.xtnl.app.ui.TwoPane
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.CardShape
import com.xtnl.app.ui.components.ChipShape
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.PillShape
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XCard
import com.xtnl.app.ui.components.XChip
import com.xtnl.app.ui.components.XField
import com.xtnl.app.ui.components.XFieldValue
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.motion.LocalFeel
import com.xtnl.app.ui.motion.LocalFx
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.fade
import com.xtnl.app.ui.motion.tweenOf
import com.xtnl.app.ui.review.MathText
import com.xtnl.app.ui.review.hasDollarMath
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun LogScreen(vm: LogViewModel, nav: Nav) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val c = X.c
    val feel = LocalFeel.current
    val fx = LocalFx.current
    val snacks = LocalSnacks.current
    val motion = LocalMotion.current
    val density = LocalDensity.current
    val wl = LocalWindowLayout.current
    val scope = rememberCoroutineScope()
    val look = remember { FilingLook(ui.failKey) }
    val firstField = remember { FocusRequester() }
    var nod by remember { mutableIntStateOf(0) }

    // Filing (moment 8): the overlay fades in over the dimmed, blurred fields.
    LaunchedEffect(ui.creating) {
        if (!ui.creating) return@LaunchedEffect
        look.end = null
        look.endAt = 0L
        look.line.snapTo(1f)
        look.showing = true
        scope.launch { if (motion.moves) look.overlay.animateTo(1f, motion.spr(Spr.fx)) else look.overlay.snapTo(1f) }
        scope.launch { if (motion.moves) look.dim.animateTo(1f, tween(200, easing = EaseOut)) else look.dim.snapTo(1f) }
    }
    // The answer (moment 9): the seal stamps and flies, the node folds into its twin, or nothing is saved.
    LaunchedEffect(ui.sealing) {
        val r = ui.sealing ?: return@LaunchedEffect
        // A screen composed after the answer (a tab switch mid-filing) has nothing to play.
        if (!look.showing) { vm.sealDone(); return@LaunchedEffect }
        val newest = ui.created.firstOrNull()?.key
        scope.launch {
            sealMoment(r, newest, look, vm, fx, feel, snacks, motion, c, density.density, rail = wl.mode.nav == com.xtnl.app.core.NavStyle.RAIL, hinge = wl.hinge) {
                runCatching { firstField.requestFocus() }
            }
        }
    }
    // A refusal: the idea goes back to the form, and Create nods.
    LaunchedEffect(ui.failKey) {
        if (ui.failKey <= look.playedFail) return@LaunchedEffect
        val key = ui.failKey
        if (!look.showing) { look.playedFail = key; return@LaunchedEffect }
        scope.launch {
            look.end = FilingEnd.FAILED
            feel?.ideaFailed("idea-fail:$key")
            nod++
            if (!motion.moves) {
                look.overlay.snapTo(0f); look.dim.snapTo(0f)
            } else coroutineScope {
                launch { look.dim.animateTo(0f, tween(200)) }
                launch { delay(if (motion == MotionLevel.FULL) 120 else 0); look.overlay.animateTo(0f, tween(if (motion == MotionLevel.FULL) 200 else 160)) }
            }
            look.showing = false
            look.playedFail = key
        }
    }

    // The section chips follow a deep link / shortcut (Log a task).
    LaunchedEffect(nav.section) { vm.setSection(nav.section) }
    LaunchedEffect(nav.logMode) { if (nav.logMode == LogMode.IDEA) vm.loadMeta() }

    LaunchedEffect(vm) {
        vm.events.collect { e ->
            when (e) {
                is LogViewModel.Event.Added -> {
                    feel?.tick("log:${e.entry.key}", motes = false)
                    // No Undo for what can't be undone (a weigh-in that wrote nothing comes back with no undo).
                    val action = if (e.entry.kind == "idea-draft") "Open form" else if (e.entry.undo != null) "Undo" else null
                    snacks.show(e.entry.line, action, SnackTone.KEPT) {
                        if (e.entry.kind == "idea-draft") {
                            vm.draftToForm(e.entry)
                            nav.logMode = LogMode.IDEA
                        } else {
                            feel?.untick()
                            vm.undo(e.entry.key)
                        }
                    }
                }
                is LogViewModel.Event.SendFailed -> { feel?.error(); snacks.error(e.message) { vm.send() } }
                is LogViewModel.Event.Undone -> snacks.show("Undone · ${e.entry.text}")
                is LogViewModel.Event.UndoFailed -> { feel?.error(); snacks.error(e.message) }
                is LogViewModel.Event.IdeaFailed -> { if (!look.showing) feel?.error(); snacks.error(e.message) }
                is LogViewModel.Event.IdeaCreated -> {
                    // The filing overlay plays the answer (and says it as it lands); with no overlay up, it is said at once.
                    if (look.showing) return@collect
                    val r = e.result
                    if (r.status != "created") {
                        feel?.select()
                        snacks.show(r.line ?: if (r.status == "merged") "You already have this one." else "Something close is already here, so nothing was saved.", long = true)
                        return@collect
                    }
                    val pts = r.points?.takeIf { it > 0 }
                    snacks.show(listOfNotNull(r.line ?: "Filed", pts?.let { "+${Fmt.figure(it)} pts" }).joinToString(" · "), tone = SnackTone.KEPT)
                }
            }
        }
    }

    val top = WindowInsets.safeDrawing.only(WindowInsetsSides.Top).asPaddingValues().calculateTopPadding()
    val mode = nav.logMode

    val header: @Composable () -> Unit = {
        // The title and the Quick line | New idea switch side by side, or stacked in a narrow pane.
        androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = top + 8.dp, bottom = 8.dp)) {
            if (maxWidth >= 400.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Log", style = MaterialTheme.typography.headlineMedium, color = c.ink0, modifier = Modifier.weight(1f))
                    ModeSwitch(mode) { nav.logMode = it }
                }
            } else {
                Column {
                    Text("Log", style = MaterialTheme.typography.headlineMedium, color = c.ink0)
                    Spacer(Modifier.height(8.dp))
                    ModeSwitch(mode) { nav.logMode = it }
                }
            }
        }
    }

    if (!wl.mode.twoPane) {
        Column(Modifier.fillMaxSize()) {
            header()
            AnimatedContent(
                targetState = mode,
                transitionSpec = {
                    if (!motion.moves) fadeIn(tween(0)) togetherWith fadeOut(tween(0))
                    else (fadeIn(motion.tweenOf(200)) + slideInVertically(motion.tweenOf(260)) { it / 12 }) togetherWith fadeOut(motion.tweenOf(140))
                },
                modifier = Modifier.weight(1f),
                label = "log-mode",
            ) { m ->
                when (m) {
                    LogMode.QUICK -> Column(Modifier.fillMaxSize()) {
                        RecentList(ui, vm, Modifier.weight(1f), reverse = true)
                        QuickDock(ui, vm, nav, Modifier.windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom)))
                    }
                    LogMode.IDEA -> IdeaForm(ui, vm, look, firstField, nod, Modifier.fillMaxSize())
                }
            }
        }
    } else {
        val tabletop = wl.mode.panes == Panes.TOP_BOTTOM
        val form: @Composable () -> Unit = {
            Column(Modifier.fillMaxSize()) {
                if (!tabletop) header()
                when (mode) {
                    LogMode.QUICK -> Column(Modifier.fillMaxSize()) {
                        if (!tabletop) {
                            Text(
                                "One line: a task, a weigh-in or an idea. The server reads it the same way the web's capture sheet does.",
                                color = c.ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                            )
                            Spacer(Modifier.weight(1f))
                        }
                        QuickDock(ui, vm, nav, Modifier.windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom)), showPreview = tabletop)
                    }
                    LogMode.IDEA -> IdeaForm(ui, vm, look, firstField, nod, Modifier.fillMaxSize())
                }
            }
        }
        val side: @Composable () -> Unit = {
            Column(Modifier.fillMaxSize().padding(top = if (tabletop) 0.dp else top + 8.dp)) {
                if (tabletop) header()
                when (mode) {
                    LogMode.QUICK -> {
                        if (!tabletop) PreviewCard(ui, Modifier.padding(horizontal = 16.dp))
                        RecentList(ui, vm, Modifier.weight(1f), reverse = false)
                    }
                    LogMode.IDEA -> IdeaSide(ui, vm, look, Modifier.weight(1f))
                }
            }
        }
        // Tabletop: what you read on top, what you type below the hinge. Book / flat: the form first.
        if (tabletop) TwoPane(first = side, second = form) else TwoPane(first = form, second = side)
    }
}

// ── Quick line ──────────────────────────────────────────────────────────────

@Composable
private fun ModeSwitch(mode: LogMode, onChange: (LogMode) -> Unit) {
    Row(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        XChip("Quick line", mode == LogMode.QUICK, { onChange(LogMode.QUICK) }, icon = Glyphs.Log, height = 44.dp)
        XChip("New idea", mode == LogMode.IDEA, { onChange(LogMode.IDEA) }, icon = Glyphs.Idea, height = 44.dp)
    }
}

@Composable
private fun QuickDock(ui: LogViewModel.Ui, vm: LogViewModel, nav: Nav, modifier: Modifier = Modifier, showPreview: Boolean = true) {
    val c = X.c
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(nav.focusLog) {
        // Once per shortcut or link: coming back to Log later (or a fold) doesn't pop the keyboard again.
        if (!nav.takeFocusLog()) return@LaunchedEffect
        delay(180)
        runCatching { focus.requestFocus() }
        keyboard?.show()
    }
    val reading = remember(ui.text, ui.section) { LogPreview.read(ui.text, ui.section) }
    Column(
        modifier
            .fillMaxWidth()
            .background(c.bar)
            .padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 10.dp)
    ) {
        if (showPreview) {
            PreviewLine(reading, ui.text.isBlank())
            Spacer(Modifier.height(8.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().selectableGroup()) {
            for (s in LogSection.entries) {
                XChip(
                    s.label, ui.section == s, { vm.setSection(s); nav.section = s },
                    icon = when (s) { LogSection.TASK -> Glyphs.Task; LogSection.WEIGHT -> Glyphs.Weight; LogSection.IDEA -> Glyphs.Idea },
                    height = 44.dp,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            XField(
                value = ui.text,
                onValueChange = vm::setText,
                modifier = Modifier.weight(1f),
                placeholder = when (ui.section) {
                    LogSection.TASK -> "gym legs 60m every mon,thu !"
                    LogSection.WEIGHT -> "82.4"
                    LogSection.IDEA -> "an idea to file later"
                },
                keyboardOptions = KeyboardOptions(
                    imeAction = ImeAction.Send,
                    keyboardType = if (ui.section == LogSection.WEIGHT) KeyboardType.Decimal else KeyboardType.Text,
                ),
                keyboardActions = KeyboardActions(onSend = { vm.send() }),
                minHeight = 56.dp,
                fieldModifier = Modifier
                    .focusRequester(focus)
                    .onPreviewKeyEvent { e ->
                        if (e.type == KeyEventType.KeyDown && (e.key == Key.Enter || e.key == Key.NumPadEnter) && !e.isShiftPressed) { vm.send(); true } else false
                    },
            )
            Spacer(Modifier.width(8.dp))
            SendButton(enabled = ui.text.isNotBlank() && !ui.sending, sending = ui.sending) { vm.send() }
        }
        ui.sendError?.let {
            Text(it, color = c.owed, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp, start = 4.dp))
        }
    }
}

@Composable
private fun SendButton(enabled: Boolean, sending: Boolean, onClick: () -> Unit) {
    val c = X.c
    val motion = LocalMotion.current
    val spin = remember { Animatable(0f) }
    LaunchedEffect(sending) {
        if (!sending || !motion.moves) { spin.snapTo(0f); return@LaunchedEffect }
        while (true) { spin.snapTo(0f); spin.animateTo(1f, tween(700)) }
    }
    Box(
        Modifier
            .size(56.dp)
            .graphicsLayer { alpha = if (enabled || sending) 1f else 0.4f; rotationZ = if (sending) 360f * spin.value else 0f }
            .clip(CircleShape)
            .background(c.ink0)
            .clickable(enabled = enabled, onClickLabel = "Send", onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(if (sending) Glyphs.Refresh else Glyphs.Send, "Send", tint = c.page, modifier = Modifier.size(24.dp))
    }
}

/** The one-line parse preview: how the line reads, as you type. */
@Composable
private fun PreviewLine(reading: LogPreview.Reading, empty: Boolean) {
    val c = X.c
    val motion = LocalMotion.current
    AnimatedContent(
        targetState = reading.line,
        transitionSpec = {
            if (!motion.moves) fadeIn(tween(0)) togetherWith fadeOut(tween(0))
            else fadeIn(tween(120)) togetherWith fadeOut(tween(90))
        },
        label = "preview",
    ) { line ->
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
            Text("Reads as ", color = c.ink2, style = MaterialTheme.typography.labelMedium)
            Text(
                line, color = if (reading.ok && !empty) c.ink0 else c.ink2,
                style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** The big live preview beside the form (main display): the reading as chips. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PreviewCard(ui: LogViewModel.Ui, modifier: Modifier = Modifier) {
    val c = X.c
    val reading = remember(ui.text, ui.section) { LogPreview.read(ui.text, ui.section) }
    XCard(modifier.fillMaxWidth()) {
        Column {
            Eyebrow("Reads as")
            Spacer(Modifier.height(8.dp))
            Text(
                if (ui.text.isBlank()) "Type a line to see how it reads" else reading.title.ifBlank { ui.section.label },
                style = MaterialTheme.typography.headlineSmall, color = if (ui.text.isBlank()) c.ink2 else c.ink0,
            )
            if (reading.tokens.isNotEmpty() && ui.text.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (t in reading.tokens) TokenChip(t)
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "The server reads the same line again; what it stores is its reading.",
                style = MaterialTheme.typography.labelMedium, color = c.ink2,
            )
        }
    }
}

@Composable
private fun TokenChip(t: LogPreview.Token) {
    val c = X.c
    val (mark, word) = when (t.kind) {
        LogPreview.Kind.MUST -> c.must to "Must"
        LogPreview.Kind.SCHEDULE -> c.habit to "Repeats"
        LogPreview.Kind.DATE -> c.ink1 to "Day"
        LogPreview.Kind.TIME -> c.ink1 to "At"
        LogPreview.Kind.DURATION -> c.ink1 to "Takes"
        LogPreview.Kind.WEIGHT -> c.kept to "Weight"
        LogPreview.Kind.NOTE -> c.ink2 to "Note"
        LogPreview.Kind.TITLE -> c.ink1 to "Idea"
    }
    Row(
        Modifier.clip(ChipShape).background(c.raised).border(1.dp, c.line2, ChipShape).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(mark))
        Spacer(Modifier.width(6.dp))
        Text("$word ", color = c.ink2, style = MaterialTheme.typography.labelMedium)
        Text(t.text, color = c.ink0, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun RecentList(ui: LogViewModel.Ui, vm: LogViewModel, modifier: Modifier = Modifier, reverse: Boolean) {
    val c = X.c
    val motion = LocalMotion.current
    if (ui.recent.isEmpty()) {
        Column(modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.Bottom.takeIf { reverse } ?: Arrangement.Top) {
            Eyebrow("Try")
            Spacer(Modifier.height(8.dp))
            for ((line, what) in listOf(
                "gym legs 60m every mon,thu !" to "a Must on Mon and Thu, 60 min",
                "call mum tomorrow 7pm" to "a task tomorrow at 7 pm",
                "82.4" to "a weigh-in (Weigh-in)",
                "why do leaves change colour?" to "an idea draft (Idea)",
            )) {
                Column(Modifier.padding(vertical = 5.dp)) {
                    Text(line, color = c.ink0, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace))
                    Text(what, color = c.ink2, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        return
    }
    LazyColumn(
        modifier.fillMaxWidth(),
        reverseLayout = reverse,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!reverse) item(key = "label") { Eyebrow("This session", Modifier.padding(start = 4.dp, bottom = 4.dp)) }
        items(ui.recent, key = { it.key }) { e ->
            Row(
                Modifier.animateItem(fadeInSpec = motion.fade(), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade())
                    .fillMaxWidth().clip(CardShape).background(c.card).border(1.dp, c.line1, CardShape)
                    .graphicsLayer { alpha = if (e.undone) 0.5f else 1f }
                    .padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    when (e.section) { LogSection.TASK -> Glyphs.Task; LogSection.WEIGHT -> Glyphs.Weight; LogSection.IDEA -> Glyphs.Idea },
                    null, tint = if (e.undone) c.ink2 else c.kept, modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(e.text, color = c.ink0, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(if (e.undone) "Undone" else e.line, color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                if (!e.undone && e.undo != null) XIconButton(Glyphs.Undo, "Undo", { vm.undo(e.key) })
            }
        }
    }
}

// ── New idea ────────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IdeaForm(ui: LogViewModel.Ui, vm: LogViewModel, look: FilingLook, firstField: FocusRequester, nod: Int, modifier: Modifier) {
    val c = X.c
    val feel = LocalFeel.current
    val scroll = rememberScrollState()
    val choose: (IdeaFormat) -> Unit = { f -> if (f != ui.format) feel?.select(); vm.setFormat(f) }
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    // Create puts the keyboard away, so the bar (and its Review tab, where the seal lands) is back while it files.
    val create = {
        keyboard?.hide()
        focus.clearFocus()
        vm.create()
    }
    Column(
        modifier.onPreviewKeyEvent { e ->
            // Alt+1…7 pick the format (as on the web); Alt+Enter creates.
            if (e.type != KeyEventType.KeyDown || !e.isAltPressed) return@onPreviewKeyEvent false
            val i = listOf(Key.One, Key.Two, Key.Three, Key.Four, Key.Five, Key.Six, Key.Seven).indexOf(e.key)
            when {
                i >= 0 -> { choose(IdeaFormat.entries[i]); true }
                e.key == Key.Enter -> { create(); true }
                else -> false
            }
        }
    ) {
        Column(Modifier.weight(1f).verticalScroll(scroll).padding(horizontal = 16.dp)) {
            Box {
                XCard(Modifier.fillMaxWidth()) {
                    Column {
                        Eyebrow("Format")
                        Spacer(Modifier.height(8.dp))
                        FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            IdeaFormat.entries.forEach { f ->
                                val meta = ui.meta?.formats?.firstOrNull { IdeaFormat.of(it.type) == f }
                                XChip(
                                    meta?.label ?: f.label, ui.format == f, { choose(f) },
                                    trailing = meta?.points?.let { "+${Fmt.figure(it)}" },
                                    height = 44.dp,
                                )
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                        val help = ui.meta?.formats?.firstOrNull { IdeaFormat.of(it.type) == ui.format }?.help ?: ui.format.hint
                        Text(help, color = c.ink2, style = MaterialTheme.typography.labelMedium)
                        Spacer(Modifier.height(16.dp))
                        Box {
                            Column(Modifier.filingFields(look)) {
                                IdeaFields(ui.format, ui.draft, vm, enabled = !ui.creating, first = firstField)
                                val choices = collectionChoices(ui.meta)
                                if (choices.isNotEmpty()) {
                                    Spacer(Modifier.height(16.dp))
                                    Eyebrow("Collection")
                                    Spacer(Modifier.height(8.dp))
                                    // The first (Book) is the form's default: chosen = sent as left out.
                                    val chosen = ui.draft.collection ?: choices.first().value
                                    FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        for (ch in choices) {
                                            XChip(ch.label, chosen == ch.value, {
                                                vm.edit { d -> d.copy(collection = if (ch.value == choices.first().value) null else ch.value) }
                                            }, height = 40.dp)
                                        }
                                    }
                                }
                                if (ui.draft.draftId != null) {
                                    Spacer(Modifier.height(10.dp))
                                    Text("Finishes an idea draft from the quick line; it leaves the Inbox.", color = c.ink2, style = MaterialTheme.typography.labelMedium)
                                }
                            }
                            if (ui.creating || look.showing) FilingOverlay(ui.createStartedMs, look, look.field, Modifier.matchParentSize())
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
        Column(
            Modifier
                .fillMaxWidth()
                .background(c.bar)
                .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom))
                .padding(horizontal = 16.dp, vertical = 10.dp)
        ) {
            ui.createError?.let { Text(it, color = c.owed, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(bottom = 8.dp, start = 4.dp)) }
            XButton(
                if (ui.creating) "Filing…" else "Create",
                { create() },
                Modifier.fillMaxWidth(),
                icon = if (ui.creating) null else Glyphs.Plus,
                busy = ui.creating,
                nodKey = nod,
            )
        }
    }
}

@Composable
private fun IdeaFields(format: IdeaFormat, d: IdeaDraft, vm: LogViewModel, enabled: Boolean, first: FocusRequester) {
    val c = X.c
    val feel = LocalFeel.current
    val gap = Modifier.height(12.dp)
    // The first field of each format: a twin's text comes back here, focused.
    val firstMod = Modifier.focusRequester(first)
    when (format) {
        IdeaFormat.SHORT -> {
            XField(d.question, { v -> vm.edit { it.copy(question = v) } }, Modifier.fillMaxWidth(), label = "Question", placeholder = "What does the mitochondrion make?", singleLine = false, minLines = 2, enabled = enabled, fieldModifier = firstMod)
            Spacer(gap)
            XField(d.answer, { v -> vm.edit { it.copy(answer = v) } }, Modifier.fillMaxWidth(), label = "Answer", placeholder = "ATP", singleLine = false, enabled = enabled)
            Spacer(Modifier.height(8.dp))
            XChip("Capitals count", d.caseSensitive, { vm.edit { it.copy(caseSensitive = !it.caseSensitive) } }, height = 40.dp, toggle = true)
        }
        IdeaFormat.CLOZE -> {
            var tfv by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(d.clozeText, TextRange(d.clozeText.length))) }
            if (tfv.text != d.clozeText) tfv = TextFieldValue(d.clozeText, TextRange(d.clozeText.length))
            XFieldValue(
                tfv, { v -> tfv = v; vm.edit { it.copy(clozeText = v.text) } }, Modifier.fillMaxWidth(),
                label = "Sentence", placeholder = "The capital of France is {{Paris}}.", enabled = enabled, fieldModifier = firstMod,
            )
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                XButton("Blank it", {
                    val (text, caret) = IdeaBody.blankIt(tfv.text, tfv.selection.min, tfv.selection.max)
                    tfv = TextFieldValue(text, TextRange(caret))
                    vm.edit { it.copy(clozeText = text) }
                    feel?.select()
                }, kind = ButtonKind.QUIET, height = 44.dp, enabled = enabled)
                Spacer(Modifier.width(10.dp))
                val blanks = IdeaBody.clozeAnswers(d.clozeText)
                Text(
                    if (blanks.isEmpty()) "Select words, then Blank it" else Fmt.plural(blanks.size, "blank") + ": " + blanks.joinToString(" · "),
                    color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IdeaFormat.NUMERIC -> {
            XField(d.numericPrompt, { v -> vm.edit { it.copy(numericPrompt = v) } }, Modifier.fillMaxWidth(), label = "Question", placeholder = "Acceleration due to gravity at sea level?", singleLine = false, minLines = 2, enabled = enabled, fieldModifier = firstMod)
            Spacer(gap)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                XField(d.numericValue, { v -> vm.edit { it.copy(numericValue = v) } }, Modifier.weight(1f), label = "Value", placeholder = "9.81", mono = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), enabled = enabled)
                XField(d.tolerance, { v -> vm.edit { it.copy(tolerance = v) } }, Modifier.weight(1f), label = "Tolerance ±", placeholder = "0.05", mono = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), enabled = enabled)
            }
            Spacer(gap)
            XField(d.unit, { v -> vm.edit { it.copy(unit = v) } }, Modifier.fillMaxWidth(), label = "Unit", placeholder = "m/s²", enabled = enabled)
        }
        IdeaFormat.MULTI -> {
            Eyebrow("Options · tap the circle of the right one", Modifier.padding(start = 4.dp, bottom = 6.dp))
            d.options.forEachIndexed { i, opt ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                    // A radio button for TalkBack: which option, and whether it is the right one.
                    Box(
                        Modifier.size(48.dp).clip(CircleShape)
                            .selectable(selected = d.correct == i, enabled = enabled, role = Role.RadioButton) {
                                feel?.select(); vm.edit { it.copy(correct = i) }
                            }
                            .semantics { contentDescription = "Right option ${i + 1}" + opt.takeIf { it.isNotBlank() }?.let { ": $it" }.orEmpty() },
                        contentAlignment = Alignment.Center,
                    ) {
                        com.xtnl.app.ui.components.CheckCircle(d.correct == i, size = 26.dp)
                    }
                    XField(opt, { v -> vm.edit { it.copy(options = it.options.toMutableList().also { l -> l[i] = v }) } }, Modifier.weight(1f),
                        placeholder = if (i == d.correct) "The right option" else "A wrong option that looks right", enabled = enabled)
                    if (d.options.size > 2) XIconButton(Glyphs.Close, "Remove option", {
                        vm.edit { it.copy(options = it.options.filterIndexed { j, _ -> j != i }, correct = when { it.correct == i -> 0; it.correct > i -> it.correct - 1; else -> it.correct }) }
                    }, enabled = enabled)
                }
            }
            if (d.options.size < 6) XButton("Add option", { vm.edit { it.copy(options = it.options + "") } }, kind = ButtonKind.QUIET, icon = Glyphs.Plus, height = 44.dp, enabled = enabled)
        }
        IdeaFormat.LIST, IdeaFormat.ORDER -> {
            val list = format == IdeaFormat.LIST
            val prompt = if (list) d.listPrompt else d.orderPrompt
            val items = if (list) d.listItems else d.orderItems
            fun setItems(l: List<String>) = vm.edit { if (list) it.copy(listItems = l) else it.copy(orderItems = l) }
            XField(prompt, { v -> vm.edit { if (list) it.copy(listPrompt = v) else it.copy(orderPrompt = v) } }, Modifier.fillMaxWidth(),
                label = "Prompt", placeholder = if (list) "Name the four bases in DNA" else "Order the stages of mitosis", singleLine = false, enabled = enabled, fieldModifier = firstMod)
            Spacer(gap)
            Eyebrow(if (list) "Items · any order" else "Steps · in the right order", Modifier.padding(start = 4.dp, bottom = 6.dp))
            items.forEachIndexed { i, item ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                    Text("${i + 1}", color = c.ink2, style = MaterialTheme.typography.labelLarge, modifier = Modifier.width(26.dp))
                    XField(item, { v -> setItems(items.toMutableList().also { l -> l[i] = v }) }, Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { if (i == items.lastIndex && item.isNotBlank() && items.size < 20) setItems(items + "") }),
                        enabled = enabled)
                    if (!list) {
                        XIconButton(Glyphs.Up, "Move up", { feel?.select(); setItems(com.xtnl.app.core.AnswerShape.move(items, i, i - 1)) }, size = 40.dp, enabled = enabled && i > 0)
                    }
                    if (items.size > 2) XIconButton(Glyphs.Close, "Remove", { setItems(items.filterIndexed { j, _ -> j != i }) }, size = 40.dp, enabled = enabled)
                }
            }
            if (items.size < 20) XButton(if (list) "Add item" else "Add step", { setItems(items + "") }, kind = ButtonKind.QUIET, icon = Glyphs.Plus, height = 44.dp, enabled = enabled)
        }
        IdeaFormat.FORMULA -> {
            XField(d.formulaQuestion, { v -> vm.edit { it.copy(formulaQuestion = v) } }, Modifier.fillMaxWidth(), label = "Question",
                placeholder = "Write the Euclidean norm of a vector \$v = (x, y)\$.", singleLine = false, minLines = 2, enabled = enabled, fieldModifier = firstMod)
            if (hasDollarMath(d.formulaQuestion)) {
                Spacer(Modifier.height(8.dp))
                MathText(d.formulaQuestion, hasMath = true, dollars = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp))
            }
            Spacer(gap)
            XField(d.formulaAnswer, { v -> vm.edit { it.copy(formulaAnswer = v) } }, Modifier.fillMaxWidth(), label = "Formula",
                placeholder = "sqrt(x^2 + y^2)", mono = true, enabled = enabled,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii))
            Text("Graded by algebraic equivalence: any form that equals it counts.", color = c.ink2, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp, start = 4.dp))
        }
    }
}

/** Beside the form on the main display: how the card will look, and what was filed this session. */
@Composable
private fun IdeaSide(ui: LogViewModel.Ui, vm: LogViewModel, look: FilingLook, modifier: Modifier = Modifier) {
    val c = X.c
    val motion = LocalMotion.current
    LazyColumn(modifier.fillMaxWidth(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item(key = "preview") {
            XCard(Modifier.fillMaxWidth()) {
                Column {
                    Eyebrow("The card")
                    Spacer(Modifier.height(8.dp))
                    val d = ui.draft
                    val prompt = when (ui.format) {
                        IdeaFormat.SHORT -> d.question
                        IdeaFormat.CLOZE -> IdeaBody.clozeBlanked(d.clozeText)
                        IdeaFormat.NUMERIC -> d.numericPrompt + (d.unit.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: "")
                        IdeaFormat.MULTI -> d.options.filter { it.isNotBlank() }.joinToString("\n") { "○ $it" }
                        IdeaFormat.LIST -> d.listPrompt
                        IdeaFormat.ORDER -> d.orderPrompt
                        IdeaFormat.FORMULA -> d.formulaQuestion
                    }
                    if (prompt.isBlank()) Text("What you write shows here as the review card.", color = c.ink2, style = MaterialTheme.typography.bodyMedium)
                    else MathText(prompt, hasMath = ui.format == IdeaFormat.FORMULA && hasDollarMath(prompt), dollars = true, style = MaterialTheme.typography.titleMedium)
                    val problem = IdeaBody.problem(ui.format, d)
                    Spacer(Modifier.height(8.dp))
                    Text(problem ?: "Ready to create", color = if (problem == null) c.kept else c.ink2, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        // The newest row waits for its seal to land on Review, then enters (and its ◇ bumps).
        val held = look.holdRow ?: ui.sealing?.takeIf { it.status == "created" && motion == MotionLevel.FULL }?.let { ui.created.firstOrNull()?.key }
        val shown = ui.created.filter { it.key != held }
        if (shown.isNotEmpty()) item(key = "label") {
            Eyebrow("Filed this session", Modifier.animateItem(fadeInSpec = motion.fade(), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade()).padding(start = 4.dp, top = 8.dp))
        }
        items(shown, key = { it.key }) { f ->
            CreatedRow(
                f.result, bumpKey = if (f.key == shown.first().key) look.landed else 0,
                modifier = Modifier.animateItem(fadeInSpec = motion.fade(tween(160, easing = EaseOut)), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade(tween(120))),
            )
        }
    }
}

@Composable
private fun CreatedRow(r: IdeaResult, bumpKey: Int, modifier: Modifier = Modifier) {
    val c = X.c
    val bump = rememberBump(bumpKey, 8f)
    Row(
        modifier.fillMaxWidth().clip(CardShape).background(c.card).border(1.dp, c.line1, CardShape).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Lozenge, null, tint = if (r.status == "duplicate") c.ink2 else c.pts, modifier = Modifier.size(18.dp).graphicsLayer { val s = bump(); scaleX = s; scaleY = s })
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(r.title ?: "Idea", color = c.ink0, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(r.line ?: r.status, color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
        r.points?.takeIf { it > 0 }?.let {
            Box(Modifier.clip(PillShape).background(c.wash(c.pts)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                Text("+${Fmt.figure(it)}", color = c.ink0, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

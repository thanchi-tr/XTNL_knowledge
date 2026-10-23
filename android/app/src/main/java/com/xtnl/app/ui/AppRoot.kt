package com.xtnl.app.ui

import androidx.compose.animation.core.VisibilityThreshold
import android.Manifest
import android.net.Uri
import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.xtnl.app.AppGraph
import com.xtnl.app.core.FoldInfo
import com.xtnl.app.core.HingeOrientation
import com.xtnl.app.core.Layouts
import com.xtnl.app.core.NavStyle
import com.xtnl.app.data.ReviewSummary
import com.xtnl.app.notify.AuditReminder
import com.xtnl.app.ui.check.CheckEvents
import com.xtnl.app.ui.check.CheckScreen
import com.xtnl.app.ui.check.CheckSpots
import com.xtnl.app.ui.check.CheckViewModel
import com.xtnl.app.ui.log.LogScreen
import com.xtnl.app.ui.log.LogViewModel
import com.xtnl.app.ui.more.FullAppScreen
import com.xtnl.app.ui.more.MoreScreen
import com.xtnl.app.ui.more.SettingsScreen
import com.xtnl.app.ui.more.WebHolder
import com.xtnl.app.ui.motion.EaseIn
import com.xtnl.app.ui.motion.EaseOut
import com.xtnl.app.ui.motion.EaseOutCubic
import com.xtnl.app.ui.motion.FxLayer
import com.xtnl.app.ui.motion.FxState
import com.xtnl.app.ui.motion.LocalFeel
import com.xtnl.app.ui.motion.LocalFx
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.Spr
import com.xtnl.app.ui.motion.rememberBump
import com.xtnl.app.ui.review.ReviewScreen
import com.xtnl.app.ui.review.ReviewSpots
import com.xtnl.app.ui.review.ReviewViewModel
import com.xtnl.app.ui.mall.MallScreen
import com.xtnl.app.ui.mall.MallViewModel
import com.xtnl.app.ui.status.StatusScreen
import com.xtnl.app.ui.status.StatusViewModel
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.XtnlTheme
import com.xtnl.app.ui.theme.resolveColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sign

/** What the activity knows about the window: the hinge (in window px), and whether system animations are off. */
data class WindowFacts(val hinge: Hinge? = null, val systemAnimScale: Float = 1f)

/** The last unfold (the cover → the main display), so panes composed by it can reveal themselves from the hinge. */
data class Unfold(val seq: Int = 0, val atMs: Long = 0L)

val LocalUnfold = androidx.compose.runtime.staticCompositionLocalOf { Unfold() }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppRoot(
    graph: AppGraph,
    facts: StateFlow<WindowFacts>,
    deepLinks: StateFlow<Uri?>,
    onDeepLinkHandled: () -> Unit,
    webHolder: WebHolder,
    onThemeDark: (Boolean) -> Unit,
    onFxAlive: (Boolean) -> Unit = {},
) {
    val prefs by graph.settings.state.collectAsStateWithLifecycle()
    val window by facts.collectAsStateWithLifecycle()
    val colors = resolveColors(prefs.theme)
    LaunchedEffect(colors.dark) { onThemeDark(colors.dark) }
    val motion = MotionLevel.of(prefs.motion, window.systemAnimScale)
    val fx = remember { FxState() }
    val aliveCallback by rememberUpdatedState(onFxAlive)
    // Sound follows the resolved level (Still mutes it, the system's "Remove animations" included); a cancelled
    // moment drops its pending sounds and beats too.
    SideEffect {
        graph.feel.motion = motion
        fx.onCancel = graph.feel::cancel
        fx.onAlive = { aliveCallback(it) }
    }
    val snackHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val snacks = remember { Snacks(snackHost, scope) }
    val nav = rememberSaveable(saver = Nav.Saver) { Nav() }

    val checkVm: CheckViewModel = viewModel { CheckViewModel(graph) }
    val logVm: LogViewModel = viewModel { LogViewModel(graph) }
    val reviewVm: ReviewViewModel = viewModel { ReviewViewModel(graph) }
    val checkList = rememberLazyListState()
    val checkSpots = remember { CheckSpots() }
    // Review's moments' parts and what they have played: kept here, so coming back to Review shows them at rest.
    val reviewSpots = remember { ReviewSpots(scope) }

    val link by deepLinks.collectAsStateWithLifecycle()
    LaunchedEffect(link) {
        link?.let { nav.open(it); onDeepLinkHandled() }
    }

    // The Sunday reminder (D37): on Android 13+, ask for notifications once, when the server's audit first goes live
    // with the reminder on. Settings › Notifications can ask again; the app never asks twice by itself.
    val context = LocalContext.current
    val notifyAsk = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { graph.auditReminder.sync() }
    val wantsAsk = prefs.auditReminder && prefs.auditLive && !prefs.notifyAsked && !prefs.demo
    LaunchedEffect(wantsAsk) {
        if (wantsAsk && AuditReminder.needsPermission(context)) {
            graph.settings.setNotifyAsked()
            notifyAsk.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Back from the app's resume: the board may have moved on (the web, another device).
    LifecycleResumeEffect(Unit) {
        if (checkVm.staleFor(15_000)) checkVm.refresh(quiet = true)
        onPauseOrDispose { }
    }

    XtnlTheme(colors) {
        CompositionLocalProvider(
            LocalMotion provides motion,
            LocalFeel provides graph.feel,
            LocalFx provides fx,
            LocalSnacks provides snacks,
        ) {
            // Check's snacks and moments, on whichever tab the user is on when the server answers.
            CheckEvents(checkVm, checkSpots)
            BoxWithConstraints(
                Modifier
                    .fillMaxSize()
                    .background(colors.page)
                    // The first touch wakes the audio path, so the first pluck lands on its frame.
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                            graph.feel.prewarm()
                        }
                    }
            ) {
                val density = LocalDensity.current
                val fold = window.hinge?.let { h ->
                    FoldInfo(
                        orientation = if (h.vertical) HingeOrientation.VERTICAL else HingeOrientation.HORIZONTAL,
                        halfOpen = h.halfOpen, separating = h.separating,
                        startDp = h.startPx / density.density, endDp = h.endPx / density.density,
                    )
                }
                val target = Layouts.of(maxWidth.value, maxHeight.value, fold)
                // A posture change on the same display waits 120 ms to settle (a hinge moving through); a display
                // switch (cover ↔ main) is never held back.
                var mode by remember { mutableStateOf(target) }
                var unfold by remember { mutableStateOf(Unfold()) }
                val reveal = remember { Animatable(1f) }
                LaunchedEffect(target) {
                    if (target == mode) return@LaunchedEffect
                    val displaySwitch = target.nav != mode.nav || target.width != mode.width
                    if (!displaySwitch) delay(120)
                    val before = mode
                    // Flights land, particles fade and cues drop: nothing plays on across a new layout.
                    fx.settleAll()
                    mode = target
                    if (displaySwitch && motion.moves) {
                        val unfolding = before.nav == NavStyle.BAR && target.nav == NavStyle.RAIL
                        if (unfolding) unfold = Unfold(unfold.seq + 1, SystemClock.uptimeMillis())
                        // The new display's content comes up from .85 (ModulateAlpha: no offscreen buffer).
                        reveal.snapTo(0f)
                        reveal.animateTo(1f, if (motion == MotionLevel.FULL && unfolding) spring(0.9f, 500f) else tween(160, easing = EaseOut))
                    }
                }
                val rail = mode.nav == NavStyle.RAIL
                val imeUp = WindowInsets.isImeVisible
                val showBar = !rail && !(imeUp && (nav.tab == Tab.LOG || nav.tab == Tab.REVIEW || (nav.tab == Tab.MORE && nav.more != MoreRoute.ROOT)))
                val reviewSummary = checkVm.ui.collectAsStateWithLifecycle().value.data?.review
                val reviewDue = reviewSummary?.due
                val fullScreen = nav.tab == Tab.MORE && nav.more == MoreRoute.WEB

                BackHandler(enabled = nav.canGoBack || (nav.tab == Tab.LOG && nav.logMode == LogMode.IDEA)) { nav.back() }

                // Where the destinations' area sits in the window, measured outside the tab transition: panes split
                // at the hinge from here, so a sliding tab never moves the split.
                var area by remember { mutableStateOf<IntOffset?>(null) }
                CompositionLocalProvider(LocalWindowLayout provides WindowLayout(mode, window.hinge), LocalUnfold provides unfold, LocalPaneOrigin provides area) {
                    Row(Modifier.fillMaxSize()) {
                        // The rail and the bar come and go with their display, never expanding or shrinking.
                        if (rail && !fullScreen) {
                            Box(Modifier.graphicsLayer { alpha = reveal.value; compositingStrategy = CompositingStrategy.ModulateAlpha }) {
                                NavRail(nav, fx, reviewDue, checkList)
                            }
                        }
                        Column(Modifier.weight(1f).fillMaxHeight()) {
                            Box(
                                Modifier
                                    .weight(1f)
                                    .fillMaxWidth()
                                    .graphicsLayer {
                                        alpha = 0.85f + 0.15f * reveal.value
                                        compositingStrategy = CompositingStrategy.ModulateAlpha
                                    }
                                    .then(if (showBar) Modifier.consumeWindowInsets(WindowInsets.navigationBars.only(WindowInsetsSides.Bottom)) else Modifier)
                                    .windowInsetsPadding(WindowInsets.safeDrawing.only(if (rail) WindowInsetsSides.End else WindowInsetsSides.Horizontal))
                                    .onGloballyPositioned {
                                        val p = it.positionInWindow()
                                        val at = IntOffset(p.x.roundToInt(), p.y.roundToInt())
                                        if (at != area) area = at
                                    }
                            ) {
                                Destinations(graph, nav, checkVm, checkSpots, logVm, reviewVm, reviewSpots, checkList, webHolder, window.systemAnimScale == 0f, reviewSummary, rail)
                            }
                            if (showBar && !fullScreen) BottomBar(nav, fx, reviewDue, checkList)
                        }
                    }
                }
                XSnackHost(
                    snackHost,
                    Modifier
                        .align(Alignment.BottomCenter)
                        .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                        .padding(bottom = if (showBar) 76.dp else if (nav.tab == Tab.LOG || nav.tab == Tab.REVIEW) 150.dp else 8.dp)
                        .padding(start = if (rail) Layouts.RAIL_DP.dp else 0.dp),
                )
                FxLayer(fx, motion, colors.dark, window.systemAnimScale)
            }
        }
    }
}

/** Where a destination sits along the tabs (Check, Log, Review, More, then More's own pages deeper in). */
private fun depthOf(key: String): Float = when (key) {
    "check" -> 0f
    "log" -> 1f
    "review" -> 2f
    "more:ROOT" -> 3f
    else -> 3.5f
}

@Composable
private fun Destinations(
    graph: AppGraph, nav: Nav, checkVm: CheckViewModel, checkSpots: CheckSpots, logVm: LogViewModel, reviewVm: ReviewViewModel, reviewSpots: ReviewSpots,
    checkList: LazyListState, webHolder: WebHolder, systemStill: Boolean, reviewSummary: ReviewSummary?, rail: Boolean,
) {
    val holder = rememberSaveableStateHolder()
    val motion = LocalMotion.current
    val density = LocalDensity.current
    val prefs by graph.settings.state.collectAsStateWithLifecycle()
    val key = when (nav.tab) {
        Tab.MORE -> "more:" + nav.more.name
        else -> nav.tab.key
    }
    val tabIn = with(density) { (if (rail) 16.dp else 24.dp).roundToPx() }
    val tabOut = with(density) { 12.dp.roundToPx() }
    val push = with(density) { 32.dp.roundToPx() }
    AnimatedContent(
        targetState = key,
        transitionSpec = {
            // Directional: a tab to the right comes in from the right (the rail: from below); More's pages push and pop.
            val from = depthOf(initialState)
            val to = depthOf(targetState)
            val d = sign(to - from).toInt()
            val sub = initialState.startsWith("more:") && targetState.startsWith("more:")
            val inPx = if (sub) push else tabIn
            val outPx = if (sub) push else tabOut
            // A fade-through: the old screen is gone (70 ms, EaseOut) before the new one shows (from T + 60), so the
            // two are never both legible; the new one's slide starts at once and still tells the direction.
            when (motion) {
                MotionLevel.FULL -> {
                    val enter = fadeIn(tween(180, delayMillis = 60, easing = EaseOut)) +
                        if (rail && !sub) slideInVertically(spring(0.9f, 500f, IntOffset.VisibilityThreshold)) { inPx * d }
                        else slideInHorizontally(spring(0.9f, 500f, IntOffset.VisibilityThreshold)) { inPx * d }
                    val exit = fadeOut(tween(70, easing = EaseOut)) +
                        if (rail && !sub) slideOutVertically(tween(120, easing = EaseIn)) { -outPx * d }
                        else slideOutHorizontally(tween(120, easing = EaseIn)) { -outPx * d }
                    enter togetherWith exit
                }
                MotionLevel.CALM -> fadeIn(tween(140, delayMillis = 60)) togetherWith fadeOut(tween(70, easing = EaseOut))
                MotionLevel.STILL -> fadeIn(tween(0)) togetherWith fadeOut(tween(0))
            }
        },
        label = "tab",
    ) { k ->
        holder.SaveableStateProvider(k) {
            when (k) {
                "check" -> CheckScreen(
                    checkVm, checkSpots, checkList,
                    onStartReview = { nav.go(Tab.REVIEW); nav.startReview++ },
                    onOpenSettings = { nav.go(Tab.MORE); nav.more = MoreRoute.SETTINGS },
                    onUseDemo = { graph.settings.setDemo(true) },
                )
                "log" -> LogScreen(logVm, nav)
                "review" -> ReviewScreen(reviewVm, nav, reviewSummary, reviewSpots, onBackToCheck = { nav.go(Tab.CHECK) })
                "more:SETTINGS" -> SettingsScreen(graph, systemStill, onBack = { nav.more = MoreRoute.ROOT })
                "more:WEB" -> FullAppScreen(webHolder, prefs.server, nav.webPath, onClose = { nav.more = MoreRoute.ROOT }, onSettings = { nav.more = MoreRoute.SETTINGS })
                // Blueprint P1: the five attributes; its view model is made on the first visit, then kept with the activity.
                "more:STATUS" -> StatusScreen(viewModel { StatusViewModel(graph) }, onBack = { nav.more = MoreRoute.ROOT })
                // Blueprint P18: the Mall's catalog; its view model is made on the first visit, then kept with the activity.
                "more:MALL" -> MallScreen(viewModel { MallViewModel(graph) }, onBack = { nav.more = MoreRoute.ROOT })
                else -> MoreScreen(
                    graph,
                    onSettings = { nav.more = MoreRoute.SETTINGS },
                    onFullApp = { nav.webPath = "/"; nav.more = MoreRoute.WEB },
                    onStatus = { nav.more = MoreRoute.STATUS },
                    onMall = { nav.more = MoreRoute.MALL },
                )
            }
        }
    }
}

// ── The bar (front display) and the rail (main display) ─────────────────────

/**
 * The selected tab's pill: its two edges on two springs (the leading one quicker), so it stretches toward the new
 * tab and gathers there, about 1.5–1.8× at 80 ms, its height giving 10% per unit of stretch. Calm: one 160 ms
 * tween, no stretch. Drawn behind the items: moving it recomposes nothing.
 */
@Composable
private fun rememberPill(index: Int): Pair<Animatable<Float, *>, Animatable<Float, *>> {
    val motion = LocalMotion.current
    val lead = remember { Animatable(index.toFloat()) }
    val trail = remember { Animatable(index.toFloat()) }
    LaunchedEffect(index) {
        val to = index.toFloat()
        when (motion) {
            MotionLevel.FULL -> {
                launch { lead.animateTo(to, Spr.pillLead.spec()) }
                launch { trail.animateTo(to, Spr.pillTrail.spec()) }
            }
            MotionLevel.CALM -> {
                launch { lead.animateTo(to, tween(160, easing = EaseOut)) }
                launch { trail.animateTo(to, tween(160, easing = EaseOut)) }
            }
            MotionLevel.STILL -> { lead.snapTo(to); trail.snapTo(to) }
        }
    }
    return lead to trail
}

@Composable
private fun BottomBar(nav: Nav, fx: FxState, reviewDue: Int?, checkList: LazyListState) {
    val c = X.c
    var itemWidth by remember { mutableFloatStateOf(0f) }
    val index = Tab.entries.indexOf(nav.tab)
    val (lead, trail) = rememberPill(index)
    val raised = c.raised
    Box(
        Modifier
            .fillMaxWidth()
            .background(c.bar)
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal))
            .height(68.dp)
            .onSizeChanged { itemWidth = it.width / Tab.entries.size.toFloat() }
            .drawBehind {
                if (itemWidth <= 0f) return@drawBehind
                val pw = 60.dp.toPx()
                val ph = 32.dp.toPx()
                val a = lead.value
                val b = trail.value
                val stretch = abs(a - b)
                val h = ph * (1f - 0.1f * stretch.coerceAtMost(1f))
                val left = min(a, b) * itemWidth + (itemWidth - pw) / 2
                val right = max(a, b) * itemWidth + (itemWidth + pw) / 2
                drawRoundRect(raised, Offset(left, 8.dp.toPx() + (ph - h) / 2), Size(right - left, h), CornerRadius(h / 2))
            }
    ) {
        Row(Modifier.fillMaxSize()) {
            for (t in Tab.entries) {
                NavItem(t, nav, fx, reviewDue, checkList, Modifier.weight(1f).fillMaxHeight(), vertical = true)
            }
        }
    }
}

@Composable
private fun NavRail(nav: Nav, fx: FxState, reviewDue: Int?, checkList: LazyListState) {
    val c = X.c
    val index = Tab.entries.indexOf(nav.tab)
    val itemH: Dp = 76.dp
    val (lead, trail) = rememberPill(index)
    val raised = c.raised
    Column(
        Modifier
            .width(Layouts.RAIL_DP.dp)
            .fillMaxHeight()
            .background(c.bar)
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Start + WindowInsetsSides.Vertical)),
    ) {
        Spacer(Modifier.height(20.dp))
        Box(
            Modifier.drawBehind {
                // The rail's pill stretches on Y.
                val ih = itemH.toPx()
                val pw = 56.dp.toPx()
                val ph = 32.dp.toPx()
                val a = lead.value
                val b = trail.value
                val stretch = abs(a - b)
                val w = pw * (1f - 0.1f * stretch.coerceAtMost(1f))
                val top = min(a, b) * ih + 10.dp.toPx()
                val bottom = max(a, b) * ih + 10.dp.toPx() + ph
                drawRoundRect(raised, Offset((size.width - w) / 2, top), Size(w, bottom - top), CornerRadius(ph / 2))
            }
        ) {
            Column {
                for (t in Tab.entries) NavItem(t, nav, fx, reviewDue, checkList, Modifier.fillMaxWidth().height(itemH), vertical = true)
            }
        }
    }
}

/**
 * A tab. Its icon's tint crossfades (two layers, no recomposition) and the selected one bumps; a landing (a seal,
 * motes) squashes it (1.25 × 0.80, then springs back) and bumps the due badge.
 */
@Composable
private fun NavItem(t: Tab, nav: Nav, fx: FxState, reviewDue: Int?, checkList: LazyListState, modifier: Modifier, vertical: Boolean) {
    val c = X.c
    val feel = LocalFeel.current
    val motion = LocalMotion.current
    val scope = rememberCoroutineScope()
    val selected = nav.tab == t
    val tint = remember { Animatable(if (selected) 1f else 0f) }
    var picks by remember { mutableStateOf(0) }
    var was by remember { mutableStateOf(selected) }
    LaunchedEffect(selected) {
        if (selected == was) return@LaunchedEffect
        was = selected
        val to = if (selected) 1f else 0f
        if (selected) picks++
        if (!motion.moves) tint.snapTo(to) else tint.animateTo(to, tween(120))
    }
    val pick = rememberBump(picks, 4f)
    val landings = fx.bumps[t.key] ?: 0
    val sx = remember { Animatable(1f) }
    val sy = remember { Animatable(1f) }
    // The landings as composed: a bar or rail composed again (the keyboard goes, a fold) squashes only for a new one.
    var landingsSeen by remember { mutableIntStateOf(landings) }
    LaunchedEffect(landings) {
        if (landings <= landingsSeen) return@LaunchedEffect
        landingsSeen = landings
        if (!motion.moves) return@LaunchedEffect
        if (motion == MotionLevel.FULL) {
            launch { sx.animateTo(1.25f, tween(50, easing = EaseOutCubic)); sx.animateTo(1f, spring(0.4f, 700f)) }
            sy.animateTo(0.80f, tween(50, easing = EaseOutCubic))
            sy.animateTo(1f, spring(0.4f, 700f))
        } else {
            launch { sx.animateTo(1.08f, tween(80)); sx.animateTo(1f, spring(1f, 700f)) }
            sy.animateTo(1.08f, tween(80))
            sy.animateTo(1f, spring(1f, 700f))
        }
    }
    val badge = rememberBump(landings, 15f)
    // A hidden bar (the keyboard is up) is no landing place: its position is forgotten until it shows again.
    DisposableEffect(t.key) { onDispose { fx.targets.remove(t.key) } }
    Column(
        modifier
            .semantics { this.selected = selected }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Tab,
                onClickLabel = t.label,
            ) {
                when {
                    !selected -> feel?.segment()
                    // Re-tapping Log focuses its line (a tick); re-tapping Check scrolls it to the top.
                    t == Tab.LOG -> { feel?.select(); nav.focusLog++ }
                    t == Tab.CHECK -> scope.launch { if (motion.moves) checkList.animateScrollToItem(0) else checkList.scrollToItem(0) }
                }
                if (t == Tab.MORE && nav.tab == Tab.MORE) nav.more = MoreRoute.ROOT
                nav.go(t)
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(if (vertical) 12.dp else 0.dp))
        Box(
            Modifier
                .size(width = 56.dp, height = 24.dp)
                .onGloballyPositioned { fx.targets[t.key] = it.boundsInRoot().center }
                .graphicsLayer { val p = pick(); scaleX = sx.value * p; scaleY = sy.value * p },
            contentAlignment = Alignment.Center,
        ) {
            Icon(t.icon, null, tint = c.ink2, modifier = Modifier.size(24.dp).graphicsLayer { alpha = 1f - tint.value })
            Icon(t.icon, t.label, tint = c.ink0, modifier = Modifier.size(24.dp).graphicsLayer { alpha = tint.value })
            if (t == Tab.REVIEW && reviewDue != null && reviewDue > 0) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(end = 6.dp)
                        .graphicsLayer { val b = badge(); scaleX = b; scaleY = b }
                        .size(width = if (reviewDue > 9) 24.dp else 18.dp, height = 18.dp)
                        .clip(CircleShape)
                        .background(c.pts),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (reviewDue > 99) "99" else "$reviewDue", color = c.onPts, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(t.label, color = if (selected) c.ink0 else c.ink2, style = MaterialTheme.typography.labelMedium, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
    }
}

package com.xtnl.app.ui.review

import android.text.format.DateFormat
import androidx.compose.ui.graphics.addOutline
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.core.AnswerDraft
import com.xtnl.app.core.AnswerShape
import com.xtnl.app.core.FatigueLine
import com.xtnl.app.core.CardKind
import com.xtnl.app.core.Fmt
import com.xtnl.app.core.Panes
import com.xtnl.app.core.TimeLabels
import com.xtnl.app.data.AnswerResult
import com.xtnl.app.data.Fatigue
import com.xtnl.app.data.Quest
import com.xtnl.app.data.ReviewCard
import com.xtnl.app.data.ReviewSummary
import com.xtnl.app.ui.LocalWindowLayout
import com.xtnl.app.ui.MoreRoute
import com.xtnl.app.ui.Nav
import com.xtnl.app.ui.Tab
import com.xtnl.app.ui.TwoPane
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.CardShape
import com.xtnl.app.ui.components.CheckCircle
import com.xtnl.app.ui.components.ComboX
import com.xtnl.app.ui.components.CtlShape
import com.xtnl.app.ui.components.EmptyNote
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.LevelSeal
import com.xtnl.app.ui.components.PillShape
import com.xtnl.app.ui.components.SealState
import com.xtnl.app.ui.components.SessionSeal
import com.xtnl.app.ui.components.StampSpec
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XCard
import com.xtnl.app.ui.components.XField
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.motion.ComboMoment
import com.xtnl.app.ui.motion.CountUp
import com.xtnl.app.ui.motion.Dur
import com.xtnl.app.ui.motion.EaseIn
import com.xtnl.app.ui.motion.EaseInOut
import com.xtnl.app.ui.motion.EaseOut
import com.xtnl.app.ui.motion.FxState
import com.xtnl.app.ui.motion.LocalFeel
import com.xtnl.app.ui.motion.LocalFx
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.RollingNumber
import com.xtnl.app.ui.motion.SessionMoment
import com.xtnl.app.ui.motion.Spr
import com.xtnl.app.ui.motion.bump
import com.xtnl.app.ui.motion.rememberBump
import com.xtnl.app.ui.motion.spr
import com.xtnl.app.ui.motion.stamp
import com.xtnl.app.ui.motion.visibleCenter
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.figures
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Where Review's moments start and land (root coordinates and live layouts), the session bar's banked points
 * (which count up as each point mote arrives), and the moments already played. AppRoot keeps it, with a scope that
 * outlives the screen: a tab switch or a fold composes the screen again at rest instead of replaying its moments
 * (their sounds, beats, motes and stamps), and points still in flight bank all the same.
 */
@Stable
class ReviewSpots(internal val scope: CoroutineScope) {
    internal var badge: Offset? = null
    internal var cardSeal: Offset? = null
    internal var ptsFigure: Offset? = null
    internal var pts: LayoutCoordinates? = null
    internal var bar: LayoutCoordinates? = null
    /** The card on show (a point mote's path goes round it). */
    internal var card: LayoutCoordinates? = null
    /** The card's level seal (its forge on a level up). */
    internal var seal: SealState? = null
    /** The session bar's points, as banked so far (the motes still in flight aren't in it yet). */
    internal val banked = Animatable(0f)
    internal var bankedBump by mutableIntStateOf(0)
    internal var pointsInFlight = 0
    /** The miss whose retry node has landed at the queue's end (or never flew): from then the bar shows the card coming back. */
    internal var backLanded by mutableIntStateOf(0)
    /** Ticks when a missed card's node lands at the end of the bar (its ring pops). */
    internal var slotPop by mutableIntStateOf(0)
    /** The card level up whose "Level 3 → 4" figure has rolled in (at its close, L + 310). */
    internal var levelLine by mutableIntStateOf(0)

    // The moments played, by id ("correct:3", "card:d-atp#0", …): each plays once, however often it is composed.
    private val played = LinkedHashSet<String>()

    /** Not played yet: read where a moment's parts are composed (at rest when it was). */
    internal fun fresh(id: String): Boolean = id !in played

    /** Marks [id] played; true the first time (its sound, beats and particles go then, once). */
    internal fun play(id: String): Boolean = played.add(id).also { while (played.size > 256) played.remove(played.first()) }
}

@Composable
fun ReviewScreen(vm: ReviewViewModel, nav: Nav, summary: ReviewSummary?, spots: ReviewSpots, onBackToCheck: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val c = X.c
    val feel = LocalFeel.current
    val fx = LocalFx.current
    val motion = LocalMotion.current
    val density = LocalDensity.current
    val wl = LocalWindowLayout.current
    val top = WindowInsets.safeDrawing.only(WindowInsetsSides.Top).asPaddingValues().calculateTopPadding()
    val start = { vm.start(summary?.let { Quest(it.doneToday, it.target) }) }
    val main = wl.mode.twoPane && wl.mode.panes != Panes.TOP_BOTTOM
    val slotR = with(density) { SLOT_R.toPx() }

    // The session's points and the queue's end are always targets, so the first answer has somewhere to land. The
    // queue's end is where the bar draws a card coming back.
    DisposableEffect(spots) {
        fx.anchors["pts"] = { spots.pts?.visibleCenter() }
        fx.anchors["queueEnd"] = {
            spots.bar?.takeIf { it.isAttached }?.let { b -> b.visibleCenter(0.3f)?.let { b.localToRoot(Offset(b.size.width - slotR, b.size.height / 2f)) } }
        }
        onDispose { fx.anchors.remove("pts"); fx.anchors.remove("queueEnd") }
    }
    LaunchedEffect(nav.startReview) {
        // Each Start review (Check, a link) once: coming back to this tab later doesn't start another run.
        if (nav.takeStartReview() && !ui.running && ui.phase != ReviewViewModel.Phase.LOADING) start()
    }
    // The moments, each once per answer: a screen composed again (another tab, a fold) shows them at rest.
    LaunchedEffect(ui.correctKey) {
        val key = ui.correctKey
        if (key == 0) return@LaunchedEffect
        val r = ui.result?.takeIf { it.correct } ?: return@LaunchedEffect
        if (!spots.play("correct:$key")) return@LaunchedEffect
        val combo = r.comboNext
        val tier = ComboMoment.tier(combo)
        val id = "correct:$key"
        val milestone = ComboMoment.milestone(combo)
        val big = milestone || (tier == 3 && ComboMoment.tier(ui.prevCombo) < 3)
        // The point motes leave the "+pts" figure at 200 ms for the session bar, which banks each share as it lands.
        val m = ComboMoment.pointMotes(tier)
        val motes = motion == MotionLevel.FULL && r.xp > 0 && fx.resolve("pts") != null
        if (motes) spots.pointsInFlight += m
        feel?.correct(id, tier, combo, if (motes) ComboMoment.firstArrival() else null, big, milestone, r.leveledUp)
        if (motion != MotionLevel.FULL) return@LaunchedEffect
        launch {
            var flying = false
            try {
                delay(ComboMoment.POINTS_AT.toLong())
                val from = spots.ptsFigure
                val to = fx.resolve("pts")
                val share = (r.xp / m).toFloat()
                // One column (or tabletop): from under the card to the bar over it, so round the card's end edge, not
                // over its words. Side by side: an arc over the chord.
                val card = spots.card?.takeIf { it.isAttached }?.boundsInRoot()
                val around = from != null && to != null && card != null && from.y > card.bottom && to.y < card.top && maxOf(from.x, to.x) < card.right
                flying = motes && from != null && fx.motes(
                    from, "pts", m, FxState.Shape.LOZENGE, c.pts, 7f, 4f, seed = key * 7,
                    staggerMs = ComboMoment.POINTS_STAGGER, path = if (around) FxState.MotePath.AROUND else FxState.MotePath.ARC, apexDp = 50f,
                    edgeX = (card?.right ?: 0f) + 6f * density.density, id = id,
                ) { _ ->
                    spots.pointsInFlight = (spots.pointsInFlight - 1).coerceAtLeast(0)
                    spots.scope.launch { spots.banked.animateTo(spots.banked.targetValue + share, tween(160, easing = EaseOut)) }
                    spots.bankedBump++
                } >= 0
            } finally {
                // Nothing flew (no target, or the screen left first): the figure catches up at once.
                if (motes && !flying) {
                    spots.pointsInFlight = (spots.pointsInFlight - m).coerceAtLeast(0)
                    val points = (ui.session?.points ?: 0.0).toFloat()
                    spots.scope.launch { spots.banked.animateTo(points, tween(200, easing = EaseOut)) }
                }
            }
        }
        // Positions are read a frame later, once the feedback has been laid out.
        androidx.compose.runtime.withFrameNanos { }
        val seal = spots.cardSeal
        val badge = spots.badge
        if (main && seal != null && badge != null) {
            // The recall edge: from the card's level to the badge, across the hinge.
            fx.edge(seal, badge, bend = -24f * density.density, drawMs = 220, color = c.pts, width = 1.5f * density.density, head = 3f * density.density, headColor = if (c.dark) c.light else c.ink0, fadeMs = 200, id = id)
        } else {
            spots.seal?.let { s -> launch { s.flash.animateTo(1f, tween(100)); s.flash.animateTo(0f, tween(100)) } }
        }
    }
    LaunchedEffect(ui.missKey) {
        val key = ui.missKey
        if (key == 0) return@LaunchedEffect
        val r = ui.result?.takeIf { !it.correct } ?: return@LaunchedEffect
        if (!spots.play("miss:$key")) return@LaunchedEffect
        val id = "miss:$key"
        feel?.miss(id, r.retry)
        var flying = false
        try {
            if (motion != MotionLevel.FULL) return@LaunchedEffect
            androidx.compose.runtime.withFrameNanos { }
            val seal = spots.cardSeal
            val badge = spots.badge
            if (main && seal != null && badge != null) {
                fx.edge(seal, badge, bend = -24f * density.density, drawMs = 160, color = c.ink2.copy(alpha = 0.5f), width = 1.5f * density.density, head = 0f, headColor = c.ink2, retractMs = 140, reach = 0.45f, dash = 4f * density.density, id = id)
            }
            // The retry node flies to the end of the bar, where the card coming back is drawn: it pops there as it lands.
            if (r.retry && badge != null) {
                flying = fx.motes(
                    badge, "queueEnd", 1, FxState.Shape.RING, c.held, 3.5f, 3.5f, seed = key, durMs = 360, delayMs = 180,
                    path = FxState.MotePath.ARC, apexDp = 15f, ease = EaseInOut, id = id,
                ) { _ -> spots.backLanded = maxOf(spots.backLanded, key); spots.slotPop++ } >= 0
            }
        } finally {
            if (!flying) spots.backLanded = maxOf(spots.backLanded, key)
        }
    }
    // The banked figure follows the session whenever no point is in flight (a new run, Calm, Still). After the
    // answer's own effect above, so a right answer's motes are counted in flight first.
    val points = ui.session?.points ?: 0.0
    LaunchedEffect(points) {
        if (spots.pointsInFlight > 0) return@LaunchedEffect
        if (!motion.moves || points < spots.banked.value) spots.banked.snapTo(points.toFloat())
        else spots.banked.animateTo(points.toFloat(), tween(200, easing = EaseOut))
    }
    LaunchedEffect(ui.levelUpKey) {
        val key = ui.levelUpKey
        if (key == 0) return@LaunchedEffect
        // Only a card that went up (the server sends levelTo with every answer).
        val r = ui.result?.takeIf { it.leveledUp } ?: return@LaunchedEffect
        val to = r.levelTo ?: return@LaunchedEffect
        val seal = spots.seal
        if (seal == null || !spots.play("card-level:$key")) {
            // Played already, or no seal to forge: the level line shows the level reached.
            spots.levelLine = maxOf(spots.levelLine, key)
            return@LaunchedEffect
        }
        val id = "card-level:$key"
        seal.holds++
        r.levelFrom?.let { seal.shownLevel = it }
        // L = the result + 300: the forge's notches on 300/400/500, the close on 600.
        feel?.forgeCard(id, 600)
        try {
            if (motion.moves) delay(300)
            seal.forge(to, null, squat = 0.92f, pop = 1.22f, hold = Dur.HOLD_MACRO, forgeMs = 300, motion = motion) {
                spots.scope.launch { delay(10); spots.levelLine = maxOf(spots.levelLine, key) }
                if (motion != MotionLevel.FULL) return@forge
                seal.center()?.let { p ->
                    val rr = seal.radius() * 0.68f
                    fx.shock(p, rr, rr * 2.6f, 3f * density.density, 360, c.light, hex = true, id = id, light = c.dark)
                    fx.rays(p, rr, c.light, id = id)
                    if (c.dark) fx.ring(p, rr, 6, c.gold, speedDp = 520f, drag = 6f, life = 0.35f, seed = key, id = id)
                }
            }
        } finally {
            seal.holds = (seal.holds - 1).coerceAtLeast(0)
            // Cut short (a tab switch, a fold): the line shows the level reached.
            spots.levelLine = maxOf(spots.levelLine, key)
        }
    }
    LaunchedEffect(ui.summaryKey) {
        if (ui.summaryKey == 0 || !spots.play("summary:${ui.summaryKey}")) return@LaunchedEffect
        val s = ui.session ?: return@LaunchedEffect
        val perfect = s.done > 0 && s.correctCount == s.done
        feel?.session("summary:${ui.summaryKey}", s.accuracy, perfect, SessionMoment.lastLit(SessionMoment.parts(s.accuracy, perfect)))
    }

    when (ui.phase) {
        ReviewViewModel.Phase.IDLE -> StartPanel(summary?.due, top, fatigued = summary?.fatigued, onStart = start)
        ReviewViewModel.Phase.LOADING -> Centered(top) { Text("Gathering your cards…", style = MaterialTheme.typography.titleMedium, color = c.ink1) }
        ReviewViewModel.Phase.EMPTY -> Centered(top) {
            if (ui.webOnly > 0) {
                // Due, but not here: a DIAGRAM card (an image to label) is reviewed on the web.
                EmptyNote(
                    "${Fmt.plural(ui.webOnly, "card")} due on the web",
                    (if (ui.webOnly == 1) "It is a diagram" else "They are diagrams") + " to label, which only the web app can review.",
                )
                XButton("Open the full app", {
                    nav.webPath = "/review"
                    nav.more = MoreRoute.WEB
                    nav.go(Tab.MORE)
                }, icon = Glyphs.Globe)
                Spacer(Modifier.height(8.dp))
            } else {
                EmptyNote("Nothing due", "Every card is resting. Come back when the next one is due.")
            }
            ui.note?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = c.ink2, textAlign = TextAlign.Center, modifier = Modifier.padding(bottom = 8.dp)) }
            XButton("Back to Check", onBackToCheck, kind = ButtonKind.QUIET)
        }
        ReviewViewModel.Phase.ERROR -> Centered(top) {
            Icon(Glyphs.Offline, null, tint = c.ink2, modifier = Modifier.size(36.dp))
            Spacer(Modifier.height(12.dp))
            Text(ui.error ?: "Couldn't load the cards.", style = MaterialTheme.typography.bodyLarge, color = c.ink1, textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            XButton("Retry", start, icon = Glyphs.Refresh)
        }
        ReviewViewModel.Phase.SUMMARY -> Summary(ui, top, spots, onMore = start, onDone = { vm.reset(); onBackToCheck() })
        else -> Runner(ui, vm, top, spots, twoPane = wl.mode.twoPane, tabletop = wl.mode.panes == Panes.TOP_BOTTOM)
    }
}

@Composable
private fun Centered(top: Dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = top + 16.dp, bottom = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center, content = content,
    )
}

/**
 * Review fatigue (blueprint P30): "Fatigued until 4:00 pm" while the server says one is in effect, with its note under it
 * when [note]; nothing otherwise. One TalkBack node. Read against [now] (the server's, when known), so a lifted one goes.
 */
@Composable
private fun FatigueNote(f: Fatigue?, now: Instant?, modifier: Modifier = Modifier, note: Boolean = true, center: Boolean = false) {
    val c = X.c
    val at = now ?: Instant.now()
    val until = FatigueLine.until(f, at) ?: return
    val h24 = DateFormat.is24HourFormat(LocalContext.current)
    val align = if (center) TextAlign.Center else TextAlign.Start
    Column(
        modifier.clearAndSetSemantics { contentDescription = FatigueLine.describe(until, at, h24 = h24) },
        horizontalAlignment = if (center) Alignment.CenterHorizontally else Alignment.Start,
    ) {
        Text(FatigueLine.line(until, at, h24 = h24), style = MaterialTheme.typography.labelLarge, color = c.ink1, textAlign = align)
        if (note) Text(FatigueLine.NOTE, style = MaterialTheme.typography.bodySmall, color = c.ink2, textAlign = align)
    }
}

@Composable
private fun StartPanel(due: Int?, top: Dp, fatigued: Fatigue?, onStart: () -> Unit) {
    val c = X.c
    Column(Modifier.fillMaxSize().padding(start = 20.dp, end = 20.dp, top = top + 8.dp)) {
        Text("Review", style = MaterialTheme.typography.headlineMedium, color = c.ink0)
        Spacer(Modifier.weight(1f))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Glyphs.Review, null, tint = c.pts, modifier = Modifier.size(44.dp))
            Spacer(Modifier.height(12.dp))
            Text(if (due != null && due > 0) "$due due" else "Ready when you are", style = MaterialTheme.typography.headlineSmall, color = c.ink0)
            Text("Answers are graded on the server, the same as the web.", style = MaterialTheme.typography.bodyMedium, color = c.ink2, textAlign = TextAlign.Center)
            // P30: /check's review.fatigued (the phone's clock stands in for the server's here: /check's `now` is not passed in).
            FatigueNote(fatigued, null, Modifier.padding(top = 16.dp), center = true)
        }
        Spacer(Modifier.weight(1f))
        XButton(
            "Start review", onStart,
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars.only(WindowInsetsSides.Bottom)).padding(bottom = 16.dp),
            icon = Glyphs.Review,
        )
    }
}

// ── The runner ──────────────────────────────────────────────────────────────

/**
 * The card on show: its key (the run, the card and how many answers came before it), whether it was just missed, whether it
 * is a card coming back, its result in the feedback, and the blanks typed into it. Each AnimatedContent target keeps
 * its own, so a card leaving keeps the header and level it had (the next card's state never leaks into it).
 */
private data class Showing(
    val card: ReviewCard, val key: String, val missed: Boolean, val first: Boolean, val again: Boolean, val result: AnswerResult?,
    val blanks: List<String>,
)

/** The feedback on show: the card it answers, its result and its moment's key. */
private data class Shown(val card: ReviewCard, val result: AnswerResult, val key: String)

@Composable
private fun Runner(ui: ReviewViewModel.Ui, vm: ReviewViewModel, top: Dp, spots: ReviewSpots, twoPane: Boolean, tabletop: Boolean) {
    val c = X.c
    val motion = LocalMotion.current
    val density = LocalDensity.current
    val shown: ReviewCard = (if (ui.phase == ReviewViewModel.Phase.FEEDBACK) ui.answered else ui.card) ?: return
    val feedback = ui.phase == ReviewViewModel.Phase.FEEDBACK
    val answeredBefore = (ui.session?.answered?.size ?: 0).let { if (feedback) it - 1 else it }
    val result = ui.result?.takeIf { feedback }
    val showing = Showing(
        shown, "${ui.run}:${shown.ideaId}#$answeredBefore", missed = result?.correct == false, first = answeredBefore == 0,
        again = if (feedback) ui.answeredWasRetry else ui.session?.isAgain(shown.ideaId) == true, result = result, blanks = ui.draft.blanks,
    )
    val cardKey = "${shown.ideaId}#${ui.session?.done ?: 0}#${if (feedback) "f" else "a"}"
    val main = twoPane && !tabletop
    val enterPx = with(density) { (if (main) 32.dp else 28.dp).roundToPx() }
    val exitPx = with(density) { 24.dp.roundToPx() }
    val calmPx = with(density) { 8.dp.roundToPx() }
    val promptCard: @Composable (Modifier) -> Unit = { m ->
        // Answer → feedback is the same card (the same key): only a new card animates in. A fade-through: the old
        // card is gone (75 ms, EaseOut) before the new one shows (from T + 65), so two prompts never overlap; the new
        // one's slide still starts at T + 40. A missed card leaves in place (scale .96 and the fade, no slide).
        AnimatedContent(
            targetState = showing,
            contentKey = { it.key },
            transitionSpec = {
                val missed = initialState.missed
                when (motion) {
                    MotionLevel.FULL -> fadeIn(tween(140, delayMillis = 65, easing = EaseOut)) togetherWith
                        (fadeOut(tween(75, easing = EaseOut)) +
                            (if (missed) scaleOut(tween(120, easing = EaseIn), targetScale = 0.96f) else slideOutHorizontally(tween(120, easing = EaseIn)) { -exitPx }))
                    MotionLevel.CALM -> (fadeIn(tween(140, delayMillis = 60, easing = EaseOut)) + slideInHorizontally(tween(140, delayMillis = 60, easing = EaseOut)) { calmPx }) togetherWith
                        fadeOut(tween(70, easing = EaseOut))
                    MotionLevel.STILL -> fadeIn(tween(0)) togetherWith fadeOut(tween(0))
                } using null
            },
            label = "card",
        ) { sh ->
            PromptCard(sh, ui, spots, current = sh.key == showing.key, enterPx = enterPx, modifier = m)
        }
    }
    // The input fades in with each new card (from T + 60, 140 ms); it is never re-created, so a focused field keeps its
    // keyboard. A new card's input is unseen from its first frame (before its fade starts).
    val inputIn = remember { Animatable(1f) }
    var inputKey by remember { mutableStateOf(showing.key) }
    val inputWaits = showing.key != inputKey && motion.moves
    LaunchedEffect(showing.key) {
        if (showing.key == inputKey) return@LaunchedEffect
        if (motion.moves) inputIn.snapTo(0f)
        inputKey = showing.key
        if (!motion.moves) return@LaunchedEffect
        delay(60)
        inputIn.animateTo(1f, tween(140, easing = EaseOut))
    }
    val inputAlpha = { if (inputWaits) 0f else inputIn.value }
    val input: @Composable () -> Unit = {
        // On the main display a text card's field stays (read only) under its feedback, so the keyboard never drops between cards.
        val keep = main && feedback && CardKind.of(shown.type).let { it == CardKind.SHORT || it == CardKind.NUMERIC || it == CardKind.FORMULA }
        if (!feedback || keep) {
            Column(Modifier.graphicsLayer { alpha = inputAlpha() }) {
                if (!feedback) ui.note?.let { Text(it, color = c.ink2, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp)) }
                AnswerInput(
                    shown, ui.draft, vm, enabled = ui.phase == ReviewViewModel.Phase.ANSWERING || keep, readOnly = keep, error = ui.submitError.takeIf { !feedback },
                    enterKey = showing.key, spots = spots,
                )
            }
        }
    }
    val fb = result?.let { r -> Shown(shown, r, if (r.correct) "c${ui.correctKey}" else "m${ui.missKey}") }
    val feedbackPanel: @Composable () -> Unit = {
        // The feedback fades out (90 ms) with the card it answers, instead of leaving the old prompt alone on an empty
        // screen; it comes in by its own moment.
        AnimatedContent(
            targetState = fb,
            contentKey = { it?.key },
            transitionSpec = { EnterTransition.None togetherWith (if (motion.moves) fadeOut(tween(90, easing = EaseOut)) else ExitTransition.None) using null },
            label = "feedback",
        ) { f ->
            if (f != null) FeedbackPanel(f.card, f.result, f.key, ui, spots)
        }
    }
    val action: @Composable (Modifier) -> Unit = { m ->
        BottomAction(ui, vm, m)
    }

    if (!twoPane) {
        Column(Modifier.fillMaxSize()) {
            SessionBar(ui, top, spots, onEnd = vm::finish)
            val scroll = rememberScrollState()
            LaunchedEffect(cardKey) { scroll.scrollTo(0) }
            Column(Modifier.weight(1f).verticalScroll(scroll).padding(horizontal = 16.dp, vertical = 8.dp)) {
                promptCard(Modifier)
                Spacer(Modifier.height(12.dp))
                // The input and the feedback share one place: the feedback fades out where it was as the next input comes up.
                Box {
                    input()
                    feedbackPanel()
                }
                Spacer(Modifier.height(12.dp))
            }
            action(Modifier)
        }
    } else if (tabletop) {
        // Tabletop: the card stands on the top half; you answer on the bottom half.
        TwoPane(
            first = {
                Column(Modifier.fillMaxSize()) {
                    SessionBar(ui, top, spots, onEnd = vm::finish)
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp)) { promptCard(Modifier) }
                }
            },
            second = {
                Column(Modifier.fillMaxSize()) {
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp)) {
                        Box {
                            input()
                            feedbackPanel()
                        }
                    }
                    action(Modifier)
                }
            },
        )
    } else {
        TwoPane(
            first = {
                Column(Modifier.fillMaxSize()) {
                    SessionBar(ui, top, spots, onEnd = vm::finish)
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 6.dp, top = 8.dp, bottom = 8.dp)) {
                        promptCard(Modifier)
                        Spacer(Modifier.height(12.dp))
                        input()
                    }
                    action(Modifier)
                }
            },
            second = {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 6.dp, end = 20.dp, top = top + 16.dp, bottom = 16.dp)) {
                    // As in one column: the feedback fades out in place, the waiting note comes up with the next input.
                    Box {
                        if (!feedback) Box(Modifier.graphicsLayer { alpha = inputAlpha() }) { WaitingSide(ui) }
                        feedbackPanel()
                    }
                    Spacer(Modifier.height(16.dp))
                    SessionStats(ui)
                }
            },
        )
    }
}

/** A session bar slot's radius. */
private val SLOT_R = 2.5.dp

/**
 * The session bar: answered of the total (rolling), the combo's node-X pill, the banked points (each point mote
 * counts its share as it lands), and the progress line with a slot per answer (a points dot for a recall, a hollow
 * held ring for a miss) and, at its end, a hollow held ring while a missed card waits to come back: the retry node
 * lands there and it pops. Composed again (a tab switch, a fold), it shows all this at rest.
 */
@Composable
private fun SessionBar(ui: ReviewViewModel.Ui, top: Dp, spots: ReviewSpots, onEnd: () -> Unit) {
    val c = X.c
    val motion = LocalMotion.current
    val s = ui.session ?: return
    val feedback = ui.phase == ReviewViewModel.Phase.FEEDBACK
    val r = ui.result
    // The missed card's node is still on its way to the end: the total and the end ring wait for it.
    val back = ui.answered?.ideaId
    val flying = motion == MotionLevel.FULL && feedback && r != null && !r.correct && r.retry && s.queue.lastOrNull()?.ideaId == back &&
        spots.backLanded < ui.missKey
    val total = s.total - if (flying) 1 else 0
    val waiting = s.queue.withIndex().any { (i, q) -> s.isAgain(q.ideaId) && (i > 0 || feedback) && !(flying && q.ideaId == back) }
    val progress = remember { Animatable(s.progress) }
    val glint = remember { Animatable(0f) }
    LaunchedEffect(s.done, total) {
        val to = if (total == 0) 1f else s.done.toFloat() / total
        if (progress.value == to) return@LaunchedEffect
        if (!motion.moves) { progress.snapTo(to); return@LaunchedEffect }
        coroutineScope {
            if (motion == MotionLevel.FULL) launch { glint.animateTo(1f, tween(60)); delay(110); glint.animateTo(0f, tween(120)) }
            progress.animateTo(to, if (motion == MotionLevel.FULL) Spr.glide.spec() else tween(160, easing = EaseOut))
        }
    }
    // The newest slot pops as its answer comes; the end ring as a retry node lands. Only on a change seen here.
    val pop = remember { Animatable(1f) }
    val endPop = remember { Animatable(1f) }
    val newest = s.answered.size
    var seenNewest by remember { mutableIntStateOf(newest) }
    var seenLanding by remember { mutableIntStateOf(spots.slotPop) }
    LaunchedEffect(newest) {
        if (newest == seenNewest) return@LaunchedEffect
        seenNewest = newest
        if (newest == 0 || motion != MotionLevel.FULL) return@LaunchedEffect
        pop.snapTo(0f)
        pop.animateTo(1f, Spr.bead.spec())
    }
    LaunchedEffect(spots.slotPop) {
        if (spots.slotPop == seenLanding) return@LaunchedEffect
        seenLanding = spots.slotPop
        if (motion != MotionLevel.FULL) return@LaunchedEffect
        endPop.snapTo(0f)
        endPop.animateTo(1f, Spr.bead.spec())
    }
    val slotStroke = with(LocalDensity.current) { remember { Stroke(1.5.dp.toPx()) } }
    val figBump = rememberBump(spots.bankedBump, 6f)
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = top + 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val style = MaterialTheme.typography.labelLarge.figures()
            RollingNumber(s.done, style = style, color = c.ink1)
            Text(" / ", style = style, color = c.ink1)
            RollingNumber(total, style = style, color = c.ink1)
            Spacer(Modifier.width(12.dp))
            ComboX(s.combo)
            Spacer(Modifier.width(8.dp))
            // Always laid out (the points motes' target), shown once there are points.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .onGloballyPositioned { spots.pts = it }
                    .graphicsLayer { val k = figBump(); scaleX = k; scaleY = k; alpha = if (spots.banked.value > 0f || s.points > 0) 1f else 0f },
            ) {
                Icon(Glyphs.Lozenge, null, tint = c.pts, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(3.dp))
                BankedFigure(spots, style)
            }
            Spacer(Modifier.weight(1f))
            // Not while an answer is grading: its result would land on the summary.
            XIconButton(Glyphs.Close, "End session", onEnd, enabled = ui.phase != ReviewViewModel.Phase.SUBMITTING)
        }
        val answered = s.answered
        val light = c.light
        Canvas(Modifier.fillMaxWidth().height(8.dp).onGloballyPositioned { spots.bar = it }) {
            val h = 4.dp.toPx()
            val y0 = (size.height - h) / 2
            drawRoundRect(c.line2, topLeft = Offset(0f, y0), size = size.copy(height = h), cornerRadius = CornerRadius(h / 2))
            val w = size.width * progress.value.coerceIn(0f, 1f)
            drawRoundRect(c.pts, topLeft = Offset(0f, y0), size = size.copy(width = w, height = h), cornerRadius = CornerRadius(h / 2))
            val g = glint.value
            if (g > 0f) drawCircle(light, 2.dp.toPx(), Offset(w, size.height / 2), alpha = g)
            val sr = SLOT_R.toPx()
            // A slot per answer (up to 40; past that, the line and its head say it).
            if (answered.size in 1..40 && total > 0) {
                for (k in answered.indices) {
                    val a = answered[k]
                    val x = (size.width * (k + 1) / total).coerceAtMost(size.width - sr)
                    val sc = if (k == answered.lastIndex) pop.value else 1f
                    if (a.correct) drawCircle(c.pts, sr * sc, Offset(x, size.height / 2))
                    else drawCircle(c.held, sr * sc, Offset(x, size.height / 2), style = slotStroke)
                }
            }
            // A card coming back, at the end of the line (where its retry node landed: the "queueEnd" anchor).
            if (waiting) drawCircle(c.held, sr * endPop.value, Offset(size.width - sr, size.height / 2), style = slotStroke)
        }
        // P30: review fatigue as this run's queue said it, one line under the bar (its note is on the Start panel).
        FatigueNote(ui.fatigued, TimeLabels.parseInstant(ui.now), Modifier.padding(top = 2.dp, end = 8.dp), note = false)
    }
}

/** The banked points: only this figure recomposes as it counts. */
@Composable
private fun BankedFigure(spots: ReviewSpots, style: androidx.compose.ui.text.TextStyle) {
    Text(Fmt.figure(spots.banked.value.toDouble()) + " pts", style = style, color = X.c.ink1)
}

/**
 * The card (moment 3): a new one comes in from the side (or rises, the session's first), its level hexagon
 * stamps in, and a card coming back says "Again" with a held rim pulse. A miss flashes its rim; the card itself
 * never moves under the words being read. Each plays once: composed again (a tab switch, a fold), it is at rest.
 * Its state is its own [sh] (a card leaving keeps what it showed); only the [current] one is the moments' seal.
 */
@Composable
private fun PromptCard(sh: Showing, ui: ReviewViewModel.Ui, spots: ReviewSpots, current: Boolean, enterPx: Int, modifier: Modifier = Modifier) {
    val c = X.c
    val motion = LocalMotion.current
    val full = motion == MotionLevel.FULL
    val card = sh.card
    val enterKey = sh.key
    val first = sh.first
    val again = sh.again
    val result = sh.result
    val play = remember(enterKey) { full && spots.fresh("card:$enterKey") }
    val enter = remember(enterKey) { Animatable(if (play) 1f else 0f) }
    val shadow = remember(enterKey) { Animatable(if (play) 0f else 1f) }
    val againStamp = remember(enterKey) { Animatable(if (play && again) 0f else 1f) }
    val rimHeld = remember(enterKey) { Animatable(0f) }
    val rimOwed = remember { Animatable(0f) }
    val rimPlay = remember(ui.missKey) { spots.fresh("rim:${ui.missKey}") }
    val seal = remember(enterKey) { SealState(card.level ?: 1, 0f) }
    SideEffect { if (current) spots.seal = seal }
    LaunchedEffect(enterKey) {
        if (!play) return@LaunchedEffect
        spots.play("card:$enterKey")
        coroutineScope {
            launch { delay(40); enter.animateTo(0f, if (first) Spr.settle.spec() else spring(0.82f, 520f)) }
            launch { delay(40); shadow.animateTo(1f, tween(200)) }
            // T + 140: the level hexagon stamps in.
            launch {
                seal.enter.snapTo(0.7f); seal.enterAlpha.snapTo(0f)
                delay(140)
                launch { seal.enterAlpha.animateTo(1f, tween(120)) }
                seal.enter.stamp(1.08f)
            }
            if (again) {
                launch { rimHeld.snapTo(0.6f); rimHeld.animateTo(0f, tween(500, easing = EaseOut)) }
                launch { delay(180); againStamp.snapTo(1.4f); againStamp.stamp(0.96f, upMs = 80, ease = EaseIn) }
            }
        }
    }
    LaunchedEffect(ui.missKey) {
        if (ui.missKey == 0 || result?.correct != false || !motion.moves || !rimPlay || !current) return@LaunchedEffect
        spots.play("rim:${ui.missKey}")
        rimOwed.animateTo(0.5f, tween(60))
        rimOwed.animateTo(0f, tween(if (full) 240 else 140))
    }
    val owed = c.owed
    val held = c.held
    val enterPxF = enterPx.toFloat()
    Box(
        modifier
            .fillMaxWidth()
            .onGloballyPositioned { if (current) spots.card = it }
            .graphicsLayer {
                if (first) translationY = enter.value * 16.dp.toPx() else translationX = enter.value * enterPxF
                // The shadow lives in the layer: no recomposition as it grows.
                shadowElevation = shadow.value * 6.dp.toPx()
                shape = CardShape
                clip = false
            }
            .clip(CardShape)
            .background(c.card)
            .border(1.dp, c.line2, CardShape)
            .drawWithCache {
                val outline = CardShape.createOutline(size, layoutDirection, this)
                val path = Path().apply { addOutline(outline) }
                val stroke = Stroke(2.dp.toPx())
                onDrawWithContent {
                    drawContent()
                    if (rimOwed.value > 0f) drawPath(path, owed, alpha = rimOwed.value, style = stroke)
                    if (rimHeld.value > 0f) drawPath(path, held, alpha = rimHeld.value, style = stroke)
                }
            }
            .padding(18.dp)
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Eyebrow(listOfNotNull(card.domain, card.field).joinToString(" › ").ifEmpty { kindWord(card) })
                    Spacer(Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(kindWord(card), style = MaterialTheme.typography.labelMedium, color = c.ink2)
                        if (again) {
                            Spacer(Modifier.width(8.dp))
                            Box(
                                Modifier
                                    .graphicsLayer { scaleX = againStamp.value; scaleY = againStamp.value; alpha = (againStamp.value * 4f).coerceIn(0f, 1f) }
                                    .clip(PillShape).background(c.wash(c.held)).padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text("Again", style = MaterialTheme.typography.labelMedium, color = c.held)
                            }
                        }
                    }
                }
                val level = if (result?.levelTo != null && result.leveledUp) result.levelTo else card.level
                if (level != null) {
                    LevelSeal(
                        level, null, size = 44.dp, state = seal,
                        modifier = Modifier.onGloballyPositioned { if (current) spots.cardSeal = it.boundsInRoot().center },
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            if (CardKind.of(card.type) == CardKind.CLOZE) {
                ClozePrompt(card.prompt, sh.blanks)
            } else {
                // Math only where the server says so (FORMULA prompts, \( … \) and \[ … \]); any other prompt is plain text.
                MathText(card.prompt, hasMath = card.promptHasMath, style = MaterialTheme.typography.titleLarge.copy(fontFamily = FontFamily.Default))
            }
            card.unit?.takeIf { CardKind.of(card.type) == CardKind.NUMERIC }?.let {
                Spacer(Modifier.height(6.dp))
                Text("Answer in $it", style = MaterialTheme.typography.labelMedium, color = c.ink2)
            }
        }
    }
}

private fun kindWord(card: ReviewCard) = when (CardKind.of(card.type)) {
    CardKind.SHORT -> "Short answer"
    CardKind.NUMERIC -> "A number"
    CardKind.FORMULA -> "A formula"
    CardKind.MCQ -> "Pick one"
    CardKind.LIST -> "Name them all"
    CardKind.ORDER -> "Put in order"
    CardKind.CLOZE -> "Fill the blanks"
}

/**
 * A cloze sentence with its numbered markers ([1], [2] …, or an old `____`)
 * drawn as inline blanks: each shows its number until its field is filled,
 * then what was typed, so the sentence reads back as you go.
 */
@Composable
private fun ClozePrompt(prompt: String, blanks: List<String>) {
    val c = X.c
    val text = remember(prompt, blanks, c) {
        androidx.compose.ui.text.buildAnnotatedString {
            var n = 0
            var last = 0
            for (m in Regex("""\[(\d+)]|_{3,}""").findAll(prompt)) {
                append(prompt.substring(last, m.range.first))
                n++
                val index = m.groupValues[1].toIntOrNull() ?: n
                val typed = blanks.getOrNull(index - 1)?.trim().orEmpty()
                withStyle(
                    androidx.compose.ui.text.SpanStyle(
                        background = if (typed.isEmpty()) c.raised else c.wash(c.ink0, 0.1f),
                        color = if (typed.isEmpty()) c.ink2 else c.ink0,
                        textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
                        fontFeatureSettings = "tnum",
                    )
                ) { append(if (typed.isEmpty()) " $index " else " $typed ") }
                last = m.range.last + 1
            }
            append(prompt.substring(last))
        }
    }
    Text(text, style = MaterialTheme.typography.titleLarge, color = c.ink0)
}

// ── Inputs per type ─────────────────────────────────────────────────────────

@Composable
private fun AnswerInput(card: ReviewCard, d: AnswerDraft, vm: ReviewViewModel, enabled: Boolean, error: String?, readOnly: Boolean = false, enterKey: String, spots: ReviewSpots) {
    val c = X.c
    val feel = LocalFeel.current
    val motion = LocalMotion.current
    val focus = remember(card.ideaId) { FocusRequester() }
    val submit = { vm.submit() }
    val enterSubmits = Modifier.onPreviewKeyEvent { e ->
        if (e.type == KeyEventType.KeyDown && (e.key == Key.Enter || e.key == Key.NumPadEnter)) { submit(); true } else false
    }
    // Focus at T + 60, so the keyboard rises with the card (at once in Still).
    val focusDelay = if (motion.moves) 60L else 0L
    when (CardKind.of(card.type)) {
        CardKind.SHORT, CardKind.FORMULA, CardKind.NUMERIC -> {
            val kind = CardKind.of(card.type)
            XField(
                d.text, { v -> vm.edit { it.copy(text = v) } }, Modifier.fillMaxWidth(),
                label = when (kind) { CardKind.NUMERIC -> "Your value" + (card.unit?.let { " ($it)" } ?: ""); CardKind.FORMULA -> "Your formula"; else -> "Your answer" },
                placeholder = when (kind) { CardKind.NUMERIC -> "0.0"; CardKind.FORMULA -> "sqrt(x^2 + y^2)"; else -> "Type it from memory" },
                mono = kind != CardKind.SHORT,
                enabled = enabled,
                readOnly = readOnly,
                minHeight = 56.dp,
                keyboardOptions = KeyboardOptions(
                    imeAction = ImeAction.Done,
                    keyboardType = when (kind) { CardKind.NUMERIC -> KeyboardType.Decimal; CardKind.FORMULA -> KeyboardType.Ascii; else -> KeyboardType.Text },
                ),
                keyboardActions = KeyboardActions(onDone = { if (readOnly) vm.next() else submit() }),
                fieldModifier = Modifier.focusRequester(focus).then(enterSubmits),
            )
            LaunchedEffect(card.ideaId) { delay(focusDelay); runCatching { focus.requestFocus() } }
        }
        CardKind.MCQ -> {
            // Once per showing of the card: composed again (a tab switch, a fold), the options are at rest.
            val stagger = remember(enterKey) { motion == MotionLevel.FULL && spots.fresh("options:$enterKey") }
            LaunchedEffect(enterKey) { if (stagger) spots.play("options:$enterKey") }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                card.options.orEmpty().forEachIndexed { i, opt ->
                    // Each option fades up in turn (from T + 100, 30 ms apart): tappable from the first frame.
                    val k = remember(enterKey) { Animatable(if (stagger) 0f else 1f) }
                    LaunchedEffect(enterKey) {
                        if (!stagger) return@LaunchedEffect
                        delay(100L + 30L * i)
                        k.animateTo(1f, tween(160, easing = EaseOut))
                    }
                    OptionButton(opt, selected = d.choice == i, enabled = enabled, modifier = Modifier.graphicsLayer { alpha = k.value; translationY = (1f - k.value) * 8.dp.toPx() }) {
                        feel?.select()
                        vm.edit { it.copy(choice = i) }
                        vm.submit()
                    }
                }
            }
        }
        CardKind.LIST -> {
            Eyebrow("Your list · any order", Modifier.padding(start = 4.dp, bottom = 6.dp))
            val focuses = remember(card.ideaId, d.rows.size) { List(d.rows.size) { FocusRequester() } }
            d.rows.forEachIndexed { i, row ->
                XField(
                    row, { v -> vm.edit { it.copy(rows = it.rows.toMutableList().also { l -> l[i] = v }) } },
                    Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    placeholder = "Item ${i + 1}", enabled = enabled,
                    keyboardOptions = KeyboardOptions(imeAction = if (i == d.rows.lastIndex) ImeAction.Done else ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { runCatching { focuses[i + 1].requestFocus() } }, onDone = { submit() }),
                    fieldModifier = Modifier.focusRequester(focuses[i]),
                )
            }
            LaunchedEffect(card.ideaId) { delay(focusDelay); runCatching { focuses.firstOrNull()?.requestFocus() } }
        }
        CardKind.ORDER -> ReorderList(d.order, enabled) { from, to ->
            feel?.select()
            vm.edit { it.copy(order = AnswerShape.move(it.order, from, to)) }
        }
        CardKind.CLOZE -> {
            val focuses = remember(card.ideaId, d.blanks.size) { List(d.blanks.size) { FocusRequester() } }
            d.blanks.forEachIndexed { i, b ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                    Box(Modifier.size(32.dp).clip(CtlShape).background(c.raised), contentAlignment = Alignment.Center) {
                        Text("${i + 1}", style = MaterialTheme.typography.labelLarge, color = c.ink1)
                    }
                    Spacer(Modifier.width(8.dp))
                    XField(
                        b, { v -> vm.edit { it.copy(blanks = it.blanks.toMutableList().also { l -> l[i] = v }) } }, Modifier.weight(1f),
                        placeholder = "Blank ${i + 1}", enabled = enabled,
                        keyboardOptions = KeyboardOptions(imeAction = if (i == d.blanks.lastIndex) ImeAction.Done else ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { runCatching { focuses[i + 1].requestFocus() } }, onDone = { submit() }),
                        fieldModifier = Modifier.focusRequester(focuses[i]),
                    )
                }
            }
            LaunchedEffect(card.ideaId) { delay(focusDelay); runCatching { focuses.firstOrNull()?.requestFocus() } }
        }
    }
    error?.let {
        Text(it, color = c.owed, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp, start = 4.dp))
    }
}

@Composable
private fun OptionButton(text: String, selected: Boolean, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = X.c
    val motion = LocalMotion.current
    val sel by animateFloatAsState(if (selected) 1f else 0f, motion.spr(Spr.fx), label = "opt")
    val raised = c.raised
    val chosen = c.wash(c.ink0, 0.16f).compositeOver(c.raised)
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .clip(CtlShape)
            .drawBehind { drawRect(androidx.compose.ui.graphics.lerp(raised, chosen, sel)) }
            .border(if (selected) 1.5.dp else 1.dp, if (selected) c.ink1 else c.line2, CtlShape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(text, style = MaterialTheme.typography.titleMedium, color = c.ink0)
    }
}

private fun Color.compositeOver(bg: Color): Color {
    val a = alpha
    return Color(red * a + bg.red * (1 - a), green * a + bg.green * (1 - a), blue * a + bg.blue * (1 - a), 1f)
}

/**
 * ORDER: drag the handle to move a step (each slot crossed ticks), or use
 * the up/down buttons. The row being dragged lifts above the others.
 */
@Composable
private fun ReorderList(items: List<String>, enabled: Boolean, onMove: (Int, Int) -> Unit) {
    val c = X.c
    val density = LocalDensity.current
    val current by rememberUpdatedState(items)
    val move by rememberUpdatedState(onMove)
    // A row is its step and which of the equal steps it is: two steps may read the same ("wash", "rinse", "wash").
    var dragging by remember { mutableStateOf<Pair<String, Int>?>(null) }
    var offset by remember { mutableFloatStateOf(0f) }
    var slot by remember { mutableIntStateOf(with(density) { 68.dp.roundToPx() }) }
    Eyebrow("Drag into order · first at the top", Modifier.padding(start = 4.dp, bottom = 6.dp))
    Column {
        items.forEachIndexed { i, item ->
            val row = item to AnswerShape.occurrence(items, i)
            key(row) {
                val lifted = dragging == row
                Row(
                    Modifier
                        .zIndex(if (lifted) 1f else 0f)
                        .onSizeChanged { slot = it.height }
                        .graphicsLayer {
                            translationY = if (lifted) offset else 0f
                            val s = if (lifted) 1.03f else 1f
                            scaleX = s; scaleY = s
                            shadowElevation = if (lifted) 8.dp.toPx() else 0f
                            shape = CtlShape
                            clip = false
                        }
                        .padding(bottom = 8.dp)
                        .fillMaxWidth()
                        .heightIn(min = 60.dp)
                        .clip(CtlShape)
                        .background(if (lifted) c.overlay else c.raised)
                        .border(1.dp, if (lifted) c.ink2 else c.line2, CtlShape)
                        .padding(start = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("${i + 1}", style = MaterialTheme.typography.labelLarge.figures(), color = c.ink2, modifier = Modifier.width(24.dp))
                    Text(item, style = MaterialTheme.typography.titleMedium, color = c.ink0, modifier = Modifier.weight(1f).padding(vertical = 12.dp))
                    XIconButton(Glyphs.Up, "Move up", { onMove(i, i - 1) }, size = 44.dp, enabled = enabled && i > 0)
                    XIconButton(Glyphs.Down, "Move down", { onMove(i, i + 1) }, size = 44.dp, enabled = enabled && i < items.lastIndex)
                    Box(
                        Modifier
                            .size(48.dp)
                            .pointerInput(row, enabled) {
                                if (!enabled) return@pointerInput
                                detectVerticalDragGestures(
                                    onDragStart = { dragging = row; offset = 0f },
                                    onDragEnd = { dragging = null; offset = 0f },
                                    onDragCancel = { dragging = null; offset = 0f },
                                ) { change, dy ->
                                    change.consume()
                                    offset += dy
                                    val at = AnswerShape.indexOfOccurrence(current, row.first, row.second)
                                    if (at >= 0 && offset > slot / 2f && at < current.lastIndex) {
                                        move(at, at + 1); offset -= slot
                                    } else if (at > 0 && offset < -slot / 2f) {
                                        move(at, at - 1); offset += slot
                                    }
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Glyphs.Drag, "Drag to reorder", tint = c.ink2, modifier = Modifier.size(22.dp))
                    }
                }
            }
        }
    }
}

// ── Feedback ────────────────────────────────────────────────────────────────

/**
 * The feedback (moments 4 and 5). Correct: the badge checks as a task does (the strongest of the three), "Correct"
 * rises in, the points count up, the combo chip rolls and bumps by tier (a milestone stamps and rings it). A miss:
 * the badge pops in and shakes its head, "Not quite" rises, the expected answer settles under a held wash, and a
 * card coming back says so with its arrow turning. Still: the words, announced. It plays once per answer ([key]):
 * composed again (a tab switch, a fold), it is shown at rest, its badge already checked.
 */
@Composable
private fun FeedbackPanel(card: ReviewCard, r: AnswerResult, key: String, ui: ReviewViewModel.Ui, spots: ReviewSpots) {
    val c = X.c
    val motion = LocalMotion.current
    val fx = LocalFx.current
    val density = LocalDensity.current
    val play = remember(key) { motion.moves && spots.fresh("feedback:$key") }
    val full = play && motion == MotionLevel.FULL
    val moves = play
    val combo = r.comboNext
    val tier = ComboMoment.tier(combo)
    // The words: a 6 dp rise and a fade (60–220), the answer and the why after them (100–280).
    val title = remember(key) { Animatable(if (moves) 0f else 1f) }
    val body = remember(key) { Animatable(if (moves) 0f else 1f) }
    val lozenge = remember(key) { Animatable(if (full) 0f else 90f) }
    val wash = remember(key) { Animatable(if (moves || r.correct) 0f else 0.10f) }
    val badgeIn = remember(key) { Animatable(if (moves) 0f else 1f) }
    val arrow = remember(key) { Animatable(if (full) -30f else 0f) }
    val shake = remember(key) { Animatable(0f) }
    val chip = remember(key) { Animatable(1f) }
    val retryIn = remember(key) { Animatable(if (moves) 0f else 1f) }
    val retryTurn = remember(key) { Animatable(if (full) -180f else 0f) }
    var chipAt by remember { mutableStateOf<LayoutCoordinates?>(null) }
    LaunchedEffect(key) {
        if (!moves) return@LaunchedEffect
        spots.play("feedback:$key")
        coroutineScope {
            launch { delay(if (r.correct) 60 else 40); title.animateTo(1f, tween(if (full) 160 else 120, easing = EaseOut)) }
            launch { delay(if (r.correct) 100 else 60); body.animateTo(1f, tween(if (full) 180 else 120, easing = EaseOut)) }
            if (r.correct) {
                launch { delay(100); lozenge.animateTo(90f, Spr.stamp.spec()) }
                if (combo > 1) launch {
                    delay(ComboMoment.COMBO_AT.toLong())
                    if (full && ComboMoment.milestone(combo)) {
                        chip.snapTo(1.3f)
                        launch {
                            chipAt?.visibleCenter()?.let { p -> fx.ring(p, 24f * density.density, 12, c.gold, speedDp = 72f, drag = 3f, life = 0.42f, seed = combo) }
                        }
                        chip.stamp(0.96f, upMs = 80, ease = EaseIn)
                    } else chip.bump(ComboMoment.chipImpulse(tier), motion)
                }
            } else {
                if (full) {
                    launch { badgeIn.snapTo(0.8f); badgeIn.animateTo(1f, spring(0.7f, 600f)) }
                    launch { arrow.animateTo(0f, Spr.settle.spec()) }
                    // The head-shake: an impulse into the shake spring (−6 dp at ~160 ms, then +2.2, −0.8).
                    launch { delay(120); shake.animateTo(0f, Spr.shake.spec(), initialVelocity = -300f) }
                    launch { delay(120); wash.animateTo(0.16f, tween(200, easing = EaseOut)); wash.animateTo(0.10f, tween(280, easing = EaseInOut)) }
                } else {
                    launch { badgeIn.animateTo(1f, tween(140)) }
                    launch { wash.animateTo(0.10f, tween(120)) }
                }
                if (r.retry) launch {
                    delay(if (full) 160 else 0)
                    launch { retryIn.animateTo(1f, if (full) Spr.settle.spec() else tween(140)) }
                    if (full) retryTurn.animateTo(0f, Spr.settle.spec())
                }
            }
        }
    }
    val levelLine = spots.levelLine
    val announce = when {
        r.correct -> "Correct" + (if (r.xp > 0) ", plus ${Fmt.figure(r.xp)} points" else "") + (if (combo > 1) ", combo times $combo" else "")
        else -> "Not quite." + (r.expectedText?.let { " Expected: $it." } ?: "") + (if (r.retry) " Back at the end." else "")
    }
    Column(Modifier.fillMaxWidth().padding(top = 4.dp).semantics { liveRegion = LiveRegionMode.Polite; contentDescription = announce }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(56.dp)
                    .onGloballyPositioned { spots.badge = it.boundsInRoot().center },
                contentAlignment = Alignment.Center,
            ) {
                if (r.correct) {
                    // The same check as a kept task, at its strongest: the impact's shock and streaks are the overlay's.
                    CheckCircle(
                        true, size = 42.dp, ring = Color.Transparent, fill = c.kept, mark = c.onKept, stamp = StampSpec.Correct, enter = play,
                        onImpact = { p ->
                            if (!full) return@CheckCircle
                            val px = density.density
                            val id = "correct:${ui.correctKey}"
                            // From just outside the stamped disc (21 dp at its 1.12 peak, + 1.5 dp): nothing is drawn across it.
                            val edge = (21f * StampSpec.Correct.peak + 1.5f) * px
                            fx.shock(p, edge, 44f * px, 3f * px, 260, c.kept, id = id, light = false)
                            val colors = buildList { add(c.kept); add(c.light); if (tier >= 1) add(c.pts) }
                            fx.burst(
                                p, edge, ComboMoment.streaks(tier), colors, seed = ui.correctKey * 17, drag = 10f,
                                sparkShare = if (tier >= 2) 0.3f else 0f, sparkColor = c.xp, id = id,
                            )
                        },
                    )
                } else {
                    Box(
                        Modifier
                            .size(42.dp)
                            .graphicsLayer {
                                scaleX = badgeIn.value; scaleY = badgeIn.value; alpha = badgeIn.value.coerceIn(0f, 1f)
                                // The shake runs in dp (its impulse in dp/s): only the badge moves, never the words.
                                translationX = shake.value * this.density
                            }
                            .clip(CircleShape)
                            .background(c.wash(c.owed, 0.2f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Glyphs.Undo, null, tint = c.owed, modifier = Modifier.size(22.dp).graphicsLayer { rotationZ = arrow.value })
                    }
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    when {
                        r.correct && r.judged?.correct == true -> "Correct in meaning"
                        r.correct -> "Correct"
                        else -> "Not quite"
                    },
                    style = MaterialTheme.typography.headlineSmall, color = c.ink0,
                    modifier = Modifier.graphicsLayer { alpha = title.value; translationY = (1f - title.value) * 6.dp.toPx() },
                )
                if (r.xp > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.graphicsLayer { alpha = title.value }) {
                        Icon(Glyphs.Lozenge, null, tint = c.pts, modifier = Modifier.size(14.dp).graphicsLayer { rotationZ = lozenge.value - 90f })
                        Spacer(Modifier.width(4.dp))
                        CountUp(
                            r.xp, key, Modifier.onGloballyPositioned { spots.ptsFigure = it.boundsInRoot().center },
                            style = MaterialTheme.typography.titleMedium.figures(), color = c.ink0,
                            durMs = if (full) 360 else 240, delayMs = 100, play = play,
                        ) { "+${Fmt.figure(it)} pts" }
                        r.multiplier?.takeIf { it > 1.0 }?.let { Text("  ×${Fmt.figure(it)}", style = MaterialTheme.typography.labelMedium.figures(), color = c.ink2) }
                    }
                }
            }
            if (combo > 1) {
                Column(
                    Modifier
                        .onGloballyPositioned { chipAt = it }
                        .graphicsLayer { scaleX = chip.value; scaleY = chip.value }
                        .clip(CtlShape).background(c.wash(c.xp)).padding(horizontal = 10.dp, vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    RollingNumber(combo, style = MaterialTheme.typography.titleLarge.figures(), color = c.ink0, format = { "×$it" })
                    Text("combo", style = MaterialTheme.typography.labelSmall, color = c.ink2)
                }
            }
        }
        if (!r.correct && r.retry) {
            Row(
                Modifier
                    .padding(top = 10.dp)
                    .graphicsLayer { alpha = retryIn.value.coerceIn(0f, 1f); translationX = (retryIn.value - 1f) * 8.dp.toPx() }
                    .clip(PillShape).background(c.wash(c.held)).padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Glyphs.Refresh, null, tint = c.held, modifier = Modifier.size(14.dp).graphicsLayer { rotationZ = retryTurn.value })
                Spacer(Modifier.width(6.dp))
                Text("Back at the end", style = MaterialTheme.typography.labelLarge, color = c.held)
            }
        }
        Spacer(Modifier.height(14.dp))
        Column(Modifier.graphicsLayer { alpha = body.value }) {
            r.expectedText?.let { e ->
                val held = c.held
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(CtlShape)
                        .drawBehind { if (!r.correct) drawRect(held, alpha = wash.value) }
                        .padding(horizontal = if (r.correct) 0.dp else 10.dp, vertical = if (r.correct) 0.dp else 8.dp)
                ) {
                    Eyebrow(if (r.correct) "The answer" else "Expected")
                    Spacer(Modifier.height(4.dp))
                    Text(
                        e, color = c.ink0,
                        style = MaterialTheme.typography.titleMedium.let { if (CardKind.of(card.type) == CardKind.FORMULA) it.copy(fontFamily = FontFamily.Monospace) else it },
                    )
                }
                Spacer(Modifier.height(10.dp))
            }
            r.judged?.reason?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                Spacer(Modifier.height(10.dp))
            }
            r.explanation?.takeIf { it.isNotBlank() }?.let {
                Eyebrow("Why")
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                Spacer(Modifier.height(10.dp))
            }
            val next = r.nextDueDay?.let { d -> TimeLabels.parseDay(d)?.let { TimeLabels.nextDue(it, TimeLabels.parseInstant(ui.now) ?: java.time.Instant.now()) } }
            val lines = buildList {
                next?.let { add(it) }
                r.trueFact?.let { add(it) }
                if (r.streakSecured) add("Streak secured for today")
            }
            if (r.leveledUp && r.levelFrom != null && r.levelTo != null) {
                // The level line: its target figure is held back (laid out, unseen) until the forge's close (L + 310),
                // then rolls in and bumps. TalkBack hears the true line from the start.
                val rolled = !motion.moves || levelLine >= ui.levelUpKey
                val lineBump = rememberBump(levelLine, 5f)
                val style = MaterialTheme.typography.bodyMedium
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(vertical = 2.dp).clearAndSetSemantics {
                        liveRegion = LiveRegionMode.Polite
                        contentDescription = "Card level ${r.levelFrom} to ${r.levelTo}"
                    },
                ) {
                    Box(Modifier.size(5.dp).clip(CircleShape).background(c.ink2))
                    Spacer(Modifier.width(8.dp))
                    Text("Level ${r.levelFrom} → ", style = style, color = c.ink1)
                    Box {
                        Text("${r.levelTo}", style = style, color = Color.Transparent)
                        RollingNumber(
                            if (rolled) r.levelTo else -1, Modifier.graphicsLayer { val s = lineBump(); scaleX = s; scaleY = s },
                            style = style, color = c.ink0, format = { if (it < 0) "" else "$it" },
                        )
                    }
                }
            }
            for (l in lines) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                    Box(Modifier.size(5.dp).clip(CircleShape).background(c.ink2))
                    Spacer(Modifier.width(8.dp))
                    Text(l, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                }
            }
        }
    }
}

@Composable
private fun WaitingSide(ui: ReviewViewModel.Ui) {
    val c = X.c
    XCard(Modifier.fillMaxWidth()) {
        Column {
            Eyebrow("Feedback")
            Spacer(Modifier.height(6.dp))
            Text(
                if (ui.phase == ReviewViewModel.Phase.SUBMITTING) "Grading…" else "Answer on the left; the result, the expected answer and why show here.",
                style = MaterialTheme.typography.bodyMedium, color = c.ink2,
            )
        }
    }
}

@Composable
private fun SessionStats(ui: ReviewViewModel.Ui) {
    val c = X.c
    val s = ui.session ?: return
    XCard(Modifier.fillMaxWidth()) {
        Column {
            Eyebrow("This session")
            Spacer(Modifier.height(10.dp))
            Row {
                Stat("Answered", "${s.done}", Modifier.weight(1f))
                Stat("Correct", "${s.correctCount}", Modifier.weight(1f))
                Stat("Left", "${s.queue.size}", Modifier.weight(1f))
            }
            ui.quest?.let { q ->
                Spacer(Modifier.height(10.dp))
                Text("Today's quest ${q.done}" + (q.target?.let { " / $it" } ?: ""), style = MaterialTheme.typography.labelLarge.figures(), color = c.ink1)
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.headlineSmall.figures(), color = X.c.ink0)
        Text(label, style = MaterialTheme.typography.labelMedium, color = X.c.ink2)
    }
}

/** A summary stat that counts up from [atMs] after the summary shows (unseen until then), and bumps as it lands. */
@Composable
private fun CountStat(label: String, value: Double, key: Int, atMs: Int, play: Boolean, modifier: Modifier = Modifier, format: (Double) -> String) {
    Column(modifier) {
        CountUp(value, key, style = MaterialTheme.typography.headlineSmall.figures(), color = X.c.ink0, durMs = 320, delayMs = atMs, landBump = 5f, play = play, format = format)
        Text(label, style = MaterialTheme.typography.labelMedium, color = X.c.ink2)
    }
}

@Composable
private fun BottomAction(ui: ReviewViewModel.Ui, vm: ReviewViewModel, modifier: Modifier = Modifier) {
    val c = X.c
    val card = ui.card
    Box(
        modifier
            .fillMaxWidth()
            .background(c.bar)
            .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom))
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        when (ui.phase) {
            ReviewViewModel.Phase.FEEDBACK -> {
                val last = ui.session?.finished == true
                XButton(if (last) "See the summary" else "Next card", vm::next, Modifier.fillMaxWidth(), icon = if (last) Glyphs.Tick else Glyphs.Chevron)
            }
            else -> {
                if (card != null && CardKind.of(card.type) == CardKind.MCQ) {
                    Text("Tap an option to answer", style = MaterialTheme.typography.labelLarge, color = c.ink2, modifier = Modifier.align(Alignment.Center).padding(vertical = 16.dp))
                } else {
                    XButton(
                        if (ui.phase == ReviewViewModel.Phase.SUBMITTING) "Checking…" else "Check answer",
                        vm::submit, Modifier.fillMaxWidth(),
                        enabled = ui.phase == ReviewViewModel.Phase.ANSWERING && card != null && AnswerShape.ready(card, ui.draft),
                    )
                }
            }
        }
    }
}

// ── Summary ─────────────────────────────────────────────────────────────────

/**
 * Session complete (moment 7): the card rises in; its navy seal stamps down and lights an honest X (only the parts
 * the run earned); the stats count up one after another; an earned run bursts from the seal, a perfect one sweeps
 * gold across its line, any other glows softly behind the seal. It plays once: composed again (a tab switch, a
 * fold), it is shown at rest.
 */
@Composable
private fun Summary(ui: ReviewViewModel.Ui, top: Dp, spots: ReviewSpots, onMore: () -> Unit, onDone: () -> Unit) {
    val c = X.c
    val motion = LocalMotion.current
    val fx = LocalFx.current
    val density = LocalDensity.current
    val s = ui.session ?: return
    val play = remember(ui.summaryKey) { motion.moves && spots.fresh("summary-look:${ui.summaryKey}") }
    val moves = play
    val full = play && motion == MotionLevel.FULL
    val perfect = s.done > 0 && s.correctCount == s.done
    val parts = SessionMoment.parts(s.accuracy, perfect)
    val questDone = ui.quest?.let { q -> q.target != null && q.done >= q.target } == true && ui.celebrations.isNotEmpty()
    val earned = SessionMoment.earned(perfect, questDone, s.accuracy)
    val rise = remember(ui.summaryKey) { Animatable(if (moves) 1f else 0f) }
    val buttons = remember(ui.summaryKey) { Animatable(if (moves) 0f else 1f) }
    val sweep = remember(ui.summaryKey) { Animatable(-1f) }
    val extra = remember(ui.summaryKey) { Animatable(if (full) 0f else 1f) }
    val glow = remember(ui.summaryKey) { Animatable(0f) }
    var questTick by remember(ui.summaryKey) { mutableStateOf(!full) }
    LaunchedEffect(ui.summaryKey) {
        if (!moves) return@LaunchedEffect
        spots.play("summary-look:${ui.summaryKey}")
        coroutineScope {
            if (full) launch { delay(700); questTick = true }
            launch { rise.animateTo(0f, if (full) Spr.settle.spec() else tween(200, easing = EaseOut)) }
            launch { buttons.animateTo(1f, tween(120)) }
            if (full) {
                launch { delay(700); extra.animateTo(1f, tween(240, easing = EaseOut)) }
                if (perfect) launch { delay(680); sweep.snapTo(0f); sweep.animateTo(1f, tween(500, easing = EaseInOut)); sweep.snapTo(-1f) }
            }
        }
    }
    val gold = c.gold
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = top + 16.dp, bottom = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .graphicsLayer {
                    translationY = rise.value * (if (full) 16.dp else 8.dp).toPx()
                    alpha = 1f - rise.value
                }
                .semantics { liveRegion = LiveRegionMode.Polite }
        ) {
            XCard(Modifier.fillMaxWidth()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Box(contentAlignment = Alignment.Center) {
                        val glowColor = c.lightGlow
                        val glowBlend = if (c.dark) BlendMode.Plus else BlendMode.SrcOver
                        Spacer(
                            Modifier.size(72.dp).drawWithCache {
                                // A soft light behind the seal, fading to nothing at its edge (Night adds it, Vellum
                                // washes it): one radial brush, built per size; each frame only changes its alpha.
                                val gr = size.minDimension * 0.75f
                                val brush = Brush.radialGradient(listOf(glowColor, Color.Transparent), Offset(size.width / 2, size.height / 2), gr)
                                onDrawBehind {
                                    val g = glow.value
                                    if (g > 0f) drawCircle(brush, gr, center, alpha = g, blendMode = glowBlend)
                                }
                            }
                        )
                        SessionSeal(
                            parts, if (play) ui.summaryKey else 0,
                            onContact = { p, r ->
                                fx.shock(p, r, r * 2.6f, 3f * density.density, 360, c.mint, hex = true, id = "summary:${ui.summaryKey}", light = c.dark)
                            },
                            onLastLit = { p, r ->
                                if (!full) return@SessionSeal
                                if (earned) {
                                    fx.vertexBurst(
                                        p, r, SessionMoment.shards(s.accuracy), listOf(c.pts, c.mint, c.light), seed = ui.summaryKey * 11, fan = 50f,
                                        speed = 220f..320f, drag = 1.4f, gravity = 520f, life = 1.0f..1.4f, size = 4.5f..7f, upBias = 60f, rays = false,
                                        id = "summary:${ui.summaryKey}",
                                    )
                                }
                            },
                        )
                    }
                    // Not earned: only a glow, .6 → 0 over 600 ms, at the last lit part.
                    if (!earned && full) LaunchedEffect(ui.summaryKey) {
                        delay(SessionMoment.lastLit(parts).toLong())
                        glow.snapTo(0.6f)
                        glow.animateTo(0f, tween(600, easing = EaseOut))
                    }
                    Spacer(Modifier.height(10.dp))
                    Text("Session complete", style = MaterialTheme.typography.headlineMedium, color = c.ink0)
                    Text(
                        if (perfect) "Every card, recalled." else "${s.firstTry} on the first try.",
                        style = MaterialTheme.typography.bodyMedium, color = c.ink2,
                        modifier = Modifier.drawWithCache {
                            val band = size.width * 0.5f
                            val brush = Brush.horizontalGradient(listOf(Color.Transparent, gold.copy(alpha = 0.55f), Color.Transparent), 0f, band)
                            onDrawWithContent {
                                drawContent()
                                val k = sweep.value
                                if (k >= 0f) translate(left = -band + (size.width + band) * k) { drawRect(brush, size = size.copy(width = band)) }
                            }
                        },
                    )
                    Spacer(Modifier.height(18.dp))
                    // Each stat counts on its own, one after another (Calm: together).
                    val calm = motion == MotionLevel.CALM
                    Row(Modifier.fillMaxWidth()) {
                        CountStat("Reviewed", s.done.toDouble(), ui.summaryKey, if (calm) 0 else 300, play, Modifier.weight(1f)) { "${it.toInt()}" }
                        CountStat("Correct", s.accuracy * 100.0, ui.summaryKey, if (calm) 0 else 380, play, Modifier.weight(1f)) { "${kotlin.math.round(it).toInt()}%" }
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth()) {
                        CountStat("Review pts", s.points, ui.summaryKey, if (calm) 0 else 460, play, Modifier.weight(1f)) { "+" + Fmt.figure(it) }
                        CountStat("Best combo", s.bestCombo.toDouble(), ui.summaryKey, if (calm) 0 else 540, play, Modifier.weight(1f)) { "×${it.toInt()}" }
                    }
                    val lines = buildList {
                        ui.quest?.let { add("Today's quest ${it.done}" + (it.target?.let { t -> " / $t" } ?: "")) }
                        if (ui.levelUps > 0) add(Fmt.plural(ui.levelUps, "card") + " levelled up")
                        if (ui.streakSecured) add("Streak secured for today")
                        addAll(ui.celebrations.distinct())
                    }
                    if (lines.isNotEmpty()) {
                        Spacer(Modifier.height(14.dp))
                        lines.forEachIndexed { i, l ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.graphicsLayer {
                                    // Each line rises 6 dp from S + 700, 40 ms after the one above.
                                    val k = ((extra.value * 1.6f) - i * 0.15f).coerceIn(0f, 1f)
                                    alpha = k; translationY = (1f - k) * 6.dp.toPx()
                                },
                            ) {
                                if (i == 0 && questDone) {
                                    CheckCircle(questTick, size = 18.dp, ring = c.kept)
                                    Spacer(Modifier.width(6.dp))
                                }
                                Text(l, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        Column(Modifier.widthIn(max = 560.dp).fillMaxWidth().graphicsLayer { alpha = buttons.value }) {
            if (ui.moreDue) {
                XButton("Review more", onMore, Modifier.fillMaxWidth(), icon = Glyphs.Review)
                Spacer(Modifier.height(10.dp))
            }
            XButton("Back to Check", onDone, Modifier.fillMaxWidth(), kind = if (ui.moreDue) ButtonKind.QUIET else ButtonKind.PRIMARY, icon = Glyphs.Check)
        }
    }
}

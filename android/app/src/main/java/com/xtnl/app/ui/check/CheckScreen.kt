package com.xtnl.app.ui.check

import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.addOutline
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.text.format.DateFormat
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.core.CalibrationLine
import com.xtnl.app.core.ConditionLine
import com.xtnl.app.core.DailyStrip
import com.xtnl.app.core.FadingLine
import com.xtnl.app.core.Fmt
import com.xtnl.app.core.OwedLine
import com.xtnl.app.core.ProofLine
import com.xtnl.app.core.QuestLine
import com.xtnl.app.core.RestTokenLine
import com.xtnl.app.core.SendLine
import com.xtnl.app.core.SideLine
import com.xtnl.app.core.StreakLine
import com.xtnl.app.core.TickLadder
import com.xtnl.app.core.TickNote
import com.xtnl.app.core.TimeLabels
import com.xtnl.app.core.WalletLine
import com.xtnl.app.core.WeekLine
import com.xtnl.app.core.YesterdayLine
import com.xtnl.app.data.CheckCalibration
import com.xtnl.app.data.CheckData
import com.xtnl.app.data.CheckSkill
import com.xtnl.app.data.DailyQuests
import com.xtnl.app.data.Fading
import com.xtnl.app.data.LevelInfo
import com.xtnl.app.data.NotSent
import com.xtnl.app.data.OwedItem
import com.xtnl.app.data.QuestsData
import com.xtnl.app.data.ReviewSummary
import com.xtnl.app.data.StreakMultiplier
import com.xtnl.app.data.TaskItem
import com.xtnl.app.data.Wallet
import com.xtnl.app.data.WeekAudit
import com.xtnl.app.data.WorkItem
import com.xtnl.app.ui.LocalSnacks
import com.xtnl.app.ui.LocalWindowLayout
import com.xtnl.app.ui.SnackTone
import com.xtnl.app.ui.TwoPane
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.CardShape
import com.xtnl.app.ui.components.CheckCircle
import com.xtnl.app.ui.components.EmptyNote
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.LevelSeal
import com.xtnl.app.ui.components.PillShape
import com.xtnl.app.ui.components.ProgressRing
import com.xtnl.app.ui.components.SealState
import com.xtnl.app.ui.components.StampSpec
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XCard
import com.xtnl.app.ui.components.XChip
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.motion.BoardMoment
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
import com.xtnl.app.ui.motion.Spr
import com.xtnl.app.ui.motion.TickMoment
import com.xtnl.app.ui.motion.drawCheck
import com.xtnl.app.ui.motion.drawHexTrace
import com.xtnl.app.ui.motion.fade
import com.xtnl.app.ui.motion.flood
import com.xtnl.app.ui.motion.hexPath
import com.xtnl.app.ui.motion.holdFrames
import com.xtnl.app.ui.motion.rememberBump
import com.xtnl.app.ui.motion.spr
import com.xtnl.app.ui.motion.stamp
import com.xtnl.app.ui.motion.visibleCenter
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.XtnlColors
import com.xtnl.app.ui.theme.figures
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** A tick in flight: its moment id, ladder step and motes, and what it has put on the seal, for the arrivals and an undo. */
internal class TickRun(
    val id: String, val templateId: String, val step: Int, val motes: Int, val tickAt: Long, val toSeal: Boolean,
) {
    /** The ring's exact gain for this tick, once the server's answer brings the level (null until then). */
    var delta: Float? = null
    /** Its motes fly to the seal's ring (not the Check tab). */
    var onSeal = false
    /** How much of the ring its landed motes have added so far (an undo takes it back). */
    var banked = 0f
    var arrived = 0
    var lastArrivalAt: Long? = null
    /** This run holds the seal's ring (its motes are on their way). */
    var holding = false
    var levelUp = false
    /** The level up it crossed no longer waits (played, given up, or dropped by a refresh): its last mote lets the ring go. */
    var levelUpGone = false
    /** It lit its rung's bead (its last mote, or at once without motes): an undo dims it. */
    var beadLit = false
}

/** The board-clear roll call: which kept circles bump, each after its delay. */
data class Roll(val seq: Int, val delays: Map<String, Int>)

/**
 * Check's moments' shared parts, app-wide (AppRoot keeps it, so motes in flight still land after a tab switch):
 * where each tick and its ✦ figure sit (root coordinates), the header seal's moving parts, the ticks in flight,
 * and the board-clear banner's hold and roll call. [shown] while Check is on screen.
 */
class CheckSpots {
    internal val at = HashMap<String, Offset>()
    internal val xp = HashMap<String, Offset>()
    internal var bannerSeal: LayoutCoordinates? = null
    internal var flame: Offset? = null
    internal var shown = false
    internal var scope: CoroutineScope? = null
    internal var list: LazyListState? = null
    internal val runs = HashMap<String, TickRun>()
    /** The header seal: its ring, beads and forge (created with the first level shown). */
    internal var seal: SealState? = null
    /** Where the seal's ring is going while ticks land on it: every landed share adds to it, so it only steps up. */
    internal var ringGoal = 0f
    /** The board-clear banner may show from this clear on (at B, with the roll call: the rows make room, then it fades in). */
    var released by mutableIntStateOf(0)
    internal var bannerPlayed = 0
    var roll by mutableStateOf(Roll(0, emptyMap()))
    /** A refused tick or Done: its row nods (by key: "t:…" or "w:…"). */
    var nods by mutableStateOf(mapOf<String, Int>())
    internal var levelUpPlayed = 0
    /** Ticks as each tick's last mote lands (a level up waits for it). */
    internal var landings by mutableIntStateOf(0)

    internal fun nod(key: String) { nods = nods + (key to (nods[key] ?: 0) + 1) }
}

/** The moment's id for a tick: each row's tick is its own moment, running independently. */
private fun tickId(templateId: String, clientId: String) = "tick:$templateId:$clientId"

/**
 * Check's events, answered wherever the user is now (AppRoot calls this once): a tick that fails after a
 * switch to Log still says so, with its Retry. The moments' long parts (the seal's ring, a level up, board
 * clear) run here, in a scope that outlives the screen.
 */
@Composable
fun CheckEvents(vm: CheckViewModel, spots: CheckSpots) {
    // It collects for the whole run: the theme and the motion setting are read as they are now, not as they were.
    val c by rememberUpdatedState(X.c)
    val motion by rememberUpdatedState(LocalMotion.current)
    val feel = LocalFeel.current
    val fx = LocalFx.current
    val snacks = LocalSnacks.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    SideEffect { spots.scope = scope }
    LaunchedEffect(vm) {
        vm.events.collect { e ->
            when (e) {
                is CheckViewModel.Event.TaskKept -> {
                    val run = spots.runs[e.templateId]
                    if (run != null && e.level != null && e.before != null) {
                        val up = e.level.level > e.before.level
                        run.levelUp = up
                        if (!up) {
                            val d = (e.level.progress - e.before.progress).toFloat()
                            run.delta = d
                            // The motes landed on the ring before the answer: it tweens to the exact value now.
                            if (run.onSeal && run.arrived >= run.motes) spots.seal?.let { s ->
                                spots.ringGoal = (spots.ringGoal + d - run.banked).coerceIn(0f, 1f)
                                run.banked = d
                                val goal = spots.ringGoal
                                scope.launch { s.settleTo(goal, motion) }
                            }
                        }
                    }
                    // Unhinted XP: no figure stood for it, so the motes leave the circle now that the answer says how much.
                    if (!e.hinted && e.xp > 0 && spots.shown && motion == MotionLevel.FULL && run != null && run.arrived == 0 && !run.holding) {
                        spots.at[e.templateId]?.let { from -> launchMotes(spots, fx, feel, c, run, from, mvv = false, delayMs = 0, motion = motion) }
                    }
                    // P7: the moments the tick played and the knee note ride under its line, in its one snackbar (its Undo stays).
                    snacks.show(TickNote.message(e.line ?: "Kept · ${Fmt.signed(e.xp)} XP", e.moments, e.knee), "Undo", SnackTone.KEPT) {
                        undoTick(spots, fx, feel, vm, e.templateId, motion)
                    }
                }
                is CheckViewModel.Event.TaskFailed -> {
                    spots.runs.remove(e.templateId)?.let { r ->
                        release(spots, r); fx.cancel(r.id); feel?.ladderBack()
                        if (r.beadLit) spots.seal?.let { s -> scope.launch { s.dimBead(r.step, motion) } }
                    }
                    feel?.failed("fail:${e.templateId}")
                    spots.nod("t:${e.templateId}")
                    snacks.error(e.message, e.retry)
                }
                // P8: a tick with no answer waits on the phone: its row stays ticked, and its Undo takes it off the phone.
                is CheckViewModel.Event.TaskQueued -> snacks.show(e.message, "Undo") { undoTick(spots, fx, feel, vm, e.templateId, motion) }
                is CheckViewModel.Event.WorkQueued -> snacks.show(e.message, "Undo") { feel?.untick(ladder = false); vm.cancelWorkDone(e.item) }
                is CheckViewModel.Event.TaskUndone -> snacks.show("Put back · ${Fmt.signed(e.xp)} XP")
                is CheckViewModel.Event.UndoFailed -> { feel?.error(); snacks.error(e.message) }
                // Work never climbed the ladder, so its undo takes no rung back.
                is CheckViewModel.Event.WorkDone -> snacks.show("Done · ${e.item.title}", "Undo", SnackTone.KEPT) { feel?.untick(ladder = false); vm.workReopen(e.item) }
                is CheckViewModel.Event.WorkFailed -> {
                    if (e.id != null) { feel?.failed("work:${e.id}"); spots.nod("w:${e.id}") } else feel?.error()
                    snacks.error(e.message, e.retry)
                }
                is CheckViewModel.Event.Note -> snacks.show(e.message)
                // P22: an owed card's action: the server's line (a make-up in the kept tone; Accept the loss and an undo
                // plainly), with Undo while the make-up's ten minutes are open (P22 review: the web card's own Undo).
                is CheckViewModel.Event.MadeUp ->
                    if (e.undo != null) snacks.show(e.line, OwedLine.UNDO_LABEL, if (e.repaid) SnackTone.KEPT else SnackTone.PLAIN) { feel?.untick(ladder = false); e.undo.invoke() }
                    else snacks.show(e.line, tone = if (e.repaid) SnackTone.KEPT else SnackTone.PLAIN)
                is CheckViewModel.Event.MakeUpFailed -> { feel?.error(); snacks.error(e.message, e.retry) }
                // The board-clear moment, once per clear (an event, so coming back to Check doesn't play it again).
                is CheckViewModel.Event.BoardClear -> scope.launch { boardClear(spots, vm, fx, feel, c, motion, e.templateId, density.density) }
            }
        }
    }
    // No level up waits any more (played, given up, or dropped by a refresh or a new source): the ticks that crossed
    // one let the seal go, so it follows its level again.
    LaunchedEffect(vm) {
        vm.ui.map { it.levelUp?.key }.distinctUntilChanged().collect { k -> if (k == null) releaseLevelUps(spots) }
    }
    // The ladder's run lapses 90 s after the last tick: the beads go out in reverse.
    LaunchedEffect(feel) {
        val f = feel ?: return@LaunchedEffect
        f.ladder.collectLatest { run ->
            val s = spots.seal ?: return@collectLatest
            if (run == null) { s.fadeBeads(motion); return@collectLatest }
            val left = run.atMs + TickLadder.RUN_MS - SystemClock.elapsedRealtime()
            if (left > 0) delay(left)
            f.ladderLapsed()
        }
    }
}

/**
 * The tick's motes: from [from] (the row's ✦ figure, or its circle) to the seal ring's tip, or to the Check tab when
 * the seal is off screen. The bank's beats and sound are cued for their arrivals.
 */
private fun launchMotes(spots: CheckSpots, fx: FxState, feel: com.xtnl.app.feel.Feel?, c: XtnlColors, run: TickRun, from: Offset, mvv: Boolean, delayMs: Int, motion: MotionLevel) {
    val seal = spots.seal
    val toSeal = seal?.tip() != null
    val n = TickMoment.motes(run.step, mvv)
    if (toSeal) {
        // The first run to take the ring starts its goal from where the ring rests.
        if (seal!!.holds == 0) spots.ringGoal = seal.ring.targetValue
        seal.holds++
        run.holding = true
        run.onSeal = true
    }
    // To the ring's tip from outside the ring (never across the hex, its numeral or the title under it).
    val last = fx.motes(
        from, if (toSeal) "seal" else "check", n, FxState.Shape.SPARK, c.xp, 6f, 3.5f,
        seed = run.templateId.hashCode() * 31 + run.step, delayMs = delayMs, staggerMs = TickMoment.MOTE_STAGGER,
        sideDp = 56f, spreadDeg = 30f, ring = if (toSeal) seal!!.center() else null, core = if (c.dark) c.light else null, id = run.id,
    ) { i -> arrive(spots, fx, run, i, n, toSeal, motion) }
    if (last < 0) {
        if (toSeal) { seal!!.holds--; run.holding = false; run.onSeal = false }
        return
    }
    feel?.bankAt(run.id, run.step, n, delayMs + Dur.MOTE, last)
    run.lastArrivalAt = SystemClock.uptimeMillis() + last
}

/**
 * Mote [i] of [n] lands: the ring steps up by its share (a level's run fills it to the top; the value not known yet,
 * it glints); the last lights the rung's bead. Shares add to the ring's running goal, so two ticks landing together
 * only ever step it up.
 */
private fun arrive(spots: CheckSpots, fx: FxState, run: TickRun, i: Int, n: Int, toSeal: Boolean, motion: MotionLevel) {
    run.arrived = i + 1
    if (!toSeal) { fx.land("check"); return }
    val seal = spots.seal ?: return
    val scope = spots.scope ?: return
    val d = run.delta
    val step = when {
        run.levelUp -> (1f - spots.ringGoal) / (n - i)
        d != null -> d * (i + 1) / n - run.banked
        else -> null
    }
    if (step != null) {
        run.banked += step
        spots.ringGoal = (spots.ringGoal + step).coerceIn(0f, 1f)
        val goal = spots.ringGoal
        scope.launch { seal.arrive(goal, motion) }
    } else scope.launch { seal.glintOnce() }
    if (i < n - 1) return
    spots.landings++
    run.beadLit = true
    scope.launch { seal.lightBead(run.step, motion) }
    if (run.step >= 5) scope.launch { delay(30); seal.flashOutline() }
    // A level up waits for the last mote (cause, then effect); it takes this run's hold over.
    if (!run.levelUp || run.levelUpGone) release(spots, run)
}

private fun release(spots: CheckSpots, run: TickRun) {
    if (!run.holding) return
    run.holding = false
    spots.seal?.let { it.holds = (it.holds - 1).coerceAtLeast(0) }
}

/** No level up waits: every run that crossed one lets the seal go (now, or as its last mote lands). */
private fun releaseLevelUps(spots: CheckSpots) {
    for (r in spots.runs.values) {
        if (!r.levelUp) continue
        r.levelUpGone = true
        if (r.arrived >= r.motes) release(spots, r)
    }
}

/** An undo (a row tap, or the snack's Undo): the moment's motes fade, its beats and sounds go, the ring drains, the bead dims. */
private fun undoTick(spots: CheckSpots, fx: FxState, feel: com.xtnl.app.feel.Feel?, vm: CheckViewModel, templateId: String, motion: MotionLevel) {
    val run = spots.runs.remove(templateId)
    if (run != null) {
        fx.cancel(run.id)
        release(spots, run)
        val seal = spots.seal
        val scope = spots.scope
        if (seal != null && scope != null) {
            // What its motes added comes off the ring's goal (other ticks' shares stay).
            run.banked.takeIf { !run.levelUp && it > 0f }?.let { b ->
                spots.ringGoal = (spots.ringGoal - b).coerceAtLeast(0f)
                val goal = spots.ringGoal
                scope.launch { if (!motion.moves) seal.ring.snapTo(goal) else seal.ring.animateTo(goal, tween(240, easing = EaseIn)) }
            }
            // Its bead, however it was lit (Calm and Still light it at once, with no motes).
            if (run.beadLit) scope.launch { seal.dimBead(run.step, motion) }
        }
    }
    feel?.untick(run?.id)
    vm.undo(templateId)
}

/** Board clear, from the event: B waits for the triggering tick's motes (cause, then effect). */
private suspend fun boardClear(spots: CheckSpots, vm: CheckViewModel, fx: FxState, feel: com.xtnl.app.feel.Feel?, c: XtnlColors, motion: MotionLevel, templateId: String, density: Float) = coroutineScope {
    val key = vm.ui.value.boardClearKey
    val id = "clear:$key"
    val run = spots.runs[templateId]
    val now = SystemClock.uptimeMillis()
    if (motion != MotionLevel.FULL) {
        feel?.clear(id, 0)
        spots.released = key
        return@coroutineScope
    }
    val b = BoardMoment.start(now, run?.tickAt, run?.lastArrivalAt)
    val wait = (b - now).toInt().coerceAtLeast(0)
    feel?.clear(id, wait)
    delay(wait.toLong())
    // B: the roll call, from the last-ticked row out, and the header seal's beads flash (if it is on screen).
    spots.list?.layoutInfo?.visibleItemsInfo?.let { items ->
        val origin = items.firstOrNull { it.key == "t:$templateId" }?.index
        val kept = vm.ui.value.tasks.filter { it.kept }.map { it.templateId }.toSet()
        if (origin != null) {
            val byIndex = HashMap<Int, String>()
            for (info in items) {
                val k = info.key as? String ?: continue
                if (k.startsWith("t:") && k.removePrefix("t:") in kept) byIndex[info.index] = k.removePrefix("t:")
            }
            val wave = BoardMoment.wave(origin, byIndex.keys.toList())
            spots.roll = Roll(spots.roll.seq + 1, wave.associate { (index, d) -> byIndex.getValue(index) to d })
        }
    }
    spots.seal?.takeIf { it.center() != null }?.let { s -> launch { s.flashBeads() } }
    delay(BoardMoment.BANNER_AT.toLong())
    spots.released = key
    delay((BoardMoment.CONTACT - BoardMoment.BANNER_AT).toLong())
    // B + 220, contact: the hex shock and the vertex burst from the banner's seal, or from the last circle with a chip.
    // The shards stay near it (within about 60 dp: a slow throw, light gravity, under half a second), fading before
    // the streak above or the rows below.
    val seal = spots.bannerSeal?.visibleCenter()
    val r = 20f * density * 0.92f
    if (seal != null) {
        fx.shock(seal, r, r * 2.4f, 3f * density, 300, if (c.dark) c.light else c.kept, hex = true, id = id, light = c.dark)
        fx.vertexBurst(seal, r, 12, listOf(c.kept, c.xp, c.light), seed = key * 31, speed = 110f..180f, drag = 4f, gravity = 250f, life = 0.4f..0.5f, upBias = 30f, rayColor = c.light, id = id)
    } else {
        spots.at[templateId]?.let { p ->
            fx.vertexBurst(p, 15f * density, 12, listOf(c.kept, c.xp, c.light), seed = key * 31, speed = 110f..180f, drag = 4f, gravity = 250f, life = 0.4f..0.5f, upBias = 30f, rayColor = c.light, id = id)
            fx.chip(p, "Board clear", c.ink0, c.overlay, FxState.Glyph.TICK, c.kept, distDp = 24f, durMs = 1200, id = id)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckScreen(vm: CheckViewModel, spots: CheckSpots, listState: LazyListState, onStartReview: () -> Unit, onOpenSettings: () -> Unit, onUseDemo: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val c = X.c
    val feel = LocalFeel.current
    val fx = LocalFx.current
    val snacks = LocalSnacks.current
    val motion = LocalMotion.current
    val density = LocalDensity.current
    val wl = LocalWindowLayout.current

    DisposableEffect(spots, listState) {
        spots.shown = true
        spots.list = listState
        onDispose {
            spots.shown = false
            spots.at.clear()
            spots.xp.clear()
            spots.bannerSeal = null
            spots.flame = null
        }
    }

    /**
     * P7, P23, P24: the minutes sheet's row (a long press, a proof row's tap with no timer run, a reading task's tap), by
     * its row key (a Yesterday row's is YesterdayLine.key); null when closed.
     */
    var sheetFor by rememberSaveable { mutableStateOf<String?>(null) }

    /**
     * A tick, at its release frame (T): the haptic and the pluck fire now, the row flips now, the motes follow. [yesterday]
     * (P7): a row of the Yesterday lane, ticked for yesterday; its moment is keyed apart from today's row of the template.
     */
    fun tick(t: TaskItem, mvv: Boolean, minutes: Int? = null, sessionId: String? = null, pages: Int? = null, yesterday: Boolean = false) {
        val key = if (yesterday) YesterdayLine.key(t.templateId) else t.templateId
        val clientId = UUID.randomUUID().toString()
        val id = tickId(key, clientId)
        val motes = motion == MotionLevel.FULL && (spots.seal?.tip() != null || fx.resolve("check") != null)
        val step = feel?.tick(id, motes) ?: 0
        val run = TickRun(id, key, step, TickMoment.motes(step, mvv), SystemClock.uptimeMillis(), motes)
        spots.runs[key] = run
        vm.complete(t, mvv = mvv, clientId = clientId, minutes = minutes, sessionId = sessionId, pages = pages, yesterday = yesterday)
        val seal = spots.seal
        when {
            motion == MotionLevel.FULL && t.xpHint != null -> {
                val from = spots.xp[key] ?: spots.at[key]
                if (motes && from != null) launchMotes(spots, fx, feel, c, run, from, mvv, TickMoment.MOTES_AT, motion)
                // Nowhere to land: a chip rises from the figure instead.
                else from?.let { fx.chip(it, "+${Fmt.figure(t.xpHint)}", c.ink0, c.overlay, FxState.Glyph.SPARK, c.xp, id = id) }
            }
            seal != null && motion != MotionLevel.FULL -> spots.scope?.launch {
                if (motion == MotionLevel.CALM) delay(200)
                // Undone (or refused) meanwhile: no bead to light.
                if (spots.runs[key] !== run) return@launch
                run.beadLit = true
                seal.lightBead(step, motion)
            }
        }
    }

    val onTick: (TaskItem) -> Unit = tick@{ t ->
        when {
            // P23: a proof row ticks with its timer once it has run; with none, its tap opens the minutes sheet. P24: a
            // reading task with a day's target opens it at its page chips. A chore (every other row) still ticks in one tap.
            t.open -> when (ProofLine.tapOf(t, Instant.now(), ui.data?.day)) {
                ProofLine.Tap.TICK -> tick(t, mvv = false)
                ProofLine.Tap.TIMER -> tick(t, mvv = false, sessionId = t.timer?.sessionId)
                ProofLine.Tap.SHEET -> { feel?.select(); sheetFor = t.templateId }
            }
            t.kept && (ui.kept.containsKey(t.templateId) || t.templateId in ui.waitingKeys) -> undoTick(spots, fx, feel, vm, t.templateId, motion)
            t.kept -> { feel?.select(); snacks.show("Kept earlier today. Undo it on the web app.") }
            t.locked -> { feel?.select(); snacks.show("A study task: it completes itself from today's reviews.") }
            else -> { feel?.select(); snacks.show(if (t.status == "HELD") "Held today: it asks nothing, and the streak is safe." else "Skipped today.") }
        }
    }
    val onMvv: (TaskItem) -> Unit = { t -> tick(t, mvv = true) }
    val onSheet: (TaskItem) -> Unit = { t -> feel?.select(); sheetFor = t.templateId }
    /**
     * P7: a Yesterday row's tap: it ticks for yesterday in one tap (a proof row, which has no timer for yesterday, and a
     * reading task with a target open the sheet); one ticked here is undone; one recorded earlier says where its Undo is.
     */
    val onYesterday: (TaskItem) -> Unit = { t ->
        val key = YesterdayLine.key(t.templateId)
        when {
            t.open -> if (ProofLine.tapOf(t, Instant.now(), null) == ProofLine.Tap.TICK) tick(t, mvv = false, yesterday = true) else { feel?.select(); sheetFor = key }
            t.kept && (ui.kept.containsKey(key) || key in ui.waitingKeys) -> undoTick(spots, fx, feel, vm, key, motion)
            t.kept -> { feel?.select(); snacks.show(YesterdayLine.EARLIER) }
            else -> { feel?.select(); snacks.show(YesterdayLine.SKIPPED) }
        }
    }
    val onYesterdaySheet: (TaskItem) -> Unit = { t -> feel?.select(); sheetFor = YesterdayLine.key(t.templateId) }
    /** The tick's impact on the row keyed [key] (a template id, or a Yesterday row's key). */
    val onImpact: (String, Offset) -> Unit = { key, p ->
        val run = spots.runs[key]
        val step = run?.step ?: 0
        val id = run?.id
        val px = density.density
        // T + 56, the impact: the shock ring and the streaks, from just outside the stamped disc (15 dp at its 1.10
        // peak, + 1.5 dp). The light flash (Night) is the circle's own, under its mark.
        val edge = (15f * StampSpec.Task.peak + 1.5f) * px
        fx.shock(p, edge, TickMoment.shockRadiusDp(step) * px, 2f * px, 240, c.kept, w1 = 0.5f * px, alpha0 = 0.5f, light = false, id = id)
        val k = TickMoment.speedScale(step)
        fx.burst(
            p, edge, TickMoment.streaks(step), listOf(c.kept, c.light), seed = key.hashCode() + step,
            speed = 240f * k..340f * k, drag = 10f, startAngle = TickMoment.startAngle(step), jitter = 10f,
            sparkShare = TickMoment.sparkShare(step), sparkColor = c.xp, id = id,
        )
    }

    val pull = rememberPullToRefreshState()
    val top = WindowInsets.safeDrawing.only(WindowInsetsSides.Top).asPaddingValues().calculateTopPadding()
    PullToRefreshBox(
        isRefreshing = ui.refreshing,
        onRefresh = { vm.refresh() },
        state = pull,
        modifier = Modifier.fillMaxSize(),
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = pull, isRefreshing = ui.refreshing,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = top),
                containerColor = c.overlay, color = c.ink0,
            )
        },
    ) {
        val data = ui.data
        val rows = Rows(spots, onTick, onMvv, onImpact, onSheet)
        // P7: the Yesterday lane's rows, keyed apart from today's.
        val yRows = Rows(spots, onYesterday, onMvv, onImpact, onYesterdaySheet, keyOf = { YesterdayLine.key(it.templateId) })
        when {
            data == null && ui.loading -> LoadingBoard(top)
            data == null -> CantReach(ui.error ?: "Can't reach the server.", top, onRetry = { vm.refresh() }, onSettings = onOpenSettings, onDemo = onUseDemo)
            !wl.mode.twoPane -> LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                header(data, ui, vm, spots, onOpenSettings)
                notSent(ui, vm)
                tasks(ui, rows, motion)
                owed(ui, vm)
                yesterday(ui, yRows, motion)
                review(data.review, data.fading, data.now, onStartReview)
                week(data.week)
                calibration(data.calibration)
                condition(data.skills)
                quests(ui, rows)
                work(ui, data.now, vm, spots, motion)
            }
            else -> TwoPane(
                first = {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 20.dp, end = 4.dp, top = top + 12.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        header(data, ui, vm, spots, onOpenSettings)
                        notSent(ui, vm)
                        tasks(ui, rows, motion)
                        owed(ui, vm)
                        yesterday(ui, yRows, motion)
                    }
                },
                second = {
                    val second = rememberLazyListState()
                    LazyColumn(
                        state = second,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 4.dp, end = 20.dp, top = top + 12.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        review(data.review, data.fading, data.now, onStartReview)
                        week(data.week)
                        calibration(data.calibration)
                        condition(data.skills)
                        quests(ui, rows)
                        work(ui, data.now, vm, spots, motion)
                    }
                },
            )
        }
    }
    // P7, P23: the minutes sheet, over either display; it closes with its row (ticked, gone or no longer open). Only once
    // the board is there: after a restore the saved sheet waits for the cache's read instead of closing at the first draw.
    // P7: a Yesterday row's sheet (its key is YesterdayLine.key) has no timer: it ticks for yesterday with its minutes.
    val sheetYesterday = sheetFor?.let { YesterdayLine.isKey(it) } == true
    val sheetTask = sheetFor?.let { key ->
        if (sheetYesterday) ui.yesterday.firstOrNull { YesterdayLine.key(it.templateId) == key && it.open } else ui.tasks.firstOrNull { it.templateId == key && it.open }
    }
    val sheetGone = sheetFor != null && ui.data != null && sheetTask == null
    LaunchedEffect(sheetGone) { if (sheetGone) sheetFor = null }
    sheetTask?.let { t ->
        MinutesSheet(
            task = t,
            today = ui.data?.day,
            forYesterday = if (sheetYesterday) YesterdayLine.sheetNote(ui.data?.yesterday?.dayLabel) else null,
            onDismiss = { sheetFor = null },
            onDone = { minutes, sessionId, pages -> sheetFor = null; tick(t, mvv = false, minutes = minutes, sessionId = sessionId, pages = pages, yesterday = sheetYesterday) },
            onMinimum = { sheetFor = null; tick(t, mvv = true, yesterday = sheetYesterday) },
            onStartTimer = { vm.startTimer(t) },
            onStopTimer = { vm.stopTimer(t) },
        )
    }
}

/** How often a row's running timer moves its figure (the sheet's and the web chip's 15 s). */
private const val ROW_TIMER_REFRESH_MS = 15_000L

/** What a task row needs from the screen; [keyOf] a row's key (its template id; a Yesterday row's YesterdayLine.key, P7). */
private class Rows(
    val spots: CheckSpots, val onTick: (TaskItem) -> Unit, val onMvv: (TaskItem) -> Unit, val onImpact: (String, Offset) -> Unit, val onSheet: (TaskItem) -> Unit = {},
    val keyOf: (TaskItem) -> String = { it.templateId },
)

// ── The list's parts ────────────────────────────────────────────────────────

private fun LazyListScope.header(data: CheckData, ui: CheckViewModel.Ui, vm: CheckViewModel, spots: CheckSpots, onOpenSettings: () -> Unit) {
    item(key = "header", contentType = "header") { Header(data, ui, vm, spots, onOpenSettings) }
}

/**
 * P8: what the offline queue didn't send (core/SendLine), under the header on both displays (the cover screen's one
 * column, the main display's first pane): a tick the server can no longer book or refused, a Done refused, and a line
 * from an earlier day kept back, which the user sends for today or discards. Only while there is one.
 */
private fun LazyListScope.notSent(ui: CheckViewModel.Ui, vm: CheckViewModel) {
    val notes = ui.queue.notSent
    if (notes.isEmpty()) return
    item(key = "not-sent", contentType = "not-sent") {
        NotSentTile(notes, onSend = { vm.sendForToday(it) }, onDismiss = { vm.dismissNotSent(it) }, modifier = Modifier.padding(top = 4.dp))
    }
}

private fun LazyListScope.tasks(ui: CheckViewModel.Ui, rows: Rows, motion: MotionLevel) {
    // Board clear is its own item, inserted (not expanded) with the roll call: rows below move by placement, and it
    // fades in only once they have mostly made room (B + 120), so it never draws over them.
    if (ui.boardClear && (ui.boardClearKey == 0 || rows.spots.released >= ui.boardClearKey)) {
        item(key = "board-clear", contentType = "banner") {
            BoardClearBanner(
                playKey = ui.boardClearKey, spots = rows.spots,
                modifier = Modifier.animateItem(
                    fadeInSpec = motion.fade(tween(160, delayMillis = BoardMoment.BANNER_FADE, easing = EaseOut)),
                    placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade(tween(120)),
                ),
            )
        }
    }
    item(key = "tasks-label", contentType = "label") {
        Row(Modifier.animateItem(fadeInSpec = null, fadeOutSpec = null, placementSpec = motion.spr(Spr.glide)).fillMaxWidth().padding(top = 8.dp, bottom = 2.dp, start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Eyebrow("Today")
            Spacer(Modifier.width(8.dp))
            if (ui.tasks.isEmpty()) {
                Text("nothing planned", color = X.c.ink2, style = MaterialTheme.typography.labelMedium)
            } else {
                // The header's digits roll as rows are ticked and put back.
                val style = MaterialTheme.typography.labelMedium
                RollingNumber(ui.shownOpen, style = style, color = X.c.ink2)
                Text(" open · ", color = X.c.ink2, style = style)
                RollingNumber(ui.shownKept, style = style, color = X.c.ink2)
                Text(" kept", color = X.c.ink2, style = style)
            }
        }
    }
    // The daily quests (D14, D15): the musts' header and their 1/0 strip, on both displays (single pane and the Fold's
    // two panes both list the tasks here).
    ui.daily?.takeIf { it.total > 0 }?.let { d ->
        item(key = "daily", contentType = "daily") {
            DailyQuestsStrip(d, Modifier.animateItem(fadeInSpec = motion.fade(), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade()))
        }
    }
    if (ui.tasks.isEmpty()) {
        item(key = "tasks-empty") { EmptyNote("Board clear", "Nothing on today's board.") }
    }
    items(ui.tasks, key = { "t:" + it.templateId }, contentType = { "task" }) { t ->
        val spots = rows.spots
        val roll = spots.roll
        TaskRow(
            t,
            onTick = { rows.onTick(t) }, onSheet = { rows.onSheet(t) },
            modifier = Modifier.animateItem(fadeInSpec = motion.fade(), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade()),
            spots = spots,
            rollKey = if (t.templateId in roll.delays) roll.seq else 0,
            rollDelay = roll.delays[t.templateId] ?: 0,
            nodKey = spots.nods["t:" + t.templateId] ?: 0,
            onImpact = { p -> rows.onImpact(t.templateId, p) },
            waiting = t.templateId in ui.waitingKeys,
        )
    }
}

/**
 * P7: the Yesterday section (the web's Record yesterday, its first list), on both displays: on the cover screen in the
 * one column after the day's rows (and the Owed card), on the main display at the end of the first pane. "Yesterday · 2
 * to record", the server's line (what a tick pays and by when), then the rows; each tick books on yesterday at T 1.00.
 * Only while the server lists a row.
 */
private fun LazyListScope.yesterday(ui: CheckViewModel.Ui, rows: Rows, motion: MotionLevel) {
    val lane = ui.data?.yesterday
    val list = ui.yesterday
    if (!YesterdayLine.shows(lane) || list.isEmpty()) return
    item(key = "yesterday-label", contentType = "label") {
        Column(
            Modifier
                .animateItem(fadeInSpec = motion.fade(), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade())
                .fillMaxWidth()
                .padding(top = 16.dp, bottom = 2.dp, start = 4.dp, end = 4.dp)
                .semantics(mergeDescendants = true) { },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Eyebrow(YesterdayLine.TITLE)
                Spacer(Modifier.width(8.dp))
                Text(YesterdayLine.count(list), color = X.c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1)
            }
            lane?.line?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, color = X.c.ink2, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
    items(list, key = { rows.keyOf(it) }, contentType = { "task" }) { t ->
        val spots = rows.spots
        val key = rows.keyOf(t)
        TaskRow(
            t,
            onTick = { rows.onTick(t) }, onSheet = { rows.onSheet(t) },
            modifier = Modifier.animateItem(fadeInSpec = motion.fade(), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade()),
            spots = spots,
            spotKey = key,
            rollKey = 0,
            rollDelay = 0,
            nodKey = spots.nods["t:$key"] ?: 0,
            onImpact = { p -> rows.onImpact(key, p) },
            waiting = key in ui.waitingKeys,
        )
    }
}

/**
 * The daily quests (docs/mobile-api.md `daily`; D14, D15): "Daily quests 3 of 4" in the Must colour code, the notes
 * ("1 at minimum", "1 over the cap"), and a cell per quest: kept fills kept, the minimum a lighter kept (it counts 1),
 * not yet the control line. Read-only (the rows below are what a tap ticks); named in words as one node for TalkBack.
 */
@Composable
private fun DailyQuestsStrip(d: DailyQuests, modifier: Modifier = Modifier) {
    val c = X.c
    val style = MaterialTheme.typography.labelMedium
    Column(
        modifier
            .fillMaxWidth()
            .padding(start = 4.dp, end = 4.dp, bottom = 4.dp)
            .semantics(mergeDescendants = true) { contentDescription = DailyStrip.description(d) },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(c.must))
            Spacer(Modifier.width(8.dp))
            Text(DailyStrip.header(d), color = c.ink1, style = style, maxLines = 1)
            for (note in DailyStrip.notes(d)) Text(" · $note", color = c.ink2, style = style, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (q in d.quests) {
                val fill = when {
                    q.minimum -> lerp(c.lineCtl, c.kept, 0.55f)
                    q.kept -> c.kept
                    else -> c.lineCtl
                }
                Box(Modifier.weight(1f, fill = false).widthIn(min = 8.dp, max = 28.dp).fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(fill))
            }
        }
    }
}

/**
 * The owed cards (P22), on both displays: on the cover screen in the one column after the day's rows, on the main
 * display at the end of the first pane, under the rows they belong to. Only while the server sends a debt.
 */
private fun LazyListScope.owed(ui: CheckViewModel.Ui, vm: CheckViewModel) {
    val owed = ui.owed
    if (owed.isEmpty()) return
    item(key = "owed", contentType = "owed") {
        OwedTile(
            owed, ui.dutyOn, ui.owedBusy, ui.owedPicks,
            onPick = { o, minutes, pages -> vm.pickOwed(o.instanceId, minutes, pages) },
            onAction = { o, action, minutes, pages -> vm.makeUp(o, action, minutes, pages) },
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

private fun LazyListScope.review(r: ReviewSummary?, fading: Fading?, now: String?, onStart: () -> Unit) {
    item(key = "review", contentType = "review") {
        ReviewTile(r, fading, now, onStart, Modifier.padding(top = 12.dp))
    }
}

/** The Week card, only while the server sends a week (the audit is switched on by the user's go; D38). */
private fun LazyListScope.week(w: WeekAudit?) {
    if (!WeekLine.shows(w) || w == null) return
    item(key = "week", contentType = "week") {
        WeekTile(w, Modifier.padding(top = 4.dp))
    }
}

/**
 * The calibration card (P32), on both displays, right under the Week card: on the cover screen in the one column, on the
 * main screen in the second pane. Only while the server sends one (none while the audit is off, or before two frozen weeks).
 */
private fun LazyListScope.calibration(c: CheckCalibration?) {
    if (!CalibrationLine.shows(c) || c == null) return
    item(key = "calibration", contentType = "calibration") {
        CalibrationTile(c, Modifier.padding(top = 4.dp))
    }
}

/**
 * The Condition card (P28), on both displays: on the cover screen in the one column after the Week card, on the main
 * screen in the second pane under it. Only while the server lists something under 90% (none while decay is off).
 */
private fun LazyListScope.condition(list: List<CheckSkill>) {
    if (!ConditionLine.shows(list)) return
    item(key = "condition", contentType = "condition") {
        ConditionTile(list, Modifier.padding(top = 4.dp))
    }
}

/**
 * The Quest card (P15), on both displays: on the cover screen in the one column after the Week card, on the main
 * screen in the second pane. Only while the server sent something to show (QuestLine.shows).
 */
private fun LazyListScope.quests(ui: CheckViewModel.Ui, rows: Rows) {
    val q = ui.quests
    if (q == null || !QuestLine.shows(q)) return
    item(key = "quests", contentType = "quests") {
        QuestTile(q, ui.tasks, onTick = { t -> rows.onTick(t) }, modifier = Modifier.padding(top = 4.dp))
    }
}

private fun LazyListScope.work(ui: CheckViewModel.Ui, now: String?, vm: CheckViewModel, spots: CheckSpots, motion: MotionLevel) {
    val work = ui.work
    if (work.isEmpty()) return
    item(key = "work-label", contentType = "label") {
        Row(Modifier.animateItem(fadeInSpec = motion.fade(), placementSpec = motion.spr(Spr.glide), fadeOutSpec = motion.fade()).fillMaxWidth().padding(top = 16.dp, bottom = 2.dp, start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(X.c.work))
            Spacer(Modifier.width(8.dp))
            Eyebrow("Work")
            Spacer(Modifier.width(8.dp))
            val style = MaterialTheme.typography.labelMedium
            // Closing rows still count until they leave.
            RollingNumber(work.size, style = style, color = X.c.ink2)
            Text(" due", color = X.c.ink2, style = style)
        }
    }
    items(work, key = { "w:" + it.id }, contentType = { "work" }) { w ->
        WorkRow(
            w, now, closing = w.id in ui.workClosing,
            onDone = { vm.workDone(w, holdMs = if (motion == MotionLevel.STILL) 0L else CheckViewModel.WORK_HOLD_MS) },
            nodKey = spots.nods["w:" + w.id] ?: 0,
            // The row fades itself out before it leaves (no disappearing-item layer).
            modifier = Modifier.animateItem(fadeInSpec = motion.fade(tween(200)), placementSpec = motion.spr(Spr.glide), fadeOutSpec = null),
        )
    }
}

// ── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun Header(data: CheckData, ui: CheckViewModel.Ui, vm: CheckViewModel, spots: CheckSpots, onOpenSettings: () -> Unit) {
    val c = X.c
    val ctx = LocalContext.current
    val motion = LocalMotion.current
    val feel = LocalFeel.current
    val fx = LocalFx.current
    val snacks = LocalSnacks.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Eyebrow("Quick check")
            Spacer(Modifier.height(2.dp))
            Text(data.dayLabel ?: "Today", style = MaterialTheme.typography.headlineMedium, color = c.ink0, maxLines = 1)
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                data.streak?.let { s -> Streak(s.days, s.keptToday || ui.kept.isNotEmpty(), spots) }
            }
            // The one Rest Token bank (blueprint P21): only while the server sends it; on both displays (the header is
            // the cover screen's first item and the main screen's first pane's).
            RestTokenLine.tokens(data.streak)?.let { n ->
                Spacer(Modifier.height(6.dp))
                RestTokensChip(n)
            }
            // The streak multiplier (blueprint P29): only while the server sends it, under the Rest tokens chip as on the
            // web's Daily quests; the header is the first item on the cover screen and the main screen's first pane.
            StreakLine.of(data.streak)?.let { m ->
                Spacer(Modifier.height(6.dp))
                StreakMultChip(m)
            }
            // The credits wallet (blueprint P16): only while the server sends one (credits switched on, read).
            ui.wallet?.let { w ->
                Spacer(Modifier.height(6.dp))
                WalletChip(w)
            }
            if (ui.offline && ui.fetchedAtMs != null) {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Glyphs.Offline, null, tint = c.ink2, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "Offline · " + TimeLabels.updated(Instant.ofEpochMilli(ui.fetchedAtMs), ZoneId.systemDefault(), DateFormat.is24HourFormat(ctx)),
                        color = c.ink2, style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
            // P8: what waits on the phone to send ("2 waiting to send"); a tap sends it now (the job also does, online).
            SendLine.waitingLine(ui.queue.items.size)?.let { line ->
                Spacer(Modifier.height(2.dp))
                Row(
                    Modifier
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(onClickLabel = "Send now") { feel?.select(); vm.sendWaiting() }
                        .padding(end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Glyphs.Clock, null, tint = c.ink2, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(
                        line + if (ui.queue.held != null) " · ${SendLine.HELD}" else "",
                        color = c.ink2, style = MaterialTheme.typography.labelMedium,
                    )
                }
                // Why, unless the refused /check below says the same.
                ui.queue.held?.takeIf { it != ui.refused }?.let { why ->
                    Text(why, color = c.owed, style = MaterialTheme.typography.labelMedium)
                }
            }
            // The server answered, and said no: its line (the token one leads to Settings), over what was last read.
            ui.refused?.let { line ->
                Spacer(Modifier.height(6.dp))
                Text(
                    line + (ui.fetchedAtMs?.let { " · " + TimeLabels.updated(Instant.ofEpochMilli(it), ZoneId.systemDefault(), DateFormat.is24HourFormat(ctx)) } ?: ""),
                    color = c.owed, style = MaterialTheme.typography.labelMedium,
                )
                if (ui.refusedAuth) {
                    Spacer(Modifier.height(6.dp))
                    XButton("Settings", onOpenSettings, kind = ButtonKind.QUIET, icon = Glyphs.Settings, height = 44.dp)
                }
            }
        }
        ui.level?.let { l ->
            val seal = spots.seal ?: SealState(l.level, l.progress.toFloat()).also { spots.seal = it }
            // A level up still to play holds the seal at the level it came from.
            val pending = ui.levelUp?.takeIf { it.key > spots.levelUpPlayed }
            val shown = pending?.from ?: l
            LaunchedEffect(seal) {
                if (seal.shownTitle == null) seal.shownTitle = shown.title
                // Composed mid-run: the beads show the ladder's rungs at once.
                feel?.ladder?.value?.let { r -> if (seal.beadLit.all { it.value == 0f }) seal.showBeads(r.step + 1) }
            }
            LaunchedEffect(shown.title, seal.holds) { if (seal.holds == 0) seal.shownTitle = shown.title }
            LaunchedEffect(pending?.key) {
                val lu = pending ?: return@LaunchedEffect
                // Wait for the tick's motes to land (cause, then effect), and for the seal to be on screen.
                snapshotFlow { seal.holds + spots.landings }.first { spots.runs.values.none { it.holding && it.arrived < it.motes } }
                delay(16)
                val scope = spots.scope ?: return@LaunchedEffect
                spots.levelUpPlayed = lu.key
                val line = "Level ${lu.to.level}" + (lu.to.title?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
                if (seal.center() == null || System.currentTimeMillis() - lu.atMs > CheckViewModel.LEVEL_UP_QUEUE_MS) {
                    vm.levelUpShown(lu.key)
                    snacks.show(line, tone = SnackTone.KEPT)
                    spots.runs.values.filter { it.levelUp }.forEach { release(spots, it) }
                    return@LaunchedEffect
                }
                seal.holds++
                // A tick landing during it steps from the new level's progress.
                spots.ringGoal = lu.to.progress.toFloat()
                vm.levelUpShown(lu.key)
                scope.launch {
                    characterLevelUp(seal, lu, motion, feel, fx, c, onClose = { snacks.show(line, tone = SnackTone.KEPT) })
                    spots.runs.values.filter { it.levelUp }.forEach { release(spots, it) }
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                LevelSeal(shown.level, shown.progress.toFloat(), size = 56.dp, state = seal, anchorKey = "seal")
                (seal.shownTitle ?: shown.title)?.let { Text(it, color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1) }
            }
        }
    }
}

/**
 * The character's level (moment 6b), T = now: the ring sweeps full, flashes and pours into the hexagon, the forge
 * retraces it, and at T + 500 the seal closes on the new numeral with a double shock, rays and shards; then the
 * ring redraws from nothing to the new progress.
 */
private suspend fun characterLevelUp(seal: SealState, lu: CheckViewModel.LevelUp, motion: MotionLevel, feel: com.xtnl.app.feel.Feel?, fx: FxState, c: XtnlColors, onClose: () -> Unit) = coroutineScope {
    val id = "level:${lu.key}"
    // The caller took the seal's hold; it is given back at the end.
    feel?.forgeCharacter(id, 0)
    val to = lu.to.progress.toFloat()
    when (motion) {
        MotionLevel.STILL -> {
            seal.shownLevel = lu.to.level; seal.shownTitle = lu.to.title
            seal.ring.snapTo(to)
            onClose()
        }
        MotionLevel.CALM -> {
            seal.ring.animateTo(1f, tween(300, easing = EaseOut))
            seal.forge(lu.to.level, lu.to.title, 1f, 1f, 0, 0, motion, onClose)
            seal.ring.snapTo(0f)
            seal.ring.animateTo(to, tween(300, easing = EaseOut))
        }
        MotionLevel.FULL -> {
            launch { seal.ring.animateTo(1f, tween(160, easing = EaseIn)) }
            launch { delay(160); seal.ringFlash.animateTo(1f, tween(80)); holdFrames(5) }
            launch { delay(200); seal.ringAlpha.animateTo(0f, tween(120)) }
            launch {
                delay(200)
                seal.forge(lu.to.level, lu.to.title, squat = 0.90f, pop = 1.28f, hold = 5, forgeMs = 300, motion = motion) {
                    onClose()
                    seal.center()?.let { p ->
                        val r = seal.radius() * 0.68f
                        fx.shock(p, r, r * 2.6f, 3f * fx.density, 360, c.light, hex = true, id = id, light = c.dark)
                        fx.cue(90, id) { fx.shock(p, r, r * 2.6f, 3f * fx.density, 360, c.mint, hex = true, id = id, light = c.dark) }
                        // The shards stay near the seal (half a second, light gravity): they fade before the rows' figures.
                        fx.vertexBurst(
                            p, r, 18, listOf(c.gold, c.light, c.xp, c.mint), seed = lu.key * 13, fan = 14f, speed = 200f..320f, drag = 3f, gravity = 350f,
                            life = 0.45f..0.55f, size = 4.5f..7f, upBias = 0f, rayColor = c.light, id = id,
                        )
                    }
                }
            }
            delay(620)
            seal.ringFlash.snapTo(0f)
            seal.ring.snapTo(0f)
            seal.ringAlpha.snapTo(1f)
            seal.head.snapTo(1f)
            seal.ring.animateTo(to, tween(420, easing = EaseOut))
            seal.head.animateTo(0f, tween(120))
        }
    }
    seal.holds = (seal.holds - 1).coerceAtLeast(0)
}

/**
 * The credits wallet (blueprint P16; decisions D27 to D29): the server's balance and what today earned, in the web
 * purse's words ("120 cr · +40 today"). A record, never a button: credits are spent on More › Mall (P19). It
 * steps with a tick's own answer and comes back with the next /check; one line, so it fits the cover screen too.
 */
@Composable
private fun WalletChip(w: Wallet) {
    val c = X.c
    Row(
        Modifier
            .clip(PillShape)
            .border(BorderStroke(1.dp, c.line2), PillShape)
            .padding(horizontal = 10.dp, vertical = 4.dp)
            .semantics(mergeDescendants = true) { contentDescription = WalletLine.describe(w) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(WalletLine.balance(w), color = c.ink0, style = MaterialTheme.typography.labelLarge, maxLines = 1)
        Text(" · " + WalletLine.today(w), color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

/**
 * The one Rest Token bank (blueprint 3.2c, P21; decision D19: the momentum freezes): the server's count in the web's
 * words ("Rest tokens 2"), the freeze glyph in the held colour beside the words, never colour alone. A record, never a
 * button: the server spends a token, the app never does. One line, so it fits the cover screen too.
 */
@Composable
private fun RestTokensChip(n: Int) {
    val c = X.c
    Row(
        Modifier
            .clip(PillShape)
            .border(BorderStroke(1.dp, c.line2), PillShape)
            .padding(horizontal = 10.dp, vertical = 4.dp)
            .semantics(mergeDescendants = true) { contentDescription = RestTokenLine.describe(n) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Freeze, null, tint = c.held, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(RestTokenLine.chip(n), color = c.ink0, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

/**
 * The streak multiplier (blueprint P29, decision D25): "Streak ×1.16 · day 3", the flame and the words, never colour
 * alone. It wraps rather than clips at the cover screen's width.
 */
@Composable
private fun StreakMultChip(m: StreakMultiplier) {
    val c = X.c
    Row(
        Modifier
            .clip(PillShape)
            .border(BorderStroke(1.dp, c.line2), PillShape)
            .padding(horizontal = 10.dp, vertical = 4.dp)
            .semantics(mergeDescendants = true) { contentDescription = StreakLine.describe(m) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Flame, null, tint = c.ink2, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(StreakLine.chip(m), color = c.ink0, style = MaterialTheme.typography.labelLarge)
    }
}

/** The streak: its flame lights on the day's first tick (bumps, and three embers rise under it). */
@Composable
private fun Streak(days: Int, keptToday: Boolean, spots: CheckSpots) {
    val c = X.c
    val motion = LocalMotion.current
    val fx = LocalFx.current
    var firstOfDay by remember { mutableIntStateOf(0) }
    var was by remember { mutableStateOf(keptToday) }
    LaunchedEffect(keptToday) {
        if (keptToday && !was && motion == MotionLevel.FULL) {
            firstOfDay++
            spots.flame?.let { fx.embers(it, 3, c.xp, seed = days) }
        }
        was = keptToday
    }
    val tint by animateColorAsState(if (keptToday) c.xp else c.inkMute, if (motion.moves) tween(120) else tween(0), label = "flame")
    val bump = rememberBump(firstOfDay, 10f)
    Icon(
        Glyphs.Flame, null, tint = tint,
        modifier = Modifier
            .size(18.dp)
            .onGloballyPositioned { spots.flame = it.boundsInRoot().center }
            .graphicsLayer { val s = bump(); scaleX = s; scaleY = s },
    )
    Spacer(Modifier.width(4.dp))
    Text(if (days == 1) "1 day" else "$days days", color = c.ink1, style = MaterialTheme.typography.labelLarge)
    Text(if (keptToday) " · kept today" else " · not yet today", color = c.ink2, style = MaterialTheme.typography.labelMedium)
}

// ── A task ──────────────────────────────────────────────────────────────────

/**
 * A task row. Its tick (moment 1): the circle stamps; the row floods from the circle in the kept wash as its
 * border tints; the title strikes through line by line and dims; the ✦ turns a quarter (its own symmetry, so it
 * rests upright) and a "+" fades in before the figure, which stays where it is. Every value is read in a draw or
 * layer lambda: a tick recomposes nothing per frame.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TaskRow(
    t: TaskItem, onTick: () -> Unit, modifier: Modifier = Modifier, spots: CheckSpots,
    rollKey: Int, rollDelay: Int, nodKey: Int, onImpact: (Offset) -> Unit, onSheet: () -> Unit = {},
    /** Where the row's tick and figure sit in [spots]: its template id, or a Yesterday row's own key (P7). */
    spotKey: String = t.templateId,
    /** P8: its tick waits on the phone (no connection when it was made): the meta says so until it lands. */
    waiting: Boolean = false,
) {
    val c = X.c
    val motion = LocalMotion.current
    val kept = t.kept
    val held = t.status == "HELD" || t.status == "SKIPPED"
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val flood = remember { Animatable(if (kept) 1f else 0f) }
    val strike = remember { Animatable(if (kept) 1f else 0f) }
    val dim = remember { Animatable(if (kept) 0.62f else 1f) }
    val star = remember { Animatable(if (kept) 90f else 0f) }
    val plus = remember { Animatable(if (kept) 1f else 0f) }
    var figure by remember { mutableIntStateOf(0) }
    val figBump = rememberBump(figure, 6f)
    // P23: a running timer's minutes move on the row as on the sheet and the web chip (every 15 s), not only on a refresh.
    var timerNow by remember { mutableStateOf(Instant.now()) }
    val timerRunning = t.timer?.running == true
    LaunchedEffect(timerRunning, t.timer?.sessionId) {
        timerNow = Instant.now()
        while (timerRunning) {
            delay(ROW_TIMER_REFRESH_MS)
            timerNow = Instant.now()
        }
    }
    LaunchedEffect(kept) {
        val target = if (kept) 1f else 0f
        if (strike.targetValue == target && strike.value == target) return@LaunchedEffect
        when {
            motion == MotionLevel.STILL -> {
                flood.snapTo(target); strike.snapTo(target); dim.snapTo(if (kept) 0.62f else 1f); star.snapTo(90f * target); plus.snapTo(target)
            }
            kept && motion == MotionLevel.FULL -> coroutineScope {
                launch { delay(40); flood.animateTo(1f, tween(240, easing = EaseOut)) }
                launch { delay(60); figure++; launch { star.animateTo(90f, tween(200, easing = EaseOut)) }; plus.animateTo(1f, tween(120)) }
                launch { delay(90); strike.animateTo(1f, tween(220, easing = EaseInOut)) }
                launch { delay(160); dim.animateTo(0.62f, tween(240, easing = EaseOut)) }
            }
            kept -> coroutineScope {
                launch { flood.animateTo(1f, tween(180)) }
                launch { strike.animateTo(1f, tween(160)) }
                launch { dim.animateTo(0.62f, tween(160)) }
                launch { star.snapTo(90f); plus.animateTo(1f, tween(120)) }
            }
            else -> coroutineScope {
                val calm = motion == MotionLevel.CALM
                launch { flood.animateTo(0f, tween(if (calm) 140 else 200, easing = EaseIn)) }
                launch { strike.animateTo(0f, tween(if (calm) 120 else 140, easing = EaseIn)) }
                launch { dim.animateTo(1f, tween(if (calm) 120 else 160)) }
                launch { plus.animateTo(0f, tween(if (calm) 120 else 160)) }
                launch { star.animateTo(0f, tween(160)) }
            }
        }
    }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    var rowAt by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var circleAt by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val laneColor = when (t.lane) { "MUST" -> c.must; "HABIT" -> c.habit; else -> c.lineCtl }
    val strikeColor = c.ink2
    val washKept = c.wash(c.kept)
    val rimKept = c.kept.copy(alpha = 0.22f)
    val line1 = c.line1
    val borderKept = c.wash(c.kept, 0.3f)
    val radial = motion == MotionLevel.FULL
    Box(modifier) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .onGloballyPositioned { rowAt = it }
                .clip(CardShape)
                .background(c.card)
                .flood(
                    progress = { flood.value },
                    origin = {
                        val r = rowAt
                        val ci = circleAt
                        if (r != null && ci != null && r.isAttached && ci.isAttached) r.localPositionOf(ci, Offset(ci.size.width / 2f, ci.size.height / 2f)) else Offset.Zero
                    },
                    color = washKept, shape = CardShape, rim = rimKept, radial = { radial },
                )
                .drawWithCache {
                    // The border tints with the flood (line1 → the kept wash): one outline, built per size.
                    val outline = CardShape.createOutline(size, layoutDirection, this)
                    val path = Path().apply { addOutline(outline) }
                    val stroke = Stroke(1.dp.toPx())
                    onDrawWithContent {
                        drawContent()
                        drawPath(path, lerp(line1, borderKept, flood.value.coerceIn(0f, 1f)), style = stroke)
                    }
                }
                .combinedClickable(
                    interactionSource = source,
                    indication = ripple(color = c.kept),
                    role = Role.Checkbox,
                    onClickLabel = if (t.open) "Check" else "Undo",
                    // P7: a long press opens the minutes sheet on any open row (its chips, its minimum, a proof row's timer).
                    onLongClick = if (t.open) onSheet else null,
                    onClick = onTick,
                )
                .semantics {
                    // As the screen shows it: a done side quest's line is gone, so TalkBack leaves it out too.
                    contentDescription = SideLine.of(t, null)?.takeIf { !kept }?.let { "${t.title}, $it" } ?: t.title
                    stateDescription = when { kept && waiting -> "Kept, ${SendLine.WAITING.lowercase()}"; kept -> "Kept"; held -> "Held"; t.locked -> "Completes from reviews"; else -> "Open" }
                }
                .padding(start = 8.dp, end = 14.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(52.dp).onGloballyPositioned { circleAt = it; spots.at[spotKey] = it.boundsInRoot().center },
                contentAlignment = Alignment.Center,
            ) {
                if (t.locked && !kept) {
                    // A study task completes itself from the day's reviews: no tick to make.
                    Icon(Glyphs.Review, null, tint = c.ink2, modifier = Modifier.size(24.dp))
                } else {
                    CheckCircle(
                        kept, ring = laneColor, size = 30.dp, held = held, pressed = { pressed }, stamp = StampSpec.Task,
                        onImpact = onImpact.takeIf { motion == MotionLevel.FULL }, rollKey = rollKey, rollDelay = rollDelay, nodKey = nodKey,
                        flash = c.light.takeIf { c.dark && motion == MotionLevel.FULL },
                    )
                }
            }
            Spacer(Modifier.width(6.dp))
            Column(Modifier.weight(1f).graphicsLayer { alpha = dim.value }) {
                Text(
                    t.title,
                    style = MaterialTheme.typography.titleMedium, color = c.ink0, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    onTextLayout = { layout = it },
                    modifier = Modifier.drawWithContent {
                        drawContent()
                        val l = layout ?: return@drawWithContent
                        val p = strike.value
                        if (p <= 0f) return@drawWithContent
                        // Left to right, line by line.
                        for (i in 0 until l.lineCount) {
                            val y = (l.getLineTop(i) + l.getLineBottom(i)) / 2
                            val x0 = l.getLineLeft(i)
                            val x1 = l.getLineRight(i)
                            val lp = ((p * l.lineCount) - i).coerceIn(0f, 1f)
                            if (lp > 0f) drawLine(strikeColor, Offset(x0, y), Offset(x0 + (x1 - x0) * lp, y), strokeWidth = 1.5.dp.toPx())
                        }
                    },
                )
                val meta = buildList {
                    when (t.lane) { "MUST" -> add("Must"); "HABIT" -> add("Habit") }
                    t.minutes?.let { add("$it min") }
                    if (held) add(if (t.status == "HELD") "Held" else "Skipped")
                    if (t.locked) add("from reviews")
                    else if (!kept) t.mvv?.let { add("min: $it") }
                    // P23: a proof row says its tick takes its minutes, and its timer while one is open.
                    if (t.proof && !kept) add(t.timer?.let { tm -> ProofLine.timerLabel(tm, timerNow) } ?: "log the minutes")
                    // P24: a reading task says its tick takes its pages ("log 30 pages").
                    if (!kept) t.pages?.let { add(ProofLine.pagesNote(it.target)) }
                    if (t.status == "DONE_MVV") add("the minimum")
                }
                // P31: a side quest says so in ink with its own glyph ("Side quest · expires Fri"), never a lane colour, on a
                // line of its own under the meta, so the main display's narrow pane never clips it (it may wrap).
                val side = SideLine.of(t, null)?.takeIf { !kept }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (t.lane == "MUST") {
                        Icon(Glyphs.Diamond, null, tint = c.must, modifier = Modifier.size(10.dp))
                        Spacer(Modifier.width(5.dp))
                    } else if (t.lane == "HABIT") {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(c.habit))
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(meta.joinToString(" · "), color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (side == null) t.dueLabel?.takeIf { !kept }?.let { due ->
                        Text(
                            (if (meta.isEmpty()) "" else " · ") + due,
                            color = if (due.startsWith("late") || due.startsWith("Overdue")) c.owed else c.ink1,
                            style = MaterialTheme.typography.labelMedium, maxLines = 1,
                        )
                    }
                }
                if (side != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                        Icon(Glyphs.Side, null, tint = c.ink1, modifier = Modifier.size(12.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(side, color = c.ink1, style = MaterialTheme.typography.labelMedium)
                    }
                }
                // P8: a tick waiting on the phone says so on its own line (the main display's pane never clips it).
                if (kept && waiting) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                        Icon(Glyphs.Clock, null, tint = c.ink2, modifier = Modifier.size(12.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(SendLine.WAITING, color = c.ink2, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
            t.xpHint?.let { xp ->
                Spacer(Modifier.width(8.dp))
                // The row's own XP figure: where the motes rise from. "3.2" becomes "+3.2" as the ✦ turns: the "+" has
                // its room kept, so the digits never move (they only brighten, ink1 → ink0, in place).
                val style = MaterialTheme.typography.labelLarge.figures()
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.graphicsLayer { val s = figBump(); scaleX = s; scaleY = s },
                ) {
                    Icon(
                        Glyphs.Spark, null, tint = c.xp,
                        modifier = Modifier
                            .size(13.dp)
                            .onGloballyPositioned { spots.xp[spotKey] = it.boundsInRoot().center }
                            .graphicsLayer { rotationZ = star.value },
                    )
                    Spacer(Modifier.width(3.dp))
                    Text("+", color = c.ink0, style = style, modifier = Modifier.graphicsLayer { alpha = plus.value })
                    Box {
                        Text(Fmt.figure(xp), color = c.ink1, style = style, modifier = Modifier.graphicsLayer { alpha = 1f - plus.value })
                        Text(Fmt.figure(xp), color = c.ink0, style = style, modifier = Modifier.graphicsLayer { alpha = plus.value })
                    }
                }
            }
        }
    }
}

/**
 * "Board clear" (moment 2): inserted at B, it fades in from B + 120 as the rows below come to rest; from there its
 * 40 dp hex seal falls into place (1.5 → 0.94), holds at the contact (B + 220), settles; the outline traces in light
 * and the tick draws inside; a light sweep crosses the card once. Shown at rest when the board was already clear.
 */
@Composable
private fun BoardClearBanner(playKey: Int, spots: CheckSpots, modifier: Modifier = Modifier) {
    val c = X.c
    val motion = LocalMotion.current
    val play = playKey > spots.bannerPlayed && motion.moves
    val full = play && motion == MotionLevel.FULL
    val seal = remember { Animatable(if (full) 1.5f else 1f) }
    val sealAlpha = remember { Animatable(if (play) 0f else 1f) }
    val trace = remember { Animatable(if (full) 0f else 1f) }
    val tick = remember { Animatable(if (full) 0f else 1f) }
    val sweep = remember { Animatable(-1f) }
    LaunchedEffect(playKey) {
        if (!play) return@LaunchedEffect
        spots.bannerPlayed = playKey
        delay(BoardMoment.BANNER_FADE.toLong())
        if (!full) {
            sealAlpha.animateTo(1f, tween(160))
            return@LaunchedEffect
        }
        coroutineScope {
            launch { sealAlpha.animateTo(1f, tween(60)) }
            // B + 120 → 220: the seal falls; contact, hold, settle.
            launch { seal.stamp(0.94f, upMs = 100, hold = Dur.HOLD_MACRO, ease = EaseIn) }
            launch { delay(100); trace.animateTo(1f, tween(200, easing = EaseInOut)) }
            launch { delay(120); tick.animateTo(1f, tween(160, easing = com.xtnl.app.ui.motion.EaseDraw)) }
            launch { delay(180); sweep.snapTo(0f); sweep.animateTo(1f, tween(520, easing = EaseInOut)); sweep.snapTo(-1f) }
        }
    }
    val hex = remember { Path() }
    val rimStroke = with(LocalDensity.current) { remember { Stroke(1.5.dp.toPx()) } }
    val sweepAlpha = if (c.dark) 0.26f else 0.14f
    val light = c.light
    Box(
        modifier
            .fillMaxWidth()
            .padding(top = 4.dp)
            .graphicsLayer()
            .clip(CardShape)
            .background(c.wash(c.kept))
            .drawWithCache {
                // One gradient band (40% of the width), translated across: nothing built per frame.
                val band = size.width * 0.4f
                val brush = Brush.horizontalGradient(listOf(Color.Transparent, light.copy(alpha = sweepAlpha), Color.Transparent), 0f, band)
                val outline = CardShape.createOutline(size, layoutDirection, this)
                val path = Path().apply { addOutline(outline) }
                val stroke = Stroke(1.dp.toPx())
                val rim = c.wash(c.kept, 0.35f)
                onDrawWithContent {
                    drawContent()
                    drawPath(path, rim, style = stroke)
                    val k = sweep.value
                    if (k >= 0f) translate(left = -band + (size.width + band) * k) { drawRect(brush, size = size.copy(width = band)) }
                }
            }
            .semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "Board clear. Every task on today's board is kept." }
            .padding(horizontal = 18.dp, vertical = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.foundation.Canvas(
                Modifier
                    .size(40.dp)
                    .onGloballyPositioned { spots.bannerSeal = it }
                    .graphicsLayer { scaleX = seal.value; scaleY = seal.value; alpha = sealAlpha.value }
            ) {
                val r = size.minDimension / 2 * 0.98f
                hexPath(center, r, hex)
                drawPath(hex, c.kept)
                drawPath(hex, light, alpha = 0.5f, style = rimStroke)
                drawHexTrace(center, r, trace.value, light, 2.dp.toPx(), alpha = 1f - 0.5f * trace.value)
                val m = tick.value
                drawCheck(center, r * 0.95f, com.xtnl.app.ui.motion.checkLeg1(m), com.xtnl.app.ui.motion.checkLeg2(m), c.onKept, r * 0.18f)
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text("Board clear", style = MaterialTheme.typography.headlineSmall, color = c.ink0)
                Text("Every task on today's board is kept.", style = MaterialTheme.typography.bodyMedium, color = c.ink1)
            }
        }
    }
}

// ── Review tile ─────────────────────────────────────────────────────────────

@Composable
private fun ReviewTile(r: ReviewSummary?, fading: Fading?, now: String?, onStart: () -> Unit, modifier: Modifier = Modifier) {
    val c = X.c
    val ctx = LocalContext.current
    val due = r?.due ?: 0
    XCard(modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
                    val target = r?.target
                    ProgressRing(if (target != null && target > 0) r.doneToday.toFloat() / target else if (due == 0) 1f else 0f, Modifier.size(56.dp), color = c.pts)
                    Text("${r?.doneToday ?: 0}", style = MaterialTheme.typography.titleMedium.figures(), color = c.ink0)
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Eyebrow("Review")
                    Text(if (due > 0) "$due due" else "All caught up", style = MaterialTheme.typography.titleLarge, color = c.ink0)
                    val target = r?.target
                    val sub = when {
                        target != null -> "${r.doneToday} of $target today"
                        r != null -> "${r.doneToday} today"
                        else -> ""
                    }
                    val next = if (due == 0) r?.nextDueAt?.let { TimeLabels.parseInstant(it) }?.let { at ->
                        TimeLabels.parseInstant(now)?.let { n -> TimeLabels.nextCard(at, n, h24 = DateFormat.is24HourFormat(ctx)) }
                    } else null
                    Text(listOfNotNull(sub.ifEmpty { null }, next).joinToString(" · "), style = MaterialTheme.typography.labelMedium, color = c.ink2)
                }
            }
            if (fading != null && FadingLine.shows(fading)) {
                Spacer(Modifier.height(12.dp))
                FadingRow(fading, onStart)
            }
            if (due > 0) {
                Spacer(Modifier.height(12.dp))
                XButton("Start review", onStart, Modifier.fillMaxWidth(), icon = Glyphs.Review)
            }
        }
    }
}

/**
 * The "Fading" line (docs/mobile-api.md `fading`; blueprint 3.1a, D23): the ideas past their grace, the web bell's own
 * count, and how many are losing levels (never cut: it may wrap), then the Domains they sit in, marked in the owed hue
 * the Library's Fading chip uses. Every fading card is due, so the whole row opens Review; at least 48 dp tall, one
 * node for TalkBack.
 */
@Composable
private fun FadingRow(f: Fading, onOpen: () -> Unit) {
    val c = X.c
    val style = MaterialTheme.typography.labelMedium
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(c.wash(c.owed))
            .clickable(role = Role.Button, onClickLabel = "Open Review", onClick = onOpen)
            .semantics(mergeDescendants = true) { contentDescription = FadingLine.description(f) }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(c.owed))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(FadingLine.headline(f), color = c.ink0, style = style, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val places = FadingLine.places(f)
            if (places.isNotEmpty()) Text(places, color = c.ink2, style = style, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(8.dp))
        Icon(Glyphs.Chevron, null, tint = c.ink2, modifier = Modifier.size(18.dp))
    }
}

// ── Week card ───────────────────────────────────────────────────────────────

/**
 * The Week card (docs/mobile-api.md `week`; D12, D15, D16, D17): the web's Week audit card in its own words: the
 * week's daily quests kept of due as a whole percent, when the numbers are from (provisional, as of Monday 04:00,
 * final), the 85% target in plain words (only on this card, never on the board above it), and what was left out. A
 * count, never a verdict. P12: "Decaying this week" and its first three lines (the web's audit links each to its fix).
 * Read-only (nothing to tap); one node for TalkBack; every line may wrap.
 */
@Composable
private fun WeekTile(w: WeekAudit, modifier: Modifier = Modifier) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    XCard(modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = WeekLine.description(w) }) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Eyebrow(WeekLine.TITLE)
                Spacer(Modifier.width(8.dp))
                Text(w.label, color = c.ink2, style = meta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(2.dp))
            Text(WeekLine.headline(w), style = MaterialTheme.typography.titleLarge.figures(), color = c.ink0)
            Text(WeekLine.status(w), style = meta, color = c.ink2)
            Text(WeekLine.target(w), style = meta, color = c.ink1)
            val notes = WeekLine.notes(w)
            if (notes.isNotEmpty()) Text(notes.joinToString(" · "), style = meta, color = c.ink2)
            // P31: the week's side quests, beside the rate and never in it.
            SideLine.audit(w)?.let { Text(it, style = meta, color = c.ink2) }
            WeekLine.decayHeading(w)?.let { heading ->
                Spacer(Modifier.height(10.dp))
                Eyebrow(heading)
                for (l in WeekLine.decayLines(w)) {
                    Spacer(Modifier.height(4.dp))
                    Text(l.title, style = MaterialTheme.typography.bodyMedium, color = c.ink0)
                    if (l.detail.isNotEmpty()) Text(l.detail, style = meta, color = c.ink2)
                }
                WeekLine.decayNote(w)?.let { Text(it, style = meta, color = c.ink2, modifier = Modifier.padding(top = 4.dp)) }
            }
        }
    }
}

/**
 * The calibration card (docs/mobile-api.md `calibration`; blueprint 5.2d, P32, decision D36): the web's Next week card
 * in its words, read only: Today's three sizes for the week and why (set by themselves), the capacity's reading, then
 * each suggestion with its basis and its state (on offer, or what stands). Accept and Keep are the web's, which the
 * footer says. No rate and no target (D17). One node for TalkBack; every line may wrap, so it reads the same on the
 * cover screen and in the main display's second pane.
 */
@Composable
private fun CalibrationTile(cal: CheckCalibration, modifier: Modifier = Modifier) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    XCard(modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = CalibrationLine.description(cal) }) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Eyebrow(CalibrationLine.TITLE)
                Spacer(Modifier.width(8.dp))
                Text(cal.label, color = c.ink2, style = meta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(2.dp))
            Text(cal.sizes.line, style = MaterialTheme.typography.titleMedium.figures(), color = c.ink0)
            if (cal.sizes.basis.isNotEmpty()) Text(cal.sizes.basis, style = meta, color = c.ink1)
            Text(CalibrationLine.SIZES_NOTE, style = meta, color = c.ink2)
            cal.capacityNote?.let { Text(it, style = meta, color = c.ink2) }
            for (ch in cal.changes) {
                Spacer(Modifier.height(8.dp))
                Text(ch.title, style = MaterialTheme.typography.bodyMedium, color = c.ink0)
                if (ch.basis.isNotEmpty()) Text(ch.basis, style = meta, color = c.ink2)
                Text(CalibrationLine.stateLine(ch), style = meta, color = c.ink1)
            }
            CalibrationLine.footer(cal)?.let { Text(it, style = meta, color = c.ink2, modifier = Modifier.padding(top = 6.dp)) }
        }
    }
}

/**
 * The Condition card (docs/mobile-api.md `skills`; blueprint 3.1b, P28, decisions D24 and D24b): each idle attribute or
 * skill the server lists, the lowest first, in the web's words ("Body 81% · 13 days idle"), and what never drops. A
 * reading, not a control (one node for TalkBack): the practice that restores it is a tick on Check, a review or a walk.
 * Every line may wrap, so it reads the same on the cover screen and in the main display's second pane.
 */
@Composable
private fun ConditionTile(list: List<CheckSkill>, modifier: Modifier = Modifier) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    XCard(modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = ConditionLine.description(list) }) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Eyebrow(ConditionLine.TITLE)
                Spacer(Modifier.width(8.dp))
                Text(ConditionLine.header(list), color = c.ink2, style = meta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            for (s in list) {
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(ConditionLine.line(s), style = MaterialTheme.typography.bodyMedium, color = c.ink0, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(8.dp))
                    Text(ConditionLine.kindWord(s), style = meta, color = c.ink2, maxLines = 1)
                }
            }
            Text(ConditionLine.NOTE, style = meta, color = c.ink2, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

// ── Not sent (P8) ───────────────────────────────────────────────────────────

/**
 * P8: the Not sent card: each item the queue took out unsent, its name and the line why (the server's own, or the
 * queue's: too old to book, or typed before the day turned). A kept-back line offers Send for today and Discard; every
 * other note, Dismiss. A kept-back line got no answer, so its line says it may already be saved (P8 review): sending
 * it is the user's call.
 */
@Composable
private fun NotSentTile(notes: List<NotSent>, onSend: (String) -> Unit, onDismiss: (String) -> Unit, modifier: Modifier = Modifier) {
    val c = X.c
    val feel = LocalFeel.current
    XCard(modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(c.owed))
                Spacer(Modifier.width(8.dp))
                Eyebrow(SendLine.NOT_SENT_TITLE)
                Spacer(Modifier.width(8.dp))
                Text("${notes.size}", color = c.ink2, style = MaterialTheme.typography.labelMedium)
            }
            notes.asReversed().forEachIndexed { i, n ->
                Spacer(Modifier.height(if (i == 0) 8.dp else 12.dp))
                if (i > 0) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(c.line2))
                    Spacer(Modifier.height(12.dp))
                }
                key(n.item.clientId) {
                    Column(Modifier.semantics(mergeDescendants = true) {}) {
                        Text(SendLine.labelOf(n.item.kind, n.item.label), color = c.ink0, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(2.dp))
                        Text(n.line, color = c.ink2, style = MaterialTheme.typography.bodySmall)
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (n.keptBack) {
                            XButton(SendLine.SEND_FOR_TODAY, { feel?.select(); onSend(n.item.clientId) }, kind = ButtonKind.QUIET, height = 44.dp)
                            XButton(SendLine.DISCARD, { feel?.select(); onDismiss(n.item.clientId) }, kind = ButtonKind.QUIET, height = 44.dp)
                        } else {
                            XButton(SendLine.DISMISS, { feel?.select(); onDismiss(n.item.clientId) }, kind = ButtonKind.QUIET, height = 44.dp)
                        }
                    }
                }
            }
        }
    }
}

// ── Owed cards ──────────────────────────────────────────────────────────────

/**
 * The owed cards (docs/mobile-api.md `owed` and POST /tasks/makeup; blueprint 2.3 and 3.2b, P22, decision D18): the web
 * MakeUpCard in its words, every open debt in one card, oldest first. Each says when it was missed beside its owed chip
 * ("−4.2 owed": the owed hue in words on a quiet chip, never a red wall), its line, its window and what a make-up does
 * (×0.85, the whole debt repaid). Its actions are 48 dp: Make up (the server's price now), Do minimum (with its words) and
 * Accept the loss only where the server offers it. A proof must's chips come first (the minutes it took, a reading
 * must's pages), and Make up waits for them, as its tick does. While the server has Duty off the card shows without its
 * actions. Every line may wrap, so it reads the same on the cover screen and in the main display's first pane. The
 * picks are the view model's (P22 review: a fold or an unfold switches the list's branch, so a row's own state would
 * be dropped), and each row is keyed by its debt, so a card made up above never hands its picks to the next.
 */
@Composable
private fun OwedTile(
    owed: List<OwedItem>,
    dutyOn: Boolean,
    busy: Set<String>,
    picks: Map<String, CheckViewModel.OwedPick>,
    onPick: (OwedItem, Int?, Int?) -> Unit,
    onAction: (OwedItem, String, Int?, Int?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = X.c
    XCard(modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(c.owed))
                Spacer(Modifier.width(8.dp))
                Eyebrow(OwedLine.TITLE)
                Spacer(Modifier.width(8.dp))
                Text(OwedLine.header(owed).removePrefix("${OwedLine.TITLE}: "), color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            owed.forEachIndexed { i, o ->
                Spacer(Modifier.height(if (i == 0) 8.dp else 12.dp))
                if (i > 0) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(c.line2))
                    Spacer(Modifier.height(12.dp))
                }
                key(o.instanceId) { OwedRow(o, dutyOn, o.instanceId in busy, picks[o.instanceId], onPick, onAction) }
            }
        }
    }
}

/** One debt of the Owed card: its words, a proof must's chips, and its actions (none while Duty is off on the server). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OwedRow(o: OwedItem, dutyOn: Boolean, busy: Boolean, pick: CheckViewModel.OwedPick?, onPick: (OwedItem, Int?, Int?) -> Unit, onAction: (OwedItem, String, Int?, Int?) -> Unit) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    val minutes = pick?.minutes
    // A reading must's day target is picked to start with, as the minutes sheet picks it.
    val pages = if (pick != null) pick.pages else o.proof?.pages?.target
    Column {
        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = OwedLine.describe(o) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(o.whenLine.ifBlank { o.title }, style = MaterialTheme.typography.titleSmall, color = c.ink0, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(
                    OwedLine.debtChip(o), color = c.owed, style = MaterialTheme.typography.labelLarge.figures(), maxLines = 1,
                    modifier = Modifier.clip(PillShape).border(BorderStroke(1.dp, c.line2), PillShape).padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
            if (o.text.isNotBlank()) Text(o.text, style = MaterialTheme.typography.bodyMedium, color = c.ink1, modifier = Modifier.padding(top = 4.dp))
            if (o.window.isNotBlank()) Text(o.window, style = meta, color = c.ink2, modifier = Modifier.padding(top = 2.dp))
            Text(OwedLine.rateLine(o), style = meta, color = c.ink2)
        }
        if (!dutyOn) {
            Text(OwedLine.ON_THE_WEB, style = meta, color = c.ink2, modifier = Modifier.padding(top = 6.dp))
        } else {
            val mins = OwedLine.minuteChips(o)
            if (mins.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Eyebrow("Minutes it took")
                Spacer(Modifier.height(6.dp))
                FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (m in mins) XChip("$m min", selected = minutes == m, onClick = { onPick(o, if (minutes == m) null else m, pages) }, height = 48.dp)
                }
            }
            val pgs = OwedLine.pageChips(o)
            if (pgs.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Eyebrow("Pages read")
                Spacer(Modifier.height(6.dp))
                FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (n in pgs) XChip(ProofLine.pagesLabel(n), selected = pages == n, onClick = { onPick(o, minutes, if (pages == n) null else n) }, height = 48.dp)
                }
            }
            OwedLine.needs(o, minutes, pages)?.let { Text(it, style = meta, color = c.ink2, modifier = Modifier.padding(top = 6.dp)) }
            Spacer(Modifier.height(10.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                XButton(
                    OwedLine.makeUpLabel(o),
                    onClick = { onAction(o, OwedLine.MAKEUP, minutes.takeIf { o.proof?.minutes != null }, pages.takeIf { o.proof?.pages != null }) },
                    enabled = !busy && OwedLine.canMakeUp(o, dutyOn, minutes, pages), busy = busy, height = 48.dp,
                )
                OwedLine.minimumLabel(o)?.let { label ->
                    XButton(label, onClick = { onAction(o, OwedLine.MINIMUM, null, null) }, kind = ButtonKind.QUIET, enabled = !busy, height = 48.dp)
                }
                if (o.canAcceptLoss) XButton(OwedLine.ACCEPT, onClick = { onAction(o, OwedLine.ACCEPT_LOSS, null, null) }, kind = ButtonKind.QUIET, enabled = !busy, height = 48.dp)
            }
            OwedLine.minimumWords(o)?.let { Text("Minimum: $it", style = meta, color = c.ink2, modifier = Modifier.padding(top = 6.dp)) }
        }
    }
}

// ── Quest card ──────────────────────────────────────────────────────────────

/**
 * The Quest card (docs/mobile-api.md `GET /quests`; blueprint 2.1 and 2.2, D11, D12): the web's Main quest card in its
 * words. The main quest (its words, "Milestone 2 of 6 · …" with a Gemini title's numbers struck and Gemini's words
 * beside it, its one line), this week's sprint (its count, the server's Sunday words "provisional · final Wed 04:00",
 * its rows with their count lines; none while the milestone is past its day, as on the web) and Today's three. Read
 * only: a row whose task is open on Check above has a 48 dp tick that runs that task's own tick (POST /tasks/complete,
 * its motion and its undo); nothing here starts a milestone or edits the plan (the web's), and nothing is red. A sprint
 * row reads done only when the server says its week's count is met (QuestLine.sprintRow): a session ticked today is
 * said, never a verdict. One node per row for TalkBack; every line may wrap.
 */
@Composable
private fun QuestTile(q: QuestsData, tasks: List<TaskItem>, onTick: (TaskItem) -> Unit, modifier: Modifier = Modifier) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    XCard(modifier.fillMaxWidth()) {
        Column {
            q.mainQuest?.takeIf { QuestLine.showsQuest(it) }?.let { m ->
                Column(Modifier.semantics(mergeDescendants = true) {}) {
                    Eyebrow(QuestLine.TITLE)
                    Spacer(Modifier.height(2.dp))
                    Text(QuestLine.headline(m), style = MaterialTheme.typography.titleMedium, color = c.ink0)
                    QuestLine.milestone(m)?.let { words ->
                        val struck = QuestLine.struck(m)
                        val text = buildAnnotatedString {
                            append(words)
                            for (r in struck) addStyle(SpanStyle(textDecoration = TextDecoration.LineThrough), r.first, r.last + 1)
                        }
                        Text(text, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                    }
                    QuestLine.titleNote(m)?.let { Text(it, style = meta, color = c.ink1) }
                    QuestLine.line(m)?.let { Text(it, style = meta, color = c.ink2) }
                    QuestLine.startLine(m)?.let { Text(it, style = meta, color = c.ink2) }
                    QuestLine.studyLine(m)?.let { Text(it, style = meta, color = c.ink1) }
                    QuestLine.studyNote(m)?.let { Text(it, style = meta, color = c.ink2) }
                }
            }
            q.sprint?.takeIf { QuestLine.showsSprint(it) }?.let { s ->
                Spacer(Modifier.height(12.dp))
                Text(QuestLine.sprintLine(s), style = meta, color = c.ink1)
                for (r in QuestLine.rows(s)) {
                    val task = tasks.firstOrNull { it.templateId == r.templateId }
                    QuestRow(QuestLine.sprintRow(r, task), task, onTick)
                }
            }
            q.three?.takeIf { it.quests.isNotEmpty() }?.let { t ->
                Spacer(Modifier.height(12.dp))
                Text(QuestLine.threeLine(t), style = meta, color = c.ink1)
                for (tq in t.quests) {
                    val task = tasks.firstOrNull { it.templateId == tq.templateId }
                    QuestRow(QuestLine.threeRow(tq, task), task, onTick)
                }
            }
        }
    }
}

/**
 * One row of the Quest card: done or not (QuestLine's row: a mark, never red), its words, and the tick of its task
 * while the task is open on Check and the row is not done.
 */
@Composable
private fun QuestRow(row: QuestLine.Row, task: TaskItem?, onTick: (TaskItem) -> Unit) {
    val c = X.c
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (row.done) c.kept else c.lineCtl))
            Spacer(Modifier.width(10.dp))
            Column {
                Text(row.label, style = MaterialTheme.typography.bodyMedium, color = if (row.done) c.ink2 else c.ink0)
                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.labelMedium, color = c.ink2)
            }
        }
        if (task != null && task.open && !row.done) {
            XIconButton(Glyphs.Tick, "Tick ${task.title}", onClick = { onTick(task) }, tint = c.ink0)
        }
    }
}

// ── A work item ─────────────────────────────────────────────────────────────

/**
 * A work item. Its Done (moment 11): the 52 dp button floods with the work hue and stamps (crisper than a task),
 * its mark draws; the row floods from the button, an overdue clock clears, the title strikes through; at 260 ms
 * the row slides 16 dp toward its end and fades, and at 420 ms it leaves (the list closes the gap on the glide
 * spring). No particles.
 */
@Composable
private fun WorkRow(w: WorkItem, now: String?, closing: Boolean, onDone: () -> Unit, nodKey: Int, modifier: Modifier = Modifier) {
    val c = X.c
    val ctx = LocalContext.current
    val motion = LocalMotion.current
    val feel = LocalFeel.current
    val density = LocalDensity.current
    val phone = w.customer?.phone?.takeIf { it.isNotBlank() }
    val dueAt = TimeLabels.parseInstant(w.dueAt)
    val nowAt = TimeLabels.parseInstant(now) ?: Instant.now()
    val due = dueAt?.let { TimeLabels.due(it, nowAt, w.allDay, h24 = DateFormat.is24HourFormat(ctx)) }
    val channelIcon = when (w.channel) { "CALL" -> Glyphs.Phone; "EMAIL" -> Glyphs.Mail; "VISIT" -> Glyphs.Pin; "MESSAGE" -> Glyphs.Message; else -> Glyphs.Clock }
    fun open(uri: String, action: String) {
        try {
            ctx.startActivity(Intent(action, Uri.parse(uri)))
        } catch (_: ActivityNotFoundException) {
        }
    }
    val dial = phone?.filter { it.isDigit() || it == '+' }
    // Toward the trailing edge.
    val toEnd = if (androidx.compose.ui.platform.LocalLayoutDirection.current == androidx.compose.ui.unit.LayoutDirection.Rtl) -1f else 1f
    val flood = remember { Animatable(0f) }
    val strike = remember { Animatable(0f) }
    val debt = remember { Animatable(0f) }
    val slide = remember { Animatable(0f) }
    val fade = remember { Animatable(1f) }
    LaunchedEffect(closing) {
        if (!closing) {
            flood.snapTo(0f); strike.snapTo(0f); debt.snapTo(0f); slide.snapTo(0f); fade.snapTo(1f)
            return@LaunchedEffect
        }
        when (motion) {
            MotionLevel.STILL -> { flood.snapTo(1f); strike.snapTo(1f); debt.snapTo(1f) }
            MotionLevel.CALM -> coroutineScope {
                launch { flood.animateTo(1f, tween(160)) }
                launch { debt.animateTo(1f, tween(160)) }
                launch { strike.animateTo(1f, tween(160)) }
                launch { delay(200); fade.animateTo(0f, tween(120)) }
            }
            MotionLevel.FULL -> coroutineScope {
                launch { delay(40); flood.animateTo(1f, tween(200, easing = EaseOut)) }
                launch { delay(60); debt.animateTo(1f, tween(160)) }
                launch { delay(90); strike.animateTo(1f, tween(180, easing = EaseInOut)) }
                // T + 260: it slides toward its end and fades; the list closes the gap at T + 420.
                launch { delay(260); launch { fade.animateTo(0f, tween(160, easing = EaseIn)) }; slide.animateTo(1f, tween(160, easing = EaseIn)) }
            }
        }
    }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    var rowAt by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var buttonAt by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val workWash = c.wash(c.work, 0.12f)
    val strikeColor = c.ink2
    Column(
        modifier
            .graphicsLayer {
                translationX = slide.value * 16.dp.toPx() * toEnd
                alpha = fade.value
            }
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .onGloballyPositioned { rowAt = it }
            .clip(CardShape)
            .background(c.card)
            .flood(
                progress = { flood.value },
                origin = {
                    val r = rowAt
                    val b = buttonAt
                    if (r != null && b != null && r.isAttached && b.isAttached) r.localPositionOf(b, Offset(b.size.width / 2f, b.size.height / 2f)) else Offset.Zero
                },
                color = workWash, shape = CardShape, radial = { motion == MotionLevel.FULL },
            )
            .drawWithCache {
                val outline = CardShape.createOutline(size, layoutDirection, this)
                val path = Path().apply { addOutline(outline) }
                val stroke = Stroke(1.dp.toPx())
                val line = c.line1
                onDrawWithContent { drawContent(); drawPath(path, line, style = stroke) }
            }
            .padding(start = 12.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(c.wash(c.work, 0.18f)), contentAlignment = Alignment.Center) {
                Icon(channelIcon, null, tint = c.work, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    w.title, style = MaterialTheme.typography.titleMedium, color = c.ink0, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    onTextLayout = { layout = it },
                    modifier = Modifier.drawWithContent {
                        drawContent()
                        val l = layout ?: return@drawWithContent
                        val p = strike.value
                        if (p <= 0f) return@drawWithContent
                        for (i in 0 until l.lineCount) {
                            val y = (l.getLineTop(i) + l.getLineBottom(i)) / 2
                            val lp = ((p * l.lineCount) - i).coerceIn(0f, 1f)
                            if (lp > 0f) drawLine(strikeColor, Offset(l.getLineLeft(i), y), Offset(l.getLineLeft(i) + (l.getLineRight(i) - l.getLineLeft(i)) * lp, y), strokeWidth = 1.5.dp.toPx())
                        }
                    },
                )
                w.customer?.let { cu ->
                    Text(
                        cu.name + (cu.number?.let { " · #$it" } ?: ""),
                        style = MaterialTheme.typography.bodyMedium, color = c.ink1, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (due != null) {
                        // The debt clears: an overdue clock and its words crossfade from owed to ink (two layers, no recomposition).
                        Box {
                            Icon(Glyphs.Clock, null, tint = c.ink2, modifier = Modifier.size(13.dp).graphicsLayer { alpha = if (w.overdue) debt.value else 1f })
                            if (w.overdue) Icon(Glyphs.Clock, null, tint = c.owed, modifier = Modifier.size(13.dp).graphicsLayer { alpha = 1f - debt.value })
                        }
                        Spacer(Modifier.width(4.dp))
                        Box {
                            Text(due, color = c.ink1, style = MaterialTheme.typography.labelMedium, maxLines = 1, modifier = Modifier.graphicsLayer { alpha = if (w.overdue) debt.value else 1f })
                            if (w.overdue) Text(due, color = c.owed, style = MaterialTheme.typography.labelMedium, maxLines = 1, modifier = Modifier.graphicsLayer { alpha = 1f - debt.value })
                        }
                    }
                    val rest = listOfNotNull(w.collection, w.boardName).joinToString(" · ")
                    if (rest.isNotEmpty()) Text((if (due != null) " · " else "") + rest, color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.width(6.dp))
            val source = remember { MutableInteractionSource() }
            val pressed by source.collectIsPressedAsState()
            Box(
                Modifier
                    .size(52.dp)
                    .onGloballyPositioned { buttonAt = it }
                    .clip(CircleShape)
                    .background(c.wash(c.work, 0.18f))
                    .doneClickable(source, enabled = !closing, label = "Done: ${w.title}") {
                        feel?.work("work:${w.id}")
                        onDone()
                    },
                contentAlignment = Alignment.Center,
            ) {
                // The same check as a task's, in the work hue, a little lighter.
                CheckCircle(
                    closing, size = 52.dp, ring = Color.Transparent, fill = c.work, mark = c.onWork, pressed = { pressed },
                    stamp = StampSpec.Work, nodKey = nodKey,
                )
                if (!closing) Icon(Glyphs.Tick, null, tint = c.work, modifier = Modifier.size(22.dp))
            }
        }
        // Call and Text sit under the words, in thumb reach, so the title keeps the width.
        if (dial != null) {
            Row(Modifier.padding(start = 48.dp, top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                XButton("Call", { open("tel:$dial", Intent.ACTION_DIAL) }, kind = ButtonKind.QUIET, icon = Glyphs.Phone, height = 44.dp)
                XButton("Text", { open("smsto:$dial", Intent.ACTION_SENDTO) }, kind = ButtonKind.QUIET, icon = Glyphs.Message, height = 44.dp)
            }
        }
    }
}

/** A round button's click: a bounded ripple, a button role, an accessible label. */
private fun Modifier.doneClickable(source: MutableInteractionSource, enabled: Boolean, label: String, onClick: () -> Unit): Modifier =
    this.then(
        Modifier.clickable(
            interactionSource = source, indication = ripple(bounded = true), enabled = enabled, role = Role.Button,
            onClickLabel = label, onClick = onClick,
        ).semantics { contentDescription = label }
    )

// ── Loading and can't-reach ─────────────────────────────────────────────────

@Composable
private fun LoadingBoard(top: androidx.compose.ui.unit.Dp) {
    val c = X.c
    val motion = LocalMotion.current
    val shimmer = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        if (!motion.moves) return@LaunchedEffect
        while (true) { shimmer.snapTo(0f); shimmer.animateTo(1f, tween(1100)) }
    }
    Column(Modifier.fillMaxSize().padding(start = 16.dp, end = 16.dp, top = top + 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(5) { i ->
            Box(
                Modifier.fillMaxWidth().height(if (i == 0) 72.dp else 64.dp).clip(CardShape).background(c.card)
                    .drawWithContent {
                        drawContent()
                        val x = size.width * (shimmer.value * 1.6f - 0.3f)
                        drawRect(Brush.horizontalGradient(listOf(Color.Transparent, c.line2, Color.Transparent), x - 120f, x + 120f))
                    }
            )
        }
    }
}

@Composable
private fun CantReach(message: String, top: androidx.compose.ui.unit.Dp, onRetry: () -> Unit, onSettings: () -> Unit, onDemo: () -> Unit) {
    val c = X.c
    Column(
        Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = top + 24.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Glyphs.Offline, null, tint = c.ink2, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(16.dp))
        Text("Can't reach XTNL", style = MaterialTheme.typography.headlineSmall, color = c.ink0)
        Spacer(Modifier.height(8.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = c.ink1, modifier = Modifier.widthIn(max = 420.dp))
        Spacer(Modifier.height(24.dp))
        XButton("Retry", onRetry, Modifier.widthIn(min = 220.dp), icon = Glyphs.Refresh)
        Spacer(Modifier.height(8.dp))
        XButton("Server settings", onSettings, Modifier.widthIn(min = 220.dp), kind = ButtonKind.QUIET, icon = Glyphs.Settings)
        Spacer(Modifier.height(8.dp))
        XButton("Try demo data", onDemo, Modifier.widthIn(min = 220.dp), kind = ButtonKind.QUIET)
    }
}

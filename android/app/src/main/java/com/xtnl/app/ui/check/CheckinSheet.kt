package com.xtnl.app.ui.check

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.coerceAtLeast
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import com.xtnl.app.core.CheckinLine
import com.xtnl.app.data.CheckinState
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.CardShape
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.motion.LocalFeel
import com.xtnl.app.ui.theme.X

/** Above this the grid grows no more (its cells are 53 dp there). */
private val GRID_MAX = 480.dp

/** Never smaller than this: 9 cells of 40 dp (on the cover screen they are 49 dp, its width less the margins). */
private val GRID_MIN = 360.dp

/** What the stacked sheet needs besides the grid (its title, the stress row, Save and Lifeline, the system bars). */
private const val STACKED_RESERVE_DP = 300

/** And the side-by-side sheet (the title and the system bars). */
private const val WIDE_RESERVE_DP = 170

/** The side-by-side sheet needs this much height (its stress column, Save and Lifeline); a shorter window stacks. */
internal const val WIDE_MIN_HEIGHT_DP = 560

/**
 * The check-in sheet (health phase 2; docs/life-plan/health-2026-10-27.md D1, D2, D5, the brief's §2.1, §2.6): the one
 * sheet the Check row, the "Check in" tile, the cover widget's button and the launcher shortcut open (AppRoot holds it,
 * so it opens over any screen). Its rules and words are core/CheckinLine's (the web's mind.ts).
 *
 *   1  the 9 × 9 grid, ONE control ([MoodGrid]): a tap picks pleasantness and energy, which is all a check-in needs
 *   2  "How stressed are you right now?": five labelled levels. Once the grid is picked a tap on one SAVES (tap 2, the
 *      web sheet's rule); before it, it only picks (a second tap clears). Save saves the grid alone.
 *   +  "Need to talk? Lifeline 13 11 14", always visible, a tap that opens the dialer with the number filled in
 *      (ACTION_DIAL: the user presses call; no permission)
 *
 * The pick's words show under nothing but the grid itself (its corner words are drawn on it): the receipt after Save
 * is the snackbar's (CheckEvents). One neutral haptic at save (feel/Scores.checkIn), the same for every value; no
 * colour, no praise, no count. The time from opening to saving is measured ([CheckinLine.tookMs]). On the cover screen
 * the grid takes the width less 16 dp margins (475 dp: 49 dp cells); on the main display sideways it sits beside the
 * stress levels, so everything is in reach without scrolling. The Lifeline line sits under the scroll, never in it, so
 * at any height (the cover turned sideways, a split screen) it stays on screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckinSheet(via: String, onDismiss: () -> Unit, onSave: (cell: CheckinLine.Cell, stress: Int?, tookMs: Long?) -> Unit) {
    val c = X.c
    val feel = LocalFeel.current
    val config = LocalConfiguration.current
    var valence by rememberSaveable { mutableStateOf<Int?>(null) }
    var energy by rememberSaveable { mutableStateOf<Int?>(null) }
    var stress by rememberSaveable { mutableStateOf<Int?>(null) }
    // The 5-second clock runs from the sheet's opening to its save (kept across a fold: the activity isn't recreated).
    val openedAt = rememberSaveable { SystemClock.elapsedRealtime() }
    var saved by remember { mutableStateOf(false) }
    val v = valence
    val e = energy
    val cell = if (v != null && e != null) CheckinLine.Cell(v, e) else null
    fun save(level: Int?) {
        val pick = cell ?: return
        if (saved) return
        saved = true
        feel?.checkIn("checkin:$via")
        onSave(pick, level, CheckinLine.tookMs(openedAt, SystemClock.elapsedRealtime()))
    }
    val pick: (CheckinLine.Cell) -> Unit = { next -> valence = next.valence; energy = next.energy }
    val onStress: (Int) -> Unit = { i ->
        if (CheckinLine.stressSaves(cell)) {
            stress = i
            save(i)
        } else {
            stress = if (stress == i) null else i
        }
    }
    // Sideways on the main display: the grid beside the stress levels, so all of it fits the height. The cover turned
    // sideways (751 × 475) and a short split screen stack, and scroll.
    val wide = isWide(config.screenWidthDp, config.screenHeightDp)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = c.overlay,
        dragHandle = null,
        sheetMaxWidth = if (wide) 880.dp else 600.dp,
    ) {
        // The sheet's ColumnScope is bounded by the window: the scroll takes what is left over the Lifeline line, so the
        // line is always on screen (health-2026-10-27.md §Safety), however short the window (the cover turned sideways).
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Column(
                Modifier
                    .weight(1f, fill = false)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(top = 8.dp),
            ) {
                SheetHead(onDismiss)
                Spacer(Modifier.height(8.dp))
                if (wide) {
                    val side = min(GRID_MAX, (config.screenHeightDp - WIDE_RESERVE_DP).dp).coerceAtLeast(GRID_MIN)
                    Row(verticalAlignment = Alignment.Top) {
                        MoodGrid(cell, pick, Modifier.size(side))
                        Spacer(Modifier.width(20.dp))
                        Column(Modifier.width(280.dp)) {
                            StressLevels(stress, CheckinLine.stressSaves(cell), vertical = true, onTap = onStress)
                            Spacer(Modifier.height(12.dp))
                            XButton(CheckinLine.SAVE, { save(stress) }, Modifier.fillMaxWidth(), enabled = cell != null, height = 48.dp)
                        }
                    }
                } else {
                    BoxWithConstraints(Modifier.fillMaxWidth()) {
                        val side = min(min(maxWidth, GRID_MAX), (config.screenHeightDp - STACKED_RESERVE_DP).dp.coerceAtLeast(GRID_MIN))
                        MoodGrid(cell, pick, Modifier.size(side).align(Alignment.TopCenter))
                    }
                    Spacer(Modifier.height(12.dp))
                    StressLevels(stress, CheckinLine.stressSaves(cell), vertical = false, onTap = onStress)
                }
            }
            if (wide) {
                LifelineLine(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 12.dp))
            } else {
                // Stacked: Lifeline and Save share the line under the scroll, as they always did, so both stay on screen.
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    LifelineLine(Modifier.weight(1f))
                    Spacer(Modifier.width(8.dp))
                    XButton(CheckinLine.SAVE, { save(stress) }, enabled = cell != null, height = 48.dp)
                }
            }
        }
    }
}

/** The side-by-side sheet: a sideways window wide enough for both columns and tall enough for the stress column. */
internal fun isWide(widthDp: Int, heightDp: Int): Boolean = widthDp > heightDp && widthDp >= 700 && heightDp >= WIDE_MIN_HEIGHT_DP

@Composable
private fun SheetHead(onDismiss: () -> Unit) {
    val c = X.c
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(CheckinLine.TITLE, color = c.ink0, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Text(CheckinLine.QUESTION, color = c.ink2, style = MaterialTheme.typography.bodySmall)
        }
        XIconButton(Glyphs.Close, CheckinLine.CLOSE, onDismiss)
    }
}

/**
 * The mood grid (mind.ts's MindGrid on the phone): pleasantness across, energy up, 9 × 9 steps, drawn as four soft
 * quadrants in two neutral shades (diagonal pairs alike, so no area reads as the good one) with their corner words and
 * the four axis words. ONE control, never 81 buttons: a tap snaps to its cell; TalkBack hears its name and its value in
 * words, and its actions step one cell (More or Less pleasant, More or Less energy; a double tap picks the centre while
 * nothing is picked); a keyboard's arrows step it too. The pick is an ink dot, the same for every cell. Nothing animates.
 */
@Composable
internal fun MoodGrid(cell: CheckinLine.Cell?, onPick: (CheckinLine.Cell) -> Unit, modifier: Modifier = Modifier) {
    val c = X.c
    val feel = LocalFeel.current
    val measurer = rememberTextMeasurer()
    val corner = TextStyle(color = c.ink1, fontSize = 12.sp)
    val axis = TextStyle(color = c.ink2, fontSize = 12.sp)
    val latest by rememberUpdatedState(onPick)
    val current by rememberUpdatedState(cell)
    val pick: (CheckinLine.Cell) -> Unit = { next ->
        feel?.select()
        latest(next)
    }
    fun step(dx: Int, dy: Int): Boolean {
        pick(CheckinLine.move(current, dx, dy))
        return true
    }
    Canvas(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, c.line2, RoundedCornerShape(12.dp))
            .semantics {
                contentDescription = CheckinLine.GRID_LABEL
                stateDescription = CheckinLine.valueText(cell)
                customActions = listOf(
                    CustomAccessibilityAction("More pleasant") { step(1, 0) },
                    CustomAccessibilityAction("Less pleasant") { step(-1, 0) },
                    CustomAccessibilityAction("More energy") { step(0, 1) },
                    CustomAccessibilityAction("Less energy") { step(0, -1) },
                )
                onClick(label = if (cell == null) "Pick the centre" else "Keep this pick") {
                    pick(cell ?: CheckinLine.Cell(0, 0))
                    true
                }
            }
            .onKeyEvent { ev ->
                if (ev.type != KeyEventType.KeyDown) return@onKeyEvent false
                when (ev.key) {
                    Key.DirectionLeft -> step(-1, 0)
                    Key.DirectionRight -> step(1, 0)
                    Key.DirectionUp -> step(0, 1)
                    Key.DirectionDown -> step(0, -1)
                    Key.Enter, Key.NumPadEnter, Key.Spacebar -> step(0, 0)
                    else -> false
                }
            }
            .focusable()
            .pointerInput(Unit) {
                detectTapGestures { p -> CheckinLine.cellAt(p.x, p.y, size.width.toFloat(), size.height.toFloat())?.let(pick) }
            },
    ) {
        val w = size.width
        val h = size.height
        val cw = w / CheckinLine.STEPS
        val ch = h / CheckinLine.STEPS
        // The four quadrants, split through the middle cell: tense and calm one shade, excited and low the other.
        val shadeA = c.raised
        val shadeB = c.sunken
        drawRect(shadeA, Offset.Zero, Size(w / 2, h / 2))
        drawRect(shadeB, Offset(w / 2, 0f), Size(w / 2, h / 2))
        drawRect(shadeB, Offset(0f, h / 2), Size(w / 2, h / 2))
        drawRect(shadeA, Offset(w / 2, h / 2), Size(w / 2, h / 2))
        // The cells, hairlines; the two axes through the middle, a little stronger.
        val hair = 1.dp.toPx()
        for (i in 1 until CheckinLine.STEPS) {
            drawLine(c.line1, Offset(i * cw, 0f), Offset(i * cw, h), hair)
            drawLine(c.line1, Offset(0f, i * ch), Offset(w, i * ch), hair)
        }
        drawLine(c.line2, Offset(w / 2, 0f), Offset(w / 2, h), 1.5.dp.toPx())
        drawLine(c.line2, Offset(0f, h / 2), Offset(w, h / 2), 1.5.dp.toPx())
        // The corner words, in each quadrant's outer corner.
        val pad = 10.dp.toPx()
        val maxW = (w / 2 - pad * 2).toInt().coerceAtLeast(1)
        fun word(text: String, style: TextStyle, x: (Float) -> Float, y: (Float) -> Float, maxWidth: Int = maxW, centred: Boolean = false) {
            val r = measurer.measure(text, style.copy(textAlign = if (centred) TextAlign.Center else TextAlign.Start), maxLines = 2, overflow = TextOverflow.Ellipsis, constraints = Constraints(maxWidth = maxWidth))
            drawText(r, topLeft = Offset(x(r.size.width.toFloat()), y(r.size.height.toFloat())))
        }
        word(CheckinLine.Quadrant.TENSE.words, corner, { pad }, { pad })
        word(CheckinLine.Quadrant.EXCITED.words, corner, { tw -> w - pad - tw }, { pad })
        word(CheckinLine.Quadrant.LOW.words, corner, { pad }, { th -> h - pad - th })
        word(CheckinLine.Quadrant.CALM.words, corner, { tw -> w - pad - tw }, { th -> h - pad - th })
        // The axes' words at the middle of each edge, on a small plate so the axis line never runs through them.
        val plate = 4.dp.toPx()
        fun axisWord(text: String, x: (Float) -> Float, y: (Float) -> Float) {
            val r = measurer.measure(text, axis, maxLines = 1)
            val tl = Offset(x(r.size.width.toFloat()), y(r.size.height.toFloat()))
            drawRoundRect(c.overlay, tl - Offset(plate, plate / 2), Size(r.size.width + plate * 2, r.size.height + plate), CornerRadius(plate * 1.5f))
            drawText(r, topLeft = tl)
        }
        val edge = 6.dp.toPx()
        axisWord(CheckinLine.HIGH_ENERGY, { tw -> (w - tw) / 2 }, { edge })
        axisWord(CheckinLine.LOW_ENERGY, { tw -> (w - tw) / 2 }, { th -> h - edge - th })
        axisWord(CheckinLine.UNPLEASANT, { edge + plate }, { th -> (h - th) / 2 })
        axisWord(CheckinLine.PLEASANT, { tw -> w - edge - plate - tw }, { th -> (h - th) / 2 })
        // The pick: an ink dot in its cell, the same for every cell.
        cell?.let { p ->
            val (fx, fy) = CheckinLine.centreOf(p)
            val centre = Offset(fx * w, fy * h)
            val r = (minOf(cw, ch) * 0.26f).coerceAtLeast(7.dp.toPx())
            drawCircle(c.ink0.copy(alpha = 0.18f), r * 1.75f, centre)
            drawCircle(c.ink0, r * 1.75f, centre, style = Stroke(2.dp.toPx()))
            drawCircle(c.ink0, r, centre)
        }
    }
}

/**
 * The five stress levels (Elo's single item), each a 48 dp target with its whole label (two lines when it needs them).
 * In a row under the grid, or a column beside it on the main display sideways. With the grid picked a tap saves.
 */
@Composable
private fun StressLevels(stress: Int?, saves: Boolean, vertical: Boolean, onTap: (Int) -> Unit) {
    val c = X.c
    Text(CheckinLine.STRESS_QUESTION, color = c.ink1, style = MaterialTheme.typography.labelLarge)
    Spacer(Modifier.height(6.dp))
    val levels: @Composable (Modifier) -> Unit = { m ->
        CheckinLine.STRESS_LEVELS.forEachIndexed { i, label ->
            StressButton(label, selected = stress == i, saves = saves, modifier = m, onClick = { onTap(i) })
        }
    }
    if (vertical) {
        Column(Modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) { levels(Modifier.fillMaxWidth()) }
    } else {
        Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(6.dp)) { levels(Modifier.weight(1f)) }
    }
}

@Composable
private fun StressButton(label: String, selected: Boolean, saves: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = X.c
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(if (selected) c.ink0.copy(alpha = 0.12f) else c.raised)
            .border(1.dp, if (selected) c.ink0.copy(alpha = 0.9f) else c.line2, shape)
            .clickable(role = Role.Button, onClickLabel = if (saves) "Save with this" else "Pick", onClick = onClick)
            .semantics { this.selected = selected }
            .padding(horizontal = 4.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label, color = if (selected) c.ink0 else c.ink1, fontSize = 13.sp, lineHeight = 16.sp, textAlign = TextAlign.Center,
            maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * "Need to talk? Lifeline 13 11 14" (health-2026-10-27.md §Safety: always visible), a 48 dp tap that opens the dialer
 * with the number filled in. ACTION_DIAL, never ACTION_CALL: the user presses call, and the app asks for no permission.
 */
@Composable
internal fun LifelineLine(modifier: Modifier = Modifier) {
    val c = X.c
    val ctx = LocalContext.current
    Row(
        modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(role = Role.Button, onClickLabel = "Open the dialer") {
                try {
                    ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse(CheckinLine.LIFELINE_TEL)))
                } catch (_: ActivityNotFoundException) {
                }
            }
            .semantics(mergeDescendants = true) { contentDescription = CheckinLine.SAFETY_LABEL }
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Phone, null, tint = c.ink1, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(CheckinLine.SAFETY_FOOTER, color = c.ink1, style = MaterialTheme.typography.labelMedium)
    }
}

/**
 * Check's "Check in" row (health phase 2; D3), directly under the header on both displays: one tap opens the sheet. It
 * never shows a count, a colour judgement or an ask; only when the last check-in was, today ("Checked in 14:32"), the
 * time alone. Shown only while the server's check-in is live and not paused (CheckinLine.shows).
 */
@Composable
internal fun CheckinRow(state: CheckinState?, today: String?, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val c = X.c
    val last = CheckinLine.lastLine(state, today)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(CardShape)
            .background(c.card)
            .border(1.dp, c.line1, CardShape)
            .clickable(role = Role.Button, onClickLabel = "Open the check-in", onClick = onOpen)
            .semantics(mergeDescendants = true) {}
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Checkin, null, tint = c.ink1, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(CheckinLine.TITLE, color = c.ink0, style = MaterialTheme.typography.titleSmall)
            last?.let { Text(it, color = c.ink2, style = MaterialTheme.typography.labelMedium) }
        }
        Icon(Glyphs.Chevron, null, tint = c.ink2, modifier = Modifier.size(18.dp))
    }
}

/** The grid's side for the cover screen's width less the margins (ScreensTest checks the 49 dp cells against it). */
internal fun gridSideFor(widthDp: Int, heightDp: Int): Dp =
    min(min((widthDp - 32).dp, GRID_MAX), (heightDp - STACKED_RESERVE_DP).dp.coerceAtLeast(GRID_MIN))

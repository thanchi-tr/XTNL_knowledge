package com.xtnl.app.ui.check

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.xtnl.app.core.ProofLine
import com.xtnl.app.data.TaskItem
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XChip
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.delay
import java.time.Instant

/** How often a running timer's figure moves: a minute's figure needs no more. */
private const val RUNNING_REFRESH_MS = 15_000L

/**
 * The minutes sheet (blueprint P7 and P23; the web drawer's chips): a long press on any open row, and the tap on a proof
 * row that has no timer run (or one that must ask first: across 04:00, or past twice its estimate). The chips pick what
 * it took (10 to 90 min; a proof row's span its estimate, half to twice it); the server counts them with the drawer's
 * clamp, and the sheet says when that moves them; Done ticks it with them. On a proof row the timer starts, stops and
 * resumes here too, and Done waits for minutes or a timer that has run (the server would refuse it: "Log the
 * minutes"). Picked minutes count instead of the timer's (the server closes it). The minimum version is one tap here,
 * as before, and never needs minutes. Its controls are 48 dp; the sheet keeps to 560 dp wide, so it reads the same on
 * the cover screen and on the main display.
 *
 * A reading task (P24, `pages` on its row) shows its page chips first, the day's target picked ("Done · 30 pages"), and
 * Done waits for at least that many (the server would refuse fewer: "Log the pages"). The minimum still needs none.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MinutesSheet(
    task: TaskItem,
    /** /check's life day: a timer that started on another (it ran across 04:00) asks before Done counts it. */
    today: String? = null,
    onDismiss: () -> Unit,
    onDone: (minutes: Int?, sessionId: String?, pages: Int?) -> Unit,
    onMinimum: () -> Unit,
    onStartTimer: () -> Unit,
    onStopTimer: () -> Unit,
) {
    val c = X.c
    var picked by rememberSaveable(task.templateId) { mutableStateOf<Int?>(null) }
    // P24: a reading task's pages, the day's target picked to start with (one tap from "Done · 30 pages").
    var pickedPages by rememberSaveable(task.templateId) { mutableStateOf(task.pages?.target) }
    var now by remember { mutableStateOf(Instant.now()) }
    val running = task.timer?.running == true
    LaunchedEffect(running) {
        now = Instant.now()
        while (running) {
            delay(RUNNING_REFRESH_MS)
            now = Instant.now()
        }
    }
    val timerMinutes = task.timer?.let { ProofLine.timerMinutes(it, now) }
    val timerRan = task.proof && (timerMinutes ?: 0) >= 1
    // A timer across 04:00 or past twice the estimate: the sheet says so, and its Done is the confirmation.
    val timerAsk = if (timerRan && picked == null) task.timer?.let { ProofLine.timerAsk(it, today, task.minutes, now) } else null
    val pagesNeeded = ProofLine.needsPages(task, pickedPages)
    val canDone = (!task.proof || picked != null || timerRan) && !pagesNeeded
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.overlay) {
        Column(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .align(Alignment.CenterHorizontally)
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
                .navigationBarsPadding(),
        ) {
            Text(
                task.title, color = c.ink0, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
            task.pages?.let { pages ->
                Spacer(Modifier.height(12.dp))
                Eyebrow("Pages read")
                Spacer(Modifier.height(8.dp))
                FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (n in ProofLine.pageChips(pages.target)) {
                        XChip(ProofLine.pagesLabel(n), selected = pickedPages == n, onClick = { pickedPages = if (pickedPages == n) null else n }, height = 48.dp)
                    }
                }
                if (pagesNeeded && pages.target != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(ProofLine.needsPagesLine(pages.target), color = c.ink2, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(12.dp))
            Eyebrow("Minutes it took")
            Spacer(Modifier.height(8.dp))
            FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (m in ProofLine.chips(task.minutes, task.proof)) {
                    XChip("$m min", selected = picked == m, onClick = { picked = if (picked == m) null else m }, height = 48.dp)
                }
            }
            val note = when {
                picked != null && timerRan -> listOfNotNull(ProofLine.countsLine(picked, task.minutes), ProofLine.PICKED_OVER_TIMER).joinToString(" ")
                picked == null && timerRan -> timerAsk ?: ProofLine.timerCountsLine(timerMinutes ?: 0, task.minutes)
                else -> ProofLine.countsLine(picked, task.minutes)
            }
            note?.takeIf { it.isNotEmpty() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = c.ink2, style = MaterialTheme.typography.bodySmall)
            }
            if (task.proof) {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        task.timer?.let { ProofLine.timerLabel(it, now) } ?: "No timer yet",
                        color = if (running) c.ink0 else c.ink1, style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                    )
                    Spacer(Modifier.width(8.dp))
                    when {
                        running -> XButton("Stop timer", onClick = onStopTimer, kind = ButtonKind.QUIET, height = 48.dp)
                        task.timer == null -> XButton("Start timer", onClick = onStartTimer, kind = ButtonKind.QUIET, height = 48.dp)
                        // A stopped timer is no dead end: Resume adds a segment the tick counts with the first.
                        else -> XButton("Resume timer", onClick = onStartTimer, kind = ButtonKind.QUIET, height = 48.dp)
                    }
                }
                if (!canDone) {
                    Spacer(Modifier.height(8.dp))
                    Text(ProofLine.NEEDS_MINUTES, color = c.ink2, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(16.dp))
            XButton(
                ProofLine.doneLabel(picked, timerMinutes.takeIf { task.proof }, task.proof, task.minutes, pickedPages.takeIf { task.pages != null }, pagesNeeded),
                onClick = { onDone(picked, if (picked == null && timerRan) task.timer?.sessionId else null, pickedPages.takeIf { task.pages != null }) },
                enabled = canDone,
                modifier = Modifier.fillMaxWidth(),
            )
            task.mvv?.let { m ->
                Spacer(Modifier.height(8.dp))
                XButton("Kept the minimum: $m", onClick = onMinimum, kind = ButtonKind.QUIET, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

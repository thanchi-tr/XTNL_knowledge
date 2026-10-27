package com.xtnl.app.ui.check

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.xtnl.app.core.SetLine
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XCard
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.delay

/** How often the rest's figure moves (a second's figure needs no more). */
private const val REST_TICK_MS = 250L

/**
 * The open lift on Check (health phase 2; docs/mobile-api.md /check's `lift`, POST /lift/set; D12): "Lift · Push day",
 * then "Next: Bench press 60 kg × 8" and its ✓, a 56 dp target. The ✓ sends the next set as /check named it (the last
 * lift's figures, CheckViewModel.logSet); with no answer it waits on the phone (SET) and the card says so, offering no
 * second ✓ until it lands (the next set is the server's to name). After a set, the rest the server gives counts down,
 * with the server's line. A big jump stands as a record: its question (Keep, Confirm, Fix) is the web's, so the card
 * says so and opens Train › Exercise. A next with nothing to copy, and every row done, are the web's too.
 *
 * Shown only while /check says a lift is open; the same card on the cover screen and in the main display's first pane.
 * A record (D12): no XP, no moment, no colour.
 */
@Composable
internal fun LiftCard(ui: CheckViewModel.Ui, onSet: () -> Unit, onOpenWeb: (String) -> Unit, modifier: Modifier = Modifier) {
    val c = X.c
    val lift = ui.lift ?: return
    val next = lift.next
    // The card's own lines are this lift's: another lift (or a new one) starts clean.
    val mine = ui.setFor == lift.sessionId
    val waiting = ui.setsWaiting
    val restEnds = ui.restEndsAtMs.takeIf { mine }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(restEnds) {
        now = System.currentTimeMillis()
        while (restEnds != null && SetLine.restLeftMs(restEnds, now) > 0) {
            delay(REST_TICK_MS)
            now = System.currentTimeMillis()
        }
    }
    XCard(modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Glyphs.Lift, null, tint = c.ink2, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Eyebrow(SetLine.title(lift))
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                    Text(
                        SetLine.nextLine(next) ?: SetLine.ALL_DONE, color = c.ink0, style = MaterialTheme.typography.titleMedium,
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                    )
                    next?.let { Text(SetLine.detail(it), color = c.ink2, style = MaterialTheme.typography.labelMedium) }
                }
                if (next != null && SetLine.canTick(next)) {
                    Spacer(Modifier.width(8.dp))
                    XIconButton(
                        Glyphs.Tick, SetLine.doneLabel(next), onSet, size = 56.dp, bg = c.raised, tint = c.ink0,
                        enabled = waiting == 0 && !ui.setPending,
                    )
                }
            }
            if (restEnds != null) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Glyphs.Clock, null, tint = c.ink1, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(SetLine.restText(SetLine.restLeftMs(restEnds, now)), color = c.ink1, style = MaterialTheme.typography.labelLarge)
                }
            }
            if (mine) ui.setLine?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, color = c.ink2, style = MaterialTheme.typography.bodySmall)
            }
            if (waiting > 0) {
                Spacer(Modifier.height(4.dp))
                Text(SetLine.WAITING, color = c.ink2, style = MaterialTheme.typography.bodySmall)
            }
            val jump = ui.jump.takeIf { mine }
            val webNote = when {
                jump != null -> jump.line
                next == null -> SetLine.ALL_DONE_NOTE
                !SetLine.canTick(next) -> SetLine.NOTHING_TO_COPY
                else -> null
            }
            if (webNote != null) {
                Spacer(Modifier.height(8.dp))
                Text(webNote, color = c.ink1, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                XButton(SetLine.OPEN_WEB, { onOpenWeb(jump?.webHref ?: SetLine.WEB_HREF) }, kind = ButtonKind.QUIET, icon = Glyphs.Globe, height = 44.dp)
            }
        }
    }
}

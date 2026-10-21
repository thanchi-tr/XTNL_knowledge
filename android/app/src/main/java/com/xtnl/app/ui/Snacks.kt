package com.xtnl.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.xtnl.app.ui.components.CtlShape
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.theme.X
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

enum class SnackTone { PLAIN, KEPT, ERROR }

class XSnack(
    override val message: String,
    override val actionLabel: String?,
    val tone: SnackTone,
    override val duration: SnackbarDuration,
) : SnackbarVisuals {
    override val withDismissAction: Boolean = false
}

/**
 * One snackbar at a time, the newest wins (a run of ticks never queues a
 * line of Undos). [show] runs [onAction] when the action is tapped.
 */
class Snacks(val host: SnackbarHostState, private val scope: CoroutineScope) {
    fun show(
        message: String,
        action: String? = null,
        tone: SnackTone = SnackTone.PLAIN,
        long: Boolean = false,
        onDismiss: (() -> Unit)? = null,
        onAction: (() -> Unit)? = null,
    ) {
        host.currentSnackbarData?.dismiss()
        scope.launch {
            val duration = when {
                action != null && tone == SnackTone.ERROR -> SnackbarDuration.Long
                long || action != null -> SnackbarDuration.Long
                else -> SnackbarDuration.Short
            }
            val r = host.showSnackbar(XSnack(message, action, tone, duration))
            if (r == SnackbarResult.ActionPerformed) onAction?.invoke() else onDismiss?.invoke()
        }
    }

    fun error(message: String, retry: (() -> Unit)? = null) =
        show(message, if (retry != null) "Retry" else null, SnackTone.ERROR, onAction = retry)
}

val LocalSnacks = staticCompositionLocalOf<Snacks> { error("No Snacks") }

@Composable
fun XSnackHost(host: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(host, modifier) { data -> XSnackbar(data) }
}

@Composable
private fun XSnackbar(data: SnackbarData) {
    val c = X.c
    val motion = LocalMotion.current
    val v = data.visuals
    val tone = (v as? XSnack)?.tone ?: SnackTone.PLAIN
    val lift = remember(data) { Animatable(if (motion.moves) 1f else 0f) }
    LaunchedEffect(data) { lift.animateTo(0f, tween(220)) }
    val accent = when (tone) {
        SnackTone.KEPT -> c.kept
        SnackTone.ERROR -> c.owed
        SnackTone.PLAIN -> c.ink2
    }
    Row(
        Modifier
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .widthIn(max = 560.dp)
            .fillMaxWidth()
            .graphicsLayer { translationY = lift.value * 24.dp.toPx(); alpha = 1f - lift.value }
            .clip(CtlShape)
            .background(c.overlay)
            .border(1.dp, c.line2, CtlShape)
            .heightIn(min = 56.dp)
            .padding(start = 14.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CtlShape).background(accent))
        Spacer(Modifier.size(10.dp))
        Text(v.message, Modifier.weight(1f).padding(vertical = 10.dp), color = c.ink0, style = MaterialTheme.typography.bodyMedium)
        v.actionLabel?.let { label ->
            Row(
                Modifier
                    .heightIn(min = 48.dp)
                    .clip(CtlShape)
                    .clickable { data.performAction() }
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (label == "Undo") {
                    Icon(Glyphs.Undo, null, tint = c.ink0, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(6.dp))
                }
                Text(label, color = if (tone == SnackTone.ERROR) c.owed else c.ink0, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

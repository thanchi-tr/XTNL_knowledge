package com.xtnl.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xtnl.app.ui.motion.LocalFeel
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.Spr
import com.xtnl.app.ui.motion.spr
import com.xtnl.app.ui.theme.X

val CardShape = RoundedCornerShape(16.dp)
val CtlShape = RoundedCornerShape(12.dp)
val ChipShape = RoundedCornerShape(8.dp)
val PillShape = RoundedCornerShape(999.dp)

/** A press that gives: a 3% sink on Full, at most 2% on Calm (none in Still), on the press spring. */
@Composable
fun rememberPressScale(source: MutableInteractionSource, amount: Float = 0.97f): Float {
    val motion = LocalMotion.current
    val pressed by source.collectIsPressedAsState()
    val sink = if (motion == MotionLevel.CALM) maxOf(amount, 0.98f) else amount
    val s by animateFloatAsState(if (pressed && motion.moves) sink else 1f, motion.spr(Spr.press), label = "press")
    return s
}

/** A surface card: the web's --card on --page, a hairline rim. */
@Composable
fun XCard(
    modifier: Modifier = Modifier,
    color: Color = X.c.card,
    border: Color = X.c.line1,
    padding: PaddingValues = PaddingValues(16.dp),
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .clip(CardShape)
            .background(color)
            .border(1.dp, border, CardShape)
            .padding(padding)
    ) { content() }
}

enum class ButtonKind { PRIMARY, QUIET, KEPT, WORK }

/**
 * The app's button: 56 dp tall by default (thumb size on the front display).
 * Primary is ink on page, as on the web: actions are ink, not a hue.
 */
@Composable
fun XButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.PRIMARY,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    height: Dp = 56.dp,
    /** Working on it (filing a new idea): the full fill stays, a shimmer runs along the bottom edge, and it takes no tap. */
    busy: Boolean = false,
    /** A change nods it sideways once (a refusal): an impulse on a loose spring. */
    nodKey: Int = 0,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val c = X.c
    val feel = LocalFeel.current
    val motion = LocalMotion.current
    val source = remember { MutableInteractionSource() }
    val scale = rememberPressScale(source)
    val shimmer = remember { Animatable(0f) }
    LaunchedEffect(busy, motion) {
        shimmer.snapTo(0f)
        if (!busy || motion != MotionLevel.FULL) return@LaunchedEffect
        while (true) {
            shimmer.snapTo(0f)
            shimmer.animateTo(1f, tween(1200, easing = LinearEasing))
        }
    }
    val nod = remember { Animatable(0f) }
    // The key as composed: a button composed again (a fold) doesn't nod for an old refusal.
    var nodSeen by remember { mutableIntStateOf(nodKey) }
    LaunchedEffect(nodKey) {
        if (nodKey <= nodSeen) return@LaunchedEffect
        nodSeen = nodKey
        // About -4 dp at 42 ms, then two small swings back.
        if (motion.moves) nod.animateTo(0f, spring(0.4f, 900f), initialVelocity = if (motion == MotionLevel.FULL) -200f else -60f)
    }
    val (bg, fg, rim) = when (kind) {
        ButtonKind.PRIMARY -> Triple(c.ink0, c.page, Color.Transparent)
        ButtonKind.QUIET -> Triple(c.raised, c.ink0, c.line2)
        ButtonKind.KEPT -> Triple(c.kept, c.onKept, Color.Transparent)
        ButtonKind.WORK -> Triple(c.work, c.onWork, Color.Transparent)
    }
    Row(
        modifier
            .graphicsLayer {
                scaleX = scale; scaleY = scale
                translationX = nod.value * density
                alpha = if (enabled || busy) 1f else 0.45f
            }
            .defaultMinSize(minHeight = height)
            .clip(CtlShape)
            .background(bg)
            .border(1.dp, rim, CtlShape)
            .drawWithCache {
                // One gradient, built per size; each frame only translates it along the bottom edge.
                val band = size.width * 0.35f
                val brush = Brush.horizontalGradient(listOf(Color.Transparent, fg.copy(alpha = 0.6f), Color.Transparent), 0f, band)
                val h = 2.dp.toPx()
                onDrawWithContent {
                    drawContent()
                    val k = shimmer.value
                    if (k > 0f) translate(left = -band + (size.width + band) * k) { drawRect(brush, Offset(0f, size.height - h), Size(band, h)) }
                }
            }
            .clickable(source, indication = androidx.compose.material3.ripple(color = fg), enabled = enabled && !busy, role = Role.Button) {
                feel?.press()
                onClick()
            }
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        AnimatedContent(
            targetState = text,
            transitionSpec = {
                (if (motion.moves) fadeIn(tween(120)) togetherWith fadeOut(tween(90)) else fadeIn(tween(0)) togetherWith fadeOut(tween(0))) using null
            },
            label = "button-label",
        ) { t ->
            Text(t, color = fg, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke(this)
    }
}

/** A round icon button with a 48 dp target (56 for the primary send). */
@Composable
fun XIconButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    bg: Color = Color.Transparent,
    tint: Color = X.c.ink1,
    enabled: Boolean = true,
) {
    val source = remember { MutableInteractionSource() }
    val scale = rememberPressScale(source, 0.92f)
    Box(
        modifier
            .size(size)
            .graphicsLayer { scaleX = scale; scaleY = scale; alpha = if (enabled) 1f else 0.4f }
            .clip(CircleShape)
            .background(bg)
            .clickable(source, indication = androidx.compose.material3.ripple(bounded = true), enabled = enabled, role = Role.Button, onClickLabel = label) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, label, tint = tint, modifier = Modifier.size(22.dp))
    }
}

/**
 * A choice chip (sections, formats, settings segments): a radio button for
 * TalkBack, selected or not (put a group's chips in a selectableGroup). With
 * [toggle] it is an on/off switch of its own (a checkbox).
 */
@Composable
fun XChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    trailing: String? = null,
    accent: Color = X.c.ink0,
    height: Dp = 40.dp,
    toggle: Boolean = false,
) {
    val c = X.c
    val motion = LocalMotion.current
    val feel = LocalFeel.current
    val source = remember { MutableInteractionSource() }
    val scale = rememberPressScale(source, 0.95f)
    val sel by animateFloatAsState(if (selected) 1f else 0f, motion.spr(Spr.fx), label = "chip")
    Row(
        modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .height(height)
            .clip(PillShape)
            .drawBehind {
                drawRect(c.raised)
                if (sel > 0f) drawRect(accent.copy(alpha = 0.16f * sel))
            }
            .border(BorderStroke(1.dp, if (selected) accent.copy(alpha = 0.9f) else c.line2), PillShape)
            .then(
                if (toggle) Modifier.toggleable(selected, source, androidx.compose.material3.ripple(), role = Role.Checkbox) { feel?.select(); onClick() }
                else Modifier.selectable(selected, source, androidx.compose.material3.ripple(), role = Role.RadioButton) {
                    if (!selected) feel?.select()
                    onClick()
                }
            )
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = if (selected) c.ink0 else c.ink2, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
        }
        Text(text, color = if (selected) c.ink0 else c.ink1, style = MaterialTheme.typography.labelLarge, maxLines = 1)
        if (trailing != null) {
            Spacer(Modifier.width(6.dp))
            Text(trailing, color = c.ink2, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}

/** A small label in caps above a group. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = X.c.ink2) {
    Text(text.uppercase(), modifier, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.2.sp)
}

/** A segmented control for Settings (Theme, Motion, Data). */
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((v, label) in options) {
            XChip(label, selected = v == value, onClick = { onChange(v) }, height = 44.dp)
        }
    }
}

@Composable
fun EmptyNote(title: String, body: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.headlineSmall, color = X.c.ink0)
        Spacer(Modifier.height(6.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = X.c.ink2)
    }
}

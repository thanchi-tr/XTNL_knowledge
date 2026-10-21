package com.xtnl.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.tweenOf
import com.xtnl.app.ui.theme.X

/**
 * The app's text field: an ink caret on a raised well, the rim turning ink
 * when focused. A label sits above (never inside), so nothing moves as you type.
 */
@Composable
fun XField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    enabled: Boolean = true,
    mono: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    trailing: (@Composable () -> Unit)? = null,
    minHeight: Dp = 52.dp,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    fieldModifier: Modifier = Modifier,
    /** Shown and focused but not editable (a review answer under its feedback: the keyboard stays up for the next card). */
    readOnly: Boolean = false,
) {
    val source = remember { MutableInteractionSource() }
    Column(modifier) {
        if (label != null) {
            Eyebrow(label, Modifier.padding(start = 4.dp, bottom = 6.dp))
        }
        FieldWell(source, enabled, minHeight, trailing) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = fieldModifier.fillMaxWidth(),
                enabled = enabled,
                readOnly = readOnly,
                singleLine = singleLine,
                minLines = if (singleLine) 1 else minLines,
                textStyle = fieldStyle(mono),
                cursorBrush = SolidColor(X.c.ink0),
                keyboardOptions = keyboardOptions,
                keyboardActions = keyboardActions,
                interactionSource = source,
                visualTransformation = visualTransformation,
                decorationBox = { inner ->
                    Box {
                        if (value.isEmpty() && placeholder != null) Text(placeholder, style = fieldStyle(mono).copy(color = X.c.ink2))
                        inner()
                    }
                },
            )
        }
    }
}

/** The same field over a TextFieldValue, for the cloze sentence (Blank it needs the selection). */
@Composable
fun XFieldValue(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    minLines: Int = 3,
    enabled: Boolean = true,
    trailing: (@Composable () -> Unit)? = null,
    fieldModifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    Column(modifier) {
        if (label != null) Eyebrow(label, Modifier.padding(start = 4.dp, bottom = 6.dp))
        FieldWell(source, enabled, 52.dp, trailing) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = fieldModifier.fillMaxWidth(),
                enabled = enabled,
                minLines = minLines,
                textStyle = fieldStyle(false),
                cursorBrush = SolidColor(X.c.ink0),
                interactionSource = source,
                decorationBox = { inner ->
                    Box {
                        if (value.text.isEmpty() && placeholder != null) Text(placeholder, style = fieldStyle(false).copy(color = X.c.ink2))
                        inner()
                    }
                },
            )
        }
    }
}

@Composable
private fun fieldStyle(mono: Boolean): TextStyle =
    MaterialTheme.typography.bodyLarge.copy(color = X.c.ink0, fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default)

@Composable
private fun FieldWell(source: MutableInteractionSource, enabled: Boolean, minHeight: Dp, trailing: (@Composable () -> Unit)?, content: @Composable () -> Unit) {
    val c = X.c
    val motion = LocalMotion.current
    val focused by source.collectIsFocusedAsState()
    val rim by animateColorAsState(if (focused) c.ink1 else c.line2, motion.tweenOf(160), label = "rim")
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .clip(CtlShape)
            .background(if (enabled) c.sunken else c.sunken.copy(alpha = 0.5f))
            .border(if (focused) 1.5.dp else 1.dp, rim, CtlShape)
            .padding(
                start = 14.dp, end = if (trailing != null) 4.dp else 14.dp,
                top = if (trailing != null) 4.dp else 14.dp, bottom = if (trailing != null) 4.dp else 14.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) { content() }
        if (trailing != null) {
            Spacer(Modifier.height(0.dp))
            trailing()
        }
    }
}

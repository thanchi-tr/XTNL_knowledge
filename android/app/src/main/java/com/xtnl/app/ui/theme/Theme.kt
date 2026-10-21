package com.xtnl.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.xtnl.app.data.ThemeChoice

/**
 * The web app's tokens (src/app/styles/tokens.css, "Sigil & Slate"), one
 * meaning per family:
 *   ink       structure, text, numbers, actions (primary buttons are ink, not a hue)
 *   signal    the state of a thing in time: kept · owed · held
 *   lane      what kind of task: must · habit (marks only, never body text)
 *   currency  life XP (xp) · review points (pts) · mastery (mp): glyphs; the figure beside is ink
 *   work      the work tab's accent
 *   light     earned, and only for now
 */
@Immutable
data class XtnlColors(
    val dark: Boolean,
    val canvas: Color, val page: Color, val sunken: Color, val card: Color, val raised: Color, val overlay: Color, val bar: Color,
    val scrim: Color, val face: Color,
    val ink0: Color, val ink1: Color, val ink2: Color, val inkMute: Color,
    val line1: Color, val line2: Color, val lineCtl: Color,
    val kept: Color, val onKept: Color, val owed: Color, val onOwed: Color, val held: Color, val onHeld: Color,
    val must: Color, val habit: Color,
    val work: Color, val onWork: Color,
    val xp: Color, val onXp: Color, val pts: Color, val onPts: Color, val mp: Color,
    val light: Color, val lightGlow: Color,
    val gold: Color,
    /** The brand mint of the app icon's node-X (seal and splash only). */
    val mint: Color, val cyan: Color,
) {
    /** A signal's own wash behind a row or chip (14%, as the web's chip washes). */
    fun wash(c: Color, alpha: Float = if (dark) 0.14f else 0.12f) = c.copy(alpha = alpha)
}

val Night = XtnlColors(
    dark = true,
    canvas = Color(0xFF050609), page = Color(0xFF0A0D13), sunken = Color(0xFF07090E), card = Color(0xFF11151D),
    raised = Color(0xFF171C26), overlay = Color(0xFF1D2330), bar = Color(0xFF0C0F15),
    scrim = Color(0xA8030407), face = Color(0xFF0D1017),
    ink0 = Color(0xFFF1F3F8), ink1 = Color(0xFFC3CAD8), ink2 = Color(0xFF9AA3B5), inkMute = Color(0xFF6F788C),
    line1 = Color(0x11FFFFFF), line2 = Color(0x1CFFFFFF), lineCtl = Color(0xFF76819A),
    kept = Color(0xFF5FD38D), onKept = Color(0xFF0B1A12), owed = Color(0xFFE07A95), onOwed = Color(0xFF26060E),
    held = Color(0xFF72D2EC), onHeld = Color(0xFF06161C),
    must = Color(0xFFF06410), habit = Color(0xFF8C7AFF),
    work = Color(0xFF17938B), onWork = Color(0xFF04120F),
    xp = Color(0xFFFDAF3A), onXp = Color(0xFF221400), pts = Color(0xFF8EA6FF), onPts = Color(0xFF07103A), mp = Color(0xFFFFE08A),
    light = Color(0xFFFFF1CF), lightGlow = Color(0x57FFDE96),
    gold = Color(0xFFF0C75E),
    mint = Color(0xFF3DFFB0), cyan = Color(0xFF2FD0FF),
)

val Vellum = XtnlColors(
    dark = false,
    canvas = Color(0xFFE2DCCF), page = Color(0xFFF3EFE6), sunken = Color(0xFFE9E3D6), card = Color(0xFFFFFDF8),
    raised = Color(0xFFFAF6EE), overlay = Color(0xFFFFFFFF), bar = Color(0xFFF3EFE6),
    scrim = Color(0x611E1A12), face = Color(0xFF0D1017),
    ink0 = Color(0xFF17191F), ink1 = Color(0xFF3A404D), ink2 = Color(0xFF595F6E), inkMute = Color(0xFF777D8A),
    line1 = Color(0x14282010), line2 = Color(0x24282010), lineCtl = Color(0xFF7F7868),
    kept = Color(0xFF155F36), onKept = Color(0xFFFFFFFF), owed = Color(0xFF9C2F6B), onOwed = Color(0xFFFFFFFF),
    held = Color(0xFF0C5A73), onHeld = Color(0xFFFFFFFF),
    must = Color(0xFF6B1804), habit = Color(0xFF691594),
    work = Color(0xFF083833), onWork = Color(0xFFFFFFFF),
    xp = Color(0xFFA33D00), onXp = Color(0xFFFFFFFF), pts = Color(0xFF3450C2), onPts = Color(0xFFFFFFFF), mp = Color(0xFFB47308),
    light = Color(0xFFA87419), lightGlow = Color(0x38A87419),
    gold = Color(0xFFC9901F),
    mint = Color(0xFF009E60), cyan = Color(0xFF0A7FA8),
)

val LocalXtnl = staticCompositionLocalOf { Night }

private fun schemeOf(c: XtnlColors): ColorScheme = if (c.dark) {
    darkColorScheme(
        primary = c.ink0, onPrimary = c.page, primaryContainer = c.raised, onPrimaryContainer = c.ink0,
        secondary = c.ink1, onSecondary = c.page, secondaryContainer = c.overlay, onSecondaryContainer = c.ink0,
        tertiary = c.kept, onTertiary = c.onKept,
        background = c.page, onBackground = c.ink0, surface = c.page, onSurface = c.ink0,
        surfaceVariant = c.raised, onSurfaceVariant = c.ink2, surfaceTint = Color.Transparent,
        surfaceContainerLowest = c.sunken, surfaceContainerLow = c.card, surfaceContainer = c.card,
        surfaceContainerHigh = c.raised, surfaceContainerHighest = c.overlay, surfaceBright = c.overlay, surfaceDim = c.sunken,
        inverseSurface = c.ink0, inverseOnSurface = c.page, inversePrimary = c.page,
        error = c.owed, onError = c.onOwed, errorContainer = c.wash(c.owed), onErrorContainer = c.owed,
        outline = c.lineCtl, outlineVariant = c.line2, scrim = c.scrim,
    )
} else {
    lightColorScheme(
        primary = c.ink0, onPrimary = c.card, primaryContainer = c.raised, onPrimaryContainer = c.ink0,
        secondary = c.ink1, onSecondary = c.card, secondaryContainer = c.sunken, onSecondaryContainer = c.ink0,
        tertiary = c.kept, onTertiary = c.onKept,
        background = c.page, onBackground = c.ink0, surface = c.page, onSurface = c.ink0,
        surfaceVariant = c.raised, onSurfaceVariant = c.ink2, surfaceTint = Color.Transparent,
        surfaceContainerLowest = c.overlay, surfaceContainerLow = c.card, surfaceContainer = c.card,
        surfaceContainerHigh = c.raised, surfaceContainerHighest = c.overlay, surfaceBright = c.overlay, surfaceDim = c.sunken,
        inverseSurface = c.ink0, inverseOnSurface = c.page, inversePrimary = c.page,
        error = c.owed, onError = c.onOwed, errorContainer = c.wash(c.owed), onErrorContainer = c.owed,
        outline = c.lineCtl, outlineVariant = c.line2, scrim = c.scrim,
    )
}

/** Figures line up: tabular numbers everywhere a number is shown. */
const val TNUM = "tnum"

val Display = FontFamily.Serif

private val typography = Typography().let { t ->
    t.copy(
        displaySmall = t.displaySmall.copy(fontFamily = Display, fontWeight = FontWeight.Medium),
        headlineLarge = t.headlineLarge.copy(fontFamily = Display, fontWeight = FontWeight.Medium),
        headlineMedium = t.headlineMedium.copy(fontFamily = Display, fontWeight = FontWeight.Medium, fontSize = 28.sp),
        headlineSmall = t.headlineSmall.copy(fontFamily = Display, fontWeight = FontWeight.Medium, fontSize = 24.sp),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 20.sp),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 17.sp),
        titleSmall = t.titleSmall.copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = t.bodyLarge.copy(fontSize = 17.sp, lineHeight = 24.sp),
        bodyMedium = t.bodyMedium.copy(fontSize = 15.sp, lineHeight = 21.sp),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 15.sp, fontFeatureSettings = TNUM),
        labelMedium = t.labelMedium.copy(fontFeatureSettings = TNUM),
        labelSmall = t.labelSmall.copy(fontFeatureSettings = TNUM),
    )
}

/** A figure's style: tabular, so counting up never jitters. */
fun TextStyle.figures(): TextStyle = copy(fontFeatureSettings = TNUM)

@Composable
fun resolveColors(choice: ThemeChoice): XtnlColors = when (choice) {
    ThemeChoice.NIGHT -> Night
    ThemeChoice.VELLUM -> Vellum
    ThemeChoice.SYSTEM -> if (isSystemInDarkTheme()) Night else Vellum
}

@Composable
fun XtnlTheme(colors: XtnlColors, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalXtnl provides colors) {
        MaterialTheme(colorScheme = schemeOf(colors), typography = typography, content = content)
    }
}

object X {
    val c: XtnlColors @Composable get() = LocalXtnl.current
}

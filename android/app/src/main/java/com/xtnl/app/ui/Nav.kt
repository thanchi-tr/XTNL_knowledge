package com.xtnl.app.ui

import android.net.Uri
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import com.xtnl.app.core.AuditAlarm
import com.xtnl.app.core.LogSection
import com.xtnl.app.ui.components.Glyphs

enum class Tab(val label: String, val icon: ImageVector, val key: String) {
    CHECK("Check", Glyphs.Check, "check"),
    LOG("Log", Glyphs.Log, "log"),
    REVIEW("Review", Glyphs.Review, "review"),
    MORE("More", Glyphs.More, "more"),
}

enum class MoreRoute { ROOT, SETTINGS, WEB }

enum class LogMode { QUICK, IDEA }

/**
 * The app's navigator: a tab, and the place inside More. State-driven (no
 * navigation library); each tab keeps its own state in a ViewModel and a
 * SaveableStateHolder, so switching tabs, folding or unfolding loses nothing.
 */
@Stable
class Nav(tab: Tab = Tab.CHECK, more: MoreRoute = MoreRoute.ROOT, logMode: LogMode = LogMode.QUICK, section: LogSection = LogSection.TASK) {
    var tab by mutableStateOf(tab)
    var more by mutableStateOf(more)
    var logMode by mutableStateOf(logMode)
    var section by mutableStateOf(section)
    /** The web path the full app opens at (a deep link may set it). */
    var webPath by mutableStateOf("/")
    /** Ticks when the Log input should take focus (a shortcut, a deep link). */
    var focusLog by mutableIntStateOf(0)
    /** Ticks when a deep link asks Review to start a session at once. */
    var startReview by mutableIntStateOf(0)

    // The ticks already acted on. A screen's effect starts again each time the screen comes back
    // (another tab, a fold), so a tick is taken once, not read; both reset with the ticks.
    private var focusLogTaken = 0
    private var startReviewTaken = 0

    /** True once per new [focusLog] tick. */
    fun takeFocusLog(): Boolean = (focusLog > focusLogTaken).also { focusLogTaken = focusLog }

    /** True once per new [startReview] tick. */
    fun takeStartReview(): Boolean = (startReview > startReviewTaken).also { startReviewTaken = startReview }

    fun go(t: Tab) {
        tab = t
    }

    /** Back inside the app: More's sub-pages to More, other tabs to Check. False = leave the app. */
    fun back(): Boolean = when {
        tab == Tab.MORE && more != MoreRoute.ROOT -> { more = MoreRoute.ROOT; true }
        tab == Tab.LOG && logMode == LogMode.IDEA -> { logMode = LogMode.QUICK; true }
        tab != Tab.CHECK -> { tab = Tab.CHECK; true }
        else -> false
    }

    val canGoBack: Boolean get() = tab != Tab.CHECK || (tab == Tab.MORE && more != MoreRoute.ROOT)

    /**
     * xtnl://app/<path>, from the launcher shortcuts and the v1 shell's links:
     *   /check, /today           Quick check
     *   /log?section=task|weight|idea, /today?capture=task   the quick line, focused
     *   /idea, /add              New idea
     *   /review                  Review, started
     *   /settings                More › Settings
     *   /week                    the full app at the week audit (/today/week; the Sunday reminder opens it)
     *   anything else            the full app at that path
     */
    fun open(uri: Uri) {
        val path = uri.path?.trimEnd('/')?.ifEmpty { "/" } ?: "/"
        when {
            path == "/" || path == "/check" || (path == "/today" && uri.getQueryParameter("capture") == null) -> {
                tab = Tab.CHECK
            }
            path == "/log" || (path == "/today" && uri.getQueryParameter("capture") != null) -> {
                tab = Tab.LOG
                logMode = LogMode.QUICK
                section = LogSection.of(uri.getQueryParameter("section") ?: uri.getQueryParameter("capture"))
                focusLog++
            }
            path == "/idea" || path == "/add" -> {
                tab = Tab.LOG
                logMode = LogMode.IDEA
            }
            path == "/review" -> {
                tab = Tab.REVIEW
                startReview++
            }
            path == "/settings" -> {
                tab = Tab.MORE
                more = MoreRoute.SETTINGS
            }
            path == "/week" -> {
                tab = Tab.MORE
                more = MoreRoute.WEB
                webPath = AuditAlarm.WEB_PATH
            }
            else -> {
                tab = Tab.MORE
                more = MoreRoute.WEB
                webPath = path + (uri.encodedQuery?.let { "?$it" } ?: "")
            }
        }
    }

    companion object {
        val Saver: Saver<Nav, Any> = Saver(
            save = { listOf(it.tab.name, it.more.name, it.logMode.name, it.section.name, it.webPath) },
            restore = { raw ->
                @Suppress("UNCHECKED_CAST")
                val l = raw as List<String>
                Nav(Tab.valueOf(l[0]), MoreRoute.valueOf(l[1]), LogMode.valueOf(l[2]), LogSection.valueOf(l[3])).also { it.webPath = l[4] }
            },
        )
    }
}

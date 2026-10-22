package com.xtnl.app.ui

import android.graphics.Bitmap
import android.net.Uri
import android.os.Looper
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import android.graphics.Canvas
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import com.xtnl.app.XtnlApp
import com.xtnl.app.data.MotionChoice
import com.xtnl.app.ui.more.WebHolder
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestRule
import org.junit.runners.model.Statement
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream
import java.time.Duration

/**
 * Renders the app with demo data at the Galaxy Z Fold 8's sizes (density 420)
 * and walks the three flows, saving a PNG per step. Opt-in, as it is slow:
 *
 *   gradlew test -Pxtnl.shots=true --tests com.xtnl.app.ui.ScreensTest
 *
 * The PNGs land in app/build/screens/. Motion is Still so every state is at rest.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], application = XtnlApp::class)
class ScreensTest {
    /** Outermost, so nothing (not even the host activity) starts unless asked; debug only (its manifest has the host). */
    @get:Rule(order = 0)
    val onlyWhenAsked = TestRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                assumeTrue(System.getProperty("xtnl.shots") == "true" && com.xtnl.app.BuildConfig.DEBUG)
                base.evaluate()
            }
        }
    }

    @get:Rule(order = 1) val rule = createAndroidComposeRule<ComponentActivity>()

    private val dir = File(System.getProperty("xtnl.shots.dir") ?: "build/screens").apply { mkdirs() }

    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun frontDisplay() = walk("front")

    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun mainUpright() = walk("main")

    @Test @Config(qualifiers = "w932dp-h704dp-420dpi")
    fun mainSideways() = walk("sideways", reviewToo = false)

    /** P15: the Quest card (the main quest, this week's sprint, Today's three) on the front display's one column. */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun questCardFront() = questCard("front")

    /** P15: the Quest card in the main display's second pane. */
    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun questCardMain() = questCard("main")

    /** Half open and sideways: the hinge across the middle (1848 px tall window, hinge at 924 px). */
    @Test @Config(qualifiers = "w932dp-h704dp-420dpi")
    fun tabletop() = walk("tabletop", hinge = Hinge(vertical = false, startPx = 924, endPx = 924, halfOpen = true))

    /**
     * Full motion, frame by frame (the test clock driven by hand), for a critic to judge the moments from PNGs:
     * a tick and its motes, consecutive ticks and a character level up, an undo, a work item's Done, a review's
     * card enter, right answers with a combo and a card level, a miss with its retry, session complete, board
     * clear, the new idea's filing, its seal's flight, a merge and a duplicate, and a tab switch.
     * PNGs: <size>-m<moment>-<name>-<ms after the tap>ms.png.
     */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun frontMoments() = moments("front")

    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun mainMoments() = moments("main")

    private fun moments(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.FULL)
        val links = MutableStateFlow<Uri?>(null)
        rule.mainClock.autoAdvance = false
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            // No ripples: Robolectric plays a tap's platform ripple (a View animation) to its end at once, pushing the
            // looper's clock seconds past the frame clock (the demo's replies and the view models' holds would land early).
            CompositionLocalProvider(androidx.compose.material3.LocalRippleConfiguration provides null) {
                AppRoot(graph, MutableStateFlow(WindowFacts()), links, { links.value = null }, WebHolder(), {})
            }
        }
        frames(3_000)
        snap("$name-m0-board")

        // 1. A tick at the ladder's root: the press, the stamp's peak and hold, the shock and streaks, the flood, the motes and their landing.
        tap(hasText("Gym legs"))
        film("$name-m1-tick", 16, 32, 48, 64, 80, 96, 128, 160, 240, 320, 400, 448, 496, 560, 720)
        frames(600)
        // 1b. Consecutive ticks climb the ladder; the third crosses a level: the character's level up on the header seal.
        tap(hasText("Call the dentist"))
        film("$name-m1b-tick-step1", 64, 160, 480)
        frames(300)
        tap(hasText("Lodge the tax return"))
        film("$name-m6b-level", 64, 300, 480, 560, 640, 720, 800, 880, 960, 1040, 1120, 1280, 1600)
        frames(1_500)
        // 1c. Undo: the mark undraws, the disc drains, the flood recedes.
        tap(hasText("Call the dentist"))
        film("$name-m1c-undo", 16, 64, 112, 160, 240)
        frames(1_200)
        tap(hasText("Call the dentist"))
        film("$name-m1d-tick-step3", 64, 160, 480)
        frames(2_000)

        // 11. A work item's Done: the check in the work hue, the row's flood and slide, the gap closing.
        if (name == "front") {
            scrolling { rule.onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasContentDescription("Done: Follow up on the contract")) }
            frames(400)
        }
        tap(hasContentDescription("Done: Follow up on the contract"))
        film("$name-m11-work", 16, 48, 64, 96, 150, 240, 300, 360, 420, 520, 700)
        frames(2_000)

        // 3, 4, 5, 6a. Review: the first card rises in; a right answer (and its card level); the next card slides in; a
        // combo; a miss and its retry flying to the queue's end; session complete.
        links.value = Uri.parse("xtnl://app/review")
        film("$name-m3-first-card", 200, 600, 900, 1_100, 1_400)
        frames(600)
        rule.onAllNodes(hasSetTextAction()).onFirst().performTextInput("ATP")
        frames(100)
        tap(hasText("Check answer"))
        frames(360)
        // The card's level up runs on from the answer (L = 300): its forge, the close at 600, the numeral's roll.
        film("$name-m4-m6a-correct-level", 16, 48, 64, 96, 160, 240, 320, 360, 400, 460, 520, 600, 640, 700, 800, 1_000)
        frames(800)
        tap(hasText("Next card"))
        film("$name-m3-next-card", 16, 60, 100, 140, 200, 280, 400)
        frames(600)
        val blanks = rule.onAllNodes(hasSetTextAction())
        blanks[0].performTextInput("Canberra")
        blanks[1].performTextInput("Sydney")
        frames(100)
        tap(hasText("Check answer"))
        frames(360)
        film("$name-m4-combo2", 16, 64, 160, 240, 300, 400, 520, 620)
        frames(1_200)
        tap(hasText("Next card"))
        frames(800)
        rule.onAllNodes(hasSetTextAction()).onFirst().performTextInput("9.81")
        frames(100)
        tap(hasText("Check answer"))
        frames(360)
        film("$name-m4-combo3", 64, 240, 400, 620)
        frames(1_200)
        tap(hasText("Next card"))
        film("$name-m3-mcq-enter", 60, 130, 200, 300)
        frames(600)
        tap(hasText("Mercury"))
        frames(360)
        film("$name-m5-miss", 16, 60, 120, 160, 200, 260, 300, 360, 420, 540, 620)
        frames(1_000)
        tap(hasText("Next card"))
        film("$name-m5-exit-right", 40, 80, 120, 200)
        frames(800)
        tap(hasContentDescription("End session"))
        film("$name-m7-summary", 60, 160, 220, 300, 380, 460, 540, 620, 700, 800, 980, 1_200)
        frames(1_500)

        // 2. Board clear: the last two habits; the roll call, the banner inserted and stamped, its burst and sweep.
        tap(hasText("Back to Check"))
        frames(2_500)
        if (name == "front") {
            scrolling { rule.onAllNodes(hasScrollAction()).onFirst().performScrollToIndex(0) }
            frames(400)
        }
        tap(hasText("Read 20 pages"))
        frames(1_200)
        tap(hasText("Stretch"))
        film("$name-m2-clear", 300, 480, 560, 620, 660, 700, 760, 820, 900, 1_000, 1_100, 1_300, 1_500)
        frames(2_000)

        // 8, 9. A new idea: the filing's four stages, then the seal: stamp, contact, wind-up, flight, landing.
        links.value = Uri.parse("xtnl://app/idea")
        frames(1_500)
        typeIdea("Which gas do plants take in for photosynthesis?", "Carbon dioxide")
        tap(hasText("Create"))
        film("$name-m8-filing", 100, 300, 700, 1_000, 2_000, 2_300, 3_400, 4_300, 4_600, 4_900)
        // R: the answer's frame (the stage line says where it was filed); then the seal, its contact, wind-up and flight.
        until(hasText("Filed in", substring = true))
        film("$name-m9-created", 16, 60, 100, 140, 180, 220, 260, 300, 360, 440, 520, 600, 680, 760, 900, 1_200)
        frames(2_500)
        // 9b. The same idea again: folded into the one you have.
        typeIdea("Which gas do plants take in for photosynthesis?", "Carbon dioxide")
        tap(hasText("Create"))
        until(hasText("Folded into one you have"))
        film("$name-m9b-merged", 16, 100, 200, 260, 320, 400, 520)
        frames(2_000)
        // 9c. A twin of a card you have: nothing saved.
        typeIdea("What is the integral of 2x from 0 to 1?", "1")
        tap(hasText("Create"))
        until(hasText("Something close is already here"))
        film("$name-m9c-duplicate", 16, 80, 160, 240, 320, 400, 520)
        frames(2_000)
        hideKeyboard()

        // 10. A tab switch to the right (Check → More): the outgoing tab leaves left, the new one comes in, the pill stretches.
        links.value = Uri.parse("xtnl://app/check")
        frames(1_500)
        tap(hasContentDescription("More"))
        film("$name-m10-tab", 16, 40, 80, 120, 180, 260, 340)
    }

    /** Types an idea into the Short form's question and answer, then puts the keyboard away (as Create does on a device). */
    private fun typeIdea(q: String, a: String) {
        val fields = rule.onAllNodes(hasSetTextAction())
        fields[0].performTextClearance()
        fields[0].performTextInput(q)
        fields[1].performTextClearance()
        fields[1].performTextInput(a)
        frames(200)
        hideKeyboard()
    }

    /**
     * Robolectric reports the IME as up once a field has had focus: dispatch insets with no IME, as a device does when
     * Create puts the keyboard away, so the bar (the seal's landing place) shows.
     */
    private fun hideKeyboard() {
        rule.runOnUiThread {
            val insets = androidx.core.view.WindowInsetsCompat.Builder()
                .setVisible(androidx.core.view.WindowInsetsCompat.Type.ime(), false)
                .build()
                .toWindowInsets()
            val content = rule.activity.findViewById<android.view.ViewGroup>(android.R.id.content)
            if (insets != null) content.getChildAt(0)?.dispatchApplyWindowInsets(insets)
        }
        frames(300)
    }

    /** Advances frame by frame until a node matches [m] (at most [maxMs]). */
    private fun until(m: SemanticsMatcher, maxMs: Long = 8_000) {
        var waited = 0L
        while (waited < maxMs && rule.onAllNodes(m).fetchSemanticsNodes().isEmpty()) {
            frames(16)
            waited += 16
        }
    }

    /** A scroll needs its frames to land: the clock runs on its own for it, then is held again. */
    private fun scrolling(block: () -> Unit) {
        rule.mainClock.autoAdvance = true
        try { block() } finally { rule.mainClock.autoAdvance = false }
    }

    /** A tap on the first node matching [m], at the current frame. */
    private fun tap(m: SemanticsMatcher) {
        rule.onAllNodes(m).onFirst().performClick()
    }

    /** Snaps the moment at each time (ms after the tap), advancing the clocks between them. */
    private fun film(prefix: String, vararg at: Int) {
        var now = 0
        for (t in at) {
            frames((t - now).toLong().coerceAtLeast(1))
            now = t
            // No waitForIdle here: on Robolectric it runs the looper's pending tasks early, ahead of the frame clock.
            snap(prefix + "-" + t.toString().padStart(4, '0') + "ms", idle = false)
        }
    }

    /** Advances both clocks: the demo's delays (main looper) and Compose's frames (the test clock), 16 ms at a time. */
    private fun frames(ms: Long) {
        var left = ms
        while (left > 0) {
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(16))
            rule.mainClock.advanceTimeBy(16)
            left -= 16
        }
        Thread.sleep(30)
        shadowOf(Looper.getMainLooper()).idle()
    }

    /** Check with demo data, scrolled until the Quest card is in view (whichever list holds it), then one PNG. */
    private fun questCard(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts()), MutableStateFlow<Uri?>(null), {}, WebHolder(), {})
        }
        settle()
        val title = hasText("Trade for a living", substring = true)
        val lists = rule.onAllNodes(hasScrollAction())
        for (i in 0 until lists.fetchSemanticsNodes().size) {
            if (runCatching { scrolling { lists[i].performScrollToNode(title) } }.isSuccess) break
        }
        settle()
        snap("$name-quest-card")
    }

    private fun walk(name: String, hinge: Hinge? = null, reviewToo: Boolean = true) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        val links = MutableStateFlow<Uri?>(null)
        // The test host has an action bar; the app's window doesn't.
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts(hinge = hinge)), links, { links.value = null }, WebHolder(), {})
        }
        settle()
        snap("$name-1-check")
        rule.onAllNodes(hasText("Call the dentist")).onFirst().performClick()
        settle(1_200)
        snap("$name-1b-check-ticked")

        links.value = Uri.parse("xtnl://app/log?section=task")
        settle()
        rule.onAllNodes(hasSetTextAction()).onFirst().performTextInput("gym legs 60m every mon,thu !")
        settle(200)
        snap("$name-2-log-typing")
        rule.onAllNodesWithContentDescription("Send").onFirst().performClick()
        settle()
        snap("$name-3-log-sent")

        links.value = Uri.parse("xtnl://app/idea")
        settle()
        snap("$name-4-new-idea")

        if (reviewToo) {
            links.value = Uri.parse("xtnl://app/review")
            settle()
            snap("$name-5-review-card")
            rule.onAllNodes(hasSetTextAction()).onFirst().performTextInput("ATP")
            rule.onAllNodes(hasText("Check answer")).onFirst().performClick()
            settle()
            snap("$name-6-review-feedback")
            rule.onAllNodes(hasText("Next card")).onFirst().performClick()
            settle(800)
            rule.onAllNodes(hasSetTextAction()).onFirst().performTextInput("Canberra")
            settle(400)
            snap("$name-6b-review-cloze")
        }

        links.value = Uri.parse("xtnl://app/settings")
        settle()
        snap("$name-7-settings")
        // P12 (D37): Settings › Notifications, the week audit's Sunday reminder.
        rule.onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Demo data: a made-up day", substring = true))
        settle(800)
        snap("$name-7b-settings-notifications")
    }

    /** Lets the demo's delays, the cache's IO thread and recomposition all run. */
    private fun settle(ms: Long = 3_200) {
        var left = ms
        while (left > 0) {
            Thread.sleep(20)
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(200))
            rule.waitForIdle()
            left -= 200
        }
    }

    /**
     * Draws the window's view tree into a bitmap (PixelCopy needs a real display; this doesn't). A list item fading in
     * or out draws through a RenderNode, which a software canvas refuses (and Robolectric can't render): that frame
     * is taken a few frames later instead, once the fade has gone.
     */
    private fun snap(name: String, idle: Boolean = true) {
        if (idle) rule.waitForIdle()
        val v = rule.activity.window.decorView.rootView
        var bmp: Bitmap? = null
        var tries = 0
        while (bmp == null) {
            try {
                bmp = Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888).also { v.draw(Canvas(it)) }
            } catch (e: IllegalArgumentException) {
                if (++tries > 40) throw e
                frames(16)
            }
        }
        FileOutputStream(File(dir, "$name.png")).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}

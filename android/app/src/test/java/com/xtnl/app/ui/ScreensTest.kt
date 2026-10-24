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
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.test.core.app.ApplicationProvider
import com.xtnl.app.XtnlApp
import com.xtnl.app.core.HealthLine
import com.xtnl.app.core.MallLine
import com.xtnl.app.core.OwedLine
import com.xtnl.app.core.RestTokenLine
import com.xtnl.app.data.OwedItem
import com.xtnl.app.core.StatusLine
import com.xtnl.app.data.MotionChoice
import com.xtnl.app.data.ThemeChoice
import com.xtnl.app.ui.more.HealthRationale
import com.xtnl.app.ui.more.WebHolder
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.XtnlTheme
import com.xtnl.app.ui.theme.resolveColors
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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

    /** P22: the Owed card (Make up, Do minimum, Accept the loss) on the front display's one column, before and after a make-up. */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun owedCardFront() = owedCard("front")

    /** P22: the Owed card at the end of the main display's first pane. */
    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun owedCardMain() = owedCard("main")

    /** P1: More › Status (the five attributes, then Capital and the note) on the front display's one column. */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun statusFront() = status("front")

    /** P1: More › Status in the main display's two panes (the attributes, then Capital and the note). */
    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun statusMain() = status("main")

    /** P1: More › Status on the main display sideways. */
    @Test @Config(qualifiers = "w932dp-h704dp-420dpi")
    fun statusSideways() = status("sideways")

    /** P18: More › Mall on the front display's one column (the wallet, the rewards, the Add form, the note). */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun mallFront() = mall("front")

    /** P18: More › Mall in the main display's two panes (the wallet and the rewards; the Add form and the note). */
    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun mallMain() = mall("main")

    /** P27: Settings › Health Connect on the front display (off, then the rationale the toggle shows before asking). */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun healthFront() = health("front")

    /** P27: the same on the main display. */
    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun healthMain() = health("main")

    /** P27: the rationale screen Health Connect opens (HealthRationaleActivity's content: one column, at most 560 dp). */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun healthRationaleFront() = healthRationale("front")

    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun healthRationaleMain() = healthRationale("main")

    /** Half open and sideways: the hinge across the middle (1848 px tall window, hinge at 924 px). */
    @Test @Config(qualifiers = "w932dp-h704dp-420dpi")
    fun tabletop() = walk("tabletop", hinge = Hinge(vertical = false, startPx = 924, endPx = 924, halfOpen = true))

    /** P30: the review screen's fatigue line (the demo's 200th answer of the day applies Fatigued) on the front display. */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun fatigueFront() = fatigue("front")

    /** P30: the same on the main display (the runner's bar over the card, then the Start panel). */
    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun fatigueMain() = fatigue("main")

    /** The minutes sheet (P7, P23, P24) on the cover screen and the main display, with demo data. */
    @Test @Config(qualifiers = "w475dp-h751dp-420dpi")
    fun minutesSheetFront() = minutesSheet("front")

    @Test @Config(qualifiers = "w704dp-h932dp-420dpi")
    fun minutesSheetMain() = minutesSheet("main")

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
        // P23 and P24: the demo's deep-work task takes its minutes and its reading task its pages, through the sheet,
        // before the last two habits clear the board.
        tap(hasText("Write the thesis chapter"))
        frames(1_200)
        tap(hasText("90 min"))
        frames(200)
        tap(hasText("Done · 90 min"))
        frames(1_500)
        tap(hasText("Read the novel"))
        frames(1_200)
        tap(hasText("Done · 30 pages"))
        frames(1_500)
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

    /**
     * P22: Check with demo data (Duty on, two debts), scrolled until the Owed card is in view, then one PNG; Make up on
     * yesterday's Stretch (the card leaves, the line is said), and a second PNG with the debt left and its Accept the loss.
     * P22 review: the make-up's line carries its Undo; tapping it brings Stretch's card back (a last PNG).
     */
    private fun owedCard(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts()), MutableStateFlow<Uri?>(null), {}, WebHolder(), {})
        }
        settle()
        val head = hasText(OwedLine.header(listOf(OwedItem("a", debt = 3.0), OwedItem("b", debt = 4.2))).removePrefix("${OwedLine.TITLE}: "))
        val lists = rule.onAllNodes(hasScrollAction())
        fun scrollTo(m: SemanticsMatcher) {
            for (i in 0 until lists.fetchSemanticsNodes().size) {
                if (runCatching { scrolling { lists[i].performScrollToNode(m) } }.isSuccess) break
            }
            settle()
        }
        scrollTo(hasText(OwedLine.ACCEPT))
        rule.onAllNodes(head).onFirst().assertExists()
        rule.onAllNodes(hasText(OwedLine.ACCEPT)).onFirst().assertExists()
        snap("$name-owed-card")
        // Yesterday's Stretch, the second card: its Make up and its minimum, in view before the tap.
        val makeUp = hasText("Make up · ≈ 1.9")
        scrollTo(hasText("Minimum: 1 stretch"))
        snap("$name-owed-card-stretch")
        // scrolling() leaves the test clock held; the make-up's answer and its recomposition need it running again.
        rule.mainClock.autoAdvance = true
        rule.onAllNodes(makeUp).onFirst().performClick()
        settle()
        snap("$name-owed-card-made-up")
        rule.onAllNodes(hasText("Stretch · Yesterday")).assertCountEquals(0)
        rule.onAllNodes(hasText(OwedLine.ACCEPT)).onFirst().assertExists()
        rule.onAllNodes(hasText(OwedLine.UNDO_LABEL)).onFirst().assertExists()
        rule.onAllNodes(hasText(OwedLine.UNDO_LABEL)).onFirst().performClick()
        settle()
        rule.onAllNodes(hasText("Stretch · Yesterday")).onFirst().assertExists()
        snap("$name-owed-card-undone")
    }

    /** More › Attributes (P1's Status screen; titled so since P2) with demo data, opened by its deep link: one PNG at the top, one scrolled to its end (one column), then More's list after Back. */
    private fun status(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        val links = MutableStateFlow<Uri?>(Uri.parse("xtnl://app/status"))
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts()), links, { links.value = null }, WebHolder(), {})
        }
        settle()
        snap("$name-status")
        // P2 (D6): the screen is titled Attributes. Asked before the scroll: with P4's targets the list is long enough
        // that its header leaves the composition at the end.
        rule.onAllNodes(hasText(StatusLine.TITLE)).onFirst().assertExists()
        // P4: the avatar targets sit under their rows (the demo's weight goal under Vitality).
        rule.onAllNodes(hasText("Weight 82.4 → 75 kg", substring = true)).onFirst().assertExists()
        // P5: each row counts its skills (the demo's Strength and Walking under Vitality).
        rule.onAllNodes(hasText("2 skills")).onFirst().assertExists()
        val end = hasText("How these read", substring = true, ignoreCase = true)
        val lists = rule.onAllNodes(hasScrollAction())
        for (i in 0 until lists.fetchSemanticsNodes().size) {
            if (runCatching { scrolling { lists[i].performScrollToNode(end) } }.isSuccess) break
        }
        settle()
        // P5: the Skills card sits before the note, by hours (Writing first), in the web's words.
        rule.onAllNodes(hasText(StatusLine.SKILLS_ASIDE)).onFirst().assertExists()
        rule.onAllNodes(hasText("≈ 142 h (task estimates, not timed)")).onFirst().assertExists()
        snap("$name-status-end")
        // Back lands on More's list, whose row says the same word (P2). The header and its Back are at the top, which
        // P4's longer list scrolls out of the composition on one column: scroll back up first, as a thumb would.
        for (i in 0 until lists.fetchSemanticsNodes().size) {
            if (runCatching { scrolling { lists[i].performScrollToIndex(0) } }.isSuccess) break
        }
        // The scroll above left the frame clock held (scrolling's finally); let it run so the Back lands.
        rule.mainClock.autoAdvance = true
        tap(hasContentDescription("Back"))
        settle()
        rule.onAllNodes(hasText("Open full app")).onFirst().assertExists()
        rule.onAllNodes(hasText(StatusLine.TITLE)).onFirst().assertExists()
        snap("$name-more")
    }

    /**
     * More › Mall (P18) with demo data, opened by its deep link: empty at first (D30: no starter rewards), then two
     * rewards listed through the form (a semantics action each, wherever the field sits), then a refusal in the server's
     * words. One PNG empty, one with the rewards in view, one with the refusal. P19: then Film night bought (Buy, then
     * Confirm · 60 cr), the purchase listed with its Undo, and one PNG of it.
     */
    private fun mall(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        val links = MutableStateFlow<Uri?>(Uri.parse("xtnl://app/mall"))
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts()), links, { links.value = null }, WebHolder(), {})
        }
        settle()
        rule.onAllNodes(hasText(MallLine.TITLE)).onFirst().assertExists()
        rule.onAllNodes(hasText(MallLine.EMPTY)).onFirst().assertExists()
        snap("$name-mall-empty")
        fun list(title: String, price: String, note: String = "", category: String? = null) {
            val fields = rule.onAllNodes(hasSetTextAction())
            fields[0].performTextReplacement(title)
            category?.let { rule.onAllNodes(hasText(it)).onFirst().performSemanticsAction(SemanticsActions.OnClick) }
            fields[1].performTextReplacement(price)
            if (note.isNotEmpty()) fields[2].performTextReplacement(note)
            settle(400)
            rule.onAllNodes(hasText(MallLine.ADD_BUTTON)).onFirst().performSemanticsAction(SemanticsActions.OnClick)
            settle()
        }
        list("Takeaway night", "120", "From the Thai place")
        list("Film night", "60", category = "Screen time")
        rule.onAllNodes(hasText("Film night listed at 60 cr.")).onFirst().assertExists()
        val first = hasText("Takeaway night")
        val lists = rule.onAllNodes(hasScrollAction())
        for (i in 0 until lists.fetchSemanticsNodes().size) {
            if (runCatching { scrolling { lists[i].performScrollToNode(first) } }.isSuccess) break
        }
        rule.mainClock.autoAdvance = true
        settle()
        rule.onAllNodes(hasText("≈ 3 good days", substring = true)).onFirst().assertExists()
        snap("$name-mall-listed")
        // A rest day stays free: the server's refusal, in its own words, under the form.
        list("Rest day", "50")
        rule.onAllNodes(hasText("Sleep, naps and rest days stay free: the Mall never prices them.")).onFirst().assertExists()
        val refusal = hasText("Sleep, naps and rest days stay free", substring = true)
        for (i in 0 until lists.fetchSemanticsNodes().size) {
            if (runCatching { scrolling { lists[i].performScrollToNode(refusal) } }.isSuccess) break
        }
        rule.mainClock.autoAdvance = true
        settle()
        snap("$name-mall-refused")
        // P19: Buy, then Confirm, on Film night (185 cr covers its 60); the purchase lands with its Undo.
        val buy = hasContentDescription("Buy Film night for 60 cr")
        for (i in 0 until lists.fetchSemanticsNodes().size) {
            if (runCatching { scrolling { lists[i].performScrollToNode(buy) } }.isSuccess) break
        }
        rule.onAllNodes(buy).onFirst().performSemanticsAction(SemanticsActions.OnClick)
        settle(400)
        rule.onAllNodes(hasContentDescription("Confirm · 60 cr: buy Film night")).onFirst().performSemanticsAction(SemanticsActions.OnClick)
        settle()
        // The wallet's line (the lazy list composes only what is in view, so scroll to each before asserting it).
        fun scrollTo(m: SemanticsMatcher) {
            for (i in 0 until lists.fetchSemanticsNodes().size) {
                if (runCatching { scrolling { lists[i].performScrollToNode(m) } }.isSuccess) break
            }
        }
        val boughtLine = hasText("Film night bought for 60 cr · 125 cr left.")
        scrollTo(boughtLine)
        rule.onAllNodes(boughtLine).onFirst().assertExists()
        val undo = hasContentDescription("Undo the purchase of Film night")
        scrollTo(undo)
        rule.onAllNodes(undo).onFirst().assertExists()
        // The whole Purchases card in view (on the main display it heads the second pane).
        // ("Purchases" alone is also a category chip in the Add form: the card's own aside is unique.)
        scrollTo(hasText("undo within 10 min"))
        rule.mainClock.autoAdvance = true
        settle()
        snap("$name-mall-bought")
        // The review of 2026-10-24: undone, the purchase's price is struck through and read as undone, never "+60 cr".
        rule.onAllNodes(undo).onFirst().performSemanticsAction(SemanticsActions.OnClick)
        settle()
        val undone = hasContentDescription("Film night. 60 cr, undone.", substring = true)
        scrollTo(undone)
        rule.onAllNodes(undone).onFirst().assertExists()
        rule.onAllNodes(hasText("+60 cr")).assertCountEquals(0)
        scrollTo(hasText("undo within 10 min"))
        settle()
        snap("$name-mall-undone")
    }

    /**
     * Review fatigue (P30) with demo data, as a server with it switched on: the demo at its 199th answer of the day, so the
     * run's first answer is the 200th, which applies Fatigued once (after it is paid). Ending the run and starting another
     * reads the queue again, whose `fatigued` the runner says under its bar; that run ended before an answer, the Review
     * tab's Start panel says it with its note, from /check's review.fatigued.
     */
    private fun fatigue(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        (graph.api as com.xtnl.app.data.DemoApi).seedAnswersToday(com.xtnl.app.data.DEMO_FATIGUE_ANSWERS - 1)
        val links = MutableStateFlow<Uri?>(null)
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts()), links, { links.value = null }, WebHolder(), {})
        }
        settle()
        links.value = Uri.parse("xtnl://app/review")
        settle()
        rule.onAllNodes(hasContentDescription("Fatigued until", substring = true)).assertCountEquals(0)
        rule.onAllNodes(hasSetTextAction()).onFirst().performTextInput("ATP")
        tap(hasText("Check answer"))
        settle()
        tap(hasContentDescription("End session"))
        settle()
        tap(hasText("Review more"))
        settle()
        // The line is one TalkBack node (its words are its description).
        rule.onAllNodes(hasContentDescription("Fatigued until", substring = true)).onFirst().assertExists()
        snap("$name-fatigue-1-runner")
        // Ended before an answer, the run leaves nothing to sum up: the Review tab's Start panel, on /check's figures.
        tap(hasContentDescription("End session"))
        settle()
        rule.onAllNodes(hasContentDescription(com.xtnl.app.core.FatigueLine.NOTE, substring = true)).onFirst().assertExists()
        snap("$name-fatigue-2-start")
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
        // P21: the Rest tokens chip is on the check's header, on every display.
        rule.onAllNodes(hasText(RestTokenLine.chip(2))).onFirst().assertExists()
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

    /**
     * Settings › Health Connect (P27) with demo data: the section off (its line says nothing is read), then the toggle
     * flipped, which shows the rationale before Health Connect is asked (the sync stays off until it allows the reads).
     */
    private fun health(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        val links = MutableStateFlow<Uri?>(Uri.parse("xtnl://app/settings"))
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts()), links, { links.value = null }, WebHolder(), {})
        }
        settle()
        val toggle = hasText(HealthLine.TOGGLE)
        val lists = rule.onAllNodes(hasScrollAction())
        fun scrollTo(m: SemanticsMatcher) {
            for (i in 0 until lists.fetchSemanticsNodes().size) {
                if (runCatching { scrolling { lists[i].performScrollToNode(m) } }.isSuccess) break
            }
        }
        // The section sits above Data, the last one: scrolled to Data's line, the whole of it is in view.
        val end = hasText("Demo data: a made-up day", substring = true)
        scrollTo(end)
        settle(800)
        rule.onAllNodes(hasText("Off: nothing is read from Health Connect.")).onFirst().assertExists()
        snap("$name-health-off")
        rule.mainClock.autoAdvance = true
        tap(toggle)
        settle(800)
        // With Health Connect there, the rationale shows before anything is asked; without it, the line says so. Either
        // way the sync is still off (it starts only once Health Connect allows the reads).
        check(!graph.settings.state.value.healthSync) { "the toggle alone must not turn the sync on" }
        val rationale = runCatching { rule.onAllNodes(hasText("What happens with it")).onFirst().assertExists() }.isSuccess
        scrollTo(if (rationale) hasText("Not now") else end)
        settle(800)
        snap("$name-health-${if (rationale) "rationale-in-settings" else "unavailable"}")
    }

    /**
     * The minutes sheet with demo data (P7, P23, P24): a long press on a chore (its chips and its minimum only), a tap on
     * the deep-work task (chips across its estimate, "No timer yet", Start timer, Done held at "Pick the minutes"), its
     * timer started, its 90 picked over the timer, then the reading task (page chips, the target picked: "Done · 30
     * pages"). Each sheet is ticked with its Done, which closes it. The sheet is its own window: [snapAll] draws it.
     */
    private fun minutesSheet(name: String) {
        val graph = ApplicationProvider.getApplicationContext<XtnlApp>().graph
        graph.settings.setDemo(true)
        graph.settings.setMotion(MotionChoice.STILL)
        val links = MutableStateFlow<Uri?>(null)
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            AppRoot(graph, MutableStateFlow(WindowFacts()), links, { links.value = null }, WebHolder(), {})
        }
        settle()
        rule.onAllNodes(hasText("Call the dentist")).onFirst().performTouchInput { longClick() }
        settle(1_200)
        rule.onAllNodes(hasText("Done · ~10 min")).onFirst().assertExists()
        snapAll("$name-sheet-1-chore")
        tap(hasText("Done · ~10 min"))
        settle(1_200)

        tap(hasText("Write the thesis chapter"))
        settle(1_200)
        rule.onAllNodes(hasText("Pick the minutes")).onFirst().assertExists()
        rule.onAllNodes(hasText("180 min")).onFirst().assertExists()
        snapAll("$name-sheet-2-proof")
        tap(hasText("Start timer"))
        settle(1_200)
        snapAll("$name-sheet-3-timer")
        tap(hasText("90 min"))
        settle(400)
        rule.onAllNodes(hasText("Done · 90 min")).onFirst().assertExists()
        snapAll("$name-sheet-4-picked")
        tap(hasText("Done · 90 min"))
        settle(1_200)

        // The cover screen's list holds the habits below the fold: scrolled to the reading task first.
        val lists = rule.onAllNodes(hasScrollAction())
        for (i in 0 until lists.fetchSemanticsNodes().size) {
            // The clock runs on its own in this walk already (scrolling would hold it afterwards).
            if (runCatching { lists[i].performScrollToNode(hasText("Read the novel")) }.isSuccess) break
        }
        settle(800)
        tap(hasText("Read the novel"))
        settle(1_200)
        rule.onAllNodes(hasText("Done · 30 pages")).onFirst().assertExists()
        snapAll("$name-sheet-5-pages")
        tap(hasText("Done · 30 pages"))
        settle(1_200)
        snap("$name-sheet-6-board")
    }

    /**
     * Every window on screen, bottom first (the activity, then a sheet or a dialog over it), drawn into one PNG: a
     * ModalBottomSheet is its own window, which [snap] (the activity's view tree alone) would leave out.
     */
    private fun snapAll(name: String) {
        rule.waitForIdle()
        val decor = rule.activity.window.decorView.rootView
        val views: List<android.view.View> = runCatching {
            val wmg = Class.forName("android.view.WindowManagerGlobal")
            val g = wmg.getMethod("getInstance").invoke(null)
            val f = wmg.getDeclaredField("mViews").apply { isAccessible = true }
            @Suppress("UNCHECKED_CAST")
            (f.get(g) as List<android.view.View>).toList()
        }.getOrDefault(listOf(decor)).filter { it.isShown && it.width > 0 && it.height > 0 }
        val bmp = Bitmap.createBitmap(decor.width, decor.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val origin = IntArray(2).also { decor.getLocationOnScreen(it) }
        for (v in views.ifEmpty { listOf(decor) }) {
            val at = IntArray(2).also { v.getLocationOnScreen(it) }
            canvas.save()
            canvas.translate((at[0] - origin[0]).toFloat(), (at[1] - origin[1]).toFloat())
            var tries = 0
            while (true) {
                try {
                    v.draw(canvas)
                    break
                } catch (e: IllegalArgumentException) {
                    if (++tries > 40) throw e
                    frames(16)
                }
            }
            canvas.restore()
        }
        FileOutputStream(File(dir, "$name.png")).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun healthRationale(name: String) {
        rule.runOnUiThread { rule.activity.actionBar?.hide() }
        rule.setContent {
            XtnlTheme(resolveColors(ThemeChoice.NIGHT)) {
                Box(Modifier.fillMaxSize().background(X.c.page).verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
                    HealthRationale(onContinue = null, onClose = {}, modifier = Modifier.widthIn(max = 560.dp).padding(horizontal = 16.dp, vertical = 24.dp), closeLabel = "Close")
                }
            }
        }
        settle(800)
        rule.onAllNodes(hasText(HealthLine.RATIONALE_TITLE)).onFirst().assertExists()
        snap("$name-health-rationale")
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

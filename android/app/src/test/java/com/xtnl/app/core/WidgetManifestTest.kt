package com.xtnl.app.core

import com.xtnl.app.tile.CheckinTileService
import com.xtnl.app.tile.LogTileService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Blueprint P8: the manifest declares the cover-screen widget (its receiver, its size) and the quick-settings tile
 * (bound only by the system, a button that opens the quick line at its task section), as the launcher shortcut does.
 */
class WidgetManifestTest {
    private val android = "http://schemas.android.com/apk/res/android"

    private fun file(p: String) = File("src/main/$p").takeIf { it.exists() } ?: File("app/src/main/$p")

    private fun parse(p: String) = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }.newDocumentBuilder().parse(file(p))

    private val manifest by lazy { parse("AndroidManifest.xml") }

    private fun org.w3c.dom.Document.elements(tag: String): List<Element> = getElementsByTagName(tag).let { n -> (0 until n.length).map { n.item(it) as Element } }
    private fun Element.attr(name: String) = getAttributeNS(android, name)
    private fun Element.children(tag: String) = getElementsByTagName(tag).let { n -> (0 until n.length).map { n.item(it) as Element } }

    @Test fun theWidgetsReceiverAndItsSize() {
        val r = manifest.elements("receiver").single { it.attr("name") == ".widget.TodayWidgetReceiver" }
        assertEquals("true", r.attr("exported"))
        assertEquals(listOf("android.appwidget.action.APPWIDGET_UPDATE"), r.children("action").map { it.attr("name") })
        val meta = r.children("meta-data").single()
        assertEquals("android.appwidget.provider", meta.attr("name"))
        assertEquals("@xml/today_widget_info", meta.attr("resource"))
        val info = parse("res/xml/today_widget_info.xml").documentElement
        // Four cells by two on the cover screen; every row a 48 dp target (WidgetRows.ROW_DP).
        assertEquals(listOf("4", "2"), listOf(info.attr("targetCellWidth"), info.attr("targetCellHeight")))
        assertEquals("horizontal|vertical", info.attr("resizeMode"))
        assertTrue(info.attr("minHeight"), info.attr("minHeight").removeSuffix("dp").toInt() >= WidgetRows.HEAD_DP + WidgetRows.ROW_DP)
    }

    @Test fun theTileOpensTheQuickLineAtItsTaskSection() {
        val s = manifest.elements("service").single { it.attr("name") == ".tile.LogTileService" }
        assertEquals("only the system binds it", "android.permission.BIND_QUICK_SETTINGS_TILE", s.attr("permission"))
        assertEquals("true", s.attr("exported"))
        assertEquals(listOf("android.service.quicksettings.action.QS_TILE"), s.children("action").map { it.attr("name") })
        assertEquals("a button, never a switch", "false", s.children("meta-data").single { it.attr("name") == "android.service.quicksettings.TOGGLEABLE_TILE" }.attr("value"))
        // The launcher's Log a task shortcut's own link (Nav.open: Log, the task section, the line focused).
        assertEquals("xtnl://app/log?section=task", LogTileService.LOG_URI)
        val shortcuts = file("res/xml/shortcuts.xml").readText()
        assertTrue(shortcuts.contains("android:data=\"${LogTileService.LOG_URI}\""))
    }

    /** Health phase 2 (D2): a second tile, "Check in", a button bound only by the system, that opens the check-in sheet. */
    @Test fun theCheckinTileOpensTheSheet() {
        val s = manifest.elements("service").single { it.attr("name") == ".tile.CheckinTileService" }
        assertEquals("only the system binds it", "android.permission.BIND_QUICK_SETTINGS_TILE", s.attr("permission"))
        assertEquals("true", s.attr("exported"))
        assertEquals("@string/tile_checkin_label", s.attr("label"))
        assertEquals(listOf("android.service.quicksettings.action.QS_TILE"), s.children("action").map { it.attr("name") })
        assertEquals("a button, never a switch", "false", s.children("meta-data").single { it.attr("name") == "android.service.quicksettings.TOGGLEABLE_TILE" }.attr("value"))
        assertEquals("xtnl://app/checkin?via=tile", CheckinTileService.CHECKIN_URI)
        // The launcher's Check in shortcut opens the same sheet.
        val shortcuts = file("res/xml/shortcuts.xml").readText()
        assertTrue(shortcuts.contains("android:shortcutId=\"check_in\"") && shortcuts.contains("android:data=\"xtnl://app/checkin\""))
        // The tile says nothing about a check-in: no subtitle, no state.
        val tile = file("java/com/xtnl/app/tile/CheckinTileService.kt").readText()
        for (word in listOf("subtitle", "STATE_ACTIVE", "lastAt", "todayCount", "valence", "stress")) assertTrue(word, !tile.contains(word))
    }

    /**
     * Static shortcuts rank in the order they are declared, and a launcher that shows four (or two, with a notification
     * showing) drops the last: Check in is second, so it stays; Review, still in the app's own navigation, goes first.
     */
    @Test fun checkInIsTheSecondShortcut() {
        val ids = parse("res/xml/shortcuts.xml").elements("shortcut").map { it.attr("shortcutId") }
        assertEquals(listOf("quick_check", "check_in", "quick_task", "new_idea", "review"), ids)
        assertTrue(ids.indexOf("check_in") < 2)
    }

    /** Health phase 2 adds no permission: the manifest asks for exactly what it asked before (Health Connect's widening is a later phase). */
    @Test fun noNewPermission() {
        val declared = manifest.elements("uses-permission").map { it.attr("name") }.toSet()
        assertEquals(
            setOf(
                "android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE", "android.permission.VIBRATE",
                "android.permission.POST_NOTIFICATIONS", "android.permission.RECEIVE_BOOT_COMPLETED", "android.permission.SCHEDULE_EXACT_ALARM",
                "android.permission.health.READ_EXERCISE", "android.permission.health.READ_DISTANCE", "android.permission.health.READ_ELEVATION_GAINED",
                "android.permission.health.READ_WEIGHT", "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND",
            ),
            declared,
        )
    }

    /** D9: the offline queue (a waiting check-in holds its values) never leaves the phone in a backup or a transfer. */
    @Test fun theQueueStaysOnThePhone() {
        val rules = parse("res/xml/data_extraction_rules.xml")
        for (part in listOf("cloud-backup", "device-transfer")) {
            val excluded = rules.elements(part).single().children("exclude").map { it.getAttribute("domain") + ":" + it.getAttribute("path") }
            assertTrue("$part: $excluded", "file:send-queue.json" in excluded)
        }
    }
}

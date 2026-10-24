package com.xtnl.app.core

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
}

package com.xtnl.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * The permission rationale Health Connect requires (blueprint P27): without it, Health Connect refuses to show its
 * permission dialog. The manifest declares exactly the permissions the app asks for, the rationale activity for
 * Android 13 and below, and the alias Android 14+ opens (startable by the system only).
 */
class HealthManifestTest {
    private val android = "http://schemas.android.com/apk/res/android"

    private val doc by lazy {
        val f = File("src/main/AndroidManifest.xml").takeIf { it.exists() } ?: File("app/src/main/AndroidManifest.xml")
        DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }.newDocumentBuilder().parse(f)
    }

    private fun elements(tag: String): List<Element> = doc.getElementsByTagName(tag).let { n -> (0 until n.length).map { n.item(it) as Element } }
    private fun Element.attr(name: String) = getAttributeNS(android, name)
    private fun Element.children(tag: String) = getElementsByTagName(tag).let { n -> (0 until n.length).map { n.item(it) as Element } }

    @Test fun theHealthPermissionsAreExactlyTheOnesAsked() {
        val declared = elements("uses-permission").map { it.attr("name") }.filter { it.startsWith("android.permission.health.") }.toSet()
        assertEquals(HealthLine.asked(backgroundAvailable = true), declared)
    }

    @Test fun theRationaleActivityAnswersHealthConnectsIntent() {
        val activity = elements("activity").single { it.attr("name") == ".health.HealthRationaleActivity" }
        assertEquals("true", activity.attr("exported"))
        val actions = activity.children("action").map { it.attr("name") }
        assertTrue(actions.toString(), "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" in actions)
    }

    @Test fun androidFourteenOpensItThroughTheSystemOnlyAlias() {
        val alias = elements("activity-alias").single { it.attr("targetActivity") == ".health.HealthRationaleActivity" }
        assertEquals("android.permission.START_VIEW_PERMISSION_USAGE", alias.attr("permission"))
        assertEquals(listOf("android.intent.action.VIEW_PERMISSION_USAGE"), alias.children("action").map { it.attr("name") })
        assertEquals(listOf("android.intent.category.HEALTH_PERMISSIONS"), alias.children("category").map { it.attr("name") })
    }

    @Test fun healthConnectsAppIsVisibleOnOlderAndroid() {
        val packages = elements("queries").flatMap { it.children("package") }.map { it.attr("name") }
        assertTrue(packages.toString(), HealthLine.PROVIDER in packages)
    }
}

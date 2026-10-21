package com.xtnl.app.core

import java.net.URI
import java.util.Locale

/**
 * The server address rules, shared by Settings and the network layer.
 *
 * - An address is an origin: scheme, host and an optional port. Any path,
 *   query or trailing slash typed after it is dropped ("…vercel.app/today/" →
 *   "…vercel.app").
 * - https is allowed for any host. Plain http only for a dev server on this
 *   phone or PC: localhost, 127.0.0.1 (adb reverse) and 10.0.2.2 (the
 *   emulator's view of the PC), the same hosts res/xml/network_security_config
 *   lets through.
 * - A bare host ("xtnl.example.com") is read as https.
 */
object ServerAddress {
    const val PRODUCTION = "https://xtnl-knowledge-xpis.vercel.app"
    const val LOCAL_DEV = "http://localhost:3100"

    val CLEARTEXT_HOSTS = setOf("localhost", "127.0.0.1", "10.0.2.2")

    sealed interface Check {
        data class Ok(val origin: String) : Check
        data class Bad(val reason: String) : Check
    }

    fun check(raw: String): Check {
        val text = raw.trim()
        if (text.isEmpty()) return Check.Bad("Enter the server's address.")
        if (text.any { it.isWhitespace() }) return Check.Bad("An address has no spaces.")
        val withScheme = if ("://" in text) text else "https://$text"
        val uri = try {
            URI(withScheme)
        } catch (e: Exception) {
            return Check.Bad("That doesn't look like an address.")
        }
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        val host = uri.host?.lowercase(Locale.ROOT)
        if (host.isNullOrEmpty()) return Check.Bad("That doesn't look like an address.")
        if (uri.userInfo != null) return Check.Bad("Leave the name and password out of the address.")
        when (scheme) {
            "https" -> Unit
            "http" -> if (host !in CLEARTEXT_HOSTS) {
                return Check.Bad("Use https://. Plain http:// is only for localhost, 127.0.0.1 or 10.0.2.2.")
            }
            else -> return Check.Bad("Start the address with https://.")
        }
        val port = uri.port
        if (port != -1 && (port < 1 || port > 65535)) return Check.Bad("That port isn't valid.")
        val defaultPort = if (scheme == "https") 443 else 80
        val portPart = if (port == -1 || port == defaultPort) "" else ":$port"
        return Check.Ok("$scheme://$host$portPart")
    }

    /** The origin, or null when the text isn't a usable address. */
    fun normalize(raw: String): String? = (check(raw) as? Check.Ok)?.origin

    /** Same scheme, host and port (default ports filled in). For the full-app WebView's link rule. */
    fun sameOrigin(a: String, b: String): Boolean {
        val ua = runCatching { URI(a) }.getOrNull() ?: return false
        val ub = runCatching { URI(b) }.getOrNull() ?: return false
        if (ua.scheme == null || ub.scheme == null || ua.host == null || ub.host == null) return false
        return ua.scheme.equals(ub.scheme, ignoreCase = true) &&
            ua.host.equals(ub.host, ignoreCase = true) &&
            portOf(ua) == portOf(ub)
    }

    private fun portOf(u: URI): Int = when {
        u.port != -1 -> u.port
        u.scheme.equals("https", ignoreCase = true) -> 443
        else -> 80
    }

    fun hostOf(origin: String): String = runCatching { URI(origin).host }.getOrNull() ?: origin
}

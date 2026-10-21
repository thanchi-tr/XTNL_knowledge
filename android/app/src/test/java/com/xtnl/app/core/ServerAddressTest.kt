package com.xtnl.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerAddressTest {
    private fun ok(raw: String) = (ServerAddress.check(raw) as ServerAddress.Check.Ok).origin
    private fun bad(raw: String) = ServerAddress.check(raw) is ServerAddress.Check.Bad

    @Test fun httpsIsKeptAsAnOrigin() {
        assertEquals("https://xtnl-knowledge-xpis.vercel.app", ok("https://xtnl-knowledge-xpis.vercel.app"))
        assertEquals("https://xtnl-knowledge-xpis.vercel.app", ok("  https://xtnl-knowledge-xpis.vercel.app/today/?x=1  "))
        assertEquals("https://example.com", ok("HTTPS://Example.COM/"))
        assertEquals("https://example.com:8443", ok("https://example.com:8443/a"))
        assertEquals("https://example.com", ok("https://example.com:443"))
    }

    @Test fun aBareHostIsReadAsHttps() {
        assertEquals("https://xtnl.example.com", ok("xtnl.example.com"))
    }

    @Test fun plainHttpOnlyForTheDevHosts() {
        assertEquals("http://localhost:3100", ok(ServerAddress.LOCAL_DEV))
        assertEquals("http://127.0.0.1:3100", ok("http://127.0.0.1:3100"))
        assertEquals("http://10.0.2.2:3000", ok("http://10.0.2.2:3000/"))
        assertEquals("http://localhost", ok("http://localhost:80"))
        assertTrue(bad("http://example.com"))
        assertTrue(bad("http://192.168.1.10:3100"))
    }

    @Test fun refusesWhatIsNotAnAddress() {
        assertTrue(bad(""))
        assertTrue(bad("   "))
        assertTrue(bad("ftp://example.com"))
        assertTrue(bad("https://"))
        assertTrue(bad("https://exa mple.com"))
        assertTrue(bad("https://user:pass@example.com"))
        assertTrue(bad("javascript:alert(1)"))
        assertNull(ServerAddress.normalize("http://evil.example"))
    }

    @Test fun sameOriginComparesSchemeHostAndPort() {
        assertTrue(ServerAddress.sameOrigin("https://a.example/x?y", "https://a.example"))
        assertTrue(ServerAddress.sameOrigin("https://A.example:443/", "https://a.example"))
        assertTrue(ServerAddress.sameOrigin("http://localhost:3100/today", ServerAddress.LOCAL_DEV))
        assertFalse(ServerAddress.sameOrigin("http://a.example", "https://a.example"))
        assertFalse(ServerAddress.sameOrigin("https://a.example:8443", "https://a.example"))
        assertFalse(ServerAddress.sameOrigin("https://b.example", "https://a.example"))
        assertFalse(ServerAddress.sameOrigin("not a url", "https://a.example"))
    }

    @Test fun hostOf() {
        assertEquals("xtnl-knowledge-xpis.vercel.app", ServerAddress.hostOf(ServerAddress.PRODUCTION))
    }
}

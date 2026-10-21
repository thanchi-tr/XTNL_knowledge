package com.xtnl.app.ui.log

import com.xtnl.app.data.IdeaResult
import org.junit.Assert.assertEquals
import org.junit.Test

/** New idea's "Filed this session" list: its rows are LazyColumn keys, which must never repeat. */
class FiledTest {
    private val dup = IdeaResult("duplicate", "i-1", "Photosynthesis", null, null, 0.0, "Something close is already here.")

    @Test fun twoEqualResultsGetTwoKeys() {
        // The server answers a repeated duplicate (or merged) filing with an equal result.
        var l = LogViewModel.filed(emptyList(), dup, "c-1")
        l = LogViewModel.filed(l, dup.copy(), "c-2")
        assertEquals(listOf("c-2", "c-1"), l.map { it.key })
        assertEquals(2, l.map { it.key }.distinct().size)
    }

    @Test fun aReusedKeyIsMadeUnique() {
        var l = LogViewModel.filed(emptyList(), dup, "c-1")
        l = LogViewModel.filed(l, dup, "c-1")
        l = LogViewModel.filed(l, dup, "c-1")
        assertEquals(3, l.map { it.key }.distinct().size)
    }

    @Test fun keepsTheNewestTwenty() {
        var l = emptyList<LogViewModel.Filed>()
        repeat(25) { l = LogViewModel.filed(l, dup, "c-$it") }
        assertEquals(20, l.size)
        assertEquals("c-24", l.first().key)
    }
}

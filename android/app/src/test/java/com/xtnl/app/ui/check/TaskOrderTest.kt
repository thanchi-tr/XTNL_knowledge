package com.xtnl.app.ui.check

import com.xtnl.app.data.TaskItem
import org.junit.Assert.assertEquals
import org.junit.Test

/** Just after a tick or an undo, a background read keeps the rows in the order on screen. */
class TaskOrderTest {
    private fun ids(l: List<TaskItem>) = l.map { it.templateId }
    private fun rows(vararg id: String) = id.map { TaskItem(it, it) }

    @Test fun keptRowsStayWhereTheyAre() {
        // The server sinks kept rows to the bottom; the screen keeps them in their slots.
        val held = CheckViewModel.holdOrder(listOf("gym", "dentist", "tax", "read"), rows("dentist", "read", "gym", "tax"))
        assertEquals(listOf("gym", "dentist", "tax", "read"), ids(held))
    }

    @Test fun aNewRowGoesAfterItsNeighbourAndAGoneOneLeaves() {
        val held = CheckViewModel.holdOrder(listOf("gym", "dentist", "tax"), rows("new", "dentist", "late", "gym"))
        assertEquals(listOf("new", "gym", "dentist", "late"), ids(held))
    }
}

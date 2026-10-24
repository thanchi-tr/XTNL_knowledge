package com.xtnl.app.tile

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.xtnl.app.MainActivity

/**
 * The quick-settings tile (blueprint 5.1b, P8): "Log a task" opens the quick line at its task section, focused
 * ([LOG_URI], the launcher's Log a task shortcut's own link), from any screen, the lock screen included (it asks to
 * unlock first). A button, never a switch: it has no state to show.
 */
class LogTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        qsTile?.let { t ->
            t.state = Tile.STATE_INACTIVE
            t.updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        if (isLocked) unlockAndRun { open() } else open()
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    private fun open() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(LOG_URI), this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    companion object {
        /** Nav.open lands it on Log, the task section, the line focused. */
        const val LOG_URI = "xtnl://app/log?section=task"
    }
}

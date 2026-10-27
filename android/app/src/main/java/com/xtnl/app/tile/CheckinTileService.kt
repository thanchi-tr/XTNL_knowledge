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
 * The second quick-settings tile (health phase 2; D2): "Check in" opens the check-in sheet ([CHECKIN_URI]: Nav.open
 * lands on Check with the sheet over it, its `via` the tile's), from any screen, the lock screen included (it asks to
 * unlock first, so the sheet never shows over the lock screen). A button, never a switch: it has no state, and it never
 * says anything about a check-in (no time, no count, no value).
 */
class CheckinTileService : TileService() {

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
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(CHECKIN_URI), this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    companion object {
        /** Nav.open lands it on Check, the check-in sheet open, sent with via "tile". */
        const val CHECKIN_URI = "xtnl://app/checkin?via=tile"
    }
}

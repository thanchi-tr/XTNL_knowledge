package com.xtnl.app.notify

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.xtnl.app.MainActivity
import com.xtnl.app.R
import com.xtnl.app.XtnlApp
import com.xtnl.app.core.AuditAlarm
import com.xtnl.app.data.AppSettings
import java.time.Instant

/**
 * The Sunday reminder's alarm (decision D37; core/AuditAlarm holds the rules and the words): one AlarmManager alarm
 * at the next Sunday 19:00 Sydney, set as an absolute instant (so the phone's own zone never moves it), re-armed each
 * time it fires, at every app start, after a reboot or an update, and when Android's Alarms & reminders access is
 * granted. Armed only while Settings has it on and the server's audit is switched on (its last /check said `auditOn`);
 * otherwise cancelled. It may fire while the phone idles. It is exact (19:00) when Android lets the app set exact
 * alarms (SCHEDULE_EXACT_ALARM: before Android 14 usually granted on install, from it asked for in Settings ›
 * Notifications); otherwise Android delivers it within the hour after 19:00 (an inexact alarm on Android 12+). When
 * it fires, the notification shows only if notifications are allowed (Android 13+ asks once); a tap opens
 * xtnl://app/week. No server push.
 */
class AuditReminder(private val context: Context, private val settings: AppSettings) {

    /** Arms or cancels the alarm to match Settings and the server. One alarm: a new one replaces it. */
    fun sync(now: Instant = Instant.now()) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = alarmIntent(context)
        val p = settings.state.value
        if (!AuditAlarm.armed(p.auditReminder, p.auditLive)) {
            am.cancel(pi)
            return
        }
        val at = AuditAlarm.nextAt(now).toEpochMilli()
        try {
            if (exact(context)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (_: SecurityException) {
            // Exact alarms were taken away between the check and the call.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    /**
     * A /check from the server in use (never demo data, never an answer from a source just switched away from) said
     * whether its audit is switched on (`auditOn`). The alarm follows when that changes.
     */
    fun sawAudit(on: Boolean) {
        if (settings.state.value.auditLive == on) return
        settings.setAuditLive(on)
        sync()
    }

    /** Settings › Notifications › Week audit. */
    fun setEnabled(on: Boolean) {
        settings.setAuditReminder(on)
        sync()
    }

    /** The alarm fired: the notification (while still armed and allowed), then the next Sunday. */
    fun fire() {
        val p = settings.state.value
        if (AuditAlarm.armed(p.auditReminder, p.auditLive) && permitted(context)) post(context)
        sync()
    }

    companion object {
        const val CHANNEL_ID = "week-audit"
        const val NOTIFICATION_ID = 4219
        internal const val ACTION_FIRE = "com.xtnl.app.AUDIT_REMINDER"

        /** Exact alarms can be set: always before Android 12; from it, while Alarms & reminders access is granted. */
        fun exact(context: Context): Boolean =
            Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true

        /** Notifications can show: allowed for the app, and on Android 13+ the runtime permission granted. */
        fun permitted(context: Context): Boolean =
            NotificationManagerCompat.from(context).areNotificationsEnabled() && !needsPermission(context)

        /** Android 13+ asks for POST_NOTIFICATIONS at run time: true while it is not granted. */
        fun needsPermission(context: Context): Boolean =
            Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED

        private fun alarmIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
            context, 0, Intent(context, AuditAlarmReceiver::class.java).setAction(ACTION_FIRE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        private fun post(context: Context) {
            val nm = context.getSystemService(NotificationManager::class.java) ?: return
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, AuditAlarm.CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT).apply { description = AuditAlarm.CHANNEL_TEXT },
            )
            val open = PendingIntent.getActivity(
                context, 1,
                Intent(Intent.ACTION_VIEW, Uri.parse(AuditAlarm.LINK), context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val n = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(AuditAlarm.TITLE)
                .setContentText(AuditAlarm.TEXT)
                .setStyle(NotificationCompat.BigTextStyle().bigText(AuditAlarm.TEXT))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            try {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, n)
            } catch (_: SecurityException) {
                // The permission went between the check and the post: nothing shows.
            }
        }
    }
}

/** The alarm (not exported): the reminder fires. */
class AuditAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AuditReminder.ACTION_FIRE) return
        (context.applicationContext as? XtnlApp)?.graph?.auditReminder?.fire()
    }
}

/**
 * Android granted Alarms & reminders (exact alarms): arm it again, now exact. Taking the access away stops the app and
 * cancels its exact alarms; the next start re-arms it inexact. Exported for the system's broadcast; any other action
 * does nothing, and re-arming is all it can ever do.
 */
class AuditExactReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED) return
        (context.applicationContext as? XtnlApp)?.graph?.auditReminder?.sync()
    }
}

/**
 * A reboot or an app update clears the alarm: arm it again. Exported for the system's two broadcasts; any other
 * action does nothing, and re-arming is all it can ever do.
 */
class AuditBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        (context.applicationContext as? XtnlApp)?.graph?.auditReminder?.sync()
    }
}

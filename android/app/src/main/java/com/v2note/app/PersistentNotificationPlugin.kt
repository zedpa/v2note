package com.v2note.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * PersistentNotificationPlugin - Capacitor Plugin (Android)
 *
 * Spec #131 Phase A1: Persistent notification with quick capture actions.
 * Shows a LOW-priority ongoing notification with "Record" and "Write" action buttons.
 * Actions open v2note://capture/ URL Scheme to jump to minimal capture pages.
 */
@CapacitorPlugin(name = "PersistentNotification")
class PersistentNotificationPlugin : Plugin() {

    companion object {
        private const val CHANNEL_ID = "quick_capture"
        private const val NOTIFICATION_ID = 9001
    }

    private var isShowing = false

    override fun load() {
        createNotificationChannel()
    }

    @PluginMethod
    fun show(call: PluginCall) {
        try {
            showNotification()
            isShowing = true
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to show notification: ${e.message}")
        }
    }

    @PluginMethod
    fun hide(call: PluginCall) {
        try {
            hideNotification()
            isShowing = false
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to hide notification: ${e.message}")
        }
    }

    @PluginMethod
    fun isActive(call: PluginCall) {
        val ret = com.getcapacitor.JSObject()
        ret.put("active", isShowing)
        call.resolve(ret)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Quick Capture",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Quick capture notification entry"
                setShowBadge(false)
            }

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun showNotification() {
        val ctx = context

        // Action 1: Record -> v2note://capture/voice?source=notification_capture
        val voiceIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("v2note://capture/voice?source=notification_capture")
            setPackage(ctx.packageName)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val voicePending = PendingIntent.getActivity(
            ctx, 1, voiceIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action 2: Write -> v2note://capture/text?source=notification_capture
        val textIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("v2note://capture/text?source=notification_capture")
            setPackage(ctx.packageName)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val textPending = PendingIntent.getActivity(
            ctx, 2, textIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Tap notification body -> open app main page
        val mainIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val mainPending = mainIntent?.let {
            PendingIntent.getActivity(
                ctx, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("V2Note")
            .setContentText("Tap to capture")
            .setOngoing(true)
            .setAutoCancel(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(mainPending)
            .addAction(0, "Record", voicePending)
            .addAction(0, "Write", textPending)
            .build()

        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }

    private fun hideNotification() {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID)
    }
}

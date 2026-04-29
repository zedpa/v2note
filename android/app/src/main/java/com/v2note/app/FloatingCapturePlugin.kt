package com.v2note.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * FloatingCapturePlugin — Capacitor Plugin (Android)
 *
 * Spec #131 Phase B: Floating bubble for quick voice capture.
 * Controls a Foreground Service that shows an overlay bubble with mic recording.
 *
 * JS API:
 *   startBubble()             → start service + show bubble
 *   stopBubble()              → stop service + hide bubble
 *   isBubbleActive()          → { active: boolean }
 *   checkOverlayPermission()  → { granted: boolean }
 *   requestOverlayPermission()→ opens system settings
 *
 * Events emitted to JS:
 *   recordingComplete  → { pcmFilePath, durationMs }
 *   bubbleStateChanged → { state: "idle"|"recording"|"processing"|"done" }
 */
@CapacitorPlugin(name = "FloatingCapture")
class FloatingCapturePlugin : Plugin() {

    companion object {
        // 静态引用，供 Service 向 JS 发事件
        var pluginInstance: FloatingCapturePlugin? = null
            private set
    }

    override fun load() {
        pluginInstance = this
    }

    override fun handleOnDestroy() {
        pluginInstance = null
        super.handleOnDestroy()
    }

    // ── 气泡控制 ──

    @PluginMethod
    fun startBubble(call: PluginCall) {
        val ctx = context
        if (!canDrawOverlays()) {
            call.reject("SYSTEM_ALERT_WINDOW permission not granted")
            return
        }
        try {
            val intent = Intent(ctx, FloatingCaptureService::class.java).apply {
                action = FloatingCaptureService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to start bubble: ${e.message}")
        }
    }

    @PluginMethod
    fun stopBubble(call: PluginCall) {
        try {
            val intent = Intent(context, FloatingCaptureService::class.java)
            context.stopService(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop bubble: ${e.message}")
        }
    }

    @PluginMethod
    fun isBubbleActive(call: PluginCall) {
        val ret = JSObject()
        ret.put("active", FloatingCaptureService.isRunning)
        call.resolve(ret)
    }

    // ── 权限 ──

    @PluginMethod
    fun checkOverlayPermission(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", canDrawOverlays())
        call.resolve(ret)
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            ).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to open overlay settings: ${e.message}")
        }
    }

    // ── 内部方法 ──

    private fun canDrawOverlays(): Boolean {
        return Settings.canDrawOverlays(context)
    }

    /**
     * Service 用来向 JS 层发送事件。
     * 必须在主线程调用（Capacitor notifyListeners 要求）。
     */
    fun emitToJs(eventName: String, data: JSObject) {
        activity?.runOnUiThread {
            notifyListeners(eventName, data)
        }
    }
}

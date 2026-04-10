package com.v2note.app

import android.content.Intent
import android.provider.AlarmClock
import android.provider.CalendarContract
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * SystemIntentPlugin — Capacitor 本地插件 (Android)
 * 通过 Intent 调起系统日历/闹钟 App，让用户确认后写入。
 * 零权限：ACTION_INSERT / ACTION_SET_ALARM 不需要运行时权限。
 */
@CapacitorPlugin(name = "SystemIntent")
class SystemIntentPlugin : Plugin() {

    @PluginMethod
    fun insertCalendarEvent(call: PluginCall) {
        val beginTime = call.getLong("beginTime")
        val endTime = call.getLong("endTime")
        if (beginTime == null || endTime == null) {
            call.reject("beginTime and endTime are required")
            return
        }
        try {
            val intent = Intent(Intent.ACTION_INSERT).apply {
                data = CalendarContract.Events.CONTENT_URI
                putExtra(CalendarContract.Events.TITLE, call.getString("title") ?: "")
                putExtra(CalendarContract.Events.DESCRIPTION, call.getString("description") ?: "")
                putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginTime)
                putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTime)
            }
            val act = activity ?: run { call.reject("No activity"); return }
            // 不用 resolveActivity（Android 11+ 因 package visibility 会返回 null）
            // 直接 startActivity，由 catch 兜底 ActivityNotFoundException
            act.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to open calendar: ${e.message}")
        }
    }

    @PluginMethod
    fun setAlarm(call: PluginCall) {
        val hour = call.getInt("hour")
        val minutes = call.getInt("minutes")
        if (hour == null || minutes == null) {
            call.reject("hour and minutes are required")
            return
        }
        if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) {
            call.reject("hour must be 0-23, minutes must be 0-59")
            return
        }
        try {
            val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(AlarmClock.EXTRA_HOUR, hour)
                putExtra(AlarmClock.EXTRA_MINUTES, minutes)
                putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("message") ?: "")
                putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            }
            val act = activity ?: run { call.reject("No activity"); return }
            act.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to set alarm: ${e.message}")
        }
    }
}

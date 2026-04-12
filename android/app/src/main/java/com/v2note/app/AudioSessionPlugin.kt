package com.v2note.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * AudioSessionPlugin — Capacitor 8 本地插件 (Android)
 * 通过 AudioManager 管理音频焦点，在录音时打断系统音频，录音结束后恢复。
 */
@CapacitorPlugin(name = "AudioSession")
class AudioSessionPlugin : Plugin() {

    private var audioManager: AudioManager? = null

    // API 26+ 使用 AudioFocusRequest
    private var focusRequest: AudioFocusRequest? = null

    // API < 26 使用旧 API
    @Suppress("DEPRECATION")
    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { /* 不处理焦点变化 */ }

    private fun getAudioManager(): AudioManager {
        if (audioManager == null) {
            audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        }
        return audioManager!!
    }

    @PluginMethod
    fun activate(call: PluginCall) {
        try {
            val am = getAudioManager()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // API 26+: 使用 AudioFocusRequest
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .build()
                focusRequest = request
                am.requestAudioFocus(request)
            } else {
                // API < 26: 使用旧 API
                @Suppress("DEPRECATION")
                am.requestAudioFocus(
                    focusChangeListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
                )
            }

            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to activate audio session: ${e.message}")
        }
    }

    @PluginMethod
    fun deactivate(call: PluginCall) {
        try {
            val am = getAudioManager()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest?.let { am.abandonAudioFocusRequest(it) }
                focusRequest = null
            } else {
                @Suppress("DEPRECATION")
                am.abandonAudioFocus(focusChangeListener)
            }

            call.resolve()
        } catch (e: Exception) {
            // deactivate 失败不阻塞
            call.resolve()
        }
    }
}

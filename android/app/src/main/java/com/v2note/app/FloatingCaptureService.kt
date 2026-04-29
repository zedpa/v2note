package com.v2note.app

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.getcapacitor.JSObject
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs

/**
 * FloatingCaptureService — Foreground Service + Overlay Bubble
 *
 * Spec #131 Phase B: Android floating mic bubble for quick voice capture.
 *
 * Lifecycle:
 *   ACTION_START → startForeground + create overlay bubble
 *   stopService  → remove bubble + stop foreground
 *
 * Bubble interactions:
 *   - Tap: toggle recording (idle → recording → submit)
 *   - Drag: move bubble, auto-snap to nearest edge on release
 *   - Long press (1s while recording): cancel recording
 *   - Drag to bottom remove zone: temporarily hide
 *
 * Recording:
 *   - Native AudioRecord: 16kHz, 16bit, mono (matches existing PCM pipeline)
 *   - Writes to cacheDir temp file
 *   - Silence detection: 5s continuous silence → auto-submit
 *   - Max duration: 5 minutes → auto-submit
 *   - Emits "recordingComplete" event with pcmFilePath + durationMs to JS
 */
class FloatingCaptureService : Service() {

    companion object {
        const val ACTION_START = "com.v2note.app.FLOATING_CAPTURE_START"
        private const val CHANNEL_ID = "floating_capture"
        private const val NOTIFICATION_ID = 9002

        // 录音参数 — 与现有 PCM 管线一致
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT

        // 静音检测阈值（16bit PCM 振幅）
        private const val SILENCE_THRESHOLD = 500
        // 连续静音自动提交阈值（毫秒）
        private const val SILENCE_AUTO_SUBMIT_MS = 5000L
        // 最大录音时长（毫秒）
        private const val MAX_RECORDING_MS = 5 * 60 * 1000L

        // 气泡尺寸（dp）
        private const val BUBBLE_SIZE_IDLE_DP = 48
        private const val BUBBLE_SIZE_RECORDING_DP = 64

        // 颜色
        private const val COLOR_DEER = 0xCC_C8956C.toInt()      // V2Note 主色调，80% 不透明
        private const val COLOR_RECORDING = 0xCC_E53935.toInt()  // 录音红色
        private const val COLOR_PROCESSING = 0xCC_FF9800.toInt() // 处理中橙色
        private const val COLOR_DONE = 0xCC_43A047.toInt()       // 完成绿色

        @Volatile
        var isRunning = false
            private set
    }

    private lateinit var windowManager: WindowManager
    private lateinit var handler: Handler

    // Bubble views
    private var bubbleContainer: FrameLayout? = null
    private var bubbleView: TextView? = null
    private var timerText: TextView? = null
    private var layoutParams: WindowManager.LayoutParams? = null

    // 气泡状态
    private enum class BubbleState { IDLE, RECORDING, PROCESSING, DONE }
    private var state = BubbleState.IDLE

    // 录音
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var pcmFile: File? = null
    private var pcmOutputStream: FileOutputStream? = null
    private var recordingStartTime = 0L
    private var lastNonSilenceTime = 0L

    // 触摸处理
    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var isDragging = false
    private var longPressRunnable: Runnable? = null

    // 定时器
    private var timerRunnable: Runnable? = null

    // ── Service 生命周期 ──

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        handler = Handler(Looper.getMainLooper())
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_START) {
            startForeground(NOTIFICATION_ID, buildForegroundNotification())
            isRunning = true
            createBubble()
            emitState("idle")
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        cancelRecordingInternal()
        removeBubble()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    // ── 通知 ──

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice Capture Bubble",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Floating bubble for quick voice capture"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val mainIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val mainPending = mainIntent?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("V2Note")
            .setContentText("Voice capture bubble active")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(mainPending)
            .build()
    }

    // ── 气泡 UI ──

    private fun dpToPx(dp: Int): Int {
        return (dp * resources.displayMetrics.density).toInt()
    }

    private fun createBubble() {
        if (bubbleContainer != null) return

        val sizePx = dpToPx(BUBBLE_SIZE_IDLE_DP)

        // 容器（包含气泡 + 计时文本）
        val container = FrameLayout(this)

        // 气泡圆形 — 简化图标（文字符号）
        val bubble = TextView(this).apply {
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(COLOR_DEER)
            }
            background = bg
            text = "🎙"
            textSize = 20f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            elevation = 8f
        }
        val bubbleLp = FrameLayout.LayoutParams(sizePx, sizePx).apply {
            gravity = Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM
        }
        container.addView(bubble, bubbleLp)

        // 计时文本（气泡上方）
        val timer = TextView(this).apply {
            text = "00:00"
            setTextColor(Color.WHITE)
            textSize = 12f
            setShadowLayer(4f, 0f, 0f, Color.BLACK)
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        val timerLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.CENTER_HORIZONTAL or Gravity.TOP
        }
        container.addView(timer, timerLp)

        // WindowManager 参数
        val containerHeight = sizePx + dpToPx(24) // 气泡 + 计时器空间
        val params = WindowManager.LayoutParams(
            dpToPx(BUBBLE_SIZE_RECORDING_DP), // 用大尺寸容器，小气泡居中
            containerHeight,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            // 初始位置：右侧顶部（状态栏下方）
            val dm = resources.displayMetrics
            x = dm.widthPixels - dpToPx(BUBBLE_SIZE_RECORDING_DP) - dpToPx(8)
            y = dpToPx(80)
        }

        // 触摸事件
        container.setOnTouchListener(BubbleTouchListener())

        windowManager.addView(container, params)
        bubbleContainer = container
        bubbleView = bubble
        timerText = timer
        layoutParams = params
    }

    private fun removeBubble() {
        bubbleContainer?.let {
            try {
                windowManager.removeView(it)
            } catch (_: Exception) { }
        }
        bubbleContainer = null
        bubbleView = null
        timerText = null
        layoutParams = null
    }

    // ── 触摸事件处理 ──

    private inner class BubbleTouchListener : View.OnTouchListener {
        private val TAP_THRESHOLD = dpToPx(10)
        private val LONG_PRESS_MS = 1000L

        override fun onTouch(v: View?, event: MotionEvent): Boolean {
            val params = layoutParams ?: return false

            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false

                    // 长按检测（仅录音中有效 → 取消录音）
                    if (state == BubbleState.RECORDING) {
                        longPressRunnable = Runnable {
                            if (!isDragging) cancelRecording()
                        }
                        handler.postDelayed(longPressRunnable!!, LONG_PRESS_MS)
                    }
                    return true
                }

                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY

                    if (!isDragging && (abs(dx) > TAP_THRESHOLD || abs(dy) > TAP_THRESHOLD)) {
                        isDragging = true
                        longPressRunnable?.let { handler.removeCallbacks(it) }
                    }

                    if (isDragging) {
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        windowManager.updateViewLayout(bubbleContainer, params)
                    }
                    return true
                }

                MotionEvent.ACTION_UP -> {
                    longPressRunnable?.let { handler.removeCallbacks(it) }

                    if (isDragging) {
                        // 检查是否拖到底部移除区域
                        val dm = resources.displayMetrics
                        if (params.y > dm.heightPixels - dpToPx(100)) {
                            // 临时隐藏（停止服务）
                            stopSelf()
                            return true
                        }
                        // 边缘吸附
                        snapToEdge()
                    } else {
                        // 点击
                        onBubbleTap()
                    }
                    return true
                }
            }
            return false
        }
    }

    private fun snapToEdge() {
        val params = layoutParams ?: return
        val dm = resources.displayMetrics
        val bubbleWidth = params.width
        val centerX = params.x + bubbleWidth / 2
        val targetX = if (centerX < dm.widthPixels / 2) {
            dpToPx(4) // 吸附左边
        } else {
            dm.widthPixels - bubbleWidth - dpToPx(4) // 吸附右边
        }

        val animator = ValueAnimator.ofInt(params.x, targetX).apply {
            duration = 200
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { anim ->
                params.x = anim.animatedValue as Int
                try {
                    windowManager.updateViewLayout(bubbleContainer, params)
                } catch (_: Exception) { }
            }
        }
        animator.start()
    }

    // ── 气泡点击 → 状态切换 ──

    private fun onBubbleTap() {
        when (state) {
            BubbleState.IDLE -> startRecording()
            BubbleState.RECORDING -> submitRecording()
            BubbleState.PROCESSING -> { /* 处理中忽略点击 */ }
            BubbleState.DONE -> { /* 完成动画中忽略 */ }
        }
    }

    // ── 气泡外观更新 ──

    private fun updateBubbleAppearance() {
        val bubble = bubbleView ?: return
        val bg = bubble.background as? GradientDrawable ?: return

        val (color, size, icon) = when (state) {
            BubbleState.IDLE -> Triple(COLOR_DEER, BUBBLE_SIZE_IDLE_DP, "🎙")
            BubbleState.RECORDING -> Triple(COLOR_RECORDING, BUBBLE_SIZE_RECORDING_DP, "⏹")
            BubbleState.PROCESSING -> Triple(COLOR_PROCESSING, BUBBLE_SIZE_RECORDING_DP, "⏳")
            BubbleState.DONE -> Triple(COLOR_DONE, BUBBLE_SIZE_RECORDING_DP, "✓")
        }

        bg.setColor(color)
        bubble.text = icon

        val sizePx = dpToPx(size)
        val lp = bubble.layoutParams as FrameLayout.LayoutParams
        lp.width = sizePx
        lp.height = sizePx
        bubble.layoutParams = lp

        // 计时器可见性
        timerText?.visibility = if (state == BubbleState.RECORDING) View.VISIBLE else View.GONE
    }

    private fun emitState(stateName: String) {
        val data = JSObject().apply { put("state", stateName) }
        FloatingCapturePlugin.pluginInstance?.emitToJs("bubbleStateChanged", data)
    }

    // ── 录音 ──

    private fun startRecording() {
        val minBufSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        if (minBufSize == AudioRecord.ERROR || minBufSize == AudioRecord.ERROR_BAD_VALUE) {
            return
        }

        try {
            val recorder = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                minBufSize * 2
            )

            if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                recorder.release()
                return
            }

            // 准备输出文件
            val tempFile = File(cacheDir, "capture_${System.currentTimeMillis()}.pcm")
            val outputStream = FileOutputStream(tempFile)

            audioRecord = recorder
            pcmFile = tempFile
            pcmOutputStream = outputStream
            recordingStartTime = System.currentTimeMillis()
            lastNonSilenceTime = recordingStartTime

            state = BubbleState.RECORDING
            updateBubbleAppearance()
            emitState("recording")
            startTimer()

            recorder.startRecording()

            // 录音线程
            recordingThread = Thread {
                val buffer = ShortArray(minBufSize)
                while (state == BubbleState.RECORDING) {
                    val read = recorder.read(buffer, 0, buffer.size)
                    if (read > 0) {
                        // 写入 PCM 文件（Little Endian 16bit）
                        val byteBuffer = ByteArray(read * 2)
                        for (i in 0 until read) {
                            byteBuffer[i * 2] = (buffer[i].toInt() and 0xFF).toByte()
                            byteBuffer[i * 2 + 1] = (buffer[i].toInt() shr 8 and 0xFF).toByte()
                        }
                        outputStream.write(byteBuffer)

                        // 静音检测
                        val maxAmplitude = buffer.take(read).maxOfOrNull { abs(it.toInt()) } ?: 0
                        if (maxAmplitude > SILENCE_THRESHOLD) {
                            lastNonSilenceTime = System.currentTimeMillis()
                        }

                        // 静音自动提交
                        val silenceDuration = System.currentTimeMillis() - lastNonSilenceTime
                        if (silenceDuration >= SILENCE_AUTO_SUBMIT_MS &&
                            System.currentTimeMillis() - recordingStartTime > 2000) {
                            // 至少录了 2s 才触发静音自动提交
                            handler.post { submitRecording() }
                            return@Thread
                        }

                        // 最大时长
                        if (System.currentTimeMillis() - recordingStartTime >= MAX_RECORDING_MS) {
                            handler.post { submitRecording() }
                            return@Thread
                        }
                    }
                }
            }.also { it.start() }

        } catch (e: SecurityException) {
            // 麦克风权限未授权
            emitState("idle")
        } catch (e: Exception) {
            emitState("idle")
        }
    }

    private fun submitRecording() {
        if (state != BubbleState.RECORDING) return

        state = BubbleState.PROCESSING
        updateBubbleAppearance()
        emitState("processing")
        stopTimer()

        val durationMs = System.currentTimeMillis() - recordingStartTime
        stopAudioRecord()

        val filePath = pcmFile?.absolutePath
        if (filePath != null && durationMs > 500) {
            // 发送事件给 JS 层
            val data = JSObject().apply {
                put("pcmFilePath", filePath)
                put("durationMs", durationMs)
            }
            FloatingCapturePlugin.pluginInstance?.emitToJs("recordingComplete", data)
        } else {
            // 录音太短，丢弃
            pcmFile?.delete()
        }

        // 完成动画
        state = BubbleState.DONE
        updateBubbleAppearance()
        emitState("done")

        handler.postDelayed({
            state = BubbleState.IDLE
            updateBubbleAppearance()
            emitState("idle")
        }, 1000)
    }

    private fun cancelRecording() {
        if (state != BubbleState.RECORDING) return

        state = BubbleState.IDLE
        stopTimer()
        stopAudioRecord()
        pcmFile?.delete()
        pcmFile = null

        updateBubbleAppearance()
        emitState("idle")

        // 显示"已取消"提示（通过 timerText 短暂显示）
        timerText?.apply {
            text = "Cancelled"
            visibility = View.VISIBLE
        }
        handler.postDelayed({
            timerText?.visibility = View.GONE
        }, 1500)
    }

    private fun cancelRecordingInternal() {
        // onDestroy 时静默清理，不更新 UI
        stopTimer()
        stopAudioRecord()
        pcmFile?.delete()
    }

    private fun stopAudioRecord() {
        try {
            audioRecord?.stop()
        } catch (_: Exception) { }
        try {
            audioRecord?.release()
        } catch (_: Exception) { }
        audioRecord = null
        recordingThread = null
        try {
            pcmOutputStream?.close()
        } catch (_: Exception) { }
        pcmOutputStream = null
    }

    // ── 计时器 ──

    private fun startTimer() {
        timerRunnable = object : Runnable {
            override fun run() {
                if (state != BubbleState.RECORDING) return
                val elapsed = System.currentTimeMillis() - recordingStartTime
                val secs = (elapsed / 1000).toInt()
                val mm = secs / 60
                val ss = secs % 60
                timerText?.text = String.format("%02d:%02d", mm, ss)
                handler.postDelayed(this, 500)
            }
        }
        handler.post(timerRunnable!!)
    }

    private fun stopTimer() {
        timerRunnable?.let { handler.removeCallbacks(it) }
        timerRunnable = null
    }
}

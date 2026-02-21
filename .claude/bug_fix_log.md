名字：BUG修复经验
描述：将项目中修复的BUG的经验记录下来，避免同一个项目在修改或者新增代码后重复出现相同的问题。
记录格式如下
---

# Android 状态栏侵入问题

- BUG原因：
  1. CSS `env(safe-area-inset-top)` 在 Android WebView 上始终返回 0，无法获取状态栏高度
  2. Capacitor `StatusBar.setOverlaysWebView(false)` 在 Android 上行为不可靠
  3. 部分全屏页面/覆盖层顶部缺少安全区域 padding

- 解决方案：
  1. 在 `app/globals.css` 中用 `max()` 兜底：
     ```css
     .pt-safe {
       padding-top: 24px;
       padding-top: max(env(safe-area-inset-top, 0px), 24px);
     }
     ```
     iOS 使用真实 `env()` 值，Android 保证最少 24px
  2. `shared/lib/status-bar.ts` 中 Android 不使用 overlay 模式，设置固定背景色 `#f8f5f0`
  3. **所有全屏页面顶部必须加 `pt-safe` 类**，涉及文件：
     - `shared/components/new-header.tsx` — 主页 header
     - `features/notes/components/note-detail.tsx` — sticky header + loading state
     - `features/search/components/search-view.tsx` — sticky header
     - `features/notes/components/text-editor.tsx` — header
     - `features/chat/components/chat-view.tsx` — container
     - `features/sidebar/components/stats-dashboard.tsx` — container
     - `features/memory/components/memory-soul-overlay.tsx` — container
     - `features/reviews/components/review-overlay.tsx` — container
     - `features/sidebar/components/profile-overlay.tsx` — sticky header
     - `features/sidebar/components/sidebar-drawer.tsx` — drawer panel
  4. **新增全屏页面时，顶部容器必须加 `pt-safe`，否则必定侵入状态栏**

---

# Android 录音权限 getUserMedia denied

- BUG原因：
  Android WebView 需要**两层权限**才能使用麦克风：
  1. Android 系统层 `RECORD_AUDIO`（通过 `ActivityCompat.requestPermissions`）
  2. WebView 层 `RESOURCE_AUDIO_CAPTURE`（通过 `WebChromeClient.onPermissionRequest` grant）
  仅授予系统权限不够，WebView 默认 deny 所有资源请求

- 解决方案：
  在 `MainActivity.java` 中：
  1. `onCreate` 主动请求 `RECORD_AUDIO` 运行时权限
  2. 重写 `WebChromeClient.onPermissionRequest`，系统权限已授予时 grant `RESOURCE_AUDIO_CAPTURE`

---

# Android 混合内容阻塞 (HTTPS→HTTP/WS)

- BUG原因：
  Capacitor 默认 `androidScheme: 'https'`，页面以 HTTPS 加载，向 HTTP/WS 后端发请求被混合内容策略阻塞

- 解决方案：
  1. `AndroidManifest.xml` 添加 `android:usesCleartextTraffic="true"`
  2. `MainActivity.java` 设置 `setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW)`

---

# ASR 实时识别返回重复文本

- BUG原因：
  DashScope paraformer-realtime-v2 对同一 `sentence_id` 发送多次 `result-generated` 事件（逐步优化识别文本），Gateway 将每次事件都作为新句子推送给前端

- 解决方案：
  `gateway/src/handlers/asr.ts` 按 `sentence_id` 去重：已存在的句子更新文本，不重复推送 `asr.sentence` 事件

---

# 卡片显示"处理中"但已有识别文本

- BUG原因：
  语音记录创建后，ASR 产生 transcript 但 AI 摘要（summary）可能尚未生成或不生成。`use-notes.ts` 仅从 summary 取标题/摘要，无 summary 时显示"处理中..."

- 解决方案：
  `features/notes/hooks/use-notes.ts` 添加 transcript 文本兜底：
  ```typescript
  const transcript = r.transcript?.text ?? "";
  const title = summary?.title || transcript.slice(0, 50) || "处理中...";
  const short_summary = summary?.short_summary || transcript.slice(0, 200) || "";
  ```
  同时改进卡片 `isProcessing` 判断：只有状态未完成**且**无任何内容时才显示骨架屏

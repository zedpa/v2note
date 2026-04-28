---
id: "131"
title: "全局快速捕获 — 闪念胶囊式 App 外录入"
status: active
domain: voice
risk: high
dependencies: ["app-mobile-views-todo.md", "voice-input-unify.md", "android-app-shortcuts.md"]
superseded_by: null
created: 2026-04-24
updated: 2026-04-29
---

# 全局快速捕获 — 闪念胶囊式 App 外录入

## 概述

让用户无需打开 V2Note 即可在任意界面快速录入想法。借鉴锤子闪念胶囊"硬件触发 → 说完即走"的极致速度，通过胶水工程拼装开源组件实现三层递进能力：

1. **Phase A — 通知栏快捷入口**（Android 常驻通知 → 一键跳转极简录音页）
2. **Phase B — 悬浮气泡**（Android 全局悬浮麦克风按钮 → 点击即录 → AI 自动归类）
3. **Phase C — iOS Shortcuts 集成**（Action Button / 锁屏 Widget → 深度链接录音）

核心约束：**捕获时零分类、零确认**，所有语义理解交给 AI 后置处理（复用现有 voice-action 管线）。新增代码只做一件事：在 App 外提供触发点，把音频/文字送进现有 capture-store 离线队列。

---

## ⚠️ 技术架构总览

```
                         ┌─────────────────────────────────┐
                         │        现有管线（不改动）         │
                         │                                   │
  [触发入口]              │  capture-store (IndexedDB)        │
  ├─ 通知栏 Action ──────┤→ capture-push → Gateway ASR       │
  ├─ 悬浮气泡 ───────────┤→ voice-action (AI 意图分类)       │
  ├─ iOS Shortcut ───────┤→ 创建 Strike / Todo / Diary       │
  └─ App Shortcuts(#124)─┤                                   │
                         └─────────────────────────────────┘
```

### 开源组件选型

| 层 | 组件 | 用途 |
|----|------|------|
| 悬浮 UI | [dofire/Floating-Bubble-View](https://github.com/dofire/Floating-Bubble-View) v0.6+ | Android 可拖拽悬浮按钮 |
| 前台服务 | [@capawesome/capacitor-android-foreground-service](https://github.com/capawesome-team/capacitor-android-foreground-service) | Service 生命周期 + SYSTEM_ALERT_WINDOW 权限 |
| 常驻通知 | [capacitor-persistent-notification](https://github.com/flytesoft-software/capacitor-persistent-notification) 或自建 | 通知栏 Action Button |
| 录音 | 现有 AudioSessionPlugin + usePCMRecorder | 音频焦点 + PCM 采集 |
| iOS | [capacitor-plugin-siri-shortcuts](https://github.com/lovetodream/capacitor-plugin-siri-shortcuts) + @capacitor/app | Siri / Action Button 触发 |

---

## Phase A: 通知栏快捷入口

> 最低成本方案，无特殊权限，兼容所有 Android 版本。

### 1. 常驻通知

#### 场景 A1.1: App 启动后显示常驻通知
```
假设 (Given)  用户已登录且 App 进入后台
当   (When)   App 转入后台运行
那么 (Then)   通知栏出现一条常驻通知，标题为"念念有路"
并且 (And)    通知包含两个 Action 按钮：「🎙 录一条」和「✏️ 写一条」
并且 (And)    通知优先级为 LOW（不发声、不震动、不弹头）
并且 (And)    通知图标使用 App 小图标 ic_stat_notification
```

#### 场景 A1.2: 点击「录一条」跳转极简录音
```
假设 (Given)  常驻通知可见
当   (When)   用户点击通知上的「🎙 录一条」按钮
那么 (Then)   App 回到前台，直接进入极简录音模式
并且 (And)    极简录音模式：全屏深色背景 + 居中波形 + 录音自动开始
并且 (And)    录音完成后（点击完成按钮或静音超时）自动提交到 capture-store
并且 (And)    提交后显示 ✓ 动画 1s，然后自动退回后台（返回上一个 App）
```

#### 场景 A1.3: 点击「写一条」跳转极简文字输入
```
假设 (Given)  常驻通知可见
当   (When)   用户点击通知上的「✏️ 写一条」按钮
那么 (Then)   App 回到前台，打开极简文字输入页
并且 (And)    输入框自动聚焦，键盘弹出
并且 (And)    输入框上方有一个发送按钮
并且 (And)    点击发送 → 内容写入 capture-store → ✓ 动画 → 自动退回后台
```

#### 场景 A1.4: 通知栏可配置关闭
```
假设 (Given)  用户不希望常驻通知
当   (When)   用户在 App 设置页关闭「通知栏快捷入口」开关
那么 (Then)   常驻通知消失
并且 (And)    下次 App 启动不再创建常驻通知
```

#### 场景 A1.5: 点击通知主体进入 App
```
假设 (Given)  常驻通知可见
当   (When)   用户点击通知主体（非 Action 按钮区域）
那么 (Then)   App 正常回到前台，显示上次离开时的页面
```

### 2. 极简录音模式

#### 场景 A2.1: 自动录音 + 手动提交
```
假设 (Given)  用户通过通知栏「录一条」进入极简录音模式
当   (When)   极简录音页加载完成
那么 (Then)   自动请求麦克风权限（如尚未授权）
并且 (And)    自动开始 PCM 录音（复用 usePCMRecorder）
并且 (And)    屏幕显示实时波形 + 录音时长
并且 (And)    底部显示「完成」按钮
```

#### 场景 A2.2: 手动结束录音
```
假设 (Given)  极简录音模式正在录音
当   (When)   用户点击「完成」按钮
那么 (Then)   停止录音
并且 (And)    音频写入 capture-store（kind: "diary", sourceContext: "notification_capture"）
并且 (And)    显示 ✓ 完成动画（1 秒）
并且 (And)    动画结束后调用系统返回，回到用户之前的 App
```


#### 场景 A2.3b: 录音时长上限
```
假设 (Given)  极简录音模式正在录音
当   (When)   录音时长达到 5 分钟
那么 (Then)   自动停止录音并提交（同 A2.2 流程）
并且 (And)    提交前短暂显示提示："已达最大时长，自动保存"
```

#### 场景 A2.4: 返回取消录音
```
假设 (Given)  极简录音模式正在录音
当   (When)   用户按系统返回键或左滑返回
那么 (Then)   弹出确认对话框：「放弃这条录音？」
并且 (And)    确认 → 丢弃录音，返回上一个 App
并且 (And)    取消 → 继续录音
```

---

## Phase B: Android 悬浮气泡

> 核心体验方案，需要 SYSTEM_ALERT_WINDOW 权限。

### 3. 悬浮气泡显示与权限

#### 场景 B3.1: 首次启用悬浮气泡
```
假设 (Given)  用户在 App 设置页开启「悬浮录入气泡」开关
当   (When)   开关打开时
那么 (Then)   检查 SYSTEM_ALERT_WINDOW 权限
并且 (And)    如果未授权 → 引导用户跳转系统设置页授权「显示在其他应用上方」
并且 (And)    授权成功后，屏幕右侧中部出现一个 48dp 的悬浮麦克风气泡
并且 (And)    气泡使用 V2Note 主色调（deer 色），半透明 80%
```

#### 场景 B3.2: 气泡常驻行为
```
假设 (Given)  悬浮气泡已启用
当   (When)   用户在任意 App 界面
那么 (Then)   气泡始终可见（浮于所有应用之上）
并且 (And)    气泡自动吸附到屏幕左/右边缘
并且 (And)    气泡可拖拽到任意位置，松手后自动吸附最近边缘
并且 (And)    拖到屏幕底部「×」区域可临时隐藏（下次解锁屏幕恢复）
```

#### 场景 B3.3: 气泡随 App 生命周期
```
假设 (Given)  悬浮气泡已启用
当   (When)   V2Note App 被系统杀死或用户强制停止
那么 (Then)   悬浮气泡消失
并且 (And)    下次 App 启动时自动恢复气泡（如果设置仍开启）
```

### 4. 悬浮气泡录音交互

#### 场景 B4.1: 点击气泡开始录音
```
假设 (Given)  悬浮气泡可见，当前未在录音
当   (When)   用户点击气泡
那么 (Then)   气泡变大（48dp → 64dp），颜色变为录音红色
并且 (And)    气泡周围显示脉动波纹动画
并且 (And)    开始 PCM 录音（通过 Foreground Service 中的原生 AudioRecord）
并且 (And)    气泡上方悬浮显示录音时长（00:00 计时）
```

#### 场景 B4.2: 再次点击结束录音并提交
```
假设 (Given)  悬浮气泡正在录音
当   (When)   用户再次点击气泡
那么 (Then)   停止录音
并且 (And)    气泡显示旋转加载动画（处理中）
并且 (And)    音频通过 Bridge 传给 JS 层，写入 capture-store
并且 (And)    capture-push 自动将音频推送到 Gateway ASR
并且 (And)    处理完成后气泡显示 ✓ 动画 1s，恢复待机状态
```

#### 场景 B4.3: 静音自动提交
```
假设 (Given)  悬浮气泡正在录音
当   (When)   连续 5 秒检测到静音
那么 (Then)   自动停止录音并提交（同 B4.2 流程）
```

#### 场景 B4.4: 长按气泡取消录音
```
假设 (Given)  悬浮气泡正在录音
当   (When)   用户长按气泡 1 秒
那么 (Then)   显示「已取消」提示
并且 (And)    丢弃当前录音，气泡恢复待机状态
```

#### 场景 B4.5: 录音时长上限（悬浮气泡）
```
假设 (Given)  悬浮气泡正在录音
当   (When)   录音时长达到 5 分钟
那么 (Then)   自动停止录音并提交（同 B4.2 流程）
```

#### 场景 B4.6: 悬浮气泡与 App 内 FAB 录音互斥
```
假设 (Given)  用户正在 App 内通过 FAB 录音
当   (When)   用户点击悬浮气泡尝试开始录音
那么 (Then)   气泡显示短暂提示"正在录音中"，不启动第二个录音
并且 (And)    反之亦然：气泡录音中点击 FAB 也被忽略
```

> **[Phase B.2 扩展] 录音完成反馈** — 当前不实现。未来可在 AI 分类完成后，气泡上方短暂弹出分类结果（"📝 已记录" / "✅ 待办: xxx"），2s 自动消失，点击跳转 App 内对应条目。

### 5. 悬浮气泡技术实现

#### 场景 B5.1: Capacitor 插件结构
```
假设 (Given)  开发者创建自定义 Capacitor 插件 FloatingCapturePlugin
当   (When)   插件初始化
那么 (Then)   插件包含以下原生能力：
             - startBubble(): 启动 Foreground Service + 悬浮气泡
             - stopBubble(): 停止服务和气泡
             - onRecordingComplete(callback): 录音完成回调，返回 PCM 数据
             - checkOverlayPermission(): 检查悬浮窗权限
             - requestOverlayPermission(): 请求悬浮窗权限
并且 (And)    悬浮气泡 UI 使用 Floating-Bubble-View 库渲染
并且 (And)    录音使用原生 AudioRecord（16kHz, 16bit, mono，与现有 PCM 格式一致）
并且 (And)    录音数据通过 Capacitor Bridge 事件推送给 JS 层
```

#### 场景 B5.2: Foreground Service 保活
```
假设 (Given)  悬浮气泡依赖 Foreground Service 运行
当   (When)   Service 启动
那么 (Then)   创建常驻通知（可与 Phase A 通知合并为同一条）
并且 (And)    通知渠道为 LOW 优先级
并且 (And)    Service 类型为 FOREGROUND_SERVICE_TYPE_MICROPHONE（Android 14+ 必需）
```

---

## Phase C: iOS Shortcuts 集成

> iOS 无悬浮窗能力，通过 Shortcuts + 深度链接实现。

### 6. URL Scheme 捕获入口

#### 场景 C6.1: Shortcut 触发录音
```
假设 (Given)  用户已配置 iOS Shortcut 或 Action Button 映射到 v2note://capture/voice
当   (When)   用户触发 Shortcut（按 Action Button / 点锁屏 Widget / 说 "Hey Siri 念念录一条"）
那么 (Then)   V2Note App 启动或回到前台
并且 (And)    直接进入极简录音模式（同 Phase A 场景 A2.1）
并且 (And)    录完后自动退回后台
```

#### 场景 C6.2: Shortcut 触发文字输入
```
假设 (Given)  用户触发 v2note://capture/text
当   (When)   App 前台加载完成
那么 (Then)   进入极简文字输入页（同 Phase A 场景 A1.3）
```

#### 场景 C6.3: Shortcut 触发带预填文字
```
假设 (Given)  用户通过 Shortcut 传递剪贴板内容：v2note://capture/text?content={clipboard}
当   (When)   App 前台加载完成
那么 (Then)   极简文字输入页打开，输入框已填入剪贴板内容
并且 (And)    用户可编辑或直接点击发送
```

#### 场景 C6.4: Siri Shortcut 注册
```
假设 (Given)  用户首次使用 App
当   (When)   用户完成一次录音后
那么 (Then)   App 通过 capacitor-plugin-siri-shortcuts 向系统注册 Shortcut：
             - "念念录一条" → v2note://capture/voice
             - "念念写一条" → v2note://capture/text
并且 (And)    用户可在 iOS Shortcuts App 中找到并配置这些 Shortcut
```

### 7. iOS Widget（未来扩展，当前不实现）

> 需要 iOS Widget Extension（Swift 原生），当前仅预留 URL Scheme `v2note://capture/voice`。
> 未来实现时，Widget 上的麦克风图标点击后通过 URL Scheme 跳转到 App 极简录音页。

---

## 8. 极简捕获页（共享 UI）

> Phase A / B / C 共用的极简录音/文字输入页面，独立于主页面。

#### 场景 8.1: 极简捕获页路由
```
假设 (Given)  App 收到 v2note://capture/voice 或 v2note://capture/text
当   (When)   路由解析完成
那么 (Then)   显示极简捕获页（全屏，深色背景，无导航栏）
并且 (And)    不加载主页面的日记/待办/侧边栏等重组件
并且 (And)    页面冷启动时间 < 1.5s（仅加载录音/输入核心模块）
```

#### 场景 8.2: 未登录时的捕获
```
假设 (Given)  用户未登录
当   (When)   通过任意入口进入极简捕获页
那么 (Then)   正常录音/输入，数据写入 capture-store（userId=null, guestBatchId 自动生成）
并且 (And)    不阻塞用户操作，不弹登录提示
并且 (And)    用户后续登录时，guest 数据自动归属（复用现有 guest-claim 流程）
```

#### 场景 8.3: 无网络时的捕获
```
假设 (Given)  设备处于离线状态
当   (When)   用户完成录音/文字输入
那么 (Then)   数据正常写入 capture-store（syncStatus: "captured"）
并且 (And)    显示 ✓ 动画 + "已保存，联网后自动同步" 提示
并且 (And)    恢复网络后 capture-push 自动同步
```

---

## 验收行为（E2E 锚点）

> 悬浮气泡（Phase B）涉及 Android 原生 overlay，无法 E2E 自动化测试。
> E2E 聚焦于极简捕获页 + URL Scheme 路由。

### 行为 1: 通知栏录音 → 极简录音 → 自动提交
1. 用户通过 URL `v2note://capture/voice?source=notification_capture` 进入 App
2. 极简录音页显示，录音自动开始
3. 模拟录音完成（点击完成按钮）
4. 页面显示 ✓ 完成动画
5. capture-store 中出现一条 sourceContext 为 `notification_capture` 的记录

### 行为 2: 通知栏文字 → 极简输入 → 提交
1. 用户通过 URL `v2note://capture/text` 进入 App
2. 极简文字输入页显示，输入框已聚焦
3. 用户输入 "明天下午开会"
4. 点击发送
5. 页面显示 ✓ 完成动画
6. capture-store 中出现一条 text 为 "明天下午开会" 的记录

### 行为 3: 带预填内容的文字捕获
1. 用户通过 URL `v2note://capture/text?content=买牛奶` 进入 App
2. 极简文字输入页显示，输入框内已有 "买牛奶"
3. 用户直接点击发送
4. capture-store 中出现对应记录

### 行为 4: 未登录时捕获不阻塞
1. 用户未登录状态下通过 `v2note://capture/voice` 进入
2. 录音正常进行并提交
3. capture-store 中记录 userId 为 null，guestBatchId 非空

### 行为 5: 未知 capture 路径静默降级
1. 用户通过 `v2note://capture/unknown` 进入
2. App 显示主页，无报错

---

## 边界条件

- [ ] 麦克风权限被拒绝 → 显示引导文案，提供跳转系统设置按钮
- [ ] 录音时来电话 → 录音暂停，通话结束后恢复（AudioSessionPlugin 已处理）
- [ ] 录音时内存不足 → 保存已有 PCM，标记为部分录音
- [ ] 悬浮气泡权限被收回 → 气泡消失，下次 App 启动时检测并提示重新授权
- [ ] 极简页冷启动时 WebView 未初始化 → 等待 Capacitor ready 后再开始录音
- [ ] 并发捕获（悬浮气泡录音同时通知栏触发 / FAB 录音同时气泡触发）→ 忽略第二次触发
- [ ] 录音时长超过 5 分钟 → 自动停止并提交，显示提示
- [ ] Android FLAG_SECURE App（银行/密码管理器）→ 气泡被系统隐藏，接受此行为
- [ ] capture-store 写入失败（IndexedDB 满）→ 降级为内存暂存 + 告警
- [ ] Android 14+ FOREGROUND_SERVICE_TYPE_MICROPHONE 声明缺失 → 编译时报错
- [ ] iOS 后台限制（App 被系统挂起时 Shortcut 触发延迟）→ 接受 1-2s 冷启动延迟

---

## 接口约定

### Capacitor Plugin: FloatingCapturePlugin (Phase B)

```typescript
interface FloatingCapturePlugin {
  // 悬浮气泡控制
  startBubble(): Promise<void>;
  stopBubble(): Promise<void>;
  isBubbleActive(): Promise<{ active: boolean }>;

  // 权限
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;

  // 事件监听
  addListener(
    event: "recordingComplete",
    callback: (data: {
      pcmFilePath: string;   // 原生侧写入临时 PCM 文件，JS 通过 Filesystem 读取
      durationMs: number;
    }) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    event: "bubbleTapped",
    callback: () => void,
  ): Promise<PluginListenerHandle>;
}

// 注：PCM 数据通过临时文件传递（而非 base64），避免 Bridge JSON 序列化的内存峰值。
// 原生侧录完后写入 cacheDir/capture_xxx.pcm，JS 侧读取后删除临时文件。
```

### CaptureSource 扩展

```typescript
// shared/lib/capture-store.ts 新增 source 类型
export type CaptureSource =
  | "fab"               // 现有：App 内 FAB
  | "fab_command"       // 现有：FAB 指令模式
  | "chat_view"         // 现有：聊天视图
  | "chat_voice"        // 现有：聊天语音
  | "notification_capture"  // 新增：通知栏快捷录入
  | "floating_bubble"       // 新增：悬浮气泡
  | "ios_shortcut";         // 新增：iOS Shortcut
```

### CaptureSource → Gateway SourceContext 映射

快速捕获的数据推送到 gateway 时，`process()` 的 `sourceContext` 参数映射规则：

| CaptureSource | Gateway SourceContext | 说明 |
|---|---|---|
| `notification_capture` | `"timeline"` | 走 Layer 3 AI 分类（日记/待办/素材） |
| `floating_bubble` | `"timeline"` | 同上 |
| `ios_shortcut` | `"timeline"` | 同上 |

所有快速捕获来源统一走 `"timeline"` 路径，由 AI 在 Layer 3 自动决定是 diary、todo 还是 material。

### URL Scheme

```
v2note://capture/voice               → 极简录音模式（独立全屏页）
v2note://capture/voice?source=xxx    → 同上，source 参数写入 CaptureSource
v2note://capture/text                → 极简文字输入
v2note://capture/text?content=X      → 预填文字的极简输入
v2note://action/record               → spec #124 App Shortcuts（走主页 FAB 模式）
```

> **与 Spec #124 的关系**：`v2note://action/record` 和 `v2note://capture/voice` 是两个独立入口，行为不同：
> - `action/record` → 打开主页 → 触发 FAB 录音（#124 定义，需要完整主页加载）
> - `capture/voice` → 极简录音页（本 spec 定义，不加载主页，冷启动更快）
>
> 两者共存，不做合并。Android 通知栏和悬浮气泡使用 `capture/*`，App Shortcuts 使用 `action/*`。
> AndroidManifest 需要同时注册两个 intent-filter host：`action` 和 `capture`。

### sourceContext 由 URL 参数决定

极简捕获页根据来源入口自动设置 `sourceContext`：
- Android 通知栏 Action → `v2note://capture/voice?source=notification_capture`
- 悬浮气泡 → 不走 URL，原生侧直接标记 `floating_bubble`
- iOS Shortcut → `v2note://capture/voice?source=ios_shortcut`
- 无 source 参数时默认 `notification_capture`

---

## 依赖

- `shared/lib/capture-store.ts` — 离线捕获存储
- `shared/lib/capture-push.ts` — 捕获同步
- `features/recording/lib/fab-capture.ts` — 捕获写入封装（极简页可复用或创建类似 `saveQuickCapture`）
- `features/recording/hooks/use-pcm-recorder.ts` — PCM 录音
- `features/recording/hooks/use-voice-to-text.ts` — 语音转文字
- `components/layout/sync-bootstrap.tsx` — capture-push 触发点（极简页需独立挂载）
- `gateway/src/handlers/voice-action.ts` — AI 意图分类
- `gateway/src/handlers/process.ts` — Layer 1-3 处理管线（SourceContext 映射）
- `android/app/.../AudioSessionPlugin.kt` — 音频焦点管理
- `@capacitor/app` — appUrlOpen 事件（URL Scheme 接收）
- Spec #124 `android-app-shortcuts.md` — 共享 URL Scheme 路由层（独立入口，不合并行为）

---

## Implementation Phases

- [ ] **Phase A: 通知栏快捷入口**
  - [ ] A1: Android 常驻通知 + Action 按钮（录一条/写一条）— 需原生 Capacitor 插件
  - [x] A2: 极简捕获页 UI（录音 + 文字两种模式）
  - [x] A3: URL Scheme 路由（v2note://capture/*）
  - [x] A4: capture-store 新增 sourceContext 类型
  - [ ] A5: 设置页开关

- [ ] **Phase B: Android 悬浮气泡**
  - [ ] B1: 自定义 Capacitor 插件 FloatingCapturePlugin 骨架
  - [ ] B2: 集成 Floating-Bubble-View + Foreground Service
  - [ ] B3: 原生 AudioRecord 录音 + Bridge 传输
  - [ ] B4: 气泡交互动画（录音中/处理中/完成）
  - [ ] B5: 权限引导流程
  - [ ] B6: 设置页开关

- [ ] **Phase C: iOS Shortcuts 集成**
  - [ ] C1: capacitor-plugin-siri-shortcuts 集成
  - [ ] C2: Siri Shortcut 自动注册（"念念录一条"/"念念写一条"）
  - [ ] C3: iOS 设置页说明（引导用户配置 Action Button / Widget）

---

## 备注

- Phase A 和 Phase C 共享极简捕获页 UI，Phase B 的悬浮气泡录音在原生层完成，不走 WebView
- Phase B 的 Foreground Service 通知可与 Phase A 的常驻通知合并为同一条，避免双通知
- 与 Spec #124 (App Shortcuts) 共享 URL Scheme 路由层，`v2note://action/*` 和 `v2note://capture/*` 由同一个前端路由处理器分发
- 悬浮气泡方案参考 [vaclavhodek/quicknote_8](https://github.com/vaclavhodek/quicknote_8)（Floating Apps 作者教程）
- 录音 PCM 格式必须与现有管线一致：16kHz, 16bit, mono，确保 Gateway ASR 无需适配
- Android 14+ 要求 Foreground Service 声明 `foregroundServiceType="microphone"`
- 气泡的「录完即消失」设计对齐 V2Note「AI 沉默为主」原则 — 不打扰用户，不弹确认框

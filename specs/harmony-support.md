---
id: "087"
title: "鸿蒙 HarmonyOS NEXT 适配"
status: active
domain: infra
risk: high
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-11
---
# 鸿蒙 HarmonyOS NEXT 适配

> 状态：🔵 前端适配层已完成，鸿蒙壳待真机验证 | 优先级：Phase 6+（平台扩展）
> 依赖：华为开发者账号、DevEco Studio、HarmonyOS SDK
> 完成进度：Step 1-3 前端适配层 ✅ / Step 4 录音桥接 ✅（前端） / Step 5 存储+状态栏 ✅ / Step 6 构建脚本 ✅ / 鸿蒙壳 ArkTS 代码 ✅（待编译验证）

## 概述
将念念有路适配到鸿蒙 NEXT（纯鸿蒙，无 Android 兼容层）。采用 **WebView 壳 + 原生桥接** 策略——复用现有 Next.js 静态导出，用 ArkUI WebView 加载，通过 JSBridge 桥接原生能力（录音、设备ID、存储、状态栏），替代 Capacitor 插件层。

**当前平台覆盖：**
- ✅ Web（Next.js 静态导出）
- ✅ Android / iOS（Capacitor 8 包装）
- ✅ Windows / macOS / Linux（Electron）
- 🟡 HarmonyOS NEXT（本 spec）

**架构决策：**
- Capacitor 不支持鸿蒙，无法复用现有 Capacitor 插件
- 采用 WebView + JSBridge 方案（类似 Capacitor 的底层原理）
- 前端增加平台检测层，Capacitor / HarmonyBridge / Web 三级 fallback
- 鸿蒙壳用 ArkTS + ArkUI 编写，代码量小（壳 + 桥接 < 2000 行）

## 场景

### 场景 1: 平台检测——前端识别鸿蒙环境

```
假设 (Given)  应用运行在鸿蒙 WebView 中
并且 (And)    鸿蒙壳在 WebView 加载完成后注入 window.__harmony_bridge__
当   (When)   前端调用 getPlatform()
那么 (Then)   返回 'harmony'
并且 (And)    所有原生调用走 HarmonyBridge 而非 Capacitor

假设 (Given)  应用运行在 Capacitor 原生容器中
当   (When)   前端调用 getPlatform()
那么 (Then)   返回 'capacitor'（行为不变）

假设 (Given)  应用运行在浏览器中
当   (When)   前端调用 getPlatform()
那么 (Then)   返回 'web'（行为不变）
```

### 场景 2: 设备 ID 桥接——鸿蒙原生获取设备标识

```
假设 (Given)  应用运行在鸿蒙环境
当   (When)   调用 getDeviceIdentifier()
那么 (Then)   通过 JSBridge 调用 harmony.device.getId()
并且 (And)    返回 { identifier: string, platform: 'harmony' }
并且 (And)    鸿蒙端使用 deviceInfo.udid 或 AAID（匿名应用标识）

假设 (Given)  鸿蒙桥接不可用（WebView 环境异常）
当   (When)   调用 getDeviceIdentifier()
那么 (Then)   降级到 Web fallback（localStorage + crypto.randomUUID）
```

### 场景 3: 录音桥接——鸿蒙原生录音替代 capacitor-voice-recorder

> ⚠️ **关键适配点**：现有 `use-audio-recorder.ts` 使用**静态 import** `capacitor-voice-recorder`，
> 在鸿蒙 WebView 中该模块不存在会直接报错。必须重构为动态 import + 平台分支。

```
假设 (Given)  用户在鸿蒙设备上点击录音按钮
当   (When)   调用 startRecording()
那么 (Then)   通过 JSBridge 调用 harmony.audio.start()
并且 (And)    鸿蒙端使用 OHAudio / AudioCapturer API 开始录音
并且 (And)    录音格式：AAC 或 WAV（与现有上传管道兼容）

假设 (Given)  用户录音中点击停止
当   (When)   调用 stopRecording()
那么 (Then)   JSBridge 返回 { base64: string, mimeType: string, duration: number }
并且 (And)    返回格式与现有 RecordingResult 接口一致
并且 (And)    前端上传流程无需修改

假设 (Given)  用户未授予麦克风权限
当   (When)   调用 startRecording()
那么 (Then)   JSBridge 先请求 ohos.permission.MICROPHONE
并且 (And)    用户拒绝时抛出 Error("Microphone permission denied")
并且 (And)    错误处理逻辑与 Capacitor 版一致

假设 (Given)  应用运行在非 Capacitor 非 Harmony 环境（纯浏览器）
当   (When)   调用 startRecording()
那么 (Then)   录音模块不加载 capacitor-voice-recorder（避免 import 报错）
并且 (And)    提示用户当前环境不支持录音
```

**重构方案**：将 `use-audio-recorder.ts` 中的 `VoiceRecorder` 从静态 import 改为动态 import，
并按 `getPlatform()` 结果选择录音后端：harmony → JSBridge / capacitor → VoiceRecorder / web → 不支持

### 场景 4: 存储桥接——鸿蒙 Preferences 替代 @capacitor/preferences

```
假设 (Given)  应用运行在鸿蒙环境
当   (When)   调用 storage.getItem(key) / setItem(key, value) / removeItem(key)
那么 (Then)   通过 JSBridge 调用 harmony.preferences.get/set/remove
并且 (And)    鸿蒙端使用 @ohos.data.preferences API
并且 (And)    数据持久化在应用沙箱中

假设 (Given)  鸿蒙桥接不可用
当   (When)   调用 storage 方法
那么 (Then)   降级到 localStorage（与 Web 行为一致）
```

> ⚠️ **适配注意**：现有 `storage.ts` 的 `useNative()` 使用 `_useNative` 缓存检测结果，
> 重构时需改为基于 `getPlatform()` 的三级判断（harmony / capacitor / web），
> 而非简单的 native true/false 二值。

### 场景 5: 状态栏桥接——鸿蒙原生状态栏控制

```
假设 (Given)  应用启动时运行在鸿蒙环境
当   (When)   调用 initStatusBar()
那么 (Then)   通过 JSBridge 调用 harmony.statusBar.init()
并且 (And)    鸿蒙端使用 window.setWindowLayoutFullScreen(false)
并且 (And)    设置状态栏背景色 #f8f5f0（与 Android 一致）
并且 (And)    状态栏文字颜色为深色（Style.Default）
```

### 场景 6: WebView 壳加载——鸿蒙 ArkUI 加载静态资源

```
假设 (Given)  鸿蒙应用启动
当   (When)   EntryAbility.onCreate() 执行
那么 (Then)   创建 Web 组件加载本地 rawfile 中的 out/index.html
并且 (And)    注入 JSBridge 对象到 WebView（window.__harmony_bridge__）
并且 (And)    WebView 配置：
      → javaScriptAccess: true
      → domStorageAccess: true（localStorage 支持）
      → mediaPlayGestureAccess: true（录音需要）
      → mixedMode: MixedMode.All（允许 HTTPS 页面请求 HTTP gateway）

假设 (Given)  WebView 加载完成
当   (When)   用户操作 Web 页面
那么 (Then)   页面内导航由 Next.js 路由处理（SPA）
并且 (And)    外部链接通过 JSBridge 调用系统浏览器打开
```

### 场景 7: Gateway 连接——WebSocket 通信

```
假设 (Given)  鸿蒙设备与 Gateway 服务器在同一网络
当   (When)   前端建立 WebSocket 连接
那么 (Then)   鸿蒙 WebView 原生支持 WebSocket（无需桥接）
并且 (And)    连接地址通过环境变量或启动配置注入

假设 (Given)  鸿蒙设备网络环境变化（WiFi → 蜂窝）
当   (When)   WebSocket 连接断开
那么 (Then)   前端现有重连逻辑自动处理（无需鸿蒙特殊适配）
```

### 场景 8: 应用更新——鸿蒙应用内更新

```
假设 (Given)  Capacitor OTA (@capgo/capacitor-updater) 在鸿蒙不可用
当   (When)   需要更新应用
那么 (Then)   Phase 1 采用 AppGallery 商店更新（手动发版）
并且 (And)    Phase 2 实现应用内热更新：
      → JSBridge 下载新的 out/ 静态包到沙箱
      → 替换 rawfile 资源
      → 重新加载 WebView

假设 (Given)  热更新下载失败或资源损坏
当   (When)   WebView 加载失败
那么 (Then)   回退到 rawfile 内置版本
并且 (And)    清除损坏的更新缓存
```

### 场景 9: 构建与打包——HAP 包生成

```
假设 (Given)  开发者已安装 DevEco Studio + HarmonyOS SDK
当   (When)   运行构建脚本 scripts/build-harmony.sh
那么 (Then)   执行以下步骤：
      1. pnpm build（生成 out/ 静态资源）
      2. 将 out/ 复制到鸿蒙项目 entry/src/main/resources/rawfile/
      3. DevEco CLI 编译生成 HAP 包
并且 (And)    HAP 包可安装到鸿蒙真机或模拟器

假设 (Given)  开发者要发布到 AppGallery
当   (When)   运行发布脚本
那么 (Then)   签名 HAP（使用华为证书）
并且 (And)    上传到 AppGallery Connect
```

### 场景 10: 前端适配层——统一原生调用接口

```
假设 (Given)  现有代码通过 Capacitor 动态 import 调用原生能力
当   (When)   重构为平台适配层
那么 (Then)   每个原生能力模块遵循以下 fallback 链：

      getPlatform() === 'harmony'  → HarmonyBridge（JSBridge 调用）
      getPlatform() === 'capacitor' → Capacitor 插件（现有逻辑不变）
      else                          → Web API fallback

并且 (And)    改动文件：
      shared/lib/platform.ts        — 新增，平台检测 + isNativePlatform()
      shared/lib/harmony-bridge.ts  — 新增，JSBridge 类型定义 + 获取函数
      shared/lib/device.ts          — 修改，加入 harmony 分支
      shared/lib/storage.ts         — 修改，重构 useNative() 为三级平台判断
      shared/lib/status-bar.ts      — 修改，加入 harmony 分支
      shared/lib/notification.ts    — 修改，加入 harmony 通知桥接
      features/recording/hooks/use-audio-recorder.ts — 修改，静态 import → 动态 import + harmony 分支

并且 (And)    Capacitor 相关代码完全不变（只新增分支）
```

### 场景 11: 本地通知桥接——鸿蒙原生通知替代 @capacitor/local-notifications

```
假设 (Given)  应用运行在鸿蒙环境
当   (When)   需要发送本地通知（如待办提醒、早晚报）
那么 (Then)   通过 JSBridge 调用 harmony.notification.schedule()
并且 (And)    鸿蒙端使用 @ohos.notificationManager API
并且 (And)    支持定时通知、重复通知、取消通知

假设 (Given)  鸿蒙桥接不可用
当   (When)   调用通知相关方法
那么 (Then)   降级到 Web Notification API（如浏览器支持）
```

### 场景 12: Web API 兼容性——鸿蒙 WebView 非 Chromium 适配

```
假设 (Given)  鸿蒙 WebView 不支持 crypto.randomUUID()
当   (When)   device.ts Web fallback 需要生成设备 ID
那么 (Then)   使用 polyfill：crypto.getRandomValues + UUID v4 格式化
并且 (And)    fallback 逻辑在 platform.ts 中统一处理

假设 (Given)  鸿蒙 WebView 对 CSS env() 支持不完整
当   (When)   页面使用 env(safe-area-inset-*)
那么 (Then)   通过 JSBridge 获取安全区域尺寸
并且 (And)    注入 CSS 自定义属性 --harmony-safe-area-top 等作为 fallback
```

## 验收行为（E2E 锚点）

> 以下描述纯用户视角的操作路径，不涉及内部实现。
> 注：鸿蒙原生壳的 E2E 需要 DevEco 模拟器/真机，当前阶段仅覆盖前端平台适配层的可测试行为。

### 行为 1: 平台检测正确性
1. 在浏览器中打开应用
2. 调用 getPlatform() 返回 'web'
3. 所有原生调用走 Web fallback

### 行为 2: 鸿蒙桥接不可用时的降级
1. 在非鸿蒙环境中（无 window.__harmony_bridge__）
2. 调用 getDeviceIdentifier() 不报错，走 Web/Capacitor fallback
3. 调用 storage.getItem/setItem 不报错，走 localStorage fallback
4. 调用 initStatusBar() 静默返回

### 行为 3: 鸿蒙环境下桥接调用（需鸿蒙模拟器）
1. 在鸿蒙 WebView 中打开应用（window.__harmony_bridge__ 已注入）
2. getPlatform() 返回 'harmony'
3. 设备 ID 通过 JSBridge 获取
4. 录音通过 JSBridge 调用原生 API
5. 存储通过 JSBridge 调用 Preferences

## 边界条件
- [ ] 鸿蒙 WebView 对 CSS 的兼容性（特别是 env(safe-area-inset-*)）
- [ ] JSBridge 通信延迟（录音开始/停止需要低延迟）
- [ ] 大文件传输：录音 base64 通过 JSBridge 传输可能有大小限制（>10MB 需分片）
- [ ] 鸿蒙 WebView localStorage 大小限制
- [ ] 多窗口/分屏模式下 WebView 行为
- [ ] 鸿蒙权限弹窗时机（首次使用 vs 安装时）
- [ ] DevEco Studio 版本与 HarmonyOS SDK API 版本兼容性

## 接口约定

平台检测：
```typescript
// shared/lib/platform.ts（新增）
export type Platform = 'web' | 'capacitor' | 'electron' | 'harmony';

export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';  // SSR
  if ((window as any).__harmony_bridge__) return 'harmony';
  if ((window as any).Capacitor?.isNativePlatform?.()) return 'capacitor';
  if ((window as any).__electron_preload__) return 'electron';
  return 'web';
}

export function isNativePlatform(): boolean {
  const p = getPlatform();
  return p === 'capacitor' || p === 'harmony';
}
```

JSBridge 协议：
```typescript
// shared/lib/harmony-bridge.ts（新增）
interface HarmonyBridge {
  device: {
    getId(): Promise<string>;
    getInfo(): Promise<{ platform: 'harmony'; model: string; osVersion: string }>;
  };
  audio: {
    requestPermission(): Promise<boolean>;
    start(options?: { format?: 'aac' | 'wav' }): Promise<void>;
    stop(): Promise<{ base64: string; mimeType: string; duration: number }>;
    getStatus(): Promise<'idle' | 'recording'>;
  };
  preferences: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  statusBar: {
    init(options: { backgroundColor: string; style: 'light' | 'dark' }): Promise<void>;
  };
  notification: {
    schedule(options: {
      id: number;
      title: string;
      body: string;
      scheduledAt?: string;  // ISO 8601
      repeatInterval?: 'daily' | 'weekly';
    }): Promise<void>;
    cancel(id: number): Promise<void>;
    cancelAll(): Promise<void>;
  };
  safeArea: {
    getInsets(): Promise<{ top: number; bottom: number; left: number; right: number }>;
  };
  system: {
    openUrl(url: string): Promise<void>;  // 系统浏览器打开
    getVersion(): Promise<string>;         // 应用版本号
  };
}

export function getHarmonyBridge(): HarmonyBridge | null {
  return (window as any).__harmony_bridge__ ?? null;
}
```

鸿蒙端 ArkTS 壳结构（参考）：
```
harmony/
├── AppScope/
│   └── app.json5                    # 应用配置（bundleName, versionCode）
├── entry/
│   └── src/main/
│       ├── ets/
│       │   ├── entryability/
│       │   │   └── EntryAbility.ets  # 应用入口
│       │   ├── pages/
│       │   │   └── Index.ets         # WebView 主页面
│       │   └── bridge/
│       │       ├── BridgeManager.ets  # JSBridge 注册管理
│       │       ├── DeviceBridge.ets   # 设备ID桥接
│       │       ├── AudioBridge.ets    # 录音桥接
│       │       ├── PreferencesBridge.ets # 存储桥接
│       │       └── StatusBarBridge.ets   # 状态栏桥接
│       └── resources/
│           └── rawfile/              # ← Next.js out/ 静态资源复制到此
│               ├── index.html
│               ├── _next/
│               └── ...
├── build-profile.json5
└── oh-package.json5
```

## 开发顺序

```
Step 1: 环境搭建（1 天）
  注册华为开发者账号
  安装 DevEco Studio + HarmonyOS SDK
  创建空白鸿蒙项目，跑通 Hello World

Step 2: WebView 壳 + 静态资源加载（2 天）
  ArkUI Web 组件加载 rawfile/index.html
  验证 Next.js 页面正常渲染
  验证 CSS / JS / 字体等资源正常加载

Step 3: JSBridge 基础框架（2 天）
  实现 BridgeManager：注入 window.__harmony_bridge__
  实现 DeviceBridge（最简单，用于验证桥接通路）
  前端 platform.ts + device.ts 适配

Step 4: 录音桥接（3 天）⚡关键
  AudioBridge：OHAudio/AudioCapturer API
  权限请求流程
  base64 编码 + 返回给 WebView
  前端 use-audio-recorder.ts 适配

Step 5: 存储 + 状态栏桥接（1 天）
  PreferencesBridge + StatusBarBridge
  前端 storage.ts + status-bar.ts 适配

Step 6: 构建脚本 + 真机测试（2 天）
  build-harmony.sh 自动化
  真机安装测试完整流程
  修复兼容性问题

Step 7: 上架准备（2 天）
  应用签名
  AppGallery 素材准备（图标、截图、描述）
  提交审核
```

## 依赖
- 华为开发者账号（企业或个人）
- DevEco Studio 5.0+
- HarmonyOS SDK API 12+（HarmonyOS NEXT）
- 鸿蒙真机或 DevEco 模拟器
- 现有 Next.js 静态导出管道（`pnpm build` → `out/`）
- Gateway 服务（WebSocket + REST，无需修改）

## 备注
- 鸿蒙 WebView 内核非 Chromium，CSS/JS 兼容性需实测
- JSBridge 通信是异步的（Promise-based），与 Capacitor 插件调用模式一致
- 鸿蒙 NEXT 不兼容 Android APK，必须独立打包 HAP
- 录音是核心体验，桥接质量直接影响用户感受，需优先保障
- 鸿蒙市场份额约 4%，但在国内增长趋势明显，值得提前布局
- Phase 2 可考虑将高频页面（录音、时间线）改为原生 ArkUI 实现

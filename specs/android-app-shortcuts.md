---
id: "124"
title: "Android App Shortcuts — 长按快捷指令"
status: draft
domain: ui
risk: medium
dependencies: ["app-mobile-views.md", "app-mobile-nav.md"]
superseded_by: null
created: 2026-04-11
updated: 2026-04-11
---

# Android App Shortcuts — 长按快捷指令

## 概述

用户在 Android 桌面长按「念念有路」图标时，弹出快捷指令菜单，可直接跳转到高频操作（快速录音、新建日记、今日待办、AI 对话），减少进入 App 后的导航步骤。

基于 Android Static Shortcuts + Capacitor `@capacitor/app` 的 `appUrlOpen` 事件实现，不需要自定义 Capacitor 插件。

## 技术架构

```
长按图标 → Android ShortcutManager 弹出菜单
  → 用户点击某项
  → 系统发送 Intent(action=VIEW, data="v2note://action/xxx")
  → MainActivity 接收
    ├─ 冷启动: onCreate → Capacitor 初始化 → appUrlOpen 事件
    └─ 热启动: onNewIntent → appUrlOpen 事件
  → 前端监听 appUrlOpen → 路由到对应功能
```

关键点：`launchMode="singleTask"` 已配置，热启动走 `onNewIntent`，Capacitor `@capacitor/app` 自动将 `intent.data` 发送为 `appUrlOpen` 事件。

---

## 1. 快捷指令定义

### 场景 1.1: 长按图标弹出快捷菜单
```
假设 (Given)  用户已安装「念念有路」App
当   (When)   用户在桌面长按 App 图标
那么 (Then)   弹出快捷指令列表，包含以下条目（从上到下）：
             1. 🎙️ 快速录音
             2. ✏️ 新建日记
             3. ✅ 今日待办
             4. 💬 对话
并且 (And)    每个条目有图标 + 短标签
```

### 场景 1.2: 快捷指令 URI 映射
```
假设 (Given)  快捷指令定义在 res/xml/shortcuts.xml
当   (When)   系统加载 shortcuts 配置
那么 (Then)   各指令映射如下：
             record    → v2note://action/record
             new_note  → v2note://action/new_note
             today_todo → v2note://action/today_todo
             chat      → v2note://action/chat
```

---

## 2. Intent 接收与转发

### 场景 2.1: 冷启动（App 未运行）
```
假设 (Given)  App 当前未在后台运行
当   (When)   用户点击快捷指令「快速录音」
那么 (Then)   App 启动，完成初始化（Splash → 主页加载）
并且 (And)    初始化完成后触发 appUrlOpen 事件，url = "v2note://action/record"
并且 (And)    前端收到事件后自动进入录音模式
```

### 场景 2.2: 热启动（App 在后台）
```
假设 (Given)  App 在后台运行
当   (When)   用户点击快捷指令「今日待办」
那么 (Then)   App 回到前台
并且 (And)    MainActivity.onNewIntent 接收 Intent
并且 (And)    触发 appUrlOpen 事件，url = "v2note://action/today_todo"
并且 (And)    前端切换到待办视图
```

### 场景 2.3: 未登录状态
```
假设 (Given)  用户未登录
当   (When)   用户点击任意快捷指令
那么 (Then)   App 正常启动，进入登录/冷启动流程
并且 (And)    快捷指令的目标动作被忽略（不缓存、不延迟执行）
```

---

## 3. 前端路由处理

### 场景 3.1: 快速录音
```
假设 (Given)  前端收到 appUrlOpen，pathname = "/record"
当   (When)   用户已登录且主页已加载
那么 (Then)   自动触发 FAB 长按录音模式（等效于用户长按 FAB）
并且 (And)    如果当前在其他 overlay 页面，先关闭回到主页再触发
```

### 场景 3.2: 新建日记
```
假设 (Given)  前端收到 appUrlOpen，pathname = "/new_note"
当   (When)   用户已登录且主页已加载
那么 (Then)   打开日记编辑区域（等效于点击 FAB 短按）
并且 (And)    输入框自动聚焦，键盘弹出
```

### 场景 3.3: 今日待办
```
假设 (Given)  前端收到 appUrlOpen，pathname = "/today_todo"
当   (When)   用户已登录且主页已加载
那么 (Then)   切换到待办 Tab（如果当前不在待办视图）
并且 (And)    滚动到「今天」分组
```

### 场景 3.4: AI 对话
```
假设 (Given)  前端收到 appUrlOpen，pathname = "/chat"
当   (When)   用户已登录且主页已加载
那么 (Then)   打开 AI 对话 overlay
并且 (And)    输入框自动聚焦
```

### 场景 3.5: 未知 action 忽略
```
假设 (Given)  前端收到 appUrlOpen，pathname 不在已知列表中
当   (When)   路由匹配失败
那么 (Then)   静默忽略，不做任何跳转
并且 (And)    不弹出错误提示
```

---

## 4. Native 层实现要点

### 4.1 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `android/app/src/main/res/xml/shortcuts.xml` | 新建 | Static Shortcuts 定义 |
| `android/app/src/main/res/values/strings.xml` | 修改 | 快捷指令标签文字 |
| `android/app/src/main/res/drawable/ic_shortcut_*.xml` | 新建 | 快捷指令图标（vector drawable） |
| `android/app/src/main/AndroidManifest.xml` | 修改 | 添加 meta-data + intent-filter |
| `android/app/src/main/java/com/v2note/app/MainActivity.java` | 修改 | 重写 onNewIntent |

### 4.2 shortcuts.xml 结构
```xml
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="record"
    android:shortcutShortLabel="@string/shortcut_record"
    android:shortcutLongLabel="@string/shortcut_record_long"
    android:icon="@drawable/ic_shortcut_mic"
    android:enabled="true">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.v2note.app"
      android:targetClass="com.v2note.app.MainActivity"
      android:data="v2note://action/record" />
  </shortcut>
  <!-- new_note / today_todo / chat 同理 -->
</shortcuts>
```

### 4.3 AndroidManifest 变更
```xml
<activity android:name=".MainActivity" ...>
  <!-- 现有 LAUNCHER filter 不变 -->

  <!-- 新增：shortcuts 声明 -->
  <meta-data
    android:name="android.app.shortcuts"
    android:resource="@xml/shortcuts" />

  <!-- 新增：v2note scheme deep link -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:scheme="v2note" android:host="action" />
  </intent-filter>
</activity>
```

### 4.4 MainActivity onNewIntent
```java
@Override
protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    // Capacitor @capacitor/app 会自动处理 intent data → appUrlOpen 事件
}
```

---

## 验收行为（E2E 锚点）

> 快捷指令涉及 Android 原生交互，E2E 主要验证前端路由层。

### 行为 1: 快捷指令 → 录音模式
1. App 通过 shortcut intent 启动，url = `v2note://action/record`
2. 主页加载完成后，自动进入录音模式
3. 录音指示器可见

### 行为 2: 快捷指令 → 新建日记
1. App 通过 shortcut intent 启动，url = `v2note://action/new_note`
2. 主页加载完成后，日记编辑区域打开
3. 输入框已聚焦

### 行为 3: 快捷指令 → 待办视图
1. App 通过 shortcut intent 启动，url = `v2note://action/today_todo`
2. 主页加载完成后，当前 Tab 为待办
3. 今天分组可见

### 行为 4: 快捷指令 → AI 对话
1. App 通过 shortcut intent 启动，url = `v2note://action/chat`
2. 主页加载完成后，AI 对话 overlay 打开

### 行为 5: 未知 action 静默忽略
1. App 收到 url = `v2note://action/unknown_action`
2. 主页正常显示，无异常行为

## 边界条件
- [ ] 冷启动时 Splash 阶段 intent 不丢失
- [ ] 热启动时当前页面状态不被破坏（如正在编辑的日记）
- [ ] 未登录时不执行快捷动作
- [ ] Android 7.1 以下（API < 25）不支持 App Shortcuts，静默降级（无报错）
- [ ] 快捷指令与通知点击 intent 不冲突

## 依赖
- `@capacitor/app` — 提供 `appUrlOpen` 事件
- `features/recording/components/fab.tsx` — 录音模式触发
- `app/page.tsx` — 主页视图切换、overlay 管理

## Implementation Phases
- [ ] Phase 1: Android Native 层（shortcuts.xml + manifest + icons + onNewIntent）
- [ ] Phase 2: 前端路由监听（appUrlOpen → 功能触发）
- [ ] Phase 3: 各快捷动作的具体实现（录音/日记/待办/对话）
- [ ] Phase 4: 边界条件处理（未登录、冷启动延迟、overlay 冲突）

## 备注
- Static Shortcuts 最多 4 个，当前刚好 4 个。如果后续需要更多，考虑 Dynamic Shortcuts
- 图标建议使用 Material Icons 的 vector drawable，保持与系统风格一致
- `v2note://` scheme 是自定义 scheme，后续如需 Android App Links（https 域名验证）可再扩展
- 此方案不需要自定义 Capacitor 插件，完全复用 `@capacitor/app` 已有能力

---
id: "fix-rec-ui"
title: "Fix: 录音 UI 精简 — 长按半屏 + 常驻轻量浮窗"
status: completed
domain: voice
dependencies: ["app-mobile-views.md"]
superseded_by: null
created: 2026-04-06
updated: 2026-04-06
---

# Fix: 录音 UI 精简

## 概述
当前录音 UI 存在两个问题：
1. 长按录音铺满全屏，过于沉重
2. 常驻录音全屏沉浸 + 实时转写，与"后台录音"定位矛盾，且文字会盖住控制按钮

修复方向：长按录音收缩为底部半屏面板；常驻录音改为悬浮呼吸图标 + 点击展开控制。

## 1. 长按录音 — 底部半屏面板

> 影响文件：`features/recording/components/fab.tsx` 中 `phase === "recording"` 的渲染块（当前第 643-831 行）

### 现状
- `fixed inset-0` 全屏暗色背景
- 波形居中、方向提示（取消/常驻/指令）散布在屏幕四周
- 实时转写文字在屏幕中部

### 场景 1.1: 底部面板布局
```
假设 (Given)  用户长按 FAB 进入录音状态 (phase === "recording")
当   (When)   录音界面显示
那么 (Then)   页面上方（约 60%）显示轻遮罩 bg-black/30，内容可见但不可交互
并且 (And)    底部（约 40%）显示录音面板，背景 bg-[#0a0a0f]/95 圆角顶部
并且 (And)    面板内自上而下排列：
  1. 状态行：● 录音中 + 计时（一行，紧凑）
  2. 波形：缩小版，高度 h-16，max-w-sm 居中
  3. 实时转写：限制 max-h-[60px] overflow-hidden，最多 2 行
  4. 方向提示：三个图标横排（✕取消 / ↑指令 / 🔒常驻）
  5. FAB 按钮仍在最底部
```

### 场景 1.2: 手势行为不变
```
假设 (Given)  录音面板显示中
当   (When)   用户在 FAB 上拖拽（左/右/上）
那么 (Then)   手势逻辑完全保留（取消/常驻/指令），与当前行为一致
并且 (And)    方向提示图标随拖拽方向高亮（当前逻辑不变）
当   (When)   用户松开 FAB（无方向）
那么 (Then)   松开发送，与当前行为一致
```

### 场景 1.3: 上方遮罩点击
```
假设 (Given)  录音面板显示中
当   (When)   用户点击上方遮罩区域
那么 (Then)   不做任何操作（防误触，录音继续）
注意: 遮罩区域设置 pointer-events-none 即可
```

### 技术要点
```
- 全屏容器保留 fixed inset-0 z-30，但拆为两层：
  - 上层遮罩：pointer-events-none，bg-black/30
  - 下层面板：fixed bottom-0 left-0 right-0，高度约 40vh，rounded-t-3xl
- 方向提示从绝对定位（left/right/top）改为面板内 flex 横排
- 波形、转写的渲染逻辑不变，仅调整尺寸和位置
- FAB 按钮定位逻辑不变（fixed bottom）
```

## 2. 常驻录音 — 呼吸浮窗

> 影响文件：`features/recording/components/recording-immersive.tsx`（整体替换）
> 影响文件：`features/recording/components/fab.tsx` 中 `phase === "locked"` 的渲染（第 620-638 行）

### 现状
- 全屏沉浸界面（RecordingImmersive 组件）
- 实时 ASR 转写 + 大波形 + 三个控制按钮
- 文字增长会推挤按钮出屏幕

### 场景 2.1: 收起态 — 呼吸录音指示器（默认）
```
假设 (Given)  用户通过长按右滑进入常驻录音 (phase === "locked")
当   (When)   常驻录音开始
那么 (Then)   页面完全可交互，不显示任何遮罩或全屏覆盖
并且 (And)    FAB 原位替换为呼吸录音指示器：
  - 圆形，与 FAB 同尺寸同位置
  - 红色脉冲光晕动画（shadow pulse）
  - 中心显示 Mic 图标（白色）
  - 图标下方显示小字计时 "01:23"
并且 (And)    不进行实时 ASR 识别，而是存录音，然后一次上传识别（不发送 asr.start，或发送但不显示结果）
并且 (And)    不显示波形
当   (When)   用户点击呼吸指示器
那么 (Then)   录音暂停，指示器展开为控制面板（见场景 2.2）
```

### 场景 2.2: 展开态 — 暂停控制面板
```
假设 (Given)  用户点击了呼吸录音指示器
当   (When)   控制面板展开
那么 (Then)   录音暂停
并且 (And)    在 FAB 位置上方展开一个小浮窗（非全屏），包含：
  - 暂停状态 + 时长显示 "⏸ 01:23"
  - 三个按钮横排：
    - ✕ 取消（红色，border-red-500/30 bg-red-500/10）
    - ▶ 继续（白色，border-white/20 bg-white/10）→ 点击回到收起态继续录音
    - ✓ 保存（绿色，border-emerald-500/30 bg-emerald-500/10）→ 结束录音提交处理
并且 (And)    浮窗背景：bg-[#0a0a0f]/95 rounded-2xl，紧凑布局
并且 (And)    浮窗外点击 → 收起浮窗并继续录音（等同于点击"继续"）
```

### 场景 2.3: 取消常驻录音
```
假设 (Given)  控制面板展开中
当   (When)   用户点击 ✕ 取消
那么 (Then)   丢弃录音，phase 回到 idle
并且 (And)    FAB 恢复正常状态
```

### 场景 2.4: 保存常驻录音
```
假设 (Given)  控制面板展开中
当   (When)   用户点击 ✓ 保存
那么 (Then)   调用 finishRecording()，phase 回到 idle
并且 (And)    FAB 显示处理中状态（已有的 processing capsule）
```

### 场景 2.5: 继续录音
```
假设 (Given)  控制面板展开中
当   (When)   用户点击 ▶ 继续
那么 (Then)   录音恢复，控制面板收起
并且 (And)    回到场景 2.1 的呼吸指示器状态
```

### 技术要点
```
- RecordingImmersive 组件重写为轻量浮窗，不再是全屏组件
- 组件接口简化：
  interface RecordingFloatProps {
    duration: number;
    paused: boolean;
    onTogglePause: () => void;  // 点击图标：录音中→暂停，暂停→继续
    onCancel: () => void;
    onDone: () => void;
  }
- 去掉 waveHeights / confirmedText / partialText props
- fab.tsx 中 phase === "locked" 时不启动 ASR（或停止实时转写推送）
- 呼吸动画：CSS animation，类似 animate-pulse 但更柔和
  @keyframes breathe {
    0%, 100% { box-shadow: 0 0 12px rgba(239,68,68,0.3); }
    50% { box-shadow: 0 0 28px rgba(239,68,68,0.6); }
  }
```

## 删除清单
- [x] `recording-immersive.tsx` 中的波形渲染（waveHeights map）— 已在之前版本删除
- [x] `recording-immersive.tsx` 中的实时转写区域（confirmedText/partialText）— 已在之前版本删除，本次清理了兼容 props
- [x] `fab.tsx` 中常驻录音的 ASR 实时文字传递 — 已不传递给 RecordingImmersive
- [x] `fab.tsx` 中移除了未使用的 `Send` import

## 边界条件
- [ ] 常驻录音期间用户切换 tab（diary↔todo）：呼吸指示器应始终可见
- [ ] 常驻录音期间用户打开 overlay（聊天/设置等）：指示器 z-index 需高于 overlay
- [ ] 长时间录音（>10min）：计时器格式正确显示 "10:00"+
- [ ] 录音暂停后 app 进入后台再回来：暂停状态应保持

## Implementation Phases
- [x] Phase 1: 常驻录音改为呼吸浮窗（重写 RecordingImmersive → RecordingFloat）
- [x] Phase 2: 长按录音全屏 → 底部半屏面板

## 备注
- 两个改动独立，Phase 1 优先（常驻录音问题更严重）
- 完成后将修复结果回写到 `app-mobile-views.md` 场景 5.x 相关描述

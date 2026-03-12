# gene_recording_immersive — 录音全屏沉浸界面

## 概述

录音开始后整个屏幕进入"暗色剧场"模式，用户通过大尺寸视觉反馈清晰感知录音状态和滑动方向。

## 设计理念

**问题**：原设计中录音时的波形太小（18根 tiny 条在小卡片里）、滑动提示文字太小（11px灰色药丸）、选中反馈太弱（仅 scale-105），用户在滑动操作时完全看不清选择了什么。

**方案**：全屏沉浸式剧场——录音即演出，整个屏幕都是舞台。

## 视觉架构

### 暗色剧场背景
- 录音开始 → 全屏覆盖 radial-gradient 暗色（88-95% opacity）
- 消除一切视觉干扰，聚焦录音体验

### 方向感知光晕
滑向不同方向时，对应位置弥漫彩色 radial-gradient：
- **左滑（取消）**：左侧红色光晕 `rgba(239,68,68)`
- **上滑（指令）**：上方琥珀色光晕 `rgba(245,158,11)`
- **右滑（常驻）**：右侧翡翠绿光晕 `rgba(16,185,129)`
- **默认**：底部暖橙色微光 `rgba(249,115,22,0.12)`

### 大号波形（屏幕中央）
- 32 根 4px 宽条，铺满屏幕宽度（max-w-sm）
- 中心衰减曲线（中间高、两侧低）：`falloff = 1 - centerDist * 0.4`
- 颜色随滑动方向实时变化（橙→红/琥珀/翡翠）
- 80ms transition 保证流畅感

### 边缘方向图标
三个 56x56 图标方块分布在屏幕边缘：
| 位置 | 图标 | 颜色 | 含义 |
|------|------|------|------|
| 左侧中部 | X | 红色 | 取消录音 |
| 上方中部 | Command | 琥珀色 | 语音指令 |
| 右侧中部 | Lock | 翡翠绿 | 常驻录音 |

选中状态变化：
- 图标 5→7 大小，文字 xs→base
- 背景发光阴影 `shadow-[0_0_30px_rgba(...)]`
- 整体 1.3x 缩放
- 未选中方向淡化至 opacity 0.1

### 顶部计时器
- text-5xl mono 字体 + `tracking-[0.15em]`
- 红色呼吸指示灯（2.5px 圆点 + animate-pulse + 发光阴影）
- "录音中" 标签 uppercase 字间距

### FAB 弹性跟随
- 录音时 FAB 跟随手指偏移：`deltaX * 0.35, deltaY * 0.35`
- 双层脉冲环（-inset-3 和 -inset-6）

### 松开发送提示
- 居中显示在 FAB 上方
- 滑向任何方向时自动淡化（opacity 0.2 + scale 0.85）

## 常驻录音模式（RecordingImmersive）

右滑进入常驻模式后的全屏界面：
- text-7xl 超大计时器
- 状态徽章（绿色呼吸灯 "常驻录音" / 黄色静态灯 "已暂停"）
- 大波形容器（h-24，rounded-3xl 卡片）
- 实时转录文本
- 三按钮横排：取消(红) / 暂停或恢复(白) / 完成(绿)

## 文件结构

| 文件 | 职责 |
|------|------|
| `features/recording/components/fab.tsx` | 主 FAB 组件，含全屏录音覆盖层 |
| `features/recording/components/recording-immersive.tsx` | 常驻录音全屏界面 |
| `features/recording/hooks/use-fab-gestures.ts` | 手势状态机（不变） |
| `app/globals.css` | 动画定义：fab-ripple, fab-breathe, pulse-ring |

## 手势状态机

```
idle → pressing (pointerdown)
pressing → recording (300ms long press)
pressing → idle (quick release = tap → open text sheet)
recording → idle (release = send)
recording → idle (swipe left = cancel)
recording → locked (swipe right = persistent)
recording → idle (swipe up = command mode)
```

## 关键参数

| 参数 | 值 |
|------|-----|
| 长按阈值 | 300ms |
| 滑动阈值 | 80px |
| 波形条数 | 32 |
| 波形宽度 | 4px |
| FAB 弹性系数 | 0.35 |
| 方向图标尺寸 | 56x56 (选中 72x72) |

---
id: "074"
title: "设计语言对齐 — Editorial Serenity 落地"
status: completed
domain: design
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 设计语言对齐 — Editorial Serenity 落地

> 状态：✅ completed | 优先级：Phase 7.4
> 完成日期: 2026-03-28
> 依赖：app-mobile-redesign.md（设计语言定义）、docs/designs/01-21（设计稿）
> 前提：功能骨架已完成，本 spec 只做视觉/动画层对齐

## 概述

app-mobile-redesign 定义的 Editorial Serenity 设计语言尚未落地。
当前代码使用 Sora 字体 + 1px border 分隔 + 紧凑间距 + shadow-md 阴影。
需要全局替换为设计稿要求的字体、色阶分隔、呼吸间距、环境阴影。

本 spec 不涉及功能改动，只做视觉层面的对齐。

---

## 一、基础设施

### 场景 1.1: 安装 framer-motion + @use-gesture/react
```
假设 (Given)  项目无物理动画库
当   (When)   开始设计对齐工作
那么 (Then)   pnpm add framer-motion @use-gesture/react
并且 (And)    验证 Capacitor 兼容性（无 SSR 冲突）
并且 (And)    创建 shared/lib/motion.ts 统一导出（lazy import for tree-shaking）
```

### 场景 1.2: 字体替换
```
假设 (Given)  当前字体: Sora(display) + NotoSansSC(body) + JetBrainsMono(mono) + DMSerifDisplay(serif)
当   (When)   替换字体
那么 (Then)   app/layout.tsx 替换为:
  - 标题/日期: Newsreader (serif, Google Fonts, variable weight)
  - 正文: Inter (sans, Google Fonts) + Noto Sans SC (中文 fallback)
  - 元数据: Geist Mono (monospace)
并且 (And)    tailwind.config.ts fontFamily 更新对应 CSS 变量
并且 (And)    全局搜索 font-display / font-body / font-mono / font-serif 确认引用一致
```

### 场景 1.3: Tailwind 设计 token 更新
```
假设 (Given)  tailwind.config.ts 已有 surface 色阶
当   (When)   更新 token
那么 (Then)   确认以下 token 值与设计稿一致:
  - surface: #FDF9F3
  - surface-low: #F7F3ED
  - surface-lowest: #FFFFFF
  - surface-high: #EBE8E2
  - ghost-border: rgba(215, 194, 184, 0.15)
  - on-surface: #1C1C18
  - muted-accessible: #7B6E62 (≥ 4.5:1 contrast)
并且 (And)    新增 shadow token:
  - shadow-ambient: "0 8px 24px rgba(28, 28, 24, 0.06)"
并且 (And)    新增 spacing token:
  - breath: "2rem" (spacing-8 or custom)
```

---

## 二、No-Line Rule — border 替换

### 场景 2.1: 全局 border 清理
```
假设 (Given)  代码中有 142 处 border-b / border-t / divide-y / border-border
当   (When)   逐文件替换
那么 (Then)   按以下规则处理:
  - 列表项分隔: 删除 border/divide，改用 spacing-6 (2rem) 垂直间距
  - 卡片边界: 删除 border，依靠 surface-lowest 卡片在 surface-low 容器上的色阶差
  - header 底部: 删除 border-b，改用 surface 色 + 环境阴影 shadow-ambient
  - sheet 顶部: 保留圆角 16px，删除 border
  - 必须保留边框的场景(无障碍): 改用 ghost-border token
并且 (And)    components/ui/ 下的 shadcn 组件: 只改实际使用到的，不改组件库源码中未用到的
```

---

## 三、Breath Principle — 间距调整

### 场景 3.1: 列表间距扩大
```
假设 (Given)  日记卡片/待办行间距为 gap-2 / gap-3 / space-y-2
当   (When)   调整间距
那么 (Then)   列表项间距统一为 spacing-6 (2rem)
并且 (And)    分组间距统一为 spacing-8 (2.5rem)
并且 (And)    卡片内边距保持 16px (px-4 py-4)
```

---

## 四、Glass & Soul — 毛玻璃效果

### 场景 4.1: Header 毛玻璃
```
假设 (Given)  WorkspaceHeader 背景为 surface 纯色
当   (When)   应用 Glass 效果
那么 (Then)   背景改为 surface/80 + backdrop-blur-[12px]
并且 (And)    FAB 胶囊态同理
并且 (And)    TextBottomSheet / TodoDetailSheet header 同理
```

---

## 五、环境阴影

### 场景 5.1: 阴影替换
```
假设 (Given)  部分组件使用 shadow-md / shadow-lg
当   (When)   统一阴影
那么 (Then)   替换为 shadow-ambient: "0 8px 24px rgba(28, 28, 24, 0.06)"
并且 (And)    Now Card 使用更大阴影: "0 12px 32px rgba(28, 28, 24, 0.08)"
```

---

## 六、圆角统一

### 场景 6.1: 圆角规范化
```
假设 (Given)  各组件圆角不统一
当   (When)   规范化
那么 (Then)
  - 日记卡片 / Todo 卡片: rounded-xl (12px)
  - 按钮: rounded-xl (1.5rem, "鹅卵石")
  - 药丸 (tag/badge/segment): rounded-full
  - Sheet 顶部: rounded-t-2xl (16px)
  - Now Card: rounded-2xl (16px)
```

---

## 七、动画升级

### 场景 7.1: 统一转场 AnimatePresence
```
假设 (Given)  各 overlay 各自处理 mount/unmount 动画
当   (When)   引入 framer-motion
那么 (Then)   app/page.tsx overlay 渲染区外包 <AnimatePresence>
并且 (And)    各 overlay 入场: opacity 0→1 + translateY(16→0), 200ms ease-out
并且 (And)    各 overlay 退场: opacity 1→0 + translateY(0→16), 150ms ease-in
并且 (And)    SwipeBack 右滑关闭改用 framer-motion drag gesture
```

### 场景 7.2: NowCard spring 动画
```
假设 (Given)  NowCard 卡片飞出/上升用 CSS transition
当   (When)   替换为 spring 动画
那么 (Then)   飞出: spring({ stiffness: 300, damping: 25 })
并且 (And)    下一卡上升: spring({ stiffness: 200, damping: 20, delay: 100 })
```

### 场景 7.3: 粒子消散效果
```
假设 (Given)  NowCard 右滑完成无粒子
当   (When)   添加粒子效果
那么 (Then)   完成时: 8-12 个森林色小圆点从卡片中心向右散射
并且 (And)    每个粒子: random 角度 + random 速度 + opacity fade, 300-500ms
并且 (And)    prefers-reduced-motion 下: 跳过粒子，只保留卡片飞出
```

---

## 八、各屏视觉微调

### 场景 8.1: 登录/注册 — 品牌视觉
```
假设 (Given)  LoginPage / RegisterPage 为基础表单
当   (When)   对齐设计稿 19-20
那么 (Then)   顶部添加像素小鹿 Logo (LuluLogo 组件复用)
并且 (And)    标题 "念念有路" 使用 Newsreader serif
并且 (And)    表单输入框: ghost-border 底线样式（非 border 框）
并且 (And)    按钮: 鹿毛色渐变 + rounded-xl
```

### 场景 8.2: Onboarding 欢迎页
```
假设 (Given)  OnboardingSeed 直接从第一题开始
当   (When)   对齐设计稿 17
那么 (Then)   在第一题前插入欢迎页:
  - 🦌 像素小鹿 Logo (大号，居中)
  - "你好，我是路路" Newsreader 24px
  - "你的每一个想法，我都帮你记住" 副标题
  - [开始] 鹿毛色渐变大按钮
```

### 场景 8.3: Onboarding 语音输入
```
假设 (Given)  Onboarding 五问只有文字输入
当   (When)   对齐设计稿 18
那么 (Then)   每问底部添加:
  - "🎙 说说看" 鹿毛色大按钮（主 CTA）
  - "⌨️ 打字" 灰色次级按钮
并且 (And)    点击"说说看": 开启录音 → 转写 → 填入输入框
```

### 场景 8.4: 每日回顾卡片流
```
假设 (Given)  EveningSummary 为滚动列表
当   (When)   对齐设计稿 14
那么 (Then)   改为横滑卡片流:
  - 卡片 1: 今日行动摘要（accomplishments + stats）
  - 卡片 2: 路路的发现（cognitive_highlights + AI 洞察）
  - 卡片 3: 统计数据 + "和路路聊聊今天" 按钮
并且 (And)    顶部显示分页指示器 ● ○ ○
并且 (And)    左右滑动切换卡片（framer-motion drag）
```

### 场景 8.5: 认知统计极性图
```
假设 (Given)  StatsDashboard 使用 bar/line chart
当   (When)   对齐设计稿 15
那么 (Then)   顶部添加极性分布环形图（感知/判断/领悟三色）
并且 (And)    使用 recharts PieChart 或自定义 SVG
并且 (And)    图下方三列数据卡: 领悟滞后(天) / 本月记录 / 矛盾数
并且 (And)    保留 Top Clusters 列表
```

---

## 涉及文件

| 文件 | 改动类型 |
|------|----------|
| `app/layout.tsx` | 修改: 字体替换 |
| `tailwind.config.ts` | 修改: fontFamily + shadow + spacing token |
| `features/notes/components/notes-timeline.tsx` | 修改: 间距+border清理 |
| `features/notes/components/note-card.tsx` | 修改: 圆角+阴影+间距 |
| `features/workspace/components/workspace-header.tsx` | 修改: Glass 效果 |
| `features/workspace/components/todo-workspace-view.tsx` | 修改: 间距+border清理 |
| `features/action-panel/components/now-card.tsx` | 修改: spring 动画+粒子 |
| `features/sidebar/components/sidebar-drawer.tsx` | 修改: 间距+border清理 |
| `features/daily/components/evening-summary.tsx` | 重写: 卡片横滑 |
| `features/sidebar/components/stats-dashboard.tsx` | 修改: 添加极性环形图 |
| `features/cognitive/components/onboarding-seed.tsx` | 修改: 欢迎页+语音 |
| `features/auth/components/login-page.tsx` | 修改: 品牌视觉 |
| `features/auth/components/register-page.tsx` | 修改: 品牌视觉 |
| `features/todos/components/todo-detail-sheet.tsx` | 修改: 间距+样式 |
| `features/goals/components/goal-detail-overlay.tsx` | 修改: 间距+样式 |
| `features/chat/components/chat-view.tsx` | 修改: 气泡样式微调 |
| `shared/lib/motion.ts` | 新增: framer-motion 统一导出 |
| `app/page.tsx` | 修改: AnimatePresence 包裹 |
| 约 60 个 .tsx 文件 | 修改: border→ghost-border/间距替换 |

## 验收标准

逐屏对照 `docs/designs/01-21` 设计稿截图，视觉差异 < 5%。

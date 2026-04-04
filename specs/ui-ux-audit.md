---
id: "110"
title: "UI/UX 全局审查与改进"
status: active
domain: design
dependencies: ["app-mobile-views.md", "app-mobile-nav.md", "chat-system.md", "todo-core.md", "todo-ui.md"]
superseded_by: null
created: 2026-04-04
updated: 2026-04-04
---

# UI/UX 全局审查与改进

## 概述

基于 ui-ux-pro-max 规则体系（Apple HIG / Material Design / WCAG），通过 Playwright 截图 + 代码审查，对 V2Note 全平台（Mobile + PC）进行系统性 UI/UX 审查。本 spec 记录发现的问题和改进方案，按优先级组织。

**审查时间**: 2026-04-04
**审查范围**: Mobile 首页（日记/待办）、Chat、侧边栏、PC 端 4 页（write/timeline/goals/map）
**设计语言**: Editorial Serenity（已定义完善的 token 体系，问题主要在执行层面）

---

## 1. Touch Target & Spacing (触控目标与间距)

> 规则来源: `touch-target-size` Min 44×44pt / `touch-spacing` Min 8px gap

### 场景 1.1: Header 按钮尺寸不达标
```
假设 (Given)  用户在移动端使用 App
当   (When)   点击顶部栏的 AI 对话 / 搜索 / 通知按钮
那么 (Then)   按钮可交互区域应 ≥ 44×44px
并且 (And)    相邻按钮间距 ≥ 8px
```

**当前问题**:
| 元素 | 文件 | 当前尺寸 | 要求 |
|------|------|---------|------|
| 头像按钮 | workspace-header.tsx:59 | w-7 h-7 (28px) | 44px |
| AI 对话按钮 | workspace-header.tsx:96 | w-9 h-9 (36px) | 44px |
| 搜索按钮 | workspace-header.tsx:105 | w-9 h-9 (36px) | 44px |
| 通知按钮 | workspace-header.tsx:112 | w-9 h-9 (36px) | 44px |
| 日记/待办 Tab | workspace-header.tsx:68 | h-8 (32px) | 44px |
| 侧边栏关闭按钮 | sidebar-drawer.tsx:145 | w-8 h-8 (32px) | 44px |
| 侧边栏菜单项 | sidebar-drawer.tsx:629 | py-2 ≈ 32px | 44px |

**修复方案**: 视觉尺寸可保持不变，通过扩展 hit area 达标（padding 或 `min-h-[44px] min-w-[44px]`）。Header 右侧 3 按钮间距从 `gap-1` 改为 `gap-2`。

### 场景 1.2: 侧边栏树节点触控密度
```
假设 (Given)  用户在侧边栏查看"我的世界"树
当   (When)   点击某个目标/项目节点
那么 (Then)   每个节点行高 ≥ 44px
并且 (And)    节点间不会因密度过高导致误触
```

---

## 2. Accessibility (无障碍)

> 规则来源: `aria-labels`, `keyboard-nav`, `color-contrast`, `reduced-motion`

### 场景 2.1: Tab 切换器缺少 ARIA 语义
```
假设 (Given)  屏幕阅读器用户使用日记/待办 Tab 切换
当   (When)   VoiceOver 聚焦到 Tab 区域
那么 (Then)   应朗读 "标签页列表，日记 标签，已选中" 
并且 (And)    Tab 容器有 role="tablist"，每个 Tab 有 role="tab" + aria-selected
```

**当前问题**: workspace-header.tsx 的 Tab 切换使用普通 `<button>`，无 tablist/tab 角色。

### 场景 2.2: 对比度达标
```
假设 (Given)  App 处于 Dark Mode
当   (When)   用户查看待办视图的 placeholder 文字
那么 (Then)   文字与背景对比度 ≥ 4.5:1 (WCAG AA)
```

**当前问题**: 
- `--muted-foreground` dark mode 值 `hsl(25, 5%, 52%)` ≈ #888380
- 在 `--card` `hsl(25, 8%, 11%)` ≈ #1f1c1a 背景上对比度约 4.2:1，低于 4.5:1 要求
- 建议将 dark mode muted-foreground 提亮至 55-58%

### 场景 2.3: 减弱动画支持
```
假设 (Given)  用户开启了系统"减弱动画"设置
当   (When)   App 加载任何动画（FAB 呼吸、卡片入场、侧边栏滑入等）
那么 (Then)   动画应被禁用或大幅缩短（duration ≤ 1ms）
```

**当前问题**: globals.css 定义了 30+ 个 @keyframes，没有 `@media (prefers-reduced-motion: reduce)` 处理。

**修复方案**: 在 globals.css 底部添加：
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 3. Press Feedback (按压反馈)

> 规则来源: `press-feedback`, `tap-feedback-speed` — 80-150ms 内提供视觉反馈

### 场景 3.1: 按钮/卡片缺少按压态
```
假设 (Given)  用户在移动端点击任何可交互元素
当   (When)   手指按下
那么 (Then)   元素应在 100ms 内展示按压反馈（opacity 降低或微缩放）
```

**当前问题**: Header 按钮、侧边栏菜单项、日记卡片均无 active/pressed 样式。

**修复方案**: 全局添加交互类：
```css
.pressable {
  @apply active:opacity-80 active:scale-[0.97] transition-transform duration-100;
}
```
或使用 Tailwind 直接在组件上添加 `active:opacity-80`。

---

## 4. Emoji 图标替换

> 规则来源: `no-emoji-icons` — Use SVG icons, not emojis

### 场景 4.1: 时段图标和目标图标使用 emoji
```
假设 (Given)  用户查看待办视图的时段分组
当   (When)   渲染时段标签（随时/上午/下午/晚上）
那么 (Then)   应使用 Lucide SVG 图标（Clock, Sun, CloudSun, Moon）
并且 (And)    不使用 emoji (☀️🌙🕐)
```

**当前问题**:
- 待办视图时段分组使用 emoji 图标（从截图可见）
- 目标看板卡片标题前有 🎯 emoji
- Chat 页面 AI 头像使用 emoji 风格鹿图

**修复方案**: 
| 当前 Emoji | 替换为 Lucide 图标 |
|-----------|-------------------|
| 🕐 随时 | `<Clock size={16} />` |
| ☀️ 上午 | `<Sun size={16} />` |
| ⛅ 下午 | `<CloudSun size={16} />` |
| 🌙 晚上 | `<Moon size={16} />` |
| 🎯 目标 | `<Target size={16} />` |

---

## 5. Hardcoded Values (硬编码值清理)

> 规则来源: `color-semantic`, `spacing-scale`

### 场景 5.1: 内联颜色硬编码
```
假设 (Given)  App 切换到 Light Mode
当   (When)   渲染头像渐变和侧边栏头像
那么 (Then)   渐变颜色应从 CSS 变量读取
并且 (And)    不使用内联 style={{ background: 'linear-gradient(#89502C, #C8845C)' }}
```

**当前问题**:
- workspace-header.tsx:60 — 硬编码 `#89502C, #C8845C`
- sidebar-drawer.tsx:129 — 同样的硬编码渐变

**修复**: 定义 `--avatar-gradient-from` / `--avatar-gradient-to` token，light/dark 各一套。

### 场景 5.2: Magic Number 间距
```
假设 (Given)  侧边栏渲染树节点
当   (When)   不同深度的节点缩进
那么 (Then)   使用 spacing token (如 depth * spacing-4) 而非 magic number
```

**当前问题**:
- sidebar-drawer.tsx:405 — `paddingLeft = 12 + depth * 16`
- sidebar-drawer.tsx:79, 579 — `window.innerHeight - 200`

---

## 6. PC 端体验 (Desktop Experience)

### 场景 6.1: PC 端缺少全局导航
```
假设 (Given)  用户在 PC 端访问 /write 页面
当   (When)   想切换到 /timeline 或 /goals
那么 (Then)   应有可见的侧边或顶部导航，提供所有页面入口
并且 (And)    当前页面在导航中高亮显示
```

**当前问题**: PC 端 4 个页面之间没有任何可见导航，用户只能手动修改 URL。

**修复方案**: 复用 `components/layout/pc-layout.tsx`（已存在但未充分使用），添加左侧固定侧栏：
- 写作 (/write)
- 时间线 (/timeline)
- 目标 (/goals)
- 认知地图 (/map)

### 场景 6.2: /timeline Runtime Error
```
假设 (Given)  用户访问 PC 端 /timeline 页面
当   (When)   页面加载
那么 (Then)   应正常渲染时间线视图
并且 (And)    不展示 Runtime Error
```

**当前问题**: `Objects are not valid as React child (found: object with keys {id, name})`，某个数据对象被直接渲染为 JSX children。

### 场景 6.3: /write 空白页引导
```
假设 (Given)  用户首次打开 PC 端 /write 页面
当   (When)   编辑区域为空
那么 (Then)   应显示引导文案或快捷操作提示
并且 (And)    不是一个几乎全黑的空屏幕
```

### 场景 6.4: /goals 数据泄漏
```
假设 (Given)  用户在 PC 端查看目标看板
当   (When)   目标卡片渲染标题
那么 (Then)   应显示用户可读的目标标题
并且 (And)    不显示 AI 推理过程文本（如"说话者说'明天上山打老虎'，结合当前日期..."）
```

---

## 7. Empty States (空状态)

> 规则来源: `empty-states` — Helpful message and action when no content

### 场景 7.1: 各页面空状态覆盖
```
假设 (Given)  某页面/模块无数据
当   (When)   用户打开该页面
那么 (Then)   展示插图 + 说明文案 + 主操作按钮
并且 (And)    不展示空白或仅一行灰色文字
```

**当前空状态评估**:
| 页面/模块 | 当前表现 | 评分 |
|----------|---------|------|
| 待办视图 | 每个时段有 placeholder + 按钮 | ✅ 好 |
| 日记视图 | 无记录时无引导 | 🔴 缺 |
| PC /write | 仅日期 + 光标，几乎全空 | 🔴 差 |
| PC /map | "暂无聚类数据" 一行文字 | 🔴 差 |
| 侧边栏加载 | 无 loading skeleton | 🟡 缺 |
| Chat | AI 自动问候语 | ✅ 好 |

---

## 8. Font & Performance (字体与性能)

### 场景 8.1: 字体渲染阻塞
```
假设 (Given)  用户首次加载 App（或清缓存后）
当   (When)   CSS 通过 @import 加载 Google Fonts
那么 (Then)   不应阻塞首屏渲染
并且 (And)    使用 <link rel="preload"> 或 Next.js font optimization
```

**当前问题**: globals.css 第 1 行使用 `@import url(...)` 加载 4 个字体族，这是渲染阻塞操作。

### 场景 8.2: 首屏组件膨胀
```
假设 (Given)  用户打开 Mobile 首页
当   (When)   page.tsx 加载
那么 (Then)   仅加载首屏可见的组件
并且 (And)    Overlay 组件（13 种）使用 dynamic import 懒加载
```

**当前问题**: app/page.tsx 顶部 import 了 30+ 组件，包括 MorningBriefing、EveningSummary、GoalList 等 overlay，全部打入首屏 bundle。

### 场景 8.3: --font-display 变量未定义
```
假设 (Given)  globals.css 中 h1-h3 引用 var(--font-display)
当   (When)   渲染标题
那么 (Then)   --font-display 应在 :root 中有定义
```

**当前问题**: `:root` 中定义了 `--font-serif`、`--font-body`、`--font-cjk`、`--font-mono`，但没有 `--font-display`。h1-h3 会 fallback 到 `--font-body`。

---

## 边界条件

- [ ] 所有触控目标在 375px 宽度（iPhone SE）上不重叠
- [ ] Dark/Light mode 切换后所有文字对比度 ≥ 4.5:1
- [ ] 系统字体放大到最大（Dynamic Type）后布局不崩溃
- [ ] prefers-reduced-motion 开启后无动画残留
- [ ] PC 端 1024px 宽度时导航可用
- [ ] 横屏模式下 Header 不被裁剪

## 依赖

- Lucide React（已安装，用于替换 emoji 图标）
- next/font（替换 @import 加载字体）
- Next.js dynamic()（组件懒加载）

## Implementation Phases (实施阶段)

- [ ] **Phase 1: 紧急修复** — 触控目标 44px + ARIA role + /timeline 崩溃修复
- [ ] **Phase 2: 体感提升** — 按压反馈 + emoji 替换 SVG + 硬编码清理
- [ ] **Phase 3: PC 端补全** — 全局导航 + 空状态 + /goals 数据泄漏
- [ ] **Phase 4: 性能优化** — 字体加载 + 组件懒加载 + reduced-motion
- [ ] **Phase 5: 精细打磨** — 对比度微调 + 日期分组视觉层级 + --font-display

## 备注

- 审查方法: Playwright MCP 截图 (390×844 mobile / 1440×900 desktop) + 代码静态分析
- 参考规则: ui-ux-pro-max Quick Reference (Apple HIG / Material Design / WCAG 2.1 AA)
- 设计语言 Editorial Serenity 的 token 体系本身设计良好，大部分问题在执行层而非架构层

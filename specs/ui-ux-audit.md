---
id: "110"
title: "UI/UX 全局审查与改进"
status: active
domain: design
risk: medium
dependencies: ["app-mobile-views.md", "app-mobile-nav.md", "chat-system.md", "todo-core.md", "todo-ui.md"]
superseded_by: null
created: 2026-04-04
updated: 2026-04-12
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

---

## 9. 移动端精修 Round 1 — P1 可访问性 + P3 性能 + P5 布局

> 2026-04-12 追加。聚焦移动端，不改导航架构。
> 范围：对比度/ARIA/触控 (P1) + 懒加载/骨架屏 (P3) + 卡片层次/布局细节 (P5)
> risk: medium

### 9.1 Dark Mode 对比度修复

#### 场景 9.1.1: muted 文字对比度达标
```
假设 (Given)  App 处于 Dark Mode
当   (When)   渲染任何使用 muted-foreground 的文字（时间戳、placeholder、副标题）
那么 (Then)   文字与所在背景对比度 ≥ 4.5:1 (WCAG AA)
```

**修复**:
- `globals.css` dark mode `--muted-foreground` 从 `25 5% 52%` 提亮至 `25 5% 58%`
- 验证：`hsl(25,5%,58%)` ≈ `#979291` 在 `hsl(25,8%,11%)` ≈ `#1f1c1a` 上对比度 ≈ 5.0:1 ✓

#### 场景 9.1.2: Card 与 Background 可区分
```
假设 (Given)  App 处于 Dark Mode
当   (When)   渲染日记卡片列表
那么 (Then)   卡片表面与页面背景有清晰视觉分离（对比度 ≥ 1.5:1 或有明确边框）
```

**修复**:
- `--card` dark 从 `25 8% 11%` 提至 `25 8% 13%`
- 与 `--background: 25 10% 7%` 对比度 ≈ 1.6:1 ✓
- `--card-foreground: 30 10% 93%` 在新 card 背景上对比度 ≈ 12.5:1，仍远超 7:1 ✓
- 可选：卡片增加 `border border-ghost-border` 作为辅助分离
- ⚠️ `--card` 是全局变量，影响所有 `bg-card` 组件（待办卡片、聊天气泡、设置面板等），实施时需全局检查 `bg-card` 使用处的视觉效果

#### 场景 9.1.3: 待办 placeholder 对比度
```
假设 (Given)  App 处于 Dark Mode，待办视图中显示空时段 placeholder（"今天随时可做的事"）
当   (When)   用户查看待办列表
那么 (Then)   placeholder 文字对比度 ≥ 3:1（非交互提示允许 3:1）
```

### 9.2 触控目标达标 (Mobile)

#### 场景 9.2.1: Header 按钮触控区域
```
假设 (Given)  用户在移动端 (390px 宽度)
当   (When)   点击顶部栏任意按钮（头像/日记Tab/待办Tab/AI聊天/搜索）
那么 (Then)   每个按钮可交互区域 ≥ 44×44px
并且 (And)    相邻按钮间距 ≥ 8px
```

**涉及文件**: `features/workspace/components/workspace-header.tsx`

| 元素 | 当前尺寸 | 修复方式 |
|------|---------|---------|
| 头像按钮 | w-7 h-7 (28px) | 视觉不变，外层 `min-w-[44px] min-h-[44px]` + `items-center justify-center` |
| 日记/待办 Tab | h-8 (32px) | 内部 padding 扩展至 `py-2 px-4`，确保行高 ≥ 44px |
| AI 聊天按钮 | w-9 h-9 (36px) | `min-w-[44px] min-h-[44px]` |
| 搜索按钮 | w-9 h-9 (36px) | 同上 |
| 右侧按钮 gap | gap-1 (4px) | 改为 `gap-2` (8px) |

#### 场景 9.2.2: 日记卡片三点菜单触控
```
假设 (Given)  用户在日记列表查看某条记录
当   (When)   点击卡片右上角三点菜单(⋮)
那么 (Then)   按钮可交互区域 ≥ 44×44px
并且 (And)    不与卡片主体点击区域冲突
```

**涉及文件**: `features/notes/components/note-card.tsx`
**修复**: 三点按钮添加 `min-w-[44px] min-h-[44px] flex items-center justify-center`

#### 场景 9.2.3: 日记卡片按压反馈
```
假设 (Given)  用户在移动端按下日记卡片
当   (When)   手指按下（touchstart / :active）
那么 (Then)   卡片在 ≤ 100ms 内展示视觉反馈（opacity 降至 0.85 或 scale 至 0.98）
并且 (And)    手指松开后 ≤ 150ms 恢复原状
```

**修复**: 卡片主体添加 `active:scale-[0.98] active:opacity-90 transition-[transform,opacity] duration-100`

### 9.3 ARIA 语义补全

#### 场景 9.3.1: Tab 切换器 ARIA
```
假设 (Given)  屏幕阅读器用户使用日记/待办 Tab
当   (When)   VoiceOver 聚焦到 Tab 区域
那么 (Then)   容器朗读 "标签页列表"
并且 (And)    每个 Tab 朗读 "日记 标签，已选中" 或 "待办 标签"
```

**涉及文件**: `features/workspace/components/workspace-header.tsx`
**修复**:
```tsx
// Tab 容器
<div role="tablist" aria-label="主视图切换">
  <button role="tab" aria-selected={tab === 'diary'}>日记</button>
  <button role="tab" aria-selected={tab === 'todo'}>待办</button>
</div>
```

#### 场景 9.3.2: 简报关闭按钮 ARIA
```
假设 (Given)  今日简报浮层打开
当   (When)   屏幕阅读器聚焦到关闭按钮
那么 (Then)   朗读 "关闭今日简报"
并且 (And)    不朗读 "×"
```

**涉及文件**: `features/daily/components/morning-briefing.tsx`
**修复**: `<button aria-label="关闭今日简报">×</button>`

### 9.4 Emoji 图标替换为 Lucide SVG

#### 场景 9.4.1: 待办时段图标
```
假设 (Given)  用户在移动端查看待办视图
当   (When)   渲染时段分组标题（随时/上午/下午/晚上）
那么 (Then)   使用 Lucide SVG 图标
并且 (And)    不使用 emoji 字符
```

**图标映射**:
| 当前 | 替换为 | Lucide 组件 |
|------|--------|------------|
| 🕐 随时 | Clock | `<Clock size={16} />` |
| ☀️ 上午 | Sun | `<Sun size={16} />` |
| ⛅ 下午 | CloudSun | `<CloudSun size={16} />` |
| 🌙 晚上 | Moon | `<Moon size={16} />` |

**涉及文件**: 待办视图中渲染时段标题的组件（`features/todos/` 目录下）

#### 场景 9.4.2: PC 端 MenuBar emoji 替换（顺带修复）
> 虽然 Round 1 聚焦移动端，但 PC MenuBar 的 emoji 图标是同一类问题，改动量极小（1 个文件），顺带修复。

```
假设 (Given)  用户在 PC 端查看顶部 MenuBar
当   (When)   渲染导航按钮
那么 (Then)   所有导航使用 Lucide 图标
并且 (And)    不使用 🔍🎙⚡️📋⚙️
```

**图标映射**:
| 当前 | 替换为 | Lucide 组件 |
|------|--------|------------|
| 🔍 | Search | `<Search size={18} />` |
| 🎙 | Mic | `<Mic size={18} />` |
| ⚡️行动 | Zap | `<Zap size={18} />` |
| 📋回顾 | ClipboardList | `<ClipboardList size={18} />` |
| ⚙️ | Settings | `<Settings size={18} />` |

**涉及文件**: `components/layout/menu-bar.tsx`

### 9.5 首屏性能 — 组件懒加载

#### 场景 9.5.1: Overlay 组件 dynamic import
```
假设 (Given)  用户打开 App 首页
当   (When)   page.tsx 加载
那么 (Then)   仅首屏可见组件（Header、列表、FAB）同步加载
并且 (And)    Overlay 组件（搜索/聊天/回顾/设置/简报/目标详情等）使用 next/dynamic 懒加载
```

**涉及文件**: `app/page.tsx`（当前 51 个 eager import，0 个 dynamic）

**需要改为 dynamic import 的组件**（14 个 overlay/modal）:
```tsx
import dynamic from 'next/dynamic'

const SearchView = dynamic(() => import('@/features/search/components/search-view'))
const ChatView = dynamic(() => import('@/features/chat/components/chat-view'))
const ReviewOverlay = dynamic(() => import('@/features/reviews/components/review-overlay'))
const ProfileEditor = dynamic(() => import('@/features/profile/components/profile-editor'))
const SettingsEditor = dynamic(() => import('@/features/settings/components/settings-editor'))
const NotebookList = dynamic(() => import('@/features/diary/components/notebook-list'))
const MorningBriefing = dynamic(() => import('@/features/daily/components/morning-briefing'))
const EveningSummary = dynamic(() => import('@/features/daily/components/evening-summary'))
const SmartDailyReport = dynamic(() => import('@/features/daily/components/smart-daily-report'))
const OnboardingSeed = dynamic(() => import('@/features/cognitive/components/onboarding-seed'))
const GoalDetailOverlay = dynamic(() => import('@/features/goals/components/goal-detail-overlay'))
const ProjectDetailOverlay = dynamic(() => import('@/features/goals/components/project-detail-overlay'))
const GoalList = dynamic(() => import('@/features/goals/components/goal-list'))
const NotificationCenter = dynamic(() => import('@/features/notifications/components/notification-center'))
```

**不改为 dynamic 的组件**（首屏直接可见）:
- WorkspaceHeader、NotesTimeline、TodoWorkspace、FABButton 等

#### 场景 9.5.2: 简报加载骨架屏
```
假设 (Given)  用户登录后触发今日简报
当   (When)   简报内容正在生成（"正在生成简报..."状态）
那么 (Then)   显示结构化骨架屏（标题占位 + 3 行文字占位 + 按钮占位）
并且 (And)    不是只显示一行 spinner + 文字
```

**涉及文件**: `features/daily/components/morning-briefing.tsx`

**骨架屏结构**:
```tsx
<div className="space-y-6 animate-pulse">
  <Skeleton className="h-8 w-48" />         {/* 标题 */}
  <div className="space-y-3">
    <Skeleton className="h-5 w-full" />      {/* 正文行 1 */}
    <Skeleton className="h-5 w-3/4" />       {/* 正文行 2 */}
    <Skeleton className="h-5 w-5/6" />       {/* 正文行 3 */}
  </div>
  <div className="space-y-2">
    <Skeleton className="h-4 w-32" />        {/* 小标题 */}
    <Skeleton className="h-10 w-full" />     {/* 列表项 */}
    <Skeleton className="h-10 w-full" />
  </div>
  <Skeleton className="h-12 w-full rounded-xl" /> {/* 按钮 */}
</div>
```

#### 场景 9.5.3: 简报快速响应不闪烁骨架屏
```
假设 (Given)  简报内容在 300ms 内返回
当   (When)   渲染简报
那么 (Then)   直接显示内容，不闪烁骨架屏
```

**修复**: 用 `useEffect` + `setTimeout(300)` 延迟显示骨架屏。loading 状态前 300ms 不渲染任何占位，超过 300ms 才显示骨架屏。

### 9.6 布局细节 (Mobile)

#### 场景 9.6.1: 日记卡片类型标记
```
假设 (Given)  用户在日记列表查看不同类型的记录
当   (When)   卡片渲染
那么 (Then)   不同来源类型的卡片有视觉区分（左侧 3px 彩色边框）
```

**类型颜色映射**（仅基于前端已有的 `source_type` 字段，不依赖后端新增字段）:
| 类型 | 判断条件 | 左边框色 |
|------|---------|---------|
| 语音记录 | `source_type === 'voice'` | `hsl(var(--domain-health-fg))` 绿 |
| AI 日报 | `source_type === 'ai_diary'` | `hsl(var(--primary))` 品牌橙 |
| 素材/引用 | `source_type === 'material'` | `hsl(var(--muted-foreground))` 灰 |
| 普通文字 | `source_type === 'text'` 或其他 | 无边框（保持现状） |

**与现有 source-type-badge.tsx 的关系**: 左边框为视觉辅助，badge 文字标记保持不变，两者共存互补。

**涉及文件**: `features/notes/components/note-card.tsx`
**修复**: 卡片最外层增加条件 `border-l-[3px]` + 对应颜色类

#### 场景 9.6.2: 待办时段视觉层次
```
假设 (Given)  用户在待办视图查看时段分组
当   (When)   渲染时段标题行（随时/上午/下午/晚上）
那么 (Then)   标题左侧有 3px 彩色指示条，颜色与时段语义关联
并且 (And)    空时段折叠为一行，有待办的时段自动展开
```

**时段颜色**（复用已有 CSS 变量）:
| 时段 | 颜色变量 |
|------|---------|
| 随时 | `--tag-anytime-text` |
| 上午 | `--tag-morning-text` |
| 下午 | `--tag-afternoon-text` |
| 晚上 | `--tag-evening-text` |

#### 场景 9.6.3: 硬编码渐变清理
```
假设 (Given)  App 在 Light/Dark mode 间切换
当   (When)   渲染头像渐变色
那么 (Then)   渐变颜色从 CSS token 读取，自动适配当前主题
并且 (And)    不使用内联 style 硬编码 hex 值
```

**涉及文件**:
- `features/workspace/components/workspace-header.tsx` — 硬编码 `#89502C, #C8845C`
- `features/sidebar/components/sidebar-drawer.tsx` — 同样硬编码

**修复**: 在 globals.css 中定义具体值（`--deer-dark` / `--deer` 未在 :root 中注册，不可引用）：
```css
:root {
  --avatar-gradient-from: #89502C;
  --avatar-gradient-to: #C8845C;
}
.dark {
  --avatar-gradient-from: #89502C;
  --avatar-gradient-to: #C8845C;
}
```
组件中改为 `background: linear-gradient(135deg, var(--avatar-gradient-from), var(--avatar-gradient-to))`

### 9.7 层级管理 — 弹窗与 FAB 互斥

#### 场景 9.7.1: 弹窗打开时隐藏 FAB
```
假设 (Given)  用户在移动端主页，FAB 录音按钮可见
当   (When)   打开任何弹窗/浮层（简报、聊天、搜索、设置、目标详情、回顾等）
那么 (Then)   FAB 录音按钮隐藏（display:none 或 opacity:0 + pointer-events:none）
并且 (And)    弹窗关闭后 FAB 恢复显示
```

**问题**: FAB 使用 `z-50` 定位，与 overlay 弹窗同层级。弹窗打开时 FAB 仍浮在内容之上，可能遮挡弹窗底部操作区。

**涉及文件**: `features/recording/components/fab-button.tsx`（FAB 组件）、`app/page.tsx`（overlay 状态管理）

**修复方案**: FAB 组件接收一个 `visible` prop（或读取全局 overlay 状态），当任意 overlay 打开时隐藏 FAB：
```tsx
// app/page.tsx 中已有各 overlay 的 boolean state
const anyOverlayOpen = showChat || showSearch || showReview || showSettings
  || showBriefing || showGoalDetail || showProjectDetail || ...;

<FABButton visible={!anyOverlayOpen} />
```
FAB 组件内部：
```tsx
if (!visible) return null;
// 或使用 framer-motion exit 动画: scale(0) + opacity(0), 150ms
```

---

## 验收行为（E2E 锚点）— Round 1

> 以下为 9.x 移动端精修的 E2E 验收行为

### 行为 1: 暗色模式对比度
1. 用户在移动端打开 App（Dark Mode）
2. 进入待办视图
3. placeholder 文字（"今天随时可做的事"）在视觉上清晰可读
4. 日记卡片与页面背景有明显视觉分离

### 行为 2: 触控目标尺寸
1. 用户在移动端查看 Header
2. 每个按钮（头像、Tab、聊天、搜索）的可交互区域 ≥ 44×44px
3. 使用 Playwright 测量元素 bounding box 验证

### 行为 3: 日记卡片按压反馈
1. 用户在日记列表查看卡片
2. 卡片元素的 class 中包含 `active:scale-` 和 `active:opacity-` 样式声明
3. (视觉验证：手动点击时卡片有缩放/透明度反馈，此项不做自动化 E2E 断言)

### 行为 4: Tab ARIA 语义
1. 用户使用屏幕阅读器
2. 聚焦到 Tab 区域，VoiceOver 朗读 "标签页列表"
3. 聚焦到已选 Tab，朗读 "已选中"

### 行为 5: Emoji 替换为 SVG
1. 用户在待办视图查看时段分组
2. 时段标题区域内的图标元素为 `<svg>` 标签
3. 时段标题区域内无 emoji 文本节点（可通过 `[data-testid="time-slot-header"]` 定位）

### 行为 6: 首屏加载性能
1. 用户首次打开 App，首屏渲染完成
2. 在未打开任何 Overlay 的情况下，检查 `app/page.tsx` 中 overlay 组件使用 `dynamic()` 导入
3. (此项为代码结构验证，不做运行时 E2E 断言；可通过单元测试或 bundle 分析验证)

### 行为 7: 简报骨架屏
1. 用户登录后触发简报生成
2. 生成期间显示结构化骨架屏（标题 + 多行 + 按钮形状的占位块）
3. 生成完成后骨架屏被实际内容替换

### 行为 8: 日记卡片类型标记
1. 用户在日记列表查看多条不同类型记录
2. 语音记录卡片左侧有绿色边框标记
3. 普通文字卡片无彩色左边框

### 行为 9: 弹窗打开时 FAB 隐藏
1. 用户在主页，FAB 录音按钮可见
2. 用户打开聊天/搜索/简报等任意弹窗
3. FAB 录音按钮不可见
4. 关闭弹窗后 FAB 恢复可见

---

## 边界条件 — Round 1 补充

- [ ] 触控目标在 iPhone SE (375px) 上不重叠、不超出屏幕
- [ ] muted-foreground 在 card/background/surface 三种暗色背景上均达 4.5:1
- [ ] dynamic import 的 overlay 在网络慢时不白屏（需 fallback 或 loading 状态）
- [ ] 骨架屏在简报秒级响应时不会闪烁（loading 时间 < 300ms 则跳过骨架屏）
- [ ] 卡片类型标记在无 AI 标记数据时优雅降级（无边框，不报错）
- [ ] Lucide 图标在 Light/Dark mode 下颜色正确跟随主题
- [ ] `--card` 提亮后，所有 `bg-card` 使用处（待办卡片、聊天气泡、设置面板）视觉无异常
- [ ] `--card-foreground` 在新 `--card` 背景上对比度仍 ≥ 7:1
- [ ] 待办时段指示条颜色变量（`--tag-*-text`）在 light mode 中也有定义，否则需补充

---

## Implementation Phases (实施阶段)

### 移动端 Round 1（本次）

- [x] **R1-Phase 1: 对比度 + ARIA** — CSS 变量修复 + Tab role + aria-label（纯标记，无逻辑改动）
- [x] **R1-Phase 2: 触控 + 按压反馈** — Header 按钮 44px + gap-2 + 卡片 active 样式
- [x] **R1-Phase 3: Emoji → Lucide** — 待办时段图标 + PC MenuBar 图标替换
- [x] **R1-Phase 4: 首屏性能** — 14 个 overlay dynamic import + 简报骨架屏
- [x] **R1-Phase 5: 视觉层次** — 日记卡片类型边框 + 待办时段指示条 + 渐变 token 化
- [x] **R1-Phase 6: 层级管理** — FAB 弹窗互斥隐藏

### 未来 Round（不在本次范围）

- [ ] PC 端全局导航 + 空状态（原 Phase 3）
- [ ] 字体加载优化（原 Phase 4 部分）
- [ ] 日记列表虚拟滚动（数据量大后再做）

## 备注

- 审查方法: Playwright MCP 截图 (390×844 mobile / 1440×900 desktop) + 代码静态分析
- 参考规则: ui-ux-pro-max Quick Reference (Apple HIG / Material Design / WCAG 2.1 AA)
- 设计语言 Editorial Serenity 的 token 体系本身设计良好，大部分问题在执行层而非架构层
- 2026-04-12 二次审查确认：`prefers-reduced-motion` 已实现 ✓ / 侧边栏 scrim 已实现 ✓
- Round 1 不改动导航架构（底部 Tab 栏、路由结构等保持现状）

---
id: "120"
title: "原生体验深度优化 — 路线A"
status: completed
domain: ui
risk: high
dependencies: ["mobile-native-feel.md", "app-mobile-views.md"]
superseded_by: null
created: 2026-04-08
updated: 2026-04-24
---

# 原生体验深度优化 — 路线A

## 概述
在 spec 090（基础 WebView 原生化）的基础上，从转场动画、虚拟滚动、字体加载、动画性能四个维度进一步消除 WebView 与原生 App 的体感差距。目标：让用户无法从交互层面感知到这是一个 WebView 应用。

**全局性能指标**：所有交互操作的视觉反馈必须 < 100ms（Apple HIG `tap-feedback-speed`、Material `input-latency` 标准）。

**架构约束**：V2Note 移动端是单页应用（`app/page.tsx`），所有导航通过 state 驱动：
- Tab 切换（diary/todo）：`activeTab` state + `className="hidden"` 切换可见性，双视图同时挂载
- Overlay 导航（chat/goals/search/settings 等）：`activeOverlay` state + `AnimatePresence mode="wait"`
- 本 spec 的所有方案必须在此架构下工作，不引入 Next.js 路由导航

## 现有基础设施（已完成，本次不涉及）
- SwipeBack 组件 — `shared/components/swipe-back.tsx` ✅
- 触觉反馈 — `shared/lib/haptics.ts` ✅
- 下拉刷新 — `shared/hooks/use-pull-to-refresh.ts` ✅
- 键盘偏移 — `shared/hooks/use-keyboard-offset.ts` ✅
- Viewport 管理 — `components/layout/viewport-height-manager.tsx` ✅
- 全局 CSS 原生化（tap-highlight、touch-callout、overscroll）— globals.css ✅
- spec 090 遗留未修复项（ChatView chips select-none、NoteCard 按钮 select-none）— 不在本次范围

---

## 0. Motion Design Tokens（全局动画节奏统一）

> 来源：UI/UX Pro Max `motion-consistency` — "Unify duration/easing tokens globally; all animations share the same rhythm and feel"
> 本节定义全局动画 token，后续所有章节的动画参数必须引用这些 token，不允许散写魔数。

### 接口约定

```typescript
// shared/lib/motion-tokens.ts（新建）
export const motion = {
  // 时长 token
  duration: {
    instant: 0.08,    // 80ms — 按压反馈、状态切换
    fast:    0.15,    // 150ms — Tab crossfade、微交互
    normal:  0.25,    // 250ms — Overlay 进入、Sheet 弹出
    slow:    0.4,     // 400ms — stagger 总时长上限、复杂转场
  },

  // Spring 配置 token
  spring: {
    snappy:  { type: 'spring' as const, stiffness: 400, damping: 30 },  // Overlay 进入
    gentle:  { type: 'spring' as const, stiffness: 300, damping: 24 },  // Sheet、stagger item
    bouncy:  { type: 'spring' as const, stiffness: 500, damping: 25 },  // 强调效果（如完成动画）
  },

  // Easing token
  ease: {
    enter: 'easeOut',                   // 进入：快开始慢结束
    exit:  'easeIn',                    // 退出：慢开始快结束
    move:  [0.32, 0.72, 0, 1] as const, // 移动：Apple HIG fluid curve
  },
} as const;
```

### 实现方案
- 新建 `shared/lib/motion-tokens.ts`，Phase B/C/D 的所有动画参数从这里引用
- 此文件是 Phase B 的前置依赖，必须先完成

---

## 1. Tab/Overlay 转场动画

> 当前状态：Tab 切换为瞬切（hidden/display），Overlay 已有 AnimatePresence 但动画配置简单。无转场是"网页感"最大来源。

### 场景 1.1: Tab 间 crossfade 切换
```
假设 (Given)  用户在首页日记 tab
当   (When)   用户点击底部导航切换到待办 tab
那么 (Then)   日记视图 opacity 淡出、待办视图 opacity 淡入（150ms ease-out）
并且 (And)    双视图 DOM 始终保持挂载（不卸载，保留滚动位置和状态）
并且 (And)    底部导航栏和 FAB 不参与过渡（保持静止）
并且 (And)    非活跃 tab 设置 pointer-events: none 防止误触
```

### 场景 1.2: 快速连续 Tab 切换
```
假设 (Given)  用户在日记 tab
当   (When)   用户快速连续点击 tab 切换（日记→待办→日记，< 300ms 间隔）
那么 (Then)   动画不堆叠/不卡死，最终停留在最后一次点击的目标 tab
并且 (And)    中间的动画被优雅中断（立即跳到最终状态）
```

### 场景 1.3: Overlay 进入（push 语义）
```
假设 (Given)  用户在主页面
当   (When)   用户触发一个 overlay（如打开 chat、goals、search）
那么 (Then)   overlay 从右侧滑入（250ms spring: stiffness 400, damping 30）
并且 (And)    已有 AnimatePresence 框架的 overlay 复用现有机制，只增强动画参数
并且 (And)    转场由 framer-motion 驱动
```

### 场景 1.4: Overlay 退出（pop 语义）
```
假设 (Given)  用户在某个 overlay 中
当   (When)   用户点击关闭或从左边缘滑动返回（SwipeBack）
那么 (Then)   overlay 向右滑出（150ms ease-in，约为进入时长的 60%）
并且 (And)    退出动画无回弹（干脆消失），给用户"响应快"的感知
并且 (And)    SwipeBack 手势驱动时，退出进度跟随手指位置实时联动（复用现有 SwipeBack 组件）
```
> 来源：UI/UX Pro Max `exit-faster-than-enter` — "Exit ~60-70% of enter duration to feel responsive"

### 场景 1.5: Overlay 嵌套转场
```
假设 (Given)  用户已打开 goals overlay
当   (When)   用户点击某个 goal 进入 goal-detail overlay
那么 (Then)   goals → goal-detail 的转场动画正确（向左推入新面板）
并且 (And)    SwipeBack 返回时动画方向正确（goal-detail → goals）
```

### 场景 1.6: 减少动画偏好
```
假设 (Given)  用户设备开启了 prefers-reduced-motion
当   (When)   发生任何 Tab 切换或 Overlay 转场
那么 (Then)   跳过所有转场动画，直接切换
```

### 场景 1.7: 动画期间不阻塞交互
```
假设 (Given)  Tab crossfade 或 Overlay 转场动画正在播放
当   (When)   用户点击目标视图中的内容
那么 (Then)   点击立即生效，不需要等动画结束
并且 (And)    Tab crossfade 中，目标 tab 从 opacity 变化第一帧起即可交互（pointer-events: auto）
并且 (And)    Overlay 进入动画中，overlay 内容始终可交互
```
> 来源：UI/UX Pro Max `no-blocking-animation` — "Never block user input during an animation; UI must stay interactive"

### 接口约定

```typescript
// Tab 切换动画 — 在 app/page.tsx 中实现
// 方案：两个 tab 容器始终挂载，通过 motion.div animate={{ opacity }} 控制
// 非活跃 tab: opacity: 0, pointer-events: 'none', position: 'absolute'
// 活跃 tab: opacity: 1, pointer-events: 'auto', position: 'relative'

// Overlay 转场 — 增强现有 AnimatePresence 配置
// 进入: initial={{ x: '100%' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
// 退出: exit={{ x: '100%' }} transition={{ duration: motion.duration.fast, ease: motion.ease.exit }}  // 150ms，进入的 60%
```

### 实现方案

**Tab 切换**：
- 将当前 `className="hidden"` 改为 `motion.div` + `animate={{ opacity }}`
- 两个 tab 容器同时挂载在同一位置（`position: absolute` 叠加）
- 通过 `opacity` 和 `pointer-events` 控制可见性和交互性
- 不使用 AnimatePresence 的 mount/unmount（避免状态丢失）

**Overlay 转场**：
- 在现有 `AnimatePresence mode="wait"` 基础上，为每个 overlay 组件添加统一的 `motion` props
- 新建 `shared/components/overlay-transition.tsx` — 通用 overlay 动画包裹器
- 各 overlay 组件在根 div 使用 `<OverlayTransition>` 包裹

**关键文件**：
- 修改 `app/page.tsx` — Tab 切换从 hidden 改为 opacity 动画
- 新建 `shared/components/overlay-transition.tsx` — Overlay 通用动画包裹器
- 修改各 overlay 组件（SearchView、ChatView、GoalList 等）— 接入 OverlayTransition

**设计决策**：
- 复用现有 SwipeBack 组件（原生 touch 事件），不用 framer-motion 重写手势部分
- 不引入 View Transitions API（当前 Capacitor WKWebView 支持率低，ROI 不高；如有需要可作为后续 Phase E 探索）

---

## 2. 虚拟滚动

> 当前状态：所有列表全量渲染 DOM。日记流 50+ 条、待办 100+ 条时，低端设备帧率下降。

### 场景 2.1: 日记流虚拟滚动
```
假设 (Given)  用户有 200 条日记记录
当   (When)   用户在首页浏览日记流
那么 (Then)   只渲染可视区域 ± 3 条的 DOM 节点（约 10-15 个）
并且 (And)    滚动流畅度 ≥ 55fps（中端设备）
并且 (And)    快速滚动时无明显白屏/闪烁
并且 (And)    下拉刷新仍然正常工作
```

### 场景 2.2: 待办列表虚拟滚动
```
假设 (Given)  用户有 100+ 条待办
当   (When)   用户在待办页浏览
那么 (Then)   列表使用虚拟滚动，DOM 节点数量恒定
并且 (And)    滑动完成/推迟操作在虚拟滚动下仍然正常
```

### 场景 2.3: 待办拖拽排序与虚拟滚动兼容
```
假设 (Given)  待办列表使用虚拟滚动
当   (When)   用户发起拖拽排序操作
那么 (Then)   拖拽期间临时增大 overscan（渲染当前分组全部条目）
并且 (And)    拖拽结束后恢复正常 overscan
并且 (And)    拖拽过程中不因节点回收导致中断
并且 (And)    使用 drag threshold（竖向移动 > 10px 视为滚动取消拖拽，长按 > 200ms 启动拖拽）防止误触
```
> 来源：UI/UX Pro Max `drag-threshold` — "Use a movement threshold before starting drag to avoid accidental drags"

### 场景 2.4: 聊天消息虚拟滚动
```
假设 (Given)  用户有一个长对话（100+ 条消息）
当   (When)   用户上滑查看历史消息
那么 (Then)   消息列表使用虚拟滚动
并且 (And)    新消息到达时自动滚动到底部
并且 (And)    用户正在浏览历史时，新消息不打断滚动位置
```

### 场景 2.5: 聊天历史消息加载
```
假设 (Given)  聊天列表使用虚拟滚动，已加载最近 50 条
当   (When)   用户滚动到顶部触发加载更多
那么 (Then)   历史消息插入到列表顶部
并且 (And)    当前可视区域不跳动（保持用户正在看的消息位置）
```

### 场景 2.6: 动态高度条目
```
假设 (Given)  列表中的条目高度不固定（如日记内容长短不一）
当   (When)   虚拟滚动计算可视区域
那么 (Then)   使用 estimateSize + measureElement 动态测量真实高度
并且 (And)    首次渲染后缓存高度，避免重复测量
```

### 场景 2.7: 虚拟滚动与下拉刷新兼容
```
假设 (Given)  列表使用虚拟滚动，用户在列表顶部
当   (When)   用户下拉触发刷新
那么 (Then)   下拉刷新组件（PullRefreshIndicator）正常显示在列表上方
并且 (And)    刷新完成后新数据正确渲染，虚拟滚动重新计算尺寸
```

### 场景 2.8: 滚动位置恢复
```
假设 (Given)  用户在日记列表滚动到第 50 条
当   (When)   用户切换到待办 tab 再切回日记 tab
那么 (Then)   日记列表滚动位置保持在第 50 条附近（不回到顶部）
```

### 场景 2.9: 空列表
```
假设 (Given)  用户没有任何日记
当   (When)   用户在首页日记视图
那么 (Then)   显示空状态引导组件（不是空白虚拟滚动容器）
```

### 场景 2.10: 滚动时不播放入场动画
```
假设 (Given)  列表已使用虚拟滚动
当   (When)   用户滚动导致新条目进入可视区域
那么 (Then)   新条目直接显示，不播放入场动画
并且 (And)    入场动画只在以下情况播放：页面首次加载、Tab 切换到当前 tab、下拉刷新完成后
```

### 场景 2.11: 快速滚动 skeleton 占位
```
假设 (Given)  用户在虚拟滚动列表中快速拖动滚动条
当   (When)   滚动速度超过渲染速度，出现尚未渲染的区域
那么 (Then)   显示 skeleton placeholder（匹配条目尺寸的灰色占位块 + shimmer 动画）
并且 (And)    渲染追上后平滑替换为真实内容，无闪烁
```
> 来源：UI/UX Pro Max `progressive-loading` — "Use skeleton screens / shimmer instead of long blocking spinners"

### 接口约定

```typescript
// 使用 @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual';

// 通用配置
interface VirtualListConfig {
  estimateSize: number;      // 预估单条高度（px）
  overscan: number;          // 额外渲染的缓冲条数，默认 3
  scrollMargin?: number;     // 滚动边距
}

// 日记流：estimateSize = 120, overscan = 3
// 待办列表：estimateSize = 64, overscan = 5
// 聊天消息：estimateSize = 80, overscan = 5

// 虚拟滚动容器高度必须配合 --app-height CSS 变量（ViewportHeightManager 提供）
```

### 实现方案

**依赖**：新增 `@tanstack/react-virtual`

**关键文件**：
- 修改 `features/notes/components/notes-timeline.tsx` — 日记流虚拟化
- 修改 `features/todos/components/todo-workspace.tsx` — 待办列表虚拟化
- 修改 `features/chat/components/chat-view.tsx` — 聊天消息虚拟化
- 新建 `shared/hooks/use-virtual-list.ts` — 通用虚拟滚动 hook（封装 estimateSize + measureElement + overscan + 空列表检测）

---

## 3. 字体加载优化

> 当前状态：4 个字体族通过 Google Fonts CDN `@import` 加载，是渲染阻塞资源。首屏需等字体下载完成才能正确显示，Capacitor 离线环境可能字体缺失。

### 场景 3.1: 首屏字体快速呈现
```
假设 (Given)  用户首次打开 App（冷启动）
当   (When)   页面渲染
那么 (Then)   字体从本地 bundle 加载，不依赖网络
并且 (And)    FOUT 持续时间 < 100ms，用户不可感知
```

### 场景 3.2: 离线环境字体正常
```
假设 (Given)  用户设备处于离线状态
当   (When)   打开 App
那么 (Then)   所有字体正常显示（来自本地）
并且 (And)    与在线环境视觉效果完全一致
```

### 场景 3.3: 字体按需加载（CJK 优化）
```
假设 (Given)  Noto Sans SC / Noto Serif SC 完整文件各约 8MB
当   (When)   构建 App
那么 (Then)   中文字体按 unicode-range 分片加载
并且 (And)    首屏所需字体 < 500KB
并且 (And)    完整字体 < 4MB（按需加载非首屏字符）
并且 (And)    中文字重精简：Noto Sans SC 保留 400/500/700，Noto Serif SC 保留 400/700
```

### 实现方案

**方案**：从 `@import url(Google Fonts CDN)` 迁移到 `@fontsource` 本地包加载。

选择 `@fontsource` 而非 `next/font/local` 的原因：
- @fontsource 内置 unicode-range 分片（CJK 按需加载），无需手动处理
- npm 包管理，无需手动下载 .woff2 文件
- 构建时 webpack 自动将字体文件复制到 `out/_next/static/media/`
- 与 `output: 'export'` + Capacitor 完全兼容

步骤：
1. 安装 @fontsource 字体包（Inter/Newsreader/Noto Sans SC/Noto Serif SC）
2. 在 `app/fonts.ts` 中按字重导入 CSS
3. 在 `app/layout.tsx` 中导入 fonts.ts
4. 删除 `globals.css` 中的 CDN `@import url(...)` 行
5. CSS 变量保持不变（@fontsource 使用相同的 font-family 名称）

```typescript
// app/fonts.ts（新建）
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
// ... 等
```

**关键文件**：
- 新建 `app/fonts.ts` — @fontsource 字体导入
- 修改 `app/layout.tsx` — 导入 fonts.ts
- 修改 `app/globals.css` — 删除 `@import url(...)` 行

---

## 4. 动画性能优化

> 当前状态：globals.css 中有 15+ 个 @keyframes 动画。framer-motion 已安装但只在 NowCard 中深度使用。

### 场景 4.1: 关键动画 GPU 合成
```
假设 (Given)  App 中存在高频或大面积的 CSS keyframe 动画（转场、Sheet、FAB）
当   (When)   动画播放
那么 (Then)   这些动画元素被提升为独立合成层
并且 (And)    动画帧率 ≥ 55fps（不阻塞主线程）
并且 (And)    只对确实掉帧的动画添加 will-change，不批量添加
```

### 场景 4.2: Sheet/Overlay 入场使用 spring 物理
```
假设 (Given)  用户触发一个 Sheet（如待办编辑、底部面板）
当   (When)   Sheet 入场
那么 (Then)   vaul Drawer 保持现有动画（已有 spring 手感）
并且 (And)    其他 Dialog 类弹窗入场使用 spring 参数（stiffness 300, damping 24）
并且 (And)    退场动画为 ease-in（无回弹，干脆消失）
```

### 场景 4.3: 列表首次加载 stagger 入场
```
假设 (Given)  用户首次进入列表页面（日记流/待办列表）
当   (When)   列表初次渲染
那么 (Then)   列表项按序依次入场（stagger 30ms）
并且 (And)    每项使用 translateY(8px) + opacity 0→1 的入场动画
并且 (And)    总持续时间不超过 400ms（超过 10 项后不再 stagger）
并且 (And)    后续滚动进入可视区域的新条目不播放入场动画（参见场景 2.10）
```

### 场景 4.4: 全局 prefers-reduced-motion 支持
```
假设 (Given)  用户设备开启了 prefers-reduced-motion
当   (When)   任何动画触发
那么 (Then)   globals.css 中添加全局媒体查询，禁用所有 CSS 动画
并且 (And)    framer-motion 组件通过 useReducedMotion() 禁用 spring/stagger
```

### 场景 4.5: 可交互元素按压缩放反馈
```
假设 (Given)  用户在移动端点击卡片（NoteCard、TaskItem、GoalCard）或按钮
当   (When)   手指按下
那么 (Then)   元素立即缩放至 scale(0.97)（80ms ease-out）
并且 (And)    手指抬起后恢复至 scale(1)
并且 (And)    配合已有的 haptic feedback（hapticsImpactLight），形成"视觉+触觉"双通道反馈
```
> 来源：UI/UX Pro Max `scale-feedback` — "Subtle scale (0.95-1.05) on press for tappable cards/buttons; restore on release"

### 场景 4.6: Sheet 从触发源动画（增强项，非 MVP）
```
假设 (Given)  用户点击 FAB 按钮创建内容
当   (When)   创建 Sheet 弹出
那么 (Then)   Sheet 从 FAB 按钮位置放大展开（scale+fade from trigger origin）
并且 (And)    建立操作的空间因果关系
```
> 来源：UI/UX Pro Max `modal-motion` — "Modals/sheets should animate from their trigger source for spatial context"
> 注意：此场景标记为 Phase C 增强项，需要记录触发元素坐标，不纳入 MVP。

### 实现方案

**a) GPU 合成（按需）**：

只对以下场景显式添加 `will-change: transform`：
- 页面转场容器元素
- Sheet/Overlay 入场动画容器
- FAB 呼吸/波纹动画

其余 CSS 动画已经只操作 `transform`/`opacity`，现代浏览器自动提升合成层，无需手动 hint。不使用 `translateZ(0)` hack（已过时）。

**b) 全局 reduced-motion**：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**c) 列表 stagger 动画**：

```typescript
// shared/lib/stagger-variants.ts（新建）
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};
export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};
```

使用时需要一个 `isInitialLoad` flag，确保只在首次加载时播放 stagger，滚动时不播放。

**d) 按压缩放反馈**：

```css
/* globals.css — 通用按压缩放 */
.pressable {
  transition: transform 80ms ease-out;  /* motion.duration.instant */
}
.pressable:active {
  transform: scale(0.97);
}
```

应用到：NoteCard、TaskItem、GoalCard、所有独立按钮。不应用到：输入框、文本区域、导航栏。

**关键文件**：
- 新建 `shared/lib/motion-tokens.ts` — 全局动画 token（Phase B 前置）
- 修改 `app/globals.css` — 添加 `@media (prefers-reduced-motion)` 全局规则 + 按需 will-change + `.pressable` 缩放
- 新建 `shared/lib/stagger-variants.ts` — stagger 动画配置（引用 motion tokens）
- 修改 `features/notes/components/notes-timeline.tsx` — 日记流首次加载 stagger 入场
- 修改 `features/todos/components/todo-workspace.tsx` — 待办列表首次加载 stagger 入场
- 修改 NoteCard、TaskItem、GoalCard 等卡片组件 — 添加 `.pressable` class

---

## 验收行为（E2E 锚点）

> 以下描述纯用户视角的操作路径，不涉及内部实现，用于生成独立的 E2E 测试。

### 行为 1: Tab 切换有过渡动画
1. 用户打开 App 首页
2. 用户点击底部导航切换到待办 tab
3. 日记淡出待办淡入（非瞬切），期间无白屏闪烁
4. 切回日记 tab，日记列表滚动位置保持不变

### 行为 2: Overlay 滑入滑出
1. 用户点击打开 goals overlay
2. Goals 页面从右侧滑入
3. 用户左边缘滑动返回
4. Goals 页面向右滑出，回到主页面

### 行为 3: 长列表滚动流畅
1. 用户有 200+ 条日记
2. 用户在首页快速上下滚动日记流
3. 滚动过程中无卡顿、无白屏区域
4. DOM 节点数量始终 < 30（可通过 DevTools 验证）

### 行为 4: 离线字体正常
1. 用户在飞行模式下打开 App
2. 所有文字以正确字体显示（Newsreader 标题、Inter/Noto 正文）
3. 无明显字体回退闪烁

### 行为 5: Sheet 入场有弹性
1. 用户点击创建待办
2. 创建 Sheet 从底部弹出，带有轻微回弹效果
3. 关闭时干脆下滑消失，无回弹

### 行为 6: 卡片按压有缩放反馈
1. 用户在日记流中按住一张日记卡片
2. 卡片立即缩小至 ~97%（视觉可感知）
3. 松手后恢复原始大小
4. 同时伴随轻微触觉震动

---

## 边界条件
- [ ] 快速连续 Tab 切换（< 300ms 间隔）不卡死
- [ ] Overlay 嵌套（goals → goal-detail）转场方向正确
- [ ] Android 低端设备（< 4GB RAM）虚拟滚动 overscan 需降低
- [ ] 虚拟滚动与下拉刷新的兼容性（scrollTop === 0 检测）
- [ ] 虚拟滚动与拖拽排序兼容（拖拽时临时增大 overscan）
- [ ] 虚拟滚动容器高度必须配合 --app-height CSS 变量
- [ ] 字体 woff2 文件在 Capacitor `out/` 目录中路径正确
- [ ] 字体子集化后罕见汉字 fallback 到系统字体（PingFang SC / Microsoft YaHei）
- [ ] prefers-reduced-motion 下所有新增动画禁用
- [ ] 深色模式下动画效果验证
- [ ] Electron 桌面端不需要虚拟滚动（列表规模小），但转场动画仍需
- [ ] Tab 切换使用 opacity 动画而非 mount/unmount，确保状态不丢失
- [ ] 所有动画期间 UI 保持可交互（no-blocking-animation）
- [ ] 所有交互的视觉反馈 < 100ms（input-latency budget）
- [ ] 虚拟滚动快速拖动时显示 skeleton 占位而非白屏
- [ ] 拖拽排序有明确的 threshold（防止与滚动冲突）
- [ ] .pressable 缩放反馈不应用于输入框和文本区域
- [ ] 所有动画参数引用 motion-tokens.ts，禁止散写魔数

## 依赖
- framer-motion ^12（已安装）
- @tanstack/react-virtual（新增）
- next/font/local（Next.js 内置）
- @use-gesture/react ^10（已安装，转场中可能启用）

## Implementation Phases (实施阶段)
- [x] Phase 0: Motion Design Tokens — `shared/lib/motion-tokens.ts`（Phase B/C 前置依赖）✅
- [x] Phase A: 字体本地化（@fontsource 本地加载替代 CDN）✅
- [x] Phase B: Tab fade-in + Overlay slide-in/out 转场动画 ✅
- [x] Phase C: reduced-motion + 按压缩放反馈 + stagger variants ✅
- [ ] Phase C+: Sheet 从触发源动画（增强项，非 MVP）
- [x] Phase D: 虚拟滚动（日记流已完成，待办/聊天后续迭代）✅
- [ ] Phase E（探索性）: View Transitions API — 当 Capacitor WKWebView 支持率足够时再评估

## 备注
- Phase 0 必须最先完成，所有后续动画参数从 motion-tokens.ts 引用
- Phase A 与 Phase 0 可并行（字体不依赖 motion tokens）
- Phase B/C 依赖 Phase 0，但彼此可并行
- Phase D（虚拟滚动）建议最后做，因为需要与拖拽排序、下拉刷新、stagger 动画等多个机制兼容
- SwipeBack 组件保持原生 touch 事件实现不变，Overlay 转场动画只控制 initial/animate/exit，手势进度联动由 SwipeBack 的 inline style 驱动
- Tab 切换动画必须保持双视图 DOM 同时挂载，禁止使用 AnimatePresence mount/unmount 模式
- Dialog 动画升级（CSS → framer-motion spring）需要配合 Radix Dialog 的 `forceMount` prop，作为 Phase C 的独立子任务评估
- 所有场景中标注了 `> 来源：UI/UX Pro Max` 的条目，源自 Apple HIG / Material Design 最佳实践审查

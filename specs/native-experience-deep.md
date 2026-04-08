---
id: "120"
title: "原生体验深度优化 — 路线A"
status: draft
domain: ui
risk: high
dependencies: ["mobile-native-feel.md"]
superseded_by: null
created: 2026-04-08
updated: 2026-04-08
---

# 原生体验深度优化 — 路线A

## 概述
在 spec 090（基础 WebView 原生化）的基础上，从转场动画、虚拟滚动、字体加载、GPU 合成四个维度进一步消除 WebView 与原生 App 的体感差距。目标：让用户无法从交互层面感知到这是一个 WebView 应用。

## 现有基础设施（已完成，本次不涉及）
- SwipeBack 组件 — `shared/components/swipe-back.tsx` ✅
- 触觉反馈 — `shared/lib/haptics.ts` ✅
- 下拉刷新 — `shared/hooks/use-pull-to-refresh.ts` ✅
- 键盘偏移 — `shared/hooks/use-keyboard-offset.ts` ✅
- Viewport 管理 — `components/layout/viewport-height-manager.tsx` ✅
- 全局 CSS 原生化（tap-highlight、touch-callout、overscroll）— globals.css ✅

---

## 1. 页面转场动画

> 当前状态：路由切换为瞬切，无任何过渡效果，是"网页感"最大来源。

### 场景 1.1: 主页面之间的路由切换
```
假设 (Given)  用户在首页（日记流）
当   (When)   用户点击底部导航切换到待办页
那么 (Then)   页面以 cross-fade（150ms ease-out）过渡
并且 (And)    过渡期间旧页面淡出、新页面淡入，无白屏闪烁
并且 (And)    底部导航栏本身不参与过渡（保持静止）
```

### 场景 1.2: 进入详情页（push 语义）
```
假设 (Given)  用户在待办列表中
当   (When)   用户点击某个待办打开详情 Sheet
那么 (Then)   详情页从右侧滑入（300ms spring: stiffness 300, damping 30）
并且 (And)    当前页面略微左移并缩小（parallax 效果，translateX -30%, scale 0.95, opacity 0.5）
并且 (And)    转场由 framer-motion AnimatePresence 驱动，支持手势中断
```

### 场景 1.3: 返回上一页（pop 语义）
```
假设 (Given)  用户在详情页
当   (When)   用户点击返回按钮或从左边缘滑动返回（SwipeBack）
那么 (Then)   详情页向右滑出
并且 (And)    下方页面从缩小状态恢复到正常
并且 (And)    手势驱动时，转场进度跟随手指位置实时联动
```

### 场景 1.4: View Transitions API 渐进增强
```
假设 (Given)  用户的 WebView 支持 View Transitions API（Chrome 111+ / iOS 18+）
当   (When)   发生路由切换
那么 (Then)   使用 View Transitions API 实现跨页面元素的连续性动画
并且 (And)    不支持 View Transitions 的设备自动降级到 framer-motion 方案
```

### 场景 1.5: 减少动画偏好
```
假设 (Given)  用户设备开启了 prefers-reduced-motion
当   (When)   发生任何路由切换
那么 (Then)   跳过所有转场动画，直接切换
```

### 接口约定

```typescript
// 转场类型
type TransitionType = 'crossfade' | 'push' | 'pop' | 'none';

// 在路由切换时由 layout 层决定转场类型
// - Tab 间切换 → crossfade
// - 进入子页面/Sheet → push
// - 返回 → pop
// - prefers-reduced-motion → none
```

### 实现方案

**方案选型**：framer-motion `AnimatePresence` + `motion.div` 包裹页面内容，不使用 Next.js App Router 内置的 `loading.tsx` 方案（它只处理 Suspense，不处理退出动画）。

```
app/layout.tsx
  └── <TransitionProvider>           ← 新增，检测路由变化+决定转场类型
        └── <AnimatePresence mode="wait">
              └── <motion.div key={pathname}>   ← 页面内容
```

**关键文件**：
- 新建 `shared/components/page-transition.tsx` — 转场 Provider + 动画包裹器
- 修改 `app/layout.tsx` — 接入 TransitionProvider
- 修改 `app/page.tsx` 等各页面 — 包裹 motion.div（或通过 layout 统一处理）

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
并且 (And)    拖拽排序、滑动操作在虚拟滚动下仍然正常
```

### 场景 2.3: 聊天消息虚拟滚动
```
假设 (Given)  用户有一个长对话（100+ 条消息）
当   (When)   用户上滑查看历史消息
那么 (Then)   消息列表使用虚拟滚动
并且 (And)    新消息到达时自动滚动到底部
并且 (And)    用户正在浏览历史时，新消息不打断滚动位置
```

### 场景 2.4: 动态高度条目
```
假设 (Given)  列表中的条目高度不固定（如日记内容长短不一）
当   (When)   虚拟滚动计算可视区域
那么 (Then)   使用 estimateSize + measureElement 动态测量真实高度
并且 (And)    首次渲染后缓存高度，避免重复测量
```

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
```

### 实现方案

**依赖**：新增 `@tanstack/react-virtual`

**关键文件**：
- 修改 `features/notes/components/notes-timeline.tsx` — 日记流虚拟化
- 修改 `features/todos/components/todo-workspace.tsx` — 待办列表虚拟化
- 修改 `features/chat/components/chat-view.tsx` — 聊天消息虚拟化
- 新建 `shared/hooks/use-virtual-list.ts` — 通用虚拟滚动 hook（封装 estimateSize + measureElement + overscan 等通用逻辑）

---

## 3. 字体加载优化

> 当前状态：4 个字体族通过 Google Fonts CDN `@import` 加载，是渲染阻塞资源。首屏需等字体下载完成才能正确显示，Capacitor 离线环境可能字体缺失。

### 场景 3.1: 首屏字体无闪烁
```
假设 (Given)  用户首次打开 App（冷启动）
当   (When)   页面渲染
那么 (Then)   文字从首帧即以正确字体显示，无 FOUT（Flash of Unstyled Text）
并且 (And)    字体从本地 bundle 加载，不依赖网络
```

### 场景 3.2: 离线环境字体正常
```
假设 (Given)  用户设备处于离线状态
当   (When)   打开 App
那么 (Then)   所有字体正常显示（来自本地）
并且 (And)    与在线环境视觉效果完全一致
```

### 场景 3.3: 字体子集化（CJK 优化）
```
假设 (Given)  Noto Sans SC / Noto Serif SC 完整文件各约 8MB
当   (When)   构建 App
那么 (Then)   使用 next/font 自动子集化，只包含常用字符
并且 (And)    中文字体按 unicode-range 分片加载
并且 (And)    总字体 bundle 体积控制在 2MB 以内
```

### 实现方案

**方案**：从 `@import url(Google Fonts CDN)` 迁移到 `next/font` 本地加载。

```typescript
// app/fonts.ts（新建）
import { Newsreader, Inter, Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google';

export const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
});

export const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  variable: '--font-noto-serif-sc',
  display: 'swap',
});
```

**注意**：Next.js 16 static export 模式下 `next/font/google` 会在构建时下载字体并内联到 CSS，不需要运行时网络请求。需验证 Capacitor 环境兼容性。

**关键文件**：
- 新建 `app/fonts.ts` — 字体定义
- 修改 `app/layout.tsx` — 应用字体 CSS 变量到 `<html>` className
- 修改 `app/globals.css` — 删除 `@import url(...)` 行，更新 `--font-*` 变量引用

---

## 4. 动画性能与 GPU 合成

> 当前状态：globals.css 中有 15+ 个 @keyframes 动画，大部分未添加 GPU 合成提示。framer-motion 已安装但严重低利用。

### 场景 4.1: 所有动画 GPU 合成
```
假设 (Given)  App 中存在 CSS keyframe 动画
当   (When)   动画播放
那么 (Then)   浏览器将动画元素提升为独立合成层
并且 (And)    动画帧率 ≥ 55fps（不阻塞主线程）
```

### 场景 4.2: Sheet/Overlay 入场使用 spring 物理
```
假设 (Given)  用户触发一个 Sheet（如待办编辑、底部面板）
当   (When)   Sheet 入场
那么 (Then)   使用 spring 物理动画（不是 linear/ease-out）
并且 (And)    回弹感（overshoot ~2%）让动画感知更"有质量"
并且 (And)    退场动画为 ease-in（无回弹，干脆消失）
```

### 场景 4.3: 列表项入场编排
```
假设 (Given)  用户进入一个列表页面（日记流/待办列表）
当   (When)   列表渲染
那么 (Then)   列表项按序依次入场（stagger 30ms）
并且 (And)    每项使用 translateY(8px) + opacity 0→1 的入场动画
并且 (And)    总持续时间不超过 400ms（超过 10 项后不再 stagger）
```

### 实现方案

**a) CSS 动画 GPU 提示**：

在 `globals.css` 中为所有 `@keyframes` 涉及 `transform` 或 `opacity` 的动画容器添加：
```css
.animate-xxx {
  will-change: transform, opacity;
  transform: translateZ(0); /* 强制合成层 */
}
```

**b) Sheet/Overlay 动画升级**：

当前 Sheet 使用 vaul（Drawer）和 shadcn Dialog，它们的动画是 CSS transition。考虑：
- vaul 的 Drawer 已有不错的 spring 手感，保持不变
- Dialog 入场添加 `animate-in zoom-in-95 duration-200` → 改为 framer-motion spring

**c) 列表 stagger 动画**：

```typescript
// shared/hooks/use-stagger-animation.ts（新建）
// 提供 stagger 入场的 variants 配置
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};
export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};
```

**关键文件**：
- 修改 `app/globals.css` — 添加 will-change + translateZ(0)
- 新建 `shared/hooks/use-stagger-animation.ts` — stagger 动画配置
- 修改 `features/notes/components/notes-timeline.tsx` — 日记流 stagger 入场
- 修改 `features/todos/components/todo-workspace.tsx` — 待办列表 stagger 入场

---

## 验收行为（E2E 锚点）

> 以下描述纯用户视角的操作路径，不涉及内部实现，用于生成独立的 E2E 测试。

### 行为 1: Tab 切换有过渡动画
1. 用户打开 App 首页
2. 用户点击底部导航切换到待办页
3. 页面以淡入淡出过渡（非瞬切），期间无白屏闪烁
4. 底部导航栏保持静止不参与动画

### 行为 2: 长列表滚动流畅
1. 用户有 200+ 条日记
2. 用户在首页快速上下滚动日记流
3. 滚动过程中无卡顿、无白屏区域
4. DOM 节点数量始终 < 30（可通过 DevTools 验证）

### 行为 3: 离线字体正常
1. 用户在飞行模式下打开 App
2. 所有文字以正确字体显示（Newsreader 标题、Inter/Noto 正文）
3. 无 FOUT 或字体回退现象

### 行为 4: Sheet 入场有弹性
1. 用户点击创建待办
2. 创建 Sheet 从底部弹出，带有轻微回弹效果
3. 关闭时干脆下滑消失，无回弹

---

## 边界条件
- [ ] iOS 15 WKWebView 不支持 View Transitions API — 降级到 framer-motion
- [ ] Android 低端设备（< 4GB RAM）虚拟滚动 overscan 需降低
- [ ] next/font 在 `output: 'export'` 模式下的行为验证
- [ ] 虚拟滚动与下拉刷新的兼容性（scrollTop === 0 检测）
- [ ] 虚拟滚动与拖拽排序的兼容性（待办排序场景）
- [ ] 字体子集化后罕见汉字是否缺失 — 需要 fallback 到系统字体
- [ ] prefers-reduced-motion 下所有新增动画禁用
- [ ] 深色模式下动画效果验证
- [ ] Electron 桌面端不需要虚拟滚动（列表规模小），但转场动画仍需
- [ ] Capacitor live reload 开发模式下字体加载路径是否正确

## 依赖
- framer-motion ^12（已安装）
- @tanstack/react-virtual（新增）
- next/font/google（Next.js 内置）
- View Transitions API（渐进增强，无硬依赖）
- @use-gesture/react ^10（已安装未使用，本次可能启用）

## Implementation Phases (实施阶段)
- [ ] Phase A: 字体本地化（最小侵入，最高确定性）
- [ ] Phase B: 页面转场动画（用户感知最大）
- [ ] Phase C: 动画性能 + GPU 合成（CSS 改动为主）
- [ ] Phase D: 虚拟滚动（最复杂，需逐组件改造）

## 备注
- Phase A-C 可以并行开发，互不依赖
- Phase D（虚拟滚动）建议最后做，因为需要与现有的拖拽排序、下拉刷新等交互兼容
- @use-gesture/react 已安装但未使用，当前 SwipeBack 用原生 touch 事件实现。如果转场动画需要更复杂的手势联动，可以在 Phase B 中引入
- 整体不改变架构（仍然是 Next.js static export + Capacitor），只在渲染和交互层优化

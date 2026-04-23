---
id: "113"
title: "键盘弹出 & Viewport 适配"
status: completed
domain: ui
risk: medium
dependencies: ["app-mobile-views.md", "chat-system.md", "mobile-native-feel.md"]
superseded_by: null
created: 2026-04-04
updated: 2026-04-04
implemented: 2026-04-04
---

# 键盘弹出 & Viewport 适配

## 概述

移动端（Capacitor WebView + 浏览器）软键盘弹出时，页面内容被推走、fixed 元素错位、输入框被遮挡。根本原因是各页面对键盘的处理不统一：部分用了 `useKeyboardOffset` 补偿，部分直接 body lock hack，部分完全没有处理。

本 spec 采用**方案 B：全局布局策略**，从根源统一处理，而非逐个组件打补丁。

### 技术背景（社区调研）

| 平台 | 键盘弹出时 viewport 行为 |
|------|------------------------|
| iOS Safari | `window.innerHeight` 不变，`visualViewport.height` 缩小，页面被整体上推 |
| Android Chrome | `window.innerHeight` 和 `visualViewport.height` 都缩小（adjustResize） |
| Capacitor iOS | 取决于 KeyboardResize 配置（默认 native = 不处理） |
| Capacitor Android | 默认 adjustResize |

社区主流方案：
- **React Native**: KeyboardAvoidingView（padding/height/position 三种 behavior）
- **Capacitor/Ionic**: Keyboard plugin `resize: "none"` + JS 自行管理
- **纯 Web/PWA**: `visualViewport` API 监听 + CSS 变量驱动容器高度
- **Telegram Web**: fixed 输入框 + visualViewport 补偿 + column-reverse 消息列表
- **W3C 提案**: `navigator.virtualKeyboard.overlaysContent` + `env(keyboard-inset-height)`（Chrome 94+，Safari 未支持，暂不可用）

**V2Note 选择**：Capacitor `KeyboardResize: "none"` + visualViewport 驱动全局 CSS 变量（与 Telegram Web 思路一致）

---

## 1. 全局 Viewport 高度管理

### 场景 1.1: CSS 变量 `--app-height` 跟随 visualViewport
```
假设 (Given)  App 在任意页面运行（移动端或 PC）
当   (When)   软键盘弹出或收起，visualViewport.height 变化
那么 (Then)   CSS 变量 `--app-height` 实时更新为 visualViewport.height（px）
并且 (And)    键盘收起时 `--app-height` 等于 100dvh
并且 (And)    CSS 变量 `--kb-offset` 实时更新为键盘占据的像素高度
并且 (And)    更新延迟 ≤ 1 帧（requestAnimationFrame）
```

**实现要点**：
- 在 app 根布局（`app/layout.tsx` 或全局 Provider）中挂载一个 `<ViewportHeightManager>` 组件
- 通过 `document.documentElement.style.setProperty('--app-height', ...)` 设置 CSS 变量
- 同时设置 `--kb-offset` 供 fixed 元素使用
- 复用现有 `useKeyboardOffset` hook 的核心逻辑，但输出到 CSS 变量而非 React state

```typescript
// shared/hooks/use-viewport-height.ts — 全局单例，挂载在根布局
function ViewportHeightManager() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      document.documentElement.style.setProperty('--app-height', '100dvh');
      return;
    }
    const update = () => {
      const h = vv.height;
      const offset = Math.max(0, window.innerHeight - vv.offsetTop - h);
      document.documentElement.style.setProperty('--app-height', `${h}px`);
      document.documentElement.style.setProperty('--kb-offset', `${offset}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return null;
}
```

### 场景 1.2: 页面容器使用 `--app-height` 而非 `min-h-dvh`
```
假设 (Given)  任意全屏页面容器
当   (When)   键盘弹出
那么 (Then)   容器高度自动缩小为 visualViewport 可见高度
并且 (And)    内容区域不被推出屏幕
并且 (And)    不出现页面级滚动（只有内容区内部滚动）
```

**需要修改的容器**：
| 文件 | 当前 | 改为 |
|------|------|------|
| `app/write/page.tsx` | `min-h-dvh` | `h-[var(--app-height)]` + `overflow-hidden` |
| `features/chat/components/chat-view.tsx` | body lock hack | `h-[var(--app-height)]` + `overflow-hidden` |
| `app/page.tsx`（移动端主页） | 检查是否有 dvh | `h-[var(--app-height)]` |

---

## 2. Capacitor 键盘配置

### 场景 2.1: 关闭原生 resize，统一由 JS 管理
```
假设 (Given)  App 运行在 Capacitor 原生壳中（iOS / Android）
当   (When)   软键盘弹出
那么 (Then)   WebView 尺寸不被系统调整（KeyboardResize = none）
并且 (And)    键盘覆盖在 WebView 之上
并且 (And)    由 ViewportHeightManager 通过 visualViewport 计算偏移
```

**修改**：`capacitor.config.ts` 添加：
```typescript
plugins: {
  Keyboard: {
    resize: "none",       // 关闭原生 resize，iOS/Android 行为统一
    style: "DEFAULT",
    scroll: false,        // 禁止 WebView 自动滚动到 input
  },
  // ...existing plugins
}
```

---

## 3. `<BottomFixed>` 通用包装组件

### 场景 3.1: 所有底部固定元素自动跟随键盘
```
假设 (Given)  页面有 fixed 定位在底部的元素（输入栏/FAB/操作面板等）
当   (When)   键盘弹出
那么 (Then)   该元素自动上移，始终紧贴键盘顶部
并且 (And)    键盘收起后元素回到底部
并且 (And)    过渡平滑（CSS transition 150ms）
```

**实现**：
```typescript
// components/layout/bottom-fixed.tsx
interface BottomFixedProps {
  children: React.ReactNode;
  className?: string;
  zIndex?: number;          // 默认 z-40
  withSafeArea?: boolean;   // 默认 true，添加 pb-safe
}

function BottomFixed({ children, className, zIndex = 40, withSafeArea = true }: BottomFixedProps) {
  return (
    <div
      className={cn(
        "fixed left-0 right-0",
        withSafeArea && "pb-safe",
        className
      )}
      style={{
        bottom: 'var(--kb-offset, 0px)',
        zIndex,
        transition: 'bottom 150ms ease-out',
      }}
    >
      {children}
    </div>
  );
}
```

### 场景 3.2: 迁移所有裸 fixed bottom 元素到 BottomFixed
```
假设 (Given)  开发者需要在底部放置固定元素
当   (When)   使用 <BottomFixed> 组件
那么 (Then)   无需手动接入 useKeyboardOffset
并且 (And)    键盘适配自动生效
```

**已迁移的组件**（实际迁移直接使用 `var(--kb-offset)` 内联样式，而非包装组件，更轻量）：
| 文件 | 原做法 | 迁移结果 |
|------|---------|---------|
| `features/recording/components/input-bar.tsx` | `fixed bottom-0` + useKeyboardOffset | `bottom: var(--kb-offset)` + 移除 hook |
| `features/recording/components/fab.tsx` | `fixed bottom-[54px]` | `bottom: calc(54px + var(--kb-offset))` |
| `features/action-panel/components/action-panel.tsx` | `fixed inset-x-0 bottom-0` | `bottom: var(--kb-offset)` |
| `features/action-panel/components/now-card.tsx` | `fixed inset-x-0 bottom-0` | `bottom: var(--kb-offset)` |
| `features/notes/components/notes-timeline.tsx` | `fixed bottom-0` | `bottom: var(--kb-offset)` |
| `features/todos/components/todo-edit-sheet.tsx` | useKeyboardOffset + `bottom: kbOffset` | `bottom: var(--kb-offset)` + 移除 hook |
| `features/todos/components/todo-create-sheet.tsx` | useKeyboardOffset + `bottom: kbOffset` | `bottom: var(--kb-offset)` + 移除 hook |
| `features/chat/components/chat-view.tsx` 输入区 | useKeyboardOffset + `bottom: bottomOffset` | `bottom: var(--kb-offset)` |
| `features/chat/components/counselor-chat.tsx` | useKeyboardOffset + viewportHeight | `height: var(--app-height)` + 移除 hook |
| `app/write/page.tsx` toast | `fixed bottom-8` | `bottom: calc(2rem + var(--kb-offset))` |

---

## 4. 删除 body lock hack

### 场景 4.1: ChatView 不再锁定 body position
```
假设 (Given)  用户打开聊天页面
当   (When)   聊天页面挂载
那么 (Then)   不设置 document.body.style.position = "fixed"
并且 (And)    聊天容器自身为 `h-[var(--app-height)] overflow-hidden` 的独立滚动区
并且 (And)    消息列表在容器内独立滚动
```

**修改**：删除 `chat-view.tsx` 第 103-119 行的 body lock useEffect，改为容器级 overflow 控制。

### 场景 4.2: ChatInputBar 从 sticky 改为 BottomFixed 内嵌或容器底部 flex
```
假设 (Given)  聊天页面使用 flex column 布局
当   (When)   键盘弹出
那么 (Then)   消息列表区域缩小（flex-1 shrink）
并且 (And)    输入栏始终固定在容器底部
并且 (And)    不需要额外的 keyboard offset 计算（容器高度已跟随 --app-height）
```

**注意**：ChatInputBar 在 chat-view 容器内部，容器本身已经是 `h-[var(--app-height)]`，所以输入栏用 flex 布局自然在底部，无需 fixed 定位。这是最干净的方案。

---

## 5. 写作页适配

### 场景 5.1: 写作页 textarea 键盘弹出不推页面
```
假设 (Given)  用户在写作页（/write）编辑文本
当   (When)   textarea 获得焦点，键盘弹出
那么 (Then)   页面容器高度缩小为 visualViewport 高度
并且 (And)    textarea 区域自动适应剩余空间（flex-1 + overflow-y-auto）
并且 (And)    光标位置始终可见（不被键盘遮挡）
并且 (And)    状态栏（底部 sticky）保持在可见区域底部
```

**修改**：
```
当前: <div className="min-h-dvh bg-cream flex flex-col">
改为: <div className="h-[var(--app-height)] bg-cream flex flex-col overflow-hidden">

textarea 容器: <div className="relative flex-1 overflow-y-auto">
```

---

## 6. useKeyboardOffset hook 的未来

### 场景 6.1: hook 保留但已无调用方
```
假设 (Given)  useKeyboardOffset hook 定义在 shared/hooks/use-keyboard-offset.ts
当   (When)   全局 CSS 变量方案上线后
那么 (Then)   hook 文件保留（避免 break 外部引用），但所有组件已迁移到 CSS 变量
并且 (And)    新代码禁止使用 useKeyboardOffset，统一用 var(--kb-offset) / var(--app-height)
```

**实际状态**：所有 useKeyboardOffset 调用已在 Phase 4 清理完毕，hook 文件保留供向后兼容。

---

## 边界条件

- [ ] iOS Safari（浏览器直接访问）：visualViewport 可用，方案生效
- [ ] Android Chrome（浏览器直接访问）：adjustResize + visualViewport，方案生效
- [ ] Capacitor iOS（KeyboardResize: none）：行为与浏览器一致
- [ ] Capacitor Android（KeyboardResize: none）：需验证 visualViewport 在 none 模式下是否正常触发
- [ ] 外接蓝牙键盘（无软键盘）：--app-height = 100dvh，无影响
- [ ] 横屏模式：visualViewport 正常反映，方案自适应
- [ ] split-screen / floating window（Android）：visualViewport 正常反映
- [ ] 输入法候选栏高度变化（如切换语言）：visualViewport 会触发 resize
- [ ] PC 端浏览器：无软键盘，--app-height = 100dvh，无副作用
- [ ] visualViewport 不可用的极端旧浏览器：fallback 到 100dvh
- [ ] textarea 内容超长：flex-1 + overflow-y-auto 确保可滚动
- [ ] 快速连续 focus/blur（如 tab 切换输入框）：requestAnimationFrame 节流防闪烁

## 依赖

- `visualViewport` API（Chrome 61+、Safari 13+，覆盖 99%+ 用户）
- `@capacitor/keyboard` plugin（配置 resize: none）
- 现有 `shared/hooks/use-keyboard-offset.ts`（复用核心逻辑）

## Implementation Phases (实施阶段)

- [x] **Phase 1: 基础设施** — ViewportHeightManager 组件 + CSS 变量 `--app-height` / `--kb-offset` + Capacitor keyboard 配置
- [x] **Phase 2: BottomFixed 组件 + 底部 fixed 迁移** — 创建 BottomFixed 组件；input-bar / fab / action-panel / now-card / notes-timeline / todo-edit-sheet / todo-create-sheet / write-toast 全部改用 `var(--kb-offset)`
- [x] **Phase 3: 页面容器迁移** — write 页 / chat-view / counselor-chat / 移动端主页 从 dvh 改为 `var(--app-height)`
- [x] **Phase 4: 删除 hack + 清理** — 移除 chat-view body lock hack；移除所有组件对 useKeyboardOffset 的直接调用（hook 保留但已无调用方）
- [ ] **Phase 5: 四端验证** — iOS Safari / Android Chrome / Capacitor iOS / Capacitor Android 逐一验证（待真机测试）

## 备注

- 本方案与社区主流（Telegram Web、Ionic resize:none 模式）一致，经过大规模验证
- CSS `env(keyboard-inset-height)` 是未来理想方案，但 Safari 未支持，暂不采用
- `--app-height` 变量名选择：避免与 Tailwind 的 `h-dvh` / `h-screen` 冲突，语义明确
- 迁移过程中 `useKeyboardOffset` hook 保持兼容，不会 break 未迁移的组件
- body lock hack（chat-view 中的 position:fixed）是 iOS 键盘问题的常见 workaround，但与 visualViewport 方案冲突，必须删除

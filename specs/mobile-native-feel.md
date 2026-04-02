# 移动端原生体感优化

> 状态：🟡 待开发

## 概述
Capacitor 嵌入 WebView 的页面存在系统性的"网页感"体验断裂。本 spec 从六个维度全面修复，让交互感知从"浏览器网页"升级到"原生 App"。

---

## 问题 A：可点击元素文本可选择（select-none）

### 场景 A1: 侧边栏聚类树节点快速点击
```
假设 (Given)  用户在移动端打开侧边栏，看到聚类树结构
当   (When)   用户快速点击某个聚类节点（如"供应链管理"）
那么 (Then)   该节点触发导航/展开操作
并且 (And)    文字不会被选中高亮（无蓝色选区）
```

### 场景 A2: 待办条目点击
```
假设 (Given)  用户在待办列表中看到多个任务条目
当   (When)   用户点击某条待办的文字区域
那么 (Then)   触发待办详情/操作，而非选中文字
并且 (And)    长按仍可触发系统级文字选择（如需要复制）
```

### 场景 A3: 甘特图时间块点击
```
假设 (Given)  用户在今日甘特视图中看到时间块
当   (When)   用户点击某个时间块
那么 (Then)   触发完成切换操作
并且 (And)    时间块上的文字不会被选中
```

### 涉及组件清单

| 组件 | 文件 | 状态 |
|------|------|------|
| MyWorldTreeNode | `features/sidebar/components/sidebar-drawer.tsx:401` | ✅ 已修复 |
| SidebarItem | `features/sidebar/components/sidebar-drawer.tsx:711` | ✅ 已修复 |
| 发现按钮 | `features/sidebar/components/sidebar-drawer.tsx:191` | ✅ 已修复 |
| TaskItem | `features/todos/components/task-item.tsx:57` | ✅ 已修复 |
| ProjectCard MiniTaskRow | `features/todos/components/project-card.tsx:133` | ✅ 已修复 |
| TodayGantt 时间块 | `features/todos/components/today-gantt.tsx:149,213` | ✅ 已修复 |
| ChatView command chips | `features/chat/components/chat-view.tsx:267` | 🟡 待修复 |
| ChatView skill chips | `features/chat/components/chat-view.tsx:293` | 🟡 待修复 |
| NoteCard 操作按钮 | `features/notes/components/note-card.tsx` | 🟡 待修复 |

### 实现方案
- 为所有含 `cursor-pointer` + `onClick` 的非内容元素添加 `select-none`
- **不影响**：输入框、文本内容区域（消息气泡、笔记正文）保持可选中

---

## 问题 B：Chat 标题"和路路聊天"被滚动翻走

### 场景 B1: 消息列表滚动时标题保持可见
```
假设 (Given)  用户在 Chat 界面已有多条对话消息
当   (When)   用户向上滑动查看历史消息
那么 (Then)   顶部 header（"和路路聊聊" + 返回按钮）始终固定在屏幕顶部
并且 (And)    header 下方有毛玻璃分隔效果，内容从 header 下方滚入滚出
```

### 场景 B2: 键盘弹出时标题不移位
```
假设 (Given)  用户在 Chat 界面
当   (When)   用户点击底部输入框，输入法弹出
那么 (Then)   顶部 header 仍然固定在屏幕顶部，不随视口变化移动
并且 (And)    消息区域自动缩小适配剩余空间
```

### 当前问题分析
`features/chat/components/chat-view.tsx` 结构：
```
<SwipeBack>
  <div fixed inset-0 flex-col>     ← 键盘弹出时 inset-0 的"底"变化
    <header shrink-0>               ← 跟着外壳被推
    <div flex-1 overflow-y-auto>    ← 消息区域
    <div h-[72px] spacer>
  </div>
  <div fixed bottom input-bar>      ← 已用 visualViewport 跟随键盘 ✅
</SwipeBack>
```
根因：iOS WebView 键盘弹出时，`position: fixed; inset: 0` 的容器高度被浏览器压缩。

### 实现方案
将 header 抽为独立 fixed 层，容器高度用 `visualViewport.height` 动态同步：
```
<header fixed top-0 z-40>                    ← 独立固定层，不受容器影响
<div style={{ height: viewportHeight }}>     ← JS 驱动高度
  <div pt-[header高度] flex-1 overflow-y-auto>
</div>
<div fixed bottom input-bar>
```

同样受影响的组件：`features/chat/components/counselor-chat.tsx`

---

## 问题 C：Chat 输入法弹出顶走上下文

### 场景 C1: 输入法弹出时消息区域平滑适配
```
假设 (Given)  用户在 Chat 界面浏览消息
当   (When)   用户点击输入框，输入法从底部弹出
那么 (Then)   消息区域高度平滑缩小，最新消息仍可见
并且 (And)    输入栏紧贴键盘顶部
并且 (And)    顶部 header 不移动
```

### 场景 C2: 输入法收起时恢复
```
假设 (Given)  用户正在输入，键盘已弹出
当   (When)   用户点击发送或收起键盘
那么 (Then)   消息区域高度恢复，布局无跳动
```

### 当前问题分析
现有 `visualViewport` 监听只调整输入栏的 `bottom` 偏移，没有同步消息区域高度：
- 输入栏跟着键盘走了 ✅
- 消息区域底部被键盘遮住 ❌
- 最新消息看不到 ❌

### 实现方案
```tsx
const [containerHeight, setContainerHeight] = useState('100dvh');

useEffect(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const offset = window.innerHeight - vv.offsetTop - vv.height;
    setBottomOffset(Math.max(0, offset));
    setContainerHeight(`${vv.height}px`);  // 同步容器高度
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
}, []);
```
键盘弹出后自动触发 `scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })`。

---

## 问题 D：全局 WebView 原生感缺失（tap highlight / touch callout / overscroll）

### 场景 D1: 点击按钮出现蓝色/灰色高亮闪烁
```
假设 (Given)  用户在移动端使用 App
当   (When)   用户点击任何按钮或链接
那么 (Then)   不出现浏览器默认的蓝色/灰色点击高亮
并且 (And)    按钮有自定义的 active 按压态（opacity 或 scale 变化）
```

### 场景 D2: 长按图片/链接弹出系统菜单
```
假设 (Given)  用户在移动端使用 App
当   (When)   用户长按非内容区域的图片或链接
那么 (Then)   不弹出浏览器默认的"在新标签页打开/复制链接"菜单
```

### 场景 D3: 页面边缘橡皮筋回弹
```
假设 (Given)  用户在页面顶部或底部
当   (When)   用户继续向上/下拉动
那么 (Then)   不出现浏览器默认的橡皮筋回弹效果
并且 (And)    滚动容器内部的 overscroll 行为保持正常（不外泄到父层）
```

### 当前状态
- `-webkit-tap-highlight-color`: ❌ 未设置
- `-webkit-touch-callout`: ❌ 未设置
- `overscroll-behavior`: ❌ 未设置
- 按钮 `active` 态：部分有（侧边栏 `active:bg-surface/80`），大量缺失

### 实现方案 — 在 `app/globals.css` 添加全局基础层

```css
/* ============================================
   NATIVE APP FEEL — WebView 原生化
   ============================================ */

/* 消除浏览器默认点击高亮 */
* {
  -webkit-tap-highlight-color: transparent;
}

/* 禁止非内容区域长按菜单 */
body {
  -webkit-touch-callout: none;
}

/* 内容区域保持可选可长按 */
.selectable,
[contenteditable="true"],
textarea,
input {
  -webkit-touch-callout: default;
  user-select: text;
}

/* 阻止页面级橡皮筋回弹 */
html, body {
  overscroll-behavior: none;
}

/* 滚动容器：包含 overscroll，启用惯性滚动 */
.overflow-y-auto,
.overflow-x-auto,
.overflow-auto {
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
```

---

## 问题 E：`100vh` / `h-screen` 在移动端键盘弹出时溢出

### 场景 E1: 含输入框的全屏页面
```
假设 (Given)  用户在使用含输入框的全屏页面（写作/地图/时间轴）
当   (When)   键盘弹出
那么 (Then)   页面高度正确适配可视区域，不出现底部内容被遮挡
```

### 当前问题
以下页面使用 `100vh` 或 `h-screen`（不感知键盘），键盘弹出时布局溢出：

| 文件 | 行号 | 当前值 | 应改为 |
|------|------|--------|--------|
| `app/map/page.tsx` | 219,506 | `calc(100vh - 2.5rem)` | `calc(100dvh - 2.5rem)` |
| `app/timeline/page.tsx` | ~105 | `h-screen` | `min-h-dvh` |
| `app/write/page.tsx` | ~555 | `min-h-screen` | `min-h-dvh` |

以下页面已正确使用 `dvh` ✅：
- `app/page.tsx` — `min-h-dvh`
- `features/daily/components/morning-briefing.tsx` — `min-h-dvh`
- `features/settings/components/settings-editor.tsx` — `min-h-dvh`
- `features/auth/components/login-page.tsx` — `min-h-dvh`
- `features/todos/components/today-gantt.tsx` — `min-h-dvh`
- 以及其他 10+ 组件

---

## 问题 F：底部 Sheet/按钮被键盘遮挡

### 场景 F1: 编辑待办时键盘遮住保存按钮
```
假设 (Given)  用户打开待办编辑 Sheet
当   (When)   用户点击输入框编辑内容，键盘弹出
那么 (Then)   Sheet 底部的保存按钮仍然可见可点击
并且 (And)    Sheet 内容可滚动查看
```

### 当前问题
以下底部组件缺少 `visualViewport` 键盘偏移处理：

| 组件 | 文件 | 严重程度 |
|------|------|----------|
| todo-edit-sheet | `features/todos/components/todo-edit-sheet.tsx` | 🔴 P0 — 编辑时键盘遮住输入区 |
| todo-create-sheet | `features/todos/components/todo-create-sheet.tsx` | 🔴 P0 — 创建时键盘遮住输入区 |
| input-bar (FAB) | `features/recording/components/input-bar.tsx` | 🔴 P0 — 录入栏被键盘覆盖 |
| floating-record-button | `features/recording/components/floating-record-button.tsx` | 🟡 P1 — 按钮被遮住 |
| FAB 菜单 | `features/recording/components/fab.tsx` | 🟡 P1 — 菜单被遮住 |
| now-card skip sheet | `features/action-panel/components/now-card.tsx` | 🟡 P1 — Sheet 被遮住 |
| goal-list create dialog | `features/goals/components/goal-list.tsx` | 🟡 P1 — 对话框被遮住 |

已正确处理的组件 ✅：
- `features/chat/components/chat-view.tsx` — visualViewport ✅
- `features/recording/components/text-bottom-sheet.tsx` — visualViewport ✅
- `features/recording/components/unified-input.tsx` — visualViewport ✅
- `features/cognitive/components/onboarding-seed.tsx` — visualViewport ✅

### 实现方案
提取通用 Hook `useKeyboardOffset`：
```tsx
function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setOffset(Math.max(0, window.innerHeight - vv.offsetTop - vv.height));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return offset;
}
```
在所有底部 fixed 组件中使用 `style={{ bottom: offset }}` 或 `style={{ paddingBottom: offset }}`。

---

## 问题 G：按钮缺少触摸按压反馈（hover-only）

### 场景 G1: 移动端按钮点击无视觉反馈
```
假设 (Given)  用户在移动端点击一个按钮
当   (When)   手指按下
那么 (Then)   按钮立即出现按压态视觉变化（颜色加深/缩放/透明度变化）
并且 (And)    手指抬起后恢复，给用户"按到了"的确认感
```

### 当前问题
大量按钮只有 `hover:bg-xxx` 而没有 `active:` 状态，移动端 hover 不触发，导致按下去"没反应"。

主要缺失区域：
- `features/chat/components/chat-view.tsx` — skill/command chips（只有 hover）
- `features/chat/components/plan-card.tsx` — 对话框按钮
- `features/notes/components/note-card.tsx` — 操作按钮
- `features/todos/components/calendar-strip.tsx` — 日历日期按钮
- `features/recording/components/input-bar.tsx` — 工具栏按钮

### 实现方案
所有 `hover:bg-xxx` 同时添加对应的 `active:bg-xxx`（更深一级），或统一添加 `active:scale-[0.97]` 作为通用触摸反馈。

---

## 问题 H：输入框缺少移动端优化属性

### 场景 H1: 搜索框键盘类型不正确
```
假设 (Given)  用户点击搜索输入框
当   (When)   输入法弹出
那么 (Then)   键盘右下角显示"搜索"按钮（而非"换行"）
```

### 当前问题
| 组件 | 文件 | 缺失属性 |
|------|------|----------|
| 搜索框 | `features/search/components/global-search.tsx` | `inputMode="search"` `enterKeyHint="search"` |
| Chat 输入 | `features/chat/components/chat-view.tsx` | `enterKeyHint="send"` |
| 录入栏 | `features/recording/components/input-bar.tsx` | `enterKeyHint="send"` |

### 实现方案
- 搜索框：添加 `inputMode="search"` + `enterKeyHint="search"`
- 聊天/录入框：添加 `enterKeyHint="send"`
- 所有输入框确保 `font-size >= 16px`（防止 iOS 自动缩放）

---

## 边界条件
- [ ] iOS Safari / iOS WKWebView：`visualViewport` + `dvh` 兼容性
- [ ] Android WebView：不同厂商键盘高度差异
- [ ] Capacitor `safe-area-inset-top` 与 Android `overlaysWebView: false` 的交互
- [ ] 快速连续点击不触发文本选择
- [ ] 深色模式下所有改动正常
- [ ] 输入框 focus/blur 快速切换无布局抖动
- [ ] 横屏/分屏模式布局正确
- [ ] 输入框 font-size >= 16px（防 iOS 缩放）

## 依赖
- Capacitor WebView 环境
- CSS `dvh` 单位（iOS 15.4+、Chrome 108+）
- `window.visualViewport` API
- viewport meta: `width=device-width, maximum-scale=1, user-scalable=no, viewport-fit=cover`（✅ 已配置）

## 实施优先级

| 优先级 | 问题 | 影响范围 | 工作量 |
|--------|------|----------|--------|
| P0 | D: 全局 CSS 原生化 | 全 App | 小 — 仅改 globals.css |
| P0 | B+C: Chat 键盘/标题 | Chat 页 | 中 — 重构 ChatView 布局 |
| P0 | F: 底部 Sheet 键盘遮挡 | 3 个 Sheet | 中 — 提取 Hook + 应用 |
| P1 | E: vh → dvh | 3 个页面 | 小 — 文本替换 |
| P1 | A: 剩余 select-none | 3 个组件 | 小 |
| P2 | G: active 按压态 | 全 App 按钮 | 中 — 逐组件添加 |
| P2 | H: 输入框属性 | 3 个输入框 | 小 |

## 备注
- 问题 A 的主要组件已在本次会话中修复
- 问题 D 的全局 CSS 是最高 ROI 的改动——一次修改影响全 App
- 问题 F 建议提取 `useKeyboardOffset` Hook 复用，避免每个组件重复写 visualViewport 逻辑
- Ionic Framework 的 `ion-content` 内部也是用 `visualViewport.height` 驱动容器高度，验证了方案 B+C 的可行性

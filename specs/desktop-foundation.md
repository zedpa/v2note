---
id: "130"
title: "Desktop Canvas Shell — Foundation"
status: draft
domain: ui
risk: high
dependencies: ["120", "110"]
superseded_by: null
created: 2026-04-17
updated: 2026-04-17
---

# Desktop Canvas Shell — Foundation（桌面画布壳·地基）

## 概述
为 V2Note PC 桌面端铺设"Canvas Shell"最底层地基：桌面专属布局容器（Dock + Canvas + Insight Panel 三槽位）、全局命令面板（Cmd+K）、桌面媒体查询约定。本 spec **不**重复定义运动 token（复用 spec 120 `shared/lib/motion-tokens.ts`），只声明桌面场景下的组合规则。不实现具体编辑器与图表，只交付让后续 P1/P3/P4 能稳定拼装的壳。解决当前"PC 端 = 移动容器化 + Electron 空壳"的硬伤。

## ⚠️ 本 spec 的边界

本 spec **只做**：
- 桌面断点约定（Tailwind `desktop:` variant，`@media (min-width: 1280px) and (pointer: fine)`）
- 桌面布局外壳 `<DesktopLayout>`（Dock/Canvas/Insight 三槽位 + 可拖拽分隔线 + 折叠持久化）
- 全局命令面板 `<CommandPalette>`（Cmd+K 触发，基础搜索 + 跳转 + 新建 + 上下文加权）
- 桌面场景下 motion token 的组合约定（复用 spec 120 定义）

本 spec **不做**：
- 不替换 `/write` 当前 textarea（P1 Lexical Canvas Editor 接手）
- 不生成图表（P3 Insight Studio 接手）
- 不接 Electron 原生菜单/托盘/全局快捷键（P4 Electron Native 接手），Cmd+K 先在网页端工作
- 不实现多 tab / 分屏（Canvas Shell v0 中的多 tab 概念延后至独立 spec）
- 不重复定义 motion token（引用 spec 120）

## 1. 桌面场景的 Motion Token 组合约定

> 本节只声明"桌面布局在什么场景下用 spec 120 的哪个 token"，不新建文件、不新增接口。

### 场景 1.1：用户看到 Insight Panel 折叠动画
```
假设 (Given)  用户在桌面端三栏布局下
当   (When)   用户点击 Insight Panel 折叠按钮
那么 (Then)   Panel 以柔和的弹性节奏（复用 motion.spring.gentle）滑出屏幕
并且 (And)    Canvas 宽度扩展的节奏与 Panel 滑出保持同步，无错位感
```

### 场景 1.2：用户在减少动态效果偏好下操作桌面
```
假设 (Given)  用户的操作系统已开启"减少动态效果"偏好
当   (When)   用户在桌面端触发任意布局动画（折叠 Panel / 打开 Cmd+K）
那么 (Then)   面板即时出现于最终位置，不再播放弹性形变
并且 (And)    hover、focus 的视觉反馈仍然正确，不受影响
```

### 场景 1.3：用户看到快速连续触发的动画不堆叠
```
假设 (Given)  用户刚刚折叠了 Insight Panel，动画尚未结束
当   (When)   用户立即再次点击展开
那么 (Then)   正在进行的折叠动画被优雅中断，反向插值到展开态
并且 (And)    用户不会看到"先完成折叠再展开"的双段等待
```

## 2. 桌面断点与 Tailwind Variant

### 场景 2.1：用户在大屏 Mac 上看到桌面级界面
```
假设 (Given)  用户使用 15 寸 Mac（1600px 宽，鼠标指针）
当   (When)   用户在 Chrome 中打开 V2Note
那么 (Then)   页面呈现多列布局、细间距、hover 反馈
并且 (And)    鼠标悬停可点击元素时出现明确的视觉提示
```

### 场景 2.2：用户在 iPad 上打开宽屏页面
```
假设 (Given)  用户使用 iPad（12.9 寸 Pro，触屏，1366px 宽）
当   (When)   用户在 Safari 中打开 V2Note
那么 (Then)   即使宽度超过 1280px，页面仍呈现触屏友好布局（大点击区、无 hover 依赖）
并且 (And)    不出现只能鼠标悬停才能发现的功能
```

### 场景 2.3：用户在触屏笔记本上切换输入方式
```
假设 (Given)  用户使用带触屏的 Windows 笔记本，当前仅用触屏
当   (When)   用户接入一只鼠标
那么 (Then)   页面的可点击元素开始响应鼠标悬停，出现精细的 hover 反馈
并且 (And)    用户拔掉鼠标后，这些 hover 反馈消失，页面恢复为触屏友好状态
并且 (And)    切换前后当前滚动位置与页面内容保持不变
```

### 场景 2.4：用户拖动窗口跨越断点
```
假设 (Given)  用户在桌面三栏布局下
当   (When)   用户将窗口从 1600px 宽拖到 900px 宽
那么 (Then)   Insight Panel 自动收起为右侧图标条
并且 (And)    Canvas 区保持主视觉焦点，不出现元素挤压变形
```

### 场景 2.5：用户进一步缩小到移动尺寸
```
假设 (Given)  用户窗口已收窄到 720px（低于桌面断点）
当   (When)   用户继续使用
那么 (Then)   Dock 从左侧窄条变为底部 Tab Bar，整体进入移动布局
并且 (And)    当前 Canvas 的内容、滚动位置、编辑状态都不丢失
```

## 3. 桌面布局外壳 DesktopLayout

### 场景 3.1：用户首次看到三槽位布局
```
假设 (Given)  用户首次在桌面端（≥1280px 且鼠标）登录 V2Note
当   (When)   用户进入首页
那么 (Then)   屏幕从左到右依次出现 Dock（窄条导航）、Canvas（主工作区）、Insight Panel（右侧洞察栏）
并且 (And)    三个区域之间有 1 像素发光分隔线，鼠标靠近时分隔线变亮以提示可拖拽
```

### 场景 3.2：用户拖拽分隔线调整比例
```
假设 (Given)  用户已打开三栏布局
当   (When)   用户按住 Canvas 与 Insight Panel 之间的分隔线向左拖动
那么 (Then)   Insight Panel 变宽，Canvas 相应变窄
并且 (And)    松开后该比例被记住，下次进入保持一致
```

### 场景 3.3：用户收起 Insight Panel 进入专注模式
```
假设 (Given)  用户想专注写作
当   (When)   用户点击 Insight Panel 左上角的折叠按钮
那么 (Then)   Insight Panel 以柔和弹性动画滑出屏幕右侧
并且 (And)    Canvas 平滑扩展至全宽
并且 (And)    屏幕右边缘保留一条细触发区，鼠标悬停可重新拉出 Insight
并且 (And)    刷新后收起状态被保留
```

### 场景 3.4：用户悬停 Dock 看到标签提示
```
假设 (Given)  Dock 当前仅显示图标
当   (When)   用户将鼠标悬停在任意 Dock 图标上 200ms
那么 (Then)   图标右侧淡入文字标签（如"写作""时光线""洞察"）
并且 (And)    鼠标移开后标签淡出，不留残影
```

### 场景 3.5：用户拖拽分隔线到极端位置
```
假设 (Given)  用户正在调整 Canvas 与 Insight Panel 的分隔线
当   (When)   用户把分隔线继续向 Canvas 一侧拖拽，Canvas 预计将小于 480px
那么 (Then)   分隔线在达到最小宽度时吸附停顿，Canvas 不会被压缩到不可用
并且 (And)    松开后比例保持在最小可用宽度，而非恢复原位
```

### 场景 3.6：用户在隐身模式下调整布局
```
假设 (Given)  用户在浏览器无痕/隐身模式下打开 V2Note
当   (When)   用户调整栏宽或折叠 Insight Panel
那么 (Then)   当前会话中布局按用户操作变化
并且 (And)    关闭并重新打开无痕窗口后，布局回到默认值，不出现报错或白屏
```

### 场景 3.7：用户把窗口拖到副显示器
```
假设 (Given)  用户的主显示器为 Retina（高 DPI），副显示器为标准 DPI
当   (When)   用户把 V2Note 窗口从主屏拖到副屏
那么 (Then)   分隔线、触发条、Dock 图标在新 DPI 下保持清晰且可交互
并且 (And)    Panel 的折叠/展开状态不因显示器切换被重置
```

## 4. 全局命令面板 CommandPalette（Cmd+K）

### 场景 4.1：用户召唤命令面板
```
假设 (Given)  用户正停留在桌面端任意页面
当   (When)   用户按下 Cmd+K（Windows 为 Ctrl+K）
那么 (Then)   屏幕中央偏上淡入一个命令输入框
并且 (And)    输入框默认聚焦，背后主界面被磨砂遮罩轻度模糊
并且 (And)    浏览器地址栏不被激活（V2Note 页面内拦截了此快捷键）
```

### 场景 4.2：用户输入文字过滤候选
```
假设 (Given)  命令面板已打开
当   (When)   用户输入"写"
那么 (Then)   候选列表显示"新建日记""打开写作画布""写入今日待办"等语义匹配条目
并且 (And)    每条候选右侧显示其键盘提示（如 Enter / →）
```

### 场景 4.3：用户按回车跳转
```
假设 (Given)  候选第一项是"打开时光线"
当   (When)   用户按下回车
那么 (Then)   面板消失，页面以柔和滑动切换到 /timeline
并且 (And)    切换期间无黑屏或内容跳闪
```

### 场景 4.4：用户按 Esc 取消
```
假设 (Given)  用户在写作画布中途按了 Cmd+K
当   (When)   用户按 Esc
那么 (Then)   面板消失，焦点回到写作画布上次的光标位置
并且 (And)    写作内容未被修改
```

### 场景 4.5：用户看到无匹配时的兜底动作
```
假设 (Given)  用户输入的关键词没有任何匹配
当   (When)   用户看到候选列表
那么 (Then)   列表显示"新建日记""查看今日简报""搜索历史"等 3 条兜底动作
并且 (And)    不出现空白或"无结果"字样带来的挫败感
```

### 场景 4.6：用户在目标页按 Cmd+K 看到相关候选
```
假设 (Given)  用户当前停留在 /goals 页
当   (When)   用户按 Cmd+K 且不输入任何文字
那么 (Then)   候选首屏优先展示与目标相关的动作（新建目标、复盘目标、查看路径）
并且 (And)    一般动作（打开日记、看时光线）排在这些条目之后
```

### 场景 4.7：用户在中文输入法中按 Cmd+K
```
假设 (Given)  用户在某个输入框中已输入拼音"k"但尚未选字
当   (When)   用户按下 Cmd+K
那么 (Then)   输入法候选被关闭，命令面板打开
并且 (And)    之前输入的拼音被丢弃，不会被提交到页面
并且 (And)    面板关闭后，该输入框恢复为空，用户可以继续正常输入
```

### 场景 4.8：用户快速连按 Cmd+K
```
假设 (Given)  命令面板刚刚由第一次 Cmd+K 打开
当   (When)   用户在面板完全出现前再次按 Cmd+K
那么 (Then)   面板不会重复堆叠出现
并且 (And)    第二次按键被视为"关闭当前面板"，面板淡出
```

### 场景 4.9：用户在其他 App 中按 Cmd+K
```
假设 (Given)  V2Note 桌面窗口当前未激活（用户切到了其他 App）
当   (When)   用户在其他 App 中按 Cmd+K
那么 (Then)   V2Note 的命令面板不会被触发（网页态快捷键仅在页面获得焦点时生效）
并且 (And)    其他 App 的默认行为不受影响
```

### 场景 4.10：用户通过 Tab 键在候选间移动
```
假设 (Given)  命令面板已打开，有 5 条候选
当   (When)   用户按 Tab 键
那么 (Then)   焦点只在候选列表内循环，不会跳到面板外的元素
并且 (And)    屏幕阅读器能朗读"命令面板，输入搜索或选择动作"的提示
```

## 5. 异常与兼容

### 场景 5.1：用户在浏览器全屏状态下使用
```
假设 (Given)  用户已按 F11 进入浏览器全屏
当   (When)   用户按 Cmd+K
那么 (Then)   命令面板正常打开
并且 (And)    折叠 Insight Panel 后再次展开的触发区仍在屏幕右边缘可达
```

### 场景 5.2：用户使用超宽屏
```
假设 (Given)  用户使用 32 寸 5120px 超宽屏
当   (When)   用户打开桌面端
那么 (Then)   Canvas 区有最大宽度限制，中央留白以避免行宽过长伤害阅读
并且 (And)    Insight Panel 与 Dock 保持合理位置，不被拉伸变形
```

### 场景 5.3：用户在极低网速下操作
```
假设 (Given)  用户当前网络延迟很高
当   (When)   用户拖动 Insight Panel 分隔线
那么 (Then)   分隔线移动即时跟随鼠标，不等待后端数据
并且 (And)    未加载完成的 Insight 内容区显示占位骨架，不阻塞布局
```

## 验收行为（E2E 锚点）

### 行为 1：用户首次看到三栏画布
1. 用户在 Chrome（≥1280px 窗口 + 鼠标）打开 http://localhost:3000
2. 用户完成登录
3. 页面应显示左侧 Dock、中间 Canvas、右侧 Insight Panel 三栏
4. 刷新后仍保持三栏布局与上次宽度比例

### 行为 2：用户通过 Cmd+K 快速跳转
1. 用户停留在任意页面
2. 用户按下 Cmd+K
3. 屏幕中央出现命令面板，输入框已获焦
4. 用户输入"时光"
5. 候选列表顶部应显示"打开时光线"
6. 用户按回车
7. 页面切换至 /timeline，命令面板消失

### 行为 3：用户收起 Insight Panel 进入专注模式
1. 用户在桌面三栏布局下工作
2. 用户点击 Insight Panel 折叠按钮
3. Insight Panel 应以弹性动画滑出，Canvas 扩展至全宽
4. 屏幕右边缘保留一条可触发重新展开的细边
5. 刷新后收起状态被保留

### 行为 4：用户减少动态效果偏好被尊重
1. 用户在操作系统设置中开启"减少动态效果"
2. 用户刷新 V2Note 桌面端
3. 用户触发任意布局动画（展开 Insight / 打开 Cmd+K）
4. 面板应即时出现，没有明显弹性形变
5. 所有 hover / focus 反馈仍然正确

### 行为 5：用户在中文输入中按 Cmd+K
1. 用户在写作区切换到中文输入法
2. 用户输入拼音"k"
3. 用户在拼音未选字前按 Cmd+K
4. 命令面板正常打开，输入框为空
5. 用户按 Esc 关闭面板，焦点回到写作区且无拼音残留

## 边界条件
- [ ] 实时拖拽窗口跨越桌面断点 → 布局平滑切换，无闪烁
- [ ] 窗口宽度 <720px → 整体回退到移动样式，当前状态不丢失
- [ ] 触屏笔记本动态切换指针类型 → hover 反馈相应出现/消失
- [ ] `prefers-reduced-motion` 覆盖所有布局动画 → 即时切换到最终态
- [ ] Cmd+K 与浏览器默认行为冲突 → 页面内拦截成功，页面外不受影响
- [ ] 快速连按 Cmd+K → 不重复堆叠面板
- [ ] 命令面板焦点陷阱与 aria 朗读 → Tab 仅在候选间循环
- [ ] 高 DPI 屏幕下 1px 分隔线 → 不糊、不丢失、可点击区 ≥8px
- [ ] 隐身/无痕模式下 localStorage 不可写 → 降级为仅会话生效，不报错
- [ ] 分隔线拖到极端 → 最小可用宽度保护，不出现不可用布局
- [ ] 多显示器 DPI 切换 → 折叠状态与比例不重置
- [ ] 超宽屏（>2560px）→ Canvas 有最大宽度，中央留白

## 接口约定

### 1. Tailwind `desktop:` Variant（在 tailwind.config.ts 中实现）
```typescript
// tailwind.config.ts（追加 plugin）
plugins: [
  plugin(({ addVariant }) => {
    addVariant('desktop', '@media (min-width: 1280px) and (pointer: fine)');
  }),
]
```

### 2. DesktopLayout Props
```typescript
// components/layout/desktop-layout.tsx
interface DesktopLayoutProps {
  dock: React.ReactNode;
  canvas: React.ReactNode;
  insight?: React.ReactNode;
  initialInsightCollapsed?: boolean;
  onInsightCollapsedChange?: (collapsed: boolean) => void;
  minCanvasWidth?: number;  // 默认 480
}
```

### 3. Command Palette API
```typescript
// components/command-palette/types.ts
interface CommandItem {
  id: string;
  title: string;
  group: "navigation" | "create" | "search" | "action";
  keywords: string[];
  shortcut?: string;
  contextScore?: (currentPath: string) => number;  // 返回 0~1，越高越靠前
  run: () => void | Promise<void>;
}
```

### 4. 候选排序规则（实现约定，非用户场景）
- 基础分：文本前缀匹配 > 关键字匹配 > 模糊匹配
- 加成：当前页面 `contextScore` × 0.4 加到基础分
- 首屏显示 8 条，超出滚动
- 空查询时：只按 `contextScore` 降序，前 5 条

### 5. 布局状态持久化
- 存 `localStorage["v2note.desktop.layout"]` = `{ insightCollapsed, canvasRatio }`
- 隐身模式下 localStorage 写入失败时静默降级为仅会话生效

### 6. 复用的 Motion Token（来自 spec 120）
- Insight Panel 折叠/展开：`motion.spring.gentle`
- Dock 标签淡入：`motion.duration.fast` + `motion.ease.enter`
- CommandPalette 进入：`motion.spring.snappy`
- CommandPalette 退出：`motion.duration.fast` + `motion.ease.exit`

### 7. Cmd+K 事件模型
- 用 `keydown` 在 `window` 顶层监听，`event.preventDefault()` 阻止浏览器默认
- 过滤条件：`(metaKey || ctrlKey) && key === 'k' && !isComposing`
- `isComposing` 通过 `event.isComposing` 判断，输入法激活时仍触发面板但丢弃未提交字符

## 依赖
- spec 120（native-experience-deep.md）— 必须已实现 `shared/lib/motion-tokens.ts`，否则本 spec 无法引用
- spec 110（ui-ux-audit.md）— 桌面 Dock 满足"PC 端应有左侧固定侧栏"的审查结论
- framer-motion（已安装）
- 现有 `components/layout/pc-layout.tsx` — P0 期间 DesktopLayout 与其并存，不删不改
- 未来 P4 Electron 将把 Cmd+K 升级为 globalShortcut，本 spec 仅网页态

## Implementation Phases (实施阶段)
- [ ] Phase 1: Tailwind `desktop:` variant 注入 + `prefers-reduced-motion` runtime hook（⭐ 简单）
- [ ] Phase 2: `<DesktopLayout>` 三槽位 + 分隔线拖拽 + 最小宽度保护 + localStorage 降级（⭐⭐⭐ 中等）
- [ ] Phase 3: `<CommandPalette>` 核心（Cmd+K keydown 拦截 + IME isComposing 处理 + 基础搜索执行）（⭐⭐⭐⭐ 复杂）
- [ ] Phase 4: 上下文加权排序 + 兜底动作 + 焦点陷阱 + aria 朗读（⭐⭐⭐ 中等）
- [ ] Phase 5: 边界打磨（多显示器、超宽屏、全屏 F11、隐身降级）（⭐⭐ 较简单）

## 备注
- 本 spec 是桌面端 Canvas Shell 超级方案的 P0，故意只做地基。后续 P1（Lexical 编辑器）、P3（Insight Studio）、P4（Electron Native）都会接入 DesktopLayout 与 CommandPalette 的插槽。
- `desktop:` variant 与 Tailwind 默认的 md/lg/xl/2xl 故意错开，强调它不只看屏幕尺寸，还看指针类型。
- 布局比例仅本机持久化；跨设备同步另立 spec。
- 与 spec 120 的关系：120 聚焦移动原生体感（滑动/长按/触控）；本 spec 聚焦桌面（鼠标/键盘/窗口）。motion token 单向依赖——本 spec 引用 120 定义，不新增 token 字段。
- 风险等级 high 的理由：新顶层布局容器 + 全局快捷键拦截 + 跨系统（浏览器/Electron/IME/多显示器）交界点多。

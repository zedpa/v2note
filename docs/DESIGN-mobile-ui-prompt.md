# v2note（路路）移动端 UI 设计提示词

> 基于 `specs/app-mobile-redesign.md` + `specs/mobile-action-panel.md` 规格书
> 映射至 Apple Human Interface Guidelines 组件与交互范式
> 设计语言：Editorial Serenity — 数字工坊（Digital Atelier）

---

## 0. 全局设计语言与 Apple 映射

### 色彩系统

采用 Apple「语义化颜色」思路，但用 Editorial Serenity 自有色阶替代系统色：

| 角色 | 色值 | Apple 对应 | 说明 |
|------|------|-----------|------|
| Surface（画布） | `#FDF9F3` | `systemBackground` | 最底层，温暖纸质感 |
| Surface-low（次容器） | `#F7F3ED` | `secondarySystemBackground` | 列表区域底色 |
| Surface-lowest（卡片） | `#FFFFFF` | `tertiarySystemBackground` | 卡片/浮层内部 |
| Surface-high（沉降） | `#EBE8E2` | `systemGray6` | 侧边栏底、已完成区 |
| On-surface（主文字） | `#1C1C18` | `label` | 一级文字，禁止使用纯黑 #000000 |
| 次文字 | `#6B5E52` | `secondaryLabel` | 元数据、副标题 |
| 弱文字 | `#7B6E62` | `tertiaryLabel` | 时间戳、占位符（对比度 ≥ 4.5:1）|
| Deer/Primary | `#C8845C` | `tintColor` | 主强调色，FAB、进度条、选中态 |
| Primary-dark | `#89502C` | — | FAB 渐变起点 |
| Antler（链接） | `#A06B42` | — | 可点击文字链接 |
| 语义-森林 | `#5C7A5E` | `systemGreen` | 成功/完成/右滑确认 |
| 语义-天空 | `#7BA3C4` | `systemBlue` | 用户消息气泡 |
| 语义-晨光 | `#E8A87C` | `systemOrange` | 警告/洞察/左滑跳过 |
| 语义-枫红 | `#C45C5C` | `systemRed` | 删除/取消 |

### 字体系统

参照 Apple「Dynamic Type」层级，用自有字体替代 SF Pro：

| 层级 | 字体 | Apple 对应 Style | 尺寸/用途 |
|------|------|-----------------|----------|
| Display / Headline | Noto Serif SC | `.largeTitle` / `.title1` | 品牌标题、日期分组、空态大字（display-lg 3.5rem） |
| Body | Inter + Noto Sans SC | `.body` | 正文 15px，行高 1.6 |
| Subhead / Caption | Inter + Noto Sans SC | `.subheadline` / `.caption1` | 辅助 12px |
| Mono | 等宽体 | `.caption2` (monospaced) | 元数据、时间戳、归档标记 |

### 图标系统

所有 emoji 仅为语义占位符，实际 UI 使用统一的 **线性图标集**（推荐 Lucide Icons）：
- 线宽：1.5px stroke
- 风格：rounded line cap
- 尺寸：16px（行内）/ 20px（按钮内）/ 24px（导航/FAB）
- 颜色：继承文字色，强调操作用 deer 色

### 核心规则 → Apple 映射

| Editorial Serenity 规则 | Apple HIG 对应 | 实现方式 |
|------------------------|---------------|---------|
| No-Line Rule（禁止 1px 分隔线）| Apple 推荐的 `grouped` 列表无需显式分割 | 用 surface 色阶差代替 `separator` |
| Ghost Border（无障碍降级）| — | 仅必要时使用 `#D7C2B8` 15% opacity 边框，禁止 100% 不透明边框 |
| Breath Principle（大间距）| Section spacing in `UICollectionView` | 组间距 2rem，无 divider |
| Asymmetrical Margins（不对称边距）| — | 正文区左 spacing-4 右 spacing-8，营造手写 marginalia 感 |
| Glass & Soul（毛玻璃）| `UIBlurEffect(.systemUltraThinMaterial)` | 80% opacity + backdrop-blur 12px |
| 环境阴影 | Apple 的 `shadowPath` + diffuse shadow | on-surface 6%, blur 24-32px, Y 8px。禁止 shadow-md/shadow-lg |
| 圆角 12/16/full | Apple 的 continuous corner (`cornerCurve: .continuous`) | 卡片 12, Sheet 16, Pebble 按钮 xl(1.5rem), 药丸 full |
| 动画两档 | `UIView.animate` | 微交互 200ms / 页面转场 300ms，统一 ease-out |
| Reduce Motion | 尊重 `UIAccessibility.isReduceMotionEnabled` | 所有动画降级为 0ms |

### 深色模式

> v1 仅支持浅色模式。深色模式在后续迭代中考虑。
> 设计时所有色值均使用语义变量名（如 `surface`、`on-surface`），便于未来映射深色色阶。

---

## 1. 整体架构（Workspace + Sidebar）

### 设计提示词

```
设计一个移动端工作区主界面，参考 Apple Notes + Reminders 的双模态结构：

架构：
- 无 Tab Bar，无底部导航栏
- 顶部导航栏（UINavigationBar 风格，44pt + Safe Area）
- 中央内容区通过 Segmented Control 在「日记」和「待办」间切换
- 底部居中悬浮一个 56pt 圆形 FAB 录音按钮
- 左侧抽屉式侧边栏（类似 Apple Mail 的账户侧边栏）

导航模式：
- 不使用 UINavigationController push，全部使用 overlay/sheet 覆盖
- 类似 Apple Maps 的 Sheet 叠加模式，每一层 overlay 可独立关闭
- 返回手势：边缘右滑关闭当前 overlay（与 iOS interactivePopGestureRecognizer 一致）

视图切换动画：
- Segmented Control 切换时，内容区水平滑动（类似 UIPageViewController）
- 200ms ease-out，支持手势滑动：左滑=日记→待办，右滑=待办→日记
- 方向与 iOS 返回手势一致（右滑=后退）

状态恢复：
- App 打开时恢复上次退出的视图（日记或待办），对应 Apple 的 State Restoration

不对称边距：
- 正文内容区采用左窄右宽的不对称边距（左 spacing-4 / 右 spacing-8）
- 营造手写 marginalia 的编辑质感，拒绝对称的模板感
```

---

## 2. 顶部栏（Header Bar）

### 设计提示词

```
设计一个毛玻璃顶部导航栏，参考 Apple Safari 的透明导航栏：

布局（从左到右）：
- 左：28pt 圆形头像按钮（用户名首字母，deer 色背景白色文字）
  → 点击打开侧边栏
  → 参考 Apple 的 UIBarButtonItem 圆形头像样式（类似 iMessage 顶部头像）

- 中：药丸形 Segmented Control（160×32pt，圆角 full）
  → 两段：「日记」|「待办」
  → 选中段：白色背景 + 微阴影 + deer 色文字
  → 未选中段：透明背景 + 弱文字
  → 参考 iOS UISegmentedControl 的药丸变体，但用自有配色

- 右：搜索图标 + 通知铃铛
  → 铃铛有未读时右上角红色小圆点（6pt），参考 Apple 的 badge 样式
  → Touch target ≥ 44×44pt

样式：
- 背景：surface (#FDF9F3) 80% opacity + backdrop-blur 12px
  → 等效 Apple 的 .systemUltraThinMaterial
- 底部无分隔线（No-Line Rule），靠内容区 surface-low 底色形成自然层次
- 高度：44pt + 状态栏 Safe Area
- 随内容滚动保持固定（sticky header）
```

---

## 3. 日记视图（Journal Stream）

### 3.1 日记流整体

```
设计一个日记时间流界面，参考 Apple Journal app + Day One 的卡片流：

列表结构：
- 参考 UICollectionView compositional layout
- 底色：surface-low (#F7F3ED)
- 卡片：surface-lowest (#FFFFFF)，圆角 12pt continuous
- 卡片之间间距 2rem（Breath Principle，用间距代替分隔线）
- 内容区不对称边距（左 spacing-4 / 右 spacing-8）
- 卡片内边距 16pt
- 下拉刷新（UIRefreshControl 风格）+ 上拉加载更多

日期分组：
- 分组标题用 Noto Serif SC，类似 Apple Calendar 的日期标题
- 格式：「今天 · 3月26日」/「昨天」/「3月24日 周一」
- 不使用分隔线，靠 spacing 和字体层级区分
```

### 3.2 日记卡片 — 折叠态

```
设计日记卡片的默认折叠态，参考 Apple Notes 列表项但更具编辑质感：

卡片内容（从上到下）：
1. 元数据行（顶部）：
   - 左侧：「09:35 · 🎙 2分12秒 · 📍公司」，Mono 字体 12px，弱文字色
   - 右侧：🧠（思考类）或 📄（素材类）标记图标
   → 参考 Apple Files app 的文件元数据行

2. 正文摘要：
   - 15px body 字体，on-surface 色，行高 1.6
   - 最多显示 4 行（line-clamp-4）
   - 未处理完成时显示 shimmer 骨架屏（参考 Apple 原生骨架屏效果）

3. 主题标签（如有 Cluster 数据）：
   - Reflection Chip 样式：半透明 secondary_fixed_dim 背景 + Ghost Border
   - deer 色文字

4. 底部统计（如有数据）：
   - 「🔗 3  📌 2」，弱文字色
   - 参考 Apple Notes 底部的附件计数样式

样式要求：
- 白色卡片放在 surface-low 容器上，色阶差自然形成边界（无边框）
- 点击整张卡片展开详情（参考 Apple Stocks app 的卡片展开交互）
```

### 3.3 日记卡片 — 展开态

```
设计日记卡片的展开态，参考 Apple Music 的「Now Playing」展开过渡：

展开动画：
- 卡片原地展开（非新页面），内容从折叠位置向下推开
- 300ms ease-out，参考 Apple 的 spring animation

展开后内容：
1. 完整摘要文本（无 line-clamp）

2. 音频播放器（有录音时）：
   - 参考 Apple Podcasts 的迷你播放器
   - ▶ 播放按钮 + 时间 + 进度滑块 + 总时长
   - 波形可视化（可选）

3. Strike 认知区：
   - 极性图标（👁蓝/⚖️橙/💡紫/🎯绿/❤️红）+ 核心观点文字
   - [纠正] 按钮 → 参考 Apple 的 inline editing

4. 关联待办：
   - Checkbox 列表，可直接勾选
   - 参考 Apple Reminders 的 inline checkbox 样式

5. 关联记录：
   - Top-3 相关记录摘要，卡片化展示

6. 底部操作：
   - 「💬 和路路聊聊这条」→ Pebble 按钮（圆角 xl/1.5rem，deer 色描边）

再次点击折叠，带回弹动画。
```

### 3.4 AI Window（替代原 AI 伴侣气泡）

```
设计 AI 伴侣窗口，将静态 emoji 升级为有生命感的像素小鹿动画：

位置：header 下方常驻，日记流/待办流共享（两种视图都可见）

尺寸与样式：
- 高度 56pt（小鹿 32px + 上下 padding 12px）
- 背景 transparent（与内容区融合，不额外占据视觉层级）
- 不使用边框/分隔线（No-Line Rule）

布局：
┌──────────────────────────────────────┐
│ 🦌(32px 像素动画) │ 状态文字/消息内容   │
└──────────────────────────────────────┘

像素小鹿规格：
- 32×32px 像素精灵图（sprite sheet），deer 色系
- 10 种状态动画，每种 4-8 帧，6fps 循环
- 状态映射真实系统数据（不是随机装饰）：
  吃草(默认) / 整理笔记(Digest中) / 晒太阳(完成多个待办)
  喝饮料(Seeds酝酿中) / 发呆(用户久未输入) / 生气(待办反复跳过)
  心疼(深夜使用) / 说话(有消息) / 思考(深度推理) / 跑来跑去(工具调用中)
- 状态切换：淡出 150ms → 淡入 150ms
- prefers-reduced-motion：降级为静态首帧

三态切换：

1. 静默态（默认）：
   小鹿动画 + 弱文字色状态文字（12px Mono）
   如：🦌(吃草) 或 🦌(整理笔记) "在看你最近的想法..."
   点击整个区域 → 打开对话态
   状态文字每 30-60 分钟自然轮换

2. 气泡态（有消息时）：
   小鹿切换到「说话」动画 + 消息内容 typewriter 逐字出现(50ms/字)
   高度可扩展到 80pt（消息较长时）
   消息类型（优先级高→低）：

   a. action.confirm — 晨光色竖线 + [确认][算了]，不自动消失
   b. action.result — 森林色竖线 + ✅ 结果，5s 降级
      → 简单指令不展示工具调用过程，只显示结果
   c. companion.chat — 主动闲聊（疑问/赞同/表扬）
      → 基于用户日记内容，≤ 30 字，10s 降级
      → 间隔 ≥ 30min，每日 ≤ 8 条
   d. reflect.question — 追问，点击进入对话
   e. proactive.* — 晨间/待办/转达推送

3. 对话态（点击展开）：
   全屏 overlay（参谋对话页升级版）
   顶部：← 返回 + 🦌(当前动画) + 「路路」+ 心情标签

   心情影响开场白语气（开心=轻松 / 担心=关切 / 好奇=追问）
   对话中工具调用可视化：
   - 单步操作：内联一行工具指示（弱文字色，如「🔍 搜索了相关记录」）
   - 多步操作（≥ 2 步）：展开可折叠步骤面板
     ┌─ 正在处理 ──────────── ▾ ─┐
     │ ✅ 搜索相关记录   找到 12 条 │
     │ ⏳ 分析认知模式...          │
     │ ○  创建目标                 │
     └────────────────────────────┘
   - 步骤面板：surface-low 背景，圆角 12pt
   - 折叠后显示摘要：「路路用了 3 步完成」
   - 小鹿同步：执行中=跑来跑去，完成=晒太阳
```

### 3.5 AI 洞察卡片

```
设计 AI 洞察卡片，参考 Apple Health 的「趋势」提示卡片：

样式：
- 背景：极浅晨光色 #FFF8F0
- 左侧 3px 竖线 #E8A87C
- 顶部标签「🦌 路路发现」，Mono 字体
- 正文 13px 次文字色
- 右下「详细了解 →」antler 色链接
- 圆角 12pt，无边框

插入规则：
- 在日记流中适当位置插入，每日最多 1-2 张
- 与日记卡片视觉有区分（暖色底而非白底）

交互：
- 点击「详细了解」→ 打开参谋对话 overlay（mode=insight）
```

### 3.6 多选删除

```
设计日记卡片多选模式，参考 Apple Photos 的多选交互：

触发：长按某卡片 500ms
- 触觉反馈（haptic impact medium）
- 进入选择模式：每张卡片左侧显示圆形 checkbox
- 参考 Apple Mail 的编辑模式

底部工具栏：
- 「已选 N 条」+ [取消] + [删除]（枫红色）
- 参考 Apple 的 UIToolbar in editing mode
- 删除前弹出 UIAlertController 风格确认弹窗
```

---

## 4. 待办视图（Todo View）

### 4.1 Now Card — Tinder 式焦点卡片

```
设计待办视图顶部的焦点卡片（Now Card），这是待办交互的核心创新：

位置：待办视图最顶部（待确认区下方），比普通待办行更大更突出

样式：
- 背景：surface-lowest (#FFFFFF)
- 圆角 16pt continuous（比普通卡片更大圆角）
- 环境阴影：on-surface 6%, blur 32px, Y 8px
- 内边距 20pt
- 内容：待办标题（body 加粗）+ 项目标签（次文字色）+ 时间（右对齐）
- 底部：目标呼吸指示器（小圆点排列，当前目标高亮）

Tinder 式滑动交互：

右滑 = 完成（参考 Tinder swipe-right 的正面操作）：
- 滑动过程中，卡片右侧逐渐露出森林色(#5C7A5E)背景区域
- 露出区域内显示「✓ 完成」标签 + 圆形勾选图标
- >40px 时标签从半透明激活为全不透明
- >80px 松手 → 卡片向右飞出 + 森林色消散粒子效果(300ms)
- 下一待办从下方 spring 上升到 Now Card
- 未超过阈值松手 → 弹回原位(200ms)

左滑 = 跳过（参考 Tinder swipe-left 的延后操作）：
- 滑动过程中，卡片左侧逐渐露出晨光色(#E8A87C)背景区域
- 露出区域内显示三个跳过原因标签（纵向排列）：
  ⏳ 等条件 | 🚧 有阻力 | 🔄 要重想
- >40px 时标签激活
- >80px 松手 → 露出区域固定，等待用户点击原因
- 点击原因 → 卡片向左飞出 + skip_count++
- 未超过阈值松手 → 弹回原位(200ms)

长按下拉 = 今天不做：
- 长按 500ms + 下拉 → 弹出原因选择弹窗
- ⏳ 等待中（选新日期）/ 🚧 卡住了（需要重新想想）
- 选择后行动从今日列表移除

反复跳过提醒（skip_count ≥ 5）：
- Now Card 顶部显示晨光色提示条
- 「这件事已经在这里 N 天了，要聊聊吗？」
- 点击 → 打开参谋对话 overlay

目标呼吸指示器：
- 底部小圆点，每个对应一个活跃目标
- 呼吸频率映射目标健康度（健康=慢呼吸 3s，需关注=快呼吸 1s）
- 点击圆点 / 左右滑动 → 切换到该目标的待办队列
```

### 4.2 待办列表整体

```
设计 Now Card 下方的待办分组列表，参考 Apple Reminders 的分组列表：

列表底色：surface-low (#F7F3ED)
待办行底色：surface-lowest (#FFFFFF)，无边框

默认模式（无项目筛选时 — 按时间分组）：
1. 待确认意图（To Confirm）— 在 Now Card 上方
   - 可折叠区域，deer 色圆点指示
   - 卡片化：surface-lowest 背景 + [确认] Pebble 按钮
   - 左滑 >80px 露出 [忽略] 按钮（枫红色）
   - 来源：AI 涌现的 wish/goal（Cluster 意图密度 > 30%）

2. 今日（Today）— Now Card 下方
   - Noto Serif SC 大字标题 + 右侧百分比
   - deer 色进度条：━━━━━━━━━━━░░░░░ 3/5
   - 未完成在上（按时间排序），已完成折叠在下

3. 转达区
   - 📞/📧 图标 + 转达内容 + 来源日期
   - 点击标记完成

4. 明天（Tomorrow）
5. 稍后（Later）

项目管理模式（选中某项目后 — 按子目标分组）：
  📁 项目标题（Serif display）

  🎯 子目标 A                  60%   ← 子目标名 + 进度百分比
  ○  待办 1                  10:00   ← 该子目标下的待办
  ○  待办 2
  ✓  已完成待办

  🎯 子目标 B                   0%
  ○  待办 3

  散装待办                            ← 直接挂在项目下、无子目标的待办
  ○  写项目周报

  → 子目标标题可点击打开目标详情 overlay
  → 子目标右侧百分比 = completedTodos / totalTodos

分组标题：Noto Serif SC，无分隔线，靠 spacing-6 间距区分（Breath Principle）
```

### 4.3 待办行

```
设计单条待办行，参考 Apple Reminders 的行样式：

布局：
- 左侧：空心圆 ○（touch target ≥ 44×44pt）
- 中间：待办标题 + 下方项目标签（次文字色，如「› 供应链评估」）
- 右侧：时间标签（如「10:00」）

完成动画（参考 Apple Reminders 的勾选动画）：
- 点击空心圆 → deer 色实心 ✓
- 文字加删除线 + 渐变为弱文字色
- 背景渐变到 surface-high
- 200ms ease-out
- 滑入已完成区（底部）
- 进度条数值更新

待办行左滑跳过（列表中的普通待办行也支持）：
- 左滑 >80px 露出三个原因标签：⏳ 等条件 | 🚧 有阻力 | 🔄 要重想
- 点击后该待办移到「稍后」分组
- 带弹性回弹动画

行高最小 44pt（Touch target 合规）
行间距 spacing-6（无分隔线）
```

### 4.4 待办详情 Bottom Sheet

```
设计待办详情底部弹出面板，参考 Apple Maps / Stocks 的 detent sheet：

触发：点击待办文字区域（非 checkbox）
弹出方式：UISheetPresentationController 风格，带拖拽指示条

Sheet 样式：
- 背景：surface-lowest (#FFFFFF)
- 顶部圆角 16pt continuous
- 环境阴影（on-surface 6%, blur 24px）
- 支持多档位拖拽（half → full → dismiss）

Sheet 内容：
┌─────────────────────────────────┐
│  ○ 待办标题                  ✕  │  标题行 + 关闭按钮
│    Status: Active                │  状态药丸标签
│                                  │
│  📁  项目名称                    │  所属项目（参考 Apple Reminders 的列表归属）
│  📅  周五 4:00 PM                │  日期选择器入口
│  ❗  Priority 1                  │  优先级选择
│  🏷️  标签                        │  Reflection Chip（半透明底+Ghost Border）
│  ⏱️  30 分钟                     │  时长
│                                  │
│  [ Deadline ] [ Move to... ]     │  快捷 Pebble 按钮组
│                                  │
│  Sub-tasks                   +   │  子任务列表
│  ☐ Step 1                       │  参考 Apple Reminders 的子任务
│  ☐ Step 2                       │  ai_actionable 时显示 action_plan
│                                  │
│  [ 让AI帮忙 ]                    │  仅 ai_actionable 待办显示
│                                  │
│  Comment...            🎙  ▶   │  评论/语音输入
└─────────────────────────────────┘

每个字段参考 Apple 的 form row 样式（icon + label + value，点击编辑）
修改实时保存（无需手动保存按钮）
点击「让AI帮忙」→ 关闭 Sheet → 打开参谋对话 overlay
```

### 4.5 主题生命周期视图（筛选态下的「进展」Tab）

```
设计主题生命周期视图——选中某主题后待办视图变形为四阶段生命画面：

触发：从侧边栏选中 🌿 主题后，「进展」Tab 激活

参考：Apple Health 的日摘要（多段内容竖向排列）+ Apple Fitness 的活动环

整体布局：
- 底色 surface-low (#F7F3ED)
- 四个阶段纵向排列，每个阶段有 Serif 标题行
- 阶段间 spacing-6 间距
- 只显示有数据的阶段

阶段标题行样式：
- 左侧：横线段（surface-high 色，16pt 宽）
- 中间：阶段名（Mono 字体，弱文字色，12px）
- 右侧：横线段延伸到右边缘
- 如：── 此刻 ────────────── Now ──

── 此刻 (Now) ──
- Now Card 保持 Tinder 滑动交互不变
- 下方列出该主题今日的其他待办行
- 如果该主题今日无待办：不显示此区域

── 正在长 (Growing) ──
- 每个 active Goal 显示为一个卡片：
  🎯 目标名                    60%
  → 右侧百分比 = completedTodos / totalTodos
  → 下方展开子 Todo 列表（可折叠）：
    ✓ 已完成待办（surface-high 底 + 删除线）
    ○ 未完成待办
  → 点击目标名 → 打开目标详情 overlay
- 参考 Apple Reminders 的列表 + 内联进度

── 种子 (Seeds) ──
- 每条种子卡片：surface-lowest 背景 + 圆角 12pt
  💭 Strike nucleus（正文字体，on-surface 色）
  → 底部右对齐：「和路路聊聊 →」antler 色链接
  → 点击卡片展开原始日记上下文
  → 展开后增加 [设为目标] Pebble 按钮
- 种子之间 spacing-4 间距
- 参考 Apple Notes 的快速笔记卡片样式

── 已收获 (Harvest) ──
- 每条收获卡片：surface-lowest 背景 + 左侧 3px 森林色竖线
  ✦ 收获标题（Goal 的回顾总结）         日期
  → 点击展开完整回顾内容
  → 回顾内容下方可能有淡色虚线连接到 Seeds 区的某个新想法
    （暗示「这个收获催生了那个新方向」）
- 参考 Apple Health 的趋势提示卡片

空态：
- 所有阶段都空（新主题）：
  Serif display 大字「这个方向刚刚开始」
  + 路路鼓励语 + 「说点什么开始吧」按钮
```

### 4.6 主题脉络视图（筛选态下的「脉络」Tab）

```
设计主题脉络视图——选中主题后日记视图变为该主题的认知时间线：

触发：筛选态下切换到「脉络」Tab

样式：与默认日记流完全一致（卡片流 + 日期分组 + AI 洞察）
区别：仅显示与选中 Cluster 相关的日记（三重匹配筛选）

筛选药丸在顶部始终可见（提醒用户当前在筛选态）
空态：Serif「这个方向还没有记录」+ 路路引导
```

---

## 5. FAB 录音按钮（Floating Action Button）

### 5.1 FAB 基础态

```
设计底部悬浮录音按钮，Apple 生态中无标准 FAB，需自定义但保持 iOS 质感：

位置与尺寸：
- 底部居中，距底 24pt（含 Safe Area）
- 56pt 圆形
- 层级最高，所有视图中可见

样式：
- 渐变背景：linear-gradient(135deg, #89502C, #C8845C)（鹿毛色，深→浅）
- 白色麦克风 SVG 图标（24pt）
- 环境阴影：on-surface 6% opacity, blur 24pt, Y 8pt
- 参考 Apple 的 .continuous cornerCurve 圆形

两种输入方式（零步骤到达）：
- 单击 → 文字输入 Sheet
- 长按 → 语音录入

核心理念：用户不需要区分「录日记」还是「发指令」，统一入口，AI 自动判断意图。
```

### 5.2 单击 — 文字输入 Sheet

```
设计文字输入底部面板，参考 iMessage 的输入区但以 Sheet 形态呈现：

触发：单击 FAB

Sheet 内容：
- 毛玻璃背景（Glass & Soul）
- 多行文本输入区，placeholder「记点什么…」
- autofocus，键盘自动弹起
- 附件预览区（有附件时）
- 底部工具栏：📎附件 + 🏷️标签 + 🧠/📄切换 + 🎙语音切换 + 发送按钮
  → 参考 iMessage 底部工具栏布局

特殊行为：
- 输入「/」开头 → 关闭输入框，打开参谋对话 overlay（mode=command）
- 点击工具栏 🎙 → 关闭文字 Sheet，进入录音 Sheet
- 发送后 AI 自动判断意图：
  · record（纯记录）→ 创建日记 + Digest
  · action（纯指令）→ 执行 Agent 操作 → action.result 气泡反馈
  · mixed（混合）→ 日记 + 待办同时创建
  · query（查询）→ 气泡展示查询结果摘要
```

### 5.3 长按 — 语音录入（微信语音条模式）

```
设计语音录入交互，融合微信语音条 + Apple 的触觉反馈：

阶段一：长按录音
- 长按 FAB ≥ 300ms 开始录音
- 触觉反馈：UIImpactFeedbackGenerator(.light)
- FAB 区域扩大为录音指示条：
  红色脉冲圆点 + 「松开发送」+ 计时器 + 实时波形
- 参考 Apple Watch 的 Walkie-Talkie 视觉风格

手势操作（按住状态下）：
- 松开（无滑动）→ 停止录音并发送 → AI 自动判断意图
- 左滑 >80pt → 显示「松开取消」，松开后丢弃
- 右滑 >80pt → 显示「松开锁定」，松开后进入锁定模式

阶段二：锁定录音 Sheet
- 大面积波形可视化（32 根波形柱）
- 红色脉冲圆点 + 「录音中」+ 计时器
- 两个按钮：✕取消(灰) / ■停止(红色大按钮)
- 停止后显示转写文本预览 + [发送] 按钮
- 参考 Apple Voice Memos 的录音界面

语音指令反馈（发送后）：
- record 类型 → 日记流出现新卡片
- action 类型 → AI 伴侣气泡显示 action.result（✅ 执行结果）
- 高风险操作 → AI 伴侣气泡显示 action.confirm（确认请求）
- 匹配失败 → 气泡显示「没找到，要新建吗？」+ [新建][算了]
```

### 5.4 FAB 处理状态

```
设计 FAB 的 AI 处理中状态，参考 Apple Siri 的处理动画：

处理中变形：
- 圆形 FAB → 胶囊形（capsule shape）
- Sparkles 旋转图标 + 俏皮话文字（如「正在翻译脑电波…」）
- 参考 Apple Dynamic Island 的胶囊展开逻辑
- 30s 超时安全重置

完成后：
- 胶囊 → 圆形，300ms spring animation
- 恢复 idle 态
```

---

## 6. 侧边栏（Sidebar / Drawer）

```
设计左侧抽屉式侧边栏，参考 Apple Mail 的账户/邮箱侧边栏：

打开方式：
- 点击左上角头像按钮
- 或从屏幕左边缘右滑（参考 Apple 的 UIScreenEdgePanGestureRecognizer）

尺寸与样式：
- 宽度：75vw，最大 320pt
- 背景：surface-high (#EBE8E2)
- 遮罩：bg-black/30
- 滑入动画：200ms ease-out（尊重 reduce motion）
- 参考 iPadOS Sidebar 的视觉层次但适配手机宽度

关闭方式：
- 点击遮罩
- 左滑侧边栏
- 点击某项跳转后自动关闭

内容分五组（组间用 spacing-6 间距，无分隔线）：

第一组 — 顶部用户区：
  头像(40pt) + 用户名 + 🔔通知 + ⚙️设置快捷入口

第二组 — 浏览导航（参考 Apple Files 的浏览列表）：
  🔍 搜索
  📋 每日回顾（有新报告时红点 badge）
  🗺️ 发现
  📊 认知统计

第三组 — 我的方向（涌现主题，非手动项目树）：
  「我的方向」Serif 小标题 + [+] 按钮（→ 打开对话，路路帮你梳理新方向）

  活跃方向（有 active Goal 的 Cluster，按最近活动排序）：
  🌿 供应链管理           12   → Cluster 名 + Strike 成员数
     评估供应商 · 铸造优化      → 关联的 active Goals 摘要，次文字色 12px
  🌿 v2note 产品            8
     移动端重构

  独立目标（无 Cluster 或 Cluster 很弱的 Goal）：
  🎯 量化交易                   → active Goal，无主题归属

  AI 涌现建议：
  💡 团队培训计划      确认?    → suggested Goal（Cluster intend 密度 > 30% 触发）

  样式：🌿 图标用森林色(#5C7A5E)；数字用 Mono 字体；
  Goals 摘要行左边距 28px 缩进，次文字色

  选中主题后的行为：
  - 侧边栏关闭
  - 顶部 Segment 变为「脉络 | 进展」（替代「日记 | 待办」）
  - 出现筛选药丸：「🌿 供应链管理  ✕」（deer 色轻底 + on-surface 文字）
  - 默认显示「进展」Tab（主题生命周期视图）
  - 点击 ✕ 清除筛选恢复全量

第四组 — 沉默区（默认折叠，灰色弱化）：
  有认知沉淀但无行动意图的 Cluster（intend 密度 < 30%）
  ☁️ 家庭关系              3
  ☁️ 健康管理              2
  → 灰色文字 + 图标，暗示"有想法但还没行动"
  → 点击同样进入主题筛选态，但生命周期视图只有 Seeds 区有内容

第五组 — 配置：
  🔮 洞察视角（4 种：苏格拉底追问/元问题/二阶思考/芒格决策）
  🦌 路路设置（AI 身份/AI 记忆/技能管理）
  ⚙️ 设置

底部：「退出登录」弱文字色
```

---

## 7. Overlay 导航页

### 7.1 目标详情

```
设计目标详情 overlay，参考 Apple Fitness 的活动详情页：

打开方式：overlay 从底部/右侧滑入（非路由 push）
顶部：← 返回 + 「Goal Detail」+ ⋮ 菜单

内容（从上到下）：
1. 目标名（Noto Serif SC display 大字）+ 进度百分比（大号数字）
   → 参考 Apple Fitness 的环形进度 + 大字统计

2. 健康度四维水平条（方向/资源/路径/驱动）
   → GET /goals/:id/health 返回四维分数
   → 参考 Apple Health 的健康指标条形图
   → 每维 0-100，deer 色填充

3. 待办列表（按目标分组的 checkbox）
   → 参考 Apple Reminders 的子任务列表
   → 底部「添加待办」按钮

4. 认知叙事时间轴
   → ● 起点 → ● 转折 → ● 冲突 → ○ 悬念
   → 参考 Apple 的垂直时间轴 UI

5. 相关记录（最近 N 条关联日记摘要）

6. AI 建议确认区（仅 suggested 状态的目标）：
   → 「路路觉得这可能是你的一个目标」
   → [确认为目标] [忽略] 两个 Pebble 按钮

7. 底部：「和路路讨论这个目标」Pebble 按钮
```

### 7.2 项目详情

```
设计项目详情 overlay，参考 Apple 的分组信息页：

布局：
- 顶部 Mono 元数据：PROJECT · UPDATED MAR 14, 2026
- Serif display 大标题：如「Q2 Cost War」
- 目标分组（每组：Serif 小标题 + 子待办 checkbox 列表）
- 组间用 spacing-6 间距，无边框无分隔线
- 子目标进度有阻力时（存在 skip_count ≥ 3 的待办），标题旁显示晨光色警示点

底部统计：
- 大号 Serif 百分比数字（如「64%」）
- Complete · ▲ MOMENTUM · ◉ ATTN 指标
- 参考 Apple Stocks 的关键数据展示
```

### 7.3 发现页（认知地图）

```
设计认知地图发现页，参考 Apple Photos 的「回忆」+ Apple Maps 的探索模式：

上半区 — 认知地图：
- 默认：2 列卡片瀑布流（主题名 + 条数 + 活跃度圆点 + 子主题）
  → 参考 Apple Photos 的相册网格
- 右上切换按钮：卡片 / 网状 / 导图
- 点击卡片 → 打开 Cluster 详情 overlay

下半区 — 路路的发现（洞察列表）：
- 每条：左侧彩色竖线 + 类型 + 置信度% + 摘要 + 「详细 →」
- 参考 Apple Health 的趋势提示列表
```

### 7.4 每日回顾

```
设计每日回顾页，参考 Apple Journal 的每日建议 + Apple Health 的每日摘要：

内容：
- 今日行动摘要
- 路路的发现（洞察卡片）
- 统计数据
- 决策模板提示（有完整决策闭环时）：
  → 「这次从设定目标到完成用了 N 天，要保存为决策模板吗？」
  → [保存模板] Pebble 按钮

导航：
- 左右滑动切换历史回顾（参考 Apple Weather 的城市切换）
- 底部「💬 和路路聊聊今天」按钮

默认显示最新一期（晨间或晚间）
```

### 7.5 认知统计

```
设计认知统计页，参考 Apple Health 的数据仪表盘：

图表组件：
- 极性分布环形图（5 种极性：感知/判断/领悟/意图/感受），参考 Apple Fitness 的三环
- 领悟滞后指标（感知→领悟天数），大字 + 标签
- Top Clusters 排行（前 5 大主题），参考 Apple Music 的排行榜样式
- 30 天趋势折线图，参考 Apple Stocks 的折线图
- 标签分布横向柱状图
- 待办趋势（创建 vs 完成）双线图

所有图表使用 Editorial Serenity 配色，圆角 12pt
```

---

## 8. 参谋对话页（AI Window 对话态）

```
设计 AI 对话界面，参考 Apple Messages + Siri，升级为 AI Window 的展开形态：

全屏 overlay 打开（从 AI Window 点击展开，或从其他入口进入）

顶部（56pt）：
- ← 返回 + 🦌(当前像素动画, 24pt) + 「路路」
- 第二行：心情标签 + 状态（如「开心 · 刚帮你整理完笔记」）
- 心情标签：药丸形，极浅底色，12px 次文字色
- 参考 Apple 联系人详情页的头像区

消息区：
- AI 消息（左对齐）：
  surface-low 背景气泡，无头像（顶部已有小鹿）
  → 参考 iMessage 的接收消息样式但用自有配色

- 用户消息（右对齐）：
  天空蓝淡色 (#7BA3C4/15%) 气泡
  → 参考 iMessage 的发送消息样式

- 流式输出：打字机效果 + 三点跳动加载动画
  → 同时小鹿切换到「思考」动画

- 工具调用可视化（仅在此界面中展示）：
  a. 单步操作（< 1s 或 1 步）：
     跳过指示，直接显示结果
  b. 单步操作（≥ 1s）：
     内联一行工具指示：「🔍 搜索了相关记录」弱文字色 12px
  c. 多步操作（≥ 2 步）：
     展开可折叠步骤面板：
     ┌─ 正在处理 ──────────── ▾ ─┐
     │ ✅ 搜索相关记录   找到 12 条 │  surface-low 背景
     │ ✅ 分析认知模式   3 个主题   │  圆角 12pt
     │ ⏳ 创建目标...              │  ⏳ 行有微 spinner
     │ ○  关联待办                 │
     └────────────────────────────┘
     折叠后：「路路用了 4 步完成」摘要行
     小鹿同步：执行中=跑来跑去，完成=晒太阳

底部输入区：
- 文本输入框（圆角 full，参考 iMessage 输入框）
- 🎙 语音按钮 + 发送按钮
- 键盘弹起时输入区跟随上移（参考 Apple 的 keyboard avoidance）

支持多种 mode（review/command/insight/decision），通过 WS 传递上下文
从 AI Window 气泡点击进入时，气泡消息作为 assistant 消息预填
心情 + 上下文自动注入（路路心情、相关日记 Strikes、当前主题筛选）
```

---

## 9. 冷启动引导

```
设计首次使用引导流程，参考 Apple 的 Setup Assistant + Onboarding 最佳实践：

页面 1 — 欢迎页：
- 居中 🦌 路路 Logo（大号）
- 「你好，我是路路」Noto Serif SC 24px
- 「你的每一个想法，我都帮你记住」副标题
- [开始] 全宽大按钮（deer 色渐变）
- 参考 Apple 新 App 的欢迎页（大 icon + 标题 + 副标题 + CTA）

页面 2-6 — 五问引导（每问一页）：
- 顶部进度：「路路问你 (1/6)」+ deer 色进度条
  → 参考 Apple Health 的 onboarding 进度
- 问题文字（Noto Serif SC）
- 输入框 / 选项
- 主按钮：「🎙 说说看」deer 色大按钮
- 次按钮：「⌨️ 打字」灰色小按钮
- [下一步] + 「跳过这个问题」链接

六步引导：
1. 怎么称呼你？
2. 你现在主要在做什么？
3. 领域选择（Q2 之后自动出现）：
   → 「路路想更了解你的工作，选一下你的领域吧（可多选）：」
   → 2 列网格卡片，每张：图标 + 领域名 + 3 个示例术语
     🏭 制造/供应链    「BOM · 良品率 · 模具」
     💰 金融/投资      「对冲 · 估值 · 标的」
     💻 互联网/IT      「OKR · 灰度 · 微服务」
     🏥 医疗/生物      「靶点 · 临床 · IND」
     📐 设计/创意      「字距 · 渲染 · 色域」
     📚 教育/学术      「SCI · peer review · 课题」
     🏗️ 建筑/工程      「容积率 · BIM · 预算清单」
     🛒 电商/零售      「SKU · 客单价 · 复购率」
     ➕ 自定义         → 输入领域名，AI 生成初始词库
   → 选中卡片：deer 色描边 + 浅 deer 底色，最多 3 个
   → 选择后加载领域专业词库（用于语音识别修正）
   → 参考 Apple Health 的健康数据类型选择页
4. 最近最让你花心思的一件事？
5. 觉得很多想法想过就忘，或决定了的事总拖着？
6. 一般什么时候有空整理想法？

转场动画：页面间水平滑动 300ms ease-out（参考 Apple 的 onboarding 页面转场）

完成后进入工作区，placeholder 个性化：「[名字]，记点什么吧」
```

---

## 10. 登录认证

```
设计登录页，参考 Apple ID 登录页的简洁风格：

布局：
- 顶部 🦌 Logo + 品牌名
- 手机号输入框（圆角 12pt）
- 密码输入框（圆角 12pt）
- [登录] 全宽按钮（deer 色渐变）
- 底部：「没有账号？注册」切换链接

样式：
- 背景：surface (#FDF9F3)
- 输入框：surface-lowest 背景，无 1px 边框（No-Line Rule），
  聚焦时 Ghost Border（#D7C2B8/15%）+ deer 色幽灵光晕
- 参考 Apple 的表单设计规范（大输入框、清晰标签、单列布局）
```

---

## 11. 通知中心

```
设计通知列表 overlay，参考 iOS 通知中心的分组列表：

列表样式：
- 每条通知：图标 + 标题 + 时间，卡片化（surface-lowest 背景）
- 参考 iOS 锁屏通知的卡片样式
- 最新在上

通知类型图标：
- ☀️ 晨间简报 | 🎯 待办提醒 | 🌙 晚间总结 | 📞 转达提醒 | ⚡ 认知矛盾

交互：
- 点击通知 → 跳转对应功能 + 标记已读
- 参考 iOS 通知的点击跳转行为

特殊通知（来自其他认知系统）：
- 知识过期提醒（knowledge-lifecycle）：某条记录被新信息取代
- 结果追踪提醒（action-tracking）：完成 7 天后追问「结果怎样？」
- 人物档案更新（person-profile）：高频人物自动识别完成
```

---

## 12. 边界条件与无障碍

```
空态设计（参考 Apple 的空态最佳实践）：
- 空日记流：Noto Serif SC display-lg 3.5rem 大字 +
  路路插画 + 「开始你的第一条记录吧」
  → 参考 Apple Notes 的空列表状态

- 空待办：Serif「今日清单已清空」+ 路路鼓励语
- 空 Now Card：无待办时不显示 Now Card 区域

离线状态：
- 顶部黄色横幅（晨光色 #E8A87C）+ 「离线模式」
- 参考 Apple 系统级的网络状态提示

无障碍：
- 对比度 ≥ 4.5:1（所有正文/弱文字均达标）
- Touch target ≥ 44×44pt（Apple HIG 最低标准）
- Focus ring：键盘导航时 2px deer 色 outline（仅 keyboard 用户可见，:focus-visible）
- Ghost Border 降级：无障碍模式下边界用 #D7C2B8/15% 边框补充
- 所有 SVG 图标按钮必须有 accessibilityLabel
- 标题层级：h1 → h2 → h3 不跳级
- 支持 Dynamic Type（系统字体缩放）
- 尊重 `UIAccessibility.isReduceMotionEnabled`：所有动画降级为 0ms
- Now Card 滑动操作：VoiceOver 模式下降级为按钮（「完成」「跳过」）
```

---

## 设计文件交付清单

| 序号 | 页面/组件 | 状态数 | 优先级 |
|------|----------|--------|--------|
| 1 | 顶部栏（Header） | 默认态、滚动态 | P7.1 |
| 2 | **Now Card（Tinder 焦点卡片）** | 静态、右滑露出、左滑露出、长按、反复跳过提示、目标切换 | **P7.1** |
| 3 | 日记视图 — 卡片流 | 折叠、展开、骨架屏、空态 | P7.1 |
| 4 | AI Window（像素小鹿） | 静默态、气泡态(6种消息)、对话态、10种小鹿动画 | P7.2 |
| 5 | 待办视图 — 分组列表 | 默认、完成动画、空态 | P7.1 |
| 6 | 待办视图 — 详情 Sheet | 半屏、全屏、ai_actionable 变体 | P7.1 |
| 7 | FAB — 基础/文字/语音/处理中 | 4 种状态 + 2 种 Sheet | P7.1 |
| 8 | 侧边栏 | 打开、关闭、方向列表（活跃/独立/沉默三区） | P7.2 |
| 9 | 目标/项目详情 overlay | 各 1（含 suggested 确认态） | P7.2 |
| 10 | 发现页（认知地图） | 卡片/网状/导图 3 模式 | P7.2 |
| 11 | 每日回顾/认知统计 | 各 1（含决策模板提示） | P7.2 |
| 12 | 参谋对话页（AI Window 对话态） | 小鹿+心情、流式输出、工具步骤面板、4 种 mode | P7.2 |
| 13 | 冷启动引导 | 7 页（含领域选择） | P7.3 |
| 14 | 登录/注册 | 2 页 | P7.3 |
| 15 | 通知中心 | 列表（含知识过期/结果追踪/人物档案通知） | P7.3 |
| 16 | 主题生命周期视图 | Now/Growing/Seeds/Harvest 四阶段、筛选药丸、Tab 联动 | P7.2 |
| 17 | 领域词库管理 | 设置内词库列表、搜索/增删、修正确认 | P7.3 |

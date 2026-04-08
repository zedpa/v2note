---
id: "064a"
title: "APP Mobile — Views & Pages"
status: active
domain: ui
dependencies: ["todo-core.md"]
superseded_by: null
related: ["app-mobile-nav.md"]
created: 2026-03-23
updated: 2026-04-08
# 下拉刷新场景 3.1b-3.1f 已实现 (2026-04-08)
---
# APP Mobile — Views & Pages

> 状态：🔄 实现中 | 分批: P7.1(主屏) → P7.2(侧边栏+导航) → P7.3(辅助页面)
> 进度审计: 2026-03-28 — 功能骨架基本完成，视觉对齐未开始
> 依赖：docs/frontend-backend-mapping.md（前后端功能对照清单）
> 导航模式：沿用 overlay 模式（非路由 push），与现有 app/page.tsx 架构一致
> 导航与系统层：见 specs/app-mobile-nav.md

## 概述

抛弃 Tab Bar + 纯净入口的旧方案，改为 **工作区 + 侧边栏** 双面架构。
工作区是用户 90% 时间停留的地方，只做两件事：**记录（日记）** 和 **执行（待办）**。
其余所有功能（目标、发现、回顾、设置）收进侧边栏，按需访问。

### 分批计划

| 批次 | 模块 | 场景 | 核心改动 |
|------|------|------|----------|
| **P7.1** | 整体结构(1) + 顶部栏(2) + 日记视图(3) + 待办视图(4) + FAB(5) | ~25 | 主页架构重写 |
| **P7.2** | 侧边栏(6) + 导航 overlay 页(7) | ~12 | 侧边栏改造 + overlay 页面 |
| **P7.3** | 通知(8) + 对话(9) + 冷启动(10) + 认证(11) | ~10 | 辅助页面 |

### 设计原则

- **双模输入**：FAB 单击=文字，长按=语音（微信语音条模式），两种输入零步骤到达
- **10 秒法则**：地铁上单手 10 秒内完成"看待办+标完成"
- **双面一屏**：日记和待办通过 Segment 切换，不离开主屏幕
- **管理收纳**：低频功能全部进侧边栏，主屏幕不放导航

### 设计语言 — Editorial Serenity

> 核心理念：Digital Atelier（数字工坊）— 安静、阳光充足的反思与行动空间。
> 拒绝拥挤感，用大间距和色调层次代替线条分隔。

```
配色 (Surface 层次):
  底层画布:  #FDF9F3 (surface)          最亮卡片: #FFFFFF (surface-lowest)
  次层容器:  #F7F3ED (surface-low)      沉降容器: #EBE8E2 (surface-high)
  主文字:    #1C1C18 (on-surface)       次文字: #6B5E52
  弱文字:    #7B6E62 (对比度 ≥ 4.5:1)   幽灵边框: #D7C2B8/15%
  强调:      #C8845C (deer/primary)     强调容器: #89502C (primary-dark)
  链接:      #A06B42 (antler)
  语义: 森林 #5C7A5E / 天空 #7BA3C4 / 晨光 #E8A87C / 枫红 #C45C5C

字体:
  品牌/标题/日期: Noto Serif SC（编辑风，用于 display/headline/时间戳）
  正文/功能: Inter + Noto Sans SC（中性叙述）
  元数据: Mono（归档感）
  尺寸: 正文 15px / 辅助 12px / 标题按编辑风比例放大

No-Line Rule:
  ❌ 禁止 1px 实线边框分隔内容
  ✅ 用背景色阶过渡（surface → surface-low → surface-lowest）营造层次
  ✅ 幽灵边框仅用于无障碍必须时: outline-variant #D7C2B8/15%

Breath Principle:
  ❌ 禁止 divider 分隔线
  ✅ 用 spacing-6 (2rem) 垂直间距分隔列表项
  ✅ 密集内容用 surface-low 隔行底色（柔和斑马纹）

Glass & Soul:
  浮层 (FAB/Sheet/Header): surface 色 80% opacity + backdrop-blur 12px
  FAB 渐变: linear-gradient(135deg, #89502C, #C8845C)（鹿毛色自然过渡）
  环境阴影: on-surface 6% opacity, blur 24-32px, Y offset 8px（非 shadow-md）

圆角: 卡片 12px / 按钮 xl(1.5rem) "鹅卵石" / 药丸 full / Sheet 顶部 16px
动画: 150-300ms ease-out, 尊重 prefers-reduced-motion（降级为 0ms）
```

---

## 一、整体结构

### 场景 1.1: 工作区默认态
```
假设 (Given)  用户已登录，打开 App
当   (When)   App 加载完成
那么 (Then)   显示工作区，恢复上次退出时的视图（日记或待办）
并且 (And)    顶部栏显示：左侧头像 + 中间 Segment（日记|待办）+ 右侧 🔍🔔
并且 (And)    FAB 录音按钮常驻底部居中
并且 (And)    无 Tab Bar、无底部导航
```

### 场景 1.2: 视图切换
```
假设 (Given)  用户在工作区
当   (When)   点击 Segment "待办"
那么 (Then)   工作区内容切换到待办视图，Segment 高亮"待办"
并且 (And)    切换动画：内容区水平滑动，200ms ease-out
当   (When)   点击 Segment "日记"
那么 (Then)   工作区内容切换到日记视图

全局手势规则（优先级从高到低）：
  1. 系统返回手势（屏幕边缘 <30px）— 被系统接管，应用不处理
  2. 组件级手势（待办行侧滑、Now Card 左右滑、日历条/月历左右滑）— 在组件内部消费，不冒泡到全局
  3. 侧边栏手势 — 仅日记页生效：左侧 30~200px 区域右滑 >60px 打开侧边栏
  4. Tab 切换手势 — 左右滑 >80px 切换 diary↔todo（待办页右滑切日记，日记页左滑切待办）
  5. 下拉刷新手势 — scrollTop === 0 时垂直下拉 >64px 触发；对角线手势(|dy| <= |dx|)交给水平手势处理

注意：
  - 待办视图中待办行侧滑与全局手势隔离（通过 data-testid 检测跳过全局逻辑）
  - 日历条/月历区域的水平滑动与全局手势隔离（同上，通过 data-testid='calendar-strip'/'calendar-expand' 检测）
  - 侧边栏右滑仅在日记页生效，待办页不触发（避免与待办行右滑完成冲突）
  - Tab 切换同时支持 Segment 点击和手势滑动
  - 下拉刷新在各视图滚动容器内部实现，与全局水平手势正交不冲突
```

### 场景 1.5: 主题筛选态
```
假设 (Given)  用户从侧边栏选中了某个主题（Cluster）
当   (When)   进入主题筛选态
那么 (Then)   顶部 Segment 文字变为：「脉络 | 进展」（替代「日记 | 待办」）
并且 (And)    顶部栏出现筛选药丸标签：「🌿 [主题名]  ✕」
并且 (And)    默认显示「进展」Tab（主题生命周期视图: Now/Growing/Seeds/Harvest）
并且 (And)    「脉络」Tab 显示该主题相关的日记时间线
并且 (And)    筛选状态持久化到 localStorage，切 Tab 不丢失
当   (When)   点击筛选药丸的 ✕
那么 (Then)   退出筛选态，Segment 恢复「日记 | 待办」，内容恢复全量
详见: specs/topic-lifecycle.md 场景 2-4
```

### 场景 1.3: 侧边栏打开/关闭
```
假设 (Given)  用户在工作区
当   (When)   点击左上角头像按钮
那么 (Then)   侧边栏从左侧滑入，宽度 75vw（最大 320px）
并且 (And)    遮罩: bg-black/30，工作区不可交互
并且 (And)    侧边栏背景: surface-high (#EBE8E2)
当   (When)   在日记页，从左侧 30~200px 区域右滑 >60px
那么 (Then)   同样打开侧边栏（待办页不支持此手势，避免与待办行侧滑冲突）
当   (When)   点击遮罩区域 / 左滑侧边栏 / 点击侧边栏某项跳转
那么 (Then)   侧边栏关闭
```

### 场景 1.4: 侧边栏导航（overlay 模式）
```
假设 (Given)  侧边栏已打开
当   (When)   点击侧边栏中的"发现"/"每日回顾"/"认知统计"/目标项等
那么 (Then)   侧边栏关闭，打开对应 overlay（沿用现有 overlay 系统）
并且 (And)    overlay 顶部: ← 返回按钮 + 页面标题
当   (When)   点击 ← 返回（或右滑关闭）
那么 (Then)   关闭 overlay，回到工作区主视图（日记/待办）
注意: 不使用 Next.js 路由 push，全部通过 overlay state 管理
```

---

## 二、顶部栏

### 布局

```
┌──────────────────────────────────────┐
│  (ZP)   ┌─ 日记 ─┬─ 待办 ─┐  🔍 🔔│
└──────────────────────────────────────┘
高度: 44px + 状态栏安全区
背景: surface (#FDF9F3), 80% opacity + backdrop-blur 12px (Glass & Soul)
底部: 无分隔线（No-Line Rule），靠 surface 色阶过渡区分
```

### 场景 2.1: 头像按钮
```
假设 (Given)  用户已登录，名字为 "Zed"
当   (When)   显示顶部栏
那么 (Then)   左侧显示圆形头像 (28px)，用户名首字母 "Z"，鹿毛色背景白色文字
当   (When)   点击头像
那么 (Then)   打开侧边栏
```

### 场景 2.2: Segment 切换器
```
假设 (Given)  顶部栏显示中
那么 (Then)   中间显示药丸形双段 Segment：日记 | 待办
并且 (And)    选中段：白色背景 + 轻阴影 + 树皮色文字
并且 (And)    未选中段：透明背景 + 弱文字色
并且 (And)    Segment 宽度: 160px，高度: 32px，圆角: full
```

### 场景 2.3: 通知角标
```
假设 (Given)  有未读的每日回顾 / 主动推送消息
当   (When)   显示顶部栏
那么 (Then)   🔔 图标右上角显示红色小圆点（6px）
当   (When)   点击 🔔
那么 (Then)   打开通知列表 overlay
```

### 场景 2.4: 搜索
```
假设 (Given)  用户在工作区
当   (When)   点击 🔍
那么 (Then)   打开搜索 overlay：顶部搜索框 autofocus + 键盘弹起
并且 (And)    搜索结果包含：日记记录 + 待办 + 目标 + 主题
```

---

## 三、日记视图

### 布局

```
┌──────────────────────────────────────┐
│  (ZP)   ┌ 日记 ┬ 待办 ┐     🔍  🔔 │
├──────────────────────────────────────┤
│                                      │
│  🦌(动画) "你说'算了'时，你希望什么？"  │  ← AI Window（常驻 56px）
│                                      │
│  ── 今天 · 3月26日 ─────────────    │  ← 日期分隔线
│                                      │
│  ┌──────────────────────────────┐   │  ← 日记卡片
│  │ 09:35 · 🎙 2分12秒    🧠     │   │
│  │ 今天和张总开会……              │   │
│  │ 供应链管理 · 成本控制         │   │
│  │ 🔗 3  📌 2                   │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌─ 🦌 路路发现 ────────────────┐   │  ← AI 洞察卡片（每日1-2张）
│  │ 三条供应链记录指向同一结论    │   │
│  │                 详细了解 →    │   │
│  └──────────────────────────────┘   │
│                                      │
│              [🎙 FAB]                 │
└──────────────────────────────────────┘
```

### 场景 3.1: 日记流加载
```
假设 (Given)  用户在日记视图
当   (When)   视图加载
那么 (Then)   调用 GET /records，按日期降序展示日记卡片
并且 (And)    按日期分组，显示分隔线："今天 · 3月26日" / "昨天" / "3月24日 周一"
并且 (And)    下拉刷新，上拉加载更多（分页）
```

### 场景 3.1b: 下拉刷新（Pull-to-Refresh）
```
假设 (Given)  用户在日记视图或待办视图，页面已滚动到顶部
当   (When)   用户从屏幕顶部向下拖拽超过 64px 阈值
那么 (Then)   显示下拉刷新指示器（deer 色旋转图标 + 弱文字色"刷新中..."）
并且 (And)    指示器位于 header 下方、内容区顶部，推开内容区（非浮层覆盖）
并且 (And)    日记视图调用 refetch(true)（silent 模式，不替换列表），待办视图调用 store.refresh()
并且 (And)    数据加载完成后，指示器收回（300ms ease-out 动画）
并且 (And)    加载期间最少显示指示器 500ms（与数据请求并行计时，非叠加）
并且 (And)    录音 Sheet 或沉浸式录音覆盖层展开时，抑制下拉刷新
并且 (And)    空列表状态下也支持下拉刷新（可能加载到新数据）

前置条件：globals.css 中 overscroll-behavior: none 禁用原生 pull-to-refresh，本功能为纯 JS 自定义实现。
错误提示使用 fabNotify.error()。
```

### 场景 3.1c: 下拉刷新 — 拖拽反馈
```
假设 (Given)  用户在视图顶部开始下拉
当   (When)   拖拽距离 < 64px 阈值
那么 (Then)   指示器跟随手指移动，显示箭头图标（↓）
并且 (And)    拖拽距离有阻尼效果（实际位移 = 触摸位移 × 0.4）
当   (When)   拖拽距离 ≥ 64px 阈值
那么 (Then)   箭头翻转为（↑），触发轻微震动反馈（Haptic）
当   (When)   用户在阈值以下松手
那么 (Then)   指示器回弹到初始位置，不触发刷新
```

### 场景 3.1d: 下拉刷新 — 非顶部滚动不触发
```
假设 (Given)  用户在日记视图，页面已向下滚动（scrollTop > 0）
当   (When)   用户向下拖拽
那么 (Then)   执行正常的页面滚动，不触发下拉刷新
并且 (And)    不显示刷新指示器
```

### 场景 3.1e: 下拉刷新 — 刷新失败
```
假设 (Given)  用户触发下拉刷新
当   (When)   网络请求失败或超时（10s）
那么 (Then)   指示器收回
并且 (And)    显示 Toast 提示 "刷新失败，请检查网络"
并且 (And)    保留现有数据不变
```

### 场景 3.1f: 下拉刷新 — 防重复触发
```
假设 (Given)  用户已触发下拉刷新，数据正在加载中
当   (When)   用户再次下拉
那么 (Then)   忽略本次操作，不重复发起请求
```

### 场景 3.2: AI Window（替代原 AI 伴侣气泡）
```
假设 (Given)  工作区显示中
当   (When)   日记视图或待办视图渲染
那么 (Then)   header 下方常驻 AI Window（56px 高，两种视图都可见）
并且 (And)    AI Window 包含：像素小鹿动画(32px) + 状态文字/消息内容
并且 (And)    三态切换：静默态（默认）→ 气泡态（有消息）→ 对话态（点击展开）

详见: specs/ai-companion-window.md（完整规格：小鹿状态机、心情系统、工具可视化、主动闲聊）

核心规则：
  - 小鹿状态映射真实系统数据（整理笔记=Digest中、晒太阳=完成多个待办等）
  - 简单指令（工作区内）：不展示工具调用，只显示结果气泡
  - 进入 Chat 界面 + 多步操作：展开工具调用步骤面板
  - 主动闲聊有严格频率限制（间隔 ≥ 30min，每日 ≤ 8 条）
  - 路路心情影响对话语气和开场白（注入 system prompt）

气泡消息优先级（沿用，高→低）:
  1. action.confirm — 指令确认（[确认][算了]，30s 超时）
  2. action.result  — 执行结果（✅，5s 后降级）
  3. companion.chat — 主动闲聊（基于日记的疑问/赞同/表扬，10s 后降级）
  4. reflect.question — AI 追问（点击进入对话）
  5. proactive.*      — 主动推送
  6. 静默态          — 小鹿动画 + 状态文字

当   (When)   点击 AI Window
那么 (Then)   打开对话态（参谋对话 overlay），携带心情 + 上下文
```

### 场景 3.3: 日记卡片折叠态
```
假设 (Given)  日记流中有一条记录
当   (When)   卡片渲染
那么 (Then)   显示折叠态：
  - 元数据行: "09:35 · [来源图标] · 📍公司"，弱文字色 12px
    来源图标优先级（互斥，取第一个命中项）：
    1. 🤖 AI — source 为 "chat" 或 "chat_tool"
    2. 📎 附件 — 有 file_url（图片/文件）
    3. 🌐 网页 — source 为 "url"
    4. ❝ 摘录 — source_type 为 "material"（粘贴文本）
    5. 🎙 语音 — 有 duration_seconds（语音录入）
    6. 无图标 — 手动文字输入
  - 元数据行尾部: 三点菜单 ⋮ 按钮（常驻显示，非展开后才出现）
  - 正文区域（按来源类型区分）：
    A. 纯文字记录（无 audio_path 且无 file_url）：
       - 正文: line-clamp-4, 15px 树皮色, 行高 1.7, Markdown 渲染
       - 无原文区域（文字记录不需要显示原文，摘要即内容）
    B. 语音记录（有 audio_path 或 duration_seconds > 0）：
       - 正文: AI 清理后的内容（保留全文，仅去语气词+修正错字），line-clamp-4, Markdown 渲染
       - 录音卡片（flomo 风格）：圆角容器，内含：
         - 左侧: ▶ 播放按钮 + 波形可视化 + 时长 "00:52"
         - 右侧: 「原文 >」链接按钮（primary 色文字）
    C. 附件记录（有 file_url 且非图片）：
       - 正文: 默认为空（用户可手动编辑填写）
       - 附件卡片（与录音条同风格）：圆角容器，内含：
         - 左侧: 文件类型图标 + 文件名（truncate）
         - 右侧: 「原文 >」链接按钮
    D. 图片记录（source=image 或 file_url 为图片类型）：
       - 正文: 用户手动填写的内容（可为空）
       - 图片缩略图: max-h-40, object-cover, 圆角 8px
       - 多图时: 横向排列，最多显示 3 张缩略图 + "+N" 溢出标记
  - 主题标签: 药丸样式 (有 Cluster 数据时显示)
  - 底部信息: "🔗 3 📌 2" (有数据时显示)
  - 右上角: 🧠 标记 (source_type=think) 或 📄 (material)
并且 (And)    素材类卡片（source_type=material）视觉降权：
  - 标题用次文字色（非 on-surface）
  - 卡片背景用 surface-low（非 surface-lowest），与容器色阶差更小
  - 与后端 salience 降权保持一致（material 不参与涌现，只被动吸附）
并且 (And)    卡片样式（think 类）: surface-lowest (#FFFFFF) 背景, 圆角 12px, 无边框（No-Line Rule）
并且 (And)    卡片放在 surface-low (#F7F3ED) 容器上，色阶差自然形成边界
并且 (And)    卡片间距: spacing-6 (2rem)（Breath Principle，大间距代替分隔线）
并且 (And)    内边距 16px
并且 (And)    无摘要且未处理完成时: 显示 shimmer 骨架屏
```

### 场景 3.4: 日记卡片展开态
```
假设 (Given)  日记卡片处于折叠态
当   (When)   点击卡片
那么 (Then)   展开显示完整内容，调用 GET /records/:id 加载详情
并且 (And)    展开区域包含:
  - 完整摘要文本（无 line-clamp，使用 Markdown 渲染，AI 自动排版）
  - 音频播放器（有 audio_path 时，嵌入录音卡片中）
  - 待办区: checkbox + 文字（可直接勾选完成）
  - 关联记录区: GET /records/:id/related，显示 top-3 相关记录摘要
当   (When)   点击录音卡片的「原文 >」按钮
那么 (Then)   在录音卡片下方展开原文区域，显示 transcript.text 全文
并且 (And)    原文使用 Markdown 渲染（AI 自动排版，方便阅读）
并且 (And)    再次点击「收起」可折叠原文
当   (When)   点击附件卡片的「原文 >」按钮
那么 (Then)   展开原文预览区域：
  - 录音附件: 显示 ASR 转写的原文
  - 链接附件: 显示自动提取的网页原文
  - 文本/图片文件: 显示 OCR 转换的原文
当   (When)   点击 🧠/📄 标记
那么 (Then)   切换 source_type，PATCH /records/:id/source-type
当   (When)   需要折叠卡片
那么 (Then)   点击卡片尾部的「收起」按钮（ChevronUp 图标）折叠回原态
并且 (And)    禁止点击卡片正文区域触发折叠（防止翻页误触）
并且 (And)    「收起」按钮位于展开内容的最底部，居中显示
```

### 场景 3.7: 图片缩略图与管理
```
假设 (Given)  日记卡片包含图片（source=image 或附件为图片类型）
当   (When)   折叠态渲染
那么 (Then)   显示图片缩略图（max-h-40, object-cover, rounded-lg）
并且 (And)    多图横向排列，超过 3 张显示 "+N" 溢出指示
当   (When)   点击缩略图
那么 (Then)   打开全屏图片查看器（overlay 模式，支持缩放和左右滑动）
当   (When)   长按缩略图 500ms
那么 (Then)   呼出图片管理菜单（Bottom Sheet 样式）：
  - 保存到相册
  - 删除图片
  - 取消
当   (When)   点击「删除图片」
那么 (Then)   确认弹窗 → 删除图片附件，刷新卡片
当   (When)   点击「保存到相册」
那么 (Then)   调用 Capacitor Filesystem/Photos API 保存到本地相册
```

### 场景 3.8: 附件卡片嵌入
```
假设 (Given)  日记卡片包含文件附件（有 file_url 且非纯图片）
当   (When)   卡片渲染
那么 (Then)   在正文下方显示附件卡片（与录音条同风格）：
  - 容器: 圆角 12px, surface-high 背景, 内边距 12px
  - 左侧: 文件类型图标（根据扩展名选择图标）+ 文件名（truncate, max-w-[60%]）
  - 右侧: 「原文 >」链接按钮（primary 色）
并且 (And)    附件记录的正文（short_summary）默认显示为空
并且 (And)    用户可通过三点菜单 → 编辑，手动填写正文摘要
当   (When)   点击「原文 >」按钮
那么 (Then)   展开原文预览面板，内容来源根据附件类型：
  - 录音文件（.mp3/.wav/.m4a）: transcript.text（ASR 转写结果）
  - 链接（source=url）: 自动提取的网页正文
  - 文本文件（.txt/.md/.pdf）: OCR / 直接读取的文本内容
  - 其他文件: 显示"暂不支持预览此文件类型"
并且 (And)    原文预览使用 Markdown 渲染
当   (When)   附件无原文数据（transcript 为空）
那么 (Then)   「原文」按钮显示为灰色禁用态，tooltip "原文处理中..."
```

### 场景 3.5: 日记卡片多选删除
```
假设 (Given)  日记视图显示中
当   (When)   长按某张卡片 500ms
那么 (Then)   进入选择模式：卡片显示 checkbox，底部出现工具栏（已选N条 + 取消 + 删除）
当   (When)   点击删除
那么 (Then)   确认弹窗 → DELETE /records (batch)
```

### 场景 3.5b: 粘贴检测 → 摘录标记 <!-- ✅ completed -->
```
假设 (Given)  用户打开 FAB 文字输入面板
当   (When)   用户粘贴文本到输入框
那么 (Then)   检测到 paste 事件，显示琥珀色提示条"检测到粘贴内容，将标记为摘录"
并且 (And)    提示条右侧有"取消标记"按钮，可手动撤销摘录标记
当   (When)   用户提交粘贴内容
那么 (Then)   走 POST /api/v1/ingest {type:"text", content, source_type:"material"} 路径
并且 (And)    创建的 record 的 source_type 为 "material"
并且 (And)    日记流中该条记录显示 ❝ 摘录图标（Quote icon，琥珀色）
当   (When)   用户粘贴后继续编辑文字再提交
那么 (Then)   仍然标记为摘录（isPasted 标记一旦触发不自动清除，除非手动取消）
```

### 场景 3.6: AI 洞察卡片
```
假设 (Given)  认知报告生成了洞察结果
当   (When)   日记流渲染
那么 (Then)   在适当位置插入"路路发现"卡片（每日最多 1-2 张）
并且 (And)    样式: 极浅晨光色 #FFF8F0 背景, 左侧 3px #E8A87C 竖线
并且 (And)    顶部"🦌 路路发现"标签, 正文 13px 次文字色
并且 (And)    右下"详细了解 →" 鹿角色链接
当   (When)   点击"详细了解"
那么 (Then)   打开参谋对话 overlay（mode=insight, 上下文=洞察内容）
```

---

## 四、待办视图

> 参考: Stitch "mobile_tasks_no_bottom_nav" + "task_detail_bottom_sheet" 原型
> 交互参考: specs/mobile-action-panel.md（Tinder 式 Now Card 滑动）

### 布局

```
┌──────────────────────────────────────┐
│  (ZP)   ┌ 日记 ┬ 待办 ┐     🔍  🔔 │  ← Glass header
│──────────────────────────────────────│
│                                      │  ← surface-low 底色
│  ● To Confirm                   ▾   │  ← 待确认区（可折叠）
│  ┌──────────────────────────────┐   │
│  │ "建立供应商评估体系"  [确认]  │   │  ← surface-lowest 卡片
│  └──────────────────────────────┘   │
│                                      │
│  ┌══════════════════════════════┐   │  ← Now Card（当前最高优先待办）
│  │  打给张总确认报价            │   │    surface-lowest, 圆角 16px
│  │  › 供应链评估     10:00     │   │    支持 Tinder 左右滑动
│  │    
│  └══════════════════════════════┘   │
│  ← ⏳🚧🔄 │ Now Card │ ✓ 完成 →   │  ← 左滑露出跳过标签/右滑露出完成标签
│                                      │
│        Today                  60%    │  ← Serif 大字 + 百分比
│  ┃━━━━━━━━━━━━━━━░░░░░┃  3/5       │  ← deer 色进度条
│                                      │
│  ○  审阅小李报告             14:00   │  ← 待办行 (min-h 44px)
│     › v2note 产品                    │  ← 项目标签 (次文字色)
│                                      │  ← spacing-6 间距
│  ✓  整理供应商清单                   │  ← 已完成（surface-high 底色）
│  ✓  回复老王邮件                     │
│                                      │  ← spacing-6 分组间距（无分隔线）
│  📞 "Call Manager Zhang" (3/16提到)  │  ← 转达区
│  📧 回复老王邮件                     │
│                                      │
│        Tomorrow                      │  ← Serif 分组标题
│  ○  联系新供应商             上午    │
│                                      │
│        Later                         │
│  ○  量化策略回测                     │
│                                      │
│              [🎙 FAB]                 │  ← FAB
└──────────────────────────────────────┘

Now Card: surface-lowest 背景, 圆角 16px, 环境阴影, 比普通待办行更大更突出
  - 右滑：右侧露出森林色(#5C7A5E)「✓ 完成」标签 → 松手完成
  - 左滑：左侧露出晨光色(#E8A87C) 跳过原因标签(⏳等条件/🚧有阻力/🔄要重想) → 点选原因
  - 长按下拉：弹出「今天不做」原因选择弹窗
  - 底部呼吸圆点：对应活跃目标，点击/滑动切换目标
  - 详见 specs/mobile-action-panel.md

分组标题: Noto Serif SC, display 风格, 无分隔线
分组间距: spacing-6 (2rem) — Breath Principle
待办行: 无边框，surface-lowest 背景，hover/active 时 surface-low
已完成: surface-high 底色 + 删除线 + 弱文字色，折叠到组底部
转达区: 无独立分隔线，用 spacing-6 间距 + 图标区分
```

### 场景 4.1: 待办列表加载
```
假设 (Given)  用户在待办视图
当   (When)   视图加载
那么 (Then)   调用 GET /todos + GET /action-panel/now，按时间分组显示
并且 (And)    顶部显示 Now Card：当前最高优先待办，突出卡片样式(圆角 16px + 环境阴影)
并且 (And)    Now Card 支持 Tinder 滑动交互（详见场景 4.8-4.11）
并且 (And)    Now Card 下方为分组列表，分组顺序: 待确认意图 → 今日 → 转达 → 明天 → 稍后
并且 (And)    分组标题用 Noto Serif SC，无下划线/分隔线，靠 spacing-6 间距区分
并且 (And)    今日组内: 未完成按时间排序在上，已完成折叠在下
并且 (And)    今日顶部显示进度: Serif "Today" + 百分比 + deer 色进度条 + "3/5"
并且 (And)    每条待办行显示: ○ + 标题 + 时间(右对齐) + 项目标签(次文字色，有 goal_id 时)
并且 (And)    待办行最小高度 44px（Touch target 合规）
```

### 场景 4.2: 待确认意图
```
假设 (Given)  GET /intents/pending 返回了待确认的 wish/goal
当   (When)   待办视图显示
那么 (Then)   顶部显示 "● To Confirm" 可折叠区（● 用 deer 色圆点）
并且 (And)    每条: surface-lowest 卡片，意图文字 + [确认] 鹅卵石按钮
当   (When)   点击 [确认]
那么 (Then)   POST /goals 创建目标 + POST /goals/:id/confirm
并且 (And)    卡片消失动画，可能在今日待办中出现关联待办
当   (When)   左滑意图卡片 > 80px
那么 (Then)   露出 [忽略] 按钮（枫红色），点击删除该 pending intent
```

### 场景 4.3: 待办完成
```
假设 (Given)  待办列表中有未完成项
当   (When)   点击待办左侧的空心圆 ○ (touch target ≥ 44×44px)
那么 (Then)   PATCH /todos/:id {done: true}
并且 (And)    圆圈变为 deer 色 ✓，文字加删除线 + 弱文字色，250ms ease-out
并且 (And)    待办行背景渐变到 surface-high，滑入已完成区
并且 (And)    进度条数值 + 百分比更新
```

### 场景 4.4: 待办详情 Bottom Sheet
> 参考: Stitch "task_detail_bottom_sheet" 原型
```
假设 (Given)  待办列表中有一条待办
当   (When)   点击待办文字区域
那么 (Then)   底部弹出 Task Detail Sheet（环境阴影 + 圆角 16px 顶部）
并且 (And)    Sheet 布局:
  ┌─────────────────────────────────┐
  │  ○ 待办标题                  ✕  │  ← 标题行 + 关闭按钮
  │    Status: Active                │  ← 状态标签
  │                                  │
  │  📁  项目名称                    │  ← 所属目标/项目（有 goal_id 时）
  │  📥  收件箱 / 分类               │  ← 来源
  │  📅  周五 4:00 PM                │  ← scheduled_start 日期时间
  │  ❗  Priority 1                  │  ← 优先级
  │  🏷️  标签                        │  ← Reflection Chip 样式
  │  ⏱️  30 分钟                     │  ← estimated_minutes
  │                                  │
  │  [ Deadline ] [ Move to... ]     │  ← 快捷操作鹅卵石按钮
  │                                  │
  │  Sub-tasks                   +   │  ← 子任务（如 ai_action_plan）
  │  ☐ Step 1                       │
  │  ☐ Step 2                       │
  │                                  │
  │  Comment...            🎙  ▶   │  ← 底部评论/语音输入
  └─────────────────────────────────┘
并且 (And)    Sheet 背景: surface-lowest (#FFFFFF)
并且 (And)    如 ai_actionable=true，Sub-tasks 显示 action_plan 步骤 + "让AI帮忙" 按钮
当   (When)   修改任何字段
那么 (Then)   PATCH /todos/:id 实时保存
当   (When)   点击 "让AI帮忙"
那么 (Then)   关闭 Sheet → 打开参谋对话 overlay（mode=command, 上下文=该待办）
当   (When)   底部评论区点击 🎙
那么 (Then)   录音 → 转写 → 追加为待办备注
```

### 场景 4.5: 待办左滑跳过
```
假设 (Given)  待办列表中有一条未完成待办
当   (When)   左滑该条 > 80px
那么 (Then)   露出跳过操作区，显示三个标签按钮:
  - ⏳ 等条件
  - 🚧 有阻力
  - 🔄 要重想
当   (When)   点击某个标签
那么 (Then)   POST /action-panel/event {type: "skip", todo_id, reason}
并且 (And)    该待办移到"稍后"分组
```

### 场景 4.8: Now Card 右滑完成
```
假设 (Given)  Now Card 显示当前最高优先待办
当   (When)   用户开始右滑 Now Card
那么 (Then)   卡片右侧逐渐露出森林色(#5C7A5E)背景区域
并且 (And)    露出区域显示「✓ 完成」标签 + 森林色圆形勾选图标
并且 (And)    滑动距离 >40px 时标签激活（半透明→全不透明）
当   (When)   右滑超过 80px 松手
那么 (Then)   POST /action-panel/event {type:"complete", todo_id}
并且 (And)    卡片向右飞出 + 森林色消散粒子，300ms ease-out
并且 (And)    下一行动从下方 spring 上升到 Now Card
并且 (And)    进度条数值更新
当   (When)   右滑未超过阈值松手
那么 (Then)   卡片弹回原位，200ms ease-out
```

### 场景 4.9: Now Card 左滑跳过（单步滑动 + Action Sheet）
```
假设 (Given)  Now Card 显示当前最高优先待办
当   (When)   用户开始左滑 Now Card
那么 (Then)   卡片左侧逐渐露出晨光色(#E8A87C)背景区域
并且 (And)    露出区域显示「跳过 →」标签
并且 (And)    滑动距离 >40px 时标签激活
当   (When)   左滑超过 80px 松手
那么 (Then)   卡片向左飞出 + skip_count += 1
并且 (And)    弹出底部 Action Sheet 选择跳过原因：
              ⏳ 等条件 | 🚧 有阻力 | 🔄 要重想 | [取消]
并且 (And)    选择原因 → POST /action-panel/event {type:"skip", todo_id, reason}
并且 (And)    取消 → reason 记录为 "later"
并且 (And)    下一行动上升到 Now Card
注意: 简化为单步操作（滑动即跳过），原因选择后置到 Sheet，降低认知负担
```

### 场景 4.10: Now Card 长按下拉"今天不做"
```
假设 (Given)  Now Card 显示中
当   (When)   用户长按 Now Card 并下拉
那么 (Then)   弹出原因选择弹窗：⏳ 等待中-选新日期 / 🚧 卡住了-需要重想
当   (When)   用户选择原因
那么 (Then)   POST /action-panel/event {type:"cancel_today", todo_id, reason}
并且 (And)    行动从今日列表移除，记录原因
```

### 场景 4.11: Now Card 反复跳过触发反思
```
假设 (Given)  某行动 skip_count ≥ 5
当   (When)   该行动再次出现在 Now Card
那么 (Then)   Now Card 顶部显示提示条（晨光色底）：
              "$事项，已经在这里 $天数 了，要聊聊吗？"
并且 (And)    提示条可点击 → 打开参谋对话 overlay（mode=review, context=该待办）
```

### 场景 4.12: Now Card 目标呼吸指示器
```
假设 (Given)  用户有多个活跃目标
当   (When)   Now Card 显示
那么 (Then)   底部显示呼吸圆点（每个目标一个圆点，当前高亮）
并且 (And)    呼吸频率映射目标健康度（健康=慢呼吸 3s，需关注=快呼吸 1s）
并且 (And)    需关注的目标圆点旁显示小文字标签「需关注」（不仅依赖动画传达）
并且 (And)    prefers-reduced-motion 下：呼吸停止，需关注的圆点改为略大尺寸(1.5x) + 晨光色
并且 (And)    色盲兼容：用尺寸差异而非仅颜色区分状态
当   (When)   点击某个圆点或左右滑动 Now Card 下方区域
那么 (Then)   切换到该目标相关的待办队列
```

### 场景 4.6: 转达区
```
假设 (Given)  GET /daily/relays 返回了待联系的人
当   (When)   待办视图显示
那么 (Then)   在今日待办下方显示"转达"分组
并且 (And)    每条: 📞/📧 图标 + 转达内容 + 来源日期
当   (When)   点击某条转达
那么 (Then)   PATCH /daily/relays/:id {done: true}，标记完成
```

### 场景 4.7: 语音创建待办
```
假设 (Given)  用户在待办视图
当   (When)   点击 FAB 录音，说"明天下午三点开产品评审会"
那么 (Then)   录音结束后 AI 处理，识别为 intend 类型
并且 (And)    自动创建待办（text="开产品评审会", scheduled_start=明天15:00）
并且 (And)    待办出现在待办视图"明天"分组
```

---

## 五、FAB 录音按钮

### 布局
```
位置: 底部居中, 距底部 24px (含安全区)
尺寸: 56px 圆形
颜色: linear-gradient(135deg, #89502C, #C8845C) 鹿毛色渐变（Glass & Soul）
图标: 白色 Mic SVG (24px)
阴影: on-surface 6% opacity, blur 24px, Y 8px（环境阴影，非 shadow-md）
层级: 高于所有内容, 所有视图可见
Touch target: ≥ 56×56px（合规）
```

### 场景 5.1: 单击 FAB — 文字输入（统一入口）
```
假设 (Given)  FAB 处于 idle 态
当   (When)   单击 FAB（tap，非长按）
那么 (Then)   弹出文字输入底部 Sheet（Glass & Soul 毛玻璃背景）
并且 (And)    Sheet 内容:
  - 多行文本输入区，placeholder "记点什么…"，autofocus，键盘弹起
  - 附件预览区（有附件时显示）
  - 底部工具栏: 📎附件 + 🏷️标签 + 🧠思考/📄素材切换 + 🎙语音切换 + 发送按钮
当   (When)   输入 "/" 开头
那么 (Then)   关闭输入框，打开参谋对话 overlay（mode=command）
当   (When)   点击 [发送]
那么 (Then)   文本统一进入 Process handler
并且 (And)    AI 自动判断意图类型（见场景 5.5-5.8）
并且 (And)    用户不需要区分"录日记"还是"发指令"
当   (When)   点击工具栏 🎙 语音切换按钮
那么 (Then)   关闭文字 Sheet → 进入录音 Sheet（等效长按 FAB 后锁定）
```

### 场景 5.2: 长按 FAB — 语音录入（微信语音条模式）
```
假设 (Given)  FAB 处于 idle 态
当   (When)   长按 FAB ≥ 300ms
那么 (Then)   立即开始录音（WS asr.start）
并且 (And)    FAB 区域扩大为录音指示条: 红色脉冲圆点 + "松开发送" + 计时器 + 波形
并且 (And)    触觉反馈（haptic light）
当   (When)   松开手指（无滑动）
那么 (Then)   WS asr.stop → 转写 → 文本统一进入 Process handler
并且 (And)    AI 自动判断意图类型（见场景 5.5-5.8）
当   (When)   长按状态下左滑 > 80px
那么 (Then)   显示"松开取消"提示，松开后取消录音，不发送
当   (When)   长按状态下右滑 > 80px
那么 (Then)   显示"松开锁定"提示，松开后进入锁定常驻录音模式
并且 (And)    锁定模式: 底部弹出录音 Sheet（大波形 + ■停止按钮 + ✕取消按钮）
并且 (And)    用户可放下手指自由操作，点 ■ 停止时发送
```

### 场景 5.3: 长按 FAB — 沉浸录音（锁定后）
```
假设 (Given)  长按右滑锁定进入了录音 Sheet
当   (When)   录音 Sheet 显示中
那么 (Then)   Sheet 内容: 红色脉冲圆点 + "录音中" + 计时器 + 32根波形
并且 (And)    两按钮: ✕取消(灰) / ■停止(红,最大)
当   (When)   点击 ■ 停止
那么 (Then)   WS asr.stop，显示转写文本预览 + [发送] 按钮
当   (When)   点击 [发送]
那么 (Then)   文本统一进入 Process handler（AI 自动判断意图）
当   (When)   点击 ✕ 取消
那么 (Then)   丢弃录音，关闭 Sheet
```

### 场景 5.4: FAB 状态变形
```
假设 (Given)  用户发送了一条录音或文字
当   (When)   后台 AI 处理中
那么 (Then)   FAB 变为胶囊形: Sparkles旋转图标 + 俏皮话("正在翻译脑电波…")
并且 (And)    30s 超时安全重置
当   (When)   处理完成（无论是日记还是指令）
那么 (Then)   FAB 恢复圆形 idle 态
```

### 场景 5.5: 语音指令自动识别 — 记录型
```
假设 (Given)  用户通过 FAB 录音/文字发送了一段话
当   (When)   Process 识别为 record 类型（如"今天和张总开会，他说原材料涨了"）
那么 (Then)   正常创建日记 → Digest → Strike 提取
并且 (And)    日记流顶部出现新卡片
并且 (And)    不触发任何 Agent 指令操作
```

### 场景 5.6: 语音指令自动识别 — 指令型
```
假设 (Given)  用户通过 FAB 录音/文字发送了一段话
当   (When)   Process 识别为 action 类型（如"把张总那个改到明天下午三点"）
那么 (Then)   执行对应 Agent 操作（匹配待办 → PATCH /todos/:id）
并且 (And)    WS 推送 action.result 给前端
并且 (And)    AI 伴侣气泡显示执行结果:
  ┌─ ✅ 路路 ─────────────────────┐
  │ 已将"打给张总"改到明天下午3点。│
  │                    查看 →     │
  └──────────────────────────────┘
并且 (And)    纯指令不创建日记记录
并且 (And)    点击"查看"跳转待办视图，高亮该条待办
```

### 场景 5.7: 语音指令自动识别 — 混合型
```
假设 (Given)  用户通过 FAB 录音发送了一段话
当   (When)   Process 识别为 mixed 类型（如"开会说了涨价，提醒我明天问张总报价"）
那么 (Then)   记录部分: 创建日记"开会说了涨价"，正常 Digest
并且 (And)    指令部分: 创建待办"明天问张总报价"
并且 (And)    AI Window 气泡态显示双结果摘要（action.result 样式）：
  「✅ 已记录，并创建了待办'问张总报价'（明天）」
  右下「查看待办 →」链接
并且 (And)    日记流出现新卡片 + 待办视图出现新待办
并且 (And)    如果用户在待办视图，日记卡片静默创建（不跳转）；反之亦然
注意: mixed 类型需要明确告知用户"同时做了两件事"，避免用户遗漏
```

### 场景 5.8: 语音指令 — 需确认（高风险操作）
```
假设 (Given)  用户通过 FAB 说了删除或批量修改类指令
当   (When)   Process 识别为 action 类型且 risk_level=high
那么 (Then)   AI 伴侣气泡显示确认请求:
  ┌─ 🦌 路路 ─────────────────────┐
  │ 确认取消"周五评审会"吗？       │
  │                               │
  │      [确认]     [算了]         │
  └──────────────────────────────┘
当   (When)   用户点击 [确认] 或再次录音说"确认"
那么 (Then)   执行操作，气泡更新为 ✅ 结果
当   (When)   用户点击 [算了]
那么 (Then)   不执行，气泡消失
```

### 场景 5.9: 语音查询
```
假设 (Given)  用户通过 FAB 说了查询类指令（如"我明天有什么安排"）
当   (When)   Process 识别为 action 类型: query_todo/query_record
那么 (Then)   AI 伴侣气泡展示查询结果摘要:
  ┌─ 🦌 路路 ─────────────────────┐
  │ 明天有 3 件事:                 │
  │ 1. 联系新供应商 (上午)         │
  │ 2. 产品评审会 (15:00)         │
  │ 3. 团队周会 (17:00)           │
  │                    查看全部 → │
  └──────────────────────────────┘
并且 (And)    点击"查看全部"跳转待办视图
并且 (And)    不创建日记记录
```

### 场景 5.10: 语音指令匹配失败
```
假设 (Given)  用户说了指令但目标不存在（如"把李总那个改到明天"但无李总相关待办）
当   (When)   模糊匹配未找到待办
那么 (Then)   AI 伴侣气泡:
  ┌─ 🦌 路路 ─────────────────────┐
  │ 没找到和"李总"相关的待办。      │
  │ 要新建一个吗？                 │
  │      [新建]     [算了]         │
  └──────────────────────────────┘
当   (When)   点击 [新建]
那么 (Then)   创建新待办，提取原文中的时间/内容
```

---

## 验收行为（E2E 锚点）— 日记卡片布局重构

> 以下描述纯用户视角的操作路径，用于生成 E2E 测试。

### 行为 E1: 语音日记卡片的录音条与原文展开
1. 用户在日记视图看到一条语音日记卡片
2. 卡片折叠态显示：AI 总结正文 + 录音卡片（播放按钮 + 时长 + 「原文 >」）
3. 点击「原文 >」，录音卡片下方展开显示完整转录原文（Markdown 排版）
4. 再次点击「收起」，原文区域折叠

### 行为 E2: 文字日记卡片无原文区域
1. 用户在日记视图看到一条纯文字日记
2. 卡片折叠态显示正文摘要，无录音条，无「原文」按钮
3. 点击卡片展开，显示完整正文（Markdown），无原文区域

### 行为 E3: 图片缩略图与管理
1. 用户在日记视图看到一条包含图片的记录
2. 折叠态显示图片缩略图
3. 点击缩略图 → 全屏查看原图
4. 长按缩略图 → 弹出管理菜单（保存/删除）

### 行为 E4: 展开卡片的折叠方式
1. 用户点击日记卡片，卡片展开
2. 在展开状态下，点击卡片正文区域，不会触发折叠
3. 滚动到卡片底部，点击「收起」按钮，卡片折叠

### 行为 E5: 附件卡片嵌入
1. 用户在日记视图看到一条包含文件附件的记录
2. 卡片内显示附件卡片（文件图标 + 文件名 + 「原文 >」）
3. 点击「原文 >」展开预览原文内容
4. 附件记录的正文默认为空，用户可通过编辑手动填写

## 验收行为（E2E 锚点）— 下拉刷新

### 行为 E6: 日记视图下拉刷新
1. 用户在日记视图，页面在顶部
2. 用户从顶部向下拖拽超过阈值
3. 页面显示刷新指示器（旋转动画）
4. 数据重新加载，新数据显示在列表中
5. 指示器消失

### 行为 E7: 待办视图下拉刷新
1. 用户切换到待办视图，页面在顶部
2. 用户从顶部向下拖拽超过阈值
3. 页面显示刷新指示器
4. 待办列表重新加载
5. 指示器消失

### 行为 E8: 非顶部位置不触发下拉刷新
1. 用户在日记视图，向下滚动一段距离
2. 用户继续向下拖拽
3. 页面正常滚动，不出现刷新指示器

### 行为 E9: 下拉刷新网络失败
1. 用户在日记视图，页面在顶部
2. 网络断开（mock 网络错误）
3. 用户下拉刷新
4. 指示器显示后收回
5. 页面显示错误提示 Toast
6. 列表数据保持不变

## 边界条件（视图相关）

- [ ] 下拉刷新期间重复触发：忽略，不重复请求
- [ ] 下拉刷新网络失败：Toast 提示，保留现有数据
- [ ] 下拉未达阈值松手：回弹，不触发刷新
- [ ] prefers-reduced-motion 下的下拉刷新：指示器直接显示/隐藏，无动画；Haptic 反馈不受影响（震动非 motion）
- [ ] 空日记流：Serif 大字空状态 + 路路插画 + "开始你的第一条记录吧"（display-lg 3.5rem）
- [ ] 空待办：Serif "今日清单已清空" + 路路鼓励语
- [ ] 超长日记文本：折叠态 line-clamp-4，展开态无限制
- [ ] 超长录音原文：展开时无限制，Markdown 渲染
- [ ] 并发录音：FAB 状态机防止双重录音（activeRef 保护）
- [ ] AI 处理中：骨架屏 shimmer + FAB 胶囊变形
- [ ] 视图切换中录音：录音 Sheet 不因视图切换而关闭
- [ ] 语音输入中断（来电/切后台）：录音暂停，恢复后提示"继续录音？"
- [ ] prefers-reduced-motion：所有动画降级为 0ms，滑动切换改为 instant
- [ ] 附件原文不可用：「原文」按钮灰色禁用态
- [ ] 图片加载失败：显示 broken-image 占位图

## 无障碍 (Accessibility)

- 对比度: 所有正文 ≥ 4.5:1（弱文字 #7B6E62 on surface ≥ 4.5:1）
- Touch target: 所有可交互元素 ≥ 44×44px（FAB 56px, 待办行 44px）
- Focus ring: 键盘导航时 2px deer 色 outline（仅键盘用户可见）
- aria-label: SVG 图标按钮必须有 aria-label
- 标题层级: h1(页面) → h2(分组) → h3(子标题)，不跳级
- Dynamic Type: 支持系统字体缩放，避免截断
- 减少动画: 尊重 prefers-reduced-motion

## 依赖（视图相关）

- **specs/voice-action.md** — 语音指令自动识别（Process 意图分类 + Agent 执行）
- **docs/frontend-backend-mapping.md** — 前后端功能对照清单
- **Stitch 原型** — mobile_tasks_no_bottom_nav / task_detail_bottom_sheet
- **Editorial Serenity 设计系统** — No-Line Rule / Breath Principle / Glass & Soul
- gateway WebSocket (实时消息 + ASR + action.result/confirm)
- gateway REST API (全部 CRUD)
- Capacitor (原生能力: 麦克风/相机/文件/推送)
- shadcn/ui + Tailwind CSS (UI 组件)
- 现有 features/ 模块（大量可复用，需重组布局）

## 备注

- 本 spec 覆盖移动端主屏页面视图和交互，导航与系统层见 specs/app-mobile-nav.md
- **导航模式: overlay**（沿用现有 app/page.tsx overlay 系统，非 Next.js 路由 push）
- **FAB 交互改变**：单击=文字输入 Sheet，长按=语音录入（微信语音条：松开发送/左滑取消/右滑锁定）
- **关键改变：不再区分"录日记"和"发指令"两种模式**，文字和语音统一入口，AI 自动判断意图
- voice-action 的 action.result / action.confirm WS 消息通过 AI 伴侣气泡展示
- **设计语言: Editorial Serenity** — 禁止 1px 边框，用色阶层次；禁止分隔线，用大间距
- SVG 图标替代 emoji（spec 中 emoji 仅为占位符）
- 参考 apps: Todoist（侧边栏管理）、Flomo（日记流）、滴答清单（待办交互）

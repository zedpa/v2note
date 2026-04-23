---
id: "app-mobile-views-diary"
status: active
domain: app-mobile
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# APP Mobile — Diary 视图（日记）

> 拆分来源：app-mobile-views.md（已拆分为 diary / todo 两个子域）
> 状态：🔄 实现中 | 分批: P7.1(主屏) → P7.2(侧边栏+导航) → P7.3(辅助页面)
> 进度审计: 2026-03-28 — 功能骨架基本完成，视觉对齐未开始
> 依赖：docs/frontend-backend-mapping.md（前后端功能对照清单）
> 导航模式：沿用 overlay 模式（非路由 push），与现有 app/page.tsx 架构一致
> 导航与系统层：见 specs/app-mobile-nav.md
> 待办视图与 FAB：见 specs/app-mobile-views-todo.md

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

### 场景 1.2a: 日历滑动与 Tab 切换手势隔离 <!-- ✅ completed (fix-calendar-swipe-conflict) -->
```
假设 (Given)  用户在待办视图的时间视图，日历条或展开月历可见
当   (When)   用户在日历条/月历区域左右滑动超过 80px
那么 (Then)   只切换日历的周/月，不触发 Tab 切换
并且 (And)    用户仍停留在待办页，不跳到日记页
当   (When)   用户在日历以外的区域左右滑动超过 80px
那么 (Then)   正常触发 Tab 切换（左滑→日记，右滑→待办）
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
当   (When)   用户打开主屏
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
那么 (Then)   加载日记列表，按日期降序展示日记卡片
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

### 场景 3.3a: 三点菜单按钮位置固定 <!-- ✅ completed (fix-note-card-menu-position) -->
```
假设 (Given)  一条日记卡片有 5 个以上标签，meta 行内容较长
当   (When)   用户打开日记视图，卡片渲染完成
那么 (Then)   三点菜单按钮固定在 meta 行右上角，不随标签换行
并且 (And)    标签区域在左侧自由换行，菜单按钮不参与换行
```

### 场景 3.3b: 短文字附件卡片不触发 body 展开 <!-- ✅ completed (fix-card-expand-collapse) -->
```
假设 (Given)  一条带录音或附件的卡片，正文一行未被截断
当   (When)   用户点击卡片 body 非按钮区域
那么 (Then)   卡片不展开
当   (When)   用户点击"原文 >"按钮
那么 (Then)   卡片展开并显示原文面板
并且 (And)    展开区域紧贴"收起"按钮，无多余空白
```

### 场景 3.3c: 就地编辑窗口自适应高度 <!-- ✅ completed (fix-note-card-edit-image) -->
```
假设 (Given)  一条日记有 10 行文字
当   (When)   用户点击卡片的"编辑"按钮
那么 (Then)   编辑框高度自动展开至能显示全部文字（上限 50vh）
并且 (And)    一行内容的编辑框不低于 80px
并且 (And)    超过上限时编辑框内出现滚动条
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
那么 (Then)   将图片保存到系统相册，完成后提示"已保存"
```

### 场景 3.7a: 图片卡片优先显示缩略图 <!-- ✅ completed (fix-image-thumbnail, fix-note-card-edit-image) -->
```
假设 (Given)  用户上传或粘贴了一张图片，卡片已渲染
当   (When)   用户打开日记视图
那么 (Then)   卡片顶部显示图片缩略图（max-h-40, 圆角）
并且 (And)    缩略图渲染在文字摘要之前
并且 (And)    当图片识别失败时，不显示"[图片内容无法识别]"等提示文字
并且 (And)    历史数据（OSS URL 带参数 / data URL / source=manual 的图片）都能识别为图片
```

### 场景 3.7b: 图片加载失败降级 <!-- ✅ completed (fix-image-thumbnail) -->
```
假设 (Given)  图片的 URL 已失效或无法访问
当   (When)   用户打开含该图片的卡片
那么 (Then)   隐藏破损的图片区域
并且 (And)    显示文件图标占位符，卡片不会完全空白
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

## 验收行为（E2E 锚点）— 日记卡片布局重构

> 以下描述纯用户视角的操作路径，用于生成 E2E 测试。

### 行为 1: 语音日记卡片的录音条与原文展开
1. 用户在日记视图看到一条语音日记卡片
2. 卡片折叠态显示：AI 总结正文 + 录音卡片（播放按钮 + 时长 + 「原文 >」）
3. 点击「原文 >」，录音卡片下方展开显示完整转录原文（Markdown 排版）
4. 再次点击「收起」，原文区域折叠

### 行为 2: 文字日记卡片无原文区域
1. 用户在日记视图看到一条纯文字日记
2. 卡片折叠态显示正文摘要，无录音条，无「原文」按钮
3. 点击卡片展开，显示完整正文（Markdown），无原文区域

### 行为 3: 图片缩略图与管理
1. 用户在日记视图看到一条包含图片的记录
2. 折叠态显示图片缩略图
3. 点击缩略图 → 全屏查看原图
4. 长按缩略图 → 弹出管理菜单（保存/删除）

### 行为 4: 展开卡片的折叠方式
1. 用户点击日记卡片，卡片展开
2. 在展开状态下，点击卡片正文区域，不会触发折叠
3. 滚动到卡片底部，点击「收起」按钮，卡片折叠

### 行为 5: 附件卡片嵌入
1. 用户在日记视图看到一条包含文件附件的记录
2. 卡片内显示附件卡片（文件图标 + 文件名 + 「原文 >」）
3. 点击「原文 >」展开预览原文内容
4. 附件记录的正文默认为空，用户可通过编辑手动填写

## 验收行为（E2E 锚点）— 下拉刷新

### 行为 6: 日记视图下拉刷新
1. 用户在日记视图，页面在顶部
2. 用户从顶部向下拖拽超过阈值
3. 页面显示刷新指示器（旋转动画）
4. 数据重新加载，新数据显示在列表中
5. 指示器消失

### 行为 7: 待办视图下拉刷新
1. 用户切换到待办视图，页面在顶部
2. 用户从顶部向下拖拽超过阈值
3. 页面显示刷新指示器
4. 待办列表重新加载
5. 指示器消失

### 行为 8: 非顶部位置不触发下拉刷新
1. 用户在日记视图，向下滚动一段距离
2. 用户继续向下拖拽
3. 页面正常滚动，不出现刷新指示器

### 行为 9: 下拉刷新网络失败
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
- [ ] 超长日记文本：折叠态 line-clamp-4，展开态无限制
- [ ] 超长录音原文：展开时无限制，Markdown 渲染
- [ ] AI 处理中：骨架屏 shimmer
- [ ] 附件原文不可用：「原文」按钮灰色禁用态
- [ ] 图片加载失败：显示 broken-image 占位图

## 无障碍 (Accessibility)

- 对比度: 所有正文 ≥ 4.5:1（弱文字 #7B6E62 on surface ≥ 4.5:1）
- Touch target: 所有可交互元素 ≥ 44×44px
- Focus ring: 键盘导航时 2px deer 色 outline（仅键盘用户可见）
- aria-label: SVG 图标按钮必须有 aria-label
- 标题层级: h1(页面) → h2(分组) → h3(子标题)，不跳级
- Dynamic Type: 支持系统字体缩放，避免截断
- 减少动画: 尊重 prefers-reduced-motion

## 依赖（视图相关）

- **specs/app-mobile-views-todo.md** — 姊妹 spec（待办视图 + FAB）
- **specs/voice-action.md** — 语音指令自动识别（Process 意图分类 + Agent 执行）
- **docs/frontend-backend-mapping.md** — 前后端功能对照清单
- **Editorial Serenity 设计系统** — No-Line Rule / Breath Principle / Glass & Soul
- gateway WebSocket (实时消息 + ASR + action.result/confirm)
- gateway REST API (全部 CRUD)
- Capacitor (原生能力: 麦克风/相机/文件/推送)
- shadcn/ui + Tailwind CSS (UI 组件)
- 现有 features/ 模块（大量可复用，需重组布局）

## 备注

- 本 spec 覆盖移动端日记视图（含整体结构/顶栏/日记流），待办视图与 FAB 见 `app-mobile-views-todo.md`
- 导航与系统层见 specs/app-mobile-nav.md
- **导航模式: overlay**（沿用现有 app/page.tsx overlay 系统，非 Next.js 路由 push）
- **设计语言: Editorial Serenity** — 禁止 1px 边框，用色阶层次；禁止分隔线，用大间距
- SVG 图标替代 emoji（spec 中 emoji 仅为占位符）
- 参考 apps: Todoist（侧边栏管理）、Flomo（日记流）

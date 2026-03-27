# APP 移动端重构

> 状态：🟡 待开发 | 分批: P7.1(主屏) → P7.2(侧边栏+导航) → P7.3(辅助页面)
> 依赖：docs/frontend-backend-mapping.md（前后端功能对照清单）
> 导航模式：沿用 overlay 模式（非路由 push），与现有 app/page.tsx 架构一致

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
当   (When)   点击 Segment "待办"（或从日记视图左滑）
那么 (Then)   工作区内容切换到待办视图，Segment 高亮"待办"
并且 (And)    切换动画：内容区水平滑动，200ms ease-out
当   (When)   点击 Segment "日记"（或从待办视图右滑）
那么 (Then)   工作区内容切换到日记视图
注意: 左滑=前进(日记→待办)，右滑=后退(待办→日记)，与 iOS 返回手势方向一致
```

### 场景 1.3: 侧边栏打开/关闭
```
假设 (Given)  用户在工作区
当   (When)   点击左上角头像按钮（或从屏幕左边缘右滑）
那么 (Then)   侧边栏从左侧滑入，宽度 75vw（最大 320px）
并且 (And)    遮罩: bg-black/30，工作区不可交互
并且 (And)    侧边栏背景: surface-high (#EBE8E2)
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
│  ┌─ 🦌 路路 ────────────────────┐   │  ← AI 伴侣气泡（有时）
│  │ "你说'算了'时，你希望什么？"  │   │
│  └──────────────────────────────┘   │
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

### 场景 3.2: AI 伴侣气泡
```
假设 (Given)  Gateway 通过 WebSocket 推送了消息
当   (When)   日记视图或待办视图显示中
那么 (Then)   日记流/待办流顶部显示 AI 伴侣气泡（两种视图都可见）
并且 (And)    气泡样式：左侧 🦌 图标 + 消息文字，bg-primary/5 border-primary/10
并且 (And)    animate-bubble-enter（translateY 8→0，0.3s）

气泡消息优先级（高→低，高优先覆盖低优先）:
  1. action.confirm — 指令确认请求（含 [确认][算了] 按钮）
  2. action.result  — 指令执行结果（✅ 样式 + 可选"查看"链接）
  3. reflect.question — AI 追问（点击进入对话）
  4. proactive.*      — 主动推送（晨间/待办/转达）
  5. ai.status        — AI 状态（弱文字色，如"小鹿正在打盹"）

action.result 气泡样式:
  - 绿色左侧竖线 3px (#5C7A5E)
  - "✅ 已将'打给张总'改到明天下午3点"
  - 右下"查看 →" 链接（跳转对应视图）
  - 5 秒后自动降级为 ai.status

action.confirm 气泡样式:
  - 晨光色左侧竖线 3px (#E8A87C)
  - 确认文字 + [确认] [算了] 两个 pill 按钮
  - 不自动消失，等用户回应
  - 30 秒超时后自动取消并显示"已超时取消"

当   (When)   点击追问气泡
那么 (Then)   打开参谋对话 overlay（mode=review），AI 追问作为 assistant 消息
当   (When)   无任何消息时
那么 (Then)   显示 AI 状态消息（ai.status），弱文字色
```

### 场景 3.3: 日记卡片折叠态
```
假设 (Given)  日记流中有一条语音日记
当   (When)   卡片渲染
那么 (Then)   显示折叠态：
  - 元数据行: "09:35 · 🎙 2分12秒 · 📍公司"，弱文字色 12px
  - 正文: line-clamp-4, 15px 树皮色, 行高 1.6
  - 主题标签: 药丸样式 (有 Cluster 数据时显示)
  - 底部信息: "🔗 3 📌 2" (有数据时显示)
  - 右上角: 🧠 标记 (source_type=think) 或 📄 (material)
并且 (And)    卡片样式: surface-lowest (#FFFFFF) 背景, 圆角 12px, 无边框（No-Line Rule）
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
  - 完整摘要文本（无 line-clamp）
  - 音频播放器（有 audio_path 时）: ▶ 00:00 ━━━━━━━░░ 2:12
  - Strike 区: 极性图标(👁蓝/⚖️橙/💡紫/🎯绿/❤️红) + nucleus + [纠正]按钮
  - 待办区: checkbox + 文字（可直接勾选完成）
  - 关联记录区: GET /records/:id/related，显示 top-3 相关记录摘要
  - "💬 和路路聊聊这条" 链接按钮
当   (When)   点击 [纠正] 按钮
那么 (Then)   弹出编辑框修改 nucleus 或 polarity，PATCH /strikes/:id
当   (When)   点击 🧠/📄 标记
那么 (Then)   切换 source_type，PATCH /records/:id/source-type
当   (When)   再次点击卡片
那么 (Then)   折叠回原态
```

### 场景 3.5: 日记卡片多选删除
```
假设 (Given)  日记视图显示中
当   (When)   长按某张卡片 500ms
那么 (Then)   进入选择模式：卡片显示 checkbox，底部出现工具栏（已选N条 + 取消 + 删除）
当   (When)   点击删除
那么 (Then)   确认弹窗 → DELETE /records (batch)
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
│  │  ● ● ○  目标呼吸指示器      │   │    底部小圆点=目标切换
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

### 场景 4.9: Now Card 左滑跳过
```
假设 (Given)  Now Card 显示当前最高优先待办
当   (When)   用户开始左滑 Now Card
那么 (Then)   卡片左侧逐渐露出晨光色(#E8A87C)背景区域
并且 (And)    露出区域显示三个跳过原因标签（纵向排列）：
              ⏳ 等条件 | 🚧 有阻力 | 🔄 要重想
并且 (And)    滑动距离 >40px 时标签激活
当   (When)   左滑超过 80px 松手
那么 (Then)   露出区域固定，等待用户点击原因标签
当   (When)   用户点击某个原因标签
那么 (Then)   POST /action-panel/event {type:"skip", todo_id, reason}
并且 (And)    卡片向左飞出 + skip_count += 1
并且 (And)    下一行动上升到 Now Card
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
并且 (And)    呼吸频率映射目标健康度（健康=慢呼吸，需关注=快呼吸）
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
并且 (And)    AI 伴侣气泡: "记下来了。另外帮你创建了待办'问张总报价'，排在明天。"
并且 (And)    日记流出现新卡片 + 待办视图出现新待办
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

## 六、侧边栏

### 布局

```
┌─────────────────────────────────┐
│  (ZP)  Zed        🔔    ⚙️     │  ← 头像 + 用户名 + 快捷入口
│                                 │
│  🔍  搜索                       │  ← 搜索入口
│                                 │  ← spacing-6 分组间距（无分隔线）
│  📋  每日回顾              ●    │
│  🗺️  发现                       │  ← 浏览组
│  📊  认知统计                    │
│                                 │  ← spacing-6 分组间距
│  我的目标                   +   │  ← Serif 小标题
│  📁  Q2 供应链重建          3   │
│  📁  v2note 产品            2   │  ← 目标组
│  🎯  量化交易               1   │
│  💡  团队培训计划        确认?  │
│                                 │  ← spacing-6 分组间距
│  🔮  洞察视角                    │
│  🦌  路路设置                    │  ← 配置组
│  ⚙️  设置                       │
│                                 │
│  退出登录                        │  ← 弱文字色
└─────────────────────────────────┘
宽度: 75vw, 最大 320px
背景: surface-high (#EBE8E2)（No-Line Rule: 组间靠 spacing 分隔，无分隔线）
遮罩: bg-black/30
动画: 左侧滑入 200ms ease-out, 尊重 prefers-reduced-motion
```

### 场景 6.1: 侧边栏内容
```
假设 (Given)  用户点击头像打开侧边栏
当   (When)   侧边栏显示
那么 (Then)   顶部显示: 头像(40px) + 用户名 + 🔔通知 + ⚙️快捷设置
并且 (And)    功能区分三组:
  第一组(浏览): 搜索 / 每日回顾(有新报告时红点) / 发现 / 认知统计
  第二组(目标): "我的目标" 标题(可折叠) + 项目列表 + 独立目标 + AI建议
  第三组(配置): 洞察视角 / 路路设置 / 设置
并且 (And)    底部: "退出登录" 文字按钮
```

### 场景 6.2: 目标区
```
假设 (Given)  侧边栏打开
当   (When)   用户有项目和目标
那么 (Then)   "我的目标"下显示:
  - 📁 项目名 + 活跃目标数（点击 → 打开项目详情 overlay）
  - 🎯 独立目标名 + 进度（无项目归属的目标）
  - 💡 路路建议 + "确认?" 标签（AI 涌现的建议目标）
当   (When)   点击 + 按钮
那么 (Then)   弹出创建选择: 新目标 / 新项目
当   (When)   点击某个项目
那么 (Then)   侧边栏关闭 → 打开项目详情 overlay
```

### 场景 6.3: 洞察视角
```
假设 (Given)  侧边栏打开
当   (When)   点击"洞察视角"
那么 (Then)   侧边栏关闭 → 打开洞察选择 overlay
并且 (And)    显示 4 种视角卡片:
  - 🔍 苏格拉底追问 (reflect)
  - 🧩 元问题分析 (meta-question)
  - 🔄 二阶思考 (second-order-thinking)
  - 📊 芒格决策 (munger-review)
当   (When)   选择某视角 + 选择日期范围
那么 (Then)   打开参谋对话 overlay（mode=insight, skill=选中视角）
```

---

## 七、侧边栏导航 overlay 页

> 所有导航页均为 overlay（非路由），通过 overlay state 管理打开/关闭

### 场景 7.1: 目标详情 overlay
```
假设 (Given)  从侧边栏点击某个目标
当   (When)   目标详情 overlay 显示
那么 (Then)   调用 GET /goals/:id/todos + GET /goals/:id/health + GET /goals/:id/timeline
并且 (And)    overlay 内容:
  - 顶部: ← 返回 + "Goal Detail" + ⋮ 菜单
  - 目标名 (Serif display) + 进度百分比 (大字)
  - 健康度: 四维水平条(方向/资源/路径/驱动)
  - 待办列表: 按目标分组的 checkbox 列表 + "添加待办"按钮
  - 认知叙事: 时间轴(● 起点 / ● 转折 / ● 冲突 / ○ 悬念)
  - 相关记录: 最近 N 条关联日记摘要 + "查看全部"
  - "和路路讨论这个目标" 鹅卵石按钮
```

### 场景 7.2: 项目详情 overlay
> 参考: Stitch "project_details_q2_cost_war" 原型
```
假设 (Given)  从侧边栏点击某个项目(notebook)
当   (When)   项目详情 overlay 显示
那么 (Then)   overlay 布局:
  ┌──────────────────────────────────┐
  │  ← Project Details           ⋮   │
  │                                  │
  │  PROJECT · UPDATED MAR 14, 2026  │  ← Mono 元数据
  │  Q2 Cost War                     │  ← Serif display 大标题
  │                                  │
  │  Evaluate Suppliers              │  ← 目标分组（Serif 小标题）
  │  ○ Call Zhang                    │  ← 子待办
  │  ✓ Review Report                 │
  │  ○ Prep List                     │
  │                                  │
  │  Optimize Casting                │  ← 另一个目标分组
  │  ○ Test parameters               │
  │  ○ Write report                  │
  │                                  │
  │  ── STATS ───────────────────    │
  │  64%                             │  ← Serif display 大数字
  │  Complete · ▲ MOMENTUM · ◉ ATTN │
  └──────────────────────────────────┘
并且 (And)    目标分组无边框，靠 spacing-6 间距 + Serif 标题区分
并且 (And)    每个目标: 名称 + 子待办列表（可直接勾选）
并且 (And)    底部统计: 完成百分比 + momentum/attention 指标
当   (When)   点击某目标标题
那么 (Then)   打开目标详情 overlay（overlay 可叠加）
```

### 场景 7.3: 发现页（认知地图）
```
假设 (Given)  从侧边栏点击"发现"
当   (When)   发现页显示
那么 (Then)   页面分两区:
  上半区: 认知地图 (GET /cognitive/clusters)
    - 默认: 2列卡片墙(主题名+条数+活跃度圆点+子主题)
    - 切换: 卡片 / 网状 / 导图 (右上三按钮)
    - 点击卡片 → 打开 Cluster 详情 overlay
  下半区: 路路的发现 (洞察列表)
    - 每条: 左侧彩色竖线 + 类型 + 置信度% + 摘要 + "详细 →"
    - 点击 → 打开参谋对话 overlay(insight)
```

### 场景 7.4: Cluster 详情页
```
假设 (Given)  从认知地图点击某个 Cluster 卡片
当   (When)   详情页显示
那么 (Then)   调用 GET /cognitive/clusters/:id
并且 (And)    页面内容(有数据的区块才显示):
  - 认知模式(紫色): AI 发现的模式 + "这准确吗？[是][否]"
  - 对立观点(琥珀色): 矛盾 Strike 对 + "帮我想想"按钮
  - 目标状态: 四维光谱条(关联 goal 时)
  - 认知时间线: 极性图标 + nucleus + 日期
当   (When)   点击"帮我想想"
那么 (Then)   打开参谋对话 overlay（mode=decision）
当   (When)   长按某节点拖线到另一节点
那么 (Then)   POST /cognitive/bonds 创建手动 Bond
```

### 场景 7.5: 每日回顾页
```
假设 (Given)  从侧边栏点击"每日回顾"
当   (When)   回顾页显示
那么 (Then)   默认显示最新一期（晨间或晚间）
并且 (And)    调用 GET /daily/briefing 或 GET /daily/evening-summary
并且 (And)    内容: 今日行动摘要 + 路路的发现(洞察卡片) + 统计
并且 (And)    底部: "💬 和路路聊聊今天" → 打开参谋对话 overlay
并且 (And)    可左右滑动切换历史回顾
```

### 场景 7.6: 认知统计页
```
假设 (Given)  从侧边栏点击"认知统计"
当   (When)   统计页显示
那么 (Then)   调用 GET /cognitive/stats + GET /stats/*
并且 (And)    显示:
  - 极性分布: 5种极性(感知/判断/领悟/意图/感受)占比环形图
  - 领悟滞后: 感知→领悟平均天数
  - Top Clusters: 前5大主题 + 成员数
  - 矛盾数: 近期矛盾 Bond 计数
  - 30天趋势: 记录数折线图
  - 标签分布: Top 10 标签横向柱状图
  - 待办趋势: 创建 vs 完成折线图
```

### 场景 7.7: 路路设置页
```
假设 (Given)  从侧边栏点击"路路设置"
当   (When)   设置页显示
那么 (Then)   显示三个子 Tab: AI 身份 / AI 记忆 / 技能管理
  - AI 身份: GET/PUT /soul，编辑 AI 性格定义
  - AI 记忆: GET /memory，列表显示，可删改
  - 技能管理: GET /skills，列表显示，可启停/CRUD
```

### 场景 7.8: 设置页
```
假设 (Given)  从侧边栏点击"设置"
当   (When)   设置页显示
那么 (Then)   显示:
  - 用户画像: GET/PATCH /profile（编辑个人信息）
  - 通知时间: 晨间简报/晚间总结时间设置
  - ASR 模式: 实时识别 / 录后识别
  - Gateway 地址: 配置后端地址
  - 数据导出: 按钮 → GET /export?format=json/md/csv → 下载
  - 关于/版本
```

---

## 八、通知中心

### 场景 8.1: 通知列表
```
假设 (Given)  用户点击顶部 🔔 或侧边栏 🔔
当   (When)   通知页显示
那么 (Then)   列表展示所有推送通知（最新在上）:
  - proactive.morning_briefing → "☀️ 晨间简报已生成" + 时间
  - proactive.todo_nudge → "🎯 3个重要待办还没安排" + 时间
  - proactive.evening_summary → "🌙 今日总结已生成" + 时间
  - proactive.relay_reminder → "📞 有2个待转达消息" + 时间
  - cognitive alerts → "⚡ 发现一个认知矛盾" + 时间
当   (When)   点击某条通知
那么 (Then)   跳转到对应功能（简报页/待办视图/对话页等）
并且 (And)    该通知标记已读
```

---

## 九、参谋对话页（统一）

### 布局

```
┌──────────────────────────────────────┐
│  ←  和路路聊聊        (上下文标题)    │
├──────────────────────────────────────┤
│                                      │
│     ┌──────────────────┐            │
│  🦌 │ AI 消息           │            │
│     └──────────────────┘            │
│                                      │
│            ┌──────────────────┐     │
│            │ 用户消息          │     │
│            └──────────────────┘     │
│                                      │
│     ┌──────────────────┐            │
│  🦌 │ ···              │            │  ← 流式输出
│     └──────────────────┘            │
│                                      │
├──────────────────────────────────────┤
│  输入...                    🎙  发送  │
└──────────────────────────────────────┘
```

### 场景 9.1: 对话界面
```
假设 (Given)  从任意入口进入参谋对话
当   (When)   对话页显示
那么 (Then)   全屏 overlay 打开（沿用现有 ChatView overlay）
并且 (And)    顶部: ← 返回 + "和路路聊聊" + 上下文标题(如有)
并且 (And)    消息区: AI 消息左对齐(surface-low 气泡) + 用户消息右对齐(天空蓝淡色气泡)
并且 (And)    AI 头像: 🦌 小鹿图标 24px
并且 (And)    底部: 文本输入框 + 🎙 语音按钮 + 发送按钮
并且 (And)    流式输出: 打字机效果，三点加载动画
```

### 场景 9.2: 不同 mode 的上下文
```
假设 (Given)  进入参谋对话
那么 (Then)   根据 mode 设置不同上下文:
  - review: WS chat.start {mode:"review", dateRange, ...}
  - command: WS chat.start {mode:"command", initialMessage:"/xxx"}
  - insight: WS chat.start {mode:"insight", localConfig:{selectedInsightSkill:...}}
  - decision: POST /chat/decision + WS chat.start
并且 (And)    AI 可在对话中调用内置工具（create_todo/create_goal/search 等）
```

### 场景 9.3: 从追问进入的对话继承
```
假设 (Given)  用户点击了 AI 伴侣气泡（reflect.question）
当   (When)   对话页显示
那么 (Then)   AI 的追问作为 assistant 消息显示（不是用户消息）
并且 (And)    不立即发送 chat.start，等用户输入
当   (When)   用户发送第一条消息
那么 (Then)   chat.start payload 携带 assistantPreamble（AI 原话）+ initialMessage（用户输入）
```

---

## 十、冷启动

### 场景 10.1: 首次使用引导
```
假设 (Given)  用户首次打开 App（未完成 onboarding）
当   (When)   App 加载
那么 (Then)   不进入工作区，进入全屏引导流程

页面 1（欢迎页）:
  - 🦌 路路 Logo（大号）
  - "你好，我是路路" 衬线体 24px
  - "你的每一个想法，我都帮你记住" 副标题
  - [开始] 鹿毛色大按钮

页面 2-6（五问，每问一页）:
  - 进度指示 "路路问你 (1/5)"
  - 问题文字，衬线体
  - 输入框 / 选项
  - "🎙 说说看" 大按钮(鹿毛色) + "⌨️ 打字" 小按钮(灰色)
  - [下一步] + "跳过这个问题" 链接
  - 五个问题:
    1. 怎么称呼你？
    2. 你现在主要在做什么？
    3. 最近最让你花心思的一件事？
    4. 觉得很多想法想过就忘，或决定了的事总拖着？
    5. 一般什么时候有空整理想法？
  - 每个回答: POST /onboarding/answer {step, answer}

完成后:
  - 进入工作区日记视图
  - 输入框 placeholder 个性化: "[名字]，记点什么吧"
```

---

## 十一、登录/认证

### 场景 11.1: 强制登录
```
假设 (Given)  用户未登录
当   (When)   打开 App
那么 (Then)   显示登录页（手机号+密码）
并且 (And)    底部: "没有账号？注册" 切换链接
当   (When)   提交登录
那么 (Then)   POST /auth/login → 保存 token → 进入主界面
当   (When)   token 过期（401）
那么 (Then)   自动 POST /auth/refresh → 续签
当   (When)   refresh 也失败
那么 (Then)   跳转登录页
```

---

## 边界条件

- [ ] 空日记流：Serif 大字空状态 + 路路插画 + "开始你的第一条记录吧"（display-lg 3.5rem）
- [ ] 空待办：Serif "今日清单已清空" + 路路鼓励语
- [ ] 无网络：OfflineBanner 顶部黄色条 (晨光色) + 本地缓存展示
- [ ] 超长日记文本：折叠态 line-clamp-4，展开态无限制
- [ ] 并发录音：FAB 状态机防止双重录音（activeRef 保护）
- [ ] AI 处理中：骨架屏 shimmer + FAB 胶囊变形
- [ ] WebSocket 断连：自动重连 + 重连期间 REST fallback
- [ ] 侧边栏快速点击：防抖，关闭动画完成后才允许打开
- [ ] 视图切换中录音：录音 Sheet 不因视图切换而关闭
- [ ] 语音输入中断（来电/切后台）：录音暂停，恢复后提示"继续录音？"
- [ ] 深度链接 (Deep Link)：从通知/分享跳转到具体日记/待办/目标，overlay 直接打开对应视图
- [ ] prefers-reduced-motion：所有动画降级为 0ms，滑动切换改为 instant

## 无障碍 (Accessibility)

- 对比度: 所有正文 ≥ 4.5:1（弱文字 #7B6E62 on surface ≥ 4.5:1）
- Touch target: 所有可交互元素 ≥ 44×44px（FAB 56px, 待办行 44px）
- Focus ring: 键盘导航时 2px deer 色 outline（仅键盘用户可见）
- aria-label: SVG 图标按钮必须有 aria-label
- 标题层级: h1(页面) → h2(分组) → h3(子标题)，不跳级
- Dynamic Type: 支持系统字体缩放，避免截断
- 减少动画: 尊重 prefers-reduced-motion

## 依赖

- **specs/voice-action.md** — 语音指令自动识别（Process 意图分类 + Agent 执行）
- **docs/frontend-backend-mapping.md** — 前后端功能对照清单
- **Stitch 原型** — mobile_tasks_no_bottom_nav / task_detail_bottom_sheet / project_details_q2_cost_war
- **Editorial Serenity 设计系统** — No-Line Rule / Breath Principle / Glass & Soul
- gateway WebSocket (实时消息 + ASR + action.result/confirm)
- gateway REST API (全部 CRUD)
- Capacitor (原生能力: 麦克风/相机/文件/推送)
- shadcn/ui + Tailwind CSS (UI 组件)
- 现有 features/ 模块（大量可复用，需重组布局）

## 备注

- 本 spec 覆盖移动端 App 全部页面和交互，PC 端另开 spec
- **导航模式: overlay**（沿用现有 app/page.tsx overlay 系统，非 Next.js 路由 push）
- 侧边栏导航页的具体实现可复用现有组件（TodoPanel → 待办视图，LifeMap → 发现页等）
- **FAB 交互改变**：单击=文字输入 Sheet，长按=语音录入（微信语音条：松开发送/左滑取消/右滑锁定）
- **关键改变：不再区分"录日记"和"发指令"两种模式**，文字和语音统一入口，AI 自动判断意图
- voice-action 的 action.result / action.confirm WS 消息通过 AI 伴侣气泡展示
- **设计语言: Editorial Serenity** — 禁止 1px 边框，用色阶层次；禁止分隔线，用大间距
- SVG 图标替代 emoji（spec 中 emoji 仅为占位符）
- 参考 apps: Todoist（侧边栏管理）、Flomo（日记流）、滴答清单（待办交互）

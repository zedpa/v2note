---
id: "064b"
title: "APP Mobile — Navigation & System"
status: active
domain: ui
dependencies: ["auth.md", "cold-start.md"]
superseded_by: null
related: ["app-mobile-views.md"]
created: 2026-03-23
updated: 2026-04-04
---
# APP Mobile — Navigation & System

> 状态：🔄 实现中 | 分批: P7.1(主屏) → P7.2(侧边栏+导航) → P7.3(辅助页面)
> 主屏视图层：见 specs/app-mobile-views.md
> 导航模式：沿用 overlay 模式（非路由 push），与现有 app/page.tsx 架构一致

## 概述

本 spec 覆盖移动端导航与系统层：侧边栏、导航 overlay 页、通知中心、参谋对话、冷启动、登录认证。
主屏视图层（整体结构、顶部栏、日记视图、待办视图、FAB）见 [app-mobile-views.md](./app-mobile-views.md)。

---

## 六、侧边栏

### 布局

```
┌─────────────────────────────────┐
│  (ZP)  Zed              >      │  ← 头像 + 用户名 + > 跳转用户资料
│                                 │
│  🔍  搜索                       │  ← 搜索入口
│                                 │  ← spacing-6 分组间距（无分隔线）
│  📋  每日回顾              ●    │
│  🗺️  发现                       │  ← 浏览组
│  📊  认知统计                    │
│                                 │  ← spacing-6 分组间距
│  我的方向                   +   │  ← Serif 小标题（不叫"我的目标"）
│  🌿 供应链管理             12   │  ← 活跃方向（有 active Goal 的 Cluster）
│     评估供应商 · 铸造优化       │    关联 Goals 摘要
│  🌿 v2note 产品             8   │
│     移动端重构                  │
│  🎯 量化交易                    │  ← 独立目标（无 Cluster 的 Goal）
│  💡 团队培训计划        确认?   │  ← suggested Goal
│                                 │
│  ── 沉默区 ──              ▾   │  ← 默认折叠，灰色弱化
│  ☁️ 家庭关系               3    │  ← 有认知无行动的 Cluster
│  ☁️ 健康管理               2    │
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
方向列表数据来源: GET /api/v1/topics（Cluster + Goal 聚合）
```

### 场景 6.1: 侧边栏内容
```
假设 (Given)  用户点击头像打开侧边栏
当   (When)   侧边栏显示
那么 (Then)   顶部显示: 头像(40px) + 用户名 + > 箭头按钮（点击跳转用户资料页）
并且 (And)    功能区分四组:
  第一组(浏览): 搜索 / 每日回顾(有新报告时红点) / 发现 / 认知统计
  第二组(方向): "我的方向" + 活跃方向(Cluster+Goal) + 独立目标 + AI建议
  第三组(沉默): 沉默区(有认知无行动的 Cluster，默认折叠，灰色)
  第四组(配置): 洞察视角 / 路路设置 / 设置
并且 (And)    底部: "退出登录" 文字按钮
```

### 场景 6.2: 方向区（替代原目标区）
```
假设 (Given)  侧边栏打开
当   (When)   用户有涌现 Cluster 和 Goal
那么 (Then)   "我的方向"下显示:
  活跃方向（有 active Goal 的 Cluster，按最近活动排序）:
  - 🌿 Cluster 名 + Strike 成员数 + 关联 active Goals 摘要（最多 2 个名字）
  独立目标（无 Cluster 或 Cluster 很弱的 Goal）:
  - 🎯 Goal 名
  AI 建议:
  - 💡 路路建议 + "确认?" 标签（suggested Goal）
  沉默区（默认折叠，Tier2 未输出 goal_suggestions 的 Cluster）:
  - ☁️ Cluster 名 + Strike 数（灰色弱化）
当   (When)   点击某个 🌿 活跃方向
那么 (Then)   侧边栏关闭 → 进入主题筛选态（详见 topic-lifecycle.md 场景 2-3）
并且 (And)    顶部 Segment 变为「脉络 | 进展」
当   (When)   点击某个 ☁️ 沉默区 Cluster
那么 (Then)   同上，但生命周期视图只有 Seeds 区有内容
当   (When)   点击 + 按钮
那么 (Then)   打开参谋对话 overlay，路路主导梳理新方向（不弹表单）
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
  - 极性分布: 4种极性(感知/判断/领悟/意图)占比环形图
    注意：感受(feel)类 Strike 不参与统计分析（"只记录不分析"原则），
    环形图旁灰色小字标注"感受类记录 N 条，仅存档"
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

## 实现进度审计（2026-03-28）

> 对照 `docs/designs/01~21` 设计稿 + 代码实际状态

### P7.1 主屏 — 功能骨架 ✅ 完成，视觉对齐 ❌ 未开始

| 场景 | 状态 | 说明 |
|------|------|------|
| 1.1 工作区默认态 | ✅ | app/page.tsx overlay 系统运作正常 |
| 1.2 视图切换 | ✅ | Segment 点击 + 左右滑手势切换 diary↔todo |
| 1.3 侧边栏打开/关闭 | ✅ | 头像点击 + 日记页左边缘右滑 + 遮罩关闭 |
| 1.4 侧边栏导航 | ✅ | overlay 联动 |
| 1.5 主题筛选态 | ❌ | 依赖 topic-lifecycle spec（未开发） |
| 2.1-2.4 顶部栏 | ✅ | 头像+Segment+搜索+通知铃铛 |
| 3.1 日记流加载 | ✅ | 按日期分组+下拉刷新 |
| 3.2 AI Window | ❌ | 依赖 ai-companion-window spec（未开发） |
| 3.3 日记卡片折叠态 | ⚠️ | 骨架有，缺 AI 洞察预览、No-Line 样式 |
| 3.4 日记卡片展开态 | ✅ | 就地展开+音频播放+Strike+待办+关联 |
| 3.5 多选删除 | ✅ | 长按进入选择模式 |
| 3.6 AI 洞察卡片 | ❌ | 日记流中无"路路发现"插入卡片 |
| 4.1 待办列表 | ✅ | Today/Tomorrow/Later 分组 + 完成率 |
| 4.2 待确认意图 | ✅ | "To Confirm" 区 + 确认按钮 |
| 4.3 待办完成 | ✅ | checkbox + 动画 + 进度更新 |
| 4.4 待办详情 Sheet | ⚠️ | 日期/时间/AI plan 有，缺 sub-task/comment |
| 4.5 待办左滑跳过 | ✅ | 三个跳过原因 |
| 4.8-4.9 Now Card 滑动 | ✅ | 森林色/晨光色 + 状态机 + API 上报 |
| 4.10 长按下拉 | ✅ | fork 菜单 |
| 4.11 反复跳过反思 | ⚠️ | skip-alerts API 有，前端提示条待确认 |
| 4.12 目标呼吸指示器 | ✅ | GoalIndicator 脉冲动画 |
| 5.1 FAB 单击文字 | ✅ | TextBottomSheet + 附件+命令 |
| 5.2 FAB 长按语音 | ✅ | 全屏沉浸录音 + 滑动方向 |
| 5.3 FAB 锁定录音 | ✅ | RecordingImmersive |
| 5.4 FAB 胶囊变形 | ✅ | 渐变胶囊 + Sparkles + witty text |
| 5.5-5.10 语音指令 | ✅ | voice-action handler + 意图分类 |

### P7.2 侧边栏+导航 — 功能骨架 ✅ 完成，部分页面内容缺失

| 场景 | 状态 | 说明 |
|------|------|------|
| 6.1 侧边栏菜单结构 | ✅ | 搜索/回顾/发现/统计 + 目标区 + 洞察/路路设置/设置 |
| 6.2 方向区 | ⚠️ | 有目标列表+展开，缺活跃方向/沉默区分（依赖 /topics API） |
| 6.3 洞察视角 | ⚠️ | 入口有，4 种视角卡片待确认 |
| 7.1 目标详情 | ✅ | 四维健康条 + 认知叙事 + 待办 + "和路路讨论" |
| 7.2 项目详情 | ⚠️ | 子目标+待办有，缺 momentum/attn 指标 |
| 7.3 发现页 | ❌ | 入口有但内容为空（无 /topics API，无认知地图卡片墙） |
| 7.4 Cluster 详情 | ✅ | ClusterDetailView 已有 |
| 7.5 每日回顾 | ⚠️ | 有内容但是滚动列表，设计要求卡片横滑 |
| 7.6 认知统计 | ⚠️ | 有 bar/line chart，缺极性环形图 |
| 7.7 路路设置 | ⚠️ | 入口有，需确认是否合并 soul+memory+skills |
| 7.8 设置页 | ✅ | SettingsEditor 已有 |

### P7.3 辅助页面 — 功能骨架 ✅ 完成

| 场景 | 状态 | 说明 |
|------|------|------|
| 8.1 通知中心 | ⚠️ | 有分类图标+时间，缺持久化（仅内存） |
| 9.1-9.3 参谋对话 | ✅ | ChatView + 流式 + 多 mode + 气泡样式 |
| 10.1 冷启动 | ⚠️ | 5 步对话流有，缺欢迎页+语音输入选项 |
| 11.1 登录/注册 | ⚠️ | 功能正常，缺品牌视觉（像素小鹿 Logo） |

### 设计语言 Editorial Serenity — ❌ 未开始

| 项 | 状态 | 说明 |
|----|------|------|
| 字体 | ❌ | 现有 Sora+NotoSansSC，需替换为 Newsreader/Inter/GeistMono |
| No-Line Rule | ❌ | 142 处 border 需替换为 ghost-border/色阶 |
| Breath Principle | ❌ | 间距偏紧凑，需全局调整为 spacing-6 |
| Glass & Soul | ❌ | header/sheet 无毛玻璃效果 |
| 环境阴影 | ❌ | 使用 shadow-md 而非 on-surface 6%/blur 24px |
| 圆角统一 | ❌ | 未统一为卡片 12px / 按钮 xl / 药丸 full |
| framer-motion | ❌ | 无 spring 物理动画、粒子消散、统一转场 |

### 后端 API 缺口

| API | 状态 | 阻塞 |
|-----|------|------|
| GET /api/v1/topics | ❌ 不存在 | 发现页+侧边栏方向区 |
| GET /api/v1/topics/:id/lifecycle | ❌ 不存在 | 主题筛选态 |
| GET /api/v1/companion/status | ❌ 不存在 | AI Window |
| notification 持久化+CRUD | ❌ 不存在 | 通知中心 |
| todo parent_id (sub-task) | ❌ 不存在 | 待办详情 Sheet |
| project momentum/attn | ❌ 不存在 | 项目详情 |
| goal narrative API | ⚠️ 待确认 | 目标详情认知叙事数据来源 |
| Daily Review 卡片拆分 | ❌ | 每日回顾卡片横滑 |

---

## 边界条件（系统相关）

- [ ] 无网络：OfflineBanner 顶部黄色条 (晨光色) + 本地缓存展示
- [ ] WebSocket 断连：自动重连 + 重连期间 REST fallback
- [ ] 侧边栏快速点击：防抖，关闭动画完成后才允许打开
- [ ] 深度链接 (Deep Link)：从通知/分享跳转到具体日记/待办/目标，overlay 直接打开对应视图

## 依赖（系统相关）

- **specs/voice-action.md** — 语音指令自动识别（Process 意图分类 + Agent 执行）
- **docs/frontend-backend-mapping.md** — 前后端功能对照清单
- **Stitch 原型** — project_details_q2_cost_war
- **Editorial Serenity 设计系统** — No-Line Rule / Breath Principle / Glass & Soul
- gateway WebSocket (实时消息 + ASR + action.result/confirm)
- gateway REST API (全部 CRUD)
- Capacitor (原生能力: 推送)
- shadcn/ui + Tailwind CSS (UI 组件)
- 现有 features/ 模块（大量可复用，需重组布局）

## 备注

- 本 spec 覆盖移动端导航与系统层，主屏视图层见 specs/app-mobile-views.md
- **导航模式: overlay**（沿用现有 app/page.tsx overlay 系统，非 Next.js 路由 push）
- 侧边栏导航页的具体实现可复用现有组件（LifeMap → 发现页等）
- **设计语言: Editorial Serenity** — 禁止 1px 边框，用色阶层次；禁止分隔线，用大间距
- SVG 图标替代 emoji（spec 中 emoji 仅为占位符）
- 参考 apps: Todoist（侧边栏管理）

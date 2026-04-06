---
id: "115"
title: "产品重新定位 — 核心体验精简"
status: completed
domain: ui
dependencies: ["app-mobile-views.md", "app-mobile-nav.md", "daily-report-core.md", "cold-start.md"]
superseded_by: null
created: 2026-04-05
updated: 2026-04-06
---

# 产品重新定位 — 核心体验精简

## 概述

基于 61 个真实用户的数据分析（74% 在 onboarding 后流失，D1 留存 6.6%），将产品从"认知操作系统"重新定位为**开箱即用的中文第二大脑**。

**核心策略**：渐进展露
- 前 7 天 = 懒人笔记 + 智能待办（留住用户）
- 1 个月后 = 关联发现 + 自动归类（让用户离不开）
- 3 个月后 = 目标涌现 + 认知洞察（让用户愿意付费）

**5 个核心功能做透**：输入（语音+文字）、日记时间线、待办、自动整理（agent+tool）、日报

**设计原则**：不是不要 Obsidian 的功能，是不要 Obsidian 的复杂。同样的价值，零配置交付。

---

## 模块 A：前端 UI 精简

### A.1 主屏结构（保留）
```
假设 (Given)  用户打开 app
当   (When)   主屏加载
那么 (Then)   保留 segment 切换（日记 | 待办）
并且 (And)    segment 保留是因为语音路由 sourceContext 依赖此字段
并且 (And)    保留现有前端样式和设计语言不变
```

### A.2 去掉 AI 对话入口
```
假设 (Given)  用户在主屏
当   (When)   查看顶部栏
那么 (Then)   移除 LuluLogo（路路 AI）按钮
并且 (And)    ChatView overlay 代码保留（后续可恢复），仅移除入口
并且 (And)    WorkspaceHeader 不再传递 onChatClick prop
```

### A.3 去掉 TopicFilter 和 TopicLifecycleView
```
假设 (Given)  用户在主屏
当   (When)   切换到待办 tab
那么 (Then)   直接渲染 TodoWorkspace，不再有 TopicLifecycleView 条件分支
并且 (And)    移除 topicFilter state 及其 localStorage 持久化
并且 (And)    WorkspaceHeader 不再显示 Topic Filter 药丸
并且 (And)    NotesTimeline 不再接收 clusterId prop
```

### A.4 侧边栏精简 — 涌现树 → 自动归类
```
假设 (Given)  用户打开侧边栏
当   (When)   侧边栏渲染
那么 (Then)   显示内容为：
  - 头像 + 昵称
  - 📋 今日简报
  - 🔍 搜索
  - ── 自动归类 ──
  - 📁 工作（12）
  - 📁 生活（8）
  - 📁 学习（3）
  - ...（AI 自动生成的分类）
  - ⚙️ 设置
  - 退出登录
并且 (And)    移除"我的世界"树（MyWorldTreeNode）
并且 (And)    移除"新建目标"inline 输入
并且 (And)    移除"发现"菜单项
并且 (And)    自动归类数据来源：record.domain 字段，由 digest 时 AI 自动填充
并且 (And)    点击分类 → 筛选日记时间线只显示该 domain 的记录
```

### A.5 自动归类深度策略（渐进展露）

**数据格式**：record.domain 存路径字符串，用 `/` 分隔层级。
- 一级：`"工作"`
- 二级：`"工作/v2note"`
- 三级：`"工作/v2note/产品定位"`

Digest 时 AI 直接存完整路径。前端按用户使用天数控制展示深度。

```
假设 (Given)  record条数 <=20 条
当   (When)   侧边栏渲染自动归类
那么 (Then)   只展示一级分类（按 `/` 拆分取第一段）
并且 (And)    显示为平铺列表：📁 工作（12）/ 📁 生活（8）/ 📁 学习（3）
```

```
假设 (Given)  )  record条数 >20 条
当   (When)   侧边栏渲染自动归类
那么 (Then)   展示到二级分类（可展开/折叠）
并且 (And)    显示为：
  📁 工作（12）
     📄 v2note（7）
     📄 能源管理（5）
  📁 生活（8）
```

```
假设 (Given)  record条数 > 50 条
当   (When)   侧边栏渲染自动归类
那么 (Then)   展示完整三级分类树
并且 (And)    显示为：
  📁 工作（12）
     📄 v2note（7）
        · 产品定位（3）
        · 营销策略（4）
     📄 能源管理（5）
```




### A.7 文件夹管理
```
假设 (Given)  用户在侧边栏看到自动归类的文件夹列表
当   (When)   用户想管理文件夹
那么 (Then)   支持以下操作：
  - 新建文件夹：侧边栏底部"+ 新建分类"按钮，输入名称创建
  - 重命名：长按文件夹 → 弹出菜单 → "重命名"
  - 删除：长按文件夹 → 弹出菜单 → "删除"（该分类下记录的 domain 清空，回到未分类）
  - 移动记录：在日记时间线中，长按某条记录 → "移动到..." → 选择目标文件夹
  - 合并文件夹：长按文件夹 → "合并到..." → 选择目标（批量更新 domain）
并且 (And)    用户手动创建的文件夹会被 AI 学习，后续新记录优先归入已有文件夹
并且 (And)    用户手动移动记录后，AI 学习该偏好用于后续自动归类
```

```
假设 (Given)  用户删除了一个文件夹
当   (When)   该文件夹下有 N 条记录
那么 (Then)   弹出确认："该分类下有 N 条记录，删除后它们将变为未分类。确定？"
并且 (And)    确认后，批量将这些记录的 domain 置空
并且 (And)    未分类的记录在下次 digest 时会被 AI 重新归类
```

### A.6 隐藏通知入口（可选）
```
假设 (Given)  通知功能暂未做推送
当   (When)   主屏顶部栏渲染
那么 (Then)   移除通知铃铛按钮（后续推送通知做好后恢复）
```

---

## 模块 B：日报 Prompt 大幅简化
##说明：以下关于字数要求都是软约束，非强制，按实际需求

### B.1 晨报简化
```
假设 (Given)  用户打开今日简报（或自动弹出）
当   (When)   后端生成晨报
那么 (Then)   prompt ≤ 500 字符，核心指令：
  "根据数据生成晨间问候，返回 JSON：
   { greeting: '早上好xx，≤15字',
     today_focus: ['待办原文，按时间排序'],
     carry_over: ['逾期待办'],
     stats: {yesterday_done, yesterday_total} }"
并且 (And)    移除语言风格规则、情绪判断、视角轮换
并且 (And)    移除 goal_progress / relay_pending / ai_suggestions 字段
并且 (And)    user prompt 只注入：日期、待办列表、昨日统计
```

### B.2 晚报简化
```
假设 (Given)  用户打开晚间总结
当   (When)   后端生成晚报
那么 (Then)   prompt ≤ 500 字符，核心指令：
  "根据数据生成晚间总结，返回 JSON：
   { headline: '今天完成了N件事，≤25字',
     accomplishments: ['完成的事'],
     tomorrow_preview: ['明日排期'],
     stats: {done, new_records} }"
并且 (And)    移除视角轮换、认知报告注入
并且 (And)    移除 generateCognitiveReport() / generateAlerts() 调用
并且 (And)    移除 cognitive_highlights / goal_updates / attention_needed / relay_summary 字段
```

### B.3 前端日报组件适配
```
假设 (Given)  后端返回简化的日报 JSON
当   (When)   前端渲染 MorningBriefing / EveningSummary / SmartDailyReport
那么 (Then)   适配简化后的数据结构
并且 (And)    移除不再存在的字段渲染
```

---

## 模块 C：Onboarding 重做

### C.1 两步 Onboarding
```
假设 (Given)  新用户注册成功
当   (When)   首次进入 app
那么 (Then)   进入 2 步引导流程：
  Step 1: "你好，怎么称呼你？" → 输入名字 → 保存
  Step 2: "试着说一句你现在在想的事" → 弹出文字/语音输入 → 
          调用 process pipeline → 实时展示 AI 拆解结果（想法 + 待办）→ 
          "这就是念念有路。你说，AI 整理。"
并且 (And)    不再创建 3 篇欢迎日记（welcome-seed.ts）
并且 (And)    不再收集 occupation / current_focus / pain_points / review_time
```

### C.2 跳过流程
```
假设 (Given)  用户在任意步骤
当   (When)   点击"跳过"
那么 (Then)   直接标记 onboarding_done，进入主界面
并且 (And)    不创建任何种子数据
```

---

## 模块 D：架构简化 — 去掉 Strike 中间层

### D.0 架构决策：Record 为原子单位
```
核心变更：去掉 Strike 作为中间层，Record（日记条目）和 Todo（待办）是唯一两个核心实体。

原架构：用户输入 → Record → AI拆解 → Strike[] → intend投影 → Todo
新架构：用户输入 → Record → AI一次调用 → {summary, domain, tags, todos}

Strike/Bond/Cluster 表保留不删除，作为后台冷路径（未来付费功能）。
digest.ts 降级为可选的异步冷路径，不在用户热路径上。
```

### D.1 Layer 3 统一处理简化
```
假设 (Given)  用户输入一段文字/语音（Layer 3 默认路由）
当   (When)   unified-process-prompt 执行
那么 (Then)   AI 一次调用返回：
  {
    "summary": "清理后的文本摘要",
    "domain": "工作/v2note",
    "tags": ["关键词1", "关键词2"],
    "todos": [{ "text": "...", "scheduled_start": "...", "priority": "high" }],
    "commands": [...]  // 仅 action/mixed 时
  }
并且 (And)    不再输出 strikes / bonds / polarity / nucleus
并且 (And)    Todo 直接从 AI 输出创建，不经过 intend→projection
并且 (And)    summary 写入 summary 表
并且 (And)    domain 写入 record.domain
并且 (And)    tags 写入 record_tag
并且 (And)    异步计算 record embedding（用于搜索）
```

### D.2 process.ts 热路径简化
```
假设 (Given)  Layer 3 处理完成
当   (When)   写入数据
那么 (Then)   不再调用 strikeRepo / bondRepo / strikeTagRepo
并且 (And)    不再调用 projectIntendStrike（todo-projector）
并且 (And)    不再调用 recordRepo.claimForDigest（digest 标记）
并且 (And)    直接：summaryRepo.save + recordRepo.updateDomain + tagRepo + todoRepo.create
```

### D.3 digest.ts 降级为冷路径
```
假设 (Given)  digest.ts 管道
当   (When)   Layer 3 已处理完 record
那么 (Then)   digest.ts 不再被 Layer 3 触发
并且 (And)    可由后台定时任务或手动脚本触发（为 Cluster/涌现 等付费功能服务）
并且 (And)    前端不依赖 digest 结果
```

### D.4 自动归类（record.domain）
```
假设 (Given)  AI 返回 domain 字段
当   (When)   process.ts 写入数据
那么 (Then)   domain 写入 record.domain（层级路径如 "工作/v2note"）
并且 (And)    AI 参考 user prompt 中注入的「用户已有 domain 列表」保持一致性
并且 (And)    若内容无法归类，domain 为 null
```

### D.5 旧日记回填
```
假设 (Given)  存量日记 record.domain 全部为 NULL
当   (When)   运行 scripts/backfill-record-domain.mjs
那么 (Then)   按 user_id 分组，每批 20 条，调用 AI 批量分类
并且 (And)    支持 --dry-run 和断点续跑
```

### D.6 Layer 1（待办模式）保持不变
```
假设 (Given)  用户在待办页说话（sourceContext="todo"）
当   (When)   Layer 1 处理
那么 (Then)   保持现有逻辑不变（已经不走 Strike，直接提取 TodoCommand）
```

---

## 模块 E：日报通知推送

### E.1 本地通知
```
假设 (Given)  用户安装了 app
当   (When)   到达设定的通知时间（默认晨 8:00、晚 21:00）
那么 (Then)   发送本地通知：
  晨间: "早上好{name}，今天有{N}件事"
  晚间: "今天完成了{N}件事，看看总结？"
并且 (And)    点击通知 → 打开对应日报 overlay
```

### E.2 通知设置
```
假设 (Given)  用户进入设置页
当   (When)   查看通知设置
那么 (Then)   可开关晨间/晚间通知
并且 (And)    可设置通知时间
并且 (And)    默认开启
```

---

## 边界条件
- [ ] 自动归类 domain 为空时（新用户无历史），sidebar 不显示分类区
- [ ] 日报无待办数据时，today_focus 返回空数组，前端显示引导语
- [ ] Onboarding Step 2 语音失败时，提供文字输入 fallback
- [ ] 通知权限被拒绝时，不再弹窗，设置页显示"通知已关闭"

## Implementation Phases (实施阶段)

- [x] Phase 1: 模块 A — 前端 UI 精简（纯前端，风险低）
- [x] Phase 2: 模块 C — Onboarding 重做（前端+后端）
- [x] Phase 3: 模块 B — 日报 Prompt 简化（后端+前端适配）
- [x] Phase 4: 模块 D — 架构简化（v3 已完成：Record 为原子单位，去掉 Strike 中间层）
- [x] Phase 5: 模块 E — 日报通知推送（Capacitor LocalNotifications）

## 备注
- 渐进展露策略：前 20条只暴露核心功能（输入/日记/待办/日报），100条后开放关联发现，200 条后开放认知洞察
- 涌现/Cluster/Goal 系统后端继续运行，前端隐藏，作为未来付费功能
- polarity 保持不变（不做数据库迁移），避免风险
- 所有隐藏的功能代码保留，不删除，仅移除入口
- 本地配置（soul/skills/tools/identity/settings）全部按 userId 隔离存储，支持旧全局 key 自动迁移
- Soul 更新 prompt 已增强：区分"对 AI 的指令"和"用户在说自己"，防止错误将用户名写入 AI Identity
- 日报通知使用 @capacitor/local-notifications，Web 端静默跳过；通知时间与设置页日报时间联动

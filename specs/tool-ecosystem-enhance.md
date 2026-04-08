---
id: "117"
title: "工具生态增强"
status: active
domain: agent
dependencies: ["agent-tool-layer.md", "chat-tool-ui.md", "product-repositioning.md"]
superseded_by: null
created: 2026-04-06
updated: 2026-04-06
---

# 工具生态增强

## 概述

对标 Open WebUI（31 工具）、Lobe Chat（19 执行器）、LibreChat（12+ 工具）等开源项目，V2Note 当前 14 个工具在 **读取、时间感知、文件夹管理、描述质量** 方面存在明显短板。

产品重新定位后（spec 115），核心架构变为：
- **Record 为原子单位**，Strike 降为冷路径
- **record.domain 文件夹分类系统**是新的组织核心（侧边栏、筛选、AI 自动归类）
- 前 7 天体验 = 懒人笔记 + 智能待办 + **自动整理**

本 spec 补齐关键工具缺口，让 AI 能完整参与"输入 → 整理 → 查看"的核心循环。

### 社区调研摘要

| 项目 | 我们缺的关键能力 |
|------|----------------|
| Open WebUI | view_note 读取工具、memory CRUD、get_current_timestamp |
| Lobe Chat | readDocument、GTD 执行器、文档 CRUD |
| LibreChat | action-based 多功能工具 |
| Vercel AI Chatbot | negative guidance 描述规范 |

**我们的优势（保持不变）**：autonomy 三级分控、create_todo 语义去重、next_hint 多步引导、confirm 意图确认、create_link 实体关联。

---

## 1. 文件夹管理工具 — manage_folder / move_record

### 问题

产品重构后，`record.domain` 文件夹分类是核心整理方式。侧边栏展示文件夹树，用户可按分类筛选日记。但 AI 完全无法操作文件夹：

- 用户说"帮我把这条日记移到工作分类下" → AI 没有工具
- 用户说"新建一个'旅行'文件夹" → AI 没有工具
- 用户说"把'工作/杂项'合并到'工作'" → AI 没有工具

Spec 115 的 A.7 定义了文件夹管理需求（创建/重命名/删除/移动/合并），但后端 API 尚未实现。本 spec 同步提供工具层。

### 场景 1.1: manage_folder — 创建文件夹
```
假设 (Given)  用户想创建新的分类文件夹
当   (When)   AI 调用 manage_folder({ action: "create", name: "旅行" })
那么 (Then)   在 domain 体系中注册新文件夹名
并且 (And)    支持层级路径（如 "工作/新项目"）
并且 (And)    返回 { success: true, message: "已创建分类「旅行」" }
```

### 场景 1.2: manage_folder — 重命名文件夹
```
假设 (Given)  用户想重命名一个已有分类
当   (When)   AI 调用 manage_folder({ action: "rename", old_name: "杂项", new_name: "其他" })
那么 (Then)   批量更新所有 record.domain 中包含 old_name 的记录
并且 (And)    子级路径也同步更新（"杂项/xxx" → "其他/xxx"）
并且 (And)    返回影响的记录数
```

### 场景 1.3: manage_folder — 删除文件夹
```
假设 (Given)  用户想删除一个分类
当   (When)   AI 调用 manage_folder({ action: "delete", name: "杂项" })
那么 (Then)   该分类下所有记录的 domain 置为 null（变为未分类）
并且 (And)    未分类记录在下次 digest 时被 AI 重新归类
并且 (And)    返回影响的记录数
```

### 场景 1.4: manage_folder — 合并文件夹
```
假设 (Given)  用户想将一个分类合并到另一个
当   (When)   AI 调用 manage_folder({ action: "merge", source: "工作/杂项", target: "工作" })
那么 (Then)   source 下所有记录的 domain 更新为 target
并且 (And)    source 子级也递归更新
并且 (And)    返回影响的记录数
```

```typescript
// gateway/src/tools/definitions/manage-folder.ts
export const manageFolderTool: ToolDefinition = {
  name: "manage_folder",
  description: `管理日记的自动分类文件夹。
使用：用户要创建、重命名、删除、合并文件夹分类（"新建一个旅行分类"、"把杂项合并到工作"）。
不用：要移动单条日记到某个分类 → 用 move_record。
不用：要搜索某个分类下的日记 → 用 search(filters.domain)。`,
  parameters: z.object({
    action: z.enum(["create", "rename", "delete", "merge"]).describe("操作类型"),
    name: z.string().optional().describe("文件夹名（create/delete 时必填）"),
    old_name: z.string().optional().describe("旧名称（rename 时必填）"),
    new_name: z.string().optional().describe("新名称（rename 时必填）"),
    source: z.string().optional().describe("源文件夹（merge 时必填）"),
    target: z.string().optional().describe("目标文件夹（merge 时必填）"),
  }),
  autonomy: "confirm",  // 文件夹操作影响多条记录，需确认
  handler: async (args, ctx) => {
    // 根据 action 分发到不同逻辑
    // create: 验证名称不重复，可直接创建（首条记录归入时自动生效）
    // rename: UPDATE record SET domain = REPLACE(domain, old_name, new_name) WHERE domain LIKE old_name%
    // delete: UPDATE record SET domain = NULL WHERE domain = name OR domain LIKE name/%
    // merge: UPDATE record SET domain = REPLACE(domain, source, target) WHERE domain LIKE source%
  },
};
```

### 场景 1.5: move_record — 移动日记到指定分类
```
假设 (Given)  用户想把某条日记移到另一个分类
当   (When)   AI 调用 move_record({ record_id, domain: "生活/旅行" })
那么 (Then)   更新该记录的 domain 字段
并且 (And)    验证记录归属
并且 (And)    AI 学习此偏好用于后续自动归类
```

```typescript
// gateway/src/tools/definitions/move-record.ts
export const moveRecordTool: ToolDefinition = {
  name: "move_record",
  description: `将一条日记移动到指定的分类文件夹。
使用：用户要移动某条日记到另一个分类（"把这条日记移到工作分类"）。
使用：AI 发现某条日记分类不对时主动建议移动。
不用：要批量移动（整个文件夹）→ 用 manage_folder(action:"merge")。
不用：要修改日记内容 → 用 update_record。`,
  parameters: z.object({
    record_id: z.string().describe("日记 ID"),
    domain: z.string().nullable().describe("目标分类路径，如 '工作/v2note'。传 null 表示移到未分类"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    // 1. recordRepo.findById(args.record_id) + 归属校验
    // 2. recordRepo.updateDomain(args.record_id, args.domain)
    // 返回: { record_id, old_domain, new_domain }
  },
};
```

### 场景 1.6: list_folders — 列出用户的文件夹结构
```
假设 (Given)  AI 需要知道用户已有哪些分类
当   (When)   AI 调用 list_folders()
那么 (Then)   返回用户所有 domain 及其记录数
并且 (And)    按层级结构组织（一级 > 二级 > 三级）
并且 (And)    包含未分类记录数
```

```typescript
export const listFoldersTool: ToolDefinition = {
  name: "list_folders",
  description: `列出用户的所有分类文件夹及记录数。
使用：需要了解用户的分类体系（"我有哪些分类"、移动记录前先查看可选分类）。
使用：manage_folder 操作前确认目标文件夹是否存在。
不用：要搜索具体内容 → 用 search。`,
  parameters: z.object({}),
  autonomy: "silent",
  handler: async (args, ctx) => {
    // 复用 recordRepo.listUserDomainsWithCount(ctx.userId)
    // 返回: { folders: [{ domain, count }], uncategorized_count }
  },
};
```

---

## 2. 统一查看工具 — view（合并 view_record / view_todo / view_goal + 扩展）

### 问题

原有 3 个独立查看工具（view_record/view_todo/view_goal）功能模式相同：按 ID 查详情。新增需求还需查看用户画像、记忆、Soul 等。按类型拆分工具会导致工具数膨胀，违反「勿添实体」原则。

### 设计决策

将 view_record + view_todo + view_goal 合并为一个 `view` 工具，通过 `type` 参数分发：
- 有 ID 类型：record / todo / goal / memory（需传 id）
- 无 ID 类型：profile / soul / config（当前用户唯一，无需 id）

### 场景 2.1: view — 查看日记完整内容
```
假设 (Given)  AI 通过 search 找到了一条日记（获得 record_id）
当   (When)   AI 调用 view({ type: "record", id: "xxx" })
那么 (Then)   返回日记的完整内容（transcript text）、标题、domain 分类、创建时间、来源
并且 (And)    内容超过 5000 字时截断并提示 "内容已截断，共 N 字"
并且 (And)    验证 record 属于当前用户
```

### 场景 2.2: view — 查看待办详情
```
假设 (Given)  AI 需要了解某个待办的完整信息
当   (When)   AI 调用 view({ type: "todo", id: "xxx" })
那么 (Then)   返回待办文本、状态、优先级、计划时间、子任务列表
并且 (And)    包含关联的 record_id（来源日记）
```

### 场景 2.3: view — 查看目标详情
```
假设 (Given)  AI 需要了解某个目标的完整信息
当   (When)   AI 调用 view({ type: "goal", id: "xxx" })
那么 (Then)   返回目标标题、状态、关联待办统计
```

### 场景 2.4: view — 查看用户画像
```
假设 (Given)  AI 需要了解用户的基本信息
当   (When)   AI 调用 view({ type: "profile" })
那么 (Then)   返回用户画像：称呼、职业、当前关注、痛点、偏好设置、onboarding_done
并且 (And)    不返回敏感字段（password_hash, device_id 等）
```

### 场景 2.5: view — 查看用户 Soul（AI 认知摘要）
```
假设 (Given)  AI 需要回顾对用户的整体认知
当   (When)   AI 调用 view({ type: "soul" })
那么 (Then)   返回 Soul content — AI 对用户的长期认知摘要
```

### 场景 2.6: view — 查看记忆详情
```
假设 (Given)  AI 通过 search(scope:"memories") 找到一条记忆
当   (When)   AI 调用 view({ type: "memory", id: "xxx" })
那么 (Then)   返回记忆内容、重要度、来源日期、创建时间
```

### 场景 2.7: view — 查看用户配置
```
假设 (Given)  AI 需要了解用户的技能开关/偏好配置
当   (When)   AI 调用 view({ type: "config" })
那么 (Then)   返回所有 skill_config 列表（技能名 + 开关状态 + 配置）
```

```typescript
// gateway/src/tools/definitions/view.ts（替代 view-record.ts / view-todo.ts / view-goal.ts）
export const viewTool: ToolDefinition = {
  name: "view",
  description: `查看用户范围内任何实体的完整详情。
使用：search 返回摘要后需要看详情（"帮我看看那条日记"、"这个待办的子任务"）。
使用：需要了解用户画像/认知摘要/配置（"我的个人信息"、"你对我的了解"）。
不用：要列出或搜索内容 → 用 search。
不用：要修改内容 → 用对应的 update 工具。`,
  parameters: z.object({
    type: z.enum(["record", "todo", "goal", "memory", "profile", "soul", "config"])
      .describe("查看的实体类型"),
    id: z.string().optional()
      .describe("实体 ID（record/todo/goal/memory 必填，profile/soul/config 不需要）"),
  }),
  autonomy: "silent",
  handler: async (args, ctx) => {
    // userId 校验：必须有 userId，否则返回登录过期错误
    // 按 type 分发到对应 handler：
    // record → recordRepo.findById + transcriptRepo + summaryRepo（截断 5000 字）
    // todo   → todoRepo.findById + findSubtasks
    // goal   → goalRepo.findById + findWithTodos
    // memory → memoryRepo（按 id 查询，归属校验）
    // profile → userProfileRepo.findByUser(ctx.userId)
    // soul   → soulRepo.findByUser(ctx.userId)
    // config → skillConfigRepo.findByUser(ctx.userId)
  },
};
```

### 迁移策略

1. 新建 `view.ts`，实现统一 handler
2. 旧的 `view-record.ts` / `view-todo.ts` / `view-goal.ts` 标记为 deprecated
3. `index.ts` 中用 `viewTool` 替换三个旧工具注册
4. agent prompt 中引用 view_record/view_todo/view_goal 的地方改为 view

---

## 3. 时间感知工具 — get_current_time

### 问题

AI 不知道当前时间，无法准确处理"帮我建一个明天下午3点的待办"、"今天是周几"等请求。

### 场景 3.1: 获取当前时间
```
假设 (Given)  AI 需要知道当前时间来处理用户请求
当   (When)   AI 调用 get_current_time()
那么 (Then)   返回当前 ISO 时间、Unix 时间戳、星期几、时区
并且 (And)    包含用户友好的中文格式（"2026年4月6日 周日 下午3:42"）
```

```typescript
export const getCurrentTimeTool: ToolDefinition = {
  name: "get_current_time",
  description: `获取当前时间信息。
使用：需要知道今天日期、现在几点、今天星期几。
使用：创建待办/安排时间前，需要确认当前时间作为参考。
不用：不需要时间信息的操作。`,
  parameters: z.object({}),
  autonomy: "silent",
  handler: async () => {
    const now = new Date();
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    return {
      success: true,
      message: `当前时间: ${now.toISOString()}`,
      data: {
        iso: now.toISOString(),
        timestamp: now.getTime(),
        weekday: `周${weekdays[now.getDay()]}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        formatted: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${weekdays[now.getDay()]} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
      },
    };
  },
};
```

---

## 4. TOOL_LABELS 补全

### 场景 4.1: 所有工具都有用户可见标签
```
假设 (Given)  用户在聊天中触发了任意工具调用
当   (When)   gateway 发送 tool.status 消息
那么 (Then)   每个工具都有对应的中文标签
并且 (And)    标签包含匹配的 emoji + 动作描述
```

```typescript
const TOOL_LABELS: Record<string, string> = {
  // ── 已有 ──
  web_search:      "🔍 正在联网搜索…",
  fetch_url:       "🌐 正在获取网页内容…",
  search:          "📋 正在查找相关记录…",
  create_todo:     "✏️ 正在创建待办…",
  create_goal:     "🎯 正在创建目标…",
  create_project:  "📁 正在创建项目…",
  update_todo:     "✏️ 正在更新待办…",
  update_goal:     "🎯 正在更新目标…",
  delete_record:   "🗑️ 正在删除…",
  // ── 补全现有缺失 ──
  create_record:   "📝 正在创建日记…",
  update_record:   "📝 正在更新日记…",
  delete_todo:     "🗑️ 正在取消待办…",
  create_link:     "🔗 正在建立关联…",
  confirm:         "✅ 正在处理确认…",
  // ── 新增/合并工具 ──
  view:            "📖 正在查看详情…",       // 合并 view_record/view_todo/view_goal
  get_current_time: "🕐 正在获取时间…",
  manage_folder:   "📂 正在管理分类…",
  move_record:     "📂 正在移动日记…",
  list_folders:    "📂 正在查看分类…",
  update_user_info:"👤 正在更新用户信息…",
  // ── deprecated（Phase 5 移除）──
  // view_record / view_todo / view_goal → 已合并为 view
};
```

---

## 5. 工具描述质量优化

### 场景 5.1: 所有工具 description 统一三段式格式
```
假设 (Given)  开发者定义一个工具
当   (When)   编写 description
那么 (Then)   遵循三段式格式：
             1. 一句话说明功能
             2. "使用：" 列出该用的场景（2-3 条）
             3. "不用：" 列出不该用的场景 + 应该用什么替代
```

### 需要优化的现有工具

| 工具 | 建议补充 |
|------|---------|
| create_todo | "不用：要更新已有待办 → 用 update_todo" |
| create_goal | "不用：小任务不需要目标，直接 create_todo" |
| create_record | "不用：用户只是在聊天，不需要记录 → 不调用任何工具" |
| create_link | "不用：不确定是否相关时不要盲目关联" |
| delete_record | "⚠️ 此操作不可恢复。必须先确认用户明确要求删除" |
| delete_todo | "不用：待办已完成 → 用 update_todo(done:true)" |
| update_todo | "使用：标记完成用 done:true。不用：要取消/删除 → 用 delete_todo" |

---

## 6. 认知层查询工具（冷路径，低优先级）

> 产品重构后 Strike/Bond/Cluster 降为冷路径（异步 digest，未来付费功能）。
> 前端已隐藏涌现树，侧边栏改为文件夹。这些工具仅在认知功能重新开放时实现。

### 场景 6.1: list_topics（P3 — 认知功能开放后）
```
假设 (Given)  用户使用天数 >90 天，认知洞察功能已开放
当   (When)   AI 调用 list_topics({ limit: 10 })
那么 (Then)   返回用户当前活跃的认知主题列表
```

### 场景 6.2: view_cluster（P3 — 认知功能开放后）
```
假设 (Given)  AI 通过 list_topics 获得了一个 cluster_id
当   (When)   AI 调用 view_cluster({ cluster_id })
那么 (Then)   返回聚类详情（标题、成员 Strikes、关联目标）
```

---

## 7. search 扩展 + update_user_info（合并 read_diary / read_user_info）

### 设计决策

遵循「如非必要，勿添实体」原则，将 read_diary 和 read_user_info 合并到已有工具中：
- **read_diary → search 扩展**：search 已支持 date 过滤和 scope:"records"，只需允许空 query + 新增 include_ai_diary + memories scope
- **read_user_info → view 扩展**：第 2 节已将 profile/soul/config 纳入统一 view 工具
- **update_user_info**：写操作无法合并到读工具，保留为唯一新增工具

### 场景 7.1: search 扩展 — 空 query 按日期浏览日记
```
假设 (Given)  用户想回顾某天的日记，不需要关键词搜索
当   (When)   AI 调用 search({ query: "", scope: "records", filters: { date: "2026-04-07" } })
那么 (Then)   返回该日期所有日记的标题、摘要、创建时间
并且 (And)    query 为空时按时间排序（而非相关性排序）
并且 (And)    总记录数硬上限 100 条
```

### 场景 7.2: search 扩展 — 附加 AI 日报
```
假设 (Given)  用户想看某天的完整回顾（含 AI 总结）
当   (When)   AI 调用 search({ query: "", scope: "records", filters: { date: "2026-04-07", include_ai_diary: true } })
那么 (Then)   除用户日记外，还返回 AI 生成的当日日报摘要
并且 (And)    日报数据来自 aiDiaryRepo.findByUser(userId, "chat-daily", date)
并且 (And)    日报作为特殊 type:"ai_diary" 的结果项混入返回列表
```

### 场景 7.3: search 扩展 — 搜索记忆
```
假设 (Given)  AI 需要回忆与某话题相关的用户记忆
当   (When)   AI 调用 search({ query: "项目截止日期", scope: "memories" })
那么 (Then)   返回匹配的记忆条目列表（content 片段 + importance + source_date）
并且 (And)    每条记忆包含 id 供后续 view({ type: "memory", id }) 查看完整内容
```

```typescript
// 对 search 工具的修改（gateway/src/tools/definitions/search.ts）
// 1. query 允许为空字符串（纯日期浏览模式）
// 2. scope 新增 "memories" 选项
// 3. filters 新增 include_ai_diary: boolean
// 4. SearchResultItem.type 新增 "memory" | "ai_diary"

// search.ts parameters 变更：
parameters: z.object({
  query: z.string().describe("搜索关键词，留空表示按日期/条件浏览"),  // 移除 .min(1)
  scope: z.enum(["all", "records", "goals", "todos", "clusters", "memories"]).default("all"),
  filters: z.object({
    // ...已有字段保持不变...
    include_ai_diary: z.boolean().optional()
      .describe("是否包含 AI 日报摘要（仅 scope=records 时生效，固定查 chat-daily notebook）"),
  }).optional(),
  // ...其余不变
}),

// search.ts unifiedSearch 变更：
// 1. query 为空时，records 按 created_at DESC 排序（不做关键词匹配）
// 2. 新增 searchMemories() 函数：memoryRepo.findByUser + 关键词过滤
// 3. include_ai_diary 时，额外查询 aiDiaryRepo 并作为 type:"ai_diary" 混入结果
```

### 场景 7.4: search description 更新
```
假设 (Given)  search 工具的描述需要反映新能力
当   (When)   更新 description
那么 (Then)   补充：
             "使用：按日期浏览日记列表（query 留空 + filters.date）→ 不需要 read_diary。"
             "使用：搜索 AI 记忆（scope: 'memories'）。"
             "不用：要看某条记录的完整内容 → 用 view。"
```

### 场景 7.5: update_user_info — 更新用户画像
```
假设 (Given)  用户要求更新个人信息
当   (When)   AI 调用 update_user_info({ name: "小明" })
那么 (Then)   更新 user_profile 对应字段
并且 (And)    返回更新后的字段值
并且 (And)    支持的字段：name, occupation, current_focus, pain_points, review_time
并且 (And)    ctx.userId 为空时拒绝执行，返回登录过期错误
```

### 场景 7.6: update_user_info — 更新偏好设置
```
假设 (Given)  用户要修改偏好设置
当   (When)   AI 调用 update_user_info({ preferences: { theme: "dark" } })
那么 (Then)   合并更新到 preferences JSON 字段（PostgreSQL || 操作）
并且 (And)    不覆盖未提及的偏好项
```

```typescript
// gateway/src/tools/definitions/update-user-info.ts（唯一新增工具）
export const updateUserInfoTool: ToolDefinition = {
  name: "update_user_info",
  description: `更新用户的个人画像信息。
使用：用户要求修改称呼、职业、关注重点等（"叫我小明"、"我换工作了"）。
使用：用户要调整偏好设置。
不用：AI 自动推断的用户画像更新（那由 profile manager 自动处理）。
不用：只需要查看画像 → 用 view(type:"profile")。`,
  parameters: z.object({
    name: z.string().optional().describe("用户称呼"),
    occupation: z.string().optional().describe("职业"),
    current_focus: z.string().optional().describe("当前关注的事"),
    pain_points: z.string().optional().describe("当前的困扰/痛点"),
    review_time: z.string().optional().describe("偏好的回顾时间（如 '21:00'）"),
    preferences: z.record(z.any()).optional().describe("偏好设置（JSON，合并更新）"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    // 1. userId 校验：为空则返回 { success: false, message: "登录已过期，请重新登录" }
    // 2. 逐字段更新: upsertOnboardingField() 处理 name/occupation 等
    // 3. preferences: upsertPreferences() 合并更新
    // 4. 返回更新后的完整画像
  },
};
```

---

## 边界条件

### view 统一查看器
- [ ] view 传入不存在/无权的 id：`{ success: false, message: "内容不存在或无权访问" }`
- [ ] view(type:"record") 内容超长（>5000 字）：截断 + `truncated: true`
- [ ] view(type:"todo") 查看已完成的待办：正常返回，附带 done 状态
- [ ] view(type:"goal") 有大量关联待办：限制返回数最多 20 个
- [ ] view(type:"profile") 用户无画像记录：返回空画像 + onboarding_done: false
- [ ] view(type:"soul") 用户无 soul：返回 `{ content: null, message: "尚未建立认知摘要" }`
- [ ] view 需要 id 的类型（record/todo/goal/memory）但未传 id：返回参数错误
- [ ] view 所有类型：ctx.userId 为空时拒绝执行，返回登录过期错误，不 fallback 到 deviceId

### search 扩展
- [ ] search query 为空 + 无日期过滤：返回错误"请提供搜索关键词或日期条件"
- [ ] search query 为空 + 有日期过滤：按时间排序（不做关键词匹配）
- [ ] search scope:"memories" 关键词搜索：按 content ILIKE 匹配 + importance 排序
- [ ] search include_ai_diary 仅在 scope="records" 且有日期过滤时生效，否则忽略
- [ ] search 日期范围超过 30 天：截断到 30 天并提示
- [ ] search 总记录数硬上限 100 条（跨日浏览模式）

### update_user_info
- [ ] update_user_info 所有字段都未传：返回错误"请至少指定一个要更新的字段"
- [ ] update_user_info ctx.userId 为空：拒绝执行，返回登录过期错误

### 其他
- [ ] get_current_time 时区：返回服务器时区
- [ ] manage_folder rename 目标名已存在：合并行为（等同 merge）
- [ ] manage_folder delete 文件夹下有子级：递归清空所有子级记录的 domain
- [ ] move_record 目标 domain 不存在（新分类）：自动创建（首条记录归入即生效）
- [ ] list_folders 用户无任何分类：返回空 + uncategorized_count
- [ ] TOOL_LABELS 与 spec 116 的类型化图标映射保持一致

## 依赖

- `gateway/src/tools/definitions/` — 新增工具文件
- `gateway/src/tools/definitions/index.ts` — 注册新工具
- `gateway/src/ai/provider.ts` — 补全 TOOL_LABELS
- `gateway/src/db/repositories/record.ts` — findById / updateDomain / listUserDomainsWithCount（已有）
- `gateway/src/db/repositories/todo.ts` — findById / findSubtasks（已有）
- `gateway/src/db/repositories/goal.ts` — findById（已有）
- `gateway/src/db/repositories/user-profile.ts` — findByUser / upsertOnboardingField / upsertPreferences
- `gateway/src/db/repositories/ai-diary.ts` — findByUser / findSummariesByUser
- `gateway/src/db/repositories/soul.ts` — 用户认知摘要
- Spec 115 模块 A.7 — 文件夹管理后端 API（需同步实现或由工具直接操作 repo）

## Implementation Phases (实施阶段)

- [x] **Phase 1: P0 基础** — 补全 TOOL_LABELS 5 个缺失 + 新增 `get_current_time` + 注册 ✅ 2026-04-06
- [x] **Phase 2: P1 读取** — 新增 `view_record` / `view_todo` / `view_goal` + 归属校验 + 截断 ✅ 2026-04-06
- [x] **Phase 3: P1 文件夹** — 新增 `manage_folder` / `move_record` / `list_folders` + repo 层批量更新方法 ✅ 2026-04-06
- [x] **Phase 4: P1 描述优化** — 所有 ~21 个工具统一三段式 description ✅ 2026-04-06
- [x] **Phase 5: P1 工具合并精简** ✅ 2026-04-08 — 合并 view_record/view_todo/view_goal → `view` 统一查看器（+profile/soul/memory/config）；扩展 search（空 query + memories scope + include_ai_diary）；新增 `update_user_info`；移除 3 个旧 view 工具（净减 2 个工具）
- [ ] **Phase 6: P3 认知层（未来）** — 认知功能开放后新增 `list_topics` / `view_cluster`

## 备注

- **工具精简原则**：合并同类工具，不新增读工具（read_diary/read_user_info 合并到 search/view），只新增写工具（update_user_info）
- Phase 5 净效果：删 3 个工具（view_record/view_todo/view_goal），新增 2 个（view/update_user_info），扩展 1 个（search），**总工具数减 1**
- `view` 统一查看器：按 type 分发，有 id 类型（record/todo/goal/memory）和无 id 类型（profile/soul/config）
- `search` 扩展：query 允许为空（纯日期浏览）、新增 memories scope、新增 include_ai_diary 过滤
- **登录校验**：view/search/update_user_info 所有操作要求 ctx.userId，为空时返回登录过期错误，不 fallback 到 deviceId。⚠️ 实现时禁止从旧 view-record.ts 复制 deviceId fallback 逻辑
- **search 空 query 快速路径**：query 为空时跳过 ILIKE 全文搜索，改用简单的 `SELECT * FROM record WHERE user_id = $1 ORDER BY created_at DESC` + 日期过滤，避免性能问题
- **迁移过渡期**：旧工具名 view_record/view_todo/view_goal 保留为别名（内部映射到 view handler）持续一个版本周期，防止缓存的 agent prompt 引用旧名崩溃
- 所有新增只读工具为 `autonomy: "silent"`；`manage_folder` 为 `confirm`；`move_record`/`update_user_info` 为 `notify`
- `manage_folder` 使用 action-based 设计，单工具多操作减少工具总数
- 文件夹工具的 repo 层操作需要新增：`batchUpdateDomain(userId, oldPrefix, newPrefix)` 和 `clearDomainByPrefix(userId, prefix)`
- 认知层工具降为 P3，与产品"渐进展露"策略一致（90天后开放认知洞察）

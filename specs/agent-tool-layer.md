---
id: "060"
title: "Agent 工具层重构"
status: completed
domain: agent
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# Agent 工具层重构

> 状态：✅ 已完成 | 优先级：Phase 2.5（Agent 基础能力）| 完成日期：2026-03-24
> 依赖：无（当前 builtin.ts 可平滑迁移）

## 概述
路路（AI 参谋）需要通过工具帮用户完成 CRUD 操作——创建日记、待办、目标、项目，查询信息，建立关联等。当前 9 个内置工具存在粒度不一致、query 类缺失、LLM 选择困难等问题。本 spec 定义工具整合方案、描述规范、自主度分级、结果格式，并将 chat handler 的工具调用从手动 JSON 解析迁移到 Vercel AI SDK 原生 function calling。

**当前状态：**
- `gateway/src/tools/builtin.ts`：9 个工具（create_diary/todo/goal/notebook/skill, update_todo, delete_diary, ingest, confirm_intent）
- `gateway/src/handlers/chat.ts`：手动正则提取 tool_calls JSON，最多 3 轮循环
- 缺少：所有 query/search 工具、update_goal、delete_todo、complete 操作、create_link
- 工具描述过于简单，LLM 误调用率高

## 场景

### 场景 1: 工具清单整合——从分散到收敛

```
假设 (Given)  当前有 9 个工具，缺少 query/update/delete 操作
当   (When)   重构工具层
那么 (Then)   最终工具清单收敛为以下 13 个原子工具：

  CRUD 类（8 个）：
    create_record   — 创建日记/笔记
    create_todo     — 创建待办
    create_goal     — 创建目标（需确认）
    create_project  — 创建项目（需确认）
    update_record   — 更新日记内容
    update_todo     — 更新待办（含 complete/reopen 状态变更）
    update_goal     — 更新目标（含 archive/complete 状态变更）
    delete_record   — 删除日记（需确认）

  链接类（1 个）：
    create_link     — 两条记录/目标之间建立关联 Bond

  搜索类（1 个）：
    search          — 统一搜索，scope 参数筛选范围

  系统类（3 个）：
    confirm         — 通用确认（替代 confirm_intent，扩展为确认 Plan）
    web_search      — 联网搜索（见 agent-web-tools spec）
    fetch_url       — URL 抓取（见 agent-web-tools spec）

并且 (And)    移除独立的 complete_todo（合并为 update_todo status='completed'）
并且 (And)    移除独立的 archive_goal（合并为 update_goal status='archived'）
并且 (And)    create_skill / ingest 保留但降级为内部工具（不暴露给 LLM 直接选择）
```

### 场景 2: 统一搜索工具——scope 参数替代多个 query 工具

```
假设 (Given)  用户说"找一下关于供应商的东西"
当   (When)   LLM 决定需要搜索
那么 (Then)   调用 search({ query: "供应商", scope: "all" })
并且 (And)    search 在 records, goals, todos, clusters 四类实体中搜索
并且 (And)    返回 results[] 数组，每项包含 { id, type, title/text, snippet, score }
并且 (And)    默认 limit=10，按 relevance score 排序

假设 (Given)  用户说"我这周有哪些待办"
当   (When)   LLM 调用 search({ query: "本周待办", scope: "todos", time_range: { from, to } })
那么 (Then)   只在 todos 中搜索，结合 time_range 过滤
并且 (And)    scope 可选值：all | records | goals | todos | clusters
```

### 场景 3: 工具描述规范——正例 + 反例 + 边界

```
假设 (Given)  每个工具需要高质量的描述以降低 LLM 误调用
当   (When)   定义工具描述
那么 (Then)   每个工具描述包含三部分：
      1. 一句话功能说明
      2. 使用时机（正例，2-3 个典型触发语句）
      3. 不使用时机（反例，2-3 个易混淆场景 + 应该用什么替代）

示例 — create_todo：
  "创建一条待办事项。
   使用：用户提到具体要做的事（'帮我建个待办'、'提醒我明天找张总'、'加个任务'）。
   不用：用户只是记录想法/感受 → 用 create_record。
   不用：用户要设定长期目标 → 用 create_goal。
   不用：用户要求批量创建 → 交给 Plan 机制。"

示例 — search：
  "在系统中搜索信息。
   使用：用户要查找已有内容（'找一下'、'有没有关于'、'上次说的'）。
   使用：执行其他操作前需要先找到目标对象（如修改前先搜索）。
   不用：用户要搜索互联网信息 → 用 web_search。"
```

### 场景 4: 工具自主度三级分类

```
假设 (Given)  不同工具的执行风险不同
当   (When)   路路决定调用工具
那么 (Then)   根据自主度分级决定执行方式：

  Level 1 — 静默执行（执行后不单独告知）：
    search         — 只读，不改数据
    fetch_url      — 只读取外部内容

  Level 2 — 告知执行（执行后在回复中自然提及结果）：
    create_record  — "帮你记下了"
    create_todo    — "已创建待办：XXX"
    create_link    — "已建立关联"
    update_todo    — "已标记完成" / "已更新时间"
    update_record  — "已更新内容"

  Level 3 — 确认执行（暂停等用户同意才执行）：
    delete_record  — 任何删除操作
    create_goal    — 创建目标是重大决策
    create_project — 创建项目是重大决策
    update_goal    — 目标状态变更（archive/complete）
    batch 操作     — Plan 中一次创建多条

并且 (And)    自主度等级存储在工具定义的 autonomy 字段
并且 (And)    Level 3 工具调用时，路路先描述意图，等用户回复后再执行
```

### 场景 5: 工具结果结构化——data + next_hint

```
假设 (Given)  工具执行完成
当   (When)   结果返回给 LLM
那么 (Then)   结果格式为：
      {
        success: boolean,
        message: string,        // 人类可读摘要
        data: {                 // 结构化数据（LLM 可用于后续推理）
          id?: string,          // 创建/修改的实体 ID
          results?: array,      // search 结果数组
          ...                   // 其他工具特有数据
        },
        next_hint?: string      // 给 LLM 的下一步导航提示
      }

示例 — search 返回：
  {
    success: true,
    message: "找到 3 个匹配结果",
    data: {
      results: [
        { id: "g1", type: "goal", title: "Q2产品发布", status: "active" },
        { id: "t1", type: "todo", text: "联系供应商A", done: false }
      ]
    },
    next_hint: "若要操作某项，使用对应 update 工具传入 id"
  }

示例 — create_todo 返回：
  {
    success: true,
    message: "已创建待办：找张总确认报价",
    data: { todo_id: "t123", record_id: "r456" },
    next_hint: "如果待办需要关联到某个目标，可用 create_link"
  }
```

### 场景 6: Vercel AI SDK 原生 function calling 迁移

```
假设 (Given)  当前 chat.ts 用正则从 AI 文本中提取 tool_calls JSON
并且 (And)    extractToolCalls() 依赖 AI 输出格式一致（脆弱）
当   (When)   迁移到 Vercel AI SDK 原生 function calling
那么 (Then)   工具定义使用 Vercel AI SDK 的 tool() 函数 + Zod schema
并且 (And)    调用使用 generateText({ tools, maxSteps }) 替代手动循环
并且 (And)    移除 extractToolCalls() 正则解析逻辑
并且 (And)    maxSteps 替代 MAX_TOOL_ROUNDS 常量
并且 (And)    Qwen3-max 通过 OpenAI-compatible 接口支持原生 function calling
```

### 场景 7: 工具定义的注册与发现

```
假设 (Given)  工具定义分散在 builtin.ts、未来还有 MCP 外部工具
当   (When)   系统启动或 chat 会话开始
那么 (Then)   ToolRegistry 统一注册所有可用工具
并且 (And)    注册信息包含：name, description, parameters(Zod), autonomy, handler
并且 (And)    chat handler 从 ToolRegistry 获取当前会话可用工具列表
并且 (And)    MCP 工具和内置工具对 LLM 的呈现方式一致
```

### 场景 8: delete_todo 缺失补全

```
假设 (Given)  当前没有 delete_todo 工具
当   (When)   用户说"把那个待办删了"
那么 (Then)   路路先调用 search 找到目标待办
并且 (And)    展示找到的结果，确认删除哪一条（Level 3 确认）
并且 (And)    用户确认后调用 delete_record（todo 通过 record 级联删除）
```

### 场景 9: update_goal 状态变更合并

```
假设 (Given)  用户说"那个供应商评估的目标完成了"
当   (When)   路路调用 update_goal({ goal_id: "g1", status: "completed" })
那么 (Then)   goal.status 更新为 completed
并且 (And)    关联的 Cluster 不受影响（Cluster 是认知结构，不随目标关闭）
并且 (And)    触发晚间回顾中的"目标完成祝贺 + 结果追踪"（见 action-tracking spec）

假设 (Given)  用户说"那个目标先搁置"
当   (When)   路路调用 update_goal({ goal_id: "g1", status: "archived" })
那么 (Then)   goal.status 更新为 archived
并且 (And)    已关联的 todos 不自动删除（用户可能想保留）
```

### 场景 10: create_link 建立关联

```
假设 (Given)  用户说"把今天的日记和'供应商评估'目标关联起来"
当   (When)   路路先 search 找到日记和目标
并且 (And)    调用 create_link({ source_id, target_id, link_type })
那么 (Then)   创建 Bond（type='user_link'）
并且 (And)    link_type 可选：related（相关）、supports（支持）、blocks（阻碍）
并且 (And)    source/target 可以是 record、goal、strike 的 ID
```

### 场景 11: 未满足请求记录

```
假设 (Given)  用户要求路路做某事
当   (When)   路路找不到匹配的工具或 Plan 模式
那么 (Then)   记录一条 unmet_request：
      { user_id, request_text, failure_reason, session_mode, created_at }
并且 (And)    路路诚实回复："这个我目前还做不到，但我记住了你的需要。"
并且 (And)    不说"已帮你记录"（没有创建任何用户可见的实体）
并且 (And)    unmet_request 数据用于未来需求优先级排序
```

## 边界条件
- [ ] 工具参数缺失：LLM 漏传 required 参数 → Zod 验证报错，返回明确提示
- [ ] 工具执行超时：单个工具 10s 超时 → 返回 timeout 错误，不影响对话
- [ ] ID 不存在：update/delete 传入不存在的 ID → 返回"未找到"，建议用 search 先查
- [ ] 权限校验：所有工具执行前验证 deviceId/userId 归属
- [ ] 并发调用：同一用户同时触发两个 create_todo → 两条都创建，不去重（由 Plan 层处理）

## 接口约定

工具注册接口：
```typescript
interface ToolDefinition {
  name: string;
  description: string;         // 含正例+反例的完整描述
  parameters: ZodType;         // Zod schema（替代 JSON Schema）
  autonomy: 'silent' | 'notify' | 'confirm';
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolCallResult>;
}

interface ToolContext {
  deviceId: string;
  userId?: string;
  sessionId: string;
  planId?: string;            // 如果在 Plan 执行中
}

interface ToolCallResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  next_hint?: string;
}
```

统一搜索接口：
```typescript
interface SearchParams {
  query: string;
  scope: 'all' | 'records' | 'goals' | 'todos' | 'clusters';
  time_range?: { from: string; to: string };
  limit?: number;             // 默认 10，最大 50
}

interface SearchResult {
  id: string;
  type: 'record' | 'goal' | 'todo' | 'cluster';
  title: string;              // 或 text（todo）或 label（cluster）
  snippet?: string;           // 匹配文本片段
  score: number;              // 相关性评分
  status?: string;            // 实体当前状态
  created_at: string;
}
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/tools/builtin.ts` | 重构：拆分为 registry + 独立 handler 文件 |
| 新建 `gateway/src/tools/registry.ts` | ToolRegistry 注册/发现 |
| 新建 `gateway/src/tools/definitions/` | 每个工具独立定义文件 |
| 新建 `gateway/src/tools/search.ts` | 统一搜索实现 |
| `gateway/src/handlers/chat.ts` | 重构：移除 extractToolCalls，使用 Vercel AI SDK tools |
| 新 migration | unmet_request 表 |
| 新建 `gateway/src/db/repositories/unmet-request.ts` | CRUD |

## 依赖
- Vercel AI SDK v6（已有）
- Zod（已有）
- DashScope Qwen3-max function calling 支持（已验证）

## 验收标准
LLM 通过原生 function calling 调用工具，误调用率（选错工具）< 10%；统一搜索能跨实体返回结果；未满足请求有记录可查。

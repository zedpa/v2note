---
id: "058"
title: "Agent Plan 机制"
status: completed
domain: agent
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# Agent Plan 机制

> 状态：✅ 后端+前端基础完成 | 优先级：Phase 2.5（Agent 基础能力）
> 后端: plan-repo + plan-executor + migration 完成
> 前端: plan-card.tsx + use-chat plan消息处理 + gateway-client类型扩展 (2026-03-29)
> 待完善: chat handler 状态机深度改造（当前用 plan.proposed 消息触发前端 plan-card）
> 依赖：agent-tool-layer（工具注册 + 原生 function calling）

## 概述
复杂任务（目标拆解、路径设定、联网研究+行动）需要多步工具调用 + 中间确认。当前 chat handler 的 3 轮固定循环无法支持。本 spec 定义 Plan 机制——持久化的多步任务编排，支持暂停/确认/修改/恢复/回滚，以及 chat handler 从循环模式到状态机模式的架构改造。

**当前状态：**
- `chat.ts` streamWithToolCalls：for 循环 3 轮，无法暂停等用户
- Session 是纯内存 Map，30 分钟过期，无持久化
- 无 Plan 概念，无批量操作事务保障

## 场景

### 场景 1: 意图分类——简单操作 vs Plan

```
假设 (Given)  用户发送一条消息给路路
当   (When)   AI 分析用户意图
那么 (Then)   分类为三种之一：

  conversation — 普通对话，不调工具
    例："最近怎么样"、"帮我分析一下这个问题"

  simple_action — 1-2 步工具可完成
    例："帮我建个待办：明天找张总"、"把那个待办标记完成"

  complex_task — 需要多步 + 确认，进入 Plan 模式
    例："帮我拆解Q2产品发布"、"看看这个链接，总结后建几个待办"

并且 (And)    分类由 AI 在首次回复中隐式决定（不需要单独的分类调用）
并且 (And)    simple_action 直接走工具调用，不生成 Plan
```

### 场景 2: Plan 生成与持久化

```
假设 (Given)  AI 判断为 complex_task
当   (When)   AI 生成执行方案
那么 (Then)   创建 Plan 并持久化到 agent_plan 表：
      {
        id: uuid,
        user_id,
        intent: "拆解Q2产品发布",    -- 用户原始意图
        steps: PlanStep[],            -- 多步骤
        status: 'awaiting_confirm',   -- 等待用户确认
        current_step: 0,
        created_at,
        updated_at,
        expires_at: created_at + 7d   -- 7天过期
      }
并且 (And)    每个 PlanStep 包含：
      {
        index: number,
        description: string,          -- 人类可读
        tool_call?: { name, args },   -- 要调用的工具（可选）
        needs_confirm: boolean,       -- 是否需确认
        status: 'pending',
        result?: unknown
      }
并且 (And)    Plan 呈现给用户确认（见场景 5）
```

### 场景 3: Chat Handler 状态机改造

```
假设 (Given)  用户发送消息
当   (When)   agentLoop 处理消息
那么 (Then)   按状态机模式运行：

  状态流转：
    IDLE → THINKING（AI 推理中）
    THINKING → STREAMING（普通文本回复）
    THINKING → EXECUTING_TOOL（工具调用）
    THINKING → PLAN_PROPOSED（生成了 Plan，等用户确认）
    EXECUTING_TOOL → THINKING（工具结果反馈，AI 继续推理）
    EXECUTING_TOOL → AWAITING_CONFIRM（Level 3 工具需确认）
    PLAN_PROPOSED → IDLE（等待用户下一条消息）
    AWAITING_CONFIRM → IDLE（等待用户下一条消息）

并且 (And)    THINKING → EXECUTING_TOOL 循环最多 10 步（安全阀）
并且 (And)    进入 IDLE 时，暂停状态持久化到 Session/Plan
并且 (And)    用户下次发消息时，从暂停点恢复
```

### 场景 4: Plan 执行——逐步执行 + 自动继续

```
假设 (Given)  用户确认执行 Plan
当   (When)   Plan 执行器开始工作
那么 (Then)   按 step 顺序执行：
      step.status pending → running → done

      如果 step.needs_confirm = false 且 step.tool_call 存在：
        自动执行工具，记录 result，继续下一步

      如果 step.needs_confirm = true：
        暂停执行，向用户展示当前进度 + 下一步内容
        等待用户确认后继续

      如果 step.tool_call 为空（纯 AI 推理步骤）：
        AI 基于前序 step 结果生成内容，继续下一步

并且 (And)    每步执行完更新 agent_plan.current_step 和 step.status
并且 (And)    全部完成后 plan.status = 'done'
```

### 场景 5: Plan 确认 UI——对话内卡片

```
假设 (Given)  Plan 生成后需要用户确认
当   (When)   路路展示 Plan
那么 (Then)   以结构化卡片形式在对话中展示：

      路路："我建议这样拆解'Q2产品发布'："
      [Plan Card]
        1. ☐ 完成需求文档    → 4月1日前
        2. ☐ UI设计定稿      → 4月10日前
        3. ☐ 开发完成        → 4月25日前
        4. ☐ 测试验收        → 5月5日前
        [全部执行] [修改后执行] [算了]

并且 (And)    "全部执行" → 前端发送 plan_confirm(action='execute_all')
并且 (And)    "修改后执行" → 卡片变为可编辑，用户改完发送 plan_confirm(action='execute_modified', modifications=[])
并且 (And)    "算了" → plan_confirm(action='abandon')
```

### 场景 6: Plan 修改——结构化差分协议

```
假设 (Given)  用户选择"修改后执行"
当   (When)   用户在卡片内编辑（改文字、删步骤、加步骤）后确认
那么 (Then)   前端发送结构化修改请求（不走自然语言）：
      {
        type: 'plan_confirm',
        plan_id: 'plan_xxx',
        action: 'execute_modified',
        modifications: [
          { step_index: 1, action: 'update', new_value: { description: "UI+交互稿" } },
          { step_index: 2, action: 'delete' },
          { step_index: 4, action: 'add', new_value: { description: "灰度发布", tool_call: {...} } }
        ]
      }
并且 (And)    后端直接 apply modifications 到 Plan，不需要 AI 重新推理
并且 (And)    apply 后立即开始执行

假设 (Given)  用户不在卡片中编辑，而是发送自然语言修改
      例："第二个改成包含交互稿，第三个删掉"
当   (When)   AI 收到自然语言修改
那么 (Then)   AI 解析为 modifications 结构，更新 Plan
并且 (And)    重新展示修改后的 Plan 卡片，请用户最终确认
```

### 场景 7: Plan 中断与恢复（Plan 栈）

```
假设 (Given)  用户正在确认一个 Plan（拆解Q2产品发布）
当   (When)   用户突然问了一个无关的问题
      例："等等，先帮我查一下张总上次说的时间"
那么 (Then)   当前 Plan 状态保持为 'awaiting_confirm'（不丢失）
并且 (And)    路路正常处理插入请求（调用 search）
并且 (And)    处理完后，路路主动提醒："回到刚才的拆解方案，你看可以吗？"
并且 (And)    Session 维护一个 active_plan_id，插入请求不清除它

假设 (Given)  Plan 正在执行中（step 3/5）
当   (When)   用户说"先停一下"
那么 (Then)   Plan.status 变为 'paused'
并且 (And)    已执行的步骤保留结果
并且 (And)    用户说"继续"时，从 step 4 恢复执行
```

### 场景 8: Plan 批量操作的安全阀

```
假设 (Given)  Plan 包含 5 步 create 操作（3 子目标 + 2 待办）
当   (When)   执行到第 4 步时失败（如 DB 写入错误）
那么 (Then)   Plan.status 变为 'partial_failure'
并且 (And)    已创建的 3 子目标 + 1 待办保留在数据库中
并且 (And)    Plan.rollback_info 记录已创建实体的 ID 列表
并且 (And)    路路告知用户：
      "执行到第 4 步时失败了。已创建的内容：
       ✅ 子目标1：完成需求文档
       ✅ 子目标2：UI设计定稿
       ✅ 子目标3：开发完成
       ❌ 待办：联系测试团队（失败原因：xxx）
       ☐ 待办：准备发布清单（未执行）
       要保留已创建的部分，还是全部撤销？"

并且 (And)    不自动回滚——半成品可能对用户有价值
并且 (And)    用户选择"撤销" → 逐个删除 rollback_info 中的实体
```

### 场景 9: Plan 过期与清理

```
假设 (Given)  Plan 创建后 7 天用户未确认
当   (When)   到达 expires_at
那么 (Then)   Plan.status 自动变为 'expired'
并且 (And)    过期前 1 天，在晚间回顾中提醒：
      "你上周让我拆解'Q2产品发布'，方案还没确认，要看看吗？"
并且 (And)    过期后不再提醒
并且 (And)    expired Plan 保留 30 天后物理删除
```

### 场景 10: 典型 Plan 流程——目标拆解

```
假设 (Given)  用户说"帮我把'Q2产品发布'拆解一下"
当   (When)   路路处理
那么 (Then)   执行以下步骤：

  Step 1: search({ query: "Q2产品发布", scope: "goals" })
    → 找到 goal g1
    → 自动执行（search 是 Level 1 静默）

  Step 2: AI 基于 goal 内容 + 用户历史 Cluster 生成拆解方案
    → 纯推理步骤，无工具调用

  Step 3: 生成 Plan 呈现给用户
    → Plan 包含 N 个 create_goal(parent_id=g1) + M 个 create_todo 步骤
    → 暂停等确认（Plan 整体是 Level 3）

  Step 4: 用户确认后批量执行
    → 逐步创建子目标和待办
    → 每步结果记录到 Plan

  Step 5: 完成后 create_link 关联子目标到 Cluster
    → 自动执行
```

### 场景 11: 典型 Plan 流程——联网研究 + 行动

```
假设 (Given)  用户说"帮我看看这个链接 https://xxx.com/report，
      总结后给供应商评估补几个待办"
当   (When)   路路处理
那么 (Then)   执行以下步骤：

  Step 1: fetch_url({ url: "https://xxx.com/report" })
    → 抓取内容，静默执行

  Step 2: AI 总结要点
    → 纯推理，在回复中展示摘要

  Step 3: search({ query: "供应商评估", scope: "goals" })
    → 找到目标，静默执行

  Step 4: AI 基于摘要 + 目标上下文生成待办建议
    → 生成 Plan 呈现给用户

  Step 5: 用户确认后批量创建待办
    → create_todo × N

  Step 6: 同时将抓取内容作为 material 录入
    → 后台调用 ingest (source_type='material')
```

### 场景 12: 异常——Plan 执行中工具不存在

```
假设 (Given)  Plan 中某步引用了不存在的工具
当   (When)   执行到该步
那么 (Then)   该步标记为 failed，reason="工具不存在"
并且 (And)    跳过该步继续后续步骤（如果后续步骤不依赖此步结果）
并且 (And)    如果后续步骤依赖此步 → 整体暂停，报告用户
```

## 边界条件
- [ ] Plan 步骤超过 20 步 → 拒绝生成，建议用户拆分
- [ ] 同一用户同时有多个 active Plan → 允许，但 Session 只追踪最新一个
- [ ] Plan 中引用的实体被外部删除 → 执行时检测，标记步骤 failed
- [ ] 用户连续发"继续"但 Plan 已完成 → 提示"方案已全部执行"
- [ ] 网络中断导致 Plan 执行中断 → 依赖持久化，下次连接时可恢复

## 接口约定

数据库：
```sql
CREATE TABLE agent_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_user(id),
  device_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'drafting'
    CHECK (status IN ('drafting','awaiting_confirm','executing','paused',
                      'done','partial_failure','expired','abandoned')),
  current_step INT NOT NULL DEFAULT 0,
  rollback_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX idx_agent_plan_user_status ON agent_plan(user_id, status);
CREATE INDEX idx_agent_plan_device_status ON agent_plan(device_id, status);
```

前端确认协议：
```typescript
interface PlanConfirmMessage {
  type: 'plan_confirm';
  plan_id: string;
  action: 'execute_all' | 'execute_modified' | 'abandon' | 'pause' | 'resume';
  modifications?: PlanModification[];
}

interface PlanModification {
  step_index: number;
  action: 'update' | 'delete' | 'add';
  new_value?: Partial<PlanStep>;
}
```

Session 扩展：
```typescript
interface Session {
  // ... 现有字段
  activePlanId?: string;         // 当前活跃 Plan
  chatState: ChatState;          // 状态机当前状态
  pendingConfirm?: {             // 等待确认的操作
    type: 'tool' | 'plan';
    id: string;
    description: string;
  };
}

enum ChatState {
  IDLE = 'idle',
  THINKING = 'thinking',
  EXECUTING_TOOL = 'executing_tool',
  AWAITING_CONFIRM = 'awaiting_confirm',
  STREAMING = 'streaming',
}
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新 migration | agent_plan 表 |
| 新建 `gateway/src/db/repositories/agent-plan.ts` | Plan CRUD |
| 新建 `gateway/src/agent/plan-executor.ts` | Plan 执行器 |
| 新建 `gateway/src/agent/plan-builder.ts` | Plan 生成（AI → Plan 结构） |
| `gateway/src/handlers/chat.ts` | 重构：状态机 agentLoop 替代 streamWithToolCalls |
| `gateway/src/session/manager.ts` | 扩展：activePlanId, chatState, pendingConfirm |
| 新建 `features/chat/components/plan-card.tsx` | Plan 确认卡片前端组件 |
| `gateway/src/cognitive/daily-cycle.ts` | 修改：Plan 过期提醒 |

## 依赖
- agent-tool-layer（工具注册、原生 function calling）
- Vercel AI SDK generateText maxSteps（工具循环基础）
- Supabase（持久化）

## 验收标准
目标拆解全流程可跑通：用户说"拆解" → 路路生成方案 → 用户修改后确认 → 批量创建子目标和待办；中间打断后能恢复；7 天未确认自动过期并提醒。

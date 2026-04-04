---
id: "102b"
title: "Voice — Todo Extension & Reminders"
status: active
domain: voice
dependencies: ["voice-routing.md", "todo-core.md"]
superseded_by: null
related: ["voice-routing.md"]
created: 2026-03-23
updated: 2026-04-04
---
# Voice — 待办扩展模型（提醒 + 周期 + 日历）

> 状态：🟢 全链路已接通（fix-voice-todo-pipeline.md 完成：API补字段、确认补全、静默执行、文字修改、子任务展示） | 优先级：P0
> 依赖：voice-routing.md（路由核心）
> 路由核心逻辑见 [voice-routing.md](voice-routing.md)

## 实现核查（2026-04-04）

### Section 1: AI提取接口
| 场景 | 状态 | 说明 |
|------|------|------|
| AI Prompt 全字段 | ✅ 完成 | todo-extract-prompt.ts:54-71 含 text/time/priority/person/goal_hint/reminder/recurrence |
| todoFullMode 上下文注入 | ✅ 完成 | process.ts:441-460 传 pendingTodos(30)+activeGoals(20) |
| goal_hint→goal_id 匹配 | ✅ 后端完成 | process.ts:542-549 匹配到 `_matched_goal_id` |

### Section 1 场景 C1-C7
| 场景 | 后端 | 前端 | 差距 |
|------|------|------|------|
| C1 创建+目标匹配 | ✅ AI提取+goal_id匹配 | ❌ | **app/page.tsx:208 createTodo()未传goal_id** |
| C1b 创建+收集箱 | ✅ | ✅ | 正常工作 |
| C2 创建+提醒 | ✅ AI提取reminder | ❌ | **createTodo()未传reminder_* 字段；API不接受** |
| C3 创建+周期 | ✅ AI提取recurrence | ❌ | **createTodo()未传recurrence_* 字段；API不接受** |
| C4 创建多条 | ✅ | ✅ | 正常工作 |
| C5 完成待办 | ✅ target_hint匹配 | ✅ | 正常工作 |
| C6 修改待办 | ✅ changes对象 | ✅ | 正常工作 |
| C7/C7b 查询 | ✅ query_result填充 | ✅ | 正常工作，含goal_id过滤 |

### Section 2: 确认弹窗 D1-D10
| 场景 | 状态 | 说明 |
|------|------|------|
| D1 零等待弹出 | ✅ 完成 | app/page.tsx:150-162 asr.done→立即打开CommandSheet |
| D2 待办卡片 | ✅ 完成 | command-sheet.tsx CommandCard 显示所有字段 |
| D3 多指令独立✓/✕ | ❌ 未实现 | 只有底部"全部确认"，无单卡片按钮 |
| D4 继续说话修改 | ❌ 空函数 | app/page.tsx:533 `/* v2: trigger recording again */` |
| D5 字段点击编辑 | ✅ 完成 | TodoDetailEdit 支持text/time/priority/reminder编辑 |
| D6 Agent状态流 | 🟡 部分 | tool.step接收并显示，但结果非实时流式 |
| D8 查询结果展示 | ✅ 完成 | 最多5条+查看更多跳转 |
| D8b 查看更多跳转 | ✅ 完成 | onViewMore跳转到目标详情或待办页 |
| D9 静默执行 | ❌ 未接通 | confirm_before_execute设置项存在但未使用 |
| D10 撤销操作 | ❌ 未实现 | use-undo-toast基础设施在，未连接 |

### Section 3: 隐藏Record E1-E3
| 场景 | 状态 | 说明 |
|------|------|------|
| E1 todo_voice源 | ✅ 完成 | asr.ts:516 source="todo_voice" |
| E2 command_voice源 | ✅ 完成 | asr.ts:518 source="command_voice" |
| E3a 日记列表过滤 | ✅ 完成 | record.ts:25 HIDDEN_SOURCES_CLAUSE 过滤 |
| E3b 待办详情查看原文 | ❌ 未实现 | 无"查看原文"UI |

### Section 4: DB扩展
| 项 | 状态 | 说明 |
|------|------|------|
| Migration 048 | ✅ 完成 | reminder_at/before/types + recurrence_rule/end/parent_id + 3索引 |
| todoRepo CRUD | ✅ 完成 | findRecurrenceTemplates/hasInstanceForDate/createRecurrenceInstance/findPendingReminders/markReminderSent |
| **REST API 接受字段** | ❌ 缺失 | **gateway/src/routes/todos.ts 和 shared/lib/api/todos.ts 均不接受 reminder_*/recurrence_* 字段** |

### Section 5: 提醒调度 + 周期生成
| 场景 | 状态 | 说明 |
|------|------|------|
| F1 创建周期模板 | ✅ 后端 | todoRepo.create 支持所有字段 |
| F2 daily-cycle生成实例 | ✅ 完成 | daily-cycle.ts:133-165 matchesRecurrenceRule+创建实例 |
| F3 模板修改影响未来 | 🟡 部分 | 模板可修改，但已生成实例不自动同步 |
| F4 完成周期实例 | ✅ 完成 | 标记实例done=true，模板保持false |
| F5 停止周期 | 🟡 后端 | 可设recurrence_end，但无对应的voice command处理 |
| G1 提醒心跳检查 | ✅ 完成 | engine.ts 30min窗口+WebSocket推送+标记已发送 |
| G2 修改时间重算提醒 | ❌ 未实现 | 修改scheduled_start时不自动重算reminder_at |

### ⚠️ 关键阻断
**前端确认→API创建的全链路断裂**：
1. `app/page.tsx:208-214` handleCommandConfirm 只传 text/scheduled_start/estimated_minutes/priority
2. 漏传: goal_id(_matched_goal_id), reminder_at/before/types, recurrence_rule/end
3. `shared/lib/api/todos.ts:19-31` createTodo类型定义不含 reminder/recurrence 字段
4. `gateway/src/routes/todos.ts` POST/PATCH 路由不接受 reminder/recurrence 字段

**修复路径**: API层补字段 → 前端createTodo类型补字段 → handleCommandConfirm补传

## 概述

本 spec 定义语音路由中待办相关的扩展模型：AI 提取接口、确认弹窗交互、隐藏 Record 溯源、数据库扩展（提醒 + 周期 + 日历）、提醒调度。路由分流逻辑见 [voice-routing.md](voice-routing.md)。

---

## 1. 待办全能模式 — AI 提取接口

### AI 输入

```typescript
interface TodoModeInput {
  text: string;              // 用户转写文本
  dateAnchor: string;        // 时间锚点表（已有 buildDateAnchor()）
  pendingTodos: Array<{      // 当前未完成待办（用于 complete/modify 匹配）
    id: string;
    text: string;
    scheduled_start?: string;
  }>;
  activeGoals: Array<{       // 用户活跃目标/项目（用于 goal_hint 匹配）
    id: string;
    title: string;
  }>;
}
```

### AI 输出

```typescript
interface TodoModeOutput {
  commands: TodoCommand[];
}

interface TodoCommand {
  action_type: "create" | "complete" | "modify" | "query";
  confidence: number;        // 0-1

  // create 时必填
  todo?: ExtractedTodo;

  // complete/modify 时必填
  target_hint?: string;      // 匹配关键词
  target_id?: string;        // 如果能从 pendingTodos 直接匹配到

  // modify 时的变更
  changes?: Partial<ExtractedTodo>;

  // query 时的筛选条件
  query_params?: {
    date?: string;
    goal_id?: string;          // 按目标/项目筛选
    status?: "pending" | "done" | "all";
  };
}

interface ExtractedTodo {
  // 基础
  text: string;                              // 待办内容（动词开头，简洁）
  scheduled_start?: string;                  // ISO 时间
  scheduled_end?: string;                    // ISO 时间
  estimated_minutes?: number;                // 预估时长
  priority?: 1 | 2 | 3 | 4 | 5;            // 重要度（1最低 5最高）
  person?: string;                           // 相关人

  // 目标/项目关联（替代 domain）
  goal_hint?: string;                        // AI 从 activeGoals 列表中匹配的目标名称（原文）
                                             // 未匹配到则留空 → 归入收集箱（无目标关联）

  // 提醒（新增）
  reminder?: {
    enabled: boolean;
    before_minutes: number;                  // 默认 15
    types: ("notification" | "alarm" | "calendar")[];
  };

  // 周期（新增）
  recurrence?: {
    rule: string;                            // "daily" | "weekdays" | "weekly:1,3,5" | "monthly:15"
    end_date?: string;                       // ISO 日期，null=永不结束
  };
}

// 设计决策：彻底放弃 domain 固定分类
// - 未关联目标的待办归入"收集箱"（goal_id = NULL）
// - 待办统计分析需求交由 AI 按实际内容做一次性批量分析
// - 不再维护 domain 枚举（工作/学习/生活/健康/社交）
```

### 场景 C1: 创建单条待办（匹配到目标）
```
假设 (Given)  用户在待办页，活跃目标有 ["Q2产品发布", "供应链优化"]
当   (When)   用户说"明天下午3点开产品评审会"
那么 (Then)   AI 返回 commands: [{
                action_type: "create",
                confidence: 0.95,
                todo: {
                  text: "开产品评审会",
                  scheduled_start: "2026-04-05T15:00:00",
                  priority: 3,
                  goal_hint: "Q2产品发布"
                }
              }]
```

### 场景 C1b: 创建单条待办（无目标匹配 → 收集箱）
```
假设 (Given)  用户在待办页
当   (When)   用户说"买牛奶"
那么 (Then)   AI 返回 commands: [{
                action_type: "create",
                confidence: 0.95,
                todo: {
                  text: "买牛奶",
                  goal_hint: null
                }
              }]
并且 (And)    创建后 todo.goal_id = NULL（归入收集箱）
```

### 场景 C2: 创建待办 + 提醒
```
假设 (Given)  用户在待办页
当   (When)   用户说"明天下午3点开会，提前半小时提醒我"
那么 (Then)   AI 返回 todo 中包含 reminder: {
                enabled: true,
                before_minutes: 30,
                types: ["notification"]
              }
```

### 场景 C3: 创建周期任务
```
假设 (Given)  用户在待办页
当   (When)   用户说"每天早上8点提醒我锻炼"
那么 (Then)   AI 返回 todo 中包含：
              scheduled_start: "2026-04-04T08:00:00"
              recurrence: { rule: "daily", end_date: null }
              reminder: { enabled: true, before_minutes: 15, types: ["alarm"] }
```

### 场景 C4: 创建多条待办
```
假设 (Given)  用户在待办页
当   (When)   用户说"明天3点开会，周五前交报告"
那么 (Then)   AI 返回 commands 数组包含 2 个 create 类型
```

### 场景 C5: 完成待办
```
假设 (Given)  用户在待办页，有未完成待办"开会"
当   (When)   用户说"开会搞定了"
那么 (Then)   AI 返回 commands: [{
                action_type: "complete",
                confidence: 0.9,
                target_hint: "开会"
              }]
```

### 场景 C6: 修改待办
```
假设 (Given)  用户在待办页，有未完成待办"明天下午开会"
当   (When)   用户说"把开会改到后天"
那么 (Then)   AI 返回 commands: [{
                action_type: "modify",
                target_hint: "开会",
                changes: { scheduled_start: "2026-04-06T15:00:00" }
              }]
```

### 场景 C7: 查询待办
```
假设 (Given)  用户在待办页
当   (When)   用户说"明天有什么安排"
那么 (Then)   AI 返回 commands: [{
                action_type: "query",
                query_params: { date: "2026-04-05", status: "all" }
              }]
并且 (And)    后端查询并返回匹配的待办列表
并且 (And)    前端在 CommandSheet 中展示查询结果（见 场景 D8）
```

### 场景 C7b: 按目标查询
```
假设 (Given)  用户在待办页，有目标"Q2产品发布"
当   (When)   用户说"产品发布还有哪些没做"
那么 (Then)   AI 返回 commands: [{
                action_type: "query",
                query_params: { goal_id: "<matched_goal_id>", status: "pending" }
              }]
```

---

## 2. 确认弹窗交互

### 场景 D1: 弹窗即时弹出（零等待）
```
假设 (Given)  用户录音完成，ASR 返回转写文本
当   (When)   前端收到 asr.done 消息
那么 (Then)   立即弹出 CommandSheet（不等待 AI 返回）
并且 (And)    弹窗顶部显示用户转写文本
并且 (And)    弹窗中部显示 loading 动画（"正在识别..."）
并且 (And)    AI 结果返回后，loading 替换为结构化卡片（渐入动画）
```

### 场景 D2: 待办确认弹窗（Layer 1）
```
假设 (Given)  AI 返回 1 个 create 类型待办
当   (When)   前端收到结构化结果
那么 (Then)   弹窗展示待办卡片：
              - 📋 待办内容（text）
              - 🎯 关联目标（goal_hint，有则显示目标名，可点击切换）
              - 🕐 时间（scheduled_start，可点击修改）
              - 🔔 提醒（reminder，可点击修改）
              - ⭐ 优先级（priority，可点击修改）
              - 🔄 周期（recurrence，有则显示）
并且 (And)    底部操作栏：[ 确认 ✓ ] [ 取消 ]
并且 (And)    底部保留 🎙 继续说话修改 按钮
```

### 场景 D3: 多条指令确认
```
假设 (Given)  AI 返回 2+ 个 commands
当   (When)   前端展示确认弹窗
那么 (Then)   每条指令一张卡片，纵向排列
并且 (And)    每张卡片右上角有独立的 ✓ 和 ✕ 按钮
并且 (And)    底部 [ 全部确认 ] [ 全部取消 ]
```

### 场景 D4: 继续说话修改
```
假设 (Given)  确认弹窗已展示识别结果
当   (When)   用户点击 🎙 继续说话，说"改成4点，优先级高"
那么 (Then)   将当前待办 JSON + 用户修改指令发送给 AI（fast 模型）
并且 (And)    AI 返回更新后的 JSON
并且 (And)    弹窗原地刷新展示更新后的字段（变化字段高亮闪烁）
```

### 场景 D5: 字段可点击直接修改
```
假设 (Given)  确认弹窗已展示待办卡片
当   (When)   用户点击"🕐 明天 15:00"
那么 (Then)   弹出日期时间选择器（复用已有的 showPicker）
当   (When)   用户选择新时间
那么 (Then)   字段原地更新，不需要 AI 调用
```

### 场景 D6: Agent 模式弹窗（Layer 2）
```
假设 (Given)  用户上滑松手进入 Agent 模式
当   (When)   后端开始执行工具链
那么 (Then)   弹窗实时展示工具执行状态：
              "🔍 正在搜索..."
              "📝 正在创建待办..."
              "✅ 已创建：明天下午开会"
并且 (And)    状态通过 WebSocket tool.status 消息流式推送
并且 (And)    执行完成后显示结果摘要 + [ 确认 ] [ 撤销 ]
```

### 场景 D8: 查询结果弹窗展示
```
假设 (Given)  AI 返回 action_type="query"，后端查询到 3 条待办
当   (When)   前端在 CommandSheet 中展示结果
那么 (Then)   弹窗展示查询结果列表（最多 5 条）：
              ┌─────────────────────────────────┐
              │  🔍 明天的安排（3项）             │
              │                                 │
              │  ☐ 15:00 开会          ⭐⭐⭐    │
              │  ☐ 17:00 交报告        ⭐⭐⭐⭐   │
              │  ☐ 晚上 健身           ⭐⭐      │
              │                                 │
              │        [ 知道了 ]  [ 查看更多 ]  │
              │  🎙 继续说话…                    │
              └─────────────────────────────────┘
并且 (And)    列表中每条可点击 → 展开为待办详情卡片（可直接修改）
并且 (And)    用户可继续说话追加操作（"把开会改到4点"）→ 弹窗内原地处理
```

### 场景 D8b: 查询结果 — 查看更多跳转
```
假设 (Given)  查询结果超过 5 条，或用户点击 [查看更多]
当   (When)   查询条件是日期筛选（如"明天"）
那么 (Then)   关闭弹窗 → 待办页跳转/滚动到对应日期视图
当   (When)   查询条件是目标筛选（如"产品发布的待办"）
那么 (Then)   关闭弹窗 → 跳转到该目标/项目详情页
```

### 场景 D9: 设置中关闭确认弹窗
```
假设 (Given)  用户在设置中关闭了"执行前确认"
当   (When)   Layer 1/2/3 产生待执行的动作
那么 (Then)   跳过确认弹窗，后台静默执行
并且 (And)    执行完成后底部弹出 toast 通知："已创建：开会 · 明天15:00 [撤销]"
并且 (And)    toast 保留 [撤销] 按钮（5 秒内可撤销）
```

### 场景 D10: 撤销已执行操作
```
假设 (Given)  系统静默执行了一条指令（确认关闭状态）
当   (When)   用户在 5 秒内点击 toast 的 [撤销]
那么 (Then)   撤销刚执行的操作（删除待办 / 恢复修改 / 恢复完成状态）
并且 (And)    toast 更新为"已撤销"
```

---

## 3. 隐藏 Record 溯源

### 场景 E1: 待办页语音创建隐藏 record
```
假设 (Given)  用户在待办页录音
当   (When)   后端进入 Layer 1 处理
那么 (Then)   创建 record：source="todo_voice", status="completed"
并且 (And)    todo.record_id 指向此 record
并且 (And)    日记列表查询时过滤 source IN ('todo_voice', 'command_voice')
```

### 场景 E2: 指令模式创建隐藏 record
```
假设 (Given)  用户上滑松手进入 Agent 模式
当   (When)   后端进入 Layer 2 处理
那么 (Then)   创建 record：source="command_voice", status="completed"
```

### 场景 E3: 待办详情可查看原文
```
假设 (Given)  用户查看某个待办的详情
当   (When)   该待办关联了 todo_voice 类型的 record
那么 (Then)   详情页显示"查看原文"入口
并且 (And)    点击展开原始转写文本
```

### 接口约定

```sql
-- record.source 新增枚举值
-- 已有: 'voice', 'text', 'import', 'chat_tool'
-- 新增: 'todo_voice', 'command_voice'

-- 日记列表查询修改
-- 原: SELECT * FROM record WHERE device_id = $1
-- 改: SELECT * FROM record WHERE device_id = $1 AND source NOT IN ('todo_voice', 'command_voice')
```

---

## 4. 数据库扩展 — 提醒 + 周期 + 日历

### Migration: xxx_todo_reminder_recurrence.sql

```sql
-- domain 字段废弃（不删列，停止写入，查询忽略）
-- 原 domain CHECK 约束保留兼容，不新增值
-- 待办分类改为通过 goal_id 关联目标/项目，无关联 = 收集箱

-- 提醒字段
ALTER TABLE todo ADD COLUMN reminder_at        TIMESTAMPTZ;
ALTER TABLE todo ADD COLUMN reminder_before     INT;          -- 提前分钟数
ALTER TABLE todo ADD COLUMN reminder_types      TEXT[];        -- {'notification','alarm','calendar'}

-- 周期字段
ALTER TABLE todo ADD COLUMN recurrence_rule     TEXT;          -- 'daily'|'weekdays'|'weekly:1,3,5'|'monthly:15'
ALTER TABLE todo ADD COLUMN recurrence_end      DATE;
ALTER TABLE todo ADD COLUMN recurrence_parent_id UUID REFERENCES todo(id) ON DELETE SET NULL;

-- 日历同步字段
ALTER TABLE todo ADD COLUMN calendar_event_id   TEXT;
ALTER TABLE todo ADD COLUMN calendar_synced_at  TIMESTAMPTZ;

-- 索引
CREATE INDEX idx_todo_reminder_at ON todo(reminder_at) WHERE reminder_at IS NOT NULL AND done = false;
CREATE INDEX idx_todo_recurrence_parent ON todo(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;
```

### 周期任务模型（模板+实例）

```
recurrence_parent（模板）
  recurrence_rule = "daily"
  scheduled_start = T08:00:00（仅时间部分有意义）
  done = false（模板永远不完成）
  │
  ├─ 实例 2026-04-04（recurrence_parent_id → 模板.id）
  │   scheduled_start = 2026-04-04T08:00:00
  │   done = true ✓
  │
  ├─ 实例 2026-04-05
  │   scheduled_start = 2026-04-05T08:00:00
  │   done = false（当前）
  │
  └─ ...（按需在 daily-cycle 中生成，不预创建）
```

### 场景 F1: 创建周期任务
```
假设 (Given)  用户说"每天早上8点锻炼"
当   (When)   确认创建后
那么 (Then)   创建一条模板 todo：recurrence_rule="daily", scheduled_start=T08:00:00
并且 (And)    立即创建今日实例：recurrence_parent_id=模板.id, scheduled_start=今天T08:00:00
并且 (And)    模板的 done 字段永远为 false
```

### 场景 F2: daily-cycle 生成周期实例
```
假设 (Given)  每日 3:00 daily-cycle 运行
当   (When)   扫描所有 recurrence_parent_id IS NULL 且 recurrence_rule IS NOT NULL 的模板
那么 (Then)   对每个模板检查今天是否命中 recurrence_rule
并且 (And)    命中且今日实例不存在 → 创建实例
并且 (And)    实例继承模板的 text, priority, domain, reminder_before, reminder_types
并且 (And)    实例的 scheduled_start = 今天日期 + 模板的时间部分
并且 (And)    实例的 reminder_at = scheduled_start - reminder_before 分钟
```

### 场景 F3: 修改周期模板影响未来实例
```
假设 (Given)  用户修改了周期模板（如把"8点锻炼"改成"9点锻炼"）
当   (When)   保存修改
那么 (Then)   更新模板的 scheduled_start 时间
并且 (And)    今日实例如果未完成 → 同步更新
并且 (And)    过去已完成的实例 → 不修改
并且 (And)    未来实例在 daily-cycle 生成时自动使用新模板
```

### 场景 F4: 完成周期实例
```
假设 (Given)  用户在待办页说"锻炼搞定了"
当   (When)   匹配到今日的周期实例
那么 (Then)   标记该实例 done=true
并且 (And)    模板的 done 保持 false
并且 (And)    明天的实例在 daily-cycle 中照常生成
```

### 场景 F5: 停止周期任务
```
假设 (Given)  用户在待办页说"以后不用提醒我锻炼了"
当   (When)   匹配到周期模板
那么 (Then)   设置模板 recurrence_end = 今天
并且 (And)    今日之后不再生成新实例
并且 (And)    模板保留（历史记录可查）
```

---

## 5. 提醒调度

### 场景 G1: ProactiveEngine 心跳检查提醒
```
假设 (Given)  ProactiveEngine 每 30 分钟心跳
当   (When)   扫描到 reminder_at 在 [now, now+30min] 窗口内的待办
那么 (Then)   根据 reminder_types 分别处理：
              - "notification" → WebSocket 推送 proactive.todo_reminder 消息
              - "alarm" → 推送 proactive.alarm_trigger 消息（前端调用 Capacitor LocalNotification）
              - "calendar" → 预留（v2 实现日历同步）
并且 (And)    标记 reminder 已发送（避免重复推送）
```

### 场景 G2: 修改时间自动重算提醒
```
假设 (Given)  用户修改了待办的 scheduled_start
当   (When)   该待办有 reminder_before 设置
那么 (Then)   自动重算 reminder_at = 新 scheduled_start - reminder_before 分钟
```

### 接口约定

```typescript
// 新增 WebSocket 消息类型
interface TodoReminderMessage {
  type: "proactive.todo_reminder";
  payload: {
    todo_id: string;
    text: string;
    scheduled_start: string;
    reminder_types: string[];   // 前端据此决定触发通知/闹钟/日历
  };
}
```

---

## recurrence_rule 规则表（v1 支持范围）

| 用户说 | rule 值 | 含义 |
|--------|---------|------|
| "每天" | `daily` | 每天 |
| "工作日" | `weekdays` | 周一到周五 |
| "每周三" | `weekly:3` | 每周三 |
| "每周一三五" | `weekly:1,3,5` | 每周一三五 |
| "每月15号" | `monthly:15` | 每月15日 |
| "每周末" | `weekly:6,0` | 每周六日 |

复杂规则（每隔两天、每月最后一个工作日等）→ v2 支持。

## 边界条件

- [x] 周期任务模板被删除 → 已生成的实例保留（recurrence_parent_id 设为 NULL via ON DELETE SET NULL）— DB FK配置
- [x] 提醒时间已过（reminder_at < now）→ 跳过，不补发 — engine.ts窗口查询自然跳过
- [ ] 同一待办多次修改时间 → reminder_at 每次自动重算 — **未实现：修改时间不重算reminder_at**

## 关键文件变更

| 文件 | 变更 | 状态 |
|------|------|------|
| **工具 & DB** | | |
| `gateway/src/handlers/todo-extract-prompt.ts` | Layer 1 待办全能模式 AI prompt（注入 activeGoals） | ✅ 已完成 |
| `gateway/src/tools/definitions/create-todo.ts` | 支持 reminder / recurrence / goal_hint 字段 | ✅ 已完成 |
| `gateway/src/db/repositories/todo.ts` | 新增 reminder/recurrence CRUD；废弃 domain 写入 | ✅ 已完成 |
| `gateway/src/routes/todos.ts` | **API 支持 reminder/recurrence 字段** | ❌ **未接受这些字段** |
| `supabase/migrations/048_todo_reminder_recurrence.sql` | DB schema 变更（reminder + recurrence） | ✅ 已完成 |
| **调度** | | |
| `gateway/src/proactive/engine.ts` | reminder 心跳检查（30min 窗口） | ✅ 已完成 |
| `gateway/src/cognitive/daily-cycle.ts` | generateRecurringInstances()（每日 3:00） | ✅ 已完成 |
| **前端弹窗** | | |
| `features/todos/components/command-sheet.tsx` | 统一确认弹窗（待办卡片 + 查询列表 + Agent 状态） | ✅ 组件完成，**确认执行丢字段** |
| `app/page.tsx` handleCommandConfirm | 确认后调用REST API创建/修改/完成 | 🟡 **只传4个字段，缺goal_id/reminder/recurrence** |
| `shared/lib/api/todos.ts` createTodo类型 | 前端API类型定义 | 🟡 **缺reminder/recurrence字段** |

## 依赖

- voice-routing.md — 路由分流逻辑
- ProactiveEngine（已完成）— 心跳调度复用
- daily-cycle（已完成）— 周期实例生成挂载点
- Capacitor LocalNotification plugin（v2）— alarm 类型提醒
- Capacitor Calendar plugin（v2）— 日历同步

## 备注

- **domain 废弃**：不删列、不删 CHECK 约束，仅停止写入。已有数据保留。待办分类全面转向 goal_id 关联
- **收集箱**：goal_id = NULL 的待办视为"收集箱"，前端待办列表单独分组展示
- Digest 短文本阈值（voice-routing.md Part 3 的 N 字）待用户提供真实日记数据后 A/B 测试确定
- 用户偏好学习（v2）：记录用户在确认弹窗中的修改行为，后续用于自动填充默认值
- 日历同步（v2）：calendar_event_id / calendar_synced_at 字段已预埋，实现延后
- confirm_before_execute 默认 true，前 10 次强制 true 的逻辑延后到 v2
- 待办统计分析（如需按"工作/生活"维度统计）：一次性交由 AI 批量分析，不依赖 domain 字段

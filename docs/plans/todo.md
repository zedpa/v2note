# v2note 4/1 公测前 & 后续 TODO

## 已完成（2026-03-29）

### 设备注册防重
- [x] 前端 `shared/lib/device.ts`：`pendingPromise` 并发锁
- [x] 后端 `device.ts`：`findOrCreate()` 原子操作 + `isNew` 标记
- [x] 后端 `devices.ts`：仅 `isNew=true` 时创建欢迎日记

### Record 删除外键修复
- [x] Migration `030_strike_source_cascade.sql`：`strike.source_id` 改 `ON DELETE SET NULL`

### Strike 去重机制
- [x] `record.ts`：`claimForDigest()` 原子抢占 + `unclaimDigest()` 失败回滚
- [x] `strike.ts`：`existsBySourceAndNucleus()` 写入前查重
- [x] `digest.ts`：集成两层去重

### 日记列表性能优化
- [x] `app/page.tsx`：Tab 保持挂载（CSS hidden），切换不重载
- [x] `routes/records.ts`：N+1 查询改 3 次批量查询（summary + transcript + tag）
- [x] `tag.ts`：新增 `findByRecordIds()` 批量方法
- [x] `use-notes.ts`：缓存优先显示 + 后台静默刷新

### 工具调用链路修复
- [x] `registry.ts`：`parameters` → `inputSchema`（AI SDK v6 字段名变更）
- [x] `provider.ts`：手动 tool call 循环（绕过 DashScope maxSteps 不自动继续的问题）
- [x] `provider.ts`：`fullStream` 事件驱动（tool-input-start/delta 手动拼接参数）

### 工具调用 UI 反馈
- [x] `provider.ts`：工具状态用 `\x00TOOL_STATUS:` 特殊标记
- [x] `index.ts`：拦截标记，发独立 `tool.status` 消息类型
- [x] `use-chat.ts`：`tool.status` → 临时 `tool-status` 角色消息，`chat.done` 时自动移除
- [x] `chat-bubble.tsx`：工具状态渲染为 loading 卡片（脉冲动画 + 文字提示）

### 记忆上限防爆
- [x] `memory.ts`：`countByUser()` + `evictLeastImportant()` 方法
- [x] `manager.ts`：`MAX_MEMORIES_PER_USER = 500`，ADD 时检查上限，超出淘汰最低重要性

### Gene 文档更新
- [x] `cognitive-engine.md`：v2 两级架构 + Strike 去重机制
- [x] `ai-processing.md`：v2 处理链路时序
- [x] `builtin-tools.md`：AI SDK v6 原生工具调用 + 已注册工具列表
- [x] `timeline-card.md`：性能优化（Tab 挂载 + 批量查询 + 缓存优先）
- [x] `auth.md`：设备注册防重
- [x] `multiselect-delete.md`：外键约束修复

---

## 报告生成链路修复（P0 — 2026-03-29 诊断）

> 影响：每日回顾、今日简报、复盘三条链路，用户反馈"经常报错"

### BUG-1: AI JSON 解析无保护 🔴
- **现象**: 简报/回顾生成失败，直接走 fallback 空数据
- **根因**: DashScope qwen3 系列经常在 JSON 外包裹 ` ```json ``` ` 或输出思考过程文本，`JSON.parse()` 直接抛异常
- **位置**: `gateway/src/handlers/daily-loop.ts:257, 560`
- **修复**: 添加 `cleanJsonResponse()` 工具函数，strip markdown 代码块 + 思考文本后再 parse
- [x] 实施修复 → `text-utils.ts:safeParseJson()` + `daily-loop.ts:257,560`

### BUG-2: Streak 计算 N+1 查询 🔴
- **现象**: 简报生成耗时 5-15 秒，容易触发前端/网关超时
- **根因**: `daily-loop.ts:157-168` 循环最多 30 次，每次一个 `countByDateRange` DB 查询
- **位置**: `gateway/src/handlers/daily-loop.ts:155-168`
- **修复**: 改为单条 SQL `SELECT DISTINCT DATE(created_at) ... ORDER BY date DESC LIMIT 30`，一次查出近 30 天有记录的日期，代码数连续天数
- [x] 实施修复 → `todo.ts:getStreak()` + `daily-loop.ts:155`

### BUG-3: action_tracking 查询用过时 JOIN 模式 🔴
- **现象**: 手动创建的 todo（record_id=NULL）被静默排除，跳过提醒和结果追踪不完整
- **根因**: `getSkipAlerts()` / `getResultTrackingPrompts()` / `getActionStats()` 全部 `JOIN record r ON r.id = t.record_id`，但 migration 033 已允许 `record_id = NULL`
- **位置**: `gateway/src/cognitive/action-tracking.ts:29, 50, 67, 82, 122, 169`
- **修复**: 改用 `todo.user_id` / `todo.device_id` 直接过滤（migration 034 已添加这两列），移除 `JOIN record`
- [x] 实施修复 → 签名改为 `opts: { userId?, deviceId? }`，`ownerWhere()` 动态条件

### BUG-4: userId 降级 deviceId 导致认知查询全空 🟡
- **现象**: 无登录用户的设备，每日回顾中认知收获/目标进度/矛盾提醒永远为空
- **根因**: `const uid = userId ?? deviceId;` 然后传入 `WHERE user_id = $1`，deviceId 无法匹配 user_id
- **位置**: `gateway/src/handlers/daily-loop.ts:113, 390, 458, 484`
- **修复**: 无 userId 时用 `device_id` 字段查询（走 `ByDevice` 系列方法），同时为 `generateCognitiveReport()` / `generateAlerts()` 增加 `ByDevice` 变体
- [x] 实施修复 → `report.ts` / `alerts.ts` 改为 `opts: { userId?, deviceId? }`, daily-loop 传正确参数

### BUG-5: Goal 查询 N+1 🟡
- **现象**: 有多个目标时简报生成变慢（每目标额外 1 次 DB 查询）
- **根因**: `for (const g of activeGoals) { await goalRepo.findWithTodos(g.id) }` 逐个查
- **位置**: `gateway/src/handlers/daily-loop.ts:120, 465`
- **修复**: 批量查询 `SELECT * FROM todo WHERE parent_id = ANY($1) AND level = 0`，一次拿回所有目标的子任务
- [x] 实施修复 → `goal.ts:findTodosByGoalIds()` + daily-loop 晨间/晚间两处替换

### BUG-6: reviews/generate 路由无错误处理 🟡
- **现象**: 复盘生成 AI 调用失败时返回裸 500 错误，无友好提示
- **根因**: 路由 handler 无 try-catch，依赖 Router 全局 catch（错误信息暴露内部细节）
- **位置**: `gateway/src/routes/reviews.ts:18-63`
- **修复**: 添加 try-catch + 友好错误消息 + AI 失败 fallback
- [x] 实施修复 → AI 失败返回基本统计 fallback + 外层 catch 返回友好消息

---

## 多模型分层 + 全链路修复（P0 — 2026-03-30 完成）

### 已完成

#### 多模型分层架构（88s → 15.7s，5.6x 提速）

- [x] **`provider.ts` 重写为 6 层模型架构**
  - `fast`（管道提取）→ qwen-plus，无推理，60s 超时
  - `agent`（聊天工具调用 + 简单对话）→ qwen-plus，无推理，120s 超时
  - `chat`（复杂分析对话）→ qwen3.5-plus，推理开启，180s 超时
  - `report`（简报/复盘）→ qwen3.5-plus，推理开启，180s 超时
  - `background`（记忆/画像）→ qwen3-max，推理关闭，60s 超时
  - `vision`（图片理解）→ qwen-vl-max，60s 超时
- [x] **推理模型 thinking 控制** — `buildProviderOptions()` 通过 `enable_thinking: false` 关闭推理
  - qwen3.x 推理模型：thinking 占 96-99% tokens，30-60s/调用
  - 关闭推理后：<2s/调用，适合管道提取场景
- [x] **22 个调用点迁移至分层 tier**
  - fast: process, voice-action, digest, todo-projector, time-estimator
  - report: daily-loop, reflect, reviews, action-panel, batch-analyze, emergence, vocabulary
  - background: memory, soul, profile, diary, person-profile, todo-handler
- [x] **环境变量配置** — `.env` 新增 `AI_MODEL_FAST/CHAT/REPORT/BACKGROUND/VISION`

#### Bug 修复

- [x] **todo.updated_at 列缺失（PG 42703）** — Migration `040_todo_updated_at.sql`
  - 根因：goalRepo 适配层引用 `todo.updated_at`，但该列从未创建
  - 影响：intend Strike 投影为 goal 时 DB 报错，静默 catch，goal 级待办无法创建
- [x] **E2E 测试 Digest 超时假阳性** — 测试文本被 VoiceAction 拦截为 action，跳过 Digest
  - 修复：测试改用日记型文本触发完整 Digest 管道
- [x] **待办创建后列表不显示** — `voice-action.ts` / `todo-projector.ts` 创建 todo 时缺少 `user_id`/`device_id`
  - 根因：`findByUser`/`findByDevice` 查询依赖 `todo.user_id`/`todo.device_id`，未填写则查不到
  - 修复：两处 `todoRepo.create()` 均传入 ownership 字段 + Migration `041_backfill_todo_ownership.sql` 回填历史数据
- [x] **Digest FK 约束违反（strike_user_id_fkey）** — `digest.ts` userId 降级为 deviceId 后写入 strike 表失败
  - 根因：`strike.user_id` 外键引用 `app_user(id)`，deviceId 不是合法 userId
  - 修复：`digestRecords()` 增加 userId 查找链（record.user_id → device.user_id → skip）
- [x] **ASR 初始音频丢失** — Python 进程 spawn 前的音频 chunk 被静默丢弃
  - 根因：`startASR` await `getVocabularyIdForDevice()` 期间 `pythonProcess=null`，chunk 不写入 stdin
  - 修复：chunk 先累积到 buffer，Python spawn 后立即 flush 全部缓冲 chunk
- [x] **工具调用消息格式修复（AI SDK v6 schema 不匹配）** — 工具虽执行但结果无法回传给模型
  - 根因1：assistant tool-call 内容用 `args` 字段，AI SDK v6 要求 `input` → OpenAI provider `JSON.stringify(part.input)` 得到 `undefined`
  - 根因2：tool result 内容用 `result: string`，AI SDK v6 要求 `output: { type: "text", value: string }`
  - 修复：`provider.ts` 两处字段名修正，工具调用 2-step 流程完全打通
- [x] **fullStream 事件字段兼容** — `tool-input-start` 的 `id` vs `toolCallId`、`tool-input-delta` 的 `delta` vs `inputTextDelta`
  - 修复：所有事件字段改为 fallback 模式 `p.toolCallId ?? p.id`、`p.inputTextDelta ?? p.delta`
- [x] **聊天复杂度路由** — 简单指令走 agent 层（qwen-plus），复杂分析走 chat 层（qwen3.5-plus 推理）
  - `chat.ts`：关键词分类器（COMPLEX_PATTERNS / SIMPLE_PATTERNS），无额外 AI 调用
  - review/insight/decision 模式强制 chat 层，command 模式按消息分类

### 实测数据对比

| 环节 | 修复前（qwen3.5-plus 推理） | 修复后（多模型分层） | 提速 |
|------|---------------------------|---------------------|------|
| Record 创建 | 205ms | 230ms | — |
| Process | **30,900ms** | **2,092ms** | **15x** |
| Digest（Strike 分解）| **57,109ms**（或失败） | **13,110ms** | **4x** |
| Todo 投影 | 失败（updated_at 缺失）| **90ms** | **修复** |
| **总计** | **88,364ms** | **15,704ms** | **5.6x** |

### Digest 仍偏慢（13s）的分析

Digest 使用 fast 层（qwen-plus），但 13s 仍然偏慢。可能原因：
- DashScope qwen-plus 冷启动/排队延迟
- prompt 较长（digest-prompt 含完整 Strike 分解指令）
- 可选优化：合并 Process + Digest 为单次调用

---

## 数据库 Schema 清理 + Embedding 持久化（P0 — 2026-03-30 完成）

> Spec: `specs/042-schema-cleanup-and-embedding.md`

### Schema 修复（Migration 042）
- [x] **strike.embedding 列创建** — `vector(1024)` + HNSW 索引（修复语义匹配全部静默失败）
- [x] **todo_embedding / goal_embedding 表创建** — 独立 embedding 表 + HNSW 索引 + RLS
- [x] **device_id TEXT → UUID** — `pending_intent` / `agent_plan` 类型与 `device(id)` 统一
- [x] **goal 表 → VIEW** — `DROP TABLE goal` → `CREATE VIEW goal AS SELECT FROM todo WHERE level >= 1`
- [x] **废弃表删除** — DROP `weekly_review`、`customer_request`、`setting_change`
- [x] **domain CHECK 约束** — 中文域值（工作/学习/创业/家庭/健康/生活/社交）+ NULL 允许
- [x] **复合索引补全** — `idx_strike_user_created`、`idx_todo_user_done_level`、`idx_todo_device_done_level`

### Embedding 持久化链路
- [x] **`embed-writer.ts` 新建** — `writeStrikeEmbedding()` / `writeTodoEmbedding()` / `backfillStrikeEmbeddings()`
- [x] **fire-and-forget 异步模式** — `void writeStrikeEmbedding(id, text)`，不阻塞主链路
- [x] **12 个写入点接入** — digest、batch-analyze、emergence、top-level、todo-projector、swipe-tracker、topics、create-todo
- [x] **todo_embedding 按 level 路由** — level >= 1 → goal_embedding, level 0 → todo_embedding
- [x] **retrieval.ts 重写** — O(N) API 调用 → pgvector SQL 查询（单次 getEmbedding + DB 索引检索）

### 配套代码清理
- [x] **link-device.ts** — 移除 `"goal"`（VIEW）和 `"weekly_review"`（已 DROP），添加 `"todo"`
- [x] **time-estimator.ts** — domain 英文 → 中文（work → 工作）
- [x] **死代码删除** — `customer-request.ts`、`setting-change.ts`、`repositories/index.ts` 清理
- [x] **process.ts / process-prompt.ts** — 移除 `customer_requests` / `setting_changes` 字段

### batch-analyze 超时修复
- [x] **根因定位** — `tier: "report"`（qwen3.5-plus 推理）处理 >6 strikes 时超时（thinking tokens 占 96%+）
- [x] **修复** — `batch-analyze.ts` tier 改为 `"fast"`（qwen-plus 无推理），30 strikes 6s 完成，6 个质量 cluster

### E2E 核心链路测试
- [x] **`e2e/core-pipeline.spec.ts`** — 15 个串行测试覆盖完整链路
  - 设备注册 → 用户注册 → flomo HTML 批量导入 → digest 等待 → strikes 验证
  - embedding 验证 → todo 提取 → tags → batch-analyze 聚类 → 认知统计 → 目标/意图
- [x] **实测结果** — 9 records, 34 Strikes（全部带 embedding）, 35 Bonds, 6 Clusters, 12 Todos, 10 Goals

---

## 4/1 上线前（P0）

### Agent 交互能力补全
- [ ] 新增工具：`update_settings` — 修改用户设置（通知时间、ASR 模式等）
- [ ] 新增工具：`schedule_todo` — 批量排期（AI 根据优先级自动分配时间段）
- [ ] 新增工具：`create_project_plan` — 创建项目 + 自动拆解为目标/子任务路径
- [ ] 新增工具：`query_todos` — 查询待办列表（按状态/日期/目标筛选）
- [ ] 新增工具：`query_goals` — 查询目标进度（含子任务完成率）
- [x] 确认所有现有工具 execute 参数正确传入（inputSchema + args→input + result→output 修复，端到端验证通过）

### 录音处理进一步优化
- [ ] 合并 Process + Digest 为单次 AI 调用（消除串行 2 次调用，预期 15s → 5-8s）
- [ ] VoiceAction 分类完全改为规则（消除 `classifyVoiceIntent` AI 调用）

### 数据完整性
- [x] 执行 Migration `042_schema_cleanup.sql`（embedding 列 + 表清理 + domain 约束 + 索引）
- [ ] 执行 Migration `029_cognitive_snapshot.sql`（cognitive_snapshot 表）
- [ ] 执行 Migration `030_strike_source_cascade.sql`（strike 外键修复）
- [x] 端到端测试：录音 → Process → Digest → Strike → Todo 投影（E2E 通过）
- [x] E2E 核心链路测试：批量导入 → 聚类 → 语义匹配 → 目标提取（15/15 通过）
- [x] Migration `040_todo_updated_at.sql`（goalRepo 适配层依赖）
- [x] Migration `041_backfill_todo_ownership.sql`（回填历史孤儿 todo）

### 前端体验
- [x] **FAB 胶囊通知系统** — 移除 Sonner toast，全部通知通过 FAB 变形胶囊展示（success/error/info 三色）
  - `shared/lib/fab-notify.ts`：轻量事件总线，23+ 文件迁移
  - `features/recording/components/fab.tsx`：idle 态渲染通知胶囊，2s 自动消失
- [x] **待办时区修复** — 创建/编辑/显示/过滤全链路统一本地时区
  - 根因：`scheduled_start` 构建不带时区，Supabase `timestamptz` 当作 UTC 存储，读回本地 +8h 偏移
  - `time-slots.ts`：新增 `localTzOffset()` 工具函数
  - `todo-create-sheet.tsx` / `todo-edit-sheet.tsx` / `todo-detail-sheet.tsx`：保存时附带 `+08:00`
  - `todo-edit-sheet.tsx` / `todo-detail-sheet.tsx`：读取时用 `getFullYear/getMonth/getDate` 取本地日期（替代 `toISOString().split("T")[0]`）
  - `todo-grouping.ts`：`filterByDate()` 用 `new Date()` 取本地日期
  - `use-today-todos.ts`：今天日期和待办日期均用本地时间计算
- [x] **时间视图添加按钮修复** — 时间块有待办时仍显示 `+` 按钮（原来只在空时段显示）
  - `time-block.tsx`：非空时段在任务列表底部追加圆形 `+` 按钮
- [ ] 工具执行结果 Toast 反馈（"已创建待办：xxx"、"已更新时间：xxx"）
- [ ] 首屏加载优化：skeleton screen 替代 loading spinner

### 录音链路可靠性
- [x] ASR 初始 chunk 缓冲 + Python spawn 后 flush（修复首段音频丢失）
- [x] Digest userId 查找链（record → device → skip，修复 FK 违反）
- [x] 前端录音→日记生成验证 — 修复 Python ASR 缺失 `dashscope` 依赖 + 端到端验证通过
- [ ] ASR session 竞态：用户快速重录时 close 事件可能被忽略（需验证修复效果）

### 代码清理
- [ ] 移除 `batch-analyze.ts` 调试日志（AI raw response / Parsed / cluster skip 的 console.log）
- [ ] 移除 E2E 测试中的 DEBUG 日志

---

## Beta 后（P1 — 4月中旬）

### 并发基础设施
- [ ] **AI 调用队列** — `provider.ts` 加 p-limit 信号量（max=20），避免 DashScope 429
- [ ] **DB 连接池扩容** — `pool.ts` max 10→30，idleTimeoutMillis 30s→10s

### 记忆系统
- [ ] 记忆合并任务：每周扫描语义相似记忆，合并低重要性条目
- [ ] 所有记忆类型加 TTL（180 天默认，核心目标类不过期）
- [ ] 记忆检索加速：向量数据库（Pinecone/Weaviate）替代内存 embedding cache
- [ ] 去重扩展：对比范围从 top-5 → top-20 similar memories

### 工具调用进阶
- [ ] 工具执行结果 UI 卡片（待办卡片、目标卡片、项目看板缩略图）
- [ ] confirm 类工具的用户确认流程（底部弹窗："确定删除这条记录？"）
- [ ] 工具调用链：AI 自动规划多步操作（"创建项目 → 拆解目标 → 排期"一气呵成）

### 认知引擎
- [x] Tier2 端到端验证（真实数据 batch-analyze 效果）— 8 条 flomo 笔记 → 6 个质量 cluster
- [ ] 认知报告 UI（每周/月维度的认知变化可视化）
- [ ] cluster 演化追踪（增长/萎缩/分裂/合并时间线）

### DB 优化
- [ ] **Strike 批量写入** — `createBatch(strikes[])` + `ON CONFLICT DO NOTHING`
- [x] **Embedding 持久化** — strike.embedding + todo_embedding + goal_embedding（pgvector HNSW）
- [x] **retrieval.ts pgvector 切换** — O(N) API → O(logN) 索引查询
- [x] **索引补全** — `idx_strike_user_created`、`idx_todo_user_done_level`、`idx_todo_device_done_level`

---

## 长期（P2 — 5月+）

### 200+ 并发架构
- [ ] **Worker 分离** — Digest/Tier2 从 WebSocket 进程分离为独立 worker（BullMQ 队列）
- [ ] **背压控制** — `processEntry` 入口加 admission control（202 Accepted + 轮询）
- [ ] **DB 连接池分级** — 读写分离（只读走 replica，写入走 primary）

### 平台扩展
- [ ] AI SDK 升级：关注 `maxSteps`/`stopWhen` 对 DashScope 的兼容性修复
- [ ] Electron 桌面端适配

### 数据规模
- [ ] 记忆压缩：季度任务，将旧记忆总结为高阶抽象
- [ ] Strike 归档：90+ 天未引用的 Strike 迁移到冷存储
- [ ] 数据库分区：按 user_id 分区 strike/bond/memory 表

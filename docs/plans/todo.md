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

## 4/1 上线前（P0）

### Agent 交互能力补全
- [ ] 新增工具：`update_settings` — 修改用户设置（通知时间、ASR 模式等）
- [ ] 新增工具：`schedule_todo` — 批量排期（AI 根据优先级自动分配时间段）
- [ ] 新增工具：`create_project_plan` — 创建项目 + 自动拆解为目标/子任务路径
- [ ] 新增工具：`query_todos` — 查询待办列表（按状态/日期/目标筛选）
- [ ] 新增工具：`query_goals` — 查询目标进度（含子任务完成率）
- [ ] 确认所有现有工具 execute 参数正确传入（inputSchema 修复后端到端验证）

### 录音处理性能
- [ ] Voice Action 分类改规则预筛（关键词/正则匹配祈使句，只命中时走 AI）
- [ ] 评估合并 cleanup 到 digest（Process 阶段去掉 AI 调用，用户等待 = 纯 ASR）

### 数据完整性
- [ ] 执行 Migration `029_cognitive_snapshot.sql`（cognitive_snapshot 表）
- [ ] 执行 Migration `030_strike_source_cascade.sql`（strike 外键修复）
- [ ] 端到端测试：录音 → Process → Digest → Strike → Tier2 batch-analyze

### 前端体验
- [ ] 工具执行结果 Toast 反馈（"已创建待办：xxx"、"已更新时间：xxx"）
- [ ] 首屏加载优化：skeleton screen 替代 loading spinner

---

## Beta 后（P1 — 4月中旬）

### 记忆系统
- [ ] 记忆合并任务：每周扫描语义相似记忆，合并低重要性条目
- [ ] 所有记忆类型加 TTL（180 天默认，核心目标类不过期）
- [ ] 记忆检索加速：向量数据库（Pinecone/Weaviate）替代内存 embedding cache
- [ ] 去重扩展：对比范围从 top-5 → top-20 similar memories

### 工具调用进阶
- [ ] 工具执行结果 UI 卡片（待办卡片、目标卡片、项目看板缩略图）
- [ ] confirm 类工具的用户确认流程（底部弹窗："确定删除这条记录？"）
- [ ] 工具调用链：AI 自动规划多步操作（"创建项目 → 拆解目标 → 排期"一气呵成）
- [ ] 评估 Mastra 框架（原生 DashScope 支持 + 自控 agent loop）

### 认知引擎
- [ ] Tier2 端到端验证（真实数据 batch-analyze 效果）
- [ ] 认知报告 UI（每周/月维度的认知变化可视化）
- [ ] cluster 演化追踪（增长/萎缩/分裂/合并时间线）

### 录音体验
- [ ] Process + Digest 合并为单次 AI 调用（消除 2-5s 清理延迟）
- [ ] ASR 断句优化（长录音分段处理，实时显示）

---

## 长期（P2 — 5月+）

### 平台扩展
- [ ] AI SDK 升级：关注 `maxSteps`/`stopWhen` 对 DashScope 的兼容性修复
- [ ] 多模型支持：关键操作用 qwen-max，轻量操作用 qwen-turbo（成本优化）
- [ ] Electron 桌面端适配

### 数据规模
- [ ] 记忆压缩：季度任务，将旧记忆总结为高阶抽象
- [ ] Strike 归档：90+ 天未引用的 Strike 迁移到冷存储
- [ ] 数据库分区：按 user_id 分区 strike/bond/memory 表

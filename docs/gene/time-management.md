## gene_time_management
### 功能描述
待办时间估算与全面 enrichment。AI 自动估算完成时间，并进行领域分类、影响力评估、AI可执行性判断。基于用户目标记忆进行 impact 评分。

### 详细功能
- 功能1：todo 表字段：estimated_minutes, scheduled_start, scheduled_end, priority, completed_at, domain, impact, ai_actionable, ai_action_plan
- 功能2：AI 时间估算（单个和批量）
- 功能3：智能排程器（基于优先级和空闲时段分配时间）
- 功能4：完成标记自动记录 completed_at
- 功能5：Todo Enrichment — estimateBatchTodos 返回 TodoEnrichment（扩展 TimeEstimate），包含 domain(work/life/social/learning/health)、impact(1-10)、ai_actionable、ai_action_plan
- 功能6：目标感知评分 — 注入 [目标] 前缀高 importance 记忆作为 impact 评估参照
- 功能7：AI 可执行性判断 — true=AI可通过文本生成/信息整理完成，false=必须用户物理执行；ai_action_plan 列出 2-5 个执行步骤

### 关键文件
- `gateway/src/proactive/time-estimator.ts` — TodoEnrichment 接口 + estimateBatchTodos（含 memories 上下文）
- `gateway/src/proactive/scheduler.ts` — 智能排程
- `gateway/src/db/repositories/todo.ts` — 扩展 CRUD（含 domain/impact/ai_actionable/ai_action_plan）
- `supabase/migrations/007_time_management.sql` — 基础时间管理字段
- `supabase/migrations/010_todo_enrichment.sql` — domain/impact/ai_actionable/ai_action_plan 字段 + 索引

### 测试描述
- 输入：录音创建待办 "写项目报告"
- 输出：estimated_minutes=60, priority=4, domain=work, impact=7, ai_actionable=true, ai_action_plan=["收集报告要点","按章节组织","生成初稿"]

# Bug Log

> 记录每次 bug 修复的现象、根因、修复方式，以及流程改进。
> Agent 每天开始工作前检查此文件，判断是否有可提炼为 CLAUDE.md「已知陷阱」的通用规则。

## 记录格式

### [日期] [类型: bug/流程改进] 简述
- **现象**：用户看到了什么 / 流程哪里不顺
- **根因**：代码哪里出了问题 / 流程哪个环节有缺陷
- **修复**：怎么修的 / 怎么改进的
- **回归测试**：`[测试文件路径]` — 标注 `regression: fix-xxx`（bug 类型必填）
- **教训**：这类问题的通用防护规则（如果有）
- **已提炼**：✅ 已写入 CLAUDE.md / ❌ 仅此例，无通用性

---

## 日志条目

（按时间倒序，新条目添加在此处下方）

### [2026-04-11] [bug] Wiki 编译管线多层 AI 幻觉导致 FK 违约

- **现象**：Wiki compile API 反复返回 500，每次修一个又冒出新的 FK violation。先后出现 6 种不同的失败模式，编译无法完成
- **根因**：AI（LLM）在编译指令中幻觉出不存在的 UUID，数据库执行时 FK 约束报错。具体 6 层问题：
  1. **UUID 格式非法**：AI 输出 `2aeebae7-4bfa-4bfa-4bfa-4bfa-4bfa-4bfa-4bfa`，不符合 UUID v4 格式
  2. **record_id 不存在**：`wiki_page_record` INSERT 引用了 AI 编造的 record ID
  3. **wiki_page_id 不存在（update_pages）**：AI 指令更新已被删除的 cluster 迁移空壳页面
  4. **wiki_page_id 不存在（split_page）**：AI 尝试拆分不存在的页面
  5. **wiki_page_id 不存在（merge_pages）**：AI 尝试合并不存在的页面
  6. **wiki_page_id 不存在（goal_sync）**：AI 在 goal_sync.create 中编造 wiki_page_id，todo INSERT 触发 FK
- **修复**：逐层添加防御性校验（wiki-compiler.ts）：
  1. `isValidUuid()` 正则校验所有 AI 输出的 UUID
  2. `wiki_page_record` INSERT 改为 `SELECT ... WHERE EXISTS (SELECT 1 FROM record WHERE id = $2)`
  3. `update_pages` 前 `SELECT 1 FROM wiki_page WHERE id = $1` 存在性检查
  4. `split_page` 前同样存在性检查
  5. `merge_pages` 前同样存在性检查
  6. `goal_sync` 的 `wiki_page_id` 先验证页面存在，不存在则置 null
- **回归测试**：`gateway/src/cognitive/wiki-compiler.test.ts`（已有 mock 测试覆盖主流程）
- **教训**：**LLM 输出的任何 ID（UUID/FK 引用）都不可信**。在执行 DB 写入前，必须对每个 AI 产出的 ID 做：(1) 格式校验（正则）；(2) EXISTS 存在性查询。不能假设 AI 只会引用 prompt 中给出的 ID——它会编造格式正确但不存在的 UUID，也会编造格式都不对的伪 UUID
- **已提炼**：✅ 已写入 CLAUDE.md（[AI 幻觉] 规则）

### [2026-04-11] [bug] Wiki 编译连接被 Supabase Pooler 杀死

- **现象**：编译第 1 批（30 条）成功后，第 2 批启动时报 `Connection terminated unexpectedly`，gateway 崩溃
- **根因**：`pg_try_advisory_xact_lock` 包裹在 `BEGIN...ROLLBACK` 事务中，但编译 AI 调用耗时 90-110 秒。Supabase Transaction Pooler（端口 6543）默认连接超时约 60 秒，长时间持有事务的连接被强制终止
- **修复**：将 `pg_try_advisory_xact_lock` 替换为进程内 `Set<string>` 内存锁。`compileLocks.add(lockKey)` 获取锁，`finally { compileLocks.delete(lockKey) }` 释放。单进程部署无需分布式锁
- **附带修复**：
  - `server.requestTimeout` 从 Node.js 默认 300s 延长到 600s
  - `server.headersTimeout` 和 `server.keepAliveTimeout` 同步延长
- **回归测试**：无（需真实数据库+长时间运行环境）
- **教训**：Supabase Transaction Pooler 不适合持有长事务（>60s）。advisory lock 包在事务中，事务被 pooler 杀死后锁丢失但编译也中断。对于单实例服务，内存锁比 DB 锁更可靠
- **已提炼**：✅ 已写入 CLAUDE.md（[数据库锁] 长事务规则）

### [2026-04-11] [bug] Node.js HTTP 服务器默认超时截断编译响应

- **现象**：Wiki compile API 在约 300 秒时被截断，返回空响应（非 500），gateway 日志无错误
- **根因**：Node.js `http.Server` 默认 `requestTimeout = 300000`（5 分钟），多批次编译总耗时超过 5 分钟时，服务器主动关闭连接
- **修复**：在 `gateway/src/index.ts` 中设置：`server.requestTimeout = 10 * 60 * 1000`（10 分钟），`headersTimeout` 和 `keepAliveTimeout` 同步延长
- **回归测试**：无（需长时间运行环境）
- **教训**：Node.js HTTP 服务器有 3 个独立的超时配置（requestTimeout / headersTimeout / keepAliveTimeout），任何一个都可能静默截断长请求。需要所有三个都设置
- **已提炼**：❌ 仅此例

### [2026-04-11] [流程改进] Phase 12-13 Strike 引擎停用 + 代码清理

- **现象**：Wiki 编译管线验证通过后，执行 Phase 12（停用 Strike 引擎）和 Phase 13（前端展示迁移 + 代码清理）
- **变更清单**：
  - **daily-cycle.ts**：移除 `runBatchAnalyze`、`runEmergence`、`maintenance` 三步调用，替换为 `compileWikiForUser()` 单步
  - **report.ts**：数据源从 strike/bond/cluster 全面切换到 wiki page + record
  - **cognitive-stats.ts**：stats 改查 wiki page 数据；`/cognitive/compile` 替代 `/cognitive/batch-analyze`
  - **strikes.ts / cognitive-clusters.ts**：路由返回空/410，标记 @deprecated
  - **goals.ts**：移除 `debug-emergence`、`emergence`、`backfill` 路由
  - **前端删除**：`strike-preview.tsx`、`use-strikes.ts`、`life-map.tsx`、`cluster-detail.tsx`、`use-cognitive-map.ts`、`stats-dashboard.tsx`
  - **note-card.tsx**：移除 StrikesSection 渲染
  - **todo-workspace-view.tsx**：`cluster_id` 引用改为 `wiki_page_id`
  - **domain-config.ts**：标记 @deprecated
- **测试结果**：前端 328/328 通过；Gateway 625/625 通过（10 个预存在失败，无新增）
- **教训**：大规模引擎替换应分两步：先验证新引擎（Phase 11 Wiki 编译），再停用旧引擎（Phase 12-13）。避免同时切换导致无法定位问题
- **已提炼**：❌ 流程经验，无代码规则

### [2026-04-11] [bug] 早晚报绕过 v2 prompt 架构 + 时区 bug
- **现象**：(1) 早晚报 Soul 截断到 200 字，不加载 UserAgent/Memory/Wiki/Goals (2) `toDateString` 用 `toISOString()` 返回 UTC 日期，北京 0:00-8:00 间日期筛选错一天 (3) 早报缺目标进度，晚报缺日记洞察
- **根因**：daily-loop.ts 在 v2 架构重构后仍走老管线（内联 prompt + 散装 loadSoul/loadProfile），且 `toDateString` 违反时区契约
- **修复**：(1) 接入 `loadWarmContext(mode:"briefing")` + `buildSystemPrompt(agent:"briefing")`，Soul 完整注入 (2) `toDateString` 重命名为 `toLocalDateStr`，内部用 `toLocalDate()` 返回本地日期 (3) 早报新增 `goal_pulse`、晚报新增 `insight`/`affirmation` (4) 路由层 null 返回改为 `{disabled:true}` (5) `loadWarmContext` 加 try/catch 降级 (6) report.ts 同步修复
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 40 个测试；`e2e/briefing-v2.spec.ts` — 3 个 E2E 测试
- **教训**：新建 handler 或重构架构后，必须检查所有消费方是否同步接入新架构（daily-loop/report 被遗漏）；`toISOString()` 在日期比较中永远不安全
- **已提炼**：✅ CLAUDE.md 已有时区契约覆盖

### [2026-04-11] [bug] 图片插入后显示文字描述而非缩略图
- **现象**：用户插入图片后，时间线卡片显示 "[图片内容无法识别]" 文字而非图片缩略图
- **根因**：(1) ingest.ts 图片 record 的 source 设为 "manual" 而非 "image"，isImage 检测不可靠 (2) Vision AI 失败时 title/short_summary 存储无用 fallback 文字 (3) 缩略图在 DOM 中排在文字之后，不够醒目
- **修复**：后端 source 改为 "image"、Vision 失败时 title="图片" + short_summary=""；前端缩略图 DOM 顺序提前、图片无 short_summary 时不显示文字、img onError 使用 React state 管理
- **回归测试**：`features/notes/components/notes-timeline.test.tsx` + `gateway/src/routes/ingest.test.ts` — 标注 `regression: fix-image-thumbnail`
- **教训**：ingest 路由创建 record 时 source 字段应匹配实际来源类型，避免前端做 fallback 检测
- **已提炼**：❌ 仅此例，无通用性

### [2026-04-11] [bug] 待办项目视图添加后消失
- **现象**：在项目视图中添加待办后，待办立即消失。项目卡片始终显示 0 个任务。无论从项目详情页还是视图页直接添加都复现
- **根因**：`gateway/src/db/repositories/todo.ts` 的 `findByUser`/`findByDevice` SQL 查询包含 `AND t.parent_id IS NULL`，意图排除子任务，但同时排除了挂在项目/目标（level>=1）下的行动任务（level=0）。这些任务有 `parent_id` 指向项目，被错误过滤
- **修复**：将 `AND t.parent_id IS NULL` 改为 `AND (t.parent_id IS NULL OR p.id IS NOT NULL)`。利用已有的 `LEFT JOIN todo p ON p.id = t.parent_id AND p.level >= 1`：parent 是项目/目标时 `p.id IS NOT NULL`（返回），parent 是普通任务时 `p.id IS NULL`（排除子任务）
- **回归测试**：`gateway/src/db/repositories/todo.test.ts` — 标注 `regression: fix-todo-project-vanish`（4 个用例）
- **教训**：SQL WHERE 条件中用 `parent_id IS NULL` 排除子表记录时，如果 parent_id 有多种语义（指向不同 level 的实体），必须区分处理，不能一刀切
- **已提炼**：❌ 仅此例

### [2026-04-10] [bug] Wiki 编译 advisory lock 泄漏导致 compile 永久失效
- **现象**：wiki compile API 间歇性返回 `records_compiled: 0`，E2E 行为5 flaky（第一次 9.4 分钟超时失败，retry 才通过）。行为1/2 耗时从预期 1-2 分钟膨胀到 7-8 分钟
- **根因**：`wiki-compiler.ts` 使用 `pg_try_advisory_lock(hashtext(key))`（session-level lock）防止并发编译。但 Supabase 使用 transaction pooler（端口 6543），lock 和 unlock 被路由到不同的后端连接。unlock 在后端 B 执行，但锁实际在后端 A 上，导致锁永远不释放。后续所有 compile 调用 `pg_try_advisory_lock` 返回 false → 立即返回空结果
- **诊断过程**：
  1. 从 DB 查 record 状态 → 所有 record 都已 digested、compile_status 正确，排除 digest 问题
  2. 诊断脚本复现单 record 流程 → digest 5s + compile 37s = 正常
  3. 直接查 `pg_try_advisory_lock` → 返回 false → **锁被另一个 session 持有，无法释放**
- **修复**：
  1. 将 `pg_try_advisory_lock` 改为 `pg_try_advisory_xact_lock`（事务级锁）
  2. 锁操作包裹在 `BEGIN...ROLLBACK` 事务中，事务结束时锁自动释放
  3. 移除手动 `pg_advisory_unlock` 调用（不再需要）
- **附带修复**：
  - `findPendingCompile` 增加 `AND archived = false`，已删除日记不再参与编译
  - `compileWikiForUser` 改为循环处理所有 pending record（最多 5 轮 × 30 条），避免积压
  - compile 首轮无 pending 时等待 undigested record 完成（最多 90s）
  - compile AI 调用 tier 从 `report`(thinking:ON) 改为 `agent`(thinking:OFF)
- **回归测试**：`e2e/cognitive-wiki.spec.ts` 行为5 — 含 compile + page 关联检查 + AI fallback
- **教训**：PostgreSQL session-level advisory lock（`pg_advisory_lock/unlock`）在连接池的 transaction mode 下不可靠，lock 和 unlock 可能路由到不同后端。必须使用 `pg_advisory_xact_lock`（事务级，自动释放）或用行级锁替代
- **已提炼**：✅ 已写入 CLAUDE.md（[数据库锁] 规则）

### [2026-04-10] [bug] 日记删除后幽灵 Strike 残留
- **现象**：删除日记后，关联的 Strike 仍然存在（source_id=NULL），批处理后"幽灵"认知数据出现
- **根因**：migration 030 设置 strike FK 为 `ON DELETE SET NULL`，删除 record 后 strike 变成孤儿但仍为 active 状态。batch-analyze 的 `findActive()`/`getNewStrikes()` 不过滤 `source_id IS NULL`
- **修复**：
  1. `record.deleteByIds()` 先 `DELETE FROM strike WHERE source_id IN (...)` 再删 record
  2. 新增 migration 057 清理存量孤儿 strike（`source_id IS NULL AND is_cluster = false`）
- **回归测试**：无（需真实数据库环境，bond/strike_tag 的 ON DELETE CASCADE 由 DB 保证）
- **教训**：删除有 FK 子表的主表数据时，必须确认 FK 行为（CASCADE vs SET NULL）。SET NULL 会留下孤儿数据被后续管线处理
- **已提炼**：❌ 仅此例

### [2026-04-10] [bug] 登录时 ai_diary 唯一约束冲突
- **现象**：登录时报错 `duplicate key value violates unique constraint "idx_ai_diary_user_notebook_date_unique"`
- **根因**：`link-device.ts` 的 `linkDeviceToUser()` 对 `ai_diary` 表执行 `UPDATE SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`，但如果用户已有同一 `(user_id, notebook, entry_date)` 的条目（从另一设备），就违反唯一约束。`soul`/`user_profile` 表已有冲突处理，但 `ai_diary` 遗漏了
- **修复**：三步处理——先将冲突条目内容合并到已有 user 条目，再删除孤儿条目，最后无冲突条目正常绑定 user_id
- **回归测试**：无（需真实数据库环境）
- **教训**：对有唯一约束的表做批量 `UPDATE SET user_id` 时，必须先检查/处理冲突，不能盲目更新
- **已提炼**：❌ 仅此例

### [2026-04-09] [bug] 待办时间编辑后日期/时间偏移
- **现象**：待办创建为早上 9:00，编辑为下午 3:00 后，被移动到昨天下午 7 点。北京时间 0:00-8:00 的待办编辑后日期会错位到前一天
- **根因**：前端 5 处 `new Date(ts.replace(/Z$/i, ""))` 将 UTC ISO 时间戳的 Z 后缀剥离，导致浏览器将 UTC 时间当作本地时间解析，产生 -8 小时偏移。同时 `todo-workspace-view.tsx` 日期分组使用 `toISOString().split("T")[0]` 获取 UTC 日期而非本地日期
- **修复**：
  1. `date-utils.ts` `parseScheduledTime()` 移除 `.replace(/Z$/i, "")`，直接 `new Date(ts)`
  2. `todo-edit-sheet.tsx`、`todo-detail-sheet.tsx` 改用 `parseScheduledTime()`
  3. `use-todo-store.ts` `postponeTodo()` 改用 `parseScheduledTime()` + `localTzOffset()` 构造带偏移时间
  4. `todo-workspace-view.tsx` 时间显示移除 Z-strip；日期分组改用 `getLocalToday()`/`toLocalDateStr()`/`toLocalDate()`
  5. `todo-detail-sheet.tsx` `handleSave` useCallback 依赖数组补充 `priority`
- **回归测试**：`features/todos/lib/date-utils.test.ts` — 标注 `regression: fix-todo-time-shift`（6 个用例）
- **教训**：前端解析后端返回的 `timestamptz` 值时，禁止剥离 Z 后缀。`new Date(isoString)` 会正确解析 UTC 并通过 `getHours()`/`getDate()` 返回本地时间。`toISOString().split("T")[0]` 获取的是 UTC 日期，在 UTC+8 的 0:00-8:00 会错位
- **已提炼**：✅ 已写入 CLAUDE.md（前端时区 2 条规则）

### [2026-04-09] [bug] AI 工具调用结果丢失 + 系统性时区残留
- **现象**：(1) AI 搜索"今天的日记有几条"总是回答 0 条，即使后端查到了 4 条记录；(2) 搜索到 4 条今天的记录，AI 误判其中 1 条为昨天（因 UTC 日期 `04-08T17:23Z` 被直接展示）；(3) 多处 `new Date()` + `fmt()` 在 UTC 服务器上返回错误日期
- **根因**：三层问题叠加——
  1. **传输层**：`provider.ts` 手动工具循环中，Step 1 的 tool-result 消息不符合 AI SDK v6 的 `ModelMessage` schema（`output` 字段格式错误），导致 `InvalidPromptError`，模型收不到工具结果
  2. **决策层**：模型看到上下文中之前的"0 条"历史回答，直接复读而不调工具
  3. **显示层**：搜索结果的 `created_at` 直接暴露 UTC 时间（如 `2026-04-08T17:23:03Z`），AI 按 UTC 日期判断，误将北京时间 4/9 凌晨的记录归为 4/8
  4. **计算层**：`search.ts` 的 `resolveDate()`、`date-anchor.ts` 的 `fmt()/buildDateAnchor()` 等 10+ 个文件仍用 `new Date()`（服务器本地时间）而非 `tz.ts`（Asia/Shanghai）
- **修复**：
  1. **AI SDK v6 消息格式**：重写 `provider.ts` `streamWithTools` 的工具结果构造，`output` 使用 `{ type: "text", value: JSON.stringify(result) }` 符合 SDK discriminated union schema；移除已废弃的 `maxSteps: 1`（v6 用 `stopWhen` 替代，默认 `stepCountIs(1)`）；添加 Step 1 验证失败的 fallback（将工具结果作为文本消息重发）
  2. **强制工具调用**：`agents/chat.md` 增加"数据查询必须用工具"规则；`chat.ts` 增加 `isDataQuery()` 模式检测，匹配时注入系统提示强制模型调工具
  3. **UTC→本地时间显示**：新增 `tz.ts` `toLocalDateTime()` 函数（返回 `YYYY-MM-DD HH:mm` 北京时间）；`search.ts`、`view.ts`、`chat.ts`、`report.ts` 所有返回给 AI 的 `created_at`/`scheduled_start`/`generated_at` 统一用 `toLocalDateTime()` 转换
  4. **系统性时区修复**：`date-anchor.ts` `fmt()` 内部改用 `TZDate(Asia/Shanghai)` 解释任意 Date；`buildDateAnchor()`/`formatDateWithRelative()` 默认用 `tzNow()`；`search.ts` `resolveDate()` 改用 `tzToday()/daysAgo()/daysLater()`；`daily-loop.ts`/`report.ts`/`proactive/engine.ts`/`chat.ts`/`action-panel.ts`/`daily-cycle.ts` 的 `new Date()` 全部替换为 `tzNow()`
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 标注 `regression: fix-morning-briefing`（更新了 dayRange 期望值）；`gateway/src/lib/tz.test.ts`（22 个用例）
- **教训**：
  1. AI SDK 大版本升级（v5→v6）会静默改变消息 schema（`output` discriminated union、`maxSteps` 移除），必须读源码确认格式
  2. 时区修复不能只修数据查询层，还要修显示层——UTC 时间直接给 AI 看，AI 会按字面日期判断
  3. 工具调用链有 4 个可能断裂的层：模型决策→参数传递→执行→结果回传，每层都需要独立的观测日志
- **已提炼**：❌ 待提炼（AI SDK 消息格式 + UTC 显示层两条规则有通用性）

### 2026-04-08 [bug] 日历滑动与Tab切换手势冲突
- **现象**：待办页时间视图中，在日历条上左右滑动切换周时，同时触发了 tab 切换
- **根因**：page.tsx 的全局 handleTouchEnd 有 swipeable-task-item 的 closest 豁免，但缺少 calendar-strip/calendar-expand 的豁免，事件冒泡导致两个 handler 同时触发
- **修复**：在 page.tsx handleTouchEnd 的 closest 检查中增加 calendar-strip 和 calendar-expand
- **回归测试**：E2E 覆盖（纯 DOM 事件逻辑无法在 vitest 中有效模拟）
- **教训**：新增组件级水平手势时，必须同步更新 page.tsx 的全局手势豁免列表和 app-mobile-views.md 的手势规则枚举
- **已提炼**：❌ 仅此例，待观察是否再次出现

### [2026-04-08] [流程改进] Phase 1b spec 审查不得后台化
- **现象**：主 Agent 将 spec 审查 agent 放到后台运行，同时直接进入代码修改，审查结果回来时实现已完成
- **根因**：主 Agent 为追求速度，错误地将 Phase 1b（spec 审查）与 Phase 2b（实现）并行执行
- **修复**：在 CLAUDE.md「已知陷阱」中新增规则：Phase 1b 必须前台等待，审查→修正→用户确认后才能进入实现
- **教训**：审查的价值在于拦截实现前的 spec 偏差，后台化等于跳过审查
- **已提炼**：✅ 已写入 CLAUDE.md

### [2026-04-08] [bug] 早报时区错位 + 问候语基于待办
- **现象**：(1) 7:30 推送早报返回昨天的缓存内容；(2) 晨间问候语干燥，围绕待办数量，≤15字限制过紧
- **根因**：(1) `daily-loop.ts` 使用 `toISOString().split("T")[0]` 获取 UTC 日期，7:30 AM 北京时间 = UTC 前一天 23:30，缓存 key 命中昨日数据；(2) prompt 以"根据待办数据"为主语，soul/profile 仅附加 hint
- **修复**：
  1. `daily-loop.ts`、`engine.ts`、`report.ts` 所有日期计算改用 `fmt()`（本地时间），yesterday/tomorrow 改用 `setDate` 模式
  2. 晨间 prompt 改为"根据用户画像"，soul/profile 用 XML 标签包裹作为 prompt 主体
  3. greeting 字数从 ≤15 放宽到 ≤30
  4. `templates.ts` 同步更新，`report.ts` 补充 soul/profile 占位符替换
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 标注 `regression: fix-morning-briefing`（8 个用例）
- **教训**：日期相关逻辑必须统一使用 `fmt()`（本地时间），禁止直接用 `toISOString().split("T")[0]`。同一个 prompt 模板有多个消费者时，更新模板必须同步更新所有消费者的占位符替换逻辑
- **已提炼**：✅ 已写入 CLAUDE.md（[日期] + [模板] 两条规则）

### [2026-04-08] [bug] AI 生成标签数超过 5 个限制 + strike_tag 弃用
- **现象**：record 的标签数经常超过 5 个（设计上限），截图显示单条记录 6+ 个标签
- **根因**：fix-tag-limit 只修了 API 层和前端，遗漏了 gateway 内部 3 条 AI 写入路径（process.ts/digest.ts/batch-analyze.ts）。多条 strike 各自产生 tags 累加写入同一 record，无总量控制
- **修复**：
  1. unified-process-prompt 加"最多5个"硬限
  2. process.ts `parsed.tags.slice(0, 5)` 截断
  3. digest 路径：strike_tag 弃用，移除 strikeTagRepo 调用和 prompt 中 strike tags 字段
  4. batch-analyze：移除 strikeTagRepo，传播加 `countByRecordId >= 5` 检查
  5. records.ts 手动创建路径加 `.slice(0, 5)`
- **回归测试**：无（纯后端 AI 逻辑，需集成测试验证）
- **教训**：限制类修复必须检查所有写入路径，不能只修 API 层。应列出所有 `addToRecord` / `createMany` 调用点逐一排查
- **已提炼**：❌ 仅此例，无通用性（等出现第二次再提炼）

### [2026-04-11] [bug] 录音处理通知状态滞后
- **现象**：录音完成后日记已在时间线可见，但 FAB 胶囊仍显示"处理中"5-30 秒，等 AI 后处理完成才消失
- **根因**：`fab.tsx` 在 `asr.done` 时设置 `processing=true` 显示"处理中"胶囊，要等 `process.result` 消息才清除。但日记在 `asr.done` 时已创建可见，用户感知与系统状态不匹配
- **修复**：`asr.done` 不再设 `processing=true`，改为 `fabNotify.success("已记录")` 短暂提示；`process.result` 静默刷新时间线不弹通知；`error` case 用 `pipelineIdRef` 判断是否显示错误；移除 30s safety timeout
- **回归测试**：`features/recording/components/fab-notify-stale.test.ts` — 标注 `regression: fix-recording-notify-stale`
- **教训**：异步管线的通知粒度应与用户感知对齐——用户关心的是"我的内容保存了吗"，而非"AI 后处理完了吗"
- **已提炼**：❌ 仅此例，无通用性

### [2026-04-12] [bug] 上滑指令 CommandSheet 堵塞无响应
- **现象**：用户上滑触发指令后，长时间无响应或 CommandSheet 永远卡在"处理中"
- **根因**：三层问题叠加：(1) Layer 2 双阶段串行 AI 调用（classifyVoiceIntent + matchTodoByHint/executeVoiceAction），总耗时 5-20 秒；(2) AI 返回空 actions 时 process.result 无 todo_commands，CommandSheet phase 永远停在 "processing"；(3) 上滑松手后到 CommandSheet 打开前无视觉反馈
- **修复**：(1) 新建 commandFullMode 单阶段模式，预加载待办+目标+文件夹上下文，单次 AI 调用替代双阶段串行，支持待办/日记/搜索/文件夹四类工具，预期 2-5 秒；(2) app/page.tsx process.result handler 兜底空结果和错误，CommandSheet 新增 empty/error phase + 20 秒超时保护；(3) 上滑松手后 fabNotify.info("指令处理中...")
- **回归测试**：`gateway/src/handlers/command-full-mode.test.ts`（13 个）+ `gateway/src/handlers/command-full-prompt.test.ts`（9 个）+ `features/todos/components/command-sheet.test.tsx`（8 个）— 标注 `regression: fix-command-sheet-stuck`
- **教训**：多阶段串行 AI 调用应尽量合并为单阶段含上下文的调用。上下文越完整，后处理越少，总耗时越低。
- **已提炼**：❌ 仅此例（等出现第二次再提炼）

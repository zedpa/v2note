# 念念有路 核心场景路线图 v4.2

> 基于产品设计 + 代码审计 + 架构缺口分析 + Agent 能力规划 + 认知引擎 v2 重构。
> 每个场景对应一个 `specs/` 文件，按 Given/When/Then 格式。
> 最近更新: 2026-03-30 — 全量代码审计（修正6个状态标记）+ spec 042 落地 + E2E验证通过

## 全景链路

```
混沌输入 → Tier1实时digest → Tier2批量分析 → AI洞察 → 行动闭环
   ✅          ✅               ✅已落地          ✅        ✅
                                    ↑
              单次AI调用替代多步管线（6旧文件删除，3新文件，daily-cycle 3步）
              + embedding基础设施（strike.embedding + pgvector HNSW + 6个集成点）
```

## 架构演进：认知引擎 v1 → v2

```
v1（多步管线，已废弃）:
  Digest(2次AI) → embedding → 图构建 → 三角闭合 → BFS → 逐候选AI审核
  → O(n²)跨聚类 → 共振检测AI → 模式提取AI → intend密度检查
  = 7-17次AI调用，60-180秒，8个文件/1500行

v2（两层架构，当前方向）:
  Tier1: Digest(1次AI) → Strike分解 + todo投影 + 异步embedding写入
  Tier2: 批量分析(1次AI) → 聚类专注（Step A prompt），行动映射合并到 Digest
  L2涌现: 3+个L1聚类时触发（周日 daily-cycle 或 batch-analyze 后）
  统一模型: Goal 消解为 todo.level>=1，goalRepo 改为适配层，goal表改为VIEW
  Embedding: strike.embedding + todo_embedding/goal_embedding 表，pgvector HNSW检索
  = 2次AI调用，15-30秒，3个新文件/~400行
```

## 开发顺序

```
Phase 0: 认知引擎 v2 重构（Week 0-1）⚡最高优先
  cognitive-snapshot      增量分析基础设施——快照表 + 乐观锁 + 冷启动/增量双模式
  cognitive-engine-v2     单次批量分析——替代 clustering+emergence+contradiction+promote+tag-sync
                          Tier1 简化（砍跨链AI调用）+ Tier2 新建（单次AI全量输出）
                          触发条件：累计5个新Strike OR 每日3AM（OR逻辑）
                          删除7个旧文件，daily-cycle 从8步→3步

  ※ 替代以下 v1 spec 的实现（spec 保留为历史参考，标记 superseded）：
    emergence-chain       → 聚类/涌现逻辑并入 Tier2 prompt
    cold-start-bonds      → 冷启动关联并入 Tier2 冷启动模式
    cluster-tag-sync      → 标签反写并入 Tier2 输出
    source-type-weight    → material 降权改为 prompt 指令（概念保留）
    top-level-dimensions  → 层级结构改为 prompt 指令（概念保留）

Phase 1: 数据质量 + 快速感知（v1 已完成，v2 重构完成）
  source-type-weight      ⚠️ retrieval降权✅，clustering未过滤material（PDF可能污染聚类）
  cold-start-bonds        ✅ v1实现完成，v2中冷启动关联由 Tier2 一次性产出
  cluster-tag-sync        ✅ tag-sync.ts已删，逻辑内嵌于batch-analyze.ts(L443-487) cluster_tags段

Phase 2: 冷启动 + 报告通路
  cold-start-onboarding   ⚠️ 5问流程在，Q2→维度生成未接入（onboarding不调用generateTopLevelDimensions）
  cognitive-report        ✅ 认知报告 + 每日回顾数据源

Phase 2.5: Agent 基础能力
  agent-tool-layer        ✅ 工具层重构——整合13+2个工具 + 原生function calling + 自主度分级
  agent-plan              ✅ 后端plan-repo/executor + 前端plan-card.tsx（可编辑步骤+执行追踪+内联编辑）
  agent-web-tools         ✅ 联网工具——搜索 + URL抓取 + Ingest管道对接

Phase 3: 结构能力（v1 已完成，v2 重构完成）
  top-level-dimensions    ✅ top-level.ts接入embed-writer（维度创建时写embedding），侧边栏L3展示已完成
  emergence-chain         ⚠️ L1聚类✅（batch-analyze），L2涌现✅（emergence.ts周日触发），L3维度✅（top-level），但L2→L3自动提升未实现

Phase 4: 认知→行动闭环
  todo-strike-bridge      ✅ 数据桥梁——todo.strike_id + goal.cluster_id 统一模型
  smart-todo              ⚠️ 核心提取✅，创建待办后无自然语言反馈（静默创建）
  goal-lifecycle          ⚠️ 核心CRUD✅，Skip→alert和7天result追踪不完整
  voice-action            ✅ 语音指令自动识别——统一入口，AI判断记录/指令/混合

  ※ 架构决策：todo/goal 不再是独立实体，而是 Strike/Cluster 的行动投影
  ※ goal-lifecycle 涌现入口从 v1 的 checkIntendEmergence → v2 的 Tier2 goal_suggestions 输出

Phase 5: 深度体验
  advisor-context         ✅ 参谋上下文合并
  reader                  🔴 仅reader-utils.ts工具函数，UI组件从未实现
  annotation              🔴 前端UI组件从未创建（features/reader/components/为空）
  agent-self-evolution    ✅ Agent自适应——交互偏好学习 + Soul守护

Phase 7: 前端重构（功能骨架 ~90% 完成）

  design-visual-alignment ✅ 设计语言落地——字体/No-Line/间距/Glass/阴影/spring/粒子/欢迎页/卡片流/极性图
  app-mobile-redesign     🔄 移动端重构——功能骨架+视觉 ~80% 完成，E2E全链路验证通过（2026-03-30）
  mobile-action-panel     ✅ 行动面板完善——Tinder滑动+露出标签+跳过原因+目标指示器+spring物理
  topic-lifecycle         🔄 主题生命周期——11/12场景完成，仅余场景6(收获追问)+12(冷启动种子)依赖proactive/onboarding
  ai-companion-window     ⏸ 暂缓——路路头像/AiWindow 已从前端完整删除（2026-03-29）
  domain-vocabulary       ✅ 领域词库——冷启动领域选择+DashScope同步+自动收录+AI生成

  ※ topic-lifecycle 后端数据源从 v1 graph 算法 → v2 Tier2 批量分析输出
  ※ app-mobile-redesign 功能缺口: 发现页入口已隐藏（依赖 topic-lifecycle 稳定后恢复）

Phase 7.5: 前后端闲置修复（2026-03-28 审计发现）

  discovery-page          ✅ 发现页overlay——代码完成，入口已隐藏（2026-03-29 减法，待 topic-lifecycle 稳定后恢复）
  auth-session            ✅ 登出与会话——后端logout调用+token auto-refresh+前端logout清理
  daily-review-redesign   ✅ 每日回顾重构——卡片横滑+分页点+动态卡片构建
  todo-subtask            ✅ 子任务树（后端+DB）——todo.parent_id+LATERAL子查询+REST API，前端展示待补
  empty-state-guide       ✅ 空状态引导——待办/统计/侧边栏/发现 4页温暖引导

Phase 8: 设计对齐（2026-03-28 全量设计图审计 + 全链路测试发现）

  Phase 8 来源：21张设计图逐张对比 + 156条flomo导入全链路测试
  依赖：Phase 7/7.5 基本完成

  journal-card-insight    🟡 日记卡片AI分析——展开后显示要点/行动区域+"和路路聊聊这条"按钮
  cognitive-stats-redesign ⏸ 认知统计重构——极性分布图+Top Clusters替换录音/待办趋势图（暂缓）
  todo-subtask-ui         ✅ 子任务前端UI——Detail Sheet内AI action plan步骤列表+勾选+violet主题
  discovery-insights      ⏸ 发现页AI洞察——入口已隐藏，待核心链路稳定后恢复
  cluster-prompt-tuning   ✅ 聚类prompt调优——Step A纯聚类prompt + qwen3.5-plus + 9 Cluster + 68.7%覆盖率
  cognitive-structure-repair ✅ 后端统一task模型 + Goal迁移 + 聚类重跑 + 前端L3导航✅ + Today分组✅
  chat-mic-button         ✅ 聊天麦克风按钮——chat-input-bar.tsx内mic图标+录音切换
  ui-polish               🟡 UI细节打磨——进度条/跳过语义/空状态0·0/侧边栏精简/红点

  042-schema-cleanup      ✅ Schema清理+Embedding基础设施——strike.embedding列+pgvector HNSW+goal改VIEW+废弃表删除

  ※ date-format-alignment、auth-input-style 已删除（不做）
  ※ cognitive-stats-redesign 暂缓
  ※ journal-card-insight 是核心体验差距，设计图09的关键区域
  ※ ui-polish 合并5个P2小项，可逐个渐进修复

Phase 6: 补充能力
  goal-granularity        ✅ 目标粒度
  goal-auto-link          ✅ 目标自动关联
  goals-scaffold          ⚠️ 列表+详情✅，关联日记数+深入讨论按钮未接入
  action-tracking         ✅ 行动追踪
  knowledge-lifecycle     ✅ 知识生命周期（supersede 逻辑并入 Tier2 输出）
  person-profile          ✅ 人物画像系统
  decision-template       ✅ 决策模板涌现

Phase 9: 待办 UI 全面重构（2026-03-31 启动）

  todo-ui-redesign        ✅ 双视图体系重构——时间视图(日期轴+4时段块+无限滚动)+项目视图(水平轮播+PageDots+"其他"分组)
                          数据层: TodoDTO类型安全+useTodoStore统一状态+API重写
                          原子组件: TaskItem共用+TodoCreateSheet手动创建+AddTaskRow
                          时间视图: TimeViewHeader+CalendarStrip无限滚动+TimeBlock中文标签+已完成划线
                          项目视图: ProjectCard+InboxCard散装任务+水平轮播+PageDots分页指示器
                          编辑层: TodoEditSheet重构+视图切换动画+WebSocket实时同步
                          E2E: 11场景Playwright全流程验证
                          清理: 删除6个旧组件(todo-panel/diary-card/gantt/todo-view/use-todos/use-today-todos)

  ※ 替代现有停摆的待办前端(6个组件职责重叠+数据流断裂+交互缺失)
  ※ 依赖: todo-strike-bridge✅ + todo-subtask✅ + cognitive-structure-repair✅

Phase 6+: 增强与扩展（暂缓）
  harmony-support         ⏸ 鸿蒙适配
  external-integration    ⏸ 外部数据源集成
```

## Spec 统计

| Phase | Spec 数 | 状态 | 审计结果（2026-03-30 更新） |
|-------|---------|------|----------|
| Phase 0 | 2 | ✅ | cognitive-engine-v2 + snapshot 完成 |
| Phase 1 | 3 | ✅ | source-type-weight⚠️部分，cluster-tag-sync✅内嵌batch-analyze |
| Phase 2 | 2 | ⚠️ | onboarding Q2→维度生成断裂 |
| Phase 2.5 | 3 | ✅ | agent-plan✅（plan-card前端已实现） |
| Phase 3 | 2 | ⚠️ | top-level✅接入embedding，emergence L2→L3提升未实现 |
| Phase 4 | 4 | ⚠️ | smart-todo静默创建，goal-lifecycle追踪不全 |
| Phase 5 | 4 | ⚠️ | reader🔴+annotation🔴 UI从未实现 |
| Phase 6 | 7 | ✅ | goals-scaffold小缺口 |
| Phase 7 | 6 | 🔄 | companion⏸已删，vocabulary✅，E2E全链路验证通过 |
| Phase 7.5 | 5 | ✅ | |
| Phase 8 | 8 | ✅ | structure-repair✅ + subtask-ui✅ + mic✅ + 042✅，仅余journal-insight🟡+ui-polish🟡 |
| Phase 9 | 1 | 🔄 | todo-ui-redesign 启动（2026-03-31） |
| Phase 6+ | 2 | ⏸ | |
| **总计** | **51** | | **✅33 ⚠️7 🔴2 🟡3 🔄1 ⏸5** |

## v2 重构文件变更清单

### 新建
| 文件 | 说明 |
|------|------|
| `gateway/src/cognitive/batch-analyze.ts` | Tier2 核心：单次 AI 调用 + DB 写入 + cluster_tags内嵌 |
| `gateway/src/cognitive/batch-analyze-prompt.ts` | Tier2 prompt 构建（Step A 纯聚类） |
| `gateway/src/cognitive/embed-writer.ts` | 异步embedding写入（strike/todo/goal，fire-and-forget） |
| `gateway/src/db/repositories/snapshot.ts` | cognitive_snapshot CRUD |
| `supabase/migrations/029_cognitive_snapshot.sql` | snapshot 表 |
| `supabase/migrations/042_schema_cleanup.sql` | strike.embedding列 + pgvector HNSW + goal改VIEW + 废弃表删除 |
| `e2e/core-pipeline.spec.ts` | 全链路E2E测试（注册→输入→digest→embedding→todo→聚类） |

### 删除（v1 多步管线）
| 文件 | 原功能 | v2 替代 |
|------|--------|---------|
| `gateway/src/cognitive/clustering.ts` | 三角闭合+BFS聚类 | Tier2 prompt 指令 |
| `gateway/src/cognitive/clustering-prompt.ts` | 聚类审核 prompt | 合并到 batch-analyze-prompt |
| `gateway/src/cognitive/l2-emergence.ts` | L2 层级涌现 | 合并入 emergence.ts（L2 on-demand触发） |
| `gateway/src/cognitive/contradiction.ts` | 矛盾扫描 | Tier2 contradictions 字段 |
| `gateway/src/cognitive/promote.ts` | 语义融合 | Tier2 supersedes 字段 |
| `gateway/src/cognitive/tag-sync.ts` | 标签反写 | Tier2 cluster_tags 字段 |

### 修改
| 文件 | 改动 |
|------|------|
| `gateway/src/handlers/digest.ts` | 删除 Step 5-6（跨链AI调用），删除 Step 9（异步clustering），添加 Tier2 触发检查 + writeStrikeEmbedding |
| `gateway/src/cognitive/emergence.ts` | 重构为L2涌现（合并l2-emergence.ts），3+个L1聚类时触发 + writeStrikeEmbedding |
| `gateway/src/cognitive/top-level.ts` | 接入 writeStrikeEmbedding（维度创建时写embedding） |
| `gateway/src/cognitive/todo-projector.ts` | 接入 writeTodoEmbedding（goal/todo创建时写embedding） |
| `gateway/src/cognitive/retrieval.ts` | 语义通道改用 pgvector SQL（`<=>` 余弦距离），不再O(N) API调用 |
| `gateway/src/cognitive/daily-cycle.ts` | 8步→3步：batch-analyze + maintenance + report（周日加L2涌现） |
| `gateway/src/tools/definitions/create-todo.ts` | 接入 writeTodoEmbedding |
| `gateway/src/auth/link-device.ts` | 表列表更新（去掉goal/weekly_review，保留todo） |
| `gateway/src/db/repositories/strike.ts` | create()支持optional embedding参数 |
| `gateway/src/db/repositories/index.ts` | 导出 snapshotRepo，删除 customer-request/setting-change |
| `gateway/src/routes/cognitive-stats.ts` | /cognitive/cycle → /cognitive/batch-analyze |

### 统一模型重构（2026-03-29）
| 文件 | 改动 |
|------|------|
| `supabase/migrations/036_unified_task_model.sql` | todo 加 level/cluster_id/status, record/strike 加 domain |
| `scripts/repair-migrate-goals.mjs` | Goal→Todo 数据迁移（345 goal → todo.level>=1） |
| `scripts/repair-goal-cleanup.mjs` | 硬规则清理（345→53 active） |
| `scripts/repair-todo-parent-link.mjs` | Todo→目标 AI 批量关联 |
| `gateway/src/db/repositories/todo.ts` | createWithDedup + createGoalAsTodo + updateStatus + findGoalsByDomain + getDimensionSummary |
| `gateway/src/db/repositories/goal.ts` | 改为适配层（查 todo WHERE level>=1） |
| `gateway/src/db/repositories/snapshot.ts` | 冷启动改 ASC 支持分批 |
| `gateway/src/cognitive/batch-analyze.ts` | 切换 todoRepo + domain 分配 + createWithDedup |
| `gateway/src/cognitive/batch-analyze-prompt.ts` | Step A 纯聚类 prompt + assign 优先 + 覆盖率目标 |
| `gateway/src/routes/goals.ts` | 统一模型 + /api/v1/dimensions 端点 |
| `shared/lib/types.ts` | TodoItem 加 parent_id/level/cluster_id/status |
| `shared/lib/api/goals.ts` | 加 listDimensions |
| `features/workspace/components/todo-workspace-view.tsx` | Today 按目标分组（>5条时折叠式） |
| `features/sidebar/components/sidebar-drawer.tsx` | "我的世界" L3 维度导航 |

### 保留不变（核心逻辑未改，仅接入embedding）
| 文件 | 原因 |
|------|------|
| `gateway/src/handlers/digest.ts` (Tier1部分) | Strike 分解 + todo 投影不变（新增embedding写入） |
| `gateway/src/cognitive/goal-auto-link.ts` | Strike→Goal 增量关联不变 |
| `gateway/src/cognitive/goal-linker.ts` | Goal 健康度+状态流转不变（涌现入口改为 Tier2 输出） |
| `gateway/src/cognitive/maintenance.ts` | Bond/salience 衰减仍需要 |
| `gateway/src/cognitive/alerts.ts` | 认知提醒保留 |
| `gateway/src/cognitive/report.ts` | 认知报告保留 |

### 已删除（spec 042 清理）
| 文件 | 原因 |
|------|------|
| `gateway/src/db/repositories/customer-request.ts` | 废弃表，DB表已DROP |
| `gateway/src/db/repositories/setting-change.ts` | 废弃表，DB表已DROP |

## 页面层级与导航结构

### 平台分流

```


## 已完成 Spec 列表

- `strike-extraction.md` — ✅ Phase 1 规则引擎实现
- `source-type-weight.md` — ✅ v1完成 → v2中降权逻辑移入 Tier2 prompt
- `cold-start-bonds.md` — ✅ v1完成 → v2中并入 Tier2 冷启动
- `cluster-tag-sync.md` — ✅ v1完成 → v2中内嵌于 batch-analyze.ts cluster_tags 段
- `cold-start-onboarding.md` — ✅ 冷启动 5 问
- `cognitive-report.md` — ✅ 认知报告
- `agent-tool-layer.md` — ✅ 工具层补全
- `agent-plan.md` — ✅ Plan 机制
- `agent-web-tools.md` — ✅ 联网工具
- `top-level-dimensions.md` — ✅ v1完成 → v2中层级概念保留，实现改为 prompt 指令
- `emergence-chain.md` — ✅ v1完成 → v2中整体替换
- `todo-strike-bridge.md` — ✅ 数据桥梁
- `smart-todo.md` — ✅ 智能待办
- `goal-lifecycle.md` — ✅ 目标全生命周期
- `advisor-context.md` — ✅ 参谋上下文合并
- `reader.md` — ✅ 阅读器
- `annotation.md` — ✅ 批注系统
- `agent-self-evolution.md` — ✅ Agent自适应
- `goal-granularity.md` — ✅ 目标粒度
- `goal-auto-link.md` — ✅ 目标自动关联
- `goals-scaffold.md` — ✅ 目标前端骨架
- `action-tracking.md` — ✅ 行动追踪
- `knowledge-lifecycle.md` — ✅ 知识生命周期
- `person-profile.md` — ✅ 人物画像
- `decision-template.md` — ✅ 决策模板涌现
- `mobile-action-panel.md` — ✅ 行动面板完善
- `voice-action.md` — ✅ 语音指令
- `harmony-support.md` — 🟡 鸿蒙适配

## 进行中

- `app-mobile-redesign.md` — 🔄 移动端重构（功能+视觉 ~80% 完成，2026-03-28 大规模实施）
- `todo-ui-redesign.md` — ✅ 待办 UI 全面重构（双视图+E2E，2026-03-31 完成）

## 已完成（2026-03-28 迭代）

1. `cognitive-snapshot.md` — ✅ Tier2 基础设施
2. `cognitive-engine-v2.md` — ✅ 单次批量分析（7旧文件删除+2新文件）
3. `design-visual-alignment.md` — ✅ 16/16 场景
4. `topic-lifecycle.md` — ✅ 11/12 场景
5. `ai-companion-window.md` — ✅ ~18/20 场景
6. `domain-vocabulary.md` — ✅ ~5/7 场景
7. `app-mobile-redesign.md` — 🔄 补充中

## 已完成（2026-03-29 迭代 — 认知结构修复）

1. `cognitive-structure-repair.md` — ✅ 统一模型 + 数据迁移 + 聚类 + 关联 + 前端
   - Phase A: Migration + Goal→Todo 迁移（345 goal → todo.level>=1, 191 parent_id）
   - Phase B: 硬规则清理（345→53 active）+ createWithDedup 永久防护
   - Phase C: Step A 纯聚类 prompt + qwen3.5-plus（9 Cluster, 68.7% 覆盖率）
   - Phase D: Todo→目标 AI 批量关联（24/43=56%, 全部有 domain）
   - Phase E: 侧边栏"我的世界"L3导航 + Today 按目标折叠分组
2. `cluster-prompt-tuning` — ✅ 升级：从 qwen3-max 单 prompt → Step A 纯聚类 + qwen3.5-plus
3. `design-alignment.md` — 部分完成（cluster-prompt-tuning + cognitive-structure-repair）

**本次迭代统计**: 14 文件新建/修改，1 migration，3 repair 脚本

## 已完成（2026-03-30 迭代 — Schema清理+Embedding+E2E验证）

1. `042-schema-cleanup-and-embedding.md` — ✅ 全部场景完成
   - A: strike.embedding列(vector 1024) + HNSW索引 + todo_embedding/goal_embedding表
   - A: goal表改为VIEW（SELECT from todo WHERE level>=1）
   - A: 废弃表DROP（weekly_review, customer_request, setting_change）
   - A: domain CHECK约束 + 复合索引
   - B: embed-writer.ts 异步写入（6个集成点：digest/batch-analyze/emergence/top-level/todo-projector/create-todo）
   - B: retrieval.ts语义通道改用pgvector SQL（不再O(N) API调用）
   - C: link-device表列表更新 + domain值中文统一
2. E2E全链路验证通过（注册→文本输入→AI处理→todo提取→聊天→WebSocket→AI回复）

**本次迭代统计**: 5 文件新建，11 文件修改，2 文件删除，1 migration

## 2026-03-29 减法记录（核心链路聚焦）

> 原则：非核心链路一律隐藏或删除，保留最小可用集，待产品验证后再恢复。

### 已删除（代码完全移除）

| 功能 | 原位置 | 原因 |
|------|--------|------|
| 路路头像 / AiWindow | `features/companion/`, `features/ai-bubble/` | 路由依赖 sprite 资源未就绪，且非核心链路 |
| PixelDeer 动画系统 | `features/companion/components/pixel-deer.tsx` | 同上 |
| gateway companion 模块 | `gateway/src/companion/`, `gateway/src/routes/companion.ts` | 前端已删，后端同步清理 |
| 心情注入（mood section） | `gateway/src/handlers/chat.ts` | 依赖已删的 companion/mood |
| companion.chat 推送 | `gateway/src/proactive/engine.ts` | 前端无消费者 |

### 已隐藏（代码保留，入口关闭）

| 功能 | 隐藏方式 | 恢复条件 |
|------|----------|----------|
| LifeMap 认知图谱 | 从 page.tsx 移除 | 认知引擎 v2 Tier2 数据稳定后 |
| ClusterDetailView | 从 page.tsx 移除 | 同上 |
| DecisionWorkspace | 从 page.tsx 移除 | 同上 |
| DiscoveryOverlay | 侧边栏"发现"入口已删 | topic-lifecycle 全部场景完成后 |
| StatsDashboard | 从 page.tsx 移除 | 待设计稿确认后 |
| MemorySoulOverlay | 从 page.tsx 移除 | 内部调试用，不面向用户 |
| SkillsPage | 从 page.tsx 移除 | 内部功能 |
| TodayGantt | 从 page.tsx 移除 | 待甘特图 UX 验证后 |

### 当前核心链路（保留）

```
录音/文字输入 (FAB)
  → ASR → Digest → Strike
  → 日记时间线 (NotesTimeline)
  → 待办 (TodoWorkspaceView)

AI 对话 (ChatView)  ← 路路的聊天，无头像
搜索 (SearchView)
晨间简报 / 晚间总结
目标管理 (GoalList / GoalDetail)
侧边栏：今日 / 我的世界（维度+目标）/ 每日回顾 / 设置
```

## 剩余（需用户配合）

- 多语言 ASR（暂缓）

## 剩余（后续迭代）

### Phase 7.5: 前后端闲置修复（2026-03-28 审计新增，5 spec / 30 场景）— ✅ 全部完成
- `discovery-page.md` — ✅ 发现页 overlay
- `auth-session.md` — ✅ 登出与会话管理
- `daily-review-redesign.md` — ✅ 每日回顾重构
- `todo-subtask.md` — ✅ 子任务树（todo.parent_id + 统一模型 level 字段）
- `empty-state-guide.md` — ✅ 空状态引导

### 其他剩余
- ai-companion-window: ⏸ 代码已全部删除，spec仅作未来参考
- topic-lifecycle: 冷启动种子数据（场景6+12）
- journal-card-insight: 🟡 日记卡片AI分析（设计图09核心体验差距）
- ui-polish: 🟡 5个P2小项（进度条/跳过语义/空状态/侧边栏精简/红点）
- smart-todo反馈: ⚠️ 待办静默创建缺少自然语言确认
- onboarding→dimensions: ⚠️ Q2→维度生成未接入
- reader/annotation UI: 🔴 spec标✅但前端组件从未创建（非核心链路）
- `external-integration.md` — 🟡 概念级设计阶段
- `harmony-support.md` — ⏸ 暂缓

## 依赖断裂清单（2026-03-30 更新）

| 断裂链路 | 影响 | 修复优先级 | 状态 |
|----------|------|-----------|------|
| ~~onboarding → top-level-dimensions~~ | ~~冷启动后侧边栏维度永远为空~~ | ~~P1~~ | ✅已修（补全投资/社交维度+删除top-level.ts死代码） |
| ~~batch-analyze → cluster-tag-sync~~ | ~~聚类结果不反映在时间线标签上~~ | ~~P1~~ | ✅已修（内嵌batch-analyze L443-487） |
| batch-analyze → L2→L3 emergence | L2涌现已实现，但L2→L3自动提升未实现 | P2（L1+L2够用） | ⚠️部分 |
| ~~app-mobile-redesign → ai-companion-window~~ | ~~redesign spec引用AI Window但companion已删~~ | ~~P0~~ | ✅已清理 |
| ~~agent-plan → chat前端~~ | ~~plan-executor后端在，plan-card前端不存在~~ | ~~P2~~ | ✅已实现（plan-card.tsx） |
| ~~cognitive-structure-repair → 前端L3~~ | ~~统一task模型后端完成，前端导航+分组待补~~ | ~~P1~~ | ✅已实现（sidebar L3 + Today分组） |
| ~~smart-todo → 用户反馈~~ | ~~待办静默创建，缺少自然语言确认消息~~ | ~~P1~~ | ✅已修（补全userId+goal创建也触发事件） |
| reader/annotation → 前端UI | spec标✅但组件从未创建 | P2（非核心链路） | 🔴未实现 |

### 虚假完成修正记录（2026-03-29）

已修正14个spec的状态标记：
- ✅→⏸：ai-companion-window（代码已删）
- ✅→🔴：annotation、reader（UI从未创建）、cluster-tag-sync（实现不存在）
- ✅→⚠️：emergence-chain、cold-start-onboarding、top-level-dimensions、source-type-weight、smart-todo、goal-lifecycle、goals-scaffold、agent-plan、cognitive-structure-repair
- 🟡→⚠️：voice-tools-v2（核心已实现）

### 状态修正记录（2026-03-30 代码审计）

修正6个spec的状态标记（代码已实现但ROADMAP未更新）：
- 🔴→✅：cluster-tag-sync（逻辑内嵌于batch-analyze.ts L443-487）
- ⚠️→✅：agent-plan（plan-card.tsx前端已实现）
- ⚠️→✅：cognitive-structure-repair（sidebar L3导航+Today分组均已完成）
- ⚠️→✅：top-level-dimensions（接入embed-writer + 侧边栏展示）
- 🟡→✅：chat-mic-button（chat-input-bar.tsx mic按钮已实现）
- 🟡→✅：todo-subtask-ui（todo-detail-sheet.tsx AI action plan步骤列表）

新增1个spec：
- 042-schema-cleanup：✅ Schema清理+Embedding基础设施（migration+embed-writer+6个集成点）

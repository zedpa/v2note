# 念念有路 核心场景路线图 v4.1

> 基于产品设计 + 代码审计 + 架构缺口分析 + Agent 能力规划 + 认知引擎 v2 重构。
> 每个场景对应一个 `specs/` 文件，按 Given/When/Then 格式。
> 最近更新: 2026-03-29 — 认知结构修复（统一模型+聚类重跑+前端分组）

## 全景链路

```
混沌输入 → Tier1实时digest → Tier2批量分析 → AI洞察 → 行动闭环
   ✅          ✅               🔵落地中         ✅        ✅
                                    ↑
              单次AI调用替代多步管线（7文件已删除，2文件已新建，daily-cycle 已改）
```

## 架构演进：认知引擎 v1 → v2

```
v1（多步管线，已废弃）:
  Digest(2次AI) → embedding → 图构建 → 三角闭合 → BFS → 逐候选AI审核
  → O(n²)跨聚类 → 共振检测AI → 模式提取AI → intend密度检查
  = 7-17次AI调用，60-180秒，8个文件/1500行

v2（两层架构，当前方向）:
  Tier1: Digest(1次AI) → Strike分解 + todo投影
  Tier2: 批量分析(1次AI) → 聚类专注（Step A prompt），行动映射合并到 Digest
  统一模型: Goal 消解为 todo.level>=1，goalRepo 改为适配层
  = 2次AI调用，15-30秒，2个新文件/~300行
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

Phase 1: 数据质量 + 快速感知（v1 已完成，v2 部分重构）
  source-type-weight      ✅→🔄 v1实现完成，v2中 material 降权移入 Tier2 prompt
  cold-start-bonds        ✅→🔄 v1实现完成，v2中冷启动关联由 Tier2 一次性产出
  cluster-tag-sync        ✅→🔄 v1实现完成，v2中标签反写并入 Tier2 输出

Phase 2: 冷启动 + 报告通路（不变）
  cold-start-onboarding   ✅ 冷启动 5 问（升级现有 3 问）
  cognitive-report        ✅ 认知报告 + 每日回顾数据源

Phase 2.5: Agent 基础能力（不变）
  agent-tool-layer        ✅ 工具层重构——整合13个工具 + 原生function calling + 自主度分级
  agent-plan              ✅ Plan机制——多步编排 + 持久化 + 状态机 + 确认协议
  agent-web-tools         ✅ 联网工具——搜索 + URL抓取 + Ingest管道对接

Phase 3: 结构能力（v1 已完成，v2 重构替代）
  top-level-dimensions    ✅→🔄 v1实现完成，v2中层级概念保留，实现改为 prompt 指令
  emergence-chain         ✅→🔄 v1实现完成，v2中整体替换为 Tier2 批量分析

Phase 4: 认知→行动闭环（不变）
  todo-strike-bridge      ✅ 数据桥梁——todo.strike_id + goal.cluster_id 统一模型
  smart-todo              ✅ 智能待办——自然语言全生命周期管理（核心体验）
  goal-lifecycle          ✅ 目标全生命周期——前端+关联+追踪+涌现+状态流转
  voice-action            ✅ 语音指令自动识别——统一入口，AI判断记录/指令/混合

  ※ 架构决策：todo/goal 不再是独立实体，而是 Strike/Cluster 的行动投影
  ※ goal-lifecycle 涌现入口从 v1 的 checkIntendEmergence → v2 的 Tier2 goal_suggestions 输出

Phase 5: 深度体验（不变）
  advisor-context         ✅ 参谋上下文合并
  reader                  ✅ 阅读器
  annotation              ✅ 批注系统
  agent-self-evolution    ✅ Agent自适应——交互偏好学习 + Soul守护

Phase 7: 前端重构（功能骨架 ~85% 完成，视觉对齐未开始）

  Phase 7 内部依赖：
  design-visual-alignment ──→ app-mobile-redesign（视觉层）
       (基础设施)                    ↑
                              topic-lifecycle ──→ 发现页 + 侧边栏方向区
                              ai-companion-window ──→ AI Window 三态

  design-visual-alignment ✅ 设计语言落地——字体/No-Line/间距/Glass/阴影/spring/粒子/欢迎页/卡片流/极性图
  app-mobile-redesign     🔄 移动端重构——功能骨架+视觉 ~60% 完成（2026-03-28 审计+实施）
  mobile-action-panel     ✅ 行动面板完善——Tinder滑动+露出标签+跳过原因+目标指示器+spring物理
  topic-lifecycle         🔄 主题生命周期——11/12场景完成，仅余场景6(收获追问)+12(冷启动种子)依赖proactive/onboarding
  ai-companion-window     🔄 AI伴侣窗口——~15/20场景完成（三态+状态机+工具可视化+输入栏+心情注入+闲聊生成），余语言切换+深度思考后端+多模态上传
  domain-vocabulary       🟡 领域词库——冷启动领域选择+专业名词RAG+语音修正

  ※ design-visual-alignment 是纯前端工作，不阻塞后端，应最先启动
  ※ topic-lifecycle 后端数据源从 v1 graph 算法 → v2 Tier2 批量分析输出
  ※ ai-companion-window 前端已有雏形（features/ai-bubble/ai-window.tsx 54行），需升级为三态状态机
  ※ app-mobile-redesign 功能缺口: 发现页(依赖topic-lifecycle)、AI Window(依赖ai-companion-window)
  ※ 其余前端 spec 不受认知引擎重构影响

Phase 7.5: 前后端闲置修复（2026-03-28 审计发现）

  Phase 7.5 内部依赖：
  discovery-page ──依赖──→ topic-lifecycle（后端 /topics API）
  daily-review-redesign ──依赖──→ daily-loop（后端 briefing/summary API）
  todo-subtask ──依赖──→ smart-todo（todo 基础模型）
  auth-session ──无依赖──→ 独立实施
  empty-state-guide ──依赖──→ 各功能页面基本完成

  discovery-page          ✅ 发现页overlay——overlay+筛选pills+卡片+空状态引导
  auth-session            ✅ 登出与会话——后端logout调用+token auto-refresh+前端logout清理
  daily-review-redesign   ✅ 每日回顾重构——卡片横滑+分页点+动态卡片构建
  todo-subtask            ✅ 子任务树（后端+DB）——todo.parent_id+LATERAL子查询+REST API，前端展示待补
  empty-state-guide       ✅ 空状态引导——待办/统计/侧边栏/发现 4页温暖引导

Phase 8: 设计对齐（2026-03-28 全量设计图审计 + 全链路测试发现）

  Phase 8 来源：21张设计图逐张对比 + 156条flomo导入全链路测试
  依赖：Phase 7/7.5 基本完成

  journal-card-insight    🟡 日记卡片AI分析——展开后显示要点/行动区域+"和路路聊聊这条"按钮
  cognitive-stats-redesign 🟡 认知统计重构——极性分布图+Top Clusters替换录音/待办趋势图
  todo-subtask-ui         🟡 子任务前端UI——Detail Sheet内子任务列表+添加+完成联动
  discovery-insights      🟡 发现页AI洞察——"路路的发现"趋势卡片区域
  cluster-prompt-tuning   ✅ 聚类prompt调优——Step A纯聚类prompt + qwen3.5-plus + 9 Cluster + 68.7%覆盖率
  cognitive-structure-repair ✅ 认知结构修复v2——统一task模型 + Goal迁移(345→53) + 聚类重跑(68.7%) + Todo关联(56%) + L3侧边栏 + 前端分组
  date-format-alignment   🟡 日期格式对齐——"今天·3月28日"替换"28 3月 周六"
  auth-input-style        🟡 登录注册输入框——下划线式替换填充圆角式
  chat-mic-button         🟡 聊天麦克风按钮——输入栏添加mic图标
  ui-polish               🟡 UI细节打磨——进度条/跳过语义/空状态0·0/侧边栏精简/红点

  ※ journal-card-insight 是核心体验差距，设计图09的关键区域
  ※ cognitive-stats-redesign 工作量最大，需重写统计页
  ※ date-format-alignment + auth-input-style + chat-mic-button 是快速见效项
  ※ ui-polish 合并5个P2小项，可逐个渐进修复

Phase 6: 补充能力（不变）
  goal-granularity        ✅ 目标粒度
  goal-auto-link          ✅ 目标自动关联
  goals-scaffold          ✅ 目标前端骨架
  action-tracking         ✅ 行动追踪
  knowledge-lifecycle     ✅ 知识生命周期（supersede 逻辑并入 Tier2 输出）
  person-profile          ✅ 人物画像系统
  decision-template       ✅ 决策模板涌现

Phase 6+: 增强与扩展
  harmony-support         🟡 鸿蒙适配
  external-integration    🟡 外部数据源集成
```

## Spec 统计

| Phase | Spec 数 | 场景数 | 状态 |
|-------|---------|--------|------|
| Phase 0 | 2 | 21 | 🔵 开发中 |
| Phase 1 | 3 | 16 | ✅→🔄 v2重构中 |
| Phase 2 | 2 | 11 | ✅ |
| Phase 2.5 | 3 | 30 | ✅ |
| Phase 3 | 2 | 10 | ✅→🔄 v2重构中 |
| Phase 4 | 4 | 31 | ✅ |
| Phase 5 | 4 | 24 | ✅ |
| Phase 6 | 7 | 40 | ✅ |
| Phase 7 | 6 | 88 | 🔄 |
| Phase 7.5 | 5 | 30 | ✅ |
| Phase 8 | 10 | ~50 | 🔄 2/10完成 |
| Phase 6+ | 2 | 19 | 🟡 |
| **总计** | **41** | **342** | |

## v2 重构文件变更清单

### 新建
| 文件 | 说明 |
|------|------|
| `gateway/src/cognitive/batch-analyze.ts` | Tier2 核心：单次 AI 调用 + DB 写入 |
| `gateway/src/cognitive/batch-analyze-prompt.ts` | Tier2 prompt 构建 |
| `gateway/src/db/repositories/snapshot.ts` | cognitive_snapshot CRUD |
| `supabase/migrations/029_cognitive_snapshot.sql` | snapshot 表 |

### 删除（v1 多步管线）
| 文件 | 原功能 | v2 替代 |
|------|--------|---------|
| `gateway/src/cognitive/clustering.ts` | 三角闭合+BFS聚类 | Tier2 prompt 指令 |
| `gateway/src/cognitive/clustering-prompt.ts` | 聚类审核 prompt | 合并到 batch-analyze-prompt |
| `gateway/src/cognitive/emergence.ts` | 跨聚类分析+共振+模式 | Tier2 一次性输出 |
| `gateway/src/cognitive/l2-emergence.ts` | L2 层级涌现 | Tier2 prompt 层级指令 |
| `gateway/src/cognitive/contradiction.ts` | 矛盾扫描 | Tier2 contradictions 字段 |
| `gateway/src/cognitive/promote.ts` | 语义融合 | Tier2 supersedes 字段 |
| `gateway/src/cognitive/tag-sync.ts` | 标签反写 | Tier2 cluster_tags 字段 |

### 修改
| 文件 | 改动 |
|------|------|
| `gateway/src/handlers/digest.ts` | 删除 Step 5-6（跨链AI调用），删除 Step 9（异步clustering），添加 Tier2 触发检查 |
| `gateway/src/cognitive/daily-cycle.ts` | 8步→3步：batch-analyze + maintenance + report |
| `gateway/src/routes/cognitive-stats.ts` | /cognitive/cycle → /cognitive/batch-analyze |
| `gateway/src/db/repositories/index.ts` | 导出 snapshotRepo |

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

### 保留不变
| 文件 | 原因 |
|------|------|
| `gateway/src/handlers/digest.ts` (Tier1部分) | Strike 分解 + todo 投影不变 |
| `gateway/src/cognitive/todo-projector.ts` | intend→todo/goal 投影不变 |
| `gateway/src/cognitive/goal-auto-link.ts` | Strike→Goal 增量关联不变 |
| `gateway/src/cognitive/goal-linker.ts` | Goal 健康度+状态流转不变（涌现入口改为 Tier2 输出） |
| `gateway/src/cognitive/maintenance.ts` | Bond/salience 衰减仍需要 |
| `gateway/src/cognitive/alerts.ts` | 认知提醒保留 |
| `gateway/src/cognitive/report.ts` | 认知报告保留 |
| `gateway/src/cognitive/retrieval.ts` | 混合检索保留（Chat 对话用） |

## 页面层级与导航结构

### 平台分流

```


## 已完成 Spec 列表

- `strike-extraction.md` — ✅ Phase 1 规则引擎实现
- `source-type-weight.md` — ✅ v1完成 → v2中降权逻辑移入 Tier2 prompt
- `cold-start-bonds.md` — ✅ v1完成 → v2中并入 Tier2 冷启动
- `cluster-tag-sync.md` — ✅ v1完成 → v2中并入 Tier2 输出
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

## 剩余（需用户配合）

- 像素小鹿 sprite sheet（等用户制作，代码已降级为 emoji）
- 多语言 ASR（暂缓）

## 剩余（后续迭代）

### Phase 7.5: 前后端闲置修复（2026-03-28 审计新增，5 spec / 30 场景）— ✅ 全部完成
- `discovery-page.md` — ✅ 发现页 overlay
- `auth-session.md` — ✅ 登出与会话管理
- `daily-review-redesign.md` — ✅ 每日回顾重构
- `todo-subtask.md` — ✅ 子任务树（todo.parent_id + 统一模型 level 字段）
- `empty-state-guide.md` — ✅ 空状态引导

### 其他剩余
- domain-vocabulary: 修正高亮UI + 自动收录 + AI生成词库
- ai-companion-window: 语言切换 + 多模态上传
- topic-lifecycle: 冷启动种子数据
- `external-integration.md` — 🟡 概念级设计阶段
- `harmony-support.md` — ⏸ 暂缓

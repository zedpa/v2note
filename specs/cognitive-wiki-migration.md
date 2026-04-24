---
id: "cognitive-wiki-migration"
status: active
domain: cognitive
risk: high
dependencies: ["cognitive-wiki-core.md", "cognitive-wiki-lifecycle.md"]
superseded_by: null
created: 2026-04-17
updated: 2026-04-24
---

# 认知 Wiki — 依赖、接口与实施阶段

> 本文件是 `cognitive-wiki.md` 的拆分子域，承载：依赖 + 接口约定 + 砍掉的模块 + Implementation Phases（含 Batch 3/4） + 备注
> 姊妹文件：
> - `cognitive-wiki-core.md` — 概述 + 数据模型 + 实时 Ingest + 每日编译
> - `cognitive-wiki-lifecycle.md` — 搜索 / 热力与生命周期 / 前端适配 / 迁移策略 / 验收行为 / 边界条件

## 依赖

### 直接依赖
- `todo-core.md`（050a）：待办抽取逻辑保留，但 todo.strike_id 改为 todo.source_record_id
- `topic-lifecycle.md`（099）：前端场景需按本 spec 第 5 节重写数据源
- `chat-system.md`（051）：参谋上下文检索从 strike 切换到 wiki page

### 需要重写的已完成 Spec（变更影响）
- `strike-extraction.md`（098）→ 被本 spec 取代（superseded）
- `cognitive-engine-v2.md`（067）→ 被本 spec 取代
- `emergence-lifecycle.md`（078）→ 被本 spec 取代
- `cluster-tag-sync.md`（066）→ 被本 spec 取代
- `cognitive-snapshot.md`（068）→ 快照机制由 wiki page 自身状态替代
- `goal-auto-link.md`（083）→ 改为编译时 goal_sync 替代
- `source-type-weight.md`（097）→ material 降权原则保留，机制改变

### 受影响的文件（完整依赖审计）

**需要重写的文件**：
| 文件 | 原依赖 | 新逻辑 |
|------|--------|--------|
| `gateway/src/handlers/digest.ts` | Strike 拆解 | 轻量 ingest（intend 抽取 + pending_compile） |
| `gateway/src/handlers/digest-prompt.ts` | Strike 提取 prompt | intend-only prompt |
| `gateway/src/cognitive/batch-analyze.ts` | Tier2 聚类 | 废弃，合并到每日编译 |
| `gateway/src/cognitive/batch-analyze-prompt.ts` | 聚类 prompt | 废弃 |
| `gateway/src/cognitive/emergence.ts` | L2 涌现 | 废弃 |
| `gateway/src/cognitive/goal-auto-link.ts` | Strike→Goal 关联 | 编译时 goal_sync |
| `gateway/src/cognitive/todo-projector.ts` | Strike→Todo 投射 | Record→Todo 直接投射 |
| `gateway/src/tools/search.ts` | Strike 搜索 | Wiki + Record 双层搜索 |
| `gateway/src/routes/topics.ts` | Cluster 查询 | Wiki page 查询 |
| `gateway/src/context/loader.ts` | Strike 上下文加载 | Wiki page 上下文加载 |

**需要适配字段重命名的文件**（cluster_id → wiki_page_id）：
| 文件 | 说明 |
|------|------|
| `gateway/src/db/repositories/goal.ts` | 新增 wiki_page_id 字段 |
| `gateway/src/routes/records.ts` | 筛选参数 cluster_id → wiki_page_id |
| `features/sidebar/` | 主题列表数据源 |
| `features/workspace/` | 生命周期视图数据绑定 |
| `shared/lib/types.ts` | Topic/Lifecycle 类型定义 |

**迁移后只读、最终废弃的文件**：
| 文件 | 说明 |
|------|------|
| `gateway/src/db/repositories/strike.ts` | 只读查询（迁移 + 兼容期） |
| `gateway/src/db/repositories/bond.ts` | 只读查询（迁移 + 兼容期） |
| `gateway/src/db/repositories/snapshot.ts` | 快照由 wiki page 替代 |
| `gateway/src/cognitive/embed-writer.ts` | Strike embedding 部分废弃，新增 wiki page embedding |
| `gateway/src/cognitive/knowledge-lifecycle.ts` | 知识生命周期由 wiki 替代 |
| `gateway/src/cognitive/maintenance.ts` | cluster 维护逻辑废弃 |

---

## 接口约定

### 新增表

```sql
CREATE TABLE wiki_page (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary TEXT,
  parent_id UUID REFERENCES wiki_page(id),
  level INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived','merged')),
  merged_into UUID REFERENCES wiki_page(id),
  domain TEXT,
  embedding vector(1024),
  metadata JSONB DEFAULT '{}',
  compiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 热力分数（每日计算更新）
ALTER TABLE wiki_page ADD COLUMN heat_score REAL DEFAULT 0;
ALTER TABLE wiki_page ADD COLUMN heat_phase TEXT DEFAULT 'active'
  CHECK (heat_phase IN ('hot','active','silent','frozen'));

CREATE INDEX idx_wiki_page_user ON wiki_page(user_id) WHERE status = 'active';
CREATE INDEX idx_wiki_page_parent ON wiki_page(parent_id);
CREATE INDEX idx_wiki_page_heat ON wiki_page(user_id, heat_phase) WHERE status = 'active';

-- Record ↔ Wiki Page 关联表（替代 UUID[] 避免无界增长）
CREATE TABLE wiki_page_record (
  wiki_page_id UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (wiki_page_id, record_id)
);
CREATE INDEX idx_wpr_record ON wiki_page_record(record_id);

-- 知识活动事件表（轻量级 append-only，90 天后可清理）
CREATE TABLE wiki_page_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_page_id UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('compile_hit','search_hit','view_hit','chat_context_hit')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_wpe_page_time ON wiki_page_event(wiki_page_id, created_at DESC);
CREATE INDEX idx_wpe_cleanup ON wiki_page_event(created_at); -- 用于定期清理 90 天前数据
```

### 现有表修改

```sql
-- goal 表新增
ALTER TABLE goal ADD COLUMN wiki_page_id UUID REFERENCES wiki_page(id);

-- todo 表修改
-- source_record_id 已存在；wiki_page_id 通过 goal 间接关联，不需要直接字段

-- record 表新增
ALTER TABLE record ADD COLUMN compile_status TEXT DEFAULT 'pending'
  CHECK (compile_status IN ('pending', 'compiled', 'skipped', 'needs_recompile'));
ALTER TABLE record ADD COLUMN content_hash TEXT; -- SHA256，用于增量去重
ALTER TABLE record ADD COLUMN embedding vector(1024); -- record 级别向量，用于编译路由和搜索
CREATE INDEX idx_record_compile_pending ON record(user_id)
  WHERE compile_status IN ('pending', 'needs_recompile');

-- 编译日志表（变更摘要，供早报/审计用）
CREATE TABLE wiki_compile_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  compiled_at TIMESTAMPTZ DEFAULT now(),
  record_count INTEGER NOT NULL,     -- 本次编译的 Record 数
  pages_created INTEGER DEFAULT 0,
  pages_updated INTEGER DEFAULT 0,
  pages_split INTEGER DEFAULT 0,
  pages_merged INTEGER DEFAULT 0,
  new_contradictions INTEGER DEFAULT 0,
  goal_changes JSONB DEFAULT '[]',   -- [{goal_id, action, title}]
  summary TEXT                       -- AI 生成的一句话变更摘要
);
```

### 新增 API

```
POST /api/v1/wiki/compile
  → 手动触发 wiki 编译（管理端 / 调试用）
  请求: { user_id: string }
  响应: { pages_updated: number, pages_created: number, pages_split: number, pages_merged: number }

GET /api/v1/wiki/pages
  → 获取用户的 wiki page 列表（用于侧边栏 / 搜索）
  响应: [{ id, title, summary, level, parent_id, domain, has_active_goal, heat_score, heat_phase, updated_at }]

GET /api/v1/wiki/pages/:id
  → 获取单个 wiki page 完整内容
  响应: { id, title, content, summary, level, children: [...], goals: [...], source_records: [...] }

GET /api/v1/wiki/heatmap
  → 获取用户的知识热点地图数据
  响应: [{
    id: string,
    title: string,
    heat_score: number,
    heat_phase: 'hot' | 'active' | 'silent' | 'frozen',
    domain: string,
    level: number,
    parent_id: string | null,
    has_active_goal: boolean,
    last_activity: string
  }]

GET /api/v1/search
  → 统一搜索（wiki + record 双层）
  请求: ?q=关键字&user_id=xxx
  响应: {
    wiki_results: [{ page_id, title, matched_section, summary }],
    record_results: [{ record_id, snippet, created_at }]
  }
```

### 修改 API

```
GET /api/v1/topics
  → 后端数据源从 Cluster 切换为 wiki_page，响应结构适配：
  响应: [{
    wikiPageId: string,        // 替代原 clusterId
    title: string,             // wiki_page.title
    recordCount: number,       // wiki_page_record 关联数（替代原 memberCount）
    activeGoals: [{ id, title }],
    lastActivity: string,      // wiki_page.updated_at
    hasActiveGoal: boolean,
    level: number,             // wiki page level
    parentId: string | null,   // 父页 ID
    heatScore: number,         // 热力分数
    heatPhase: 'hot' | 'active' | 'silent' | 'frozen'
  }]

GET /api/v1/topics/:id/lifecycle
  → 后端数据源切换：
    - now/growing: 从 goal.wiki_page_id 查询
    - seeds: 从 wiki page content 解析
    - harvest: 从 completed goal + wiki page 收获段落

GET /api/v1/records?cluster_id=xxx
  → 改为 ?wiki_page_id=xxx，通过 wiki_page_record 关联 + embedding 双重匹配
```

---

## 砍掉的模块（迁移后废弃）

| 模块 | 文件 | 说明 |
|------|------|------|
| Strike 拆解 | `gateway/src/handlers/digest.ts` | 替换为轻量 ingest（只抽 intend） |
| Digest Prompt | `gateway/src/handlers/digest-prompt.ts` | 替换为 wiki compile prompt |
| Batch Analyze | `gateway/src/cognitive/batch-analyze.ts` | 合并到每日编译 |
| Batch Analyze Prompt | `gateway/src/cognitive/batch-analyze-prompt.ts` | 合并到每日编译 |
| L2 Emergence | `gateway/src/cognitive/emergence.ts` | 自顶向下拆分替代 |
| Cross-link Prompt | `digest-prompt.ts` 中的 `buildCrossLinkPrompt` | wiki page 天然包含交叉引用 |
| Strike Repository | `gateway/src/db/repositories/strike.ts` | 迁移后只读 |
| Bond Repository | `gateway/src/db/repositories/bond.ts` | 迁移后只读 |
| Embed Writer（Strike 部分） | `gateway/src/cognitive/embed-writer.ts` | 改为 wiki page embedding |

---

## Implementation Phases (实施阶段)

### Batch 1: 核心管线（必做，让 Wiki 编译跑通取代 Strike）

> 目标：用户录入 → 待办实时抽取 → 每日编译到 wiki page → 前端能看到
> 涉及场景：1.1-1.3, 2.1(基础版)-2.3, 3.1-3.8, 4.1-4.2, 5.1-5.10, 6.1-6.2

- [x] **Phase 1: 数据模型**
  - wiki_page 表（不含 heat_score/heat_phase，Batch 2 加）
  - wiki_page_record 关联表
  - goal.wiki_page_id 字段
  - record.compile_status 字段 + 索引
  - wiki_page repository CRUD
  - wiki_page_record repository

- [x] **Phase 2: Ingest 改造**
  - digest.ts 简化：去掉 Strike 拆解，只保留 intend 抽取
  - Record 入库后标记 pending_compile
  - 生成 record embedding（整条向量化，替代逐 strike 向量化）
  - 外部素材标记 material

- [x] **Phase 3: 编译引擎**
  - wiki compile prompt 设计（content 格式规范、AI 指令）
  - 两阶段检索：embedding 路由 → 加载命中 page 全文
  - AI 调用 + JSON 解析
  - 编译指令执行（update/create/split/merge/goal_sync）
  - DB 事务保证 + 失败回滚（场景 3.8）
  - 编译后处理（embedding 更新、compiled_at、record 状态）
  - 冷启动逻辑（场景 3.7）
  - 定时任务接入（3AM cron）
  - 手动触发 API（POST /api/v1/wiki/compile）

- [x] **Phase 4: 搜索改造**
  - wiki page 全文搜索（content 关键字匹配）
  - wiki page 向量搜索（embedding 相似度）
  - Record 全文搜索（保持现有）
  - 统一搜索 API（GET /api/v1/search，双层返回）
  - Chat 参谋上下文加载从 strike → wiki page

- [x] **Phase 5: 前端适配**
  - GET /api/v1/topics 数据源切换（Cluster → wiki_page）
  - GET /api/v1/topics/:id/lifecycle 数据源切换
  - Seeds 渲染改造(Strike 卡片 → wiki 段落条目)
  - Harvest 渲染改造（回顾 Strike → wiki 收获段落）
  - 筛选参数 cluster_id → wiki_page_id
  - 类型定义更新（shared/lib/types.ts）

- [x] **Phase 6: 数据迁移 + 清理**
  - Strike/Cluster → wiki page 一次性迁移脚本
  - goal.cluster_id → goal.wiki_page_id 映射
  - 兼容期 feature flag
  - 观察 2 周后废弃 strike 相关代码路径
  - 旧表归档（只读保留）

### Batch 2: 增强能力（后续迭代，基础设施上叠加智能）

> 前提：Batch 1 完成，Wiki 编译管线已稳定运行
> 涉及场景：1.4, 2.1(确定性预抽取), 1.2(置信度标签), 3.6(变更摘要), 3.9-3.10, 4b.1-4b.6

- [x] **Phase 7: 知识热力系统** ✅ 2026-04-24
  - wiki_page 加 heat_score / heat_phase 字段（migration 072）
  - wiki_page_event 事件表（append-only，90天清理）
  - 4 个触碰点埋点：compile_hit(wiki-compiler) / search_hit(wiki route) / view_hit(page detail) / chat_context_hit(advisor-context)
  - 每日热力计算（daily-cycle Step 3，指数衰减 λ=ln2/14d + goal_active_bonus）
  - 冰封判定（heat_score<1.0 → frozen phase）
  - GET /api/v1/wiki/heatmap 端点（pages + summary）
  - 防刷机制（同 page+type 每天最多 10 条）

- [ ] **Phase 8: 编译增强**
  - 确定性预抽取（正则提取日期/人名/金额，减少 AI token）
  - 置信度标签（[直述]/[推断]/[关联] 三级标注）
  - 编译变更摘要（wiki_compile_log 表 + 早报引用）
  - content_hash 增量去重

- [ ] **Phase 9: 知识维护**
  - Record 删除 → wiki 清理（场景 3.9，needs_recompile）
  - 聊天反馈循环（场景 3.10，有价值对话回流 wiki）
  - Domain 自动分类规则（场景 1.4）

- [ ] **Phase 10: 可视化**
  - 个人热点地图 UI（场景 4b.6）
  - 知识生命周期仪表盘
  - 编译历史查看

---

## 备注

- **Batch 划分原则**：Batch 1 是"让新管线替代旧管线"的最小可行集；Batch 2 是"让新管线变得更聪明"的增强层。Batch 1 完成后系统已可用，Batch 2 的每个 Phase 可独立上线，不互相依赖
- 本 spec 是 `risk: high` 变更，涉及核心数据模型重构，Batch 1 每个 Phase 需用户确认
- topic-lifecycle.md（099）需要按本 spec 第 5 节逐场景适配，场景 5/6/7/9 需要行为重写，不是简单换数据源
- strike-extraction.md（098）将被本 spec 取代（status → superseded）
- cognitive-engine-v2.md（067）、emergence-lifecycle.md（078）、cluster-tag-sync.md（066）将被本 spec 取代
- 每日编译的 AI 调用成本预估：每用户每天 1 次，阶段 A 路由无 AI 成本，阶段 B 输入 ~5000-20000 tokens，输出 ~3000-10000 tokens
- content 字段用 markdown 是因为 LLM 读写 markdown 最自然，同时对人也可读
- 编译整体在单个 DB 事务中执行，保证原子性（详见场景 3.8）
- 参考项目：[Graphify](https://github.com/safishamsi/graphify) — 借鉴了内容寻址缓存、确定性优先抽取、置信度标签、递归拆分、查询反馈循环、变更审计等模式
- 参考文档：[LLM Wiki Pattern](https://gist.github.com/442a6bf555914893e9891c11519de94f) — 整体架构灵感来源

降低人的手动录入

### 核心架构演进（Batch 4 后）

```
一切皆 Page：
  Page（容器）
  ├── domain page (L3) — 自然涌现，不硬编码
  │   ├── topic page (L2) — 编译后拆分产生
  │   └── goal page (L2, page_type='goal') — 长期目标
  │       ├── todo（具体步骤）
  │       ├── 日记（相关记录）
  │       └── 素材（参考资料）
  └── 收件箱 — 未分类的 record

  编译 = 压缩：
  token < 5000 → 不编译，展示原文
  token ≥ 5000 → 触发压缩编译，结果写入 page.content
  page.content 臃肿 → 拆分为子页，parent 只存索引摘要

  目标提取 = 单链路：
  digest 只提取 action（简单待办）
  goal 统一由 wiki compile 的 goal_sync 创建
  判断标准：不是一次能做完的事 → goal
```

---

## Batch 3: Wiki Page 统一组织层（Strike 全面退役 + Domain 退场）

> 目标：Wiki Page 成为唯一组织单元（文件夹 + 主题 + 知识 + 未来 Obsidian vault 映射）
> 设计原则：简单系统 > 功能系统。一棵树，一个概念，一个入口。
> 所有权规则：用户创建/改名的 page → created_by='user'，AI 不可修改其标题和层级；AI 创建的 page → AI 可修改，用户改名后变为 'user'

### Phase 11: Wiki Page 接管组织层（P0 — 用户直接感知）

- [ ] **11.1 数据模型增强**
  - wiki_page 新增 `created_by TEXT NOT NULL DEFAULT 'ai'`（'user' | 'ai'）
  - 用户手动创建/改名 page 时 created_by 设为 'user'

- [ ] **11.2 Digest 移除 domain 分配**
  - digest-prompt.ts 移除 domain 相关 prompt 段落
  - digest.ts 不再调用 recordRepo.updateDomain
  - record.domain 字段保留但不再写入（向后兼容）

- [ ] **11.3 hierarchy_tags 数据源切换**
  - tag-projector.ts 重写：从 wiki_page_record → wiki_page.title 获取标签
  - 不再查询 strike/bond/cluster 表
  - 标签内容 = record 所属 wiki page 的 title，level = page.level

- [ ] **11.4 侧边栏改造**
  - 后端：新增端点返回 wiki page 树（含 record count + active goal count）
  - 前端：sidebar-drawer 渲染 wiki page 树 + 收件箱（未编译 record）
  - 收件箱：纯时间排列，不做自动分类
  - 用户可手动在日记中写 `#wiki-page-name` 归入特定 page

- [ ] **11.5 Goal 子标题**
  - Goal 卡片下方显示关联 wiki page title
  - 后端：goal 查询时 JOIN wiki_page 获取 title
  - 前端：todo-workspace-view / goal-list 渲染子标题

- [ ] **11.6 note-card 标签切换**
  - note-card 的 hierarchy_tags 改为从 wiki page 获取
  - 移除 strike-preview 组件的渲染（保留代码，Phase 13 清理）

### Phase 12: 停用 Strike 引擎（P1 — 后台简化） ✅ 2026-04-11

- [x] **12.1 Daily Cycle 简化**
  - 移除 runBatchAnalyze() 调用
  - 移除 runEmergence() 调用
  - 移除 maintenance（normalizeBondTypes / decayBondStrength / decaySalience）调用
  - 新增：每日触发 wiki compile（替代 batch-analyze 的编译职责）

- [x] **12.2 认知报告重写**
  - report.ts 数据源从 strike/bond/cluster 切换到 wiki page + record
  - today_strikes → today_records（今日新增 record 数）
  - contradictions → wiki page 中「矛盾/未决」段落
  - cluster_changes → wiki_changes（今日新建/更新的 wiki page）
  - behavior_drift → 保持不变（todo 完成率）

### Phase 13: 前端展示迁移 + 代码清理（P2） ✅ 2026-04-11

- [x] **13.1 Strike 相关前端组件**
  - strike-preview.tsx → 已删除（note-card 不再渲染 strikes）
  - use-strikes.ts → 已删除
  - life-map.tsx → 已删除（无引用的死代码）
  - cluster-detail.tsx → 已删除（无引用的死代码）
  - use-cognitive-map.ts → 已删除
  - stats-dashboard.tsx → 已删除（无引用的死代码）
  - domain-config.ts → 标记 @deprecated，保留 UI 兼容

- [x] **13.2 后端代码清理**
  - daily-cycle.ts 不再 import batch-analyze / emergence / maintenance
  - cognitive-stats.ts 路由改为查 wiki page 数据，/cognitive/compile 替代 /cognitive/batch-analyze
  - strike 路由返回空数据/410，标记 @deprecated
  - cluster 路由返回空数据/410，标记 @deprecated
  - goals.ts 移除 debug-emergence / emergence / backfill 路由

- [x] **13.3 Domain 退场**
  - domain-config.ts 标记 @deprecated
  - 侧边栏已不读取 domain 数据
  - digest prompt 已不含 domain 概念（Phase 11 完成）
  - listUserDomains / batchUpdateDomain 保留（folder-tools 仍活跃使用 record.domain）

---

## Batch 4: 统一 Page 模型（Domain 即 Page + 编译即压缩 + Goal Page）

> 目标：一切皆 Page。Domain、主题、知识、目标统一为 Page 树。日记 + Todo 是原子单位。
> 核心改变：
> - Domain 不再是 text 字段，而是 L3 wiki page 本身（自然涌现，不硬编码）
> - 编译 = 压缩（token < 5000 不编译，直接展示原文；≥ 5000 触发压缩编译）
> - Goal = 特殊类型的 Page（多步骤长周期意图升级为 Goal Page）
> - 目标提取统一为 wiki compile 一条链路（废弃 digest 阶段的 goal/project 提取）
> - @domain/path 语法让用户手动路由内容
> - AI 结构建议通过通知征求用户授权

### Phase 14: 统一 Page 模型 — 核心架构（P0）

#### 14.1 数据模型变更

```
假设 (Given)  wiki_page 表已存在
当   (When)   执行 Phase 14 迁移
那么 (Then)   新增/修改以下字段：
  - wiki_page 新增 page_type TEXT DEFAULT 'topic' CHECK IN ('topic', 'goal')
    - 'topic': 普通主题 page（日记聚合 + 编译总结）
    - 'goal': 目标 page（多步骤长周期目标，下面挂 todo + 日记 + 素材）
  - wiki_page 新增 token_count INTEGER DEFAULT 0
    - 记录该 page 下所有未编译日记的总 token 数（用于触发编译阈值判断）
    - 更新时机：Record 通过 wiki_page_record 挂载到 page 时，累加该 record 的 token 数
    - 编译完成后重置为 0（已编译内容进入 page.content，新 record 重新累加）
  - wiki_page 新增 created_by TEXT DEFAULT 'ai' CHECK IN ('ai', 'user')
    - 标记 page 创建者，用于分级授权（14.7）
  - record 表新增 source_type 值：'ai_diary'（AI 交互摘要，与 'voice'/'text' 同级）
  - record.metadata 新增 target_path 字段（存 @路由解析结果）
  - record.metadata 新增 classified_path 字段（存轻量分类结果）
  - 新增 wiki_page_link 表（跨页链接）：
    { source_page_id, target_page_id, link_type, context_text, created_at }
    - link_type CHECK IN ('reference', 'related', 'contradicts')
    - UNIQUE(source_page_id, target_page_id, link_type) — 同方向同类型不重复
    - source/target FK ON DELETE CASCADE — page 归档/删除时链接自动清理
并且 (And)    todo 表关联变更（软约束，应用层校验，不加 DB CHECK）：
  - goal（level>=1）的 wiki_page_id 应指向 page_type='goal' 的 page
  - action（level=0）的 parent_id 指向 goal todo，间接关联到 goal page
  - 现有数据中 wiki_page_id 指向 topic page 的记录保留，迁移时不强制修正（见 15.1）
```

#### 14.2 废弃 Digest 阶段的 Goal 提取

```
假设 (Given)  当前 digest-prompt.ts 提取 action/goal/project 三种粒度
当   (When)   实施 Phase 14
那么 (Then)   digest prompt 只保留 action 粒度：
  - 移除 granularity: "goal" | "project" 的提取逻辑
  - todo-projector.ts 中创建 goal 的分支移除
  - Goal 统一由 wiki compile 的 goal_sync 创建
并且 (And)    Goal 判断标准（在 wiki compile prompt 中明确）：
  - 不是一次能做完的事 → goal（如"通过四级考试""今年减重10kg""完成毕业论文"）
  - 一次能做完的事 → action（如"明天下午3点开会""买牛奶""给张总打电话"）
  - 区分关键：是否需要多步骤、长周期、持续投入
并且 (And)    Goal 创建时自动创建对应的 goal page（page_type='goal'）
```

#### 14.3 @路由语法实现

```
假设 (Given)  用户在日记中使用 @domain/subdomain 语法
当   (When)   Record 入库后进入 ingest 流程
那么 (Then)   正则解析 @路由（Step 1 确定性预抽取中执行）：
  - 正则：/@([\u4e00-\u9fa5a-zA-Z0-9_/]+)/g
  - 提取第一个匹配作为 target_path
  - 存入 record.metadata.target_path
并且 (And)    自动创建不存在的 page：
  - "@工作" → 检查 L3 "工作" 是否存在，不存在则创建空 L3 page（created_by='user'）
  - "@工作/采购" → 确保 L3 "工作" 和 L2 "采购" 都存在
  - 自动创建的 page 标记 created_by='user'（因为是用户主动指定的路径）
并且 (And)    立即建立 wiki_page_record 关联（不等编译）
并且 (And)    编译时该 Record 跳过 embedding 路由，直接归属到目标 page
```

#### 14.4 异步轻量分类（Title 立即生成）

```
假设 (Given)  用户录入日记，Record 入库，没有 @路由
当   (When)   Record 创建完成
那么 (Then)   异步触发轻量 AI 分类（不阻塞用户继续录音）：
  
  **这是"编译分两部分"的第一部分 — Title/路由（立即）**：
  输入：Record 文本（截断到 200 字）+ 所有现有 page 的 title 列表（含层级）
  输出：{ domain_title: string, page_title?: string }
     - domain_title: 归属的 L3 page title（已有的或建议新建的）
     - page_title: 更具体的 L2 归属（可选）
  
  处理逻辑：
  1. 如果匹配到已有 L3 page → 立即建立 wiki_page_record 关联
  2. 如果匹配到已有 L2 page → 直接关联到 L2
  3. 如果 domain_title 是新的 → 创建新 L3 page（created_by='ai'），然后关联
  4. 用户体感：录完音几秒后，侧边栏 page 树中该日记就出现在正确位置
  
  **第二部分 — Content 编译（异步 + 按规则触发）**：
  - 见场景 14.5（token ≥ 5000 时触发）
  - 见场景 14.9（每日 3AM 全量维护编译）
  
并且 (And)    token 预算：输入 < 500 tokens，输出 < 100 tokens（用 haiku 级模型）
并且 (And)    调用失败不影响 Record 入库（分类非关键路径，降级为等编译时分类）
并且 (And)    已有 @路由的 Record 跳过轻量分类
```

#### 14.5 编译阈值触发

```
假设 (Given)  某个 page 下的日记在持续增加
当   (When)   新日记挂载到 page 后，更新该 page 的 token_count
那么 (Then)   检查 token_count 是否 ≥ 5000：
  - 未达阈值 → 不编译，前端展示日记原文列表
  - 达到阈值 → 标记该 page 为"待编译"，触发编译流程
并且 (And)    编译完成后 token_count 重置为 0（已编译内容进入 page.content）
并且 (And)    后续新日记继续累加 token_count，再次达到阈值时触发增量编译
并且 (And)    每日 3AM 定时任务也会扫描并编译满足阈值的 page
```

#### 14.9 每日全量编译维护（3AM）

```
假设 (Given)  每日 3AM 定时任务触发
当   (When)   执行全量编译维护
那么 (Then)   对每个用户执行以下操作（这是 content 编译的全量维护时段）：

  1. **日记编译**：扫描所有 page，token_count ≥ 5000 且未编译的 → 触发编译
  2. **Todo 状态同步**：检查 goal page 关联的 todo 完成状态变化 → 更新 page content
  3. **AI 交互素材分发**：将用户与 AI 的有价值对话摘要，作为素材挂载到对应主题的 page 下（同日记一样参与编译）
  4. **跨 page 结构优化**：AI 评估整体 page 树，生成拆分/合并建议
  5. **Link 发现**：检测跨 page 的语义关联，插入链接指针（见 14.11）

并且 (And)    这是唯一的全量编译时段，白天的编译都是单 page 级别的
并且 (And)    每日编译是 content 维护的核心，保证所有 page 的 content 处于最新状态
```

#### 14.10 AI 交互素材（AI Diary Record）

```
假设 (Given)  用户与 AI 参谋进行了有认知价值的对话（非闲聊）
当   (When)   每日 3AM 编译维护时
那么 (Then)   将有价值的对话摘要**作为素材 record**挂载到对应主题 page 下：
  - AI 交互摘要和用户日记是**同级素材**，都是 page 编译的输入
  - 内容来源：
    - 参谋对话中的 Q&A（AI 使用了工具或产生了新认知的对话）
    - AI 的编译变更摘要（今天整理了什么、发现了什么矛盾）
    - AI 对用户行为模式的观察（完成率、关注方向变化等）
  - 素材按主题归属到对应 page，编译时和日记一起压缩进 page.content
  - 如果对话涉及多个主题 → 拆分为多条素材，分别挂载
并且 (And)    record 表新增 source_type = 'ai_diary'，区分 AI 生成的素材
并且 (And)    AI 素材参与正常编译流程（page.content(旧) + 新素材 → page.content(新)）
并且 (And)    参谋对话检索上下文时，AI 素材和日记素材同等权重
并且 (And)    前端展示时可按 source_type 过滤，区分用户日记和 AI 观察
```

#### 14.11 Page 间链接（Cross-Link）

```
假设 (Given)  用户的知识分布在多个 page 中
当   (When)   AI 编译时发现跨 page 的语义关联
那么 (Then)   发现并存储跨页链接（结构化存储，非 content 内联标记）：
  - 存储方式：wiki_page_link 表（结构化 + 可查询，优于 content 内联文本标记）
  - 产生条件：
    a. 编译时 AI 看到全量 page 索引，发现"这条日记提到了另一个 page 的内容"
    b. 用户日记中 @引用了多个 page → 这些 page 之间形成关联
    c. 同一条日记被分类到 A page，但内容也涉及 B page 的主题
  - 链接方向：双向（A 提到 B 时，B 的下次编译也会标注与 A 的关联）

并且 (And)    链接存储：wiki_page_link 表
  { source_page_id, target_page_id, link_type('reference'|'related'|'contradicts'), context_text, created_at }
并且 (And)    link_type 分类：
  - 'reference'：A 内容直接引用了 B 的内容（如"与采购策略相关"）
  - 'related'：A 和 B 讨论了相关主题（AI 判断）
  - 'contradicts'：A 和 B 存在矛盾观点（AI 发现的认知矛盾）
并且 (And)    链接是编译的自然产物，不需要额外 AI 调用
并且 (And)    前端：page 内容中的链接可点击跳转
并且 (And)    后期认知地图中，链接构成节点间的边
```

#### 14.12 去除 Embedding 依赖（核心流程）

```
假设 (Given)  新架构中树形结构 + 关键字搜索已覆盖大部分检索场景
当   (When)   实施 Phase 14
那么 (Then)   核心流程不再依赖 embedding：
  - Record 入库不再生成 embedding（省掉 embedding 调用）
  - 日记路由：@语法 + 轻量 AI 分类（替代 embedding 匹配）
  - 搜索：关键字搜索 page title + content（PostgreSQL 全文索引）
  - Chat 参谋上下文：按 page 树检索 + 关键字匹配
  - 相关 page 发现：通过 wiki_page_link 表（编译时 AI 建立的链接）
并且 (And)    Embedding 降级为可选增强（Batch 5）：
  - 语义搜索（关键字搜不到但语义相关的内容）
  - 模糊匹配（用户表述和 page 用词不同但含义相近）
  - 当前保留 wiki_page.embedding 字段和 record.embedding 字段，但不强制生成
并且 (And)    降低每条 record 的入库成本（少一次外部调用 + 向量存储）
```

#### 14.6 Goal Page 概念

```
假设 (Given)  AI 在编译时发现用户表达了一个长期目标
当   (When)   通过 goal_sync 创建 goal
那么 (Then)   同时创建 goal page（page_type='goal'）：
  - page.title = 目标标题（如"通过四级考试"）
  - page 下可挂载：
    - todo（具体步骤）：通过 todo.parent_id → goal todo → goal page
    - 日记（相关记录）：通过 wiki_page_record
    - 素材（参考资料）：source_type='material' 的 record
  - goal page 的 content 编译逻辑同普通 page（对子级内容的总结）
  - goal page 额外包含目标进度信息（完成的 todo 数 / 总 todo 数）
并且 (And)    用户也可手动创建 goal page：
  - 前端提供"新建目标"入口
  - 创建空 goal page + 对应的 goal todo（level=1）
  - 用户在 page 下添加具体 todo 步骤
并且 (And)    goal page 在侧边栏中用特殊图标标识（⭐ 或进度条）
并且 (And)    goal page 完成（所有 todo 完成或用户手动标记）→ page 归入 harvest 区
```

#### 14.7 AI 结构管理 — 分级授权机制

```
假设 (Given)  AI 在编译时发现需要调整 page 结构（拆分/合并/重命名/删除）
当   (When)   目标 page 的 created_by = 'ai'
那么 (Then)   AI 可自主执行所有结构操作，无需用户授权：
  - 拆分：AI 创建的 page 内容臃肿 → 直接拆分
  - 合并：两个 AI 创建的 page 高度重叠 → 直接合并
  - 重命名：AI 认为 title 不准确 → 直接改
  - 删除：AI 创建的空 page 长期无内容 → 直接归档
  - 内容追加/修改：正常编译流程，自动执行

当   (When)   目标 page 的 created_by = 'user'
那么 (Then)   任何结构修改都必须通知用户获取授权：
  - 生成预编译方案（含结构调整）+ 保守方案（不调整）
  - 将预编译方案作为通知发送给用户
  - 通知内容：简要说明建议（如"'Q2采购' 内容涵盖了采购和供应商管理，建议拆分"）
  - 通知渠道：app 内通知 / 参谋聊天中询问
  - 用户确认 → 执行预编译方案
  - 用户拒绝 → 执行保守方案（只追加内容，不改结构）
  - 注意：向用户创建的 page 下**追加日记内容**不需要授权（这是正常编译）

并且 (And)    预编译方案存入 wiki_compile_suggestion 表：
  { id, user_id, suggestion_type, payload(JSON), status('pending'|'accepted'|'rejected'), created_at }
并且 (And)    用户也可在参谋聊天中主动授权 AI 修改 page 结构（"帮我整理一下工作 page"）
```

#### 14.8 Title 自然化规则

```
假设 (Given)  AI 需要为新 page 或 goal 生成 title
当   (When)   创建 wiki page 或 goal
那么 (Then)   title 遵循以下规则：
  - 自然语言命名，如同笔记本目录中的标题
  - 好的例子："Q2 采购策略"、"React 学习笔记"、"家庭装修计划"、"通过四级考试"、"供应链管理"
  - 坏的例子："工作管理"（太泛，像 domain 名不像 page 名）、"明天要和张总确认报价"（太长/临时）、"工生"（强行压缩）
  - L3 domain page title 可以简短："工作"、"思考"、"学习"（这是分类，允许宽泛）
  - L2/L1 topic page title 应具体自然："供应链优化"、"React Hook 实践"
  - goal page title = 目标本身："通过四级考试"、"今年减重10kg"
  - 移除旧的"2-8个中文字符"硬限制
```

### Phase 15: 现有数据迁移 + 前端适配（P1）

#### 15.1 现有 wiki page 迁移

```
假设 (Given)  系统中已有 153 个 wiki page（Batch 1-3 产出）
当   (When)   执行 Phase 15 迁移
那么 (Then)   保留现有数据，补充新字段：
  1. 所有现有 page 设 page_type = 'topic'
  2. 有关联 goal（wiki_page_id）的 page → 评估是否应转为 'goal' 类型
  3. 补充 token_count（统计关联的未编译 record 的 token 总数）
  4. domain 字段值与 L3 page title 对齐（确保一致性）
  5. 不重新编译已有 page，保留现有 content
  6. 所有现有 page 设 created_by = 'ai'（Batch 1-3 均为 AI 编译产出）
  7. 现有 todo.wiki_page_id 指向 topic page 的记录保留不动（应用层软约束，不加 DB CHECK）
```

#### 15.2 前端 Page 展示 — 文件夹模式

```
假设 (Given)  Page 是内容的容器
当   (When)   用户与 page 交互
那么 (Then)   page 表现为文件夹，不展示 page content 详情页：
  - 点击 page title → 展开/折叠，显示该 page 下的子 page 和日记列表
  - L3 page 点击 → 显示 L2 子页列表 + 直接挂载的日记
  - L2 page 点击 → 显示其下的日记列表
  - goal page 点击 → 显示 todo 列表 + 相关日记
  - 日记在 page 下按时间倒序排列
并且 (And)    page content（编译后的总结）当前不需要前端展示
  - content 是 AI 的内部知识库，用于搜索和参谋上下文
  - 后期通过认知地图等专门视图展示编译内容
并且 (And)    侧边栏 page 树结构：
  - 收件箱（未分类的 record）在顶部
  - L3 page = 一级文件夹
  - L2 page = 二级文件夹
  - goal page 用 ⭐ 图标标识
  - 文件夹旁显示未读日记数量角标
```

#### 15.3 wiki_compile_suggestion 表 + 通知 UI

```
假设 (Given)  AI 生成了结构建议
当   (When)   用户打开 app
那么 (Then)   侧边栏显示未处理的建议数量角标
并且 (And)    点击进入建议列表：
  - 每条建议：类型图标 + 简述 + 接受/拒绝按钮
  - 接受 → 调用 /api/v1/wiki/suggestion/:id/accept → 执行预编译方案
  - 拒绝 → 调用 /api/v1/wiki/suggestion/:id/reject → 执行保守方案
并且 (And)    参谋聊天中也可展示建议并获取确认（自然对话方式）
```

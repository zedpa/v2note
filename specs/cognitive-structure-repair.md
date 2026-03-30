# 认知结构修复 v2 — 统一数据模型 + L3 侧边栏

> 状态：✅ 已完成（后端模型+前端导航+domain回填）
> 优先级：P0（公测前必须完成）
> 来源：2026-03-29 全链路测试 + 2026-03-29 架构讨论
> 前序版本：v1（Goal 清理方案），本版本升级为统一数据模型方案
> 完成时间：2026-03-29
> 结果：Goal 345→53, Cluster 覆盖率 7%→68.7%, Todo 关联 0%→56%, AI_MODEL qwen3-max→qwen3.5-plus

## 问题诊断

```
当前数据：
  561 个 Strike → 只有 39 个(7%)被分配到 5 个 Cluster
  333 个 Goal  → 201 suggested + 138 active，大量重复碎片
   44 个 Todo  → 0 个关联到 Goal，全部平铺在 Today 下
    0 个 L3    → 顶层维度缺失

断裂链路：
  混沌输入 → Strike ──✅──→ Cluster ──❌ 7%覆盖──→ Goal ──❌ 0关联──→ Todo
                                                    ↑ 333个无去重

根因：
  1. Goal 和 Todo 分表 → 关联全靠 goal_id FK，但没有代码去设置它
  2. Goal 无去重 → batch-analyze 每次都创建新 Goal
  3. L3 维度缺失 → 没有顶层结构，无法分组展示
  4. Cluster 覆盖率低 → batch-analyze 的 prompt 聚类门槛太高
```

## 核心架构决策

### 决策 1: Goal 消解为 todo 表的 level>=1 行

**理由**: Goal 本质上是"不可直接执行的 todo"。分表导致关联断裂，合表后 parent_id 天然解决。

```
统一后的 todo 表：
  level=0  行动（checkbox，可完成）     ← 原 todo
  level=1  目标（进度条，含子行动）     ← 原 goal
  level=2  项目（卡片容器，含子目标）   ← 原 goal.parent_id 链

UI 按 level 选择渲染方式，数据在同一张表。
```

**显式 level 而非隐式推断**：
- "评估供应商"即使还没拆子任务，也应该是目标样式
- AI 创建时就知道这是方向还是动作，可以直接设 level
- 查询简单：`WHERE level=0` 就是所有可执行行动

### 决策 2: 复用 domain 字段作为 L3 维度

todo 表已有 `domain` 字段（migration 010），不新建 `dimension`。
统一用**中文值**（"工作"/"生活"/"学习"/"健康"/"投资"等）。
现有英文值（如 "work"）需在迁移时统一转换。

### 决策 3: done + status 并存

- level=0（行动）：用 `done` boolean，前端改动最小
- level>=1（目标/项目）：用 `status` enum（active/paused/completed/abandoned/progressing/blocked/suggested/dismissed）
- **代码约束**：当 status='completed' 时，同步 done=true，保持一致

### 决策 4: domain 字段在 L3 维度中的角色

- **dimension 是正确的建模方式**，不是因为 Bond 链路脆弱的权宜之计
- L3 维度（"工作"/"生活"）是相对稳定的分类，Bond 适合动态认知关联，不适合硬事实
- 即使 Cluster 覆盖率修到 100%，domain 字段仍然保留

### 决策 5: L3 从冷启动自然语言中提取

不使用勾选列表。用户在冷启动 5 问中描述自己（"我在铸造厂工作，业余做产品"），
AI 自动生成维度（"工作（铸造）""个人项目"）。跳过引导的用户，首次 batch-analyze 后从聚类密度中涌现 L3。

### 决策 6: 每日回顾保留在侧边栏

降低视觉权重，和"设置"放一起。有新报告时显示小红点。
理由：用户关掉推送后就再也找不到入口了。

---

## 修复目标

```
侧边栏（"我的世界"）
├── 📝 日记
├── ⚡ 今日
├── 🗺️ 发现
├── ── 我的世界 ──
├── 💼 工作 (5)            ← L3 维度，点击=全局筛选
│   ├── v2note产品 (3)     ← level=1 的 todo 或 Cluster
│   └── 推广计划 (2)
├── 🏠 生活 (2)
│   └── 健康管理 (2)
├── 📚 学习 (0)
├── 💰 投资
├── ──────────────
├── 📋 每日回顾            ← 保留，降低权重，有新报告时红点
└── ⚙️ 设置

选中 L3 后，全局过滤：
  日记流 → 只显示 record.domain='工作' 的日记
  今日   → 只显示该维度下的 todo
  发现   → 地图只高亮该维度相关的 Cluster
  筛选状态持久化到 session 级别
  顶部药丸标签显示当前筛选，点击清除
```

---

## Step 0: 数据库 Migration（基础设施）

### Step 0a: todo 表扩展

```sql
-- Migration 036_unified_task_model.sql

-- 1. todo 表加新字段
ALTER TABLE todo ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES strike(id) ON DELETE SET NULL;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. record 表加 domain
ALTER TABLE record ADD COLUMN IF NOT EXISTS domain TEXT;

-- 3. strike 表加 domain（只给 is_cluster=true 填值）
ALTER TABLE strike ADD COLUMN IF NOT EXISTS domain TEXT;

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_todo_level ON todo(level);
CREATE INDEX IF NOT EXISTS idx_todo_domain ON todo(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todo_cluster ON todo(cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_record_domain ON record(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_strike_domain ON strike(domain) WHERE is_cluster = true AND domain IS NOT NULL;
```

### Step 0b: Goal 数据迁移到 todo 表

```
假设 (Given)  goal 表有 333 条记录，todo 表有 44 条记录
当   (When)   运行迁移脚本（事务内）
那么 (Then)   执行以下步骤：

  第一步：将 goal 数据 INSERT INTO todo
    - goal.title → todo.text
    - goal.status 中 active/progressing → level=1
    - goal.status 中有 parent_id 且 parent 也是 goal → level=2（项目）
    - goal.cluster_id → todo.cluster_id
    - goal.source → todo.category（或新增 source 映射）
    - goal.user_id → todo.user_id
    - goal.device_id → todo.device_id
    - goal.status → todo.status
    - goal.status = 'completed' → todo.done = true
    - 记录 goal.id → todo.id 的映射表（临时）

  第二步：处理 goal 之间的 parent_id（项目→子目标）
    - UPDATE todo SET parent_id = 映射表[旧goal.parent_id]
      WHERE id IN (迁移的 goal) AND 旧goal.parent_id IS NOT NULL

  第三步：处理 todo 原有的 goal_id（待办→目标）
    - UPDATE todo SET parent_id = 映射表[goal_id]
      WHERE goal_id IS NOT NULL AND parent_id IS NULL
    - 注意：已有 parent_id 的 todo（subtask）不覆盖

  第四步：清理
    - ALTER TABLE todo DROP COLUMN goal_id（最终，可延迟到确认无问题后）
    - 暂不 DROP goal 表（保留一段时间作为回滚备份）
```

### 接口约定

```typescript
// todo.ts 扩展 Todo interface
export interface Todo {
  // ... 现有字段 ...
  level: number;           // 0=行动, 1=目标, 2=项目
  cluster_id?: string;     // 关联的 Cluster（level>=1 时使用）
  status: string;          // active/paused/completed/abandoned/progressing/blocked/suggested/dismissed
}

// 新增 repository 方法
async function createGoalAsTodo(fields: {
  user_id: string;
  device_id: string;
  text: string;
  level: 1 | 2;
  source?: string;
  status?: string;
  cluster_id?: string;
  parent_id?: string;
  domain?: string;
}): Promise<Todo>

// status 变更时同步 done
async function updateStatus(id: string, status: string): Promise<void> {
  const done = status === 'completed';
  // UPDATE todo SET status=$1, done=$2 WHERE id=$3
}

// 按 domain(L3) 查询树形结构
async function findTreeByDomain(userId: string, domain: string): Promise<Todo[]>
```

---

## Step 1: Goal 清理（先止血）

> 前置条件：Step 0 完成后

### Step 1a: 硬规则清理（SQL 脚本）

```
假设 (Given)  迁移后 todo 表中有 ~333 条 level>=1 的记录（原 goal）
当   (When)   运行硬规则清理脚本
那么 (Then)   以下记录被标记 status='archived'：
  1. status='suggested' 且创建超过 14 天未被用户确认
  2. text 完全相同的记录 → 保留最早的，其余 archive
  3. 无任何子 todo 且无 cluster_id 关联的 level>=1 记录 → archive
并且 (And)    被 archive 的记录的子 todo.parent_id 迁移到保留的同名记录
```

**预估效果**：333 → ~80-100 个

### Step 1b: 语义合并（需要 AI）

```
假设 (Given)  Step 1a 后剩余 ~80 个 level>=1 的 active 记录
当   (When)   运行语义合并脚本
那么 (Then)   计算所有 active level>=1 记录的 embedding pairwise 相似度
并且 (And)    相似度 ≥ 0.85 的归为同一组
并且 (And)    每组保留最早的一个，其余 archive
并且 (And)    被 archive 的记录的子 todo.parent_id 迁移到保留的记录
并且 (And)    AI 审核合并后的名称，必要时优化措辞
```

**目标**：最终 20-30 个有意义的活跃目标

### Step 1c: 创建前查重（永久防护）

```
假设 (Given)  任何模块准备创建 level>=1 的 todo
当   (When)   新 text 与已有 active level>=1 todo 语义相似度 ≥ 0.75
那么 (Then)   不创建新记录，返回已有记录
并且 (And)    日志记录 "Goal dedup: [new] matched existing [old]"

当   (When)   相似度 0.5-0.75
那么 (Then)   创建 status='suggested'，标注 "可能和[已有目标]重复"

当   (When)   相似度 < 0.5
那么 (Then)   正常创建
```

**位置**：`todoRepo.createWithDedup()` 公共方法

```typescript
async function createWithDedup(params: {
  user_id: string;
  device_id: string;
  text: string;
  level: 1 | 2;
  source?: string;
  cluster_id?: string;
  domain?: string;
}): Promise<{ todo: Todo; action: 'created' | 'matched' | 'suggested' }>
```

---

## Step 2: Cluster 覆盖率提升

### Step 2.0: 诊断

```sql
-- 孤立 Strike 的极性分布
SELECT polarity, COUNT(*)
FROM strike
WHERE is_cluster = false
  AND id NOT IN (SELECT target_strike_id FROM bond WHERE type='cluster_member')
GROUP BY polarity;

-- 判断标准：
-- 大部分是 perceive/feel → 正常
-- 大部分是 judge/intend/realize → 聚类逻辑有问题
```

### Step 2a: batch-analyze 拆分为 2 步

**当前问题**：一次 AI 调用同时做聚类+命名+assign+goal+矛盾+模式，每件事都做不好。

```
Step A: 结构分析（1次 AI 调用）
  输入：未归类 Strike 列表 + 已有 Cluster 列表 + 用户 L3 维度列表
  输出：
    - new_clusters（新主题，含 name + description + member_ids + domain）
    - assign（归入已有 Cluster）
    - merge_clusters（合并建议）
    - cluster_tags
  注意：AI 同时为每个新 Cluster 分配 domain（从用户 L3 维度列表中选择）

Step B: 行动映射（合并到 Digest L1，零额外成本）
  输入：聚类结果 + Strike 内容
  输出：
    - goal_suggestions（基于 Cluster 涌现目标，输出为 level=1 的 todo）
    - contradictions
    - patterns
    - supersedes
```

### Step 2b: assign prompt 调优

```
修改方向：
1. 强调 "优先 assign 到已有 Cluster，只有确实无法归入才创建新的"
2. 降低门槛 "中等相关也应该归入"
3. 明确要求 "至少 50% 的 Strike 应被 assign 或归入 new_cluster"
4. 给出 assign 输出示例
```

### Step 2c: 重跑全量聚类

```
假设 (Given)  Step 2a/2b 完成后
当   (When)   重置 cognitive_snapshot，重跑 batch-analyze
那么 (Then)   Cluster 数量 5 → 15-25 个
并且 (And)    Strike 覆盖率 7% → 50-60%
并且 (And)    每个 Cluster 有 domain 值
```

### 目标
- Cluster 覆盖率：50-60%（feel/perceive 不强求）
- 每个 Cluster 至少 5 个成员
- 每个 Cluster 有 domain 归属

---

## Step 3: Todo → 目标关联（parent_id）

> 前置条件：Step 1 完成后

### Step 3a: 存量批量关联

```
假设 (Given)  ~44 条 level=0 的 todo，parent_id=NULL；20-30 个 level>=1 的 active todo
当   (When)   运行批量关联脚本
那么 (Then)   一次 AI 调用：
  输入：所有 level=0 todo.text + 所有 active level>=1 todo.text
  输出：{ todo_id: parent_id | null }[]
并且 (And)    返回的 parent_id 必须是已有 level>=1 todo 的真实 ID
并且 (And)    无匹配的返回 null（不强行关联）
并且 (And)    批量 UPDATE todo SET parent_id = ? WHERE id = ?
```

### Step 3b: 增量关联（合并在 Digest L1 中）

```
假设 (Given)  Digest 从新记录中提取出 intend Strike 并投影为 Todo
当   (When)   创建 level=0 的 Todo 时
那么 (Then)   Digest prompt 中增加规则：
  "当你产出 intend 类 Strike 时，同时判断它最可能属于哪个已有 active 目标，
   输出 matched_goal_text 字段。如果无匹配则输出 null。"
并且 (And)    代码中根据 matched_goal_text 模糊匹配 level>=1 todo，设置 parent_id
并且 (And)    同时为新 todo 分配 domain（从 parent 继承，或 AI 判断）
```

### Step 3c: domain 继承规则

```
假设 (Given)  创建或更新 todo 时需要确定 domain
那么 (Then)   按以下优先级：
  1. 有 parent_id → 继承 parent 的 domain
  2. 无 parent → AI/embedding 匹配最近的 L3 维度
  3. 都无法判断 → domain 为 NULL，前端放入 "其他" 组

假设 (Given)  用户将 subtask 拖到另一个 parent 下
那么 (Then)   domain 跟随新 parent 变更
```

---

## Step 4: 前端展示

### 场景 4.1: 侧边栏 "我的世界"

```
假设 (Given)  用户有多个 L3 维度
当   (When)   渲染侧边栏
那么 (Then)   "我的世界" 标题下显示所有有数据的 L3 维度
并且 (And)    每个 L3 显示格式：[图标] [维度名] (未完成数)
并且 (And)    L3 点击展开 → 显示该维度下的 level>=1 todo 和 is_cluster=true 的 Cluster 混排
并且 (And)    level>=1 todo 和 Cluster 点击 → 主内容区切换到详情
并且 (And)    最多两层展开（L3 → 子项列表），不在侧边栏展开 level=0 todo
```

### 场景 4.2: 全局筛选

```
假设 (Given)  用户在侧边栏点击某个 L3 维度
当   (When)   进入筛选状态
那么 (Then)   日记流只显示 record.domain = 选中维度
并且 (And)    今日待办只显示 todo.domain = 选中维度
并且 (And)    发现页只高亮该维度的 Cluster
并且 (And)    顶部显示药丸标签 "[维度名] ✕"，点击清除
并且 (And)    筛选状态在 Tab 切换时保持（session 级持久化）
并且 (And)    点击面包屑 "全部" 或药丸 ✕ 清除筛选
```

### 场景 4.3: Today 区 todo 按目标分组

```
假设 (Given)  Today 区有 >5 条 todo
当   (When)   渲染
那么 (Then)   有 parent_id 的 todo 按 parent（level>=1 todo）分组
并且 (And)    组标题格式：🎯 [parent.text]（完成数/总数）
并且 (And)    如果 parent 有 cluster_id，图标改为 🌲
并且 (And)    无 parent 的 todo 按 domain 分组，格式：📦 [domain]（完成数/总数）
并且 (And)    domain 也为 NULL 的放入 💭 其他
并且 (And)    兜底组排在目标分组之后
```

### 场景 4.4: 折叠交互

```
假设 (Given)  Today 下有多个分组
当   (When)   页面首次渲染
那么 (Then)   有未完成 todo 的组默认展开
并且 (And)    全部完成的组默认折叠
并且 (And)    用户点击组标题可切换折叠/展开
```

### 场景 4.5: 少量 todo 不分组

```
假设 (Given)  Today 总 todo 数 ≤ 5
当   (When)   渲染
那么 (Then)   不做分组，直接平铺
```

### 接口约定

```typescript
// 分组结构
interface TodoGroup {
  type: 'goal' | 'domain' | 'ungrouped';
  id: string;              // parent todo.id 或 domain 名
  title: string;
  icon: 'tree-pine' | 'target' | 'package' | 'circle';
  clusterId?: string;
  todos: Todo[];
  doneCount: number;
  totalCount: number;
  collapsed: boolean;
}

// 侧边栏结构
interface DimensionNode {
  domain: string;           // L3 维度名
  icon: string;
  pendingCount: number;     // 未完成 todo 数
  children: Array<{
    type: 'goal' | 'cluster';
    id: string;
    text: string;
    pendingCount?: number;  // goal 才有
  }>;
}

// 前端分组逻辑
function groupTodos(todos: Todo[]): TodoGroup[]

// 侧边栏数据
function buildDimensionTree(todos: Todo[], clusters: Strike[]): DimensionNode[]
```

---

## 执行顺序

```
Phase A: 基础设施（1天）
  Step 0a: Migration — todo 加 level/cluster_id/status，record 加 domain，strike 加 domain
  Step 0b: Goal→Todo 数据迁移脚本（事务内，含两轮 parent_id 处理）
  Step 1c: todoRepo.createWithDedup() — 永久防护

Phase B: 止血 + 清理（1天）
  Step 1a: 硬规则清理（SQL 脚本，archive suggested/重复/无关联）
  Step 1b: 语义合并（AI 辅助，~80 → 20-30）

Phase C: 聚类修复（2天）
  Step 2.0: 诊断（SQL 查询看孤立 Strike 分布）
  Step 2a: batch-analyze 拆分为 2 步（结构分析 / 行动映射）
  Step 2b: assign prompt 调优 + Cluster domain 分配
  Step 2c: 重跑全量聚类

Phase D: 关联（1天）
  Step 3a: 存量 Todo→目标 LLM 批量关联（parent_id）
  Step 3b: Digest L1 增加增量关联 + domain 继承

Phase E: 展示（2天）
  Step 4.1: 侧边栏 "我的世界" + L3 维度导航
  Step 4.2: 全局筛选（药丸标签 + session 持久化）
  Step 4.3: Today 区 todo 按目标分组 + 折叠
```

## 边界条件

- [ ] 新用户（0条记录）：不触发修复逻辑，L3 从冷启动 5 问中提取
- [ ] 少量 todo（≤ 5条）：不分组，平铺
- [ ] 被 archive 的目标被 chat 历史引用：archive 不删除，只隐藏
- [ ] AI 调用失败：降级为不分组的平铺列表
- [ ] 一条 todo 匹配多个目标：取相似度最高的一个
- [ ] feel/perceive 类 Strike 不聚类是正常的，覆盖率不追求 100%
- [ ] Cluster 数量由数据自然决定，不设硬上限
- [ ] todo 既有 parent_id（subtask）又有旧 goal_id：parent_id 优先，不覆盖
- [ ] domain 值统一中文（迁移时 "work"→"工作", "life"→"生活" 等）
- [ ] level>=1 的 todo 被拖拽到新 parent 时，domain 跟随新 parent

## 文件影响

### 新建
- `supabase/migrations/036_unified_task_model.sql` — Step 0a
- `scripts/repair-migrate-goals.ts` — Step 0b（goal→todo 迁移）
- `scripts/repair-goal-cleanup.ts` — Step 1a（硬规则清理）
- `scripts/repair-goal-merge.ts` — Step 1b（语义合并）
- `scripts/repair-todo-parent-link.ts` — Step 3a（存量关联）

### 修改
- `gateway/src/db/repositories/todo.ts` — Todo interface 扩展 + createWithDedup + createGoalAsTodo + updateStatus + findTreeByDomain
- `gateway/src/db/repositories/index.ts` — 废弃 goalRepo 导出（渐进式）
- `gateway/src/cognitive/batch-analyze.ts` — 调用 createWithDedup 替代 goalRepo.create + Cluster domain 分配
- `gateway/src/cognitive/batch-analyze-prompt.ts` — 拆分 prompt + assign 强化 + domain 输出
- `gateway/src/handlers/process.ts` — 目标创建走 createWithDedup
- `gateway/src/handlers/digest.ts` — todo 创建时设置 parent_id + domain 继承
- `gateway/src/handlers/digest-prompt.ts` — 增加 matched_goal_text + domain 输出
- `gateway/src/handlers/chat.ts` — builtin tools 从 goalRepo 切换到 todoRepo(level>=1)
- `gateway/src/routes/goals.ts` — 改为查询 todo WHERE level>=1（兼容期）
- `gateway/src/routes/todos.ts` — 支持 level 过滤 + domain 过滤
- `features/workspace/components/todo-workspace-view.tsx` — 分组渲染
- `features/sidebar/components/sidebar-drawer.tsx` — "我的世界" + L3 导航 + 全局筛选

## 依赖关系

```
Step 0 (Migration + 迁移) → Step 1 (清理) → Step 3 (关联) → Step 4 (展示)
Step 2 (聚类修复) 与 Step 1 并行，与 Step 0 有弱依赖（需要 strike.domain 字段）
```

## 涌现体系对齐

本 spec 的统一模型与认知引擎涌现链条的关系：

```
混沌输入 → Record(domain) → Strike → Cluster(domain, is_cluster=true)
                                         ↓ 行动投影
                                    Todo(level=1, cluster_id, domain)
                                         ↓ parent_id
                                    Todo(level=0, domain 继承)

L3 维度(domain) 是静态锚点：
  - 冷启动时从自然语言提取
  - Cluster 涌现时 AI 分配 domain
  - Todo 创建时从 parent 继承 domain
  - 未来：当 L2 涌现覆盖预设 L3 时，用户可确认重组顶层结构

认知叙事通路：
  Todo(level>=1) → cluster_id → Cluster → 成员 Strike → 按时间排列 → 故事线
```

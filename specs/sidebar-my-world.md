---
id: "096"
title: "侧边栏「我的世界」重构"
status: completed
domain: ui
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-31
---
# 侧边栏「我的世界」重构

> 状态：🟡 待开发 | 优先级：Phase 2
> 关联：`specs/cold-start-onboarding.md`（onboarding 种子目标改造）

## 概述

「我的世界」是用户打开侧边栏看到的认知结构。当前方案有三个致命问题：
1. **种子目标是废话**：onboarding 创建"工作相关目标"、"生活相关目标"——无意义的占位符
2. **维度分类太机械**：按"工作/生活"分文件夹，完全不是认知操作系统该有的样子
3. **涌现链路断裂**：聚类结果(clusters)根本没接入侧边栏，sidebar 查的是 todo.domain 分组

本 spec 重构为：**种子即目标 → 涌现即结构 → 长按可管理 → 三级层次**。

## 设计原则

1. **种子有意义**：onboarding 提取的"产品上线"、"铸造厂工作"直接成为种子目标，而非"工作相关目标"
2. **结构来自涌现**：侧边栏展示聚类主题(clusters)，而非预设的维度分类
3. **冷启动即反馈**：onboarding 对话产生种子 Strike，第一次输入就能触发聚类
4. **长按可管理**：支持删除、编辑、新建，三级层次结构
5. **去掉筛选**：点击目标/聚类不再是"全局筛选"，而是展开查看结构

## 底层数据模型（两套实体 + 桥接）

理解侧边栏层级前，必须先理清底层数据关系：

### Strike 系统（认知层）
```
strike 表
├─ 普通 Strike     is_cluster=false, level=null    — 用户输入分解出的认知触动
├─ L1 聚类         is_cluster=true,  level=1       — batch-analyze 产生的主题聚类
└─ L2 聚类         is_cluster=true,  level=2       — emergence 产生的高阶主题（2+ L1 聚类合并）

关系通过 bond 表：
  bond(source=聚类, target=成员, type='cluster_member')
  L2 聚类 ──cluster_member──→ L1 聚类 ──cluster_member──→ 普通 Strike
```

### Todo 系统（行动层）
```
todo 表
├─ level=0   行动/任务     — 具体可执行的事项
├─ level=1   目标          — 中期目标
└─ level=2   项目          — 长期项目

关系：
  todo.parent_id ──→ 上级 todo（行动→目标，目标→项目）
  todo.cluster_id ──→ strike.id（桥接：目标/项目 挂到聚类下）
```

### 桥接关系
```
L2 聚类 (strike, is_cluster=true, level=2)
  │ bond(type='cluster_member')
  ├──→ L1 聚类 (strike, is_cluster=true, level=1)
  │      │ bond(type='cluster_member')
  │      ├──→ 普通 Strike
  │      │
  │      └── todo.cluster_id 指向此聚类
  │           └─ level=1 目标 (todo)
  │                └─ level=0 行动 (todo, parent_id→目标)
  │
  └── todo.cluster_id 指向此 L2
       └─ level=2 项目 (todo)
            └─ level=1 目标 (todo, parent_id→项目)
```

### domain 字段
- **strike.domain**：只对 is_cluster=true 有意义，batch-analyze 时 AI 分配
- **todo.domain**：CHECK 约束限定 7 值（工作/学习/创业/家庭/健康/生活/社交）
- 两者独立，无 FK 关联
- **本次重构：侧边栏不再使用 domain 分组，改为直接展示聚类 + 目标结构**

## 侧边栏三级层次映射

### 核心规则：渐进式结构

侧边栏的层次不是固定的，而是随用户积累**渐进生长**：

**阶段 1：冷启动（无聚类）**
```
我的世界
├─ 产品上线（种子目标，todo level=1）
├─ 铸造厂工作（种子目标）
└─ + 新建目标
引导文字："持续记录想法，结构会自然浮现"
```
只有独立目标，扁平列表。

**阶段 2：L1 聚类出现后**
```
我的世界
├─ 产品开发（L1 聚类，3 条 Strike）        ← 第一级
│  ├─ 产品上线（目标，cluster_id→聚类）    ← 第二级
│  │  └─ 完成用户测试（行动，parent_id→目标）← 第三级
│  └─ 设计登录页（目标）
├─ 铸造厂日常（L1 聚类，5 条 Strike）
│  └─ 完成本月质检（目标）
├─ 减肥计划（独立目标，无聚类归属）         ← 第一级
│  └─ 每天跑步 30 分钟（行动）             ← 第二级
└─ + 新建目标
```
第一级 = L1 聚类 + 独立目标（无 cluster_id 的 todo level>=1）
第二级 = 聚类下的目标（todo, cluster_id→聚类）或独立目标的子项
第三级 = 子任务/行动（todo, parent_id→上级 todo）

**阶段 3：L2 涌现后（3+ 个 L1 聚类触发）**
```
我的世界
├─ 创业（L2 聚类）                          ← 第一级
│  ├─ 产品开发（L1 聚类，作为 L2 成员）     ← 第二级
│  │  └─ 产品上线（目标）                   ← 第三级
│  └─ 市场推广（L1 聚类）
│     └─ 写推广文案（目标）
├─ 铸造厂日常（独立 L1 聚类，未归入 L2）
│  └─ 完成本月质检（目标）
├─ 减肥计划（独立目标）
└─ + 新建目标
```
L2 涌现后自动提升为第一级，L1 降为第二级，目标降为第三级。

### 层级映射总结

| 侧边栏层级 | 无 L2 时的内容 | 有 L2 时的内容 |
|-----------|--------------|--------------|
| 第一级 | L1 聚类 + 独立目标 | L2 聚类 + 未归组的 L1 聚类 + 独立目标 |
| 第二级 | 聚类下目标 + 独立目标子项 | L1 聚类（L2 成员）+ 聚类下目标 |
| 第三级 | 行动/子任务 | 目标 + 行动/子任务 |

**最多三级，超出的层次折叠不展示。**

## 场景

### 场景 1: Onboarding 种子目标改造
```
假设 (Given)  新用户完成冷启动 5 问对话
当   (When)   Q2 回答 "在铸造厂上班，业余做自己的产品"
那么 (Then)   AI 提取出具体目标关键词（如 "产品开发"、"铸造厂工作"）
并且 (And)    后端为每个关键词创建 level=1 的 todo（有具体文字，不是"X相关目标"）
并且 (And)    同时创建对应的种子 Strike（is_cluster=false），写入 nucleus
并且 (And)    种子 Strike 为后续聚类提供方向锚点

当   (When)   Q3 回答 "最近在忙产品上线"
那么 (Then)   AI 提取 "产品上线" 作为具体焦点
并且 (And)    创建 level=1 todo "产品上线"
并且 (And)    创建对应种子 Strike

当   (When)   onboarding 完成
那么 (Then)   用户已有 3-5 个种子 Strike + 3-5 个有意义的目标
并且 (And)    侧边栏"我的世界"立即展示这些具体目标
```

### 场景 2: 冷启动聚类加速
```
假设 (Given)  新用户刚完成 onboarding（有 3-5 个种子 Strike）
当   (When)   用户提交第一条笔记
那么 (Then)   digest 分解出 1-3 个 Strike
并且 (And)   检测到用户 Strike 总数 < 20（冷启动状态）
并且 (And)   立即触发 batch-analyze（不等 5 个阈值）
并且 (And)   种子 Strike 作为锚点引导聚类方向
那么 (Then)   30 秒内侧边栏出现第一批聚类主题

假设 (Given)  用户 Strike 总数 >= 20（非冷启动）
当   (When)   用户提交笔记
那么 (Then)   保持原有阈值逻辑（5 个新 Strike 触发 batch-analyze）
```

### 场景 3: 侧边栏展示聚类结构（无 L2 涌现时）
```
假设 (Given)  用户有 L1 聚类 + 目标，尚无 L2 涌现
当   (When)   打开侧边栏
那么 (Then)   "我的世界"区域第一级 = L1 聚类 + 独立目标：
              ┌─ 产品开发（L1 聚类，3 条 Strike）
              │  ├─ 产品上线（目标，todo.cluster_id→聚类）
              │  │  └─ 完成用户测试（行动，todo.parent_id→目标）
              │  └─ 设计登录页（目标）
              ├─ 铸造厂日常（L1 聚类，5 条 Strike）
              │  └─ 完成本月质检（目标）
              └─ 减肥计划（独立目标，无 cluster_id）
                 └─ 每天跑步 30 分钟（行动）
并且 (And)    聚类显示成员 Strike 数量（气泡数字）
并且 (And)    目标显示子任务完成进度（如 2/5）
并且 (And)    默认收起，点击展开/收起下级
并且 (And)    独立目标（无 cluster_id 的 todo level>=1）排在聚类之后
并且 (And)    点击不触发全局筛选（移除 dimensionFilter 逻辑）
```

### 场景 4: L2 涌现后的三级结构
```
假设 (Given)  emergence 产生了 L2 聚类（2+ 个 L1 聚类被合并）
当   (When)   打开侧边栏
那么 (Then)   L2 聚类自动提升为第一级：
              ┌─ 创业（L2 聚类）
              │  ├─ 产品开发（L1 聚类，作为 L2 的 bond 成员）
              │  │  └─ 产品上线（目标，cluster_id→L1）
              │  └─ 市场推广（L1 聚类）
              │     └─ 写推广文案（目标）
              ├─ 铸造厂日常（独立 L1 聚类，未被任何 L2 收纳）
              │  └─ 完成本月质检（目标）
              └─ 减肥计划（独立目标）
并且 (And)    最多展示三级，超出层次折叠
并且 (And)    独立 L1 聚类（未归入 L2）仍在第一级
并且 (And)    独立目标（无 cluster_id）仍在第一级末尾

注意 (Note)   L2 涌现条件苛刻（需 3+ L1 聚类 + emergence 触发），
              大部分用户长期处于"场景 3"状态，场景 4 是自然进化的结果
```

### 场景 4b: 层级查询逻辑
```
假设 (Given)  后端需要构建侧边栏数据
当   (When)   查询 my-world 数据
那么 (Then)   按以下优先级组装第一级节点：
              1. L2 聚类（strike: is_cluster=true, level=2, status='active'）
              2. 独立 L1 聚类（strike: is_cluster=true, level=1，
                 且不是任何 L2 的 bond 成员）
              3. 独立目标（todo: level>=1, cluster_id IS NULL,
                 parent_id IS NULL, status IN ('active','progressing')）
并且 (And)    每个 L2 的子级 = 其 bond(type='cluster_member') 指向的 L1 聚类
并且 (And)    每个 L1 的子级 = todo WHERE cluster_id=L1.id AND level>=1
并且 (And)    每个目标的子级 = todo WHERE parent_id=目标.id
并且 (And)    最多递归三层，第三层只返回 {id, title, done}
```

### 场景 5: 长按管理（新增交互）
```
假设 (Given)  侧边栏展示某个节点（聚类或目标或行动）
当   (When)   用户长按（移动端 500ms）或右键（桌面端）某一项
那么 (Then)   弹出管理浮层，操作因节点类型而异：

              聚类节点（l2_cluster / l1_cluster）：
              - 编辑：修改聚类名称（更新 strike.nucleus）
              - 解散：is_cluster 置 false，成员 Strike 保留，
                      其下目标变为独立目标（todo.cluster_id 置 null）
              - 新建目标：在该聚类下创建 todo（level=1, cluster_id→聚类）

              目标节点（goal）：
              - 编辑：修改名称（更新 todo.text）
              - 删除：todo.status 设为 archived
              - 新建子项：创建 todo（level=0, parent_id→当前目标）

              行动节点（action）：
              - 编辑：修改名称
              - 删除：todo.status 设为 archived
              - 完成/恢复：切换 todo.done

并且 (And)    浮层使用 Popover 样式，紧贴长按位置

当   (When)   用户点击"编辑"
那么 (Then)   该项文字变为 inline 输入框，回车保存，Escape 取消
并且 (And)    聚类 → PATCH /api/v1/cognitive/clusters/:id {name}
并且 (And)    目标/行动 → PATCH /api/v1/goals/:id {title}

当   (When)   用户点击"删除"或"解散"
那么 (Then)   弹出确认对话框
并且 (And)    确认后 UI 立即移除（乐观更新），API 失败则回滚

当   (When)   用户点击"新建目标"或"新建子项"
那么 (Then)   在当前项下方插入空 inline 输入框
并且 (And)    回车 → 创建 todo，Escape → 取消
并且 (And)    聚类下新建 → todo(level=1, cluster_id=聚类.id)
并且 (And)    目标下新建 → todo(level=0, parent_id=目标.id)
```

### 场景 6: 底部"新建目标"入口
```
假设 (Given)  侧边栏"我的世界"区域底部
那么 (Then)   始终显示一个"+ 新建目标"按钮
当   (When)   用户点击
那么 (Then)   弹出输入框（或 inline 输入），输入目标名称后创建
并且 (And)    新目标为顶级 level=1 todo，无 parent_id
并且 (And)    后续聚类会自动将其归入匹配的 cluster
```

### 场景 7: 空状态引导
```
假设 (Given)  新用户完成 onboarding 但尚无聚类产生（种子目标已存在）
当   (When)   打开侧边栏
那么 (Then)   "我的世界"显示种子目标列表
并且 (And)    底部显示引导文字："持续记录想法，结构会自然浮现"
并且 (And)    不显示空荡荡的维度分类
```

### 场景 8: 聚类与目标的关联
```
假设 (Given)  batch-analyze 产生了一个新聚类"产品开发"
并且 (And)    已有一个种子目标"产品上线"
当   (When)   聚类创建时
那么 (Then)   batch-analyze 的 goal_suggestions 可建议关联
或者 (Or)     通过 embedding 相似度自动将目标挂到最匹配的聚类下
并且 (And)    关联方式：todo.cluster_id = cluster.strike_id
```

## 接口约定

### 侧边栏数据 API（替代 /api/v1/dimensions）

#### GET /api/v1/sidebar/my-world

响应采用统一的树节点结构，前端递归渲染：

```typescript
/** 统一的树节点（聚类和目标共用） */
interface MyWorldNode {
  id: string;
  /** 节点类型 */
  type: "l2_cluster" | "l1_cluster" | "goal" | "action";
  /** 显示名称 */
  title: string;
  /** 聚类特有：成员 Strike 数 */
  memberCount?: number;
  /** 目标特有：子任务进度 */
  subtaskTotal?: number;
  subtaskDone?: number;
  /** 目标特有 */
  status?: string;
  /** 行动特有 */
  done?: boolean;
  /** 子节点（最多递归到第三级） */
  children: MyWorldNode[];
}

interface MyWorldResponse {
  /** 第一级节点列表（已按优先级排序：L2聚类 → 独立L1聚类 → 独立目标） */
  nodes: MyWorldNode[];
}
```

**后端组装逻辑：**
```sql
-- 1. 查 L2 聚类
SELECT id, nucleus, level FROM strike
WHERE user_id=$1 AND is_cluster=true AND level=2 AND status='active'

-- 2. 查 L2 的 L1 成员
SELECT target_strike_id FROM bond
WHERE source_strike_id IN (L2 ids) AND type='cluster_member'

-- 3. 查独立 L1（不在任何 L2 下）
SELECT id, nucleus FROM strike
WHERE user_id=$1 AND is_cluster=true AND level=1 AND status='active'
  AND id NOT IN (上面查出的 L1 ids)

-- 4. 查每个 L1 下的目标
SELECT id, text, status, cluster_id FROM todo
WHERE user_id=$1 AND cluster_id IN (L1 ids) AND level>=1
  AND status IN ('active','progressing')

-- 5. 查独立目标（无 cluster_id，无 parent_id）
SELECT id, text, status FROM todo
WHERE user_id=$1 AND cluster_id IS NULL AND parent_id IS NULL
  AND level>=1 AND status IN ('active','progressing')

-- 6. 查每个目标的子任务（第三级）
SELECT id, text, done FROM todo
WHERE parent_id IN (目标 ids) AND level=0
```

**示例响应（阶段 2，有 L1 无 L2）：**
```json
{
  "nodes": [
    {
      "id": "strike-uuid-1",
      "type": "l1_cluster",
      "title": "产品开发",
      "memberCount": 3,
      "children": [
        {
          "id": "todo-uuid-1",
          "type": "goal",
          "title": "产品上线",
          "status": "active",
          "subtaskTotal": 3,
          "subtaskDone": 1,
          "children": [
            { "id": "todo-uuid-2", "type": "action", "title": "完成用户测试", "done": false, "children": [] }
          ]
        }
      ]
    },
    {
      "id": "todo-uuid-5",
      "type": "goal",
      "title": "减肥计划",
      "status": "active",
      "subtaskTotal": 1,
      "subtaskDone": 0,
      "children": [
        { "id": "todo-uuid-6", "type": "action", "title": "每天跑步 30 分钟", "done": false, "children": [] }
      ]
    }
  ]
}
```
```

### 种子创建 API（onboarding 完成时调用）

#### POST /api/v1/onboarding/seed-goals

请求：
```typescript
interface SeedGoalsRequest {
  /** AI 从对话中提取的具体目标 */
  goals: Array<{
    title: string;        // "产品上线"、"铸造厂工作" — 具体的
    sourceStep: number;   // 来自 Q 几
  }>;
}
```

### 管理操作 API

#### PATCH /api/v1/goals/:id（目标/行动编辑）
```typescript
interface UpdateGoalRequest {
  title?: string;       // 修改名称 → 更新 todo.text
  status?: string;      // archived = 删除
  done?: boolean;       // 行动完成/恢复
}
```

#### POST /api/v1/goals（新建目标/行动）
```typescript
interface CreateGoalRequest {
  title: string;
  parent_id?: string;   // 在某目标下新建子项 → todo.parent_id
  cluster_id?: string;  // 在某聚类下新建目标 → todo.cluster_id
}
```
- 有 parent_id → level=0 行动
- 有 cluster_id 无 parent_id → level=1 目标
- 都没有 → level=1 独立目标

#### PATCH /api/v1/cognitive/clusters/:id（聚类编辑）
```typescript
interface UpdateClusterRequest {
  name?: string;        // 修改名称 → 更新 strike.nucleus
}
```

#### DELETE /api/v1/cognitive/clusters/:id（聚类解散）
- strike.is_cluster 置 false（不删除 strike 记录）
- 成员 Strike 的 bond(type='cluster_member') 保留（历史记录）
- 关联的 todo.cluster_id 置 null（目标变为独立）

## Onboarding Prompt 变更

### AI 提取字段新增 `seed_goals`

现有 `extracted_fields` 增加：
```typescript
{
  "reply": "...",
  "extracted_fields": {
    "occupation": null,
    "current_focus": null,
    "pain_points": null,
    "review_time": null,
    "dimensions": [],
    "seed_goals": ["产品上线", "铸造厂质检"]  // 新增：具体目标
  },
  "skip_to": null
}
```

AI prompt 新增提取规则：
```
- seed_goals: 从用户回答中提取可作为目标/项目的具体事项（2-8字，具体可执行，非"工作""生活"等泛类）
  示例：用户说"在铸造厂上班，业余做自己的产品" → seed_goals: ["产品开发"]
  示例：用户说"最近在忙产品上线" → seed_goals: ["产品上线"]
  示例：用户说"在减肥" → seed_goals: ["减肥计划"]
```

## 涌现链路改造

### 冷启动加速（digest.ts 改动）

```
当前逻辑：
  newStrikeCount >= 5 → 触发 batch-analyze

新增逻辑：
  if (用户总 Strike 数 < 20) {
    // 冷启动模式：降低阈值
    newStrikeCount >= 2 → 触发 batch-analyze
  } else {
    // 正常模式：保持原阈值
    newStrikeCount >= 5 → 触发 batch-analyze
  }
```

### 种子 Strike 创建（onboarding.ts 改动）

onboarding 完成时，除了创建 todo 目标，同时创建对应的 Strike：
```typescript
// 为每个种子目标创建 Strike（供 batch-analyze 作为锚点）
for (const goal of seedGoals) {
  await strikeRepo.create({
    user_id: userId,
    nucleus: goal.title,
    polarity: "intend",       // 意图类
    is_cluster: false,
    confidence: 0.8,
    salience: 1.0,
    source_type: "onboarding", // 标记来源
    level: 0,
  });
}
```

## 要移除的功能

1. **dimensionFilter 全局筛选**：`app/page.tsx` 中的 `setDimensionFilter` 逻辑全部移除
2. **getDimensionSummary API**：不再需要按 domain 分组统计
3. **seedDimensionGoals**：替换为新的 seedGoals 逻辑，不再创建"X相关目标"
4. **DOMAIN_ICONS 映射**：侧边栏不再按预设维度显示图标
5. **workspace-header.tsx 维度 pill**：移除维度筛选标签

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `features/sidebar/components/sidebar-drawer.tsx` | 重构：递归树渲染 + 长按管理 + 移除维度分类 |
| `gateway/src/routes/goals.ts` | 新增 GET /api/v1/sidebar/my-world；可保留 /dimensions 兼容 |
| `gateway/src/routes/cognitive-clusters.ts` | 新增 PATCH/:id（编辑）、DELETE/:id（解散） |
| `gateway/src/db/repositories/todo.ts` | 新增 getMyWorldData()（聚合查询） |
| `gateway/src/db/repositories/strike.ts` | 新增 getActiveClusters()、dissolveCluster() |
| `gateway/src/db/repositories/bond.ts` | 新增 getClusterMembers()（按 type='cluster_member' 查） |
| `gateway/src/handlers/onboarding.ts` | 改造 seedDimensionGoals → seedGoals（具体目标 + 种子 Strike） |
| `gateway/src/handlers/onboarding-prompt.ts` | prompt 新增 seed_goals 提取 |
| `gateway/src/handlers/digest.ts` | 冷启动阈值降低（总 Strike<20 时阈值=2） |
| `gateway/src/cognitive/batch-analyze.ts` | 冷启动检测逻辑 |
| `shared/lib/api/goals.ts` | 新增 getMyWorld()、管理操作 API |
| `shared/lib/types.ts` | 新增 MyWorldNode 类型 |
| `app/page.tsx` | 移除 dimensionFilter 相关状态和逻辑 |
| `features/workspace/components/workspace-header.tsx` | 移除维度 pill 标签 |

## 边界条件

- [ ] onboarding AI 提取不出 seed_goals：fallback 用 occupation/current_focus 文本直接创建目标
- [ ] 第一级节点过多（>15）：只显示 top 12（聚类按 memberCount、目标按 updated_at 排序），底部"查看全部"
- [ ] L2 涌现后 L1 变成第二级：已展开的 L1 状态需保持
- [ ] 长按误触：需 500ms 判定，短于 500ms 视为普通点击（展开/收起）
- [ ] 解散聚类后：其下目标 cluster_id 置 null → 变为独立目标出现在第一级末尾
- [ ] 目标删除（archived）后：其子任务也级联 archived
- [ ] 并发编辑：乐观更新 + API 失败回滚 + toast 提示
- [ ] 空状态：无聚类无目标时显示引导文案 + "新建目标"按钮
- [ ] 聚类名从 strike.nucleus 提取：格式为 `[名称] 描述`，显示时只取方括号内名称

## 验收标准

1. 冷启动用户完成 onboarding 后，侧边栏立即显示 3-5 个有意义的具体目标（非"X相关目标"）
2. 用户提交第一条笔记后 30 秒内，侧边栏出现第一批 L1 聚类
3. L1 聚类出现后，之前的独立目标如果与聚类相关，通过 cluster_id 归入聚类下
4. 长按聚类 → 可编辑名称、解散、新建目标；长按目标 → 可编辑、删除、新建子项
5. 三级递归渲染正确：L2→L1→目标 或 L1→目标→行动 或 独立目标→行动
6. 移除全局维度筛选后，侧边栏点击只展开/收起
7. 聚类解散后成员 Strike 不丢失，关联目标变为独立

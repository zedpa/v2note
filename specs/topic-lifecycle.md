# 主题生命周期 — 统一视图 + 认知-实践飞轮

> 状态：🔄 实现中 | 优先级：Phase 7.2 | 预计：6-7 天
> 依赖：app-mobile-redesign（侧边栏 + 工作区），emergence-chain（Cluster 涌现），goal-lifecycle（目标状态流转）
> 进度 2026-03-28：
>   ✅ 场景 1 侧边栏主题列表（活跃方向+沉默区+Cluster分类）
>   ✅ 场景 2 选中主题→全局筛选（药丸+Tab文字联动）
>   ✅ 场景 3 进展 Tab 四阶段视图（Now/Growing/Seeds/Harvest）
>   ✅ 场景 5 收获沉淀（POST /goals/:id/harvest）
>   ✅ 场景 7 种子晋升（Seeds 区可展开+聊聊按钮）
>   ✅ 场景 8 沉默区唤醒（侧边栏沉默区→筛选态）
>   ✅ 场景 10 筛选持久化（localStorage）
>   ✅ 后端 GET /topics + GET /topics/:id/lifecycle + POST /goals/:id/harvest
>   ✅ 场景 4 脉络Tab（NotesTimeline cluster_id 筛选参数已接入）
>   ✅ 场景 9 新建方向（+ 按钮→参谋对话 overlay）
>   ✅ 场景 11 酝酿期卡片（无主题+有目标时显示酝酿态）
>   🟡 场景 6/12 依赖其他模块（proactive/onboarding）

## 概述

项目、目标、待办不是三种独立实体——它们是**同一件事在不同维度上的投影**。

- **时间维度**：一件事未完成 → 它是待办；我想完成它 → 它是目标
- **空间维度**：把一件事的组成展开 → 结构出现（子目标、子行动）
- **生命维度**：A 阶段完成 → 沉淀为收获（旧 Strike）→ 新认知催生新行动 → 飞轮转动

当前系统的 Cluster（涌现主题）天然承载了这一切：Cluster 内有认知种子（Strike），有行动承诺（Goal），有具体行动（Todo），有完成后的领悟（新 Strike）。前端需要的不是一个「项目管理器」，而是一个**主题生命周期视图**——让用户看到一件事从萌芽到收获的完整画面。

### 核心模型

```
认知-实践飞轮:

  ┌─── 种子 (Seeds) ───────────────────────────────┐
  │  Strike(intend/perceive) 进入 Cluster            │
  │  "应该考虑备用供应商"  "铝价可能继续涨"          │
  └──────────────────┬──────────────────────────────┘
                     ↓  intend 密度 > 30% 涌现 / 用户明确说出
  ┌─── 正在长 (Growing) ───────────────────────────┐
  │  Goal(status=active, cluster_id=Cluster)         │
  │  "评估供应商"  →  Todo1, Todo2, Todo3            │
  └──────────────────┬──────────────────────────────┘
                     ↓  Todo 完成 → Goal 完成
  ┌─── 收获 (Harvest) ─────────────────────────────┐
  │  Goal(status=completed)                          │
  │  → AI 生成回顾 Strike(polarity=judge)            │
  │  "供应商评估结论：选择XX，价格降15%"              │
  └──────────────────┬──────────────────────────────┘
                     ↓  回顾 Strike 反哺 Cluster
  ┌─── Cluster 演化 ───────────────────────────────┐
  │  新认知改变 Cluster 方向/密度                     │
  │  → 可能触发新涌现 → 新 Seed → 新 Goal → ...     │
  └─────────────────────────────────────────────────┘
```

### 数据映射

| 生命阶段 | 用户感知 | 数据来源 |
|----------|---------|---------|
| **此刻 (Now)** | 现在该做什么 | Todo（done=false, 今日, goal.cluster_id=当前 Cluster） |
| **正在长 (Growing)** | 正在推进什么 | Goal（status=active/progressing, cluster_id=当前 Cluster），含子 Todo 进度 |
| **种子 (Seeds)** | 相关但还没行动的想法 | Strike（在 Cluster 内, polarity∈{intend,perceive}, 未关联 Goal） |
| **已收获 (Harvest)** | 已经教会我什么 | Goal（status=completed）+ 其回顾 Strike |

### 与现有双视图的关系

| 状态 | 左 Tab | 右 Tab | 说明 |
|------|--------|--------|------|
| 无筛选（默认） | 日记 | 待办 | 横切面：跨所有主题，按时间排列 |
| 选中主题（筛选态） | 脉络 | 进展 | 纵切面：聚焦一件事的完整生命画面 |

---

## 场景

### 场景 1: 侧边栏 — 主题列表（替代项目树）
```
假设 (Given)  用户有多个涌现 Cluster 和独立 Goal
当   (When)   打开侧边栏
那么 (Then)   「我的方向」区域展示两组：

  活跃方向（有 active Goal 的 Cluster）：
  🌿 供应链管理           12    ← L2/L3 Cluster + Strike 成员数
     评估供应商 · 铸造优化       ← 关联的 active Goals 摘要（最多 2 个）
  🌿 v2note 产品           8
     移动端重构

  独立目标（无 Cluster 或 Cluster 很弱的 Goal）：
  🎯 量化交易                    ← active Goal, cluster_id=null 或 Cluster 成员 < 5
  💡 团队培训计划        确认?    ← suggested Goal

  沉默区（有认知沉淀但无行动意图的 Cluster，灰色）：
  ☁️ 家庭关系              3     ← intend 密度 < 30%，只有想法没有目标
  ☁️ 健康管理              2

并且 (And)    活跃方向按最近 Strike 时间排序（最活跃在上）
并且 (And)    沉默区默认折叠，展开后灰色弱化显示
并且 (And)    数据来源: GET /api/v1/topics（新接口，聚合 Cluster + Goal + Strike 统计）
```

### 场景 2: 选中主题 → 全局筛选 + Tab 变化
```
假设 (Given)  侧边栏展示中
当   (When)   用户点击「🌿 供应链管理」
那么 (Then)   侧边栏关闭
并且 (And)    顶部栏 Segment 标签变为：「脉络 | 进展」（替代「日记 | 待办」）
并且 (And)    顶部栏出现筛选药丸：「🌿 供应链管理  ✕」
并且 (And)    默认显示「进展」Tab（主题生命周期视图）
当   (When)   点击筛选药丸的 ✕
那么 (Then)   清除筛选，Tab 恢复为「日记 | 待办」，内容恢复全量
```

### 场景 3: 「进展」Tab — 主题生命周期视图
```
假设 (Given)  用户选中了主题「供应链管理」，当前在「进展」Tab
当   (When)   视图加载
那么 (Then)   调用 GET /api/v1/topics/:clusterId/lifecycle
并且 (And)    按四个阶段展示内容（有数据的阶段才显示）：

  ── 此刻 ──────────────────────── Now ──
  [Now Card]  打给张总确认报价     10:00     ← Tinder 滑动交互不变
  ○  整理供应商对比文档           14:00     ← 今日其他行动
  ○  回复老王报价邮件

  ── 正在长 ─────────────────── Growing ──
  🎯 评估供应商                    60%      ← active Goal + 进度
     ✓ 收集市场报价
     ○ 对比分析
     ○ 最终决策
  🎯 优化铸造工艺                  20%
     ○ 联系技术团队

  ── 种子 ────────────────────── Seeds ──
  💭 "应该考虑一个备用供应商"              ← intend Strike, 未关联 Goal
  💭 "老王推荐了东莞一家新厂"              ← perceive Strike
     点击可展开原始日记 / 「和路路聊聊 →」

  ── 已收获 ─────────────────── Harvest ──
  ✦  铝价走势判断已验证           3/14      ← completed Goal 的回顾
  ✦  初步供应商名单已建立         3/08
     点击可展开完整回顾

并且 (And)    Now 区域的 Now Card 只从该主题的待办中选取
并且 (And)    Growing 区域的 Goal 可点击展开/折叠子 Todo
并且 (And)    Seeds 区域点击「和路路聊聊」→ 打开参谋对话 overlay（mode=review, context=该 Strike）
并且 (And)    Harvest 区域点击可展开回顾内容
```

### 场景 4: 「脉络」Tab — 主题认知时间线
```
假设 (Given)  用户选中了主题「供应链管理」，切换到「脉络」Tab
当   (When)   视图加载
那么 (Then)   调用 GET /api/v1/records?cluster_id=xxx
并且 (And)    日记流仅显示与该 Cluster 相关的日记卡片
并且 (And)    筛选逻辑（三重匹配，取并集）：
  1. record → strike → bond → cluster_id 匹配（认知关联）
  2. record → todo → goal.cluster_id 匹配（行动关联）
  3. record.embedding 与 cluster.embedding 相似度 > 0.6（语义关联）
并且 (And)    日记卡片样式不变（折叠/展开），日期分组保持
并且 (And)    AI 洞察卡片也筛选为该主题相关
```

### 场景 5: 收获沉淀 — Goal 完成产生回顾 Strike
```
假设 (Given)  某 Goal "评估供应商" 下所有 Todo 已完成
当   (When)   Goal status 转为 'completed'
那么 (Then)   后端自动触发收获沉淀：
  1. AI 总结该 Goal 的过程和成果（基于关联 Strikes + Todos + 日记）
  2. 生成回顾 Strike：
     polarity = 'judge'（领悟）
     nucleus = "供应商评估结论：选XX，价格降15%，交期缩短一周"
     is_cluster = false
  3. 新 Strike 通过 Bond 关联到该 Goal 所属的 Cluster
  4. Cluster 的成员密度/方向可能发生变化
  5. 可能触发新的涌现（新 Seed / 新 suggested Goal）
并且 (And)    收获 Strike 在生命周期视图的「已收获」区显示
并且 (And)    如果 7 天后用户尚未回顾结果 → 路路追问「结果怎样？」（action-tracking Scene 5）
```

### 场景 6: 收获追问 — 用户补充结果反馈
```
假设 (Given)  Goal 完成 7 天后
当   (When)   路路推送追问：「评估供应商 完成一周了，结果怎样？」
并且 (And)    用户回答："选了XX供应商，价格确实降了，但交期还有问题"
那么 (Then)   回答作为新 record 进入 Digest
并且 (And)    Digest 产出的 Strike 关联到原 Cluster
并且 (And)    如果包含新 intend（"交期还有问题"）→ 可能成为新 Seed
并且 (And)    收获 Strike 的 nucleus 更新为用户实际反馈
```

### 场景 7: 种子晋升 — 从想法到目标
```
假设 (Given)  Seeds 区域有一条 intend Strike "应该考虑备用供应商"
当   (When)   用户点击该 Seed 卡片
那么 (Then)   展开显示原始日记上下文 + 两个按钮：
  [设为目标]  →  创建 Goal (cluster_id=当前 Cluster, source='manual')
  [和路路聊聊 →]  →  打开参谋对话讨论这个想法
当   (When)   用户点击 [设为目标]
那么 (Then)   POST /api/v1/goals { title: Strike.nucleus, cluster_id, source: 'manual' }
并且 (And)    该 Seed 从种子区移入正在长区
并且 (And)    触发 auto-link 扫描相关 Todo
```

### 场景 8: 沉默区唤醒
```
假设 (Given)  侧边栏沉默区有 Cluster「健康管理」
当   (When)   用户点击进入
那么 (Then)   显示生命周期视图，但只有 Seeds 区有内容
并且 (And)    底部显示路路提示：「这个方向有 N 个想法还没行动，要聊聊吗？」
当   (When)   用户通过对话明确了方向
那么 (Then)   创建 Goal → Cluster 从沉默区升入活跃方向
```

### 场景 9: 新建方向
```
假设 (Given)  侧边栏打开
当   (When)   用户点击「我的方向」旁的 + 按钮
那么 (Then)   不弹出表单，而是打开参谋对话 overlay：
  路路：「你在想什么新方向？说说看。」
当   (When)   用户回答（如 "我想开始量化交易"）
那么 (Then)   AI 分析后：
  1. 创建 Goal (source='explicit')
  2. 如果存在相关 Cluster → 关联 cluster_id
  3. 如果不存在 → 创建 seed Cluster (is_cluster=true, nucleus=提取的主题)
  4. auto-link 扫描已有 Strikes / Todos
并且 (And)    对话继续：路路可以追问「具体想从哪里开始？」
并且 (And)    用户回答可能产生子 Goal 或首批 Todo
```

### 场景 10: 筛选状态持久化
```
假设 (Given)  用户选中了主题「供应链管理」
当   (When)   在「进展」和「脉络」间切换 Tab
那么 (Then)   筛选不丢失，两个 Tab 都过滤为该主题
当   (When)   App 退到后台再恢复
那么 (Then)   恢复上次的筛选状态（localStorage 持久化）
当   (When)   从通知/深度链接跳转到某个待办
那么 (Then)   自动设置该待办所属 Goal 的 Cluster 为筛选主题
```

### 场景 11: Tier2 酝酿期 — 涌现前的等待态
```
假设 (Given)  用户已录入 1-4 条日记，Tier2 尚未首次运行（需累计 5 个 Strike）
当   (When)   侧边栏打开 / 主题生命周期视图加载
那么 (Then)   「我的方向」区域不显示空白，而是显示酝酿态：
  ┌─────────────────────────────────┐
  │  我的方向                   +   │
  │                                 │
  │  🌱 路路正在观察你的想法...      │  ← 酝酿态卡片
  │     已收集 3/5 条，再多聊几条    │  ← 进度指示
  │     路路就能帮你梳理方向了       │
  └─────────────────────────────────┘
并且 (And)    🌱 图标用 deer 色微呼吸动画（暗示正在生长）
并且 (And)    "3/5" 实时更新（Strike 数 / Tier2 触发阈值 5）
并且 (And)    如果有 cold-start-onboarding 产出的 suggested Goal，直接在下方显示
当   (When)   Tier2 首次运行完成
那么 (Then)   酝酿态消失，替换为正常的活跃方向 / 沉默区列表
并且 (And)    过渡动画：酝酿卡片展开变形为主题列表（300ms spring）
```

### 场景 12: 冷启动种子数据 — 引导完成即有内容
```
假设 (Given)  用户完成冷启动 5 问引导
当   (When)   进入工作区
那么 (Then)   引导中的回答已作为种子数据：
  - Q3 回答（"最近最花心思的事"）→ 至少产出 1 个 suggested Goal
  - Q4 回答（"想过就忘还是拖着"）→ 可能产出首批 Todo（如 AI 识别出具体行动）
  - Q2 回答 → 提取的关键词作为 seed Cluster 的 nucleus
并且 (And)    侧边栏显示：
  - 酝酿态（3/5 进度）+ 1 个 suggested Goal（来自 Q3）
  - 或者如果引导回答足够具体，直接显示 1 个活跃方向
并且 (And)    待办视图显示：
  - Now Card 可能有内容（来自 Q3/Q4 产出的 Todo）
  - 待确认区有 suggested Goal
并且 (And)    用户不会面对完全空白的界面
注意: 与 cold-start-onboarding.md 场景 2-3 协作，确保前 5 条即时 Digest 产出 Strike
```

---

## 接口约定

### 新增 API

```
GET /api/v1/topics
  → 聚合 Cluster + Goal + Strike 统计，返回主题列表
  响应: [{
    clusterId: string,          // Cluster Strike ID
    title: string,              // Cluster nucleus
    memberCount: number,        // Cluster 内 Strike 数
    activeGoals: [{ id, title }],  // 关联的 active Goals（最多 3 个）
    lastActivity: string,       // 最近 Strike 时间
    intendDensity: number,      // intend 占比（用于判断活跃/沉默）
    hasActiveGoal: boolean      // 是否有 active Goal
  }]

GET /api/v1/topics/:clusterId/lifecycle
  → 返回主题的四阶段生命周期数据
  响应: {
    now: Todo[],                // 今日该主题下的待办
    growing: [{                 // active Goals + 子 Todo
      goal: Goal,
      todos: Todo[],
      completionPercent: number
    }],
    seeds: Strike[],            // Cluster 内未关联 Goal 的 intend/perceive Strikes
    harvest: [{                 // completed Goals + 回顾 Strike
      goal: Goal,
      reviewStrike: Strike | null,
      completedAt: string
    }]
  }

GET /api/v1/records?cluster_id=xxx
  → 三重匹配筛选（认知关联 + 行动关联 + 语义关联）
  → 返回与 Cluster 相关的日记 Record 列表

POST /api/v1/goals/:id/harvest
  → 触发收获沉淀（Goal 完成时后端自动调用，也可手动触发）
  → 生成回顾 Strike，关联到 Cluster
```

### 现有 API 修改

```
GET /api/v1/action-panel
  → 新增可选参数 ?cluster_id=xxx，筛选 Now Card 来源

GET /api/v1/goals
  → 响应新增 cluster_title 字段（方便前端显示所属主题）
```

---

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/routes/topics.ts` | 主题列表 + 生命周期 API |
| 新建 `gateway/src/cognitive/harvest.ts` | 收获沉淀引擎（Goal 完成 → 回顾 Strike） |
| `gateway/src/cognitive/goal-linker.ts` | 修改：Goal 完成时调用 harvest |
| `gateway/src/cognitive/action-panel.ts` | 修改：支持 cluster_id 筛选 |
| `gateway/src/routes/action-panel.ts` | 修改：接收 cluster_id 参数 |
| `features/sidebar/components/sidebar-drawer.tsx` | 重写：主题列表（活跃/独立/沉默三区） |
| `features/workspace/components/workspace-header.tsx` | 修改：筛选药丸 + Tab 文字联动 |
| `features/workspace/components/todo-workspace-view.tsx` | 修改：筛选态四阶段布局 |
| 新建 `features/workspace/components/topic-lifecycle-view.tsx` | 主题生命周期视图（Now/Growing/Seeds/Harvest） |
| 新建 `features/workspace/hooks/use-topic-lifecycle.ts` | 生命周期数据 hook |
| 新建 `shared/lib/api/topics.ts` | 主题 API client |
| `shared/lib/types.ts` | 新增 Topic, TopicLifecycle 类型 |
| `app/page.tsx` | 修改：筛选 state + Tab 联动逻辑 |

---

## 边界条件

- [ ] Cluster 成员很少（< 3）：不在主题列表中显示，避免碎片化
- [ ] Goal 没有 cluster_id：归入「独立目标」区，不影响展示
- [ ] 一个 Goal 的 Cluster 被合并（L1→L2 升级）：cluster_id 需随之更新
- [ ] 空 Now 区：不显示 Now Card 区域，直接从 Growing 开始
- [ ] 空 Seeds 区：不显示种子区
- [ ] 空 Harvest 区：不显示收获区
- [ ] 所有区都空（新 Cluster）：显示空态 + 路路鼓励语
- [ ] 收获沉淀 AI 调用失败：Goal 仍标记 completed，harvest Strike 异步重试
- [ ] 多个 Goal 同时完成：每个独立生成回顾 Strike
- [ ] prefers-reduced-motion：阶段间渐变动画降级为 instant

## 验收标准

选中侧边栏主题后，用户在一个视图内看到一件事从萌芽到收获的完整生命画面；Goal 完成后自动沉淀为收获；收获的认知反哺 Cluster 触发新的涌现。

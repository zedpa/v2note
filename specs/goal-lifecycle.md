---
id: "085"
title: "目标全生命周期"
status: active
domain: goal
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 目标全生命周期

> 状态：⚠️ 部分完成（核心CRUD✅，Skip→alert和7天result追踪不完整）| 优先级：Phase 4（目标闭环）
> 依赖：todo-strike-bridge（数据桥梁）

## 概述
合并旧方案的 goals-scaffold + goal-auto-link + action-tracking + goal-granularity 慢路径。目标从涌现/创建→进展→阻力→完成→归档的全生命周期在 UI 上完整可见。目标通过 cluster_id 与认知系统打通，健康度从 Strike 极性统计自动计算。

**核心改变：** goal 不再是独立实体，而是 Cluster 的行动视图。

## 场景

### 前端骨架（原 goals-scaffold）

#### 场景 1: 目标列表页
```
假设 (Given)  用户有 3 个 active 目标，1 个 suggested 目标
当   (When)   进入目标场景 /goals
那么 (Then)   显示三层嵌套结构：项目卡片 > 目标卡片 > 行动项
并且 (And)    suggested 目标在底部"未归属"区域，带"新"标记
并且 (And)    每个目标卡片显示：名称 + 关联日记数 + 待办完成率
```

#### 场景 2: 目标详情面板
```
假设 (Given)  用户点击目标 "评估供应商"
当   (When)   右侧详情面板展开
那么 (Then)   显示：
      - 健康度四维条（方向/资源/路径/驱动）
      - 相关日记列表（通过 cluster_id 的 Cluster 成员 Strike 追溯）
      - 关联待办列表（可勾选完成）
      - "深入讨论"按钮（触发参谋对话）
```

#### 场景 3: 手动创建目标
```
假设 (Given)  用户点击"+"按钮
当   (When)   输入目标名称 "Q2供应链重建"
那么 (Then)   创建 goal + 对应 Cluster（is_cluster=true, level=1, origin='user'）
并且 (And)    goal.cluster_id 指向该 Cluster
并且 (And)    可选择父目标（项目归属）
```

#### 场景 4: 确认/删除 suggested 目标
```
假设 (Given)  涌现引擎产出 suggested 目标
当   (When)   用户点击"确认" → status 'suggested' → 'active'
当   (When)   用户点击"忽略" → status → 'dismissed'
```

#### 场景 5: 目标归档
```
假设 (Given)  用户认为目标已完成或放弃
当   (When)   长按目标 → 选择"归档"
那么 (Then)   status → 'archived'，关联 Cluster 不受影响
```

### 自动关联（原 goal-auto-link）

#### 场景 6: 目标创建后全量关联扫描
```
假设 (Given)  新目标 "评估是否换供应商" 被创建
当   (When)   系统执行 goalAutoLink(goalId)
那么 (Then)   通过 cluster_id 的 Cluster 成员 → 找到相关日记
并且 (And)    通过 embedding 匹配相关 todo → 关联到该目标
并且 (And)    目标详情立刻显示 "12条相关记录、3个待办"
```

#### 场景 7: 新日记自动关联已有目标
```
假设 (Given)  用户有 active 目标 "评估供应商"（关联 Cluster）
并且 (And)    用户录入新日记提到供应商相关内容
当   (When)   Digest L1 完成
那么 (Then)   新 Strike 若被 clustering 归入该 Cluster → 自动关联到 goal
并且 (And)    目标的"相关记录"计数 +1
```

#### 场景 8: 健康度四要素自动计算
```
假设 (Given)  目标 "评估供应商" 关联 Cluster 有 20 个成员 Strike
当   (When)   请求目标健康度 GET /api/v1/goals/:id/health
那么 (Then)   计算四维度分数 (0-100):
      方向 = Cluster 中 intend Strike 占比 × 100
      资源 = Cluster 中 perceive Strike 含可用信息数
      路径 = 关联 todo 中已完成比例 × 100
      驱动 = Cluster 中 feel/judge Strike 数 > 0 ? 高 : 低
```

### 行动事件追踪（原 action-tracking）

#### 场景 9: 跳过行为持久化
```
假设 (Given)  用户左滑行动 → 选择 "🚧有阻力"
当   (When)   事件提交 POST /api/v1/action-panel/event
那么 (Then)   写入 action_event (todo_id, type='skip', reason='resistance')
并且 (And)    todo.skip_count += 1
```

#### 场景 10: 完成行为持久化
```
假设 (Given)  用户右滑完成行动
当   (When)   事件提交
那么 (Then)   写入 action_event (type='complete')
并且 (And)    todo 标记完成 → 关联 Strike salience 降低 → goal 完成率更新
```

#### 场景 11: 跳过回流认知引擎
```
假设 (Given)  某行动被跳过 3+ 次
当   (When)   daily-cycle 执行 alert 生成
那么 (Then)   生成 alert："'审阅小李报告'已 3 次跳过，原因：有阻力"
并且 (And)    alert 进入每日回顾洞察区（认知报告）
```

#### 场景 12: 结果追踪提示
```
假设 (Given)  todo 完成已过 7 天 + 关联 goal 仍 active
当   (When)   晚间回顾生成
那么 (Then)   路路提问："'打给张总确认报价'完成一周了，结果怎样？"
```

### 涌现目标（原 goal-granularity 慢路径）

#### 场景 13: intend 密度超标触发目标涌现
```
假设 (Given)  Cluster "供应链管理" 有 20 个 think Strike
并且 (And)    其中 7 个 polarity='intend'，密度 35% > 阈值 30%
并且 (And)    该 Cluster 无已关联 active goal
当   (When)   周涌现引擎运行
那么 (Then)   AI 审核 7 个 intend Strike 是否指向同一方向
并且 (And)    如果是，创建 goal (status='suggested', cluster_id=该Cluster)
```

#### 场景 14: 手动目标不重复涌现
```
假设 (Given)  用户已手动创建 "评估供应商"（active，cluster_id 指向 Cluster）
当   (When)   涌现引擎发现同 Cluster intend 密度超标
那么 (Then)   不创建重复的 suggested 目标
并且 (And)    可能关联更多日记到已有目标
```

### 目标状态（新增）

#### 场景 15: 目标状态流转
```
假设 (Given)  goal 有以下状态：suggested → active → progressing → blocked → completed → archived
当   (When)   状态变化
那么 (Then)
      suggested → active：用户确认
      active → progressing：有关联 todo 被完成
      progressing → blocked：有关联 todo 连续跳过 3 次
      progressing → completed：所有关联 todo 完成 + 用户确认
      任何 → archived：用户手动
并且 (And)    状态变化触发认知引擎事件（写入 cognitive_report）
```

#### 场景 16: 目标时间线
```
假设 (Given)  目标"供应商评估" 关联 Cluster 有 15 条相关日记
当   (When)   查看目标详情
那么 (Then)   显示简易时间线：只展示和该目标相关的日记
并且 (And)    按时间排列
并且 (And)    每条日记旁标注关系类型（支持/行动/结果）
```

### 场景 17.1: 同语义目标不重复出现 <!-- ✅ completed (fix-goal-quality) -->
```
假设 (Given)  用户之前录音已形成目标"学英语"
当   (When)   用户再次录音表达相似意愿如"英语学习计划要调整一下"
那么 (Then)   侧边栏目标列表中不出现第二个同语义的目标
并且 (And)    用户看到的"学英语"目标内容被更新
```

### 场景 17.2: 目标挂载到相关主题之下 <!-- ✅ completed (fix-goal-quality) -->
```
假设 (Given)  侧边栏已有主题页"工作"
当   (When)   用户录音"今年要把业绩做到300万"
那么 (Then)   侧边栏"工作"节点下出现新的目标子页"年度业绩300万"
并且 (And)    目标不再作为顶层节点平铺
```

### 场景 17.3: 空壳目标自���清退 <!-- ✅ completed (fix-goal-stale-cleanup) -->
```
假设 (Given)  用��有一个 level>=1 的目标，创建已超过 7 天，且无任何子任务
当   (When)   每日 3AM 维护执行
那么 (Then)   该目标从侧边栏消失（被系统标记为 dismissed���
并且 (And)    关联的 wiki_page 被归档
���且 (And)    创建不满 7 天的目标不受影响
```

### 场景 17.4: 过期 suggested 目标自动清退 <!-- ✅ completed (fix-goal-stale-cleanup) -->
```
假设 (Given)  AI 建议了一个目标，用户超过 14 天未确认
当   (When)   每日 3AM 维护执行
那么 (Then)   该 suggested 目标从列表消失（被标记为 dismissed）
```

### 场景 17.5: 口语化短期事项不被提取为目标 <!-- ✅ completed (fix-goal-stale-cleanup) -->
```
假设 (Given)  用户录音说"今天要去买菜"或"下午开会"
当   (When)   wiki-compiler 编译日记
那么 (Then)   这些口语��一次性事项不���出现在目标列表中
并且 (And)    只有持续性意图（需多步/多日完成）才被创建为目标
```

## 数据库变更
- goal 表新增状态值：'progressing', 'blocked'（扩展现有 CHECK）
- 新表 action_event (id, todo_id, type, reason, timestamp)
- ~~goal 表加 cluster_id~~（strike 系统已删除，cluster_id 列已在迁移 070 中 DROP）

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `features/goals/` | 目标模块：components + hooks |
| 新建 `gateway/src/cognitive/goal-linker.ts` | 全量关联 + 增量关联 + 健康度 |
| 新 migration | action_event 表 + goal 状态扩展 |
| `gateway/src/cognitive/alerts.ts` | 修改：加跳过频率 alert |
| `gateway/src/cognitive/emergence.ts` | 修改：intend 密度涌现逻辑 |
| `gateway/src/routes/goals.ts` | 新增：GET /goals/:id/health |

## AI 调用
- 全量关联：0 次（embedding 匹配）
- 健康度计算：0 次（规则计算）
- 涌现目标审核：1 次/周
- 行动追踪：0 次（纯事件记录）

## 验收标准
目标从涌现/创建→进展→阻力→完成→归档的全生命周期在 UI 上完整可见。健康度四维条有值。跳过 3 次的行动在晚间回顾中被路路提及。

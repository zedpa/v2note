---
id: "cognitive-wiki-lifecycle"
status: active
domain: cognitive
risk: high
dependencies: ["cognitive-wiki-core.md", "topic-lifecycle.md"]
superseded_by: null
created: 2026-04-17
updated: 2026-04-17
---

# 认知 Wiki — 搜索、热力与前端适配

> 本文件是 `cognitive-wiki.md` 的拆分子域，承载：搜索 + 知识热力与生命周期 + 前端适配 + 迁移策略 + 验收行为 + 边界条件
> 姊妹文件：
> - `cognitive-wiki-core.md` — 概述 + 数据模型 + 实时 Ingest + 每日编译
> - `cognitive-wiki-migration.md` — 依赖 / 接口约定 / 砍掉的模块 / Implementation Phases（含 Batch 3/4）/ 备注

## 4. 搜索（替换 Strike embedding 搜索）

### 场景 4.1: 双层搜索模型
```
假设 (Given)  用户搜索关键字（如"铝价"）
当   (When)   执行搜索
那么 (Then)   返回两层结果：
  Layer 1 — Wiki 层（AI 编译的知识）：
    - 关键字匹配 wiki page content（全文搜索）
    - embedding 相似度匹配 wiki page（向量搜索）
    - 返回：page title + 匹配段落 + 相关目标 + 矛盾
  Layer 2 — Record 层（原始素材补充）：
    - 全文搜索 Record transcript/summary
    - 返回：匹配的原始日记条目
并且 (And)    搜索结果优先展示 Wiki 层（已编译的知识抽象）
并且 (And)    Record 层作为"查看原文"的补充细节
```

### 场景 4.2: Chat 参谋搜索上下文
```
假设 (Given)  用户在参谋对话中提问
当   (When)   AI 检索上下文
那么 (Then)   优先从 wiki page 中检索（高层认知 + 决策链 + 矛盾）
并且 (And)    如果需要细节，再从 Record 中补充原始素材
并且 (And)    wiki page 的结构化 content 比孤立 strike nucleus 提供了更丰富的上下文
```

---

## 4b. 知识热力与生命周期

### 设计思路

每个 wiki page 有一个 `heat_score`（热力分数），反映它近期被"触碰"的频率和强度。
采用**指数时间衰减**模型：每次触碰贡献一个加权分值，但贡献随时间指数衰减。

```
heat_score = Σ (weight[event_type] × e^(-λ × days_since_event))

λ = ln(2) / half_life     半衰期默认 14 天（两周前的活动只值今天的一半）
```

事件权重：
| 事件类型 | 权重 | 触发时机 |
|---------|------|---------|
| compile_hit | 3.0 | 每日编译时有新内容写入该 page |
| search_hit | 1.0 | 搜索结果命中该 page |
| view_hit | 0.5 | 用户在 lifecycle 视图中浏览该 page |
| chat_context_hit | 2.0 | 参谋对话检索到该 page 作为上下文 |
| goal_active_bonus | 5.0 | 每日计算时该 page 有 active goal（持续贡献） |

生命周期阶段：
| 阶段 | heat_score | UI 表现 | 自动行为 |
|------|-----------|---------|---------|
| 🔥 热门 | > 8.0 | 醒目、热点地图高亮 | 无 |
| 🌿 活跃 | 3.0 - 8.0 | 正常显示 | 无 |
| 🌙 沉默 | 1.0 - 3.0 | 灰色弱化 | 无 |
| 🧊 冰封 | < 1.0 且持续 30+ 天 | 折叠到"冰封区" | 候选归档 |
| 📦 归档 | 人工确认后 | 不在列表显示 | content 精简为摘要 |

### 场景 4b.1: 活动事件记录
```
假设 (Given)  wiki page 被各种方式"触碰"
当   (When)   以下事件发生：
  - 每日编译写入了该 page（compile_hit）
  - 搜索结果命中该 page（search_hit）
  - 用户浏览了该 page 的 lifecycle 视图（view_hit）
  - 参谋对话检索该 page 作为上下文（chat_context_hit）
那么 (Then)   向 wiki_page_event 表插入一条事件记录：
  { wiki_page_id, event_type, created_at }
并且 (And)    写入是 fire-and-forget，不阻塞主流程
并且 (And)    同一 page 同一类型事件同一天内最多记录 10 条（防刷）
```

### 场景 4b.2: 每日热力分数计算
```
假设 (Given)  每日编译完成后（或定时任务 3:30AM）
当   (When)   触发热力分数计算
那么 (Then)   对每个 active wiki page：
  1. 查询该 page 最近 90 天的 wiki_page_event 记录
  2. 按公式计算 heat_score：Σ (weight × e^(-λ × days_ago))
  3. 如果该 page 有 active goal，额外加 goal_active_bonus（不衰减）
  4. 更新 wiki_page.heat_score 和 wiki_page.heat_phase：
     - heat_phase = 'hot' | 'active' | 'silent' | 'frozen'
  5. 子 page 的热力不向上聚合（parent page 有自己的活动）
并且 (And)    90 天前的 event 记录可安全清理（不影响计算）
并且 (And)    热力计算为纯数据库操作，无 AI 成本
```

### 场景 4b.3: 冰封与候选归档
```
假设 (Given)  某 wiki page heat_score < 1.0 持续 30 天以上
当   (When)   每日热力计算后判定为 frozen
那么 (Then)   该 page heat_phase 标记为 'frozen'
并且 (And)    侧边栏中该 page 折叠到"冰封区"（灰色 + 雪花图标）
并且 (And)    不自动归档——需要用户确认
当   (When)   AI 每日编译时发现有 frozen page
那么 (Then)   在编译变更摘要中提示："以下知识已沉寂 30+ 天，是否需要归档？"
  - 列出 frozen page 的 title + 最后活跃时间 + 一句话摘要
并且 (And)    用户可以：
  - 忽略（保持 frozen）
  - 确认归档 → status='archived'，content 精简为一句话摘要，原文存入 metadata.archived_content
  - 唤醒 → 手动浏览或在对话中提及，产生 view_hit/chat_context_hit，heat_score 回升
```

### 场景 4b.4: 热力回升（自然唤醒）
```
假设 (Given)  一个 frozen 或 silent 的 wiki page "旅行规划"
当   (When)   用户在参谋对话中提到"旅行"，检索命中该 page
那么 (Then)   产生 chat_context_hit 事件（权重 2.0）
并且 (And)    下次热力计算后 heat_score 上升
并且 (And)    如果从 frozen 回升到 silent 以上 → 自动从冰封区移回正常列表
当   (When)   用户在新日记中提到旅行相关内容
那么 (Then)   每日编译将新内容写入该 page → compile_hit 事件（权重 3.0）
并且 (And)    page 可能在一次编译内从 frozen 跳到 active
```

### 场景 4b.5: 归档 page 的恢复
```
假设 (Given)  一个已归档的 wiki page
当   (When)   搜索/编译命中了它（通过 summary 或 embedding）
那么 (Then)   提示用户："这个方向之前被归档了，要恢复吗？"
当   (When)   用户确认恢复
那么 (Then)   从 metadata.archived_content 恢复完整 content
并且 (And)    status 改回 'active'，heat_phase 设为 'active'
并且 (And)    产生一个 compile_hit 事件，确保下次计算时有基础分
```

### 场景 4b.6: 个人热点地图
```
假设 (Given)  用户想看自己的知识全貌
当   (When)   打开热点地图视图（未来功能）
那么 (Then)   展示所有 wiki page 的热力可视化：
  - 每个 page 是一个节点，面积 ∝ heat_score
  - 颜色：🔥红（hot）→ 🌿绿（active）→ 🌙灰（silent）→ 🧊蓝（frozen）
  - 布局按 domain 分区
  - parent-children 关系用连线表示
  - 点击节点 → 跳转到该 page 的 lifecycle 视图
并且 (And)    热点地图数据来自 wiki 热力统计结果
并且 (And)    具体 UI 设计不在本 spec 范围（本 spec 只定义数据层）
```

---

## 5. 前端适配 + topic-lifecycle.md 场景对照

> topic-lifecycle.md（099）的 12 个场景中，6 个需要重写数据源，6 个需要改变行为逻辑。
> 本节逐一对照，不能简单声称"只是换数据源"。

### 场景 5.1: 侧边栏主题列表（对应 099 场景 1）
```
假设 (Given)  原 topic-lifecycle.md 场景 1 从 Cluster 获取主题列表
当   (When)   切换到 wiki 模式
那么 (Then)   数据源改为 wiki_page 表：
  - 活跃方向：有 active goal 的 wiki page（level >= 2 或 parent_id IS NULL）
  - 独立目标：goal.wiki_page_id IS NULL 的 goal
  - 沉默区：有内容但无 active goal 的 wiki page
并且 (And)    主题列表数据结构需适配：
  原字段 clusterId → 改为 wikiPageId
  原字段 memberCount → 改为 recordCount（通过 wiki_page_record 统计）
  原字段 intendDensity → 删除（wiki 模式不再有此概念）
  新增字段 level, parentId
  保持不变：title(←page.title), activeGoals, lastActivity, hasActiveGoal
并且 (And)    前端需适配字段重命名（clusterId → wikiPageId）
```

### 场景 5.2: 全局筛选 + Tab 变化（对应 099 场景 2）
```
假设 (Given)  原场景 2 基于 clusterId 筛选
当   (When)   切换到 wiki 模式
那么 (Then)   筛选参数改为 wikiPageId，其余交互逻辑不变
并且 (And)    药丸显示 wiki page title（和原来显示 cluster nucleus 相同）
```

### 场景 5.3: 生命周期视图四阶段（对应 099 场景 3）
```
假设 (Given)  原场景 3 的四阶段视图
当   (When)   切换到 wiki 模式
那么 (Then)   数据映射变化：
  | 阶段 | 原数据源 | 新数据源 | 变化程度 |
  |------|---------|---------|---------|
  | Now | Todo(goal.cluster_id=X) | Todo(goal.wiki_page_id=X) | 换字段 |
  | Growing | Goal(cluster_id=X) | Goal(wiki_page_id=X) | 换字段 |
  | Seeds | Strike(intend,在Cluster内) | wiki page 中 AI 标注的 "待行动洞察" 段落 | **重写** |
  | Harvest | Goal(completed)+回顾Strike | Goal(completed) + wiki page 收获段落 | **重写** |
并且 (And)    Seeds 重写：不再是 Strike 对象列表，而是从 wiki page content 中解析 "## 核心认知" 段落中标注为未行动的条目
并且 (And)    Harvest 重写：不再依赖"回顾 Strike"对象，改为从 wiki page content "## 关键决策链" 中提取已完成目标的收获描述
并且 (And)    生命周期视图的数据类型需更新：seeds 从 Strike 列表改为 WikiInsight 列表，harvest 中 reviewStrike 改为 reviewText
```

### 场景 5.4: 脉络 Tab — Record 筛选（对应 099 场景 4）
```
假设 (Given)  原场景 4 通过 cluster_id 三重匹配筛选 Record
当   (When)   切换到 wiki 模式
那么 (Then)   筛选逻辑简化为：
  1. wiki_page_record 关联表中 wiki_page_id 匹配（精确指针）
  2. record.embedding 与 wiki_page.embedding 相似度 > 0.6（语义补充）
并且 (And)    不再需要经过 strike → bond → cluster 的间接关联链
```

### 场景 5.5: 收获沉淀（对应 099 场景 5 — 行为重写）
```
假设 (Given)  原场景 5：Goal 完成 → 自动生成回顾 Strike → 关联到 Cluster
当   (When)   切换到 wiki 模式
那么 (Then)   行为改为：
  Goal 完成 → 下次每日编译时 AI 自动在 wiki page 的 "## 关键决策链" 追加收获记录
  不再创建独立的"回顾 Strike"
并且 (And)    收获描述直接写入 wiki page content（保留叙事语境）
并且 (And)    Goal.status 更新为 completed → AI 在编译时感知并同步到 wiki page
```

### 场景 5.6: 收获追问（对应 099 场景 6 — 行为重写）
```
假设 (Given)  原场景 6：用户回答追问 → Digest 产出 Strike → 关联到 Cluster
当   (When)   切换到 wiki 模式
那么 (Then)   用户回答作为新 Record → pending_compile → 下次编译时 AI 编入 wiki page
并且 (And)    不再经过 Strike 拆解，回答的完整语境直接编译到 wiki page
```

### 场景 5.7: 种子晋升（对应 099 场景 7 — 重写）
```
假设 (Given)  原场景 7：点击 Seed Strike → 设为目标 / 和路路聊聊
当   (When)   切换到 wiki 模式
那么 (Then)   Seeds 改为 wiki page 中的段落条目，不是独立的 Strike 对象
  - 点击 seed 条目 → 展开显示该段落的来源 Record（通过 rec:UUID 指针）
  - [设为目标] → 创建 Goal(wiki_page_id=当前page)
  - [和路路聊聊] → 打开参谋对话，上下文包含该 wiki page 的相关段落
并且 (And)    前端需要新组件渲染 wiki 段落条目（替代原来的 Strike 卡片）
```

### 场景 5.8: 新建方向（对应 099 场景 9 — 重写）
```
假设 (Given)  原场景 9：用户新建方向 → 创建 seed Cluster
当   (When)   切换到 wiki 模式
那么 (Then)   用户新建方向 → 参谋对话产出的 Record → pending_compile
  → 下次编译时 AI 判断是否创建新 wiki page 或归入已有 page
并且 (And)    如果用户明确要求"创建新方向"，可立即创建空 wiki page（content 待编译填充）
并且 (And)    创建的 Goal 直接关联到该 wiki page
```

### 场景 5.9: 酝酿期（对应 099 场景 11 — 数据源切换）
```
假设 (Given)  原场景 11：酝酿态显示 Strike 进度 "3/5"
当   (When)   切换到 wiki 模式
那么 (Then)   酝酿态改为显示 Record 数量 vs 首次编译阈值：
  "已收集 N 条日记，路路正在消化..."
  首次编译阈值：≥ 3 条 Record（比原来的 5 Strike 更直观）
当   (When)   首次每日编译完成
那么 (Then)   酝酿态消失，wiki page 列表替换显示
```

### 场景 5.10: 冷启动种子（对应 099 场景 12 — 数据源切换）
```
假设 (Given)  原场景 12：引导回答产出 Strike → suggested Goal
当   (When)   切换到 wiki 模式
那么 (Then)   引导回答作为 Record → 首次编译时 AI 编入初始 wiki page
并且 (And)    intend 抽取照常产出 suggested Goal/Todo（实时，不等编译）
```

---

## 6. 迁移策略（Strike → Wiki）

### 场景 6.1: 数据迁移
```
假设 (Given)  系统中已有 Strike + Cluster 数据
当   (When)   执行迁移
那么 (Then)   分步进行：
  Step 1: 保留现有 strike/bond 表不删除（只读，作为历史参考）
  Step 2: 创建 wiki_page 表 + 新字段（wiki_page_id on goal/todo）
  Step 3: 运行一次性迁移脚本：
    - 每个 active L1/L2 Cluster → 创建一个 wiki page
    - wiki page content 由 AI 从 cluster 成员 strikes 的 nucleus 编译生成
    - 关联 Record 通过 strike.source_id 回溯到 wiki_page_record 关联
    - goal.cluster_id 映射为 goal.wiki_page_id
  Step 4: 验证迁移完整性（goal 关联、record 覆盖率）
  Step 5: 新管线上线（ingest 不再拆 strike，每日编译启动）
  Step 6: 观察期（2 周），确认无问题后废弃 strike 相关代码路径
```

### 场景 6.2: 兼容期处理
```
假设 (Given)  迁移期间新旧管线共存
当   (When)   兼容期内
那么 (Then)   新 Record 只走新管线（pending_compile）
并且 (And)    旧 Strike/Cluster 数据只读，不再有新写入
并且 (And)    搜索同时查 wiki page + 旧 strike（兼容期内）
并且 (And)    前端通过 feature flag 切换数据源（topic-lifecycle 视图）
```

### 场景 6.3: 旧 domain 分类下线后搜索与展示一致 <!-- ✅ completed (fix-domain-deprecation) -->
```
假设 (Given)  系统已停用旧 domain 分类字段，改由 wiki page 标题承载主题
当   (When)   用户对 AI 说"搜索工作相关的待办"
那么 (Then)   用户看到与"工作"主题 page 关联的待办列表
并且 (And)    新创建的记录和待办不再出现旧 domain 标签
并且 (And)    用户在侧边栏和目标视图中仍能按主题正常浏览
```

---

## 验收行为（E2E 锚点）

> 以下描述纯用户视角的操作路径，不涉及内部实现，用于生成独立的 E2E 测试。

### 行为 1: 每日编译生成 wiki page
1. 用户当日录入 3 条语音日记（涉及"工作"和"健康"两个话题）
2. 系统触发每日编译
3. 编译后 GET /api/v1/wiki/pages 返回至少 1 个 wiki page
4. wiki page content 中包含 3 条日记中提到的关键信息
5. wiki page content 中包含 [→ rec:UUID] 指针指向原始日记

### 行为 2: wiki page 自动拆分
1. 用户在 7 天内录入 20+ 条日记，涉及 3 个不同话题
2. 每日编译持续运行
3. 当某个 wiki page 内容足够丰富时，编译自动拆分为 parent + children
4. GET /api/v1/wiki/pages 返回 parent page（有 children）和子 page
5. 子 page 各自聚焦一个子话题

### 行为 3: 侧边栏显示 wiki-based 主题
1. 用户打开侧边栏
2. 「我的方向」区域显示基于 wiki page 的主题列表
3. 有 active goal 的主题显示在「活跃方向」
4. 无 goal 的主题显示在「沉默区」
5. 点击主题 → 进入生命周期视图，Seeds 显示 wiki 段落（非 Strike 卡片）

### 行为 4: 双层搜索
1. 用户搜索关键字
2. 结果分两层：Wiki 层（page title + 匹配段落）+ Record 层（原始日记）
3. Wiki 层结果包含 AI 编译的知识抽象和关系
4. Record 层结果包含原始细节

### 行为 5: 待办实时抽取不受编译影响
1. 用户录入"明天下午3点开会"
2. 待办立即出现在待办列表中（不等每日编译）
3. 编译后该待办自动关联到对应 wiki page

---

## 边界条件

- [ ] 用户只有 1 条 Record：首次编译创建一个宽泛 L3 page，不强制结构化
- [ ] 单次编译新 Record 数量过大（>50）：分批编译，每批不超过 30 条
- [ ] AI 编译调用超时（>5min）：重试一次，仍失败则 Record 保持 pending 状态
- [ ] Wiki page content 超长（>10000 字）：AI 应主动触发拆分
- [ ] 两个 page 互相引用导致合并循环：AI 只允许单向合并，校验 merged_into 无环
- [ ] 外部素材占比 >80%：AI 不创建新 page，只追加到已有 page 的参考段落
- [ ] Goal 在 UI 被删除：下次编译时 AI 从 wiki page 中移除对应段落
- [ ] 并发编译（定时 + 手动同时触发）：用户级排他锁
- [ ] 迁移期间搜索：同时查 wiki + 旧 strike，结果去重
- [ ] Record 被删除后 wiki 中出现幽灵引用：needs_recompile + AI 清理（场景 3.9）
- [ ] Record 内容被用户编辑：content_hash 变化 → needs_recompile → 下次编译更新 wiki
- [ ] 同一 Record 在编辑后重复编译：content_hash 去重，相同 hash 跳过
- [ ] 确定性预抽取正则匹配错误（如"3点"误提取）：AI 调用时可修正预抽取结果
- [ ] 新建 page 初始 heat_score：首次编译赋予 compile_hit 基础分（3.0），避免新 page 出生即沉默
- [ ] 归档 page 被编译/搜索意外命中：只匹配 summary（content 已精简），提示用户恢复
- [ ] 热力计算期间大量 event 记录：纯 SQL 聚合，加 wiki_page_id 索引，单用户 < 100ms
- [ ] goal_active_bonus 不衰减：有 active goal 的 page 每天持续获得 5.0 分，保证项目型知识不被误冰封
- [ ] parent page 热力独立于 children：parent 只有被直接触碰时才加分，不自动聚合子页热力

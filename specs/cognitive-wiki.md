---
id: "119"
title: "认知 Wiki — 从原子拆解到知识编译"
status: active
domain: cognitive
risk: high
dependencies: ["todo-core.md", "topic-lifecycle.md"]
superseded_by: null
created: 2026-04-08
updated: 2026-04-08
---

# 认知 Wiki — 从原子拆解到知识编译

## 概述

**彻底替换现有的 Strike 拆解 → Cluster 聚类管线**，改为 LLM Wiki 编译模式：AI 阅读完整输入后直接编译到持久化知识页面（Wiki Page），保留因果链和叙事语境，不再拆碎成原子 Strike。

### 动机

当前管线 `Record → AI 拆成原子 Strike → AI 重新聚类 → Cluster` 存在根本性的信息损失：
- 用户说"铝价涨了5%，张总说供应链要调整，我觉得应该先囤原料，下周一开会"
- 被拆成 4 个孤立 Strike，因果链"铝价涨 → 张总提醒 → 囤货判断 → 开会行动"丢失
- Bond（strength 数字）无法承载叙事语境
- 聚类阶段只看到孤立的 nucleus 文本，无法恢复原始推理过程
- **本质矛盾**：先解构再建构 = 先增熵再逆熵 = 信息论上的净损失

### 新模式

灵感来源：[LLM Wiki Pattern](https://gist.github.com/442a6bf555914893e9891c11519de94f) — LLM 增量编译维护持久化知识库。

```
当前：Record → [拆成原子] → Strikes → [重新聚类] → Clusters
新版：Record → [直接编译到知识页] → Wiki Pages（持续维护）
```

三层结构：
1. **Record**（不可变原始素材）：日记、语音转录、聊天、外部素材
2. **Wiki Page**（AI 编译维护的知识文档）：结构化 markdown，含认知、决策链、矛盾、目标、源索引
3. **Schema**（编译规则）：本 spec + prompt 模板

### 核心设计原则

- **自顶向下拆分**：和现有 L1→L2→L3 聚类相反；初始所有内容在少数宽泛页面中，随内容膨胀自然拆分为子页（L3→L2→L1）
- **因果链天然保留**：AI 编译时看到完整输入，写入的是有叙事的段落而不是孤立原子
- **每日批处理**：AI 每天编译一次（3AM），不做实时拆解
- **待办独立抽取**：intend 仍然在 ingest 阶段实时提取，不经过 wiki 编译
- **双重表示**：目标在 wiki page 中叙事维护，同时数据库有结构化 record 供 UI 消费
- **增量编译**：内容寻址缓存，只处理变化的 Record，不重复处理已编译内容（借鉴 [Graphify](https://github.com/safishamsi/graphify) 的 SHA256 缓存模式）
- **确定性优先**：日期、人名、标签等结构化信息先用正则/规则抽取，LLM 只做语义编译（减少 token 成本）
- **置信度标注**：wiki page 中每条认知标注来源类型（用户原话 / AI 推断 / 语义关联），支持溯源审计
- **删除为一等公民**：Record 删除/归档时主动从 wiki page 中移除相关内容，不留"幽灵引用"

---

## 1. Wiki Page 数据模型

### 场景 1.1: Wiki Page 表结构
```
假设 (Given)  系统使用 PostgreSQL + pgvector
当   (When)   创建 wiki_page 表
那么 (Then)   表结构如下：
  - id: UUID PK
  - user_id: UUID FK → app_user
  - title: TEXT NOT NULL — 页面标题（2-8 个中文字符，如"供应链管理"）
  - content: TEXT NOT NULL — markdown 格式的知识文档（AI 编写维护）
  - summary: TEXT — 一句话摘要（用于索引和搜索结果展示）
  - parent_id: UUID FK → wiki_page（NULL 表示顶层页面）
  - level: INTEGER NOT NULL DEFAULT 3 — L3(顶层) / L2(拆分后) / L1(叶子)
  - status: TEXT CHECK IN ('active','archived','merged') DEFAULT 'active'
  - merged_into: UUID FK → wiki_page — 被合并到哪个页面
  - domain: TEXT — 分类标签，由 AI 编译时自动赋值（规则见场景 1.4）
  - embedding: vector(1024) — 页面摘要的向量
  - （record 关联通过 wiki_page_record 关联表实现，不在本表存储）
  - metadata: JSONB DEFAULT '{}' — 扩展字段（矛盾数、子页数等统计）
  - compiled_at: TIMESTAMPTZ — 最后一次 AI 编译时间
  - created_at: TIMESTAMPTZ DEFAULT now()
  - updated_at: TIMESTAMPTZ DEFAULT now()
并且 (And)    创建全文索引用于 content 关键字搜索
并且 (And)    创建 HNSW 索引用于 embedding 向量搜索
```

### 场景 1.2: Wiki Page 的 content 格式规范
```
假设 (Given)  AI 编译一个 wiki page
当   (When)   写入 content 字段
那么 (Then)   遵循以下 markdown 结构：

  ## 核心认知
  [AI 对该主题的综合理解，保留用户原话和因果链]

  ## 关键决策链
  - YYYY-MM-DD: [决策描述，含因果] [→ rec:UUID]
  - YYYY-MM-DD: [决策描述] [→ rec:UUID]

  ## 矛盾 / 未决
  - [矛盾描述]（状态：未解决/已解决）

  ## 目标
  - 【状态】目标标题 → goal:UUID
  - 【状态】目标标题 → goal:UUID

  ## 实体
  - [人名/组织/关键词]: [简述关系]

  ## 子页索引（仅当拆分发生时）
  - → [子页标题](wiki:UUID)

并且 (And)    每段叙事文字后附带 [→ rec:UUID] 指针，标注信息来源
并且 (And)    每条认知标注置信度标签（借鉴 Graphify 的 EXTRACTED/INFERRED/AMBIGUOUS 三级）：
  - `[直述]`：用户原话直接编译（如"铝价涨了5%"）
  - `[推断]`：AI 从多条 Record 归纳（如"近期供应链压力持续上升"）
  - `[关联]`：跨 page 的语义关联（如"与'产品推广'页面中的成本控制相关"）
并且 (And)    AI 禁止在 content 中添加自己的推理（"这表明..."），只编译用户说了什么
并且 (And)    `[推断]` 标签的内容必须标注推断依据（哪几条 Record）
并且 (And)    用户原话中的不确定语气（"可能""觉得"）和归属（"张总说"）必须保留
```

### 场景 1.4: Domain 分类规则
```
假设 (Given)  AI 创建或更新 wiki page
当   (When)   需要赋值 domain 字段
那么 (Then)   遵循以下规则：
  - domain 是简短中文一级分类："工作"、"生活"、"学习"、"健康"等
  - 可带二级路径："工作/采购"、"生活/旅行"
  - 优先复用该用户已有 page 的 domain 值（保持一致性）
  - 新建 page 时 AI 自行判断，不确定时设为 null
  - parent page 和 children page 共享相同 domain
  - 用户可通过 UI 手动修改 domain（下次编译时 AI 尊重用户选择）
```

### 场景 1.3: Wiki Page 与 Goal 的双重表示
```
假设 (Given)  wiki page 中 "## 目标" 段落记录了一个目标
当   (When)   AI 编译发现新目标 或 目标状态变化
那么 (Then)   同时更新 DB 的 goal/todo 表：
  - goal 表新增 wiki_page_id 字段，指向所属 wiki page
  - wiki page content 中的 "→ goal:UUID" 指针双向关联
并且 (And)    叙事真相在 wiki page（为什么有这个目标、推理过程、进展细节）
并且 (And)    操作真相在 DB goal record（status、deadline、priority — UI 直接消费）
当   (When)   用户在 UI 修改 goal 状态（如标记完成）
那么 (Then)   下次 AI 编译时感知到变化，更新 wiki page 中对应目标段落
```

---

## 2. 实时 Ingest（替换 Digest Tier1）

### 场景 2.1: Record 入库 — 确定性预抽取 + 待办抽取
```
假设 (Given)  用户录入一段语音/文字，生成 Record
当   (When)   触发 ingest 流程
那么 (Then)   分两步执行：

  Step 1 — 确定性预抽取（零 LLM 成本，借鉴 Graphify 的"AST 先行"模式）：
  - 正则提取日期/时间（"明天""下周一""3点"→ ISO 时间戳）
  - 正则提取 @人名（"张总""老王"→ entity 列表）
  - 正则提取金额/数字（"5%""200万"）
  - 提取结果存入 record.metadata.extracted_entities（JSONB）

  Step 2 — AI 调用（1 次）：
  - 接收原始文本 + Step 1 的确定性实体（减少 AI 重复劳动）
  - 提取 intend 类型的待办/目标
  - 生成 record 级别的 embedding（对 transcript/summary 整体向量化）
  - 生成 record 内容的 content_hash（SHA256，用于增量编译去重）

  最终：Record 标记为 pending_compile
并且 (And)    不再拆解为原子 Strike
并且 (And)    不再创建 Bond
并且 (And)    待办抽取独立于 wiki 编译，实时完成
并且 (And)    content_hash 用于每日编译时跳过内容未变的 Record（编辑后重新编译场景）
```

### 场景 2.2: 待办抽取（从 digest 中保留的部分）
```
假设 (Given)  ingest 阶段 AI 识别到 intend 类型的内容
当   (When)   提取出 action/goal/project 粒度的意图
那么 (Then)   直接创建 todo/goal record：
  - todo.source_record_id = record.id（取代原来的 todo.strike_id）
  - todo.wiki_page_id = NULL（等待每日编译后关联）
  - 其余字段（title, scheduled_start, deadline, priority）不变
并且 (And)    granularity 判断逻辑不变：action → todo, goal/project → goal
并且 (And)    如果可以匹配到已有 wiki page（通过 embedding 相似度），提前填充 wiki_page_id
```

### 场景 2.3: 外部素材降权
```
假设 (Given)  source_type = 'material'（用户导入的文章/外部内容）
当   (When)   进入 ingest 流程
那么 (Then)   Record 标记为 pending_compile，但附带 material 标记
并且 (And)    每日编译时 AI 知道这是外部素材：
  - 只在已有 wiki page 中作为"参考资料"段落追加
  - 不能作为创建新 wiki page 的唯一依据
  - 不影响核心认知和决策链段落（和现有 material salience 降权原则一致）
```

---

## 3. 每日编译（替换 Digest Tier1 的 Strike 拆解 + Tier2 batch-analyze + Emergence）

### 场景 3.1: 每日编译触发
```
假设 (Given)  系统定时任务运行（每日 3AM）或手动触发
当   (When)   触发 wiki 编译
那么 (Then)   对每个用户执行两阶段检索 + 一次编译：

  阶段 A — 路由（轻量，不调 AI）：
  1. 查询所有 pending_compile 的 Record（自上次编译以来）
  2. 加载所有 active wiki page 的 title + summary（不加载 content）
  3. 对每条新 Record 的 embedding 与所有 page embedding 做相似度匹配
  4. 选出相关 page（相似度 > 0.5 或 AI 路由判断命中），最多 10 个
  5. 仅对命中的 page 加载完整 content

  阶段 B — 编译（1 次 AI 调用）：
  6. 将新 Record 完整文本 + 命中 page 的 content + 全部 page 的 title+summary 列表传入 prompt
  7. AI 返回编译指令（详见场景 3.2）

并且 (And)    如果没有新 Record，跳过该用户
并且 (And)    每个用户独立编译，互不影响
并且 (And)    并发锁：同一用户不能同时运行两次编译（幂等 key = user_id + 日期）
并且 (And)    上下文预算：命中 page content 总量 ≤ 30000 tokens；超出时按相似度排序截断
```

### 场景 3.2: AI 编译 — 核心流程
```
假设 (Given)  AI 收到编译 prompt，包含：
  - 当日所有新 Record 的完整文本（transcript/summary）
  - 命中的 wiki page 完整 content（最多 10 个，总量 ≤ 30000 tokens）
  - 全部 wiki page 的 title + summary 列表（用于发现新建/合并机会）
  - 编译规则（本 spec 中定义的 content 格式规范）
当   (When)   AI 执行编译
那么 (Then)   返回结构化的编译指令：
  {
    "update_pages": [
      {
        "page_id": "UUID",
        "new_content": "完整的 markdown 内容（覆盖写入）",
        "new_summary": "一句话摘要",
        "add_record_ids": ["rec-uuid-1", "rec-uuid-2"]
      }
    ],
    "create_pages": [
      {
        "title": "新主题名称",
        "content": "markdown 内容",
        "summary": "一句话摘要",
        "parent_id": "UUID 或 null",
        "level": 3,
        "domain": "工作",
        "record_ids": ["rec-uuid-1"]
      }
    ],
    "merge_pages": [
      { "source_id": "UUID", "target_id": "UUID", "reason": "..." }
    ],
    "split_page": [
      {
        "source_id": "UUID",
        "new_parent_content": "拆分后的父页 markdown",
        "children": [
          { "title": "子页标题", "content": "markdown", "summary": "..." }
        ]
      }
    ],
    "goal_sync": [
      {
        "action": "create" | "update",
        "goal_id": "UUID（update 时）",
        "title": "目标标题",
        "status": "active" | "completed" | "suggested",
        "wiki_page_id": "UUID",
        "progress": 0.6
      }
    ]
  }
并且 (And)    AI 决策规则：
  - 新 Record 内容匹配已有 page → update_pages（追加/修改对应段落）
  - 新 Record 涉及全新主题，且有 2+ 条 think/voice 类 Record → create_pages
  - 仅有 1 条 material 类 Record → 不创建新页，等更多输入
  - 两个 page 高度重叠 → merge_pages
  - 一个 page 覆盖了多个明显不同的子主题 → split_page
```

### 场景 3.3: 自顶向下拆分（L3 → L2 → L1）
```
假设 (Given)  一个 L3 wiki page "工作" 已经积累了大量内容
当   (When)   AI 判断该页覆盖了多个明显不同的子主题
那么 (Then)   执行拆分：
  1. 原 page 保留为 parent，content 缩减为高层摘要 + 子页索引
  2. 创建 N 个子 page（level = parent.level - 1），各自包含对应的详细内容
  3. 子 page 的 parent_id 指向原 page
  4. 子 page 继承原 page 的相关 wiki_page_record 关联
  5. 原 page 的 level 不变（仍为 L3）
并且 (And)    拆分方向始终是从抽象到具体（L3→L2→L1）
并且 (And)    拆分不是硬编码的行数阈值，而是 AI 判断"是否覆盖了多个不同子主题"
并且 (And)    最低拆分到 L1（不再往下拆，L1 是叶子节点）

示例：
  初期：L3 "生活与工作"（一页纸承载所有）
  积累后拆分 →
    L3 "工作"（摘要 + 索引）
      L2 "供应链管理"（详细内容）
      L2 "产品推广"（详细内容）
    L3 "生活"（摘要 + 索引）
      L2 "健康"（详细内容）
```

### 场景 3.4: 页面合并
```
假设 (Given)  两个 wiki page 语义高度重叠（AI 判断）
当   (When)   AI 在编译时发现
那么 (Then)   输出 merge_pages 指令：
  - source page 状态改为 'merged'，merged_into 指向 target
  - target page content 合并 source 的独有信息
  - source 的 wiki_page_record 关联 合并到 target
  - source 关联的 goal 的 wiki_page_id 更新为 target
```

### 场景 3.5: Goal 双向同步
```
假设 (Given)  AI 编译后输出 goal_sync 指令
当   (When)   执行 goal_sync
那么 (Then)   对于 action="create"：
  - 在 goal 表创建记录，wiki_page_id 指向对应 page
  - wiki page content 中对应目标段落追加 "→ goal:UUID"
  对于 action="update"：
  - 更新 goal 表的 status / progress 等字段
  - wiki page content 中对应目标段落同步更新状态标记
并且 (And)    反向同步：编译前检查 goal 表中上次编译后有 UI 修改的记录
  - 将变化传入 prompt，让 AI 在编译时反映到 wiki page content
```

### 场景 3.6: 编译后处理 + 变更摘要
```
假设 (Given)  AI 编译完成，所有指令已执行
当   (When)   后处理阶段
那么 (Then)   执行：
  1. 所有相关 Record 标记为 compiled（清除 pending_compile）
  2. 更新所有被修改 page 的 embedding（基于新的 summary）
  3. 更新所有被修改 page 的 compiled_at 时间戳
  4. 更新 wiki_index 缓存（用于下次编译和搜索）
  5. 生成编译变更摘要（借鉴 Graphify 的 graph_diff 审计模式）：
     - 新增了哪些 page
     - 哪些 page 内容有变化（diff 概要）
     - 拆分/合并事件
     - 新发现的矛盾
     - 目标状态变化
  6. 变更摘要存入 wiki_compile_log 表（用于早报/用户查看）
并且 (And)    变更摘要可供早报引用："昨天你的思考被路路整理到了 N 个方向中"
```

### 场景 3.9: Record 删除/归档时的 Wiki 清理
```
假设 (Given)  用户删除或归档了一条 Record
当   (When)   该 Record 已被编译到某些 wiki page 中
那么 (Then)   标记该 Record 为 needs_recompile（不是简单移除）
并且 (And)    下次每日编译时 AI 感知到该 Record 被删除：
  - 从 wiki_page_record 关联表中移除
  - AI 判断删除该 Record 后 wiki page 内容是否需要修改
  - 如果该 Record 是某段认知的唯一来源 → AI 标注为 "[来源已删除]" 或移除
  - 如果其他 Record 也支持同一认知 → 保留内容，只更新来源指针
并且 (And)    不留"幽灵引用"：wiki page 中不能出现指向已删除 Record 的 [→ rec:UUID]
```

### 场景 3.10: 聊天记录回流（查询反馈循环）
```
假设 (Given)  用户与参谋对话产生了有价值的 Q&A（借鉴 Graphify 的 save_query_result 模式）
当   (When)   对话中 AI 使用了工具或产生了新的认知（如帮用户梳理了计划）
那么 (Then)   对话摘要作为新 Record（source_type='chat'）入库
并且 (And)    标记为 pending_compile，下次编译时纳入 wiki
并且 (And)    这形成反馈循环：用户提问 → AI 回答 → 回答编入 wiki → 下次回答更好
注意：只保存有认知价值的对话，闲聊/确认类对话不入库
```

### 场景 3.8: 编译失败与回滚
```
假设 (Given)  AI 编译返回了结构化指令
当   (When)   执行指令过程中部分失败（如 3/5 page 更新成功，2 个失败）
那么 (Then)   整个编译在单个数据库事务中执行：
  - 所有 page 写入、goal_sync、record 状态更新在同一事务
  - 任一步失败 → 整体回滚，所有 Record 保持 pending_compile
  - 错误日志记录失败原因
并且 (And)    下次编译（定时或手动）会重新处理这些 Record
当   (When)   AI 调用本身超时（>5min）
那么 (Then)   重试一次（缩减 Record 数量为原来的一半）
并且 (And)    仍失败则 Record 保持 pending，报警通知
当   (When)   AI 返回的 JSON 解析失败
那么 (Then)   不执行任何写入，Record 保持 pending，记录错误日志
```

### 场景 3.7: 冷启动期（素材少）
```
假设 (Given)  用户总共只有 1-5 条 Record
当   (When)   首次编译
那么 (Then)   创建 1-2 个宽泛的 L3 page（如"工作与生活"）
并且 (And)    不强制拆分，等内容自然积累
并且 (And)    冷启动引导产出的内容（5 问回答）直接编译到初始 page
当   (When)   后续编译发现内容已跨 3+ 个明显不同主题
那么 (Then)   触发首次拆分
```

---

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
并且 (And)    计算为纯 SQL 操作，无 AI 成本
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
并且 (And)    热点地图的数据来源：GET /api/v1/wiki/heatmap
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
并且 (And)    API GET /api/v1/topics 响应结构需适配：
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
并且 (And)    lifecycle API 响应类型需更新：seeds 从 Strike[] 改为 WikiInsight[]，harvest 中 reviewStrike 改为 reviewText
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
  - Seeds 渲染改造（Strike 卡片 → wiki 段落条目）
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

- [ ] **Phase 7: 知识热力系统**
  - wiki_page 加 heat_score / heat_phase 字段
  - wiki_page_event 事件表
  - 各触碰点埋点（compile/search/view/chat_context）
  - 每日热力计算（纯 SQL，编译后执行）
  - 冰封判定 + 候选归档提示
  - 归档/恢复流程
  - heatmap API

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
  - 后端：新增 API 返回 wiki page 树（含 record count + active goal count）
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
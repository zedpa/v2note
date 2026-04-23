---
id: "cognitive-wiki-core"
status: active
domain: cognitive
risk: high
dependencies: ["todo-core.md", "topic-lifecycle.md"]
superseded_by: null
created: 2026-04-17
updated: 2026-04-17
---

# 认知 Wiki — 核心模型与编译管线

> 本文件是 `cognitive-wiki.md` 的拆分子域，承载：总体概述 + 数据模型 + 实时 Ingest + 每日编译
> 其他子域：
> - `cognitive-wiki-lifecycle.md` — 搜索 / 热力与生命周期 / 前端适配 / 迁移策略 / 验收行为 / 边界条件
> - `cognitive-wiki-migration.md` — 依赖 / 接口约定 / 砍掉的模块 / Implementation Phases（含 Batch 3/4）/ 备注

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
  - title: TEXT NOT NULL — 页面标题（自然语言，如"Q2 采购策略"、"React 学习笔记"、"今年减重10kg"）
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

### 场景 1.4: Domain = Wiki Page 根节点（统一模型）
```
假设 (Given)  系统需要分类组织用户内容
当   (When)   需要 domain 分类
那么 (Then)   domain 不再是独立的 text 字段，而是 L3 wiki page 本身：
  - 每个 L3 page 即一个 domain（如 title="工作" 的 L3 page 就是 "工作" domain）
  - domain 不硬编码，完全从用户内容自然涌现
  - 只有一条关于人生感悟的日记 → domain 只有一个 "思考"，下面就挂这一条内容
  - 日记涉及工作讨论 → domain "工作" 自动创建
  - wiki_page.domain 字段保留但语义改变：值 = 该 page 所属 L3 祖先的 title
  - 用户可手动创建空 L3 page（= 手动创建 domain）
  - AI 创建新 domain 时需自然命名（不硬编码"工作""生活"等固定集合）
并且 (And)    parent page 和 children page 共享相同 domain（= L3 祖先 title）
并且 (And)    用户可通过 UI 手动修改 page title（下次编译时 AI 尊重用户选择）
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

### 场景 2.2: 待办抽取（仅 action 级别）
```
假设 (Given)  ingest 阶段 AI 识别到用户表达了可执行的意图
当   (When)   提取出 action 粒度的待办（一次可完成的事）
那么 (Then)   直接创建 todo record（level=0）：
  - todo.source_record_id = record.id
  - todo.wiki_page_id = NULL（等待编译后关联）
  - 其余字段（title, scheduled_start, deadline, priority）不变
并且 (And)    **禁止在 digest 阶段提取 goal/project**
  - goal 的判断需要更多上下文（多条日记积累后才能识别长期目标）
  - goal 统一由 wiki compile 阶段的 goal_sync 创建（场景 3.2）
  - 判断标准：不是一次能做完的事 → goal（如"通过四级考试""今年减重10kg"）
  - 简单一步可做完的事 → action/todo（如"明天下午3点开会""买牛奶"）
并且 (And)    如果可以匹配到已有 wiki page（通过 embedding 相似度），提前填充 wiki_page_id
```

### 场景 2.4: @路由语法解析
```
假设 (Given)  用户在日记中写了 @domain/subdomain 格式的文本
当   (When)   ingest 阶段解析 Record 文本
那么 (Then)   提取 target_path 信息存入 record.metadata.target_path：
  - "@工作/采购" → target_path = "工作/采购"
  - "@思考" → target_path = "思考"
  - 多个 @ 引用 → 只取第一个（一条日记归属一个主 page）
并且 (And)    如果 target_path 对应的 page 不存在 → 自动创建：
  - "工作" L3 page 不存在 → 创建空 L3 page（created_by='user'）
  - "工作" 存在但 "采购" L2 不存在 → 在"工作"下创建空 L2 page
并且 (And)    该 Record 在编译时直接路由到目标 page，跳过 embedding 匹配
并且 (And)    @语法是可选的，不用 @ 的日记走正常 AI 分类路由
```

### 场景 2.5: 异步轻量分类（Record 创建时）
```
假设 (Given)  用户录入一条日记（语音/文字），Record 已入库
当   (When)   Record 没有 @路由指定
那么 (Then)   异步触发一次轻量 AI 调用（不阻塞录音按钮，用户可继续录音）：
  1. 输入：Record 文本 + 当前所有 L3 page 的 title 列表
  2. AI 返回：{ domain_title: string, page_title?: string }
     - domain_title: 该日记应归属的 L3 page title（已有的或建议新建的）
     - page_title: 如果内容更具体，建议归属的 L2 page title（可选）
  3. 将分类结果存入 record.metadata.classified_path
  4. 如果匹配到已有 page → 立即建立 wiki_page_record 关联（前端可展示归属）
  5. 如果需要新建 page → 等编译阶段确认后创建
并且 (And)    轻量调用 token 预算：输入 < 500 tokens，输出 < 100 tokens
并且 (And)    调用失败不影响 Record 入库（分类信息非关键路径）
并且 (And)    编译阶段可覆盖轻量分类的结果（编译有更多上下文）
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

### 场景 3.1: 编译触发（双模式）
```
假设 (Given)  wiki page 下挂载了日记内容
当   (When)   触发编译
那么 (Then)   编译有两种触发模式：

  模式 1 — Token 阈值触发（实时）：
  - 当某个 page 下所有未编译日记的总 token 数 ≥ 5000 时自动触发
  - 只编译该 page 下的内容（不需要全用户编译）
  - 低于 5000 token 的 page 不编译，前端直接展示日记原文列表

  模式 2 — 每日定时触发（3AM 批量）：
  - 检查所有用户的所有 page，执行满足阈值但未触发的编译
  - 同时执行跨 page 的结构优化（拆分/合并建议）

  编译流程（两种模式共用）：

  阶段 A — 路由（轻量，不调 AI）：
  1. 查询所有 pending_compile 的 Record（自上次编译以来）
  2. 有 @路由或 classified_path 的 Record → 直接路由到目标 page
  3. 无分类的 Record → embedding 与 page embedding 做相似度匹配
  4. 选出相关 page（相似度 > 0.5），最多 10 个
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

### 场景 3.3: 编译即压缩 + 分形拆分
```
假设 (Given)  一个 wiki page 下挂载了多条日记
当   (When)   该 page 下日记总 token ≥ 5000，触发编译
那么 (Then)   编译 = 对子级内容的向上压缩：
  1. 编译输入 = page.content(旧) + 新增/修改的素材（日记、AI 交互摘要、todo 状态变化等）
  2. AI 基于旧 content 和新素材，生成更新后的结构化总结
  3. 将总结写入 page 自身的 content 字段（不创建新子页）
  4. 日记原文仍通过 wiki_page_record 关联保留（可展开查看）
  5. page.content = AI 对所有子级素材的综合总结（增量更新，非全量重写）

示例（阶段1 → 阶段2）：
  阶段1（日记少，未编译）：
    思考/ (L3, content="")
    ├── 日记1, 日记2, 日记3   ← 前端直接展示原文

  阶段2（日记多了，≥ 5000 token，触发编译）：
    思考/ (L3, content="[对所有日记的结构化总结]")
    ├── 日记1, 日记2, 日记3   ← 仍关联，可展开

当   (When)   编译后 page.content 本身也臃肿了（AI 判断覆盖多个不同子主题）
那么 (Then)   自发拆分为 N 个 L2 子页：
  1. 原 page 的 content 缩减为对子页的总结 + 索引
  2. 创建 N 个子 page（level = parent.level - 1）
  3. 每个子页 content = 对归属该子主题的日记的编译总结
  4. 日记的 wiki_page_record 关联从 parent 迁移到对应子页
  5. parent.content 只存"这些子页讲了什么"的高层摘要

  阶段3（编译内容臃肿，拆分）：
    思考/ (L3, content="[对 L2 子页的总结 + 索引]")
    ├── 人生感悟 (L2, content="[编译总结]") + 日记1, 日记2
    └── 哲学阅读 (L2, content="[编译总结]") + 日记3, 日记4

并且 (And)    核心原则：编译始终是对子级的总结，L3 总结 L2，L2 总结其下的日记
并且 (And)    拆分方向始终是从抽象到具体（L3→L2→L1）
并且 (And)    最低拆分到 L1（不再往下拆，L1 是叶子节点）
并且 (And)    低于 5000 token 的 page 不编译，前端直接展示日记原文列表
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
那么 (Then)   根据内容自然创建 L3 page：
  - 只有一条关于工作的日记 → 创建 "工作" L3 page，日记直接挂在下面
  - 有工作和生活两类 → 创建 "工作" + "生活" 两个 L3 page
  - 不强制合并为"工作与生活"这种笼统 page
并且 (And)    低于 5000 token 的 page 不编译，直接展示原文
并且 (And)    冷启动引导产出的内容（5 问回答）直接作为日记挂到对应 page
```

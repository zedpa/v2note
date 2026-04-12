---
id: "119"
title: "认知 Wiki — 从原子拆解到知识编译"
status: completed
domain: cognitive
risk: high
dependencies: ["todo-core.md", "topic-lifecycle.md"]
superseded_by: null
created: 2026-04-08
updated: 2026-04-12
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
  - Record 入库不再生成 embedding（省掉 embedding API 调用）
  - 日记路由：@语法 + 轻量 AI 分类（替代 embedding 匹配）
  - 搜索：关键字搜索 page title + content（PostgreSQL 全文索引）
  - Chat 参谋上下文：按 page 树检索 + 关键字匹配
  - 相关 page 发现：通过 wiki_page_link 表（编译时 AI 建立的链接）
并且 (And)    Embedding 降级为可选增强（Batch 5）：
  - 语义搜索（关键字搜不到但语义相关的内容）
  - 模糊匹配（用户表述和 page 用词不同但含义相近）
  - 当前保留 wiki_page.embedding 字段和 record.embedding 字段，但不强制生成
并且 (And)    降低每条 record 的入库成本（少一次 API 调用 + 向量存储）
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
  - 接受 → 调用 POST /api/v1/wiki/suggestion/:id/accept → 执行预编译方案
  - 拒绝 → 调用 POST /api/v1/wiki/suggestion/:id/reject → 执行保守方案
并且 (And)    参谋聊天中也可展示建议并获取确认（自然对话方式）
```
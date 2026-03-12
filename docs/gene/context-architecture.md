## gene_context_architecture
### 功能描述
分层上下文架构。借鉴 OpenClaw 的设计理念，将 AI 上下文分为 Hot/Warm/Cold 三层，解决单一巨大 system prompt 导致的 AI 幻觉问题。异步并行加载上下文，基于关键词相关性评分筛选记忆。

### 设计理念（来自 OpenClaw）
- **Metadata-only 技能注入**：system prompt 仅包含技能名称+描述，全文按需加载
- **信息分层**：Hot=始终存在（核心规则），Warm=按任务选择性加载，Cold=按需获取
- **反幻觉纪律**：明确规则防止 AI 编造内容
- **会话隔离**：不同模式加载不同上下文（process 跳过 Soul）

### 三层定义

| 层级 | 内容 | 预算 | 加载方式 |
|------|------|------|----------|
| **Hot** | Agent.md 核心规则（无命令表）、反幻觉纪律、技能清单（metadata only） | ~1500 chars | 同步，启动时 |
| **Warm** | Soul（仅 chat/briefing）、UserProfile（用户画像，独立于 Soul）、相关记忆（相关性评分 top N）、匹配技能全文、标签规则、输出格式 | ~2000-4000 chars | 异步，per-request |
| **Cold** | 完整 Agent.md、工具参数 schema、非匹配技能详情 | 不注入 | 按需 |

### 记忆相关性评分
- 无向量数据库，使用关键词匹配 + 权重公式
- 关键词重叠 (0.4) + importance (0.3) + 时效性 (0.3)
- [目标] 前缀记忆：当 goal 表有数据时降级为普通记忆；goal 表为空时始终浮出（占 40% 配额）
- goal 表数据并行加载（Promise.all），LoadedContext 新增 goals 字段
- 中文分词：字符双字母组 + 标点分割，排除停用词
- 各模式记忆上限：process=5, chat=15, briefing=10, estimate=5

### 技能分区策略
- `always: true` 技能始终注入全文（intent-classify, relay-detect；todo-extract 已降级为 always: false）
- 其他技能通过 `partitionSkillsByRelevance()` 检查输入是否包含技能关键词
- 匹配 → 注入 Warm 层全文；不匹配 → 仅元数据进入 Cold 层

### 反幻觉规则
- process 模式："只提取用户明确说出的内容"、"记忆仅供理解背景不作为提取来源"
- chat 模式："不确定的事情明确说我不确定"、"引用记忆时标注来源日期"
- briefing 模式："不要虚构统计数字或完成情况"

### 关键文件
- `gateway/src/context/tiers.ts` — ContextTier / ContextBuildOptions 类型定义
- `gateway/src/context/anti-hallucination.ts` — PROCESS_GUARDRAILS / CHAT_GUARDRAILS / BRIEFING_GUARDRAILS
- `gateway/src/context/loader.ts` — loadWarmContext()、rankMemories()、computeRelevanceScore()、loadProfileSafe()（extractKeywords 已提取到 lib/text-utils.ts）
- `gateway/src/lib/text-utils.ts` — extractKeywords() + STOPWORDS 共享模块
- `gateway/src/skills/prompt-builder.ts` — buildTieredContext() + buildSystemPrompt() 兼容包装
- `gateway/src/skills/loader.ts` — getSkillManifest() + partitionSkillsByRelevance()
- `gateway/src/memory/manager.ts` — loadRelevantContext() 方法

### 测试描述
- 输入：录音 "下午开会准备报告"（process 模式）
- 输出：system prompt 不含 Soul、仅含 5 条相关记忆、always 技能全文注入、其他技能 metadata only
- 输入：复盘对话（chat 模式）
- 输出：system prompt 含 Soul + 15 条相关记忆 + 选定 review 技能全文

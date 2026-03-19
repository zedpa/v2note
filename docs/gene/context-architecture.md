## gene_context_architecture
### 功能描述
分层上下文架构。将 AI 上下文分为 Hot/Warm 两层（无 Cold），解决单一巨大 system prompt 导致的 AI 幻觉问题。异步并行加载上下文，基于 embedding 优先 + keyword 回退的相关性评分筛选记忆。仅服务 chat/briefing 两种模式（process 使用硬编码 prompt）。

### 设计理念
- **信息分层**：Hot=始终存在（AGENTS.md 核心规则），Warm=按任务选择性加载（身份/画像/记忆/技能/工具）
- **反幻觉纪律**：已内联到 AGENTS.md 行为宪法（anti-hallucination.ts 已 @deprecated）
- **会话隔离**：process 模式不经过此系统，使用独立的 hardcoded prompt

### 两层定义

| 层级 | 内容 | 加载方式 |
|------|------|----------|
| **Hot** | AGENTS.md 行为宪法（安全/纪律/沟通风格/场景指南） | 同步，启动时读取一次 |
| **Warm** | AI 身份(Soul) + 用户画像(UserProfile) + 相关记忆(top N) + 激活技能 + 可用工具 | 异步，per-request 并行加载 |

### 记忆召回策略
- **Embedding 优先**：semanticSearch()（DashScope text-embedding-v3 + 余弦相似度）
- **Keyword 回退**：embedding 失败时降级到关键词评分
- 关键词评分公式：keyword overlap(0.4) + importance(0.3) + recency(0.3)
- 中文分词：字符双字母组 + 标点分割，排除停用词
- 各模式记忆上限：chat=15, briefing=10

### 上下文传递链路
```
WebSocket → index.ts(注入userId) → Handler
  ├── process.ts: buildProcessPrompt() 硬编码，不加载上下文
  └── chat.ts: MemoryManager.loadRelevantContext()
        → loadWarmContext() — Promise.all([soul, profile, memories, goals])
        → rankMemories() — embedding优先 + keyword回退
        → buildSystemPrompt() — Hot(AGENTS.md) + Warm 拼接
        → session.context.setSystemPrompt()
```

### 已修复的链路问题（v2026.03.17）

1. **背景更新错误日志**：chat.ts endChat() 中 soul/profile/diary 的 `.catch(() => {})` 改为带日志的 `.catch(e => console.warn(...))`，与 process.ts 保持一致
2. **转录内容截断**：chat.ts 中 transcriptSummary 注入 prompt 前截断到 MAX_TRANSCRIPT_CHARS(8000字符)，防止长录音撑爆 token 上限
3. **Pending intents 模式过滤**：command 模式不加载待确认意图（只在 review/insight 模式注入）
4. **endChat userId 安全校验**：先检查 session.userId 再决定是否更新 soul/profile，undefined 时仅使用 deviceId 并打警告日志

### 关键文件
- `gateway/src/context/tiers.ts` — ContextTier / ContextMode 类型定义（chat | briefing）
- `gateway/src/context/loader.ts` — loadWarmContext()、rankMemories()、computeRelevanceScore()
- `gateway/src/context/anti-hallucination.ts` — @deprecated，纪律规则已移入 AGENTS.md
- `gateway/src/skills/prompt-builder.ts` — buildTieredContext() + buildSystemPrompt()
- `gateway/src/memory/manager.ts` — loadRelevantContext() 方法（短期+长期记忆合并）
- `gateway/src/lib/text-utils.ts` — extractKeywords() + STOPWORDS + maySoulUpdate/mayProfileUpdate

### 测试描述
- 输入：录音 "下午开会准备报告"（process 模式）
- 输出：不经过上下文系统，直接使用 hardcoded process-prompt
- 输入：复盘对话（chat 模式）
- 输出：system prompt 含 Soul + UserProfile + 15 条相关记忆 + 选定洞察技能全文
- 输入：指令对话（command 模式）
- 输出：system prompt 含 Soul + UserProfile + 15 条相关记忆，不含 pending intents

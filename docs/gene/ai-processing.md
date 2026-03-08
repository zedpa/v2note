## gene_ai_processing
### 功能描述
AI 处理管道。转写文本经过最小化清理（去填充词+修错别字，严格保留原文句式结构），按激活技能提取结构化数据（待办、客户要求等），标签仅匹配已有标签。使用分层上下文架构（Hot/Warm/Cold）组装 system prompt，process 模式跳过 Soul 加载、仅注入相关记忆。

### 详细功能
- 功能1：转写清理（仅移除"嗯""那个""就是说"等填充词 + 修正错别字，不改写句式结构）
- 功能2：按技能提取 JSON 结构化数据
- 功能3：标签仅匹配已有标签列表，不创建新标签
- 功能4：生成 summary（清理后的转写文本，保留原文结构）并保存到 summary 表
- 功能5：工具调用循环（最多 3 轮）——内置工具（create_diary/delete_diary/create_todo）优先匹配，未命中回退 MCP
- 功能6：结果写入数据库（todos、customer_requests、setting_changes、tags、summary）
- 功能7：后台触发 Todo Enrichment（时间估算+domain+impact+ai_actionable）和记忆更新
- 功能8：分层上下文架构——Hot 层=核心规则+反幻觉纪律+技能清单(metadata only)；Warm 层=相关记忆(相关性评分筛选)+匹配技能全文+标签规则+输出格式；Cold 层=完整 Agent.md+工具参数 schema
- 功能9：process 模式优化——跳过 Soul 加载（提取不需要人格），Memory 并行加载(Promise.all)，仅注入输入相关的 5 条记忆
- 功能10：反幻觉纪律——"只提取用户明确说出的内容"、"记忆仅供理解背景不作为提取来源"、"每条提取结果必须能在原文中找到对应原句"

#### 内置工具：create_todo
- 使用场景：对话中模型识别到明确的行动事项，需要直接落地为待办
- 参数：
  - `text` (必填)：待办文本（动词开头、简洁可执行）
  - `link_record_id` (可选)：将待办关联到指定记录
  - `scheduled_start` / `scheduled_end` (可选)：任务时间范围（ISO）
  - `estimated_minutes` (可选)：预估时长（分钟）
  - `priority` (可选)：优先级（整数，越大越高）
- 行为：
  - 如未提供 `link_record_id`，自动创建一条记录 `source:"chat_tool"` 并将待办关联到该记录
  - 创建待办后，根据可选参数更新排期/预估/优先级
  - 返回 `{ todo_id, record_id }`

### 转写清理规则（v2026.02.28）
- 移除口语填充词和重复词
- 修正明显的错别字和语音识别错误
- **严格保留原文表述结构**：短句还是短句，倒装还是倒装
- 不将口语转为书面语，不合并或拆分句子
- 无填充词且无错别字时，转写结果应与原文完全一致

### 关键文件
- `gateway/src/handlers/process.ts` — 处理入口（使用 loadRelevantContext 并行加载）
- `gateway/src/skills/prompt-builder.ts` — buildTieredContext() + buildSystemPrompt() 兼容包装
- `gateway/src/context/tiers.ts` — ContextTier 类型定义（hot/warm/cold）
- `gateway/src/context/anti-hallucination.ts` — 反幻觉纪律常量
- `gateway/src/context/loader.ts` — 异步并行加载器 + 关键词相关性评分
- `gateway/src/skills/loader.ts` — 技能加载 + getSkillManifest() + partitionSkillsByRelevance()
- `gateway/src/skills/types.ts` — 技能类型
- `gateway/Agent.md` — 静态 AI 行为逻辑定义
- `gateway/src/soul/manager.ts` — AI 身份定义更新
- `gateway/src/tools/builtin.ts` — 内置工具定义与执行（包含 create_todo）

### 测试描述
- 输入：口语化文本 "嗯那个明天要开会啊然后就是说下午三点"
- 输出：summary = "明天要开会，下午三点"（仅去填充词，保留原文句式）
- 输入：无填充词文本 "现在这个录音怎么没有用呢？"
- 输出：summary = "现在这个录音怎么没有用呢？"（与原文完全一致）

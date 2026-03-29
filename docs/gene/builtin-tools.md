## gene_builtin_tools
### 功能描述
AI 工具系统（Vercel AI SDK v6 原生 function calling）。工具通过 ToolRegistry 统一注册，导出为 AI SDK tools 格式，由 `streamText({ tools, maxSteps })` 自动处理调用循环。

### 架构
- **ToolRegistry**：中心注册表，Zod 参数验证 + 错误兜底 + `toAISDKTools()` 导出
- **AI SDK 原生工具调用**：`streamText` + `maxSteps=5` 自动处理 AI→工具→结果→继续生成
- **fullStream 状态推送**：工具执行期间向前端推送中文提示（"🔍 正在联网搜索…"），避免无反馈卡顿感
- **自主度分级**：silent（静默执行）/ confirm（需用户确认）/ manual（手动触发）

### 已注册工具
| 工具 | 自主度 | 说明 |
|------|--------|------|
| create_record | silent | 创建日记 |
| delete_record | confirm | 删除日记（需确认） |
| create_todo | silent | 创建待办 |
| update_todo | silent | 更新待办调度 |
| create_goal | confirm | 创建目标 |
| update_goal | silent | 更新目标状态 |
| update_record | silent | 更新日记 |
| create_project | confirm | 创建项目 |
| create_link | silent | 创建关联 |
| search | silent | 搜索系统内记录 |
| confirm | silent | 确认操作 |
| web_search | silent | 联网搜索（需 TAVILY_API_KEY/SERPAPI_KEY） |
| fetch_url | silent | 获取网页内容 |

### 工具调用流程
1. Chat handler 构建 `ToolContext`（deviceId, userId, sessionId）
2. `toolRegistry.toAISDKTools(ctx)` 导出为 AI SDK 格式
3. `streamWithTools()` 调用 `streamText({ tools, maxSteps: 5 })`
4. 消费 `result.fullStream`：
   - `text-delta` → yield 文本给前端
   - `tool-call` → yield 中文状态提示（"🔍 正在联网搜索…"）
   - 工具执行 → Registry.execute() → Zod 验证 → handler → ToolCallResult
5. 结果自动返回 AI，循环直到 maxSteps 或 AI 停止调用工具

### 联网工具
- **web_search**：Tavily/SerpAPI 双后端，10s 超时，无 API key 时不注册
- **fetch_url**：抓取网页内容（Readability 提取），10s 超时，50K 字截断
- URL 安全检查：禁止内网地址和非 HTTP 协议

### 关键文件
- `gateway/src/tools/registry.ts` — ToolRegistry（注册 + 验证 + 执行 + AI SDK 导出）
- `gateway/src/tools/definitions/index.ts` — 全量工具注册（含条件注册 web_search）
- `gateway/src/tools/types.ts` — ToolDefinition / ToolCallResult / ToolContext 类型
- `gateway/src/web/web-search-tool.ts` — web_search 工具定义
- `gateway/src/web/fetch-url-tool.ts` — fetch_url 工具定义
- `gateway/src/web/search-provider.ts` — Tavily/SerpAPI 搜索服务抽象
- `gateway/src/ai/provider.ts` — streamWithTools()（fullStream + 工具状态提示）
- `gateway/src/handlers/chat.ts` — 对话模式工具调用集成

### 测试描述
- 输入：对话中说"帮我搜一下最新铝价"
- 输出：前端显示"🔍 正在联网搜索…"→ AI 返回搜索结果摘要
- 输入：对话中说"帮我记一条：明天下午开会"
- 输出：AI 调用 create_record 工具，创建日记，回复"已帮你记录"
- 输入：对话中说"我今年要学会游泳"
- 输出：AI 调用 create_goal 工具，创建目标"今年学会游泳"

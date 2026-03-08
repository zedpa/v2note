## gene_mcp_integration
### 功能描述
MCP（Model Context Protocol）双向集成。Gateway 既是 MCP Client（连接外部工具服务器）又是 MCP Server（暴露 v2note 内置能力给外部 AI）。

### MCP Client（连接外部工具）
- 功能1：MCPClient — JSON-RPC 2.0 客户端（支持 stdio/HTTP transport）
- 功能2：MCPRegistry — 管理多个 MCP 服务器连接
- 功能3：工具描述注入 system prompt
- 功能4：AI 返回 tool_calls 时自动执行工具调用循环（最多 3 轮）
- 功能5：从 LocalConfig 工具配置解析 MCP 服务器

### MCP Server（暴露 v2note 能力）
- 功能6：JSON-RPC 2.0 端点 `POST /mcp`，遵循 MCP 协议 2024-11-05
- 功能7：`initialize` — 返回 server info + capabilities
- 功能8：`tools/list` — 暴露内置工具（create_diary/create_todo/delete_diary/create_skill）+ 技能提示词（skill_info__*）
- 功能9：`tools/call` — 执行内置工具或返回技能 prompt 内容
- 功能10：外部 AI（Claude Desktop、ChatGPT 等）可通过 MCP 发现并使用 v2note 的待办管理、日记创建等能力

### 关键文件
- `gateway/src/mcp/client.ts` — MCP 客户端
- `gateway/src/mcp/registry.ts` — 服务器注册表
- `gateway/src/mcp/config-parser.ts` — 配置解析
- `gateway/src/mcp/server.ts` — MCP Server（JSON-RPC 端点）
- `gateway/src/tools/builtin.ts` — 内置工具定义（MCP Server 暴露的工具来源）
- `gateway/src/skills/prompt-builder.ts` — 工具描述注入

### 测试描述
- 输入：配置日历 MCP 服务器 → 录音 "明天的日程是什么"
- 输出：AI 调用日历工具 → 返回日程信息
- 输入：外部 AI 发送 `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
- 输出：返回 v2note 所有内置工具和技能列表

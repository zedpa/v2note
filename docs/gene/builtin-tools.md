## gene_builtin_tools
### 功能描述
AI 内置工具系统。AI 在处理录音和对话中可直接调用内置工具执行操作（创建/删除日记、创建复盘视角技能），无需 MCP 外部服务器。

### 详细功能
- 功能1：create_diary — AI 调用后直接创建 record + transcript + summary，source="manual", status="completed"
- 功能2：delete_diary — AI 调用后验证记录归属后删除，防止跨设备越权
- 功能3：create_skill — AI 发现用户总结出有价值的思考框架时，自动创建 review 类型复盘视角技能（created_by=ai）
- 功能4：工具描述自动注入 system prompt（与 MCP 工具合并展示）
- 功能5：process.ts 工具调用循环中优先匹配内置工具，未命中则回退 MCP
- 功能6：chat.ts 命令模式支持工具调用（非流式中间轮 + 流式最终回复）

### 关键文件
- `gateway/src/tools/builtin.ts` — 内置工具定义 + 调度 + 执行（含 create_skill）
- `gateway/src/skills/prompt-builder.ts` — 合并注入内置工具 + MCP 工具描述
- `gateway/src/handlers/process.ts` — 处理管道工具调用循环（isBuiltinTool 优先）
- `gateway/src/handlers/chat.ts` — 对话模式工具调用（streamWithToolCalls）
- `gateway/src/db/repositories/custom-skill.ts` — create_skill 的持久化目标

### 测试描述
- 输入：对话中说"帮我记一条：明天下午开会"
- 输出：AI 调用 create_diary 工具，创建日记，回复"已帮你记录"
- 输入：对话中说"删除刚才那条记录 xxx"
- 输出：AI 调用 delete_diary 工具，验证归属后删除，回复"已删除"
- 输入：对话中讨论出"以后都从成本视角分析决策" → AI 识别为可复用思考框架
- 输出：AI 调用 create_skill 工具，创建"成本视角"复盘技能，回复"已为你创建复盘视角"

## gene_command_system
### 功能描述
JSON 驱动的命令注册表。所有功能通过 /command 接入，支持文本输入和语音触发。

### 详细功能
- 功能1：commands.json 定义命令（名称、别名、描述、分类）
- 功能2：命令解析（/name args 格式）
- 功能3：别名和中文名匹配
- 功能4：语音命令检测（ASR 转写后短文本匹配）
- 功能5：命令路由到 overlay 或执行器
- 功能6：日期范围解析（中文和 ISO 格式）

### 关键文件
- `features/commands/lib/commands.json` — 命令定义
- `features/commands/lib/registry.ts` — 命令注册与执行
- `features/commands/lib/parser.ts` — 命令/日期解析
- `gateway/src/handlers/voice-commands.ts` — 语音命令匹配

### 测试描述
- 输入：文本 "/todos" 或语音 "打开待办"
- 输出：触发 todos overlay 打开

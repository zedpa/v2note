# V2Note — Claude Code 开发规则

## 项目概述
V2Note 是一个 AI 驱动的语音转文字 转待办+ 个人生产力应用。
技术栈：Next.js / TypeScript / PostgreSQL / Prisma / MCP

## 🔴 核心开发流程（必须遵循）

**所有新功能和 bug 修复，必须遵循以下 Spec-Driven 流程：**

### Phase 1: 读取 Spec
1. 查看 `specs/` 目录下是否存在对应的需求文件
2. 如果没有 spec，先询问用户需求，然后生成 spec 文件
3. Spec 使用 Given/When/Then 场景格式

### Phase 2: 生成测试（先于实现代码）
1. 根据 spec 中的每个场景，生成对应的测试用例
2. 测试文件放在 `__tests__/` 对应子目录下
3. 命名格式：`[feature].test.ts`
4. 每个场景至少一个测试，边界情况必须覆盖
5. **生成测试后暂停，等待用户确认测试是否准确反映需求**

### Phase 3: 实现代码
1. 运行测试确认全部失败（红色阶段）
2. 编写最小实现让测试通过
3. 每完成一个测试用例就运行一次测试

### Phase 4: 验证循环
1. 运行 `npm test -- --watchAll=false`
2. 如果测试失败：
   - 分析失败原因（读取错误输出）
   - 修改实现代码（不是修改测试！）
   - 重新运行测试
   - 最多循环 5 次
3. 如果 5 次后仍有失败，向用户报告具体问题
4. 全部通过后，运行 `npm run lint` 检查代码质量

### Phase 5: 收尾
1. 更新 spec 状态为 ✅ completed
2. 如果实现过程中发现 spec 遗漏的场景，补充到 spec 中

## 📁 项目结构约定

```
v2note/
├── CLAUDE.md              # 本文件
├── specs/                 # 需求规格（场景描述）
│   ├── _template.md       # Spec 模板
│   ├── voice-to-todo.md   # 示例：语音转待办
│   └── ...
├── __tests__/             # 测试文件（镜像 src 结构）
│   ├── features/
│   └── utils/
├── src/
│   ├── features/          # 功能模块
│   ├── lib/               # 共享库
│   └── utils/             # 工具函数
└── scripts/
    └── dev-loop.sh        # 自动验证脚本
```

## 🧪 测试规范

- 框架：Vitest（兼容 Jest API）
- 测试命名：`should_[期望行为]_when_[条件]`
- 异步操作使用 `async/await`
- Mock 外部依赖（数据库、API、AI 服务）
- 每个 spec 场景 → 至少 1 个测试用例

## 🚫 禁止事项

- 禁止跳过 Phase 2 直接写实现代码
- 禁止为了让测试通过而修改测试（除非用户确认 spec 有误）
- 禁止在没有运行测试的情况下声称"完成"
- 禁止忽略 TypeScript 类型错误

## 💡 代码风格

- TypeScript strict mode
- 函数优先，避免 class（除非确实需要）
- 小函数，单一职责
- 中文注释优先，关键术语保留英文
- 错误处理：所有 async 函数必须有 try/catch 或 .catch()

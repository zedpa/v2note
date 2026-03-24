# V2Note — Claude Code 开发规则

## 项目概述
V2Note（念念有路）是一个 AI 驱动的个人认知操作系统，重点方向是管理认知到行动之间映射管理，如待办，目标，项目，达成路径。
核心模型：Strike（认知触动） → Bond（关系） → Cluster（聚类涌现）
技术栈：Next.js 16 / TypeScript / Supabase (PostgreSQL + pgvector) / Capacitor / Electron

## 项目结构

```
v2note/
├── CLAUDE.md              # 本文件 — Claude Code 行为规则
├── specs/                 # 需求规格（Given/When/Then 场景）
│   └── _template.md
├── app/                   # Next.js 页面（write/timeline/map/goals）
├── features/              # 前端功能模块（含测试 *.test.ts）
├── shared/                # 前端共享库（含测试 *.test.ts）
├── gateway/               # 后端服务（独立 pnpm workspace）
│   └── src/
│       ├── cognitive/     # 认知引擎（clustering/contradiction/digest/retrieval）
│       ├── handlers/      # 请求处理（digest/process/chat/daily-loop）
│       ├── routes/        # REST API
│       └── ai/            # LLM 封装
├── components/            # UI 组件
├── types/                 # 全局类型定义
├── scripts/               # 构建 + SDD 验证脚本
│   ├── dev-loop.sh        # 自动测试循环（npm run verify）
│   └── spec-check.sh      # Spec 覆盖检查（npm run spec:check）
└── supabase/              # 数据库迁移 + Edge Functions
```

## 🔴 核心开发流程（Spec-Driven Development）

**所有新功能和 bug 修复，必须遵循以下 5 阶段流程：**

### Phase 1: 读取 Spec
1. 查看 `specs/` 目录下是否存在对应的需求文件
2. 如果没有 spec，先询问用户需求，然后基于 `specs/_template.md` 生成 spec
3. Spec 使用 Given/When/Then 场景格式 + 接口约定 + 边界条件

### Phase 2: 生成测试（先于实现代码）
1. 根据 spec 中的每个场景，生成对应的测试用例
2. 前端测试放在对应 feature 目录内：`features/xxx/xxx.test.ts`
3. 后端/纯逻辑测试放在 `gateway/src/` 对应目录内
4. 命名格式：`should_[期望行为]_when_[条件]`
5. **生成测试后暂停，等待用户确认测试是否准确反映需求**

### Phase 3: 实现代码
1. 运行测试确认全部失败（红色阶段）
2. 编写最小实现让测试通过
3. 每完成一个测试用例就运行一次测试

### Phase 4: 验证循环
1. 运行 `pnpm test` 或 `npm run verify`
2. 如果测试失败：
   - 分析失败原因（读取错误输出）
   - 修改实现代码（不是修改测试！）
   - 重新运行测试
   - 最多循环 5 次
3. 如果 5 次后仍有失败，向用户报告具体问题
4. 全部通过后，运行 TypeScript 类型检查

### Phase 5: 收尾
1. 更新 spec 状态为 ✅ completed
2. 如果实现过程中发现 spec 遗漏的场景，补充到 spec 中

## 🧪 测试规范

- 框架：Vitest（v4+，兼容 Jest API）
- 前端测试环境：jsdom
- 后端/纯逻辑测试环境：node
- 异步操作使用 `async/await`
- Mock 外部依赖（数据库、AI 服务、网络）
- 每个 spec 场景 → 至少 1 个测试用例
- 运行测试：`pnpm test`（所有） / `npx vitest run features/xxx`（指定模块）

## 🚫 禁止事项

- 禁止跳过 Phase 2 直接写实现代码
- 禁止为了让测试通过而修改测试（除非用户确认 spec 有误）
- 禁止在没有运行测试的情况下声称"完成"
- 禁止忽略 TypeScript 类型错误
- 禁止修改 gateway/ 的 package.json（它是独立 workspace）

## 💡 代码风格

- TypeScript strict mode
- 函数优先，避免 class（除非确实需要）
- 小函数，单一职责
- 中文注释优先，关键术语保留英文
- 错误处理：所有 async 函数必须有 try/catch 或 .catch()
- 路径别名：`@/*` → 项目根目录

## 🦌 产品核心原则

- **混沌输入**：用户可以将人任何东西丢进来，散乱的感想，项目规划，文章，读书笔记，账单，行程，anything;
- **结构涌现**：不做用户手动分类，主题/目标从 Strike 密度中自然长出
- **AI 沉默为主**：AI 只在每日回顾中汇报，不在别处打扰
- **feel 排除逻辑链**：情感 Strike 只记录不分析，尊重用户感受自主权
- **material 降权**：外部素材 salience 1/5~1/10，不参与涌现，只被动吸附

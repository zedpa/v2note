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

**所有新功能和 bug 修复，必须遵循以下 6 阶段流程：**

### Phase 1: 读取 Spec
1. **必须**先用工具读取 `specs/INDEX.md`，按 domain 查找是否已有 active/draft 状态的 spec
2. 如果已有同 domain 的 spec → 在已有文件中追加功能模块或场景，**禁止新建文件**
3. 如果没有匹配的 spec → 先询问用户需求，然后基于 `specs/_template.md` 生成新 spec，并同步更新 INDEX.md
4. Spec 使用 Given/When/Then 场景格式 + 接口约定 + 边界条件
5. ⚠️ **强制约束**：在回答任何涉及功能逻辑、修改现有行为的请求前，必须使用工具读取 `specs/INDEX.md`。禁止凭空猜测现有的领域划分。
6. **Spec 拆分规则**：当一个 spec 文件超过约 500 行时，应主动拆分为子域文件（如 `todo-core.md` + `todo-ui.md`）。这不是死规则，按需判断——如果内容紧密耦合不宜拆分可保持原样，但超长文件会削弱大模型的注意力，拆分后需在 INDEX.md 中标注子域关系，并将原文件标记为 `superseded`。

### Bug 修复快捷流程
对于 bug 修复任务，不要污染功能 spec，采用**临时 spec → 修复 → 回写**的流程：
1. 在 `specs/` 下创建临时 spec 文件，命名 `fix-<简述>.md`，status 设为 `active`，记录 bug 现象、复现条件、修复方案
2. 按正常 Phase 2-4 流程修复（写测试 → 实现 → 验证）
3. ⚠️ **回归测试强制**：每个 bug 修复**必须**留下至少一个永久性测试用例，测试用例的 describe 块中标注 `regression: fix-<简述>`，确保该 bug 永远不会回归
4. 修复完成后，将修复结果（场景 + 边界条件）**回写到对应的模块 spec** 中（如 `todo-core.md`、`chat-system.md`）
5. 临时 fix spec 标记为 `status: completed`，不再维护
6. 同步更新 `INDEX.md`（添加时放 Active，完成后移到 Completed）

### Phase 1b: Spec 审查（Agent 自审）
1. Spec 写完后，**立即**用 `code-review-global` Agent 审查 spec 变更
2. 审查要点：场景完整性、边界条件覆盖、与现有 spec 的一致性、接口约定可行性
3. 主 Agent 根据审查结果修改 spec
4. 修改完成后，将 spec 展示给用户确认
5. ⚠️ 用户看到的 spec 必须已经经过审查和修正，不要让用户替你找问题

### Phase 2a: 生成 E2E 验收测试（主 Agent 执行）
1. 从 spec 的「验收行为（E2E 锚点）」部分，生成 E2E 测试到 `e2e/` 目录
2. E2E 测试只描述**用户可见的操作和结果**，不涉及内部实现细节
3. 这一步必须在写任何实现代码之前完成
4. **生成 E2E 测试后暂停，等待用户确认是否准确反映验收标准**
5. ⚠️ 后续实现阶段**禁止修改 E2E 测试**，只能让代码通过它
6. ⚠️ 编写 E2E 测试时必须参照 `docs/e2e-patterns.md` 中的模式手册，禁止凭空编写冷启动/鉴权逻辑

### Phase 2b: 生成单元测试 + 实现代码（sdd-implementer Agent）
**必须使用 `sdd-implementer` Agent 执行此阶段**，确保实现与 E2E 测试的上下文完全隔离。
1. 调用 sdd-implementer Agent，传入 spec 文件路径
2. Agent 独立读取 spec + CLAUDE.md + 相关代码，**禁止读取 e2e/ 目录**
3. Agent 为每个场景生成单元测试（`features/xxx/xxx.test.ts` 或 `gateway/src/`）
4. 命名格式：`should_[期望行为]_when_[条件]`
5. Agent 运行测试确认失败（红色），然后编写最小实现让测试通过
6. Agent 完成后返回实现报告，主 Agent 检查异常后进入 Phase 3
7. 如果是 `risk: low` 的任务，可跳过用户确认，直接进入实现

### Phase 3: 对抗性审查（code-review-global Agent）
**必须使用 `code-review-global` Agent 执行此阶段**，确保审查视角独立于实现。
1. 用 code-review-global Agent 审查本次 diff
2. 审查重点：可能的 bug、未覆盖的边界条件、E2E 测试未捕获的失败路径
3. 如果发现问题 → 主 Agent 补充测试用例 → 修复代码 → 重新验证
4. 审查结果记录在本次任务的输出中

### 🚀 子 Agent 调用规范：预注入上下文以节省 token
调用任何子 Agent 时，主 Agent **必须**在 prompt 中附带已掌握的结构化上下文，减少子 Agent 重复 grep/read：
```
## 预计算上下文（主 Agent 提供）
- Spec 路径: specs/xxx.md
- 涉及文件: [已知的改动文件列表]
- 依赖链: [已分析的模块依赖关系]
- 已知约束: [从 spec/pitfalls 中提取的关键约束]
```
⚠️ **隔离边界不可突破**：预注入上下文不得包含被隔离的信息。例如：
- `sdd-implementer` 禁止接收 E2E 测试内容、文件路径、断言逻辑
- `code-review-global` 禁止接收实现过程中的试错细节（只传最终 diff）
- 原则：**传结论不传过程，传坐标不传内容**（告知"涉及 use-notes.ts 的轮询逻辑"而非贴代码段）

### Phase 4: 验证循环
1. 运行 `pnpm test` 或 `npm run verify`（**全量**单元测试 → tsc → eslint）
   - ⚠️ 必须跑全量测试，不能只跑当前 feature 的测试。全量测试是回归防护网。
2. **使用 `e2e-runner` Agent** 运行 `npx playwright test`（**全量** E2E 验收测试）
   - ⚠️ 同理，必须跑全部 E2E，确保新改动没有破坏已有功能。
   - `e2e-runner` 内置 V2Note 常见失败模式诊断知识（冷启动卡住、WS 阻塞、onboarding 未跳过等）
   - 失败时 Agent 自动读取 `test-results/` 下的截图 + error-context.md，输出诊断报告
   - **Agent 只诊断不修复**，主 Agent 根据诊断报告决定修复方向
3. 如果测试失败：
   - 先区分：是**当前 feature 的测试**失败，还是**其他模块的回归测试**失败
   - 回归测试失败 → 说明本次改动引入了回归 bug，优先修复，**不得删除或修改已有回归测试**
   - 当前 feature 测试失败 → 修改实现代码（不是修改测试！不是修改 E2E！）
   - 重新运行测试（再次调用 `e2e-runner`）
   - 最多循环 5 次
4. 如果 5 次后仍有失败，向用户报告具体问题
5. 全部通过后，运行 TypeScript 类型检查

### Phase 5: 收尾
1. 更新 spec 状态为 ✅ completed
2. 如果实现过程中发现 spec 遗漏的场景，补充到 spec 中
3. 如果是 bug 修复，必须在 `specs/buglog.md` 追加一条记录
4. 如果本次实现中出现过测试失败→修复的循环，分析根因并沉淀：
   - 是 spec 描述不清？→ 改进 spec 对应部分
   - 是主 Agent 理解偏差？→ 追加到本文件「已知陷阱」部分
   - 是测试覆盖不足？→ 追加边界场景到 spec
   - 是子 Agent 的问题？→ 追加到对应 Agent 定义文件（`.claude/agents/<agent>.md`）的已知陷阱/注意事项部分，例如：
     - `e2e-runner` 诊断遗漏的失败模式 → 写入 `e2e-runner.md`
     - `sdd-implementer` 实现中反复犯的错误模式 → 写入 `sdd-implementer.md`
     - `code-review-global` 审查漏掉的问题类型 → 写入 `code-review-global.md`

### Phase 5b: 提交
1. Phase 4 + Phase 5 全部完成后，**必须先创建 git commit**，再进入流程回顾
2. 确保所有改动（实现代码、测试、spec 更新、buglog）都已暂存并提交

### Phase 6: 流程回顾（用户参与）

每次任务完成后，向用户展示简要回顾：

1. **本次执行摘要**：
   - spec 名称 + 改动文件数 + 测试数量
   - 验证循环次数（重试了几次）
   - E2E 通过/失败情况
   - 对抗性审查发现的问题数

2. **流程问题自检**（Agent 自评）：
   - 哪个阶段耗时最长？是否有重复劳动？
   - spec 是否足够清晰支撑实现？
   - 测试是否真正覆盖了用户意图？

3. **用户反馈**：
   - 用户评估本次流程是否顺畅，指出需要改进的环节
   - 如果用户提出流程改进建议 → **直接修改 CLAUDE.md 对应规则**

4. **改进记录**：
   - 将本次流程改进写入 `specs/buglog.md`（标注为「流程改进」类型）

## 📋 Bug Log 机制

1. 每次 bug 修复完成后，必须在 `specs/buglog.md` 追加一条记录（格式见该文件）
2. 每天首次开始任务时，检查 buglog.md 中「已提炼: ❌」的条目：
   - 如果同类 bug 出现 2 次以上 → 提炼为通用规则，写入下方「已知陷阱」
   - 如果某条教训具有通用性（不限于特定 bug）→ 立即提炼
3. 提炼后将对应条目标记为「已提炼: ✅」

## 🛡️ 已知陷阱（按需加载）

领域陷阱已拆分到 `docs/pitfalls/`，Hook 会按本次改动的文件路径自动注入相关内容：

- `docs/pitfalls/timezone.md` — 后端 + 前端时区契约陷阱
- `docs/pitfalls/shared-components.md` — 共享组件/模板/多路径分裂
- `docs/pitfalls/ai-hallucination.md` — LLM 输出 ID 校验 / 去重防护
- `docs/pitfalls/db-lock.md` — Supabase pooler 锁与长事务
- `docs/pitfalls/migration.md` — DROP TABLE 清理 / 身份迁移全链路

流程类通用规则保留在本文件：
- [测试] 禁止同一个 Agent 在同一上下文中既写实现又写 E2E 测试，防止"自我对齐"假绿
- [删除操作] spec 中涉及删除必须明确标注 soft/hard delete，默认 soft
- [回归] Phase 4 必须跑全量测试，不能只跑当前 feature；回归测试失败优先级高于新 feature 测试失败
- [流程] Phase 1b spec 审查必须前台等待结果，禁止后台化与实现并行
- [E2E] 所有 E2E 测试必须由 `e2e-writer` Agent 编写，该 Agent 内置 V2Note 冷启动/鉴权/导航模式，避免主 Agent 每次新上下文重复试错
- [E2E] 冷启动必须处理三步：登录 → onboarding 跳过 → first-run 遮罩关闭；或用 Gateway API 注册 + token 注入绕过全部 UI 流程

新发现的通用规则（跨域、流程类）追加到此处；领域陷阱追加到 `docs/pitfalls/` 对应文件。

## 🎯 风险分级

Spec frontmatter 中的 `risk` 字段决定流程自动化程度：
- `risk: low`（纯 UI 样式、已有模式重复）→ 跳过用户确认测试步骤，全自动跑完出报告
- `risk: medium`（新功能到已有模块、bug 修复）→ 正常 SDD 流程，默认值
- `risk: high`（新模块、数据模型变更、跨模块交互）→ 每个 Phase 都需要用户确认

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

## 🕐 时区契约（全局强制）

> UTC 进，UTC 存，最后一刻转。时区只在两个边界处理：用户输入 → UTC，UTC → 用户显示。

### 存储层
- PostgreSQL `timestamptz` 内部一律 UTC
- 用户表存 `timezone` 字段（IANA 格式，如 `Asia/Shanghai`），后续国际化时按用户设置转换
- DB 连接池已设 `SET timezone = 'Asia/Shanghai'`

### API 层（Gateway）
- 返回时间一律 ISO 8601 带 `Z` 后缀：`"2026-04-09T01:00:00.000Z"`
- 接收时间接受带偏移的 ISO 8601：`"2026-04-09T09:00:00+08:00"`
- **禁止传输"裸时间"**（无时区信息的字符串如 `"2026-04-09T09:00:00"`）
- 获取当前时间/日期：必须用 `gateway/src/lib/tz.ts` 导出函数（`tzNow()`, `today()`, `daysAgo()`, `dayRange()` 等）
- **禁止** `new Date()` / `new Date().toISOString()` 做日期计算（服务器可能在 UTC 时区）

### 前端（浏览器）
- 解析后端时间：**直接 `new Date(isoString)`**，浏览器自动按本地时区处理
- **禁止** `.replace(/Z$/i, "")` 剥离 Z 后缀
- 获取本地日期字符串：`getLocalToday()` 或 `toLocalDateStr(new Date())`（来自 `features/todos/lib/date-utils.ts`）
- 从时间戳提取日期：`toLocalDate(ts)` 或 `toLocalDateStr(new Date(ts))`
- **禁止** `new Date().toISOString().split("T")[0]`（返回 UTC 日期，北京 0:00-8:00 会错一天）
- **禁止** `ts.split("T")[0]` 提取日期（对 UTC ISO 字符串返回 UTC 日期）
- 构造带时区的时间字符串：`${date}T${time}:00${localTzOffset()}`
- `toLocaleString` 系列用于纯展示时可以使用，但必须传明确的 locale 参数

### 禁止模式速查
```typescript
// ❌ 全部禁止
new Date().toISOString().split("T")[0]     // UTC 日期
ts.replace(/Z$/i, "")                      // 剥离时区
someDate.split("T")[0]                     // UTC 日期提取
new Date()  // 仅在 gateway 中禁止，用 tzNow()

// ✅ 正确做法
getLocalToday()                            // 前端：本地今天
toLocalDateStr(new Date(ts))               // 前端：时间戳→本地日期
toLocalDate(ts)                            // 前端：时间戳→本地日期字符串
parseScheduledTime(ts)                     // 前端：解析为本地 Date
tzNow()                                    // 后端：当前时间
today()                                    // 后端：今天日期字符串
toLocalDateTime(ts)                        // 后端：给 AI/用户看的本地时间
```

## 🦌 产品核心原则

- **混沌输入**：用户可以将人任何东西丢进来，散乱的感想，项目规划，文章，读书笔记，账单，行程，anything;
- **结构涌现**：不做用户手动分类，主题/目标从 Strike 密度中自然长出
- **AI 沉默为主**：AI 只在每日回顾中汇报，不在别处打扰
- **feel 排除逻辑链**：情感 Strike 只记录不分析，尊重用户感受自主权
- **material 降权**：外部素材 salience 1/5~1/10，不参与涌现，只被动吸附

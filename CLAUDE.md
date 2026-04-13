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

### Phase 2a: 生成 E2E 验收测试（独立于实现）
1. 从 spec 的「验收行为（E2E 锚点）」部分，生成 E2E 测试到 `e2e/` 目录
2. E2E 测试只描述**用户可见的操作和结果**，不涉及内部实现细节
3. 这一步必须在写任何实现代码之前完成
4. **生成 E2E 测试后暂停，等待用户确认是否准确反映验收标准**
5. ⚠️ 后续实现阶段**禁止修改 E2E 测试**，只能让代码通过它

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

### Phase 4: 验证循环
1. 运行 `pnpm test` 或 `npm run verify`（**全量**单元测试 → tsc → eslint）
   - ⚠️ 必须跑全量测试，不能只跑当前 feature 的测试。全量测试是回归防护网。
2. 运行 `npx playwright test`（**全量** E2E 验收测试）
   - ⚠️ 同理，必须跑全部 E2E，确保新改动没有破坏已有功能。
3. 如果测试失败：
   - 先区分：是**当前 feature 的测试**失败，还是**其他模块的回归测试**失败
   - 回归测试失败 → 说明本次改动引入了回归 bug，优先修复，**不得删除或修改已有回归测试**
   - 当前 feature 测试失败 → 修改实现代码（不是修改测试！不是修改 E2E！）
   - 重新运行测试
   - 最多循环 5 次
4. 如果 5 次后仍有失败，向用户报告具体问题
5. 全部通过后，运行 TypeScript 类型检查

### Phase 5: 收尾
1. 更新 spec 状态为 ✅ completed
2. 如果实现过程中发现 spec 遗漏的场景，补充到 spec 中
3. 如果是 bug 修复，必须在 `specs/buglog.md` 追加一条记录
4. 如果本次实现中出现过测试失败→修复的循环，分析根因并沉淀：
   - 是 spec 描述不清？→ 改进 spec 对应部分
   - 是 Agent 理解偏差？→ 追加到本文件「已知陷阱」部分
   - 是测试覆盖不足？→ 追加边界场景到 spec

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

## 🛡️ 已知陷阱（从历史错误中沉淀）

每次功能验收失败或 bug 修复后，如果教训具有通用性，必须在此追加一条规则：
- 格式：`- [领域] 具体规则描述 (来源: fix-xxx.md 或日期)`
- 规则应具体可执行，不要写泛泛的"注意 xxx"

（随项目迭代持续积累，以下为初始条目）
- [测试] 禁止同一个 Agent 在同一上下文中既写实现又写 E2E 测试，防止"自我对齐"假绿
- [共享组件] 修改任何被 2+ 个 feature 引用的组件前，必须 grep 所有引用方并在 spec 中列出影响范围
- [删除操作] spec 中涉及删除必须明确标注 soft/hard delete，默认 soft
- [回归] Phase 4 必须跑全量测试，不能只跑当前 feature；回归测试失败优先级高于新 feature 测试失败 (来源: 2026-04-08 流程讨论)
- [流程] Phase 1b spec 审查必须前台等待结果，禁止后台化与实现并行。审查的价值是拦截 spec 偏差，后台化等于跳过审查 (来源: 2026-04-08 fix-tag-overflow)
- [日期] gateway 中日期计算禁止使用 `toISOString().split("T")[0]`（返回 UTC）和 `created_at.split("T")[0]`（DB 可能返回 UTC ISO）。必须使用 `lib/tz.ts` 导出函数：`today()`, `daysAgo(n)`, `toLocalDate(d)`, `todayRange()`, `dayRange()`, `weekRange()`, `monthRange()`。tz.ts 硬编码 Asia/Shanghai 不依赖 process.env.TZ。DB 连接池已设 `SET timezone = 'Asia/Shanghai'` (来源: fix-timezone-systematic)
- [模板] 共享 prompt 模板（如 `templates.ts`）有多个消费者时，更新占位符必须同步更新所有消费者的 `.replace()` 逻辑，否则 AI 会收到未替换的 `{变量名}` 字面量 (来源: fix-morning-briefing)
- [前端时区] 前端解析后端 `timestamptz` 值时，禁止 `.replace(/Z$/i, "")` 剥离 Z 后缀。直接 `new Date(isoString)` 会正确解析 UTC，`getHours()`/`getDate()` 自动返回本地时间。剥离 Z 会导致 UTC 时间被当作本地时间，产生 -8h 偏移 (来源: fix-todo-time-shift)
- [前端时区] 前端获取"今天日期"禁止 `new Date().toISOString().split("T")[0]`（返回 UTC 日期）。必须用 `getLocalToday()` 或 `toLocalDateStr(new Date())`。同理，从时间戳提取日期用 `toLocalDate(ts)` 而非 `ts.split("T")[0]` (来源: fix-todo-time-shift)
- [数据库锁] 禁止在 Supabase transaction pooler（端口 6543）上使用 session-level advisory lock（`pg_advisory_lock/unlock`）。lock 和 unlock 会被路由到不同后端连接，导致锁永远无法释放。必须使用 `pg_try_advisory_xact_lock`（事务级，包裹在 BEGIN/ROLLBACK 中，事务结束自动释放）(来源: 2026-04-10 wiki-compiler lock 泄漏)
- [数据库锁] Supabase Transaction Pooler 会杀死持有超过约 60 秒的事务连接。禁止在事务中执行 AI 调用或其他长时间操作。如果需要并发控制，单实例服务使用进程内 `Set/Map` 内存锁替代 DB advisory lock (来源: 2026-04-11 wiki-compiler 连接被杀)
- [数据库迁移] DROP TABLE migration 提交后，必须全局搜索 `FROM/INTO/UPDATE/JOIN/DELETE FROM <table_name>` 清理所有代码引用。不能只修触发报错的路径——低频调用路径（定时任务、侧边栏、认知引擎）的残留 SQL 会在后续运行时爆炸 (来源: 2026-04-12 fix-record-delete-strike，strike 表删除后 11 处 SQL 残留)
- [身份迁移] 身份体系迁移（如 deviceId→userId）必须覆盖全链路：JWT签发 → WS认证 → Session管理 → HTTP路由层 → DB Schema(NOT NULL约束) → 编译部署。遗漏任一层会在不同时机爆炸。特别注意：(1) DB 列的 NOT NULL 约束必须同步迁移；(2) HTTP 路由层的 helper 函数（如 getDeviceId）必须同步替换，否则大量路由返回 401；(3) 修改 gateway 代码后必须重新 `pnpm build` 并重启服务 (来源: 2026-04-13 fix-device-id-cleanup)
- [AI 幻觉] LLM 输出的任何 ID（UUID / FK 引用）都不可信。在执行 DB 写入前必须：(1) 正则校验格式（`/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i`）；(2) `SELECT 1 FROM target_table WHERE id = $1` 存在性检查。AI 会编造格式正确但不存在的 UUID，也会编造格式非法的伪 UUID。INSERT 语句使用 `WHERE EXISTS` 子查询防护 (来源: 2026-04-11 wiki-compiler 6 层 FK violation)

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

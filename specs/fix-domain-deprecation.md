---
id: "fix-domain-deprecation"
title: "Fix: domain 字段全面废弃 — 停止写入 + 读取迁移"
status: completed
backport: cognitive-wiki-core.md
domain: infra
risk: medium
dependencies: ["fix-sidebar-wiki-mgmt.md", "fix-process-domain-to-page.md", "fix-goal-quality.md"]
created: 2026-04-13
updated: 2026-04-13
---

# Fix: domain 字段全面废弃

## 概述

`domain` 字段（todo.domain, wiki_page.domain, record.domain）是旧分类体系的残留。
当前系统已迁移到 wiki_page title 作为分类标识，但 domain 字段仍在多处被读写：

- **6 处活跃写入**：lightweight-classifier、at-route-parser、wiki-compiler、todo create/update、routes/todos
- **12+ 处活跃读取**：wiki-compiler prompt、search 工具、goals 路由、getDimensionSummary 等
- **2 个废弃函数**：findGoalsByDomain()、getDimensionSummary()

domain 字段的存在制造了双重分类的困惑：AI prompt 同时收到 domain 和 page title，
搜索工具仍支持 domain 过滤，目标按 domain 分组而非 wiki page。

**目标**：停止所有 domain 写入，将读取迁移到 wiki_page 等价物，保留 DB 列但不再使用。

## 1. 停止 domain 写入

### 场景 1.1: lightweight-classifier 停写 domain
```
假设 (Given)  lightweight-classifier.ts L173 和 L191 在创建 page 时设 domain: domain_title
当   (When)   清理代码
那么 (Then)   移除 domain 字段的赋值（创建 page 时不再传 domain）
并且 (And)    domain_title 变量仅用于 title 字段（已有），不再传给 domain
说明 (Note)   lightweight-classifier 创建 page 时同时设了 title 和 domain 为相同值，
             移除 domain 后 title 仍在，功能不受影响
```

### 场景 1.2: at-route-parser 停写 domain
```
假设 (Given)  at-route-parser.ts L58 和 L79 在创建 page 时设 domain: domainTitle
当   (When)   清理代码
那么 (Then)   移除 domain 字段的赋值
说明 (Note)   @route 解析的 domainTitle 已经是 page.title，domain 是冗余写入
```

### 场景 1.3: wiki-compiler 停写 domain
```
假设 (Given)  wiki-compiler.ts L551 和 L608 在创建/裂变 page 时设 domain
当   (When)   清理代码
那么 (Then)   移除 domain 字段的赋值
并且 (And)    L551: `domain: cp.domain ?? null` → 移除
并且 (And)    L608: `domain: parentPage?.domain ?? undefined` → 移除
```

### 场景 1.4: routes/todos.ts 停传 domain
```
假设 (Given)  routes/todos.ts L55 在 POST /api/v1/todos 时传 domain: body.domain
当   (When)   清理代码
那么 (Then)   移除 domain 字段的传递（不从请求 body 中读取 domain）
并且 (And)    PATCH 路由同理，移除 domain 的传递
```

## 2. 读取迁移

### 场景 2.1: wiki-compiler prompt — existingDomains → 移除
```
假设 (Given)  wiki-compile-prompt.ts 的 CompilePromptInput 有 existingDomains 字段
并且 (And)    buildSystemPrompt 使用 existingDomains 构建 domainHint 提示 AI 复用已有 domain
当   (When)   清理代码
那么 (Then)   从 CompilePromptInput 移除 existingDomains 字段
并且 (And)    从 buildSystemPrompt 移除 domainHint 构建逻辑（L72-76）
并且 (And)    从 prompt 正文中移除 "domain 是简短中文一级分类" 等说明
并且 (And)    从 JSON 示例中移除 "domain" 字段（L186）
并且 (And)    wiki-compiler.ts L228 移除 existingDomains 构建
并且 (And)    wiki-compiler.ts L263 移除 existingDomains 传递
说明 (Note)   page title 已经承载了分类信息，AI 通过 allPageIndex 的 title 列感知已有分类
```

### 场景 2.2: wiki-compiler prompt — page 表格移除 domain 列
```
假设 (Given)  buildUserMessage 中 allPageIndex 表格和 matchedPages 表格包含 domain 列
当   (When)   清理代码
那么 (Then)   移除表头和数据行中的 domain 列
并且 (And)    L251, L265: 移除 `domain=${page.domain ?? "未分类"}` 和 `${page.domain ?? "-"}`
说明 (Note)   page title 已经是分类标识，domain 列是冗余信息
```

### 场景 2.3: wiki-compiler PageIndex/MatchedPage 类型移除 domain
```
假设 (Given)  wiki-compiler.ts 中 PageIndex (L48) 和 MatchedPage (L96) 包含 domain 字段
当   (When)   清理代码
那么 (Then)   移除 domain 字段
并且 (And)    L218, L247, L254, L393: 移除 `domain: p.domain` 映射
```

### 场景 2.4: getDimensionSummary 替换为按 wiki_page 分组
```
假设 (Given)  todoRepo.getDimensionSummary() 按 COALESCE(domain, '其他') 分组
并且 (And)    仅被 goals.ts:148 调用一处
当   (When)   清理代码
那么 (Then)   重写为按 wiki_page.title 分组：
             SELECT wp.title AS dimension, COUNT(*)::int AS goal_count, ...
             FROM todo t LEFT JOIN wiki_page wp ON wp.id = t.wiki_page_id
             WHERE t.level >= 1 ...
             GROUP BY wp.title
并且 (And)    COALESCE(wp.title, '未分类') 替代 COALESCE(domain, '其他')
并且 (And)    返回类型的 domain 字段保持字段名不变（前端可能读取此字段名），语义变为 page title
说明 (Note)   保持 JSON 字段名 `domain` 不变避免前端崩溃，只是数据来源从 todo.domain 变为 wiki_page.title
```

### 场景 2.5: findGoalsByDomain 废弃
```
假设 (Given)  todoRepo.findGoalsByDomain() 按 todo.domain 筛选
当   (When)   检查调用方
那么 (Then)   如果无调用方 → 直接删除函数
并且 (And)    如果有调用方 → 改为按 wiki_page_id 筛选（JOIN wiki_page WHERE wp.title = $2）
```

### 场景 2.6: search 工具 domain 过滤迁移
```
假设 (Given)  search.ts L137-138 按 record.domain 过滤
并且 (And)    search.ts L243-246 按 todo.domain 过滤
当   (When)   清理代码
那么 (Then)   record 搜索的 domain 过滤改为：
             JOIN wiki_page_record wpr + JOIN wiki_page wp WHERE wp.title ILIKE $N
并且 (And)    todo 搜索的 domain 过滤改为：
             LEFT JOIN wiki_page wp ON wp.id = t.wiki_page_id WHERE wp.title ILIKE $N
并且 (And)    search 工具的 schema 描述从"按领域过滤"改为"按主题过滤"
说明 (Note)   两阶段策略：先精确匹配 wp.title = $N，无结果再 ILIKE '%' || $N || '%'
             避免"工作"匹配到"工作事务""工作汇报"等多个 page 扩大结果集
```

### 场景 2.7: view 工具移除 domain 返回
```
假设 (Given)  view.ts L96 返回 domain: record.domain
当   (When)   清理代码
那么 (Then)   改为返回 wiki_page 的 title（需 JOIN 查询）
并且 (And)    或直接移除 domain 字段（view 工具已返回 record 的 wiki_page 关联信息）
```

### 场景 2.8: routes/wiki.ts 移除 domain 返回
```
假设 (Given)  wiki.ts L59 在 page 详情中返回 domain: p.domain
当   (When)   清理代码
那么 (Then)   移除 domain 字段返回（title 已经是等价信息）
```

## 3. 前端 domain 读取处理

### 场景 3.0: 前端保持向后兼容，不立即迁移
```
假设 (Given)  前端有 26+ 个文件读取 todo.domain 做颜色/图标渲染（domain-config.ts 等）
并且 (And)    后端 todo 和 wiki_page 表的 domain 列保留不删
当   (When)   后端停止写入 domain
那么 (Then)   前端不做改动（本 spec 范围外）
并且 (And)    新创建的 todo/wiki_page 的 domain 为 NULL → 前端显示默认样式
并且 (And)    旧数据 domain 不为空 → 前端继续渲染旧颜色/图标
说明 (Note)   前端 domain 视觉系统的迁移（改为按 wiki_page.title 着色）是独立任务，
             不在本 spec 范围内。本 spec 仅保证后端停写不会导致前端崩溃——
             前端对 domain=null 已有 fallback（"其他"分组 / 默认颜色）
```

## 4. 类型定义清理

### 场景 4.1: repo 类型移除 domain
```
假设 (Given)  Todo interface (todo.ts L27)、WikiPage interface (wiki-page.ts L20)、Record interface (record.ts L20) 包含 domain 字段
当   (When)   清理代码
那么 (Then)   从 interface 中移除 domain 字段
并且 (And)    create/update 参数类型中移除 domain
并且 (And)    编译确认无 TS 错误
说明 (Note)   DB 列保留不删，只是代码层不再读写。SELECT * 查出的 domain 在 TS 层被忽略
```

### 场景 4.2: 测试文件同步更新
```
假设 (Given)  测试文件中有 domain 相关的 mock 数据或断言
当   (When)   清理代码
那么 (Then)   移除测试中的 domain 字段引用
并且 (And)    wiki-compile-prompt.test.ts: existingDomains 相关测试用例更新
并且 (And)    wiki-compiler-links.test.ts: existingDomains 相关 mock 更新
```

## 验收行为（E2E 锚点）

### 行为 1: 新建记录不再写 domain
1. 用户录音一段话
2. process.ts 处理后检查 DB
3. wiki_page_record 有关联（通过 page_title 分类）
4. 新建的 wiki_page 和 todo 的 domain 列为 NULL

### 行为 2: 搜索工具按主题过滤
1. 用户对 AI 说"搜索工作相关的待办"
2. AI 调用 search 工具，domain 参数映射为 wiki_page.title 匹配
3. 返回 wiki_page_id 关联到"工作"page 的 todo

### 行为 3: wiki-compiler 不再输出 domain
1. 触发 wiki compilation
2. AI prompt 中不包含 domain 字段
3. AI 返回的 JSON 中不包含 domain

## 边界条件
- [ ] 旧数据 domain 不为空但 wiki_page_id 为空 → search 按 domain 回退匹配？不回退，已有 065 迁移处理
- [ ] 前端是否读取 domain → grep 前端代码确认（可能在 sidebar 或 goal-list 中）
- [ ] 第三方 API 消费者依赖 domain 字段 → 当前无第三方，安全移除
- [ ] getDimensionSummary 重写后前端显示是否一致 → 前端读的是返回值的字段名，重命名需同步
- [ ] SELECT * 返回的 domain 列 → TS 忽略即可，不会报错

## 接口约定

### 不删的内容
- **DB 列**：todo.domain、wiki_page.domain、record.domain 保留不删（历史数据可查）
- **迁移脚本**：不需要 DROP COLUMN（避免大表锁）

### 要删/改的完整清单

| 文件 | 行 | 操作 |
|------|-----|------|
| `lightweight-classifier.ts` | L173, L191 | 移除 `domain:` 赋值 |
| `at-route-parser.ts` | L58, L79 | 移除 `domain:` 赋值 |
| `wiki-compiler.ts` | L48, L96, L107, L218, L228, L247, L254, L263, L393, L551, L608 | 移除 domain 相关字段和逻辑 |
| `wiki-compile-prompt.ts` | L40, L57, L62, L72-76, L151, L158, L186, L251, L265 | 移除 existingDomains + prompt 中的 domain |
| `wiki-compile-prompt.test.ts` | L35, L95, L99, L112 | 移除 existingDomains mock |
| `wiki-compiler-links.test.ts` | L95, L112 | 移除 existingDomains mock |
| `routes/todos.ts` | L27, L55, L101 | 移除 domain 传递 |
| `routes/wiki.ts` | L59 | 移除 domain 返回 |
| `db/repositories/todo.ts` | L27, L160, L190, L253, L285, L487, L545, L611, L614, L624 | 移除 domain 参数和写入 |
| `db/repositories/todo.ts` | L648-663 | 删除 findGoalsByDomain() |
| `db/repositories/todo.ts` | L712-730 | 重写 getDimensionSummary() |
| `db/repositories/wiki-page.ts` | L20, L39, L48, L60, L116, L146-148 | 移除 domain 参数和写入 |
| `db/repositories/record.ts` | L20 | 移除 interface 中 domain |
| `tools/search.ts` | L137-138, L243-246, L273, L284 | 重写为 wiki_page.title 匹配 |
| `tools/definitions/search.ts` | L25 | 描述改为"按主题过滤" |
| `tools/definitions/view.ts` | L96 | 移除或替换 domain 返回 |
| `routes/goals.ts` | L148 | 适配 getDimensionSummary 新签名 |

## Implementation Phases
- [ ] Phase 1: 停止写入 — 移除全部 6 处 domain 写入（场景 1.1-1.4）
- [ ] Phase 2: Prompt 清理 — wiki-compile-prompt + wiki-compiler 移除 domain 逻辑（场景 2.1-2.3）
- [ ] Phase 3: 读取迁移 — getDimensionSummary 重写 + findGoalsByDomain 删除 + search 重写（场景 2.4-2.8）
- [ ] Phase 4: 类型清理 — interface 移除 domain + 测试同步（场景 3.1-3.2）
- [ ] Phase 5: 全量回归 — pnpm test + tsc

## 备注
- DB 列保留不删，避免 ALTER TABLE 锁大表
- record.domain 的历史数据仍可通过直接 SQL 查询，但代码层不再暴露
- 本 spec 与 fix-goal-wiki-data-cleanup.md 配合：先清代码（本 spec）防止新脏数据，再清数据
- lightweight-classifier.ts 的 AI schema 中有 `domain_title` 字段，这是 AI 返回值的 key，不是 DB domain 列。保留此 schema 字段用于分类，只是不写入 wiki_page.domain
- **与 fix-process-domain-to-page.md 的重叠**：process.ts 的 `existingDomains→existingPages` 改造已在该 spec 中完成。本 spec 场景 1.x 中 process.ts/routes/todos.ts 的停写可能已部分完成——实施前需 grep 确认哪些已清理，避免重复工作
- **与 fix-goal-quality.md 的去重精度差异**：goal-quality 的 DB 兜底用 `LOWER(TRIM())`，本 spec 不涉及去重逻辑，无冲突

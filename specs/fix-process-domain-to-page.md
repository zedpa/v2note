---
id: "fix-process-domain-to-page"
title: "Fix: Layer 3 domain 废弃残留 → 替换为即时 page_title 归类"
status: completed
backport: cognitive-wiki-core.md
domain: cognitive
risk: medium
dependencies: ["cognitive-wiki.md", "prompt-architecture-v2.md"]
created: 2026-04-13
updated: 2026-04-13
---

# Fix: Layer 3 domain 废弃残留 → 替换为即时 page_title 归类

## 概述

Layer 3 统一处理（`unified-process-prompt.ts` + `process.ts`）中：
- `domain` 字段已于 Phase 11 废弃（注释标注"已移除"），但 **prompt 仍指导 AI 生成 domain**，浪费 token
- tags 提取逻辑依赖 domain 路径拆分（如 `"工作/采购"` → `["工作", "采购"]`），domain 废弃后 tags 逻辑过时
- Record 创建后仅标记 `compile_status='pending'`，等待异步 wiki-compiler 编译归类 → **用户看不到即时归类反馈**

**修复方案**：将 domain 替换为 `page_title`——AI 直接输出该 record 应归属的 wiki page 标题（从已有 page 列表中匹配或建议新标题），process.ts 立即创建 `wiki_page_record` 关联。tags 改为由 page_title + 内容关键词生成。

## 架构断裂分析（知识图谱）

> 基于 `graphify-out/graph.json` 的联通性分析（2026-04-13），8 个关键模块分散在 8 个独立社区，零直连。

### 断裂点清单

| 起点 | 终点 | 应有关系 | 现状 | 本次修复 |
|------|------|----------|------|----------|
| `process.ts` (community 4) | `wiki-page.ts` (community 24) | 处理→即时归类 | **完全断裂** — process.ts 不引用任何 wiki 模块 | **本 spec 修复** — 新增 import wikiPageRepo + wikiPageRecordRepo |
| `process.ts` (community 4) | `lightweight-classifier.ts` (community 13) | 处理→轻量分类协调 | **完全断裂** — 两者各自独立工作 | **本 spec 修复** — classifier 检查已有关联后跳过 |
| `process.ts` (community 4) | `wiki-compiler.ts` (community 2) | 处理→编译 | **完全断裂** — 无路径联通 | 不修（异步触发，不需直连） |
| `digest.ts` (community 34) | `lightweight-classifier.ts` (community 13) | 消化→分类 | **完全断裂** — digest 调用 classifier 但图谱未识别（动态 import） | 不修（fire-and-forget 调用，实际运行正常） |
| `wiki-compiler.ts` (community 2) | `todo.ts` (community 1) | goal_sync→创建 todo | **完全断裂** — 用原始 SQL 绕过 repo 层 | 见 `repo-transaction-support.md` |
| `goal.ts` (community 20) | `wiki-page.ts` (community 24) | 目标↔知识页面 | **完全断裂** — updateWikiPageRef 用原始 SQL | 见 `repo-transaction-support.md` |
| `wiki-compiler.ts` (community 2) | `wiki-page-record.ts` (community 28) | 编译→关联 record | **半断裂** — 读用 repo，写全用 raw SQL | 见 `repo-transaction-support.md` |

### 断裂根因

`wiki-compiler.ts` 的 `executeInstructions()` 在 `BEGIN/COMMIT` 事务内用 `client.query` 直接操作 SQL，没有把 repo 方法改造成支持传入 `client` 的版本。导致：
- **读阶段**（事务外）正常使用 repo：`findPagesByRecords()` 查询 record→page 关联
- **写阶段**（事务内）全部绕过 repo：`INSERT INTO wiki_page_record`、`INSERT INTO todo`、`DELETE/UPDATE wiki_page_record`

repo 不多余——`at-route-parser`、`lightweight-classifier`、`wiki.ts`（routes）、`manage-wiki-page`（Agent tool）等 4 个消费者正常使用 wiki-page-record repo 的 `link()`、`unlinkAllByPage()`、`transferAll()` 等方法。

其余断裂点（raw SQL 绕过 repo）由独立 spec `repo-transaction-support.md` 处理。

**本 spec 修复 2 个断裂点**（process.ts → wiki-page、process.ts → lightweight-classifier 的协调）。

## 当前数据流（问题）

```
用户语音 → process.ts Layer 3 → AI 返回:
  summary ✅
  domain  ❌ 废弃，生成后被丢弃
  tags    ⚠️ 依赖 domain 路径拆分，逻辑过时
  todos   ✅
  commands ✅
                    ↓
record 存入 DB（compile_status='pending'）
                    ↓
wiki-compiler（异步，可能延迟数分钟）→ 才关联到 wiki page
```

## 目标数据流

```
用户语音 → process.ts Layer 3 → AI 返回:
  summary    ✅
  page_title ✅ 替换 domain，输出匹配的 wiki page 标题或建议新标题
  tags       ✅ = page_title 路径段 + 内容关键词
  todos      ✅
  commands   ✅
                    ↓
process.ts 立即处理 page_title:
  1. 在已有 page 中模糊匹配 → 找到则关联 wiki_page_record
  2. 未找到 → 创建新 wiki_page → 关联 wiki_page_record
  3. compile_status 仍标记 'pending'（wiki-compiler 后续做内容编译，但归类已完成）
```

## 1. Prompt 改造 — unified-process-prompt.ts

### 场景 1.1: domain 段落替换为 page_title
```
假设 (Given)  unified-process-prompt.ts 中 §3 "自动归类 → domain" 存在
当   (When)   修改 prompt
那么 (Then)   §3 替换为 "自动归类 → page_title"
并且 (And)    AI 被指导：优先从已有 wiki page 列表中选择语义最匹配的标题原样返回
并且 (And)    匹配规则：内容的主题与已有 page 语义一致时，返回该 page 的精确标题
并且 (And)    例如：内容关于采购进度，已有 page "采购管理" → 返回 "采购管理"
并且 (And)    只有当已有 page 中确实无语义匹配时，才建议新标题
并且 (And)    新标题为简短自然中文（如 "供应链优化"、"Rust 学习"），不要用 "/" 路径格式
```

### 场景 1.2: tags 逻辑不再依赖 domain 路径
```
假设 (Given)  §4 tags 提取依赖 domain 路径拆分
当   (When)   修改 prompt
那么 (Then)   tags = page_title 本身作为第一个标签 + 1~3 个内容关键词
并且 (And)    硬性上限仍为 5 个
并且 (And)    不生成泛化标签（"日常"、"想法"、"记录"）
```

### 场景 1.3: existingDomains 重命名为 existingPages
```
假设 (Given)  UnifiedProcessContext.existingDomains 实际传入的已经是 wiki page titles
当   (When)   修改接口和 prompt
那么 (Then)   字段名改为 existingPages
并且 (And)    prompt 中展示为"用户已有的知识页面"而非"用户已有分类"
并且 (And)    传入格式改为 { id, title } 数组（process.ts 后续匹配需要 id）
```

### 场景 1.4: JSON 输出格式更新
```
假设 (Given)  输出格式中有 "domain": "工作/采购"
当   (When)   修改 prompt
那么 (Then)   替换为 "page_title": "采购管理"
并且 (And)    去掉路径格式（不再用 "工作/采购" 这种层级路径）
并且 (And)    page_title 可以是已有 page 的精确标题，也可以是新建议的标题
```

## 2. process.ts — 立即归类

### 场景 2.1: AI 返回已有 page 标题 → 立即关联
```
假设 (Given)  AI 返回 page_title = "采购管理"
并且 (And)    已有 wiki_page title = "采购管理"
当   (When)   process.ts 处理 page_title
那么 (Then)   创建 wiki_page_record(wiki_page_id, record_id) 关联
并且 (And)    record.compile_status 仍设为 'pending'（后续 wiki-compiler 编译内容）
```

### 场景 2.2: AI 返回新标题 → 创建 page 并关联
```
假设 (Given)  AI 返回 page_title = "供应链优化"
并且 (And)    已有 page 中无匹配
当   (When)   process.ts 处理 page_title
那么 (Then)   创建新 wiki_page (title="供应链优化", level=3, created_by='ai', page_type='topic')
并且 (And)    创建 wiki_page_record 关联
并且 (And)    侧边栏刷新后立即可见新 page
```

### 场景 2.3: page_title 为 null → 跳过归类
```
假设 (Given)  AI 返回 page_title = null（无法判断归类）
当   (When)   process.ts 处理
那么 (Then)   不创建 wiki_page_record
并且 (And)    record 进入收件箱（Inbox），等待 wiki-compiler 异步编译
```

### 场景 2.4: 语义匹配已有 page（非精确匹配）
```
假设 (Given)  AI 返回 page_title = "工作进度"
并且 (And)    已有 page title = "工作事项"
当   (When)   process.ts 匹配 page_title
那么 (Then)   不要求精确匹配，由 AI 在 prompt 中完成语义匹配
并且 (And)    prompt 指导 AI：从已有 page 列表中选择语义最接近的标题原样返回
并且 (And)    AI 应返回 "工作事项"（已有标题），而非自造 "工作进度"
并且 (And)    process.ts 端仅做精确字符串匹配（AI 已完成语义判断）
说明 (Note)   匹配质量完全依赖 prompt 引导：要求 AI "从列表中选择"而非"自拟标题"
```

## 3. 与 wiki-compiler 的协作

### 场景 3.1: 已归类的 record 进入 wiki-compiler
```
假设 (Given)  record 已被 process.ts 立即关联到某个 wiki_page
并且 (And)    compile_status = 'pending'
当   (When)   wiki-compiler 异步编译该 record
那么 (Then)   wiki-compiler 通过 update_pages 的 add_record_ids 关联 record
并且 (And)    因 ON CONFLICT DO NOTHING，不会产生重复关联
并且 (And)    wiki-compiler 正常更新 page content、创建 goal_sync 等
```

### 场景 3.2: page 内容臃肿时裂变拆分
```
假设 (Given)  process.ts 将多条 record 归类到 page A（L3）
并且 (And)    page A 内容逐渐膨胀
当   (When)   wiki-compiler 判断 page A 需要拆分
那么 (Then)   wiki-compiler 执行 split_page：更新 A 的 content + 创建子 page B、C
并且 (And)    子 page B、C 继承 A 的全部 record 关联（裂变，非线性拆分）
并且 (And)    A 仍保留，成为 B、C 的 parent
说明 (Note)   wiki-compiler 不会将 record 从一个 page "移动"到另一个 page
             它只会：(1) 拆分 page 时子 page 继承关联；(2) 合并 page 时迁移关联
             process.ts 的即时归类始终有效，不会被 wiki-compiler 推翻
```

## 验收行为（E2E 锚点）

### 行为 1: 即时归类到已有 page
1. 侧边栏已有 "采购管理" page
2. 用户录音："铝价又涨了，需要重新报价"
3. 录音处理完成后，侧边栏 "采购管理" 的 record 计数 +1（无需等待 wiki-compiler）

### 行为 2: 新建 page 并归类
1. 用户录音："今天开始学 Rust 了，感觉语法和 TypeScript 很不一样"
2. 处理完成后，侧边栏出现新 page "Rust 学习"
3. record 已关联到该 page

### 行为 3: tags 不再出现路径格式
1. 用户录音任意内容
2. 处理完成后，tags 中不包含 "/" 路径分隔符
3. tags 第一个是 page_title，其余是内容关键词

## 边界条件
- [ ] page_title 为空字符串 → 视为 null，跳过归类
- [ ] 已有 page 列表为空（新用户）→ AI 必须建议新标题
- [ ] AI 返回的 page_title 未命中已有 page → 创建新 page（process.ts 端仅做精确字符串匹配，语义匹配由 AI prompt 完成）
- [ ] 同一 record 被 process.ts 归类后进入 wiki-compiler → wiki-compiler 通过 ON CONFLICT DO NOTHING 跳过重复关联，不推翻 process.ts 的归类
- [ ] wiki_page_record 已存在（重复处理同一 record）→ INSERT ... ON CONFLICT DO NOTHING
- [ ] process.ts 创建新 page 时不设 parent_id（顶层 L3）→ wiki-compiler 后续可调整层级
- [ ] page 列表过长（100+ pages）→ prompt 中仅注入 top 50（按 updated_at DESC 截断），避免 token 爆炸
- [ ] userId 为空（仅 deviceId 的未登录用户）→ existingPages 为空数组，AI 建议新标题但 process.ts 跳过建库/归类（无法创建 wiki_page），等待 wiki-compiler

## 接口约定

### UnifiedProcessContext 改造
```typescript
interface UnifiedProcessContext {
  activeGoals: Array<{ id: string; title: string }>;
  pendingTodos: Array<{ id: string; text: string; scheduled_start?: string }>;
  existingPages: Array<{ id: string; title: string }>;  // 替换 existingDomains
}
```

### AI 输出格式改造
```json
{
  "intent_type": "record",
  "summary": "...",
  "page_title": "采购管理",
  "tags": ["采购管理", "铝价", "报价"],
  "todos": [...],
  "commands": []
}
```

### UnifiedResult 改造
```typescript
interface UnifiedResult {
  intent_type?: string;
  summary?: string;
  page_title?: string | null;  // 替换 domain
  tags?: string[];
  todos?: Array<{...}>;
  commands?: Array<{...}>;
}
```

## 4. 与 lightweight-classifier 的关系

### 场景 4.1: process.ts 已归类 → lightweight-classifier 跳过
```
假设 (Given)  process.ts 即时归类已创建 wiki_page_record(page_A, record_id)
当   (When)   同一 record 后来进入 digest.ts → classifyRecord（轻量分类）
那么 (Then)   classifyRecord 检查 record 是否已有 wiki_page_record 关联
并且 (And)    如已有关联 → 跳过分类，仅更新 token_count 触发编译检查
并且 (And)    如无关联（process.ts 归类失败或跳过）→ 正常分类
```

**实现**：在 `lightweight-classifier.ts` 的 `classifyRecord()` 入口处，查询 `wiki_page_record` 是否已有该 record 的关联。已有则 early return（仅做 token_count 增量 + 编译触发检查）。

### 场景 4.2: process.ts 和 digest.ts 是不同入口
```
假设 (Given)  存在两条处理路径
当   (When)   说明两者关系
那么 (Then)   process.ts（Layer 3）= 语音实时处理路径
             digest.ts = 后台异步批量消化路径
             两者可能处理同一 record，但时序上 process.ts 先执行
             lightweight-classifier 在 digest.ts step 1.6 被 fire-and-forget 调用
```

## 实施阶段

- [ ] Phase 1: unified-process-prompt.ts — 替换 domain → page_title prompt 段落 + tags 逻辑 + 输出格式
- [ ] Phase 2: process.ts — 接口改造（existingDomains → existingPages） + page_title 立即归类逻辑 + 新增 import wikiPageRepo/wikiPageRecordRepo
- [ ] Phase 3: lightweight-classifier.ts — classifyRecord 入口检查已有 wiki_page_record，已有则跳过分类
- [ ] Phase 4: 清理残留（具体清单如下）
- [ ] Phase 5: 单元测试 + 回归

### Phase 4 残留清理清单

| 文件 | 行号 | 内容 | 操作 |
|------|------|------|------|
| `unified-process-prompt.ts` | L6 | 注释 `AI 一次返回：summary + domain + tags + ...` | 改为 `page_title` |
| `unified-process-prompt.ts` | L14 | `existingDomains: string[]` | Phase 1 已改为 `existingPages` |
| `unified-process-prompt.ts` | L30-31 | `domainHint` 变量 | Phase 1 已改 |
| `unified-process-prompt.ts` | L64-70 | §3 "自动归类 → domain" 段落 | Phase 1 已替换 |
| `unified-process-prompt.ts` | L106 | `"domain": "工作/采购"` 示例 | Phase 1 已替换 |
| `process.ts` | L171-180 | `existingDomains` 变量名和查询 | Phase 2 已改 |
| `process.ts` | L190 | `existingDomains` 传入上下文 | Phase 2 已改 |
| `process.ts` | L218 | `UnifiedResult.domain?: string \| null` | 删除该字段 |
| `process.ts` | L244 | `console.log(...domain=${parsed.domain ?? "null"}...)` | 改为 `page_title` |
| `process.ts` | L264 | `// 5. domain 分配已移除` 注释 | 替换为即时归类逻辑（Phase 2） |
| `unified-process-prompt.test.ts` | L7 | `existingDomains: []` | 改为 `existingPages: []` |

## 备注
- wiki-compile-prompt.ts 中的 `domain` 是 wiki_page 表自身的分类属性，与本次修复无关，不改动
- wiki-compiler 的 goal_sync 质量问题（重复创建、缺少层级）是独立问题，见 fix-goal-quality.md
- `existingPages` 传入 `{ id, title }` 而非仅 title，是为了让 process.ts 能直接用 id 创建 wiki_page_record，避免二次查询
- 本次修复不改变 wiki-compiler 的行为——它仍然是最终裁判，只是 process.ts 提供了"快速初始归类"
- `findAllActive` 返回 `SELECT *` 含 content 列，process.ts 取 page 列表时仅 `.map(p => ({ id: p.id, title: p.title }))` 并截断 top 50，不改 repo 层查询
- **实施顺序**：本 spec（fix-process-domain-to-page）应先于 fix-goal-quality 实施，即时归类让 record-page 关联更早建立，wiki-compiler 编译时能更准确

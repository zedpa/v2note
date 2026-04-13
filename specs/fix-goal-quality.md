---
id: "fix-goal-quality"
title: "Fix: goal_sync 目标重复生成 + 缺少层级组织"
status: completed
domain: cognitive
risk: medium
dependencies: ["cognitive-wiki.md", "topic-lifecycle.md"]
created: 2026-04-13
updated: 2026-04-13
---

# Fix: goal_sync 目标重复生成 + 缺少层级组织

## 概述

Wiki-compiler 的 goal_sync 机制存在以下质量问题，导致侧边栏和待办项目页中目标杂乱：

**问题 1 — 无去重，目标重复生成**：
- AI 编译时没有已有 goal 列表作为上下文
- allPageIndex 不包含 `page_type` 字段，AI 无法区分 topic page 和 goal page
- 用户反复提到"学英语"时，AI 每次编译都可能 `goal_sync.create` 一个新 goal
- DB 层无 UNIQUE 约束（todo 表允许同 title 的 level=1 记录重复存在）

**问题 2 — 目标无层级，全部 L3 顶层**：
- goal_sync create 创建的 wiki_page 硬编码 `level=3, parent_id=NULL`
- 所有 goal 都是顶层 page，不会挂到对应的 topic page 下
- 例如：用户有 topic page "工作"，AI 创建 goal "Q2 业绩目标"，但 goal 不关联到 "工作" 下
- 导致侧边栏中 goal page 和 topic page 平铺混杂

**问题 3 — 架构断裂，模块间零直连**：
- 知识图谱（graphify-out/graph.json）分析显示：todo/goal/wiki-page/wiki-compiler 分散在不同社区，完全断裂
- `wiki-compiler.ts` (community 2) 与 `todo.ts` (community 1) 零直连 — goal_sync 通过原始 SQL 创建 todo，绕过 todoRepo
- `goal.ts` (community 20) 与 `wiki-page.ts` (community 24) 零直连 — updateWikiPageRef 用原始 SQL
- `wiki-compiler.ts` (community 2) 与 `wiki-page-record.ts` (community 28) 零直连 — record 关联用原始 SQL
- raw SQL 绕过 repo 的根因和系统性修复方案见独立 spec `repo-transaction-support.md`
- 本 spec 新增的去重查询在同一事务内使用 raw SQL，与已有模式一致
- 若 `repo-transaction-support.md` 先实施，本 spec 的去重查询可直接用 repo 方法 + client 参数

**问题 4 — prompt 无 goal 去重指令**：
- wiki-compile-prompt.ts 中 goal_sync 的 JSON 示例仅展示 create/update 格式
- 没有指导 AI "检查已有 goal，不重复创建"
- 没有指导 AI "将 goal 挂到对应的 topic page 下"

## 架构断裂点清单（知识图谱）

> 基于 `graphify-out/graph.json` 的联通性分析（2026-04-13）

| 起点 | 终点 | 断裂原因 | 本次处理 |
|------|------|----------|----------|
| `wiki-compiler.ts` (community 2) | `todo.ts` (community 1) | goal_sync 用 raw SQL 绕过 todoRepo | 本 spec 新增去重也用 raw SQL；整体改造见 `repo-transaction-support.md` |
| `goal.ts` (community 20) | `wiki-page.ts` (community 24) | `updateWikiPageRef()` 用 raw SQL | 见 `repo-transaction-support.md` |
| `wiki-compiler.ts` (community 2) | `wiki-page-record.ts` (community 28) | 读用 repo，写全用 raw SQL | 见 `repo-transaction-support.md` |
| `wiki-compile-prompt.ts` (community 2) | `todo.ts` (community 1) | prompt 不含已有 goals 上下文 | **本 spec 修复** — existingGoals 注入 prompt |
| allPageIndex | goal page 区分 | PageIndex 无 page_type 字段 | **本 spec 修复** — 新增 page_type |

## 1. 传入已有 Goals 上下文

### 场景 1.1: allPageIndex 包含 page_type 信息
```
假设 (Given)  wiki-compiler 加载 allPageIndex 用于 AI prompt
当   (When)   构建 PageIndex 和 user message
那么 (Then)   PageIndex 接口新增 page_type 字段
并且 (And)    allPageIndex 表格新增 "类型" 列，显示 topic/goal
并且 (And)    AI 能区分哪些 page 是目标、哪些是主题
```

### 场景 1.2: 传入已有 goal todos 列表
```
假设 (Given)  用户已有 3 个 level>=1 的 goal todos
当   (When)   构建编译 prompt 的 user message
那么 (Then)   新增 "已有目标" 段落，列出 goal_id + title + status + wiki_page_id
并且 (And)    AI 在决定是否 goal_sync.create 时可以参照已有 goals
```

### 场景 1.3: CompilePromptInput 扩展
```
假设 (Given)  CompilePromptInput 接口当前不包含 goals 信息
当   (When)   扩展接口
那么 (Then)   新增 existingGoals 字段：Array<{ id, title, status, wiki_page_id }>
并且 (And)    wiki-compiler 在加载上下文时查询 findActiveGoalsByUser
```

## 2. Prompt 增加去重指令

### 场景 2.1: 语义去重指令
```
假设 (Given)  wiki-compile-prompt.ts 中无 goal 去重指令
当   (When)   修改 prompt
那么 (Then)   在 goal_sync 相关说明中增加：
             "创建 goal 前，必须检查上方「已有目标」列表。如果已有 goal 的标题与新 goal 语义一致（如'学英语'和'英语学习'），使用 update 而非 create。"
并且 (And)    增加反例："❌ 已有'学英语'时又 create '英语学习' → 应 update 已有 goal"
```

### 场景 2.2: goal_sync JSON 示例更新（wiki-compile-prompt.ts L192-198）
```
假设 (Given)  prompt 中 goal_sync JSON 示例只有 create，且无 parent_page_id 字段
当   (When)   修改 prompt
那么 (Then)   更新 create 示例，新增 parent_page_id 字段：
             { "action": "create", "title": "目标标题", "status": "active",
               "wiki_page_id": "UUID（已有 goal page 则填，否则省略）",
               "parent_page_id": "UUID（挂载到哪个 topic page 下）" }
并且 (And)    补充 update 示例：
             { "action": "update", "goal_id": "UUID", "status": "progressing" }
并且 (And)    说明 update 使用场景：goal 状态变化、进度更新
并且 (And)    说明 parent_page_id：应填写该 goal 最相关的 topic page 的 UUID
```

## 3. 目标挂载到 topic page 下

### 场景 3.1: goal page 创建时挂载 parent
```
假设 (Given)  wiki-compiler 创建 goal page 时硬编码 parent_id=NULL, level=3
当   (When)   AI 的 goal_sync.create 指令中包含 parent_page_id（关联的 topic page UUID）
那么 (Then)   goal page 的 parent_id 设为 parent_page_id
并且 (And)    goal page 的 level 设为 parent page 的 level - 1（最小为 1）
说明 (Note)   parent_page_id 是新增字段，与 wiki_page_id 语义不同：
             - wiki_page_id = 已有的 goal page ID（有则复用，无则新建）— 保持原有语义
             - parent_page_id = 目标应挂载到哪个 topic page 下 — 新增
```

### 场景 3.2: goal page 无 parent → 仍为 L3 顶层
```
假设 (Given)  AI 的 goal_sync.create 中 parent_page_id 为空或无效
当   (When)   创建 goal page
那么 (Then)   parent_id 保持 NULL，level 保持 3（向后兼容）
```

### 场景 3.3: prompt 引导 AI 关联 goal 到已有 page
```
假设 (Given)  用户在 "工作" page 的 record 中提到 "Q2 要达成300万业绩"
当   (When)   AI 决定 goal_sync.create
那么 (Then)   prompt 指导 AI 在 parent_page_id 中填入 "工作" page 的 UUID
并且 (And)    goal page "Q2 业绩目标" 成为 "工作" page 的子 page
并且 (And)    wiki_page_id 留空（因为是新 goal，没有已有 goal page）
```

## 4. DB 层去重防护（兜底）

### 场景 4.1: 创建 goal 前查重
```
假设 (Given)  AI 返回 goal_sync.create title="学英语"
并且 (And)    DB 中已有 todo: text="学英语", level=1, user_id=同一用户
当   (When)   wiki-compiler executeInstructions 处理 goal_sync.create
那么 (Then)   先查询 SELECT id FROM todo WHERE user_id=$1 AND level>=1 AND TRIM(text)=TRIM($2)
并且 (And)    如果已存在 → 跳过创建，log warn "goal_sync create skipped: duplicate title"
并且 (And)    如果不存在 → 正常创建
说明 (Note)   TRIM 防止标点/空格差异导致重复（如 "学英语" vs "学英语 "）；语义去重由 AI prompt 处理
```

### 场景 4.2: goal page 标题查重
```
假设 (Given)  AI 返回 goal_sync.create 要新建 goal page
当   (When)   wiki-compiler 准备 INSERT INTO wiki_page
那么 (Then)   先查询 SELECT id FROM wiki_page WHERE user_id=$1 AND page_type='goal' AND TRIM(title)=TRIM($2) AND status='active'
并且 (And)    如果已存在 → 复用已有 page id，不创建新 page
```

## 验收行为（E2E 锚点）

> goal_sync 由 wiki-compiler 异步触发，无法 Playwright 自动化。以单元测试 + 手动验证为主。

### 行为 1: 不重复创建目标
1. 用户录音："我要学英语，每天背50个单词"
2. wiki-compiler 编译，创建 goal "学英语"
3. 用户再次录音："英语学习计划要调整一下"
4. wiki-compiler 编译，不创建新 goal，而是更新已有 "学英语" 的 page content

### 行为 2: 目标挂载到主题下
1. 用户已有 topic page "工作"
2. 用户录音："今年目标是把业绩做到300万"
3. wiki-compiler 创建 goal page "年度业绩300万"，显示在侧边栏 "工作" 下方（子页面）

### 行为 3: 待办项目页目标不重复
1. 在待办项目页查看
2. 不出现同语义的重复目标卡片

## 边界条件
- [ ] 已有 goals 数量为 0 → AI 正常 create，不受影响
- [ ] 已有 goals 数量超过 20 → 截断 top 20（按 updated_at DESC），避免 prompt 过长
- [ ] goal_sync.create 的 wiki_page_id 指向的 page 不存在 → 现有 UUID 校验逻辑已处理，置为 null，goal page 创建为 L3 顶层
- [ ] goal_sync.update 的 goal_id 不存在 → 现有逻辑已 skip
- [ ] 精确文本匹配去重 vs 语义相似但文本不同 → 精确匹配是 DB 兜底，语义去重靠 AI prompt
- [ ] goal page parent_id 指向的 page 在后续被删除/归档 → goal page 成为孤儿，不影响功能，侧边栏按 parent_id=NULL 显示为顶层

## 接口约定

### PageIndex 扩展
```typescript
interface PageIndex {
  id: string;
  title: string;
  summary: string | null;
  level: number;
  domain: string | null;
  page_type: "topic" | "goal";  // 新增
}
```

### CompilePromptInput 扩展
```typescript
interface CompilePromptInput {
  // ... 现有字段 ...
  existingGoals: Array<{
    id: string;       // todo.id（goal_sync.update 需要）
    title: string;
    status: string;
    wiki_page_id: string | null;
  }>;
}
```

### goal_sync schema 扩展（CompileInstructions）
```typescript
goal_sync: Array<{
  action: "create" | "update";
  goal_id?: string;        // update 时必填：已有 goal 的 todo.id
  title?: string;
  status?: string;
  wiki_page_id?: string;   // 已有 goal page ID（有则复用，无则新建）— 原有字段
  parent_page_id?: string; // 新增：goal page 挂载到哪个 topic page 下
  progress?: number;
}>;
```

### goal_sync create 改造（wiki-compiler.ts executeInstructions）
```typescript
// 旧：硬编码 level=3, parent_id=NULL
INSERT INTO wiki_page (..., parent_id, level, ...) VALUES (..., NULL, 3, ...)

// 新：从 parent_page_id 推导 parent_id 和 level
const parentPageId = gs.parent_page_id ?? null;  // AI 指定的 topic page
// 校验 parentPageId 存在性
const level = parentPageId
  ? Math.max(1, (await getPageLevel(parentPageId)) - 1)
  : 3;
INSERT INTO wiki_page (..., parent_id, level, ...) VALUES (..., parentPageId, level, ...)
```

## 实施阶段

- [ ] Phase 1: wiki-compile-prompt.ts — PageIndex 加 page_type + user message 加已有 goals 段落 + goal 去重/挂载指令 + **更新 L192-198 goal_sync JSON 示例（新增 parent_page_id + update 示例）**
- [ ] Phase 2: wiki-compiler.ts — CompilePromptInput 扩展 + 加载 existingGoals + PageIndex 加 page_type
- [ ] Phase 3: wiki-compiler.ts executeInstructions — goal page 挂载 parent + DB 兜底去重
- [ ] Phase 4: 单元测试 + 回归

## 备注
- 本次不改动前端显示逻辑，侧边栏已支持层级展示（parent/child tree）
- goal_sync.update 的 goal_id 需要 AI 从新增的"已有目标"列表中获取，而非编造
- 语义去重完全依赖 AI prompt 质量，DB 兜底只做精确文本匹配，不做 embedding 相似度
- todo-projector 已在 Phase 14.2 废弃 goal 生成（仅创建 level=0 action），不需要改动

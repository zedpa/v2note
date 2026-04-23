---
id: "fix-goal-quality"
title: "Fix: goal_sync 目标重复生成 + 缺少层级组织"
status: completed
backport: goal-lifecycle.md#场景 17.1
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

## 1. 去重

### 场景 1.1: 用户相似表达不产生重复目标
```
假设 (Given)  用户之前的录音已形成侧边栏目标"学英语"
当   (When)   用户再次录音表达相似意愿，如"英语学习计划要调整一下"
那么 (Then)   侧边栏目标列表中仍只有一个"学英语"目标
并且 (And)    用户看到的目标内容被更新而不是新增一个
```

### 场景 1.2: 待办项目页不出现同语义重复卡片
```
假设 (Given)  用户关于"学英语"的多次相近表达
当   (When)   用户打开待办项目页
那么 (Then)   页面不出现多张同语义的重复目标卡片
```

## 2. 目标挂载到主题之下

### 场景 2.1: 用户的新目标挂到已有主题之下
```
假设 (Given)  侧边栏已有主题页"工作"
当   (When)   用户录音"今年要把业绩做到300万"
那么 (Then)   侧边栏"工作"节点下出现子页"年度业绩300万"
并且 (And)    目标不再以顶层节点平铺显示
```

### 场景 2.2: 无匹配主题时目标仍可正常创建
```
假设 (Given)  用户没有相关主题页
当   (When)   用户录音表达一个全新方向的目标
那么 (Then)   目标作为顶层节点出现在侧边栏
并且 (And)    原有目标不受影响
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

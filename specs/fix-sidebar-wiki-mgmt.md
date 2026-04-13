---
id: "fix-sidebar-wiki-mgmt"
title: "Fix: 侧边栏 Wiki Page 统一 — 废弃 domain 工具 + CRUD UI + Agent 工具"
status: active
domain: ui
risk: high
dependencies: ["cognitive-wiki.md", "app-mobile-nav.md", "tool-ecosystem-enhance.md"]
superseded_by: null
created: 2026-04-12
updated: 2026-04-12
---

# Fix: 侧边栏 Wiki Page 统一

## 概述

Wiki page 的 title 和 content 已经分离生命周期：
- **Title 快速创建**：`lightweight-classifier.ts` + `at-route-parser.ts` 在 digest 后秒级完成
- **Content 慢编译**：`wiki-compiler.ts` 攒够 token 后批量编译

但旧的 `record.domain` 体系（manage_folder / move_record / list_folders 三个工具）仍在并行运行，
操作 `record.domain` 字段而非 `wiki_page_record` 关联。导致：
- 侧边栏 wiki page recordCount=0（查的是 wiki_page_record），但 record.domain 有值
- 两套工具并存，AI 和用户困惑用哪套
- 数据不一致（"工作事务" wiki page 空，domain "工作" 有内容）

**本次修复**：以 wiki_page 为唯一组织结构，废弃 domain 工具，新建 manage_wiki_page 工具 + 侧边栏 CRUD UI。

---

## 1. 废弃 domain 工具，替换为 wiki_page 工具

### 场景 1.1: manage_wiki_page 替代 manage_folder
```
假设 (Given)  用户对 AI 说"新建一个旅行主题"
当   (When)   AI 调用 manage_wiki_page(action="create", title="旅行")
那么 (Then)   创建 wiki_page（level=3, created_by='user', content=''）
并且 (And)    返回 { success: true, page: { id, title, level } }
```

### 场景 1.2: rename 替代 manage_folder(rename)
```
假设 (Given)  存在 wiki_page title="工作事务"
当   (When)   AI 调用 manage_wiki_page(action="rename", page_id=id, new_title="工作")
那么 (Then)   wiki_page.title 更新为"工作"
并且 (And)    返回 { success: true, old_title, new_title }
```

### 场景 1.3: delete 替代 manage_folder(delete) — 解散主题
```
假设 (Given)  存在 wiki_page（关联 N 条 record），无子页面
当   (When)   AI 调用 manage_wiki_page(action="delete", page_id=id)
那么 (Then)   wiki_page.status 设为 'archived'
并且 (And)    wiki_page_record 中该 page 的所有关联被删除
并且 (And)    关联的 record 的 compile_status 清除为 NULL（回到收件箱，不再 pending）
并且 (And)    如果是 goal page，关联 todo.wiki_page_id 清空（todo 保留）
并且 (And)    返回 { success: true, unlinked_records: N }
```

### 场景 1.3b: delete 有子页面的 page — 子页面提升
```
假设 (Given)  存在 wiki_page P（有子页面 C1, C2）
当   (When)   AI 调用 manage_wiki_page(action="delete", page_id=P.id)
那么 (Then)   P.status 设为 'archived'
并且 (And)    P 自身的 wiki_page_record 关联被删除，record compile_status 清除为 NULL
并且 (And)    子页面 C1, C2 提升为顶层（parent_id=NULL, level=3）
并且 (And)    子页面的 record 关联不变（子页面没被删，只是升级了）
```

### 场景 1.4: merge 替代 manage_folder(merge)
```
假设 (Given)  存在 wiki_page A 和 B（B 必须是 status='active'）
当   (When)   AI 调用 manage_wiki_page(action="merge", source_id=A.id, target_id=B.id)
那么 (Then)   A 的所有 wiki_page_record 转移到 B（ON CONFLICT DO NOTHING）
并且 (And)    如果 A 有 goal todo，todo.wiki_page_id 更新为 B.id
并且 (And)    A.status='merged', A.merged_into=B.id
并且 (And)    返回 { success: true, transferred_records: N }
```

### 场景 1.5: move_record 替代旧 move_record — 移动单条记录到 wiki page
```
假设 (Given)  存在 record R 和 wiki_page P
当   (When)   AI 调用 manage_wiki_page(action="move_record", record_id=R.id, page_id=P.id)
那么 (Then)   删除 R 的所有旧 wiki_page_record 关联（一对一语义，移动而非多挂）
并且 (And)    创建新的 wiki_page_record(P.id, R.id)
并且 (And)    返回 { success: true, old_pages: [...], new_page: P.title }
```
> 注：wiki_page_record 是 M:N 表，但 move_record 按"移动"语义实现（清除旧关联再建新关联），
> 与旧 move_record 设置 record.domain 的行为一致。如果将来需要"一条记录挂多个主题"，
> 可以新增 link_record action（仅追加关联不清除旧的）。

### 场景 1.6: list — 替代 list_folders
```
假设 (Given)  用户问"我有哪些主题"
当   (When)   AI 调用 manage_wiki_page(action="list")
那么 (Then)   返回所有 active wiki page 的树形结构（title, level, recordCount, childCount）
并且 (And)    返回未归类记录数（inbox count）
```

### 场景 1.7: create 子主题（L2）
```
假设 (Given)  存在 L3 wiki_page "工作"
当   (When)   AI 调用 manage_wiki_page(action="create", title="采购", parent_id=工作.id)
那么 (Then)   创建 L2 wiki_page（parent_id=工作.id, level=2）
并且 (And)    返回 { success: true, page: { id, title, level, parentId } }
```

## 2. DELETE API 路由

### 场景 2.1: DELETE /api/v1/wiki/pages/:id
```
假设 (Given)  wiki page 存在且属于当前用户
当   (When)   客户端发送 DELETE 请求
那么 (Then)   wiki_page.status 设为 'archived'
并且 (And)    wiki_page_record 中该 page 的所有关联被删除
并且 (And)    被解除关联的 record 的 compile_status 清除为 NULL（回到收件箱）
并且 (And)    子页面提升为顶层（parent_id=NULL, level=3）
并且 (And)    goal page 的关联 todo.wiki_page_id 清空
并且 (And)    返回 { ok: true, unlinked_records: N }
```

## 3. 侧边栏 CRUD UI

### 场景 3.1: 新建主题页
```
假设 (Given)  用户在侧边栏
当   (When)   用户点击主题区域的"+"按钮
那么 (Then)   弹出输入框，输入主题名称
并且 (And)    支持选择类型：主题(topic) 或 目标(goal)
并且 (And)    调用 POST /api/v1/wiki/pages
并且 (And)    成功后 refetch sidebar 数据，新 page 出现在列表中
```

### 场景 3.2: 重命名主题页
```
假设 (Given)  侧边栏有一个 wiki page
当   (When)   用户长按该 page
那么 (Then)   出现上下文菜单：重命名 / 删除
当   (When)   用户选择"重命名"
那么 (Then)   弹出输入框，预填当前标题
并且 (And)    确认后调用 PATCH /api/v1/wiki/pages/:id
并且 (And)    refetch sidebar 数据
```

### 场景 3.3: 删除（归档）主题页
```
假设 (Given)  侧边栏有一个 wiki page（关联 N 条记录）
当   (When)   用户长按 → 选择"删除"
那么 (Then)   弹出确认对话框："删除「X」？其中 N 条记录将变为未归类"
并且 (And)    确认后调用 DELETE /api/v1/wiki/pages/:id
并且 (And)    refetch sidebar 数据，page 消失
```

### 场景 3.4: 空状态
```
假设 (Given)  用户没有任何 wiki page
当   (When)   打开侧边栏
那么 (Then)   主题区域显示空状态提示："录几段话，AI 会自动整理主题"
并且 (And)    仍可通过"+"手动创建
```

## 4. 旧 domain 工具清理

### 场景 4.1: 删除旧工具文件
```
假设 (Given)  manage_wiki_page 工具已上线
当   (When)   执行清理
那么 (Then)   删除以下文件：
              - gateway/src/tools/definitions/manage-folder.ts
              - gateway/src/tools/definitions/move-record.ts
              - gateway/src/tools/definitions/list-folders.ts
              - gateway/src/tools/definitions/folder-tools.test.ts
并且 (And)    从 index.ts 移除导入和注册
并且 (And)    从 provider.ts TOOL_LABELS 移除 manage_folder/move_record/list_folders
并且 (And)    从 tool-call-card.tsx TOOL_DISPLAY_MAP 移除对应条目
```

### 场景 4.2: 更新 command-full-prompt + command-full-mode
```
假设 (Given)  command-full-prompt.ts 引用了 manage_folder/move_record
并且 (And)    command-full-mode.ts 通过 notebookRepo 获取 folders 传给 prompt
当   (When)   执行清理
那么 (Then)   command-full-prompt.ts：文件夹操作说明替换为 wiki page 操作说明，更新 action_type 枚举和示例
并且 (And)    command-full-mode.ts：改为通过 wikiPageRepo.findAllActive 获取 pages 传给 prompt
```

### 场景 4.3: 一次性数据迁移 — domain 孤儿记录补链
```
假设 (Given)  存在 record.domain 非空但无 wiki_page_record 关联的记录
当   (When)   执行迁移脚本（SQL migration）
那么 (Then)   对每条孤儿记录：
              1. 提取 domain 的一级前缀作为匹配 key（"工作/采购" → "工作"）
              2. 按优先级匹配 active wiki_page：
                 a. wp.domain 精确匹配前缀（classifier 创建时设的 domain 字段）
                 b. wp.title 精确匹配前缀
                 c. wp.title 以前缀开头（如 "工作" 匹配 "工作事务"）
              3. DISTINCT ON (record_id) + ORDER BY 优先级确保每条记录只链一个 page
              4. 如果全部策略都未匹配 → 创建新 wiki_page（title=前缀, domain=前缀, level=3）→ 链接
并且 (And)    所有 INSERT 使用 ON CONFLICT DO NOTHING 保证幂等
```

## 验收行为（E2E 锚点）

### 行为 1: 侧边栏新建主题
1. 用户打开侧边栏
2. 点击主题区域"+"
3. 输入"旅行"，选择类型"主题"
4. 确认创建
5. 侧边栏出现"旅行"主题

### 行为 2: 侧边栏重命名主题
1. 用户长按某主题
2. 选择"重命名"
3. 修改标题
4. 侧边栏显示新名称

### 行为 3: 侧边栏删除主题
1. 用户长按某主题
2. 选择"删除"
3. 确认对话框显示影响范围
4. 确认后主题消失

### 行为 4: AI 管理主题
1. 用户说"把工作事务重命名为工作"
2. AI 调用 manage_wiki_page(action="rename", ...)
3. 返回成功

### 行为 5: AI 移动记录
1. 用户说"把这条记录移到学习主题"
2. AI 调用 manage_wiki_page(action="move_record", ...)
3. 记录从旧主题移到新主题

## 边界条件
- [ ] 创建时同 parent 下标题重复 → 报错"标题已存在"
- [ ] 重命名为同 parent 下已存在的标题 → 报错"标题已存在"
- [ ] 删除有子页面的 page → 子页面提升为顶层（parent_id=NULL, level=3）
- [ ] 删除 goal page → 关联 todo.wiki_page_id 清空，todo 保留
- [ ] merge target 必须是 status='active' → 否则报错
- [ ] merge 时 record 已在 target → ON CONFLICT DO NOTHING，不重复
- [ ] move_record 到不存在的 page → 报错 "Page not found"
- [ ] move_record page_id=null → 解除所有关联（记录变为未归类）
- [ ] 空标题 → 拒绝
- [ ] list 返回空 → 返回空数组 + inbox count

## 接口约定

### manage_wiki_page 工具 schema
```typescript
{
  action: "create" | "rename" | "delete" | "merge" | "move_record" | "list",
  // create
  title?: string,                  // create 时必填
  page_type?: "topic" | "goal",   // create 时可选，默认 topic
  parent_id?: string,             // create 时可选，有值则创建 L2
  // rename
  page_id?: string,               // rename/delete/move_record 时必填
  new_title?: string,             // rename 时必填
  // merge
  source_id?: string,             // merge 时必填
  target_id?: string,             // merge 时必填
  // move_record
  record_id?: string,             // move_record 时必填
}
autonomy: "confirm"
```

### DELETE /api/v1/wiki/pages/:id
```
Request:  DELETE /api/v1/wiki/pages/:id
Response: { ok: true, unlinked_records: number }
Error:    404 if not found, 401 if unauthorized
```

## 影响范围

### 要删除的文件
- `gateway/src/tools/definitions/manage-folder.ts`
- `gateway/src/tools/definitions/move-record.ts`
- `gateway/src/tools/definitions/list-folders.ts`
- `gateway/src/tools/definitions/folder-tools.test.ts`

### 要修改的文件
| 文件 | 改动 |
|------|------|
| `gateway/src/tools/definitions/index.ts` | 移除 3 个旧工具导入，添加 manage_wiki_page |
| `gateway/src/ai/provider.ts` | TOOL_LABELS 替换 3 个旧条目为 manage_wiki_page |
| `gateway/src/routes/wiki.ts` | 添加 DELETE 路由 |
| `gateway/src/handlers/command-full-prompt.ts` | 文件夹操作→主题操作 |
| `gateway/src/handlers/command-full-prompt.test.ts` | 同步更新测试 |
| `gateway/src/handlers/command-full-mode.ts` | folders 数据源改为 wikiPageRepo |
| `gateway/src/handlers/command-full-mode.test.ts` | 同步更新测试 |
| `gateway/src/db/repositories/wiki-page-record.ts` | 新增 unlinkAllByPage(pageId) 方法 |
| `features/chat/components/tool-call-card.tsx` | TOOL_DISPLAY_MAP 替换 |
| `features/chat/hooks/use-chat.ts` | 移除旧工具引用（如有） |
| `features/recording/components/fab.tsx` | 移除旧工具引用（如有） |
| `features/sidebar/components/sidebar-drawer.tsx` | 添加 CRUD UI（+、长按菜单） |
| `app/page.tsx` | sidebar mutation 后 refetch + 透传 CRUD 回调 |

### 不动的文件
- `gateway/src/db/repositories/record.ts` — domain 相关方法保留（历史数据可能还需读取）
- `gateway/src/routes/records.ts` — `/api/v1/records/domains` 保留（向后兼容）
- `gateway/src/cognitive/lightweight-classifier.ts` — 已经在用 wiki_page，不变
- `gateway/src/cognitive/at-route-parser.ts` — 已经在用 wiki_page，不变

## 5. 侧边栏显示优化 — Topic/Goal 分区 + 空壳治理

### 场景 5.1: Topic 和 Goal 视觉分区
```
假设 (Given)  侧边栏有 topic page 和 goal page 混排显示
当   (When)   加载侧边栏
那么 (Then)   分为两个区域展示：
             「主题」区 — 只显示 page_type='topic' 的页面（含其子页面树）
             「目标」区 — 只显示 page_type='goal' 且 parent_id=NULL 的独立 goal page
并且 (And)    挂载到 topic 下的 goal page 显示在其父 topic 的子树中（不在「目标」区重复）
并且 (And)    「目标」区标题旁显示 goal 数量 badge
并且 (And)    「目标」区默认折叠（如果 goal 都已挂载到 topic 下则隐藏此区）
```

### 场景 5.2: 空 page 视觉弱化
```
假设 (Given)  某 wiki page 的 recordCount=0
当   (When)   显示在侧边栏
那么 (Then)   标题以浅灰色展示（opacity: 0.5）
并且 (And)    不显示 recordCount badge（避免显示 "0"）
并且 (And)    长按菜单新增「归档」选项（直接归档，不需确认对话框）
```

### 场景 5.3: Goal page 在 topic 子树中的显示
```
假设 (Given)  goal page "Q2 业绩目标" 的 parent_id 指向 topic page "工作"
当   (When)   用户展开"工作"的子页面
那么 (Then)   "Q2 业绩目标" 显示在子页面列表中，带 ⭐ 图标标记
并且 (And)    显示该 goal 的 status（active/progressing/completed）
并且 (And)    点击跳转到 goal 详情（与待办项目页相同）
```

### 场景 5.4: 侧边栏排序优化
```
假设 (Given)  侧边栏有多个 topic page
当   (When)   排序
那么 (Then)   有 record 关联的 page 排在前面（recordCount DESC）
并且 (And)    同 recordCount 时按 updatedAt DESC
并且 (And)    空 page（recordCount=0）沉底显示
说明 (Note)   当前排序是 level DESC + updatedAt DESC，
             改为 recordCount DESC + updatedAt DESC 更符合"活跃度"直觉
```

## 验收行为（E2E 锚点）— Phase 5 追加

### 行为 6: Topic/Goal 分区
1. 用户有 topic page "工作" 和独立 goal page "学英语"
2. 打开侧边栏
3. "工作" 显示在「主题」区
4. "学英语" 显示在「目标」区（折叠状态）

### 行为 7: Goal 挂载到 topic 后的侧边栏变化
1. AI 将 goal page "Q2 业绩" 挂载到 topic "工作" 下（parent_id 设置）
2. 刷新侧边栏
3. "Q2 业绩" 显示在"工作"的子页面中（带 ⭐）
4. 「目标」区不再显示 "Q2 业绩"

## Implementation Phases
- [x] Phase 1: manage_wiki_page 工具 + DELETE API 路由（后端核心）
- [x] Phase 2: 删除旧 domain 工具 + 更新引用（后端清理）
- [x] Phase 3: 侧边栏 CRUD UI（前端）
- [x] Phase 4: 一次性数据迁移脚本（domain 孤儿记录补链）— 065_domain_orphan_backfill.sql
- [ ] Phase 5: 侧边栏显示优化 — Topic/Goal 分区 + 排序 + 空壳弱化（场景 5.1-5.4）

## 备注
- 删除操作使用 soft delete（status='archived'），符合 CLAUDE.md 约束
- manage_wiki_page 整体 `autonomy: "confirm"`（与原 manage_folder 一致）
- 工具 handler 直接调用 repository，不经过 REST API（与所有现有工具一致）
- 侧边栏 UI 变更后 refetch `/api/v1/wiki/sidebar`（由父组件 page.tsx 控制）
- `record.domain` 字段暂不删除（历史兼容），但不再有工具写入它
- Phase 5 依赖 `fix-goal-wiki-data-cleanup.md` 清洗数据后效果最佳（否则垃圾 goal 仍会显示在「目标」区）
- Phase 5 的 Topic/Goal 分区是**过渡方案**：当前侧边栏尚未接入 Cluster 活跃度分区
  （topic-lifecycle.md 场景 1 的后端 GET /topics 已完成，但侧边栏 UI 仍用 wiki page 树）。
  本 Phase 按 page_type 做基础分区，当 topic-lifecycle 侧边栏 UI 上线后，
  本 Phase 的分区逻辑会被 Cluster 活跃度分区替代（活跃方向/沉默区模式）。
  届时 page_type 仍有用——在 Cluster 分区内部区分 topic 子页面和 goal 子页面

## gene_search
### 功能描述
全文搜索功能。通过 /search 命令或 Header 搜索入口打开。

### 详细功能
- 功能1：关键词搜索笔记标题和内容（ILIKE匹配transcript.text、summary.title、summary.short_summary）
- 功能2：搜索结果包含完整summary和tags数据（与列表API一致的batch load模式）
- 功能3：点击结果跳转到笔记详情

### 路由注意事项
- Gateway路由注册顺序：`/api/v1/records/search` 必须在 `/api/v1/records/:id` 之前注册（`gateway/src/routes/records.ts`），否则 "search" 会被当作 `:id` 参数匹配导致搜索失效
- 搜索路由必须batch load summaries和tags（通过summaryRepo、tagRepo），不能只返回record原始字段，否则前端无法显示标题和内容

### 关键文件
- `features/search/components/search-view.tsx` — 搜索UI，使用NoteCard展示结果
- `features/search/hooks/use-search.ts` — 搜索hook，映射API结果为NoteItem（含tags字段映射）
- `gateway/src/routes/records.ts` — 搜索路由（注意注册顺序 + summary/tags batch load）
- `gateway/src/db/repositories/record.ts` — search()方法（SELECT DISTINCT r.*）

### 测试描述
- 输入：搜索关键词 "会议"
- 输出：显示包含"会议"的笔记列表，每条结果显示标题、摘要、标签

## gene_timeline_card
### 功能描述
日记卡片折叠/展开设计。元数据压缩到第一行，突出内容区。点击展开显示转录原文+待办事项。长按多选+批量删除。

### 详细功能
- 功能1：元数据单行——时间 · 录音时长(Mic图标) 或 文字(Type图标) · 位置(MapPin) · 标签，用 `·` 分隔
- 功能2：内容区——折叠时 `line-clamp-4`，展开时无截断，显示 `short_summary || title`
- 功能3：音频播放器——有 `audio_path` 时显示 MiniAudioPlayer（选择模式下隐藏）
- 功能4：折叠/展开切换——点击卡片 toggle `expanded` state
- 功能5：展开按需加载——`useNoteDetail(expanded ? note.id : null)` 条件性 fetch，缓存已加载数据
- 功能6：展开区域——转录原文（非文字笔记时显示 `detail.transcript.text`）+ 待办事项列表（checkbox + 文本，完成态划线）
- 功能7：Loading 状态——展开加载中显示 spinner + "加载中..."
- 功能8：500ms 长按触发选择模式
- 功能9：选择模式下点击切换选中状态（不触发展开）
- 功能10：选中卡片高亮 ring-2 + CheckCircle 图标
- 功能11：底部固定工具栏（已选计数、取消、删除）
- 功能12：批量删除调用 useNotes().deleteNotes()
- 功能13：Processing 骨架屏——未完成处理且无内容时显示 shimmer 动画

### 性能优化（2026-03）
- **Tab 保持挂载**：日记/待办 tab 切换用 CSS `hidden` 隐藏而非条件渲染卸载，切回瞬间显示（`app/page.tsx`）
- **后端批量查询**：`GET /api/v1/records` 从 N+1 查询（200+ 次）改为 3 次批量查询（`summaryRepo.findByRecordIds` + `transcriptRepo.findByRecordIds` + `tagRepo.findByRecordIds`）
- **缓存优先显示**：`useNotes` 首次渲染时 `getCachedNotes()` 有数据立即展示并跳过 loading 态，后台静默 `fetchNotes(true)` 刷新

### 关键文件
- `features/notes/components/notes-timeline.tsx` — NotesTimeline + TimelineCard 组件
- `features/notes/hooks/use-note-detail.ts` — 展开时按需加载详情（支持 null 跳过）
- `features/notes/hooks/use-notes.ts` — 列表数据 + 缓存优先 + deleteNotes 方法
- `features/notes/components/mini-audio-player.tsx` — 音频播放器
- `features/workspace/lib/cache.ts` — 本地缓存（30min TTL）
- `gateway/src/routes/records.ts` — Records REST API（批量关联查询）
- `gateway/src/db/repositories/tag.ts` — `findByRecordIds()` 批量查询

### 测试描述
- 输入：浏览时间线
- 输出：卡片第一行显示 `时间 · 🎙时长 · 标签`，内容区突出，短内容不再有大量空白
- 输入：点击卡片
- 输出：展开显示转录原文和待办事项，带 loading 动画
- 输入：再次点击已展开卡片
- 输出：折叠回原状
- 输入：长按卡片 → 选中多条 → 点击删除
- 输出：进入选择模式 → 显示选中计数 → 删除后退出选择模式
- 输入：选择模式下点击卡片
- 输出：切换选中状态（不触发展开）

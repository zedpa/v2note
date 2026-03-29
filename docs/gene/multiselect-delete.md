## gene_multiselect_delete
### 功能描述
笔记时间线长按多选与批量删除。长按卡片进入选择模式，底部工具栏提供删除操作。笔记卡片显示语音/文字类型标识。

### 详细功能
- 功能1：500ms 长按触发选择模式
- 功能2：选择模式下点击切换选中状态
- 功能3：选中卡片高亮 + CheckCircle 图标
- 功能4：底部固定工具栏（已选计数、取消、删除）
- 功能5：批量删除调用 useNotes().deleteNotes()
- 功能6：选择模式下隐藏音频播放器避免误触
- 功能7：语音/文字类型标识——根据 `duration_seconds` 判断，语音笔记显示 Mic图标+时长，文字笔记显示 Type图标+"文字"

### 外键约束修复（2026-03）
删除 record 时 `strike.source_id` 外键（017_cognitive_layer.sql）默认 RESTRICT 阻止删除。
- Migration `030_strike_source_cascade.sql`：改为 `ON DELETE SET NULL`
- Strike 保留（认知数据有独立价值），仅 source_id 置空

### 关键文件
- `features/notes/components/notes-timeline.tsx` — 时间线组件（选择逻辑 + 工具栏 + 类型标识）
- `features/notes/hooks/use-notes.ts` — deleteNotes 方法
- `supabase/migrations/030_strike_source_cascade.sql` — strike.source_id ON DELETE SET NULL

### 测试描述
- 输入：长按日记卡片 → 选中多条 → 点击删除
- 输出：进入选择模式 → 显示选中计数 → 删除后退出选择模式
- 输入：查看时间线
- 输出：语音笔记显示麦克风图标+录音时长，文字笔记显示文字图标

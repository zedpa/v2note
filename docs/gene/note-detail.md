## gene_note_detail
### 功能描述
笔记详情与编辑页面。展示录音转写、摘要、标签、待办等完整信息。支持单条删除。无标题显示/编辑，无灵感区块（已废弃）。

### 详细功能
- 功能1：全屏 overlay 展示笔记详情
- 功能2：音频回放（迷你播放器）
- 功能3：标签编辑（添加/删除）
- 功能4：待办事项管理
- 功能5：文本编辑器（markdown）
- 功能6：单条删除按钮（header Trash2图标，confirm确认后调用 `api.delete`）
- 功能7：文字笔记智能显示——`duration_seconds==null||0` 判定为文字笔记，隐藏"转录原文"区块，"AI转写"标签改为"笔记内容"
- 功能8：无标题区块（v2026.03.06c移除）
- 功能9：无灵感区块（v2026.03.06c移除，灵感功能已废弃）

### 关键文件
- `features/notes/components/note-detail.tsx`
- `features/notes/components/note-card.tsx`
- `features/notes/components/mini-audio-player.tsx`
- `features/notes/components/text-editor.tsx`
- `features/notes/hooks/use-note-detail.ts`

### 测试描述
- 输入：点击笔记卡片
- 输出：显示完整笔记详情，可编辑标签和待办
- 输入：点击详情页删除按钮 → 确认
- 输出：笔记删除，返回时间线
- 输入：打开文字笔记详情
- 输出：不显示"转录原文"区块，标签为"笔记内容"
